'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  hlPerps,
  chainContracts,
  dappBrowser,
  state,
  uiController,
  withMockedFetch,
  withMockedStorage,
  jsonResponse
} = require('./helpers');

function makeMockElement(id = '') {
  const classes = new Set();
  const el = {
    id,
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    offsetHeight: 360,
    offsetWidth: 375,
    style: {},
    dataset: {},
    attrs: {},
    onclick: null,
    listeners: {},
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      contains: (n) => classes.has(n),
      toggle: (n, force) => {
        if (force === undefined) {
          if (classes.has(n)) { classes.delete(n); return false; }
          classes.add(n); return true;
        }
        if (force) classes.add(n); else classes.delete(n);
        return Boolean(force);
      }
    },
    setAttribute: (k, v) => { el.attrs[k] = String(v); },
    getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
    addEventListener: (ev, fn) => {
      el.listeners[ev] = el.listeners[ev] || [];
      el.listeners[ev].push(fn);
    },
    removeEventListener: (ev, fn) => {
      if (!el.listeners[ev]) return;
      el.listeners[ev] = el.listeners[ev].filter((f) => f !== fn);
    },
    querySelector: () => null,
    querySelectorAll: () => []
  };
  return el;
}

test('Item 5: formatHlUsdcAmount truncates downward to 6 decimals without IEEE-754 underflow', () => {
  assert.equal(hlPerps.formatHlUsdcAmount('1.0000019'), '1.000001');
  assert.equal(hlPerps.formatHlUsdcAmount(1.000001), '1.000001');
  assert.equal(hlPerps.formatHlUsdcAmount(10.1234569), '10.123456');
  assert.equal(hlPerps.formatHlUsdcAmount('99.9999999'), '99.999999');
  assert.equal(hlPerps.formatHlUsdcAmount('0.0000009'), '0');
  assert.equal(hlPerps.formatHlUsdcAmount(0), '0');
  assert.equal(hlPerps.formatHlUsdcAmount(-5), '0');
  assert.equal(hlPerps.formatHlUsdcAmount('not-a-number'), '0');

  for (const sample of ['1.0000019', '12.9999999', 0.1234567, 1.000001, 500.0000009]) {
    const formatted = hlPerps.formatHlUsdcAmount(sample);
    assert.ok(Number(formatted) <= Number(sample), `Expected ${formatted} <= ${sample}`);
  }
});

test('Item 4: attachTpslOrdersToPositions & parseHlClearinghouseState preserve TP/SL and HIP-3 positions', () => {
  const ch = {
    marginSummary: { accountValue: '1000', totalMarginUsed: '100' },
    withdrawable: '900',
    assetPositions: [
      {
        position: {
          coin: 'ETH',
          szi: '0.5',
          entryPx: '3000',
          positionValue: '1550',
          unrealizedPnl: '50',
          liquidationPx: '2200',
          marginUsed: '100',
          leverage: { type: 'cross', value: 15 }
        }
      }
    ]
  };
  const openOrders = [
    { coin: 'ETH', oid: 101, orderType: 'Take Profit Market', triggerPx: '3500', isPositionTpsl: true },
    { coin: 'ETH', oid: 102, orderType: 'Stop Market', triggerPx: '2700', isPositionTpsl: true }
  ];

  const parsed = hlPerps.parseHlClearinghouseState(ch, openOrders);
  assert.equal(parsed.positions.length, 1);
  assert.equal(parsed.positions[0].tpTriggerPx, 3500);
  assert.equal(parsed.positions[0].slTriggerPx, 2700);
  assert.equal(parsed.positions[0].tpslOrders.length, 2);

  // Simulate webData2 merge preserving HIP-3 positions/orders
  const prevHip3Pos = { coin: 'xyz:CRCL', szi: '2', isLong: true, entryPx: 80, tpTriggerPx: null, slTriggerPx: null };
  const prevHip3Orders = [{ coin: 'xyz:CRCL', oid: 201, orderType: 'Take Profit Market', triggerPx: '95', isTrigger: true }];
  const mergedOrders = [...openOrders, ...prevHip3Orders];
  const mergedPositions = [...parsed.positions, prevHip3Pos];
  hlPerps.attachTpslOrdersToPositions(mergedPositions, mergedOrders);

  const crcl = mergedPositions.find((p) => p.coin === 'xyz:CRCL');
  assert.ok(crcl, 'HIP-3 position must be retained');
  assert.equal(crcl.tpTriggerPx, 95);
  assert.equal(crcl.tpslOrders.length, 1);
});

