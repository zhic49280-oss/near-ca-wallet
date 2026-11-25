  // ======================== Ed25519 (RFC 8032) & SLIP-0010 Engine ========================

  const ED_P = (1n << 255n) - 19n;
  const ED_L = (1n << 252n) + 27742317777372353535851937790883648493n;
  const ED_D = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
  const ED_BX = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
  const ED_BY = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
  const ED_SQRT_M1 = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;

  function edMod(a, m = ED_P) {
    const r = a % m;
    return r >= 0n ? r : r + m;
  }

  function edPow(base, exp, mod = ED_P) {
    let res = 1n;
    base = edMod(base, mod);
    while (exp > 0n) {
      if (exp & 1n) res = edMod(res * base, mod);
      base = edMod(base * base, mod);
      exp >>= 1n;
    }
    return res;
  }

  function edInv(a) {
    return edPow(a, ED_P - 2n, ED_P);
  }

  const ED_BASE_POINT = [ED_BX, ED_BY, 1n, edMod(ED_BX * ED_BY)];
  const ED_IDENTITY = [0n, 1n, 1n, 0n];

  function edAdd(P, Q) {
    const [X1, Y1, Z1, T1] = P;
    const [X2, Y2, Z2, T2] = Q;
    const A = edMod((Y1 - X1) * (Y2 - X2));
    const B = edMod((Y1 + X1) * (Y2 + X2));
    const C = edMod(T1 * 2n * ED_D * T2);
    const D = edMod(Z1 * 2n * Z2);
    const E = edMod(B - A);
    const F = edMod(D - C);
    const G = edMod(D + C);
    const H = edMod(B + A);
    return [edMod(E * F), edMod(G * H), edMod(F * G), edMod(E * H)];
  }

  function edPointScalarMult(k, point = ED_BASE_POINT) {
    let P = point;
    let Q = ED_IDENTITY;
    let s = k;
    while (s > 0n) {
      if (s & 1n) Q = edAdd(Q, P);
      P = edAdd(P, P);
      s >>= 1n;
    }
    return Q;
  }

  function edEncodePoint(Q) {
    const zInv = edInv(Q[2]);
    const x = edMod(Q[0] * zInv);
    const y = edMod(Q[1] * zInv);
    const bytes = new Uint8Array(32);
    let yCopy = y;
    for (let i = 0; i < 32; i++) {
      bytes[i] = Number(yCopy & 0xffn);
      yCopy >>= 8n;
    }
    if (x & 1n) bytes[31] |= 0x80;
    return bytes;
  }

  function edScalarMult(k) {
    return edEncodePoint(edPointScalarMult(k, ED_BASE_POINT));
  }

  function edDecodePoint(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) return null;
    const xSign = (bytes[31] >> 7) & 1;
    let y = 0n;
    for (let i = 31; i >= 0; i--) {
      const byteVal = i === 31 ? (bytes[i] & 0x7f) : bytes[i];
      y = (y << 8n) | BigInt(byteVal);
    }
    if (y >= ED_P) return null;
    const y2 = edMod(y * y);
    const u = edMod(y2 - 1n);
    const v = edMod(ED_D * y2 + 1n);
    const v3 = edMod(v * v * v);
    const v7 = edMod(v3 * v3 * v);
    const uv7 = edMod(u * v7);
    let x = edMod(u * v3 * edPow(uv7, (ED_P - 5n) / 8n, ED_P));
    const check = edMod(v * x * x);
    if (check !== u) {
      if (check === edMod(-u)) {
        x = edMod(x * ED_SQRT_M1);
      } else {
        return null;
      }
    }
    if (x === 0n && xSign === 1) return null;
    if ((x & 1n) !== BigInt(xSign)) x = ED_P - x;
    return [x, y, 1n, edMod(x * y)];
  }

  function bytesToLeBigInt(bytes) {
    let n = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
      n = (n << 8n) | BigInt(bytes[i]);
    }
    return n;
  }

  function leBigIntTo32Bytes(n) {
    const out = new Uint8Array(32);
    let v = n;
    for (let i = 0; i < 32; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  function parseSeed32Bytes(seedInput) {
    if (seedInput instanceof Uint8Array) {
      if (seedInput.length === 32) return seedInput;
      if (seedInput.length === 64) return seedInput.slice(0, 32);
      throw new Error(`Expected 32-byte Ed25519 seed, got ${seedInput.length} bytes`);
    }
    const str = String(seedInput || '').trim();
    if (str.startsWith('ed25519:')) {
      const dec = base58Decode(str.slice('ed25519:'.length));
      if (dec.length < 32) throw new Error('Invalid ed25519 private key length');
      return dec.slice(0, 32);
    }
    const cleanHex = str.replace(/^0x/i, '');
    if (cleanHex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(cleanHex)) {
      throw new Error('Expected 64-character hex Ed25519 seed');
    }
    return hexToBytes(cleanHex);
  }

  function parseEd25519KeyBytes(input, expectedLen) {
    if (input instanceof Uint8Array) return input;
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed.startsWith('ed25519:')) {
        return base58Decode(trimmed.slice('ed25519:'.length));
      }
      if (/^(0x)?[0-9a-fA-F]+$/.test(trimmed) && trimmed.replace(/^0x/i, '').length === expectedLen * 2) {
        return hexToBytes(trimmed);
      }
      return base58Decode(trimmed);
    }
    return toUint8Array(input);
  }

  async function ed25519PublicKeyFromSeedAsync(seed32Hex) {
    const seed = parseSeed32Bytes(seed32Hex);
    const h = await sha512BytesAsync(seed);
    h[0] &= 248;
    h[31] &= 127;
    h[31] |= 64;
    const a = bytesToLeBigInt(h.slice(0, 32));
    return edScalarMult(a);
  }

  async function ed25519SignAsync(msgBytes, seed32Hex) {
    const msgBuf = toUint8Array(msgBytes);
    const seed = parseSeed32Bytes(seed32Hex);
    const h = await sha512BytesAsync(seed);
    h[0] &= 248;
    h[31] &= 127;
    h[31] |= 64;
    const a = bytesToLeBigInt(h.slice(0, 32));
    const prefix = h.slice(32, 64);
    const pubBytes = edScalarMult(a);

    const rInput = concatUint8Arrays([prefix, msgBuf]);
    const r = bytesToLeBigInt(await sha512BytesAsync(rInput)) % ED_L;
    const R = edScalarMult(r === 0n ? ED_L : r);

    const kInput = concatUint8Arrays([R, pubBytes, msgBuf]);
    const k = bytesToLeBigInt(await sha512BytesAsync(kInput)) % ED_L;
    const S = (r + k * a) % ED_L;

    const sig = new Uint8Array(64);
    sig.set(R, 0);
    sig.set(leBigIntTo32Bytes(S), 32);
    return sig;
  }

  async function ed25519VerifyAsync(sigBytes, msgBytes, pubKeyBytes) {
    try {
      const sig = parseEd25519KeyBytes(sigBytes, 64);
      const pub = parseEd25519KeyBytes(pubKeyBytes, 32);
      const msgBuf = toUint8Array(msgBytes);
      if (sig.length !== 64 || pub.length !== 32) return false;

      const RBytes = sig.slice(0, 32);
      const SBytes = sig.slice(32, 64);
      const S = bytesToLeBigInt(SBytes);
      if (S >= ED_L) return false;

      const A = edDecodePoint(pub);
      if (!A) return false;
      const R = edDecodePoint(RBytes);
      if (!R) return false;

      const k = bytesToLeBigInt(await sha512BytesAsync(concatUint8Arrays([RBytes, pub, msgBuf]))) % ED_L;
      // RFC 8032 Section 5.1.7 cofactored verification: [8][S]B == [8](R + [k]A)
      const lhs = edPointScalarMult(8n, edPointScalarMult(S, ED_BASE_POINT));
      const rhs = edPointScalarMult(8n, edAdd(R, edPointScalarMult(k, A)));

      return (
        edMod(lhs[0] * rhs[2] - rhs[0] * lhs[2]) === 0n &&
        edMod(lhs[1] * rhs[2] - rhs[1] * lhs[2]) === 0n
      );
    } catch (_) {
      return false;
    }
  }

  function slip0010Ed25519DeriveFromSeedBytesSync(seedBytes, pathIndices) {
    const enc = new TextEncoder();
    let I = cryptoHmacSha512Sync(enc.encode('ed25519 seed'), seedBytes);
    let key = I.slice(0, 32);
    let chain = I.slice(32);

    for (const idx of pathIndices) {
      const actualIdx = (idx + 0x80000000) >>> 0;
      const data = new Uint8Array(1 + 32 + 4);
      data[0] = 0;
      data.set(key, 1);
      new DataView(data.buffer).setUint32(33, actualIdx, false);
      I = cryptoHmacSha512Sync(chain, data);
      key = I.slice(0, 32);
      chain = I.slice(32);
    }

    const h = sha512Bytes(key);
    h[0] &= 248;
    h[31] &= 127;
    h[31] |= 64;
    const kBig = bytesToLeBigInt(h.slice(0, 32));
    const pubBytes = edScalarMult(kBig);
    const secret64 = new Uint8Array(64);
    secret64.set(key, 0);
    secret64.set(pubBytes, 32);

    return { key, pubBytes, secret64 };
  }

  function deriveNearFromSeed(words, accountIndex = 0) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = cryptoPbkdf2Sync(mnemonicStr);
    const { key, pubBytes, secret64 } = slip0010Ed25519DeriveFromSeedBytesSync(
      seedBytes,
      [44, 397, accountIndex]
    );
    return {
      nearAddress: bytesToHex(pubBytes),
      nearPublicKey: `ed25519:${base58Encode(pubBytes)}`,
      nearPrivateKey: `ed25519:${base58Encode(secret64)}`,
      nearPrivateSeedHex: bytesToHex(key),
      path: `m/44'/397'/${accountIndex}'`
    };
  }

  async function slip0010Ed25519DeriveFromSeedBytesAsync(seedBytes, pathIndices) {
    const enc = new TextEncoder();
    let I = await cryptoHmacSha512Async(enc.encode('ed25519 seed'), seedBytes);
    let key = I.slice(0, 32);
    let chain = I.slice(32);

    for (const idx of pathIndices) {
      const actualIdx = (idx + 0x80000000) >>> 0;
      const data = new Uint8Array(1 + 32 + 4);
      data[0] = 0;
      data.set(key, 1);
      new DataView(data.buffer).setUint32(33, actualIdx, false);
      I = await cryptoHmacSha512Async(chain, data);
      key = I.slice(0, 32);
      chain = I.slice(32);
    }

    const h = await sha512BytesAsync(key);
    h[0] &= 248;
    h[31] &= 127;
    h[31] |= 64;
    const kBig = bytesToLeBigInt(h.slice(0, 32));
    const pubBytes = edScalarMult(kBig);
    const secret64 = new Uint8Array(64);
    secret64.set(key, 0);
    secret64.set(pubBytes, 32);

    return { key, pubBytes, secret64 };
  }

  // ======================== Multi-Chain Key Derivation ========================

  function assertNonEmptyMnemonic(words) {
    const str = normalizeMnemonicInput(words);
    if (!str) throw new Error('Mnemonic phrase cannot be empty');
    return str;
  }

  async function deriveNearFromSeedBytesAsync(seedBytes, accountIndex = 0) {
    const { key, pubBytes, secret64 } = await slip0010Ed25519DeriveFromSeedBytesAsync(
      seedBytes,
      [44, 397, accountIndex]
    );
    return {
      nearAddress: bytesToHex(pubBytes),
      nearPublicKey: `ed25519:${base58Encode(pubBytes)}`,
      nearPrivateKey: `ed25519:${base58Encode(secret64)}`,
      nearPrivateSeedHex: bytesToHex(key),
      path: `m/44'/397'/${accountIndex}'`
    };
  }

  async function deriveNearFromSeedAsync(words, accountIndex = 0) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    return deriveNearFromSeedBytesAsync(seedBytes, accountIndex);
  }

  async function deriveSolanaFromSeedBytesAsync(seedBytes, accountIndex = 0) {
    const { key, pubBytes, secret64 } = await slip0010Ed25519DeriveFromSeedBytesAsync(
      seedBytes,
      [44, 501, accountIndex, 0]
    );
    const solAddress = base58Encode(pubBytes);
    return {
      solAddress,
      solPublicKey: solAddress,
      solPrivateKey: base58Encode(secret64),
      solPrivateSeedHex: bytesToHex(key),
      path: `m/44'/501'/${accountIndex}'/0'`
    };
  }

  async function deriveSolanaFromSeedAsync(words, accountIndex = 0) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    return deriveSolanaFromSeedBytesAsync(seedBytes, accountIndex);
  }

  async function deriveEvmFromSeedBytesAsync(seedBytes, path = "m/44'/60'/0'/0/0") {
    const master = await bip32DeriveMasterKeyAsync(seedBytes);
    const child = await bip32DerivePathAsync(master, path);
    const d = BigInt('0x' + bytesToHex(child.privateKey));
    const P = secpPointMultiply(d);
    const xHex = P.x.toString(16).padStart(64, '0');
    const yHex = P.y.toString(16).padStart(64, '0');
    const pubHex = xHex + yHex;
    const hash = keccak256Bytes(hexToBytes(pubHex));
    const addrHex = bytesToHex(hash.slice(12));
    return {
      address: eip55ChecksumAddress(addrHex),
      privateKeyHex: `0x${bytesToHex(child.privateKey)}`,
      pubkeyHex: `0x04${pubHex}`,
      path
    };
  }

  async function deriveEvmFromSeedAsync(words, path = "m/44'/60'/0'/0/0") {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    return deriveEvmFromSeedBytesAsync(seedBytes, path);
  }

  function derivePearlFromSeed(words, path = "m/86'/808276'/0'/0/0", useTapTweak = true) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = cryptoPbkdf2Sync(mnemonicStr);
    const master = bip32DeriveMasterKey(seedBytes);
    const child = bip32DerivePath(master, path);
    return privateKeyToTaprootAddress(child.privateKey, useTapTweak, path, 'prl');
  }

  async function derivePearlFromSeedAsync(words, path = "m/86'/808276'/0'/0/0", useTapTweak = true) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    const master = await bip32DeriveMasterKeyAsync(seedBytes);
    const child = await bip32DerivePathAsync(master, path);
    return privateKeyToTaprootAddress(child.privateKey, useTapTweak, path, 'prl');
  }

  function deriveBitcoinFromSeed(words, path = "m/86'/0'/0'/0/0", useTapTweak = true) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = cryptoPbkdf2Sync(mnemonicStr);
    const master = bip32DeriveMasterKey(seedBytes);
    const child = bip32DerivePath(master, path);
    return privateKeyToTaprootAddress(child.privateKey, useTapTweak, path, 'bc');
  }

  async function deriveBitcoinFromSeedAsync(words, path = "m/86'/0'/0'/0/0", useTapTweak = true) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    const master = await bip32DeriveMasterKeyAsync(seedBytes);
    const child = await bip32DerivePathAsync(master, path);
    return privateKeyToTaprootAddress(child.privateKey, useTapTweak, path, 'bc');
  }

  async function deriveCandidatePearlAddressesAsync(words) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    const master = await bip32DeriveMasterKeyAsync(seedBytes);
    const tweakedPaths = [
      "m/86'/808276'/0'/0/0",
      "m/86'/808276'/0'/0/1",
      "m/86'/808276'/0'/0/2",
      "m/86'/808276'/0'/0/3",
      "m/86'/0'/0'/0/0",
      "m/44'/808276'/0'/0/0",
      "m/44'/0'/0'/0/0"
    ];
    const results = [];
    for (const p of tweakedPaths) {
      const child = await bip32DerivePathAsync(master, p);
      results.push(privateKeyToTaprootAddress(child.privateKey, true, p, 'prl'));
    }
    for (const p of ["m/86'/808276'/0'/0/0", "m/86'/0'/0'/0/0"]) {
      const child = await bip32DerivePathAsync(master, p);
      results.push(privateKeyToTaprootAddress(child.privateKey, false, `${p} (untweaked)`, 'prl'));
    }
    return results;
  }

  async function deriveAllChainKeysAsync(words) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    const master = await bip32DeriveMasterKeyAsync(seedBytes);
    const [near, pearlChild, btcChild] = await Promise.all([
      deriveNearFromSeedBytesAsync(seedBytes, 0),
      bip32DerivePathAsync(master, "m/86'/808276'/0'/0/0"),
      bip32DerivePathAsync(master, "m/86'/0'/0'/0/0")
    ]);
    const pearl = privateKeyToTaprootAddress(pearlChild.privateKey, true, "m/86'/808276'/0'/0/0", 'prl');
    const btc = privateKeyToTaprootAddress(btcChild.privateKey, true, "m/86'/0'/0'/0/0", 'bc');
    const evmMpc = deriveNearMpcEvmAddress(near.nearAddress, 'ethereum-1');
    const solMpc = deriveNearMpcSolanaAddress(near.nearAddress, 'solana-1');
    const mpc = {
      nearAccountId: evmMpc.predecessorId,
      evmAddress: evmMpc.mpcEvmAddress,
      solAddress: solMpc.mpcSolAddress,
      details: { evm: evmMpc, sol: solMpc }
    };

    return {
      near,
      pearl,
      btc,
      mpc,
      nearAddress: near.nearAddress,
      nearPublicKey: near.nearPublicKey,
      nearPrivateKey: near.nearPrivateKey,
      nearPrivateSeedHex: near.nearPrivateSeedHex,
      evmAddress: evmMpc.mpcEvmAddress,
      mpcEvmAddress: evmMpc.mpcEvmAddress,
      solAddress: solMpc.mpcSolAddress,
      mpcSolAddress: solMpc.mpcSolAddress,
      solPublicKey: solMpc.mpcSolAddress,
      pearlAddress: pearl.address,
      pearlPrivateKeyHex: pearl.privateKeyHex,
      pearlTweakedPrivateKeyHex: pearl.tweakedPrivateKeyHex,
      btcAddress: btc.address,
      btcPrivateKeyHex: btc.privateKeyHex,
      btcTweakedPrivateKeyHex: btc.tweakedPrivateKeyHex
    };
  }

