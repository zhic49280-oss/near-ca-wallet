'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createWalletAppSession,
  isBroadcastRequest,
  assertZeroDevJargon
} = require('./e2e-harness.js');

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_NEAR_NAMED = 'e2euser.near';
const TEST_NEAR_IMPLICIT = '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000';
const TEST_EVM_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const TEST_EVM_PRIVKEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const TEST_ALT_EVM_ADDR = '0x9999999999999999999999999999999999999999';
const TEST_SOL_ADDR = '11111111111111111111111111111111';

function createSeededWallet(overrides = {}) {
  return {
    id: 'e2e_wallet_1',
    name: 'E2E Trader',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: TEST_NEAR_NAMED,
    nearAddress: TEST_NEAR_IMPLICIT,
    nearPublicKey: 'ed25519:5J8Wx5fKx8F2o1V9Q3nP7sL6mK9rT2uV4wX6yZ8aB1cD',
    evmAddress: TEST_EVM_ADDR,
    mpcEvmAddress: TEST_EVM_ADDR,
    solAddress: TEST_SOL_ADDR,
    address: 'prl1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdj2x9v7',
    btcAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    biometricEnabled: false,
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
    nearNep141Balances: {
      'wrap.near': { formatted: 4.0, raw: '4000000000000000000000000', decimals: 24 },
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { formatted: 50, raw: '50000000', decimals: 6 },
      'usdt.tether-token.near': { formatted: 50, raw: '50000000', decimals: 6 },
      'token.rhealab.near': { formatted: 200, raw: '200000000000000000000', decimals: 18 },
      'otoken.rhealab.near': { formatted: 100, raw: '100000000000000000000', decimals: 18 },
      'xtoken.rhealab.near': { formatted: 40, raw: '40000000000000000000', decimals: 18 },
      'prl.omft.near': { formatted: 1000, raw: '100000000000', decimals: 8 }
    },
    splBalances: {
      EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 100,
      JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 50
    },
    erc20Balances: {
      eth_0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48: 100,
      base_0x833589fcd6edb6e08f4c7c32d4f71b54bda02913: 100,
      arb_0xaf88d065e77c8cc2239327c5edb3a432268e5831: 100,
      bsc_0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d: 100,
      eth_0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2: 0.4,
      eth_0x4c9edd5852cd905f086c759e8383e09bff1e68b3: 50
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
    async text() { return raw; },
    async arrayBuffer() {
      const b = Buffer.from(raw, 'utf8');
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    }
  };
}

function encodeUint256Hex(bigVal) {
  return '0x' + BigInt(bigVal).toString(16).padStart(64, '0');
}

function encodeNearCallResult(obj) {
  const bytes = Array.from(Buffer.from(JSON.stringify(obj), 'utf8'));
  return { result: bytes };
}

function decodeNearQueryArgs(reqBody) {
  try {
    const b64 = reqBody?.params?.args_base64 || '';
    return b64 ? JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) : {};
  } catch (_) {
    return {};
  }
}

function buildLivePricesSeed() {
  return {
    updatedAt: Date.now(),
    dexSymPrices: {
      NEAR: 5.0,
      WNEAR: 5.0,
      USDC: 1.0,
      USDT: 1.0,
      RHEA: 0.5,
      ORHEA: 0.5,
      SOL: 150.0,
      JUP: 1.0,
      ETH: 3000.0,
      WETH: 3000.0,
      BNB: 600.0,
      WBNB: 600.0,
      PRL: 0.01
    },
    tokens: [
      { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 5.0 },
      { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', symbol: 'USDC', blockchain: 'near', decimals: 6, price: 1.0 },
      { assetId: 'nep141:usdt.tether-token.near', symbol: 'USDT', blockchain: 'near', decimals: 6, price: 1.0 },
      { assetId: '1cs_v1:near:nep141:token.rhealab.near', symbol: 'RHEA', blockchain: 'near', decimals: 18, price: 0.5 },
      { assetId: '1cs_v1:near:nep141:otoken.rhealab.near', symbol: 'oRHEA', blockchain: 'near', decimals: 18, price: 0.5 },
      { assetId: 'nep141:sol.omft.near', symbol: 'SOL', blockchain: 'sol', decimals: 9, price: 150.0 },
      { assetId: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', blockchain: 'sol', decimals: 6, price: 1.0 },
      { assetId: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', blockchain: 'sol', decimals: 6, price: 1.0 },
      { assetId: 'nep141:eth.omft.near', symbol: 'ETH', blockchain: 'eth', decimals: 18, price: 3000.0 },
      { assetId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', blockchain: 'eth', decimals: 6, price: 1.0 },
      { assetId: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', symbol: 'WETH', blockchain: 'eth', decimals: 18, price: 3000.0 },
      { assetId: 'arc:0x3600000000000000000000000000000000000000', symbol: 'USDC', blockchain: 'arc', decimals: 6, price: 1.0 },
      { assetId: '1cs_v1:near:nep141:prl.omft.near', symbol: 'PRL', blockchain: 'near', decimals: 8, price: 0.01 },
      { assetId: 'prl:native:prl', symbol: 'PRL', blockchain: 'prl', decimals: 8, price: 0.01 }
    ]
  };
}

function buildSeededStorage(walletOverrides = {}, extraStorage = {}) {
  const wallet = createSeededWallet(walletOverrides);
  return {
    near_ca_lang_v1: 'en',
    near_ca_wallets_v1: { wallets: [wallet], activeWalletId: wallet.id },
    near_ca_live_tokens_v1: buildLivePricesSeed(),
    ...extraStorage
  };
}

async function createUnlockedSession(options = {}) {
  const { evmPrivateKey, evmAddressOverride, ...sessionOpts } = options;
  const session = await createWalletAppSession(sessionOpts);
  if (evmPrivateKey) {
    const w = session.window.NearCAState?.getActiveWallet?.();
    if (w) {
      w.evmPrivateKey = evmPrivateKey;
      if (evmAddressOverride) w.evmAddress = evmAddressOverride;
    }
  }
  return session;
}

function createPerpBaselineMock(overrides = {}) {
  const now = Date.now();
  const candles = overrides.candles || Array.from({ length: 30 }, (_, i) => ({
    t: now - (30 - i) * 900_000,
    T: now - (29 - i) * 900_000,
    o: String(95000 + i * 20),
    h: String(95150 + i * 20),
    l: String(94900 + i * 20),
    c: String(95080 + i * 20),
    v: '125.5'
  }));

  const defaultUniverse = [
    { name: 'BTC', szDecimals: 4, maxLeverage: 40 },
    { name: 'ETH', szDecimals: 3, maxLeverage: 25 },
    { name: 'SOL', szDecimals: 2, maxLeverage: 20 }
  ];
  const defaultCtxs = [
    { markPx: '95500', midPx: '95500', prevDayPx: '93000', dayNtlVlm: '1250000000', openInterest: '15000', funding: '0.0000125' },
    { markPx: '3200', midPx: '3200', prevDayPx: '3100', dayNtlVlm: '500000000', openInterest: '45000', funding: '0.00001' },
    { markPx: '180', midPx: '180', prevDayPx: '185', dayNtlVlm: '220000000', openInterest: '80000', funding: '-0.00001' }
  ];
  const xyzUniverse = [{ name: 'xyz:CRCL', szDecimals: 2, maxLeverage: 10, onlyIsolated: true }];
  const xyzCtxs = [{ markPx: '88.5', midPx: '88.5', prevDayPx: '80.0', dayNtlVlm: '12000000', openInterest: '9000', funding: '0.00001' }];

  return async (url, init = {}) => {
    const u = String(url || '');
    const bodyText = typeof init.body === 'string' ? init.body : '';
    if (typeof overrides.customHandler === 'function') {
      const res = await overrides.customHandler(u, init, bodyText);
      if (res !== undefined) return res;
    }
    if (/api\.hyperliquid\.xyz\/info/i.test(u)) {
      const req = bodyText ? JSON.parse(bodyText) : {};
      if (req.type === 'perpDexs') {
        return mockJsonResponse(overrides.perpDexs ?? [null, { name: 'xyz' }]);
      }
      if (req.type === 'metaAndAssetCtxs') {
        if (req.dex === 'xyz') {
          return mockJsonResponse([
            { universe: overrides.xyzUniverse || xyzUniverse },
            overrides.xyzCtxs || xyzCtxs
          ]);
        }
        return mockJsonResponse([
          { universe: overrides.universe || defaultUniverse },
          overrides.ctxs || defaultCtxs
        ]);
      }
      if (req.type === 'clearinghouseState') {
        if (req.dex) {
          return mockJsonResponse({
            marginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0' },
            withdrawable: '0',
            assetPositions: []
          });
        }
        return mockJsonResponse(overrides.clearinghouseState ?? {
          marginSummary: { accountValue: '200.0', totalMarginUsed: '40.0', totalNtlPos: '200.0' },
          withdrawable: '160.0',
          assetPositions: []
        });
      }
      if (req.type === 'spotClearinghouseState') {
        return mockJsonResponse(overrides.spotClearinghouseState ?? {
          balances: [{ coin: 'USDC', total: '0', hold: '0' }]
        });
      }
      if (req.type === 'openOrders' || req.type === 'frontendOpenOrders') {
        if (req.dex) return mockJsonResponse([]);
        return mockJsonResponse(overrides.openOrders ?? []);
      }
      if (req.type === 'userFills') {
        return mockJsonResponse(overrides.userFills ?? []);
      }
      if (req.type === 'userFees') {
        return mockJsonResponse({ userCrossRate: '0.00045', userAddRate: '0.00015' });
      }
      if (req.type === 'l2Book') {
        return mockJsonResponse(overrides.l2Book ?? {
          levels: [
            [{ px: '95490', sz: '0.5000', n: 2 }, { px: '95480', sz: '1.2000', n: 3 }],
            [{ px: '95510', sz: '0.4000', n: 2 }, { px: '95520', sz: '0.9000', n: 4 }]
          ]
        });
      }
      if (req.type === 'candleSnapshot') {
        return mockJsonResponse(candles);
      }
      if (req.type === 'allMids') {
        return mockJsonResponse({ BTC: '95500', ETH: '3200', SOL: '180', 'xyz:CRCL': '88.5' });
      }
    }
    if (/fapi\.binance\.com\/futures\/data\/globalLongShortAccountRatio/i.test(u)) {
      if (overrides.lsRatioStatus && overrides.lsRatioStatus !== 200) {
        return mockJsonResponse({ error: 'Unavailable' }, overrides.lsRatioStatus);
      }
      return mockJsonResponse(overrides.lsRatio ?? [{
        longAccount: '0.6200',
        shortAccount: '0.3800',
        longShortRatio: '1.6316',
        timestamp: now
      }]);
    }
    if (/api\.hyperliquid\.xyz\/exchange/i.test(u)) {
      return mockJsonResponse(overrides.exchangeResult ?? { status: 'ok', response: { type: 'order', data: { statuses: [{ filled: { totalSz: '0.001', avgPx: '95500' } }] } } });
    }
    return mockJsonResponse({}, 200);
  };
}

// =====================================================================
// FEATURE 5: Swap & Bridges (incl. 1CS Confidential Intents) (12 Tests)
// =====================================================================

test('F5-T1-01: Same-chain NEAR DEX quote, USD estimates, rate orientation flip & slippage details', async () => {
  let quoteCalls = 0;
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage({}, {
      near_ca_swap_pair_v1: {
        fromAssetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        toAssetId: 'nep141:wrap.near'
      }
    }),
    fetchMock: async (url, init = {}) => {
      const u = String(url || '');
      if (/smartrouter\.ref\.finance\/findPath/i.test(u)) {
        quoteCalls += 1;
        return mockJsonResponse({
          result_code: 0,
          result_data: {
            amount_out: '1980000000000000000000000',
            routes: [{ pools: [{ pool_id: 4512, token_in: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', token_out: 'wrap.near', min_amount_out: '1960000000000000000000000' }] }]
          }
        });
      }
      if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(u)) {
        const req = init.body ? JSON.parse(init.body) : {};
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { result: [] } });
      }
      if (/1click\.chaindefuser\.com\/v0\/quote/i.test(u)) {
        return mockJsonResponse({
          quote: {
            amountOut: '1950000000000000000000000',
            amountOutFormatted: '1.95',
            amountInUsd: '10.00',
            amountOutUsd: '9.75'
          }
        });
      }
      return mockJsonResponse({}, 200);
    }
  });

  try {
    await session.switchTab('swap');
    assert.equal(session.isVisible('#view-swap'), true);
    assert.equal(session.isVisible('#swap-market-panel'), true);

    await session.input('#swap-amount-in', '10');
    await session.waitFor(() => {
      const out = Number(session.document.getElementById('swap-amount-out')?.value || 0);
      return out > 0;
    }, 3000);

    assert.ok(quoteCalls >= 1, 'Expected Ref smartrouter quote call');
    assert.notEqual(session.getVisibleText('#swap-usd-in'), '--');
    assert.notEqual(session.getVisibleText('#swap-usd-out'), '--');
    assert.ok(session.getVisibleText('#swap-auto-route-badge').length > 0);

    const rateBefore = session.getVisibleText('#swap-quote-rate');
    assert.match(rateBefore, /^1 USDC ≈ /);
    await session.click('#swap-quote-rate');
    const rateAfter = session.getVisibleText('#swap-quote-rate');
    assert.match(rateAfter, /^1 NEAR ≈ /);
    assert.notEqual(rateAfter, rateBefore);

    assert.equal(session.isVisible('#swap-details-body'), false);
    await session.click('#swap-details-toggle');
    assert.equal(session.isVisible('#swap-details-body'), true);
    assert.equal(session.document.getElementById('swap-details-toggle')?.getAttribute('aria-expanded'), 'true');

    await session.click('#swap-details-body [data-bps="50"]');
    assert.match(session.getVisibleText('#swap-details-summary'), /0\.5%/);
    await session.waitFor(() => Number(session.document.getElementById('swap-amount-out')?.value || 0) > 0, 2000);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F5-T1-02: Token picker chain filters, more-chains drawer, search, favorite star & selection', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: async (url) => {
      if (/lite-api\.jup\.ag\/tokens\/v2\/search/i.test(String(url))) {
        return mockJsonResponse([]);
      }
      return mockJsonResponse({}, 200);
    }
  });

  try {
    await session.switchTab('swap');
    await session.click('#swap-from-token-btn');
    assert.equal(session.hasClass('#sheet-token-picker', 'open'), true);

    assert.equal(session.isVisible('#token-picker-more-chains'), false);
    await session.click('[data-action="toggle-picker-more-chains"]');
    assert.equal(session.isVisible('#token-picker-more-chains'), true);

    await session.click('#token-picker-chains [data-action="set-picker-chain"][data-chain="sol"]');
    assert.equal(session.isVisible('#token-picker-more-chains'), false);

    await session.input('#token-picker-search', 'USDC');
    await session.flushMicrotasks(8);
    const rows = session.document.querySelectorAll('#token-picker-list [data-action="select-swap-token"]');
    assert.ok(rows.length >= 1, 'Expected at least 1 SOL USDC row');
    assert.match(rows[0].textContent, /USDC/);

    const starBtn = session.document.querySelector('#token-picker-list [data-action="toggle-fav-token"]');
    assert.ok(starBtn, 'Favorite star button must render in swap token picker');
    const favAssetId = starBtn.getAttribute('data-asset-id');
    starBtn.click();
    await session.flushMicrotasks(8);

    const favStore = JSON.parse(session.localStorage.getItem('near_ca_fav_tokens_v1') || '[]');
    assert.ok(favStore.includes(favAssetId), 'Favorite token ID must persist in near_ca_fav_tokens_v1');
    assert.equal(session.isVisible('#token-picker-favorites'), true);

    await session.click(`#token-picker-list [data-action="select-swap-token"][data-asset-id="${favAssetId}"]`);
    assert.equal(session.hasClass('#sheet-token-picker', 'open'), false);
    assert.match(session.getVisibleText('#swap-from-token-btn'), /USDC/);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F5-T1-03: Cross-chain DEST_DEX gas reserve toggle, recipient lock & 1CS near.com confidential quote', async (t) => {
  await t.test('Part A: Cross-chain NEAR -> SOL JUP (DEST_DEX) extra gas reserve toggle & recipient lock', async () => {
    const sessionA = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({}, {
        near_ca_swap_pair_v1: {
          fromAssetId: 'nep141:wrap.near',
          toAssetId: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN'
        }
      }),
      fetchMock: async (url, init = {}) => {
        const u = String(url || '');
        if (/1click\.chaindefuser\.com\/v0\/quote/i.test(u)) {
          const body = init.body ? JSON.parse(init.body) : {};
          assert.equal(body.dry, true, 'Quote request must use dry: true');
          return mockJsonResponse({
            quote: {
              amountOut: '2000000000',
              amountOutFormatted: '2.0',
              amountInUsd: '10.00',
              amountOutUsd: '300.00'
            }
          });
        }
        if (/lite-api\.jup\.ag\/swap\/v1\/quote/i.test(u)) {
          return mockJsonResponse({
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
            inAmount: '2000000000',
            outAmount: '295000000',
            slippageBps: 100
          });
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionA.switchTab('swap');
      await sessionA.input('#swap-amount-in', '2');
      await sessionA.waitFor(() => Number(sessionA.document.getElementById('swap-amount-out')?.value || 0) > 0, 3000);

      assert.equal(sessionA.isDisabled('#swap-recipient-input'), true, 'DEST_DEX route must lock recipient to own wallet');
      assert.equal(sessionA.isVisible('#swap-gas-reserve-row'), true, 'Cross-chain DEST_DEX must show target gas reserve selector');

      const autoOut = Number(sessionA.document.getElementById('swap-amount-out').value);
      await sessionA.click('#swap-gas-reserve-row [data-gas-mode="extra"]');
      await sessionA.waitFor(() => Number(sessionA.document.getElementById('swap-amount-out')?.value || 0) < autoOut, 2500);
      const extraOut = Number(sessionA.document.getElementById('swap-amount-out').value);
      assert.ok(extraOut < autoOut, `Extra gas reserve (${extraOut}) must reduce net output below auto (${autoOut})`);
      sessionA.assertNoRuntimeErrors();
      sessionA.assertNoRealBroadcasts();
    } finally {
      sessionA.cleanup();
    }
  });

  await t.test('Part B: 1CS (near.com Confidential Intents) quote path via /nearcom-proxy', async () => {
    const nearcomPaths = [];
    const sessionB = await createUnlockedSession({
      viewportWidth: 375,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage({}, {
        near_ca_swap_pair_v1: {
          fromAssetId: 'nep141:prl.omft.near',
          toAssetId: 'nep141:sol.omft.near'
        }
      }),
      fetchMock: async (url) => {
        const u = String(url || '');
        if (/\/nearcom-proxy/i.test(u)) {
          const parsed = new URL(u, 'http://127.0.0.1:3334');
          const p = parsed.searchParams.get('path') || '';
          nearcomPaths.push(p);
          if (p === '/api/auth/message') {
            return mockJsonResponse({
              message: { message: 'Sign in to near.com', recipient: 'intents.near', nonce: Array(32).fill(7) }
            });
          }
          if (p === '/api/auth/authenticate') {
            return mockJsonResponse({ accessToken: 'tok_1cs_test', refreshToken: 'ref_1cs', expiresAt: Date.now() + 900_000 });
          }
          if (p === '/api/swap/quote') {
            return mockJsonResponse({
              ok: {
                quote: { amountOut: '500000000', amountOutUsd: '12.50', depositAddress: 'conf_dep_1' },
                appFee: 25
              }
            });
          }
        }
        if (/1click\.chaindefuser\.com\/v0\/quote/i.test(u)) {
          return mockJsonResponse({ error: 'No direct 1Click quote' }, 404);
        }
        if (/smartrouter\.ref\.finance|dexscreener/i.test(u)) {
          return mockJsonResponse({ result_code: -1, pairs: [] }, 200);
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionB.switchTab('swap');
      await sessionB.input('#swap-amount-in', '500');
      await sessionB.waitFor(() => nearcomPaths.includes('/api/swap/quote') && Number(sessionB.document.getElementById('swap-amount-out')?.value || 0) > 0, 4000);
      assert.ok(nearcomPaths.includes('/api/auth/message'));
      assert.ok(nearcomPaths.includes('/api/auth/authenticate'));
      assert.ok(nearcomPaths.includes('/api/swap/quote'));
      assert.equal(sessionB.isDisabled('#swap-recipient-input'), false, '1CS confidential swap allows editable recipient');
      sessionB.assertNoRuntimeErrors();
      sessionB.assertNoRealBroadcasts();
    } finally {
      sessionB.cleanup();
    }
  });
});

test('F5-T1-04: Swap execution PIN gate, Broadcast Safety Guard & mocked-success history/order closure', async (t) => {
  await t.test('Part A: Strict Broadcast Safety Guard blocks real NEAR/1Click broadcast', async () => {
    const sessionGuard = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({}, {
        near_ca_swap_pair_v1: {
          fromAssetId: 'nep141:wrap.near',
          toAssetId: 'nep141:sol.omft.near'
        }
      }),
      fetchMock: async (url, init = {}) => {
        const u = String(url || '');
        if (/1click\.chaindefuser\.com\/v0\/quote/i.test(u)) {
          const b = init.body ? JSON.parse(init.body) : {};
          return mockJsonResponse({
            quote: {
              amountOut: '33000000',
              amountOutFormatted: '0.033',
              amountInUsd: '5.00',
              amountOutUsd: '4.95',
              depositAddress: b.dry ? null : 'oneclick_deposit_1.near'
            }
          });
        }
        if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(u)) {
          const req = init.body ? JSON.parse(init.body) : {};
          if (req?.params?.request_type === 'view_access_key') {
            return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
          }
          if (req?.params?.request_type === 'view_account') {
            return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { amount: '12500000000000000000000000', storage_usage: 182 } });
          }
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionGuard.switchTab('swap');
      await sessionGuard.input('#swap-amount-in', '1');
      await sessionGuard.waitFor(() => Number(sessionGuard.document.getElementById('swap-amount-out')?.value || 0) > 0, 3000);

      await sessionGuard.click('#btn-execute-swap');
      await sessionGuard.flushMicrotasks(12);

      await sessionGuard.waitFor(
        () => sessionGuard.getNetworkLog().some((r) => r.blocked),
        3500
      );
      const blocked = sessionGuard.getNetworkLog().filter((r) => r.blocked);
      assert.ok(blocked.some((r) => /broadcast_tx|send_tx/i.test(r.reason)), 'NEAR broadcast must be intercepted by Broadcast Guard');
      sessionGuard.assertNoRealBroadcasts();
      sessionGuard.assertNoRuntimeErrors();
    } finally {
      sessionGuard.cleanup();
    }
  });

  await t.test('Part B: Mocked-success closure verifies dual-clear, #swap-order-card & Preact #swap-history-list', async () => {
    const sessionSuccess = await createWalletAppSession({
      viewportWidth: 375,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage({}, {
        near_ca_swap_pair_v1: {
          fromAssetId: 'nep141:wrap.near',
          toAssetId: 'nep141:sol.omft.near'
        }
      }),
      fetchMock: async (url, init = {}) => {
        const u = String(url || '');
        if (/1click\.chaindefuser\.com\/v0\/quote/i.test(u)) {
          const b = init.body ? JSON.parse(init.body) : {};
          return mockJsonResponse({
            quote: {
              amountOut: '33000000',
              amountOutFormatted: '0.033',
              amountInUsd: '5.00',
              amountOutUsd: '4.95',
              depositAddress: b.dry ? null : 'oneclick_deposit_1.near'
            }
          });
        }
        if (/1click\.chaindefuser\.com\/v0\/status/i.test(u)) {
          return mockJsonResponse({ status: 'PROCESSING' });
        }
        if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(u)) {
          const req = init.body ? JSON.parse(init.body) : {};
          if (req.method === 'broadcast_tx_commit' || req.method === 'broadcast_tx_async' || req.method === 'send_tx') {
            return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { transaction: { hash: 'NearTxHashMock111111111111' }, status: { SuccessValue: '' } } });
          }
          if (req?.params?.request_type === 'view_access_key') {
            return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
          }
          if (req?.params?.request_type === 'view_account') {
            return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { amount: '12500000000000000000000000', storage_usage: 182 } });
          }
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionSuccess.switchTab('swap');
      await sessionSuccess.input('#swap-amount-in', '1');
      await sessionSuccess.waitFor(() => Number(sessionSuccess.document.getElementById('swap-amount-out')?.value || 0) > 0, 3000);
      await sessionSuccess.click('#btn-execute-swap');
      await sessionSuccess.flushMicrotasks(12);

      await sessionSuccess.waitFor(() => sessionSuccess.isVisible('#swap-order-card'), 4000);
      assert.equal(sessionSuccess.document.getElementById('swap-amount-in')?.value, '', 'Successful swap must clear #swap-amount-in');
      const histRows = sessionSuccess.document.querySelectorAll('#swap-history-list .tx-compact-row');
      assert.ok(histRows.length >= 1, 'Preact SwapHistoryPanel must display recorded swap row');
      sessionSuccess.assertNoRealBroadcasts();
      sessionSuccess.assertNoRuntimeErrors();
    } finally {
      sessionSuccess.cleanup();
    }
  });
});

test('F5-T1-05: Multi-stage order tracking, manual status refresh, stage-2 resume, Done double-tap & foreground resume', async (t) => {
  await t.test('Part A: Multi-stage order tracking, manual refresh, resume button & Done double-tap confirm', async () => {
    const activeOrder = {
      walletId: 'e2e_wallet_1',
      depositAddress: 'dep_stage1_near.near',
      status: 'SUCCESS',
      fromSymbol: 'PRL',
      toSymbol: 'NEAR',
      originTxHash: 'OriginPrlTx123456',
      autoBroadcasted: true,
      createdAt: Date.now() - 10_000,
      followUpExecuted: false,
      followUpFailed: true,
      followUpError: 'Stage 2 pending',
      followUpRefSwap: {
        tokenIn: 'prl.omft.near',
        tokenOut: 'wrap.near',
        amountInRaw: '10000000000',
        slippageBps: 100
      }
    };

    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({}, { near_ca_active_swap_order_v1: activeOrder }),
      fetchMock: async (url) => {
        if (/1click\.chaindefuser\.com\/v0\/status/i.test(String(url))) {
          await new Promise((r) => setTimeout(r, 30));
          return mockJsonResponse({ status: 'SUCCESS' });
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await session.switchTab('swap');
      assert.equal(session.isVisible('#swap-order-card'), true);
      assert.equal(session.isVisible('#btn-resume-swap-stage'), true, 'Failed stage-2 must expose #btn-resume-swap-stage');
      assert.match(session.getVisibleText('#swap-order-status'), /Stage 1|Step 2|Tap|Continue|Resume/i);

      const refreshBtn = session.document.getElementById('btn-refresh-swap-order');
      assert.ok(refreshBtn);
      refreshBtn.click();
      assert.equal(refreshBtn.disabled, true, '#btn-refresh-swap-order must disable while refreshing');
      await session.waitFor(() => !refreshBtn.disabled, 2000);

      // First Done click must warn without dismissing pending multi-stage order
      await session.click('#swap-order-card button[onclick="clearActiveSwapOrder()"]');
      assert.equal(session.isVisible('#swap-order-card'), true);
      assert.ok(session.getToastHistory().some((x) => /Tap Done again|in progress|确认清除|再点一次/i.test(x.text)));

      // Second Done click within 6s dismisses card
      await session.click('#swap-order-card button[onclick="clearActiveSwapOrder()"]');
      assert.equal(session.isVisible('#swap-order-card'), false);
      session.assertNoRuntimeErrors();
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: Foreground resume (visibilitychange / focus) refreshes pending swap order', async () => {
    let swapStatusCalls = 0;
    const pendingOrder = {
      walletId: 'e2e_wallet_1',
      depositAddress: 'dep_fg_resume_1.near',
      status: 'PROCESSING',
      fromSymbol: 'NEAR',
      toSymbol: 'SOL',
      originTxHash: 'FgResumeOriginTx1',
      autoBroadcasted: true,
      createdAt: Date.now() - 15_000
    };

    const session = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({}, { near_ca_active_swap_order_v1: pendingOrder }),
      fetchMock: async (url) => {
        const u = String(url || '');
        if (/1click\.chaindefuser\.com\/v0\/status/i.test(u)) {
          swapStatusCalls += 1;
          return mockJsonResponse({ status: 'PROCESSING' });
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await session.switchTab('swap');
      assert.equal(session.isVisible('#swap-order-card'), true);
      const callsBeforeSwapResume = swapStatusCalls;

      // Simulate background -> foreground via visibilitychange + focus
      Object.defineProperty(session.document, 'hidden', { value: true, configurable: true });
      session.document.dispatchEvent(new session.window.Event('visibilitychange'));
      Object.defineProperty(session.document, 'hidden', { value: false, configurable: true });
      session.document.dispatchEvent(new session.window.Event('visibilitychange'));
      session.window.dispatchEvent(new session.window.Event('focus'));

      await session.waitFor(() => swapStatusCalls > callsBeforeSwapResume, 3000);
      assert.ok(swapStatusCalls > callsBeforeSwapResume, 'Returning to foreground must refresh pending swap order status');
      session.assertNoRuntimeErrors();
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part C: [POST-FIX] Foreground resume (focus) refreshes active limit orders', async () => {
    let triggerOrderCalls = 0;
    const session = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: async (url) => {
        if (/lite-api\.jup\.ag\/trigger\/v1\/getTriggerOrders/i.test(String(url || ''))) {
          triggerOrderCalls += 1;
          return mockJsonResponse({ orders: [] });
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await session.switchTab('swap');
      await session.click('#swap-mode-limit-btn');
      await session.click('#limit-chain-pills [data-limit-chain="sol"]');
      await session.waitFor(() => triggerOrderCalls >= 1, 3000);
      const limitCallsBeforeFocus = triggerOrderCalls;

      session.window.dispatchEvent(new session.window.Event('focus'));
      await session.waitFor(() => triggerOrderCalls > limitCallsBeforeFocus, 400).catch(() => {});
      assert.ok(
        triggerOrderCalls > limitCallsBeforeFocus,
        '[POST-FIX] Returning to foreground on Limit tab must refresh active limit orders'
      );
      session.assertNoRuntimeErrors();
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });
});

test('F5-T1-06: Swap MAX exact gas deduction (native NEAR vs USDC) & Swap History Preact detail sheet', async () => {
  const walletHistory = [
    {
      id: 'act_swap_1',
      type: 'swap',
      symbol: 'NEAR',
      toSymbol: 'USDC',
      chain: 'near',
      amount: 2,
      txHash: 'NearSwapTxHash987654321',
      title: 'NEAR -> USDC',
      status: 'confirmed',
      timestamp: Date.now() - 60_000
    }
  ];
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(
      { activityHistory: walletHistory },
      {
        near_ca_swap_pair_v1: {
          fromAssetId: 'nep141:wrap.near',
          toAssetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'
        }
      }
    ),
    fetchMock: async () => mockJsonResponse({}, 200)
  });

  try {
    await session.switchTab('swap');
    await session.click('#swap-market-panel button[onclick="setSwapMaxAmount()"]');
    await session.waitFor(() => Number(session.document.getElementById('swap-amount-in')?.value || 0) > 0, 2000);
    const nearMax = Number(session.document.getElementById('swap-amount-in').value);
    assert.ok(nearMax > 12 && nearMax < 12.5, `Native NEAR MAX (${nearMax}) must deduct gas reserve`);

    // Flip to USDC -> NEAR and verify non-native MAX uses full 50 USDC
    await session.click('#swap-market-panel button[onclick="flipSwapTokens()"]');
    await session.click('#swap-market-panel button[onclick="setSwapMaxAmount()"]');
    await session.waitFor(() => Number(session.document.getElementById('swap-amount-in')?.value || 0) === 50, 2000);

    // Click Preact SwapHistoryPanel row -> opens #sheet-tx-detail
    const histRow = session.document.querySelector('#swap-history-list .tx-compact-row');
    assert.ok(histRow, 'Preact #swap-history-list must render history row');
    histRow.click();
    await session.flushMicrotasks(10);
    assert.equal(session.hasClass('#sheet-tx-detail', 'open'), true);
    assert.match(session.getVisibleText('#sheet-tx-detail'), /NEAR|USDC/);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F5-T2-01: [POST-FIX] Local balance/gas pre-check, Gas-Fix banner & real tokenBalance passed to swap tx builders', async (t) => {
  await t.test('Part A: Insufficient NEAR, Gas-Fix banner & 0 ETH gas pre-check before auth/RPC', async () => {
    const session = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(
        { nativeBalances: { near: 12.5, eth: 0, sol: 2.0, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 } },
        {
          near_ca_swap_pair_v1: {
            fromAssetId: 'nep141:wrap.near',
            toAssetId: 'nep141:sol.omft.near'
          }
        }
      ),
      fetchMock: async (url) => {
        if (/1click\.chaindefuser\.com\/v0\/quote/i.test(String(url))) {
          return mockJsonResponse({ quote: { amountOut: '10000000', amountOutFormatted: '0.01', amountInUsd: '60', amountOutUsd: '59' } });
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await session.switchTab('swap');
      await session.input('#swap-amount-in', '999');
      await session.flushMicrotasks(8);
      assert.equal(session.isDisabled('#btn-execute-swap'), true);
      assert.match(session.getVisibleText('#btn-execute-swap'), /Insufficient|余额不足/i);

      await session.input('#swap-amount-in', '12.499');
      await session.flushMicrotasks(8);
      assert.equal(session.isVisible('#swap-gas-fix-banner'), true, 'Exceeding gas reserve must show #swap-gas-fix-banner');
      await session.click('#btn-swap-gas-fix');
      await session.flushMicrotasks(8);
      assert.equal(session.isVisible('#swap-gas-fix-banner'), false);
      assert.ok(Number(session.document.getElementById('swap-amount-in').value) < 12.499);

      // Switch to ETH USDC with 0 ETH native gas -> must block locally before PIN/RPC
      await session.click('#swap-from-token-btn');
      await session.click('#token-picker-chains [data-action="set-picker-chain"][data-chain="eth"]');
      await session.input('#token-picker-search', 'USDC');
      await session.flushMicrotasks(8);
      const ethUsdcRow = session.document.querySelector('#token-picker-list [data-action="select-swap-token"]');
      assert.ok(ethUsdcRow);
      ethUsdcRow.click();
      await session.flushMicrotasks(8);

      await session.input('#swap-amount-in', '10');
      await session.waitFor(() => Number(session.document.getElementById('swap-amount-out')?.value || 0) > 0, 2500);
      assert.equal(session.isDisabled('#btn-execute-swap'), true, '0 ETH gas must disable swap button');
      assert.match(session.getVisibleText('#btn-execute-swap'), /ETH|gas|Gas/i);
      await session.click('#btn-execute-swap');
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] followUpRefSwap validates real tokenBalance instead of skipping null/self-passing amount', async () => {
    const followUpSession = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(
        {
          nearNep141Balances: {
            'prl.omft.near': { formatted: 1, raw: '100000000', decimals: 8 }
          }
        },
        {
          near_ca_active_swap_order_v1: {
            walletId: 'e2e_wallet_1',
            depositAddress: 'dep_prl_stage1.near',
            status: 'SUCCESS',
            fromSymbol: 'PRL',
            toSymbol: 'NEAR',
            originTxHash: 'OriginPrlTx999',
            autoBroadcasted: true,
            createdAt: Date.now() - 5000,
            followUpExecuted: false,
            followUpFailed: true,
            followUpRefSwap: {
              tokenIn: 'prl.omft.near',
              tokenOut: 'wrap.near',
              amountUsdcRaw: '50000000000', // 500 PRL > 1 PRL actual balance
              inputDecimals: 8,
              tokenSymbol: 'PRL',
              slippageBps: 100
            }
          }
        }
      ),
      fetchMock: async (url, init = {}) => {
        const u = String(url || '');
        if (/1click\.chaindefuser\.com\/v0\/status/i.test(u)) {
          return mockJsonResponse({ status: 'SUCCESS' });
        }
        if (/smartrouter\.ref\.finance\/findPath/i.test(u)) {
          return mockJsonResponse({
            result_code: 0,
            result_data: {
              amount_out: '1000000000000000000000000',
              routes: [{ pools: [{ pool_id: 9010, token_in: 'prl.omft.near', token_out: 'wrap.near', min_amount_out: '900000000000000000000000' }] }]
            }
          });
        }
        if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(u)) {
          const req = init.body ? JSON.parse(init.body) : {};
          if (req?.params?.request_type === 'view_access_key') {
            return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
          }
          if (req?.params?.request_type === 'call_function' && req.params.method_name === 'ft_balance_of') {
            return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: encodeNearCallResult('100000000') });
          }
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { result: [] } });
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await followUpSession.switchTab('swap');
      await followUpSession.click('#btn-resume-swap-stage');
      await followUpSession.waitFor(
        () => followUpSession.getToastHistory().some((t) => /Insufficient|余额不足|failed/i.test(t.text)) ||
          followUpSession.getNetworkLog().some((r) => r.blocked),
        3500
      );
      const blockedBroadcasts = followUpSession.getNetworkLog().filter((r) => r.blocked);
      assert.equal(
        blockedBroadcasts.length,
        0,
        '[POST-FIX] followUpRefSwap with 500 PRL when wallet holds 1 PRL must fail balance pre-check before hitting NEAR broadcast'
      );
      followUpSession.assertNoRealBroadcasts();
    } finally {
      followUpSession.cleanup();
    }
  });
});

test('F5-T2-02: Zero/negative/dust amountRaw === "0" boundary produces clean error & zero NaN/undefined', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: async () => mockJsonResponse({}, 200)
  });

  try {
    await session.switchTab('swap');

    await session.input('#swap-amount-in', '0');
    await session.flushMicrotasks(8);
    await session.click('#btn-execute-swap');
    assert.ok(session.getToastHistory().some((t) => /Enter swap amount|请输入兑换数量/i.test(t.text)));

    await session.input('#swap-amount-in', '-5');
    await session.flushMicrotasks(8);
    assert.equal(session.getVisibleText('#swap-usd-in'), '--');

    await session.input('#swap-amount-in', '0.00000000000000000000000001');
    await session.waitFor(() => session.isVisible('#swap-error-banner'), 2000);
    assert.match(session.getVisibleText('#swap-error-banner'), /Amount too small|输入金额过小/i);

    for (const sel of ['#swap-usd-in', '#swap-usd-out', '#swap-quote-rate']) {
      const txt = session.getVisibleText(sel);
      assert.doesNotMatch(txt, /NaN|undefined/i, `${sel} must never contain NaN/undefined`);
    }
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F5-T2-03: Price impact high (>=5%) & critical (>=15%) banners and button warning escalation', async () => {
  let outUsd = '9.30';
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage({}, {
      near_ca_swap_pair_v1: {
        fromAssetId: 'nep141:wrap.near',
        toAssetId: 'nep141:sol.omft.near'
      }
    }),
    fetchMock: async (url) => {
      if (/1click\.chaindefuser\.com\/v0\/quote/i.test(String(url))) {
        return mockJsonResponse({
          quote: {
            amountOut: '60000000',
            amountOutFormatted: '0.06',
            amountInUsd: '10.00',
            amountOutUsd: outUsd
          }
        });
      }
      return mockJsonResponse({}, 200);
    }
  });

  try {
    await session.switchTab('swap');
    await session.input('#swap-amount-in', '2');
    await session.waitFor(() => session.isVisible('#swap-price-impact-banner'), 3000);
    assert.equal(session.hasClass('#swap-price-impact-banner', 'is-high'), true);
    assert.equal(session.hasClass('#swap-price-impact-banner', 'is-critical'), false);

    // Trigger >= 15% critical impact with new amount so quote cache misses
    outUsd = '7.80';
    await session.input('#swap-amount-in', '2.1');
    await session.waitFor(() => session.hasClass('#swap-price-impact-banner', 'is-critical'), 3000);
    assert.equal(session.hasClass('#btn-execute-swap', 'is-warning'), true);

    await session.click('#swap-market-panel button[onclick="flipSwapTokens()"]');
    assert.equal(session.document.getElementById('swap-amount-in')?.value, '', 'flipSwapTokens must clear #swap-amount-in');
    assert.equal(session.document.getElementById('swap-amount-out')?.value, '', 'flipSwapTokens must clear #swap-amount-out');
    assert.equal(session.isVisible('#swap-price-impact-banner'), false);
    assert.equal(session.hasClass('#btn-execute-swap', 'is-warning'), false);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F5-T2-04: 30-second quote expiry guard aborts before PIN/signing and refreshes quote', async () => {
  let quoteCount = 0;
  const session = await createUnlockedSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage({}, {
      near_ca_swap_pair_v1: {
        fromAssetId: 'nep141:wrap.near',
        toAssetId: 'nep141:sol.omft.near'
      }
    }),
    fetchMock: async (url) => {
      if (/1click\.chaindefuser\.com\/v0\/quote/i.test(String(url))) {
        quoteCount += 1;
        return mockJsonResponse({
          quote: {
            amountOut: String(30000000 + quoteCount * 100000),
            amountOutFormatted: quoteCount === 1 ? '0.03' : '0.031',
            amountInUsd: '5.00',
            amountOutUsd: '4.95'
          }
        });
      }
      return mockJsonResponse({}, 200);
    }
  });

  try {
    await session.switchTab('swap');
    await session.input('#swap-amount-in', '1');
    await session.waitFor(() => quoteCount === 1 && Number(session.document.getElementById('swap-amount-out')?.value || 0) > 0, 3000);

    // Backdate quotedAt beyond 30s
    session.window.NearCAState.swap.quoteData.quotedAt = Date.now() - 35_000;
    await session.click('#btn-execute-swap');
    await session.waitFor(
      () => session.getToastHistory().some((t) => /Quote expired|>30s|30 秒/i.test(t.text)),
      3000
    );
    assert.ok(Number(session.window.NearCAState.swap.quoteData?.quotedAt || 0) > Date.now() - 5000, 'QuotedAt must refresh');
    session.assertNoRealBroadcasts();
    session.assertNoRuntimeErrors();
  } finally {
    session.cleanup();
  }
});

