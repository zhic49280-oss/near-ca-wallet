/**
 * NEAR Chain Abstraction Wallet - Unified UI Controller
 * Wires crypto-engine, token-registry, near-intents, chain-contracts, mining-pro, and state
 * to index.html with zero fake data, strict balance pre-validation, and full zh/en i18n.
 * Attaches to globalThis.NearCAUI, window.NearCAUI, globalThis.NearCA.ui, and module.exports.
 *
 * GENERATED FILE: assembled by scripts/build-parts.js from src/parts/ui-controller/*.part.js.
 * Edit the parts, then run `npm run build`. Do not edit src/ui-controller.js directly.
 */
(function (root) {
  'use strict';

  function safeRequire(relPath) {
    if (typeof require !== 'function') return null;
    try { return require(relPath); } catch (_) { return null; }
  }

  const _lazyScriptCache = {};
  function loadScriptOnce(src) {
    if (typeof document === 'undefined') return Promise.resolve(false);
    if (_lazyScriptCache[src]) return _lazyScriptCache[src];
    _lazyScriptCache[src] = new Promise((resolve, reject) => {
      const baseSrc = String(src || '').split('?')[0];
      const existing = document.querySelector(`script[src^="${baseSrc}"]`);
      if (existing) {
        if (existing.dataset && existing.dataset.loaded === '1') {
          resolve(true);
          return;
        }
        // Check globals in case static script already evaluated
        if (
          (baseSrc.includes('ethers') && window.ethers) ||
          (baseSrc.includes('qrcode') && window.QRCode) ||
          (baseSrc.includes('mining-pro') && window.NearCAMining) ||
          (baseSrc.includes('walletconnect') && window.PearlWalletConnect)
        ) {
          resolve(true);
          return;
        }
      }
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        s.dataset.loaded = '1';
        resolve(true);
      };
      s.onerror = () => {
        delete _lazyScriptCache[src];
        reject(new Error(`Failed to load ${src}`));
      };
      (document.head || document.body || document.documentElement).appendChild(s);
    });
    return _lazyScriptCache[src];
  }

  async function ensureEthersLoaded() {
    const existing = (typeof window !== 'undefined' && window.ethers) || (typeof globalThis !== 'undefined' && globalThis.ethers);
    if (existing) return existing;
    if (typeof document !== 'undefined') {
      await loadScriptOnce('ethers.umd.min.js?v=6.22');
      return (typeof window !== 'undefined' && window.ethers) || (typeof globalThis !== 'undefined' && globalThis.ethers) || null;
    }
    return safeRequire('../ethers.umd.min.js');
  }

  async function ensureQrcodeLoaded() {
    const existing = (typeof window !== 'undefined' && window.QRCode) || (typeof globalThis !== 'undefined' && globalThis.QRCode);
    if (existing) return existing;
    if (typeof document !== 'undefined') {
      await loadScriptOnce('qrcode.min.js?v=6.22').catch(() => false);
      return (typeof window !== 'undefined' && window.QRCode) || (typeof globalThis !== 'undefined' && globalThis.QRCode) || null;
    }
    return null;
  }

  async function ensureMiningProLoaded() {
    const existing = getMining();
    if (existing) return existing;
    if (typeof document !== 'undefined') {
      await loadScriptOnce('src/mining-pro.js?v=6.22').catch(() => false);
      return getMining();
    }
    return null;
  }

  function isValidHttpsUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') return false;
    try {
      const u = new URL(urlStr.trim());
      return u.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  function getCrypto() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCACrypto) ||
      (typeof window !== 'undefined' && window.NearCACrypto) ||
      safeRequire('./crypto-engine.js');
  }

  function getTokens() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCATokens) ||
      (typeof window !== 'undefined' && window.NearCATokens) ||
      safeRequire('./token-registry.js');
  }

  function getIntents() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCAIntents) ||
      (typeof window !== 'undefined' && window.NearCAIntents) ||
      safeRequire('./near-intents.js');
  }

  function getContracts() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCAContracts) ||
      (typeof window !== 'undefined' && window.NearCAContracts) ||
      safeRequire('./chain-contracts.js');
  }

  function getLimitOrders() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCALimitOrders) ||
      (typeof window !== 'undefined' && window.NearCALimitOrders) ||
      safeRequire('./limit-orders.js');
  }

  function getHyperliquid() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCAHyperliquid) ||
      (typeof window !== 'undefined' && window.NearCAHyperliquid) ||
      safeRequire('./hyperliquid-perps.js');
  }

  function getMining() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCAMining) ||
      (typeof window !== 'undefined' && window.NearCAMining) ||
      safeRequire('./mining-pro.js');
  }

  function getState() {
    return (typeof globalThis !== 'undefined' && (globalThis.NearCAState || globalThis.state)) ||
      (typeof window !== 'undefined' && (window.NearCAState || window.state)) ||
      safeRequire('./state.js');
  }

  function t(zh, en) {
    const st = getState();
    return st && typeof st.t === 'function' ? st.t(zh, en) : zh;
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shortenAddr(addr, head = 6, tail = 4) {
    const s = String(addr || '').trim();
    if (!s) return '--';
    if (s.length <= head + tail + 3) return s;
    return `${s.slice(0, head)}...${s.slice(-tail)}`;
  }

  function formatBal(val, maxDec = 6) {
    if (val === null || val === undefined || !Number.isFinite(Number(val))) return '--';
    const num = Number(val);
    if (num === 0) return '0';
    if (Math.abs(num) < 0.000001) return num.toExponential(2);
    return Number(num.toFixed(maxDec)).toString();
  }

  function formatUsd(val) {
    if (val === null || val === undefined || !Number.isFinite(Number(val))) return '--';
    return `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatTokenPrice(val) {
    if (val === null || val === undefined || !Number.isFinite(Number(val)) || Number(val) <= 0) {
      return '--';
    }
    const num = Number(val);
    if (num >= 1) return formatUsd(num);
    if (num >= 0.01) return `$${num.toFixed(4)}`;
    if (num >= 0.0001) return `$${num.toFixed(6)}`;
    return `$${num.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}`;
  }

  function $(id) {
    return typeof document !== 'undefined' ? document.getElementById(id) : null;
  }

  let _toastTimer = null;
  function showToast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = String(msg || '');
    el.classList.add('show');
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  async function copyText(text, label = '') {
    const str = String(text || '').trim();
    if (!str) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = str;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast(label ? `${t('已复制', 'Copied')}: ${label}` : t('已复制到剪贴板', 'Copied to clipboard'));
    } catch (_) {
      showToast(t('复制失败，请手动复制', 'Copy failed'));
    }
  }

  function renderQrInto(containerId, text, size = 160) {
    const container = $(containerId);
    if (!container) return;
    container.innerHTML = '';
    const str = String(text || '').trim();
    if (!str) return;
    const draw = (QRLib) => {
      if (!QRLib || !$(containerId)) return false;
      $(containerId).innerHTML = '';
      try {
        new QRLib($(containerId), {
          text: str,
          width: size,
          height: size,
          colorDark: '#06080f',
          colorLight: '#ffffff',
          correctLevel: QRLib.CorrectLevel ? QRLib.CorrectLevel.M : undefined
        });
        return true;
      } catch (_) {
        return false;
      }
    };
    const QRLib = (typeof window !== 'undefined' && window.QRCode) || (typeof globalThis !== 'undefined' && globalThis.QRCode);
    if (QRLib && draw(QRLib)) return;
    container.textContent = str;
    if (typeof document !== 'undefined') {
      ensureQrcodeLoaded().then((loaded) => {
        if (loaded && $(containerId) && $(containerId).textContent === str) {
          draw(loaded);
        }
      }).catch(() => {});
    }
  }

