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

  function secpJacDouble(P) {
    if (!P || P.y === 0n || P.z === 0n) return null;
    const X1 = P.x;
    const Y1 = P.y;
    const Z1 = P.z;
    const A = secpMod(X1 * X1);
    const B = secpMod(Y1 * Y1);
    const C = secpMod(B * B);
    const xPlusB = secpMod(X1 + B);
    const D = secpMod(2n * (secpMod(xPlusB * xPlusB) - A - C));
    const E = secpMod(3n * A);
    const F = secpMod(E * E);
    const X3 = secpMod(F - 2n * D);
    const Y3 = secpMod(E * (D - X3) - 8n * C);
    const Z3 = secpMod(2n * Y1 * Z1);
    if (Z3 === 0n) return null;
    return { x: X3, y: Y3, z: Z3 };
  }

  function secpJacAdd(P, Q) {
    if (!P || P.z === 0n) return Q;
    if (!Q || Q.z === 0n) return P;
    const Z1Z1 = secpMod(P.z * P.z);
    const Z2Z2 = secpMod(Q.z * Q.z);
    const U1 = secpMod(P.x * Z2Z2);
    const U2 = secpMod(Q.x * Z1Z1);
    const S1 = secpMod(P.y * Q.z * Z2Z2);
    const S2 = secpMod(Q.y * P.z * Z1Z1);
    const H = secpMod(U2 - U1);
    const r = secpMod(2n * (S2 - S1));
    if (H === 0n) {
      return r === 0n ? secpJacDouble(P) : null;
    }
    const twoH = secpMod(2n * H);
    const I = secpMod(twoH * twoH);
    const J = secpMod(H * I);
    const V = secpMod(U1 * I);
    const X3 = secpMod(r * r - J - 2n * V);
    const Y3 = secpMod(r * (V - X3) - 2n * S1 * J);
    const zSum = secpMod(P.z + Q.z);
    const Z3 = secpMod((secpMod(zSum * zSum) - Z1Z1 - Z2Z2) * H);
    if (Z3 === 0n) return null;
    return { x: X3, y: Y3, z: Z3 };
  }

  function secpJacToAffine(P) {
    if (!P || P.z === 0n) return null;
    const zInv = secpModInverse(P.z);
    const zInv2 = secpMod(zInv * zInv);
    const zInv3 = secpMod(zInv2 * zInv);
    return {
      x: secpMod(P.x * zInv2),
      y: secpMod(P.y * zInv3)
    };
  }

  function secpPointAdd(p1, p2) {
    if (!p1) return p2;
    if (!p2) return p1;
    if (p1.x === p2.x && secpMod(p1.y + p2.y) === 0n) return null;
    let m;
    if (p1.x === p2.x && p1.y === p2.y) {
      if (p1.y === 0n) return null;
      m = secpMod(3n * p1.x * p1.x * secpModInverse(2n * p1.y));
    } else {
      m = secpMod((p2.y - p1.y) * secpModInverse(p2.x - p1.x));
    }
    const x3 = secpMod(m * m - p1.x - p2.x);
    const y3 = secpMod(m * (p1.x - x3) - p1.y);
    return { x: x3, y: y3 };
  }

  function secpPointMultiply(k, p = { x: SECP256K1_GX, y: SECP256K1_GY }) {
    if (!p) return null;
    let scalar = secpMod(k, SECP256K1_N);
    if (scalar === 0n) return null;
    let curr = { x: p.x, y: p.y, z: 1n };
    let res = null;
    while (scalar > 0n) {
      if (scalar & 1n) res = secpJacAdd(res, curr);
      scalar >>= 1n;
      if (scalar > 0n) curr = secpJacDouble(curr);
    }
    return secpJacToAffine(res);
  }

  function bip32DeriveMasterKey(seedBytes) {
    const enc = new TextEncoder();
    const IBytes = cryptoHmacSha512Sync(enc.encode('Bitcoin seed'), seedBytes);
    const k = BigInt('0x' + bytesToHex(IBytes.slice(0, 32)));
    if (k === 0n || k >= SECP256K1_N) throw new Error('Invalid BIP-32 master key');
    return { privateKey: IBytes.slice(0, 32), chainCode: IBytes.slice(32) };
  }

  async function bip32DeriveMasterKeyAsync(seedBytes) {
    const enc = new TextEncoder();
    const IBytes = await cryptoHmacSha512Async(enc.encode('Bitcoin seed'), seedBytes);
    const k = BigInt('0x' + bytesToHex(IBytes.slice(0, 32)));
    if (k === 0n || k >= SECP256K1_N) throw new Error('Invalid BIP-32 master key');
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
    const ilNum = BigInt('0x' + bytesToHex(IL));
    if (ilNum === 0n || ilNum >= SECP256K1_N) {
      throw new Error('Invalid BIP-32 IL scalar derived');
    }
    const ki = secpMod(
      ilNum + BigInt('0x' + bytesToHex(parent.privateKey)),
      SECP256K1_N
    );
    if (ki === 0n) throw new Error('Invalid BIP-32 child key derived');
    return {
      privateKey: hexToBytes(ki.toString(16).padStart(64, '0')),
      chainCode: IR
    };
  }

  function parseBip32PathSegments(pathStr) {
    const parts = String(pathStr || '').trim().split('/');
    if (parts[0] !== 'm' || parts.length < 2) {
      throw new Error(`Invalid BIP-32 derivation path: ${pathStr}`);
    }
    return parts.slice(1).map((part) => {
      const m = part.match(/^(\d+)(['hH]?)$/);
      if (!m) throw new Error(`Invalid BIP-32 path segment: ${part}`);
      const index = Number(m[1]);
      if (!Number.isInteger(index) || index < 0 || index >= 0x80000000) {
        throw new Error(`BIP-32 index out of range: ${part}`);
      }
      return { index, hardened: Boolean(m[2]) };
    });
  }

  function bip32DerivePath(master, pathStr) {
    const segments = parseBip32PathSegments(pathStr);
    let curr = master;
    for (const { index, hardened } of segments) {
      const dataBytes = buildBip32ChildInput(curr, index, hardened);
      curr = finishBip32Child(curr, cryptoHmacSha512Sync(curr.chainCode, dataBytes));
    }
    return curr;
  }

  async function bip32DerivePathAsync(master, pathStr) {
    const segments = parseBip32PathSegments(pathStr);
    let curr = master;
    for (const { index, hardened } of segments) {
      const dataBytes = buildBip32ChildInput(curr, index, hardened);
      curr = finishBip32Child(curr, await cryptoHmacSha512Async(curr.chainCode, dataBytes));
    }
    return curr;
  }

  function taggedHash(tag, msgBytes) {
    const tagHash = sha256Bytes(tag);
    const combined = new Uint8Array(64 + msgBytes.length);
    combined.set(tagHash, 0);
    combined.set(tagHash, 32);
    combined.set(msgBytes, 64);
    return sha256Bytes(combined);
  }

  function tapTweakHash(pubKeyXBytes) {
    return taggedHash('TapTweak', pubKeyXBytes);
  }

  function signSchnorrBip340(msg32Bytes, privKeyInput, auxRand32 = null) {
    const msgBytes = msg32Bytes instanceof Uint8Array ? msg32Bytes : hexToBytes(String(msg32Bytes || ''));
    if (msgBytes.length !== 32) throw new Error('BIP-340 message must be 32 bytes');
    const privHex = typeof privKeyInput === 'string'
      ? privKeyInput.replace(/^0x/i, '').padStart(64, '0')
      : bytesToHex(privKeyInput).padStart(64, '0');
    const d0 = BigInt('0x' + privHex);
    if (d0 <= 0n || d0 >= SECP256K1_N) throw new Error('Invalid BIP-340 private key');
    const P = secpPointMultiply(d0);
    const d = (P.y % 2n === 0n) ? d0 : (SECP256K1_N - d0);
    const dBytes = hexToBytes(d.toString(16).padStart(64, '0'));
    const pXBytes = hexToBytes(P.x.toString(16).padStart(64, '0'));

    const aux = auxRand32 instanceof Uint8Array && auxRand32.length === 32
      ? auxRand32
      : getRandomBytes(32);
    const auxHash = taggedHash('BIP0340/aux', aux);
    const t = new Uint8Array(32);
    for (let i = 0; i < 32; i++) t[i] = dBytes[i] ^ auxHash[i];

    const rand = taggedHash('BIP0340/nonce', concatUint8Arrays([t, pXBytes, msgBytes]));
    const k0 = BigInt('0x' + bytesToHex(rand)) % SECP256K1_N;
    if (k0 === 0n) throw new Error('BIP-340 nonce generation failed');
    const R = secpPointMultiply(k0);
    const k = (R.y % 2n === 0n) ? k0 : (SECP256K1_N - k0);
    const rXBytes = hexToBytes(R.x.toString(16).padStart(64, '0'));

    const eHash = taggedHash('BIP0340/challenge', concatUint8Arrays([rXBytes, pXBytes, msgBytes]));
    const e = BigInt('0x' + bytesToHex(eHash)) % SECP256K1_N;
    const s = secpMod(k + e * d, SECP256K1_N);
    const sBytes = hexToBytes(s.toString(16).padStart(64, '0'));
    return concatUint8Arrays([rXBytes, sBytes]);
  }

  function liftXSecp256k1(x) {
    if (x < 0n || x >= SECP256K1_P) return null;
    const ySq = secpMod(edPow(x, 3n, SECP256K1_P) + 7n, SECP256K1_P);
    const y = edPow(ySq, (SECP256K1_P + 1n) / 4n, SECP256K1_P);
    if (secpMod(y * y, SECP256K1_P) !== ySq) return null;
    return { x, y: (y % 2n === 0n) ? y : (SECP256K1_P - y) };
  }

  function verifySchnorrBip340(sig64Bytes, msg32Bytes, pubKeyX32Bytes) {
    const sig = sig64Bytes instanceof Uint8Array ? sig64Bytes : hexToBytes(String(sig64Bytes || ''));
    const msg = msg32Bytes instanceof Uint8Array ? msg32Bytes : hexToBytes(String(msg32Bytes || ''));
    const pkX = pubKeyX32Bytes instanceof Uint8Array ? pubKeyX32Bytes : hexToBytes(String(pubKeyX32Bytes || ''));
    if (sig.length !== 64 || msg.length !== 32 || pkX.length !== 32) return false;
    const P = liftXSecp256k1(BigInt('0x' + bytesToHex(pkX)));
    if (!P) return false;
    const r = BigInt('0x' + bytesToHex(sig.slice(0, 32)));
    const s = BigInt('0x' + bytesToHex(sig.slice(32, 64)));
    if (r >= SECP256K1_P || s >= SECP256K1_N) return false;
    const eHash = taggedHash('BIP0340/challenge', concatUint8Arrays([sig.slice(0, 32), pkX, msg]));
    const e = BigInt('0x' + bytesToHex(eHash)) % SECP256K1_N;
    const sG = secpPointMultiply(s);
    const eP = e === 0n ? null : secpPointMultiply(e, P);
    const negEP = eP ? { x: eP.x, y: secpMod(SECP256K1_P - eP.y, SECP256K1_P) } : null;
    const R = secpPointAdd(sG, negEP);
    if (!R || R.y % 2n !== 0n || R.x !== r) return false;
    return true;
  }

  function privateKeyToTaprootAddress(privBytes, useTapTweak = true, path = "m/86'/808276'/0'/0/0", hrp = 'prl') {
    const privHex = bytesToHex(privBytes);
    let priv = BigInt('0x' + privHex);
    if (priv <= 0n || priv >= SECP256K1_N) {
      throw new Error('Invalid Taproot private key scalar');
    }
    let pt = secpPointMultiply(priv);
    if (!pt) throw new Error('Invalid Taproot public key');

    if (useTapTweak) {
      if (pt.y % 2n !== 0n) {
        priv = secpMod(SECP256K1_N - priv, SECP256K1_N);
        pt = { x: pt.x, y: secpMod(SECP256K1_P - pt.y, SECP256K1_P) };
      }
      const pxHex = pt.x.toString(16).padStart(64, '0');
      const pxBytes = hexToBytes(pxHex);
      const tBytes = tapTweakHash(pxBytes);
      const tBig = BigInt('0x' + bytesToHex(tBytes));
      if (tBig >= SECP256K1_N) {
        throw new Error('Invalid BIP-341 TapTweak scalar >= n');
      }
      const tPt = secpPointMultiply(tBig);
      const Q = secpPointAdd(pt, tPt);
      if (!Q) throw new Error('Invalid BIP-341 tweaked point at infinity');
      const qxHex = Q.x.toString(16).padStart(64, '0');
      const qxBytes = Array.from(hexToBytes(qxHex));
      const address = encodeBech32m(hrp, 1, qxBytes);
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
    const address = encodeBech32m(hrp, 1, xBytes);
    return {
      address,
      privateKeyHex: `0x${privHex}`,
      pubkeyHex: xHex,
      path
    };
  }

