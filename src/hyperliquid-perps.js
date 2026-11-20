/**
 * Nexus Wallet - Hyperliquid Perpetuals Engine
 * Pure-JS Msgpack + EIP-712 L1 & User-Signed Actions + Live Orderbook/Candles + 1Click & Arbitrum Bridge2 Funding.
 * Attaches to globalThis.NearCAHyperliquid, window.NearCAHyperliquid, globalThis.NearCA.hyperliquid, and module.exports.
 */
(function (root) {
  'use strict';

  const HL_API_URL = 'https://api.hyperliquid.xyz';
  const HL_DEFAULT_TIMEOUT_MS = 10_000;
  const HL_MIN_ORDER_USD = 10;
  const HL_ARB_BRIDGE2_ADDRESS = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7';
  const HL_ARB_USDC_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
  const HL_ARB_BRIDGE_MIN_USDC = 5;
  const HL_ARB_MIN_ETH_GAS = 0.0002;
  const HL_WITHDRAW_MIN_USDC = 2;
  const HL_WITHDRAW_FEE_USDC = 1;
  const HL_ONECLICK_SPOT_USDC_ASSET_ID = '1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054';
  const HL_SIGNATURE_CHAIN_ID = '0x66eee';
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const PINNED_COINS = ['BTC', 'ETH', 'SOL', 'NEAR', 'HYPE'];

  const HL_EIP712_L1_DOMAIN = {
    name: 'Exchange',
    version: '1',
    chainId: 1337,
    verifyingContract: ZERO_ADDRESS
  };

  const HL_EIP712_USER_DOMAIN = {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: 421614,
    verifyingContract: ZERO_ADDRESS
  };

  const HL_AGENT_EIP712_TYPES = {
    Agent: [
      { name: 'source', type: 'string' },
      { name: 'connectionId', type: 'bytes32' }
    ]
  };

  const HL_USD_CLASS_TRANSFER_TYPES = [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'toPerp', type: 'bool' },
    { name: 'nonce', type: 'uint64' }
  ];

  const HL_WITHDRAW_TYPES = [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'time', type: 'uint64' }
  ];

  const HL_SPOT_SEND_TYPES = [
    { name: 'hyperliquidChain', type: 'string' },
    { name: 'destination', type: 'string' },
    { name: 'token', type: 'string' },
    { name: 'amount', type: 'string' },
    { name: 'time', type: 'uint64' }
  ];

  let _lastNonce = 0;

  function safeRequire(relPath) {
    if (typeof require !== 'function') return null;
    try {
      return require(relPath);
    } catch (_) {
      return null;
    }
  }

  function getState() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCAState) ||
      (typeof window !== 'undefined' && window.NearCAState) ||
      safeRequire('./state.js') ||
      null
    );
  }

  function getContracts() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCAContracts) ||
      (typeof window !== 'undefined' && window.NearCAContracts) ||
      safeRequire('./chain-contracts.js') ||
      null
    );
  }

  function getIntents() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCAIntents) ||
      (typeof window !== 'undefined' && window.NearCAIntents) ||
      safeRequire('./near-intents.js') ||
      null
    );
  }

  function getEthers() {
    return (
      (typeof window !== 'undefined' && window.ethers) ||
      (typeof globalThis !== 'undefined' && globalThis.ethers) ||
      safeRequire('../ethers.umd.min.js') ||
      null
    );
  }

  function t(zh, en) {
    const st = getState();
    const lang = (st && (st.lang || st.currentLang)) || 'zh';
    return lang === 'en' ? en : zh;
  }

  function nextHlNonce() {
    const now = Date.now();
    _lastNonce = now > _lastNonce ? now : _lastNonce + 1;
    return _lastNonce;
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = HL_DEFAULT_TIMEOUT_MS) {
    const fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw new Error('fetch API unavailable');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = controller
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;
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
      return { ok: Boolean(res.ok), status: res.status || 0, statusText: res.statusText || '', data: parsed, rawText: text };
    } catch (err) {
      if (err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))) {
        throw new Error(timedOut ? t('网络请求超时', 'Request timed out') : t('请求已取消', 'Request cancelled'));
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ==================== Pure-JS Msgpack Encoder ====================

  function writeU64BE(buf, offset, valBig) {
    let v = BigInt.asUintN(64, BigInt(valBig));
    for (let i = 7; i >= 0; i--) {
      buf[offset + i] = Number(v & 0xffn);
      v >>= 8n;
    }
  }

  function writeI64BE(buf, offset, valBig) {
    writeU64BE(buf, offset, BigInt.asIntN(64, BigInt(valBig)));
  }

  function encodeUintBytes(n, out) {
    if (n <= 0x7f) {
      out.push(n);
    } else if (n <= 0xff) {
      out.push(0xcc, n);
    } else if (n <= 0xffff) {
      out.push(0xcd, (n >> 8) & 0xff, n & 0xff);
    } else if (n <= 0xffffffff) {
      out.push(0xce, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
    } else {
      const b = new Uint8Array(9);
      b[0] = 0xcf;
      writeU64BE(b, 1, BigInt(n));
      for (let i = 0; i < 9; i++) out.push(b[i]);
    }
  }

  function encodeIntBytes(n, out) {
    if (n >= -32) {
      out.push(0x100 + n);
    } else if (n >= -128) {
      out.push(0xd0, n & 0xff);
    } else if (n >= -32768) {
      out.push(0xd1, (n >> 8) & 0xff, n & 0xff);
    } else if (n >= -2147483648) {
      out.push(0xd2, (n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
    } else {
      const b = new Uint8Array(9);
      b[0] = 0xd3;
      writeI64BE(b, 1, BigInt(n));
      for (let i = 0; i < 9; i++) out.push(b[i]);
    }
  }

  function encodeMsgpackRecursive(value, out) {
    if (value === null || value === undefined) {
      out.push(0xc0);
      return;
    }
    if (typeof value === 'boolean') {
      out.push(value ? 0xc3 : 0xc2);
      return;
    }
    if (typeof value === 'bigint') {
      if (value >= 0n && value <= 0xffffffffffffffffn) {
        if (value <= 0x7fn) out.push(Number(value));
        else if (value <= 0xffn) out.push(0xcc, Number(value));
        else if (value <= 0xffffn) {
          const n = Number(value);
          out.push(0xcd, (n >> 8) & 0xff, n & 0xff);
        } else if (value <= 0xffffffffn) {
          const n = Number(value);
          out.push(0xce, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
        } else {
          const b = new Uint8Array(9);
          b[0] = 0xcf;
          writeU64BE(b, 1, value);
          for (let i = 0; i < 9; i++) out.push(b[i]);
        }
      } else {
        const b = new Uint8Array(9);
        b[0] = 0xd3;
        writeI64BE(b, 1, value);
        for (let i = 0; i < 9; i++) out.push(b[i]);
      }
      return;
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value) && Number.isSafeInteger(value)) {
        if (value >= 0) encodeUintBytes(value, out);
        else encodeIntBytes(value, out);
      } else {
        const ab = new ArrayBuffer(9);
        const dv = new DataView(ab);
        dv.setUint8(0, 0xcb);
        dv.setFloat64(1, value, false);
        const bytes = new Uint8Array(ab);
        for (let i = 0; i < 9; i++) out.push(bytes[i]);
      }
      return;
    }
    if (typeof value === 'string') {
      const bytes = new TextEncoder().encode(value);
      const len = bytes.length;
      if (len < 32) {
        out.push(0xa0 | len);
      } else if (len <= 0xff) {
        out.push(0xd9, len);
      } else if (len <= 0xffff) {
        out.push(0xda, (len >> 8) & 0xff, len & 0xff);
      } else {
        out.push(0xdb, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
      }
      for (let i = 0; i < len; i++) out.push(bytes[i]);
      return;
    }
    if (value instanceof Uint8Array) {
      const len = value.length;
      if (len <= 0xff) {
        out.push(0xc4, len);
      } else if (len <= 0xffff) {
        out.push(0xc5, (len >> 8) & 0xff, len & 0xff);
      } else {
        out.push(0xc6, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
      }
      for (let i = 0; i < len; i++) out.push(value[i]);
      return;
    }
    if (Array.isArray(value)) {
      const len = value.length;
      if (len < 16) {
        out.push(0x90 | len);
      } else if (len <= 0xffff) {
        out.push(0xdc, (len >> 8) & 0xff, len & 0xff);
      } else {
        out.push(0xdd, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
      }
      for (let i = 0; i < len; i++) {
        encodeMsgpackRecursive(value[i], out);
      }
      return;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value).filter(([, v]) => v !== undefined);
      const len = entries.length;
      if (len < 16) {
        out.push(0x80 | len);
      } else if (len <= 0xffff) {
        out.push(0xde, (len >> 8) & 0xff, len & 0xff);
      } else {
        out.push(0xdf, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
      }
      for (let i = 0; i < len; i++) {
        encodeMsgpackRecursive(entries[i][0], out);
        encodeMsgpackRecursive(entries[i][1], out);
      }
      return;
    }
    throw new Error(`Unsupported msgpack type: ${typeof value}`);
  }

  function msgpackEncode(value) {
    const out = [];
    encodeMsgpackRecursive(value, out);
    return Uint8Array.from(out);
  }

  // ==================== Price / Size Formatting ====================

  function trimDecimalTrailingZeros(str) {
    const s = String(str || '');
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
  }

  function formatHlPrice(px, szDecimals = 0) {
    const n = Number(px);
    if (!Number.isFinite(n) || n <= 0) return '0';
    const maxDec = Math.max(0, 6 - (Math.max(0, Math.floor(Number(szDecimals) || 0))));
    if (n >= 100_000) {
      return String(Math.round(n));
    }
    const sig = Number(n.toPrecision(5));
    return trimDecimalTrailingZeros(sig.toFixed(maxDec));
  }

  function formatHlSize(sz, szDecimals = 0) {
    const n = Number(sz);
    if (!Number.isFinite(n) || n <= 0) return '0';
    const dec = Math.max(0, Math.min(8, Math.floor(Number(szDecimals) || 0)));
    const factor = Math.pow(10, dec);
    const floored = Math.floor(n * factor + 1e-12) / factor;
    if (!Number.isFinite(floored) || floored <= 0) return '0';
    return trimDecimalTrailingZeros(floored.toFixed(dec));
  }

  function formatHlUsdcAmount(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return '0';
    return trimDecimalTrailingZeros(n.toFixed(6));
  }

  function computeEstimatedLiqPrice({ markPx, leverage, isLong }) {
    const px = Number(markPx);
    const lev = Number(leverage);
    if (!Number.isFinite(px) || px <= 0 || !Number.isFinite(lev) || lev <= 0) return null;
    // Standard isolated maintenance margin ratio approximation (~0.5% MMR buffer)
    const mmr = 0.005;
    const raw = isLong
      ? px * (1 - (1 / lev) + mmr)
      : px * (1 + (1 / lev) - mmr);
    return raw > 0 ? raw : null;
  }

  // ==================== EIP-712 Action Hashing & Signing ====================

  function addressTo20Bytes(addr) {
    const clean = String(addr || '').trim().replace(/^0x/i, '').toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(clean)) {
      throw new Error(t('无效的 EVM 地址', 'Invalid EVM address'));
    }
    const out = new Uint8Array(20);
    for (let i = 0; i < 20; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function computeHlActionHash(action, nonce, vaultAddress = null, expiresAfter = null) {
    const ethers = getEthers();
    if (!ethers) throw new Error('ethers library unavailable');
    const actionBytes = msgpackEncode(action);
    const vaultBytes = vaultAddress ? addressTo20Bytes(vaultAddress) : null;
    const hasExpires = expiresAfter !== null && expiresAfter !== undefined;
    const totalLen =
      actionBytes.length +
      8 +
      (vaultBytes ? 21 : 1) +
      (hasExpires ? 9 : 0);

    const packed = new Uint8Array(totalLen);
    let offset = 0;
    packed.set(actionBytes, offset);
    offset += actionBytes.length;

    writeU64BE(packed, offset, BigInt(nonce));
    offset += 8;

    if (vaultBytes) {
      packed[offset++] = 1;
      packed.set(vaultBytes, offset);
      offset += 20;
    } else {
      packed[offset++] = 0;
    }

    if (hasExpires) {
      packed[offset++] = 0;
      writeU64BE(packed, offset, BigInt(expiresAfter));
    }

    return ethers.keccak256(packed);
  }

  async function signHlL1Action({ wallet, action, nonce = null, vaultAddress = null, expiresAfter = null, isMainnet = true }) {
    const contracts = getContracts();
    if (!contracts || typeof contracts.signEvmTypedDataUnified !== 'function') {
      throw new Error('EVM typed-data signer unavailable');
    }
    const useNonce = nonce !== null && nonce !== undefined ? Number(nonce) : nextHlNonce();
    const connectionId = computeHlActionHash(action, useNonce, vaultAddress, expiresAfter);
    const signed = await contracts.signEvmTypedDataUnified({
      wallet,
      domain: HL_EIP712_L1_DOMAIN,
      types: HL_AGENT_EIP712_TYPES,
      value: {
        source: isMainnet ? 'a' : 'b',
        connectionId
      }
    });
    const vVal = Number(signed.v || (27 + Number(signed.yParity || 0)));
    return {
      r: signed.r,
      s: signed.s,
      v: vVal,
      signature: { r: signed.r, s: signed.s, v: vVal },
      signatureHex: signed.signature,
      signerAddress: signed.signerAddress,
      connectionId,
      nonce: useNonce
    };
  }

  async function signHlUserSignedAction({ wallet, action, payloadTypes, primaryType }) {
    const contracts = getContracts();
    if (!contracts || typeof contracts.signEvmTypedDataUnified !== 'function') {
      throw new Error('EVM typed-data signer unavailable');
    }
    const payload = {
      ...action,
      signatureChainId: HL_SIGNATURE_CHAIN_ID,
      hyperliquidChain: 'Mainnet'
    };
    const signed = await contracts.signEvmTypedDataUnified({
      wallet,
      domain: HL_EIP712_USER_DOMAIN,
      types: { [primaryType]: payloadTypes },
      value: payload
    });
    const vVal = Number(signed.v || (27 + Number(signed.yParity || 0)));
    return {
      action: payload,
      r: signed.r,
      s: signed.s,
      v: vVal,
      signature: { r: signed.r, s: signed.s, v: vVal },
      signatureHex: signed.signature,
      signerAddress: signed.signerAddress
    };
  }

  // ==================== Info API Queries ====================

  async function postHlInfo(body, timeoutMs = HL_DEFAULT_TIMEOUT_MS) {
    const res = await fetchJsonWithTimeout(`${HL_API_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, timeoutMs);
    if (!res.ok) {
      throw new Error(`Hyperliquid info HTTP ${res.status}`);
    }
    return res.data;
  }

  async function fetchHlMarkets() {
    const raw = await postHlInfo({ type: 'metaAndAssetCtxs' });
    if (!Array.isArray(raw) || raw.length < 2 || !raw[0] || !Array.isArray(raw[0].universe)) {
      return [];
    }
    const universe = raw[0].universe;
    const ctxs = Array.isArray(raw[1]) ? raw[1] : [];
    const list = [];
    for (let i = 0; i < universe.length; i++) {
      const meta = universe[i];
      const ctx = ctxs[i] || {};
      if (!meta || !meta.name || meta.isDelisted) continue;
      const markPx = Number(ctx.markPx ?? ctx.midPx);
      const midPx = Number(ctx.midPx ?? ctx.markPx);
      const prevDayPx = Number(ctx.prevDayPx);
      const change24hPct = Number.isFinite(markPx) && Number.isFinite(prevDayPx) && prevDayPx > 0
        ? ((markPx - prevDayPx) / prevDayPx) * 100
        : null;
      list.push({
        index: i,
        name: String(meta.name),
        szDecimals: Number(meta.szDecimals) || 0,
        maxLeverage: Number(meta.maxLeverage) || 20,
        onlyIsolated: Boolean(meta.onlyIsolated),
        markPx: Number.isFinite(markPx) && markPx > 0 ? markPx : null,
        midPx: Number.isFinite(midPx) && midPx > 0 ? midPx : null,
        prevDayPx: Number.isFinite(prevDayPx) && prevDayPx > 0 ? prevDayPx : null,
        change24hPct,
        fundingRate: ctx.funding !== undefined && Number.isFinite(Number(ctx.funding)) ? Number(ctx.funding) : null,
        openInterest: ctx.openInterest !== undefined && Number.isFinite(Number(ctx.openInterest)) ? Number(ctx.openInterest) : null,
        dayNtlVlm: ctx.dayNtlVlm !== undefined && Number.isFinite(Number(ctx.dayNtlVlm)) ? Number(ctx.dayNtlVlm) : 0
      });
    }
    const pinRank = new Map(PINNED_COINS.map((c, idx) => [c, idx]));
    list.sort((a, b) => {
      const pa = pinRank.has(a.name) ? pinRank.get(a.name) : 9999;
      const pb = pinRank.has(b.name) ? pinRank.get(b.name) : 9999;
      if (pa !== pb) return pa - pb;
      return (b.dayNtlVlm || 0) - (a.dayNtlVlm || 0);
    });
    return list;
  }

  async function fetchHlAccountState(userAddress) {
    const addr = String(userAddress || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
    const [chRes, spotRes, ordRes, fillsRes] = await Promise.allSettled([
      postHlInfo({ type: 'clearinghouseState', user: addr }),
      postHlInfo({ type: 'spotClearinghouseState', user: addr }),
      postHlInfo({ type: 'openOrders', user: addr }),
      postHlInfo({ type: 'userFills', user: addr })
    ]);

    const ch = chRes.status === 'fulfilled' && chRes.value ? chRes.value : {};
    const marginSummary = ch.marginSummary || ch.crossMarginSummary || {};
    const accountValue = Number.isFinite(Number(marginSummary.accountValue)) ? Number(marginSummary.accountValue) : 0;
    const totalMarginUsed = Number.isFinite(Number(marginSummary.totalMarginUsed)) ? Number(marginSummary.totalMarginUsed) : 0;
    const totalNtlPos = Number.isFinite(Number(marginSummary.totalNtlPos)) ? Number(marginSummary.totalNtlPos) : 0;
    const withdrawable = Number.isFinite(Number(ch.withdrawable)) ? Number(ch.withdrawable) : Math.max(0, accountValue - totalMarginUsed);

    const positions = [];
    const assetPositions = Array.isArray(ch.assetPositions) ? ch.assetPositions : [];
    for (const item of assetPositions) {
      const p = item && item.position ? item.position : item;
      if (!p || !p.coin) continue;
      const szi = Number(p.szi || 0);
      if (!Number.isFinite(szi) || Math.abs(szi) <= 0) continue;
      positions.push({
        coin: String(p.coin),
        szi,
        isLong: szi > 0,
        absSize: Math.abs(szi),
        entryPx: Number.isFinite(Number(p.entryPx)) ? Number(p.entryPx) : null,
        positionValue: Number.isFinite(Number(p.positionValue)) ? Number(p.positionValue) : null,
        unrealizedPnl: Number.isFinite(Number(p.unrealizedPnl)) ? Number(p.unrealizedPnl) : 0,
        returnOnEquity: Number.isFinite(Number(p.returnOnEquity)) ? Number(p.returnOnEquity) : null,
        liquidationPx: p.liquidationPx !== null && p.liquidationPx !== undefined && Number.isFinite(Number(p.liquidationPx))
          ? Number(p.liquidationPx)
          : null,
        marginUsed: Number.isFinite(Number(p.marginUsed)) ? Number(p.marginUsed) : null,
        leverageValue: p.leverage && Number.isFinite(Number(p.leverage.value)) ? Number(p.leverage.value) : null,
        leverageType: p.leverage && p.leverage.type ? String(p.leverage.type) : 'isolated'
      });
    }

    let spotUsdc = 0;
    if (spotRes.status === 'fulfilled' && spotRes.value && Array.isArray(spotRes.value.balances)) {
      const usdcBal = spotRes.value.balances.find((b) => String(b && b.coin || '').toUpperCase() === 'USDC');
      if (usdcBal) {
        const tot = Number(usdcBal.total || 0);
        const hold = Number(usdcBal.hold || 0);
        spotUsdc = Math.max(0, (Number.isFinite(tot) ? tot : 0) - (Number.isFinite(hold) ? hold : 0));
      }
    }

    const openOrders = ordRes.status === 'fulfilled' && Array.isArray(ordRes.value) ? ordRes.value : [];
    const fillsRaw = fillsRes.status === 'fulfilled' && Array.isArray(fillsRes.value) ? fillsRes.value : [];
    const fills = fillsRaw.slice(0, 40);

    return {
      user: addr,
      accountValue,
      withdrawable,
      totalMarginUsed,
      totalNtlPos,
      availableMargin: Math.max(0, accountValue - totalMarginUsed),
      spotUsdc,
      positions,
      openOrders,
      fills
    };
  }

  async function fetchHlOrderbook(coin) {
    const clean = String(coin || '').trim();
    if (!clean) {
      return { bids: [], asks: [], bidTotalSz: 0, askTotalSz: 0, bidOrderCount: 0, askOrderCount: 0, bidRatioPct: 50 };
    }
    const raw = await postHlInfo({ type: 'l2Book', coin: clean });
    const levels = raw && Array.isArray(raw.levels) ? raw.levels : [[], []];
    const mapRow = (row) => ({
      px: Number(row && row.px),
      sz: Number(row && row.sz),
      n: Number(row && row.n) || 1
    });
    const allBids = Array.isArray(levels[0]) ? levels[0].slice(0, 20).map(mapRow).filter((r) => r.px > 0 && r.sz > 0) : [];
    const allAsks = Array.isArray(levels[1]) ? levels[1].slice(0, 20).map(mapRow).filter((r) => r.px > 0 && r.sz > 0) : [];
    let bidTotalSz = 0;
    let bidOrderCount = 0;
    for (const r of allBids) {
      bidTotalSz += r.sz;
      bidOrderCount += r.n;
    }
    let askTotalSz = 0;
    let askOrderCount = 0;
    for (const r of allAsks) {
      askTotalSz += r.sz;
      askOrderCount += r.n;
    }
    const totalSz = bidTotalSz + askTotalSz;
    const bidRatioPct = totalSz > 0 ? (bidTotalSz / totalSz) * 100 : 50;
    return {
      bids: allBids.slice(0, 10),
      asks: allAsks.slice(0, 10),
      bidTotalSz,
      askTotalSz,
      bidOrderCount,
      askOrderCount,
      bidRatioPct
    };
  }

  async function fetchHlCandles(coin, interval = '15m', count = 48) {
    const clean = String(coin || '').trim();
    if (!clean) return [];
    const iv = ['5m', '15m', '1h', '4h'].includes(String(interval)) ? String(interval) : '15m';
    const intervalMsMap = { '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000 };
    const endTime = Date.now();
    const intervalMs = intervalMsMap[iv] || 900_000;
    const startTime = endTime - intervalMs * Math.max(12, Number(count) || 48);
    const raw = await postHlInfo({
      type: 'candleSnapshot',
      req: { coin: clean, interval: iv, startTime, endTime }
    });
    if (!Array.isArray(raw)) return [];
    return raw
      .map((c) => ({
        t: Number(c.t),
        o: Number(c.o),
        h: Number(c.h),
        l: Number(c.l),
        c: Number(c.c),
        v: Number(c.v)
      }))
      .filter((c) => Number.isFinite(c.c) && c.c > 0);
  }

  // ==================== Exchange Actions ====================

  async function postHlExchange({ action, nonce, signature, vaultAddress = undefined }) {
    const body = { action, nonce, signature };
    if (vaultAddress) body.vaultAddress = vaultAddress;
    const res = await fetchJsonWithTimeout(`${HL_API_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, 12_000);
    const json = res.data;
    if (!res.ok || !json || json.status !== 'ok') {
      const msg = (json && (json.response || json.error)) || res.rawText || `Hyperliquid HTTP ${res.status}`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
    const statuses = json.response && json.response.data && Array.isArray(json.response.data.statuses)
      ? json.response.data.statuses
      : [];
    const errItem = statuses.find((s) => s && s.error);
    if (errItem) {
      throw new Error(String(errItem.error));
    }
    return json;
  }

  async function updateHlLeverage({ wallet, assetIndex, leverage, isCross = false }) {
    const lev = Math.max(1, Math.round(Number(leverage) || 1));
    const action = {
      type: 'updateLeverage',
      asset: Number(assetIndex),
      isCross: Boolean(isCross),
      leverage: lev
    };
    const signed = await signHlL1Action({ wallet, action });
    return postHlExchange({ action, nonce: signed.nonce, signature: signed.signature });
  }

  async function placeHlPerpOrder({
    wallet,
    market,
    isBuy,
    size,
    orderType = 'market',
    limitPrice = null,
    slippageBps = 50,
    reduceOnly = false,
    leverage = null,
    isCross = false,
    tpPrice = null,
    slPrice = null,
    availableMargin = null
  }) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    if (!market || market.index === undefined) throw new Error(t('请选择有效合约市场', 'Select a valid perpetual market'));

    const szDec = Number(market.szDecimals) || 0;
    const sizeStr = formatHlSize(size, szDec);
    const sizeNum = Number(sizeStr);
    if (!Number.isFinite(sizeNum) || sizeNum <= 0) {
      throw new Error(t('下单数量过小', 'Order size too small'));
    }

    const isMarket = String(orderType).toLowerCase() !== 'limit';
    let refPx = 0;
    if (isMarket) {
      const mark = Number(market.markPx || market.midPx || 0);
      if (!Number.isFinite(mark) || mark <= 0) {
        throw new Error(t('暂未获取实时价格', 'Live market price unavailable'));
      }
      const slip = Math.max(10, Number(slippageBps) || 50) / 10_000;
      refPx = isBuy ? mark * (1 + slip) : mark * (1 - slip);
    } else {
      refPx = Number(limitPrice);
      if (!Number.isFinite(refPx) || refPx <= 0) {
        throw new Error(t('请输入有效的限价委托价格', 'Enter a valid limit price'));
      }
    }

    const pxStr = formatHlPrice(refPx, szDec);
    const pxNum = Number(pxStr);
    const estNotional = sizeNum * (isMarket ? Number(market.markPx || pxNum) : pxNum);

    if (!reduceOnly && estNotional < HL_MIN_ORDER_USD) {
      throw new Error(
        t(
          `Hyperliquid 最低下单名义价值为 $${HL_MIN_ORDER_USD} USDC`,
          `Hyperliquid minimum order notional is $${HL_MIN_ORDER_USD} USDC`
        )
      );
    }

    const maxLev = Number(market.maxLeverage) || 20;
    const effLev = Math.max(1, Math.min(maxLev, Math.round(Number(leverage) || 5)));
    const effectiveCross = market.onlyIsolated ? false : Boolean(isCross);

    if (!reduceOnly && availableMargin !== null && availableMargin !== undefined) {
      const avail = Number(availableMargin);
      const reqMargin = estNotional / effLev;
      if (!Number.isFinite(avail) || avail < reqMargin) {
        throw new Error(
          t(
            `合约可用保证金不足 (当前可用: $${Math.max(0, avail || 0).toFixed(2)}, 需约: $${reqMargin.toFixed(2)})`,
            `Insufficient margin (available: $${Math.max(0, avail || 0).toFixed(2)}, required: $${reqMargin.toFixed(2)})`
          )
        );
      }
    }

    if (!reduceOnly && leverage !== null && leverage !== undefined) {
      await updateHlLeverage({
        wallet,
        assetIndex: market.index,
        leverage: effLev,
        isCross: effectiveCross
      });
    }

    const orders = [
      {
        a: Number(market.index),
        b: Boolean(isBuy),
        p: pxStr,
        s: sizeStr,
        r: Boolean(reduceOnly),
        t: { limit: { tif: isMarket ? 'Ioc' : 'Gtc' } }
      }
    ];

    let grouping = 'na';
    const tpNum = Number(tpPrice);
    const slNum = Number(slPrice);
    if (!reduceOnly && Number.isFinite(tpNum) && tpNum > 0) {
      grouping = 'normalTpsl';
      const tpStr = formatHlPrice(tpNum, szDec);
      orders.push({
        a: Number(market.index),
        b: !Boolean(isBuy),
        p: tpStr,
        s: sizeStr,
        r: true,
        t: { trigger: { isMarket: true, triggerPx: tpStr, tpsl: 'tp' } }
      });
    }
    if (!reduceOnly && Number.isFinite(slNum) && slNum > 0) {
      grouping = 'normalTpsl';
      const slStr = formatHlPrice(slNum, szDec);
      orders.push({
        a: Number(market.index),
        b: !Boolean(isBuy),
        p: slStr,
        s: sizeStr,
        r: true,
        t: { trigger: { isMarket: true, triggerPx: slStr, tpsl: 'sl' } }
      });
    }

    const action = { type: 'order', orders, grouping };
    const signed = await signHlL1Action({ wallet, action });
    const res = await postHlExchange({ action, nonce: signed.nonce, signature: signed.signature });
    return { ok: true, action, response: res };
  }

  async function cancelHlOrder({ wallet, assetIndex, oid }) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const action = {
      type: 'cancel',
      cancels: [{ a: Number(assetIndex), o: Number(oid) }]
    };
    const signed = await signHlL1Action({ wallet, action });
    const res = await postHlExchange({ action, nonce: signed.nonce, signature: signed.signature });
    return { ok: true, response: res };
  }

  async function closeHlPositionMarket({ wallet, market, position, slippageBps = 80 }) {
    if (!position || !position.absSize) throw new Error(t('无效持仓', 'Invalid position'));
    return placeHlPerpOrder({
      wallet,
      market,
      isBuy: !position.isLong,
      size: position.absSize,
      orderType: 'market',
      slippageBps,
      reduceOnly: true
    });
  }

  // ==================== Funding, Internal Transfer & Arbitrum Withdraw ====================

  async function transferHlUsdClass({ wallet, amount, toPerp = true }) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      throw new Error(t('请输入有效的划转数量', 'Enter a valid transfer amount'));
    }
    const amtStr = formatHlUsdcAmount(num);
    const nonce = nextHlNonce();
    const { action, signature } = await signHlUserSignedAction({
      wallet,
      action: {
        type: 'usdClassTransfer',
        amount: amtStr,
        toPerp: Boolean(toPerp),
        nonce
      },
      payloadTypes: HL_USD_CLASS_TRANSFER_TYPES,
      primaryType: 'HyperliquidTransaction:UsdClassTransfer'
    });
    const res = await postHlExchange({ action, nonce, signature });
    return { ok: true, amount: amtStr, toPerp: Boolean(toPerp), response: res };
  }

  async function withdrawHlToArbitrum({ wallet, amount, destination = null, withdrawable = null }) {
    const contracts = getContracts();
    if (!wallet || !contracts) throw new Error(t('钱包或签名引擎不可用', 'Wallet or signer unavailable'));
    const num = Number(amount);
    if (!Number.isFinite(num) || num < HL_WITHDRAW_MIN_USDC) {
      throw new Error(
        t(
          `Hyperliquid 提现至 Arbitrum 最低 ${HL_WITHDRAW_MIN_USDC} USDC (协议手续费 ${HL_WITHDRAW_FEE_USDC} USDC)`,
          `Minimum withdrawal to Arbitrum is ${HL_WITHDRAW_MIN_USDC} USDC (${HL_WITHDRAW_FEE_USDC} USDC protocol fee)`
        )
      );
    }
    if (withdrawable !== null && withdrawable !== undefined) {
      const avail = Number(withdrawable);
      if (!Number.isFinite(avail) || num > avail) {
        throw new Error(
          t(
            `可提现余额不足 (当前可用: $${Math.max(0, avail || 0).toFixed(2)} USDC)`,
            `Insufficient withdrawable USDC (available: $${Math.max(0, avail || 0).toFixed(2)} USDC)`
          )
        );
      }
    }
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const destAddr = destination || contracts.resolveWalletEvmSender(resolvedWallet);
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(destAddr || ''))) {
      throw new Error(t('Arbitrum 收款地址无效', 'Invalid Arbitrum destination address'));
    }
    const time = nextHlNonce();
    const amtStr = formatHlUsdcAmount(num);
    const { action, signature } = await signHlUserSignedAction({
      wallet: resolvedWallet,
      action: {
        type: 'withdraw3',
        destination: destAddr,
        amount: amtStr,
        time
      },
      payloadTypes: HL_WITHDRAW_TYPES,
      primaryType: 'HyperliquidTransaction:Withdraw'
    });
    const res = await postHlExchange({ action, nonce: time, signature });
    return { ok: true, amount: amtStr, destination: destAddr, response: res };
  }

  async function depositArbUsdcToHlBridge({ wallet, amount, arbUsdcBalance = null, arbEthBalance = null }) {
    const contracts = getContracts();
    const st = getState();
    if (!wallet || !contracts) throw new Error(t('钱包或签名引擎不可用', 'Wallet or signer unavailable'));
    const num = Number(amount);
    if (!Number.isFinite(num) || num < HL_ARB_BRIDGE_MIN_USDC) {
      throw new Error(
        t(
          `Arbitrum 直充最低 ${HL_ARB_BRIDGE_MIN_USDC} USDC，低于 ${HL_ARB_BRIDGE_MIN_USDC} USDC 将被合约永久丢失`,
          `Arbitrum Bridge2 requires at least ${HL_ARB_BRIDGE_MIN_USDC} USDC (deposits under ${HL_ARB_BRIDGE_MIN_USDC} USDC are permanently lost)`
        )
      );
    }
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const usdcBal = arbUsdcBalance !== null && arbUsdcBalance !== undefined
      ? Number(arbUsdcBalance)
      : Number((st && typeof st.getWalletErc20Balance === 'function' ? st.getWalletErc20Balance(resolvedWallet, 'arb', HL_ARB_USDC_ADDRESS) : 0) || 0);
    if (!Number.isFinite(usdcBal) || usdcBal < num) {
      throw new Error(
        t(
          `Arbitrum USDC 余额不足 (当前可用: ${Math.max(0, usdcBal || 0).toFixed(2)} USDC)`,
          `Insufficient Arbitrum USDC (available: ${Math.max(0, usdcBal || 0).toFixed(2)} USDC)`
        )
      );
    }
    const ethBal = arbEthBalance !== null && arbEthBalance !== undefined
      ? Number(arbEthBalance)
      : contracts.resolveWalletChainBalance(resolvedWallet, 'arb');
    if (!Number.isFinite(ethBal) || ethBal < HL_ARB_MIN_ETH_GAS) {
      throw new Error(
        t(
          `Arbitrum ETH Gas 不足 (当前可用: ${Math.max(0, ethBal || 0).toFixed(5)} ETH，需 >= ${HL_ARB_MIN_ETH_GAS} ETH)`,
          `Insufficient Arbitrum ETH for gas (available: ${Math.max(0, ethBal || 0).toFixed(5)} ETH, need >= ${HL_ARB_MIN_ETH_GAS} ETH)`
        )
      );
    }
    const txRes = await contracts.executeEvmTransfer({
      wallet: resolvedWallet,
      chainKey: 'arb',
      toAddress: HL_ARB_BRIDGE2_ADDRESS,
      amount: num,
      tokenContract: HL_ARB_USDC_ADDRESS,
      decimals: 6,
      tokenBalance: usdcBal
    });
    return { ok: true, txHash: txRes.txHash, explorerUrl: txRes.explorerUrl, amount: num };
  }

  function isDirectOneClickOriginForHl(token) {
    if (!token) return false;
    const bc = String(token.blockchain || '').toLowerCase();
    const rawId = String(token.assetId || '').trim();
    const lowId = rawId.toLowerCase();
    if (['prl', 'qtc', 'arc', 'hood'].includes(bc)) return false;
    if (lowId.includes('prl.omft.near') || lowId.includes('qtc.omft.near') || lowId.includes('1cs_v1:prl:')) return false;
    if (/^(nep141:|nep245:|1cs_v1:)/i.test(rawId)) return true;
    const intents = getIntents();
    if (intents && typeof intents.resolveOneClickAssetId === 'function') {
      const resolved = intents.resolveOneClickAssetId(token, bc);
      return /^(nep141:|nep245:|1cs_v1:)/i.test(String(resolved || ''));
    }
    return false;
  }

  async function quoteOneClickDepositToHlSpot({ wallet, originToken, amount, slippageBps = 100, dry = true, refundTo = null }) {
    const intents = getIntents();
    const contracts = getContracts();
    if (!intents || !contracts) throw new Error('Routing engine unavailable');
    if (!wallet || !originToken || !originToken.assetId) {
      return { ok: false, error: t('请选择跨链充值源代币', 'Select a valid origin token') };
    }
    if (!isDirectOneClickOriginForHl(originToken)) {
      return {
        ok: false,
        unsupportedDirect: true,
        error: t(
          '该代币暂不支持直接跨链充值，请先在「闪兑」换为 USDC / NEAR / SOL',
          'Swap to USDC / NEAR / SOL first to deposit'
        )
      };
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      return { ok: false, error: t('请输入有效的充值数量', 'Enter a positive deposit amount') };
    }
    const resolvedWallet = await contracts.ensureWalletSigningKeysAsync(wallet);
    const hlRecipientRaw = contracts.resolveWalletEvmSender(resolvedWallet);
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(hlRecipientRaw || ''))) {
      return { ok: false, error: t('Hyperliquid EVM 账户地址不可用', 'Hyperliquid EVM address unavailable') };
    }
    const hlRecipient = String(hlRecipientRaw).toLowerCase();
    const nearAcct = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    const bc = String(originToken.blockchain || '').toLowerCase();
    const resolvedRefundRaw = refundTo || (
      bc === 'near' ? nearAcct :
      bc === 'sol' ? resolvedWallet.solAddress :
      bc === 'btc' ? resolvedWallet.btcAddress :
      hlRecipient
    );
    const resolvedRefund = /^0x[0-9a-fA-F]{40}$/.test(String(resolvedRefundRaw || ''))
      ? String(resolvedRefundRaw).toLowerCase()
      : resolvedRefundRaw;
    const resolvedOriginId = typeof intents.resolveOneClickAssetId === 'function'
      ? intents.resolveOneClickAssetId(originToken, bc)
      : originToken.assetId;
    const amountRaw = intents.toBaseUnits(num, originToken.decimals || 6);
    const quote = await intents.quoteIntentSwapOrWithdraw({
      originAsset: resolvedOriginId,
      originBlockchain: bc,
      destinationAsset: HL_ONECLICK_SPOT_USDC_ASSET_ID,
      destinationBlockchain: 'hypercore',
      amountRaw,
      slippageBps,
      recipient: hlRecipient,
      refundTo: resolvedRefund,
      nearAccountId: nearAcct,
      depositType: 'ORIGIN_CHAIN',
      recipientType: 'DESTINATION_CHAIN',
      dry
    });
    return { ...quote, hlRecipient, refundTo: resolvedRefund, amountRaw };
  }

  const api = {
    HL_API_URL,
    HL_MIN_ORDER_USD,
    HL_ARB_BRIDGE2_ADDRESS,
    HL_ARB_USDC_ADDRESS,
    HL_ARB_BRIDGE_MIN_USDC,
    HL_ARB_MIN_ETH_GAS,
    HL_WITHDRAW_MIN_USDC,
    HL_WITHDRAW_FEE_USDC,
    HL_ONECLICK_SPOT_USDC_ASSET_ID,
    HL_EIP712_L1_DOMAIN,
    HL_EIP712_USER_DOMAIN,
    HL_AGENT_EIP712_TYPES,
    HL_USD_CLASS_TRANSFER_TYPES,
    HL_WITHDRAW_TYPES,
    HL_SPOT_SEND_TYPES,
    PINNED_COINS,
    msgpackEncode,
    formatHlPrice,
    formatHlSize,
    formatHlUsdcAmount,
    computeEstimatedLiqPrice,
    nextHlNonce,
    computeHlActionHash,
    signHlL1Action,
    signHlUserSignedAction,
    fetchHlMarkets,
    fetchHlAccountState,
    fetchHlOrderbook,
    fetchHlCandles,
    updateHlLeverage,
    placeHlPerpOrder,
    cancelHlOrder,
    closeHlPositionMarket,
    transferHlUsdClass,
    withdrawHlToArbitrum,
    depositArbUsdcToHlBridge,
    isDirectOneClickOriginForHl,
    quoteOneClickDepositToHlSpot
  };

  if (root) {
    root.NearCAHyperliquid = api;
    root.NearCA = root.NearCA || {};
    root.NearCA.hyperliquid = api;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.NearCAHyperliquid = api;
    globalThis.NearCA = globalThis.NearCA || {};
    globalThis.NearCA.hyperliquid = api;
  }
  if (typeof window !== 'undefined') {
    window.NearCAHyperliquid = api;
    window.NearCA = window.NearCA || {};
    window.NearCA.hyperliquid = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
