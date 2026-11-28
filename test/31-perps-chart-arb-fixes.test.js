'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  chainContracts,
  hlPerps,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  withMockedStorage,
  createMockDomElement
} = require('./helpers.js');

function makeSampleCandles(count = 80, startTs = 1795400000000, stepMs = 900_000) {
  return Array.from({ length: count }, (_, i) => {
    const base = 95000 + Math.sin(i / 4) * 200 + i * 5;
    return {
      t: startTs + i * stepMs,
      o: base,
      h: base + 120,
      l: base - 90,
      c: base + 45,
      v: 100 + i * 3
    };
  });
}

test('Perp chart removes right-side green price/countdown box while keeping mark dashed line', () => {
  const series = makeSampleCandles(30);
  const svg = uiController.renderPerpCandleSvg(series, { markPx: 95120 });
  assert.ok(svg.includes('stroke="#00ec97"'), 'K-line must retain lightweight horizontal mark price dashed line');
  assert.equal(svg.includes('width="64" height="22"'), false, 'Right-side green price/countdown pill must be removed so newest candles are never covered');
  assert.equal(svg.includes('x="290"'), false, 'Right-side pill background must not appear');
});

test('Perp K-line L1+L2 history cache stores >64 candles cleanly and refreshes incrementally', async () => {
  const prevPerp = { ...state.perp };
  const prevFetch = globalThis.fetch;
  try {
    await withMockedStorage({}, async (storage) => {
      state.initState();
      const bars = makeSampleCandles(220, Date.now() - 220 * 900_000, 900_000);
      const stored = state.putCachedPerpCandles('BTC', '15m', bars);
      assert.equal(stored.length, 220, 'L1 memory cache must retain full 220+ bars instead of truncating at 64');
      assert.equal(state.getCachedPerpCandles('BTC', '15m').length, 220);

      // Verify dedicated L2 compact storage key
      const rawDisk = storage.getItem(state.PERP_CANDLES_STORAGE_KEY);
      assert.ok(rawDisk && rawDisk.includes('BTC|15m'), 'L2 candle cache must persist under dedicated PERP_CANDLES_STORAGE_KEY');
      const parsedDisk = JSON.parse(rawDisk);
      assert.ok(Array.isArray(parsedDisk['BTC|15m'].d[0]) && parsedDisk['BTC|15m'].d[0].length === 6, 'L2 disk cache must use compact 6-tuple arrays');

      // Incremental refresh must request only recent tail range instead of full 180-200 bars
      state.perp.selectedCoin = 'BTC';
      state.perp.chartInterval = '15m';
      state.perp.showChart = true;
      state.perp.candles = [];
      const newestT = bars[bars.length - 1].t;
      const candleReqs = [];
      await withMockedFetch(async (url, opts) => {
        if (String(url).includes('/info') && opts && opts.body) {
          const body = JSON.parse(opts.body);
          if (body.type === 'l2Book') return jsonResponse({ levels: [[], []] });
          if (body.type === 'candleSnapshot') {
            candleReqs.push(body.req);
            return jsonResponse([
              { t: newestT, o: '96100', h: '96200', l: '96000', c: '96180', v: '999' },
              { t: newestT + 900_000, o: '96180', h: '96250', l: '96150', c: '96220', v: '321' }
            ]);
          }
        }
        return jsonResponse({});
      }, async () => {
        await uiController.refreshPerpOrderbookAndCandlesAsync();
      });

      assert.equal(candleReqs.length, 1);
      assert.ok(candleReqs[0].startTime >= newestT - 2 * 900_000 - 1000, 'Incremental refresh must start near newestT - 2*interval');
      assert.equal(state.perp.candles.length, 221, 'Incremental tail bar must append onto cached history without losing earlier bars');
      assert.equal(state.perp.candles[state.perp.candles.length - 1].c, 96220);
      assert.equal(state.perp.candles[state.perp.candles.length - 2].c, 96180);

      // Left-edge older history backfill prepends earlier candles cleanly without duplicates
      const oldestT = state.perp.candles[0].t;
      const backfillReqs = [];
      await withMockedFetch(async (url, opts) => {
        if (String(url).includes('/info') && opts && opts.body) {
          const body = JSON.parse(opts.body);
          if (body.type === 'candleSnapshot') {
            backfillReqs.push(body.req);
            return jsonResponse([
              { t: oldestT - 1800_000, o: '94000', h: '94100', l: '93900', c: '94050', v: '80' },
              { t: oldestT - 900_000, o: '94050', h: '94200', l: '94000', c: '94120', v: '90' }
            ]);
          }
        }
        return jsonResponse({});
      }, async () => {
        await uiController.loadOlderPerpCandlesAsync();
      });
      assert.equal(backfillReqs.length, 1);
      assert.equal(backfillReqs[0].endTime, oldestT - 1);
      assert.equal(state.perp.candles.length, 223);
      assert.equal(state.perp.candles[0].c, 94050);

      // P1-2: A transient network failure during backfill must NOT permanently blacklist coin|interval
      const curOldestT = state.perp.candles[0].t;
      let retryReqs = 0;
      await withMockedFetch(async () => {
        retryReqs++;
        throw new Error('network timeout');
      }, async () => {
        await uiController.loadOlderPerpCandlesAsync();
      });
      assert.equal(retryReqs, 1);
      assert.equal(state.perp.candles.length, 223);

      await withMockedFetch(async (url, opts) => {
        if (String(url).includes('/info') && opts && opts.body) {
          const body = JSON.parse(opts.body);
          if (body.type === 'candleSnapshot') {
            retryReqs++;
            return jsonResponse([
              { t: curOldestT - 900_000, o: '93900', h: '94000', l: '93850', c: '93950', v: '75' }
            ]);
          }
        }
        return jsonResponse({});
      }, async () => {
        await uiController.loadOlderPerpCandlesAsync();
      });
      assert.equal(retryReqs, 2, 'Next left-pan backfill after transient network failure must retry');
      assert.equal(state.perp.candles.length, 224);
      assert.equal(state.perp.candles[0].c, 93950);

      // Empty array response legitimately marks genesis exhausted and skips further requests
      await withMockedFetch(async () => {
        retryReqs++;
        return jsonResponse([]);
      }, async () => {
        await uiController.loadOlderPerpCandlesAsync();
        await uiController.loadOlderPerpCandlesAsync();
      });
      assert.equal(retryReqs, 3, 'Empty array response must mark key exhausted so repeated pans do not spam API');
    });
  } finally {
    Object.assign(state.perp, prevPerp);
    globalThis.fetch = prevFetch;
  }
});

