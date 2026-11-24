import { h, render } from 'preact';
import jsQR from 'jsqr';
import { SwapHistoryPanel } from './components/SwapHistoryPanel.jsx';
import { AssetListPanel } from './components/AssetListPanel.jsx';
import { TokenPickerPanel } from './components/TokenPickerPanel.jsx';
import { PerpOverviewPanel } from './components/PerpOverviewPanel.jsx';
import { PerpOrderbookSidePanel, PerpBottomListPanel } from './components/PerpOrderbookAndPositions.jsx';
import { useWalletState, notifyFrameworkState } from './store/useWalletStore.js';

if (typeof window !== 'undefined' && !window.jsQR) window.jsQR = jsQR;
if (typeof globalThis !== 'undefined' && !globalThis.jsQR) globalThis.jsQR = jsQR;

export function mountSwapHistory(containerEl, opts = {}) {
  if (!containerEl) return false;
  render(h(SwapHistoryPanel, { getStatusLabel: opts.getStatusLabel }), containerEl);
  notifyFrameworkState('swap');
  return true;
}

export function mountAssetList(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(AssetListPanel, props), containerEl);
  return true;
}

export function mountTokenPicker(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(TokenPickerPanel, props), containerEl);
  return true;
}

export function mountPerpOverview(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(PerpOverviewPanel, props), containerEl);
  return true;
}

export function mountPerpOrderbookSide(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(PerpOrderbookSidePanel, props), containerEl);
  return true;
}

export function mountPerpBottomList(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(PerpBottomListPanel, props), containerEl);
  return true;
}

const NearCAFramework = {
  h,
  render,
  useWalletState,
  notifyFrameworkState,
  mountSwapHistory,
  mountAssetList,
  mountTokenPicker,
  mountPerpOverview,
  mountPerpOrderbookSide,
  mountPerpBottomList
};

if (typeof globalThis !== 'undefined') {
  globalThis.NearCAFramework = NearCAFramework;
}
if (typeof window !== 'undefined') {
  window.NearCAFramework = NearCAFramework;
}

export default NearCAFramework;
