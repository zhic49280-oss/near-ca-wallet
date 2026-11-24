import { h, render } from 'preact';
import { SwapHistoryPanel } from './components/SwapHistoryPanel.jsx';
import { useWalletState, notifyFrameworkState } from './store/useWalletStore.js';

export function mountSwapHistory(containerEl, opts = {}) {
  if (!containerEl) return false;
  render(h(SwapHistoryPanel, { getStatusLabel: opts.getStatusLabel }), containerEl);
  notifyFrameworkState();
  return true;
}

const NearCAFramework = {
  h,
  render,
  useWalletState,
  notifyFrameworkState,
  mountSwapHistory
};

if (typeof globalThis !== 'undefined') {
  globalThis.NearCAFramework = NearCAFramework;
}
if (typeof window !== 'undefined') {
  window.NearCAFramework = NearCAFramework;
}

export default NearCAFramework;
