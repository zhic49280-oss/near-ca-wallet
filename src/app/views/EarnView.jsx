import { h } from 'preact';
import { useI18n, useWalletState, usePanelProps } from '../store/useWalletStore.js';
import { PanelSlot } from '../components/PanelSlot.jsx';
import { EarnPoolsPanel } from '../components/EarnPoolsPanel.jsx';
import { EarnValidatorsPanel } from '../components/EarnStakeSheetPanel.jsx';

export function EarnView() {
  const { tr } = useI18n();
  const st = useWalletState(['earn', 'wallet', 'lang']);
  const posPanelProps = usePanelProps('earn-my-positions-list');
  const activeWallet = st && typeof st.getActiveWallet === 'function' ? st.getActiveWallet() : null;
  const fallbackCount = (st && st.earn && typeof st.earn.positionsCount === 'number')
    ? st.earn.positionsCount
    : (Array.isArray(activeWallet && activeWallet.nearStakingPositions) ? activeWallet.nearStakingPositions.length : 0);
  const positionsCount = (posPanelProps && Array.isArray(posPanelProps.items))
    ? posPanelProps.items.length
    : fallbackCount;
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
            {tr('common.back', '← 返回')}
          </button>
          <h2 className="section-title" data-i18n="earn.title">{tr('earn.title', '链上流动性质押')}</h2>
        </div>
        <button
          type="button"
          id="btn-earn-refresh"
          className="btn-ghost-sm"
          onClick={() => window.refreshStakingMetrics && window.refreshStakingMetrics(true)}
          data-i18n="earn.refreshBtn"
        >
          {tr('earn.refreshBtn', '刷新利率')}
        </button>
      </div>

      <input
        id="earn-pool-search"
        type="text"
        className="input-field"
        data-i18n-placeholder="earnSearchPlaceholder"
        placeholder={tr('earnSearchPlaceholder', '搜索质押代币、协议或合约 (如 RHEA, JUP, NEAR, SOL, USDC)...')}
        onInput={(e) => window.handleEarnPoolSearch && window.handleEarnPoolSearch(e.currentTarget.value, true)}
      />

      <div id="earn-pool-filters" className="pill-scroll">
        <button type="button" className="filter-pill active" data-filter="featured" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('featured')} data-i18n="earn.filterFeatured">{tr('earn.filterFeatured', '🔥 热门大池')}</button>
        <button type="button" className="filter-pill" data-filter="all" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('all')} data-i18n="earn.filterAll">{tr('earn.filterAll', '全部质押池')}</button>
        <button type="button" className="filter-pill" data-filter="lending" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('lending')} data-i18n="earn.filterLending">{tr('earn.filterLending', '🏦 借贷与生息')}</button>
        <button type="button" className="filter-pill" data-filter="near" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('near')} data-i18n="earn.filterNear">{tr('earn.filterNear', 'NEAR & Rhea')}</button>
        <button type="button" className="filter-pill" data-filter="sol" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('sol')} data-i18n="earn.filterSol">{tr('earn.filterSol', 'Solana & JUP')}</button>
        <button type="button" className="filter-pill" data-filter="evm" onClick={() => window.setEarnPoolFilter && window.setEarnPoolFilter('evm')} data-i18n="earn.filterEvm">{tr('earn.filterEvm', 'EVM & Arc')}</button>
      </div>

      <div id="earn-my-positions-card" className="ios-glass-card hidden flex flex-col gap-2" style={{ marginBottom: '10px' }}>
        <div className="flex items-center justify-between">
          <span style={{ fontWeight: 700, fontSize: '13.5px' }} data-i18n="earn.myPositionsTitle">{tr('earn.myPositionsTitle', '我的质押仓位')}</span>
          <span id="earn-my-positions-count" className="ca-badge">{positionsCount}</span>
        </div>
        <div id="earn-my-positions-list" className="flex flex-col gap-2">
          <PanelSlot slotId="earn-my-positions-list" component={EarnValidatorsPanel} />
        </div>
      </div>

      <div id="staking-pools-list" className="staking-pools-grid">
        <PanelSlot slotId="staking-pools-list" component={EarnPoolsPanel} />
      </div>
    </section>
  );
}
