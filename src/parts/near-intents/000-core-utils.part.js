// GENERATED FILE: assembled by scripts/build-parts.js from src/parts/near-intents/*.part.js. Edit the parts, then run npm run build.
(function (root) {
  'use strict';

  const NEAR_RPC_URL = 'https://rpc.mainnet.near.org';
  const FASTNEAR_RPC_URL = 'https://free.rpc.fastnear.com';
  const NEAR_RPC_ENDPOINTS = [FASTNEAR_RPC_URL, NEAR_RPC_URL, 'https://1rpc.io/near'];
  const FASTNEAR_API_URL = 'https://api.fastnear.com';
  const ONECLICK_API_URL = 'https://1click.chaindefuser.com/v0';
  const SOLVER_RELAY_URL = 'https://solver-relay-v2.chaindefuser.com/rpc';
  const INTENTS_CONTRACT_ID = 'intents.near';
  const DEFAULT_REFERRAL_ACCOUNT = 'zhic49280.near';
  const APP_FEE_CONFIG = {
    SWAP_CROSS_CHAIN_BPS: 25,
    SWAP_SAME_CHAIN_BPS: 0,
    SEND_CROSS_CHAIN_BPS: 25,
    CONFIDENTIAL_MIN_FEE_USD: 0.01
  };
  const DEFAULT_TIMEOUT_MS = 8000;
  const JUPITER_BASE_URL = (root && root.NEXUS_JUPITER_BASE_URL) || 'https://lite-api.jup.ag';
  const _rpc429Until = root.__nearRpc429Until || (root.__nearRpc429Until = Object.create(null));
  const _rpcInFlight = new Map();
  const _quoteCache = new Map();
  const _quoteInFlight = new Map();
  const _auxSourceCooldown = Object.create(null);
  const _arcKyberPriceCache = new Map();
  const _oneClickQuoteCache = new Map();
  const _oneClickQuoteInFlight = new Map();

  const NETWORK_LABELS = {
    near: 'NEAR Protocol',
    eth: 'Ethereum',
    bsc: 'BNB Smart Chain (BSC)',
    base: 'Base',
    arb: 'Arbitrum One',
    sol: 'Solana',
    tron: 'TRON',
    btc: 'Bitcoin',
    hood: 'Robinhood Chain',
    arc: 'Arc Network',
    qtc: 'Quantus Network',
    hypercore: 'Hyperliquid',
    op: 'Optimism',
    pol: 'Polygon',
    avax: 'Avalanche',
    sui: 'Sui',
    ton: 'TON',
    aptos: 'Aptos',
    bera: 'Berachain',
    gnosis: 'Gnosis',
    scroll: 'Scroll',
    doge: 'Dogecoin',
    xrp: 'XRP Ledger',
    ltc: 'Litecoin',
    bch: 'Bitcoin Cash',
    zec: 'Zcash',
    xlm: 'Stellar',
    ada: 'Cardano'
  };

  let _cachedDefuseTokens = [];

  function safeRequire(relPath) {
    if (typeof require !== 'function') return null;
    try {
      return require(relPath);
    } catch (_) {
      return null;
    }
  }

  function getCryptoEngine() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCACrypto) ||
      (typeof window !== 'undefined' && window.NearCACrypto) ||
      (typeof globalThis !== 'undefined' && globalThis.NearCA && globalThis.NearCA.crypto) ||
      safeRequire('./crypto-engine.js')
    );
  }

  function getTokenRegistry() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCATokens) ||
      (typeof window !== 'undefined' && window.NearCATokens) ||
      (typeof globalThis !== 'undefined' && globalThis.NearCA && globalThis.NearCA.tokens) ||
      safeRequire('./token-registry.js')
    );
  }

  function getContractsEngine() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCAContracts) ||
      (typeof window !== 'undefined' && window.NearCAContracts) ||
      (typeof globalThis !== 'undefined' && globalThis.NearCA && globalThis.NearCA.contracts) ||
      safeRequire('./chain-contracts.js')
    );
  }

  function getLang() {
    const lang =
      (typeof globalThis !== 'undefined' && globalThis.NearCAState && globalThis.NearCAState.lang) ||
      (typeof globalThis !== 'undefined' && globalThis.state && globalThis.state.currentLang) ||
      'en';
    return String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function t(zh, en) {
    return getLang() === 'zh' ? zh : en;
  }

  function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(arr).toString('base64');
    }
    let bin = '';
    for (let i = 0; i < arr.length; i++) {
      bin += String.fromCharCode(arr[i]);
    }
    return btoa(bin);
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(String(str));
    return bytesToBase64(bytes);
  }

  function normalizeDecimalInput(value) {
    const str = String(value === undefined || value === null ? '' : value).trim();
    if (!str) return '';
    if (!/[eE]/.test(str)) return str;
    const match = str.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
    if (!match) return str;
    const sign = match[1] === '-' ? '-' : '';
    const intPart = match[2];
    const fracPart = match[3] || '';
    const exp = parseInt(match[4], 10);
    const digits = intPart + fracPart;
    const pointPos = intPart.length + exp;
    if (pointPos <= 0) {
      return sign + '0.' + '0'.repeat(-pointPos) + digits;
    }
    if (pointPos >= digits.length) {
      return sign + digits + '0'.repeat(pointPos - digits.length);
    }
    return sign + digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
  }

  function toBaseUnits(amountInput, decimals) {
    const dec = Number.isInteger(decimals) && decimals >= 0 ? decimals : (Number(decimals) || 0);
    const normalized = normalizeDecimalInput(amountInput);
    if (!normalized || normalized.startsWith('-')) return '0';
    const num = Number(normalized);
    if (!Number.isFinite(num) || num <= 0) return '0';
    const parts = normalized.replace(/^\+/, '').split('.');
    const whole = (parts[0] || '0').replace(/\D/g, '') || '0';
    const fracRaw = (parts[1] || '').replace(/\D/g, '');
    const frac = fracRaw.slice(0, dec).padEnd(dec, '0');
    const combined = (whole + frac).replace(/^0+/, '');
    return combined || '0';
  }

  function fromBaseUnits(baseStr, decimals) {
    const dec = Number.isInteger(decimals) && decimals >= 0 ? decimals : (Number(decimals) || 0);
    const raw = String(baseStr === undefined || baseStr === null ? '0' : baseStr).trim();
    if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) return '0';
    if (dec === 0) return raw.replace(/^0+/, '') || '0';
    const padded = raw.padStart(dec + 1, '0');
    const splitIdx = padded.length - dec;
    const whole = padded.slice(0, splitIdx).replace(/^0+/, '') || '0';
    const frac = padded.slice(splitIdx).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) {
      throw new Error('fetch API unavailable');
    }
    const extSignal = options && options.signal ? options.signal : null;
    if (extSignal && extSignal.aborted) {
      const abortErr = new Error(t('请求已取消', 'Request aborted'));
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = controller
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;
    let combinedSignal = controller ? controller.signal : extSignal || undefined;
    let onExtAbort = null;
    if (extSignal && controller) {
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
        try {
          combinedSignal = AbortSignal.any([extSignal, controller.signal]);
        } catch (_) {
          onExtAbort = () => controller.abort();
          extSignal.addEventListener('abort', onExtAbort, { once: true });
        }
      } else {
        onExtAbort = () => controller.abort();
        extSignal.addEventListener('abort', onExtAbort, { once: true });
      }
    }
    try {
      const { signal: _ignoredSignal, ...restOptions } = options || {};
      const res = await fetchFn(url, {
        ...restOptions,
        signal: combinedSignal,
        headers: {
          Accept: 'application/json',
          ...((options && options.headers) || {})
        }
      });
      const text = typeof res.text === 'function' ? await res.text() : '';
      let parsed = null;
      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch (_) {
          parsed = null;
        }
      } else if (typeof res.json === 'function') {
        parsed = await res.json().catch(() => null);
      }
      return { ok: !!res.ok, status: res.status || 0, statusText: res.statusText || '', data: parsed, rawText: text };
    } catch (err) {
      if (err && (err.name === 'AbortError' || String(err.message || '').includes('abort'))) {
        const timeoutErr = new Error(timedOut ? t('网络请求超时', 'Request timeout') : t('请求已取消', 'Request aborted'));
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      if (extSignal && onExtAbort) {
        try { extSignal.removeEventListener('abort', onExtAbort); } catch (_) {}
      }
    }
  }

  function resolveTokenDecimals(assetId, blockchainHint = '') {
    const idStr = String(assetId || '');
    const idLower = idStr.toLowerCase();
    const registry = getTokenRegistry();
    if (registry) {
      const lookupFn = registry.findTokenByAssetId || registry.getTokenByAssetId;
      if (typeof lookupFn === 'function') {
        const found = blockchainHint ? lookupFn(idStr, blockchainHint) : lookupFn(idStr);
        if (found && typeof found.decimals === 'number') return found.decimals;
      }
      const collections = [
        registry.UNIFIED_CORE_TOKENS,
        registry.ALL_DEFUSE_TOKENS,
        registry.CORE_TOKENS,
        registry.PEARL_DEFUSE_TOKEN ? [registry.PEARL_DEFUSE_TOKEN] : null,
        ...(registry.DEX_CHAIN_TOKENS ? Object.values(registry.DEX_CHAIN_TOKENS) : [])
      ];
      for (const col of collections) {
        if (Array.isArray(col)) {
          const hit = col.find((item) => {
            if (!item || String(item.assetId || '').toLowerCase() !== idLower) return false;
            if (blockchainHint && item.blockchain) {
              return String(item.blockchain).toLowerCase() === String(blockchainHint).toLowerCase();
            }
            return true;
          });
          if (hit && typeof hit.decimals === 'number') return hit.decimals;
        }
      }
    }
    const cachedHit = _cachedDefuseTokens.find((item) => item && String(item.assetId || '').toLowerCase() === idLower);
    if (cachedHit && typeof cachedHit.decimals === 'number') return cachedHit.decimals;

    if (idLower === 'nep141:wrap.near' || idLower === 'near') return 24;
    if (idLower.includes('prl.omft.near')) return 8;
    if (idLower.includes('qtc.omft.near')) return 12;
    if (idLower.includes('btc.omft.near')) return 8;
    if (idLower.includes('sol.omft.near')) return 9;
    if (idLower.includes('eth.omft.near') || idLower.includes('eth.bridge.near')) return 18;
    if (idLower.includes('tron-') || idLower === 'nep141:usdt.tether-token.near' || idLower === NEAR_USDC_ASSET_ID || (idLower.startsWith('nep141:') && (idLower.includes('usdt') || idLower.includes('usdc')))) {
      return 6;
    }
    return 18;
  }

  function isUnknownNearAccountError(rpcError) {
    if (!rpcError) return false;
    const causeName = rpcError.cause && rpcError.cause.name ? String(rpcError.cause.name) : '';
    if (causeName === 'UNKNOWN_ACCOUNT') return true;
    const serialized = JSON.stringify(rpcError);
    return serialized.includes('UNKNOWN_ACCOUNT') || serialized.includes('does not exist while viewing');
  }

  function isDeterministicNearRpcError(rpcError) {
    if (!rpcError) return false;
    if (isUnknownNearAccountError(rpcError)) return true;
    const serialized = JSON.stringify(rpcError);
    return /MethodNotFound|ExecutionError|ContractExecutionError|AccountDoesNotExist|HostError/i.test(serialized);
  }

  async function _execNearRpcQueryWithFallback(body, timeoutMs, signal = null) {
    const now = Date.now();
    let ordered = NEAR_RPC_ENDPOINTS.filter((u) => !(_rpc429Until[u] > now));
    if (ordered.length === 0) ordered = NEAR_RPC_ENDPOINTS.slice();
    let lastResp = null;
    for (const rpcUrl of ordered) {
      if (signal && signal.aborted) {
        const abortErr = new Error(t('请求已取消', 'Request aborted'));
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      try {
        const resp = await fetchJsonWithTimeout(
          rpcUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            signal: signal || undefined
          },
          timeoutMs
        );
        if (resp && (resp.status === 401 || resp.status === 403 || resp.status === 408 || resp.status === 410 || resp.status === 429 || resp.status >= 500)) {
          _rpc429Until[rpcUrl] = Date.now() + 90_000;
          lastResp = resp;
          continue;
        }
        if (!resp || !resp.ok || !resp.data) {
          if (resp && !resp.ok) _rpc429Until[rpcUrl] = Date.now() + 30_000;
          lastResp = resp;
          continue;
        }
        if (resp.data.error) {
          if (isDeterministicNearRpcError(resp.data.error)) return resp;
          _rpc429Until[rpcUrl] = Date.now() + 30_000;
          lastResp = resp;
          continue;
        }
        return resp;
      } catch (err) {
        if (signal && signal.aborted) {
          const abortErr = new Error(t('请求已取消', 'Request aborted'));
          abortErr.name = 'AbortError';
          throw abortErr;
        }
        _rpc429Until[rpcUrl] = Date.now() + 90_000;
      }
    }
    return lastResp;
  }

  async function nearRpcQueryWithFallback(payloadObj, timeoutMs = 4500, signal = null) {
    if (signal && signal.aborted) {
      const abortErr = new Error(t('请求已取消', 'Request aborted'));
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const body = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);
    let entry = _rpcInFlight.get(body);
    if (!entry) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const promise = _execNearRpcQueryWithFallback(body, timeoutMs, ctrl ? ctrl.signal : null).finally(() => {
        if (_rpcInFlight.get(body) === entry) _rpcInFlight.delete(body);
      });
      entry = { promise, ctrl, waiters: 0 };
      _rpcInFlight.set(body, entry);
    }
    entry.waiters += 1;
    if (!signal) {
      return entry.promise.finally(() => {
        entry.waiters = Math.max(0, entry.waiters - 1);
      });
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (onAbort) {
          try { signal.removeEventListener('abort', onAbort); } catch (_) {}
        }
      };
      const onAbort = () => {
        if (settled) return;
        settled = true;
        cleanup();
        entry.waiters = Math.max(0, entry.waiters - 1);
        if (entry.waiters === 0 && entry.ctrl && !entry.ctrl.signal.aborted) {
          try { entry.ctrl.abort(); } catch (_) {}
        }
        const abortErr = new Error(t('请求已取消', 'Request aborted'));
        abortErr.name = 'AbortError';
        reject(abortErr);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      entry.promise.then(
        (res) => {
          if (settled) return;
          settled = true;
          cleanup();
          entry.waiters = Math.max(0, entry.waiters - 1);
          resolve(res);
        },
        (err) => {
          if (settled) return;
          settled = true;
          cleanup();
          entry.waiters = Math.max(0, entry.waiters - 1);
          reject(err);
        }
      );
    });
  }

  /**
   * Queries NEAR Mainnet view_account for a named (.near) or 64-hex implicit account.
   * Returns NEAR balance as a number, 0 if UNKNOWN_ACCOUNT, or null if RPC fails.
   */
  async function fetchNearNativeBalance(nearAccountId) {
    const accountId = String(nearAccountId || '').trim();
    if (!accountId) return 0;

    const resp = await nearRpcQueryWithFallback(
      {
        jsonrpc: '2.0',
        id: 'near-view-account',
        method: 'query',
        params: {
          request_type: 'view_account',
          finality: 'final',
          account_id: accountId
        }
      },
      5000
    ).catch(() => null);

    if (!resp || !resp.ok || !resp.data) return null;
    if (resp.data.error) {
      return isUnknownNearAccountError(resp.data.error) ? 0 : null;
    }
    if (resp.data.result && resp.data.result.amount !== undefined) {
      return Number(fromBaseUnits(String(resp.data.result.amount), 24));
    }
    return null;
  }

