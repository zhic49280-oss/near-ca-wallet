import { h } from 'preact';
import { useLang, useI18n } from '../store/useWalletStore.js';
import { PanelSlot } from '../components/PanelSlot.jsx';
import { PerpOverviewPanel } from '../components/PerpOverviewPanel.jsx';
import { PerpOrderbookSidePanel, PerpBottomListPanel, PerpOverviewPositionsPanel } from '../components/PerpOrderbookAndPositions.jsx';
import { PerpChartHudPanel } from '../components/PerpDetailPanels.jsx';

export function PerpView() {
  useLang();
  const { tr } = useI18n();
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
        <div className="ios-glass-card flex flex-col gap-2" style={{ padding: '12px' }}>
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
                <span style={{ flexShrink: 0 }}>▾</span>
              </button>
            </div>
            <div className="flex flex-col perp-top-px-wrap">
              <span id="perp-mark-px" className="mono" style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>--</span>
              <span id="perp-change-24h" className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>--</span>
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
              <button
                type="button"
                id="btn-perp-chart-toggle"
                className="btn-ghost-sm perp-top-act-btn"
                onClick={() => window.togglePerpChart && window.togglePerpChart()}
                data-i18n="perp.chartBtn"
              >
                {tr('perp.chartBtn', 'K线')}
              </button>
            </div>
          </div>

          <div id="perp-market-stats" className="perp-market-stats">
            <div className="perp-mstat">
              <span className="meta-key" data-i18n="perp.vol24hLabel">{tr('perp.vol24hLabel', '24h 成交额')}</span>
              <span id="perp-vol-24h" className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>--</span>
            </div>
            <div className="perp-mstat">
              <span className="meta-key" data-i18n="perp.oiLabel">{tr('perp.oiLabel', '全网持仓 (OI)')}</span>
              <span id="perp-oi-val" className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>--</span>
            </div>
            <div className="perp-mstat" style={{ textAlign: 'right' }}>
              <span className="meta-key" data-i18n="perp.fundingRateLabel">{tr('perp.fundingRateLabel', '资金费率(1h)')}</span>
              <span id="perp-funding-rate" className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>--</span>
            </div>
          </div>

          <div id="perp-chart-wrap" className="perp-chart-wrap">
            <div className="flex items-center justify-between gap-2" style={{ marginBottom: '6px' }}>
              <div id="perp-interval-pills" className="flex gap-1">
                <button type="button" className="filter-pill" data-iv="5m" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('5m')}>5m</button>
                <button type="button" className="filter-pill active" data-iv="15m" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('15m')}>15m</button>
                <button type="button" className="filter-pill" data-iv="1h" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('1h')}>1h</button>
                <button type="button" className="filter-pill" data-iv="4h" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('4h')}>4h</button>
                <button type="button" className="filter-pill" data-iv="1d" onClick={() => window.setPerpChartInterval && window.setPerpChartInterval('1d')}>1d</button>
              </div>
              <span id="perp-chart-hl" className="mono" style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>--</span>
            </div>
            <div id="perp-candle-detail" className="perp-candle-inspect-bar mono">
              <PanelSlot slotId="perp-candle-detail" component={PerpChartHudPanel} />
            </div>
            <div id="perp-chart-svg"></div>
          </div>
        </div>

        {/* OKX Split: Left Order Ticket + Right Compact Orderbook */}
        <div className="perp-okx-split-grid">
          {/* Left: Order Ticket */}
          <div className="ios-glass-card flex flex-col gap-2" style={{ padding: '11px' }}>
            <div className="perp-side-switch">
              <button
                type="button"
                id="perp-side-long"
                className="perp-side-btn long active"
                onClick={() => window.setPerpSide && window.setPerpSide('long')}
                data-i18n="perp.longBtn"
              >
                {tr('perp.longBtn', '做多')}
              </button>
              <button
                type="button"
                id="perp-side-short"
                className="perp-side-btn short"
                onClick={() => window.setPerpSide && window.setPerpSide('short')}
                data-i18n="perp.shortBtn"
              >
                {tr('perp.shortBtn', '做空')}
              </button>
            </div>

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
              <span id="perp-lev-val" className="mono text-emerald" style={{ fontSize: '12px', fontWeight: 800 }}>5x</span>
            </div>

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

            <div className="mode-pill-switch" style={{ width: '100%', justifyContent: 'space-between' }}>
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

            <div id="perp-limit-price-row" className="swap-box hidden" style={{ padding: '8px' }}>
              <div className="swap-box-top">
                <span data-i18n="perp.limitPriceLabel" style={{ fontSize: '11px' }}>{tr('perp.limitPriceLabel', '委托价格')}</span>
                <button
                  type="button"
                  className="mini-action-btn primary"
                  onClick={() => window.fillPerpBboPrice && window.fillPerpBboPrice()}
                  data-i18n="perp.bboBtn"
                  style={{ padding: '2px 6px', fontSize: '10.5px' }}
                >
                  {tr('perp.bboBtn', '最优价')}
                </button>
              </div>
              <input
                id="perp-limit-price-input"
                type="number"
                step="any"
                min="0"
                className="amount-input-lg"
                style={{ fontSize: '15px' }}
                placeholder="0.00"
                onInput={() => window.handlePerpLimitPriceInput && window.handlePerpLimitPriceInput()}
              />
            </div>

            <div className="swap-box" style={{ padding: '8px' }}>
              <div className="swap-box-top">
                <span data-i18n="perp.marginInputLabel" style={{ fontSize: '11px' }}>{tr('perp.marginInputLabel', '保证金 (USDC)')}</span>
                <span style={{ fontSize: '10.5px' }}>
                  <span data-i18n="swap.balanceLabel">{tr('swap.balanceLabel', '可用')}</span>: <span id="perp-ticket-avail" className="mono">--</span>
                </span>
              </div>
              <div className="swap-box-main">
                <input
                  id="perp-margin-input"
                  type="number"
                  step="any"
                  min="0"
                  className="amount-input-lg"
                  style={{ fontSize: '16px' }}
                  placeholder="0.00"
                  onInput={() => window.handlePerpMarginInput && window.handlePerpMarginInput()}
                />
              </div>
              <div className="perp-pct-row" style={{ gap: '4px' }}>
                <button type="button" className="mini-action-btn" onClick={() => window.setPerpMarginPercent && window.setPerpMarginPercent(0.25)}>25%</button>
                <button type="button" className="mini-action-btn" onClick={() => window.setPerpMarginPercent && window.setPerpMarginPercent(0.50)}>50%</button>
                <button type="button" className="mini-action-btn" onClick={() => window.setPerpMarginPercent && window.setPerpMarginPercent(0.75)}>75%</button>
                <button type="button" className="mini-action-btn primary" onClick={() => window.setPerpMarginPercent && window.setPerpMarginPercent(0.99)}>MAX</button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
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
                style={{ width: 'auto', padding: '3px 8px', fontSize: '11px' }}
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
                style={{ fontSize: '11.5px', padding: '6px 8px' }}
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
                style={{ fontSize: '11.5px', padding: '6px 8px' }}
                data-i18n-placeholder="perp.slPlaceholder"
                placeholder={tr('perp.slPlaceholder', '止损触发价')}
                onInput={() => window.evaluatePerpOrderUI && window.evaluatePerpOrderUI()}
              />
            </div>

            <div className="meta-list perp-meta-grid">
              <div className="meta-row perp-meta-cell">
                <span className="meta-key" data-i18n="perp.notionalLabel">{tr('perp.notionalLabel', '名义价值')}</span>
                <span id="perp-meta-notional" className="meta-val">--</span>
              </div>
              <div className="meta-row perp-meta-cell">
                <span className="meta-key" data-i18n="perp.sizeLabel">{tr('perp.sizeLabel', '委托数量')}</span>
                <span id="perp-meta-size" className="meta-val">--</span>
              </div>
              <div className="meta-row perp-meta-cell">
                <span className="meta-key" data-i18n="perp.liqEstLabel">{tr('perp.liqEstLabel', '预估强平价')}</span>
                <span id="perp-meta-liq" className="meta-val">--</span>
              </div>
              <div className="meta-row perp-meta-cell">
                <span className="meta-key" data-i18n="perp.estFeeLabel">{tr('perp.estFeeLabel', '预估手续费')}</span>
                <span id="perp-meta-fee" className="meta-val">--</span>
              </div>
            </div>

            <div id="perp-error-banner" className="swap-error-banner hidden"></div>
            <button
              type="button"
              id="btn-perp-submit"
              className="btn-primary"
              onClick={() => window.executePerpOrderUI && window.executePerpOrderUI()}
              data-i18n="perp.submitLongBtn"
            >
              {tr('perp.submitLongBtn', '开多')}
            </button>
          </div>

          {/* Right: Compact Live Orderbook */}
          <div className="ios-glass-card flex flex-col gap-2" style={{ padding: '10px' }}>
            <div id="perp-ls-ratio-wrap" className="perp-ob-power-wrap" style={{ minHeight: '22px', opacity: 0.55 }}>
              <div className="flex items-center justify-between" style={{ fontSize: '9.5px' }}>
                <span id="perp-ls-long-label" className="mono text-emerald">--</span>
                <span id="perp-ls-short-label" className="mono text-rose">--</span>
              </div>
              <div className="perp-ob-power-track">
                <div id="perp-ls-long-bar" className="perp-ob-power-bid" style={{ transform: 'scaleX(0.5)' }}></div>
                <div id="perp-ls-short-bar" className="perp-ob-power-ask" style={{ transform: 'scaleX(0.5)' }}></div>
              </div>
            </div>

            <div id="perp-ob-power-wrap" className="perp-ob-power-wrap">
              <div className="flex items-center justify-between" style={{ fontSize: '9.5px' }}>
                <span id="perp-ob-bid-summary" className="mono text-emerald">--</span>
                <span id="perp-ob-ask-summary" className="mono text-rose">--</span>
              </div>
              <div className="perp-ob-power-track">
                <div id="perp-ob-bid-bar" className="perp-ob-power-bid" style={{ transform: 'scaleX(0.5)' }}></div>
                <div id="perp-ob-ask-bar" className="perp-ob-power-ask" style={{ transform: 'scaleX(0.5)' }}></div>
              </div>
            </div>

            <div id="perp-ob-header" className="perp-ob-header" style={{ gridTemplateColumns: '1fr' }}>
              <div className="perp-ob-hcol">
                <span id="perp-ob-bid-sz-hdr" data-i18n="perp.obSizeHdr">{tr('perp.obSizeHdr', '数量')}</span>
                <span id="perp-ob-ask-sz-hdr" data-i18n="perp.obSizeHdr" style={{ display: 'none' }}>{tr('perp.obSizeHdr', '数量')}</span>
                <span data-i18n="perp.obPriceShort">{tr('perp.obPriceShort', '价格')}</span>
              </div>
            </div>

            <div className="perp-ob-grid perp-ob-stacked">
              <div className="perp-ob-col" id="perp-ob-asks">
                <PanelSlot slotId="perp-ob-asks" component={PerpOrderbookSidePanel} />
              </div>
              <div id="perp-ob-mid-badge" className="perp-ob-mid-badge mono">--</div>
              <div className="perp-ob-col" id="perp-ob-bids">
                <PanelSlot slotId="perp-ob-bids" component={PerpOrderbookSidePanel} />
              </div>
            </div>
          </div>
        </div>

        {/* 3. Bottom Positions / Open Orders / Fills & Assets */}
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                id="perp-tab-positions"
                className="filter-pill active"
                onClick={() => window.setPerpBottomTab && window.setPerpBottomTab('positions')}
                data-i18n="perp.tabPositions"
              >
                {tr('perp.tabPositions', '当前持仓')}
              </button>
              <button
                type="button"
                id="perp-tab-orders"
                className="filter-pill"
                onClick={() => window.setPerpBottomTab && window.setPerpBottomTab('orders')}
                data-i18n="perp.tabOrders"
              >
                {tr('perp.tabOrders', '当前委托')}
              </button>
              <button
                type="button"
                id="perp-tab-fills"
                className="filter-pill"
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
