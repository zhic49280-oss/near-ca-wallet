'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const nodeCrypto = require('node:crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

// Load all 7 core modules in browser script order (each attaches cleanly to globalThis.NearCA* & module.exports)
const cryptoEngine = require('../src/crypto-engine.js');
const tokenRegistry = require('../src/token-registry.js');
const nearIntents = require('../src/near-intents.js');
const chainContracts = require('../src/chain-contracts.js');
const miningPro = require('../src/mining-pro.js');
const state = require('../src/state.js');
const uiController = require('../src/ui-controller.js');

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

// Helper to create a Response-like mock compatible with fetchJsonWithTimeout (.text) & fetchWithTimeout (.json)
function jsonResponse(body, status = 200, statusText = 'OK') {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: async () => serialized,
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body)
  };
}

async function withMockedFetch(handler, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options, calls);
  };
  try {
    return await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function createMemoryStorage(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, val) {
      store.set(String(key), String(val));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    _store: store
  };
}

async function withMockedStorage(initialEntries, fn) {
  const prevStorage = globalThis.localStorage;
  const storage = createMemoryStorage(initialEntries);
  globalThis.localStorage = storage;
  try {
    return await fn(storage);
  } finally {
    if (prevStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = prevStorage;
    }
  }
}

function readBorshString(buf, offset) {
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + len;
  return {
    value: buf.slice(start, end).toString('utf8'),
    nextOffset: end
  };
}

