import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
import { StatusBadge } from './ui/StatusBadge.jsx';

const DEV_JARGON_RE = /\b(1Click|Bridge2|HTTP|RPC)\b/gi;

export function sanitizeRouteLabel(raw, isEn = false) {
  const s = String(raw || '').trim();
  if (!s || s === '--') return '--';
  if (!DEV_JARGON_RE.test(s)) return s;
  DEV_JARGON_RE.lastIndex = 0;
  let cleaned = s
    .replace(/1Click\s*\(Pearl\s*➔\s*NEAR\)\s*\+\s*/gi, isEn ? 'Cross-Chain (Pearl ➔ NEAR) + ' : '跨链桥 (Pearl ➔ NEAR) + ')
    .replace(/1Click\s+Cross-Chain/gi, isEn ? 'Cross-Chain Route' : '跨链聚合路由')
    .replace(/\b1Click\b/gi, isEn ? 'Cross-Chain' : '跨链桥')
    .replace(/\bBridge2\b/gi, isEn ? 'Bridge' : '跨链桥')
    .replace(/\b(?:HTTP|RPC)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || (isEn ? 'Cross-Chain Route' : '跨链聚合路由');
}

function getStatusTone(rawStatus, followUpFailed, isStage1Done) {
  if (followUpFailed) return 'rose';
  const upper = String(rawStatus || '').toUpperCase();
  if (upper === 'FAILED' || upper === 'REFUNDED') return 'rose';
  if (upper === 'SUCCESS' || upper === 'COMPLETED') return isStage1Done ? 'amber' : 'emerald';
  return 'amber';
}

export function SwapActiveOrderPanel({
  status = '',
  statusLabel = '',
  pendingFollow = false,
  isStage1Done = false,
  followUpFailed = false,
  followUpError = '',
  isEn: isEnProp
}) {
  const st = useWalletState(['swap', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');
  const tone = getStatusTone(status, followUpFailed, pendingFollow && isStage1Done);
  const friendly = statusLabel || status || '--';

  let message = friendly;
  if (followUpFailed && followUpError) {
    message = `${friendly} · ${followUpError} (${isEn ? 'Tap Resume below to complete stage 2' : '请点击下方按钮继续完成第二阶段兑换'})`;
  } else if (pendingFollow && isStage1Done) {
    message = isEn
      ? 'Stage 1 arrived · Executing stage 2 swap...'
      : '阶段 1 已到账 · 正在自动执行阶段 2 兑换...';
  } else if (pendingFollow) {
    message = isEn
      ? `Stage 1/2: ${friendly} (Keep open; stage 2 runs automatically on arrival)`
      : `阶段 1/2: ${friendly} (请保持页面开启，到账后自动执行阶段 2)`;
  }

  return (
    <span class="inline-flex items-center gap-1.5 flex-wrap justify-end">
      <StatusBadge tone={tone}>{friendly}</StatusBadge>
      {message !== friendly ? <span class="text-[11px]">{message}</span> : null}
    </span>
  );
}

export function SwapRouteInfoPanel({
  routeText = '--',
  quoting = false,
  errorText = '',
  isEn: isEnProp
}) {
  const st = useWalletState(['swap', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');

  if (errorText) {
    return <span class="text-rose-300">{sanitizeRouteLabel(errorText, isEn)}</span>;
  }
  if (quoting) {
    return (
      <span class="inline-flex items-center gap-1 text-slate-300">
        {isEn ? 'Comparing pools...' : '多池比价中...'}
      </span>
    );
  }
  const clean = sanitizeRouteLabel(routeText, isEn);
  return <span>{clean}</span>;
}
