'use strict';

const {
  test,
  assert,
  fs,
  path,
  nodeCrypto,
  ROOT_DIR,
  cryptoEngine,
  tokenRegistry,
  nearIntents,
  chainContracts,
  limitOrders,
  hlPerps,
  miningPro,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  createMemoryStorage,
  withMockedStorage,
  readBorshString,
  INITIAL_STAKING_SNAPSHOT,
  createMockClassList,
  createMockDomElement
} = require('./helpers.js');

// ==================== Module 1: src/crypto-engine.js ====================

test('Module 1: BIP-39 12-word and 24-word mnemonic generation & checksum validation', () => {
  const wordlist = cryptoEngine.getBip39Wordlist();
  assert.equal(wordlist.length, 2048, 'Full 2048-word BIP-39 wordlist should be loaded');

  const m12 = cryptoEngine.generateMnemonic(12);
  assert.equal(m12.length, 12);
  const v12 = cryptoEngine.validateMnemonic(m12);
  assert.equal(v12.valid, true);
  assert.equal(v12.checksumValid, true);
  assert.equal(v12.words.length, 12);

  const m24 = cryptoEngine.generateMnemonic(24);
  assert.equal(m24.length, 24);
  const v24 = cryptoEngine.validateMnemonic(m24.join(' '));
  assert.equal(v24.valid, true);
  assert.equal(v24.checksumValid, true);
  assert.equal(v24.words.length, 24);

  // Known valid 12-word checksum
  const knownValid = cryptoEngine.validateMnemonic(TEST_MNEMONIC);
  assert.equal(knownValid.valid, true);
  assert.equal(knownValid.checksumValid, true);

  // Mutating last word breaks BIP-39 checksum while words remain in wordlist
  const badChecksum = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon';
  const vBadCs = cryptoEngine.validateMnemonic(badChecksum);
  assert.equal(vBadCs.valid, false);
  assert.equal(vBadCs.checksumValid, false);

  // Unknown BIP-39 word fails validation with invalidWords detail
  const vUnknown = cryptoEngine.validateMnemonic('abandon abandon notaword abandon abandon abandon abandon abandon abandon abandon abandon about');
  assert.equal(vUnknown.valid, false);
  assert.equal(vUnknown.invalidWords.length, 1);
  assert.equal(vUnknown.invalidWords[0].index, 3);

  // Invalid word count fails validation
  const vShort = cryptoEngine.validateMnemonic('abandon ability able');
  assert.equal(vShort.valid, false);
});

