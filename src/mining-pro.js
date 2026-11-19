/**
 * NEAR Chain Abstraction Wallet - Deep Mining Analytics & Rig Telemetry Module
 * Provides real-time Pearl (PRL) network telemetry, multi-pool miner & per-rig analytics
 * (Kryptex / HeroMiners / prlscan on-chain), saved miner watchlist persistence, and
 * 1Click / NEAR Intents bridging from prl1p... miner addresses to .near master accounts.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.NearCAMining = api;
  }
  if (typeof window !== 'undefined') {
    window.NearCAMining = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_RPC_GATEWAY = 'https://api.prlscan.com/v1';
  const HEROMINERS_API_BASE = 'https://pearl.herominers.com/api';
  const KRYPTEX_API_BASE = 'https://pool.kryptex.com';
  const ONECLICK_QUOTE_URL = 'https://1click.chaindefuser.com/v0/quote';
  const PRLSCAN_TX_EXPLORER_BASE = 'https://explorer.prlscan.com/tx/';
  const SAVED_MINERS_STORAGE_KEY = 'near_ca_saved_miners_v1';

  const PRL_ORIGIN_ASSET_ID = 'nep141:prl.omft.near';
  const PRL_ON_NEAR_ASSET_ID = '1cs_v1:near:nep141:prl.omft.near';
  const NEAR_WRAP_ASSET_ID = 'nep141:wrap.near';
  const NEAR_USDT_ASSET_ID = 'nep141:usdt.tether-token.near';
  const NEAR_USDC_ASSET_ID = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';

  const GRAINS_PER_PRL = 1e8;
  const HERO_HASHRATE_SCALE = 4294967296; // 2^32
  const HERO_DIFFICULTY_SCALE = 65536; // 2^16
  const DEFAULT_PRL_FEE_BUFFER = 0.00000308; // 154 vBytes * 2 grains/vByte Taproot buffer
  const DEFAULT_TIMEOUT_MS = 8000;
  const KRYPTEX_TIMEOUT_MS = 6000;
  const HERO_ONLINE_GRACE_SEC = 1800;

  // Fallback in-memory storage when localStorage is absent (e.g., headless Node)
  let memoryWatchlist = [];
  const poolConfigCache = {
    heroMinPaymentPrl: null,
    heroFeePercent: null,
    kryptexThresholdPrl: null,
    kryptexFeePercent: null
  };

  // ======================== Bech32m Address Validation ========================

  const BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const BECH32M_CONST = 0x2bc830a3;

  function bech32Polymod(values) {
    let chk = 1;
    const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    for (let p = 0; p < values.length; p++) {
      const top = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ values[p];
      for (let i = 0; i < 5; i++) {
        if ((top >> i) & 1) chk ^= generators[i];
      }
    }
    return chk;
  }

  function bech32HrpExpand(hrp) {
    const ret = [];
    for (let p = 0; p < hrp.length; p++) ret.push(hrp.charCodeAt(p) >> 5);
    ret.push(0);
    for (let p = 0; p < hrp.length; p++) ret.push(hrp.charCodeAt(p) & 31);
    return ret;
  }

  function convertBits(data, fromBits, toBits, pad) {
    let acc = 0;
    let bits = 0;
    const ret = [];
    const maxv = (1 << toBits) - 1;
    for (let p = 0; p < data.length; p++) {
      const val = data[p];
      if (val < 0 || (val >> fromBits) !== 0) return null;
      acc = (acc << fromBits) | val;
      bits += fromBits;
      while (bits >= toBits) {
        bits -= toBits;
        ret.push((acc >> bits) & maxv);
      }
    }
    if (pad) {
      if (bits > 0) ret.push((acc << (toBits - bits)) & maxv);
    } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
      return null;
    }
    return ret;
  }

  function decodeBech32mFallback(address) {
    if (typeof address !== 'string') {
      return { valid: false, error: 'Address must be a string' };
    }
    if (address.length < 8 || address.length > 90) {
      return { valid: false, error: `Invalid address length: ${address.length}` };
    }
    const isLower = address === address.toLowerCase();
    const isUpper = address === address.toUpperCase();
    if (!isLower && !isUpper) {
      return { valid: false, error: 'Mixed case is not allowed in Bech32' };
    }
    const addr = address.toLowerCase();
    const sep = addr.lastIndexOf('1');
    if (sep <= 0 || sep + 7 > addr.length) {
      return { valid: false, error: 'Invalid HRP or Bech32 separator' };
    }
    const hrp = addr.slice(0, sep);
    const dataChars = addr.slice(sep + 1);
    const data = [];
    for (let i = 0; i < dataChars.length; i++) {
      const idx = BECH32_CHARSET.indexOf(dataChars[i]);
      if (idx === -1) {
        return { valid: false, error: `Invalid bech32 character: ${dataChars[i]}` };
      }
      data.push(idx);
    }
    const poly = bech32Polymod(bech32HrpExpand(hrp).concat(data));
    if (poly !== BECH32M_CONST) {
      return { valid: false, error: 'Invalid Bech32m checksum' };
    }
    const values = data.slice(0, data.length - 6);
    if (values.length < 1) {
      return { valid: false, error: 'Empty witness data' };
    }
    const witnessVersion = values[0];
    const programBytes = convertBits(values.slice(1), 5, 8, false);
    if (!programBytes) {
      return { valid: false, error: 'Invalid 5-bit witness program encoding' };
    }
    return { valid: true, hrp, witnessVersion, programBytes };
  }

  /**
   * Clean raw miner input by stripping optional solo: prefix and :worker or /worker suffixes.
   * Preserves original casing before Bech32m validation rejects mixed-case inputs.
   */
  function cleanMinerAddress(rawAddress) {
    if (typeof rawAddress !== 'string') return '';
    let trimmed = rawAddress.trim();
    if (/^solo:/i.test(trimmed)) {
      trimmed = trimmed.slice(5);
    }
    return trimmed.split(/[:/]/)[0].trim();
  }

  /**
   * Validate a Pearl (prl1p...) Taproot Bech32m address via NearCACrypto or built-in decoder.
   */
  function validatePearlAddress(address) {
    const clean = cleanMinerAddress(address);
    if (!clean) {
      return { valid: false, error: 'Pearl address is empty' };
    }
    const externalCrypto =
      (typeof globalThis !== 'undefined' && globalThis.NearCACrypto) ||
      (typeof window !== 'undefined' && window.NearCACrypto) ||
      null;
    const externalFn =
      (externalCrypto && typeof externalCrypto.validatePearlAddress === 'function' && externalCrypto.validatePearlAddress) ||
      (typeof globalThis !== 'undefined' && typeof globalThis.validatePearlAddress === 'function' && globalThis.validatePearlAddress) ||
      null;

    if (externalFn && externalFn !== validatePearlAddress) {
      return externalFn(clean);
    }

    const decoded = decodeBech32mFallback(clean);
    if (!decoded.valid) {
      return { valid: false, error: decoded.error };
    }
    if (decoded.hrp !== 'prl') {
      return { valid: false, error: `Invalid HRP: expected 'prl', got '${decoded.hrp}'` };
    }
    if (decoded.witnessVersion !== 1) {
      return { valid: false, error: `Invalid witness version: expected 1 (Taproot), got ${decoded.witnessVersion}` };
    }
    if (!decoded.programBytes || decoded.programBytes.length !== 32) {
      return { valid: false, error: 'Invalid witness program length: expected 32 bytes' };
    }
    return { valid: true, decoded };
  }

  // ======================== Numeric, Time & Formatting Helpers ========================

  function toFiniteNumberOrNull(val) {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
  }

  function toPositiveOrZeroNumber(val) {
    const num = toFiniteNumberOrNull(val);
    return num !== null && num >= 0 ? num : null;
  }

  function grainsToPrl(grains) {
    const num = toFiniteNumberOrNull(grains);
    if (num === null) return null;
    return Number((num / GRAINS_PER_PRL).toFixed(8));
  }

  function normalizeTimestampIso(raw) {
    if (raw === null || raw === undefined || raw === '' || raw === 0 || raw === '0') return null;
    if (typeof raw === 'string' && !/^\d+(\.\d+)?$/.test(raw.trim())) {
      const parsed = Date.parse(raw);
      return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) return null;
    // Unix seconds (< 1e12) vs milliseconds (>= 1e12)
    const ms = num >= 1e12 ? num : num * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  function normalizeHeroHashrateHps(rawVal) {
    const num = toPositiveOrZeroNumber(rawVal);
    if (num === null) return null;
    if (num === 0) return 0;
    // HeroMiners reports Pearl hashrate in 2^-32 scaled units (< 1e11); raw H/s mocks >= 1e11 stay unscaled
    return num < 1e11 ? num * HERO_HASHRATE_SCALE : num;
  }

  /**
   * Format raw H/s into H/s, KH/s, MH/s, GH/s, TH/s, PH/s, or EH/s.
   * Returns '--' when input is null, undefined, NaN, non-finite, or negative.
   */
  function formatHashrate(hps) {
    if (hps === null || hps === undefined || hps === '') return '--';
    const num = Number(hps);
    if (!Number.isFinite(num) || num < 0) return '--';

    const units = [
      { threshold: 1e18, label: 'EH/s' },
      { threshold: 1e15, label: 'PH/s' },
      { threshold: 1e12, label: 'TH/s' },
      { threshold: 1e9, label: 'GH/s' },
      { threshold: 1e6, label: 'MH/s' },
      { threshold: 1e3, label: 'KH/s' }
    ];
    for (let i = 0; i < units.length; i++) {
      if (num >= units[i].threshold) {
        return `${(num / units[i].threshold).toFixed(2)} ${units[i].label}`;
      }
    }
    return `${num.toFixed(2)} H/s`;
  }

  function toBaseUnits(amountInput, decimals) {
    let raw = String(amountInput === null || amountInput === undefined ? '' : amountInput).trim();
    if (/^\d+(\.\d+)?[eE][+-]?\d+$/.test(raw)) {
      const num = Number(raw);
      if (!Number.isFinite(num) || num <= 0) return '0';
      raw = num.toFixed(decimals);
    }
    if (!/^\d+(\.\d+)?$/.test(raw)) return '0';
    const parts = raw.split('.');
    const whole = parts[0] || '0';
    const frac = (parts[1] || '').slice(0, decimals).padEnd(decimals, '0');
    const combined = (whole + frac).replace(/^0+/, '');
    return combined || '0';
  }

  function computePayoutProgressPct(unpaidPrl, thresholdPrl) {
    if (unpaidPrl === null || thresholdPrl === null || thresholdPrl <= 0) return null;
    const pct = (unpaidPrl / thresholdPrl) * 100;
    if (!Number.isFinite(pct)) return null;
    return Number(Math.min(100, Math.max(0, pct)).toFixed(2));
  }

  function computeShareAcceptRate(valid, invalid) {
    if (valid === null || invalid === null) return null;
    const total = valid + invalid;
    if (!Number.isFinite(total) || total <= 0) return null;
    return Number(((valid / total) * 100).toFixed(2));
  }

  function normalizePayoutStatus(status) {
    if (!status) return 'confirmed';
    const s = String(status).trim().toLowerCase();
    if (s === 'finished' || s === 'completed' || s === 'confirmed' || s === 'paid') return 'confirmed';
    if (s === 'pending' || s === 'processing' || s === 'unconfirmed') return 'pending';
    return s;
  }

  function buildExplorerTxUrl(txid) {
    return txid ? `${PRLSCAN_TX_EXPLORER_BASE}${encodeURIComponent(txid)}` : null;
  }

  // ======================== HTTP & Multi-Route Fetch Helpers ========================

  function getFetchImpl() {
    if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
      return globalThis.fetch;
    }
    if (typeof fetch === 'function') {
      return fetch;
    }
    throw new Error('Fetch API is unavailable in the current environment');
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const fetchFn = getFetchImpl();
    const hasAbort = typeof AbortController !== 'undefined';
    const controller = hasAbort ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const reqOptions = Object.assign({}, options);
      if (controller && !reqOptions.signal) {
        reqOptions.signal = controller.signal;
      }
      return await fetchFn(url, reqOptions);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchJsonSafe(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
      if (!res || !res.ok) {
        return { ok: false, status: res ? res.status : 0, data: null };
      }
      const data = await res.json();
      return { ok: true, status: res.status, data };
    } catch (err) {
      return { ok: false, status: 0, data: null, error: err };
    }
  }

  function isNativeCapacitorRuntime() {
    return Boolean(
      typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
  }

  function getBrowserKryptexProxyUrls(apiPath) {
    if (typeof window === 'undefined' || isNativeCapacitorRuntime()) return [];
    const origin = window.location && window.location.origin ? window.location.origin : '';
    const hostname = window.location && window.location.hostname ? window.location.hostname : '';
    if (/^https?:\/\//i.test(origin) && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      return [`/kryptex-proxy?path=${encodeURIComponent(apiPath)}`];
    }
    return [];
  }

  /**
   * Fetch Kryptex JSON or HTML via CapacitorHttp (on native mobile) or direct pool.kryptex.com with local dev /kryptex-proxy fallback.
   */
  async function fetchKryptexResource(apiPath, expectType = 'json') {
    const directUrl = `${KRYPTEX_API_BASE}${apiPath}`;
    const acceptHeader = expectType === 'html' ? 'text/html,application/xhtml+xml' : 'application/json';
    const parseResponse = async (res) => {
      if (!res) return null;
      if (expectType === 'html') return await res.text();
      return await res.json();
    };

    if (isNativeCapacitorRuntime() && typeof window !== 'undefined' && window.Capacitor?.Plugins?.CapacitorHttp?.request) {
      try {
        const res = await window.Capacitor.Plugins.CapacitorHttp.request({
          url: directUrl,
          method: 'GET',
          headers: { Accept: acceptHeader },
          connectTimeout: KRYPTEX_TIMEOUT_MS,
          readTimeout: KRYPTEX_TIMEOUT_MS
        });
        if (res && res.status >= 200 && res.status < 300) {
          if (expectType === 'html') return typeof res.data === 'string' ? res.data : String(res.data || '');
          return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        }
        return null;
      } catch (_) {
        return null;
      }
    }

    try {
      const res = await fetchWithTimeout(
        directUrl,
        { headers: { Accept: acceptHeader } },
        KRYPTEX_TIMEOUT_MS
      );
      if (res && res.ok) {
        return await parseResponse(res);
      }
      // 404 means endpoint exists on server and intentionally returned Not Found; skip proxy retry
      if (res && res.status === 404) {
        return null;
      }
    } catch (_) {
      // Fall through to proxy routes on CORS / network failure
    }

    const proxyUrls = getBrowserKryptexProxyUrls(apiPath);
    for (let i = 0; i < proxyUrls.length; i++) {
      try {
        const res = await fetchWithTimeout(
          proxyUrls[i],
          { headers: { Accept: acceptHeader } },
          KRYPTEX_TIMEOUT_MS
        );
        if (res && res.ok) {
          return await parseResponse(res);
        }
      } catch (_) {}
    }
    return null;
  }

  // ======================== Kryptex Nuxt SSR HTML Extractor ========================

  function resolveNuxtRef(data, val) {
    if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && val < data.length) {
      return data[val];
    }
    return val;
  }

  /**
   * Extract workers, balance, and payouts from Kryptex Nuxt SSR HTML payload.
   */
  function extractKryptexDataFromHtml(html) {
    if (!html || typeof html !== 'string') return null;
    try {
      const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
      let match;
      let rawJsonStr = null;
      while ((match = scriptRegex.exec(html)) !== null) {
        const body = (match[1] || '').trim();
        if (body.startsWith('[[')) {
          rawJsonStr = body;
          break;
        }
      }
      if (!rawJsonStr) return null;
      const data = JSON.parse(rawJsonStr);
      if (!Array.isArray(data)) return null;

      const workers = [];
      const payouts = [];
      let balance = null;

      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;

        if ('worker' in item && ('avg_hashrate_24h' in item || 'avg_hashrate_30m' in item)) {
          const workerName = resolveNuxtRef(data, item.worker);
          const status = resolveNuxtRef(data, item.status);
          const h30m = toPositiveOrZeroNumber(resolveNuxtRef(data, item.avg_hashrate_30m));
          const h3h = toPositiveOrZeroNumber(resolveNuxtRef(data, item.avg_hashrate_3h));
          const h24h = toPositiveOrZeroNumber(resolveNuxtRef(data, item.avg_hashrate_24h));
          const lastShare = resolveNuxtRef(data, item.last_share);
          const valid = toPositiveOrZeroNumber(resolveNuxtRef(data, item.valid));
          const stale = toPositiveOrZeroNumber(resolveNuxtRef(data, item.stale));
          const invalid = toPositiveOrZeroNumber(resolveNuxtRef(data, item.invalid));
          const agent = resolveNuxtRef(data, item.agent);

          workers.push({
            worker: String(workerName || 'worker'),
            status: String(status || 'offline').toLowerCase() === 'online' ? 'online' : 'offline',
            avg_hashrate_30m: h30m,
            avg_hashrate_3h: h3h,
            avg_hashrate_24h: h24h,
            last_share: lastShare,
            valid,
            stale,
            invalid,
            agent: agent ? String(agent) : null
          });
        } else if (!balance && 'total' in item && 'unconfirmed' in item && 'confirmed' in item && 'threshold' in item) {
          balance = {
            total: toPositiveOrZeroNumber(resolveNuxtRef(data, item.total)),
            unconfirmed: toPositiveOrZeroNumber(resolveNuxtRef(data, item.unconfirmed)),
            confirmed: toPositiveOrZeroNumber(resolveNuxtRef(data, item.confirmed)),
            threshold: toPositiveOrZeroNumber(resolveNuxtRef(data, item.threshold)),
            reached_pct: toPositiveOrZeroNumber(resolveNuxtRef(data, item.reached_pct)),
            last_active: resolveNuxtRef(data, item.last_active)
          };
        } else if ('txid' in item && 'amount' in item && 'status' in item) {
          const txid = resolveNuxtRef(data, item.txid);
          const amount = toPositiveOrZeroNumber(resolveNuxtRef(data, item.amount));
          const date = resolveNuxtRef(data, item.date);
          const status = resolveNuxtRef(data, item.status);
          if (txid && amount !== null) {
            payouts.push({
              txid: String(txid),
              amount,
              date,
              status: status ? String(status) : 'FINISHED'
            });
          }
        }
      }

      if (workers.length === 0 && !balance && payouts.length === 0) return null;
      return { workers, balance, payouts, count: workers.length };
    } catch (_) {
      return null;
    }
  }

  // ======================== Network & Pool Telemetry ========================

  function computeAvgBlockTimeSec(blockItems) {
    if (!Array.isArray(blockItems) || blockItems.length < 2) return null;
    const newestMs = Date.parse(blockItems[0] && blockItems[0].time);
    const oldestMs = Date.parse(blockItems[blockItems.length - 1] && blockItems[blockItems.length - 1].time);
    if (!Number.isFinite(newestMs) || !Number.isFinite(oldestMs) || newestMs <= oldestMs) {
      return null;
    }
    const avgSec = (newestMs - oldestMs) / 1000 / (blockItems.length - 1);
    if (!Number.isFinite(avgSec) || avgSec <= 0 || avgSec >= 86400) return null;
    return Math.round(avgSec);
  }

  function parseHeroNetworkHistory(charts) {
    const raw = charts && Array.isArray(charts.network_hashrate) ? charts.network_hashrate : [];
    if (raw.length === 0) return [];
    const step = Math.max(1, Math.floor(raw.length / 24));
    const points = [];
    for (let i = 0; i < raw.length; i += step) {
      const pt = raw[i];
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const tsNum = Number(pt[0]);
      const scaledVal = Number(pt[1]);
      if (!Number.isFinite(tsNum) || !Number.isFinite(scaledVal) || scaledVal <= 0) continue;
      const hps = scaledVal * HERO_HASHRATE_SCALE;
      const ms = tsNum >= 1e12 ? tsNum : tsNum * 1000;
      const d = new Date(ms);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      points.push({
        timestamp: ms,
        time: `${hh}:${mm}`,
        hashrateHps: hps,
        hashrateEh: Number((hps / 1e18).toFixed(2))
      });
    }
    return points;
  }

  const _telemetryCache = new Map();
  const _telemetryInFlight = new Map();
  const _minerStatsCache = new Map();
  const _minerStatsInFlight = new Map();

  function _settledValue(res) {
    return res && res.status === 'fulfilled' ? res.value : null;
  }

  /**
   * Fetch live Pearl mainnet telemetry and pool statistics from prlscan, HeroMiners, and Kryptex.
   * All missing or failed fields strictly remain null (never fabricated fallback numbers).
   */
  async function fetchNetworkAndPoolTelemetry(rpcGatewayUrl = DEFAULT_RPC_GATEWAY, options = {}) {
    const baseUrl = String(rpcGatewayUrl || DEFAULT_RPC_GATEWAY).replace(/\/+$/, '');
    if (options && options.useCache === true) {
      const cached = _telemetryCache.get(baseUrl);
      if (cached && (Date.now() - cached.ts < 60_000)) {
        return cached.data;
      }
    }
    if (_telemetryInFlight.has(baseUrl)) {
      return _telemetryInFlight.get(baseUrl);
    }
    const job = (async () => {
      const settled = await Promise.allSettled([
        fetchJsonSafe(`${baseUrl}/status`),
        fetchJsonSafe(`${baseUrl}/blocks?limit=20`),
        fetchJsonSafe(`${baseUrl}/pools`),
        fetchJsonSafe(`${HEROMINERS_API_BASE}/stats`),
        fetchKryptexResource('/prl/api/v1/pool/info', 'json')
      ]);
      const statusRes = _settledValue(settled[0]) || { ok: false, data: null };
      const blocksRes = _settledValue(settled[1]) || { ok: false, data: null };
      const poolsRes = _settledValue(settled[2]) || { ok: false, data: null };
      const heroRes = _settledValue(settled[3]) || { ok: false, data: null };
      const kryptexData = _settledValue(settled[4]);
      const result = _assembleNetworkAndPoolTelemetry(statusRes, blocksRes, poolsRes, heroRes, kryptexData);
      _telemetryCache.set(baseUrl, { ts: Date.now(), data: result });
      return result;
    })().finally(() => {
      _telemetryInFlight.delete(baseUrl);
    });
    _telemetryInFlight.set(baseUrl, job);
    return job;
  }

  function _assembleNetworkAndPoolTelemetry(statusRes, blocksRes, poolsRes, heroRes, kryptexData) {

    const statusData = statusRes.ok ? statusRes.data : null;
    const blockItems = blocksRes.ok && blocksRes.data && Array.isArray(blocksRes.data.items)
      ? blocksRes.data.items.filter(Boolean)
      : [];
    const poolItems = poolsRes.ok && poolsRes.data && Array.isArray(poolsRes.data.items)
      ? poolsRes.data.items.filter(Boolean)
      : [];
    const heroData = heroRes.ok && heroRes.data && !heroRes.data.error ? heroRes.data : null;
    const kryptexInfo = kryptexData && typeof kryptexData === 'object' ? kryptexData : null;

    // 1. Network-level telemetry
    const latestBlock = blockItems[0] || null;
    const height =
      toPositiveOrZeroNumber(statusData && statusData.tip_height) ??
      toPositiveOrZeroNumber(latestBlock && latestBlock.height) ??
      toPositiveOrZeroNumber(heroData && heroData.network && heroData.network.height) ??
      toPositiveOrZeroNumber(kryptexInfo && kryptexInfo.height) ??
      null;

    const tipHash =
      (statusData && statusData.tip_hash) ||
      (latestBlock && latestBlock.hash) ||
      null;

    const healthy = statusData && typeof statusData.healthy === 'boolean' ? statusData.healthy : null;
    const mempoolSize = toPositiveOrZeroNumber(statusData && statusData.mempool_size);
    const indexerLag = toPositiveOrZeroNumber(statusData && statusData.indexer_lag);

    let difficulty = toPositiveOrZeroNumber(latestBlock && latestBlock.difficulty);
    if (difficulty === null && heroData && heroData.network && heroData.network.difficulty) {
      const rawHeroDiff = toPositiveOrZeroNumber(heroData.network.difficulty);
      if (rawHeroDiff !== null && rawHeroDiff > 0) {
        difficulty = rawHeroDiff / HERO_DIFFICULTY_SCALE;
      }
    }
    const difficultyM = difficulty !== null ? Number((difficulty / 1e6).toFixed(2)) : null;

    const blockRewardPrl =
      grainsToPrl(latestBlock && latestBlock.reward_grains) ??
      toPositiveOrZeroNumber(kryptexInfo && kryptexInfo.block_reward) ??
      grainsToPrl(heroData && heroData.pool && heroData.pool.averageReward) ??
      null;

    const avgBlockTimeSec =
      computeAvgBlockTimeSec(blockItems) ??
      toPositiveOrZeroNumber(kryptexInfo && kryptexInfo.block_time) ??
      (heroData && heroData.network && toPositiveOrZeroNumber(heroData.network.difficultyTarget) !== null
        ? Math.round(Number(heroData.network.difficultyTarget))
        : null);

    const networkHashrateHps =
      toPositiveOrZeroNumber(heroData && heroData.network && heroData.network.networkHashps) ??
      toPositiveOrZeroNumber(kryptexInfo && kryptexInfo.net_hashrate) ??
      null;

    const recentBlocks = blockItems.map((b) => ({
      height: toPositiveOrZeroNumber(b.height),
      hash: b.hash || null,
      time: normalizeTimestampIso(b.time),
      difficulty: toPositiveOrZeroNumber(b.difficulty),
      rewardPrl: grainsToPrl(b.reward_grains),
      txCount: toPositiveOrZeroNumber(b.tx_count),
      minerAddress: b.miner_address || null,
      minerLabel: b.miner_label || null
    }));

    // 2. prlscan reported pools aggregation
    let reportedHashSum = 0;
    let hasReportedHash = false;
    let reportedMinersSum = 0;
    let hasReportedMiners = false;
    let reportedWorkersSum = 0;
    let hasReportedWorkers = false;

    const pools = poolItems.map((p) => {
      const hps = toPositiveOrZeroNumber(p.reported_hashrate_hps);
      const miners = toPositiveOrZeroNumber(p.reported_miners);
      const workers = toPositiveOrZeroNumber(p.reported_workers);
      if (hps !== null) {
        reportedHashSum += hps;
        hasReportedHash = true;
      }
      if (miners !== null) {
        reportedMinersSum += miners;
        hasReportedMiners = true;
      }
      if (workers !== null) {
        reportedWorkersSum += workers;
        hasReportedWorkers = true;
      }
      return {
        slug: p.slug || '',
        name: p.name || p.slug || '',
        websiteUrl: p.website_url || null,
        address: p.address || null,
        feePercent: toPositiveOrZeroNumber(p.fee_percent),
        upstreamOk: typeof p.upstream_ok === 'boolean' ? p.upstream_ok : null,
        hashrateHps: hps,
        hashrateFormatted: formatHashrate(hps),
        miners,
        workers,
        blocks24h: toPositiveOrZeroNumber(p.blocks_24h),
        poolShare24hPct: toPositiveOrZeroNumber(p.pool_share_24h),
        lastBlockAt: normalizeTimestampIso(p.last_block_at)
      };
    });

    // 3. HeroMiners pool summary
    let herominers = null;
    if (heroData) {
      const hPool = heroData.pool || {};
      const hCfg = heroData.config || {};
      const coinUnits = toPositiveOrZeroNumber(hCfg.coinUnits) || GRAINS_PER_PRL;
      const minPayRaw = toPositiveOrZeroNumber(hCfg.minPaymentThreshold);
      const heroThreshold = minPayRaw !== null ? Number((minPayRaw / coinUnits).toFixed(8)) : null;
      const heroFee = toPositiveOrZeroNumber(hCfg.fee);
      const heroHash =
        toPositiveOrZeroNumber(hPool.realHashrate) ??
        normalizeHeroHashrateHps(hPool.hashrate);

      if (heroThreshold !== null) poolConfigCache.heroMinPaymentPrl = heroThreshold;
      if (heroFee !== null) poolConfigCache.heroFeePercent = heroFee;

      herominers = {
        available: true,
        hashrateHps: heroHash,
        hashrateFormatted: formatHashrate(heroHash),
        miners: toPositiveOrZeroNumber(hPool.miners),
        workers: toPositiveOrZeroNumber(hPool.workers),
        feePercent: heroFee,
        payoutThresholdPrl: heroThreshold,
        totalBlocks: toPositiveOrZeroNumber(hPool.totalBlocks),
        totalPayments: toPositiveOrZeroNumber(hPool.totalPayments),
        lastBlockFoundTs: normalizeTimestampIso(hPool.lastBlockFound),
        averageRewardPrl: grainsToPrl(hPool.averageReward)
      };
    }

    // 4. Kryptex pool summary
    let kryptex = null;
    if (kryptexInfo) {
      const kHash = toPositiveOrZeroNumber(kryptexInfo.hashrate);
      const kFeeRaw = toPositiveOrZeroNumber(kryptexInfo.fee);
      const kFeePct = kFeeRaw !== null ? Number((kFeeRaw <= 1 ? kFeeRaw * 100 : kFeeRaw).toFixed(2)) : null;
      const kThreshold =
        toPositiveOrZeroNumber(kryptexInfo.defpay) ??
        toPositiveOrZeroNumber(kryptexInfo.minpay) ??
        null;

      if (kThreshold !== null) poolConfigCache.kryptexThresholdPrl = kThreshold;
      if (kFeePct !== null) poolConfigCache.kryptexFeePercent = kFeePct;

      kryptex = {
        available: true,
        hashrateHps: kHash,
        hashrateFormatted: formatHashrate(kHash),
        networkHashrateHps: toPositiveOrZeroNumber(kryptexInfo.net_hashrate),
        miners: toPositiveOrZeroNumber(kryptexInfo.miners),
        workers: toPositiveOrZeroNumber(kryptexInfo.workers),
        feePercent: kFeePct,
        feeType: kryptexInfo.fee_type || null,
        payoutThresholdPrl: kThreshold,
        estimatedProfitDayPerHps: toPositiveOrZeroNumber(kryptexInfo.estimated_profit_day),
        validShares: toPositiveOrZeroNumber(kryptexInfo.valid),
        staleShares: toPositiveOrZeroNumber(kryptexInfo.stale),
        invalidShares: toPositiveOrZeroNumber(kryptexInfo.invalid),
        servers: Array.isArray(kryptexInfo.servers) ? kryptexInfo.servers : []
      };
    }

    return {
      fetchedAt: new Date().toISOString(),
      rpcGatewayUrl: baseUrl,
      network: {
        healthy,
        height,
        tipHash,
        mempoolSize,
        indexerLag,
        difficulty,
        difficultyM,
        blockRewardPrl,
        avgBlockTimeSec,
        networkHashrateHps,
        networkHashrateFormatted: formatHashrate(networkHashrateHps),
        networkHashrateHistory: heroData ? parseHeroNetworkHistory(heroData.charts) : [],
        recentBlocks
      },
      poolsSummary: {
        totalReportedHashrateHps: hasReportedHash ? reportedHashSum : null,
        totalReportedHashrateFormatted: formatHashrate(hasReportedHash ? reportedHashSum : null),
        totalReportedMiners: hasReportedMiners ? reportedMinersSum : null,
        totalReportedWorkers: hasReportedWorkers ? reportedWorkersSum : null
      },
      pools,
      herominers,
      kryptex,
      sources: {
        prlscanStatus: Boolean(statusData),
        prlscanBlocks: blockItems.length > 0,
        prlscanPools: poolItems.length > 0,
        herominers: Boolean(heroData),
        kryptex: Boolean(kryptexInfo)
      }
    };
  }

  // ======================== Miner & Per-Rig Deep Telemetry ========================

  function mapKryptexWorker(w) {
    const h30m = toPositiveOrZeroNumber(w.avg_hashrate_30m ?? w.hashrate);
    const h3h = toPositiveOrZeroNumber(w.avg_hashrate_3h);
    const h24h = toPositiveOrZeroNumber(w.avg_hashrate_24h);
    const validShares = toPositiveOrZeroNumber(w.valid);
    const staleShares = toPositiveOrZeroNumber(w.stale) || 0;
    const invalidShares = toPositiveOrZeroNumber(w.invalid) || 0;
    const hasRejectInfo = w.stale !== undefined || w.invalid !== undefined;
    const status = String(w.status || '').toLowerCase() === 'online' ? 'online' : 'offline';

    return {
      name: String(w.worker || w.name || 'worker'),
      status,
      hashrate30m: h30m,
      hashrate30mFormatted: formatHashrate(h30m),
      hashrate3h: h3h,
      hashrate3hFormatted: formatHashrate(h3h),
      hashrate24h: h24h,
      hashrate24hFormatted: formatHashrate(h24h),
      lastShareTime: normalizeTimestampIso(w.last_share ?? w.last_active),
      validShares,
      rejectedShares: hasRejectInfo ? staleShares + invalidShares : null,
      softwareAgent: w.agent ? String(w.agent) : null
    };
  }

  function mapKryptexPayout(p) {
    const txid = p.txid ? String(p.txid) : '';
    const amountPrl = toPositiveOrZeroNumber(p.amount ?? p.received);
    return {
      txid,
      amountPrl,
      timestamp: normalizeTimestampIso(p.date ?? p.timestamp),
      status: normalizePayoutStatus(p.status),
      explorerUrl: buildExplorerTxUrl(txid)
    };
  }

  async function fetchKryptexMinerRaw(cleanAddr) {
    // Query REST endpoints concurrently (note: /prl/api/v1/miner/stats returns 404 on Kryptex, avoid noise/latency)
    const settled = await Promise.allSettled([
      fetchKryptexResource(`/prl/api/v1/miner/balance/${encodeURIComponent(cleanAddr)}`, 'json'),
      fetchKryptexResource(`/prl/api/v3/miner/workers/${encodeURIComponent(cleanAddr)}`, 'json'),
      fetchKryptexResource(`/prl/api/v1/miner/payouts/${encodeURIComponent(cleanAddr)}`, 'json')
    ]);
    const balData = _settledValue(settled[0]);
    const workersData = _settledValue(settled[1]);
    const payoutsData = _settledValue(settled[2]);
    const statsData = null;

    let ssrData = null;
    if (!balData && !workersData && !payoutsData && !statsData) {
      const html = await fetchKryptexResource(`/prl/miner/stats/${encodeURIComponent(cleanAddr)}`, 'html');
      ssrData = extractKryptexDataFromHtml(html);
    }

    if (!balData && !workersData && !payoutsData && !statsData && !ssrData) {
      return null;
    }

    const effectiveBalance =
      balData ||
      (statsData && (statsData.balance || statsData)) ||
      (ssrData && ssrData.balance) ||
      null;

    const rawWorkers =
      (Array.isArray(workersData && workersData.results) && workersData.results) ||
      (Array.isArray(workersData) && workersData) ||
      (Array.isArray(statsData && statsData.workers) && statsData.workers) ||
      (ssrData && Array.isArray(ssrData.workers) && ssrData.workers) ||
      [];

    let rawPayouts =
      (Array.isArray(payoutsData && payoutsData.results) && payoutsData.results) ||
      (Array.isArray(payoutsData) && payoutsData) ||
      (Array.isArray(statsData && statsData.payouts) && statsData.payouts) ||
      (ssrData && Array.isArray(ssrData.payouts) && ssrData.payouts) ||
      [];

    // Fetch up to 4 additional payout pages if paginated so totalPaidPrl reflects complete recent history
    if (payoutsData && payoutsData.next && rawPayouts.length > 0 && Number(payoutsData.count) > rawPayouts.length) {
      const totalPages = Math.min(5, Math.ceil(Number(payoutsData.count) / rawPayouts.length));
      const extraPromises = [];
      for (let page = 2; page <= totalPages; page++) {
        extraPromises.push(
          fetchKryptexResource(`/prl/api/v1/miner/payouts/${encodeURIComponent(cleanAddr)}?page=${page}`, 'json')
        );
      }
      const extraSettled = await Promise.allSettled(extraPromises);
      for (let i = 0; i < extraSettled.length; i++) {
        const pg = _settledValue(extraSettled[i]);
        if (pg && Array.isArray(pg.results)) {
          rawPayouts = rawPayouts.concat(pg.results);
        }
      }
    }

    const workers = rawWorkers.map(mapKryptexWorker);
    const payoutHistory = rawPayouts.map(mapKryptexPayout);

    const unpaidBalancePrl = toPositiveOrZeroNumber(effectiveBalance && effectiveBalance.total);
    let payoutThresholdPrl = toPositiveOrZeroNumber(effectiveBalance && effectiveBalance.threshold);
    if ((payoutThresholdPrl === null || payoutThresholdPrl === 0) && poolConfigCache.kryptexThresholdPrl !== null) {
      payoutThresholdPrl = poolConfigCache.kryptexThresholdPrl;
    } else if (payoutThresholdPrl === 0) {
      payoutThresholdPrl = null;
    }

    let totalPaidPrl = toPositiveOrZeroNumber(statsData && (statsData.total_paid ?? statsData.paid));
    if (totalPaidPrl === null && (payoutsData || (ssrData && ssrData.payouts.length > 0))) {
      let paidSum = 0;
      for (let i = 0; i < payoutHistory.length; i++) {
        if (payoutHistory[i].amountPrl !== null) paidSum += payoutHistory[i].amountPrl;
      }
      totalPaidPrl = Number(paidSum.toFixed(8));
    }

    let hashrateCurrent = toPositiveOrZeroNumber(statsData && (statsData.hashrate_30m ?? statsData.hashrate));
    let hashrateAvg3h = toPositiveOrZeroNumber(statsData && statsData.hashrate_3h);
    let hashrateAvg24h = toPositiveOrZeroNumber(statsData && statsData.hashrate_24h);

    if (workers.length > 0) {
      let sum30m = 0;
      let has30m = false;
      let sum3h = 0;
      let has3h = false;
      let sum24h = 0;
      let has24h = false;
      for (let i = 0; i < workers.length; i++) {
        if (workers[i].hashrate30m !== null) { sum30m += workers[i].hashrate30m; has30m = true; }
        if (workers[i].hashrate3h !== null) { sum3h += workers[i].hashrate3h; has3h = true; }
        if (workers[i].hashrate24h !== null) { sum24h += workers[i].hashrate24h; has24h = true; }
      }
      if (hashrateCurrent === null && has30m) hashrateCurrent = sum30m;
      if (hashrateAvg3h === null && has3h) hashrateAvg3h = sum3h;
      if (hashrateAvg24h === null && has24h) hashrateAvg24h = sum24h;
    }

    let sharesValid = toPositiveOrZeroNumber(statsData && statsData.shares_valid);
    let sharesInvalid = toPositiveOrZeroNumber(statsData && statsData.shares_invalid);
    if ((sharesValid === null || sharesInvalid === null) && workers.length > 0) {
      let vSum = 0;
      let hasV = false;
      let iSum = 0;
      let hasI = false;
      for (let i = 0; i < workers.length; i++) {
        if (workers[i].validShares !== null) { vSum += workers[i].validShares; hasV = true; }
        if (workers[i].rejectedShares !== null) { iSum += workers[i].rejectedShares; hasI = true; }
      }
      if (sharesValid === null && hasV) sharesValid = vSum;
      if (sharesInvalid === null && hasI) sharesInvalid = iSum;
    }

    const lastActiveNum = toPositiveOrZeroNumber(effectiveBalance && effectiveBalance.last_active) || 0;
    const hasActivity =
      workers.length > 0 ||
      (unpaidBalancePrl !== null && unpaidBalancePrl > 0) ||
      payoutHistory.length > 0 ||
      lastActiveNum > 0;

    return {
      poolSource: 'kryptex',
      hasActivity,
      hashrateCurrent,
      hashrateAvg3h,
      hashrateAvg24h,
      unpaidBalancePrl,
      totalPaidPrl,
      payoutThresholdPrl,
      sharesValid,
      sharesInvalid,
      workers,
      payoutHistory
    };
  }

  function parseHeroPayments(rawPayments) {
    if (!Array.isArray(rawPayments) || rawPayments.length === 0) return [];
    const list = [];
    for (let i = 0; i < rawPayments.length; i++) {
      const item = rawPayments[i];
      if (typeof item === 'string' && item.includes(':')) {
        const parts = item.split(':');
        const txid = parts[0] || '';
        const amountPrl = grainsToPrl(parts[1]);
        const tsRaw = rawPayments[i + 1];
        const timestamp = normalizeTimestampIso(tsRaw);
        list.push({
          txid,
          amountPrl,
          timestamp,
          status: 'confirmed',
          explorerUrl: buildExplorerTxUrl(txid)
        });
        i += 1; // skip paired timestamp element
      } else if (item && typeof item === 'object') {
        const txid = item.txid || item.hash || '';
        const amountPrl = item.amountPrl !== undefined
          ? toPositiveOrZeroNumber(item.amountPrl)
          : (item.amount !== undefined ? grainsToPrl(item.amount) : null);
        list.push({
          txid: String(txid),
          amountPrl,
          timestamp: normalizeTimestampIso(item.timestamp ?? item.time),
          status: normalizePayoutStatus(item.status || 'confirmed'),
          explorerUrl: buildExplorerTxUrl(txid)
        });
      }
    }
    return list;
  }

  function mapHeroWorker(w, nowSec) {
    const h30m = (w.realHashrate !== undefined && w.realHashrate !== null)
      ? toPositiveOrZeroNumber(w.realHashrate)
      : normalizeHeroHashrateHps(w.hashrate);
    const h3h = normalizeHeroHashrateHps(w.hashrate_3h ?? w.hashrate_6h ?? w.hashrate_1h);
    const h24h = normalizeHeroHashrateHps(w.hashrate_24h);
    const lastShareSec = toPositiveOrZeroNumber(w.lastShare);
    const isRecent = lastShareSec !== null && (nowSec - (lastShareSec >= 1e12 ? lastShareSec / 1000 : lastShareSec)) <= HERO_ONLINE_GRACE_SEC;
    const isOnline = (h30m !== null && h30m > 0) || isRecent;

    const validShares = toPositiveOrZeroNumber(w.shares_good);
    const invalidCount = toPositiveOrZeroNumber(w.shares_invalid) || 0;
    const staleCount = toPositiveOrZeroNumber(w.shares_stale) || 0;
    const hasRejectInfo = w.shares_invalid !== undefined || w.shares_stale !== undefined;

    return {
      name: String(w.name || w.worker || 'worker'),
      status: isOnline ? 'online' : 'offline',
      hashrate30m: h30m,
      hashrate30mFormatted: formatHashrate(h30m),
      hashrate3h: h3h,
      hashrate3hFormatted: formatHashrate(h3h),
      hashrate24h: h24h,
      hashrate24hFormatted: formatHashrate(h24h),
      lastShareTime: normalizeTimestampIso(w.lastShare),
      validShares,
      rejectedShares: hasRejectInfo ? invalidCount + staleCount : null,
      softwareAgent: w.agent ? String(w.agent) : null
    };
  }

  async function fetchHeroMinersMinerRaw(cleanAddr) {
    const res = await fetchJsonSafe(
      `${HEROMINERS_API_BASE}/stats_address?address=${encodeURIComponent(cleanAddr)}&recentBlocks=false`
    );
    if (!res.ok || !res.data || res.data.error) {
      return null;
    }

    const data = res.data;
    const stats = data.stats || {};
    const nowSec = Math.floor(Date.now() / 1000);
    const workers = Array.isArray(data.workers)
      ? data.workers.filter(Boolean).map((w) => mapHeroWorker(w, nowSec))
      : [];
    const payoutHistory = parseHeroPayments(data.payments);

    const hashrateCurrent = (stats.realHashrate !== undefined && stats.realHashrate !== null)
      ? toPositiveOrZeroNumber(stats.realHashrate)
      : normalizeHeroHashrateHps(stats.hashrate);
    const hashrateAvg3h = normalizeHeroHashrateHps(stats.hashrate_3h ?? stats.hashrate_6h ?? stats.hashrate_1h);
    const hashrateAvg24h = normalizeHeroHashrateHps(stats.hashrate_24h);

    const unpaidBalancePrl = grainsToPrl(stats.balance);
    const totalPaidPrl = grainsToPrl(stats.paid);

    let payoutThresholdPrl = toPositiveOrZeroNumber(stats.minPaymentThreshold);
    if (payoutThresholdPrl === 0) {
      payoutThresholdPrl = null;
    } else if (payoutThresholdPrl !== null && payoutThresholdPrl >= 1e5) {
      payoutThresholdPrl = grainsToPrl(payoutThresholdPrl);
    }
    if (payoutThresholdPrl === null) {
      if (poolConfigCache.heroMinPaymentPrl === null) {
        const poolStatsRes = await fetchJsonSafe(`${HEROMINERS_API_BASE}/stats`);
        if (poolStatsRes.ok && poolStatsRes.data && poolStatsRes.data.config) {
          const cfg = poolStatsRes.data.config;
          const units = toPositiveOrZeroNumber(cfg.coinUnits) || GRAINS_PER_PRL;
          const minRaw = toPositiveOrZeroNumber(cfg.minPaymentThreshold);
          if (minRaw !== null) {
            poolConfigCache.heroMinPaymentPrl = Number((minRaw / units).toFixed(8));
          }
        }
      }
      payoutThresholdPrl = poolConfigCache.heroMinPaymentPrl;
    }

    const sharesValid = toPositiveOrZeroNumber(stats.shares_good);
    const invalidCount = toPositiveOrZeroNumber(stats.shares_invalid);
    const staleCount = toPositiveOrZeroNumber(stats.shares_stale);
    const sharesInvalid = (invalidCount !== null || staleCount !== null)
      ? (invalidCount || 0) + (staleCount || 0)
      : null;

    const hasActivity =
      workers.length > 0 ||
      (unpaidBalancePrl !== null && unpaidBalancePrl > 0) ||
      (totalPaidPrl !== null && totalPaidPrl > 0) ||
      (hashrateCurrent !== null && hashrateCurrent > 0) ||
      (sharesValid !== null && sharesValid > 0) ||
      payoutHistory.length > 0;

    return {
      poolSource: 'herominers',
      hasActivity,
      hashrateCurrent,
      hashrateAvg3h,
      hashrateAvg24h,
      unpaidBalancePrl,
      totalPaidPrl,
      payoutThresholdPrl,
      sharesValid,
      sharesInvalid,
      workers,
      payoutHistory
    };
  }

  async function fetchOnChainMinerRaw(cleanAddr, rpcGatewayUrl = DEFAULT_RPC_GATEWAY) {
    const baseUrl = String(rpcGatewayUrl || DEFAULT_RPC_GATEWAY).replace(/\/+$/, '');
    const settled = await Promise.allSettled([
      fetchJsonSafe(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}`),
      fetchJsonSafe(`${baseUrl}/addresses/${encodeURIComponent(cleanAddr)}/txs?limit=30`)
    ]);
    const addrRes = _settledValue(settled[0]) || { ok: false, status: 0, data: null };
    const txsRes = _settledValue(settled[1]) || { ok: false, status: 0, data: null };

    let onChainBalancePrl = null;
    let totalReceivedPrl = null;
    if (addrRes.ok && addrRes.data) {
      onChainBalancePrl = grainsToPrl(addrRes.data.balance_grains);
      totalReceivedPrl = grainsToPrl(addrRes.data.received_grains);
    } else if (addrRes.status === 404) {
      onChainBalancePrl = 0;
      totalReceivedPrl = 0;
    }

    const rawTxs = txsRes.ok && txsRes.data
      ? (Array.isArray(txsRes.data) ? txsRes.data : (Array.isArray(txsRes.data.items) ? txsRes.data.items : []))
      : [];

    const incomingTxs = rawTxs
      .filter((tx) => tx && typeof tx === 'object' && Number(tx.delta_grains) > 0)
      .map((tx) => {
        const txid = tx.txid ? String(tx.txid) : '';
        return {
          txid,
          amountPrl: grainsToPrl(tx.delta_grains),
          timestamp: normalizeTimestampIso(tx.time),
          status: normalizePayoutStatus(tx.status || 'confirmed'),
          explorerUrl: buildExplorerTxUrl(txid)
        };
      });

    return {
      onChainBalancePrl,
      totalReceivedPrl,
      incomingTxs
    };
  }

  function scorePoolCandidate(candidate) {
    if (!candidate || !candidate.hasActivity) return -1;
    let score = 0;
    const onlineCount = candidate.workers.filter((w) => w.status === 'online').length;
    if (onlineCount > 0) score += 10000 + onlineCount * 100;
    if (candidate.hashrateCurrent && candidate.hashrateCurrent > 0) score += 1000;
    if (candidate.unpaidBalancePrl && candidate.unpaidBalancePrl > 0) score += 100;
    if (candidate.payoutHistory.length > 0) score += 10;
    return score;
  }

  function buildUnifiedMinerTelemetry(cleanAddr, poolData, onChainData) {
    const workers = poolData && Array.isArray(poolData.workers) ? poolData.workers : [];
    const workersOnlineCount = workers.filter((w) => w.status === 'online').length;
    const workersOfflineCount = workers.filter((w) => w.status !== 'online').length;

    const hashrateCurrent = poolData ? poolData.hashrateCurrent : null;
    const hashrateAvg3h = poolData ? poolData.hashrateAvg3h : null;
    const hashrateAvg24h = poolData ? poolData.hashrateAvg24h : null;

    const unpaidBalancePrl = poolData ? poolData.unpaidBalancePrl : null;
    const payoutThresholdPrl = poolData ? poolData.payoutThresholdPrl : null;
    const payoutProgressPct = computePayoutProgressPct(unpaidBalancePrl, payoutThresholdPrl);

    const sharesValid = poolData ? poolData.sharesValid : null;
    const sharesInvalid = poolData ? poolData.sharesInvalid : null;
    const shareAcceptRatePct = computeShareAcceptRate(sharesValid, sharesInvalid);

    const poolSource = poolData ? poolData.poolSource : 'onchain';
    const totalPaidPrl = poolData
      ? poolData.totalPaidPrl
      : (onChainData ? onChainData.totalReceivedPrl : null);

    let payoutHistory = [];
    if (poolData && Array.isArray(poolData.payoutHistory) && poolData.payoutHistory.length > 0) {
      payoutHistory = poolData.payoutHistory;
    } else if (!poolData && onChainData && Array.isArray(onChainData.incomingTxs)) {
      payoutHistory = onChainData.incomingTxs;
    }

    return {
      address: cleanAddr,
      poolSource,
      onChainBalancePrl: onChainData ? onChainData.onChainBalancePrl : null,
      hashrateCurrent,
      hashrateCurrentFormatted: formatHashrate(hashrateCurrent),
      hashrateAvg3h,
      hashrateAvg3hFormatted: formatHashrate(hashrateAvg3h),
      hashrateAvg24h,
      hashrateAvg24hFormatted: formatHashrate(hashrateAvg24h),
      unpaidBalancePrl,
      totalPaidPrl,
      payoutThresholdPrl,
      payoutProgressPct,
      sharesValid,
      sharesInvalid,
      shareAcceptRatePct,
      workersOnlineCount,
      workersOfflineCount,
      workers,
      payoutHistory
    };
  }

  /**
   * Query deep miner & rig telemetry across Kryptex, HeroMiners, and Pearl on-chain explorer.
   * @param {string} minerAddress - Pearl Taproot address (prl1p...)
   * @param {'auto'|'kryptex'|'herominers'|'onchain'} [poolKey='auto']
   */
  async function queryMinerDeepStats(minerAddress, poolKey = 'auto', options = {}) {
    const rawClean = cleanMinerAddress(minerAddress);
    const check = validatePearlAddress(rawClean);
    if (!check.valid) {
      const err = new Error(`Invalid Pearl miner address: ${check.error}`);
      err.code = 'INVALID_PEARL_ADDRESS';
      throw err;
    }
    const cleanAddr = rawClean.toLowerCase();
    const normalizedPool = String(poolKey || 'auto').trim().toLowerCase();
    const rpcGatewayUrl = options.rpcGatewayUrl || DEFAULT_RPC_GATEWAY;
    const cacheKey = `${cleanAddr}|${normalizedPool}|${rpcGatewayUrl}`;

    if (options && options.useCache === true) {
      const cached = _minerStatsCache.get(cacheKey);
      if (cached && (Date.now() - cached.ts < 60_000)) {
        return cached.data;
      }
    }
    if (_minerStatsInFlight.has(cacheKey)) {
      return _minerStatsInFlight.get(cacheKey);
    }

    const job = (async () => {
      const onChainPromise = fetchOnChainMinerRaw(cleanAddr, rpcGatewayUrl);
      let result;

      if (normalizedPool === 'onchain') {
        const onChainData = await onChainPromise;
        result = buildUnifiedMinerTelemetry(cleanAddr, null, onChainData);
      } else if (normalizedPool === 'kryptex') {
        const settled = await Promise.allSettled([fetchKryptexMinerRaw(cleanAddr), onChainPromise]);
        result = buildUnifiedMinerTelemetry(cleanAddr, _settledValue(settled[0]), _settledValue(settled[1]));
      } else if (normalizedPool === 'herominers') {
        const settled = await Promise.allSettled([fetchHeroMinersMinerRaw(cleanAddr), onChainPromise]);
        result = buildUnifiedMinerTelemetry(cleanAddr, _settledValue(settled[0]), _settledValue(settled[1]));
      } else {
        // 'auto' mode: concurrently probe Kryptex, HeroMiners, and on-chain prlscan
        const settled = await Promise.allSettled([
          fetchKryptexMinerRaw(cleanAddr),
          fetchHeroMinersMinerRaw(cleanAddr),
          onChainPromise
        ]);
        const kryptexData = _settledValue(settled[0]);
        const heroData = _settledValue(settled[1]);
        const onChainData = _settledValue(settled[2]);

        const kScore = scorePoolCandidate(kryptexData);
        const hScore = scorePoolCandidate(heroData);
        let chosen = null;
        if (kScore >= 0 || hScore >= 0) {
          chosen = kScore >= hScore ? kryptexData : heroData;
        }
        result = buildUnifiedMinerTelemetry(cleanAddr, chosen, onChainData);
      }

      _minerStatsCache.set(cacheKey, { ts: Date.now(), data: result });
      return result;
    })().finally(() => {
      _minerStatsInFlight.delete(cacheKey);
    });
    _minerStatsInFlight.set(cacheKey, job);
    return job;
  }

  // ======================== Saved Miner Watchlist Management ========================

  function readWatchlistStorage() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
        const raw = localStorage.getItem(SAVED_MINERS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (_) {}
    return memoryWatchlist.slice();
  }

  function writeWatchlistStorage(items) {
    const cleanList = Array.isArray(items) ? items : [];
    memoryWatchlist = cleanList.slice();
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
        localStorage.setItem(SAVED_MINERS_STORAGE_KEY, JSON.stringify(cleanList));
      }
    } catch (_) {}
  }

  /**
   * Retrieve saved miner watchlist entries from localStorage ('near_ca_saved_miners_v1').
   */
  function getSavedMinerAddresses() {
    const items = readWatchlistStorage();
    return items
      .filter((item) => item && typeof item.address === 'string' && validatePearlAddress(item.address).valid)
      .map((item) => ({
        address: cleanMinerAddress(item.address).toLowerCase(),
        label: typeof item.label === 'string' ? item.label : '',
        poolHint: typeof item.poolHint === 'string' ? item.poolHint : 'auto',
        addedAt: item.addedAt || null,
        updatedAt: item.updatedAt || item.addedAt || null
      }));
  }

  /**
   * Add or update a validated Pearl miner address in the saved watchlist.
   */
  function addSavedMinerAddress(address, label = '', poolHint = 'auto') {
    const rawClean = cleanMinerAddress(address);
    const check = validatePearlAddress(rawClean);
    if (!check.valid) {
      const err = new Error(`Invalid Pearl miner address: ${check.error}`);
      err.code = 'INVALID_PEARL_ADDRESS';
      throw err;
    }
    const normalizedAddr = rawClean.toLowerCase();
    const cleanLabel = typeof label === 'string' ? label.trim() : '';
    const nowIso = new Date().toISOString();

    const list = getSavedMinerAddresses();
    const idx = list.findIndex((item) => item.address === normalizedAddr);
    if (idx >= 0) {
      list[idx] = {
        address: normalizedAddr,
        label: cleanLabel || list[idx].label,
        poolHint: poolHint || list[idx].poolHint || 'auto',
        addedAt: list[idx].addedAt || nowIso,
        updatedAt: nowIso
      };
    } else {
      list.unshift({
        address: normalizedAddr,
        label: cleanLabel,
        poolHint: poolHint || 'auto',
        addedAt: nowIso,
        updatedAt: nowIso
      });
    }

    writeWatchlistStorage(list);
    return list;
  }

  /**
   * Remove a Pearl miner address from the saved watchlist.
   */
  function removeSavedMinerAddress(address) {
    const normalizedAddr = cleanMinerAddress(address).toLowerCase();
    const list = getSavedMinerAddresses().filter((item) => item.address !== normalizedAddr);
    writeWatchlistStorage(list);
    return list;
  }

  // ======================== One-Click Bridge Miner Yield to NEAR ========================

  function resolveDestinationTarget(destinationAsset) {
    const raw = String(destinationAsset || '').trim();
    const upper = raw.toUpperCase();
    if (!raw || upper === 'PRL' || raw === PRL_ORIGIN_ASSET_ID) {
      return { assetId: PRL_ORIGIN_ASSET_ID, recipientType: 'INTENTS', symbol: 'PRL' };
    }
    if (upper === 'PRL_NEAR' || raw === PRL_ON_NEAR_ASSET_ID) {
      return { assetId: PRL_ON_NEAR_ASSET_ID, recipientType: 'DESTINATION_CHAIN', symbol: 'PRL' };
    }
    if (upper === 'NEAR' || upper === 'WNEAR' || raw === 'wrap.near' || raw === NEAR_WRAP_ASSET_ID) {
      return { assetId: NEAR_WRAP_ASSET_ID, recipientType: 'DESTINATION_CHAIN', symbol: 'wNEAR' };
    }
    if (upper === 'USDT' || raw === 'usdt.tether-token.near' || raw === NEAR_USDT_ASSET_ID) {
      return { assetId: NEAR_USDT_ASSET_ID, recipientType: 'DESTINATION_CHAIN', symbol: 'USDT' };
    }
    if (upper === 'USDC' || raw === NEAR_USDC_ASSET_ID) {
      return { assetId: NEAR_USDC_ASSET_ID, recipientType: 'DESTINATION_CHAIN', symbol: 'USDC' };
    }
    return { assetId: raw, recipientType: 'DESTINATION_CHAIN', symbol: raw };
  }

  function isValidNearAccountId(accountId) {
    if (typeof accountId !== 'string') return false;
    const trimmed = accountId.trim().toLowerCase();
    if (trimmed.length < 2 || trimmed.length > 64) return false;
    return /^([a-z0-9_-]+\.)*[a-z0-9_-]+$/.test(trimmed);
  }

  /**
   * Pre-validate the wallet's live prl1p... mainnet balance and prepare a 1Click / NEAR Intents
   * bridge quote from Pearl Mainnet (prl1p...) to the user's .near master account.
   */
  async function prepareSweepMinerToNearIntent(params = {}) {
    const {
      wallet,
      amountPrl,
      destinationAsset,
      recipientNearAccount,
      dry = false,
      slippageTolerance = 100,
      feeBufferPrl = DEFAULT_PRL_FEE_BUFFER,
      rpcGatewayUrl = DEFAULT_RPC_GATEWAY
    } = params;

    if (!wallet || typeof wallet !== 'object') {
      const err = new Error('Wallet object is required / 请提供有效钱包对象');
      err.code = 'INVALID_WALLET';
      throw err;
    }

    const rawPrlAddr = cleanMinerAddress(wallet.address || wallet.prlAddress || '');
    const addrCheck = validatePearlAddress(rawPrlAddr);
    if (!addrCheck.valid) {
      const err = new Error(`Invalid Pearl wallet address: ${addrCheck.error}`);
      err.code = 'INVALID_PEARL_ADDRESS';
      throw err;
    }
    const sourcePrlAddress = rawPrlAddr.toLowerCase();

    const nearTarget = String(
      recipientNearAccount || wallet.nearNamedAccount || wallet.nearAddress || ''
    ).trim().toLowerCase();
    if (!isValidNearAccountId(nearTarget)) {
      const err = new Error('Missing or invalid NEAR master account (.near or 64-hex implicit) / 缺少有效的 NEAR 主账户');
      err.code = 'INVALID_NEAR_ACCOUNT';
      throw err;
    }

    const amountNum = Number(amountPrl);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      const err = new Error('Sweep amount must be a positive number / 跨链归集数量必须大于 0');
      err.code = 'INVALID_AMOUNT';
      throw err;
    }
    const amountGrainsStr = toBaseUnits(amountPrl, 8);
    if (amountGrainsStr === '0') {
      const err = new Error('Sweep amount is below minimum 1 grain precision / 数量低于最小精度');
      err.code = 'INVALID_AMOUNT';
      throw err;
    }

    // Step 1: Pre-validate live prl1p... mainnet balance BEFORE requesting 1Click quote
    const baseUrl = String(rpcGatewayUrl || DEFAULT_RPC_GATEWAY).replace(/\/+$/, '');
    const addrRes = await fetchJsonSafe(`${baseUrl}/addresses/${encodeURIComponent(sourcePrlAddress)}`);
    let balanceGrains = null;
    if (addrRes.ok && addrRes.data) {
      const rawBg = String(addrRes.data.balance_grains ?? '0').trim();
      if (/^\d+$/.test(rawBg)) {
        balanceGrains = BigInt(rawBg);
      } else {
        const parsedBg = toBaseUnits(Number(rawBg) / GRAINS_PER_PRL, 8);
        balanceGrains = /^\d+$/.test(parsedBg) ? BigInt(parsedBg) : 0n;
      }
    } else if (addrRes.status === 404) {
      balanceGrains = 0n;
    }

    if (balanceGrains === null) {
      const err = new Error('Unable to verify Pearl mainnet balance before sweep / 无法获取 Pearl 主网可用余额');
      err.code = 'BALANCE_CHECK_FAILED';
      throw err;
    }

    const onChainBalancePrl = Number(balanceGrains) / GRAINS_PER_PRL;
    const buffer = Number.isFinite(Number(feeBufferPrl)) && Number(feeBufferPrl) >= 0
      ? Number(feeBufferPrl)
      : DEFAULT_PRL_FEE_BUFFER;
    const amountGrainsBig = BigInt(amountGrainsStr);
    const bufferGrainsStr = toBaseUnits(buffer, 8);
    const bufferGrainsBig = /^\d+$/.test(bufferGrainsStr) ? BigInt(bufferGrainsStr) : 0n;
    const requiredGrainsBig = amountGrainsBig + bufferGrainsBig;
    const requiredPrl = Number(requiredGrainsBig) / GRAINS_PER_PRL;

    if (balanceGrains < requiredGrainsBig) {
      const err = new Error(
        `PRL 余额不足 (当前可用: ${onChainBalancePrl.toFixed(6)} PRL, 含手续费需: ${requiredPrl.toFixed(6)} PRL) / Insufficient PRL balance (available: ${onChainBalancePrl.toFixed(6)} PRL)`
      );
      err.code = 'INSUFFICIENT_PRL_BALANCE';
      err.availablePrl = onChainBalancePrl;
      err.requiredPrl = requiredPrl;
      throw err;
    }

    // Step 2: Request real 1Click quote
    const dest = resolveDestinationTarget(destinationAsset);
    const deadline = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const requestPayload = {
      dry: Boolean(dry),
      swapType: 'EXACT_INPUT',
      slippageTolerance: Number(slippageTolerance) || 100,
      originAsset: PRL_ORIGIN_ASSET_ID,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: dest.assetId,
      amount: amountGrainsStr,
      refundTo: sourcePrlAddress,
      refundType: 'ORIGIN_CHAIN',
      recipient: nearTarget,
      recipientType: dest.recipientType,
      deadline
    };

    const res = await fetchWithTimeout(
      ONECLICK_QUOTE_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(requestPayload)
      },
      DEFAULT_TIMEOUT_MS
    );

    const parsed = await res.json().catch(() => null);
    if (!res.ok || !parsed || !parsed.quote) {
      const reason = (parsed && (parsed.message || parsed.error)) || `HTTP ${res.status}`;
      const err = new Error(`1Click quote failed: ${reason}`);
      err.code = 'ONECLICK_QUOTE_FAILED';
      err.status = res.status;
      throw err;
    }

    const quote = parsed.quote;
    const depositAddress = parsed.depositAddress || quote.depositAddress || null;
    const depositMemo = parsed.memo || quote.depositMemo || null;

    if (!dry && !depositAddress) {
      const err = new Error('1Click quote did not return a valid depositAddress / 未返回有效跨链充值地址');
      err.code = 'MISSING_DEPOSIT_ADDRESS';
      throw err;
    }

    return {
      originChain: 'prl',
      destinationChain: 'near',
      originAsset: PRL_ORIGIN_ASSET_ID,
      destinationAsset: dest.assetId,
      destinationSymbol: dest.symbol,
      recipientType: dest.recipientType,
      sourcePrlAddress,
      recipientNearAccount: nearTarget,
      onChainBalancePrl,
      feeBufferPrl: buffer,
      amountPrl: amountNum,
      amountGrains: amountGrainsStr,
      dry: Boolean(dry),
      depositAddress,
      depositMemo,
      amountOut: quote.amountOut || null,
      amountOutFormatted: quote.amountOutFormatted || null,
      amountInUsd: quote.amountInUsd || null,
      amountOutUsd: quote.amountOutUsd || null,
      minAmountOut: quote.minAmountOut || null,
      timeEstimateSec: toPositiveOrZeroNumber(quote.timeEstimate),
      deadline: quote.deadline || deadline,
      correlationId: parsed.correlationId || null,
      signature: parsed.signature || null,
      quote,
      rawResponse: parsed
    };
  }

  return {
    SAVED_MINERS_STORAGE_KEY,
    PRL_ORIGIN_ASSET_ID,
    PRL_ON_NEAR_ASSET_ID,
    PRLSCAN_TX_EXPLORER_BASE,
    buildExplorerTxUrl,
    fetchNetworkAndPoolTelemetry,
    queryMinerDeepStats,
    formatHashrate,
    getSavedMinerAddresses,
    addSavedMinerAddress,
    removeSavedMinerAddress,
    prepareSweepMinerToNearIntent,
    validatePearlAddress,
    cleanMinerAddress,
    extractKryptexDataFromHtml
  };
});
