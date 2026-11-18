/**
 * NEAR Chain Abstraction Wallet - Cryptographic & Multi-Chain Key Engine
 * Zero-dependency browser & Node.js cryptographic module.
 * Attaches to globalThis.NearCACrypto, window.NearCACrypto, and module.exports.
 */
(function (root) {
  'use strict';

  // Fallback 250-word BIP-39 subset (used only if full 2048-word bip39-wordlist.js is not loaded)
  const BIP39_WORDS_FALLBACK = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
    'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
    'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
    'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
    'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol', 'alert',
    'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha', 'already', 'also', 'alter',
    'always', 'amateur', 'amazing', 'among', 'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger',
    'angle', 'angry', 'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
    'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch', 'arctic',
    'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army', 'around', 'arrange', 'arrest',
    'arrive', 'arrow', 'art', 'artefact', 'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset',
    'assist', 'assume', 'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
    'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado', 'avoid', 'awake',
    'aware', 'away', 'awesome', 'awful', 'awkward', 'axis', 'baby', 'bachelor', 'bacon', 'badge',
    'bag', 'balance', 'balcony', 'ball', 'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain',
    'barrel', 'base', 'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
    'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt', 'bench', 'benefit',
    'best', 'betray', 'better', 'between', 'beyond', 'bicycle', 'bid', 'bike', 'bind', 'biology',
    'bird', 'birth', 'bitter', 'black', 'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless',
    'blind', 'blood', 'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
    'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring', 'borrow', 'boss',
    'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain', 'brand', 'brass', 'brave', 'bread',
    'breeze', 'brick', 'bridge', 'brief', 'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze',
    'broom', 'brother', 'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
    'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus', 'business', 'busy'
  ];

  const nodeCrypto = (typeof require === 'function') ? (function () {
    try { return require('crypto'); } catch (_) { return null; }
  })() : null;

  let _loadedNodeWordlist = null;
  let _cachedWordlistRef = null;
  let _cachedWordSet = null;
  let _cachedWordIndexMap = null;

  function isEnglishLocale() {
    return typeof globalThis !== 'undefined' &&
      globalThis.state &&
      globalThis.state.currentLang === 'en';
  }

  function msg(zh, en) {
    return isEnglishLocale() ? en : zh;
  }

  // ======================== Byte / Hex / Base64 Utilities ========================

  function toUint8Array(input) {
    if (input instanceof Uint8Array) return input;
    if (typeof ArrayBuffer !== 'undefined') {
      if (ArrayBuffer.isView(input)) {
        return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      }
      if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
      }
    }
    if (Array.isArray(input)) return Uint8Array.from(input);
    if (typeof input === 'string') return new TextEncoder().encode(input);
    throw new TypeError('Expected Uint8Array, ArrayBuffer, byte array, or string');
  }

  function concatUint8Arrays(arrs) {
    const normalized = arrs.map(a => toUint8Array(a));
    const total = normalized.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of normalized) {
      out.set(a, offset);
      offset += a.length;
    }
    return out;
  }

  function bytesToHex(bytes) {
    const arr = toUint8Array(bytes);
    let hex = '';
    for (let i = 0; i < arr.length; i++) {
      hex += arr[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function hexToBytes(hexStr) {
    const clean = String(hexStr || '').trim().replace(/^0x/i, '');
    if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
      throw new Error('Invalid hex string');
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function bytesToBase64(bytes) {
    const arr = toUint8Array(bytes);
    if (typeof btoa === 'function') {
      let bin = '';
      for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
      return btoa(bin);
    }
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(arr).toString('base64');
    }
    throw new Error('Base64 encoding unavailable');
  }

  function base64ToBytes(b64) {
    if (typeof atob === 'function') {
      const bin = atob(String(b64 || ''));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(String(b64 || ''), 'base64'));
    }
    throw new Error('Base64 decoding unavailable');
  }

  function getRandomBytes(length) {
    const buf = new Uint8Array(length);
    const cryptoObj = (typeof window !== 'undefined' && window.crypto)
      ? window.crypto
      : (typeof globalThis !== 'undefined' && globalThis.crypto ? globalThis.crypto : null);
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      cryptoObj.getRandomValues(buf);
      return buf;
    }
    if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
      return new Uint8Array(nodeCrypto.randomBytes(length));
    }
    throw new Error('Cryptographically secure random generator unavailable');
  }

  // ======================== Borsh Encoding Primitives ========================

  function encodeBorshString(str) {
    const b = new TextEncoder().encode(String(str));
    const out = new Uint8Array(4 + b.length);
    new DataView(out.buffer).setUint32(0, b.length, true);
    out.set(b, 4);
    return out;
  }

  function encodeU32LE(n) {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, Number(n) >>> 0, true);
    return out;
  }

  function encodeU64LE(n) {
    const out = new Uint8Array(8);
    let v = BigInt(n);
    if (v < 0n) throw new RangeError('u64 must be non-negative');
    for (let i = 0; i < 8; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  function encodeU128LE(n) {
    const out = new Uint8Array(16);
    let v = BigInt(n);
    if (v < 0n) throw new RangeError('u128 must be non-negative');
    for (let i = 0; i < 16; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  // ======================== Hash Primitives (SHA-256, SHA-512, Keccak-256, SHA3-256) ========================

  const SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function sha256Bytes(data) {
    const bytes = toUint8Array(data);
    if (nodeCrypto && nodeCrypto.createHash) {
      return new Uint8Array(nodeCrypto.createHash('sha256').update(bytes).digest());
    }
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    const bitLen = bytes.length * 8;
    const totalLen = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(totalLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(totalLen - 4, bitLen >>> 0, false);
    view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);

    let H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const W = new Uint32Array(64);
    for (let i = 0; i < totalLen; i += 64) {
      for (let j = 0; j < 16; j++) W[j] = view.getUint32(i + j * 4, false);
      for (let j = 16; j < 64; j++) {
        const s0 = rotr(W[j - 15], 7) ^ rotr(W[j - 15], 18) ^ (W[j - 15] >>> 3);
        const s1 = rotr(W[j - 2], 17) ^ rotr(W[j - 2], 19) ^ (W[j - 2] >>> 10);
        W[j] = (W[j - 16] + s0 + W[j - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let j = 0; j < 64; j++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + SHA256_K[j] + W[j]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H = [
        (H[0] + a) >>> 0, (H[1] + b) >>> 0, (H[2] + c) >>> 0, (H[3] + d) >>> 0,
        (H[4] + e) >>> 0, (H[5] + f) >>> 0, (H[6] + g) >>> 0, (H[7] + h) >>> 0
      ];
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i], false);
    return out;
  }

  async function sha256BytesAsync(data) {
    const buf = toUint8Array(data);
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', buf));
    }
    return sha256Bytes(buf);
  }

  // Pure-JS SHA-512 (32-bit hi/lo word pairs for synchronous browser compatibility)
  const SHA512_K_HI = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    0xca273ece, 0xd186b8c7, 0xeada7dd6, 0xf57d4f7f, 0x06f067aa, 0x0a637dc5, 0x113f9804, 0x1b710b35,
    0x28db77f5, 0x32caab7b, 0x3c9ebe0a, 0x431d67c4, 0x4cc5d4be, 0x597f299c, 0x5fcb6fab, 0x6c44198c
  ];
  const SHA512_K_LO = [
    0xd728ae22, 0x23ef65cd, 0xec4d3b2f, 0x8189dbbc, 0xf348b538, 0xb605d019, 0xaf194f9b, 0xda6d8118,
    0xa3030242, 0x45706fbe, 0x4ee4b28c, 0xd5ffb4e2, 0xf27b896f, 0x3b1696b1, 0x25c71235, 0xcf692694,
    0x9ef14ad2, 0x384f25e3, 0x8b8cd5b5, 0x77ac9c65, 0x592b0275, 0x6ea6e483, 0xbd41fbd4, 0x831153b5,
    0xee66dfab, 0x2db43210, 0x98fb213f, 0xbeef0ee4, 0x3da88fc2, 0x930aa725, 0xe003826f, 0x0a0e6e70,
    0x46d22ffc, 0x5c26c926, 0x5ac42aed, 0x9d95b3df, 0x8baf63de, 0x3c77b2a8, 0x47edaee6, 0x1482353b,
    0x4cf10364, 0xbc423001, 0xd0f89791, 0x0654be30, 0xd6ef5218, 0x5565a910, 0x5771202a, 0x32bbd1b8,
    0xb8d2d0c8, 0x5141ab53, 0xdf8eeb99, 0xe19b48a8, 0xc5c95a63, 0xe3418acb, 0x7763e373, 0xd6b2b8a3,
    0x5defb2fc, 0x43172f60, 0xa1f0ab72, 0x1a6439ec, 0x23631e28, 0xde82bde9, 0xb2c67915, 0xe372532b,
    0xea26619c, 0x21c0c207, 0xcde0eb1e, 0xee6ed178, 0x72176fba, 0xa2c898a6, 0xbef90dae, 0x131c471b,
    0x23047d84, 0x40c72493, 0x15c9bebc, 0x9c100d4c, 0xcb3e42b6, 0xfc657e2a, 0x3ad6faec, 0x4a475817
  ];

  function sha512BytesPure(bytes) {
    const len = bytes.length;
    const totalLen = Math.ceil((len + 17) / 128) * 128;
    const padded = new Uint8Array(totalLen);
    padded.set(bytes);
    padded[len] = 0x80;
    const view = new DataView(padded.buffer);
    const bitLenLo = (len * 8) >>> 0;
    const bitLenHi = Math.floor((len * 8) / 0x100000000);
    view.setUint32(totalLen - 4, bitLenLo, false);
    view.setUint32(totalLen - 8, bitLenHi, false);

    const Hhi = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const Hlo = new Uint32Array([0xf3bcc908, 0x84caa73b, 0xfe94f82b, 0x5f1d36f1, 0xade682d1, 0x2b3e6c1f, 0xfb41bd6b, 0x137e2179]);

    const Whi = new Uint32Array(80);
    const Wlo = new Uint32Array(80);

    for (let off = 0; off < totalLen; off += 128) {
      for (let i = 0; i < 16; i++) {
        Whi[i] = view.getUint32(off + i * 8, false);
        Wlo[i] = view.getUint32(off + i * 8 + 4, false);
      }
      for (let i = 16; i < 80; i++) {
        // s0 = rotr(1) ^ rotr(8) ^ shr(7) on W[i-15]
        const x0h = Whi[i - 15], x0l = Wlo[i - 15];
        const s0h = (((x0h >>> 1) | (x0l << 31)) ^ ((x0h >>> 8) | (x0l << 24)) ^ (x0h >>> 7)) >>> 0;
        const s0l = (((x0l >>> 1) | (x0h << 31)) ^ ((x0l >>> 8) | (x0h << 24)) ^ ((x0l >>> 7) | (x0h << 25))) >>> 0;

        // s1 = rotr(19) ^ rotr(61) ^ shr(6) on W[i-2]
        const x1h = Whi[i - 2], x1l = Wlo[i - 2];
        const s1h = (((x1h >>> 19) | (x1l << 13)) ^ ((x1l >>> 29) | (x1h << 3)) ^ (x1h >>> 6)) >>> 0;
        const s1l = (((x1l >>> 19) | (x1h << 13)) ^ ((x1h >>> 29) | (x1l << 3)) ^ ((x1l >>> 6) | (x1h << 26))) >>> 0;

        // W[i] = W[i-16] + s0 + W[i-7] + s1
        const l1 = Wlo[i - 16] + s0l;
        const c1 = l1 > 0xffffffff ? 1 : 0;
        const l2 = (l1 >>> 0) + Wlo[i - 7];
        const c2 = l2 > 0xffffffff ? 1 : 0;
        const l3 = (l2 >>> 0) + s1l;
        const c3 = l3 > 0xffffffff ? 1 : 0;
        Wlo[i] = l3 >>> 0;
        Whi[i] = (Whi[i - 16] + s0h + Whi[i - 7] + s1h + c1 + c2 + c3) >>> 0;
      }

      let ah = Hhi[0], al = Hlo[0];
      let bh = Hhi[1], bl = Hlo[1];
      let ch = Hhi[2], cl = Hlo[2];
      let dh = Hhi[3], dl = Hlo[3];
      let eh = Hhi[4], el = Hlo[4];
      let fh = Hhi[5], fl = Hlo[5];
      let gh = Hhi[6], gl = Hlo[6];
      let hh = Hhi[7], hl = Hlo[7];

      for (let i = 0; i < 80; i++) {
        // S1 = rotr(14) ^ rotr(18) ^ rotr(41) on e
        const S1h = (((eh >>> 14) | (el << 18)) ^ ((eh >>> 18) | (el << 14)) ^ ((el >>> 9) | (eh << 23))) >>> 0;
        const S1l = (((el >>> 14) | (eh << 18)) ^ ((el >>> 18) | (eh << 14)) ^ ((eh >>> 9) | (el << 23))) >>> 0;
        const chh = ((eh & fh) ^ (~eh & gh)) >>> 0;
        const chl = ((el & fl) ^ (~el & gl)) >>> 0;

        // t1 = h + S1 + ch + K[i] + W[i]
        let lo = hl + S1l;
        let carry = lo > 0xffffffff ? 1 : 0;
        lo = (lo >>> 0) + chl;
        carry += lo > 0xffffffff ? 1 : 0;
        lo = (lo >>> 0) + SHA512_K_LO[i];
        carry += lo > 0xffffffff ? 1 : 0;
        lo = (lo >>> 0) + Wlo[i];
        carry += lo > 0xffffffff ? 1 : 0;
        const t1l = lo >>> 0;
        const t1h = (hh + S1h + chh + SHA512_K_HI[i] + Whi[i] + carry) >>> 0;

        // S0 = rotr(28) ^ rotr(34) ^ rotr(39) on a
        const S0h = (((ah >>> 28) | (al << 4)) ^ ((al >>> 2) | (ah << 30)) ^ ((al >>> 7) | (ah << 25))) >>> 0;
        const S0l = (((al >>> 28) | (ah << 4)) ^ ((ah >>> 2) | (al << 30)) ^ ((ah >>> 7) | (al << 25))) >>> 0;
        const majh = ((ah & bh) ^ (ah & ch) ^ (bh & ch)) >>> 0;
        const majl = ((al & bl) ^ (al & cl) ^ (bl & cl)) >>> 0;

        const t2sumL = S0l + majl;
        const t2c = t2sumL > 0xffffffff ? 1 : 0;
        const t2l = t2sumL >>> 0;
        const t2h = (S0h + majh + t2c) >>> 0;

        hh = gh; hl = gl;
        gh = fh; gl = fl;
        fh = eh; fl = el;
        const edl = dl + t1l;
        el = edl >>> 0;
        eh = (dh + t1h + (edl > 0xffffffff ? 1 : 0)) >>> 0;
        dh = ch; dl = cl;
        ch = bh; cl = bl;
        bh = ah; bl = al;
        const nal = t1l + t2l;
        al = nal >>> 0;
        ah = (t1h + t2h + (nal > 0xffffffff ? 1 : 0)) >>> 0;
      }

      const addH = [ah, bh, ch, dh, eh, fh, gh, hh];
      const addL = [al, bl, cl, dl, el, fl, gl, hl];
      for (let i = 0; i < 8; i++) {
        const sl = Hlo[i] + addL[i];
        Hlo[i] = sl >>> 0;
        Hhi[i] = (Hhi[i] + addH[i] + (sl > 0xffffffff ? 1 : 0)) >>> 0;
      }
    }

    const out = new Uint8Array(64);
    const ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) {
      ov.setUint32(i * 8, Hhi[i], false);
      ov.setUint32(i * 8 + 4, Hlo[i], false);
    }
    return out;
  }

  function sha512Bytes(data) {
    const bytes = toUint8Array(data);
    if (nodeCrypto && nodeCrypto.createHash) {
      return new Uint8Array(nodeCrypto.createHash('sha512').update(bytes).digest());
    }
    return sha512BytesPure(bytes);
  }

  async function sha512BytesAsync(data) {
    const buf = toUint8Array(data);
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      const hash = await globalThis.crypto.subtle.digest('SHA-512', buf);
      return new Uint8Array(hash);
    }
    return sha512Bytes(buf);
  }

  // Keccak-f[1600] sponge for Keccak-256 (suffix 0x01) and NIST SHA3-256 (suffix 0x06)
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

  function keccakSponge256(input, domainSuffix) {
    const data = toUint8Array(input);
    const rate = 136; // 1088 bits
    const blockCount = Math.floor(data.length / rate) + 1;
    const padded = new Uint8Array(blockCount * rate);
    padded.set(data);
    padded[data.length] ^= domainSuffix;
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
        for (let i = 0; i < 5; i++) {
          bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20];
        }
        for (let i = 0; i < 5; i++) {
          const t = bc[(i + 4) % 5] ^ rotl64(bc[(i + 1) % 5], 1);
          for (let j = 0; j < 25; j += 5) st[j + i] ^= t;
        }
        let t = st[1];
        for (let i = 0; i < 24; i++) {
          const j = KECCAK_PILN[i];
          const tmp = st[j];
          st[j] = rotl64(t, KECCAK_ROTC[i]);
          t = tmp;
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

  function keccak256Bytes(input) {
    return keccakSponge256(input, 0x01);
  }

  function sha3_256Bytes(input) {
    if (nodeCrypto && nodeCrypto.createHash) {
      try {
        return new Uint8Array(nodeCrypto.createHash('sha3-256').update(toUint8Array(input)).digest());
      } catch (_) {}
    }
    return keccakSponge256(input, 0x06);
  }

  // ======================== HMAC-SHA512 & PBKDF2-HMAC-SHA512 ========================

  function cryptoHmacSha512Sync(key, data) {
    const keyBuf = toUint8Array(key);
    const dataBuf = toUint8Array(data);
    if (nodeCrypto && nodeCrypto.createHmac) {
      return new Uint8Array(nodeCrypto.createHmac('sha512', keyBuf).update(dataBuf).digest());
    }
    const blockSize = 128;
    const k = keyBuf.length > blockSize ? sha512BytesPure(keyBuf) : keyBuf;
    const ipad = new Uint8Array(blockSize + dataBuf.length);
    const opad = new Uint8Array(blockSize + 64);
    for (let i = 0; i < blockSize; i++) {
      const kb = i < k.length ? k[i] : 0;
      ipad[i] = kb ^ 0x36;
      opad[i] = kb ^ 0x5c;
    }
    ipad.set(dataBuf, blockSize);
    const inner = sha512BytesPure(ipad);
    opad.set(inner, blockSize);
    return sha512BytesPure(opad);
  }

  async function cryptoHmacSha512Async(key, data) {
    const keyBuf = toUint8Array(key);
    const dataBuf = toUint8Array(data);
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      try {
        const cryptoKey = await globalThis.crypto.subtle.importKey(
          'raw',
          keyBuf,
          { name: 'HMAC', hash: 'SHA-512' },
          false,
          ['sign']
        );
        const sig = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, dataBuf);
        return new Uint8Array(sig);
      } catch (_) {}
    }
    return cryptoHmacSha512Sync(keyBuf, dataBuf);
  }

  function normalizeMnemonicInput(mnemonic) {
    return (Array.isArray(mnemonic) ? mnemonic.join(' ') : String(mnemonic || '')).trim().normalize('NFKD');
  }

  function cryptoPbkdf2Sync(mnemonic, passphrase = '') {
    const passStr = normalizeMnemonicInput(mnemonic);
    const saltStr = 'mnemonic' + String(passphrase || '').normalize('NFKD');
    if (nodeCrypto && nodeCrypto.pbkdf2Sync) {
      return new Uint8Array(nodeCrypto.pbkdf2Sync(passStr, saltStr, 2048, 64, 'sha512'));
    }
    const enc = new TextEncoder();
    const passBytes = enc.encode(passStr);
    const saltBytes = enc.encode(saltStr);
    const block1 = new Uint8Array(saltBytes.length + 4);
    block1.set(saltBytes);
    block1[saltBytes.length + 3] = 1;

    let U = cryptoHmacSha512Sync(passBytes, block1);
    const T = new Uint8Array(U);
    for (let iter = 1; iter < 2048; iter++) {
      U = cryptoHmacSha512Sync(passBytes, U);
      for (let j = 0; j < 64; j++) T[j] ^= U[j];
    }
    return T;
  }

  async function cryptoPbkdf2Async(mnemonic, passphrase = '') {
    const passStr = normalizeMnemonicInput(mnemonic);
    const saltStr = 'mnemonic' + String(passphrase || '').normalize('NFKD');
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      try {
        const enc = new TextEncoder();
        const pass = enc.encode(passStr);
        const salt = enc.encode(saltStr);
        const key = await globalThis.crypto.subtle.importKey('raw', pass, 'PBKDF2', false, ['deriveBits']);
        const bits = await globalThis.crypto.subtle.deriveBits(
          { name: 'PBKDF2', hash: 'SHA-512', salt, iterations: 2048 },
          key,
          512
        );
        return new Uint8Array(bits);
      } catch (_) {}
    }
    return cryptoPbkdf2Sync(mnemonic, passphrase);
  }

  // ======================== BIP-39 Wordlist, Generation & Validation ========================

  function getBip39Wordlist() {
    const winObj = typeof window !== 'undefined' ? window : null;
    const gObj = typeof globalThis !== 'undefined' ? globalThis : null;
    if (winObj && Array.isArray(winObj.BIP39_WORDLIST) && winObj.BIP39_WORDLIST.length >= 2048) {
      return winObj.BIP39_WORDLIST;
    }
    if (gObj && Array.isArray(gObj.BIP39_WORDLIST) && gObj.BIP39_WORDLIST.length >= 2048) {
      return gObj.BIP39_WORDLIST;
    }
    if (_loadedNodeWordlist && _loadedNodeWordlist.length >= 2048) {
      return _loadedNodeWordlist;
    }
    // Auto-load ../bip39-wordlist.js in CommonJS/Node environments if not preloaded
    if (typeof require === 'function' && typeof __dirname === 'string') {
      try {
        const fs = require('fs');
        const path = require('path');
        const vm = require('vm');
        const wlPath = path.resolve(__dirname, '../bip39-wordlist.js');
        if (fs.existsSync(wlPath)) {
          const code = fs.readFileSync(wlPath, 'utf8');
          const sandbox = { window: {} };
          vm.createContext(sandbox);
          vm.runInContext(code, sandbox);
          if (Array.isArray(sandbox.window.BIP39_WORDLIST) && sandbox.window.BIP39_WORDLIST.length >= 2048) {
            _loadedNodeWordlist = sandbox.window.BIP39_WORDLIST;
            if (gObj && !gObj.BIP39_WORDLIST) gObj.BIP39_WORDLIST = _loadedNodeWordlist;
            return _loadedNodeWordlist;
          }
        }
      } catch (_) {}
    }
    return BIP39_WORDS_FALLBACK;
  }

  function ensureWordCaches() {
    const list = getBip39Wordlist();
    if (_cachedWordlistRef !== list) {
      _cachedWordlistRef = list;
      _cachedWordSet = new Set(list.map(w => w.toLowerCase().trim()));
      _cachedWordIndexMap = new Map();
      for (let i = 0; i < list.length; i++) {
        _cachedWordIndexMap.set(list[i].toLowerCase().trim(), i);
      }
    }
    return { list, wordSet: _cachedWordSet, indexMap: _cachedWordIndexMap };
  }

  function getBip39WordSet() {
    return ensureWordCaches().wordSet;
  }

  function verifyBip39Checksum(words) {
    const { list, indexMap } = ensureWordCaches();
    if (list.length !== 2048 || ![12, 15, 18, 21, 24].includes(words.length)) {
      return false;
    }
    const totalBits = words.length * 11;
    const csBits = totalBits / 33;
    const entBits = totalBits - csBits;
    const entBytesLen = entBits / 8;

    let bitAcc = 0;
    let bitCount = 0;
    const entBytes = new Uint8Array(entBytesLen);
    let byteIdx = 0;
    let checksumExtracted = 0;

    for (let i = 0; i < words.length; i++) {
      const idx = indexMap.get(words[i]);
      if (idx === undefined) return false;
      for (let b = 10; b >= 0; b--) {
        const bit = (idx >> b) & 1;
        if (byteIdx < entBytesLen) {
          bitAcc = (bitAcc << 1) | bit;
          bitCount++;
          if (bitCount === 8) {
            entBytes[byteIdx++] = bitAcc;
            bitAcc = 0;
            bitCount = 0;
          }
        } else {
          checksumExtracted = (checksumExtracted << 1) | bit;
        }
      }
    }
    const hash = sha256Bytes(entBytes);
    const expectedCs = hash[0] >> (8 - csBits);
    return checksumExtracted === expectedCs;
  }

  function generateMnemonic(length = 12) {
    const wordlist = getBip39Wordlist();
    if (wordlist.length === 2048 && [12, 15, 18, 21, 24].includes(length)) {
      const entBits = (length * 11 * 32) / 33;
      const entBytesLen = entBits / 8;
      const csBits = entBits / 32;
      const entropy = getRandomBytes(entBytesLen);
      const hash = sha256Bytes(entropy);
      const csVal = hash[0] >> (8 - csBits);

      const bits = [];
      for (let i = 0; i < entropy.length; i++) {
        for (let b = 7; b >= 0; b--) bits.push((entropy[i] >> b) & 1);
      }
      for (let b = csBits - 1; b >= 0; b--) {
        bits.push((csVal >> b) & 1);
      }

      const words = [];
      for (let i = 0; i < length; i++) {
        let idx = 0;
        for (let b = 0; b < 11; b++) {
          idx = (idx << 1) | bits[i * 11 + b];
        }
        words.push(wordlist[idx]);
      }
      return words;
    }

    const words = [];
    const rand = getRandomBytes(length * 4);
    const view = new DataView(rand.buffer, rand.byteOffset, rand.byteLength);
    for (let i = 0; i < length; i++) {
      words.push(wordlist[view.getUint32(i * 4, false) % wordlist.length]);
    }
    return words;
  }

  function validateMnemonic(phrase) {
    if (!phrase) {
      return {
        valid: false,
        error: msg('助记词不能为空', 'Mnemonic phrase cannot be empty'),
        invalidWords: []
      };
    }

    let words = [];
    if (Array.isArray(phrase)) {
      words = phrase.map(w => String(w || '').trim()).filter(Boolean);
    } else if (typeof phrase === 'string') {
      const cleaned = phrase.replace(/[,，.。;；\n\r\t]/g, ' ').trim();
      if (!cleaned) {
        return {
          valid: false,
          error: msg('助记词不能为空', 'Mnemonic phrase cannot be empty'),
          invalidWords: []
        };
      }
      words = cleaned.split(/\s+/).filter(Boolean);
    } else {
      return {
        valid: false,
        error: msg('助记词格式错误', 'Mnemonic phrase must be a string'),
        invalidWords: []
      };
    }

    if (words.length !== 12 && words.length !== 24) {
      return {
        valid: false,
        error: msg(
          `⚠️ 助记词数量错误 (Invalid word count)：检测到 ${words.length} 个单词，应为 12 或 24 个英文单词！`,
          `Invalid word count: expected 12 or 24 words, got ${words.length}`
        ),
        invalidWords: []
      };
    }

    const wordSet = getBip39WordSet();
    const invalidWords = [];
    for (let i = 0; i < words.length; i++) {
      const raw = words[i];
      const lower = raw.toLowerCase();
      if (!/^[a-z]+$/.test(lower) || !wordSet.has(lower)) {
        invalidWords.push({ index: i + 1, word: raw });
      }
    }

    if (invalidWords.length > 0) {
      const invalidDetails = invalidWords.map(x => `#${x.index} "${x.word}"`).join(', ');
      return {
        valid: false,
        error: msg(
          `⚠️ 助记词包含无效词 (Invalid BIP-39 words found): ${invalidDetails}，不在标准 BIP-39 词库中，请核对拼写！`,
          `Invalid BIP-39 words found: ${invalidDetails}`
        ),
        invalidWords
      };
    }

    const normalized = words.map(w => w.toLowerCase());
    return {
      valid: true,
      words: normalized,
      checksumValid: verifyBip39Checksum(normalized)
    };
  }

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

  function decodeBech32m(address) {
    if (typeof address !== 'string') {
      return { valid: false, error: 'Address must be a string' };
    }
    if (address.length < 8 || address.length > 90) {
      return { valid: false, error: `Invalid address length: ${address.length}` };
    }
    const isLower = address === address.toLowerCase();
    const isUpper = address === address.toUpperCase();
    if (!isLower && !isUpper) {
      return { valid: false, error: 'Mixed case is not allowed in Bech32' };
    }
    const addr = address.toLowerCase();
    const sep = addr.lastIndexOf('1');
    if (sep === -1) {
      return { valid: false, error: 'Missing separator "1"' };
    }
    if (sep === 0 || sep + 7 > addr.length) {
      return { valid: false, error: 'Invalid HRP or data length' };
    }
    const hrp = addr.slice(0, sep);
    const dataChars = addr.slice(sep + 1);
    const data = [];
    for (let i = 0; i < dataChars.length; i++) {
      const idx = BECH32_CHARSET.indexOf(dataChars[i]);
      if (idx === -1) {
        return { valid: false, error: `Invalid bech32 character: ${dataChars[i]}` };
      }
      data.push(idx);
    }
    const poly = bech32Polymod(bech32HrpExpand(hrp).concat(data));
    if (poly !== BECH32M_CONST) {
      return {
        valid: false,
        error: `Invalid Bech32m checksum: got 0x${poly.toString(16)}, expected 0x${BECH32M_CONST.toString(16)}`
      };
    }
    const values = data.slice(0, data.length - 6);
    if (values.length < 1) {
      return { valid: false, error: 'Empty witness data' };
    }
    const witnessVersion = values[0];
    const programWords = values.slice(1);
    const programBytes = convertBits(programWords, 5, 8, false);
    if (!programBytes) {
      return { valid: false, error: 'Failed to convert 5-bit words back to bytes' };
    }
    return {
      valid: true,
      hrp,
      witnessVersion,
      programBytes,
      programHex: Array.from(programBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    };
  }

  function validatePearlAddress(address) {
    if (!address || typeof address !== 'string') {
      return { valid: false, error: 'Address must be a string' };
    }
    const cleanAddr = address.trim();
    const decoded = decodeBech32m(cleanAddr);
    if (!decoded.valid) {
      return { valid: false, error: decoded.error };
    }
    if (decoded.hrp !== 'prl') {
      return { valid: false, error: `Invalid HRP: expected 'prl', got '${decoded.hrp}'` };
    }
    if (decoded.witnessVersion !== 1) {
      return { valid: false, error: `Invalid witness version: expected 1 for Taproot, got ${decoded.witnessVersion}` };
    }
    if (decoded.programBytes.length !== 32) {
      return {
        valid: false,
        error: `Invalid program length: expected 32 bytes (256-bit x-only pubkey), got ${decoded.programBytes.length}`
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
    'hype', 'hyperevm', 'hood', 'robinhood', 'op', 'optimism', 'pol', 'polygon', 'avax', 'gnosis'
  ]);

  function isNearNamedAccount(addr) {
    if (addr.length < 2 || addr.length > 64) return false;
    return /^(([a-z\d]+[-_])*[a-z\d]+\.)+([a-z\d]+[-_])*[a-z\d]+$/.test(addr) && /\.(near|tg)$/i.test(addr);
  }

  function isNearUniversalAccount(addr) {
    return /^0u[0-9a-hjkmnp-tv-z]{52}$/.test(String(addr || '').trim());
  }

  function isValidSolanaAddressFormat(clean) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(clean)) return false;
    try {
      return base58Decode(clean).length === 32;
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
        error: msg('Quantus (QTC) 地址应为 qz 开头的 SS58 地址', 'Quantus (QTC) address must be a valid SS58 string starting with qz')
      };
    }
    if (net === 'near') {
      const lower = clean.toLowerCase();
      if (/^[a-f0-9]{64}$/i.test(clean) || isNearNamedAccount(lower) || isNearUniversalAccount(lower)) {
        return { valid: true };
      }
      return {
        valid: false,
        error: msg('NEAR 地址应为 .near/.tg 域名、0u 通用地址或 64 位十六进制隐式地址', 'NEAR address must be a .near/.tg account ID, 0u universal address, or 64-hex implicit account')
      };
    }
    if (EVM_NETWORKS.has(net)) {
      if (/^0x[a-fA-F0-9]{40}$/.test(clean)) return { valid: true };
      return {
        valid: false,
        error: msg('EVM 地址应为 0x 开头的 42 位十六进制地址', 'EVM address must be a 42-character hex string starting with 0x')
      };
    }
    if (net === 'sol' || net === 'solana') {
      if (isValidSolanaAddressFormat(clean)) return { valid: true };
      return {
        valid: false,
        error: msg('Solana 地址应为 32 字节 Base58 公钥字符串', 'Solana address must be a valid 32-byte Base58 public key')
      };
    }
    if (net === 'tron' || net === 'trx') {
      if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(clean)) return { valid: true };
      return {
        valid: false,
        error: msg('TRON 地址应为 T 开头的 34 位 Base58 地址', 'TRON address must be a 34-character Base58 string starting with T')
      };
    }
    if (net === 'btc' || net === 'bitcoin') {
      if (/^(bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/i.test(clean)) {
        // Legacy Base58Check addresses start with 1 or 3 and must be valid Base58 (not mixed invalid chars)
        if (/^[13]/.test(clean) && !/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(clean)) {
          return { valid: false, error: msg('Bitcoin 地址格式不正确', 'Invalid Bitcoin address format') };
        }
        return { valid: true };
      }
      return { valid: false, error: msg('Bitcoin 地址格式不正确', 'Invalid Bitcoin address format') };
    }
    return { valid: true };
  }

  function detectAddressNetwork(address) {
    const clean = String(address || '').trim();
    if (!clean) return null;
    if (/^prl1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{10,}$/i.test(clean)) return 'prl';
    if (/^qz[1-9A-HJ-NP-Za-km-z]{45,50}$/.test(clean)) return 'qtc';
    if (/^0x[a-fA-F0-9]{40}$/.test(clean)) return 'evm';
    if (/^[a-f0-9]{64}$/i.test(clean) || isNearNamedAccount(clean.toLowerCase()) || isNearUniversalAccount(clean.toLowerCase())) return 'near';
    if (/^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{25,87}$/i.test(clean)) return 'btc';
    if (/^[1-9A-HJ-NP-Za-km-z]{26,44}$/.test(clean)) {
      let decodedLen = -1;
      try {
        decodedLen = base58Decode(clean).length;
      } catch (_) {
        decodedLen = -1;
      }
      if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(clean) && decodedLen !== 32) return 'tron';
      if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(clean) && decodedLen !== 32) return 'btc';
      if (clean.length >= 32 && decodedLen === 32) return 'sol';
    }
    return null;
  }

  // ======================== Secp256k1 & BIP-32 / BIP-86 Engine ========================

  const SECP256K1_P = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');
  const SECP256K1_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
  const SECP256K1_GX = BigInt('0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798');
  const SECP256K1_GY = BigInt('0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8');

  function secpMod(a, b = SECP256K1_P) {
    const res = a % b;
    return res >= 0n ? res : res + b;
  }

  function secpModInverse(a, m = SECP256K1_P) {
    a = secpMod(a, m);
    if (a === 0n) throw new Error('Zero has no modular inverse');
    let [old_r, r] = [a, m];
    let [old_s, s] = [1n, 0n];
    while (r !== 0n) {
      const q = old_r / r;
      [old_r, r] = [r, old_r - q * r];
      [old_s, s] = [s, old_s - q * s];
    }
    return secpMod(old_s, m);
  }

  function secpPointAdd(p1, p2) {
    if (!p1) return p2;
    if (!p2) return p1;
    if (p1.x === p2.x && p1.y !== p2.y) return null;
    let m;
    if (p1.x === p2.x && p1.y === p2.y) {
      m = secpMod(3n * p1.x * p1.x * secpModInverse(2n * p1.y));
    } else {
      m = secpMod((p2.y - p1.y) * secpModInverse(p2.x - p1.x));
    }
    const x3 = secpMod(m * m - p1.x - p2.x);
    const y3 = secpMod(m * (p1.x - x3) - p1.y);
    return { x: x3, y: y3 };
  }

  function secpPointMultiply(k, p = { x: SECP256K1_GX, y: SECP256K1_GY }) {
    let curr = p;
    let res = null;
    let scalar = secpMod(k, SECP256K1_N);
    while (scalar > 0n) {
      if (scalar & 1n) res = secpPointAdd(res, curr);
      curr = secpPointAdd(curr, curr);
      scalar >>= 1n;
    }
    return res;
  }

  function bip32DeriveMasterKey(seedBytes) {
    const enc = new TextEncoder();
    const IBytes = cryptoHmacSha512Sync(enc.encode('Bitcoin seed'), seedBytes);
    return { privateKey: IBytes.slice(0, 32), chainCode: IBytes.slice(32) };
  }

  async function bip32DeriveMasterKeyAsync(seedBytes) {
    const enc = new TextEncoder();
    const IBytes = await cryptoHmacSha512Async(enc.encode('Bitcoin seed'), seedBytes);
    return { privateKey: IBytes.slice(0, 32), chainCode: IBytes.slice(32) };
  }

  function buildBip32ChildInput(parent, index, hardened) {
    const actualIndex = hardened ? (index + 0x80000000) >>> 0 : index >>> 0;
    const idxBuf = new Uint8Array(4);
    new DataView(idxBuf.buffer).setUint32(0, actualIndex, false);
    const dataBytes = new Uint8Array(1 + 32 + 4);
    if (hardened) {
      dataBytes[0] = 0;
      dataBytes.set(parent.privateKey, 1);
    } else {
      const privBig = BigInt('0x' + bytesToHex(parent.privateKey));
      const pt = secpPointMultiply(privBig);
      dataBytes[0] = pt.y % 2n === 0n ? 0x02 : 0x03;
      const xBytes = hexToBytes(pt.x.toString(16).padStart(64, '0'));
      dataBytes.set(xBytes, 1);
    }
    dataBytes.set(idxBuf, 33);
    return dataBytes;
  }

  function finishBip32Child(parent, IBytes) {
    const IL = IBytes.slice(0, 32);
    const IR = IBytes.slice(32);
    const ki = secpMod(
      BigInt('0x' + bytesToHex(IL)) + BigInt('0x' + bytesToHex(parent.privateKey)),
      SECP256K1_N
    );
    if (ki === 0n) throw new Error('Invalid BIP-32 child key derived');
    return {
      privateKey: hexToBytes(ki.toString(16).padStart(64, '0')),
      chainCode: IR
    };
  }

  function bip32DerivePath(master, pathStr) {
    const parts = String(pathStr).split('/').slice(1);
    let curr = master;
    for (const part of parts) {
      const hardened = part.endsWith("'");
      const index = parseInt(part.replace("'", ''), 10);
      const dataBytes = buildBip32ChildInput(curr, index, hardened);
      curr = finishBip32Child(curr, cryptoHmacSha512Sync(curr.chainCode, dataBytes));
    }
    return curr;
  }

  async function bip32DerivePathAsync(master, pathStr) {
    const parts = String(pathStr).split('/').slice(1);
    let curr = master;
    for (const part of parts) {
      const hardened = part.endsWith("'");
      const index = parseInt(part.replace("'", ''), 10);
      const dataBytes = buildBip32ChildInput(curr, index, hardened);
      curr = finishBip32Child(curr, await cryptoHmacSha512Async(curr.chainCode, dataBytes));
    }
    return curr;
  }

  function tapTweakHash(pubKeyXBytes) {
    const tagHash = sha256Bytes('TapTweak');
    const combined = new Uint8Array(64 + pubKeyXBytes.length);
    combined.set(tagHash, 0);
    combined.set(tagHash, 32);
    combined.set(pubKeyXBytes, 64);
    return sha256Bytes(combined);
  }

  function privateKeyToTaprootAddress(privBytes, useTapTweak = true, path = "m/86'/808276'/0'/0/0") {
    const privHex = bytesToHex(privBytes);
    let priv = BigInt('0x' + privHex);
    let pt = secpPointMultiply(priv);

    if (useTapTweak) {
      if (pt.y % 2n !== 0n) {
        priv = secpMod(SECP256K1_N - priv, SECP256K1_N);
        pt = { x: pt.x, y: secpMod(SECP256K1_P - pt.y, SECP256K1_P) };
      }
      const pxHex = pt.x.toString(16).padStart(64, '0');
      const pxBytes = hexToBytes(pxHex);
      const tBytes = tapTweakHash(pxBytes);
      const tBig = BigInt('0x' + bytesToHex(tBytes)) % SECP256K1_N;
      const tPt = secpPointMultiply(tBig);
      const Q = secpPointAdd(pt, tPt);
      const qxHex = Q.x.toString(16).padStart(64, '0');
      const qxBytes = Array.from(hexToBytes(qxHex));
      const address = encodeBech32m('prl', 1, qxBytes);
      const tweakedPriv = secpMod(priv + tBig, SECP256K1_N);
      return {
        address,
        privateKeyHex: `0x${privHex}`,
        tweakedPrivateKeyHex: `0x${tweakedPriv.toString(16).padStart(64, '0')}`,
        pubkeyHex: qxHex,
        path
      };
    }

    const xHex = pt.x.toString(16).padStart(64, '0');
    const xBytes = Array.from(hexToBytes(xHex));
    const address = encodeBech32m('prl', 1, xBytes);
    return {
      address,
      privateKeyHex: `0x${privHex}`,
      pubkeyHex: xHex,
      path
    };
  }

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
    return privateKeyToTaprootAddress(child.privateKey, useTapTweak, path);
  }

  async function derivePearlFromSeedAsync(words, path = "m/86'/808276'/0'/0/0", useTapTweak = true) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    const master = await bip32DeriveMasterKeyAsync(seedBytes);
    const child = await bip32DerivePathAsync(master, path);
    return privateKeyToTaprootAddress(child.privateKey, useTapTweak, path);
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
      results.push(privateKeyToTaprootAddress(child.privateKey, true, p));
    }
    for (const p of ["m/86'/808276'/0'/0/0", "m/86'/0'/0'/0/0"]) {
      const child = await bip32DerivePathAsync(master, p);
      results.push(privateKeyToTaprootAddress(child.privateKey, false, `${p} (untweaked)`));
    }
    return results;
  }

  async function deriveAllChainKeysAsync(words) {
    const mnemonicStr = assertNonEmptyMnemonic(words);
    const seedBytes = await cryptoPbkdf2Async(mnemonicStr);
    const master = await bip32DeriveMasterKeyAsync(seedBytes);
    const [near, pearlChild] = await Promise.all([
      deriveNearFromSeedBytesAsync(seedBytes, 0),
      bip32DerivePathAsync(master, "m/86'/808276'/0'/0/0")
    ]);
    const pearl = privateKeyToTaprootAddress(pearlChild.privateKey, true, "m/86'/808276'/0'/0/0");
    const mpc = deriveNearMpcAllAddresses(near.nearAddress);

    return {
      near,
      pearl,
      mpc,
      nearAddress: near.nearAddress,
      nearPublicKey: near.nearPublicKey,
      nearPrivateKey: near.nearPrivateKey,
      nearPrivateSeedHex: near.nearPrivateSeedHex,
      evmAddress: mpc.evmAddress,
      mpcEvmAddress: mpc.evmAddress,
      solAddress: mpc.solAddress,
      mpcSolAddress: mpc.solAddress,
      solPublicKey: mpc.solAddress,
      pearlAddress: pearl.address,
      pearlPrivateKeyHex: pearl.privateKeyHex,
      pearlTweakedPrivateKeyHex: pearl.tweakedPrivateKeyHex,
      btcAddress: mpc.btcAddress,
      mpcBtcAddress: mpc.btcAddress
    };
  }

  // ======================== NEP-413 NEAR Intent Message Signing ========================

  const NEP413_TAG_PREFIX = encodeU32LE((2 ** 31) + 413); // [0x9d, 0x01, 0x00, 0x80]

  async function signNep413IntentMessageAsync({
    message,
    recipient = 'intents.near',
    nonceBytes,
    callbackUrl = null,
    nearPrivateSeedHex,
    nearPublicKey
  }) {
    if (typeof message !== 'string') {
      throw new Error('NEP-413 message must be a string');
    }
    let nonce;
    if (nonceBytes === undefined || nonceBytes === null) {
      nonce = getRandomBytes(32);
    } else if (typeof nonceBytes === 'string') {
      nonce = base64ToBytes(nonceBytes);
    } else {
      nonce = toUint8Array(nonceBytes);
    }
    if (nonce.length !== 32) {
      throw new Error(`NEP-413 nonce must be exactly 32 bytes, got ${nonce.length}`);
    }

    const callbackPart = callbackUrl
      ? concatUint8Arrays([new Uint8Array([1]), encodeBorshString(callbackUrl)])
      : new Uint8Array([0]);

    const payload = concatUint8Arrays([
      encodeBorshString(message),
      nonce,
      encodeBorshString(recipient),
      callbackPart
    ]);

    const toHash = concatUint8Arrays([NEP413_TAG_PREFIX, payload]);
    const digest = await sha256BytesAsync(toHash);
    const sigBytes = await ed25519SignAsync(digest, nearPrivateSeedHex);

    let resolvedPublicKey = nearPublicKey;
    if (!resolvedPublicKey) {
      const pubBytes = await ed25519PublicKeyFromSeedAsync(nearPrivateSeedHex);
      resolvedPublicKey = `ed25519:${base58Encode(pubBytes)}`;
    }

    return {
      signature: `ed25519:${base58Encode(sigBytes)}`,
      publicKey: resolvedPublicKey,
      nonceBase64: bytesToBase64(nonce),
      message,
      recipient,
      payloadHashHex: bytesToHex(digest)
    };
  }

  // ======================== NEAR Chain Signatures (v1.signer MPC KDF) ========================

  // Live NEAR Mainnet v1.signer.public_key() root secp256k1 key (domain_id: 0)
  const NEAR_MPC_MAINNET_ROOT_KEY =
    'secp256k1:3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya';
  // Live NEAR Testnet v1.signer-prod.testnet.public_key() root secp256k1 key (domain_id: 0)
  const NEAR_MPC_TESTNET_ROOT_KEY =
    'secp256k1:4NfTiv3UsGahebgTaHyD9vF8KYKMBnfd6kh94mK6xv8fGBiJB8TBtFMP5WWXz6B89Ac1fbpzPwAvoyQebemHFwx3';
  // Live NEAR Mainnet v1.signer root Ed25519 key (domain_id: 1)
  const NEAR_MPC_MAINNET_ED25519_ROOT_KEY =
    'ed25519:G9hwngxWNKdmqMCmU1Yt6LPhFpayJeKFxyAV1HqMNLtF';

  function parseSecp256k1NearPublicKey(keyStr) {
    const clean = String(keyStr || '').trim().replace(/^secp256k1:/, '');
    const bytes = base58Decode(clean);
    if (bytes.length !== 64) {
      throw new Error(`Expected 64-byte uncompressed NEAR secp256k1 public key, got ${bytes.length}`);
    }
    const hex = bytesToHex(bytes);
    return {
      x: BigInt('0x' + hex.slice(0, 64)),
      y: BigInt('0x' + hex.slice(64, 128))
    };
  }

  function deriveNearMpcSecp256k1Point(nearAccountId, path = 'ethereum-1', options = {}) {
    const predecessorId = String(nearAccountId || '').trim();
    if (!predecessorId) {
      throw new Error('nearAccountId is required for MPC address derivation');
    }
    const cleanPath = String(path || 'ethereum-1');
    const network = options && options.network === 'testnet' ? 'testnet' : 'mainnet';
    const signerContract = (options && options.signerContract) ||
      (network === 'testnet' ? 'v1.signer-prod.testnet' : 'v1.signer');
    const rootKeyStr = (options && options.rootPublicKey) ||
      (signerContract === 'v1.signer-prod.testnet' || network === 'testnet'
        ? NEAR_MPC_TESTNET_ROOT_KEY
        : NEAR_MPC_MAINNET_ROOT_KEY);
    const hashAlg = (options && options.hashAlg) || 'sha3-256';

    const rootPoint = parseSecp256k1NearPublicKey(rootKeyStr);
    const derivationInput = `near-mpc-recovery v0.1.0 epsilon derivation:${predecessorId},${cleanPath}`;
    const tweakBytes = hashAlg === 'sha256'
      ? sha256Bytes(derivationInput)
      : sha3_256Bytes(derivationInput);

    const epsilonHex = bytesToHex(tweakBytes);
    const epsilon = BigInt('0x' + epsilonHex) % SECP256K1_N;
    const derivedPoint = secpPointAdd(rootPoint, secpPointMultiply(epsilon));
    if (!derivedPoint) {
      throw new Error('Derived MPC point at infinity');
    }

    const xHex = derivedPoint.x.toString(16).padStart(64, '0');
    const yHex = derivedPoint.y.toString(16).padStart(64, '0');
    const derivedXyBytes = hexToBytes(xHex + yHex);
    return {
      predecessorId,
      path: cleanPath,
      domainId: 0,
      signerContract,
      xBytes: hexToBytes(xHex),
      derivedXyBytes,
      derivedPublicKey: `secp256k1:${base58Encode(derivedXyBytes)}`,
      epsilonHex
    };
  }

  /**
   * Derives the deterministic EVM address controlled by NEAR MPC (`v1.signer`, domain_id: 0)
   * for a given NEAR predecessor account and derivation path.
   */
  function deriveNearMpcEvmAddress(nearAccountId, path = 'ethereum-1', options = {}) {
    const pt = deriveNearMpcSecp256k1Point(nearAccountId, path || 'ethereum-1', options);
    const evmHash = keccak256Bytes(pt.derivedXyBytes);
    const mpcEvmAddress = eip55ChecksumAddress(bytesToHex(evmHash.slice(12)));

    return {
      mpcEvmAddress,
      predecessorId: pt.predecessorId,
      path: pt.path,
      domainId: 0,
      signerContract: pt.signerContract,
      derivedPublicKey: pt.derivedPublicKey,
      epsilonHex: pt.epsilonHex
    };
  }

  /**
   * Derives the deterministic Solana address controlled by NEAR MPC (`v1.signer`, domain_id: 1)
   * using Ed25519 additive key derivation with little-endian sha3_256 epsilon modulo ED_L.
   */
  function deriveNearMpcSolanaAddress(nearAccountId, path = 'solana-1', options = {}) {
    const predecessorId = String(nearAccountId || '').trim();
    if (!predecessorId) {
      throw new Error('nearAccountId is required for MPC Solana address derivation');
    }
    const cleanPath = String(path || 'solana-1');
    const network = options && options.network === 'testnet' ? 'testnet' : 'mainnet';
    const signerContract = (options && options.signerContract) ||
      (network === 'testnet' ? 'v1.signer-prod.testnet' : 'v1.signer');
    const rootKeyStr = (options && options.rootPublicKey) || NEAR_MPC_MAINNET_ED25519_ROOT_KEY;
    const cleanRoot = String(rootKeyStr).trim().replace(/^ed25519:/, '');
    const rootBytes = base58Decode(cleanRoot);
    if (rootBytes.length !== 32) {
      throw new Error(`Expected 32-byte Ed25519 root public key, got ${rootBytes.length}`);
    }
    const rootPt = edDecodePoint(rootBytes);
    if (!rootPt) {
      throw new Error('Invalid Ed25519 MPC root public key point');
    }

    const derivationInput = `near-mpc-recovery v0.1.0 epsilon derivation:${predecessorId},${cleanPath}`;
    const tweakBytes = sha3_256Bytes(derivationInput);
    const epsilonHex = bytesToHex(tweakBytes);
    const scalar = bytesToLeBigInt(tweakBytes) % ED_L;
    const derivedPt = edAdd(rootPt, edPointScalarMult(scalar, ED_BASE_POINT));
    const derivedBytes = edEncodePoint(derivedPt);
    const mpcSolAddress = base58Encode(derivedBytes);

    return {
      mpcSolAddress,
      predecessorId,
      path: cleanPath,
      domainId: 1,
      signerContract,
      derivedPublicKey: `ed25519:${mpcSolAddress}`,
      epsilonHex
    };
  }

  /**
   * Derives the deterministic Pearl Taproot Bech32m (prl1p...) address controlled by NEAR MPC (`v1.signer`, domain_id: 0).
   */
  function deriveNearMpcPearlAddress(nearAccountId, path = 'pearl-1', options = {}) {
    const pt = deriveNearMpcSecp256k1Point(nearAccountId, path || 'pearl-1', options);
    const mpcPearlAddress = encodeBech32m('prl', 1, pt.xBytes);

    return {
      mpcPearlAddress,
      predecessorId: pt.predecessorId,
      path: pt.path,
      domainId: 0,
      signerContract: pt.signerContract,
      derivedPublicKey: pt.derivedPublicKey,
      epsilonHex: pt.epsilonHex
    };
  }

  /**
   * Derives the deterministic Bitcoin Taproot Bech32m (bc1p...) address controlled by NEAR MPC (`v1.signer`, domain_id: 0).
   */
  function deriveNearMpcBitcoinAddress(nearAccountId, path = 'bitcoin-1', options = {}) {
    const pt = deriveNearMpcSecp256k1Point(nearAccountId, path || 'bitcoin-1', options);
    const mpcBtcAddress = encodeBech32m('bc', 1, pt.xBytes);

    return {
      mpcBtcAddress,
      predecessorId: pt.predecessorId,
      path: pt.path,
      domainId: 0,
      signerContract: pt.signerContract,
      derivedPublicKey: pt.derivedPublicKey,
      epsilonHex: pt.epsilonHex
    };
  }

  /**
   * Derives all external chain addresses (EVM, Solana, Pearl, Bitcoin) controlled by a NEAR Master Account via v1.signer.
   */
  function deriveNearMpcAllAddresses(nearAccountId, options = {}) {
    const evm = deriveNearMpcEvmAddress(nearAccountId, (options && options.evmPath) || 'ethereum-1', options);
    const sol = deriveNearMpcSolanaAddress(nearAccountId, (options && options.solPath) || 'solana-1', options);
    const pearl = deriveNearMpcPearlAddress(nearAccountId, (options && options.pearlPath) || 'pearl-1', options);
    const btc = deriveNearMpcBitcoinAddress(nearAccountId, (options && options.btcPath) || 'bitcoin-1', options);

    return {
      nearAccountId: evm.predecessorId,
      evmAddress: evm.mpcEvmAddress,
      solAddress: sol.mpcSolAddress,
      pearlAddress: pearl.mpcPearlAddress,
      btcAddress: btc.mpcBtcAddress,
      details: { evm, sol, pearl, btc }
    };
  }

  // ======================== Post-Quantum ML-DSA-65 & NEP-655 Universal Accounts ========================

  function getNearMlDsa65Lib() {
    if (typeof globalThis !== 'undefined' && globalThis.NearMlDsa65) {
      return globalThis.NearMlDsa65;
    }
    if (typeof require === 'function') {
      try {
        require('../ml-dsa-65.umd.min.js');
        if (typeof globalThis !== 'undefined' && globalThis.NearMlDsa65) {
          return globalThis.NearMlDsa65;
        }
      } catch (_) {}
    }
    throw new Error(msg('ML-DSA-65 后量子引擎未加载', 'ML-DSA-65 post-quantum engine is not loaded'));
  }

  function encodeCrockfordBase32(bytes) {
    const alphabet = '0123456789abcdefghjkmnpqrstvwxyz';
    let bits = 0;
    let value = 0;
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) {
        out += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      out += alphabet[(value << (5 - bits)) & 31];
    }
    return out;
  }

  function buildUniversalStateInitFromMlDsa65PublicKey(publicKeyStr) {
    const lib = getNearMlDsa65Lib();
    const handleStr = lib.publicKeyToHandle(publicKeyStr);
    const handleBytes = lib.decodePublicKeyHandle(handleStr);
    // UniversalStateInit::V1 { code: None (0x00), data: empty (0x00000000), access_keys: [PublicKeyHandle::MLDSA65(2, handle32)] }
    const rawStateInitBytes = concatUint8Arrays([
      new Uint8Array([0]), // UniversalStateInit::V1
      new Uint8Array([0]), // code: Option::None
      encodeU32LE(0), // data: empty BTreeMap
      encodeU32LE(1), // access_keys: BTreeSet len 1
      new Uint8Array([2]), // PublicKeyHandle::MLDSA65 (KeyType = 2)
      handleBytes
    ]);
    const digest = sha3_256Bytes(rawStateInitBytes);
    const universalAccountId = `0u${encodeCrockfordBase32(digest)}`;
    return {
      rawStateInitBytes,
      publicKeyHandle: handleStr,
      universalAccountId
    };
  }

  async function deriveNearMlDsa65FromMnemonicAsync(mnemonic, index = 0) {
    const checked = validateMnemonic(mnemonic);
    if (!checked.valid) {
      throw new Error(checked.error || 'Invalid mnemonic');
    }
    const normalizedPhrase = checked.words.join(' ');
    const bip39Seed = await cryptoPbkdf2Async(normalizedPhrase, 'mnemonic', 2048, 64);
    const domain = new TextEncoder().encode(`near:ml-dsa-65-seed:v1:${Number(index) || 0}:`);
    const seed32 = sha256Bytes(concatUint8Arrays([domain, bip39Seed]));
    const lib = getNearMlDsa65Lib();
    const signer = lib.signerFromSeed(seed32);
    try {
      const publicKey = signer.publicKey;
      const secretKey = signer.exportSecretKey();
      const { universalAccountId, publicKeyHandle, rawStateInitBytes } = buildUniversalStateInitFromMlDsa65PublicKey(publicKey);
      return {
        mnemonic: normalizedPhrase,
        seedHex: bytesToHex(seed32),
        publicKey,
        publicKeyHandle,
        secretKey,
        universalAccountId,
        rawStateInitHex: bytesToHex(rawStateInitBytes)
      };
    } finally {
      signer.destroy();
    }
  }

  function importNearMlDsa65FromSecretKey(secretKeyStr) {
    const lib = getNearMlDsa65Lib();
    const signer = lib.signerFromSecretKey(String(secretKeyStr || '').trim());
    try {
      const publicKey = signer.publicKey;
      const secretKey = signer.exportSecretKey();
      const { universalAccountId, publicKeyHandle, rawStateInitBytes } = buildUniversalStateInitFromMlDsa65PublicKey(publicKey);
      return {
        publicKey,
        publicKeyHandle,
        secretKey,
        universalAccountId,
        rawStateInitHex: bytesToHex(rawStateInitBytes)
      };
    } finally {
      signer.destroy();
    }
  }

  function decodeNearMlDsa65PublicKey(publicKeyStr) {
    return getNearMlDsa65Lib().decodePublicKey(String(publicKeyStr || '').trim());
  }

  function decodeNearMlDsa65PublicKeyHandle(handleStr) {
    return getNearMlDsa65Lib().decodePublicKeyHandle(String(handleStr || '').trim());
  }

  function signNearHashMlDsa65(hashBytes, secretKeyStr) {
    const lib = getNearMlDsa65Lib();
    const signer = lib.signerFromSecretKey(String(secretKeyStr || '').trim());
    try {
      return signer.signHash(toUint8Array(hashBytes));
    } finally {
      signer.destroy();
    }
  }

  function verifyNearHashMlDsa65(hashBytes, signatureBytes, publicKeyStr) {
    const lib = getNearMlDsa65Lib();
    return lib.verifyHash({
      hash: toUint8Array(hashBytes),
      signature: signatureBytes,
      publicKey: publicKeyStr
    });
  }

  // ======================== Export Bundle ========================

  const NearCACrypto = {
    // 1. BIP-39 Mnemonic & Seed Engine
    getBip39Wordlist,
    getBip39WordSet,
    generateMnemonic,
    validateMnemonic,
    cryptoPbkdf2Async,
    cryptoPbkdf2Sync,
    cryptoHmacSha512Async,
    cryptoHmacSha512Sync,

    // 2. Encoding & Hash Primitives
    sha256Bytes,
    sha256BytesAsync,
    sha512Bytes,
    sha512BytesAsync,
    keccak256Bytes,
    sha3_256Bytes,
    base58Encode,
    base58Decode,
    encodeBech32m,
    decodeBech32m,
    validatePearlAddress,
    eip55ChecksumAddress,
    validateChainAddress,
    detectAddressNetwork,
    bytesToHex,
    hexToBytes,
    bytesToBase64,
    base64ToBytes,

    // 3. Multi-Chain Key Derivation
    deriveNearFromSeedAsync,
    deriveSolanaFromSeedAsync,
    deriveEvmFromSeedAsync,
    derivePearlFromSeedAsync,
    derivePearlFromSeed,
    deriveCandidatePearlAddressesAsync,
    deriveAllChainKeysAsync,

    // 4. Ed25519, Borsh & NEP-413 Intent Signing
    ed25519PublicKeyFromSeedAsync,
    ed25519SignAsync,
    ed25519VerifyAsync,
    encodeBorshString,
    encodeU32LE,
    encodeU64LE,
    encodeU128LE,
    concatUint8Arrays,
    signNep413IntentMessageAsync,

    // 5. NEAR Chain Signatures (v1.signer MPC)
    NEAR_MPC_MAINNET_ROOT_KEY,
    NEAR_MPC_TESTNET_ROOT_KEY,
    NEAR_MPC_MAINNET_ED25519_ROOT_KEY,
    secpPointAdd,
    secpPointMultiply,
    deriveNearMpcEvmAddress,
    deriveNearMpcSolanaAddress,
    deriveNearMpcPearlAddress,
    deriveNearMpcBitcoinAddress,
    deriveNearMpcAllAddresses,

    // 6. Post-Quantum ML-DSA-65 & NEP-655 Universal Accounts
    isNearUniversalAccount,
    encodeCrockfordBase32,
    buildUniversalStateInitFromMlDsa65PublicKey,
    deriveNearMlDsa65FromMnemonicAsync,
    importNearMlDsa65FromSecretKey,
    decodeNearMlDsa65PublicKey,
    decodeNearMlDsa65PublicKeyHandle,
    signNearHashMlDsa65,
    verifyNearHashMlDsa65
  };

  if (root) {
    root.NearCACrypto = NearCACrypto;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.NearCACrypto = NearCACrypto;
  }
  if (typeof window !== 'undefined') {
    window.NearCACrypto = NearCACrypto;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NearCACrypto;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
