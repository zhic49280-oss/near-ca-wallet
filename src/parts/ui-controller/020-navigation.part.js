  // ==================== Navigation & Sheets ====================

  let _contactsPickerTarget = null;
  let _lockedScrollY = 0;
  let _sheetScrollBound = false;
  let _sheetScrollPositions = Object.create(null);

  const _sheetScrollResetTargets = {
    'sheet-token-detail': ['#sheet-token-detail .sheet-body'],
    'sheet-tx-history': ['#sheet-tx-history .sheet-body', '#tx-history-full-list'],
    'sheet-tx-detail': ['#tx-detail-body'],
    'sheet-token-picker': ['#token-picker-list', '#sheet-token-picker .sheet-body'],
    'sheet-perp-markets': ['#perp-market-list', '#sheet-perp-markets .sheet-body']
  };

  function getSheetScrollTargets(sheetId) {
    const targets = [];
    const sheet = $(sheetId);
    if (sheet) {
      targets.push(sheet);
      if (typeof sheet.querySelector === 'function') {
        const body = sheet.querySelector('.sheet-body');
        if (body && !targets.includes(body)) targets.push(body);
      }
    }
    const extra = _sheetScrollResetTargets[sheetId] || [];
    for (const sel of extra) {
      let el = null;
      if (sel.startsWith('#') && !sel.includes(' ')) {
        el = $(sel.slice(1));
      } else if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
        el = document.querySelector(sel);
      }
      if (el && !targets.includes(el)) targets.push(el);
    }
    return targets;
  }

  function saveSheetScrollPosition(sheetId) {
    if (!sheetId) return 0;
    let top = 0;
    for (const el of getSheetScrollTargets(sheetId)) {
      const stTop = Number(el && el.scrollTop);
      if (Number.isFinite(stTop) && stTop > 0) {
        top = stTop;
        break;
      }
    }
    _sheetScrollPositions[sheetId] = top;
    return top;
  }

  function applySheetScrollPosition(sheetId, top = 0) {
    const val = Math.max(0, Number(top) || 0);
    for (const el of getSheetScrollTargets(sheetId)) {
      if (el && ('scrollTop' in el || typeof el.scrollTop === 'number')) {
        el.scrollTop = val;
      }
    }
  }

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
        const winY = typeof window !== 'undefined' ? Number(window.scrollY ?? window.pageYOffset ?? 0) : 0;
        _lockedScrollY = (Number.isFinite(winY) && winY > 0)
          ? winY
          : Number((html && html.scrollTop) || (body && body.scrollTop) || 0) || 0;
        body.classList.add('sheet-scroll-locked');
        if (hasHtmlClassList) html.classList.add('sheet-scroll-locked');
      }
      updateVisualViewportVars();
    } else {
      const wasLocked = Boolean(hasBodyClassList && body.classList.contains('sheet-scroll-locked'));
      if (hasBodyClassList) body.classList.remove('sheet-scroll-locked');
      if (hasHtmlClassList) html.classList.remove('sheet-scroll-locked');
      if (wasLocked && _lockedScrollY > 0) {
        if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
          try { window.scrollTo(0, _lockedScrollY); } catch (_) {}
        }
        if (html && typeof html.scrollTop === 'number') html.scrollTop = _lockedScrollY;
        if (body && typeof body.scrollTop === 'number') body.scrollTop = _lockedScrollY;
      }
      _lockedScrollY = 0;
    }
  }

  function openSheet(sheetId, opts = {}) {
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
          if (s.id === 'sheet-dapp-approve' && typeof rejectDAppApproval === 'function') {
            rejectDAppApproval();
          }
          if (s.id === 'sheet-qr-scanner' && typeof stopQrScannerStream === 'function') {
            stopQrScannerStream();
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
      const shouldRestore = Boolean(opts && opts.restoreScroll && Object.prototype.hasOwnProperty.call(_sheetScrollPositions, sheetId));
      if (shouldRestore) {
        const savedTop = _sheetScrollPositions[sheetId];
        delete _sheetScrollPositions[sheetId];
        applySheetScrollPosition(sheetId, savedTop);
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            if (sheet.classList && sheet.classList.contains('open')) {
              applySheetScrollPosition(sheetId, savedTop);
            }
          });
        }
      } else if (_sheetScrollResetTargets[sheetId]) {
        delete _sheetScrollPositions[sheetId];
        applySheetScrollPosition(sheetId, 0);
      }
    }
    syncSheetScrollLock();
  }

  function closeAllSheets() {
    if (typeof dismissConfirmDialog === 'function') dismissConfirmDialog(false);
    if (typeof closeTxFlowModal === 'function' && (typeof isTxFlowBusy !== 'function' || !isTxFlowBusy())) {
      closeTxFlowModal();
    }
    if (typeof stopQrScannerStream === 'function') stopQrScannerStream();
    _contactsPickerTarget = null;
    _sheetScrollPositions = Object.create(null);
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
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
      if (fw && typeof fw.clearPanelProps === 'function') {
        fw.clearPanelProps('send-route-preview');
      } else if (fw && typeof fw.mountSendFeeSummaryPanel === 'function') {
        fw.mountSendFeeSummaryPanel(sendPreviewEl, null);
      } else {
        sendPreviewEl.textContent = '';
      }
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
    if (st.activeTab !== 'perp') {
      if (st.perp) st.perp.inspectedCandleIdx = null;
      if (typeof stopPerpChartMotion === 'function') stopPerpChartMotion();
      if (typeof stopPerpLiveFeed === 'function') stopPerpLiveFeed();
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

