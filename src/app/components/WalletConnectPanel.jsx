import { h, Fragment } from 'preact';
import { ActionButton } from './ui/ActionButton.jsx';
import { EmptyState } from './ui/EmptyState.jsx';
import { useLang } from '../store/useWalletStore.js';

export function WcSessionsPanel({
  sessions = [],
  isEn: isEnProp
}) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  const list = Array.isArray(sessions) ? sessions : [];
  if (list.length === 0) {
    return (
      <EmptyState
        title={isEn ? 'No active sessions' : '暂无已连接 DApp'}
        className="py-2"
      />
    );
  }

  return (
    <Fragment>
      {list.map((s, idx) => {
        const meta = (s && s.peer && s.peer.metadata) || {};
        const nsKeys = Object.keys((s && s.namespaces) || {});
        const nsLabel = nsKeys
          .map((k) => (k === 'eip155' ? 'EVM' : (k === 'solana' ? 'SOL' : k.toUpperCase())))
          .join(' · ');
        return (
          <div key={s.topic || idx} class="meta-list">
            <div class="meta-row" style={{ gap: '8px', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#fff', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta.name || 'DApp'}
              </span>
              <button
                type="button"
                class="btn-danger"
                style={{ padding: '4px 8px', fontSize: '10.5px', flexShrink: 0, whiteSpace: 'nowrap' }}
                data-action="disconnect-wc"
                data-topic={s.topic || ''}
              >
                {isEn ? 'Disconnect' : '断开'}
              </button>
            </div>
            <div class="flex items-center justify-between gap-2" style={{ minWidth: 0 }}>
              <span class="text-muted" style={{ fontSize: '11px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta.url || s.topic || '--'}
              </span>
              {nsLabel ? (
                <span class="badge badge-cyan" style={{ flexShrink: 0, fontSize: '10px', whiteSpace: 'nowrap' }}>{nsLabel}</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </Fragment>
  );
}

function extractNamespaceChains(nsMap, nsKey) {
  if (!nsMap || typeof nsMap !== 'object') return [];
  const out = [];
  if (nsMap[nsKey] && Array.isArray(nsMap[nsKey].chains)) {
    out.push(...nsMap[nsKey].chains);
  }
  for (const k of Object.keys(nsMap)) {
    if (k.startsWith(`${nsKey}:`)) out.push(k);
  }
  return out;
}

function resolveProposalInfo(proposal) {
  if (!proposal) return null;
  if (proposal.name !== undefined || proposal.chainsText !== undefined) {
    return {
      name: proposal.name || 'DApp',
      url: proposal.url || '--',
      namespaces: Array.isArray(proposal.namespaces) ? proposal.namespaces : [],
      chainsText: proposal.chainsText || 'eip155:1, eip155:8453, eip155:56, eip155:42161'
    };
  }
  const params = proposal.params || {};
  const meta = (params.proposer && params.proposer.metadata) || {};
  const reqNs = params.requiredNamespaces || {};
  const optNs = params.optionalNamespaces || {};
  const evmChains = [...extractNamespaceChains(reqNs, 'eip155'), ...extractNamespaceChains(optNs, 'eip155')];
  const solChains = [...extractNamespaceChains(reqNs, 'solana'), ...extractNamespaceChains(optNs, 'solana')];
  const nearChains = [...extractNamespaceChains(reqNs, 'near'), ...extractNamespaceChains(optNs, 'near')];
  const namespaces = [];
  if (evmChains.length || reqNs.eip155 || optNs.eip155) namespaces.push('EVM');
  if (solChains.length || reqNs.solana || optNs.solana) namespaces.push('Solana');
  if (nearChains.length || reqNs.near || optNs.near) namespaces.push('NEAR');
  const merged = Array.from(new Set([
    ...evmChains,
    ...solChains.map((c) => (c.startsWith('solana:') ? 'solana:mainnet' : c)),
    ...nearChains
  ]));
  return {
    name: meta.name || 'DApp',
    url: meta.url || '--',
    namespaces,
    chainsText: merged.length ? merged.join(', ') : 'eip155:1, eip155:8453, eip155:56, eip155:42161'
  };
}

export function WcProposalPanel({
  proposal = null,
  approving = false,
  isEn: isEnProp,
  onApprove,
  onReject
}) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  const info = resolveProposalInfo(proposal);
  if (!info) return null;

  return (
    <Fragment>
      <div class="flex items-center justify-between gap-2" style={{ minWidth: 0 }}>
        <div id="wc-proposal-name" style={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}</div>
        {info.namespaces.length > 0 ? (
          <div class="flex items-center gap-1" style={{ flexShrink: 0 }}>
            {info.namespaces.map((ns) => (
              <span key={ns} class="badge badge-cyan" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>{ns}</span>
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{info.url}</div>
      <div class="mono" style={{ fontSize: '11px', color: 'var(--cyan-glow)', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{info.chainsText}</div>
      <div class="flex gap-2">
        <ActionButton
          className="btn-secondary flex-1"
          disabled={approving}
          dataAction="reject-wc-proposal"
          onClick={onReject}
        >
          {isEn ? 'Reject' : '拒绝'}
        </ActionButton>
        <ActionButton
          className="btn-primary flex-1"
          loading={approving}
          loadingText={isEn ? 'Approving...' : '授权中...'}
          dataAction="approve-wc-proposal"
          onClick={onApprove}
        >
          {isEn ? 'Approve' : '批准'}
        </ActionButton>
      </div>
    </Fragment>
  );
}
