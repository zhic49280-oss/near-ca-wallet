import { h } from 'preact';
import { useLang, useI18n, useActiveWallet } from '../store/useWalletStore.js';

function shortenAddr(addr, head = 10, tail = 8) {
  const s = String(addr || '');
  if (!s) return '';
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

export function HubView() {
  useLang();
  const { t, tr } = useI18n();
  const activeWallet = useActiveWallet();
  const identityName = (activeWallet && activeWallet.name) || 'Nexus Wallet';
  const nearDisplay = activeWallet
    ? (activeWallet.nearNamedAccount || shortenAddr(activeWallet.nearAddress, 10, 8) || '--')
    : '--';
  const isNamedNear = Boolean(activeWallet && activeWallet.nearNamedAccount);
  const nearStatusText = activeWallet
    ? (isNamedNear ? t('已命名 .near', 'Named .near') : t('基础账户', 'Standard'))
    : '--';
  const nearStatusClass = isNamedNear ? 'badge badge-emerald' : 'badge badge-cyan';
  return (
    <section id="view-hub" className="view-section hidden">
      {/* Identity Hero Card */}
      <div className="ios-glass-card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div id="hub-identity-name" style={{ fontWeight: 800, fontSize: '16px', color: '#ffffff' }}>{identityName}</div>
            <div
              id="hub-identity-near-id"
              className="mono text-emerald"
              style={{ fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {nearDisplay}
            </div>
          </div>
          <span id="hub-near-status-badge" className={nearStatusClass}>{nearStatusText}</span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => window.openWalletSwitcherSheet && window.openWalletSwitcherSheet()}
            data-i18n="hub.manageWalletsBtn"
          >
            {tr('hub.manageWalletsBtn', '切换 / 新增钱包')}
          </button>
          <button
            type="button"
            className="btn-secondary flex-1"
            onClick={() => window.openBackupKeysSheet && window.openBackupKeysSheet()}
            data-i18n="hub.backupKeysBtn"
          >
            {tr('hub.backupKeysBtn', '导出助记词与主密钥')}
          </button>
        </div>
      </div>

      {/* Group 1: Account & Web3 */}
      <div className="hub-menu-group">
        <button
          type="button"
          id="hub-dapp-browser-btn"
          className="hub-menu-row"
          onClick={() => window.openDAppBrowserSheet && window.openDAppBrowserSheet()}
        >
          <span className="hub-menu-icon">🌐</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.dappMenuTitle">{tr('hub.dappMenuTitle', 'DApp 浏览器')}</span>
            <span className="hub-menu-sub" data-i18n="hub.dappMenuSub">{tr('hub.dappMenuSub', '内置多链浏览器 · EVM / Solana / NEAR')}</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openNearAccountSheet && window.openNearAccountSheet()}>
          <span className="hub-menu-icon">🪪</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.nearAcctMenuTitle">{tr('hub.nearAcctMenuTitle', 'NEAR 账户与密钥')}</span>
            <span id="hub-near-menu-sub" className="hub-menu-sub" data-i18n="hub.nearAcctMenuSub">{tr('hub.nearAcctMenuSub', '注册 .near / 链上密钥管理')}</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openWalletAddressesSheet && window.openWalletAddressesSheet()}>
          <span className="hub-menu-icon">◈</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.addrMenuTitle">{tr('hub.addrMenuTitle', '多链收款地址')}</span>
            <span className="hub-menu-sub" data-i18n="hub.addrMenuSub">{tr('hub.addrMenuSub', '查看并复制全链主地址')}</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openWalletConnectSheet && window.openWalletConnectSheet()}>
          <span className="hub-menu-icon">🔗</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.wcTitle">{tr('hub.wcTitle', 'WalletConnect v2 授权')}</span>
          </span>
          <span className="hub-menu-right">
            <span id="hub-wc-count-badge" className="ca-badge hidden">0</span>
            <span>›</span>
          </span>
        </button>
      </div>

      {/* Group 2: On-Chain Tools */}
      <div className="hub-menu-group">
        <button type="button" className="hub-menu-row" onClick={() => window.openMiningProSheet && window.openMiningProSheet()}>
          <span className="hub-menu-icon">⛏️</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.miningMenuTitle">{tr('hub.miningMenuTitle', 'Pearl 矿工监控')}</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openContactsSheet && window.openContactsSheet()}>
          <span className="hub-menu-icon">📒</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.contactsTitle">{tr('hub.contactsTitle', '常用地址簿')}</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openSolRentReclaimSheet && window.openSolRentReclaimSheet()}>
          <span className="hub-menu-icon">🧹</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.solRentTitle">{tr('hub.solRentTitle', 'Solana 租金回收与粉尘粉碎')}</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.openNearStorageReclaimSheet && window.openNearStorageReclaimSheet()}>
          <span className="hub-menu-icon">📦</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.nearStorageTitle">{tr('hub.nearStorageTitle', 'NEAR 存储押金回收')}</span>
          </span>
          <span className="hub-menu-right">›</span>
        </button>
      </div>

      {/* Group 3: Security & Preferences */}
      <div className="hub-menu-group">
        <button
          type="button"
          id="hub-security-bio-card"
          className="hub-menu-row"
          onClick={() => window.testBiometricAuthNow && window.testBiometricAuthNow()}
        >
          <span className="hub-menu-icon">🔐</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.bioCardTitle">{tr('hub.bioCardTitle', '安全验证')}</span>
          </span>
          <span className="hub-menu-right">
            <span id="hub-bio-status-badge" className="ca-badge">--</span>
            <span>›</span>
          </span>
        </button>
        <button type="button" className="hub-menu-row" onClick={() => window.toggleLanguage && window.toggleLanguage()}>
          <span className="hub-menu-icon">🌐</span>
          <span className="hub-menu-text">
            <span className="hub-menu-title" data-i18n="hub.langTitle">{tr('hub.langTitle', '语言偏好')}</span>
          </span>
          <span className="hub-menu-right">
            <span id="hub-lang-current-pill" className="ca-badge" data-i18n="hub.langCurrent">{tr('hub.langCurrent', '中文')}</span>
            <span>›</span>
          </span>
        </button>
      </div>
    </section>
  );
}
