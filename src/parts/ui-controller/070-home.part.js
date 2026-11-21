  // ==================== Header & Home Wallet Rendering ====================

  function renderHeaderAndHero() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const nearId = wallet.nearNamedAccount || wallet.nearAddress || '';
    const displayId = wallet.nearNamedAccount ? wallet.nearNamedAccount : shortenAddr(nearId, 6, 4);

    const headerLbl = $('header-account-label');
    if (headerLbl) headerLbl.textContent = displayId;

    const caBadge = document.querySelector('#header-account-pill .ca-badge');
    if (caBadge) {
      caBadge.textContent = 'NEAR CA';
    }

    const heroNearId = $('hero-near-id');
    if (heroNearId) heroNearId.textContent = wallet.nearNamedAccount || shortenAddr(nearId, 10, 8);

    const regBtn = $('btn-hero-register-near');
    if (regBtn) {
      regBtn.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
    }

    const wcCount = st.wc.client ? Object.keys(st.wc.client.getActiveSessions() || {}).length : 0;
    const wcDot = $('header-wc-dot');
    if (wcDot) {
      wcDot.classList.toggle('connected', wcCount > 0);
    }
    const hubWcBadge = $('hub-wc-count-badge');
    if (hubWcBadge) {
      hubWcBadge.textContent = String(wcCount);
      hubWcBadge.classList.toggle('hidden', wcCount === 0);
    }
  }

  function renderWalletView() {
    renderHeaderAndHero();
    renderUnifiedAssetList();
  }

  function copyActiveNearId() {
    const wallet = getState().getActiveWallet();
    if (!wallet) return;
    copyText(wallet.nearNamedAccount || wallet.nearAddress, 'NEAR ID');
  }

  function jumpToNearDomainManager() {
    openNearAccountSheet();
  }

  function focusMpcInspector() {
    switchTab('hub');
  }