// Snapshot initial STAKING_POOLS state before any tests mutate it
const INITIAL_STAKING_SNAPSHOT = chainContracts.STAKING_POOLS.map((p) => ({
  id: p.id,
  apy: p.apy,
  rate: p.rate,
  tvlText: p.tvlText,
  stakersCount: p.stakersCount
}));

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
  assert.ok(qtcResolved.primaryUrl.startsWith('https://'));
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
        if (req.destinationAsset === '1cs_v1:near:nep141:qtc.omft.near') {
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
    'src/state.js',
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
  assert.equal(versionedHtmlAssets.length, 7);
  for (const asset of versionedHtmlAssets) {
    assert.ok(swJs.includes(`'${asset}'`), `sw.js CORE_ASSETS must include ${asset}`);
  }

  // Verify scripts/sync-assets.js outputs match root SHA-256 hashes
  const syncScript = fs.readFileSync(path.join(ROOT_DIR, 'scripts', 'sync-assets.js'), 'utf8');
  const listMatch = syncScript.match(/const FILES_TO_SYNC = \[([\s\S]*?)\];/);
  assert.ok(listMatch, 'scripts/sync-assets.js must define FILES_TO_SYNC');
  const filesToSync = [...listMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.equal(filesToSync.length, 18);

  const targets = [
    path.join(ROOT_DIR, 'dist'),
    path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public'),
    path.join(ROOT_DIR, 'ios', 'App', 'App', 'public')
  ];

  const sha256 = (p) => nodeCrypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

  for (const rel of filesToSync) {
    const srcPath = path.join(ROOT_DIR, rel);
    assert.ok(fs.existsSync(srcPath), `Missing root file: ${rel}`);
    const expectedHash = sha256(srcPath);
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

test('v1.7 Module 2: Solana xStocks (16 tokenized equities), Robinhood (PONS/USDG/CASHCAT) & Arc Network (no fake ARC token)', () => {
  const expectedXStocks = [
    'NVDAx', 'TSLAx', 'AAPLx', 'MSFTx', 'GOOGLx', 'AMZNx', 'METAx', 'SPYx',
    'QQQx', 'MSTRx', 'COINx', 'PLTRx', 'HOODx', 'CRCLx', 'GLDx', 'SPCXx'
  ];
  const solDex = tokenRegistry.DEX_CHAIN_TOKENS.sol || [];
  for (const sym of expectedXStocks) {
    const hit = solDex.find((t) => t.symbol === sym);
    assert.ok(hit, `DEX_CHAIN_TOKENS.sol must include ${sym}`);
    assert.equal(hit.decimals, 8, `${sym} must have decimals === 8`);
    assert.equal(hit.category, 'xstock', `${sym} must have category === 'xstock'`);
    assert.equal(hit.price, null, `${sym} must start with price === null`);
  }

  const hoodCore = tokenRegistry.UNIFIED_CORE_TOKENS.filter((t) => t.blockchain === 'hood');
  const hoodDex = tokenRegistry.DEX_CHAIN_TOKENS.hood || [];
  for (const sym of ['PONS', 'USDG', 'CASHCAT', 'ETH']) {
    assert.ok(hoodCore.some((t) => t.symbol === sym), `UNIFIED_CORE_TOKENS.hood must retain ${sym}`);
    assert.ok(hoodDex.some((t) => t.symbol === sym), `DEX_CHAIN_TOKENS.hood must retain ${sym}`);
  }

  assert.equal(tokenRegistry.getChainMeta('arc').key, 'arc');
  assert.equal(tokenRegistry.getChainMeta('arcnetwork').key, 'arc');
  assert.equal(tokenRegistry.getChainMeta('arc').name, 'Arc Network');
  const allCuratedTokens = [
    ...tokenRegistry.UNIFIED_CORE_TOKENS,
    ...Object.values(tokenRegistry.DEX_CHAIN_TOKENS).flat()
  ];
  assert.equal(
    allCuratedTokens.some((t) => String(t.symbol || '').toUpperCase() === 'ARC'),
    false,
    'Curated token lists must NEVER contain a fake ARC token (Arc Network has not launched a native token and uses USDC for gas)'
  );
});

test('v1.7 Module 3: fetchLiveDefuseTokenPrices keeps hood (PONS/USDG), filters dead test tokens, hydrates xStocks & searchJupiterTokensV2', async () => {
  const nvdax = tokenRegistry.DEX_CHAIN_TOKENS.sol.find((t) => t.symbol === 'NVDAx');
  const prevPrice = nvdax ? nvdax.price : null;
  try {
    await withMockedFetch(async (url) => {
      if (url.includes('1click.chaindefuser.com/v0/tokens')) {
        return jsonResponse([
          { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.25 },
          { assetId: 'nep141:hood-0x39dbed3a2bd333467115de45665cc57f813c4571.omft.near', symbol: 'PONS', blockchain: 'hood', contractAddress: '0x39dbed3a2bd333467115de45665cc57f813c4571', decimals: 18, price: 0.12 },
          { assetId: 'nep141:dead-ssc1.omft.near', symbol: 'SSC1_PIT', blockchain: 'sol', decimals: 6, price: 1.0 },
          { assetId: 'nep141:dead-fogo.omft.near', symbol: 'FOGO', blockchain: 'sol', decimals: 6, price: 0.5 },
          { assetId: 'nep141:deprecated-test.omft.near', symbol: 'DEPRECATED_TOK', blockchain: 'eth', decimals: 18, price: 1.0 }
        ]);
      }
      if (url.includes('lite-api.jup.ag/tokens/v2/search?query=xStock')) {
        return jsonResponse([
          { id: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', symbol: 'NVDAx', name: 'NVIDIA xStock', decimals: 8, usdPrice: 138.45, icon: 'https://cdn.example.com/nvdax.png' }
        ]);
      }
      if (url.includes('lite-api.jup.ag/tokens/v2/search?query=WIF')) {
        return jsonResponse([
          { id: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', name: 'dogwifhat', decimals: 6, usdPrice: 1.88, icon: 'https://cdn.example.com/wif.png' }
        ]);
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const live = await nearIntents.fetchLiveDefuseTokenPrices();
      assert.ok(Array.isArray(live));
      assert.ok(live.some((t) => t.symbol === 'PONS' && t.blockchain === 'hood'), 'hood PONS must be kept');
      assert.equal(live.some((t) => t.symbol === 'SSC1_PIT' || t.symbol === 'FOGO'), false, 'dead test tokens must be filtered');
      assert.equal(live.some((t) => t.symbol === 'DEPRECATED_TOK'), false, 'DEPRECATED tokens must be filtered');
      assert.equal(nvdax.price, 138.45, 'NVDAx must hydrate live price from Jupiter V2 xStocks');

      const searchHits = await nearIntents.searchJupiterTokensV2('WIF');
      assert.equal(searchHits.length, 1);
      assert.equal(searchHits[0].symbol, 'WIF');
      assert.equal(searchHits[0].blockchain, 'sol');
      assert.equal(searchHits[0].price, 1.88);
    });
  } finally {
    if (nvdax) nvdax.price = prevPrice;
  }
});

test('v1.7 Module 4: quoteSolanaJupiterSwap compares Jupiter V1 & Raydium V1 and picks highest outAmount', async () => {
  await withMockedFetch(async (url) => {
    if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
      return jsonResponse({ outAmount: '45000000', otherAmountThreshold: '44500000', routePlan: [] });
    }
    if (url.includes('transaction-v1.raydium.io/compute/swap-base-in')) {
      return jsonResponse({ success: true, data: { swapType: 'BaseIn', inputMint: 'So111', outputMint: 'Xsc9', inputAmount: '1000000000', outputAmount: '46500000' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q = await chainContracts.quoteSolanaJupiterSwap({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
      amountRaw: '1000000000',
      slippageBps: 100
    });
    assert.equal(q.outAmount, '46500000');
    assert.equal(q.bestSource, 'Raydium V1');
    assert.equal(q.comparedPools, 2);
    assert.ok(q.routeLabel.includes('Raydium V1'));
  });
});

test('v1.7 Module 4: quoteEvmDexSwap compares KyberSwap + ParaSwap + OpenOcean and handles HTTP 403 gracefully', async () => {
  await withMockedFetch(async (url) => {
    if (url.includes('aggregator-api.kyberswap.com')) {
      return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '1000000000000000000', amountInUsd: '100', amountOutUsd: '99.8' } } });
    }
    if (url.includes('api.paraswap.io/prices')) {
      return jsonResponse({ priceRoute: { destAmount: '1050000000000000000', srcUSD: '100', destUSD: '104.5' } });
    }
    if (url.includes('open-api.openocean.finance')) {
      return jsonResponse({ code: 403, error: 'Forbidden' }, 403, 'Forbidden');
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q = await chainContracts.quoteEvmDexSwap({
      chainKey: 'base',
      srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      destToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountRaw: '50000000000000000',
      srcDecimals: 18,
      destDecimals: 6,
      slippageBps: 100
    });
    assert.equal(q.ok, true);
    assert.equal(q.bestSource, 'ParaSwap');
    assert.equal(q.amountOut, '1050000000000000000');
    assert.equal(q.comparedPools, 2);
  });
});

test('v1.7 Module 3: quoteBestNearPairSwap & quoteCrossChainWithDexRelay (NEAR -> NVDAx, NVDAx -> NEAR, 100 NEAR -> PONS)', async () => {
  // 1. NEAR -> QTC multi-pool best price (Rhea CLMM dclv2 beats 1Click)
  await withMockedFetch(async (url, opts) => {
    if (url.includes('smartrouter.ref.finance')) {
      return jsonResponse({ code: 1000, msg: 'No path' });
    }
    if (url.includes('rpc.mainnet.near.org')) {
      const resultBytes = [...Buffer.from(JSON.stringify({ amount: '950000000000' }), 'utf8')];
      return jsonResponse({ jsonrpc: '2.0', result: { result: resultBytes } });
    }
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      return jsonResponse({ quote: { amountOut: '900000000000', amountOutFormatted: '0.9', amountInUsd: '10', amountOutUsd: '9.5' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const bestNear = await nearIntents.quoteBestNearPairSwap({
      fromToken: { symbol: 'USDC', blockchain: 'near', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6 },
      toToken: { symbol: 'QTC', blockchain: 'near', assetId: '1cs_v1:near:nep141:qtc.omft.near', contractAddress: 'qtc.omft.near', decimals: 12 },
      amountRaw: '10000000',
      recipient: 'alice.near',
      nearAccountId: 'alice.near'
    });
    assert.equal(bestNear.ok, true);
    assert.equal(bestNear.amountOut, '950000000000');
    assert.equal(bestNear.bestSource, 'Rhea CLMM (dclv2)');
    assert.equal(bestNear.comparedRoutesCount, 2);
  });

  // 2. 100 NEAR -> NVDAx (CROSS_CHAIN_TO_SOL_DEX: 1Click -> SOL + Jupiter/Raydium)
  await withMockedFetch(async (url) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      return jsonResponse({ quote: { amountOut: '3900000000', amountOutFormatted: '3.9', amountInUsd: '325', amountOutUsd: '324' } });
    }
    if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
      return jsonResponse({ outAmount: '234560000', otherAmountThreshold: '232000000', routePlan: [] });
    }
    if (url.includes('transaction-v1.raydium.io')) {
      return jsonResponse({ success: true, data: { outputAmount: '231000000' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: { symbol: 'NEAR', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 },
      toToken: tokenRegistry.DEX_CHAIN_TOKENS.sol.find((t) => t.symbol === 'NVDAx'),
      amountRaw: '100000000000000000000000000',
      recipient: '11111111111111111111111111111111',
      refundTo: 'alice.near',
      nearAccountId: 'alice.near',
      solAddress: '11111111111111111111111111111111'
    });
    assert.equal(q.ok, true);
    assert.equal(q.compositeType, 'CROSS_CHAIN_TO_SOL_DEX');
    assert.equal(q.amountOut, '234560000');
    assert.equal(q.amountOutFormatted, '2.3456');
  });

  // 3. NVDAx -> NEAR (SOL_DEX_TO_CROSS_CHAIN: Jupiter/Raydium -> SOL + 1Click)
  await withMockedFetch(async (url) => {
    if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
      return jsonResponse({ outAmount: '1650000000', otherAmountThreshold: '1630000000', routePlan: [] });
    }
    if (url.includes('transaction-v1.raydium.io')) {
      return jsonResponse({ success: false }, 400, 'Bad Request');
    }
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      return jsonResponse({ quote: { amountOut: '42000000000000000000000000', amountOutFormatted: '42', amountInUsd: '138', amountOutUsd: '137' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: tokenRegistry.DEX_CHAIN_TOKENS.sol.find((t) => t.symbol === 'NVDAx'),
      toToken: { symbol: 'NEAR', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 },
      amountRaw: '100000000',
      recipient: 'alice.near',
      refundTo: '11111111111111111111111111111111',
      nearAccountId: 'alice.near',
      solAddress: '11111111111111111111111111111111'
    });
    assert.equal(q.ok, true);
    assert.equal(q.compositeType, 'SOL_DEX_TO_CROSS_CHAIN');
    assert.equal(q.amountOutFormatted, '42');
  });

  // 4. 100 NEAR -> PONS (hood): when Direct 1Click returns No liquidity available, Route B (1Click -> HOOD ETH + KyberSwap Robinhood) succeeds!
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const body = JSON.parse(opts.body || '{}');
      if (body.destinationAsset === 'nep141:hood.omft.near') {
        return jsonResponse({ quote: { amountOut: '177000000000000000', amountOutFormatted: '0.177', amountInUsd: '325', amountOutUsd: '324' } });
      }
      return jsonResponse({ message: 'No liquidity available' }, 400, 'Bad Request');
    }
    if (url.includes('aggregator-api.kyberswap.com/robinhood/api/v1/routes')) {
      return jsonResponse({
        code: 0,
        data: { routeSummary: { amountOut: '2710000000000000000000', amountInUsd: '324', amountOutUsd: '320' } }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const ponsHood = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PONS' && t.blockchain === 'hood');
    const q = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: { symbol: 'NEAR', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 },
      toToken: ponsHood,
      amountRaw: '100000000000000000000000000',
      recipient: '0x1111111111111111111111111111111111111111',
      refundTo: 'alice.near',
      nearAccountId: 'alice.near',
      evmAddress: '0x1111111111111111111111111111111111111111'
    });
    assert.equal(q.ok, true);
    assert.equal(q.compositeType, 'CROSS_CHAIN_TO_EVM_DEX');
    assert.equal(q.amountOut, '2710000000000000000000');
    assert.ok(q.routeLabel.includes('HOOD') && q.routeLabel.includes('KyberSwap'));
  });
});

test('Arc Network: EVM_CHAINS.arc config, balance pre-validation, and USDC-only grouping without fake ARC coin', async () => {
  assert.equal(chainContracts.EVM_CHAINS.arc.chainId, 5042);
  assert.equal(chainContracts.EVM_CHAINS.arc.symbol, 'USDC');
  assert.equal(chainContracts.EVM_CHAINS.arc.rpc, 'https://rpc.mainnet.arc.io');

  await withMockedStorage({}, async () => {
    const w = state.normalizeWalletRecord({
      id: 'w_arc',
      name: 'ArcTest',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { arc: 12.5 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.syncWalletCompatBalances(w);

    assert.throws(
      () => chainContracts.validateSufficientChainBalance({ wallet: w, chain: 'arc', tokenSymbol: 'USDC', amount: 12.5, isNative: true }),
      (err) => err.code === 'INSUFFICIENT_BALANCE' && /USDC/.test(err.message)
    );
    const valid = chainContracts.validateSufficientChainBalance({ wallet: w, chain: 'arc', tokenSymbol: 'USDC', amount: 5, isNative: true });
    assert.equal(valid.ok, true);

    const groups = uiController.buildAggregatedAssetGroups(w);
    const arcFakeGroup = groups.find((g) => g.symbolKey === 'ARC');
    assert.equal(arcFakeGroup, undefined, 'Home asset groups must NEVER show a fake ARC token');
    const usdcGroup = groups.find((g) => g.symbolKey === 'USDC');
    assert.ok(usdcGroup, 'Funded Arc native balance must group under USDC');
    const arcEntry = usdcGroup.entries.find((e) => e.blockchain === 'arc');
    assert.ok(arcEntry);
    assert.equal(arcEntry.balance, 12.5);
    assert.equal(arcEntry.assetId, 'arc:native:usdc');
  });
});

test('v1.8: Official QTC icon, zero ref-new-1 S3 URLs, sanitizeImageUrl SVG/base64, ft_metadata hydration & receipt token filtering', async () => {
  assert.ok(
    tokenRegistry.TOKEN_ICON_MAP.QTC.startsWith('https://')
  );
  for (const [sym, url] of Object.entries(tokenRegistry.TOKEN_ICON_MAP)) {
    assert.equal(String(url).includes('ref-new-1.s3.amazonaws.com'), false, `TOKEN_ICON_MAP.${sym} must not use 403 S3 URL`);
  }

  assert.ok(tokenRegistry.sanitizeImageUrl('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E'));
  assert.ok(tokenRegistry.sanitizeImageUrl('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5" fill="#fff"/></svg>').startsWith('data:image/svg+xml;utf8,'));
  assert.equal(tokenRegistry.sanitizeImageUrl('data:image/svg+xml,<svg onload="alert(1)"><script>alert(1)</script></svg>'), '');
  assert.equal(tokenRegistry.sanitizeImageUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='), '');

  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/tokens')) {
      return jsonResponse([
        { assetId: 'nep141:853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near', symbol: 'FRAX', blockchain: 'near', contractAddress: '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near', decimals: 18, price: 1.0 },
        { assetId: 'nep141:stjack.tkn.primitives.near', symbol: 'STJACK', blockchain: 'near', contractAddress: 'stjack.tkn.primitives.near', decimals: 18, price: 0.01 },
        { assetId: 'nep141:strkbtc.omdep.near', symbol: 'strkBTC', blockchain: 'near', decimals: 8, price: 90000 },
        { assetId: 'nep141:gtusdcp.omft.near', symbol: 'gtUSDCp', blockchain: 'base', decimals: 6, price: 1.0 }
      ]);
    }
    if (url.includes('free.rpc.fastnear.com')) {
      const body = JSON.parse(opts.body || '{}');
      const acct = body?.params?.account_id;
      if (acct === '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near') {
        const metaBytes = [...Buffer.from(JSON.stringify({ symbol: 'FRAX', icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E' }), 'utf8')];
        return jsonResponse({ jsonrpc: '2.0', result: { result: metaBytes } });
      }
    }
    if (url.includes('indexer.ref.finance/list-token')) {
      return jsonResponse({ 'frax.near': { symbol: 'FRAX', icon: 'https://ref-new-1.s3.amazonaws.com/token/bad.svg' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const live = await nearIntents.fetchLiveDefuseTokenPrices();
    assert.ok(Array.isArray(live));
    const frax = live.find((t) => t.symbol === 'FRAX');
    assert.ok(frax, 'FRAX must remain in live tokens');
    assert.ok(frax.logoURI && frax.logoURI.startsWith('data:image/svg+xml'), 'FRAX must receive self-contained ft_metadata SVG icon');
    assert.equal(frax.logoURI.includes('ref-new-1.s3.amazonaws.com'), false, 'Broken S3 icon must never override');
    for (const dead of ['STJACK', 'strkBTC', 'gtUSDCp']) {
      assert.equal(live.some((t) => t.symbol === dead), false, `${dead} must be filtered`);
    }
  });
});

test('v1.8: Favorite tokens bar, Arc receive/hub/picker support, no xStocks filter pill, no mining sweep card', async () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="token-picker-favorites"'), 'index.html must contain #token-picker-favorites');
  assert.equal(indexHtml.includes('mining-sweep-amount'), false, '#sheet-mining-pro must not contain redundant sweep card');
  assert.equal(indexHtml.includes('mining-sweep-dest'), false, '#sheet-mining-pro must not contain redundant sweep dropdown');
  assert.ok(Array.isArray(tokenRegistry.DEX_CHAIN_TOKENS.arc) && tokenRegistry.DEX_CHAIN_TOKENS.arc[0].symbol === 'USDC');

  await withMockedStorage({}, async (storage) => {
    const w = state.normalizeWalletRecord({
      id: 'w_v18',
      name: 'V18Wallet',
      mnemonic: TEST_MNEMONIC,
      nearAddress: 'a'.repeat(64)
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.loadFavoriteTokens();
    assert.ok(state.favoriteTokenIds.includes('nep141:wrap.near'));

    const favNvdaxId = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
    assert.equal(state.toggleFavoriteTokenId(favNvdaxId), true);
    assert.ok(JSON.parse(storage.getItem(state.FAV_TOKENS_STORAGE_KEY)).includes(favNvdaxId));
    assert.equal(state.toggleFavoriteTokenId(favNvdaxId), false);
    assert.equal(JSON.parse(storage.getItem(state.FAV_TOKENS_STORAGE_KEY)).includes(favNvdaxId), false);

    const prevDoc = globalThis.document;
    const makeClassList = () => ({ add() {}, remove() {}, toggle() {} });
    const domNodes = {
      'token-picker-search': { value: '' },
      'token-picker-favorites': { innerHTML: '', classList: makeClassList() },
      'token-picker-chains': { innerHTML: '' },
      'token-picker-list': { innerHTML: '' },
      'sheet-receive': { classList: makeClassList(), setAttribute() {} },
      'modal-backdrop': { classList: makeClassList() },
      'receive-network-pills': { innerHTML: '' },
      'receive-addr-label': { textContent: '' },
      'receive-addr-value': { textContent: '' },
      'receive-qr-container': { innerHTML: '' },
      'hub-near-current-id': { textContent: '' },
      'hub-mpc-evm-address': { textContent: '' },
      'hub-addresses-list': { innerHTML: '' }
    };
    globalThis.document = {
      body: { style: {} },
      getElementById(id) {
        return domNodes[id] || null;
      },
      querySelectorAll() {
        return [];
      }
    };
    try {
      uiController.renderTokenPickerList();
      assert.ok(domNodes['token-picker-favorites'].innerHTML.includes('data-action="select-swap-token"'));
      assert.ok(domNodes['token-picker-chains'].innerHTML.includes('data-action="set-picker-chain" data-chain="arc"'));
      assert.equal(domNodes['token-picker-chains'].innerHTML.includes('data-chain="xstock"'), false, 'xStocks filter pill must be removed');
      assert.ok(domNodes['token-picker-list'].innerHTML.includes('data-action="toggle-fav-token"'));

      uiController.openReceiveSheet('arc');
      assert.ok(domNodes['receive-network-pills'].innerHTML.includes('data-action="select-receive-network" data-net="evm"'));
      assert.ok(domNodes['receive-network-pills'].innerHTML.includes('EVM (ETH / Base / ARB / OP / POL / BSC / Arc)'));
      assert.equal(domNodes['receive-network-pills'].innerHTML.includes('data-net="arc"'), false);
      assert.equal(domNodes['receive-addr-value'].textContent, w.mpcEvmAddress);

      uiController.switchTab('hub');
      assert.ok(domNodes['hub-addresses-list'].innerHTML.includes('EVM (ETH / Base / ARB / OP / POL / BSC / Arc)'));
      assert.equal(domNodes['hub-addresses-list'].innerHTML.includes('Arc Network (USDC'), false);
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  });
});

test('v1.9: Whitish Circle Arc icon/badge, QTC orange badge, 18 Arc Mainnet tokens, & Kyber/LI.FI live discovery', async () => {
  const arcMeta = tokenRegistry.getChainMeta('arc');
  assert.equal(arcMeta.color, '#F8FAFC');
  assert.equal(arcMeta.textColor, '#0F172A');
  assert.ok(arcMeta.logoUrl.endsWith('/arc-dark.svg'));
  assert.ok(arcMeta.fallbackLogoUrl.startsWith('data:image/svg+xml;base64,'));
  assert.ok(arcMeta.badgeSvg.includes('#F8FAFC') && arcMeta.badgeSvg.includes('#0F172A'));

  const qtcMeta = tokenRegistry.getChainMeta('qtc');
  assert.ok(qtcMeta.badgeSvg.includes('#F97316') && qtcMeta.badgeSvg.includes('#0A0A0A'));
  assert.equal(qtcMeta.badgeSvg.includes('#00F5D4'), false, 'QTC badge must not use cyan atom styling');

  const arcList = tokenRegistry.DEX_CHAIN_TOKENS.arc || [];
  assert.ok(arcList.length >= 18, 'DEX_CHAIN_TOKENS.arc must contain at least 18 real Arc Mainnet tokens');
  for (const sym of ['USDC', 'EURC', 'cirBTC', 'WETH', 'CRCL', 'AF', 'ARCMAN', 'ARCOON', 'ARGUS', 'ASTOCK', 'TOLLY', 'FAZE', 'KAIRO', 'LONG', 'oBrain', 'MALA', 'DUKE', 'ARCUS']) {
    assert.ok(arcList.some((t) => t.symbol === sym), `DEX_CHAIN_TOKENS.arc must include ${sym}`);
  }
  const arcUsdc = arcList.find((t) => t.symbol === 'USDC');
  assert.equal(String(arcUsdc.contractAddress).toLowerCase(), '0x3600000000000000000000000000000000000000');
  assert.equal(arcUsdc.decimals, 6);
  assert.equal(arcList.some((t) => String(t.symbol).toUpperCase() === 'ARC'), false, 'Arc catalog must NEVER expose a fake ARC token');

  for (const sym of ['EURC', 'WUSDC', 'XYUSDC', 'USYC', 'CIRBTC', 'RAY', 'VIRTUAL', 'DEGEN', 'PENDLE', 'FDUSD', 'BTCB']) {
    assert.ok(tokenRegistry.TOKEN_ICON_MAP[sym], `TOKEN_ICON_MAP must include ${sym}`);
  }

  await withMockedFetch(async (url) => {
    if (url.includes('1click.chaindefuser.com/v0/tokens')) {
      return jsonResponse([
        { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.25 },
        { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', symbol: 'USDC', blockchain: 'near', contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, price: 1.0 }
      ]);
    }
    if (url.includes('ks-setting.kyberswap.com/api/v1/tokens')) {
      return jsonResponse({
        data: {
          tokens: [
            { chainId: 8453, address: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b', symbol: 'VIRTUAL', name: 'Virtuals Protocol', decimals: 18, logoURI: 'https://cdn.example.org/virtual.png' },
            { chainId: 5042, address: '0x000000000000000000000000000000000000dead', symbol: 'ARC', name: 'Fake ARC', decimals: 18 },
            { chainId: 5042, address: '0x1111111111111111111111111111111111111111', symbol: 'ARCNEW', name: 'Arc New Mainnet', decimals: 18, logoURI: 'https://cdn.example.org/arcnew.png' }
          ]
        }
      });
    }
    if (url.includes('li.quest/v1/tokens')) {
      return jsonResponse({
        tokens: {
          5042: [
            { chainId: 5042, address: '0x1B11111111111111111111111111111111111111', symbol: 'CRCL', name: 'Circle Stock', decimals: 18, priceUSD: '105.42', logoURI: 'https://cdn.example.org/crcl.png' },
            { chainId: 5042, address: '0x000000000000000000000000000000000000beef', symbol: 'ARC', name: 'Fake ARC', decimals: 18, priceUSD: '9.99' },
            { chainId: 5042, address: '0x2222222222222222222222222222222222222222', symbol: 'LIFINEW', name: 'Lifi Arc Token', decimals: 6, priceUSD: '2.50', logoURI: 'https://cdn.example.org/lifinew.png' }
          ]
        }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const live = await nearIntents.fetchLiveDefuseTokenPrices();
    assert.ok(live.some((t) => t.blockchain === 'base' && t.symbol === 'VIRTUAL'));
    assert.ok(live.some((t) => t.blockchain === 'arc' && t.symbol === 'ARCNEW'));
    const lifiToken = live.find((t) => t.blockchain === 'arc' && t.symbol === 'LIFINEW');
    assert.ok(lifiToken, 'LI.FI Arc Mainnet discovery must merge new tokens');
    assert.equal(lifiToken.price, 2.5);
    assert.equal(lifiToken.logoURI, 'https://cdn.example.org/lifinew.png');
    assert.equal(live.some((t) => String(t.symbol).toUpperCase() === 'ARC'), false, 'Fake ARC symbol must never enter catalog');
  });
});

test('v1.9: Arc Mainnet (5042) same-chain Kyber vs LI.FI multi-pool quoting & cross-chain Relay/LI.FI/1Click routing', async () => {
  assert.equal(chainContracts.EVM_CHAINS.arc.chainId, 5042);
  assert.equal(chainContracts.EVM_CHAINS.arc.kyber, 'arc');
  assert.equal(chainContracts.EVM_CHAINS.arc.explorer, 'https://explorer.arc.io/tx/');
  assert.equal(chainContracts.EVM_CHAINS.arc.gasReserve, 0.02);

  // 1. Same-chain Arc Mainnet quote: native 0xEeee... (18 dec) normalized to 0x3600...0000 (6 dec), competing KyberSwap vs LI.FI
  let seenKyberAmount = null;
  let seenKyberTokenIn = null;
  let seenLifiAmount = null;
  await withMockedFetch(async (url) => {
    if (url.includes('aggregator-api.kyberswap.com/arc/api/v1/routes')) {
      const u = new URL(url);
      seenKyberTokenIn = u.searchParams.get('tokenIn');
      seenKyberAmount = u.searchParams.get('amountIn');
      return jsonResponse({
        code: 0,
        data: {
          routerAddress: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
          routeSummary: {
            tokenIn: seenKyberTokenIn,
            amountIn: seenKyberAmount,
            amountOut: '908399'
          }
        }
      });
    }
    if (url.includes('li.quest/v1/quote')) {
      const u = new URL(url);
      seenLifiAmount = u.searchParams.get('fromAmount');
      return jsonResponse({
        estimate: { toAmount: '906128', approvalAddress: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' },
        transactionRequest: { to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', data: '0xabcdef', value: '0x0' }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const eurcQuote = await chainContracts.quoteEvmDexSwap({
      chainKey: 'arc',
      srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      destToken: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
      amountRaw: '1000000000000000000', // 1 USDC in 18 dec -> must normalize to 1000000 (6 dec)
      srcDecimals: 18,
      destDecimals: 6,
      fromAddress: '0xa2869D3977DEa9afc9B9c069491ac08F06F9e458'
    });
    assert.equal(seenKyberTokenIn?.toLowerCase(), '0x3600000000000000000000000000000000000000');
    assert.equal(seenKyberAmount, '1000000');
    assert.equal(seenLifiAmount, '1000000');
    assert.equal(eurcQuote.ok, true);
    assert.equal(eurcQuote.bestSource, 'KyberSwap');
    assert.equal(eurcQuote.routeSource, 'kyber');
    assert.ok(eurcQuote.comparedPools >= 2, 'Arc Mainnet USDC->EURC must compare KyberSwap and LI.FI');
    assert.equal(eurcQuote.amountOut, '908399');
  });

  // 2. Cross-chain Arc Mainnet quoting: NEAR->Arc USDC, NEAR->Arc EURC, Base USDC->Arc USDC, Arc USDC->NEAR
  const nearTok = { symbol: 'NEAR', assetId: 'nep141:wrap.near', blockchain: 'near', decimals: 24 };
  const arcUsdcTok = { symbol: 'USDC', assetId: 'arc:0x3600000000000000000000000000000000000000', blockchain: 'arc', contractAddress: '0x3600000000000000000000000000000000000000', decimals: 6 };
  const arcEurcTok = { symbol: 'EURC', assetId: 'arc:0x89b50855aa3be2f677cd6303cec089b5f319d72a', blockchain: 'arc', contractAddress: '0x89b50855aa3be2f677cd6303cec089b5f319d72a', decimals: 6 };
  const baseUsdcTok = { symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', blockchain: 'base', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 };

  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const body = JSON.parse(opts.body || '{}');
      if (String(body.destinationAsset || '').includes('base')) {
        return jsonResponse({
          quote: { depositAddress: 'base-dep.intents.near', amountOut: '3250000', timeEstimate: 15, amountOutUsd: '3.25' },
          correlationId: 'cid-near-base'
        });
      }
      return jsonResponse({
        quote: { depositAddress: 'near-dep.intents.near', amountOut: '1000000000000000000000000', timeEstimate: 15, amountOutUsd: '3.25' },
        correlationId: 'cid-base-near'
      });
    }
    if (url.includes('api.relay.link/quote')) {
      const body = JSON.parse(opts.body || '{}');
      const outAmt = body.originChainId === 5042 ? '3150000' : '3177801';
      return jsonResponse({
        steps: [{ id: 'deposit', items: [{ data: { to: '0x1111111111111111111111111111111111111111', data: '0x1234', value: '0', chainId: body.originChainId } }] }],
        details: { currencyOut: { amount: outAmt } }
      });
    }
    if (url.includes('li.quest/v1/quote')) {
      const u = new URL(url);
      const fromAmt = BigInt(u.searchParams.get('fromAmount') || '1000000');
      const outAmt = (fromAmt * 95n / 100n).toString();
      return jsonResponse({
        estimate: { toAmount: outAmt, approvalAddress: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' },
        transactionRequest: { to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', data: '0x9999', value: '0x0' }
      });
    }
    if (url.includes('aggregator-api.kyberswap.com/arc/api/v1/routes')) {
      return jsonResponse({
        code: 0,
        data: { routerAddress: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5', routeSummary: { amountOut: '2886000' } }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q1 = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: nearTok,
      toToken: arcUsdcTok,
      amountRaw: '1000000000000000000000000',
      recipient: '0xabc0000000000000000000000000000000000001',
      refundTo: 'alice.near',
      nearAccountId: 'alice.near',
      evmAddress: '0xabc0000000000000000000000000000000000001'
    });
    assert.equal(q1.ok, true);
    assert.equal(q1.compositeType, 'CROSS_CHAIN_TO_ARC_MAINNET');
    assert.ok(q1.stage1Quote && q1.bridgeQuote);
    assert.equal(q1.amountOut, '3177801');

    const q2 = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: nearTok,
      toToken: arcEurcTok,
      amountRaw: '1000000000000000000000000',
      recipient: '0xabc0000000000000000000000000000000000001',
      refundTo: 'alice.near',
      nearAccountId: 'alice.near',
      evmAddress: '0xabc0000000000000000000000000000000000001'
    });
    assert.equal(q2.ok, true);
    assert.equal(q2.compositeType, 'CROSS_CHAIN_TO_ARC_MAINNET');
    assert.ok(q2.stage1Quote && q2.bridgeQuote && q2.dexQuote);
    assert.ok(q2.comparedPools >= 2);
    assert.equal(q2.amountOut, '3018910'); // LI.FI (3018910) beats mocked KyberSwap (2886000)

    const q3 = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: baseUsdcTok,
      toToken: arcUsdcTok,
      amountRaw: '3250000',
      recipient: '0xabc0000000000000000000000000000000000001',
      refundTo: '0xabc0000000000000000000000000000000000001',
      nearAccountId: 'alice.near',
      evmAddress: '0xabc0000000000000000000000000000000000001'
    });
    assert.equal(q3.ok, true);
    assert.equal(q3.compositeType, 'EVM_TO_ARC_MAINNET');
    assert.ok(q3.bridgeQuote);
    assert.equal(q3.amountOut, '3177801');

    const q4 = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: arcUsdcTok,
      toToken: nearTok,
      amountRaw: '3250000',
      recipient: 'alice.near',
      refundTo: '0xabc0000000000000000000000000000000000001',
      nearAccountId: 'alice.near',
      evmAddress: '0xabc0000000000000000000000000000000000001'
    });
    assert.equal(q4.ok, true);
    assert.equal(q4.compositeType, 'ARC_MAINNET_TO_CROSS_CHAIN');
    assert.ok(q4.bridgeQuote && q4.stage3Quote);
    assert.equal(q4.amountOut, '1000000000000000000000000');
  });
});

test('v1.9 Requirement #5: Rhea Ecosystem tokens (RHEA/rNEAR/xRHEA/oRHEA) registry, ft_metadata icons, live prices & Ref/DCL swap', async () => {
  const nearTokens = tokenRegistry.DEX_CHAIN_TOKENS.near || [];
  const expectedRhea = [
    { symbol: 'RHEA', contract: 'token.rhealab.near', decimals: 18 },
    { symbol: 'rNEAR', contract: 'lst.rhealab.near', decimals: 24 },
    { symbol: 'xRHEA', contract: 'xtoken.rhealab.near', decimals: 18 },
    { symbol: 'oRHEA', contract: 'otoken.rhealab.near', decimals: 18 }
  ];
  for (const item of expectedRhea) {
    const hit = nearTokens.find((t) => t.symbol === item.symbol);
    assert.ok(hit, `DEX_CHAIN_TOKENS.near must include ${item.symbol}`);
    assert.equal(hit.contractAddress, item.contract);
    assert.equal(hit.decimals, item.decimals);
    assert.equal(nearIntents.DEFAULT_NEAR_NEP141_CONTRACTS[item.contract], item.decimals);
  }

  const fakeSvgIcon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjwvc3ZnPg==';
  const rheaRef = nearTokens.find((t) => t.symbol === 'RHEA');
  const prevRheaPrice = rheaRef.price;
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('1click.chaindefuser.com/v0/tokens')) {
        return jsonResponse([{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.2 }]);
      }
      if (url.includes('indexer.ref.finance/list-token-price')) {
        return jsonResponse({
          'token.rhealab.near': { price: '0.0322', symbol: 'RHEA', decimal: 18 },
          'lst.rhealab.near': { price: '3.42', symbol: 'rNEAR', decimal: 24 },
          'xtoken.rhealab.near': { price: '0.0360', symbol: 'XRHEA', decimal: 18 },
          'otoken.rhealab.near': { price: '0.0194', symbol: 'ORHEA', decimal: 18 }
        });
      }
      if ((url.includes('fastnear.com') || url.includes('rpc.mainnet.near.org')) && opts?.body) {
        const b = JSON.parse(opts.body);
        if (b?.params?.method_name === 'ft_metadata') {
          const acc = b.params.account_id;
          const bytes = [...Buffer.from(JSON.stringify({ symbol: acc.split('.')[0].toUpperCase(), icon: fakeSvgIcon }), 'utf8')];
          return jsonResponse({ jsonrpc: '2.0', result: { result: bytes } });
        }
      }
      if (url.includes('smartrouter.ref.finance/findPath')) {
        return jsonResponse({
          result_code: 0,
          result_data: {
            amount_out: '10018446387477801536748',
            routes: [{ pools: [{ pool_id: 9999, token_in: 'token.rhealab.near', token_out: 'wrap.near', min_amount_out: '9900000000000000000000' }] }]
          }
        });
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      await nearIntents.fetchLiveDefuseTokenPrices();
      assert.equal(rheaRef.price, 0.0322, 'RHEA price must hydrate from indexer.ref.finance/list-token-price');
      assert.ok(rheaRef.logoURI && rheaRef.logoURI.startsWith('data:image/svg+xml;base64,'));
      assert.ok(tokenRegistry.resolveTokenIcon(rheaRef).primaryUrl.startsWith('data:image/svg+xml;base64,'));

      const swapQ = await nearIntents.quoteBestNearPairSwap({
        fromToken: rheaRef,
        toToken: nearTokens.find((t) => t.symbol === 'NEAR'),
        amountRaw: '1000000000000000000',
        recipient: 'alice.near',
        nearAccountId: 'alice.near'
      });
      assert.equal(swapQ.ok, true);
      assert.equal(swapQ.amountOut, '10018446387477801536748');
    });
  } finally {
    rheaRef.price = prevRheaPrice;
  }
});

test('v1.9 Requirement #6: Rhea 3 pools + 16-pool Staking Hub live rates, tx signing, pre-validation, search & filter UI', async () => {
  const rpcJsonBytes = (obj) => [...Buffer.from(JSON.stringify(obj), 'utf8')];
  const padHex = (v) => `0x${BigInt(v).toString(16).padStart(64, '0')}`;

  await withMockedFetch(async (url, opts) => {
    if (url.includes('rpc.mainnet.near.org') && opts?.body) {
      const b = JSON.parse(opts.body);
      const acc = b?.params?.account_id;
      const m = b?.params?.method_name;
      if (acc === 'lst.rhealab.near' && m === 'get_summary') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes({ ft_price: '1069637344361771804257671' }) } });
      }
      if (acc === 'xtoken.rhealab.near' && m === 'get_virtual_price') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('111881575') } });
      }
      if (acc === 'xtoken.rhealab.near' && m === 'contract_metadata') {
        return jsonResponse({
          jsonrpc: '2.0',
          result: { result: rpcJsonBytes({ reward_per_sec: '160108024691358040', cur_locked_token_amount: '136117762726615079773327417' }) }
        });
      }
      if (acc === 'orhea-conv.rhealab.near' && m === 'get_conversion_strategy_infos') {
        return jsonResponse({
          jsonrpc: '2.0',
          result: {
            result: rpcJsonBytes({
              '{"Oneshot":{"lock_period_days":15,"source_token_id":"otoken.rhealab.near","target_token_id":"token.rhealab.near"}}': { conversion_rate: '500000000000000000000000000000' },
              '{"Oneshot":{"lock_period_days":45,"source_token_id":"otoken.rhealab.near","target_token_id":"token.rhealab.near"}}': { conversion_rate: '600000000000000000000000000000' },
              '{"Oneshot":{"lock_period_days":91,"source_token_id":"otoken.rhealab.near","target_token_id":"token.rhealab.near"}}': { conversion_rate: '700000000000000000000000000000' },
              '{"Oneshot":{"lock_period_days":181,"source_token_id":"otoken.rhealab.near","target_token_id":"token.rhealab.near"}}': { conversion_rate: '1000000000000000000000000000000' }
            })
          }
        });
      }
      if (acc === 'linear-protocol.near' && m === 'ft_price') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('1431741150062675486967391') } });
      }
      if (acc === 'v2-nearx.stader-labs.near' && m === 'get_nearx_price') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('1836624380879012817590929') } });
      }
    }
    if (url.includes('api.ref.finance/get-rnear-apy')) {
      return jsonResponse({ code: 0, data: '4.489928', msg: 'success' });
    }
    if (url.includes('validators.narwallets.com/metrics_json')) {
      return jsonResponse({ st_near_30_day_apy: 4.07, st_near_price: 1.515, linear_30_day_apy: 4.25 });
    }
    if (url.includes('yields.llama.fi/pools')) {
      return jsonResponse({
        data: [
          { chain: 'Solana', project: 'jito-liquid-staking', symbol: 'JITOSOL', apy: 4.94, tvlUsd: 700000000 },
          { chain: 'Solana', project: 'jupiter-staked-sol', symbol: 'JUPSOL', apy: 5.15, tvlUsd: 370000000 },
          { chain: 'Solana', project: 'marinade-liquid-staking', symbol: 'MSOL', apy: 5.71, tvlUsd: 160000000 },
          { chain: 'Solana', project: 'sanctum-infinity', symbol: 'INF', apy: 5.41, tvlUsd: 136000000 },
          { chain: 'Ethereum', project: 'ethena-usde', symbol: 'SUSDE', apy: 5.32, tvlUsd: 1180000000 },
          { chain: 'Hyperliquid L1', project: 'kinetiq-khype', symbol: 'KHYPE', apy: 1.84, tvlUsd: 672000000 },
          { chain: 'Base', project: 'aave-v3', symbol: 'USDC', apy: 6.24, tvlUsd: 13400000 },
          { chain: 'Arc', project: 'morpho-blue', symbol: 'STEAKUSDC', apy: 3.61, tvlUsd: 5291000 }
        ]
      });
    }
    if (url.includes('extra-api.sanctum.so/v1/sol-value/current')) {
      return jsonResponse({ solValues: { INF: '1407837461', JitoSOL: '1275866054', jupSOL: '1183944980', mSOL: '1376648063' } });
    }
    if (url.includes('datapi.jup.ag/v1/assets/search')) {
      return jsonResponse([
        { id: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', holderCount: 836170, totalSupply: 6861485665, mcap: 842182762 },
        { id: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', symbol: 'JupSOL', holderCount: 33656, totalSupply: 4225676, mcap: 372660499 },
        { id: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', symbol: 'JitoSOL', holderCount: 184253, totalSupply: 7721878, mcap: 734504232 }
      ]);
    }
    if (url.includes('solana') && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b.method === 'getAccountInfo' && b.params?.[0] === 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN') {
        const buf = Buffer.alloc(100);
        buf.writeBigUInt64LE(1174883785710397n, 73);
        return jsonResponse({ jsonrpc: '2.0', result: { value: { data: [buf.toString('base64'), 'base64'] } } });
      }
    }
    if (url.includes('rpc.mainnet.arc.io')) {
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(996425985202804641n) });
    }
    if (url.includes('aggregator-api.kyberswap.com/hyperevm/api/v1/routes')) {
      return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '973407907372663296' } } });
    }
    if (url.includes('eth-api.lido.fi')) {
      return jsonResponse({ data: { smaApr: 3.12 } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const pools = await chainContracts.fetchAllStakingRates();
    assert.equal(pools.length, 21);
    const byId = Object.fromEntries(pools.map((p) => [p.id, p]));
    assert.equal(byId.rhea_rnear.apy, 4.49);
    assert.ok(Math.abs(byId.rhea_rnear.rate - 1 / 1.069637) < 0.001);
    assert.equal(byId.rhea_xrhea.apy, 3.71);
    assert.ok(Math.abs(byId.rhea_xrhea.rate - 1 / 1.11881575) < 0.001);
    assert.equal(byId.rhea_orhea_convert.lockTiers.length, 4);
    assert.equal(byId.rhea_orhea_convert.lockTiers[0].rate, 0.5);
    assert.equal(byId.rhea_orhea_convert.lockTiers[3].rate, 1.0);
    assert.equal(byId.jupiter_jup.inSymbol, 'JUP');
    assert.equal(byId.jupiter_jup.outSymbol, 'Staked JUP');
    assert.equal(byId.jupiter_jup.rate, 1.0);
    assert.equal(byId.jupiter_jup.apy, 17.02);
    assert.equal(byId.jupiter_jup.isAsrEstimated, true);
    assert.equal(byId.jupiter_jup.stakersCount, 836170);
    assert.ok(byId.jupiter_jup.tvlText && byId.jupiter_jup.tvlText.includes('JUP'));
    assert.equal(byId.jupiter_sol.apy, 5.15);
    assert.equal(byId.jupiter_sol.stakersCount, 33656);
    assert.equal(byId.arc_steak_usdc.apy, 3.61);
    assert.ok(Math.abs(byId.arc_steak_usdc.rate - 0.996425) < 0.001);

    // Pre-validation & real transaction payloads for Rhea pools
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const emptyWallet = state.normalizeWalletRecord({
      id: 'w_rhea_empty',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nativeBalances: { near: 0, arc: 0.01 }
    });
    await assert.rejects(
      () => chainContracts.executePoolStake({ wallet: emptyWallet, poolId: 'rhea_xrhea', amount: 10 }),
      (err) => err.code === 'INSUFFICIENT_BALANCE' && /RHEA/.test(err.message)
    );
    await assert.rejects(
      () => chainContracts.executePoolStake({ wallet: emptyWallet, poolId: 'arc_steak_usdc', amount: 1 }),
      (err) => err.code === 'INSUFFICIENT_BALANCE' && /USDC/.test(err.message)
    );

    const fundedWallet = state.normalizeWalletRecord({
      id: 'w_rhea_funded',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nativeBalances: { near: 5.0 },
      nearNep141Balances: {
        'token.rhealab.near': { raw: '100000000000000000000', formatted: 100 },
        'otoken.rhealab.near': { raw: '50000000000000000000', formatted: 50 }
      }
    });
    const sentCalls = [];
    const origFnCall = chainContracts.signAndSendNearFunctionCall;
    chainContracts.signAndSendNearFunctionCall = async (params) => {
      sentCalls.push(params);
      return `tx_${params.receiverId}_${params.methodName}`;
    };
    try {
      const r1 = await chainContracts.executePoolStake({ wallet: fundedWallet, poolId: 'rhea_rnear', amount: 2 });
      assert.equal(r1.poolId, 'rhea_rnear');
      assert.equal(sentCalls[0].receiverId, 'lst.rhealab.near');
      assert.equal(sentCalls[0].methodName, 'deposit_and_stake');
      assert.equal(sentCalls[0].depositYocto, chainContracts.toBaseUnits(2, 24));

      const r2 = await chainContracts.executePoolStake({ wallet: fundedWallet, poolId: 'rhea_xrhea', amount: 10 });
      assert.equal(r2.poolId, 'rhea_xrhea');
      assert.equal(sentCalls[1].receiverId, 'token.rhealab.near');
      assert.equal(sentCalls[1].methodName, 'ft_transfer_call');
      const args2 = JSON.parse(sentCalls[1].argsJson);
      assert.equal(args2.receiver_id, 'xtoken.rhealab.near');

      const r3 = await chainContracts.executePoolStake({ wallet: fundedWallet, poolId: 'rhea_orhea_convert', amount: 10, lockDays: 91 });
      assert.equal(r3.poolId, 'rhea_orhea_convert');
      assert.equal(sentCalls[2].receiverId, 'otoken.rhealab.near');
      assert.equal(sentCalls[2].methodName, 'ft_transfer_call');
      const args3 = JSON.parse(sentCalls[2].argsJson);
      assert.equal(args3.receiver_id, 'orhea-conv.rhealab.near');
      assert.deepEqual(JSON.parse(args3.msg), {
        Oneshot: {
          lock_period_days: 91,
          source_token_id: 'otoken.rhealab.near',
          target_token_id: 'token.rhealab.near'
        }
      });
    } finally {
      chainContracts.signAndSendNearFunctionCall = origFnCall;
    }

    // Verify UI search, filters & oRHEA lock period selector
    const makeClassList = () => {
      const set = new Set(['hidden']);
      return {
        add: (...c) => c.forEach((x) => set.add(x)),
        remove: (...c) => c.forEach((x) => set.delete(x)),
        toggle: (c, force) => (force === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : (force ? set.add(c) : set.delete(c))),
        has: (c) => set.has(c)
      };
    };
    const domNodes = {
      'staking-pools-list': { innerHTML: '' },
      'earn-pool-search': { value: '' },
      'earn-selected-title': { textContent: '' },
      'earn-avail-balance': { textContent: '' },
      'earn-in-symbol': { textContent: '' },
      'earn-live-apy': { textContent: '' },
      'earn-tvl-val': { textContent: '' },
      'earn-stakers-val': { textContent: '' },
      'earn-live-rate': { textContent: '' },
      'earn-amount-in': { value: '10' },
      'earn-est-out': { textContent: '' },
      'earn-lock-row': { classList: makeClassList() },
      'earn-lock-tiers': { innerHTML: '' }
    };
    const prevDoc = globalThis.document;
    globalThis.document = { getElementById: (id) => domNodes[id] || null, querySelectorAll: () => [] };
    try {
      await withMockedStorage({}, async () => {
        state.wallets = [fundedWallet];
        state.activeWalletId = fundedWallet.id;
        state.staking.pools = pools;
        state.staking.filter = 'featured';
        state.staking.search = '';
        state.staking.selectedPoolId = 'rhea_rnear';

        uiController.renderEarnView();
        assert.equal((domNodes['staking-pools-list'].innerHTML.match(/staking-pool-card/g) || []).length, 9, 'Featured pill must render 9 major featured pools');

        uiController.selectStakingPool('jupiter_jup');
        assert.ok(domNodes['earn-tvl-val'].textContent.includes('JUP'));
        assert.equal(domNodes['earn-stakers-val'].textContent, '836,170');

        uiController.setEarnPoolFilter('all');
        assert.equal((domNodes['staking-pools-list'].innerHTML.match(/staking-pool-card/g) || []).length, 21, 'All Pools pill must render all 21 pools');

        // Typing into search must search ALL 16 pools even while featured filter is active
        uiController.setEarnPoolFilter('featured');
        uiController.handleEarnPoolSearch('LiNEAR');
        assert.ok(domNodes['staking-pools-list'].innerHTML.includes('LiNEAR Protocol'));

        uiController.handleEarnPoolSearch('');
        uiController.selectStakingPool('rhea_orhea_convert');
        assert.equal(domNodes['earn-lock-row'].classList.has('hidden'), false, 'Lock period selector must appear for oRHEA Convert');
        uiController.selectEarnLockTier(91);
        assert.equal(domNodes['earn-live-rate'].textContent, '1 oRHEA = 0.7000 RHEA');
        assert.ok(domNodes['earn-est-out'].textContent.startsWith('7 RHEA'));
      });
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  });
});

test('v2.0 Fix 1: formatTokenPrice precision, Arc DexScreener+Kyber pricing & priority order in picker', async () => {
  assert.equal(uiController.formatTokenPrice(null), '--');
  assert.equal(uiController.formatTokenPrice(0), '--');
  assert.equal(uiController.formatTokenPrice(54.75), '$54.75');
  assert.equal(uiController.formatTokenPrice(0.0322), '$0.0322');
  assert.equal(uiController.formatTokenPrice(0.00075), '$0.000750');
  assert.equal(uiController.formatTokenPrice(0.000126), '$0.000126');
  assert.equal(uiController.formatTokenPrice(0.00001842), '$0.00001842');
  assert.equal(uiController.formatTokenPrice(0.00075).includes('$0.00 '), false);

  const astockTok = tokenRegistry.DEX_CHAIN_TOKENS.arc.find((t) => t.symbol === 'ASTOCK');
  const arcoonTok = tokenRegistry.DEX_CHAIN_TOKENS.arc.find((t) => t.symbol === 'ARCOON');
  const prevAstockPrice = astockTok.price;
  const prevArcoonPrice = arcoonTok.price;
  astockTok.price = null;
  arcoonTok.price = null;

  try {
    await withMockedFetch(async (url) => {
      if (url.includes('1click.chaindefuser.com/v0/tokens')) {
        return jsonResponse([{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.2 }]);
      }
      if (url.includes('api.dexscreener.com/latest/dex/tokens/') && url.includes('0x4c9b47dbd5933aa4574b2c27f82419e4dbbd0222')) {
        return jsonResponse({
          pairs: [
            { baseToken: { address: '0x4c9b47dbd5933aa4574b2c27f82419e4dbbd0222', symbol: 'ASTOCK' }, priceUsd: '0.000750', liquidity: { usd: 94000 } }
          ]
        });
      }
      if (url.includes('aggregator-api.kyberswap.com/arc/api/v1/routes') && url.includes('0x4621a0baa0b5d97aae77704cf2a84dabe78a4fed')) {
        return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '1251877132499883917312', amountInUsd: '10' } } });
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      await nearIntents.fetchLiveDefuseTokenPrices();
      assert.equal(astockTok.price, 0.00075);
      assert.ok(Math.abs(arcoonTok.price - 0.007988) < 0.0002);
    });

    // Verify picker priority order puts USDC, EURC, cirBTC, WETH, CRCL, steakUSDC BEFORE AF/ARCMAN
    const pickerList = { innerHTML: '' };
    const prevDoc = globalThis.document;
    globalThis.document = {
      getElementById: (id) => (id === 'token-picker-list' ? pickerList : id === 'token-picker-search' ? { value: '' } : null),
      querySelectorAll: () => []
    };
    try {
      await withMockedStorage({}, async () => {
        const w = state.normalizeWalletRecord({ id: 'w_arc_pick', mnemonic: TEST_MNEMONIC });
        state.wallets = [w];
        state.activeWalletId = w.id;
        state.swap.pickerChainFilter = 'arc';
        uiController.renderTokenPickerList();
        const symbols = [...pickerList.innerHTML.matchAll(/<span class="asset-sub-name">([^·<]+) ·/g)].map((m) => m[1].trim());
        assert.deepEqual(symbols.slice(0, 6), ['USDC', 'EURC', 'cirBTC', 'WETH', 'CRCL', 'steakUSDC']);
        assert.ok(pickerList.innerHTML.includes('$0.000750'), 'Sub-cent Arc price must show 6 decimals instead of $0.00');
      });
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  } finally {
    astockTok.price = prevAstockPrice;
    arcoonTok.price = prevArcoonPrice;
  }
});

