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

export function mountWalletListPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(WalletListPanel, props), containerEl);
  return true;
}

export function mountBackupSecretsPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(BackupSecretsPanel, props), containerEl);
  return true;
}

export function mountWalletAddressesPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(WalletAddressesPanel, props), containerEl);
  return true;
}

export function mountSendFeeSummaryPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(SendFeeSummaryPanel, props), containerEl);
  return true;
}

export function mountReceiveAddressListPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(ReceiveAddressListPanel, props), containerEl);
  return true;
}

export function mountTokenBreakdownPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(TokenBreakdownPanel, props), containerEl);
  return true;
}

export function mountTxDetailPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(TxDetailPanel, props), containerEl);
  return true;
}

export function mountTxHistorySheetPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(TxHistorySheetPanel, props), containerEl);
  return true;
}

export function mountSwapActiveOrderPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(SwapActiveOrderPanel, props), containerEl);
  return true;
}

export function mountSwapRouteInfoPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(SwapRouteInfoPanel, props), containerEl);
  return true;
}

export function mountPerpMarketsSheetPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(PerpMarketsSheetPanel, props), containerEl);
  return true;
}

export function mountPerpFundingInfoPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(PerpFundingInfoPanel, props), containerEl);
  return true;
}

export function mountPerpChartHudPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(PerpChartHudPanel, props), containerEl);
  return true;
}

export function mountEarnStakeSheetPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(EarnStakeSheetPanel, props), containerEl);
  return true;
}

export function mountEarnValidatorsPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(EarnValidatorsPanel, props), containerEl);
  return true;
}

export function mountMiningTelemetryPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(MiningTelemetryPanel, props), containerEl);
  return true;
}

export function mountMiningWorkersPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(MiningWorkersPanel, props), containerEl);
  return true;
}

export function mountWcSessionsPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(WcSessionsPanel, props), containerEl);
  return true;
}

export function mountWcProposalPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(WcProposalPanel, props), containerEl);
  return true;
}

export function mountDAppBookmarksPanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(DAppBookmarksPanel, props), containerEl);
  return true;
}

export function mountDAppApprovePanel(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(DAppApprovePanel, props), containerEl);
  return true;
}

export function mountToastBanner(containerEl, props = {}) {
  if (!containerEl) return false;
  render(h(ToastBanner, props), containerEl);
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
  mountToastBanner
};

if (typeof globalThis !== 'undefined') {
  globalThis.NearCAFramework = NearCAFramework;
}
if (typeof window !== 'undefined') {
  window.NearCAFramework = NearCAFramework;
}

export default NearCAFramework;
