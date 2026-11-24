import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';

function getUiHelpers() {
  return (typeof window !== 'undefined' && window.NearCAUI) || globalThis.NearCAUI || {};
}

function getTokensMod() {
  return (typeof window !== 'undefined' && window.NearCATokens) || globalThis.NearCATokens || {};
}

function formatBalShort(val, dp = 6) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '--';
  return Number(n.toFixed(dp)).toString();
}

function formatRelTime(tsSec, isEn) {
  if (!tsSec || !Number.isFinite(Number(tsSec))) return '';
  const diff = Math.floor(Date.now() / 1000) - Number(tsSec);
  if (diff < 0 || diff >= 86400) {
    try {
      return new Date(Number(tsSec) * 1000).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }
  if (diff < 60) return isEn ? 'Just now' : '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}${isEn ? 'm ago' : '分钟前'}`;
  return `${Math.floor(diff / 3600)}${isEn ? 'h ago' : '小时前'}`;
}

export function SwapHistoryPanel({ getStatusLabel }) {
  const st = useWalletState(['swap', 'lang']);
  if (!st) return null;
  const isEn = st.lang === 'en';
  const wallet = typeof st.getActiveWallet === 'function' ? st.getActiveWallet() : null;
  const items = wallet && Array.isArray(wallet.activityHistory)
    ? wallet.activityHistory.filter((x) => x && x.type === 'swap').slice(0, 15)
    : [];

  if (items.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
        {isEn ? 'No swap history yet' : '暂无闪兑记录'}
      </div>
    );
  }

  const activeOrder = st.swap && st.swap.activeOrder;
  const tokens = getTokensMod();
  const ui = getUiHelpers();

  return (
    <div className="flex flex-col gap-2">
      {items.map((it, idx) => {
        const pairLabel = it.toSymbol
          ? `${isEn ? 'Swap' : '闪兑'} ${it.symbol || ''} ➔ ${it.toSymbol}`
          : (it.title || (isEn ? 'Swap' : '闪兑'));
        const amtText = (typeof it.amount === 'number' && Number.isFinite(it.amount))
          ? `-${formatBalShort(it.amount, 6)} ${it.symbol || ''}`
          : '--';
        const chainMeta = it.chain && typeof tokens.getChainMeta === 'function' ? tokens.getChainMeta(it.chain) : null;
        const netTag = chainMeta ? chainMeta.shortName : (it.chain ? String(it.chain).toUpperCase() : '');
        const relTime = formatRelTime(it.timestamp, isEn);
        let statusText = isEn ? 'Confirmed' : '已确认';
        if (activeOrder && it.txHash && activeOrder.originTxHash === it.txHash && activeOrder.status) {
          statusText = typeof getStatusLabel === 'function'
            ? getStatusLabel(activeOrder.status)
            : String(activeOrder.status);
        }
        return (
          <button
            key={it.id || it.txHash || idx}
            type="button"
            className="tx-compact-row"
            onClick={() => {
              if (typeof ui.openTxDetailSheet === 'function') ui.openTxDetailSheet(it, '');
            }}
          >
            <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
              <span className="tx-dir-circle swap">⇄</span>
              <div className="flex flex-col" style={{ minWidth: 0, flex: 1, gap: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pairLabel}
                </span>
                <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[relTime, netTag].filter(Boolean).join(' · ')}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
              <div className="flex flex-col" style={{ textAlign: 'right', gap: '2px' }}>
                <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>{amtText}</span>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{statusText}</span>
              </div>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>›</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
