import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
import { TokenIconBadge } from './TokenIconBadge.jsx';
import { ActionButton } from './ui/ActionButton.jsx';

function defaultShortenAddr(addr, head = 10, tail = 8) {
  const s = String(addr || '');
  if (s.length <= head + tail + 3) return s || '--';
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function defaultIsValidHttpsUrl(url) {
  try {
    const u = new URL(String(url || ''));
    return u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

export function EarnStakeSheetPanel({
  mode = 'lock-tiers',
  tiers = [],
  selectedDays = 181,
  receipt = null,
  isEn: isEnProp,
  formatLockTierLabel,
  shortenAddr = defaultShortenAddr
}) {
  const st = useWalletState(['staking', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');

  if (mode === 'receipt') {
    if (!receipt || !receipt.txHash) return null;
    const showExplorer = Boolean(receipt.explorerUrl && defaultIsValidHttpsUrl(receipt.explorerUrl));
    return (
      <div class="flex flex-col gap-1.5">
        <div class="meta-row">
          <span class="meta-key">TxHash</span>
          <span class="mono text-emerald">{shortenAddr(receipt.txHash, 10, 8)}</span>
        </div>
        {showExplorer ? (
          <a
            href={receipt.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-cyan"
            style={{ fontSize: '11.5px' }}
          >
            {isEn ? 'View on Explorer ↗' : '在区块浏览器查看 ↗'}
          </a>
        ) : null}
      </div>
    );
  }

  const list = Array.isArray(tiers) ? tiers : [];
  if (list.length === 0) {
    return <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>--</span>;
  }

  const curDays = Number(selectedDays || 181);
  return list.map((tier) => {
    const d = Number(tier.days);
    const label = typeof formatLockTierLabel === 'function'
      ? formatLockTierLabel(tier)
      : `${d}${isEn ? 'd' : '天'}`;
    return (
      <button
        key={d}
        type="button"
        class={`filter-pill ${d === curDays ? 'active' : ''}`}
        data-action="select-earn-lock"
        data-days={d}
      >
        {label}
      </button>
    );
  });
}

export function EarnValidatorsPanel({
  items = [],
  busyTarget = '',
  isEn: isEnProp
}) {
  const st = useWalletState(['staking', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;

  return (
    <div class="flex flex-col gap-2">
      {list.map((it, idx) => {
        const isBusy = Boolean(busyTarget && it.actionTarget && busyTarget === it.actionTarget);
        return (
          <div
            key={`${it.symbol || ''}-${it.actionTarget || idx}`}
            class="flex items-center justify-between gap-2"
            style={{ padding: '6px 8px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)' }}
          >
            <div class="flex items-center gap-2" style={{ minWidth: 0 }}>
              <TokenIconBadge
                symbol={it.symbol || '?'}
                blockchain={it.chain || ''}
                size={28}
                showChainBadge={true}
              />
              <div class="flex flex-col" style={{ minWidth: 0 }}>
                <span class="mono" style={{ fontWeight: 700, fontSize: '12.5px', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.title || '--'}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {it.subtitle || ''}
                </span>
              </div>
            </div>
            <div class="flex items-center gap-2" style={{ flexShrink: 0 }}>
              <span class="mono text-emerald" style={{ fontWeight: 700, fontSize: '12.5px', whiteSpace: 'nowrap' }}>
                {it.amountText || '--'}
              </span>
              {it.actionType && it.actionTarget ? (
                <ActionButton
                  className="mini-action-btn"
                  style={{ padding: '4px 8px', fontSize: '11px' }}
                  loading={isBusy}
                  loadingText={isEn ? 'Pending...' : '处理中...'}
                  dataAction="earn-pos-action"
                  data-type={it.actionType}
                  data-target={it.actionTarget}
                >
                  {it.actionLabel || (isEn ? 'Manage' : '操作')}
                </ActionButton>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
