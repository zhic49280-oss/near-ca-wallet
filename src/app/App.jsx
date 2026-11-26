import { h, Fragment } from 'preact';
import { memo } from 'preact/compat';
import {
  AppShellOverlays,
  AppHeader,
  OnboardingAndWalletViews,
  BottomNav
} from './views/AppShellViews.jsx';
import {
  SwapLimitView,
  PerpView,
  EarnView,
  HubView
} from './views/TradingViews.jsx';
import { CoreSheets } from './sheets/CoreSheets.jsx';
import { ToolsAndChainSheets } from './sheets/ToolsAndChainSheets.jsx';

const MemoAppShellOverlays = memo(AppShellOverlays);
const MemoAppHeader = memo(AppHeader);
const MemoOnboardingAndWalletViews = memo(OnboardingAndWalletViews);
const MemoSwapLimitView = memo(SwapLimitView);
const MemoPerpView = memo(PerpView);
const MemoEarnView = memo(EarnView);
const MemoHubView = memo(HubView);
const MemoBottomNav = memo(BottomNav);
const MemoCoreSheets = memo(CoreSheets);
const MemoToolsAndChainSheets = memo(ToolsAndChainSheets);

export const App = memo(function App() {
  return (
    <Fragment>
      <MemoAppShellOverlays />

      <div className="app-shell">
        <MemoAppHeader />

        <main className="main-content">
          <MemoOnboardingAndWalletViews />
          <MemoSwapLimitView />
          <MemoPerpView />
          <MemoEarnView />
          <MemoHubView />
        </main>

        <MemoBottomNav />
      </div>

      <MemoCoreSheets />
      <MemoToolsAndChainSheets />
    </Fragment>
  );
});

export default App;
