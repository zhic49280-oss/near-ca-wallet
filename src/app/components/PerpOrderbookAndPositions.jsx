import { h } from 'preact';
import { useLang } from '../store/useWalletStore.js';

export function PerpOrderbookSidePanel({ rows = [], side = 'bid', maxSz = 0, fmtObSz, formatPerpPx }) {
  return (
    <div className="flex flex-col">
      {rows.map((r, idx) => {
        const pct = maxSz > 0 ? Math.max(6, (r.sz / maxSz) * 100) : 0;
        return (
          <button
            key={idx}
            type="button"
            className={`perp-ob-row ${side}`}
            data-action="fill-perp-ob-px"
            data-px={String(r.px)}
          >
            <div className="perp-ob-row-depth" style={{ transform: `scaleX(${(pct / 100).toFixed(3)})` }} />
            <span className="perp-ob-px">{typeof formatPerpPx === 'function' ? formatPerpPx(r.px) : String(r.px)}</span>
            <span className="perp-ob-sz">{typeof fmtObSz === 'function' ? fmtObSz(r.sz) : String(r.sz)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PerpBottomListPanel({ items = [], tab = 'positions', emptyText = '', isEn: isEnProp, formatPerpPx, busyKey = '' }) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  if (!Array.isArray(items) || items.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '14px 0' }}>
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
          const pnlCls = pnl >= 0 ? 'text-emerald' : 'text-rose';
          const pnlStr = `${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;
          const dirText = item.isLong ? (isEn ? 'Long' : '做多') : (isEn ? 'Short' : '做空');
          const modeText = item.leverageType === 'cross' ? (isEn ? 'Cross' : '全仓') : (isEn ? 'Isolated' : '逐仓');
          const roeNum = item.returnOnEquity !== null && item.returnOnEquity !== undefined && Number.isFinite(Number(item.returnOnEquity))
            ? Number(item.returnOnEquity)
            : null;
          const roeStr = roeNum !== null
            ? `${roeNum >= 0 ? '+' : ''}${(roeNum * 100).toFixed(2)}%`
            : '--';
          const roeCls = roeNum !== null ? (roeNum >= 0 ? 'text-emerald' : 'text-rose') : '';
          const fundingNum = item.cumFunding !== null && item.cumFunding !== undefined && Number.isFinite(Number(item.cumFunding))
            ? Number(item.cumFunding)
            : null;
          const fundingStr = fundingNum !== null
            ? `${fundingNum >= 0 ? '+' : '-'}$${Math.abs(fundingNum).toFixed(2)}`
            : '--';
          const liq = item.liquidationPx || item.liqPx;
          const markStr = item.markPx ? `$${fmtPx(item.markPx)}` : '--';
          const marginText = item.marginUsed !== null && item.marginUsed !== undefined && Number.isFinite(Number(item.marginUsed))
            ? `$${Number(item.marginUsed).toFixed(2)}`
            : '--';
          const tpslSummary = (item.tpTriggerPx || item.slTriggerPx)
            ? `${isEn ? 'TP' : '止盈'}: ${item.tpTriggerPx ? '$' + fmtPx(item.tpTriggerPx) : '--'} / ${isEn ? 'SL' : '止损'}: ${item.slTriggerPx ? '$' + fmtPx(item.slTriggerPx) : '--'}`
            : (isEn ? 'TP/SL: Not set' : '止盈/止损: 未设置');

          const isReversing = busyKey === `reverse:${item.coin}`;
          const isClosing = busyKey === `close:${item.coin}` || busyKey === 'batch';
          const isAnyPosBusy = isReversing || isClosing;
          return (
            <div key={item.coin || idx} className="perp-pos-card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '13.5px' }}>{item.pair || item.coin}</strong>
                  <span className={`ca-badge ${item.isLong ? 'badge-emerald' : 'badge-rose'}`}>
                    {`${dirText} ${item.leverageValue ? Math.round(Number(item.leverageValue)) : '--'}x`}
                  </span>
                  <span className="perp-dex-pill">{modeText}</span>
                </div>
              </div>
              <div className="perp-pos-pnl-row">
                <div>
                  <div className="meta-key">{isEn ? 'Unrealized PnL (USDC)' : '未实现盈亏 (USDC)'}</div>
                  <div className={`perp-pos-pnl-val mono ${pnlCls}`}>{pnlStr}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="meta-key">{isEn ? 'ROE' : '收益率'}</div>
                  <div className={`perp-pos-pnl-val mono ${roeCls}`}>{roeStr}</div>
                </div>
              </div>
              <div className="perp-pos-metrics-grid" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                <div>
                  <div className="meta-key">{isEn ? 'Size' : '持仓数量'}</div>
                  <strong className="mono">{String(item.absSize ?? '--')}</strong>
                </div>
                <div>
                  <div className="meta-key">{isEn ? 'Margin (USDC)' : '保证金 (USDC)'}</div>
                  <strong className="mono">{marginText}</strong>
                </div>
                <div>
                  <div className="meta-key">{isEn ? 'Funding' : '资金费用'}</div>
                  <strong className="mono">{fundingStr}</strong>
                </div>
                <div>
                  <div className="meta-key">{isEn ? 'Entry' : '开仓均价'}</div>
                  <span className="mono">{item.entryPx ? `$${fmtPx(item.entryPx)}` : '--'}</span>
                </div>
                <div>
                  <div className="meta-key">{isEn ? 'Mark' : '标记价格'}</div>
                  <span className="mono">{markStr}</span>
                </div>
                <div>
                  <div className="meta-key">{isEn ? 'Est. Liq.' : '预估强平价'}</div>
                  <strong className="mono text-rose">{liq ? `$${fmtPx(liq)}` : '--'}</strong>
                </div>
              </div>
              <div className="perp-pos-tpsl-summary mono">{tpslSummary}</div>
              <div className="flex items-center gap-2" style={{ marginTop: '2px' }}>
                <button type="button" className="mini-action-btn flex-1" data-action="reverse-perp-pos" data-coin={item.coin} disabled={isAnyPosBusy}>
                  {isReversing ? (isEn ? 'Reversing...' : '反手中...') : (isEn ? 'Reverse' : '反手')}
                </button>
                <button type="button" className="mini-action-btn flex-1" data-action="open-perp-pos-tpsl" data-coin={item.coin} disabled={isAnyPosBusy}>
                  {isEn ? 'TP / SL' : '止盈/止损'}
                </button>
                <button type="button" className="mini-action-btn primary flex-1" data-action="close-perp-pos" data-coin={item.coin} disabled={isAnyPosBusy}>
                  {isClosing ? (isEn ? 'Closing...' : '平仓中...') : (isEn ? 'Close' : '市价平仓')}
                </button>
              </div>
            </div>
          );
        }

        if (tab === 'orders') {
          const isBuy = String(item.side || '').toUpperCase() === 'B';
          const isTrigger = Boolean(item.isTrigger || /Take Profit|Stop/i.test(String(item.orderType || '')));
          const tagText = isTrigger ? (item.orderType || (isEn ? 'TP/SL Trigger' : '条件止盈损')) : (isEn ? 'Limit' : '限价委托');
          const pxLabel = isTrigger ? (isEn ? 'Trigger' : '触发价') : (isEn ? 'Price' : '委托价');
          const pxShow = isTrigger ? (item.triggerPx || item.limitPx || '--') : (item.limitPx || '--');

          const isCancelling = busyKey === `cancel:${item.coin}:${item.oid}` || busyKey === 'batch';
          return (
            <div key={item.oid || idx} className="perp-pos-card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
                  <strong>{item.pair || item.coin}</strong>
                  <span className="ca-badge">{isBuy ? (isEn ? 'Buy' : '买入') : (isEn ? 'Sell' : '卖出')}</span>
                  <span className="perp-dex-pill">{tagText}</span>
                </div>
                <div className="flex items-center gap-1">
                  {isTrigger && (
                    <button type="button" className="mini-action-btn" data-action="open-perp-pos-tpsl" data-coin={String(item.coin || '')} disabled={isCancelling}>
                      {isEn ? 'Modify' : '修改'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="mini-action-btn"
                    data-action="cancel-perp-order"
                    data-coin={String(item.coin || '')}
                    data-oid={String(item.oid || '')}
                    disabled={isCancelling}
                  >
                    {isCancelling ? (isEn ? 'Cancelling...' : '撤单中...') : (isEn ? 'Cancel' : '撤单')}
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span>
                  {`${pxLabel}: `}
                  <span className="mono">{`$${fmtPx(pxShow)}`}</span>
                </span>
                <span>
                  {`${isEn ? 'Size' : '数量'}: `}
                  <span className="mono">{String(item.sz || '--')}</span>
                </span>
              </div>
            </div>
          );
        }

        const isBuy = String(item.side || '').toUpperCase() === 'B';
        const pnl = Number(item.closedPnl || 0);
        const feeNum = item.fee !== undefined ? Number(item.fee) : null;
        return (
          <div key={item.tid || `${item.coin}_${item.time || idx}`} className="perp-pos-card" style={{ padding: '8px 10px' }}>
            <div className="flex items-center justify-between" style={{ fontSize: '12px' }}>
              <span>
                <strong>{item.pair || item.coin}</strong>
                {` · ${isBuy ? (isEn ? 'Buy' : '买入') : (isEn ? 'Sell' : '卖出')} ${String(item.sz || '')} @ $${fmtPx(item.px)}`}
              </span>
              <span className={`mono ${pnl >= 0 ? 'text-emerald' : 'text-rose'}`}>
                {pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)}` : '--'}
              </span>
            </div>
            {Number.isFinite(feeNum) && (
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {`${isEn ? 'Fee' : '手续费'}: `}
                <span className="mono">{`$${feeNum.toFixed(4)} USDC`}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PerpOverviewPositionsPanel({ positions = [], onSelectCoin, isEn: isEnProp }) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  const list = Array.isArray(positions) ? positions : [];
  if (list.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {list.map((pos, idx) => {
        const coin = String(pos.coin || '');
        const dirText = pos.isLong ? (isEn ? 'Long' : '做多') : (isEn ? 'Short' : '做空');
        const levText = pos.leverage ? `${pos.leverage}x` : '--';
        return (
          <div
            key={coin || idx}
            className="perp-pos-card"
            role="button"
            tabIndex={0}
            data-action="open-perp-trade"
            data-coin={coin}
            onClick={() => {
              if (typeof onSelectCoin === 'function' && coin) onSelectCoin(coin);
            }}
            style={{ cursor: 'pointer' }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '13px' }}>{coin}</strong>
                <span className={`ca-badge ${pos.isLong ? 'badge-emerald' : 'badge-rose'}`}>
                  {`${dirText} ${levText}`}
                </span>
              </div>
              <span className="mono" style={{ fontSize: '12.5px', fontWeight: 800, color: pos.pnlColor || '#f8fafc' }}>
                {pos.pnlDisplay || '--'}
              </span>
            </div>
            <div className="perp-pos-metrics-grid" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              <div>
                <div className="meta-key">{isEn ? 'Size' : '持仓'}</div>
                <strong className="mono">{pos.sizeDisplay || '--'}</strong>
              </div>
              <div>
                <div className="meta-key">{isEn ? 'Entry' : '开仓价'}</div>
                <span className="mono">{pos.entryDisplay || '--'}</span>
              </div>
              <div>
                <div className="meta-key">{isEn ? 'Liq.' : '强平价'}</div>
                <span className="mono text-rose">{pos.liqDisplay || '--'}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
