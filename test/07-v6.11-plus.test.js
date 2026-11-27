'use strict';

const zlib = require('node:zlib');

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
      assert.equal((bidHtml.match(/class="perp-ob-row bid"/g) || []).length, 8);
      assert.equal((askHtml.match(/class="perp-ob-row ask"/g) || []).length, 8);
      assert.ok(bidHtml.includes('<div class="perp-ob-row-depth"'), 'Depth overlay must use <div class="perp-ob-row-depth"> so CSS > span rule does not displace text');
      assert.ok(domMap.get('perp-ob-bid-summary').textContent.includes('B 20%'));
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
        assert.ok(detailHtml.includes(realPrlTxId.slice(0, 10)), 'OKX Tx Detail must display shortened TxHash');
        assert.ok(detailHtml.includes(`data-val="${realPrlTxId}"`), 'OKX Tx Detail must allow copying full TxHash');
        assert.ok(detailHtml.includes(`https://prlscan.com/tx/${realPrlTxId}`), 'OKX Tx Detail must render Explorer link');
        assert.ok(detailHtml.includes('-1 PRL'), 'OKX Tx Detail must display signed transfer amount');

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
      getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
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

      // 3. Deprecated Binance Global Account L/S Ratio removed in OKX Perps overhaul
      assert.equal(hlPerps.fetchGlobalLongShortAccountRatio, undefined, 'fetchGlobalLongShortAccountRatio must be removed');
      assert.equal(uiController.refreshPerpLongShortAsync, undefined, 'refreshPerpLongShortAsync must be removed');
      assert.equal(uiController.renderPerpLongShortBar, undefined, 'renderPerpLongShortBar must be removed');
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
      getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
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
        assert.ok(/完全权限密钥|Full Key/i.test(getOrMake('near-keys-list').innerHTML));
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
  const { readPreactAppSources } = require('./helpers.js');
  const html = readPreactAppSources();
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

test('v6.22 Icon Integrity: all inline PNG/SVG data URIs in TOKEN_ICON_MAP and STAKING_POOLS pass CRC32, zlib inflate & SVG checks', () => {
  const ieeeCrc32 = (buf) => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let b = 0; b < 8; b++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const channelsByType = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

  const entries = [
    ...Object.entries(tokenRegistry.TOKEN_ICON_MAP || {}).map(([sym, uri]) => [`TOKEN_ICON_MAP.${sym}`, uri]),
    ...(chainContracts.STAKING_POOLS || []).map((p) => [`STAKING_POOLS.${p.id}`, p.icon])
  ];

  assert.ok(
    String(tokenRegistry.TOKEN_ICON_MAP.RHEA || '').startsWith('data:image/png;base64,'),
    'TOKEN_ICON_MAP.RHEA must be an inline PNG data URI'
  );
  assert.ok(
    String(tokenRegistry.TOKEN_ICON_MAP.XRHEA || '').startsWith('data:image/png;base64,'),
    'TOKEN_ICON_MAP.XRHEA must be an inline PNG data URI'
  );

  let checkedPng = 0;
  let checkedSvg = 0;
  for (const [label, uri] of entries) {
    if (typeof uri !== 'string' || !uri.startsWith('data:image/')) continue;

    if (uri.startsWith('data:image/png;base64,')) {
      checkedPng += 1;
      const buf = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
      assert.ok(buf.length >= 33 && buf.subarray(0, 8).equals(pngSig), `${label}: invalid PNG signature`);

      let pos = 8;
      let width = 0;
      let height = 0;
      let bitDepth = 0;
      let colorType = -1;
      let sawIend = false;
      const idats = [];

      while (pos < buf.length) {
        assert.ok(pos + 12 <= buf.length, `${label}: truncated PNG chunk header at ${pos}`);
        const len = buf.readUInt32BE(pos);
        assert.ok(pos + 12 + len <= buf.length, `${label}: truncated PNG chunk payload at ${pos}`);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const storedCrc = buf.readUInt32BE(pos + 8 + len);
        const calcCrc = ieeeCrc32(buf.subarray(pos + 4, pos + 8 + len));
        assert.equal(storedCrc, calcCrc, `${label}: PNG chunk ${type} CRC32 mismatch`);

        if (type === 'IHDR') {
          width = buf.readUInt32BE(pos + 8);
          height = buf.readUInt32BE(pos + 12);
          bitDepth = buf[pos + 16];
          colorType = buf[pos + 17];
        } else if (type === 'IDAT') {
          idats.push(buf.subarray(pos + 8, pos + 8 + len));
        } else if (type === 'IEND') {
          sawIend = true;
        }
        pos += 12 + len;
      }

      assert.equal(pos, buf.length, `${label}: trailing PNG bytes`);
      assert.equal(sawIend, true, `${label}: missing IEND chunk`);
      assert.ok(width > 0 && height > 0 && idats.length > 0, `${label}: missing IHDR or IDAT`);
      const channels = channelsByType[colorType];
      assert.ok(channels, `${label}: unsupported PNG colorType ${colorType}`);

      const raw = zlib.inflateSync(Buffer.concat(idats));
      const expectedBytes = height * (Math.ceil((width * channels * bitDepth) / 8) + 1);
      assert.equal(raw.length, expectedBytes, `${label}: unexpected inflated PNG pixel byte count`);
    } else if (/^data:image\/svg\+xml/i.test(uri)) {
      checkedSvg += 1;
      const commaIdx = uri.indexOf(',');
      assert.ok(commaIdx > 0, `${label}: malformed SVG data URI`);
      const body = uri.slice(commaIdx + 1);
      let svgText;
      if (/;base64,/i.test(uri.slice(0, commaIdx + 1))) {
        svgText = Buffer.from(body, 'base64').toString('utf8');
      } else {
        try {
          svgText = decodeURIComponent(body);
        } catch (_) {
          svgText = body;
        }
      }
      const trimmed = svgText.trim();
      assert.ok(trimmed.startsWith('<svg') && trimmed.endsWith('</svg>'), `${label}: invalid inline SVG markup`);
    }
  }

  assert.ok(checkedPng >= 3, `Expected at least 3 inline PNGs (RHEA/XRHEA/pool), checked ${checkedPng}`);
  assert.ok(checkedSvg >= 10, `Expected at least 10 inline SVGs, checked ${checkedSvg}`);
});

