  // ======================== Base58 & Bech32m & EIP-55 ========================

  const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const BASE58_MAP = (() => {
    const m = new Int16Array(128).fill(-1);
    for (let i = 0; i < BASE58_ALPHABET.length; i++) {
      m[BASE58_ALPHABET.charCodeAt(i)] = i;
    }
    return m;
  })();

  function base58Encode(bytes) {
    const arr = toUint8Array(bytes);
    if (arr.length === 0) return '';
    let zeros = 0;
    while (zeros < arr.length && arr[zeros] === 0) zeros++;
    let num = 0n;
    for (let i = zeros; i < arr.length; i++) {
      num = (num << 8n) | BigInt(arr[i]);
    }
    let str = '';
    while (num > 0n) {
      const rem = Number(num % 58n);
      num = num / 58n;
      str = BASE58_ALPHABET[rem] + str;
    }
    return '1'.repeat(zeros) + str;
  }

  function base58Decode(str) {
    if (typeof str !== 'string') {
      throw new TypeError('Base58 input must be a string');
    }
    if (str.length === 0) return new Uint8Array(0);
    let zeros = 0;
    while (zeros < str.length && str[zeros] === '1') zeros++;
    let num = 0n;
    for (let i = zeros; i < str.length; i++) {
      const code = str.charCodeAt(i);
      const digit = code < 128 ? BASE58_MAP[code] : -1;
      if (digit < 0) {
        throw new Error(`Invalid Base58 character: "${str[i]}"`);
      }
      num = num * 58n + BigInt(digit);
    }
    const bytes = [];
    while (num > 0n) {
      bytes.unshift(Number(num & 0xffn));
      num >>= 8n;
    }
    const out = new Uint8Array(zeros + bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      out[zeros + i] = bytes[i];
    }
    return out;
  }

  const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const BECH32M_CONST = 0x2bc830a3;

  function bech32Polymod(values) {
    let chk = 1;
    const GENERATORS = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    for (let p = 0; p < values.length; ++p) {
      const top = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ values[p];
      for (let i = 0; i < 5; ++i) {
        if ((top >> i) & 1) chk ^= GENERATORS[i];
      }
    }
    return chk;
  }

  function bech32HrpExpand(hrp) {
    const ret = [];
    for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) >> 5);
    ret.push(0);
    for (let p = 0; p < hrp.length; ++p) ret.push(hrp.charCodeAt(p) & 31);
    return ret;
  }

  function convertBits(data, frombits, tobits, pad = true) {
    let acc = 0;
    let bits = 0;
    const ret = [];
    const maxv = (1 << tobits) - 1;
    for (let p = 0; p < data.length; ++p) {
      const value = data[p];
      if (value < 0 || (value >> frombits) !== 0) return null;
      acc = (acc << frombits) | value;
      bits += frombits;
      while (bits >= tobits) {
        bits -= tobits;
        ret.push((acc >> bits) & maxv);
      }
    }
    if (pad) {
      if (bits > 0) ret.push((acc << (tobits - bits)) & maxv);
    } else if (bits >= frombits || ((acc << (tobits - bits)) & maxv)) {
      return null;
    }
    return ret;
  }

  function encodeBech32m(hrp, witnessVersion, programBytes) {
    const words = [witnessVersion].concat(convertBits(programBytes, 8, 5, true));
    const values = bech32HrpExpand(hrp).concat(words).concat([0, 0, 0, 0, 0, 0]);
    const mod = bech32Polymod(values) ^ BECH32M_CONST;
    let ret = hrp + '1';
    for (let p = 0; p < words.length; ++p) {
      ret += BECH32_CHARSET.charAt(words[p]);
    }
    for (let p = 0; p < 6; ++p) {
      ret += BECH32_CHARSET.charAt((mod >> (5 * (5 - p))) & 31);
    }
    return ret;
  }

  function decodeBech32Any(address, expectedConst = null) {
    if (typeof address !== 'string') {
      return { valid: false, error: msg('地址格式无效', 'Invalid address format') };
    }
    if (address.length < 8 || address.length > 90) {
      return { valid: false, error: msg('地址长度无效', 'Invalid address length') };
    }
    const isLower = address === address.toLowerCase();
    const isUpper = address === address.toUpperCase();
    if (!isLower && !isUpper) {
      return { valid: false, error: msg('地址不能混用大小写字母', 'Address cannot mix uppercase and lowercase letters') };
    }
    const addr = address.toLowerCase();
    const sep = addr.lastIndexOf('1');
    if (sep === -1) {
      return { valid: false, error: msg('地址格式无效', 'Invalid address format') };
    }
    if (sep === 0 || sep + 7 > addr.length) {
      return { valid: false, error: msg('地址前缀或长度无效', 'Invalid address prefix or length') };
    }
    const hrp = addr.slice(0, sep);
    const dataChars = addr.slice(sep + 1);
    const data = [];
    for (let i = 0; i < dataChars.length; i++) {
      const idx = BECH32_CHARSET.indexOf(dataChars[i]);
      if (idx === -1) {
        return { valid: false, error: msg('地址包含无效字符', 'Address contains invalid characters') };
      }
      data.push(idx);
    }
    const poly = bech32Polymod(bech32HrpExpand(hrp).concat(data));
    const encoding = poly === 1 ? 'bech32' : (poly === BECH32M_CONST ? 'bech32m' : null);
    if (!encoding || (expectedConst !== null && poly !== expectedConst)) {
      return {
        valid: false,
        error: msg('地址校验未通过，请核对字符', 'Invalid address checksum; please check characters')
      };
    }
    const values = data.slice(0, data.length - 6);
    if (values.length < 1) {
      return { valid: false, error: msg('地址格式无效', 'Invalid address format') };
    }
    const witnessVersion = values[0];
    if (witnessVersion === 0 && poly !== 1) {
      return { valid: false, error: msg('地址版本与编码不匹配', 'Address version mismatch') };
    }
    if (witnessVersion > 0 && poly !== BECH32M_CONST) {
      return { valid: false, error: msg('地址版本与编码不匹配', 'Address version mismatch') };
    }
    const programWords = values.slice(1);
    const programBytes = convertBits(programWords, 5, 8, false);
    if (!programBytes) {
      return { valid: false, error: msg('地址编码无效', 'Invalid address encoding') };
    }
    return {
      valid: true,
      encoding,
      hrp,
      witnessVersion,
      programBytes,
      programHex: Array.from(programBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    };
  }

  function decodeBech32(address) {
    return decodeBech32Any(address, 1);
  }

  function decodeBech32m(address) {
    return decodeBech32Any(address, BECH32M_CONST);
  }

  function base58CheckDecode(str) {
    const raw = base58Decode(str);
    if (raw.length < 5) throw new Error('Invalid Base58Check length');
    const payload = raw.slice(0, raw.length - 4);
    const checksum = raw.slice(raw.length - 4);
    const h = sha256Bytes(sha256Bytes(payload));
    for (let i = 0; i < 4; i++) {
      if (checksum[i] !== h[i]) throw new Error('Invalid Base58Check checksum');
    }
    return payload;
  }

  function validatePearlAddress(address) {
    if (!address || typeof address !== 'string') {
      return { valid: false, error: msg('请输入有效的 Pearl 地址', 'Enter a valid Pearl address') };
    }
    const cleanAddr = address.trim();
    const decoded = decodeBech32m(cleanAddr);
    if (!decoded.valid) {
      return { valid: false, error: decoded.error };
    }
    if (decoded.hrp !== 'prl') {
      return { valid: false, error: msg('Pearl 地址应以 prl1 开头', 'Pearl address must start with prl1') };
    }
    if (decoded.witnessVersion !== 1 || decoded.programBytes.length !== 32) {
      return {
        valid: false,
        error: msg('Pearl 地址格式无效，请检查后重试', 'Invalid Pearl address format')
      };
    }
    return { valid: true, decoded };
  }

  function eip55ChecksumAddress(rawHex20) {
    const clean = String(rawHex20 || '').toLowerCase().replace(/^0x/i, '');
    if (!/^[0-9a-f]{40}$/.test(clean)) {
      throw new Error('Invalid 20-byte hex address for EIP-55 checksum');
    }
    const hash = keccak256Bytes(clean);
    const hashHex = bytesToHex(hash);
    let out = '0x';
    for (let i = 0; i < 40; i++) {
      out += parseInt(hashHex[i], 16) >= 8 ? clean[i].toUpperCase() : clean[i];
    }
    return out;
  }

  // ======================== Chain Address Validation & Network Detection ========================

  const EVM_NETWORKS = new Set([
    'evm', 'eth', 'ethereum', 'bsc', 'smartchain', 'bnb', 'base', 'arb', 'arbitrum',
    'hype', 'hyperevm', 'hood', 'robinhood', 'arc', 'arcnetwork', 'op', 'optimism', 'pol', 'polygon', 'avax', 'gnosis'
  ]);

  function isNearNamedAccount(addr) {
    if (addr.length < 2 || addr.length > 64) return false;
    return /^(([a-z\d]+[-_])*[a-z\d]+\.)+([a-z\d]+[-_])*[a-z\d]+$/.test(addr) && /\.(near|tg|testnet)$/i.test(addr);
  }

  function isValidSolanaAddressFormat(clean) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean)) return false;
    try {
      return base58Decode(clean).length === 32;
    } catch (_) {
      return false;
    }
  }

  function isValidBitcoinAddressFormat(clean) {
    if (!clean) return false;
    if (/^bc1/i.test(clean)) {
      const dec = decodeBech32Any(clean);
      if (!dec.valid || dec.hrp !== 'bc') return false;
      if (dec.witnessVersion === 0) {
        return dec.programBytes.length === 20 || dec.programBytes.length === 32;
      }
      if (dec.witnessVersion === 1) {
        return dec.programBytes.length === 32;
      }
      return false;
    }
    if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(clean)) {
      try {
        const payload = base58CheckDecode(clean);
        return payload.length === 21 && (payload[0] === 0x00 || payload[0] === 0x05);
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  function isValidTronAddressFormat(clean) {
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(clean)) return false;
    try {
      const payload = base58CheckDecode(clean);
      return payload.length === 21 && payload[0] === 0x41;
    } catch (_) {
      return false;
    }
  }

  function validateChainAddress(network, address) {
    const clean = String(address || '').trim();
    if (!clean) {
      return { valid: false, error: msg('地址不能为空', 'Address cannot be empty') };
    }
    const net = String(network || 'near').toLowerCase();
    if (net === 'prl' || net === 'pearl') {
      return validatePearlAddress(clean);
    }
    if (net === 'qtc' || net === 'quantus') {
      if (/^qz[1-9A-HJ-NP-Za-km-z]{45,50}$/.test(clean)) return { valid: true };
      return {
        valid: false,
        error: msg('Quantus (QTC) 地址应以 qz 开头', 'Quantus (QTC) address must start with qz')
      };
    }
    if (net === 'near') {
      const lower = clean.toLowerCase();
      if (/^[a-f0-9]{64}$/i.test(clean) || isNearNamedAccount(lower)) {
        return { valid: true };
      }
      return {
        valid: false,
        error: msg('NEAR 地址应为 .near/.tg 账户名或 64 位账户地址', 'NEAR address must be a .near/.tg account ID or 64-character account address')
      };
    }
    if (EVM_NETWORKS.has(net)) {
      if (/^0x[a-fA-F0-9]{40}$/.test(clean)) {
        const hasLower = /[a-f]/.test(clean.slice(2));
        const hasUpper = /[A-F]/.test(clean.slice(2));
        if (hasLower && hasUpper && eip55ChecksumAddress(clean) !== clean) {
          return {
            valid: false,
            error: msg('EVM 地址大小写校验未通过，请仔细核对地址', 'EVM address checksum mismatch; please double-check')
          };
        }
        return { valid: true };
      }
      return {
        valid: false,
        error: msg('EVM 地址应为 0x 开头的 42 位地址', 'EVM address must be a 42-character address starting with 0x')
      };
    }
    if (net === 'sol' || net === 'solana') {
      if (isValidSolanaAddressFormat(clean)) return { valid: true };
      return {
        valid: false,
        error: msg('Solana 地址格式无效，请核对后重试', 'Invalid Solana address format')
      };
    }
    if (net === 'tron' || net === 'trx') {
      if (isValidTronAddressFormat(clean)) return { valid: true };
      return {
        valid: false,
        error: msg('TRON 地址无效，应为 T 开头的有效地址', 'Invalid TRON address (must start with T)')
      };
    }
    if (net === 'btc' || net === 'bitcoin') {
      if (isValidBitcoinAddressFormat(clean)) return { valid: true };
      return { valid: false, error: msg('Bitcoin 地址格式或校验和无效', 'Invalid Bitcoin address or checksum') };
    }
    return {
      valid: false,
      error: msg('暂不支持该链地址格式校验', 'Unsupported chain address format')
    };
  }

  function detectAddressNetwork(address) {
    const clean = String(address || '').trim();
    if (!clean) return null;
    if (/^prl1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{10,}$/i.test(clean)) return 'prl';
    if (/^qz[1-9A-HJ-NP-Za-km-z]{45,50}$/.test(clean)) return 'qtc';
    if (/^0x[a-fA-F0-9]{40}$/.test(clean)) return 'evm';
    if (/^[a-f0-9]{64}$/i.test(clean) || isNearNamedAccount(clean.toLowerCase())) return 'near';
    if (isValidBitcoinAddressFormat(clean)) return 'btc';
    if (isValidTronAddressFormat(clean)) return 'tron';
    if (isValidSolanaAddressFormat(clean)) return 'sol';
    return null;
  }