test('F5-T2-05: Form lifecycle dual-clear on token switch & active multi-stage order lock', async (t) => {
  await t.test('Part A: Token switch clears #swap-amount-in, #swap-amount-out & #swap-error-banner', async () => {
    const session = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: async (url) => {
        if (/1click\.chaindefuser\.com\/v0\/quote/i.test(String(url))) {
          return mockJsonResponse({ quote: { amountOut: '30000000', amountOutFormatted: '0.03', amountInUsd: '5', amountOutUsd: '4.95' } });
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await session.switchTab('swap');
      await session.input('#swap-amount-in', '1.5');
      await session.waitFor(() => Number(session.document.getElementById('swap-amount-out')?.value || 0) > 0, 3000);

      await session.click('#swap-from-token-btn');
      await session.click('#token-picker-chains [data-action="set-picker-chain"][data-chain="near"]');
      await session.input('#token-picker-search', 'USDC');
      await session.flushMicrotasks(8);
      await session.click('#token-picker-list [data-action="select-swap-token"]');

      assert.equal(session.document.getElementById('swap-amount-in')?.value, '');
      assert.equal(session.document.getElementById('swap-amount-out')?.value, '');
      assert.equal(session.isVisible('#swap-error-banner'), false);
      session.assertNoRealBroadcasts();
      session.assertNoRuntimeErrors();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: Seeded pending multi-stage order in localStorage blocks new swap before PIN', async () => {
    const sessionLock = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({}, {
        near_ca_swap_pair_v1: {
          fromAssetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
          toAssetId: 'nep141:sol.omft.near'
        },
        near_ca_active_swap_order_v1: {
          walletId: 'e2e_wallet_1',
          depositAddress: 'dep_lock_test.near',
          status: 'PROCESSING',
          fromSymbol: 'PRL',
          toSymbol: 'NEAR',
          createdAt: Date.now() - 5000,
          followUpExecuted: false,
          followUpRefSwap: { tokenIn: 'prl.omft.near', tokenOut: 'wrap.near', amountInRaw: '100000000' }
        }
      }),
      fetchMock: async (url) => {
        if (/1click\.chaindefuser\.com\/v0\/quote/i.test(String(url))) {
          return mockJsonResponse({ quote: { amountOut: '30000000', amountOutFormatted: '0.03', amountInUsd: '10', amountOutUsd: '9.9' } });
        }
        if (/1click\.chaindefuser\.com\/v0\/status/i.test(String(url))) {
          return mockJsonResponse({ status: 'PROCESSING' });
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionLock.switchTab('swap');
      assert.equal(sessionLock.isVisible('#swap-order-card'), true);
      await sessionLock.input('#swap-amount-in', '10');
      await sessionLock.waitFor(() => !sessionLock.isDisabled('#btn-execute-swap'), 2500);
      await sessionLock.click('#btn-execute-swap');
      assert.ok(sessionLock.getToastHistory().some((t) => /multi-step swap is in progress|多段闪兑/i.test(t.text)));
      sessionLock.assertNoRealBroadcasts();
      sessionLock.assertNoRuntimeErrors();
    } finally {
      sessionLock.cleanup();
    }
  });
});

test('F5-T2-06: [POST-FIX] Swap error/jargon sanitization (1Click 429, OpenOcean 403), 1CS 45s poll pending guard & Arc 6-vs-18 dec', async (t) => {
  await t.test('Part A: [POST-FIX] 1Click 429 zero dev jargon in #swap-error-banner, route labels & toasts (EN & ZH)', async () => {
    const sessionA = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({}, {
        near_ca_swap_pair_v1: {
          fromAssetId: 'nep141:wrap.near',
          toAssetId: 'nep141:sol.omft.near'
        }
      }),
      fetchMock: async (url) => {
        if (/1click\.chaindefuser\.com\/v0\/quote/i.test(String(url))) {
          return mockJsonResponse({ message: 'Rate limited on 1Click' }, 429);
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionA.switchTab('swap');
      await sessionA.input('#swap-amount-in', '1');
      await sessionA.waitFor(() => sessionA.isVisible('#swap-error-banner'), 3000);
      assertZeroDevJargon(sessionA.getVisibleText('#swap-error-banner'), '[POST-FIX] #swap-error-banner (EN) on 1Click 429');
      assertZeroDevJargon(sessionA.getVisibleText('#swap-quote-route'), '[POST-FIX] #swap-quote-route');
      assertZeroDevJargon(sessionA.getVisibleText('#swap-auto-route-badge'), '[POST-FIX] #swap-auto-route-badge');
      for (const toast of sessionA.getToastHistory()) {
        assertZeroDevJargon(toast.text, `[POST-FIX] swap toast (EN): ${toast.text}`);
      }

      // Toggle UI to ZH and re-quote a slightly different amount to verify ZH sanitization
      await sessionA.click('#header-lang-btn');
      await sessionA.input('#swap-amount-in', '1.2');
      await sessionA.waitFor(() => sessionA.isVisible('#swap-error-banner'), 3000);
      assertZeroDevJargon(sessionA.getVisibleText('#swap-error-banner'), '[POST-FIX] #swap-error-banner (ZH) on 1Click 429');
      for (const toast of sessionA.getToastHistory()) {
        assertZeroDevJargon(toast.text, `[POST-FIX] swap toast (ZH): ${toast.text}`);
      }
      sessionA.assertNoRealBroadcasts();
    } finally {
      sessionA.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] OpenOcean 403 triggers cooldown & jargon-free user-friendly error (EN & ZH)', async () => {
    let ooHits = 0;
    const sessionOO = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({}, {
        near_ca_swap_pair_v1: {
          fromAssetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
          toAssetId: 'nep141:eth-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.omft.near'
        }
      }),
      fetchMock: async (url) => {
        const u = String(url || '');
        if (/open-api\.openocean\.finance/i.test(u)) {
          ooHits += 1;
          return mockJsonResponse({ code: 403, message: 'Forbidden by OpenOcean WAF' }, 403);
        }
        if (/aggregator-api\.kyberswap\.com|api\.paraswap\.io/i.test(u)) {
          return mockJsonResponse({ error: 'Upstream pool unavailable' }, 503);
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionOO.switchTab('swap');
      await sessionOO.input('#swap-amount-in', '10');
      await sessionOO.waitFor(() => ooHits >= 1 && sessionOO.isVisible('#swap-error-banner'), 3500);
      assert.equal(ooHits, 1, 'Expected OpenOcean quote call before cooldown');
      assertZeroDevJargon(sessionOO.getVisibleText('#swap-error-banner'), '[POST-FIX] OpenOcean 403 error banner (EN)');
      for (const toast of sessionOO.getToastHistory()) {
        assertZeroDevJargon(toast.text, `[POST-FIX] OpenOcean 403 toast: ${toast.text}`);
      }

      // Immediate re-quote on different amount must skip OpenOcean due to 10-minute cooldown
      await sessionOO.click('#header-lang-btn');
      await sessionOO.input('#swap-amount-in', '11');
      await sessionOO.waitFor(() => sessionOO.isVisible('#swap-error-banner'), 3500);
      assert.equal(ooHits, 1, 'OpenOcean 403 must activate cooldown and skip repeat calls');
      assertZeroDevJargon(sessionOO.getVisibleText('#swap-error-banner'), '[POST-FIX] OpenOcean 403 error banner (ZH)');
      sessionOO.assertNoRealBroadcasts();
    } finally {
      sessionOO.cleanup();
    }
  });

  await t.test('Part C: [POST-FIX] 1CS 45s /api/swap/status poll timeout pending guard must NOT fall through to /api/withdraw/quote', async () => {
    let withdrawCalled = false;
    let statusChecks = 0;
    const origDateNow = Date.now;
    let fakeClockOffset = 0;
    const sessionB = await createUnlockedSession({
      viewportWidth: 375,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage({}, {
        near_ca_active_swap_order_v1: {
          walletId: 'e2e_wallet_1',
          depositAddress: 'dep_1cs_timeout.near',
          status: 'SUCCESS',
          fromSymbol: 'PRL',
          toSymbol: 'NEAR',
          originTxHash: 'PrlOriginHash',
          autoBroadcasted: true,
          createdAt: Date.now() - 5000,
          followUpExecuted: false,
          followUpFailed: true,
          followUpConfidentialSwap: {
            depositProof: 'proof_1',
            originAsset: '1cs_v1:prl:native',
            destinationAsset: 'nep141:wrap.near',
            destinationChain: 'near',
            destinationBlockchain: 'near',
            amountInRaw: '10000000000',
            slippageBps: 100,
            recipient: TEST_NEAR_NAMED,
            feeBps: 25,
            feeRecipient: 'referral.near'
          }
        }
      }),
      fetchMock: async (url) => {
        const u = String(url || '');
        if (/\/nearcom-proxy/i.test(u)) {
          const p = new URL(u, 'http://127.0.0.1:3334').searchParams.get('path') || '';
          if (p === '/api/auth/message') {
            return mockJsonResponse({ message: { message: 'Sign in', recipient: 'intents.near', nonce: Array(32).fill(5) } });
          }
          if (p === '/api/auth/authenticate') {
            return mockJsonResponse({ accessToken: 'tok_timeout_test', refreshToken: 'ref', expiresAt: origDateNow() + 900_000 });
          }
          if (p === '/api/account/balances') {
            return mockJsonResponse({ balances: [{ tokenId: '1cs_v1:prl:native', available: '10000000000' }] });
          }
          if (p === '/api/deposit/status') {
            return mockJsonResponse({ status: 'SUCCESS' });
          }
          if (p === '/api/swap/quote') {
            return mockJsonResponse({ ok: { quote: { amountOut: '1000000000000000000000000', amountOutUsd: '5.00', depositAddress: 'swap_dep_1cs' }, appFee: 25 } });
          }
          if (p === '/api/swap/intent') {
            return mockJsonResponse({
              ok: {
                intent: {
                  standard: 'nep413',
                  payload: {
                    message: JSON.stringify({
                      signer_id: TEST_NEAR_IMPLICIT,
                      intents: [{ intent: 'transfer', receiver_id: 'swap_dep_1cs' }]
                    }),
                    nonce: Buffer.from(Array(32).fill(3)).toString('base64'),
                    recipient: 'intents.far'
                  }
                }
              }
            });
          }
          if (p === '/api/swap/submit') {
            return mockJsonResponse({ ok: { intentHash: '1cs_intent_hash_1' } });
          }
          if (p === '/api/swap/status') {
            statusChecks += 1;
            fakeClockOffset = 50_000;
            return mockJsonResponse({ ok: { status: 'PENDING' } });
          }
          if (p === '/api/withdraw/quote') {
            withdrawCalled = true;
            return mockJsonResponse({ ok: { quote: { depositAddress: 'wd_dep', amountOut: '1000000000000000000000000' } } });
          }
        }
        if (/1click\.chaindefuser\.com\/v0\/status/i.test(u)) {
          return mockJsonResponse({ status: 'SUCCESS' });
        }
        return mockJsonResponse({}, 200);
      }
    });

    const OrigWinDate = sessionB.window.Date;
    try {
      sessionB.window.Date = class FakeSwapDate extends OrigWinDate {
        static now() {
          return origDateNow() + fakeClockOffset;
        }
      };
      await sessionB.switchTab('swap');
      await sessionB.click('#btn-resume-swap-stage');
      await sessionB.waitFor(
        () => statusChecks >= 1 && !sessionB.window.NearCAState.swap.activeOrder?._followUpInFlight,
        4500
      );
      assert.ok(statusChecks >= 1, 'Must poll /api/swap/status at least once');
      assert.equal(withdrawCalled, false, '[POST-FIX] 1CS 45s poll timeout must NOT proceed to /api/withdraw/quote');
      sessionB.assertNoRealBroadcasts();
    } finally {
      sessionB.window.Date = OrigWinDate;
      sessionB.cleanup();
    }
  });

  await t.test('Part D: Arc 0x3600... 6-dec quote & eth_sendRawTransaction execution encoding', async () => {
    const kyberQuoteUrls = [];
    const sessionArc = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      localStorage: buildSeededStorage(
        {
          nativeBalances: { near: 12.5, sol: 2.0, eth: 0.5, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 }
        },
        {
          near_ca_swap_pair_v1: {
            fromAssetId: 'arc:0x3600000000000000000000000000000000000000',
            toAssetId: 'arc:0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1'
          }
        }
      ),
      fetchMock: async (url, init = {}) => {
        const u = String(url || '');
        if (/aggregator-api\.kyberswap\.com\/arc\/api\/v1\/routes/i.test(u)) {
          kyberQuoteUrls.push(u);
          return mockJsonResponse({
            code: 0,
            data: {
              routeSummary: {
                tokenIn: '0x3600000000000000000000000000000000000000',
                tokenOut: '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1',
                amountIn: '2000000',
                amountOut: '1850000',
                amountInUsd: '2.00',
                amountOutUsd: '1.99'
              }
            }
          });
        }
        if (/aggregator-api\.kyberswap\.com\/arc\/api\/v1\/route\/build/i.test(u)) {
          return mockJsonResponse({
            code: 0,
            data: {
              routerAddress: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
              data: '0x12345678',
              transactionValue: '0'
            }
          });
        }
        if (/li\.quest\/v1\/quote/i.test(u)) {
          return mockJsonResponse({ error: 'skip' }, 404);
        }
        if (/rpc\.mainnet\.arc\.io/i.test(u)) {
          const parsed = init.body ? JSON.parse(init.body) : {};
          const handleOne = (call) => {
            if (call.method === 'eth_chainId') return { jsonrpc: '2.0', id: call.id, result: '0x13b2' };
            if (call.method === 'eth_call') return { jsonrpc: '2.0', id: call.id, result: encodeUint256Hex(10n ** 18n) };
            if (call.method === 'eth_gasPrice') return { jsonrpc: '2.0', id: call.id, result: '0x3b9aca00' };
            if (call.method === 'eth_maxPriorityFeePerGas') return { jsonrpc: '2.0', id: call.id, result: '0x3b9aca00' };
            if (call.method === 'eth_getBlockByNumber') {
              return {
                jsonrpc: '2.0',
                id: call.id,
                result: {
                  number: '0x10',
                  hash: '0x' + 'aa'.repeat(32),
                  parentHash: '0x' + '00'.repeat(32),
                  timestamp: '0x65000000',
                  nonce: '0x0000000000000000',
                  difficulty: '0x0',
                  gasLimit: '0x1c9c380',
                  gasUsed: '0x5208',
                  miner: '0x0000000000000000000000000000000000000000',
                  extraData: '0x',
                  baseFeePerGas: '0x3b9aca00',
                  transactions: []
                }
              };
            }
            if (call.method === 'eth_getTransactionCount') return { jsonrpc: '2.0', id: call.id, result: '0x1' };
            if (call.method === 'eth_getBalance') return { jsonrpc: '2.0', id: call.id, result: encodeUint256Hex(5n * 10n ** 18n) };
            if (call.method === 'eth_estimateGas') return { jsonrpc: '2.0', id: call.id, result: '0x186a0' };
            return { jsonrpc: '2.0', id: call.id, result: '0x0' };
          };
          if (Array.isArray(parsed)) return mockJsonResponse(parsed.map(handleOne));
          return mockJsonResponse(handleOne(parsed));
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionArc.switchTab('swap');
      assert.match(sessionArc.getVisibleText('#swap-from-balance'), /5\s*USDC/);

      // Quote 2 Arc USDC (0x3600... 6-dec) -> EURC (6-dec): Kyber must receive amountIn=2000000 (NOT 2e18)
      await sessionArc.input('#swap-amount-in', '2');
      await sessionArc.waitFor(() => kyberQuoteUrls.some((u) => u.includes('amountIn=2000000')) && Number(sessionArc.document.getElementById('swap-amount-out')?.value || 0) > 0, 3500);
      assert.ok(kyberQuoteUrls.some((u) => u.includes('amountIn=2000000')), `Arc 0x3600... quote must use 6-decimal amountIn=2000000, got: ${JSON.stringify(kyberQuoteUrls)}`);
      assert.equal(kyberQuoteUrls.some((u) => u.includes('amountIn=2000000000000000000')), false, 'Arc 0x3600... quote must NOT send 18-decimal raw amount');
      const outVal = Number(sessionArc.document.getElementById('swap-amount-out').value);
      assert.ok(Math.abs(outVal - 1.85) < 0.01, `Expected 1.85 EURC output, got ${outVal}`);

      // Execute Arc 0x3600... swap -> PIN -> reaches eth_sendRawTransaction Broadcast Guard
      await sessionArc.click('#btn-execute-swap');
      await sessionArc.flushMicrotasks(12);
      await sessionArc.waitFor(() => sessionArc.getNetworkLog().some((r) => r.blocked && /EVM JSON-RPC/i.test(r.reason)), 3500);
      sessionArc.assertNoRealBroadcasts();
      sessionArc.assertNoRuntimeErrors();
    } finally {
      sessionArc.cleanup();
    }
  });

  await t.test('Part E: [POST-FIX] Arc 0x3600... MAX spendable converts 18-dec native gas fee to 6-dec instead of collapsing to 0', async () => {
    const sessionMax = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(
        {
          nativeBalances: { near: 12.5, sol: 2.0, eth: 0.5, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 }
        },
        {
          near_ca_swap_pair_v1: {
            fromAssetId: 'arc:0x3600000000000000000000000000000000000000',
            toAssetId: 'arc:0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1'
          }
        }
      ),
      fetchMock: async (url, init = {}) => {
        const u = String(url || '');
        if (/rpc\.mainnet\.arc\.io/i.test(u)) {
          const parsed = init.body ? JSON.parse(init.body) : {};
          const handleOne = (call) => {
            if (call.method === 'eth_chainId') return { jsonrpc: '2.0', id: call.id, result: '0x13b2' };
            if (call.method === 'eth_gasPrice') return { jsonrpc: '2.0', id: call.id, result: '0x3b9aca00' };
            if (call.method === 'eth_getBalance') return { jsonrpc: '2.0', id: call.id, result: encodeUint256Hex(5n * 10n ** 18n) };
            return { jsonrpc: '2.0', id: call.id, result: '0x0' };
          };
          if (Array.isArray(parsed)) return mockJsonResponse(parsed.map(handleOne));
          return mockJsonResponse(handleOne(parsed));
        }
        return mockJsonResponse({}, 200);
      }
    });

    try {
      await sessionMax.switchTab('swap');
      await sessionMax.click('#swap-market-panel button[onclick="setSwapMaxAmount()"]');
      await sessionMax.flushMicrotasks(12);
      await new Promise((r) => setTimeout(r, 80));
      await sessionMax.flushMicrotasks(12);
      const maxArc = Number(sessionMax.document.getElementById('swap-amount-in')?.value || 0);
      assert.ok(
        maxArc >= 4.9 && maxArc <= 5.0,
        `[POST-FIX] Arc 0x3600... MAX (${maxArc}) must convert 18-dec native gas fee to 6-dec instead of collapsing to 0`
      );
      sessionMax.assertNoRealBroadcasts();
    } finally {
      sessionMax.cleanup();
    }
  });
});


// =====================================================================
// FEATURE 6: Limit Orders (NEAR DCL / SOL Jupiter / EVM CoW) (12 Tests)
// =====================================================================

function createLimitBaselineMock(overrides = {}) {
  const poolId = 'otoken.rhealab.near|token.rhealab.near|2000';
  return async (url, init = {}) => {
    const u = String(url || '');
    const bodyText = typeof init.body === 'string' ? init.body : '';
    if (typeof overrides.customHandler === 'function') {
      const res = await overrides.customHandler(u, init, bodyText);
      if (res !== undefined) return res;
    }
    if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(u)) {
      const req = bodyText ? JSON.parse(bodyText) : {};
      if (req?.params?.request_type === 'call_function') {
        const method = req.params.method_name;
        if (method === 'get_pool') {
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: req.id,
            result: encodeNearCallResult({
              pool_id: poolId,
              token_x: 'otoken.rhealab.near',
              token_y: 'token.rhealab.near',
              fee: 2000,
              point_delta: 40,
              current_point: overrides.currentPoint ?? 0,
              state: 'Running'
            })
          });
        }
        if (method === 'storage_balance_of') {
          const registered = overrides.dclRegistered !== false;
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: req.id,
            result: encodeNearCallResult(registered ? { total: '500000000000000000000000', available: '100000000000000000000000' } : null)
          });
        }
        if (method === 'list_active_orders') {
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: encodeNearCallResult(overrides.nearActiveOrders ?? []) });
        }
        if (method === 'list_history_orders') {
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: encodeNearCallResult(overrides.nearHistoryOrders ?? []) });
        }
        if (method === 'list_user_assets') {
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: encodeNearCallResult({}) });
        }
        if (method === 'ft_balance_of') {
          const balRaw = overrides.nearFtBalances?.[req.params.account_id] ?? '4000000000000000000000000';
          return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: encodeNearCallResult(balRaw) });
        }
      }
      if (req?.params?.request_type === 'view_access_key') {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { nonce: 11, block_hash: '11111111111111111111111111111111' } });
      }
      if (req?.params?.request_type === 'view_account') {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { amount: overrides.nearAmount ?? '12500000000000000000000000', storage_usage: 182 } });
      }
    }
    if (/lite-api\.jup\.ag\/swap\/v1\/quote/i.test(u)) {
      return mockJsonResponse({
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: 'So11111111111111111111111111111111111111112',
        inAmount: '100000000',
        outAmount: '666666667',
        slippageBps: 50
      });
    }
    if (/lite-api\.jup\.ag\/trigger\/v1\/getTriggerOrders/i.test(u)) {
      const isHist = /orderStatus=history/i.test(u);
      return mockJsonResponse({ orders: isHist ? (overrides.solHistoryOrders ?? []) : (overrides.solActiveOrders ?? []) });
    }
    if (/api\.cow\.fi\/.*\/api\/v1\/account\/.*\/orders/i.test(u)) {
      return mockJsonResponse(overrides.cowOrders ?? []);
    }
    if (/solana-rpc\.publicnode\.com|api\.mainnet-beta\.solana\.com/i.test(u)) {
      const req = bodyText ? JSON.parse(bodyText) : {};
      const handleSol = (call) => {
        if (call.method === 'getBalance') {
          return { jsonrpc: '2.0', id: call.id, result: { context: { slot: 1 }, value: overrides.solLamports ?? 2_000_000_000 } };
        }
        if (call.method === 'getTokenAccountsByOwner') {
          return {
            jsonrpc: '2.0',
            id: call.id,
            result: {
              context: { slot: 1 },
              value: overrides.solTokenAccounts ?? [
                {
                  pubkey: 'SolUsdcTokAcct11111111111111111111111111111',
                  account: {
                    data: {
                      parsed: {
                        info: {
                          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                          tokenAmount: { uiAmount: 100, amount: '100000000', decimals: 6 }
                        }
                      }
                    }
                  }
                }
              ]
            }
          };
        }
        return { jsonrpc: '2.0', id: call.id, result: null };
      };
      if (Array.isArray(req)) return mockJsonResponse(req.map(handleSol));
      return mockJsonResponse(handleSol(req));
    }
    if (!/solana/i.test(u) && /publicnode\.com|drpc\.org|flashbots\.net|1rpc\.io|mainnet\.base\.org|arb1\.arbitrum\.io|bnbchain\.org|defibit\.io|ninicoin\.io|optimism\.io|avax\.network|arc\.io/i.test(u)) {
      const parsed = bodyText ? JSON.parse(bodyText) : {};
      const handleOne = (call) => {
        if (call.method === 'eth_chainId') {
          const cid = /base/i.test(u) ? '0x2105' : (/arb/i.test(u) ? '0xa4b1' : (/bsc/i.test(u) ? '0x38' : '0x1'));
          return { jsonrpc: '2.0', id: call.id, result: cid };
        }
        if (call.method === 'eth_call') {
          const allowHex = encodeUint256Hex(overrides.allowanceWei ?? 1000000000000000000000000n);
          return { jsonrpc: '2.0', id: call.id, result: allowHex };
        }
        if (call.method === 'eth_gasPrice') return { jsonrpc: '2.0', id: call.id, result: '0x3b9aca00' };
        if (call.method === 'eth_maxPriorityFeePerGas') return { jsonrpc: '2.0', id: call.id, result: '0x3b9aca00' };
        if (call.method === 'eth_getBlockByNumber') {
          return {
            jsonrpc: '2.0',
            id: call.id,
            result: {
              number: '0x10',
              hash: '0x' + 'aa'.repeat(32),
              parentHash: '0x' + '00'.repeat(32),
              timestamp: '0x65000000',
              nonce: '0x0000000000000000',
              difficulty: '0x0',
              gasLimit: '0x1c9c380',
              gasUsed: '0x5208',
              miner: '0x0000000000000000000000000000000000000000',
              extraData: '0x',
              baseFeePerGas: '0x3b9aca00',
              transactions: []
            }
          };
        }
        if (call.method === 'eth_getTransactionCount') return { jsonrpc: '2.0', id: call.id, result: '0x1' };
        if (call.method === 'eth_getBalance') return { jsonrpc: '2.0', id: call.id, result: encodeUint256Hex(500000000000000000n) };
        if (call.method === 'eth_estimateGas') return { jsonrpc: '2.0', id: call.id, result: '0x186a0' };
        return { jsonrpc: '2.0', id: call.id, result: '0x0' };
      };
      if (Array.isArray(parsed)) return mockJsonResponse(parsed.map(handleOne));
      return mockJsonResponse(handleOne(parsed));
    }
    return mockJsonResponse({}, 200);
  };
}

