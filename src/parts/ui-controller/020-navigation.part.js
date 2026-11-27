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

  function bindSheetHandleDrag(sheet) {
    if (!sheet || typeof sheet.querySelector !== 'function') return;
    const handle = sheet.querySelector('.sheet-handle');
    if (!handle || (handle.dataset && handle.dataset.handleGestureBound === '1') || typeof handle.addEventListener !== 'function') return;
    if (handle.dataset) handle.dataset.handleGestureBound = '1';

    let startX = 0;
    let startY = 0;
    let active = false;
    let dragging = false;
    let lastDy = 0;
    let rafId = 0;

    const cancelFrame = () => {
      if (rafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      rafId = 0;
    };

    const applySheetOffset = (dyPx) => {
      if (sheet.style) {
        sheet.style.transform = `translate(-50%, ${dyPx.toFixed(1)}px)`;
      }
    };

    handle.addEventListener('touchstart', (ev) => {
      if (!ev.touches || ev.touches.length !== 1) return;
      cancelFrame();
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
      active = true;
      dragging = false;
      lastDy = 0;
    }, { passive: true });

    handle.addEventListener('touchmove', (ev) => {
      if (!active || !ev.touches || ev.touches.length !== 1) return;
      const dx = ev.touches[0].clientX - startX;
      const dy = ev.touches[0].clientY - startY;
      const dist = Math.hypot(dx, dy);
      // 7px deadzone so initial tap jitter does not trigger drag
      if (!dragging) {
        if (dist < 7) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) * 1.2) {
          active = false;
          return;
        }
        dragging = true;
        if (sheet.style) sheet.style.transition = 'none';
      }
      if (ev.cancelable && typeof ev.preventDefault === 'function') {
        ev.preventDefault();
      }
      // Damped downward drag
      const dampedDy = dy <= 0 ? 0 : (dy <= 160 ? dy : 160 + (dy - 160) * 0.35);
      lastDy = dampedDy;
      if (typeof requestAnimationFrame === 'function') {
        if (!rafId) {
          rafId = requestAnimationFrame(() => {
            rafId = 0;
            if (dragging) applySheetOffset(lastDy);
          });
        }
      } else {
        applySheetOffset(dampedDy);
      }
    }, { passive: false });

    const finishDrag = () => {
      if (!active) return;
      active = false;
      cancelFrame();
      if (!dragging) return;
      dragging = false;
      if (sheet.style) sheet.style.transition = '';
      const sheetH = sheet.offsetHeight || 360;
      const dismissThreshold = Math.min(120, Math.max(72, sheetH * 0.25));
      if (lastDy >= dismissThreshold) {
        if (sheet.style) {
          sheet.style.transform = 'translate(-50%, 100%)';
        }
        if (sheet.id === 'sheet-confirm-dialog' && typeof dismissConfirmDialog === 'function') {
          dismissConfirmDialog(false);
        } else {
          closeAllSheets();
        }
        setTimeout(() => {
          if (sheet.style && !sheet.classList.contains('open')) {
            sheet.style.transform = '';
          }
        }, 300);
      } else if (sheet.style) {
        sheet.style.transform = '';
      }
      lastDy = 0;
    };

    handle.addEventListener('touchend', finishDrag, { passive: true });
    handle.addEventListener('touchcancel', finishDrag, { passive: true });
  }

  function bindAllBottomSheetHandleGestures() {
    if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
    document.querySelectorAll('.bottom-sheet').forEach((sheet) => {
      bindSheetHandleDrag(sheet);
    });
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
    bindAllBottomSheetHandleGestures();
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
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.bottom-sheet.open').forEach((s) => {
        if (s.id !== sheetId) {
          if (s.id === 'sheet-confirm-dialog' && typeof dismissConfirmDialog === 'function') {
            dismissConfirmDialog(false);
            return;
          }
          s.classList.remove('open');
          s.setAttribute('aria-hidden', 'true');
        }
      });
    }
    if (backdrop) {
      backdrop.classList.add('open');
    }
    if (sheet) {
      if (sheet.style) {
        sheet.style.transition = '';
        sheet.style.transform = '';
      }
      bindSheetHandleDrag(sheet);
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
    }
    syncSheetScrollLock();
  }

  function closeAllSheets() {
    if (typeof dismissConfirmDialog === 'function') dismissConfirmDialog(false);
    if (typeof closeTxFlowModal === 'function' && (typeof isTxFlowBusy !== 'function' || !isTxFlowBusy())) {
      closeTxFlowModal();
    }
    if (typeof stopQrScannerStream === 'function') stopQrScannerStream();
    const contactsSheet = $('sheet-contacts');
    if (contactsSheet && contactsSheet.classList && contactsSheet.classList.contains('open') && _contactsPickerTarget === 'send') {
      _contactsPickerTarget = null;
      openSheet('sheet-send');
      return;
    }
    const st = getState();
    if (st && st.limit) st.limit.pickerSide = null;
    if (typeof _dappSession !== 'undefined' && _dappSession && _dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
      if (typeof rejectDAppApproval === 'function') {
        rejectDAppApproval();
      } else {
        const pendingDapp = _dappSession.pendingApproval.resolve;
        _dappSession.pendingApproval = null;
        pendingDapp(false);
      }
    }
    const dappApproveSheet = $('sheet-dapp-approve');
    if (dappApproveSheet && dappApproveSheet.classList && dappApproveSheet.classList.contains('open') && typeof rejectDAppApproval === 'function') {
      rejectDAppApproval();
    }
    _backupRevealActive = false;
    _lastBackupRows = null;
    if (typeof clearBackupAutoHideTimer === 'function') clearBackupAutoHideTimer();
    const backupContent = $('backup-keys-content');
    if (backupContent) {
      unmountPreactContainer(backupContent);
    }
    if (st && st.staking) st.staking.amountIn = '';
    if (st && st.send && typeof st.send === 'object') {
      st.send.recipient = '';
      st.send.amount = '';
      st.send.detectedNetwork = null;
      st.send.quote = null;
    }
    const sendRec = $('send-tx-receipt');
    if (sendRec) {
      sendRec.classList.add('hidden');
      unmountPreactContainer(sendRec);
    }
    if ($('btn-confirm-send')) $('btn-confirm-send').classList.remove('hidden');
    if (typeof _sendCrossQuoteTimer !== 'undefined' && _sendCrossQuoteTimer) {
      clearTimeout(_sendCrossQuoteTimer);
      _sendCrossQuoteTimer = null;
    }
    if (st && st.perp && typeof st.perp === 'object') {
      st.perp.fundingAmount = '';
      st.perp.fundingQuote = null;
      st.perp.fundingQuoteError = '';
      st.perp.fundingQuoting = false;
      st.perp.editingTpslCoin = '';
      st.perp.marketSearch = '';
    }
    if (typeof resetFormFields === 'function') {
      resetFormFields([
        'earn-amount-in',
        'send-amount-input',
        'send-recipient-input',
        'token-picker-search',
        'perp-market-search',
        'perp-oc-amount',
        'perp-arb-amount',
        'perp-withdraw-amount',
        'perp-pos-tp-input',
        'perp-pos-sl-input',
        'contact-name-input',
        'contact-addr-input',
        'prl-bind-mnemonic-input',
        'near-keys-rotate-mnemonic',
        'hub-near-domain-input',
        'hub-near-bind-auth-input',
        'wc-uri-input',
        'dapp-url-input'
      ]);
    }
    if ($('send-detected-net')) $('send-detected-net').textContent = '';
    const sendPreviewEl = $('send-route-preview');
    if (sendPreviewEl) {
      sendPreviewEl.classList.add('hidden');
      sendPreviewEl.textContent = '';
    }
    $('send-gas-fix-banner')?.classList.add('hidden');
    $('send-evm-chain-row')?.classList.add('hidden');
    const backdrop = $('sheet-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.classList.remove('auth-top');
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.bottom-sheet.open').forEach((s) => {
        s.classList.remove('open');
        s.classList.remove('auth-top');
        s.setAttribute('aria-hidden', 'true');
      });
      document.querySelectorAll('.bottom-sheet.auth-top').forEach((s) => {
        s.classList.remove('auth-top');
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
    if (st.activeTab !== 'perp' && typeof stopPerpLiveFeed === 'function') {
      stopPerpLiveFeed();
    }
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try { window.scrollTo(0, 0); } catch (_) {}
    }

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
    if (typeof renderAll === 'function' && typeof _langRenderBound !== 'undefined' && !_langRenderBound) {
      renderAll();
    }
    showToast(next === 'en' ? 'Switched to English' : '已切换为中文');
  }

