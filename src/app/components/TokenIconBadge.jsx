import { h } from 'preact';
import { useState } from 'preact/hooks';

function getTokensMod() {
  return (typeof window !== 'undefined' && window.NearCATokens) || globalThis.NearCATokens || {};
}

export function TokenIconBadge({ symbol = '?', blockchain = '', logoURI = '', contractAddress = '', size = 36, showChainBadge = true }) {
  const tokens = getTokensMod();
  const s = Number(size) || 36;
  const resolved = typeof tokens.resolveTokenIcon === 'function'
    ? tokens.resolveTokenIcon({ symbol, blockchain, logoURI, contractAddress })
    : { primaryUrl: logoURI || '', fallbackUrl: '', secondFallbackUrl: '', isPearlSvg: false };

  const [srcStage, setSrcStage] = useState(0);
  const candidates = [resolved.primaryUrl, resolved.fallbackUrl, resolved.secondFallbackUrl].filter(Boolean);
  const activeUrl = candidates[srcStage] || '';
  const symText = String(symbol || '?').toUpperCase().slice(0, 4);
  const meta = blockchain && typeof tokens.getChainMeta === 'function' ? tokens.getChainMeta(blockchain) : null;

  return (
    <span className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: `${s}px`, height: `${s}px` }}>
      <span className="w-full h-full rounded-full overflow-hidden inline-flex items-center justify-center bg-white/[0.06]">
        {activeUrl ? (
          <img
            src={activeUrl}
            alt={symText}
            width={s}
            height={s}
            style={{ width: `${s}px`, height: `${s}px` }}
            className="rounded-full object-cover flex-shrink-0"
            onError={() => setSrcStage((n) => n + 1)}
          />
        ) : (
          <span
            style={{
              width: `${s}px`,
              height: `${s}px`,
              fontSize: `${Math.max(9, Math.round(s * 0.32))}px`,
              fontWeight: 700,
              color: '#e2e8f0',
              background: (meta && meta.color) ? meta.color : '#334155',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '9999px'
            }}
          >
            {symText.slice(0, 3)}
          </span>
        )}
      </span>
      {showChainBadge && meta && meta.key !== 'unknown' && (
        <span
          title={meta.name}
          className="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full overflow-hidden ring-2 ring-[#0B0F19] bg-[#0B0F19] flex items-center justify-center shadow-sm"
          style={{ background: meta.color || '#1e293b', fontSize: '7px', fontWeight: 700, color: '#fff' }}
        >
          {String(meta.shortName || meta.key || '').slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