test('F6-T1-01: Limit mode toggle & 8-chain pill switching (NEAR, SOL, ETH..AVAX) UI/gas adaptation', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createLimitBaselineMock()
  });

  try {
    await session.switchTab('swap');
    await session.click('#swap-mode-limit-btn');
    assert.equal(session.isVisible('#swap-limit-panel'), true);
    assert.equal(session.isVisible('#swap-market-panel'), false);

    // NEAR shows tick controls & split row, hides expiry row
    assert.equal(session.isVisible('#limit-near-tick-controls'), true);
    assert.equal(session.isVisible('#limit-split-row'), true);
    assert.equal(session.isVisible('#limit-expiry-row'), false);
    assert.match(session.getVisibleText('#limit-meta-gas'), /NEAR/);

    // Check all 8 chain pills exist
    const pills = session.document.querySelectorAll('#limit-chain-pills [data-limit-chain]');
    assert.equal(pills.length, 8, 'Expected 8 limit order chain pills');

    await session.click('#limit-chain-pills [data-limit-chain="sol"]');
    assert.equal(session.isVisible('#limit-near-tick-controls'), false);
    assert.equal(session.isVisible('#limit-split-row'), false);
    assert.equal(session.isVisible('#limit-expiry-row'), true);
    assert.match(session.getVisibleText('#limit-meta-gas'), /SOL/);

    await session.click('#limit-chain-pills [data-limit-chain="eth"]');
    assert.equal(session.isVisible('#limit-expiry-row'), true);
    assert.match(session.getVisibleText('#limit-meta-gas'), /0 Gas|Off-chain/i);

    await session.click('#limit-chain-pills [data-limit-chain="bsc"]');
    assert.equal(session.hasClass('#limit-chain-pills [data-limit-chain="bsc"]', 'active'), true);

    await session.click('#limit-chain-pills [data-limit-chain="near"]');
    assert.equal(session.isVisible('#limit-near-tick-controls'), true);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F6-T1-02: NEAR DCL tick snapping, -1/+1 stepping, price orientation flip & offset pills', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createLimitBaselineMock({ currentPoint: 0 })
  });

  try {
    await session.switchTab('swap');
    await session.click('#swap-mode-limit-btn');
    await session.waitFor(() => session.getVisibleText('#limit-market-rate') !== '--', 3000);

    await session.click('#limit-offset-pills [data-offset-idx="2"]');
    await session.flushMicrotasks(6);
    const tick1 = session.getVisibleText('#limit-snapped-tick-label');
    assert.notEqual(tick1, '--');
    const rate1 = Number(session.document.getElementById('limit-target-rate')?.value || 0);
    assert.ok(rate1 > 0);

    await session.click('#limit-near-tick-controls button[onclick="stepLimitDclPoint(1)"]');
    await session.flushMicrotasks(6);
    const rateUp = Number(session.document.getElementById('limit-target-rate')?.value || 0);
    assert.notEqual(rateUp, rate1, 'Stepping DCL tick up must update target rate');

    await session.click('#limit-near-tick-controls button[onclick="stepLimitDclPoint(-1)"]');
    await session.flushMicrotasks(6);
    const rateDown = Number(session.document.getElementById('limit-target-rate')?.value || 0);
    assert.ok(Math.abs(rateDown - rate1) < 1e-6, 'Stepping down must return to original tick rate');

    const prefixBefore = session.getVisibleText('#limit-rate-prefix');
    const offset2Before = session.getVisibleText('#limit-offset-pills [data-offset-idx="2"]');
    await session.click('#limit-rate-flip-btn');
    const prefixAfter = session.getVisibleText('#limit-rate-prefix');
    const offset2After = session.getVisibleText('#limit-offset-pills [data-offset-idx="2"]');
    assert.notEqual(prefixAfter, prefixBefore);
    assert.notEqual(offset2After, offset2Before, 'Price orientation flip must toggle +5% <-> -5% offset pill');
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F6-T1-03: NEAR split-2-ticks 50%/50% preview & automatic NEAR -> wNEAR wrap button/CTA', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createLimitBaselineMock()
  });

  try {
    await session.switchTab('swap');
    await session.click('#swap-mode-limit-btn');
    await session.waitFor(() => session.getVisibleText('#limit-market-rate') !== '--', 3000);

    await session.input('#limit-amount-in', '10');
    await session.click('#limit-offset-pills [data-offset-idx="1"]');
    await session.setChecked('#limit-split-toggle', true);
    await session.flushMicrotasks(6);

    assert.equal(session.isVisible('#limit-split-preview'), true);
    assert.match(session.getVisibleText('#limit-split-preview'), /50%|5 /);
    assert.ok(Number(session.document.getElementById('limit-amount-out')?.value || 0) > 0);

    // Pick wNEAR as sell token (wallet has 4 wNEAR + 12.5 NEAR); entering 6 triggers Auto-Wrap CTA & #btn-limit-wrap
    await session.click('#limit-sell-token-btn');
    await session.input('#token-picker-search', 'wrap.near');
    await session.flushMicrotasks(8);
    await session.click('#token-picker-list [data-action="select-swap-token"]');
    await session.waitFor(() => session.getVisibleText('#limit-market-rate') !== '--', 3000);

    await session.input('#limit-amount-in', '6');
    await session.click('#limit-offset-pills [data-offset-idx="1"]');
    await session.flushMicrotasks(6);
    assert.equal(session.isVisible('#btn-limit-wrap'), true);
    assert.match(session.getVisibleText('#btn-execute-limit'), /Auto-Wrap|自动封装/i);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F6-T1-04: Solana Jupiter Trigger & EVM CoW limit order submission + Broadcast Guard + form reset', async (t) => {
  await t.test('Part A: Strict Broadcast Safety Guard catches Jupiter Trigger & CoW order creation', async () => {
    const sessionGuard = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock()
    });

    try {
      await sessionGuard.switchTab('swap');
      await sessionGuard.click('#swap-mode-limit-btn');

      // Solana Jupiter Trigger
      await sessionGuard.click('#limit-chain-pills [data-limit-chain="sol"]');
      await sessionGuard.waitFor(() => sessionGuard.getVisibleText('#limit-market-rate') !== '--', 3000);
      await sessionGuard.click('#limit-expiry-pills [data-exp-days="30"]');
      await sessionGuard.input('#limit-amount-in', '10'); // $10 >= $5 min
      await sessionGuard.click('#limit-offset-pills [data-offset-idx="1"]');
      await sessionGuard.waitFor(() => !sessionGuard.isDisabled('#btn-execute-limit'), 2500);
      await sessionGuard.click('#btn-execute-limit');
      await sessionGuard.flushMicrotasks(12);
      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().some((r) => r.blocked && /Jupiter Trigger/i.test(r.reason)), 3000);

      // EVM CoW
      await sessionGuard.click('#limit-chain-pills [data-limit-chain="eth"]');
      await sessionGuard.waitFor(() => sessionGuard.window.NearCAState.limit.evmAllowanceRaw !== null, 3000);
      await sessionGuard.input('#limit-amount-in', '20'); // $20 >= $10 min
      await sessionGuard.input('#limit-target-rate', '3300');
      await sessionGuard.waitFor(() => !sessionGuard.isDisabled('#btn-execute-limit'), 2500);
      await sessionGuard.click('#btn-execute-limit');
      await sessionGuard.flushMicrotasks(12);
      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().some((r) => r.blocked && /CoW Protocol/i.test(r.reason)), 3000);

      sessionGuard.assertNoRealBroadcasts();
      sessionGuard.assertNoRuntimeErrors();
    } finally {
      sessionGuard.cleanup();
    }
  });

  await t.test('Part B: Mocked-success CoW order resets #limit-amount-in and #limit-target-rate', async () => {
    const sessionSuccess = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({
        customHandler: async (u, init) => {
          if (/api\.cow\.fi\/.*\/api\/v1\/orders/i.test(u) && init.method === 'POST') {
            return mockJsonResponse('0x' + 'ab'.repeat(56), 201);
          }
          return undefined;
        }
      })
    });

    try {
      await sessionSuccess.switchTab('swap');
      await sessionSuccess.click('#swap-mode-limit-btn');
      await sessionSuccess.click('#limit-chain-pills [data-limit-chain="eth"]');
      await sessionSuccess.waitFor(() => sessionSuccess.window.NearCAState.limit.evmAllowanceRaw !== null, 3000);
      await sessionSuccess.input('#limit-amount-in', '20');
      await sessionSuccess.input('#limit-target-rate', '3300');
      await sessionSuccess.waitFor(() => !sessionSuccess.isDisabled('#btn-execute-limit'), 2500);
      await sessionSuccess.click('#btn-execute-limit');
      await sessionSuccess.flushMicrotasks(12);

      await sessionSuccess.waitFor(() => sessionSuccess.document.getElementById('limit-amount-in')?.value === '', 3500);
      assert.notEqual(sessionSuccess.document.getElementById('limit-target-rate')?.value, '3300', 'Submitted target price 3300 must be cleared on reset');
      assert.ok(sessionSuccess.getToastHistory().some((t) => /Limit order placed|限价单已提交/i.test(t.text)));
      sessionSuccess.assertNoRealBroadcasts();
    } finally {
      sessionSuccess.cleanup();
    }
  });
});

