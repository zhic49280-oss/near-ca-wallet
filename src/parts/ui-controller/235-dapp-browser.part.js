  // ==================== Native In-App DApp Browser ====================

  const DAPP_CONN_STORAGE_KEY = 'near_ca_dapp_connections_v1';
  const DAPP_DISCONN_STORAGE_KEY = 'near_ca_dapp_disconnected_v1';

  function getActiveDAppWalletId() {
    try {
      const st = typeof getState === 'function' ? getState() : null;
      const w = st && typeof st.getActiveWallet === 'function' ? st.getActiveWallet() : null;
      if (w && w.id) return String(w.id);
      if (st && st.activeWalletId) return String(st.activeWalletId);
    } catch (_) {}
    return '';
  }

  function parseDAppConnKey(entry) {
    const str = String(entry || '').trim();
    const m = str.match(/^([^:]+):(evm|solana|near):(.+)$/);
    if (!m) return null;
    return { walletId: m[1], namespace: m[2], origin: m[3] };
  }

  function makeDAppConnKey(walletId, namespace, origin) {
    const wid = String(walletId || '').trim();
    const ns = String(namespace || '').trim();
    const orig = String(origin || '').trim();
    if (!wid || !ns || !orig) return '';
    return `${wid}:${ns}:${orig}`;
  }

  function loadPersistedDAppSet(storageKey) {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            return new Set(arr.map((x) => String(x)).filter((x) => Boolean(parseDAppConnKey(x))));
          }
        }
      }
    } catch (_) {}
    return new Set();
  }

  function savePersistedDAppSet(storageKey, setObj) {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        const clean = Array.from(setObj || []).filter((x) => Boolean(parseDAppConnKey(x)));
        localStorage.setItem(storageKey, JSON.stringify(clean));
      }
    } catch (_) {}
  }

  const _dappSession = {
    chainFilter: 'ALL',
    activeEvmChainKey: 'eth',
    connectedOrigins: loadPersistedDAppSet(DAPP_CONN_STORAGE_KEY),
    disconnectedOrigins: loadPersistedDAppSet(DAPP_DISCONN_STORAGE_KEY),
    pendingApproval: null,
    listenersBound: false,
    nativeOpen: false,
    currentUrl: '',
    currentOrigin: ''
  };
  let _lastDAppStorageRef = typeof localStorage !== 'undefined' ? localStorage : null;
  let _dappBridgeQueue = Promise.resolve();
  let _launchingDApp = false;

  function syncDAppStorageSetsIfChanged() {
    if (typeof localStorage === 'undefined') return;
    if (localStorage !== _lastDAppStorageRef) {
      _lastDAppStorageRef = localStorage;
      _dappSession.connectedOrigins = loadPersistedDAppSet(DAPP_CONN_STORAGE_KEY);
      _dappSession.disconnectedOrigins = loadPersistedDAppSet(DAPP_DISCONN_STORAGE_KEY);
    }
  }

  function persistAllDAppOriginSets() {
    savePersistedDAppSet(DAPP_CONN_STORAGE_KEY, _dappSession.connectedOrigins);
    savePersistedDAppSet(DAPP_DISCONN_STORAGE_KEY, _dappSession.disconnectedOrigins);
    if (typeof localStorage !== 'undefined') _lastDAppStorageRef = localStorage;
  }

  function getNativeDAppPlugin() {
    if (typeof window === 'undefined' || !window.Capacitor) return null;
    const cap = window.Capacitor;
    if (cap.Plugins && cap.Plugins.NativeDAppBrowser) return cap.Plugins.NativeDAppBrowser;
    return null;
  }

  async function setNativeBrowserOverlayVisible(visible) {
    const plugin = getNativeDAppPlugin();
    if (!plugin || typeof plugin.setOverlayVisible !== 'function') return;
    try {
      await plugin.setOverlayVisible({ visible: Boolean(visible) });
    } catch (_) {}
  }

  function emitNativeDisconnectEvents() {
    const plugin = getNativeDAppPlugin();
    if (!_dappSession.nativeOpen || !plugin || typeof plugin.emitProviderEvent !== 'function') return;
    plugin.emitProviderEvent({ namespace: 'evm', eventName: 'accountsChanged', payload: '[]' }).catch(() => {});
    plugin.emitProviderEvent({ namespace: 'solana', eventName: 'disconnect', payload: 'null' }).catch(() => {});
    plugin.emitProviderEvent({ namespace: 'near', eventName: 'accountsChanged', payload: '[]' }).catch(() => {});
  }

  function isDAppOriginConnected(origin, namespace, walletIdOverride) {
    syncDAppStorageSetsIfChanged();
    const wid = walletIdOverride !== undefined ? String(walletIdOverride || '') : getActiveDAppWalletId();
    const key = makeDAppConnKey(wid, namespace, origin);
    return key ? _dappSession.connectedOrigins.has(key) : false;
  }

  function isDAppOriginDisconnected(origin, namespace, walletIdOverride) {
    syncDAppStorageSetsIfChanged();
    const wid = walletIdOverride !== undefined ? String(walletIdOverride || '') : getActiveDAppWalletId();
    const key = makeDAppConnKey(wid, namespace, origin);
    return key ? _dappSession.disconnectedOrigins.has(key) : false;
  }

  function markDAppOriginConnected(origin, namespace, walletIdOverride) {
    syncDAppStorageSetsIfChanged();
    const wid = walletIdOverride !== undefined ? String(walletIdOverride || '') : getActiveDAppWalletId();
    const key = makeDAppConnKey(wid, namespace, origin);
    if (!key) return;
    _dappSession.disconnectedOrigins.delete(key);
    _dappSession.connectedOrigins.add(key);
    persistAllDAppOriginSets();
    renderDAppConnectedSection();
  }

  function markDAppOriginDisconnected(origin, namespace, walletIdOverride) {
    syncDAppStorageSetsIfChanged();
    const wid = walletIdOverride !== undefined ? String(walletIdOverride || '') : getActiveDAppWalletId();
    const key = makeDAppConnKey(wid, namespace, origin);
    if (!key) return;
    _dappSession.connectedOrigins.delete(key);
    _dappSession.disconnectedOrigins.add(key);
    persistAllDAppOriginSets();
    renderDAppConnectedSection();
  }

  function disconnectDAppOrigin(origin) {
    syncDAppStorageSetsIfChanged();
    const clean = String(origin || '').trim();
    const wid = getActiveDAppWalletId();
    if (!clean || !wid) return;
    ['evm', 'solana', 'near'].forEach((ns) => {
      const key = makeDAppConnKey(wid, ns, clean);
      if (!key) return;
      _dappSession.connectedOrigins.delete(key);
      _dappSession.disconnectedOrigins.add(key);
    });
    persistAllDAppOriginSets();
    if (_dappSession.nativeOpen && _dappSession.currentOrigin === clean) {
      emitNativeDisconnectEvents();
    }
    renderDAppCatalog();
    showToast(t('已断开 DApp 授权', 'DApp disconnected'));
  }

  function disconnectAllDAppOrigins() {
    syncDAppStorageSetsIfChanged();
    const wid = getActiveDAppWalletId();
    if (!wid) return;
    const prefix = `${wid}:`;
    for (const key of Array.from(_dappSession.connectedOrigins)) {
      if (key.startsWith(prefix)) {
        _dappSession.connectedOrigins.delete(key);
        _dappSession.disconnectedOrigins.add(key);
      }
    }
    persistAllDAppOriginSets();
    emitNativeDisconnectEvents();
    renderDAppCatalog();
    showToast(t('已断开全部 DApp 授权', 'All DApps disconnected'));
  }

  function clearDAppWalletConnections(walletId) {
    syncDAppStorageSetsIfChanged();
    const wid = String(walletId || '').trim();
    if (!wid) return;
    const prefix = `${wid}:`;
    for (const key of Array.from(_dappSession.connectedOrigins)) {
      if (key.startsWith(prefix)) _dappSession.connectedOrigins.delete(key);
    }
    for (const key of Array.from(_dappSession.disconnectedOrigins)) {
      if (key.startsWith(prefix)) _dappSession.disconnectedOrigins.delete(key);
    }
    persistAllDAppOriginSets();
    if (_dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
      const resolvePending = _dappSession.pendingApproval.resolve;
      _dappSession.pendingApproval = null;
      resolvePending(false);
    }
    renderDAppConnectedSection();
  }

  function syncDAppSessionForWallet(nextWallet) {
    if (_dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
      const resolvePending = _dappSession.pendingApproval.resolve;
      _dappSession.pendingApproval = null;
      resolvePending(false);
    }
    _dappSession.activeEvmChainKey = 'eth';
    _dappSession.connectedOrigins = loadPersistedDAppSet(DAPP_CONN_STORAGE_KEY);
    _dappSession.disconnectedOrigins = loadPersistedDAppSet(DAPP_DISCONN_STORAGE_KEY);
    if (typeof localStorage !== 'undefined') _lastDAppStorageRef = localStorage;

    const plugin = getNativeDAppPlugin();
    if (_dappSession.nativeOpen && plugin && typeof plugin.emitProviderEvent === 'function') {
      const curOrigin = _dappSession.currentOrigin;
      const wid = nextWallet && nextWallet.id ? String(nextWallet.id) : getActiveDAppWalletId();
      const contracts = typeof getContracts === 'function' ? getContracts() : null;
      const evmConnected = Boolean(curOrigin && wid && isDAppOriginConnected(curOrigin, 'evm', wid));
      const solConnected = Boolean(curOrigin && wid && isDAppOriginConnected(curOrigin, 'solana', wid));
      const nearConnected = Boolean(curOrigin && wid && isDAppOriginConnected(curOrigin, 'near', wid));
      const evmAddr = (nextWallet && contracts && typeof contracts.resolveWalletEvmSender === 'function'
        ? contracts.resolveWalletEvmSender(nextWallet)
        : '') || (nextWallet && (nextWallet.mpcEvmAddress || nextWallet.evmAddress)) || '';
      const solAddr = (nextWallet && nextWallet.solAddress) || '';
      const nearAcct = (nextWallet && (nextWallet.nearNamedAccount || nextWallet.nearAddress)) || '';

      plugin.emitProviderEvent({
        namespace: 'evm',
        eventName: 'accountsChanged',
        payload: JSON.stringify(evmConnected && evmAddr ? [evmAddr] : [])
      }).catch(() => {});
      plugin.emitProviderEvent({
        namespace: 'solana',
        eventName: solConnected && solAddr ? 'accountChanged' : 'disconnect',
        payload: solConnected && solAddr ? JSON.stringify({ publicKey: solAddr }) : 'null'
      }).catch(() => {});
      plugin.emitProviderEvent({
        namespace: 'near',
        eventName: 'accountsChanged',
        payload: JSON.stringify(nearConnected && nearAcct ? [nearAcct] : [])
      }).catch(() => {});
    }

    renderDAppConnectedSection();
  }

  function renderDAppConnectedSection() {
    const sec = $('dapp-connected-section');
    if (!sec) return;
    const wid = getActiveDAppWalletId();
    const byOrigin = new Map();
    if (wid) {
      for (const entry of _dappSession.connectedOrigins) {
        const parsed = parseDAppConnKey(entry);
        if (!parsed || parsed.walletId !== wid) continue;
        const ns = parsed.namespace.toUpperCase();
        if (!byOrigin.has(parsed.origin)) byOrigin.set(parsed.origin, new Set());
        byOrigin.get(parsed.origin).add(ns === 'SOLANA' ? 'SOL' : ns);
      }
    }
    const connectedList = Array.from(byOrigin.entries()).map(([origin, nsSet]) => {
      let host = origin;
      try { host = new URL(origin).hostname || origin; } catch (_) {}
      return { origin, host, badges: Array.from(nsSet).join(' · ') };
    });
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountDAppBookmarksPanel === 'function') {
      sec.classList.toggle('hidden', connectedList.length === 0);
      fw.mountDAppBookmarksPanel(sec, {
        mode: 'connected',
        connected: connectedList,
        isEn: getState().lang === 'en'
      });
    } else {
      sec.classList.toggle('hidden', connectedList.length === 0);
      sec.innerHTML = connectedList
        .map((item) => `<div class="dapp-connected-item" data-origin="${escapeHtml(item.origin)}"><span>${escapeHtml(item.host)}</span><span>${escapeHtml(item.badges)}</span></div>`)
        .join('');
    }
  }

  function renderDAppCatalog() {
    renderDAppConnectedSection();
    const browserMod = getDAppBrowser();
    const filterEl = $('dapp-filter-bar');
    const listEl = $('dapp-catalog-list');
    if (!browserMod) return;

    const filter = _dappSession.chainFilter || 'ALL';
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const isEn = getState().lang === 'en';

    if (filterEl && fw && typeof fw.mountDAppBookmarksPanel === 'function') {
      fw.mountDAppBookmarksPanel(filterEl, {
        mode: 'filters',
        chainFilter: filter,
        isEn
      });
    }

    if (listEl && fw && typeof fw.mountDAppBookmarksPanel === 'function') {
      const catalog = Array.isArray(browserMod.DAPP_CATALOG) ? browserMod.DAPP_CATALOG : [];
      fw.mountDAppBookmarksPanel(listEl, {
        mode: 'catalog',
        catalog,
        chainFilter: filter,
        isEn
      });
    }
  }

  function setDAppCatalogFilter(chainFilter) {
    _dappSession.chainFilter = chainFilter || 'ALL';
    renderDAppCatalog();
  }

  function openDAppBrowserSheet() {
    ensureDAppBridgeListeners();
    renderDAppCatalog();
    openSheet('sheet-dapp-browser');
  }

  function renderDAppApproveSheet() {
    if (typeof document === 'undefined' || !$('sheet-dapp-approve')) return;
    const pending = _dappSession && _dappSession.pendingApproval;
    if (!pending || !pending.details) return;
    const details = pending.details;
    const approveSheet = $('sheet-dapp-approve');
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const approveBody = approveSheet && typeof approveSheet.querySelector === 'function' ? approveSheet.querySelector('.sheet-body') : null;
    if (fw && typeof fw.mountDAppApprovePanel === 'function' && approveBody) {
      fw.mountDAppApprovePanel(approveBody, {
        origin: details.origin || '--',
        chainLabel: details.chainLabel || details.namespace || '--',
        method: details.method || '--',
        account: details.account || '--',
        summary: details.summary || '--',
        isHighRisk: Boolean(details.isHighRisk),
        riskWarning: details.riskWarning || '',
        approving: false,
        isEn: getState().lang === 'en',
        onConfirm: confirmDAppApproval,
        onReject: rejectDAppApproval
      });
    } else {
      if ($('dapp-approve-origin')) $('dapp-approve-origin').textContent = details.origin || '--';
      if ($('dapp-approve-chain')) $('dapp-approve-chain').textContent = details.chainLabel || details.namespace || '--';
      if ($('dapp-approve-method')) $('dapp-approve-method').textContent = details.method || '--';
      if ($('dapp-approve-account')) $('dapp-approve-account').textContent = details.account || '--';
      if ($('dapp-approve-detail')) $('dapp-approve-detail').textContent = details.summary || '--';
      if ($('dapp-approve-risk-banner')) {
        const banner = $('dapp-approve-risk-banner');
        if (details.riskWarning) {
          banner.textContent = details.riskWarning;
          banner.classList.remove('hidden');
        } else {
          banner.textContent = '';
          banner.classList.add('hidden');
        }
      }
    }
  }

  function requestDAppApprovalAsync(details) {
    return new Promise(async (resolve) => {
      if (_dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
        _dappSession.pendingApproval.resolve(false);
        _dappSession.pendingApproval = null;
      }

      if (typeof document === 'undefined' || !$('sheet-dapp-approve')) {
        resolve(false);
        return;
      }

      const wasNativeOpen = Boolean(_dappSession.nativeOpen);
      if (wasNativeOpen) {
        await setNativeBrowserOverlayVisible(false);
        if (!_dappSession.nativeOpen) {
          resolve(false);
          return;
        }
      }

      _dappSession.pendingApproval = {
        details,
        resolve: async (accepted) => {
          _dappSession.pendingApproval = null;
          const approveSheet = $('sheet-dapp-approve');
          if (approveSheet) {
            approveSheet.classList.remove('open');
            approveSheet.setAttribute('aria-hidden', 'true');
          }
          const backdrop = $('sheet-backdrop');
          const stillOpen = typeof document !== 'undefined' && document.querySelector('.bottom-sheet.open');
          if (backdrop && !stillOpen) backdrop.classList.remove('open');
          if (typeof syncSheetScrollLock === 'function') syncSheetScrollLock();
          if (!accepted && _dappSession.nativeOpen) {
            await setNativeBrowserOverlayVisible(true);
          }
          resolve(Boolean(accepted));
        }
      };
      renderDAppApproveSheet();
      openSheet('sheet-dapp-approve');
    });
  }

  async function confirmDAppApproval() {
    const pending = _dappSession.pendingApproval;
    if (!pending || typeof pending.resolve !== 'function') return;
    const details = pending.details || {};
    if (details.requireSecondConfirm || details.method === 'eth_sign') {
      if (typeof showConfirmDialogAsync === 'function') {
        const confirmedBlind = await showConfirmDialogAsync(
          t(
            `此请求要求对原始摘要进行高危盲签（eth_sign），可能导致资产被盗：\n${String(details.summary || '')}\n\n仅在完全信任该应用时继续。`,
            `This request asks for high-risk blind signing (eth_sign), which can drain your assets:\n${String(details.summary || '')}\n\nContinue only if you fully trust this DApp.`
          ),
          {
            danger: true,
            title: t('⚠️ 高危盲签二次确认', '⚠️ High-Risk Blind Sign'),
            confirmText: t('确认盲签', 'Confirm Blind Sign'),
            cancelText: t('拒绝', 'Reject')
          }
        );
        if (!confirmedBlind) {
          rejectDAppApproval();
          return;
        }
      } else {
        rejectDAppApproval();
        return;
      }
    }
    if (_dappSession.pendingApproval === pending && typeof pending.resolve === 'function') {
      pending.resolve(true);
    }
  }

  function rejectDAppApproval() {
    if (_dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
      const resolvePending = _dappSession.pendingApproval.resolve;
      _dappSession.pendingApproval = null;
      resolvePending(false);
      return;
    }
    const approveSheet = $('sheet-dapp-approve');
    if (approveSheet && approveSheet.classList.contains('open')) {
      approveSheet.classList.remove('open');
      approveSheet.setAttribute('aria-hidden', 'true');
    }
    const backdrop = $('sheet-backdrop');
    const stillOpen = typeof document !== 'undefined' && document.querySelector('.bottom-sheet.open');
    if (backdrop && !stillOpen) backdrop.classList.remove('open');
    if (typeof syncSheetScrollLock === 'function') syncSheetScrollLock();
    if (_dappSession.nativeOpen) {
      setNativeBrowserOverlayVisible(true);
    }
  }

  async function verifyDAppSecurityAuthAsync(wallet, reasonText) {
    if (_dappSession.nativeOpen) {
      await setNativeBrowserOverlayVisible(false);
    }
    try {
      return await verifySecurityAuthAsync(wallet, reasonText);
    } finally {
      if (_dappSession.nativeOpen && !$('sheet-dapp-approve')?.classList?.contains('open')) {
        await setNativeBrowserOverlayVisible(true);
      }
    }
  }

  function handleIncomingNativeBridgePayload(rawEvent) {
    const run = () => _processNativeBridgePayload(rawEvent);
    _dappBridgeQueue = _dappBridgeQueue.then(run, run);
    return _dappBridgeQueue;
  }

  async function _processNativeBridgePayload(rawEvent) {
    const plugin = getNativeDAppPlugin();
    const browserMod = getDAppBrowser();
    const contracts = getContracts();
    const crypto = getCrypto();
    const st = getState();
    const wallet = st && st.getActiveWallet ? st.getActiveWallet() : null;
    if (!browserMod || !contracts) return;

    let msg = rawEvent && (rawEvent.payload !== undefined ? rawEvent.payload : rawEvent);
    if (typeof msg === 'string') {
      try { msg = JSON.parse(msg); } catch (_) { return; }
    }
    if (!msg || !msg.id) return;

    const rawNativeOrigin = rawEvent && typeof rawEvent === 'object' && rawEvent.nativeOrigin
      ? String(rawEvent.nativeOrigin).trim()
      : '';
    const rawNativeUrl = rawEvent && typeof rawEvent === 'object' && rawEvent.nativeUrl
      ? String(rawEvent.nativeUrl).trim()
      : '';
    let trustedOrigin = '';
    let trustedUrl = '';
    if (rawNativeOrigin || rawNativeUrl) {
      const sanitizedNative = browserMod.sanitizeDAppUrl(rawNativeOrigin || rawNativeUrl);
      const sanitizedUrl = rawNativeUrl ? browserMod.sanitizeDAppUrl(rawNativeUrl) : sanitizedNative;
      if (sanitizedNative) {
        try {
          const originParsed = new URL(sanitizedNative).origin;
          if (sanitizedUrl) {
            const urlOrigin = new URL(sanitizedUrl).origin;
            if (!rawNativeOrigin || originParsed === urlOrigin) {
              trustedOrigin = originParsed;
              trustedUrl = sanitizedUrl;
            }
          } else {
            trustedOrigin = originParsed;
            trustedUrl = sanitizedNative;
          }
        } catch (_) {}
      }
    } else if (_dappSession.nativeOpen && _dappSession.currentOrigin) {
      trustedOrigin = _dappSession.currentOrigin;
      trustedUrl = _dappSession.currentUrl || _dappSession.currentOrigin;
    }

    if (!trustedOrigin) {
      if (plugin && typeof plugin.sendResponse === 'function') {
        await plugin.sendResponse({
          id: String(msg.id),
          errorJson: JSON.stringify(browserMod.serializeRpcError({ code: 4100, message: 'Untrusted DApp origin' }))
        }).catch(() => {});
      }
      return;
    }

    const sanitizedReq = {
      ...msg,
      origin: trustedOrigin,
      url: trustedUrl
    };

    const walletId = wallet && wallet.id ? String(wallet.id) : '';
    try {
      const ethersLib = await ensureEthersLoaded().catch(() => null);
      const result = await browserMod.handleDAppRpcRequest(sanitizedReq, {
        wallet,
        contracts,
        crypto,
        ethers: ethersLib,
        origin: trustedOrigin,
        nativeOrigin: trustedOrigin,
        url: trustedUrl,
        nativeUrl: trustedUrl,
        title: msg.title || '',
        activeEvmChainKey: _dappSession.activeEvmChainKey,
        autoConnectOrigin: false,
        isOriginConnected: (origin, ns) => isDAppOriginConnected(origin, ns, walletId),
        isOriginDisconnected: (origin, ns) => isDAppOriginDisconnected(origin, ns, walletId),
        markOriginConnected: (origin, ns) => markDAppOriginConnected(origin, ns, walletId),
        markOriginDisconnected: (origin, ns) => markDAppOriginDisconnected(origin, ns, walletId),
        setEvmChain: (key) => { _dappSession.activeEvmChainKey = key || 'eth'; },
        onSessionChainChanged: (chainHex) => {
          if (plugin && typeof plugin.emitProviderEvent === 'function') {
            plugin.emitProviderEvent({ namespace: 'evm', eventName: 'chainChanged', payload: chainHex }).catch(() => {});
          }
        },
        requestApprovalAsync: requestDAppApprovalAsync,
        verifyAuthAsync: verifyDAppSecurityAuthAsync,
        hydrateNearNamedAccountAsync: (w) => hydrateNearNamedAccountForDAppAsync(w, contracts, st, 3500)
      });

      if (plugin && typeof plugin.sendResponse === 'function') {
        await plugin.sendResponse({
          id: String(msg.id),
          resultJson: JSON.stringify(result === undefined ? null : result)
        }).catch(() => {});
      }
    } catch (err) {
      if (plugin && typeof plugin.sendResponse === 'function') {
        await plugin.sendResponse({
          id: String(msg.id),
          errorJson: JSON.stringify(browserMod.serializeRpcError(err))
        }).catch(() => {});
      }
    } finally {
      if (_dappSession.nativeOpen && !$('sheet-dapp-approve')?.classList?.contains('open')) {
        await setNativeBrowserOverlayVisible(true);
      }
    }
  }

  function ensureDAppBridgeListeners() {
    if (_dappSession.listenersBound) return;
    const plugin = getNativeDAppPlugin();
    if (!plugin || typeof plugin.addListener !== 'function') return;
    _dappSession.listenersBound = true;

    plugin.addListener('bridgeMessage', (ev) => {
      handleIncomingNativeBridgePayload(ev).catch(() => {});
    });
    plugin.addListener('pageChanged', (ev) => {
      if (ev && ev.url) {
        const browserMod = getDAppBrowser();
        const safe = browserMod ? browserMod.sanitizeDAppUrl(ev.url) : null;
        if (safe) {
          _dappSession.currentUrl = safe;
          try {
            _dappSession.currentOrigin = new URL(safe).origin;
          } catch (_) {
            _dappSession.currentOrigin = '';
          }
        } else {
          _dappSession.currentUrl = '';
          _dappSession.currentOrigin = '';
        }
        if ($('dapp-url-input')) {
          $('dapp-url-input').value = ev.url;
        }
      }
    });
    plugin.addListener('browserClosed', () => {
      _dappSession.nativeOpen = false;
      _dappSession.currentUrl = '';
      _dappSession.currentOrigin = '';
      if (_dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
        _dappSession.pendingApproval.resolve(false);
      }
    });
    const onNativeWcUri = (ev) => {
      const rawUri = typeof ev === 'string' ? ev : ((ev && (ev.uri || ev.url)) || '');
      if (!rawUri) return;
      if (typeof handleIncomingWcDeepLink === 'function') {
        handleIncomingWcDeepLink(rawUri, { fromNativeDAppBrowser: true }).catch(() => {});
      }
    };
    plugin.addListener('wcUri', onNativeWcUri);
    plugin.addListener('deepLink', onNativeWcUri);
  }

  const _dappNearCheckCooldown = new Map();

  async function hydrateNearNamedAccountForDAppAsync(wallet, contracts, st, timeoutMs = 3500) {
    if (!wallet) return '';
    const existing = String(wallet.nearNamedAccount || '').trim().toLowerCase();
    if (existing) return existing;

    const filterNamed = (arr) => (Array.isArray(arr) ? arr : [])
      .map((a) => String(a || '').trim().toLowerCase())
      .filter((a) => a && !/^[0-9a-f]{64}$/.test(a) && (a.endsWith('.near') || a.endsWith('.tg') || a.includes('.')))
      .sort((a, b) => (b.endsWith('.near') ? 1 : 0) - (a.endsWith('.near') ? 1 : 0));

    const cachedList = filterNamed(wallet.discoveredNearAccounts);
    if (cachedList.length > 0) {
      wallet.nearNamedAccount = cachedList[0];
      wallet.discoveredNearAccounts = cachedList;
      if (st && typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
      return cachedList[0];
    }

    if (!wallet.nearPublicKey && wallet.mnemonic && contracts && typeof contracts.ensureWalletSigningKeysAsync === 'function') {
      await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    }
    const rawPk = String(wallet.nearPublicKey || '').trim();
    if (!rawPk) return '';
    const pk = rawPk.startsWith('ed25519:') ? rawPk : `ed25519:${rawPk}`;
    const wid = String(wallet.id || pk);
    const lastEmptyTs = _dappNearCheckCooldown.get(wid) || 0;
    if (Date.now() - lastEmptyTs < 15000) return '';

    const fetchJsonQuick = async (url) => {
      if (typeof fetch !== 'function') return null;
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (_) {} }, timeoutMs);
      try {
        const res = await fetch(url, ctrl ? { signal: ctrl.signal } : {});
        if (!res || !res.ok) return null;
        return await res.json();
      } catch (_) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      const queries = [
        fetchJsonQuick(`https://api.fastnear.com/v1/public_key/${encodeURIComponent(pk)}/all`)
          .then((d) => filterNamed(d && d.account_ids))
      ];
      if (contracts && typeof contracts.discoverNearAccountsByPublicKeyAsync === 'function') {
        queries.push(
          Promise.race([
            contracts.discoverNearAccountsByPublicKeyAsync(pk).catch(() => []),
            new Promise((resolve) => setTimeout(() => resolve([]), timeoutMs))
          ]).then((d) => filterNamed(d))
        );
      }
      const settled = await Promise.allSettled(queries);
      const merged = new Set();
      settled.forEach((r) => {
        if (r.status === 'fulfilled' && Array.isArray(r.value)) {
          r.value.forEach((a) => merged.add(a));
        }
      });
      const discovered = Array.from(merged).sort((a, b) => (b.endsWith('.near') ? 1 : 0) - (a.endsWith('.near') ? 1 : 0));
      if (discovered.length > 0) {
        wallet.nearNamedAccount = discovered[0];
        wallet.discoveredNearAccounts = discovered;
        wallet._nearAccountChecked = true;
        _dappNearCheckCooldown.delete(wid);
        if (st && typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
        return discovered[0];
      }
      _dappNearCheckCooldown.set(wid, Date.now());
    } catch (_) {}
    return '';
  }

  async function launchDAppUrl(rawUrl) {
    const browserMod = getDAppBrowser();
    const contracts = getContracts();
    const st = getState();
    const wallet = st && st.getActiveWallet ? st.getActiveWallet() : null;
    if (!browserMod) return;

    const safeUrl = browserMod.sanitizeDAppUrl(rawUrl);
    if (!safeUrl) {
      showToast(t('仅支持安全的 https:// DApp 网址', 'Only valid https:// DApp URLs are allowed'));
      return;
    }
    if (_launchingDApp) return;
    _launchingDApp = true;
    try {
      ensureDAppBridgeListeners();
      if (wallet && !wallet.nearNamedAccount) {
        await hydrateNearNamedAccountForDAppAsync(wallet, contracts, st, 3500).catch(() => {});
      }
      if (wallet && contracts && typeof contracts.ensureWalletSigningKeysAsync === 'function') {
        await Promise.race([
          contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {}),
          new Promise((resolve) => {
            const tm = setTimeout(resolve, 5000);
            if (tm && typeof tm.unref === 'function') tm.unref();
          })
        ]);
      }

      let originUrl = '';
      try {
        originUrl = new URL(safeUrl).origin;
        const isCatalogOrigin = Array.isArray(browserMod.DAPP_CATALOG) && browserMod.DAPP_CATALOG.some((d) => {
          try { return new URL(d.url).origin === originUrl; } catch (_) { return false; }
        });
        if (originUrl && isCatalogOrigin) {
          const autoNamespaces = wallet && wallet.nearNamedAccount ? ['evm', 'solana', 'near'] : ['evm', 'solana'];
          autoNamespaces.forEach((ns) => {
            if (!isDAppOriginDisconnected(originUrl, ns)) {
              markDAppOriginConnected(originUrl, ns);
            }
          });
        }
      } catch (_) {}

      const evmCfg = (contracts && contracts.EVM_CHAINS && contracts.EVM_CHAINS[_dappSession.activeEvmChainKey]) || { chainId: 1 };
      const evmAddress = wallet && contracts && contracts.resolveWalletEvmSender
        ? contracts.resolveWalletEvmSender(wallet)
        : (wallet && wallet.evmAddress) || '';
      const nearCreds = wallet && contracts && contracts.getWalletNearSignerCredentials
        ? contracts.getWalletNearSignerCredentials(wallet)
        : { accountId: (wallet && (wallet.nearNamedAccount || wallet.nearAddress)) || '', publicKeyStr: '' };

      const evmConnected = Boolean(originUrl && isDAppOriginConnected(originUrl, 'evm'));
      const solConnected = Boolean(originUrl && isDAppOriginConnected(originUrl, 'solana'));
      const nearConnected = Boolean(originUrl && isDAppOriginConnected(originUrl, 'near'));

      const injectedScript = browserMod.buildInjectedProviderScript({
        authorizedOrigin: originUrl,
        evmAddress: evmConnected ? evmAddress : '',
        chainIdHex: `0x${Number(evmCfg.chainId || 1).toString(16)}`,
        solanaPublicKey: solConnected ? ((wallet && wallet.solAddress) || '') : '',
        nearAccountId: nearConnected ? (nearCreds.accountId || '') : '',
        nearPublicKey: nearConnected ? (nearCreds.publicKeyStr || '') : '',
        walletName: 'Nexus Wallet'
      });

      const plugin = getNativeDAppPlugin();
      if (plugin && typeof plugin.openUrl === 'function') {
        closeAllSheets();
        _dappSession.nativeOpen = true;
        _dappSession.currentUrl = safeUrl;
        _dappSession.currentOrigin = originUrl;
        try {
          await plugin.openUrl({
            url: safeUrl,
            injectedScript
          });
        } catch (e) {
          _dappSession.nativeOpen = false;
          _dappSession.currentUrl = '';
          _dappSession.currentOrigin = '';
          showToast(toUserFriendlyError(e, '无法打开 DApp 浏览器', 'Failed to open DApp browser'));
        }
        return;
      }

      // Web PWA fallback when running outside native Capacitor shell
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(safeUrl, '_blank', 'noopener,noreferrer');
        showToast(t('已在新窗口打开（原生 App 内可自动注入多链钱包）', 'Opened in new tab (native App enables full wallet injection)'));
      }
    } finally {
      _launchingDApp = false;
    }
  }

  function openDAppFromInput() {
    const input = $('dapp-url-input');
    const raw = input ? input.value : '';
    launchDAppUrl(raw).catch(() => {});
  }