test('v6.23 Limit Order: NEAR DCL prioritizes pool currentPoint over Ref V2, displays pool fee & warns when worse than market', async () => {
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevLimit = { ...state.limit };
  const prevDoc = globalThis.document;

  const domMap = new Map();
  const getOrMake = (id) => {
    if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
    return domMap.get(id);
  };
  globalThis.document = {
    documentElement: { lang: 'zh-CN', classList: createMockClassList() },
    getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
    querySelectorAll: () => [],
    querySelector: () => null,
    activeElement: null
  };

  try {
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const w = state.normalizeWalletRecord({
      id: 'w_v623_limit',
      mnemonic: TEST_MNEMONIC,
      nearAddress: keys.nearAddress,
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nativeBalances: { near: 5 },
      nearNep141Balances: { 'token.rhealab.near': { raw: '500000000000000000000', formatted: 500 } }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.limit.chain = 'near';
    state.limit.sellContract = 'token.rhealab.near';
    state.limit.buyContract = 'otoken.rhealab.near';
    state.limit.amountIn = '100';
    state.limit.targetRate = '';
    state.limit.snappedPoint = null;
    state.limit.liveMarketRate = null;
    state.limit.poolInfo = null;
    state.limit.priceInverted = null;

    await withMockedFetch(async (url, opts) => {
      if (url.includes('smartrouter.ref.finance')) {
        return jsonResponse({
          result_code: 0,
          result_data: { amount_out: '1440100000000000000', routes: [{ pools: [{ pool_id: 6573 }] }] }
        });
      }
      if (opts && opts.body) {
        const b = JSON.parse(opts.body);
        if (b.params && b.params.account_id === 'dclv2.ref-labs.near' && b.params.method_name === 'get_pool') {
          const payload = {
            pool_id: 'otoken.rhealab.near|token.rhealab.near|10000',
            token_x: 'otoken.rhealab.near',
            token_y: 'token.rhealab.near',
            fee: 10000,
            point_delta: 200,
            current_point: -6600,
            state: 'Running'
          };
          return jsonResponse({ jsonrpc: '2.0', id: b.id, result: { result: Array.from(Buffer.from(JSON.stringify(payload))) } });
        }
        if (b.params && b.params.account_id === 'dclv2.ref-labs.near' && b.params.method_name === 'storage_balance_of') {
          const payload = { total: '500000000000000000000000', available: '500000000000000000000000' };
          return jsonResponse({ jsonrpc: '2.0', id: b.id, result: { result: Array.from(Buffer.from(JSON.stringify(payload))) } });
        }
      }
      return jsonResponse({}, 404);
    }, async () => {
      await uiController.refreshLimitMarketContextAsync();
      assert.ok(
        Math.abs(state.limit.liveMarketRate - 1.934728) < 0.002,
        `DCL market ref must come from current_point (-6600 -> ~1.9347), got ${state.limit.liveMarketRate}`
      );
      assert.equal(getOrMake('limit-meta-fee-row').classList.contains('hidden'), false);
      assert.equal(getOrMake('limit-meta-pool-fee').textContent, '1%');
      assert.equal(getOrMake('limit-price-warning-banner').classList.contains('hidden'), true);

      // Worse-than-market price (1.44 vs 1.9347 -> ~25.6% worse) triggers critical warning
      state.limit.targetRate = '1.44';
      state.limit.snappedPoint = null;
      uiController.renderLimitOrderView();
      const banner = getOrMake('limit-price-warning-banner');
      assert.equal(banner.classList.contains('hidden'), false);
      assert.equal(banner.classList.contains('is-critical'), true);
      assert.ok(banner.textContent.includes('-'));
    });
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    Object.assign(state.limit, prevLimit);
    globalThis.document = prevDoc;
  }
});

test('v6.23 Swap Recipient: same-chain 1Click unlocks custom recipient, locks 1Click on 3rd-party input & hard-guards DEX routes', async () => {
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevSwap = { ...state.swap };
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;

  const nearTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'NEAR' && t.blockchain === 'near');
  const qtcNearTok = (tokenRegistry.DEX_CHAIN_TOKENS.near || []).find((t) => t.symbol === 'QTC');
  assert.ok(nearTok && qtcNearTok);

  assert.equal(uiController.doesSwapRouteRequireSelfRecipient(nearTok, qtcNearTok, null), true);
  assert.equal(
    uiController.doesSwapRouteRequireSelfRecipient(nearTok, qtcNearTok, { bestSource: '1Click Solver', routeSource: 'NEAR_INTENTS_1CLICK' }),
    false
  );
  assert.equal(
    uiController.doesSwapRouteRequireSelfRecipient(nearTok, qtcNearTok, { bestSource: 'Ref Finance V2', actions: [{ pool_id: 1 }] }),
    true
  );

  // When requireThirdPartyRecipient is true, quoteBestNearPairSwap skips Ref/Rhea and only queries 1Click
  let calledRef = false;
  let called1ClickRecipient = '';
  await withMockedFetch(async (url, opts) => {
    if (url.includes('smartrouter.ref.finance')) {
      calledRef = true;
      return jsonResponse({ result_code: 0, result_data: { amount_out: '999999999999', routes: [{ pools: [{ pool_id: 1 }] }] } });
    }
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const body = JSON.parse(opts.body);
      called1ClickRecipient = body.recipient;
      return jsonResponse({
        quote: { amountOut: '1063015000000', amountOutFormatted: '1.063015', amountInUsd: '29.90', amountOutUsd: '29.59' }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const q3p = await nearIntents.quoteBestNearPairSwap({
      fromToken: nearTok,
      toToken: qtcNearTok,
      amountRaw: '10000000000000000000000000',
      recipient: 'alice.near',
      nearAccountId: 'bob.near',
      requireThirdPartyRecipient: true
    });
    assert.equal(calledRef, false, '3rd-party recipient must not query Ref Finance DEX');
    assert.equal(called1ClickRecipient, 'alice.near');
    assert.equal(q3p.ok, true);
    assert.equal(q3p.routeSource, 'NEAR_INTENTS_1CLICK');
    assert.equal(q3p.bestSource, '1Click Solver');
  });

  // When 1Click fails on 3rd-party recipient, do NOT fall back to Ref DEX
  await withMockedFetch(async (url) => {
    if (url.includes('smartrouter.ref.finance')) {
      return jsonResponse({ result_code: 0, result_data: { amount_out: '999999999999', routes: [{ pools: [{ pool_id: 1 }] }] } });
    }
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      return jsonResponse({ message: 'No liquidity available' }, 400);
    }
    return jsonResponse({}, 404);
  }, async () => {
    const qFail = await nearIntents.quoteBestNearPairSwap({
      fromToken: nearTok,
      toToken: qtcNearTok,
      amountRaw: '5000000000000000000000000',
      recipient: 'alice.near',
      nearAccountId: 'bob.near',
      requireThirdPartyRecipient: true
    });
    assert.equal(qFail.ok, false);
    assert.ok(qFail.error);
  });

  // Hard execution guard blocks DEX route if a 3rd-party recipient is configured
  const domMap = new Map();
  const pinDots = Array.from({ length: 6 }, (_, i) => createMockDomElement(`dot_${i}`, { classes: ['bio-pin-dot'] }));
  const getOrMake = (id) => {
    if (!domMap.has(id)) {
      domMap.set(id, id === 'security-pin-dots'
        ? createMockDomElement(id, { querySelectorAll: () => pinDots })
        : createMockDomElement(id));
    }
    return domMap.get(id);
  };
  globalThis.document = {
    getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
    querySelectorAll: () => [],
    querySelector: () => null
  };
  globalThis.window = {
    Capacitor: {
      Plugins: {
        NativeSecurity: {
          async getSecurityCapabilities() {
            return { platform: 'ios', biometryType: 'faceID', supportsBiometrics: true, supportsPasscode: true };
          },
          async authenticateWithBiometrics() {
            return { authenticated: true, type: 'faceID' };
          }
        }
      }
    }
  };

  try {
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const w = state.normalizeWalletRecord({
      id: 'w_v623_3p_guard',
      mnemonic: TEST_MNEMONIC,
      nearAddress: keys.nearAddress,
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      pin: '123456',
      nativeBalances: { near: 5 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.swap.fromAssetId = nearTok.assetId;
    state.swap.toAssetId = qtcNearTok.assetId;
    state.swap.amountIn = '1';
    state.swap.recipientAddress = 'alice.near';
    state.swap.quoteData = { ok: true, bestSource: 'Ref Finance V2', actions: [{ pool_id: 1 }] };

    let broadcastCount = 0;
    await withMockedFetch(async (url) => {
      if (url.includes('fastnear') || url.includes('mainnet.near.org')) {
        broadcastCount += 1;
      }
      return jsonResponse({}, 400);
    }, async () => {
      await uiController.executeActiveSwap();
      assert.equal(broadcastCount, 0, 'Must abort without broadcasting DEX tx when 3rd-party recipient is set');
      assert.ok(
        /第三方|third-party/i.test(state.swap._lastError),
        `Expected explicit third-party guard error, got: ${state.swap._lastError}`
      );
    });
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    Object.assign(state.swap, prevSwap);
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('v6.23 PRL Route Adaptation: concurrent direct 1Click vs 3-stage composite & automatic fallback', async () => {
  const prlTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PRL' && t.blockchain === 'prl');
  const qtcNativeTok = { symbol: 'QTC', blockchain: 'qtc', assetId: 'nep141:qtc.omft.near', decimals: 12 };
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const zeroNearWallet = state.normalizeWalletRecord({
    id: 'w_v623_prl_direct',
    mnemonic: TEST_MNEMONIC,
    address: keys.address,
    nearAddress: keys.nearAddress,
    nativeBalances: { near: 0, prl: 20 }
  });
  const qtcAddr = 'qzk2q8To1dRKd4EwHUMWnyH5iMf7G7VrFcfu5XRpxMhCjGK7Z';

  // Case A: 1Click begins supporting direct PRL -> QTC and beats/matches 3-stage composite
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const req = JSON.parse(opts.body);
      if (req.originAsset === 'nep141:prl.omft.near' && req.destinationAsset === 'nep141:qtc.omft.near') {
        return jsonResponse({
          quote: { amountOut: '700000000000', amountOutFormatted: '0.7', amountInUsd: '19.82', amountOutUsd: '19.60' }
        });
      }
      if (req.originAsset === 'nep141:prl.omft.near' && req.destinationAsset === nearIntents.PRL_NEAR_ASSET_ID) {
        return jsonResponse({
          quote: { amountOut: '999600000', amountOutFormatted: '9.996', amountInUsd: '19.82', amountOutUsd: '19.81' }
        });
      }
      if (req.originAsset === nearIntents.NEAR_USDC_ASSET_ID) {
        return jsonResponse({
          quote: { amountOut: '697000000000', amountOutFormatted: '0.697', amountInUsd: '19.60', amountOutUsd: '19.36' }
        });
      }
      return jsonResponse({ message: 'No liquidity available' }, 400);
    }
    if (url.includes('smartrouter.ref.finance')) {
      return jsonResponse({
        result_code: 0,
        result_data: {
          amount_out: '19600000',
          routes: [{
            min_amount_out: '19400000',
            pools: [{
              pool_id: 9010,
              token_in: 'prl.omft.near',
              token_out: nearIntents.NEAR_USDC_CONTRACT,
              amount_in: '999600000',
              min_amount_out: '19400000'
            }]
          }]
        }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const directRes = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: prlTok,
      toToken: qtcNativeTok,
      amountRaw: '1000000000',
      slippageBps: 100,
      recipient: qtcAddr,
      refundTo: keys.address,
      nearAccountId: keys.nearAddress
    });
    assert.equal(directRes.ok, true);
    assert.equal(directRes.compositeType, undefined, 'Direct 1Click win must not set compositeType');
    assert.equal(directRes.routeSource, 'NEAR_INTENTS_1CLICK');
    assert.equal(directRes.bestSource, '1Click Solver');

    // Direct 1Click PRL route requires zero NEAR hub gas
    const gasCheck = uiController.validateSwapNearGasRequirement({
      wallet: zeroNearWallet,
      fromToken: prlTok,
      toToken: qtcNativeTok,
      quoteData: directRes,
      amountIn: 10
    });
    assert.equal(gasCheck.ok, true);
    assert.equal(gasCheck.requiredNear, 0);
  });

  // Case B: 1Click does NOT support direct PRL (returns 400) -> seamless fallback to 3-stage PRL_TO_EXTERNAL
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const req = JSON.parse(opts.body);
      if (req.originAsset === 'nep141:prl.omft.near' && req.destinationAsset === 'nep141:qtc.omft.near') {
        return jsonResponse({ message: 'No liquidity available' }, 400);
      }
      if (req.originAsset === 'nep141:prl.omft.near' && req.destinationAsset === nearIntents.PRL_NEAR_ASSET_ID) {
        return jsonResponse({
          quote: { amountOut: '999600000', amountOutFormatted: '9.996', amountInUsd: '19.82', amountOutUsd: '19.81' }
        });
      }
      if (req.originAsset === nearIntents.NEAR_USDC_ASSET_ID) {
        return jsonResponse({
          quote: { amountOut: '697361000000', amountOutFormatted: '0.697361', amountInUsd: '19.60', amountOutUsd: '19.36' }
        });
      }
      return jsonResponse({ message: 'No liquidity available' }, 400);
    }
    if (url.includes('smartrouter.ref.finance')) {
      return jsonResponse({
        result_code: 0,
        result_data: {
          amount_out: '19600000',
          routes: [{
            min_amount_out: '19400000',
            pools: [{
              pool_id: 9010,
              token_in: 'prl.omft.near',
              token_out: nearIntents.NEAR_USDC_CONTRACT,
              amount_in: '999600000',
              min_amount_out: '19400000'
            }]
          }]
        }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const compIntent = await nearIntents.quoteIntentSwapOrWithdraw({
      originAsset: prlTok.assetId,
      destinationAsset: qtcNativeTok.assetId,
      amountRaw: '1000000000',
      slippageBps: 100,
      recipient: qtcAddr,
      refundTo: keys.address,
      nearAccountId: keys.nearAddress,
      dry: true
    });
    assert.equal(compIntent.ok, true);
    assert.equal(compIntent.compositeType, 'PRL_TO_EXTERNAL');

    const compRes = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: prlTok,
      toToken: qtcNativeTok,
      amountRaw: '1000000000',
      slippageBps: 100,
      recipient: qtcAddr,
      refundTo: keys.address,
      nearAccountId: keys.nearAddress
    });
    assert.equal(compRes.ok, true);
    assert.ok(
      ['SMART_HUB_ROUTE', 'PRL_TO_EXTERNAL'].includes(compRes.compositeType),
      `Expected 3-stage fallback compositeType, got: ${compRes.compositeType}`
    );
  });
});

test('v6.30 Perps Search Clear & K-Line Inspect, wNEAR Auto-Unwrap/Rollback, and DApp Auto-Connect Manager', async () => {
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevPerp = { ...state.perp };
  const prevDoc = globalThis.document;
  const dappBrowser = require('../src/dapp-browser.js');

  const domMap = new Map();
  const getOrMake = (id) => {
    if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
    return domMap.get(id);
  };
  globalThis.document = {
    documentElement: { lang: 'zh-CN', classList: createMockClassList() },
    getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
    querySelectorAll: () => [],
    querySelector: () => null,
    activeElement: null
  };

  try {
    await withMockedStorage({}, async () => {
      state.initState();
      const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
      const w = state.normalizeWalletRecord({
        id: 'w_v630',
        mnemonic: TEST_MNEMONIC,
        nearAddress: keys.nearAddress,
        nearPublicKey: keys.nearPublicKey,
        nearPrivateKey: keys.nearPrivateKey,
        evmAddress: keys.evmAddress,
        solAddress: keys.solAddress,
        nativeBalances: { near: 5, sol: 1, eth: 0.5 }
      });
      state.wallets = [w];
      state.activeWalletId = w.id;

      // 1. Perps search clear & auto-reset on entering trade screen + K-line candle click inspect
      state.perp.markets = [
        { name: 'BTC', baseSymbol: 'BTC', pairLabel: 'BTC-USDC', markPx: 80000, dayNtlVlm: 1e9, maxLeverage: 50 },
        { name: 'xyz:CRCL', baseSymbol: 'CRCL', pairLabel: 'CRCL-USDC', dex: 'xyz', category: 'stocks', markPx: 50.5, dayNtlVlm: 1e7, maxLeverage: 10 }
      ];
      state.perp.overviewSearch = 'crcl';
      getOrMake('perp-overview-search').value = 'crcl';
      uiController.renderPerpOverviewPanel();
      assert.equal(getOrMake('perp-overview-search-clear').classList.contains('hidden'), false);

      uiController.clearPerpOverviewSearch();
      assert.equal(state.perp.overviewSearch, '');
      assert.equal(getOrMake('perp-overview-search').value, '');
      assert.equal(getOrMake('perp-overview-search-clear').classList.contains('hidden'), true);

      state.perp.overviewSearch = 'crcl';
      getOrMake('perp-overview-search').value = 'crcl';
      uiController.openPerpTradeScreen('xyz:CRCL');
      assert.equal(state.perp.overviewSearch, '', 'Entering trade screen must auto-clear search query');
      assert.equal(getOrMake('perp-overview-search').value, '');

      state.perp.candles = [
        { t: 1795400000000, o: 50.0, h: 51.2, l: 49.8, c: 51.0, v: 1200 },
        { t: 1795400900000, o: 51.0, h: 52.0, l: 50.5, c: 50.5, v: 950 }
      ];
      state.perp.showChart = true;
      uiController.inspectPerpCandle(0);
      assert.equal(state.perp.inspectedCandleIdx, 0);
      assert.equal(getOrMake('perp-candle-detail').classList.contains('hidden'), false);
      assert.ok(getOrMake('perp-candle-detail').innerHTML.includes('51.2'));
      assert.ok(getOrMake('perp-chart-svg').innerHTML.includes('data-action="inspect-perp-candle"'));
      uiController.inspectPerpCandle(0);
      assert.equal(state.perp.inspectedCandleIdx, null);
      assert.equal(getOrMake('perp-candle-detail').classList.contains('hidden'), true, 'Floating K-line HUD must hide when not inspecting');
      assert.equal(getOrMake('perp-candle-detail').classList.contains('is-inspecting'), false);

      // 2. NEAR Ref Swap: Buying NEAR auto-unwraps wNEAR -> NEAR
      let wrapBalanceReads = 0;
      const nearMethodsCalled = [];
      await withMockedFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        if (body.method === 'query' && body.params?.request_type === 'view_access_key') {
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { nonce: 1, block_hash: '11111111111111111111111111111111' } });
        }
        if (body.method === 'query' && body.params?.request_type === 'call_function') {
          const { account_id, method_name } = body.params;
          if (method_name === 'storage_balance_of') {
            return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { result: Array.from(Buffer.from(JSON.stringify({ total: '1250000000000000000000' }))) } });
          }
          if (account_id === 'wrap.near' && method_name === 'ft_balance_of') {
            wrapBalanceReads += 1;
            const bal = wrapBalanceReads === 1 ? '0' : '1500000000000000000000000';
            return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { result: Array.from(Buffer.from(JSON.stringify(bal))) } });
          }
        }
        if (body.method === 'broadcast_tx_commit') {
          const rawBytes = Buffer.from(body.params[0], 'base64');
          const txt = rawBytes.toString('utf8');
          if (txt.includes('near_withdraw')) nearMethodsCalled.push('near_withdraw');
          else if (txt.includes('ft_transfer_call')) nearMethodsCalled.push('ft_transfer_call');
          else if (txt.includes('near_deposit')) nearMethodsCalled.push('near_deposit');
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { status: { SuccessValue: '' }, transaction: { hash: `tx_${nearMethodsCalled.length}` } } });
        }
        return jsonResponse({}, 404);
      }, async () => {
        await chainContracts.executeNearRefFinanceSwap({
          wallet: w,
          actions: [{ pool_id: 4512, token_in: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', token_out: 'wrap.near', amount_in: '1000000', min_amount_out: '1000000000000000000000000' }],
          tokenIn: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
          tokenOut: 'wrap.near',
          amountRaw: '1000000',
          tokenBalance: 10,
          inputDecimals: 6,
          tokenSymbol: 'USDC'
        });
        assert.deepEqual(nearMethodsCalled, ['ft_transfer_call', 'near_withdraw'], 'Buying NEAR must automatically unwrap wNEAR back to native NEAR');
      });

      // 3. NEAR Ref Swap: Selling NEAR rollback auto-unwraps wNEAR if ft_transfer_call fails
      const rollbackMethods = [];
      let rollbackWrapReads = 0;
      await withMockedFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        if (body.method === 'query' && body.params?.request_type === 'view_access_key') {
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { nonce: 1, block_hash: '11111111111111111111111111111111' } });
        }
        if (body.method === 'query' && body.params?.request_type === 'call_function') {
          const { account_id, method_name } = body.params;
          if (method_name === 'storage_balance_of') {
            return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { result: Array.from(Buffer.from(JSON.stringify({ total: '1250000000000000000000' }))) } });
          }
          if (account_id === 'wrap.near' && method_name === 'ft_balance_of') {
            rollbackWrapReads += 1;
            const bal = rollbackWrapReads === 1 ? '0' : '1000000000000000000000000';
            return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { result: Array.from(Buffer.from(JSON.stringify(bal))) } });
          }
        }
        if (body.method === 'broadcast_tx_commit') {
          const txt = Buffer.from(body.params[0], 'base64').toString('utf8');
          if (txt.includes('ft_transfer_call')) {
            rollbackMethods.push('ft_transfer_call_failed');
            return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { status: { Failure: { ActionError: 'ERR_MIN_AMOUNT' } }, transaction: { hash: 'tx_fail' } } });
          }
          if (txt.includes('near_deposit')) rollbackMethods.push('near_deposit');
          if (txt.includes('near_withdraw')) rollbackMethods.push('near_withdraw');
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { status: { SuccessValue: '' }, transaction: { hash: 'tx_ok' } } });
        }
        return jsonResponse({}, 404);
      }, async () => {
        await assert.rejects(
          () => chainContracts.executeNearRefFinanceSwap({
            wallet: w,
            actions: [{ pool_id: 4512, token_in: 'wrap.near', token_out: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', amount_in: '1000000000000000000000000', min_amount_out: '1000000' }],
            tokenIn: 'wrap.near',
            tokenOut: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
            amountRaw: '1000000000000000000000000',
            tokenBalance: 5,
            inputDecimals: 24,
            tokenSymbol: 'NEAR'
          }),
          /ERR_MIN_AMOUNT/
        );
        assert.deepEqual(rollbackMethods, ['near_deposit', 'ft_transfer_call_failed', 'near_withdraw'], 'Failed NEAR swap must auto-unwrap wrapped NEAR back to native NEAR');
      });

      // 4. DApp Browser auto-connect & connected DApps management
      const injected = dappBrowser.buildInjectedProviderScript({
        evmAddress: w.evmAddress,
        solanaPublicKey: w.solAddress,
        nearAccountId: w.nearAddress
      });
      assert.ok(injected.includes('window.okxwallet = ethProvider'), 'Injected provider should expose okxwallet alias');
      assert.ok(injected.includes('isConnected: Boolean(CFG.solanaPublicKey)'), 'Solana provider should auto-connect when key is present');

      const autoConnected = await dappBrowser.handleDAppRpcRequest(
        { namespace: 'evm', method: 'eth_accounts', origin: 'https://app.uniswap.org' },
        { wallet: w, contracts: chainContracts, autoConnectOrigin: true }
      );
      assert.deepEqual(autoConnected, [w.evmAddress], 'Built-in DApp browser eth_accounts must auto-connect active wallet');

      await uiController.launchDAppUrl('https://app.uniswap.org');
      uiController.openDAppBrowserSheet();
      assert.equal(getOrMake('dapp-connected-section').classList.contains('hidden'), false);
      assert.ok(getOrMake('dapp-connected-section').innerHTML.includes('app.uniswap.org'));
      uiController.disconnectDAppOrigin('https://app.uniswap.org');
      assert.equal(getOrMake('dapp-connected-section').classList.contains('hidden'), true);
    });
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    Object.assign(state.perp, prevPerp);
    globalThis.document = prevDoc;
  }
});

