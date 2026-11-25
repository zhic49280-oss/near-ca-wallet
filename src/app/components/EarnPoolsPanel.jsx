import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
import { TokenIconBadge } from './TokenIconBadge.jsx';

function defaultFormatBal(val, dp = 4) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '--';
  return Number(n.toFixed(dp)).toString();
}

function defaultApyText(p, isEn) {
  if (!p) return '--';
  if (p.isLockConvert) {
    if (Array.isArray(p.lockTiers) && p.lockTiers.length > 0) {
      const minPct = Math.round(p.lockTiers[0].rate * 100);
      const maxPct = Math.round(p.lockTiers[p.lockTiers.length - 1].rate * 100);
      return isEn ? `${minPct}%~${maxPct}%` : `${minPct}%~${maxPct}% 兑换`;
    }
    return '--';
  }
  if (typeof p.apy === 'number' && Number.isFinite(p.apy)) {
    if (p.isJupiterDao || p.isAsrEstimated) {
      return isEn ? `ASR Est. ~${p.apy.toFixed(2)}%` : `ASR 估算 ~${p.apy.toFixed(2)}%`;
    }
    return `${p.apy.toFixed(2)}%`;
  }
  return '--';
}

function defaultCategoryMeta(p, isEn) {
  if (!p) return { label: '', cls: 'cat-staking' };
  if (p.isAaveV3 || p.isBurrowSupply) {
    return { label: isEn ? 'Lending' : '借贷 Lending', cls: 'cat-lending' };
  }
  if (p.isErc4626 || p.isLockConvert || p.category === 'lending') {
    return { label: isEn ? 'Vault' : '金库 Vault', cls: 'cat-vault' };
  }
  return { label: isEn ? 'Staking' : '质押 Staking', cls: 'cat-staking' };
}

export function EarnPoolsPanel({
  pools = [],
  selectedPoolId = '',
  loading = false,
  isEn: isEnProp,
  getPoolData,
  formatBal = defaultFormatBal
}) {
  const st = useWalletState(['staking', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');
  const list = Array.isArray(pools) ? pools : [];

  if (loading && list.length === 0) {
    return (
      <div className="ios-glass-card text-center" style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
        {isEn ? 'Loading staking pools...' : '正在加载质押池...'}
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="ios-glass-card text-center" style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
        {isEn ? 'No matching staking pools found' : '未找到匹配的质押池或合约'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {list.map((p, idx) => {
        const selected = selectedPoolId === p.id;
        const meta = typeof getPoolData === 'function' ? getPoolData(p) : null;
        const apyStr = meta && meta.apyText !== undefined ? meta.apyText : defaultApyText(p, isEn);
        const avail = meta && meta.availBalance !== undefined ? meta.availBalance : null;
        const tvlStr = meta && meta.tvlText !== undefined ? meta.tvlText : (p.tvlText || '--');
        const stakersStr = meta && meta.stakersText !== undefined
          ? meta.stakersText
          : (typeof p.stakersCount === 'number' && Number.isFinite(p.stakersCount) && p.stakersCount > 0
            ? p.stakersCount.toLocaleString('en-US')
            : '--');
        const catMeta = (meta && meta.catMeta) || defaultCategoryMeta(p, isEn);
        const iconUrl = (meta && meta.iconUrl) || p.icon || '';
        const lockBadgeText = p.isLockConvert
          ? (isEn ? '🔒 15–181 days' : '🔒 15~181 天')
          : '';

        return (
          <div
            key={p.id || idx}
            className={`staking-pool-card ${selected ? 'selected' : ''}`}
            data-action="select-staking-pool"
            data-pool-id={p.id || ''}
          >
            <div className="flex items-center gap-3" style={{ minWidth: 0, flex: 1 }}>
              <TokenIconBadge
                symbol={p.outSymbol || p.inSymbol || '?'}
                blockchain={p.chain || ''}
                logoURI={iconUrl}
                contractAddress={p.tokenContract || p.contract || ''}
                size={36}
                showChainBadge={true}
              />
              <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>{p.name || p.id}</span>
                  {catMeta.label && <span className={`pool-cat-badge ${catMeta.cls}`}>{catMeta.label}</span>}
                  {lockBadgeText && (
                    <span className="pool-cat-badge cat-vault" style={{ whiteSpace: 'nowrap' }}>{lockBadgeText}</span>
                  )}
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.inSymbol} ➔ {p.outSymbol} · {p.chainLabel || (p.chain ? String(p.chain).toUpperCase() : '')}
                </span>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  🔒 {isEn ? 'TVL' : '总质押'}: {tvlStr} · 👥 {isEn ? 'Stakers' : '人数'}: {stakersStr}
                </span>
              </div>
            </div>
            <div className="flex flex-col" style={{ textAlign: 'right', flexShrink: 0 }}>
              <span className="text-emerald" style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap' }}>{apyStr}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {formatBal(avail, 4)} {p.inSymbol}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