test('Perp chart Canvas offscreen base layer + outside click dismissal + Zero CLS', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevPerp = { ...state.perp };
  try {
    state.perp.selectedCoin = 'BTC';
    state.perp.chartInterval = '15m';
    state.perp.chartVisibleCount = 40;
    state.perp.chartOffsetFromEnd = 0;
    state.perp.inspectedCandleIdx = null;
    state.perp.markets = [{ name: 'BTC', markPx: '95500', szDecimals: 4, maxLeverage: 50 }];
    state.perp.candles = makeSampleCandles(60);

    const docListeners = {};
    const winListeners = {};
    let baseDrawImageCalls = 0;
    let fillTextCount = 0;
    const makeCtx = () => ({
      setTransform: () => {},
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      rect: () => {},
      clip: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      quadraticCurveTo: () => {},
      closePath: () => {},
      stroke: () => {},
      fill: () => {},
      fillRect: () => {},
      setLineDash: () => {},
      fillText: () => { fillTextCount++; },
      drawImage: () => { baseDrawImageCalls++; }
    });

    const host = createMockDomElement('perp-chart-svg', { dataset: {} });
    host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 216 });
    const canvasNodes = [];
    const attachedChildren = [];
    host.appendChild = (ch) => {
      ch.parentNode = host;
      attachedChildren.push(ch);
    };
    const detailBar = createMockDomElement('perp-candle-detail');
    detailBar.classList.add('hidden');
    const outsideEl = createMockDomElement('perp-mark-px');

    const domMap = new Map([
      ['perp-chart-svg', host],
      ['perp-candle-detail', detailBar],
      ['perp-mark-px', outsideEl]
    ]);

    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => [],
      addEventListener: (ev, fn) => { docListeners[ev] = fn; },
      createElement: (tag) => {
        const node = createMockDomElement(`mock-${tag}-${canvasNodes.length}`);
        if (tag === 'canvas') {
          node.getContext = () => makeCtx();
          canvasNodes.push(node);
        }
        return node;
      }
    };
    globalThis.window = {
      devicePixelRatio: 2,
      addEventListener: (ev, fn) => { winListeners[ev] = fn; }
    };

    host.contains = (t) => t === host || attachedChildren.includes(t);
    host.querySelector = (sel) => (sel === 'canvas.perp-chart-canvas' ? attachedChildren[0] || null : null);

    uiController.renderPerpView();
    assert.ok(canvasNodes.length >= 2, 'Should create display canvas + offscreen base canvas');
    assert.equal(host.dataset.candleCount, '40');
    const initialFillText = fillTextCount;
    assert.ok(initialFillText > 0, 'Initial base chart draw must render canvas labels');

    // Redrawing PerpView with identical chart data/window must skip redrawing base chart
    uiController.renderPerpView();
    assert.equal(fillTextCount, initialFillText, 'Signature guard must skip redundant chart redraws on unrelated state changes');

    // Inspecting a candle draws crosshair using cached offscreen base layer (no full base redraw)
    const prevDrawImages = baseDrawImageCalls;
    uiController.inspectPerpCandle(5, true);
    assert.equal(state.perp.inspectedCandleIdx, 5);
    assert.equal(host.dataset.selectedIdx, '5');
    assert.equal(fillTextCount - initialFillText, 2, 'Crosshair scrub must only draw the 2 pill labels over cached base layer');
    assert.equal(baseDrawImageCalls, prevDrawImages + 1);
    assert.equal(detailBar.classList.contains('hidden'), false);
    assert.equal(detailBar.classList.contains('is-inspecting'), true);

    // Event inside host must NOT dismiss inspection
    assert.equal(typeof docListeners.touchstart, 'function', 'Outside dismiss must bind capture touchstart');
    docListeners.touchstart({ target: attachedChildren[0] });
    assert.equal(state.perp.inspectedCandleIdx, 5, 'Touch inside chart must keep inspection active');

    // Event outside host MUST dismiss inspection immediately
    docListeners.touchstart({ target: outsideEl });
    assert.equal(state.perp.inspectedCandleIdx, null, 'Touch outside chart must immediately clear inspectedCandleIdx');
    assert.equal(host.dataset.selectedIdx, '');
    assert.equal(detailBar.classList.contains('hidden'), true);
    assert.equal(detailBar.classList.contains('is-inspecting'), false);

    // Inspect again and verify backToPerpOverview clears it too
    uiController.inspectPerpCandle(3, true);
    assert.equal(state.perp.inspectedCandleIdx, 3);
    uiController.backToPerpOverview();
    assert.equal(state.perp.inspectedCandleIdx, null);
  } finally {
    Object.assign(state.perp, prevPerp);
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('Perp chart ResizeObserver syncs new market/interval viewport and stops pan inertia on coin/interval switch', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevRo = globalThis.ResizeObserver;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;
  const prevPerp = { ...state.perp };
  try {
    state.perp.markets = [
      { name: 'BTC', markPx: '95500', szDecimals: 4, maxLeverage: 50 },
      { name: 'ETH', markPx: '3200', szDecimals: 4, maxLeverage: 50 },
      { name: 'SOL', markPx: '180', szDecimals: 2, maxLeverage: 20 }
    ];
    state.perp.selectedCoin = 'BTC';
    state.perp.chartInterval = '15m';
    state.perp.subView = 'trade';
    state.perp.chartVisibleCount = 54;
    state.perp.chartOffsetFromEnd = 20;
    state.perp.candles = makeSampleCandles(90);

    const makeCtx = () => ({
      setTransform: () => {}, clearRect: () => {}, save: () => {}, restore: () => {},
      beginPath: () => {}, rect: () => {}, clip: () => {}, moveTo: () => {}, lineTo: () => {},
      arc: () => {}, quadraticCurveTo: () => {}, closePath: () => {}, stroke: () => {}, fill: () => {},
      fillRect: () => {}, setLineDash: () => {}, fillText: () => {}, drawImage: () => {}
    });

    const hostListeners = {};
    const host = createMockDomElement('perp-chart-svg', { dataset: {} });
    host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 360, height: 216 });
    host.addEventListener = (ev, fn) => { hostListeners[ev] = fn; };
    const attached = [];
    host.appendChild = (ch) => { ch.parentNode = host; attached.push(ch); };
    host.querySelector = (sel) => (sel === 'canvas.perp-chart-canvas' ? attached[0] || null : null);
    host.contains = (t) => t === host || attached.includes(t);

    let roCallback = null;
    globalThis.ResizeObserver = function (cb) {
      roCallback = cb;
      return { observe: () => {}, disconnect: () => {} };
    };

    let nextRafId = 1;
    const rafQueue = new Map();
    let cancelledCount = 0;
    globalThis.requestAnimationFrame = (fn) => {
      const id = nextRafId++;
      rafQueue.set(id, fn);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => {
      if (rafQueue.delete(id)) cancelledCount++;
    };

    const canvasNodes = [];
    const detailBar = createMockDomElement('perp-candle-detail');
    const domMap = new Map([['perp-chart-svg', host], ['perp-candle-detail', detailBar]]);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      createElement: (tag) => {
        const node = createMockDomElement(`ro-${tag}-${canvasNodes.length}`);
        if (tag === 'canvas') { node.getContext = () => makeCtx(); canvasNodes.push(node); }
        return node;
      }
    };
    globalThis.window = { devicePixelRatio: 2, addEventListener: () => {} };

    uiController.renderPerpView();
    assert.equal(host.dataset.candleCount, '54');
    assert.equal(typeof roCallback, 'function');

    // Simulate wheel zoom & active touch pan inertia on BTC before switching to ETH
    hostListeners.wheel({ deltaY: 100, preventDefault: () => {} });
    assert.equal(state.perp.chartVisibleCount, 60);
    hostListeners.touchstart({ touches: [{ identifier: 1, clientX: 200, clientY: 100 }] });
    hostListeners.touchmove({ touches: [{ identifier: 1, clientX: 120, clientY: 100 }], cancelable: true, preventDefault: () => {} });
    hostListeners.touchend({ touches: [], changedTouches: [{ identifier: 1, clientX: 120, clientY: 100 }] });
    assert.ok(rafQueue.size > 0, 'Pan should schedule inertia/redraw rAF');

    const prevCancelled = cancelledCount;
    uiController.openPerpTradeScreen('ETH');
    assert.ok(cancelledCount > prevCancelled, 'openPerpTradeScreen must cancel pending pan inertia/redraw rAF');
    assert.equal(host.dataset.interacting, '', 'openPerpTradeScreen must clear interacting state');
    assert.equal(state.perp.chartVisibleCount, 48);
    assert.equal(state.perp.chartOffsetFromEnd, 0);

    // Seed ETH candles and trigger ResizeObserver (e.g. panel un-hidden) -> must NOT revert to BTC's vis=60
    state.perp.candles = makeSampleCandles(90);
    uiController.renderPerpView();
    assert.equal(host.dataset.candleCount, '48');
    roCallback();
    assert.equal(host.dataset.candleCount, '48', 'ResizeObserver must sync from state instead of overwriting with stale closure vis=60');
    assert.equal(state.perp.chartOffsetFromEnd, 0);

    // Also verify selectPerpMarket and setPerpChartInterval stop inertia and preserve 48-candle window across ResizeObserver
    hostListeners.wheel({ deltaY: -100, preventDefault: () => {} });
    uiController.selectPerpMarket('SOL');
    assert.equal(state.perp.chartVisibleCount, 48);
    state.perp.candles = makeSampleCandles(90);
    uiController.renderPerpView();
    roCallback();
    assert.equal(host.dataset.candleCount, '48');

    // Triggering ResizeObserver with empty candles resets candleCount to '0' cleanly
    state.perp.candles = [];
    uiController.setPerpChartInterval('1h');
    roCallback();
    assert.equal(host.dataset.candleCount, '0');
  } finally {
    Object.assign(state.perp, prevPerp);
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
    if (prevRo === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = prevRo;
    if (prevRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = prevRaf;
    if (prevCaf === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = prevCaf;
  }
});

test('Arbitrum ERC-20 gasLimit no longer inflated to 600k, zero priority fee preserved, null balances show -- and copy avoids Gas jargon', async () => {
  const prevEthers = globalThis.ethers;
  const prevFetch = globalThis.fetch;
  globalThis.ethers = require('../ethers.umd.min.js');
  try {
    await withMockedStorage({}, async () => {
      state.initState();
      const w = state.normalizeWalletRecord({
        id: 'w_arb_gas',
        name: 'ArbGas',
        mnemonic: TEST_MNEMONIC
      });
      await chainContracts.ensureWalletSigningKeysAsync(w);
      const derived = globalThis.ethers.HDNodeWallet.fromPhrase(TEST_MNEMONIC);
      w.evmAddress = derived.address;
      w.evmPrivateKey = derived.privateKey;
      w.evmSignMode = 'local';
      w.nativeBalances.arb = 0.0005;
      state.wallets = [w];
      state.activeWalletId = w.id;

      let sentRawTx = null;
      const mockBlock = {
        hash: '0x' + '1'.repeat(64),
        parentHash: '0x' + '0'.repeat(64),
        number: '0x10',
        timestamp: '0x67000000',
        nonce: '0x0000000000000000',
        difficulty: '0x0',
        gasLimit: '0x1c9c380',
        gasUsed: '0x0',
        miner: '0x' + '0'.repeat(40),
        extraData: '0x',
        baseFeePerGas: '0x5f5e100',
        transactions: []
      };
      const handleRpcItem = (b) => {
        if (b.method === 'eth_chainId') return { jsonrpc: '2.0', id: b.id, result: '0xa4b1' };
        if (b.method === 'eth_getTransactionCount') return { jsonrpc: '2.0', id: b.id, result: '0x1' };
        if (b.method === 'eth_estimateGas') return { jsonrpc: '2.0', id: b.id, result: '0xfde8' }; // 65,000
        if (b.method === 'eth_getBlockByNumber') return { jsonrpc: '2.0', id: b.id, result: mockBlock };
        if (b.method === 'eth_maxPriorityFeePerGas' || b.method === 'eth_feeHistory') return { jsonrpc: '2.0', id: b.id, result: '0x0' };
        if (b.method === 'eth_gasPrice') return { jsonrpc: '2.0', id: b.id, result: '0x5f5e100' };
        if (b.method === 'eth_sendRawTransaction') {
          sentRawTx = b.params[0];
          return { jsonrpc: '2.0', id: b.id, result: globalThis.ethers.keccak256(b.params[0]) };
        }
        if (b.method === 'eth_getTransactionReceipt') {
          return { jsonrpc: '2.0', id: b.id, result: { transactionHash: b.params[0], blockNumber: '0x10', status: '0x1' } };
        }
        return { jsonrpc: '2.0', id: b.id, result: '0x1' };
      };
      const rpcOk = (body) => new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
      await withMockedFetch(async (_url, opts) => {
        const raw = typeof opts?.body === 'string' ? opts.body : Buffer.from(opts?.body || '{}').toString('utf8');
        const parsed = JSON.parse(raw);
        return rpcOk(Array.isArray(parsed) ? parsed.map(handleRpcItem) : handleRpcItem(parsed));
      }, async () => {
        const res = await chainContracts.executeEvmTransfer({
          wallet: w,
          chainKey: 'arb',
          toAddress: hlPerps.HL_ARB_BRIDGE2_ADDRESS,
          amount: 10,
          decimals: 6,
          tokenContract: hlPerps.HL_ARB_USDC_ADDRESS,
          tokenBalance: 50
        });
        assert.ok(res && res.txHash);
      });

      assert.ok(sentRawTx, 'Raw transaction must have been signed and broadcast');
      const parsedTx = globalThis.ethers.Transaction.from(sentRawTx);
      assert.equal(parsedTx.gasLimit, 78000n, 'Successful estimate (65k) must scale to 78k (+20%), NOT inflate to 600,000n');
      assert.equal(parsedTx.maxPriorityFeePerGas, 0n, 'Arbitrum 0n maxPriorityFeePerGas must not be replaced by maxFee/4');

      // Simplified Arbitrum deposit sheet: no ETH balance row / yellow notice; null USDC shows '--', and ETH pre-check remains active
      const prevDoc = globalThis.document;
      const usdcAvail = createMockDomElement('perp-arb-usdc-avail');
      const errEl = createMockDomElement('perp-arb-error');
      const btn = createMockDomElement('btn-perp-arb-deposit');
      const domMap = new Map([
        ['perp-arb-usdc-avail', usdcAvail],
        ['perp-arb-error', errEl],
        ['btn-perp-arb-deposit', btn]
      ]);
      globalThis.document = {
        getElementById: (id) => domMap.get(id) || null,
        querySelectorAll: () => []
      };
      try {
        w.nativeBalances.arb = null;
        uiController.setPerpFundingTab('arbitrum');
        assert.equal(usdcAvail.textContent, '--');

        state.setWalletErc20Balance(w, 'arb', hlPerps.HL_ARB_USDC_ADDRESS, 25.5);
        uiController.setPerpFundingTab('arbitrum');
        assert.equal(usdcAvail.textContent, '25.50 USDC');
      } finally {
        globalThis.document = prevDoc;
      }

      const sheetsSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/sheets/ToolsAndChainSheets.jsx'), 'utf8');
      assert.equal(sheetsSrc.includes('perp-arb-eth-avail'), false);
      assert.equal(sheetsSrc.includes('perp.arbBridgeNotice'), false);
      assert.equal(state.i18nDict.zh['perp.arbEthBalLabel'], undefined);
      assert.equal(state.i18nDict.en['perp.arbEthBalLabel'], undefined);
      assert.equal(state.i18nDict.zh['perp.arbBridgeNotice'], undefined);
      assert.equal(state.i18nDict.en['perp.arbBridgeNotice'], undefined);

      // Copy clarity: mentions ETH not ARB when fee is actually insufficient, zero Gas jargon
      const lowFeeState = uiController.evaluatePerpArbDepositState({ amount: 10, arbUsdc: 20, arbEth: 0.00005 });
      assert.equal(lowFeeState.disabled, true);
      assert.match(lowFeeState.error, /ETH/);
      assert.equal(/\bgas\b/i.test(lowFeeState.error), false);
      assert.equal(/\bgas\b/i.test(lowFeeState.text), false);
    });
  } finally {
    if (prevEthers === undefined) delete globalThis.ethers;
    else globalThis.ethers = prevEthers;
    globalThis.fetch = prevFetch;
  }
});

test('Perp chart supports all 14 Hyperliquid intervals, More sheet & pinned prefs persistence, and 4-digit year timestamps', async () => {
  const prevPerp = { ...state.perp };
  const prevLang = state.lang;
  const prevDoc = globalThis.document;
  const prevFetch = globalThis.fetch;
  try {
    await withMockedStorage({}, async (storage) => {
      state.initState();
      state.lang = 'zh';
      const expected14 = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d', '3d', '1w', '1M'];
      assert.deepEqual(hlPerps.HL_CANDLE_INTERVALS, expected14);
      assert.equal(hlPerps.getHlCandleIntervalMs('1m'), 60_000);
      assert.equal(hlPerps.getHlCandleIntervalMs('1M'), 2_592_000_000);
      assert.equal(hlPerps.isSupportedHlCandleInterval('1s'), false);
      assert.equal(hlPerps.isSupportedHlCandleInterval('3M'), false);

      for (const iv of expected14) {
        assert.ok(typeof state.i18nDict.zh[`perp.iv${iv}`] === 'string' && state.i18nDict.zh[`perp.iv${iv}`].length > 0, `zh missing perp.iv${iv}`);
        assert.ok(typeof state.i18nDict.en[`perp.iv${iv}`] === 'string' && state.i18nDict.en[`perp.iv${iv}`].length > 0, `en missing perp.iv${iv}`);
      }

      // 1. Selecting custom interval '1M' (month) vs '1m' (minute) preserves exact case, updates #btn-perp-iv-more & persists
      const moreBtn = createMockDomElement('btn-perp-iv-more');
      const toastEl = createMockDomElement('toast');
      const domMap = new Map([['btn-perp-iv-more', moreBtn], ['toast', toastEl]]);
      globalThis.document = {
        getElementById: (id) => domMap.get(id) || null,
        querySelectorAll: () => []
      };

      await withMockedFetch(async () => jsonResponse([]), async () => {
        uiController.setPerpChartInterval('1M');
        assert.equal(state.perp.chartInterval, '1M');
        assert.equal(moreBtn.classList.contains('active'), true);
        assert.equal(moreBtn.textContent, '1月 ▾');

        uiController.setPerpChartInterval('1m');
        assert.equal(state.perp.chartInterval, '1m');
        assert.equal(moreBtn.textContent, '1分 ▾');
      });

      const savedPrefs = JSON.parse(storage.getItem('near_ca_perp_intervals_v1') || '{}');
      assert.equal(savedPrefs.active, '1m');
      assert.deepEqual(savedPrefs.pinned, ['5m', '15m', '1h', '4h', '1d']);

      // Edit pinned intervals: max 5 guard, unpin + pin '30m', then restore via loadPerpIntervalPrefs
      uiController.togglePerpIntervalEditMode();
      assert.equal(state.perp.editingIntervals, true);
      uiController.handlePerpIntervalPick('30m'); // already 5 pinned -> blocked with toast
      assert.equal(state.perp.pinnedIntervals.length, 5);
      uiController.handlePerpIntervalPick('4h'); // unpin 4h -> 4 left
      assert.equal(state.perp.pinnedIntervals.includes('4h'), false);
      uiController.handlePerpIntervalPick('30m'); // pin 30m -> 5 pinned
      assert.equal(state.perp.pinnedIntervals.includes('30m'), true);
      uiController.togglePerpIntervalEditMode();
      assert.equal(state.perp.editingIntervals, false);

      state.perp.pinnedIntervals = ['5m'];
      state.perp.chartInterval = '15m';
      const restored = uiController.loadPerpIntervalPrefs();
      assert.equal(restored.active, '1m');
      assert.equal(restored.pinned.includes('30m'), true);

      // 2. 4-digit year formatting in detail HUD, SVG crosshair & cross-year X-axis ticks
      const tsNov2026 = new Date(2026, 10, 28, 15, 5).getTime();
      const tsDec2025 = new Date(2025, 11, 31, 23, 45).getTime();
      assert.equal(uiController.formatPerpCandleTime(tsNov2026, '15m'), '2026/11/28 15:05');
      assert.equal(uiController.formatPerpCandleTime(tsNov2026, '1d'), '2026/11/28');
      assert.equal(uiController.formatPerpCandleTime(tsNov2026, '1M'), '2026/11/28');

      const curYrTs = new Date(new Date().getFullYear(), 4, 10, 9, 30).getTime();
      assert.equal(uiController.formatPerpAxisTime(curYrTs, '15m', false), '05/10 09:30');
      assert.equal(uiController.formatPerpAxisTime(tsDec2025, '15m', true), '2025/12/31 23:45');
      assert.equal(uiController.formatPerpAxisTime(tsDec2025, '1w', false), '2025/12/31');

      state.perp.chartInterval = '15m';
      state.perp.chartVisibleCount = 20;
      state.perp.chartOffsetFromEnd = 0;
      const crossYearSeries = [
        { t: tsDec2025, o: 90000, h: 90500, l: 89500, c: 90200, v: 100 },
        { t: tsNov2026, o: 90200, h: 91000, l: 90100, c: 90800, v: 120 }
      ];
      const svgCrossYear = uiController.renderPerpCandleSvg(crossYearSeries, { markPx: 90800 }, 1);
      assert.ok(svgCrossYear.includes('2025/12/31 23:45'), 'Cross-year X axis must display 4-digit year');
      assert.ok(svgCrossYear.includes('2026/11/28 15:05'), 'Selected crosshair pill must display 4-digit year');
      assert.ok(svgCrossYear.includes('width="86"'), 'Selected crosshair pill must widen cleanly to fit YYYY/MM/DD HH:mm');
    });
  } finally {
    Object.assign(state.perp, prevPerp);
    state.lang = prevLang;
    globalThis.document = prevDoc;
    globalThis.fetch = prevFetch;
  }
});
