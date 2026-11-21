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

test('v6.11 Orderbook 10-Level Alignment, Coin Units on Depth Bar & Zero Wallet/Perp Stacking', async () => {
  const levels20Bids = Array.from({ length: 12 }, (_, i) => ({ px: String(61500 - i), sz: '1.5', n: 2 }));
  const levels20Asks = Array.from({ length: 12 }, (_, i) => ({ px: String(61501 + i), sz: '2.0', n: 3 }));
  await withMockedFetch(async () => jsonResponse({ levels: [levels20Bids, levels20Asks] }), async () => {
    const ob = await hlPerps.fetchHlOrderbook('BTC');
    assert.equal(ob.bids.length, 10, 'Orderbook must return 10 bid levels');
    assert.equal(ob.asks.length, 10, 'Orderbook must return 10 ask levels');
    assert.equal(ob.bidTotalSz, 18);
    assert.equal(ob.askTotalSz, 24);
  });

  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({ id: 'w_v611_ob', mnemonic: TEST_MNEMONIC, nearNamedAccount: 'alice.near' });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.activeTab = 'perp';
    state.perp.selectedCoin = 'BTC';
    state.perp.orderbook = {
      bids: levels20Bids.slice(0, 10).map((r) => ({ px: Number(r.px), sz: Number(r.sz), n: r.n })),
      asks: levels20Asks.slice(0, 10).map((r) => ({ px: Number(r.px), sz: Number(r.sz), n: r.n })),
      bidTotalSz: 40.39,
      askTotalSz: 159.07,
      bidOrderCount: 79,
      askOrderCount: 174,
      bidRatioPct: 20.25
    };

    const prevDoc = globalThis.document;
    const domMap = new Map([
      ['view-onboarding', createMockDomElement('view-onboarding', { classes: ['hidden'] })],
      ['bottom-nav', createMockDomElement('bottom-nav')],
      ['view-wallet', createMockDomElement('view-wallet', { classes: ['hidden'] })],
      ['view-swap', createMockDomElement('view-swap', { classes: ['hidden'] })],
      ['view-perp', createMockDomElement('view-perp')],
      ['view-earn', createMockDomElement('view-earn', { classes: ['hidden'] })],
      ['view-hub', createMockDomElement('view-hub', { classes: ['hidden'] })],
      ['perp-ob-bids', createMockDomElement('perp-ob-bids')],
      ['perp-ob-asks', createMockDomElement('perp-ob-asks')],
      ['perp-ob-bid-summary', createMockDomElement('perp-ob-bid-summary')],
      ['perp-ob-ask-summary', createMockDomElement('perp-ob-ask-summary')],
      ['perp-ob-bid-bar', createMockDomElement('perp-ob-bid-bar')],
      ['perp-ob-ask-bar', createMockDomElement('perp-ob-ask-bar')],
      ['perp-ob-bid-sz-hdr', createMockDomElement('perp-ob-bid-sz-hdr')],
      ['perp-ob-ask-sz-hdr', createMockDomElement('perp-ob-ask-sz-hdr')]
    ]);
    const navBtns = ['wallet', 'swap', 'perp', 'hub'].map((tName) => {
      const el = createMockDomElement(`nav-${tName}`, { classes: ['nav-item'] });
      el.setAttribute('data-tab', tName);
      return el;
    });
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: (sel) => (sel === '.nav-item' ? navBtns : []),
      querySelector: () => null
    };
    try {
      uiController.renderAll();
      assert.equal(state.activeTab, 'perp', 'renderAll must preserve activeTab=perp');
      assert.equal(domMap.get('view-wallet').classList.contains('hidden'), true, 'Home view must remain hidden on perp tab');
      assert.equal(domMap.get('view-perp').classList.contains('hidden'), false, 'Perp view must remain visible on perp tab');
      assert.equal(navBtns.find((b) => b.getAttribute('data-tab') === 'perp').classList.contains('active'), true);

      const bidHtml = domMap.get('perp-ob-bids').innerHTML;
      const askHtml = domMap.get('perp-ob-asks').innerHTML;
      assert.equal((bidHtml.match(/class="perp-ob-row bid"/g) || []).length, 10);
      assert.equal((askHtml.match(/class="perp-ob-row ask"/g) || []).length, 10);
      assert.ok(bidHtml.includes('<div class="perp-ob-row-depth"'), 'Depth overlay must use <div class="perp-ob-row-depth"> so CSS > span rule does not displace text');
      assert.ok(domMap.get('perp-ob-bid-summary').textContent.includes('40.39 BTC'));
      assert.ok(domMap.get('perp-ob-bid-sz-hdr').textContent.includes('BTC'));
    } finally {
      globalThis.document = prevDoc;
    }
  });
});

