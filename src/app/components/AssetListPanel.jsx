import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';

export function AssetListPanel({ mainGroups = [], dustGroups = [], dustTotalUsd = 0, showDust = false, renderGroupHtml, formatUsd, isEn }) {
  useWalletState(['assets', 'lang']);
  const renderCard = (g, idx) => {
    const html = typeof renderGroupHtml === 'function' ? renderGroupHtml(g) : '';
    return <div key={g.symbolKey || g.symbol || idx} dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className="flex flex-col gap-2">
      {mainGroups.map(renderCard)}
      {dustGroups.length > 0 && (
        <div key="dust-drawer" className="dust-drawer-wrap">
          <button
            type="button"
            className="dust-drawer-toggle"
            data-action="toggle-home-dust"
            aria-expanded={showDust ? 'true' : 'false'}
          >
            <span>
              {isEn
                ? `Small Balances (${dustGroups.length} · < $0.05)`
                : `小额资产 (${dustGroups.length} · < $0.05)`}
            </span>
            <span className="flex items-center gap-2 mono">
              <span>{typeof formatUsd === 'function' ? formatUsd(dustTotalUsd) : '--'}</span>
              <span>{showDust ? '▴' : '▾'}</span>
            </span>
          </button>
          {showDust && (
            <div className="dust-drawer-list">
              {dustGroups.map(renderCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
