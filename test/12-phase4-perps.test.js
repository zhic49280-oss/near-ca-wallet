'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  hlPerps
} = require('./helpers.js');

test('Phase 4.1: formatHlPrice never returns 0 for ultra-low meme prices & handles >= 100k', () => {
  assert.equal(hlPerps.formatHlPrice(120000.6, 5), '120001');
  assert.equal(hlPerps.formatHlPrice(0.000000123456, 0), '0.000001');
  assert.notEqual(hlPerps.formatHlPrice(0.000000123456, 0), '0');
  assert.equal(hlPerps.formatHlPrice(0.000123456, 0), '0.000123');
});

test('Phase 4.2: computeEstimatedLiqPrice uses dynamic MMR from maxLeverage', () => {
  const liq100 = hlPerps.computeEstimatedLiqPrice({ markPx: 1000, leverage: 10, isLong: true, maxLeverage: 100 });
  const liq10 = hlPerps.computeEstimatedLiqPrice({ markPx: 1000, leverage: 10, isLong: true, maxLeverage: 10 });
  assert.ok(liq10 > liq100, 'Lower maxLeverage (higher MMR) must produce higher long liquidation price');
});

test('Phase 4.3: Perps WS live feed, reverse leverage passthrough, TP/SL validation, and chart rAF fix', () => {
  const hlCode = fs.readFileSync(path.join(ROOT_DIR, 'src/hyperliquid-perps.js'), 'utf8');
  assert.ok(hlCode.includes('leverage: curLev'), 'reverseHlPositionMarket must pass actual position leverage instead of null');
  assert.ok(hlCode.includes('warn.oldCancelled = true'), 'updateHlPositionTpSl must flag when old triggers cancelled before new order failure');
  assert.ok(hlCode.includes('slippageBps = 250'), 'closeHlPositionMarket must use safer 250bps protective slippage');

  const tradeCode = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/163-perps-trade.part.js'), 'utf8');
  assert.ok(tradeCode.includes('function startPerpLiveFeed()'));
  assert.ok(tradeCode.includes('wss://api.hyperliquid.xyz/ws'));
  assert.ok(tradeCode.includes('_perpTradeActionBusy'));
  assert.ok(tradeCode.includes('isLimitOrder ? (Number(st.perp.limitPriceInput) || Number(market.markPx) || 0) : (Number(market.markPx) || 0)'));

  const chartCode = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/161-perps-chart.part.js'), 'utf8');
  assert.ok(chartCode.includes('if (rafId) return;'), 'scheduleChartRedraw must throttle instead of redrawing synchronously when rafId is set');

  const obCode = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/162-perps-orderbook.part.js'), 'utf8');
  assert.ok(obCode.includes('evaluatePerpOrderUI(false)'), 'renderPerpView must not reverse-sync DOM input into state');

  const fundingCode = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/164-perps-funding.part.js'), 'utf8');
  assert.ok(fundingCode.includes('_perpQuoteSeq'));
});
