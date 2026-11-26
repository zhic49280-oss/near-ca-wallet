  // ==================== Root Render & Lifecycle ====================

  let _delegatedListenersBound = false;
  let _foregroundResumeBound = false;
  let _langRenderBound = false;

  function initForegroundResumeSync() {
    if (_foregroundResumeBound) return;
    _foregroundResumeBound = true;
    const onResume = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const st = getState();
      if (!st || !st.getActiveWallet()) return;
      if (st.activeTab === 'swap' && st.swap && st.swap.panelMode === 'limit' && typeof refreshLimitOrdersAsync === 'function') {
        refreshLimitOrdersAsync(false).catch(() => {});
      }
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', onResume);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onResume);
    }
  }

  function initDelegatedEventListeners() {
    if (_delegatedListenersBound || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    _delegatedListenersBound = true;

    document.addEventListener('click', (e) => {
      const target = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-action]') : null;
      if (!target) return;
      if (target.dataset && target.dataset.stop === '1') e.stopPropagation();
      const action = target.dataset ? target.dataset.action : '';
      const ds = target.dataset || {};
      switch (action) {
        case 'switch-wallet': switchActiveWallet(ds.walletId || ''); break;
        case 'delete-wallet': deleteWalletById(ds.walletId || ''); break;
        case 'toggle-backup-reveal': toggleBackupKeysReveal(); break;
        case 'copy-text': copyTextValue(ds.val || '', ds.label || ''); break;
        case 'open-token-detail': openTokenDetailSheet(ds.symbol || ''); break;
        case 'toggle-home-dust': toggleHomeDustAssets(); break;
        case 'set-token-detail-chain': setTokenDetailChain(ds.chain || 'all'); break;
        case 'open-tx-detail': {
          const src = ds.txSource || 'token';
          const idx = Number(ds.txIdx);
          const arr = src === 'mining'
            ? _lastMiningNormalizedPayouts
            : (src === 'modal'
                ? (getState().txModal?.items || [])
                : (src === 'swap' ? getSwapHistoryItems(getState().getActiveWallet()) : _lastTokenDetailMergedItems));
          const item = (Number.isInteger(idx) && arr[idx]) || (ds.txHash ? arr.find((x) => x && x.txHash === ds.txHash) : null);
          const backId = src === 'modal' ? 'sheet-tx-history' : (src === 'mining' ? 'sheet-mining-pro' : (src === 'swap' ? '' : 'sheet-token-detail'));
          if (item) openTxDetailSheet(item, backId);
          break;
        }
        case 'detail-swap': closeAllSheets(); quickActionSwapFromEntry(ds.assetId || '', ds.chain || '', ds.contract || ''); break;
        case 'detail-send': quickActionSendFromEntry(ds.symbol || '', ds.chain || '', ds.assetId || '', ds.contract || ''); break;
        case 'open-token-detail-pool': openTokenDetailPool(ds.poolId || ''); break;
        case 'set-send-evm-chain': setSendTargetEvmChain(ds.chain || 'eth'); break;
        case 'select-receive-network': selectReceiveNetwork(ds.net || 'near'); break;
        case 'select-swap-token': selectSwapToken(ds.assetId || ''); break;
        case 'set-picker-chain': setTokenPickerChain(ds.chain || 'all'); break;
        case 'toggle-picker-more-chains': toggleTokenPickerMoreChains(); break;
        case 'toggle-fav-token': toggleFavoriteSwapToken(ds.assetId || ''); break;
        case 'claim-limit-order': claimLimitOrderUI(ds.orderId || '', ds.buyToken || ''); break;
        case 'cancel-limit-order': cancelLimitOrderUI(ds.chain || 'near', ds.orderId || '', ds.remain || '', ds.sellToken || '', ds.buyToken || ''); break;
        case 'select-perp-market': selectPerpMarket(ds.coin || 'BTC'); break;
        case 'toggle-perp-tpsl': togglePerpTpSl(); break;
        case 'fill-perp-ob-px': fillPerpLimitPrice(ds.px || ''); break;
        case 'close-perp-pos': closePerpPositionUI(ds.coin || ''); break;
        case 'cancel-perp-order': cancelPerpOrderUI(ds.coin || '', ds.oid || ''); break;
        case 'set-perp-overview-cat': setPerpOverviewCategory(ds.cat || 'crypto'); break;
        case 'sort-perp-overview': togglePerpOverviewSort(ds.sort || 'vol'); break;
        case 'toggle-perp-fav': togglePerpFavorite(ds.coin || ''); break;
        case 'open-perp-trade': openPerpTradeScreen(ds.coin || ''); break;
        case 'inspect-perp-candle': inspectPerpCandle(Number(ds.candleIdx)); break;
        case 'reverse-perp-pos': reversePerpPositionUI(ds.coin || ''); break;
        case 'open-perp-pos-tpsl': openPerpPositionTpSlSheet(ds.coin || ''); break;
        case 'earn-pos-action': executeEarnPositionAction(ds.type || '', ds.target || ''); break;
        case 'select-staking-pool': selectStakingPool(ds.poolId || ''); break;
        case 'select-earn-lock': selectEarnLockTier(Number(ds.days) || 181); break;
        case 'delete-near-key': deleteNearAccessKeyFromSheet(ds.pk || ''); break;
        case 'select-miner': selectSavedMiner(ds.addr || ''); break;
        case 'remove-miner': removeSavedMiner(ds.addr || ''); break;
        case 'pick-contact': pickContactAddress(ds.addr || ''); break;
        case 'delete-contact': deleteContactById(ds.id || ''); break;
        case 'disconnect-wc': disconnectWcSession(ds.topic || ''); break;
        case 'set-dapp-filter': setDAppCatalogFilter(ds.chain || 'ALL'); break;
        case 'launch-dapp': launchDAppUrl(ds.url || ''); break;
        case 'disconnect-dapp-origin': disconnectDAppOrigin(ds.origin || ''); break;
        case 'disconnect-all-dapp-origins': disconnectAllDAppOrigins(); break;
        default: break;
      }
    });

    document.addEventListener('change', (e) => {
      const target = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-action]') : null;
      if (!target || !target.dataset) return;
      if (target.dataset.action === 'toggle-sol-rent') {
        toggleSolRentItem(target.dataset.ata || '', Boolean(target.checked));
      } else if (target.dataset.action === 'toggle-near-storage') {
        toggleNearStorageItem(target.dataset.contract || '', Boolean(target.checked));
      }
    });

    document.addEventListener('error', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG' || !img.classList || !img.classList.contains('token-img-fb')) return;
      const fb = img.dataset ? img.dataset.fb : '';
      if (fb && !img.dataset.fbTried) {
        img.dataset.fbTried = '1';
        img.src = fb;
        return;
      }
      const fb2 = img.dataset ? img.dataset.fb2 : '';
      if (fb2 && !img.dataset.fb2Tried) {
        img.dataset.fb2Tried = '1';
        img.src = fb2;
        return;
      }
      img.style.display = 'none';
      if (img.nextElementSibling) img.nextElementSibling.style.display = 'block';
    }, true);
  }

  function renderAll() {
    const st = getState();
    renderOnboardingVisibility();
    if (st.getActiveWallet()) {
      renderHeaderAndHero();
      if (st.activeTab === 'wallet') renderUnifiedAssetList();
      if (st.activeTab === 'swap') {
        if (st.swap.panelMode === 'limit') renderLimitOrderView();
        else renderSwapView();
      }
      if (st.activeTab === 'perp') renderPerpView();
      if (st.activeTab === 'earn') renderEarnView();
      if (st.activeTab === 'hub') renderHubView();
      const isOpen = (id) => Boolean($(id)?.classList?.contains('open'));
      if (isOpen('sheet-token-detail')) renderTokenDetailSheet();
      if (isOpen('sheet-tx-history')) renderTxHistorySheet();
      if (isOpen('sheet-tx-detail')) renderTxDetailSheet();
      if (isOpen('sheet-receive')) renderReceiveSheet();
      if (isOpen('sheet-wallets')) renderWalletSwitcherList();
      if (isOpen('sheet-contacts')) renderContactsList();
      if (isOpen('sheet-token-picker')) renderTokenPickerList();
      if (isOpen('sheet-perp-markets')) renderPerpMarketsSheet();
      if (isOpen('sheet-perp-funding')) renderPerpFundingSheet();
      if (isOpen('sheet-perp-tpsl') && st.perp && st.perp.editingTpslCoin && st.perp.account) {
        const pos = (st.perp.account.positions || []).find((p) => p.coin === st.perp.editingTpslCoin);
        if (pos && $('perp-tpsl-sheet-pair')) {
          $('perp-tpsl-sheet-pair').textContent = `${formatPerpDisplayPair(pos.coin)} · ${pos.isLong ? t('多', 'Long') : t('空', 'Short')} ${pos.leverageValue || '--'}x`;
        }
      }
      if (isOpen('sheet-dapp-browser')) renderDAppCatalog();
      if (isOpen('sheet-mining-pro')) {
        renderMiningWatchlist();
        renderMiningPoolSelector();
        renderMiningNetworkBar();
        renderMiningTelemetry();
      }
      if (isOpen('sheet-sol-rent')) renderSolRentList();
      if (isOpen('sheet-near-storage')) renderNearStorageList();
      if (isOpen('sheet-wallet-addresses')) renderHubView();
      if (isOpen('sheet-near-account')) renderNearAccountSummary(st.getActiveWallet());
      if (isOpen('sheet-walletconnect')) {
        renderWcCards();
        renderWcSessions();
      }
      if (isOpen('sheet-earn-stake') && st.activeTab !== 'earn') renderEarnView();
      if (isOpen('sheet-send')) {
        if (typeof handleSendRecipientInput === 'function' && $('send-recipient-input')?.value) {
          handleSendRecipientInput();
        } else if (typeof updateSendRoutePreview === 'function') {
          updateSendRoutePreview(false);
        }
      }
      if (isOpen('sheet-backup') && typeof setBackupRevealState === 'function' && typeof _backupRevealActive !== 'undefined') {
        setBackupRevealState(_backupRevealActive);
      }
      if (isOpen('sheet-dapp-approve') && typeof renderDAppApproveSheet === 'function') renderDAppApproveSheet();
      if (isOpen('sheet-confirm-dialog') && typeof renderConfirmDialogSheet === 'function') renderConfirmDialogSheet();
    }
  }

  function bootstrapApp() {
    const st = getState();
    st.initState();
    initDelegatedEventListeners();
    initHomePullToRefresh();
    initAppSecurityLifecycle();
    initForegroundResumeSync();
    if (!_langRenderBound) {
      _langRenderBound = true;
      st.onLanguageChange(() => renderAll());
    }
    renderAll();
    const activeW = st.getActiveWallet();
    if (activeW) {
      if (shouldEnableAppLockForWallet(activeW)) {
        st._deferredBootSync = true;
        engageAppLock(true);
      } else {
        clearAppLock();
        refreshAllBalancesAsync(false);
        if (typeof setTimeout === 'function' && typeof window !== 'undefined' && typeof document !== 'undefined') {
          const prefetchTm = setTimeout(() => {
            if (st.getActiveWallet()) {
              refreshPerpDataAsync(false).catch(() => {});
            }
          }, 600);
          if (prefetchTm && typeof prefetchTm.unref === 'function') prefetchTm.unref();
        }
      }
    } else {
      clearAppLock();
    }
    if (st.swap.activeOrder && st.swap.activeOrder.depositAddress) {
      renderSwapOrderCard();
      const upper = String(st.swap.activeOrder.status || '').toUpperCase();
      const pendingFollow = typeof hasPendingSwapFollowUp === 'function' && hasPendingSwapFollowUp(st.swap.activeOrder) && !st.swap.activeOrder.followUpFailed;
      if (!['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED'].includes(upper) || pendingFollow) {
        startOrderStatusPolling();
      }
    }
    startAutoPriceAndBalanceSync();
    const hasWcSessions = (() => {
      try {
        if (typeof localStorage === 'undefined') return false;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('wc@2:') && k.includes('session')) {
            const val = localStorage.getItem(k);
            if (val && val !== '{}' && val !== '[]') return true;
          }
        }
      } catch (_) {}
      return false;
    })();
    if (hasWcSessions && typeof setTimeout === 'function') {
      setTimeout(() => { ensureWcReady().catch(() => {}); }, 2500);
    }
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
      const isLocalDev = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
      if (isLocalDev) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister().catch(() => {}));
        }).catch(() => {});
      } else {
        let _swReloaded = false;
        navigator.serviceWorker.addEventListener?.('controllerchange', () => {
          if (_swReloaded) return;
          const curSt = getState();
          const inOnboarding = Boolean($('view-onboarding') && !$('view-onboarding').classList.contains('hidden'));
          const hasPendingSeed = Boolean(curSt && curSt.pendingMnemonic);
          const lockedOrAuth = Boolean(
            (typeof isAppLocked === 'function' && isAppLocked()) ||
            (typeof _appLockState !== 'undefined' && _appLockState && _appLockState.authenticating)
          );
          const busy = Boolean(
            inOnboarding ||
            hasPendingSeed ||
            lockedOrAuth ||
            (typeof document !== 'undefined' && document.querySelector && document.querySelector('.sheet-backdrop.open')) ||
            (curSt && ((curSt.swap && curSt.swap._executing) || (curSt.perp && curSt.perp.submitting)))
          );
          if (busy) {
            showToast(t('新版本已就绪，将在下次打开时生效', 'Update ready; will apply on next launch'));
            return;
          }
          _swReloaded = true;
          if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
            window.location.reload();
          }
        });
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          if (!reg) return;
          if (reg.waiting) {
            try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
          }
          reg.addEventListener?.('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener?.('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                try { nw.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
              }
            });
          });
        }).catch(() => {});
      }
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', bootstrapApp);
  }

  const NearCAUI = {
    bootstrapApp,
    initHomePullToRefresh,
    ensureEthersLoaded,
    ensureQrcodeLoaded,
    ensureMiningProLoaded,
    formatTokenPrice,
    formatUsd,
    renderAll,
    switchTab,
    toggleLanguage,
    detectDeviceBiometricProfileAsync,
    registerOrVerifyWebAuthnPasskeyAsync,
    requestBiometricAuth,
    verifySecurityAuthAsync,
    APP_LOCK_TIMEOUT_MS,
    shouldEnableAppLockForWallet,
    engageAppLock,
    clearAppLock,
    isAppLocked,
    unlockAppLockNow,
    handleAppVisibilityChange,
    setBackgroundPrivacyBlur,
    renderHubBiometricCardAsync,
    testBiometricAuthNow,
    refreshAllBalancesAsync,
    applyOptimisticChainSpend,
    reconcileFetchedChainBalance,
    getMergedTokenHistoryItems,
    computePtrPullDistance,
    getExplorerAddressUrl,
    getExplorerTxUrl,
    startAutoPriceAndBalanceSync,
    buildAllOnChainAssetGroups,
    buildAggregatedAssetGroups,
    partitionDustAssetGroups,
    toggleHomeDustAssets,
    renderUnifiedAssetList,
    openTokenDetailSheet,
    setTokenDetailChain,
    renderTokenDetailSheet,
    openAllTokenHistorySheet,
    openAllMiningPayoutHistorySheet,
    openTxDetailSheet,
    navigateBackFromTxHistory,
    navigateBackFromTxDetail,
    tokenDetailAction,
    copyTokenDetailAddress,
    recordWalletActivity,
    openSendSheet,
    setSendTargetEvmChain,
    handleSendAmountInput,
    applySendMaxSpendableFix,
    setSendMaxAmount,
    resolveEffectiveSendGasPlan,
    prefetchSendLiveGasAsync,
    executeUnifiedSend,
    openReceiveSheet,
    renderSwapView,
    renderSwapOrderCard,
    refreshActiveSwapOrderStatus,
    clearActiveSwapOrder,
    getTargetChainGasReserveInfo,
    computeNetSwapOutput,
    toggleSwapDetails,
    toggleSwapRateOrientation,
    setSwapGasReserveMode,
    fetchLiveSwapQuoteAsync,
    toggleFavoriteSwapToken,
    renderTokenPickerList,
    isSwapOriginSupported,
    validateSwapNearGasRequirement,
    floorToDecimals,
    formatMaxDecimalString,
    getWalletTokenRawBaseUnits,
    computeExactMaxSpendable,
    resolveNativeFeeDeductPlan,
    resolveEffectiveSwapGasPlan,
    prefetchSwapLiveGasAsync,
    setSwapMaxAmount,
    applySwapMaxSpendableFix,
    setLimitMaxAmount,
    evaluateSwapButtonState,
    doesSwapRouteRequireSelfRecipient,
    computeSwapPriceImpact,
    formatPoolApyText,
    executeActiveSwap,
    resumeActiveSwapFollowUp,
    setSwapPanelMode,
    setLimitChain,
    openLimitTokenPicker,
    renderLimitOrderView,
    resolveLimitPriceOrientation,
    toggleLimitPriceOrientation,
    evaluateLimitOrderState,
    stepLimitDclPoint,
    applyLimitRateOffset,
    applyLimitRateOffsetByIndex,
    toggleLimitSplitTicks,
    setLimitExpiryDays,
    setLimitOrdersTab,
    wrapNativeForLimitUI,
    executeLimitOrderAction,
    refreshLimitMarketContextAsync,
    refreshLimitOrdersAsync,
    claimLimitOrderUI,
    cancelLimitOrderUI,
    renderPerpView,
    renderPerpOverviewPanel,
    renderPerpOrderbook,
    renderPerpLongShortBar,
    refreshPerpLongShortAsync,
    renderPerpCandleSvg,
    inspectPerpCandle,
    clearPerpOverviewSearch,
    clearPerpMarketSearch,
    renderPerpMarketsSheet,
    handlePerpMarginInput,
    handlePerpLimitPriceInput,
    evaluatePerpOrderState,
    evaluatePerpOrderUI,
    refreshPerpDataAsync,
    openPerpMarketsSheet,
    selectPerpMarket,
    backToPerpOverview,
    openPerpTradeScreen,
    handlePerpOverviewSearch,
    setPerpOverviewCategory,
    togglePerpOverviewSort,
    togglePerpFavorite,
    toggleCurrentPerpFavorite,
    setPerpSide,
    setPerpMarginMode,
    setPerpOrderType,
    fillPerpBboPrice,
    togglePerpReduceOnly,
    setPerpLeverage,
    setPerpMarginPercent,
    togglePerpChart,
    fillPerpLimitPrice,
    setPerpBottomTab,
    executePerpOrderUI,
    closePerpPositionUI,
    openPerpPositionTpSlSheet,
    submitPerpPositionTpSlUI,
    reversePerpPositionUI,
    executePerpBatchAction,
    cancelPerpOrderUI,
    setPerpChartInterval,
    setPerpMarketFilter,
    openPerpFundingSheet,
    setPerpFundingTab,
    quickTransferSpotToPerpUI,
    evaluatePerpOneClickState,
    evaluatePerpArbDepositState,
    evaluatePerpWithdrawState,
    evaluatePerpArbDepositUI,
    evaluatePerpWithdrawUI,
    setPerpOneClickMax,
    setPerpArbMax,
    setPerpWithdrawMax,
    jumpFromPerpToSwap,
    schedulePerpOneClickQuote,
    executePerpOneClickDepositUI,
    executePerpArbBridgeDepositUI,
    executePerpWithdrawUI,
    refreshStakingMetrics,
    ensureStakingMetricsFresh,
    refreshEarnMetricsAsync,
    renderEarnView,
    setEarnPoolFilter,
    handleEarnPoolSearch,
    selectEarnLockTier,
    selectStakingPool,
    executeSelectedStake,
    executeEarnPositionAction,
    openMiningProSheet,
    runMiningDeepQuery,
    openWalletConnectSheet,
    openQrScannerSheet,
    closeQrScannerSheet,
    triggerQrScannerFileInput,
    handleQrScannerFileSelect,
    parseScannedAddressPayload,
    handleQrScanResultAsync,
    openContactsSheet,
    openSolRentReclaimSheet,
    openNearStorageReclaimSheet,
    scanNearStorageReclaimUI,
    toggleNearStorageItem,
    executeNearStorageReclaimUI,
    openWalletSwitcherSheet,
    switchActiveWallet,
    openBackupKeysSheet,
    toggleBackupKeysReveal,
    openWalletAddressesSheet,
    bindOrReplacePrlMnemonicUI,
    restoreDefaultPrlAccountUI,
    openNearAccountSheet,
    checkNearDomainAvailabilityUI,
    toggleNearBindDrawer,
    toggleWcAdvancedSettings,
    registerNearDomainFromHub,
    bindNearDomainFromHub,
    openNearAccessKeysSheet,
    refreshNearAccessKeysSheet,
    deleteNearAccessKeyFromSheet,
    generateRotateMnemonicInSheet,
    addNearMnemonicKeyOnlyFromSheet,
    confirmRotateNearAccountKey,
    toggleTokenPickerMoreChains,
    togglePerpTpSl,
    openDAppBrowserSheet,
    openDAppFromInput,
    launchDAppUrl,
    setDAppCatalogFilter,
    disconnectDAppOrigin,
    disconnectAllDAppOrigins,
    confirmDAppApproval,
    rejectDAppApproval,
    setTokenPickerChain,
    renderNearAccountSummary,
    renderMiningTelemetry,
    openSheet,
    closeAllSheets,
    showConfirmDialogAsync,
    dismissConfirmDialog
  };

  const globalHandlers = {
    switchTab,
    toggleLanguage,
    openCreateWalletFlow,
    confirmCreateWallet,
    openImportWalletFlow,
    validateOnboardImportLive,
    confirmImportWallet,
    cancelOnboardSubPanel,
    copyPendingMnemonic,
    openWalletSwitcherSheet,
    switchActiveWallet,
    deleteWalletById,
    startAdditionalWalletCreate,
    startAdditionalWalletImport,
    openBackupKeysSheet,
    toggleBackupKeysReveal,
    openWalletAddressesSheet,
    bindOrReplacePrlMnemonicUI,
    restoreDefaultPrlAccountUI,
    openNearAccountSheet,
    checkNearDomainAvailabilityUI,
    toggleNearBindDrawer,
    toggleWcAdvancedSettings,
    openNearAccessKeysSheet,
    refreshNearAccessKeysSheet,
    deleteNearAccessKeyFromSheet,
    generateRotateMnemonicInSheet,
    addNearMnemonicKeyOnlyFromSheet,
    confirmRotateNearAccountKey,
    testBiometricAuthNow,
    unlockAppLockNow,
    copyTextValue,
    copyActiveNearId,
    jumpToNearDomainManager,
    focusMpcInspector,
    refreshAllBalancesAsync,
    applyOptimisticChainSpend,
    reconcileFetchedChainBalance,
    getMergedTokenHistoryItems,
    computePtrPullDistance,
    getExplorerAddressUrl,
    getExplorerTxUrl,
    startAutoPriceAndBalanceSync,
    openTokenDetailSheet,
    setTokenDetailChain,
    openAllTokenHistorySheet,
    openAllMiningPayoutHistorySheet,
    openTxDetailSheet,
    navigateBackFromTxHistory,
    navigateBackFromTxDetail,
    tokenDetailAction,
    copyTokenDetailAddress,
    openTokenDetailPool,
    recordWalletActivity,
    quickActionSwapFromEntry,
    quickActionSendFromEntry,
    openSendSheet,
    setSendTargetEvmChain,
    handleSendAssetChange,
    updateSendAvailabilityUI,
    handleSendRecipientInput,
    setSendMaxAmount,
    handleSendAmountInput,
    applySendMaxSpendableFix,
    pasteToSendAddress,
    executeUnifiedSend,
    openReceiveSheet,
    selectReceiveNetwork,
    copyReceiveAddress,
    setSwapSlippage,
    toggleSwapDetails,
    toggleSwapRateOrientation,
    setSwapGasReserveMode,
    handleSwapRecipientInput,
    handleSwapAmountInput,
    setSwapMaxAmount,
    applySwapMaxSpendableFix,
    flipSwapTokens,
    openTokenPicker,
    setTokenPickerChain,
    toggleFavoriteSwapToken,
    renderTokenPickerList,
    selectSwapToken,
    executeActiveSwap,
    copySwapOrderDeposit,
    refreshActiveSwapOrderStatus,
    submitSwapOrderTxHash,
    resumeActiveSwapFollowUp,
    clearActiveSwapOrder,
    setSwapPanelMode,
    setLimitChain,
    openLimitTokenPicker,
    handleLimitInput,
    handleLimitRateInput,
    setLimitMaxAmount,
    flipLimitTokens,
    toggleLimitPriceOrientation,
    applyLimitRateOffset,
    applyLimitRateOffsetByIndex,
    stepLimitDclPoint,
    toggleLimitSplitTicks,
    setLimitExpiryDays,
    setLimitOrdersTab,
    wrapNativeForLimitUI,
    executeLimitOrderAction,
    refreshLimitOrdersAsync,
    claimLimitOrderUI,
    cancelLimitOrderUI,
    isSwapOriginSupported,
    validateSwapNearGasRequirement,
    floorToDecimals,
    formatMaxDecimalString,
    getWalletTokenRawBaseUnits,
    computeExactMaxSpendable,
    resolveNativeFeeDeductPlan,
    resolveEffectiveSwapGasPlan,
    prefetchSwapLiveGasAsync,
    evaluateSwapButtonState,
    doesSwapRouteRequireSelfRecipient,
    computeSwapPriceImpact,
    formatPoolApyText,
    renderLimitOrderView,
    resolveLimitPriceOrientation,
    evaluateLimitOrderState,
    refreshLimitMarketContextAsync,
    renderPerpView,
    renderPerpOverviewPanel,
    renderPerpOrderbook,
    renderPerpLongShortBar,
    refreshPerpLongShortAsync,
    renderPerpCandleSvg,
    inspectPerpCandle,
    clearPerpOverviewSearch,
    clearPerpMarketSearch,
    renderPerpMarketsSheet,
    handlePerpMarginInput,
    handlePerpLimitPriceInput,
    evaluatePerpOrderState,
    evaluatePerpOrderUI,
    refreshPerpDataAsync,
    openPerpMarketsSheet,
    selectPerpMarket,
    backToPerpOverview,
    openPerpTradeScreen,
    handlePerpOverviewSearch,
    setPerpOverviewCategory,
    togglePerpOverviewSort,
    togglePerpFavorite,
    toggleCurrentPerpFavorite,
    setPerpSide,
    setPerpMarginMode,
    setPerpOrderType,
    fillPerpBboPrice,
    togglePerpReduceOnly,
    setPerpLeverage,
    setPerpMarginPercent,
    togglePerpChart,
    fillPerpLimitPrice,
    setPerpBottomTab,
    executePerpOrderUI,
    closePerpPositionUI,
    openPerpPositionTpSlSheet,
    submitPerpPositionTpSlUI,
    reversePerpPositionUI,
    executePerpBatchAction,
    cancelPerpOrderUI,
    setPerpChartInterval,
    setPerpMarketFilter,
    openPerpFundingSheet,
    setPerpFundingTab,
    quickTransferSpotToPerpUI,
    evaluatePerpOneClickState,
    evaluatePerpArbDepositState,
    evaluatePerpWithdrawState,
    evaluatePerpArbDepositUI,
    evaluatePerpWithdrawUI,
    setPerpOneClickMax,
    setPerpArbMax,
    setPerpWithdrawMax,
    jumpFromPerpToSwap,
    schedulePerpOneClickQuote,
    executePerpOneClickDepositUI,
    executePerpArbBridgeDepositUI,
    executePerpWithdrawUI,
    refreshStakingMetrics,
    setEarnPoolFilter,
    handleEarnPoolSearch,
    selectEarnLockTier,
    selectStakingPool,
    setEarnMaxAmount,
    updateEarnEstimatedOut,
    executeSelectedStake,
    executeEarnPositionAction,
    registerNearDomainFromHub,
    bindNearDomainFromHub,
    openMiningProSheet,
    setMiningPoolKey,
    saveCurrentMinerAddress,
    selectSavedMiner,
    removeSavedMiner,
    runMiningDeepQuery,
    openContactsSheet,
    openContactsPicker,
    openSolRentReclaimSheet,
    scanSolRentReclaimUI,
    toggleSolRentItem,
    executeSolRentReclaimUI,
    openNearStorageReclaimSheet,
    scanNearStorageReclaimUI,
    toggleNearStorageItem,
    executeNearStorageReclaimUI,
    addContactFromSheet,
    deleteContactById,
    pickContactAddress,
    openWalletConnectSheet,
    openQrScannerSheet,
    closeQrScannerSheet,
    triggerQrScannerFileInput,
    handleQrScannerFileSelect,
    parseScannedAddressPayload,
    handleQrScanResultAsync,
    saveWalletConnectProjectId,
    pasteToWcUri,
    pairWalletConnectUri,
    approveWcProposal,
    rejectWcProposal,
    approveWcRequest,
    rejectWcRequest,
    disconnectWcSession,
    toggleTokenPickerMoreChains,
    togglePerpTpSl,
    openDAppBrowserSheet,
    openDAppFromInput,
    launchDAppUrl,
    setDAppCatalogFilter,
    disconnectDAppOrigin,
    disconnectAllDAppOrigins,
    confirmDAppApproval,
    rejectDAppApproval,
    renderNearAccountSummary,
    renderMiningTelemetry,
    openSheet,
    closeAllSheets,
    showConfirmDialogAsync,
    dismissConfirmDialog
  };

  if (root) {
    root.NearCAUI = NearCAUI;
    root.NearCA = root.NearCA || {};
    root.NearCA.ui = NearCAUI;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.NearCAUI = NearCAUI;
    globalThis.NearCA = globalThis.NearCA || {};
    globalThis.NearCA.ui = NearCAUI;
    Object.assign(globalThis, globalHandlers);
  }
  if (typeof window !== 'undefined') {
    window.NearCAUI = NearCAUI;
    window.NearCA = window.NearCA || {};
    window.NearCA.ui = NearCAUI;
    Object.assign(window, globalHandlers);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NearCAUI;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
