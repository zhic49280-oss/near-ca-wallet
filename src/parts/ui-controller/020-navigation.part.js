  // ==================== Navigation & Sheets ====================

  let _contactsPickerTarget = null;

  function openSheet(sheetId) {
    const backdrop = $('sheet-backdrop');
    const sheet = $(sheetId);
    if (sheetId !== 'sheet-security-auth' && typeof _secAuthState.resolve === 'function') {
      const pending = _secAuthState.resolve;
      _secAuthState = { resolve: null, wallet: null, reason: '', pinBuffer: '', expectedLen: 6 };
      pending(false);
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.bottom-sheet.open').forEach((s) => {
        if (s.id !== sheetId) {
          s.classList.remove('open');
          s.setAttribute('aria-hidden', 'true');
        }
      });
    }
    if (backdrop) backdrop.classList.add('open');
    if (sheet) {
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
    }
  }

  function closeAllSheets() {
    const st = getState();
    if (st && st.limit) st.limit.pickerSide = null;
    if (typeof _secAuthState.resolve === 'function') {
      const pending = _secAuthState.resolve;
      _secAuthState = { resolve: null, wallet: null, reason: '', pinBuffer: '', expectedLen: 6, verifying: false };
      pending(false);
    }
    _backupRevealActive = false;
    const backupContent = $('backup-keys-content');
    if (backupContent) backupContent.innerHTML = '';
    const backdrop = $('sheet-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.classList.remove('auth-top');
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.bottom-sheet.open').forEach((s) => {
        s.classList.remove('open');
        s.setAttribute('aria-hidden', 'true');
      });
    }
  }

  function switchTab(tab) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) {
      renderOnboardingVisibility();
      return;
    }
    st.activeTab = ['wallet', 'swap', 'perp', 'earn', 'hub'].includes(tab) ? tab : 'wallet';

    const views = ['wallet', 'swap', 'perp', 'earn', 'hub'];
    for (const v of views) {
      const el = $(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== st.activeTab);
    }

    if (typeof document !== 'undefined') {
      const navTarget = st.activeTab === 'earn' ? 'wallet' : st.activeTab;
      document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === navTarget);
      });
    }

    if (st.activeTab === 'swap') {
      setSwapPanelMode(st.swap.panelMode || 'market');
      if (st.swap.panelMode !== 'limit' && !st.swap.quoteData && st.swap.amountIn) scheduleSwapQuote();
    } else if (st.activeTab === 'perp') {
      renderPerpView();
      refreshPerpDataAsync(false).catch(() => {});
      refreshPerpLongShortAsync(st.perp.selectedCoin || 'BTC', false).catch(() => {});
    } else if (st.activeTab === 'earn') {
      if (!st.staking.filter) st.staking.filter = 'featured';
      renderEarnView();
      ensureStakingMetricsFresh(300_000);
    } else if (st.activeTab === 'hub') {
      renderHubView();
    } else {
      renderWalletView();
    }
  }

  function toggleLanguage() {
    const st = getState();
    const next = st.lang === 'en' ? 'zh' : 'en';
    st.setLanguage(next);
    showToast(next === 'en' ? 'Switched to English' : '已切换为中文');
  }

