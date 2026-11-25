import { h } from 'preact';

/**
 * Centered empty or loading state placeholder.
 */
export function EmptyState({
  icon = '',
  title = '',
  description = '',
  loading = false,
  className = '',
  children
}) {
  return (
    <div class={`flex flex-col items-center justify-center text-center py-6 px-4 text-slate-400 text-xs ${className}`.trim()}>
      {loading ? (
        <span class="inline-block w-4 h-4 mb-2 rounded-full border-2 border-slate-500 border-t-emerald-400 animate-spin" aria-hidden="true" />
      ) : icon ? (
        <div class="text-base mb-1.5 opacity-80" aria-hidden="true">{icon}</div>
      ) : null}
      {title ? <div class="text-slate-200 font-medium text-xs">{title}</div> : null}
      {description ? <div class="text-slate-400 text-[11px] mt-1">{description}</div> : null}
      {children}
    </div>
  );
}

export default EmptyState;