test('v6.12 Core Fixes: prlscan.com URLs, Instant RHEA Icon, Dynamic Icon Cache, PRL Optimistic Spend & Silky PTR', async () => {
  // 1. Canonical prlscan.com URLs (no dead explorer.prlscan.com)
  const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'ui-controller.js'), 'utf8');
  const miningSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'mining-pro.js'), 'utf8');
  assert.equal(uiSrc.includes('explorer.prlscan.com'), false, 'ui-controller.js must not reference dead explorer.prlscan.com');
  assert.equal(miningSrc.includes('explorer.prlscan.com'), false, 'mining-pro.js must not reference dead explorer.prlscan.com');
  assert.equal(uiController.getExplorerTxUrl('prl', 'abc123'), 'https://prlscan.com/tx/abc123');
  assert.equal(uiController.getExplorerAddressUrl('prl', 'prl1test'), 'https://prlscan.com/address/prl1test');

  // 2. Instant RHEA inline PNG icon & dynamic icon localStorage persistence
  assert.ok(tokenRegistry.TOKEN_ICON_MAP.RHEA && tokenRegistry.TOKEN_ICON_MAP.RHEA.startsWith('data:image/png;base64,'));
  const resolvedRhea = tokenRegistry.resolveTokenIcon({ symbol: 'RHEA', blockchain: 'near', contractAddress: 'token.rhealab.near' });
  assert.ok(resolvedRhea.primaryUrl.startsWith('data:image/png;base64,'), 'RHEA must resolve immediately to inline PNG without text fallback flash');

  await withMockedStorage({}, async () => {
    tokenRegistry.registerDynamicTokenIcons({ TESTDYN: 'https://example.com/dyn.png' }, { 'dyn.near': 'https://example.com/dyn.png' });
    const rawSaved = globalThis.localStorage.getItem('near_ca_dynamic_icons_v1');
    assert.ok(rawSaved && rawSaved.includes('https://example.com/dyn.png'), 'registerDynamicTokenIcons must persist to localStorage');
  });

  // 3. PRL optimistic spend protection & remote on-chain precedence in history merge
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_v612_prl',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { prl: 13.67687844, near: 1, sol: 0, eth: 0, btc: 0 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    const prevDoc = globalThis.document;
    globalThis.document = {
      getElementById: () => null,
      querySelectorAll: () => [],
      querySelector: () => null
    };
    try {
      const spendRes = uiController.applyOptimisticChainSpend(w, 'prl', 1, 0.00100646, '55216258test');
      assert.ok(spendRes);
      assert.equal(Number(w.nativeBalances.prl.toFixed(8)), 12.67587198, 'PRL balance must deduct amount + fee immediately on send');
      // Stale node response still returns old 13.67687844 before indexing mempool
      const guarded = uiController.reconcileFetchedChainBalance(w, 'prl', 13.67687844);
      assert.equal(Number(guarded.toFixed(8)), 12.67587198, 'Stale pre-mempool fetch must not revert optimistic deduction');
      // Once node indexes new balance 12.67587198, accept live balance cleanly
      const settled = uiController.reconcileFetchedChainBalance(w, 'prl', 12.67587198);
      assert.equal(Number(settled.toFixed(8)), 12.67587198);

      // Remote on-chain tx overrides local unconfirmed draft in merged history
      uiController.recordWalletActivity(w, { type: 'send', symbol: 'PRL', chain: 'prl', amount: 1, txHash: '55216258test', title: 'Local' });
      const merged = uiController.getMergedTokenHistoryItems(w, 'PRL', 'all', [
        { id: 'prl_55216258test', type: 'send', symbol: 'PRL', chain: 'prl', amount: 1, fee: 0.00100646, netAmount: -1.00100646, confirmations: 5, blockHeight: 146022, txHash: '55216258test', timestamp: 1795184090, source: 'onchain' }
      ]);
      assert.equal(merged.length, 1);
      assert.equal(merged[0].fee, 0.00100646);
      assert.equal(merged[0].netAmount, -1.00100646);
      assert.equal(merged[0].confirmations, 5);
      assert.equal(merged[0].source, 'onchain');
    } finally {
      globalThis.document = prevDoc;
    }
  });

  // 4. Silky GPU PTR exponential damping & CSS rules
  assert.equal(uiController.computePtrPullDistance(0), 0);
  const d50 = uiController.computePtrPullDistance(50);
  const d100 = uiController.computePtrPullDistance(100);
  const d300 = uiController.computePtrPullDistance(300);
  assert.ok(d50 > 0 && d50 < d100 && d100 < d300 && d300 < 68, 'PTR damping must be smooth, monotonic, and capped');
  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.ok(cssSrc.includes('overscroll-behavior-y: contain'));
  assert.ok(cssSrc.includes('#view-wallet.ptr-spring'));
  assert.equal(cssSrc.includes('transition: height 0.2s'), false, 'PTR indicator must not animate height layout reflow');
});

