import { h, Fragment } from 'preact';

export function AppShellOverlays() {
  return (
    <Fragment>
      <div id="app-privacy-shield" className="app-privacy-shield" aria-hidden="true">
        <div className="app-lock-card">
          <img src="assets/nexus-logo-192.png?v=6.77" alt="Nexus Wallet" className="app-lock-logo" />
          <div className="app-lock-brand">Nexus Wallet</div>
        </div>
      </div>
      <div id="app-lock-overlay" className="app-lock-overlay" role="dialog" aria-modal="true" aria-hidden="true">
        <div className="app-lock-card">
          <img src="assets/nexus-logo-192.png?v=6.77" alt="Nexus Wallet" className="app-lock-logo" />
          <div className="app-lock-brand">Nexus Wallet</div>
          <div id="app-lock-title" className="app-lock-title" data-i18n="lock.title">安全锁定</div>
          <div id="app-lock-status" className="app-lock-status" data-i18n="lock.hint">请通过生物识别或锁屏密码解锁</div>
          <button
            type="button"
            id="btn-app-lock-unlock"
            className="btn-primary"
            style={{ width: '100%' }}
            onClick={() => window.unlockAppLockNow && window.unlockAppLockNow()}
            data-i18n="lock.unlockBtn"
          >
            生物识别 / 锁屏密码解锁
          </button>
        </div>
      </div>
      <div className="ambient-bg" aria-hidden="true"></div>
      <div id="toast" className="toast" role="status" aria-live="polite"></div>
    </Fragment>
  );
}

export function AppHeader() {
  return (
    <header className="app-header">
      <button
        type="button"
        id="header-account-pill"
        className="header-account-pill"
        onClick={() => window.openWalletSwitcherSheet && window.openWalletSwitcherSheet()}
      >
        <span className="header-account-dot"></span>
        <span id="header-account-label" className="header-account-label">--</span>
        <span className="ca-badge" data-i18n="header.caBadge">NEAR CA</span>
      </button>

      <div className="header-actions">
        <button
          type="button"
          className="header-chip-btn"
          onClick={() => window.openWalletConnectSheet && window.openWalletConnectSheet()}
        >
          <span id="header-wc-dot" className="wc-dot"></span>
          <span data-i18n="header.wcBtn">WC</span>
        </button>
        <button
          type="button"
          id="header-lang-btn"
          className="header-chip-btn"
          onClick={() => window.toggleLanguage && window.toggleLanguage()}
        >
          <span data-i18n="header.langToggle">EN</span>
        </button>
      </div>
    </header>
  );
}

