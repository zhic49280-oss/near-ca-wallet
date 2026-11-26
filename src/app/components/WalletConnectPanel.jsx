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
        return (
          <div key={s.topic || idx} class="meta-list">
            <div class="meta-row">
              <span style={{ fontWeight: 700, color: '#fff' }}>{meta.name || 'DApp'}</span>
              <button
                type="button"
                class="btn-danger"
                style={{ padding: '4px 8px', fontSize: '10.5px' }}
                data-action="disconnect-wc"
                data-topic={s.topic || ''}
              >
                {isEn ? 'Disconnect' : '断开'}
              </button>
            </div>
            <span class="text-muted" style={{ fontSize: '11px' }}>
              {meta.url || s.topic || '--'}
            </span>
          </div>
        );
      })}
    </Fragment>
  );
}

function resolveProposalInfo(proposal) {
  if (!proposal) return null;
  if (proposal.name !== undefined || proposal.chainsText !== undefined) {
    return {
      name: proposal.name || 'DApp',
      url: proposal.url || '--',
      chainsText: proposal.chainsText || 'eip155:1, eip155:8453, eip155:56, eip155:42161'
    };
  }
  const params = proposal.params || {};
  const meta = (params.proposer && params.proposer.metadata) || {};
  const reqChains = (params.requiredNamespaces && params.requiredNamespaces.eip155 && params.requiredNamespaces.eip155.chains) || [];
  const optChains = (params.optionalNamespaces && params.optionalNamespaces.eip155 && params.optionalNamespaces.eip155.chains) || [];
  const merged = Array.from(new Set([...reqChains, ...optChains]));
  return {
    name: meta.name || 'DApp',
    url: meta.url || '--',
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
      <div id="wc-proposal-name" style={{ fontWeight: 700 }}>{info.name}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{info.url}</div>
      <div class="mono" style={{ fontSize: '11px', color: 'var(--cyan-glow)' }}>{info.chainsText}</div>
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
