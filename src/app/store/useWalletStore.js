import { useState, useEffect } from 'preact/hooks';

/**
 * Topic-scoped reactive bridge to window.NearCAState for Preact components.
 * Only triggers re-renders when a matching topic (or '*') is notified.
 */
export function useWalletState(topics = ['*']) {
  const getSt = () => (typeof window !== 'undefined' && window.NearCAState) || globalThis.NearCAState || null;
  const [, setTick] = useState(0);
  const topicKey = Array.isArray(topics) ? topics.join('|') : String(topics || '*');

  useEffect(() => {
    const st = getSt();
    if (!st) return undefined;
    const topicSet = new Set(topicKey.split('|').filter(Boolean));
    const bump = () => setTick((n) => n + 1);
    const onStateEvt = (e) => {
      const evtTopic = (e && e.detail && e.detail.topic) || '*';
      if (topicSet.has('*') || evtTopic === '*' || topicSet.has(evtTopic)) {
        bump();
      }
    };
    const unsubLang = typeof st.onLanguageChange === 'function' ? st.onLanguageChange(bump) : null;
    if (typeof window !== 'undefined') {
      window.addEventListener('nexus:state-updated', onStateEvt);
    }
    return () => {
      if (typeof unsubLang === 'function') unsubLang();
      if (typeof window !== 'undefined') {
        window.removeEventListener('nexus:state-updated', onStateEvt);
      }
    };
  }, [topicKey]);

  return getSt();
}

export function notifyFrameworkState(topic = '*') {
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('nexus:state-updated', { detail: { topic } }));
    } catch (_) {}
  }
}