test('v6.31: independent PRL mining mnemonic bind/switch/restore, wallet mining isolation, limit quote contract & explorer URLs', async () => {
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevMining = { ...state.mining };
  const prevLimit = { ...state.limit };

  const ALT_MNEMONIC_1 = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';
  const ALT_MNEMONIC_2 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

  const domMap = new Map();
  const getOrMake = (id) => {
    if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
    return domMap.get(id);
  };
  globalThis.document = {
    activeElement: null,
    documentElement: { lang: 'zh-CN', classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
    getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
    querySelector: () => null,
    querySelectorAll: () => []
  };
  globalThis.window = {
    confirm: () => true,
    Capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          getBiometricStatus: async () => ({ available: true, biometryType: 'faceID', platform: 'ios', deviceModel: 'iPhone' }),
          authenticateWithBiometrics: async () => ({ authenticated: true, biometryType: 'faceID' })
        }
      }
    }
  };

  try {
    state.initState();
    const w1 = state.normalizeWalletRecord({
      id: 'w_v631_1',
      name: 'Main NEAR',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { prl: 0, near: 5 }
    });
    const w2 = state.normalizeWalletRecord({
      id: 'w_v631_2',
      name: 'Alt Account',
      mnemonic: ALT_MNEMONIC_2,
      nativeBalances: { prl: 12.5, near: 1 }
    });
    const defaultW1Prl = w1.address;
    const expectedAltPrl1 = (await cryptoEngine.derivePearlFromSeedAsync(ALT_MNEMONIC_1, "m/86'/808276'/0'/0/0", true)).address;
    const expectedAltPrl2 = (await cryptoEngine.derivePearlFromSeedAsync(ALT_MNEMONIC_2, "m/86'/808276'/0'/0/0", true)).address;

    state.wallets = [w1, w2];
    state.activeWalletId = w1.id;

    await withMockedFetch(async () => jsonResponse({}), async () => {
      // 1. Bind custom PRL mining mnemonic on w1 without touching NEAR or MPC EVM
      const origNearAddr = w1.nearAddress;
      const origEvmAddr = w1.mpcEvmAddress;
      getOrMake('prl-bind-mnemonic-input').value = ALT_MNEMONIC_1;
      await uiController.bindOrReplacePrlMnemonicUI();
      assert.equal(w1.address, expectedAltPrl1, 'PRL address must update to custom mining seed');
      assert.equal(w1.prlMnemonic, ALT_MNEMONIC_1);
      assert.equal(w1.nearAddress, origNearAddr, 'NEAR master address must remain unchanged');
      assert.equal(w1.mpcEvmAddress, origEvmAddr, 'MPC EVM address must remain unchanged');
      assert.equal(getOrMake('mining-address-input').value, expectedAltPrl1);

      // Ensure normalizeWalletRecord preserves custom prlMnemonic on reload
      const reloadedW1 = state.normalizeWalletRecord({ ...w1, privateKeyHex: '', tweakedPrivateKeyHex: '' });
      assert.equal(reloadedW1.address, expectedAltPrl1, 'normalizeWalletRecord must self-heal PRL from prlMnemonic');

      // 2. Switch to another PRL mnemonic
      getOrMake('prl-bind-mnemonic-input').value = ALT_MNEMONIC_2;
      await uiController.bindOrReplacePrlMnemonicUI();
      assert.equal(w1.address, expectedAltPrl2);
      assert.equal(w1.prlMnemonic, ALT_MNEMONIC_2);

      // 3. Restore default derived PRL account
      await uiController.restoreDefaultPrlAccountUI();
      assert.equal(w1.address, defaultW1Prl);
      assert.equal(w1.prlMnemonic, '');

      // 4. Switch active wallet isolates mining-address-input
      uiController.switchActiveWallet(w2.id);
      assert.equal(getOrMake('mining-address-input').value, w2.address);
      assert.equal(state.mining.minerAddress, w2.address);
      uiController.switchActiveWallet(w1.id);
      assert.equal(getOrMake('mining-address-input').value, w1.address);
    });

    // 5. Explorer URLs for op, pol, avax
    assert.ok(uiController.getExplorerAddressUrl('op', '0xabc').includes('optimistic.etherscan.io/address/0xabc'));
    assert.ok(uiController.getExplorerTxUrl('op', '0x123').includes('optimistic.etherscan.io/tx/0x123'));
    assert.ok(uiController.getExplorerAddressUrl('pol', '0xabc').includes('polygonscan.com/address/0xabc'));
    assert.ok(uiController.getExplorerTxUrl('pol', '0x123').includes('polygonscan.com/tx/0x123'));
    assert.ok(uiController.getExplorerAddressUrl('avax', '0xabc').includes('snowtrace.io/address/0xabc'));
    assert.ok(uiController.getExplorerTxUrl('avax', '0x123').includes('snowtrace.io/tx/0x123'));

    // 6. Limit order DEX market rate quote contracts (Solana without ok:true & EVM srcToken/destToken)
    const origQuoteSol = chainContracts.quoteSolanaJupiterSwap;
    const origQuoteEvm = chainContracts.quoteEvmDexSwap;
    let capturedEvmQuoteArgs = null;
    try {
      chainContracts.quoteSolanaJupiterSwap = async () => ({
        outAmount: '142500000',
        bestSource: 'Jupiter'
      });
      state.liveTokens = [
        { assetId: 'nep141:sol.omft.near', symbol: 'SOL', blockchain: 'sol', contractAddress: 'So11111111111111111111111111111111111111112', decimals: 9, price: 70 },
        { assetId: 'nep141:sol-usdc', symbol: 'USDC', blockchain: 'sol', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, price: 1 },
        { assetId: 'nep141:eth-weth', symbol: 'WETH', blockchain: 'eth', contractAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18, price: 2500 },
        { assetId: 'nep141:eth-usdc', symbol: 'USDC', blockchain: 'eth', contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6, price: 1 }
      ];
      state.limit.chain = 'sol';
      state.limit.sellContract = 'So11111111111111111111111111111111111111112';
      state.limit.buyContract = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      await uiController.refreshLimitMarketContextAsync();
      assert.equal(state.limit.liveMarketRate, 142.5, 'Solana limit order must accept quoteSolanaJupiterSwap outAmount without ok:true');

      chainContracts.quoteEvmDexSwap = async (args) => {
        capturedEvmQuoteArgs = args;
        const dec = Number(args.destDecimals ?? 6);
        const raw = (2650n * (10n ** BigInt(dec))).toString();
        return { destAmountRaw: raw, bestSource: 'ParaSwap' };
      };
      state.limit.chain = 'eth';
      state.limit.sellContract = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
      state.limit.buyContract = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
      await uiController.refreshLimitMarketContextAsync();
      assert.ok(capturedEvmQuoteArgs && capturedEvmQuoteArgs.srcToken && capturedEvmQuoteArgs.destToken, 'EVM limit quote must pass srcToken & destToken');
      assert.equal(state.limit.liveMarketRate, 2650, 'EVM limit order must parse destAmountRaw from quoteEvmDexSwap');
    } finally {
      chainContracts.quoteSolanaJupiterSwap = origQuoteSol;
      chainContracts.quoteEvmDexSwap = origQuoteEvm;
    }
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    Object.assign(state.mining, prevMining);
    Object.assign(state.limit, prevLimit);
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('v6.32: built-in WalletConnect Project ID & QR scanner URI/address parsing', async () => {
  const prevDoc = globalThis.document;
  const prevClient = state.wc.client;
  const prevPid = state.wc.projectId;
  const domMap = new Map();
  const getOrMake = (id) => {
    if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
    return domMap.get(id);
  };
  globalThis.document = {
    activeElement: null,
    documentElement: { lang: 'zh-CN', classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
    getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
    querySelector: () => null,
    querySelectorAll: () => []
  };
  try {
    state.initState();
    assert.ok(state.wc.projectId && state.wc.projectId.length >= 16, 'WalletConnect must have built-in default Project ID');

    assert.deepEqual(
      uiController.parseScannedAddressPayload('wc:abc123@2?relay-protocol=irn&symKey=xyz'),
      { type: 'wc', value: 'wc:abc123@2?relay-protocol=irn&symKey=xyz' }
    );
    assert.deepEqual(
      uiController.parseScannedAddressPayload('ethereum:0x742d35Cc6634C0532925a3b844Bc454e4438f44e@1?value=100'),
      { type: 'address', value: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e' }
    );
    assert.deepEqual(
      uiController.parseScannedAddressPayload('bitcoin:bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297?amount=0.05'),
      { type: 'address', value: 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297' }
    );

    let pairedUri = '';
    state.wc.initProjectId = state.wc.projectId;
    state.wc.client = {
      core: { pairing: { pair: async ({ uri }) => { pairedUri = uri; } } },
      getActiveSessions: () => ({})
    };
    const okWc = await uiController.handleQrScanResultAsync('wc:testpair999@2?relay-protocol=irn');
    assert.equal(okWc, true);
    assert.equal(pairedUri, 'wc:testpair999@2?relay-protocol=irn');
    assert.equal(getOrMake('wc-uri-input').value, 'wc:testpair999@2?relay-protocol=irn');

    await uiController.openQrScannerSheet('send');
    const okSend = await uiController.handleQrScanResultAsync('solana:So11111111111111111111111111111111111111112?amount=1.2');
    assert.equal(okSend, true);
    assert.equal(getOrMake('send-recipient-input').value, 'So11111111111111111111111111111111111111112');
  } finally {
    state.wc.client = prevClient;
    state.wc.projectId = prevPid;
    globalThis.document = prevDoc;
  }
});

test('v6.33: DAPP_CATALOG uses live near.com & updated ecosystem URLs without dead/legacy domains', () => {
  const dappBrowserMod = require('../src/dapp-browser.js');
  const urls = dappBrowserMod.DAPP_CATALOG.map((d) => d.url);
  const intentsEntry = dappBrowserMod.DAPP_CATALOG.find((d) => d.id === 'intents');
  assert.equal(intentsEntry && intentsEntry.url, 'https://near.com');
  const burrowEntry = dappBrowserMod.DAPP_CATALOG.find((d) => d.id === 'burrow');
  assert.equal(burrowEntry && burrowEntry.url, 'https://app.rhea.finance/lending');
  for (const legacy of ['app.near-intents.org', 'app.burrow.finance', 'app.kamino.finance', 'pancakeswap.finance']) {
    assert.equal(urls.some((u) => u.includes(legacy)), false, `DAPP_CATALOG must not contain legacy URL: ${legacy}`);
  }
});

test('v6.34: near.com Confidential Intents (1CS) auth, 0-NEAR-gas PRL->USDC/QTC quote, 0.25% fee closure & /nearcom-proxy', async () => {
  const near = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC);
  const wallet = {
    id: 'w_v634_conf',
    nearAddress: near.nearAddress,
    nearPublicKey: near.nearPublicKey,
    nearPrivateSeedHex: near.nearPrivateSeedHex,
    nearBalance: 0,
    nativeBalances: { near: 0, prl: 200 }
  };

  // 1. Verify server.js & sw.js include /nearcom-proxy
  const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  assert.ok(serverSrc.includes("reqUrlStr.startsWith('/nearcom-proxy')"), 'server.js must handle /nearcom-proxy');
  assert.ok(serverSrc.includes("'near.com'"), 'server.js /nearcom-proxy must target near.com');
  const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  assert.ok(swSrc.includes('/nearcom-proxy'), 'sw.js must bypass cache for /nearcom-proxy');

  // 2. Mock near.com Confidential Intents API & test quote + 0 NEAR gas + 3-stage execution with 0.25% fee
  const mockJwt = 'eyJhbGciOiJSUzI1NiJ9.' + Buffer.from(JSON.stringify({ account_id: near.nearAddress, exp: Math.floor(Date.now() / 1000) + 900 })).toString('base64url') + '.sig';
  const nonceArr = Array.from({ length: 32 }, (_, i) => i + 1);
  const nonceB64 = Buffer.from(nonceArr).toString('base64');
  const capturedCalls = [];

  await withMockedFetch(async (url, opts) => {
    const u = String(url);
    const hdrs = (opts && opts.headers) || {};
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    capturedCalls.push({ url: u, method: opts && opts.method, headers: hdrs, body });

    if (u.endsWith('/api/auth/message')) {
      return jsonResponse({
        message: {
          message: JSON.stringify({
            signer_id: near.nearAddress,
            deadline: new Date(Date.now() + 300000).toISOString(),
            intents: []
          }),
          recipient: 'intents.near',
          nonce: nonceArr
        }
      });
    }
    if (u.endsWith('/api/auth/authenticate')) {
      assert.equal(body.authMethod, 'near');
      assert.equal(body.signedData.standard, 'nep413');
      return jsonResponse({ accessToken: mockJwt, refreshToken: 'rt_1', expiresAt: Date.now() + 900000 });
    }
    if (u.endsWith('/api/account/balances')) {
      assert.equal(hdrs['Content-Type'] || hdrs['content-type'], undefined, 'GET /api/account/balances must NOT send Content-Type');
      assert.equal(hdrs['x-nearcom-cli-version'], '0.4.0');
      return jsonResponse({ balances: [{ tokenId: 'nep141:prl.omft.near', available: '10000000000', source: 'private' }] });
    }
    if (u.endsWith('/api/swap/quote')) {
      if (body.dry === false) {
        assert.ok(body.idempotencyKey && body.idempotencyKey.length >= 16, 'dry=false swap quote requires idempotencyKey');
      }
      return jsonResponse({
        ok: {
          correlationId: 'corr_swap_1',
          timestamp: new Date().toISOString(),
          signature: 'ed25519:sig',
          quoteRequest: { ...body, refundTo: near.nearAddress, recipient: near.nearAddress, depositType: 'CONFIDENTIAL_INTENTS', recipientType: 'CONFIDENTIAL_INTENTS', refundType: 'CONFIDENTIAL_INTENTS' },
          quote: {
            amountIn: body.amount,
            amountOut: '200000000',
            minAmountIn: body.amount,
            minAmountOut: '198000000',
            amountInUsd: '200.00',
            amountOutUsd: '200.00',
            depositAddress: 'swap_dep_addr_1'
          },
          appFee: []
        }
      });
    }
    if (u.endsWith('/api/swap/intent')) {
      assert.equal(body.quote.appFee, undefined, 'appFee must be stripped before /api/swap/intent');
      return jsonResponse({
        ok: {
          correlationId: 'corr_intent_1',
          intent: {
            standard: 'nep413',
            payload: {
              message: JSON.stringify({
                signer_id: near.nearAddress,
                deadline: new Date(Date.now() + 300000).toISOString(),
                intents: [{ intent: 'transfer', receiver_id: 'swap_dep_addr_1', tokens: { 'imt:hash:nep141:prl.omft.near': '10000000000' } }]
              }),
              nonce: nonceB64,
              recipient: 'intents.far'
            }
          }
        }
      });
    }
    if (u.endsWith('/api/swap/submit')) {
      assert.equal(body.signedIntent.standard, 'nep413');
      assert.equal(body.signedIntent.payload.recipient, 'intents.far');
      return jsonResponse({ ok: { intentHash: 'swap_intent_hash_1', correlationId: 'corr_sub_1' } });
    }
    if (u.endsWith('/api/swap/status')) {
      return jsonResponse({ ok: { status: 'SUCCESS', amountOut: '200000000', intentHashes: ['swap_intent_hash_1'] } });
    }
    if (u.endsWith('/api/withdraw/quote')) {
      const depAddr = body.recipientType === 'CONFIDENTIAL_INTENTS' ? 'fee_dep_addr_1' : 'wd_dep_addr_1';
      return jsonResponse({
        ok: {
          correlationId: 'corr_wd_1',
          timestamp: new Date().toISOString(),
          signature: 'ed25519:sig',
          quoteRequest: body,
          quote: {
            amountIn: body.amount,
            amountOut: body.amount,
            minAmountOut: body.amount,
            depositAddress: depAddr
          },
          appFee: []
        }
      });
    }
    if (u.endsWith('/api/withdraw/intent')) {
      return jsonResponse({
        ok: {
          correlationId: 'corr_wdi_1',
          intent: {
            standard: 'nep413',
            payload: {
              message: JSON.stringify({
                signer_id: near.nearAddress,
                deadline: new Date(Date.now() + 300000).toISOString(),
                intents: [{ intent: 'transfer', receiver_id: body.depositAddress, tokens: { 'imt:hash:nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': '500000' } }]
              }),
              nonce: nonceB64,
              recipient: 'intents.far'
            }
          }
        }
      });
    }
    if (u.endsWith('/api/withdraw/submit')) {
      return jsonResponse({ ok: { intentHash: 'wd_intent_hash_1', correlationId: 'corr_wds_1' } });
    }
    return jsonResponse({ error: 'Not mocked' }, 404);
  }, async () => {
    const prlToken = {
      symbol: 'PRL',
      blockchain: 'prl',
      assetId: 'nep141:prl.omft.near',
      decimals: 8
    };
    const nearUsdcToken = {
      symbol: 'USDC',
      blockchain: 'near',
      assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      decimals: 6
    };

    const q = await nearIntents.quoteNearcomConfidentialSwap({
      fromToken: prlToken,
      toToken: nearUsdcToken,
      amountRaw: '10000000000',
      slippageBps: 100,
      wallet,
      appFeeBps: 25,
      dry: true
    });
    assert.equal(q.ok, true, q.error || 'quoteNearcomConfidentialSwap failed');
    assert.equal(q.compositeType, 'NEARCOM_CONFIDENTIAL_SWAP');
    assert.equal(q.grossAmountOut, '200000000');
    assert.equal(q.feeAmountOut, '500000', '0.25% of 200 USDC = 0.50 USDC');
    assert.equal(q.amountOut, '199500000', 'Net output after 0.25% fee = 199.50 USDC');
    assert.equal(q.feeRecipient, nearIntents.DEFAULT_REFERRAL_ACCOUNT);

    // 0 NEAR gas requirement & third-party recipient allowed
    const gasCheck = uiController.validateSwapNearGasRequirement({
      wallet,
      fromToken: prlToken,
      toToken: nearUsdcToken,
      quoteData: q,
      amountIn: 100
    });
    assert.equal(gasCheck.ok, true);
    assert.equal(gasCheck.requiredNear, 0, 'Confidential swap must require 0 NEAR gas');
    assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlToken, nearUsdcToken, q), false);

    // Full 3-stage execution: Swap -> 0.25% Fee Internal Send -> Withdraw
    const execRes = await nearIntents.executeNearcomConfidentialSwapAndWithdraw({
      wallet,
      originAsset: q.originAsset,
      destinationAsset: q.destinationAsset,
      destinationChain: q.destinationChain,
      amountInRaw: '10000000000',
      slippageBps: 100,
      recipient: 'alice.near',
      feeBps: 25,
      feeRecipient: nearIntents.DEFAULT_REFERRAL_ACCOUNT
    });
    assert.equal(execRes.ok, true);
    assert.equal(execRes.swapIntentHash, 'swap_intent_hash_1');
    assert.equal(execRes.withdrawIntentHash, 'wd_intent_hash_1');
    assert.equal(execRes.feeAmountRaw, '500000');
    assert.equal(execRes.amountOut, '199500000');

    const wdQuotes = capturedCalls.filter((c) => c.url.endsWith('/api/withdraw/quote'));
    assert.equal(wdQuotes.length, 2, 'Must fire 1 internal fee send quote + 1 user destination withdraw quote');
    assert.equal(wdQuotes[0].body.recipientType, 'CONFIDENTIAL_INTENTS');
    assert.equal(wdQuotes[0].body.recipient, nearIntents.DEFAULT_REFERRAL_ACCOUNT);
    assert.equal(wdQuotes[0].body.amount, '500000');
    assert.equal(wdQuotes[1].body.recipientType, 'DESTINATION_CHAIN');
    assert.equal(wdQuotes[1].body.recipient, 'alice.near');
    assert.equal(wdQuotes[1].body.amount, '199500000');
  });
});

test('v6.35: DApp auto-connect (EVM/Solana/NEAR), PRL 0-NEAR-gas quoting & recipient unlock, and PTR spinner CSS', async () => {
  const dappBrowser = require('../src/dapp-browser.js');
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const zeroNearPrlWallet = state.normalizeWalletRecord({
    id: 'w_v635_prl',
    mnemonic: TEST_MNEMONIC,
    nearAddress: keys.nearAddress,
    nearPublicKey: keys.nearPublicKey,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    evmAddress: keys.evmAddress,
    solAddress: keys.solAddress,
    address: keys.pearlAddress,
    nativeBalances: { near: 0, prl: 500 }
  });

  // 1. DApp auto-connect across Solana (connect), NEAR (requestSignIn), EVM (eth_accounts), and Wallet Standard near:mainnet
  const solConn = await dappBrowser.handleDAppRpcRequest(
    { namespace: 'solana', method: 'connect', origin: 'https://jup.ag' },
    { wallet: zeroNearPrlWallet, contracts: chainContracts, crypto: cryptoEngine, autoConnectOrigin: true }
  );
  assert.equal(solConn.publicKey, zeroNearPrlWallet.solAddress);

  const nearConn = await dappBrowser.handleDAppRpcRequest(
    { namespace: 'near', method: 'requestSignIn', origin: 'https://near.com' },
    { wallet: zeroNearPrlWallet, contracts: chainContracts, crypto: cryptoEngine, autoConnectOrigin: true }
  );
  assert.equal(nearConn.accountId, zeroNearPrlWallet.nearAddress);

  const injectedScript = dappBrowser.buildInjectedProviderScript({
    evmAddress: zeroNearPrlWallet.evmAddress,
    solanaPublicKey: zeroNearPrlWallet.solAddress,
    nearAccountId: zeroNearPrlWallet.nearAddress,
    nearPublicKey: zeroNearPrlWallet.nearPublicKey
  });
  assert.ok(injectedScript.includes('near:mainnet'), 'Wallet Standard must advertise near:mainnet');
  assert.ok(injectedScript.includes('@near-wallet-selector:selectedWalletId'), 'Must pre-seed NEAR wallet selector key');
  assert.ok(injectedScript.includes('_metamask'), 'Must expose _metamask.isUnlocked');

  // 2. PRL -> NEAR/SOL with 0 NEAR gas: no premature "NEAR Gas 余额不足" while quoting or pre-quote; recipient unlocked
  const prlTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PRL' && t.blockchain === 'prl');
  const nearTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'NEAR' && t.blockchain === 'near');
  assert.ok(prlTok && nearTok);

  assert.equal(
    uiController.doesSwapRouteRequireSelfRecipient(prlTok, nearTok, null),
    false,
    'PRL -> NEAR must allow editing recipient address before quote resolves'
  );
  assert.equal(
    uiController.doesSwapRouteRequireSelfRecipient(prlTok, nearTok, { compositeType: 'NEARCOM_CONFIDENTIAL_SWAP' }),
    false,
    'Confidential swap must allow custom recipient address'
  );

  const quotingState = uiController.evaluateSwapButtonState({
    wallet: zeroNearPrlWallet,
    fromToken: prlTok,
    toToken: nearTok,
    amountIn: '10',
    quoteData: null,
    isQuoting: true
  });
  assert.equal(quotingState.reason, 'quoting', 'Must show Fetching quote instead of NEAR gas error while quoting');
  assert.equal(quotingState.isError, false);

  const preQuoteCheck = uiController.validateSwapNearGasRequirement({
    wallet: zeroNearPrlWallet,
    fromToken: prlTok,
    toToken: nearTok,
    quoteData: null,
    amountIn: 10
  });
  assert.equal(preQuoteCheck.requiredNear, 0, 'Pre-quote PRL check must not assume NEAR hub gas is required');

  // 3. Style check for complete circular PTR spinner with explicit 0%-100% keyframes
  const css = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.ok(css.includes('border-right-color: var(--near-emerald);'), 'PTR spinner must have dual-arc border for smooth circle');
  assert.ok(css.includes('0% {') && css.includes('transform: rotate(0deg);'), 'PTR keyframes must define explicit 0% start');
});

