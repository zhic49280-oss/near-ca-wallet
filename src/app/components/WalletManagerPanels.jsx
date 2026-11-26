import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
import { ActionButton } from './ui/ActionButton.jsx';
import { EmptyState } from './ui/EmptyState.jsx';

function defaultShortenAddr(addr, head = 8, tail = 6) {
  const s = String(addr || '');
  if (!s) return '--';
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

export function WalletListPanel({
  wallets,
  activeWalletId,
  isEn: isEnProp,
  shortenAddr
}) {
  const st = useWalletState(['wallet', 'lang']);
  const list = Array.isArray(wallets)
    ? wallets
    : (st && Array.isArray(st.wallets) ? st.wallets : []);
  const activeId = activeWalletId !== undefined
    ? activeWalletId
    : (st ? st.activeWalletId : '');
  const isEn = typeof isEnProp === 'boolean'
    ? isEnProp
    : Boolean(st && st.lang === 'en');
  const fmtAddr = typeof shortenAddr === 'function' ? shortenAddr : defaultShortenAddr;

  if (list.length === 0) {
    return (
      <EmptyState
        title={isEn ? 'No wallets' : '暂无钱包'}
        className="text-muted py-3"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {list.map((w, idx) => {
        const isActive = w.id === activeId;
        const nearId = w.nearNamedAccount || fmtAddr(w.nearAddress, 8, 6);
        return (
          <div
            key={w.id || idx}
            className="ios-glass-card flex items-center justify-between gap-2"
            style={{
              padding: '12px',
              borderColor: isActive ? 'rgba(0,236,151,0.45)' : 'var(--border-glass)'
            }}
          >
            <div
              className="min-w-0 flex-1"
              style={{ cursor: 'pointer' }}
              data-action="switch-wallet"
              data-wallet-id={w.id}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontWeight: 700, color: '#fff' }}>{w.name}</span>
                {isActive && (
                  <span className="ca-badge">{isEn ? 'Active' : '当前'}</span>
                )}
              </div>
              <div
                className="mono text-emerald"
                style={{ fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {nearId}
              </div>
            </div>
            {list.length > 1 && (
              <ActionButton
                type="button"
                className="btn-danger"
                dataAction="delete-wallet"
                data-wallet-id={w.id}
              >
                {isEn ? 'Delete' : '删除'}
              </ActionButton>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BackupSecretsPanel({
  rows = [],
  revealed = false,
  isEn: isEnProp,
  onToggleReveal
}) {
  const st = useWalletState(['lang']);
  const isEn = typeof isEnProp === 'boolean'
    ? isEnProp
    : Boolean(st && st.lang === 'en');

  return (
    <div className="flex flex-col gap-2">
      <div
        className="ios-glass-card flex flex-col gap-1"
        style={{
          padding: '10px 12px',
          borderColor: 'rgba(251,113,133,0.45)',
          background: 'rgba(251,113,133,0.08)'
        }}
      >
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--rose-alert)' }}>
          {`⚠️ ${isEn ? 'High Security Warning: Never Screenshot or Share' : '最高安全等级提醒：切勿截图或泄露'}`}
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <div>
            {isEn
              ? '• Write down offline on paper/metal. Never screenshot, record, or save in cloud/chat apps.'
              : '• 请使用纸笔或金属板离线抄写，切勿截图、录屏或存入微信/网盘/备忘录。'}
          </div>
          <div>
            {isEn
              ? '• Anyone asking for your phrase or key is a scammer. Leaked assets cannot be recovered.'
              : '• 任何索要助记词或私钥的人都是骗子，一旦泄露资产将永久被盗且无法追回。'}
          </div>
        </div>
        <button
          type="button"
          id="btn-backup-reveal-toggle"
          className="btn-secondary"
          style={{ marginTop: '6px', padding: '7px 12px', fontSize: '12px' }}
          onClick={typeof onToggleReveal === 'function' ? onToggleReveal : undefined}
        >
          {revealed
            ? (isEn ? 'Hide Phrase & Keys' : '隐藏助记词与私钥')
            : (isEn ? 'Reveal Phrase & Keys' : '显示助记词与私钥')}
        </button>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', padding: '4px 2px' }}>
        {isEn
          ? 'EVM & Solana are securely managed by this master account; Pearl (PRL) & Bitcoin (BTC) are locally derived from your phrase.'
          : 'EVM、Solana 由当前主账户安全管理；Pearl (PRL) 与 Bitcoin (BTC) 由助记词本地生成。'}
      </div>
      {rows.map((r, idx) => {
        const isSecret = Boolean(r.secret);
        const val = r.val || '';
        const displayVal = isSecret
          ? (revealed ? (val || '--') : (val ? '•••• •••• •••• •••• •••• ••••' : '--'))
          : (val || '--');
        return (
          <div key={r.label || idx} className="meta-list">
            <div className="meta-row">
              <span className="meta-key">{r.label}</span>
              <button
                type="button"
                className="btn-ghost-sm"
                data-secret-copy={isSecret ? '1' : undefined}
                data-action="copy-text"
                data-val={val}
                data-label={r.label}
              >
                {isEn ? 'Copy' : '复制'}
              </button>
            </div>
            <div
              className={`mono ${isSecret ? 'backup-secret-val' : ''}`}
              data-secret={val}
              style={{
                fontSize: '11px',
                wordBreak: 'break-all',
                color: '#fff',
                filter: isSecret && !revealed ? 'blur(4px)' : 'none',
                userSelect: isSecret && !revealed ? 'none' : 'text'
              }}
            >
              {displayVal}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WalletAddressesPanel({
  items = [],
  isEn: isEnProp,
  shortenAddr
}) {
  const st = useWalletState(['wallet', 'lang']);
  const isEn = typeof isEnProp === 'boolean'
    ? isEnProp
    : Boolean(st && st.lang === 'en');
  const fmtAddr = typeof shortenAddr === 'function' ? shortenAddr : defaultShortenAddr;

  if (!items || items.length === 0) {
    return (
      <EmptyState title={isEn ? 'No addresses available' : '暂无地址'} />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((x, idx) => (
        <div key={x.k || idx} className="meta-row hub-addr-row">
          <span className="meta-key">{x.k}</span>
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            <span className="mono" style={{ fontSize: '11px' }}>
              {fmtAddr(x.v, 8, 6)}
            </span>
            <button
              type="button"
              className="btn-ghost-sm hub-addr-copy-btn"
              data-action="copy-text"
              data-val={x.v || ''}
              data-label={x.k}
            >
              {isEn ? 'Copy' : '复制'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default {
  WalletListPanel,
  BackupSecretsPanel,
  WalletAddressesPanel
};
