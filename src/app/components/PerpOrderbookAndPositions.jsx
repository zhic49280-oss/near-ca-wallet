import { h } from 'preact';

export function PerpOrderbookSidePanel({ rows = [], side = 'bid', maxSz = 0, fmtObSz, formatPerpPx }) {
  return (
    <div className="flex flex-col">
      {rows.map((r, idx) => {
        const pct = maxSz > 0 ? Math.max(6, (r.sz / maxSz) * 100) : 0;
        return (
          <button
            key={`${side}_${idx}`}
            type="button"
            className={`perp-ob-row ${side}`}
            data-action="fill-perp-ob-px"
            data-px={String(r.px)}
          >
            <div className="perp-ob-row-depth" style={{ width: `${pct.toFixed(0)}%` }} />
            <span>{typeof fmtObSz === 'function' ? fmtObSz(r.sz) : String(r.sz)}</span>
            <span className="perp-ob-px">{typeof formatPerpPx === 'function' ? formatPerpPx(r.px) : String(r.px)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PerpBottomListPanel({ items = [], tab = 'positions', emptyText = '', isEn = false, formatPerpPx }) {
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
        {emptyText || '--'}
      </div>
    );
  }
  const fmtPx = (v) => (typeof formatPerpPx === 'function' ? formatPerpPx(v) : String(v ?? '--'));

  return (
    <div className="flex flex-col gap-2">
      {items.map((item, idx) => {
        if (tab === 'positions') {
          const pnl = Number(item.unrealizedPnl || 0);
          const pnlCls = pnl >= 0 ? 'text-mint' : 'text-rose';
          const liq = item.liquidationPx || item.liqPx;
          return (
            <div key={item.coin || idx} className="perp-pos-card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <strong style={{ fontSize: '13px' }}>{item.pair || item.coin}</strong>
                  <span className={`ca-badge ${item.isLong ? 'badge-emerald' : 'badge-rose'}`}>
                    {item.isLong ? (isEn ? 'Long' : '做多') : (isEn ? 'Short' : '做空')} {Math.round(Number(item.leverageValue || 1))}x
                  </span>
                </div>
                <span className={`mono ${pnlCls}`} style={{ fontSize: '12.5px', fontWeight: 700 }}>
                  {`${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`}
                </span>
              </div>
              <div className="flex items-center justify-between" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span>{`${isEn ? 'Size' : '仓位'}: ${item.absSize}`}</span>
                <span>{`${isEn ? 'Entry' : '开仓价'}: $${fmtPx(item.entryPx)}`}</span>
                <span>{`${isEn ? 'Liq' : '强平价'}: ${liq ? `$${fmtPx(liq)}` : '--'}`}</span>
              </div>
              <div className="flex gap-2" style={{ marginTop: '6px' }}>
                <button type="button" className="mini-action-btn" data-action="open-perp-pos-tpsl" data-coin={item.coin}>{isEn ? 'TP/SL' : '止盈/止损'}</button>
                <button type="button" className="mini-action-btn" data-action="reverse-perp-pos" data-coin={item.coin}>{isEn ? 'Reverse' : '反手'}</button>
                <button type="button" className="mini-action-btn primary" data-action="close-perp-pos" data-coin={item.coin}>{isEn ? 'Close' : '市价平仓'}</button>
              </div>
            </div>
          );
        }
        if (tab === 'orders') {
          const isBuy = item.side === 'B';
          return (
            <div key={item.oid || idx} className="perp-pos-card">
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontSize: '12.5px', fontWeight: 700 }}>
                  {`${item.pair || item.coin} · ${isBuy ? (isEn ? 'Buy' : '买入') : (isEn ? 'Sell' : '卖出')}`}
                </span>
                <button type="button" className="mini-action-btn" data-action="cancel-perp-order" data-coin={item.coin} data-oid={String(item.oid)}>
                  {isEn ? 'Cancel' : '撤单'}
                </button>
              </div>
              <div className="flex items-center justify-between mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span>{`${isEn ? 'Price' : '价格'}: $${fmtPx(item.limitPx)}`}</span>
                <span>{`${isEn ? 'Size' : '数量'}: ${item.sz}`}</span>
              </div>
            </div>
          );
        }
        return (
          <div key={item.tid || idx} className="perp-pos-card">
            <div className="flex items-center justify-between gap-2">
              <span style={{ fontSize: '12px', fontWeight: 700 }}>{item.pair || item.coin}</span>
              <span className="mono" style={{ fontSize: '11.5px' }}>{`$${fmtPx(item.px)} × ${item.sz}`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

