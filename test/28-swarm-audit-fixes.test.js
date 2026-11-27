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

test('Wave-3: TxStepperModal handles doneTitle, inTransit & failure states and zero blockchain jargon remains', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');

  const txModalSrc = fs.readFileSync(path.join(root, 'src/app/components/TxFlowModals.jsx'), 'utf8');
  assert.ok(txModalSrc.includes('stepper.doneTitle'), 'TxStepperModal should support stepper.doneTitle');
  assert.ok(txModalSrc.includes('inTransit'), 'TxStepperModal should support inTransit state');
  assert.ok(txModalSrc.includes("t('交易未完成', 'Transaction Failed')"), 'TxStepperModal should render 交易未完成 on failure');

  const scanDirs = [
    path.join(root, 'src/parts/ui-controller'),
    path.join(root, 'src/app')
  ];
  const walkFiles = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walkFiles(full));
      else if (/\.(jsx?|part\.js)$/.test(entry.name)) out.push(full);
    }
    return out;
  };
  for (const dir of scanDirs) {
    for (const file of walkFiles(dir)) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        /广播|上链/.test(content),
        false,
        `Unexpected blockchain jargon (广播/上链) in ${path.relative(root, file)}`
      );
    }
  }
});

test('Wave-3: useI18n reactive tr() and RemainingIslandsPanels mount helpers are exported on NearCAFramework', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');

  const storeSrc = fs.readFileSync(path.join(root, 'src/app/store/useWalletStore.js'), 'utf8');
  assert.match(storeSrc, /export function useI18n\(\)/, 'useWalletStore.js must export useI18n()');
  assert.match(storeSrc, /const tr = \(key, fallback = ''\) =>/, 'useI18n() must define reactive tr()');
  assert.match(storeSrc, /return \{ lang, isEn, t, tr \};/, 'useI18n() must return { lang, isEn, t, tr }');

  const panelsSrc = fs.readFileSync(path.join(root, 'src/app/components/RemainingIslandsPanels.jsx'), 'utf8');
  assert.equal(/const lang = useLang\(\)/.test(panelsSrc), false, 'RemainingIslandsPanels.jsx must destructure { isEn: storeIsEn } from useLang()');

  const mainSrc = fs.readFileSync(path.join(root, 'src/app/main.jsx'), 'utf8');
  const expectedHelpers = [
    'mountOnboardSeedGrid',
    'mountTokenDetailIcon',
    'mountTokenDetailChains',
    'mountTokenDetailEarnList',
    'mountTokenPickerPills'
  ];
  for (const helper of expectedHelpers) {
    assert.ok(mainSrc.includes(`export function ${helper}`), `main.jsx must export ${helper}`);
    assert.ok(mainSrc.includes(helper), `NearCAFramework must expose ${helper}`);
  }
});

test('Wave-4 OKX Perps: zero L/S ratio dead code, 10-field floating HUD, Price-left OB & P2 polishes', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');

  const dictSrc = fs.readFileSync(path.join(root, 'src/parts/state/010-i18n-dict.part.js'), 'utf8');
  assert.equal(dictSrc.includes('perp.lsRatioLabel'), false, 'Dead i18n key perp.lsRatioLabel must be removed');

  const hlSrc = fs.readFileSync(path.join(root, 'src/hyperliquid-perps.js'), 'utf8');
  assert.equal(hlSrc.includes('fetchGlobalLongShortAccountRatio'), false, 'Deprecated L/S fetch must be removed');
  assert.equal(hlSrc.includes('resolveBinanceFuturesSymbol'), false, 'Deprecated Binance symbol helper must be removed');

  const hudSrc = fs.readFileSync(path.join(root, 'src/app/components/PerpDetailPanels.jsx'), 'utf8');
  const expectedKeys = ['time', 'open', 'high', 'low', 'close', 'chg', 'chgPct', 'amp', 'vol', 'turnover'];
  for (const k of expectedKeys) {
    assert.ok(hudSrc.includes(`k: '${k}'`), `PerpChartHudPanel must include 10-field key ${k}`);
  }

  const obSrc = fs.readFileSync(path.join(root, 'src/app/components/PerpOrderbookAndPositions.jsx'), 'utf8');
  assert.ok(
    obSrc.indexOf('formatPerpPx(r.px)') < obSrc.indexOf('fmtObSz(r.sz)'),
    'OKX orderbook row must render Price on the left and Size on the right'
  );

  const cssSrc = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
  assert.match(cssSrc, /\.perp-ob-funding-row\s*\{[^}]*flex-direction:\s*column/s, '.perp-ob-funding-row must stack vertically');
  assert.match(cssSrc, /\.perp-okx-dual-actions\s*\{[^}]*flex-direction:\s*column/s, '.perp-okx-dual-actions must stack vertically');

  const obPartSrc = fs.readFileSync(path.join(root, 'src/parts/ui-controller/162-perps-orderbook.part.js'), 'utf8');
  assert.ok(obPartSrc.includes('clearPerpPctDots()'), '162-perps-orderbook must clear .active on pct dots on manual input/reset');
});

test('Wave-5: single funding rate without #perp-funding-rate, cumFunding in positions & desktop mouse drag pan', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.resolve(__dirname, '..');

  const perpsViewSrc = fs.readFileSync(path.join(root, 'src/app/views/PerpsView.jsx'), 'utf8');
  assert.equal(perpsViewSrc.includes('perp-funding-rate'), false, 'PerpsView.jsx must not render duplicate #perp-funding-rate');

  const obPartSrc = fs.readFileSync(path.join(root, 'src/parts/ui-controller/162-perps-orderbook.part.js'), 'utf8');
  assert.equal(obPartSrc.includes('perp-funding-rate'), false, '162-perps-orderbook must not reference removed #perp-funding-rate');

  const obCompSrc = fs.readFileSync(path.join(root, 'src/app/components/PerpOrderbookAndPositions.jsx'), 'utf8');
  assert.ok(obCompSrc.includes('cumFunding'), 'PerpOrderbookAndPositions.jsx must display cumFunding on position card');

  const chartSrc = fs.readFileSync(path.join(root, 'src/parts/ui-controller/161-perps-chart.part.js'), 'utf8');
  assert.ok(
    chartSrc.includes("addEventListener('mousedown'") &&
    chartSrc.includes("addEventListener('mousemove'") &&
    chartSrc.includes("addEventListener('mouseup'"),
    '161-perps-chart.part.js must support desktop mouse drag pan'
  );
});
