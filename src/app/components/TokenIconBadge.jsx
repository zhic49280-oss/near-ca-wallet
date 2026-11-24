import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

function getTokensMod() {
  return (typeof window !== 'undefined' && window.NearCATokens) || globalThis.NearCATokens || {};
}

function normalizeSymbolLabel(symbol) {
  let clean = String(symbol || '?').trim().toUpperCase().replace(/^\$/, '');
  if (clean.includes(':')) clean = clean.split(':').slice(1).join(':');
  clean = clean.replace(/-(USDC|PERP|USD)$/, '');
  if (clean === 'PEARL') return 'PRL';
  if (/^1000000[A-Z0-9]{2,}$/.test(clean)) return clean.slice(7);
  if (/^1000[A-Z0-9]{2,}$/.test(clean)) return clean.slice(4);
  if (/^K[A-Z0-9]{3,}$/.test(clean)) return clean.slice(1);
  return clean || '?';
}

function PearlIridescentSvg({ size }) {
  const s = Number(size) || 36;
  return (
    <svg width={s} height={s} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="rounded-full flex-shrink-0">
      <defs>
        <radialGradient id="prlShell_jsx" cx="35%" cy="28%" r="72%" fx="30%" fy="24%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="32%" stopColor="#E0F7FA" />
          <stop offset="65%" stopColor="#C7D2FE" />
          <stop offset="88%" stopColor="#67E8F9" />
          <stop offset="100%" stopColor="#0E7490" />
        </radialGradient>
        <linearGradient id="prlRim_jsx" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A5F3FC" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#E9D5FF" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="17.2" fill="url(#prlShell_jsx)" stroke="url(#prlRim_jsx)" strokeWidth="1.5" />
      <ellipse cx="12.5" cy="10.8" rx="5.2" ry="2.7" transform="rotate(-24 12.5 10.8)" fill="#FFFFFF" fillOpacity="0.72" />
      <circle cx="9.2" cy="14.5" r="1.3" fill="#FFFFFF" fillOpacity="0.65" />
      <path d="M13.6 10.8C10.5 10.8 8.4 13.1 8.4 16C8.4 18.9 10.5 21.2 13.6 21.2V10.8Z" fill="#0F172A" fillOpacity="0.88" />
      <path fillRule="evenodd" clipRule="evenodd" d="M15.4 10.8H20.6C24 10.8 26.2 12.9 26.2 16C26.2 19.1 24 21.2 20.6 21.2H18.4V24.6H20.6V26.2H13.6V24.6H15.4V10.8ZM18.4 12.8V19.2H20.4C22.3 19.2 23.4 18 23.4 16C23.4 14 22.3 12.8 20.4 12.8H18.4Z" fill="#0F172A" fillOpacity="0.88" />
    </svg>
  );
}

const FALLBACK_BG_MAP = {
  USDT: '#26A17B',
  USDC: '#2775CA',
  BTC: '#F7931A',
  CBBTC: '#0052FF',
  ETH: '#627EEA',
  WETH: '#627EEA',
  SOL: '#141726',
  NEAR: '#00EC97',
  WNEAR: '#00EC97',
  BNB: '#F3BA2F',
  DAI: '#F5AC37',
  TRX: '#EB0029',
  ARB: '#12AAFF',
  HYPE: '#072723',
  PONS: '#10B981',
  USDG: '#16A34A',
  USDE: '#1E293B'
};

export function TokenIconBadge({ symbol = '?', blockchain = '', logoURI = '', contractAddress = '', size = 36, showChainBadge = true }) {
  const tokens = getTokensMod();
  const s = Number(size) || 36;
  const cleanSym = normalizeSymbolLabel(symbol);
  const resolved = typeof tokens.resolveTokenIcon === 'function'
    ? tokens.resolveTokenIcon({ symbol, blockchain, logoURI, contractAddress })
    : { primaryUrl: logoURI || '', fallbackUrl: '', secondFallbackUrl: '', isPearlSvg: cleanSym === 'PRL' };

  const [srcStage, setSrcStage] = useState(0);
  useEffect(() => {
    setSrcStage(0);
  }, [symbol, blockchain, logoURI, contractAddress]);

  const candidates = [resolved.primaryUrl, resolved.fallbackUrl, resolved.secondFallbackUrl].filter(Boolean);
  const activeUrl = resolved.isPearlSvg ? '' : (candidates[srcStage] || '');
  const meta = blockchain && typeof tokens.getChainMeta === 'function' ? tokens.getChainMeta(blockchain) : null;
  const badgeSvgDataUri = meta && meta.badgeSvg
    ? `data:image/svg+xml;utf8,${encodeURIComponent(meta.badgeSvg)}`
    : '';
  const bg = FALLBACK_BG_MAP[cleanSym] || (meta && meta.color) || '#334155';
  const textColor = (cleanSym === 'NEAR' || cleanSym === 'WNEAR' || cleanSym === 'BNB')
    ? '#000000'
    : (cleanSym === 'HYPE' ? '#97FCE4' : '#FFFFFF');
  const label = cleanSym.slice(0, 4) || '?';
  const fontSize = label.length >= 4 ? 8.5 : (label.length === 3 ? 10 : 12);

  return (
    <span className="relative inline-flex items-center justify-center flex-shrink-0" style={{ width: `${s}px`, height: `${s}px` }}>
      <span className="w-full h-full rounded-full overflow-hidden inline-flex items-center justify-center bg-white/[0.06]">
        {resolved.isPearlSvg ? (
          <PearlIridescentSvg size={s} />
        ) : activeUrl ? (
          <img
            src={activeUrl}
            alt={cleanSym}
            width={s}
            height={s}
            style={{ width: `${s}px`, height: `${s}px` }}
            className="rounded-full object-cover flex-shrink-0"
            onError={() => setSrcStage((n) => n + 1)}
          />
        ) : (
          <svg width={s} height={s} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="rounded-full flex-shrink-0">
            <circle cx="16" cy="16" r="16" fill={bg} />
            <text x="16" y="19.5" textAnchor="middle" fill={textColor} fontSize={fontSize} fontWeight="800" fontFamily="system-ui,-apple-system,sans-serif">
              {label}
            </text>
          </svg>
        )}
      </span>
      {showChainBadge && meta && meta.key !== 'unknown' && (
        badgeSvgDataUri ? (
          <span
            title={meta.name}
            className="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full overflow-hidden ring-2 ring-[#0B0F19] bg-[#0B0F19] flex items-center justify-center shadow-sm"
          >
            <img src={badgeSvgDataUri} alt={meta.shortName || meta.key} width={14} height={14} style={{ width: '14px', height: '14px' }} />
          </span>
        ) : (
          <span
            title={meta.name}
            className="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full overflow-hidden ring-2 ring-[#0B0F19] bg-[#0B0F19] flex items-center justify-center shadow-sm"
            style={{ background: meta.color || '#1e293b', fontSize: '7px', fontWeight: 700, color: '#fff' }}
          >
            {String(meta.shortName || meta.key || '').slice(0, 2).toUpperCase()}
          </span>
        )
      )}
    </span>
  );
}
