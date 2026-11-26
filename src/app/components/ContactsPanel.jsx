import { h } from 'preact';
import { useLang } from '../store/useWalletStore.js';

function defaultShortenAddr(addr, head = 10, tail = 8) {
  const s = String(addr || '');
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

export function ContactsPanel({
  contacts = [],
  pickerTarget = null,
  isEn: isEnProp,
  shortenAddr
}) {
  const { isEn: ctxIsEn } = useLang();
  const isEn = (typeof window !== 'undefined' && window.NearCAState)
    ? ctxIsEn
    : (typeof isEnProp === 'boolean' ? isEnProp : ctxIsEn);
  if (!contacts || contacts.length === 0) {
    return (
      <div className="text-muted" style={{ textAlign: 'center', padding: '12px' }}>
        {isEn ? 'No saved contacts' : '暂无保存地址'}
      </div>
    );
  }

  const fmtAddr = typeof shortenAddr === 'function' ? shortenAddr : defaultShortenAddr;

  return (
    <div className="flex flex-col gap-2">
      {contacts.map((c, idx) => {
        const netLabel = c.network ? String(c.network).toUpperCase() : '';
        return (
          <div key={c.id || c.address || idx} className="meta-list">
            <div className="meta-row">
              <div className="flex items-center gap-2">
                <span style={{ fontWeight: 700, color: '#fff' }}>{c.name}</span>
                {netLabel && <span className="ca-badge">{netLabel}</span>}
              </div>
              <div className="flex gap-1">
                {pickerTarget ? (
                  <button
                    type="button"
                    className="mini-action-btn primary"
                    data-action="pick-contact"
                    data-addr={c.address || ''}
                  >
                    {isEn ? 'Use' : '选用'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost-sm"
                    data-action="copy-text"
                    data-val={c.address || ''}
                    data-label={c.name || ''}
                  >
                    {isEn ? 'Copy' : '复制'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-danger"
                  style={{ padding: '4px 8px', fontSize: '10.5px' }}
                  data-action="delete-contact"
                  data-id={c.id || ''}
                >
                  {isEn ? 'Del' : '删除'}
                </button>
              </div>
            </div>
            <div
              className="mono text-secondary"
              style={{ fontSize: '11px', wordBreak: 'break-all' }}
              title={c.address || ''}
            >
              {fmtAddr(c.address || '', 12, 10)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
