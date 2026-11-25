import { h, render } from 'preact';
import { SwapHistoryPanel } from './components/SwapHistoryPanel.jsx';
import { AssetListPanel } from './components/AssetListPanel.jsx';
import { TokenPickerPanel } from './components/TokenPickerPanel.jsx';
import { PerpOverviewPanel } from './components/PerpOverviewPanel.jsx';
import { PerpOrderbookSidePanel, PerpBottomListPanel } from './components/PerpOrderbookAndPositions.jsx';
import { LimitOrdersPanel } from './components/LimitOrdersPanel.jsx';
import { EarnPoolsPanel } from './components/EarnPoolsPanel.jsx';
import { TokenHistoryPanel } from './components/TokenHistoryPanel.jsx';
import { ContactsPanel } from './components/ContactsPanel.jsx';
import { NearKeysPanel, SolRentPanel, NearStoragePanel } from './components/HubToolsPanels.jsx';
import { useWalletState, notifyFrameworkState, useLang, useActiveWallet } from './store/useWalletStore.js';

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

export function mountLimitOrdersPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(LimitOrdersPanel, props), containerEl);
  return true;
}

export function mountEarnPoolsPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(EarnPoolsPanel, props), containerEl);
  return true;
}

export function mountTokenHistoryPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(TokenHistoryPanel, props), containerEl);
  return true;
}

export function mountContactsPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(ContactsPanel, props), containerEl);
  return true;
}

export function mountNearKeysPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(NearKeysPanel, props), containerEl);
  return true;
}

export function mountSolRentPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(SolRentPanel, props), containerEl);
  return true;
}

export function mountNearStoragePanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(NearStoragePanel, props), containerEl);
  return true;
}

const NearCAFramework = {
  h,
  render,
  useWalletState,
  notifyFrameworkState,
  useLang,
  useActiveWallet,
  mountSwapHistory,
  mountAssetList,
  mountTokenPicker,
  mountPerpOverview,
  mountPerpOrderbookSide,
  mountPerpBottomList,
  mountLimitOrdersPanel,
  mountEarnPoolsPanel,
  mountTokenHistoryPanel,
  mountContactsPanel,
  mountNearKeysPanel,
  mountSolRentPanel,
  mountNearStoragePanel
};

if (typeof globalThis !== 'undefined') {
  globalThis.NearCAFramework = NearCAFramework;
}
if (typeof window !== 'undefined') {
  window.NearCAFramework = NearCAFramework;
}

export default NearCAFramework;
