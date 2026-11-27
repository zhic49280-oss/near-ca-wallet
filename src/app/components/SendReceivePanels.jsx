import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
import { StatusBadge } from './ui/StatusBadge.jsx';

export function SendFeeSummaryPanel({
  visible = false,
  errorText = '',
  fromChain = '',
  toChain = '',
  feePctText = '',
  estOutText = '',
  warnText = '',
  isEn: isEnProp
}) {
  const st = useWalletState(['lang']);
  const isEn = typeof isEnProp === 'boolean'
    ? isEnProp
    : Boolean(st && st.lang === 'en');

  if (!visible) return null;

  if (errorText) {
    return (
      <div style={{ fontSize: '11.5px', color: 'var(--rose-alert)' }}>
        {errorText}
      </div>
    );
  }

  const routeLabel = [fromChain, toChain].filter(Boolean).join(' ➔ ');
  const feeLabel = isEn ? 'Cross-Chain Fee' : '跨链服务费';

  return (
    <div className="flex flex-col gap-1" style={{ fontSize: '11.5px' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="mono" style={{ fontWeight: 700, color: '#fff' }}>
          {routeLabel}
        </span>
        {feePctText && (
          <StatusBadge tone="neutral">
            {`${feeLabel}: ${feePctText}`}
          </StatusBadge>
        )}
      </div>
      {estOutText ? (
        <div className="mono" style={{ color: 'var(--near-emerald)' }}>
          {estOutText}
        </div>
      ) : warnText ? (
        <div style={{ color: 'var(--amber-400, #fbbf24)' }}>
          {warnText}
        </div>
      ) : null}
    </div>
  );
}

export function ReceiveAddressListPanel({
  options = [],
  selectedNetwork = 'near',
  mode = 'pills',
  address = '',
  isEn: isEnProp
}) {
  const st = useWalletState(['receive', 'lang']);
  const isEn = typeof isEnProp === 'boolean'
    ? isEnProp
    : Boolean(st && st.lang === 'en');

  if (mode === 'address') {
    return address || '--';
  }

  if (mode === 'qtc-loading') {
    return (
      <span style={{ color: 'var(--text-secondary)' }}>
        {isEn ? 'Fetching QTC deposit address...' : '正在获取 QTC 收款地址...'}
      </span>
    );
  }

  if (mode === 'qtc-error') {
    return (
      <span>
        <span>{isEn ? 'Failed to fetch QTC deposit address' : '获取 QTC 收款地址失败'}</span>
        {' '}
        <button
          type="button"
          className="mini-action-btn primary"
          style={{ marginLeft: '6px' }}
          data-action="select-receive-network"
          data-net="qtc"
        >
          {isEn ? 'Retry' : '重试'}
        </button>
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className={`filter-pill ${selectedNetwork === o.key ? 'active' : ''}`}
          data-action="select-receive-network"
          data-net={o.key}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default {
  SendFeeSummaryPanel,
  ReceiveAddressListPanel
};