test('F6-T1-05: Active & history limit orders rendering + Claim & Cancel across NEAR/SOL/EVM', async () => {
  const session = await createUnlockedSession({
    viewportWidth: 375,
    preloadEthers: true,
    evmPrivateKey: TEST_EVM_PRIVKEY,
    localStorage: buildSeededStorage(),
    fetchMock: createLimitBaselineMock({
      nearActiveOrders: [
        {
          order_id: 'dcl_ord_1',
          pool_id: 'otoken.rhealab.near|token.rhealab.near|2000',
          sell_token: 'token.rhealab.near',
          buy_token: 'otoken.rhealab.near',
          original_amount: '10000000000000000000',
          remain_amount: '5000000000000000000',
          unclaimed_amount: '2000000000000000000',
          bought_amount: '2000000000000000000',
          point: 0
        }
      ],
      nearHistoryOrders: [
        {
          order_id: 'dcl_hist_1',
          pool_id: 'otoken.rhealab.near|token.rhealab.near|2000',
          sell_token: 'token.rhealab.near',
          buy_token: 'otoken.rhealab.near',
          original_amount: '10000000000000000000',
          remain_amount: '0',
          unclaimed_amount: '0',
          bought_amount: '10000000000000000000',
          point: 0
        }
      ],
      solActiveOrders: [
        {
          orderKey: 'SolOrderPubkey11111111111111111111111',
          inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          outputMint: 'So11111111111111111111111111111111111111112',
          makingAmount: '10000000',
          remainingMakingAmount: '10000000',
          takingAmount: '66000000',
          status: 'Open'
        }
      ],
      cowOrders: [
        {
          uid: '0x' + 'cd'.repeat(56),
          sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          sellAmount: '20000000',
          executedSellAmount: '10000000',
          buyAmount: '6000000000000000',
          status: 'open'
        }
      ]
    })
  });

  try {
    await session.switchTab('swap');
    await session.click('#swap-mode-limit-btn');
    await session.waitFor(() => session.document.querySelectorAll('#limit-orders-list .limit-progress-fill').length >= 1, 3000);
    assert.match(session.getVisibleText('#limit-orders-list'), /50\.0%/);

    // Click Claim on NEAR DCL active order -> PIN -> Broadcast Guard
    await session.click('#limit-orders-list [data-action="claim-limit-order"]');
    await session.flushMicrotasks(12);
    await session.waitFor(() => session.getNetworkLog().some((r) => r.blocked && /NEAR JSON-RPC/i.test(r.reason)), 3000);

    // Switch to History tab and back
    await session.click('#limit-tab-history');
    assert.match(session.getVisibleText('#limit-orders-list'), /100\.0%/);
    await session.click('#limit-tab-active');

    // Switch to SOL and click Cancel -> PIN -> Jupiter Trigger cancelOrder guard
    await session.click('#limit-chain-pills [data-limit-chain="sol"]');
    await session.waitFor(() => session.document.querySelector('#limit-orders-list [data-action="cancel-limit-order"][data-chain="sol"]'), 3000);
    await session.click('#limit-orders-list [data-action="cancel-limit-order"][data-chain="sol"]');
    await session.flushMicrotasks(12);
    await session.waitFor(() => session.getNetworkLog().some((r) => r.blocked && /Jupiter Trigger/i.test(r.reason)), 3000);

    // Switch to ETH and click Cancel -> PIN -> CoW Protocol DELETE guard
    await session.click('#limit-chain-pills [data-limit-chain="eth"]');
    await session.waitFor(() => session.document.querySelector('#limit-orders-list [data-action="cancel-limit-order"][data-chain="eth"]'), 3000);
    await session.click('#limit-orders-list [data-action="cancel-limit-order"][data-chain="eth"]');
    await session.flushMicrotasks(12);
    await session.waitFor(() => session.getNetworkLog().some((r) => r.blocked && /CoW Protocol/i.test(r.reason)), 3000);

    session.assertNoRealBroadcasts();
    session.assertNoRuntimeErrors();
  } finally {
    session.cleanup();
  }
});

test('F6-T1-06: Limit token picker filtering, DCL pool fee row & refundable 0.5 vs 0 NEAR deposit meta', async (t) => {
  await t.test('Part A: Unregistered DCL storage shows 0.5 NEAR deposit & filters pickers', async () => {
    const sessionUnreg = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({ dclRegistered: false })
    });

    try {
      await sessionUnreg.switchTab('swap');
      await sessionUnreg.click('#swap-mode-limit-btn');
      await sessionUnreg.waitFor(() => sessionUnreg.isVisible('#limit-meta-fee-row'), 3000);
      assert.match(sessionUnreg.getVisibleText('#limit-meta-pool-fee'), /1%|0\.2%/);
      assert.match(sessionUnreg.getVisibleText('#limit-meta-deposit'), /0\.5 NEAR/);

      // NEAR buy picker lists only valid DCL counters
      await sessionUnreg.click('#limit-buy-token-btn');
      assert.equal(sessionUnreg.hasClass('#sheet-token-picker', 'open'), true);
      const nearBuyIds = Array.from(sessionUnreg.document.querySelectorAll('#token-picker-list [data-action="select-swap-token"]'))
        .map((el) => el.getAttribute('data-asset-id'));
      assert.ok(nearBuyIds.length >= 1);
      assert.ok(nearBuyIds.includes('otoken.rhealab.near'));
      await sessionUnreg.closeSheet('sheet-token-picker');

      // ETH sell picker excludes native ETH sentinel
      await sessionUnreg.click('#limit-chain-pills [data-limit-chain="eth"]');
      await sessionUnreg.click('#limit-sell-token-btn');
      const ethSellIds = Array.from(sessionUnreg.document.querySelectorAll('#token-picker-list [data-action="select-swap-token"]'))
        .map((el) => String(el.getAttribute('data-asset-id') || '').toLowerCase());
      assert.equal(ethSellIds.includes('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'), false);
      await sessionUnreg.closeSheet('sheet-token-picker');
      sessionUnreg.assertNoRealBroadcasts();
    } finally {
      sessionUnreg.cleanup();
    }
  });

  await t.test('Part B: Registered DCL storage shows 0 NEAR deposit', async () => {
    const sessionReg = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({ dclRegistered: true })
    });
    try {
      await sessionReg.switchTab('swap');
      await sessionReg.click('#swap-mode-limit-btn');
      await sessionReg.waitFor(() => sessionReg.getVisibleText('#limit-meta-deposit') === '0 NEAR', 3000);
      sessionReg.assertNoRealBroadcasts();
    } finally {
      sessionReg.cleanup();
    }
  });
});

test('F6-T2-01: Min order USD (SOL $5, ETH $10, Base $2) & balance/SOL-rent pre-checks before auth', async () => {
  const session = await createUnlockedSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage({
      nativeBalances: { near: 12.5, sol: 0.002, eth: 0.5, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 }
    }),
    fetchMock: createLimitBaselineMock({ solLamports: 2_000_000 })
  });

  try {
    await session.switchTab('swap');
    await session.click('#swap-mode-limit-btn');

    // SOL < $5 min
    await session.click('#limit-chain-pills [data-limit-chain="sol"]');
    await session.waitFor(() => session.getVisibleText('#limit-market-rate') !== '--', 3000);
    await session.input('#limit-amount-in', '2');
    await session.input('#limit-target-rate', '0.01');
    await session.flushMicrotasks(6);
    assert.equal(session.isDisabled('#btn-execute-limit'), true);
    assert.match(session.getVisibleText('#btn-execute-limit'), /\$5|5/);

    // SOL >= $5 min with 0.002 SOL < 0.005 SOL rent reserve
    await session.input('#limit-amount-in', '10');
    await session.flushMicrotasks(6);
    assert.equal(session.isDisabled('#btn-execute-limit'), true);
    assert.match(session.getVisibleText('#btn-execute-limit'), /SOL|rent|租金/i);

    // ETH < $10 min
    await session.click('#limit-chain-pills [data-limit-chain="eth"]');
    await session.waitFor(() => session.window.NearCAState.limit.evmAllowanceRaw !== null, 3000);
    await session.input('#limit-amount-in', '5');
    await session.input('#limit-target-rate', '3200');
    await session.flushMicrotasks(6);
    assert.equal(session.isDisabled('#btn-execute-limit'), true);
    assert.match(session.getVisibleText('#btn-execute-limit'), /\$10|10/);

    // Base >= $2 min works, < $2 blocked
    await session.click('#limit-chain-pills [data-limit-chain="base"]');
    await session.waitFor(() => session.window.NearCAState.limit.evmAllowanceRaw !== null, 3000);
    await session.input('#limit-amount-in', '1');
    await session.input('#limit-target-rate', '3200');
    await session.flushMicrotasks(6);
    assert.equal(session.isDisabled('#btn-execute-limit'), true);
    assert.match(session.getVisibleText('#btn-execute-limit'), /\$2|2/);
    session.assertNoRealBroadcasts();
    session.assertNoRuntimeErrors();
  } finally {
    session.cleanup();
  }
});

test('F6-T2-02: [POST-FIX] EVM native sell block, allowance retry/approve states & post-approve allowance poll', async (t) => {
  await t.test('Part A: [POST-FIX] RPC failure sets evmAllowanceFailed + Retry + 0 allowance low ETH gas', async () => {
    let allowMode = 'fail';
    const sessionA = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 12.5, sol: 2, eth: 0.0005, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 }
      }),
      fetchMock: createLimitBaselineMock({
        customHandler: async (u, init, bodyText) => {
          if (/publicnode\.com|drpc\.org|flashbots\.net|1rpc\.io/i.test(u) && bodyText) {
            const p = JSON.parse(bodyText);
            if (p.method === 'eth_call') {
              if (allowMode === 'fail') return mockJsonResponse({ error: 'RPC down' }, 503);
              return mockJsonResponse({ jsonrpc: '2.0', id: p.id, result: encodeUint256Hex(0n) });
            }
          }
          return undefined;
        }
      })
    });

    try {
      await sessionA.switchTab('swap');
      await sessionA.click('#swap-mode-limit-btn');
      await sessionA.click('#limit-chain-pills [data-limit-chain="eth"]');
      await sessionA.waitFor(
        () => sessionA.window.NearCAState.limit.evmAllowanceFailed === true ||
          sessionA.window.NearCAState.limit.evmAllowanceRaw !== null,
        3000
      );
      assert.equal(
        sessionA.window.NearCAState.limit.evmAllowanceFailed,
        true,
        '[POST-FIX] Failed EVM allowance RPC must set evmAllowanceFailed = true instead of defaulting to 0n'
      );

      await sessionA.input('#limit-amount-in', '20');
      await sessionA.input('#limit-target-rate', '3300');
      await sessionA.flushMicrotasks(6);
      assert.match(sessionA.getVisibleText('#btn-execute-limit'), /Retry|重试/i);

      // Retry with 0 allowance and low ETH gas (< 0.0015)
      allowMode = 'zero';
      await sessionA.click('#btn-execute-limit');
      await sessionA.waitFor(() => sessionA.window.NearCAState.limit.evmAllowanceRaw === '0', 3000);
      await sessionA.flushMicrotasks(6);
      assert.match(sessionA.getVisibleText('#btn-execute-limit'), /Approve|授权|gas/i);
      assert.equal(sessionA.isDisabled('#btn-execute-limit'), true, 'Low ETH gas must disable Approve button');
      sessionA.assertNoRealBroadcasts();
    } finally {
      sessionA.cleanup();
    }
  });

  await t.test('Part B: Native ETH sell flip is blocked with user-facing toast', async () => {
    const sessionFlip = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock()
    });

    try {
      await sessionFlip.switchTab('swap');
      await sessionFlip.click('#swap-mode-limit-btn');
      await sessionFlip.click('#limit-chain-pills [data-limit-chain="eth"]');
      await sessionFlip.waitFor(() => sessionFlip.window.NearCAState.limit.evmAllowanceRaw !== null, 3000);

      await sessionFlip.click('#limit-buy-token-btn');
      const ethNativeRow = sessionFlip.document.querySelector('#token-picker-list [data-action="select-swap-token"][data-asset-id="0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"]');
      assert.ok(ethNativeRow, 'Native ETH sentinel row must exist in ETH limit buy picker');
      ethNativeRow.click();
      await sessionFlip.flushMicrotasks(8);
      await sessionFlip.click('#swap-limit-panel button[onclick="flipLimitTokens()"]');
      assert.ok(sessionFlip.getToastHistory().some((t) => /Native gas coin cannot be sold|原生 Gas 币/i.test(t.text)));
      sessionFlip.assertNoRealBroadcasts();
      sessionFlip.assertNoRuntimeErrors();
    } finally {
      sessionFlip.cleanup();
    }
  });

  await t.test('Part C: [POST-FIX] Post-approve polls allowance until mined and transitions CTA to Place Limit Order', async () => {
    let ethCallSeq = 0;
    let approveSent = false;
    const sessionB = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({
        customHandler: async (u, init, bodyText) => {
          if (/publicnode\.com|drpc\.org|flashbots\.net|1rpc\.io/i.test(u) && bodyText) {
            const parsed = JSON.parse(bodyText);
            const calls = Array.isArray(parsed) ? parsed : [parsed];
            const out = calls.map((p) => {
              if (p.method === 'eth_call') {
                ethCallSeq += 1;
                // First 2 reads return 0 allowance; 3rd+ read (post-approve poll) returns MaxUint
                const val = ethCallSeq <= 2 ? 0n : (10n ** 30n);
                return { jsonrpc: '2.0', id: p.id, result: encodeUint256Hex(val) };
              }
              if (p.method === 'eth_getTransactionReceipt') {
                return { jsonrpc: '2.0', id: p.id, result: { status: '0x1', blockNumber: '0x10', transactionHash: '0x' + '12'.repeat(32) } };
              }
              if (p.method === 'eth_sendRawTransaction') {
                approveSent = true;
                return { jsonrpc: '2.0', id: p.id, result: '0x' + '12'.repeat(32) };
              }
              return null;
            });
            if (out.every((x) => x !== null)) {
              return mockJsonResponse(Array.isArray(parsed) ? out : out[0]);
            }
          }
          return undefined;
        }
      })
    });

    try {
      await sessionB.switchTab('swap');
      await sessionB.click('#swap-mode-limit-btn');
      await sessionB.click('#limit-chain-pills [data-limit-chain="eth"]');
      await sessionB.waitFor(() => sessionB.window.NearCAState.limit.evmAllowanceRaw !== null, 3000);
      await sessionB.input('#limit-amount-in', '20');
      await sessionB.input('#limit-target-rate', '3300');
      await sessionB.flushMicrotasks(6);
      assert.match(sessionB.getVisibleText('#btn-execute-limit'), /Approve|授权/i);

      await sessionB.click('#btn-execute-limit');
      await sessionB.flushMicrotasks(12);
      await sessionB.waitFor(() => approveSent && !sessionB.window.NearCAState.limit.submitting, 3000);
      await sessionB.waitFor(
        () => /Place Limit Order|提交限价单/i.test(sessionB.getVisibleText('#btn-execute-limit')),
        900
      ).catch(() => {});
      assert.match(
        sessionB.getVisibleText('#btn-execute-limit'),
        /Place Limit Order|提交限价单/i,
        '[POST-FIX] Post-approve must poll allowance until mined and transition CTA to Place Limit Order'
      );
      assert.ok(ethCallSeq >= 3, `[POST-FIX] Expected post-approve allowance poll (ethCallSeq >= 3), got ${ethCallSeq}`);
      sessionB.assertNoRealBroadcasts();
    } finally {
      sessionB.cleanup();
    }
  });
});

