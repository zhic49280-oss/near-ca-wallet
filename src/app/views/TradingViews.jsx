import { h } from 'preact';

export function SwapLimitView() {
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
            闪兑
          </button>
          <button
            type="button"
            id="swap-mode-limit-btn"
            className="mode-pill-btn"
            onClick={() => window.setSwapPanelMode && window.setSwapPanelMode('limit')}
            data-i18n="swap.modeLimit"
          >
            限价
          </button>
        </div>
        <span className="ca-badge" data-i18n="header.caBadge">NEAR CA</span>
      </div>

      <div id="swap-market-panel" className="flex flex-col gap-3">
        {/* Swap Main Card */}
        <div className="ios-glass-card flex flex-col gap-3">
          {/* From Box */}
          <div className="swap-box">
            <div className="swap-box-top">
              <span data-i18n="swap.fromLabel">支付</span>
              <div className="flex items-center gap-2">
                <span>
                  <span data-i18n="swap.balanceLabel">可用</span>: <span id="swap-from-balance" className="mono">--</span>
                </span>
                <button
                  type="button"
                  className="mini-action-btn primary"
                  onClick={() => window.setSwapMaxAmount && window.setSwapMaxAmount()}
                  data-i18n="swap.maxBtn"
                >
                  全部
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Box */}
          <div className="swap-box">
            <div className="swap-box-top">
              <span data-i18n="swap.toLabel">获得</span>
              <span>
                <span data-i18n="swap.balanceLabel">可用</span>: <span id="swap-to-balance" className="mono">--</span>
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
            <span className="meta-key" data-i18n="swap.autoRouteLabel">智能路由</span>
            <span id="swap-auto-route-badge" className="ca-badge">--</span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }} data-i18n="swap.recipientLabel">目标链收款地址</span>
              <button
                type="button"
                id="swap-recipient-contacts-btn"
                className="btn-ghost-sm"
                onClick={() => window.openContactsPicker && window.openContactsPicker('swap')}
                data-i18n="common.contacts"
              >
                地址簿
              </button>
            </div>
            <input
              id="swap-recipient-input"
              type="text"
              className="input-field mono"
              data-i18n-placeholder="swap.recipientPlaceholder"
              placeholder="自动匹配当前主账户对应链地址"
              onInput={() => window.handleSwapRecipientInput && window.handleSwapRecipientInput()}
            />
          </div>

          {/* Quote Meta */}
          <div id="swap-quote-meta" className="meta-list">
            <div className="meta-row">
              <span className="meta-key" data-i18n="swap.rateLabel">参考汇率</span>
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
              <span className="meta-key" data-i18n="swap.detailsLabel">更多设置</span>
              <span className="flex items-center gap-1">
                <span id="swap-details-summary" className="meta-summary" data-i18n="swap.detailsDefaultSummary">滑点 1%</span>
                <span className="meta-chevron">▾</span>
              </span>
            </button>
            <div id="swap-details-body" className="meta-details-body hidden">
              <div className="meta-row">
                <span className="meta-key" data-i18n="swap.routeLabel">执行路由</span>
                <span id="swap-quote-route" className="meta-val">--</span>
              </div>
              <div className="meta-row">
                <span className="meta-key" data-i18n="swap.feeLabel">服务费</span>
                <span id="swap-quote-fee" className="meta-val">--</span>
              </div>
              <div className="meta-row">
                <span className="meta-key" data-i18n="swap.slippageLabel">滑点容差</span>
                <div className="flex gap-1">
                  <button type="button" className="filter-pill" data-bps="50" onClick={() => window.setSwapSlippage && window.setSwapSlippage(50)}>0.5%</button>
                  <button type="button" className="filter-pill active" data-bps="100" onClick={() => window.setSwapSlippage && window.setSwapSlippage(100)}>1%</button>
                  <button type="button" className="filter-pill" data-bps="300" onClick={() => window.setSwapSlippage && window.setSwapSlippage(300)}>3%</button>
                </div>
              </div>
              <div id="swap-gas-reserve-row" className="meta-row hidden">
                <span id="swap-gas-reserve-label" className="meta-key" data-i18n="swap.gasReserveLabel">目标链 Gas 预留</span>
                <div className="flex gap-1 items-center">
                  <button
                    type="button"
                    className="filter-pill active"
                    data-gas-mode="auto"
                    onClick={() => window.setSwapGasReserveMode && window.setSwapGasReserveMode('auto')}
                    data-i18n="swap.gasModeAuto"
                  >
                    默认
                  </button>
                  <button
                    type="button"
                    className="filter-pill"
                    data-gas-mode="extra"
                    onClick={() => window.setSwapGasReserveMode && window.setSwapGasReserveMode('extra')}
                    data-i18n="swap.gasModeExtra"
                  >
                    多留
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
              设为最大可用
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
            确认闪兑
          </button>
        </div>

        {/* Active 1Click Order Status Card */}
        <div id="swap-order-card" className="ios-glass-card hidden flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 700, fontSize: '14px' }} data-i18n="swap.orderTitle">跨链订单跟踪</span>
            <button
              type="button"
              className="btn-ghost-sm"
              onClick={() => window.clearActiveSwapOrder && window.clearActiveSwapOrder()}
              data-i18n="swap.orderDoneBtn"
            >
              完成
            </button>
          </div>
          <div className="meta-list">
            <div className="meta-row">
              <span className="meta-key" data-i18n="swap.orderStatus">订单状态</span>
              <span id="swap-order-status" className="meta-val">--</span>
            </div>
            <div id="swap-order-tx-row" className="meta-row hidden">
              <span className="meta-key" data-i18n="swap.orderTxHash">交易哈希</span>
              <span id="swap-order-origin-tx" className="meta-val mono" style={{ fontSize: '11px' }}>--</span>
            </div>
          </div>
          <div id="swap-order-manual-box" className="flex flex-col gap-3">
            <div id="swap-order-qr" className="qr-frame hidden"></div>
            <div className="meta-list">
              <div className="meta-row">
                <span className="meta-key" data-i18n="swap.orderDepositAddr">充值地址</span>
                <button
                  type="button"
                  className="btn-ghost-sm"
                  onClick={() => window.copySwapOrderDeposit && window.copySwapOrderDeposit()}
                  data-i18n="common.copy"
                >
                  复制
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
                placeholder="粘贴外部转账交易哈希加速确认"
              />
              <button
                type="button"
                id="btn-submit-swap-order-txhash"
                className="btn-secondary"
                onClick={() => window.submitSwapOrderTxHash && window.submitSwapOrderTxHash()}
                data-i18n="swap.orderSubmitHashBtn"
              >
                提交凭证
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
            继续执行下一步
          </button>
          <button
            type="button"
            id="btn-refresh-swap-order"
            className="btn-secondary"
            onClick={() => window.refreshActiveSwapOrderStatus && window.refreshActiveSwapOrderStatus(true)}
            data-i18n="swap.orderRefresh"
          >
            刷新状态
          </button>
        </div>

        {/* Swap History Card */}
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 700, fontSize: '14px' }} data-i18n="swap.historyTitle">闪兑记录</span>
          </div>
          <div id="swap-history-list" className="flex flex-col gap-2"></div>
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
              <span data-i18n="limit.sellLabel">卖出</span>
              <div className="flex items-center gap-2">
                <span>
                  <span data-i18n="swap.balanceLabel">可用</span>: <span id="limit-sell-balance" className="mono">--</span>
                </span>
                <button
                  type="button"
                  id="btn-limit-wrap"
                  className="mini-action-btn hidden"
                  onClick={() => window.wrapNativeForLimitUI && window.wrapNativeForLimitUI()}
                  data-i18n="limit.wrapBtn"
                >
                  封装
                </button>
                <button
                  type="button"
                  className="mini-action-btn primary"
                  onClick={() => window.setLimitMaxAmount && window.setLimitMaxAmount()}
                  data-i18n="swap.maxBtn"
                >
                  全部
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
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Limit Buy Box */}
          <div className="swap-box">
            <div className="swap-box-top">
              <span data-i18n="limit.buyLabel">买入</span>
              <span>
                <span data-i18n="swap.balanceLabel">可用</span>: <span id="limit-buy-balance" className="mono">--</span>
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
              <span data-i18n="limit.priceLabel">目标价格</span>
              <span className="flex items-center gap-1">
                <span>
                  <span data-i18n="limit.marketRefLabel">当前参考</span>: <span id="limit-market-rate" className="mono">--</span>
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
              <button type="button" className="filter-pill" data-offset-idx="0" onClick={() => window.applyLimitRateOffsetByIndex && window.applyLimitRateOffsetByIndex(0)} data-i18n="limit.rateOffsetNow">现价</button>
              <button type="button" className="filter-pill" data-offset-idx="1" onClick={() => window.applyLimitRateOffsetByIndex && window.applyLimitRateOffsetByIndex(1)}>+2%</button>
              <button type="button" className="filter-pill" data-offset-idx="2" onClick={() => window.applyLimitRateOffsetByIndex && window.applyLimitRateOffsetByIndex(2)}>+5%</button>
              <button type="button" className="filter-pill" data-offset-idx="3" onClick={() => window.applyLimitRateOffsetByIndex && window.applyLimitRateOffsetByIndex(3)}>+10%</button>
            </div>
            <div id="limit-near-tick-controls" className="limit-dcl-tick-bar hidden">
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }} data-i18n="limit.activeTickLabel">链上生效档位</span>
                <span id="limit-snapped-tick-label" className="mono text-emerald" style={{ fontSize: '12px', fontWeight: 700 }}>--</span>
              </div>
              <div className="flex gap-2">
                <button type="button" className="mini-action-btn flex-1" onClick={() => window.stepLimitDclPoint && window.stepLimitDclPoint(-1)} data-i18n="limit.stepDown">− 低一档</button>
                <button type="button" className="mini-action-btn flex-1" onClick={() => window.stepLimitDclPoint && window.stepLimitDclPoint(1)} data-i18n="limit.stepUp">高一档 +</button>
              </div>
            </div>
          </div>

          <div id="limit-price-warning-banner" className="swap-impact-banner hidden" role="alert"></div>

          {/* NEAR Split-2-Ticks Option */}
          <div id="limit-split-row" className="flex flex-col gap-2 hidden">
            <div className="meta-row" style={{ padding: '2px 2px' }}>
              <span className="meta-key" data-i18n="limit.splitTicksLabel">拆成相邻两档 (更易吃单)</span>
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
            <span className="meta-key" data-i18n="limit.expiryLabel">有效期</span>
            <div id="limit-expiry-pills" className="flex gap-1">
              <button type="button" className="filter-pill" data-exp-days="1" onClick={() => window.setLimitExpiryDays && window.setLimitExpiryDays(1)} data-i18n="limit.exp1d">1天</button>
              <button type="button" className="filter-pill active" data-exp-days="7" onClick={() => window.setLimitExpiryDays && window.setLimitExpiryDays(7)} data-i18n="limit.exp7d">7天</button>
              <button type="button" className="filter-pill" data-exp-days="30" onClick={() => window.setLimitExpiryDays && window.setLimitExpiryDays(30)} data-i18n="limit.exp30d">30天</button>
            </div>
          </div>

          {/* Limit Meta Summary */}
          <div className="meta-list">
            <div className="meta-row">
              <span className="meta-key" data-i18n="limit.estReceive">预计获得</span>
              <span id="limit-meta-est-out" className="meta-val">--</span>
            </div>
            <div id="limit-meta-fee-row" className="meta-row hidden">
              <span className="meta-key" data-i18n="limit.poolFeeLabel">池子费率</span>
              <span id="limit-meta-pool-fee" className="meta-val">--</span>
            </div>
            <div className="meta-row">
              <span className="meta-key" data-i18n="limit.gasLabel">网络费 (Gas)</span>
              <span id="limit-meta-gas" className="meta-val">--</span>
            </div>
            <div className="meta-row">
              <span className="meta-key" data-i18n="limit.depositLabel">押金 (可退)</span>
              <span id="limit-meta-deposit" className="meta-val">--</span>
            </div>
            <div className="meta-row">
              <span className="meta-key" data-i18n="limit.minOrderLabel">最低限额</span>
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
            提交限价单
          </button>
        </div>

        {/* Active / History Limit Orders */}
        <div id="limit-orders-card" className="ios-glass-card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontWeight: 700, fontSize: '14px' }} data-i18n="limit.ordersTitle">限价挂单</span>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  id="limit-tab-active"
                  className="filter-pill active"
                  onClick={() => window.setLimitOrdersTab && window.setLimitOrdersTab('active')}
                  data-i18n="limit.tabActive"
                >
                  当前挂单
                </button>
                <button
                  type="button"
                  id="limit-tab-history"
                  className="filter-pill"
                  onClick={() => window.setLimitOrdersTab && window.setLimitOrdersTab('history')}
                  data-i18n="limit.tabHistory"
                >
                  历史挂单
                </button>
              </div>
              <button
                type="button"
                id="btn-refresh-limit-orders"
                className="btn-ghost-sm"
                onClick={() => window.refreshLimitOrdersAsync && window.refreshLimitOrdersAsync(true)}
                data-i18n="common.refresh"
              >
                刷新
              </button>
            </div>
          </div>
          <div id="limit-orders-list" className="flex flex-col gap-2"></div>
        </div>
      </div>
    </section>
  );
}

