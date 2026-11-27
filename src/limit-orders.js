/**
 * Nexus Wallet - Multi-Chain Limit Order Engine
 * Supports:
 *  - NEAR Protocol: Ref / Rhea DCL V2 (`dclv2.ref-labs.near`) on-chain LimitOrderWithSwap, claim & cancel
 *  - Solana: Jupiter Trigger V1 (`lite-api.jup.ag/trigger/v1`) escrow limit orders & cancel
 *  - EVM (ETH, Base, Arbitrum, BSC, Polygon, Avalanche): CoW Protocol (`api.cow.fi`) gasless EIP-712 limit orders
 * Attaches to globalThis.NearCALimitOrders, window.NearCALimitOrders, globalThis.NearCA.limitOrders, and module.exports.
 */
(function (root) {
  'use strict';

  const DCL_CONTRACT_ID = 'dclv2.ref-labs.near';
  const DCL_STORAGE_DEPOSIT_NEAR = 0.5;
  const DCL_STORAGE_DEPOSIT_YOCTO = '500000000000000000000000';
  const DCL_GAS_RESERVE_NEAR = 0.05;

  const JUPITER_BASE_URL = (root && root.NEXUS_JUPITER_BASE_URL) || 'https://lite-api.jup.ag';
  const JUPITER_TRIGGER_URL = `${JUPITER_BASE_URL}/trigger/v1`;
  const SOL_LIMIT_MIN_USD = 5;
  const SOL_LIMIT_RENT_SOL = 0.0025;
  const SOL_LIMIT_GAS_RESERVE = 0.005;
  const SOL_NATIVE_MINT = 'So11111111111111111111111111111111111111112';
  const SPL_TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

  const NATIVE_EVM_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const GPV2_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
  const GPV2_VAULT_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';
  const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';
  const COW_DEFAULT_TIMEOUT_MS = 10_000;

  const COW_CHAINS = {
    eth: {
      chainKey: 'eth',
      slug: 'mainnet',
      chainId: 1,
      name: 'Ethereum',
      minUsd: 10,
      nativeSymbol: 'ETH',
      wrappedSymbol: 'WETH',
      wrappedNative: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      gasReserve: 0.0015
    },
    base: {
      chainKey: 'base',
      slug: 'base',
      chainId: 8453,
      name: 'Base',
      minUsd: 2,
      nativeSymbol: 'ETH',
      wrappedSymbol: 'WETH',
      wrappedNative: '0x4200000000000000000000000000000000000006',
      gasReserve: 0.0002
    },
    arb: {
      chainKey: 'arb',
      slug: 'arbitrum_one',
      chainId: 42161,
      name: 'Arbitrum',
      minUsd: 2,
      nativeSymbol: 'ETH',
      wrappedSymbol: 'WETH',
      wrappedNative: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      gasReserve: 0.0002
    },
    bsc: {
      chainKey: 'bsc',
      slug: 'bnb',
      chainId: 56,
      name: 'BSC',
      minUsd: 2,
      nativeSymbol: 'BNB',
      wrappedSymbol: 'WBNB',
      wrappedNative: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      gasReserve: 0.0005
    },
    pol: {
      chainKey: 'pol',
      slug: 'polygon',
      chainId: 137,
      name: 'Polygon',
      minUsd: 2,
      nativeSymbol: 'POL',
      wrappedSymbol: 'WPOL',
      wrappedNative: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      gasReserve: 0.05
    },
    avax: {
      chainKey: 'avax',
      slug: 'avalanche',
      chainId: 43114,
      name: 'Avalanche',
      minUsd: 2,
      nativeSymbol: 'AVAX',
      wrappedSymbol: 'WAVAX',
      wrappedNative: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      gasReserve: 0.005
    }
  };

  const NEAR_DCL_LIMIT_POOLS = {
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
    'token.rhealab.near|usdt.tether-token.near': [
      'token.rhealab.near|usdt.tether-token.near|400',
      'token.rhealab.near|usdt.tether-token.near|100'
    ],
    'otoken.rhealab.near|wrap.near': ['otoken.rhealab.near|wrap.near|100'],
    'lst.rhealab.near|wrap.near': ['lst.rhealab.near|wrap.near|100'],
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near|2000',
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near|400',
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near|100'
    ],
    'usdt.tether-token.near|wrap.near': [
      'usdt.tether-token.near|wrap.near|2000',
      'usdt.tether-token.near|wrap.near|400',
      'usdt.tether-token.near|wrap.near|100'
    ],
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|usdt.tether-token.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|usdt.tether-token.near|400'
    ],
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near|2000'
    ],
    'qtc.omft.near|wrap.near': ['qtc.omft.near|wrap.near|10000'],
    'qtc.omft.near|token.rhealab.near': ['qtc.omft.near|token.rhealab.near|2000']
  };

  const NEAR_LIMIT_TOKEN_META = {
    'wrap.near': { symbol: 'wNEAR', name: 'Wrapped NEAR', decimals: 24, assetId: 'limit:near:wrap.near' },
    'token.rhealab.near': { symbol: 'RHEA', name: 'Rhea', decimals: 18, assetId: 'nep141:token.rhealab.near' },
    'otoken.rhealab.near': { symbol: 'oRHEA', name: 'oRHEA', decimals: 18, assetId: 'nep141:otoken.rhealab.near' },
    'xtoken.rhealab.near': { symbol: 'xRHEA', name: 'xRHEA', decimals: 18, assetId: 'nep141:xtoken.rhealab.near' },
    'lst.rhealab.near': { symbol: 'rNEAR', name: 'rNEAR', decimals: 24, assetId: 'nep141:lst.rhealab.near' },
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': {
      symbol: 'USDC',
      name: 'USD Coin (NEAR)',
      decimals: 6,
      assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'
    },
    'usdt.tether-token.near': {
      symbol: 'USDT',
      name: 'Tether USD (NEAR)',
      decimals: 6,
      assetId: 'nep141:usdt.tether-token.near'
    },
    'qtc.omft.near': {
      symbol: 'QTC',
      name: 'Quantus (NEAR)',
      decimals: 12,
      assetId: '1cs_v1:near:nep141:qtc.omft.near'
    }
  };

  const LIMIT_EVM_FALLBACK_TOKENS = {
    pol: [
      { symbol: 'WPOL', name: 'Wrapped POL', blockchain: 'pol', assetId: 'pol:0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', contractAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', decimals: 18, networkName: 'Polygon', price: null },
      { symbol: 'USDC', name: 'USD Coin (Polygon)', blockchain: 'pol', assetId: 'pol:0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', contractAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6, networkName: 'Polygon', price: null },
      { symbol: 'USDT', name: 'Tether USD (Polygon)', blockchain: 'pol', assetId: 'pol:0xc2132D05D31c914a87C6611C10748AEb04B58e8F', contractAddress: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6, networkName: 'Polygon', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether (Polygon)', blockchain: 'pol', assetId: 'pol:0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', contractAddress: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', decimals: 18, networkName: 'Polygon', price: null }
    ],
    avax: [
      { symbol: 'WAVAX', name: 'Wrapped AVAX', blockchain: 'avax', assetId: 'avax:0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', contractAddress: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', decimals: 18, networkName: 'Avalanche', price: null },
      { symbol: 'USDC', name: 'USD Coin (Avalanche)', blockchain: 'avax', assetId: 'avax:0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', contractAddress: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6, networkName: 'Avalanche', price: null },
      { symbol: 'USDT', name: 'Tether USD (Avalanche)', blockchain: 'avax', assetId: 'avax:0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', contractAddress: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6, networkName: 'Avalanche', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether (Avalanche)', blockchain: 'avax', assetId: 'avax:0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', contractAddress: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB', decimals: 18, networkName: 'Avalanche', price: null }
    ]
  };

  const COW_ORDER_EIP712_TYPES = {
    Order: [
      { name: 'sellToken', type: 'address' },
      { name: 'buyToken', type: 'address' },
      { name: 'receiver', type: 'address' },
      { name: 'sellAmount', type: 'uint256' },
      { name: 'buyAmount', type: 'uint256' },
      { name: 'validTo', type: 'uint32' },
      { name: 'appData', type: 'bytes32' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'kind', type: 'string' },
      { name: 'partiallyFillable', type: 'bool' },
      { name: 'sellTokenBalance', type: 'string' },
      { name: 'buyTokenBalance', type: 'string' }
    ]
  };

  const COW_CANCEL_EIP712_TYPES = {
    OrderCancellations: [{ name: 'orderUids', type: 'bytes[]' }]
  };

  function safeRequire(relPath) {
    if (typeof require !== 'function') return null;
    try {
      return require(relPath);
    } catch (_) {
      return null;
    }
  }

  function getContracts() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCAContracts) ||
      (typeof window !== 'undefined' && window.NearCAContracts) ||
      safeRequire('./chain-contracts.js')
    );
  }

  function getIntents() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCAIntents) ||
      (typeof window !== 'undefined' && window.NearCAIntents) ||
      safeRequire('./near-intents.js')
    );
  }

  function getState() {
    return (
      (typeof globalThis !== 'undefined' && (globalThis.NearCAState || globalThis.state)) ||
      (typeof window !== 'undefined' && (window.NearCAState || window.state)) ||
      safeRequire('./state.js')
    );
  }

  function getEthers() {
    const g = typeof globalThis !== 'undefined' && globalThis.ethers;
    const w = typeof window !== 'undefined' && window.ethers;
    return g || w || safeRequire('../ethers.umd.min.js');
  }

  function t(zh, en) {
    const st = getState();
    if (st && typeof st.t === 'function') return st.t(zh, en);
    const lang = st && st.lang ? String(st.lang).toLowerCase() : 'zh';
    return lang.startsWith('en') ? en : zh;
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = COW_DEFAULT_TIMEOUT_MS) {
    const fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw new Error('fetch API unavailable');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const extSignal = options && options.signal ? options.signal : null;
    let onExtAbort = null;
    if (extSignal && controller) {
      if (extSignal.aborted) controller.abort();
      else {
        onExtAbort = () => controller.abort();
        extSignal.addEventListener('abort', onExtAbort, { once: true });
      }
    }
    try {
      const res = await fetchFn(url, {
        ...options,
        signal: controller ? controller.signal : extSignal || undefined,
        headers: {
          Accept: 'application/json',
          ...((options && options.headers) || {})
        }
      });
      const text = typeof res.text === 'function' ? await res.text() : '';
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_) {
          data = null;
        }
      } else if (typeof res.json === 'function') {
        data = await res.json().catch(() => null);
      }
      return { ok: Boolean(res.ok), status: res.status || 0, data, rawText: text };
    } finally {
      if (timer) clearTimeout(timer);
      if (extSignal && onExtAbort) extSignal.removeEventListener('abort', onExtAbort);
    }
  }

  function toBaseUnits(amountInput, decimals) {
    const contracts = getContracts();
    if (contracts && typeof contracts.toBaseUnits === 'function') {
      return contracts.toBaseUnits(amountInput, decimals);
    }
    const dec = Number(decimals) || 0;
    const str = String(amountInput || '').trim();
    const num = Number(str);
    if (!Number.isFinite(num) || num <= 0) return '0';
    let norm = str;
    if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(norm)) {
      const [mantissa, expStr] = norm.toLowerCase().split('e');
      const exp = parseInt(expStr, 10);
      const [mWhole, mFrac = ''] = mantissa.replace(/^[+-]/, '').split('.');
      const digits = mWhole + mFrac;
      const pos = mWhole.length + exp;
      if (pos <= 0) {
        norm = '0.' + '0'.repeat(-pos) + digits;
      } else if (pos >= digits.length) {
        norm = digits + '0'.repeat(pos - digits.length);
      } else {
        norm = digits.slice(0, pos) + '.' + digits.slice(pos);
      }
    }
    const [wholeRaw, fracRaw = ''] = norm.split('.');
    const whole = (wholeRaw || '0').replace(/\D/g, '') || '0';
    const frac = fracRaw.replace(/\D/g, '').slice(0, dec).padEnd(dec, '0');
    return (whole + frac).replace(/^0+/, '') || '0';
  }

  function fromBaseUnits(baseStr, decimals) {
    const contracts = getContracts();
    if (contracts && typeof contracts.fromBaseUnits === 'function') {
      return contracts.fromBaseUnits(baseStr, decimals);
    }
    const dec = Number(decimals) || 0;
    const raw = String(baseStr || '0').trim();
    if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) return '0';
    if (dec === 0) return raw.replace(/^0+/, '') || '0';
    const padded = raw.padStart(dec + 1, '0');
    const idx = padded.length - dec;
    const whole = padded.slice(0, idx).replace(/^0+/, '') || '0';
    const frac = padded.slice(idx).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
  }

  // ==================== 1. NEAR Ref / Rhea DCL V2 Limit Orders ====================

  function getMergedNearDclMap() {
    const contracts = getContracts();
    const base = (contracts && contracts.NEAR_DCL_POOLS) || {};
    return { ...base, ...NEAR_DCL_LIMIT_POOLS };
  }

  function normalizeNearContract(id) {
    const s = String(id || '').trim();
    if (!s) return '';
    if (s.toLowerCase() === 'near' || s === 'nep141:wrap.near' || s === 'limit:near:wrap.near') return 'wrap.near';
    if (s.startsWith('1cs_v1:near:nep141:')) return s.slice('1cs_v1:near:nep141:'.length);
    if (s.startsWith('nep141:')) return s.slice('nep141:'.length);
    return s;
  }

  function resolveNearLimitPoolIds(tokenA, tokenB) {
    const a = normalizeNearContract(tokenA);
    const b = normalizeNearContract(tokenB);
    if (!a || !b || a === b) return [];
    const map = getMergedNearDclMap();
    const hit = map[`${a}|${b}`] || map[`${b}|${a}`];
    if (!hit) return [];
    return Array.isArray(hit) ? hit : [hit];
  }

  function resolveNearLimitPoolId(tokenA, tokenB) {
    return resolveNearLimitPoolIds(tokenA, tokenB)[0] || null;
  }

  function getNearLimitSellTokens() {
    const map = getMergedNearDclMap();
    const seen = new Set();
    for (const pairKey of Object.keys(map)) {
      const [a, b] = pairKey.split('|');
      if (a) seen.add(a);
      if (b) seen.add(b);
    }
    return Array.from(seen);
  }

  function getNearLimitCounterTokens(sellContract) {
    const sellId = normalizeNearContract(sellContract);
    if (!sellId) return [];
    const map = getMergedNearDclMap();
    const counters = new Set();
    for (const pairKey of Object.keys(map)) {
      const [a, b] = pairKey.split('|');
      if (a === sellId && b) counters.add(b);
      else if (b === sellId && a) counters.add(a);
    }
    return Array.from(counters);
  }

  function feeToPointDelta(fee) {
    const f = Number(fee);
    if (f === 100) return 1;
    if (f === 400) return 8;
    if (f === 2000) return 40;
    if (f === 10000) return 200;
    return 40;
  }

  function parsePoolDescriptor(poolId, poolInfo = null) {
    const parts = String(poolId || '').split('|');
    const tokenX = (poolInfo && (poolInfo.token_x || poolInfo.tokenX)) || parts[0] || '';
    const tokenY = (poolInfo && (poolInfo.token_y || poolInfo.tokenY)) || parts[1] || '';
    const fee = Number((poolInfo && poolInfo.fee) || parts[2] || 2000);
    const pointDelta = Number((poolInfo && (poolInfo.point_delta || poolInfo.pointDelta)) || feeToPointDelta(fee));
    return { tokenX, tokenY, fee, pointDelta };
  }

  async function fetchNearDclPoolInfo(poolId) {
    const contracts = getContracts();
    if (!contracts || typeof contracts.viewNearContractCall !== 'function') return null;
    const raw = await contracts.viewNearContractCall(DCL_CONTRACT_ID, 'get_pool', { pool_id: poolId }).catch(() => null);
    if (!raw || !raw.pool_id) return null;
    return {
      poolId: raw.pool_id,
      tokenX: raw.token_x,
      tokenY: raw.token_y,
      fee: Number(raw.fee),
      pointDelta: Number(raw.point_delta),
      currentPoint: Number(raw.current_point),
      state: raw.state || 'Running'
    };
  }

  function clampDclPoint(pt, delta) {
    const d = Math.max(1, Number(delta) || 1);
    const minPt = -Math.floor(800000 / d) * d;
    const maxPt = Math.floor(800000 / d) * d;
    const snapped = Math.round(Number(pt) / d) * d;
    return Math.max(minPt, Math.min(maxPt, snapped));
  }

  function computeRawDclPoint({ rateOutPerIn, sellToken, buyToken, poolId, poolInfo = null, sellDecimals = 18, buyDecimals = 18 }) {
    const rate = Number(rateOutPerIn);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(t('请输入有效的目标兑换价格', 'Enter a valid target price'));
    }
    const desc = parsePoolDescriptor(poolId || (poolInfo && poolInfo.poolId), poolInfo);
    const sellNorm = normalizeNearContract(sellToken);
    const buyNorm = normalizeNearContract(buyToken);
    const sellIsX = sellNorm === desc.tokenX;
    if (!sellIsX && sellNorm !== desc.tokenY) {
      throw new Error(t('代币与所选 DCL 池不匹配', 'Token does not match selected DCL pool'));
    }
    if ((sellIsX && buyNorm !== desc.tokenY) || (!sellIsX && buyNorm !== desc.tokenX)) {
      throw new Error(t('买入代币与所选 DCL 池不匹配', 'Counter token does not match DCL pool'));
    }
    const decX = sellIsX ? Number(sellDecimals) : Number(buyDecimals);
    const decY = sellIsX ? Number(buyDecimals) : Number(sellDecimals);
    const humanYPerX = sellIsX ? rate : (1 / rate);
    const rawYPerX = humanYPerX * Math.pow(10, decY - decX);
    const rawPoint = Math.log(rawYPerX) / Math.log(1.0001);
    return {
      rawPoint,
      sellIsX,
      decX,
      decY,
      pointDelta: desc.pointDelta
    };
  }

  function priceToDclPoint(opts) {
    const info = computeRawDclPoint(opts);
    return clampDclPoint(info.rawPoint, info.pointDelta);
  }

  function dclPointToPrice({ point, sellToken, poolId, poolInfo = null, sellDecimals = 18, buyDecimals = 18 }) {
    const desc = parsePoolDescriptor(poolId || (poolInfo && poolInfo.poolId), poolInfo);
    const sellNorm = normalizeNearContract(sellToken);
    const sellIsX = sellNorm === desc.tokenX;
    const decX = sellIsX ? Number(sellDecimals) : Number(buyDecimals);
    const decY = sellIsX ? Number(buyDecimals) : Number(sellDecimals);
    const rawYPerX = Math.pow(1.0001, Number(point));
    const humanYPerX = rawYPerX * Math.pow(10, decX - decY);
    return sellIsX ? humanYPerX : (1 / humanYPerX);
  }

  function resolveSplitTwoTickPoints(opts) {
    const info = computeRawDclPoint(opts);
    const d = info.pointDelta;
    const low = clampDclPoint(Math.floor(info.rawPoint / d) * d, d);
    const high = clampDclPoint(Math.ceil(info.rawPoint / d) * d, d);
    if (low === high) {
      const betterStep = info.sellIsX ? d : -d;
      return [low, clampDclPoint(low + betterStep, d)];
    }
    return info.sellIsX ? [low, high] : [high, low];
  }

  async function checkNearDclStorage(accountId) {
    const acct = String(accountId || '').trim();
    if (!acct) return { registered: false, totalYocto: '0', depositNear: DCL_STORAGE_DEPOSIT_NEAR };
    const contracts = getContracts();
    const bal = contracts && typeof contracts.viewNearContractCall === 'function'
      ? await contracts.viewNearContractCall(DCL_CONTRACT_ID, 'storage_balance_of', { account_id: acct }).catch(() => null)
      : null;
    const registered = Boolean(bal && typeof bal === 'object' && BigInt(String(bal.total || '0')) > 0n);
    return {
      registered,
      totalYocto: (bal && bal.total) ? String(bal.total) : '0',
      depositNear: registered ? 0 : DCL_STORAGE_DEPOSIT_NEAR
    };
  }

  async function wrapNearForLimit({ wallet, amountRaw }) {
    const contracts = getContracts();
    if (!contracts) throw new Error('Chain contracts module unavailable');
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const amtStr = String(amountRaw || '0').trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('封装数量必须大于 0', 'Wrap amount must be positive'));
    }
    const humanAmt = Number(fromBaseUnits(amtStr, 24));
    const nearBal = Number(contracts.resolveWalletChainBalance(wallet, 'near') || 0);
    const gasReserve = 0.05;
    if (nearBal + 1e-9 < humanAmt + gasReserve) {
      throw new Error(
        t(
          `NEAR 余额不足以封装 (需保留 ${gasReserve} NEAR 作 Gas，当前可用: ${nearBal.toFixed(4)})`,
          `Insufficient NEAR to wrap (reserve ${gasReserve} NEAR for gas, available: ${nearBal.toFixed(4)})`
        )
      );
    }

    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const accountId = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    await contracts.ensureNearNep141StorageRegistered({
      resolvedWallet,
      accountId,
      tokenContract: 'wrap.near'
    });
    const txHash = await contracts.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: resolvedWallet.nearPublicKey,
      privateKeyStr: resolvedWallet.nearPrivateKey,
      receiverId: 'wrap.near',
      methodName: 'near_deposit',
      argsJson: '{}',
      gas: '30000000000000',
      depositYocto: amtStr
    });
    return {
      ok: true,
      txHash,
      explorerUrl: `https://nearblocks.io/txns/${txHash}`
    };
  }

  async function placeNearDclLimitOrder({
    wallet,
    poolId,
    sellToken,
    buyToken,
    amountRaw,
    point,
    splitTwoTicks = false,
    rateOutPerIn = null,
    poolInfo = null,
    sellDecimals = 18,
    buyDecimals = 18,
    sellSymbol = 'TOKEN',
    tokenBalance = null
  } = {}) {
    const contracts = getContracts();
    if (!contracts) throw new Error('Chain contracts module unavailable');
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));

    const sellId = normalizeNearContract(sellToken);
    const buyId = normalizeNearContract(buyToken);
    const amtStr = String(amountRaw || '0').trim();
    if (!sellId || !buyId || sellId === buyId || !/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('限价单参数无效', 'Invalid limit order parameters'));
    }

    const targetPoolId = poolId || resolveNearLimitPoolId(sellId, buyId);
    if (!targetPoolId) {
      throw new Error(t('该币对暂未开通限价池', 'No limit order pool for this pair'));
    }

    const humanSell = Number(fromBaseUnits(amtStr, sellDecimals));
    const currentWrapped = Number(wallet.nearNep141Balances?.[sellId]?.formatted || 0);
    const nativeNearBal = Number(contracts.resolveWalletChainBalance(wallet, 'near') || 0);
    const effectiveSellBal = tokenBalance !== null && tokenBalance !== undefined
      ? Number(tokenBalance)
      : (sellId === 'wrap.near' ? (currentWrapped + Math.max(0, nativeNearBal - 0.05)) : currentWrapped);
    if (!Number.isFinite(effectiveSellBal) || effectiveSellBal < humanSell) {
      throw new Error(
        t(
          `${sellSymbol} 余额不足 (当前可用: ${effectiveSellBal.toFixed(6)})`,
          `Insufficient ${sellSymbol} balance (available: ${effectiveSellBal.toFixed(6)})`
        )
      );
    }

    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    if (!sender || !resolvedWallet.nearPublicKey || !resolvedWallet.nearPrivateKey) {
      throw new Error(t('缺少 NEAR 签名凭据', 'Missing NEAR signing credentials'));
    }

    const storageState = await checkNearDclStorage(sender);
    const minNearNeeded = storageState.registered ? DCL_GAS_RESERVE_NEAR : (DCL_STORAGE_DEPOSIT_NEAR + DCL_GAS_RESERVE_NEAR);
    let shortfallBig = 0n;
    if (sellId === 'wrap.near') {
      const liveWrapStr = typeof contracts.viewNearContractCall === 'function'
        ? await contracts.viewNearContractCall('wrap.near', 'ft_balance_of', { account_id: sender }).catch(() => null)
        : null;
      const liveWrapBig = liveWrapStr && /^\d+$/.test(String(liveWrapStr).trim())
        ? BigInt(String(liveWrapStr).trim())
        : BigInt(toBaseUnits(String(currentWrapped), 24));
      const neededBig = BigInt(amtStr);
      if (liveWrapBig < neededBig) {
        shortfallBig = neededBig - liveWrapBig;
      }
    }
    const shortfallNear = shortfallBig > 0n ? Number(fromBaseUnits(shortfallBig.toString(), 24)) : 0;
    const totalNearNeeded = minNearNeeded + shortfallNear;
    const nearAvail = Number(contracts.resolveWalletChainBalance(resolvedWallet, 'near') || 0);
    if (nearAvail + 1e-9 < totalNearNeeded) {
      throw new Error(
        t(
          `NEAR 余额不足 (需 ${totalNearNeeded.toFixed(2)} NEAR 作${storageState.registered ? ' Gas' : '存储押金与 Gas'}，当前: ${nearAvail.toFixed(4)})`,
          `Insufficient NEAR (need ${totalNearNeeded.toFixed(2)} NEAR for ${storageState.registered ? 'gas' : 'storage deposit + gas'}, available: ${nearAvail.toFixed(4)})`
        )
      );
    }

    if (shortfallBig > 0n) {
      await wrapNearForLimit({ wallet: resolvedWallet, amountRaw: shortfallBig.toString() });
      if (resolvedWallet.nativeBalances && typeof resolvedWallet.nativeBalances.near === 'number') {
        resolvedWallet.nativeBalances.near = Math.max(0, resolvedWallet.nativeBalances.near - shortfallNear - 0.005);
      }
    }

    await contracts.ensureNearNep141StorageRegistered({
      resolvedWallet,
      accountId: sender,
      tokenContract: buyId
    });

    if (!storageState.registered) {
      await contracts.signAndSendNearFunctionCall({
        accountId: sender,
        publicKeyStr: resolvedWallet.nearPublicKey,
        privateKeyStr: resolvedWallet.nearPrivateKey,
        receiverId: DCL_CONTRACT_ID,
        methodName: 'storage_deposit',
        argsJson: JSON.stringify({ registration_only: true, account_id: sender }),
        gas: '30000000000000',
        depositYocto: DCL_STORAGE_DEPOSIT_YOCTO
      });
    }

    const legs = [];
    const totalBig = BigInt(amtStr);
    if (splitTwoTicks && totalBig >= 2n) {
      const pts = (rateOutPerIn && Number(rateOutPerIn) > 0)
        ? resolveSplitTwoTickPoints({ rateOutPerIn, sellToken: sellId, buyToken: buyId, poolId: targetPoolId, poolInfo, sellDecimals, buyDecimals })
        : [Number(point), Number(point) + (sellId === parsePoolDescriptor(targetPoolId, poolInfo).tokenX ? parsePoolDescriptor(targetPoolId, poolInfo).pointDelta : -parsePoolDescriptor(targetPoolId, poolInfo).pointDelta)];
      const half1 = totalBig / 2n;
      const half2 = totalBig - half1;
      legs.push({ point: pts[0], amount: half1.toString() });
      if (half2 > 0n) legs.push({ point: pts[1], amount: half2.toString() });
    } else {
      legs.push({ point: Number(point), amount: amtStr });
    }

    const txHashes = [];
    for (let idx = 0; idx < legs.length; idx++) {
      const leg = legs[idx];
      try {
        const txHash = await contracts.signAndSendNearFunctionCall({
          accountId: sender,
          publicKeyStr: resolvedWallet.nearPublicKey,
          privateKeyStr: resolvedWallet.nearPrivateKey,
          receiverId: sellId,
          methodName: 'ft_transfer_call',
          argsJson: JSON.stringify({
            receiver_id: DCL_CONTRACT_ID,
            amount: leg.amount,
            msg: JSON.stringify({
              LimitOrderWithSwap: {
                pool_id: targetPoolId,
                buy_token: buyId,
                point: leg.point,
                client_id: '',
                referral_id: ''
              }
            })
          }),
          gas: '180000000000000',
          depositYocto: '1'
        });
        if (txHash) txHashes.push(txHash);
      } catch (legErr) {
        if (txHashes.length > 0) {
          const partialErr = new Error(
            t(
              `第 1 档已上链 (${txHashes[0].slice(0, 8)}...)，第 ${idx + 1} 档失败: ${legErr?.message || '未知错误'}`,
              `Leg 1 placed (${txHashes[0].slice(0, 8)}...), leg ${idx + 1} failed: ${legErr?.message || 'Unknown'}`
            )
          );
          partialErr.partialTxHashes = txHashes;
          throw partialErr;
        }
        throw legErr;
      }
    }

    return {
      ok: true,
      chain: 'near',
      poolId: targetPoolId,
      txHash: txHashes[0] || '',
      txHashes,
      legs,
      explorerUrl: txHashes[0] ? `https://nearblocks.io/txns/${txHashes[0]}` : ''
    };
  }

  async function fetchNearDclOrders(accountId) {
    const acct = String(accountId || '').trim();
    if (!acct) return { active: [], history: [], userAssets: {} };
    const contracts = getContracts();
    if (!contracts || typeof contracts.viewNearContractCall !== 'function') {
      return { active: [], history: [], userAssets: {} };
    }
    const [activeRaw, historyRaw, assetsRaw] = await Promise.all([
      contracts.viewNearContractCall(DCL_CONTRACT_ID, 'list_active_orders', { account_id: acct }).catch(() => []),
      contracts.viewNearContractCall(DCL_CONTRACT_ID, 'list_history_orders', { account_id: acct }).catch(() => []),
      contracts.viewNearContractCall(DCL_CONTRACT_ID, 'list_user_assets', { account_id: acct }).catch(() => ({}))
    ]);
    return {
      active: Array.isArray(activeRaw) ? activeRaw : [],
      history: Array.isArray(historyRaw) ? historyRaw : [],
      userAssets: (assetsRaw && typeof assetsRaw === 'object') ? assetsRaw : {}
    };
  }

  async function withdrawNearDclInnerTokens({ resolvedWallet, sender, tokenIds = [] }) {
    const contracts = getContracts();
    const targetIds = Array.from(new Set(tokenIds.filter(Boolean)));
    let assets = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      assets = await contracts.viewNearContractCall(DCL_CONTRACT_ID, 'list_user_assets', { account_id: sender }).catch(() => null);
      const hasPositive = targetIds.some((tid) => {
        const b = assets && assets[tid] !== undefined ? String(assets[tid]) : null;
        return b && /^\d+$/.test(b) && BigInt(b) > 0n;
      });
      if (hasPositive || attempt === 2) break;
      await new Promise((r) => setTimeout(r, 1200));
    }
    const withdrawn = [];
    for (const tid of targetIds) {
      const balStr = assets && assets[tid] !== undefined ? String(assets[tid]) : null;
      if (balStr && /^\d+$/.test(balStr) && BigInt(balStr) > 0n) {
        const txHash = await contracts.signAndSendNearFunctionCall({
          accountId: sender,
          publicKeyStr: resolvedWallet.nearPublicKey,
          privateKeyStr: resolvedWallet.nearPrivateKey,
          receiverId: DCL_CONTRACT_ID,
          methodName: 'withdraw_asset',
          argsJson: JSON.stringify({ token_id: tid }),
          gas: '150000000000000',
          depositYocto: '0'
        });
        withdrawn.push({ tokenId: tid, amount: balStr, txHash });
        if (tid === 'wrap.near' && typeof contracts.unwrapNearToNativeAsync === 'function') {
          await contracts.unwrapNearToNativeAsync({
            resolvedWallet,
            accountId: sender,
            amountYocto: balStr
          }).catch(() => {});
        }
      }
    }
    return withdrawn;
  }

  async function claimNearDclOrder({ wallet, orderId, buyToken }) {
    const contracts = getContracts();
    if (!contracts || !wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    const nearAvail = Number(contracts.resolveWalletChainBalance(resolvedWallet, 'near') || 0);
    if (nearAvail < 0.01) {
      throw new Error(t('NEAR Gas 余额不足', 'Insufficient NEAR for gas'));
    }
    const txHash = await contracts.signAndSendNearFunctionCall({
      accountId: sender,
      publicKeyStr: resolvedWallet.nearPublicKey,
      privateKeyStr: resolvedWallet.nearPrivateKey,
      receiverId: DCL_CONTRACT_ID,
      methodName: 'cancel_order',
      argsJson: JSON.stringify({ order_id: String(orderId), amount: '0' }),
      gas: '180000000000000',
      depositYocto: '0'
    });
    const withdrawn = await withdrawNearDclInnerTokens({ resolvedWallet, sender, tokenIds: [buyToken] });
    return {
      ok: true,
      txHash,
      withdrawn,
      explorerUrl: `https://nearblocks.io/txns/${txHash}`
    };
  }

  async function cancelNearDclOrder({ wallet, orderId, remainAmount, sellToken, buyToken }) {
    const contracts = getContracts();
    if (!contracts || !wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    const nearAvail = Number(contracts.resolveWalletChainBalance(resolvedWallet, 'near') || 0);
    if (nearAvail < 0.01) {
      throw new Error(t('NEAR Gas 余额不足', 'Insufficient NEAR for gas'));
    }
    const args = remainAmount !== undefined && remainAmount !== null && String(remainAmount) !== ''
      ? { order_id: String(orderId), amount: String(remainAmount) }
      : { order_id: String(orderId) };
    const txHash = await contracts.signAndSendNearFunctionCall({
      accountId: sender,
      publicKeyStr: resolvedWallet.nearPublicKey,
      privateKeyStr: resolvedWallet.nearPrivateKey,
      receiverId: DCL_CONTRACT_ID,
      methodName: 'cancel_order',
      argsJson: JSON.stringify(args),
      gas: '180000000000000',
      depositYocto: '0'
    });
    const withdrawn = await withdrawNearDclInnerTokens({ resolvedWallet, sender, tokenIds: [sellToken, buyToken] });
    return {
      ok: true,
      txHash,
      withdrawn,
      explorerUrl: `https://nearblocks.io/txns/${txHash}`
    };
  }

  // ==================== 2. Solana Jupiter Trigger V1 Limit Orders ====================

  function isSolanaTokenEligibleForLimit(token) {
    if (!token || String(token.blockchain || '').toLowerCase() !== 'sol') return false;
    const mint = String(token.contractAddress || '').trim();
    if (!mint || mint.length < 32) return false;
    if (token.hasTransferFee === true || (token.extensions && token.extensions.transferFeeConfig)) return false;
    if (Array.isArray(token.tags) && token.tags.some((tg) => /transfer-?fee|tax/i.test(String(tg)))) return false;
    if (token.tokenProgram === SPL_TOKEN_2022_PROGRAM_ID && !token.verified) return false;
    return true;
  }

  async function executeSignedJupiterTriggerTx({ wallet, base64Tx, requestId }) {
    const contracts = getContracts();
    const { txBytes, signedBase64 } = await contracts.signSolanaBase64Tx(
      base64Tx,
      wallet.solPrivateSeedHex || null,
      wallet,
      'solana-1'
    );
    let candidateSig = '';
    try {
      const cryptoEngine = (typeof window !== 'undefined' && window.NearCACrypto) || (typeof globalThis !== 'undefined' && globalThis.NearCACrypto);
      if (txBytes && txBytes.length > 65 && cryptoEngine && typeof cryptoEngine.base58Encode === 'function') {
        const lenBytes = txBytes[0] < 0x80 ? 1 : 2;
        const sig0 = txBytes.slice(lenBytes, lenBytes + 64);
        if (sig0.some((b) => b !== 0)) candidateSig = cryptoEngine.base58Encode(sig0);
      }
    } catch (_) {}

    const execRes = await fetchJsonWithTimeout(`${JUPITER_TRIGGER_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, signedTransaction: signedBase64 })
    }, 15_000).catch((err) => ({ ok: false, status: 0, error: err && err.message }));

    if (execRes && execRes.ok && execRes.data) {
      const statusLower = String(execRes.data.status || '').toLowerCase();
      if (statusLower === 'failed' || (execRes.data.error && statusLower !== 'success')) {
        throw new Error(execRes.data.error || execRes.data.message || 'Jupiter Trigger execution failed');
      }
      if (statusLower === 'success' || (!execRes.data.error && execRes.data.signature)) {
        const txHash = execRes.data.signature || execRes.data.txid || '';
        return {
          ok: true,
          txHash,
          explorerUrl: txHash ? `https://solscan.io/tx/${txHash}` : ''
        };
      }
    }

    if (execRes && execRes.status >= 400 && execRes.status < 500) {
      const msg = (execRes.data && (execRes.data.error || execRes.data.message)) || `Jupiter Trigger execute HTTP ${execRes.status}`;
      throw new Error(msg);
    }

    const confirmSolTxOrThrow = async (txSig, timeoutMs = 45_000) => {
      if (typeof contracts.waitForSolanaTxConfirmation === 'function') {
        const st = await contracts.waitForSolanaTxConfirmation(txSig, timeoutMs);
        if (!st || st.err || (st.meta && st.meta.err)) {
          throw new Error(
            !st
              ? t(`Solana 限价单交易确认超时 (tx: ${txSig})`, `Solana limit order confirmation timed out (tx: ${txSig})`)
              : t(`Solana 限价单链上执行失败 (tx: ${txSig})`, `Solana limit order transaction failed (tx: ${txSig})`)
          );
        }
        return st;
      }
      const stRes = await contracts.callSolanaRpc('getSignatureStatuses', [[txSig], { searchTransactionHistory: true }], 5000).catch(() => null);
      const stVal = stRes && stRes.value && stRes.value[0];
      if (stVal && stVal.err) {
        throw new Error(t(`Solana 限价单链上执行失败 (tx: ${txSig})`, `Solana limit order transaction failed (tx: ${txSig})`));
      }
      if (!stVal || (stVal.confirmationStatus !== 'confirmed' && stVal.confirmationStatus !== 'finalized')) {
        throw new Error(t(`Solana 限价单交易未确认 (tx: ${txSig})`, `Solana limit order transaction unconfirmed (tx: ${txSig})`));
      }
      return stVal;
    };

    if (candidateSig) {
      const stRes = await contracts.callSolanaRpc('getSignatureStatuses', [[candidateSig], { searchTransactionHistory: true }], 5000).catch(() => null);
      const stVal = stRes && stRes.value && stRes.value[0];
      if (stVal && stVal.err) {
        throw new Error(t(`Solana 限价单链上执行失败 (tx: ${candidateSig})`, `Solana limit order transaction failed (tx: ${candidateSig})`));
      }
      if (stVal && !stVal.err && (stVal.confirmationStatus === 'confirmed' || stVal.confirmationStatus === 'finalized')) {
        return {
          ok: true,
          txHash: candidateSig,
          explorerUrl: `https://solscan.io/tx/${candidateSig}`
        };
      }
    }

    try {
      const txHash = await contracts.callSolanaRpc(
        'sendTransaction',
        [signedBase64, { encoding: 'base64', skipPreflight: false, maxRetries: 3 }],
        15_000
      );
      await confirmSolTxOrThrow(txHash, 45_000);
      return {
        ok: true,
        txHash,
        explorerUrl: `https://solscan.io/tx/${txHash}`
      };
    } catch (rpcErr) {
      if (candidateSig && /already\s*processed/i.test(String(rpcErr && rpcErr.message || ''))) {
        const stRes = await contracts.callSolanaRpc('getSignatureStatuses', [[candidateSig], { searchTransactionHistory: true }], 5000).catch(() => null);
        const stVal = stRes && stRes.value && stRes.value[0];
        if (stVal && stVal.err) {
          throw new Error(t(`Solana 限价单链上执行失败 (tx: ${candidateSig})`, `Solana limit order transaction failed (tx: ${candidateSig})`));
        }
        if (stVal && !stVal.err) {
          if (stVal.confirmationStatus === 'processed') {
            await confirmSolTxOrThrow(candidateSig, 15_000);
          }
          return {
            ok: true,
            txHash: candidateSig,
            explorerUrl: `https://solscan.io/tx/${candidateSig}`
          };
        }
      }
      throw rpcErr;
    }
  }

  async function placeSolanaLimitOrder({
    wallet,
    inputMint,
    outputMint,
    makingAmount,
    takingAmount,
    expiredAt = null,
    inputUsdValue = null,
    sellBalance = null,
    sellDecimals = 9,
    sellSymbol = 'TOKEN'
  } = {}) {
    const contracts = getContracts();
    if (!contracts) throw new Error('Chain contracts module unavailable');
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    if (!inputMint || !outputMint || inputMint === outputMint) {
      throw new Error(t('请选择不同的 Solana 代币', 'Select distinct Solana tokens'));
    }
    const makeStr = String(makingAmount || '0').trim();
    const takeStr = String(takingAmount || '0').trim();
    if (!/^\d+$/.test(makeStr) || BigInt(makeStr) <= 0n || !/^\d+$/.test(takeStr) || BigInt(takeStr) <= 0n) {
      throw new Error(t('限价单数量必须大于 0', 'Limit order amounts must be positive'));
    }

    if (inputUsdValue !== null && inputUsdValue !== undefined && Number(inputUsdValue) < SOL_LIMIT_MIN_USD) {
      throw new Error(
        t(
          `低于 Solana 限价单最低限额 ($${SOL_LIMIT_MIN_USD})`,
          `Below Solana limit order minimum ($${SOL_LIMIT_MIN_USD})`
        )
      );
    }

    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const maker = resolvedWallet.solAddress;
    if (!maker) throw new Error(t('Solana 地址不可用', 'Solana address unavailable'));

    const humanSell = Number(fromBaseUnits(makeStr, sellDecimals));
    const isNativeSol = inputMint === SOL_NATIVE_MINT;
    if (isNativeSol) {
      const solAvail = Number(contracts.resolveWalletChainBalance(resolvedWallet, 'sol') || 0);
      if (solAvail + 1e-9 < humanSell + SOL_LIMIT_GAS_RESERVE) {
        throw new Error(
          t(
            `SOL 余额不足 (需保留 ${SOL_LIMIT_GAS_RESERVE} SOL 作可退租金与 Gas，当前可用: ${solAvail.toFixed(4)})`,
            `Insufficient SOL (need ${SOL_LIMIT_GAS_RESERVE} SOL for refundable rent + gas, available: ${solAvail.toFixed(4)})`
          )
        );
      }
    } else {
      const tokBal = sellBalance !== null && sellBalance !== undefined
        ? Number(sellBalance)
        : Number(resolvedWallet.splBalances?.[inputMint] || 0);
      if (!Number.isFinite(tokBal) || tokBal < humanSell) {
        throw new Error(
          t(
            `${sellSymbol} 余额不足 (当前可用: ${tokBal.toFixed(6)})`,
            `Insufficient ${sellSymbol} balance (available: ${tokBal.toFixed(6)})`
          )
        );
      }
      const solAvail = Number(contracts.resolveWalletChainBalance(resolvedWallet, 'sol') || 0);
      if (solAvail < SOL_LIMIT_GAS_RESERVE) {
        throw new Error(
          t(
            `SOL 余额不足 (需 ${SOL_LIMIT_GAS_RESERVE} SOL 作可退账户租金与 Gas，当前: ${solAvail.toFixed(4)})`,
            `Insufficient SOL (need ${SOL_LIMIT_GAS_RESERVE} SOL for refundable rent + gas, available: ${solAvail.toFixed(4)})`
          )
        );
      }
    }

    const params = {
      makingAmount: makeStr,
      takingAmount: takeStr
    };
    if (expiredAt && Number(expiredAt) > Math.floor(Date.now() / 1000)) {
      params.expiredAt = String(Math.floor(Number(expiredAt)));
    }

    const createRes = await fetchJsonWithTimeout(`${JUPITER_TRIGGER_URL}/createOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputMint,
        outputMint,
        maker,
        payer: maker,
        params,
        computeUnitPrice: 'auto'
      })
    }, 12_000);

    if (!createRes.ok || !createRes.data || !createRes.data.transaction || !createRes.data.requestId) {
      const errMsg = (createRes.data && (createRes.data.error || createRes.data.message)) || `Jupiter Trigger HTTP ${createRes.status}`;
      throw new Error(String(errMsg));
    }

    const execOut = await executeSignedJupiterTriggerTx({
      wallet: resolvedWallet,
      base64Tx: createRes.data.transaction,
      requestId: createRes.data.requestId
    });
    return {
      ok: true,
      chain: 'sol',
      orderPubkey: createRes.data.order || '',
      txHash: execOut.txHash,
      explorerUrl: execOut.explorerUrl
    };
  }

  async function fetchSolanaLimitOrders(owner) {
    const addr = String(owner || '').trim();
    if (!addr) return { active: [], history: [] };
    const [actRes, histRes] = await Promise.all([
      fetchJsonWithTimeout(`${JUPITER_TRIGGER_URL}/getTriggerOrders?user=${encodeURIComponent(addr)}&orderStatus=active`, {}, 8000).catch(() => null),
      fetchJsonWithTimeout(`${JUPITER_TRIGGER_URL}/getTriggerOrders?user=${encodeURIComponent(addr)}&orderStatus=history`, {}, 8000).catch(() => null)
    ]);
    const actBad = !actRes || !actRes.ok;
    const histBad = !histRes || !histRes.ok;
    if (actBad && histBad) {
      return {
        active: [],
        history: [],
        unavailable: true,
        error: t('Solana 限价单上游接口已升级，暂不可用', 'Solana limit order upstream API unavailable')
      };
    }
    return {
      active: Array.isArray(actRes && actRes.data && actRes.data.orders) ? actRes.data.orders : [],
      history: Array.isArray(histRes && histRes.data && histRes.data.orders) ? histRes.data.orders : []
    };
  }

  async function cancelSolanaLimitOrder({ wallet, orderPubkey }) {
    const contracts = getContracts();
    if (!contracts || !wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const maker = resolvedWallet.solAddress;
    if (!maker || !orderPubkey) throw new Error(t('撤单参数无效', 'Invalid cancel parameters'));
    const solAvail = Number(contracts.resolveWalletChainBalance(resolvedWallet, 'sol') || 0);
    if (solAvail < 0.001) {
      throw new Error(t('SOL Gas 余额不足', 'Insufficient SOL for gas'));
    }

    const cancelRes = await fetchJsonWithTimeout(`${JUPITER_TRIGGER_URL}/cancelOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maker,
        order: String(orderPubkey),
        computeUnitPrice: 'auto'
      })
    }, 12_000);

    if (!cancelRes.ok || !cancelRes.data || !cancelRes.data.transaction || !cancelRes.data.requestId) {
      const errMsg = (cancelRes.data && (cancelRes.data.error || cancelRes.data.message)) || `Jupiter Cancel HTTP ${cancelRes.status}`;
      throw new Error(String(errMsg));
    }

    return executeSignedJupiterTriggerTx({
      wallet: resolvedWallet,
      base64Tx: cancelRes.data.transaction,
      requestId: cancelRes.data.requestId
    });
  }

  // ==================== 3. EVM CoW Protocol Limit Orders ====================

  function isEvmNativeSentinel(address) {
    const low = String(address || '').trim().toLowerCase();
    return !low || low === NATIVE_EVM_SENTINEL;
  }

  function isEvmChainLimitSupported(chainKey) {
    return Boolean(COW_CHAINS[String(chainKey || '').toLowerCase()]);
  }

  function encodeAddressArg32(addr) {
    return String(addr || '').replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  }

  async function checkEvmCowAllowance({ chainKey, owner, tokenAddress }) {
    const contracts = getContracts();
    const key = String(chainKey || '').toLowerCase();
    if (!COW_CHAINS[key]) throw new Error(t(`该链暂不支持限价单: ${chainKey}`, `Limit orders not supported on ${chainKey}`));
    if (isEvmNativeSentinel(tokenAddress)) return 0n;
    const calldata = '0xdd62ed3e' + encodeAddressArg32(owner) + encodeAddressArg32(GPV2_VAULT_RELAYER);
    const rpcRes = await contracts.callEvmRpc(key, {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: tokenAddress, data: calldata }, 'latest']
    });
    if (rpcRes === null || rpcRes === undefined || (rpcRes && rpcRes.error)) {
      throw new Error(t('授权额度查询失败', 'Failed to query allowance'));
    }
    const hex = typeof rpcRes === 'string' ? rpcRes : (rpcRes && typeof rpcRes.result === 'string' ? rpcRes.result : '');
    if (!hex || hex === '0x' || !/^0x[0-9a-fA-F]+$/.test(hex)) return 0n;
    return BigInt(hex);
  }

  async function approveEvmCowToken({ wallet, chainKey, tokenAddress }) {
    const contracts = getContracts();
    const ethers = getEthers();
    const key = String(chainKey || '').toLowerCase();
    const cfg = COW_CHAINS[key];
    if (!cfg) throw new Error(t(`该链暂不支持限价单: ${chainKey}`, `Limit orders not supported on ${chainKey}`));
    if (isEvmNativeSentinel(tokenAddress)) {
      throw new Error(t(`原生 ${cfg.nativeSymbol} 无法直接挂单，请先封装为 ${cfg.wrappedSymbol}`, `Native ${cfg.nativeSymbol} cannot be used directly; wrap to ${cfg.wrappedSymbol} first`));
    }
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    contracts.validateSufficientChainBalance({
      wallet: resolvedWallet,
      chain: key,
      tokenSymbol: cfg.nativeSymbol,
      amount: cfg.gasReserve,
      isNative: false
    });
    const steps = [];
    const tokenLower = String(tokenAddress || '').trim().toLowerCase();
    if (key === 'eth' && tokenLower === '0xdac17f958d2ee523a2206206994597c13d831ec7') {
      const owner = typeof contracts.resolveWalletEvmSender === 'function'
        ? contracts.resolveWalletEvmSender(resolvedWallet, ethers)
        : (resolvedWallet.evmPrivateKey && ethers ? new ethers.Wallet(resolvedWallet.evmPrivateKey).address : (resolvedWallet.mpcEvmAddress || resolvedWallet.evmAddress));
      if (!owner) {
        throw new Error(t('EVM 地址或 NEAR MPC 凭据不可用', 'EVM address or NEAR MPC credentials unavailable'));
      }
      const curAllow = await checkEvmCowAllowance({ chainKey: key, owner, tokenAddress });
      if (curAllow > 0n) {
        steps.push({
          to: tokenAddress,
          data: '0x095ea7b3' + encodeAddressArg32(GPV2_VAULT_RELAYER) + '0'.repeat(64),
          value: '0',
          chainId: cfg.chainId
        });
      }
    }
    const maxUintHex = 'f'.repeat(64);
    const data = '0x095ea7b3' + encodeAddressArg32(GPV2_VAULT_RELAYER) + maxUintHex;
    steps.push({ to: tokenAddress, data, value: '0', chainId: cfg.chainId });
    return contracts.executeEvmRawSteps({
      wallet: resolvedWallet,
      chainKey: key,
      steps
    });
  }

  async function wrapEvmNativeForLimit({ wallet, chainKey, amountRaw }) {
    const contracts = getContracts();
    const key = String(chainKey || '').toLowerCase();
    const cfg = COW_CHAINS[key];
    if (!cfg) throw new Error(t(`该链暂不支持封装: ${chainKey}`, `Wrapping unsupported on ${chainKey}`));
    const amtStr = String(amountRaw || '0').trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('封装数量必须大于 0', 'Wrap amount must be positive'));
    }
    const humanAmt = Number(fromBaseUnits(amtStr, 18));
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    contracts.validateSufficientChainBalance({
      wallet: resolvedWallet,
      chain: key,
      tokenSymbol: cfg.nativeSymbol,
      amount: humanAmt,
      isNative: true,
      gasBuffer: cfg.gasReserve
    });
    return contracts.executeEvmRawSteps({
      wallet: resolvedWallet,
      chainKey: key,
      steps: [{ to: cfg.wrappedNative, data: '0xd0e30db0', value: amtStr, chainId: cfg.chainId }]
    });
  }

  function buildCowDomain(chainId) {
    return {
      name: 'Gnosis Protocol',
      version: 'v2',
      chainId: Number(chainId),
      verifyingContract: GPV2_SETTLEMENT
    };
  }

  async function placeEvmCowLimitOrder({
    wallet,
    chainKey,
    sellToken,
    buyToken,
    sellAmount,
    buyAmount,
    validTo,
    sellUsdValue = null,
    sellBalance = null,
    sellDecimals = 18,
    sellSymbol = 'TOKEN'
  } = {}) {
    const contracts = getContracts();
    const ethers = getEthers();
    if (!contracts || !ethers) throw new Error('EVM signing engine unavailable');
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));

    const key = String(chainKey || '').toLowerCase();
    const cfg = COW_CHAINS[key];
    if (!cfg) throw new Error(t(`该网络暂不支持 CoW 限价单 (${chainKey})`, `CoW limit orders unavailable on ${chainKey}`));

    if (isEvmNativeSentinel(sellToken)) {
      throw new Error(
        t(
          `CoW 限价单不支持原生 ${cfg.nativeSymbol} 卖出，请先封装或选用 ${cfg.wrappedSymbol}`,
          `Native ${cfg.nativeSymbol} cannot be sold directly in CoW limit orders; use ${cfg.wrappedSymbol}`
        )
      );
    }
    if (!buyToken || String(sellToken).toLowerCase() === String(buyToken).toLowerCase()) {
      throw new Error(t('请选择不同的买入代币', 'Select a distinct buy token'));
    }

    const sellStr = String(sellAmount || '0').trim();
    const buyStr = String(buyAmount || '0').trim();
    if (!/^\d+$/.test(sellStr) || BigInt(sellStr) <= 0n || !/^\d+$/.test(buyStr) || BigInt(buyStr) <= 0n) {
      throw new Error(t('限价单数量必须大于 0', 'Order amounts must be positive'));
    }

    if (sellUsdValue !== null && sellUsdValue !== undefined && Number(sellUsdValue) < cfg.minUsd) {
      throw new Error(
        t(
          `低于 ${cfg.name} 最低挂单额 ($${cfg.minUsd})`,
          `Below ${cfg.name} minimum order size ($${cfg.minUsd})`
        )
      );
    }

    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const ownerRaw = typeof contracts.resolveWalletEvmSender === 'function'
      ? contracts.resolveWalletEvmSender(resolvedWallet, ethers)
      : (resolvedWallet.evmPrivateKey ? new ethers.Wallet(resolvedWallet.evmPrivateKey).address : (resolvedWallet.mpcEvmAddress || resolvedWallet.evmAddress));
    if (!ownerRaw) {
      throw new Error(t('EVM 地址或 NEAR MPC 凭据不可用', 'EVM address or NEAR MPC credentials unavailable'));
    }
    const owner = ethers.getAddress(ownerRaw);

    const humanSell = Number(fromBaseUnits(sellStr, sellDecimals));
    const st = getState();
    const bal = sellBalance !== null && sellBalance !== undefined
      ? Number(sellBalance)
      : Number((st && typeof st.getWalletErc20Balance === 'function' ? st.getWalletErc20Balance(resolvedWallet, key, sellToken) : 0) || 0);
    if (!Number.isFinite(bal) || bal < humanSell) {
      throw new Error(
        t(
          `${sellSymbol} 余额不足 (当前可用: ${bal.toFixed(6)})`,
          `Insufficient ${sellSymbol} balance (available: ${bal.toFixed(6)})`
        )
      );
    }

    const allowance = await checkEvmCowAllowance({ chainKey: key, owner, tokenAddress: sellToken });
    if (allowance < BigInt(sellStr)) {
      throw new Error(t(`请先授权 ${sellSymbol} 后再提交限价单`, `Approve ${sellSymbol} before placing limit order`));
    }

    const checksumSell = ethers.getAddress(sellToken);
    const checksumBuy = String(buyToken).toLowerCase() === NATIVE_EVM_SENTINEL
      ? '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      : ethers.getAddress(buyToken);

    const expirySec = Number(validTo) > Math.floor(Date.now() / 1000)
      ? Math.floor(Number(validTo))
      : Math.floor(Date.now() / 1000) + 7 * 86400;

    const appDataDoc = JSON.stringify({ version: '1.1.0', metadata: {} });
    const appDataHash = ethers.keccak256(ethers.toUtf8Bytes(appDataDoc));
    const orderMessage = {
      sellToken: checksumSell,
      buyToken: checksumBuy,
      receiver: owner,
      sellAmount: sellStr,
      buyAmount: buyStr,
      validTo: expirySec,
      appData: appDataHash,
      feeAmount: '0',
      kind: 'sell',
      partiallyFillable: true,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20'
    };

    const domain = buildCowDomain(cfg.chainId);
    const signed = await contracts.signEvmTypedDataUnified({
      wallet: resolvedWallet,
      domain,
      types: COW_ORDER_EIP712_TYPES,
      value: orderMessage
    });
    const signature = signed.signature;

    const res = await fetchJsonWithTimeout(`https://api.cow.fi/${cfg.slug}/api/v1/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...orderMessage,
        appData: appDataDoc,
        appDataHash,
        from: owner,
        signingScheme: 'eip712',
        signature
      })
    }, COW_DEFAULT_TIMEOUT_MS);

    if (!res.ok) {
      const desc = String((res.data && (res.data.description || res.data.errorType || res.data.error)) || res.rawText || `HTTP ${res.status}`);
      if (res.status === 429 || res.status === 402 || /x402/i.test(desc)) {
        if (res.status === 402 || /x402/i.test(desc)) {
          const chainLabel = key === 'bsc' ? 'BSC' : (cfg.name || key.toUpperCase());
          throw new Error(t(
            `${chainLabel} 限价单服务当前繁忙或暂不可用，请稍后重试`,
            `${chainLabel} limit order service is currently busy or unavailable. Please try again later.`
          ));
        }
        throw new Error(t('限价单服务请求过于频繁，请稍后重试', 'Limit order service is busy. Please try again shortly.'));
      }
      const friendly = typeof contracts.toUserFriendlyError === 'function'
        ? contracts.toUserFriendlyError(desc, t('限价单提交失败，请稍后重试', 'Limit order submission failed. Please try again.'))
        : desc;
      throw new Error(friendly);
    }

    const orderUid = typeof res.data === 'string' ? res.data : (res.rawText ? res.rawText.replace(/"/g, '').trim() : '');
    return {
      ok: true,
      chain: key,
      orderUid,
      signature,
      order: orderMessage
    };
  }

  async function fetchEvmCowOrders(chainKey, owner) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = COW_CHAINS[key];
    if (!cfg || !owner) return { active: [], history: [], rateLimited: false };
    const res = await fetchJsonWithTimeout(
      `https://api.cow.fi/${cfg.slug}/api/v1/account/${encodeURIComponent(owner)}/orders?limit=30`,
      {},
      8000
    ).catch(() => null);
    if (!res) return { active: [], history: [], rateLimited: false };
    if (res.status === 429 || res.status === 402) {
      const desc = String((res.data && (res.data.description || res.data.errorType || res.data.error)) || res.rawText || '');
      const isX402 = res.status === 402 || /x402/i.test(desc);
      return {
        active: [],
        history: [],
        rateLimited: true,
        unavailable: isX402
      };
    }
    if (!res.ok || !Array.isArray(res.data)) return { active: [], history: [], rateLimited: false };

    const active = [];
    const history = [];
    for (const o of res.data) {
      if (!o || !o.uid) continue;
      if (String(o.status || '').toLowerCase() === 'open') active.push(o);
      else history.push(o);
    }
    return { active, history, rateLimited: false };
  }

  async function cancelEvmCowOrder({ wallet, chainKey, orderUid }) {
    const contracts = getContracts();
    const ethers = getEthers();
    const key = String(chainKey || '').toLowerCase();
    const cfg = COW_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的网络: ${chainKey}`, `Unsupported network: ${chainKey}`));
    if (!orderUid) throw new Error(t('无效订单 UID', 'Invalid order UID'));
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const domain = buildCowDomain(cfg.chainId);
    const signed = await contracts.signEvmTypedDataUnified({
      wallet: resolvedWallet,
      domain,
      types: COW_CANCEL_EIP712_TYPES,
      value: { orderUids: [String(orderUid)] }
    });
    const signature = signed.signature;

    const res = await fetchJsonWithTimeout(`https://api.cow.fi/${cfg.slug}/api/v1/orders`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderUids: [String(orderUid)],
        signature,
        signingScheme: 'eip712'
      })
    }, COW_DEFAULT_TIMEOUT_MS);

    if (!res.ok) {
      const desc = String((res.data && (res.data.description || res.data.error)) || res.rawText || `HTTP ${res.status}`);
      if (res.status === 429 || res.status === 402 || /x402/i.test(desc)) {
        if (res.status === 402 || /x402/i.test(desc)) {
          const chainLabel = key === 'bsc' ? 'BSC' : (cfg.name || key.toUpperCase());
          throw new Error(t(
            `${chainLabel} 限价单服务当前繁忙或暂不可用，请稍后重试`,
            `${chainLabel} limit order service is currently busy or unavailable. Please try again later.`
          ));
        }
        throw new Error(t('限价单服务请求过于频繁，请稍后重试', 'Limit order service is busy. Please try again shortly.'));
      }
      const friendly = typeof contracts.toUserFriendlyError === 'function'
        ? contracts.toUserFriendlyError(desc, t('撤单失败，请稍后重试', 'Cancel failed. Please try again.'))
        : desc;
      throw new Error(friendly);
    }
    return { ok: true, orderUid };
  }

  const api = {
    DCL_CONTRACT_ID,
    DCL_STORAGE_DEPOSIT_NEAR,
    DCL_STORAGE_DEPOSIT_YOCTO,
    DCL_GAS_RESERVE_NEAR,
    JUPITER_TRIGGER_URL,
    SOL_LIMIT_MIN_USD,
    SOL_LIMIT_RENT_SOL,
    SOL_LIMIT_GAS_RESERVE,
    SOL_NATIVE_MINT,
    GPV2_SETTLEMENT,
    GPV2_VAULT_RELAYER,
    COW_CHAINS,
    COW_ORDER_EIP712_TYPES,
    COW_CANCEL_EIP712_TYPES,
    NEAR_DCL_LIMIT_POOLS,
    NEAR_LIMIT_TOKEN_META,
    LIMIT_EVM_FALLBACK_TOKENS,
    normalizeNearContract,
    resolveNearLimitPoolIds,
    resolveNearLimitPoolId,
    getNearLimitSellTokens,
    getNearLimitCounterTokens,
    fetchNearDclPoolInfo,
    feeToPointDelta,
    clampDclPoint,
    parsePoolDescriptor,
    priceToDclPoint,
    dclPointToPrice,
    resolveSplitTwoTickPoints,
    checkNearDclStorage,
    wrapNearForLimit,
    placeNearDclLimitOrder,
    fetchNearDclOrders,
    claimNearDclOrder,
    cancelNearDclOrder,
    isSolanaTokenEligibleForLimit,
    placeSolanaLimitOrder,
    fetchSolanaLimitOrders,
    cancelSolanaLimitOrder,
    isEvmNativeSentinel,
    isEvmChainLimitSupported,
    checkEvmCowAllowance,
    approveEvmCowToken,
    wrapEvmNativeForLimit,
    buildCowDomain,
    placeEvmCowLimitOrder,
    fetchEvmCowOrders,
    cancelEvmCowOrder
  };

  if (root) {
    root.NearCALimitOrders = api;
    root.NearCA = root.NearCA || {};
    root.NearCA.limitOrders = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.NearCALimitOrders = api;
    globalThis.NearCA = globalThis.NearCA || {};
    globalThis.NearCA.limitOrders = api;
  }
  if (typeof window !== 'undefined') {
    window.NearCALimitOrders = api;
    window.NearCA = window.NearCA || {};
    window.NearCA.limitOrders = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
