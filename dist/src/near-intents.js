(function (root) {
  'use strict';

  const NEAR_RPC_URL = 'https://rpc.mainnet.near.org';
  const FASTNEAR_RPC_URL = 'https://free.rpc.fastnear.com';
  const ONECLICK_API_URL = 'https://1click.chaindefuser.com/v0';
  const SOLVER_RELAY_URL = 'https://solver-relay-v2.chaindefuser.com/rpc';
  const INTENTS_CONTRACT_ID = 'intents.near';
  const DEFAULT_REFERRAL_ACCOUNT = 'zhic49280.near';
  const DEFAULT_TIMEOUT_MS = 8000;

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
    qtc: 'Quantus Mainnet (需填 qz... 地址)',
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
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchFn(url, {
        ...options,
        signal: options.signal || (controller ? controller.signal : undefined),
        headers: {
          Accept: 'application/json',
          ...(options.headers || {})
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
        const timeoutErr = new Error(t('网络请求超时', 'Request timeout'));
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function resolveTokenDecimals(assetId) {
    const idStr = String(assetId || '');
    const idLower = idStr.toLowerCase();
    const registry = getTokenRegistry();
    if (registry) {
      const lookupFn = registry.findTokenByAssetId || registry.getTokenByAssetId;
      if (typeof lookupFn === 'function') {
        const found = lookupFn(idStr);
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
          const hit = col.find((item) => item && String(item.assetId || '').toLowerCase() === idLower);
          if (hit && typeof hit.decimals === 'number') return hit.decimals;
        }
      }
    }
    const cachedHit = _cachedDefuseTokens.find((item) => item && String(item.assetId || '').toLowerCase() === idLower);
    if (cachedHit && typeof cachedHit.decimals === 'number') return cachedHit.decimals;

    if (idLower === 'nep141:wrap.near' || idLower === 'near') return 24;
    if (idLower.includes('btc.omft.near')) return 8;
    if (idLower.includes('sol.omft.near')) return 9;
    if (idLower.includes('eth.omft.near') || idLower.includes('eth.bridge.near')) return 18;
    if (idLower.includes('usdt') || idLower.includes('usdc') || idLower.includes('tron-')) return 6;
    return 18;
  }

  function isUnknownNearAccountError(rpcError) {
    if (!rpcError) return false;
    const causeName = rpcError.cause && rpcError.cause.name ? String(rpcError.cause.name) : '';
    if (causeName === 'UNKNOWN_ACCOUNT') return true;
    const serialized = JSON.stringify(rpcError);
    return serialized.includes('UNKNOWN_ACCOUNT') || serialized.includes('does not exist while viewing');
  }

  /**
   * Queries NEAR Mainnet view_account for a named (.near) or 64-hex implicit account.
   * Returns NEAR balance as a number, 0 if UNKNOWN_ACCOUNT, or null if RPC fails.
   */
  async function fetchNearNativeBalance(nearAccountId) {
    const accountId = String(nearAccountId || '').trim();
    if (!accountId) return 0;

    try {
      const resp = await fetchJsonWithTimeout(
        NEAR_RPC_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'near-view-account',
            method: 'query',
            params: {
              request_type: 'view_account',
              finality: 'final',
              account_id: accountId
            }
          })
        },
        DEFAULT_TIMEOUT_MS
      );

      if (!resp.ok || !resp.data) return null;
      if (resp.data.error) {
        return isUnknownNearAccountError(resp.data.error) ? 0 : null;
      }
      if (resp.data.result && resp.data.result.amount !== undefined) {
        return Number(fromBaseUnits(String(resp.data.result.amount), 24));
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  const DEFAULT_NEAR_NEP141_CONTRACTS = {
    'prl.omft.near': 8,
    'qtc.omft.near': 12,
    'usdt.tether-token.near': 6,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': 6,
    'eth.omft.near': 18,
    'sol.omft.near': 9,
    'btc.omft.near': 8,
    'token.rhealab.near': 18,
    'lst.rhealab.near': 24,
    'xtoken.rhealab.near': 18,
    'otoken.rhealab.near': 18,
    'meta-pool.near': 24,
    'linear-protocol.near': 24,
    'v2-nearx.stader-labs.near': 24
  };

  function normalizeNep141ContractsInput(contractsMap) {
    if (!contractsMap) return { ...DEFAULT_NEAR_NEP141_CONTRACTS };
    if (Array.isArray(contractsMap)) {
      const out = {};
      for (const item of contractsMap) {
        if (typeof item === 'string' && item.trim()) {
          const cid = item.trim();
          out[cid] = DEFAULT_NEAR_NEP141_CONTRACTS[cid] !== undefined
            ? DEFAULT_NEAR_NEP141_CONTRACTS[cid]
            : resolveTokenDecimals(`nep141:${cid}`);
        } else if (item && item.contractId) {
          out[String(item.contractId).trim()] = typeof item.decimals === 'number' ? item.decimals : 18;
        }
      }
      return out;
    }
    if (typeof contractsMap === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(contractsMap)) {
        if (k) out[String(k).trim()] = typeof v === 'number' ? v : (Number(v) || 18);
      }
      return out;
    }
    return { ...DEFAULT_NEAR_NEP141_CONTRACTS };
  }

  /**
   * Queries real NEP-141 token contracts on the NEAR blockchain via `ft_balance_of`.
   * Returns { [contractId]: { raw: string, formatted: number } } or null if RPC fails across all contracts.
   */
  async function fetchNearNep141Balances(nearAccountId, contractsMap = DEFAULT_NEAR_NEP141_CONTRACTS) {
    const accountId = String(nearAccountId || '').trim();
    const map = normalizeNep141ContractsInput(contractsMap);
    const entries = Object.entries(map);
    if (!accountId || entries.length === 0) return {};

    const argsBase64 = utf8ToBase64(JSON.stringify({ account_id: accountId }));
    const results = {};
    let anySuccess = false;

    await Promise.all(
      entries.map(async ([contractId, decimals]) => {
        try {
          const resp = await fetchJsonWithTimeout(
            NEAR_RPC_URL,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `nep141-bal-${contractId}`,
                method: 'query',
                params: {
                  request_type: 'call_function',
                  finality: 'final',
                  account_id: contractId,
                  method_name: 'ft_balance_of',
                  args_base64: argsBase64
                }
              })
            },
            DEFAULT_TIMEOUT_MS
          );

          if (!resp.ok || !resp.data) return;
          if (resp.data.error) {
            if (isUnknownNearAccountError(resp.data.error)) {
              anySuccess = true;
              results[contractId] = { raw: '0', formatted: 0 };
            }
            return;
          }
          const rawByteArray = resp.data.result && resp.data.result.result;
          if (!Array.isArray(rawByteArray)) return;

          const decodedText = new TextDecoder().decode(new Uint8Array(rawByteArray));
          const parsedVal = JSON.parse(decodedText);
          const raw = parsedVal !== null && parsedVal !== undefined ? String(parsedVal) : '0';
          const formatted = Number(fromBaseUnits(raw, decimals));
          anySuccess = true;
          results[contractId] = {
            raw,
            formatted: Number.isFinite(formatted) ? formatted : 0
          };
        } catch (_) {}
      })
    );

    return anySuccess ? results : null;
  }

  /**
   * Queries intents.near mt_batch_balance_of for unified multi-token balances.
   * Returns { [assetId]: { raw: string, formatted: number } } or null on RPC failure.
   */
  async function fetchIntentsUnifiedBalances(nearAccountId, assetIds = []) {
    const accountId = String(nearAccountId || '').trim();
    if (!accountId || !Array.isArray(assetIds) || assetIds.length === 0) {
      return {};
    }

    const argsBase64 = utf8ToBase64(
      JSON.stringify({
        account_id: accountId,
        token_ids: assetIds
      })
    );

    try {
      const resp = await fetchJsonWithTimeout(
        NEAR_RPC_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'intents-mt-batch-balance',
            method: 'query',
            params: {
              request_type: 'call_function',
              finality: 'final',
              account_id: INTENTS_CONTRACT_ID,
              method_name: 'mt_batch_balance_of',
              args_base64: argsBase64
            }
          })
        },
        DEFAULT_TIMEOUT_MS
      );

      if (!resp.ok || !resp.data || resp.data.error) {
        return null;
      }
      const rawByteArray = resp.data.result && resp.data.result.result;
      if (!Array.isArray(rawByteArray)) {
        return null;
      }

      const decodedText = new TextDecoder().decode(new Uint8Array(rawByteArray));
      const balances = JSON.parse(decodedText);
      if (!Array.isArray(balances)) {
        return null;
      }

      const result = {};
      for (let i = 0; i < assetIds.length; i++) {
        const assetId = assetIds[i];
        const raw = balances[i] !== undefined && balances[i] !== null ? String(balances[i]) : '0';
        const decimals = resolveTokenDecimals(assetId);
        const formatted = Number(fromBaseUnits(raw, decimals));
        result[assetId] = {
          raw,
          formatted: Number.isFinite(formatted) ? formatted : 0
        };
      }
      return result;
    } catch (_) {
      return null;
    }
  }

  function normalizeDefuseToken(item) {
    const bc = String(item.blockchain || '').toLowerCase();
    let netLabel = NETWORK_LABELS[bc] || bc.toUpperCase();
    if (bc === 'hypercore') {
      if (String(item.assetId || '').includes(':hip1:')) netLabel = 'Hyperliquid (Spot)';
      else if (String(item.assetId || '').includes(':erc20:')) netLabel = 'Hyperliquid (HyperEVM)';
    }
    const parsedPrice = item.price !== null && item.price !== undefined ? Number(item.price) : NaN;
    const price = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;

    return {
      symbol: item.symbol || 'TOKEN',
      name: item.name || item.symbol || 'Token',
      blockchain: bc,
      assetId: item.assetId,
      decimals: typeof item.decimals === 'number' ? item.decimals : (Number(item.decimals) || 18),
      contractAddress: item.contractAddress || null,
      coingeckoId: item.coingeckoId || null,
      price,
      priceUpdatedAt: item.priceUpdatedAt || null,
      networkName: netLabel
    };
  }

  const SOL_DEXSCREENER_MINTS = [
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
    '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump',
    '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
    'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
    'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',
    'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS',
    'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7',
    'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs',
    '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ'
  ];
  const EVM_NATIVE_SENTINEL_LOWER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

  const DEAD_ONECLICK_SYMBOL_REGEX = /^(SSC1_PIT|FOGO|TITN|INX|ADI|VVV|TLO|FMS|TMU|NZHIPU|STJACK|STRKBTC|KV-GTSOLB|GTUSDCP|SPARKUSDC|MWUSDC|LAUSDC|SUSDC|STEAKUSDC|USAD|USDCX|HEMIBTC)$/i;
  const _nearFtIconCache = new Map();

  async function fetchNearFtMetadataIcons(nearTokens, sanitizeImg) {
    const byContract = Object.create(null);
    const bySymbol = Object.create(null);
    if (!Array.isArray(nearTokens) || nearTokens.length === 0) return { byContract, bySymbol };

    const skipContracts = new Set([
      'wrap.near',
      'eth.bridge.near',
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      'usdt.tether-token.near',
      'prl.omft.near',
      'qtc.omft.near'
    ]);

    const pending = [];
    for (const tok of nearTokens) {
      if (!tok || !tok.contractAddress) continue;
      const cid = String(tok.contractAddress).trim();
      const cidLower = cid.toLowerCase();
      const symUpper = String(tok.symbol || '').trim().replace(/^\$/, '').toUpperCase();
      if (!cid || skipContracts.has(cidLower)) continue;
      if (_nearFtIconCache.has(cidLower)) {
        const cachedIcon = _nearFtIconCache.get(cidLower);
        if (cachedIcon) {
          byContract[cidLower] = cachedIcon;
          if (symUpper && !bySymbol[symUpper]) bySymbol[symUpper] = cachedIcon;
        }
        continue;
      }
      pending.push({ cid, cidLower, symUpper });
    }

    if (pending.length > 0) {
      await Promise.allSettled(
        pending.map(async ({ cid, cidLower, symUpper }) => {
          const payload = JSON.stringify({
            jsonrpc: '2.0',
            id: `ft_meta_${cidLower}`,
            method: 'query',
            params: {
              request_type: 'call_function',
              finality: 'final',
              account_id: cid,
              method_name: 'ft_metadata',
              args_base64: 'e30='
            }
          });
          let resp = await fetchJsonWithTimeout(
            FASTNEAR_RPC_URL,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload },
            5000
          ).catch(() => null);
          if (!resp || !resp.ok || !resp.data?.result?.result) {
            resp = await fetchJsonWithTimeout(
              NEAR_RPC_URL,
              { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload },
              5000
            ).catch(() => null);
          }
          const rawBytes = resp && resp.ok && resp.data && resp.data.result && Array.isArray(resp.data.result.result)
            ? resp.data.result.result
            : null;
          if (!rawBytes) return;
          const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(rawBytes)));
          const rawIcon = meta && typeof meta.icon === 'string' ? meta.icon.trim() : '';
          if (!rawIcon || rawIcon.includes('R0lGODlhAQABAIAAAAAAAP') || /ref-new-1\.s3\.amazonaws\.com/i.test(rawIcon)) {
            return;
          }
          const safe = sanitizeImg(rawIcon);
          if (safe) {
            _nearFtIconCache.set(cidLower, safe);
            byContract[cidLower] = safe;
            if (symUpper && !bySymbol[symUpper]) bySymbol[symUpper] = safe;
          }
        })
      );
    }

    return { byContract, bySymbol };
  }

  /**
   * Searches live Solana tokens on Jupiter V2 Search API (`lite-api.jup.ag/tokens/v2/search`).
   */
  async function searchJupiterTokensV2(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    try {
      const resp = await fetchJsonWithTimeout(
        `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(q)}`,
        {},
        DEFAULT_TIMEOUT_MS
      );
      if (!resp.ok || !Array.isArray(resp.data)) return [];
      const registry = getTokenRegistry();
      const sanitizeImg = (registry && typeof registry.sanitizeImageUrl === 'function')
        ? registry.sanitizeImageUrl
        : (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
      const symIcons = {};
      const out = [];
      for (const item of resp.data) {
        if (!item || !item.id || !item.symbol) continue;
        const symClean = String(item.symbol).trim();
        const safeIcon = sanitizeImg(item.icon);
        if (safeIcon) symIcons[symClean] = safeIcon;
        const parsedPrice = Number(item.usdPrice);
        const isXStock = /xstock/i.test(item.name || '') || /x$/i.test(symClean) && /^Xs|^Xsc|^Xsb|^Xsp|^Xsa|^Xso/i.test(item.id);
        out.push({
          symbol: symClean,
          name: item.name || symClean,
          blockchain: 'sol',
          assetId: item.id,
          contractAddress: item.id,
          decimals: typeof item.decimals === 'number' ? item.decimals : 6,
          networkName: isXStock ? 'Solana (xStocks)' : 'Solana',
          category: isXStock ? 'xstock' : undefined,
          logoURI: safeIcon || '',
          price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null
        });
      }
      if (registry && typeof registry.registerDynamicTokenIcons === 'function') {
        registry.registerDynamicTokenIcons(symIcons, {});
      }
      return out;
    } catch (_) {
      return [];
    }
  }

  /**
   * Fetches live token catalog & prices from 1Click Defuse API plus DexScreener, Prlscan, Hyperliquid,
   * Ref Finance, CoinGecko & Jupiter V2 xStocks. Never uses hardcoded fake fallback prices.
   */
  async function fetchLiveDefuseTokenPrices() {
    try {
      const registryEarly = getTokenRegistry();
      const arcAddrsForDex = ((registryEarly && registryEarly.DEX_CHAIN_TOKENS && registryEarly.DEX_CHAIN_TOKENS.arc) || [])
        .map((t) => String(t && t.contractAddress || '').trim())
        .filter((a) => a && a.toLowerCase() !== ARC_USDC_CONTRACT && a.toLowerCase() !== EVM_NATIVE_SENTINEL_LOWER);
      const arcDexUrl = arcAddrsForDex.length > 0
        ? `https://api.dexscreener.com/latest/dex/tokens/${arcAddrsForDex.join(',')}`
        : null;

      const [oneClickRes, dexRes, prlRes, hlRes, refListRes, cgRes, xStockRes, kyberTokRes, arcscanTokRes, refPriceRes, arcDexRes] = await Promise.allSettled([
        fetchJsonWithTimeout(`${ONECLICK_API_URL}/tokens`, {}, DEFAULT_TIMEOUT_MS),
        fetchJsonWithTimeout(
          `https://api.dexscreener.com/latest/dex/tokens/${SOL_DEXSCREENER_MINTS.join(',')}`,
          {},
          DEFAULT_TIMEOUT_MS
        ).catch(() => null),
        fetchJsonWithTimeout('https://api.prlscan.com/v1/market/prl', {}, DEFAULT_TIMEOUT_MS).catch(() => null),
        fetchJsonWithTimeout(
          'https://api.hyperliquid.xyz/info',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'allMids' }) },
          DEFAULT_TIMEOUT_MS
        ).catch(() => null),
        fetchJsonWithTimeout('https://indexer.ref.finance/list-token', {}, DEFAULT_TIMEOUT_MS).catch(() => null),
        fetchJsonWithTimeout('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=1', {}, DEFAULT_TIMEOUT_MS).catch(() => null),
        fetchJsonWithTimeout('https://lite-api.jup.ag/tokens/v2/search?query=xStock', {}, DEFAULT_TIMEOUT_MS).catch(() => null),
        fetchJsonWithTimeout(
          'https://ks-setting.kyberswap.com/api/v1/tokens?chainIds=5042,1,8453,42161,56,999&page=1&pageSize=100&isWhitelisted=true',
          {},
          5000
        ).catch(() => null),
        fetchJsonWithTimeout('https://li.quest/v1/tokens?chains=5042', {}, 5000).catch(() => null),
        fetchJsonWithTimeout('https://indexer.ref.finance/list-token-price', {}, DEFAULT_TIMEOUT_MS).catch(() => null),
        arcDexUrl ? fetchJsonWithTimeout(arcDexUrl, {}, 5000).catch(() => null) : Promise.resolve(null)
      ]);

      const resp = oneClickRes.status === 'fulfilled' ? oneClickRes.value : null;
      if (!resp || !resp.ok || !Array.isArray(resp.data)) {
        return null;
      }

      const normalizedList = [];
      const byAssetId = new Map();
      const byContract = new Map();
      const bySymbol = new Map();

      for (const rawItem of resp.data) {
        if (!rawItem || !rawItem.assetId) continue;
        const rawSym = String(rawItem.symbol || '').trim();
        if (/DEPRECATED|TESTNEBULA/i.test(`${rawSym} ${rawItem.assetId || ''} ${rawItem.name || ''}`)) {
          continue;
        }
        if (DEAD_ONECLICK_SYMBOL_REGEX.test(rawSym)) continue;
        const norm = normalizeDefuseToken(rawItem);
        normalizedList.push(norm);
        byAssetId.set(String(norm.assetId).toLowerCase(), norm);

        const contractLower = String(norm.contractAddress || '').trim().toLowerCase();
        if (contractLower && contractLower !== EVM_NATIVE_SENTINEL_LOWER && !byContract.has(contractLower)) {
          byContract.set(contractLower, norm);
        }

        const symUpper = String(norm.symbol || '').trim().replace(/^\$/, '').toUpperCase();
        if (symUpper && norm.price !== null && norm.price > 0 && !bySymbol.has(symUpper)) {
          bySymbol.set(symUpper, norm);
        }
      }

      // Build Jupiter V2 xStock live prices & icons
      const jupXStockByMint = Object.create(null);
      const jupXStockBySym = Object.create(null);
      const jupXStockIcons = Object.create(null);
      const xStockData = xStockRes.status === 'fulfilled' && xStockRes.value?.ok ? xStockRes.value.data : null;
      if (Array.isArray(xStockData)) {
        for (const xs of xStockData) {
          if (!xs || !xs.id) continue;
          const mintLower = String(xs.id).trim().toLowerCase();
          const symClean = String(xs.symbol || '').trim().toUpperCase();
          const usdPrice = Number(xs.usdPrice);
          if (Number.isFinite(usdPrice) && usdPrice > 0) {
            jupXStockByMint[mintLower] = usdPrice;
            if (symClean) jupXStockBySym[symClean] = usdPrice;
          }
          if (xs.icon && symClean) {
            jupXStockIcons[symClean] = String(xs.icon).trim();
          }
        }
      }

      // Build Ref Finance & CoinGecko icon catalogs (safe URLs only)
      const registry = getTokenRegistry();
      const sanitizeImg = (registry && typeof registry.sanitizeImageUrl === 'function')
        ? registry.sanitizeImageUrl
        : (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

      const refIconByContract = Object.create(null);
      const refIconBySymbol = Object.create(null);
      const refData = refListRes.status === 'fulfilled' && refListRes.value?.ok ? refListRes.value.data : null;
      if (refData && typeof refData === 'object' && !Array.isArray(refData)) {
        for (const [cid, info] of Object.entries(refData)) {
          if (!info || typeof info !== 'object') continue;
          const safeIcon = sanitizeImg(info.icon);
          if (!safeIcon || /ref-new-1\.s3\.amazonaws\.com/i.test(safeIcon)) continue;
          const cidLower = String(cid).trim().toLowerCase();
          if (cidLower && !refIconByContract[cidLower]) refIconByContract[cidLower] = safeIcon;
          const symClean = String(info.symbol || '').trim().replace(/^\$/, '').toUpperCase();
          if (symClean && !refIconBySymbol[symClean]) refIconBySymbol[symClean] = safeIcon;
        }
      }

      const cgImageById = Object.create(null);
      const cgImageBySymbol = Object.create(null);
      const cgData = cgRes.status === 'fulfilled' && cgRes.value?.ok ? cgRes.value.data : null;
      if (Array.isArray(cgData)) {
        for (const coin of cgData) {
          if (!coin || typeof coin !== 'object') continue;
          const safeImg = sanitizeImg(coin.image);
          if (!safeImg) continue;
          const cgId = String(coin.id || '').trim().toLowerCase();
          if (cgId && !cgImageById[cgId]) cgImageById[cgId] = safeImg;
          const symClean = String(coin.symbol || '').trim().replace(/^\$/, '').toUpperCase();
          if (symClean && !cgImageBySymbol[symClean]) cgImageBySymbol[symClean] = safeImg;
        }
      }

      const nearCuratedList = (registry && registry.DEX_CHAIN_TOKENS && Array.isArray(registry.DEX_CHAIN_TOKENS.near))
        ? registry.DEX_CHAIN_TOKENS.near
        : [];
      const nearFtMetaIcons = await fetchNearFtMetadataIcons(
        [
          ...normalizedList.filter((item) => item && item.blockchain === 'near' && item.contractAddress),
          ...nearCuratedList.filter((item) => item && item.blockchain === 'near' && item.contractAddress)
        ],
        sanitizeImg
      ).catch(() => ({ byContract: Object.create(null), bySymbol: Object.create(null) }));

      const refPriceByContract = Object.create(null);
      const refPriceData = refPriceRes.status === 'fulfilled' && refPriceRes.value?.ok ? refPriceRes.value.data : null;
      if (refPriceData && typeof refPriceData === 'object') {
        for (const [cid, info] of Object.entries(refPriceData)) {
          const pNum = Number(info && info.price);
          if (cid && Number.isFinite(pNum) && pNum > 0) {
            refPriceByContract[String(cid).trim().toLowerCase()] = pNum;
          }
        }
      }

      const resolveTokenLogo = (tok) => {
        if (!tok) return '';
        const existing = sanitizeImg(tok.logoURI);
        if (existing) return existing;
        const symClean = String(tok.symbol || '').trim().replace(/^\$/, '').toUpperCase();
        const contractLower = String(tok.contractAddress || '').trim().toLowerCase();
        const cgIdLower = String(tok.coingeckoId || '').trim().toLowerCase();
        const iconMapUrl = registry && registry.TOKEN_ICON_MAP
          ? sanitizeImg(registry.TOKEN_ICON_MAP[symClean] || registry.TOKEN_ICON_MAP[String(tok.symbol || '').trim().toUpperCase()])
          : '';
        return (
          iconMapUrl ||
          (contractLower ? nearFtMetaIcons.byContract[contractLower] : '') ||
          nearFtMetaIcons.bySymbol[symClean] ||
          (contractLower ? refIconByContract[contractLower] : '') ||
          refIconBySymbol[symClean] ||
          (cgIdLower ? cgImageById[cgIdLower] : '') ||
          cgImageBySymbol[symClean] ||
          ''
        );
      };

      // Supplemental live DEX prices for Solana tokens (JUP, JitoSOL, BONK, WIF) not on 1Click
      const dexPriceByMint = new Map();
      const dexData = dexRes.status === 'fulfilled' && dexRes.value?.ok ? dexRes.value.data : null;
      if (dexData && Array.isArray(dexData.pairs)) {
        const bestLiqByMint = new Map();
        for (const pair of dexData.pairs) {
          const mintLower = String(pair?.baseToken?.address || '').trim().toLowerCase();
          const priceUsd = Number(pair?.priceUsd);
          const liqUsd = Number(pair?.liquidity?.usd || 0);
          if (!mintLower || !Number.isFinite(priceUsd) || priceUsd <= 0) continue;
          const prevLiq = bestLiqByMint.get(mintLower) || -1;
          if (liqUsd >= prevLiq) {
            bestLiqByMint.set(mintLower, liqUsd);
            dexPriceByMint.set(mintLower, priceUsd);
          }
        }
      }

      // Supplemental live PRL price from Prlscan
      let prlLivePrice = null;
      const prlData = prlRes.status === 'fulfilled' && prlRes.value?.ok ? prlRes.value.data : null;
      if (prlData && prlData.price_usd !== undefined) {
        const parsedPrl = Number(prlData.price_usd);
        if (Number.isFinite(parsedPrl) && parsedPrl > 0) {
          prlLivePrice = parsedPrl;
        }
      }

      // Supplemental live HyperEVM HYPE price from Hyperliquid allMids
      let hypeLivePrice = null;
      const hlData = hlRes.status === 'fulfilled' && hlRes.value?.ok ? hlRes.value.data : null;
      if (hlData && hlData.HYPE !== undefined) {
        const parsedHype = Number(hlData.HYPE);
        if (Number.isFinite(parsedHype) && parsedHype > 0) {
          hypeLivePrice = parsedHype;
        }
      }

      const kyberIconBySymbol = Object.create(null);
      const kyberIconByContract = Object.create(null);
      const kyberChainMap = { 5042: 'arc', 1: 'eth', 8453: 'base', 42161: 'arb', 56: 'bsc', 999: 'hype' };
      const kyberTokensRaw = kyberTokRes.status === 'fulfilled' && kyberTokRes.value?.ok
        ? kyberTokRes.value.data?.data?.tokens
        : null;
      const extraDiscoveryTokens = [];
      const seenDiscoveryKeys = new Set(
        normalizedList.map((n) => `${n.blockchain}:${String(n.contractAddress || n.assetId).toLowerCase()}`)
      );
      const arcLivePriceByContract = Object.create(null);
      const arcLiveLogoByContract = Object.create(null);

      if (Array.isArray(kyberTokensRaw)) {
        for (const kt of kyberTokensRaw) {
          if (!kt || !kt.address || !kt.symbol) continue;
          const bc = kyberChainMap[Number(kt.chainId)];
          if (!bc) continue;
          const rawSym = String(kt.symbol).trim();
          if (!rawSym || (bc === 'arc' && /^ARC$/i.test(rawSym))) continue;
          if (/DEPRECATED|TESTNEBULA/i.test(`${rawSym} ${kt.name || ''}`) || DEAD_ONECLICK_SYMBOL_REGEX.test(rawSym)) continue;
          const addrLower = String(kt.address).trim().toLowerCase();
          const symUpper = rawSym.replace(/^\$/, '').toUpperCase();
          const safeLogo = sanitizeImg(kt.logoURI);
          if (safeLogo) {
            if (!kyberIconByContract[addrLower] && addrLower !== EVM_NATIVE_SENTINEL_LOWER) kyberIconByContract[addrLower] = safeLogo;
            if (symUpper && !kyberIconBySymbol[symUpper]) kyberIconBySymbol[symUpper] = safeLogo;
            if (bc === 'arc' && !arcLiveLogoByContract[addrLower]) arcLiveLogoByContract[addrLower] = safeLogo;
          }
          const dKey = `${bc}:${addrLower}`;
          if (!seenDiscoveryKeys.has(dKey)) {
            seenDiscoveryKeys.add(dKey);
            const liveRef = bySymbol.get(symUpper);
            extraDiscoveryTokens.push({
              symbol: rawSym,
              name: String(kt.name || rawSym).trim(),
              blockchain: bc,
              assetId: `${bc}:${addrLower}`,
              decimals: typeof kt.decimals === 'number' ? kt.decimals : 18,
              contractAddress: String(kt.address).trim(),
              coingeckoId: null,
              price: liveRef && liveRef.price > 0 ? liveRef.price : null,
              priceUpdatedAt: liveRef ? liveRef.priceUpdatedAt : null,
              networkName: bc === 'arc' ? 'Arc Network' : (NETWORK_LABELS[bc] || bc.toUpperCase()),
              logoURI: safeLogo || ''
            });
          }
        }
      }

      const lifiArcList = arcscanTokRes.status === 'fulfilled' && arcscanTokRes.value?.ok
        ? arcscanTokRes.value.data?.tokens?.['5042']
        : null;
      if (Array.isArray(lifiArcList)) {
        for (const lt of lifiArcList) {
          if (!lt || !lt.address || !lt.symbol) continue;
          const addr = String(lt.address).trim();
          const addrLower = addr.toLowerCase();
          const rawSym = String(lt.symbol).trim();
          const rawName = String(lt.name || rawSym).trim();
          if (/^ARC$/i.test(rawSym) || addrLower === EVM_NATIVE_SENTINEL_LOWER) continue;
          const usdNum = Number(lt.priceUSD);
          if (Number.isFinite(usdNum) && usdNum > 0) arcLivePriceByContract[addrLower] = usdNum;
          const safeLogo = sanitizeImg(lt.logoURI);
          if (safeLogo && !arcLiveLogoByContract[addrLower]) {
            arcLiveLogoByContract[addrLower] = safeLogo;
            if (!kyberIconByContract[addrLower]) kyberIconByContract[addrLower] = safeLogo;
          }
          const dKey = `arc:${addrLower}`;
          if (seenDiscoveryKeys.has(dKey)) continue;
          seenDiscoveryKeys.add(dKey);
          const decParsed = Number(lt.decimals);
          extraDiscoveryTokens.push({
            symbol: rawSym,
            name: rawName,
            blockchain: 'arc',
            assetId: `arc:${addrLower}`,
            decimals: Number.isFinite(decParsed) && decParsed >= 0 ? decParsed : 18,
            contractAddress: addr,
            coingeckoId: null,
            price: Number.isFinite(usdNum) && usdNum > 0 ? usdNum : null,
            priceUpdatedAt: null,
            networkName: 'Arc Network',
            logoURI: safeLogo || ''
          });
        }
      }

      // Merge Arc Mainnet DexScreener prices (highest-liquidity pair per Arc contract)
      const arcDexData = arcDexRes && arcDexRes.status === 'fulfilled' && arcDexRes.value?.ok ? arcDexRes.value.data : null;
      if (arcDexData && Array.isArray(arcDexData.pairs)) {
        const bestArcLiq = Object.create(null);
        for (const pair of arcDexData.pairs) {
          const baseAddr = String(pair?.baseToken?.address || '').trim().toLowerCase();
          const pUsd = Number(pair?.priceUsd);
          const liqUsd = Number(pair?.liquidity?.usd || 0);
          if (!baseAddr || !Number.isFinite(pUsd) || pUsd <= 0) continue;
          if (liqUsd >= (bestArcLiq[baseAddr] ?? -1)) {
            bestArcLiq[baseAddr] = liqUsd;
            if (!arcLivePriceByContract[baseAddr] || liqUsd > 0) {
              arcLivePriceByContract[baseAddr] = pUsd;
            }
          }
        }
      }

      for (const extraTok of extraDiscoveryTokens) {
        if (extraTok.blockchain === 'arc' && !(extraTok.price > 0)) {
          const lp = arcLivePriceByContract[String(extraTok.contractAddress || '').toLowerCase()];
          if (lp > 0) extraTok.price = lp;
        }
        normalizedList.push(extraTok);
      }

      for (const norm of normalizedList) {
        const logo = resolveTokenLogo(norm);
        if (logo) norm.logoURI = logo;
      }

      _cachedDefuseTokens = normalizedList;

      if (registry) {
        if (typeof registry.registerDynamicTokenIcons === 'function') {
          registry.registerDynamicTokenIcons(
            { ...cgImageBySymbol, ...refIconBySymbol, ...kyberIconBySymbol, ...nearFtMetaIcons.bySymbol, ...jupXStockIcons },
            { ...refIconByContract, ...kyberIconByContract, ...nearFtMetaIcons.byContract }
          );
        }

        const coreTokens = Array.isArray(registry.UNIFIED_CORE_TOKENS) ? registry.UNIFIED_CORE_TOKENS : [];
        const dexGroups = registry.DEX_CHAIN_TOKENS && typeof registry.DEX_CHAIN_TOKENS === 'object'
          ? Object.values(registry.DEX_CHAIN_TOKENS)
          : [];
        const allTargetTokens = [...coreTokens];
        for (const groupList of dexGroups) {
          if (Array.isArray(groupList)) allTargetTokens.push(...groupList);
        }

        for (const token of allTargetTokens) {
          if (!token || !token.assetId) continue;
          const assetLower = String(token.assetId).toLowerCase();
          const contractLower = String(token.contractAddress || '').trim().toLowerCase();
          const lookupContract = contractLower && contractLower !== EVM_NATIVE_SENTINEL_LOWER
            ? contractLower
            : assetLower;
          const symUpper = String(token.symbol || '').trim().replace(/^\$/, '').toUpperCase();
          const symPriceLookup = token.blockchain === 'arc' && symUpper === 'WUSDC'
            ? 'USDC'
            : (token.blockchain === 'arc' && symUpper === 'CIRBTC' ? 'BTC' : symUpper);

          let live = byAssetId.get(assetLower)
            || byContract.get(lookupContract)
            || (token.blockchain === 'arc' ? (['USDC', 'USDT', 'EURC', 'USYC', 'BTC'].includes(symPriceLookup) ? bySymbol.get(symPriceLookup) : null) : bySymbol.get(symUpper))
            || null;
          if (live && (live.price === null || !(live.price > 0)) && symUpper && token.blockchain !== 'arc') {
            const symFallback = bySymbol.get(symUpper);
            if (symFallback && symFallback.price > 0) live = symFallback;
          }

          if (live) {
            if (live.price !== null && live.price > 0) {
              token.price = live.price;
              token.priceUpdatedAt = live.priceUpdatedAt || null;
            }
            if (live.contractAddress && !token.contractAddress) {
              token.contractAddress = live.contractAddress;
            }
            if (live.coingeckoId && !token.coingeckoId) {
              token.coingeckoId = live.coingeckoId;
            }
            if (typeof live.decimals === 'number' && typeof token.decimals !== 'number') {
              token.decimals = live.decimals;
            }
            if (live.logoURI && !token.logoURI) {
              token.logoURI = live.logoURI;
            }
          }
          if (token.blockchain === 'near' && !(token.price > 0) && contractLower && refPriceByContract[contractLower] > 0) {
            token.price = refPriceByContract[contractLower];
          }

          const resolvedLogo = resolveTokenLogo(token);
          if (resolvedLogo) token.logoURI = resolvedLogo;

          // Fallback to DexScreener for Solana DEX mints if price still absent
          const dsPrice = dexPriceByMint.get(contractLower) || dexPriceByMint.get(assetLower);
          if (dsPrice > 0 && (!(token.price > 0))) {
            token.price = dsPrice;
          }

          // Fallback to Jupiter V2 live prices for Solana xStocks
          const xsPrice = jupXStockByMint[contractLower] || jupXStockByMint[assetLower] || jupXStockBySym[symUpper];
          if (xsPrice > 0 && (!(token.price > 0))) {
            token.price = xsPrice;
          }
          if (!token.logoURI && jupXStockIcons[symUpper]) {
            token.logoURI = sanitizeImg(jupXStockIcons[symUpper]);
          }

          // Ensure PRL gets live market price even if 1Click omits it
          if (symUpper === 'PRL' && prlLivePrice > 0 && (!(token.price > 0))) {
            token.price = prlLivePrice;
          }

          // Ensure HYPE gets live market price from Hyperliquid if absent in 1Click
          if (symUpper === 'HYPE' && hypeLivePrice > 0 && (!(token.price > 0))) {
            token.price = hypeLivePrice;
          }

          // Hydrate Arc Mainnet token live price & icon from Li.Fi / KyberSwap when present
          if (token.blockchain === 'arc') {
            const arcP = arcLivePriceByContract[contractLower];
            if (arcP > 0 && (!(token.price > 0))) token.price = arcP;
            if (!token.logoURI && arcLiveLogoByContract[contractLower]) {
              token.logoURI = arcLiveLogoByContract[contractLower];
            }
          }

          if (token.price === undefined) {
            token.price = null;
          }
        }

        // KyberSwap Arc Mainnet fallback for any remaining Arc tokens without LI.FI or DexScreener price
        const arcTokensNeedingPrice = ((registry.DEX_CHAIN_TOKENS && registry.DEX_CHAIN_TOKENS.arc) || []).filter(
          (t) => t && t.contractAddress && t.contractAddress.toLowerCase() !== ARC_USDC_CONTRACT && !(t.price > 0)
        );
        if (arcTokensNeedingPrice.length > 0) {
          for (let i = 0; i < arcTokensNeedingPrice.length; i += 6) {
            const batch = arcTokensNeedingPrice.slice(i, i + 6);
            await Promise.allSettled(
              batch.map(async (arcTok) => {
                const qUrl = `https://aggregator-api.kyberswap.com/arc/api/v1/routes?tokenIn=${ARC_USDC_CONTRACT}&tokenOut=${encodeURIComponent(arcTok.contractAddress)}&amountIn=10000000`;
                const qRes = await fetchJsonWithTimeout(qUrl, {}, 3500).catch(() => null);
                const rs = qRes && qRes.ok && qRes.data && qRes.data.data && qRes.data.data.routeSummary;
                if (!rs || !rs.amountOut || !/^\d+$/.test(String(rs.amountOut))) return;
                const outQty = Number(fromBaseUnits(String(rs.amountOut), typeof arcTok.decimals === 'number' ? arcTok.decimals : 18));
                if (!(outQty > 0)) return;
                const usdIn = Number(rs.amountInUsd) > 0 ? Number(rs.amountInUsd) : 10;
                const unitPrice = usdIn / outQty;
                if (Number.isFinite(unitPrice) && unitPrice > 0) {
                  arcTok.price = unitPrice;
                  const extraHit = normalizedList.find(
                    (x) => x.blockchain === 'arc' && String(x.contractAddress || '').toLowerCase() === arcTok.contractAddress.toLowerCase()
                  );
                  if (extraHit) extraHit.price = unitPrice;
                }
              })
            );
          }
        }

        if (registry.PEARL_DEFUSE_TOKEN && registry.PEARL_DEFUSE_TOKEN.assetId) {
          const livePrl = byAssetId.get(String(registry.PEARL_DEFUSE_TOKEN.assetId).toLowerCase()) || bySymbol.get('PRL');
          if (livePrl && livePrl.price > 0) {
            registry.PEARL_DEFUSE_TOKEN.price = livePrl.price;
            registry.PEARL_DEFUSE_TOKEN.priceUpdatedAt = livePrl.priceUpdatedAt;
          } else if (prlLivePrice > 0) {
            registry.PEARL_DEFUSE_TOKEN.price = prlLivePrice;
          }
        }

        if (typeof registry.setLiveDefuseTokens === 'function') {
          registry.setLiveDefuseTokens(normalizedList);
        } else {
          registry.LIVE_DEFUSE_TOKENS = normalizedList;
        }
      }

      return normalizedList;
    } catch (_) {
      return null;
    }
  }

  const REF_SMART_ROUTER_URL = 'https://smartrouter.ref.finance/findPath';
  const DCL_CONTRACT_ID = 'dclv2.ref-labs.near';
  const PRL_PEARL_ASSET_ID = 'nep141:prl.omft.near';
  const PRL_NEAR_ASSET_ID = '1cs_v1:near:nep141:prl.omft.near';
  const PRL_NEAR_CONTRACT = 'prl.omft.near';
  const QTC_ORIGIN_ASSET_ID = 'nep141:qtc.omft.near';
  const QTC_NEAR_ASSET_ID = '1cs_v1:near:nep141:qtc.omft.near';
  const QTC_NEAR_CONTRACT = 'qtc.omft.near';
  const NEAR_USDC_ASSET_ID = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
  const NEAR_USDC_CONTRACT = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
  const NEAR_DCL_POOLS = {
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near|2000'
    ],
    'qtc.omft.near|wrap.near': ['qtc.omft.near|wrap.near|10000'],
    'otoken.rhealab.near|token.rhealab.near': ['otoken.rhealab.near|token.rhealab.near|10000'],
    'token.rhealab.near|xtoken.rhealab.near': ['token.rhealab.near|xtoken.rhealab.near|400'],
    'lst.rhealab.near|token.rhealab.near': ['lst.rhealab.near|token.rhealab.near|2000'],
    'token.rhealab.near|wrap.near': [
      'token.rhealab.near|wrap.near|2000',
      'token.rhealab.near|wrap.near|100',
      'token.rhealab.near|wrap.near|10000'
    ],
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|token.rhealab.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|token.rhealab.near|100'
    ],
    'qtc.omft.near|token.rhealab.near': ['qtc.omft.near|token.rhealab.near|2000'],
    'otoken.rhealab.near|wrap.near': ['otoken.rhealab.near|wrap.near|100'],
    'lst.rhealab.near|wrap.near': ['lst.rhealab.near|wrap.near|100']
  };

  const NEAR_ASSET_DECIMALS = {
    'nep141:wrap.near': 24,
    'nep141:usdt.tether-token.near': 6,
    [NEAR_USDC_ASSET_ID]: 6,
    [PRL_PEARL_ASSET_ID]: 8,
    [PRL_NEAR_ASSET_ID]: 8,
    [QTC_ORIGIN_ASSET_ID]: 12,
    [QTC_NEAR_ASSET_ID]: 12
  };

  async function quoteNearDclPoolSwap({ tokenIn, tokenOut, amountRaw, slippageBps = 100 } = {}) {
    const inId = String(tokenIn || '').trim();
    const outId = String(tokenOut || '').trim();
    const amtStr = String(amountRaw || '0').trim();
    const pairKeyA = `${inId}|${outId}`;
    const pairKeyB = `${outId}|${inId}`;
    const poolCandidates = NEAR_DCL_POOLS[pairKeyA] || NEAR_DCL_POOLS[pairKeyB] || [];
    const poolIdsList = Array.isArray(poolCandidates) ? poolCandidates : [poolCandidates];
    if (poolIdsList.length === 0 || !/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      return { ok: false, isDcl: true, poolIds: [], amountOut: null, minAmountOut: '0', error: t('未找到 DCL 池', 'DCL pool not found') };
    }
    try {
      const results = await Promise.all(
        poolIdsList.map(async (poolId) => {
          const resp = await fetchJsonWithTimeout(
            NEAR_RPC_URL,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `dcl-quote-${poolId}`,
                method: 'query',
                params: {
                  request_type: 'call_function',
                  finality: 'final',
                  account_id: DCL_CONTRACT_ID,
                  method_name: 'quote',
                  args_base64: utf8ToBase64(JSON.stringify({
                    pool_ids: [poolId],
                    input_token: inId,
                    output_token: outId,
                    input_amount: amtStr
                  }))
                }
              })
            },
            DEFAULT_TIMEOUT_MS
          ).catch(() => null);
          const bytes = resp && resp.ok && resp.data && resp.data.result && resp.data.result.result;
          if (!Array.isArray(bytes)) return null;
          const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
          const outAmt = parsed && parsed.amount !== undefined ? String(parsed.amount) : '0';
          if (!/^\d+$/.test(outAmt) || BigInt(outAmt) <= 0n) return null;
          return { poolId, outAmt, outBig: BigInt(outAmt) };
        })
      );
      const valid = results.filter(Boolean).sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
      if (valid.length === 0) {
        return { ok: false, isDcl: true, poolIds: [poolIdsList[0]], amountOut: null, minAmountOut: '0', error: t('DCL 池深度不足', 'Insufficient DCL liquidity') };
      }
      const best = valid[0];
      const outAmt = best.outAmt;
      const bps = Math.max(1, Math.min(5000, Number(slippageBps) || 100));
      const minAmountOut = ((BigInt(outAmt) * BigInt(10000 - bps)) / 10000n).toString();
      return {
        ok: true,
        isDcl: true,
        dclContract: DCL_CONTRACT_ID,
        poolIds: [best.poolId],
        amountOut: outAmt,
        minAmountOut,
        actions: [],
        routeData: { isDcl: true, poolIds: [best.poolId], amount_out: outAmt, min_amount_out: minAmountOut },
        error: null
      };
    } catch (err) {
      return {
        ok: false,
        isDcl: true,
        poolIds: [poolIdsList[0]],
        amountOut: null,
        minAmountOut: '0',
        error: err && err.message ? err.message : t('DCL 询价失败', 'DCL quote failed')
      };
    }
  }

  /**
   * Generates a 1Click cross-chain deposit address for bridging external assets (e.g. Quantus QTC) into NEAR.
   */
  async function requestCrossChainDepositAddress({
    originAsset = QTC_ORIGIN_ASSET_ID,
    destinationAsset = QTC_NEAR_ASSET_ID,
    amountRaw = '1000000000000',
    nearAccountId
  } = {}) {
    const nearAcct = String(nearAccountId || '').trim();
    if (!nearAcct) {
      return { ok: false, depositAddress: null, deadline: null, minAmountInFormatted: null, error: t('缺少 NEAR 收款账户', 'Missing nearAccountId') };
    }
    try {
      const body = {
        dry: false,
        swapType: 'EXACT_INPUT',
        slippageTolerance: 100,
        originAsset,
        depositType: 'ORIGIN_CHAIN',
        destinationAsset,
        amount: String(amountRaw),
        refundTo: nearAcct,
        refundType: 'INTENTS',
        recipient: nearAcct,
        recipientType: 'DESTINATION_CHAIN',
        deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        referral: DEFAULT_REFERRAL_ACCOUNT
      };
      const resp = await fetchJsonWithTimeout(
        `${ONECLICK_API_URL}/quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        },
        DEFAULT_TIMEOUT_MS
      );
      const data = resp.data || {};
      const q = data.quote || {};
      const depositAddress = q.depositAddress || data.depositAddress || null;
      if (resp.ok && depositAddress) {
        return {
          ok: true,
          depositAddress,
          deadline: q.deadline || body.deadline,
          minAmountInFormatted: q.minAmountInFormatted || q.amountInFormatted || fromBaseUnits(q.minAmountIn || amountRaw, resolveTokenDecimals(originAsset)),
          amountInFormatted: q.amountInFormatted || null,
          amountOutFormatted: q.amountOutFormatted || null,
          error: null
        };
      }
      const errMsg = data.message || data.error || `HTTP ${resp.status || 'ERR'}`;
      return { ok: false, depositAddress: null, deadline: null, minAmountInFormatted: null, error: String(errMsg) };
    } catch (err) {
      return {
        ok: false,
        depositAddress: null,
        deadline: null,
        minAmountInFormatted: null,
        error: err && err.message ? err.message : t('获取跨链收款地址失败', 'Failed to obtain cross-chain deposit address')
      };
    }
  }

  function isPrlAssetId(assetId) {
    const low = String(assetId || '').trim().toLowerCase();
    return low === PRL_PEARL_ASSET_ID || low === PRL_NEAR_ASSET_ID || low === PRL_NEAR_CONTRACT;
  }

  function extractNearTokenContract(assetId) {
    const s = String(assetId || '').trim();
    const low = s.toLowerCase();
    if (low === PRL_PEARL_ASSET_ID || low === PRL_NEAR_ASSET_ID || low === PRL_NEAR_CONTRACT) {
      return PRL_NEAR_CONTRACT;
    }
    if (low === 'nep141:wrap.near' || low === 'wrap.near' || low === 'near') return 'wrap.near';
    if (low === 'nep141:usdt.tether-token.near' || low === 'usdt.tether-token.near') return 'usdt.tether-token.near';
    if (low === NEAR_USDC_ASSET_ID || low === NEAR_USDC_CONTRACT) return NEAR_USDC_CONTRACT;
    if (s.startsWith('1cs_v1:near:nep141:')) return s.slice('1cs_v1:near:nep141:'.length);
    return null;
  }

  async function quoteRefSmartRouterPath({ tokenIn, tokenOut, amountRaw, slippageBps = 100 } = {}) {
    const slippageDec = (Math.max(1, Number(slippageBps) || 100) / 10000).toFixed(4);
    const url = `${REF_SMART_ROUTER_URL}?amountIn=${encodeURIComponent(String(amountRaw))}&tokenIn=${encodeURIComponent(tokenIn)}&tokenOut=${encodeURIComponent(tokenOut)}&pathDeep=3&slippage=${slippageDec}`;
    const resp = await fetchJsonWithTimeout(url, {}, DEFAULT_TIMEOUT_MS).catch(() => null);
    const data = resp && resp.ok ? resp.data : null;
    const rData = data && Number(data.result_code) === 0 ? data.result_data : null;
    const routes = rData && Array.isArray(rData.routes) ? rData.routes : [];
    const amountOut = rData && rData.amount_out ? String(rData.amount_out) : '0';
    if (!rData || routes.length === 0 || !/^\d+$/.test(amountOut) || BigInt(amountOut) <= 0n) {
      const dclQ = await quoteNearDclPoolSwap({ tokenIn, tokenOut, amountRaw, slippageBps });
      if (dclQ.ok) return dclQ;
      return { ok: false, amountOut: null, actions: [], routeData: null, error: (data && data.result_message) || t('Ref 流动性路由不可用', 'Ref Finance route unavailable') };
    }
    const actions = [];
    for (const route of routes) {
      for (const p of (route.pools || [])) {
        if (p.pool_id === undefined || !p.token_in || !p.token_out) continue;
        const act = {
          pool_id: Number(p.pool_id),
          token_in: String(p.token_in),
          token_out: String(p.token_out),
          min_amount_out: String(p.min_amount_out || '0')
        };
        if (p.amount_in && String(p.amount_in) !== '0') act.amount_in = String(p.amount_in);
        actions.push(act);
      }
    }
    if (actions.length === 0) {
      const dclQ = await quoteNearDclPoolSwap({ tokenIn, tokenOut, amountRaw, slippageBps });
      if (dclQ.ok) return dclQ;
    }
    return {
      ok: actions.length > 0,
      amountOut,
      minAmountOut: String(routes[0]?.min_amount_out || '0'),
      actions,
      routeData: rData,
      error: null
    };
  }

  function resolveOneClickAssetId(tokenOrAssetId, blockchainHint = '') {
    const isObj = tokenOrAssetId && typeof tokenOrAssetId === 'object';
    const rawId = String(isObj ? (tokenOrAssetId.assetId || '') : (tokenOrAssetId || '')).trim();
    if (/^(nep141:|1cs_v1:)/i.test(rawId)) return rawId;

    const bc = String(blockchainHint || (isObj ? tokenOrAssetId.blockchain : '') || '').trim().toLowerCase();
    const contractRaw = String(isObj ? (tokenOrAssetId.contractAddress || rawId) : rawId).trim().toLowerCase();
    const symUpper = String(isObj ? (tokenOrAssetId.symbol || '') : '').trim().replace(/^\$/, '').toUpperCase();
    const isNativeSentinel = contractRaw === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      || contractRaw === 'sol1111111111111111111111111111111111111111'
      || contractRaw === 'so11111111111111111111111111111111111111112';

    const registry = getTokenRegistry();
    const pools = [];
    if (Array.isArray(_cachedDefuseTokens) && _cachedDefuseTokens.length > 0) pools.push(_cachedDefuseTokens);
    if (registry) {
      if (Array.isArray(registry.LIVE_DEFUSE_TOKENS)) pools.push(registry.LIVE_DEFUSE_TOKENS);
      if (Array.isArray(registry.UNIFIED_CORE_TOKENS)) pools.push(registry.UNIFIED_CORE_TOKENS);
    }

    for (const list of pools) {
      for (const item of list) {
        if (!item || !/^(nep141:|1cs_v1:)/i.test(String(item.assetId || ''))) continue;
        const itemBc = String(item.blockchain || '').toLowerCase();
        if (bc && itemBc !== bc) continue;
        const itemContract = String(item.contractAddress || '').trim().toLowerCase();
        if (contractRaw && !isNativeSentinel && itemContract && itemContract === contractRaw) {
          return item.assetId;
        }
      }
    }

    if (bc && symUpper) {
      for (const list of pools) {
        for (const item of list) {
          if (!item || !/^(nep141:|1cs_v1:)/i.test(String(item.assetId || ''))) continue;
          if (String(item.blockchain || '').toLowerCase() !== bc) continue;
          if (String(item.symbol || '').trim().toUpperCase() === symUpper) {
            return item.assetId;
          }
        }
      }
    }

    return rawId;
  }

  async function quoteRawOneClick(params = {}) {
    const {
      originAsset,
      destinationAsset,
      amountRaw,
      slippageBps = 100,
      recipient,
      refundTo,
      depositType = 'ORIGIN_CHAIN',
      recipientType = 'DESTINATION_CHAIN',
      refundType,
      dry = true,
      appFeeBps = 25,
      referral = DEFAULT_REFERRAL_ACCOUNT,
      deadlineIso
    } = params;

    const resolvedOriginAsset = resolveOneClickAssetId(originAsset, params.originBlockchain || '');
    const resolvedDestAsset = resolveOneClickAssetId(destinationAsset, params.destinationBlockchain || '');
    const resolvedDepositType = depositType === 'INTENTS' ? 'INTENTS' : 'ORIGIN_CHAIN';
    const resolvedRefundType = refundType || (resolvedDepositType === 'INTENTS' ? 'INTENTS' : 'ORIGIN_CHAIN');
    const resolvedRefundTo = refundTo || recipient;
    const resolvedReferral = referral || DEFAULT_REFERRAL_ACCOUNT;
    const feeBps = Number.isFinite(Number(appFeeBps)) ? Math.max(0, Math.round(Number(appFeeBps))) : 25;

    const body = {
      dry: Boolean(dry),
      swapType: 'EXACT_INPUT',
      slippageTolerance: Number(slippageBps) || 100,
      originAsset: resolvedOriginAsset,
      depositType: resolvedDepositType,
      destinationAsset: resolvedDestAsset,
      amount: String(amountRaw),
      refundTo: resolvedRefundTo,
      refundType: resolvedRefundType,
      recipient,
      recipientType: recipientType || 'DESTINATION_CHAIN',
      deadline: deadlineIso || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      referral: resolvedReferral
    };
    if (feeBps > 0 && resolvedReferral) {
      body.appFees = [{ recipient: resolvedReferral, fee: feeBps }];
    }

    const postQuote = async (reqBody) => {
      const resp = await fetchJsonWithTimeout(
        `${ONECLICK_API_URL}/quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        },
        DEFAULT_TIMEOUT_MS
      );
      const json = resp.data;
      if (resp.ok && json && json.quote) {
        const q = json.quote;
        return {
          ok: true,
          quote: q,
          depositAddress: json.depositAddress || q.depositAddress || null,
          memo: json.memo || q.depositMemo || null,
          amountOut: q.amountOut !== undefined ? String(q.amountOut) : null,
          amountOutFormatted: q.amountOutFormatted !== undefined ? String(q.amountOutFormatted) : null,
          amountInUsd: q.amountInUsd !== undefined ? String(q.amountInUsd) : null,
          amountOutUsd: q.amountOutUsd !== undefined ? String(q.amountOutUsd) : null,
          error: null
        };
      }
      const errMsg =
        (json && (json.message || json.error)) ||
        (resp.status ? `HTTP ${resp.status}: ${resp.statusText || 'Quote failed'}` : 'Quote unavailable');
      return { ok: false, status: resp.status, error: String(errMsg) };
    };

    const firstTry = await postQuote(body);
    if (firstTry.ok) return firstTry;

    // On dry preview quotes, if an external destinationAsset fails validation with a NEAR recipient,
    // automatically retry via NEAR wrapped 1cs_v1:near:* or INTENTS recipient so preview quotes succeed.
    const isNearAddr = (s) => /\.near$/i.test(String(s || '').trim()) || /^[0-9a-f]{64}$/i.test(String(s || '').trim());
    const nearAcct = params.nearAccountId
      || (isNearAddr(recipient) ? recipient : '')
      || (isNearAddr(resolvedRefundTo) ? resolvedRefundTo : '');

    if (
      Boolean(dry) &&
      firstTry.status === 400 &&
      nearAcct &&
      /recipient is not valid|No liquidity available/i.test(firstTry.error || '')
    ) {
      if (String(destinationAsset).startsWith('nep141:') && !String(destinationAsset).startsWith('1cs_v1:near:')) {
        const nearWrappedDest = `1cs_v1:near:${destinationAsset}`;
        const retryNear = await postQuote({
          ...body,
          destinationAsset: nearWrappedDest,
          recipient: nearAcct,
          recipientType: 'DESTINATION_CHAIN'
        });
        if (retryNear.ok) return retryNear;
      }

      const retryIntents = await postQuote({
        ...body,
        recipient: nearAcct,
        recipientType: 'INTENTS'
      });
      if (retryIntents.ok) return retryIntents;
    }

    return {
      ok: false,
      quote: null,
      depositAddress: null,
      memo: null,
      amountOut: null,
      amountOutFormatted: null,
      amountInUsd: null,
      amountOutUsd: null,
      error: firstTry.error
    };
  }

  /**
   * Composite Ref Finance (#9010) + 1Click router for PRL pairs across Pearl, NEAR, and external chains.
   */
  async function quoteCompositePrlSwap({
    originAsset,
    destinationAsset,
    amountRaw,
    slippageBps = 100,
    recipient,
    refundTo,
    nearAccountId
  } = {}) {
    try {
      const originIsPrl = isPrlAssetId(originAsset);
      const destIsPrl = isPrlAssetId(destinationAsset);
      const amtStr = String(amountRaw || '0').trim();
      const nearAccount = nearAccountId || recipient || refundTo;

      // Case 1: PRL (Pearl) <-> PRL (NEAR) -> native 1Click 1:1 bridge
      if (originIsPrl && destIsPrl) {
        return await quoteRawOneClick({
          originAsset,
          destinationAsset,
          amountRaw: amtStr,
          slippageBps,
          recipient,
          refundTo: refundTo || recipient,
          nearAccountId: nearAccount,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true
        });
      }

      // Case 2: Selling PRL -> NEAR token or External chain token
      if (originIsPrl) {
        let effectivePrlIn = amtStr;
        let bridgeQuote = null;
        if (String(originAsset).toLowerCase() === PRL_PEARL_ASSET_ID) {
          bridgeQuote = await quoteRawOneClick({
            originAsset: PRL_PEARL_ASSET_ID,
            destinationAsset: PRL_NEAR_ASSET_ID,
            amountRaw: amtStr,
            slippageBps,
            recipient: nearAccount,
            refundTo: refundTo || nearAccount,
            nearAccountId: nearAccount,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: true
          }).catch(() => null);
          if (bridgeQuote && bridgeQuote.ok && bridgeQuote.amountOut && BigInt(bridgeQuote.amountOut) > 0n) {
            effectivePrlIn = bridgeQuote.amountOut;
          }
        }

        const directNearDest = extractNearTokenContract(destinationAsset);
        if (directNearDest) {
          const refQ = await quoteRefSmartRouterPath({
            tokenIn: PRL_NEAR_CONTRACT,
            tokenOut: directNearDest,
            amountRaw: effectivePrlIn,
            slippageBps
          });
          // Only short-circuit if Ref Finance actually has a direct route; otherwise fall through to PRL->USDC->1Click
          if (refQ.ok) {
            const dec = NEAR_ASSET_DECIMALS[String(destinationAsset).toLowerCase()] || resolveTokenDecimals(destinationAsset);
            return {
              ok: true,
              compositeType: 'PRL_TO_NEAR_REF',
              refQuote: refQ,
              bridgeQuote,
              depositAddress: null,
              memo: null,
              amountOut: refQ.amountOut,
              amountOutFormatted: fromBaseUnits(refQ.amountOut, dec),
              amountInUsd: null,
              amountOutUsd: null,
              error: null
            };
          }
        }

        // PRL -> USDC (Ref Finance Pool #9010) -> Destination Chain / DCL / 1Click Token
        const refToUsdc = await quoteRefSmartRouterPath({
          tokenIn: PRL_NEAR_CONTRACT,
          tokenOut: NEAR_USDC_CONTRACT,
          amountRaw: effectivePrlIn,
          slippageBps
        });
        if (!refToUsdc.ok) {
          return { ok: false, quote: null, depositAddress: null, memo: null, amountOut: null, amountOutFormatted: null, amountInUsd: null, amountOutUsd: null, error: refToUsdc.error };
        }
        // When buying NEAR-side QTC, concurrently compare Rhea CLMM (dclv2) vs 1Click Solver and pick the highest output
        if (String(destinationAsset).toLowerCase() === QTC_NEAR_ASSET_ID) {
          const [dclRes, oneClickRes] = await Promise.allSettled([
            quoteNearDclPoolSwap({
              tokenIn: NEAR_USDC_CONTRACT,
              tokenOut: QTC_NEAR_CONTRACT,
              amountRaw: refToUsdc.amountOut,
              slippageBps
            }).catch(() => null),
            quoteRawOneClick({
              originAsset: NEAR_USDC_ASSET_ID,
              destinationAsset,
              amountRaw: refToUsdc.amountOut,
              slippageBps,
              recipient,
              refundTo: nearAccount,
              nearAccountId: nearAccount,
              depositType: 'ORIGIN_CHAIN',
              recipientType: 'DESTINATION_CHAIN',
              dry: true
            }).catch(() => null)
          ]);
          const candidates = [];
          const dclStep2 = dclRes.status === 'fulfilled' ? dclRes.value : null;
          if (dclStep2 && dclStep2.ok && /^\d+$/.test(String(dclStep2.amountOut || '0')) && BigInt(dclStep2.amountOut) > 0n) {
            candidates.push({
              source: 'Ref #9010 + Rhea CLMM (dclv2)',
              outBig: BigInt(dclStep2.amountOut),
              payload: {
                ok: true,
                compositeType: 'PRL_TO_NEAR_DCL',
                refQuote: refToUsdc,
                dclQuote: dclStep2,
                bridgeQuote,
                intermediaryUsdcAssetId: NEAR_USDC_ASSET_ID,
                intermediaryUsdcContract: NEAR_USDC_CONTRACT,
                intermediaryUsdcRaw: refToUsdc.amountOut,
                depositAddress: null,
                memo: null,
                amountOut: dclStep2.amountOut,
                amountOutFormatted: fromBaseUnits(dclStep2.amountOut, 12),
                amountInUsd: null,
                amountOutUsd: null,
                error: null
              }
            });
          }
          const oneClickStep2 = oneClickRes.status === 'fulfilled' ? oneClickRes.value : null;
          if (oneClickStep2 && oneClickStep2.ok && /^\d+$/.test(String(oneClickStep2.amountOut || '0')) && BigInt(oneClickStep2.amountOut) > 0n) {
            candidates.push({
              source: 'Ref #9010 + 1Click Solver',
              outBig: BigInt(oneClickStep2.amountOut),
              payload: {
                ...oneClickStep2,
                compositeType: 'PRL_TO_EXTERNAL',
                refQuote: refToUsdc,
                oneClickQuote: oneClickStep2,
                bridgeQuote,
                intermediaryUsdcAssetId: NEAR_USDC_ASSET_ID,
                intermediaryUsdcContract: NEAR_USDC_CONTRACT,
                intermediaryUsdcRaw: refToUsdc.amountOut
              }
            });
          }
          if (candidates.length > 0) {
            candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
            const best = candidates[0];
            return {
              ...best.payload,
              comparedPools: candidates.length,
              bestSource: best.source,
              routeLabel: candidates.length > 1
                ? `⚡ ${t('最优', 'Best')}: ${best.source} (${t(`比价 ${candidates.length} 池`, `${candidates.length} pools`)})`
                : best.source
            };
          }
        }
        const oneClickStep2 = await quoteRawOneClick({
          originAsset: NEAR_USDC_ASSET_ID,
          destinationAsset,
          amountRaw: refToUsdc.amountOut,
          slippageBps,
          recipient,
          refundTo: nearAccount,
          nearAccountId: nearAccount,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true
        });
        if (!oneClickStep2.ok) return oneClickStep2;
        return {
          ...oneClickStep2,
          compositeType: 'PRL_TO_EXTERNAL',
          refQuote: refToUsdc,
          oneClickQuote: oneClickStep2,
          bridgeQuote,
          intermediaryUsdcAssetId: NEAR_USDC_ASSET_ID,
          intermediaryUsdcContract: NEAR_USDC_CONTRACT,
          intermediaryUsdcRaw: refToUsdc.amountOut
        };
      }

      // Case 3: Buying PRL <- NEAR token or External chain token
      if (destIsPrl) {
        const directNearSrc = extractNearTokenContract(originAsset);
        if (directNearSrc) {
          const refQ = await quoteRefSmartRouterPath({
            tokenIn: directNearSrc,
            tokenOut: PRL_NEAR_CONTRACT,
            amountRaw: amtStr,
            slippageBps
          });
          // Only return immediately if Ref Finance has direct pool liquidity; otherwise fall through to 1Click->USDC->PRL
          if (refQ.ok) {
            let finalPrlOut = refQ.amountOut;
            let bridgeQuote = null;
            if (String(destinationAsset).toLowerCase() === PRL_PEARL_ASSET_ID) {
              bridgeQuote = await quoteRawOneClick({
                originAsset: PRL_NEAR_ASSET_ID,
                destinationAsset: PRL_PEARL_ASSET_ID,
                amountRaw: refQ.amountOut,
                slippageBps,
                recipient,
                refundTo: nearAccount,
                nearAccountId: nearAccount,
                depositType: 'ORIGIN_CHAIN',
                recipientType: 'DESTINATION_CHAIN',
                dry: true
              }).catch(() => null);
              if (bridgeQuote && bridgeQuote.ok && bridgeQuote.amountOut && BigInt(bridgeQuote.amountOut) > 0n) {
                finalPrlOut = bridgeQuote.amountOut;
              }
            }
            return {
              ok: true,
              compositeType: 'NEAR_TO_PRL_REF',
              refQuote: refQ,
              bridgeQuote,
              depositAddress: null,
              memo: null,
              amountOut: finalPrlOut,
              amountOutFormatted: fromBaseUnits(finalPrlOut, 8),
              amountInUsd: null,
              amountOutUsd: null,
              error: null
            };
          }
        }

        // External / 1Click Token -> NEAR USDC (1Click) -> PRL (Ref Finance Pool #9010)
        const oneClickStep1 = await quoteRawOneClick({
          originAsset,
          destinationAsset: NEAR_USDC_ASSET_ID,
          amountRaw: amtStr,
          slippageBps,
          recipient: nearAccount,
          refundTo: refundTo || nearAccount,
          nearAccountId: nearAccount,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true
        });
        if (!oneClickStep1.ok || !oneClickStep1.amountOut) return oneClickStep1;

        const refFromUsdc = await quoteRefSmartRouterPath({
          tokenIn: NEAR_USDC_CONTRACT,
          tokenOut: PRL_NEAR_CONTRACT,
          amountRaw: oneClickStep1.amountOut,
          slippageBps
        });
        if (!refFromUsdc.ok) {
          return { ok: false, quote: null, depositAddress: null, memo: null, amountOut: null, amountOutFormatted: null, amountInUsd: null, amountOutUsd: null, error: refFromUsdc.error };
        }
        return {
          ok: true,
          compositeType: 'EXTERNAL_TO_PRL',
          oneClickQuote: oneClickStep1,
          refQuote: refFromUsdc,
          intermediaryUsdcAssetId: NEAR_USDC_ASSET_ID,
          intermediaryUsdcContract: NEAR_USDC_CONTRACT,
          depositAddress: null,
          memo: null,
          amountOut: refFromUsdc.amountOut,
          amountOutFormatted: fromBaseUnits(refFromUsdc.amountOut, 8),
          amountInUsd: oneClickStep1.amountInUsd,
          amountOutUsd: oneClickStep1.amountInUsd,
          error: null
        };
      }

      return { ok: false, quote: null, depositAddress: null, memo: null, amountOut: null, amountOutFormatted: null, amountInUsd: null, amountOutUsd: null, error: t('未识别 PRL 路由参数', 'Invalid PRL route') };
    } catch (err) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: err && err.message ? err.message : t('PRL 组合路由询价失败', 'PRL composite quote failed')
      };
    }
  }

  /**
   * Requests a dry or live 1Click intent swap/withdraw quote supporting INTENTS & ORIGIN_CHAIN deposits,
   * automatically composing Ref Finance (#9010) + 1Click routes when PRL is paired with another token.
   */
  async function quoteIntentSwapOrWithdraw(params = {}) {
    const {
      originAsset,
      destinationAsset,
      amountRaw,
      slippageBps = 100,
      recipient,
      refundTo,
      depositType = 'ORIGIN_CHAIN',
      recipientType = 'DESTINATION_CHAIN',
      refundType,
      dry = true,
      appFeeBps = 25,
      referral = DEFAULT_REFERRAL_ACCOUNT,
      deadlineIso
    } = params;

    if (!originAsset || !destinationAsset) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: t('缺少源资产或目标资产标识', 'Missing originAsset or destinationAsset')
      };
    }

    const amountStr = String(amountRaw === undefined || amountRaw === null ? '' : amountRaw).trim();
    if (!/^\d+$/.test(amountStr) || BigInt(amountStr) <= 0n) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: t('兑换数量必须大于 0', 'Quote amountRaw must be a positive integer string')
      };
    }

    if (!recipient) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: t('缺少目标收款地址', 'Missing recipient address')
      };
    }

    const originIsPrl = isPrlAssetId(originAsset);
    const destIsPrl = isPrlAssetId(destinationAsset);
    if (dry !== false && (originIsPrl !== destIsPrl)) {
      return quoteCompositePrlSwap({
        originAsset,
        destinationAsset,
        amountRaw: amountStr,
        slippageBps,
        recipient,
        refundTo,
        nearAccountId: params.nearAccountId
      });
    }

    try {
      return await quoteRawOneClick({
        ...params,
        amountRaw: amountStr
      });
    } catch (err) {
      return {
        ok: false,
        quote: null,
        depositAddress: null,
        memo: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        error: err && err.message ? err.message : t('询价请求失败', 'Quote request failed')
      };
    }
  }

  function getContractsHelper() {
    if (root && root.NearCAContracts) return root.NearCAContracts;
    if (typeof globalThis !== 'undefined' && globalThis.NearCAContracts) return globalThis.NearCAContracts;
    if (typeof window !== 'undefined' && window.NearCAContracts) return window.NearCAContracts;
    if (typeof require === 'function') {
      try {
        return require('./chain-contracts.js');
      } catch (_) {}
    }
    return null;
  }

  const SOL_NATIVE_WSOL = 'So11111111111111111111111111111111111111112';
  const SOL_1CLICK_ASSET_ID = 'nep141:sol.omft.near';
  const EVM_NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const EVM_NATIVE_1CLICK_MAP = {
    eth: 'nep141:eth.omft.near',
    base: 'nep141:base.omft.near',
    arb: 'nep141:arb.omft.near',
    bsc: 'nep141:bnb.omdep.near',
    hood: 'nep141:hood.omft.near'
  };

  /**
   * Multi-pool best-price comparator for NEAR same-chain token pairs:
   * concurrently queries Ref V2 AMM, Rhea/Ref CLMM (dclv2 + PRL composite), and 1Click Solver.
   */
  async function quoteBestNearPairSwap({
    fromToken,
    toToken,
    amountRaw,
    slippageBps = 100,
    recipient,
    nearAccountId
  } = {}) {
    const contracts = getContractsHelper();
    const nearAcct = nearAccountId || recipient;
    const tokenInContract = fromToken.contractAddress || extractNearTokenContract(fromToken.assetId) || 'wrap.near';
    const tokenOutContract = toToken.contractAddress || extractNearTokenContract(toToken.assetId) || 'wrap.near';
    const amtStr = String(amountRaw || '0').trim();
    const outDec = typeof toToken.decimals === 'number' ? toToken.decimals : resolveTokenDecimals(toToken.assetId);

    // Build parallel candidates across Ref V2 AMM, Rhea CLMM (dclv2), Composite PRL, and 1Click
    const refPromise = (contracts && typeof contracts.quoteNearRefFinanceSwap === 'function')
      ? contracts.quoteNearRefFinanceSwap({ tokenIn: tokenInContract, tokenOut: tokenOutContract, amountRaw: amtStr, slippageBps }).catch(() => null)
      : quoteRefSmartRouterPath({ tokenIn: tokenInContract, tokenOut: tokenOutContract, amountRaw: amtStr, slippageBps }).catch(() => null);

    const dclPromise = quoteNearDclPoolSwap({ tokenIn: tokenInContract, tokenOut: tokenOutContract, amountRaw: amtStr, slippageBps }).catch(() => null);

    const compositePrlPromise = (isPrlAssetId(fromToken.assetId) !== isPrlAssetId(toToken.assetId))
      ? quoteCompositePrlSwap({
          originAsset: fromToken.assetId,
          destinationAsset: toToken.assetId,
          amountRaw: amtStr,
          slippageBps,
          recipient: nearAcct,
          refundTo: nearAcct,
          nearAccountId: nearAcct
        }).catch(() => null)
      : Promise.resolve(null);

    const oneClickPromise = quoteRawOneClick({
      originAsset: fromToken.assetId,
      destinationAsset: toToken.assetId,
      amountRaw: amtStr,
      slippageBps,
      recipient: nearAcct,
      refundTo: nearAcct,
      nearAccountId: nearAcct,
      depositType: 'ORIGIN_CHAIN',
      recipientType: 'DESTINATION_CHAIN',
      dry: true
    }).catch(() => null);

    const [rRes, dRes, cRes, oRes] = await Promise.allSettled([
      refPromise,
      dclPromise,
      compositePrlPromise,
      oneClickPromise
    ]);

    const candidates = [];
    const pushCand = (source, res, formatter = null) => {
      if (!res || !res.ok || !res.amountOut || !/^\d+$/.test(String(res.amountOut))) return;
      const outBig = BigInt(res.amountOut);
      if (outBig <= 0n) return;
      candidates.push({
        source,
        outBig,
        payload: {
          ...res,
          amountOut: String(res.amountOut),
          amountOutFormatted: res.amountOutFormatted || (formatter ? formatter(res.amountOut) : fromBaseUnits(res.amountOut, outDec))
        }
      });
    };

    const refVal = rRes.status === 'fulfilled' ? rRes.value : null;
    if (refVal && refVal.ok && !refVal.isDcl) pushCand('Ref Finance V2', refVal);
    const dclVal = dRes.status === 'fulfilled' ? dRes.value : null;
    if (dclVal && dclVal.ok) pushCand('Rhea CLMM (dclv2)', dclVal);
    else if (refVal && refVal.ok && refVal.isDcl) pushCand('Rhea CLMM (dclv2)', refVal);

    const compVal = cRes.status === 'fulfilled' ? cRes.value : null;
    if (compVal && compVal.ok) {
      pushCand(compVal.bestSource || 'Ref + Composite', compVal);
    }
    const ocVal = oRes.status === 'fulfilled' ? oRes.value : null;
    if (ocVal && ocVal.ok) pushCand('1Click Solver', ocVal);

    if (candidates.length === 0) {
      const errMsg = (compVal && compVal.error) || (ocVal && ocVal.error) || (refVal && refVal.error) || t('暂无 NEAR 流动性报价', 'No NEAR quote available');
      return { ok: false, error: errMsg, comparedRoutesCount: 0 };
    }

    candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
    const best = candidates[0];
    const comparedRoutesCount = candidates.length;
    const routeLabel = comparedRoutesCount > 1
      ? `⚡ ${t('最优', 'Best')}: ${best.source} (${t(`比价 ${comparedRoutesCount} 池`, `${comparedRoutesCount} pools`)})`
      : best.source;

    return {
      ...best.payload,
      ok: true,
      bestSource: best.source,
      comparedRoutesCount,
      comparedPools: comparedRoutesCount,
      routeLabel
    };
  }

  const RELAY_API_URL = 'https://api.relay.link/quote';
  const LIFI_API_URL = 'https://li.quest/v1';
  const ARC_USDC_CONTRACT = '0x3600000000000000000000000000000000000000';
  const BASE_USDC_1CLICK_ID = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
  const BASE_USDC_EVM = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const ARC_BRIDGE_EVM_CHAINS = { eth: 1, base: 8453, arb: 42161, bsc: 56, arc: 5042 };

  async function quoteRelayBridge({
    user,
    recipient,
    originChainId,
    destinationChainId,
    originCurrency,
    destinationCurrency,
    amount
  } = {}) {
    try {
      const u = /^0x[0-9a-fA-F]{40}$/.test(String(user || '')) ? user : '0x1111111111111111111111111111111111111111';
      const r = /^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : u;
      const resp = await fetchJsonWithTimeout(
        RELAY_API_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: u,
            recipient: r,
            originChainId: Number(originChainId),
            destinationChainId: Number(destinationChainId),
            originCurrency,
            destinationCurrency,
            amount: String(amount),
            tradeType: 'EXACT_INPUT'
          })
        },
        DEFAULT_TIMEOUT_MS
      );
      const outObj = resp.data?.details?.currencyOut;
      const inObj = resp.data?.details?.currencyIn;
      if (!resp.ok || !outObj || !outObj.amount || !/^\d+$/.test(String(outObj.amount)) || BigInt(outObj.amount) <= 0n) {
        return { ok: false, error: resp.data?.message || `Relay HTTP ${resp.status}` };
      }
      return {
        ok: true,
        provider: 'Relay',
        amountOut: String(outObj.amount),
        amountOutFormatted: outObj.amountFormatted ? String(outObj.amountFormatted) : null,
        amountInUsd: inObj?.amountUsd ? String(inObj.amountUsd) : null,
        amountOutUsd: outObj.amountUsd ? String(outObj.amountUsd) : null,
        steps: Array.isArray(resp.data?.steps) ? resp.data.steps : [],
        details: resp.data.details
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Relay quote failed' };
    }
  }

  async function quoteLifiBridge({
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    fromAddress,
    toAddress,
    slippageBps = 100
  } = {}) {
    try {
      const fAddr = /^0x[0-9a-fA-F]{40}$/.test(String(fromAddress || '')) ? fromAddress : '0x1111111111111111111111111111111111111111';
      const tAddr = /^0x[0-9a-fA-F]{40}$/.test(String(toAddress || '')) ? toAddress : fAddr;
      const slip = ((Number(slippageBps) || 100) / 10000).toFixed(4);
      const url = `${LIFI_API_URL}/quote?fromChain=${encodeURIComponent(fromChain)}&toChain=${encodeURIComponent(toChain)}&fromToken=${encodeURIComponent(fromToken)}&toToken=${encodeURIComponent(toToken)}&fromAmount=${encodeURIComponent(fromAmount)}&fromAddress=${encodeURIComponent(fAddr)}&toAddress=${encodeURIComponent(tAddr)}&slippage=${slip}`;
      const resp = await fetchJsonWithTimeout(url, {}, DEFAULT_TIMEOUT_MS);
      const est = resp.data?.estimate;
      if (!resp.ok || !est || !est.toAmount || !/^\d+$/.test(String(est.toAmount)) || BigInt(est.toAmount) <= 0n) {
        return { ok: false, error: resp.data?.message || `LI.FI HTTP ${resp.status}` };
      }
      return {
        ok: true,
        provider: 'LI.FI',
        amountOut: String(est.toAmount),
        amountInUsd: est.fromAmountUSD ? String(est.fromAmountUSD) : null,
        amountOutUsd: est.toAmountUSD ? String(est.toAmountUSD) : null,
        transactionRequest: resp.data.transactionRequest || null,
        estimate: est
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'LI.FI quote failed' };
    }
  }

  /**
   * Super-Aggregator: automatically quotes ANY Token <-> ANY Token across:
   * 1) NEAR multi-pool (Ref V2 AMM vs Rhea CLMM dclv2 vs 1Click)
   * 2) Direct 1Click cross-chain bridge
   * 3) 2-Stage Cross-Chain Bridge (1Click / Ref #9010) + Target Chain DEX (Jupiter/Raydium or EVM Kyber/Para/OpenOcean)
   * 4) Arc Mainnet (5042) Cross-Chain Relay (1Click <-> Base USDC <-> Relay/Li.Fi <-> KyberSwap Arc)
   */
  async function quoteCrossChainWithDexRelay({
    fromToken,
    toToken,
    amountRaw,
    slippageBps = 100,
    recipient,
    refundTo,
    nearAccountId,
    solAddress,
    evmAddress
  } = {}) {
    if (!fromToken || !toToken) {
      return { ok: false, error: t('缺少代币参数', 'Missing fromToken or toToken') };
    }
    const fromBc = String(fromToken.blockchain || '').toLowerCase();
    const toBc = String(toToken.blockchain || '').toLowerCase();
    const amtStr = String(amountRaw || '0').trim();
    const contracts = getContractsHelper();

    if (fromBc === 'near' && toBc === 'near') {
      return quoteBestNearPairSwap({ fromToken, toToken, amountRaw: amtStr, slippageBps, recipient, nearAccountId });
    }

    const originIsPrl = isPrlAssetId(fromToken.assetId);
    const destIsPrl = isPrlAssetId(toToken.assetId);
    const resolvedOriginAsset = resolveOneClickAssetId(fromToken, fromBc);
    const resolvedDestAsset = resolveOneClickAssetId(toToken, toBc);
    const isTargetSolDex = toBc === 'sol' && Boolean(toToken.contractAddress) && toToken.contractAddress !== SOL_NATIVE_WSOL;
    const isOriginSolDex = fromBc === 'sol' && Boolean(fromToken.contractAddress) && fromToken.contractAddress !== SOL_NATIVE_WSOL && !/^(nep141:|1cs_v1:)/i.test(resolvedOriginAsset);
    const isTargetEvmDex = ['eth', 'base', 'arb', 'bsc', 'hood'].includes(toBc) && Boolean(toToken.contractAddress) && toToken.contractAddress.toLowerCase() !== EVM_NATIVE_SENTINEL;

    // 1. PRL pairs with 1Click-reachable tokens (not DEX-only target tokens or Arc)
    if ((originIsPrl !== destIsPrl) && !isTargetSolDex && !isTargetEvmDex && toBc !== 'arc' && fromBc !== 'arc') {
      const prlRes = await quoteCompositePrlSwap({
        originAsset: resolvedOriginAsset,
        destinationAsset: resolvedDestAsset,
        amountRaw: amtStr,
        slippageBps,
        recipient,
        refundTo,
        nearAccountId
      });
      if (prlRes && prlRes.ok && !prlRes.routeLabel) {
        prlRes.routeLabel = prlRes.compositeType === 'PRL_TO_EXTERNAL' || prlRes.compositeType === 'EXTERNAL_TO_PRL'
          ? 'Ref Finance (#9010) + 1Click'
          : 'Ref Finance (v2.ref-finance.near)';
      }
      return prlRes;
    }

    // Helper: Stage 1 bridge quote from `fromToken` to an intermediate L1 native/hub asset (e.g. SOL, ETH, or Base USDC)
    const quoteBridgeToIntermediate = async (interAssetId, interRecipient) => {
      if (originIsPrl) {
        return quoteCompositePrlSwap({
          originAsset: resolvedOriginAsset,
          destinationAsset: interAssetId,
          amountRaw: amtStr,
          slippageBps,
          recipient: interRecipient,
          refundTo,
          nearAccountId
        });
      }
      if (isOriginSolDex && contracts && typeof contracts.quoteSolanaJupiterSwap === 'function') {
        const solS1 = await contracts.quoteSolanaJupiterSwap({
          inputMint: fromToken.contractAddress,
          outputMint: SOL_NATIVE_WSOL,
          amountRaw: amtStr,
          slippageBps
        });
        return quoteIntentSwapOrWithdraw({
          originAsset: SOL_1CLICK_ASSET_ID,
          destinationAsset: interAssetId,
          amountRaw: solS1.outAmount,
          slippageBps,
          recipient: interRecipient,
          refundTo: solAddress || refundTo,
          nearAccountId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true
        });
      }
      if (resolvedOriginAsset.toLowerCase() === interAssetId.toLowerCase()) {
        return { ok: true, amountOut: amtStr, amountInUsd: null };
      }
      return quoteIntentSwapOrWithdraw({
        originAsset: resolvedOriginAsset,
        destinationAsset: interAssetId,
        amountRaw: amtStr,
        slippageBps,
        recipient: interRecipient,
        refundTo,
        nearAccountId,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: true
      });
    };

    // Case D: Any Chain -> Arc Mainnet (5042)
    if (toBc === 'arc' && fromBc !== 'arc') {
      const evmUser = /^0x[0-9a-fA-F]{40}$/.test(String(evmAddress || ''))
        ? evmAddress
        : (/^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : '0x1111111111111111111111111111111111111111');
      const arcRecip = /^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : evmUser;
      const rawDestAddr = String(toToken.contractAddress || ARC_USDC_CONTRACT).trim();
      const arcDestContract = rawDestAddr.toLowerCase() === EVM_NATIVE_SENTINEL ? ARC_USDC_CONTRACT : rawDestAddr;
      const destIsArcUsdc = arcDestContract.toLowerCase() === ARC_USDC_CONTRACT;
      const toDec = typeof toToken.decimals === 'number' ? toToken.decimals : (destIsArcUsdc ? 6 : 18);

      const pickBestEvmBridge = async (origChainId, origCurrency, bridgeAmt) => {
        const [rQ, lQ] = await Promise.all([
          quoteRelayBridge({
            user: evmUser,
            recipient: destIsArcUsdc ? arcRecip : evmUser,
            originChainId: origChainId,
            destinationChainId: 5042,
            originCurrency: origCurrency,
            destinationCurrency: ARC_USDC_CONTRACT,
            amount: bridgeAmt
          }),
          quoteLifiBridge({
            fromChain: origChainId,
            toChain: 5042,
            fromToken: origCurrency,
            toToken: ARC_USDC_CONTRACT,
            fromAmount: bridgeAmt,
            fromAddress: evmUser,
            toAddress: destIsArcUsdc ? arcRecip : evmUser,
            slippageBps
          })
        ]);
        const cands = [rQ, lQ].filter((x) => x && x.ok && BigInt(x.amountOut) > 0n);
        if (cands.length === 0) return rQ.error ? rQ : lQ;
        cands.sort((a, b) => (BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : BigInt(b.amountOut) < BigInt(a.amountOut) ? -1 : 0));
        return { ...cands[0], comparedBridgeCount: cands.length };
      };

      const directOriginChainId = ARC_BRIDGE_EVM_CHAINS[fromBc];
      let stage1 = null;
      let bridge = null;
      if (directOriginChainId && directOriginChainId !== 5042) {
        const origCurrency = fromToken.contractAddress || EVM_NATIVE_SENTINEL;
        bridge = await pickBestEvmBridge(directOriginChainId, origCurrency, amtStr);
      } else {
        stage1 = await quoteBridgeToIntermediate(BASE_USDC_1CLICK_ID, evmUser);
        if (!stage1 || !stage1.ok || !stage1.amountOut || BigInt(stage1.amountOut) <= 0n) {
          return stage1 || { ok: false, error: t('跨链至 Base USDC 询价失败', 'Stage 1 Base USDC quote failed') };
        }
        bridge = await pickBestEvmBridge(8453, BASE_USDC_EVM, stage1.amountOut);
      }

      if (!bridge || !bridge.ok) {
        return bridge || { ok: false, error: t('Relay/LI.FI 至 Arc 跨链询价失败', 'Bridge quote to Arc Mainnet failed') };
      }

      const arcUsdcOut = bridge.amountOut;
      let finalAmountOut = arcUsdcOut;
      let dexQuote = null;
      if (!destIsArcUsdc && contracts && typeof contracts.quoteEvmDexSwap === 'function') {
        dexQuote = await contracts.quoteEvmDexSwap({
          chainKey: 'arc',
          srcToken: ARC_USDC_CONTRACT,
          destToken: arcDestContract,
          amountRaw: arcUsdcOut,
          srcDecimals: 6,
          destDecimals: toDec,
          slippageBps
        });
        if (!dexQuote || !dexQuote.ok || !dexQuote.amountOut) {
          return dexQuote || { ok: false, error: t('Arc 链内 DEX 兑换询价失败', 'Arc DEX swap quote failed') };
        }
        finalAmountOut = dexQuote.amountOut;
      }

      const stages = [];
      if (stage1) stages.push(`1Click (${fromBc.toUpperCase()}➔Base)`);
      stages.push(`${bridge.provider} (${stage1 ? 'Base' : fromBc.toUpperCase()}➔Arc)`);
      if (dexQuote) stages.push(dexQuote.bestSource || dexQuote.label || 'KyberSwap (Arc)');

      return {
        ok: true,
        compositeType: directOriginChainId ? 'EVM_TO_ARC_MAINNET' : 'CROSS_CHAIN_TO_ARC_MAINNET',
        relayMode: 'CROSS_CHAIN_TO_ARC_MAINNET',
        stage1Quote: stage1,
        bridgeQuote: bridge,
        dexQuote,
        baseBridgeAssetId: stage1 ? BASE_USDC_1CLICK_ID : null,
        baseBridgeRaw: stage1 ? stage1.amountOut : null,
        intermediaryAssetId: ARC_USDC_CONTRACT,
        intermediaryRaw: arcUsdcOut,
        depositAddress: null,
        memo: null,
        amountOut: String(finalAmountOut),
        amountOutFormatted: fromBaseUnits(String(finalAmountOut), toDec),
        amountInUsd: (stage1 && stage1.amountInUsd) || bridge.amountInUsd || null,
        amountOutUsd: (dexQuote && dexQuote.amountOutUsd) || bridge.amountOutUsd || null,
        comparedPools: Math.max(Number(bridge.comparedBridgeCount || 1), Number(dexQuote?.comparedPools || 1)),
        bestSource: stages.join(' + '),
        routeLabel: stages.join(' + '),
        error: null
      };
    }

    // Case E: Arc Mainnet (5042) -> Any Chain
    if (fromBc === 'arc' && toBc !== 'arc') {
      const evmUser = /^0x[0-9a-fA-F]{40}$/.test(String(evmAddress || ''))
        ? evmAddress
        : '0x1111111111111111111111111111111111111111';
      const rawSrcAddr = String(fromToken.contractAddress || ARC_USDC_CONTRACT).trim();
      const arcSrcContract = rawSrcAddr.toLowerCase() === EVM_NATIVE_SENTINEL ? ARC_USDC_CONTRACT : rawSrcAddr;
      const srcIsArcUsdc = arcSrcContract.toLowerCase() === ARC_USDC_CONTRACT;

      let arcUsdcAmt = srcIsArcUsdc && Number(fromToken.decimals) === 18
        ? (BigInt(amtStr) / 1000000000000n).toString()
        : amtStr;
      let stage1Dex = null;
      if (!srcIsArcUsdc && contracts && typeof contracts.quoteEvmDexSwap === 'function') {
        stage1Dex = await contracts.quoteEvmDexSwap({
          chainKey: 'arc',
          srcToken: arcSrcContract,
          destToken: ARC_USDC_CONTRACT,
          amountRaw: amtStr,
          srcDecimals: typeof fromToken.decimals === 'number' ? fromToken.decimals : 18,
          destDecimals: 6,
          slippageBps
        });
        if (!stage1Dex || !stage1Dex.ok || !stage1Dex.amountOut) {
          return stage1Dex || { ok: false, error: t('Arc 链内换出 USDC 失败', 'Arc DEX stage 1 quote failed') };
        }
        arcUsdcAmt = stage1Dex.amountOut;
      }

      const [rOut, lOut] = await Promise.all([
        quoteRelayBridge({
          user: evmUser,
          recipient: toBc === 'base' && /^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : evmUser,
          originChainId: 5042,
          destinationChainId: 8453,
          originCurrency: ARC_USDC_CONTRACT,
          destinationCurrency: BASE_USDC_EVM,
          amount: arcUsdcAmt
        }),
        quoteLifiBridge({
          fromChain: 5042,
          toChain: 8453,
          fromToken: ARC_USDC_CONTRACT,
          toToken: BASE_USDC_EVM,
          fromAmount: arcUsdcAmt,
          fromAddress: evmUser,
          toAddress: toBc === 'base' && /^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : evmUser,
          slippageBps
        })
      ]);
      const bridgeCands = [rOut, lOut].filter((x) => x && x.ok && BigInt(x.amountOut) > 0n);
      if (bridgeCands.length === 0) {
        return rOut.error ? rOut : lOut;
      }
      bridgeCands.sort((a, b) => (BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : BigInt(b.amountOut) < BigInt(a.amountOut) ? -1 : 0));
      const bestBridge = bridgeCands[0];

      const destIsBaseUsdc = toBc === 'base' && String(toToken.contractAddress || '').toLowerCase() === BASE_USDC_EVM.toLowerCase();
      if (destIsBaseUsdc) {
        const label = `${stage1Dex ? `${stage1Dex.bestSource || 'KyberSwap'} + ` : ''}${bestBridge.provider} (Arc➔Base)`;
        return {
          ok: true,
          compositeType: 'ARC_MAINNET_TO_CROSS_CHAIN',
          stage1DexQuote: stage1Dex,
          bridgeQuote: bestBridge,
          stage3Quote: null,
          intermediaryRaw: arcUsdcAmt,
          baseOutRaw: bestBridge.amountOut,
          amountOut: bestBridge.amountOut,
          amountOutFormatted: fromBaseUnits(bestBridge.amountOut, 6),
          amountInUsd: bestBridge.amountInUsd || null,
          amountOutUsd: bestBridge.amountOutUsd || null,
          comparedPools: bridgeCands.length,
          routeLabel: label,
          error: null
        };
      }

      const stage3 = destIsPrl
        ? await quoteCompositePrlSwap({
            originAsset: BASE_USDC_1CLICK_ID,
            destinationAsset: resolvedDestAsset,
            amountRaw: bestBridge.amountOut,
            slippageBps,
            recipient,
            refundTo: evmUser,
            nearAccountId
          })
        : await quoteIntentSwapOrWithdraw({
            originAsset: BASE_USDC_1CLICK_ID,
            destinationAsset: resolvedDestAsset,
            amountRaw: bestBridge.amountOut,
            slippageBps,
            recipient,
            refundTo: evmUser,
            nearAccountId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: true
          });
      if (!stage3 || !stage3.ok) {
        return stage3 || { ok: false, error: t('Base USDC 转目标链询价失败', 'Stage 3 cross-chain quote failed') };
      }
      const toDec = typeof toToken.decimals === 'number' ? toToken.decimals : resolveTokenDecimals(resolvedDestAsset);
      const label = `${stage1Dex ? `${stage1Dex.bestSource || 'KyberSwap'} + ` : ''}${bestBridge.provider} (Arc➔Base) + 1Click`;
      return {
        ...stage3,
        ok: true,
        compositeType: 'ARC_MAINNET_TO_CROSS_CHAIN',
        stage1DexQuote: stage1Dex,
        bridgeQuote: bestBridge,
        stage3Quote: stage3,
        intermediaryRaw: arcUsdcAmt,
        baseOutRaw: bestBridge.amountOut,
        amountOutFormatted: stage3.amountOutFormatted || fromBaseUnits(stage3.amountOut || '0', toDec),
        amountInUsd: bestBridge.amountInUsd || stage3.amountInUsd || null,
        comparedPools: bridgeCands.length,
        routeLabel: label
      };
    }

    // 2. Target is Solana Token (e.g. 100 NEAR -> NVDAx, TSLAx, JUP, BONK): compare Direct 1Click vs Cross-Chain -> SOL -> Jupiter+Raydium
    if (toBc === 'sol' && contracts && typeof contracts.quoteSolanaJupiterSwap === 'function') {
      const canTryDirect = /^(nep141:|1cs_v1:)/i.test(resolvedDestAsset);
      const solRecip = solAddress || recipient;
      const directPromise = canTryDirect
        ? quoteIntentSwapOrWithdraw({
            originAsset: resolvedOriginAsset,
            destinationAsset: resolvedDestAsset,
            amountRaw: amtStr,
            slippageBps,
            recipient: solRecip,
            refundTo,
            nearAccountId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: true
          }).catch(() => null)
        : Promise.resolve(null);

      const relayPromise = (async () => {
        if (!toToken.contractAddress || toToken.contractAddress === SOL_NATIVE_WSOL) return null;
        const stage1 = await quoteBridgeToIntermediate(SOL_1CLICK_ASSET_ID, solRecip);
        if (!stage1 || !stage1.ok || !stage1.amountOut || BigInt(stage1.amountOut) <= 0n) return stage1;
        const stage2 = await contracts.quoteSolanaJupiterSwap({
          inputMint: SOL_NATIVE_WSOL,
          outputMint: toToken.contractAddress,
          amountRaw: stage1.amountOut,
          slippageBps
        });
        const toDec = typeof toToken.decimals === 'number' ? toToken.decimals : 6;
        return {
          ok: true,
          compositeType: 'CROSS_CHAIN_TO_SOL_DEX',
          stage1Quote: stage1,
          stage2DexQuote: stage2,
          intermediaryAssetId: SOL_1CLICK_ASSET_ID,
          intermediaryRaw: stage1.amountOut,
          depositAddress: null,
          memo: null,
          amountOut: String(stage2.outAmount),
          amountOutFormatted: fromBaseUnits(String(stage2.outAmount), toDec),
          amountInUsd: stage1.amountInUsd || null,
          amountOutUsd: null,
          comparedPools: stage2.comparedPools || 1,
          bestSource: stage2.bestSource || 'Jupiter V1',
          routeLabel: `1Click (➔SOL) + ${stage2.routeLabel || stage2.bestSource || 'Jupiter V1'}`,
          error: null
        };
      })().catch((err) => ({ ok: false, error: err && err.message ? err.message : 'SOL DEX relay failed' }));

      const [dirRes, relRes] = await Promise.allSettled([directPromise, relayPromise]);
      const candidates = [];
      const dirVal = dirRes.status === 'fulfilled' ? dirRes.value : null;
      if (dirVal && dirVal.ok && dirVal.amountOut && BigInt(dirVal.amountOut) > 0n) {
        candidates.push({ outBig: BigInt(dirVal.amountOut), payload: { ...dirVal, routeLabel: dirVal.routeLabel || '1Click Solver' } });
      }
      const relVal = relRes.status === 'fulfilled' ? relRes.value : null;
      if (relVal && relVal.ok && relVal.amountOut && BigInt(relVal.amountOut) > 0n) {
        candidates.push({ outBig: BigInt(relVal.amountOut), payload: relVal });
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
        return candidates[0].payload;
      }
      return relVal || dirVal || { ok: false, error: t('暂无跨链至 Solana DEX 报价', 'No Solana DEX relay quote available') };
    }

    // 3. Origin is Solana DEX Token (e.g. NVDAx / TSLAx / JUP -> NEAR / ETH / PRL / QTC)
    if (isOriginSolDex && contracts && typeof contracts.quoteSolanaJupiterSwap === 'function') {
      try {
        const stage1 = await contracts.quoteSolanaJupiterSwap({
          inputMint: fromToken.contractAddress,
          outputMint: SOL_NATIVE_WSOL,
          amountRaw: amtStr,
          slippageBps
        });
        const solRefund = solAddress || refundTo;
        const stage2 = await quoteIntentSwapOrWithdraw({
          originAsset: SOL_1CLICK_ASSET_ID,
          destinationAsset: resolvedDestAsset,
          amountRaw: stage1.outAmount,
          slippageBps,
          recipient,
          refundTo: solRefund,
          nearAccountId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true
        });
        if (!stage2 || !stage2.ok) return stage2 || { ok: false, error: t('第二阶段跨链询价失败', 'Stage 2 cross-chain quote failed') };
        return {
          ...stage2,
          ok: true,
          compositeType: 'SOL_DEX_TO_CROSS_CHAIN',
          stage1DexQuote: stage1,
          stage2Quote: stage2,
          intermediaryAssetId: SOL_1CLICK_ASSET_ID,
          intermediaryRaw: stage1.outAmount,
          comparedPools: stage1.comparedPools || 1,
          routeLabel: `${stage1.routeLabel || stage1.bestSource || 'Jupiter V1'} (➔SOL) + ${stage2.routeLabel || '1Click'}`
        };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : t('Solana DEX 跨链询价失败', 'SOL DEX cross-chain quote failed') };
      }
    }

    // 4. Concurrent Best-Price Competition for EVM & Cross-Chain pairs (Direct 1Click vs 1Click Native Hub + Chain DEX e.g. NEAR -> PONS/AERO/UNI/CAKE)
    const canTryDirectCross = /^(nep141:|1cs_v1:)/i.test(resolvedOriginAsset) && /^(nep141:|1cs_v1:)/i.test(resolvedDestAsset);
    const directPromise = canTryDirectCross
      ? quoteIntentSwapOrWithdraw({
          originAsset: resolvedOriginAsset,
          destinationAsset: resolvedDestAsset,
          amountRaw: amtStr,
          slippageBps,
          recipient,
          refundTo,
          nearAccountId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true
        }).catch(() => null)
      : Promise.resolve(null);

    const evmInterAsset = EVM_NATIVE_1CLICK_MAP[toBc];
    const evmRelayPromise = (isTargetEvmDex && evmInterAsset && contracts && typeof contracts.quoteEvmDexSwap === 'function')
      ? (async () => {
          const targetEvmRecip = evmAddress || recipient;
          const stage1 = await quoteBridgeToIntermediate(evmInterAsset, targetEvmRecip);
          if (!stage1 || !stage1.ok || !stage1.amountOut || BigInt(stage1.amountOut) <= 0n) {
            return stage1 || { ok: false, error: 'Stage 1 EVM bridge failed' };
          }
          const stage2 = await contracts.quoteEvmDexSwap({
            chainKey: toBc,
            srcToken: EVM_NATIVE_SENTINEL,
            destToken: toToken.contractAddress,
            amountRaw: stage1.amountOut,
            srcDecimals: 18,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
            slippageBps
          });
          if (!stage2 || !stage2.ok || !stage2.amountOut) {
            return stage2 || { ok: false, error: 'Stage 2 EVM DEX quote failed' };
          }
          return {
            ok: true,
            compositeType: 'CROSS_CHAIN_TO_EVM_DEX',
            stage1Quote: stage1,
            stage2DexQuote: stage2,
            intermediaryAssetId: evmInterAsset,
            intermediaryRaw: stage1.amountOut,
            depositAddress: null,
            memo: null,
            amountOut: String(stage2.amountOut),
            amountOutFormatted: stage2.amountOutFormatted,
            amountInUsd: stage1.amountInUsd || stage2.amountInUsd || null,
            amountOutUsd: stage2.amountOutUsd || null,
            comparedPools: stage2.comparedPools || 1,
            bestSource: stage2.bestSource || stage2.label,
            routeLabel: `1Click (➔${toBc.toUpperCase()}) + ${stage2.routeLabel || stage2.label}`,
            error: null
          };
        })().catch((err) => ({ ok: false, error: err && err.message ? err.message : 'EVM DEX relay failed' }))
      : Promise.resolve(null);

    const [dirSettled, relSettled] = await Promise.allSettled([directPromise, evmRelayPromise]);
    const dirVal = dirSettled.status === 'fulfilled' ? dirSettled.value : null;
    const relVal = relSettled.status === 'fulfilled' ? relSettled.value : null;
    const evmCandidates = [];
    if (dirVal && dirVal.ok && dirVal.amountOut && BigInt(dirVal.amountOut) > 0n) {
      evmCandidates.push({
        outBig: BigInt(dirVal.amountOut),
        payload: { ...dirVal, routeLabel: dirVal.routeLabel || '1Click Cross-Chain' }
      });
    }
    if (relVal && relVal.ok && relVal.amountOut && BigInt(relVal.amountOut) > 0n) {
      evmCandidates.push({ outBig: BigInt(relVal.amountOut), payload: relVal });
    }
    if (evmCandidates.length > 0) {
      evmCandidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
      const winner = { ...evmCandidates[0].payload };
      if (evmCandidates.length > 1) {
        winner.comparedPools = Math.max(2, Number(winner.comparedPools || 1) + 1);
      }
      return winner;
    }

    return dirVal || relVal || { ok: false, error: t('暂无跨链报价', 'No cross-chain quote available') };
  }

  /**
   * Signs an intents.near NEP-413 intent payload and publishes it to the Solver Relay
   * or executes execute_intents on-chain via NearCAContracts.
   */
  async function signAndPublishNep413Intent(params = {}) {
    const {
      nearAccountId,
      nearPrivateSeedHex,
      nearPublicKey,
      nearPrivateKey,
      intentActions,
      deadlineIso,
      quoteHashes = [],
      executionMode = 'relay',
      fallbackOnChain = false
    } = params;

    if (!nearAccountId || !nearPrivateSeedHex || !nearPublicKey) {
      throw new Error(t('缺少 NEAR 账户或签名私钥', 'Missing NEAR account credentials for NEP-413 signing'));
    }
    if (!Array.isArray(intentActions) || intentActions.length === 0) {
      throw new Error(t('缺少 intents 操作列表', 'intentActions must be a non-empty array'));
    }

    const cryptoEngine = getCryptoEngine();
    if (!cryptoEngine || typeof cryptoEngine.signNep413IntentMessageAsync !== 'function') {
      throw new Error(t('NEP-413 签名引擎不可用', 'NearCACrypto.signNep413IntentMessageAsync unavailable'));
    }

    const message = JSON.stringify({
      signer_id: nearAccountId,
      deadline: deadlineIso || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      intents: intentActions
    });

    const signed = await cryptoEngine.signNep413IntentMessageAsync({
      message,
      recipient: INTENTS_CONTRACT_ID,
      nearPrivateSeedHex,
      nearPublicKey
    });

    const nonceBase64 =
      signed.nonceBase64 ||
      (typeof signed.nonce === 'string'
        ? signed.nonce
        : signed.nonce
          ? bytesToBase64(signed.nonce)
          : '');
    const signatureStr =
      typeof signed.signature === 'string' && signed.signature.startsWith('ed25519:')
        ? signed.signature
        : `ed25519:${signed.signature}`;

    const signedData = {
      payload: {
        message,
        nonce: nonceBase64,
        recipient: INTENTS_CONTRACT_ID
      },
      standard: 'nep413',
      signature: signatureStr,
      public_key: nearPublicKey
    };

    async function executeOnChain() {
      const contracts = getContractsEngine();
      if (!contracts || typeof contracts.signAndSendNearFunctionCall !== 'function') {
        throw new Error(t('链上合约引擎不可用', 'NearCAContracts.signAndSendNearFunctionCall unavailable'));
      }
      if (!nearPrivateKey) {
        throw new Error(t('链上执行需要 nearPrivateKey', 'nearPrivateKey required for on-chain execute_intents'));
      }
      const txHash = await contracts.signAndSendNearFunctionCall({
        accountId: nearAccountId,
        publicKeyStr: nearPublicKey,
        privateKeyStr: nearPrivateKey,
        receiverId: INTENTS_CONTRACT_ID,
        methodName: 'execute_intents',
        argsJson: JSON.stringify({ signed: [signedData] }),
        gas: '100000000000000',
        depositYocto: '0'
      });
      return {
        signedPayload: signed,
        relayResult: { status: 'ONCHAIN_EXECUTED', txHash }
      };
    }

    if (executionMode === 'onchain') {
      return executeOnChain();
    }

    try {
      const resp = await fetchJsonWithTimeout(
        SOLVER_RELAY_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `publish_intent_${Date.now()}`,
            method: 'publish_intent',
            params: [
              {
                signed_data: signedData,
                quote_hashes: Array.isArray(quoteHashes) ? quoteHashes : []
              }
            ]
          })
        },
        12000
      );

      if (!resp.ok || !resp.data) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText || 'Solver relay failed'}`);
      }
      if (resp.data.error) {
        throw new Error(resp.data.error.message || JSON.stringify(resp.data.error));
      }

      return {
        signedPayload: signed,
        relayResult: resp.data.result !== undefined ? resp.data.result : resp.data
      };
    } catch (err) {
      if (fallbackOnChain && nearPrivateKey) {
        return executeOnChain();
      }
      throw err;
    }
  }

  /**
   * Polls 1Click swap/withdraw order status by depositAddress.
   */
  async function fetchSwapOrderStatus(depositAddress) {
    const addr = String(depositAddress || '').trim();
    if (!addr) {
      return { ok: false, status: null, depositAddress: '', data: null, error: t('缺少充值地址', 'Missing depositAddress') };
    }
    try {
      const resp = await fetchJsonWithTimeout(
        `${ONECLICK_API_URL}/status?depositAddress=${encodeURIComponent(addr)}`,
        {},
        DEFAULT_TIMEOUT_MS
      );
      if (!resp.ok || !resp.data) {
        const errMsg = (resp.data && (resp.data.message || resp.data.error)) || `HTTP ${resp.status}`;
        return { ok: false, status: null, depositAddress: addr, data: resp.data, error: String(errMsg) };
      }
      const status = resp.data.status || resp.data.state || 'PENDING';
      return {
        ok: true,
        status,
        depositAddress: addr,
        data: resp.data,
        error: null
      };
    } catch (err) {
      return {
        ok: false,
        status: null,
        depositAddress: addr,
        data: null,
        error: err && err.message ? err.message : t('状态查询失败', 'Status fetch failed')
      };
    }
  }

  /**
   * Submits an external chain deposit transaction hash to speed up 1Click intent fulfillment.
   */
  async function submitExternalDepositTxHash({ depositAddress, txHash, nearSenderAccount } = {}) {
    const depAddr = String(depositAddress || '').trim();
    const hash = String(txHash || '').trim();
    if (!depAddr || !hash) {
      return { ok: false, data: null, error: t('缺少充值地址或交易哈希', 'Missing depositAddress or txHash') };
    }

    const payload = { depositAddress: depAddr, txHash: hash };
    if (nearSenderAccount) {
      payload.nearSenderAccount = String(nearSenderAccount).trim();
    }

    try {
      const resp = await fetchJsonWithTimeout(
        `${ONECLICK_API_URL}/deposit/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        },
        DEFAULT_TIMEOUT_MS
      );
      if (!resp.ok) {
        const errMsg = (resp.data && (resp.data.message || resp.data.error)) || `HTTP ${resp.status}`;
        return { ok: false, data: resp.data, error: String(errMsg) };
      }
      return { ok: true, data: resp.data, error: null };
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err && err.message ? err.message : t('提交充值凭证失败', 'Deposit submit failed')
      };
    }
  }

  function createTransferIntent({ receiverId, tokens }) {
    return {
      intent: 'transfer',
      receiver_id: receiverId,
      tokens
    };
  }

  function createTokenDiffIntent({ diff }) {
    return {
      intent: 'token_diff',
      diff
    };
  }

  function createFtWithdrawIntent({ token, receiverId, amount, memo = null }) {
    const action = {
      intent: 'ft_withdraw',
      token,
      receiver_id: receiverId,
      amount: String(amount)
    };
    if (memo) action.memo = memo;
    return action;
  }

  function createNativeWithdrawIntent({ receiverId, amount }) {
    return {
      intent: 'native_withdraw',
      receiver_id: receiverId,
      amount: String(amount)
    };
  }

  const NearCAIntents = {
    NEAR_RPC_URL,
    ONECLICK_API_URL,
    SOLVER_RELAY_URL,
    REF_SMART_ROUTER_URL,
    DCL_CONTRACT_ID,
    NEAR_DCL_POOLS,
    INTENTS_CONTRACT_ID,
    DEFAULT_REFERRAL_ACCOUNT,
    DEFAULT_NEAR_NEP141_CONTRACTS,
    PRL_PEARL_ASSET_ID,
    PRL_NEAR_ASSET_ID,
    PRL_NEAR_CONTRACT,
    QTC_ORIGIN_ASSET_ID,
    QTC_NEAR_ASSET_ID,
    QTC_NEAR_CONTRACT,
    NEAR_USDC_ASSET_ID,
    NEAR_USDC_CONTRACT,
    ARC_USDC_CONTRACT,
    BASE_USDC_1CLICK_ID,
    BASE_USDC_EVM,
    fetchNearNativeBalance,
    fetchNearNep141Balances,
    fetchIntentsUnifiedBalances,
    fetchLiveDefuseTokenPrices,
    searchJupiterTokensV2,
    quoteNearDclPoolSwap,
    requestCrossChainDepositAddress,
    quoteRelayBridge,
    quoteLifiBridge,
    quoteBestNearPairSwap,
    quoteCompositePrlSwap,
    quoteCrossChainWithDexRelay,
    quoteIntentSwapOrWithdraw,
    resolveOneClickAssetId,
    signAndPublishNep413Intent,
    fetchSwapOrderStatus,
    submitExternalDepositTxHash,
    createTransferIntent,
    createTokenDiffIntent,
    createFtWithdrawIntent,
    createNativeWithdrawIntent,
    getCachedDefuseTokens: () => _cachedDefuseTokens.slice(),
    toBaseUnits,
    fromBaseUnits
  };

  if (root) {
    root.NearCAIntents = NearCAIntents;
    root.NearCA = root.NearCA || {};
    root.NearCA.intents = NearCAIntents;
  }
  if (typeof window !== 'undefined') {
    window.NearCAIntents = NearCAIntents;
    window.NearCA = window.NearCA || {};
    window.NearCA.intents = NearCAIntents;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NearCAIntents;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