export function PerpView() {
  return (
    <section id="view-perp" className="view-section hidden">
      {/* 1. Contract Wallet Summary (Always visible in Overview) */}
      <div id="perp-overview-panel" className="flex flex-col gap-3">
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="perp-summary-grid">
            <div className="perp-stat-box">
              <span className="kpi-label" data-i18n="perp.equityLabel">合约净值</span>
              <span id="perp-equity-val" className="kpi-value">--</span>
            </div>
            <div className="perp-stat-box">
              <span className="kpi-label" data-i18n="perp.availMarginLabel">可用保证金</span>
              <span id="perp-avail-val" className="kpi-value text-emerald">--</span>
            </div>
            <div className="perp-stat-box">
              <span className="kpi-label" data-i18n="perp.upnlLabel">未实现盈亏</span>
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
              充值
            </button>
            <button
              type="button"
              className="mini-action-btn flex-1"
              onClick={() => window.openPerpFundingSheet && window.openPerpFundingSheet('withdraw')}
              data-i18n="perp.withdrawBtn"
            >
              提现
            </button>
            <button
              type="button"
              id="btn-perp-overview-refresh"
              className="btn-ghost-sm"
              onClick={() => window.refreshPerpDataAsync && window.refreshPerpDataAsync(true)}
              data-i18n="common.refresh"
            >
              刷新
            </button>
          </div>

          <div id="perp-spot-banner" className="perp-spot-banner hidden">
            <span style={{ fontSize: '11.5px', color: 'var(--text-primary)' }}>
              <span data-i18n="perp.spotPendingPrefix">跨链资金已到账</span>{' '}
              <strong id="perp-spot-pending-amt" className="mono text-emerald">--</strong>
            </span>
            <button
              type="button"
              className="mini-action-btn primary"
              onClick={() => window.quickTransferSpotToPerpUI && window.quickTransferSpotToPerpUI()}
              data-i18n="perp.transferToPerpBtn"
            >
              一键转入合约 (免费)
            </button>
          </div>

          <div
            id="perp-overview-positions-wrap"
            className="hidden flex flex-col gap-2"
            style={{ paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}
          ></div>
        </div>

        {/* Market Overview List: Watchlist / Crypto / Stocks (HIP-3) / All */}
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="search-input-wrap">
            <input
              id="perp-overview-search"
              type="text"
              className="input-field"
              data-i18n-placeholder="perp.overviewSearchPlaceholder"
              placeholder="搜索合约 (如 BTC, PEPE, CRCL, NVDA...)"
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
            <button type="button" className="filter-pill" data-action="set-perp-overview-cat" data-cat="favorites" data-i18n="perp.catFavorites">⭐ 自选</button>
            <button type="button" className="filter-pill active" data-action="set-perp-overview-cat" data-cat="crypto" data-i18n="perp.catCrypto">🪙 加密货币</button>
            <button type="button" className="filter-pill" data-action="set-perp-overview-cat" data-cat="stocks" data-i18n="perp.catStocks">📈 股票</button>
            <button type="button" className="filter-pill" data-action="set-perp-overview-cat" data-cat="all" data-i18n="perp.catAll">全部</button>
          </div>

          <div className="perp-mkt-col-hdr">
            <button type="button" className="perp-sort-hdr-btn" data-action="sort-perp-overview" data-sort="vol">
              <span data-i18n="perp.colContractVol">合约 / 成交额</span> <span id="perp-sort-ind-vol">↓</span>
            </button>
            <div className="flex items-center gap-3">
              <button type="button" className="perp-sort-hdr-btn" data-action="sort-perp-overview" data-sort="px">
                <span data-i18n="perp.colLastPx">最新价</span> <span id="perp-sort-ind-px">⇅</span>
              </button>
              <button
                type="button"
                className="perp-sort-hdr-btn"
                data-action="sort-perp-overview"
                data-sort="chg"
                style={{ minWidth: '70px', justifyContent: 'flex-end' }}
              >
                <span data-i18n="perp.colChg24h">24h 涨跌</span> <span id="perp-sort-ind-chg">⇅</span>
              </button>
            </div>
          </div>

          <div id="perp-overview-list" className="flex flex-col gap-2"></div>
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
                ← 行情
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
            <div className="perp-trade-top-right">
              <div className="flex flex-col perp-top-px-wrap">
                <span id="perp-mark-px" className="mono" style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>--</span>
                <span id="perp-change-24h" className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>--</span>
              </div>
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
                刷新
              </button>
              <button
                type="button"
                id="btn-perp-chart-toggle"
                className="btn-ghost-sm perp-top-act-btn"
                onClick={() => window.togglePerpChart && window.togglePerpChart()}
                data-i18n="perp.chartBtn"
              >
                K线
              </button>
            </div>
          </div>

          <div id="perp-market-stats" className="perp-market-stats">
            <div className="perp-mstat">
              <span className="meta-key" data-i18n="perp.vol24hLabel">24h 成交额</span>
              <span id="perp-vol-24h" className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>--</span>
            </div>
            <div className="perp-mstat">
              <span className="meta-key" data-i18n="perp.oiLabel">全网持仓 (OI)</span>
              <span id="perp-oi-val" className="mono" style={{ fontSize: '11px', fontWeight: 700 }}>--</span>
            </div>
            <div className="perp-mstat" style={{ textAlign: 'right' }}>
              <span className="meta-key" data-i18n="perp.fundingRateLabel">资金费率(1h)</span>
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
            <div id="perp-candle-detail" className="perp-candle-inspect-bar mono"></div>
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
                做多
              </button>
              <button
                type="button"
                id="perp-side-short"
                className="perp-side-btn short"
                onClick={() => window.setPerpSide && window.setPerpSide('short')}
                data-i18n="perp.shortBtn"
              >
                做空
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
                  逐仓
                </button>
                <button
                  type="button"
                  id="perp-mode-cross"
                  className="mode-pill-btn"
                  onClick={() => window.setPerpMarginMode && window.setPerpMarginMode('cross')}
                  data-i18n="perp.crossBtn"
                >
                  全仓
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
                市价
              </button>
              <button
                type="button"
                id="perp-type-limit"
                className="mode-pill-btn flex-1"
                onClick={() => window.setPerpOrderType && window.setPerpOrderType('limit')}
                data-i18n="perp.limitBtn"
              >
                限价
              </button>
              <button
                type="button"
                id="perp-type-post-only"
                className="mode-pill-btn flex-1"
                onClick={() => window.setPerpOrderType && window.setPerpOrderType('post_only')}
                data-i18n="perp.postOnlyBtn"
              >
                只做Maker
              </button>
            </div>

            <div id="perp-limit-price-row" className="swap-box hidden" style={{ padding: '8px' }}>
              <div className="swap-box-top">
                <span data-i18n="perp.limitPriceLabel" style={{ fontSize: '11px' }}>委托价格</span>
                <button
                  type="button"
                  className="mini-action-btn primary"
                  onClick={() => window.fillPerpBboPrice && window.fillPerpBboPrice()}
                  data-i18n="perp.bboBtn"
                  style={{ padding: '2px 6px', fontSize: '10.5px' }}
                >
                  最优价
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
                <span data-i18n="perp.marginInputLabel" style={{ fontSize: '11px' }}>保证金 (USDC)</span>
                <span style={{ fontSize: '10.5px' }}>
                  <span data-i18n="swap.balanceLabel">可用</span>: <span id="perp-ticket-avail" className="mono">--</span>
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
                <span data-i18n="perp.reduceOnlyLabel">只减仓</span>
              </label>
              <button
                type="button"
                id="btn-perp-tpsl-toggle"
                className="perp-tpsl-toggle-btn"
                style={{ width: 'auto', padding: '3px 8px', fontSize: '11px' }}
                data-action="toggle-perp-tpsl"
                aria-expanded="false"
              >
                <span data-i18n="perp.tpslLabel">止盈/止损</span> ▾
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
                placeholder="止盈触发价"
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
                placeholder="止损触发价"
                onInput={() => window.evaluatePerpOrderUI && window.evaluatePerpOrderUI()}
              />
            </div>

            <div className="meta-list perp-meta-grid">
              <div className="meta-row perp-meta-cell">
                <span className="meta-key" data-i18n="perp.notionalLabel">名义价值</span>
                <span id="perp-meta-notional" className="meta-val">--</span>
              </div>
              <div className="meta-row perp-meta-cell">
                <span className="meta-key" data-i18n="perp.sizeLabel">委托数量</span>
                <span id="perp-meta-size" className="meta-val">--</span>
              </div>
              <div className="meta-row perp-meta-cell">
                <span className="meta-key" data-i18n="perp.liqEstLabel">预估强平价</span>
                <span id="perp-meta-liq" className="meta-val">--</span>
              </div>
              <div className="meta-row perp-meta-cell">
                <span className="meta-key" data-i18n="perp.estFeeLabel">预估手续费</span>
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
              开多
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
                <span id="perp-ob-bid-sz-hdr" data-i18n="perp.obSizeHdr">数量</span>
                <span id="perp-ob-ask-sz-hdr" data-i18n="perp.obSizeHdr" style={{ display: 'none' }}>数量</span>
                <span data-i18n="perp.obBidPx">价格 (USDC)</span>
              </div>
            </div>

            <div className="perp-ob-grid perp-ob-stacked">
              <div className="perp-ob-col" id="perp-ob-asks"></div>
              <div id="perp-ob-mid-badge" className="perp-ob-mid-badge mono">--</div>
              <div className="perp-ob-col" id="perp-ob-bids"></div>
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
                当前持仓
              </button>
              <button
                type="button"
                id="perp-tab-orders"
                className="filter-pill"
                onClick={() => window.setPerpBottomTab && window.setPerpBottomTab('orders')}
                data-i18n="perp.tabOrders"
              >
                当前委托
              </button>
              <button
                type="button"
                id="perp-tab-fills"
                className="filter-pill"
                onClick={() => window.setPerpBottomTab && window.setPerpBottomTab('fills')}
                data-i18n="perp.tabFills"
              >
                历史成交
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
          <div id="perp-bottom-list" className="flex flex-col gap-2"></div>
        </div>
      </div>
    </section>
  );
}

export function EarnView() {
  return (
    <section id="view-earn" className="view-section hidden">
      <div className="section-header-row">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost-sm"
            onClick={() => window.switchTab && window.switchTab('wallet')}
            data-i18n="common.back"
          >
            ← 返回
          </button>
          <h2 className="section-title" data-i18n="earn.title">链上流动性质押</h2>
        </div>
        <button
          type="button"
          id="btn-earn-refresh"
          className="btn-ghost-sm"
          onClick={() => window.refreshStakingMetrics && window.refreshStakingMetrics(true)}
          data-i18n="earn.refreshBtn"
        >
          刷新利率
        </button>
      </div>

      <input
        id="earn-pool-search"
        type="text"
        className="input-field"
        data-i18n-placeholder="earnSearchPlaceholder"
        placeholder="搜索质押代币、协议或合约 (如 RHEA, JUP, NEAR, SOL, USDC)..."
        onInput={(e) => window.handleEarnPoolSearch && window.handleEarnPoolSearch(e.currentTarget.value, true)}
      />

      <div id="earn-pool-filters" className="pill-scroll">
        <button type="button" className="filter-pill active" data-filter="featured" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('featured')} data-i18n="earn.filterFeatured">🔥 热门大池</button>
        <button type="button" className="filter-pill" data-filter="all" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('all')} data-i18n="earn.filterAll">全部质押池</button>
        <button type="button" className="filter-pill" data-filter="lending" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('lending')} data-i18n="earn.filterLending">🏦 借贷与生息</button>
        <button type="button" className="filter-pill" data-filter="near" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('near')} data-i18n="earn.filterNear">NEAR &amp; Rhea</button>
        <button type="button" className="filter-pill" data-filter="sol" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('sol')} data-i18n="earn.filterSol">Solana &amp; JUP</button>
        <button type="button" className="filter-pill" data-filter="evm" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('evm')} data-i18n="earn.filterEvm">EVM &amp; Arc</button>
      </div>

      <div id="earn-my-positions-card" className="ios-glass-card hidden flex flex-col gap-2" style={{ marginBottom: '10px' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontWeight: 700, fontSize: '13.5px' }} data-i18n="earn.myPositionsTitle">我的质押仓位</span>
          <span id="earn-my-positions-count" className="ca-badge">0</span>
        </div>
        <div id="earn-my-positions-list" className="flex flex-col gap-2"></div>
      </div>

      <div id="staking-pools-list" className="staking-pools-grid"></div>
    </section>
  );
}

