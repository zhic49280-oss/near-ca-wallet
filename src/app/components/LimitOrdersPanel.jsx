import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
import { TokenIconBadge } from './TokenIconBadge.jsx';

function defaultFormatBal(val, dp = 4) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '--';
  return Number(n.toFixed(dp)).toString();
}

function defaultFromBaseUnits(raw, decimals = 18) {
  const s = String(raw || '0').trim();
  if (!/^\d+$/.test(s)) return '0';
  const d = Math.max(0, Number(decimals) || 0);
  if (d === 0) return s;
  const padded = s.padStart(d + 1, '0');
  const intPart = padded.slice(0, -d);
  const fracPart = padded.slice(-d).replace(/0+$/, '');
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function findTokenMeta(tokenList, addr) {
  const low = String(addr || '').toLowerCase();
  const list = Array.isArray(tokenList) ? tokenList : [];
  return list.find((tk) => String(tk.contractAddress || '').toLowerCase() === low) || {
    symbol: String(addr || '').slice(0, 6) || '--',
    decimals: 18,
    contractAddress: addr || ''
  };
}

function formatStatusLabel(status, isHistory, isEn) {
  const raw = String(status || '').trim();
  const low = raw.toLowerCase();
  if (!raw) return isHistory ? (isEn ? 'Done' : '已结束') : (isEn ? 'Open' : '挂单中');
  if (low === 'open' || low === 'presignaturepending') return isEn ? 'Open' : '挂单中';
  if (low === 'fulfilled') return isEn ? 'Filled' : '已成交';
  if (low === 'cancelled' || low === 'canceled') return isEn ? 'Cancelled' : '已撤单';
  if (low === 'expired') return isEn ? 'Expired' : '已过期';
  return raw;
}

export function LimitOrdersPanel({
  chain = 'near',
  isHistory = false,
  items = [],
  tokenList = [],
  rateLimited = false,
  ordersLoading = false,
  cancellingOrderId = '',
  claimingOrderId = '',
  isEn: isEnProp,
  formatBal = defaultFormatBal,
  fromBaseUnits = defaultFromBaseUnits,
  dclPointToPrice
}) {
  const st = useWalletState(['limit', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');
  const list = Array.isArray(items) ? items.slice(0, 20) : [];
  const anyActionInFlight = Boolean(claimingOrderId || cancellingOrderId);

  if (ordersLoading && list.length === 0) {
    return (
      <div className="text-center" style={{ padding: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {isEn ? 'Loading limit orders...' : '正在加载限价单...'}
      </div>
    );
  }

  if (rateLimited && list.length === 0) {
    const rateLimitText = chain === 'bsc'
      ? (isEn ? 'BSC limit order service rate limited; refresh shortly' : 'BSC 限价单服务当前请求频繁，请稍后刷新')
      : (isEn ? 'Limit order service rate limited; refresh shortly' : '限价单服务请求频繁，请稍后刷新');
    return (
      <div className="text-center" style={{ padding: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {rateLimitText}
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="text-center" style={{ padding: '14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        {isHistory
          ? (isEn ? 'No order history' : '暂无历史挂单')
          : (isEn ? 'No active limit orders' : '暂无进行中的限价单')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {list.map((o, idx) => {
        if (chain === 'near') {
          const sellMeta = findTokenMeta(tokenList, o.sell_token);
          const buyMeta = findTokenMeta(tokenList, o.buy_token);
          const orig = Number(fromBaseUnits(o.original_amount || o.original_deposit_amount || '0', sellMeta.decimals));
          const rem = Number(fromBaseUnits(o.remain_amount || '0', sellMeta.decimals));
          const unclaimed = Number(fromBaseUnits(o.unclaimed_amount || '0', buyMeta.decimals));
          const bought = Number(fromBaseUnits(o.bought_amount || '0', buyMeta.decimals));
          const pct = orig > 0 ? Math.min(100, Math.max(0, ((orig - rem) / orig) * 100)) : 0;
          let priceTxt = '--';
          if (typeof dclPointToPrice === 'function') {
            try {
              const px = dclPointToPrice({
                point: o.point,
                sellToken: o.sell_token,
                poolId: o.pool_id,
                sellDecimals: sellMeta.decimals,
                buyDecimals: buyMeta.decimals
              });
              if (Number.isFinite(px) && px > 0) {
                priceTxt = `1 ${sellMeta.symbol} = ${formatBal(px, 4)} ${buyMeta.symbol}`;
              }
            } catch (_) {}
          }
          let hasRemain = false;
          try {
            hasRemain = BigInt(String(o.remain_amount || '0')) > 0n;
          } catch (_) {
            hasRemain = Number(o.remain_amount || 0) > 0;
          }
          const orderId = String(o.order_id || '');
          const isClaiming = Boolean(claimingOrderId && claimingOrderId === orderId);
          const isCancelling = Boolean(cancellingOrderId && cancellingOrderId === orderId);

          return (
            <div key={orderId || idx} className="limit-order-card-item">
              <div className="flex items-center justify-between gap-2" style={{ minWidth: 0 }}>
                <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                  <TokenIconBadge symbol={sellMeta.symbol} blockchain="near" logoURI={sellMeta.logoURI || ''} contractAddress={sellMeta.contractAddress || ''} size={20} showChainBadge={false} />
                  <TokenIconBadge symbol={buyMeta.symbol} blockchain="near" logoURI={buyMeta.logoURI || ''} contractAddress={buyMeta.contractAddress || ''} size={20} showChainBadge={false} />
                  <span style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sellMeta.symbol} ➔ {buyMeta.symbol}
                  </span>
                </div>
                <span className="badge badge-emerald mono" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{priceTxt}</span>
              </div>
              <div className="limit-progress-track">
                <div className="limit-progress-fill" style={{ width: `${pct.toFixed(1)}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>{isEn ? 'Filled' : '进度'}: {pct.toFixed(1)}% ({formatBal(orig - rem, 4)} / {formatBal(orig, 4)})</span>
                <span>{isEn ? 'Got' : '已得'}: {formatBal(unclaimed > 0 ? unclaimed : bought, 4)} {buyMeta.symbol}</span>
              </div>
              {!isHistory && (unclaimed > 0 || hasRemain) && (
                <div className="flex gap-2" style={{ marginTop: '2px' }}>
                  {unclaimed > 0 && (
                    <button
                      type="button"
                      className="mini-action-btn primary"
                      disabled={isClaiming || anyActionInFlight}
                      data-action="claim-limit-order"
                      data-order-id={orderId}
                      data-buy-token={o.buy_token || ''}
                    >
                      {isClaiming ? (isEn ? 'Claiming...' : '领取中...') : `${isEn ? 'Claim' : '领取'} ${formatBal(unclaimed, 4)}`}
                    </button>
                  )}
                  {hasRemain && (
                    <button
                      type="button"
                      className="mini-action-btn"
                      disabled={isCancelling || anyActionInFlight}
                      data-action="cancel-limit-order"
                      data-chain="near"
                      data-order-id={orderId}
                      data-remain={String(o.remain_amount || '0')}
                      data-sell-token={o.sell_token || ''}
                      data-buy-token={o.buy_token || ''}
                    >
                      {isCancelling ? (isEn ? 'Cancelling...' : '撤单中...') : (isEn ? 'Cancel' : '撤单')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        }

        if (chain === 'sol') {
          const sellMeta = findTokenMeta(tokenList, o.inputMint);
          const buyMeta = findTokenMeta(tokenList, o.outputMint);
          const make = Number(fromBaseUnits(o.makingAmount || '0', sellMeta.decimals));
          const rem = Number(fromBaseUnits(o.remainingMakingAmount || '0', sellMeta.decimals));
          const take = Number(fromBaseUnits(o.takingAmount || '0', buyMeta.decimals));
          const pct = make > 0 ? Math.min(100, Math.max(0, ((make - rem) / make) * 100)) : 0;
          const rateTxt = make > 0 && take > 0 ? `1 ${sellMeta.symbol} = ${formatBal(take / make, 4)} ${buyMeta.symbol}` : '--';
          const orderKey = String(o.orderKey || o.order || o.publicKey || '');
          const isCancelling = Boolean(cancellingOrderId && cancellingOrderId === orderKey);

          return (
            <div key={orderKey || idx} className="limit-order-card-item">
              <div className="flex items-center justify-between gap-2" style={{ minWidth: 0 }}>
                <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                  <TokenIconBadge symbol={sellMeta.symbol} blockchain="sol" logoURI={sellMeta.logoURI || ''} contractAddress={sellMeta.contractAddress || ''} size={20} showChainBadge={false} />
                  <TokenIconBadge symbol={buyMeta.symbol} blockchain="sol" logoURI={buyMeta.logoURI || ''} contractAddress={buyMeta.contractAddress || ''} size={20} showChainBadge={false} />
                  <span style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sellMeta.symbol} ➔ {buyMeta.symbol}
                  </span>
                </div>
                <span className="badge badge-cyan mono" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{rateTxt}</span>
              </div>
              <div className="limit-progress-track">
                <div className="limit-progress-fill" style={{ width: `${pct.toFixed(1)}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span>{formatBal(make, 4)} {sellMeta.symbol} ➔ {formatBal(take, 4)} {buyMeta.symbol}</span>
                <span>{formatStatusLabel(o.status, isHistory, isEn)}</span>
              </div>
              {!isHistory && orderKey && (
                <div className="flex gap-2" style={{ marginTop: '2px' }}>
                  <button
                    type="button"
                    className="mini-action-btn"
                    disabled={isCancelling || anyActionInFlight}
                    data-action="cancel-limit-order"
                    data-chain="sol"
                    data-order-id={orderKey}
                  >
                    {isCancelling ? (isEn ? 'Cancelling...' : '撤单中...') : (isEn ? 'Cancel & Reclaim SOL' : '撤单并退租金')}
                  </button>
                </div>
              )}
            </div>
          );
        }

        const sellMeta = findTokenMeta(tokenList, o.sellToken);
        const buyMeta = findTokenMeta(tokenList, o.buyToken);
        const sellAmt = Number(fromBaseUnits(o.sellAmount || '0', sellMeta.decimals));
        const execSell = Number(fromBaseUnits(o.executedSellAmount || '0', sellMeta.decimals));
        const buyAmt = Number(fromBaseUnits(o.buyAmount || '0', buyMeta.decimals));
        const pct = sellAmt > 0 ? Math.min(100, Math.max(0, (execSell / sellAmt) * 100)) : 0;
        const rateTxt = sellAmt > 0 && buyAmt > 0 ? `1 ${sellMeta.symbol} = ${formatBal(buyAmt / sellAmt, 4)} ${buyMeta.symbol}` : '--';
        const orderUid = String(o.uid || '');
        const isCancelling = Boolean(cancellingOrderId && cancellingOrderId === orderUid);

        return (
          <div key={orderUid || idx} className="limit-order-card-item">
            <div className="flex items-center justify-between gap-2" style={{ minWidth: 0 }}>
              <div className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
                <TokenIconBadge symbol={sellMeta.symbol} blockchain={chain} logoURI={sellMeta.logoURI || ''} contractAddress={sellMeta.contractAddress || ''} size={20} showChainBadge={false} />
                <TokenIconBadge symbol={buyMeta.symbol} blockchain={chain} logoURI={buyMeta.logoURI || ''} contractAddress={buyMeta.contractAddress || ''} size={20} showChainBadge={false} />
                <span style={{ fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {sellMeta.symbol} ➔ {buyMeta.symbol}
                </span>
              </div>
              <span className="badge badge-emerald mono" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{rateTxt}</span>
            </div>
            <div className="limit-progress-track">
              <div className="limit-progress-fill" style={{ width: `${pct.toFixed(1)}%` }} />
            </div>
            <div className="flex items-center justify-between gap-2" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <span>{formatBal(sellAmt, 4)} {sellMeta.symbol} ➔ {formatBal(buyAmt, 4)} {buyMeta.symbol}</span>
              <span>{formatStatusLabel(o.status, isHistory, isEn)}</span>
            </div>
            {!isHistory && orderUid && (
              <div className="flex gap-2" style={{ marginTop: '2px' }}>
                <button
                  type="button"
                  className="mini-action-btn"
                  disabled={isCancelling || anyActionInFlight}
                  data-action="cancel-limit-order"
                  data-chain={chain}
                  data-order-id={orderUid}
                >
                  {isCancelling ? (isEn ? 'Cancelling...' : '撤单中...') : (isEn ? 'Cancel (0 Gas)' : '免费撤单')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
