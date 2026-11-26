import { h } from 'preact';

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
