import { h } from 'preact';
import { TokenIconBadge } from './TokenIconBadge.jsx';

function AssetGroupCard({ g, formatBal, formatTokenPrice, formatUsd }) {
  const priceText = g.price !== null && g.price !== undefined ? formatTokenPrice(g.price) : '--';
  const totalAmtText = formatBal(g.totalBalance, 5);
  const totalUsdText = g.totalUsd !== null && g.totalUsd !== undefined ? formatUsd(g.totalUsd) : '--';

  return (
    <div className="asset-group-card">
      <button type="button" className="asset-parent-row" data-action="open-token-detail" data-symbol={g.symbolKey}>
        <div className="asset-left">
          <TokenIconBadge
            symbol={g.symbol}
            blockchain={g.primaryToken ? g.primaryToken.blockchain : ''}
            logoURI={g.primaryToken ? g.primaryToken.logoURI : ''}
            size={38}
            showChainBadge={false}
          />
          <div className="asset-title-block">
            <div className="asset-sym-row">
              <span className="asset-symbol">{g.symbol}</span>
              <span className="asset-price">{priceText}</span>
            </div>
            <div className="network-pills-row" />
          </div>
        </div>
        <div className="asset-right">
          <span className="asset-total-amt">{totalAmtText}</span>
          <span className="asset-total-usd">{totalUsdText}</span>
        </div>
      </button>
    </div>
  );
}

export function AssetListPanel({
  mainGroups = [],
  dustGroups = [],
  dustTotalUsd = 0,
  showDust = false,
  formatBal,
  formatTokenPrice,
  formatUsd,
  isEn
}) {
  return (
    <div className="flex flex-col gap-2">
      {mainGroups.map((g, idx) => (
        <AssetGroupCard
          key={g.symbolKey || g.symbol || idx}
          g={g}
          formatBal={formatBal}
          formatTokenPrice={formatTokenPrice}
          formatUsd={formatUsd}
        />
      ))}
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
              {dustGroups.map((g, idx) => (
                <AssetGroupCard
                  key={g.symbolKey || g.symbol || idx}
                  g={g}
                  formatBal={formatBal}
                  formatTokenPrice={formatTokenPrice}
                  formatUsd={formatUsd}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
