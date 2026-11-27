  // ==================== WalletConnect v2 Sheet ====================

  const DEFAULT_WC_PROJECT_ID = 'a1e691683a26f67375ef31ee654a1f49';
  let _wcInitPromise = null;
  let _wcInitProjectId = '';

  function updateWcStatusPill(text, ok = false) {
    const pill = $('wc-status-pill');
    if (!pill) return;
    pill.textContent = text;
    pill.classList.toggle('active', Boolean(ok));
  }

  async function teardownWcClient(client) {
    if (!client) return;
    try {
      const listeners = client._nexusListeners;
      if (listeners) {
        const offFn = typeof client.off === 'function'
          ? client.off.bind(client)
          : (typeof client.removeListener === 'function' ? client.removeListener.bind(client) : null);
        if (offFn) {
          if (listeners.proposal) offFn('session_proposal', listeners.proposal);
          if (listeners.request) offFn('session_request', listeners.request);
          if (listeners.delete) offFn('session_delete', listeners.delete);
        }
      }
      if (client.core && client.core.relayer && typeof client.core.relayer.transportClose === 'function') {
        await client.core.relayer.transportClose().catch(() => {});
      }
    } catch (_) {}
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
        await loadScriptOnce('walletconnect.umd.min.js?v=6.96');
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
      const onSessionProposal = (proposal) => {
        st.wc.pendingProposal = proposal;
        renderWcCards();
        openSheet('sheet-walletconnect');
      };
      const onSessionRequest = (event) => {
        if (st.wc.pendingRequest) {
          _wcRequestQueue.push(event);
        } else {
          st.wc.pendingRequest = event;
        }
        renderWcCards();
        openSheet('sheet-walletconnect');
      };
      const drainTopicRequests = (topic) => {
        if (!topic) return;
        for (let i = _wcRequestQueue.length - 1; i >= 0; i--) {
          if (_wcRequestQueue[i] && _wcRequestQueue[i].topic === topic) {
            _wcRequestQueue.splice(i, 1);
          }
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

  function formatWcMethodLabel(method) {
    const m = String(method || '').trim();
    const map = {
      eth_sendTransaction: t('发送交易', 'Send Transaction'),
      personal_sign: t('消息签名', 'Sign Message'),
      eth_sign: t('消息签名', 'Sign Message'),
      eth_signTypedData: t('结构化数据签名', 'Sign Typed Data'),
      eth_signTypedData_v3: t('结构化数据签名', 'Sign Typed Data'),
      eth_signTypedData_v4: t('结构化数据签名', 'Sign Typed Data'),
      wallet_switchEthereumChain: t('切换网络', 'Switch Network'),
      wallet_addEthereumChain: t('添加网络', 'Add Network'),
      solana_signTransaction: t('Solana 交易签名', 'Sign Solana Transaction'),
      solana_signAllTransactions: t('Solana 批量签名', 'Sign Solana Transactions'),
      solana_signAndSendTransaction: t('发送 Solana 交易', 'Send Solana Transaction'),
      solana_signMessage: t('Solana 消息签名', 'Sign Solana Message'),
      near_signAndSendTransaction: t('发送 NEAR 交易', 'Send NEAR Transaction'),
      near_signAndSendTransactions: t('批量发送 NEAR 交易', 'Send NEAR Transactions'),
      near_signMessage: t('NEAR 消息签名', 'Sign NEAR Message')
    };
    return map[m] || m || '--';
  }

  function summarizeWcStructuredPayload(method, reqParams) {
    const m = String(method || '').trim();
    const list = Array.isArray(reqParams) ? reqParams : (reqParams ? [reqParams] : []);
    if (m.startsWith('eth_signTypedData')) {
      const isEvmAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
      const typedArg = (list[1] !== undefined && !isEvmAddr(list[1])) ? list[1] : list[0];
      const rawTyped = typeof typedArg === 'string' ? JSON.parse(typedArg) : (typedArg || {});
      const domain = rawTyped.domain || {};
      const msg = rawTyped.message || {};
      const lines = [];
      if (domain.name || domain.version) {
        lines.push(`${t('应用', 'Domain')}: ${domain.name || '--'}${domain.version ? ` v${domain.version}` : ''}`);
      }
      if (rawTyped.primaryType) {
        lines.push(`${t('类型', 'Type')}: ${rawTyped.primaryType}`);
      }
      if (domain.verifyingContract) {
        lines.push(`${t('合约', 'Contract')}: ${shortenAddr(domain.verifyingContract, 10, 8)}`);
      }
      const msgEntries = Object.entries(msg).slice(0, 6);
      for (const [k, v] of msgEntries) {
        const valStr = (v && typeof v === 'object') ? JSON.stringify(v).slice(0, 80) : String(v);
        lines.push(`${k}: ${valStr.slice(0, 80)}`);
      }
      return lines.join('\n') || formatWcMethodLabel(m);
    }
    if (m === 'wallet_switchEthereumChain' || m === 'wallet_addEthereumChain') {
      const arg = list[0] || {};
      return `${t('目标网络', 'Target Chain')}: ${arg.chainName ? `${arg.chainName} (${arg.chainId || '--'})` : (arg.chainId || '--')}`;
    }
    if (m.startsWith('solana_')) {
      const arg = list[0] || {};
      if (m === 'solana_signMessage') {
        const rawMsg = arg.message || list[0] || '';
        return `${t('网络', 'Chain')}: Solana\n${t('消息', 'Message')}: ${String(rawMsg).slice(0, 300)}`;
      }
      if (m === 'solana_signAllTransactions') {
        const count = Array.isArray(arg.transactions) ? arg.transactions.length : list.length;
        return `${t('网络', 'Chain')}: Solana\n${t('交易数量', 'Transactions')}: ${count}`;
      }
      return `${t('网络', 'Chain')}: Solana\n${t('操作', 'Action')}: ${formatWcMethodLabel(m)}`;
    }
    if (m.startsWith('near_')) {
      const arg = list[0] || {};
      if (m === 'near_signMessage') {
        return `${t('接收方', 'Recipient')}: ${arg.recipient || '--'}\n${t('消息', 'Message')}: ${String(arg.message || '').slice(0, 300)}`;
      }
      if (m === 'near_signAndSendTransactions') {
        const txs = Array.isArray(arg.transactions) ? arg.transactions : list;
        return `${t('网络', 'Chain')}: NEAR\n${t('批量交易数', 'Transactions')}: ${txs.length}`;
      }
      const actions = Array.isArray(arg.actions) ? arg.actions : [];
      return `${t('接收方', 'Receiver')}: ${arg.receiverId || '--'}\n${t('操作数', 'Actions')}: ${actions.length}`;
    }
    return `${t('请求类型', 'Method')}: ${formatWcMethodLabel(m)}`;
  }

  function syncWcRiskBanner(rCard, methodEl, riskText) {
    let el = $('wc-request-risk-banner');
    if (!el && riskText && typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof rCard.insertBefore === 'function') {
      el = document.createElement('div');
      el.id = 'wc-request-risk-banner';
      el.className = 'wc-risk-banner hidden';
      el.setAttribute('role', 'alert');
      const pEl = $('wc-request-payload');
      if (pEl && pEl.parentNode === rCard) rCard.insertBefore(el, pEl);
      else if (typeof rCard.appendChild === 'function') rCard.appendChild(el);
    }
    if (el) {
      el.textContent = riskText || '';
      el.classList.toggle('hidden', !riskText);
    }
    rCard.classList.toggle('is-high-risk', Boolean(riskText));
    if (methodEl) {
      methodEl.classList.toggle('text-rose', Boolean(riskText));
      methodEl.classList.toggle('text-emerald', !riskText);
    }
  }

  function renderWcCards() {
    const st = getState();
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const pCard = $('wc-proposal-card');
    const p = st.wc.pendingProposal;
    if (pCard) {
      if (!p) {
        pCard.classList.add('hidden');
        if (fw && typeof fw.mountWcProposalPanel === 'function') {
          fw.mountWcProposalPanel(pCard, { proposal: null, approving: _wcApprovingProposal, isEn: st.lang === 'en' });
        }
      } else if (fw && typeof fw.mountWcProposalPanel === 'function') {
        fw.mountWcProposalPanel(pCard, {
          proposal: p,
          approving: _wcApprovingProposal,
          isEn: st.lang === 'en',
          onApprove: approveWcProposal,
          onReject: rejectWcProposal
        });
        pCard.classList.remove('hidden');
      }
    }

    const rCard = $('wc-request-card');
    const ev = st.wc.pendingRequest;
    if (rCard) {
      const methodEl = $('wc-request-method');
      if (!ev) {
        rCard.classList.add('hidden');
        syncWcRiskBanner(rCard, methodEl, '');
      } else {
        const req = (ev.params && ev.params.request) || {};
        const sess = ev.topic && st.wc.client && typeof st.wc.client.session?.get === 'function'
          ? st.wc.client.session.get(ev.topic)
          : null;
        const peerMeta = sess && sess.peer && sess.peer.metadata ? sess.peer.metadata : null;
        const chainIdLabel = ev.params?.chainId || 'eip155:1';
        const dappLabel = peerMeta ? `${peerMeta.name || 'DApp'} (${chainIdLabel})` : chainIdLabel;
        if (methodEl) methodEl.textContent = formatWcMethodLabel(req.method);
        if ($('wc-request-dapp')) $('wc-request-dapp').textContent = dappLabel;

        let riskBannerText = '';
        let preview = '';
        try {
          if (req.method === 'personal_sign' && Array.isArray(req.params) && req.params.length > 0) {
            const p0 = String(req.params[0] || '');
            const p1 = String(req.params[1] || '');
            const msgParam = (/^0x[0-9a-fA-F]{40}$/.test(p0) && p1) ? p1 : p0;
            if (/^0x[0-9a-fA-F]+$/.test(msgParam) && msgParam.length > 2) {
              const pairs = msgParam.slice(2).match(/.{2}/g) || [];
              preview = new TextDecoder().decode(new Uint8Array(pairs.map((h) => parseInt(h, 16))));
            } else {
              preview = msgParam;
            }
          } else if (req.method === 'eth_sign') {
            riskBannerText = t(
              '⚠️ 高危盲签 (eth_sign)：签名原始摘要可能盗取您的全部资产，仅在完全信任该应用时继续。',
              '⚠️ High-risk blind sign (eth_sign): signing raw digests can drain your assets. Continue only if you fully trust this DApp.'
            );
            const p0 = Array.isArray(req.params) ? String(req.params[0] || '') : '';
            const p1 = Array.isArray(req.params) ? String(req.params[1] || '') : '';
            const rawHex = (/^0x[0-9a-fA-F]{40}$/.test(p0) && p1) ? p1 : p0;
            preview = `${t('原始摘要', 'Raw Digest')}: ${rawHex || '--'}`;
          } else if (req.method === 'eth_sendTransaction' && Array.isArray(req.params) && req.params[0]) {
            const tx = req.params[0];
            const weiBig = parseHexBigInt(tx.value);
            const contractsMod = getContracts();
            const ethStr = (contractsMod && typeof contractsMod.fromBaseUnits === 'function')
              ? contractsMod.fromBaseUnits(weiBig.toString(), 18)
              : ((typeof window !== 'undefined' && window.ethers && typeof window.ethers.formatEther === 'function')
                ? window.ethers.formatEther(weiBig)
                : '0');
            const cidNum = Number(String(chainIdLabel).split(':')[1] || 1);
            const chainEntry = contractsMod && contractsMod.EVM_CHAINS
              ? Object.values(contractsMod.EVM_CHAINS).find((c) => c && c.chainId === cidNum)
              : null;
            const nativeSym = (chainEntry && chainEntry.symbol) || 'ETH';
            const dataHex = String(tx.data || '');
            const dataLower = dataHex.toLowerCase();
            let decodedApproval = '';
            if (dataLower.startsWith('0x095ea7b3') && dataHex.length >= 138) {
              const spender = `0x${dataHex.slice(34, 74)}`;
              const amountBig = BigInt(`0x${dataHex.slice(74, 138)}`);
              if (amountBig >= (1n << 255n)) {
                riskBannerText = t(
                  '⚠️ 高危无限代币授权：授权对象可转走您钱包中的全部该代币。',
                  '⚠️ High-risk unlimited token approval: spender can transfer all of this token from your wallet.'
                );
                decodedApproval = `\n⚠️ ${t('授权操作', 'Approval')}: ERC-20 approve\n${t('授权对象', 'Spender')}: ${spender}\n${t('授权额度', 'Allowance')}: ${t('无限授权 (Unlimited)', 'Unlimited Approval')}`;
              } else if (amountBig === 0n) {
                decodedApproval = `\n${t('撤权操作', 'Revoke Approval')}: ERC-20 approve (0)\n${t('撤权对象', 'Spender')}: ${spender}`;
              } else {
                decodedApproval = `\n${t('授权操作', 'Approval')}: ERC-20 approve\n${t('授权对象', 'Spender')}: ${spender}\n${t('授权额度', 'Allowance')}: ${amountBig.toString()}`;
              }
            } else if (dataLower.startsWith('0xa22cb465') && dataHex.length >= 138) {
              const operator = `0x${dataHex.slice(34, 74)}`;
              const approved = BigInt(`0x${dataHex.slice(74, 138)}`) !== 0n;
              if (approved) {
                riskBannerText = t(
                  '⚠️ 高危 NFT 全部资产授权：授权对象可转移该合集下的全部 NFT。',
                  '⚠️ High-risk NFT full approval: operator can transfer all NFTs in this collection.'
                );
                decodedApproval = `\n⚠️ ${t('授权操作', 'Approval')}: NFT setApprovalForAll\n${t('授权对象', 'Operator')}: ${operator}\n${t('授权状态', 'Approved')}: ${t('开启 (全部资产)', 'Enabled (All)')}`;
              } else {
                decodedApproval = `\n${t('撤权操作', 'Revoke Approval')}: NFT setApprovalForAll\n${t('撤权对象', 'Operator')}: ${operator}\n${t('授权状态', 'Approved')}: ${t('已撤销 (安全)', 'Revoked')}`;
              }
            }
            preview = `${t('收款地址', 'To')}: ${tx.to || '--'}\n${t('金额', 'Value')}: ${ethStr} ${nativeSym}${decodedApproval}\n${t('数据', 'Data')}: ${tx.data && tx.data !== '0x' ? `${String(tx.data).slice(0, 42)}...` : t('无', 'None')}`;
          } else {
            preview = summarizeWcStructuredPayload(req.method, req.params);
          }
        } catch (_) {
          preview = formatWcMethodLabel(req.method);
        }

        if ($('wc-request-payload')) $('wc-request-payload').textContent = preview;
        syncWcRiskBanner(rCard, methodEl, riskBannerText);
        if (typeof document !== 'undefined') {
          const rejectBtnEl = $('btn-wc-request-reject') || document.querySelector('#wc-request-card .btn-secondary');
          const approveBtnEl = $('btn-wc-request-approve') || document.querySelector('#wc-request-card .btn-primary');
          if (rejectBtnEl) rejectBtnEl.disabled = Boolean(_wcApprovingRequest);
          if (approveBtnEl) approveBtnEl.disabled = Boolean(_wcApprovingRequest);
        }
        rCard.classList.remove('hidden');
      }
    }
  }

  function renderWcSessions() {
    const st = getState();
    const listEl = $('wc-sessions-list');
    if (!listEl) return;
    const sessions = getActiveWalletWcSessions();
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (!fw || typeof fw.mountWcSessionsPanel !== 'function') return;
    fw.mountWcSessionsPanel(listEl, { sessions, isEn: st.lang === 'en' });
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
        showToast(toUserFriendlyError(e, '连接失败', 'Connection failed'));
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
      showToast(toUserFriendlyError(e, '连接失败', 'Connection failed'));
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
    if (!/^wc:/i.test(uri)) {
      showToast(t('请输入有效的 wc: 链接', 'Paste a valid wc: URI'));
      return;
    }
    if (!st.wc.projectId) {
      st.wc.projectId = DEFAULT_WC_PROJECT_ID;
    }
    const btn = $('btn-wc-pair');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('连接中...', 'Pairing...');
    }
    try {
      const client = await ensureWcReady();
      await client.core.pairing.pair({ uri });
      showToast(t('已发起配对，等待 DApp 请求...', 'Pairing sent...'));
    } catch (e) {
      showToast(toUserFriendlyError(e, '配对失败', 'Pairing failed'));
    } finally {
      if (btn) {
        btn.disabled = false;
        if (prevTxt) btn.textContent = prevTxt;
      }
    }
  }

  let _wcApprovingProposal = false;

  async function approveWcProposal() {
    if (_wcApprovingProposal) return;
    const st = getState();
    const contracts = getContracts();
    const p = st.wc.pendingProposal;
    const client = st.wc.client;
    const wallet = st.getActiveWallet();
    if (!p || !client || !wallet) return;
    _wcApprovingProposal = true;
    const fwLoading = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fwLoading && typeof fwLoading.mountWcProposalPanel === 'function') {
      renderWcCards();
    }
    const approveBtn = typeof document !== 'undefined' ? document.querySelector('#wc-proposal-card .btn-primary') : null;
    const prevBtnTxt = approveBtn ? approveBtn.textContent : '';
    if (approveBtn) {
      approveBtn.disabled = true;
      approveBtn.textContent = t('授权中...', 'Approving...');
    }
    try {
      if (!(await verifySecurityAuthAsync(wallet, t('授权 WalletConnect 连接', 'Authorize WalletConnect')))) return;
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
      const approvedSess = await client.approveSession({
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
    } catch (e) {
      showToast(toUserFriendlyError(e, '批准失败', 'Approve failed'));
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
    const st = getState();
    const p = st.wc.pendingProposal;
    if (p && st.wc.client) {
      try { await st.wc.client.rejectSession({ id: p.id, reason: { code: 5000, message: 'User rejected' } }); } catch (_) {}
    }
    st.wc.pendingProposal = null;
    renderWcCards();
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

  const WC_SESSION_WALLETS_STORAGE_KEY = 'near_ca_wc_session_wallets_v1';
  let _wcApprovingRequest = false;

  function loadPersistedWcSessionWallets() {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        const raw = localStorage.getItem(WC_SESSION_WALLETS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const out = {};
            for (const [topic, wid] of Object.entries(parsed)) {
              if (topic && wid) out[String(topic)] = String(wid);
            }
            return out;
          }
        }
      }
    } catch (_) {}
    return {};
  }

  const _wcSessionWallets = loadPersistedWcSessionWallets();
  let _lastWcStorageRef = typeof localStorage !== 'undefined' ? localStorage : null;
  let _lastWcStorageRaw = (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function')
    ? (localStorage.getItem(WC_SESSION_WALLETS_STORAGE_KEY) || '')
    : '';

  function syncWcSessionWalletsCache() {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return _wcSessionWallets;
    const raw = localStorage.getItem(WC_SESSION_WALLETS_STORAGE_KEY) || '';
    if (localStorage !== _lastWcStorageRef || raw !== _lastWcStorageRaw) {
      _lastWcStorageRef = localStorage;
      _lastWcStorageRaw = raw;
      for (const k of Object.keys(_wcSessionWallets)) delete _wcSessionWallets[k];
      Object.assign(_wcSessionWallets, loadPersistedWcSessionWallets());
    }
    return _wcSessionWallets;
  }

  function savePersistedWcSessionWallets() {
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        const serialized = JSON.stringify(_wcSessionWallets);
        localStorage.setItem(WC_SESSION_WALLETS_STORAGE_KEY, serialized);
        _lastWcStorageRef = localStorage;
        _lastWcStorageRaw = serialized;
      }
    } catch (_) {}
  }

  function getWcWalletEvmLower(wallet) {
    if (!wallet) return '';
    const contracts = typeof getContracts === 'function' ? getContracts() : null;
    const addr = (contracts && typeof contracts.resolveWalletEvmSender === 'function'
      ? contracts.resolveWalletEvmSender(wallet)
      : '') || wallet.mpcEvmAddress || wallet.evmAddress || '';
    return String(addr).trim().toLowerCase();
  }

  function doesWcSessionBelongToWallet(session, wallet) {
    if (!session || !wallet) return false;
    syncWcSessionWalletsCache();
    const topic = session.topic ? String(session.topic) : '';
    const mappedWalletId = topic ? _wcSessionWallets[topic] : '';
    if (mappedWalletId) {
      return mappedWalletId === String(wallet.id);
    }
    const walletEvm = getWcWalletEvmLower(wallet);
    const sessAccounts = session.namespaces && session.namespaces.eip155 && Array.isArray(session.namespaces.eip155.accounts)
      ? session.namespaces.eip155.accounts.map((a) => String(a).split(':')[2]?.toLowerCase()).filter(Boolean)
      : [];
    if (walletEvm && sessAccounts.length > 0) {
      return sessAccounts.includes(walletEvm);
    }
    return false;
  }

  function getActiveWalletWcSessions(walletOverride) {
    const st = getState();
    const wallet = walletOverride || (st && typeof st.getActiveWallet === 'function' ? st.getActiveWallet() : null);
    const client = st && st.wc ? st.wc.client : null;
    if (!client || typeof client.getActiveSessions !== 'function' || !wallet) return [];
    const allSessions = Object.values(client.getActiveSessions() || {});
    return allSessions.filter((s) => doesWcSessionBelongToWallet(s, wallet));
  }

  async function cleanupWalletConnectForDeletedWalletAsync(wallet, deletedActive = false) {
    if (!wallet || !wallet.id) return;
    const wid = String(wallet.id);
    const st = getState();
    const client = st && st.wc ? st.wc.client : null;
    syncWcSessionWalletsCache();

    const topicsToDisconnect = new Set();
    for (const [topic, ownerId] of Object.entries(_wcSessionWallets)) {
      if (String(ownerId) === wid) topicsToDisconnect.add(topic);
    }
    if (client && typeof client.getActiveSessions === 'function') {
      for (const sess of Object.values(client.getActiveSessions() || {})) {
        if (sess && sess.topic && doesWcSessionBelongToWallet(sess, wallet)) {
          topicsToDisconnect.add(sess.topic);
        }
      }
    }

    for (const topic of topicsToDisconnect) {
      delete _wcSessionWallets[topic];
    }
    savePersistedWcSessionWallets();

    if (st && st.wc) {
      if (deletedActive && st.wc.pendingProposal) {
        const pendingP = st.wc.pendingProposal;
        st.wc.pendingProposal = null;
        if (client && typeof client.rejectSession === 'function') {
          await client.rejectSession({ id: pendingP.id, reason: { code: 5000, message: 'Wallet removed' } }).catch(() => {});
        }
      }
      if (client) {
        for (const topic of topicsToDisconnect) {
          if (typeof client._nexusDrainTopicRequests === 'function') {
            client._nexusDrainTopicRequests(topic);
          } else if (st.wc.pendingRequest && st.wc.pendingRequest.topic === topic) {
            st.wc.pendingRequest = null;
          }
        }
      } else if (st.wc.pendingRequest && topicsToDisconnect.has(st.wc.pendingRequest.topic)) {
        st.wc.pendingRequest = null;
      }
    }

    if (client && typeof client.disconnectSession === 'function' && topicsToDisconnect.size > 0) {
      const disconnectTasks = Array.from(topicsToDisconnect).map((topic) =>
        client.disconnectSession({ topic, reason: { code: 6000, message: 'Wallet removed' } }).catch(() => {})
      );
      await Promise.race([
        Promise.allSettled(disconnectTasks),
        new Promise((resolve) => setTimeout(resolve, 400))
      ]);
    }

    renderWcCards();
    renderWcSessions();
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
    const activeEvm = ((typeof contracts.resolveWalletEvmSender === 'function' ? contracts.resolveWalletEvmSender(wallet) : '') || wallet.mpcEvmAddress || wallet.evmAddress || '').toLowerCase();
    const sessAccounts = sess && sess.namespaces && sess.namespaces.eip155 && Array.isArray(sess.namespaces.eip155.accounts)
      ? sess.namespaces.eip155.accounts.map((a) => String(a).split(':')[2]?.toLowerCase()).filter(Boolean)
      : [];
    const boundWalletId = _wcSessionWallets[reqTopic];
    if ((boundWalletId && boundWalletId !== wallet.id) || (sessAccounts.length > 0 && activeEvm && !sessAccounts.includes(activeEvm))) {
      showToast(t('当前钱包与该 DApp 会话绑定的账户不一致，请切换回原钱包或断开重连', 'Active wallet does not match this DApp session account. Switch back or reconnect.'));
      await client.respondSessionRequest({
        topic: ev.topic,
        response: { id: ev.id, jsonrpc: '2.0', error: { code: 4100, message: 'Active wallet account mismatch' } }
      }).catch(() => {});
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
        const isEvmAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
        let msgRaw = method === 'personal_sign' ? reqParams[0] : reqParams[1];
        if (method === 'personal_sign' && isEvmAddr(reqParams[0]) && reqParams[1] !== undefined && !isEvmAddr(reqParams[1])) {
          msgRaw = reqParams[1];
        } else if (method === 'eth_sign' && isEvmAddr(reqParams[1]) && reqParams[0] !== undefined && !isEvmAddr(reqParams[0])) {
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
        const valWei = parseHexBigInt(txReq.value);
        const valNativeStr = (typeof contracts.fromBaseUnits === 'function')
          ? contracts.fromBaseUnits(valWei.toString(), 18)
          : '0';
        const valNative = Number(valNativeStr);
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
        if (wallet.evmPrivateKey && typeof contracts.sendEvmSignedTransaction === 'function') {
          const txRes = await contracts.sendEvmSignedTransaction({
            chainKey: cfg[0],
            privateKey: wallet.evmPrivateKey,
            to: txReq.to || null,
            data: txReq.data || '0x',
            value: valWei.toString(),
            gasLimit: reqGasLimit
          });
          result = txRes.txHash;
        } else {
          const txRes = await contracts.sendEvmMpcSignedTransaction({
            wallet,
            chainKey: cfg[0],
            to: txReq.to || null,
            data: txReq.data || '0x',
            value: valWei.toString(),
            gasLimit: reqGasLimit,
            path: 'ethereum-1'
          });
          result = txRes.txHash;
        }
        if (result && typeof recordWalletActivity === 'function') {
          const sym = (cfg[1] && cfg[1].symbol) || 'ETH';
          recordWalletActivity(wallet, {
            type: 'send',
            symbol: sym,
            chain: cfg[0],
            amount: valNative,
            to: txReq.to || '',
            txHash: result,
            title: `WalletConnect · ${sym}`
          });
        }
      } else if (method === 'wallet_switchEthereumChain') {
        const targetHex = (reqParams[0] && reqParams[0].chainId) || '';
        const targetCid = Number(targetHex);
        const supported = Object.values(contracts.EVM_CHAINS || {}).some((c) => c && c.chainId === targetCid);
        if (!Number.isFinite(targetCid) || !supported) {
          const err = new Error(t(`不支持切换到网络 chainId: ${targetHex}`, `Unsupported target chainId: ${targetHex}`));
          err.code = 4902;
          throw err;
        }
        result = null;
      } else {
        throw new Error(t(`不支持的方法: ${method}`, `Unsupported method: ${method}`));
      }

      await client.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result } });
      if (typeof client._nexusShiftNextRequest === 'function') client._nexusShiftNextRequest();
      else { st.wc.pendingRequest = null; renderWcCards(); }
      showToast(t('✅ 签名已完成', '✅ Signed'));
    } catch (e) {
      if (client && ev && ev.topic) {
        await client.respondSessionRequest({
          topic: ev.topic,
          response: { id: ev.id, jsonrpc: '2.0', error: { code: Number(e && e.code) || 4001, message: (e && e.message) || 'Execution failed' } }
        }).catch(() => {});
      }
      if (client && typeof client._nexusShiftNextRequest === 'function') client._nexusShiftNextRequest();
      else { st.wc.pendingRequest = null; renderWcCards(); }
      showToast(toUserFriendlyError(e, '签名失败', 'Sign failed'));
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

  // ==================== QR Code Camera & Image Scanner ====================

  let _qrScanTarget = 'wc';
  let _qrMediaStream = null;
  let _qrScanTimer = null;
  let _qrScanHandling = false;
  let _qrVisibilityListener = null;

  function stopQrScannerStream() {
    if (_qrVisibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', _qrVisibilityListener);
      _qrVisibilityListener = null;
    }
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

  async function ensureJsQrLoaded() {
    const existing = (typeof window !== 'undefined' && window.jsQR) || (typeof globalThis !== 'undefined' && globalThis.jsQR);
    if (existing) return existing;
    if (typeof document !== 'undefined' && typeof loadScriptOnce === 'function') {
      await loadScriptOnce('src/jsqr-lazy.js?v=6.96').catch(() => false);
      return (typeof window !== 'undefined' && window.jsQR) || (typeof globalThis !== 'undefined' && globalThis.jsQR) || null;
    }
    return null;
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
      if (typeof document !== 'undefined') {
        _qrVisibilityListener = () => {
          if (document.hidden) {
            try { videoEl.pause(); } catch (_) {}
          } else if (_qrMediaStream) {
            videoEl.play().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', _qrVisibilityListener);
      }

      const DetectorCtor = (typeof window !== 'undefined' && window.BarcodeDetector) || (typeof globalThis !== 'undefined' && globalThis.BarcodeDetector);
      const getJsQrFn = () => (typeof window !== 'undefined' && window.jsQR) || (typeof globalThis !== 'undefined' && globalThis.jsQR) || null;
      if (typeof DetectorCtor !== 'function' && !getJsQrFn()) {
        await ensureJsQrLoaded();
      }
      if (typeof DetectorCtor === 'function') {
        const detector = new DetectorCtor({ formats: ['qr_code'] });
        if (statusEl) {
          statusEl.textContent = t('请将二维码对准取景框内', 'Align the QR code inside the frame');
        }
        _qrScanTimer = setInterval(async () => {
          if (typeof document !== 'undefined' && document.hidden) return;
          if (!_qrMediaStream || _qrScanHandling || videoEl.readyState < 2) return;
          try {
            const codes = await detector.detect(videoEl);
            const hit = Array.isArray(codes) && codes.find((c) => c && c.rawValue);
            if (hit && hit.rawValue) {
              await handleQrScanResultAsync(hit.rawValue);
            }
          } catch (_) {}
        }, 220);
      } else if (typeof getJsQrFn() === 'function' && typeof document !== 'undefined') {
        if (statusEl) {
          statusEl.textContent = t('请将二维码对准取景框内', 'Align the QR code inside the frame');
        }
        const canvas = document.createElement('canvas');
        const ctx2d = canvas.getContext ? canvas.getContext('2d', { willReadFrequently: true }) : null;
        _qrScanTimer = setInterval(async () => {
          if (typeof document !== 'undefined' && document.hidden) return;
          if (!_qrMediaStream || _qrScanHandling || videoEl.readyState < 2 || !ctx2d) return;
          const w = videoEl.videoWidth || 320;
          const h = videoEl.videoHeight || 240;
          if (!w || !h) return;
          canvas.width = w;
          canvas.height = h;
          ctx2d.drawImage(videoEl, 0, 0, w, h);
          try {
            const imgData = ctx2d.getImageData(0, 0, w, h);
            const jsQr = getJsQrFn();
            const code = jsQr ? jsQr(imgData.data, w, h) : null;
            if (code && code.data) {
              await handleQrScanResultAsync(code.data);
            }
          } catch (_) {}
        }, 260);
      } else if (statusEl) {
        statusEl.setAttribute('data-i18n-dynamic', '1');
        statusEl.textContent = t('当前设备暂不支持摄像头扫码，请返回直接粘贴地址或链接', 'Camera QR scanner is unsupported on this device; please go back and paste the address or link');
      }
    } catch (_) {
      if (statusEl) {
        statusEl.setAttribute('data-i18n-dynamic', '1');
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
    let jsQrFn = (typeof window !== 'undefined' && window.jsQR) || (typeof globalThis !== 'undefined' && globalThis.jsQR) || null;
    if (typeof DetectorCtor !== 'function' && typeof jsQrFn !== 'function') {
      jsQrFn = await ensureJsQrLoaded();
    }
    if (typeof DetectorCtor !== 'function' && typeof jsQrFn !== 'function') {
      showToast(t('当前设备不支持图片二维码识别，请直接复制 wc: 链接粘贴', 'Image QR decoding is unsupported on this device; paste the wc: link instead'));
      return;
    }
    try {
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
      let rawQr = '';
      if (typeof DetectorCtor === 'function') {
        const detector = new DetectorCtor({ formats: ['qr_code'] });
        const codes = await detector.detect(source);
        const hit = Array.isArray(codes) && codes.find((c) => c && c.rawValue);
        if (hit && hit.rawValue) rawQr = hit.rawValue;
      } else if (typeof jsQrFn === 'function' && typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        const w = source.width || source.naturalWidth || 400;
        const h = source.height || source.naturalHeight || 400;
        canvas.width = w;
        canvas.height = h;
        const ctx2d = canvas.getContext && canvas.getContext('2d');
        if (ctx2d) {
          ctx2d.drawImage(source, 0, 0, w, h);
          const imgData = ctx2d.getImageData(0, 0, w, h);
          const res = jsQrFn(imgData.data, w, h);
          if (res && res.data) rawQr = res.data;
        }
      }
      if (rawQr) {
        await handleQrScanResultAsync(rawQr);
      } else {
        showToast(t('未在图片中识别到有效二维码', 'No valid QR code found in image'));
      }
    } catch (_) {
      showToast(t('二维码图片识别失败，请重试或直接粘贴链接', 'Failed to decode QR image'));
    }
  }

