(function (root) {
  'use strict';

  function safeRequire(relPath) {
    if (typeof require === 'undefined') return null;
    try { return require(relPath); } catch (_) { return null; }
  }

  function getCryptoLib() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCACrypto) ||
      (typeof window !== 'undefined' && window.NearCACrypto) ||
      safeRequire('./crypto-engine.js');
  }

  function getContractsLib() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCAContracts) ||
      (typeof window !== 'undefined' && window.NearCAContracts) ||
      safeRequire('./chain-contracts.js');
  }

  function getEthersLib(ctx) {
    return (ctx && ctx.ethers) ||
      (typeof globalThis !== 'undefined' && globalThis.ethers) ||
      (typeof window !== 'undefined' && window.ethers) ||
      safeRequire('../ethers.umd.min.js');
  }

  const DAPP_CATALOG = [
    {
      id: 'intents',
      name: 'NEAR Intents',
      url: 'https://near.com',
      chain: 'NEAR',
      category: 'bridge',
      badge: 'NEAR',
      descZh: 'NEAR 官方全链意图交易与跨链闪兑终端',
      descEn: 'Official NEAR Intents cross-chain trading terminal'
    },
    {
      id: 'rhea',
      name: 'Rhea Finance',
      url: 'https://app.rhea.finance',
      chain: 'NEAR',
      category: 'dex',
      badge: 'NEAR',
      descZh: 'NEAR 生态核心去中心化交易所与流动性枢纽',
      descEn: 'Leading NEAR DEX & liquidity hub'
    },
    {
      id: 'burrow',
      name: 'Rhea Lending (Burrow)',
      url: 'https://app.rhea.finance/lending',
      chain: 'NEAR',
      category: 'lend',
      badge: 'NEAR',
      descZh: 'NEAR 原生去中心化借贷与生息市场',
      descEn: 'Native NEAR money market & lending protocol'
    },
    {
      id: 'linear',
      name: 'LiNEAR Protocol',
      url: 'https://app.linearprotocol.org',
      chain: 'NEAR',
      category: 'stake',
      badge: 'NEAR',
      descZh: 'NEAR 生态领先流动性质押协议 (LiNEAR)',
      descEn: 'Leading NEAR liquid staking protocol'
    },
    {
      id: 'hyperliquid',
      name: 'Hyperliquid',
      url: 'https://app.hyperliquid.xyz',
      chain: 'EVM',
      category: 'perp',
      badge: 'EVM',
      descZh: '高性能链上订单簿永续合约交易所',
      descEn: 'High-performance on-chain orderbook perpetuals'
    },
    {
      id: 'uniswap',
      name: 'Uniswap',
      url: 'https://app.uniswap.org',
      chain: 'EVM',
      category: 'dex',
      badge: 'EVM',
      descZh: '以太坊与多链龙头 AMM 去中心化交易所',
      descEn: 'Multi-chain AMM decentralized exchange'
    },
    {
      id: 'aave',
      name: 'Aave',
      url: 'https://app.aave.com',
      chain: 'EVM',
      category: 'lend',
      badge: 'EVM',
      descZh: 'EVM 多链主流流动性借贷协议',
      descEn: 'Leading EVM decentralized lending market'
    },
    {
      id: 'cowswap',
      name: 'CoW Swap',
      url: 'https://swap.cow.fi',
      chain: 'EVM',
      category: 'dex',
      badge: 'EVM',
      descZh: 'EVM 抗 MEV 意图聚合交易与限价单协议',
      descEn: 'MEV-protected EVM intent DEX & limit orders'
    },
    {
      id: 'pancakeswap',
      name: 'PancakeSwap',
      url: 'https://pancake.xyz',
      chain: 'EVM',
      category: 'dex',
      badge: 'EVM',
      descZh: 'BNB Chain 与多链 DEX 及收益农场',
      descEn: 'Multi-chain DEX & yield ecosystem'
    },
    {
      id: 'aerodrome',
      name: 'Aerodrome',
      url: 'https://aerodrome.finance',
      chain: 'EVM',
      category: 'dex',
      badge: 'EVM',
      descZh: 'Base 网络核心 ve(3,3) 流动性中心',
      descEn: 'Central trading & liquidity marketplace on Base'
    },
    {
      id: 'jupiter',
      name: 'Jupiter',
      url: 'https://jup.ag',
      chain: 'Solana',
      category: 'dex',
      badge: 'SOL',
      descZh: 'Solana 旗舰级聚合交易、限价单与永续平台',
      descEn: 'Solana premier swap aggregator & trading suite'
    },
    {
      id: 'raydium',
      name: 'Raydium',
      url: 'https://raydium.io/swap/',
      chain: 'Solana',
      category: 'dex',
      badge: 'SOL',
      descZh: 'Solana 链上高流动性 AMM 与 LaunchLab',
      descEn: 'On-chain AMM & liquidity provider on Solana'
    },
    {
      id: 'kamino',
      name: 'Kamino',
      url: 'https://kamino.com',
      chain: 'Solana',
      category: 'lend',
      badge: 'SOL',
      descZh: 'Solana 自动化流动性金库与杠杆借贷',
      descEn: 'Automated liquidity vaults & lending on Solana'
    }
  ];

  const DEFAULT_WALLET_ICON = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#06080f"/><circle cx="32" cy="32" r="20" fill="#00ec97" fill-opacity="0.18" stroke="#00ec97" stroke-width="3"/><path d="M22 40V24l20 16V24" fill="none" stroke="#00ec97" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  );

  function sanitizeDAppUrl(rawInput) {
    if (typeof rawInput !== 'string') return null;
    const trimmed = rawInput.trim();
    if (!trimmed || /[\s\u0000-\u001f\u007f<>]/.test(trimmed)) return null;

    let candidate = trimmed;
    if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|[?#]|$)/i.test(trimmed)) {
      candidate = `http://${trimmed}`;
    } else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
      candidate = trimmed;
    } else if (/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?([/?#].*)?$/.test(trimmed)) {
      candidate = `https://${trimmed}`;
    } else {
      return null;
    }

    let parsed;
    try {
      parsed = new URL(candidate);
    } catch (_) {
      return null;
    }

    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname) return null;

    const proto = String(parsed.protocol || '').toLowerCase();
    const host = String(parsed.hostname || '').toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    if (proto === 'https:') {
      return parsed.toString();
    }
    if (proto === 'http:' && isLocalHost) {
      return parsed.toString();
    }
    return null;
  }

  function buildRpcError(code, message, data) {
    const err = new Error(message || 'RPC Error');
    err.code = typeof code === 'number' ? code : -32603;
    if (data !== undefined) err.data = data;
    return err;
  }

  function serializeRpcError(err) {
    if (!err) return { code: -32603, message: 'Unknown error' };
    return {
      code: typeof err.code === 'number' ? err.code : -32603,
      message: err.message ? String(err.message) : 'Request failed',
      ...(err.data !== undefined ? { data: err.data } : {})
    };
  }

  function resolveEvmChainByIdOrKey(contracts, chainIdOrKey, fallbackKey = 'eth') {
    const chains = (contracts && contracts.EVM_CHAINS) || {};
    if (typeof chainIdOrKey === 'number' || (typeof chainIdOrKey === 'string' && /^(0x[0-9a-f]+|\d+)$/i.test(chainIdOrKey.trim()))) {
      const targetNum = typeof chainIdOrKey === 'number'
        ? chainIdOrKey
        : (chainIdOrKey.trim().toLowerCase().startsWith('0x')
          ? parseInt(chainIdOrKey.trim(), 16)
          : Number(chainIdOrKey.trim()));
      if (Number.isFinite(targetNum) && targetNum > 0) {
        const hit = Object.entries(chains).find(([, cfg]) => Number(cfg && cfg.chainId) === targetNum);
        if (hit) return { key: hit[0], cfg: hit[1] };
        return null;
      }
    }
    const cleanKey = String(chainIdOrKey || fallbackKey || 'eth').trim().toLowerCase();
    if (chains[cleanKey]) return { key: cleanKey, cfg: chains[cleanKey] };
    return chains[fallbackKey] ? { key: fallbackKey, cfg: chains[fallbackKey] } : null;
  }

  const EVM_READ_ONLY_METHODS = new Set([
    'eth_blockNumber',
    'eth_getBalance',
    'eth_call',
    'eth_estimateGas',
    'eth_gasPrice',
    'eth_feeHistory',
    'eth_maxPriorityFeePerGas',
    'eth_getTransactionCount',
    'eth_getTransactionReceipt',
    'eth_getTransactionByHash',
    'eth_getCode',
    'eth_getStorageAt',
    'eth_getLogs',
    'eth_getBlockByNumber',
    'eth_getBlockByHash',
    'web3_clientVersion'
  ]);

  function normalizeOriginLabel(req, ctx) {
    const rawUrl = (ctx && (ctx.nativeOrigin || ctx.origin || ctx.nativeUrl || ctx.url))
      || (req && (req.nativeOrigin || req.origin || req.url))
      || '';
    try {
      const u = new URL(rawUrl);
      return u.origin || u.hostname || rawUrl;
    } catch (_) {
      return String(rawUrl || 'DApp');
    }
  }

  function inferNamespace(req) {
    const explicit = String((req && req.namespace) || '').trim().toLowerCase();
    if (explicit === 'evm' || explicit === 'solana' || explicit === 'near') return explicit;
    const method = String((req && req.method) || '').trim();
    if (/^(eth_|net_|web3_|wallet_)/i.test(method)) return 'evm';
    if (/^(near_|requestSignIn|signAndSendTransaction)/i.test(method)) return 'near';
    return 'evm';
  }

  function parsePersonalSignParams(reqParams) {
    const p0 = reqParams && reqParams[0];
    const p1 = reqParams && reqParams[1];
    const isAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
    if (isAddr(p0) && typeof p1 === 'string' && !isAddr(p1)) {
      return p1;
    }
    return p0 !== undefined ? p0 : '';
  }

  function parseEthSignParams(reqParams) {
    const p0 = reqParams && reqParams[0];
    const p1 = reqParams && reqParams[1];
    const isAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
    if (isAddr(p1) && p0 !== undefined && !isAddr(p0)) {
      return p0;
    }
    if (isAddr(p0) && p1 !== undefined && !isAddr(p1)) {
      return p1;
    }
    return p1 !== undefined ? p1 : (p0 !== undefined ? p0 : '');
  }

  function decodeEvmApprovalCalldata(dataHex) {
    const raw = String(dataHex || '').trim();
    const lower = raw.toLowerCase();
    if (lower.startsWith('0x095ea7b3') && raw.length >= 138) {
      const spender = `0x${raw.slice(34, 74)}`;
      let amountBig = 0n;
      try {
        amountBig = BigInt(`0x${raw.slice(74, 138)}`);
      } catch (_) {
        amountBig = 0n;
      }
      const isUnlimited = amountBig >= (1n << 255n);
      const allowanceText = isUnlimited
        ? 'Unlimited Approval (无限授权)'
        : amountBig.toString();
      return {
        type: 'erc20_approve',
        spender,
        amountBig,
        isUnlimited,
        isHighRisk: isUnlimited,
        summaryLines: [
          'Approval: ERC-20 approve',
          `Spender: ${spender}`,
          `Allowance: ${allowanceText}`
        ],
        riskWarning: isUnlimited
          ? '⚠️ High-risk unlimited token approval (无限授权): spender can transfer all of this token from your wallet.'
          : ''
      };
    }
    if (lower.startsWith('0xa22cb465') && raw.length >= 138) {
      const operator = `0x${raw.slice(34, 74)}`;
      let approved = false;
      try {
        approved = BigInt(`0x${raw.slice(74, 138)}`) !== 0n;
      } catch (_) {
        approved = false;
      }
      const statusText = approved ? 'Enabled (All)' : 'Revoked';
      return {
        type: 'nft_setApprovalForAll',
        operator,
        approved,
        isHighRisk: approved,
        summaryLines: [
          'Approval: NFT setApprovalForAll',
          `Operator: ${operator}`,
          `Approved: ${statusText}`
        ],
        riskWarning: approved
          ? '⚠️ High-risk NFT full approval (全部资产授权): operator can transfer all NFTs in this collection.'
          : ''
      };
    }
    return null;
  }

  function buildInjectedProviderScript(opts = {}) {
    const cfg = {
      authorizedOrigin: opts.authorizedOrigin ? String(opts.authorizedOrigin) : '',
      evmAddress: opts.evmAddress ? String(opts.evmAddress) : '',
      chainIdHex: opts.chainIdHex ? String(opts.chainIdHex) : '0x1',
      solanaPublicKey: opts.solanaPublicKey ? String(opts.solanaPublicKey) : '',
      nearAccountId: opts.nearAccountId ? String(opts.nearAccountId) : '',
      nearPublicKey: opts.nearPublicKey ? String(opts.nearPublicKey) : '',
      walletName: opts.walletName ? String(opts.walletName) : 'Nexus Wallet',
      walletUuid: opts.walletUuid ? String(opts.walletUuid) : 'b93f8d6a-4f3b-4c72-9e7d-2f083d19a624',
      walletIcon: opts.walletIcon ? String(opts.walletIcon) : DEFAULT_WALLET_ICON
    };

    const serializedCfg = JSON.stringify(cfg);

    return `(function () {
  if (typeof window === 'undefined') return;
  try { if (window.self !== window.top) return; } catch (_) { return; }
  if (window.__NEXUS_INJECTED__) return;
  window.__NEXUS_INJECTED__ = true;

  var CFG = ${serializedCfg};
  try {
    var pageOrigin = (window.location && window.location.origin) || '';
    if (CFG.authorizedOrigin && pageOrigin && pageOrigin !== CFG.authorizedOrigin) {
      CFG.evmAddress = '';
      CFG.solanaPublicKey = '';
      CFG.nearAccountId = '';
      CFG.nearPublicKey = '';
    }
  } catch (_) {}
  var _nextId = 1;
  var _pending = Object.create(null);

  function u8ToB64(bytes) {
    var u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    var bin = '';
    for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    if (typeof btoa === 'function') return btoa(bin);
    return Buffer.from(u8).toString('base64');
  }

  function b64ToU8(b64) {
    var str = String(b64 || '');
    if (typeof atob === 'function') {
      var bin = atob(str);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(str, 'base64'));
  }

  var B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function decodeB58(str) {
    var bytes = [0];
    for (var i = 0; i < str.length; i++) {
      var c = B58_ALPHABET.indexOf(str[i]);
      if (c < 0) return new Uint8Array(32);
      var carry = c;
      for (var j = 0; j < bytes.length; j++) {
        carry += bytes[j] * 58;
        bytes[j] = carry & 255;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 255);
        carry >>= 8;
      }
    }
    for (var k = 0; k < str.length && str[k] === '1'; k++) bytes.push(0);
    return new Uint8Array(bytes.reverse());
  }

  function createEmitter() {
    var listeners = Object.create(null);
    return {
      on: function (ev, fn) {
        if (!ev || typeof fn !== 'function') return this;
        if (!listeners[ev]) listeners[ev] = [];
        listeners[ev].push(fn);
        return this;
      },
      addListener: function (ev, fn) { return this.on(ev, fn); },
      once: function (ev, fn) {
        if (typeof fn !== 'function') return this;
        var self = this;
        function wrapped() {
          self.removeListener(ev, wrapped);
          fn.apply(null, arguments);
        }
        return this.on(ev, wrapped);
      },
      removeListener: function (ev, fn) {
        var list = listeners[ev];
        if (!list) return this;
        listeners[ev] = list.filter(function (item) { return item !== fn; });
        return this;
      },
      off: function (ev, fn) { return this.removeListener(ev, fn); },
      removeAllListeners: function (ev) {
        if (ev) delete listeners[ev];
        else listeners = Object.create(null);
        return this;
      },
      emit: function (ev, payload) {
        var list = (listeners[ev] || []).slice();
        for (var i = 0; i < list.length; i++) {
          try { list[i](payload); } catch (_) {}
        }
        return list.length > 0;
      }
    };
  }

  function serializeBridgeValue(_key, val) {
    if (typeof val === 'bigint') {
      return val.toString();
    }
    if (val instanceof Uint8Array) {
      return { __nexusType: 'Uint8Array', base64: u8ToB64(val) };
    }
    if (typeof ArrayBuffer !== 'undefined') {
      if (val instanceof ArrayBuffer) {
        return { __nexusType: 'Uint8Array', base64: u8ToB64(new Uint8Array(val)) };
      }
      if (ArrayBuffer.isView && ArrayBuffer.isView(val)) {
        return {
          __nexusType: 'Uint8Array',
          base64: u8ToB64(new Uint8Array(val.buffer, val.byteOffset, val.byteLength))
        };
      }
    }
    if (val && typeof val === 'object' && val.type === 'Buffer' && Array.isArray(val.data)) {
      return { __nexusType: 'Uint8Array', base64: u8ToB64(new Uint8Array(val.data)) };
    }
    return val;
  }

  function postToNativeBridge(payload) {
    var serialized = JSON.stringify(payload, serializeBridgeValue);
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nexusBridge) {
      window.webkit.messageHandlers.nexusBridge.postMessage(serialized);
      return true;
    }
    if (window.NexusAndroidWebMessage && typeof window.NexusAndroidWebMessage.postMessage === 'function') {
      window.NexusAndroidWebMessage.postMessage(serialized);
      return true;
    }
    if (window.NexusAndroidBridge && typeof window.NexusAndroidBridge.postMessageSecure === 'function') {
      var bridgeTok = (typeof __NEXUS_ANDROID_BRIDGE_TOKEN__ === 'string') ? __NEXUS_ANDROID_BRIDGE_TOKEN__ : '';
      window.NexusAndroidBridge.postMessageSecure(serialized, bridgeTok);
      return true;
    }
    if (window.NexusAndroidBridge && typeof window.NexusAndroidBridge.postMessage === 'function') {
      window.NexusAndroidBridge.postMessage(serialized);
      return true;
    }
    if (window.__NEXUS_TEST_BRIDGE__ && typeof window.__NEXUS_TEST_BRIDGE__.postMessage === 'function') {
      window.__NEXUS_TEST_BRIDGE__.postMessage(serialized);
      return true;
    }
    return false;
  }

  function sendBridgeRequest(namespace, method, params) {
    return new Promise(function (resolve, reject) {
      var id = 'nx_' + (_nextId++);
      _pending[id] = { resolve: resolve, reject: reject };
      var msg = {
        id: id,
        namespace: namespace,
        method: method,
        params: params === undefined ? [] : params,
        origin: (window.location && window.location.origin) || '',
        url: (window.location && window.location.href) || '',
        title: (typeof document !== 'undefined' && document.title) || ''
      };
      try {
        var sent = postToNativeBridge(msg);
        if (!sent) {
          delete _pending[id];
          var noBridgeErr = new Error('Nexus native bridge unavailable');
          noBridgeErr.code = 4900;
          reject(noBridgeErr);
        }
      } catch (e) {
        delete _pending[id];
        reject(e);
      }
    });
  }

  window.__nexusOnBridgeResponse = function (id, result, error) {
    var entry = _pending[id];
    if (!entry) return;
    delete _pending[id];
    if (error) {
      var parsedErr = error;
      if (typeof error === 'string') {
        try { parsedErr = JSON.parse(error); } catch (_) { parsedErr = { message: error }; }
      }
      var errObj = new Error((parsedErr && parsedErr.message) || 'DApp request rejected');
      errObj.code = (parsedErr && typeof parsedErr.code === 'number') ? parsedErr.code : 4001;
      if (parsedErr && parsedErr.data !== undefined) errObj.data = parsedErr.data;
      entry.reject(errObj);
      return;
    }
    var parsedResult = result;
    if (typeof result === 'string') {
      try { parsedResult = JSON.parse(result); } catch (_) {}
    }
    entry.resolve(parsedResult);
  };

  // -------------------- EVM EIP-1193 + EIP-6963 --------------------
  var evmEmitter = createEmitter();
  var currentChainId = CFG.chainIdHex || '0x1';
  var ethProvider = {
    isMetaMask: true,
    isNexusWallet: true,
    selectedAddress: CFG.evmAddress || null,
    chainId: currentChainId,
    networkVersion: String(parseInt(currentChainId, 16) || 1),
    on: function (ev, fn) { evmEmitter.on(ev, fn); return this; },
    addListener: function (ev, fn) { evmEmitter.addListener(ev, fn); return this; },
    once: function (ev, fn) { evmEmitter.once(ev, fn); return this; },
    removeListener: function (ev, fn) { evmEmitter.removeListener(ev, fn); return this; },
    off: function (ev, fn) { evmEmitter.off(ev, fn); return this; },
    removeAllListeners: function (ev) { evmEmitter.removeAllListeners(ev); return this; },
    isConnected: function () { return true; },
    request: function (args) {
      var reqArgs = args || {};
      var method = String(reqArgs.method || '');
      var params = reqArgs.params === undefined ? [] : reqArgs.params;
      return sendBridgeRequest('evm', method, params).then(function (res) {
        if ((method === 'eth_requestAccounts' || method === 'eth_accounts') && Array.isArray(res)) {
          var prevAddr = ethProvider.selectedAddress;
          if (res[0]) {
            ethProvider.selectedAddress = res[0];
            if (method === 'eth_requestAccounts' && !prevAddr) {
              evmEmitter.emit('connect', { chainId: ethProvider.chainId });
              evmEmitter.emit('accountsChanged', res);
            } else if (prevAddr && String(prevAddr).toLowerCase() !== String(res[0]).toLowerCase()) {
              evmEmitter.emit('accountsChanged', res);
            }
          } else if (prevAddr) {
            ethProvider.selectedAddress = null;
            evmEmitter.emit('accountsChanged', []);
          }
        } else if (method === 'wallet_switchEthereumChain' && params && params[0] && params[0].chainId) {
          var nextHex = String(params[0].chainId);
          if (String(ethProvider.chainId || '').toLowerCase() !== nextHex.toLowerCase()) {
            ethProvider.chainId = nextHex;
            ethProvider.networkVersion = String(parseInt(nextHex, 16) || 1);
            evmEmitter.emit('chainChanged', nextHex);
          }
        }
        return res;
      });
    },
    enable: function () {
      return ethProvider.request({ method: 'eth_requestAccounts' });
    },
    sendAsync: function (payload, cb) {
      ethProvider.request({ method: payload && payload.method, params: payload && payload.params })
        .then(function (result) {
          if (typeof cb === 'function') cb(null, { id: payload && payload.id, jsonrpc: '2.0', result: result });
        })
        .catch(function (err) {
          if (typeof cb === 'function') cb(err, null);
        });
    },
    send: function (methodOrPayload, paramsOrCb) {
      if (typeof methodOrPayload === 'string') {
        return ethProvider.request({ method: methodOrPayload, params: Array.isArray(paramsOrCb) ? paramsOrCb : [] });
      }
      if (typeof paramsOrCb === 'function') {
        ethProvider.sendAsync(methodOrPayload, paramsOrCb);
        return;
      }
      return ethProvider.request({ method: methodOrPayload && methodOrPayload.method, params: methodOrPayload && methodOrPayload.params });
    }
  };
  try {
    window.ethereum = ethProvider;
    window.okxwallet = ethProvider;
    ethProvider._metamask = { isUnlocked: function () { return Promise.resolve(true); } };
    if (typeof Event === 'function' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('ethereum#initialized'));
    }
    if (CFG.evmAddress) {
      setTimeout(function () {
        evmEmitter.emit('connect', { chainId: currentChainId });
        evmEmitter.emit('accountsChanged', [CFG.evmAddress]);
      }, 0);
    }
  } catch (_) {}

  var eip6963Info = Object.freeze({
    uuid: CFG.walletUuid,
    name: CFG.walletName,
    icon: CFG.walletIcon,
    rdns: 'io.nexus.wallet'
  });

  function announceEip6963() {
    try {
      if (typeof CustomEvent === 'function' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
          detail: Object.freeze({ info: eip6963Info, provider: ethProvider })
        }));
      }
    } catch (_) {}
  }

  try {
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('eip6963:requestProvider', announceEip6963);
      window.addEventListener('DOMContentLoaded', announceEip6963);
      window.addEventListener('load', announceEip6963);
    }
  } catch (_) {}
  announceEip6963();

  // -------------------- Solana Provider & Wallet Standard --------------------
  function makeSolPublicKey(b58Str) {
    if (!b58Str) return null;
    var cachedBytes = null;
    return {
      toBase58: function () { return b58Str; },
      toString: function () { return b58Str; },
      toJSON: function () { return b58Str; },
      toBytes: function () {
        if (!cachedBytes) cachedBytes = decodeB58(b58Str);
        return cachedBytes;
      }
    };
  }

  function serializeSolTxInput(tx) {
    if (!tx) return '';
    if (typeof tx === 'string') return tx;
    if (tx instanceof Uint8Array) return u8ToB64(tx);
    if (typeof tx.serialize === 'function') {
      try {
        return u8ToB64(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
      } catch (_) {
        try { return u8ToB64(tx.serialize()); } catch (_) {}
      }
    }
    return '';
  }

  function applySolSignedOutput(origTx, signedBase64) {
    var bytes = b64ToU8(signedBase64);
    if (origTx && origTx.constructor && typeof origTx.constructor.deserialize === 'function') {
      try { return origTx.constructor.deserialize(bytes); } catch (_) {}
    }
    if (origTx && origTx.constructor && typeof origTx.constructor.from === 'function') {
      try { return origTx.constructor.from(bytes); } catch (_) {}
    }
    return {
      signedBase64: signedBase64,
      serialize: function () { return bytes; }
    };
  }

  var solEmitter = createEmitter();
  var solStandardEmitter = createEmitter();
  var nearEmitter = createEmitter();
  var nearStandardEmitter = createEmitter();

  function normalizeStandardInputs(argsList) {
    var out = [];
    for (var i = 0; i < argsList.length; i++) {
      var item = argsList[i];
      if (Array.isArray(item)) {
        for (var j = 0; j < item.length; j++) {
          if (item[j] !== undefined && item[j] !== null) out.push(item[j]);
        }
      } else if (item !== undefined && item !== null) {
        out.push(item);
      }
    }
    return out;
  }

  function makeSolStandardAccounts(pkStr) {
    var clean = String(pkStr || '').trim();
    return clean ? [{
      address: clean,
      publicKey: decodeB58(clean),
      chains: ['solana:mainnet'],
      features: ['solana:signAndSendTransaction', 'solana:signTransaction', 'solana:signMessage']
    }] : [];
  }

  function encodeUtf8Bytes(str) {
    var s = String(str || '');
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
    return new Uint8Array(out);
  }

  var solProvider = {
    isPhantom: true,
    isOkxWallet: true,
    isNexusWallet: true,
    isConnected: Boolean(CFG.solanaPublicKey),
    publicKey: makeSolPublicKey(CFG.solanaPublicKey),
    on: function (ev, fn) { solEmitter.on(ev, fn); return this; },
    removeListener: function (ev, fn) { solEmitter.removeListener(ev, fn); return this; },
    off: function (ev, fn) { solEmitter.off(ev, fn); return this; },
    connect: function (connectOpts) {
      return sendBridgeRequest('solana', 'connect', [connectOpts || {}]).then(function (res) {
        var pkStr = (res && res.publicKey) || '';
        solProvider.publicKey = makeSolPublicKey(pkStr);
        solProvider.isConnected = Boolean(pkStr);
        if (typeof syncSolStandardAccounts === 'function') syncSolStandardAccounts(pkStr, true);
        if (pkStr) {
          solEmitter.emit('connect', solProvider.publicKey);
        }
        return { publicKey: solProvider.publicKey };
      });
    },
    disconnect: function () {
      return sendBridgeRequest('solana', 'disconnect', []).then(function () {
        solProvider.isConnected = false;
        solProvider.publicKey = null;
        if (typeof syncSolStandardAccounts === 'function') syncSolStandardAccounts('', true);
        try {
          if (typeof window.localStorage !== 'undefined' && window.localStorage && window.localStorage.getItem('walletName') === JSON.stringify(CFG.walletName)) {
            window.localStorage.removeItem('walletName');
          }
        } catch (_) {}
        solEmitter.emit('disconnect');
      });
    },
    signMessage: function (message) {
      var msgB64 = typeof message === 'string' ? u8ToB64(encodeUtf8Bytes(message)) : u8ToB64(message);
      return sendBridgeRequest('solana', 'signMessage', [{ messageBase64: msgB64 }]).then(function (res) {
        var sigBytes = res && res.signatureBase64 ? b64ToU8(res.signatureBase64) : new Uint8Array(64);
        return {
          signature: sigBytes,
          publicKey: solProvider.publicKey || makeSolPublicKey(res && res.publicKey)
        };
      });
    },
    signTransaction: function (tx) {
      var txB64 = serializeSolTxInput(tx);
      return sendBridgeRequest('solana', 'signTransaction', [{ transactionBase64: txB64 }]).then(function (res) {
        return applySolSignedOutput(tx, (res && res.signedBase64) || txB64);
      });
    },
    signAllTransactions: function (txs) {
      var list = Array.isArray(txs) ? txs : [];
      var b64List = list.map(serializeSolTxInput);
      return sendBridgeRequest('solana', 'signAllTransactions', [{ transactionsBase64: b64List }]).then(function (res) {
        var signed = (res && res.signedBase64List) || [];
        return list.map(function (tx, i) { return applySolSignedOutput(tx, signed[i] || b64List[i]); });
      });
    },
    signAndSendTransaction: function (tx, options) {
      var txB64 = serializeSolTxInput(tx);
      return sendBridgeRequest('solana', 'signAndSendTransaction', [{ transactionBase64: txB64, options: options || {} }]).then(function (res) {
        return {
          signature: (res && (res.signature || res.txHash)) || ''
        };
      });
    }
  };
  try {
    window.solana = solProvider;
    window.phantom = { solana: solProvider };
    if (window.okxwallet) window.okxwallet.solana = solProvider;
  } catch (_) {}

  var solWalletStandardObj = null;
  var nearWalletStandardObj = null;

  function syncSolStandardAccounts(pkStr, emitChange) {
    if (!solWalletStandardObj) return [];
    var nextAccounts = makeSolStandardAccounts(pkStr);
    solWalletStandardObj.accounts = nextAccounts;
    if (emitChange) {
      solStandardEmitter.emit('change', { accounts: nextAccounts });
    }
    return nextAccounts;
  }

  function syncNearStandardAccounts(accountId, publicKey, emitChange) {
    if (!nearWalletStandardObj) return [];
    var acct = String(accountId || '').trim();
    var pk = String(publicKey || '').trim();
    nearWalletStandardObj.accounts = acct ? [{
      address: acct,
      publicKey: pk ? decodeB58(pk.replace(/^ed25519:/i, '')) : new Uint8Array(32),
      chains: ['near:mainnet'],
      features: ['near:signIn', 'near:signOut', 'near:signMessage', 'near:signAndSendTransaction', 'near:signAndSendTransactions']
    }] : [];
    if (emitChange) {
      nearStandardEmitter.emit('change', { accounts: nearWalletStandardObj.accounts });
    }
    return nearWalletStandardObj.accounts;
  }

  try {
    var solAccounts = makeSolStandardAccounts(CFG.solanaPublicKey);
    var nearAccounts = CFG.nearAccountId ? [{
      address: CFG.nearAccountId,
      publicKey: CFG.nearPublicKey ? decodeB58(CFG.nearPublicKey.replace(/^ed25519:/i, '')) : new Uint8Array(32),
      chains: ['near:mainnet'],
      features: ['near:signIn', 'near:signOut', 'near:signMessage', 'near:signAndSendTransaction', 'near:signAndSendTransactions']
    }] : [];

    solWalletStandardObj = {
      version: '1.0.0',
      name: CFG.walletName,
      icon: CFG.walletIcon,
      chains: ['solana:mainnet'],
      accounts: solAccounts,
      features: {
        'standard:connect': {
          version: '1.0.0',
          connect: function () {
            return solProvider.connect().then(function () {
              return { accounts: solWalletStandardObj.accounts };
            });
          }
        },
        'standard:disconnect': {
          version: '1.0.0',
          disconnect: function () {
            return solProvider.disconnect();
          }
        },
        'standard:events': {
          version: '1.0.0',
          on: function (ev, fn) {
            solStandardEmitter.on(ev, fn);
            return function () { solStandardEmitter.removeListener(ev, fn); };
          }
        },
        'solana:signAndSendTransaction': {
          version: '1.0.0',
          supportedTransactionVersions: ['legacy', 0],
          signAndSendTransaction: function () {
            var arr = normalizeStandardInputs(arguments);
            return Promise.all(arr.map(function (inp) {
              return solProvider.signAndSendTransaction(inp && inp.transaction, inp && inp.options).then(function (r) {
                return { signature: decodeB58(r.signature) };
              });
            }));
          }
        },
        'solana:signTransaction': {
          version: '1.0.0',
          supportedTransactionVersions: ['legacy', 0],
          signTransaction: function () {
            var arr = normalizeStandardInputs(arguments);
            var serializeSigned = function (signed) {
              var out = signed instanceof Uint8Array
                ? signed
                : (signed && typeof signed.serialize === 'function' ? signed.serialize() : new Uint8Array(0));
              return { signedTransaction: out };
            };
            if (arr.length > 1) {
              return solProvider.signAllTransactions(arr.map(function (inp) { return inp && inp.transaction; }))
                .then(function (list) { return list.map(serializeSigned); });
            }
            return Promise.all(arr.map(function (inp) {
              return solProvider.signTransaction(inp && inp.transaction).then(serializeSigned);
            }));
          }
        },
        'solana:signMessage': {
          version: '1.0.0',
          signMessage: function () {
            var arr = normalizeStandardInputs(arguments);
            return Promise.all(arr.map(function (inp) {
              return solProvider.signMessage(inp && inp.message).then(function (r) {
                return { signedMessage: inp && inp.message, signature: r.signature };
              });
            }));
          }
        }
      }
    };

    nearWalletStandardObj = {
      version: '1.0.0',
      name: CFG.walletName,
      icon: CFG.walletIcon,
      chains: ['near:mainnet'],
      accounts: nearAccounts,
      features: {
        'standard:connect': {
          version: '1.0.0',
          connect: function () {
            return nearProvider.requestSignIn({}).then(function () {
              return { accounts: nearWalletStandardObj.accounts };
            });
          }
        },
        'standard:disconnect': {
          version: '1.0.0',
          disconnect: function () {
            return nearProvider.signOut();
          }
        },
        'standard:events': {
          version: '1.0.0',
          on: function (ev, fn) {
            nearStandardEmitter.on(ev, fn);
            return function () { nearStandardEmitter.removeListener(ev, fn); };
          }
        },
        'near:signIn': {
          version: '1.0.0',
          signIn: function (inp) {
            return nearProvider.requestSignIn(inp || {}).then(function (res) {
              var acct = (res && res.accountId) || nearProvider.accountId;
              var pk = (res && res.publicKey) || nearProvider.publicKey;
              syncNearStandardAccounts(acct, pk, false);
              return [{ accountId: acct, publicKey: pk }];
            });
          }
        },
        'near:signOut': {
          version: '1.0.0',
          signOut: function () {
            return nearProvider.signOut();
          }
        },
        'near:signMessage': {
          version: '1.0.0',
          signMessage: function (inp) { return nearProvider.signMessage(inp); }
        },
        'near:signAndSendTransaction': {
          version: '1.0.0',
          signAndSendTransaction: function (inp) { return nearProvider.signAndSendTransaction(inp); }
        },
        'near:signAndSendTransactions': {
          version: '1.0.0',
          signAndSendTransactions: function (inp) { return nearProvider.signAndSendTransactions(inp); }
        }
      }
    };

    var standardWallets = [solWalletStandardObj, nearWalletStandardObj];
    function registerAllStandardWallets(api) {
      if (!api || typeof api.register !== 'function') return;
      for (var wi = 0; wi < standardWallets.length; wi++) {
        try { api.register(standardWallets[wi]); } catch (_) {}
      }
    }
    if (typeof navigator !== 'undefined') {
      if (!Array.isArray(navigator.wallets)) {
        try { navigator.wallets = []; } catch (_) {}
      }
      if (Array.isArray(navigator.wallets)) {
        navigator.wallets.push(registerAllStandardWallets);
      }
    }
    if (typeof CustomEvent === 'function' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', {
        detail: registerAllStandardWallets
      }));
      if (typeof window.addEventListener === 'function') {
        window.addEventListener('wallet-standard:app-ready', function (ev) {
          if (ev && ev.detail) registerAllStandardWallets(ev.detail);
        });
      }
    }
    if (CFG.solanaPublicKey) {
      setTimeout(function () {
        solEmitter.emit('connect', solProvider.publicKey);
      }, 0);
    }
  } catch (_) {}

  // -------------------- NEAR Provider & Auto-Connect Seeds --------------------
  var nearProvider = {
    isNexusWallet: true,
    accountId: CFG.nearAccountId || '',
    publicKey: CFG.nearPublicKey || '',
    on: function (ev, fn) { nearEmitter.on(ev, fn); return this; },
    removeListener: function (ev, fn) { nearEmitter.removeListener(ev, fn); return this; },
    isSignedIn: function () { return Boolean(nearProvider.accountId); },
    getAccountId: function () { return nearProvider.accountId || ''; },
    account: function () {
      return {
        accountId: nearProvider.accountId,
        publicKey: nearProvider.publicKey,
        signAndSendTransaction: function (tx) { return nearProvider.signAndSendTransaction(tx); }
      };
    },
    requestSignIn: function (opts) {
      return sendBridgeRequest('near', 'requestSignIn', [opts || {}]).then(function (res) {
        nearProvider.accountId = (res && res.accountId) || '';
        nearProvider.publicKey = (res && res.publicKey) || '';
        syncNearStandardAccounts(nearProvider.accountId, nearProvider.publicKey, true);
        nearEmitter.emit('accountsChanged', nearProvider.accountId ? [nearProvider.accountId] : []);
        return res;
      });
    },
    signOut: function () {
      return sendBridgeRequest('near', 'signOut', []).then(function () {
        nearProvider.accountId = '';
        nearProvider.publicKey = '';
        syncNearStandardAccounts('', '', true);
        try {
          if (typeof window.localStorage !== 'undefined' && window.localStorage && window.localStorage.getItem('@near-wallet-selector:selectedWalletId') === JSON.stringify('nexus-wallet')) {
            window.localStorage.removeItem('@near-wallet-selector:selectedWalletId');
            window.localStorage.removeItem('@near-wallet-selector:recentlySignedInWallets');
          }
        } catch (_) {}
        nearEmitter.emit('accountsChanged', []);
      });
    },
    signMessage: function (msgParams) {
      var payload = Object.assign({}, msgParams || {});
      if (payload.nonce instanceof Uint8Array) {
        payload.nonce = u8ToB64(payload.nonce);
      } else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(payload.nonce)) {
        payload.nonce = u8ToB64(new Uint8Array(payload.nonce.buffer, payload.nonce.byteOffset, payload.nonce.byteLength));
      } else if (Array.isArray(payload.nonce)) {
        payload.nonce = u8ToB64(new Uint8Array(payload.nonce));
      } else if (payload.nonce && typeof payload.nonce === 'object' && Array.isArray(payload.nonce.data)) {
        payload.nonce = u8ToB64(new Uint8Array(payload.nonce.data));
      }
      return sendBridgeRequest('near', 'signMessage', [payload]);
    },
    signAndSendTransaction: function (tx) {
      return sendBridgeRequest('near', 'signAndSendTransaction', [tx || {}]);
    },
    signAndSendTransactions: function (txs) {
      return sendBridgeRequest('near', 'signAndSendTransactions', [txs || {}]);
    }
  };
  try {
    window.near = nearProvider;
    window.nearWallet = nearProvider;
    window.myNearWallet = nearProvider;
    if (!window.sender) window.sender = nearProvider;
  } catch (_) {}

  try {
    if (typeof window.localStorage !== 'undefined' && window.localStorage) {
      if (CFG.nearAccountId) {
        if (!window.localStorage.getItem('@near-wallet-selector:selectedWalletId')) {
          window.localStorage.setItem('@near-wallet-selector:selectedWalletId', JSON.stringify('nexus-wallet'));
        }
        if (!window.localStorage.getItem('@near-wallet-selector:recentlySignedInWallets')) {
          window.localStorage.setItem('@near-wallet-selector:recentlySignedInWallets', JSON.stringify(['nexus-wallet']));
        }
      } else if (window.localStorage.getItem('@near-wallet-selector:selectedWalletId') === JSON.stringify('nexus-wallet')) {
        window.localStorage.removeItem('@near-wallet-selector:selectedWalletId');
        window.localStorage.removeItem('@near-wallet-selector:recentlySignedInWallets');
      }
      if (CFG.solanaPublicKey) {
        if (!window.localStorage.getItem('walletName')) {
          window.localStorage.setItem('walletName', JSON.stringify(CFG.walletName));
        }
      } else if (window.localStorage.getItem('walletName') === JSON.stringify(CFG.walletName)) {
        window.localStorage.removeItem('walletName');
      }
      if (CFG.evmAddress) {
        if (!window.localStorage.getItem('wagmi.connected')) {
          window.localStorage.setItem('wagmi.connected', 'true');
        }
      } else {
        window.localStorage.removeItem('wagmi.connected');
      }
    }
  } catch (_) {}

  window.__nexusOnProviderEvent = function (namespace, eventName, payload) {
    var parsed = payload;
    if (typeof payload === 'string' && (payload.charAt(0) === '{' || payload.charAt(0) === '[')) {
      try { parsed = JSON.parse(payload); } catch (_) {}
    }
    if (namespace === 'evm') {
      if (eventName === 'chainChanged' && typeof parsed === 'string') {
        if (String(ethProvider.chainId || '').toLowerCase() === parsed.toLowerCase()) return;
        ethProvider.chainId = parsed;
        ethProvider.networkVersion = String(parseInt(parsed, 16) || 1);
      } else if (eventName === 'accountsChanged' && Array.isArray(parsed)) {
        ethProvider.selectedAddress = parsed[0] || null;
        if (!ethProvider.selectedAddress) {
          try { window.localStorage && window.localStorage.removeItem('wagmi.connected'); } catch (_) {}
        }
      }
      evmEmitter.emit(eventName, parsed);
    } else if (namespace === 'solana') {
      if (eventName === 'disconnect') {
        solProvider.isConnected = false;
        solProvider.publicKey = null;
        syncSolStandardAccounts('', true);
        try {
          if (typeof window.localStorage !== 'undefined' && window.localStorage && window.localStorage.getItem('walletName') === JSON.stringify(CFG.walletName)) {
            window.localStorage.removeItem('walletName');
          }
        } catch (_) {}
        solEmitter.emit('disconnect');
      } else if (eventName === 'connect' || eventName === 'accountChanged') {
        var pkVal = typeof parsed === 'string' ? parsed : (parsed && parsed.publicKey ? String(parsed.publicKey) : '');
        solProvider.publicKey = makeSolPublicKey(pkVal);
        solProvider.isConnected = Boolean(pkVal);
        syncSolStandardAccounts(pkVal, true);
        solEmitter.emit(eventName, solProvider.publicKey);
      } else {
        solEmitter.emit(eventName, parsed);
      }
    } else if (namespace === 'near') {
      if (eventName === 'accountsChanged') {
        var nextNear = (Array.isArray(parsed) && parsed[0]) ? String(parsed[0]) : '';
        nearProvider.accountId = nextNear;
        if (!nextNear) {
          nearProvider.publicKey = '';
          try {
            if (typeof window.localStorage !== 'undefined' && window.localStorage && window.localStorage.getItem('@near-wallet-selector:selectedWalletId') === JSON.stringify('nexus-wallet')) {
              window.localStorage.removeItem('@near-wallet-selector:selectedWalletId');
              window.localStorage.removeItem('@near-wallet-selector:recentlySignedInWallets');
            }
          } catch (_) {}
        }
        syncNearStandardAccounts(nearProvider.accountId, nearProvider.publicKey, true);
        nearEmitter.emit('accountsChanged', Array.isArray(parsed) ? parsed : (nextNear ? [nextNear] : []));
      } else {
        nearEmitter.emit(eventName, parsed);
      }
    }
  };
})();`;
  }

  async function ensureApproval(req, ctx, detail) {
    const fn = ctx && ctx.requestApprovalAsync;
    if (typeof fn !== 'function') {
      throw buildRpcError(4100, 'Approval handler unavailable');
    }
    const approved = await fn({
      namespace: inferNamespace(req),
      method: req.method,
      origin: normalizeOriginLabel(req, ctx),
      url: (ctx && (ctx.nativeUrl || ctx.url)) || req.url || '',
      title: req.title || (ctx && ctx.title) || '',
      ...detail
    });
    if (!approved) {
      throw buildRpcError(4001, 'User rejected the request.');
    }
    return true;
  }

  function decodeBase64ToUint8Array(b64, crypto) {
    if (crypto && typeof crypto.base64ToBytes === 'function') {
      return crypto.base64ToBytes(b64);
    }
    if (typeof atob === 'function') {
      const bin = atob(String(b64 || ''));
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(String(b64 || ''), 'base64'));
    }
    return new Uint8Array(0);
  }

  function restoreBridgeMarkers(val, crypto) {
    if (val === null || val === undefined || typeof val !== 'object') return val;
    if (val instanceof Uint8Array) return val;
    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(val)) return val;
    if (Array.isArray(val)) return val.map((item) => restoreBridgeMarkers(item, crypto));
    if (val.__nexusType === 'Uint8Array') {
      if (typeof val.base64 === 'string') {
        return decodeBase64ToUint8Array(val.base64, crypto);
      }
      if (Array.isArray(val.data)) {
        return Uint8Array.from(val.data, (b) => Number(b) & 0xff);
      }
    }
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = restoreBridgeMarkers(v, crypto);
    }
    return out;
  }

  async function ensureDAppWalletReadyAsync(wallet, contracts, ctx) {
    if (!wallet) return wallet;
    if (!wallet.nearNamedAccount && ctx && typeof ctx.hydrateNearNamedAccountAsync === 'function') {
      await ctx.hydrateNearNamedAccountAsync(wallet).catch(() => {});
    }
    if (contracts && typeof contracts.ensureWalletSigningKeysAsync === 'function') {
      await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    }
    return wallet;
  }

  async function ensureBiometricAuth(req, ctx, reasonText) {
    const fn = ctx && ctx.verifyAuthAsync;
    if (typeof fn !== 'function') return true;
    const ok = await fn(ctx.wallet, reasonText || `${normalizeOriginLabel(req, ctx)}: ${req.method}`);
    if (!ok) {
      throw buildRpcError(4001, 'User cancelled security verification.');
    }
    return true;
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

  function pruneEip712Types(rawTypes, primaryType) {
    if (!rawTypes || typeof rawTypes !== 'object' || Array.isArray(rawTypes)) {
      return {};
    }
    const sourceTypes = {};
    for (const [k, v] of Object.entries(rawTypes)) {
      if (k !== 'EIP712Domain') sourceTypes[k] = v;
    }
    const rootType = typeof primaryType === 'string' ? primaryType.trim() : '';
    if (!rootType || rootType === 'EIP712Domain' || !Object.prototype.hasOwnProperty.call(sourceTypes, rootType)) {
      return sourceTypes;
    }
    const pruned = {};
    const visited = new Set();
    const queue = [rootType];
    while (queue.length > 0) {
      const typeName = queue.shift();
      if (visited.has(typeName)) continue;
      const fields = sourceTypes[typeName];
      if (!Array.isArray(fields)) continue;
      visited.add(typeName);
      pruned[typeName] = fields;
      for (const field of fields) {
        const rawFieldType = field && typeof field.type === 'string' ? field.type.trim() : '';
        const baseType = rawFieldType.replace(/(\s*\[\s*\d*\s*\])+$/, '');
        if (baseType && baseType !== 'EIP712Domain' && Object.prototype.hasOwnProperty.call(sourceTypes, baseType) && !visited.has(baseType)) {
          queue.push(baseType);
        }
      }
    }
    return pruned;
  }

  async function handleEvmRequest(req, ctx) {
    const contracts = (ctx && ctx.contracts) || getContractsLib();
    const crypto = (ctx && ctx.crypto) || getCryptoLib();
    const wallet = ctx && ctx.wallet;
    if (!wallet || !contracts) throw buildRpcError(4900, 'Wallet or contracts unavailable');

    const method = String(req.method || '').trim();
    const params = Array.isArray(req.params) ? req.params : [];
    const activeChain = resolveEvmChainByIdOrKey(
      contracts,
      (req && (req.evmChainId || req.chainKey)) || (ctx && ctx.activeEvmChainKey) || 'eth',
      (ctx && ctx.activeEvmChainKey) || 'eth'
    );
    if (!activeChain) {
      throw buildRpcError(4902, 'Unrecognized active EVM chain');
    }

    if (method === 'eth_chainId') {
      return `0x${Number(activeChain.cfg.chainId).toString(16)}`;
    }
    if (method === 'net_version') {
      return String(activeChain.cfg.chainId);
    }
    if (method === 'wallet_watchAsset') {
      return true;
    }

    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') {
      const targetHex = params[0] && params[0].chainId;
      const found = resolveEvmChainByIdOrKey(contracts, targetHex, '');
      if (!found) {
        throw buildRpcError(4902, `Unrecognized chain ID ${targetHex || ''}`);
      }
      if (ctx && typeof ctx.setEvmChain === 'function') {
        ctx.setEvmChain(found.key, `0x${Number(found.cfg.chainId).toString(16)}`);
      }
      if (ctx && typeof ctx.onSessionChainChanged === 'function') {
        ctx.onSessionChainChanged(`0x${Number(found.cfg.chainId).toString(16)}`, found.key);
      }
      return null;
    }

    if (EVM_READ_ONLY_METHODS.has(method)) {
      if (method === 'web3_clientVersion') return 'NexusWallet/v6.24';
      if (typeof contracts.callEvmRpc !== 'function') {
        throw buildRpcError(-32603, 'EVM RPC transport unavailable');
      }
      return contracts.callEvmRpc(activeChain.key, {
        jsonrpc: '2.0',
        id: 1,
        method,
        params
      });
    }

    await ensureDAppWalletReadyAsync(wallet, contracts, ctx);

    if (method === 'eth_accounts') {
      const origin = normalizeOriginLabel(req, ctx);
      const isConn = Boolean(ctx && typeof ctx.isOriginConnected === 'function' && ctx.isOriginConnected(origin, 'evm'));
      const isDisconnected = Boolean(ctx && typeof ctx.isOriginDisconnected === 'function' && ctx.isOriginDisconnected(origin, 'evm'));
      if (!isConn && (!(ctx && ctx.autoConnectOrigin) || isDisconnected)) {
        return [];
      }
      if (!isConn && ctx && typeof ctx.markOriginConnected === 'function') {
        ctx.markOriginConnected(origin, 'evm');
      }
      const addr = contracts.resolveWalletEvmSender ? contracts.resolveWalletEvmSender(wallet) : wallet.evmAddress;
      return addr ? [addr] : [];
    }

    if (method === 'eth_requestAccounts' || method === 'eth_coinbase') {
      const addr = contracts.resolveWalletEvmSender ? contracts.resolveWalletEvmSender(wallet) : wallet.evmAddress;
      const origin = normalizeOriginLabel(req, ctx);
      const alreadyConnected = Boolean(ctx && typeof ctx.isOriginConnected === 'function' && ctx.isOriginConnected(origin, 'evm'));
      const isDisconnected = Boolean(ctx && typeof ctx.isOriginDisconnected === 'function' && ctx.isOriginDisconnected(origin, 'evm'));
      if (!alreadyConnected && (!(ctx && ctx.autoConnectOrigin) || isDisconnected)) {
        await ensureApproval(req, ctx, {
          kind: 'connect',
          chainLabel: activeChain.cfg.name || activeChain.key.toUpperCase(),
          account: addr || '',
          summary: `Connect EVM wallet (${addr || '--'})`
        });
      }
      if (ctx && typeof ctx.markOriginConnected === 'function') {
        ctx.markOriginConnected(origin, 'evm');
      }
      if (method === 'eth_coinbase') return addr || null;
      return addr ? [addr] : [];
    }

    if (method === 'personal_sign' || method === 'eth_sign') {
      const addr = contracts.resolveWalletEvmSender ? contracts.resolveWalletEvmSender(wallet) : wallet.evmAddress;
      const isBlindSign = method === 'eth_sign';
      const msgRaw = isBlindSign ? parseEthSignParams(params) : parsePersonalSignParams(params);
      let previewText = String(msgRaw || '');
      const ethersLib = getEthersLib(ctx);
      if (typeof msgRaw === 'string' && msgRaw.startsWith('0x') && ethersLib && ethersLib.getBytes && ethersLib.toUtf8String) {
        try { previewText = ethersLib.toUtf8String(ethersLib.getBytes(msgRaw)); } catch (_) {}
      }

      await ensureApproval(req, ctx, {
        kind: isBlindSign ? 'blindSign' : 'signMessage',
        chainLabel: activeChain.cfg.name || activeChain.key.toUpperCase(),
        account: addr || '',
        summary: previewText.slice(0, 600),
        ...(isBlindSign ? {
          isHighRisk: true,
          requireSecondConfirm: true,
          riskWarning: '⚠️ High-risk blind sign (eth_sign): signing raw hashes can drain your wallet assets. Only continue if you fully trust this DApp. (高危盲签：eth_sign 对原始摘要签名可能导致资产被盗，仅在完全信任该应用时继续。)'
        } : {})
      });
      await ensureBiometricAuth(req, ctx);

      if (!ethersLib) throw buildRpcError(-32603, 'EVM signer unavailable');
      const msgBytes = (typeof msgRaw === 'string' && msgRaw.startsWith('0x'))
        ? ethersLib.getBytes(msgRaw)
        : String(msgRaw);

      if (wallet.evmPrivateKey) {
        return new ethersLib.Wallet(wallet.evmPrivateKey).signMessage(msgBytes);
      }
      if (!crypto || typeof contracts.requestNearMpcChainSignature !== 'function') {
        throw buildRpcError(-32603, 'MPC signer unavailable');
      }
      const digestHex = ethersLib.hashMessage(msgBytes);
      const digestBytes = crypto.hexToBytes(String(digestHex).replace(/^0x/i, ''));
      const mpcRes = await contracts.requestNearMpcChainSignature({
        wallet,
        payloadHash32Bytes: digestBytes,
        path: 'ethereum-1',
        domainId: 0
      });
      const sigObj = mpcRes && mpcRes.mpcSignature;
      if (!sigObj || !sigObj.big_r || !sigObj.big_r.affine_point || !sigObj.s || !sigObj.s.scalar) {
        throw buildRpcError(-32603, 'Invalid NEAR MPC signature');
      }
      const rHex = `0x${sigObj.big_r.affine_point.slice(2, 66)}`;
      const sHex = `0x${sigObj.s.scalar.padStart(64, '0')}`;
      const baseParity = Number(sigObj.recovery_id || 0) & 1;
      const expectedAddr = String(addr || wallet.mpcEvmAddress || wallet.evmAddress || '').toLowerCase();
      for (const yParity of [baseParity, baseParity ^ 1]) {
        const sig = ethersLib.Signature.from({ r: rHex, s: sHex, yParity });
        if (!expectedAddr || typeof ethersLib.recoverAddress !== 'function') return sig.serialized;
        try {
          const rec = ethersLib.recoverAddress(`0x${String(digestHex).replace(/^0x/i, '')}`, sig);
          if (rec && rec.toLowerCase() === expectedAddr) return sig.serialized;
        } catch (_) {}
      }
      return ethersLib.Signature.from({
        r: rHex,
        s: sHex,
        yParity: baseParity
      }).serialized;
    }

    if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v3' || method === 'eth_signTypedData_v4') {
      const isEvmAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
      const typedArg = (params[1] !== undefined && !isEvmAddr(params[1])) ? params[1] : params[0];
      let rawTyped = {};
      try {
        rawTyped = typeof typedArg === 'string' ? JSON.parse(typedArg) : (typedArg || {});
      } catch (_) {
        throw buildRpcError(-32602, 'Invalid typed data');
      }
      const cleanTypes = pruneEip712Types(rawTyped.types, rawTyped.primaryType);
      const addr = contracts.resolveWalletEvmSender ? contracts.resolveWalletEvmSender(wallet) : wallet.evmAddress;

      await ensureApproval(req, ctx, {
        kind: 'signTypedData',
        chainLabel: activeChain.cfg.name || activeChain.key.toUpperCase(),
        account: addr || '',
        summary: JSON.stringify(rawTyped.message || rawTyped.domain || {}).slice(0, 800)
      });
      await ensureBiometricAuth(req, ctx);

      if (typeof contracts.signEvmTypedDataUnified === 'function') {
        const res = await contracts.signEvmTypedDataUnified({
          wallet,
          domain: rawTyped.domain || {},
          types: cleanTypes,
          value: rawTyped.message || {},
          path: 'ethereum-1'
        });
        return res.signature;
      }
      const ethersLib = getEthersLib(ctx);
      if (ethersLib && wallet.evmPrivateKey) {
        return new ethersLib.Wallet(wallet.evmPrivateKey).signTypedData(rawTyped.domain || {}, cleanTypes, rawTyped.message || {});
      }
      throw buildRpcError(-32603, 'Typed data signer unavailable');
    }

    if (method === 'eth_sendTransaction') {
      const txReq = params[0] || {};
      const addr = contracts.resolveWalletEvmSender ? contracts.resolveWalletEvmSender(wallet) : wallet.evmAddress;
      const txChain = txReq.chainId
        ? (resolveEvmChainByIdOrKey(contracts, txReq.chainId, activeChain.key) || activeChain)
        : activeChain;
      const valBig = parseHexBigInt(txReq.value);
      const dataHex = (typeof txReq.data === 'string' && txReq.data.length > 0) ? txReq.data : '0x';
      const nativeSym = (txChain.cfg && txChain.cfg.symbol) || 'ETH';
      const formattedVal = typeof contracts.fromBaseUnits === 'function'
        ? contracts.fromBaseUnits(valBig.toString(), 18)
        : ((Number(valBig) / 1e18).toFixed(6).replace(/\.?0+$/, '') || '0');
      const valNative = Number(formattedVal);
      const gasRaw = txReq.gasLimit || txReq.gas;
      const gasBig = gasRaw ? parseHexBigInt(gasRaw) : 0n;
      const reqGasLimit = gasBig > 0n ? gasBig.toString() : undefined;

      if (typeof contracts.validateSufficientChainBalance === 'function') {
        contracts.validateSufficientChainBalance({
          wallet,
          chain: txChain.key,
          tokenSymbol: nativeSym,
          amount: Number.isFinite(valNative) ? valNative : 0,
          isNative: true,
          allowZeroAmount: true
        });
      }

      const decodedApproval = decodeEvmApprovalCalldata(dataHex);
      const approvalDetailLines = decodedApproval ? decodedApproval.summaryLines.join('\n') : '';
      const txSummary = [
        `To: ${txReq.to || '(Contract Creation)'}`,
        `Value: ${formattedVal} ${nativeSym}`,
        approvalDetailLines,
        `Data: ${dataHex.slice(0, 128)}${dataHex.length > 128 ? '...' : ''}`
      ].filter(Boolean).join('\n');

      await ensureApproval(req, ctx, {
        kind: 'sendTransaction',
        chainLabel: `${txChain.cfg.name || txChain.key.toUpperCase()} (${txChain.cfg.chainId})`,
        account: addr || '',
        summary: txSummary,
        ...(decodedApproval && decodedApproval.isHighRisk ? { isHighRisk: true } : {}),
        ...(decodedApproval && decodedApproval.riskWarning ? { riskWarning: decodedApproval.riskWarning } : {})
      });
      await ensureBiometricAuth(req, ctx);

      let txHash = '';
      if (txReq.to && typeof contracts.executeEvmRawSteps === 'function') {
        const res = await contracts.executeEvmRawSteps({
          wallet,
          chainKey: txChain.key,
          steps: [{
            chainId: txChain.cfg.chainId,
            to: txReq.to,
            data: dataHex,
            value: valBig.toString(),
            ...(reqGasLimit ? { gasLimit: reqGasLimit } : {})
          }]
        });
        txHash = res.txHash || '';
      } else if (typeof contracts.sendEvmMpcSignedTransaction === 'function' && !wallet.evmPrivateKey) {
        const res = await contracts.sendEvmMpcSignedTransaction({
          wallet,
          chainKey: txChain.key,
          to: txReq.to || null,
          data: dataHex,
          value: valBig.toString(),
          ...(reqGasLimit ? { gasLimit: reqGasLimit } : {}),
          path: 'ethereum-1'
        });
        txHash = res.txHash || res.hash || '';
      } else {
        const ethersLib = getEthersLib(ctx);
        if (ethersLib && wallet.evmPrivateKey) {
          const provider = new ethersLib.JsonRpcProvider(txChain.cfg.rpc, txChain.cfg.chainId);
          const sent = await new ethersLib.Wallet(wallet.evmPrivateKey).connect(provider).sendTransaction({
            to: txReq.to || null,
            data: dataHex,
            value: valBig,
            ...(gasBig > 0n ? { gasLimit: gasBig } : {})
          });
          txHash = sent.hash || '';
        } else {
          throw buildRpcError(-32603, 'EVM transaction executor unavailable');
        }
      }

      const recordFn = (ctx && typeof ctx.recordActivity === 'function')
        ? ctx.recordActivity
        : (typeof globalThis !== 'undefined' && globalThis.NearCAUI && typeof globalThis.NearCAUI.recordWalletActivity === 'function'
          ? globalThis.NearCAUI.recordWalletActivity
          : null);
      if (txHash && recordFn) {
        recordFn(wallet, {
          type: 'send',
          symbol: nativeSym,
          chain: txChain.key,
          amount: Number.isFinite(valNative) ? valNative : 0,
          to: txReq.to || '',
          txHash,
          title: `DApp · ${nativeSym}`
        });
      }
      return txHash;
    }

    throw buildRpcError(4200, `Unsupported EVM method: ${method}`);
  }

  async function handleSolanaRequest(req, ctx) {
    const contracts = (ctx && ctx.contracts) || getContractsLib();
    const crypto = (ctx && ctx.crypto) || getCryptoLib();
    const wallet = ctx && ctx.wallet;
    if (!wallet || !contracts || !crypto) throw buildRpcError(4900, 'Wallet or crypto unavailable');
    await ensureDAppWalletReadyAsync(wallet, contracts, ctx);

    const method = String(req.method || '').trim();
    const params = Array.isArray(req.params) ? req.params : [];
    const arg0 = params[0] || {};
    const pubKeyStr = wallet.solAddress || '';
    const solSeedHex = wallet.solPrivateSeedHex || wallet.solPrivateKeyHex || null;

    if (method === 'connect') {
      const origin = normalizeOriginLabel(req, ctx);
      const alreadyConnected = Boolean(ctx && typeof ctx.isOriginConnected === 'function' && ctx.isOriginConnected(origin, 'solana'));
      const isDisconnected = Boolean(ctx && typeof ctx.isOriginDisconnected === 'function' && ctx.isOriginDisconnected(origin, 'solana'));
      if (!alreadyConnected && (!(ctx && ctx.autoConnectOrigin) || isDisconnected)) {
        await ensureApproval(req, ctx, {
          kind: 'connect',
          chainLabel: 'Solana',
          account: pubKeyStr,
          summary: `Connect Solana wallet (${pubKeyStr || '--'})`
        });
      }
      if (ctx && typeof ctx.markOriginConnected === 'function') {
        ctx.markOriginConnected(origin, 'solana');
      }
      return { publicKey: pubKeyStr };
    }

    if (method === 'disconnect') {
      const origin = normalizeOriginLabel(req, ctx);
      if (ctx && typeof ctx.markOriginDisconnected === 'function') {
        ctx.markOriginDisconnected(origin, 'solana');
      }
      return true;
    }

    if (method === 'signMessage') {
      const msgBytes = arg0.messageBase64
        ? crypto.base64ToBytes(arg0.messageBase64)
        : (arg0.message instanceof Uint8Array ? arg0.message : new TextEncoder().encode(String(arg0.message || '')));
      let preview = '';
      try { preview = new TextDecoder().decode(msgBytes); } catch (_) { preview = `${msgBytes.length} bytes`; }

      await ensureApproval(req, ctx, {
        kind: 'signMessage',
        chainLabel: 'Solana',
        account: pubKeyStr,
        summary: preview.slice(0, 600)
      });
      await ensureBiometricAuth(req, ctx);

      let sigBytes;
      if (solSeedHex && typeof crypto.ed25519SignAsync === 'function') {
        sigBytes = await crypto.ed25519SignAsync(msgBytes, solSeedHex);
      } else if (typeof contracts.requestNearMpcChainSignature === 'function') {
        const mpcRes = await contracts.requestNearMpcChainSignature({
          wallet,
          payloadBytes: msgBytes,
          path: 'solana-1',
          domainId: 1
        });
        const sigObj = mpcRes && mpcRes.mpcSignature;
        if (!sigObj || !Array.isArray(sigObj.signature) || sigObj.signature.length !== 64) {
          throw buildRpcError(-32603, 'NEAR MPC did not return a valid 64-byte Ed25519 signature');
        }
        sigBytes = Uint8Array.from(sigObj.signature, (b) => Number(b) & 0xff);
      } else {
        throw buildRpcError(-32603, 'Solana signer unavailable');
      }
      return {
        signatureBase64: crypto.bytesToBase64(sigBytes),
        publicKey: pubKeyStr
      };
    }

    if (method === 'signTransaction') {
      const b64Tx = String(arg0.transactionBase64 || arg0.transaction || '');
      if (!b64Tx) throw buildRpcError(-32602, 'Missing transactionBase64');
      await ensureApproval(req, ctx, {
        kind: 'signTransaction',
        chainLabel: 'Solana',
        account: pubKeyStr,
        summary: `Sign Solana transaction (${b64Tx.slice(0, 64)}...)`
      });
      await ensureBiometricAuth(req, ctx);
      const signed = await contracts.signSolanaBase64Tx(b64Tx, solSeedHex, wallet, 'solana-1');
      return { signedBase64: signed.signedBase64 };
    }

    if (method === 'signAllTransactions') {
      const list = Array.isArray(arg0.transactionsBase64) ? arg0.transactionsBase64 : [];
      if (!list.length) throw buildRpcError(-32602, 'Missing transactionsBase64');
      await ensureApproval(req, ctx, {
        kind: 'signAllTransactions',
        chainLabel: 'Solana',
        account: pubKeyStr,
        summary: `Sign ${list.length} Solana transactions`
      });
      await ensureBiometricAuth(req, ctx);
      const out = [];
      for (const b64Tx of list) {
        const signed = await contracts.signSolanaBase64Tx(b64Tx, solSeedHex, wallet, 'solana-1');
        out.push(signed.signedBase64);
      }
      return { signedBase64List: out };
    }

    if (method === 'signAndSendTransaction') {
      const b64Tx = String(arg0.transactionBase64 || arg0.transaction || '');
      if (!b64Tx) throw buildRpcError(-32602, 'Missing transactionBase64');
      await ensureApproval(req, ctx, {
        kind: 'sendTransaction',
        chainLabel: 'Solana',
        account: pubKeyStr,
        summary: `Approve & send Solana transaction (${b64Tx.slice(0, 64)}...)`
      });
      await ensureBiometricAuth(req, ctx);
      const sent = await contracts.signAndBroadcastSolanaBase64Tx(b64Tx, solSeedHex, wallet, 'solana-1');
      return { signature: sent.txHash, txHash: sent.txHash };
    }

    throw buildRpcError(4200, `Unsupported Solana method: ${method}`);
  }

  function formatNearActionsPreview(actions) {
    try {
      return JSON.stringify(actions || [], (_k, val) => {
        if (typeof val === 'bigint') return val.toString();
        if (val instanceof Uint8Array) {
          if (typeof TextDecoder !== 'undefined') {
            try {
              const txt = new TextDecoder().decode(val);
              if (/^[\x20-\x7e\t\r\n]+$/.test(txt)) return txt;
            } catch (_) {}
          }
          return `<Uint8Array:${val.length}B>`;
        }
        return val;
      }).slice(0, 500);
    } catch (_) {
      return `${Array.isArray(actions) ? actions.length : 0} action(s)`;
    }
  }

  function buildFinalExecutionOutcome(contracts, creds, receiverId, rawOutcome, extraHashes) {
    const isObj = rawOutcome && typeof rawOutcome === 'object';
    let txHash = isObj
      ? String(rawOutcome.txHash || (rawOutcome.transaction && rawOutcome.transaction.hash) || '')
      : String(rawOutcome || '');
    if (!txHash && Array.isArray(extraHashes) && extraHashes.length) {
      txHash = String(extraHashes[extraHashes.length - 1] || '');
    }
    const cachedOutcome = contracts && contracts._lastNearOutcome && (!txHash || contracts._lastNearOutcome.txHash === txHash)
      ? contracts._lastNearOutcome
      : null;
    const rpcRes = (isObj && rawOutcome.transaction && rawOutcome.status ? rawOutcome : null)
      || (isObj && rawOutcome.result && typeof rawOutcome.result === 'object' ? rawOutcome.result : null)
      || (cachedOutcome && cachedOutcome.result && typeof cachedOutcome.result === 'object' ? cachedOutcome.result : null);
    const resolvedHash = String((rpcRes && rpcRes.transaction && rpcRes.transaction.hash) || txHash || '');
    const defaultStatus = (cachedOutcome && typeof cachedOutcome.successValueB64 === 'string')
      ? { SuccessValue: cachedOutcome.successValueB64 }
      : { SuccessValue: '' };
    const status = (rpcRes && rpcRes.status) || defaultStatus;
    const transaction = (rpcRes && rpcRes.transaction) || {
      signer_id: (creds && creds.accountId) || '',
      public_key: (creds && creds.publicKeyStr) || '',
      receiver_id: receiverId || '',
      hash: resolvedHash,
      actions: []
    };
    const transactionOutcome = (rpcRes && rpcRes.transaction_outcome) || {
      id: resolvedHash,
      outcome: {
        status,
        logs: [],
        receipt_ids: [],
        gas_burnt: 0
      }
    };
    const receiptsOutcome = Array.isArray(rpcRes && rpcRes.receipts_outcome) ? rpcRes.receipts_outcome : [];
    const txHashes = Array.isArray(extraHashes) && extraHashes.length
      ? extraHashes.filter(Boolean)
      : (resolvedHash ? [resolvedHash] : []);
    return {
      ...(rpcRes && typeof rpcRes === 'object' ? rpcRes : {}),
      status,
      transaction,
      transaction_outcome: transactionOutcome,
      receipts_outcome: receiptsOutcome,
      txHash: resolvedHash,
      transactionHashes: txHashes
    };
  }

  async function executeSingleNearTx(contracts, creds, wallet, txObj) {
    const receiverId = String((txObj && txObj.receiverId) || '');
    const actions = Array.isArray(txObj && txObj.actions) ? txObj.actions : [];
    if (!receiverId || !actions.length) {
      throw buildRpcError(-32602, 'NEAR transaction requires receiverId and actions');
    }
    if (typeof contracts.signAndSendNearActionsBatch === 'function') {
      const batchRes = await contracts.signAndSendNearActionsBatch({
        accountId: creds.accountId,
        publicKeyStr: creds.publicKeyStr,
        privateKeyStr: creds.privateKeyStr,
        receiverId,
        actions,
        wallet
      });
      return buildFinalExecutionOutcome(contracts, creds, receiverId, batchRes);
    }
    const hashes = [];
    for (const act of actions) {
      const kind = String((act && (act.type || (act.functionCall ? 'FunctionCall' : (act.transfer ? 'Transfer' : '')))) || '').toLowerCase();
      const body = (act && (act.params || act.functionCall || act.transfer || act)) || {};
      if (kind === 'transfer') {
        const yocto = String(body.deposit || body.amountYocto || '0');
        const amountNear = body.amountNear !== undefined
          ? String(body.amountNear)
          : contracts.fromBaseUnits(yocto, 24);
        const res = await contracts.signAndSendNearTransfer({
          accountId: creds.accountId,
          publicKeyStr: creds.publicKeyStr,
          privateKeyStr: creds.privateKeyStr,
          receiverId,
          amountNear,
          wallet
        });
        hashes.push(res.txHash);
      } else {
        const methodName = String(body.methodName || '');
        if (!methodName) throw buildRpcError(-32602, 'Unsupported NEAR action without methodName');
        const argsVal = body.args !== undefined ? body.args : (body.argsJson || '{}');
        let argsJson;
        if (argsVal instanceof Uint8Array) {
          argsJson = typeof TextDecoder !== 'undefined'
            ? new TextDecoder().decode(argsVal)
            : Array.from(argsVal).map((b) => String.fromCharCode(b)).join('');
        } else {
          argsJson = typeof argsVal === 'string' ? argsVal : JSON.stringify(argsVal);
        }
        const txHash = await contracts.signAndSendNearFunctionCall({
          accountId: creds.accountId,
          publicKeyStr: creds.publicKeyStr,
          privateKeyStr: creds.privateKeyStr,
          receiverId,
          methodName,
          argsJson,
          gas: String(body.gas || '50000000000000'),
          depositYocto: String(body.deposit || '0')
        });
        hashes.push(txHash);
      }
    }
    return buildFinalExecutionOutcome(contracts, creds, receiverId, hashes[hashes.length - 1] || '', hashes);
  }

  async function handleNearRequest(req, ctx) {
    const contracts = (ctx && ctx.contracts) || getContractsLib();
    const crypto = (ctx && ctx.crypto) || getCryptoLib();
    const wallet = ctx && ctx.wallet;
    if (!wallet || !contracts || !crypto) throw buildRpcError(4900, 'Wallet or crypto unavailable');
    await ensureDAppWalletReadyAsync(wallet, contracts, ctx);

    const creds = contracts.getWalletNearSignerCredentials(wallet);
    const method = String(req.method || '').trim();
    const params = Array.isArray(req.params) ? req.params : [];
    const arg0 = params[0] || {};

    if (method === 'getAccountId') {
      const origin = normalizeOriginLabel(req, ctx);
      const isConn = Boolean(ctx && typeof ctx.isOriginConnected === 'function' && ctx.isOriginConnected(origin, 'near'));
      const isDisconnected = Boolean(ctx && typeof ctx.isOriginDisconnected === 'function' && ctx.isOriginDisconnected(origin, 'near'));
      if (!isConn && (!(ctx && ctx.autoConnectOrigin) || isDisconnected)) {
        return '';
      }
      return creds.accountId || '';
    }

    if (method === 'requestSignIn') {
      const origin = normalizeOriginLabel(req, ctx);
      const alreadyConnected = Boolean(ctx && typeof ctx.isOriginConnected === 'function' && ctx.isOriginConnected(origin, 'near'));
      const isDisconnected = Boolean(ctx && typeof ctx.isOriginDisconnected === 'function' && ctx.isOriginDisconnected(origin, 'near'));
      if (!alreadyConnected && (!(ctx && ctx.autoConnectOrigin) || isDisconnected)) {
        const isImplicit = /^[0-9a-f]{64}$/i.test(String(creds.accountId || ''));
        await ensureApproval(req, ctx, {
          kind: 'connect',
          chainLabel: 'NEAR',
          account: creds.accountId || '',
          summary: `Connect NEAR account (${creds.accountId || '--'}${isImplicit ? ' · Implicit' : ''})`
        });
      }
      if (ctx && typeof ctx.markOriginConnected === 'function') {
        ctx.markOriginConnected(origin, 'near');
      }
      return { accountId: creds.accountId, publicKey: creds.publicKeyStr };
    }

    if (method === 'signOut') {
      const origin = normalizeOriginLabel(req, ctx);
      if (ctx && typeof ctx.markOriginDisconnected === 'function') {
        ctx.markOriginDisconnected(origin, 'near');
      }
      return true;
    }

    if (method === 'signMessage') {
      const message = String(arg0.message || '');
      const recipient = String(arg0.recipient || normalizeOriginLabel(req, ctx));
      let nonceBytes;
      if (typeof arg0.nonce === 'string') {
        nonceBytes = crypto.base64ToBytes(arg0.nonce);
      } else if (arg0.nonce instanceof Uint8Array) {
        nonceBytes = arg0.nonce;
      } else if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(arg0.nonce)) {
        nonceBytes = new Uint8Array(arg0.nonce.buffer, arg0.nonce.byteOffset, arg0.nonce.byteLength);
      } else if (Array.isArray(arg0.nonce)) {
        nonceBytes = Uint8Array.from(arg0.nonce, (b) => Number(b) & 0xff);
      } else if (arg0.nonce && typeof arg0.nonce === 'object' && Array.isArray(arg0.nonce.data)) {
        nonceBytes = Uint8Array.from(arg0.nonce.data, (b) => Number(b) & 0xff);
      } else {
        nonceBytes = new Uint8Array(32);
      }
      await ensureApproval(req, ctx, {
        kind: 'signMessage',
        chainLabel: 'NEAR',
        account: creds.accountId || '',
        summary: `Recipient: ${recipient}\nMessage: ${message.slice(0, 500)}`
      });
      await ensureBiometricAuth(req, ctx);
      const sigRes = await crypto.signNep413IntentMessageAsync({
        message,
        recipient,
        nonceBytes,
        callbackUrl: arg0.callbackUrl || '',
        nearPrivateSeedHex: wallet.nearPrivateSeedHex || wallet.nearPrivateKeyHex,
        nearPublicKey: creds.publicKeyStr
      });
      let signatureBase64 = sigRes.signature || '';
      if (typeof signatureBase64 === 'string' && signatureBase64.startsWith('ed25519:') && typeof crypto.base58Decode === 'function' && typeof crypto.bytesToBase64 === 'function') {
        try {
          const rawSigBytes = crypto.base58Decode(signatureBase64.slice('ed25519:'.length));
          if (rawSigBytes && rawSigBytes.length === 64) {
            signatureBase64 = crypto.bytesToBase64(rawSigBytes);
          }
        } catch (_) {}
      }
      return {
        ...sigRes,
        accountId: creds.accountId || '',
        publicKey: sigRes.publicKey || creds.publicKeyStr || '',
        signature: signatureBase64,
        signatureBase58: sigRes.signature,
        ...(arg0.state !== undefined ? { state: arg0.state } : {})
      };
    }

    if (method === 'signAndSendTransaction') {
      await ensureApproval(req, ctx, {
        kind: 'sendTransaction',
        chainLabel: 'NEAR',
        account: creds.accountId || '',
        summary: `To: ${arg0.receiverId || '--'}\nActions: ${formatNearActionsPreview(arg0.actions)}`
      });
      await ensureBiometricAuth(req, ctx);
      return executeSingleNearTx(contracts, creds, wallet, arg0);
    }

    if (method === 'signAndSendTransactions') {
      const txs = Array.isArray(arg0.transactions) ? arg0.transactions : (Array.isArray(arg0) ? arg0 : []);
      if (!txs.length) throw buildRpcError(-32602, 'Missing transactions list');
      await ensureApproval(req, ctx, {
        kind: 'sendTransactions',
        chainLabel: 'NEAR',
        account: creds.accountId || '',
        summary: `Batch ${txs.length} NEAR transactions (${txs.map((t) => t.receiverId).join(', ')})`
      });
      await ensureBiometricAuth(req, ctx);
      const results = [];
      for (const txItem of txs) {
        results.push(await executeSingleNearTx(contracts, creds, wallet, txItem));
      }
      return results;
    }

    throw buildRpcError(4200, `Unsupported NEAR method: ${method}`);
  }

  async function handleDAppRpcRequest(req = {}, ctx = {}) {
    const crypto = (ctx && ctx.crypto) || getCryptoLib();
    const restoredReq = restoreBridgeMarkers(req, crypto);
    const ns = inferNamespace(restoredReq);
    if (ns === 'solana') return handleSolanaRequest(restoredReq, ctx);
    if (ns === 'near') return handleNearRequest(restoredReq, ctx);
    return handleEvmRequest(restoredReq, ctx);
  }

  const api = {
    DAPP_CATALOG,
    DEFAULT_WALLET_ICON,
    sanitizeDAppUrl,
    buildInjectedProviderScript,
    decodeEvmApprovalCalldata,
    pruneEip712Types,
    handleDAppRpcRequest,
    serializeRpcError,
    resolveEvmChainByIdOrKey
  };

  if (root) {
    root.NearCADAppBrowser = api;
    root.NearCA = root.NearCA || {};
    root.NearCA.dappBrowser = api;
  }
  if (typeof window !== 'undefined') {
    window.NearCADAppBrowser = api;
    window.NearCA = window.NearCA || {};
    window.NearCA.dappBrowser = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
