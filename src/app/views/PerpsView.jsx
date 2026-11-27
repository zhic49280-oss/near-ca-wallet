import { h } from 'preact';
import { useLang, useI18n, useWalletState } from '../store/useWalletStore.js';
import { PanelSlot } from '../components/PanelSlot.jsx';
import { PerpOverviewPanel } from '../components/PerpOverviewPanel.jsx';
import { PerpOrderbookSidePanel, PerpBottomListPanel, PerpOverviewPositionsPanel } from '../components/PerpOrderbookAndPositions.jsx';
import { PerpChartHudPanel } from '../components/PerpDetailPanels.jsx';

export function PerpView() {
  useLang();
  const st = useWalletState(['perp', 'lang']);
  const { tr, lang } = useI18n();
  const isCoinUnit = Boolean(st && st.perp && st.perp.inputUnit === 'coin');
  const rawPerpCoin = String((st && st.perp && st.perp.selectedCoin) || 'BTC').trim();
  const perpBaseCoin = (rawPerpCoin.includes(':') ? rawPerpCoin.split(':').slice(1).join(':') : rawPerpCoin) || 'BTC';
  const marginInputPlaceholder = isCoinUnit
    ? (lang === 'en' ? `Size (${perpBaseCoin})` : `数量 (${perpBaseCoin})`)
    : tr('perp.marginInputLabel', '保证金 (USDC)');
  return (
    <section id="view-perp" className="view-section hidden">
      {/* 1. Contract Wallet Summary (Always visible in Overview) */}
      <div id="perp-overview-panel" className="flex flex-col gap-3">
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="perp-summary-grid">
            <div className="perp-stat-box">
              <span className="kpi-label" data-i18n="perp.equityLabel">{tr('perp.equityLabel', '合约净值')}</span>
              <span id="perp-equity-val" className="kpi-value">--</span>
            </div>
            <div className="perp-stat-box">
              <span className="kpi-label" data-i18n="perp.availMarginLabel">{tr('perp.availMarginLabel', '可用保证金')}</span>
              <span id="perp-avail-val" className="kpi-value text-emerald">--</span>
            </div>
            <div className="perp-stat-box">
              <span className="kpi-label" data-i18n="perp.upnlLabel">{tr('perp.upnlLabel', '未实现盈亏')}</span>
              <span id="perp-upnl-val" className="kpi-value">--</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="mini-action-btn primary flex-1"
              onClick={() => window.openPerpFundingSheet && window.openPerpFundingSheet('deposit')}
              data-i18n="perp.depositBtn"
            >
              {tr('perp.depositBtn', '充值')}
            </button>
            <button
              type="button"
              className="mini-action-btn flex-1"
              onClick={() => window.openPerpFundingSheet && window.openPerpFundingSheet('withdraw')}
              data-i18n="perp.withdrawBtn"
            >
              {tr('perp.withdrawBtn', '提现')}
            </button>
            <button
              type="button"
              id="btn-perp-overview-refresh"
              className="btn-ghost-sm"
              onClick={() => window.refreshPerpDataAsync && window.refreshPerpDataAsync(true)}
              data-i18n="common.refresh"
            >
              {tr('common.refresh', '刷新')}
            </button>
          </div>

          <div id="perp-spot-banner" className="perp-spot-banner hidden">
            <span style={{ fontSize: '11.5px', color: 'var(--text-primary)' }}>
              <span data-i18n="perp.spotPendingPrefix">{tr('perp.spotPendingPrefix', '跨链资金已到账')}</span>{' '}
              <strong id="perp-spot-pending-amt" className="mono text-emerald">--</strong>
            </span>
            <button
              type="button"
              className="mini-action-btn primary"
              onClick={() => window.quickTransferSpotToPerpUI && window.quickTransferSpotToPerpUI()}
              data-i18n="perp.transferToPerpBtn"
            >
              {tr('perp.transferToPerpBtn', '一键转入合约 (免费)')}
            </button>
          </div>

          <div
            id="perp-overview-positions-wrap"
            className="hidden flex flex-col gap-2"
            style={{ paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <PanelSlot slotId="perp-overview-positions-wrap" component={PerpOverviewPositionsPanel} />
          </div>
        </div>

        {/* Market Overview List: Watchlist / Crypto / Stocks (HIP-3) / All */}
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="search-input-wrap">
            <input
              id="perp-overview-search"
              type="text"
              className="input-field"
              data-i18n-placeholder="perp.overviewSearchPlaceholder"
              placeholder={tr('perp.overviewSearchPlaceholder', '搜索合约 (如 BTC, PEPE, CRCL, NVDA...)')}
              onInput={(e) => window.handlePerpOverviewSearch && window.handlePerpOverviewSearch(e.currentTarget.value)}
            />
            <button
              type="button"
              id="perp-overview-search-clear"
              className="search-clear-btn hidden"
              onClick={() => window.clearPerpOverviewSearch && window.clearPerpOverviewSearch()}
              aria-label="Clear"
            >
              ✕
            </button>
          </div>

          <div id="perp-overview-cats" className="pill-scroll">
            <button type="button" className="filter-pill" data-action="set-perp-overview-cat" data-cat="favorites" data-i18n="perp.catFavorites">{tr('perp.catFavorites', '⭐ 自选')}</button>
            <button type="button" className="filter-pill active" data-action="set-perp-overview-cat" data-cat="crypto" data-i18n="perp.catCrypto">{tr('perp.catCrypto', '🪙 加密货币')}</button>
            <button type="button" className="filter-pill" data-action="set-perp-overview-cat" data-cat="stocks" data-i18n="perp.catStocks">{tr('perp.catStocks', '📈 股票')}</button>
            <button type="button" className="filter-pill" data-action="set-perp-overview-cat" data-cat="all" data-i18n="perp.catAll">{tr('perp.catAll', '全部')}</button>
          </div>

          <div className="perp-mkt-col-hdr">
            <button type="button" className="perp-sort-hdr-btn" data-action="sort-perp-overview" data-sort="vol">
              <span data-i18n="perp.colContractVol">{tr('perp.colContractVol', '合约 / 成交额')}</span> <span id="perp-sort-ind-vol">↓</span>
            </button>
            <div className="flex items-center gap-2">
              <button type="button" className="perp-sort-hdr-btn" data-action="sort-perp-overview" data-sort="px">
                <span data-i18n="perp.colLastPx">{tr('perp.colLastPx', '最新价')}</span> <span id="perp-sort-ind-px">⇅</span>
              </button>
              <button
                type="button"
                className="perp-sort-hdr-btn"
                data-action="sort-perp-overview"
                data-sort="chg"
                style={{ minWidth: '64px', justifyContent: 'flex-end' }}
              >
                <span data-i18n="perp.colChg24h">{tr('perp.colChg24h', '24h 涨跌')}</span> <span id="perp-sort-ind-chg">⇅</span>
              </button>
            </div>
          </div>

          <div id="perp-overview-list" className="flex flex-col gap-2">
            <PanelSlot slotId="perp-overview-list" component={PerpOverviewPanel} />
          </div>
        </div>
      </div>

      {/* 2. OKX-Style Trade View (Hidden until market clicked) */}
      <div id="perp-trade-panel" className="flex flex-col gap-2 hidden">
        {/* Card 1: Market Header + Inline Stats + Always-On K-Line */}
        <div className="ios-glass-card perp-okx-chart-card flex flex-col gap-2">
          <div className="perp-trade-top-bar">
            <div className="perp-trade-top-left">
              <button
                type="button"
                id="btn-perp-back"
                className="btn-ghost-sm perp-back-btn"
                onClick={() => window.backToPerpOverview && window.backToPerpOverview()}
                data-i18n="perp.backToMarkets"
              >
                {tr('perp.backToMarkets', '← 行情')}
              </button>
              <button
                type="button"
                id="perp-coin-btn"
                className="token-select-btn"
                onClick={() => window.openPerpMarketsSheet && window.openPerpMarketsSheet()}
              >
                <span id="perp-coin-icon" className="perp-coin-icon-slot"></span>
                <span id="perp-coin-name" className="perp-coin-name-text">BTC-USDC</span>
                <span className="perp-okx-perp-badge" data-i18n="perp.perpBadge">{tr('perp.perpBadge', '永续')}</span>
                <span style={{ flexShrink: 0, fontSize: '10px', opacity: 0.7 }}>▾</span>
              </button>
              <span id="perp-change-24h" className="perp-okx-chg-badge mono">--</span>
            </div>
            <div className="perp-trade-top-right">
              <button
                type="button"
                id="btn-perp-fav-current"
                className="btn-ghost-sm perp-top-icon-btn"
                onClick={() => window.toggleCurrentPerpFavorite && window.toggleCurrentPerpFavorite()}
              >
                ☆
              </button>
              <button
                type="button"
                id="btn-perp-trade-refresh"
                className="btn-ghost-sm perp-top-act-btn"
                onClick={() => window.refreshPerpDataAsync && window.refreshPerpDataAsync(true)}
                data-i18n="common.refresh"
              >
                {tr('common.refresh', '刷新')}
              </button>
            </div>
          </div>

          <div id="perp-market-stats" className="perp-market-stats perp-okx-stats-strip">
            <div className="perp-mstat">
              <span className="meta-key" data-i18n="perp.colLastPx">{tr('perp.colLastPx', '最新价')}</span>
              <span id="perp-mark-px" className="mono" style={{ fontSize: '11px', fontWeight: 700, color: '#ffffff' }}>--</span>
            </div>
            <div className="perp-mstat">
              <span className="meta-key" data-i18n="perp.vol24hLabel">{tr('perp.vol24hLabel', '24h 成交额')}</span>
              <span id="perp-vol-24h" className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>--</span>
            </div>
            <div className="perp-mstat" style={{ textAlign: 'right' }}>
              <span className="meta-key" data-i18n="perp.oiLabel">{tr('perp.oiLabel', '全网持仓 (OI)')}</span>
              <span id="perp-oi-val" className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>--</span>
            </div>
          </div>

          <div id="perp-chart-wrap" className="perp-chart-wrap">
            <div className="flex items-center justify-between gap-1" style={{ marginBottom: '4px' }}>
              <div id="perp-interval-pills" className="flex gap-1">
                <button type="button" className="filter-pill" data-iv="5m" data-i18n="perp.iv5m" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('5m')}>{tr('perp.iv5m', '5分')}</button>
                <button type="button" className="filter-pill active" data-iv="15m" data-i18n="perp.iv15m" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('15m')}>{tr('perp.iv15m', '15分')}</button>
                <button type="button" className="filter-pill" data-iv="1h" data-i18n="perp.iv1h" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('1h')}>{tr('perp.iv1h', '1时')}</button>
                <button type="button" className="filter-pill" data-iv="4h" data-i18n="perp.iv4h" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('4h')}>{tr('perp.iv4h', '4时')}</button>
                <button type="button" className="filter-pill" data-iv="1d" data-i18n="perp.iv1d" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('1d')}>{tr('perp.iv1d', '1日')}</button>
              </div>
              <span id="perp-chart-hl" className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>--</span>
            </div>
            <div className="perp-chart-canvas-wrap">
              <div id="perp-chart-svg"></div>
              <div id="perp-candle-detail" className="perp-candle-inspect-bar hidden">
                <PanelSlot slotId="perp-candle-detail" component={PerpChartHudPanel} />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Merged Single Full-Width Trade Card (57% Left Order Ticket + 43% Right Orderbook) */}
        <div className="ios-glass-card perp-okx-trade-card">
          <div className="perp-okx-split-grid">
            {/* Left: Order Ticket */}
            <div className="perp-okx-ticket-col flex flex-col gap-2">
              <div className="flex items-center justify-between gap-1">
                <div className="mode-pill-switch">
                  <button
                    type="button"
                    id="perp-mode-isolated"
                    className="mode-pill-btn active"
                    onClick={() => window.setPerpMarginMode && window.setPerpMarginMode('isolated')}
                    data-i18n="perp.isolatedBtn"
                  >
                    {tr('perp.isolatedBtn', '逐仓')}
                  </button>
                  <button
                    type="button"
                    id="perp-mode-cross"
                    className="mode-pill-btn"
                    onClick={() => window.setPerpMarginMode && window.setPerpMarginMode('cross')}
                    data-i18n="perp.crossBtn"
                  >
                    {tr('perp.crossBtn', '全仓')}
                  </button>
                </div>
                <button
                  type="button"
                  id="btn-perp-lev-toggle"
                  className="perp-okx-lev-pill"
                  onClick={() => window.togglePerpLeverageDrawer && window.togglePerpLeverageDrawer()}
                >
                  <span id="perp-lev-val" className="mono">5x</span>
                  <span style={{ fontSize: '9px', opacity: 0.75 }}>▾</span>
                </button>
              </div>

              <div id="perp-lev-drawer" className="perp-okx-lev-drawer hidden">
                <input
                  id="perp-leverage-slider"
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  defaultValue="5"
                  className="perp-slider"
                  onInput={(e) => window.setPerpLeverage && window.setPerpLeverage(e.currentTarget.value)}
                />
              </div>

              <div className="mode-pill-switch perp-okx-ordtype-switch" style={{ width: '100%', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  id="perp-type-market"
                  className="mode-pill-btn active flex-1"
                  onClick={() => window.setPerpOrderType && window.setPerpOrderType('market')}
                  data-i18n="perp.marketBtn"
                >
                  {tr('perp.marketBtn', '市价')}
                </button>
                <button
                  type="button"
                  id="perp-type-limit"
                  className="mode-pill-btn flex-1"
                  onClick={() => window.setPerpOrderType && window.setPerpOrderType('limit')}
                  data-i18n="perp.limitBtn"
                >
                  {tr('perp.limitBtn', '限价')}
                </button>
                <button
                  type="button"
                  id="perp-type-post-only"
                  className="mode-pill-btn flex-1"
                  onClick={() => window.setPerpOrderType && window.setPerpOrderType('post_only')}
                  data-i18n="perp.postOnlyBtn"
                >
                  {tr('perp.postOnlyBtn', '只做Maker')}
                </button>
              </div>

              <div id="perp-limit-price-row" className="perp-okx-input-row hidden">
                <input
                  id="perp-limit-price-input"
                  type="number"
                  step="any"
                  min="0"
                  className="perp-okx-input mono"
                  data-i18n-placeholder="perp.limitPriceLabel"
                  placeholder={tr('perp.limitPriceLabel', '委托价格')}
                  onInput={() => window.handlePerpLimitPriceInput && window.handlePerpLimitPriceInput()}
                />
                <button
                  type="button"
                  className="perp-okx-bbo-btn"
                  onClick={() => window.fillPerpBboPrice && window.fillPerpBboPrice()}
                  data-i18n="perp.bboBtn"
                >
                  {tr('perp.bboBtn', '最优价')}
                </button>
              </div>

              <div className="perp-okx-input-row">
                <input
                  id="perp-margin-input"
                  type="number"
                  step="any"
                  min="0"
                  className="perp-okx-input mono"
                  data-i18n-placeholder={isCoinUnit ? undefined : 'perp.marginInputLabel'}
                  placeholder={marginInputPlaceholder}
                  onInput={() => window.handlePerpMarginInput && window.handlePerpMarginInput()}
                />
                <button
                  type="button"
                  id="btn-perp-input-unit"
                  className="perp-okx-unit-toggle mono"
                  onClick={() => window.togglePerpInputUnit && window.togglePerpInputUnit()}
                >
                  {isCoinUnit ? `${perpBaseCoin} ▾` : 'USDC ▾'}
                </button>
              </div>

              <div className="perp-okx-pct-dots" role="group" aria-label="Margin percentage">
                <div className="perp-okx-pct-track" />
                {[
                  { pct: 0, label: '0%' },
                  { pct: 0.25, label: '25%' },
                  { pct: 0.5, label: '50%' },
                  { pct: 0.75, label: '75%' },
                  { pct: 0.99, label: '100%' }
                ].map((n) => (
                  <button
                    key={n.label}
                    type="button"
                    className="perp-okx-pct-node"
                    data-pct={String(n.pct)}
                    onClick={() => window.setPerpMarginPercent && window.setPerpMarginPercent(n.pct)}
                  >
                    <span className="perp-okx-pct-dot" />
                    <span className="perp-okx-pct-lbl mono">{n.label}</span>
                  </button>
                ))}
              </div>

              <div className="perp-okx-avail-row">
                <span className="meta-key" data-i18n="swap.balanceLabel">{tr('swap.balanceLabel', '可用')}</span>
                <div className="flex items-center gap-1">
                  <span id="perp-ticket-avail" className="mono">--</span>
                  <button
                    type="button"
                    className="perp-okx-deposit-plus"
                    onClick={() => window.openPerpFundingSheet && window.openPerpFundingSheet('deposit')}
                    aria-label="Deposit"
                  >
                    ⊕
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-1" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                <label className="flex items-center gap-1" style={{ cursor: 'pointer' }}>
                  <input
                    id="perp-reduce-only-chk"
                    type="checkbox"
                    onChange={(e) => window.togglePerpReduceOnly && window.togglePerpReduceOnly(e.currentTarget.checked)}
                  />
                  <span data-i18n="perp.reduceOnlyLabel">{tr('perp.reduceOnlyLabel', '只减仓')}</span>
                </label>
                <button
                  type="button"
                  id="btn-perp-tpsl-toggle"
                  className="perp-tpsl-toggle-btn"
                  style={{ width: 'auto', padding: '2px 7px', fontSize: '10.5px' }}
                  data-action="toggle-perp-tpsl"
                  aria-expanded="false"
                >
                  <span data-i18n="perp.tpslLabel">{tr('perp.tpslLabel', '止盈/止损')}</span> ▾
                </button>
              </div>
              <div id="perp-tpsl-drawer" className="flex gap-1 hidden">
                <input
                  id="perp-tp-input"
                  type="number"
                  step="any"
                  min="0"
                  className="input-field mono flex-1"
                  style={{ fontSize: '11.5px', padding: '5px 7px' }}
                  data-i18n-placeholder="perp.tpPlaceholder"
                  placeholder={tr('perp.tpPlaceholder', '止盈触发价')}
                  onInput={() => window.evaluatePerpOrderUI && window.evaluatePerpOrderUI()}
                />
                <input
                  id="perp-sl-input"
                  type="number"
                  step="any"
                  min="0"
                  className="input-field mono flex-1"
                  style={{ fontSize: '11.5px', padding: '5px 7px' }}
                  data-i18n-placeholder="perp.slPlaceholder"
                  placeholder={tr('perp.slPlaceholder', '止损触发价')}
                  onInput={() => window.evaluatePerpOrderUI && window.evaluatePerpOrderUI()}
                />
              </div>

              <div className="perp-okx-meta-grid">
                <div className="perp-okx-meta-cell">
                  <span className="meta-key" data-i18n="perp.notionalLabel">{tr('perp.notionalLabel', '名义价值')}</span>
                  <span id="perp-meta-notional" className="meta-val">--</span>
                </div>
                <div className="perp-okx-meta-cell">
                  <span
                    id="perp-meta-size-label"
                    className="meta-key"
                    data-i18n={isCoinUnit ? 'perp.requiredMarginLabel' : 'perp.sizeLabel'}
                    data-i18n-dynamic="1"
                  >
                    {isCoinUnit ? tr('perp.requiredMarginLabel', '所需保证金') : tr('perp.sizeLabel', '委托数量')}
                  </span>
                  <span id="perp-meta-size" className="meta-val">--</span>
                </div>
                <div className="perp-okx-meta-cell">
                  <span className="meta-key" data-i18n="perp.liqEstLabel">{tr('perp.liqEstLabel', '预估强平价')}</span>
                  <span id="perp-meta-liq" className="meta-val">--</span>
                </div>
                <div className="perp-okx-meta-cell">
                  <span className="meta-key" data-i18n="perp.estFeeLabel">{tr('perp.estFeeLabel', '预估手续费')}</span>
                  <span id="perp-meta-fee" className="meta-val">--</span>
                </div>
              </div>

              <div id="perp-error-banner" className="swap-error-banner hidden"></div>
              <div className="perp-okx-dual-actions">
                <button
                  type="button"
                  id="btn-perp-submit-long"
                  className="perp-okx-btn-long"
                  onClick={() => (window.submitPerpOrderWithSide
                    ? window.submitPerpOrderWithSide('long')
                    : (window.setPerpSide && window.setPerpSide('long'), window.executePerpOrderUI && window.executePerpOrderUI()))}
                  data-i18n="perp.buyLongBtn"
                >
                  {tr('perp.buyLongBtn', '买入 (做多)')}
                </button>
                <button
                  type="button"
                  id="btn-perp-submit-short"
                  className="perp-okx-btn-short"
                  onClick={() => (window.submitPerpOrderWithSide
                    ? window.submitPerpOrderWithSide('short')
                    : (window.setPerpSide && window.setPerpSide('short'), window.executePerpOrderUI && window.executePerpOrderUI()))}
                  data-i18n="perp.sellShortBtn"
                >
                  {tr('perp.sellShortBtn', '卖出 (做空)')}
                </button>
                <button
                  type="button"
                  id="btn-perp-submit"
                  className="hidden"
                  onClick={() => window.executePerpOrderUI && window.executePerpOrderUI()}
                />
              </div>
            </div>

            {/* Right: Compact Live Orderbook */}
            <div className="perp-okx-ob-col flex flex-col gap-1">
              <div className="perp-ob-funding-row">
                <span className="meta-key" data-i18n="perp.fundingCountdownLabel">{tr('perp.fundingCountdownLabel', '资金费率(1h)/倒计时')}</span>
                <span id="perp-ob-funding-countdown" className="mono">--</span>
              </div>

              <div id="perp-ob-header" className="perp-ob-header" style={{ gridTemplateColumns: '1fr' }}>
                <div className="perp-ob-hcol">
                  <span data-i18n="perp.obPriceShort">{tr('perp.obPriceShort', '价格 (USDC)')}</span>
                  <span id="perp-ob-bid-sz-hdr" data-i18n="perp.obSizeHdr">{tr('perp.obSizeHdr', '数量')}</span>
                </div>
              </div>

              <div className="perp-ob-grid perp-ob-stacked">
                <div className="perp-ob-col" id="perp-ob-asks">
                  <PanelSlot slotId="perp-ob-asks" component={PerpOrderbookSidePanel} />
                </div>
                <div className="perp-ob-mid-wrap">
                  <div id="perp-ob-mid-badge" className="perp-ob-mid-badge mono">--</div>
                  <div id="perp-ob-mid-sub" className="perp-ob-mid-sub mono">--</div>
                </div>
                <div className="perp-ob-col" id="perp-ob-bids">
                  <PanelSlot slotId="perp-ob-bids" component={PerpOrderbookSidePanel} />
                </div>
              </div>

              <div id="perp-ob-power-wrap" className="perp-ob-power-wrap">
                <div className="flex items-center gap-1" style={{ fontSize: '9.5px' }}>
                  <span id="perp-ob-bid-summary" className="mono text-emerald">B 50%</span>
                  <div className="perp-ob-power-track flex-1">
                    <div id="perp-ob-bid-bar" className="perp-ob-power-bid" style={{ transform: 'scaleX(0.5)' }}></div>
                    <div id="perp-ob-ask-bar" className="perp-ob-power-ask" style={{ transform: 'scaleX(0.5)' }}></div>
                  </div>
                  <span id="perp-ob-ask-summary" className="mono text-rose">50% S</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Bottom Positions / Open Orders / Fills & Assets */}
        <div className="ios-glass-card perp-okx-bottom-card flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2 perp-okx-tabs-bar">
            <div className="perp-okx-tabs">
              <button
                type="button"
                id="perp-tab-positions"
                className="perp-okx-tab active"
                onClick={() => window.setPerpBottomTab && window.setPerpBottomTab('positions')}
                data-i18n="perp.tabPositions"
              >
                {tr('perp.tabPositions', '当前持仓')}
              </button>
              <button
                type="button"
                id="perp-tab-orders"
                className="perp-okx-tab"
                onClick={() => window.setPerpBottomTab && window.setPerpBottomTab('orders')}
                data-i18n="perp.tabOrders"
              >
                {tr('perp.tabOrders', '当前委托')}
              </button>
              <button
                type="button"
                id="perp-tab-fills"
                className="perp-okx-tab"
                onClick={() => window.setPerpBottomTab && window.setPerpBottomTab('fills')}
                data-i18n="perp.tabFills"
              >
                {tr('perp.tabFills', '历史成交')}
              </button>
            </div>
            <button
              type="button"
              id="btn-perp-batch-action"
              className="btn-ghost-sm hidden"
              onClick={() => window.executePerpBatchAction && window.executePerpBatchAction()}
            >
              --
            </button>
          </div>
          <div id="perp-bottom-list" className="flex flex-col gap-2">
            <PanelSlot slotId="perp-bottom-list" component={PerpBottomListPanel} />
          </div>
        </div>
      </div>
    </section>
  );
}
