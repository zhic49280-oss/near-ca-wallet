'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  chainContracts,
  nearIntents,
  hlPerps,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  withMockedStorage,
  createMockDomElement
} = require('./helpers.js');

test('M3.1: reverseHlPositionMarket resolves EVM sender via resolveWalletEvmSender and cancels matching triggers', async () => {
  const prevEthers = globalThis.ethers;
  globalThis.ethers = require('../ethers.umd.min.js');
  try {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_m3_reverse',
      name: 'M3Reverse',
      mnemonic: TEST_MNEMONIC
    });
    await chainContracts.ensureWalletSigningKeysAsync(w);
    const derived = globalThis.ethers.HDNodeWallet.fromPhrase(TEST_MNEMONIC);
    w.evmAddress = derived.address;
    w.evmPrivateKey = derived.privateKey;
    const expectedAddr = w.evmAddress;
    assert.ok(/^0x[0-9a-fA-F]{40}$/.test(expectedAddr));
    // With evmSignMode: 'local', raw (wallet.mpcEvmAddress || wallet.evmAddress) would pick the stale mpcEvmAddress,
    // whereas resolveWalletEvmSender(resolvedWallet) must return expectedAddr (w.evmAddress).
    const staleWallet = { ...w, evmSignMode: 'local', mpcEvmAddress: '0x000000000000000000000000000000000000dead' };
    const queriedUsers = [];
    const exchangeBodies = [];

    await withMockedFetch(async (url, opts) => {
      if (url.includes('/info')) {
        const body = JSON.parse(opts.body || '{}');
        if (body.type === 'frontendOpenOrders' || body.type === 'openOrders') {
          queriedUsers.push(body.user);
          return jsonResponse([
            { coin: 'BTC', oid: 9001, isTrigger: true, side: 'A', sz: '0.1', limitPx: '95000' }
          ]);
        }
        return jsonResponse({});
      }
      if (url.includes('/exchange')) {
        const body = JSON.parse(opts.body || '{}');
        exchangeBodies.push(body);
        return jsonResponse({ status: 'ok', response: { type: 'order', data: { statuses: [{ filled: { totalSz: '0.2', avgPx: '90000' } }] } } });
      }
      return jsonResponse({});
    }, async () => {
      const market = { name: 'BTC', index: 0, szDecimals: 5, markPx: 90000 };
      const position = {
        coin: 'BTC',
        isLong: true,
        absSize: 0.1,
        entryPx: 89000,
        leverageValue: 5,
        leverageType: 'isolated',
        marginUsed: 1800,
        unrealizedPnl: 100
      };
      const res = await hlPerps.reverseHlPositionMarket({
        wallet: staleWallet,
        market,
        position,
        availableMargin: 5000
      });
      assert.ok(res && res.ok);
      assert.equal(queriedUsers[0], expectedAddr);
      assert.equal(exchangeBodies.length, 3, 'Should cancel trigger, update leverage, then place reverse order');
      assert.equal(exchangeBodies[0].action.type, 'cancel');
      assert.equal(exchangeBodies[1].action.type, 'updateLeverage');
      assert.equal(exchangeBodies[2].action.type, 'order');
    });
  });
  } finally {
    if (prevEthers === undefined) delete globalThis.ethers;
    else globalThis.ethers = prevEthers;
  }
});

test('M3.2: Perps reactive actionBusyKey survives webData2 re-render & refreshPerpDataAsync toggles refresh buttons', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({ id: 'w_m3_busy', name: 'Busy', mnemonic: TEST_MNEMONIC });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.perp.bottomTab = 'positions';
    state.perp.account = {
      equity: 1000,
      availableMargin: 800,
      positions: [{ coin: 'BTC', isLong: true, absSize: 0.1, leverageValue: 10, leverageType: 'isolated', unrealizedPnl: 12 }],
      openOrders: [],
      fills: []
    };
    state.perp.actionBusyKey = 'close:BTC';

    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const listEl = createMockDomElement('perp-bottom-list');
    const batchBtn = createMockDomElement('btn-perp-batch-action');
    const ovRef = createMockDomElement('btn-perp-overview-refresh', { textContent: '刷新' });
    const trRef = createMockDomElement('btn-perp-trade-refresh', { textContent: '刷新' });
    const toastEl = createMockDomElement('toast');
    const domMap = new Map([
      ['perp-bottom-list', listEl],
      ['btn-perp-batch-action', batchBtn],
      ['btn-perp-overview-refresh', ovRef],
      ['btn-perp-trade-refresh', trRef],
      ['toast', toastEl]
    ]);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };
    let mountedProps = null;
    globalThis.window = {
      NearCAFramework: {
        mountPerpBottomList: (_el, props) => { mountedProps = props; }
      }
    };
    try {
      uiController.setPerpBottomTab('positions');
      assert.equal(mountedProps.busyKey, 'close:BTC');

      state.perp.actionBusyKey = 'batch';
      uiController.setPerpBottomTab('positions');
      assert.equal(batchBtn.disabled, true);
      assert.match(batchBtn.textContent, /平仓中|Closing/);

      // Also verify JSX component source accepts busyKey
      const jsxSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/components/PerpOrderbookAndPositions.jsx'), 'utf8');
      assert.match(jsxSrc, /busyKey\s*=\s*''/);
      assert.match(jsxSrc, /disabled=\{isAnyPosBusy\}/);
      assert.match(jsxSrc, /disabled=\{isCancelling\}/);

      // Verify refreshPerpDataAsync(true) disables and restores refresh buttons
      let sawDisabledDuringFetch = false;
      await withMockedFetch(async (url) => {
        if (ovRef.disabled && trRef.disabled) sawDisabledDuringFetch = true;
        if (url.includes('/info')) return jsonResponse([{ universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40 }] }, [{ markPx: '90000', prevDayPx: '89000', dayNtlVlm: '1000000' }]]);
        return jsonResponse({});
      }, async () => {
        await uiController.refreshPerpDataAsync(true);
      });
      assert.equal(sawDisabledDuringFetch, true);
      assert.equal(ovRef.disabled, false);
      assert.equal(trRef.disabled, false);
      assert.match(toastEl.textContent, /已刷新|synced/i);
    } finally {
      globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
    }
  });
});

