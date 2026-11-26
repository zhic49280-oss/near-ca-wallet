import { h } from 'preact';
import { useLang } from '../store/useWalletStore.js';

function defaultFormatBal(val, dp = 6) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '--';
  return Number(n.toFixed(dp)).toString();
}

function defaultFormatRelTime(tsSec, isEn) {
  if (!tsSec || !Number.isFinite(Number(tsSec))) return '';
  const diff = Math.floor(Date.now() / 1000) - Number(tsSec);
  if (diff < 0 || diff >= 86400) {
    try {
      return new Date(Number(tsSec) * 1000).toLocaleString([], {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return '';
    }
  }
  if (diff < 60) return isEn ? 'Just now' : '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}${isEn ? 'm ago' : '分钟前'}`;
  return `${Math.floor(diff / 3600)}${isEn ? 'h ago' : '小时前'}`;
}

function defaultResolveDisplayParts(it, fallbackSym, isEn) {
  const symKey = String(fallbackSym || it.symbol || '').toUpperCase();
  const fromSymUpper = String(it.symbol || symKey).toUpperCase();
  const toSymUpper = String(it.toSymbol || '').toUpperCase();
  const isSwapIn = it.type === 'swap' && symKey && toSymUpper === symKey && fromSymUpper !== symKey;
  const isSwapOut = it.type === 'swap' && !isSwapIn;
  const sign = (it.type === 'send' || it.type === 'stake' || isSwapOut)
    ? '-'
    : ((it.type === 'receive' || it.type === 'mine' || it.type === 'unstake' || isSwapIn) ? '+' : '');
  const amtColor = sign === '+'
    ? 'var(--near-emerald)'
    : (sign === '-' ? '#f8fafc' : 'var(--text-secondary)');
  const dirClass = it.type === 'failed'
    ? 'failed'
    : (sign === '-' ? (it.type === 'swap' ? 'swap' : 'send') : (sign === '+' ? 'receive' : 'swap'));
  const dirGlyph = it.type === 'failed' ? '✕' : (it.type === 'swap' ? '⇄' : (sign === '-' ? '↑' : (sign === '+' ? '↓' : '⇄')));
  const labelMap = isEn
    ? { receive: 'Receive', send: 'Send', swap: 'Swap', stake: 'Stake', unstake: 'Unstake', mine: 'Mining Payout', tx: 'Activity', failed: 'Failed' }
    : { receive: '接收', send: '发送', swap: '闪兑', stake: '质押', unstake: '解质押', mine: '挖矿收款', tx: '链上交互', failed: '交易失败' };
  const label = labelMap[it.type] || labelMap.tx;
  const pairLabel = it.type === 'swap' && toSymUpper ? `${fromSymUpper} ➔ ${toSymUpper}` : '';
  const actionTitle = pairLabel
    ? `${label} ${pairLabel}`
    : (symKey ? `${label} ${symKey}` : label);
  const displayAmt = isSwapIn && typeof it.toAmount === 'number' && Number.isFinite(it.toAmount)
    ? it.toAmount
    : it.amount;
  const displaySym = isSwapIn && !(typeof it.toAmount === 'number' && Number.isFinite(it.toAmount))
    ? fromSymUpper
    : (symKey || fromSymUpper);
  const amtText = (typeof displayAmt === 'number' && Number.isFinite(displayAmt) && displayAmt > 0)
    ? (isSwapIn && displaySym !== symKey && symKey
      ? `${defaultFormatBal(displayAmt, 6)} ${displaySym} ➔ ${symKey}`
      : `${sign}${defaultFormatBal(displayAmt, 6)} ${displaySym}`)
    : '--';
  return { actionTitle, amtColor, dirClass, dirGlyph, amtText };
}

function defaultConfirmBadgeText(it, isEn) {
  if (!it) return '';
  const statusLow = String(it.status || '').toLowerCase();
  if (statusLow === 'pending' || statusLow === 'unconfirmed') return isEn ? 'Pending' : '确认中';
  if (statusLow === 'failed' || it.type === 'failed') return isEn ? 'Failed' : '失败';
  return isEn ? 'Confirmed' : '已确认';
}

export function TokenHistoryPanel({
  items = [],
  symKey = '',
  loading = false,
  partialUnavailable = false,
  isEn: isEnProp,
  resolveTxDisplayParts,
  formatRelativeActivityTime,
  formatActivityTime,
  formatTxConfirmBadgeText,
  getChainMeta,
  onOpenTxDetail
}) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  if (loading && items.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
        {isEn ? 'Loading on-chain activity...' : '正在加载链上交易记录...'}
      </div>
    );
  }

  if (!items || items.length === 0) {
    const emptyMsg = partialUnavailable
      ? (isEn
        ? 'History on some networks is temporarily unavailable; tap Explorer above to view on-chain'
        : '部分网络暂无法拉取历史记录，可点击右上方前往区块浏览器查看')
      : (isEn
        ? 'No recent token activity found; click Explorer above to view on-chain'
        : '暂无该代币链上变动记录，可点击右上方前往区块浏览器查看');
    return (
      <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
        {emptyMsg}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.slice(0, 3).map((it, idx) => {
        const parts = typeof resolveTxDisplayParts === 'function'
          ? resolveTxDisplayParts(it, symKey)
          : defaultResolveDisplayParts(it, symKey, isEn);
        const relTime = (typeof formatRelativeActivityTime === 'function' && formatRelativeActivityTime(it.timestamp))
          || (typeof formatActivityTime === 'function' && formatActivityTime(it.timestamp))
          || defaultFormatRelTime(it.timestamp, isEn)
          || '--';
        const chainMeta = it.chain && typeof getChainMeta === 'function' ? getChainMeta(it.chain) : null;
        const netTag = chainMeta ? chainMeta.shortName : (it.chain ? String(it.chain).toUpperCase() : '');
        const subLine = [relTime, netTag].filter(Boolean).join(' · ');
        const confirmText = typeof formatTxConfirmBadgeText === 'function'
          ? formatTxConfirmBadgeText(it)
          : defaultConfirmBadgeText(it, isEn);

        return (
          <button
            key={it.id || it.txHash || idx}
            type="button"
            className="tx-compact-row"
            data-action="open-tx-detail"
            data-tx-source="token"
            data-tx-idx={idx}
            data-tx-hash={it.txHash || ''}
            data-chain={it.chain || ''}
            onClick={typeof onOpenTxDetail === 'function' ? () => onOpenTxDetail(it, idx) : undefined}
          >
            <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
              <span className={`tx-dir-circle ${parts.dirClass}`}>{parts.dirGlyph}</span>
              <div className="flex flex-col" style={{ minWidth: 0, flex: 1, gap: '2px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {parts.actionTitle}
                </span>
                <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {subLine}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
              <div className="flex flex-col" style={{ textAlign: 'right', gap: '2px' }}>
                <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: parts.amtColor }}>
                  {parts.amtText}
                </span>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                  {confirmText}
                </span>
              </div>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>›</span>
            </div>
          </button>
        );
      })}
      {partialUnavailable && (
        <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', paddingTop: '4px' }}>
          {isEn
            ? 'History on some networks is temporarily unavailable; tap Explorer above to view on-chain'
            : '部分网络暂无法拉取历史记录，可点击右上方前往区块浏览器查看'}
        </div>
      )}
    </div>
  );
}
