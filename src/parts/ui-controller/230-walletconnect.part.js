  // ==================== WalletConnect v2 Init, Pairing & Signing ====================

  let _wcInitPromise = null;
  let _wcInitProjectId = '';
  let _wcApprovingProposal = false;
  let _wcApprovingRequest = false;

  function formatWcError(err, fbZh, fbEn) {
    const raw = String((err && err.message) || err || '');
    if (/already exists|pairing already exists/i.test(raw)) {
      return t('该配对链接已使用或已过期，请刷新二维码重试', 'Pairing link already used or expired. Refresh the QR code and retry.');
    }
    if (/expired|ttl/i.test(raw)) {
      return t('配对链接或请求已过期，请刷新二维码重试', 'Pairing link or request expired. Refresh the QR code and retry.');
    }
    if (/timed out|timeout|websocket|relayer|transport|socket/i.test(raw)) {
      return t('连接通道超时或不稳定，请检查网络后重试', 'Connection timed out or unstable. Check your network and retry.');
    }
    return toUserFriendlyError(err, fbZh, fbEn);
  }

  async function ensureWcReady() {
    const st = getState();
    const projectId = (st.wc.projectId || DEFAULT_WC_PROJECT_ID).trim();
    st.wc.projectId = projectId;
    if (!projectId) {
      updateWcStatusPill(t('未配置 ID', 'No ID'), false);
      return null;
    }
    if (st.wc.client && st.wc.initProjectId === projectId) {
      try {
        await ensureWcRelayerConnected(st.wc.client, 6000);
        updateWcStatusPill(t('已就绪', 'Ready'), true);
        return st.wc.client;
      } catch (_) {
        const deadClient = st.wc.client;
        st.wc.client = null;
        st.wc.initProjectId = '';
        await teardownWcClient(deadClient);
      }
    }
    if (st.wc.client && st.wc.initProjectId !== projectId) {
      const prevClient = st.wc.client;
      st.wc.client = null;
      st.wc.initProjectId = '';
      st.wc.pendingProposal = null;
      st.wc.pendingRequest = null;
      await teardownWcClient(prevClient);
    }
    if (_wcInitPromise && _wcInitProjectId === projectId) {
      return _wcInitPromise;
    }
    const initTask = (async () => {
      let sdk = (typeof window !== 'undefined' && window.PearlWalletConnect) || (typeof globalThis !== 'undefined' && globalThis.PearlWalletConnect);
      if ((!sdk || !sdk.Core || !sdk.Web3Wallet) && typeof document !== 'undefined') {
        updateWcStatusPill(t('加载组件...', 'Loading...'), false);
        await loadScriptOnce('walletconnect.umd.min.js?v=6.98', WC_TIMEOUT_MS);
        sdk = (typeof window !== 'undefined' && window.PearlWalletConnect) || (typeof globalThis !== 'undefined' && globalThis.PearlWalletConnect);
      }
      if (!sdk || !sdk.Core || !sdk.Web3Wallet) {
        throw new Error(t('WalletConnect SDK 未加载', 'WalletConnect SDK unavailable'));
      }
      updateWcStatusPill(t('连接中...', 'Connecting...'), false);
      const core = new sdk.Core({ projectId });
      let client;
      try {
        client = await withTimeout(
          sdk.Web3Wallet.init({ core, metadata: resolveWcMetadata() }),
          WC_TIMEOUT_MS,
          t('连接服务初始化超时，请检查网络后重试', 'Connection service timed out. Check network and retry.')
        );
      } catch (err) {
        await teardownWcClient({ core });
        updateWcStatusPill(t('连接超时', 'Init timeout'), false);
        throw err;
      }

      const _wcRequestQueue = [];
      const onSessionProposal = (proposal) => {
        clearWcProposalWaitTimer();
        setWcPairHint('');
        st.wc.pendingProposal = proposal;
        renderWcCards();
        openSheet('sheet-walletconnect');
      };
      const onSessionRequest = (event) => {
        if (st.wc.pendingRequest) _wcRequestQueue.push(event);
        else st.wc.pendingRequest = event;
        renderWcCards();
        openSheet('sheet-walletconnect');
      };
      const drainTopicRequests = (topic) => {
        if (!topic) return;
        for (let i = _wcRequestQueue.length - 1; i >= 0; i--) {
          if (_wcRequestQueue[i] && _wcRequestQueue[i].topic === topic) _wcRequestQueue.splice(i, 1);
        }
        if (st.wc.pendingRequest && st.wc.pendingRequest.topic === topic) {
          st.wc.pendingRequest = _wcRequestQueue.shift() || null;
          renderWcCards();
        }
      };
      const onSessionDelete = (ev) => {
        if (ev && ev.topic) {
          drainTopicRequests(ev.topic);
          syncWcSessionWalletsCache();
          if (_wcSessionWallets[ev.topic]) {
            delete _wcSessionWallets[ev.topic];
            savePersistedWcSessionWallets();
          }
        }
        renderWcSessions();
        renderHeaderAndHero();
      };
      client.on('session_proposal', onSessionProposal);
      client.on('session_request', onSessionRequest);
      client._nexusShiftNextRequest = () => {
        st.wc.pendingRequest = _wcRequestQueue.shift() || null;
        renderWcCards();
      };
      client._nexusDrainTopicRequests = drainTopicRequests;
      client._nexusClearAllPendingRequests = () => {
        _wcRequestQueue.length = 0;
        st.wc.pendingRequest = null;
        st.wc.pendingProposal = null;
        renderWcCards();
      };
      client._nexusListeners = {
        proposal: onSessionProposal,
        request: onSessionRequest,
        delete: onSessionDelete
      };
      if (client.core && client.core.relayer && typeof client.core.relayer.on === 'function') {
        const onRelayerDisconnect = () => updateWcStatusPill(t('连接断开', 'Disconnected'), false);
        const onRelayerConnect = () => updateWcStatusPill(t('已就绪', 'Ready'), true);
        client.core.relayer.on('relayer_disconnect', onRelayerDisconnect);
        client.core.relayer.on('relayer_connect', onRelayerConnect);
        client._nexusListeners.relayerDisconnect = onRelayerDisconnect;
        client._nexusListeners.relayerConnect = onRelayerConnect;
      }
      client.on('session_delete', onSessionDelete);

      st.wc.client = client;
      st.wc.initProjectId = projectId;
      syncWcSessionWalletsCache();
      const liveTopics = new Set(Object.keys((typeof client.getActiveSessions === 'function' ? client.getActiveSessions() : null) || {}));
      let pruned = false;
      for (const mappedTopic of Object.keys(_wcSessionWallets)) {
        if (!liveTopics.has(mappedTopic)) {
          delete _wcSessionWallets[mappedTopic];
          pruned = true;
        }
      }
      if (pruned) savePersistedWcSessionWallets();
      updateWcStatusPill(t('已就绪', 'Ready'), true);
      renderWcSessions();
      renderHeaderAndHero();
      return client;
    })();
    _wcInitProjectId = projectId;
    _wcInitPromise = initTask.finally(() => {
      if (_wcInitPromise === initTask || _wcInitProjectId === projectId) {
        _wcInitPromise = null;
        _wcInitProjectId = '';
      }
    });
    return _wcInitPromise;
  }

  function toggleWcAdvancedSettings() {
    $('wc-advanced-drawer')?.classList.toggle('hidden');
  }

  async function openWalletConnectSheet() {
    const st = getState();
    const activePid = (st.wc.projectId || DEFAULT_WC_PROJECT_ID).trim();
    st.wc.projectId = activePid;
    if ($('wc-project-id-input')) $('wc-project-id-input').value = activePid === DEFAULT_WC_PROJECT_ID ? '' : activePid;
    if ($('wc-uri-input')) $('wc-uri-input').value = '';
    setWcPairHint('');
    const advDrawer = $('wc-advanced-drawer');
    if (advDrawer) advDrawer.classList.add('hidden');
    renderWcCards();
    renderWcSessions();
    openSheet('sheet-walletconnect');
    try {
      await ensureWcReady();
    } catch (e) {
      updateWcStatusPill(t('初始化失败', 'Init error'), false);
      setWcPairHint(formatWcError(e, '连接初始化失败，请重试', 'Init failed. Please retry.'), 'error');
    }
  }

  async function saveWalletConnectProjectId() {
    const st = getState();
    const val = ($('wc-project-id-input')?.value || '').trim();
    const saveBtn = typeof document !== 'undefined' ? document.querySelector('#wc-advanced-drawer .btn-secondary') : null;
    const prevTxt = saveBtn ? saveBtn.textContent : '';
    if (val && val.length < 16) {
      showToast(t('请输入有效的 Project ID', 'Enter a valid Project ID'));
      return;
    }
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = t('连接中...', 'Saving...');
    }
    try {
      if (!val) {
        st.wc.projectId = DEFAULT_WC_PROJECT_ID;
        if (typeof localStorage !== 'undefined') localStorage.removeItem('near_ca_wc_project_id');
        await withTimeout(ensureWcReady(), 15000, t('连接超时，请重试', 'Connection timed out. Please retry.'));
        $('wc-advanced-drawer')?.classList.add('hidden');
        showToast(t('✅ 已恢复内置默认 Project ID', '✅ Restored built-in Project ID'));
      } else {
        st.wc.projectId = val;
        if (typeof localStorage !== 'undefined') localStorage.setItem('near_ca_wc_project_id', val);
        await withTimeout(ensureWcReady(), 15000, t('连接超时，请重试', 'Connection timed out. Please retry.'));
        $('wc-advanced-drawer')?.classList.add('hidden');
        showToast(t('✅ WalletConnect 已就绪', '✅ WalletConnect ready'));
      }
    } catch (e) {
      showToast(formatWcError(e, '连接失败', 'Connection failed'));
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        if (prevTxt) saveBtn.textContent = prevTxt;
      }
    }
  }

  async function pasteToWcUri() {
    try {
      const text = await navigator.clipboard.readText();
      if ($('wc-uri-input') && text) $('wc-uri-input').value = text.trim();
    } catch (_) {
      showToast(t('请手动粘贴', 'Please paste manually'));
    }
  }

  async function pairWalletConnectUri(overrideUri) {
    const st = getState();
    const rawInput = overrideUri !== undefined ? String(overrideUri || '') : ($('wc-uri-input')?.value || '');
    const uri = extractWcPairingUri(rawInput);
    if (!uri) {
      const msg = t('请输入有效的 wc: 链接', 'Paste a valid wc: URI');
      setWcPairHint(msg, 'error');
      showToast(msg);
      return false;
    }
    if (isLegacyWcV1Uri(uri)) {
      const msg = t('不支持旧版配对链接，请刷新 DApp 页面重新生成二维码', 'Unsupported legacy pairing link. Refresh the DApp and generate a new QR code.');
      setWcPairHint(msg, 'error');
      showToast(msg);
      return false;
    }
    if ($('wc-uri-input')) $('wc-uri-input').value = uri;
    if (!st.wc.projectId) st.wc.projectId = DEFAULT_WC_PROJECT_ID;
    clearWcProposalWaitTimer();
    const btn = $('btn-wc-pair');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('连接中...', 'Pairing...');
    }
    setWcPairHint(t('正在连接配对通道...', 'Connecting pairing channel...'), 'pending');
    try {
      const client = await withTimeout(ensureWcReady(), 15000, t('连接服务初始化超时，请重试', 'Connection service timed out. Please retry.'));
      if (!client) throw new Error(t('WalletConnect 服务未就绪', 'WalletConnect service unavailable'));
      await withTimeout(
        client.core.pairing.pair({ uri }),
        WC_TIMEOUT_MS,
        t('配对请求超时，请检查网络或刷新二维码重试', 'Pairing request timed out. Check network or refresh QR code.')
      );
      if (!st.wc.pendingProposal) {
        startWcProposalWaitTimer();
        setWcPairHint(t('已发起配对，正在等待 DApp 授权请求...', 'Pairing sent, waiting for DApp approval request...'), 'pending');
      }
      showToast(t('已发起配对，等待 DApp 请求...', 'Pairing sent...'));
      return true;
    } catch (e) {
      clearWcProposalWaitTimer();
      const msg = formatWcError(e, '配对失败，请刷新二维码重试', 'Pairing failed. Refresh QR code and retry.');
      setWcPairHint(msg, 'error');
      showToast(msg);
      return false;
    } finally {
      if (btn) {
        btn.disabled = false;
        if (prevTxt) btn.textContent = prevTxt;
      }
    }
  }

  async function handleIncomingWcDeepLink(rawUri, opts = {}) {
    const uri = extractWcPairingUri(rawUri);
    if (!uri) return false;
    const st = getState();
    if (opts && opts.fromNativeDAppBrowser) {
      if (st && st.wc) st.wc._returnToDAppOnProposalDone = true;
      if (typeof setNativeBrowserOverlayVisible === 'function') {
        await setNativeBrowserOverlayVisible(false).catch(() => {});
      }
    }
    renderWcCards();
    renderWcSessions();
    openSheet('sheet-walletconnect');
    if ($('wc-uri-input')) $('wc-uri-input').value = uri;
    return pairWalletConnectUri(uri);
  }

  function returnToDAppOverlayIfPending() {
    const st = getState();
    if (!st || !st.wc || !st.wc._returnToDAppOnProposalDone) return;
    st.wc._returnToDAppOnProposalDone = false;
    if (typeof _dappSession !== 'undefined' && _dappSession && _dappSession.nativeOpen && !st.wc.pendingRequest) {
      if (typeof closeAllSheets === 'function') closeAllSheets();
      if (typeof setNativeBrowserOverlayVisible === 'function') {
        setNativeBrowserOverlayVisible(true).catch(() => {});
      }
    }
  }

  async function approveWcProposal() {
    if (_wcApprovingProposal) return;
    const st = getState();
    const contracts = getContracts();
    const p = st.wc.pendingProposal;
    const client = st.wc.client;
    const wallet = st.getActiveWallet();
    if (!p || !client || !wallet) return;
    clearWcProposalWaitTimer();
    setWcPairHint('');
    _wcApprovingProposal = true;
    const fwLoading = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fwLoading && typeof fwLoading.mountWcProposalPanel === 'function') {
      renderWcCards();
    }
    const approveBtn = (!fwLoading || typeof fwLoading.mountWcProposalPanel !== 'function') && typeof document !== 'undefined'
      ? document.querySelector('#wc-proposal-card .btn-primary')
      : null;
    const prevBtnTxt = approveBtn ? approveBtn.textContent : '';
    if (approveBtn) {
      approveBtn.disabled = true;
      approveBtn.textContent = t('授权中...', 'Approving...');
    }
    try {
      if (!(await verifySecurityAuthAsync(wallet, t('授权 WalletConnect 连接', 'Authorize WalletConnect')))) return;
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const reqNs = (p.params && p.params.requiredNamespaces) || {};
      const optNs = (p.params && p.params.optionalNamespaces) || {};
      const namespaces = {};

      const wantsEvm = Boolean(reqNs.eip155 || optNs.eip155 || (!reqNs.solana && !reqNs.near && !optNs.solana && !optNs.near));
      if (wantsEvm) {
        const supportedChainIds = new Set(Object.values(contracts.EVM_CHAINS || {}).map((c) => `eip155:${c.chainId}`));
        const chainsSet = new Set(['eip155:1', 'eip155:8453', 'eip155:56', 'eip155:42161'].filter((c) => supportedChainIds.size === 0 || supportedChainIds.has(c)));
        [reqNs, optNs].forEach((ns) => {
          if (ns.eip155 && Array.isArray(ns.eip155.chains)) {
            ns.eip155.chains.forEach((c) => {
              if (supportedChainIds.size === 0 || supportedChainIds.has(c)) chainsSet.add(c);
            });
          }
        });
        const chains = Array.from(chainsSet);
        const evmSender = (typeof contracts.resolveWalletEvmSender === 'function' ? contracts.resolveWalletEvmSender(wallet) : '')
          || wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmSender) throw new Error(t('EVM 钱包地址不可用', 'EVM address unavailable'));
        namespaces.eip155 = {
          chains,
          accounts: chains.map((c) => `${c}:${evmSender}`),
          methods: ['eth_sendTransaction', 'personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'],
          events: ['chainChanged', 'accountsChanged']
        };
      }

      if ((reqNs.solana || optNs.solana) && wallet.solAddress) {
        const solSet = new Set();
        [reqNs, optNs].forEach((ns) => {
          if (ns.solana && Array.isArray(ns.solana.chains)) ns.solana.chains.forEach((c) => solSet.add(c));
        });
        const solChains = solSet.size > 0 ? Array.from(solSet) : ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'];
        namespaces.solana = {
          chains: solChains,
          accounts: solChains.map((c) => `${c}:${wallet.solAddress}`),
          methods: ['solana_signTransaction', 'solana_signAllTransactions', 'solana_signAndSendTransaction', 'solana_signMessage'],
          events: []
        };
      }

      const nearCreds = typeof contracts.getWalletNearSignerCredentials === 'function'
        ? contracts.getWalletNearSignerCredentials(wallet)
        : { accountId: wallet.nearNamedAccount || wallet.nearAddress || '' };
      const nearAcct = String(nearCreds.accountId || wallet.nearNamedAccount || wallet.nearAddress || '').trim();
      if ((reqNs.near || optNs.near) && nearAcct) {
        const nearSet = new Set();
        [reqNs, optNs].forEach((ns) => {
          if (ns.near && Array.isArray(ns.near.chains)) ns.near.chains.forEach((c) => nearSet.add(c));
        });
        const nearChains = nearSet.size > 0 ? Array.from(nearSet) : ['near:mainnet'];
        namespaces.near = {
          chains: nearChains,
          accounts: nearChains.map((c) => `${c}:${nearAcct}`),
          methods: ['near_signAndSendTransaction', 'near_signAndSendTransactions', 'near_signMessage'],
          events: []
        };
      }

      const approvedSess = await withTimeout(
        client.approveSession({ id: p.id, namespaces }),
        WC_TIMEOUT_MS,
        t('批准连接超时，请重试', 'Session approval timed out. Please retry.')
      );
      if (approvedSess && approvedSess.topic) {
        syncWcSessionWalletsCache();
        _wcSessionWallets[approvedSess.topic] = wallet.id;
        savePersistedWcSessionWallets();
      }
      st.wc.pendingProposal = null;
      renderWcCards();
      renderWcSessions();
      renderHeaderAndHero();
      showToast(t('✅ 已批准 DApp 连接', '✅ DApp approved'));
      returnToDAppOverlayIfPending();
    } catch (e) {
      showToast(formatWcError(e, '批准失败', 'Approve failed'));
    } finally {
      _wcApprovingProposal = false;
      if (fwLoading && typeof fwLoading.mountWcProposalPanel === 'function' && st.wc.pendingProposal) {
        renderWcCards();
      }
      if (approveBtn) {
        approveBtn.disabled = false;
        if (prevBtnTxt) approveBtn.textContent = prevBtnTxt;
      }
    }
  }

  async function rejectWcProposal() {
    if (_wcApprovingProposal) return;
    clearWcProposalWaitTimer();
    setWcPairHint('');
    const st = getState();
    const p = st.wc.pendingProposal;
    if (p && st.wc.client) {
      try { await st.wc.client.rejectSession({ id: p.id, reason: { code: 5000, message: 'User rejected' } }); } catch (_) {}
    }
    st.wc.pendingProposal = null;
    renderWcCards();
    returnToDAppOverlayIfPending();
  }

  function parseHexBigInt(val) {
    const s = String(val ?? '').trim();
    if (!s || s === '0x' || s === '0X') return 0n;
    try {
      return BigInt(s);
    } catch (_) {
      return 0n;
    }
  }

  async function approveWcRequest() {
    if (_wcApprovingRequest) return;
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const ev = st.wc.pendingRequest;
    const client = st.wc.client;
    const wallet = st.getActiveWallet();
    if (!ev || !client || !wallet) return;

    syncWcSessionWalletsCache();
    const reqTopic = ev.topic;
    const sess = reqTopic && client.session && typeof client.session.get === 'function'
      ? client.session.get(reqTopic)
      : null;
    const chainNs = String((ev.params && ev.params.chainId) || 'eip155:1').split(':')[0].toLowerCase();
    const activeEvm = getWcWalletEvmLower(wallet);
    const activeSol = String(wallet.solAddress || '').trim();
    const nearCreds = contracts.getWalletNearSignerCredentials ? contracts.getWalletNearSignerCredentials(wallet) : {};
    const activeNear = String(nearCreds.accountId || wallet.nearNamedAccount || wallet.nearAddress || '').trim().toLowerCase();
    const evmAccounts = getWcSessionNsAddrs(sess, 'eip155', true);
    const solAccounts = getWcSessionNsAddrs(sess, 'solana', false);
    const nearAccounts = getWcSessionNsAddrs(sess, 'near', true);
    const boundWalletId = _wcSessionWallets[reqTopic];
    const nsMismatch = (chainNs === 'eip155' && evmAccounts.length > 0 && activeEvm && !evmAccounts.includes(activeEvm))
      || (chainNs === 'solana' && solAccounts.length > 0 && activeSol && !solAccounts.includes(activeSol))
      || (chainNs === 'near' && nearAccounts.length > 0 && activeNear && !nearAccounts.includes(activeNear));
    if ((boundWalletId && boundWalletId !== wallet.id) || nsMismatch) {
      showToast(t('当前钱包与该 DApp 会话绑定的账户不一致，请切换回原钱包或断开重连', 'Active wallet does not match this DApp session account. Switch back or reconnect.'));
      await withTimeout(client.respondSessionRequest({
        topic: ev.topic,
        response: { id: ev.id, jsonrpc: '2.0', error: { code: 4100, message: 'Active wallet account mismatch' } }
      }), WC_TIMEOUT_MS, 'Timeout').catch(() => {});
      if (typeof client._nexusShiftNextRequest === 'function') client._nexusShiftNextRequest();
      else { st.wc.pendingRequest = null; renderWcCards(); }
      return;
    }

    _wcApprovingRequest = true;
    const approveBtn = typeof document !== 'undefined' ? ($('btn-wc-request-approve') || document.querySelector('#wc-request-card .btn-primary')) : null;
    const rejectBtn = typeof document !== 'undefined' ? ($('btn-wc-request-reject') || document.querySelector('#wc-request-card .btn-secondary')) : null;
    const prevBtnText = approveBtn ? approveBtn.textContent : '';
    if (approveBtn) {
      approveBtn.disabled = true;
      approveBtn.textContent = t('处理中...', 'Signing...');
    }
    if (rejectBtn) {
      rejectBtn.disabled = true;
    }
    try {
      if (!(await verifySecurityAuthAsync(wallet, t('批准 WalletConnect DApp 请求', 'Approve WalletConnect request')))) {
        showToast(t('安全验证未通过，可重试批准或点击拒绝', 'Security verification cancelled. Retry approval or reject.'));
        return;
      }
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const { topic, id, params } = ev;
      const method = params.request.method;
      const reqParams = params.request.params || [];
      let result;

      const signDigestViaMpc = async (ethersLib, digestHex) => {
        const digestBytes = crypto.hexToBytes(String(digestHex).replace(/^0x/i, ''));
        const mpcRes = await contracts.requestNearMpcChainSignature({
          wallet,
          payloadHash32Bytes: digestBytes,
          path: 'ethereum-1',
          domainId: 0
        });
        const sigObj = mpcRes && mpcRes.mpcSignature;
        if (!sigObj || !sigObj.big_r || !sigObj.big_r.affine_point || !sigObj.s || !sigObj.s.scalar) {
          throw new Error(t('签名服务未返回有效签名', 'Signing service did not return a valid signature'));
        }
        const rHex = `0x${sigObj.big_r.affine_point.slice(2, 66)}`;
        const sHex = `0x${sigObj.s.scalar.padStart(64, '0')}`;
        const baseParity = Number(sigObj.recovery_id || 0) & 1;
        const expectedAddr = (wallet.mpcEvmAddress || wallet.evmAddress || '').toLowerCase();
        for (const yParity of [baseParity, baseParity ^ 1]) {
          const sig = ethersLib.Signature.from({ r: rHex, s: sHex, yParity });
          if (!expectedAddr || typeof ethersLib.recoverAddress !== 'function') return sig.serialized;
          const rec = ethersLib.recoverAddress(`0x${String(digestHex).replace(/^0x/i, '')}`, sig);
          if (rec && rec.toLowerCase() === expectedAddr) return sig.serialized;
        }
        return ethersLib.Signature.from({ r: rHex, s: sHex, yParity: baseParity }).serialized;
      };

      if (method === 'personal_sign' || method === 'eth_sign') {
        const ethersLib = await ensureEthersLoaded();
        if (!ethersLib) throw new Error(t('EVM 签名库不可用', 'EVM signer unavailable'));
        let msgRaw = method === 'personal_sign' ? reqParams[0] : reqParams[1];
        if (method === 'personal_sign' && isEvmAddrHex(reqParams[0]) && reqParams[1] !== undefined && !isEvmAddrHex(reqParams[1])) {
          msgRaw = reqParams[1];
        } else if (method === 'eth_sign' && isEvmAddrHex(reqParams[1]) && reqParams[0] !== undefined && !isEvmAddrHex(reqParams[0])) {
          msgRaw = reqParams[0];
        }
        if (method === 'eth_sign') {
          const confirmedBlind = await showConfirmDialogAsync(
            t(
              `此请求要求对原始十六进制摘要进行盲签（eth_sign），可能导致资产被盗：\n${String(msgRaw || '')}\n\n仅在完全信任该应用时继续。`,
              `This request asks for raw blind signing (eth_sign), which can drain your assets:\n${String(msgRaw || '')}\n\nContinue only if you fully trust this DApp.`
            ),
            {
              danger: true,
              title: t('⚠️ 高危盲签确认', '⚠️ High-Risk Blind Sign'),
              confirmText: t('确认盲签', 'Confirm Blind Sign'),
              cancelText: t('拒绝', 'Reject')
            }
          );
          if (!confirmedBlind) {
            throw new Error(t('用户已取消盲签请求', 'User rejected blind signing request'));
          }
        }
        const msgBytes = (typeof msgRaw === 'string' && msgRaw.startsWith('0x')) ? ethersLib.getBytes(msgRaw) : String(msgRaw);
        result = wallet.evmPrivateKey
          ? await new ethersLib.Wallet(wallet.evmPrivateKey).signMessage(msgBytes)
          : await signDigestViaMpc(ethersLib, ethersLib.hashMessage(msgBytes));
      } else if (method.startsWith('eth_signTypedData')) {
        const ethersLib = await ensureEthersLoaded();
        if (!ethersLib) throw new Error(t('EVM 签名库不可用', 'EVM signer unavailable'));
        const typedArg = (reqParams[1] !== undefined && !isEvmAddrHex(reqParams[1])) ? reqParams[1] : reqParams[0];
        const rawTyped = typeof typedArg === 'string' ? JSON.parse(typedArg) : (typedArg || {});
        const cleanTypes = { ...(rawTyped.types || {}) };
        delete cleanTypes.EIP712Domain;
        if (typeof contracts.signEvmTypedDataUnified === 'function') {
          const signed = await contracts.signEvmTypedDataUnified({
            wallet,
            domain: rawTyped.domain || {},
            types: cleanTypes,
            value: rawTyped.message || {},
            path: 'ethereum-1'
          });
          result = signed.signature;
        } else if (wallet.evmPrivateKey) {
          result = await new ethersLib.Wallet(wallet.evmPrivateKey).signTypedData(rawTyped.domain || {}, cleanTypes, rawTyped.message || {});
        } else {
          result = await signDigestViaMpc(ethersLib, ethersLib.TypedDataEncoder.hash(rawTyped.domain || {}, cleanTypes, rawTyped.message || {}));
        }
      } else if (method === 'eth_sendTransaction') {
        const txReq = reqParams[0] || {};
        const cid = Number(String(params.chainId || 'eip155:1').split(':')[1] || 1);
        const cfg = Object.entries(contracts.EVM_CHAINS).find(([, c]) => c.chainId === cid);
        if (!cfg) throw new Error(t(`不支持的网络 chainId: ${cid}`, `Unsupported chainId: ${cid}`));
        const valWei = parseHexBigInt(txReq.value);
        const valNative = Number(typeof contracts.fromBaseUnits === 'function' ? contracts.fromBaseUnits(valWei.toString(), 18) : '0');
        const gasRaw = txReq.gasLimit || txReq.gas;
        const gasBig = gasRaw ? parseHexBigInt(gasRaw) : 0n;
        const reqGasLimit = gasBig > 0n ? gasBig.toString() : null;
        if (typeof contracts.validateSufficientChainBalance === 'function') {
          contracts.validateSufficientChainBalance({
            wallet,
            chain: cfg[0],
            tokenSymbol: cfg[1].symbol || 'ETH',
            amount: valNative,
            isNative: true,
            allowZeroAmount: true
          });
        }
        const txRes = (wallet.evmPrivateKey && typeof contracts.sendEvmSignedTransaction === 'function')
          ? await contracts.sendEvmSignedTransaction({ chainKey: cfg[0], privateKey: wallet.evmPrivateKey, to: txReq.to || null, data: txReq.data || '0x', value: valWei.toString(), gasLimit: reqGasLimit })
          : await contracts.sendEvmMpcSignedTransaction({ wallet, chainKey: cfg[0], to: txReq.to || null, data: txReq.data || '0x', value: valWei.toString(), gasLimit: reqGasLimit, path: 'ethereum-1' });
        result = txRes.txHash;
        if (result && typeof recordWalletActivity === 'function') {
          const sym = (cfg[1] && cfg[1].symbol) || 'ETH';
          recordWalletActivity(wallet, { type: 'send', symbol: sym, chain: cfg[0], amount: valNative, to: txReq.to || '', txHash: result, title: `WalletConnect · ${sym}` });
        }
      } else if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
        const targetHex = (reqParams[0] && reqParams[0].chainId) || '';
        const targetCid = Number(targetHex);
        const supported = Object.values(contracts.EVM_CHAINS || {}).some((c) => c && c.chainId === targetCid);
        if (!Number.isFinite(targetCid) || !supported) {
          const err = new Error(t(`不支持切换到网络 chainId: ${targetHex}`, `Unsupported target chainId: ${targetHex}`));
          err.code = 4902;
          throw err;
        }
        result = null;
      } else if (method === 'solana_signMessage') {
        const arg0 = (Array.isArray(reqParams) ? reqParams[0] : reqParams) || {};
        const msgStr = String(arg0.message || '');
        const msgBytes = (/^[1-9A-HJ-NP-Za-km-z]{8,}$/.test(msgStr) && typeof contracts.base58Decode === 'function')
          ? (() => { try { return contracts.base58Decode(msgStr); } catch (_) { return new TextEncoder().encode(msgStr); } })()
          : new TextEncoder().encode(msgStr);
        let sigBytes;
        if (wallet.solPrivateSeedHex && typeof crypto.ed25519SignAsync === 'function') {
          sigBytes = await crypto.ed25519SignAsync(msgBytes, wallet.solPrivateSeedHex);
        } else if (typeof contracts.requestNearMpcChainSignature === 'function') {
          const mpcRes = await contracts.requestNearMpcChainSignature({ wallet, payloadBytes: msgBytes, path: 'solana-1', domainId: 1 });
          const sigArr = mpcRes && mpcRes.mpcSignature && mpcRes.mpcSignature.signature;
          if (!Array.isArray(sigArr) || sigArr.length !== 64) throw new Error(t('Solana 签名失败', 'Solana signing failed'));
          sigBytes = Uint8Array.from(sigArr, (b) => Number(b) & 0xff);
        } else {
          throw new Error(t('Solana 签名引擎不可用', 'Solana signer unavailable'));
        }
        result = { signature: contracts.base58Encode(sigBytes) };
      } else if (method === 'solana_signTransaction' || method === 'solana_signAndSendTransaction') {
        const arg0 = (Array.isArray(reqParams) ? reqParams[0] : reqParams) || {};
        const b64Tx = String(arg0.transaction || arg0.transactionBase64 || '');
        if (!b64Tx) throw new Error(t('缺少 Solana 交易数据', 'Missing Solana transaction'));
        if (method === 'solana_signAndSendTransaction') {
          const sent = await contracts.signAndBroadcastSolanaBase64Tx(b64Tx, wallet.solPrivateSeedHex || null, wallet, 'solana-1');
          result = { signature: sent.txHash };
        } else {
          const signed = await contracts.signSolanaBase64Tx(b64Tx, wallet.solPrivateSeedHex || null, wallet, 'solana-1');
          const sigOff = (signed.txBytes[0] < 0x80 ? 1 : 2) + (signed.slotIndex || 0) * 64;
          result = { signature: contracts.base58Encode(signed.txBytes.slice(sigOff, sigOff + 64)), transaction: signed.signedBase64 };
        }
      } else if (method === 'solana_signAllTransactions') {
        const arg0 = (Array.isArray(reqParams) ? reqParams[0] : reqParams) || {};
        const txs = Array.isArray(arg0.transactions) ? arg0.transactions : (Array.isArray(reqParams) ? reqParams : []);
        const signedList = [];
        for (const b64Tx of txs) {
          const signed = await contracts.signSolanaBase64Tx(String(b64Tx || ''), wallet.solPrivateSeedHex || null, wallet, 'solana-1');
          signedList.push(signed.signedBase64);
        }
        result = { transactions: signedList };
      } else if (method === 'near_signMessage') {
        const arg0 = (Array.isArray(reqParams) ? reqParams[0] : reqParams) || {};
        const nCreds = contracts.getWalletNearSignerCredentials(wallet);
        const nonceRaw = arg0.nonce;
        const nonceBytes = typeof nonceRaw === 'string'
          ? crypto.base64ToBytes(nonceRaw)
          : (nonceRaw instanceof Uint8Array ? nonceRaw : (Array.isArray(nonceRaw) ? Uint8Array.from(nonceRaw) : new Uint8Array(32)));
        const sigRes = await crypto.signNep413IntentMessageAsync({
          message: String(arg0.message || ''),
          recipient: String(arg0.recipient || ''),
          nonceBytes,
          callbackUrl: arg0.callbackUrl || '',
          nearPrivateSeedHex: wallet.nearPrivateSeedHex || wallet.nearPrivateKeyHex,
          nearPublicKey: nCreds.publicKeyStr
        });
        let sigOut = sigRes.signature || '';
        if (sigOut.startsWith('ed25519:') && typeof crypto.base58Decode === 'function' && typeof crypto.bytesToBase64 === 'function') {
          try { sigOut = crypto.bytesToBase64(crypto.base58Decode(sigOut.slice(8))); } catch (_) {}
        }
        result = { ...sigRes, accountId: nCreds.accountId || '', publicKey: sigRes.publicKey || nCreds.publicKeyStr || '', signature: sigOut };
      } else if (method === 'near_signAndSendTransaction' || method === 'near_signAndSendTransactions') {
        const arg0 = (Array.isArray(reqParams) ? reqParams[0] : reqParams) || {};
        const nCreds = contracts.getWalletNearSignerCredentials(wallet);
        const txs = method === 'near_signAndSendTransaction'
          ? [arg0]
          : (Array.isArray(arg0.transactions) ? arg0.transactions : (Array.isArray(reqParams) ? reqParams : []));
        if (!txs.length) throw new Error(t('缺少 NEAR 交易数据', 'Missing NEAR transactions'));
        const outcomes = [];
        for (const txItem of txs) {
          const batchRes = await contracts.signAndSendNearActionsBatch({
            accountId: nCreds.accountId,
            publicKeyStr: nCreds.publicKeyStr,
            privateKeyStr: nCreds.privateKeyStr,
            receiverId: String((txItem && txItem.receiverId) || ''),
            actions: Array.isArray(txItem && txItem.actions) ? txItem.actions : [],
            wallet
          });
          outcomes.push((batchRes && (batchRes.outcome || batchRes.result)) || batchRes);
        }
        result = method === 'near_signAndSendTransaction' ? outcomes[0] : outcomes;
      } else {
        throw new Error(t(`不支持的方法: ${method}`, `Unsupported method: ${method}`));
      }

      await withTimeout(
        client.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result } }),
        WC_TIMEOUT_MS,
        t('响应签名结果超时，请重试', 'Response timed out. Please retry.')
      );
      if (typeof client._nexusShiftNextRequest === 'function') client._nexusShiftNextRequest();
      else { st.wc.pendingRequest = null; renderWcCards(); }
      showToast(t('✅ 签名已完成', '✅ Signed'));
    } catch (e) {
      if (client && ev && ev.topic) {
        await withTimeout(client.respondSessionRequest({
          topic: ev.topic,
          response: { id: ev.id, jsonrpc: '2.0', error: { code: Number(e && e.code) || 4001, message: (e && e.message) || 'Execution failed' } }
        }), 5000, 'Timeout').catch(() => {});
      }
      if (client && typeof client._nexusShiftNextRequest === 'function') client._nexusShiftNextRequest();
      else { st.wc.pendingRequest = null; renderWcCards(); }
      showToast(formatWcError(e, '签名失败', 'Sign failed'));
    } finally {
      _wcApprovingRequest = false;
      if (approveBtn) {
        approveBtn.disabled = false;
        if (prevBtnText) approveBtn.textContent = prevBtnText;
      }
      if (rejectBtn) {
        rejectBtn.disabled = false;
      }
      if (st.wc.pendingRequest) renderWcCards();
    }
  }

  async function rejectWcRequest() {
    if (_wcApprovingRequest) return;
    const st = getState();
    const ev = st.wc.pendingRequest;
    const client = st.wc.client;
    if (ev && client) {
      try {
        await client.respondSessionRequest({
          topic: ev.topic,
          response: { id: ev.id, jsonrpc: '2.0', error: { code: 4001, message: 'User rejected' } }
        });
      } catch (_) {}
    }
    if (client && typeof client._nexusShiftNextRequest === 'function') client._nexusShiftNextRequest();
    else { st.wc.pendingRequest = null; renderWcCards(); }
  }

  async function disconnectWcSession(topic) {
    const st = getState();
    const client = st.wc.client;
    if (!client) return;
    try { await client.disconnectSession({ topic, reason: { code: 6000, message: 'Disconnected' } }); } catch (_) {}
    syncWcSessionWalletsCache();
    if (topic && _wcSessionWallets[topic]) {
      delete _wcSessionWallets[topic];
      savePersistedWcSessionWallets();
    }
    if (typeof client._nexusDrainTopicRequests === 'function') {
      client._nexusDrainTopicRequests(topic);
    } else if (st.wc.pendingRequest && st.wc.pendingRequest.topic === topic) {
      st.wc.pendingRequest = null;
      renderWcCards();
    }
    renderWcSessions();
    renderHeaderAndHero();
    showToast(t('已断开 DApp 连接', 'Disconnected'));
  }

  async function ensureJsQrLoaded() {
    const existing = (typeof window !== 'undefined' && window.jsQR) || (typeof globalThis !== 'undefined' && globalThis.jsQR);
    if (existing) return existing;
    if (typeof document !== 'undefined' && typeof loadScriptOnce === 'function') {
      await loadScriptOnce('src/jsqr-lazy.js?v=6.98').catch(() => false);
      return (typeof window !== 'undefined' && window.jsQR) || (typeof globalThis !== 'undefined' && globalThis.jsQR) || null;
    }
    return null;
  }