test('v6.13 Top-3 Compact History, Full History Sheet & In-App Tx Detail Sheet (Token Detail + Mining)', async () => {
  const realPrlAddr = 'prl1p22hzufr46n6fa4yj38zckc9n8rsyhq2n39fjldg7pg78s8vz2zks785frn';
  const realPrlTxId = '55216258e78a8b40704fdf8d27db1c8742da9e6af19660ffbb2f10ce7573211c';
  const txsList = Array.from({ length: 5 }, (_, i) => ({
    txid: i === 0 ? realPrlTxId : `prl_tx_00${i}`,
    block_height: 146022 - i,
    confirmations: i + 1,
    time: 1795184090 - i * 3600,
    delta_grains: i === 0 ? -100100646 : 103363925,
    fee_grains: i === 0 ? 100646 : 43172,
    status: 'confirmed',
    is_coinbase: false
  }));

  await withMockedStorage({}, async () => {
    state.initState();
    const wallet = state.normalizeWalletRecord({
      id: 'w_v613_tx',
      mnemonic: TEST_MNEMONIC,
      address: realPrlAddr,
      nativeBalances: { prl: 12.67587198, near: 1, sol: 0, eth: 0, btc: 0 }
    });
    state.wallets = [wallet];
    state.activeWalletId = wallet.id;

    const prevDoc = globalThis.document;
    const domMap = new Map([
      ['sheet-backdrop', createMockDomElement('sheet-backdrop')],
      ['sheet-token-detail', createMockDomElement('sheet-token-detail')],
      ['sheet-tx-history', createMockDomElement('sheet-tx-history')],
      ['sheet-tx-detail', createMockDomElement('sheet-tx-detail')],
      ['sheet-mining-pro', createMockDomElement('sheet-mining-pro')],
      ['token-detail-icon', createMockDomElement('token-detail-icon')],
      ['token-detail-title', createMockDomElement('token-detail-title')],
      ['token-detail-chains', createMockDomElement('token-detail-chains')],
      ['token-detail-balance', createMockDomElement('token-detail-balance')],
      ['token-detail-usd', createMockDomElement('token-detail-usd')],
      ['token-detail-addr-row', createMockDomElement('token-detail-addr-row')],
      ['token-detail-addr', createMockDomElement('token-detail-addr')],
      ['token-detail-explorer-link', createMockDomElement('token-detail-explorer-link')],
      ['token-detail-breakdown-card', createMockDomElement('token-detail-breakdown-card')],
      ['token-detail-breakdown-list', createMockDomElement('token-detail-breakdown-list')],
      ['token-detail-earn-card', createMockDomElement('token-detail-earn-card')],
      ['token-detail-earn-list', createMockDomElement('token-detail-earn-list')],
      ['token-detail-price-label', createMockDomElement('token-detail-price-label')],
      ['token-detail-price-val', createMockDomElement('token-detail-price-val')],
      ['token-detail-history-all-btn', createMockDomElement('token-detail-history-all-btn', { classes: ['hidden'] })],
      ['token-detail-history-list', createMockDomElement('token-detail-history-list')],
      ['tx-history-sheet-title', createMockDomElement('tx-history-sheet-title')],
      ['tx-history-full-list', createMockDomElement('tx-history-full-list')],
      ['tx-detail-body', createMockDomElement('tx-detail-body')],
      ['mining-payouts-list', createMockDomElement('mining-payouts-list')],
      ['mining-payouts-all-btn', createMockDomElement('mining-payouts-all-btn', { classes: ['hidden'] })]
    ]);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => Array.from(domMap.values()).filter((e) => e.classList.contains('bottom-sheet')),
      querySelector: () => null
    };

    try {
      const activePrlAddr = wallet.address;
      await withMockedFetch(async (url) => {
        if (url.includes(`/v1/addresses/${encodeURIComponent(activePrlAddr)}/txs`)) {
          return jsonResponse({ items: txsList });
        }
        if (url.includes(`/v1/txs/${realPrlTxId}`)) {
          return jsonResponse({
            inputs: [{ prev_address: activePrlAddr, prev_value_grains: 108468921 }],
            outputs: [
              { address: 'prl1phgudud0sz6n8859t70c2r6h89gys040hrul49altjqyrt7tp26uq5j6gm0', value_grains: 100000000 },
              { address: activePrlAddr, value_grains: 8368275 }
            ],
            transaction: {
              txid: realPrlTxId,
              block_height: 146022,
              status: 'confirmed',
              confirmed_at: '2026-11-20T14:14:50Z',
              fee_grains: 100646,
              input_grains: 108468921,
              output_grains: 108368275,
              confirmations: 5
            }
          });
        }
        return jsonResponse({}, 404);
      }, async () => {
        uiController.openTokenDetailSheet('PRL', 'prl');
        await new Promise((r) => setTimeout(r, 40));

        const compactHtml = domMap.get('token-detail-history-list').innerHTML;
        assert.equal((compactHtml.match(/class="tx-compact-row"/g) || []).length, 3, 'Token detail preview must show top 3 items only');
        assert.ok(compactHtml.includes('-1 PRL'), 'Send row must display transfer amount -1 PRL');
        assert.equal(domMap.get('token-detail-history-all-btn').classList.contains('hidden'), false, 'All > button must be visible');

        uiController.openAllTokenHistorySheet();
        assert.equal(domMap.get('sheet-tx-history').classList.contains('open'), true);
        const fullHtml = domMap.get('tx-history-full-list').innerHTML;
        assert.equal((fullHtml.match(/class="tx-card-full"/g) || []).length, 5, 'Full history sheet must list all 5 items');

        uiController.openTxDetailSheet(state.txModal.items[0], 'sheet-tx-history');
        assert.equal(domMap.get('sheet-tx-detail').classList.contains('open'), true);
        await new Promise((r) => setTimeout(r, 40));
        const detailHtml = domMap.get('tx-detail-body').innerHTML;
        assert.ok(detailHtml.includes(realPrlTxId));
        assert.ok(detailHtml.includes(`https://prlscan.com/tx/${realPrlTxId}`));
        assert.ok(detailHtml.includes('146022'));
        assert.ok(detailHtml.includes('0.00100646 PRL'));
        assert.ok(detailHtml.includes('-1.00100646 PRL'));
        assert.ok(detailHtml.includes('1.08368275 PRL'));

        // Verify Mining telemetry payouts also fold to top-3 + All > button
        state.mining.minerAddress = activePrlAddr;
        state.mining.telemetry = {
          address: activePrlAddr,
          workers: [],
          payoutHistory: txsList.map((t, i) => ({
            txid: t.txid,
            amountPrl: 1.03363925,
            timestamp: new Date((1795184090 - i * 3600) * 1000).toISOString(),
            status: 'confirmed'
          }))
        };
        domMap.get('sheet-mining-pro').classList.add('open');
        uiController.renderAll();
        const miningHtml = domMap.get('mining-payouts-list').innerHTML;
        assert.equal((miningHtml.match(/class="tx-compact-row"/g) || []).length, 3, 'Mining payouts must show top 3 compact rows');
        assert.equal(domMap.get('mining-payouts-all-btn').classList.contains('hidden'), false);
      });
    } finally {
      globalThis.document = prevDoc;
    }
  });
});

