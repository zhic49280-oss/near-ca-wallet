import { h } from 'preact';

function defaultShortenAddr(addr, head = 14, tail = 8) {
  const s = String(addr || '');
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function defaultFormatBal(val, dp = 6) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '--';
  return Number(n.toFixed(dp)).toString();
}

export function NearKeysPanel({
  keys = [],
  loading = false,
  unactivated = false,
  errorMsg = '',
  busyKey = '',
  isEn = false,
  shortenAddr
}) {
  if (loading) {
    return (
      <div className="text-muted" style={{ fontSize: '12px', padding: '8px' }}>
        {isEn ? 'Loading account keys...' : '正在查询账户密钥...'}
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--rose-alert)', padding: '8px' }}>
        {errorMsg}
      </div>
    );
  }

  if (unactivated || !keys || keys.length === 0) {
    return (
      <div className="text-muted" style={{ fontSize: '12px', padding: '8px' }}>
        {isEn
          ? 'Account not yet activated (keys appear after first deposit or activation)'
          : '账户尚未激活（首次收款或激活后可见密钥）'}
      </div>
    );
  }

  const fmtAddr = typeof shortenAddr === 'function' ? shortenAddr : defaultShortenAddr;

  return (
    <div className="flex flex-col gap-2">
      {keys.map((k, idx) => {
        const pk = String(k.publicKey || k.public_key || '');
        const isFull = Boolean(k.isFull);
        const isCurrent = Boolean(k.isCurrent);
        const canDelete = Boolean(k.canDelete);
        const isBusy = Boolean(busyKey && pk === busyKey);

        return (
          <div
            key={pk || idx}
            className="ios-glass-card flex items-center justify-between gap-2"
            style={{ padding: '10px 12px' }}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
                <span className={`badge ${isFull ? 'badge-emerald' : 'badge-cyan'}`}>
                  {isFull
                    ? (isEn ? 'Full Key' : '完全权限密钥')
                    : (isEn ? 'App Key' : '应用授权密钥')}
                </span>
                {isCurrent && (
                  <span className="ca-badge">
                    {isEn ? 'In Use' : '当前使用'}
                  </span>
                )}
              </div>
              <div
                className="mono"
                style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '4px' }}
              >
                {fmtAddr(pk, 14, 8)}
              </div>
            </div>
            {canDelete && (
              <button
                type="button"
                className="btn-danger"
                data-action="delete-near-key"
                data-pk={pk}
                disabled={isBusy}
              >
                {isBusy ? (isEn ? 'Deleting...' : '删除中...') : (isEn ? 'Delete' : '删除')}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SolRentPanel({
  accounts = [],
  selectedAtas = [],
  loading = false,
  errorMsg = '',
  disabled = false,
  isEn = false,
  formatBal
}) {
  if (loading) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '12px', textAlign: 'center' }}>
        {isEn ? 'Scanning Solana token accounts...' : '正在扫描 Solana 代币账户...'}
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--rose-alert)', padding: '12px', textAlign: 'center' }}>
        {errorMsg}
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '16px', textAlign: 'center' }}>
        {isEn ? 'No reclaimable Solana token accounts found' : '当前钱包没有可回收的 Solana 代币账户'}
      </div>
    );
  }

  const selectedSet = selectedAtas instanceof Set ? selectedAtas : new Set(selectedAtas || []);
  const fmtBal = typeof formatBal === 'function' ? formatBal : defaultFormatBal;

  return (
    <div className="flex flex-col gap-2">
      {accounts.map((acc, idx) => {
        const checked = selectedSet.has(acc.ataAddress);
        const balInfo = acc.isEmpty
          ? (isEn ? 'Bal: 0' : '余额: 0')
          : `${isEn ? 'Bal' : '余额'}: ${fmtBal(acc.uiAmount, 6)}${acc.usdValue !== null && acc.usdValue !== undefined ? ` (~$${Number(acc.usdValue).toFixed(4)})` : ''}`;

        return (
          <label
            key={acc.ataAddress || idx}
            className="ios-glass-card flex items-center justify-between gap-2"
            style={{ padding: '10px 12px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.7 : 1 }}
          >
            <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                data-action="toggle-sol-rent"
                data-ata={acc.ataAddress || ''}
              />
              <div className="flex flex-col" style={{ minWidth: 0 }}>
                <div className="flex items-center gap-1">
                  <span style={{ fontWeight: 700, fontSize: '12.5px' }}>{acc.symbol || ''}</span>
                  {acc.isEmpty ? (
                    <span className="ca-badge" style={{ fontSize: '10px' }}>
                      {isEn ? 'Empty' : '空账户'}
                    </span>
                  ) : acc.isDust ? (
                    <span className="ca-badge" style={{ fontSize: '10px', borderColor: 'rgba(251,113,133,0.4)', color: 'var(--rose-alert)' }}>
                      {isEn ? 'Burn Dust' : '粉尘粉碎'}
                    </span>
                  ) : (
                    <span className="ca-badge" style={{ fontSize: '10px', borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24' }}>
                      {isEn ? 'Has Balance' : '有余额 (慎选)'}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{balInfo}</span>
              </div>
            </div>
            <span className="mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--mint-accent)', whiteSpace: 'nowrap' }}>
              +{Number(acc.rentSol || 0).toFixed(4)} SOL
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function NearStoragePanel({
  accounts = [],
  selectedContracts = [],
  loading = false,
  errorMsg = '',
  disabled = false,
  isEn = false,
  formatBal
}) {
  if (loading) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '12px', textAlign: 'center' }}>
        {isEn ? 'Scanning NEAR token storage deposits...' : '正在扫描 NEAR 代币合约存储押金...'}
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--rose-alert)', padding: '12px', textAlign: 'center' }}>
        {errorMsg}
      </div>
    );
  }

  if (!accounts || accounts.length === 0) {
    return (
      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', padding: '16px', textAlign: 'center' }}>
        {isEn ? 'No NEAR token storage deposits found' : '当前 NEAR 账户暂无检测到存储押金记录'}
      </div>
    );
  }

  const selectedSet = selectedContracts instanceof Set ? selectedContracts : new Set(selectedContracts || []);
  const fmtBal = typeof formatBal === 'function' ? formatBal : defaultFormatBal;

  return (
    <div className="flex flex-col gap-2">
      {accounts.map((acc, idx) => {
        const checked = Boolean(acc.isEmpty && selectedSet.has(acc.contractId));
        const itemDisabled = !acc.isEmpty || disabled;
        const balInfo = acc.isEmpty
          ? `${isEn ? 'Bal: 0' : '余额: 0'} · ${acc.contractId}`
          : `${isEn ? 'Bal' : '余额'}: ${fmtBal(acc.uiAmount, 5)} · ${acc.contractId}`;

        return (
          <label
            key={acc.contractId || idx}
            className="ios-glass-card flex items-center justify-between gap-2"
            style={{
              padding: '10px 12px',
              cursor: itemDisabled ? 'default' : 'pointer',
              opacity: acc.isEmpty ? (disabled ? 0.7 : 1) : 0.75
            }}
          >
            <div className="flex items-center gap-2" style={{ minWidth: 0, flex: 1 }}>
              <input
                type="checkbox"
                checked={checked}
                disabled={itemDisabled}
                data-action="toggle-near-storage"
                data-contract={acc.contractId || ''}
              />
              <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-center gap-1">
                  <span style={{ fontWeight: 700, fontSize: '12.5px' }}>{acc.symbol || ''}</span>
                  {acc.isEmpty ? (
                    <span className="ca-badge" style={{ fontSize: '10px' }}>
                      {isEn ? 'Empty · Reclaimable' : '空账本可回收'}
                    </span>
                  ) : (
                    <span className="ca-badge" style={{ fontSize: '10px', borderColor: 'rgba(251,191,36,0.4)', color: '#fbbf24' }}>
                      {isEn ? 'In Use' : '持仓中'}
                    </span>
                  )}
                </div>
                <span className="mono" style={{ fontSize: '10.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {balInfo}
                </span>
              </div>
            </div>
            <span
              className="mono"
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: acc.isEmpty ? 'var(--mint-accent)' : 'var(--text-secondary)',
                whiteSpace: 'nowrap'
              }}
            >
              +{Number(acc.depositNear || 0).toFixed(5)} NEAR
            </span>
          </label>
        );
      })}
    </div>
  );
}
