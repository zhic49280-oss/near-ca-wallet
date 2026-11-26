import { h, render } from 'preact';
import { App } from './App.jsx';
import { SwapHistoryPanel } from './components/SwapHistoryPanel.jsx';
import { AssetListPanel } from './components/AssetListPanel.jsx';
import { TokenPickerPanel } from './components/TokenPickerPanel.jsx';
import { PerpOverviewPanel } from './components/PerpOverviewPanel.jsx';
import { PerpOrderbookSidePanel, PerpBottomListPanel, PerpOverviewPositionsPanel } from './components/PerpOrderbookAndPositions.jsx';
import { LimitOrdersPanel } from './components/LimitOrdersPanel.jsx';
import { EarnPoolsPanel } from './components/EarnPoolsPanel.jsx';
import { TokenHistoryPanel } from './components/TokenHistoryPanel.jsx';
import { ContactsPanel } from './components/ContactsPanel.jsx';
import { NearKeysPanel, SolRentPanel, NearStoragePanel } from './components/HubToolsPanels.jsx';
import { WalletListPanel, BackupSecretsPanel, WalletAddressesPanel } from './components/WalletManagerPanels.jsx';
import { SendFeeSummaryPanel, ReceiveAddressListPanel } from './components/SendReceivePanels.jsx';
import { TokenBreakdownPanel, TxDetailPanel, TxHistorySheetPanel } from './components/TokenDetailPanels.jsx';
import { SwapActiveOrderPanel, SwapRouteInfoPanel } from './components/SwapQuoteStatusPanel.jsx';
import { PerpMarketsSheetPanel, PerpFundingInfoPanel, PerpChartHudPanel } from './components/PerpDetailPanels.jsx';
import { EarnStakeSheetPanel, EarnValidatorsPanel } from './components/EarnStakeSheetPanel.jsx';
import { MiningTelemetryPanel, MiningWorkersPanel } from './components/MiningProPanel.jsx';
import { WcSessionsPanel, WcProposalPanel } from './components/WalletConnectPanel.jsx';
import { DAppBookmarksPanel, DAppApprovePanel } from './components/DAppBrowserPanels.jsx';
import { ToastBanner } from './components/ui/ToastBanner.jsx';
import { TxFlowModal } from './components/TxFlowModals.jsx';
import {
  useWalletState,
  notifyFrameworkState,
  useLang,
  useActiveWallet,
  registerPanelSlot,
  isPanelSlotRegistered,
  setPanelProps,
  clearPanelProps,
  usePanelProps
} from './store/useWalletStore.js';

function mountOrDispatch(containerEl, Component, props) {
  if (!containerEl) return false;
  const id = containerEl.id;
  if (id && isPanelSlotRegistered(id)) {
    setPanelProps(id, props || {});
    return true;
  }
  render(h(Component, props || {}), containerEl);
  return true;
}

function frameworkRender(vnode, containerEl) {
  if (vnode === null && containerEl && containerEl.id && isPanelSlotRegistered(containerEl.id)) {
    clearPanelProps(containerEl.id);
    return;
  }
  return render(vnode, containerEl);
}

export function mountSwapHistory(containerEl, opts = {}) {
  return mountOrDispatch(containerEl, SwapHistoryPanel, { getStatusLabel: opts.getStatusLabel });
}

export function mountAssetList(containerEl, props = {}) {
  return mountOrDispatch(containerEl, AssetListPanel, props);
}

export function mountTokenPicker(containerEl, props = {}) {
  return mountOrDispatch(containerEl, TokenPickerPanel, props);
}

export function mountPerpOverview(containerEl, props = {}) {
  return mountOrDispatch(containerEl, PerpOverviewPanel, props);
}

export function mountPerpOrderbookSide(containerEl, props = {}) {
  return mountOrDispatch(containerEl, PerpOrderbookSidePanel, props);
}

export function mountPerpBottomList(containerEl, props = {}) {
  return mountOrDispatch(containerEl, PerpBottomListPanel, props);
}

export function mountPerpOverviewPositionsPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  const positions = props && Array.isArray(props.positions) ? props.positions : [];
  if (!positions.length) {
    if (containerEl.id && isPanelSlotRegistered(containerEl.id)) {
      clearPanelProps(containerEl.id);
    } else {
      render(null, containerEl);
    }
    return true;
  }
  return mountOrDispatch(containerEl, PerpOverviewPositionsPanel, props);
}

export function mountLimitOrdersPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, LimitOrdersPanel, props);
}

export function mountEarnPoolsPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, EarnPoolsPanel, props);
}

