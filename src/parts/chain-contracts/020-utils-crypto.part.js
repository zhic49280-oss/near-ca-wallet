  const _solFeeAtaCache = {};

  function safeRequire(relPath) {
    if (typeof require !== 'function') return null;
    try {
      return require(relPath);
    } catch (_) {
      return null;
    }
  }

  function getCryptoEngine() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCACrypto) ||
      (typeof window !== 'undefined' && window.NearCACrypto) ||
      (typeof globalThis !== 'undefined' && globalThis.NearCA && globalThis.NearCA.crypto) ||
      safeRequire('./crypto-engine.js')
    );
  }

  function getTokenRegistry() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCATokens) ||
      (typeof window !== 'undefined' && window.NearCATokens) ||
      (typeof globalThis !== 'undefined' && globalThis.NearCA && globalThis.NearCA.tokens) ||
      safeRequire('./token-registry.js')
    );
  }

  function getEthersLib() {
    return (
      (typeof window !== 'undefined' && window.ethers) ||
      (typeof globalThis !== 'undefined' && globalThis.ethers) ||
      safeRequire('../ethers.umd.min.js')
    );
  }

  function getConfiguredLang() {
    const lang =
      (typeof globalThis !== 'undefined' && globalThis.NearCAState && globalThis.NearCAState.lang) ||
      (typeof globalThis !== 'undefined' && globalThis.state && globalThis.state.currentLang) ||
      null;
    if (!lang) return null;
    return String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function t(zh, en) {
    const lang = getConfiguredLang();
    if (lang === 'zh') return zh;
    if (lang === 'en') return en;
    return `${zh} | ${en}`;
  }

  function normalizeDecimalInput(value) {
    const str = String(value === undefined || value === null ? '' : value).trim();
    if (!str) return '';
    if (!/[eE]/.test(str)) return str;
    const match = str.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
    if (!match) return str;
    const sign = match[1] === '-' ? '-' : '';
    const intPart = match[2];
    const fracPart = match[3] || '';
    const exp = parseInt(match[4], 10);
    const digits = intPart + fracPart;
    const pointPos = intPart.length + exp;
    if (pointPos <= 0) return sign + '0.' + '0'.repeat(-pointPos) + digits;
    if (pointPos >= digits.length) return sign + digits + '0'.repeat(pointPos - digits.length);
    return sign + digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
  }

  function toBaseUnits(amountInput, decimals) {
    const dec = Number.isInteger(decimals) && decimals >= 0 ? decimals : (Number(decimals) || 0);
    const normalized = normalizeDecimalInput(amountInput);
    if (!normalized || normalized.startsWith('-')) return '0';
    const num = Number(normalized);
    if (!Number.isFinite(num) || num <= 0) return '0';
    const parts = normalized.replace(/^\+/, '').split('.');
    const whole = (parts[0] || '0').replace(/\D/g, '') || '0';
    const fracRaw = (parts[1] || '').replace(/\D/g, '');
    const frac = fracRaw.slice(0, dec).padEnd(dec, '0');
    const combined = (whole + frac).replace(/^0+/, '');
    return combined || '0';
  }

  function fromBaseUnits(baseStr, decimals) {
    const dec = Number.isInteger(decimals) && decimals >= 0 ? decimals : (Number(decimals) || 0);
    const raw = String(baseStr === undefined || baseStr === null ? '0' : baseStr).trim();
    if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) return '0';
    if (dec === 0) return raw.replace(/^0+/, '') || '0';
    const padded = raw.padStart(dec + 1, '0');
    const splitIdx = padded.length - dec;
    const whole = padded.slice(0, splitIdx).replace(/^0+/, '') || '0';
    const frac = padded.slice(splitIdx).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
  }

  const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function base58Encode(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (arr.length === 0) return '';
    let zeros = 0;
    while (zeros < arr.length && arr[zeros] === 0) zeros++;
    let num = 0n;
    for (let i = zeros; i < arr.length; i++) {
      num = (num << 8n) | BigInt(arr[i]);
    }
    let out = '';
    while (num > 0n) {
      out = BASE58_ALPHABET[Number(num % 58n)] + out;
      num /= 58n;
    }
    return '1'.repeat(zeros) + out;
  }

  function base58Decode(str) {
    const clean = String(str || '').trim();
    if (!clean) return new Uint8Array(0);
    let zeros = 0;
    while (zeros < clean.length && clean[zeros] === '1') zeros++;
    let num = 0n;
    for (let i = zeros; i < clean.length; i++) {
      const idx = BASE58_ALPHABET.indexOf(clean[i]);
      if (idx < 0) throw new Error(`Invalid Base58 character: ${clean[i]}`);
      num = num * 58n + BigInt(idx);
    }
    const bytes = [];
    while (num > 0n) {
      bytes.unshift(Number(num & 0xffn));
      num >>= 8n;
    }
    const out = new Uint8Array(zeros + bytes.length);
    out.set(bytes, zeros);
    return out;
  }

  function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== 'undefined') return Buffer.from(arr).toString('base64');
    let bin = '';
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(b64), 'base64'));
    const bin = atob(String(b64));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function hexToBytes(hexStr) {
    const clean = String(hexStr || '').replace(/^0x/i, '');
    if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
      throw new Error('Invalid hex string');
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function concatUint8Arrays(arrs) {
    const total = arrs.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrs) {
      out.set(a, offset);
      offset += a.length;
    }
    return out;
  }

  function decodeCompactU16(bytes, offset = 0) {
    let val = 0;
    let shift = 0;
    let pos = offset;
    while (pos < bytes.length) {
      const elem = bytes[pos++];
      val |= (elem & 0x7f) << shift;
      if ((elem & 0x80) === 0) break;
      shift += 7;
    }
    return { value: val, length: pos - offset };
  }

  function encodeCompactU16(n) {
    const out = [];
    let val = Number(n);
    while (true) {
      let elem = val & 0x7f;
      val >>>= 7;
      if (val === 0) {
        out.push(elem);
        break;
      }
      out.push(elem | 0x80);
    }
    return new Uint8Array(out);
  }

  function encodeU32LE(n) {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, Number(n) >>> 0, true);
    return out;
  }

  function encodeU64LE(n) {
    const out = new Uint8Array(8);
    let v = BigInt(n);
    for (let i = 0; i < 8; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  function encodeU128LE(n) {
    const out = new Uint8Array(16);
    let v = BigInt(n);
    for (let i = 0; i < 16; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  function encodeBorshString(str) {
    const bytes = new TextEncoder().encode(String(str));
    return concatUint8Arrays([encodeU32LE(bytes.length), bytes]);
  }

  async function sha256BytesAsync(data) {
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', buf));
    }
    const nodeCrypto = safeRequire('crypto');
    if (nodeCrypto && nodeCrypto.createHash) {
      return new Uint8Array(nodeCrypto.createHash('sha256').update(buf).digest());
    }
    throw new Error('SHA-256 unavailable');
  }

  // Keccak-f[1600] supporting both NIST SHA3-256 (domain 0x06) and Keccak-256 (domain 0x01) for MPC KDF fallback
  const KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  const KECCAK_ROTC = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];
  const KECCAK_PILN = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];
  const MASK64 = 0xffffffffffffffffn;

  function rotl64(x, n) {
    const k = BigInt(n);
    return ((x << k) | (x >> (64n - k))) & MASK64;
  }

  function keccakSponge256(input, domainByte) {
    const data = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
    const rate = 136;
    const blockCount = Math.floor(data.length / rate) + 1;
    const padded = new Uint8Array(blockCount * rate);
    padded.set(data);
    padded[data.length] ^= domainByte;
    padded[padded.length - 1] ^= 0x80;

    const st = new Array(25).fill(0n);
    for (let off = 0; off < padded.length; off += rate) {
      for (let i = 0; i < 17; i++) {
        let lane = 0n;
        for (let b = 0; b < 8; b++) {
          lane |= BigInt(padded[off + i * 8 + b]) << BigInt(b * 8);
        }
        st[i] ^= lane;
      }
      for (let r = 0; r < 24; r++) {
        const bc = new Array(5);
        for (let i = 0; i < 5; i++) bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20];
        for (let i = 0; i < 5; i++) {
          const tVal = bc[(i + 4) % 5] ^ rotl64(bc[(i + 1) % 5], 1);
          for (let j = 0; j < 25; j += 5) st[j + i] ^= tVal;
        }
        let temp = st[1];
        for (let i = 0; i < 24; i++) {
          const j = KECCAK_PILN[i];
          const next = st[j];
          st[j] = rotl64(temp, KECCAK_ROTC[i]);
          temp = next;
        }
        for (let j = 0; j < 25; j += 5) {
          const s0 = st[j], s1 = st[j + 1], s2 = st[j + 2], s3 = st[j + 3], s4 = st[j + 4];
          st[j] = s0 ^ ((~s1 & MASK64) & s2);
          st[j + 1] = s1 ^ ((~s2 & MASK64) & s3);
          st[j + 2] = s2 ^ ((~s3 & MASK64) & s4);
          st[j + 3] = s3 ^ ((~s4 & MASK64) & s0);
          st[j + 4] = s4 ^ ((~s0 & MASK64) & s1);
        }
        st[0] ^= KECCAK_RC[r];
      }
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) {
      const lane = st[i];
      for (let b = 0; b < 8; b++) {
        out[i * 8 + b] = Number((lane >> BigInt(b * 8)) & 0xffn);
      }
    }
    return out;
  }

  function sha3_256Bytes(input) {
    return keccakSponge256(input, 0x06);
  }

  function keccak256Bytes(input) {
    return keccakSponge256(input, 0x01);
  }

  const SECP256K1_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const SECP256K1_GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
  const SECP256K1_GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

  function secpMod(a, m = SECP256K1_P) {
    const r = a % m;
    return r >= 0n ? r : r + m;
  }

  function secpInv(a, m = SECP256K1_P) {
    let lm = 1n, hm = 0n;
    let low = secpMod(a, m), high = m;
    while (low > 1n) {
      const ratio = high / low;
      const nm = hm - lm * ratio;
      const nw = high - low * ratio;
      hm = lm;
      lm = nm;
      high = low;
      low = nw;
    }
    return secpMod(lm, m);
  }

  function secpPointAdd(p1, p2) {
    if (!p1) return p2;
    if (!p2) return p1;
    if (p1.x === p2.x) {
      if (p1.y !== p2.y) return null;
      const lam = secpMod(3n * p1.x * p1.x * secpInv(2n * p1.y));
      const x3 = secpMod(lam * lam - 2n * p1.x);
      const y3 = secpMod(lam * (p1.x - x3) - p1.y);
      return { x: x3, y: y3 };
    }
    const lam = secpMod((p2.y - p1.y) * secpInv(secpMod(p2.x - p1.x)));
    const x3 = secpMod(lam * lam - p1.x - p2.x);
    const y3 = secpMod(lam * (p1.x - x3) - p1.y);
    return { x: x3, y: y3 };
  }

  function secpPointMultiply(k, point = { x: SECP256K1_GX, y: SECP256K1_GY }) {
    let scalar = secpMod(k, SECP256K1_N);
    let result = null;
    let addend = point;
    while (scalar > 0n) {
      if (scalar & 1n) result = secpPointAdd(result, addend);
      addend = secpPointAdd(addend, addend);
      scalar >>= 1n;
    }
    return result;
  }

  function eip55ChecksumAddress(rawHex20) {
    const clean = rawHex20.toLowerCase().replace(/^0x/, '');
    const hashHex = bytesToHex(keccak256Bytes(clean));
    let out = '0x';
    for (let i = 0; i < 40; i++) {
      out += parseInt(hashHex[i], 16) >= 8 ? clean[i].toUpperCase() : clean[i];
    }
    return out;
  }

  /**
   * Derives the NEAR MPC (v1.signer) controlled EVM address for a NEAR account and path
   * using official Additive Key Derivation: tweak = sha3_256("near-mpc-recovery v0.1.0 epsilon derivation:" + accountId + "," + path).
   */
  async function deriveMpcEvmAddressAsync(nearAccountId, path = 'ethereum-1') {
    const acct = String(nearAccountId || '').trim();
    if (!acct) return '';

    const cryptoEngine = getCryptoEngine();
    if (cryptoEngine) {
      const delegated =
        cryptoEngine.deriveNearMpcEvmAddress ||
        cryptoEngine.deriveMpcEvmAddressAsync ||
        cryptoEngine.deriveMpcAddressAsync ||
        cryptoEngine.deriveChainSignatureEvmAddressAsync;
      if (typeof delegated === 'function') {
        const res = await delegated(acct, path);
        const addr = typeof res === 'string' ? res : (res && (res.mpcEvmAddress || res.address || res.evmAddress));
        if (addr) return addr;
      }
    }

    const rootBytes = base58Decode(V1_SIGNER_ROOT_PK_BASE58);
    if (rootBytes.length !== 64) {
      throw new Error('Invalid v1.signer root public key length');
    }
    const rootX = BigInt('0x' + bytesToHex(rootBytes.slice(0, 32)));
    const rootY = BigInt('0x' + bytesToHex(rootBytes.slice(32, 64)));
    const rootPoint = { x: rootX, y: rootY };

    const preimage = `near-mpc-recovery v0.1.0 epsilon derivation:${acct},${path}`;
    const tweakBytes = sha3_256Bytes(preimage);
    const epsilon = BigInt('0x' + bytesToHex(tweakBytes)) % SECP256K1_N;
    const tweakPoint = secpPointMultiply(epsilon);
    const childPoint = secpPointAdd(rootPoint, tweakPoint);
    if (!childPoint) throw new Error('MPC child public key at infinity');

    const childXyBytes = hexToBytes(
      childPoint.x.toString(16).padStart(64, '0') +
      childPoint.y.toString(16).padStart(64, '0')
    );
    const addrHash = keccak256Bytes(childXyBytes);
    return eip55ChecksumAddress(bytesToHex(addrHash.slice(12)));
  }