export function OnboardingAndWalletViews() {
  return (
    <Fragment>
      {/* ==================== Onboarding View ==================== */}
      <section id="view-onboarding" className="view-section hidden">
        <div className="ios-glass-card hero-card" style={{ padding: '24px 18px', textAlign: 'center' }}>
          <img
            src="assets/nexus-logo-512.png?v=6.77"
            alt="Nexus Wallet"
            style={{
              width: '64px',
              height: '64px',
              margin: '0 auto 14px',
              borderRadius: '18px',
              border: '1px solid rgba(0,236,151,0.35)',
              display: 'block',
              objectFit: 'cover',
              boxShadow: '0 8px 24px rgba(0,236,151,0.16)',
            }}
          />
          <span className="ca-badge" data-i18n="onboard.badge">NEAR 链抽象自托管账户</span>
          <h1 style={{ margin: '12px 0 8px', fontSize: '21px', fontWeight: 800, color: '#fff' }} data-i18n="onboard.title">
            一个 NEAR 账户，畅通全链资产
          </h1>
          <p style={{ margin: '0 0 20px', fontSize: '12.5px', color: 'var(--text-secondary)' }} data-i18n="onboard.subtitle">
            一站式多链自托管资产管理、跨链闪兑与链上理财
          </p>

          <div id="onboard-choice-panel" className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.openCreateWalletFlow && window.openCreateWalletFlow()}
              data-i18n="onboard.createBtn"
            >
              创建 NEAR 链抽象钱包
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => window.openImportWalletFlow && window.openImportWalletFlow()}
              data-i18n="onboard.importBtn"
            >
              导入 12 / 24 词助记词
            </button>
          </div>

          <div id="onboard-create-panel" className="hidden flex flex-col gap-3" style={{ textAlign: 'left', marginTop: '10px' }}>
            <div className="flex items-center justify-between gap-2">
              <div style={{ fontWeight: 700, fontSize: '14px' }} data-i18n="onboard.createTitle">备份您的助记词</div>
            </div>
            <div id="onboard-create-hint" style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="onboard.createHint">
              请妥善离线保存以下 12 个单词，它是恢复所有链上资产的唯一凭证
            </div>
            <div id="onboard-seed-grid" className="seed-grid"></div>
            <button
              type="button"
              className="btn-ghost-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => window.copyPendingMnemonic && window.copyPendingMnemonic()}
              data-i18n="onboard.copySeedBtn"
            >
              复制助记词
            </button>
            <input
              id="onboard-create-name"
              type="text"
              className="input-field"
              data-i18n-placeholder="onboard.walletNamePlaceholder"
              placeholder="钱包名称（可选）"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => window.cancelOnboardSubPanel && window.cancelOnboardSubPanel()}
                data-i18n="onboard.cancelBtn"
              >
                返回
              </button>
              <button
                type="button"
                id="btn-confirm-create-wallet"
                className="btn-primary"
                onClick={() => window.confirmCreateWallet && window.confirmCreateWallet()}
                data-i18n="onboard.confirmCreateBtn"
              >
                已备份，进入钱包
              </button>
            </div>
          </div>

          <div id="onboard-import-panel" className="hidden flex flex-col gap-3" style={{ textAlign: 'left', marginTop: '10px' }}>
            <div style={{ fontWeight: 700, fontSize: '14px' }} data-i18n="onboard.importTitle">导入恢复助记词</div>
            <textarea
              id="onboard-import-phrase"
              className="input-field mono"
              data-i18n-placeholder="onboard.importPlaceholder"
              placeholder="输入 12 或 24 个英文助记词，使用空格分隔"
              onInput={() => window.validateOnboardImportLive && window.validateOnboardImportLive()}
            ></textarea>
            <div id="onboard-import-status" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}></div>
            <input
              id="onboard-import-name"
              type="text"
              className="input-field"
              data-i18n-placeholder="onboard.walletNamePlaceholder"
              placeholder="钱包名称（可选）"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => window.cancelOnboardSubPanel && window.cancelOnboardSubPanel()}
                data-i18n="onboard.cancelBtn"
              >
                返回
              </button>
              <button
                type="button"
                id="btn-confirm-import-wallet"
                className="btn-primary"
                onClick={() => window.confirmImportWallet && window.confirmImportWallet()}
                data-i18n="onboard.confirmImportBtn"
              >
                派生全链账户并导入
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== Tab 1: Assets (#view-wallet) ==================== */}
      <section id="view-wallet" className="view-section hidden">
        <div id="home-ptr-indicator" className="home-ptr-indicator" aria-live="polite">
          <span className="ptr-spinner"></span>
          <span id="home-ptr-text" data-i18n="home.ptrPull">下拉刷新链上余额</span>
        </div>
        <div className="ios-glass-card hero-card">
          <div className="hero-top-row">
            <span className="hero-caption" data-i18n="home.totalBalance">统一资产总览 (USD)</span>
            <button
              type="button"
              id="btn-home-refresh"
              className="btn-ghost-sm"
              onClick={() => window.refreshAllBalancesAsync && window.refreshAllBalancesAsync(true)}
              data-i18n="common.refresh"
              style={{ padding: '3px 9px', fontSize: '11px' }}
            >
              刷新
            </button>
          </div>
          <div id="hero-total-usd" className="hero-balance">--</div>

          <div className="hero-id-row">
            <div className="hero-id-meta">
              <span className="hero-id-label" data-i18n="home.masterAccount">NEAR 主账户</span>
              <span id="hero-near-id" className="hero-id-value">--</span>
            </div>
            <div className="hero-id-btns">
              <button
                type="button"
                className="mini-action-btn"
                onClick={() => window.copyActiveNearId && window.copyActiveNearId()}
                data-i18n="common.copy"
              >
                复制
              </button>
              <button
                type="button"
                id="btn-hero-register-near"
                className="mini-action-btn primary"
                onClick={() => window.jumpToNearDomainManager && window.jumpToNearDomainManager()}
                data-i18n="home.registerNear"
              >
                注册 .near
              </button>
            </div>
          </div>

          <div className="hero-actions-grid">
            <button type="button" className="quick-action-btn" onClick={() => window.openSendSheet && window.openSendSheet()}>
              <span className="quick-action-icon">↑</span>
              <span data-i18n="home.send">转账</span>
            </button>
            <button type="button" className="quick-action-btn" onClick={() => window.openReceiveSheet && window.openReceiveSheet()}>
              <span className="quick-action-icon">↓</span>
              <span data-i18n="home.receive">收款</span>
            </button>
            <button type="button" className="quick-action-btn" onClick={() => window.switchTab && window.switchTab('swap')}>
              <span className="quick-action-icon">⇄</span>
              <span data-i18n="home.swap">闪兑</span>
            </button>
            <button type="button" className="quick-action-btn" onClick={() => window.switchTab && window.switchTab('earn')}>
              <span className="quick-action-icon">◈</span>
              <span data-i18n="home.earn">质押</span>
            </button>
          </div>
        </div>

        <div className="section-header-row">
          <h2 className="section-title" data-i18n="home.assetsTitle">聚合资产列表</h2>
        </div>

        <div id="home-unified-asset-list" className="asset-list"></div>
      </section>
    </Fragment>
  );
}

export function BottomNav() {
  return (
    <nav id="bottom-nav" className="bottom-nav hidden" aria-label="Main Navigation">
      <button type="button" className="nav-item active" data-tab="wallet" onClick={() => window.switchTab && window.switchTab('wallet')}>
        <span className="nav-icon">◈</span>
        <span data-i18n="nav.wallet">资产</span>
      </button>
      <button type="button" className="nav-item" data-tab="swap" onClick={() => window.switchTab && window.switchTab('swap')}>
        <span className="nav-icon">⇄</span>
        <span data-i18n="nav.swap">闪兑</span>
      </button>
      <button type="button" className="nav-item" data-tab="perp" onClick={() => window.switchTab && window.switchTab('perp')}>
        <span className="nav-icon">⚡</span>
        <span data-i18n="nav.perp">合约</span>
      </button>
      <button type="button" className="nav-item" data-tab="hub" onClick={() => window.switchTab && window.switchTab('hub')}>
        <span className="nav-icon">⌘</span>
        <span data-i18n="nav.hub">枢纽</span>
      </button>
    </nav>
  );
}