test('v6.66: FEATURES_SPEC.md, OKX Web3 Tx Detail style, Preact Perp/Icon parity, and NEAR Limit Auto-Wrap button', async () => {
  // 1. FEATURES_SPEC.md exists and documents OKX Web3 transaction style & Preact architecture
  const specPath = path.join(ROOT_DIR, 'docs', 'FEATURES_SPEC.md');
  assert.ok(fs.existsSync(specPath), 'docs/FEATURES_SPEC.md must exist');
  const specText = fs.readFileSync(specPath, 'utf8');
  assert.ok(specText.includes('OKX Web3') && specText.includes('TokenIconBadge'), 'FEATURES_SPEC.md must document OKX Web3 tx style and Preact components');

  // 2. Dead home drawer code removed from uiController
  assert.equal(typeof uiController.toggleAssetExpand, 'undefined', 'Deprecated toggleAssetExpand must be removed');
  assert.equal(typeof uiController.fetchChainTransactionDetailAsync, 'undefined', 'Deprecated UTXO fetchChainTransactionDetailAsync must be removed');

  // 3. Preact component source checks: text-emerald (no text-mint), 6-cell perp-pos-metrics-grid, badgeSvg, and limit picker support
  const perpPosJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'components', 'PerpOrderbookAndPositions.jsx'), 'utf8');
  assert.equal(perpPosJsx.includes('text-mint'), false, 'PerpOrderbookAndPositions.jsx must not use non-existent text-mint class');
  assert.ok(perpPosJsx.includes('text-emerald'), 'PerpOrderbookAndPositions.jsx must use text-emerald for positive PnL');
  assert.ok(perpPosJsx.includes('perp-pos-metrics-grid'), 'PerpOrderbookAndPositions.jsx must render full 6-cell metrics grid');
  assert.ok(perpPosJsx.includes('isTrigger') && perpPosJsx.includes('closedPnl'), 'PerpOrderbookAndPositions.jsx must support trigger orders and fill closedPnl');

  const iconBadgeJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'components', 'TokenIconBadge.jsx'), 'utf8');
  assert.ok(iconBadgeJsx.includes('PearlIridescentSvg') && iconBadgeJsx.includes('badgeSvg'), 'TokenIconBadge.jsx must render 3D Pearl SVG and chain vector badgeSvg');

  const pickerJsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'components', 'TokenPickerPanel.jsx'), 'utf8');
  assert.ok(pickerJsx.includes('showFavoriteBtn') && pickerJsx.includes('useContractAsAssetId'), 'TokenPickerPanel.jsx must support both Swap and Limit token picker modes');

  // 4. OKX Web3 transaction detail sheet & NEAR limit auto-wrap button state
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevLimit = { ...state.limit };
  const prevDoc = globalThis.document;

  const domMap = new Map();
  const getOrMake = (id) => {
    if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
    return domMap.get(id);
  };
  globalThis.document = {
    documentElement: { lang: 'zh-CN', classList: createMockClassList() },
    getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
    querySelectorAll: () => [],
    querySelector: () => null,
    activeElement: null
  };

  try {
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const w = state.normalizeWalletRecord({
      id: 'w_v666_test',
      mnemonic: TEST_MNEMONIC,
      nearAddress: keys.nearAddress,
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nativeBalances: { near: 5 },
      nearNep141Balances: { 'wrap.near': { raw: '1000000000000000000000000', formatted: 1 } }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    // Test OKX Web3 style tx detail sheet
    uiController.openTxDetailSheet({
      id: 'tx_okx_1',
      type: 'swap',
      symbol: 'NEAR',
      toSymbol: 'USDC',
      chain: 'near',
      amount: 12.5,
      txHash: '8f9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a',
      status: 'confirmed',
      timestamp: 1710000000
    });
    const detailHtml = getOrMake('tx-detail-body').innerHTML;
    assert.ok(detailHtml.includes('NEAR ➔ USDC'), 'OKX Tx Detail must show action pair');
    assert.ok(detailHtml.includes('-12.5 NEAR'), 'OKX Tx Detail must show signed amount');
    assert.ok(detailHtml.includes('https://nearblocks.io/txns/8f9a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a'), 'OKX Tx Detail must render direct block explorer button');
    assert.equal(detailHtml.includes('输出总额'), false, 'Legacy UTXO Total Output row must not appear');

    // Test NEAR Limit Order auto-wrap button state when wNEAR=1, native NEAR=5, and selling 3 wNEAR
    state.limit.chain = 'near';
    state.limit.sellContract = 'wrap.near';
    state.limit.buyContract = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
    state.limit.amountIn = '3';
    state.limit.targetRate = '4.5';
    state.limit.dclStorageRegistered = true;

    const limState = uiController.evaluateLimitOrderState();
    assert.equal(limState.disabled, false, 'NEAR limit order must be enabled when wNEAR + native NEAR covers amount + gas');
    assert.ok(
      limState.text.includes('自动封装 2 NEAR') || limState.text.includes('Auto-Wrap 2 NEAR'),
      `Expected auto-wrap prompt in button text, got: ${limState.text}`
    );
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    Object.assign(state.limit, prevLimit);
    globalThis.document = prevDoc;
  }
});

