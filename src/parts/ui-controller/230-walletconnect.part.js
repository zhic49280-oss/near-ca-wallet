  // ==================== WalletConnect v2 Sheet ====================

  const DEFAULT_WC_PROJECT_ID = 'a1e691683a26f67375ef31ee654a1f49';

  function updateWcStatusPill(text, ok = false) {
    const pill = $('wc-status-pill');
    if (!pill) return;
    pill.textContent = text;
    pill.classList.toggle('active', Boolean(ok));
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
      updateWcStatusPill(t('已就绪', 'Ready'), true);
      return st.wc.client;
    }
    let sdk = (typeof window !== 'undefined' && window.PearlWalletConnect) || (typeof globalThis !== 'undefined' && globalThis.PearlWalletConnect);
    if ((!sdk || !sdk.Core || !sdk.Web3Wallet) && typeof document !== 'undefined') {
      updateWcStatusPill(t('加载组件...', 'Loading...'), false);
      await loadScriptOnce('walletconnect.umd.min.js?v=6.40');
      sdk = (typeof window !== 'undefined' && window.PearlWalletConnect) || (typeof globalThis !== 'undefined' && globalThis.PearlWalletConnect);
    }
    if (!sdk || !sdk.Core || !sdk.Web3Wallet) {
      throw new Error(t('WalletConnect SDK 未加载', 'WalletConnect SDK unavailable'));
    }
    updateWcStatusPill(t('连接中...', 'Connecting...'), false);
    const core = new sdk.Core({ projectId });
    const client = await sdk.Web3Wallet.init({
      core,
      metadata: {
        name: 'NEAR Chain Abstraction Wallet',
        description: 'NEAR Account-Centric Chain Abstraction Self-Custody Wallet',
        url: (typeof location !== 'undefined' && location.origin) || 'https://near.org',
        icons: []
      }
    });

    const _wcRequestQueue = [];
    client.on('session_proposal', (proposal) => {
      st.wc.pendingProposal = proposal;
      renderWcCards();
      openSheet('sheet-walletconnect');
    });
    client.on('session_request', (event) => {
      if (st.wc.pendingRequest) {
        _wcRequestQueue.push(event);
      } else {
        st.wc.pendingRequest = event;
      }
      renderWcCards();
      openSheet('sheet-walletconnect');
    });
    client._nexusShiftNextRequest = () => {
      st.wc.pendingRequest = _wcRequestQueue.shift() || null;
      renderWcCards();
    };
    client.on('session_delete', () => {
      renderWcSessions();
      renderHeaderAndHero();
    });

    st.wc.client = client;
    st.wc.initProjectId = projectId;
    updateWcStatusPill(t('已就绪', 'Ready'), true);
    renderWcSessions();
    renderHeaderAndHero();
    return client;
  }

  function renderWcCards() {
    const st = getState();
    const pCard = $('wc-proposal-card');
    const p = st.wc.pendingProposal;
    if (pCard) {
      if (!p) {
        pCard.classList.add('hidden');
      } else {
        const meta = (p.params && p.params.proposer && p.params.proposer.metadata) || {};
        if ($('wc-proposal-name')) $('wc-proposal-name').textContent = meta.name || 'DApp';
        if ($('wc-proposal-url')) $('wc-proposal-url').textContent = meta.url || '--';
        if ($('wc-proposal-chains')) $('wc-proposal-chains').textContent = 'eip155:1, 8453, 56, 42161';
        pCard.classList.remove('hidden');
      }
    }

    const rCard = $('wc-request-card');
    const ev = st.wc.pendingRequest;
    if (rCard) {
      if (!ev) {
        rCard.classList.add('hidden');
      } else {
        const req = (ev.params && ev.params.request) || {};
        const sess = ev.topic && st.wc.client && typeof st.wc.client.session?.get === 'function'
          ? st.wc.client.session.get(ev.topic)
          : null;
        const peerMeta = sess && sess.peer && sess.peer.metadata ? sess.peer.metadata : null;
        const dappLabel = peerMeta ? `${peerMeta.name || 'DApp'} (${ev.params.chainId || 'eip155:1'})` : (ev.params.chainId || 'eip155:1');
        if ($('wc-request-method')) $('wc-request-method').textContent = req.method || '--';
        if ($('wc-request-dapp')) $('wc-request-dapp').textContent = dappLabel;
        if ($('wc-request-payload')) {
          let preview = '';
          try {
            if (req.method === 'personal_sign' && Array.isArray(req.params) && req.params[0]) {
              const rawHex = String(req.params[0]);
              if (/^0x[0-9a-fA-F]+$/.test(rawHex)) {
                const bytes = new Uint8Array(rawHex.slice(2).match(/.{2}/g).map((h) => parseInt(h, 16)));
                preview = new TextDecoder().decode(bytes);
              } else {
                preview = rawHex;
              }
            } else if (req.method === 'eth_sendTransaction' && Array.isArray(req.params) && req.params[0]) {
              const tx = req.params[0];
              const weiBig = tx.value ? BigInt(tx.value) : 0n;
              const ethStr = (Number(weiBig) / 1e18).toFixed(6).replace(/\.?0+$/, '') || '0';
              preview = `${t('收款地址', 'To')}: ${tx.to || '--'}\n${t('金额', 'Value')}: ${ethStr} ETH\n${t('数据', 'Data')}: ${tx.data && tx.data !== '0x' ? `${String(tx.data).slice(0, 42)}...` : t('无', 'None')}`;
            } else {
              preview = JSON.stringify(req.params || {}, null, 2);
            }
          } catch (_) {
            preview = JSON.stringify(req.params || {}, null, 2);
          }
          $('wc-request-payload').textContent = preview;
        }
        rCard.classList.remove('hidden');
      }
    }
  }

  function renderWcSessions() {
    const st = getState();
    const listEl = $('wc-sessions-list');
    if (!listEl) return;
    const sessions = st.wc.client ? Object.values(st.wc.client.getActiveSessions() || {}) : [];
    if (sessions.length === 0) {
      listEl.innerHTML = `<div class="text-muted" style="text-align:center;padding:10px;font-size:12px;">${t('暂无已连接 DApp', 'No active sessions')}</div>`;
      return;
    }
    listEl.innerHTML = sessions.map((s) => {
      const meta = (s.peer && s.peer.metadata) || {};
      return `
        <div class="meta-list">
          <div class="meta-row">
            <span style="font-weight:700;color:#fff;">${escapeHtml(meta.name || 'DApp')}</span>
            <button type="button" class="btn-danger" style="padding:4px 8px;font-size:10.5px;" data-action="disconnect-wc" data-topic="${escapeHtml(s.topic)}">${t('断开', 'Disconnect')}</button>
          </div>
          <span class="text-muted" style="font-size:11px;">${escapeHtml(meta.url || s.topic)}</span>
        </div>
      `;
    }).join('');
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
    const advDrawer = $('wc-advanced-drawer');
    if (advDrawer) advDrawer.classList.add('hidden');
    renderWcCards();
    renderWcSessions();
    openSheet('sheet-walletconnect');
    try {
      await ensureWcReady();
    } catch (_) {
      updateWcStatusPill(t('初始化失败', 'Init error'), false);
    }
  }

  async function saveWalletConnectProjectId() {
    const st = getState();
    const val = ($('wc-project-id-input')?.value || '').trim();
    if (!val) {
      st.wc.projectId = DEFAULT_WC_PROJECT_ID;
      if (typeof localStorage !== 'undefined') localStorage.removeItem('near_ca_wc_project_id');
      try {
        await ensureWcReady();
        $('wc-advanced-drawer')?.classList.add('hidden');
        showToast(t('✅ 已恢复内置默认 Project ID', '✅ Restored built-in Project ID'));
      } catch (e) {
        showToast(e && e.message ? e.message : t('连接失败', 'Connection failed'));
      }
      return;
    }
    if (val.length < 16) {
      showToast(t('请输入有效的 Project ID', 'Enter a valid Project ID'));
      return;
    }
    st.wc.projectId = val;
    if (typeof localStorage !== 'undefined') localStorage.setItem('near_ca_wc_project_id', val);
    try {
      await ensureWcReady();
      $('wc-advanced-drawer')?.classList.add('hidden');
      showToast(t('✅ WalletConnect 已就绪', '✅ WalletConnect ready'));
    } catch (e) {
      showToast(e && e.message ? e.message : t('连接失败', 'Connection failed'));
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

  async function pairWalletConnectUri() {
    const st = getState();
    const uri = ($('wc-uri-input')?.value || '').trim();
    if (!uri.startsWith('wc:')) {
      showToast(t('请输入有效的 wc: 链接', 'Paste a valid wc: URI'));
      return;
    }
    if (!st.wc.projectId) {
      st.wc.projectId = DEFAULT_WC_PROJECT_ID;
    }
    try {
      const client = await ensureWcReady();
      await client.core.pairing.pair({ uri });
      showToast(t('已发起配对，等待 DApp 请求...', 'Pairing sent...'));
    } catch (e) {
      showToast(e && e.message ? e.message : t('配对失败', 'Pairing failed'));
    }
  }

  async function approveWcProposal() {
    const st = getState();
    const contracts = getContracts();
    const p = st.wc.pendingProposal;
    const client = st.wc.client;
    const wallet = st.getActiveWallet();
    if (!p || !client || !wallet) return;
    if (!(await verifySecurityAuthAsync(wallet, t('授权 WalletConnect 连接', 'Authorize WalletConnect')))) return;
    try {
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const supportedChainIds = new Set(Object.values(contracts.EVM_CHAINS || {}).map((c) => `eip155:${c.chainId}`));
      const chainsSet = new Set(['eip155:1', 'eip155:8453', 'eip155:56', 'eip155:42161'].filter((c) => supportedChainIds.size === 0 || supportedChainIds.has(c)));
      const reqNs = (p.params && p.params.requiredNamespaces) || {};
      const optNs = (p.params && p.params.optionalNamespaces) || {};
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
      await client.approveSession({
        id: p.id,
        namespaces: {
          eip155: {
            chains,
            accounts: chains.map((c) => `${c}:${evmSender}`),
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'wallet_switchEthereumChain'],
            events: ['chainChanged', 'accountsChanged']
          }
        }
      });
      st.wc.pendingProposal = null;
      renderWcCards();
      renderWcSessions();
      renderHeaderAndHero();
      showToast(t('✅ 已批准 DApp 连接', '✅ DApp approved'));
    } catch (e) {
      showToast(e && e.message ? e.message : t('批准失败', 'Approve failed'));
    }
  }

  async function rejectWcProposal() {
    const st = getState();
    const p = st.wc.pendingProposal;
    if (p && st.wc.client) {
      try { await st.wc.client.rejectSession({ id: p.id, reason: { code: 5000, message: 'User rejected' } }); } catch (_) {}
    }
    st.wc.pendingProposal = null;
    renderWcCards();
  }

  async function approveWcRequest() {
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const ev = st.wc.pendingRequest;
    const client = st.wc.client;
    const wallet = st.getActiveWallet();
    if (!ev || !client || !wallet) return;
    if (!(await verifySecurityAuthAsync(wallet, t('批准 WalletConnect DApp 请求', 'Approve WalletConnect request')))) return;
    try {
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const ethersLib = await ensureEthersLoaded();
      if (!ethersLib) throw new Error(t('EVM 签名库不可用', 'EVM signer unavailable'));
      const { topic, id, params } = ev;
      const method = params.request.method;
      const reqParams = params.request.params || [];
      let result;

      const signDigestViaMpc = async (digestHex) => {
        const digestBytes = crypto.hexToBytes(String(digestHex).replace(/^0x/i, ''));
        const mpcRes = await contracts.requestNearMpcChainSignature({
          wallet,
          payloadHash32Bytes: digestBytes,
          path: 'ethereum-1',
          domainId: 0
        });
        const sigObj = mpcRes && mpcRes.mpcSignature;
        if (!sigObj || !sigObj.big_r || !sigObj.big_r.affine_point || !sigObj.s || !sigObj.s.scalar) {
          throw new Error(t('NEAR MPC 未返回有效的 Secp256k1 签名', 'NEAR MPC did not return a valid Secp256k1 signature'));
        }
        return ethersLib.Signature.from({
          r: `0x${sigObj.big_r.affine_point.slice(2, 66)}`,
          s: `0x${sigObj.s.scalar.padStart(64, '0')}`,
          yParity: Number(sigObj.recovery_id || 0) & 1
        }).serialized;
      };

      if (method === 'personal_sign' || method === 'eth_sign') {
        const isEvmAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
        let msgRaw = method === 'personal_sign' ? reqParams[0] : reqParams[1];
        if (method === 'personal_sign' && isEvmAddr(reqParams[0]) && reqParams[1] !== undefined && !isEvmAddr(reqParams[1])) {
          msgRaw = reqParams[1];
        }
        const msgBytes = (typeof msgRaw === 'string' && msgRaw.startsWith('0x')) ? ethersLib.getBytes(msgRaw) : String(msgRaw);
        if (wallet.evmPrivateKey) {
          result = await new ethersLib.Wallet(wallet.evmPrivateKey).signMessage(msgBytes);
        } else {
          result = await signDigestViaMpc(ethersLib.hashMessage(msgBytes));
        }
      } else if (method.startsWith('eth_signTypedData')) {
        const isEvmAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
        const typedArg = (reqParams[1] !== undefined && !isEvmAddr(reqParams[1])) ? reqParams[1] : reqParams[0];
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
          result = await signDigestViaMpc(ethersLib.TypedDataEncoder.hash(rawTyped.domain || {}, cleanTypes, rawTyped.message || {}));
        }
      } else if (method === 'eth_sendTransaction') {
        const txReq = reqParams[0] || {};
        const cid = Number(String(params.chainId || 'eip155:1').split(':')[1] || 1);
        const cfg = Object.entries(contracts.EVM_CHAINS).find(([, c]) => c.chainId === cid);
        if (!cfg) throw new Error(t(`不支持的网络 chainId: ${cid}`, `Unsupported chainId: ${cid}`));
        const valWei = txReq.value ? BigInt(txReq.value) : 0n;
        const valNative = Number(valWei) / 1e18;
        if (typeof contracts.validateSufficientChainBalance === 'function') {
          contracts.validateSufficientChainBalance({
            wallet,
            chain: cfg[0],
            tokenSymbol: cfg[1].symbol || 'ETH',
            amount: valNative,
            isNative: true
          });
        }
        if (wallet.evmPrivateKey && typeof contracts.sendEvmSignedTransaction === 'function') {
          const txRes = await contracts.sendEvmSignedTransaction({
            chainKey: cfg[0],
            privateKey: wallet.evmPrivateKey,
            to: txReq.to || null,
            data: txReq.data || '0x',
            value: valWei.toString()
          });
          result = txRes.txHash;
        } else {
          const txRes = await contracts.sendEvmMpcSignedTransaction({
            wallet,
            chainKey: cfg[0],
            to: txReq.to || null,
            data: txReq.data || '0x',
            value: valWei.toString(),
            path: 'ethereum-1'
          });
          result = txRes.txHash;
        }
      } else if (method === 'wallet_switchEthereumChain') {
        result = null;
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }

      await client.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result } });
      if (typeof client._nexusShiftNextRequest === 'function') client._nexusShiftNextRequest();
      else { st.wc.pendingRequest = null; renderWcCards(); }
      showToast(t('✅ 签名已完成', '✅ Signed'));
    } catch (e) {
      if (client && ev && ev.topic) {
        await client.respondSessionRequest({
          topic: ev.topic,
          response: { id: ev.id, jsonrpc: '2.0', error: { code: 4001, message: (e && e.message) || 'Execution failed' } }
        }).catch(() => {});
      }
      st.wc.pendingRequest = null;
      renderWcCards();
      showToast(e && e.message ? e.message : t('签名失败', 'Sign failed'));
    }
  }

  async function rejectWcRequest() {
    const st = getState();
    const ev = st.wc.pendingRequest;
    if (ev && st.wc.client) {
      try {
        await st.wc.client.respondSessionRequest({
          topic: ev.topic,
          response: { id: ev.id, jsonrpc: '2.0', error: { code: 4001, message: 'User rejected' } }
        });
      } catch (_) {}
    }
    st.wc.pendingRequest = null;
    renderWcCards();
  }

  async function disconnectWcSession(topic) {
    const st = getState();
    if (!st.wc.client) return;
    try { await st.wc.client.disconnectSession({ topic, reason: { code: 6000, message: 'Disconnected' } }); } catch (_) {}
    renderWcSessions();
    renderHeaderAndHero();
    showToast(t('已断开 DApp 连接', 'Disconnected'));
  }

  // ==================== QR Code Camera & Image Scanner ====================

  let _qrScanTarget = 'wc';
  let _qrMediaStream = null;
  let _qrScanTimer = null;
  let _qrScanHandling = false;

  function stopQrScannerStream() {
    if (_qrScanTimer) {
      clearInterval(_qrScanTimer);
      _qrScanTimer = null;
    }
    if (_qrMediaStream) {
      try {
        _qrMediaStream.getTracks().forEach((track) => {
          try { track.stop(); } catch (_) {}
        });
      } catch (_) {}
      _qrMediaStream = null;
    }
    const videoEl = $('qr-scanner-video');
    if (videoEl) {
      try { videoEl.srcObject = null; } catch (_) {}
    }
  }

  function parseScannedAddressPayload(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return { type: 'empty', value: '' };
    if (/^wc:/i.test(text)) {
      return { type: 'wc', value: text };
    }
    let addr = text;
    const schemeMatch = addr.match(/^(?:ethereum|solana|bitcoin|pearl|near):(?:pay-)?([^?@]+)/i);
    if (schemeMatch && schemeMatch[1]) {
      addr = schemeMatch[1].trim();
    } else if (addr.includes('?')) {
      addr = addr.split('?')[0].trim();
    }
    return { type: 'address', value: addr };
  }

  async function handleQrScanResultAsync(rawText) {
    if (_qrScanHandling) return false;
    const parsed = parseScannedAddressPayload(rawText);
    if (!parsed.value) return false;
    _qrScanHandling = true;
    try {
      stopQrScannerStream();
      if (parsed.type === 'wc') {
        openSheet('sheet-walletconnect');
        if ($('wc-uri-input')) $('wc-uri-input').value = parsed.value;
        await pairWalletConnectUri();
        return true;
      }
      if (_qrScanTarget === 'send') {
        openSheet('sheet-send');
        if ($('send-recipient-input')) $('send-recipient-input').value = parsed.value;
        if (typeof handleSendRecipientInput === 'function') handleSendRecipientInput();
        showToast(`✅ ${t('已识别收款地址', 'Address scanned')}`);
        return true;
      }
      openSheet('sheet-walletconnect');
      showToast(t('未检测到 wc: 配对二维码，请扫描 WalletConnect 二维码', 'Not a WalletConnect wc: QR code'));
      return false;
    } finally {
      _qrScanHandling = false;
    }
  }

  async function openQrScannerSheet(target = 'wc') {
    _qrScanTarget = target === 'send' ? 'send' : 'wc';
    _qrScanHandling = false;
    stopQrScannerStream();
    openSheet('sheet-qr-scanner');
    const statusEl = $('qr-scanner-status');
    const videoEl = $('qr-scanner-video');
    if (statusEl) {
      statusEl.textContent = t('正在启动摄像头...', 'Starting camera...');
    }

    const hasMedia = typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
    if (!hasMedia || !videoEl) {
      if (statusEl) {
        statusEl.textContent = t('当前环境不支持摄像头实时扫描，请点击「从相册选图」识别二维码', 'Camera unavailable here. Use "Pick from Album" to scan a QR screenshot.');
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      if (!$('sheet-qr-scanner')?.classList?.contains('open')) {
        stream.getTracks().forEach((tr) => { try { tr.stop(); } catch (_) {} });
        return;
      }
      _qrMediaStream = stream;
      videoEl.srcObject = stream;
      await videoEl.play().catch(() => {});

      const DetectorCtor = (typeof window !== 'undefined' && window.BarcodeDetector) || (typeof globalThis !== 'undefined' && globalThis.BarcodeDetector);
      if (typeof DetectorCtor === 'function') {
        const detector = new DetectorCtor({ formats: ['qr_code'] });
        if (statusEl) {
          statusEl.textContent = t('请将二维码对准取景框内', 'Align the QR code inside the frame');
        }
        _qrScanTimer = setInterval(async () => {
          if (!_qrMediaStream || _qrScanHandling || videoEl.readyState < 2) return;
          try {
            const codes = await detector.detect(videoEl);
            const hit = Array.isArray(codes) && codes.find((c) => c && c.rawValue);
            if (hit && hit.rawValue) {
              await handleQrScanResultAsync(hit.rawValue);
            }
          } catch (_) {}
        }, 220);
      } else if (statusEl) {
        statusEl.textContent = t('当前系统内核暂不支持摄像头扫码，请返回直接粘贴地址或链接', 'QR camera decoder unsupported on this WebView; please go back and paste the address or URI');
      }
    } catch (_) {
      if (statusEl) {
        statusEl.textContent = t('无法访问摄像头（请检查相机权限），可点击「从相册选图」识别二维码', 'Camera access denied. Use "Pick from Album" to scan QR image.');
      }
    }
  }

  function closeQrScannerSheet() {
    stopQrScannerStream();
    if (_qrScanTarget === 'send') {
      openSheet('sheet-send');
    } else {
      openSheet('sheet-walletconnect');
    }
  }

  function triggerQrScannerFileInput() {
    const inp = $('qr-scanner-file-input');
    if (inp) {
      inp.value = '';
      inp.click();
    }
  }

  async function handleQrScannerFileSelect(event) {
    const file = event && event.target && event.target.files && event.target.files[0];
    if (!file) return;
    const DetectorCtor = (typeof window !== 'undefined' && window.BarcodeDetector) || (typeof globalThis !== 'undefined' && globalThis.BarcodeDetector);
    if (typeof DetectorCtor !== 'function') {
      showToast(t('当前设备不支持图片二维码解码，请直接复制 wc: 链接粘贴', 'Image QR decoding unsupported on this WebView; paste wc: URI instead'));
      return;
    }
    try {
      const detector = new DetectorCtor({ formats: ['qr_code'] });
      let source = null;
      if (typeof createImageBitmap === 'function') {
        source = await createImageBitmap(file);
      } else if (typeof Image !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const objUrl = URL.createObjectURL(file);
        source = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            try { URL.revokeObjectURL(objUrl); } catch (_) {}
            resolve(img);
          };
          img.onerror = (err) => {
            try { URL.revokeObjectURL(objUrl); } catch (_) {}
            reject(err);
          };
          img.src = objUrl;
        });
      }
      if (!source) throw new Error('Image decode unavailable');
      const codes = await detector.detect(source);
      const hit = Array.isArray(codes) && codes.find((c) => c && c.rawValue);
      if (hit && hit.rawValue) {
        await handleQrScanResultAsync(hit.rawValue);
      } else {
        showToast(t('未在图片中识别到有效二维码', 'No valid QR code found in image'));
      }
    } catch (_) {
      showToast(t('二维码图片识别失败，请重试或直接粘贴链接', 'Failed to decode QR image'));
    }
  }