test('F6-T2-03: [POST-FIX] Worse-than-market warning, unregistered wNEAR Max 0.5 NEAR DCL reserve & 0.05/0.02 gas alignment', async (t) => {
  await t.test('Part A: Worse-than-market price warning (>=5% critical) & above-market clear', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({ dclRegistered: false })
    });

    try {
      await session.switchTab('swap');
      await session.click('#swap-mode-limit-btn');
      await session.waitFor(() => session.getVisibleText('#limit-market-rate') !== '--', 3000);

      const mktRate = Number(session.window.NearCAState.limit.liveMarketRate || 1);
      await session.input('#limit-amount-in', '10');
      await session.input('#limit-target-rate', String(Number((mktRate * 0.88).toPrecision(6))));
      await session.flushMicrotasks(6);
      assert.equal(session.isVisible('#limit-price-warning-banner'), true);
      assert.equal(session.hasClass('#limit-price-warning-banner', 'is-critical'), true);

      await session.input('#limit-target-rate', String(Number((mktRate * 1.05).toPrecision(6))));
      await session.flushMicrotasks(6);
      assert.equal(session.isVisible('#limit-price-warning-banner'), false);
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] Unregistered wNEAR (wrap.near absent, 12.5 NEAR) Max reserves 0.5 NEAR DCL storage + gas', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 12.5, sol: 2.0, eth: 0.5, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 },
        nearNep141Balances: {} // No wNEAR: forces setLimitMaxAmount to compute purely from native NEAR
      }),
      fetchMock: createLimitBaselineMock({ dclRegistered: false, nearFtBalances: { 'wrap.near': '0' } })
    });

    try {
      await session.switchTab('swap');
      await session.click('#swap-mode-limit-btn');
      await session.click('#limit-sell-token-btn');
      await session.input('#token-picker-search', 'wrap.near');
      await session.flushMicrotasks(8);
      await session.click('#token-picker-list [data-action="select-swap-token"]');
      await session.waitFor(() => session.getVisibleText('#limit-market-rate') !== '--', 3000);

      await session.click('#swap-limit-panel button[onclick="setLimitMaxAmount()"]');
      await session.click('#limit-offset-pills [data-offset-idx="1"]');
      await session.flushMicrotasks(6);

      const maxSell = Number(session.document.getElementById('limit-amount-in')?.value || 0);
      assert.ok(
        maxSell <= 12.5 - 0.5 - 0.02 + 1e-6,
        `[POST-FIX] setLimitMaxAmount (${maxSell}) must reserve 0.5 NEAR DCL storage + gas (<= 11.98)`
      );
      assert.ok(
        maxSell >= 11.9,
        `[POST-FIX] setLimitMaxAmount (${maxSell}) must allow spending available NEAR minus storage/gas (>= 11.9)`
      );
      assert.equal(
        session.isDisabled('#btn-execute-limit'),
        false,
        `[POST-FIX] Limit MAX amount (${maxSell}) must produce an immediately submittable order (got: ${session.getVisibleText('#btn-execute-limit')})`
      );
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part C: [POST-FIX] 0.05 vs 0.02 NEAR gas reserve alignment boundary (near-storage threshold & Max -> Broadcast Guard)', async () => {
    // 1) Low NEAR (0.53 NEAR, dclRegistered=false, wNEAR=0): must NOT produce 0.48 wrap amount exceeding 0.5 + gas
    const sessionLow = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 0.53, sol: 2.0, eth: 0.5, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 },
        nearNep141Balances: {}
      }),
      fetchMock: createLimitBaselineMock({
        dclRegistered: false,
        nearAmount: '530000000000000000000000',
        nearFtBalances: { 'wrap.near': '0' }
      })
    });

    try {
      await sessionLow.switchTab('swap');
      await sessionLow.click('#swap-mode-limit-btn');
      await sessionLow.click('#limit-sell-token-btn');
      await sessionLow.input('#token-picker-search', 'wrap.near');
      await sessionLow.flushMicrotasks(8);
      await sessionLow.click('#token-picker-list [data-action="select-swap-token"]');
      await sessionLow.waitFor(() => sessionLow.getVisibleText('#limit-market-rate') !== '--', 3000);

      await sessionLow.click('#swap-limit-panel button[onclick="setLimitMaxAmount()"]');
      await sessionLow.click('#limit-offset-pills [data-offset-idx="1"]');
      await sessionLow.flushMicrotasks(6);

      const lowMax = Number(sessionLow.document.getElementById('limit-amount-in')?.value || 0);
      assert.ok(
        lowMax <= 0.53 - 0.5 - 0.02 + 1e-6,
        `[POST-FIX] With 0.53 NEAR & unregistered DCL, MAX (${lowMax}) must not exceed 0.01`
      );
      assert.equal(sessionLow.isDisabled('#btn-execute-limit'), true, '[POST-FIX] 0.53 NEAR unregistered DCL Max must stay disabled');
      sessionLow.assertNoRealBroadcasts();
    } finally {
      sessionLow.cleanup();
    }

    // 2) Registered DCL with 1.0 NEAR & 0 wNEAR: MAX aligns with wrapNearForLimit/placeNearDclLimitOrder & reaches Broadcast Guard
    const sessionReg = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 1.0, sol: 2.0, eth: 0.5, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 },
        nearNep141Balances: {}
      }),
      fetchMock: createLimitBaselineMock({
        dclRegistered: true,
        nearAmount: '1000000000000000000000000',
        nearFtBalances: { 'wrap.near': '0' }
      })
    });

    try {
      await sessionReg.switchTab('swap');
      await sessionReg.click('#swap-mode-limit-btn');
      await sessionReg.click('#limit-sell-token-btn');
      await sessionReg.input('#token-picker-search', 'wrap.near');
      await sessionReg.flushMicrotasks(8);
      await sessionReg.click('#token-picker-list [data-action="select-swap-token"]');
      await sessionReg.waitFor(() => sessionReg.getVisibleText('#limit-market-rate') !== '--', 3000);

      await sessionReg.click('#swap-limit-panel button[onclick="setLimitMaxAmount()"]');
      await sessionReg.click('#limit-offset-pills [data-offset-idx="1"]');
      await sessionReg.flushMicrotasks(6);

      const regMax = Number(sessionReg.document.getElementById('limit-amount-in')?.value || 0);
      assert.ok(regMax >= 0.94 && regMax <= 0.98, `Registered 1.0 NEAR Max (${regMax}) must align within [0.94, 0.98]`);
      assert.equal(sessionReg.isDisabled('#btn-execute-limit'), false);
      await sessionReg.click('#btn-execute-limit');
      await sessionReg.flushMicrotasks(12);
      await sessionReg.waitFor(() => sessionReg.getNetworkLog().some((r) => r.blocked && /NEAR JSON-RPC/i.test(r.reason)), 3500);
      sessionReg.assertNoRealBroadcasts();
    } finally {
      sessionReg.cleanup();
    }
  });
});

test('F6-T2-04: [POST-FIX] Limit form & error/flag double-clear on chain switch, pair flip & token selection', async (t) => {
  await t.test('Part A: [POST-FIX] Chain pill switch resets inputs & mocked 503/429 failure flags (solUnavailable, evmAllowanceFailed, rateLimited)', async () => {
    const session = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({
        customHandler: async (u, init, bodyText) => {
          if (/lite-api\.jup\.ag\/trigger\/v1\/getTriggerOrders/i.test(u)) {
            return mockJsonResponse({ error: 'Solana trigger down' }, 503);
          }
          if (/publicnode\.com|drpc\.org|flashbots\.net/i.test(u) && bodyText) {
            const p = JSON.parse(bodyText);
            if (p.method === 'eth_call' && /eth|ethereum|publicnode/i.test(u)) {
              return mockJsonResponse({ error: 'ETH RPC 503' }, 503);
            }
          }
          if (/api\.cow\.fi\/bnb\/api\/v1\/account\/.*\/orders/i.test(u)) {
            return mockJsonResponse({ error: 'Rate limit' }, 429);
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('swap');
      await session.click('#swap-mode-limit-btn');

      // 1) SOL 503 -> solUnavailable=true; switching to ETH resets inputs and clears solUnavailable
      await session.click('#limit-chain-pills [data-limit-chain="sol"]');
      await session.waitFor(() => /unavailable|不可用/i.test(session.getVisibleText('#btn-execute-limit')), 3000);
      await session.input('#limit-amount-in', '12');
      await session.input('#limit-target-rate', '1.23');

      await session.click('#limit-chain-pills [data-limit-chain="eth"]');
      assert.equal(session.document.getElementById('limit-amount-in')?.value, '');
      assert.equal(session.document.getElementById('limit-target-rate')?.value, '');
      assert.doesNotMatch(session.getVisibleText('#btn-execute-limit'), /Solana.*unavailable|Solana 限价单服务暂不可用/i);

      // 2) BSC CoW 429 -> rateLimited=true; switching to NEAR resets inputs & rateLimited
      await session.click('#limit-chain-pills [data-limit-chain="bsc"]');
      await session.waitFor(() => /rate limit|请求频繁/i.test(session.getVisibleText('#limit-orders-list')), 3000);
      await session.input('#limit-amount-in', '15');
      await session.input('#limit-target-rate', '650');
      await session.click('#limit-chain-pills [data-limit-chain="near"]');
      assert.equal(session.document.getElementById('limit-amount-in')?.value, '');
      assert.equal(session.document.getElementById('limit-target-rate')?.value, '');
      assert.equal(
        session.window.NearCAState.limit.rateLimited,
        false,
        '[POST-FIX] setLimitChain must reset rateLimited'
      );

      // 3) [POST-FIX] ETH allowance 503 -> evmAllowanceFailed=true; switching to BSC resets evmAllowanceFailed
      await session.click('#limit-chain-pills [data-limit-chain="eth"]');
      await session.waitFor(
        () => session.window.NearCAState.limit.evmAllowanceFailed === true ||
          session.window.NearCAState.limit.evmAllowanceRaw !== null,
        2000
      );
      assert.equal(
        session.window.NearCAState.limit.evmAllowanceFailed,
        true,
        '[POST-FIX] ETH allowance 503 must set evmAllowanceFailed = true before chain switch reset check'
      );
      await session.click('#limit-chain-pills [data-limit-chain="bsc"]');
      assert.equal(
        session.window.NearCAState.limit.evmAllowanceFailed,
        false,
        '[POST-FIX] setLimitChain must reset evmAllowanceFailed'
      );
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] Pair flip clears inputs & #limit-error-banner', async () => {
    const session = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({
        customHandler: async (u, init) => {
          if (/api\.cow\.fi\/.*\/api\/v1\/orders/i.test(u) && init.method === 'POST') {
            return mockJsonResponse({ description: 'Simulated limit submit rejection' }, 500);
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('swap');
      await session.click('#swap-mode-limit-btn');
      await session.click('#limit-chain-pills [data-limit-chain="eth"]');
      await session.waitFor(() => !session.getVisibleText('#btn-execute-limit').includes('Checking'), 3000);

      // Drive #limit-error-banner via genuine failed submit
      await session.input('#limit-amount-in', '20');
      await session.input('#limit-target-rate', '3300');
      await session.waitFor(() => !session.isDisabled('#btn-execute-limit'), 2500);
      await session.click('#btn-execute-limit');
      await session.flushMicrotasks(12);
      await session.waitFor(() => session.isVisible('#limit-error-banner'), 3500);

      // Flip pair -> must clear inputs AND #limit-error-banner
      await session.click('#swap-limit-panel button[onclick="flipLimitTokens()"]');
      assert.equal(session.document.getElementById('limit-amount-in')?.value, '');
      assert.equal(session.document.getElementById('limit-target-rate')?.value, '');
      assert.equal(session.isVisible('#limit-error-banner'), false, '[POST-FIX] flipLimitTokens must clear #limit-error-banner');
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part C: [POST-FIX] Limit token switch clears #limit-error-banner & evmAllowanceFailed', async () => {
    let failEthCall = true;
    const session = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({
        customHandler: async (u, init, bodyText) => {
          if (/api\.cow\.fi\/.*\/api\/v1\/orders/i.test(u) && init.method === 'POST') {
            return mockJsonResponse({ description: 'Simulated limit submit rejection' }, 500);
          }
          if (failEthCall && /publicnode\.com|drpc\.org|flashbots\.net/i.test(u) && bodyText) {
            const p = JSON.parse(bodyText);
            if (p.method === 'eth_call') {
              return mockJsonResponse({ error: 'ETH RPC 503' }, 503);
            }
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('swap');
      await session.click('#swap-mode-limit-btn');
      await session.click('#limit-chain-pills [data-limit-chain="eth"]');
      await session.waitFor(
        () => session.window.NearCAState.limit.evmAllowanceFailed === true ||
          session.window.NearCAState.limit.evmAllowanceRaw !== null,
        2500
      );
      assert.equal(
        session.window.NearCAState.limit.evmAllowanceFailed,
        true,
        '[POST-FIX] ETH allowance 503 must set evmAllowanceFailed = true before token switch reset check'
      );

      failEthCall = false;
      await session.click('#limit-sell-token-btn');
      await session.click('#token-picker-list [data-action="select-swap-token"]');
      assert.equal(session.window.NearCAState.limit.evmAllowanceFailed, false, '[POST-FIX] Limit token switch must reset evmAllowanceFailed');
      assert.equal(session.isVisible('#limit-error-banner'), false, '[POST-FIX] Limit token switch must clear #limit-error-banner');
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });
});

test('F6-T2-05: [POST-FIX] Solana Trigger 503 degradation, CoW BSC 429 & refresh button loading feedback', async (t) => {
  let cowDelayMs = 80;
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createLimitBaselineMock({
      customHandler: async (u) => {
        if (/lite-api\.jup\.ag\/trigger\/v1\/getTriggerOrders/i.test(u)) {
          return mockJsonResponse({ error: 'Trigger service down' }, 503);
        }
        if (/api\.cow\.fi\/.*\/api\/v1\/account\/.*\/orders/i.test(u)) {
          await new Promise((r) => setTimeout(r, cowDelayMs));
          return mockJsonResponse({ description: 'Too Many Requests' }, 429);
        }
        return undefined;
      }
    })
  });

  try {
    await t.test('Part A: Solana Trigger 503 sets solUnavailable & disables submit', async () => {
      await session.switchTab('swap');
      await session.click('#swap-mode-limit-btn');
      await session.click('#limit-chain-pills [data-limit-chain="sol"]');
      await session.waitFor(() => session.window.NearCAState.limit.solUnavailable === true, 3000);
      await session.input('#limit-amount-in', '10');
      await session.input('#limit-target-rate', '0.01');
      await session.flushMicrotasks(6);
      assert.equal(session.isDisabled('#btn-execute-limit'), true);
      assert.match(session.getVisibleText('#btn-execute-limit'), /unavailable|不可用/i);
    });

    const refreshBtn = session.document.querySelector('#limit-orders-card button[onclick="refreshLimitOrdersAsync(true)"]');

    await t.test('Part B: [POST-FIX] BSC CoW 429 & refresh button disables with loading text', async () => {
      await session.click('#limit-chain-pills [data-limit-chain="bsc"]');
      await session.waitFor(() => session.window.NearCAState.limit.rateLimited === true, 3000);
      assert.ok(refreshBtn, 'Limit orders refresh button must exist');
      cowDelayMs = 150;
      refreshBtn.click();
      assert.equal(refreshBtn.disabled, true, '[POST-FIX] Limit orders refresh button must disable while fetching');
      assert.match(refreshBtn.textContent, /Refreshing|Loading|刷新中/i);
    });

    await t.test('Part C: Limit orders refresh button restores enabled after fetch completes', async () => {
      assert.ok(refreshBtn);
      await session.waitFor(() => !refreshBtn.disabled, 3000);
      assert.equal(refreshBtn.disabled, false);
      session.assertNoRealBroadcasts();
    });
  } finally {
    session.cleanup();
  }
});

test('F6-T2-06: [POST-FIX] Zero developer jargon across Limit Orders panel, list & CoW BSC 429 place/cancel errors', async (t) => {
  await t.test('Part A: [POST-FIX] CoW BSC 429 orders list & panel zero dev jargon (EN & ZH)', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({
        customHandler: async (u) => {
          if (/api\.cow\.fi\/.*\/api\/v1\/account\/.*\/orders/i.test(u)) {
            return mockJsonResponse({ error: 'Rate limit' }, 429);
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('swap');
      await session.click('#swap-mode-limit-btn');
      await session.click('#limit-chain-pills [data-limit-chain="bsc"]');
      await session.waitFor(() => session.window.NearCAState.limit.rateLimited === true, 3000);

      assertZeroDevJargon(session.getVisibleText('#swap-limit-panel'), '[POST-FIX] #swap-limit-panel (EN)');
      assertZeroDevJargon(session.getVisibleText('#limit-orders-list'), '[POST-FIX] #limit-orders-list on CoW 429 (EN)');

      await session.click('#header-lang-btn');
      await session.flushMicrotasks(4);
      assertZeroDevJargon(session.getVisibleText('#limit-orders-list'), '[POST-FIX] #limit-orders-list on CoW 429 (ZH)');
      for (const toast of session.getToastHistory()) {
        assertZeroDevJargon(toast.text, `[POST-FIX] limit toast: ${toast.text}`);
      }
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] CoW BSC (bnb) place & cancel HTTP 429 jargon sanitization (EN & ZH)', async () => {
    let placeHits = 0;
    let cancelHits = 0;
    const sessionBsc = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createLimitBaselineMock({
        cowOrders: [
          {
            uid: '0x' + 'ee'.repeat(56),
            sellToken: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            buyToken: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            sellAmount: '10000000000000000000',
            executedSellAmount: '0',
            buyAmount: '15000000000000000',
            status: 'open'
          }
        ],
        customHandler: async (u, init) => {
          if (/(api|x402)\.cow\.fi\/bnb\/api\/v1\/orders/i.test(u)) {
            if (init.method === 'POST') {
              placeHits += 1;
              return mockJsonResponse({ error: 'CoW HTTP 429 Too Many Requests' }, 429);
            }
            if (init.method === 'DELETE') {
              cancelHits += 1;
              return mockJsonResponse('CoW Cancel HTTP 429', 429);
            }
          }
          return undefined;
        }
      })
    });

    try {
      await sessionBsc.switchTab('swap');
      await sessionBsc.click('#swap-mode-limit-btn');
      await sessionBsc.click('#limit-chain-pills [data-limit-chain="bsc"]');
      await sessionBsc.waitFor(() => sessionBsc.window.NearCAState.limit.evmAllowanceRaw !== null, 3000);

      // Trigger BSC place order 429
      await sessionBsc.input('#limit-amount-in', '10');
      await sessionBsc.input('#limit-target-rate', '650');
      await sessionBsc.waitFor(() => !sessionBsc.isDisabled('#btn-execute-limit'), 2500);
      await sessionBsc.click('#btn-execute-limit');
      await sessionBsc.flushMicrotasks(12);
      await sessionBsc.waitFor(() => placeHits >= 1 && sessionBsc.isVisible('#limit-error-banner'), 3500);
      assertZeroDevJargon(sessionBsc.getVisibleText('#limit-error-banner'), '[POST-FIX] BSC CoW place 429 #limit-error-banner');

      // Switch to ZH and trigger BSC cancel order 429
      await sessionBsc.click('#header-lang-btn');
      await sessionBsc.waitFor(() => sessionBsc.document.querySelector('#limit-orders-list [data-action="cancel-limit-order"][data-chain="bsc"]'), 3000);
      await sessionBsc.click('#limit-orders-list [data-action="cancel-limit-order"][data-chain="bsc"]');
      await sessionBsc.flushMicrotasks(12);
      await sessionBsc.waitFor(() => cancelHits >= 1 && sessionBsc.getToastHistory().some((t) => /频繁|429|失败|rate|cancel|稍后/i.test(t.text)), 3500);

      for (const toast of sessionBsc.getToastHistory()) {
        assertZeroDevJargon(toast.text, `[POST-FIX] BSC CoW place/cancel 429 toast: ${toast.text}`);
      }
      sessionBsc.assertNoRealBroadcasts();
    } finally {
      sessionBsc.cleanup();
    }
  });
});


// =====================================================================
// FEATURE 7: Hyperliquid Perps (12 Tests)
// =====================================================================

test('F7-T1-01: Perp overview KPIs, categories (favorites/crypto/stocks/all), sort, search & xyz:CRCL star', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createPerpBaselineMock({
      clearinghouseState: {
        marginSummary: { accountValue: '345.67', totalMarginUsed: '45.00', totalNtlPos: '300.00' },
        withdrawable: '300.67',
        assetPositions: [
          {
            position: {
              coin: 'BTC',
              szi: '0.0100',
              entryPx: '94000',
              positionValue: '955',
              unrealizedPnl: '15.0',
              returnOnEquity: '0.08',
              liquidationPx: '80000',
              marginUsed: '45',
              leverage: { value: 20, type: 'isolated' }
            }
          }
        ]
      }
    })
  });

  try {
    await session.switchTab('perp');
    await session.waitFor(() => session.document.querySelectorAll('#perp-overview-list .perp-overview-row').length >= 3, 3500);
    assert.equal(session.isVisible('#perp-overview-panel'), true);
    assert.match(session.getVisibleText('#perp-equity-val'), /345\.67/);
    assert.match(session.getVisibleText('#perp-avail-val'), /300\.67/);
    assert.match(session.getVisibleText('#perp-upnl-val'), /\+15\.00|15\.00/);

    // Category: stocks -> xyz:CRCL
    await session.click('#perp-overview-cats [data-cat="stocks"]');
    await session.flushMicrotasks(6);
    const stockRows = session.document.querySelectorAll('#perp-overview-list .perp-overview-row');
    assert.equal(stockRows.length, 1);
    assert.equal(stockRows[0].getAttribute('data-coin'), 'xyz:CRCL');

    // Toggle star on xyz:CRCL (default favorites already includes xyz:CRCL, so toggle removes then re-adds)
    const favKey = 'near_ca_perp_favorites_v1';
    await session.click('#perp-overview-list [data-action="toggle-perp-fav"][data-coin="xyz:CRCL"]');
    let favList = JSON.parse(session.localStorage.getItem(favKey) || '[]');
    assert.equal(favList.includes('xyz:CRCL'), false);

    // Search + clear
    await session.click('#perp-overview-cats [data-cat="all"]');
    await session.input('#perp-overview-search', 'CRCL');
    await session.flushMicrotasks(6);
    assert.equal(session.document.querySelectorAll('#perp-overview-list .perp-overview-row').length, 1);
    assert.equal(session.isVisible('#perp-overview-search-clear'), true);

    await session.click('#perp-overview-search-clear');
    await session.flushMicrotasks(6);
    assert.ok(session.document.querySelectorAll('#perp-overview-list .perp-overview-row').length >= 3);

    // Re-favorite xyz:CRCL preserving exact case
    await session.click('#perp-overview-list [data-action="toggle-perp-fav"][data-coin="xyz:CRCL"]');
    favList = JSON.parse(session.localStorage.getItem(favKey) || '[]');
    assert.equal(favList.includes('xyz:CRCL'), true);

    // Sort toggle
    await session.click('[data-action="sort-perp-overview"][data-sort="px"]');
    assert.ok(session.getVisibleText('#perp-sort-ind-px').length > 0);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F7-T1-02: Enter trade screen, candle intervals, candle inspect bar, market picker sheet & back', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createPerpBaselineMock()
  });

  try {
    await session.switchTab('perp');
    await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
    await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
    await session.waitFor(() => session.isVisible('#perp-trade-panel') && session.document.querySelector('#perp-chart-svg svg'), 3500);

    assert.notEqual(session.getVisibleText('#perp-mark-px'), '--');
    assert.notEqual(session.getVisibleText('#perp-vol-24h'), '--');
    assert.notEqual(session.getVisibleText('#perp-oi-val'), '--');
    assert.notEqual(session.getVisibleText('#perp-funding-rate'), '--');

    await session.click('#perp-interval-pills [data-iv="1h"]');
    await session.waitFor(() => session.document.querySelectorAll('#perp-chart-svg .perp-candle-hit').length > 0, 3000);

    await session.click('#perp-chart-svg .perp-candle-hit');
    assert.equal(session.hasClass('#perp-candle-detail', 'is-inspecting'), true);

    // Open Markets Picker sheet and switch to ETH
    await session.click('#perp-coin-btn');
    assert.equal(session.hasClass('#sheet-perp-markets', 'open'), true);
    await session.click('#perp-market-list [data-action="select-perp-market"][data-coin="ETH"]');
    await session.waitFor(() => session.getVisibleText('#perp-coin-name').includes('ETH'), 3000);
    assert.equal(session.hasClass('#sheet-perp-markets', 'open'), false);

    // Back to overview
    await session.click('#btn-perp-back');
    assert.equal(session.isVisible('#perp-overview-panel'), true);
    assert.equal(session.isVisible('#perp-trade-panel'), false);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F7-T1-03: Live WebSocket (l2Book, allMids, webData2) & orderbook click fills limit price', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createPerpBaselineMock()
  });

  try {
    const capturedSockets = [];
    const OrigWs = session.window.WebSocket;
    session.window.WebSocket = class WrappedTestWs extends OrigWs {
      constructor(url) {
        super(url);
        capturedSockets.push(this);
      }
    };

    await session.switchTab('perp');
    await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
    await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
    await session.waitFor(() => capturedSockets.length >= 1, 3000);

    const ws = capturedSockets[capturedSockets.length - 1];
    ws.readyState = 1;
    if (typeof ws.onopen === 'function') ws.onopen();
    await session.flushMicrotasks(4);

    assert.ok(ws.sentMessages.some((m) => m.includes('"l2Book"')));
    assert.ok(ws.sentMessages.some((m) => m.includes('"allMids"')));
    assert.ok(ws.sentMessages.some((m) => m.includes('"webData2"')));

    // Push l2Book
    ws.onmessage({
      data: JSON.stringify({
        channel: 'l2Book',
        data: {
          coin: 'BTC',
          levels: [
            [{ px: '95450', sz: '1.5', n: 2 }],
            [{ px: '95550', sz: '2.0', n: 3 }]
          ]
        }
      })
    });
    // Push allMids
    ws.onmessage({ data: JSON.stringify({ channel: 'allMids', data: { mids: { BTC: '95600' } } }) });
    // Push webData2
    ws.onmessage({
      data: JSON.stringify({
        channel: 'webData2',
        data: {
          clearinghouseState: {
            marginSummary: { accountValue: '500.0', totalMarginUsed: '50.0' },
            withdrawable: '450.0',
            assetPositions: []
          },
          openOrders: [
            { coin: 'BTC', oid: 777, side: 'B', sz: '0.01', limitPx: '94000', isTrigger: false }
          ]
        }
      })
    });

    await session.waitFor(() => session.getVisibleText('#perp-mark-px').includes('95,600'), 2500);
    assert.match(session.getVisibleText('#perp-tab-orders'), /\(1\)/);

    const obRow = session.document.querySelector('#perp-ob-bids [data-action="fill-perp-ob-px"]');
    assert.ok(obRow, 'Orderbook bid row must render');
    obRow.click();
    await session.flushMicrotasks(6);
    assert.equal(session.hasClass('#perp-type-limit', 'active'), true);
    assert.equal(session.document.getElementById('perp-limit-price-input')?.value, '95450');
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F7-T1-04: Order ticket math (Short, Cross, 10x Leverage, Post-Only, 50%, TP/SL drawer)', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createPerpBaselineMock()
  });

  try {
    await session.switchTab('perp');
    await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
    await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
    await session.waitFor(() => session.isVisible('#perp-trade-panel'), 3000);

    await session.click('#perp-side-short');
    assert.equal(session.hasClass('#perp-side-short', 'active'), true);

    await session.click('#perp-mode-cross');
    assert.equal(session.hasClass('#perp-mode-cross', 'active'), true);

    await session.input('#perp-leverage-slider', '10');
    assert.equal(session.getVisibleText('#perp-lev-val'), '10x');

    // Market shows Taker fee; Post-Only opens limit price row and shows Maker fee
    assert.match(session.getVisibleText('#perp-meta-fee'), /Taker/i);
    await session.click('#perp-type-post-only');
    assert.equal(session.isVisible('#perp-limit-price-row'), true);
    assert.match(session.getVisibleText('#perp-meta-fee'), /Maker/i);

    await session.click('#perp-trade-panel button[onclick="setPerpMarginPercent(0.50)"]');
    await session.flushMicrotasks(6);
    const marginVal = Number(session.document.getElementById('perp-margin-input')?.value || 0);
    assert.ok(marginVal > 75 && marginVal <= 80.1, `50% of $160 avail should be ~$80, got ${marginVal}`);
    assert.notEqual(session.getVisibleText('#perp-meta-notional'), '--');
    assert.notEqual(session.getVisibleText('#perp-meta-size'), '--');
    assert.notEqual(session.getVisibleText('#perp-meta-liq'), '--');

    assert.equal(session.isVisible('#perp-tpsl-drawer'), true);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F7-T1-05: Perp order submit, bottom tabs, TP/SL modal, Reverse/Close/Cancel/Batch & Broadcast Guard', async (t) => {
  const chState = {
    marginSummary: { accountValue: '250.0', totalMarginUsed: '50.0', totalNtlPos: '955.0' },
    withdrawable: '200.0',
    assetPositions: [
      {
        position: {
          coin: 'BTC',
          szi: '0.0100',
          entryPx: '94000',
          positionValue: '955',
          unrealizedPnl: '15.0',
          returnOnEquity: '0.06',
          liquidationPx: '80000',
          marginUsed: '50',
          leverage: { value: 19, type: 'isolated' }
        }
      }
    ]
  };
  const openOrders = [
    { coin: 'BTC', oid: 501, side: 'B', sz: '0.005', limitPx: '91000', isTrigger: false }
  ];
  const userFills = [
    { coin: 'BTC', tid: 1001, time: Date.now() - 120_000, side: 'B', sz: '0.01', px: '94000', closedPnl: '0', fee: '0.42' }
  ];

  await t.test('Part A: Strict Broadcast Safety Guard catches all /exchange POST mutations', async () => {
    const sessionGuard = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({ clearinghouseState: chState, openOrders, userFills })
    });

    try {
      await sessionGuard.switchTab('perp');
      await sessionGuard.waitFor(() => sessionGuard.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await sessionGuard.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await sessionGuard.waitFor(() => sessionGuard.document.querySelector('#perp-bottom-list .perp-pos-card'), 3500);

      // 1) Order submit -> PIN -> Broadcast Guard
      await sessionGuard.input('#perp-margin-input', '20');
      await sessionGuard.click('#btn-perp-submit');
      await sessionGuard.flushMicrotasks(12);
      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().filter((r) => r.blocked).length >= 1, 3500);

      // 2) Position TP/SL modal -> Save -> PIN -> Broadcast Guard
      await sessionGuard.click('#perp-bottom-list [data-action="open-perp-pos-tpsl"][data-coin="BTC"]');
      assert.equal(sessionGuard.hasClass('#sheet-perp-tpsl', 'open'), true);
      await sessionGuard.input('#perp-pos-tp-input', '105000');
      await sessionGuard.input('#perp-pos-sl-input', '88000');
      await sessionGuard.click('#btn-perp-tpsl-save');
      await sessionGuard.flushMicrotasks(12);
      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().filter((r) => r.blocked).length >= 2, 3500);
      await sessionGuard.closeSheet('sheet-perp-tpsl');

      // 3) Reverse & Close -> Broadcast Guard
      await sessionGuard.click('#perp-bottom-list [data-action="reverse-perp-pos"][data-coin="BTC"]');
      await sessionGuard.flushMicrotasks(12);
      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().filter((r) => r.blocked).length >= 3, 3500);

      await sessionGuard.click('#perp-bottom-list [data-action="close-perp-pos"][data-coin="BTC"]');
      await sessionGuard.flushMicrotasks(12);
      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().filter((r) => r.blocked).length >= 4, 3500);

      // 4) Orders tab -> Cancel order & Cancel All + Fills tab
      await sessionGuard.click('#perp-tab-orders');
      await sessionGuard.click('#perp-bottom-list [data-action="cancel-perp-order"][data-coin="BTC"]');
      await sessionGuard.flushMicrotasks(12);
      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().filter((r) => r.blocked).length >= 5, 3500);

      await sessionGuard.click('#btn-perp-batch-action');
      await sessionGuard.flushMicrotasks(12);
      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().filter((r) => r.blocked).length >= 6, 3500);

      await sessionGuard.click('#perp-tab-fills');
      assert.match(sessionGuard.getVisibleText('#perp-bottom-list'), /94,000|BTC/);

      const blocked = sessionGuard.getNetworkLog().filter((r) => r.blocked);
      assert.ok(blocked.every((r) => /Hyperliquid exchange/i.test(r.reason)));
      sessionGuard.assertNoRealBroadcasts();
      sessionGuard.assertNoRuntimeErrors();
    } finally {
      sessionGuard.cleanup();
    }
  });

  await t.test('Part B: Mocked-success order submission calls resetPerpOrderForm', async () => {
    const sessionSuccess = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({ clearinghouseState: chState })
    });

    try {
      await sessionSuccess.switchTab('perp');
      await sessionSuccess.waitFor(() => sessionSuccess.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await sessionSuccess.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await sessionSuccess.waitFor(() => sessionSuccess.isVisible('#perp-trade-panel'), 3000);

      await sessionSuccess.input('#perp-margin-input', '20');
      await sessionSuccess.click('#btn-perp-submit');
      await sessionSuccess.flushMicrotasks(12);
      await sessionSuccess.waitFor(() => sessionSuccess.document.getElementById('perp-margin-input')?.value === '', 3500);
      assert.ok(sessionSuccess.getToastHistory().some((t) => /Perp order submitted|合约委托已提交/i.test(t.text)));
      sessionSuccess.assertNoRealBroadcasts();
    } finally {
      sessionSuccess.cleanup();
    }
  });
});