test('v6.67: Security Auth overlay sheet preservation, DApp MPC yParity recovery & atomic NEAR batch actions, and Send multi-stage swap guard', async () => {
  const dappBrowser = require('../src/dapp-browser.js');
  const ethersLib = require('../ethers.umd.min.js');
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevSwap = { ...state.swap };
  const prevDoc = globalThis.document;

  const domMap = new Map();
  const getOrMake = (id) => {
    if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
    return domMap.get(id);
  };
  globalThis.document = {
    documentElement: { lang: 'zh-CN', classList: createMockClassList() },
    getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
    querySelectorAll: (sel) => {
      if (sel === '.bottom-sheet.open') {
        return Array.from(domMap.values()).filter((el) => el.classList && el.classList.contains('open'));
      }
      return [];
    },
    querySelector: (sel) => {
      if (sel === '.bottom-sheet.open') {
        return Array.from(domMap.values()).find((el) => el.classList && el.classList.contains('open')) || null;
      }
      return null;
    },
    activeElement: null
  };

  try {
    // DApp Browser MPC personal_sign recovers exact wallet EVM address even if recovery_id is inverted
    const wallet = new ethersLib.Wallet('0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
    const msg = 'Sign in to Nexus DApp';
    const digestHex = ethersLib.hashMessage(msg);
    const rawSig = ethersLib.Signature.from(wallet.signingKey.sign(digestHex));
    const flippedParity = (rawSig.yParity ^ 1);

    const mockContracts = {
      ...chainContracts,
      resolveWalletEvmSender: () => wallet.address,
      ensureWalletSigningKeysAsync: async (w) => w,
      requestNearMpcChainSignature: async () => ({
        mpcSignature: {
          big_r: { affine_point: `02${rawSig.r.slice(2)}` },
          s: { scalar: rawSig.s.slice(2) },
          recovery_id: flippedParity
        }
      })
    };

    const signedHex = await dappBrowser.handleDAppRpcRequest(
      { namespace: 'evm', method: 'personal_sign', params: [msg, wallet.address], origin: 'https://near.com' },
      {
        wallet: { id: 'w_mpc_test', mpcEvmAddress: wallet.address },
        contracts: mockContracts,
        crypto: cryptoEngine,
        ethers: ethersLib,
        autoConnectOrigin: true,
        requestApprovalAsync: async () => true,
        verifyAuthAsync: async () => true
      }
    );
    const recovered = ethersLib.recoverAddress(digestHex, signedHex);
    assert.equal(recovered.toLowerCase(), wallet.address.toLowerCase(), 'MPC personal_sign must recover exact MPC EVM address even when recovery_id is flipped');

    // 3. DApp Browser NEAR signAndSendTransaction batches multiple actions into a single atomic transaction
    let batchCalledWith = null;
    const nearBatchContracts = {
      ...chainContracts,
      ensureWalletSigningKeysAsync: async (w) => w,
      getWalletNearSignerCredentials: () => ({ accountId: 'alice.near', publicKeyStr: 'ed25519:111', privateKeyStr: 'ed25519:222' }),
      signAndSendNearActionsBatch: async (args) => {
        batchCalledWith = args;
        return 'atomic_near_tx_hash_123';
      }
    };
    const nearTxRes = await dappBrowser.handleDAppRpcRequest(
      {
        namespace: 'near',
        method: 'signAndSendTransaction',
        params: [{
          receiverId: 'v2.ref-finance.near',
          actions: [
            { type: 'FunctionCall', params: { methodName: 'storage_deposit', args: {}, gas: '30000000000000', deposit: '1250000000000000000000' } },
            { type: 'FunctionCall', params: { methodName: 'swap', args: { actions: [] }, gas: '100000000000000', deposit: '1' } }
          ]
        }],
        origin: 'https://app.rhea.finance'
      },
      {
        wallet: { id: 'w_near_batch', nearNamedAccount: 'alice.near' },
        contracts: nearBatchContracts,
        crypto: cryptoEngine,
        autoConnectOrigin: true,
        requestApprovalAsync: async () => true,
        verifyAuthAsync: async () => true
      }
    );
    assert.ok(batchCalledWith, 'signAndSendTransaction must invoke atomic signAndSendNearActionsBatch');
    assert.equal(batchCalledWith.actions.length, 2, 'Both actions must be bundled in a single NEAR transaction');
    assert.equal(nearTxRes.txHash, 'atomic_near_tx_hash_123');
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    Object.assign(state.swap, prevSwap);
    globalThis.document = prevDoc;
  }
});

test('v6.94: Solana signTransaction Uint8Array, multi-hop Stage1->2 guards (120/121/122/131), DApp wallet isolation & NEAR named hydration, Perp concurrency & chart overscan/tap', async () => {
  const vm = require('node:vm');
  const dappBrowser = require('../src/dapp-browser.js');
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevSwap = { ...state.swap };
  const prevPerp = { ...state.perp };
  const prevDoc = globalThis.document;
  const prevFetch = globalThis.fetch;
  const prevWindow = globalThis.window;
  const prevCap = globalThis.Capacitor;
  const prevConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const domMap = new Map();
  const getOrMake = (id) => {
    if (!domMap.has(id)) domMap.set(id, createMockDomElement(id));
    return domMap.get(id);
  };
  globalThis.document = {
    documentElement: { lang: 'en', classList: createMockClassList() },
    getElementById: (id) => (id === 'sheet-confirm-dialog' ? null : getOrMake(id)),
    querySelectorAll: (sel) => {
      if (sel === '.bottom-sheet.open') {
        return Array.from(domMap.values()).filter((el) => el.classList && el.classList.contains('open'));
      }
      return [];
    },
    querySelector: () => null,
    activeElement: null
  };

  try {
    // 1. Injected Provider: solana:signTransaction with Uint8Array returns non-empty Uint8Array & near:signIn updates nearWalletStandardObj.accounts
    const injectedCode = dappBrowser.buildInjectedProviderScript({
      origin: 'https://near.com',
      evmAddress: '0x1111111111111111111111111111111111111111',
      solAddress: '11111111111111111111111111111111',
      nearAccountId: '',
      nearPublicKey: 'ed25519:11111111111111111111111111111111',
      chainIdHex: '0x1',
      walletName: 'Nexus Wallet'
    });
    const registeredStandards = [];
    const sandboxWindow = {
      location: { origin: 'https://near.com', href: 'https://near.com' },
      addEventListener: () => {},
      dispatchEvent: (ev) => {
        if (ev && ev.type === 'wallet-standard:register-wallet' && typeof ev.detail === 'function') {
          ev.detail({ register: (...wallets) => registeredStandards.push(...wallets) });
        }
        return true;
      },
      CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
      __NEXUS_TEST_BRIDGE__: {
        postMessage: (raw) => {
          const msg = JSON.parse(raw);
          setImmediate(() => {
            if (msg.method === 'signTransaction') {
              sandboxWindow.__nexusOnBridgeResponse(msg.id, { signedBase64: Buffer.from([9, 8, 7, 6]).toString('base64') }, null);
            } else if (msg.method === 'requestSignIn') {
              sandboxWindow.__nexusOnBridgeResponse(msg.id, { accountId: 'alice.near', publicKey: 'ed25519:11111111111111111111111111111111' }, null);
            } else {
              sandboxWindow.__nexusOnBridgeResponse(msg.id, {}, null);
            }
          });
        }
      }
    };
    sandboxWindow.window = sandboxWindow;
    vm.runInNewContext(injectedCode, {
      window: sandboxWindow,
      Uint8Array,
      Array,
      Object,
      Promise,
      JSON,
      Error,
      Math,
      String,
      Number,
      Boolean,
      parseInt,
      setTimeout,
      clearTimeout,
      btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
      atob: (s) => Buffer.from(s, 'base64').toString('binary'),
      Buffer,
      CustomEvent: sandboxWindow.CustomEvent
    });
    const solStd = registeredStandards.find((w) => w && w.features && w.features['solana:signTransaction']);
    const nearStd = registeredStandards.find((w) => w && w.features && w.features['near:signIn']);
    assert.ok(solStd && nearStd, 'Wallet Standard providers must register');
    const signedRes = await solStd.features['solana:signTransaction'].signTransaction({ transaction: new Uint8Array([1, 2, 3]) });
    assert.ok(signedRes[0].signedTransaction instanceof Uint8Array, 'solana:signTransaction must return Uint8Array');
    assert.deepEqual(Array.from(signedRes[0].signedTransaction), [9, 8, 7, 6], 'solana:signTransaction must preserve non-empty Uint8Array bytes');
    await nearStd.features['near:signIn'].signIn({});
    assert.equal(nearStd.accounts.length, 1, 'near:signIn must sync nearWalletStandardObj.accounts');
    assert.equal(nearStd.accounts[0].address, 'alice.near');

    // 2. Multi-hop Stage 1 -> Stage 2 guards across 120 / 121 / 122 / 131
    const wSwap = {
      id: 'w_multihop_guard',
      name: 'MultiHopGuard',
      biometricEnabled: false,
      nearAddress: '1111111111111111111111111111111111111111111111111111111111111111',
      nearNamedAccount: 'alice.near',
      nearPublicKey: 'ed25519:11111111111111111111111111111111',
      nearPrivateKey: 'ed25519:2222222222222222222222222222222222222222222222222222222222222222',
      solAddress: '11111111111111111111111111111111',
      solPrivateKey: '2222222222222222222222222222222222222222222222222222222222222222',
      evmAddress: '0x1111111111111111111111111111111111111111',
      evmPrivateKey: '0x' + '11'.repeat(32),
      nativeBalances: { near: 5, sol: 1, eth: 1, prl: 100 },
      splBalances: {
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 50
      },
      nearNep141Balances: {
        '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { raw: '5000000', formatted: 5 },
        'prl.tkn.near': { raw: '100000000000000000000', formatted: 100 }
      },
      solSplBalances: { 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { raw: '50000000', amount: 50, decimals: 6 } }
    };
    state.wallets = [wSwap];
    state.activeWalletId = wSwap.id;

    // Save originals on chainContracts / nearIntents
    const origWaitSol = chainContracts.waitForSolanaTxConfirmation;
    const origFetchSol = chainContracts.fetchSolanaNativeAndSplBalances;
    const origQuoteJup = chainContracts.quoteSolanaJupiterSwap;
    const origExecJup = chainContracts.executeSolanaJupiterSwap;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    const origQuoteIntent = nearIntents.quoteIntentSwapOrWithdraw;
    const origFetchNep = nearIntents.fetchNearNep141Balances;
    const origExecRef = chainContracts.executeNearRefPoolSwap;
    const origExecRefFin = chainContracts.executeNearRefFinanceSwap;
    const origExecDcl = chainContracts.executeNearDclPoolSwap;
    const origQuoteRef = chainContracts.quoteNearRefPoolSwap;
    const origQuoteDcl = chainContracts.quoteNearDclPoolSwap;

    try {
      globalThis.fetch = async (url, init) => {
        const u = String(url || '');
        if (u.includes('near.org') || u.includes('fastnear.com')) {
          return jsonResponse({
            jsonrpc: '2.0',
            id: 1,
            result: { nonce: 1, permission: 'FullAccess', amount: '5000000000000000000000000', block_hash: '11111111111111111111111111111111' }
          });
        }
        return jsonResponse({});
      };
      let stage2QuoteCalled = false;
      chainContracts.ensureWalletSigningKeysAsync = async (w) => w;
      chainContracts.quoteSolanaJupiterSwap = async () => ({ ok: true, outAmount: '500000000' });
      chainContracts.executeSolanaJupiterSwap = async () => ({ txHash: 'sol_stage1_tx_1' });
      chainContracts.fetchSolanaNativeAndSplBalances = async () => ({ nativeSol: 1, nativeLamports: '1000000000', splTokens: {} });
      nearIntents.quoteIntentSwapOrWithdraw = async () => { stage2QuoteCalled = true; return { ok: true, depositAddress: 'dep_addr' }; };

      // 122: SOL_DEX_TO_CROSS_CHAIN confirmation timeout (null) aborts Stage 2
      chainContracts.waitForSolanaTxConfirmation = async () => null;
      state.swap.fromAssetId = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near';
      state.swap.toAssetId = 'nep141:eth.omft.near';
      state.swap.amountIn = '10';
      state.swap.quoteData = {
        ok: true,
        routeType: 'COMPOSITE_ROUTE',
        compositeType: 'SOL_DEX_TO_CROSS_CHAIN',
        stage1DexQuote: { outAmount: '500000000' },
        fromToken: { symbol: 'USDC', blockchain: 'sol', decimals: 6, contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', assetId: 'nep141:sol-usdc.omft.near' },
        toToken: { symbol: 'ETH', blockchain: 'eth', decimals: 18, assetId: 'nep141:eth.omft.near' }
      };
      getOrMake('swap-amount-in').value = '10';
      await uiController.executeActiveSwap();
      assert.equal(stage2QuoteCalled, false, '122: Stage 2 quote must NOT be called when Stage 1 confirmation returns null');
      assert.match(getOrMake('swap-error-banner').textContent || '', /Stage 1|确认/i);

      // 122: SOL_DEX_TO_CROSS_CHAIN delta <= 0n aborts Stage 2 (no fallback to expectedLamports)
      chainContracts.waitForSolanaTxConfirmation = async () => true;
      await uiController.executeActiveSwap();
      assert.equal(stage2QuoteCalled, false, '122: Stage 2 quote must NOT be called when deltaLamports <= 0n');
      assert.match(getOrMake('swap-error-banner').textContent || '', /balance|余额/i);

      // 120: SMART_HUB_ROUTE ORIGIN_DEX (sol) confirmation timeout (null) aborts Stage 2
      chainContracts.waitForSolanaTxConfirmation = async () => null;
      state.swap.quoteData = {
        ok: true,
        routeType: 'COMPOSITE_ROUTE',
        compositeType: 'SMART_HUB_ROUTE',
        fromToken: { symbol: 'USDC', blockchain: 'sol', decimals: 6, contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near' },
        toToken: { symbol: 'ETH', blockchain: 'eth', decimals: 18, assetId: 'nep141:eth.omft.near' },
        stages: [
          { type: 'ORIGIN_DEX', chain: 'sol', quote: { outAmount: '500000000' }, intermediateSymbol: 'SOL' },
          { type: 'BRIDGE_IN', originAsset: 'nep141:sol.omft.near' },
          { type: 'BRIDGE_OUT', destinationAsset: 'nep141:eth.omft.near' }
        ]
      };
      await uiController.executeActiveSwap();
      assert.equal(stage2QuoteCalled, false, '120: SMART_HUB_ROUTE must abort when Stage 1 confirmation returns null');

      // 121: PRL_TO_NEAR_DCL delta <= 0n aborts Step 2 (no fallback to expectedUsdc)
      let dclQuoted = false;
      nearIntents.fetchNearNep141Balances = async () => ({ usdc: { raw: '5000000', amount: 5 } });
      chainContracts.quoteNearRefPoolSwap = async () => ({ ok: true, amountOut: '1000000', minAmountOut: '950000', poolId: 1 });
      chainContracts.executeNearRefPoolSwap = async () => ({ txHash: 'ref_prl_tx_1', amountOut: '1000000' });
      chainContracts.quoteNearDclPoolSwap = async () => { dclQuoted = true; return { ok: true, amountOut: '500000' }; };
      state.swap.fromAssetId = 'nep141:prl.omft.near';
      state.swap.toAssetId = nearIntents.QTC_NEAR_ASSET_ID;
      state.swap.amountIn = '10';
      state.swap.quoteData = {
        ok: true,
        routeType: 'PRL_COMPOSITE_ROUTE',
        compositeType: 'PRL_TO_NEAR_DCL',
        fromToken: { symbol: 'PRL', blockchain: 'near', decimals: 18, contractAddress: 'prl.tkn.near', assetId: 'nep141:prl.tkn.near' },
        toToken: { symbol: 'QTC', blockchain: 'near', decimals: 6, contractAddress: 'qtc.tkn.near', assetId: nearIntents.QTC_NEAR_ASSET_ID }
      };
      await uiController.executeActiveSwap();
      assert.equal(dclQuoted, false, '121: PRL Step 2 DCL quote must NOT be called when deltaRaw <= 0n');

      // 131: followUpRefSwap -> followUpDclSwap delta <= 0n aborts Stage 2
      chainContracts.executeNearRefFinanceSwap = async () => ({ txHash: 'ref_fin_tx_1', amountOut: '1000000' });
      chainContracts.executeNearDclPoolSwap = async () => ({ txHash: 'dcl_tx_1' });
      state.swap.activeOrder = {
        walletId: wSwap.id,
        depositAddress: 'dep_131',
        status: 'SUCCESS',
        followUpFailed: true,
        followUpRefSwap: {
          poolId: 1,
          tokenIn: 'wrap.near',
          tokenOut: nearIntents.NEAR_USDC_CONTRACT,
          amountUsdcRaw: '1000000',
          followUpDclSwap: { tokenIn: nearIntents.NEAR_USDC_CONTRACT, tokenOut: 'qtc.tkn.near' }
        }
      };
      nearIntents.fetchNearNep141Balances = async () => ({
        'wrap.near': { raw: '1000000', formatted: 1 },
        [nearIntents.NEAR_USDC_CONTRACT]: { raw: '5000000', formatted: 5 }
      });
      await uiController.resumeActiveSwapFollowUp();
      assert.equal(state.swap.activeOrder.followUpFailed, true, '131: followUpRefSwap must mark followUpFailed when deltaUsdc <= 0n');
      assert.equal(dclQuoted, false, '131: followUpDclSwap must NOT be called when deltaUsdc <= 0n');
    } finally {
      chainContracts.waitForSolanaTxConfirmation = origWaitSol;
      chainContracts.fetchSolanaNativeAndSplBalances = origFetchSol;
      chainContracts.quoteSolanaJupiterSwap = origQuoteJup;
      chainContracts.executeSolanaJupiterSwap = origExecJup;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
      nearIntents.quoteIntentSwapOrWithdraw = origQuoteIntent;
      nearIntents.fetchNearNep141Balances = origFetchNep;
      chainContracts.executeNearRefPoolSwap = origExecRef;
      chainContracts.executeNearRefFinanceSwap = origExecRefFin;
      chainContracts.executeNearDclPoolSwap = origExecDcl;
      chainContracts.quoteNearRefPoolSwap = origQuoteRef;
      chainContracts.quoteNearDclPoolSwap = origQuoteDcl;
      state.swap.activeOrder = null;
    }

    // 3. DApp Browser wallet.id isolation & NEAR named hydration bypassing stale _nearAccountChecked
    const wA = {
      id: 'w_iso_a',
      name: 'Wallet A',
      biometricEnabled: false,
      nearAddress: 'a'.repeat(64),
      nearPublicKey: 'ed25519:11111111111111111111111111111111',
      nearNamedAccount: '',
      _nearAccountChecked: true,
      discoveredNearAccounts: ['alice.near'],
      solAddress: '11111111111111111111111111111111',
      evmAddress: '0x1111111111111111111111111111111111111111'
    };
    const wB = {
      id: 'w_iso_b',
      name: 'Wallet B',
      nearAddress: 'b'.repeat(64),
      nearPublicKey: 'ed25519:22222222222222222222222222222222',
      nearNamedAccount: '',
      _nearAccountChecked: true,
      solAddress: '22222222222222222222222222222222',
      evmAddress: '0x2222222222222222222222222222222222222222'
    };
    state.wallets = [wA, wB];
    state.activeWalletId = wA.id;

    // getWalletNearSignerCredentials falls back to discoveredNearAccounts
    const credsA = chainContracts.getWalletNearSignerCredentials(wA);
    assert.equal(credsA.accountId, 'alice.near', 'getWalletNearSignerCredentials must fall back to discoveredNearAccounts');

    // launchDAppUrl hydrates nearNamedAccount for wB even when _nearAccountChecked === true
    let openedScript = '';
    globalThis.Capacitor = {
      Plugins: {
        NativeDAppBrowser: {
          openUrl: async (opts) => { openedScript = opts && opts.injectedScript ? opts.injectedScript : ''; }
        }
      }
    };
    globalThis.window = { Capacitor: globalThis.Capacitor };
    globalThis.fetch = async (url) => {
      if (String(url).includes('fastnear.com') || String(url).includes('kitwallet.app')) {
        return jsonResponse({ account_ids: ['bob.near'] });
      }
      return jsonResponse([]);
    };
    state.activeWalletId = wB.id;
    await uiController.launchDAppUrl('https://near.com');
    assert.equal(wB.nearNamedAccount, 'bob.near', 'launchDAppUrl must hydrate nearNamedAccount bypassing stale _nearAccountChecked');
    assert.ok(openedScript.includes('bob.near'), 'injectedScript must receive hydrated bob.near');

    // DApp connection isolation across switchActiveWallet and deleteWalletById
    await withMockedStorage({}, async (storage) => {
      state.activeWalletId = wA.id;
      await uiController.launchDAppUrl('https://app.rhea.finance');
      uiController.switchActiveWallet(wA.id);
      uiController.openDAppBrowserSheet();
      const listA = getOrMake('dapp-connected-section').innerHTML;
      assert.ok(listA.includes('rhea.finance'), 'Wallet A must see its own connected origin');

      uiController.switchActiveWallet(wB.id);
      const listB = getOrMake('dapp-connected-section').innerHTML;
      assert.equal(listB.includes('rhea.finance'), false, 'Wallet B must NOT see Wallet A connected origin');

      const delWalletFn = uiController.deleteWalletById || globalThis.deleteWalletById;
      assert.equal(typeof delWalletFn, 'function', 'deleteWalletById must be exposed');
      await delWalletFn(wA.id);
      const storedAfterDel = JSON.parse(storage.getItem('near_ca_dapp_connections_v1') || '[]');
      assert.equal(storedAfterDel.some((k) => k.startsWith('w_iso_a:')), false, 'Deleting Wallet A must purge its DApp connections');
    });

    // 4. Perps: switching wallet does not reuse old _perpRefreshInFlight & renderPerpView skips rebuild when interacting === '1'
    state.wallets = [wA, wB];
    state.activeWalletId = wA.id;
    let resolveFirstFetch;
    const requestedUsers = [];
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('hyperliquid.xyz/info') && init && init.body) {
        const body = JSON.parse(init.body);
        if (body.user) requestedUsers.push(body.user);
        if (body.type === 'clearinghouseState' && requestedUsers.length === 1) {
          await new Promise((r) => { resolveFirstFetch = r; });
        }
      }
      return jsonResponse({});
    };
    const p1 = uiController.refreshPerpDataAsync(false);
    await new Promise((r) => setTimeout(r, 20));
    state.activeWalletId = wB.id;
    const p2 = uiController.refreshPerpDataAsync(false);
    assert.notEqual(p1, p2, 'Switching wallet must NOT reuse old wallet _perpRefreshInFlight promise');
    if (resolveFirstFetch) resolveFirstFetch();
    await Promise.allSettled([p1, p2]);
    assert.ok(requestedUsers.some((a) => a.toLowerCase() === wB.evmAddress.toLowerCase()), 'New wallet must trigger its own Perp fetch');

    // renderPerpView skips chartSvgEl.innerHTML when dataset.interacting === '1'
    const chartEl = getOrMake('perp-chart-svg');
    chartEl.dataset = chartEl.dataset || {};
    chartEl.dataset.interacting = '1';
    chartEl.innerHTML = '<svg data-sentinel="keep-me"></svg>';
    state.perp.selectedCoin = 'BTC';
    state.perp.markets = [{ name: 'BTC', markPx: '95000', szDecimals: 4, maxLeverage: 50 }];
    state.perp.candles = Array.from({ length: 90 }, (_, i) => ({ t: 1700000000000 + i * 60000, o: 95000, h: 95100, l: 94900, c: 95050, v: 10 }));
    state.perp.chartVisibleCount = 40;
    state.perp.chartOffsetFromEnd = 20;
    uiController.renderPerpView();
    assert.equal(chartEl.innerHTML, '<svg data-sentinel="keep-me"></svg>', 'renderPerpView must skip SVG rebuild while dataset.interacting === "1"');

    // 5. 161-perps-chart: 24-candle overscan buffer + touch direct tap with plotL..plotR mapping
    const overscanSvg = uiController.renderPerpCandleSvg(state.perp.candles, state.perp.markets[0], null, { overscan: 24 });
    assert.ok(/viewBox="0 0 (?:[4-9]\d\d|\d{4,})/.test(overscanSvg), 'Overscan SVG must have expanded viewBox width');
    assert.ok(overscanSvg.includes('margin-left:-'), 'Overscan SVG must apply negative margin-left for left buffer');

    chartEl.dataset.interacting = '0';
    chartEl.dataset.gesturesBound = '0';
    const listeners = {};
    chartEl.addEventListener = (ev, fn) => { listeners[ev] = fn; };
    chartEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 216 });
    chartEl.querySelector = () => null;
    state.perp.inspectedCandleIdx = null;
    uiController.renderPerpView();
    assert.equal(typeof listeners.touchstart, 'function', 'bindPerpChartGestures must attach touchstart');
    assert.equal(typeof listeners.touchend, 'function', 'bindPerpChartGestures must attach touchend');
    // Tap at plotL (6) -> index 0; tap near plotR (353) -> last visible candle
    listeners.touchstart({ touches: [{ identifier: 1, clientX: 6, clientY: 100 }] });
    listeners.touchend({ changedTouches: [{ identifier: 1, clientX: 6, clientY: 100 }], touches: [] });
    assert.equal(state.perp.inspectedCandleIdx, 0, 'Touch tap at plotL (x=6) must inspect candle index 0');
    await new Promise((r) => setTimeout(r, 460));
    listeners.touchstart({ touches: [{ identifier: 2, clientX: 353, clientY: 100 }] });
    listeners.touchend({ changedTouches: [{ identifier: 2, clientX: 353, clientY: 100 }], touches: [] });
    assert.equal(state.perp.inspectedCandleIdx, 39, 'Touch tap near plotR (x=353) must inspect last visible candle');
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    Object.assign(state.swap, prevSwap);
    Object.assign(state.perp, prevPerp);
    globalThis.document = prevDoc;
    globalThis.fetch = prevFetch;
    globalThis.window = prevWindow;
    globalThis.Capacitor = prevCap;
    globalThis.confirm = prevConfirm;
  }
});
