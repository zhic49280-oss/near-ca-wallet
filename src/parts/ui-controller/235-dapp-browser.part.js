  // ==================== Native In-App DApp Browser ====================

  const _dappSession = {
    chainFilter: 'ALL',
    activeEvmChainKey: 'eth',
    connectedOrigins: new Set(),
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
    _dappSession.connectedOrigins.add(`${namespace}:${origin}`);
  }

  function markDAppOriginDisconnected(origin, namespace) {
    _dappSession.connectedOrigins.delete(`${namespace}:${origin}`);
  }

  function renderDAppCatalog() {
    const browserMod = getDAppBrowser();
    const filterEl = $('dapp-filter-bar');
    const listEl = $('dapp-catalog-list');
    if (!browserMod) return;

    const filter = _dappSession.chainFilter || 'ALL';
    const filters = [
      { key: 'ALL', label: t('全部', 'All') },
      { key: 'NEAR', label: 'NEAR' },
      { key: 'EVM', label: 'EVM' },
      { key: 'Solana', label: 'Solana' }
    ];

    if (filterEl) {
      filterEl.innerHTML = filters.map((f) => `
        <button type="button" class="filter-pill ${filter === f.key ? 'active' : ''}" data-action="set-dapp-filter" data-chain="${escapeHtml(f.key)}">${escapeHtml(f.label)}</button>
      `).join('');
    }

    if (listEl) {
      const catalog = Array.isArray(browserMod.DAPP_CATALOG) ? browserMod.DAPP_CATALOG : [];
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

      if ($('dapp-approve-origin')) $('dapp-approve-origin').textContent = details.origin || '--';
      if ($('dapp-approve-chain')) $('dapp-approve-chain').textContent = details.chainLabel || details.namespace || '--';
      if ($('dapp-approve-method')) $('dapp-approve-method').textContent = details.method || '--';
      if ($('dapp-approve-account')) $('dapp-approve-account').textContent = details.account || '--';
      if ($('dapp-approve-detail')) $('dapp-approve-detail').textContent = details.summary || '--';

      if (_dappSession.nativeOpen) {
        await setNativeBrowserOverlayVisible(false);
      }

      _dappSession.pendingApproval = {
        resolve: async (accepted) => {
          _dappSession.pendingApproval = null;
          closeAllSheets();
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
      const result = await browserMod.handleDAppRpcRequest(msg, {
        wallet,
        contracts,
        crypto,
        ethers: ethersLib,
        origin: msg.origin || '',
        url: msg.url || '',
        title: msg.title || '',
        activeEvmChainKey: _dappSession.activeEvmChainKey,
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
      if (_dappSession.nativeOpen && !$('sheet-dapp-approve')?.classList?.contains('open') && !$('sheet-security-auth')?.classList?.contains('open')) {
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
        showToast((e && e.message) || t('无法打开 DApp 浏览器', 'Failed to open DApp browser'));
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
