  // ==================== WalletConnect v2 Core Helpers & Session State ====================

  const DEFAULT_WC_PROJECT_ID = 'a1e691683a26f67375ef31ee654a1f49';
  const WC_TIMEOUT_MS = 12000;
  const WC_PROPOSAL_WAIT_MS = 18000;
  const WC_SESSION_WALLETS_STORAGE_KEY = 'near_ca_wc_session_wallets_v1';
  let _wcProposalWaitTimer = null;

  function isEvmAddrHex(v) {
    return typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
  }

  function withTimeout(promise, ms, errMsg) {
    let timer = null;
    return Promise.race([
      Promise.resolve(promise).finally(() => { if (timer) { clearTimeout(timer); timer = null; } }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(errMsg || t('连接超时，请重试', 'Connection timed out. Please retry.'))), ms);
        if (timer && typeof timer.unref === 'function') timer.unref();
      })
    ]);
  }

  function setWcPairHint(text = '', tone = '') {
    const el = $('wc-pair-hint');
    if (!el) return;
    const msg = String(text || '').trim();
    el.textContent = msg;
    if (el.dataset) el.dataset.tone = tone || '';
    el.classList?.toggle('hidden', !msg);
    el.classList?.toggle('text-rose', tone === 'error');
    el.classList?.toggle('text-emerald', tone === 'ok');
  }

  function clearWcProposalWaitTimer() {
    if (_wcProposalWaitTimer) {
      clearTimeout(_wcProposalWaitTimer);
      _wcProposalWaitTimer = null;
    }
  }

  function startWcProposalWaitTimer() {
    clearWcProposalWaitTimer();
    _wcProposalWaitTimer = setTimeout(() => {
      _wcProposalWaitTimer = null;
      const st = getState();
      if (st && st.wc && !st.wc.pendingProposal && $('sheet-walletconnect')?.classList?.contains('open')) {
        const msg = t('DApp 暂未响应，请刷新页面二维码后重试', 'No response from DApp. Refresh the QR code and retry.');
        setWcPairHint(msg, 'error');
        showToast(msg);
      }
    }, WC_PROPOSAL_WAIT_MS);
    if (_wcProposalWaitTimer && typeof _wcProposalWaitTimer.unref === 'function') {
      _wcProposalWaitTimer.unref();
    }
  }

  function extractWcPairingUri(rawInput) {
    let cur = String(rawInput || '').trim();
    if (!cur) return '';
    for (let pass = 0; pass < 3; pass++) {
      if (/^wc:[^/]/i.test(cur) || /^wc:[0-9a-f]+@/i.test(cur)) return cur;
      const unencMatch = cur.match(/[?&](?:uri|wc)=(wc:[^#]+)/i);
      if (unencMatch && unencMatch[1]) {
        cur = unencMatch[1].trim();
        continue;
      }
      const qIdx = cur.indexOf('?');
      if (qIdx >= 0) {
        try {
          const sp = new URLSearchParams(cur.slice(qIdx + 1));
          const inner = sp.get('uri') || sp.get('wc');
          if (inner) {
            cur = decodeURIComponent(inner).trim();
            continue;
          }
        } catch (_) {}
      }
      if (/^[a-z0-9+.-]+:\/\/wc:/i.test(cur)) {
        cur = cur.replace(/^[a-z0-9+.-]+:\/\//i, '');
        continue;
      }
      if (/^wc:\/\//i.test(cur) && !cur.includes('uri=')) {
        const stripped = `wc:${cur.slice(5)}`;
        if (/^wc:[^/]/i.test(stripped) && stripped.includes('@')) return stripped;
        return '';
      }
      try {
        const dec = decodeURIComponent(cur);
        if (dec !== cur) {
          cur = dec.trim();
          continue;
        }
      } catch (_) {}
      break;
    }
    return /^wc:[^/]/i.test(cur) ? cur : '';
  }

  function isLegacyWcV1Uri(uri) {
    return /^wc:[^?]+@1(?:\?|$)/i.test(String(uri || '').trim());
  }

  function resolveWcMetadata() {
    let originUrl = '';
    try {
      if (typeof location !== 'undefined' && location.origin && /^https:\/\/[^/]+$/i.test(location.origin)) {
        const u = new URL(location.origin);
        if (u.hostname && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
          originUrl = u.origin;
        }
      }
    } catch (_) {}
    return {
      name: 'Nexus Wallet',
      description: 'Self-Custody Chain Abstraction Wallet',
      url: originUrl || 'https://near.org',
      icons: ['https://near.org/favicon.ico']
    };
  }

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
        const relayer = client.core && client.core.relayer;
        if (relayer && typeof relayer.off === 'function') {
          if (listeners.relayerDisconnect) relayer.off('relayer_disconnect', listeners.relayerDisconnect);
          if (listeners.relayerConnect) relayer.off('relayer_connect', listeners.relayerConnect);
        }
      }
      if (client.core && client.core.relayer && typeof client.core.relayer.transportClose === 'function') {
        await client.core.relayer.transportClose().catch(() => {});
      }
    } catch (_) {}
  }

  async function ensureWcRelayerConnected(client, timeoutMs = 6000) {
    const relayer = client && client.core && client.core.relayer;
    if (!relayer) return true;
    const isConnected = relayer.connected !== false &&
      (!relayer.provider || !relayer.provider.connection || relayer.provider.connection.connected !== false);
    if (isConnected) return true;
    const openFn = typeof relayer.restartTransport === 'function'
      ? relayer.restartTransport.bind(relayer)
      : (typeof relayer.transportOpen === 'function' ? relayer.transportOpen.bind(relayer) : null);
    if (!openFn) return true;
    await withTimeout(openFn(), timeoutMs, t('连接通道恢复超时', 'Connection recovery timed out'));
    return true;
  }

  async function reconnectWcRelayerIfNeeded() {
    const st = getState();
    if (!st || !st.wc || !st.wc.client) return false;
    try {
      await ensureWcRelayerConnected(st.wc.client, 6000);
      updateWcStatusPill(t('已就绪', 'Ready'), true);
      return true;
    } catch (_) {
      const dead = st.wc.client;
      st.wc.client = null;
      st.wc.initProjectId = '';
      await teardownWcClient(dead);
      updateWcStatusPill(t('重新连接中...', 'Reconnecting...'), false);
      try {
        await ensureWcReady();
        return true;
      } catch (_) {
        updateWcStatusPill(t('连接断开', 'Disconnected'), false);
        return false;
      }
    }
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
      const typedArg = (list[1] !== undefined && !isEvmAddrHex(list[1])) ? list[1] : list[0];
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
      for (const [k, v] of Object.entries(msg).slice(0, 6)) {
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
          fw.mountWcProposalPanel(pCard, { proposal: null, approving: Boolean(_wcApprovingProposal), isEn: st.lang === 'en' });
        }
      } else if (fw && typeof fw.mountWcProposalPanel === 'function') {
        fw.mountWcProposalPanel(pCard, {
          proposal: p,
          approving: Boolean(_wcApprovingProposal),
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
            const msgParam = (isEvmAddrHex(p0) && p1) ? p1 : p0;
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
            const rawHex = (isEvmAddrHex(p0) && p1) ? p1 : p0;
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

  function getWcSessionNsAddrs(session, ns, lower = true) {
    const accs = session && session.namespaces && session.namespaces[ns] && Array.isArray(session.namespaces[ns].accounts)
      ? session.namespaces[ns].accounts
      : [];
    return accs.map((a) => {
      const addr = String(a).split(':')[2] || '';
      return lower ? addr.toLowerCase() : addr;
    }).filter(Boolean);
  }

  function doesWcSessionBelongToWallet(session, wallet) {
    if (!session || !wallet) return false;
    syncWcSessionWalletsCache();
    const topic = session.topic ? String(session.topic) : '';
    const mappedWalletId = topic ? _wcSessionWallets[topic] : '';
    if (mappedWalletId) return mappedWalletId === String(wallet.id);
    const walletEvm = getWcWalletEvmLower(wallet);
    const evmAccounts = getWcSessionNsAddrs(session, 'eip155', true);
    if (walletEvm && evmAccounts.length > 0) return evmAccounts.includes(walletEvm);
    const solAccounts = getWcSessionNsAddrs(session, 'solana', false);
    if (wallet.solAddress && solAccounts.length > 0) return solAccounts.includes(String(wallet.solAddress));
    const nearId = String(wallet.nearNamedAccount || wallet.nearAddress || '').toLowerCase();
    const nearAccounts = getWcSessionNsAddrs(session, 'near', true);
    if (nearId && nearAccounts.length > 0) return nearAccounts.includes(nearId);
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

    for (const topic of topicsToDisconnect) delete _wcSessionWallets[topic];
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
