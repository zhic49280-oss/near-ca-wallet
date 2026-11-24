'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  state,
  uiController,
  withMockedFetch,
  jsonResponse
} = require('./helpers.js');

test('v6.38-v6.40 UX Audit Fixes: Perp coin switch clears DOM inputs (no 60084 leak)', async () => {
  const domNodes = {};
  const getOrMake = (id) => {
    if (!domNodes[id]) {
      const classes = new Set();
      domNodes[id] = {
        id,
        value: '',
        checked: false,
        disabled: false,
        textContent: '',
        innerHTML: '',
        dataset: {},
        style: {},
        attrs: {},
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (c, force) => {
            if (force === true) classes.add(c);
            else if (force === false) classes.delete(c);
            else if (classes.has(c)) classes.delete(c);
            else classes.add(c);
          },
          contains: (c) => classes.has(c)
        },
        setAttribute: (k, v) => { domNodes[id].attrs[k] = String(v); },
        getAttribute: (k) => domNodes[id].attrs[k] ?? null,
        addEventListener: () => {}
      };
    }
    return domNodes[id];
  };

  const prevDoc = globalThis.document;
  globalThis.document = {
    getElementById: (id) => getOrMake(id),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    documentElement: { style: {}, classList: { add: () => {}, remove: () => {} } },
    body: { classList: { add: () => {}, remove: () => {}, contains: () => false } }
  };

  try {
    state.wallets = [{ id: 'w1', nearAddress: 'a'.repeat(64), nativeBalances: {} }];
    state.activeWalletId = 'w1';
    state.perp.markets = [
      { name: 'BTC', markPx: 60084, maxLeverage: 50, szDecimals: 4 },
      { name: 'HYPE', markPx: 62.89, maxLeverage: 20, szDecimals: 2 }
    ];

    uiController.openPerpTradeScreen('BTC');
    getOrMake('perp-limit-price-input').value = '60084';
    getOrMake('perp-margin-input').value = '100';
    getOrMake('perp-tp-input').value = '70000';
    getOrMake('perp-sl-input').value = '55000';
    getOrMake('perp-reduce-only-chk').checked = true;
    uiController.evaluatePerpOrderUI();
    assert.equal(state.perp.limitPriceInput, '60084');

    // Switch to HYPE via selectPerpMarket: DOM + state must be completely cleared
    uiController.selectPerpMarket('HYPE');
    assert.equal(getOrMake('perp-limit-price-input').value, '');
    assert.equal(getOrMake('perp-margin-input').value, '');
    assert.equal(getOrMake('perp-tp-input').value, '');
    assert.equal(getOrMake('perp-sl-input').value, '');
    assert.equal(getOrMake('perp-reduce-only-chk').checked, false);
    assert.equal(state.perp.limitPriceInput, '');
    assert.equal(state.perp.marginInput, '');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

test('v6.38-v6.40 UX Audit Fixes: Swap flip & origin change clear swap-amount-in, and multi-stage guard checks correct fields', async () => {
  const domNodes = {};
  const getOrMake = (id) => {
    if (!domNodes[id]) {
      const classes = new Set();
      domNodes[id] = {
        id,
        value: '',
        disabled: false,
        textContent: '',
        innerHTML: '',
        dataset: {},
        style: {},
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (c, force) => {
            if (force === true) classes.add(c);
            else if (force === false) classes.delete(c);
            else if (classes.has(c)) classes.delete(c);
            else classes.add(c);
          },
          contains: (c) => classes.has(c)
        },
        setAttribute: () => {},
        addEventListener: () => {}
      };
    }
    return domNodes[id];
  };

  const prevDoc = globalThis.document;
  globalThis.document = {
    getElementById: (id) => getOrMake(id),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    documentElement: { style: {}, classList: { add: () => {}, remove: () => {} } },
    body: { classList: { add: () => {}, remove: () => {}, contains: () => false } }
  };

  try {
    state.wallets = [{ id: 'w1', nearAddress: 'a'.repeat(64), nativeBalances: { near: 10 }, nearNep141Balances: {} }];
    state.activeWalletId = 'w1';
    state.swap.fromAssetId = 'nep141:wrap.near';
    state.swap.toAssetId = 'nep141:sol.omft.near';
    state.swap.amountIn = '1000';
    getOrMake('swap-amount-in').value = '1000';

    globalThis.flipSwapTokens();
    assert.equal(state.swap.amountIn, '', 'flipSwapTokens must clear amountIn state');
    assert.equal(getOrMake('swap-amount-in').value, '', 'flipSwapTokens must clear DOM input');

    state.swap.amountIn = '500';
    getOrMake('swap-amount-in').value = '500';
    state.swap.pickerSide = 'from';
    globalThis.selectSwapToken('nep141:wrap.near');
    assert.equal(state.swap.amountIn, '', 'Changing swap from token must clear amountIn');
    assert.equal(getOrMake('swap-amount-in').value, '', 'Changing swap from token must clear DOM input');

    // Verify multi-stage guard source code uses followUpSolDexSwap, followUpEvmDexSwap, followUpExecuted, COMPLETED
    const coreSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/120-swap-execute-core.part.js'), 'utf8');
    assert.ok(coreSrc.includes('existingOrder.followUpSolDexSwap'));
    assert.ok(coreSrc.includes('existingOrder.followUpEvmDexSwap'));
    assert.ok(coreSrc.includes('!existingOrder.followUpExecuted'));
    assert.ok(coreSrc.includes("'COMPLETED'"));
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

test('v6.39 UX Audit Fixes: Confidential Intents refresh does not fall through to 1Click & Swap History renders', async () => {
  const domNodes = {};
  const getOrMake = (id) => {
    if (!domNodes[id]) {
      const classes = new Set();
      domNodes[id] = {
        id,
        value: '',
        disabled: false,
        textContent: '',
        innerHTML: '',
        dataset: {},
        style: {},
        classList: {
          add: (...c) => c.forEach((x) => classes.add(x)),
          remove: (...c) => c.forEach((x) => classes.delete(x)),
          toggle: (c, force) => {
            if (force === true) classes.add(c);
            else if (force === false) classes.delete(c);
            else if (classes.has(c)) classes.delete(c);
            else classes.add(c);
          },
          contains: (c) => classes.has(c)
        },
        setAttribute: () => {},
        addEventListener: () => {}
      };
    }
    return domNodes[id];
  };

  const prevDoc = globalThis.document;
  globalThis.document = {
    getElementById: (id) => getOrMake(id),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    documentElement: { style: {}, classList: { add: () => {}, remove: () => {} } },
    body: { classList: { add: () => {}, remove: () => {}, contains: () => false } }
  };

  try {
    const calledUrls = [];
    state.wallets = [{
      id: 'w1',
      nearAddress: 'a'.repeat(64),
      nativeBalances: {},
      activityHistory: [
        { type: 'swap', symbol: 'USDC', toSymbol: 'PRL', chain: 'near', amount: 10, txHash: '2ee7b7abc4853', timestamp: Math.floor(Date.now() / 1000) }
      ]
    }];
    state.activeWalletId = 'w1';
    state.swap.activeOrder = {
      walletId: 'w1',
      depositAddress: 'intents_deposit_xyz',
      status: 'PENDING_DEPOSIT',
      originTxHash: '2ee7b7abc4853',
      autoBroadcasted: true,
      followUpConfidentialSwap: { depositProof: 'proof_123' }
    };

    uiController.renderSwapOrderCard();
    assert.ok(getOrMake('swap-history-list').innerHTML.includes('USDC ➔ PRL'), 'Swap history card must render swap entries');

    await withMockedFetch(async (url) => {
      calledUrls.push(String(url));
      return jsonResponse({ error: 'temporary' }, 500);
    }, async () => {
      await uiController.refreshActiveSwapOrderStatus(true);
    });

    assert.equal(calledUrls.some((u) => u.includes('1click.chaindefuser.com')), false, 'Confidential swap refresh must not fall through to 1Click status endpoint');
    assert.equal(getOrMake('btn-refresh-swap-order').disabled, false, 'Refresh button must be re-enabled after completion');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

test('v6.40 UX Audit Fixes: Always-on K-line bar, full-width chart without right price axis, and stacked orderbook Price header', async () => {
  const series = [
    { t: 1795400000000, o: 5.0, h: 5.3, l: 4.7, c: 5.1, v: 1200 },
    { t: 1795400900000, o: 5.1, h: 5.4, l: 5.0, c: 5.25, v: 950 }
  ];
  const svg = uiController.renderPerpCandleSvg(series, { markPx: 5.25 });
  assert.ok(svg.includes('viewBox="0 0 360 268"'), 'K-line SVG must use expanded 268px height');
  assert.ok(svg.includes('x2="354"'), 'K-line plot must expand to full width (354) without right price axis column');
  assert.ok(state.i18nDict?.zh?.['perp.obBidPx'] !== '买价', 'Orderbook header must not be mislabeled as Bid');

  const dictSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/state/010-i18n-dict.part.js'), 'utf8');
  assert.ok(dictSrc.includes("'perp.obBidPx': '价格 (USDC)'"));
  assert.ok(dictSrc.includes("'perp.obBidPx': 'Price (USDC)'"));
});
