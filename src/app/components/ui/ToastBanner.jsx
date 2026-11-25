import { h } from 'preact';

const TONE_STYLES = {
  emerald: { borderColor: 'rgba(16, 185, 129, 0.45)' },
  amber: { borderColor: 'rgba(245, 158, 11, 0.45)' },
  rose: { borderColor: 'rgba(244, 63, 94, 0.45)' },
  neutral: {}
};

/**
 * Reusable reactive toast banner preserving the `.toast` / `.show` contract.
 */
export function ToastBanner({
  id = 'toast',
  message = '',
  visible = false,
  tone = 'neutral',
  className = '',
  onDismiss
}) {
  const isShown = Boolean(visible && message);
  const toneStyle = TONE_STYLES[tone] || TONE_STYLES.neutral;

  return (
    <div
      id={id}
      class={`toast ${isShown ? 'show' : ''} ${className}`.trim()}
      role="status"
      aria-live="polite"
      data-tone={tone}
      style={toneStyle}
      onClick={typeof onDismiss === 'function' ? onDismiss : undefined}
    >
      {message}
    </div>
  );
}

export default ToastBanner;
