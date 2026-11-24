  // ==================== Root Render & Lifecycle ====================

  let _delegatedListenersBound = false;

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
        case 'quick-swap': quickActionSwapFromEntry(ds.assetId || '', ds.chain || '', ds.contract || ''); break;
        case 'quick-send': quickActionSendFromEntry(ds.symbol || '', ds.chain || '', ds.assetId || '', ds.contract || ''); break;
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
    }
  }

  function bootstrapApp() {
    const st = getState();
    st.initState();
    initDelegatedEventListeners();
    initHomePullToRefresh();
    initAppSecurityLifecycle();
    st.onLanguageChange(() => renderAll());
    renderAll();
    const activeW = st.getActiveWallet();
    if (activeW) {
      refreshAllBalancesAsync(false);
      if (typeof setTimeout === 'function' && typeof window !== 'undefined' && typeof document !== 'undefined') {
        const prefetchTm = setTimeout(() => {
          if (st.getActiveWallet()) {
            refreshPerpDataAsync(false).catch(() => {});
            ensureStakingMetricsFresh(300_000);
          }
        }, 600);
        if (prefetchTm && typeof prefetchTm.unref === 'function') prefetchTm.unref();
      }
      if (shouldEnableAppLockForWallet(activeW)) {
        engageAppLock(true);
      } else {
        clearAppLock();
      }
    } else {
      clearAppLock();
    }
    if (st.swap.activeOrder && st.swap.activeOrder.depositAddress) {
      renderSwapOrderCard();
      const upper = String(st.swap.activeOrder.status || '').toUpperCase();
      if (!['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED'].includes(upper)) {
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
    if (st.wc.projectId && hasWcSessions && typeof setTimeout === 'function') {
      setTimeout(() => { ensureWcReady().catch(() => {}); }, 2500);
    }
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
      const isLocalDev = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
      if (isLocalDev) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister().catch(() => {}));
        }).catch(() => {});
      } else {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
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
    verifyPinIfNeeded,
    APP_LOCK_TIMEOUT_MS,
    shouldEnableAppLockForWallet,
    engageAppLock,
    clearAppLock,
    unlockAppLockNow,
    unlockAppLockWithPin,
    handleAppVisibilityChange,
    setBackgroundPrivacyBlur,
    renderHubBiometricCardAsync,
    testBiometricAuthNow,
    openSetWalletPinPrompt,
    pressSecurityPinDigit,
    submitSecurityPin,
    clearSecurityPin,
    backspaceSecurityPin,
    triggerSecurityBiometricNow,
    cancelSecurityAuthModal,
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
    toggleAssetExpand,
    openTokenDetailSheet,
    setTokenDetailChain,
    renderTokenDetailSheet,
    openAllTokenHistorySheet,
    openAllMiningPayoutHistorySheet,
    openTxDetailSheet,
    fetchChainTransactionDetailAsync,
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
    openPinSheet,
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
    closeAllSheets
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
    openPinSheet,
    saveWalletPin,
    testBiometricAuthNow,
    openSetWalletPinPrompt,
    pressSecurityPinDigit,
    submitSecurityPin,
    clearSecurityPin,
    backspaceSecurityPin,
    triggerSecurityBiometricNow,
    cancelSecurityAuthModal,
    unlockAppLockNow,
    unlockAppLockWithPin,
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
    toggleAssetExpand,
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
    recomputeHubMpcAddress,
    copyHubMpcAddress,
    executeHubMpcSign,
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
    closeAllSheets
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