export function HubView() {
  return (
    <section id="view-hub" className="view-section hidden">
      {/* Identity Hero Card */}
      <div className="ios-glass-card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div id="hub-identity-name" style={{ fontWeight: 800, fontSize: '16px', color: '#ffffff' }}>Nexus Wallet</div>
            <div
              id="hub-identity-near-id"
              className="mono text-emerald"
              style={{ fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              --
            </div>
          </div>
          <span id="hub-near-status-badge" className="badge badge-cyan">--</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => window.openWalletSwitcherSheet && window.openWalletSwitcherSheet()}
            data-i18n="hub.manageWalletsBtn"
          >
            切换 / 新增钱包
          </button>
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => window.openBackupKeysSheet && window.openBackupKeysSheet()}
            data-i18n="hub.backupKeysBtn"
          >
            导出助记词与主密钥
          </button>
        </div>
      </div>

      {/* Group 1: Account & Web3 */}
      <div className="hub-menu-group">
        <button
          type="button"
          id="hub-dapp-browser-btn"
          className="hub-menu-row"
          onClick={() => window.openDAppBrowserSheet && window.openDAppBrowserSheet()}
        >
          <span className="hub-menu-icon">🌐</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.dappMenuTitle">DApp 浏览器</span>
            <span className="hub-menu-sub" data-i18n="hub.dappMenuSub">内置多链浏览器 · EVM / Solana / NEAR</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openNearAccountSheet && window.openNearAccountSheet()}>
          <span className="hub-menu-icon">🪪</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.nearAcctMenuTitle">NEAR 账户与密钥</span>
            <span id="hub-near-menu-sub" className="hub-menu-sub" data-i18n="hub.nearAcctMenuSub">注册 .near / 链上密钥管理</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openWalletAddressesSheet && window.openWalletAddressesSheet()}>
          <span className="hub-menu-icon">◈</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.addrMenuTitle">多链收款地址</span>
            <span className="hub-menu-sub" data-i18n="hub.addrMenuSub">查看并复制全链主地址</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openWalletConnectSheet && window.openWalletConnectSheet()}>
          <span className="hub-menu-icon">🔗</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.wcTitle">WalletConnect v2 授权</span>
          </span>
          <span className="hub-menu-right">
            <span id="hub-wc-count-badge" className="ca-badge hidden">0</span>
            <span>›</span>
          </span>
        </button>
      </div>

      {/* Group 2: On-Chain Tools */}
      <div className="hub-menu-group">
        <button type="button" className="hub-menu-row" onClick={() => window.openMiningProSheet && window.openMiningProSheet()}>
          <span className="hub-menu-icon">⛏️</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.miningMenuTitle">Pearl 矿工监控</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openContactsSheet && window.openContactsSheet()}>
          <span className="hub-menu-icon">📒</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.contactsTitle">常用地址簿</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openSolRentReclaimSheet && window.openSolRentReclaimSheet()}>
          <span className="hub-menu-icon">🧹</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.solRentTitle">Solana 租金回收与粉尘粉碎</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openNearStorageReclaimSheet && window.openNearStorageReclaimSheet()}>
          <span className="hub-menu-icon">📦</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.nearStorageTitle">NEAR 存储押金回收</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
      </div>

      {/* Group 3: Security & Preferences */}
      <div className="hub-menu-group">
        <button
          type="button"
          id="hub-security-bio-card"
          className="hub-menu-row"
          onClick={() => window.testBiometricAuthNow && window.testBiometricAuthNow()}
        >
          <span className="hub-menu-icon">🔐</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.bioCardTitle">安全验证</span>
          </span>
          <span className="hub-menu-right">
            <span id="hub-bio-status-badge" className="ca-badge">--</span>
            <span>›</span>
          </span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.toggleLanguage && window.toggleLanguage()}>
          <span className="hub-menu-icon">🌐</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.langTitle">语言偏好</span>
          </span>
          <span className="hub-menu-right">
            <span id="hub-lang-current-pill" className="ca-badge" data-i18n="hub.langCurrent">中文</span>
            <span>›</span>
          </span>
        </button>
      </div>
    </section>
  );
}
