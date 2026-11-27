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
    const predecessorId = String(nearAccountId || '').trim().toLowerCase();
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
    const predecessorId = String(nearAccountId || '').trim().toLowerCase();
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
   * @deprecated Legacy MPC secp256k1 helper only. Do NOT use for Taproot (BIP-340 Schnorr) wallets.
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
   * @deprecated Legacy MPC secp256k1 helper only. Wallets use self-custody BIP-86 (deriveBitcoinFromSeed).
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

  const _mpcAllCache = new Map();

  /**
   * Derives external chain addresses (EVM, Solana) controlled by a NEAR Master Account via v1.signer.
   * Legacy Pearl/BTC MPC derivation is skipped on the hot path unless options.includeLegacy is true.
   */
  function deriveNearMpcAllAddresses(nearAccountId, options = {}) {
    const normId = String(nearAccountId || '').trim().toLowerCase();
    const cacheKey = `${normId}|${JSON.stringify(options || {})}`;
    if (_mpcAllCache.has(cacheKey)) {
      return _mpcAllCache.get(cacheKey);
    }
    const evm = deriveNearMpcEvmAddress(normId, (options && options.evmPath) || 'ethereum-1', options);
    const sol = deriveNearMpcSolanaAddress(normId, (options && options.solPath) || 'solana-1', options);
    const out = {
      nearAccountId: evm.predecessorId,
      evmAddress: evm.mpcEvmAddress,
      solAddress: sol.mpcSolAddress,
      details: { evm, sol }
    };
    if (options && options.includeLegacy === true) {
      const pearl = deriveNearMpcPearlAddress(normId, options.pearlPath || 'pearl-1', options);
      const btc = deriveNearMpcBitcoinAddress(normId, options.btcPath || 'bitcoin-1', options);
      out.pearlAddress = pearl.mpcPearlAddress;
      out.btcAddress = btc.mpcBtcAddress;
      out.details.pearl = pearl;
      out.details.btc = btc;
    }
    if (_mpcAllCache.size >= 64) _mpcAllCache.clear();
    _mpcAllCache.set(cacheKey, out);
    return out;
  }

  // ======================== Local Vault Encryption & PIN Hashing ========================

  const VAULT_PBKDF2_ITERATIONS = 100000;

  function getSubtleCrypto() {
    const gCrypto = (typeof globalThis !== 'undefined' && globalThis.crypto) ||
      (typeof window !== 'undefined' && window.crypto) ||
      (nodeCrypto && nodeCrypto.webcrypto) ||
      null;
    if (gCrypto && gCrypto.subtle) return gCrypto.subtle;
    throw new Error('WebCrypto subtle API is unavailable');
  }

  async function deriveVaultAesKeyAsync(passphrase, saltBytes, iterations = VAULT_PBKDF2_ITERATIONS) {
    const passStr = String(passphrase || '');
    if (!passStr) throw new Error('Vault passphrase is required');
    const subtle = getSubtleCrypto();
    const passBytes = new TextEncoder().encode(passStr);
    const baseKey = await subtle.importKey('raw', passBytes, 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt: toUint8Array(saltBytes), iterations, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptVaultSecretsAsync(secretsObj, passphrase) {
    const salt = getRandomBytes(16);
    const iv = getRandomBytes(12);
    const key = await deriveVaultAesKeyAsync(passphrase, salt, VAULT_PBKDF2_ITERATIONS);
    const plaintext = new TextEncoder().encode(JSON.stringify(secretsObj || {}));
    const ctBuf = await getSubtleCrypto().encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return {
      v: 1,
      alg: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iter: VAULT_PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ct: bytesToBase64(new Uint8Array(ctBuf))
    };
  }

  async function decryptVaultSecretsAsync(envelope, passphrase) {
    if (!envelope || typeof envelope !== 'object' || !envelope.ct || !envelope.iv || !envelope.salt) {
      throw new Error('Invalid vault envelope');
    }
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ct = base64ToBytes(envelope.ct);
    const iter = Number(envelope.iter) > 0 ? Number(envelope.iter) : VAULT_PBKDF2_ITERATIONS;
    const key = await deriveVaultAesKeyAsync(passphrase, salt, iter);
    const ptBuf = await getSubtleCrypto().decrypt({ name: 'AES-GCM', iv }, key, ct);
    return JSON.parse(new TextDecoder().decode(new Uint8Array(ptBuf)));
  }

  async function hashPinAsync(pin) {
    const pinStr = String(pin || '');
    if (!pinStr) throw new Error('PIN is required');
    const salt = getRandomBytes(16);
    const iter = VAULT_PBKDF2_ITERATIONS;
    const subtle = getSubtleCrypto();
    const baseKey = await subtle.importKey('raw', new TextEncoder().encode(pinStr), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
      baseKey,
      256
    );
    return {
      v: 1,
      kdf: 'PBKDF2-SHA256',
      iter,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(new Uint8Array(bits))
    };
  }

  async function verifyPinAsync(pin, storedRecord) {
    if (!pin || !storedRecord || typeof storedRecord !== 'object' || !storedRecord.salt || !storedRecord.hash) {
      return false;
    }
    try {
      const salt = base64ToBytes(storedRecord.salt);
      const expected = base64ToBytes(storedRecord.hash);
      const iter = Number(storedRecord.iter) > 0 ? Number(storedRecord.iter) : VAULT_PBKDF2_ITERATIONS;
      const subtle = getSubtleCrypto();
      const baseKey = await subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
        baseKey,
        256
      );
      const actual = new Uint8Array(bits);
      if (actual.length !== expected.length) return false;
      let diff = 0;
      for (let i = 0; i < actual.length; i += 1) {
        diff |= actual[i] ^ expected[i];
      }
      return diff === 0;
    } catch (_) {
      return false;
    }
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
    base58CheckDecode,
    encodeBech32m,
    decodeBech32,
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
    deriveNearFromSeed,
    deriveSolanaFromSeedAsync,
    deriveEvmFromSeedAsync,
    derivePearlFromSeedAsync,
    derivePearlFromSeed,
    deriveBitcoinFromSeedAsync,
    deriveBitcoinFromSeed,
    deriveCandidatePearlAddressesAsync,
    deriveAllChainKeysAsync,
    taggedHash,
    signSchnorrBip340,
    verifySchnorrBip340,

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

    // 6. Local Vault Encryption & PIN Hashing
    encryptVaultSecretsAsync,
    decryptVaultSecretsAsync,
    hashPinAsync,
    verifyPinAsync
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
