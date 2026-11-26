'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  loadDistAssets,
  createWalletAppSession,
  assertZeroDevJargon
} = require('./e2e-harness.js');

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_MNEMONIC_2 =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

function createSeededWallet(overrides = {}) {
  return {
    id: 'e2e_wallet_1',
    name: 'E2E Main',
    nearAddress: '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000',
    nearPublicKey: 'ed25519:5J8Wx5fKx8F2o1V9Q3nP7sL6mK9rT2uV4wX6yZ8aB1cD',
    evmAddress: '0x1111111111111111111111111111111111111111',
    mpcEvmAddress: '0x1111111111111111111111111111111111111111',
    solAddress: '11111111111111111111111111111111',
    address: 'prl1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq000000',
    btcAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    nativeBalances: {
      near: 12.5,
      sol: 2.0,
      eth: 0.5,
      base: 0.25,
      arb: 0.5,
      bsc: 0.2,
      op: 0.1,
      pol: 10,
      avax: 1,
      hype: 1,
      hood: 0,
      arc: 5,
      prl: 100,
      btc: 0.01
    },
    ...overrides
  };
}

function mockJsonResponse(payload, status = 200) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Status ${status}`,
    headers: new Headers({ 'content-type': 'application/json' }),
    async json() { return JSON.parse(raw); },
    async text() { return raw; }
  };
}

function mockHtmlResponse(htmlBody, status = 403) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    headers: new Headers({ 'content-type': 'text/html' }),
    async json() { throw new SyntaxError('Unexpected token < in JSON'); },
    async text() { return String(htmlBody || ''); }
  };
}

function makeBioCapacitorMock(tracker = null) {
  return {
    Plugins: {
      NativeSecurity: {
        async getSecurityCapabilities() {
          return { platform: 'ios', supportsBiometrics: true, hasPasscode: true };
        },
        async authenticateWithBiometrics(opts) {
          if (tracker) tracker.calls.push(opts || {});
          return { verified: true, method: 'biometric' };
        }
      }
    }
  };
}

function encodeUint256Hex(bigVal) {
  return '0x' + BigInt(bigVal).toString(16).padStart(64, '0');
}

function buildLivePricesSeed() {
  return {
    updatedAt: Date.now(),
    tokens: [
      { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 5.0 },
      { assetId: 'nep141:prl.omft.near', symbol: 'PRL', blockchain: 'near', decimals: 8, price: 0.01 },
      { assetId: 'nep141:qtc.omft.near', symbol: 'QTC', blockchain: 'near', decimals: 12, price: 0.5 },
      { assetId: 'nep141:sol.omft.near', symbol: 'SOL', blockchain: 'sol', decimals: 9, price: 150.0 },
      { assetId: 'nep141:eth.omft.near', symbol: 'ETH', blockchain: 'eth', decimals: 18, price: 3000.0 },
      { assetId: 'nep141:bnb.omdep.near', symbol: 'BNB', blockchain: 'bsc', decimals: 18, price: 600.0 },
      { assetId: 'nep141:btc.omft.near', symbol: 'BTC', blockchain: 'btc', decimals: 8, price: 90000.0 },
      { assetId: 'arc:native:usdc', symbol: 'USDC', blockchain: 'arc', decimals: 18, price: 1.0 },
      { assetId: 'pol:native:pol', symbol: 'POL', blockchain: 'pol', decimals: 18, price: 0.5 },
      { assetId: 'avax:native:avax', symbol: 'AVAX', blockchain: 'avax', decimals: 18, price: 30.0 },
      { assetId: 'hype:native:hype', symbol: 'HYPE', blockchain: 'hype', decimals: 18, price: 20.0 },
      { assetId: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', blockchain: 'eth', decimals: 18, price: 1.0 },
      { assetId: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB', blockchain: 'arb', decimals: 18, price: 1.0 },
      { assetId: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', blockchain: 'eth', decimals: 18, price: 10.0 },
      { assetId: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', symbol: 'PEPE', blockchain: 'eth', decimals: 18, price: 0.00001 }
    ]
  };
}

function create14ChainHealthyFetchMock(overrides = {}) {
  const balances = {
    near: '10000000000000000000000000', // 10 NEAR
    prl: '10000000000', // 100 PRL (8 dec)
    sol: 2000000000, // 2 SOL (9 dec)
    eth: '500000000000000000', // 0.5 ETH
    base: '250000000000000000', // 0.25 ETH
    baseUsdc: '25000000', // 25 USDC (6 dec)
    arc: '5000000000000000000', // 5 USDC (18 dec)
    btc: 1000000, // 0.01 BTC
    ...overrides
  };

  return async (url, init = {}) => {
    const u = String(url || '');
    const bodyText = typeof init.body === 'string' ? init.body : '';

    // 1Click tokens
    if (/1click\.chaindefuser\.com\/v0\/tokens/i.test(u)) {
      return mockJsonResponse([
        { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 5.0 },
        { assetId: 'nep141:sol.omft.near', symbol: 'SOL', blockchain: 'sol', decimals: 9, price: 150.0 },
        { assetId: 'nep141:eth.omft.near', symbol: 'ETH', blockchain: 'eth', decimals: 18, price: 3000.0 },
        { assetId: 'nep141:btc.omft.near', symbol: 'BTC', blockchain: 'btc', decimals: 8, price: 90000.0 },
        { assetId: 'nep141:bnb.omdep.near', symbol: 'BNB', blockchain: 'bsc', decimals: 18, price: 600.0 },
        { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', blockchain: 'base', decimals: 6, price: 1.0 }
      ]);
    }
    if (/api\.prlscan\.com\/v1\/market\/prl/i.test(u)) {
      return mockJsonResponse({ price_usd: 0.01, priceUsd: 0.01 });
    }
    if (/api\.hyperliquid\.xyz\/info/i.test(u)) {
      return mockJsonResponse({ HYPE: '20.0', BTC: '90000.0', ETH: '3000.0', SOL: '150.0' });
    }
    if (/api\.coingecko\.com/i.test(u)) {
      return mockJsonResponse([
        { symbol: 'near', current_price: 5.0 },
        { symbol: 'btc', current_price: 90000.0 },
        { symbol: 'eth', current_price: 3000.0 },
        { symbol: 'sol', current_price: 150.0 },
        { symbol: 'usdc', current_price: 1.0 }
      ]);
    }
    if (/indexer\.ref\.finance|api\.ref\.finance|dexscreener\.com|jup\.ag|kyberswap\.com|li\.quest/i.test(u)) {
      return mockJsonResponse({});
    }

    // NEAR discovery & balances
    if (/api\.fastnear\.com\/v1\/public_key\/|api\.kitwallet\.app\/publicKey\//i.test(u)) {
      return mockJsonResponse({ account_ids: [] });
    }
    if (/api\.fastnear\.com\/v1\/account\/.*\/ft/i.test(u)) {
      return mockJsonResponse({ tokens: [] });
    }
    if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org|1rpc\.io\/near/i.test(u)) {
      const req = bodyText ? JSON.parse(bodyText) : {};
      if (req?.params?.request_type === 'view_account') {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { amount: balances.near, storage_usage: 182 } });
      }
      if (req?.params?.request_type === 'view_access_key') {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { nonce: 1, block_hash: '11111111111111111111111111111111' } });
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { result: [] } });
    }

    // Solana
    if (/solana-rpc\.publicnode\.com|mainnet-beta\.solana\.com/i.test(u)) {
      const req = bodyText ? JSON.parse(bodyText) : {};
      if (req.method === 'getBalance') {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { value: balances.sol } });
      }
      if (req.method === 'getTokenAccountsByOwner') {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { value: [] } });
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: {} });
    }

    // Pearl Blockbook
    if (/blockbook\.pearlresearch\.ai|\/pearl-proxy/i.test(u)) {
      if (typeof overrides.prlHandler === 'function') return overrides.prlHandler(u, init);
      return mockJsonResponse({ balance: String(balances.prl), unconfirmedBalance: '0' });
    }

    // Bitcoin Mempool / Blockstream
    if (/mempool\.space|blockstream\.info/i.test(u)) {
      if (typeof overrides.btcHandler === 'function') return overrides.btcHandler(u, init);
      if (/\/fees\/recommended|\/fee-estimates/i.test(u)) {
        return mockJsonResponse({ fastestFee: 5, halfHourFee: 3, hourFee: 2, 2: 3 });
      }
      return mockJsonResponse({
        chain_stats: { funded_txo_sum: balances.btc, spent_txo_sum: 0 },
        mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 }
      });
    }

    // EVM RPCs (single eth_getBalance, Multicall3 deterministic revert fallback -> JSON-RPC Batch)
    if (/rpc|drpc\.org|mainnet\.base\.org|arb1\.arbitrum\.io|optimism\.io|avax\.network|bnbchain\.org|defibit\.io|ninicoin\.io|flashbots\.net|hyperliquid\.xyz\/evm|robinhood\.com|arc\.io/i.test(u)) {
      const parsed = bodyText ? JSON.parse(bodyText) : {};
      const nativeHexForUrl = () => {
        if (/arc\.io/i.test(u)) return encodeUint256Hex(balances.arc);
        if (/base/i.test(u)) return encodeUint256Hex(balances.base);
        if (/eth\.drpc|ethereum-rpc|flashbots/i.test(u)) return encodeUint256Hex(balances.eth);
        return encodeUint256Hex(100000000000000000n);
      };
      if (Array.isArray(parsed)) {
        const resArr = parsed.map((call) => {
          if (call.method === 'eth_getBalance') {
            return { jsonrpc: '2.0', id: call.id, result: nativeHexForUrl() };
          }
          if (call.method === 'eth_call') {
            const toAddr = String(call.params?.[0]?.to || '').toLowerCase();
            if (/base/i.test(u) && toAddr === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
              return { jsonrpc: '2.0', id: call.id, result: encodeUint256Hex(balances.baseUsdc) };
            }
            if (/eth\.drpc|ethereum-rpc|flashbots/i.test(u) && toAddr === '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' && balances.ethUsdc !== undefined) {
              return { jsonrpc: '2.0', id: call.id, result: encodeUint256Hex(balances.ethUsdc) };
            }
            return { jsonrpc: '2.0', id: call.id, result: encodeUint256Hex(0) };
          }
          return { jsonrpc: '2.0', id: call.id, result: '0x0' };
        });
        return mockJsonResponse(resArr);
      }
      if (parsed.method === 'eth_getBalance') {
        return mockJsonResponse({ jsonrpc: '2.0', id: parsed.id, result: nativeHexForUrl() });
      }
      if (parsed.method === 'eth_call') {
        // Return deterministic JSON-RPC error (-32000 execution reverted) so Multicall3 falls back to Batch without cooling down RPCs
        return mockJsonResponse({ jsonrpc: '2.0', id: parsed.id, error: { code: -32000, message: 'execution reverted' } });
      }
      if (parsed.method === 'eth_gasPrice') {
        return mockJsonResponse({ jsonrpc: '2.0', id: parsed.id, result: '0x3b9aca00' });
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: parsed.id, result: '0x0' });
    }

    return mockJsonResponse({}, 200);
  };
}

async function waitNetworkQuiet(session) {
  let prev = -1;
  for (let i = 0; i < 20; i += 1) {
    const cur = session.getNetworkLog().length;
    await session.flushMicrotasks(12);
    const next = session.getNetworkLog().length;
    if (cur === prev && next === cur) break;
    prev = next;
  }
}

function getNonPerpNetworkLog(session, startIdx = 0) {
  return session.getNetworkLog()
    .slice(startIdx)
    .filter((r) => !/api\.hyperliquid\.xyz\/info/i.test(String(r && r.url || '')));
}

// =====================================================================
// FEATURE 1: Onboarding & Multi-Chain Wallet (6 Tier 1 + 5 Tier 2 = 11)
// =====================================================================

test('F1-T1-01: Cold-boot create wallet flow derives all chains, encrypts vault, copies mnemonic & shows loading confirm', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    fetchMock: async () => mockJsonResponse({ account_ids: [] }, 200)
  });
  try {
    assert.equal(session.isVisible('#view-onboarding'), true);
    assert.equal(session.isVisible('#bottom-nav'), false);

    await session.click('#onboard-choice-panel button[onclick*="openCreateWalletFlow"]');
    assert.equal(session.isVisible('#onboard-create-panel'), true);
    const seedWords = session.document.querySelectorAll('#onboard-seed-grid .seed-word');
    assert.equal(seedWords.length, 12, `Expected 12 seed words, got ${seedWords.length}`);

    await session.click('#onboard-create-panel button[onclick*="copyPendingMnemonic"]');
    const copiedPhrase = session.clipboardLog.at(-1);
    assert.equal(String(copiedPhrase || '').trim().split(/\s+/).length, 12);

    await session.setInputValue('#onboard-create-name', 'My Alpha');

    const confirmBtn = session.document.getElementById('btn-confirm-create-wallet');
    assert.ok(confirmBtn, '#btn-confirm-create-wallet must exist');
    confirmBtn.click();

    // Verify immediate disabled + loading state during async derivation & vault encryption
    assert.equal(confirmBtn.disabled, true, '#btn-confirm-create-wallet must disable while creating');
    assert.match(confirmBtn.textContent, /正在创建|Creating/);

    await session.waitFor(() => session.isVisible('#view-wallet') && !confirmBtn.disabled, 5000);
    assert.equal(session.isVisible('#bottom-nav'), true);
    assert.ok(
      session.getToastHistory().some((t) => /钱包已创建|Wallet created/.test(t.text)),
      'Toast should confirm wallet creation'
    );

    const rawStored = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1'));
    assert.equal(rawStored.wallets.length, 1);
    const w = rawStored.wallets[0];
    assert.equal(w.name, 'My Alpha');
    assert.match(w.nearAddress, /^[0-9a-f]{64}$/);
    assert.match(w.nearPublicKey, /^ed25519:/);
    assert.match(w.mpcEvmAddress, /^0x[0-9a-fA-F]{40}$/);
    assert.ok(w.solAddress && w.solAddress.length >= 32);
    assert.match(w.address, /^prl1p[0-9a-z]+$/);
    assert.match(w.btcAddress, /^bc1p[0-9a-z]+$/);
    assert.ok(w.mnemonic && w.mnemonic.split(/\s+/).length === 12, 'Mnemonic must be persisted directly');
    assert.equal(w.encryptedVault, undefined, 'encryptedVault must NOT be persisted');
    assert.equal(w.pin, undefined, 'pin must NOT be persisted');

    assertZeroDevJargon(session.getVisibleText('#view-onboarding'), 'view-onboarding zh');
    for (const toast of session.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'F1-T1-01 toast');
    }
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T1-02: Import valid 12-word mnemonic validates live, shows loading state & opens portfolio', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    fetchMock: async () => mockJsonResponse({ account_ids: [] }, 200)
  });
  try {
    await session.click('#onboard-choice-panel button[onclick*="openImportWalletFlow"]');
    assert.equal(session.isVisible('#onboard-import-panel'), true);

    await session.setInputValue('#onboard-import-phrase', TEST_MNEMONIC);
    const statusText = session.getVisibleText('#onboard-import-status');
    assert.match(statusText, /✓.*12/);

    await session.setInputValue('#onboard-import-name', 'Imported Main');
    const importBtn = session.document.getElementById('btn-confirm-import-wallet');
    assert.ok(importBtn, '#btn-confirm-import-wallet must exist');
    importBtn.click();

    assert.equal(importBtn.disabled, true, '#btn-confirm-import-wallet must disable while importing');
    assert.match(importBtn.textContent, /正在导入|Importing/);

    await session.waitFor(() => session.isVisible('#view-wallet') && !importBtn.disabled, 5000);
    assert.ok(
      session.getToastHistory().some((t) => /全链钱包导入成功|Multi-chain wallet imported/.test(t.text)),
      'Toast should confirm multi-chain wallet import'
    );
    assert.notEqual(session.getVisibleText('#header-account-label'), '--');
    assert.notEqual(session.getVisibleText('#hero-near-id'), '--');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T1-03: Importing mnemonic with existing .near named account binds account & hides register button', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    fetchMock: async (url) => {
      if (/api\.fastnear\.com\/v1\/public_key\/.*\/all/i.test(url)) {
        return mockJsonResponse({ account_ids: ['alice.near'] });
      }
      return mockJsonResponse({});
    }
  });
  try {
    await session.click('#onboard-choice-panel button[onclick*="openImportWalletFlow"]');
    await session.setInputValue('#onboard-import-phrase', TEST_MNEMONIC);
    await session.click('#btn-confirm-import-wallet');

    await session.waitFor(() => session.getVisibleText('#hero-near-id') === 'alice.near', 3000);
    assert.equal(session.hasClass('#btn-hero-register-near', 'hidden'), true);

    const stored = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1'));
    assert.equal(stored.wallets[0].nearNamedAccount, 'alice.near');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T1-04: Legacy cached wallet missing derived keys self-heals on boot & renders multi-chain addresses', async () => {
  const legacyWallet = {
    id: 'legacy_1',
    name: 'Legacy',
    mnemonic: TEST_MNEMONIC
  };
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [legacyWallet], activeWalletId: 'legacy_1' })
    }
  });
  try {
    assert.equal(session.isVisible('#view-wallet'), true);

    const stored = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1'));
    const healed = stored.wallets[0];
    assert.match(healed.nearAddress, /^[0-9a-f]{64}$/);
    assert.match(healed.nearPublicKey, /^ed25519:/);
    assert.match(healed.nearPrivateKey, /^ed25519:/);
    assert.match(healed.nearPrivateSeedHex, /^[0-9a-f]{64}$/);
    assert.match(healed.mpcEvmAddress, /^0x[0-9a-fA-F]{40}$/);
    assert.match(healed.evmAddress, /^0x[0-9a-fA-F]{40}$/);
    assert.ok(healed.solAddress && healed.solAddress.length >= 32);
    assert.match(healed.address, /^prl1p[0-9a-z]+$/);
    assert.match(healed.btcAddress, /^bc1p[0-9a-z]+$/);

    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openWalletAddressesSheet"]');
    assert.equal(session.hasClass('#sheet-wallet-addresses', 'open'), true);
    const addrText = session.getVisibleText('#hub-addresses-list');
    assert.ok(addrText.includes(healed.mpcEvmAddress.slice(0, 8)), 'Shortened EVM address must appear in #hub-addresses-list');
    assert.ok(addrText.includes(healed.solAddress.slice(0, 8)), 'Shortened SOL address must appear in #hub-addresses-list');
    assert.ok(addrText.includes(healed.btcAddress.slice(0, 8)), 'Shortened BTC address must appear in #hub-addresses-list');
    assert.ok(addrText.includes(healed.address.slice(0, 8)), 'Shortened PRL address must appear in #hub-addresses-list');

    const copyVals = Array.from(session.document.querySelectorAll('#hub-addresses-list [data-action="copy-text"]'))
      .map((btn) => btn.getAttribute('data-val'));
    assert.ok(copyVals.includes(healed.mpcEvmAddress), 'Full EVM address must be bound to copy button');
    assert.ok(copyVals.includes(healed.solAddress), 'Full SOL address must be bound to copy button');
    assert.ok(copyVals.includes(healed.btcAddress), 'Full BTC address must be bound to copy button');
    assert.ok(copyVals.includes(healed.address), 'Full PRL address must be bound to copy button');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T1-05: Multi-wallet switcher updates active wallet, resets transient state & cancelOnboardSubPanel returns cleanly', async () => {
  const w1 = createSeededWallet({ id: 'w1', name: 'Alpha', mnemonic: TEST_MNEMONIC });
  const w2 = createSeededWallet({
    id: 'w2',
    name: 'Beta',
    mnemonic: TEST_MNEMONIC_2,
    nearAddress: '22223333444455556666777788889999aaaabbbbccccddddeeeeffff11112222',
    nearNamedAccount: 'beta.near'
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [w1, w2], activeWalletId: 'w1' })
    }
  });
  try {
    // Populate transient swap/send state before switching wallets
    await session.switchTab('swap');
    await session.setInputValue('#swap-amount-in', '42');
    await session.switchTab('wallet');

    await session.click('#header-account-pill');
    assert.equal(session.hasClass('#sheet-wallets', 'open'), true);
    const listText = session.getVisibleText('#wallets-switcher-list');
    assert.ok(listText.includes('Alpha') && listText.includes('Beta'));

    await session.click('[data-action="switch-wallet"][data-wallet-id="w2"]');
    assert.equal(session.hasClass('#sheet-wallets', 'open'), false);
    assert.equal(session.getVisibleText('#hero-near-id'), 'beta.near');
    assert.equal(session.document.getElementById('swap-amount-in').value, '', 'Switching wallet must clear swap amount');
    assert.ok(
      session.getToastHistory().some((t) => /已切换账户: Beta|Switched to: Beta/.test(t.text)),
      'Toast should confirm switched wallet'
    );

    const stored = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1'));
    assert.equal(stored.activeWalletId, 'w2');

    // Reopen switcher -> startAdditionalWalletCreate -> cancelOnboardSubPanel (step 1: back to choice, step 2: back to wallet)
    await session.click('#header-account-pill');
    await session.click('#sheet-wallets button[onclick*="startAdditionalWalletCreate"]');
    assert.equal(session.isVisible('#view-onboarding'), true);
    assert.equal(session.isVisible('#bottom-nav'), false);

    await session.click('#onboard-create-panel button[onclick*="cancelOnboardSubPanel"]');
    assert.equal(session.isVisible('#onboard-choice-panel'), true);
    session.window.cancelOnboardSubPanel();
    await session.flushMicrotasks(6);
    assert.equal(session.isVisible('#view-wallet'), true);
    assert.equal(session.isVisible('#bottom-nav'), true);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T1-06: Backup keys modal masks secrets initially, toggles reveal & copies real mnemonic', async () => {
  const wallet = createSeededWallet({ mnemonic: TEST_MNEMONIC });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 2000);
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openBackupKeysSheet"]');
    await session.waitFor(() => session.hasClass('#sheet-backup', 'open'), 2000);

    const firstSecretEl = session.document.querySelector('#backup-keys-content .backup-secret-val');
    assert.ok(firstSecretEl, 'Expected .backup-secret-val element');
    assert.match(firstSecretEl.textContent, /••••/);
    assert.match(session.getVisibleText('#btn-backup-reveal-toggle'), /显示助记词与私钥|Reveal Phrase & Keys/);

    await session.click('#btn-backup-reveal-toggle');
    assert.equal(firstSecretEl.textContent.trim(), TEST_MNEMONIC);
    assert.match(session.getVisibleText('#btn-backup-reveal-toggle'), /隐藏助记词与私钥|Hide Phrase & Keys/);

    const copyBtn = session.document.querySelector('#backup-keys-content [data-action="copy-text"][data-secret-copy="1"]');
    assert.ok(copyBtn, 'Expected secret copy button');
    copyBtn.click();
    await session.flushMicrotasks(8);

    assert.equal(session.clipboardLog.at(-1), TEST_MNEMONIC);
    assert.ok(session.getToastHistory().some((t) => /已复制|Copied/.test(t.text)));

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T2-01: Invalid mnemonics (empty, 11, 13, unknown word, bad checksum) are rejected without creating wallet', async () => {
  const session = await createWalletAppSession({ viewportWidth: 375 });
  try {
    await session.click('#onboard-choice-panel button[onclick*="openImportWalletFlow"]');
    const badPhrases = [
      '',
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon',
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about extra',
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon zzzzinvalid',
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon'
    ];
    for (const phrase of badPhrases) {
      await session.setInputValue('#onboard-import-phrase', phrase);
      const status = session.getVisibleText('#onboard-import-status');
      assert.ok(!status.includes('✓'), `Bad phrase "${phrase}" must not pass live check`);
      if (status) assertZeroDevJargon(status, 'import status');

      const toastBefore = session.getToastHistory().length;
      await session.click('#btn-confirm-import-wallet');
      assert.ok(session.getToastHistory().length > toastBefore, 'Invalid import submit must show toast');
      assertZeroDevJargon(session.getToastHistory().at(-1).text, 'invalid import toast');
      assert.equal(session.isVisible('#view-onboarding'), true);
      assert.equal(session.localStorage.getItem('near_ca_wallets_v1'), null);
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T2-02: Dirty whitespace/mixed-case mnemonic normalizes & deduplicates against existing wallet', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    fetchMock: async () => mockJsonResponse({ account_ids: [] })
  });
  try {
    // Import clean first
    await session.click('#onboard-choice-panel button[onclick*="openImportWalletFlow"]');
    await session.setInputValue('#onboard-import-phrase', TEST_MNEMONIC);
    await session.setInputValue('#onboard-import-name', 'Original');
    await session.click('#btn-confirm-import-wallet');
    await session.waitFor(() => session.isVisible('#view-wallet'), 3000);

    const cleanNearAddr = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1')).wallets[0].nearAddress;

    // Import same phrase with mixed case & newlines/tabs via additional wallet import
    await session.click('#header-account-pill');
    await session.click('#sheet-wallets button[onclick*="startAdditionalWalletImport"]');
    const dirtyMnemonic = '  ABANDON\tAbandon\n  abandon abandon ABANDON abandon   abandon abandon abandon abandon abandon ABOUT  ';
    await session.setInputValue('#onboard-import-phrase', dirtyMnemonic);
    assert.match(session.getVisibleText('#onboard-import-status'), /✓.*12/);

    await session.setInputValue('#onboard-import-name', 'Renamed');
    await session.click('#btn-confirm-import-wallet');
    await session.waitFor(() => session.isVisible('#view-wallet'), 3000);

    const stored = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1'));
    assert.equal(stored.wallets.length, 1, 'Duplicate mnemonic must NOT create second wallet');
    assert.equal(stored.wallets[0].name, 'Renamed');
    assert.equal(stored.wallets[0].nearAddress, cleanNearAddr);
    assert.ok(
      session.getToastHistory().some((t) => /已切换至该助记词对应钱包|Switched to existing wallet/.test(t.text)),
      'Toast must indicate switch to existing wallet'
    );

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T2-03: Onboarding has no #onboard-create-pin and creates wallet directly', async () => {
  const session = await createWalletAppSession({ viewportWidth: 375 });
  try {
    await session.click('#onboard-choice-panel button[onclick*="openCreateWalletFlow"]');
    assert.equal(session.document.getElementById('onboard-create-pin'), null, '#onboard-create-pin must be removed');
    await session.click('#btn-confirm-create-wallet');
    await session.waitFor(() => session.isVisible('#view-wallet'), 5000);
    assert.equal(session.isVisible('#view-wallet'), true);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F1-T2-04: Legacy PIN fields stripped on boot; unrevealed backup copy blocks without window.event', async () => {
  const unlockedSession = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({
        wallets: [{ ...createSeededWallet({ mnemonic: TEST_MNEMONIC }), pin: '123456', pinHash: 'deadbeef' }],
        activeWalletId: 'e2e_wallet_1'
      })
    }
  });
  try {
    const activeW = unlockedSession.window.NearCAState.getActiveWallet();
    assert.equal(activeW.pin, undefined);
    assert.equal(activeW.pinHash, undefined);
    await unlockedSession.waitFor(() => !unlockedSession.document.documentElement.classList.contains('nexus-locked'), 2000);
    delete unlockedSession.window.event;
    await unlockedSession.switchTab('hub');
    await unlockedSession.click('#view-hub button[onclick*="openBackupKeysSheet"]');
    await unlockedSession.waitFor(() => unlockedSession.hasClass('#sheet-backup', 'open'), 2000);

    const secretCopyBtn = unlockedSession.document.querySelector('#backup-keys-content [data-action="copy-text"][data-secret-copy="1"]');
    assert.ok(secretCopyBtn, 'Expected data-secret-copy="1" button');
    secretCopyBtn.click();
    await unlockedSession.flushMicrotasks(8);

    assert.equal(unlockedSession.clipboardLog.length, 0, 'Must NOT copy unrevealed secret');
    assert.ok(
      unlockedSession.getToastHistory().some((t) => /显示助记词与私钥|Reveal phrase & keys first/.test(t.text)),
      'Toast must instruct user to reveal before copying'
    );

    unlockedSession.assertNoRuntimeErrors();
    unlockedSession.assertNoRealBroadcasts();
  } finally {
    unlockedSession.cleanup();
  }
});

test('F1-T2-05: [POST-FIX] Single-wallet deletion blocked & onboarding view has zero dev jargon in zh/en', async () => {
  const w1 = createSeededWallet({ id: 'w1', name: 'Solo' });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [w1], activeWalletId: 'w1' })
    }
  });
  try {
    await session.click('#header-account-pill');
    assert.equal(session.document.querySelectorAll('[data-action="delete-wallet"]').length, 0, 'Delete button hidden when only 1 wallet');

    await session.window.deleteWalletById('w1');
    assert.ok(
      session.getToastHistory().some((t) => /至少保留一个钱包|Keep at least one wallet/.test(t.text)),
      'Must block deleting the last remaining wallet'
    );
    assert.equal(JSON.parse(session.localStorage.getItem('near_ca_wallets_v1')).wallets.length, 1);

    // Check onboarding zh & en visible text against assertZeroDevJargon ([POST-FIX] flags 0-Gas)
    await session.closeSheet('sheet-wallets');
    await session.click('#header-account-pill');
    await session.click('#sheet-wallets button[onclick*="startAdditionalWalletCreate"]');
    assertZeroDevJargon(session.getVisibleText('#view-onboarding'), 'view-onboarding zh');

    session.window.toggleLanguage();
    await session.flushMicrotasks(6);
    assertZeroDevJargon(session.getVisibleText('#view-onboarding'), 'view-onboarding en [POST-FIX]');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

// =====================================================================
// FEATURE 2: Home, Balances & Asset List (6 Tier 1 + 5 Tier 2 = 11)
// =====================================================================

test('F2-T1-01: 14-chain concurrent balance sync & price hydration updates hero USD, Preact AssetListPanel & refresh button', async () => {
  const wallet = createSeededWallet({
    nativeBalances: {
      near: null, sol: null, eth: null, base: null, arb: null, bsc: null,
      op: null, pol: null, avax: null, hype: null, hood: null, arc: null, prl: null, btc: null
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: create14ChainHealthyFetchMock()
  });
  try {
    const refreshBtn = session.document.getElementById('btn-home-refresh');
    assert.ok(refreshBtn);
    refreshBtn.click();
    assert.equal(refreshBtn.disabled, true, '#btn-home-refresh must disable while syncing');
    assert.match(refreshBtn.textContent, /同步中|Syncing/);

    await session.waitFor(() => !refreshBtn.disabled && session.getVisibleText('#hero-total-usd') !== '--', 4000);
    assert.match(session.getVisibleText('#hero-total-usd'), /^\$[\d,]+\.\d{2}$/);
    const cards = session.document.querySelectorAll('#home-unified-asset-list .asset-group-card');
    assert.ok(cards.length >= 7, `Expected >= 7 asset cards, got ${cards.length}`);
    assert.ok(
      session.getToastHistory().some((t) => /多链资产已同步|Balances synced/.test(t.text)),
      'Toast should confirm balances synced'
    );

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T1-02: Arc USDC deduplicates 0x3600... sentinel and aggregates cleanly with Base USDC', async () => {
  const wallet = createSeededWallet({
    erc20Balances: {
      base_0x833589fcd6edb6e08f4c7c32d4f71b54bda02913: 50
    }
  });
  wallet.nativeBalances.arc = 12.5;

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id }),
      near_ca_live_tokens_v1: JSON.stringify(buildLivePricesSeed())
    }
  });
  try {
    const groups = session.window.NearCAUI.buildAllOnChainAssetGroups(wallet);
    const usdcGroup = groups.find((g) => g.symbolKey === 'USDC');
    assert.ok(usdcGroup, 'USDC group must exist');
    const arcEntries = usdcGroup.entries.filter((e) => e.blockchain === 'arc');
    assert.equal(arcEntries.length, 1, 'Arc USDC must appear exactly once (no 0x3600 duplicate)');
    assert.equal(arcEntries[0].assetId, 'arc:native:usdc');
    assert.equal(arcEntries[0].decimals, 18);
    assert.equal(arcEntries[0].balance, 12.5);

    const usdcCard = session.document.querySelector('.asset-parent-row[data-symbol="USDC"]');
    assert.ok(usdcCard, 'USDC card must render on Home');
    assert.ok(usdcCard.textContent.includes('62.5'), `Expected aggregated 62.5 USDC, got "${usdcCard.textContent}"`);

    await session.click('.asset-parent-row[data-symbol="USDC"]');
    assert.equal(session.hasClass('#sheet-token-detail', 'open'), true);
    assert.equal(session.getVisibleText('#token-detail-balance'), '62.5');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T1-03: Asset list sorts positive-balance tokens first, preserves 7 core symbols & hides 0-balance non-core tokens', async () => {
  const wallet = createSeededWallet({
    nativeBalances: {
      near: 0, prl: 0, sol: 2.0, eth: 0, base: 0, arb: 0, bsc: 0,
      op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, btc: 0.01
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id }),
      near_ca_live_tokens_v1: JSON.stringify(buildLivePricesSeed())
    }
  });
  try {
    const rows = Array.from(session.document.querySelectorAll('#home-unified-asset-list .asset-parent-row'));
    const symbols = rows.map((r) => r.getAttribute('data-symbol'));

    // Positive USD tokens (BTC $900, SOL $300) appear before 0-balance core tokens
    assert.equal(symbols[0], 'BTC');
    assert.equal(symbols[1], 'SOL');
    for (const coreSym of ['NEAR', 'PRL', 'QTC', 'SOL', 'ETH', 'BNB', 'BTC']) {
      assert.ok(symbols.includes(coreSym), `Core symbol ${coreSym} must stay visible`);
    }
    assert.ok(!symbols.includes('PEPE'), '0-balance non-core PEPE must be hidden');
    assert.ok(!symbols.includes('ARB'), '0-balance non-core ARB must be hidden');
    assert.ok(!symbols.includes('AVAX'), '0-balance non-core AVAX must be hidden');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T1-04: Dust drawer (< $0.05) collapses non-core dust tokens while keeping portfolio USD accurate', async () => {
  const wallet = createSeededWallet({
    nativeBalances: {
      near: 0, prl: 0, sol: 0, eth: 0, base: 0, arb: 0, bsc: 0,
      op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, btc: 0
    },
    erc20Balances: {
      eth_0x6b175474e89094c44da98b954eedeac495271d0f: 0.02, // DAI $0.02 < $0.05
      arb_0x912ce59144191c1204e64559fe8253a0e49e6548: 10 // ARB $10.00 >= $0.05
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id }),
      near_ca_live_tokens_v1: JSON.stringify(buildLivePricesSeed())
    }
  });
  try {
    const toggleBtn = session.document.querySelector('[data-action="toggle-home-dust"]');
    assert.ok(toggleBtn, 'Dust drawer toggle must be rendered');
    assert.equal(toggleBtn.getAttribute('aria-expanded'), 'false');
    assert.match(toggleBtn.textContent, /小额资产 \(1 · < \$0\.05\)|Small Balances \(1 · < \$0\.05\)/);
    assert.equal(session.document.querySelector('.dust-drawer-list'), null);
    assert.equal(session.getVisibleText('#hero-total-usd'), '$10.02');

    await session.click('[data-action="toggle-home-dust"]');
    assert.equal(session.document.querySelector('[data-action="toggle-home-dust"]').getAttribute('aria-expanded'), 'true');
    const dustListText = session.getVisibleText('.dust-drawer-list');
    assert.ok(dustListText.includes('DAI'), 'Expanded dust drawer must show DAI');

    await session.click('[data-action="toggle-home-dust"]');
    assert.equal(session.document.querySelector('.dust-drawer-list'), null);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T1-05: Hero NEAR ID copy & register .near button opens NEAR account sheet', async () => {
  const wallet = createSeededWallet({ nearNamedAccount: '' });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    assert.equal(session.isVisible('#btn-hero-register-near'), true);
    assert.ok(session.getVisibleText('#hero-near-id').includes('11112222'));

    await session.click('#view-wallet button[onclick*="copyActiveNearId"]');
    assert.equal(session.clipboardLog.at(-1), wallet.nearAddress);
    assert.ok(session.getToastHistory().some((t) => /已复制|Copied/.test(t.text)));

    await session.click('#btn-hero-register-near');
    assert.equal(session.hasClass('#sheet-near-account', 'open'), true);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T1-06: Pull-to-refresh touch gesture triggers balance sync & resets transform on completion', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: create14ChainHealthyFetchMock()
  });
  try {
    const viewWallet = session.document.getElementById('view-wallet');
    const Ev = session.window.Event;

    viewWallet.dispatchEvent(new Ev('touchstart', { bubbles: true, cancelable: true, touches: [{ clientX: 120, clientY: 100 }] }));
    viewWallet.dispatchEvent(new Ev('touchmove', { bubbles: true, cancelable: true, touches: [{ clientX: 122, clientY: 220 }] }));
    assert.equal(session.hasClass('#home-ptr-indicator', 'pulling'), true);

    viewWallet.dispatchEvent(new Ev('touchend', { bubbles: true, cancelable: true }));
    await session.waitFor(() => !session.isDisabled('#btn-home-refresh') && !session.hasClass('#home-ptr-indicator', 'refreshing'), 4000);

    assert.match(session.getVisibleText('#home-ptr-text'), /下拉刷新链上余额|Pull down to refresh/);
    assert.ok(
      session.getToastHistory().some((t) => /多链资产已同步|Balances synced/.test(t.text)),
      'PTR completion should show synced toast'
    );

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T2-01: Total API failure displays -- without fake prices/balances & re-enables refresh button', async () => {
  const wallet = createSeededWallet({
    nativeBalances: {
      near: null, sol: null, eth: null, base: null, arb: null, bsc: null,
      op: null, pol: null, avax: null, hype: null, hood: null, arc: null, prl: null, btc: null
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async () => mockJsonResponse({ error: 'Upstream unavailable' }, 503)
  });
  try {
    await session.click('#btn-home-refresh');
    await session.waitFor(() => !session.isDisabled('#btn-home-refresh'), 4000);

    assert.equal(session.getVisibleText('#hero-total-usd'), '--', 'Hero USD must show -- when prices/balances fail');
    const priceEls = Array.from(session.document.querySelectorAll('#home-unified-asset-list .asset-price'));
    assert.ok(priceEls.length >= 7);
    for (const el of priceEls) {
      assert.equal(el.textContent.trim(), '--', 'Unloaded price must render -- (no fake fallback)');
    }
    const amtEls = Array.from(session.document.querySelectorAll('#home-unified-asset-list .asset-total-amt'));
    for (const el of amtEls) {
      assert.equal(el.textContent.trim(), '--', 'Unloaded balance must render --');
    }

    assertZeroDevJargon(session.getVisibleText('#view-wallet'), 'view-wallet on 503');
    for (const t of session.getToastHistory()) {
      assertZeroDevJargon(t.text, 'F2-T2-01 toast');
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T2-02: PRL/BTC failure while other chains succeed surfaces partial-sync toast & keeps healthy balances', async () => {
  const wallet = createSeededWallet({
    nativeBalances: {
      near: null, sol: null, eth: null, base: null, arb: null, bsc: null,
      op: null, pol: null, avax: null, hype: null, hood: null, arc: null, prl: null, btc: null
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: create14ChainHealthyFetchMock({
      prlHandler: async () => mockJsonResponse({ error: 'PRL offline' }, 500),
      btcHandler: async () => mockJsonResponse({ error: 'BTC offline' }, 500)
    })
  });
  try {
    await session.click('#btn-home-refresh');
    await session.waitFor(() => !session.isDisabled('#btn-home-refresh'), 4000);

    const stored = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1')).wallets[0];
    assert.equal(stored.nativeBalances.near, 10);
    assert.equal(stored.nativeBalances.sol, 2);
    assert.equal(stored.nativeBalances.eth, 0.5);
    assert.ok(
      session.getToastHistory().some((t) => /部分链仍在后台同步中|Syncing remaining chains/.test(t.text)),
      'Toast must indicate remaining chains syncing when PRL/BTC return null'
    );

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T2-03: Horizontal swipe >8px cancels pull-to-refresh; duplicate refresh click while busy is ignored', async () => {
  const wallet = createSeededWallet();
  let releaseDelayedFetch;
  const delayedGate = new Promise((resolve) => { releaseDelayedFetch = resolve; });
  let gateManualRefresh = false;
  let manualNearRpcGated = false;
  let nearViewAccountCount = 0;

  const healthyMock = create14ChainHealthyFetchMock();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init) => {
      if (gateManualRefresh && /fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(url)) {
        const body = typeof init?.body === 'string' ? init.body : '';
        if (/"request_type"\s*:\s*"view_account"/.test(body)) {
          nearViewAccountCount += 1;
          manualNearRpcGated = true;
          await delayedGate;
        }
      }
      return healthyMock(url, init);
    }
  });
  try {
    // Drain boot sync before testing swipe and gating manual refresh
    await waitNetworkQuiet(session);

    const viewWallet = session.document.getElementById('view-wallet');
    const Ev = session.window.Event;
    const netBeforeSwipe = session.getNetworkLog().length;

    viewWallet.dispatchEvent(new Ev('touchstart', { bubbles: true, cancelable: true, touches: [{ clientX: 100, clientY: 100 }] }));
    const moveEv = new Ev('touchmove', { bubbles: true, cancelable: true, touches: [{ clientX: 145, clientY: 104 }] });
    viewWallet.dispatchEvent(moveEv);
    viewWallet.dispatchEvent(new Ev('touchend', { bubbles: true, cancelable: true }));

    assert.equal(moveEv.defaultPrevented, false, 'Horizontal swipe >8px must NOT preventDefault');
    assert.equal(session.hasClass('#home-ptr-indicator', 'pulling'), false);
    assert.equal(getNonPerpNetworkLog(session, netBeforeSwipe).length, 0);

    // Gate manual refresh so its NEAR view_account RPC stays genuinely in flight
    gateManualRefresh = true;
    const refreshBtn = session.document.getElementById('btn-home-refresh');
    refreshBtn.click();
    assert.equal(refreshBtn.disabled, true);

    await session.waitFor(() => manualNearRpcGated, 2000);
    await waitNetworkQuiet(session);
    assert.equal(refreshBtn.disabled, true, '#btn-home-refresh must remain disabled while fetch is held in flight');

    const viewAccountWhileInFlight = nearViewAccountCount;
    const netLenWhileInFlight = session.getNetworkLog().length;
    assert.equal(viewAccountWhileInFlight, 1, 'First manual refresh must hold exactly 1 NEAR view_account RPC under delayedGate');

    // Attempt BOTH disabled button click AND direct refreshAllBalancesAsync(true) while delayedGate is still held
    refreshBtn.click();
    const dupRefreshPromise = session.window.refreshAllBalancesAsync(true);
    await session.flushMicrotasks(20);
    await waitNetworkQuiet(session);

    assert.equal(nearViewAccountCount, viewAccountWhileInFlight, 'Duplicate click / direct refreshAllBalancesAsync(true) while busy must NOT fire extra NEAR view_account RPC');
    assert.equal(getNonPerpNetworkLog(session, netLenWhileInFlight).length, 0, 'Duplicate refresh while delayedGate is held must NOT fire any extra network calls');

    // Release delayedGate and verify clean single completion
    releaseDelayedFetch();
    await dupRefreshPromise;
    await session.waitFor(() => !refreshBtn.disabled, 4000);
    await waitNetworkQuiet(session);
    assert.equal(nearViewAccountCount, viewAccountWhileInFlight, 'No queued duplicate NEAR view_account RPC may fire after delayedGate releases');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    if (releaseDelayedFetch) releaseDelayedFetch();
    session.cleanup();
  }
});

test('F2-T2-04: Dust boundary keeps core PRL ($0.01) & $0.05 UNI in main list while moving $0.049 PEPE to dust drawer', async () => {
  const wallet = createSeededWallet({
    nativeBalances: {
      near: 0, prl: 1, sol: 0, eth: 0, base: 0, arb: 0, bsc: 0,
      op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, btc: 0
    },
    erc20Balances: {
      eth_0x1f9840a85d5af5bf1d1762f925bdaddc4201f984: 0.005, // UNI: 0.005 * $10 = $0.050
      eth_0x6982508145454ce325ddbe47a25d4ec3d2311933: 4900 // PEPE: 4900 * $0.00001 = $0.049
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id }),
      near_ca_live_tokens_v1: JSON.stringify(buildLivePricesSeed())
    }
  });
  try {
    const mainSymbols = Array.from(session.document.querySelectorAll('#home-unified-asset-list .asset-group-card .asset-parent-row'))
      .filter((el) => !el.closest('.dust-drawer-list'))
      .map((el) => el.getAttribute('data-symbol'));

    assert.ok(mainSymbols.includes('PRL'), 'Core PRL ($0.01) must remain in main list');
    assert.ok(mainSymbols.includes('UNI'), 'Non-core UNI at exact $0.05 boundary must remain in main list');
    assert.ok(!mainSymbols.includes('PEPE'), 'Non-core PEPE at $0.049 must move into dust drawer');

    await session.click('[data-action="toggle-home-dust"]');
    assert.ok(session.getVisibleText('.dust-drawer-list').includes('PEPE'));

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F2-T2-05: Optimistic spend protects PRL balance against stale Blockbook until spend reflects on-chain', async () => {
  const wallet = createSeededWallet({ nativeBalances: { ...createSeededWallet().nativeBalances, prl: 100 } });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    const ui = session.window.NearCAUI;
    const activeW = session.window.NearCAState.getActiveWallet();
    const res = ui.applyOptimisticChainSpend(activeW, 'prl', 10, 0.01, 'tx_opt_1');
    assert.equal(res.nextBal, 89.99);
    assert.equal(activeW.nativeBalances.prl, 89.99);

    // Stale remote returns old pre-spend 100 -> optimistic 89.99 preserved
    assert.equal(ui.reconcileFetchedChainBalance(activeW, 'prl', 100), 89.99);

    // Confirmed remote reflects spend -> accepts live 89.99 and clears pending
    assert.equal(ui.reconcileFetchedChainBalance(activeW, 'prl', 89.99), 89.99);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

// =====================================================================
// FEATURE 3: Token Detail & Tx History (6 Tier 1 + 5 Tier 2 = 11)
// =====================================================================

test('F3-T1-01: Clicking USDC row opens #sheet-token-detail with chain pills, breakdown & price', async () => {
  const wallet = createSeededWallet({
    nearNep141Balances: {
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { raw: '10000000', formatted: 10, decimals: 6 }
    },
    erc20Balances: {
      base_0x833589fcd6edb6e08f4c7c32d4f71b54bda02913: 25
    }
  });
  wallet.nativeBalances.arc = 12.5;

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id }),
      near_ca_live_tokens_v1: JSON.stringify(buildLivePricesSeed())
    }
  });
  try {
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="USDC"]');
    assert.equal(session.hasClass('#sheet-token-detail', 'open'), true);
    assert.equal(session.getVisibleText('#token-detail-title'), 'USDC');
    assert.equal(session.getVisibleText('#token-detail-balance'), '47.5');
    assert.equal(session.getVisibleText('#token-detail-price-val'), '$1.00');
    assert.equal(session.isVisible('#token-detail-breakdown-card'), true);
    assert.equal(session.isVisible('#token-detail-addr-row'), false);

    const pillsText = session.getVisibleText('#token-detail-chains');
    assert.match(pillsText, /全部网络|All Networks/);
    assert.ok(pillsText.includes('NEAR · 10'));
    assert.ok(pillsText.includes('BASE · 25'));
    assert.ok(pillsText.includes('ARC · 12.5'));

    const breakdownRows = session.document.querySelectorAll('#token-detail-breakdown-list .detail-row-item');
    assert.ok(breakdownRows.length >= 3, `Expected >= 3 breakdown rows, got ${breakdownRows.length}`);
    const breakdownText = session.getVisibleText('#token-detail-breakdown-list');
    assert.ok(breakdownText.includes('NEAR Protocol') && breakdownText.includes('10 USDC'));
    assert.ok(breakdownText.includes('Base') && breakdownText.includes('25 USDC'));
    assert.ok(breakdownText.includes('Arc Network') && breakdownText.includes('12.5 USDC'));

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T1-02: Token detail chain filter pill updates balance, hides breakdown, shows address & copies address', async () => {
  const wallet = createSeededWallet({
    nearNep141Balances: {
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { raw: '10000000', formatted: 10, decimals: 6 }
    },
    erc20Balances: {
      base_0x833589fcd6edb6e08f4c7c32d4f71b54bda02913: 25
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    const activeEvmAddr = session.window.NearCAState.getActiveWallet().mpcEvmAddress;
    assert.match(activeEvmAddr, /^0x[0-9a-fA-F]{40}$/);

    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="USDC"]');
    await session.click('[data-action="set-token-detail-chain"][data-chain="base"]');

    assert.equal(session.getVisibleText('#token-detail-balance'), '25');
    assert.equal(session.isVisible('#token-detail-breakdown-card'), false);
    assert.equal(session.isVisible('#token-detail-addr-row'), true);
    assert.equal(session.getVisibleText('#token-detail-addr'), activeEvmAddr);

    const expHref = session.document.getElementById('token-detail-explorer-link').getAttribute('href');
    assert.ok(expHref.startsWith(`https://basescan.org/address/${activeEvmAddr}`));

    await session.click('#token-detail-addr-row button[onclick*="copyTokenDetailAddress"]');
    assert.equal(session.clipboardLog.at(-1), activeEvmAddr);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T1-03: Token detail Earn suggestions, quick-action Send & quick-action Swap prefill target views', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="NEAR"]');
    assert.equal(session.isVisible('#token-detail-earn-card'), true);
    const poolBtn = session.document.querySelector('[data-action="open-token-detail-pool"]');
    assert.ok(poolBtn, 'Expected Earn pool item in NEAR detail');
    const poolId = poolBtn.getAttribute('data-pool-id');
    poolBtn.click();
    await session.flushMicrotasks(8);

    assert.equal(session.isVisible('#view-earn'), true);
    assert.equal(session.window.NearCAState.staking.selectedPoolId, poolId);

    // Reopen NEAR detail and test detail-send
    await session.switchTab('wallet');
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="NEAR"]');
    await session.click('[data-action="detail-send"]');
    assert.equal(session.hasClass('#sheet-send', 'open'), true);
    assert.equal(session.document.getElementById('send-asset-select').value, 'NEAR');
    await session.closeSheet('sheet-send');

    // Reopen NEAR detail and test detail-swap
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="NEAR"]');
    await session.click('[data-action="detail-swap"]');
    assert.equal(session.isVisible('#view-swap'), true);
    assert.equal(session.window.NearCAState.swap.fromAssetId, 'nep141:wrap.near');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T1-04: Pearl tx history renders compact rows and opens OKX-style #sheet-tx-detail without legacy UTXO table', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/api\.prlscan\.com\/v1\/addresses\/.*\/txs/i.test(url)) {
        return mockJsonResponse({
          items: [
            {
              txid: 'prl_tx_hash_001',
              delta_grains: '500000000',
              fee_grains: '10000',
              time: Math.floor(Date.now() / 1000) - 120,
              status: 'confirmed'
            }
          ]
        });
      }
      return mockJsonResponse({});
    }
  });
  try {
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="PRL"]');
    await session.waitFor(() => session.document.querySelector('#token-detail-history-list .tx-compact-row'), 2000);

    const compactText = session.getVisibleText('#token-detail-history-list');
    assert.ok(compactText.includes('+5 PRL'));
    assert.equal(session.isVisible('#token-detail-history-all-btn'), true);

    await session.click('#token-detail-history-list [data-action="open-tx-detail"]');
    assert.equal(session.hasClass('#sheet-tx-detail', 'open'), true);
    const detailHtml = session.document.getElementById('tx-detail-body').innerHTML;
    assert.ok(detailHtml.includes('+5 PRL'));
    assert.ok(!detailHtml.includes('<table'), 'Legacy UTXO table must not exist in OKX-style tx detail');
    const expLink = session.document.getElementById('tx-detail-explorer-link').getAttribute('href');
    assert.equal(expLink, 'https://prlscan.com/tx/prl_tx_hash_001');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T1-05: Full history sheet & back navigation stack (#sheet-token-detail -> #sheet-tx-history -> #sheet-tx-detail -> back)', async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const wallet = createSeededWallet({
    activityHistory: [
      { id: 'a1', type: 'send', symbol: 'NEAR', chain: 'near', amount: 1.1, txHash: 'hash_1', timestamp: nowSec - 10 },
      { id: 'a2', type: 'receive', symbol: 'NEAR', chain: 'near', amount: 2.2, txHash: 'hash_2', timestamp: nowSec - 20 },
      { id: 'a3', type: 'send', symbol: 'NEAR', chain: 'near', amount: 3.3, txHash: 'hash_3', timestamp: nowSec - 30 },
      { id: 'a4', type: 'receive', symbol: 'NEAR', chain: 'near', amount: 4.4, txHash: 'hash_4', timestamp: nowSec - 40 }
    ]
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async () => mockJsonResponse({ txns: [] })
  });
  try {
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="NEAR"]');
    await session.waitFor(() => session.document.querySelectorAll('#token-detail-history-list .tx-compact-row').length === 3, 2000);

    await session.click('#token-detail-history-all-btn');
    assert.equal(session.hasClass('#sheet-tx-history', 'open'), true);
    assert.match(session.getVisibleText('#tx-history-sheet-title'), /NEAR (?:交易记录|Transactions)/);
    assert.equal(session.document.querySelectorAll('#tx-history-full-list .tx-card-full').length, 4);

    await session.click('#tx-history-full-list [data-action="open-tx-detail"]');
    assert.equal(session.hasClass('#sheet-tx-detail', 'open'), true);

    await session.click('#sheet-tx-detail button[onclick*="navigateBackFromTxDetail"]');
    assert.equal(session.hasClass('#sheet-tx-history', 'open'), true);

    await session.click('#sheet-tx-history button[onclick*="navigateBackFromTxHistory"]');
    assert.equal(session.hasClass('#sheet-token-detail', 'open'), true);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T1-06: Arc explorer 403 HTML falls back to eth_getLogs and decodes 0x3600... USDC at 6 decimals', async () => {
  const wallet = createSeededWallet();
  wallet.nativeBalances.arc = 12.5;
  let paddedWallet = '';

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/explorer\.arc\.io/i.test(url)) {
        return mockHtmlResponse('<!DOCTYPE html><html><body>Just a moment...</body></html>', 403);
      }
      if (/rpc\.mainnet\.arc\.io/i.test(url)) {
        const req = JSON.parse(init.body || '{}');
        if (req.method === 'eth_blockNumber') {
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: '0x1000' });
        }
        if (req.method === 'eth_getLogs') {
          const topics = req.params?.[0]?.topics || [];
          // Inbound Transfer topic[2] === paddedWallet -> 10_000_000 (10 USDC at 6 dec)
          if (paddedWallet && topics[2] === paddedWallet) {
            return mockJsonResponse({
              jsonrpc: '2.0',
              id: req.id,
              result: [{
                transactionHash: '0xarc_log_tx_1',
                logIndex: '0x0',
                blockNumber: '0xfff',
                topics: [
                  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                  '0x0000000000000000000000002222222222222222222222222222222222222222',
                  paddedWallet
                ],
                data: encodeUint256Hex(10_000_000n)
              }]
            });
          }
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: [] });
        }
        if (req.method === 'eth_getBlockByNumber') {
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: req.id,
            result: { timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16) }
          });
        }
      }
      return mockJsonResponse({});
    }
  });
  try {
    const activeEvm = session.window.NearCAState.getActiveWallet().mpcEvmAddress;
    paddedWallet = '0x' + activeEvm.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="USDC"]');
    await session.click('[data-action="set-token-detail-chain"][data-chain="arc"]');
    await session.waitFor(() => session.document.querySelector('#token-detail-history-list .tx-compact-row'), 2000);

    const listText = session.getVisibleText('#token-detail-history-list');
    assert.ok(listText.includes('+10 USDC'), `Expected +10 USDC (6-dec fallback), got "${listText}"`);
    assertZeroDevJargon(listText, 'Arc 403 fallback history');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T2-01: Half-direction eth_getLogs failure after Blockscout 403 surfaces unavailable notice (not empty false-negative)', async () => {
  const wallet = createSeededWallet({
    erc20Balances: {
      arb_0xaf88d065e77c8cc2239327c5edb3a432268e5831: 10
    }
  });
  let paddedWallet = '';

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/arbitrum\.blockscout\.com/i.test(url)) {
        return mockHtmlResponse('<html>403 Forbidden</html>', 403);
      }
      if (/arb1\.arbitrum\.io\/rpc/i.test(url)) {
        const req = JSON.parse(init.body || '{}');
        if (req.method === 'eth_blockNumber') {
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: '0x1000' });
        }
        if (req.method === 'eth_getLogs') {
          const topics = req.params?.[0]?.topics || [];
          // Outbound succeeds [], inbound fails HTTP 500
          if (paddedWallet && topics[2] === paddedWallet) {
            return mockJsonResponse({ error: 'Internal Server Error' }, 500);
          }
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: [] });
        }
      }
      return mockJsonResponse({});
    }
  });
  try {
    const activeEvm = session.window.NearCAState.getActiveWallet().mpcEvmAddress;
    paddedWallet = '0x' + activeEvm.replace(/^0x/, '').toLowerCase().padStart(64, '0');
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="USDC"]');
    await session.click('[data-action="set-token-detail-chain"][data-chain="arb"]');
    await session.waitFor(() => {
      const txt = session.getVisibleText('#token-detail-history-list');
      return txt && !/正在加载|Loading/.test(txt);
    }, 2000);

    const histText = session.getVisibleText('#token-detail-history-list');
    assert.match(histText, /部分网络暂无法拉取历史记录|History on some networks is temporarily unavailable/);
    assert.doesNotMatch(histText, /No recent token activity found|暂无该代币链上变动记录/);
    assertZeroDevJargon(histText, 'F3-T2-01 half-failure history');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T2-02: Native Base/Polygon Blockscout 429 triggers sanitized unavailable message in zh & en', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/blockscout\.com/i.test(url)) {
        return mockJsonResponse({ message: '429 Too Many Requests' }, 429);
      }
      return mockJsonResponse({ error: 'rpc error' }, 503);
    }
  });
  try {
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="POL"]');
    await session.waitFor(() => {
      const txt = session.getVisibleText('#token-detail-history-list');
      return txt && !/正在加载|Loading/.test(txt);
    }, 2000);

    const zhText = session.getVisibleText('#token-detail-history-list');
    assert.match(zhText, /部分网络暂无法拉取历史记录/);
    assertZeroDevJargon(zhText, 'POL 429 zh');
    assert.equal(session.isVisible('#token-detail-explorer-link'), true);

    await session.click('#header-lang-btn');
    const enText = session.getVisibleText('#token-detail-history-list');
    assert.match(enText, /History on some networks is temporarily unavailable/);
    assertZeroDevJargon(enText, 'POL 429 en');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T2-03: [POST-FIX] Merged history deduplicates local pending item with remote confirmed tx while keeping Swap metadata', async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const wallet = createSeededWallet({
    activityHistory: [
      {
        id: 'local_1',
        type: 'swap',
        symbol: 'PRL',
        toSymbol: 'SOL',
        toAmount: 1.5,
        chain: 'prl',
        amount: 100,
        status: 'pending',
        txHash: 'tx_dup_123',
        timestamp: nowSec - 60
      },
      {
        id: 'local_2',
        type: 'receive',
        symbol: 'PRL',
        chain: 'prl',
        amount: 20,
        status: 'confirmed',
        txHash: 'tx_newer_456',
        timestamp: nowSec - 10
      }
    ]
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/api\.prlscan\.com/i.test(url)) {
        return mockJsonResponse({
          items: [
            { txid: 'tx_dup_123', delta_grains: '-10000000000', fee_grains: '0', time: nowSec - 55, status: 'confirmed' }
          ]
        });
      }
      return mockJsonResponse({});
    }
  });
  try {
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="PRL"]');
    await session.waitFor(() => {
      const rows = session.document.querySelectorAll('#token-detail-history-list .tx-compact-row');
      return rows.length === 2 && /已确认|Confirmed/.test(rows[1].textContent);
    }, 2000);

    const rows = Array.from(session.document.querySelectorAll('#token-detail-history-list .tx-compact-row'));
    assert.equal(rows.length, 2, 'Duplicate txHash across local & remote must merge to 2 total rows');
    assert.equal(rows[0].getAttribute('data-tx-hash'), 'tx_newer_456', 'Must sort descending by timestamp');
    assert.equal(rows[1].getAttribute('data-tx-hash'), 'tx_dup_123');

    // [POST-FIX] Merged item preserves BOTH confirmed status AND Swap presentation (PRL ➔ SOL)
    const mergedText = rows[1].textContent;
    assert.match(mergedText, /已确认|Confirmed/);
    assert.match(mergedText, /闪兑|Swap/, '[POST-FIX] Merged swap row must preserve Swap type label instead of overwriting with send');
    assert.match(mergedText, /PRL\s*➔\s*SOL/, '[POST-FIX] Merged swap row must preserve PRL ➔ SOL pair label');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T2-04: Malformed Mempool JSON degrades gracefully; failed Solana tx shows failed glyph & badge', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/mempool\.space\/api\/address\/.*\/txs/i.test(url)) {
        return mockJsonResponse({ unexpectedObject: true });
      }
      if (/solana-rpc\.publicnode\.com/i.test(url)) {
        const req = JSON.parse(init.body || '{}');
        if (req.method === 'getSignaturesForAddress') {
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: req.id,
            result: [{ signature: 'sol_fail_sig_1', err: { InstructionError: [0, 'Custom'] }, blockTime: Math.floor(Date.now() / 1000) - 30 }]
          });
        }
      }
      return mockJsonResponse({});
    }
  });
  try {
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="BTC"]');
    await session.waitFor(() => {
      const txt = session.getVisibleText('#token-detail-history-list');
      return txt && !/正在加载|Loading/.test(txt);
    }, 2000);
    assert.match(session.getVisibleText('#token-detail-history-list'), /暂无该代币链上变动记录|No recent token activity/);
    await session.closeSheet('sheet-token-detail');

    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="SOL"]');
    await session.waitFor(() => session.document.querySelector('#token-detail-history-list .tx-compact-row'), 2000);
    const circle = session.document.querySelector('#token-detail-history-list .tx-dir-circle.failed');
    assert.ok(circle, 'Failed Solana tx must render .tx-dir-circle.failed');
    assert.equal(circle.textContent.trim(), '✕');
    assert.match(session.getVisibleText('#token-detail-history-list'), /失败|Failed/);

    await session.click('#token-detail-history-list [data-action="open-tx-detail"]');
    assert.match(session.getVisibleText('#tx-detail-body'), /交易失败|Failed/);
    assertZeroDevJargon(session.getVisibleText('#tx-detail-body'), 'SOL failed tx detail');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F3-T2-05: Language toggle re-renders open detail/history/tx-detail sheets & fetchSeq guard drops stale history response', async () => {
  const nowSec = Math.floor(Date.now() / 1000);
  const wallet = createSeededWallet({
    nearNep141Balances: {
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { raw: '10000000', formatted: 10, decimals: 6 }
    },
    splBalances: {
      EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 5
    },
    activityHistory: [
      { id: 'n1', type: 'send', symbol: 'NEAR', chain: 'near', amount: 1, txHash: 'near_hash_1', timestamp: nowSec - 15 }
    ]
  });

  let resolveSlowNear;
  const slowNearPromise = new Promise((r) => { resolveSlowNear = r; });

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/api\.nearblocks\.io/i.test(url)) {
        await slowNearPromise;
        return mockJsonResponse({
          txns: [{ transaction_hash: 'stale_near_tx', signer_account_id: 'other.near', receiver_account_id: wallet.nearAddress, actions: [], actions_agg: { deposit: '1000000000000000000000000' }, block_timestamp: String(nowSec * 1e9) }]
        });
      }
      return mockJsonResponse({});
    }
  });
  try {
    // 1. Test stale fetchSeq race: open NEAR detail (starts slow Nearblocks request), quickly switch to SOL detail
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="NEAR"]');
    await session.closeSheet('sheet-token-detail');
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="SOL"]');
    resolveSlowNear();
    await session.flushMicrotasks(12);
    assert.ok(
      !session.getVisibleText('#token-detail-history-list').includes('stale_near_tx'),
      'Stale earlier NEAR fetch must not overwrite SOL detail history'
    );
    await session.closeSheet('sheet-token-detail');

    // 2. Test live language switch re-renders open token detail, tx history & tx detail
    await session.click('.asset-parent-row[data-action="open-token-detail"][data-symbol="NEAR"]');
    await session.click('#header-lang-btn');
    assert.match(session.getVisibleText('#token-detail-chains'), /All Networks/);
    assert.match(session.getVisibleText('#token-detail-price-label'), /Live Price/);

    await session.click('#token-detail-history-all-btn');
    assert.match(session.getVisibleText('#tx-history-sheet-title'), /NEAR Transactions/);

    await session.click('#tx-history-full-list [data-action="open-tx-detail"]');
    assert.match(session.getVisibleText('#tx-detail-body'), /Action/);

    await session.click('#header-lang-btn');
    assert.match(session.getVisibleText('#tx-detail-body'), /交易动作/);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