test('Item 3: waitForSolanaTxConfirmation polls until confirmed and throws on on-chain err', async () => {
  let pollCount = 0;
  const status = await withMockedFetch(async (url, opts) => {
    const body = JSON.parse(opts.body || '{}');
    if (body.method === 'getSignatureStatuses') {
      pollCount += 1;
      if (pollCount === 1) return jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: [null] } });
      if (pollCount === 2) return jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: [{ confirmationStatus: 'processed', err: null }] } });
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: [{ confirmationStatus: 'confirmed', err: null }] } });
    }
    return jsonResponse({ jsonrpc: '2.0', id: 1, result: null });
  }, async () => {
    return chainContracts.waitForSolanaTxConfirmation('5MockSolSig111', 10000);
  });

  assert.equal(pollCount, 3);
  assert.equal(status.confirmationStatus, 'confirmed');

  await assert.rejects(async () => {
    await withMockedFetch(async () => {
      return jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: { value: [{ confirmationStatus: 'confirmed', err: { InstructionError: [0, 'Custom'] } }] }
      });
    }, () => chainContracts.waitForSolanaTxConfirmation('5FailedSolSig', 5000));
  }, /failed|失败/i);
});

test('Item 2 & 12: showConfirmDialogAsync backdrop click & closeAllSheets resolve(false) without closing parent sheet', async () => {
  const prevDoc = globalThis.document;
  const elements = {
    'sheet-confirm-dialog': makeMockElement('sheet-confirm-dialog'),
    'confirm-dialog-backdrop': makeMockElement('confirm-dialog-backdrop'),
    'sheet-backdrop': makeMockElement('sheet-backdrop'),
    'sheet-backup': makeMockElement('sheet-backup'),
    'confirm-dialog-title': makeMockElement('confirm-dialog-title'),
    'confirm-dialog-message': makeMockElement('confirm-dialog-message'),
    'btn-confirm-dialog-ok': makeMockElement('btn-confirm-dialog-ok'),
    'btn-confirm-dialog-cancel': makeMockElement('btn-confirm-dialog-cancel'),
    'btn-confirm-dialog-close': makeMockElement('btn-confirm-dialog-close')
  };
  elements['sheet-backup'].classList.add('open');
  elements['sheet-backdrop'].classList.add('open');

  globalThis.document = {
    body: makeMockElement('body'),
    documentElement: makeMockElement('html'),
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
      if (sel === '.bottom-sheet.open') {
        return Object.values(elements).find((el) => el.id.startsWith('sheet-') && el.id !== 'sheet-backdrop' && el.classList.contains('open')) || null;
      }
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel === '.bottom-sheet.open') {
        return Object.values(elements).filter((el) => el.id.startsWith('sheet-') && el.id !== 'sheet-backdrop' && el.classList.contains('open'));
      }
      if (sel === '.bottom-sheet') {
        return Object.values(elements).filter((el) => el.id.startsWith('sheet-') && el.id !== 'sheet-backdrop');
      }
      if (sel === '.sheet-backdrop') {
        return [elements['sheet-backdrop'], elements['confirm-dialog-backdrop']];
      }
      return [];
    }
  };

  try {
    // 1. Clicking #confirm-dialog-backdrop resolves false and keeps parent #sheet-backup open
    const p1 = uiController.showConfirmDialogAsync('Burn dust?', { danger: true });
    assert.equal(elements['sheet-confirm-dialog'].classList.contains('open'), true);
    assert.equal(elements['confirm-dialog-backdrop'].classList.contains('open'), true);
    assert.equal(typeof elements['confirm-dialog-backdrop'].onclick, 'function');

    elements['confirm-dialog-backdrop'].onclick();
    const res1 = await p1;
    assert.equal(res1, false);
    assert.equal(elements['sheet-confirm-dialog'].classList.contains('open'), false);
    assert.equal(elements['confirm-dialog-backdrop'].classList.contains('open'), false);
    assert.equal(elements['sheet-backup'].classList.contains('open'), true, 'Parent sheet must remain open');

    // 2. Calling closeAllSheets while confirm dialog is open resolves false (no deadlock)
    const p2 = uiController.showConfirmDialogAsync('Second confirm?');
    assert.equal(elements['sheet-confirm-dialog'].classList.contains('open'), true);
    uiController.closeAllSheets();
    const res2 = await p2;
    assert.equal(res2, false);
    assert.equal(elements['sheet-confirm-dialog'].classList.contains('open'), false);
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});

