import { h } from 'preact';
import { TokenIconBadge } from './TokenIconBadge.jsx';
import { useLang } from '../store/useWalletStore.js';

export function PerpOverviewPanel({ rows = [], emptyText = '', formatPerpPx, rowAction = 'open-perp-trade', selectedCoin = '' }) {
  useLang();
  if (!Array.isArray(rows) || rows.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '14px 0' }}>
        {emptyText || '--'}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((m, idx) => {
        const chg = Number(m.change24hPct);
        const isUp = Number.isFinite(chg) && chg >= 0;
        const chgPillCls = !Number.isFinite(chg) ? 'flat' : (isUp ? 'up' : 'down');
        const chgStr = Number.isFinite(chg) ? `${isUp ? '+' : ''}${chg.toFixed(2)}%` : '--';
        const px = Number(m.markPx);
        const prev = Number(m.prevDayPx);
        const delta = (typeof m.priceChange24h === 'number' && Number.isFinite(m.priceChange24h))
          ? m.priceChange24h
          : ((Number.isFinite(px) && Number.isFinite(prev) && prev > 0) ? (px - prev) : null);
        const deltaStr = delta !== null && typeof formatPerpPx === 'function'
          ? `${delta >= 0 ? '+' : '-'}$${formatPerpPx(Math.abs(delta))}`
          : '--';
        const pxText = m.markPx && typeof formatPerpPx === 'function' ? `$${formatPerpPx(m.markPx)}` : '--';
        const isSelected = Boolean(selectedCoin && m.name === selectedCoin);

        return (
          <div
            key={m.name || idx}
            className={`perp-overview-row${isSelected ? ' active' : ''}`}
            role="button"
            tabIndex={0}
            data-action={m.rowAction || rowAction}
            data-coin={m.name}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                className="btn-ghost-sm"
                data-action="toggle-perp-fav"
                data-stop="1"
                data-coin={m.name}
                style={{
                  minWidth: '40px',
                  minHeight: '40px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px 4px',
                  fontSize: '14px',
                  color: m.isFav ? '#fbbf24' : 'var(--text-muted)'
                }}
              >
                {m.isFav ? '★' : '☆'}
              </button>
              <TokenIconBadge symbol={m.name} blockchain="hype" size={30} showChainBadge={false} />
              <div className="flex flex-col min-w-0" style={{ gap: '1px' }}>
                <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '13px' }}>{m.pair || m.name}</strong>
                  <span className="ca-badge">{`${String(m.maxLeverage || 20)}x`}</span>
                  {m.dexTag ? <span className="perp-dex-pill">{m.dexTag}</span> : null}
                </div>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{m.volText || '--'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
              <div className="flex flex-col mono" style={{ textAlign: 'right', gap: '1px' }}>
                <strong style={{ fontSize: '12.5px', color: '#fff' }}>{pxText}</strong>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{deltaStr}</span>
              </div>
              <span className={`perp-chg-pill ${chgPillCls} mono`}>{chgStr}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
