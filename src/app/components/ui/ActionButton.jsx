import { h } from 'preact';

/**
 * Unified async-safe button that prevents double-clicks and shows instant loading text.
 */
export function ActionButton({
  loading = false,
  loadingText,
  disabled = false,
  className = '',
  onClick,
  dataAction,
  type = 'button',
  children,
  ...rest
}) {
  const isDisabled = Boolean(disabled || loading);

  const handleClick = (e) => {
    if (isDisabled) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    if (typeof onClick === 'function') {
      onClick(e);
    }
  };

  return (
    <button
      type={type}
      class={className}
      disabled={isDisabled}
      aria-busy={loading ? 'true' : undefined}
      data-action={dataAction}
      onClick={handleClick}
      {...rest}
    >
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

export default ActionButton;