test('Module 1: Multi-chain derivation (Pure NEAR Master + v1.signer MPC) & low-level BIP/SLIP vectors', async () => {
  const all = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const nearOnly = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC, 0);
  const solOnly = await cryptoEngine.deriveSolanaFromSeedAsync(TEST_MNEMONIC, 0);
  const evmOnly = await cryptoEngine.deriveEvmFromSeedAsync(TEST_MNEMONIC);
  const pearlOnly = await cryptoEngine.derivePearlFromSeedAsync(TEST_MNEMONIC);

  // NEAR SLIP-0010 m/44'/397'/0' (Single Master Account)
  assert.equal(all.near.path, "m/44'/397'/0'");
  assert.equal(all.nearAddress, '5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412');
  assert.equal(all.nearPublicKey, 'ed25519:6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25');
  assert.equal(all.nearPrivateKey, 'ed25519:F1kPR175szkGxEL52A9H6Z5ocS2BtaipprK2Hiob9DjGzHTkScrBb1yt44baXPZ3LxyHcsTPdBjHmn6zx147txH');
  assert.equal(all.nearPrivateSeedHex, '0c158d858a52316667d03d1d04aad51b3b542cd705215810629b78c501492fba');
  assert.deepEqual(all.near, nearOnly);

  // deriveAllChainKeysAsync derives EVM/Solana via MPC from NEAR Master Account, and Pearl/Bitcoin locally via BIP-86
  const expectedMpc = cryptoEngine.deriveNearMpcAllAddresses(all.nearAddress);
  const btcOnly = await cryptoEngine.deriveBitcoinFromSeedAsync(TEST_MNEMONIC);
  assert.equal(all.evmAddress, expectedMpc.evmAddress);
  assert.equal(all.mpcEvmAddress, expectedMpc.evmAddress);
  assert.equal(all.solAddress, expectedMpc.solAddress);
  assert.equal(all.pearlAddress, 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74');
  assert.equal(all.btcAddress, btcOnly.address);
  assert.equal(all.btcAddress, 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
  assert.equal(cryptoEngine.validatePearlAddress(all.pearlAddress).valid, true);
  assert.equal(cryptoEngine.validateChainAddress('btc', all.btcAddress).valid, true);

  // Low-level SLIP-0010 / BIP-44 / BIP-86 helpers remain deterministic for backward compatibility
  assert.equal(solOnly.path, "m/44'/501'/0'/0'");
  assert.equal(solOnly.solAddress, 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk');
  assert.equal(solOnly.solPrivateKey, '27npWoNE4HfmLeQo1TyWcW7NEA28qnsnDK7kcttDQEWrCWnro83HMJ97rMmpvYYZRwDAvG4KRuB7hTBacvwD7bgi');
  const solSecretBytes = cryptoEngine.base58Decode(solOnly.solPrivateKey);
  assert.equal(solSecretBytes.length, 64);
  assert.equal(cryptoEngine.base58Encode(solSecretBytes.slice(32)), solOnly.solAddress);

  assert.equal(evmOnly.address, '0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
  assert.match(evmOnly.privateKeyHex, /^0x[0-9a-f]{64}$/);

  assert.equal(pearlOnly.address, 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74');
  assert.ok(pearlOnly.address.startsWith('prl1p'));
  const prlCheck = cryptoEngine.validatePearlAddress(pearlOnly.address);
  assert.equal(prlCheck.valid, true);
  assert.equal(prlCheck.decoded.hrp, 'prl');
  assert.equal(prlCheck.decoded.witnessVersion, 1);
  assert.equal(prlCheck.decoded.programBytes.length, 32);
});

test('Module 1: RFC 8032 Ed25519 sign & verify round-trip + standard RFC 8032 vector', async () => {
  const keys = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC, 0);
  const messageBytes = new TextEncoder().encode('NEAR Chain Abstraction RFC8032 Round-Trip');

  const derivedPub = await cryptoEngine.ed25519PublicKeyFromSeedAsync(keys.nearPrivateSeedHex);
  assert.equal(cryptoEngine.bytesToHex(derivedPub), keys.nearAddress);

  const signature = await cryptoEngine.ed25519SignAsync(messageBytes, keys.nearPrivateSeedHex);
  assert.equal(signature.length, 64);

  assert.equal(await cryptoEngine.ed25519VerifyAsync(signature, messageBytes, keys.nearPublicKey), true);
  assert.equal(await cryptoEngine.ed25519VerifyAsync(signature, messageBytes, derivedPub), true);

  // Tamper message and signature
  const tamperedMsg = new Uint8Array(messageBytes);
  tamperedMsg[0] ^= 0xff;
  assert.equal(await cryptoEngine.ed25519VerifyAsync(signature, tamperedMsg, keys.nearPublicKey), false);

  const tamperedSig = new Uint8Array(signature);
  tamperedSig[63] ^= 0x01;
  assert.equal(await cryptoEngine.ed25519VerifyAsync(tamperedSig, messageBytes, keys.nearPublicKey), false);

  // RFC 8032 Section 7.1 TEST 1 (empty message)
  const rfcSeed = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
  const rfcPubHex = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
  const rfcExpectedSigHex =
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
    '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
  const rfcPub = await cryptoEngine.ed25519PublicKeyFromSeedAsync(rfcSeed);
  assert.equal(cryptoEngine.bytesToHex(rfcPub), rfcPubHex);
  const rfcSig = await cryptoEngine.ed25519SignAsync(new Uint8Array(0), rfcSeed);
  assert.equal(cryptoEngine.bytesToHex(rfcSig), rfcExpectedSigHex);
  assert.equal(await cryptoEngine.ed25519VerifyAsync(rfcSig, new Uint8Array(0), rfcPub), true);
});

test('Module 1: NEP-413 Intent Message Signing verifies Borsh prefix, nonce, recipient, digest & Ed25519 signature', async () => {
  const keys = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC, 0);
  const intentMsg = JSON.stringify({
    signer_id: keys.nearAddress,
    deadline: '2026-12-31T23:59:59.000Z',
    intents: [{ intent: 'transfer', receiver_id: 'alice.near', tokens: { 'nep141:wrap.near': '1000' } }]
  });
  const fixedNonce = new Uint8Array(32);
  for (let i = 0; i < 32; i++) fixedNonce[i] = (i * 7 + 3) & 0xff;

  const signed = await cryptoEngine.signNep413IntentMessageAsync({
    message: intentMsg,
    recipient: 'intents.near',
    nonceBytes: fixedNonce,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    nearPublicKey: keys.nearPublicKey
  });

  assert.equal(signed.recipient, 'intents.near');
  assert.equal(signed.publicKey, keys.nearPublicKey);
  assert.equal(signed.nonceBase64, cryptoEngine.bytesToBase64(fixedNonce));
  assert.equal(cryptoEngine.base64ToBytes(signed.nonceBase64).length, 32);
  assert.ok(signed.signature.startsWith('ed25519:'));

  // Independently construct Borsh bytes: u32LE(2^31 + 413) || borshString(msg) || nonce(32) || borshString('intents.near') || Option::None(0)
  const tagBuf = Buffer.alloc(4);
  tagBuf.writeUInt32LE((2 ** 31) + 413, 0);
  assert.equal(tagBuf.toString('hex'), '9d010080');

  const msgBuf = Buffer.from(intentMsg, 'utf8');
  const msgLenBuf = Buffer.alloc(4);
  msgLenBuf.writeUInt32LE(msgBuf.length, 0);

  const recBuf = Buffer.from('intents.near', 'utf8');
  const recLenBuf = Buffer.alloc(4);
  recLenBuf.writeUInt32LE(recBuf.length, 0);

  const preimage = Buffer.concat([
    tagBuf,
    msgLenBuf,
    msgBuf,
    Buffer.from(fixedNonce),
    recLenBuf,
    recBuf,
    Buffer.from([0])
  ]);
  const expectedDigest = nodeCrypto.createHash('sha256').update(preimage).digest();
  assert.equal(signed.payloadHashHex, expectedDigest.toString('hex'));

  const sigBytes = cryptoEngine.base58Decode(signed.signature.replace(/^ed25519:/, ''));
  assert.equal(sigBytes.length, 64);
  assert.equal(await cryptoEngine.ed25519VerifyAsync(sigBytes, expectedDigest, keys.nearPublicKey), true);

  // Also test Option::Some callbackUrl Borsh encoding
  const cbUrl = 'https://pearlwallet.example/cb';
  const signedWithCb = await cryptoEngine.signNep413IntentMessageAsync({
    message: intentMsg,
    recipient: 'intents.near',
    nonceBytes: fixedNonce,
    callbackUrl: cbUrl,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    nearPublicKey: keys.nearPublicKey
  });
  const cbBuf = Buffer.from(cbUrl, 'utf8');
  const cbLenBuf = Buffer.alloc(4);
  cbLenBuf.writeUInt32LE(cbBuf.length, 0);
  const preimageWithCb = Buffer.concat([
    tagBuf,
    msgLenBuf,
    msgBuf,
    Buffer.from(fixedNonce),
    recLenBuf,
    recBuf,
    Buffer.from([1]),
    cbLenBuf,
    cbBuf
  ]);
  const expectedCbDigest = nodeCrypto.createHash('sha256').update(preimageWithCb).digest();
  assert.equal(signedWithCb.payloadHashHex, expectedCbDigest.toString('hex'));
  const cbSigBytes = cryptoEngine.base58Decode(signedWithCb.signature.replace(/^ed25519:/, ''));
  assert.equal(await cryptoEngine.ed25519VerifyAsync(cbSigBytes, expectedCbDigest, keys.nearPublicKey), true);

  // Invalid nonce length must throw
  await assert.rejects(
    () =>
      cryptoEngine.signNep413IntentMessageAsync({
        message: 'hello',
        nonceBytes: new Uint8Array(16),
        nearPrivateSeedHex: keys.nearPrivateSeedHex
      }),
    /32 bytes/
  );
});

test('Module 1: NEAR MPC Chain Signatures (EVM, Solana, Pearl, Bitcoin) match live mainnet v1.signer', () => {
  const res = cryptoEngine.deriveNearMpcEvmAddress('alice.near', 'ethereum-1');
  assert.equal(res.signerContract, 'v1.signer');
  assert.equal(res.predecessorId, 'alice.near');
  assert.equal(res.path, 'ethereum-1');
  assert.equal(res.domainId, 0);
  assert.equal(res.mpcEvmAddress, '0xa2869D3977DEa9afc9B9c069491ac08F06F9e458');
  assert.equal(
    res.derivedPublicKey,
    'secp256k1:DgDjtBvj99cpBDZg5C6gozLEX2qdbYZxdPGaWehvFo8fDCCu5A2k8EnZ1VQYBWkfb35LRHsvSgAkuhFk3raaGTb'
  );

  // Different path derives a different deterministic EIP-55 address
  const baseRes = cryptoEngine.deriveNearMpcEvmAddress('alice.near', 'base-1');
  assert.match(baseRes.mpcEvmAddress, /^0x[0-9a-fA-F]{40}$/);
  assert.notEqual(baseRes.mpcEvmAddress, res.mpcEvmAddress);

  // Solana Ed25519 (domain_id: 1) verified bit-for-bit against live v1.signer
  const solRes = cryptoEngine.deriveNearMpcSolanaAddress('alice.near', 'solana-1');
  assert.equal(solRes.domainId, 1);
  assert.equal(solRes.signerContract, 'v1.signer');
  assert.equal(solRes.mpcSolAddress, 'HQmZYaq41vBMykpmg7Y8gHyuARUmRBeokPakEBpWvx2A');
  assert.equal(solRes.derivedPublicKey, 'ed25519:HQmZYaq41vBMykpmg7Y8gHyuARUmRBeokPakEBpWvx2A');

  // Pearl Taproot (domain_id: 0) verified against live v1.signer
  const prlRes = cryptoEngine.deriveNearMpcPearlAddress('alice.near', 'pearl-1');
  assert.equal(prlRes.domainId, 0);
  assert.equal(
    prlRes.derivedPublicKey,
    'secp256k1:3jenHJSh2yRchBkbqxSW56DFyJ1NEdMNBFWgbomiRx93DBquDXo5qobKtkByfzLmiqPm9Q2N8sqiTY6k5ifT8qEi'
  );
  assert.ok(prlRes.mpcPearlAddress.startsWith('prl1p'));
  assert.equal(cryptoEngine.validatePearlAddress(prlRes.mpcPearlAddress).valid, true);

  // Bitcoin Taproot (domain_id: 0) verified against live v1.signer
  const btcRes = cryptoEngine.deriveNearMpcBitcoinAddress('alice.near', 'bitcoin-1');
  assert.equal(btcRes.domainId, 0);
  assert.equal(
    btcRes.derivedPublicKey,
    'secp256k1:4ypfoibiC57fzbYaq56SyXVnjZ8i6hNCwm8vF9XRuJcaYAyKAacgRWFZEfAEFmPt4ky6MZx3yL2Qsjg5MZZkkQue'
  );
  assert.ok(btcRes.mpcBtcAddress.startsWith('bc1p'));
  assert.equal(cryptoEngine.validateChainAddress('btc', btcRes.mpcBtcAddress).valid, true);

  // Unified deriveNearMpcAllAddresses bundle
  const mpcAll = cryptoEngine.deriveNearMpcAllAddresses('alice.near');
  assert.equal(mpcAll.nearAccountId, 'alice.near');
  assert.equal(mpcAll.evmAddress, res.mpcEvmAddress);
  assert.equal(mpcAll.solAddress, solRes.mpcSolAddress);
  assert.equal(mpcAll.pearlAddress, prlRes.mpcPearlAddress);
  assert.equal(mpcAll.btcAddress, btcRes.mpcBtcAddress);
});

test('Module 1: Address detection & validation across NEAR, EVM, Solana, Pearl, Bitcoin, TRON', () => {
  const implicitNear = '5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412';
  const evmAddr = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
  const solAddr = 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk';
  const prlAddr = 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74';
  const btcBech32 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
  const tronAddr = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

  assert.equal(cryptoEngine.detectAddressNetwork('alice.near'), 'near');
  assert.equal(cryptoEngine.detectAddressNetwork('bob.tg'), 'near');
  assert.equal(cryptoEngine.detectAddressNetwork(implicitNear), 'near');
  assert.equal(cryptoEngine.detectAddressNetwork(evmAddr), 'evm');
  assert.equal(cryptoEngine.detectAddressNetwork(solAddr), 'sol');
  assert.equal(cryptoEngine.detectAddressNetwork(prlAddr), 'prl');
  assert.equal(cryptoEngine.detectAddressNetwork(btcBech32), 'btc');
  assert.equal(cryptoEngine.detectAddressNetwork('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), 'btc');
  assert.equal(cryptoEngine.detectAddressNetwork(tronAddr), 'tron');
  assert.equal(cryptoEngine.detectAddressNetwork('invalid_address'), null);

  assert.equal(cryptoEngine.validateChainAddress('near', 'alice.near').valid, true);
  assert.equal(cryptoEngine.validateChainAddress('near', implicitNear).valid, true);
  assert.equal(cryptoEngine.validateChainAddress('near', 'alice.com').valid, false);

  assert.equal(cryptoEngine.validateChainAddress('eth', evmAddr).valid, true);
  assert.equal(cryptoEngine.validateChainAddress('base', evmAddr).valid, true);
  assert.equal(cryptoEngine.validateChainAddress('eth', '0x123').valid, false);

  assert.equal(cryptoEngine.validateChainAddress('sol', solAddr).valid, true);
  assert.equal(cryptoEngine.validateChainAddress('sol', 'not_sol').valid, false);

  assert.equal(cryptoEngine.validateChainAddress('prl', prlAddr).valid, true);
  // Corrupt last char of Bech32m checksum
  const corruptedPrl = prlAddr.slice(0, -1) + (prlAddr.endsWith('4') ? '5' : '4');
  assert.equal(cryptoEngine.validateChainAddress('prl', corruptedPrl).valid, false);

  assert.equal(cryptoEngine.validateChainAddress('btc', btcBech32).valid, true);
  assert.equal(cryptoEngine.validateChainAddress('btc', 'not_btc').valid, false);

  assert.equal(cryptoEngine.validateChainAddress('tron', tronAddr).valid, true);
  assert.equal(cryptoEngine.validateChainAddress('tron', 'T123').valid, false);
});

// ==================== Module 2: src/token-registry.js ====================

test('Module 2: UNIFIED_CORE_TOKENS and DEX_CHAIN_TOKENS have zero hardcoded fake prices (price: null)', () => {
  assert.ok(tokenRegistry.UNIFIED_CORE_TOKENS.length > 0);
  for (const tok of tokenRegistry.UNIFIED_CORE_TOKENS) {
    assert.equal(tok.price, null, `Core token ${tok.symbol} (${tok.blockchain}) must have initial price: null`);
  }

  const requiredDexChains = ['sol', 'eth', 'base', 'arb', 'bsc', 'hype', 'hood'];
  for (const chain of requiredDexChains) {
    const list = tokenRegistry.DEX_CHAIN_TOKENS[chain];
    assert.ok(Array.isArray(list) && list.length > 0, `DEX_CHAIN_TOKENS.${chain} must be populated`);
    for (const tok of list) {
      assert.equal(tok.price, null, `DEX token ${tok.symbol} (${chain}) must have initial price: null`);
    }
  }

  const solSymbols = tokenRegistry.DEX_CHAIN_TOKENS.sol.map((t) => t.symbol);
  for (const expected of ['JUP', 'SOL', 'USDC', 'JitoSOL']) {
    assert.ok(solSymbols.includes(expected), `DEX_CHAIN_TOKENS.sol must include ${expected}`);
  }
});

test('Module 2: renderTokenIconWithBadge outputs circular icon + 14px chain badge and escapes XSS', () => {
  const cases = [
    { symbol: 'NEAR', blockchain: 'near' },
    { symbol: 'SOL', blockchain: 'sol' },
    { symbol: 'JUP', blockchain: 'sol' },
    { symbol: 'ETH', blockchain: 'eth' },
    { symbol: 'USDT', blockchain: 'arb' },
    { symbol: 'PRL', blockchain: 'prl' }
  ];

  for (const c of cases) {
    const html = tokenRegistry.renderTokenIconWithBadge(c, 36, true);
    assert.ok(html.includes('rounded-full'), `${c.symbol} icon must be circular`);
    assert.ok(html.includes('w-[14px] h-[14px]'), `${c.symbol} must include 14px chain corner badge`);
    assert.ok(html.includes('<svg'), `${c.symbol} must include SVG icon or fallback SVG`);
    if (c.symbol === 'PRL') {
      assert.ok(html.includes('prlShell_'), 'PRL must render iridescent Pearl SVG');
    } else {
      assert.ok(html.includes('<img '), `${c.symbol} must include primary CDN <img>`);
    }
  }

  // XSS escaping test (with rejected javascript: URL -> fallback SVG, and with valid https URL -> escaped alt)
  const maliciousHtml = tokenRegistry.renderTokenIconWithBadge(
    {
      symbol: '<script>alert(1)</script>" onmouseover="alert(2)',
      blockchain: 'eth" onclick="alert(3)',
      logoURI: 'javascript:alert(4)'
    },
    36,
    true
  );
  assert.equal(maliciousHtml.includes('<script>'), false);
  assert.equal(maliciousHtml.includes('javascript:'), false);
  assert.equal(maliciousHtml.includes('onmouseover='), false);
  assert.equal(maliciousHtml.includes('onclick='), false);
  assert.ok(maliciousHtml.includes('&lt;SCR'));

  const maliciousAltHtml = tokenRegistry.renderTokenIconWithBadge(
    {
      symbol: '<script>alert(1)</script>',
      blockchain: 'eth',
      logoURI: 'https://example.com/icon.png'
    },
    36,
    true
  );
  assert.equal(maliciousAltHtml.includes('<script>'), false);
  assert.ok(maliciousAltHtml.includes('&lt;SCRIPT&gt;'));
});

// ==================== Module 3: src/near-intents.js ====================

test('Module 3: fetchNearNativeBalance & fetchIntentsUnifiedBalances with mocked RPC & graceful null on failure', async () => {
  await withMockedFetch(
    async (url, opts) => {
      assert.equal(url, nearIntents.NEAR_RPC_URL);
      const body = JSON.parse(opts.body);
      if (body.params.request_type === 'view_account') {
        if (body.params.account_id === 'alice.near') {
          return jsonResponse({ jsonrpc: '2.0', result: { amount: '1500000000000000000000000' } });
        }
        return jsonResponse({ jsonrpc: '2.0', error: { cause: { name: 'UNKNOWN_ACCOUNT' } } });
      }
      if (body.params.request_type === 'call_function') {
        assert.equal(body.params.account_id, 'intents.near');
        assert.equal(body.params.method_name, 'mt_batch_balance_of');
        const decodedArgs = JSON.parse(Buffer.from(body.params.args_base64, 'base64').toString('utf8'));
        assert.equal(decodedArgs.account_id, 'alice.near');
        assert.deepEqual(decodedArgs.token_ids, ['nep141:wrap.near', 'nep141:usdt.tether-token.near']);
        const encodedResult = Array.from(Buffer.from(JSON.stringify(['2500000000000000000000000', '12345678']), 'utf8'));
        return jsonResponse({ jsonrpc: '2.0', result: { result: encodedResult } });
      }
      return jsonResponse({}, 404);
    },
    async () => {
      const bal = await nearIntents.fetchNearNativeBalance('alice.near');
      assert.equal(bal, 1.5);

      const unknownBal = await nearIntents.fetchNearNativeBalance('unfunded.near');
      assert.equal(unknownBal, 0);

      const unified = await nearIntents.fetchIntentsUnifiedBalances('alice.near', [
        'nep141:wrap.near',
        'nep141:usdt.tether-token.near'
      ]);
      assert.equal(unified['nep141:wrap.near'].raw, '2500000000000000000000000');
      assert.equal(unified['nep141:wrap.near'].formatted, 2.5);
      assert.equal(unified['nep141:usdt.tether-token.near'].raw, '12345678');
      assert.equal(unified['nep141:usdt.tether-token.near'].formatted, 12.345678);
    }
  );

  // Graceful null on network error / RPC failure
  await withMockedFetch(
    async () => {
      throw new Error('Network offline');
    },
    async () => {
      assert.equal(await nearIntents.fetchNearNativeBalance('alice.near'), null);
      assert.equal(await nearIntents.fetchIntentsUnifiedBalances('alice.near', ['nep141:wrap.near']), null);
    }
  );
});

test('Module 3: quoteIntentSwapOrWithdraw supports INTENTS and ORIGIN_CHAIN deposit types', async () => {
  await withMockedFetch(
    async (url, opts) => {
      assert.equal(url, `${nearIntents.ONECLICK_API_URL}/quote`);
      const req = JSON.parse(opts.body);
      if (req.depositType === 'INTENTS') {
        assert.equal(req.refundType, 'INTENTS');
        return jsonResponse({
          depositAddress: 'intents-deposit.near',
          quote: {
            amountOut: '9950000',
            amountOutFormatted: '9.95',
            amountInUsd: '10.00',
            amountOutUsd: '9.95'
          }
        });
      }
      assert.equal(req.depositType, 'ORIGIN_CHAIN');
      assert.equal(req.refundType, 'ORIGIN_CHAIN');
      return jsonResponse({
        depositAddress: '0xOriginChainDepositAddress1234567890',
        memo: 'memo-99',
        quote: {
          amountOut: '4950000',
          amountOutFormatted: '4.95',
          amountInUsd: '5.00',
          amountOutUsd: '4.95'
        }
      });
    },
    async () => {
      const qIntents = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:usdt.tether-token.near',
        amountRaw: '2000000000000000000000000',
        recipient: 'alice.near',
        depositType: 'INTENTS',
        recipientType: 'INTENTS',
        dry: false
      });
      assert.equal(qIntents.ok, true);
      assert.equal(qIntents.depositAddress, 'intents-deposit.near');
      assert.equal(qIntents.amountOutFormatted, '9.95');

      const qOrigin = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
        destinationAsset: 'nep141:wrap.near',
        amountRaw: '5000000',
        recipient: 'alice.near',
        refundTo: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'INTENTS',
        dry: false
      });
      assert.equal(qOrigin.ok, true);
      assert.equal(qOrigin.depositAddress, '0xOriginChainDepositAddress1234567890');
      assert.equal(qOrigin.memo, 'memo-99');
      assert.equal(qOrigin.amountOutFormatted, '4.95');
    }
  );
});

