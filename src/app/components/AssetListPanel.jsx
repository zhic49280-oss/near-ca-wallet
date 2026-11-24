import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
import { TokenIconBadge } from './TokenIconBadge.jsx';

function AssetGroupCard({ g, expandedSymbol, formatBal, formatTokenPrice, formatUsd, isEn, getChainName }) {
  const isExpanded = expandedSymbol === g.symbolKey;
  const priceText = g.price !== null && g.price !== undefined ? formatTokenPrice(g.price) : '--';
  const totalAmtText = formatBal(g.totalBalance, 5);
  const totalUsdText = g.totalUsd !== null && g.totalUsd !== undefined ? formatUsd(g.totalUsd) : '--';

  return (
    <div className={`asset-group-card ${isExpanded ? 'expanded' : ''}`}>
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
      {isExpanded && Array.isArray(g.entries) && (
        <div className="asset-drawer">
          {g.entries.map((e, i) => {
            const cleanNet = getChainName ? getChainName(e) : (e.networkName || e.blockchain);
            const balStr = formatBal(e.balance, 6);
            return (
              <div key={e.assetId || `${e.blockchain}_${i}`} className="asset-sub-row">
                <div className="asset-sub-info">
                  <TokenIconBadge
                    symbol={e.token?.symbol || g.symbol}
                    blockchain={e.blockchain}
                    logoURI={e.token?.logoURI || ''}
                    contractAddress={e.contractAddress || ''}
                    size={28}
                    showChainBadge={true}
                  />
                  <div className="asset-sub-meta">
                    <span className="asset-sub-name">{cleanNet}</span>
                  </div>
                </div>
                <div className="asset-sub-right">
                  <span className="asset-sub-bal">{`${balStr} ${g.symbol}`}</span>
                  <div className="asset-sub-actions">
                    <button
                      type="button"
                      className="mini-action-btn primary"
                      data-action="quick-swap"
                      data-stop="1"
                      data-asset-id={e.assetId}
                      data-chain={e.blockchain}
                      data-contract={e.contractAddress || ''}
                    >
                      {isEn ? 'Swap' : '闪兑'}
                    </button>
                    <button
                      type="button"
                      className="mini-action-btn"
                      data-action="quick-send"
                      data-stop="1"
                      data-symbol={g.symbol}
                      data-chain={e.blockchain}
                      data-asset-id={e.assetId}
                      data-contract={e.contractAddress || ''}
                    >
                      {isEn ? 'Send' : '转账'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function AssetListPanel({
  mainGroups = [],
  dustGroups = [],
  dustTotalUsd = 0,
  showDust = false,
  expandedSymbol = '',
  formatBal,
  formatTokenPrice,
  formatUsd,
  getChainName,
  isEn
}) {
  useWalletState(['assets', 'lang']);
  return (
    <div className="flex flex-col gap-2">
      {mainGroups.map((g, idx) => (
        <AssetGroupCard
          key={g.symbolKey || g.symbol || idx}
          g={g}
          expandedSymbol={expandedSymbol}
          formatBal={formatBal}
          formatTokenPrice={formatTokenPrice}
          formatUsd={formatUsd}
          getChainName={getChainName}
          isEn={isEn}
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
                  expandedSymbol={expandedSymbol}
                  formatBal={formatBal}
                  formatTokenPrice={formatTokenPrice}
                  formatUsd={formatUsd}
                  getChainName={getChainName}
                  isEn={isEn}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