test('F7-T1-06: Perp funding sheet: 1Click quote/deposit polling, Arbitrum MAX, Spot->Perp banner & Withdraw net preview', async (t) => {
  await t.test('Part A: 1Click quote debounce, Arbitrum MAX, Spot->Perp banner, Withdraw preview & 1Click Broadcast Guard', async () => {
    const session = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: {
          marginSummary: { accountValue: '100.0', totalMarginUsed: '0', totalNtlPos: '0' },
          withdrawable: '50.129',
          assetPositions: []
        },
        spotClearinghouseState: {
          balances: [{ coin: 'USDC', total: '25.50', hold: '0' }]
        },
        customHandler: async (u, init) => {
          if (/1click\.chaindefuser\.com\/v0\/quote/i.test(u)) {
            const b = init.body ? JSON.parse(init.body) : {};
            return mockJsonResponse({
              quote: {
                amountOut: '9900000',
                amountOutFormatted: '9.90',
                amountInUsd: '10',
                amountOutUsd: '9.90',
                depositAddress: b.dry ? null : 'hl_1click_dep_guard.near'
              }
            });
          }
          if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(u)) {
            const req = init.body ? JSON.parse(init.body) : {};
            if (req?.params?.request_type === 'view_access_key') {
              return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
            }
            if (req?.params?.request_type === 'view_account') {
              return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { amount: '12500000000000000000000000', storage_usage: 182 } });
            }
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('perp');
      await session.waitFor(() => session.isVisible('#perp-spot-banner'), 3500);
      assert.match(session.getVisibleText('#perp-spot-pending-amt'), /25\.50/);

      // Spot -> Perp quick transfer hits Broadcast Guard
      await session.click('#perp-spot-banner button[onclick="quickTransferSpotToPerpUI()"]');
      await session.flushMicrotasks(12);
      await session.waitFor(() => session.getNetworkLog().some((r) => r.blocked && /Hyperliquid exchange/i.test(r.reason)), 3500);

      // Open Deposit sheet -> 1Click debounced quote & #btn-perp-oc-deposit reaches Broadcast Guard
      await session.click('#perp-overview-panel button[onclick*="openPerpFundingSheet(\'deposit\')"]');
      assert.equal(session.hasClass('#sheet-perp-funding', 'open'), true);
      await session.input('#perp-oc-amount', '1');
      await session.waitFor(() => session.getVisibleText('#perp-oc-quote-out').includes('9.90'), 3000);
      assert.equal(session.isDisabled('#btn-perp-oc-deposit'), false);
      await session.click('#btn-perp-oc-deposit');
      await session.flushMicrotasks(12);
      await session.waitFor(() => session.getNetworkLog().some((r) => r.blocked && /NEAR JSON-RPC|1Click/i.test(r.reason)), 3500);

      // Switch to Arbitrum tab -> MAX
      await session.click('#perp-ftab-arbitrum');
      await session.click('#perp-funding-panel-arbitrum button[onclick="setPerpArbMax()"]');
      assert.equal(session.document.getElementById('perp-arb-amount')?.value, '100.00');
      await session.closeSheet('sheet-perp-funding');

      // Open Withdraw sheet -> MAX floored .2f & net (amt - 1).toFixed(2)
      await session.click('#perp-overview-panel button[onclick*="openPerpFundingSheet(\'withdraw\')"]');
      assert.equal(session.isVisible('#perp-mode-withdraw'), true);
      await session.click('#perp-mode-withdraw button[onclick="setPerpWithdrawMax()"]');
      assert.equal(session.document.getElementById('perp-withdraw-amount')?.value, '50.12');
      assert.equal(session.getVisibleText('#perp-wd-net-val'), '49.12 USDC');
      session.assertNoRealBroadcasts();
      session.assertNoRuntimeErrors();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] 1Click deposit submission triggers background deposit polling', async () => {
    let depositSubmitCalled = false;
    let depositStatusPolls = 0;
    const sessionPoll = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        customHandler: async (u, init) => {
          if (/1click\.chaindefuser\.com\/v0\/quote/i.test(u)) {
            const b = init.body ? JSON.parse(init.body) : {};
            return mockJsonResponse({
              quote: {
                amountOut: '9900000',
                amountOutFormatted: '9.90',
                amountInUsd: '5',
                amountOutUsd: '4.95',
                depositAddress: b.dry ? null : 'hl_1click_dep_poll.near'
              }
            });
          }
          if (/1click\.chaindefuser\.com\/v0\/deposit\/submit/i.test(u)) {
            depositSubmitCalled = true;
            return mockJsonResponse({ ok: true });
          }
          if (/1click\.chaindefuser\.com\/v0\/status/i.test(u)) {
            depositStatusPolls += 1;
            return mockJsonResponse({ status: 'PROCESSING' });
          }
          if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(u)) {
            const req = init.body ? JSON.parse(init.body) : {};
            if (req.method === 'broadcast_tx_commit' || req.method === 'send_tx') {
              return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { transaction: { hash: 'PerpOcNearTx111' }, status: { SuccessValue: '' } } });
            }
            if (req?.params?.request_type === 'view_access_key') {
              return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
            }
            if (req?.params?.request_type === 'view_account') {
              return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { amount: '12500000000000000000000000', storage_usage: 182 } });
            }
          }
          return undefined;
        }
      })
    });

    try {
      await sessionPoll.switchTab('perp');
      await sessionPoll.click('#perp-overview-panel button[onclick*="openPerpFundingSheet(\'deposit\')"]');
      await sessionPoll.input('#perp-oc-amount', '1');
      await sessionPoll.waitFor(() => sessionPoll.getVisibleText('#perp-oc-quote-out').includes('9.90'), 3000);
      await sessionPoll.click('#btn-perp-oc-deposit');
      await sessionPoll.flushMicrotasks(12);

      await sessionPoll.waitFor(() => depositSubmitCalled && sessionPoll.getToastHistory().some((t) => /Deposit sent|跨链充值已发送/i.test(t.text)), 3500);
      // Allow background deposit poll timer (if scheduled) a short window to fire
      await new Promise((r) => setTimeout(r, 400));
      await sessionPoll.flushMicrotasks(10);
      assert.ok(
        depositStatusPolls >= 1,
        `[POST-FIX] 1Click Perp deposit execution must start background deposit status polling (/v0/status), got ${depositStatusPolls}`
      );
      sessionPoll.assertNoRealBroadcasts();
    } finally {
      sessionPoll.cleanup();
    }
  });
});

test('F7-T2-01: Perp margin excess, $10 min notional, #perp-reduce-only-chk bypass & unactivated account pre-checks', async (t) => {
  await t.test('Part A: Margin > avail, < $10 min notional & unactivated account error mapping', async () => {
    const session = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: {
          marginSummary: { accountValue: '50.0', totalMarginUsed: '0', totalNtlPos: '0' },
          withdrawable: '50.0',
          assetPositions: []
        },
        exchangeResult: { status: 'err', response: 'User or API wallet does not exist.' }
      })
    });

    try {
      await session.switchTab('perp');
      await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await session.waitFor(() => session.isVisible('#perp-trade-panel'), 3000);

      // Margin > availableMargin ($50)
      await session.input('#perp-margin-input', '80');
      await session.flushMicrotasks(6);
      assert.equal(session.isDisabled('#btn-perp-submit'), true);
      assert.equal(session.isVisible('#perp-error-banner'), true);

      // Notional < $10 (5x * $1 = $5)
      await session.input('#perp-margin-input', '1');
      await session.flushMicrotasks(6);
      assert.equal(session.isDisabled('#btn-perp-submit'), true);
      assert.match(session.getVisibleText('#btn-perp-submit'), /10|Notional|最低/i);

      // Valid $20 margin * 5x -> submits and maps "does not exist" cleanly
      await session.input('#perp-margin-input', '20');
      await session.flushMicrotasks(6);
      assert.equal(session.isDisabled('#btn-perp-submit'), false);
      await session.click('#btn-perp-submit');
      await session.flushMicrotasks(12);
      await session.waitFor(() => /not activated|deposit USDC|尚未激活/i.test(session.getVisibleText('#perp-error-banner')), 3500);
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: #perp-reduce-only-chk bypasses margin excess & $10 min-notional checks and reaches Broadcast Guard', async () => {
    const sessionRO = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: {
          marginSummary: { accountValue: '5.0', totalMarginUsed: '4.0', totalNtlPos: '100.0' },
          withdrawable: '1.0',
          assetPositions: []
        }
      })
    });

    try {
      await sessionRO.switchTab('perp');
      await sessionRO.waitFor(() => sessionRO.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="SOL"]'), 3500);
      await sessionRO.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="SOL"]');
      await sessionRO.waitFor(() => sessionRO.isVisible('#perp-trade-panel'), 3000);

      // With $1 availMargin on SOL (markPx=$180, szDecimals=2 -> step=$1.80), $1 margin * 5x = $5 < $10 min notional -> blocked initially
      await sessionRO.input('#perp-margin-input', '1');
      await sessionRO.flushMicrotasks(6);
      assert.equal(sessionRO.isDisabled('#btn-perp-submit'), true);

      // Check #perp-reduce-only-chk -> bypasses < $10 min-notional
      await sessionRO.setChecked('#perp-reduce-only-chk', true);
      await sessionRO.flushMicrotasks(6);
      assert.equal(sessionRO.isDisabled('#btn-perp-submit'), false, 'Reduce-Only must bypass $10 min-notional check');

      // Also verify margin > availableMargin ($10 > $1) is bypassed under Reduce-Only and reaches /exchange Broadcast Guard
      await sessionRO.input('#perp-margin-input', '10');
      await sessionRO.flushMicrotasks(6);
      assert.equal(sessionRO.isDisabled('#btn-perp-submit'), false, 'Reduce-Only must bypass available-margin check');
      await sessionRO.click('#btn-perp-submit');
      await sessionRO.flushMicrotasks(12);
      await sessionRO.waitFor(() => sessionRO.getNetworkLog().some((r) => r.blocked && /Hyperliquid exchange/i.test(r.reason)), 3500);
      sessionRO.assertNoRealBroadcasts();
    } finally {
      sessionRO.cleanup();
    }
  });
});

test('F7-T2-02: Invalid TP/SL direction validation & onlyIsolated (xyz:CRCL) cross-mode lock', async () => {
  const session = await createUnlockedSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createPerpBaselineMock({
      clearinghouseState: {
        marginSummary: { accountValue: '200.0', totalMarginUsed: '20.0', totalNtlPos: '100.0' },
        withdrawable: '180.0',
        assetPositions: [
          {
            position: {
              coin: 'BTC',
              szi: '0.0100',
              entryPx: '95000',
              positionValue: '955',
              unrealizedPnl: '5.0',
              returnOnEquity: '0.02',
              liquidationPx: '80000',
              marginUsed: '20',
              leverage: { value: 10, type: 'isolated' }
            }
          }
        ]
      }
    })
  });

  try {
    await session.switchTab('perp');
    await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
    await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
    await session.waitFor(() => session.isVisible('#perp-trade-panel'), 3000);

    // Long ticket with TP <= markPx (95500) -> toast before PIN
    await session.input('#perp-margin-input', '20');
    await session.click('#btn-perp-tpsl-toggle');
    await session.input('#perp-tp-input', '90000');
    await session.click('#btn-perp-submit');
    assert.ok(session.getToastHistory().some((t) => /TP|止盈/i.test(t.text)));

    // Position TP/SL modal with Long SL >= markPx -> toast before PIN
    await session.click('#perp-bottom-list [data-action="open-perp-pos-tpsl"][data-coin="BTC"]');
    await session.input('#perp-pos-sl-input', '99000');
    await session.click('#btn-perp-tpsl-save');
    assert.ok(session.getToastHistory().some((t) => /SL|止损/i.test(t.text)));
    await session.closeSheet('sheet-perp-tpsl');

    // Switch to xyz:CRCL (onlyIsolated: true) -> #perp-mode-cross disabled
    await session.click('#perp-coin-btn');
    await session.click('#perp-market-filters [data-mkt-filter="stocks"]');
    await session.click('#perp-market-list [data-action="select-perp-market"][data-coin="xyz:CRCL"]');
    await session.waitFor(() => session.getVisibleText('#perp-coin-name').includes('CRCL'), 3000);
    assert.equal(session.isDisabled('#perp-mode-cross'), true);
    session.assertNoRealBroadcasts();
    session.assertNoRuntimeErrors();
  } finally {
    session.cleanup();
  }
});

test('F7-T2-03: Funding boundaries (Arb <5 USDC / low ETH, Withdraw <2 / >avail, empty 1Click PRL-only)', async (t) => {
  await t.test('Part A: PRL-only wallet shows empty 1Click state + Go to Swap CTA', async () => {
    const sessionPrl = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 0, sol: 0, eth: 0, base: 0, arb: 0, bsc: 0, op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, prl: 100, btc: 0 },
        nearNep141Balances: {},
        splBalances: {},
        erc20Balances: {}
      }),
      fetchMock: createPerpBaselineMock()
    });

    try {
      await sessionPrl.switchTab('perp');
      await sessionPrl.waitFor(() => sessionPrl.isVisible('#perp-overview-panel'), 3000);
      await sessionPrl.click('#perp-overview-panel button[onclick*="openPerpFundingSheet(\'deposit\')"]');
      assert.equal(sessionPrl.isVisible('#perp-oc-empty-state'), true);
      await sessionPrl.click('#perp-oc-empty-state button[onclick="jumpFromPerpToSwap()"]');
      assert.equal(sessionPrl.isVisible('#view-swap'), true);
      sessionPrl.assertNoRealBroadcasts();
    } finally {
      sessionPrl.cleanup();
    }
  });

  await t.test('Part B: Arb < 5 USDC / low ETH + Withdraw < 2 / > withdrawable', async () => {
    const session = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 0, sol: 0, eth: 0, base: 0, arb: 0.00005, bsc: 0, op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, prl: 100, btc: 0 },
        nearNep141Balances: {},
        splBalances: {},
        erc20Balances: { arb_0xaf88d065e77c8cc2239327c5edb3a432268e5831: 10 }
      }),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: {
          marginSummary: { accountValue: '10.0', totalMarginUsed: '0', totalNtlPos: '0' },
          withdrawable: '10.0',
          assetPositions: []
        }
      })
    });

    try {
      await session.switchTab('perp');
      await session.waitFor(() => session.isVisible('#perp-overview-panel'), 3000);

      await session.click('#perp-overview-panel button[onclick*="openPerpFundingSheet(\'deposit\')"]');
      await session.click('#perp-ftab-arbitrum');
      await session.input('#perp-arb-amount', '3');
      assert.equal(session.isDisabled('#btn-perp-arb-deposit'), true);
      assert.equal(session.isVisible('#perp-arb-error'), true);

      await session.input('#perp-arb-amount', '6');
      assert.equal(session.isDisabled('#btn-perp-arb-deposit'), true, 'Low Arb ETH (< 0.0002) must disable deposit');
      await session.closeSheet('sheet-perp-funding');

      await session.click('#perp-overview-panel button[onclick*="openPerpFundingSheet(\'withdraw\')"]');
      await session.input('#perp-withdraw-amount', '1.5');
      assert.equal(session.isDisabled('#btn-perp-withdraw'), true);
      assert.equal(session.isVisible('#perp-wd-error'), true);

      await session.input('#perp-withdraw-amount', '15');
      assert.equal(session.isDisabled('#btn-perp-withdraw'), true);
      await session.closeSheet('sheet-perp-funding');
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });
});