test('v6.14 Swap/Limit Live USD Prices, Smart Price Orientation & Zero-Lag Perp L/S Ratio', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_v614',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { sol: 1.5, near: 2.0 },
      solSplBalances: {
        EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { formatted: 500, decimals: 6 }
      }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.lang = 'zh';
    state.liveTokens = [
      { assetId: 'nep141:sol.omft.near', symbol: 'SOL', blockchain: 'sol', contractAddress: 'So11111111111111111111111111111111111111112', decimals: 9, price: 71.54 },
      { assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', blockchain: 'sol', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, price: 1.0 }
    ];
    state.pricesUpdatedAt = Date.now();

    const prevDoc = globalThis.document;
    const domMap = new Map();
    const getOrMake = (id) => {
      if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
      return domMap.get(id);
    };
    const pill0 = createMockDomElement('pill0', { attributes: { 'data-offset-idx': '0' } });
    const pill1 = createMockDomElement('pill1', { attributes: { 'data-offset-idx': '1' } });
    const pill2 = createMockDomElement('pill2', { attributes: { 'data-offset-idx': '2' } });
    const pill3 = createMockDomElement('pill3', { attributes: { 'data-offset-idx': '3' } });
    globalThis.document = {
      activeElement: null,
      getElementById: (id) => getOrMake(id),
      querySelector: () => null,
      querySelectorAll: (sel) => (sel.includes('#limit-offset-pills') ? [pill0, pill1, pill2, pill3] : [])
    };

    try {
      // 1. Swap unit price display + clickable rate orientation toggle
      state.swap.fromAssetId = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';
      state.swap.toAssetId = 'nep141:sol.omft.near';
      state.swap.rateInverted = false;
      uiController.renderSwapView();
      assert.ok(getOrMake('swap-from-net-label').textContent.includes('$1.00'));
      assert.ok(getOrMake('swap-to-net-label').textContent.includes('$71.54'));
      assert.ok(getOrMake('swap-quote-rate').textContent.startsWith('1 USDC ≈'));
      uiController.toggleSwapRateOrientation();
      assert.ok(getOrMake('swap-quote-rate').textContent.startsWith('1 SOL ≈ 71.54 USDC'));

      // 2. Limit Order smart orientation (selling USDC for SOL auto-inverts to 1 SOL = X USDC)
      state.limit.chain = 'sol';
      state.limit.sellContract = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      state.limit.buyContract = 'So11111111111111111111111111111111111111112';
      state.limit.priceInverted = null;
      state.limit.liveMarketRate = 1 / 71.54;
      state.limit.targetRate = (1 / 71.54).toPrecision(6);
      uiController.renderLimitOrderView();

      assert.equal(getOrMake('limit-rate-prefix').textContent, '1 SOL =');
      assert.equal(getOrMake('limit-rate-suffix').textContent, 'USDC');
      assert.ok(getOrMake('limit-market-rate').textContent.includes('1 SOL = 71.54 USDC'));
      assert.equal(pill2.textContent, '-5%');
      assert.ok(getOrMake('limit-target-usd-hint').textContent.includes('1 SOL ≈ $71.54'));

      // Clicking -5% pill reduces display price by 5% while storing canonical rateOutPerIn
      uiController.applyLimitRateOffsetByIndex(2);
      const dispAfterDip = Number(getOrMake('limit-target-rate').value);
      assert.ok(Math.abs(dispAfterDip - 71.54 * 0.95) < 0.05);
      const canonicalAfterDip = Number(state.limit.targetRate);
      assert.ok(canonicalAfterDip > 1 / 71.54, 'Lower SOL buy price yields more SOL per 1 USDC');

      // Manual flip switches back to 1 USDC = SOL and flips offset pill labels to +5%
      uiController.toggleLimitPriceOrientation();
      assert.equal(getOrMake('limit-rate-prefix').textContent, '1 USDC =');
      assert.equal(pill2.textContent, '+5%');

      // 3. Binance Global Account L/S Ratio fetch, 90s cache, error backoff & Perp UI hide/show
      let binanceCalls = 0;
      await withMockedFetch(async (url) => {
        binanceCalls++;
        if (url.includes('symbol=BTCUSDT')) {
          return jsonResponse([{ symbol: 'BTCUSDT', longAccount: '0.6120', shortAccount: '0.3880', longShortRatio: '1.5773', timestamp: 1795185000000 }]);
        }
        if (url.includes('symbol=1000PEPEUSDT')) {
          return jsonResponse([{ symbol: '1000PEPEUSDT', longAccount: '0.4510', shortAccount: '0.5490', longShortRatio: '0.8215', timestamp: 1795185000000 }]);
        }
        return jsonResponse({ code: -1121, msg: 'Invalid symbol.' }, 400);
      }, async () => {
        const btcLs = await hlPerps.fetchGlobalLongShortAccountRatio('BTC');
        assert.ok(btcLs && Math.abs(btcLs.longPct - 61.2) < 0.01);
        const btcLsCached = await hlPerps.fetchGlobalLongShortAccountRatio('BTC');
        assert.equal(btcLsCached.symbol, 'BTCUSDT');
        assert.equal(binanceCalls, 1, 'Second BTC L/S lookup within 90s must hit cache');

        const pepeLs = await hlPerps.fetchGlobalLongShortAccountRatio('kPEPE');
        assert.equal(pepeLs.symbol, '1000PEPEUSDT');

        state.perp.selectedCoin = 'BTC';
        await uiController.refreshPerpLongShortAsync('BTC');
        assert.equal(getOrMake('perp-ls-ratio-wrap').classList.contains('hidden'), false);
        assert.ok(getOrMake('perp-ls-long-label').textContent.includes('61.2%'));
        assert.ok(getOrMake('perp-ls-short-label').textContent.includes('38.8%'));

        // Failure hides bar cleanly and caches failure backoff
        state.perp.selectedCoin = 'UNKNOWNCOIN';
        const missingLs = await uiController.refreshPerpLongShortAsync('UNKNOWNCOIN');
        assert.equal(missingLs, null);
        assert.equal(getOrMake('perp-ls-ratio-wrap').classList.contains('hidden'), true);
      });
    } finally {
      globalThis.document = prevDoc;
    }
  });
});

