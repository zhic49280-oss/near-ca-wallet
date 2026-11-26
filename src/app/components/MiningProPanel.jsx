import { h, Fragment } from 'preact';
import { EmptyState } from './ui/EmptyState.jsx';
import { StatusBadge } from './ui/StatusBadge.jsx';
import { useLang } from '../store/useWalletStore.js';

function defaultShortenAddr(addr, head = 6, tail = 5) {
  const s = String(addr || '');
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function resolvePayoutDisplay(item, fallbackSym = 'PRL', isEn = false) {
  const isReceive = item.type === 'receive';
  const actionTitle = item.title || (isReceive ? (isEn ? 'On-Chain Transfer' : '链上转入') : (isEn ? 'Pool Payout' : '矿池打款'));
  const sym = item.symbol || fallbackSym;
  const amtNum = Number(item.amount);
  const amtText = Number.isFinite(amtNum)
    ? `+${Number(amtNum.toFixed(6)).toString()} ${sym}`
    : '--';
  const ts = Number(item.timestamp);
  let relTime = '--';
  if (Number.isFinite(ts) && ts > 0) {
    const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - ts);
    if (diffSec < 60) relTime = isEn ? 'Just now' : '刚刚';
    else if (diffSec < 3600) relTime = `${Math.floor(diffSec / 60)}${isEn ? 'm ago' : '分钟前'}`;
    else if (diffSec < 86400) relTime = `${Math.floor(diffSec / 3600)}${isEn ? 'h ago' : '小时前'}`;
    else relTime = `${Math.floor(diffSec / 86400)}${isEn ? 'd ago' : '天前'}`;
  }
  const statusStr = String(item.status || 'confirmed').toLowerCase();
  const statusLabel = statusStr === 'pending'
    ? (isEn ? 'Pending' : '处理中')
    : statusStr === 'failed'
      ? (isEn ? 'Failed' : '失败')
      : (isEn ? 'Confirmed' : '已确认');
  return {
    actionTitle,
    amtText,
    subLine: [relTime, 'PRL'].filter(Boolean).join(' · '),
    statusLabel
  };
}

export function MiningTelemetryPanel({
  mode = 'network',
  network = null,
  watchlist = [],
  payouts = [],
  isOnChainMode = false,
  isEn: isEnProp,
  shortenAddr
}) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  const fmtAddr = typeof shortenAddr === 'function' ? shortenAddr : defaultShortenAddr;

  if (mode === 'watchlist') {
    if (!Array.isArray(watchlist) || watchlist.length === 0) {
      return null;
    }
    return (
      <Fragment>
        {watchlist.map((item, idx) => (
          <span
            key={item.address || idx}
            class="filter-pill"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <span
              style={{ cursor: 'pointer' }}
              data-action="select-miner"
              data-addr={item.address || ''}
            >
              {item.label || fmtAddr(item.address, 6, 5)}
            </span>
            <span
              style={{ cursor: 'pointer', opacity: 0.65 }}
              data-action="remove-miner"
              data-addr={item.address || ''}
            >
              ×
            </span>
          </span>
        ))}
      </Fragment>
    );
  }

  if (mode === 'payouts') {
    const list = Array.isArray(payouts) ? payouts : [];
    if (list.length === 0) {
      return (
        <EmptyState
          title={isOnChainMode
            ? (isEn ? 'No incoming transfers' : '暂无链上转入记录')
            : (isEn ? 'No payout history' : '暂无打款记录')}
          className="py-2"
        />
      );
    }
    return (
      <Fragment>
        {list.slice(0, 3).map((it, idx) => {
          const parts = resolvePayoutDisplay(it, 'PRL', isEn);
          return (
            <button
              key={it.id || it.txHash || idx}
              type="button"
              class="tx-compact-row"
              data-action="open-tx-detail"
              data-tx-source="mining"
              data-tx-idx={idx}
              data-tx-hash={it.txHash || ''}
              data-chain={it.chain || 'prl'}
            >
              <div class="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
                <span class="tx-dir-circle in">↓</span>
                <div class="flex flex-col" style={{ minWidth: 0, flex: 1, gap: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parts.actionTitle}
                  </span>
                  <span class="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {parts.subLine}
                  </span>
                </div>
              </div>
              <div class="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <div class="flex flex-col" style={{ textAlign: 'right', gap: '2px' }}>
                  <span class="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--near-emerald)' }}>
                    {parts.amtText}
                  </span>
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    {parts.statusLabel}
                  </span>
                </div>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>›</span>
              </div>
            </button>
          );
        })}
      </Fragment>
    );
  }

  if (!network) {
    return (
      <div class="meta-row">
        <span class="meta-key">Pearl Mainnet</span>
        <span class="meta-val">--</span>
      </div>
    );
  }

  const heightText = network.height !== null && network.height !== undefined
    ? Number(network.height).toLocaleString()
    : '--';
  const diffText = network.difficultyM !== null && network.difficultyM !== undefined
    ? `${network.difficultyM}M`
    : '--';
  const rewardText = network.blockRewardPrl !== null && network.blockRewardPrl !== undefined
    ? `${network.blockRewardPrl} PRL`
    : '--';

  return (
    <Fragment>
      <div class="meta-row">
        <span class="meta-key">{isEn ? 'Height' : '区块高度'}</span>
        <span class="meta-val mono">{heightText}</span>
      </div>
      <div class="meta-row">
        <span class="meta-key">{isEn ? 'Net Hashrate' : '全网算力'}</span>
        <span class="meta-val mono">{network.networkHashrateFormatted || '--'}</span>
      </div>
      <div class="meta-row">
        <span class="meta-key">{isEn ? 'Diff / Reward' : '全网难度 / 块奖励'}</span>
        <span class="meta-val mono">{`${diffText} · ${rewardText}`}</span>
      </div>
    </Fragment>
  );
}

export function MiningWorkersPanel({
  workers = [],
  loading = false,
  isEn: isEnProp
}) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  if (loading) {
    return (
      <tr>
        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          {isEn ? 'Loading rig status...' : '正在查询矿机状态...'}
        </td>
      </tr>
    );
  }

  const list = Array.isArray(workers) ? workers : [];
  if (list.length === 0) {
    return (
      <tr>
        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          {isEn ? 'No active rigs' : '暂无矿机记录'}
        </td>
      </tr>
    );
  }

  return (
    <Fragment>
      {list.map((w, idx) => {
        const isOnline = w.status === 'online';
        return (
          <tr key={w.name || idx}>
            <td style={{ fontWeight: 700, color: '#fff' }}>{w.name || '--'}</td>
            <td>
              <StatusBadge
                tone={isOnline ? 'emerald' : 'neutral'}
                className={`status-pill ${isOnline ? 'online' : 'offline'}`}
              >
                {isOnline ? (isEn ? 'Online' : '在线') : (isEn ? 'Offline' : '离线')}
              </StatusBadge>
            </td>
            <td class="mono">{w.hashrate30mFormatted || '--'}</td>
            <td class="mono">{w.hashrate24hFormatted || '--'}</td>
            <td class="mono">
              {`${w.validShares !== null && w.validShares !== undefined ? w.validShares : '--'} / ${w.rejectedShares !== null && w.rejectedShares !== undefined ? w.rejectedShares : '--'}`}
            </td>
          </tr>
        );
      })}
    </Fragment>
  );
}