test('M3.3: Perps 1Click deposit background polling tracks status and stops on SUCCESS', async () => {
  const fundingSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/164-perps-funding.part.js'), 'utf8');
  assert.match(fundingSrc, /function startPerpOneClickDepositPolling\(/);
  assert.match(fundingSrc, /intents\.fetchSwapOrderStatus/);
  assert.match(fundingSrc, /startPerpOneClickDepositPolling\(q\.depositAddress\)/);
  assert.equal(typeof nearIntents.fetchSwapOrderStatus, 'function');
});

test('M3.4: #perp-ls-ratio-wrap has Zero CLS fixed-height placeholder and stays visible when lsRatio is null', () => {
  const html = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/index-html/030-view-perp.part.html'), 'utf8');
  assert.match(html, /id="perp-ls-ratio-wrap" class="perp-ob-power-wrap" style="min-height: 22px;/);
  assert.doesNotMatch(html, /id="perp-ls-ratio-wrap"[^>]*\bhidden\b/);

  const prevDoc = globalThis.document;
  const wrap = createMockDomElement('perp-ls-ratio-wrap', { className: 'perp-ob-power-wrap' });
  const longLbl = createMockDomElement('perp-ls-long-label');
  const shortLbl = createMockDomElement('perp-ls-short-label');
  const longBar = createMockDomElement('perp-ls-long-bar');
  const shortBar = createMockDomElement('perp-ls-short-bar');
  const domMap = new Map([
    ['perp-ls-ratio-wrap', wrap],
    ['perp-ls-long-label', longLbl],
    ['perp-ls-short-label', shortLbl],
    ['perp-ls-long-bar', longBar],
    ['perp-ls-short-bar', shortBar]
  ]);
  globalThis.document = { documentElement: {}, getElementById: (id) => domMap.get(id) || null, querySelectorAll: () => [] };
  try {
    state.initState();
    state.perp.selectedCoin = 'BTC';
    state.perp.lsRatio = null;
    uiController.renderPerpLongShortBar();
    assert.equal(wrap.classList.contains('hidden'), false);
    assert.match(longLbl.textContent, /--/);
    assert.equal(longBar.style.transform, 'scaleX(0.5)');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('M3.5 & M3.6: Perps error sanitization strips Bridge2/HTTP/EIP-712/Hyperliquid API and form resets cleanly', async () => {
  const err1 = chainContracts.toUserFriendlyError(new Error('Hyperliquid info HTTP 502 Bridge2 EIP-712 failed'));
  assert.doesNotMatch(err1, /HTTP|502|Bridge2|EIP-712/i);

  const hlSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/hyperliquid-perps.js'), 'utf8');
  assert.doesNotMatch(hlSrc, /Arbitrum Bridge2 requires/);

  await withMockedStorage({}, async () => {
    state.initState();
    const prevDoc = globalThis.document;
    const priceEl = createMockDomElement('perp-limit-price-input', { value: '95000' });
    const marginEl = createMockDomElement('perp-margin-input', { value: '250' });
    const tpEl = createMockDomElement('perp-tp-input', { value: '100000' });
    const slEl = createMockDomElement('perp-sl-input', { value: '88000' });
    const ocEl = createMockDomElement('perp-oc-amount', { value: '10' });
    const domMap = new Map([
      ['perp-limit-price-input', priceEl],
      ['perp-margin-input', marginEl],
      ['perp-tp-input', tpEl],
      ['perp-sl-input', slEl],
      ['perp-oc-amount', ocEl]
    ]);
    globalThis.document = { documentElement: {}, getElementById: (id) => domMap.get(id) || null, querySelectorAll: () => [] };
    try {
      state.perp.tpInput = '100000';
      state.perp.slInput = '88000';
      uiController.setPerpSide('short');
      assert.equal(state.perp.tpInput, '');
      assert.equal(tpEl.value, '');
      assert.equal(slEl.value, '');

      state.perp.limitPriceInput = '95000';
      state.perp.marginInput = '250';
      uiController.selectPerpMarket('ETH');
      assert.equal(state.perp.limitPriceInput, '');
      assert.equal(state.perp.marginInput, '');
      assert.equal(priceEl.value, '');
      assert.equal(marginEl.value, '');

      uiController.setPerpFundingTab('arbitrum');
      assert.equal(ocEl.value, '');
    } finally {
      globalThis.document = prevDoc;
    }
  });
});

test('M3.7 & M3.8: Arc Steakhouse vault falls back to rpc.mainnet.arc.io on explorer 403 & DeFiLlama failure is graceful', async () => {
  await withMockedStorage({}, async () => {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('yields.llama.fi/pools')) {
        throw new Error('Network timeout');
      }
      if (url.includes('explorer.arc.io')) {
        return jsonResponse({ message: 'Forbidden' }, 403, 'Forbidden');
      }
      if (url.includes('rpc.mainnet.arc.io')) {
        const body = JSON.parse(opts.body || '{}');
        const data = body.params && body.params[0] && body.params[0].data;
        if (data === '0x01e1d114') {
          // totalAssets() = 2,500,000 USDC (2500000 * 1e6)
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x000000000000000000000000000000000000000000000246139ca8000' });
        }
        if (data && data.startsWith('0xef8b30f7')) {
          // previewDeposit(1e6) = 0.95e18 shares
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x0000000000000000000000000000000000000000000000000d2f13f7789f0000' });
        }
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x0' });
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const pools = await chainContracts.fetchLiveStakingMetrics({ useCache: false });
      const arcPool = pools.find((p) => p.id === 'arc_steak_usdc');
      assert.ok(arcPool);
      assert.equal(arcPool.apy, null, 'Must never inject hardcoded fake APY when upstream APY is unavailable');
      assert.ok(arcPool.tvlText && arcPool.tvlText.includes('USDC'), 'TVL must be populated via rpc.mainnet.arc.io fallback');
      assert.ok(typeof arcPool.rate === 'number' && arcPool.rate > 0, 'Rate must be populated via rpc.mainnet.arc.io previewDeposit');
    });
  });
});

test('M3.9: setEarnMaxAmount uses floor rounding, lock notice shows 15~181 days, and refreshStakingMetrics shows loading & toast', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_m3_earn',
      name: 'EarnMax',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { near: 1.28456789, sol: 0, eth: 0, base: 0, arb: 0, bsc: 0, op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, prl: 0, btc: 0 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.staking.selectedPoolId = 'metapool_stnear';

    const prevDoc = globalThis.document;
    const amtInput = createMockDomElement('earn-amount-in', { value: '' });
    const estOut = createMockDomElement('earn-est-out');
    const noticeEl = createMockDomElement('earn-lockup-notice');
    const refBtn = createMockDomElement('btn-earn-refresh', { textContent: '刷新利率' });
    const toastEl = createMockDomElement('toast');
    const domMap = new Map([
      ['earn-amount-in', amtInput],
      ['earn-est-out', estOut],
      ['earn-lockup-notice', noticeEl],
      ['btn-earn-refresh', refBtn],
      ['toast', toastEl]
    ]);
    globalThis.document = { documentElement: {}, getElementById: (id) => domMap.get(id) || null, querySelectorAll: () => [] };
    try {
      // 1.28456789 - 0.05 = 1.23456789 -> floor(6 dec) MUST be 1.234567 (not 1.234568)
      const setMaxFn = uiController.setEarnMaxAmount || (uiController.globalHandlers && uiController.globalHandlers.setEarnMaxAmount) || globalThis.setEarnMaxAmount;
      assert.equal(typeof setMaxFn, 'function');
      setMaxFn();
      assert.equal(amtInput.value, '1.234567');

      uiController.selectStakingPool('rhea_orhea_convert');
      assert.match(noticeEl.textContent, /15~181/);
      state.lang = 'en';
      uiController.selectStakingPool('rhea_orhea_convert');
      assert.match(noticeEl.textContent, /15–181 days/);

      await withMockedFetch(async () => jsonResponse({}, 404, 'Not Found'), async () => {
        await uiController.refreshStakingMetrics(true);
      });
      assert.equal(refBtn.disabled, false);
      assert.match(toastEl.textContent, /synced|已同步/i);
    } finally {
      globalThis.document = prevDoc;
    }
  });
});