test('v2.0 Fix 2: 1 RHEA -> oRHEA via Ref V2 Pool #6573, dynamic pool lookup, 2-hop & DCL pools', async () => {
  const rpcJsonBytes = (obj) => [...Buffer.from(JSON.stringify(obj), 'utf8')];
  await withMockedFetch(async (url, opts) => {
    if (url.includes('smartrouter.ref.finance/findPath')) {
      return jsonResponse({ result_code: 1008, result_message: 'Pool TVL too low', result_data: { routes: [] } });
    }
    if (url.includes('rpc.mainnet.near.org') && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b?.params?.account_id === 'v2.ref-finance.near' && b?.params?.method_name === 'get_return') {
        const args = JSON.parse(Buffer.from(b.params.args_base64, 'base64').toString('utf8'));
        if (args.pool_id === 6573 && args.token_in === 'token.rhealab.near' && args.token_out === 'otoken.rhealab.near') {
          return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('1438414689682104290') } });
        }
        if (args.pool_id === 6472 && args.token_in === 'xtoken.rhealab.near' && args.token_out === 'token.rhealab.near') {
          return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('1118815750000000000') } });
        }
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const rheaTok = tokenRegistry.DEX_CHAIN_TOKENS.near.find((t) => t.symbol === 'RHEA');
    const orheaTok = tokenRegistry.DEX_CHAIN_TOKENS.near.find((t) => t.symbol === 'oRHEA');
    const xrheaTok = tokenRegistry.DEX_CHAIN_TOKENS.near.find((t) => t.symbol === 'xRHEA');

    const best = await nearIntents.quoteBestNearPairSwap({
      fromToken: rheaTok,
      toToken: orheaTok,
      amountRaw: '1000000000000000000',
      recipient: 'alice.near',
      nearAccountId: 'alice.near'
    });
    assert.equal(best.ok, true);
    assert.equal(best.amountOut, '1438414689682104290');
    assert.equal(best.actions[0].pool_id, 6573);

    // 2-hop Ref V2: xRHEA -> RHEA (#6472) -> oRHEA (#6573)
    const twoHop = await chainContracts.quoteNearRefFinanceSwap({
      tokenIn: xrheaTok.contractAddress,
      tokenOut: orheaTok.contractAddress,
      amountRaw: '1000000000000000000'
    });
    assert.equal(twoHop.ok, true);
    assert.equal(twoHop.actions.length, 2);
    assert.equal(twoHop.actions[0].pool_id, 6472);
    assert.equal(twoHop.actions[1].pool_id, 6573);
    assert.equal(twoHop.amountOut, '1438414689682104290');
  });
});

test('v2.0 Fix 3: Jupiter DAO Staking (JUP -> Staked JUP) PDA derivation, pre-validation & signed tx broadcast', async () => {
  const voterProg = cryptoEngine.base58Decode('voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj');
  const locker = cryptoEngine.base58Decode('CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN');
  const sampleOwner = cryptoEngine.base58Decode('76Xruq2npxNFXYBhw8kyg4bTtfhmn71fTZtzEHVw7RPM');
  const pda = await chainContracts.findSolanaPdaAsync(
    [new TextEncoder().encode('Escrow'), locker, sampleOwner],
    voterProg
  );
  assert.equal(pda.address, 'GamrkyF6eUik7nFYPJ2sKDzicAhZaLebgZr7V4ce9ZME');

  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const noJupWallet = state.normalizeWalletRecord({
    id: 'w_nojup',
    mnemonic: TEST_MNEMONIC,
    nativeBalances: { sol: 0.1 },
    splBalances: { JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 0 }
  });
  await assert.rejects(
    () => chainContracts.executePoolStake({ wallet: noJupWallet, poolId: 'jupiter_jup', amount: 10 }),
    (err) => err.code === 'INSUFFICIENT_BALANCE' && /JUP/.test(err.message)
  );

  const fundedJupWallet = state.normalizeWalletRecord({
    id: 'w_jup_ok',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    nativeBalances: { near: 2.0, sol: 0.1 },
    splBalances: { JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 100 }
  });
  state.syncWalletCompatBalances(fundedJupWallet);
  let broadcastedTxB64 = null;
  const dummyBlockHash = cryptoEngine.base58Encode(Buffer.alloc(32, 7));
  const mpcSigSuccessB64 = Buffer.from(JSON.stringify({ signature: Array(64).fill(7) }), 'utf8').toString('base64');
  await withMockedFetch(async (url, opts) => {
    if (url.includes('solana') && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b.method === 'getAccountInfo') return jsonResponse({ jsonrpc: '2.0', result: { value: null } });
      if (b.method === 'getLatestBlockhash') return jsonResponse({ jsonrpc: '2.0', result: { value: { blockhash: cryptoEngine.base58Encode(Buffer.alloc(32, 9)) } } });
      if (b.method === 'sendTransaction') {
        broadcastedTxB64 = b.params[0];
        return jsonResponse({ jsonrpc: '2.0', result: '5jupDaoStakeSig111111111111111111111111111' });
      }
    }
    if (url.includes('rpc.mainnet.near.org') && opts?.body) {
      const rpc = JSON.parse(opts.body);
      if (rpc.method === 'query' && rpc.params?.request_type === 'view_access_key') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { nonce: 11, block_hash: dummyBlockHash } });
      }
      if (rpc.method === 'broadcast_tx_commit') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { transaction: { hash: 'MPC_JUP_SIGN' }, status: { SuccessValue: mpcSigSuccessB64 } } });
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const res = await chainContracts.executePoolStake({ wallet: fundedJupWallet, poolId: 'jupiter_jup', amount: 25 });
    assert.equal(res.txHash, '5jupDaoStakeSig111111111111111111111111111');
    assert.equal(res.inSymbol, 'JUP');
    assert.equal(res.outSymbol, 'Staked JUP');
    assert.ok(broadcastedTxB64 && Buffer.from(broadcastedTxB64, 'base64').length > 100);
  });
});

// ==================== v2.1 Biometrics, Native iOS/Android & Security Modal ====================

function createMockClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...cls) => cls.forEach((c) => set.add(c)),
    remove: (...cls) => cls.forEach((c) => set.delete(c)),
    toggle: (c, force) => {
      if (typeof force === 'boolean') {
        if (force) set.add(c);
        else set.delete(c);
        return force;
      }
      if (set.has(c)) { set.delete(c); return false; }
      set.add(c);
      return true;
    },
    contains: (c) => set.has(c),
    _set: set
  };
}

function createMockDomElement(id, extra = {}) {
  return {
    id,
    textContent: '',
    innerHTML: '',
    className: '',
    disabled: false,
    style: {},
    attributes: {},
    classList: createMockClassList(extra.classes || []),
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] ?? null; },
    querySelectorAll() { return []; },
    ...extra
  };
}

test('v2.1 Native iOS/Android Capacitor Security Bridge Files & Config', () => {
  const capConfigPath = path.join(ROOT_DIR, 'capacitor.config.json');
  const capConfig = JSON.parse(fs.readFileSync(capConfigPath, 'utf8'));
  assert.equal(capConfig.appId, 'io.nexus.wallet');
  assert.equal(capConfig.appName, 'Nexus Wallet');
  assert.equal(capConfig.webDir, 'dist');
  assert.equal(capConfig.plugins.CapacitorHttp.enabled, true);

  const infoPlist = fs.readFileSync(path.join(ROOT_DIR, 'ios', 'App', 'App', 'Info.plist'), 'utf8');
  assert.match(infoPlist, /NSFaceIDUsageDescription/);
  assert.match(infoPlist, /<string>2\.1<\/string>/);

  const swiftPlugin = fs.readFileSync(path.join(ROOT_DIR, 'ios', 'App', 'App', 'NativeSecurityPlugin.swift'), 'utf8');
  assert.match(swiftPlugin, /public let jsName = "NativeSecurity"/);
  assert.match(swiftPlugin, /getSecurityCapabilities/);
  assert.match(swiftPlugin, /authenticateWithBiometrics/);
  assert.match(swiftPlugin, /deviceOwnerAuthenticationWithBiometrics/);
  assert.match(swiftPlugin, /\.deviceOwnerAuthentication,\s*localizedReason/);

  const manifest = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android\.permission\.USE_BIOMETRIC/);
  assert.match(manifest, /android\.permission\.USE_FINGERPRINT/);
  assert.match(manifest, /io\.nexus\.wallet\.MainActivity/);

  const mainActivity = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'io', 'nexus', 'wallet', 'MainActivity.java'), 'utf8');
  assert.match(mainActivity, /registerPlugin\(NativeSecurityPlugin\.class\)/);

  const javaPlugin = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'io', 'nexus', 'wallet', 'NativeSecurityPlugin.java'), 'utf8');
  assert.match(javaPlugin, /@CapacitorPlugin\(name = "NativeSecurity"\)/);
  assert.match(javaPlugin, /getSecurityCapabilities/);
  assert.match(javaPlugin, /authenticateWithBiometrics/);
  assert.match(javaPlugin, /BiometricPrompt/);
  assert.match(javaPlugin, /KeyguardManager/);
});

test('v2.1 Multi-Brand Device & Biometric Capability Detection', async () => {
  const iphone = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    hasWebAuthnPlatform: true
  });
  assert.equal(iphone.platform, 'ios');
  assert.equal(iphone.deviceModel, 'Apple iPhone');
  assert.match(iphone.methodsText, /Face ID \/ Touch ID/);

  const xiaomi = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; 24031PN0DC Build/UKQ1.231003.002) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36'
  });
  assert.equal(xiaomi.platform, 'android');
  assert.match(xiaomi.deviceModel, /Xiaomi.*24031PN0DC/);

  const redmi = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Redmi K70 Pro Build/UKQ1.231003.002) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(redmi.platform, 'android');
  assert.match(redmi.brand, /Xiaomi/i);

  const huawei = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 12; NOH-AN00 Build/HUAWEINOH-AN00) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(huawei.brand, 'Huawei');
  assert.match(huawei.deviceModel, /NOH-AN00/);

  const honor = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; HONOR BVL-AN16 Build/HONORBVL) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(honor.brand, 'Honor');

  const oneplus = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; OnePlus PJF110 Build/UKQ1) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(oneplus.brand, 'OnePlus');

  const cph = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; CPH2581 Build/UKQ1) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.match(cph.brand, /OPPO|OnePlus/);

  const vivo = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; V2309A Build/UP1A) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(vivo.brand, 'vivo');

  const iqoo = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; iQOO 12 Pro Build/UP1A) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.match(iqoo.brand, /iQOO/);

  const samsung = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S9280 Build/UP1A) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(samsung.brand, 'Samsung');
  assert.match(samsung.deviceModel, /SM-S9280/);

  const pixel = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro Build/AP3A) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(pixel.brand, 'Google Pixel');

  const macos = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    hasWebAuthnPlatform: true
  });
  assert.equal(macos.platform, 'macos');
  assert.match(macos.methodsText, /Touch ID/);

  const windows = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    hasWebAuthnPlatform: true
  });
  assert.equal(windows.platform, 'windows');
  assert.match(windows.methodsText, /Windows Hello/);

  const nativeAndroid = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Dalvik/2.1.0 (Linux; Android 14)',
    nativePlugin: {
      async getSecurityCapabilities() {
        return {
          platform: 'android',
          manufacturer: 'Xiaomi',
          brand: 'Xiaomi',
          brandFamily: 'Xiaomi/Redmi',
          model: '24031PN0DC',
          hasFingerprint: true,
          hasFace: true,
          hasDeviceCredential: true,
          biometryType: 'fingerprint_and_face',
          supportsBiometrics: true,
          supportsPasscode: true
        };
      },
      async authenticateWithBiometrics() {
        return { authenticated: true, type: 'biometric' };
      }
    }
  });
  assert.equal(nativeAndroid.nativeAvailable, true);
  assert.equal(nativeAndroid.biometricAvailable, true);
  assert.equal(nativeAndroid.devicePasscodeAvailable, true);
  assert.match(nativeAndroid.deviceModel, /Xiaomi.*24031PN0DC/);
});

test('v2.1 Native Capacitor Auth, WebAuthn Passkey & Interactive #sheet-security-auth Keypad + Biometric Lock', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_sec_test',
      name: 'Bio Test Wallet',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'bio.near',
      pin: '123456'
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.saveWallets();

    // 1. Test Native Capacitor iOS Face ID & Android BiometricPrompt auth paths
    const iosRes = await uiController.requestBiometricAuth('Test Face ID', w, {
      nativePlugin: {
        async authenticateWithBiometrics() {
          return { authenticated: true, type: 'faceID' };
        }
      }
    });
    assert.equal(iosRes.ok, true);
    assert.equal(iosRes.method, 'native');
    assert.equal(iosRes.biometryType, 'faceID');

    const androidRes = await uiController.requestBiometricAuth('Test Android Biometric', w, {
      nativePlugin: {
        async authenticateWithBiometrics() {
          return { authenticated: true, type: 'biometric' };
        }
      }
    });
    assert.equal(androidRes.ok, true);
    assert.equal(androidRes.method, 'native');
    assert.equal(androidRes.biometryType, 'biometric');

    // 2. Test WebAuthn Passkey registration (.create) + subsequent verification (.get)
    let createCalls = 0;
    let getCalls = 0;
    let lastAllowCredBytes = null;
    const rawCredId = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]).buffer;
    const mockNav = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      credentials: {
        async create() {
          createCalls += 1;
          return { rawId: rawCredId };
        },
        async get(opts) {
          getCalls += 1;
          lastAllowCredBytes = opts?.publicKey?.allowCredentials?.[0]?.id || null;
          return { rawId: rawCredId };
        }
      }
    };
    const mockPKC = {
      async isUserVerifyingPlatformAuthenticatorAvailable() {
        return true;
      }
    };

    const webAuthnReg = await uiController.requestBiometricAuth('Enable Passkey', w, {
      navigator: mockNav,
      PublicKeyCredential: mockPKC
    });
    assert.equal(webAuthnReg.ok, true);
    assert.equal(webAuthnReg.method, 'webauthn');
    assert.equal(createCalls, 1);
    assert.ok(w.webauthnCredentialId && w.webauthnCredentialId.length > 5);

    const webAuthnVerify = await uiController.requestBiometricAuth('Verify Passkey', w, {
      navigator: mockNav,
      PublicKeyCredential: mockPKC
    });
    assert.equal(webAuthnVerify.ok, true);
    assert.equal(webAuthnVerify.method, 'webauthn');
    assert.equal(getCalls, 1);
    assert.deepEqual(Array.from(lastAllowCredBytes), [10, 20, 30, 40, 50, 60, 70, 80]);

    // 3. Test Interactive #sheet-security-auth 6-Digit PIN Keypad & Hub Biometric Toggle
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const pinDots = Array.from({ length: 6 }, (_, i) => createMockDomElement(`dot_${i}`, { classes: ['bio-pin-dot'] }));
    const domMap = new Map([
      ['sheet-backdrop', createMockDomElement('sheet-backdrop')],
      ['sheet-security-auth', createMockDomElement('sheet-security-auth', { classes: ['bottom-sheet'] })],
      ['security-auth-device-badge', createMockDomElement('security-auth-device-badge')],
      ['security-auth-reason', createMockDomElement('security-auth-reason')],
      ['btn-security-biometric', createMockDomElement('btn-security-biometric')],
      ['security-pin-section', createMockDomElement('security-pin-section')],
      ['security-pin-dots', createMockDomElement('security-pin-dots', { querySelectorAll: () => pinDots })],
      ['hub-security-bio-card', createMockDomElement('hub-security-bio-card')],
      ['hub-bio-status-badge', createMockDomElement('hub-bio-status-badge')],
      ['hub-bio-device-model', createMockDomElement('hub-bio-device-model')],
      ['hub-bio-methods', createMockDomElement('hub-bio-methods')]
    ]);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: (sel) => {
        if (sel === '.bottom-sheet.open') {
          return Array.from(domMap.values()).filter((el) => el.classList.contains('bottom-sheet') && el.classList.contains('open'));
        }
        return [];
      },
      querySelector: (sel) => {
        if (sel === '.bottom-sheet.open') {
          return Array.from(domMap.values()).find((el) => el.classList.contains('bottom-sheet') && el.classList.contains('open')) || null;
        }
        return null;
      }
    };
    globalThis.window = {
      navigator: mockNav,
      PublicKeyCredential: mockPKC,
      Capacitor: {
        Plugins: {
          NativeSecurity: {
            async getSecurityCapabilities() {
              return { platform: 'ios', deviceModel: 'iPhone', biometryType: 'faceID', supportsBiometrics: true, supportsPasscode: true };
            },
            async authenticateWithBiometrics() {
              return { authenticated: true, type: 'faceID' };
            }
          }
        }
      }
    };

    try {
      // Biometrics (native mock) pass automatically without opening the PIN sheet
      assert.equal(await uiController.verifySecurityAuthAsync(w, 'Confirm Transfer'), true);
      assert.equal(domMap.get('sheet-security-auth').classList.contains('open'), false);

      // Native failure never falls back to wallet PIN (phone passcode is handled natively)
      const nativeAuthFn = globalThis.window.Capacitor.Plugins.NativeSecurity.authenticateWithBiometrics;
      globalThis.window.Capacitor.Plugins.NativeSecurity.authenticateWithBiometrics = async () => ({ authenticated: false, error: 'fail' });
      assert.equal(await uiController.verifySecurityAuthAsync(w, 'x'), false);
      assert.equal(domMap.get('sheet-security-auth').classList.contains('open'), false);
      globalThis.window.Capacitor.Plugins.NativeSecurity.authenticateWithBiometrics = nativeAuthFn;

      // Web (no native plugin): PIN keypad fallback
      delete globalThis.window.Capacitor;
      globalThis.window.navigator = {};
      const authPromise = uiController.verifySecurityAuthAsync(w, 'Confirm Transfer');
      await new Promise((r) => setTimeout(r, 15));
      assert.equal(domMap.get('sheet-security-auth').classList.contains('open'), true);
      assert.equal(domMap.get('security-auth-reason').textContent, 'Confirm Transfer');

      for (const d of ['9', '9', '9', '9', '9', '9']) await uiController.pressSecurityPinDigit(d);
      assert.equal(domMap.get('sheet-security-auth').classList.contains('open'), true);
      assert.equal(pinDots.filter((d) => d.classList.contains('filled')).length, 0);

      await uiController.pressSecurityPinDigit('1');
      await uiController.pressSecurityPinDigit('9');
      uiController.backspaceSecurityPin();
      assert.equal(pinDots.filter((d) => d.classList.contains('filled')).length, 1);
      uiController.clearSecurityPin();
      assert.equal(pinDots.filter((d) => d.classList.contains('filled')).length, 0);

      for (const d of ['1', '2', '3', '4', '5', '6']) await uiController.pressSecurityPinDigit(d);
      assert.equal(await authPromise, true);
      assert.equal(domMap.get('sheet-security-auth').classList.contains('open'), false);
      await uiController.renderHubBiometricCardAsync?.();
    } finally {
      globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
    }
  });
});

