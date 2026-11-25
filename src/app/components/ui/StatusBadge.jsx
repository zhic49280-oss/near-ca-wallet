import { h } from 'preact';

const TONE_CLASSES = {
  emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  rose: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  neutral: 'bg-slate-700/40 text-slate-300 border-slate-600/40'
};

/**
 * Compact status pill with semantic tone styling.
 */
export function StatusBadge({
  tone = 'neutral',
  className = '',
  children,
  ...rest
}) {
  const toneClass = TONE_CLASSES[tone] || TONE_CLASSES.neutral;
  return (
    <span
      class={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${toneClass} ${className}`.trim()}
      {...rest}
    >
      {children}
    </span>
  );
}

export default StatusBadge;
