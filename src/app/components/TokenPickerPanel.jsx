import { h } from 'preact';
import { TokenIconBadge } from './TokenIconBadge.jsx';
import { useLang } from '../store/useWalletStore.js';

export function TokenPickerPanel({
  rows = [],
  emptyText = '',
  favSet = new Set(),
  showFavoriteBtn = true,
  useContractAsAssetId = false,
  formatBal,
  formatTokenPrice,
  getSymbolPrice
}) {
  useLang();
  if (!Array.isArray(rows) || rows.length === 0) {
    return emptyText ? (
      <div className="text-muted" style={{ textAlign: 'center', padding: '16px', fontSize: '12px' }}>
        {emptyText}
      </div>
    ) : null;
  }
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, idx) => {
        const tok = row && row.tok ? row.tok : row;
        const bal = row ? row.bal : null;
        const key = (tok && (tok.assetId || tok.contractAddress || `${tok.blockchain}_${tok.symbol}`)) || idx;
        const selectId = useContractAsAssetId ? (tok.contractAddress || tok.assetId) : tok.assetId;
        const liveP = (typeof tok.price === 'number' && tok.price > 0)
          ? tok.price
          : (typeof getSymbolPrice === 'function' ? getSymbolPrice(tok.symbol) : null);
        const priceText = typeof formatTokenPrice === 'function' ? formatTokenPrice(liveP) : '--';
        const isFav = showFavoriteBtn && favSet && typeof favSet.has === 'function' && favSet.has(String(tok.assetId || '').toLowerCase());
        return (
          <div
            key={key}
            className="asset-sub-row"
            role="button"
            tabIndex={0}
            style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }}
            data-action="select-swap-token"
            data-asset-id={selectId}
          >
            <div className="asset-sub-info">
              <TokenIconBadge
                symbol={tok.symbol}
                blockchain={tok.blockchain}
                logoURI={tok.logoURI || ''}
                contractAddress={tok.contractAddress || ''}
                size={32}
                showChainBadge={true}
              />
              <div className="asset-sub-meta">
                <span className="asset-sub-name">{`${tok.symbol} · ${tok.networkName || tok.blockchain}`}</span>
                <span className="asset-sub-tag">{tok.name || ''}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="asset-sub-right">
                <span className="asset-sub-bal">{typeof formatBal === 'function' ? formatBal(bal, 5) : '--'}</span>
                <span className="asset-sub-tag">{priceText}</span>
              </div>
              {showFavoriteBtn && (
                <button
                  type="button"
                  style={{
                    color: isFav ? '#F59E0B' : 'var(--text-muted)',
                    fontSize: '16px',
                    minWidth: '40px',
                    minHeight: '40px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '4px 6px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    lineHeight: 1
                  }}
                  data-action="toggle-fav-token"
                  data-stop="1"
                  data-asset-id={tok.assetId}
                  aria-label="Favorite"
                >
                  {isFav ? '★' : '☆'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
