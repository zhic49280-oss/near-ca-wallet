import { useState, useEffect } from 'preact/hooks';

const _pendingTopics = new Set();
let _flushScheduled = false;

function scheduleMicrotask(fn) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn);
  } else {
    Promise.resolve().then(fn);
  }
}

function flushFrameworkNotifications() {
  _flushScheduled = false;
  if (_pendingTopics.size === 0) return;
  const topics = Array.from(_pendingTopics);
  _pendingTopics.clear();
  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    try {
      const primaryTopic = topics.length === 1 ? topics[0] : (topics.includes('*') ? '*' : topics[0]);
      window.dispatchEvent(new CustomEvent('nexus:state-updated', {
        detail: { topic: primaryTopic, topics }
      }));
    } catch (_) {}
  }
}

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
      const detail = (e && e.detail) || {};
      const evtTopics = Array.isArray(detail.topics) && detail.topics.length > 0
        ? detail.topics
        : [detail.topic || '*'];
      if (topicSet.has('*') || evtTopics.some((tp) => tp === '*' || topicSet.has(tp))) {
        bump();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('nexus:state-updated', onStateEvt);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('nexus:state-updated', onStateEvt);
      }
    };
  }, [topicKey]);

  return getSt();
}

/**
 * Coalesces rapid state notifications within the same microtask to prevent render thrashing.
 */
export function notifyFrameworkState(topic = '*') {
  _pendingTopics.add(String(topic || '*'));
  if (!_flushScheduled) {
    _flushScheduled = true;
    scheduleMicrotask(flushFrameworkNotifications);
  }
}

/**
 * Reactive language helper hook subscribing to 'lang' updates.
 */
export function useLang() {
  const st = useWalletState(['lang']);
  const lang = st && st.lang === 'en' ? 'en' : 'zh';
  const isEn = lang === 'en';
  const t = (zh, en) => (st && typeof st.t === 'function' ? st.t(zh, en) : (isEn ? en : zh));
  return { lang, isEn, t };
}

/**
 * Reactive active wallet hook subscribing to 'wallet' and 'balances' updates.
 */
export function useActiveWallet() {
  const st = useWalletState(['wallet', 'balances']);
  if (!st || typeof st.getActiveWallet !== 'function') return null;
  return st.getActiveWallet();
}

const _panelProps = new Map();
const _panelListeners = new Map();
const _registeredSlots = new Set();

/**
 * Registers a declarative PanelSlot ID so imperative mount* callers know it is tree-managed.
 */
export function registerPanelSlot(slotId) {
  if (!slotId) return () => {};
  _registeredSlots.add(slotId);
  return () => {
    _registeredSlots.delete(slotId);
  };
}

/**
 * Returns true when a PanelSlot with the given ID is currently mounted in the single-tree App.
 */
export function isPanelSlotRegistered(slotId) {
  return Boolean(slotId && _registeredSlots.has(slotId));
}

/**
 * Updates props for a specific PanelSlot and synchronously notifies only that slot's subscriber.
 */
export function setPanelProps(slotId, props) {
  if (!slotId) return;
  const next = props === undefined ? null : props;
  if (next === null) {
    _panelProps.delete(slotId);
  } else {
    _panelProps.set(slotId, next);
  }
  const listeners = _panelListeners.get(slotId);
  if (listeners && listeners.size > 0) {
    listeners.forEach((fn) => {
      try {
        fn(next);
      } catch (_) {}
    });
  }
}

/**
 * Clears props for a specific PanelSlot, reverting it to its empty state.
 */
export function clearPanelProps(slotId) {
  setPanelProps(slotId, null);
}

/**
 * Per-slot reactive hook: registers immediately on render so mountAppRoot() exposes slots synchronously,
 * and subscribes only to updates targeting this specific slotId.
 */
export function usePanelProps(slotId) {
  if (slotId) {
    _registeredSlots.add(slotId);
  }
  const [props, setProps] = useState(() => (slotId && _panelProps.has(slotId) ? _panelProps.get(slotId) : null));

  useEffect(() => {
    if (!slotId) return undefined;
    const unregister = registerPanelSlot(slotId);
    let listeners = _panelListeners.get(slotId);
    if (!listeners) {
      listeners = new Set();
      _panelListeners.set(slotId, listeners);
    }
    const onUpdate = (next) => {
      const normalized = next === undefined ? null : next;
      setProps(() => normalized);
    };
    listeners.add(onUpdate);
    const latest = _panelProps.has(slotId) ? _panelProps.get(slotId) : null;
    setProps((prev) => (prev === latest ? prev : latest));

    return () => {
      listeners.delete(onUpdate);
      if (listeners.size === 0) {
        _panelListeners.delete(slotId);
      }
      unregister();
    };
  }, [slotId]);

  return props ?? null;
}