test('Module 3: signAndPublishNep413Intent signs NEP-413 payload & posts publish_intent to Solver Relay', async () => {
  const keys = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC, 0);
  let capturedRpcBody = null;

  await withMockedFetch(
    async (url, opts) => {
      assert.equal(url, nearIntents.SOLVER_RELAY_URL);
      capturedRpcBody = JSON.parse(opts.body);
      return jsonResponse({ jsonrpc: '2.0', id: capturedRpcBody.id, result: { status: 'OK', intent_hash: 'ih_123' } });
    },
    async () => {
      const action = nearIntents.createTokenDiffIntent({
        diff: {
          'nep141:wrap.near': '-1000000000000000000000000',
          'nep141:usdt.tether-token.near': '3500000'
        }
      });
      const res = await nearIntents.signAndPublishNep413Intent({
        nearAccountId: keys.nearAddress,
        nearPrivateSeedHex: keys.nearPrivateSeedHex,
        nearPublicKey: keys.nearPublicKey,
        intentActions: [action],
        quoteHashes: ['qh_abc']
      });

      assert.equal(res.relayResult.status, 'OK');
      assert.equal(capturedRpcBody.method, 'publish_intent');
      const param = capturedRpcBody.params[0];
      assert.deepEqual(param.quote_hashes, ['qh_abc']);
      assert.equal(param.signed_data.standard, 'nep413');
      assert.equal(param.signed_data.public_key, keys.nearPublicKey);
      assert.equal(param.signed_data.payload.recipient, 'intents.near');

      const nonceBytes = cryptoEngine.base64ToBytes(param.signed_data.payload.nonce);
      assert.equal(nonceBytes.length, 32);

      // Verify Ed25519 signature against the Borsh NEP-413 hash
      const sigBytes = cryptoEngine.base58Decode(param.signed_data.signature.replace(/^ed25519:/, ''));
      const expectedDigest = cryptoEngine.hexToBytes(res.signedPayload.payloadHashHex);
      assert.equal(await cryptoEngine.ed25519VerifyAsync(sigBytes, expectedDigest, keys.nearPublicKey), true);
    }
  );
});

// ==================== Module 4: src/chain-contracts.js ====================

test('Module 4: STAKING_POOLS have initial apy: null, rate: null (zero fake APYs)', () => {
  assert.equal(INITIAL_STAKING_SNAPSHOT.length, 21);
  const byId = Object.fromEntries(INITIAL_STAKING_SNAPSHOT.map((p) => [p.id, p]));
  const expectedIds = [
    'rhea_rnear', 'rhea_xrhea', 'rhea_orhea_convert', 'metapool_stnear',
    'linear_near', 'stader_nearx', 'burrow_near_wnear', 'burrow_near_usdt',
    'jito_sol', 'jupiter_jup', 'jupiter_sol', 'marinade_msol', 'sanctum_inf',
    'lido_steth', 'arc_steak_usdc', 'aave_base_usdc', 'aave_eth_usdc', 'aave_arb_usdc',
    'aave_eth_weth', 'ethena_susde', 'hyper_khype'
  ];
  for (const id of expectedIds) {
    assert.ok(byId[id], `STAKING_POOLS must include ${id}`);
    assert.equal(byId[id].apy, null, `Pool ${id} must have initial apy: null`);
    assert.equal(byId[id].rate, null, `Pool ${id} must have initial rate: null`);
    assert.equal(byId[id].tvlText, null, `Pool ${id} must have initial tvlText: null`);
    assert.equal(byId[id].stakersCount, null, `Pool ${id} must have initial stakersCount: null`);
  }
});

