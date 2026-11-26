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
    const rawUrl = (req && (req.origin || req.url)) || (ctx && (ctx.origin || ctx.url)) || '';
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

  function buildInjectedProviderScript(opts = {}) {
    const cfg = {
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
  if (window.__NEXUS_INJECTED__) return;
  window.__NEXUS_INJECTED__ = true;

  var CFG = ${serializedCfg};
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

  function postToNativeBridge(payload) {
    var serialized = JSON.stringify(payload);
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nexusBridge) {
      window.webkit.messageHandlers.nexusBridge.postMessage(serialized);
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
        if ((method === 'eth_requestAccounts' || method === 'eth_accounts') && Array.isArray(res) && res[0]) {
          ethProvider.selectedAddress = res[0];
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
        var pkStr = (res && res.publicKey) || CFG.solanaPublicKey || '';
        solProvider.publicKey = makeSolPublicKey(pkStr);
        solProvider.isConnected = Boolean(pkStr);
        solEmitter.emit('connect', solProvider.publicKey);
        return { publicKey: solProvider.publicKey };
      });
    },
    disconnect: function () {
      return sendBridgeRequest('solana', 'disconnect', []).then(function () {
        solProvider.isConnected = false;
        solEmitter.emit('disconnect');
      });
    },
    signMessage: function (message) {
      var msgB64 = typeof message === 'string' ? u8ToB64(new TextEncoder().encode(message)) : u8ToB64(message);
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

  try {
    var solAccounts = CFG.solanaPublicKey ? [{
      address: CFG.solanaPublicKey,
      publicKey: decodeB58(CFG.solanaPublicKey),
      chains: ['solana:mainnet'],
      features: ['solana:signAndSendTransaction', 'solana:signTransaction', 'solana:signMessage']
    }] : [];
    var nearAccounts = CFG.nearAccountId ? [{
      address: CFG.nearAccountId,
      publicKey: CFG.nearPublicKey ? decodeB58(CFG.nearPublicKey.replace(/^ed25519:/i, '')) : new Uint8Array(32),
      chains: ['near:mainnet'],
      features: ['near:signIn', 'near:signOut', 'near:signMessage', 'near:signAndSendTransaction', 'near:signAndSendTransactions']
    }] : [];

    var solWalletStandardObj = {
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
              var pk = solProvider.publicKey ? solProvider.publicKey.toBase58() : '';
              solWalletStandardObj.accounts = pk ? [{
                address: pk,
                publicKey: decodeB58(pk),
                chains: ['solana:mainnet'],
                features: ['solana:signAndSendTransaction', 'solana:signTransaction', 'solana:signMessage']
              }] : [];
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
            solProvider.on(ev, fn);
            return function () { solProvider.removeListener(ev, fn); };
          }
        },
        'solana:signAndSendTransaction': {
          version: '1.0.0',
          supportedTransactionVersions: ['legacy', 0],
          signAndSendTransaction: function (inputs) {
            var arr = Array.isArray(inputs) ? inputs : [inputs];
            return Promise.all(arr.map(function (inp) {
              return solProvider.signAndSendTransaction(inp.transaction, inp.options).then(function (r) {
                return { signature: decodeB58(r.signature) };
              });
            }));
          }
        },
        'solana:signTransaction': {
          version: '1.0.0',
          supportedTransactionVersions: ['legacy', 0],
          signTransaction: function (inputs) {
            var arr = Array.isArray(inputs) ? inputs : [inputs];
            return Promise.all(arr.map(function (inp) {
              return solProvider.signTransaction(inp.transaction).then(function (signed) {
                return { signedTransaction: signed && typeof signed.serialize === 'function' ? signed.serialize() : new Uint8Array(0) };
              });
            }));
          }
        },
        'solana:signMessage': {
          version: '1.0.0',
          signMessage: function (inputs) {
            var arr = Array.isArray(inputs) ? inputs : [inputs];
            return Promise.all(arr.map(function (inp) {
              return solProvider.signMessage(inp.message).then(function (r) {
                return { signedMessage: inp.message, signature: r.signature };
              });
            }));
          }
        }
      }
    };

    var nearWalletStandardObj = {
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
              nearWalletStandardObj.accounts = nearProvider.accountId ? [{
                address: nearProvider.accountId,
                publicKey: nearProvider.publicKey ? decodeB58(nearProvider.publicKey.replace(/^ed25519:/i, '')) : new Uint8Array(32),
                chains: ['near:mainnet'],
                features: ['near:signIn', 'near:signOut', 'near:signMessage', 'near:signAndSendTransaction', 'near:signAndSendTransactions']
              }] : [];
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
            nearProvider.on(ev, fn);
            return function () { nearProvider.removeListener(ev, fn); };
          }
        },
        'near:signIn': {
          version: '1.0.0',
          signIn: function (inp) {
            return nearProvider.requestSignIn(inp || {}).then(function (res) {
              return [{ accountId: (res && res.accountId) || nearProvider.accountId, publicKey: (res && res.publicKey) || nearProvider.publicKey }];
            });
          }
        },
        'near:signOut': {
          version: '1.0.0',
          signOut: function () { return nearProvider.signOut(); }
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
  var nearEmitter = createEmitter();
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
        nearProvider.accountId = (res && res.accountId) || CFG.nearAccountId || '';
        nearProvider.publicKey = (res && res.publicKey) || CFG.nearPublicKey || '';
        nearEmitter.emit('accountsChanged', [nearProvider.accountId]);
        return res;
      });
    },
    signOut: function () {
      return sendBridgeRequest('near', 'signOut', []).then(function () {
        nearProvider.accountId = '';
        nearEmitter.emit('accountsChanged', []);
      });
    },
    signMessage: function (msgParams) {
      var payload = Object.assign({}, msgParams || {});
      if (payload.nonce instanceof Uint8Array) payload.nonce = u8ToB64(payload.nonce);
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
      }
      if (CFG.solanaPublicKey && !window.localStorage.getItem('walletName')) {
        window.localStorage.setItem('walletName', JSON.stringify(CFG.walletName));
      }
      if (CFG.evmAddress && !window.localStorage.getItem('wagmi.connected')) {
        window.localStorage.setItem('wagmi.connected', 'true');
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
      }
      evmEmitter.emit(eventName, parsed);
    } else if (namespace === 'solana') {
      solEmitter.emit(eventName, parsed);
    } else if (namespace === 'near') {
      nearEmitter.emit(eventName, parsed);
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
      url: req.url || (ctx && ctx.url) || '',
      title: req.title || (ctx && ctx.title) || '',
      ...detail
    });
    if (!approved) {
      throw buildRpcError(4001, 'User rejected the request.');
    }
    return true;
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
      if (typeof contracts.ensureWalletSigningKeysAsync === 'function') {
        await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
      }
      const addr = contracts.resolveWalletEvmSender ? contracts.resolveWalletEvmSender(wallet) : wallet.evmAddress;
      const msgRaw = method === 'personal_sign' ? parsePersonalSignParams(params) : (params[1] || '');
      let previewText = String(msgRaw || '');
      const ethersLib = getEthersLib(ctx);
      if (typeof msgRaw === 'string' && msgRaw.startsWith('0x') && ethersLib && ethersLib.getBytes && ethersLib.toUtf8String) {
        try { previewText = ethersLib.toUtf8String(ethersLib.getBytes(msgRaw)); } catch (_) {}
      }

      await ensureApproval(req, ctx, {
        kind: 'signMessage',
        chainLabel: activeChain.cfg.name || activeChain.key.toUpperCase(),
        account: addr || '',
        summary: previewText.slice(0, 600)
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
      if (typeof contracts.ensureWalletSigningKeysAsync === 'function') {
        await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
      }
      const isEvmAddr = (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
      const typedArg = (params[1] !== undefined && !isEvmAddr(params[1])) ? params[1] : params[0];
      let rawTyped = {};
      try {
        rawTyped = typeof typedArg === 'string' ? JSON.parse(typedArg) : (typedArg || {});
      } catch (_) {
        throw buildRpcError(-32602, 'Invalid typed data');
      }
      const cleanTypes = { ...(rawTyped.types || {}) };
      delete cleanTypes.EIP712Domain;
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
      if (typeof contracts.ensureWalletSigningKeysAsync === 'function') {
        await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
      }
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

      await ensureApproval(req, ctx, {
        kind: 'sendTransaction',
        chainLabel: `${txChain.cfg.name || txChain.key.toUpperCase()} (${txChain.cfg.chainId})`,
        account: addr || '',
        summary: `To: ${txReq.to || '(Contract Creation)'}\nValue: ${formattedVal} ${nativeSym}\nData: ${dataHex.slice(0, 128)}${dataHex.length > 128 ? '...' : ''}`
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
    if (typeof contracts.ensureWalletSigningKeysAsync === 'function') {
      await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    }

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

  async function executeSingleNearTx(contracts, creds, wallet, txObj) {
    const receiverId = String((txObj && txObj.receiverId) || '');
    const actions = Array.isArray(txObj && txObj.actions) ? txObj.actions : [];
    if (!receiverId || !actions.length) {
      throw buildRpcError(-32602, 'NEAR transaction requires receiverId and actions');
    }
    if (typeof contracts.signAndSendNearActionsBatch === 'function') {
      const txHash = await contracts.signAndSendNearActionsBatch({
        accountId: creds.accountId,
        publicKeyStr: creds.publicKeyStr,
        privateKeyStr: creds.privateKeyStr,
        receiverId,
        actions,
        wallet
      });
      return { txHash: txHash || '', transactionHashes: txHash ? [txHash] : [] };
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
        const argsJson = typeof argsVal === 'string' ? argsVal : JSON.stringify(argsVal);
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
    return { txHash: hashes[hashes.length - 1] || '', transactionHashes: hashes };
  }

  async function handleNearRequest(req, ctx) {
    const contracts = (ctx && ctx.contracts) || getContractsLib();
    const crypto = (ctx && ctx.crypto) || getCryptoLib();
    const wallet = ctx && ctx.wallet;
    if (!wallet || !contracts || !crypto) throw buildRpcError(4900, 'Wallet or crypto unavailable');
    if (typeof contracts.ensureWalletSigningKeysAsync === 'function') {
      await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    }

    const creds = contracts.getWalletNearSignerCredentials(wallet);
    const method = String(req.method || '').trim();
    const params = Array.isArray(req.params) ? req.params : [];
    const arg0 = params[0] || {};

    if (method === 'getAccountId') {
      return creds.accountId || '';
    }

    if (method === 'requestSignIn') {
      const origin = normalizeOriginLabel(req, ctx);
      const alreadyConnected = Boolean(ctx && typeof ctx.isOriginConnected === 'function' && ctx.isOriginConnected(origin, 'near'));
      const isDisconnected = Boolean(ctx && typeof ctx.isOriginDisconnected === 'function' && ctx.isOriginDisconnected(origin, 'near'));
      if (!alreadyConnected && (!(ctx && ctx.autoConnectOrigin) || isDisconnected)) {
        await ensureApproval(req, ctx, {
          kind: 'connect',
          chainLabel: 'NEAR',
          account: creds.accountId || '',
          summary: `Connect NEAR account (${creds.accountId || '--'})`
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
      const nonceBytes = typeof arg0.nonce === 'string'
        ? crypto.base64ToBytes(arg0.nonce)
        : (arg0.nonce instanceof Uint8Array ? arg0.nonce : new Uint8Array(32));
      await ensureApproval(req, ctx, {
        kind: 'signMessage',
        chainLabel: 'NEAR',
        account: creds.accountId || '',
        summary: `Recipient: ${recipient}\nMessage: ${message.slice(0, 500)}`
      });
      await ensureBiometricAuth(req, ctx);
      return crypto.signNep413IntentMessageAsync({
        message,
        recipient,
        nonceBytes,
        callbackUrl: arg0.callbackUrl || '',
        nearPrivateSeedHex: wallet.nearPrivateSeedHex || wallet.nearPrivateKeyHex,
        nearPublicKey: creds.publicKeyStr
      });
    }

    if (method === 'signAndSendTransaction') {
      await ensureApproval(req, ctx, {
        kind: 'sendTransaction',
        chainLabel: 'NEAR',
        account: creds.accountId || '',
        summary: `To: ${arg0.receiverId || '--'}\nActions: ${JSON.stringify(arg0.actions || []).slice(0, 500)}`
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
    const ns = inferNamespace(req);
    if (ns === 'solana') return handleSolanaRequest(req, ctx);
    if (ns === 'near') return handleNearRequest(req, ctx);
    return handleEvmRequest(req, ctx);
  }

  const api = {
    DAPP_CATALOG,
    DEFAULT_WALLET_ICON,
    sanitizeDAppUrl,
    buildInjectedProviderScript,
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