test('v2.8 Task 1: EVM Staking Pools TVL (token qty + USD) & holder stakersCount in fetchLiveStakingMetrics', async () => {
  const prevLang = state.lang;
  state.setLanguage('en');
  const padHex = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('yields.llama.fi/pools')) {
        return jsonResponse({
          data: [
            { chain: 'Ethereum', project: 'lido', symbol: 'STETH', apy: 3.05, tvlUsd: 24500000000 },
            { chain: 'Arc', project: 'morpho-blue', symbol: 'STEAKUSDC', apy: 4.12, tvlUsd: 6500000 },
            { chain: 'Base', project: 'aave-v3', symbol: 'USDC', apy: 5.88, tvlUsd: 18200000 },
            { chain: 'Ethereum', project: 'ethena-usde', symbol: 'SUSDE', apy: 6.45, tvlUsd: 1250000000 },
            { chain: 'Hyperliquid L1', project: 'kinetiq-khype', symbol: 'KHYPE', apy: 2.15, tvlUsd: 540000000 }
          ]
        });
      }
      if (url.includes('eth.blockscout.com/api/v2/tokens/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')) {
        return jsonResponse({ holders_count: '492310', total_supply: (9450000n * 10n ** 18n).toString() });
      }
      if (url.includes('eth.blockscout.com/api/v2/tokens/0x9D39A5DE30e57443BfF2A8307A4256c8797A3497')) {
        return jsonResponse({ holders_count: '76540', total_supply: (1100000000n * 10n ** 18n).toString() });
      }
      if (url.includes('api.geckoterminal.com/api/v2/networks/base/tokens/0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB/info')) {
        return jsonResponse({ data: { attributes: { holders: { count: 14280 } } } });
      }
      if (url.includes('eth-api.lido.fi')) {
        return jsonResponse({ data: { smaApr: 3.1 } });
      }
      if (url.includes('aggregator-api.kyberswap.com/hyperevm/api/v1/routes')) {
        return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '950000000000000000' } } });
      }
      if (opts?.body) {
        const body = JSON.parse(opts.body);
        if (body.method === 'eth_call') {
          const to = String(body.params?.[0]?.to || '').toLowerCase();
          const data = String(body.params?.[0]?.data || '').toLowerCase();
          if (to === '0x9d39a5de30e57443bff2a8307a4256c8797a3497' && data === '0x01e1d114') {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(1250000000n * 10n ** 18n) });
          }
          if (to === '0x9d39a5de30e57443bff2a8307a4256c8797a3497' && data.startsWith('0x07a2d13a')) {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(1150000000000000000n) });
          }
          if (to === '0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298' && data === '0x01e1d114') {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(6500000n * 10n ** 6n) });
          }
          if (to === '0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298' && data.startsWith('0xef8b30f7')) {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(990000000000000000n) });
          }
          if (to === '0xfd739d4e423301ce9385c1fb8850539d657c296d' && data === '0x18160ddd') {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(19000000n * 10n ** 18n) });
          }
        }
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const pools = await chainContracts.fetchLiveStakingMetrics();
      const byId = Object.fromEntries(pools.map((p) => [p.id, p]));

      assert.equal(byId.lido_steth.stakersCount, 492310);
      assert.equal(byId.lido_steth.tvlText, '9.45M ETH ($24.50B)');

      assert.equal(byId.arc_steak_usdc.tvlText, '6.50M USDC ($6.50M)');

      assert.equal(byId.aave_base_usdc.stakersCount, 14280);
      assert.equal(byId.aave_base_usdc.tvlText, '18.20M USDC ($18.20M)');

      assert.equal(byId.ethena_susde.stakersCount, 76540);
      assert.equal(byId.ethena_susde.tvlText, '1.25B USDe ($1.25B)');

      // 19M kHYPE / 0.95 rate = 20.00M HYPE
      assert.equal(byId.hyper_khype.tvlText, '20.00M HYPE ($540.00M)');
    });
  } finally {
    state.setLanguage(prevLang);
  }
});

test('v2.8 Task 2: Multi-chain staking positions discovery (NEAR oRHEA + Solana JUP/Validator + EVM LSTs)', async () => {
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const solAddr = keys.solAddress;

  const voterProgId = 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj';
  const lockerAddr = 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN';
  const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const decode58 = (str) => {
    const bytes = [0];
    for (const ch of str) {
      let carry = bs58Alphabet.indexOf(ch);
      for (let i = 0; i < bytes.length; i++) {
        carry += bytes[i] * 58;
        bytes[i] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
    return new Uint8Array(bytes.reverse());
  };
  const escrowPda = await chainContracts.findSolanaPdaAsync(
    [new TextEncoder().encode('Escrow'), decode58(lockerAddr), decode58(solAddr)],
    decode58(voterProgId)
  );

  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/alice.near/full')) {
      return jsonResponse({ pools: [{ pool_id: 'astro-stakers.poolv1.near' }] });
    }
    if (url.includes('rpc.mainnet.near.org') && opts?.body) {
      const b = JSON.parse(opts.body);
      const acc = b.params?.account_id;
      const m = b.params?.method_name;
      if (acc === 'astro-stakers.poolv1.near' && m === 'get_account') {
        const resBytes = [...Buffer.from(JSON.stringify({
          staked_balance: (15n * 10n ** 24n).toString(),
          unstaked_balance: '0',
          can_withdraw: false
        }))];
        return jsonResponse({ jsonrpc: '2.0', result: { result: resBytes } });
      }
      if (acc === 'orhea-conv.rhealab.near' && m === 'get_account_conversions') {
        const resBytes = [...Buffer.from(JSON.stringify([
          { source_amount: (25n * 10n ** 18n).toString(), is_withdrawn: false },
          { source_amount: (10n * 10n ** 18n).toString(), is_withdrawn: true },
          { source_amount: (5n * 10n ** 18n).toString(), status: 'Locked' }
        ]))];
        return jsonResponse({ jsonrpc: '2.0', result: { result: resBytes } });
      }
    }
    if (url.includes('solana') && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b.method === 'getAccountInfo' && b.params?.[0] === escrowPda.address) {
        const buf = Buffer.alloc(136);
        buf.writeBigUInt64LE(123450000n, 105); // 123.45 JUP
        return jsonResponse({ jsonrpc: '2.0', result: { value: { data: [buf.toString('base64'), 'base64'] } } });
      }
      if (b.method === 'getProgramAccounts' && b.params?.[0] === 'Stake11111111111111111111111111111111111111') {
        return jsonResponse({
          jsonrpc: '2.0',
          result: [
            {
              pubkey: 'StakeAcc11111111111111111111111111111111111',
              account: {
                lamports: 2500000000, // 2.5 SOL
                data: { parsed: { info: { stake: { delegation: { voter: 'JitoValidator111111111111111' } } } } }
              }
            }
          ]
        });
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const nearPos = await chainContracts.fetchNearAccountStakingPositionsAsync('alice.near');
    assert.equal(nearPos.length, 2);
    const valPos = nearPos.find((p) => p.type === 'validator');
    const convPos = nearPos.find((p) => p.type === 'lock_convert');
    assert.equal(valPos.poolId, 'astro-stakers.poolv1.near');
    assert.equal(valPos.totalNear, 15);
    assert.equal(convPos.poolId, 'rhea_orhea_convert');
    assert.equal(convPos.contractId, 'orhea-conv.rhealab.near');
    assert.equal(convPos.symbol, 'oRHEA');
    assert.equal(convPos.totalAmount, 30);

    const solPos = await chainContracts.fetchSolanaAccountStakingPositionsAsync(solAddr);
    assert.equal(solPos.length, 2);
    const jupPos = solPos.find((p) => p.type === 'jupiter_dao');
    const solValPos = solPos.find((p) => p.type === 'sol_validator');
    assert.equal(jupPos.symbol, 'JUP');
    assert.equal(jupPos.amount, 123.45);
    assert.equal(jupPos.subtitle, escrowPda.address);
    assert.equal(solValPos.symbol, 'SOL');
    assert.equal(solValPos.title, 'JitoValidator111111111111111');
    assert.equal(solValPos.amount, 2.5);

    // Verify renderEarnView renders all 5 categories into #earn-my-positions-list
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const domMap = new Map();
    const makeEl = (id) => {
      const classes = new Set();
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
          contains: (c) => classes.has(c)
        },
        getAttribute: () => null
      };
      domMap.set(id, el);
      return el;
    };
    ['earn-my-positions-card', 'earn-my-positions-list', 'earn-my-positions-count', 'staking-pools-list'].forEach(makeEl);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };

    try {
      const testWallet = state.normalizeWalletRecord({
        id: 'w_earn_positions',
        name: 'Positions Test',
        nearNamedAccount: 'alice.near',
        solAddress: solAddr,
        nearStakingPositions: nearPos,
        solStakingPositions: solPos,
        nearNep141Balances: { 'lst.rhealab.near': { raw: '5000000000000000000000000', formatted: 5 } },
        splBalances: { J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: 3.25 },
        erc20Balances: {
          eth: {
            '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 1.5,
            '0x9d39a5de30e57443bff2a8307a4256c8797a3497': 200
          },
          base: { '0x4e65fe4dba92790696d040ac24aa414708f5c0ab': 500 },
          arc: { '0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298': 250 },
          hype: { '0xfd739d4e423301ce9385c1fb8850539d657c296d': 12.5 }
        }
      });
      state.wallets = [testWallet];
      state.activeWalletId = testWallet.id;
      uiController.renderEarnView();

      const card = domMap.get('earn-my-positions-card');
      const countEl = domMap.get('earn-my-positions-count');
      const listHtml = domMap.get('earn-my-positions-list').innerHTML;

      assert.equal(card.classList.contains('hidden'), false);
      assert.equal(countEl.textContent, '11');
      for (const expected of [
        'astro-stakers.poolv1.near',
        'Rhea oRHEA Convert',
        '30 oRHEA',
        '5 rNEAR',
        'Jupiter DAO (ASR)',
        '123.45 JUP',
        'JitoValidator111111111111111',
        '2.5 SOL',
        '3.25 JitoSOL',
        'Lido Staked ETH',
        '1.5 stETH',
        'Ethena Staked USDe',
        '200 sUSDe',
        'Aave V3 Base USDC',
        '500 aBasUSDC',
        'Steakhouse Prime USDC',
        '250 steakUSDC',
        'Kinetiq Staked HYPE',
        '12.5 kHYPE'
      ]) {
        assert.ok(listHtml.includes(expected), `Expected position output to include ${expected}`);
      }
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
    }
  });
});

test('v2.8 Task 3: Human-readable minimum bridge amount error in quoteRawOneClick', async () => {
  const prevLang = state.lang;
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('1click.chaindefuser.com/v0/quote')) {
        const body = JSON.parse(opts.body);
        if (body.originAsset === 'nep141:wrap.near') {
          return jsonResponse({ message: 'Amount is too low for bridge, try at least 500000000000000000000000' }, 400);
        }
        return jsonResponse({ message: 'Amount is too low for bridge, try at least 12345678' }, 400);
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      state.setLanguage('en');
      const qEn = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:sol.omft.near',
        amountRaw: '10000000000000000000000',
        recipient: '7xLk17EQQ5KLDLDe44wCmupJKJjTGd8hs3eSVVhCx932',
        refundTo: 'alice.near'
      });
      assert.equal(qEn.ok, false);
      assert.equal(qEn.error, 'Amount too low for bridge (min ~0.5)');

      state.setLanguage('zh');
      const qZh = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        destinationAsset: 'nep141:sol.omft.near',
        amountRaw: '1000000',
        recipient: '7xLk17EQQ5KLDLDe44wCmupJKJjTGd8hs3eSVVhCx932',
        refundTo: 'alice.near'
      });
      assert.equal(qZh.ok, false);
      assert.equal(qZh.error, '跨链金额过低，最低需约 12.3457');
    });
  } finally {
    state.setLanguage(prevLang);
  }
});

test('v2.9: OKX-style Token Detail Sheet (openTokenDetailSheet, setTokenDetailChain, earn matching, recordWalletActivity & auto-sync)', async () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="sheet-token-detail"'), 'index.html must include #sheet-token-detail');

  for (const fnName of [
    'openTokenDetailSheet',
    'setTokenDetailChain',
    'tokenDetailAction',
    'copyTokenDetailAddress',
    'startAutoPriceAndBalanceSync',
    'recordWalletActivity'
  ]) {
    assert.equal(typeof uiController[fnName], 'function', `uiController.${fnName} must be exported`);
    assert.equal(typeof globalThis[fnName], 'function', `globalThis.${fnName} must be exported`);
  }

  await withMockedStorage({}, async () => {
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const prevLiveTokens = state.liveTokens;
    const prevLang = state.lang;

    const wallet = state.normalizeWalletRecord({
      id: 'w_v29_detail',
      name: 'DetailTest',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nearAddress: 'a'.repeat(64),
      nativeBalances: { near: 12.5, prl: 100, sol: 3.2 },
      nearNep141Balances: {
        'prl.omft.near': { raw: '5000000000', formatted: 50 }
      }
    });
    state.wallets = [wallet];
    state.activeWalletId = wallet.id;
    state.liveTokens = [
      { symbol: 'PRL', blockchain: 'near', price: 0.42 },
      { symbol: 'NEAR', blockchain: 'near', price: 3.5 }
    ];
    state.setLanguage('zh');

    const domMap = new Map();
    const makeEl = (id) => {
      const classes = new Set();
      if (id === 'token-detail-earn-card') classes.add('hidden');
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        href: '#',
        attributes: {},
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
          contains: (c) => classes.has(c)
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k] || null; }
      };
      domMap.set(id, el);
      return el;
    };

    [
      'home-unified-asset-list',
      'hero-total-usd',
      'sheet-backdrop',
      'sheet-token-detail',
      'token-detail-icon',
      'token-detail-title',
      'token-detail-chains',
      'token-detail-balance',
      'token-detail-usd',
      'token-detail-addr-row',
      'token-detail-addr',
      'token-detail-explorer-link',
      'token-detail-breakdown-card',
      'token-detail-breakdown-list',
      'token-detail-earn-card',
      'token-detail-earn-list',
      'token-detail-history-list',
      'token-detail-price-label',
      'token-detail-price-val'
    ].forEach(makeEl);

    globalThis.document = {
      documentElement: { lang: 'zh-CN' },
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };

    try {
      // 1. Home list hides chain mini-pills and opens Token Detail Sheet on click
      uiController.renderUnifiedAssetList();
      const homeHtml = domMap.get('home-unified-asset-list').innerHTML;
      assert.ok(homeHtml.includes('data-action="open-token-detail" data-symbol="PRL"'));
      assert.equal(homeHtml.includes('net-mini-pill'), false, 'Home list must not render net-mini-pill');

      // 2. Record local wallet activity & verify normalization preserves activityHistory
      const act = uiController.recordWalletActivity(wallet, {
        type: 'swap',
        symbol: 'PRL',
        toSymbol: 'USDC',
        chain: 'near',
        amount: 25,
        txHash: 'LocalTxHash1111111111111111',
        title: 'PRL ➔ USDC'
      });
      assert.ok(act && act.id);
      const reNormalized = state.normalizeWalletRecord(JSON.parse(JSON.stringify(wallet)));
      assert.equal(reNormalized.activityHistory.length, 1);
      assert.equal(reNormalized.activityHistory[0].txHash, 'LocalTxHash1111111111111111');

      // 3. Open Token Detail Sheet for PRL with mocked explorer APIs
      await withMockedFetch(async (url) => {
        if (url.includes('api.prlscan.com/v1/addresses/')) {
          return jsonResponse({
            txs: [
              { txid: 'prl_tx_001', time: 1700000100, delta_grains: '2500000000', is_coinbase: true }
            ]
          });
        }
        if (url.includes('api.nearblocks.io/v1/account/alice.near/ft-txns')) {
          return jsonResponse({
            txns: [
              {
                transaction_hash: 'near_ft_001',
                block_timestamp: '1700000200000000000',
                delta_amount: '5000000000',
                contract: 'prl.omft.near',
                involved_account_id: 'bridge.near',
                ft: { symbol: 'PRL', decimals: 8 }
              }
            ]
          });
        }
        if (url.includes('api.nearblocks.io/v1/account/alice.near/txns')) {
          return jsonResponse({ txns: [] });
        }
        return jsonResponse({}, 404, 'Not Found');
      }, async () => {
        uiController.openTokenDetailSheet('PRL');
        assert.equal(domMap.get('sheet-token-detail').classList.contains('open'), true);
        assert.equal(domMap.get('token-detail-title').textContent, 'PRL');
        assert.equal(domMap.get('token-detail-balance').textContent, '150');
        assert.equal(domMap.get('token-detail-usd').textContent, '$63.00');
        assert.ok(domMap.get('token-detail-chains').innerHTML.includes('data-action="set-token-detail-chain" data-chain="all"'));
        assert.ok(domMap.get('token-detail-chains').innerHTML.includes('data-action="set-token-detail-chain" data-chain="prl"'));
        assert.ok(domMap.get('token-detail-chains').innerHTML.includes('data-action="set-token-detail-chain" data-chain="near"'));
        assert.equal(domMap.get('token-detail-breakdown-card').classList.contains('hidden'), false);
        assert.ok(domMap.get('token-detail-breakdown-list').innerHTML.includes('Pearl Network'));

        // Let background fetch settle
        await new Promise((r) => setTimeout(r, 30));
        const histHtml = domMap.get('token-detail-history-list').innerHTML;
        assert.ok(histHtml.includes('PRL ➔ USDC'), 'Local activity must appear in history');
        assert.ok(histHtml.includes('prl_tx_001'), 'Pearl L1 history must appear');
        assert.ok(histHtml.includes('near_ft_001'), 'NEAR NEP-141 history must appear');

        // 4. Filter by 'prl' chain
        uiController.setTokenDetailChain('prl');
        assert.equal(domMap.get('token-detail-balance').textContent, '100');
        assert.equal(domMap.get('token-detail-addr').textContent, wallet.address);
        assert.ok(domMap.get('token-detail-explorer-link').href.includes('explorer.prlscan.com/address/'));
        assert.equal(domMap.get('token-detail-breakdown-card').classList.contains('hidden'), true);
        await new Promise((r) => setTimeout(r, 30));

        // 5. Open NEAR Token Detail Sheet and verify Earn pool matching
        uiController.openTokenDetailSheet('NEAR');
        const earnCard = domMap.get('token-detail-earn-card');
        const earnHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.equal(earnCard.classList.contains('hidden'), false, 'NEAR detail sheet must unhide Earn section');
        assert.ok(earnHtml.includes('rhea_rnear'), 'NEAR detail sheet must list Rhea rNEAR pool');
        assert.ok(earnHtml.includes('NEAR ➔ rNEAR'));
        await new Promise((r) => setTimeout(r, 30));
      });

      // 6. Auto-sync timer starts and clears cleanly
      const timerId = uiController.startAutoPriceAndBalanceSync();
      assert.ok(timerId);
      clearInterval(timerId);
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
      state.liveTokens = prevLiveTokens;
      state.setLanguage(prevLang);
    }
  });
});

