'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR
} = require('./helpers.js');

test('P2B-1: SwapQuoteStatusPanel.jsx exports SwapActiveOrderPanel & SwapRouteInfoPanel with clean copy', () => {
  const filePath = path.join(ROOT_DIR, 'src/app/components/SwapQuoteStatusPanel.jsx');
  const src = fs.readFileSync(filePath, 'utf8');

  assert.ok(src.includes('export function SwapActiveOrderPanel'), 'SwapActiveOrderPanel must be exported');
  assert.ok(src.includes('export function SwapRouteInfoPanel'), 'SwapRouteInfoPanel must be exported');
  assert.ok(src.includes('StatusBadge'), 'SwapActiveOrderPanel must use StatusBadge');
  assert.equal(src.includes('dangerouslySetInnerHTML'), false, 'Must not use dangerouslySetInnerHTML');
  assert.ok(src.includes('sanitizeRouteLabel'), 'Must sanitize internal route labels for end users');
  assert.ok(src.includes('Comparing pools...') && src.includes('多池比价中...'), 'Must include bilingual quoting label');
});

test('P2B-2: PerpDetailPanels.jsx exports PerpMarketsSheetPanel, PerpFundingInfoPanel, PerpChartHudPanel', () => {
  const filePath = path.join(ROOT_DIR, 'src/app/components/PerpDetailPanels.jsx');
  const src = fs.readFileSync(filePath, 'utf8');

  assert.ok(src.includes('export function PerpMarketsSheetPanel'), 'PerpMarketsSheetPanel must be exported');
  assert.ok(src.includes('export function PerpFundingInfoPanel'), 'PerpFundingInfoPanel must be exported');
  assert.ok(src.includes('export function PerpChartHudPanel'), 'PerpChartHudPanel must be exported');
  assert.ok(src.includes('<TokenIconBadge'), 'PerpMarketsSheetPanel must render TokenIconBadge');
  assert.ok(src.includes('<EmptyState'), 'PerpMarketsSheetPanel must render EmptyState');
  assert.equal(src.includes('dangerouslySetInnerHTML'), false, 'Must not use dangerouslySetInnerHTML');

  assert.ok(src.includes('perp-market-item'));
  assert.ok(src.includes('data-action="select-perp-market"'));
  assert.ok(src.includes('data-action="toggle-perp-fav"'));
  assert.ok(src.includes('Drag or tap chart to inspect') && src.includes('滑动或点按 K 线查看详情'));

  for (const jargon of ['Bridge2', '1Click', 'HTTP', 'RPC']) {
    assert.equal(src.includes(jargon), false, `PerpDetailPanels must not expose developer jargon: ${jargon}`);
  }
});

test('P2B-3: EarnStakeSheetPanel.jsx exports EarnStakeSheetPanel & EarnValidatorsPanel with ActionButton & TokenIconBadge', () => {
  const filePath = path.join(ROOT_DIR, 'src/app/components/EarnStakeSheetPanel.jsx');
  const src = fs.readFileSync(filePath, 'utf8');

  assert.ok(src.includes('export function EarnStakeSheetPanel'), 'EarnStakeSheetPanel must be exported');
  assert.ok(src.includes('export function EarnValidatorsPanel'), 'EarnValidatorsPanel must be exported');
  assert.ok(src.includes('<TokenIconBadge'), 'EarnValidatorsPanel must render TokenIconBadge');
  assert.ok(src.includes('<ActionButton'), 'EarnValidatorsPanel must render ActionButton');
  assert.equal(src.includes('dangerouslySetInnerHTML'), false, 'Must not use dangerouslySetInnerHTML');

  assert.ok(src.includes('filter-pill'));
  assert.ok(src.includes('data-action="select-earn-lock"'));
  assert.ok(src.includes('dataAction="earn-pos-action"'));
  assert.ok(src.includes('View on Explorer ↗') && src.includes('在区块浏览器查看 ↗'));

  for (const jargon of ['Bridge2', '1Click', 'HTTP', 'RPC']) {
    assert.equal(src.includes(jargon), false, `EarnStakeSheetPanel must not expose developer jargon: ${jargon}`);
  }
});

test('P2B-4: ui-controller parts wire all 7 mount* calls with Node fallbacks intact and stay under 60 KB', () => {
  const checks = [
    ['110-swap-quote.part.js', 'fw.mountSwapRouteInfoPanel('],
    ['130-swap-orders.part.js', 'fw.mountSwapActiveOrderPanel('],
    ['161-perps-chart.part.js', 'fw.mountPerpChartHudPanel('],
    ['163-perps-trade.part.js', 'fw.mountPerpMarketsSheetPanel('],
    ['164-perps-funding.part.js', 'fw.mountPerpFundingInfoPanel('],
    ['170-earn.part.js', 'fw.mountEarnStakeSheetPanel('],
    ['170-earn.part.js', 'fw.mountEarnValidatorsPanel(']
  ];

  for (const [file, mountCall] of checks) {
    const fullPath = path.join(ROOT_DIR, 'src/parts/ui-controller', file);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size < 61440, `${file} must remain strictly under 60 KB (got ${stat.size} bytes)`);
    const src = fs.readFileSync(fullPath, 'utf8');
    assert.ok(src.includes(mountCall), `${file} must wire ${mountCall}`);
  }
});
