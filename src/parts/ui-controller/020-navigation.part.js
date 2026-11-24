  // ==================== Navigation & Sheets ====================

  let _contactsPickerTarget = null;
  let _lockedScrollY = 0;
  let _sheetScrollBound = false;

  function updateVisualViewportVars() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    const root = document.documentElement;
    if (!root || !root.style) return;
    const vv = window.visualViewport;
    if (vv && vv.height > 0) {
      root.style.setProperty('--nexus-vv-height', `${Math.round(vv.height)}px`);
      const kbInset = Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0)));
      root.style.setProperty('--nexus-kb-inset', `${kbInset}px`);
    } else {
      root.style.setProperty('--nexus-vv-height', `${window.innerHeight || 800}px`);
      root.style.setProperty('--nexus-kb-inset', '0px');
    }
  }

  function ensureSheetInteractionGuards() {
    if (_sheetScrollBound || typeof document === 'undefined') return;
    _sheetScrollBound = true;
    const backdrop = $('sheet-backdrop');
    if (backdrop && typeof backdrop.addEventListener === 'function') {
      backdrop.addEventListener('touchmove', (ev) => {
        if (backdrop.classList.contains('open')) ev.preventDefault();
      }, { passive: false });
      if (typeof MutationObserver !== 'undefined') {
        try {
          const obs = new MutationObserver(() => syncSheetScrollLock());
          obs.observe(backdrop, { attributes: true, attributeFilter: ['class'] });
        } catch (_) {}
      }
    }
    if (typeof window !== 'undefined' && window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
      window.visualViewport.addEventListener('resize', updateVisualViewportVars);
      window.visualViewport.addEventListener('scroll', updateVisualViewportVars);
    }
    updateVisualViewportVars();
  }

  function syncSheetScrollLock() {
    if (typeof document === 'undefined') return;
    const hasOpen = typeof document.querySelectorAll === 'function'
      ? document.querySelectorAll('.bottom-sheet.open').length > 0
      : false;
    const html = document.documentElement;
    const body = document.body;
    const hasBodyClassList = Boolean(body && body.classList && typeof body.classList.contains === 'function');
    const hasHtmlClassList = Boolean(html && html.classList && typeof html.classList.add === 'function');
    if (hasOpen) {
      if (hasBodyClassList && !body.classList.contains('sheet-scroll-locked')) {
        _lockedScrollY = (typeof window !== 'undefined' ? (window.scrollY || window.pageYOffset || 0) : 0);
        body.classList.add('sheet-scroll-locked');
        if (hasHtmlClassList) html.classList.add('sheet-scroll-locked');
      }
      updateVisualViewportVars();
    } else {
      const wasLocked = Boolean(hasBodyClassList && body.classList.contains('sheet-scroll-locked'));
      if (hasBodyClassList) body.classList.remove('sheet-scroll-locked');
      if (hasHtmlClassList) html.classList.remove('sheet-scroll-locked');
      if (wasLocked && typeof window !== 'undefined' && typeof window.scrollTo === 'function' && _lockedScrollY > 0) {
        try { window.scrollTo(0, _lockedScrollY); } catch (_) {}
      }
      _lockedScrollY = 0;
    }
  }

  function openSheet(sheetId) {
    ensureSheetInteractionGuards();
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
    syncSheetScrollLock();
  }

  function closeAllSheets() {
    if (typeof stopQrScannerStream === 'function') stopQrScannerStream();
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
    if (typeof resetFormFields === 'function') {
      resetFormFields(['earn-amount-in', 'send-amount-input']);
    }
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
    syncSheetScrollLock();
  }

  function switchTab(tab) {
    syncSheetScrollLock();
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
      st.perp.subView = 'overview';
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