test('v3.0: Pill-scroll CSS, address-row visibility, chain-scoped earn/staking grouping, Solana partial RPC fallback, wrapped L1 exclusion & Aave Eth/Arb pools', async () => {
  // 1. CSS checks for .pill-scroll & .filter-pill
  const css = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.ok(/\.pill-scroll\s*\{[^}]*flex-shrink:\s*0;[^}]*min-height:\s*34px;/s.test(css), '.pill-scroll must prevent vertical squishing');
  assert.ok(/\.filter-pill\s*\{[^}]*flex-shrink:\s*0;/s.test(css), '.filter-pill must have flex-shrink: 0');

  // 2. fetchSolanaNativeAndSplBalances still returns nativeSol when getTokenAccountsByOwner fails/rate-limits
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  await withMockedFetch(async (_url, opts) => {
    const b = JSON.parse(opts.body);
    if (b.method === 'getBalance') {
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: 250000000 } });
    }
    if (b.method === 'getTokenAccountsByOwner') {
      return jsonResponse({ error: { code: 429, message: 'Too many requests' } }, 429);
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const solRes = await chainContracts.fetchSolanaNativeAndSplBalances(keys.solAddress, []);
    assert.ok(solRes, 'fetchSolanaNativeAndSplBalances must succeed when getTokenAccountsByOwner fails');
    assert.equal(solRes.nativeSol, 0.25);
  });

  // 3. Aave V3 Ethereum & Arbitrum USDC pools live metrics from DefiLlama + category filter
  await withMockedFetch(async (url) => {
    if (url.includes('yields.llama.fi/pools')) {
      return jsonResponse({
        data: [
          { chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', apy: 4.35, tvlUsd: 3200000000 },
          { chain: 'Arbitrum', project: 'aave-v3', symbol: 'USDC', apy: 5.12, tvlUsd: 240000000 }
        ]
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const prevLang = state.lang;
    state.setLanguage('en');
    try {
      const pools = await chainContracts.fetchLiveStakingMetrics();
      const byId = Object.fromEntries(pools.map((p) => [p.id, p]));
      assert.equal(byId.aave_eth_usdc.category, 'lending');
      assert.equal(byId.aave_eth_usdc.apy, 4.35);
      assert.equal(byId.aave_eth_usdc.rate, 1.0);
      assert.equal(byId.aave_eth_usdc.tvlText, '3.20B USDC ($3.20B)');
      assert.equal(byId.aave_arb_usdc.category, 'lending');
      assert.equal(byId.aave_arb_usdc.apy, 5.12);
      assert.equal(byId.aave_arb_usdc.rate, 1.0);
      assert.equal(byId.aave_arb_usdc.tvlText, '240.00M USDC ($240.00M)');
    } finally {
      state.setLanguage(prevLang);
    }
  });

  // 4. buildAllOnChainAssetGroups: Wrapped SOL (BSC) excluded unless > 0, loaded ERC-20 chains default null -> 0
  await withMockedStorage({}, async () => {
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const prevLang = state.lang;

    const w = state.normalizeWalletRecord({
      id: 'w_v30_test',
      name: 'V30Test',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nativeBalances: { near: 5, sol: 0, bsc: 0, eth: 0 },
      erc20Balances: {}
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.setLanguage('en');

    const groups = uiController.buildAllOnChainAssetGroups(w);
    const solGrp = groups.find((g) => g.symbolKey === 'SOL');
    assert.ok(solGrp);
    assert.equal(solGrp.entries.some((e) => e.blockchain === 'bsc'), false, 'Wrapped SOL (BSC) at 0 must not merge into SOL');
    const solNative = solGrp.entries.find((e) => e.blockchain === 'sol');
    assert.equal(solNative.balance, 0);

    const usdcGrp = groups.find((g) => g.symbolKey === 'USDC');
    const ethUsdc = usdcGrp.entries.find((e) => e.blockchain === 'eth');
    assert.equal(ethUsdc.balance, 0, 'Loaded EVM chain ERC-20 entry must default to 0 instead of null');

    // 5. Token detail sheet: addr row hidden on 'all', visible on specific chain, earn pools strictly chain-scoped & separated
    const domMap = new Map();
    const makeEl = (id) => {
      const classes = new Set();
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        href: '#',
        attributes: {},
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
          contains: (c) => classes.has(c)
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k] || null; }
      };
      domMap.set(id, el);
      return el;
    };
    [
      'sheet-backdrop', 'sheet-token-detail', 'token-detail-icon', 'token-detail-title',
      'token-detail-chains', 'token-detail-balance', 'token-detail-usd',
      'token-detail-addr-row', 'token-detail-addr', 'token-detail-explorer-link',
      'token-detail-breakdown-card', 'token-detail-breakdown-list',
      'token-detail-earn-card', 'token-detail-earn-list', 'token-detail-history-list',
      'token-detail-price-label', 'token-detail-price-val',
      'staking-pools-list', 'earn-selected-title', 'earn-avail-balance',
      'earn-in-symbol', 'earn-live-apy', 'earn-tvl-val', 'earn-stakers-val',
      'earn-live-rate', 'earn-amount-in', 'earn-est-out', 'earn-lock-row', 'earn-lock-tiers'
    ].forEach(makeEl);

    globalThis.document = {
      documentElement: { lang: 'en' },
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };

    try {
      await withMockedFetch(async () => jsonResponse({}, 404, 'Not Found'), async () => {
        uiController.openTokenDetailSheet('SOL');
        assert.equal(domMap.get('token-detail-addr-row').classList.contains('hidden'), true, 'addr-row must be hidden on all networks');
        uiController.setTokenDetailChain('sol');
        assert.equal(domMap.get('token-detail-addr-row').classList.contains('hidden'), false, 'addr-row must show on sol network');
        assert.equal(domMap.get('token-detail-earn-card').classList.contains('hidden'), false, 'Solana staking pools must show on sol');
        assert.ok(domMap.get('token-detail-earn-list').innerHTML.includes('jito_sol'));

        uiController.setTokenDetailChain('near');
        assert.equal(domMap.get('token-detail-addr-row').classList.contains('hidden'), false, 'addr-row must show on near network');
        assert.equal(domMap.get('token-detail-earn-card').classList.contains('hidden'), true, 'Solana SOL pools must not appear when near network is selected');

        uiController.openTokenDetailSheet('ETH');
        const ethEarnHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.ok(ethEarnHtml.includes('Staking'), 'Staking card header must render for ETH');
        assert.ok(ethEarnHtml.includes('Lending &amp; Earn'), 'Lending & Earn card header must render for ETH (aave_eth_weth)');
        assert.ok(ethEarnHtml.includes('lido_steth'));
        assert.ok(ethEarnHtml.includes('aave_eth_weth'));

        uiController.openTokenDetailSheet('USDC');
        const usdcAllEarnHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.ok(usdcAllEarnHtml.includes('Lending &amp; Earn'), 'Lending & Earn card header must render for USDC');
        assert.equal(usdcAllEarnHtml.includes('⚡'), false);
        assert.ok(usdcAllEarnHtml.includes('aave_eth_usdc'));
        assert.ok(usdcAllEarnHtml.includes('aave_arb_usdc'));

        uiController.setTokenDetailChain('eth');
        const usdcEthHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.ok(usdcEthHtml.includes('aave_eth_usdc'));
        assert.equal(usdcEthHtml.includes('aave_arb_usdc'), false, 'Chain filter eth must exclude Arbitrum Aave pool');
        assert.equal(usdcEthHtml.includes('aave_base_usdc'), false, 'Chain filter eth must exclude Base Aave pool');

        // 6. Earn View lending filter & category badge
        uiController.setEarnPoolFilter('lending');
        const lendingHtml = domMap.get('staking-pools-list').innerHTML;
        assert.ok(lendingHtml.includes('burrow_near_wnear'));
        assert.ok(lendingHtml.includes('burrow_near_usdt'));
        assert.ok(lendingHtml.includes('aave_eth_weth'));
        assert.ok(lendingHtml.includes('aave_eth_usdc'));
        assert.ok(lendingHtml.includes('aave_arb_usdc'));
        assert.ok(lendingHtml.includes('aave_base_usdc'));
        assert.ok(lendingHtml.includes('arc_steak_usdc'));
        assert.ok(lendingHtml.includes('ethena_susde'));
        assert.equal(lendingHtml.includes('jito_sol'), false, 'Lending filter must exclude liquid staking pools');
        assert.ok(lendingHtml.includes('pool-cat-badge cat-lending'));
        assert.ok(lendingHtml.includes('pool-cat-badge cat-vault'));
      });
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
      state.setLanguage(prevLang);
    }
  });
});

test('v3.1: Burrow NEAR/USDT & Aave ETH lending pools, EVM holder counts, localStorage metric/price caching, progressive sync & fast quote cap', async () => {
  const prevLang = state.lang;
  state.setLanguage('en');

  // 1. Live Burrow RPC + Aave ETH/Arb holder counts + 60s TTL cache
  let llamaFetches = 0;
  await withMockedFetch(async (url, opts) => {
    if (url.includes('yields.llama.fi/pools')) {
      llamaFetches += 1;
      return jsonResponse({
        data: [
          { chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', apy: 4.35, tvlUsd: 3200000000 },
          { chain: 'Arbitrum', project: 'aave-v3', symbol: 'USDC', apy: 5.12, tvlUsd: 240000000 },
          { chain: 'Ethereum', project: 'aave-v3', symbol: 'WETH', apy: 1.44, tvlUsd: 559214208 },
          { chain: 'Near', project: 'rhea-lend', symbol: 'USDT', apy: 12.6, tvlUsd: 1495604 }
        ]
      });
    }
    if (url.includes('eth.blockscout.com/api/v2/tokens/0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c')) {
      return jsonResponse({ holders_count: '29029' });
    }
    if (url.includes('eth.blockscout.com/api/v2/tokens/0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8')) {
      return jsonResponse({ holders_count: '47849', total_supply: (2358553n * 10n ** 18n).toString() });
    }
    if (url.includes('api.geckoterminal.com/api/v2/networks/arbitrum/tokens/0x724dc807b04555b71ed48a6896b6f41593b8c637/info')) {
      return jsonResponse({ data: { attributes: { holders: { count: 39704 } } } });
    }
    if (url.includes('rpc.mainnet.near.org') && opts?.body) {
      const b = JSON.parse(opts.body);
      const acc = b.params?.account_id;
      const m = b.params?.method_name;
      if (acc === 'contract.main.burrow.near' && m === 'get_num_accounts') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: [...Buffer.from(JSON.stringify(73069))] } });
      }
      if (acc === 'contract.main.burrow.near' && m === 'get_asset') {
        const args = JSON.parse(Buffer.from(b.params.args_base64, 'base64').toString());
        if (args.token_id === 'wrap.near') {
          return jsonResponse({
            jsonrpc: '2.0',
            result: {
              result: [...Buffer.from(JSON.stringify({
                token_id: 'wrap.near',
                supplied: { balance: (3244651n * 10n ** 24n).toString() },
                config: { extra_decimals: 0 },
                supply_apr: '0.002323'
              }))]
            }
          });
        }
        if (args.token_id === 'usdt.tether-token.near') {
          return jsonResponse({
            jsonrpc: '2.0',
            result: {
              result: [...Buffer.from(JSON.stringify({
                token_id: 'usdt.tether-token.near',
                supplied: { balance: (11041935n * 10n ** 18n).toString() },
                config: { extra_decimals: 12 },
                supply_apr: '0.125949'
              }))]
            }
          });
        }
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const pools = await chainContracts.fetchLiveStakingMetrics();
    assert.equal(llamaFetches, 1);
    const byId = Object.fromEntries(pools.map((p) => [p.id, p]));
    assert.equal(byId.aave_eth_usdc.stakersCount, 29029);
    assert.equal(byId.aave_arb_usdc.stakersCount, 39704);
    assert.equal(byId.aave_eth_weth.apy, 1.44);
    assert.equal(byId.aave_eth_weth.stakersCount, 47849);
    assert.equal(byId.aave_eth_weth.tvlText, '2.36M ETH ($559.21M)');
    assert.equal(byId.burrow_near_wnear.apy, 0.23);
    assert.equal(byId.burrow_near_wnear.stakersCount, 73069);
    assert.ok(byId.burrow_near_wnear.tvlText.includes('3.24M NEAR'));
    assert.equal(byId.burrow_near_usdt.apy, 12.6);
    assert.equal(byId.burrow_near_usdt.stakersCount, 73069);
    assert.ok(byId.burrow_near_usdt.tvlText.includes('11.04M USDT'));

    // Subsequent call with { useCache: true } must hit 60s TTL cache without calling DefiLlama again
    await chainContracts.fetchLiveStakingMetrics({ useCache: true });
    assert.equal(llamaFetches, 1);
  });

  // 2. Burrow NEAR executeOnChainStaking: wraps native NEAR via near_deposit -> ft_transfer_call
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const burrowWallet = state.normalizeWalletRecord({
    id: 'w_burrow_test',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nativeBalances: { near: 5.0 },
    nearNep141Balances: { 'usdt.tether-token.near': { raw: '10000000', formatted: 10 } }
  });
  const burrowCalls = [];
  const origNearSend = chainContracts.signAndSendNearFunctionCall;
  chainContracts.signAndSendNearFunctionCall = async (params) => {
    burrowCalls.push(params);
    return `tx_${params.receiverId}_${params.methodName}`;
  };
  try {
    await withMockedFetch(async () => jsonResponse({}, 404, 'Not Found'), async () => {
      const resNear = await chainContracts.executeOnChainStaking({ wallet: burrowWallet, poolId: 'burrow_near_wnear', amount: 2 });
      assert.equal(resNear.poolId, 'burrow_near_wnear');
      assert.equal(burrowCalls.length, 2);
      assert.equal(burrowCalls[0].receiverId, 'wrap.near');
      assert.equal(burrowCalls[0].methodName, 'near_deposit');
      assert.equal(burrowCalls[0].depositYocto, chainContracts.toBaseUnits(2, 24));
      assert.equal(burrowCalls[1].receiverId, 'wrap.near');
      assert.equal(burrowCalls[1].methodName, 'ft_transfer_call');
      assert.equal(JSON.parse(burrowCalls[1].argsJson).receiver_id, 'contract.main.burrow.near');

      const resUsdt = await chainContracts.executeOnChainStaking({ wallet: burrowWallet, poolId: 'burrow_near_usdt', amount: 5 });
      assert.equal(resUsdt.poolId, 'burrow_near_usdt');
      assert.equal(burrowCalls[2].receiverId, 'usdt.tether-token.near');
      assert.equal(burrowCalls[2].methodName, 'ft_transfer_call');
      assert.equal(JSON.parse(burrowCalls[2].argsJson).receiver_id, 'contract.main.burrow.near');
    });
  } finally {
    chainContracts.signAndSendNearFunctionCall = origNearSend;
  }

  // 3. localStorage cache persistence & 0ms hydration for liveTokens + staking metrics
  await withMockedStorage({}, async () => {
    const prevLiveTokens = state.liveTokens;
    const prevStakingPools = state.staking.pools;
    const prevStakingUpdatedAt = state.staking.updatedAt;
    try {
      state.saveCachedLiveTokens([{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', price: 4.56 }]);
      state.saveCachedStakingMetrics(chainContracts.STAKING_POOLS);
      state.liveTokens = [];
      state.staking.pools = null;
      state.staking.updatedAt = null;
      state.initState();
      assert.equal(state.liveTokens.length, 1);
      assert.equal(state.liveTokens[0].price, 4.56);
      assert.ok(Array.isArray(state.staking.pools));
      assert.ok(state.staking.updatedAt > 0);
    } finally {
      state.liveTokens = prevLiveTokens;
      state.staking.pools = prevStakingPools;
      state.staking.updatedAt = prevStakingUpdatedAt;
    }
  });

  // 4. openTokenDetailSheet triggers background staking metrics fetch when stale and re-renders live APY + separate cards
  await withMockedStorage({}, async () => {
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const prevPools = state.staking.pools;
    const prevUpdatedAt = state.staking.updatedAt;
    state.staking.pools = null;
    state.staking.updatedAt = null;
    state.staking.loading = false;
    const w = state.normalizeWalletRecord({
      id: 'w_detail_auto_apy',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nativeBalances: { near: 3 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    const domMap = new Map();
    const makeEl = (id) => {
      const classes = new Set();
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        href: '#',
        attributes: {},
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
          contains: (c) => classes.has(c)
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k] || null; }
      };
      domMap.set(id, el);
      return el;
    };
    [
      'sheet-backdrop', 'sheet-token-detail', 'token-detail-icon', 'token-detail-title',
      'token-detail-chains', 'token-detail-balance', 'token-detail-usd',
      'token-detail-addr-row', 'token-detail-addr', 'token-detail-explorer-link',
      'token-detail-breakdown-card', 'token-detail-breakdown-list',
      'token-detail-earn-card', 'token-detail-earn-list', 'token-detail-history-list',
      'token-detail-price-label', 'token-detail-price-val',
      'staking-pools-list', 'earn-selected-title', 'earn-avail-balance',
      'earn-in-symbol', 'earn-live-apy', 'earn-tvl-val', 'earn-stakers-val',
      'earn-live-rate', 'earn-amount-in', 'earn-est-out', 'earn-lock-row', 'earn-lock-tiers'
    ].forEach(makeEl);
    globalThis.document = {
      documentElement: { lang: 'en' },
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };

    try {
      await withMockedFetch(async (url) => {
        if (url.includes('api.ref.finance/get-rnear-apy')) return jsonResponse({ data: 5.55 });
        return jsonResponse({}, 404, 'Not Found');
      }, async () => {
        uiController.openTokenDetailSheet('NEAR');
        await new Promise((r) => setTimeout(r, 40));
        const earnHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.ok(earnHtml.includes('rhea_rnear'));
        assert.ok(earnHtml.includes('burrow_near_wnear'));
        assert.ok(earnHtml.includes('5.55%'), 'Background staking refresh must re-render live APY in open Token Detail Sheet');
        assert.equal((earnHtml.match(/ios-glass-card/g) || []).length, 2, 'NEAR must render two separate cards for Staking and Lending & Earn');
      });
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
      state.staking.pools = prevPools;
      state.staking.updatedAt = prevUpdatedAt;
      state.setLanguage(prevLang);
    }
  });
});

test('v3.2: Pool icons on all 21 pools, Burrow TVL USD consistency, silent home sync UI, and iOS workflow git-add fix', async () => {
  // 1. All 21 STAKING_POOLS have valid non-blocked icon URLs & TOKEN_ICON_MAP covers bNEAR/bUSDT/bUSDC/aEthUSDC/aArbUSDCn/aBasUSDC/aEthWETH/steakUSDC
  assert.equal(chainContracts.STAKING_POOLS.length, 21);
  for (const p of chainContracts.STAKING_POOLS) {
    assert.ok(typeof p.icon === 'string' && p.icon.length > 0 && Boolean(tokenRegistry.sanitizeImageUrl(p.icon)), `Pool ${p.id} must have a valid sanitized icon URL`);
    assert.ok(!p.icon.includes('raw.githubusercontent.com') && !p.icon.includes('assets.coingecko.com'), `Pool ${p.id} must not depend on GFW-blocked domains`);
  }
  for (const sym of ['BNEAR', 'BUSDT', 'BUSDC', 'AETHUSDC', 'AARBUSDCN', 'ABASUSDC', 'AETHWETH', 'STEAKUSDC']) {
    assert.ok(tokenRegistry.TOKEN_ICON_MAP[sym], `TOKEN_ICON_MAP must include ${sym}`);
  }

  // 2. Burrow USDT TVL uses 1.0 USD per USDT on supplied.balance, and Burrow NEAR TVL includes ($USD) via live NEAR price
  const prevLang = state.lang;
  const prevLiveTokens = state.liveTokens;
  state.setLanguage('en');
  state.liveTokens = [{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', price: 3.0 }];
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('yields.llama.fi/pools')) {
        return jsonResponse({
          data: [{ chain: 'Near', project: 'rhea-lend', symbol: 'USDT', apy: 12.6, tvlUsd: 1495604 }]
        });
      }
      if (url.includes('rpc.mainnet.near.org') && opts?.body) {
        const b = JSON.parse(opts.body);
        if (b.params?.account_id === 'contract.main.burrow.near' && b.params?.method_name === 'get_asset') {
          const args = JSON.parse(Buffer.from(b.params.args_base64, 'base64').toString());
          if (args.token_id === 'wrap.near') {
            return jsonResponse({
              jsonrpc: '2.0',
              result: {
                result: [...Buffer.from(JSON.stringify({
                  token_id: 'wrap.near',
                  supplied: { balance: (3240000n * 10n ** 24n).toString() },
                  config: { extra_decimals: 0 },
                  supply_apr: '0.0023'
                }))]
              }
            });
          }
          if (args.token_id === 'usdt.tether-token.near') {
            return jsonResponse({
              jsonrpc: '2.0',
              result: {
                result: [...Buffer.from(JSON.stringify({
                  token_id: 'usdt.tether-token.near',
                  supplied: { balance: (11040000n * 10n ** 18n).toString() },
                  config: { extra_decimals: 12 },
                  supply_apr: '0.126'
                }))]
              }
            });
          }
        }
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const pools = await chainContracts.fetchLiveStakingMetrics();
      const byId = Object.fromEntries(pools.map((p) => [p.id, p]));
      assert.equal(byId.burrow_near_usdt.tvlText, '11.04M USDT ($11.04M)');
      assert.equal(byId.burrow_near_wnear.tvlText, '3.24M NEAR ($9.72M)');
    });
  } finally {
    state.liveTokens = prevLiveTokens;
    state.setLanguage(prevLang);
  }

  // 3. Pull-to-Refresh replaces hidden manual refresh button + build-ios-ipa.yml git add fix
  const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(html.includes('id="home-ptr-indicator"'), 'Home view must include Pull-to-Refresh indicator');
  assert.equal(html.includes('id="btn-refresh-balances"'), false, 'Hidden manual refresh button must be removed');
  assert.equal(html.includes('id="home-sync-status"'), false, 'Legacy hidden sync status must be removed');

  const iosYml = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'build-ios-ipa.yml'), 'utf8');
  assert.equal(iosYml.includes('git add sidestore-source.json build/NEAR-CA-Wallet-unsigned.ipa'), false, 'Workflow must not git add ignored build/ IPA');
  assert.ok(iosYml.includes('git add sidestore-source.json'), 'Workflow must git add sidestore-source.json');
  assert.ok(iosYml.includes('git pull --rebase') && iosYml.includes('origin main && git push'), 'Workflow must rebase before pushing');
});

test('v3.3: Zero-GFW-block distinct pool icons, server Cache-Control no-store, staking cache v3, and tvlTokenAmount ($USD) on NEAR/JUP pools', async () => {
  // 1. All 21 pools resolve a valid non-empty primaryUrl via resolveTokenIcon and avoid GFW-blocked CDNs
  assert.equal(chainContracts.STAKING_POOLS.length, 21);
  for (const p of chainContracts.STAKING_POOLS) {
    const sanitized = tokenRegistry.sanitizeImageUrl(p.icon);
    assert.ok(sanitized, `Pool ${p.id} icon must pass sanitizeImageUrl`);
    const resolved = tokenRegistry.resolveTokenIcon({ symbol: p.outSymbol, blockchain: p.chain, logoURI: p.icon });
    assert.ok(resolved.primaryUrl && resolved.primaryUrl.length > 0, `Pool ${p.id} resolveTokenIcon must return primaryUrl`);
    assert.ok(!resolved.primaryUrl.includes('raw.githubusercontent.com'), `Pool ${p.id} must not use raw.githubusercontent.com`);
    assert.ok(!resolved.primaryUrl.includes('assets.coingecko.com'), `Pool ${p.id} must not use assets.coingecko.com`);
  }

  // Distinct icons across the 6 NEAR staking pools + Burrow NEAR vs Burrow USDT
  const nearPools = ['rhea_rnear', 'rhea_xrhea', 'rhea_orhea_convert', 'metapool_stnear', 'linear_near', 'stader_nearx']
    .map((id) => chainContracts.STAKING_POOLS.find((p) => p.id === id)?.icon);
  assert.equal(new Set(nearPools).size, 6, 'All 6 NEAR staking pools must have distinct protocol logos');
  const byPool = Object.fromEntries(chainContracts.STAKING_POOLS.map((p) => [p.id, p]));
  assert.notEqual(byPool.burrow_near_wnear.icon, byPool.burrow_near_usdt.icon, 'Burrow NEAR and Burrow USDT must have distinct icons');

  for (const sym of ['BNEAR', 'BUSDT', 'BUSDC', 'AETHUSDC', 'AARBUSDCN', 'ABASUSDC', 'AETHWETH', 'STEAKUSDC', 'STAKED JUP', 'JUP']) {
    const mapped = tokenRegistry.TOKEN_ICON_MAP[sym];
    assert.ok(mapped && tokenRegistry.sanitizeImageUrl(mapped), `TOKEN_ICON_MAP[${sym}] must be sanitized`);
    assert.ok(!mapped.includes('raw.githubusercontent.com') && !mapped.includes('assets.coingecko.com'), `TOKEN_ICON_MAP[${sym}] must not use GFW-blocked domains`);
  }

  // 2. server.js Cache-Control rules & state.js cache key v3
  const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  assert.ok(serverSrc.includes('no-store, no-cache, must-revalidate'), 'server.js must set no-store Cache-Control on unversioned entry');
  assert.ok(serverSrc.includes('public, max-age=31536000, immutable'), 'server.js must set immutable cache on ?v= static assets');
  assert.equal(state.STAKING_METRICS_STORAGE_KEY, 'near_ca_staking_metrics_v3');

  // 3. tvlTokenAmount populated on the 7 NEAR/JUP pools & renderEarnView appends ($USD)
  const prevLang = state.lang;
  const prevLiveTokens = state.liveTokens;
  const prevPools = state.staking.pools;
  const prevUpdatedAt = state.staking.updatedAt;
  const prevFilter = state.staking.filter;
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevDoc = globalThis.document;
  state.setLanguage('en');
  state.wallets = [{ id: 'w_v33', name: 'V33', nearAccountId: 'v33.near', balances: { NEAR: 10 } }];
  state.activeWalletId = 'w_v33';
  state.staking.filter = 'all';
  state.liveTokens = [
    { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', price: 2.0 },
    { assetId: 'nep141:token.rhealab.near', symbol: 'RHEA', blockchain: 'near', price: 0.5 },
    { assetId: 'nep141:otoken.rhealab.near', symbol: 'oRHEA', blockchain: 'near', price: 0.4 },
    { assetId: 'solana:JUP', symbol: 'JUP', blockchain: 'sol', price: 1.2 }
  ];

  // Build 81-byte Solana Locker buffer with lockedJup = 500,000,000 * 1e6 at offset 73
  const lockerBuf = Buffer.alloc(81);
  lockerBuf.writeBigUInt64LE(500_000_000n * 1_000_000n, 73);
  const lockerB64 = lockerBuf.toString('base64');

  const encodeNearRes = (obj) => jsonResponse({
    jsonrpc: '2.0',
    result: { result: [...Buffer.from(JSON.stringify(obj))] }
  });

  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('rpc.mainnet.near.org') && opts?.body) {
        const b = JSON.parse(opts.body);
        const acct = b.params?.account_id;
        const meth = b.params?.method_name;
        if (acct === 'lst.rhealab.near' && meth === 'get_summary') {
          return encodeNearRes({ ft_price: (10n ** 24n).toString(), total_staked_near_amount: (1_000_000n * 10n ** 24n).toString() });
        }
        if (acct === 'xtoken.rhealab.near' && meth === 'contract_metadata') {
          return encodeNearRes({ cur_locked_token_amount: (2_000_000n * 10n ** 18n).toString(), reward_per_sec: '0', current_account_num: 1200 });
        }
        if (acct === 'orhea-conv.rhealab.near' && meth === 'get_converted_source_token_amounts') {
          return encodeNearRes({ 'otoken.rhealab.near': (3_000_000n * 10n ** 18n).toString() });
        }
        if (acct === 'meta-pool.near' && meth === 'get_contract_state') {
          return encodeNearRes({ total_for_staking: (4_000_000n * 10n ** 24n).toString(), accounts_count: 5000 });
        }
        if (acct === 'linear-protocol.near' && meth === 'get_summary') {
          return encodeNearRes({ ft_price: (10n ** 24n).toString(), total_staked_near_amount: (5_000_000n * 10n ** 24n).toString() });
        }
        if (acct === 'v2-nearx.stader-labs.near' && meth === 'get_total_staked_balance') {
          return encodeNearRes((6_000_000n * 10n ** 24n).toString());
        }
      }
      if (opts?.body && String(opts.body).includes('getAccountInfo') && String(opts.body).includes('CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN')) {
        return jsonResponse({ jsonrpc: '2.0', result: { value: { data: [lockerB64, 'base64'] } } });
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const pools = await chainContracts.fetchLiveStakingMetrics();
      const map = Object.fromEntries(pools.map((p) => [p.id, p]));
      assert.equal(map.rhea_rnear.tvlTokenAmount, 1_000_000);
      assert.equal(map.rhea_xrhea.tvlTokenAmount, 2_000_000);
      assert.equal(map.rhea_orhea_convert.tvlTokenAmount, 3_000_000);
      assert.equal(map.metapool_stnear.tvlTokenAmount, 4_000_000);
      assert.equal(map.linear_near.tvlTokenAmount, 5_000_000);
      assert.equal(map.stader_nearx.tvlTokenAmount, 6_000_000);
      assert.equal(map.jupiter_jup.tvlTokenAmount, 500_000_000);

      // Render Earn view and confirm ($USD) is appended via formatPoolTvlDisplay
      state.staking.pools = pools;
      state.staking.updatedAt = Date.now();
      const domMap = new Map();
      const makeEl = (id) => {
        const el = {
          id, innerHTML: '', textContent: '', value: '', classList: new Set(),
          attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
          classListProxy: null
        };
        el.classList = {
          add: (...cls) => cls.forEach((c) => el._cls.add(c)),
          remove: (...cls) => cls.forEach((c) => el._cls.delete(c)),
          toggle: (c, f) => { if (f === undefined ? !el._cls.has(c) : f) el._cls.add(c); else el._cls.delete(c); },
          contains: (c) => el._cls.has(c)
        };
        el._cls = new Set();
        domMap.set(id, el);
        return el;
      };
      ['staking-pools-list', 'earn-selected-title', 'earn-avail-balance', 'earn-in-symbol',
        'earn-live-apy', 'earn-tvl-val', 'earn-stakers-val', 'earn-live-rate', 'earn-amount-in',
        'earn-est-out', 'earn-lock-row', 'earn-lock-tiers'].forEach(makeEl);
      globalThis.document = {
        documentElement: { lang: 'en' },
        getElementById: (id) => domMap.get(id) || null,
        querySelectorAll: () => []
      };
      uiController.renderEarnView();
      const html = domMap.get('staking-pools-list').innerHTML;
      assert.ok(html.includes('1.00M NEAR ($2.00M)'), 'rhea_rnear must render ($USD) in Earn list');
      assert.ok(html.includes('2.00M RHEA ($1.00M)'), 'rhea_xrhea must render ($USD) in Earn list');
      assert.ok(html.includes('3.00M oRHEA ($1.20M)'), 'rhea_orhea_convert must render ($USD) in Earn list');
      assert.ok(html.includes('4.00M NEAR ($8.00M)'), 'metapool_stnear must render ($USD) in Earn list');
      assert.ok(html.includes('5.00M NEAR ($10.00M)'), 'linear_near must render ($USD) in Earn list');
      assert.ok(html.includes('6.00M NEAR ($12.00M)'), 'stader_nearx must render ($USD) in Earn list');
      assert.ok(html.includes('500.00M JUP ($600.00M)'), 'jupiter_jup must render ($USD) in Earn list');
    });
  } finally {
    globalThis.document = prevDoc;
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    state.staking.filter = prevFilter;
    state.staking.pools = prevPools;
    state.staking.updatedAt = prevUpdatedAt;
    state.liveTokens = prevLiveTokens;
    state.setLanguage(prevLang);
  }
});