test('Module 4: ensureWalletSigningKeysAsync self-heals NEAR Master credentials & v1.signer MPC addresses', async () => {
  const legacyWallet = {
    id: 'legacy_1',
    name: 'Legacy Wallet',
    mnemonic: TEST_MNEMONIC
  };

  const healed = await chainContracts.ensureWalletSigningKeysAsync(legacyWallet);
  assert.equal(healed.nearAddress, '5510e2b44cae6eb807e3e0e45d579dda058c274abcba15e5cb84636f5d1ee412');
  assert.equal(healed.nearPublicKey, 'ed25519:6j4b6zUaty6fD1awqcGCCU9JYGCWYUgdJhQrzfZhqE25');
  assert.ok(healed.nearPrivateKey.startsWith('ed25519:'));
  assert.equal(healed.nearPrivateSeedHex, '0c158d858a52316667d03d1d04aad51b3b542cd705215810629b78c501492fba');

  const expectedImplicitMpc = cryptoEngine.deriveNearMpcAllAddresses(healed.nearAddress);
  const expectedBtcBip86 = 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr';
  assert.equal(healed.mpcEvmAddress, expectedImplicitMpc.evmAddress);
  assert.equal(healed.evmAddress, expectedImplicitMpc.evmAddress);
  assert.equal(healed.solAddress, expectedImplicitMpc.solAddress);
  assert.equal(healed.address, 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74');
  assert.equal(healed.btcAddress, expectedBtcBip86);

  // Binding a named .near account updates EVM/Solana MPC external chain addresses to alice.near, while Pearl & Bitcoin remain BIP-86
  const namedWallet = { ...healed, nearNamedAccount: 'alice.near', mpcEvmAddress: '' };
  await chainContracts.ensureWalletSigningKeysAsync(namedWallet);
  const expectedAliceMpc = cryptoEngine.deriveNearMpcAllAddresses('alice.near');
  assert.equal(namedWallet.mpcEvmAddress, expectedAliceMpc.evmAddress);
  assert.equal(namedWallet.evmAddress, expectedAliceMpc.evmAddress);
  assert.equal(namedWallet.solAddress, 'HQmZYaq41vBMykpmg7Y8gHyuARUmRBeokPakEBpWvx2A');
  assert.equal(namedWallet.address, 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74');
  assert.equal(namedWallet.btcAddress, expectedBtcBip86);
});

test('Module 4: validateSufficientChainBalance blocks 0-balance Jupiter swap, EVM DEX swap, and staking BEFORE network calls', async () => {
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const zeroWallet = {
    id: 'w_zero',
    mnemonic: TEST_MNEMONIC,
    address: keys.pearlAddress,
    nearAddress: keys.nearAddress,
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    evmAddress: keys.evmAddress,
    evmPrivateKey: keys.evmPrivateKeyHex,
    solAddress: keys.solAddress,
    solPrivateKey: keys.solPrivateKey,
    solPrivateSeedHex: keys.solPrivateSeedHex,
    nearBalance: 0,
    balance: 0,
    multiBalances: { sol: 0, eth: 0, base: 0, arb: 0, bsc: 0, hype: 0, hood: 0 }
  };

  // Direct validateSufficientChainBalance check + gas buffer boundary
  assert.throws(
    () =>
      chainContracts.validateSufficientChainBalance({
        wallet: zeroWallet,
        chain: 'sol',
        tokenSymbol: 'SOL',
        amount: 0.5,
        isNative: true
      }),
    (err) => err.code === 'INSUFFICIENT_BALANCE' && /SOL/.test(err.zhMessage) && /Insufficient SOL/.test(err.enMessage)
  );
  assert.throws(
    () =>
      chainContracts.validateSufficientChainBalance({
        wallet: { multiBalances: { sol: 1.0 } },
        chain: 'sol',
        tokenSymbol: 'SOL',
        amount: 1.0,
        isNative: true
      }),
    (err) => err.code === 'INSUFFICIENT_BALANCE'
  );
  const passCheck = chainContracts.validateSufficientChainBalance({
    wallet: { multiBalances: { sol: 1.005 } },
    chain: 'sol',
    tokenSymbol: 'SOL',
    amount: 1.0,
    isNative: true
  });
  assert.equal(passCheck.ok, true);

  await withMockedFetch(
    async () => {
      throw new Error('fetch must not be called when local balance pre-validation fails');
    },
    async (calls) => {
      // 1. Solana Jupiter swap (SOL -> JUP and SPL JUP -> USDC)
      await assert.rejects(
        () =>
          chainContracts.executeSolanaJupiterSwap({
            wallet: zeroWallet,
            quoteResponse: {
              inputMint: 'So11111111111111111111111111111111111111112',
              outputMint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
              inAmount: '500000000'
            }
          }),
        (err) => err.code === 'INSUFFICIENT_BALANCE'
      );
      await assert.rejects(
        () =>
          chainContracts.executeSolanaJupiterSwap({
            wallet: { ...zeroWallet, multiBalances: { ...zeroWallet.multiBalances, sol: 0.1 } },
            quoteResponse: {
              inputMint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
              outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
              inAmount: '5000000'
            },
            tokenBalance: 0
          }),
        (err) => err.code === 'INSUFFICIENT_BALANCE'
      );

      // 2. EVM DEX swap (ETH -> USDC)
      await assert.rejects(
        () =>
          chainContracts.executeEvmDexSwap({
            wallet: zeroWallet,
            chainKey: 'eth',
            routeSource: 'kyber',
            routeData: { tokenIn: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' },
            srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            amountRaw: '1000000000000000000'
          }),
        (err) => err.code === 'INSUFFICIENT_BALANCE'
      );

      // 3. Staking across Meta Pool (near), Jito (jito), and Lido (lido)
      for (const poolId of ['near', 'jito', 'lido']) {
        await assert.rejects(
          () =>
            chainContracts.executeOnChainStaking({
              wallet: zeroWallet,
              poolId,
              amount: 1
            }),
          (err) => err.code === 'INSUFFICIENT_BALANCE'
        );
      }

      assert.equal(calls.length, 0, 'Zero network requests may fire when local balance is insufficient');
    }
  );
});

test('Module 4: requestNearMpcChainSignature constructs Borsh FunctionCall to v1.signer method sign', async () => {
  const keys = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC, 0);
  const fundedWallet = {
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearAddress: keys.nearAddress,
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    nearBalance: 2.0
  };
  const payloadHash32 = nodeCrypto.createHash('sha256').update('cross-chain-evm-tx').digest();
  const dummyBlockHash = cryptoEngine.base58Encode(Buffer.alloc(32, 7));
  let broadcastedSignedB64 = '';

  await withMockedFetch(
    async (url, opts) => {
      assert.equal(url, chainContracts.NEAR_RPC_URL);
      const rpc = JSON.parse(opts.body);
      if (rpc.method === 'query' && rpc.params.request_type === 'view_access_key') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { nonce: 99, block_hash: dummyBlockHash } });
      }
      if (rpc.method === 'broadcast_tx_commit') {
        broadcastedSignedB64 = rpc.params[0];
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { transaction: { hash: 'MPC_TX_HASH_1' }, status: { SuccessValue: '' } } });
      }
      throw new Error(`Unexpected RPC call: ${rpc.method}`);
    },
    async () => {
      const res = await chainContracts.requestNearMpcChainSignature({
        wallet: fundedWallet,
        payloadHash32Bytes: payloadHash32,
        path: 'ethereum-1',
        keyVersion: 0,
        depositYocto: '1'
      });

      assert.equal(res.txHash, 'MPC_TX_HASH_1');
      assert.equal(res.signerContract, 'v1.signer');
      assert.equal(res.accountId, 'alice.near');

      // Parse Borsh SignedTransaction: Transaction || Signature (1-byte keyType + 64-byte sig)
      const signedBuf = Buffer.from(broadcastedSignedB64, 'base64');
      const txBuf = signedBuf.slice(0, signedBuf.length - 65);
      const sigType = signedBuf[signedBuf.length - 65];
      const sigBytes = signedBuf.slice(signedBuf.length - 64);
      assert.equal(sigType, 0);

      let offset = 0;
      const signerId = readBorshString(txBuf, offset);
      assert.equal(signerId.value, 'alice.near');
      offset = signerId.nextOffset;

      assert.equal(txBuf[offset], 0); // ED25519 PublicKey tag
      offset += 1;
      const pubBytes = txBuf.slice(offset, offset + 32);
      assert.equal(`ed25519:${cryptoEngine.base58Encode(pubBytes)}`, keys.nearPublicKey);
      offset += 32;

      const nonce = txBuf.readBigUInt64LE(offset);
      assert.equal(nonce, 100n);
      offset += 8;

      const receiverId = readBorshString(txBuf, offset);
      assert.equal(receiverId.value, 'v1.signer');
      offset = receiverId.nextOffset;

      // 32-byte block_hash
      offset += 32;

      // actions vec len = 1
      assert.equal(txBuf.readUInt32LE(offset), 1);
      offset += 4;

      // Action::FunctionCall tag = 2
      assert.equal(txBuf[offset], 2);
      offset += 1;

      const methodName = readBorshString(txBuf, offset);
      assert.equal(methodName.value, 'sign');
      offset = methodName.nextOffset;

      const argsLen = txBuf.readUInt32LE(offset);
      offset += 4;
      const argsJson = JSON.parse(txBuf.slice(offset, offset + argsLen).toString('utf8'));
      assert.deepEqual(argsJson, {
        request: {
          payload: Array.from(payloadHash32),
          path: 'ethereum-1',
          key_version: 0
        }
      });

      const txHashDigest = nodeCrypto.createHash('sha256').update(txBuf).digest();
      assert.equal(await cryptoEngine.ed25519VerifyAsync(sigBytes, txHashDigest, keys.nearPublicKey), true);
    }
  );

  // Also test domain_id: 1 (EdDSA / Solana) payload_v2 format and parsed Ed25519 signature output
  const dummySolMsg = Uint8Array.from([1, 0, 1, 2, 3, 4, 5, 6]);
  const dummyEd25519Sig = Array.from({ length: 64 }, (_, i) => (i + 1) & 0xff);
  await withMockedFetch(
    async (url, opts) => {
      assert.equal(url, chainContracts.NEAR_RPC_URL);
      const rpc = JSON.parse(opts.body);
      if (rpc.method === 'query' && rpc.params.request_type === 'view_access_key') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { nonce: 10, block_hash: dummyBlockHash } });
      }
      if (rpc.method === 'broadcast_tx_commit') {
        const signedBuf = Buffer.from(rpc.params[0], 'base64');
        const txt = signedBuf.toString('utf8');
        assert.ok(txt.includes('"domain_id":1'));
        assert.ok(txt.includes('"Eddsa":"0100010203040506"'));
        const successB64 = Buffer.from(JSON.stringify({ scheme: 'Ed25519', signature: dummyEd25519Sig })).toString('base64');
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { transaction: { hash: 'MPC_EDDSA_TX' }, status: { SuccessValue: successB64 } } });
      }
      throw new Error(`Unexpected RPC call: ${rpc.method}`);
    },
    async () => {
      const res = await chainContracts.requestNearMpcChainSignature({
        wallet: fundedWallet,
        payloadBytes: dummySolMsg,
        path: 'solana-1',
        domainId: 1
      });
      assert.equal(res.txHash, 'MPC_EDDSA_TX');
      assert.equal(res.domainId, 1);
      assert.equal(res.mpcSignature.scheme, 'Ed25519');
      assert.deepEqual(res.mpcSignature.signature, dummyEd25519Sig);
    }
  );
});

