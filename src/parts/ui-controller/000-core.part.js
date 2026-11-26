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
      await loadScriptOnce('ethers.umd.min.js?v=6.79');
      return (typeof window !== 'undefined' && window.ethers) || (typeof globalThis !== 'undefined' && globalThis.ethers) || null;
    }
    return safeRequire('../ethers.umd.min.js');
  }

  async function ensureQrcodeLoaded() {
    const existing = (typeof window !== 'undefined' && window.QRCode) || (typeof globalThis !== 'undefined' && globalThis.QRCode);
    if (existing) return existing;
    if (typeof document !== 'undefined') {
      await loadScriptOnce('qrcode.min.js?v=6.79').catch(() => false);
      return (typeof window !== 'undefined' && window.QRCode) || (typeof globalThis !== 'undefined' && globalThis.QRCode) || null;
    }
    return null;
  }

  async function ensureMiningProLoaded() {
    const existing = getMining();
    if (existing) return existing;
    if (typeof document !== 'undefined') {
      await loadScriptOnce('src/mining-pro.js?v=6.79').catch(() => false);
      return getMining();
    }
    return null;
  }

  function setHtmlIfChanged(el, nextHtml) {
    if (!el) return false;
    const str = String(nextHtml ?? '');
    if (el._lastRenderedHtml === str && el.innerHTML === str) return false;
    el._lastRenderedHtml = str;
    el.innerHTML = str;
    return true;
  }

  /**
   * Synchronously clears both DOM input/checkbox values and backing state keys
   * so switching coins, chains, or reopening sheets never leaks stale values.
   */
  function resetFormFields(domIds = [], stateTarget = null, stateDefaults = null) {
    if (stateTarget && stateDefaults && typeof stateDefaults === 'object') {
      for (const [k, v] of Object.entries(stateDefaults)) {
        stateTarget[k] = v;
      }
    }
    for (const id of domIds) {
      const el = $(id);
      if (!el) continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = false;
      } else if ('value' in el) {
        el.value = '';
      }
    }
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

  function getDAppBrowser() {
    return (typeof globalThis !== 'undefined' && globalThis.NearCADAppBrowser) ||
      (typeof window !== 'undefined' && window.NearCADAppBrowser) ||
      safeRequire('./dapp-browser.js');
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

  function toUserFriendlyError(err, fallbackZh = '操作失败，请稍后重试', fallbackEn = 'Operation failed. Please try again.') {
    const contracts = getContracts();
    if (contracts && typeof contracts.toUserFriendlyError === 'function') {
      return contracts.toUserFriendlyError(err, fallbackZh, fallbackEn);
    }
    return t(fallbackZh, fallbackEn);
  }

  const _stForErr = getState();
  if (_stForErr && typeof _stForErr === 'object' && !_stForErr.toUserFriendlyError) {
    _stForErr.toUserFriendlyError = toUserFriendlyError;
  }
  if (typeof Promise !== 'undefined') {
    Promise.resolve().then(() => {
      const uiObj = (typeof globalThis !== 'undefined' && globalThis.NearCAUI) || (typeof window !== 'undefined' && window.NearCAUI);
      if (uiObj && typeof uiObj === 'object' && !uiObj.toUserFriendlyError) {
        uiObj.toUserFriendlyError = toUserFriendlyError;
      }
    }).catch(() => {});
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
  let _toastRaf = 0;
  function showToast(msg, tone = 'neutral') {
    const text = String(msg || '');
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    let host = $('toast-host');
    if (_toastTimer) {
      clearTimeout(_toastTimer);
      _toastTimer = null;
    }
    if (_toastRaf && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(_toastRaf);
      _toastRaf = 0;
    }
    if (fw && typeof fw.mountToastBanner === 'function' && typeof document !== 'undefined') {
      if (!host && document.body) {
        host = document.createElement('div');
        host.id = 'toast-host';
        document.body.appendChild(host);
      }
      if (host) {
        const dismiss = () => {
          if (_toastTimer) {
            clearTimeout(_toastTimer);
            _toastTimer = null;
          }
          if (_toastRaf && typeof cancelAnimationFrame === 'function') {
            cancelAnimationFrame(_toastRaf);
            _toastRaf = 0;
          }
          fw.mountToastBanner(host, { id: 'toast', message: text, visible: false, tone });
        };
        fw.mountToastBanner(host, { id: 'toast', message: text, visible: false, tone, onDismiss: dismiss });
        if (typeof requestAnimationFrame === 'function') {
          void host.offsetWidth;
          _toastRaf = requestAnimationFrame(() => {
            _toastRaf = 0;
            fw.mountToastBanner(host, { id: 'toast', message: text, visible: true, tone, onDismiss: dismiss });
          });
        } else {
          fw.mountToastBanner(host, { id: 'toast', message: text, visible: true, tone, onDismiss: dismiss });
        }
        _toastTimer = setTimeout(dismiss, 3200);
        return;
      }
    }
    const toastEl = $('toast');
    if (toastEl) {
      toastEl.textContent = text;
      toastEl.setAttribute('data-tone', tone);
      toastEl.classList.add('show');
      _toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
    }
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

  function unmountPreactContainer(el) {
    if (!el) return;
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.render === 'function') {
      try { fw.render(null, el); } catch (_) {}
    }
    el.innerHTML = '';
  }

  function renderQrInto(containerId, text, size = 160) {
    const container = $(containerId);
    if (!container) return;
    unmountPreactContainer(container);
    const str = String(text || '').trim();
    if (!str) return;
    const draw = (QRLib) => {
      if (!QRLib || !$(containerId)) return false;
      unmountPreactContainer($(containerId));
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

  let _confirmDialogResolve = null;
  let _confirmDialogFinish = null;
  let _confirmDialogOpts = null;

  function renderConfirmDialogSheet() {
    const sheet = $('sheet-confirm-dialog');
    if (!sheet || typeof document === 'undefined' || !_confirmDialogOpts) return;
    const opts = _confirmDialogOpts;
    const titleEl = $('confirm-dialog-title');
    const okBtn = $('btn-confirm-dialog-ok');
    const cancelBtn = $('btn-confirm-dialog-cancel');
    if (titleEl) titleEl.textContent = opts.title || t('确认操作', 'Confirm Action');
    if (okBtn) okBtn.textContent = opts.confirmText || t('确认', 'Confirm');
    if (cancelBtn) cancelBtn.textContent = opts.cancelText || t('取消', 'Cancel');
  }

  function dismissConfirmDialog(result = false) {
    if (typeof _confirmDialogFinish === 'function') {
      const fn = _confirmDialogFinish;
      _confirmDialogFinish = null;
      fn(Boolean(result));
      return true;
    }
    if (typeof _confirmDialogResolve === 'function') {
      const res = _confirmDialogResolve;
      _confirmDialogResolve = null;
      const backdrop = $('confirm-dialog-backdrop');
      const sheet = $('sheet-confirm-dialog');
      if (backdrop) {
        backdrop.classList.remove('open');
        backdrop.onclick = null;
      }
      if (sheet) {
        sheet.classList.remove('open');
        sheet.setAttribute('aria-hidden', 'true');
      }
      if (typeof syncSheetScrollLock === 'function') syncSheetScrollLock();
      try { res(Boolean(result)); } catch (_) {}
      return true;
    }
    return false;
  }

  function showConfirmDialogAsync(message, opts = {}) {
    const sheet = $('sheet-confirm-dialog');
    if (!sheet || typeof document === 'undefined') {
      const isNodeTest = typeof process !== 'undefined' && Boolean(process.versions && process.versions.node);
      const nodeConfirmFn = isNodeTest
        ? ((typeof window !== 'undefined' && typeof window.confirm === 'function')
            ? window.confirm
            : (typeof confirm === 'function' ? confirm : null))
        : null;
      if (nodeConfirmFn) {
        return Promise.resolve(Boolean(nodeConfirmFn(String(message || ''))));
      }
      showToast(t('确认弹窗未就绪，请重试', 'Confirmation dialog unavailable, please retry'));
      return Promise.resolve(false);
    }
    dismissConfirmDialog(false);
    _confirmDialogOpts = opts;
    const titleEl = $('confirm-dialog-title');
    const msgEl = $('confirm-dialog-message');
    const okBtn = $('btn-confirm-dialog-ok');
    const cancelBtn = $('btn-confirm-dialog-cancel');
    const closeBtn = $('btn-confirm-dialog-close');
    if (titleEl) titleEl.textContent = opts.title || t('确认操作', 'Confirm Action');
    if (msgEl) msgEl.textContent = String(message || '');
    if (okBtn) {
      okBtn.textContent = opts.confirmText || t('确认', 'Confirm');
      okBtn.style.background = opts.danger ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '';
    }
    if (cancelBtn) cancelBtn.textContent = opts.cancelText || t('取消', 'Cancel');
    const confirmBackdrop = $('confirm-dialog-backdrop');
    if (confirmBackdrop) confirmBackdrop.classList.add('open');
    if (sheet.style) {
      sheet.style.transition = '';
      sheet.style.transform = '';
    }
    if (typeof bindSheetHandleDrag === 'function') bindSheetHandleDrag(sheet);
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    if (typeof syncSheetScrollLock === 'function') syncSheetScrollLock();

    return new Promise((resolve) => {
      _confirmDialogResolve = resolve;
      const finish = (result) => {
        if (_confirmDialogResolve !== resolve) return;
        _confirmDialogResolve = null;
        _confirmDialogOpts = null;
        if (_confirmDialogFinish === finish) _confirmDialogFinish = null;
        sheet.classList.remove('open');
        sheet.setAttribute('aria-hidden', 'true');
        if (okBtn) okBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        if (closeBtn) closeBtn.onclick = null;
        if (confirmBackdrop) {
          confirmBackdrop.classList.remove('open');
          confirmBackdrop.onclick = null;
        }
        if (typeof syncSheetScrollLock === 'function') syncSheetScrollLock();
        resolve(Boolean(result));
      };
      _confirmDialogFinish = finish;
      if (okBtn) okBtn.onclick = () => finish(true);
      if (cancelBtn) cancelBtn.onclick = () => finish(false);
      if (closeBtn) closeBtn.onclick = () => finish(false);
      if (confirmBackdrop) confirmBackdrop.onclick = () => finish(false);
    });
  }