test('v4.0 Optimization: raceWithGraceWindow, fetchEvmChainBalancesBatch (Multicall3 + Batch fallback), executeSolanaSplTransfer & Earn Withdrawals', async () => {
  // 1. raceWithGraceWindow returns fast winner + grace window without waiting for hanging promise
  const start = Date.now();
  const fast = new Promise((r) => setTimeout(() => r({ ok: true, out: 100 }), 15));
  const medium = new Promise((r) => setTimeout(() => r({ ok: true, out: 120 }), 35));
  const hanging = new Promise((r) => setTimeout(() => r({ ok: true, out: 999 }), 3000));
  const raced = await chainContracts.raceWithGraceWindow([fast, medium, hanging], (v) => Boolean(v && v.ok), 80);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 400, `Expected raceWithGraceWindow < 400ms, got ${elapsed}ms`);
  assert.equal(raced[0]?.value?.out, 100);
  assert.equal(raced[1]?.value?.out, 120);
  assert.equal(raced[2], null);

  // 2a. fetchEvmChainBalancesBatch uses Multicall3 aggregate3 single eth_call first
  const origFetch = globalThis.fetch;
  try {
    let mcCallCount = 0;
    const ethersLib = require('../ethers.umd.min.js');
    const mcIface = new ethersLib.Interface(['function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])']);
    const encodedMcResp = mcIface.encodeFunctionResult('aggregate3', [[
      { success: true, returnData: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' }, // 1 ETH
      { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000005f5e100' }, // 100 USDC (6 dec)
      { success: true, returnData: '0x00000000000000000000000000000000000000000000000000000000004c4b40' }  // 5 USDT (6 dec)
    ]]);
    globalThis.fetch = async (url, init) => {
      mcCallCount += 1;
      const payload = JSON.parse(init.body);
      assert.equal(payload.method, 'eth_call');
      assert.equal(payload.params[0].to, '0xcA11bde05977b3631167028862bE2a173976CA11');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: encodedMcResp }), { status: 200 });
    };
    const mcRes = await chainContracts.fetchEvmChainBalancesBatch(
      'eth',
      '0x1111111111111111111111111111111111111111',
      [
        { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
        { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
      ]
    );
    assert.equal(mcCallCount, 1);
    assert.equal(mcRes.nativeFormatted, 1);
    assert.equal(mcRes.tokens['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'].formatted, 100);
    assert.equal(mcRes.tokens['0xdac17f958d2ee523a2206206994597c13d831ec7'].formatted, 5);

    // 2b. Fallback to JSON-RPC batch if Multicall3 returns revert/failure
    let batchFallbackCalls = 0;
    globalThis.fetch = async (url, init) => {
      const payload = JSON.parse(init.body);
      if (!Array.isArray(payload) && payload.method === 'eth_call' && payload.params[0].to === '0xcA11bde05977b3631167028862bE2a173976CA11') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, error: { code: -32000, message: 'execution reverted' } }), { status: 200 });
      }
      batchFallbackCalls += 1;
      assert.ok(Array.isArray(payload), 'Expected JSON-RPC batch fallback array');
      assert.equal(payload.length, 3);
      return new Response(JSON.stringify([
        { jsonrpc: '2.0', id: 0, result: '0x1bc16d674ec80000' }, // 2 ETH
        { jsonrpc: '2.0', id: 1, result: '0x000000000000000000000000000000000000000000000000000000000bebc200' }, // 200 USDC
        { jsonrpc: '2.0', id: 2, result: '0x0000000000000000000000000000000000000000000000000000000000989680' }  // 10 USDT
      ]), { status: 200 });
    };
    const batchRes = await chainContracts.fetchEvmChainBalancesBatch(
      'eth',
      '0x1111111111111111111111111111111111111111',
      [
        { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
        { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
      ]
    );
    assert.ok(batchFallbackCalls >= 1);
    assert.equal(batchRes.nativeFormatted, 2);
    assert.equal(batchRes.tokens['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'].formatted, 200);
    assert.equal(batchRes.tokens['0xdac17f958d2ee523a2206206994597c13d831ec7'].formatted, 10);
  } finally {
    globalThis.fetch = origFetch;
  }

  // 3. executeSolanaSplTransfer pre-validation blocks 0 balance & builds signed SPL TransferChecked tx
  const derived = await cryptoEngine.deriveAllChainKeysAsync(
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  );
  const zeroSolWallet = {
    ...derived,
    nativeBalances: { near: 0, sol: 0, eth: 0 },
    splBalances: { EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 0 }
  };
  await assert.rejects(
    chainContracts.executeSolanaSplTransfer({
      wallet: zeroSolWallet,
      mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      toAddress: '11111111111111111111111111111111',
      amount: 10,
      decimals: 6
    }),
    /余额不足|Insufficient/
  );

  // 4. Earn withdrawal functions pre-validate gas before network calls
  await assert.rejects(
    chainContracts.unstakeFromNearValidator({ wallet: zeroSolWallet, validatorId: 'astro-stakers.poolv1.near' }),
    /NEAR 余额不足|Insufficient NEAR/
  );
  await assert.rejects(
    chainContracts.withdrawFromAaveV3({ wallet: zeroSolWallet, poolId: 'aave_eth_usdc', amount: 'max' }),
    /Gas 不足|Insufficient native gas/
  );
});


test('v4.0 Swap Target Gas & Solana ATA Rent Reserve: zero-latency detection for new vs existing SPL ATA & Extra/None modes', () => {
  const newSplMint = 'XsoNr11111111111111111111111111111111111111';
  const existingSplMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const nearTok = { blockchain: 'near', symbol: 'NEAR', contractAddress: 'wrap.near' };
  const newSplTok = { blockchain: 'sol', symbol: 'STONK', contractAddress: newSplMint };
  const existingSplTok = { blockchain: 'sol', symbol: 'USDC', contractAddress: existingSplMint };
  const hoodTok = { blockchain: 'hood', symbol: 'PONS', contractAddress: '0x1111111111111111111111111111111111111111' };

  const emptyWallet = {
    accountType: 'standard',
    nativeBalances: { sol: 0, hood: 0 },
    splBalances: { [existingSplMint]: { formatted: 0 } }
  };

  const destSolQuote = { compositeType: 'SMART_HUB_ROUTE', stages: [{ type: 'BRIDGE_OUT' }, { type: 'DEST_DEX', chain: 'sol' }] };
  const destHoodQuote = { compositeType: 'SMART_HUB_ROUTE', stages: [{ type: 'BRIDGE_OUT' }, { type: 'DEST_DEX', chain: 'hood' }] };

  // Without resolved quoteData for cross-chain, never guess target gas reserve
  assert.equal(uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'auto').showSelector, false);

  // New SPL token with 0 SOL & DEST_DEX quote -> recommends 0.0035 SOL (0.0025 ATA rent + 0.001 gas)
  const rNew = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'auto', destSolQuote);
  assert.equal(rNew.showSelector, true);
  assert.equal(rNew.isNewSolAta, true);
  assert.equal(rNew.recommendedReserve, 0.0035);
  assert.equal(rNew.selectedReserve, 0.0035);

  // Extra mode -> 0.01 SOL (never allows 0 reserve when target lacks gas)
  assert.equal(uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'extra', destSolQuote).selectedReserve, 0.01);
  assert.equal(uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'none', destSolQuote).selectedReserve, 0.0035);

  // Existing SPL ATA with 0 SOL -> recommends 0.001 SOL (gas only, no ATA rent)
  const rOld = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, existingSplTok, 'auto', destSolQuote);
  assert.equal(rOld.isNewSolAta, false);
  assert.equal(rOld.recommendedReserve, 0.001);

  // When wallet already has >= 0.005 SOL -> auto reserve drops to 0
  const fundedWallet = {
    accountType: 'standard',
    nativeBalances: { sol: 0.05, hood: 0.01 },
    splBalances: {}
  };
  assert.equal(uiController.getTargetChainGasReserveInfo(fundedWallet, nearTok, newSplTok, 'auto', destSolQuote).selectedReserve, 0);
  assert.equal(uiController.getTargetChainGasReserveInfo(fundedWallet, nearTok, hoodTok, 'auto', destHoodQuote).selectedReserve, 0);

  // Native EVM target (e.g. NVDAx -> Base ETH) or direct 1Click route without DEST_DEX -> no gas reserve needed
  const baseEthTok = { blockchain: 'base', symbol: 'ETH', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' };
  const baseUsdcTok = { blockchain: 'base', symbol: 'USDC', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' };
  const rBaseEth = uiController.getTargetChainGasReserveInfo(emptyWallet, newSplTok, baseEthTok, 'auto');
  assert.equal(rBaseEth.showSelector, false);
  assert.equal(rBaseEth.selectedReserve, 0);
  const directQuoteNoDestDex = { compositeType: 'ONECLICK_DIRECT', stages: [{ type: 'ONECLICK' }] };
  const rDirectUsdc = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, baseUsdcTok, 'auto', directQuoteNoDestDex);
  assert.equal(rDirectUsdc.showSelector, false);
  assert.equal(rDirectUsdc.selectedReserve, 0);

  // Net swap output deducts selectedReserve proportionally from DEST_DEX stage
  const multiStageQuote = {
    compositeType: 'SMART_HUB_ROUTE',
    amountOutFormatted: '100',
    stages: [
      { type: 'BRIDGE_OUT', expectedOut: '1000000000' }, // 1.0 SOL
      { type: 'DEST_DEX', chain: 'sol' }
    ]
  };
  const rExtra = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'extra', multiStageQuote);
  const netExtra = uiController.computeNetSwapOutput(multiStageQuote, newSplTok, rExtra, 100);
  assert.ok(Math.abs(netExtra.netOutNum - 99) < 1e-6);
  const netFunded = uiController.computeNetSwapOutput(
    multiStageQuote,
    newSplTok,
    uiController.getTargetChainGasReserveInfo(fundedWallet, nearTok, newSplTok, 'auto', multiStageQuote),
    100
  );
  assert.equal(netFunded.netOutNum, 100);
});

test('v4.4 Solana ATA Rent Reclaim & Dust Burn Instructions', () => {
  const owner = 'CDKfRrFcfgiMsNeyzUjGr9hEtnzWeSy2Gz5WmJj5xBK';
  const mint1 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const mint2 = 'XsoNr11111111111111111111111111111111111111';
  const ata1 = '5B3v3n5r5V6n6X7x8Y9yAzB1c2d3e4f5g6h7i8j9k1l2';
  const ata2 = '6C4w4o6s6W7o7Y8y9Z0zB1C2d3e4f5g6h7i8j9k1l2m3';

  const ixs = chainContracts.buildSolanaCloseOrBurnInstructions({
    ownerAddress: owner,
    accounts: [
      { ataAddress: ata1, mint: mint1, programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', rawAmount: '0' },
      { ataAddress: ata2, mint: mint2, programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', rawAmount: '500' }
    ]
  });

  // Empty account -> 1 CloseAccount ix (opcode 9); Dust account -> Burn (opcode 8) + CloseAccount (opcode 9)
  assert.equal(ixs.length, 3);
  assert.equal(ixs[0].programId, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  assert.equal(ixs[0].data[0], 9);
  assert.equal(ixs[1].programId, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  assert.equal(ixs[1].data[0], 8);
  assert.equal(ixs[1].data[1], 500 & 0xff);
  assert.equal(ixs[1].data[2], (500 >> 8) & 0xff);
  assert.equal(ixs[2].programId, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  assert.equal(ixs[2].data[0], 9);
});

test('v5.2 Pearl Network Taproot (BIP-340 Schnorr + BIP-341 SegWit v1) UTXO Signing & Builder', async () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const pearl = await cryptoEngine.derivePearlFromSeedAsync(mnemonic, "m/86'/808276'/0'/0/0", true);
  assert.ok(pearl.address.startsWith('prl1p'));
  assert.ok(pearl.tweakedPrivateKeyHex);

  // BIP-340 Schnorr sign & verify round-trip
  const msg32 = cryptoEngine.sha256Bytes('pearl-taproot-test-msg');
  const sig64 = cryptoEngine.signSchnorrBip340(msg32, pearl.tweakedPrivateKeyHex);
  assert.equal(sig64.length, 64);
  assert.equal(cryptoEngine.verifySchnorrBip340(sig64, msg32, pearl.pubkeyHex), true);

  // Build real SegWit v1 Taproot transaction
  const recipient = (await cryptoEngine.derivePearlFromSeedAsync(mnemonic, "m/86'/808276'/0'/0/1", true)).address;
  const built = chainContracts.buildSignedPearlTaprootTx({
    fromAddress: pearl.address,
    toAddress: recipient,
    amountGrains: '500000000', // 5 PRL
    feeGrains: '100000', // 0.001 PRL
    utxos: [
      { txid: '11'.repeat(32), vout: 0, value: '1049344800' } // 10.493448 PRL
    ],
    tweakedPrivateKeyHex: pearl.tweakedPrivateKeyHex
  });

  assert.equal(built.inputCount, 1);
  assert.equal(built.outputCount, 2); // recipient + change
  assert.equal(built.changeGrains, String(1049344800 - 500000000 - 100000));
  // Version 2 LE (02000000) + SegWit marker/flag (0001)
  assert.ok(built.rawHex.startsWith('020000000001'));

  // Insufficient UTXOs throws locally before broadcast
  assert.throws(() => {
    chainContracts.buildSignedPearlTaprootTx({
      fromAddress: pearl.address,
      toAddress: recipient,
      amountGrains: '2000000000',
      feeGrains: '100000',
      utxos: [{ txid: '22'.repeat(32), vout: 0, value: '100000000' }],
      tweakedPrivateKeyHex: pearl.tweakedPrivateKeyHex
    });
  }, /PRL UTXO/);
});

test('v5.4 Fee Policy: NEAR/1Click 25bps (zhic49280.near), Solana/EVM DEX 0bps default', async () => {
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const body = JSON.parse(opts.body);
      return jsonResponse({
        quote: {
          amountOut: '9975000',
          amountOutFormatted: '9.975',
          amountInUsd: '10',
          amountOutUsd: '9.975',
          depositAddress: null,
          _echoAppFees: body.appFees || null
        }
      });
    }
    if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
      assert.equal(url.includes('platformFeeBps='), false, 'Jupiter default must charge 0 platformFeeBps');
      return jsonResponse({ outAmount: '5000000' });
    }
    if (url.includes('aggregator-api.kyberswap.com')) {
      assert.equal(url.includes('feeAmount='), false, 'KyberSwap default must charge 0 feeBps');
      return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '1000000000', amountInUsd: '10', amountOutUsd: '10' } } });
    }
    if (url.includes('api.paraswap.io/prices')) {
      assert.equal(url.includes('partnerFeeBps='), false, 'ParaSwap default must charge 0 partnerFeeBps');
      return jsonResponse({ priceRoute: { destAmount: '900000000' } });
    }
    return jsonResponse({}, 404);
  }, async (calls) => {
    const ocDefault = await nearIntents.quoteIntentSwapOrWithdraw({
      originAsset: 'nep141:wrap.near',
      destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      amountRaw: '1000000000000000000000000',
      recipient: 'alice.near',
      dry: true
    });
    assert.equal(ocDefault.ok, true);
    assert.equal(ocDefault.serviceFeeBps, 25);
    assert.deepEqual(ocDefault.quote._echoAppFees, [{ recipient: 'zhic49280.near', fee: 25 }]);

    const ocZero = await nearIntents.quoteIntentSwapOrWithdraw({
      originAsset: 'nep141:sol.omft.near',
      destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      amountRaw: '1000000000',
      recipient: 'alice.near',
      appFeeBps: 0,
      dry: true
    });
    assert.equal(ocZero.ok, true);
    assert.equal(ocZero.serviceFeeBps, 0);
    assert.equal(ocZero.quote._echoAppFees, null);

    const solQ = await chainContracts.quoteSolanaJupiterSwap({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amountRaw: '100000000'
    });
    assert.equal(solQ.serviceFeeBps, 0);
    assert.equal(solQ.outAmount, '5000000');

    const evmQ = await chainContracts.quoteEvmDexSwap({
      chainKey: 'base',
      srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      destToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountRaw: '100000000000000000',
      srcDecimals: 18,
      destDecimals: 6
    });
    assert.equal(evmQ.ok, true);
    assert.equal(evmQ.serviceFeeBps, 0);
    assert.equal(calls.some((c) => c.url.includes('platformFeeBps=') || c.url.includes('feeAmount=')), false);
  });
});

test('v5.4 True Net Swap Output & Source Gating & Active Order Persistence / UX', async () => {
  // 1. Legacy CROSS_CHAIN_TO_SOL_DEX / CROSS_CHAIN_TO_EVM_DEX reserve & net deduction via intermediaryRaw
  const emptyWallet = {
    id: 'w_v54',
    accountType: 'standard',
    nearNamedAccount: 'alice.near',
    nativeBalances: { sol: 0, eth: 0, near: 10, prl: 50 },
    splBalances: {}
  };
  const nearTok = { blockchain: 'near', symbol: 'NEAR', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 };
  const newSplTok = { blockchain: 'sol', symbol: 'JUP', assetId: 'sol:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', contractAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 };
  const legacySolDexQuote = {
    compositeType: 'CROSS_CHAIN_TO_SOL_DEX',
    intermediaryRaw: '1000000000', // 1.0 SOL bridged
    amountOut: '200000000',
    amountOutFormatted: '200'
  };
  const gInfo = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'auto', legacySolDexQuote);
  assert.equal(gInfo.showSelector, true);
  assert.equal(gInfo.selectedReserve, 0.0035);
  const net = uiController.computeNetSwapOutput(legacySolDexQuote, newSplTok, gInfo, 200);
  assert.ok(Math.abs(net.netOutNum - 200 * (1 - 0.0035)) < 1e-6);

  // 2. Source chain gating
  assert.equal(uiController.isSwapOriginSupported({ blockchain: 'prl' }), true);
  assert.equal(uiController.isSwapOriginSupported({ blockchain: 'arc' }), true);
  assert.equal(uiController.isSwapOriginSupported({ blockchain: 'btc' }), true);
  assert.equal(uiController.isSwapOriginSupported({ blockchain: 'qtc' }), false);

  // 3. Persistent active swap order across initState + clearSavedSwapOrder
  await withMockedStorage({}, async () => {
    const sampleOrder = {
      depositAddress: 'prl1p0000000000000000000000000000000000000000000000000000q3p4s5',
      originTxHash: 'abc123def4567890',
      autoBroadcasted: true,
      followUpFailed: true,
      status: 'SUCCESS',
      fromSymbol: 'PRL',
      toSymbol: 'SOL',
      createdAt: Date.now()
    };
    state.saveActiveSwapOrder(sampleOrder);
    state.swap.activeOrder = null;
    state.initState();
    assert.equal(state.swap.activeOrder?.originTxHash, 'abc123def4567890');
    assert.equal(state.swap.activeOrder?.autoBroadcasted, true);

    // Mock DOM to verify manual QR box hidden when autoBroadcasted=true, and resume button shown when followUpFailed=true
    const makeEl = () => {
      const classes = new Set();
      return {
        textContent: '',
        innerHTML: '',
        value: '',
        disabled: false,
        classList: {
          add: (...xs) => xs.forEach((x) => classes.add(x)),
          remove: (...xs) => xs.forEach((x) => classes.delete(x)),
          toggle: (x, force) => (force === undefined ? (classes.has(x) ? classes.delete(x) : classes.add(x)) : (force ? classes.add(x) : classes.delete(x))),
          contains: (x) => classes.has(x)
        }
      };
    };
    const domMap = {
      'swap-order-card': makeEl(),
      'swap-order-deposit-addr': makeEl(),
      'swap-order-status': makeEl(),
      'swap-order-tx-row': makeEl(),
      'swap-order-origin-tx': makeEl(),
      'swap-order-manual-box': makeEl(),
      'swap-order-qr': makeEl(),
      'btn-resume-swap-stage': makeEl()
    };
    const prevDoc = globalThis.document;
    globalThis.document = {
      getElementById: (id) => domMap[id] || null,
      querySelectorAll: () => [],
      querySelector: () => null
    };
    try {
      uiController.renderSwapOrderCard();
      assert.equal(domMap['swap-order-card'].classList.contains('hidden'), false);
      assert.equal(domMap['swap-order-manual-box'].classList.contains('hidden'), true, 'Auto-broadcasted swaps must hide manual QR/paste box');
      assert.equal(domMap['swap-order-qr'].classList.contains('hidden'), true);
      assert.equal(domMap['swap-order-tx-row'].classList.contains('hidden'), false);
      assert.equal(domMap['btn-resume-swap-stage'].classList.contains('hidden'), false);
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }

    state.clearSavedSwapOrder();
    state.swap.activeOrder = null;
    state.initState();
    assert.equal(state.swap.activeOrder, null);
  });
});

test('v5.4 Pearl UTXO v0/v1 SPK, Immature Coinbase Filtering, FastNear /ft & Key Derivation Cache', async () => {
  // 1. SegWit v0 (prl1q) & v1 Taproot (prl1p) output scriptPubKey support
  const prog20 = Array.from({ length: 20 }, (_, i) => (i + 1) & 0xff);
  const convert8to5 = (bytes) => {
    let acc = 0; let bits = 0; const res = [];
    for (const b of bytes) {
      acc = (acc << 8) | b; bits += 8;
      while (bits >= 5) { bits -= 5; res.push((acc >> bits) & 31); }
    }
    if (bits > 0) res.push((acc << (5 - bits)) & 31);
    return res;
  };
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const hrpExpand = (h) => [...h.split('').map(c => c.charCodeAt(0) >> 5), 0, ...h.split('').map(c => c.charCodeAt(0) & 31)];
  const polymod = (vals) => {
    const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let c = 1;
    for (const v of vals) {
      const b = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i];
    }
    return c;
  };
  const valsV0 = [0, ...convert8to5(prog20)];
  const chkV0 = polymod(hrpExpand('prl').concat(valsV0).concat([0, 0, 0, 0, 0, 0])) ^ 1;
  const addrV0 = 'prl1' + valsV0.concat([0, 1, 2, 3, 4, 5].map(i => (chkV0 >> (5 * (5 - i))) & 31)).map(v => charset[v]).join('');
  const spkV0 = chainContracts.pearlOutputScriptPubKey(cryptoEngine, addrV0);
  assert.equal(spkV0[0], 0x00);
  assert.equal(spkV0[1], 20);

  const pearl = await cryptoEngine.derivePearlFromSeedAsync(TEST_MNEMONIC, "m/86'/808276'/0'/0/0", true);
  const spkV1 = chainContracts.pearlOutputScriptPubKey(cryptoEngine, pearl.address);
  assert.equal(spkV1[0], 0x51);
  assert.equal(spkV1[1], 0x20);

  // 2. Reject immature coinbase UTXO before broadcast
  await withMockedFetch(async (url) => {
    if (url.includes('/api/v2/utxo/')) {
      return jsonResponse([{ txid: 'aa'.repeat(32), vout: 0, value: '1000000000', coinbase: true, confirmations: 12 }]);
    }
    if (url.includes('/api/v2/estimatefee/')) return jsonResponse({ result: '0.0065' });
    return jsonResponse({}, 404);
  }, async () => {
    await assert.rejects(
      chainContracts.executePearlTransfer({
        wallet: { ...pearl, nativeBalances: { prl: 10 }, address: pearl.address, tweakedPrivateKeyHex: pearl.tweakedPrivateKeyHex },
        toAddress: addrV0,
        amountPrl: 1
      }),
      /UTXO|成熟|maturing/i
    );
  });

  // 3. Key derivation cache sets _mpcDerivedForNearId
  const cachedWallet = { mnemonic: TEST_MNEMONIC, nearNamedAccount: 'alice.near', nearAddress: 'alice.near' };
  await chainContracts.ensureWalletSigningKeysAsync(cachedWallet);
  assert.equal(cachedWallet._mpcDerivedForNearId, 'alice.near');
  const firstEvm = cachedWallet.evmAddress;
  await chainContracts.ensureWalletSigningKeysAsync(cachedWallet);
  assert.equal(cachedWallet.evmAddress, firstEvm);

  // 4. FastNear single-request /ft aggregation for >2 contracts
  await withMockedFetch(async (url) => {
    if (url.includes('api.fastnear.com/v1/account/alice.near/ft')) {
      return jsonResponse({
        account_id: 'alice.near',
        tokens: [
          { contract_id: 'prl.omft.near', balance: '250000000' },
          { contract_id: 'wrap.near', balance: '1000000000000000000000000' }
        ]
      });
    }
    return jsonResponse({}, 404);
  }, async (calls) => {
    const res = await nearIntents.fetchNearNep141Balances('alice.near', {
      'prl.omft.near': 8,
      'wrap.near': 24,
      'usdt.tether-token.near': 6
    });
    assert.equal(res['prl.omft.near'].formatted, 2.5);
    assert.equal(res['wrap.near'].formatted, 1);
    assert.equal(res['usdt.tether-token.near'].formatted, 0);
    assert.equal(calls.length, 1);
  });
});

test('v5.4 Staking: Burrow 24-dec wrap.near / max withdraw, Burrow supply positions & NEAR 429 cooldown', async () => {
  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/bob.near/full')) {
      return jsonResponse({ pools: [] });
    }
    if ((url.includes('free.rpc.fastnear.com') || url.includes('rpc.mainnet.near.org')) && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b.method === 'query' && b.params?.account_id === 'contract.main.burrow.near' && b.params?.method_name === 'get_account') {
        const resBytes = [...Buffer.from(JSON.stringify({
          supplied: [{ token_id: 'wrap.near', balance: (2n * 10n ** 24n).toString(), shares: '1', apr: '0.03' }]
        }))];
        return jsonResponse({ jsonrpc: '2.0', result: { result: resBytes } });
      }
      if (b.method === 'query' && b.params?.account_id === 'contract.main.burrow.near' && b.params?.method_name === 'get_asset') {
        const resBytes = [...Buffer.from(JSON.stringify({ config: { extra_decimals: 0 } }))];
        return jsonResponse({ jsonrpc: '2.0', result: { result: resBytes } });
      }
      if (b.method === 'query' && b.params?.request_type === 'view_access_key') {
        return jsonResponse({ jsonrpc: '2.0', result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
      }
      if (b.method === 'broadcast_tx_commit') {
        return jsonResponse({ jsonrpc: '2.0', result: { transaction: { hash: 'BurrowWithdrawHash555' }, status: { SuccessValue: '' } } });
      }
    }
    return jsonResponse({}, 404);
  }, async (calls) => {
    const pos = await chainContracts.fetchNearAccountStakingPositionsAsync('bob.near');
    const burrowPos = pos.find((p) => p.type === 'burrow_supply');
    assert.ok(burrowPos, 'Burrow supplied position must be discovered');
    assert.equal(burrowPos.totalAmount, 2);
    assert.equal(burrowPos.decimals, 24);

    const nearKeys = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC, 0);
    const wallet = {
      id: 'w_bob',
      accountType: 'standard',
      nearNamedAccount: 'bob.near',
      nearAddress: nearKeys.nearAddress,
      nearPublicKey: nearKeys.nearPublicKey,
      nearPrivateKey: nearKeys.nearPrivateKey,
      nearPrivateSeedHex: nearKeys.nearPrivateSeedHex,
      nearBalance: 5,
      nativeBalances: { near: 5 }
    };
    const wMax = await chainContracts.withdrawFromBurrow({ wallet, tokenContract: 'wrap.near', amount: 'max', decimals: 24 });
    assert.equal(wMax.txHash, 'BurrowWithdrawHash555');
    // Verify tx payload omitted max_amount on 'max'
    const lastBcast = calls.filter((c) => c.options?.body && c.options.body.includes('broadcast_tx_commit')).pop();
    const signedRaw = Buffer.from(JSON.parse(lastBcast.options.body).params[0], 'base64').toString('utf8');
    assert.equal(signedRaw.includes('max_amount'), false, 'Burrow max withdraw should omit max_amount to withdraw 100%');
    assert.equal(signedRaw.includes('"token_id":"wrap.near"'), true);
  });
});