test('Item 7: dappBrowser eth_signTypedData_v4 supports both [address, typedData] and [typedData, address] and rejects invalid JSON', async () => {
  const wallet = {
    id: 'w1',
    evmAddress: '0x1111111111111111111111111111111111111111',
    evmPrivateKey: '0x' + '11'.repeat(32)
  };
  const typedPayload = JSON.stringify({
    domain: { name: 'Test', version: '1', chainId: 1 },
    types: { EIP712Domain: [], Mail: [{ name: 'contents', type: 'string' }] },
    primaryType: 'Mail',
    message: { contents: 'hello' }
  });
  let signCalls = 0;
  const mockEthers = {
    Wallet: class {
      async signTypedData(domain, types, message) {
        signCalls += 1;
        assert.equal(domain.name, 'Test');
        assert.equal(types.EIP712Domain, undefined);
        assert.equal(message.contents, 'hello');
        return '0xsigned';
      }
    }
  };
  const ctx = {
    wallet,
    activeEvmChainKey: 'eth',
    ethers: mockEthers,
    contracts: {
      ...chainContracts,
      ensureWalletSigningKeysAsync: async () => {},
      resolveWalletEvmSender: (w) => w.evmAddress
    },
    requestApprovalAsync: async () => true,
    requireBiometricAuth: async () => true,
    requestBiometricAuthAsync: async () => true
  };

  const sig1 = await dappBrowser.handleDAppRpcRequest({
    method: 'eth_signTypedData_v4',
    params: [wallet.evmAddress, typedPayload]
  }, ctx);
  assert.match(sig1, /^0x[0-9a-fA-F]{130}$/);

  const sig2 = await dappBrowser.handleDAppRpcRequest({
    method: 'eth_signTypedData_v4',
    params: [typedPayload, wallet.evmAddress]
  }, ctx);
  assert.equal(sig2, sig1);

  await assert.rejects(
    () => dappBrowser.handleDAppRpcRequest({
      method: 'eth_signTypedData_v4',
      params: [wallet.evmAddress, '{bad-json']
    }, ctx),
    (err) => err && err.code === -32602
  );
});

test('Item 10: setLanguage triggers onLanguageChange once without double lang topic notification', async () => {
  await withMockedStorage({}, async () => {
    let langHookCount = 0;
    const emittedTopics = [];
    const prevFw = globalThis.NearCAFramework;
    globalThis.NearCAFramework = {
      ...(prevFw || {}),
      notifyFrameworkState: (topic) => emittedTopics.push(topic)
    };
    state.onLanguageChange(() => { langHookCount += 1; });
    try {
      state.setLanguage('en');
      state.setLanguage('zh');
      assert.equal(langHookCount, 2);
      assert.equal(emittedTopics.filter((t) => t === 'lang').length, 2);
    } finally {
      if (prevFw === undefined) delete globalThis.NearCAFramework;
      else globalThis.NearCAFramework = prevFw;
    }
  });
});
