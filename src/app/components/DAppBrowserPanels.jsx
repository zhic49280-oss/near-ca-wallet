import { h, Fragment } from 'preact';
import { ActionButton } from './ui/ActionButton.jsx';
import { EmptyState } from './ui/EmptyState.jsx';
import { useLang } from '../store/useWalletStore.js';

export function DAppBookmarksPanel({
  mode = 'catalog',
  connected = [],
  catalog = [],
  chainFilter = 'ALL',
  isEn: isEnProp
}) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  if (mode === 'connected') {
    const list = Array.isArray(connected) ? connected : [];
    if (list.length === 0) return null;
    return (
      <Fragment>
        <div class="flex items-center justify-between gap-2">
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
            {`${isEn ? 'Connected DApps' : '已连接应用'} (${list.length})`}
          </span>
          <button
            type="button"
            class="btn-ghost-sm"
            data-action="disconnect-all-dapp-origins"
            style={{ fontSize: '10.5px' }}
          >
            {isEn ? 'Disconnect All' : '全部断开'}
          </button>
        </div>
        {list.map((item, idx) => (
          <div key={item.origin || idx} class="dapp-connected-row">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div class="mono truncate" style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
                {item.host || item.origin}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--near-emerald)' }}>
                {item.badges || ''}
              </div>
            </div>
            <button
              type="button"
              class="btn-danger"
              style={{ padding: '4px 8px', fontSize: '10.5px' }}
              data-action="disconnect-dapp-origin"
              data-origin={item.origin || ''}
            >
              {isEn ? 'Disconnect' : '断开'}
            </button>
          </div>
        ))}
      </Fragment>
    );
  }

  if (mode === 'filters') {
    const filters = [
      { key: 'ALL', label: isEn ? 'All' : '全部' },
      { key: 'NEAR', label: 'NEAR' },
      { key: 'EVM', label: 'EVM' },
      { key: 'Solana', label: 'Solana' }
    ];
    return (
      <Fragment>
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            class={`filter-pill ${chainFilter === f.key ? 'active' : ''}`}
            data-action="set-dapp-filter"
            data-chain={f.key}
          >
            {f.label}
          </button>
        ))}
      </Fragment>
    );
  }

  const rows = (Array.isArray(catalog) ? catalog : []).filter(
    (d) => chainFilter === 'ALL' || d.chain === chainFilter
  );
  if (rows.length === 0) {
    return (
      <EmptyState
        title={isEn ? 'No matching DApps' : '暂无匹配的 DApp'}
        className="py-4"
      />
    );
  }

  return (
    <Fragment>
      {rows.map((d, idx) => {
        const desc = isEn ? (d.descEn || '') : (d.descZh || '');
        let host = d.url || '';
        try {
          host = new URL(d.url).hostname;
        } catch (_) {}
        return (
          <button
            key={d.url || idx}
            type="button"
            class="dapp-catalog-card"
            data-action="launch-dapp"
            data-url={d.url || ''}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div class="flex items-center gap-2">
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#fff' }}>{d.name}</span>
                <span class="dapp-badge-pill">{d.badge || d.chain}</span>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>{desc}</div>
              <div class="mono" style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{host}</div>
            </div>
            <span style={{ color: 'var(--text-muted)', fontSize: '16px' }}>›</span>
          </button>
        );
      })}
    </Fragment>
  );
}

export function DAppApprovePanel({
  origin = '--',
  chainLabel = '--',
  method = '--',
  account = '--',
  summary = '--',
  approving = false,
  isEn: isEnProp,
  onConfirm,
  onReject
}) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  return (
    <Fragment>
      <div class="meta-list">
        <div class="meta-row">
          <span class="meta-key">{isEn ? 'Origin' : '来源网站'}</span>
          <span id="dapp-approve-origin" class="meta-val mono">{origin || '--'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">{isEn ? 'Network' : '目标网络'}</span>
          <span id="dapp-approve-chain" class="meta-val">{chainLabel || '--'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">{isEn ? 'Action' : '请求操作'}</span>
          <span id="dapp-approve-method" class="meta-val mono">{method || '--'}</span>
        </div>
        <div class="meta-row">
          <span class="meta-key">{isEn ? 'Account' : '签署账户'}</span>
          <span id="dapp-approve-account" class="meta-val mono">{account || '--'}</span>
        </div>
      </div>
      <div
        id="dapp-approve-detail"
        class="ios-glass-card mono"
        style={{
          padding: '10px 12px',
          fontSize: '11.5px',
          maxHeight: '150px',
          overflowY: 'auto',
          wordBreak: 'break-all',
          color: 'var(--text-secondary)'
        }}
      >
        {summary || '--'}
      </div>
      <div class="flex gap-2">
        <ActionButton
          id="btn-dapp-reject"
          className="btn-secondary flex-1"
          disabled={approving}
          dataAction="reject-dapp-approval"
          onClick={onReject}
        >
          {isEn ? 'Reject' : '拒绝'}
        </ActionButton>
        <ActionButton
          id="btn-dapp-confirm"
          className="btn-primary flex-1"
          loading={approving}
          loadingText={isEn ? 'Signing...' : '处理中...'}
          dataAction="confirm-dapp-approval"
          onClick={onConfirm}
        >
          {isEn ? 'Approve & Sign' : '授权并签名'}
        </ActionButton>
      </div>
    </Fragment>
  );
}
