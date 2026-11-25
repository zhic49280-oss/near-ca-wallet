import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
import { TokenIconBadge } from './TokenIconBadge.jsx';
import { EmptyState } from './ui/EmptyState.jsx';
import { StatusBadge } from './ui/StatusBadge.jsx';

function defaultFormatBal(val, dp = 6) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '--';
  return Number(n.toFixed(dp)).toString();
}

function defaultShortenAddr(addr, head = 10, tail = 8) {
  const s = String(addr || '');
  if (!s) return '--';
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function defaultFormatTime(tsSec) {
  if (!tsSec || !Number.isFinite(Number(tsSec))) return '--';
  try {
    return new Date(Number(tsSec) * 1000).toLocaleString([], {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return '--';
  }
}

function defaultResolveDisplayParts(it, fallbackSym, isEn) {
  const symKey = String(fallbackSym || (it && it.symbol) || '').toUpperCase();
  const fromSymUpper = String((it && it.symbol) || symKey).toUpperCase();
  const toSymUpper = String((it && it.toSymbol) || '').toUpperCase();
  const type = (it && it.type) || 'tx';
  const isSwapIn = type === 'swap' && symKey && toSymUpper === symKey && fromSymUpper !== symKey;
  const isSwapOut = type === 'swap' && !isSwapIn;
  const sign = (type === 'send' || type === 'stake' || isSwapOut)
    ? '-'
    : ((type === 'receive' || type === 'mine' || type === 'unstake' || isSwapIn) ? '+' : '');
  const amtColor = sign === '+'
    ? 'var(--near-emerald)'
    : (sign === '-' ? '#f8fafc' : 'var(--text-secondary)');
  const dirClass = type === 'failed'
    ? 'failed'
    : (sign === '-' ? (type === 'swap' ? 'swap' : 'send') : (sign === '+' ? 'receive' : 'swap'));
  const dirGlyph = type === 'failed' ? '✕' : (type === 'swap' ? '⇄' : (sign === '-' ? '↑' : (sign === '+' ? '↓' : '⇄')));
  const labelMap = isEn
    ? { receive: 'Receive', send: 'Send', swap: 'Swap', stake: 'Stake', unstake: 'Unstake', mine: 'Mining Payout', tx: 'Activity', failed: 'Failed' }
    : { receive: '接收', send: '发送', swap: '闪兑', stake: '质押', unstake: '解质押', mine: '挖矿收款', tx: '链上交互', failed: '交易失败' };
  const label = labelMap[type] || labelMap.tx;
  const pairLabel = type === 'swap' && toSymUpper ? `${fromSymUpper} ➔ ${toSymUpper}` : '';
  const actionTitle = pairLabel ? `${label} ${pairLabel}` : (symKey ? `${label} ${symKey}` : label);
  const displayAmt = isSwapIn && typeof it.toAmount === 'number' && Number.isFinite(it.toAmount)
    ? it.toAmount
    : (it ? it.amount : null);
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

export function TokenBreakdownPanel({
  entries = [],
  symbol = '',
  isEn: isEnProp,
  formatBal,
  getChainMeta
}) {
  const st = useWalletState(['balances', 'lang']);
  const isEn = typeof isEnProp === 'boolean'
    ? isEnProp
    : Boolean(st && st.lang === 'en');
  const fmtBal = typeof formatBal === 'function' ? formatBal : defaultFormatBal;

  if (!entries || entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e, idx) => {
        const meta = typeof getChainMeta === 'function' ? getChainMeta(e.blockchain) : null;
        const cleanNetName = (meta && meta.name) || e.networkName || String(e.blockchain || '').toUpperCase();
        const balStr = fmtBal(e.balance, 6);
        const tok = e.token || {};
        return (
          <div key={`${e.blockchain || ''}_${e.assetId || idx}`} className="detail-row-item">
            <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
              <TokenIconBadge
                symbol={tok.symbol || symbol}
                blockchain={e.blockchain}
                logoURI={tok.logoURI || ''}
                contractAddress={e.contractAddress || tok.contractAddress || ''}
                size={28}
                showChainBadge={true}
              />
              <div className="flex flex-col" style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#fff' }}>{cleanNetName}</span>
                <span className="mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  {`${balStr} ${symbol}`}
                </span>
              </div>
            </div>
            <div className="flex gap-1" style={{ flexShrink: 0 }}>
              <button
                type="button"
                className="mini-action-btn primary"
                data-action="detail-swap"
                data-asset-id={e.assetId || ''}
                data-chain={e.blockchain || ''}
                data-contract={e.contractAddress || ''}
              >
                {isEn ? 'Swap' : '闪兑'}
              </button>
              <button
                type="button"
                className="mini-action-btn"
                data-action="detail-send"
                data-symbol={symbol}
                data-chain={e.blockchain || ''}
                data-asset-id={e.assetId || ''}
                data-contract={e.contractAddress || ''}
              >
                {isEn ? 'Send' : '转账'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TxHistorySheetPanel({
  items = [],
  fallbackSym = '',
  isEn: isEnProp,
  resolveTxDisplayParts,
  formatActivityTime,
  formatTxConfirmBadgeText,
  getChainMeta,
  getExplorerTxUrl,
  isValidHttpsUrl,
  shortenAddr
}) {
  const st = useWalletState(['lang']);
  const isEn = typeof isEnProp === 'boolean'
    ? isEnProp
    : Boolean(st && st.lang === 'en');

  if (!items || items.length === 0) {
    return (
      <EmptyState
        title={isEn ? 'No transactions found' : '暂无交易记录'}
        className="py-6"
      />
    );
  }

  const fmtAddr = typeof shortenAddr === 'function' ? shortenAddr : defaultShortenAddr;

  return (
    <div className="flex flex-col gap-2">
      {items.slice(0, 40).map((it, idx) => {
        const parts = typeof resolveTxDisplayParts === 'function'
          ? resolveTxDisplayParts(it, it.symbol || fallbackSym || '')
          : defaultResolveDisplayParts(it, it.symbol || fallbackSym || '', isEn);
        const confBadge = typeof formatTxConfirmBadgeText === 'function'
          ? formatTxConfirmBadgeText(it)
          : defaultConfirmBadgeText(it, isEn);
        const timeStr = (typeof formatActivityTime === 'function' && formatActivityTime(it.timestamp))
          || defaultFormatTime(it.timestamp);
        const chainMeta = it.chain && typeof getChainMeta === 'function' ? getChainMeta(it.chain) : null;
        const netTag = chainMeta ? chainMeta.shortName : (it.chain ? String(it.chain).toUpperCase() : '');
        const rawUrl = it.txHash && typeof getExplorerTxUrl === 'function' ? getExplorerTxUrl(it.chain, it.txHash) : '';
        const explorerUrl = rawUrl && (typeof isValidHttpsUrl !== 'function' || isValidHttpsUrl(rawUrl)) ? rawUrl : '';

        return (
          <div key={it.id || it.txHash || idx} className="tx-card-full">
            <button
              type="button"
              className="tx-card-full-top"
              data-action="open-tx-detail"
              data-tx-source="modal"
              data-tx-idx={idx}
              data-tx-hash={it.txHash || ''}
            >
              <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                <span className={`tx-dir-circle ${parts.dirClass}`}>{parts.dirGlyph}</span>
                <div className="flex flex-col" style={{ minWidth: 0, gap: '2px' }}>
                  <span style={{ fontWeight: 700, fontSize: '13.5px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parts.actionTitle}
                  </span>
                  <span className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {[timeStr, netTag].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <div className="flex flex-col" style={{ textAlign: 'right', gap: '2px' }}>
                  <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: parts.amtColor }}>
                    {parts.amtText}
                  </span>
                  {confBadge ? (
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                      {confBadge}
                    </span>
                  ) : null}
                </div>
                <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>›</span>
              </div>
            </button>
            {explorerUrl && (
              <div className="tx-meta-inline">
                <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fmtAddr(it.txHash, 10, 8)}
                </span>
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-copy-icon-btn"
                  style={{ textDecoration: 'none', color: 'var(--cyan-glow)' }}
                >
                  {isEn ? 'Explorer ↗' : '区块浏览器 ↗'}
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TxDetailPanel({
  item = null,
  fallbackSym = '',
  isEn: isEnProp,
  resolveTxDisplayParts,
  formatFullActivityTime,
  getChainMeta,
  getExplorerTxUrl,
  isValidHttpsUrl,
  shortenAddr
}) {
  const st = useWalletState(['lang']);
  const isEn = typeof isEnProp === 'boolean'
    ? isEnProp
    : Boolean(st && st.lang === 'en');

  if (!item) return null;

  const sym = String(item.symbol || fallbackSym || '').toUpperCase();
  const parts = typeof resolveTxDisplayParts === 'function'
    ? resolveTxDisplayParts(item, sym)
    : defaultResolveDisplayParts(item, sym, isEn);
  const statusRaw = String(item.status || 'confirmed').toLowerCase();
  const isFailed = item.type === 'failed' || statusRaw === 'failed';
  const isPending = !isFailed && (statusRaw === 'pending' || statusRaw === 'unconfirmed');
  const statusCls = isFailed ? 'failed' : (isPending ? 'pending' : 'confirmed');
  const tone = isFailed ? 'rose' : (isPending ? 'amber' : 'emerald');
  const statusIcon = isFailed ? '✕' : (isPending ? '⏳' : '✓');
  const statusText = isFailed ? (isEn ? 'Failed' : '交易失败') : (isPending ? (isEn ? 'Pending' : '确认中') : (isEn ? 'Confirmed' : '已确认'));
  const timeVal = (typeof formatFullActivityTime === 'function' && formatFullActivityTime(item.timestamp))
    || defaultFormatTime(item.timestamp);
  const chainMeta = item.chain && typeof getChainMeta === 'function' ? getChainMeta(item.chain) : null;
  const netName = chainMeta ? chainMeta.name : (item.chain ? String(item.chain).toUpperCase() : '--');
  const rawUrl = item.txHash && typeof getExplorerTxUrl === 'function' ? getExplorerTxUrl(item.chain, item.txHash) : '';
  const explorerUrl = rawUrl && (typeof isValidHttpsUrl !== 'function' || isValidHttpsUrl(rawUrl)) ? rawUrl : '';
  const noteText = item.title && item.title !== parts.actionTitle ? item.title : '';
  const fmtAddr = typeof shortenAddr === 'function' ? shortenAddr : defaultShortenAddr;

  return (
    <div className="flex flex-col gap-3">
      <div className="ios-glass-card flex flex-col items-center gap-2" style={{ padding: '18px 14px', textAlign: 'center' }}>
        <span className={`tx-dir-circle ${parts.dirClass}`} style={{ width: '42px', height: '42px', fontSize: '18px' }}>
          {parts.dirGlyph}
        </span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>
          {parts.actionTitle}
        </span>
        <strong className="mono" style={{ fontSize: '22px', fontWeight: 800, color: parts.amtColor }}>
          {parts.amtText}
        </strong>
        <StatusBadge tone={tone} className={`tx-status-pill ${statusCls}`} style={{ marginTop: '2px' }}>
          <span>{statusIcon}</span>
          {' '}
          <span>{statusText}</span>
        </StatusBadge>
      </div>
      <div className="ios-glass-card meta-list">
        <div className="meta-row">
          <span className="meta-key">{isEn ? 'Action' : '交易动作'}</span>
          <span className="meta-val" style={{ fontWeight: 700 }}>{parts.actionTitle}</span>
        </div>
        <div className="meta-row">
          <span className="meta-key">{isEn ? 'Network' : '网络'}</span>
          <span className="meta-val">{netName}</span>
        </div>
        <div className="meta-row">
          <span className="meta-key">{isEn ? 'Time' : '时间'}</span>
          <span className="meta-val mono">{timeVal}</span>
        </div>
        {noteText && (
          <div className="meta-row">
            <span className="meta-key">{isEn ? 'Details' : '详情'}</span>
            <span className="meta-val mono">{noteText}</span>
          </div>
        )}
        {item.txHash && (
          <div className="meta-row">
            <span className="meta-key">{isEn ? 'Tx Hash' : '交易哈希'}</span>
            <span className="meta-val flex items-center gap-2">
              <span className="mono">{fmtAddr(item.txHash, 10, 8)}</span>
              <button
                type="button"
                className="btn-ghost-sm"
                style={{ padding: '2px 6px', color: 'var(--cyan-glow)' }}
                data-action="copy-text"
                data-val={item.txHash}
                data-label={isEn ? 'Tx Hash' : '交易哈希'}
              >
                {isEn ? 'Copy' : '复制'}
              </button>
            </span>
          </div>
        )}
      </div>
      {explorerUrl && (
        <a
          id="tx-detail-explorer-link"
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none', textAlign: 'center' }}
        >
          <span>{isEn ? 'View on Block Explorer ↗' : '在区块浏览器中查看 ↗'}</span>
        </a>
      )}
    </div>
  );
}

export default {
  TokenBreakdownPanel,
  TxHistorySheetPanel,
  TxDetailPanel
};
