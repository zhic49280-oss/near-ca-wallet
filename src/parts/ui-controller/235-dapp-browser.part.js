  // ==================== Native In-App DApp Browser ====================

  const DAPP_CONN_STORAGE_KEY = 'near_ca_dapp_connections_v1';

  function loadPersistedDAppConnections() {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        const raw = localStorage.getItem(DAPP_CONN_STORAGE_KEY);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) return new Set(arr.map((x) => String(x)));
        }
      }
    } catch (_) {}
    return new Set();
  }

  function savePersistedDAppConnections(setObj) {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(DAPP_CONN_STORAGE_KEY, JSON.stringify(Array.from(setObj || [])));
      }
    } catch (_) {}
  }

  const _dappSession = {
    chainFilter: 'ALL',
    activeEvmChainKey: 'eth',
    connectedOrigins: loadPersistedDAppConnections(),
    pendingApproval: null,
    listenersBound: false,
    nativeOpen: false
  };

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

  function isDAppOriginConnected(origin, namespace) {
    return _dappSession.connectedOrigins.has(`${namespace}:${origin}`);
  }

  function markDAppOriginConnected(origin, namespace) {
    if (!origin) return;
    _dappSession.connectedOrigins.add(`${namespace}:${origin}`);
    savePersistedDAppConnections(_dappSession.connectedOrigins);
  }

  function markDAppOriginDisconnected(origin, namespace) {
    _dappSession.connectedOrigins.delete(`${namespace}:${origin}`);
    savePersistedDAppConnections(_dappSession.connectedOrigins);
  }

  function disconnectDAppOrigin(origin) {
    const clean = String(origin || '').trim();
    if (!clean) return;
    ['evm', 'solana', 'near'].forEach((ns) => _dappSession.connectedOrigins.delete(`${ns}:${clean}`));
    savePersistedDAppConnections(_dappSession.connectedOrigins);
    renderDAppCatalog();
    showToast(t('已断开 DApp 授权', 'DApp disconnected'));
  }

  function disconnectAllDAppOrigins() {
    _dappSession.connectedOrigins.clear();
    savePersistedDAppConnections(_dappSession.connectedOrigins);
    renderDAppCatalog();
    showToast(t('已断开全部 DApp 授权', 'All DApps disconnected'));
  }

  function renderDAppConnectedSection() {
    const sec = $('dapp-connected-section');
    if (!sec) return;
    const byOrigin = new Map();
    for (const entry of _dappSession.connectedOrigins) {
      const idx = entry.indexOf(':');
      if (idx <= 0) continue;
      const ns = entry.slice(0, idx).toUpperCase();
      const origin = entry.slice(idx + 1);
      if (!byOrigin.has(origin)) byOrigin.set(origin, new Set());
      byOrigin.get(origin).add(ns === 'SOLANA' ? 'SOL' : ns);
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
      return;
    }
    if (byOrigin.size === 0) {
      sec.classList.add('hidden');
      sec.innerHTML = '';
      return;
    }
    sec.classList.remove('hidden');
    const rows = connectedList.map(({ origin, host, badges }) => {
      return `
        <div class="dapp-connected-row">
          <div style="min-width:0;flex:1;">
            <div class="mono truncate" style="font-size:12px;font-weight:700;color:#fff;">${escapeHtml(host)}</div>
            <div style="font-size:10px;color:var(--near-emerald);">${escapeHtml(badges)}</div>
          </div>
          <button type="button" class="btn-danger" style="padding:4px 8px;font-size:10.5px;" data-action="disconnect-dapp-origin" data-origin="${escapeHtml(origin)}">${escapeHtml(t('断开', 'Disconnect'))}</button>
        </div>
      `;
    }).join('');
    sec.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span style="font-size:12px;font-weight:700;color:#fff;">${escapeHtml(t('已连接应用', 'Connected DApps'))} (${byOrigin.size})</span>
        <button type="button" class="btn-ghost-sm" data-action="disconnect-all-dapp-origins" style="font-size:10.5px;">${escapeHtml(t('全部断开', 'Disconnect All'))}</button>
      </div>
      ${rows}
    `;
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
    const filters = [
      { key: 'ALL', label: t('全部', 'All') },
      { key: 'NEAR', label: 'NEAR' },
      { key: 'EVM', label: 'EVM' },
      { key: 'Solana', label: 'Solana' }
    ];

    if (filterEl) {
      if (fw && typeof fw.mountDAppBookmarksPanel === 'function') {
        fw.mountDAppBookmarksPanel(filterEl, {
          mode: 'filters',
          chainFilter: filter,
          isEn
        });
      } else {
        filterEl.innerHTML = filters.map((f) => `
          <button type="button" class="filter-pill ${filter === f.key ? 'active' : ''}" data-action="set-dapp-filter" data-chain="${escapeHtml(f.key)}">${escapeHtml(f.label)}</button>
        `).join('');
      }
    }

    if (listEl) {
      const catalog = Array.isArray(browserMod.DAPP_CATALOG) ? browserMod.DAPP_CATALOG : [];
      if (fw && typeof fw.mountDAppBookmarksPanel === 'function') {
        fw.mountDAppBookmarksPanel(listEl, {
          mode: 'catalog',
          catalog,
          chainFilter: filter,
          isEn
        });
      } else {
        const rows = catalog.filter((d) => filter === 'ALL' || d.chain === filter);
        listEl.innerHTML = rows.map((d) => {
          const desc = t(d.descZh || '', d.descEn || '');
          let host = d.url;
          try { host = new URL(d.url).hostname; } catch (_) {}
          return `
            <button type="button" class="dapp-catalog-card" data-action="launch-dapp" data-url="${escapeHtml(d.url)}">
              <div style="min-width:0;flex:1;">
                <div class="flex items-center gap-2">
                  <span style="font-size:13.5px;font-weight:700;color:#fff;">${escapeHtml(d.name)}</span>
                  <span class="dapp-badge-pill">${escapeHtml(d.badge || d.chain)}</span>
                </div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:3px;">${escapeHtml(desc)}</div>
                <div class="mono" style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${escapeHtml(host)}</div>
              </div>
              <span style="color:var(--text-muted);font-size:16px;">›</span>
            </button>
          `;
        }).join('');
      }
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
      }

      if (_dappSession.nativeOpen) {
        await setNativeBrowserOverlayVisible(false);
      }

      _dappSession.pendingApproval = {
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
      openSheet('sheet-dapp-approve');
    });
  }

  function confirmDAppApproval() {
    if (_dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
      _dappSession.pendingApproval.resolve(true);
    }
  }

  function rejectDAppApproval() {
    if (_dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
      _dappSession.pendingApproval.resolve(false);
    } else {
      closeAllSheets();
    }
  }

  async function verifyDAppSecurityAuthAsync(wallet, reasonText) {
    if (_dappSession.nativeOpen) {
      await setNativeBrowserOverlayVisible(false);
    }
    try {
      return await verifySecurityAuthAsync(wallet, reasonText);
    } finally {
      if (_dappSession.nativeOpen) {
        await setNativeBrowserOverlayVisible(true);
      }
    }
  }

  async function handleIncomingNativeBridgePayload(rawEvent) {
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

    try {
      const ethersLib = await ensureEthersLoaded().catch(() => null);
      const originUrl = (() => {
        try { return new URL(msg.origin || msg.url || '').origin; } catch (_) { return String(msg.origin || ''); }
      })();
      const isTrustedCatalogOrigin = Array.isArray(browserMod.DAPP_CATALOG) && browserMod.DAPP_CATALOG.some((d) => {
        try { return new URL(d.url).origin === originUrl; } catch (_) { return false; }
      });
      const result = await browserMod.handleDAppRpcRequest(msg, {
        wallet,
        contracts,
        crypto,
        ethers: ethersLib,
        origin: msg.origin || '',
        url: msg.url || '',
        title: msg.title || '',
        activeEvmChainKey: _dappSession.activeEvmChainKey,
        autoConnectOrigin: isTrustedCatalogOrigin,
        isOriginConnected: isDAppOriginConnected,
        markOriginConnected: markDAppOriginConnected,
        markOriginDisconnected: markDAppOriginDisconnected,
        setEvmChain: (key) => { _dappSession.activeEvmChainKey = key || 'eth'; },
        onSessionChainChanged: (chainHex) => {
          if (plugin && typeof plugin.emitProviderEvent === 'function') {
            plugin.emitProviderEvent({ namespace: 'evm', eventName: 'chainChanged', payload: chainHex }).catch(() => {});
          }
        },
        requestApprovalAsync: requestDAppApprovalAsync,
        verifyAuthAsync: verifyDAppSecurityAuthAsync
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
      if (ev && ev.url && $('dapp-url-input')) {
        $('dapp-url-input').value = ev.url;
      }
    });
    plugin.addListener('browserClosed', () => {
      _dappSession.nativeOpen = false;
      if (_dappSession.pendingApproval && typeof _dappSession.pendingApproval.resolve === 'function') {
        _dappSession.pendingApproval.resolve(false);
      }
    });
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

    try {
      const originUrl = new URL(safeUrl).origin;
      const isCatalogOrigin = Array.isArray(browserMod.DAPP_CATALOG) && browserMod.DAPP_CATALOG.some((d) => {
        try { return new URL(d.url).origin === originUrl; } catch (_) { return false; }
      });
      if (originUrl && isCatalogOrigin) {
        markDAppOriginConnected(originUrl, 'evm');
        markDAppOriginConnected(originUrl, 'solana');
        markDAppOriginConnected(originUrl, 'near');
      }
    } catch (_) {}

    ensureDAppBridgeListeners();
    if (wallet && contracts && typeof contracts.ensureWalletSigningKeysAsync === 'function') {
      await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    }

    const evmCfg = (contracts && contracts.EVM_CHAINS && contracts.EVM_CHAINS[_dappSession.activeEvmChainKey]) || { chainId: 1 };
    const evmAddress = wallet && contracts && contracts.resolveWalletEvmSender
      ? contracts.resolveWalletEvmSender(wallet)
      : (wallet && wallet.evmAddress) || '';
    const nearCreds = wallet && contracts && contracts.getWalletNearSignerCredentials
      ? contracts.getWalletNearSignerCredentials(wallet)
      : { accountId: (wallet && (wallet.nearNamedAccount || wallet.nearAddress)) || '', publicKeyStr: '' };

    const injectedScript = browserMod.buildInjectedProviderScript({
      evmAddress,
      chainIdHex: `0x${Number(evmCfg.chainId || 1).toString(16)}`,
      solanaPublicKey: (wallet && wallet.solAddress) || '',
      nearAccountId: nearCreds.accountId || '',
      nearPublicKey: nearCreds.publicKeyStr || '',
      walletName: 'Nexus Wallet'
    });

    const plugin = getNativeDAppPlugin();
    if (plugin && typeof plugin.openUrl === 'function') {
      closeAllSheets();
      _dappSession.nativeOpen = true;
      try {
        await plugin.openUrl({
          url: safeUrl,
          injectedScript
        });
      } catch (e) {
        _dappSession.nativeOpen = false;
        showToast(toUserFriendlyError(e, '无法打开 DApp 浏览器', 'Failed to open DApp browser'));
      }
      return;
    }

    // Web PWA fallback when running outside native Capacitor shell
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
      showToast(t('已在新窗口打开（原生 App 内可自动注入多链钱包）', 'Opened in new tab (native App enables full wallet injection)'));
    }
  }

  function openDAppFromInput() {
    const input = $('dapp-url-input');
    const raw = input ? input.value : '';
    launchDAppUrl(raw).catch(() => {});
  }
