import { useState, useEffect } from 'preact/hooks';

/**
 * Reactive bridge to window.NearCAState for Preact components.
 * Triggers re-render on language change or explicit notify() calls.
 */
export function useWalletState() {
  const getSt = () => (typeof window !== 'undefined' && window.NearCAState) || globalThis.NearCAState || null;
  const [, setTick] = useState(0);

  useEffect(() => {
    const st = getSt();
    if (!st) return undefined;
    const bump = () => setTick((n) => n + 1);
    const unsubLang = typeof st.onLanguageChange === 'function' ? st.onLanguageChange(bump) : null;
    if (typeof window !== 'undefined') {
      window.addEventListener('nexus:state-updated', bump);
    }
    return () => {
      if (typeof unsubLang === 'function') unsubLang();
      if (typeof window !== 'undefined') {
        window.removeEventListener('nexus:state-updated', bump);
      }
    };
  }, []);

  return getSt();
}

export function notifyFrameworkState() {
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('nexus:state-updated'));
    } catch (_) {}
  }
}