// =====================================================================
// FEATURE 4: Send & Receive (6 Tier 1 + 5 Tier 2 = 11)
// =====================================================================

test('F4-T1-01: Receive sheet cycles through near/evm/sol/btc/prl pills, displays QR & copies each address', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    preloadQrcode: true,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    const activeW = session.window.NearCAState.getActiveWallet();
    await session.click('#view-wallet button[onclick*="openReceiveSheet"]');
    assert.equal(session.hasClass('#sheet-receive', 'open'), true);

    const expected = [
      { net: 'near', addr: activeW.nearAddress },
      { net: 'evm', addr: activeW.mpcEvmAddress },
      { net: 'sol', addr: activeW.solAddress },
      { net: 'btc', addr: activeW.btcAddress },
      { net: 'prl', addr: activeW.address }
    ];
    for (const item of expected) {
      await session.click(`[data-action="select-receive-network"][data-net="${item.net}"]`);
      assert.equal(session.getVisibleText('#receive-addr-value'), item.addr);
      const qrEl = session.document.getElementById('receive-qr-container');
      assert.ok(qrEl.innerHTML.length > 0 || qrEl.textContent.length > 0, `QR container must render for ${item.net}`);
      await session.click('#sheet-receive button[onclick*="copyReceiveAddress"]');
      assert.equal(session.clipboardLog.at(-1), item.addr);
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T1-02: Receive QTC fetches 1Click deposit address once and reuses 20-min cache across pill switches', async () => {
  const wallet = createSeededWallet();
  let quoteCalls = 0;
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/1click\.chaindefuser\.com\/v0\/quote/i.test(url)) {
        quoteCalls += 1;
        return mockJsonResponse({ quote: { depositAddress: 'qtc_1click_dep_123', amountOut: '1000000000000' } });
      }
      return mockJsonResponse({});
    }
  });
  try {
    await session.click('#view-wallet button[onclick*="openReceiveSheet"]');
    await session.click('[data-action="select-receive-network"][data-net="qtc"]');
    await session.waitFor(() => session.getVisibleText('#receive-addr-value') === 'qtc_1click_dep_123', 2000);
    assert.equal(quoteCalls, 1);

    const valEl = session.document.getElementById('receive-addr-value');
    assert.equal(valEl.dataset.loading || '', '');
    assert.equal(valEl.dataset.error || '', '');

    await session.click('#sheet-receive button[onclick*="copyReceiveAddress"]');
    assert.equal(session.clipboardLog.at(-1), 'qtc_1click_dep_123');

    // Switch away and back to QTC within 20-min TTL -> reuses cache without extra fetch
    await session.click('[data-action="select-receive-network"][data-net="near"]');
    await session.click('[data-action="select-receive-network"][data-net="qtc"]');
    assert.equal(session.getVisibleText('#receive-addr-value'), 'qtc_1click_dep_123');
    assert.equal(quoteCalls, 1, 'Cached QTC address must not re-fetch within 20 minutes');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T1-03: Send recipient auto-detects NEAR, EVM (with 10 chain pills), SOL, PRL & BTC addresses cleanly', async () => {
  const wallet = createSeededWallet({ mnemonic: TEST_MNEMONIC });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    const activeW = session.window.NearCAState.getActiveWallet();
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    const cases = [
      { addr: 'bob.near', expect: /NEAR Protocol/, showEvmRow: false },
      { addr: '0x000000000000000000000000000000000000dEaD', expect: /Ethereum.*EVM|EVM/, showEvmRow: true },
      { addr: 'So11111111111111111111111111111111111111112', expect: /Solana/, showEvmRow: false },
      { addr: activeW.address, expect: /Pearl Network/, showEvmRow: false },
      { addr: activeW.btcAddress, expect: /Bitcoin/, showEvmRow: false }
    ];
    for (const c of cases) {
      await session.setInputValue('#send-recipient-input', c.addr);
      assert.match(session.getVisibleText('#send-detected-net'), c.expect);
      assert.equal(session.isVisible('#send-evm-chain-row'), c.showEvmRow);
      if (c.showEvmRow) {
        assert.equal(session.document.querySelectorAll('#send-evm-chain-pills .filter-pill').length, 10);
      }
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T1-04: Guarded same-chain NEAR send passes Max/auth/view_access_key, builds signed tx & is stopped by Broadcast Safety Guard', async () => {
  const wallet = createSeededWallet({ mnemonic: TEST_MNEMONIC });
  const bioTracker = { calls: [] };
  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(bioTracker),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: create14ChainHealthyFetchMock()
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 2000);
    await session.click('#view-wallet button[onclick*="openSendSheet"]');

    await session.selectOption('#send-asset-select', 'NEAR');
    await session.click('#btn-send-max');
    await session.waitFor(() => Number(session.document.getElementById('send-amount-input').value) > 0, 2000);
    assert.ok(Number(session.document.getElementById('send-amount-input').value) < 12.5);

    await session.setInputValue('#send-recipient-input', 'bob.near');
    await session.setInputValue('#send-amount-input', '1.5');

    // Verify zero dev jargon on non-button Send UI elements prior to confirm
    assertZeroDevJargon(session.getVisibleText('#sheet-send .sheet-header'), 'F4-T1-04 sheet-send header');
    assertZeroDevJargon(session.getVisibleText('#send-detected-net'), 'F4-T1-04 send-detected-net');
    assertZeroDevJargon(session.getVisibleText('#send-available-bal'), 'F4-T1-04 send-available-bal');
    if (session.isVisible('#send-route-preview')) {
      assertZeroDevJargon(session.getVisibleText('#send-route-preview'), 'F4-T1-04 send-route-preview');
    }

    const bioCallsBefore = bioTracker.calls.length;
    const confirmBtn = session.document.getElementById('btn-confirm-send');
    confirmBtn.click();
    assert.equal(confirmBtn.disabled, true, '#btn-confirm-send must disable while sending');

    await session.waitFor(() => !confirmBtn.disabled && session.getNetworkLog().some((r) => r.blocked), 4000);
    assert.ok(
      bioTracker.calls.length > bioCallsBefore,
      `Security auth must be invoked during send before signing/broadcast (before=${bioCallsBefore}, after=${bioTracker.calls.length})`
    );
    const blockedReqs = session.getNetworkLog().filter((r) => r.blocked);
    assert.ok(blockedReqs.some((r) => /broadcast_tx_commit/i.test(r.reason)), 'Broadcast Safety Guard must intercept NEAR broadcast_tx_commit');
    assert.ok(session.getToastHistory().length >= 1);
    for (const nonGuardToast of session.getToastHistory().filter((t) => !/E2E_BROADCAST_BLOCKED/i.test(t.text))) {
      assertZeroDevJargon(nonGuardToast.text, 'F4-T1-04 non-guard toast');
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T1-05: Cross-chain Send schedules 350ms debounced dry:true 1Click quote and displays route preview', async () => {
  const wallet = createSeededWallet({
    nearNep141Balances: {
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { raw: '10000000', formatted: 10, decimals: 6 }
    }
  });
  let dryQuotePayloads = [];
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/1click\.chaindefuser\.com\/v0\/quote/i.test(url)) {
        const body = JSON.parse(init.body || '{}');
        dryQuotePayloads.push(body);
        return mockJsonResponse({ quote: { amountOut: '4980000', amountOutFormatted: '4.98' } });
      }
      return mockJsonResponse({});
    }
  });
  try {
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    await session.selectOption('#send-asset-select', 'USDC');
    const nearOpt = Array.from(session.document.getElementById('send-source-select').options).find((o) => o.value.startsWith('near|'));
    assert.ok(nearOpt, 'NEAR USDC source option must exist');
    await session.selectOption('#send-source-select', nearOpt.value);

    await session.setInputValue('#send-recipient-input', 'So11111111111111111111111111111111111111112');
    await session.setInputValue('#send-amount-input', '5');

    // Wait past 350ms cross-chain quote debounce
    await new Promise((r) => setTimeout(r, 430));
    await session.flushMicrotasks(12);

    assert.ok(dryQuotePayloads.some((p) => p.dry === true), 'Cross-chain preview must request dry: true quote');
    assert.equal(session.isVisible('#send-route-preview'), true);
    const previewText = session.getVisibleText('#send-route-preview');
    assert.match(previewText, /NEAR ➔ SOL/);
    assert.match(previewText, /0\.25%/);
    assert.match(previewText, /~4\.98 USDC/);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T1-06: Gas-reserve fix banner fills exact spendable amount and closing Send sheet resets form state', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    await session.selectOption('#send-asset-select', 'ETH');
    await session.setInputValue('#send-recipient-input', '0x000000000000000000000000000000000000dEaD');
    await session.setInputValue('#send-amount-input', '0.4995');

    assert.equal(session.isVisible('#send-gas-fix-banner'), true);
    assert.match(session.getVisibleText('#send-gas-fix-text'), /预留|Reserve/);

    await session.click('#btn-send-gas-fix');
    assert.equal(session.isVisible('#send-gas-fix-banner'), false);
    assert.ok(Number(session.document.getElementById('send-amount-input').value) > 0);
    assert.ok(Number(session.document.getElementById('send-amount-input').value) < 0.5);

    await session.closeSheet('sheet-send');
    assert.equal(session.document.getElementById('send-recipient-input').value, '');
    assert.equal(session.document.getElementById('send-amount-input').value, '');
    assert.equal(session.getVisibleText('#send-detected-net'), '');
    assert.equal(session.isVisible('#send-route-preview'), false);
    assert.equal(session.isVisible('#send-gas-fix-banner'), false);
    assert.equal(session.isVisible('#send-evm-chain-row'), false);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T2-01: Non-native ERC-20 send with 0 native ETH gas blocks BEFORE auth and BEFORE any RPC request', async () => {
  const bioTracker = { calls: [] };
  const wallet = createSeededWallet({
    nativeBalances: { ...createSeededWallet().nativeBalances, eth: 0 },
    erc20Balances: {
      eth_0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48: 50
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(bioTracker),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: create14ChainHealthyFetchMock({ eth: '0', ethUsdc: '50000000' })
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 2000);
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    await session.selectOption('#send-asset-select', 'USDC');

    const srcOpts = Array.from(session.document.getElementById('send-source-select').options);
    const ethOpt = srcOpts.find((o) => o.value.startsWith('eth|'));
    assert.ok(ethOpt, 'Ethereum USDC source option must exist');
    await session.selectOption('#send-source-select', ethOpt.value);

    await session.setInputValue('#send-recipient-input', '0x000000000000000000000000000000000000dEaD');
    await session.setInputValue('#send-amount-input', '10');
    await waitNetworkQuiet(session);

    const bioCallsBefore = bioTracker.calls.length;
    const netBefore = session.getNetworkLog().length;
    await session.click('#btn-confirm-send');

    assert.equal(bioTracker.calls.length, bioCallsBefore, 'Must NOT prompt security auth when gas insufficient');
    assert.equal(getNonPerpNetworkLog(session, netBefore).length, 0, 'Must NOT fire any RPC/network request when gas insufficient');
    const lastToast = session.getToastHistory().at(-1);
    assert.ok(lastToast && /ETH.*(?:网络手续费余额不足|network fee balance insufficient)/.test(lastToast.text), `Unexpected toast: ${lastToast?.text}`);
    assertZeroDevJargon(lastToast.text, 'F4-T2-01 toast');
    assert.equal(session.isDisabled('#btn-confirm-send'), false);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T2-02: [POST-FIX] Insufficient balance, SOL rent floor, null balance guard & 0-decimal Max handling', async () => {
  const bioTracker = { calls: [] };
  const wallet = createSeededWallet({
    nativeBalances: {
      ...createSeededWallet().nativeBalances,
      near: 0.5,
      sol: 0.0015,
      btc: null
    },
    nearNep141Balances: {
      'zero.near': { raw: '15', formatted: 15, decimals: 0, symbol: 'ZERO' }
    }
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(bioTracker),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async () => mockJsonResponse({ error: 'offline' }, 503)
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 2000);
    await session.click('#view-wallet button[onclick*="openSendSheet"]');

    // (a) Insufficient NEAR balance (0.5 < 1.0) blocks pre-auth & pre-RPC
    await session.selectOption('#send-asset-select', 'NEAR');
    await session.setInputValue('#send-recipient-input', 'bob.near');
    await session.setInputValue('#send-amount-input', '1.0');
    await waitNetworkQuiet(session);
    let netBefore = session.getNetworkLog().length;
    let bioBefore = bioTracker.calls.length;
    await session.click('#btn-confirm-send');
    assert.equal(bioTracker.calls.length, bioBefore);
    assert.equal(getNonPerpNetworkLog(session, netBefore).length, 0);
    assert.match(session.getToastHistory().at(-1).text, /NEAR (?:余额不足|balance insufficient)/);

    // (b) SOL rent-exempt minimum check (0.0015 - 0.001 - fee < 0.00089088)
    await session.selectOption('#send-asset-select', 'SOL');
    await session.setInputValue('#send-recipient-input', '11111111111111111111111111111111');
    await session.setInputValue('#send-amount-input', '0.001');
    await waitNetworkQuiet(session);
    netBefore = session.getNetworkLog().length;
    bioBefore = bioTracker.calls.length;
    await session.click('#btn-confirm-send');
    assert.equal(bioTracker.calls.length, bioBefore);
    assert.equal(getNonPerpNetworkLog(session, netBefore).length, 0);
    assert.match(session.getToastHistory().at(-1).text, /0\.000891 SOL|免租/);

    // (c) Null BTC balance blocks with syncing toast pre-auth & pre-RPC
    await session.selectOption('#send-asset-select', 'BTC');
    await session.setInputValue('#send-recipient-input', wallet.btcAddress);
    await session.setInputValue('#send-amount-input', '0.0001');
    await waitNetworkQuiet(session);
    netBefore = session.getNetworkLog().length;
    bioBefore = bioTracker.calls.length;
    await session.click('#btn-confirm-send');
    assert.equal(bioTracker.calls.length, bioBefore);
    assert.equal(getNonPerpNetworkLog(session, netBefore).length, 0);
    assert.match(session.getToastHistory().at(-1).text, /余额同步中|Balance syncing/);

    // (d) Direct contract null-balance verification rejects when live fetch fails
    await assert.rejects(
      () => session.window.NearCAContracts.executeBitcoinTransfer({
        wallet: { ...wallet, nativeBalances: { ...wallet.nativeBalances, btc: null } },
        toAddress: wallet.btcAddress,
        amountBtc: 0.001,
        tokenBalance: null
      }),
      /无法确认|Unable to verify/
    );

    // (e) [POST-FIX] 0-decimal token Max must compute "15" (not "0.000015" from Number(decimals) || 6)
    await session.selectOption('#send-asset-select', 'ZERO');
    await session.click('#btn-send-max');
    assert.equal(
      session.document.getElementById('send-amount-input').value,
      '15',
      '[POST-FIX] 0-decimal token Max must preserve decimals=0 instead of falling back to 6'
    );

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T2-03: Cross-chain Send rejects Arc, HyperEVM & non-1Click tokens with Swap redirect before auth/broadcast', async () => {
  const bioTracker = { calls: [] };
  const wallet = createSeededWallet({
    erc20Balances: {
      base_0x833589fcd6edb6e08f4c7c32d4f71b54bda02913: 50
    }
  });
  wallet.nativeBalances.arc = 5;
  wallet.nativeBalances.hype = 1;

  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(bioTracker),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id }),
      near_ca_live_tokens_v1: JSON.stringify({
        updatedAt: Date.now(),
        tokens: [
          { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', blockchain: 'base', decimals: 6, price: 1.0 },
          { assetId: 'arc:custom:non1click', symbol: 'USDC', blockchain: 'arc', decimals: 6, price: 1.0 }
        ]
      })
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 2000);
    await session.click('#view-wallet button[onclick*="openSendSheet"]');

    // Base USDC -> Arc / Hype EVM target pills reject cross-chain route
    await session.selectOption('#send-asset-select', 'USDC');
    const baseOpt = Array.from(session.document.getElementById('send-source-select').options).find((o) => o.value.startsWith('base|'));
    await session.selectOption('#send-source-select', baseOpt.value);
    await session.setInputValue('#send-recipient-input', '0x000000000000000000000000000000000000dEaD');
    await session.setInputValue('#send-amount-input', '5');
    await waitNetworkQuiet(session);

    for (const badTarget of ['arc', 'hype']) {
      await session.click(`[data-action="set-send-evm-chain"][data-chain="${badTarget}"]`);
      const preview = session.getVisibleText('#send-route-preview');
      assert.ok(!preview.includes(`BASE ➔ ${badTarget.toUpperCase()}`));
      assert.match(preview, /闪兑|Swap/);

      const bioBefore = bioTracker.calls.length;
      const netBefore = session.getNetworkLog().length;
      await session.click('#btn-confirm-send');
      assert.equal(bioTracker.calls.length, bioBefore);
      assert.equal(getNonPerpNetworkLog(session, netBefore).length, 0);
    }

    // Arc USDC -> Solana recipient rejected
    const arcOpt = Array.from(session.document.getElementById('send-source-select').options).find((o) => o.value.startsWith('arc|'));
    await session.selectOption('#send-source-select', arcOpt.value);
    await session.setInputValue('#send-recipient-input', '11111111111111111111111111111111');
    await session.setInputValue('#send-amount-input', '1');
    await waitNetworkQuiet(session);
    assert.match(session.getVisibleText('#send-route-preview'), /闪兑|Swap/);
    const bioBeforeArc = bioTracker.calls.length;
    await session.click('#btn-confirm-send');
    assert.equal(bioTracker.calls.length, bioBeforeArc);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T2-04: Invalid address checksums block pre-RPC; BTC dust/coinbase/3x600-sat fee convergence & blockstream fallback via #sheet-send UI', async () => {
  const wallet = createSeededWallet({
    mnemonic: TEST_MNEMONIC,
    nativeBalances: { ...createSeededWallet().nativeBalances, btc: 0.000018 }
  });
  const bioTracker = { calls: [] };
  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(bioTracker),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/mempool\.space\/api\/address\/.*\/utxo/i.test(url)) {
        return mockJsonResponse([
          { txid: 'a'.repeat(64), vout: 0, value: 50000, coinbase: true, confirmations: 10 }, // unmatured coinbase -> skipped
          { txid: 'b'.repeat(64), vout: 0, value: 600, confirmations: 6 },
          { txid: 'c'.repeat(64), vout: 0, value: 600, confirmations: 6 },
          { txid: 'd'.repeat(64), vout: 0, value: 600, confirmations: 6 }
        ]);
      }
      if (/mempool\.space\/api\/address\/[^/?]+$/i.test(url)) {
        return mockJsonResponse({
          chain_stats: { funded_txo_sum: 1800, spent_txo_sum: 0 },
          mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 }
        });
      }
      // Force mempool.space fee endpoint failure so blockstream.info/api/fee-estimates fallback is exercised
      if (/mempool\.space\/api\/v1\/fees\/recommended/i.test(url)) {
        return mockJsonResponse({ error: 'mempool fees unavailable' }, 500);
      }
      if (/blockstream\.info\/api\/fee-estimates/i.test(url)) {
        return mockJsonResponse({ 2: 1 });
      }
      return mockJsonResponse({});
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 2000);
    await session.click('#view-wallet button[onclick*="openSendSheet"]');

    // (a) Bad checksums (wrong EIP-55 mixed case, bad prl1p, bad bc1p) block pre-auth & pre-RPC
    await waitNetworkQuiet(session);
    const badAddrs = [
      '0x000000000000000000000000000000000000Dead',
      'prl1p000000000000000000000000000000000000000000000000000badchk',
      'bc1p000000000000000000000000000000000000000000000000000badchk'
    ];
    for (const badAddr of badAddrs) {
      await session.setInputValue('#send-recipient-input', badAddr);
      await session.setInputValue('#send-amount-input', '0.001');
      const bioBefore = bioTracker.calls.length;
      const netBefore = session.getNetworkLog().length;
      await session.click('#btn-confirm-send');
      assert.equal(bioTracker.calls.length, bioBefore);
      assert.equal(getNonPerpNetworkLog(session, netBefore).length, 0);
      assert.ok(session.getVisibleText('#send-detected-net').length > 0);
    }

    // (b) Exercise BTC dust (<546 sats) and 3x600-sat UTXO convergence via real #sheet-send UI flow
    await session.selectOption('#send-asset-select', 'BTC');
    await session.waitFor(
      () => session.getNetworkLog().some((r) => /blockstream\.info\/api\/fee-estimates/i.test(r.url)),
      3000
    );
    await waitNetworkQuiet(session);

    const activeBtcAddr = session.window.NearCAState.getActiveWallet().btcAddress;
    assert.match(activeBtcAddr, /^bc1p/, 'Derived active BTC address must be Taproot bc1p...');
    await session.setInputValue('#send-recipient-input', activeBtcAddr);

    // Dust < 546 sats (400 sats = 0.000004 BTC) rejected through UI flow
    const confirmBtn = session.document.getElementById('btn-confirm-send');
    await session.setInputValue('#send-amount-input', '0.000004');
    const bioBeforeDust = bioTracker.calls.length;
    await session.click('#btn-confirm-send');
    await session.waitFor(() => !confirmBtn.disabled, 3000);
    assert.ok(bioTracker.calls.length > bioBeforeDust, 'Dust check after auth reaches BTC tx builder');
    const dustToast = session.getToastHistory().at(-1);
    assert.ok(dustToast && /546|最小转账限制|minimum/i.test(dustToast.text), `Expected BTC dust limit toast, got: ${dustToast?.text}`);

    // 3x600-sat UTXOs (0.00001 BTC = 1000 sats) reaches Broadcast Safety Guard cleanly via #sheet-send UI
    await session.setInputValue('#send-amount-input', '0.00001');
    const bioBeforeBtcSend = bioTracker.calls.length;
    await session.click('#btn-confirm-send');
    await session.waitFor(
      () => !confirmBtn.disabled && session.getNetworkLog().some((r) => r.blocked && /mempool\.space\/api\/tx/i.test(r.url)),
      4000
    );
    assert.ok(bioTracker.calls.length > bioBeforeBtcSend, 'Security auth must be invoked before BTC signing/broadcast');

    const netUrls = session.getNetworkLog().map((r) => r.url);
    assert.ok(
      netUrls.some((u) => /mempool\.space\/api\/v1\/fees\/recommended/i.test(u)),
      'Primary mempool.space fee endpoint must be attempted'
    );
    assert.ok(
      netUrls.some((u) => /blockstream\.info\/api\/fee-estimates/i.test(u)),
      'Fallback blockstream.info/api/fee-estimates must be exercised when mempool.space returns 500'
    );
    assert.ok(
      !netUrls.some((u) => /blockstream\.info\/api\/v1\/fees\/recommended/i.test(u)),
      'Must never call broken blockstream /v1/fees/recommended 404 endpoint'
    );

    const blockedBtc = session.getNetworkLog().find((r) => r.blocked && /mempool\.space\/api\/tx/i.test(r.url));
    assert.ok(blockedBtc && typeof blockedBtc.body === 'string' && blockedBtc.body.length > 100, 'Signed BTC rawHex must reach guard');

    // Parse raw SegWit transaction hex to verify coinbase exclusion (vinCount === 3), single output, and converged fee >= 272 sats
    const rawBuf = Buffer.from(blockedBtc.body, 'hex');
    let offset = 4; // version
    const markerFlag = rawBuf.subarray(offset, offset + 2).toString('hex');
    assert.equal(markerFlag, '0001', 'BTC tx must be SegWit v1 Taproot format');
    offset += 2;
    const readVarInt = () => {
      const first = rawBuf[offset++];
      if (first < 0xfd) return first;
      if (first === 0xfd) { const v = rawBuf.readUInt16LE(offset); offset += 2; return v; }
      if (first === 0xfe) { const v = rawBuf.readUInt32LE(offset); offset += 4; return v; }
      const v = Number(rawBuf.readBigUInt64LE(offset)); offset += 8; return v;
    };
    const vinCount = readVarInt();
    assert.equal(vinCount, 3, 'Unmatured <100-conf coinbase UTXO must be excluded; all 3x600-sat UTXOs must be selected');
    for (let i = 0; i < vinCount; i += 1) {
      offset += 32 + 4; // prevout txid + vout
      const scriptSigLen = readVarInt();
      offset += scriptSigLen + 4; // scriptSig + sequence
    }
    const voutCount = readVarInt();
    assert.equal(voutCount, 1, '1000-sat send from 1800-sat inputs with converged fee leaves <546 change -> 1 output');
    let totalOutSats = 0;
    for (let o = 0; o < voutCount; o += 1) {
      const valSats = Number(rawBuf.readBigUInt64LE(offset));
      offset += 8;
      const spkLen = readVarInt();
      offset += spkLen;
      totalOutSats += valSats;
    }
    assert.equal(totalOutSats, 1000, 'Output value must equal 1000 sats (0.00001 BTC)');
    const impliedFeeSats = (3 * 600) - totalOutSats;
    assert.equal(impliedFeeSats, 800, 'Implied fee from 3x600-sat inputs minus 1000-sat output must be 800 sats');
    assert.ok(impliedFeeSats >= 272, `Implied converged fee (${impliedFeeSats} sats) must be >= 272 sats`);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F4-T2-05: [POST-FIX] QTC HTTP 502 error is sanitized; #btn-confirm-send & send copy contain zero 广播/Broadcast jargon', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/1click\.chaindefuser\.com\/v0\/quote/i.test(url)) {
        return mockJsonResponse({ message: 'HTTP 502 Bad Gateway from 1Click API' }, 502);
      }
      return mockJsonResponse({});
    }
  });
  try {
    // 1. QTC 502 error sanitization + copy refusal while error
    await session.click('#view-wallet button[onclick*="openReceiveSheet"]');
    await session.click('[data-action="select-receive-network"][data-net="qtc"]');
    await session.waitFor(() => session.document.getElementById('receive-addr-value').dataset.error === '1', 2000);

    const qtcToast = session.getToastHistory().at(-1);
    assert.ok(qtcToast, 'Expected error toast on QTC 502');
    assertZeroDevJargon(qtcToast.text, 'QTC 502 toast');
    assert.ok(session.document.querySelector('#receive-addr-value button[data-net="qtc"]'), 'Retry button must appear');

    await session.click('#sheet-receive button[onclick*="copyReceiveAddress"]');
    assert.equal(session.clipboardLog.length, 0, 'Must NOT copy QTC error text');
    await session.closeSheet('sheet-receive');

    // 2. [POST-FIX] Check #btn-confirm-send & i18n send labels in zh & en for zero 广播/Broadcast jargon
    const { i18nDict } = loadDistAssets();
    assertZeroDevJargon(i18nDict.zh['sheet.sendConfirmBtn'], 'i18nDict.zh.sheet.sendConfirmBtn [POST-FIX]');
    assertZeroDevJargon(i18nDict.en['sheet.sendConfirmBtn'], 'i18nDict.en.sheet.sendConfirmBtn [POST-FIX]');

    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    assertZeroDevJargon(session.getVisibleText('#sheet-send'), 'sheet-send zh [POST-FIX]');
    await session.click('#header-lang-btn');
    assertZeroDevJargon(session.getVisibleText('#sheet-send'), 'sheet-send en [POST-FIX]');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});