// ==================== Module 5: src/mining-pro.js ====================

test('Module 5: Zero GPU benchmark tables or electricity calculators exist & formatHashrate handles null / TH/s', () => {
  const miningSource = fs.readFileSync(path.join(ROOT_DIR, 'src', 'mining-pro.js'), 'utf8');
  const forbiddenPatterns = [
    /RTX\s*4090/i,
    /RX\s*7900/i,
    /electricity/i,
    /kwh/i,
    /profitCalculator/i,
    /gpuBenchmark/i
  ];
  for (const pat of forbiddenPatterns) {
    assert.equal(pat.test(miningSource), false, `mining-pro.js must not contain ${pat}`);
  }
  assert.equal('estimateMiningProfit' in miningPro, false);
  assert.equal('GPU_BENCHMARKS' in miningPro, false);

  assert.equal(miningPro.formatHashrate(null), '--');
  assert.equal(miningPro.formatHashrate(undefined), '--');
  assert.equal(miningPro.formatHashrate(NaN), '--');
  assert.equal(miningPro.formatHashrate(-5), '--');
  assert.equal(miningPro.formatHashrate(280.22e12), '280.22 TH/s');
  assert.equal(miningPro.formatHashrate(1500), '1.50 KH/s');
});

test('Module 5: queryMinerDeepStats parses Kryptex, HeroMiners (2^32 scaling), and on-chain prlscan', async () => {
  const minerAddr = 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74';

  // 1. Kryptex + prlscan
  await withMockedFetch(
    async (url) => {
      if (url.includes('pool.kryptex.com/prl/api/v1/miner/balance/')) {
        return jsonResponse({ total: 12.5, threshold: 50, last_active: 1730000000 });
      }
      if (url.includes('pool.kryptex.com/prl/api/v3/miner/workers/')) {
        return jsonResponse({
          results: [
            { worker: 'rig-01', status: 'online', avg_hashrate_30m: 140.11e12, avg_hashrate_3h: 138e12, valid: 500, stale: 2, invalid: 1, last_share: 1730000000, agent: 'lolMiner' }
          ]
        });
      }
      if (url.includes('pool.kryptex.com/prl/api/v1/miner/payouts/')) {
        return jsonResponse({
          results: [{ txid: 'k_tx_1', amount: 100, date: 1729990000, status: 'confirmed' }]
        });
      }
      if (url.includes('pool.kryptex.com/prl/api/v1/miner/stats')) {
        return jsonResponse({ total_paid: 100, shares_valid: 500, shares_invalid: 3 });
      }
      if (url.endsWith(`/addresses/${minerAddr}`)) {
        return jsonResponse({ balance_grains: '2500000000', received_grains: '12500000000' });
      }
      if (url.includes(`/addresses/${minerAddr}/txs`)) {
        return jsonResponse([]);
      }
      return jsonResponse({}, 404);
    },
    async () => {
      const res = await miningPro.queryMinerDeepStats(minerAddr, 'kryptex');
      assert.equal(res.poolSource, 'kryptex');
      assert.equal(res.onChainBalancePrl, 25);
      assert.equal(res.unpaidBalancePrl, 12.5);
      assert.equal(res.totalPaidPrl, 100);
      assert.equal(res.hashrateCurrent, 140.11e12);
      assert.equal(res.hashrateCurrentFormatted, '140.11 TH/s');
      assert.equal(res.workers.length, 1);
      assert.equal(res.workers[0].name, 'rig-01');
      assert.equal(res.workers[0].rejectedShares, 3);
      assert.equal(res.payoutHistory.length, 1);
      assert.equal(res.payoutHistory[0].txid, 'k_tx_1');
    }
  );

  // 2. HeroMiners (2^32 hashrate scaling) + prlscan
  const rawHeroRate = 65243.80279964209; // * 2^32 == ~280.22e12 H/s
  const nowSec = Math.floor(Date.now() / 1000);
  await withMockedFetch(
    async (url) => {
      if (url.includes('pearl.herominers.com/api/stats_address')) {
        return jsonResponse({
          stats: {
            hashrate: rawHeroRate,
            balance: '500000000',
            paid: '20000000000',
            minPaymentThreshold: '1000000000',
            shares_good: 800,
            shares_invalid: 2,
            shares_stale: 1
          },
          workers: [
            { name: 'hero-rig-A', hashrate: rawHeroRate, lastShare: nowSec, shares_good: 800, shares_invalid: 2, shares_stale: 1 }
          ],
          payments: ['hero_tx_1:2500000000', nowSec - 600]
        });
      }
      if (url.endsWith(`/addresses/${minerAddr}`)) {
        return jsonResponse({ balance_grains: '4000000000', received_grains: '24000000000' });
      }
      if (url.includes(`/addresses/${minerAddr}/txs`)) {
        return jsonResponse([]);
      }
      return jsonResponse({}, 404);
    },
    async () => {
      const res = await miningPro.queryMinerDeepStats(minerAddr, 'herominers');
      assert.equal(res.poolSource, 'herominers');
      assert.equal(res.onChainBalancePrl, 40);
      assert.equal(res.unpaidBalancePrl, 5);
      assert.equal(res.totalPaidPrl, 200);
      assert.equal(res.payoutThresholdPrl, 10);
      assert.ok(Math.abs(res.hashrateCurrent - rawHeroRate * 4294967296) < 1e6);
      assert.equal(res.hashrateCurrentFormatted, '280.22 TH/s');
      assert.equal(res.workers.length, 1);
      assert.equal(res.workers[0].name, 'hero-rig-A');
      assert.equal(res.workers[0].status, 'online');
      assert.equal(res.payoutHistory.length, 1);
      assert.equal(res.payoutHistory[0].txid, 'hero_tx_1');
      assert.equal(res.payoutHistory[0].amountPrl, 25);
    }
  );

  // 3. On-chain prlscan fallback
  await withMockedFetch(
    async (url) => {
      if (url.endsWith(`/addresses/${minerAddr}`)) {
        return jsonResponse({ balance_grains: '1500000000', received_grains: '3500000000' });
      }
      if (url.includes(`/addresses/${minerAddr}/txs`)) {
        return jsonResponse([{ txid: 'onchain_tx_1', delta_grains: '1500000000', time: 1730000100, status: 'confirmed' }]);
      }
      return jsonResponse({}, 404);
    },
    async () => {
      const res = await miningPro.queryMinerDeepStats(minerAddr, 'onchain');
      assert.equal(res.poolSource, 'onchain');
      assert.equal(res.onChainBalancePrl, 15);
      assert.equal(res.totalPaidPrl, 35);
      assert.equal(res.payoutHistory.length, 1);
      assert.equal(res.payoutHistory[0].txid, 'onchain_tx_1');
    }
  );
});

test('Module 5: prepareSweepMinerToNearIntent blocks insufficient prl1p... balance before calling 1Click', async () => {
  const minerAddr = 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74';
  const sweepWallet = {
    address: minerAddr,
    nearNamedAccount: 'alice.near'
  };

  await withMockedFetch(
    async (url) => {
      if (url.includes('1click.chaindefuser.com')) {
        throw new Error('1Click must NOT be called when PRL balance is insufficient');
      }
      if (url.endsWith(`/addresses/${minerAddr}`)) {
        // 1.0 PRL available, trying to sweep 1.0 PRL + fee buffer fails locally
        return jsonResponse({ balance_grains: '100000000' });
      }
      return jsonResponse({}, 404);
    },
    async (calls) => {
      await assert.rejects(
        () =>
          miningPro.prepareSweepMinerToNearIntent({
            wallet: sweepWallet,
            recipientNearAccount: 'alice.near',
            amountPrl: 1.0
          }),
        (err) => err.code === 'INSUFFICIENT_PRL_BALANCE'
      );
      assert.equal(calls.some((c) => c.url.includes('1click.chaindefuser.com')), false);
    }
  );

  // Sufficient balance (10 PRL) succeeds and fetches 1Click quote
  await withMockedFetch(
    async (url, opts) => {
      if (url.endsWith(`/addresses/${minerAddr}`)) {
        return jsonResponse({ balance_grains: '1000000000' });
      }
      if (url === 'https://1click.chaindefuser.com/v0/quote') {
        const body = JSON.parse(opts.body);
        assert.equal(body.originAsset, miningPro.PRL_ORIGIN_ASSET_ID);
        assert.equal(body.amount, '500000000');
        assert.equal(body.recipient, 'alice.near');
        return jsonResponse({
          depositAddress: 'prl1p0000000000000000000000000000000000000000000000000000deposit',
          quote: {
            amountOut: '495000000',
            amountOutFormatted: '4.95',
            amountInUsd: '2.50',
            amountOutUsd: '2.48',
            timeEstimate: 45
          }
        });
      }
      return jsonResponse({}, 404);
    },
    async () => {
      const res = await miningPro.prepareSweepMinerToNearIntent({
        wallet: sweepWallet,
        amountPrl: 5,
        destinationAsset: 'PRL',
        dry: false
      });
      assert.equal(res.onChainBalancePrl, 10);
      assert.equal(res.amountGrains, '500000000');
      assert.equal(res.amountOutFormatted, '4.95');
      assert.ok(res.depositAddress);
    }
  );
});

// ==================== Modules 6 & 7: state.js, ui-controller.js, index.html, build ====================

test('Module 6: pearl_user_wallets_v4 -> near_ca_wallets_v1 automatic wallet migration', async () => {
  const legacyPayload = {
    wallets: [
      {
        id: 'legacy_w1',
        name: 'Pearl Legacy',
        mnemonic: TEST_MNEMONIC,
        address: 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74',
        balance: 12.5,
        nearBalance: 3.25,
        multiBalances: { sol: 1.5, eth: 0.4, base: 0.1, bnb: 2.0 }
      }
    ],
    activeWalletId: 'legacy_w1'
  };

  await withMockedStorage(
    { [state.LEGACY_WALLETS_STORAGE_KEY]: JSON.stringify(legacyPayload) },
    async (storage) => {
      const wallets = state.loadWallets();
      assert.equal(wallets.length, 1);
      assert.equal(state.activeWalletId, 'legacy_w1');
      assert.equal(wallets[0].nativeBalances.prl, 12.5);
      assert.equal(wallets[0].nativeBalances.near, 3.25);
      assert.equal(wallets[0].nativeBalances.sol, 1.5);
      assert.equal(wallets[0].nativeBalances.eth, 0.4);
      assert.equal(wallets[0].nativeBalances.base, 0.1);
      assert.equal(wallets[0].nativeBalances.bsc, 2.0);

      const migratedJson = storage.getItem(state.WALLETS_STORAGE_KEY);
      assert.ok(migratedJson, 'Migrated wallets must be saved under near_ca_wallets_v1');
      const parsed = JSON.parse(migratedJson);
      assert.equal(parsed.wallets.length, 1);
      assert.equal(parsed.activeWalletId, 'legacy_w1');
    }
  );
});