export function mountTokenHistoryPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, TokenHistoryPanel, props);
}

export function mountContactsPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, ContactsPanel, props);
}

export function mountNearKeysPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, NearKeysPanel, props);
}

export function mountSolRentPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, SolRentPanel, props);
}

export function mountNearStoragePanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, NearStoragePanel, props);
}

export function mountWalletListPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, WalletListPanel, props);
}

export function mountBackupSecretsPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, BackupSecretsPanel, props);
}

export function mountWalletAddressesPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, WalletAddressesPanel, props);
}

export function mountSendFeeSummaryPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, SendFeeSummaryPanel, props);
}

export function mountReceiveAddressListPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, ReceiveAddressListPanel, props);
}

export function mountTokenBreakdownPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, TokenBreakdownPanel, props);
}

export function mountTxDetailPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, TxDetailPanel, props);
}

export function mountTxHistorySheetPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, TxHistorySheetPanel, props);
}

export function mountSwapActiveOrderPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, SwapActiveOrderPanel, props);
}

export function mountSwapRouteInfoPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, SwapRouteInfoPanel, props);
}

export function mountPerpMarketsSheetPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, PerpMarketsSheetPanel, props);
}

export function mountPerpFundingInfoPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, PerpFundingInfoPanel, props);
}

export function mountPerpChartHudPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, PerpChartHudPanel, props);
}

export function mountEarnStakeSheetPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, EarnStakeSheetPanel, props);
}

export function mountEarnValidatorsPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, EarnValidatorsPanel, props);
}

export function mountMiningTelemetryPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, MiningTelemetryPanel, props);
}

export function mountMiningWorkersPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, MiningWorkersPanel, props);
}

export function mountWcSessionsPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, WcSessionsPanel, props);
}

export function mountWcProposalPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, WcProposalPanel, props);
}

export function mountDAppBookmarksPanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, DAppBookmarksPanel, props);
}

export function mountDAppApprovePanel(containerEl, props = {}) {
  return mountOrDispatch(containerEl, DAppApprovePanel, props);
}

export function mountToastBanner(containerEl, props = {}) {
  return mountOrDispatch(containerEl, ToastBanner, props);
}

export function mountTxFlowModal(containerEl, props = {}) {
  return mountOrDispatch(containerEl, TxFlowModal, props);
}

export {
  App,
  registerPanelSlot,
  isPanelSlotRegistered,
  setPanelProps,
  clearPanelProps,
  usePanelProps
};

export function mountAppRoot(rootEl) {
  if (!rootEl) return false;
  render(h(App, null), rootEl);
  return true;
}

const NearCAFramework = {
  h,
  render: frameworkRender,
  App,
  mountAppRoot,
  useWalletState,
  notifyFrameworkState,
  useLang,
  useActiveWallet,
  registerPanelSlot,
  isPanelSlotRegistered,
  setPanelProps,
  clearPanelProps,
  usePanelProps,
  mountSwapHistory,
  mountAssetList,
  mountTokenPicker,
  mountPerpOverview,
  mountPerpOrderbookSide,
  mountPerpBottomList,
  mountPerpOverviewPositionsPanel,
  mountLimitOrdersPanel,
  mountEarnPoolsPanel,
  mountTokenHistoryPanel,
  mountContactsPanel,
  mountNearKeysPanel,
  mountSolRentPanel,
  mountNearStoragePanel,
  mountWalletListPanel,
  mountBackupSecretsPanel,
  mountWalletAddressesPanel,
  mountSendFeeSummaryPanel,
  mountReceiveAddressListPanel,
  mountTokenBreakdownPanel,
  mountTxDetailPanel,
  mountTxHistorySheetPanel,
  mountSwapActiveOrderPanel,
  mountSwapRouteInfoPanel,
  mountPerpMarketsSheetPanel,
  mountPerpFundingInfoPanel,
  mountPerpChartHudPanel,
  mountEarnStakeSheetPanel,
  mountEarnValidatorsPanel,
  mountMiningTelemetryPanel,
  mountMiningWorkersPanel,
  mountWcSessionsPanel,
  mountWcProposalPanel,
  mountDAppBookmarksPanel,
  mountDAppApprovePanel,
  mountToastBanner,
  mountTxFlowModal
};

if (typeof globalThis !== 'undefined') {
  globalThis.NearCAFramework = NearCAFramework;
}
if (typeof window !== 'undefined') {
  window.NearCAFramework = NearCAFramework;
}

if (typeof document !== 'undefined') {
  const appRoot = document.getElementById('app-root');
  if (appRoot) {
    mountAppRoot(appRoot);
  }
}

export default NearCAFramework;