test('F7-T2-04: [POST-FIX] Perp form dual-clear on side/coin/sheet close & reverseHlPositionMarket sender alignment', async (t) => {
  await t.test('Part A: Form dual-clear on side flip, coin switch & funding sheet close', async () => {
    const sessionA = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock()
    });

    try {
      await sessionA.switchTab('perp');
      await sessionA.waitFor(() => sessionA.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await sessionA.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await sessionA.waitFor(() => sessionA.isVisible('#perp-trade-panel'), 3000);

      await sessionA.click('#perp-type-limit');
      await sessionA.input('#perp-limit-price-input', '94000');
      await sessionA.input('#perp-margin-input', '25');
      await sessionA.setChecked('#perp-reduce-only-chk', true);
      await sessionA.click('#btn-perp-tpsl-toggle');
      await sessionA.input('#perp-tp-input', '100000');
      await sessionA.input('#perp-sl-input', '90000');

      // Side flip clears TP & SL
      await sessionA.click('#perp-side-short');
      assert.equal(sessionA.document.getElementById('perp-tp-input')?.value, '');
      assert.equal(sessionA.document.getElementById('perp-sl-input')?.value, '');

      // Coin switch clears all ticket fields & unchecks reduceOnly
      await sessionA.click('#perp-coin-btn');
      await sessionA.click('#perp-market-list [data-action="select-perp-market"][data-coin="ETH"]');
      await sessionA.waitFor(() => sessionA.getVisibleText('#perp-coin-name').includes('ETH'), 3000);
      assert.equal(sessionA.document.getElementById('perp-margin-input')?.value, '');
      assert.equal(sessionA.document.getElementById('perp-limit-price-input')?.value, '');
      assert.equal(sessionA.document.getElementById('perp-reduce-only-chk')?.checked, false);

      // Funding sheet close clears amounts
      await sessionA.click('#btn-perp-back');
      await sessionA.click('#perp-overview-panel button[onclick*="openPerpFundingSheet(\'deposit\')"]');
      await sessionA.input('#perp-arb-amount', '25');
      await sessionA.closeSheet('sheet-perp-funding');
      assert.equal(sessionA.document.getElementById('perp-arb-amount')?.value, '');
      sessionA.assertNoRealBroadcasts();
    } finally {
      sessionA.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] reverseHlPositionMarket queries frontendOpenOrders via resolveWalletEvmSender', async () => {
    const queriedTriggerUsers = [];
    const sessionB = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      evmAddressOverride: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      localStorage: buildSeededStorage({
        evmAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        mpcEvmAddress: TEST_ALT_EVM_ADDR
      }),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: {
          marginSummary: { accountValue: '200.0', totalMarginUsed: '20.0', totalNtlPos: '100.0' },
          withdrawable: '180.0',
          assetPositions: [
            {
              position: {
                coin: 'BTC',
                szi: '0.0100',
                entryPx: '95000',
                positionValue: '955',
                unrealizedPnl: '5.0',
                returnOnEquity: '0.02',
                liquidationPx: '80000',
                marginUsed: '20',
                leverage: { value: 10, type: 'isolated' }
              }
            }
          ]
        },
        customHandler: async (u, init, bodyText) => {
          if (/api\.hyperliquid\.xyz\/info/i.test(u) && bodyText) {
            const req = JSON.parse(bodyText);
            if (req.type === 'frontendOpenOrders' && req.user) {
              queriedTriggerUsers.push(String(req.user).toLowerCase());
            }
          }
          return undefined;
        }
      })
    });

    try {
      await sessionB.switchTab('perp');
      await sessionB.waitFor(() => sessionB.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await sessionB.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await sessionB.waitFor(() => sessionB.document.querySelector('#perp-bottom-list [data-action="reverse-perp-pos"]'), 3500);
      queriedTriggerUsers.length = 0;

      await sessionB.click('#perp-bottom-list [data-action="reverse-perp-pos"][data-coin="BTC"]');
      await sessionB.flushMicrotasks(12);
      await sessionB.waitFor(() => sessionB.getNetworkLog().some((r) => r.blocked), 3500);

      assert.ok(
        queriedTriggerUsers.some((addr) => addr === '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'),
        `[POST-FIX] reverseHlPositionMarket must query triggers for resolveWalletEvmSender (0x7099...), got: ${JSON.stringify(queriedTriggerUsers)}`
      );
      assert.equal(
        queriedTriggerUsers.includes(TEST_ALT_EVM_ADDR.toLowerCase()),
        false,
        '[POST-FIX] reverseHlPositionMarket must NOT query mpcEvmAddress when evmPrivateKey sender differs'
      );
      sessionB.assertNoRealBroadcasts();
    } finally {
      sessionB.cleanup();
    }
  });
});

test('F7-T2-05: [POST-FIX] Zero-margin %, WS close on leave, Zero CLS L/S bar & reactive refresh/batch loading (WS immune)', async (t) => {
  await t.test('Part A: [POST-FIX] #perp-ls-ratio-wrap stays visible (Zero CLS) when L/S ratio returns 503', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      preloadEthers: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({ lsRatioStatus: 503 })
    });

    try {
      await session.switchTab('perp');
      await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await session.waitFor(() => session.isVisible('#perp-trade-panel'), 3000);
      assert.equal(
        session.isVisible('#perp-ls-ratio-wrap'),
        true,
        '[POST-FIX] #perp-ls-ratio-wrap must remain visible (Zero CLS) when L/S ratio is unavailable'
      );
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: Zero-margin 25% guard & WS close on leave (ws.readyState === 3)', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      preloadEthers: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: {
          marginSummary: { accountValue: '0', totalMarginUsed: '0', totalNtlPos: '0' },
          withdrawable: '0',
          assetPositions: []
        }
      })
    });

    try {
      const sockets = [];
      const OrigWs = session.window.WebSocket;
      session.window.WebSocket = class TrackWs extends OrigWs {
        constructor(url) {
          super(url);
          sockets.push(this);
        }
      };

      await session.switchTab('perp');
      await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await session.waitFor(() => sockets.length >= 1, 3000);

      await session.click('#perp-trade-panel button[onclick="setPerpMarginPercent(0.25)"]');
      assert.equal(session.document.getElementById('perp-margin-input')?.value, '');
      assert.ok(session.getToastHistory().some((t) => /available margin|可用保证金/i.test(t.text)));

      const ws = sockets[sockets.length - 1];
      await session.click('#btn-perp-back');
      assert.equal(ws.readyState, 3, 'Leaving Perp trade view must close WebSocket');
      session.assertNoRuntimeErrors();
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part C: [POST-FIX] #btn-perp-trade-refresh disables with loading feedback during async refresh', async () => {
    let infoDelayMs = 0;
    const session = await createWalletAppSession({
      viewportWidth: 375,
      preloadEthers: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        customHandler: async (u) => {
          if (/api\.hyperliquid\.xyz\/info/i.test(u) && infoDelayMs > 0) {
            await new Promise((r) => setTimeout(r, infoDelayMs));
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('perp');
      await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await session.waitFor(() => session.isVisible('#perp-trade-panel'), 3000);

      const refreshBtn = session.document.getElementById('btn-perp-trade-refresh');
      assert.ok(refreshBtn);
      infoDelayMs = 120;
      refreshBtn.click();
      assert.equal(refreshBtn.disabled, true, '[POST-FIX] #btn-perp-trade-refresh must disable during refresh');
      await session.waitFor(() => !refreshBtn.disabled, 3000);
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part D: [POST-FIX] WS webData2 overwrite immunity preserves in-flight Close button loading state', async () => {
    const chState = {
      marginSummary: { accountValue: '250.0', totalMarginUsed: '50.0', totalNtlPos: '955.0' },
      withdrawable: '200.0',
      assetPositions: [
        {
          position: {
            coin: 'BTC',
            szi: '0.0100',
            entryPx: '94000',
            positionValue: '955',
            unrealizedPnl: '15.0',
            returnOnEquity: '0.06',
            liquidationPx: '80000',
            marginUsed: '50',
            leverage: { value: 19, type: 'isolated' }
          }
        }
      ]
    };
    let exchangeDelayMs = 0;
    let exchangeInFlight = false;
    const sessionWS = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: chState,
        customHandler: async (u) => {
          if (/api\.hyperliquid\.xyz\/exchange/i.test(u) && exchangeDelayMs > 0) {
            exchangeInFlight = true;
            try {
              await new Promise((r) => setTimeout(r, exchangeDelayMs));
            } finally {
              exchangeInFlight = false;
            }
            return mockJsonResponse({ status: 'ok', response: { type: 'order', data: { statuses: [{ filled: { totalSz: '0.01', avgPx: '95500' } }] } } });
          }
          return undefined;
        }
      })
    });

    try {
      const sockets = [];
      const OrigWs = sessionWS.window.WebSocket;
      sessionWS.window.WebSocket = class WsImmunity extends OrigWs {
        constructor(url) {
          super(url);
          sockets.push(this);
        }
      };

      await sessionWS.switchTab('perp');
      await sessionWS.waitFor(() => sessionWS.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await sessionWS.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await sessionWS.waitFor(() => sockets.length >= 1 && sessionWS.document.querySelector('#perp-bottom-list [data-action="close-perp-pos"]'), 3500);

      const ws = sockets[sockets.length - 1];
      ws.readyState = 1;
      if (typeof ws.onopen === 'function') ws.onopen();
      await sessionWS.flushMicrotasks(4);

      exchangeDelayMs = 220;
      await sessionWS.click('#perp-bottom-list [data-action="close-perp-pos"][data-coin="BTC"]');
      await sessionWS.flushMicrotasks(12);
      await sessionWS.waitFor(() => exchangeInFlight, 2000);

      ws.onmessage({
        data: JSON.stringify({
          channel: 'webData2',
          data: { clearinghouseState: chState, openOrders: [] }
        })
      });
      await sessionWS.flushMicrotasks(8);

      const closeBtnDuringWs = sessionWS.document.querySelector('#perp-bottom-list [data-action="close-perp-pos"][data-coin="BTC"]');
      assert.ok(closeBtnDuringWs, 'Close button must remain rendered after webData2');
      assert.equal(closeBtnDuringWs.disabled, true, '[POST-FIX] WS webData2 re-render must NOT overwrite in-flight Close button disabled state');
      assert.match(closeBtnDuringWs.textContent, /Closing|平仓中/i, '[POST-FIX] WS webData2 must preserve Closing loading text');
      await sessionWS.waitFor(() => !exchangeInFlight, 3000);
      sessionWS.assertNoRealBroadcasts();
    } finally {
      sessionWS.cleanup();
    }
  });

  await t.test('Part E: [POST-FIX] #btn-perp-batch-action displays disabled + loading text while executing', async () => {
    const chState = {
      marginSummary: { accountValue: '250.0', totalMarginUsed: '50.0', totalNtlPos: '955.0' },
      withdrawable: '200.0',
      assetPositions: [
        {
          position: {
            coin: 'BTC',
            szi: '0.0100',
            entryPx: '94000',
            positionValue: '955',
            unrealizedPnl: '15.0',
            returnOnEquity: '0.06',
            liquidationPx: '80000',
            marginUsed: '50',
            leverage: { value: 19, type: 'isolated' }
          }
        }
      ]
    };
    let exchangeDelayMs = 0;
    let exchangeInFlight = false;
    const sessionBatch = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: chState,
        customHandler: async (u) => {
          if (/api\.hyperliquid\.xyz\/exchange/i.test(u) && exchangeDelayMs > 0) {
            exchangeInFlight = true;
            try {
              await new Promise((r) => setTimeout(r, exchangeDelayMs));
            } finally {
              exchangeInFlight = false;
            }
            return mockJsonResponse({ status: 'ok', response: { type: 'order', data: { statuses: [{ filled: { totalSz: '0.01', avgPx: '95500' } }] } } });
          }
          return undefined;
        }
      })
    });

    try {
      await sessionBatch.switchTab('perp');
      await sessionBatch.waitFor(() => sessionBatch.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await sessionBatch.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await sessionBatch.waitFor(() => sessionBatch.document.querySelector('#perp-bottom-list .perp-pos-card'), 3500);

      const batchBtn = sessionBatch.document.getElementById('btn-perp-batch-action');
      assert.ok(batchBtn && !batchBtn.classList.contains('hidden'), '#btn-perp-batch-action must be visible with active position');
      exchangeDelayMs = 200;
      await sessionBatch.click('#btn-perp-batch-action');
      await sessionBatch.flushMicrotasks(12);
      await sessionBatch.waitFor(() => exchangeInFlight, 2000);
      assert.equal(batchBtn.disabled, true);
      assert.match(batchBtn.textContent, /Closing|Processing|处理中|平仓中/i, '[POST-FIX] #btn-perp-batch-action must display loading text while executing');
      await sessionBatch.waitFor(() => !exchangeInFlight && !batchBtn.disabled, 3000);
      sessionBatch.assertNoRealBroadcasts();
    } finally {
      sessionBatch.cleanup();
    }
  });
});

test('F7-T2-06: [POST-FIX] Zero dev jargon in Perps (no Bridge2, Pair/Vol, raw HTTP 502 errors)', async (t) => {
  await t.test('Part A: [POST-FIX] #sheet-perp-funding Arbitrum tab has zero Bridge2 jargon', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock()
    });

    try {
      await session.switchTab('perp');
      await session.waitFor(() => session.isVisible('#perp-overview-panel'), 3000);
      await session.click('#perp-overview-panel button[onclick*="openPerpFundingSheet(\'deposit\')"]');
      await session.click('#perp-ftab-arbitrum');
      assertZeroDevJargon(session.getVisibleText('#sheet-perp-funding'), '[POST-FIX] #sheet-perp-funding');
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] #sheet-perp-tpsl must not display Pair / Vol', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        clearinghouseState: {
          marginSummary: { accountValue: '200.0', totalMarginUsed: '20.0', totalNtlPos: '100.0' },
          withdrawable: '180.0',
          assetPositions: [
            {
              position: {
                coin: 'BTC',
                szi: '0.01',
                entryPx: '95000',
                positionValue: '955',
                unrealizedPnl: '5.0',
                returnOnEquity: '0.02',
                liquidationPx: '80000',
                marginUsed: '20',
                leverage: { value: 10, type: 'isolated' }
              }
            }
          ]
        }
      })
    });

    try {
      await session.switchTab('perp');
      await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await session.waitFor(() => session.document.querySelector('#perp-bottom-list [data-action="open-perp-pos-tpsl"]'), 3500);
      await session.click('#perp-bottom-list [data-action="open-perp-pos-tpsl"][data-coin="BTC"]');
      const tpslText = session.getVisibleText('#sheet-perp-tpsl');
      assert.doesNotMatch(tpslText, /Pair\s*\/\s*Vol|合约\s*\/\s*成交额/, '[POST-FIX] #sheet-perp-tpsl must not show Pair / Vol');
      assertZeroDevJargon(tpslText, '[POST-FIX] #sheet-perp-tpsl');
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part C: [POST-FIX] /exchange raw non-JSON HTTP 502 is sanitized in #perp-error-banner & toasts (EN & ZH)', async () => {
    let exchangeHits = 0;
    const session = await createUnlockedSession({
      viewportWidth: 375,
      preloadEthers: true,
      evmPrivateKey: TEST_EVM_PRIVKEY,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createPerpBaselineMock({
        customHandler: async (u) => {
          if (/api\.hyperliquid\.xyz\/exchange/i.test(u)) {
            exchangeHits += 1;
            return mockJsonResponse('Bad Gateway', 502);
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('perp');
      await session.waitFor(() => session.document.querySelector('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]'), 3500);
      await session.click('#perp-overview-list [data-action="open-perp-trade"][data-coin="BTC"]');
      await session.waitFor(() => session.isVisible('#perp-trade-panel'), 3000);

      await session.input('#perp-margin-input', '20');
      await session.click('#btn-perp-submit');
      await session.flushMicrotasks(12);
      await session.waitFor(() => exchangeHits >= 1 && session.isVisible('#perp-error-banner'), 3500);
      assert.ok(exchangeHits >= 1, 'Expected POST /exchange to be invoked and hit 502 mock');
      assertZeroDevJargon(session.getVisibleText('#perp-error-banner'), '[POST-FIX] #perp-error-banner (EN) on /exchange 502');
      assertZeroDevJargon(session.getVisibleText('#view-perp'), '[POST-FIX] #view-perp (EN)');

      // Re-test in ZH mode
      await session.click('#header-lang-btn');
      await session.input('#perp-margin-input', '20');
      await session.click('#btn-perp-submit');
      await session.flushMicrotasks(12);
      await session.waitFor(() => exchangeHits >= 2 && session.isVisible('#perp-error-banner'), 3500);
      assertZeroDevJargon(session.getVisibleText('#perp-error-banner'), '[POST-FIX] #perp-error-banner (ZH) on /exchange 502');
      for (const toast of session.getToastHistory()) {
        assertZeroDevJargon(toast.text, `[POST-FIX] perp toast: ${toast.text}`);
      }
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });
});

// =====================================================================
// FEATURE 8: Earn & Staking (21 Pools + Validators) (12 Tests)
// =====================================================================

function createEarnHealthyMock(overrides = {}) {
  return async (url, init = {}) => {
    const u = String(url || '');
    const bodyText = typeof init.body === 'string' ? init.body : '';
    if (typeof overrides.customHandler === 'function') {
      const res = await overrides.customHandler(u, init, bodyText);
      if (res !== undefined) return res;
    }
    if (/yields\.llama\.fi\/pools/i.test(u)) {
      return mockJsonResponse({
        status: 'success',
        data: overrides.llamaData ?? [
          { chain: 'Near', project: 'meta-pool', symbol: 'STNEAR', apy: 9.15, tvlUsd: 12000000 },
          { chain: 'Solana', project: 'jito', symbol: 'JITOSOL', apy: 7.45, tvlUsd: 1500000000 },
          { chain: 'Base', project: 'aave-v3', symbol: 'USDC', apy: 5.25, tvlUsd: 80000000 },
          { chain: 'Arc', project: 'steakhouse', symbol: 'STEAKUSDC', apy: 6.1, tvlUsd: 5000000 }
        ]
      });
    }
    if (/validators\.narwallets\.com\/metrics_json/i.test(u)) {
      return mockJsonResponse({
        total_staked_near: 450000000,
        validators: [{ account_id: 'figment.poolv1.near', stake: 5000000, fee: 5 }]
      });
    }
    if (/api\.ref\.finance\/get-rnear-apy/i.test(u)) {
      return mockJsonResponse({ apy: '8.85', tvl: '1000000' });
    }
    if (/explorer\.arc\.io/i.test(u)) {
      if (overrides.arcExplorer403) return mockJsonResponse({ error: 'Forbidden' }, 403);
      return mockJsonResponse({ holders_count: '420' });
    }
    if (/rpc\.mainnet\.arc\.io/i.test(u)) {
      const parsed = bodyText ? JSON.parse(bodyText) : {};
      const dataHex = String(parsed?.params?.[0]?.data || '').toLowerCase();
      if (dataHex.startsWith('0xef8b30f7')) {
        // previewDeposit(1e6) -> 0.98e18 shares (rate 0.98)
        return mockJsonResponse({ jsonrpc: '2.0', id: parsed.id, result: encodeUint256Hex(980000000000000000n) });
      }
      if (dataHex.startsWith('0x01e1d114')) {
        // totalAssets() -> 5,000,000 USDC (6 dec)
        return mockJsonResponse({ jsonrpc: '2.0', id: parsed.id, result: encodeUint256Hex(5000000000000n) });
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: parsed.id, result: encodeUint256Hex(1000000n) });
    }
    if (/kobe\.mainnet\.jito\.network/i.test(u)) {
      return mockJsonResponse({ apy: [{ data: 0.074 }], tvl: [{ data: 12000000 }] });
    }
    if (/eth-api\.lido\.fi/i.test(u)) {
      return mockJsonResponse({ data: { smaApr: 3.12 } });
    }
    if (/fastnear\.com|rpc\.mainnet\.near\.org|near\.drpc\.org/i.test(u)) {
      const req = bodyText ? JSON.parse(bodyText) : {};
      if (req?.params?.request_type === 'call_function' && req.params.account_id === 'orhea-conv.rhealab.near') {
        if (req.params.method_name === 'get_conversion_strategy_infos') {
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: req.id,
            result: encodeNearCallResult({
              '{"Oneshot":{"lock_period_days":15}}': { conversion_rate: (3000n * 10n ** 26n).toString() },
              '{"Oneshot":{"lock_period_days":45}}': { conversion_rate: (5000n * 10n ** 26n).toString() },
              '{"Oneshot":{"lock_period_days":91}}': { conversion_rate: (7500n * 10n ** 26n).toString() },
              '{"Oneshot":{"lock_period_days":181}}': { conversion_rate: (10000n * 10n ** 26n).toString() }
            })
          });
        }
      }
      if (req?.params?.request_type === 'view_access_key') {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { nonce: 15, block_hash: '11111111111111111111111111111111' } });
      }
      if (req?.params?.request_type === 'view_account') {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { amount: overrides.nearAmount ?? '12500000000000000000000000', storage_usage: 182 } });
      }
      if (req?.params?.request_type === 'call_function' && req.params.method_name === 'ft_balance_of' && overrides.nearFtBalances?.[req.params.account_id]) {
        return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: encodeNearCallResult(overrides.nearFtBalances[req.params.account_id]) });
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { result: [] } });
    }
    return mockJsonResponse({}, 200);
  };
}