test('Modules 6 & 7: 100% of data-i18n keys in index.html exist in both i18nDict.zh and i18nDict.en', async () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const i18nKeys = [...html.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
  const placeholderKeys = [...html.matchAll(/data-i18n-placeholder="([^"]+)"/g)].map((m) => m[1]);
  const allKeys = Array.from(new Set([...i18nKeys, ...placeholderKeys]));

  assert.ok(allKeys.length > 100, 'Expected substantial data-i18n key coverage in index.html');
  const missingZh = allKeys.filter((k) => state.i18nDict.zh[k] === undefined);
  const missingEn = allKeys.filter((k) => state.i18nDict.en[k] === undefined);

  assert.deepEqual(missingZh, [], `Missing zh translations: ${missingZh.join(', ')}`);
  assert.deepEqual(missingEn, [], `Missing en translations: ${missingEn.join(', ')}`);

  // Verify live bilingual switching via state.setLanguage & state.t
  await withMockedStorage({}, async () => {
    state.setLanguage('en');
    assert.equal(state.lang, 'en');
    assert.equal(state.t('中文', 'English'), 'English');
    state.setLanguage('zh');
    assert.equal(state.lang, 'zh');
    assert.equal(state.t('中文', 'English'), '中文');
  });
});

test('Module 3: fetchNearNep141Balances & fetchLiveDefuseTokenPrices populate NEAR NEP-141 + DEX token prices (JUP/HYPE/PRL)', async () => {
  const encodeJsonBytes = (obj) => Array.from(Buffer.from(JSON.stringify(obj), 'utf8'));

  await withMockedFetch(
    async (url, opts) => {
      if (url === nearIntents.NEAR_RPC_URL) {
        const req = JSON.parse(opts.body);
        const cid = req.params.account_id;
        if (cid === 'prl.omft.near') {
          return jsonResponse({ jsonrpc: '2.0', id: req.id, result: { result: encodeJsonBytes('500000000') } });
        }
        if (cid === 'usdt.tether-token.near') {
          return jsonResponse({ jsonrpc: '2.0', id: req.id, result: { result: encodeJsonBytes('12500000') } });
        }
        return jsonResponse({ jsonrpc: '2.0', id: req.id, result: { result: encodeJsonBytes('0') } });
      }
      if (url.startsWith(`${nearIntents.ONECLICK_API_URL}/tokens`)) {
        return jsonResponse([
          { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.25 },
          { assetId: 'nep141:prl.omft.near', symbol: 'PRL', blockchain: 'prl', decimals: 8, price: 1.69 },
          { assetId: '1cs_v1:hypercore:hip1:hype', symbol: 'HYPE', blockchain: 'hypercore', decimals: 18, price: 24.5 }
        ]);
      }
      if (url.includes('api.dexscreener.com/latest/dex/tokens/')) {
        return jsonResponse({
          pairs: [
            { baseToken: { address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP' }, priceUsd: '0.2521', liquidity: { usd: 450000 } },
            { baseToken: { address: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', symbol: 'JitoSOL' }, priceUsd: '94.99', liquidity: { usd: 210000 } }
          ]
        });
      }
      if (url.includes('api.prlscan.com/v1/market/prl')) {
        return jsonResponse({ pair: 'PRL/USD', price_usd: 1.71 });
      }
      return jsonResponse({}, 404);
    },
    async () => {
      const nepMap = await nearIntents.fetchNearNep141Balances('alice.near');
      assert.equal(nepMap['prl.omft.near'].formatted, 5);
      assert.equal(nepMap['usdt.tether-token.near'].formatted, 12.5);

      const list = await nearIntents.fetchLiveDefuseTokenPrices();
      assert.ok(Array.isArray(list) && list.length === 3);

      const jup = tokenRegistry.DEX_CHAIN_TOKENS.sol.find((x) => x.symbol === 'JUP');
      const jito = tokenRegistry.DEX_CHAIN_TOKENS.sol.find((x) => x.symbol === 'JitoSOL');
      const hype = tokenRegistry.DEX_CHAIN_TOKENS.hype.find((x) => x.symbol === 'HYPE');
      const nearPrl = tokenRegistry.DEX_CHAIN_TOKENS.near.find((x) => x.symbol === 'PRL');
      assert.equal(jup.price, 0.2521);
      assert.equal(jito.price, 94.99);
      assert.equal(hype.price, 24.5);
      assert.equal(nearPrl.price, 1.69);
    }
  );
});

test('Module 3 & 4: Ref Finance SmartRouter & PRL composite routing (PRL -> NEAR / USDC / SOL)', async () => {
  await withMockedFetch(
    async (url, opts) => {
      if (url.startsWith('https://smartrouter.ref.finance/findPath')) {
        const u = new URL(url);
        const tokenIn = u.searchParams.get('tokenIn');
        const tokenOut = u.searchParams.get('tokenOut');
        if (tokenIn === 'prl.omft.near' && tokenOut === nearIntents.NEAR_USDC_CONTRACT) {
          return jsonResponse({
            result_code: 0,
            result_data: {
              routes: [
                {
                  pools: [
                    { pool_id: '9010', token_in: 'prl.omft.near', token_out: tokenOut, amount_in: '100000000', min_amount_out: '1656162' }
                  ],
                  min_amount_out: '1656162'
                }
              ],
              amount_in: '100000000',
              amount_out: '1672891'
            }
          });
        }
        return jsonResponse({
          result_code: 0,
          result_data: {
            routes: [
              {
                pools: [
                  { pool_id: '9010', token_in: 'prl.omft.near', token_out: nearIntents.NEAR_USDC_CONTRACT, amount_in: '100000000', min_amount_out: '0' },
                  { pool_id: '4512', token_in: nearIntents.NEAR_USDC_CONTRACT, token_out: tokenOut, amount_in: '0', min_amount_out: '509000000000000000000000' }
                ],
                min_amount_out: '509000000000000000000000'
              }
            ],
            amount_in: '100000000',
            amount_out: '514000000000000000000000'
          }
        });
      }
      if (url === `${nearIntents.ONECLICK_API_URL}/quote`) {
        const req = JSON.parse(opts.body);
        if (req.originAsset === nearIntents.PRL_NEAR_ASSET_ID) {
          return jsonResponse({ message: 'No liquidity available' }, 400);
        }
        assert.equal(req.originAsset, nearIntents.NEAR_USDC_ASSET_ID);
        assert.equal(req.destinationAsset, 'nep141:sol.omft.near');
        assert.equal(req.amount, '1672891');
        return jsonResponse({
          quote: {
            amountOut: '17500000',
            amountOutFormatted: '0.0175',
            amountInUsd: '1.67',
            amountOutUsd: '1.66'
          }
        });
      }
      return jsonResponse({}, 404);
    },
    async () => {
      const refMulti = await chainContracts.quoteNearRefFinanceSwap({
        tokenIn: 'prl.omft.near',
        tokenOut: 'wrap.near',
        amountRaw: '100000000'
      });
      assert.equal(refMulti.ok, true);
      assert.equal(refMulti.actions.length, 2);
      assert.equal(refMulti.actions[0].amount_in, '100000000');
      assert.equal(refMulti.actions[1].amount_in, undefined, 'Hop 2 must omit 0 amount_in');

      const compositeSol = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: nearIntents.PRL_NEAR_ASSET_ID,
        destinationAsset: 'nep141:sol.omft.near',
        amountRaw: '100000000',
        recipient: 'So11111111111111111111111111111111111111112',
        nearAccountId: 'alice.near',
        dry: true
      });
      assert.equal(compositeSol.ok, true);
      assert.equal(compositeSol.compositeType, 'PRL_TO_EXTERNAL');
      assert.equal(compositeSol.amountOutFormatted, '0.0175');
    }
  );
});

test('Module 2 & 3: PRL -> QTC composite fallthrough + 1Click DEPRECATED filtering & Ref/CoinGecko icon hydration', async () => {
  // 1. Token icon coverage & XSS sanitization
  for (const sym of ['QTC', 'FRAX', 'AURORA', 'BLACKDRAGON', 'SHITZU', 'ABG', 'NOEAR', 'MPDAO', 'RHEA', 'SWEAT', 'STNEAR']) {
    const resolved = tokenRegistry.resolveTokenIcon({ symbol: sym, blockchain: 'near' });
    assert.ok(resolved.primaryUrl, `Missing primary icon URL for ${sym}`);
  }
  assert.equal(tokenRegistry.sanitizeImageUrl('data:image/svg+xml;utf8,<svg onload=alert(1)>'), '');
  const qtcResolved = tokenRegistry.resolveTokenIcon({ symbol: 'QTC', blockchain: 'qtc' });
  assert.ok(qtcResolved.primaryUrl.startsWith('assets/icons/') || qtcResolved.primaryUrl.startsWith('https://'));
  assert.ok(qtcResolved.fallbackUrl.startsWith('data:image/svg+xml;base64,'));

  // 2. DEPRECATED / TESTNEBULA filtering + Ref & CoinGecko icon hydration + PRL -> QTC fallthrough
  await withMockedFetch(
    async (url, opts) => {
      if (url.startsWith(`${nearIntents.ONECLICK_API_URL}/tokens`)) {
        return jsonResponse([
          { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.25 },
          { assetId: '1cs_v1:near:nep141:qtc.omft.near', symbol: 'QTC', blockchain: 'near', contractAddress: 'qtc.omft.near', decimals: 12, coingeckoId: 'custom:qtc' },
          { assetId: 'nep141:custom.near', symbol: 'CUSTOMREF', blockchain: 'near', contractAddress: 'customref.near', decimals: 18 },
          { assetId: 'nep141:old.near', symbol: 'OLD (DEPRECATED)', blockchain: 'near', decimals: 18 },
          { assetId: 'nep141:test.near', symbol: 'TESTNEBULA', blockchain: 'near', decimals: 18 }
        ]);
      }
      if (url === 'https://indexer.ref.finance/list-token') {
        return jsonResponse({
          'customref.near': { symbol: 'CUSTOMREF', icon: 'https://assets.example.org/token/customref.png', decimals: 18 }
        });
      }
      if (url.startsWith('https://api.coingecko.com/api/v3/coins/markets')) {
        return jsonResponse([
          { id: 'near', symbol: 'near', image: 'https://coin-images.coingecko.com/coins/images/10365/large/near.jpg' }
        ]);
      }
      if (url.startsWith('https://smartrouter.ref.finance/findPath')) {
        const u = new URL(url);
        const tokenIn = u.searchParams.get('tokenIn');
        const tokenOut = u.searchParams.get('tokenOut');
        // No Ref pool between PRL and QTC
        if (tokenOut === 'qtc.omft.near' || tokenIn === 'qtc.omft.near') {
          return jsonResponse({ result_code: -1, result_message: 'No pool for QTC', result_data: { routes: [], amount_out: '0' } });
        }
        // Pool #9010 PRL -> NEAR USDC
        if (tokenIn === 'prl.omft.near' && tokenOut === nearIntents.NEAR_USDC_CONTRACT) {
          return jsonResponse({
            result_code: 0,
            result_data: {
              routes: [{ pools: [{ pool_id: '9010', token_in: 'prl.omft.near', token_out: tokenOut, amount_in: u.searchParams.get('amountIn'), min_amount_out: '11900000' }] }],
              amount_out: '12000000'
            }
          });
        }
        // Pool #9010 NEAR USDC -> PRL
        if (tokenIn === nearIntents.NEAR_USDC_CONTRACT && tokenOut === 'prl.omft.near') {
          return jsonResponse({
            result_code: 0,
            result_data: {
              routes: [{ pools: [{ pool_id: '9010', token_in: tokenIn, token_out: 'prl.omft.near', amount_in: u.searchParams.get('amountIn'), min_amount_out: '700000000' }] }],
              amount_out: '720000000'
            }
          });
        }
        return jsonResponse({ result_code: -1, result_message: 'No pool' });
      }
      if (url === `${nearIntents.ONECLICK_API_URL}/quote`) {
        const req = JSON.parse(opts.body);
        if (req.destinationAsset === 'nep141:qtc.omft.near' && req.recipientType === 'DESTINATION_CHAIN' && req.recipient === 'alice.near') {
          return jsonResponse({ message: 'recipient is not valid' }, 400);
        }
        if (req.originAsset === nearIntents.NEAR_USDC_ASSET_ID && req.destinationAsset === '1cs_v1:near:nep141:qtc.omft.near') {
          return jsonResponse({
            quote: { amountOut: '300268000000', amountOutFormatted: '0.300268', amountInUsd: '12.00', amountOutUsd: '11.95' }
          });
        }
        if (req.originAsset === '1cs_v1:near:nep141:qtc.omft.near' && req.destinationAsset === nearIntents.NEAR_USDC_ASSET_ID) {
          return jsonResponse({
            quote: { amountOut: '11800000', amountOutFormatted: '11.80', amountInUsd: '11.90', amountOutUsd: '11.80' }
          });
        }
      }
      return jsonResponse({}, 404);
    },
    async () => {
      const liveList = await nearIntents.fetchLiveDefuseTokenPrices();
      assert.equal(liveList.some((x) => /DEPRECATED|TESTNEBULA/i.test(x.symbol)), false, 'Must filter deprecated/test tokens');
      const customTok = liveList.find((x) => x.symbol === 'CUSTOMREF');
      assert.equal(customTok?.logoURI, 'https://assets.example.org/token/customref.png');

      // PRL -> QTC (NEAR) falls through Ref failure to PRL->USDC->QTC 1Click composite
      const qPrlToQtcNear = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: nearIntents.PRL_NEAR_ASSET_ID,
        destinationAsset: '1cs_v1:near:nep141:qtc.omft.near',
        amountRaw: '737000000',
        recipient: 'alice.near',
        nearAccountId: 'alice.near',
        dry: true
      });
      assert.equal(qPrlToQtcNear.ok, true);
      assert.equal(qPrlToQtcNear.compositeType, 'PRL_TO_EXTERNAL');
      assert.equal(qPrlToQtcNear.amountOutFormatted, '0.300268');

      // PRL -> QTC (QTC chain) dry preview falls back on 'recipient is not valid' using NEAR equivalent
      const qPrlToQtcNative = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: nearIntents.PRL_NEAR_ASSET_ID,
        destinationAsset: 'nep141:qtc.omft.near',
        amountRaw: '737000000',
        recipient: 'alice.near',
        nearAccountId: 'alice.near',
        dry: true
      });
      assert.equal(qPrlToQtcNative.ok, true);
      assert.equal(qPrlToQtcNative.amountOutFormatted, '0.300268');

      // QTC (NEAR) -> PRL falls through Ref failure to QTC->USDC->PRL composite
      const qQtcToPrl = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: '1cs_v1:near:nep141:qtc.omft.near',
        destinationAsset: nearIntents.PRL_NEAR_ASSET_ID,
        amountRaw: '300000000000',
        recipient: 'alice.near',
        refundTo: 'alice.near',
        nearAccountId: 'alice.near',
        dry: true
      });
      assert.equal(qQtcToPrl.ok, true);
      assert.equal(qQtcToPrl.compositeType, 'EXTERNAL_TO_PRL');
      assert.equal(qQtcToPrl.amountOutFormatted, '7.2');
    }
  );
});

