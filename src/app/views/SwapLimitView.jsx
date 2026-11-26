import { h } from 'preact';
import { useLang, useI18n } from '../store/useWalletStore.js';
import { PanelSlot } from '../components/PanelSlot.jsx';
import { SwapRouteInfoPanel, SwapActiveOrderPanel } from '../components/SwapQuoteStatusPanel.jsx';
import { SwapHistoryPanel } from '../components/SwapHistoryPanel.jsx';
import { LimitOrdersPanel } from '../components/LimitOrdersPanel.jsx';

export function SwapLimitView() {
  useLang();
  const { tr } = useI18n();
  return (
    <section id="view-swap" className="view-section hidden">
      <div className="section-header" style={{ marginBottom: '4px' }}>
        <div id="swap-mode-toggle" className="mode-pill-switch" role="tablist">
          <button
            type="button"
            id="swap-mode-market-btn"
            className="mode-pill-btn active"
            onClick={() => window.setSwapPanelMode && window.setSwapPanelMode('market')}
            data-i18n="swap.modeMarket"
          >
            {tr('swap.modeMarket', '闪兑')}
          </button>
          <button
            type="button"
            id="swap-mode-limit-btn"
            className="mode-pill-btn"
            onClick={() => window.setSwapPanelMode && window.setSwapPanelMode('limit')}
            data-i18n="swap.modeLimit"
          >
            {tr('swap.modeLimit', '限价')}
          </button>
        </div>
        <span className="ca-badge" data-i18n="header.caBadge">{tr('header.caBadge', 'NEAR CA')}</span>
      </div>

      <div id="swap-market-panel" className="flex flex-col gap-3">
        {/* Swap Main Card */}
        <div className="ios-glass-card flex flex-col gap-3">
          {/* From Box */}
          <div className="swap-box">
            <div className="swap-box-top">
              <span data-i18n="swap.fromLabel">{tr('swap.fromLabel', '支付')}</span>
              <div className="flex items-center gap-2">
                <span>
                  <span data-i18n="swap.balanceLabel">{tr('swap.balanceLabel', '可用')}</span>: <span id="swap-from-balance" className="mono">--</span>
                </span>
                <button
                  type="button"
                  className="mini-action-btn primary"
                  onClick={() => window.setSwapMaxAmount && window.setSwapMaxAmount()}
                  data-i18n="swap.maxBtn"
                >
                  {tr('swap.maxBtn', '全部')}
                </button>
              </div>
            </div>
            <div className="swap-box-main">
              <button
                type="button"
                id="swap-from-token-btn"
                className="token-select-btn"
                onClick={() => window.openTokenPicker && window.openTokenPicker('from')}
              ></button>
              <input
                id="swap-amount-in"
                type="number"
                step="any"
                min="0"
                className="amount-input-lg"
                placeholder="0.00"
                onInput={() => window.handleSwapAmountInput && window.handleSwapAmountInput()}
              />
            </div>
            <div className="swap-box-top">
              <span id="swap-from-net-label">--</span>
              <span id="swap-usd-in">--</span>
            </div>
          </div>

          {/* Flip Button */}
          <div className="swap-flip-wrap">
            <button
              type="button"
              className="swap-flip-btn"
              onClick={() => window.flipSwapTokens && window.flipSwapTokens()}
              aria-label="Flip"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Box */}
          <div className="swap-box">
            <div className="swap-box-top">
              <span data-i18n="swap.toLabel">{tr('swap.toLabel', '获得')}</span>
              <span>
                <span data-i18n="swap.balanceLabel">{tr('swap.balanceLabel', '可用')}</span>: <span id="swap-to-balance" className="mono">--</span>
              </span>
            </div>
            <div className="swap-box-main">
              <button
                type="button"
                id="swap-to-token-btn"
                className="token-select-btn"
                onClick={() => window.openTokenPicker && window.openTokenPicker('to')}
              ></button>
              <input id="swap-amount-out" type="text" readOnly className="amount-input-lg" placeholder="--" />
            </div>
            <div className="swap-box-top">
              <span id="swap-to-net-label">--</span>
              <span id="swap-usd-out">--</span>
            </div>
          </div>

          {/* Auto Route & Recipient */}
          <div className="meta-row" style={{ fontSize: '12px' }}>
            <span className="meta-key" data-i18n="swap.autoRouteLabel">{tr('swap.autoRouteLabel', '智能路由')}</span>
            <span id="swap-auto-route-badge" className="ca-badge">--</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }} data-i18n="swap.recipientLabel">{tr('swap.recipientLabel', '目标链收款地址')}</span>
              <button
                type="button"
                id="swap-recipient-contacts-btn"
                className="btn-ghost-sm"
                onClick={() => window.openContactsPicker && window.openContactsPicker('swap')}
                data-i18n="common.contacts"
              >
                {tr('common.contacts', '地址簿')}
              </button>
            </div>
            <input
              id="swap-recipient-input"
              type="text"
              className="input-field mono"
              data-i18n-placeholder="swap.recipientPlaceholder"
              placeholder={tr('swap.recipientPlaceholder', '自动匹配当前主账户对应链地址')}
              onInput={() => window.handleSwapRecipientInput && window.handleSwapRecipientInput()}
            />
          </div>

          {/* Quote Meta */}
          <div id="swap-quote-meta" className="meta-list">
            <div className="meta-row">
              <span className="meta-key" data-i18n="swap.rateLabel">{tr('swap.rateLabel', '参考汇率')}</span>
              <span
                id="swap-quote-rate"
                className="meta-val"
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                onClick={() => window.toggleSwapRateOrientation && window.toggleSwapRateOrientation()}
              >
                --
              </span>
            </div>
            <button
              type="button"
              id="swap-details-toggle"
              className="meta-toggle-btn"
              onClick={() => window.toggleSwapDetails && window.toggleSwapDetails()}
              aria-expanded="false"
            >
              <span className="meta-key" data-i18n="swap.detailsLabel">{tr('swap.detailsLabel', '更多设置')}</span>
              <span className="flex items-center gap-1">
                <span id="swap-details-summary" className="meta-summary" data-i18n="swap.detailsDefaultSummary">{tr('swap.detailsDefaultSummary', '滑点 1%')}</span>
                <span className="meta-chevron">▾</span>
              </span>
            </button>
            <div id="swap-details-body" className="meta-details-body hidden">
              <div className="meta-row">
                <span className="meta-key" data-i18n="swap.routeLabel">{tr('swap.routeLabel', '执行路由')}</span>
                <span id="swap-quote-route" className="meta-val">
                  <PanelSlot slotId="swap-quote-route" component={SwapRouteInfoPanel} renderEmpty="--" />
                </span>
              </div>
              <div className="meta-row">
                <span className="meta-key" data-i18n="swap.feeLabel">{tr('swap.feeLabel', '服务费')}</span>
                <span id="swap-quote-fee" className="meta-val">--</span>
              </div>
              <div className="meta-row">
                <span className="meta-key" data-i18n="swap.slippageLabel">{tr('swap.slippageLabel', '滑点容差')}</span>
                <div className="flex gap-1">
                  <button type="button" className="filter-pill" data-bps="50" onClick={() => window.setSwapSlippage && window.setSwapSlippage(50)}>0.5%</button>
                  <button type="button" className="filter-pill active" data-bps="100" onClick={() => window.setSwapSlippage && window.setSwapSlippage(100)}>1%</button>
                  <button type="button" className="filter-pill" data-bps="300" onClick={() => window.setSwapSlippage && window.setSwapSlippage(300)}>3%</button>
                </div>
              </div>
              <div id="swap-gas-reserve-row" className="meta-row hidden">
                <span id="swap-gas-reserve-label" className="meta-key" data-i18n="swap.gasReserveLabel">{tr('swap.gasReserveLabel', '目标链 Gas 预留')}</span>
                <div className="flex gap-1 items-center">
                  <button
                    type="button"
                    className="filter-pill active"
                    data-gas-mode="auto"
                    onClick={() => window.setSwapGasReserveMode && window.setSwapGasReserveMode('auto')}
                    data-i18n="swap.gasModeAuto"
                  >
                    {tr('swap.gasModeAuto', '默认')}
                  </button>
                  <button
                    type="button"
                    className="filter-pill"
                    data-gas-mode="extra"
                    onClick={() => window.setSwapGasReserveMode && window.setSwapGasReserveMode('extra')}
                    data-i18n="swap.gasModeExtra"
                  >
                    {tr('swap.gasModeExtra', '多留')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div id="swap-price-impact-banner" className="swap-impact-banner hidden" role="alert"></div>

          <div id="swap-gas-fix-banner" className="gas-fix-banner hidden">
            <span id="swap-gas-fix-text" className="gas-fix-text"></span>
            <button
              type="button"
              id="btn-swap-gas-fix"
              className="mini-action-btn primary"
              onClick={() => window.applySwapMaxSpendableFix && window.applySwapMaxSpendableFix()}
              data-i18n="swap.useMaxBtn"
            >
              {tr('swap.useMaxBtn', '设为最大可用')}
            </button>
          </div>

          <div id="swap-error-banner" className="swap-error-banner hidden"></div>

          <button
            type="button"
            id="btn-execute-swap"
            className="btn-primary"
            onClick={() => window.executeActiveSwap && window.executeActiveSwap()}
            data-i18n="swap.executeBtn"
          >
            {tr('swap.executeBtn', '确认闪兑')}
          </button>
        </div>

        {/* Active 1Click Order Status Card */}
        <div id="swap-order-card" className="ios-glass-card hidden flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 700, fontSize: '14px' }} data-i18n="swap.orderTitle">{tr('swap.orderTitle', '跨链订单跟踪')}</span>
            <button
              type="button"
              className="btn-ghost-sm"
              onClick={() => window.clearActiveSwapOrder && window.clearActiveSwapOrder()}
              data-i18n="swap.orderDoneBtn"
            >
              {tr('swap.orderDoneBtn', '完成')}
            </button>
          </div>
          <div className="meta-list">
            <div className="meta-row">
              <span className="meta-key" data-i18n="swap.orderStatus">{tr('swap.orderStatus', '订单状态')}</span>
              <span id="swap-order-status" className="meta-val">
                <PanelSlot slotId="swap-order-status" component={SwapActiveOrderPanel} renderEmpty="--" />
              </span>
            </div>
            <div id="swap-order-tx-row" className="meta-row hidden">
              <span className="meta-key" data-i18n="swap.orderTxHash">{tr('swap.orderTxHash', '交易哈希')}</span>
              <span id="swap-order-origin-tx" className="meta-val mono" style={{ fontSize: '11px' }}>--</span>
            </div>
          </div>
          <div id="swap-order-manual-box" className="flex flex-col gap-3">
            <div id="swap-order-qr" className="qr-frame hidden"></div>
            <div className="meta-list">
              <div className="meta-row">
                <span className="meta-key" data-i18n="swap.orderDepositAddr">{tr('swap.orderDepositAddr', '充值地址')}</span>
                <button
                  type="button"
                  className="btn-ghost-sm"
                  onClick={() => window.copySwapOrderDeposit && window.copySwapOrderDeposit()}
                  data-i18n="common.copy"
                >
                  {tr('common.copy', '复制')}
                </button>
              </div>
              <div id="swap-order-deposit-addr" className="mono" style={{ fontSize: '11px', wordBreak: 'break-all', color: 'var(--near-emerald)' }}>--</div>
            </div>
            <div className="flex gap-2">
              <input
                id="swap-order-txhash-input"
                type="text"
                className="input-field mono flex-1"
                data-i18n-placeholder="swap.orderSubmitHashPlaceholder"
                placeholder={tr('swap.orderSubmitHashPlaceholder', '粘贴外部转账交易哈希加速确认')}
              />
              <button
                type="button"
                id="btn-submit-swap-order-txhash"
                className="btn-secondary"
                onClick={() => window.submitSwapOrderTxHash && window.submitSwapOrderTxHash()}
                data-i18n="swap.orderSubmitHashBtn"
              >
                {tr('swap.orderSubmitHashBtn', '提交凭证')}
              </button>
            </div>
          </div>
          <button
            type="button"
            id="btn-resume-swap-stage"
            className="btn-primary hidden"
            onClick={() => window.resumeActiveSwapFollowUp && window.resumeActiveSwapFollowUp()}
            data-i18n="swap.orderResumeBtn"
          >
            {tr('swap.orderResumeBtn', '继续执行下一步')}
          </button>
          <button
            type="button"
            id="btn-refresh-swap-order"
            className="btn-secondary"
            onClick={() => window.refreshActiveSwapOrderStatus && window.refreshActiveSwapOrderStatus(true)}
            data-i18n="swap.orderRefresh"
          >
            {tr('swap.orderRefresh', '刷新状态')}
          </button>
        </div>

        {/* Swap History Card */}
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 700, fontSize: '14px' }} data-i18n="swap.historyTitle">{tr('swap.historyTitle', '闪兑记录')}</span>
          </div>
          <div id="swap-history-list" className="flex flex-col gap-2">
            <PanelSlot slotId="swap-history-list" component={SwapHistoryPanel} />
          </div>
        </div>
      </div>

      {/* Limit Orders Panel */}
      <div id="swap-limit-panel" className="hidden flex flex-col gap-3">
        <div id="limit-chain-pills" className="pill-scroll">
          <button type="button" className="filter-pill active" data-limit-chain="near" onClick={() => window.setLimitChain && window.setLimitChain('near')}>NEAR</button>
          <button type="button" className="filter-pill" data-limit-chain="sol" onClick={() => window.setLimitChain && window.setLimitChain('sol')}>Solana</button>
          <button type="button" className="filter-pill" data-limit-chain="eth" onClick={() => window.setLimitChain && window.setLimitChain('eth')}>ETH</button>
          <button type="button" className="filter-pill" data-limit-chain="base" onClick={() => window.setLimitChain && window.setLimitChain('base')}>Base</button>
          <button type="button" className="filter-pill" data-limit-chain="arb" onClick={() => window.setLimitChain && window.setLimitChain('arb')}>Arbitrum</button>
          <button type="button" className="filter-pill" data-limit-chain="bsc" onClick={() => window.setLimitChain && window.setLimitChain('bsc')}>BSC</button>
          <button type="button" className="filter-pill" data-limit-chain="pol" onClick={() => window.setLimitChain && window.setLimitChain('pol')}>Polygon</button>
          <button type="button" className="filter-pill" data-limit-chain="avax" onClick={() => window.setLimitChain && window.setLimitChain('avax')}>Avalanche</button>
        </div>

        <div className="ios-glass-card flex flex-col gap-3">
          {/* Limit Sell Box */}
          <div className="swap-box">
            <div className="swap-box-top">
              <span data-i18n="limit.sellLabel">{tr('limit.sellLabel', '卖出')}</span>
              <div className="flex items-center gap-2">
                <span>
                  <span data-i18n="swap.balanceLabel">{tr('swap.balanceLabel', '可用')}</span>: <span id="limit-sell-balance" className="mono">--</span>
                </span>
                <button
                  type="button"
                  id="btn-limit-wrap"
                  className="mini-action-btn hidden"
                  onClick={() => window.wrapNativeForLimitUI && window.wrapNativeForLimitUI()}
                  data-i18n="limit.wrapBtn"
                >
                  {tr('limit.wrapBtn', '封装')}
                </button>
                <button
                  type="button"
                  className="mini-action-btn primary"
                  onClick={() => window.setLimitMaxAmount && window.setLimitMaxAmount()}
                  data-i18n="swap.maxBtn"
                >
                  {tr('swap.maxBtn', '全部')}
                </button>
              </div>
            </div>
            <div className="swap-box-main">
              <button
                type="button"
                id="limit-sell-token-btn"
                className="token-select-btn"
                onClick={() => window.openLimitTokenPicker && window.openLimitTokenPicker('from')}
              ></button>
              <input
                id="limit-amount-in"
                type="number"
                step="any"
                min="0"
                className="amount-input-lg"
                placeholder="0.00"
                onInput={() => window.handleLimitInput && window.handleLimitInput()}
              />
            </div>
            <div className="swap-box-top">
              <span id="limit-sell-net-label">--</span>
              <span id="limit-usd-in">--</span>
            </div>
          </div>

          {/* Limit Flip Button */}
          <div className="swap-flip-wrap">
            <button
              type="button"
              className="swap-flip-btn"
              onClick={() => window.flipLimitTokens && window.flipLimitTokens()}
              aria-label="Flip"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Limit Buy Box */}
          <div className="swap-box">
            <div className="swap-box-top">
              <span data-i18n="limit.buyLabel">{tr('limit.buyLabel', '买入')}</span>
              <span>
                <span data-i18n="swap.balanceLabel">{tr('swap.balanceLabel', '可用')}</span>: <span id="limit-buy-balance" className="mono">--</span>
              </span>
            </div>
            <div className="swap-box-main">
              <button
                type="button"
                id="limit-buy-token-btn"
                className="token-select-btn"
                onClick={() => window.openLimitTokenPicker && window.openLimitTokenPicker('to')}
              ></button>
              <input id="limit-amount-out" type="text" readOnly className="amount-input-lg" placeholder="--" />
            </div>
            <div className="swap-box-top">
              <span id="limit-buy-net-label">--</span>
              <span id="limit-usd-out">--</span>
            </div>
          </div>

          {/* Target Price Box */}
          <div className="swap-box">
            <div className="swap-box-top">
              <span data-i18n="limit.priceLabel">{tr('limit.priceLabel', '目标价格')}</span>
              <span className="flex items-center gap-1">
                <span>
                  <span data-i18n="limit.marketRefLabel">{tr('limit.marketRefLabel', '当前参考')}</span>: <span id="limit-market-rate" className="mono">--</span>
                </span>
                <button
                  type="button"
                  id="limit-rate-flip-btn"
                  className="btn-ghost-sm"
                  style={{ padding: '1px 6px', fontSize: '11px' }}
                  onClick={() => window.toggleLimitPriceOrientation && window.toggleLimitPriceOrientation()}
                  aria-label="Flip price orientation"
                >
                  ⇄
                </button>
              </span>
            </div>
            <div className="swap-box-main" style={{ gap: '8px' }}>
              <span id="limit-rate-prefix" style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>1 -- =</span>
              <input
                id="limit-target-rate"
                type="number"
                step="any"
                min="0"
                className="amount-input-lg"
                placeholder="0.00"
                onInput={() => window.handleLimitRateInput && window.handleLimitRateInput()}
              />
              <span id="limit-rate-suffix" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--near-emerald)', whiteSpace: 'nowrap' }}>--</span>
            </div>
            <div id="limit-target-usd-hint" className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'right', minHeight: '14px' }}></div>
            <div id="limit-offset-pills" className="flex gap-1">
              <button type="button" className="filter-pill" data-offset-idx="0" onClick={() => window.applyLimitRateOffsetByIndex && window.applyLimitRateOffsetByIndex(0)} data-i18n="limit.rateOffsetNow">{tr('limit.rateOffsetNow', '现价')}</button>
              <button type="button" className="filter-pill" data-offset-idx="1" onClick={() => window.applyLimitRateOffsetByIndex && window.applyLimitRateOffsetByIndex(1)}>+2%</button>
              <button type="button" className="filter-pill" data-offset-idx="2" onClick={() => window.applyLimitRateOffsetByIndex && window.applyLimitRateOffsetByIndex(2)}>+5%</button>
              <button type="button" className="filter-pill" data-offset-idx="3" onClick={() => window.applyLimitRateOffsetByIndex && window.applyLimitRateOffsetByIndex(3)}>+10%</button>
            </div>
            <div id="limit-near-tick-controls" className="limit-dcl-tick-bar hidden">
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} data-i18n="limit.activeTickLabel">{tr('limit.activeTickLabel', '链上生效档位')}</span>
                <span id="limit-snapped-tick-label" className="mono text-emerald" style={{ fontSize: '12px', fontWeight: 700 }}>--</span>
              </div>
              <div className="flex gap-2">
                <button type="button" className="mini-action-btn flex-1" onClick={() => window.stepLimitDclPoint && window.stepLimitDclPoint(-1)} data-i18n="limit.stepDown">{tr('limit.stepDown', '− 低一档')}</button>
                <button type="button" className="mini-action-btn flex-1" onClick={() => window.stepLimitDclPoint && window.stepLimitDclPoint(1)} data-i18n="limit.stepUp">{tr('limit.stepUp', '高一档 +')}</button>
              </div>
            </div>
          </div>

          <div id="limit-price-warning-banner" className="swap-impact-banner hidden" role="alert"></div>

          {/* NEAR Split-2-Ticks Option */}
          <div id="limit-split-row" className="flex flex-col gap-2 hidden">
            <div className="meta-row" style={{ padding: '2px 2px' }}>
              <span className="meta-key" data-i18n="limit.splitTicksLabel">{tr('limit.splitTicksLabel', '拆成相邻两档 (更易吃单)')}</span>
              <label className="nexus-switch">
                <input
                  id="limit-split-toggle"
                  type="checkbox"
                  onChange={(e) => window.toggleLimitSplitTicks && window.toggleLimitSplitTicks(e.currentTarget.checked)}
                />
                <span className="nexus-switch-slider"></span>
              </label>
            </div>
            <div id="limit-split-preview" className="limit-split-preview hidden"></div>
          </div>

          {/* Solana / EVM Expiry Row */}
          <div id="limit-expiry-row" className="meta-row hidden">
            <span className="meta-key" data-i18n="limit.expiryLabel">{tr('limit.expiryLabel', '有效期')}</span>
            <div id="limit-expiry-pills" className="flex gap-1">
              <button type="button" className="filter-pill" data-exp-days="1" onClick={() => window.setLimitExpiryDays && window.setLimitExpiryDays(1)} data-i18n="limit.exp1d">{tr('limit.exp1d', '1天')}</button>
              <button type="button" className="filter-pill active" data-exp-days="7" onClick={() => window.setLimitExpiryDays && window.setLimitExpiryDays(7)} data-i18n="limit.exp7d">{tr('limit.exp7d', '7天')}</button>
              <button type="button" className="filter-pill" data-exp-days="30" onClick={() => window.setLimitExpiryDays && window.setLimitExpiryDays(30)} data-i18n="limit.exp30d">{tr('limit.exp30d', '30天')}</button>
            </div>
          </div>

          {/* Limit Meta Summary */}
          <div className="meta-list">
            <div className="meta-row">
              <span className="meta-key" data-i18n="limit.estReceive">{tr('limit.estReceive', '预计获得')}</span>
              <span id="limit-meta-est-out" className="meta-val">--</span>
            </div>
            <div id="limit-meta-fee-row" className="meta-row hidden">
              <span className="meta-key" data-i18n="limit.poolFeeLabel">{tr('limit.poolFeeLabel', '池子费率')}</span>
              <span id="limit-meta-pool-fee" className="meta-val">--</span>
            </div>
            <div className="meta-row">
              <span className="meta-key" data-i18n="limit.gasLabel">{tr('limit.gasLabel', '网络费 (Gas)')}</span>
              <span id="limit-meta-gas" className="meta-val">--</span>
            </div>
            <div className="meta-row">
              <span className="meta-key" data-i18n="limit.depositLabel">{tr('limit.depositLabel', '押金 (可退)')}</span>
              <span id="limit-meta-deposit" className="meta-val">--</span>
            </div>
            <div className="meta-row">
              <span className="meta-key" data-i18n="limit.minOrderLabel">{tr('limit.minOrderLabel', '最低限额')}</span>
              <span id="limit-meta-min" className="meta-val">--</span>
            </div>
          </div>

          <div id="limit-error-banner" className="swap-error-banner hidden"></div>
          <button
            type="button"
            id="btn-execute-limit"
            className="btn-primary"
            onClick={() => window.executeLimitOrderAction && window.executeLimitOrderAction()}
            data-i18n="limit.submitBtn"
          >
            {tr('limit.submitBtn', '提交限价单')}
          </button>
        </div>

        {/* Active / History Limit Orders */}
        <div id="limit-orders-card" className="ios-glass-card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontWeight: 700, fontSize: '14px' }} data-i18n="limit.ordersTitle">{tr('limit.ordersTitle', '限价挂单')}</span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  id="limit-tab-active"
                  className="filter-pill active"
                  onClick={() => window.setLimitOrdersTab && window.setLimitOrdersTab('active')}
                  data-i18n="limit.tabActive"
                >
                  {tr('limit.tabActive', '当前挂单')}
                </button>
                <button
                  type="button"
                  id="limit-tab-history"
                  className="filter-pill"
                  onClick={() => window.setLimitOrdersTab && window.setLimitOrdersTab('history')}
                  data-i18n="limit.tabHistory"
                >
                  {tr('limit.tabHistory', '历史挂单')}
                </button>
              </div>
              <button
                type="button"
                id="btn-refresh-limit-orders"
                className="btn-ghost-sm"
                onClick={() => window.refreshLimitOrdersAsync && window.refreshLimitOrdersAsync(true)}
                data-i18n="common.refresh"
              >
                {tr('common.refresh', '刷新')}
              </button>
            </div>
          </div>
          <div id="limit-orders-list" className="flex flex-col gap-2">
            <PanelSlot slotId="limit-orders-list" component={LimitOrdersPanel} />
          </div>
        </div>
      </div>
    </section>
  );
}