test('v6.15 Flagship Hub Redesign, Merged NEAR Account/Keys & Lossless .near DeleteAccount Sweep', async () => {
  // 1. Borsh DeleteAccount action tag=7 + beneficiaryId
  const delBytes = chainContracts.buildDeleteAccountActionBytes({ beneficiaryId: 'alice.near' });
  assert.equal(delBytes[0], 7, 'Action::DeleteAccount tag must be 7');
  const parsedBeneficiary = readBorshString(Buffer.from(delBytes), 1);
  assert.equal(parsedBeneficiary.value, 'alice.near');
  assert.equal(parsedBeneficiary.nextOffset, delBytes.length);
  assert.throws(() => chainContracts.buildDeleteAccountActionBytes({ beneficiaryId: '' }), /DeleteAccount|beneficiary|受益账户/i);

  // 2. checkNearAccountAvailability
  await withMockedFetch(async (url, opts) => {
    const body = JSON.parse(opts.body);
    const target = body.params?.account_id;
    if (target === 'fresh123.near') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, error: { cause: { name: 'UNKNOWN_ACCOUNT' }, message: 'account fresh123.near does not exist' } });
    }
    return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { amount: '1000000000000000000000000' } });
  }, async () => {
    const avail = await chainContracts.checkNearAccountAvailability('fresh123.near');
    assert.equal(avail.available, true);
    assert.equal(avail.exists, false);

    const taken = await chainContracts.checkNearAccountAvailability('taken.near');
    assert.equal(taken.available, false);
    assert.equal(taken.exists, true);

    await assert.rejects(() => chainContracts.checkNearAccountAvailability('invalid-domain'), /\.near/);
  });

  // 3. registerNearNamedAccountOnChain: <0.055 NEAR blocked locally, 0 FT -> DeleteAccount sweep, >0 FT -> safe transfer
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const lowBalWallet = state.normalizeWalletRecord({
    id: 'w_v615_low',
    mnemonic: TEST_MNEMONIC,
    nearAddress: keys.nearAddress,
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nativeBalances: { near: 0.04 }
  });
  let rpcCallsLow = 0;
  await withMockedFetch(async () => {
    rpcCallsLow++;
    return jsonResponse({});
  }, async () => {
    await assert.rejects(
      () => chainContracts.registerNearNamedAccountOnChain({ wallet: lowBalWallet, newAccountId: 'alice.near' }),
      /NEAR|余额不足|Insufficient/i
    );
    assert.equal(rpcCallsLow, 0, 'Must pre-validate >=0.055 NEAR locally before hitting RPC');
  });

  // 3b. 0 FT -> DeleteAccount full sweep
  const zeroFtWallet = state.normalizeWalletRecord({
    id: 'w_v615_zeroft',
    mnemonic: TEST_MNEMONIC,
    nearAddress: keys.nearAddress,
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nativeBalances: { near: 0.2 },
    nearNep141Balances: {}
  });
  const broadcastsZeroFt = [];
  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/')) {
      return jsonResponse({ account_id: keys.nearAddress, tokens: [] });
    }
    const body = JSON.parse(opts.body);
    if (body.method === 'query' && body.params?.request_type === 'view_access_key') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
    }
    if (body.method === 'query' && body.params?.request_type === 'view_account') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { amount: '150000000000000000000000' } });
    }
    if (body.method === 'broadcast_tx_commit') {
      const signedBytes = Buffer.from(body.params[0], 'base64');
      broadcastsZeroFt.push(signedBytes);
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: { status: { SuccessValue: '' }, transaction: { hash: `tx_${broadcastsZeroFt.length}` } }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const res = await chainContracts.registerNearNamedAccountOnChain({ wallet: zeroFtWallet, newAccountId: 'alice.near' });
    assert.equal(res.sweptMode, 'delete_account_full_sweep');
    assert.equal(res.accountId, 'alice.near');
    assert.equal(res.txHash, 'tx_1');
    assert.equal(res.sweepTxHash, 'tx_2');
    assert.equal(broadcastsZeroFt.length, 2);

    // Verify tx_1 FunctionCall uses 0.05 NEAR deposit (50000000000000000000000)
    const tx1 = broadcastsZeroFt[0];
    assert.ok(tx1.includes(Buffer.from('create_account', 'utf8')));
    // u128 LE of 50000000000000000000000 (0.05 NEAR) at end of action before 65-byte sig
    const expectedDeposit = Buffer.alloc(16);
    expectedDeposit.writeBigUInt64LE(50000000000000000000000n & 0xffffffffffffffffn, 0);
    expectedDeposit.writeBigUInt64LE(50000000000000000000000n >> 64n, 8);
    assert.ok(tx1.subarray(tx1.length - 65 - 16, tx1.length - 65).equals(expectedDeposit), 'create_account deposit must be 0.05 NEAR');

    // Verify tx_2 contains exact DeleteAccount action bytes (tag=7 + 'alice.near')
    const tx2 = broadcastsZeroFt[1];
    const expectedDel = Buffer.from(chainContracts.buildDeleteAccountActionBytes({ beneficiaryId: 'alice.near' }));
    assert.ok(tx2.subarray(tx2.length - 65 - expectedDel.length, tx2.length - 65).equals(expectedDel), 'Sweep tx must execute DeleteAccount action');
  });

  // 3c. Positive FT balance -> safe transfer keeping implicit account & FT intact
  const withFtWallet = state.normalizeWalletRecord({
    id: 'w_v615_withft',
    mnemonic: TEST_MNEMONIC,
    nearAddress: keys.nearAddress,
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nativeBalances: { near: 0.2 },
    nearNep141Balances: { 'usdt.tether-token.near': { raw: '1000000', formatted: 1 } }
  });
  const broadcastsWithFt = [];
  await withMockedFetch(async (_url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.method === 'query' && body.params?.request_type === 'view_access_key') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { nonce: 20, block_hash: '11111111111111111111111111111111' } });
    }
    if (body.method === 'query' && body.params?.request_type === 'view_account') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { amount: '150000000000000000000000' } });
    }
    if (body.method === 'broadcast_tx_commit') {
      const signedBytes = Buffer.from(body.params[0], 'base64');
      broadcastsWithFt.push(signedBytes);
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: { status: { SuccessValue: '' }, transaction: { hash: `txft_${broadcastsWithFt.length}` } }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const res = await chainContracts.registerNearNamedAccountOnChain({ wallet: withFtWallet, newAccountId: 'alice.near' });
    assert.equal(res.sweptMode, 'transfer_kept_ft');
    assert.equal(res.sweepTxHash, 'txft_2');
    assert.equal(broadcastsWithFt.length, 2);
    const tx2 = broadcastsWithFt[1];
    // Action::Transfer tag=3 + 16-byte u128 amount before 65-byte sig
    assert.equal(tx2[tx2.length - 65 - 17], 3, 'When FTs exist, sweep must use Action::Transfer (tag 3) instead of DeleteAccount');
  });

  // 4. UI: #near-keys-rotate-card strictly hidden on unactivated account, visible on activated account
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_v615_ui',
      mnemonic: TEST_MNEMONIC,
      nearAddress: keys.nearAddress,
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nativeBalances: { near: 0 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    const prevDoc = globalThis.document;
    const domMap = new Map();
    const getOrMake = (id) => {
      if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
      return domMap.get(id);
    };
    getOrMake('near-keys-rotate-card').classList.add('hidden');
    getOrMake('near-acct-unactivated-guide').classList.add('hidden');
    getOrMake('near-bind-drawer').classList.add('hidden');
    getOrMake('wc-advanced-drawer').classList.add('hidden');

    globalThis.document = {
      getElementById: (id) => getOrMake(id),
      querySelectorAll: () => [],
      querySelector: () => null
    };

    try {
      // Unactivated account
      await withMockedFetch(async (_url, opts) => {
        const b = JSON.parse(opts.body);
        if (b.params?.request_type === 'view_access_key_list') {
          return jsonResponse({ jsonrpc: '2.0', id: b.id, error: { cause: { name: 'UNKNOWN_ACCOUNT' }, message: 'account does not exist' } });
        }
        return jsonResponse({}, 404);
      }, async () => {
        await uiController.openNearAccountSheet();
        assert.equal(getOrMake('sheet-near-account').classList.contains('open'), true);
        assert.equal(getOrMake('near-keys-rotate-card').classList.contains('hidden'), true, 'Unactivated account must strictly hide #near-keys-rotate-card');
        assert.equal(getOrMake('near-acct-unactivated-guide').classList.contains('hidden'), false, 'Unactivated account must show funding guide');
      });

      // Activated account
      await withMockedFetch(async (_url, opts) => {
        const b = JSON.parse(opts.body);
        if (b.params?.request_type === 'view_access_key_list') {
          return jsonResponse({
            jsonrpc: '2.0',
            id: b.id,
            result: { keys: [{ public_key: keys.nearPublicKey, access_key: { permission: 'FullAccess', nonce: 1 } }] }
          });
        }
        return jsonResponse({}, 404);
      }, async () => {
        await uiController.refreshNearAccessKeysSheet();
        assert.equal(getOrMake('near-keys-rotate-card').classList.contains('hidden'), false, 'Activated account must show #near-keys-rotate-card');
        assert.ok(getOrMake('near-keys-list').innerHTML.includes('FullAccess'));
      });

      uiController.openWalletAddressesSheet();
      assert.equal(getOrMake('sheet-wallet-addresses').classList.contains('open'), true);
      assert.ok(getOrMake('hub-addresses-list').innerHTML.includes('hub-addr-copy-btn'));
      uiController.toggleNearBindDrawer();
      assert.equal(getOrMake('near-bind-drawer').classList.contains('hidden'), false);
      uiController.toggleWcAdvancedSettings();
      assert.equal(getOrMake('wc-advanced-drawer').classList.contains('hidden'), false);
    } finally {
      globalThis.document = prevDoc;
    }
  });

  // 5. HTML & CSS DOM verification for v6.15 cleanup
  const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.equal(html.includes('id="header-mpc-btn"'), false, '#header-mpc-btn must be removed');
  assert.equal(html.includes('id="hub-mpc-card"'), false, '#hub-mpc-card must be removed');
  assert.equal(html.includes('id="sheet-near-keys"'), false, 'Old #sheet-near-keys must be replaced by #sheet-near-account');
  assert.ok(html.includes('id="sheet-wallet-addresses"'));
  assert.ok(html.includes('id="hub-addresses-list"'));
  assert.ok(html.includes('id="sheet-near-account"'));
  assert.ok(html.includes('id="near-keys-rotate-card"'));
  assert.ok(html.includes('id="wc-advanced-drawer"'));
  assert.ok(css.includes('.hub-menu-group') && css.includes('.hub-addr-copy-btn'));
});