test('Module 1, 3 & 4: Quantus (QTC qz...) address validation, 1Click cross-chain deposit address & Rhea/Ref dclv2.ref-labs.near CLMM swap', async () => {
  const sampleQtcAddr = 'qzk2q8To1dRKd4EwHUMWnyH5iMf7G7VrFcfu5XRpxMhCjGK7Z';
  assert.equal(cryptoEngine.detectAddressNetwork(sampleQtcAddr), 'qtc');
  assert.equal(cryptoEngine.validateChainAddress('qtc', sampleQtcAddr).valid, true);
  assert.equal(cryptoEngine.validateChainAddress('qtc', 'invalid-qtc').valid, false);
  assert.equal(tokenRegistry.getChainMeta('qtc').shortName, 'QTC');
  assert.equal(tokenRegistry.getChainMeta('quantus').name, 'Quantus Network');

  const encodeJsonBytes = (obj) => Array.from(Buffer.from(JSON.stringify(obj), 'utf8'));
  let capturedSendCall = null;
  const origFnCall = chainContracts.signAndSendNearFunctionCall;

  await withMockedFetch(
    async (url, opts) => {
      if (url === `${nearIntents.ONECLICK_API_URL}/quote`) {
        const req = JSON.parse(opts.body);
        assert.equal(req.originAsset, nearIntents.QTC_ORIGIN_ASSET_ID);
        assert.equal(req.destinationAsset, nearIntents.QTC_NEAR_ASSET_ID);
        assert.equal(req.recipient, 'alice.near');
        assert.equal(req.dry, false);
        return jsonResponse({
          quote: {
            depositAddress: sampleQtcAddr,
            deadline: '2026-11-23T08:00:00.000Z',
            minAmountIn: '1000000000000',
            minAmountInFormatted: '1.0',
            amountOutFormatted: '1.0'
          }
        });
      }
      if (url.startsWith('https://smartrouter.ref.finance/findPath')) {
        return jsonResponse({ result_code: -1, result_message: 'No classic AMM pool', result_data: { routes: [], amount_out: '0' } });
      }
      if (url === chainContracts.NEAR_RPC_URL) {
        const rpcReq = JSON.parse(opts.body);
        if (rpcReq.params?.account_id === chainContracts.DCL_CONTRACT_ID && rpcReq.params?.method_name === 'quote') {
          const quoteArgs = JSON.parse(Buffer.from(rpcReq.params.args_base64, 'base64').toString('utf8'));
          assert.deepEqual(quoteArgs.pool_ids, ['17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near|2000']);
          return jsonResponse({ jsonrpc: '2.0', id: rpcReq.id, result: { result: encodeJsonBytes({ amount: '301401333836', tag: null }) } });
        }
        if (rpcReq.params?.account_id === nearIntents.QTC_NEAR_CONTRACT && rpcReq.params?.method_name === 'ft_balance_of') {
          return jsonResponse({ jsonrpc: '2.0', id: rpcReq.id, result: { result: encodeJsonBytes('1500000000000') } });
        }
        if (rpcReq.params?.method_name === 'storage_balance_of') {
          return jsonResponse({ jsonrpc: '2.0', id: rpcReq.id, result: { result: encodeJsonBytes({ total: '1250000000000000000000' }) } });
        }
      }
      return jsonResponse({}, 404);
    },
    async () => {
      // 1. Fetch qtc.omft.near 12-decimal balance
      const balMap = await nearIntents.fetchNearNep141Balances('alice.near');
      assert.equal(balMap['qtc.omft.near'].formatted, 1.5);

      // 2. Request cross-chain QTC deposit address
      const depRes = await nearIntents.requestCrossChainDepositAddress({ nearAccountId: 'alice.near' });
      assert.equal(depRes.ok, true);
      assert.equal(depRes.depositAddress, sampleQtcAddr);
      assert.equal(depRes.minAmountInFormatted, '1.0');

      // 3. Ref SmartRouter fallback automatically hits dclv2.ref-labs.near for USDC -> QTC
      const dclQ = await chainContracts.quoteNearRefFinanceSwap({
        tokenIn: nearIntents.NEAR_USDC_CONTRACT,
        tokenOut: nearIntents.QTC_NEAR_CONTRACT,
        amountRaw: '12000000',
        slippageBps: 100
      });
      assert.equal(dclQ.ok, true);
      assert.equal(dclQ.isDcl, true);
      assert.equal(dclQ.amountOut, '301401333836');
      assert.deepEqual(dclQ.poolIds, ['17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near|2000']);

      // 4. executeNearDclPoolSwap signs ft_transfer_call to dclv2.ref-labs.near
      chainContracts.signAndSendNearFunctionCall = async (params) => {
        capturedSendCall = params;
        return 'dcl_tx_hash_01';
      };
      try {
        const execWallet = {
          nearNamedAccount: 'alice.near',
          nearPublicKey: 'ed25519:11111111111111111111111111111111',
          nearPrivateKey: 'ed25519:1111111111111111111111111111111111111111111111111111111111111111',
          nativeBalances: { near: 2.0 },
          nearBalance: 2.0
        };
        const execRes = await chainContracts.executeNearRefFinanceSwap({
          wallet: execWallet,
          routeData: dclQ.routeData,
          poolIds: dclQ.poolIds,
          minAmountOut: dclQ.minAmountOut,
          tokenIn: nearIntents.NEAR_USDC_CONTRACT,
          tokenOut: nearIntents.QTC_NEAR_CONTRACT,
          amountRaw: '12000000',
          tokenBalance: 20,
          inputDecimals: 6,
          tokenSymbol: 'USDC'
        });
        assert.equal(execRes.txHash, 'dcl_tx_hash_01');
        assert.equal(capturedSendCall.receiverId, nearIntents.NEAR_USDC_CONTRACT);
        assert.equal(capturedSendCall.methodName, 'ft_transfer_call');
        const argsObj = JSON.parse(capturedSendCall.argsJson);
        assert.equal(argsObj.receiver_id, 'dclv2.ref-labs.near');
        const msgObj = JSON.parse(argsObj.msg);
        assert.deepEqual(msgObj.Swap.pool_ids, ['17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near|2000']);
        assert.equal(msgObj.Swap.output_token, 'qtc.omft.near');
      } finally {
        chainContracts.signAndSendNearFunctionCall = origFnCall;
      }
    }
  );
});