test('v5.5 Upfront NEAR Hub & MPC Gas Pre-Validation before Multi-Stage Swaps', () => {
  const zeroNearWallet = { accountType: 'standard', nativeBalances: { near: 0, prl: 20, sol: 1 }, nearBalance: 0 };
  const fundedNearWallet = { accountType: 'standard', nativeBalances: { near: 0.05, prl: 20, sol: 1 }, nearBalance: 0.05 };

  const prlL1Tok = { blockchain: 'prl', symbol: 'PRL', assetId: 'nep141:prl.omft.near' };
  const prlNearTok = { blockchain: 'near', symbol: 'PRL', assetId: '1cs_v1:near:nep141:prl.omft.near', contractAddress: 'prl.omft.near' };
  const solTok = { blockchain: 'sol', symbol: 'SOL', assetId: 'nep141:sol.omft.near', contractAddress: 'So11111111111111111111111111111111111111112' };
  const ethTok = { blockchain: 'eth', symbol: 'ETH', assetId: 'nep141:eth.omft.near', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' };

  // 1. Pearl L1 PRL -> SOL with 0 NEAR must be blocked upfront (needs >= 0.02 NEAR for NEAR hub stage)
  assert.throws(
    () => uiController.validateSwapNearGasRequirement({ wallet: zeroNearWallet, fromToken: prlL1Tok, toToken: solTok }),
    /NEAR 余额不足|Insufficient NEAR/
  );

  // With SMART_HUB_ROUTE + DEST_DEX, requires 0.03 NEAR (0.02 hub + 0.01 MPC)
  assert.throws(
    () => uiController.validateSwapNearGasRequirement({
      wallet: { accountType: 'standard', nativeBalances: { near: 0.025 } },
      fromToken: prlL1Tok,
      toToken: solTok,
      quoteData: { compositeType: 'SMART_HUB_ROUTE', stages: [{ type: 'BRIDGE_IN' }, { type: 'NEAR_SWAP' }, { type: 'BRIDGE_OUT' }, { type: 'DEST_DEX', chain: 'sol' }] }
    }),
    /NEAR 余额不足|Insufficient NEAR/
  );

  // 2. Pure Pearl L1 PRL -> NEAR PRL bridge needs 0 NEAR (direct 1Click L1 bridge)
  const bridgeCheck = uiController.validateSwapNearGasRequirement({ wallet: zeroNearWallet, fromToken: prlL1Tok, toToken: prlNearTok });
  assert.equal(bridgeCheck.ok, true);
  assert.equal(bridgeCheck.requiredNear, 0);

  // 3. MPC SOL -> ETH with 0 NEAR and no solPrivateSeedHex must be blocked upfront (needs >= 0.01 NEAR)
  assert.throws(
    () => uiController.validateSwapNearGasRequirement({ wallet: zeroNearWallet, fromToken: solTok, toToken: ethTok }),
    /NEAR 余额不足|Insufficient NEAR/
  );

  // 4. Funded NEAR wallet passes both Pearl L1 PRL -> SOL (with DEST_DEX) and MPC SOL -> ETH
  const prlOk = uiController.validateSwapNearGasRequirement({
    wallet: fundedNearWallet,
    fromToken: prlL1Tok,
    toToken: solTok,
    quoteData: { compositeType: 'SMART_HUB_ROUTE', stages: [{ type: 'BRIDGE_IN' }, { type: 'NEAR_SWAP' }, { type: 'BRIDGE_OUT' }, { type: 'DEST_DEX', chain: 'sol' }] }
  });
  assert.equal(prlOk.ok, true);
  assert.equal(prlOk.requiredNear, 0.03);

  const solOk = uiController.validateSwapNearGasRequirement({ wallet: fundedNearWallet, fromToken: solTok, toToken: ethTok });
  assert.equal(solOk.ok, true);
  assert.equal(solOk.requiredNear, 0.01);
});

test('v6.0 Regression Suite: Bitcoin BIP-86/Taproot, PBKDF2 PIN, Checksums, Multicall3/Ethena, Zero Fake APY, Mining Pro & Server SSRF/XSS', async () => {
  // 1. Bitcoin BIP-86 derivation, Taproot Tx builder + Schnorr verify + dust guard
  const btc1 = await cryptoEngine.deriveBitcoinFromSeedAsync(TEST_MNEMONIC, "m/86'/0'/0'/0/0", true);
  const btc2 = await cryptoEngine.deriveBitcoinFromSeedAsync(TEST_MNEMONIC, "m/86'/0'/0'/0/1", true);
  assert.equal(btc1.address, 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
  assert.ok(btc1.tweakedPrivateKeyHex && btc1.pubkeyHex);

  const builtBtc = chainContracts.buildSignedBitcoinTaprootTx({
    fromAddress: btc1.address,
    toAddress: btc2.address,
    amountSats: '50000',
    feeSats: '1500',
    utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
    tweakedPrivateKeyHex: btc1.tweakedPrivateKeyHex
  });
  assert.ok(builtBtc.rawHex.startsWith('020000000001'));
  assert.equal(builtBtc.changeSats, '48500');

  assert.throws(
    () =>
      chainContracts.buildSignedBitcoinTaprootTx({
        fromAddress: btc1.address,
        toAddress: btc2.address,
        amountSats: '200', // below 546 sat dust limit
        feeSats: '1500',
        utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
        tweakedPrivateKeyHex: btc1.tweakedPrivateKeyHex
      }),
    /粉尘|dust/i
  );

  // 2. Strict Bech32 / Bech32m / Base58Check checksum rejection
  const mutatedBtc = btc1.address.slice(0, -1) + (btc1.address.endsWith('r') ? 'q' : 'r');
  assert.equal(cryptoEngine.validateChainAddress('btc', mutatedBtc).valid, false);
  const prl1 = (await cryptoEngine.derivePearlFromSeedAsync(TEST_MNEMONIC, "m/86'/808276'/0'/0/0", true)).address;
  const mutatedPrl = prl1.slice(0, -1) + (prl1.endsWith('4') ? '5' : '4');
  assert.equal(cryptoEngine.validatePearlAddress(mutatedPrl).valid, false);
  const validLegacyBtc = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const mutatedLegacyBtc = validLegacyBtc.slice(0, -1) + 'b';
  assert.throws(() => cryptoEngine.base58CheckDecode(mutatedLegacyBtc));
  assert.equal(cryptoEngine.validateChainAddress('btc', mutatedLegacyBtc).valid, false);

  // 3. PBKDF2 PIN hashing (zero plaintext PIN storage)
  const pinWallet = { id: 'w_v6_pin', name: 'PIN Vault' };
  assert.equal(state.hasWalletPin(pinWallet), false);
  await state.setWalletPinAsync(pinWallet, '246810');
  assert.equal(state.hasWalletPin(pinWallet), true);
  assert.ok(!pinWallet.pin && pinWallet.pinHash && pinWallet.pinSalt);
  assert.equal(await state.verifyWalletPinAsync(pinWallet, '246810'), true);
  assert.equal(await state.verifyWalletPinAsync(pinWallet, '000000'), false);

  // 4. Multicall3 round-trip & Ethena selectors (0x01320fe2 / 0x35269315)
  const sampleCalls = [
    { target: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', allowFailure: true, callData: '0x70a08231' + '11'.repeat(32) },
    { target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', allowFailure: true, callData: '0x35269315' }
  ];
  const mcEncoded = chainContracts.encodeMulticall3Aggregate3(sampleCalls);
  assert.ok(mcEncoded.startsWith('0x82ad56cb'));

  let capturedMcData = '';
  await withMockedFetch(async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    if (body && body.method === 'eth_call' && body.params?.[0]?.to === '0xcA11bde05977b3631167028862bE2a173976CA11') {
      capturedMcData = body.params[0].data;
      const ethersLib = require('../ethers.umd.min.js');
      const mcIface = new ethersLib.Interface(['function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])']);
      const wordOne = '0x' + '00'.repeat(31) + '01';
      const wZero = '0x' + '00'.repeat(32);
      const retHex = mcIface.encodeFunctionResult('aggregate3', [[
        { success: true, returnData: wZero },
        { success: true, returnData: wZero },
        { success: true, returnData: wZero },
        { success: true, returnData: '0x0000000000000000000000000000000000000000000000056bc75e2d63100000' }, // 100 sUSDe
        { success: true, returnData: '0x' + '00'.repeat(32) + '00'.repeat(32) },
        { success: true, returnData: wordOne.slice(0, 66) }
      ]]);
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: retHex });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const evmPos = await chainContracts.fetchEvmAccountStakingPositionsAsync({
      evmAddress: '0xa2869D3977DEa9afc9B9c069491ac08F06F9e458'
    });
    assert.ok(capturedMcData.includes('01320fe2'), 'Multicall3 must use verified cooldowns(address) selector 0x01320fe2');
    assert.ok(capturedMcData.includes('35269315'), 'Multicall3 must use verified cooldownDuration() selector 0x35269315');
    assert.ok(evmPos.some((p) => p.poolId === 'ethena_susde' && p.needsCooldown === true));
  });

  // 5. Zero fake APY & zero 0x1111...1111 placeholder
  await withMockedFetch(async () => jsonResponse({}, 404), async () => {
    const offlinePools = await chainContracts.fetchLiveStakingMetrics({ useCache: false });
    const byId = Object.fromEntries(offlinePools.map((p) => [p.id, p]));
    assert.equal(byId.rhea_orhea_convert.apy, null);
    assert.equal(byId.stader_nearx.apy, null);
    assert.equal(byId.jupiter_jup.apy, null);
  });
  const intentsSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'near-intents.js'), 'utf8');
  assert.equal(intentsSrc.includes('0x1111111111111111111111111111111111111111'), false);

  // 6. Mining Pro: realHashrate NOT scaled by 2^32 & canonical PRLSCAN_TX_EXPLORER_BASE
  assert.equal(miningPro.PRLSCAN_TX_EXPLORER_BASE, 'https://explorer.prlscan.com/tx/');
  await withMockedFetch(async (url) => {
    if (url.includes('pearl.herominers.com/api/stats_address')) {
      const nowSec = Math.floor(Date.now() / 1000);
      return jsonResponse({
        stats: { hashrate: 100, balance: '0', paid: '0', minPaymentThreshold: '0' },
        workers: [{ name: 'real-rig', hashrate: 100, realHashrate: 250_000_000_000, lastShare: nowSec, shares_good: 10, shares_invalid: 0, shares_stale: 0 }],
        payments: []
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const heroRes = await miningPro.queryMinerDeepStats(prl1, 'herominers');
    assert.equal(heroRes.workers[0].hashrate30m, 250_000_000_000, 'realHashrate must not be multiplied by 2^32');
  });

  // 7. server.js SSRF & path-traversal protection
  const http = require('http');
  const srv = require('../server.js');
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const port = srv.address().port;
    const rawReq = (reqPath) =>
      new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: reqPath, method: 'GET' }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
      });
    assert.equal(await rawReq('/pearl-proxy?path=//evil.com'), 400);
    assert.equal(await rawReq('/kryptex-proxy?path=/api/../../evil'), 400);
    assert.equal(await rawReq('/.git/config'), 403);
    assert.equal(await rawReq('/../package.json'), 403);
    assert.equal(await rawReq('/%2e%2e/package.json'), 403);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }

  // 8. Zero inline onclick=/onerror=/onchange= & zero PQ remnants in src/ & index.html
  const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'ui-controller.js'), 'utf8');
  const regSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'token-registry.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.equal(/(?<!\.)\bon(?:click|error|change)\s*=/i.test(uiSrc), false);
  assert.equal(/(?<!\.)\bon(?:click|error|change)\s*=/i.test(regSrc), false);
  for (const src of [uiSrc, htmlSrc]) {
    assert.equal(/ml-dsa|post_quantum|postQuantum|activateUniversalAccount/i.test(src), false);
  }
});

test('v6.1 Audit & Performance Regression Suite: Hydration, SWR Cache, Precheck, Abort, 1Click Native IDs, Mining, SW & Gzip', async () => {
  const zlib = require('zlib');
  const http = require('http');

  // 1. setLiveDefuseTokens syncs prices onto core catalog & resolveTokenIcon prioritizes inline data icons over remote URLs
  const nearCore = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t && t.assetId === 'nep141:wrap.near');
  const prevNearPrice = nearCore ? nearCore.price : null;
  const prevNearUpdatedAt = nearCore ? nearCore.priceUpdatedAt : null;
  const prevLive = state.liveTokens;
  try {
    tokenRegistry.setLiveDefuseTokens([
      {
        assetId: 'nep141:wrap.near',
        symbol: 'NEAR',
        blockchain: 'near',
        decimals: 24,
        price: 3.21,
        priceUpdatedAt: '2026-01-01T00:00:00Z'
      }
    ]);
    assert.equal(nearCore.price, 3.21);
    const ethIcon = tokenRegistry.resolveTokenIcon({
      symbol: 'ETH',
      blockchain: 'eth',
      logoURI: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
    });
    assert.equal(ethIcon.primaryUrl, 'https://assets.coingecko.com/coins/images/279/large/ethereum.png');
    assert.ok(ethIcon.fallbackUrl.startsWith('data:image/'));
    const customSvgIcon = tokenRegistry.resolveTokenIcon({
      symbol: 'ETH',
      blockchain: 'eth',
      logoURI: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    });
    assert.equal(customSvgIcon.primaryUrl, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  } finally {
    if (nearCore) {
      nearCore.price = prevNearPrice;
      nearCore.priceUpdatedAt = prevNearUpdatedAt;
    }
    tokenRegistry.setLiveDefuseTokens(Array.isArray(prevLive) ? prevLive : []);
  }

  // 2. state.js: op/pol/avax balance keys, accountType preservation, pinIterations clamp, and 24h SWR cache TTL
  const norm = state.normalizeWalletRecord({
    id: 'w_v61_norm',
    mnemonic: TEST_MNEMONIC,
    accountType: 'imported_key',
    pinIterations: 50,
    nativeBalances: { op: 1.25, pol: 9.5, avax: 0.75 }
  });
  assert.equal(norm.accountType, 'imported_key');
  assert.equal(norm.pinIterations, 1000);
  assert.equal(norm.nativeBalances.op, 1.25);
  assert.equal(norm.nativeBalances.pol, 9.5);
  assert.equal(norm.nativeBalances.avax, 0.75);
  assert.equal(norm.multiBalances.op, 1.25);
  assert.equal(norm.multiBalances.pol, 9.5);
  assert.equal(norm.multiBalances.avax, 0.75);

  await withMockedStorage({
    [state.LIVE_TOKENS_STORAGE_KEY]: JSON.stringify({
      updatedAt: Date.now() - 12 * 3600_000,
      tokens: [{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 2.88 }]
    })
  }, async () => {
    const prevList = state.liveTokens;
    try {
      state.liveTokens = [];
      const loaded = state.loadCachedLiveTokens();
      assert.ok(Array.isArray(loaded) && loaded.length === 1);
      assert.equal(loaded[0].price, 2.88);
    } finally {
      state.liveTokens = prevList;
    }
  });

  // 3. Upfront SPL balance check runs before any RPC call
  let splFetchCount = 0;
  await withMockedFetch(async () => {
    splFetchCount += 1;
    return jsonResponse({}, 500);
  }, async () => {
    await assert.rejects(
      () => chainContracts.executeSolanaSplTransfer({
        wallet: {
          mnemonic: TEST_MNEMONIC,
          solAddress: '11111111111111111111111111111111',
          nativeBalances: { sol: 0 },
          splBalances: {}
        },
        mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        toAddress: '11111111111111111111111111111111',
        amount: 10,
        decimals: 6,
        tokenBalance: 0
      }),
      /余额不足|Insufficient/i
    );
  });
  assert.equal(splFetchCount, 0);

  // 4. quoteIntentSwapOrWithdraw (quoteRawOneClick) honors external AbortSignal AND 10s quote dedup/cache
  let quoteFetchCalls = 0;
  await withMockedFetch(async (url, opts) => {
    quoteFetchCalls += 1;
    if (opts && opts.signal && opts.signal.aborted) {
      throw new Error('Already aborted');
    }
    if (opts && opts.signal) {
      return new Promise((_, reject) => {
        const onAbort = () => reject(new Error('Aborted by external signal'));
        if (opts.signal.aborted) return onAbort();
        opts.signal.addEventListener('abort', onAbort, { once: true });
      });
    }
    return jsonResponse({}, 500);
  }, async () => {
    const extCtrl = new AbortController();
    setTimeout(() => extCtrl.abort(), 15);
    const res = await nearIntents.quoteIntentSwapOrWithdraw({
      originAsset: 'nep141:wrap.near',
      destinationAsset: 'nep141:sol.omft.near',
      amountRaw: '1000000000000000000000000',
      recipient: '11111111111111111111111111111111',
      refundTo: 'alice.near',
      dry: true,
      signal: extCtrl.signal
    });
    assert.equal(res.ok, false);
  });
  assert.equal(quoteFetchCalls, 1);

  let dedupCalls = 0;
  await withMockedFetch(async () => {
    dedupCalls += 1;
    return jsonResponse({
      quote: {
        amountOut: '5000000',
        minAmountOut: '4950000',
        amountInUsd: '2.50',
        amountOutUsd: '2.49'
      }
    });
  }, async () => {
    const [q1, q2] = await Promise.all([
      nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        amountRaw: '1234567890000000000000000',
        recipient: 'alice.near',
        refundTo: 'alice.near',
        dry: true
      }),
      nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        amountRaw: '1234567890000000000000000',
        recipient: 'alice.near',
        refundTo: 'alice.near',
        dry: true
      })
    ]);
    assert.equal(q1.ok, true);
    assert.equal(q2.ok, true);
    assert.equal(dedupCalls, 1);
  });

  // 5. POL/AVAX/OP 1Click native asset resolution + HeroMiners zero threshold fallback
  assert.equal(nearIntents.resolveOneClickAssetId({ symbol: 'POL', blockchain: 'pol' }), 'nep141:pol.omdep.near');
  assert.equal(nearIntents.resolveOneClickAssetId({ symbol: 'AVAX', blockchain: 'avax' }), 'nep141:avax.omdep.near');
  assert.equal(nearIntents.resolveOneClickAssetId({ symbol: 'OP', blockchain: 'op' }), 'nep245:v2_1.omni.hot.tg:10_11111111111111111111');

  await withMockedFetch(async (url) => {
    if (url.includes('pearl.herominers.com/api/stats_address')) {
      return jsonResponse({
        stats: { hashrate: 50, balance: '100000000', paid: '0', minPaymentThreshold: '0' },
        workers: [],
        payments: []
      });
    }
    if (url.includes('pearl.herominers.com/api/stats')) {
      return jsonResponse({
        network: { height: 1000 },
        pool: { minPaymentThreshold: 500000000 },
        config: { coinUnits: 100000000, minPaymentThreshold: 500000000 }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const derived = cryptoEngine.derivePearlFromSeed(TEST_MNEMONIC, "m/86'/808276'/0'/0/0", true);
    const heroStats = await miningPro.queryMinerDeepStats(derived.address, 'herominers');
    assert.equal(heroStats.payoutThresholdPrl, 5);
  });

  // 6. sw.js v6.6 cross-origin pass-through + server.js gzip + OPTIONS preflight
  const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  assert.match(swSrc, /nexus-wallet-v6\.6/);
  assert.match(swSrc, /\.\/bip39-wordlist\.js\?v=6\.6/);
  assert.match(swSrc, /if\s*\(reqUrl\.origin\s*!==\s*self\.location\.origin\)\s*\{\s*return;\s*\}/);

  const srv = require('../server.js');
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const port = srv.address().port;
    const gzRes = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/style.css?v=6.6',
        method: 'GET',
        headers: { 'Accept-Encoding': 'gzip' }
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(gzRes.status, 200);
    assert.equal(gzRes.headers['content-encoding'], 'gzip');
    assert.match(String(gzRes.headers['vary'] || ''), /Accept-Encoding/i);
    const gunzipped = zlib.gunzipSync(gzRes.body).toString('utf8');
    assert.equal(gunzipped, fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8'));

    const optStatus = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/pearl-proxy', method: 'OPTIONS' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(optStatus, 204);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('v6.3 Regression Suite: NEAR Storage Reclaim, Dynamic storage_minimum_balance, Validator Dust Guard, Dynamic NEAR FT & Minimal History', async () => {
  const encodeJsonBytes = (obj) => Array.from(Buffer.from(JSON.stringify(obj), 'utf8'));

  // 1. Dynamic NEAR NEP-141 discovery (unknown token + ft_metadata + FastNear null balance RPC fallback)
  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/alice.near/ft')) {
      return jsonResponse({
        account_id: 'alice.near',
        tokens: [
          { contract_id: 'token.rhealab.near', balance: null },
          { contract_id: 'npro.nearmobile.near', balance: '2500000000000000000000000' }
        ]
      });
    }
    if (opts && opts.body) {
      const rpc = JSON.parse(opts.body);
      const cid = rpc.params && rpc.params.account_id;
      const method = rpc.params && rpc.params.method_name;
      if (cid === 'token.rhealab.near' && method === 'ft_balance_of') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes('101500000000000000000') } });
      }
      if (cid === 'npro.nearmobile.near' && method === 'ft_metadata') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { result: encodeJsonBytes({ symbol: 'NPRO', name: 'NEAR Mobile', decimals: 24, icon: '' }) }
        });
      }
    }
    return jsonResponse({}, 404);
  }, async () => {
    const nepMap = await nearIntents.fetchNearNep141Balances('alice.near');
    assert.equal(nepMap['token.rhealab.near'].formatted, 101.5);
    assert.equal(nepMap['npro.nearmobile.near'].formatted, 2.5);
    assert.equal(nepMap['npro.nearmobile.near'].symbol, 'NPRO');
  });

  // 2. scanNearReclaimableStorageAsync & executeNearStorageReclaim
  const sentNearCalls = [];
  const origNearCall = chainContracts.signAndSendNearFunctionCall;
  chainContracts.signAndSendNearFunctionCall = async (params) => {
    sentNearCalls.push(params);
    return 'near_tx_v63_' + sentNearCalls.length;
  };
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('api.fastnear.com/v1/account/alice.near/ft')) {
        return jsonResponse({
          account_id: 'alice.near',
          tokens: [
            { contract_id: 'wrap.near', balance: '0' },
            { contract_id: 'token.rhealab.near', balance: '101500000000000000000' }
          ]
        });
      }
      if (opts && opts.body) {
        const rpc = JSON.parse(opts.body);
        const cid = rpc.params && rpc.params.account_id;
        const method = rpc.params && rpc.params.method_name;
        if (method === 'storage_balance_of') {
          if (cid === 'wrap.near' || cid === 'token.rhealab.near') {
            return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes({ total: '1250000000000000000000', available: '0' }) } });
          }
          return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes(null) } });
        }
        if (method === 'ft_balance_of') {
          if (cid === 'token.rhealab.near') {
            return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes('101500000000000000000') } });
          }
          return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes('0') } });
        }
        if (cid === 'npro.nearmobile.near' && method === 'storage_minimum_balance') {
          return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes('2500000000000000000000') } });
        }
      }
      return jsonResponse({}, 404);
    }, async () => {
      const scanRes = await chainContracts.scanNearReclaimableStorageAsync('alice.near');
      assert.equal(scanRes.ok, true);
      const wrapAcc = scanRes.accounts.find((a) => a.contractId === 'wrap.near');
      const rheaAcc = scanRes.accounts.find((a) => a.contractId === 'token.rhealab.near');
      assert.ok(wrapAcc && wrapAcc.isEmpty === true && wrapAcc.canReclaim === true);
      assert.ok(Math.abs(wrapAcc.depositNear - 0.00125) < 1e-8);
      assert.ok(rheaAcc && rheaAcc.isEmpty === false && rheaAcc.canReclaim === false);

      const testKeys = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC);
      const testWallet = {
        mnemonic: TEST_MNEMONIC,
        nearNamedAccount: 'alice.near',
        nearAddress: testKeys.nearAddress,
        nearPublicKey: testKeys.nearPublicKey,
        nearPrivateKey: testKeys.nearPrivateKey,
        nativeBalances: { near: 1.5 }
      };

      const reclaimRes = await chainContracts.executeNearStorageReclaim({
        wallet: testWallet,
        contracts: ['wrap.near']
      });
      assert.equal(reclaimRes.ok, true);
      assert.equal(reclaimRes.reclaimedCount, 1);
      assert.equal(sentNearCalls[0].receiverId, 'wrap.near');
      assert.equal(sentNearCalls[0].methodName, 'storage_unregister');
      assert.equal(JSON.parse(sentNearCalls[0].argsJson).force, false);
      assert.equal(sentNearCalls[0].depositYocto, '1');

      // 3. ensureNearNep141StorageRegistered queries storage_minimum_balance
      await chainContracts.ensureNearNep141StorageRegistered({
        resolvedWallet: testWallet,
        accountId: 'alice.near',
        tokenContract: 'npro.nearmobile.near'
      });
      const depCall = sentNearCalls[sentNearCalls.length - 1];
      assert.equal(depCall.receiverId, 'npro.nearmobile.near');
      assert.equal(depCall.methodName, 'storage_deposit');
      assert.equal(depCall.depositYocto, '2500000000000000000000');
    });
  } finally {
    chainContracts.signAndSendNearFunctionCall = origNearCall;
  }

  // 4. fetchNearAccountStakingPositionsAsync filters < 0.0005 NEAR dust and blocks withdraw when unstaked_balance === 0
  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/alice.near/full')) {
      return jsonResponse({
        pools: [
          { pool_id: 'meteor.poolv1.near' },
          { pool_id: 'figment.poolv1.near' }
        ]
      });
    }
    if (opts && opts.body) {
      const rpc = JSON.parse(opts.body);
      const cid = rpc.params && rpc.params.account_id;
      const method = rpc.params && rpc.params.method_name;
      if (cid === 'meteor.poolv1.near' && method === 'get_account') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { result: encodeJsonBytes({ staked_balance: '50879158645145494110', unstaked_balance: '0', can_withdraw: true }) }
        });
      }
      if (cid === 'figment.poolv1.near' && method === 'get_account') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { result: encodeJsonBytes({ staked_balance: '1000000000000000000000000', unstaked_balance: '0', can_withdraw: true }) }
        });
      }
    }
    return jsonResponse({ jsonrpc: '2.0', id: 1, result: { result: encodeJsonBytes(null) } });
  }, async () => {
    const pos = await chainContracts.fetchNearAccountStakingPositionsAsync('alice.near');
    assert.equal(pos.find((p) => p.poolId === 'meteor.poolv1.near'), undefined, 'Must filter 0.00005 NEAR residual dust');
    const fig = pos.find((p) => p.poolId === 'figment.poolv1.near');
    assert.ok(fig, 'Valid 1 NEAR stake must remain');
    assert.equal(fig.canWithdraw, false, 'canWithdraw must be false when unstaked_balance === 0');
  });

  // 5. Minimal token detail activity renders +/- signs on stake/unstake and drops Mining badge
  await withMockedStorage({}, async () => {
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const domMap = new Map();
    const makeEl = (id) => {
      if (!domMap.has(id)) {
        domMap.set(id, {
          id,
          className: '',
          innerHTML: '',
          textContent: '',
          href: '',
          value: '',
          disabled: false,
          setAttribute() {},
          removeAttribute() {},
          classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            toggle(c, f) { if (f === undefined) { if (this._set.has(c)) this._set.delete(c); else this._set.add(c); } else if (f) this._set.add(c); else this._set.delete(c); },
            contains(c) { return this._set.has(c); }
          }
        });
      }
      return domMap.get(id);
    };
    [
      'sheet-backdrop', 'sheet-token-detail', 'token-detail-icon', 'token-detail-title',
      'token-detail-chains', 'token-detail-balance', 'token-detail-usd',
      'token-detail-addr-row', 'token-detail-addr', 'token-detail-explorer-link',
      'token-detail-breakdown-card', 'token-detail-breakdown-list',
      'token-detail-earn-card', 'token-detail-earn-list', 'token-detail-history-list',
      'token-detail-price-label', 'token-detail-price-val'
    ].forEach(makeEl);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => []
    };
    try {
      const w = state.normalizeWalletRecord({
        id: 'w_v63_hist',
        mnemonic: TEST_MNEMONIC,
        nearNamedAccount: 'alice.near',
        nativeBalances: { near: 5 },
        activityHistory: [
          { id: 's1', type: 'stake', symbol: 'RHEA', toSymbol: 'xRHEA', chain: 'near', amount: 100, txHash: 'stake_tx_1', title: 'Rhea', timestamp: 1700000300 },
          { id: 'u1', type: 'unstake', symbol: 'RHEA', chain: 'near', amount: 50, txHash: 'unstake_tx_1', title: 'Rhea', timestamp: 1700000400 }
        ],
        nearNep141Balances: { 'token.rhealab.near': { raw: '100000000000000000000', formatted: 100 } }
      });
      state.wallets = [w];
      state.activeWalletId = w.id;
      await withMockedFetch(async () => jsonResponse({ txns: [] }), async () => {
        uiController.openTokenDetailSheet('RHEA');
        await new Promise((r) => setTimeout(r, 20));
        const histHtml = domMap.get('token-detail-history-list').innerHTML;
        assert.ok(histHtml.includes('-100 RHEA'));
        assert.ok(histHtml.includes('+50 RHEA'));
        assert.equal(histHtml.includes('挖矿') || histHtml.includes('>Mining<'), false);
      });
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
    }
  });
});

