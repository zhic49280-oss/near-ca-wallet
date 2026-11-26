import { h, Fragment } from 'preact';
import { TokenIconBadge } from './TokenIconBadge.jsx';
import { useLang } from '../store/useWalletStore.js';

export function OnboardSeedGridPanel({ words = [] }) {
  if (!Array.isArray(words) || words.length === 0) return null;
  return (
    <Fragment>
      {words.map((w, i) => (
        <div key={`${i}_${w}`} className="seed-word">
          <span className="seed-idx">{`${i + 1}.`}</span>
          <span>{w}</span>
        </div>
      ))}
    </Fragment>
  );
}

export function TokenDetailIconPanel({
  symbol = '?',
  blockchain = '',
  iconUrl = '',
  fallbackUrl = '',
  secondFallbackUrl = '',
  chainColor = '',
  chainShort = '',
  showChainBadge = true
}) {
  return (
    <TokenIconBadge
      symbol={symbol}
      blockchain={blockchain}
      logoURI={iconUrl || fallbackUrl || secondFallbackUrl || ''}
      size={30}
      showChainBadge={Boolean(showChainBadge)}
      data-chain-color={chainColor || undefined}
      data-chain-short={chainShort || undefined}
    />
  );
}

export function TokenDetailChainsPanel({
  items = [],
  activeChain = 'all',
  onSelectChain
}) {
  useLang();
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <Fragment>
      {items.map((item) => {
        const chain = item.chain || 'all';
        const isActive = activeChain === chain;
        return (
          <button
            key={chain}
            type="button"
            className={`filter-pill ${isActive ? 'active' : ''}`}
            data-action="set-token-detail-chain"
            data-chain={chain}
            onClick={(e) => {
              if (typeof onSelectChain === 'function') {
                e.stopPropagation();
                onSelectChain(chain);
              }
            }}
          >
            {item.label}
          </button>
        );
      })}
    </Fragment>
  );
}

function renderEarnPoolRows(pools, onOpenPool) {
  return pools.map((p) => {
    const catMeta = p.catMeta || { cls: 'cat-staking', label: '' };
    return (
      <button
        key={p.id}
        type="button"
        className="detail-row-item detail-row-clickable"
        data-action="open-token-detail-pool"
        data-pool-id={p.id}
        onClick={(e) => {
          if (typeof onOpenPool === 'function') {
            e.stopPropagation();
            onOpenPool(p.id);
          }
        }}
      >
        <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
          <TokenIconBadge
            symbol={p.outSymbol}
            blockchain={p.chain}
            logoURI={p.iconUrl || ''}
            size={26}
            showChainBadge={true}
          />
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#fff' }}>{p.name}</span>
              {catMeta.label ? (
                <span className={`pool-cat-badge ${catMeta.cls}`}>{catMeta.label}</span>
              ) : null}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {`${p.protocol || p.chainLabel || ''} · ${p.inSymbol} ➔ ${p.outSymbol}`}
            </span>
          </div>
        </div>
        <span className="mono text-emerald" style={{ fontWeight: 800, fontSize: '13px', flexShrink: 0 }}>
          {p.apyText || '--'}
        </span>
      </button>
    );
  });
}

export function TokenDetailEarnPanel({
  pools = [],
  isEn: isEnProp,
  onOpenPool
}) {
  const { isEn: storeIsEn } = useLang();
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : storeIsEn;
  if (!Array.isArray(pools) || pools.length === 0) return null;

  const stakingPools = pools.filter((p) => p && !p.isErc4626 && !p.isAaveV3 && !p.isLockConvert && !p.isBurrowSupply);
  const earnLendingPools = pools.filter((p) => p && (p.isErc4626 || p.isAaveV3 || p.isLockConvert || p.isBurrowSupply));

  return (
    <Fragment>
      {stakingPools.length > 0 && (
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>
              {`⚡ ${isEn ? 'Staking' : '链上质押 (Staking)'}`}
            </span>
            <span className="pool-cat-badge cat-staking">{isEn ? 'Staking' : '质押'}</span>
          </div>
          <div className="flex flex-col gap-2">{renderEarnPoolRows(stakingPools, onOpenPool)}</div>
        </div>
      )}
      {earnLendingPools.length > 0 && (
        <div className="ios-glass-card flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>
              {`🏦 ${isEn ? 'Lending & Earn' : '借贷与存款生息 (Lending & Earn)'}`}
            </span>
            <span className="pool-cat-badge cat-lending">{isEn ? 'Lending' : '借贷'}</span>
          </div>
          <div className="flex flex-col gap-2">{renderEarnPoolRows(earnLendingPools, onOpenPool)}</div>
        </div>
      )}
    </Fragment>
  );
}

export function TokenPickerPillsPanel({
  kind = 'chains',
  items = [],
  activeChain = 'all',
  showMoreChains = false,
  isEn: isEnProp
}) {
  const { isEn: storeIsEn } = useLang();
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : storeIsEn;
  if (!Array.isArray(items) || items.length === 0) return null;

  if (kind === 'favorites') {
    return (
      <Fragment>
        {items.map((tok) => (
          <button
            key={tok.assetId || tok.symbol}
            type="button"
            className="filter-pill flex items-center gap-1"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            data-action="select-swap-token"
            data-asset-id={tok.assetId}
          >
            <TokenIconBadge
              symbol={tok.symbol}
              blockchain={tok.blockchain}
              logoURI={tok.logoURI || ''}
              contractAddress={tok.contractAddress || ''}
              size={18}
              showChainBadge={true}
            />
            <span>{tok.symbol}</span>
          </button>
        ))}
      </Fragment>
    );
  }

  if (kind === 'single') {
    const item = items[0];
    return item ? (
      <button type="button" className="filter-pill active">
        {item.label}
      </button>
    ) : null;
  }

  return (
    <Fragment>
      {items.map((item) => {
        if (item.isMoreToggle) {
          return (
            <button
              key="__more__"
              type="button"
              className={`filter-pill ${showMoreChains ? 'active' : ''}`}
              data-action="toggle-picker-more-chains"
            >
              {showMoreChains ? (isEn ? 'Less ▲' : '收起网络 ▲') : (isEn ? 'More ▾' : '更多网络 ▾')}
            </button>
          );
        }
        return (
          <button
            key={item.chain}
            type="button"
            className={`filter-pill ${activeChain === item.chain ? 'active' : ''}`}
            data-action="set-picker-chain"
            data-chain={item.chain}
          >
            {item.label}
          </button>
        );
      })}
    </Fragment>
  );
}
