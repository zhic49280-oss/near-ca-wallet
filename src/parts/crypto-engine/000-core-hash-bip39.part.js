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
    if (v < 0n || v >= (1n << 64n)) throw new RangeError('u64 out of range');
    for (let i = 0; i < 8; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  function encodeU128LE(n) {
    const out = new Uint8Array(16);
    let v = BigInt(n);
    if (v < 0n || v >= (1n << 128n)) throw new RangeError('u128 out of range');
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
    return (Array.isArray(mnemonic) ? mnemonic.join(' ') : String(mnemonic || ''))
      .replace(/[,，.。;；\s]+/g, ' ')
      .trim()
      .normalize('NFKD')
      .toLowerCase();
  }

  const _pbkdf2Cache = new Map();

  function cryptoPbkdf2Sync(mnemonic, passphrase = '') {
    const passStr = normalizeMnemonicInput(mnemonic);
    const saltSuffix = String(passphrase || '').normalize('NFKD');
    const cacheKey = `${passStr}\u0000${saltSuffix}`;
    if (_pbkdf2Cache.has(cacheKey)) {
      return new Uint8Array(_pbkdf2Cache.get(cacheKey));
    }
    const saltStr = 'mnemonic' + saltSuffix;
    let out;
    if (nodeCrypto && nodeCrypto.pbkdf2Sync) {
      out = new Uint8Array(nodeCrypto.pbkdf2Sync(passStr, saltStr, 2048, 64, 'sha512'));
    } else {
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
      out = T;
    }
    if (_pbkdf2Cache.size >= 64) _pbkdf2Cache.clear();
    _pbkdf2Cache.set(cacheKey, out);
    return new Uint8Array(out);
  }

  async function cryptoPbkdf2Async(mnemonic, passphrase = '') {
    const passStr = normalizeMnemonicInput(mnemonic);
    const saltSuffix = String(passphrase || '').normalize('NFKD');
    const cacheKey = `${passStr}\u0000${saltSuffix}`;
    if (_pbkdf2Cache.has(cacheKey)) {
      return new Uint8Array(_pbkdf2Cache.get(cacheKey));
    }
    const saltStr = 'mnemonic' + saltSuffix;
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
        const out = new Uint8Array(bits);
        if (_pbkdf2Cache.size >= 64) _pbkdf2Cache.clear();
        _pbkdf2Cache.set(cacheKey, out);
        return new Uint8Array(out);
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
    if (wordlist.length !== 2048) {
      throw new Error(msg('助记词词库未加载，无法安全生成助记词', 'Full recovery wordlist unavailable'));
    }
    const len = Number(length) || 12;
    if (![12, 15, 18, 21, 24].includes(len)) {
      throw new Error(msg('助记词长度必须为 12 / 15 / 18 / 21 / 24 词', 'Mnemonic length must be 12, 15, 18, 21, or 24 words'));
    }
    const entBits = (len * 11 * 32) / 33;
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
    for (let i = 0; i < len; i++) {
      let idx = 0;
      for (let b = 0; b < 11; b++) {
        idx = (idx << 1) | bits[i * 11 + b];
      }
      words.push(wordlist[idx]);
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

    if (![12, 15, 18, 21, 24].includes(words.length)) {
      return {
        valid: false,
        error: msg(
          `助记词数量不正确：检测到 ${words.length} 个单词，应为 12 / 15 / 18 / 21 / 24 个英文单词`,
          `Invalid word count: expected 12, 15, 18, 21, or 24 words, got ${words.length}`
        ),
        invalidWords: []
      };
    }

    const wordSet = getBip39WordSet();
    const invalidWords = [];
    for (let i = 0; i < words.length; i++) {
      const raw = words[i];
      const lower = raw.normalize('NFKD').toLowerCase();
      if (!/^[a-z]+$/.test(lower) || !wordSet.has(lower)) {
        invalidWords.push({ index: i + 1, word: raw });
      }
    }

    if (invalidWords.length > 0) {
      const invalidDetails = invalidWords.map(x => `#${x.index} "${x.word}"`).join(', ');
      return {
        valid: false,
        error: msg(
          `助记词包含无效单词：${invalidDetails}，请核对拼写`,
          `Invalid recovery words found: ${invalidDetails}`
        ),
        invalidWords
      };
    }

    const normalized = words.map(w => w.normalize('NFKD').toLowerCase());
    const checksumValid = verifyBip39Checksum(normalized);
    if (!checksumValid) {
      return {
        valid: false,
        error: msg('助记词校验未通过，请检查单词拼写或顺序', 'Invalid recovery phrase; check word spelling or order'),
        words: normalized,
        checksumValid: false
      };
    }
    return {
      valid: true,
      words: normalized,
      checksumValid: true
    };
  }