test('v6.4 Fixes: Official Icons + Fallback, Live Jupiter ASR APY, Swap USD & Button Error UX, Scheme A Recipient Lock, PRL Route Label, Merged EVM/Arc, Solana ATA Detection & Cache v6.4', async () => {
  // 1. Official remote icons take primaryUrl while local makeLocalIcon SVG acts as offline fallbackUrl
  for (const sym of ['PONS', 'QTC', 'SOL', 'BTC', 'EURC']) {
    const icon = tokenRegistry.resolveTokenIcon({ symbol: sym, blockchain: sym === 'SOL' ? 'sol' : (sym === 'BTC' ? 'btc' : 'near') });
    assert.ok(icon.primaryUrl.startsWith('https://'), `${sym} primaryUrl must use official remote HTTPS icon`);
    assert.ok(icon.fallbackUrl.startsWith('data:image/svg+xml;base64,'), `${sym} fallbackUrl must use local SVG data URI`);
  }
  const arcusTok = (tokenRegistry.DEX_CHAIN_TOKENS.arc || []).find((t) => t.symbol === 'ARCUS');
  assert.ok(arcusTok && String(arcusTok.logoURI).startsWith('https://'), 'ARCUS must retain official remote logoURI');
  const arcChain = tokenRegistry.getChainMeta('arc');
  assert.ok(arcChain.logoUrl.endsWith('/arc-dark.svg'), 'CHAIN_META.arc.logoUrl must use official arc-dark.svg');
  assert.ok(arcChain.fallbackLogoUrl.startsWith('data:image/svg+xml;base64,'), 'CHAIN_META.arc.fallbackLogoUrl must use local SVG fallback');

  // 2. Jupiter DAO ASR formatting in zh & en
  const prevLang = state.lang;
  try {
    state.lang = 'zh';
    assert.equal(
      uiController.formatPoolApyText({ apy: 17.02, isJupiterDao: true, isAsrEstimated: true }),
      'ASR 估算 ~17.02%'
    );
    state.lang = 'en';
    assert.equal(
      uiController.formatPoolApyText({ apy: 17.02, isJupiterDao: true, isAsrEstimated: true }),
      'ASR Est. ~17.02%'
    );
  } finally {
    state.lang = prevLang;
  }

  // 3 & 4. SWR persistence of NEAR DEX prices (oRHEA), live #swap-usd-in, & unified button-only error/balance UX
  const orheaTok = (tokenRegistry.DEX_CHAIN_TOKENS.near || []).find((t) => String(t.symbol).toUpperCase() === 'ORHEA');
  const usdtNearTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'USDT' && t.blockchain === 'near');
  const prevOrheaPrice = orheaTok ? orheaTok.price : null;
  await withMockedStorage({}, async () => {
    assert.ok(orheaTok && usdtNearTok);
    orheaTok.price = 0.0193;
    state.saveCachedLiveTokens([
      { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.1 }
    ]);
    orheaTok.price = null;
    state.loadCachedLiveTokens();
    assert.equal(orheaTok.price, 0.0193, 'loadCachedLiveTokens must re-hydrate static NEAR DEX token prices');

    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const prevSwap = { ...state.swap };
    const domMap = new Map();
    const mkEl = (id) => {
      if (!domMap.has(id)) {
        domMap.set(id, {
          id,
          value: '',
          textContent: '',
          innerHTML: '',
          title: '',
          disabled: false,
          setAttribute() {},
          classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            toggle(c, f) { if (f === undefined) { if (this._set.has(c)) this._set.delete(c); else this._set.add(c); } else if (f) this._set.add(c); else this._set.delete(c); },
            contains(c) { return this._set.has(c); }
          },
          querySelector() { return null; },
          querySelectorAll() { return []; }
        });
      }
      return domMap.get(id);
    };
    [
      'swap-from-token-btn', 'swap-to-token-btn', 'swap-from-balance', 'swap-to-balance',
      'swap-from-net-label', 'swap-to-net-label', 'swap-auto-route-badge', 'swap-recipient-input',
      'swap-recipient-contacts-btn', 'swap-amount-in', 'swap-amount-out', 'swap-usd-in', 'swap-usd-out',
      'swap-quote-rate', 'swap-quote-route', 'swap-quote-fee', 'swap-gas-reserve-row',
      'swap-gas-reserve-label', 'swap-details-summary', 'swap-error-banner', 'btn-execute-swap'
    ].forEach(mkEl);
    domMap.get('swap-error-banner').classList.add('hidden');
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => []
    };

    try {
      const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
      const w = state.normalizeWalletRecord({
        id: 'w_v64_swap_ui',
        mnemonic: TEST_MNEMONIC,
        nearNamedAccount: 'alice.near',
        nearPublicKey: keys.nearPublicKey,
        nearPrivateKey: keys.nearPrivateKey,
        nativeBalances: { near: 0.1, sol: 0.0025 },
        nearNep141Balances: { [orheaTok.contractAddress]: { raw: '0', formatted: 0 } }
      });
      state.wallets = [w];
      state.activeWalletId = w.id;
      state.lang = 'zh';
      state.swap.fromAssetId = orheaTok.assetId;
      state.swap.toAssetId = usdtNearTok.assetId;
      state.swap.amountIn = '1000';
      state.swap.quoteData = null;
      state.swap._lastError = '';
      uiController.renderSwapView();

      assert.equal(domMap.get('swap-usd-in').textContent, '$19.30');
      const btn = domMap.get('btn-execute-swap');
      assert.equal(btn.disabled, true);
      assert.equal(btn.classList.contains('is-error'), true);
      assert.ok(btn.textContent.includes('oRHEA') && btn.textContent.includes('余额不足'));
      assert.equal(domMap.get('swap-recipient-input').disabled, true, 'Same-chain NEAR DEX swap must lock recipient');

      // Quote errors also stay solely on the primary button while #swap-error-banner stays hidden
      domMap.get('swap-amount-in').value = '1000';
      w.nearNep141Balances[orheaTok.contractAddress] = { raw: '5000000000000000000000', formatted: 5000 };
      const resQuoteErr = uiController.evaluateSwapButtonState({
        wallet: w,
        fromToken: orheaTok,
        toToken: usdtNearTok,
        amountIn: '1000',
        quoteError: '暂无报价'
      });
      assert.equal(resQuoteErr.reason, 'quote_error');
      assert.equal(resQuoteErr.disabled, true);
      assert.equal(resQuoteErr.isError, true);

      // Simulate error banner call -> banner stays hidden
      if (typeof uiController.renderSwapView === 'function') {
        state.swap._lastError = '报价超时';
        uiController.renderSwapView();
      }
      assert.equal(domMap.get('swap-error-banner').classList.contains('hidden'), true);

      // Native SOL gas buffer & NEAR hub gas validation inside evaluateSwapButtonState
      const solTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'SOL' && t.blockchain === 'sol');
      const jupTok = (tokenRegistry.DEX_CHAIN_TOKENS.sol || []).find((t) => t.symbol === 'JUP');
      const gasShort = uiController.evaluateSwapButtonState({
        wallet: w,
        fromToken: solTok,
        toToken: jupTok,
        amountIn: '0.002'
      });
      assert.equal(gasShort.reason, 'insufficient_gas');
      assert.equal(gasShort.disabled, true);

      const prlTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PRL' && t.blockchain === 'prl');
      const qtcTok = { symbol: 'QTC', name: 'Quantus Network', blockchain: 'qtc', assetId: 'nep141:qtc.omft.near', decimals: 12 };
      w.nativeBalances.near = 0;
      w.nativeBalances.prl = 500;
      const nearGasShort = uiController.evaluateSwapButtonState({
        wallet: w,
        fromToken: prlTok,
        toToken: qtcTok,
        amountIn: '10'
      });
      assert.equal(nearGasShort.reason, 'insufficient_near_gas');
      assert.equal(nearGasShort.disabled, true);

      // 5. Scheme A recipient lock matrix
      const nearNativeTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'NEAR' && t.blockchain === 'near');
      const solUsdcTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'USDC' && t.blockchain === 'sol');
      const baseEthTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'ETH' && t.blockchain === 'base');
      const arcUsdcTok = (tokenRegistry.DEX_CHAIN_TOKENS.arc || []).find((t) => t.symbol === 'USDC');
      const arcEurcTok = (tokenRegistry.DEX_CHAIN_TOKENS.arc || []).find((t) => t.symbol === 'EURC');

      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(orheaTok, usdtNearTok), true, 'Same-chain DEX requires self');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlTok, nearNativeTok), true, 'PRL -> NEAR ends on Ref DEX -> self');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlTok, jupTok), true, 'PRL -> JUP ends on Jupiter DEX -> self');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(baseEthTok, arcEurcTok), true, 'Base ETH -> Arc EURC ends on Arc DEX -> self');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlTok, qtcTok), false, 'PRL -> QTC ends on 1Click bridge -> editable');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlTok, solUsdcTok), false, 'PRL -> SOL USDC ends on 1Click bridge -> editable');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(nearNativeTok, baseEthTok), false, 'NEAR -> Base ETH -> editable');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(baseEthTok, arcUsdcTok), false, 'Base ETH -> Arc USDC ends on Relay -> editable');

      // SMART_HUB_ROUTE forces self SOL address on BRIDGE_OUT when DEST_DEX (JUP) follows
      const ownSolAddr = w.solAddress;
      const customSolAddr = 'B7n2uQk6gZ9cK4mW1rX8pS3vD5tN9yL2aE4hF6jC8mN1p';
      await withMockedFetch(async (url, opts) => {
        if (url.includes('1click.chaindefuser.com/v0/quote')) {
          const req = JSON.parse(opts.body);
          if (req.originAsset === prlTok.assetId) {
            return jsonResponse({
              quote: { amountOut: '10000000000', amountOutFormatted: '100', amountInUsd: '100', amountOutUsd: '100' }
            });
          }
          if (req.destinationAsset === 'nep141:sol.omft.near' || req.destinationAsset === solUsdcTok.assetId) {
            return jsonResponse({
              quote: { amountOut: '500000000', amountOutFormatted: '0.5', amountInUsd: '100', amountOutUsd: '99.5' }
            });
          }
          return jsonResponse({}, 400);
        }
        if (url.includes('smartrouter.ref.finance')) {
          const u = new URL(url);
          const tIn = u.searchParams.get('tokenIn') || 'prl.omft.near';
          const tOut = u.searchParams.get('tokenOut') || 'wrap.near';
          const amtIn = u.searchParams.get('amountIn') || '10000000000';
          return jsonResponse({
            result_code: 0,
            result_data: {
              amount_out: '5000000000000000000000000',
              routes: [{
                min_amount_out: '4900000000000000000000000',
                pools: [{
                  pool_id: 9010,
                  token_in: tIn,
                  token_out: tOut,
                  amount_in: amtIn,
                  min_amount_out: '4900000000000000000000000'
                }]
              }]
            }
          });
        }
        if (url.includes('api.jup.ag') || url.includes('lite-api.jup.ag')) {
          return jsonResponse({ outAmount: '80000000' });
        }
        return jsonResponse({}, 404);
      }, async () => {
        const smartJup = await nearIntents.quoteSmartHubRoute({
          fromToken: prlTok,
          toToken: jupTok,
          amountRaw: '10000000000',
          slippageBps: 100,
          recipient: customSolAddr,
          refundTo: w.address,
          nearAccountId: w.nearNamedAccount,
          solAddress: ownSolAddr,
          evmAddress: w.mpcEvmAddress
        });
        assert.equal(smartJup.ok, true);
        const bridgeOutStage = smartJup.stages.find((s) => s.type === 'BRIDGE_OUT');
        assert.ok(bridgeOutStage);
        assert.equal(bridgeOutStage.recipient, ownSolAddr, 'Intermediate BRIDGE_OUT before DEST_DEX must use self wallet solAddress');

        const smartUsdc = await nearIntents.quoteCrossChainWithDexRelay({
          fromToken: prlTok,
          toToken: solUsdcTok,
          amountRaw: '10000000000',
          slippageBps: 100,
          recipient: customSolAddr,
          refundTo: w.address,
          nearAccountId: w.nearNamedAccount,
          solAddress: ownSolAddr,
          evmAddress: w.mpcEvmAddress
        });
        assert.equal(smartUsdc.ok, true);
        if (Array.isArray(smartUsdc.stages)) {
          const outUsdc = smartUsdc.stages.find((s) => s.type === 'BRIDGE_OUT');
          if (outUsdc) assert.equal(outUsdc.recipient, customSolAddr);
        }
      });

      // 6. PRL -> NEAR Ref route label explicitly shows 1Click (Pearl->NEAR)
      await withMockedFetch(async (url) => {
        if (url.includes('1click.chaindefuser.com/v0/quote')) {
          return jsonResponse({
            quote: { amountOut: '1000000000', amountOutFormatted: '10', amountInUsd: '20', amountOutUsd: '19.9' }
          });
        }
        if (url.includes('smartrouter.ref.finance')) {
          return jsonResponse({
            result_code: 0,
            result_data: {
              amount_out: '5000000000000000000000000',
              routes: [{
                min_amount_out: '4900000000000000000000000',
                pools: [{
                  pool_id: 9010,
                  token_in: 'prl.omft.near',
                  token_out: 'wrap.near',
                  amount_in: '1000000000',
                  min_amount_out: '4900000000000000000000000'
                }]
              }]
            }
          });
        }
        return jsonResponse({}, 404);
      }, async () => {
        const prlNearQuote = await nearIntents.quoteCrossChainWithDexRelay({
          fromToken: prlTok,
          toToken: nearNativeTok,
          amountRaw: '1000000000',
          slippageBps: 100,
          recipient: w.nearNamedAccount,
          refundTo: w.address,
          nearAccountId: w.nearNamedAccount,
          solAddress: ownSolAddr,
          evmAddress: w.mpcEvmAddress
        });
        assert.equal(prlNearQuote.ok, true);
        assert.ok(
          String(prlNearQuote.routeLabel || '').includes('1Click (Pearl➔NEAR'),
          `Expected 1Click (Pearl➔NEAR...) in routeLabel, got ${prlNearQuote.routeLabel}`
        );
      });

      // 8. Solana ATA detection distinguishes existing 0-bal ATA from uninitialized ATA
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
      await withMockedFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        if (body.method === 'getBalance') {
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { value: 2000000 } });
        }
        if (body.method === 'getTokenAccountsByOwner') {
          const progId = body.params?.[1]?.programId;
          if (progId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            return jsonResponse({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                value: [
                  { account: { data: { parsed: { info: { mint: USDC_MINT, tokenAmount: { amount: '0', decimals: 6 } } } } } }
                ]
              }
            });
          }
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { value: [] } });
        }
        return jsonResponse({}, 404);
      }, async () => {
        const solBal = await chainContracts.fetchSolanaNativeAndSplBalances(w.solAddress, [USDC_MINT, JUP_MINT]);
        assert.equal(solBal.tokens[USDC_MINT].hasAta, true);
        assert.equal(solBal.tokens[JUP_MINT].hasAta, false);
        assert.equal(solBal.ataMints[USDC_MINT], true);
        assert.equal(Boolean(solBal.ataMints[JUP_MINT]), false);

        w.nativeBalances.sol = 0;
        w.splBalances = { [USDC_MINT]: 0, [JUP_MINT]: 0 };
        w.solAtaMints = solBal.ataMints;
        const jupReserve = uiController.getTargetChainGasReserveInfo(w, prlTok, jupTok, 'auto', {
          compositeType: 'SMART_HUB_ROUTE',
          stages: [{ type: 'DEST_DEX', chain: 'sol' }]
        });
        assert.equal(jupReserve.isNewSolAta, true);
        assert.equal(jupReserve.recommendedReserve, 0.0035);

        const usdcReserve = uiController.getTargetChainGasReserveInfo(w, prlTok, solUsdcTok, 'auto', {
          compositeType: 'SMART_HUB_ROUTE',
          stages: [{ type: 'DEST_DEX', chain: 'sol' }]
        });
        assert.equal(usdcReserve.isNewSolAta, false);
      });
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
      state.lang = prevLang;
      Object.assign(state.swap, prevSwap);
      if (orheaTok) orheaTok.price = prevOrheaPrice;
    }
  });

  // 9. Static cache & lazy module versions updated to v6.6
  const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'ui-controller.js'), 'utf8');
  assert.ok(swSrc.includes("nexus-wallet-v6.6"));
  assert.equal(swSrc.includes('?v=6.5'), false);
  assert.ok(htmlSrc.includes('src/ui-controller.js?v=6.6'));
  assert.equal(htmlSrc.includes('?v=6.5'), false);
  assert.ok(uiSrc.includes('ethers.umd.min.js?v=6.6'));
  assert.equal(uiSrc.includes('?v=6.5'), false);

  // 10. NEAR Pair Comparator Grace Window waits for slower 1Click Solver instead of letting shallow fast Rhea CLMM abort it
  const nearWrapTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'NEAR' && t.blockchain === 'near');
  const qtcNearCoreTok = (tokenRegistry.DEX_CHAIN_TOKENS.near || []).find((t) => t.symbol === 'QTC');
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (opts?.signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return jsonResponse({
        quote: {
          amountOut: '2357397651877',
          amountOutFormatted: '2.357397651877',
          amountInUsd: '91.50',
          amountOutUsd: '90.54'
        }
      });
    }
    if (opts?.body) {
      const rpcBody = JSON.parse(opts.body);
      if (rpcBody?.params?.account_id === 'dclv2.ref-labs.near' && rpcBody?.params?.method_name === 'quote') {
        const payloadBytes = Array.from(Buffer.from(JSON.stringify({ amount: '2113772000000' })));
        return jsonResponse({ jsonrpc: '2.0', id: rpcBody.id, result: { result: payloadBytes } });
      }
    }
    return jsonResponse({}, 404);
  }, async () => {
    const cmpRes = await nearIntents.quoteBestNearPairSwap({
      fromToken: nearWrapTok,
      toToken: qtcNearCoreTok,
      amountRaw: '30000000000000000000000000',
      slippageBps: 100,
      recipient: 'alice.near',
      nearAccountId: 'alice.near'
    });
    assert.equal(cmpRes.ok, true);
    assert.equal(cmpRes.bestSource, '1Click Solver');
    assert.equal(cmpRes.amountOut, '2357397651877');
    assert.ok(cmpRes.comparedPools >= 2, `Expected >= 2 compared pools, got ${cmpRes.comparedPools}`);
  });

  // 11. Stale v6.3 localStorage SVG logoURI cleanup (PONS / QTC) & High Price Impact Warning
  const ponsCore = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PONS' && t.blockchain === 'hood');
  const stalePonsSvg = tokenRegistry.resolveTokenIcon({ symbol: 'PONS', blockchain: 'hood' }).fallbackUrl;
  assert.ok(stalePonsSvg.startsWith('data:image/svg+xml;base64,'));
  await withMockedStorage({}, async () => {
    state.saveCachedLiveTokens([
      {
        assetId: ponsCore.assetId,
        symbol: 'PONS',
        name: 'Pons',
        blockchain: 'hood',
        contractAddress: ponsCore.contractAddress,
        decimals: 18,
        price: 0.103,
        logoURI: stalePonsSvg
      }
    ]);
    const loaded = state.loadCachedLiveTokens();
    const loadedPons = loaded.find((t) => t.symbol === 'PONS');
    assert.equal(loadedPons.logoURI, '', 'Stale generated SVG logoURI must be stripped from cached liveTokens');
    assert.equal(Boolean(ponsCore.logoURI && ponsCore.logoURI.startsWith('data:image/svg+xml')), false);
    const resolvedPons = tokenRegistry.resolveTokenIcon({
      symbol: 'PONS',
      blockchain: 'hood',
      logoURI: stalePonsSvg
    });
    assert.ok(resolvedPons.primaryUrl.startsWith('https://'), 'resolveTokenIcon must prioritize official remote URL over stale generated SVG');
    assert.equal(resolvedPons.fallbackUrl, stalePonsSvg);
  });

  const lowImpact = uiController.computeSwapPriceImpact(91.50, 90.54);
  assert.equal(lowImpact.level, 'none');
  const highImpact = uiController.computeSwapPriceImpact(91.50, 81.08);
  assert.equal(highImpact.level, 'high');
  assert.equal(highImpact.pct, 11.39);
  const critImpact = uiController.computeSwapPriceImpact(100, 78);
  assert.equal(critImpact.level, 'critical');
  assert.equal(critImpact.pct, 22);
  const nullImpact = uiController.computeSwapPriceImpact(0, 10);
  assert.equal(nullImpact.level, 'none');

  const keysImpact = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const fundedNearWallet = state.normalizeWalletRecord({
    id: 'w_v66_impact',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keysImpact.nearPublicKey,
    nearPrivateKey: keysImpact.nearPrivateKey,
    nativeBalances: { near: 100 }
  });
  const btnCrit = uiController.evaluateSwapButtonState({
    wallet: fundedNearWallet,
    fromToken: nearWrapTok,
    toToken: qtcNearCoreTok,
    amountIn: '30',
    priceImpact: critImpact
  });
  assert.equal(btnCrit.reason, 'ready_high_impact');
  assert.equal(btnCrit.disabled, false);
  assert.equal(btnCrit.isWarning, true);
  assert.ok(btnCrit.text.includes('-22.0%'));
});
