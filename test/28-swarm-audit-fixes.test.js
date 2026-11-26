'use strict';

const {
  test,
  assert,
  chainContracts,
  uiController,
  state,
  withMockedFetch,
  jsonResponse
} = require('./helpers');

test('Swarm audit: oRHEA get_account parses mainnet { conversions: { id: conv } } shape', async () => {
  const lockedStartMs = Date.now() - 10 * 86400_000;
  const claimableStartMs = Date.now() - 200 * 86400_000;
  await withMockedFetch(async (url, opts) => {
    if (url.includes('fastnear.com')) {
      return jsonResponse({ pools: [] });
    }
    if (opts && opts.body) {
      const b = JSON.parse(opts.body);
      const acc = b.params && b.params.account_id;
      const m = b.params && b.params.method_name;
      if (acc === 'orhea-conv.rhealab.near' && m === 'get_account') {
        const payload = {
          conversions: {
            '774': {
              conversion_strategy: { Oneshot: { lock_period_days: 181 } },
              conversion_detail: {
                source_amount: (40n * 10n ** 18n).toString(),
                target_amount: (40n * 10n ** 18n).toString(),
                claimed_amount: (10n * 10n ** 18n).toString(),
                start_time_ms: lockedStartMs
              }
            },
            '775': {
              conversion_strategy: { Oneshot: { lock_period_days: 181 } },
              conversion_detail: {
                source_amount: (15n * 10n ** 18n).toString(),
                target_amount: (15n * 10n ** 18n).toString(),
                claimed_amount: '0',
                start_time_ms: claimableStartMs
              }
            }
          }
        };
        return jsonResponse({ jsonrpc: '2.0', result: { result: [...Buffer.from(JSON.stringify(payload))] } });
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const positions = await chainContracts.fetchNearAccountStakingPositionsAsync('alice.near');
    const convPos = positions.find((p) => p.type === 'lock_convert');
    assert.ok(convPos, 'Expected oRHEA lock_convert position');
    assert.equal(convPos.poolId, 'rhea_orhea_convert');
    assert.equal(convPos.totalAmount, 45);
    assert.deepEqual(convPos.activeIds, ['774', '775']);
    assert.deepEqual(convPos.claimableIds, ['775']);
    assert.equal(convPos.canClaim, true);
  });
});

test('Swarm audit: openTxDetailSheet(item, "") + navigateBackFromTxDetail() closes sheets instead of opening sheet-token-detail', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const openedSheets = [];
  let closedCount = 0;

  const makeEl = () => ({
    textContent: '',
    innerHTML: '',
    value: '',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, f) { if (f) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); }
    },
    style: {},
    setAttribute() {},
    getAttribute() { return ''; },
    querySelectorAll() { return []; },
    querySelector() { return null; }
  });

  const sheets = {
    'sheet-tx-detail': makeEl(),
    'sheet-token-detail': makeEl()
  };

  globalThis.document = {
    getElementById(id) {
      if (sheets[id]) return sheets[id];
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.bottom-sheet.open' || sel === '.bottom-sheet' || sel === '.sheet') {
        return Object.entries(sheets)
          .filter(([, el]) => sel !== '.bottom-sheet.open' || el.classList.contains('open'))
          .map(([id, el]) => ({
            id,
            classList: {
              add(c) { el.classList.add(c); if (c === 'open') openedSheets.push(id); },
              remove(c) { el.classList.remove(c); if (c === 'open') closedCount += 1; },
              contains(c) { return el.classList.contains(c); }
            },
            setAttribute() {}
          }));
      }
      return [];
    },
    querySelector() { return null; }
  };
  globalThis.window = { NearCAFramework: {} };

  try {
    state.txModal = state.txModal || {};
    uiController.openTxDetailSheet({
      id: 'swap_1',
      type: 'swap',
      symbol: 'NEAR',
      amount: 1,
      status: 'SUCCESS',
      timestamp: Date.now()
    }, '');
    assert.equal(state.txModal.detailBackSheetId, '');
    assert.ok(sheets['sheet-tx-detail'].classList.contains('open'));

    uiController.navigateBackFromTxDetail();
    assert.equal(sheets['sheet-tx-detail'].classList.contains('open'), false);
    assert.equal(sheets['sheet-token-detail'].classList.contains('open'), false);
    assert.ok(closedCount >= 1);
    assert.equal(openedSheets.includes('sheet-token-detail'), false);
  } finally {
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});

test('Swarm audit: schedulePerpOneClickQuote(true) syncs fundingOriginAssetId and clears stale amount', () => {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevPerp = { ...state.perp };

  const amountEl = { value: '123.45' };
  const selectEl = { value: 'sol:native' };

  globalThis.document = {
    getElementById(id) {
      if (id === 'perp-oc-origin-select') return selectEl;
      if (id === 'perp-oc-amount') return amountEl;
      return null;
    },
    querySelectorAll() { return []; },
    querySelector() { return null; }
  };
  globalThis.window = { NearCAFramework: {} };

  try {
    state.perp.fundingOriginAssetId = 'near:native';
    state.perp.fundingQuote = { ok: true, amountOutFormatted: '100' };
    state.perp.fundingQuoteError = 'old error';

    uiController.schedulePerpOneClickQuote(true);

    assert.equal(state.perp.fundingOriginAssetId, 'sol:native');
    assert.equal(amountEl.value, '');
    assert.equal(state.perp.fundingQuote, null);
    assert.equal(state.perp.fundingQuoteError, '');
  } finally {
    Object.assign(state.perp, prevPerp);
    globalThis.document = prevDoc;
    globalThis.window = prevWin;
  }
});