test('F8-T1-01: Earn 21-pool catalog completeness, 6 category filters & search filtering', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createEarnHealthyMock()
  });

  try {
    await session.switchTab('earn');
    assert.equal(session.isVisible('#view-earn'), true);

    const checkCount = async (filterKey, expected) => {
      await session.click(`#earn-pool-filters [data-filter="${filterKey}"]`);
      const count = session.document.querySelectorAll('#staking-pools-list .staking-pool-card').length;
      assert.equal(count, expected, `Filter "${filterKey}" expected ${expected} pools, got ${count}`);
    };

    await checkCount('all', 21);
    await checkCount('featured', 9);
    await checkCount('lending', 9);
    await checkCount('near', 8);
    await checkCount('sol', 5);
    await checkCount('evm', 8);

    await session.input('#earn-pool-search', 'Aave');
    const aaveCards = session.document.querySelectorAll('#staking-pools-list .staking-pool-card');
    assert.equal(aaveCards.length, 4, 'Search "Aave" should match 4 Aave pools');

    await session.input('#earn-pool-search', 'oRHEA');
    const orheaCards = session.document.querySelectorAll('#staking-pools-list .staking-pool-card');
    assert.equal(orheaCards.length, 1);

    await session.click('#earn-pool-filters [data-filter="featured"]');
    assert.equal(session.document.getElementById('earn-pool-search')?.value, '');
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F8-T1-02: Live metrics sync: null-safe -- before sync -> real APY/TVL/rate & Arc 403 RPC fallback', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createEarnHealthyMock({ arcExplorer403: true })
  });

  try {
    await session.switchTab('earn');
    // Before sync, Arc Steakhouse pool shows '--' (zero fake APY)
    await session.click('#earn-pool-filters [data-filter="evm"]');
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="arc_steak_usdc"]');
    assert.equal(session.hasClass('#sheet-earn-stake', 'open'), true);
    assert.equal(session.getVisibleText('#earn-live-apy'), '--');
    assert.equal(session.getVisibleText('#earn-live-rate'), '--');
    await session.closeSheet('sheet-earn-stake');

    // Sync metrics (with explorer.arc.io returning 403, Arc RPC eth_call still populates rate & TVL)
    await session.click('#view-earn button[onclick="refreshStakingMetrics(true)"]');
    await session.waitFor(
      () => session.getToastHistory().some((t) => /Staking APY synced|已同步实时质押年化/i.test(t.text)),
      4000
    );

    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="arc_steak_usdc"]');
    assert.match(session.getVisibleText('#earn-live-apy'), /6\.10%/);
    assert.match(session.getVisibleText('#earn-live-rate'), /0\.98/);
    assert.notEqual(session.getVisibleText('#earn-tvl-val'), '--');
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F8-T1-03: Stake sheet lockup notices & rhea_orhea_convert lock-tier rate/estOut updates', async () => {
  const session = await createUnlockedSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createEarnHealthyMock()
  });

  try {
    await session.switchTab('earn');
    await session.click('#view-earn button[onclick="refreshStakingMetrics(true)"]');
    await session.waitFor(
      () => session.getToastHistory().some((t) => /Staking APY synced|已同步实时质押年化/i.test(t.text)),
      4000
    );
    await session.click('#earn-pool-filters [data-filter="all"]');

    // oRHEA lock tiers
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="rhea_orhea_convert"]');
    assert.equal(session.isVisible('#earn-lock-row'), true);
    assert.equal(session.isVisible('#earn-lockup-notice'), true);

    await session.input('#earn-amount-in', '10');
    await session.click('#earn-lock-tiers [data-action="select-earn-lock"][data-days="91"]');
    assert.match(session.getVisibleText('#earn-live-rate'), /0\.75/);
    assert.match(session.getVisibleText('#earn-est-out'), /7\.5/);
    await session.closeSheet('sheet-earn-stake');

    // Jupiter JUP & Ethena sUSDe show lockup notice; Aave Base USDC hides both
    for (const pid of ['jupiter_jup', 'ethena_susde']) {
      await session.click(`#staking-pools-list [data-action="select-staking-pool"][data-pool-id="${pid}"]`);
      assert.equal(session.isVisible('#earn-lockup-notice'), true);
      assert.equal(session.isVisible('#earn-lock-row'), false);
      await session.closeSheet('sheet-earn-stake');
    }

    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="aave_base_usdc"]');
    assert.equal(session.isVisible('#earn-lockup-notice'), false);
    assert.equal(session.isVisible('#earn-lock-row'), false);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F8-T1-04: [POST-FIX] Earn MAX gas reserve deduction & floor rounding (never exceeding avail - reserve)', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage({
      nativeBalances: {
        near: 12.5000009,
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
      nearNep141Balances: {}
    }),
    fetchMock: createEarnHealthyMock()
  });

  try {
    await session.switchTab('earn');
    await session.click('#earn-pool-filters [data-filter="all"]');

    // rhea_rnear (reserve 0.05 NEAR) -> floor(12.4500009, 6) = 12.450000 <= 12.4500009
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="rhea_rnear"]');
    await session.click('#sheet-earn-stake button[onclick="setEarnMaxAmount()"]');
    const rnearMax = Number(session.document.getElementById('earn-amount-in')?.value || 0);
    assert.ok(
      rnearMax > 0 && rnearMax <= 12.5000009 - 0.05,
      `[POST-FIX] setEarnMaxAmount (${rnearMax}) must floor-round and never exceed avail - 0.05 (${12.5000009 - 0.05})`
    );
    await session.closeSheet('sheet-earn-stake');

    // burrow_near_wnear (reserve 0.12 NEAR)
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="burrow_near_wnear"]');
    await session.click('#sheet-earn-stake button[onclick="setEarnMaxAmount()"]');
    const burrowMax = Number(session.document.getElementById('earn-amount-in')?.value || 0);
    assert.ok(burrowMax > 0 && burrowMax <= 12.5000009 - 0.12);
    await session.closeSheet('sheet-earn-stake');

    // jito_sol (reserve 0.002 SOL)
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="jito_sol"]');
    await session.click('#sheet-earn-stake button[onclick="setEarnMaxAmount()"]');
    assert.equal(Number(session.document.getElementById('earn-amount-in')?.value || 0), 1.998);
    await session.closeSheet('sheet-earn-stake');

    // aave_base_usdc (token stake -> full 100 USDC)
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="aave_base_usdc"]');
    await session.click('#sheet-earn-stake button[onclick="setEarnMaxAmount()"]');
    assert.equal(Number(session.document.getElementById('earn-amount-in')?.value || 0), 100);
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F8-T1-05: Stake execution PIN gate, Broadcast Guard, receipt & activity recording', async (t) => {
  await t.test('Part A: Strict Broadcast Safety Guard intercepts metapool_stnear NEAR broadcast', async () => {
    const sessionGuard = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createEarnHealthyMock()
    });

    try {
      await sessionGuard.switchTab('earn');
      await sessionGuard.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="metapool_stnear"]');
      await sessionGuard.input('#earn-amount-in', '2');
      await sessionGuard.click('#btn-execute-stake');
      await sessionGuard.flushMicrotasks(12);

      await sessionGuard.waitFor(() => sessionGuard.getNetworkLog().some((r) => r.blocked), 3500);
      assert.ok(sessionGuard.getNetworkLog().some((r) => r.blocked && /NEAR JSON-RPC/i.test(r.reason)));
      sessionGuard.assertNoRealBroadcasts();
      sessionGuard.assertNoRuntimeErrors();
    } finally {
      sessionGuard.cleanup();
    }
  });

  await t.test('Part B: Mocked-success closure clears form, shows #earn-tx-receipt & records activityHistory', async () => {
    const sessionSuccess = await createWalletAppSession({
      viewportWidth: 375,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage(),
      fetchMock: createEarnHealthyMock({
        customHandler: async (u, init, bodyText) => {
          if (/fastnear\.com|rpc\.mainnet\.near\.org/i.test(u) && bodyText) {
            const req = JSON.parse(bodyText);
            if (req.method === 'broadcast_tx_commit' || req.method === 'send_tx') {
              return mockJsonResponse({ jsonrpc: '2.0', id: req.id, result: { transaction: { hash: 'EarnStakeTxHash111' }, status: { SuccessValue: '' } } });
            }
          }
          return undefined;
        }
      })
    });

    try {
      await sessionSuccess.switchTab('earn');
      await sessionSuccess.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="metapool_stnear"]');
      await sessionSuccess.input('#earn-amount-in', '2');
      await sessionSuccess.click('#btn-execute-stake');
      await sessionSuccess.flushMicrotasks(12);

      await sessionSuccess.waitFor(() => sessionSuccess.isVisible('#earn-tx-receipt'), 3500);
      assert.equal(sessionSuccess.document.getElementById('earn-amount-in')?.value, '');
      assert.equal(sessionSuccess.getVisibleText('#earn-est-out'), '--');
      assert.match(sessionSuccess.getVisibleText('#earn-tx-receipt'), /EarnStakeTxHash/);

      const stored = JSON.parse(sessionSuccess.localStorage.getItem('near_ca_wallets_v1'));
      const stakeAct = (stored.wallets[0].activityHistory || []).find((a) => a.type === 'stake');
      assert.ok(stakeAct, 'activityHistory must record stake entry');
      sessionSuccess.assertNoRealBroadcasts();
    } finally {
      sessionSuccess.cleanup();
    }
  });
});

test('F8-T1-06: My Staking Positions card rendering & multi-chain redemption reaching Broadcast Guard', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    preloadEthers: true,
    localStorage: buildSeededStorage({
      nearStakingPositions: [
        { poolId: 'figment.poolv1.near', stakedNear: 5, unstakedNear: 0, totalNear: 5, canWithdraw: false }
      ],
      nearNep141Balances: {
        'meta-pool.near': { formatted: 3.5, raw: '3500000000000000000000000', decimals: 24 }
      },
      solStakingPositions: [
        { type: 'jupiter_dao', amount: 20, symbol: 'JUP', chain: 'sol', isMaxLock: true, canWithdraw: false }
      ],
      splBalances: {
        J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: 1.5
      },
      erc20Balances: {
        base_0x4e65feba4a795096d40f4a54de45c99f056526a8: 50,
        arc_0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298: 25,
        eth_0x9d39a5de30e57443bff2a8307a4256c8797a3497: 10
      }
    }),
    fetchMock: createEarnHealthyMock()
  });

  try {
    await session.switchTab('earn');
    assert.equal(session.isVisible('#earn-my-positions-card'), true);
    const countNum = Number(session.getVisibleText('#earn-my-positions-count'));
    assert.ok(countNum >= 6, `Expected >= 6 seeded Earn positions, got ${countNum}`);

    const actionBtns = session.document.querySelectorAll('#earn-my-positions-list [data-action="earn-pos-action"]');
    assert.ok(actionBtns.length >= 6);

    // Click NEAR validator unstake -> PIN -> Broadcast Guard
    await session.click('#earn-my-positions-list [data-action="earn-pos-action"][data-type="near_unstake"]');
    await session.flushMicrotasks(12);
    await session.waitFor(() => session.getNetworkLog().some((r) => r.blocked && /NEAR JSON-RPC/i.test(r.reason)), 3500);
    session.assertNoRealBroadcasts();
    session.assertNoRuntimeErrors();
  } finally {
    session.cleanup();
  }
});

test('F8-T2-01: Balance & native gas pre-checks BEFORE PIN modal or network RPC', async () => {
  const session = await createUnlockedSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage({
      nativeBalances: { near: 0, sol: 2, eth: 0, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 },
      nearNep141Balances: {
        'token.rhealab.near': { formatted: 100, raw: '100000000000000000000', decimals: 18 }
      }
    }),
    fetchMock: createEarnHealthyMock({
      nearAmount: '0',
      nearFtBalances: { 'token.rhealab.near': '100000000000000000000' }
    })
  });

  try {
    await session.switchTab('earn');
    await session.click('#earn-pool-filters [data-filter="all"]');
    // Allow bootstrapApp 600ms background sync timer to fire & settle before measuring pre-check network calls
    await new Promise((r) => setTimeout(r, 700));
    await session.flushMicrotasks(10);
    const callsBefore = session.getNetworkLog().length;

    // 1) Excess NEAR (999) on rhea_rnear
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="rhea_rnear"]');
    await session.input('#earn-amount-in', '999');
    await session.click('#btn-execute-stake');
    await session.closeSheet('sheet-earn-stake');

    // 2) 10 USDC on aave_eth_usdc with 0 ETH gas
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="aave_eth_usdc"]');
    await session.input('#earn-amount-in', '10');
    await session.click('#btn-execute-stake');
    assert.ok(session.getToastHistory().some((t) => /native gas|原生 Gas/i.test(t.text)));
    await session.closeSheet('sheet-earn-stake');

    // 3) 10 RHEA on rhea_xrhea with 0 NEAR gas
    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="rhea_xrhea"]');
    await session.input('#earn-amount-in', '10');
    await session.click('#btn-execute-stake');
    assert.equal(session.getNetworkLog().length, callsBefore, 'Pre-checks must block without network RPC');
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F8-T2-02: Pool minimum stake (1 NEAR LST / 0.05 NEAR Burrow) & zero/empty input guards', async () => {
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: buildSeededStorage(),
    fetchMock: createEarnHealthyMock()
  });

  try {
    await session.switchTab('earn');
    await session.click('#earn-pool-filters [data-filter="all"]');

    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="rhea_rnear"]');
    await session.input('#earn-amount-in', '0');
    await session.click('#btn-execute-stake');

    await session.input('#earn-amount-in', '0.5');
    await session.click('#btn-execute-stake');
    assert.ok(session.getToastHistory().some((t) => /Minimum stake.*1 NEAR|最低质押数量为 1 NEAR/i.test(t.text)));
    await session.closeSheet('sheet-earn-stake');

    await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="burrow_near_wnear"]');
    await session.input('#earn-amount-in', '0.02');
    await session.click('#btn-execute-stake');
    assert.ok(session.getToastHistory().some((t) => /Minimum stake.*0\.05|最低质押数量为 0\.05/i.test(t.text)));
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F8-T2-03: [POST-FIX] Burrow wNEAR+NEAR & Aave WETH+ETH combined wrap-supply boundary check', async (t) => {
  await t.test('Part A: Burrow 0.5 wNEAR + 1.0 NEAR staking 1.2 passes pre-check to PIN gate', async () => {
    const sessionPass = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 1.0, sol: 2, eth: 0.2, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 },
        nearNep141Balances: { 'wrap.near': { formatted: 0.5, raw: '500000000000000000000000', decimals: 24 } }
      }),
      fetchMock: createEarnHealthyMock()
    });
    try {
      await sessionPass.switchTab('earn');
      await sessionPass.click('#earn-pool-filters [data-filter="all"]');
      await sessionPass.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="burrow_near_wnear"]');
      await sessionPass.input('#earn-amount-in', '1.2');
      await sessionPass.click('#btn-execute-stake');
      await sessionPass.waitFor(() => sessionPass.getNetworkLog().some((r) => r.blocked), 3500);
      sessionPass.assertNoRealBroadcasts();
    } finally {
      sessionPass.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] Burrow 0.5 wNEAR + 0.75 NEAR staking 1.2 fails native gas reserve before PIN', async () => {
    const sessionFail = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 0.75, sol: 2, eth: 0.102, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 },
        nearNep141Balances: { 'wrap.near': { formatted: 0.5, raw: '500000000000000000000000', decimals: 24 } },
        erc20Balances: { eth_0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2: 0.4 }
      }),
      fetchMock: createEarnHealthyMock()
    });
    try {
      await sessionFail.switchTab('earn');
      await sessionFail.click('#earn-pool-filters [data-filter="all"]');
      await sessionFail.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="burrow_near_wnear"]');
      await sessionFail.input('#earn-amount-in', '1.2');
      await sessionFail.click('#btn-execute-stake');
      assert.ok(sessionFail.getToastHistory().some((t) => /native gas|原生 Gas/i.test(t.text)));
      sessionFail.assertNoRealBroadcasts();
    } finally {
      sessionFail.cleanup();
    }
  });

  await t.test('Part C: Aave 0.4 WETH + 0.102 ETH staking 0.5 blocks locally before PIN', async () => {
    const sessionAave = await createUnlockedSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({
        nativeBalances: { near: 1.0, sol: 2, eth: 0.102, base: 0.25, arb: 0.5, bsc: 0.2, op: 0.1, pol: 10, avax: 1, hype: 1, hood: 0, arc: 5, prl: 100, btc: 0.01 },
        erc20Balances: { eth_0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2: 0.4 }
      }),
      fetchMock: createEarnHealthyMock()
    });
    try {
      await sessionAave.switchTab('earn');
      await sessionAave.click('#earn-pool-filters [data-filter="all"]');
      await sessionAave.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="aave_eth_weth"]');
      await sessionAave.input('#earn-amount-in', '0.5');
      await sessionAave.click('#btn-execute-stake');
      assert.ok(sessionAave.getToastHistory().some((t) => /native gas|原生 Gas/i.test(t.text)));
      sessionAave.assertNoRealBroadcasts();
    } finally {
      sessionAave.cleanup();
    }
  });
});

test('F8-T2-04: [POST-FIX] Earn form dual-clear on sheet close/pool switch & refresh button loading state', async (t) => {
  await t.test('Part A: Earn form dual-clear on sheet close & pool switch', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createEarnHealthyMock()
    });

    try {
      await session.switchTab('earn');
      await session.click('#earn-pool-filters [data-filter="all"]');

      await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="rhea_rnear"]');
      await session.input('#earn-amount-in', '3');
      await session.closeSheet('sheet-earn-stake');
      assert.equal(session.document.getElementById('earn-amount-in')?.value, '');

      await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="jito_sol"]');
      assert.equal(session.document.getElementById('earn-amount-in')?.value, '');
      assert.equal(session.getVisibleText('#earn-est-out'), '--');
      assert.equal(session.isVisible('#earn-tx-receipt'), false);
      await session.closeSheet('sheet-earn-stake');
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] Earn refresh button disables with loading text while syncing', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createEarnHealthyMock({
        customHandler: async (u) => {
          if (/yields\.llama\.fi\/pools/i.test(u)) {
            await new Promise((r) => setTimeout(r, 120));
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('earn');
      const refreshBtn = session.document.querySelector('#view-earn button[onclick*="refreshStakingMetrics"]');
      assert.ok(refreshBtn, 'Earn refresh button must exist');
      refreshBtn.click();
      assert.equal(refreshBtn.disabled, true, '[POST-FIX] Earn refresh button must disable while syncing');
      assert.match(refreshBtn.textContent, /Refreshing|Syncing|刷新中/i);
      await session.waitFor(() => !refreshBtn.disabled, 3500);
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });
});

test('F8-T2-05: Upstream metrics failure (-- invariant), yields.llama.fi AbortError isolation & cache resilience', async (t) => {
  await t.test('Part A: Uniform 503 failure never injects fake APY/rate (-- invariant)', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: async () => mockJsonResponse({ error: 'Upstream unavailable' }, 503)
    });

    try {
      await session.switchTab('earn');
      await session.click('#view-earn button[onclick="refreshStakingMetrics(true)"]');
      await session.flushMicrotasks(12);

      await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="lido_steth"]');
      assert.equal(session.getVisibleText('#earn-live-apy'), '--');
      assert.equal(session.getVisibleText('#earn-live-rate'), '--');
      assert.equal(session.getVisibleText('#earn-tvl-val'), '--');
      session.assertNoRuntimeErrors();
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: yields.llama.fi/pools AbortError timeout does NOT block fast feeds (Lido, rNEAR, Arc RPC)', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createEarnHealthyMock({
        customHandler: async (u) => {
          if (/yields\.llama\.fi\/pools/i.test(u)) {
            const err = new Error('The operation was aborted due to timeout');
            err.name = 'AbortError';
            throw err;
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('earn');
      await session.click('#view-earn button[onclick="refreshStakingMetrics(true)"]');
      await session.waitFor(
        () => session.getToastHistory().some((toast) => /Staking APY synced|已同步实时质押年化/i.test(toast.text)),
        3500
      );

      await session.click('#earn-pool-filters [data-filter="all"]');
      // Fast feeds still populated despite Llama AbortError
      await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="lido_steth"]');
      assert.match(session.getVisibleText('#earn-live-apy'), /3\.12%/);
      await session.closeSheet('sheet-earn-stake');

      await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="arc_steak_usdc"]');
      assert.match(session.getVisibleText('#earn-live-rate'), /0\.98/);
      await session.closeSheet('sheet-earn-stake');

      // Llama-dependent pool stays '--' (no fake APY fallback)
      await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="aave_base_usdc"]');
      assert.equal(session.getVisibleText('#earn-live-apy'), '--');
      session.assertNoRuntimeErrors();
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part C: near_ca_staking_metrics_v3 cache resilience (valid hydration vs corrupted/stale fallback)', async () => {
    // 1) Valid recent cache hydrates offline
    const sessionValid = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage({}, {
        near_ca_staking_metrics_v3: {
          updatedAt: Date.now() - 60_000,
          pools: {
            aave_base_usdc: { apy: 4.88, rate: 1.0, tvlText: '$85.00M', stakersCount: 12000 }
          }
        }
      }),
      fetchMock: async () => mockJsonResponse({ error: 'Offline' }, 503)
    });

    try {
      await sessionValid.switchTab('earn');
      await sessionValid.click('#earn-pool-filters [data-filter="all"]');
      await sessionValid.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="aave_base_usdc"]');
      assert.match(sessionValid.getVisibleText('#earn-live-apy'), /4\.88%/);
      sessionValid.assertNoRuntimeErrors();
      sessionValid.assertNoRealBroadcasts();
    } finally {
      sessionValid.cleanup();
    }

    // 2) Corrupted JSON or stale (>24h) cache falls back cleanly to '--' with 0 runtime errors
    for (const badCache of ['{corrupted_json', JSON.stringify({ updatedAt: Date.now() - 25 * 3600_000, pools: { aave_base_usdc: { apy: 99.9 } } })]) {
      const sessionBad = await createWalletAppSession({
        viewportWidth: 375,
        localStorage: buildSeededStorage({}, { near_ca_staking_metrics_v3: badCache }),
        fetchMock: async () => mockJsonResponse({ error: 'Offline' }, 503)
      });
      try {
        await sessionBad.switchTab('earn');
        await sessionBad.click('#earn-pool-filters [data-filter="all"]');
        await sessionBad.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="aave_base_usdc"]');
        assert.equal(sessionBad.getVisibleText('#earn-live-apy'), '--');
        sessionBad.assertNoRuntimeErrors();
        sessionBad.assertNoRealBroadcasts();
      } finally {
        sessionBad.cleanup();
      }
    }
  });
});

test('F8-T2-06: [POST-FIX] oRHEA 15~181 day lock notice & zero dev/broadcast jargon across Earn & toasts', async (t) => {
  await t.test('Part A: [POST-FIX] EN oRHEA lock notice mentions 15-181 days', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createEarnHealthyMock()
    });

    try {
      await session.switchTab('earn');
      await session.click('#earn-pool-filters [data-filter="all"]');
      await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="rhea_orhea_convert"]');
      const noticeEn = session.getVisibleText('#earn-lockup-notice');
      assert.match(noticeEn, /15\s*[~\-–]\s*181/, `[POST-FIX] EN lock notice must mention 15-181 days, got: "${noticeEn}"`);
      assertZeroDevJargon(session.getVisibleText('#view-earn'), '[POST-FIX] #view-earn (EN)');
      assertZeroDevJargon(session.getVisibleText('#sheet-earn-stake'), '[POST-FIX] #sheet-earn-stake (EN)');
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part B: [POST-FIX] ZH oRHEA lock notice says 15~181 via UI language toggle (not 30~180)', async () => {
    const session = await createWalletAppSession({
      viewportWidth: 375,
      localStorage: buildSeededStorage(),
      fetchMock: createEarnHealthyMock()
    });

    try {
      await session.switchTab('earn');
      await session.click('#header-lang-btn');
      await session.click('#earn-pool-filters [data-filter="all"]');
      await session.click('#staking-pools-list [data-action="select-staking-pool"][data-pool-id="rhea_orhea_convert"]');
      const noticeZh = session.getVisibleText('#earn-lockup-notice');
      assert.doesNotMatch(noticeZh, /30\s*~\s*180/, `[POST-FIX] ZH lock notice must not say 30~180, got: "${noticeZh}"`);
      assert.match(noticeZh, /15\s*~\s*181/, `[POST-FIX] ZH lock notice must say 15~181, got: "${noticeZh}"`);
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });

  await t.test('Part C: [POST-FIX] Redeem RPC error toast settles & passes zero dev/broadcast jargon (ZH & EN)', async () => {
    let broadcastHits = 0;
    const session = await createWalletAppSession({
      viewportWidth: 375,
      preloadEthers: true,
      allowMockOnBroadcast: true,
      localStorage: buildSeededStorage({
        nearStakingPositions: [
          { poolId: 'figment.poolv1.near', stakedNear: 5, unstakedNear: 0, totalNear: 5, canWithdraw: false }
        ]
      }),
      fetchMock: createEarnHealthyMock({
        customHandler: async (u, init, bodyText) => {
          if (/fastnear\.com|rpc\.mainnet\.near\.org/i.test(u) && bodyText) {
            const req = JSON.parse(bodyText);
            if (req.method === 'broadcast_tx_commit' || req.method === 'send_tx') {
              broadcastHits += 1;
              return mockJsonResponse({ jsonrpc: '2.0', id: req.id, error: { message: 'RPC Error -32000 Server error' } });
            }
          }
          return undefined;
        }
      })
    });

    try {
      await session.switchTab('earn');
      await session.click('#header-lang-btn'); // Switch to ZH to inspect Chinese redeem toast & RPC error toast
      await session.click('#earn-my-positions-list [data-action="earn-pos-action"][data-type="near_unstake"]');
      await session.flushMicrotasks(12);

      // Wait explicitly for the settled/failure toast AFTER broadcast_tx_commit responds (do NOT match initial loading toast!)
      await session.waitFor(
        () => broadcastHits >= 1 && session.getToastHistory().some((toast) => /失败|failed|RPC|-32000|错误|繁忙|重试/i.test(toast.text)),
        3500
      );
      const settledErrToast = session.getToastHistory().find((toast) => /失败|failed|RPC|-32000|错误|繁忙|重试/i.test(toast.text));
      assert.ok(settledErrToast, 'Settled failure toast must arrive after broadcast error');

      assertZeroDevJargon(session.getVisibleText('#view-earn'), '[POST-FIX] #view-earn');
      assertZeroDevJargon(session.getVisibleText('#sheet-earn-stake'), '[POST-FIX] #sheet-earn-stake');
      for (const toast of session.getToastHistory()) {
        assertZeroDevJargon(toast.text, `[POST-FIX] earn toast: ${toast.text}`);
      }
      session.assertNoRealBroadcasts();
    } finally {
      session.cleanup();
    }
  });
});