test('Module 7: Parent-token aggregation filters zero-balance spam, keeps core tokens at 0, merges real L1/L2 + NEAR NEP-141 PRL/QTC', async () => {
  await withMockedStorage({}, async () => {
    // Part A: Fresh / zero-balance wallet shows ONLY 7 core symbols (NEAR, PRL, QTC, SOL, ETH, BNB, BTC), each with 1 primary chain
    const zeroWallet = state.normalizeWalletRecord({
      id: 'w_zero',
      name: 'Zero Wallet',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { near: 0, prl: 0, sol: 0, eth: 0, base: 0, arb: 0, bsc: 0, hood: 0, hype: 0, btc: 0 },
      nearNep141Balances: { 'prl.omft.near': { raw: '0', formatted: 0 }, 'qtc.omft.near': { raw: '0', formatted: 0 }, 'usdt.tether-token.near': { raw: '0', formatted: 0 } },
      splBalances: {},
      erc20Balances: {}
    });
    state.wallets = [zeroWallet];
    state.activeWalletId = zeroWallet.id;
    state.expandedSymbol = null;

    const zeroGroups = uiController.buildAggregatedAssetGroups(zeroWallet);
    assert.deepEqual(
      zeroGroups.map((g) => g.symbolKey),
      ['NEAR', 'PRL', 'QTC', 'SOL', 'ETH', 'BNB', 'BTC']
    );
    assert.equal(zeroGroups.every((g) => g.entries.length === 1), true, 'Zero-balance default groups show max 1 primary native chain');
    assert.equal(zeroGroups.find((g) => g.symbolKey === 'PRL').entries[0].blockchain, 'prl');
    assert.equal(zeroGroups.find((g) => g.symbolKey === 'QTC').entries[0].blockchain, 'near');
    assert.equal(zeroGroups.find((g) => g.symbolKey === 'ETH').entries[0].blockchain, 'eth');
    assert.equal(zeroGroups.find((g) => g.symbolKey === 'BNB').entries[0].blockchain, 'bsc');
    assert.equal(zeroGroups.find((g) => g.symbolKey === 'BTC').entries[0].blockchain, 'btc');

    // Part B: Funded wallet aggregates real L1/L2 balances & NEAR NEP-141 PRL without any intents.near virtual rows
    const wallet = state.normalizeWalletRecord({
      id: 'w_agg',
      name: 'Agg Wallet',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: {
        near: 5,
        sol: 2.5,
        eth: 1.2,
        base: 0.3,
        arb: 0.5,
        hood: 0,
        bsc: 0,
        hype: 0,
        prl: 100,
        btc: 0
      },
      nearNep141Balances: {
        'prl.omft.near': { raw: '5000000000', formatted: 50 },
        'usdt.tether-token.near': { raw: '10000000', formatted: 10 }
      },
      splBalances: {
        Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: 15
      },
      erc20Balances: {
        eth: {
          '0xdac17f958d2ee523a2206206994597c13d831ec7': 25
        }
      }
    });

    state.wallets = [wallet];
    state.activeWalletId = wallet.id;
    state.expandedSymbol = null;
    state.liveTokens = [];

    const groups = uiController.buildAggregatedAssetGroups(wallet);
    const bySym = Object.fromEntries(groups.map((g) => [g.symbolKey, g]));

    // USDT appears (>0) = NEAR NEP-141(10) + SPL(15) + ERC20 ETH(25) = 50, zero-balance BSC USDT filtered out
    assert.equal(bySym.USDT.totalBalance, 50);
    assert.equal(bySym.USDT.entries.length, 3);
    assert.equal(bySym.USDT.entries.some((e) => e.kind === 'intents'), false);

    // ETH = native ETH(1.2) + native Base(0.3) + native Arb(0.5) = 2.0 (Hood with 0 filtered out)
    assert.ok(Math.abs(bySym.ETH.totalBalance - 2.0) < 1e-12);
    assert.equal(bySym.ETH.entries.length, 3);

    // PRL = Pearl L1(100) + NEAR NEP-141 prl.omft.near(50) = 150
    assert.equal(bySym.PRL.totalBalance, 150);
    assert.equal(bySym.PRL.entries.length, 2);
    assert.deepEqual(bySym.PRL.entries.map((e) => e.blockchain).sort(), ['near', 'prl']);

    // USDC (0 balance across all chains) is hidden completely
    assert.equal(bySym.USDC, undefined);

    // Verify expand / collapse UI drawer rendering with ZERO intents.near or '存入 Intents'
    const prevDoc = globalThis.document;
    const domNodes = {
      'home-unified-asset-list': { innerHTML: '' },
      'hero-total-usd': { textContent: '' }
    };
    globalThis.document = {
      getElementById(id) {
        return domNodes[id] || null;
      }
    };
    try {
      uiController.toggleAssetExpand('PRL');
      assert.equal(state.expandedSymbol, 'PRL');
      const html = domNodes['home-unified-asset-list'].innerHTML;
      assert.ok(html.includes('asset-group-card expanded'));
      assert.ok(html.includes('asset-drawer'));
      assert.ok(html.includes('asset-sub-row'));
      assert.ok(html.includes('prl.omft.near'));
      assert.equal(html.includes('intents.near'), false, 'Home asset drawer must NEVER display intents.near');
      assert.equal(html.includes('存入 Intents'), false, 'Home asset drawer must NEVER display Deposit to Intents');

      uiController.toggleAssetExpand('PRL');
      assert.equal(state.expandedSymbol, null);
      assert.equal(domNodes['home-unified-asset-list'].innerHTML.includes('asset-drawer'), false);
    } finally {
      if (prevDoc === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = prevDoc;
      }
    }
  });
});

test('Build & Sync Verification: HTML/CSS/SW artifacts & dist/, android/, ios/ match root SHA-256 hashes', () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  const swJs = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');

  // Verify HTML loads core eager scripts in strict dependency order
  const scriptSrcs = [...indexHtml.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const expectedScripts = [
    'bip39-wordlist.js',
    'src/crypto-engine.js',
    'src/token-registry.js',
    'src/near-intents.js',
    'src/chain-contracts.js',
    'src/limit-orders.js',
    'src/hyperliquid-perps.js',
    'src/state.js',
    'src/dapp-browser.js',
    'src/framework-ui.js',
    'src/ui-controller.js'
  ];
  const strippedScripts = scriptSrcs.map((s) => s.split('?')[0]);
  assert.deepEqual(strippedScripts, expectedScripts);

  // Verify style.css contains parent-token drawer styles
  for (const cssClass of ['.asset-group-card', '.asset-drawer', '.asset-sub-row', '.net-mini-pill']) {
    assert.ok(styleCss.includes(cssClass), `style.css must define ${cssClass}`);
  }

  // Verify sw.js CORE_ASSETS aligns with index.html versioned assets
  const versionedHtmlAssets = [
    ...indexHtml.matchAll(/(?:href|src)="((?:style\.css|src\/[^"]+\.js)\?v=[^"]+)"/g)
  ].map((m) => `./${m[1]}`);
  assert.equal(versionedHtmlAssets.length, 11);
  for (const asset of versionedHtmlAssets) {
    assert.ok(swJs.includes(`'${asset}'`), `sw.js CORE_ASSETS must include ${asset}`);
  }

  // Verify scripts/sync-assets.js outputs match across dist/, android/, ios/ (minified for src/*.js & style.css)
  const syncScript = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'sync-assets.js'), 'utf8');
  const listMatch = syncScript.match(/const FILES_TO_SYNC = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'scripts/sync-assets.js must define FILES_TO_SYNC');
  const filesToSync = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.equal(filesToSync.length, 22);

  const targets = [
    path.join(ROOT_DIR, 'dist'),
    path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public'),
    path.join(ROOT_DIR, 'ios', 'App', 'App', 'public')
  ];

  const sha256 = (p) => nodeCrypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

  for (const rel of filesToSync) {
    const srcPath = path.join(ROOT_DIR, rel);
    assert.ok(fs.existsSync(srcPath), `Missing root file: ${rel}`);
    const isMinifiedTarget = rel === 'style.css' || (rel.startsWith('src/') && rel.endsWith('.js') && rel !== 'src/framework-ui.js');
    const expectedHash = isMinifiedTarget ? sha256(path.join(targets[0], rel)) : sha256(srcPath);
    for (const targetDir of targets) {
      const dstPath = path.join(targetDir, rel);
      assert.ok(fs.existsSync(dstPath), `Missing synced file: ${dstPath}`);
      assert.equal(sha256(dstPath), expectedHash, `SHA-256 mismatch for ${dstPath}`);
    }
  }

  // Verify pure NEAR Master-Account L1-only Chain Abstraction UI
  assert.equal(indexHtml.includes('swap-signer-row'), false, 'Pure CA wallet must not show local-key vs MPC dual-track toggle');
  assert.equal(indexHtml.includes('swap-mode-intents-btn'), false, 'Unified Swap must not show Intents vs Contracts mode toggle');
  assert.equal(indexHtml.includes('swap-intents-options'), false, 'Unified Swap must not show intents.near balance options');
  assert.ok(indexHtml.includes('swap-auto-route-badge'), 'Unified Swap must show automatic route badge');
});
