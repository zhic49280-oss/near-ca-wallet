/**
 * NEAR Chain Abstraction Wallet - Unified UI Controller
 * Wires crypto-engine, token-registry, near-intents, chain-contracts, mining-pro, and state
 * to index.html with zero fake data, strict balance pre-validation, and full zh/en i18n.
 * Attaches to globalThis.NearCAUI, window.NearCAUI, globalThis.NearCA.ui, and module.exports.
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
      await loadScriptOnce('ethers.umd.min.js?v=6.16');
      return (typeof window !== 'undefined' && window.ethers) || (typeof globalThis !== 'undefined' && globalThis.ethers) || null;
    }
    return safeRequire('../ethers.umd.min.js');
  }

  async function ensureQrcodeLoaded() {
    const existing = (typeof window !== 'undefined' && window.QRCode) || (typeof globalThis !== 'undefined' && globalThis.QRCode);
    if (existing) return existing;
    if (typeof document !== 'undefined') {
      await loadScriptOnce('qrcode.min.js?v=6.16').catch(() => false);
      return (typeof window !== 'undefined' && window.QRCode) || (typeof globalThis !== 'undefined' && globalThis.QRCode) || null;
    }
    return null;
  }

  async function ensureMiningProLoaded() {
    const existing = getMining();
    if (existing) return existing;
    if (typeof document !== 'undefined') {
      await loadScriptOnce('src/mining-pro.js?v=6.16').catch(() => false);
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

  // ==================== Native Biometrics, WebAuthn & Security Modal ====================

  let _cachedBioProfile = null;
  let _secAuthState = {
    resolve: null,
    wallet: null,
    reason: '',
    pinBuffer: '',
    expectedLen: 6
  };

  function getNativeSecurityPlugin(explicitPlugin) {
    if (explicitPlugin) return explicitPlugin;
    const cap = (typeof window !== 'undefined' && window.Capacitor)
      || (typeof globalThis !== 'undefined' && globalThis.Capacitor)
      || null;
    const plugins = cap && cap.Plugins ? cap.Plugins : null;
    return (plugins && (plugins.NativeSecurity || plugins.LocalAuthentication)) || null;
  }

  function getNavigatorObj(overrides = {}) {
    if (overrides.navigator) return overrides.navigator;
    if (typeof window !== 'undefined' && window && window !== globalThis && window.navigator) {
      return window.navigator;
    }
    if (typeof navigator !== 'undefined' && navigator) return navigator;
    if (typeof globalThis !== 'undefined' && globalThis.navigator) return globalThis.navigator;
    if (typeof window !== 'undefined' && window && window.navigator) return window.navigator;
    return null;
  }

  function getPublicKeyCredCtor(overrides = {}) {
    if (overrides.PublicKeyCredential) return overrides.PublicKeyCredential;
    if (typeof window !== 'undefined' && window && window !== globalThis && window.PublicKeyCredential) {
      return window.PublicKeyCredential;
    }
    if (typeof PublicKeyCredential !== 'undefined') return PublicKeyCredential;
    if (typeof globalThis !== 'undefined' && globalThis.PublicKeyCredential) return globalThis.PublicKeyCredential;
    if (typeof window !== 'undefined' && window && window.PublicKeyCredential) return window.PublicKeyCredential;
    return null;
  }

  function getRandomBytesCompat(len) {
    const out = new Uint8Array(len);
    const cryptoApi = (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function')
      ? globalThis.crypto
      : ((typeof window !== 'undefined' && window.crypto && typeof window.crypto.getRandomValues === 'function') ? window.crypto : null);
    if (cryptoApi) {
      cryptoApi.getRandomValues(out);
      return out;
    }
    for (let i = 0; i < len; i += 1) {
      out[i] = Math.floor(Math.random() * 256);
    }
    return out;
  }

  function bytesToBase64Url(input) {
    if (!input) return '';
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) {
      bin += String.fromCharCode(bytes[i]);
    }
    const b64 = typeof btoa === 'function'
      ? btoa(bin)
      : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : '');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(b64u) {
    const padded = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const b64 = padded + '='.repeat(padLen);
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
      return out;
    }
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    return new Uint8Array(0);
  }

  function classifyAndroidDevice(ua, uaModel) {
    let rawModel = String(uaModel || '').trim();
    if (!rawModel && ua) {
      const m = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/|\))/i);
      if (m && m[1] && !/^(Linux|U|zh-|en-|[a-z]{2}-[A-Z]{2}|K)$/i.test(m[1].trim())) {
        rawModel = m[1].trim();
      }
    }
    const probe = `${rawModel} ${ua}`;
    let brand = 'Android';
    if (/HONOR|BVL-|PGT-|VER-|ELP-|ALI-AN/i.test(probe)) {
      brand = 'Honor';
    } else if (/HUAWEI|HarmonyOS|NOH-|ANA-|ELS-|OCE-|ABR-|ALN-|MATE\s?\d/i.test(probe)) {
      brand = 'Huawei';
    } else if (/Redmi/i.test(probe)) {
      brand = 'Redmi (Xiaomi)';
    } else if (/POCO/i.test(probe)) {
      brand = 'POCO (Xiaomi)';
    } else if (/Xiaomi|Mi\s|\b2[1-6]\d{2,4}[A-Z0-9]{4,}\b|\bM2[01]\d+/i.test(probe)) {
      brand = 'Xiaomi';
    } else if (/OnePlus/i.test(probe)) {
      brand = 'OnePlus';
    } else if (/Realme|RMX\d+/i.test(probe)) {
      brand = 'Realme';
    } else if (/OPPO|PHB\d+|PJD\d+/i.test(probe)) {
      brand = 'OPPO';
    } else if (/\bCPH\d+/i.test(probe)) {
      brand = 'OPPO / OnePlus';
    } else if (/iQOO/i.test(probe)) {
      brand = 'iQOO (vivo)';
    } else if (/vivo|\bV\d{4}[A-Z]?\b|\bPD\d{4}\b/i.test(probe)) {
      brand = 'vivo';
    } else if (/Samsung|SM-[A-Z0-9]+|Galaxy/i.test(probe)) {
      brand = 'Samsung';
    } else if (/Pixel/i.test(probe)) {
      brand = 'Google Pixel';
    }

    let deviceModel = brand;
    if (rawModel) {
      const cleanRaw = rawModel.replace(/\s+/g, ' ').trim();
      const brandPrefix = brand.split(' ')[0];
      deviceModel = new RegExp(brandPrefix, 'i').test(cleanRaw) ? cleanRaw : `${brand} ${cleanRaw}`;
    }
    return { brand, rawModel, deviceModel };
  }

  async function detectDeviceBiometricProfileAsync(overrides = {}) {
    const nav = getNavigatorObj(overrides);
    const ua = typeof overrides.userAgent === 'string'
      ? overrides.userAgent
      : (nav && nav.userAgent ? String(nav.userAgent) : '');
    const uaModel = typeof overrides.userAgentDataModel === 'string'
      ? overrides.userAgentDataModel
      : (nav && nav.userAgentData && nav.userAgentData.model ? String(nav.userAgentData.model) : '');

    const nativePlugin = getNativeSecurityPlugin(overrides.nativePlugin);
    let nativeInfo = null;
    if (nativePlugin && typeof nativePlugin.getSecurityCapabilities === 'function') {
      try {
        nativeInfo = await nativePlugin.getSecurityCapabilities();
      } catch (_) {}
    }

    let hasWebAuthnPlatform = false;
    if (typeof overrides.hasWebAuthnPlatform === 'boolean') {
      hasWebAuthnPlatform = overrides.hasWebAuthnPlatform;
    } else {
      const PubKeyCred = getPublicKeyCredCtor(overrides);
      if (PubKeyCred && typeof PubKeyCred.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        hasWebAuthnPlatform = await PubKeyCred.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
      }
    }

    let platform = (nativeInfo && nativeInfo.platform) ? String(nativeInfo.platform).toLowerCase() : 'web';
    let brand = (nativeInfo && (nativeInfo.brandFamily || nativeInfo.brand || nativeInfo.manufacturer))
      ? String(nativeInfo.brandFamily || nativeInfo.brand || nativeInfo.manufacturer)
      : '';
    let rawModel = (nativeInfo && nativeInfo.model) ? String(nativeInfo.model) : '';
    let deviceModel = (nativeInfo && nativeInfo.deviceModel) ? String(nativeInfo.deviceModel) : '';
    let biometryType = (nativeInfo && nativeInfo.biometryType) ? String(nativeInfo.biometryType) : 'none';
    let methods = Array.isArray(nativeInfo && nativeInfo.methods) ? nativeInfo.methods.slice() : [];

    if (platform === 'ios' || /iPhone|iPad|iPod|Apple Vision/i.test(ua)) {
      platform = 'ios';
      brand = 'Apple';
      const isIpad = /iPad/i.test(ua) || /iPad/i.test(deviceModel);
      const isVision = /Apple Vision/i.test(ua) || /Vision/i.test(deviceModel);
      if (!deviceModel || /^iPhone$/i.test(deviceModel)) {
        deviceModel = isVision ? 'Apple Vision Pro' : (isIpad ? 'Apple iPad' : 'Apple iPhone');
      }
      if (biometryType === 'none') {
        biometryType = isVision ? 'opticID' : 'faceID';
      }
      if (methods.length === 0) {
        const bioPrimary = biometryType === 'opticID'
          ? 'Optic ID'
          : (biometryType === 'touchID' ? 'Touch ID' : (biometryType === 'faceID' ? 'Face ID / Touch ID' : 'Face ID / Touch ID'));
        methods = [bioPrimary, t('系统锁屏密码', 'System Passcode')];
      }
    } else if (platform === 'android' || /Android/i.test(ua)) {
      platform = 'android';
      const modelHint = rawModel || uaModel;
      const uaHint = `${nativeInfo?.manufacturer || ''} ${nativeInfo?.brand || ''} ${ua}`.trim();
      const classified = classifyAndroidDevice(uaHint, modelHint);
      if (!brand || brand === 'Android') brand = classified.brand;
      rawModel = rawModel || classified.rawModel;
      if (!deviceModel) {
        deviceModel = (nativeInfo && nativeInfo.brandFamily && rawModel)
          ? (new RegExp(nativeInfo.brandFamily.split('/')[0], 'i').test(rawModel) ? rawModel : `${nativeInfo.brandFamily} ${rawModel}`)
          : classified.deviceModel;
      }
      if (biometryType === 'none') biometryType = 'biometric';
      if (methods.length === 0) {
        if (nativeInfo && (nativeInfo.hasFingerprint || nativeInfo.hasFace || nativeInfo.hasIris || nativeInfo.supportsPasscode)) {
          if (nativeInfo.hasFingerprint) methods.push(t('指纹解锁', 'Fingerprint'));
          if (nativeInfo.hasFace) methods.push(t('人脸识别', 'Face Unlock'));
          if (nativeInfo.hasIris) methods.push(t('虹膜识别', 'Iris'));
          if (nativeInfo.supportsPasscode || nativeInfo.hasDeviceCredential) {
            methods.push(t('系统锁屏凭据', 'System Screen Lock'));
          }
        }
        if (methods.length === 0) {
          methods = [
            t('指纹解锁', 'Fingerprint'),
            t('人脸识别', 'Face Unlock'),
            t('系统锁屏凭据', 'System Screen Lock')
          ];
        }
      }
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      platform = 'macos';
      brand = 'Apple';
      if (!deviceModel) deviceModel = 'Apple Mac';
      if (biometryType === 'none') biometryType = 'touchID';
      if (methods.length === 0) {
        methods = ['Touch ID', t('系统密码', 'Mac Password')];
      }
    } else if (/Windows NT/i.test(ua)) {
      platform = 'windows';
      brand = 'Windows';
      if (!deviceModel) deviceModel = 'Windows PC';
      if (biometryType === 'none') biometryType = 'windowsHello';
      if (methods.length === 0) {
        methods = ['Windows Hello', t('指纹 / 人脸 / PIN', 'Fingerprint / Face / PIN')];
      }
    } else {
      brand = 'Web';
      if (!deviceModel) deviceModel = t('当前设备', 'Current Device');
      if (methods.length === 0) {
        methods = hasWebAuthnPlatform
          ? [t('平台生物识别通行密钥', 'Platform Passkey'), t('安全 PIN', 'Wallet PIN')]
          : [t('安全 PIN', 'Wallet PIN')];
      }
    }

    const nativeAvailable = Boolean(nativePlugin && typeof nativePlugin.authenticateWithBiometrics === 'function');
    const biometricAvailable = Boolean(
      (nativeInfo && (nativeInfo.supportsBiometrics || nativeInfo.biometricAvailable))
      || hasWebAuthnPlatform
      || nativeAvailable
    );
    const devicePasscodeAvailable = Boolean(
      nativeInfo
        ? (nativeInfo.supportsPasscode || nativeInfo.devicePasscodeAvailable || nativeInfo.supportsBiometrics || nativeInfo.biometricAvailable)
        : (platform === 'ios' || platform === 'android' || platform === 'macos' || platform === 'windows')
    );

    const profile = {
      platform,
      brand,
      rawModel,
      deviceModel,
      biometryType,
      methods,
      methodsText: methods.join(' · '),
      nativeAvailable,
      biometricAvailable,
      devicePasscodeAvailable,
      hasWebAuthnPlatform,
      supported: Boolean(nativeAvailable || hasWebAuthnPlatform || biometricAvailable)
    };

    if (!overrides.userAgent && !overrides.userAgentDataModel && !overrides.nativePlugin && typeof overrides.hasWebAuthnPlatform !== 'boolean') {
      _cachedBioProfile = profile;
    }
    return profile;
  }

  async function registerOrVerifyWebAuthnPasskeyAsync(reason, wallet, overrides = {}) {
    const nav = getNavigatorObj(overrides);
    if (!nav || !nav.credentials || typeof nav.credentials.create !== 'function') {
      return { ok: false, error: t('当前浏览器不支持 WebAuthn 通行密钥', 'WebAuthn unsupported') };
    }
    if (typeof location !== 'undefined' && location.protocol === 'file:' && !overrides.navigator) {
      return { ok: false, error: t('本地文件协议不支持 WebAuthn', 'WebAuthn requires HTTPS or localhost') };
    }
    const PubKeyCred = getPublicKeyCredCtor(overrides);
    if (PubKeyCred && typeof PubKeyCred.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const avail = await PubKeyCred.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
      if (!avail) {
        return { ok: false, error: t('未检测到平台生物识别验证器', 'Platform authenticator unavailable') };
      }
    }

    const st = getState();
    const activeWallet = wallet || st.getActiveWallet();
    const challenge = getRandomBytesCompat(32);
    const rpId = (typeof location !== 'undefined' && location.hostname && !/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname))
      ? location.hostname
      : 'localhost';

    try {
      if (activeWallet && activeWallet.webauthnCredentialId && typeof nav.credentials.get === 'function') {
        const allowId = base64UrlToBytes(activeWallet.webauthnCredentialId);
        const assertion = await nav.credentials.get({
          publicKey: {
            challenge,
            rpId,
            allowCredentials: allowId.length ? [{ type: 'public-key', id: allowId, transports: ['internal'] }] : undefined,
            userVerification: 'required',
            timeout: 60000
          }
        });
        if (!assertion) {
          return { ok: false, cancelled: true, error: 'No assertion returned' };
        }
        return {
          ok: true,
          method: 'webauthn',
          credentialId: bytesToBase64Url(assertion.rawId) || activeWallet.webauthnCredentialId
        };
      }

      const userLabel = (activeWallet && (activeWallet.nearNamedAccount || activeWallet.name)) || 'Pearl Wallet';
      const userId = getRandomBytesCompat(16);
      const cred = await nav.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'NEAR CA Wallet', id: rpId },
          user: {
            id: userId,
            name: String(userLabel),
            displayName: String(userLabel)
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          timeout: 60000,
          attestation: 'none'
        }
      });
      if (!cred) {
        return { ok: false, cancelled: true, error: 'No credential created' };
      }
      const credId = bytesToBase64Url(cred.rawId || cred.id);
      if (activeWallet && credId) {
        activeWallet.webauthnCredentialId = credId;
        st.saveWallets();
      }
      return { ok: true, method: 'webauthn', registered: true, credentialId: credId };
    } catch (err) {
      const name = err && err.name ? String(err.name) : '';
      const msg = err && err.message ? String(err.message) : 'WebAuthn failed';
      const cancelled = name === 'NotAllowedError' || name === 'AbortError' || /cancel/i.test(msg);
      return { ok: false, cancelled, error: msg };
    }
  }

  const APP_LOCK_TIMEOUT_MS = 60_000;
  const _appLockState = {
    locked: false,
    authenticating: false,
    backgroundedAt: 0,
    lifecycleBound: false
  };

  function hasConfiguredWalletPin(wallet) {
    const st = getState();
    return Boolean(wallet && (typeof st.hasWalletPin === 'function' ? st.hasWalletPin(wallet) : Boolean(wallet.pin || wallet.pinHash)));
  }

  function shouldEnableAppLockForWallet(wallet, overrides = {}) {
    if (!wallet) return false;
    const nativePlugin = getNativeSecurityPlugin(overrides.nativePlugin);
    return Boolean(nativePlugin || wallet.webauthnCredentialId || hasConfiguredWalletPin(wallet));
  }

  function setRootClass(cls, enabled) {
    if (typeof document === 'undefined' || !document.documentElement || !document.documentElement.classList) return;
    document.documentElement.classList.toggle(cls, Boolean(enabled));
  }

  function clearAppLock() {
    _appLockState.locked = false;
    _appLockState.backgroundedAt = 0;
    setRootClass('nexus-locked', false);
    const overlay = $('app-lock-overlay');
    if (overlay) overlay.setAttribute('aria-hidden', 'true');
  }

  function setBackgroundPrivacyBlur(enabled) {
    const st = getState();
    if (enabled && (!st.getActiveWallet() || _appLockState.authenticating)) return;
    setRootClass('nexus-privacy-blur', Boolean(enabled));
    const shield = $('app-privacy-shield');
    if (shield) shield.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  }

  function engageAppLock(autoPrompt = false, overrides = {}) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!shouldEnableAppLockForWallet(wallet, overrides)) {
      clearAppLock();
      return false;
    }
    _appLockState.locked = true;
    setRootClass('nexus-locked', true);
    const overlay = $('app-lock-overlay');
    if (overlay) overlay.setAttribute('aria-hidden', 'false');
    const pinBtn = $('btn-app-lock-pin');
    if (pinBtn) pinBtn.classList.toggle('hidden', !hasConfiguredWalletPin(wallet));
    const statusEl = $('app-lock-status');
    if (statusEl) {
      statusEl.textContent = t('请通过生物识别或锁屏密码解锁', 'Unlock with Biometrics or Device Passcode');
    }
    if (autoPrompt && typeof unlockAppLockNow === 'function') {
      unlockAppLockNow(overrides).catch(() => {});
    }
    return true;
  }

  async function unlockAppLockNow(overrides = {}) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) {
      clearAppLock();
      return true;
    }
    if (_appLockState.authenticating) return false;
    const statusEl = $('app-lock-status');
    const unlockBtn = $('btn-app-lock-unlock');
    if (unlockBtn) unlockBtn.disabled = true;
    if (statusEl) statusEl.textContent = t('正在验证身份...', 'Verifying identity...');

    const nativePlugin = getNativeSecurityPlugin(overrides.nativePlugin);
    const profile = nativePlugin ? { supported: true } : (_cachedBioProfile || await detectDeviceBiometricProfileAsync(overrides));
    try {
      if (profile && profile.supported) {
        const res = await requestBiometricAuth(
          t('验证身份以解锁 Nexus Wallet', 'Verify identity to unlock Nexus Wallet'),
          wallet,
          overrides
        );
        if (res && res.ok) {
          clearAppLock();
          return true;
        }
        const bioUnavailable = Boolean(
          res && (res.unavailable || res.code === 'AUTH_UNAVAILABLE' || /AUTH_UNAVAILABLE|unavailable|not enrolled|passcode not set|not configured/i.test(String(res.error || '')))
        );
        if (bioUnavailable && hasConfiguredWalletPin(wallet)) {
          return unlockAppLockWithPin();
        }
        if (statusEl) {
          statusEl.textContent = (res && res.cancelled)
            ? t('已取消验证，请点击下方按钮重试', 'Verification cancelled. Tap below to retry.')
            : (res && res.error ? String(res.error) : t('验证未通过，请重试', 'Verification failed. Please retry.'));
        }
        return false;
      }
      if (hasConfiguredWalletPin(wallet)) {
        return unlockAppLockWithPin();
      }
      clearAppLock();
      return true;
    } finally {
      if (unlockBtn) unlockBtn.disabled = false;
    }
  }

  async function unlockAppLockWithPin() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) {
      clearAppLock();
      return true;
    }
    if (!hasConfiguredWalletPin(wallet)) return false;
    const ok = await openPinModalForWalletAsync(
      wallet,
      t('输入交易 PIN 解锁钱包', 'Enter PIN to unlock wallet'),
      false
    );
    if (ok) clearAppLock();
    return ok;
  }

  function handleAppVisibilityChange(isHidden, nowMs = Date.now(), overrides = {}) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) {
      setBackgroundPrivacyBlur(false);
      clearAppLock();
      return;
    }
    if (isHidden) {
      if (_appLockState.authenticating) return;
      if (!_appLockState.backgroundedAt) {
        _appLockState.backgroundedAt = Number(nowMs) || Date.now();
      }
      setBackgroundPrivacyBlur(true);
      return;
    }
    setBackgroundPrivacyBlur(false);
    if (_appLockState.authenticating) {
      _appLockState.backgroundedAt = 0;
      return;
    }
    const leftAt = _appLockState.backgroundedAt;
    _appLockState.backgroundedAt = 0;
    if (leftAt > 0 && (Number(nowMs) - leftAt) >= APP_LOCK_TIMEOUT_MS && shouldEnableAppLockForWallet(wallet, overrides)) {
      engageAppLock(true, overrides);
    }
  }

  function initAppSecurityLifecycle() {
    if (_appLockState.lifecycleBound || typeof document === 'undefined') return;
    _appLockState.lifecycleBound = true;

    document.addEventListener('visibilitychange', () => {
      handleAppVisibilityChange(Boolean(document.hidden), Date.now());
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('blur', () => {
        if (!_appLockState.authenticating && getState().getActiveWallet()) {
          if (!_appLockState.backgroundedAt) _appLockState.backgroundedAt = Date.now();
          setBackgroundPrivacyBlur(true);
        }
      });
      window.addEventListener('focus', () => {
        handleAppVisibilityChange(false, Date.now());
      });
      const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (capApp && typeof capApp.addListener === 'function') {
        try {
          capApp.addListener('appStateChange', (stateInfo) => {
            handleAppVisibilityChange(!Boolean(stateInfo && stateInfo.isActive), Date.now());
          });
        } catch (_) {}
      }
    }
  }

  async function requestBiometricAuth(reason, wallet, overrides = {}) {
    const promptReason = String(reason || t('请验证身份以继续', 'Authenticate to continue'));
    const nativePlugin = getNativeSecurityPlugin(overrides.nativePlugin);
    _appLockState.authenticating = true;
    try {
      if (nativePlugin && typeof nativePlugin.authenticateWithBiometrics === 'function') {
        try {
          const res = await nativePlugin.authenticateWithBiometrics({
            reason: promptReason,
            title: t('安全验证', 'Security Verification'),
            subtitle: promptReason,
            allowDeviceCredential: true
          });
          if (res && (res.verified === true || res.authenticated === true || res.success === true)) {
            return {
              ok: true,
              method: 'native',
              biometryType: res.type || res.biometryType || res.method || 'biometric'
            };
          }
          const errCode = (res && res.code) ? String(res.code) : '';
          const errMsg = (res && res.error) ? String(res.error) : t('生物识别未通过', 'Biometric authentication failed');
          return {
            ok: false,
            code: errCode,
            unavailable: errCode === 'AUTH_UNAVAILABLE' || /AUTH_UNAVAILABLE|unavailable|not enrolled|passcode not set|not configured/i.test(errMsg),
            cancelled: Boolean((res && res.cancelled) || errCode === 'AUTH_CANCELLED' || /AUTH_CANCELLED|取消|cancel|abort|dismiss/i.test(errMsg)),
            error: errMsg
          };
        } catch (err) {
          const errCode = (err && err.code) ? String(err.code) : '';
          const msg = err && err.message ? String(err.message) : 'Native biometric error';
          return {
            ok: false,
            code: errCode,
            unavailable: errCode === 'AUTH_UNAVAILABLE' || /AUTH_UNAVAILABLE|unavailable|not enrolled|passcode not set|not configured/i.test(msg),
            cancelled: errCode === 'AUTH_CANCELLED' || /AUTH_CANCELLED|取消|cancel|abort|dismiss/i.test(msg),
            error: msg
          };
        }
      }

      const webauthnRes = await registerOrVerifyWebAuthnPasskeyAsync(promptReason, wallet, overrides);
      if (webauthnRes.ok) {
        return {
          ok: true,
          method: 'webauthn',
          biometryType: 'passkey',
          credentialId: webauthnRes.credentialId
        };
      }
      return webauthnRes;
    } finally {
      _appLockState.authenticating = false;
      _appLockState.backgroundedAt = 0;
    }
  }

  function renderSecurityPinDots() {
    const dotsWrap = $('security-pin-dots');
    if (!dotsWrap) return;
    const dots = dotsWrap.querySelectorAll('.bio-pin-dot');
    const targetLen = _secAuthState.expectedLen || 6;
    const enteredLen = (_secAuthState.pinBuffer || '').length;
    dots.forEach((dot, idx) => {
      dot.style.display = idx < targetLen ? '' : 'none';
      dot.classList.toggle('filled', idx < enteredLen);
    });
  }

  function finishSecurityAuthModal(accepted) {
    const resolver = _secAuthState.resolve;
    _secAuthState = {
      resolve: null,
      wallet: null,
      reason: '',
      pinBuffer: '',
      expectedLen: 6
    };
    const backdrop = $('sheet-backdrop');
    const sheet = $('sheet-security-auth');
    if (sheet) {
      sheet.classList.remove('open');
      sheet.setAttribute('aria-hidden', 'true');
    }
    if (backdrop) {
      backdrop.classList.remove('auth-top');
      const stillOpen = typeof document !== 'undefined' && document.querySelector('.bottom-sheet.open');
      if (!stillOpen) backdrop.classList.remove('open');
    }
    if (typeof resolver === 'function') {
      resolver(Boolean(accepted));
    }
  }

  function cancelSecurityAuthModal() {
    finishSecurityAuthModal(false);
  }

  async function triggerSecurityBiometricNow() {
    const wallet = _secAuthState.wallet || getState().getActiveWallet();
    const reason = _secAuthState.reason || t('请验证身份以继续', 'Authenticate to continue');
    const btn = $('btn-security-biometric');
    if (btn) btn.disabled = true;
    try {
      const res = await requestBiometricAuth(reason, wallet);
      if (res.ok) {
        finishSecurityAuthModal(true);
        return true;
      }
      showToast(res.cancelled
        ? t('已取消生物识别验证', 'Biometric verification cancelled')
        : (res.error || t('生物识别验证未通过，请输入 PIN', 'Biometric failed; use PIN')));
      return false;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function pressSecurityPinDigit(digit) {
    const st = getState();
    const w = _secAuthState.wallet;
    if (!w || !(typeof st.hasWalletPin === 'function' ? st.hasWalletPin(w) : Boolean(w.pin)) || _secAuthState.verifying) return;
    const clean = String(digit || '').replace(/\D/g, '').slice(0, 1);
    if (!clean) return;
    if (_secAuthState.pinBuffer.length >= _secAuthState.expectedLen) return;
    _secAuthState.pinBuffer += clean;
    renderSecurityPinDots();
    if (_secAuthState.pinBuffer.length >= _secAuthState.expectedLen) {
      const candidate = _secAuthState.pinBuffer;
      _secAuthState.verifying = true;
      try {
        const ok = typeof st.verifyWalletPinAsync === 'function'
          ? await st.verifyWalletPinAsync(w, candidate)
          : candidate === String(w.pin);
        if (ok) {
          finishSecurityAuthModal(true);
        } else {
          showToast(t('交易密码错误', 'Incorrect PIN'));
          _secAuthState.pinBuffer = '';
          renderSecurityPinDots();
        }
      } finally {
        _secAuthState.verifying = false;
      }
    }
  }

  function clearSecurityPin() {
    if (_secAuthState.verifying) return;
    _secAuthState.pinBuffer = '';
    renderSecurityPinDots();
  }

  function backspaceSecurityPin() {
    if (_secAuthState.verifying) return;
    _secAuthState.pinBuffer = _secAuthState.pinBuffer.slice(0, -1);
    renderSecurityPinDots();
  }

  async function openPinModalForWalletAsync(w, reason = '', bioSupported = false) {
    const st = getState();
    if (!w) return false;
    const modalEl = $('sheet-security-auth');
    if (!modalEl || typeof document === 'undefined') {
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const entered = window.prompt(t('请输入安全 PIN', 'Enter PIN'));
        if (entered === null) return false;
        const ok = typeof st.verifyWalletPinAsync === 'function'
          ? await st.verifyWalletPinAsync(w, entered)
          : String(entered).trim() === String(w.pin);
        if (!ok) {
          showToast(t('PIN 错误', 'Incorrect PIN'));
          return false;
        }
        return true;
      }
      return false;
    }

    if (typeof _secAuthState.resolve === 'function') {
      _secAuthState.resolve(false);
    }

    const expectedLen = w.pinLen >= 4 ? Math.min(6, w.pinLen) : (w.pin && String(w.pin).length >= 4 ? Math.min(6, String(w.pin).length) : 6);
    _secAuthState = {
      resolve: null,
      wallet: w,
      reason: String(reason || ''),
      pinBuffer: '',
      expectedLen,
      verifying: false
    };

    const reasonEl = $('security-auth-reason');
    if (reasonEl) reasonEl.textContent = reason || t('请输入 PIN', 'Enter PIN');
    const pinSection = $('security-pin-section');
    if (pinSection) pinSection.classList.remove('hidden');
    renderSecurityPinDots();

    const bioBtn = $('btn-security-biometric');
    if (bioBtn) bioBtn.classList.toggle('hidden', !bioSupported);

    openSheet('sheet-security-auth');
    const backdrop = $('sheet-backdrop');
    if (backdrop && _appLockState.locked) backdrop.classList.add('auth-top');

    return new Promise((resolve) => {
      _secAuthState.resolve = resolve;
    });
  }

  async function verifySecurityAuthAsync(wallet, reason = '') {
    const st = getState();
    const w = wallet || st.getActiveWallet();
    if (!w) return false;
    const hasPin = typeof st.hasWalletPin === 'function' ? st.hasWalletPin(w) : Boolean(w.pin);
    const profile = _cachedBioProfile || await detectDeviceBiometricProfileAsync();
    const bioSupported = Boolean(profile && profile.supported);
    const nativeAuth = Boolean(getNativeSecurityPlugin());

    // 1. Always try system biometrics first (Face ID / Touch ID / fingerprint / face)
    if (bioSupported) {
      const bioRes = await requestBiometricAuth(reason, w);
      if (bioRes.ok) return true;
      const bioUnavailable = Boolean(
        bioRes.unavailable ||
        bioRes.code === 'AUTH_UNAVAILABLE' ||
        /AUTH_UNAVAILABLE|unavailable|not enrolled|passcode not set|not configured/i.test(String(bioRes.error || ''))
      );
      if (!bioUnavailable && (!hasPin || nativeAuth)) {
        if (bioRes.cancelled) {
          showToast(t('已取消验证', 'Verification cancelled'));
        } else if (!hasPin && !nativeAuth) {
          showToast(t('请先设置安全 PIN', 'Set a security PIN first'));
          if (typeof openSetWalletPinPrompt === 'function') openSetWalletPinPrompt();
        } else {
          showToast(bioRes.error || t('验证未通过', 'Verification failed'));
        }
        return false;
      }
      if (bioUnavailable && !hasPin) {
        showToast(t('请先设置安全 PIN', 'Set a security PIN first'));
        if (typeof openSetWalletPinPrompt === 'function') openSetWalletPinPrompt();
        return false;
      }
    } else if (!hasPin) {
      showToast(t('请先设置安全 PIN', 'Set a security PIN first'));
      if (typeof openSetWalletPinPrompt === 'function') openSetWalletPinPrompt();
      return false;
    }

    // 2. PIN fallback (PBKDF2 SHA-256 verified)
    return openPinModalForWalletAsync(w, reason, bioSupported);
  }
  function verifyPinIfNeeded(wallet, reason = '') {
    return verifySecurityAuthAsync(wallet, reason);
  }

  // ==================== Navigation & Sheets ====================

  let _contactsPickerTarget = null;

  function openSheet(sheetId) {
    const backdrop = $('sheet-backdrop');
    const sheet = $(sheetId);
    if (sheetId !== 'sheet-security-auth' && typeof _secAuthState.resolve === 'function') {
      const pending = _secAuthState.resolve;
      _secAuthState = { resolve: null, wallet: null, reason: '', pinBuffer: '', expectedLen: 6 };
      pending(false);
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.bottom-sheet.open').forEach((s) => {
        if (s.id !== sheetId) {
          s.classList.remove('open');
          s.setAttribute('aria-hidden', 'true');
        }
      });
    }
    if (backdrop) backdrop.classList.add('open');
    if (sheet) {
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
    }
  }

  function closeAllSheets() {
    const st = getState();
    if (st && st.limit) st.limit.pickerSide = null;
    if (typeof _secAuthState.resolve === 'function') {
      const pending = _secAuthState.resolve;
      _secAuthState = { resolve: null, wallet: null, reason: '', pinBuffer: '', expectedLen: 6, verifying: false };
      pending(false);
    }
    _backupRevealActive = false;
    const backupContent = $('backup-keys-content');
    if (backupContent) backupContent.innerHTML = '';
    const backdrop = $('sheet-backdrop');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.classList.remove('auth-top');
    }
    if (typeof document !== 'undefined') {
      document.querySelectorAll('.bottom-sheet.open').forEach((s) => {
        s.classList.remove('open');
        s.setAttribute('aria-hidden', 'true');
      });
    }
  }

  function switchTab(tab) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) {
      renderOnboardingVisibility();
      return;
    }
    st.activeTab = ['wallet', 'swap', 'perp', 'earn', 'hub'].includes(tab) ? tab : 'wallet';

    const views = ['wallet', 'swap', 'perp', 'earn', 'hub'];
    for (const v of views) {
      const el = $(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== st.activeTab);
    }

    if (typeof document !== 'undefined') {
      const navTarget = st.activeTab === 'earn' ? 'wallet' : st.activeTab;
      document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === navTarget);
      });
    }

    if (st.activeTab === 'swap') {
      setSwapPanelMode(st.swap.panelMode || 'market');
      if (st.swap.panelMode !== 'limit' && !st.swap.quoteData && st.swap.amountIn) scheduleSwapQuote();
    } else if (st.activeTab === 'perp') {
      renderPerpView();
      refreshPerpDataAsync(false).catch(() => {});
      refreshPerpLongShortAsync(st.perp.selectedCoin || 'BTC', false).catch(() => {});
    } else if (st.activeTab === 'earn') {
      if (!st.staking.filter) st.staking.filter = 'featured';
      renderEarnView();
      ensureStakingMetricsFresh(300_000);
    } else if (st.activeTab === 'hub') {
      renderHubView();
    } else {
      renderWalletView();
    }
  }

  function toggleLanguage() {
    const st = getState();
    const next = st.lang === 'en' ? 'zh' : 'en';
    st.setLanguage(next);
    showToast(next === 'en' ? 'Switched to English' : '已切换为中文');
  }

  // ==================== Onboarding & Multi-Wallet ====================

  let _isAddingAdditionalWallet = false;

  function renderOnboardingVisibility() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const hasWallet = Boolean(wallet);
    const onboard = $('view-onboarding');
    const nav = $('bottom-nav');

    if (hasWallet && _isAddingAdditionalWallet) {
      if (onboard) onboard.classList.remove('hidden');
      if (nav) nav.classList.add('hidden');
      return;
    }

    if (onboard) onboard.classList.toggle('hidden', hasWallet);
    if (nav) nav.classList.toggle('hidden', !hasWallet);

    if (!hasWallet) {
      ['wallet', 'swap', 'perp', 'earn', 'hub'].forEach((v) => {
        const el = $(`view-${v}`);
        if (el) el.classList.add('hidden');
      });
      cancelOnboardSubPanel();
    } else {
      const active = ['wallet', 'swap', 'perp', 'earn', 'hub'].includes(st.activeTab) ? st.activeTab : 'wallet';
      st.activeTab = active;
      ['wallet', 'swap', 'perp', 'earn', 'hub'].forEach((v) => {
        const el = $(`view-${v}`);
        if (el) el.classList.toggle('hidden', v !== active);
      });
      if (typeof document !== 'undefined') {
        const navTarget = active === 'earn' ? 'wallet' : active;
        document.querySelectorAll('.nav-item').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-tab') === navTarget);
        });
      }
    }
  }

  function cancelOnboardSubPanel() {
    const st = getState();
    if (st.wallets.length > 0 && $('view-onboarding') && !$('view-onboarding').classList.contains('hidden')) {
      const choice = $('onboard-choice-panel');
      const createP = $('onboard-create-panel');
      const importP = $('onboard-import-panel');
      if (choice && choice.classList.contains('hidden')) {
        choice.classList.remove('hidden');
        if (createP) createP.classList.add('hidden');
        if (importP) importP.classList.add('hidden');
        return;
      }
      _isAddingAdditionalWallet = false;
      $('view-onboarding').classList.add('hidden');
      $('bottom-nav')?.classList.remove('hidden');
      switchTab(st.activeTab || 'wallet');
      return;
    }
    _isAddingAdditionalWallet = false;
    $('onboard-choice-panel')?.classList.remove('hidden');
    $('onboard-create-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.add('hidden');
  }

  function openCreateWalletFlow() {
    const crypto = getCrypto();
    const st = getState();
    if (!crypto || typeof crypto.generateMnemonic !== 'function') {
      showToast(t('加密引擎未就绪', 'Crypto engine unavailable'));
      return;
    }
    const rawGenerated = crypto.generateMnemonic(12);
    const words = Array.isArray(rawGenerated)
      ? rawGenerated
      : String(rawGenerated || '').trim().split(/\s+/).filter(Boolean);
    const phrase = words.join(' ');
    st.pendingMnemonic = phrase;
    const grid = $('onboard-seed-grid');
    if (grid) {
      grid.innerHTML = words
        .map((w, i) => `<div class="seed-word"><span class="seed-idx">${i + 1}.</span><span>${escapeHtml(w)}</span></div>`)
        .join('');
    }
    const hintEl = $('onboard-create-hint');
    if (hintEl) hintEl.textContent = t('请妥善离线保存以下 12 个单词，它是恢复所有链上资产的唯一凭证', 'Store these 12 words safely offline. They control all derived chain accounts.');
    $('onboard-choice-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.add('hidden');
    $('onboard-create-panel')?.classList.remove('hidden');
  }

  function copyPendingMnemonic() {
    const st = getState();
    if (st.pendingMnemonic) copyText(st.pendingMnemonic, t('助记词', 'Seed Phrase'));
  }

  async function buildWalletFromMnemonic(mnemonic, name = '', pin = '') {
    const crypto = getCrypto();
    const contracts = getContracts();
    const st = getState();
    const derived = await crypto.deriveAllChainKeysAsync(mnemonic);
    const idx = st.wallets.length + 1;
    const wallet = st.normalizeWalletRecord({
      id: `near_ca_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '').trim() || `Account ${idx}`,
      mnemonic: String(mnemonic).trim(),
      pin: '',
      nearNamedAccount: '',
      nearAddress: derived.nearAddress,
      nearPublicKey: derived.nearPublicKey,
      nearPrivateKey: derived.nearPrivateKey,
      nearPrivateSeedHex: derived.nearPrivateSeedHex,
      mpcEvmAddress: derived.mpcEvmAddress || derived.evmAddress,
      evmAddress: derived.evmAddress,
      solAddress: derived.solAddress,
      solPublicKey: derived.solAddress,
      address: derived.pearlAddress,
      privateKeyHex: derived.pearlPrivateKeyHex,
      tweakedPrivateKeyHex: derived.pearlTweakedPrivateKeyHex,
      btcAddress: derived.btcAddress,
      btcPrivateKeyHex: derived.btcPrivateKeyHex,
      btcTweakedPrivateKeyHex: derived.btcTweakedPrivateKeyHex
    });
    if (pin && typeof st.setWalletPinAsync === 'function') {
      await st.setWalletPinAsync(wallet, pin);
    } else if (pin) {
      wallet.pin = String(pin).trim();
    }
    // Non-blocking background discovery of linked .near domain
    if (contracts && typeof contracts.discoverNearAccountsByPublicKeyAsync === 'function' && derived.nearPublicKey) {
      contracts.discoverNearAccountsByPublicKeyAsync(derived.nearPublicKey).then((discovered) => {
        if (Array.isArray(discovered) && discovered.length > 0 && !wallet.nearNamedAccount) {
          wallet.nearNamedAccount = discovered[0];
          wallet.discoveredNearAccounts = discovered;
          if (!String(name || '').trim()) wallet.name = discovered[0];
          contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          st.saveWalletsDebounced();
          if (st.activeWalletId === wallet.id) renderHeaderAndHero();
        }
      }).catch(() => {});
    }
    return wallet;
  }

  async function confirmCreateWallet() {
    const st = getState();
    const phrase = st.pendingMnemonic;
    if (!phrase) return;
    const name = $('onboard-create-name')?.value || '';
    const pin = ($('onboard-create-pin')?.value || '').trim();
    if (pin && !/^\d{4,6}$/.test(pin)) {
      showToast(t('PIN 密码需为 4-6 位数字', 'PIN must be 4-6 digits'));
      return;
    }
    try {
      const wallet = await buildWalletFromMnemonic(phrase, name, pin);
      st.wallets.push(wallet);
      st.activeWalletId = wallet.id;
      st.pendingMnemonic = '';
      _isAddingAdditionalWallet = false;
      st.activeTab = 'wallet';
      st.saveWallets();
      showToast(t('钱包已创建', 'Wallet created'));
      renderAll();
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(e && e.message ? e.message : t('创建失败', 'Create failed'));
    }
  }

  function openImportWalletFlow() {
    $('onboard-choice-panel')?.classList.add('hidden');
    $('onboard-create-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.remove('hidden');
    const ta = $('onboard-import-phrase');
    if (ta) {
      ta.value = '';
      ta.placeholder = t('输入 12 或 24 个英文助记词，使用空格分隔', 'Enter 12 or 24 BIP-39 words separated by spaces');
    }
    const status = $('onboard-import-status');
    if (status) status.textContent = '';
  }

  function validateOnboardImportLive() {
    const crypto = getCrypto();
    const phrase = ($('onboard-import-phrase')?.value || '').trim();
    const statusEl = $('onboard-import-status');
    if (!statusEl) return null;
    if (!phrase) {
      statusEl.textContent = '';
      return null;
    }
    const res = crypto.validateMnemonic(phrase);
    if (res.valid) {
      statusEl.style.color = 'var(--near-emerald)';
      statusEl.textContent = res.checksumValid
        ? t(`✓ 有效 ${res.words.length} 词助记词`, `✓ Valid ${res.words.length}-word phrase`)
        : t(`⚠ ${res.words.length} 词有效（校验和提醒）`, `⚠ ${res.words.length} words valid (checksum note)`);
    } else {
      statusEl.style.color = 'var(--rose-alert)';
      statusEl.textContent = res.error || t('助记词格式无效', 'Invalid mnemonic');
    }
    return res;
  }

  async function confirmImportWallet() {
    const crypto = getCrypto();
    const st = getState();
    const raw = ($('onboard-import-phrase')?.value || '').trim();
    const name = $('onboard-import-name')?.value || '';

    const check = crypto.validateMnemonic(raw);
    if (!check.valid) {
      showToast(check.error || t('无效助记词', 'Invalid recovery phrase'));
      return;
    }
    const normalizedPhrase = check.words.join(' ');
    try {
      const wallet = await buildWalletFromMnemonic(normalizedPhrase, name, '');
      const existing = st.wallets.find((w) => w.nearAddress && w.nearAddress === wallet.nearAddress);
      if (existing) {
        st.activeWalletId = existing.id;
        showToast(t('已切换至该助记词对应钱包', 'Switched to existing wallet'));
      } else {
        st.wallets.push(wallet);
        st.activeWalletId = wallet.id;
        showToast(t('全链钱包导入成功', 'Multi-chain wallet imported'));
      }
      st.saveWallets();
      _isAddingAdditionalWallet = false;
      st.activeTab = 'wallet';
      renderAll();
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(e && e.message ? e.message : t('导入失败', 'Import failed'));
    }
  }

  function startAdditionalWalletCreate() {
    closeAllSheets();
    _isAddingAdditionalWallet = true;
    ['wallet', 'swap', 'perp', 'earn', 'hub'].forEach((v) => $(`view-${v}`)?.classList.add('hidden'));
    $('bottom-nav')?.classList.add('hidden');
    $('view-onboarding')?.classList.remove('hidden');
    openCreateWalletFlow();
  }

  function startAdditionalWalletImport() {
    closeAllSheets();
    _isAddingAdditionalWallet = true;
    ['wallet', 'swap', 'perp', 'earn', 'hub'].forEach((v) => $(`view-${v}`)?.classList.add('hidden'));
    $('bottom-nav')?.classList.add('hidden');
    $('view-onboarding')?.classList.remove('hidden');
    openImportWalletFlow();
  }

  function openWalletSwitcherSheet() {
    renderWalletSwitcherList();
    openSheet('sheet-wallets');
  }

  function renderWalletSwitcherList() {
    const st = getState();
    const listEl = $('wallets-switcher-list');
    if (!listEl) return;
    if (st.wallets.length === 0) {
      listEl.innerHTML = `<div class="text-muted" style="text-align:center;padding:12px;">${t('暂无钱包', 'No wallets')}</div>`;
      return;
    }
    listEl.innerHTML = st.wallets.map((w) => {
      const isActive = w.id === st.activeWalletId;
      const nearId = w.nearNamedAccount || shortenAddr(w.nearAddress, 8, 6);
      return `
        <div class="ios-glass-card flex items-center justify-between gap-2" style="padding:12px;border-color:${isActive ? 'rgba(0,236,151,0.45)' : 'var(--border-glass)'};">
          <div class="min-w-0 flex-1" style="cursor:pointer;" data-action="switch-wallet" data-wallet-id="${escapeHtml(w.id)}">
            <div class="flex items-center gap-2">
              <span style="font-weight:700;color:#fff;">${escapeHtml(w.name)}</span>
              ${isActive ? `<span class="ca-badge">${t('当前', 'Active')}</span>` : ''}
            </div>
            <div class="mono text-emerald" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(nearId)}</div>
          </div>
          ${st.wallets.length > 1
            ? `<button type="button" class="btn-danger" data-action="delete-wallet" data-wallet-id="${escapeHtml(w.id)}">${t('删除', 'Delete')}</button>`
            : ''}
        </div>
      `;
    }).join('');
  }

  function switchActiveWallet(walletId) {
    const st = getState();
    const found = st.wallets.find((w) => w.id === walletId);
    if (!found) return;
    st.activeWalletId = found.id;
    st.expandedSymbol = null;
    st.swap.quoteData = null;
    st.saveWallets();
    closeAllSheets();
    renderAll();
    refreshAllBalancesAsync(true);
    showToast(`${t('已切换账户', 'Switched to')}: ${found.name}`);
  }

  async function deleteWalletById(walletId) {
    const st = getState();
    if (st.wallets.length <= 1) {
      showToast(t('至少保留一个钱包', 'Keep at least one wallet'));
      return;
    }
    const target = st.wallets.find((w) => w.id === walletId);
    if (target && !(await verifySecurityAuthAsync(target, t('删除钱包账户', 'Delete wallet account')))) return;
    st.wallets = st.wallets.filter((w) => w.id !== walletId);
    if (st.activeWalletId === walletId) {
      st.activeWalletId = st.wallets[0] ? st.wallets[0].id : null;
    }
    st.saveWallets();
    renderWalletSwitcherList();
    renderAll();
    showToast(t('已移除钱包', 'Wallet removed'));
  }

  let _backupRevealActive = false;

  function setBackupRevealState(revealed) {
    _backupRevealActive = Boolean(revealed);
    const btn = $('btn-backup-reveal-toggle');
    if (btn) {
      btn.textContent = _backupRevealActive ? t('隐藏助记词与私钥', 'Hide Phrase & Keys') : t('显示助记词与私钥', 'Reveal Phrase & Keys');
    }
    document.querySelectorAll('#backup-keys-content .backup-secret-val').forEach((el) => {
      const realVal = el.dataset.secret || '';
      if (_backupRevealActive) {
        el.textContent = realVal || '--';
        el.style.filter = 'none';
        el.style.userSelect = 'text';
      } else {
        el.textContent = realVal ? '•••• •••• •••• •••• •••• ••••' : '--';
        el.style.filter = 'blur(4px)';
        el.style.userSelect = 'none';
      }
    });
  }

  function toggleBackupKeysReveal() {
    setBackupRevealState(!_backupRevealActive);
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const hideSecretsOnLeave = () => {
      if (_backupRevealActive) setBackupRevealState(false);
    };
    window.addEventListener('blur', hideSecretsOnLeave);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) hideSecretsOnLeave();
      });
    }
  }

  async function openBackupKeysSheet() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (!(await verifySecurityAuthAsync(wallet, t('查看助记词与私钥', 'View recovery phrase & keys')))) return;
    await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    st.saveWallets();

    const rows = [
      { label: t('助记词 (12/24词)', 'Recovery Phrase'), val: wallet.mnemonic, secret: true },
      { label: t('NEAR 主账户', 'NEAR Master Account'), val: wallet.nearNamedAccount || wallet.nearAddress, secret: false },
      { label: t('NEAR 主私钥', 'NEAR Master Private Key'), val: wallet.nearPrivateKey, secret: true },
      { label: t('Bitcoin (BTC) Taproot 地址', 'Bitcoin (BTC) Taproot Address'), val: wallet.btcAddress, secret: false },
      { label: t('Bitcoin (BTC) 私钥', 'Bitcoin (BTC) Private Key'), val: wallet.btcPrivateKeyHex, secret: true },
      { label: t('Pearl (PRL) 地址', 'Pearl (PRL) Address'), val: wallet.address, secret: false },
      { label: t('Pearl (PRL) 私钥', 'Pearl (PRL) Private Key'), val: wallet.privateKeyHex, secret: true }
    ];

    const container = $('backup-keys-content');
    if (container) {
      _backupRevealActive = false;
      const warnBox = `
        <div class="ios-glass-card flex flex-col gap-1" style="padding:10px 12px;border-color:rgba(251,113,133,0.45);background:rgba(251,113,133,0.08);">
          <div style="font-size:12.5px;font-weight:700;color:var(--rose-alert);">⚠️ ${escapeHtml(t('最高安全等级提醒：切勿截图或泄露', 'High Security Warning: Never Screenshot or Share'))}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;">
            ${escapeHtml(t('• 请使用纸笔或金属板离线抄写，切勿截图、录屏或存入微信/网盘/备忘录。', '• Write down offline on paper/metal. Never screenshot, record, or save in cloud/chat apps.'))}<br/>
            ${escapeHtml(t('• 任何索要助记词或私钥的人都是骗子，一旦泄露资产将永久被盗且无法追回。', '• Anyone asking for your phrase or key is a scammer. Leaked assets cannot be recovered.'))}
          </div>
          <button type="button" id="btn-backup-reveal-toggle" class="btn-secondary" style="margin-top:6px;padding:7px 12px;font-size:12px;" data-action="toggle-backup-reveal">${escapeHtml(t('显示助记词与私钥', 'Reveal Phrase & Keys'))}</button>
        </div>
      `;
      const hint = `<div style="font-size:11.5px;color:var(--text-secondary);padding:4px 2px;">${escapeHtml(t('EVM、Solana 由当前主账户安全派生管理；Pearl (PRL) 与 Bitcoin (BTC) 由助记词本地独立派生。', 'EVM & Solana are securely managed by this master account; Pearl (PRL) & Bitcoin (BTC) are locally derived from your phrase.'))}</div>`;
      container.innerHTML = warnBox + hint + rows.map((r) => `
        <div class="meta-list">
          <div class="meta-row">
            <span class="meta-key">${escapeHtml(r.label)}</span>
            <button type="button" class="btn-ghost-sm" data-action="copy-text" data-val="${escapeHtml(r.val || '')}" data-label="${escapeHtml(r.label)}">${t('复制', 'Copy')}</button>
          </div>
          <div class="mono ${r.secret ? 'backup-secret-val' : ''}" data-secret="${escapeHtml(r.val || '')}" style="font-size:11px;word-break:break-all;color:#fff;${r.secret ? 'filter:blur(4px);user-select:none;' : ''}">${escapeHtml(r.secret ? (r.val ? '•••• •••• •••• •••• •••• ••••' : '--') : (r.val || '--'))}</div>
        </div>
      `).join('');
    }
    openSheet('sheet-backup');
  }

  function copyTextValue(val, label) {
    if (val) copyText(val, label);
  }

  function openPinSheet() {
    const inp = $('pin-input');
    if (inp) inp.value = '';
    openSheet('sheet-pin');
  }

  async function saveWalletPin() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const nextPin = ($('pin-input')?.value || '').trim();
    if (nextPin && !/^\d{4,6}$/.test(nextPin)) {
      showToast(t('请输入 4-6 位数字密码', 'Enter a 4-6 digit PIN'));
      return;
    }
    const hadPin = typeof st.hasWalletPin === 'function' ? st.hasWalletPin(wallet) : Boolean(wallet.pin);
    if (hadPin && !(await verifySecurityAuthAsync(wallet, t('修改钱包安全密码', 'Update wallet PIN')))) return;
    if (typeof st.setWalletPinAsync === 'function') {
      await st.setWalletPinAsync(wallet, nextPin);
      wallet.pinLen = nextPin ? nextPin.length : 0;
    } else {
      wallet.pin = nextPin;
      wallet.pinLen = nextPin ? nextPin.length : 0;
    }
    st.saveWallets();
    closeAllSheets();
    renderHubBiometricCardAsync();
    showToast(nextPin ? t('安全密码已更新', 'PIN updated') : t('已清除安全密码', 'PIN cleared'));
  }

  // ==================== Multi-Chain Balance & Price Sync ====================

  let _priceIndexMap = new Map();
  let _priceIndexLiveRef = null;
  let _priceIndexLiveLen = -1;
  let _priceIndexSolLen = -1;
  let _priceIndexUpdatedAt = -1;

  function rebuildPriceIndex() {
    const tokens = getTokens();
    const st = getState();
    const map = new Map();
    const dexLists = tokens && tokens.DEX_CHAIN_TOKENS && typeof tokens.DEX_CHAIN_TOKENS === 'object'
      ? Object.values(tokens.DEX_CHAIN_TOKENS)
      : [];
    const lists = [st.liveTokens || [], (tokens && tokens.UNIFIED_CORE_TOKENS) || [], st.dynamicSolTokens || [], ...dexLists];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item) continue;
        const symU = String(item.symbol || '').toUpperCase();
        if (!symU || map.has(symU)) continue;
        if (typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0) {
          map.set(symU, item.price);
        }
      }
    }
    if (!map.has('WNEAR') && map.has('NEAR')) map.set('WNEAR', map.get('NEAR'));
    if (!map.has('WETH') && map.has('ETH')) map.set('WETH', map.get('ETH'));
    _priceIndexMap = map;
    _priceIndexLiveRef = st.liveTokens || null;
    _priceIndexLiveLen = Array.isArray(st.liveTokens) ? st.liveTokens.length : 0;
    _priceIndexSolLen = Array.isArray(st.dynamicSolTokens) ? st.dynamicSolTokens.length : 0;
    _priceIndexUpdatedAt = Number(st.pricesUpdatedAt || 0);
    return map;
  }

  function getSymbolPrice(symbol) {
    const st = getState();
    const curLiveLen = Array.isArray(st.liveTokens) ? st.liveTokens.length : 0;
    const curSolLen = Array.isArray(st.dynamicSolTokens) ? st.dynamicSolTokens.length : 0;
    const curUpdatedAt = Number(st.pricesUpdatedAt || 0);
    if (
      st.liveTokens !== _priceIndexLiveRef ||
      curLiveLen !== _priceIndexLiveLen ||
      curSolLen !== _priceIndexSolLen ||
      curUpdatedAt !== _priceIndexUpdatedAt
    ) {
      rebuildPriceIndex();
    }
    const symUpper = String(symbol || '').toUpperCase();
    const hit = _priceIndexMap.get(symUpper);
    if (typeof hit === 'number' && hit > 0) return hit;
    if (symUpper === 'WNEAR') return _priceIndexMap.get('NEAR') ?? null;
    if (symUpper === 'WETH') return _priceIndexMap.get('ETH') ?? null;
    return null;
  }

  function getTokenUnitPrice(tok) {
    if (!tok) return null;
    if (typeof tok.price === 'number' && Number.isFinite(tok.price) && tok.price > 0) {
      return tok.price;
    }
    const tokens = getTokens();
    if (tokens && typeof tokens.findTokenByAssetId === 'function' && tok.assetId) {
      const fresh = tokens.findTokenByAssetId(tok.assetId, tok.blockchain || '');
      if (fresh && typeof fresh.price === 'number' && Number.isFinite(fresh.price) && fresh.price > 0) {
        return fresh.price;
      }
    }
    return getSymbolPrice(tok.symbol);
  }

  function getSymbolIcon(symbol) {
    const tokens = getTokens();
    const st = getState();
    const symUpper = String(symbol || '').trim().replace(/^\$/, '').toUpperCase();
    if (!symUpper) return '';
    if (tokens && tokens.TOKEN_ICON_MAP && tokens.TOKEN_ICON_MAP[symUpper]) {
      return tokens.TOKEN_ICON_MAP[symUpper];
    }
    const liveHit = Array.isArray(st.liveTokens)
      ? st.liveTokens.find((item) => item && String(item.symbol || '').trim().toUpperCase() === symUpper && item.logoURI)
      : null;
    return (liveHit && liveHit.logoURI) || '';
  }

  function getPoolIconUrl(pool) {
    if (!pool) return '';
    return pool.icon || getSymbolIcon(pool.outSymbol) || getSymbolIcon(pool.inSymbol) || '';
  }

  function formatCompactTvlNum(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return null;
    const lang = getState().lang;
    if (String(lang).toLowerCase().startsWith('en')) {
      if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
      if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return Math.round(n).toLocaleString('en-US');
    }
    if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
    if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('en-US')}万`;
    return Math.round(n).toLocaleString('en-US');
  }

  function formatPoolTvlDisplay(pool) {
    if (!pool) return '--';
    if (typeof pool.tvlTokenAmount === 'number' && Number.isFinite(pool.tvlTokenAmount) && pool.tvlTokenAmount > 0) {
      let usdVal = (typeof pool.tvlUsd === 'number' && Number.isFinite(pool.tvlUsd) && pool.tvlUsd > 0) ? pool.tvlUsd : null;
      if (usdVal === null) {
        const symU = String(pool.inSymbol || '').toUpperCase();
        const px = (symU === 'USDC' || symU === 'USDT' || symU === 'USDE') ? 1.0 : getSymbolPrice(pool.inSymbol);
        if (typeof px === 'number' && Number.isFinite(px) && px > 0) {
          usdVal = pool.tvlTokenAmount * px;
        }
      }
      const cTok = formatCompactTvlNum(pool.tvlTokenAmount);
      if (cTok) {
        const cUsd = usdVal !== null ? formatCompactTvlNum(usdVal) : null;
        return cUsd ? `${cTok} ${pool.inSymbol} ($${cUsd})` : `${cTok} ${pool.inSymbol}`;
      }
    }
    return pool.tvlText || '--';
  }

  let _isRefreshing = false;
  let _refreshGen = 0;
  let _lastStakingPositionsSyncAt = 0;

  function ensureStakingMetricsFresh(maxAgeMs = 300_000) {
    const st = getState();
    const stale = !st.staking.pools || !st.staking.updatedAt || (Date.now() - st.staking.updatedAt > maxAgeMs);
    if (stale && !st.staking.loading) {
      refreshStakingMetrics(false);
    }
  }

  async function refreshAllBalancesAsync(showFeedback = false) {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet || (_isRefreshing && !showFeedback)) return;

    _isRefreshing = true;
    const gen = ++_refreshGen;
    const targetWalletId = wallet.id;
    const isStaleRefresh = () => gen !== _refreshGen || st.activeWalletId !== targetWalletId;

    const ptrInd = $('home-ptr-indicator');
    const ptrTxt = $('home-ptr-text');
    if (showFeedback && ptrInd) {
      ptrInd.classList.remove('pulling');
      ptrInd.classList.add('refreshing');
      if (ptrTxt) ptrTxt.textContent = t('正在同步多链资产...', 'Syncing multi-chain balances...');
    }

    try {
      await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
      if (isStaleRefresh()) return;
      const nearAccountId = wallet.nearNamedAccount || wallet.nearAddress;

      // Non-blocking .near named-account discovery in parallel
      let discoveredNamedAccount = null;
      if (!wallet.nearNamedAccount && wallet.nearPublicKey && !wallet._nearAccountChecked && typeof contracts.discoverNearAccountsByPublicKeyAsync === 'function') {
        wallet._nearAccountChecked = true;
        contracts.discoverNearAccountsByPublicKeyAsync(wallet.nearPublicKey).then((discovered) => {
          if (isStaleRefresh() || !Array.isArray(discovered) || discovered.length === 0) return;
          discoveredNamedAccount = discovered[0];
          wallet.nearNamedAccount = discovered[0];
          wallet.discoveredNearAccounts = discovered;
          contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
          renderHeaderAndHero();
          intents.fetchNearNativeBalance(wallet.nearNamedAccount).then((v) => {
            if (!isStaleRefresh() && typeof v === 'number' && Number.isFinite(v)) {
              wallet.nativeBalances.near = v;
              scheduleProgressiveWalletRender();
            }
          }).catch(() => {});
          if (typeof intents.fetchNearNep141Balances === 'function') {
            intents.fetchNearNep141Balances(wallet.nearNamedAccount).then((map) => {
              if (!isStaleRefresh() && map && typeof map === 'object') {
                wallet.nearNep141Balances = { ...(wallet.nearNep141Balances || {}), ...map };
                scheduleProgressiveWalletRender();
              }
            }).catch(() => {});
          }
          if (typeof contracts.fetchNearAccountStakingPositionsAsync === 'function') {
            contracts.fetchNearAccountStakingPositionsAsync(wallet.nearNamedAccount).then((list) => {
              if (!isStaleRefresh() && Array.isArray(list)) {
                wallet.nearStakingPositions = list;
                if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
                if (st.activeTab === 'earn') renderEarnView();
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      }

      const solTokens = (tokens.DEX_CHAIN_TOKENS && tokens.DEX_CHAIN_TOKENS.sol) || [];
      const solMints = solTokens.map((x) => x.contractAddress).filter((m) => m && m !== 'So11111111111111111111111111111111111111112');

      const evmAllChainKeys = ['eth', 'base', 'arb', 'bsc', 'op', 'pol', 'avax', 'hype', 'hood', 'arc'];
      const evmBatchQueriesByChain = {
        eth: [
          { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
          { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
          { contract: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', decimals: 18 },
          { contract: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', decimals: 18 },
          { contract: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', decimals: 18 },
          { contract: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', decimals: 6 },
          { contract: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', decimals: 18 }
        ],
        base: [
          { contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
          { contract: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', decimals: 6 }
        ],
        arb: [
          { contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
          { contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
          { contract: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
          { contract: '0x724dc807b04555b71ed48a6896b6F41593b8C637', decimals: 6 }
        ],
        bsc: [
          { contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
          { contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }
        ],
        op: [
          { contract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
          { contract: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 }
        ],
        pol: [
          { contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
          { contract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 }
        ],
        avax: [
          { contract: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
          { contract: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 }
        ],
        hype: [
          { contract: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', decimals: 6 },
          { contract: '0xfD739d4e423301CE9385c1fb8850539D657C296D', decimals: 18 }
        ],
        hood: [
          { contract: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6 }
        ],
        arc: [
          { contract: '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', decimals: 18 }
        ]
      };

      let _progRenderTimer = null;
      const scheduleProgressiveWalletRender = () => {
        if (isStaleRefresh() || _progRenderTimer || typeof setTimeout !== 'function') return;
        _progRenderTimer = setTimeout(() => {
          _progRenderTimer = null;
          if (isStaleRefresh()) return;
          st.syncWalletCompatBalances(wallet);
          if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
          if (st.activeTab === 'wallet') {
            renderHeaderAndHero();
            renderUnifiedAssetList();
          } else if (st.activeTab === 'swap') {
            const ft = resolveSwapToken(st.swap.fromAssetId, 0);
            const tt = resolveSwapToken(st.swap.toAssetId, 1);
            if ($('swap-from-balance')) $('swap-from-balance').textContent = `${formatBal(getSwapTokenAvailableBalance(ft), 6)} ${ft ? ft.symbol : ''}`;
            if ($('swap-to-balance')) $('swap-to-balance').textContent = `${formatBal(getSwapTokenAvailableBalance(tt), 6)} ${tt ? tt.symbol : ''}`;
            if (ft && tt) renderSwapGasReserveRow(wallet, ft, tt);
            updateSwapUsdEstimates();
            updateSwapPrimaryButtonState();
          }
          const ds = $('sheet-token-detail');
          if (ds && ds.classList && ds.classList.contains('open')) {
            renderTokenDetailSheet();
          }
        }, 80);
      };

      const shouldSyncPositions = showFeedback || st.activeTab === 'earn' || (Date.now() - _lastStakingPositionsSyncAt > 120_000);
      if (shouldSyncPositions) {
        _lastStakingPositionsSyncAt = Date.now();
        if (nearAccountId && typeof contracts.fetchNearAccountStakingPositionsAsync === 'function') {
          contracts.fetchNearAccountStakingPositionsAsync(nearAccountId).then((list) => {
            if (!isStaleRefresh() && Array.isArray(list)) {
              wallet.nearStakingPositions = list;
              if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
              if (st.activeTab === 'earn') renderEarnView();
            }
          }).catch(() => {});
        }
        if (wallet.solAddress && typeof contracts.fetchSolanaAccountStakingPositionsAsync === 'function') {
          contracts.fetchSolanaAccountStakingPositionsAsync(wallet.solAddress).then((list) => {
            if (!isStaleRefresh() && Array.isArray(list)) {
              wallet.solStakingPositions = list;
              if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
              if (st.activeTab === 'earn') renderEarnView();
            }
          }).catch(() => {});
        }
        if (wallet.evmAddress && typeof contracts.fetchEvmAccountStakingPositionsAsync === 'function') {
          contracts.fetchEvmAccountStakingPositionsAsync(wallet).then((list) => {
            if (!isStaleRefresh() && Array.isArray(list)) {
              wallet.evmStakingPositions = list;
              if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
              if (st.activeTab === 'earn') renderEarnView();
            }
          }).catch(() => {});
        }
      }
      if (wallet.address && typeof contracts.fetchPearlNativeBalance === 'function') {
        contracts.fetchPearlNativeBalance(wallet.address).then((res) => {
          if (!isStaleRefresh() && res && typeof res.formatted === 'number' && Number.isFinite(res.formatted)) {
            wallet.nativeBalances.prl = reconcileFetchedChainBalance(wallet, 'prl', res.formatted);
            scheduleProgressiveWalletRender();
          }
        }).catch(() => {});
      }
      if (wallet.btcAddress && typeof contracts.fetchBitcoinNativeBalance === 'function') {
        contracts.fetchBitcoinNativeBalance(wallet.btcAddress).then((res) => {
          const bal = res && typeof res.formatted === 'number' ? res.formatted : (typeof res === 'number' ? res : null);
          if (!isStaleRefresh() && typeof bal === 'number' && Number.isFinite(bal)) {
            wallet.nativeBalances.btc = reconcileFetchedChainBalance(wallet, 'btc', bal);
            scheduleProgressiveWalletRender();
          }
        }).catch(() => {});
      }

      const [
        pricesRes,
        nearBalRes,
        nep141BalRes,
        solBalRes,
        ...evmBatchResults
      ] = await Promise.all([
        intents.fetchLiveDefuseTokenPrices({
          useCache: !showFeedback,
          onFastUpdate: (partialRes) => {
            if (!isStaleRefresh() && Array.isArray(partialRes) && partialRes.length > 0) {
              st.liveTokens = partialRes;
              st.pricesUpdatedAt = Date.now();
              rebuildPriceIndex();
              if (typeof st.saveCachedLiveTokens === 'function') st.saveCachedLiveTokens(partialRes);
              scheduleProgressiveWalletRender();
            }
          }
        }).then((res) => {
          if (!isStaleRefresh() && Array.isArray(res)) {
            st.liveTokens = res;
            st.pricesUpdatedAt = Date.now();
            rebuildPriceIndex();
            if (typeof st.saveCachedLiveTokens === 'function') st.saveCachedLiveTokens(res);
            scheduleProgressiveWalletRender();
          }
          return res;
        }).catch(() => null),
        nearAccountId ? intents.fetchNearNativeBalance(nearAccountId).then((v) => {
          if (!isStaleRefresh() && (!discoveredNamedAccount || nearAccountId === discoveredNamedAccount) && typeof v === 'number' && Number.isFinite(v)) {
            wallet.nativeBalances.near = v;
            scheduleProgressiveWalletRender();
          }
          return v;
        }).catch(() => null) : Promise.resolve(null),
        (nearAccountId && typeof intents.fetchNearNep141Balances === 'function')
          ? intents.fetchNearNep141Balances(nearAccountId).then((map) => {
              if (!isStaleRefresh() && (!discoveredNamedAccount || nearAccountId === discoveredNamedAccount) && map && typeof map === 'object') {
                wallet.nearNep141Balances = { ...(wallet.nearNep141Balances || {}), ...map };
                scheduleProgressiveWalletRender();
              }
              return map;
            }).catch(() => null)
          : Promise.resolve(null),
        wallet.solAddress ? contracts.fetchSolanaNativeAndSplBalances(wallet.solAddress, solMints).then((res) => {
          if (!isStaleRefresh() && res && typeof res === 'object') {
            if (typeof res.nativeSol === 'number') wallet.nativeBalances.sol = res.nativeSol;
            const nextAtaMints = {};
            if (res.ataMints && typeof res.ataMints === 'object') {
              for (const [m, exists] of Object.entries(res.ataMints)) {
                if (exists) nextAtaMints[m] = true;
              }
            }
            if (res.tokens && typeof res.tokens === 'object') {
              for (const [mint, info] of Object.entries(res.tokens)) {
                if (info && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
                  wallet.splBalances[mint] = info.formatted;
                  if (info.hasAta === true || (info.hasAta !== false && info.formatted > 0)) {
                    nextAtaMints[mint] = true;
                  }
                }
              }
            }
            wallet.solAtaMints = nextAtaMints;
            scheduleProgressiveWalletRender();
          }
          return res;
        }).catch(() => null) : Promise.resolve(null),
        ...evmAllChainKeys.map((ck) => {
          if (!wallet.evmAddress) return Promise.resolve(null);
          const qList = evmBatchQueriesByChain[ck] || [];
          const p = typeof contracts.fetchEvmChainBalancesBatch === 'function'
            ? contracts.fetchEvmChainBalancesBatch(ck, wallet.evmAddress, qList)
            : contracts.fetchEvmNativeAndErc20Balance(ck, wallet.evmAddress, qList[0]?.contract || null, qList[0]?.decimals || 18);
          return p.then((res) => {
            if (!isStaleRefresh() && res) {
              if (typeof res.nativeFormatted === 'number' && Number.isFinite(res.nativeFormatted)) {
                wallet.nativeBalances[ck] = res.nativeFormatted;
              }
              if (res.tokens && typeof res.tokens === 'object') {
                for (const info of Object.values(res.tokens)) {
                  if (info && info.contract && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
                    st.setWalletErc20Balance(wallet, ck, info.contract, info.formatted);
                  }
                }
              } else if (typeof res.tokenFormatted === 'number' && Number.isFinite(res.tokenFormatted) && qList[0]) {
                st.setWalletErc20Balance(wallet, ck, qList[0].contract, res.tokenFormatted);
              }
              scheduleProgressiveWalletRender();
            }
            return res;
          }).catch(() => null);
        })
      ]);

      if (_progRenderTimer) {
        clearTimeout(_progRenderTimer);
        _progRenderTimer = null;
      }
      if (isStaleRefresh()) return;

      if (Array.isArray(pricesRes)) {
        st.liveTokens = pricesRes;
        st.pricesUpdatedAt = Date.now();
        rebuildPriceIndex();
        if (typeof st.saveCachedLiveTokens === 'function') st.saveCachedLiveTokens(pricesRes);
      }

      if ((!discoveredNamedAccount || nearAccountId === discoveredNamedAccount) && typeof nearBalRes === 'number' && Number.isFinite(nearBalRes)) {
        wallet.nativeBalances.near = nearBalRes;
      }

      if ((!discoveredNamedAccount || nearAccountId === discoveredNamedAccount) && nep141BalRes && typeof nep141BalRes === 'object') {
        wallet.nearNep141Balances = { ...(wallet.nearNep141Balances || {}), ...nep141BalRes };
      }

      if (solBalRes && typeof solBalRes === 'object') {
        if (typeof solBalRes.nativeSol === 'number') {
          wallet.nativeBalances.sol = solBalRes.nativeSol;
        }
        const nextAtaMints = {};
        if (solBalRes.ataMints && typeof solBalRes.ataMints === 'object') {
          for (const [m, exists] of Object.entries(solBalRes.ataMints)) {
            if (exists) nextAtaMints[m] = true;
          }
        }
        if (solBalRes.tokens && typeof solBalRes.tokens === 'object') {
          for (const [mint, info] of Object.entries(solBalRes.tokens)) {
            if (info && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
              wallet.splBalances[mint] = info.formatted;
              if (info.hasAta === true || (info.hasAta !== false && info.formatted > 0)) {
                nextAtaMints[mint] = true;
              }
            }
          }
        }
        wallet.solAtaMints = nextAtaMints;
      }

      evmAllChainKeys.forEach((ck, i) => {
        const res = evmBatchResults[i];
        if (!res) return;
        if (typeof res.nativeFormatted === 'number' && Number.isFinite(res.nativeFormatted)) {
          wallet.nativeBalances[ck] = res.nativeFormatted;
        }
        if (res.tokens && typeof res.tokens === 'object') {
          for (const info of Object.values(res.tokens)) {
            if (info && info.contract && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
              st.setWalletErc20Balance(wallet, ck, info.contract, info.formatted);
            }
          }
        }
      });

      st.syncWalletCompatBalances(wallet);
      st.saveWallets();
      renderAll();
      const detailSheet = $('sheet-token-detail');
      if (detailSheet && detailSheet.classList && detailSheet.classList.contains('open')) {
        renderTokenDetailSheet();
      }

      if (showFeedback) showToast(t('多链资产已同步', 'Balances synced'));
    } catch (e) {
      if (showFeedback) showToast(e && e.message ? e.message : t('余额同步失败', 'Sync failed'));
    } finally {
      if (gen === _refreshGen) {
        _isRefreshing = false;
        const viewWallet = $('view-wallet');
        if (ptrInd) {
          ptrInd.classList.remove('pulling', 'refreshing');
        }
        if (viewWallet) {
          viewWallet.classList.add('ptr-spring');
          viewWallet.style.transform = 'translate3d(0, 0, 0)';
          setTimeout(() => {
            if (viewWallet.style.transform === 'translate3d(0, 0, 0)') {
              viewWallet.style.transform = '';
              viewWallet.classList.remove('ptr-spring');
            }
          }, 300).unref?.();
        }
        const spinnerEl = ptrInd && ptrInd.querySelector ? ptrInd.querySelector('.ptr-spinner') : null;
        if (spinnerEl) spinnerEl.style.transform = '';
        if (ptrTxt) ptrTxt.textContent = t('下拉刷新链上余额', 'Pull down to refresh');
      }
    }
  }

  const _pendingChainSpends = new Map();

  function applyOptimisticChainSpend(wallet, chainKey, transferAmount, feeAmount = 0, txHash = '') {
    if (!wallet || !wallet.id || !chainKey) return null;
    const st = getState();
    const contracts = getContracts();
    const ck = String(chainKey).toLowerCase();
    const amtNum = Number(transferAmount);
    const feeNum = Number(feeAmount);
    const spentTotal = (Number.isFinite(amtNum) && amtNum > 0 ? amtNum : 0) + (Number.isFinite(feeNum) && feeNum > 0 ? feeNum : 0);
    if (spentTotal <= 0) return null;

    if (!wallet.nativeBalances || typeof wallet.nativeBalances !== 'object') wallet.nativeBalances = {};
    const prevBal = Number(wallet.nativeBalances[ck] ?? 0);
    const nextBal = Math.max(0, Number((prevBal - spentTotal).toFixed(8)));
    wallet.nativeBalances[ck] = nextBal;
    if (st && typeof st.syncWalletCompatBalances === 'function') {
      st.syncWalletCompatBalances(wallet);
    }

    _pendingChainSpends.set(`${wallet.id}:${ck}`, {
      txHash: String(txHash || ''),
      prevBal,
      spentTotal,
      expiresAt: Date.now() + 90_000
    });

    if (st && typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
    else if (st && typeof st.saveWallets === 'function') st.saveWallets();

    renderWalletView();
    if (st && st.activeTab === 'swap') renderSwapView();
    const detailSheet = $('sheet-token-detail');
    if (detailSheet && detailSheet.classList && detailSheet.classList.contains('open')) {
      renderTokenDetailSheet();
    }

    const fetcher = typeof window !== 'undefined' && typeof document !== 'undefined'
      ? (ck === 'prl'
          ? (wallet.address && contracts?.fetchPearlNativeBalance ? () => contracts.fetchPearlNativeBalance(wallet.address) : null)
          : (ck === 'btc' && wallet.btcAddress && contracts?.fetchBitcoinNativeBalance ? () => contracts.fetchBitcoinNativeBalance(wallet.btcAddress) : null))
      : null;
    if (fetcher) {
      for (const delayMs of [4000, 16000]) {
        const tm = setTimeout(async () => {
          if (typeof window === 'undefined' || typeof document === 'undefined' || st.activeWalletId !== wallet.id) return;
          const res = await fetcher().catch(() => null);
          const liveBal = res && typeof res.formatted === 'number' ? res.formatted : null;
          if (liveBal !== null && Number.isFinite(liveBal)) {
            wallet.nativeBalances[ck] = reconcileFetchedChainBalance(wallet, ck, liveBal);
            if (st && typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
            renderWalletView();
            if (st.activeTab === 'swap') renderSwapView();
            const curDetailSheet = $('sheet-token-detail');
            if (curDetailSheet && curDetailSheet.classList && curDetailSheet.classList.contains('open')) {
              renderTokenDetailSheet();
            }
          }
        }, delayMs);
        tm?.unref?.();
      }
    }
    return { prevBal, spentTotal, nextBal };
  }

  function reconcileFetchedChainBalance(wallet, chainKey, liveBal) {
    const cleanLive = Number(liveBal);
    if (!Number.isFinite(cleanLive) || !wallet || !wallet.id) return liveBal;
    const key = `${wallet.id}:${String(chainKey || '').toLowerCase()}`;
    const pending = _pendingChainSpends.get(key);
    if (!pending) return cleanLive;
    if (Date.now() > pending.expiresAt) {
      _pendingChainSpends.delete(key);
      return cleanLive;
    }
    const optimisticBal = Math.max(0, Number((pending.prevBal - pending.spentTotal).toFixed(8)));
    if (cleanLive <= pending.prevBal - pending.spentTotal * 0.5 + 1e-6) {
      _pendingChainSpends.delete(key);
      return cleanLive;
    }
    if (Math.abs(cleanLive - pending.prevBal) <= 1e-6) {
      return optimisticBal;
    }
    _pendingChainSpends.delete(key);
    return cleanLive;
  }

  function computePtrPullDistance(dy, maxPull = 68) {
    const cleanDy = Number(dy);
    if (!Number.isFinite(cleanDy) || cleanDy <= 0) return 0;
    return maxPull * (1 - Math.exp(-cleanDy / 135));
  }

  let _ptrInitialized = false;
  function initHomePullToRefresh() {
    if (_ptrInitialized || typeof document === 'undefined') return;
    const viewWallet = $('view-wallet');
    const ind = $('home-ptr-indicator');
    const txt = $('home-ptr-text');
    if (!viewWallet || !ind || typeof viewWallet.addEventListener !== 'function') return;
    _ptrInitialized = true;

    const spinner = ind.querySelector ? ind.querySelector('.ptr-spinner') : null;
    let startX = null;
    let startY = null;
    let pulling = false;
    let latestDy = 0;
    const MAX_PULL = 68;
    const THRESHOLD = 46;

    const getScrollTop = () => {
      if (typeof window !== 'undefined' && typeof window.scrollY === 'number' && window.scrollY > 0) {
        return window.scrollY;
      }
      return (document.documentElement && document.documentElement.scrollTop) || viewWallet.scrollTop || 0;
    };

    const setPullVisual = (pullPx, spring = false) => {
      if (spring) viewWallet.classList.add('ptr-spring');
      else viewWallet.classList.remove('ptr-spring');
      viewWallet.style.transform = pullPx > 0 ? `translate3d(0, ${pullPx.toFixed(1)}px, 0)` : (spring ? 'translate3d(0, 0, 0)' : '');
      if (spinner) {
        spinner.style.transform = pullPx > 0 ? `rotate(${Math.round((pullPx / THRESHOLD) * 260)}deg)` : '';
      }
    };

    viewWallet.addEventListener('touchstart', (e) => {
      if (_isRefreshing || !e.touches || e.touches.length !== 1) return;
      if (getScrollTop() > 2) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      latestDy = 0;
      pulling = false;
      viewWallet.classList.remove('ptr-spring');
    }, { passive: true });

    viewWallet.addEventListener('touchmove', (e) => {
      if (startY === null || _isRefreshing || !e.touches || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - (startX ?? e.touches[0].clientX);
      const dy = e.touches[0].clientY - startY;
      if (!pulling && Math.abs(dy) <= Math.abs(dx) * 1.35) {
        startY = null;
        startX = null;
        return;
      }
      if (dy <= 6 || getScrollTop() > 2) {
        if (pulling) {
          ind.classList.remove('pulling');
          setPullVisual(0, true);
          pulling = false;
        }
        return;
      }
      pulling = true;
      latestDy = dy;
      if (e.cancelable && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      const pullPx = computePtrPullDistance(dy, MAX_PULL);
      ind.classList.add('pulling');
      setPullVisual(pullPx, false);
      if (txt) {
        txt.textContent = pullPx >= THRESHOLD
          ? t('释放立即刷新', 'Release to refresh')
          : t('下拉刷新链上余额', 'Pull down to refresh');
      }
    }, { passive: false });

    const endPull = () => {
      if (startY === null) return;
      const pullPx = computePtrPullDistance(latestDy, MAX_PULL);
      const triggered = pulling && pullPx >= THRESHOLD && !_isRefreshing;
      startX = null;
      startY = null;
      pulling = false;
      latestDy = 0;
      if (triggered) {
        setPullVisual(42, true);
        refreshAllBalancesAsync(true);
      } else {
        ind.classList.remove('pulling');
        setPullVisual(0, true);
        setTimeout(() => {
          if (!pulling && !_isRefreshing) {
            viewWallet.style.transform = '';
            viewWallet.classList.remove('ptr-spring');
          }
        }, 300).unref?.();
      }
    };

    viewWallet.addEventListener('touchend', endPull, { passive: true });

    viewWallet.addEventListener('touchcancel', () => {
      startX = null;
      startY = null;
      pulling = false;
      latestDy = 0;
      ind.classList.remove('pulling');
      setPullVisual(0, true);
    }, { passive: true });
  }

  // ==================== Aggregated Parent-Token List (100% Real On-Chain L1/L2 Balances) ====================

  const DEFAULT_VISIBLE_SYMBOLS = ['NEAR', 'PRL', 'QTC', 'SOL', 'ETH', 'BNB', 'BTC'];
  const DEFAULT_VISIBLE_SET = new Set(DEFAULT_VISIBLE_SYMBOLS);
  const PRIMARY_CHAIN_BY_DEFAULT_SYMBOL = {
    NEAR: 'near',
    PRL: 'prl',
    QTC: 'near',
    SOL: 'sol',
    ETH: 'eth',
    BNB: 'bsc',
    BTC: 'btc'
  };

  function buildAllOnChainAssetGroups(wallet) {
    const tokens = getTokens();
    const st = getState();
    if (!wallet) return [];

    const groupsMap = new Map();
    const ensureGroup = (sym) => {
      const key = String(sym || '').toUpperCase();
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          symbolKey: key,
          symbol: sym,
          primaryToken: null,
          price: getSymbolPrice(sym),
          entries: [],
          items: [],
          totalBalance: null,
          totalUsd: null
        });
      }
      return groupsMap.get(key);
    };

    // 1. Native L1/L2 Chain Balances
    const nativeDefs = [
      { sym: 'NEAR', chain: 'near', name: 'NEAR Protocol', balKey: 'near', assetId: 'nep141:wrap.near', decimals: 24 },
      { sym: 'PRL', chain: 'prl', name: 'Pearl Network', balKey: 'prl', assetId: 'nep141:prl.omft.near', decimals: 8 },
      { sym: 'SOL', chain: 'sol', name: 'Solana', balKey: 'sol', assetId: 'nep141:sol.omft.near', decimals: 9 },
      { sym: 'ETH', chain: 'eth', name: 'Ethereum', balKey: 'eth', assetId: 'nep141:eth.omft.near', decimals: 18 },
      { sym: 'ETH', chain: 'base', name: 'Base', balKey: 'base', assetId: 'nep141:base.omft.near', decimals: 18 },
      { sym: 'ETH', chain: 'arb', name: 'Arbitrum', balKey: 'arb', assetId: 'nep141:arb.omft.near', decimals: 18 },
      { sym: 'ETH', chain: 'op', name: 'OP Mainnet', balKey: 'op', assetId: 'op:native:eth', decimals: 18 },
      { sym: 'ETH', chain: 'hood', name: 'Robinhood Chain', balKey: 'hood', assetId: 'nep141:hood.omft.near', decimals: 18 },
      { sym: 'USDC', chain: 'arc', name: 'Arc Network', balKey: 'arc', assetId: 'arc:native:usdc', decimals: 18 },
      { sym: 'BNB', chain: 'bsc', name: 'BNB Smart Chain', balKey: 'bsc', assetId: 'nep141:bnb.omdep.near', decimals: 18 },
      { sym: 'POL', chain: 'pol', name: 'Polygon', balKey: 'pol', assetId: 'pol:native:pol', decimals: 18 },
      { sym: 'AVAX', chain: 'avax', name: 'Avalanche', balKey: 'avax', assetId: 'avax:native:avax', decimals: 18 },
      { sym: 'HYPE', chain: 'hype', name: 'HyperEVM', balKey: 'hype', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
      { sym: 'BTC', chain: 'btc', name: 'Bitcoin', balKey: 'btc', assetId: 'nep141:btc.omft.near', decimals: 8 }
    ];

    for (const nd of nativeDefs) {
      const grp = ensureGroup(nd.sym);
      const tokenObj = {
        symbol: nd.sym,
        blockchain: nd.chain,
        assetId: nd.assetId,
        decimals: nd.decimals,
        networkName: nd.name,
        isNative: true
      };
      if (!grp.primaryToken) grp.primaryToken = tokenObj;
      const rawBal = wallet.nativeBalances ? wallet.nativeBalances[nd.balKey] : null;
      const bal = (rawBal !== null && rawBal !== undefined && typeof rawBal === 'number' && Number.isFinite(rawBal))
        ? rawBal
        : null;
      grp.entries.push({
        id: `native_${nd.chain}_${nd.sym}`,
        kind: 'native',
        isNative: true,
        blockchain: nd.chain,
        networkName: nd.name,
        assetId: nd.assetId,
        contractAddress: null,
        decimals: nd.decimals,
        balance: bal,
        token: tokenObj
      });
    }

    // 2. Direct NEAR Chain NEP-141 Tokens (ft_balance_of on NEAR blockchain, e.g. prl.omft.near)
    const nearNep141Defs = [
      {
        sym: 'PRL',
        contract: 'prl.omft.near',
        assetId: '1cs_v1:near:nep141:prl.omft.near',
        name: 'NEAR Protocol (NEP-141 prl.omft.near)',
        decimals: 8
      },
      {
        sym: 'QTC',
        contract: 'qtc.omft.near',
        assetId: '1cs_v1:near:nep141:qtc.omft.near',
        name: 'NEAR Protocol',
        decimals: 12
      },
      {
        sym: 'USDT',
        contract: 'usdt.tether-token.near',
        assetId: 'nep141:usdt.tether-token.near',
        name: 'NEAR Protocol (NEP-141)',
        decimals: 6
      },
      {
        sym: 'USDC',
        contract: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        name: 'NEAR Protocol (NEP-141)',
        decimals: 6
      },
      {
        sym: 'ETH',
        contract: 'eth.omft.near',
        assetId: '1cs_v1:near:nep141:eth.omft.near',
        name: 'NEAR Protocol (NEP-141 eth.omft.near)',
        decimals: 18
      },
      {
        sym: 'SOL',
        contract: 'sol.omft.near',
        assetId: '1cs_v1:near:nep141:sol.omft.near',
        name: 'NEAR Protocol (NEP-141 sol.omft.near)',
        decimals: 9
      },
      {
        sym: 'BTC',
        contract: 'btc.omft.near',
        assetId: '1cs_v1:near:nep141:btc.omft.near',
        name: 'NEAR Protocol (NEP-141 btc.omft.near)',
        decimals: 8
      }
    ];

    for (const nd of nearNep141Defs) {
      const grp = ensureGroup(nd.sym);
      const tokenObj = {
        symbol: nd.sym,
        blockchain: 'near',
        assetId: nd.assetId,
        contractAddress: nd.contract,
        decimals: nd.decimals,
        networkName: nd.name
      };
      if (!grp.primaryToken) grp.primaryToken = tokenObj;
      const nepEntry = wallet.nearNep141Balances && wallet.nearNep141Balances[nd.contract];
      const bal = nepEntry && typeof nepEntry.formatted === 'number' && Number.isFinite(nepEntry.formatted)
        ? nepEntry.formatted
        : null;
      grp.entries.push({
        id: `nep141_${nd.contract}`,
        kind: 'nep141',
        isNative: false,
        blockchain: 'near',
        networkName: nd.name,
        assetId: nd.assetId,
        contractAddress: nd.contract,
        decimals: nd.decimals,
        balance: bal,
        token: tokenObj
      });
    }

    // 2b. Additional held NEAR NEP-141 ecosystem/LST tokens (e.g. RHEA, xRHEA, oRHEA, rNEAR, stNEAR, LiNEAR, NearX)
    const seenNearContracts = new Set(nearNep141Defs.map((x) => x.contract));
    const nearMetaLookup = {
      'token.rhealab.near': { sym: 'RHEA', decimals: 18 },
      'xtoken.rhealab.near': { sym: 'xRHEA', decimals: 18 },
      'otoken.rhealab.near': { sym: 'oRHEA', decimals: 18 },
      'lst.rhealab.near': { sym: 'rNEAR', decimals: 24 },
      'meta-pool.near': { sym: 'stNEAR', decimals: 24 },
      'linear-protocol.near': { sym: 'LiNEAR', decimals: 24 },
      'v2-nearx.stader-labs.near': { sym: 'NearX', decimals: 24 }
    };
    const allNearDexList = (tokens.DEX_CHAIN_TOKENS && tokens.DEX_CHAIN_TOKENS.near) || [];
    for (const dt of allNearDexList) {
      if (dt && dt.contractAddress && !nearMetaLookup[dt.contractAddress]) {
        nearMetaLookup[dt.contractAddress] = { sym: dt.symbol, decimals: dt.decimals || 18, token: dt };
      }
    }
    const allLiveNearList = Array.isArray(st.liveTokens) ? st.liveTokens : [];
    for (const lt of allLiveNearList) {
      if (lt && String(lt.blockchain || '').toLowerCase() === 'near' && lt.contractAddress && !nearMetaLookup[lt.contractAddress]) {
        nearMetaLookup[lt.contractAddress] = { sym: lt.symbol, decimals: typeof lt.decimals === 'number' ? lt.decimals : 18, token: lt };
      }
    }
    if (wallet.nearNep141Balances && typeof wallet.nearNep141Balances === 'object') {
      for (const [cid, nepEntry] of Object.entries(wallet.nearNep141Balances)) {
        if (!cid || seenNearContracts.has(cid) || cid === 'wrap.near') continue;
        const fmt = nepEntry && typeof nepEntry.formatted === 'number' && Number.isFinite(nepEntry.formatted)
          ? nepEntry.formatted
          : null;
        if (!(fmt > 0)) continue;
        seenNearContracts.add(cid);
        const info = nearMetaLookup[cid] || {};
        const sym = nepEntry.symbol || info.sym || (cid.split('.')[0] || 'NEAR').toUpperCase();
        const dec = typeof nepEntry.decimals === 'number' ? nepEntry.decimals : (info.decimals || 18);
        const grp = ensureGroup(sym);
        const tokenObj = info.token || {
          symbol: sym,
          blockchain: 'near',
          assetId: `nep141:${cid}`,
          contractAddress: cid,
          decimals: dec,
          logoURI: nepEntry.icon || undefined,
          networkName: 'NEAR Protocol'
        };
        if (!grp.primaryToken) grp.primaryToken = tokenObj;
        grp.entries.push({
          id: `nep141_${cid}`,
          kind: 'nep141',
          isNative: false,
          blockchain: 'near',
          networkName: 'NEAR Protocol',
          assetId: tokenObj.assetId || `nep141:${cid}`,
          contractAddress: cid,
          decimals: dec,
          balance: fmt,
          token: tokenObj
        });
      }
    }

    // 3. Solana SPL & EVM ERC-20 DEX Tokens
    const dexByChain = tokens.DEX_CHAIN_TOKENS || {};
    const nativeL1Symbols = new Set(['SOL', 'BTC', 'NEAR', 'PRL']);
    for (const [chainKey, list] of Object.entries(dexByChain)) {
      if (chainKey === 'near') continue;
      const chainNativeLoaded = Boolean(
        wallet.nativeBalances &&
        typeof wallet.nativeBalances[chainKey] === 'number' &&
        Number.isFinite(wallet.nativeBalances[chainKey])
      );
      for (const dt of list) {
        const isNativeSentinel = !dt.contractAddress ||
          dt.contractAddress === 'So11111111111111111111111111111111111111112' ||
          dt.contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        if (isNativeSentinel) continue;

        let bal = null;
        if (chainKey === 'sol') {
          const splVal = wallet.splBalances && wallet.splBalances[dt.contractAddress];
          if (typeof splVal === 'number' && Number.isFinite(splVal)) bal = splVal;
        } else {
          const ercVal = st.getWalletErc20Balance(wallet, chainKey, dt.contractAddress);
          if (typeof ercVal === 'number' && Number.isFinite(ercVal)) {
            bal = ercVal;
          } else if (chainNativeLoaded) {
            bal = 0;
          }
        }

        // Do not merge wrapped/bridged ERC-20/SPL tokens for native L1 symbols (SOL/BTC/NEAR/PRL) unless holding > 0
        const symUpper = String(dt.symbol || '').toUpperCase();
        if (nativeL1Symbols.has(symUpper) && !(typeof bal === 'number' && bal > 0)) {
          continue;
        }

        const grp = ensureGroup(dt.symbol);
        if (!grp.primaryToken) grp.primaryToken = dt;

        const matchedCore = (tokens.UNIFIED_CORE_TOKENS || []).find(
          (c) => c.blockchain === chainKey && String(c.symbol).toUpperCase() === String(dt.symbol).toUpperCase()
        );

        grp.entries.push({
          id: `token_${chainKey}_${dt.contractAddress}`,
          kind: 'token',
          isNative: false,
          blockchain: chainKey,
          networkName: dt.networkName || tokens.getChainMeta(chainKey).name,
          assetId: matchedCore ? matchedCore.assetId : dt.assetId,
          dexAssetId: dt.assetId,
          contractAddress: dt.contractAddress,
          decimals: dt.decimals,
          balance: bal,
          token: dt
        });
      }
    }

    return Array.from(groupsMap.values()).map((g) => {
      let hasAnyLoaded = false;
      let sum = 0;
      for (const e of g.entries) {
        if (typeof e.balance === 'number' && Number.isFinite(e.balance)) {
          hasAnyLoaded = true;
          sum += e.balance;
        }
      }
      g.totalBalance = hasAnyLoaded ? sum : null;
      g.totalUsd = (g.totalBalance !== null && g.price !== null) ? g.totalBalance * g.price : null;
      g.items = g.entries;
      return g;
    });
  }

  function buildAggregatedAssetGroups(wallet) {
    if (!wallet) return [];
    const allGroups = buildAllOnChainAssetGroups(wallet);
    const visibleGroups = [];

    for (const g of allGroups) {
      const hasPosBalance = typeof g.totalBalance === 'number' && g.totalBalance > 0;
      const isDefaultCore = DEFAULT_VISIBLE_SET.has(g.symbolKey);

      // Hide non-core tokens when total balance is 0 or unloaded
      if (!isDefaultCore && !hasPosBalance) {
        continue;
      }

      const positiveEntries = g.entries.filter((e) => typeof e.balance === 'number' && Number.isFinite(e.balance) && e.balance > 0);
      let visibleEntries;
      if (positiveEntries.length > 0) {
        visibleEntries = positiveEntries;
      } else if (isDefaultCore) {
        const primaryChain = PRIMARY_CHAIN_BY_DEFAULT_SYMBOL[g.symbolKey];
        const primaryEntry = g.entries.find((e) => e.isNative && e.blockchain === primaryChain)
          || g.entries.find((e) => e.blockchain === primaryChain)
          || g.entries[0];
        visibleEntries = primaryEntry ? [primaryEntry] : [];
      } else {
        visibleEntries = [];
      }

      if (visibleEntries.length === 0) continue;

      g.entries = visibleEntries;
      g.items = visibleEntries;
      g.primaryToken = visibleEntries[0].token || g.primaryToken;
      visibleGroups.push(g);
    }

    // Sort: positive-balance tokens first (USD desc, then balance desc), then default core order
    visibleGroups.sort((a, b) => {
      const posA = typeof a.totalBalance === 'number' && a.totalBalance > 0;
      const posB = typeof b.totalBalance === 'number' && b.totalBalance > 0;
      if (posA !== posB) return posA ? -1 : 1;
      if (posA && posB) {
        const usdA = a.totalUsd || 0;
        const usdB = b.totalUsd || 0;
        if (usdB !== usdA) return usdB - usdA;
        if (b.totalBalance !== a.totalBalance) return b.totalBalance - a.totalBalance;
      }
      const idxA = DEFAULT_VISIBLE_SYMBOLS.indexOf(a.symbolKey);
      const idxB = DEFAULT_VISIBLE_SYMBOLS.indexOf(b.symbolKey);
      if (idxA !== -1 || idxB !== -1) {
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    return visibleGroups;
  }

  function renderUnifiedAssetList() {
    const st = getState();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    const listEl = $('home-unified-asset-list');
    const heroUsdEl = $('hero-total-usd');
    if (!listEl || !wallet) return;

    const groups = buildAggregatedAssetGroups(wallet);

    // Compute Total Portfolio USD (strictly '--' if no prices/balances loaded)
    let anyUsd = false;
    let totalPortfolioUsd = 0;
    for (const g of groups) {
      if (typeof g.totalUsd === 'number' && Number.isFinite(g.totalUsd)) {
        anyUsd = true;
        totalPortfolioUsd += g.totalUsd;
      }
    }
    if (heroUsdEl) {
      heroUsdEl.textContent = anyUsd ? formatUsd(totalPortfolioUsd) : '--';
    }

    listEl.innerHTML = groups.map((g) => {
      const isExpanded = st.expandedSymbol === g.symbolKey;
      const parentIconHtml = tokens.renderTokenIconWithBadge(
        { symbol: g.symbol, blockchain: g.primaryToken ? g.primaryToken.blockchain : '' },
        38,
        false
      );

      // OKX-style home list: pure aggregated token balance without chain mini-pills
      const pillsHtml = '';

      const priceText = g.price !== null ? formatTokenPrice(g.price) : '--';
      const totalAmtText = formatBal(g.totalBalance, 5);
      const totalUsdText = g.totalUsd !== null ? formatUsd(g.totalUsd) : '--';

      let drawerHtml = '';
      if (isExpanded) {
        drawerHtml = `
          <div class="asset-drawer">
            ${g.entries.map((e) => {
              const iconHtml = tokens.renderTokenIconWithBadge(e.token, 28, true);
              const cleanNetName = e.blockchain ? (tokens.getChainMeta(e.blockchain)?.name || e.networkName) : e.networkName;
              const balStr = formatBal(e.balance, 6);
              return `
                <div class="asset-sub-row">
                  <div class="asset-sub-info">
                    ${iconHtml}
                    <div class="asset-sub-meta">
                      <span class="asset-sub-name">${escapeHtml(cleanNetName)}</span>
                    </div>
                  </div>
                  <div class="asset-sub-right">
                    <span class="asset-sub-bal">${escapeHtml(balStr)} ${escapeHtml(g.symbol)}</span>
                    <div class="asset-sub-actions">
                      <button type="button" class="mini-action-btn primary" data-action="quick-swap" data-stop="1" data-asset-id="${escapeHtml(e.assetId)}" data-chain="${escapeHtml(e.blockchain)}" data-contract="${escapeHtml(e.contractAddress || '')}">${t('闪兑', 'Swap')}</button>
                      <button type="button" class="mini-action-btn" data-action="quick-send" data-stop="1" data-symbol="${escapeHtml(g.symbol)}" data-chain="${escapeHtml(e.blockchain)}" data-asset-id="${escapeHtml(e.assetId)}" data-contract="${escapeHtml(e.contractAddress || '')}">${t('转账', 'Send')}</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      return `
        <div class="asset-group-card ${isExpanded ? 'expanded' : ''}">
          <button type="button" class="asset-parent-row" data-action="open-token-detail" data-symbol="${escapeHtml(g.symbolKey)}">
            <div class="asset-left">
              ${parentIconHtml}
              <div class="asset-title-block">
                <div class="asset-sym-row">
                  <span class="asset-symbol">${escapeHtml(g.symbol)}</span>
                  <span class="asset-price">${escapeHtml(priceText)}</span>
                </div>
                <div class="network-pills-row">${pillsHtml}</div>
              </div>
            </div>
            <div class="asset-right">
              <span class="asset-total-amt">${escapeHtml(totalAmtText)}</span>
              <span class="asset-total-usd">${escapeHtml(totalUsdText)}</span>
            </div>
          </button>
          ${drawerHtml}
        </div>
      `;
    }).join('');
  }

  function toggleAssetExpand(symbolKey) {
    const st = getState();
    st.expandedSymbol = st.expandedSymbol === symbolKey ? null : symbolKey;
    renderUnifiedAssetList();
  }

  function quickActionSwapFromEntry(assetId, blockchain, contractAddress) {
    const st = getState();
    const catalog = getSwapTokenCatalog();
    const idLower = String(assetId || '').toLowerCase();
    const contractLower = String(contractAddress || '').toLowerCase();
    const matched = catalog.find((x) =>
      String(x.assetId || '').toLowerCase() === idLower ||
      (x.blockchain === blockchain && contractLower && String(x.contractAddress || '').toLowerCase() === contractLower)
    );

    st.swap.fromAssetId = matched ? matched.assetId : assetId;
    if (st.swap.toAssetId === st.swap.fromAssetId) {
      st.swap.toAssetId = st.swap.fromAssetId === 'nep141:wrap.near'
        ? 'nep141:sol.omft.near'
        : 'nep141:wrap.near';
    }
    st.swap.recipientAddress = '';
    st.swap.quoteData = null;
    st.swap.amountOut = '';
    switchTab('swap');
  }

  function quickActionSendFromEntry(symbol, blockchain, assetId, contractAddress) {
    openSendSheet({ symbol, chainKey: blockchain, assetId, contractAddress });
  }

  // ==================== OKX-Style Token Detail Sheet & Activity ====================

  let _tokenDetailState = {
    symbolKey: '',
    chainFilter: 'all',
    historyLoading: false,
    historyItems: [],
    fetchSeq: 0
  };

  function recordWalletActivity(wallet, activity = {}) {
    if (!wallet || typeof wallet !== 'object') return null;
    const st = getState();
    if (!Array.isArray(wallet.activityHistory)) wallet.activityHistory = [];
    const entry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: String(activity.type || 'tx').toLowerCase(),
      symbol: String(activity.symbol || '').toUpperCase(),
      toSymbol: activity.toSymbol ? String(activity.toSymbol).toUpperCase() : '',
      chain: String(activity.chain || '').toLowerCase(),
      amount: activity.amount !== undefined && activity.amount !== null && Number.isFinite(Number(activity.amount))
        ? Number(activity.amount)
        : null,
      fee: activity.fee !== undefined && activity.fee !== null && Number.isFinite(Number(activity.fee))
        ? Number(activity.fee)
        : null,
      netAmount: activity.netAmount !== undefined && activity.netAmount !== null && Number.isFinite(Number(activity.netAmount))
        ? Number(activity.netAmount)
        : null,
      txHash: String(activity.txHash || '').trim(),
      title: String(activity.title || '').trim(),
      timestamp: Number.isFinite(Number(activity.timestamp)) ? Number(activity.timestamp) : Math.floor(Date.now() / 1000)
    };
    if (entry.txHash) {
      wallet.activityHistory = wallet.activityHistory.filter((x) => !(x && x.txHash === entry.txHash && x.type === entry.type));
    }
    wallet.activityHistory.unshift(entry);
    if (wallet.activityHistory.length > 100) {
      wallet.activityHistory = wallet.activityHistory.slice(0, 100);
    }
    if (st && typeof st.saveWallets === 'function') {
      st.saveWallets();
    }
    return entry;
  }

  function getExplorerAddressUrl(chainKey, addr) {
    const a = String(addr || '').trim();
    if (!a) return '';
    const enc = encodeURIComponent(a);
    const bc = String(chainKey || '').toLowerCase();
    if (bc === 'near') return `https://nearblocks.io/address/${enc}`;
    if (bc === 'prl') return `https://prlscan.com/address/${enc}`;
    if (bc === 'sol') return `https://solscan.io/account/${enc}`;
    if (bc === 'eth') return `https://etherscan.io/address/${enc}`;
    if (bc === 'base') return `https://basescan.org/address/${enc}`;
    if (bc === 'arb') return `https://arbiscan.io/address/${enc}`;
    if (bc === 'bsc') return `https://bscscan.com/address/${enc}`;
    if (bc === 'arc') return `https://explorer.arc.io/address/${enc}`;
    if (bc === 'hood') return `https://robinhoodchain.blockscout.com/address/${enc}`;
    if (bc === 'hype') return `https://purrsec.com/address/${enc}`;
    if (bc === 'btc') return `https://mempool.space/address/${enc}`;
    return '';
  }

  function getExplorerTxUrl(chainKey, txHash) {
    const h = String(txHash || '').trim();
    if (!h) return '';
    const enc = encodeURIComponent(h);
    const bc = String(chainKey || '').toLowerCase();
    if (bc === 'near') return `https://nearblocks.io/txns/${enc}`;
    if (bc === 'prl') return `https://prlscan.com/tx/${enc}`;
    if (bc === 'sol') return `https://solscan.io/tx/${enc}`;
    if (bc === 'eth') return `https://etherscan.io/tx/${enc}`;
    if (bc === 'base') return `https://basescan.org/tx/${enc}`;
    if (bc === 'arb') return `https://arbiscan.io/tx/${enc}`;
    if (bc === 'bsc') return `https://bscscan.com/tx/${enc}`;
    if (bc === 'arc') return `https://explorer.arc.io/tx/${enc}`;
    if (bc === 'hood') return `https://robinhoodchain.blockscout.com/tx/${enc}`;
    if (bc === 'hype') return `https://purrsec.com/tx/${enc}`;
    if (bc === 'btc') return `https://mempool.space/tx/${enc}`;
    return '';
  }

  function resolveTokenDetailGroup(wallet, symbolKey) {
    if (!wallet || !symbolKey) return null;
    const symUpper = String(symbolKey).toUpperCase();
    const groups = buildAllOnChainAssetGroups(wallet);
    return groups.find((g) => g.symbolKey === symUpper) || null;
  }

  function resolveTokenDetailActiveEntry(group, chainFilter) {
    if (!group || !Array.isArray(group.entries) || group.entries.length === 0) return null;
    const cf = String(chainFilter || 'all').toLowerCase();
    if (cf !== 'all') {
      const exact = group.entries.find((e) => e.blockchain === cf && typeof e.balance === 'number' && e.balance > 0);
      if (exact) return exact;
      const anyOnChain = group.entries.find((e) => e.blockchain === cf);
      if (anyOnChain) return anyOnChain;
    }
    const pos = group.entries.find((e) => typeof e.balance === 'number' && e.balance > 0);
    if (pos) return pos;
    const primaryChain = PRIMARY_CHAIN_BY_DEFAULT_SYMBOL[group.symbolKey];
    if (primaryChain) {
      const prim = group.entries.find((e) => e.blockchain === primaryChain);
      if (prim) return prim;
    }
    return group.entries[0];
  }

  function openTokenDetailSheet(symbolKey, chainFilter = 'all') {
    const st = getState();
    _tokenDetailState.symbolKey = String(symbolKey || '').toUpperCase();
    _tokenDetailState.chainFilter = String(chainFilter || 'all').toLowerCase();
    _tokenDetailState.historyLoading = true;
    _tokenDetailState.historyItems = [];
    renderTokenDetailSheet();
    openSheet('sheet-token-detail');
    fetchTokenDetailHistoryAsync();

    // Ensure staking/lending APYs are hydrated even if user hasn't opened Earn tab yet
    ensureStakingMetricsFresh(300_000);
  }

  function setTokenDetailChain(chainKey) {
    _tokenDetailState.chainFilter = String(chainKey || 'all').toLowerCase();
    _tokenDetailState.historyLoading = true;
    _tokenDetailState.historyItems = [];
    renderTokenDetailSheet();
    fetchTokenDetailHistoryAsync();
  }

  function openTokenDetailPool(poolId) {
    closeAllSheets();
    switchTab('earn');
    selectStakingPool(poolId);
  }

  function formatActivityTime(tsSec) {
    if (!tsSec || !Number.isFinite(Number(tsSec))) return '';
    try {
      const d = new Date(Number(tsSec) * 1000);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function formatFullActivityTime(tsSec) {
    if (!tsSec || !Number.isFinite(Number(tsSec))) return '--';
    try {
      const d = new Date(Number(tsSec) * 1000);
      if (Number.isNaN(d.getTime())) return '--';
      return d.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
      return '--';
    }
  }

  function formatRelativeActivityTime(tsSec) {
    if (!tsSec || !Number.isFinite(Number(tsSec))) return '';
    const diffSec = Math.floor(Date.now() / 1000) - Number(tsSec);
    if (diffSec < 0 || diffSec >= 86400) return formatActivityTime(tsSec);
    if (diffSec < 60) return t('刚刚', 'Just now');
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}${t('分钟前', 'm ago')}`;
    return `${Math.floor(diffSec / 3600)}${t('小时前', 'h ago')}`;
  }

  function formatTxConfirmBadgeText(it) {
    if (!it) return '';
    const conf = Number(it.confirmations);
    if (Number.isFinite(conf) && conf > 0) {
      return `${conf} ${t('确认', 'Conf')}`;
    }
    const statusLow = String(it.status || '').toLowerCase();
    if (statusLow === 'pending' || statusLow === 'unconfirmed') return t('待确认', 'Pending');
    if (statusLow === 'failed') return t('失败', 'Failed');
    if (statusLow === 'confirmed' || (it.blockHeight && Number(it.blockHeight) > 0)) return t('已确认', 'Confirmed');
    return '';
  }

  function resolveTxDisplayParts(it, fallbackSym = '') {
    const symKey = String(fallbackSym || it.symbol || '').toUpperCase();
    const fromSymUpper = String(it.symbol || symKey).toUpperCase();
    const toSymUpper = String(it.toSymbol || '').toUpperCase();
    const isSwapIn = it.type === 'swap' && symKey && toSymUpper === symKey && fromSymUpper !== symKey;
    const isSwapOut = it.type === 'swap' && !isSwapIn;
    const sign = (it.type === 'send' || it.type === 'stake' || isSwapOut)
      ? '-'
      : ((it.type === 'receive' || it.type === 'mine' || it.type === 'unstake' || isSwapIn) ? '+' : '');
    const amtColor = sign === '+'
      ? 'var(--near-emerald)'
      : (sign === '-' ? '#f8fafc' : 'var(--text-secondary)');
    const dirClass = it.type === 'failed'
      ? 'failed'
      : (sign === '-' ? (it.type === 'swap' ? 'swap' : 'send') : (sign === '+' ? 'receive' : 'swap'));
    const dirGlyph = it.type === 'failed' ? '✕' : (sign === '-' ? '↑' : (sign === '+' ? '↓' : '⇄'));
    const labelMap = {
      receive: t('收到', 'Receive'),
      send: t('发出', 'Send'),
      swap: t('闪兑', 'Swap'),
      stake: t('质押', 'Stake'),
      unstake: t('解质押', 'Unstake'),
      mine: t('挖矿收款', 'Mining Payout'),
      tx: t('链上交易', 'On-Chain'),
      failed: t('失败', 'Failed')
    };
    const label = labelMap[it.type] || labelMap.tx;
    const displayAmt = isSwapIn && typeof it.toAmount === 'number' && Number.isFinite(it.toAmount)
      ? it.toAmount
      : it.amount;
    const displaySym = isSwapIn && !(typeof it.toAmount === 'number' && Number.isFinite(it.toAmount))
      ? fromSymUpper
      : (symKey || fromSymUpper);
    const amtText = (typeof displayAmt === 'number' && Number.isFinite(displayAmt) && displayAmt > 0)
      ? (isSwapIn && displaySym !== symKey && symKey
          ? `${formatBal(displayAmt, 6)} ${displaySym} ➔ ${symKey}`
          : `${sign}${formatBal(displayAmt, 8)} ${displaySym}`)
      : '--';
    const pairLabel = it.type === 'swap' && toSymUpper ? `${fromSymUpper} ➔ ${toSymUpper}` : '';
    return { label, sign, amtColor, dirClass, dirGlyph, amtText, pairLabel };
  }

  function renderCompactTxPreviewHtml(items, sourceTag, fallbackSym = '') {
    return items.slice(0, 3).map((it, idx) => {
      const parts = resolveTxDisplayParts(it, fallbackSym);
      const confBadge = formatTxConfirmBadgeText(it);
      const relTime = formatRelativeActivityTime(it.timestamp);
      const tokens = getTokens();
      const chainMeta = it.chain && tokens ? tokens.getChainMeta(it.chain) : null;
      const netTag = chainMeta ? chainMeta.shortName : (it.chain ? it.chain.toUpperCase() : '');
      const titleLine = parts.pairLabel || it.title || parts.label;
      const subMeta = [netTag, titleLine !== parts.label ? titleLine : ''].filter(Boolean).join(' · ');
      return `
        <button type="button" class="tx-compact-row" data-action="open-tx-detail" data-tx-source="${escapeHtml(sourceTag)}" data-tx-idx="${idx}" data-tx-hash="${escapeHtml(it.txHash || '')}" data-chain="${escapeHtml(it.chain || '')}">
          <div class="flex items-center gap-2" style="min-width:0;flex:1;">
            <span class="tx-dir-circle ${parts.dirClass}">${parts.dirGlyph}</span>
            <div class="flex flex-col" style="min-width:0;flex:1;gap:2px;">
              <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                <span class="mono" style="font-size:12.5px;font-weight:700;color:${parts.amtColor};">${escapeHtml(parts.amtText)}</span>
                ${confBadge ? `<span class="tx-conf-pill">${escapeHtml(confBadge)}</span>` : ''}
              </div>
              <span class="mono" style="font-size:10.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(subMeta || parts.label)}</span>
            </div>
          </div>
          <div class="flex items-center gap-1" style="flex-shrink:0;">
            ${relTime ? `<span style="font-size:11px;color:var(--text-muted);">${escapeHtml(relTime)}</span>` : ''}
            <span style="font-size:13px;color:var(--text-muted);">›</span>
          </div>
        </button>
      `;
    }).join('');
  }

  function getMergedTokenHistoryItems(wallet, symKey, chainFilter, remoteOverride = null) {
    const localList = Array.isArray(wallet && wallet.activityHistory) ? wallet.activityHistory : [];
    const matchedLocal = localList
      .filter((item) => {
        if (!item) return false;
        const matchSym = String(item.symbol || '').toUpperCase() === symKey || String(item.toSymbol || '').toUpperCase() === symKey;
        if (!matchSym) return false;
        if (chainFilter !== 'all' && String(item.chain || '').toLowerCase() !== chainFilter) return false;
        return true;
      })
      .map((item) => ({ ...item, source: 'local' }));

    const remoteList = Array.isArray(remoteOverride)
      ? remoteOverride
      : (Array.isArray(_tokenDetailState.historyItems) ? _tokenDetailState.historyItems : []);
    const byKey = new Map();
    for (const item of matchedLocal) {
      const key = item.txHash ? `${item.txHash.toLowerCase()}_${item.chain || ''}` : item.id;
      if (!byKey.has(key)) byKey.set(key, item);
    }
    for (const remoteItem of remoteList) {
      const key = remoteItem.txHash ? `${remoteItem.txHash.toLowerCase()}_${remoteItem.chain || ''}` : remoteItem.id;
      const existing = byKey.get(key);
      if (existing) {
        // Remote on-chain fields override unconfirmed local drafts while keeping Swap metadata
        byKey.set(key, {
          ...existing,
          ...remoteItem,
          toSymbol: existing.toSymbol || remoteItem.toSymbol || '',
          toAmount: existing.toAmount ?? remoteItem.toAmount ?? null,
          source: remoteItem.source || 'onchain'
        });
      } else {
        byKey.set(key, remoteItem);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  }

  let _lastTokenDetailMergedItems = [];
  let _lastMiningNormalizedPayouts = [];
  let _txDetailFetchSeq = 0;

  function renderTokenDetailHistoryList() {
    const listEl = $('token-detail-history-list');
    const allBtn = $('token-detail-history-all-btn');
    if (!listEl) return;
    const st = getState();
    const wallet = st.getActiveWallet();
    const symKey = _tokenDetailState.symbolKey;
    const chainFilter = _tokenDetailState.chainFilter || 'all';
    if (!wallet || !symKey) {
      _lastTokenDetailMergedItems = [];
      if (allBtn) allBtn.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }

    const items = getMergedTokenHistoryItems(wallet, symKey, chainFilter);
    _lastTokenDetailMergedItems = items;
    if (allBtn) allBtn.classList.toggle('hidden', items.length === 0);

    if (_tokenDetailState.historyLoading && items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:8px 0;">${escapeHtml(t('正在加载链上交易记录...', 'Loading on-chain activity...'))}</div>`;
      return;
    }
    if (items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:8px 0;">${escapeHtml(t('暂无该代币链上变动记录，可点击右上方前往区块浏览器查看', 'No recent token activity found; click Explorer above to view on-chain'))}</div>`;
      return;
    }

    listEl.innerHTML = renderCompactTxPreviewHtml(items, 'token', symKey);
  }

  function openAllTokenHistorySheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const symKey = _tokenDetailState.symbolKey;
    const items = wallet && symKey
      ? getMergedTokenHistoryItems(wallet, symKey, _tokenDetailState.chainFilter || 'all')
      : _lastTokenDetailMergedItems;
    st.txModal.listTitle = symKey ? `${symKey} ${t('交易记录', 'Transactions')}` : t('交易记录', 'Transactions');
    st.txModal.items = Array.isArray(items) ? items : [];
    st.txModal.sourceSheetId = 'sheet-token-detail';
    renderTxHistorySheet();
    openSheet('sheet-tx-history');
  }

  function openAllMiningPayoutHistorySheet() {
    const st = getState();
    st.txModal.listTitle = t('挖矿打款记录', 'Mining Payouts');
    st.txModal.items = Array.isArray(_lastMiningNormalizedPayouts) ? _lastMiningNormalizedPayouts : [];
    st.txModal.sourceSheetId = 'sheet-mining-pro';
    renderTxHistorySheet();
    openSheet('sheet-tx-history');
  }

  function navigateBackFromTxHistory() {
    const target = getState().txModal?.sourceSheetId || 'sheet-token-detail';
    if (target) openSheet(target);
    else closeAllSheets();
  }

  function navigateBackFromTxDetail() {
    const target = getState().txModal?.detailBackSheetId || 'sheet-token-detail';
    if (target) openSheet(target);
    else closeAllSheets();
  }

  function renderTxHistorySheet() {
    const st = getState();
    const modal = st.txModal || {};
    const titleEl = $('tx-history-sheet-title');
    if (titleEl) titleEl.textContent = modal.listTitle || t('交易记录', 'Transactions');
    const listEl = $('tx-history-full-list');
    if (!listEl) return;

    const items = Array.isArray(modal.items) ? modal.items : [];
    if (items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:24px 0;">${escapeHtml(t('暂无交易记录', 'No transactions found'))}</div>`;
      return;
    }

    listEl.innerHTML = items.slice(0, 40).map((it, idx) => {
      const parts = resolveTxDisplayParts(it, it.symbol || _tokenDetailState.symbolKey || '');
      const confBadge = formatTxConfirmBadgeText(it);
      const timeStr = formatActivityTime(it.timestamp);
      const counterpartyAddr = String(it.counterparty || '').trim();
      const cpLabel = it.type === 'send' ? t('发送至', 'To') : t('收款地址', 'Address');
      const cpShort = counterpartyAddr ? shortenAddr(counterpartyAddr, 12, 12) : '';
      const txShort = it.txHash ? shortenAddr(it.txHash, 14, 12) : '';
      return `
        <div class="tx-card-full">
          <button type="button" class="tx-card-full-top" data-action="open-tx-detail" data-tx-source="modal" data-tx-idx="${idx}" data-tx-hash="${escapeHtml(it.txHash || '')}">
            <div class="flex items-center gap-2" style="min-width:0;flex:1;">
              <span class="tx-dir-circle ${parts.dirClass}">${parts.dirGlyph}</span>
              <div class="flex flex-col" style="min-width:0;">
                <span style="font-weight:700;font-size:13.5px;color:#fff;">${escapeHtml(parts.label)}</span>
                <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(timeStr || '--')}</span>
              </div>
            </div>
            <div class="flex items-center gap-2" style="flex-shrink:0;">
              <div class="flex flex-col" style="text-align:right;gap:2px;">
                <span class="mono" style="font-size:13px;font-weight:700;color:${parts.amtColor};">${escapeHtml(parts.amtText)}</span>
                ${confBadge ? `<span style="font-size:10.5px;color:var(--text-muted);">${escapeHtml(confBadge)}</span>` : ''}
              </div>
              <span style="font-size:14px;color:var(--text-muted);">›</span>
            </div>
          </button>
          ${counterpartyAddr ? `
            <div class="tx-meta-inline">
              <span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cpLabel)}: ${escapeHtml(cpShort)}</span>
              <button type="button" class="tx-copy-icon-btn" data-action="copy-text" data-val="${escapeHtml(counterpartyAddr)}" data-label="${escapeHtml(cpLabel)}">${escapeHtml(t('复制', 'Copy'))}</button>
            </div>
          ` : ''}
          ${it.txHash ? `
            <div class="tx-meta-inline">
              <span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t('交易 ID', 'Tx ID'))}: ${escapeHtml(txShort)}</span>
              <button type="button" class="tx-copy-icon-btn" data-action="copy-text" data-val="${escapeHtml(it.txHash)}" data-label="Tx ID">${escapeHtml(t('复制', 'Copy'))}</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  async function fetchChainTransactionDetailAsync(chainKey, txHash, wallet, fallbackItem = {}) {
    const cleanChain = String(chainKey || fallbackItem.chain || '').toLowerCase();
    const cleanHash = String(txHash || fallbackItem.txHash || '').trim();
    if (!cleanHash) return null;

    if (cleanChain === 'prl') {
      const myAddr = wallet && wallet.address ? wallet.address : '';
      let data = await fetchJsonWithTimeout(`https://api.prlscan.com/v1/txs/${encodeURIComponent(cleanHash)}`, {}, 6500);
      if (data && data.transaction) {
        const tx = data.transaction;
        const rawInputs = Array.isArray(data.inputs) ? data.inputs : [];
        const rawOutputs = Array.isArray(data.outputs) ? data.outputs : [];
        const inputs = rawInputs.map((inp) => ({
          address: inp.prev_address || '',
          amount: Number.isFinite(Number(inp.prev_value_grains)) ? Number(inp.prev_value_grains) / 1e8 : null,
          isMine: Boolean(myAddr && inp.prev_address === myAddr)
        }));
        const outputs = rawOutputs.map((out) => {
          const addr = out.address || (Array.isArray(out.addresses) && out.addresses[0]) || '';
          return {
            address: addr,
            amount: Number.isFinite(Number(out.value_grains)) ? Number(out.value_grains) / 1e8 : null,
            isMine: Boolean(myAddr && addr === myAddr)
          };
        });
        let mineIn = 0;
        let mineOut = 0;
        for (const inp of inputs) if (inp.isMine && inp.amount !== null) mineIn += inp.amount;
        for (const out of outputs) if (out.isMine && out.amount !== null) mineOut += out.amount;
        const netDelta = myAddr && (mineIn > 0 || mineOut > 0) ? (mineOut - mineIn) : (fallbackItem.netAmount ?? null);
        const tsNum = tx.confirmed_at ? Math.floor(Date.parse(tx.confirmed_at) / 1000) : (fallbackItem.timestamp || null);
        return {
          status: tx.status || (Number(tx.confirmations) > 0 ? 'confirmed' : 'pending'),
          confirmations: tx.confirmations ?? fallbackItem.confirmations ?? null,
          blockHeight: tx.block_height ?? fallbackItem.blockHeight ?? null,
          timestamp: Number.isFinite(tsNum) ? tsNum : null,
          outputTotal: Number.isFinite(Number(tx.output_grains)) ? Number(tx.output_grains) / 1e8 : null,
          fee: Number.isFinite(Number(tx.fee_grains)) ? Number(tx.fee_grains) / 1e8 : (fallbackItem.fee ?? null),
          netDelta,
          symbol: 'PRL',
          inputs,
          outputs
        };
      }
      // Fallback to Blockbook v2 tx lookup if prlscan v1 tx endpoint fails
      const contracts = getContracts();
      if (contracts && typeof contracts.pearlBlockbookRequest === 'function') {
        const bb = await contracts.pearlBlockbookRequest(`/api/v2/tx/${encodeURIComponent(cleanHash)}`).catch(() => null);
        if (bb && bb.txid) {
          const inputs = (bb.vin || []).map((v) => {
            const addr = (v.addresses && v.addresses[0]) || '';
            const amt = Number.isFinite(Number(v.value)) ? Number(v.value) / 1e8 : null;
            return { address: addr, amount: amt, isMine: Boolean(myAddr && addr === myAddr) };
          });
          const outputs = (bb.vout || []).map((o) => {
            const addr = (o.addresses && o.addresses[0]) || '';
            const amt = Number.isFinite(Number(o.value)) ? Number(o.value) / 1e8 : null;
            return { address: addr, amount: amt, isMine: Boolean(myAddr && addr === myAddr) };
          });
          let mineIn = 0;
          let mineOut = 0;
          for (const inp of inputs) if (inp.isMine && inp.amount !== null) mineIn += inp.amount;
          for (const out of outputs) if (out.isMine && out.amount !== null) mineOut += out.amount;
          const netDelta = myAddr && (mineIn > 0 || mineOut > 0) ? (mineOut - mineIn) : (fallbackItem.netAmount ?? null);
          return {
            status: Number(bb.confirmations) > 0 ? 'confirmed' : 'pending',
            confirmations: Number.isFinite(Number(bb.confirmations)) ? Number(bb.confirmations) : null,
            blockHeight: bb.blockHeight > 0 ? bb.blockHeight : null,
            timestamp: bb.blockTime || fallbackItem.timestamp || null,
            outputTotal: Number.isFinite(Number(bb.value)) ? Number(bb.value) / 1e8 : null,
            fee: Number.isFinite(Number(bb.fees)) ? Number(bb.fees) / 1e8 : (fallbackItem.fee ?? null),
            netDelta,
            symbol: 'PRL',
            inputs,
            outputs
          };
        }
      }
      return null;
    }

    if (cleanChain === 'btc') {
      const myBtc = wallet && wallet.btcAddress ? wallet.btcAddress : '';
      const tx = await fetchJsonWithTimeout(`https://mempool.space/api/tx/${encodeURIComponent(cleanHash)}`, {}, 6500);
      if (!tx || !tx.txid) return null;
      const inputs = (tx.vin || []).map((v) => {
        const addr = v?.prevout?.scriptpubkey_address || '';
        const amt = Number.isFinite(Number(v?.prevout?.value)) ? Number(v.prevout.value) / 1e8 : null;
        return { address: addr, amount: amt, isMine: Boolean(myBtc && addr === myBtc) };
      });
      const outputs = (tx.vout || []).map((o) => {
        const addr = o?.scriptpubkey_address || '';
        const amt = Number.isFinite(Number(o?.value)) ? Number(o.value) / 1e8 : null;
        return { address: addr, amount: amt, isMine: Boolean(myBtc && addr === myBtc) };
      });
      let mineIn = 0;
      let mineOut = 0;
      let totalOut = 0;
      for (const inp of inputs) if (inp.isMine && inp.amount !== null) mineIn += inp.amount;
      for (const out of outputs) {
        if (out.amount !== null) totalOut += out.amount;
        if (out.isMine && out.amount !== null) mineOut += out.amount;
      }
      return {
        status: tx.status && tx.status.confirmed ? 'confirmed' : 'pending',
        confirmations: tx.status && tx.status.confirmed ? 1 : 0,
        blockHeight: tx.status && tx.status.block_height ? tx.status.block_height : null,
        timestamp: tx.status && tx.status.block_time ? tx.status.block_time : (fallbackItem.timestamp || null),
        outputTotal: totalOut > 0 ? totalOut : null,
        fee: Number.isFinite(Number(tx.fee)) ? Number(tx.fee) / 1e8 : (fallbackItem.fee ?? null),
        netDelta: myBtc && (mineIn > 0 || mineOut > 0) ? (mineOut - mineIn) : (fallbackItem.netAmount ?? null),
        symbol: 'BTC',
        inputs,
        outputs
      };
    }

    return null;
  }

  function renderTxDetailSheet() {
    const body = $('tx-detail-body');
    if (!body) return;
    const st = getState();
    const modal = st.txModal || {};
    const it = modal.currentItem;
    if (!it) {
      body.innerHTML = '';
      return;
    }
    const detail = modal.detailData;
    const sym = String((detail && detail.symbol) || it.symbol || _tokenDetailState.symbolKey || '').toUpperCase();
    const statusRaw = String((detail && detail.status) || it.status || 'confirmed').toLowerCase();
    const isFailed = it.type === 'failed' || statusRaw === 'failed';
    const isPending = !isFailed && (statusRaw === 'pending' || statusRaw === 'unconfirmed');
    const statusCls = isFailed ? 'failed' : (isPending ? 'pending' : 'confirmed');
    const statusIcon = isFailed ? '✕' : (isPending ? '⏳' : '✓');
    const statusText = isFailed ? t('交易失败', 'Failed') : (isPending ? t('确认中', 'Pending') : t('已确认', 'Confirmed'));

    const confVal = detail && detail.confirmations !== null && detail.confirmations !== undefined
      ? String(detail.confirmations)
      : (it.confirmations !== null && it.confirmations !== undefined ? String(it.confirmations) : '--');
    const blockVal = detail && detail.blockHeight
      ? String(detail.blockHeight)
      : (it.blockHeight ? String(it.blockHeight) : '--');
    const timeVal = formatFullActivityTime((detail && detail.timestamp) || it.timestamp);
    const outTotalVal = detail && typeof detail.outputTotal === 'number' && Number.isFinite(detail.outputTotal)
      ? `${formatBal(detail.outputTotal, 8)} ${sym}`
      : null;
    const feeNum = detail && typeof detail.fee === 'number' && Number.isFinite(detail.fee)
      ? detail.fee
      : (typeof it.fee === 'number' && Number.isFinite(it.fee) ? it.fee : null);
    const feeVal = feeNum !== null ? `${formatBal(feeNum, 8)} ${sym}` : '--';

    let netDeltaNum = detail && typeof detail.netDelta === 'number' && Number.isFinite(detail.netDelta)
      ? detail.netDelta
      : (typeof it.netAmount === 'number' && Number.isFinite(it.netAmount) ? it.netAmount : null);
    if (netDeltaNum === null && typeof it.amount === 'number' && Number.isFinite(it.amount)) {
      if (it.type === 'send' || it.type === 'stake') netDeltaNum = -(it.amount + (feeNum || 0));
      else if (it.type === 'receive' || it.type === 'mine' || it.type === 'unstake') netDeltaNum = it.amount;
    }
    const netDeltaStr = netDeltaNum !== null
      ? `${netDeltaNum > 0 ? '+' : (netDeltaNum < 0 ? '-' : '')}${formatBal(Math.abs(netDeltaNum), 8)} ${sym}`
      : '--';
    const netCls = netDeltaNum !== null ? (netDeltaNum >= 0 ? 'text-emerald' : 'text-rose') : '';

    const rawUrl = it.txHash ? getExplorerTxUrl(it.chain, it.txHash) : '';
    const explorerUrl = isValidHttpsUrl(rawUrl) ? rawUrl : '';
    const loadingHint = modal.detailLoading
      ? `<div style="font-size:11px;color:var(--text-muted);text-align:center;">${escapeHtml(t('正在同步链上确认明细...', 'Syncing on-chain confirmation details...'))}</div>`
      : '';

    const renderIoSection = (titleText, rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return '';
      const rowHtml = rows.slice(0, 12).map((r) => `
        <div class="tx-io-row">
          <span class="mono" style="color:${r.isMine ? 'var(--near-emerald)' : 'var(--text-secondary)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">
            ${escapeHtml(shortenAddr(r.address || '--', 10, 8))}${r.isMine ? ` (${escapeHtml(t('本人', 'You'))})` : ''}
          </span>
          <span class="mono" style="font-weight:700;color:#fff;flex-shrink:0;">${r.amount !== null ? `${formatBal(r.amount, 8)} ${escapeHtml(sym)}` : '--'}</span>
        </div>
      `).join('');
      return `
        <div class="ios-glass-card flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span style="font-size:12.5px;font-weight:700;">${escapeHtml(titleText)}</span>
            <span class="mono" style="font-size:11.5px;color:var(--text-muted);">${rows.length}</span>
          </div>
          <div>${rowHtml}</div>
        </div>
      `;
    };

    body.innerHTML = `
      <div class="ios-glass-card flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <span class="tx-status-pill ${statusCls}">
            <span class="tx-dir-circle ${isFailed ? 'failed' : (isPending ? 'send' : 'receive')}" style="width:22px;height:22px;font-size:11px;">${statusIcon}</span>
            <span>${escapeHtml(statusText)}</span>
          </span>
          ${explorerUrl ? `<a id="tx-detail-explorer-link" href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener noreferrer" class="btn-ghost-sm" style="color:var(--cyan-glow);text-decoration:none;">${escapeHtml(t('↗ 区块浏览器', '↗ Explorer'))}</a>` : ''}
        </div>
        ${it.txHash ? `
          <div class="flex flex-col gap-1">
            <span style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(t('交易 ID', 'Transaction ID'))}</span>
            <div class="mono" style="font-size:12px;word-break:break-all;color:#f8fafc;line-height:1.45;">${escapeHtml(it.txHash)}</div>
            <div>
              <button type="button" class="btn-ghost-sm" style="margin-top:4px;padding-left:0;color:var(--cyan-glow);" data-action="copy-text" data-val="${escapeHtml(it.txHash)}" data-label="Tx ID">${escapeHtml(t('复制交易 ID', 'Copy Tx ID'))}</button>
            </div>
          </div>
        ` : ''}
      </div>
      ${loadingHint}
      <div class="ios-glass-card meta-list">
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('确认数', 'Confirmations'))}</span><span class="meta-val mono">${escapeHtml(confVal)}</span></div>
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('区块', 'Block'))}</span><span class="meta-val mono">${escapeHtml(blockVal)}</span></div>
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('时间', 'Time'))}</span><span class="meta-val mono">${escapeHtml(timeVal)}</span></div>
        ${outTotalVal ? `<div class="meta-row"><span class="meta-key">${escapeHtml(t('输出总额', 'Total Output'))}</span><span class="meta-val mono">${escapeHtml(outTotalVal)}</span></div>` : ''}
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('网络手续费', 'Network Fee'))}</span><span class="meta-val mono">${escapeHtml(feeVal)}</span></div>
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('你的地址净收支', 'Your Net Change'))}</span><span class="meta-val mono ${netCls}" style="font-weight:800;">${escapeHtml(netDeltaStr)}</span></div>
      </div>
      ${detail ? renderIoSection(t('输入', 'Inputs'), detail.inputs) : ''}
      ${detail ? renderIoSection(t('输出', 'Outputs'), detail.outputs) : ''}
    `;
  }

  function openTxDetailSheet(txItem, backSheetId = 'sheet-token-detail') {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!txItem) return;
    st.txModal.currentItem = txItem;
    st.txModal.detailBackSheetId = backSheetId || 'sheet-token-detail';
    st.txModal.detailData = null;
    st.txModal.detailLoading = Boolean(txItem.txHash && (txItem.chain === 'prl' || txItem.chain === 'btc'));
    renderTxDetailSheet();
    openSheet('sheet-tx-detail');

    const seq = ++_txDetailFetchSeq;
    if (st.txModal.detailLoading) {
      fetchChainTransactionDetailAsync(txItem.chain, txItem.txHash, wallet, txItem)
        .then((res) => {
          if (seq !== _txDetailFetchSeq) return;
          st.txModal.detailLoading = false;
          if (res) st.txModal.detailData = res;
          renderTxDetailSheet();
        })
        .catch(() => {
          if (seq !== _txDetailFetchSeq) return;
          st.txModal.detailLoading = false;
          renderTxDetailSheet();
        });
    }
  }

  function renderTokenDetailSheet() {
    const st = getState();
    const tokens = getTokens();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !_tokenDetailState.symbolKey) return;

    const group = resolveTokenDetailGroup(wallet, _tokenDetailState.symbolKey);
    if (!group) return;

    const symKey = group.symbolKey;
    const validChains = new Set(group.entries.map((e) => e.blockchain));
    let chainFilter = _tokenDetailState.chainFilter || 'all';
    if (chainFilter !== 'all' && !validChains.has(chainFilter)) {
      chainFilter = 'all';
      _tokenDetailState.chainFilter = 'all';
    }

    const activeEntry = resolveTokenDetailActiveEntry(group, chainFilter);
    const activeChain = chainFilter !== 'all'
      ? chainFilter
      : (activeEntry ? activeEntry.blockchain : 'near');

    const iconEl = $('token-detail-icon');
    if (iconEl) {
      iconEl.innerHTML = tokens.renderTokenIconWithBadge(
        { symbol: group.symbol, blockchain: activeChain },
        30,
        chainFilter !== 'all'
      );
    }
    const titleEl = $('token-detail-title');
    if (titleEl) {
      titleEl.textContent = group.symbol;
    }

    // Build per-chain summary pills
    const chainTotals = new Map();
    for (const e of group.entries) {
      const bc = e.blockchain;
      if (!chainTotals.has(bc)) {
        chainTotals.set(bc, { blockchain: bc, balance: null });
      }
      if (typeof e.balance === 'number' && Number.isFinite(e.balance)) {
        const cur = chainTotals.get(bc);
        cur.balance = (cur.balance === null ? 0 : cur.balance) + e.balance;
      }
    }

    const chainsEl = $('token-detail-chains');
    if (chainsEl) {
      const allPill = `<button type="button" class="filter-pill ${chainFilter === 'all' ? 'active' : ''}" data-action="set-token-detail-chain" data-chain="all">${escapeHtml(t('全部网络', 'All Networks'))}</button>`;
      const netPills = Array.from(chainTotals.values()).map((ct) => {
        const meta = tokens.getChainMeta(ct.blockchain);
        const balSuffix = typeof ct.balance === 'number' && ct.balance > 0 ? ` · ${formatBal(ct.balance, 4)}` : '';
        return `<button type="button" class="filter-pill ${chainFilter === ct.blockchain ? 'active' : ''}" data-action="set-token-detail-chain" data-chain="${escapeHtml(ct.blockchain)}">${escapeHtml((meta.shortName || meta.name) + balSuffix)}</button>`;
      }).join('');
      chainsEl.innerHTML = allPill + netPills;
    }

    // Compute balance & USD for active scope
    const scopedEntries = chainFilter === 'all'
      ? group.entries
      : group.entries.filter((e) => e.blockchain === chainFilter);
    let anyLoaded = false;
    let balSum = 0;
    for (const e of scopedEntries) {
      if (typeof e.balance === 'number' && Number.isFinite(e.balance)) {
        anyLoaded = true;
        balSum += e.balance;
      }
    }
    const displayBal = anyLoaded ? balSum : null;
    const displayUsd = (displayBal !== null && group.price !== null) ? displayBal * group.price : null;

    if ($('token-detail-balance')) $('token-detail-balance').textContent = displayBal !== null ? formatBal(displayBal, 6) : '--';
    if ($('token-detail-usd')) $('token-detail-usd').textContent = displayUsd !== null ? formatUsd(displayUsd) : '--';

    const recvAddr = getWalletDefaultRecipientForChain(wallet, activeChain) || '';
    const addrRowEl = $('token-detail-addr-row');
    if (addrRowEl) {
      if (chainFilter === 'all') {
        addrRowEl.classList.add('hidden');
      } else {
        addrRowEl.classList.remove('hidden');
      }
    }
    if ($('token-detail-addr')) $('token-detail-addr').textContent = recvAddr || '--';

    const explorerEl = $('token-detail-explorer-link');
    if (explorerEl) {
      const url = getExplorerAddressUrl(activeChain, recvAddr);
      explorerEl.href = isValidHttpsUrl(url) ? url : '#';
    }

    // Per-chain breakdown card
    const breakdownCard = $('token-detail-breakdown-card');
    const breakdownList = $('token-detail-breakdown-list');
    if (breakdownCard && breakdownList) {
      if (chainFilter === 'all') {
        breakdownCard.classList.remove('hidden');
        const sortedEntries = [...group.entries].sort((a, b) => {
          const ba = typeof a.balance === 'number' ? a.balance : -1;
          const bb = typeof b.balance === 'number' ? b.balance : -1;
          return bb - ba;
        });
        breakdownList.innerHTML = sortedEntries.map((e) => {
          const meta = tokens.getChainMeta(e.blockchain);
          const cleanNetName = meta.name || e.networkName;
          const balStr = formatBal(e.balance, 6);
          return `
            <div class="detail-row-item">
              <div class="flex items-center gap-2" style="min-width:0;flex:1;">
                ${tokens.renderTokenIconWithBadge(e.token, 28, true)}
                <div class="flex flex-col" style="min-width:0;">
                  <span style="font-weight:700;font-size:12.5px;color:#fff;">${escapeHtml(cleanNetName)}</span>
                  <span class="mono" style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(balStr)} ${escapeHtml(group.symbol)}</span>
                </div>
              </div>
              <div class="flex gap-1" style="flex-shrink:0;">
                <button type="button" class="mini-action-btn primary" data-action="detail-swap" data-asset-id="${escapeHtml(e.assetId)}" data-chain="${escapeHtml(e.blockchain)}" data-contract="${escapeHtml(e.contractAddress || '')}">${escapeHtml(t('闪兑', 'Swap'))}</button>
                <button type="button" class="mini-action-btn" data-action="detail-send" data-symbol="${escapeHtml(group.symbol)}" data-chain="${escapeHtml(e.blockchain)}" data-asset-id="${escapeHtml(e.assetId)}" data-contract="${escapeHtml(e.contractAddress || '')}">${escapeHtml(t('转账', 'Send'))}</button>
              </div>
            </div>
          `;
        }).join('');
      } else {
        breakdownCard.classList.add('hidden');
        breakdownList.innerHTML = '';
      }
    }

    // Earn / Staking / Lending section matching this token
    const earnCard = $('token-detail-earn-card');
    const earnList = $('token-detail-earn-list');
    if (earnCard && earnList) {
      const allPools = (st.staking && st.staking.pools) || (contracts && contracts.STAKING_POOLS) || [];
      const matchedPools = allPools.filter((p) => {
        if (!p) return false;
        const symMatch = String(p.inSymbol || '').toUpperCase() === symKey || String(p.outSymbol || '').toUpperCase() === symKey;
        if (!symMatch) return false;
        if (chainFilter !== 'all' && String(p.chain || '').toLowerCase() !== chainFilter) return false;
        return true;
      });

      if (matchedPools.length > 0) {
        earnCard.classList.remove('hidden');
        const stakingPools = matchedPools.filter((p) => !p.isErc4626 && !p.isAaveV3 && !p.isLockConvert && !p.isBurrowSupply);
        const earnLendingPools = matchedPools.filter((p) => p.isErc4626 || p.isAaveV3 || p.isLockConvert || p.isBurrowSupply);

        const renderPoolRows = (poolList) => poolList.map((p) => {
          const catMeta = getPoolCategoryMeta(p);
          return `
            <button type="button" class="detail-row-item detail-row-clickable" data-action="open-token-detail-pool" data-pool-id="${escapeHtml(p.id)}">
              <div class="flex items-center gap-2" style="min-width:0;flex:1;">
                ${tokens.renderTokenIconWithBadge({ symbol: p.outSymbol, blockchain: p.chain, logoURI: getPoolIconUrl(p) }, 26, true)}
                <div class="flex flex-col" style="min-width:0;">
                  <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                    <span style="font-weight:700;font-size:12.5px;color:#fff;">${escapeHtml(p.name)}</span>
                    <span class="pool-cat-badge ${catMeta.cls}">${escapeHtml(catMeta.label)}</span>
                  </div>
                  <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(p.protocol || p.chainLabel || '')} · ${escapeHtml(p.inSymbol)} ➔ ${escapeHtml(p.outSymbol)}</span>
                </div>
              </div>
              <span class="mono text-emerald" style="font-weight:800;font-size:13px;flex-shrink:0;">${escapeHtml(formatPoolApyText(p))}</span>
            </button>
          `;
        }).join('');

        const cards = [];
        if (stakingPools.length > 0) {
          cards.push(`
            <div class="ios-glass-card flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span style="font-weight:700;font-size:13px;color:#fff;">⚡ ${escapeHtml(t('链上质押 (Staking)', 'Staking'))}</span>
                <span class="pool-cat-badge cat-staking">${escapeHtml(t('质押', 'Staking'))}</span>
              </div>
              <div class="flex flex-col gap-2">${renderPoolRows(stakingPools)}</div>
            </div>
          `);
        }
        if (earnLendingPools.length > 0) {
          cards.push(`
            <div class="ios-glass-card flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span style="font-weight:700;font-size:13px;color:#fff;">🏦 ${escapeHtml(t('借贷与存款生息 (Lending & Earn)', 'Lending & Earn'))}</span>
                <span class="pool-cat-badge cat-lending">${escapeHtml(t('借贷', 'Lending'))}</span>
              </div>
              <div class="flex flex-col gap-2">${renderPoolRows(earnLendingPools)}</div>
            </div>
          `);
        }
        earnList.innerHTML = cards.join('');
      } else {
        earnCard.classList.add('hidden');
        earnList.innerHTML = '';
      }
    }

    // Bottom live price bar
    if ($('token-detail-price-label')) {
      $('token-detail-price-label').textContent = `${group.symbol} ${t('实时参考价', 'Live Price')}`;
    }
    if ($('token-detail-price-val')) {
      $('token-detail-price-val').textContent = group.price !== null ? formatTokenPrice(group.price) : '--';
    }

    renderTokenDetailHistoryList();
  }

  function tokenDetailAction(actionType) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet || !_tokenDetailState.symbolKey) return;
    const group = resolveTokenDetailGroup(wallet, _tokenDetailState.symbolKey);
    if (!group) return;
    const entry = resolveTokenDetailActiveEntry(group, _tokenDetailState.chainFilter);
    if (!entry) return;

    const act = String(actionType || '').toLowerCase();
    if (act === 'send') {
      quickActionSendFromEntry(group.symbol, entry.blockchain, entry.assetId, entry.contractAddress || '');
      return;
    }
    if (act === 'receive') {
      const bc = String(entry.blockchain || 'near').toLowerCase();
      const receiveNet = ['eth', 'base', 'arb', 'bsc', 'op', 'pol', 'avax', 'hype', 'hood'].includes(bc) ? 'evm' : bc;
      closeAllSheets();
      openReceiveSheet(receiveNet);
      return;
    }
    if (act === 'swap' || act === 'bridge') {
      closeAllSheets();
      quickActionSwapFromEntry(entry.assetId, entry.blockchain, entry.contractAddress || '');
      if (act === 'bridge') {
        const catalog = getSwapTokenCatalog();
        const alt = catalog.find((c) =>
          c &&
          String(c.symbol || '').toUpperCase() === group.symbolKey &&
          String(c.blockchain || '').toLowerCase() !== String(entry.blockchain || '').toLowerCase()
        ) || catalog.find((c) => c && String(c.blockchain || '').toLowerCase() !== String(entry.blockchain || '').toLowerCase());
        if (alt) {
          st.swap.toAssetId = alt.assetId;
          st.swap.recipientAddress = '';
          renderSwapView();
        }
      }
    }
  }

  function copyTokenDetailAddress() {
    const st = getState();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet || !_tokenDetailState.symbolKey) return;
    const group = resolveTokenDetailGroup(wallet, _tokenDetailState.symbolKey);
    const entry = group ? resolveTokenDetailActiveEntry(group, _tokenDetailState.chainFilter) : null;
    const activeChain = _tokenDetailState.chainFilter !== 'all'
      ? _tokenDetailState.chainFilter
      : (entry ? entry.blockchain : 'near');
    const addr = getWalletDefaultRecipientForChain(wallet, activeChain);
    if (addr) {
      const meta = tokens.getChainMeta(activeChain);
      copyText(addr, `${meta.shortName || activeChain.toUpperCase()} ${t('收款地址', 'Address')}`);
    }
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 6000) {
    if (typeof fetch !== 'function') return null;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const resp = await fetch(url, controller ? { ...options, signal: controller.signal } : options);
      if (!resp || !resp.ok) return null;
      return await resp.json();
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchTokenDetailHistoryAsync() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const symKey = _tokenDetailState.symbolKey;
    const chainFilter = _tokenDetailState.chainFilter || 'all';
    if (!wallet || !symKey) return;

    const group = resolveTokenDetailGroup(wallet, symKey);
    if (!group) return;

    const seq = ++_tokenDetailState.fetchSeq;
    _tokenDetailState.historyLoading = true;
    renderTokenDetailHistoryList();

    const targetChains = chainFilter !== 'all'
      ? [chainFilter]
      : Array.from(new Set(group.entries.map((e) => e.blockchain)));

    const nearId = wallet.nearNamedAccount || wallet.nearAddress || '';
    const nearContracts = new Set(
      group.entries
        .filter((e) => e.blockchain === 'near' && e.contractAddress)
        .map((e) => String(e.contractAddress).toLowerCase())
    );
    const nearDecByContract = new Map(
      group.entries
        .filter((e) => e.blockchain === 'near' && e.contractAddress)
        .map((e) => [String(e.contractAddress).toLowerCase(), e.decimals || 8])
    );

    const tasks = [];

    if (targetChains.includes('near') && nearId) {
      if (symKey !== 'NEAR') {
        tasks.push((async () => {
          const data = await fetchJsonWithTimeout(`https://api.nearblocks.io/v1/account/${encodeURIComponent(nearId)}/ft-txns?per_page=12`);
          const txns = Array.isArray(data && data.txns) ? data.txns : [];
          const out = [];
          for (const tx of txns) {
            const ftSym = String((tx.ft && tx.ft.symbol) || (tx.ft_meta && tx.ft_meta.symbol) || '').toUpperCase();
            const contractId = String(tx.contract || tx.affected_account_id || '').toLowerCase();
            if (ftSym !== symKey && !nearContracts.has(contractId)) continue;
            const dec = Number((tx.ft && tx.ft.decimals) || nearDecByContract.get(contractId) || 8);
            const deltaNum = Number(tx.delta_amount || 0);
            const isIn = deltaNum >= 0;
            const amtVal = Number.isFinite(deltaNum) ? Math.abs(deltaNum) / (10 ** dec) : null;
            const ts = tx.block_timestamp ? Math.floor(Number(tx.block_timestamp) / 1e9) : null;
            out.push({
              id: `nb_ft_${tx.transaction_hash}`,
              type: isIn ? 'receive' : 'send',
              symbol: symKey,
              chain: 'near',
              amount: amtVal,
              txHash: tx.transaction_hash || '',
              title: tx.involved_account_id ? `${isIn ? t('来自', 'From') : t('发送至', 'To')} ${shortenAddr(tx.involved_account_id)}` : 'NEAR NEP-141',
              timestamp: ts
            });
          }
          return out;
        })());
      }

      tasks.push((async () => {
        const data = await fetchJsonWithTimeout(`https://api.nearblocks.io/v1/account/${encodeURIComponent(nearId)}/txns?per_page=12`);
        const txns = Array.isArray(data && data.txns) ? data.txns : [];
        const out = [];
        for (const tx of txns) {
          const actions = Array.isArray(tx.actions) ? tx.actions : [];
          const methods = actions.map((a) => String(a && a.method || '').toLowerCase()).filter(Boolean);
          let type = '';
          let title = '';
          if (methods.includes('deposit_and_stake') || methods.includes('stake')) {
            if (symKey !== 'NEAR') continue;
            type = 'stake';
            title = tx.receiver_account_id || 'NEAR Stake';
          } else if (methods.includes('unstake') || methods.includes('unstake_all') || methods.includes('withdraw_all')) {
            if (symKey !== 'NEAR') continue;
            type = 'unstake';
            title = tx.receiver_account_id || 'NEAR Unstake';
          } else if (methods.includes('ft_transfer_call') || methods.includes('swap')) {
            if (symKey !== 'NEAR' && !nearContracts.has(String(tx.receiver_account_id || '').toLowerCase())) continue;
            type = 'swap';
            title = tx.receiver_account_id || 'NEAR Swap';
          } else if (symKey === 'NEAR') {
            const isOut = String(tx.signer_account_id || '').toLowerCase() === nearId.toLowerCase();
            type = isOut ? 'send' : 'receive';
            title = isOut
              ? `${t('至', 'To')} ${shortenAddr(tx.receiver_account_id)}`
              : `${t('来自', 'From')} ${shortenAddr(tx.signer_account_id)}`;
          } else {
            continue;
          }
          const depRaw = tx.actions_agg && tx.actions_agg.deposit ? Number(tx.actions_agg.deposit) : 0;
          const amtVal = symKey === 'NEAR' && Number.isFinite(depRaw) && depRaw > 0 ? depRaw / 1e24 : null;
          const ts = tx.block_timestamp ? Math.floor(Number(tx.block_timestamp) / 1e9) : null;
          out.push({
            id: `nb_tx_${tx.transaction_hash}`,
            type,
            symbol: symKey,
            chain: 'near',
            amount: amtVal,
            txHash: tx.transaction_hash || '',
            title,
            timestamp: ts
          });
        }
        return out;
      })());
    }

    if (targetChains.includes('prl') && wallet.address) {
      tasks.push((async () => {
        const data = await fetchJsonWithTimeout(`https://api.prlscan.com/v1/addresses/${encodeURIComponent(wallet.address)}/txs?limit=25`);
        const txs = Array.isArray(data) ? data : (Array.isArray(data && data.txs) ? data.txs : (Array.isArray(data && data.items) ? data.items : []));
        return txs.map((tx) => {
          const deltaGrains = Number(tx.delta_grains || 0);
          const feeGrains = Number(tx.fee_grains || 0);
          const delta = deltaGrains / 1e8;
          const feePrl = Number.isFinite(feeGrains) && feeGrains > 0 ? feeGrains / 1e8 : null;
          const isCoinbase = Boolean(tx.is_coinbase);
          const type = delta >= 0 ? 'receive' : 'send';
          const displayAmt = type === 'send' && feePrl !== null && Math.abs(delta) > feePrl
            ? (Math.abs(delta) - feePrl)
            : Math.abs(delta);
          const rawTime = tx.time !== undefined ? tx.time : (tx.timestamp !== undefined ? tx.timestamp : tx.block_time);
          const tsNum = typeof rawTime === 'number'
            ? (rawTime > 1e12 ? Math.floor(rawTime / 1000) : rawTime)
            : (rawTime ? Math.floor(Date.parse(rawTime) / 1000) : null);
          return {
            id: `prl_${tx.txid || tx.hash}`,
            type,
            symbol: 'PRL',
            chain: 'prl',
            amount: Number.isFinite(displayAmt) ? displayAmt : null,
            netAmount: Number.isFinite(delta) ? delta : null,
            fee: feePrl,
            blockHeight: tx.block_height ?? null,
            confirmations: tx.confirmations ?? null,
            status: tx.status || 'confirmed',
            txHash: tx.txid || tx.hash || '',
            title: tx.type_label || (isCoinbase ? t('区块挖矿奖励', 'Mining Reward') : t('Pearl L1 转账', 'Pearl L1 Transfer')),
            timestamp: Number.isFinite(tsNum) ? tsNum : null
          };
        });
      })());
    }

    if (targetChains.includes('sol') && wallet.solAddress) {
      tasks.push((async () => {
        const data = await fetchJsonWithTimeout('https://solana-rpc.publicnode.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [wallet.solAddress, { limit: 10 }]
          })
        });
        const sigs = Array.isArray(data && data.result) ? data.result : [];
        return sigs.map((s) => ({
          id: `sol_${s.signature}`,
          type: s.err ? 'failed' : 'tx',
          symbol: symKey,
          chain: 'sol',
          amount: null,
          txHash: s.signature || '',
          title: s.err ? t('Solana 交易失败', 'Solana Tx Failed') : t('Solana 链上交易', 'Solana Transaction'),
          timestamp: s.blockTime || null
        }));
      })());
    }

    const BLOCKSCOUT_BASES = {
      eth: 'https://eth.blockscout.com',
      base: 'https://base.blockscout.com',
      arb: 'https://arbitrum.blockscout.com',
      op: 'https://optimism.blockscout.com',
      pol: 'https://polygon.blockscout.com',
      arc: 'https://explorer.arc.io'
    };
    const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
    if (evmAddr) {
      for (const [evmChain, baseUrl] of Object.entries(BLOCKSCOUT_BASES)) {
        if (!targetChains.includes(evmChain)) continue;
        tasks.push((async () => {
          const isNativeOnChain = (evmChain === 'arc' && symKey === 'USDC') || (['eth', 'base', 'arb', 'op'].includes(evmChain) && symKey === 'ETH') || (evmChain === 'pol' && symKey === 'POL');
          const endpoint = isNativeOnChain
            ? `${baseUrl}/api/v2/addresses/${encodeURIComponent(evmAddr)}/transactions`
            : `${baseUrl}/api/v2/addresses/${encodeURIComponent(evmAddr)}/token-transfers`;
          const data = await fetchJsonWithTimeout(endpoint);
          const items = Array.isArray(data && data.items) ? data.items : [];
          const addrLower = evmAddr.toLowerCase();
          const out = [];
          for (const it of items) {
            if (!isNativeOnChain) {
              const tokSym = String(it.token && it.token.symbol || '').toUpperCase();
              if (tokSym !== symKey) continue;
              const dec = Number((it.token && it.token.decimals) || (it.total && it.total.decimals) || 18);
              const rawVal = Number((it.total && it.total.value) || 0);
              const fromHash = String(it.from && it.from.hash || '').toLowerCase();
              const isIn = fromHash !== addrLower;
              out.push({
                id: `${evmChain}_tok_${it.tx_hash || it.transaction_hash}_${out.length}`,
                type: isIn ? 'receive' : 'send',
                symbol: symKey,
                chain: evmChain,
                amount: Number.isFinite(rawVal) ? rawVal / (10 ** dec) : null,
                txHash: it.tx_hash || it.transaction_hash || '',
                title: isIn ? `${t('来自', 'From')} ${shortenAddr(it.from && it.from.hash)}` : `${t('至', 'To')} ${shortenAddr(it.to && it.to.hash)}`,
                timestamp: it.timestamp ? Math.floor(Date.parse(it.timestamp) / 1000) : null
              });
            } else {
              const fromHash = String(it.from && it.from.hash || '').toLowerCase();
              const isIn = fromHash !== addrLower;
              const valNative = Number(it.value || 0) / 1e18;
              out.push({
                id: `${evmChain}_tx_${it.hash}`,
                type: isIn ? 'receive' : 'send',
                symbol: symKey,
                chain: evmChain,
                amount: Number.isFinite(valNative) ? valNative : null,
                txHash: it.hash || '',
                title: isIn ? `${t('来自', 'From')} ${shortenAddr(it.from && it.from.hash)}` : `${t('至', 'To')} ${shortenAddr(it.to && it.to.hash)}`,
                timestamp: it.timestamp ? Math.floor(Date.parse(it.timestamp) / 1000) : null
              });
            }
          }
          return out;
        })());
      }
    }

    if (targetChains.includes('btc') && wallet.btcAddress) {
      tasks.push((async () => {
        const txs = await fetchJsonWithTimeout(`https://mempool.space/api/address/${encodeURIComponent(wallet.btcAddress)}/txs`);
        if (!Array.isArray(txs)) return [];
        const addr = wallet.btcAddress;
        return txs.slice(0, 12).map((tx) => {
          let receivedSats = 0;
          let spentSats = 0;
          for (const vout of (tx.vout || [])) {
            if (vout && vout.scriptpubkey_address === addr) receivedSats += Number(vout.value || 0);
          }
          for (const vin of (tx.vin || [])) {
            if (vin && vin.prevout && vin.prevout.scriptpubkey_address === addr) spentSats += Number(vin.prevout.value || 0);
          }
          const netSats = receivedSats - spentSats;
          const isIn = netSats >= 0;
          return {
            id: `btc_${tx.txid}`,
            type: isIn ? 'receive' : 'send',
            symbol: 'BTC',
            chain: 'btc',
            amount: Math.abs(netSats) / 1e8,
            txHash: tx.txid || '',
            title: tx.status && tx.status.confirmed ? t('已确认', 'Confirmed') : t('内存池待确认', 'Unconfirmed'),
            timestamp: tx.status && tx.status.block_time ? tx.status.block_time : null
          };
        });
      })());
    }

    const chunks = await Promise.all(tasks.map((p) => p.catch(() => [])));
    if (seq !== _tokenDetailState.fetchSeq) return;

    _tokenDetailState.historyItems = chunks.flat().filter(Boolean);
    _tokenDetailState.historyLoading = false;
    renderTokenDetailHistoryList();
  }

  let _autoSyncTimer = null;

  function startAutoPriceAndBalanceSync() {
    if (_autoSyncTimer) {
      clearInterval(_autoSyncTimer);
      _autoSyncTimer = null;
    }
    _autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined') {
        if (document.hidden) return;
        if (typeof document.querySelector === 'function' && document.querySelector('.bottom-sheet.open')) return;
      }
      const st = getState();
      if (st && st.getActiveWallet() && !_isRefreshing) {
        refreshAllBalancesAsync(false);
      }
    }, 30000);
    return _autoSyncTimer;
  }

  // ==================== Header & Home Wallet Rendering ====================

  function renderHeaderAndHero() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const nearId = wallet.nearNamedAccount || wallet.nearAddress || '';
    const displayId = wallet.nearNamedAccount ? wallet.nearNamedAccount : shortenAddr(nearId, 6, 4);

    const headerLbl = $('header-account-label');
    if (headerLbl) headerLbl.textContent = displayId;

    const caBadge = document.querySelector('#header-account-pill .ca-badge');
    if (caBadge) {
      caBadge.textContent = 'NEAR CA';
    }

    const heroNearId = $('hero-near-id');
    if (heroNearId) heroNearId.textContent = wallet.nearNamedAccount || shortenAddr(nearId, 10, 8);

    const regBtn = $('btn-hero-register-near');
    if (regBtn) {
      regBtn.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
    }

    const wcCount = st.wc.client ? Object.keys(st.wc.client.getActiveSessions() || {}).length : 0;
    const wcDot = $('header-wc-dot');
    if (wcDot) {
      wcDot.classList.toggle('connected', wcCount > 0);
    }
    const hubWcBadge = $('hub-wc-count-badge');
    if (hubWcBadge) {
      hubWcBadge.textContent = String(wcCount);
      hubWcBadge.classList.toggle('hidden', wcCount === 0);
    }
  }

  function renderWalletView() {
    renderHeaderAndHero();
    renderUnifiedAssetList();
  }

  function copyActiveNearId() {
    const wallet = getState().getActiveWallet();
    if (!wallet) return;
    copyText(wallet.nearNamedAccount || wallet.nearAddress, 'NEAR ID');
  }

  function jumpToNearDomainManager() {
    openNearAccountSheet();
  }

  function focusMpcInspector() {
    switchTab('hub');
  }

  // ==================== Unified Send Sheet (100% Real On-Chain Balances) ====================

  const EVM_CHAIN_KEYS = ['eth', 'base', 'arb', 'bsc', 'op', 'pol', 'avax', 'hype', 'hood', 'arc'];
  let _sendTargetEvmChain = 'eth';

  function renderSendEvmChainPills() {
    const row = $('send-evm-chain-row');
    const pills = $('send-evm-chain-pills');
    if (!row || !pills) return;
    const tokens = getTokens();
    const choices = ['eth', 'base', 'arb', 'bsc', 'op', 'pol', 'avax', 'arc'];
    pills.innerHTML = choices.map((ck) => {
      const meta = tokens.getChainMeta(ck);
      return `<button type="button" class="filter-pill ${_sendTargetEvmChain === ck ? 'active' : ''}" data-action="set-send-evm-chain" data-chain="${ck}">${escapeHtml(meta.shortName)}</button>`;
    }).join('');
  }

  function setSendTargetEvmChain(chainKey) {
    const ck = String(chainKey || '').toLowerCase();
    if (!EVM_CHAIN_KEYS.includes(ck)) return;
    _sendTargetEvmChain = ck;
    renderSendEvmChainPills();
    handleSendRecipientInput();
  }

  function getSendSourceEntriesForWallet(wallet) {
    const tokens = getTokens();
    const groups = buildAllOnChainAssetGroups(wallet || getState().getActiveWallet());
    const entries = [];
    const seenKey = new Set();
    for (const g of groups) {
      for (const e of g.entries) {
        const key = `${String(g.symbolKey)}|${String(e.blockchain)}|${String(e.contractAddress || '')}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        const chainMeta = tokens.getChainMeta(e.blockchain);
        entries.push({
          key: `${e.blockchain}|${e.assetId}|${e.contractAddress || ''}`,
          symbolKey: g.symbolKey,
          symbol: g.symbol,
          blockchain: e.blockchain,
          chainLabel: e.kind === 'nep141'
            ? `${chainMeta.name} (NEP-141 ${shortenAddr(e.contractAddress, 6, 4)})`
            : `${chainMeta.name}`,
          networkName: e.networkName,
          assetId: e.assetId,
          contractAddress: e.contractAddress || null,
          decimals: e.decimals,
          kind: e.kind,
          balance: e.balance
        });
      }
    }
    return entries;
  }

  function getWalletNativeBalanceForToken(wallet, blockchain, symbol, contractAddress = null) {
    if (!wallet) return null;
    const st = getState();
    const bc = String(blockchain || '').toLowerCase();
    const sym = String(symbol || '').toUpperCase();
    const isNativeContract = !contractAddress ||
      contractAddress === 'So11111111111111111111111111111111111111112' ||
      contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      contractAddress === 'wrap.near' ||
      (bc === 'arc' && contractAddress.toLowerCase() === '0x3600000000000000000000000000000000000000');

    if (bc === 'near' && sym === 'NEAR' && isNativeContract) return wallet.nativeBalances.near;
    if (bc === 'near' && contractAddress && !isNativeContract) {
      const nep = wallet.nearNep141Balances && wallet.nearNep141Balances[contractAddress];
      return nep && typeof nep.formatted === 'number' && Number.isFinite(nep.formatted) ? nep.formatted : null;
    }
    if (bc === 'sol' && (sym === 'SOL' || isNativeContract)) return wallet.nativeBalances.sol;
    if (bc === 'prl' && sym === 'PRL') return wallet.nativeBalances.prl;
    if (bc === 'btc' && sym === 'BTC') return wallet.nativeBalances.btc;
    if (isNativeContract && EVM_CHAIN_KEYS.includes(bc)) {
      return wallet.nativeBalances[bc];
    }
    if (bc === 'sol' && contractAddress && wallet.splBalances) {
      const v = wallet.splBalances[contractAddress];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    if (contractAddress && EVM_CHAIN_KEYS.includes(bc)) {
      return st.getWalletErc20Balance(wallet, bc, contractAddress);
    }
    return null;
  }

  function populateSendSourceSelect(symbolKey, preferredChainKey = '', preferredAssetId = '') {
    const wallet = getState().getActiveWallet();
    const srcSel = $('send-source-select');
    if (!srcSel || !wallet) return;

    const allEntries = getSendSourceEntriesForWallet(wallet);
    const matching = allEntries.filter((e) => e.symbolKey === String(symbolKey || '').toUpperCase());

    srcSel.innerHTML = matching.map((e) => {
      const balStr = e.balance !== null ? ` (${formatBal(e.balance, 4)} ${e.symbol})` : '';
      return `<option value="${escapeHtml(e.key)}">${escapeHtml(e.chainLabel + balStr)}</option>`;
    }).join('');

    let chosen = null;
    if (preferredAssetId) {
      chosen = matching.find((e) => e.assetId.toLowerCase() === String(preferredAssetId).toLowerCase());
    }
    if (!chosen && preferredChainKey) {
      chosen = matching.find((e) => e.blockchain === String(preferredChainKey).toLowerCase());
    }
    if (!chosen) {
      chosen = matching.find((e) => typeof e.balance === 'number' && e.balance > 0) || matching[0];
    }
    if (chosen) srcSel.value = chosen.key;
  }

  function openSendSheet(opts = {}) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const allEntries = getSendSourceEntriesForWallet(wallet);
    const symbolsSeen = new Set();
    const uniqueSymbols = [];
    for (const sym of DEFAULT_VISIBLE_SYMBOLS) {
      if (allEntries.some((e) => e.symbolKey === sym)) {
        symbolsSeen.add(sym);
        uniqueSymbols.push(sym);
      }
    }
    for (const e of allEntries) {
      if (!symbolsSeen.has(e.symbolKey)) {
        symbolsSeen.add(e.symbolKey);
        uniqueSymbols.push(e.symbolKey);
      }
    }

    let initialSymbol = String(opts.symbol || '').toUpperCase();
    if (!initialSymbol && opts.assetId) {
      const hit = allEntries.find((e) => e.assetId.toLowerCase() === String(opts.assetId).toLowerCase());
      if (hit) initialSymbol = hit.symbolKey;
    }
    if (!initialSymbol || !symbolsSeen.has(initialSymbol)) {
      initialSymbol = uniqueSymbols.includes('NEAR') ? 'NEAR' : (uniqueSymbols[0] || '');
    }

    const sel = $('send-asset-select');
    if (sel) {
      sel.innerHTML = uniqueSymbols.map((sym) => `<option value="${escapeHtml(sym)}">${escapeHtml(sym)}</option>`).join('');
      sel.value = initialSymbol;
    }

    populateSendSourceSelect(initialSymbol, opts.chainKey || '', opts.assetId || '');
    const selectedSendAsset = getSelectedSendAsset();
    const initialChain = String(opts.chainKey || selectedSendAsset?.blockchain || 'eth').toLowerCase();
    _sendTargetEvmChain = EVM_CHAIN_KEYS.includes(initialChain) ? initialChain : 'eth';
    $('send-evm-chain-row')?.classList.add('hidden');

    if ($('send-recipient-input')) $('send-recipient-input').value = opts.recipient || '';
    if ($('send-amount-input')) $('send-amount-input').value = '';
    if ($('send-detected-net')) $('send-detected-net').textContent = '';
    $('send-route-preview')?.classList.add('hidden');

    updateSendAvailabilityUI();
    if (opts.recipient) handleSendRecipientInput();
    openSheet('sheet-send');
  }

  function handleSendAssetChange() {
    const sym = ($('send-asset-select')?.value || '').toUpperCase();
    populateSendSourceSelect(sym);
    updateSendAvailabilityUI();
    const asset = getSelectedSendAsset();
    if (asset && EVM_CHAIN_KEYS.includes(asset.blockchain)) {
      _sendTargetEvmChain = asset.blockchain;
    }
    handleSendRecipientInput();
  }

  function getSelectedSendAsset() {
    const wallet = getState().getActiveWallet();
    const sym = ($('send-asset-select')?.value || '').toUpperCase();
    const srcKey = $('send-source-select')?.value || '';
    const allEntries = getSendSourceEntriesForWallet(wallet);
    return allEntries.find((e) => e.key === srcKey)
      || allEntries.find((e) => e.symbolKey === sym)
      || allEntries[0]
      || null;
  }

  function getSendSourceAvailable() {
    const wallet = getState().getActiveWallet();
    const asset = getSelectedSendAsset();
    if (!wallet || !asset) return null;
    return getWalletNativeBalanceForToken(wallet, asset.blockchain, asset.symbol, asset.contractAddress);
  }

  function updateSendAvailabilityUI() {
    const asset = getSelectedSendAsset();
    const bal = getSendSourceAvailable();
    const el = $('send-available-bal');
    if (el && asset) {
      el.textContent = `${formatBal(bal, 6)} ${asset.symbol}`;
    }
  }

  function setSendMaxAmount() {
    const asset = getSelectedSendAsset();
    const bal = getSendSourceAvailable();
    const inp = $('send-amount-input');
    if (!inp || !asset || bal === null || bal <= 0) return;

    const reserves = { near: 0.005, sol: 0.002, eth: 0.0015, base: 0.0002, arb: 0.0002, bsc: 0.0005, op: 0.0002, pol: 0.01, avax: 0.005, hype: 0.0005, hood: 0.0002, arc: 0.02, prl: 0.001, btc: 0.0001 };
    const isNativeGas = !asset.contractAddress ||
      asset.blockchain === 'prl' ||
      asset.blockchain === 'btc' ||
      asset.contractAddress === 'So11111111111111111111111111111111111111112' ||
      asset.contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      asset.contractAddress === 'wrap.near' ||
      (asset.blockchain === 'arc' && asset.contractAddress.toLowerCase() === '0x3600000000000000000000000000000000000000');
    const maxVal = isNativeGas ? Math.max(0, bal - (reserves[asset.blockchain] || 0)) : bal;
    inp.value = maxVal > 0 ? Number(maxVal.toFixed(6)).toString() : '0';
  }

  async function pasteToSendAddress() {
    try {
      const text = await navigator.clipboard.readText();
      const inp = $('send-recipient-input');
      if (inp && text) {
        inp.value = text.trim();
        handleSendRecipientInput();
      }
    } catch (_) {
      showToast(t('请手动粘贴地址', 'Please paste address manually'));
    }
  }

  function handleSendRecipientInput() {
    const crypto = getCrypto();
    const tokens = getTokens();
    const addr = ($('send-recipient-input')?.value || '').trim();
    const labelEl = $('send-detected-net');
    const evmRow = $('send-evm-chain-row');
    if (!labelEl) return;
    if (!addr) {
      labelEl.textContent = '';
      if (evmRow) evmRow.classList.add('hidden');
      return;
    }
    const net = crypto.detectAddressNetwork(addr);
    if (net === 'evm') {
      if (evmRow) evmRow.classList.remove('hidden');
      renderSendEvmChainPills();
      const evmMeta = tokens.getChainMeta(_sendTargetEvmChain);
      labelEl.style.color = 'var(--cyan-glow)';
      labelEl.textContent = `${t('已识别目标网络', 'Detected Network')}: ${evmMeta.name} (EVM)`;
    } else if (net) {
      if (evmRow) evmRow.classList.add('hidden');
      const meta = tokens.getChainMeta(net);
      labelEl.style.color = 'var(--cyan-glow)';
      labelEl.textContent = `${t('已识别目标网络', 'Detected Network')}: ${meta.name}`;
    } else {
      if (evmRow) evmRow.classList.add('hidden');
      labelEl.style.color = 'var(--rose-alert)';
      labelEl.textContent = t('无法识别地址格式，请核对', 'Unrecognized address format');
    }
  }

  function resolveDestinationAssetForNetwork(symbol, detectedNet, fallbackAssetId, preferredEvmChain = 'eth') {
    const tokens = getTokens();
    const symUpper = String(symbol || '').toUpperCase();
    const core = tokens.UNIFIED_CORE_TOKENS || [];
    const prefEvm = String(preferredEvmChain || '').toLowerCase();
    const targetChain = detectedNet === 'evm'
      ? (EVM_CHAIN_KEYS.includes(prefEvm) ? prefEvm : 'eth')
      : detectedNet;
    if (targetChain === 'near' && symUpper === 'PRL') {
      return { assetId: '1cs_v1:near:nep141:prl.omft.near', blockchain: 'near', symbol: 'PRL', decimals: 8 };
    }
    if (targetChain === 'qtc' && symUpper === 'QTC') {
      return { assetId: 'nep141:qtc.omft.near', blockchain: 'qtc', symbol: 'QTC', decimals: 12 };
    }
    if (targetChain === 'near' && symUpper === 'QTC') {
      return { assetId: '1cs_v1:near:nep141:qtc.omft.near', blockchain: 'near', symbol: 'QTC', decimals: 12 };
    }
    const exact = core.find((c) => c.blockchain === targetChain && String(c.symbol).toUpperCase() === symUpper);
    if (exact) return exact;
    const catalog = getSwapTokenCatalog();
    const exactCat = catalog.find((c) => c.blockchain === targetChain && String(c.symbol).toUpperCase() === symUpper);
    if (exactCat) return exactCat;
    if (detectedNet === 'evm') {
      const anyEvm = core.find((c) => EVM_CHAIN_KEYS.includes(c.blockchain) && String(c.symbol).toUpperCase() === symUpper)
        || catalog.find((c) => EVM_CHAIN_KEYS.includes(c.blockchain) && String(c.symbol).toUpperCase() === symUpper);
      if (anyEvm) return anyEvm;
    }
    return core.find((c) => c.assetId === fallbackAssetId)
      || catalog.find((c) => c.assetId === fallbackAssetId)
      || { assetId: fallbackAssetId, blockchain: targetChain, symbol };
  }

  async function executeUnifiedSend() {
    const st = getState();
    const crypto = getCrypto();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const asset = getSelectedSendAsset();
    const recipient = ($('send-recipient-input')?.value || '').trim();
    const amountNum = Number($('send-amount-input')?.value || 0);

    if (!asset) return;
    if (!recipient) {
      showToast(t('请输入收款地址', 'Enter recipient address'));
      return;
    }
    const detectedNet = crypto.detectAddressNetwork(recipient);
    if (!detectedNet) {
      showToast(t('收款地址格式无效', 'Invalid recipient address'));
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      showToast(t('请输入大于 0 的转账数量', 'Enter a positive amount'));
      return;
    }

    const avail = getSendSourceAvailable();
    const isNativeGas = !asset.contractAddress ||
      asset.blockchain === 'prl' ||
      asset.blockchain === 'btc' ||
      asset.contractAddress === 'So11111111111111111111111111111111111111112' ||
      asset.contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      asset.contractAddress === 'wrap.near' ||
      (asset.blockchain === 'arc' && asset.contractAddress.toLowerCase() === '0x3600000000000000000000000000000000000000');
    try {
      contracts.validateSufficientChainBalance({
        wallet,
        chain: asset.blockchain,
        tokenSymbol: asset.symbol,
        amount: amountNum,
        isNative: isNativeGas,
        tokenBalance: avail !== null ? avail : 0
      });
    } catch (err) {
      showToast(err.message);
      return;
    }

    if (!(await verifySecurityAuthAsync(wallet, `${t('确认发送', 'Confirm send')} ${amountNum} ${asset.symbol}`))) return;

    const btn = $('btn-confirm-send');
    if (btn) btn.disabled = true;

    try {
      const isEvmOrigin = EVM_CHAIN_KEYS.includes(asset.blockchain);
      if (isEvmOrigin) await ensureEthersLoaded();
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const targetEvmChain = detectedNet === 'evm'
        ? (_sendTargetEvmChain || (isEvmOrigin ? asset.blockchain : 'eth'))
        : detectedNet;
      const isSameChain =
        (asset.blockchain === 'near' && detectedNet === 'near') ||
        (asset.blockchain === 'sol' && detectedNet === 'sol') ||
        (isEvmOrigin && detectedNet === 'evm' && asset.blockchain === targetEvmChain) ||
        (asset.blockchain === 'prl' && detectedNet === 'prl') ||
        (asset.blockchain === 'btc' && detectedNet === 'btc');

      // Case 1: Same-chain direct on-chain transfer
      if (isSameChain) {
        if (asset.blockchain === 'near' && asset.kind !== 'nep141' && asset.symbol === 'NEAR') {
          const res = await contracts.signAndSendNearTransfer({
            wallet,
            receiverId: recipient.toLowerCase(),
            amountNear: amountNum
          });
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ NEAR ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }

        if (asset.blockchain === 'near' && asset.contractAddress && typeof contracts.executeNearNep141Transfer === 'function') {
          const res = await contracts.executeNearNep141Transfer({
            wallet,
            tokenContract: asset.contractAddress,
            receiverId: recipient.toLowerCase(),
            amount: amountNum,
            decimals: asset.decimals || 8,
            tokenSymbol: asset.symbol,
            tokenBalance: avail
          });
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ ${asset.symbol} (NEAR) ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }

        if (asset.blockchain === 'sol') {
          if (!asset.contractAddress || asset.contractAddress === 'So11111111111111111111111111111111111111112') {
            const res = await contracts.executeSolanaNativeTransfer({ wallet, toAddress: recipient, amountSol: amountNum });
            recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
            showToast(`✅ SOL ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
            closeAllSheets();
            refreshAllBalancesAsync(false);
            return;
          }
          const res = await contracts.executeSolanaSplTransfer({
            wallet,
            mintAddress: asset.contractAddress,
            toAddress: recipient,
            amount: amountNum,
            decimals: asset.decimals || 6,
            tokenBalance: avail
          });
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ ${asset.symbol} (Solana) ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }

        if (isEvmOrigin) {
          const res = await contracts.executeEvmTransfer({
            wallet,
            chainKey: asset.blockchain,
            toAddress: recipient,
            amount: amountNum,
            tokenContract: asset.contractAddress,
            decimals: asset.decimals,
            tokenBalance: avail
          });
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ EVM ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }

        if (asset.blockchain === 'prl') {
          const res = await contracts.executePearlTransfer({
            wallet,
            toAddress: recipient,
            amountPrl: amountNum,
            feeDeductMode: 'extra'
          });
          const feePrl = Number(res.feePrl) || 0;
          applyOptimisticChainSpend(wallet, 'prl', amountNum, feePrl, res.txHash);
          recordWalletActivity(wallet, {
            type: 'send',
            symbol: asset.symbol,
            chain: asset.blockchain,
            amount: amountNum,
            fee: feePrl > 0 ? feePrl : null,
            netAmount: -(amountNum + feePrl),
            counterparty: recipient,
            txHash: res.txHash,
            title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}`
          });
          showToast(`✅ PRL ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }
        if (asset.blockchain === 'btc') {
          const res = await contracts.executeBitcoinTransfer({
            wallet,
            toAddress: recipient,
            amountBtc: amountNum,
            feeDeductMode: 'extra'
          });
          const feeBtc = Number(res.feeBtc) || 0;
          applyOptimisticChainSpend(wallet, 'btc', amountNum, feeBtc, res.txHash);
          recordWalletActivity(wallet, {
            type: 'send',
            symbol: asset.symbol,
            chain: 'btc',
            amount: amountNum,
            fee: feeBtc > 0 ? feeBtc : null,
            netAmount: -(amountNum + feeBtc),
            counterparty: recipient,
            txHash: res.txHash,
            title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}`
          });
          showToast(`✅ BTC ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }
        throw new Error(t('该同链代币转账暂未接通签名广播', 'Direct transfer unsupported for this token'));
      }

      // Case 2: Cross-chain L1 -> L1 transfer via 1Click ORIGIN_CHAIN -> DESTINATION_CHAIN
      const canBroadcastOrigin =
        asset.blockchain === 'near' ||
        asset.blockchain === 'sol' ||
        asset.blockchain === 'prl' ||
        asset.blockchain === 'btc' ||
        (isEvmOrigin && asset.blockchain !== 'arc');

      if (!canBroadcastOrigin) {
        throw new Error(t('所选源链暂不支持自动签名跨链，请在收款网络切换或使用支持的源链', 'Origin chain does not support automated cross-chain broadcast'));
      }

      const destAsset = resolveDestinationAssetForNetwork(asset.symbol, detectedNet, asset.assetId, targetEvmChain);
      const amountRaw = intents.toBaseUnits(amountNum, asset.decimals || 8);
      const refundTo = getWalletDefaultRecipientForChain(wallet, asset.blockchain) || (wallet.nearNamedAccount || wallet.nearAddress);

      const quote = await intents.quoteIntentSwapOrWithdraw({
        originAsset: asset.assetId,
        destinationAsset: destAsset.assetId,
        amountRaw,
        slippageBps: 100,
        recipient,
        refundTo,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: false
      });

      if (!quote.ok || !quote.depositAddress) {
        throw new Error(quote.error || t('获取跨链转账路由失败', 'Failed to obtain cross-chain route'));
      }

      let depositTxHash = '';
      let depositFeeNum = null;
      if (asset.blockchain === 'near' && asset.kind !== 'nep141' && asset.symbol === 'NEAR') {
        const res = await contracts.signAndSendNearTransfer({ wallet, receiverId: quote.depositAddress, amountNear: amountNum });
        depositTxHash = res.txHash;
      } else if (asset.blockchain === 'near' && asset.contractAddress && typeof contracts.executeNearNep141Transfer === 'function') {
        const res = await contracts.executeNearNep141Transfer({
          wallet,
          tokenContract: asset.contractAddress,
          receiverId: quote.depositAddress,
          amount: amountNum,
          decimals: asset.decimals || 8,
          tokenSymbol: asset.symbol,
          tokenBalance: avail
        });
        depositTxHash = res.txHash;
      } else if (asset.blockchain === 'sol') {
        if (!asset.contractAddress || asset.contractAddress === 'So11111111111111111111111111111111111111112') {
          const res = await contracts.executeSolanaNativeTransfer({ wallet, toAddress: quote.depositAddress, amountSol: amountNum });
          depositTxHash = res.txHash;
        } else {
          const res = await contracts.executeSolanaSplTransfer({
            wallet,
            mintAddress: asset.contractAddress,
            toAddress: quote.depositAddress,
            amount: amountNum,
            decimals: asset.decimals || 6,
            tokenBalance: avail
          });
          depositTxHash = res.txHash;
        }
      } else if (asset.blockchain === 'prl') {
        const res = await contracts.executePearlTransfer({
          wallet,
          toAddress: quote.depositAddress,
          amountPrl: amountNum,
          feeDeductMode: 'extra'
        });
        depositTxHash = res.txHash;
        depositFeeNum = Number(res.feePrl) || 0;
        applyOptimisticChainSpend(wallet, 'prl', amountNum, depositFeeNum, depositTxHash);
      } else if (asset.blockchain === 'btc') {
        const res = await contracts.executeBitcoinTransfer({
          wallet,
          toAddress: quote.depositAddress,
          amountBtc: amountNum,
          feeDeductMode: 'extra'
        });
        depositTxHash = res.txHash;
        depositFeeNum = Number(res.feeBtc) || 0;
        applyOptimisticChainSpend(wallet, 'btc', amountNum, depositFeeNum, depositTxHash);
      } else if (isEvmOrigin) {
        const res = await contracts.executeEvmTransfer({
          wallet,
          chainKey: asset.blockchain,
          toAddress: quote.depositAddress,
          amount: amountNum,
          tokenContract: asset.contractAddress,
          decimals: asset.decimals,
          tokenBalance: avail
        });
        depositTxHash = res.txHash;
      }

      if (!depositTxHash) {
        throw new Error(t(`暂不支持从 ${String(asset.blockchain || '').toUpperCase()} 发起跨链发送`, `Cross-chain send from ${String(asset.blockchain || '').toUpperCase()} is unavailable`));
      }

      const nearSenderAccount = wallet.nearNamedAccount || wallet.nearAddress;
      await intents.submitExternalDepositTxHash({
        depositAddress: quote.depositAddress,
        txHash: depositTxHash,
        nearSenderAccount
      }).catch(() => {});

      st.swap.activeOrder = {
        walletId: wallet.id,
        depositAddress: quote.depositAddress,
        memo: quote.memo || null,
        status: 'PENDING_DEPOSIT',
        fromSymbol: asset.symbol,
        toSymbol: destAsset.symbol || asset.symbol,
        originTxHash: depositTxHash,
        autoBroadcasted: true,
        createdAt: Date.now()
      };
      if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
      renderSwapOrderCard();
      startOrderStatusPolling();

      recordWalletActivity(wallet, {
        type: 'send',
        symbol: asset.symbol,
        chain: asset.blockchain,
        amount: amountNum,
        fee: depositFeeNum,
        netAmount: depositFeeNum !== null ? -(amountNum + depositFeeNum) : null,
        counterparty: recipient,
        txHash: depositTxHash,
        title: `${t('跨链转账至', 'Cross-chain to')} ${shortenAddr(recipient)}`
      });
      showToast(`✅ ${t('跨链转账已广播', 'Cross-chain transfer sent')}: ${shortenAddr(depositTxHash)}`);
      closeAllSheets();
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(err && err.message ? err.message : t('转账失败', 'Transfer failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ==================== Unified Receive Sheet ====================

  function openReceiveSheet(networkKey = 'near') {
    const st = getState();
    const rawKey = String(networkKey || 'near').toLowerCase();
    st.receive.selectedNetwork = ['arc', 'eth', 'base', 'arb', 'op', 'pol', 'bsc', 'hype', 'hood', 'avax'].includes(rawKey)
      ? 'evm'
      : rawKey;
    renderReceiveSheet();
    openSheet('sheet-receive');
  }

  let _qtcDepositPromiseKey = '';

  async function ensureQtcReceiveDepositAddressAsync(wallet) {
    const st = getState();
    const intents = getIntents();
    const nearId = wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : '';
    if (!wallet || !nearId || typeof intents.requestCrossChainDepositAddress !== 'function') return;
    const reqKey = `${wallet.id}:${nearId}`;
    if (_qtcDepositPromiseKey === reqKey) return;
    _qtcDepositPromiseKey = reqKey;

    const valEl = $('receive-addr-value');
    if (valEl && st.receive.selectedNetwork === 'qtc' && !wallet.qtcDepositAddress) {
      valEl.textContent = t('正在获取 Quantus 跨链充值地址...', 'Fetching Quantus deposit address...');
    }

    try {
      const res = await intents.requestCrossChainDepositAddress({
        originAsset: intents.QTC_ORIGIN_ASSET_ID || 'nep141:qtc.omft.near',
        destinationAsset: intents.QTC_NEAR_ASSET_ID || '1cs_v1:near:nep141:qtc.omft.near',
        amountRaw: '1000000000000',
        nearAccountId: nearId
      });
      if (res && res.ok && res.depositAddress) {
        wallet.qtcDepositAddress = res.depositAddress;
        st.saveWallets();
      } else if (st.receive.selectedNetwork === 'qtc') {
        showToast((res && res.error) || t('获取 QTC 跨链收款地址失败', 'Failed to obtain QTC deposit address'));
      }
    } finally {
      if (_qtcDepositPromiseKey === reqKey) _qtcDepositPromiseKey = '';
      const active = st.getActiveWallet();
      if (active && active.id === wallet.id && st.receive.selectedNetwork === 'qtc') {
        renderReceiveSheet();
      }
    }
  }

  function renderReceiveSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (typeof st.recomputeWalletMpcAddresses === 'function') {
      st.recomputeWalletMpcAddresses(wallet);
    }

    const options = [
      { key: 'near', label: 'NEAR (.near)', addr: wallet.nearNamedAccount || wallet.nearAddress },
      { key: 'evm', label: 'EVM (ETH / Base / ARB / OP / POL / BSC / Arc)', addr: wallet.mpcEvmAddress || wallet.evmAddress },
      { key: 'sol', label: 'Solana (SOL)', addr: wallet.solAddress },
      { key: 'btc', label: t('Bitcoin (BTC 主网)', 'Bitcoin (BTC Mainnet)'), addr: wallet.btcAddress },
      { key: 'prl', label: t('Pearl (PRL 主网)', 'Pearl (PRL Mainnet)'), addr: wallet.address },
      { key: 'qtc', label: t('QTC (Quantus 跨链收款)', 'QTC (Quantus Deposit)'), addr: wallet.qtcDepositAddress || '' }
    ];

    const pillsEl = $('receive-network-pills');
    if (pillsEl) {
      pillsEl.innerHTML = options.map((o) => `
        <button type="button" class="filter-pill ${st.receive.selectedNetwork === o.key ? 'active' : ''}" data-action="select-receive-network" data-net="${escapeHtml(o.key)}">${escapeHtml(o.label)}</button>
      `).join('');
    }

    const active = options.find((o) => o.key === st.receive.selectedNetwork) || options[0];
    const lblEl = $('receive-addr-label');
    const valEl = $('receive-addr-value');
    if (lblEl) lblEl.textContent = active.label;

    if (active.key === 'qtc' && !active.addr) {
      const nearId = wallet.nearNamedAccount || wallet.nearAddress;
      const isFetching = Boolean(nearId && _qtcDepositPromiseKey === `${wallet.id}:${nearId}`);
      if (valEl) {
        valEl.textContent = isFetching
          ? t('正在获取 Quantus 跨链充值地址...', 'Fetching Quantus deposit address...')
          : '--';
      }
      renderQrInto('receive-qr-container', '', 172);
      return;
    }

    if (valEl) valEl.textContent = active.addr || '--';
    renderQrInto('receive-qr-container', active.addr || '', 172);
  }

  function selectReceiveNetwork(key) {
    const st = getState();
    st.receive.selectedNetwork = key;
    const wallet = st.getActiveWallet();
    renderReceiveSheet();
    if (key === 'qtc' && wallet && !wallet.qtcDepositAddress) {
      ensureQtcReceiveDepositAddressAsync(wallet);
    }
  }

  function copyReceiveAddress() {
    const addr = $('receive-addr-value')?.textContent || '';
    if (addr && addr !== '--') copyText(addr, $('receive-addr-label')?.textContent || '');
  }

  // ==================== Unified Any-Chain Swap Controller ====================

  let _swapQuoteTimer = null;
  let _orderPollTimer = null;
  let _orderPollCount = 0;

  let _swapCatalogCache = null;
  let _swapCatalogLiveRef = null;
  let _swapCatalogDynRef = null;
  let _swapCatalogPrlPrice = null;
  let _swapCatalogCoreLen = -1;

  function getSwapTokenCatalog() {
    const st = getState();
    const tokens = getTokens();
    const prlPrice = getSymbolPrice('PRL');
    const coreList = tokens.UNIFIED_CORE_TOKENS || [];
    if (
      _swapCatalogCache &&
      st.liveTokens === _swapCatalogLiveRef &&
      st.dynamicSolTokens === _swapCatalogDynRef &&
      prlPrice === _swapCatalogPrlPrice &&
      coreList.length === _swapCatalogCoreLen
    ) {
      return _swapCatalogCache;
    }

    const list = [];
    const seenIds = new Set();
    const seenChainContract = new Set();

    const addToken = (raw) => {
      if (!raw || !raw.assetId) return;
      const bc = String(raw.blockchain || '').toLowerCase();
      const sym = String(raw.symbol || '').toUpperCase();
      const contract = String(raw.contractAddress || '').trim().toLowerCase();
      const idKey = String(raw.assetId).toLowerCase();
      if (seenIds.has(idKey)) return;
      const chainKey = contract ? `${bc}_${sym}_${contract}` : `${bc}_${sym}_native`;
      if (seenChainContract.has(chainKey)) return;
      seenIds.add(idKey);
      seenChainContract.add(chainKey);
      list.push(raw);
    };

    const dexTokens = Object.values(tokens.DEX_CHAIN_TOKENS || {}).flat();

    // 1. Core cross-chain tokens + NEAR NEP-141 PRL
    for (const item of coreList) addToken(item);
    addToken({
      symbol: 'PRL',
      name: 'Pearl Network (NEAR NEP-141)',
      blockchain: 'near',
      assetId: '1cs_v1:near:nep141:prl.omft.near',
      contractAddress: 'prl.omft.near',
      decimals: 8,
      networkName: 'NEAR Protocol (NEP-141)',
      price: prlPrice
    });

    // 2. Direct On-Chain DEX Tokens (Solana Jupiter/Raydium/xStocks, EVM Kyber/Para/OpenOcean)
    for (const item of dexTokens) addToken(item);
    for (const item of (st.dynamicSolTokens || [])) addToken(item);

    // 3. Live 1Click catalog additions
    for (const item of (st.liveTokens || [])) addToken(item);

    _swapCatalogLiveRef = st.liveTokens;
    _swapCatalogDynRef = st.dynamicSolTokens;
    _swapCatalogPrlPrice = prlPrice;
    _swapCatalogCoreLen = coreList.length;
    _swapCatalogCache = list;
    return list;
  }

  function resolveSwapToken(assetId, fallbackIdx = 0) {
    const catalog = getSwapTokenCatalog();
    const found = catalog.find((x) => String(x.assetId).toLowerCase() === String(assetId || '').toLowerCase());
    return found || catalog[fallbackIdx] || null;
  }

  function getSwapTokenAvailableBalance(token) {
    const wallet = getState().getActiveWallet();
    if (!wallet || !token) return null;
    return getWalletNativeBalanceForToken(wallet, token.blockchain, token.symbol, token.contractAddress);
  }

  function isSameChainContractSwap(fromToken, toToken) {
    if (!fromToken || !toToken) return false;
    const fromBc = String(fromToken.blockchain || '').toLowerCase();
    const toBc = String(toToken.blockchain || '').toLowerCase();
    if (fromBc !== toBc) return false;
    if (fromBc === 'near' || fromBc === 'sol' || EVM_CHAIN_KEYS.includes(fromBc)) {
      return Boolean(fromToken.contractAddress && toToken.contractAddress);
    }
    return false;
  }

  function isPrlSwapToken(tok) {
    return Boolean(tok && String(tok.symbol || '').toUpperCase() === 'PRL');
  }

  function isSwapOriginSupported(token) {
    if (!token) return false;
    const bc = String(token.blockchain || '').toLowerCase();
    if (bc === 'near' || bc === 'prl' || bc === 'sol' || bc === 'btc') return true;
    const contracts = getContracts();
    return Boolean(contracts && contracts.EVM_CHAINS && contracts.EVM_CHAINS[bc]);
  }

  function validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData = null, amountIn = 0 } = {}) {
    if (!wallet || !fromToken || !toToken) {
      return { ok: true, requiredNear: 0, availNearForGas: 0, needsNearHub: false, needsMpcSign: false };
    }
    const fromBc = String(fromToken.blockchain || '').toLowerCase();
    const contracts = getContracts();
    const isEvmChain = (bc) => Boolean(contracts && contracts.EVM_CHAINS && contracts.EVM_CHAINS[bc]);

    const rawNear = wallet.nativeBalances && wallet.nativeBalances.near !== undefined && wallet.nativeBalances.near !== null
      ? wallet.nativeBalances.near
      : wallet.nearBalance;
    const nearBal = Number.isFinite(Number(rawNear)) ? Number(rawNear) : 0;
    const isNativeNearInput = fromBc === 'near' && String(fromToken.symbol || '').toUpperCase() === 'NEAR';
    const availNearForGas = isNativeNearInput ? Math.max(0, nearBal - (Number(amountIn) || 0)) : nearBal;

    const compType = quoteData && quoteData.compositeType ? String(quoteData.compositeType) : '';
    const stages = quoteData && Array.isArray(quoteData.stages) ? quoteData.stages : [];

    const needsNearHub = Boolean(
      (compType === 'SMART_HUB_ROUTE' && stages.some((s) => s && (s.type === 'NEAR_SWAP' || s.type === 'BRIDGE_OUT'))) ||
      (isPrlSwapToken(fromToken) !== isPrlSwapToken(toToken)) ||
      ['PRL_TO_EXTERNAL', 'EXTERNAL_TO_PRL', 'PRL_TO_NEAR_DCL', 'PRL_TO_NEAR_REF'].includes(compType)
    );

    const originNeedsMpc =
      (fromBc === 'sol' && !wallet.solPrivateSeedHex) ||
      (isEvmChain(fromBc) && !wallet.evmPrivateKey);
    const destNeedsMpc = Boolean(
      (compType === 'SMART_HUB_ROUTE' && stages.some((s) => s && s.type === 'DEST_DEX' && ((s.chain === 'sol' && !wallet.solPrivateSeedHex) || (s.chain !== 'sol' && !wallet.evmPrivateKey)))) ||
      (compType === 'CROSS_CHAIN_TO_SOL_DEX' && !wallet.solPrivateSeedHex) ||
      (['CROSS_CHAIN_TO_EVM_DEX', 'CROSS_CHAIN_TO_ARC_MAINNET', 'EVM_TO_ARC_MAINNET', 'ARC_MAINNET_TO_CROSS_CHAIN'].includes(compType) && !wallet.evmPrivateKey)
    );
    const needsMpcSign = Boolean(originNeedsMpc || destNeedsMpc);

    const requiredNear = Number(((needsNearHub ? 0.02 : 0) + (needsMpcSign ? 0.01 : 0)).toFixed(4));
    if (requiredNear > 0 && availNearForGas < requiredNear) {
      throw new Error(
        t(
          `NEAR 余额不足以支付中转/MPC Gas (需至少 ${requiredNear} NEAR，当前可用: ${availNearForGas.toFixed(4)} NEAR)`,
          `Insufficient NEAR for hub/MPC gas (Need >= ${requiredNear} NEAR, available: ${availNearForGas.toFixed(4)} NEAR)`
        )
      );
    }

    return { ok: true, requiredNear, availNearForGas, needsNearHub, needsMpcSign };
  }

  function getWalletDefaultRecipientForChain(wallet, blockchain) {
    if (!wallet) return '';
    const bc = String(blockchain || '').toLowerCase();
    if (bc === 'near') return wallet.nearNamedAccount || wallet.nearAddress || '';
    if (bc === 'sol') return wallet.solAddress || '';
    if (bc === 'btc' || bc === 'bitcoin') return wallet.btcAddress || '';
    if (bc === 'prl') return wallet.address || '';
    if (['eth', 'base', 'arb', 'bsc', 'hype', 'hood', 'arc', 'op', 'pol', 'avax'].includes(bc)) return wallet.mpcEvmAddress || wallet.evmAddress || '';
    return '';
  }

  function getTargetChainGasReserveInfo(wallet, fromToken, toToken, mode = 'auto', quoteData = null) {
    const empty = {
      showSelector: false,
      chainKey: '',
      gasSymbol: '',
      isNewSolAta: false,
      currentGasBal: 0,
      recommendedReserve: 0,
      extraReserve: 0,
      selectedReserve: 0
    };
    if (!wallet || !fromToken || !toToken) return empty;

    const toChain = String(toToken.blockchain || '').toLowerCase();
    const fromChain = String(fromToken.blockchain || '').toLowerCase();
    const sameChain = fromChain === toChain;
    const solNativeMint = 'So11111111111111111111111111111111111111112';
    const toContractLower = String(toToken.contractAddress || '').toLowerCase();
    const isBuyingSolToken = toChain === 'sol' && toToken.contractAddress && toToken.contractAddress !== solNativeMint;
    const isSolNative = toChain === 'sol' && (!toToken.contractAddress || toToken.contractAddress === solNativeMint);
    const isEvmNative = toChain !== 'sol' && (
      !toContractLower ||
      toContractLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      toContractLower === '0x0000000000000000000000000000000000000000' ||
      toContractLower === 'native' ||
      (toChain === 'arc' && toContractLower === '0x3600000000000000000000000000000000000000')
    );
    if (isSolNative || isEvmNative) return empty;
    const hasTrackedSolAtas = Boolean(wallet.solAtaMints && typeof wallet.solAtaMints === 'object');
    const isNewSolAta = Boolean(
      isBuyingSolToken && (
        hasTrackedSolAtas
          ? !wallet.solAtaMints[toToken.contractAddress]
          : !(wallet.splBalances && Object.prototype.hasOwnProperty.call(wallet.splBalances, toToken.contractAddress))
      )
    );

    // Cross-chain target gas reserve ONLY applies when a resolved route actually contains a DEST_DEX stage
    if (!(sameChain && toChain === 'sol' && isNewSolAta)) {
      const hasDestDex = Boolean(
        (quoteData && Array.isArray(quoteData.stages) && quoteData.stages.some((s) => s && s.type === 'DEST_DEX')) ||
        quoteData?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX' ||
        quoteData?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX'
      );
      if (!hasDestDex) return empty;
    }

    const nb = (wallet && wallet.nativeBalances) || {};
    const currentGasBal = Number(nb[toChain] || 0);
    const gasSymbolMap = { sol: 'SOL', eth: 'ETH', base: 'ETH', arb: 'ETH', op: 'ETH', hood: 'ETH', bsc: 'BNB', pol: 'POL', avax: 'AVAX', hype: 'HYPE', arc: 'USDC', near: 'NEAR' };
    const gasSymbol = gasSymbolMap[toChain] || toChain.toUpperCase();

    let minReq = 0;
    let extraReserve = 0;
    if (toChain === 'sol' && !isSolNative) {
      minReq = isNewSolAta ? 0.0035 : 0.001;
      extraReserve = 0.01;
    } else if (EVM_CHAIN_KEYS.includes(toChain) && !sameChain) {
      const defaults = { eth: 0.0015, base: 0.0003, arb: 0.0003, op: 0.0003, hood: 0.0003, bsc: 0.0005, pol: 0.05, avax: 0.005, hype: 0.0005, arc: 0.02 };
      const extras = { eth: 0.005, base: 0.002, arb: 0.002, op: 0.002, hood: 0.002, bsc: 0.002, pol: 0.2, avax: 0.02, hype: 0.005, arc: 0.05 };
      minReq = defaults[toChain] || 0.0005;
      extraReserve = extras[toChain] || 0.002;
    } else {
      return empty;
    }

    // Show selector when cross-chain to a non-native token (likely 2-stage DEX) or same-chain SOL -> new SPL token
    const isCrossToDexToken = !sameChain && (isBuyingSolToken || !isEvmNative);
    const showSelector = isCrossToDexToken || (sameChain && toChain === 'sol' && isNewSolAta);
    if (!showSelector) return empty;

    const missingGas = currentGasBal >= minReq ? 0 : minReq;
    const normalizedMode = mode === 'extra' ? 'extra' : 'auto';
    const selectedReserve = normalizedMode === 'extra' ? extraReserve : missingGas;

    return {
      showSelector: true,
      chainKey: toChain,
      gasSymbol,
      isNewSolAta,
      currentGasBal,
      recommendedReserve: missingGas,
      extraReserve,
      selectedReserve
    };
  }

  function computeNetSwapOutput(quoteData, toToken, gasReserveInfo, grossOutNumOverride = null) {
    const intents = getIntents();
    const toDec = toToken && typeof toToken.decimals === 'number' ? toToken.decimals : 18;
    const grossNum = grossOutNumOverride !== null && Number.isFinite(Number(grossOutNumOverride))
      ? Number(grossOutNumOverride)
      : Number((quoteData && (quoteData.amountOutFormatted || intents.fromBaseUnits(String(quoteData.amountOut || '0'), toDec))) || 0);
    if (!Number.isFinite(grossNum) || grossNum <= 0) return { netOutNum: 0, ratio: 1 };
    if (!quoteData || !gasReserveInfo || !gasReserveInfo.showSelector || !(gasReserveInfo.selectedReserve > 0)) {
      return { netOutNum: grossNum, ratio: 1 };
    }
    const stages = Array.isArray(quoteData.stages) ? quoteData.stages : [];
    const destIdx = stages.findIndex((s) => s && s.type === 'DEST_DEX');
    const stageIntermRaw = (destIdx > 0 && stages[destIdx - 1] && stages[destIdx - 1].expectedOut)
      ? stages[destIdx - 1].expectedOut
      : (quoteData.intermediaryRaw || null);
    if (stageIntermRaw) {
      const nativeDecimals = gasReserveInfo.chainKey === 'sol' ? 9 : 18;
      const bridgeNativeHuman = Number(intents.fromBaseUnits(String(stageIntermRaw), nativeDecimals));
      if (Number.isFinite(bridgeNativeHuman) && bridgeNativeHuman > 0) {
        if (gasReserveInfo.selectedReserve >= bridgeNativeHuman) {
          return { netOutNum: 0, ratio: 0 };
        }
        const ratio = (bridgeNativeHuman - gasReserveInfo.selectedReserve) / bridgeNativeHuman;
        return { netOutNum: grossNum * ratio, ratio };
      }
    }
    return { netOutNum: grossNum, ratio: 1 };
  }

  function updateSwapDetailsSummary() {
    const st = getState();
    const sumEl = $('swap-details-summary');
    if (!sumEl) return;
    const bps = Number(st.swap.slippageBps || 100);
    sumEl.textContent = `${t('滑点', 'Slippage')} ${(bps / 100).toString()}%`;
  }

  function toggleSwapDetails() {
    const body = $('swap-details-body');
    const btn = $('swap-details-toggle');
    if (!body || !btn) return;
    const isHidden = body.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
  }

  function renderSwapGasReserveRow(wallet, fromToken, toToken) {
    const st = getState();
    const row = $('swap-gas-reserve-row');
    const info = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', st.swap.quoteData || null);
    updateSwapDetailsSummary(wallet, fromToken, toToken, info);
    if (!row) return;
    if (!info.showSelector) {
      row.classList.add('hidden');
      return;
    }
    row.classList.remove('hidden');
    const lbl = $('swap-gas-reserve-label');
    if (lbl) {
      const tag = info.isNewSolAta ? t(' (含开户租金)', ' (+ATA rent)') : '';
      lbl.textContent = `${t('目标链 Gas 预留', 'Target Gas Reserve')}${tag}`;
    }
    const autoBtn = row.querySelector('[data-gas-mode="auto"]');
    const extraBtn = row.querySelector('[data-gas-mode="extra"]');
    if (autoBtn) autoBtn.textContent = `${t('默认', 'Auto')} (${info.recommendedReserve} ${info.gasSymbol})`;
    if (extraBtn) extraBtn.textContent = `${t('多留', 'Extra')} (${info.extraReserve} ${info.gasSymbol})`;
    row.querySelectorAll('[data-gas-mode]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-gas-mode') === (st.swap.gasReserveMode === 'extra' ? 'extra' : 'auto'));
    });
  }

  function setSwapGasReserveMode(mode) {
    const st = getState();
    st.swap.gasReserveMode = mode === 'extra' ? 'extra' : 'auto';
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    renderSwapGasReserveRow(wallet, fromToken, toToken);
    if (st.swap.quoteData && fromToken && toToken) {
      const info = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode, st.swap.quoteData);
      const { netOutNum, ratio } = computeNetSwapOutput(st.swap.quoteData, toToken, info);
      const amtOutText = formatBal(netOutNum, 6);
      st.swap.amountOut = amtOutText;
      if ($('swap-amount-out')) $('swap-amount-out').value = amtOutText;
      const outPrice = getTokenUnitPrice(toToken);
      const numUsdOut = st.swap.quoteData.amountOutUsd && Number(st.swap.quoteData.amountOutUsd) > 0
        ? Number(st.swap.quoteData.amountOutUsd) * ratio
        : (outPrice !== null && Number.isFinite(netOutNum) ? netOutNum * outPrice : null);
      st.swap._usdOutVal = numUsdOut;
      const usdOut = numUsdOut !== null ? formatUsd(numUsdOut) : '--';
      if ($('swap-usd-out')) $('swap-usd-out').textContent = usdOut;
    }
    updateSwapPrimaryButtonState();
  }

  function isSwapTokenNative(tok) {
    if (!tok) return false;
    const c = String(tok.contractAddress || '').toLowerCase();
    return !tok.contractAddress ||
      tok.blockchain === 'prl' ||
      tok.blockchain === 'btc' ||
      tok.contractAddress === 'So11111111111111111111111111111111111111112' ||
      c === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      tok.contractAddress === 'wrap.near' ||
      (tok.blockchain === 'arc' && c === '0x3600000000000000000000000000000000000000');
  }

  function doesSwapRouteRequireSelfRecipient(fromToken, toToken, quoteData = null) {
    if (!fromToken || !toToken) return false;
    if (isSameChainContractSwap(fromToken, toToken)) return true;

    const toBc = String(toToken.blockchain || '').toLowerCase();
    const arcUsdcLower = '0x3600000000000000000000000000000000000000';
    const evmNativeSentinel = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const solNativeMint = 'So11111111111111111111111111111111111111112';

    if (quoteData) {
      const compType = String(quoteData.compositeType || '');
      const stages = Array.isArray(quoteData.stages) ? quoteData.stages : [];
      if (compType === 'SMART_HUB_ROUTE' && stages.length > 0) {
        const lastType = stages[stages.length - 1]?.type;
        return lastType === 'DEST_DEX' || lastType === 'NEAR_SWAP';
      }
      if (['CROSS_CHAIN_TO_SOL_DEX', 'CROSS_CHAIN_TO_EVM_DEX', 'PRL_TO_NEAR_REF', 'PRL_TO_NEAR_DCL'].includes(compType)) {
        return true;
      }
      if (['EVM_TO_ARC_MAINNET', 'CROSS_CHAIN_TO_ARC_MAINNET'].includes(compType)) {
        const arcDestLower = String(toToken.contractAddress || arcUsdcLower).toLowerCase();
        return Boolean(toToken.contractAddress && arcDestLower !== arcUsdcLower && arcDestLower !== evmNativeSentinel);
      }
      return false;
    }

    if (isPrlSwapToken(fromToken) && toBc === 'near' && !isPrlSwapToken(toToken)) {
      return true;
    }
    if (toBc === 'arc') {
      const arcDestLower = String(toToken.contractAddress || arcUsdcLower).toLowerCase();
      return Boolean(toToken.contractAddress && arcDestLower !== arcUsdcLower && arcDestLower !== evmNativeSentinel);
    }

    const intents = getIntents();
    const resolvedDest = (intents && typeof intents.resolveOneClickAssetId === 'function')
      ? intents.resolveOneClickAssetId(toToken, toBc)
      : String(toToken.assetId || '');
    const isOneClickDirect = /^(nep141:|nep245:|1cs_v1:)/i.test(String(resolvedDest || ''));

    if (toBc === 'sol' && toToken.contractAddress && toToken.contractAddress !== solNativeMint && !isOneClickDirect) {
      return true;
    }
    if (['eth', 'base', 'arb', 'op', 'pol', 'avax', 'bsc', 'hood'].includes(toBc)
      && toToken.contractAddress
      && toToken.contractAddress.toLowerCase() !== evmNativeSentinel
      && !isOneClickDirect) {
      return true;
    }
    return false;
  }

  function syncSwapRecipientInputState(wallet, fromToken, toToken, quoteData = null) {
    const st = getState();
    const recInput = $('swap-recipient-input');
    const contactsBtn = $('swap-recipient-contacts-btn');
    if (!recInput) return false;
    const locked = doesSwapRouteRequireSelfRecipient(fromToken, toToken, quoteData);
    if (locked) {
      recInput.value = getWalletDefaultRecipientForChain(wallet, toToken?.blockchain);
      recInput.disabled = true;
      if (contactsBtn) contactsBtn.disabled = true;
    } else {
      recInput.disabled = false;
      if (contactsBtn) contactsBtn.disabled = false;
      if (!st.swap.recipientAddress && toToken) {
        st.swap.recipientAddress = getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
      }
      recInput.value = st.swap.recipientAddress || '';
    }
    return locked;
  }

  function computeSwapPriceImpact(usdIn, usdOut) {
    const inVal = Number(usdIn);
    const outVal = Number(usdOut);
    if (!Number.isFinite(inVal) || inVal <= 0 || !Number.isFinite(outVal) || outVal < 0) {
      return { pct: null, level: 'none', usdIn: null, usdOut: null };
    }
    const rawPct = ((inVal - outVal) / inVal) * 100;
    const pct = Number(Math.max(0, rawPct).toFixed(2));
    const level = pct >= 15 ? 'critical' : (pct >= 5 ? 'high' : 'none');
    return { pct, level, usdIn: inVal, usdOut: outVal };
  }

  function updateSwapPriceImpactUI() {
    const st = getState();
    const banner = $('swap-price-impact-banner');
    if (!banner) return null;
    const hasQuote = Boolean(st.swap.quoteData && Number(st.swap.amountOut) > 0);
    const impact = hasQuote
      ? computeSwapPriceImpact(st.swap._usdInVal, st.swap._usdOutVal)
      : { pct: null, level: 'none', usdIn: null, usdOut: null };
    if (!hasQuote || impact.level === 'none') {
      banner.classList.add('hidden');
      banner.classList.remove('is-high', 'is-critical');
      banner.textContent = '';
      return impact;
    }
    banner.classList.remove('hidden');
    if (impact.level === 'critical') {
      banner.classList.remove('is-high');
      banner.classList.add('is-critical');
      banner.textContent = t(
        `🚨 价格影响极大 (-${impact.pct.toFixed(1)}%)：支付 ${formatUsd(impact.usdIn)}，仅得约 ${formatUsd(impact.usdOut)}，请谨慎确认`,
        `🚨 Severe price impact (-${impact.pct.toFixed(1)}%): Paying ${formatUsd(impact.usdIn)} for ~${formatUsd(impact.usdOut)}. Proceed with caution`
      );
    } else {
      banner.classList.remove('is-critical');
      banner.classList.add('is-high');
      banner.textContent = t(
        `⚠️ 价差偏大 (-${impact.pct.toFixed(1)}%)：支付 ${formatUsd(impact.usdIn)}，预计约得 ${formatUsd(impact.usdOut)}`,
        `⚠️ High price impact (-${impact.pct.toFixed(1)}%): Paying ${formatUsd(impact.usdIn)} for ~${formatUsd(impact.usdOut)}`
      );
    }
    return impact;
  }

  function updateSwapUsdEstimates() {
    const st = getState();
    const amt = Number(st.swap.amountIn);
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    const q = st.swap.quoteData || null;
    const inEl = $('swap-usd-in');
    const outEl = $('swap-usd-out');
    let numIn = null;
    if (Number.isFinite(amt) && amt > 0 && fromToken) {
      const qUsdIn = q && Number(q.amountInUsd) > 0 ? Number(q.amountInUsd) : null;
      const unitIn = getTokenUnitPrice(fromToken);
      numIn = qUsdIn !== null ? qUsdIn : (unitIn !== null ? amt * unitIn : null);
    }
    st.swap._usdInVal = numIn;
    if (inEl) {
      inEl.textContent = numIn !== null ? formatUsd(numIn) : '--';
    }
    const outAmt = Number(st.swap.amountOut);
    let numOut = null;
    if (Number.isFinite(outAmt) && outAmt > 0 && toToken && q) {
      const wallet = st.getActiveWallet();
      const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', q);
      const { ratio } = computeNetSwapOutput(q, toToken, gInfo);
      const qUsdOut = Number(q.amountOutUsd) > 0 ? Number(q.amountOutUsd) * ratio : null;
      const unitOut = getTokenUnitPrice(toToken);
      numOut = qUsdOut !== null ? qUsdOut : (unitOut !== null ? outAmt * unitOut : null);
    }
    if (q && Number.isFinite(outAmt) && outAmt > 0) {
      st.swap._usdOutVal = numOut;
      if (outEl) outEl.textContent = numOut !== null ? formatUsd(numOut) : '--';
    } else if (!Number.isFinite(outAmt) || outAmt <= 0) {
      st.swap._usdOutVal = null;
      if (outEl) outEl.textContent = '--';
    }
  }

  function evaluateSwapButtonState({
    wallet,
    fromToken,
    toToken,
    amountIn,
    quoteData = null,
    quoteError = '',
    isQuoting = false,
    isExecuting = false,
    gasReserveMode = 'auto',
    priceImpact = null
  } = {}) {
    if (isExecuting) {
      return { disabled: true, isError: false, isWarning: false, text: t('执行中...', 'Executing...'), reason: 'executing' };
    }
    if (fromToken && !isSwapOriginSupported(fromToken)) {
      return {
        disabled: true,
        isError: true,
        isWarning: false,
        text: t(
          `暂不支持从 ${String(fromToken.blockchain || '').toUpperCase()} 发起闪兑`,
          `Swaps from ${String(fromToken.blockchain || '').toUpperCase()} are not supported yet`
        ),
        reason: 'unsupported_origin'
      };
    }
    const amt = Number(amountIn);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: false, isError: false, isWarning: false, text: t('确认闪兑', 'Execute Swap'), reason: 'empty' };
    }
    if (wallet && fromToken && toToken) {
      const contracts = getContracts();
      const avail = getWalletNativeBalanceForToken(wallet, fromToken.blockchain, fromToken.symbol, fromToken.contractAddress);
      const isNative = isSwapTokenNative(fromToken);
      const gasReserveInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, gasReserveMode || 'auto', quoteData);
      if (contracts && typeof contracts.validateSufficientChainBalance === 'function') {
        try {
          contracts.validateSufficientChainBalance({
            wallet,
            chain: fromToken.blockchain,
            tokenSymbol: fromToken.symbol,
            amount: amt,
            isNative,
            tokenBalance: avail !== null ? avail : 0,
            gasBuffer: isNative && fromToken.blockchain === 'sol' && gasReserveInfo.selectedReserve > 0
              ? gasReserveInfo.selectedReserve
              : null
          });
        } catch (_) {
          const effectiveAvail = avail !== null ? avail : 0;
          if (amt > effectiveAvail) {
            return {
              disabled: true,
              isError: true,
              isWarning: false,
              text: t(`${fromToken.symbol} 余额不足`, `Insufficient ${fromToken.symbol}`),
              reason: 'insufficient_balance'
            };
          }
          const gasMap = { sol: 'SOL', near: 'NEAR', prl: 'PRL', btc: 'BTC', bsc: 'BNB', pol: 'POL', avax: 'AVAX', hype: 'HYPE', arc: 'USDC' };
          const gasSym = gasMap[String(fromToken.blockchain || '').toLowerCase()] || 'ETH';
          return {
            disabled: true,
            isError: true,
            isWarning: false,
            text: t(`${gasSym} Gas 余额不足`, `Insufficient ${gasSym} for gas`),
            reason: 'insufficient_gas'
          };
        }
      }
      try {
        validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData, amountIn: amt });
      } catch (_) {
        return {
          disabled: true,
          isError: true,
          isWarning: false,
          text: t('NEAR Gas 余额不足', 'Insufficient NEAR for gas'),
          reason: 'insufficient_near_gas'
        };
      }
    }
    if (quoteError) {
      return { disabled: true, isError: true, isWarning: false, text: String(quoteError), reason: 'quote_error' };
    }
    if (isQuoting) {
      return { disabled: true, isError: false, isWarning: false, text: t('报价获取中...', 'Fetching quote...'), reason: 'quoting' };
    }
    if (priceImpact && priceImpact.level === 'critical' && Number.isFinite(priceImpact.pct)) {
      return {
        disabled: false,
        isError: false,
        isWarning: true,
        text: t(`高价差 (-${priceImpact.pct.toFixed(1)}%) · 仍要闪兑`, `High Impact (-${priceImpact.pct.toFixed(1)}%) · Swap Anyway`),
        reason: 'ready_high_impact'
      };
    }
    return { disabled: false, isError: false, isWarning: false, text: t('确认闪兑', 'Execute Swap'), reason: 'ready' };
  }

  function updateSwapPrimaryButtonState() {
    const st = getState();
    const btn = $('btn-execute-swap');
    const impact = updateSwapPriceImpactUI();
    if (!btn) return null;
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    const view = evaluateSwapButtonState({
      wallet,
      fromToken,
      toToken,
      amountIn: st.swap.amountIn,
      quoteData: st.swap.quoteData || null,
      quoteError: st.swap._lastError || '',
      isQuoting: Boolean(st.swap._quoting),
      isExecuting: Boolean(st.swap._executing),
      gasReserveMode: st.swap.gasReserveMode || 'auto',
      priceImpact: impact
    });
    btn.disabled = Boolean(view.disabled);
    if (btn.classList) {
      btn.classList.toggle('is-error', Boolean(view.isError));
      btn.classList.toggle('is-warning', Boolean(view.isWarning));
    }
    btn.textContent = view.text;
    return view;
  }

  const STABLECOIN_SYMBOLS = new Set([
    'USDC', 'USDT', 'DAI', 'USDG', 'USDE', 'EURC', 'FDUSD', 'TUSD', 'USDS', 'PYUSD', 'FRAX', 'USD1', 'USDC.E', 'USDT.E'
  ]);

  function isStablecoinSymbol(sym) {
    return STABLECOIN_SYMBOLS.has(String(sym || '').trim().replace(/^\$/, '').toUpperCase());
  }

  function renderSwapRateDisplay(fromToken, toToken, rawOutPerIn = null) {
    const st = getState();
    const rateEl = $('swap-quote-rate');
    if (!rateEl) return '';
    if (!fromToken || !toToken) {
      rateEl.textContent = '--';
      return '--';
    }
    let rateOutPerIn = Number(rawOutPerIn);
    if (!Number.isFinite(rateOutPerIn) || rateOutPerIn <= 0) {
      rateOutPerIn = Number(st.swap._quoteRateOutPerIn);
    }
    if (!Number.isFinite(rateOutPerIn) || rateOutPerIn <= 0) {
      const pIn = getTokenUnitPrice(fromToken);
      const pOut = getTokenUnitPrice(toToken);
      if (pIn > 0 && pOut > 0) rateOutPerIn = pIn / pOut;
    }
    if (!Number.isFinite(rateOutPerIn) || rateOutPerIn <= 0) {
      rateEl.textContent = '--';
      return '--';
    }
    const text = st.swap.rateInverted
      ? `1 ${toToken.symbol} ≈ ${formatBal(1 / rateOutPerIn, 5)} ${fromToken.symbol} ⇄`
      : `1 ${fromToken.symbol} ≈ ${formatBal(rateOutPerIn, 5)} ${toToken.symbol} ⇄`;
    rateEl.textContent = text;
    return text;
  }

  function toggleSwapRateOrientation() {
    const st = getState();
    st.swap.rateInverted = !st.swap.rateInverted;
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    renderSwapRateDisplay(fromToken, toToken);
  }

  function renderSwapView() {
    const st = getState();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const amtInputEl = $('swap-amount-in');
    const fromPickerBtn = $('swap-from-token-btn');
    const toPickerBtn = $('swap-to-token-btn');
    if (amtInputEl) amtInputEl.disabled = false;
    if (fromPickerBtn) fromPickerBtn.disabled = false;
    if (toPickerBtn) toPickerBtn.disabled = false;

    const errBanner = $('swap-error-banner');
    if (errBanner) {
      errBanner.classList.add('hidden');
      errBanner.textContent = '';
    }

    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (fromToken) st.swap.fromAssetId = fromToken.assetId;
    if (toToken) st.swap.toAssetId = toToken.assetId;

    const renderBtn = (elId, tok) => {
      const btn = $(elId);
      if (!btn || !tok) return;
      btn.innerHTML = `${tokens.renderTokenIconWithBadge(tok, 24, true)}<span>${escapeHtml(tok.symbol)}</span><span style="opacity:0.55;font-size:10px;">▾</span>`;
    };
    renderBtn('swap-from-token-btn', fromToken);
    renderBtn('swap-to-token-btn', toToken);

    const fromBal = getSwapTokenAvailableBalance(fromToken);
    const toBal = getSwapTokenAvailableBalance(toToken);
    if ($('swap-from-balance')) $('swap-from-balance').textContent = `${formatBal(fromBal, 6)} ${fromToken ? fromToken.symbol : ''}`;
    if ($('swap-to-balance')) $('swap-to-balance').textContent = `${formatBal(toBal, 6)} ${toToken ? toToken.symbol : ''}`;
    const formatNetAndPrice = (tok) => {
      if (!tok) return '--';
      const net = tok.networkName || tok.blockchain || '--';
      const px = getTokenUnitPrice(tok);
      const pxStr = formatTokenPrice(px);
      return pxStr !== '--' ? `${net} · ${pxStr}` : net;
    };
    if ($('swap-from-net-label')) $('swap-from-net-label').textContent = formatNetAndPrice(fromToken);
    if ($('swap-to-net-label')) $('swap-to-net-label').textContent = formatNetAndPrice(toToken);
    renderSwapRateDisplay(fromToken, toToken);

    const sameChainDex = isSameChainContractSwap(fromToken, toToken);
    const routeBadge = $('swap-auto-route-badge');
    if (routeBadge && fromToken && toToken) {
      const fromMeta = tokens.getChainMeta(fromToken.blockchain);
      const toMeta = tokens.getChainMeta(toToken.blockchain);
      if (sameChainDex) {
        if (fromToken.blockchain === 'near') {
          routeBadge.textContent = t('NEAR 多池比价 (Ref + Rhea CLMM)', 'NEAR Multi-Pool (Ref + Rhea CLMM)');
        } else if (fromToken.blockchain === 'sol') {
          routeBadge.textContent = t('Solana 多池比价 (Jupiter + Raydium)', 'Solana Multi-Pool (Jupiter + Raydium)');
        } else if (fromToken.blockchain === 'arc') {
          routeBadge.textContent = t('Arc 主网 DEX 多池聚合 (KyberSwap + LI.FI)', 'Arc Mainnet DEX Aggregator (KyberSwap + LI.FI)');
        } else {
          routeBadge.textContent = `${fromMeta.shortName} ${t('多池聚合 (Kyber + Para + OpenOcean)', 'Multi-Pool DEX (Kyber + Para)')}`;
        }
      } else if (toToken.category === 'xstock' || fromToken.category === 'xstock') {
        routeBadge.textContent = `${fromMeta.shortName} ➔ ${toMeta.shortName} · ${t('xStocks 跨链聚合', 'xStocks Bridge + DEX')}`;
      } else if (isPrlSwapToken(fromToken) !== isPrlSwapToken(toToken)) {
        routeBadge.textContent = t('多池跨链聚合', 'Multi-Pool Cross-Chain');
      } else {
        routeBadge.textContent = `${fromMeta.shortName} ➔ ${toMeta.shortName} · ${t('超级多池聚合', 'Super-Aggregator')}`;
      }
      routeBadge.title = routeBadge.textContent || '';
    }

    syncSwapRecipientInputState(wallet, fromToken, toToken, st.swap.quoteData || null);

    const amtInp = $('swap-amount-in');
    if (amtInp && amtInp.value !== String(st.swap.amountIn || '')) {
      amtInp.value = st.swap.amountIn || '';
    }
    if ($('swap-amount-out')) {
      $('swap-amount-out').value = st.swap.amountOut || '';
    }
    renderSwapGasReserveRow(wallet, fromToken, toToken);
    updateSwapUsdEstimates();
    updateSwapPrimaryButtonState();

    if (typeof document !== 'undefined') {
      document.querySelectorAll('#swap-quote-meta [data-bps]').forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-bps')) === Number(st.swap.slippageBps));
      });
    }

    renderSwapOrderCard();
    if (st.swap.panelMode === 'limit') {
      renderLimitOrderView();
    }
  }

  function setSwapSlippage(bps) {
    const st = getState();
    st.swap.slippageBps = Number(bps) || 100;
    renderSwapView();
    if (st.swap.amountIn) scheduleSwapQuote();
  }

  function handleSwapRecipientInput() {
    getState().swap.recipientAddress = ($('swap-recipient-input')?.value || '').trim();
  }

  function resetSwapQuoteDisplay() {
    const st = getState();
    st.swap.amountOut = '';
    st.swap.quoteData = null;
    st.swap._quoteRateOutPerIn = null;
    if ($('swap-amount-out')) $('swap-amount-out').value = '';
    if ($('swap-quote-route')) $('swap-quote-route').textContent = '--';
    if ($('swap-quote-fee')) $('swap-quote-fee').textContent = '--';
    if ($('swap-usd-out')) $('swap-usd-out').textContent = '--';
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    renderSwapRateDisplay(fromToken, toToken, null);
    if (wallet && fromToken && toToken) {
      syncSwapRecipientInputState(wallet, fromToken, toToken, null);
      renderSwapGasReserveRow(wallet, fromToken, toToken);
    }
    updateSwapUsdEstimates();
  }

  function handleSwapAmountInput() {
    const st = getState();
    st.swap.amountIn = ($('swap-amount-in')?.value || '').trim();
    st.swap._lastError = '';
    st.swap._quoting = false;
    resetSwapQuoteDisplay();
    updateSwapPrimaryButtonState();
    scheduleSwapQuote();
  }

  function setSwapMaxAmount() {
    const st = getState();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const bal = getSwapTokenAvailableBalance(fromToken);
    if (!fromToken || bal === null || bal <= 0) return;

    const reserves = { sol: 0.002, eth: 0.0015, base: 0.0002, arb: 0.0002, bsc: 0.0005, op: 0.0002, pol: 0.01, avax: 0.005, hype: 0.0005, hood: 0.0002, arc: 0.02, near: 0.005, prl: 0.003, btc: 0.0001 };
    const isNative = isSwapTokenNative(fromToken);
    const maxVal = isNative ? Math.max(0, bal - (reserves[fromToken.blockchain] || 0)) : bal;
    st.swap.amountIn = maxVal > 0 ? Number(maxVal.toFixed(6)).toString() : '0';
    if ($('swap-amount-in')) $('swap-amount-in').value = st.swap.amountIn;
    handleSwapAmountInput();
  }

  function flipSwapTokens() {
    const st = getState();
    const tmp = st.swap.fromAssetId;
    st.swap.fromAssetId = st.swap.toAssetId;
    st.swap.toAssetId = tmp;
    st.swap.recipientAddress = '';
    st.swap.rateInverted = false;
    st.swap._quoteRateOutPerIn = null;
    st.swap._quoting = false;
    st.swap._lastError = '';
    if (typeof st.saveSwapPair === 'function') st.saveSwapPair();
    setSwapError('');
    resetSwapQuoteDisplay();
    renderSwapView();
    if (st.swap.amountIn) scheduleSwapQuote();
  }

  const _swapQuoteCache = new Map();

  function scheduleSwapQuote() {
    if (_swapQuoteTimer) clearTimeout(_swapQuoteTimer);
    const st = getState();
    if (st && st.swap && st.swap._quoteAbortCtrl) {
      try { st.swap._quoteAbortCtrl.abort(); } catch (_) {}
      st.swap._quoteAbortCtrl = null;
    }
    st.swap._quoting = false;
    st.swap._lastError = '';
    resetSwapQuoteDisplay();
    updateSwapPrimaryButtonState();
    _swapQuoteTimer = setTimeout(() => { fetchLiveSwapQuoteAsync(); }, 350);
  }

  function setSwapError(msg) {
    const st = getState();
    const el = $('swap-error-banner');
    const routeEl = $('swap-quote-route');
    if (el) {
      el.classList.add('hidden');
      el.textContent = '';
    }
    st.swap._lastError = msg ? String(msg) : '';
    if (msg && routeEl && (!routeEl.textContent || routeEl.textContent === '--' || routeEl.textContent.includes('比价') || routeEl.textContent.includes('Comparing'))) {
      routeEl.textContent = msg;
    }
    updateSwapPrimaryButtonState();
  }

  async function fetchLiveSwapQuoteAsync() {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const amt = Number(st.swap.amountIn);
    if (!Number.isFinite(amt) || amt <= 0) {
      st.swap._quoting = false;
      setSwapError('');
      return;
    }

    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (!fromToken || !toToken || fromToken.assetId === toToken.assetId) return;

    updateSwapUsdEstimates();

    if (!isSwapOriginSupported(fromToken)) {
      const unsupMsg = t(`暂不支持从 ${String(fromToken.blockchain || '').toUpperCase()} 发起闪兑`, `Swaps from ${String(fromToken.blockchain || '').toUpperCase()} are not supported yet`);
      st.swap._quoting = false;
      resetSwapQuoteDisplay();
      setSwapError(unsupMsg);
      return;
    }

    const sameChainDex = isSameChainContractSwap(fromToken, toToken);
    const amountRaw = intents.toBaseUnits(st.swap.amountIn, fromToken.decimals);
    if (amountRaw === '0') {
      st.swap._quoting = false;
      updateSwapPrimaryButtonState();
      return;
    }

    const reqSnapshot = {
      amountIn: st.swap.amountIn,
      fromId: fromToken.assetId,
      toId: toToken.assetId
    };
    const isStaleReq = () => st.swap.amountIn !== reqSnapshot.amountIn || st.swap.fromAssetId !== reqSnapshot.fromId || st.swap.toAssetId !== reqSnapshot.toId;

    const cacheKey = `${fromToken.assetId}|${toToken.assetId}|${amountRaw}|${st.swap.slippageBps || 100}|${st.swap.recipientAddress || ''}`;
    const cached = _swapQuoteCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < 15000)) {
      st.swap._quoting = false;
      st.swap._lastError = '';
      setSwapError('');
      st.swap.quoteData = cached.quoteData;
      st.swap.quoteSource = cached.quoteSource;
      const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', cached.quoteData);
      const { netOutNum, ratio } = computeNetSwapOutput(cached.quoteData, toToken, gInfo, cached.grossOutNum);
      const netOutText = formatBal(netOutNum, 6);
      const unitIn = getTokenUnitPrice(fromToken);
      const outPrice = getTokenUnitPrice(toToken);
      const numUsdIn = cached.usdInRaw && Number(cached.usdInRaw) > 0
        ? Number(cached.usdInRaw)
        : (unitIn !== null ? amt * unitIn : null);
      const numUsdOut = cached.usdOutRaw && Number(cached.usdOutRaw) > 0
        ? Number(cached.usdOutRaw) * ratio
        : (outPrice !== null && Number.isFinite(netOutNum) ? netOutNum * outPrice : null);
      st.swap._usdInVal = numUsdIn;
      st.swap._usdOutVal = numUsdOut;
      const usdInText = numUsdIn !== null ? formatUsd(numUsdIn) : '--';
      const netUsdOut = numUsdOut !== null ? formatUsd(numUsdOut) : (cached.usdOut || '--');
      st.swap.amountOut = netOutText;
      st.swap._quoteRateOutPerIn = Number.isFinite(cached.rateOutPerIn) && cached.rateOutPerIn > 0
        ? cached.rateOutPerIn
        : (amt > 0 && cached.grossOutNum > 0 ? cached.grossOutNum / amt : null);
      if ($('swap-amount-out')) $('swap-amount-out').value = netOutText;
      if ($('swap-quote-route')) $('swap-quote-route').textContent = cached.quoteSource;
      if ($('swap-auto-route-badge')) {
        $('swap-auto-route-badge').textContent = cached.quoteSource;
        $('swap-auto-route-badge').title = cached.quoteSource;
      }
      if ($('swap-quote-fee')) {
        const feeBps = Number(cached.quoteData?.serviceFeeBps ?? cached.feeBps ?? 0);
        $('swap-quote-fee').textContent = feeBps > 0 ? `${(feeBps / 100).toString()}%` : '0%';
      }
      renderSwapRateDisplay(fromToken, toToken, st.swap._quoteRateOutPerIn);
      if ($('swap-usd-in')) $('swap-usd-in').textContent = usdInText;
      if ($('swap-usd-out')) $('swap-usd-out').textContent = netUsdOut;
      syncSwapRecipientInputState(wallet, fromToken, toToken, cached.quoteData);
      renderSwapGasReserveRow(wallet, fromToken, toToken);
      updateSwapPrimaryButtonState();
      return;
    }

    if (st.swap._quoteAbortCtrl) {
      try { st.swap._quoteAbortCtrl.abort(); } catch (_) {}
    }
    const abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    st.swap._quoteAbortCtrl = abortCtrl;
    const reqSignal = abortCtrl ? abortCtrl.signal : null;
    const isCancelledOrStale = () => Boolean((reqSignal && reqSignal.aborted) || isStaleReq());

    const applyAndCacheQuote = (quoteData, quoteSource, outHumanNum, usdInRaw, usdOutRaw) => {
      st.swap._quoting = false;
      st.swap._lastError = '';
      setSwapError('');
      const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', quoteData);
      const { netOutNum, ratio } = computeNetSwapOutput(quoteData, toToken, gInfo, outHumanNum);
      const amtOutText = formatBal(netOutNum, 6);
      const rateOutPerIn = (amt > 0 && outHumanNum > 0) ? (outHumanNum / amt) : null;
      const rateText = rateOutPerIn ? `1 ${fromToken.symbol} ≈ ${formatBal(rateOutPerIn, 5)} ${toToken.symbol}` : '';
      const inPrice = getTokenUnitPrice(fromToken);
      const outPrice = getTokenUnitPrice(toToken);
      const numUsdIn = usdInRaw && Number(usdInRaw) > 0
        ? Number(usdInRaw)
        : (inPrice !== null ? amt * inPrice : null);
      const numUsdOut = usdOutRaw && Number(usdOutRaw) > 0
        ? Number(usdOutRaw) * ratio
        : (outPrice !== null && Number.isFinite(netOutNum) ? netOutNum * outPrice : null);
      st.swap._usdInVal = numUsdIn;
      st.swap._usdOutVal = numUsdOut;
      const usdIn = numUsdIn !== null ? formatUsd(numUsdIn) : '--';
      const usdOut = numUsdOut !== null ? formatUsd(numUsdOut) : '--';
      const feeBps = Number(quoteData?.serviceFeeBps ?? 0);
      st.swap.quoteData = quoteData;
      st.swap.quoteSource = quoteSource;
      st.swap.amountOut = amtOutText;
      st.swap._quoteRateOutPerIn = rateOutPerIn;
      if ($('swap-amount-out')) $('swap-amount-out').value = amtOutText;
      if ($('swap-quote-route')) $('swap-quote-route').textContent = quoteSource;
      if ($('swap-auto-route-badge')) {
        $('swap-auto-route-badge').textContent = quoteSource;
        $('swap-auto-route-badge').title = quoteSource;
      }
      if ($('swap-quote-fee')) $('swap-quote-fee').textContent = feeBps > 0 ? `${(feeBps / 100).toString()}%` : '0%';
      renderSwapRateDisplay(fromToken, toToken, rateOutPerIn);
      if ($('swap-usd-in')) $('swap-usd-in').textContent = usdIn;
      if ($('swap-usd-out')) $('swap-usd-out').textContent = usdOut;
      syncSwapRecipientInputState(wallet, fromToken, toToken, quoteData);
      renderSwapGasReserveRow(wallet, fromToken, toToken);
      updateSwapPrimaryButtonState();
      if (_swapQuoteCache.size > 40) _swapQuoteCache.clear();
      _swapQuoteCache.set(cacheKey, { ts: Date.now(), quoteData, quoteSource, feeBps, grossOutNum: outHumanNum, rateOutPerIn, amountOut: amtOutText, rateText, usdInRaw: usdInRaw || null, usdOutRaw, usdOut });
    };

    st.swap._quoting = true;
    st.swap._lastError = '';
    if ($('swap-quote-route')) $('swap-quote-route').textContent = t('多池比价中...', 'Comparing pools...');
    updateSwapPrimaryButtonState();

    try {

      if (sameChainDex && fromToken.blockchain !== 'near') {
        if (fromToken.blockchain === 'sol') {
          const jQuote = await contracts.quoteSolanaJupiterSwap({
            inputMint: fromToken.contractAddress,
            outputMint: toToken.contractAddress,
            amountRaw,
            slippageBps: st.swap.slippageBps,
            platformFeeBps: 0,
            signal: reqSignal
          });
          if (isCancelledOrStale()) return;
          const outHuman = contracts.fromBaseUnits(jQuote.outAmount, toToken.decimals);
          const routeText = jQuote.routeLabel || jQuote.bestSource || 'Solana Jupiter V1';
          applyAndCacheQuote({ serviceFeeBps: 0, ...jQuote }, routeText, Number(outHuman), null, null);
          return;
        }

        const evmQuote = await contracts.quoteEvmDexSwap({
          chainKey: fromToken.blockchain,
          srcToken: fromToken.contractAddress,
          destToken: toToken.contractAddress,
          amountRaw,
          srcDecimals: fromToken.decimals,
          destDecimals: toToken.decimals,
          slippageBps: st.swap.slippageBps,
          feeBps: 0,
          fromAddress: wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '',
          signal: reqSignal
        });
        if (isCancelledOrStale()) return;
        if (!evmQuote.ok) {
          st.swap._quoting = false;
          resetSwapQuoteDisplay();
          setSwapError(evmQuote.error || t('暂无链上报价', 'No DEX quote'));
          return;
        }
        const routeText = evmQuote.routeLabel || evmQuote.label;
        applyAndCacheQuote({ serviceFeeBps: 0, ...evmQuote }, routeText, Number(evmQuote.amountOutFormatted), evmQuote.amountInUsd, evmQuote.amountOutUsd);
        return;
      }

      // Super-Aggregator: NEAR multi-pool (Ref V2 + Rhea CLMM + 1Click), PRL composite, Direct 1Click & 2-Stage Cross-Chain + DEX Relay
      const nearId = wallet.nearNamedAccount || wallet.nearAddress;
      const recipient = doesSwapRouteRequireSelfRecipient(fromToken, toToken, null)
        ? (getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || nearId)
        : (st.swap.recipientAddress || getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || nearId);
      const refundTo = getWalletDefaultRecipientForChain(wallet, fromToken.blockchain) || nearId;

      const q = await intents.quoteCrossChainWithDexRelay({
        fromToken,
        toToken,
        amountRaw,
        slippageBps: st.swap.slippageBps,
        recipient,
        refundTo,
        nearAccountId: nearId,
        solAddress: wallet.solAddress,
        evmAddress: wallet.mpcEvmAddress || wallet.evmAddress,
        signal: reqSignal
      });
      if (isCancelledOrStale()) return;
      if (!q || !q.ok) {
        st.swap._quoting = false;
        resetSwapQuoteDisplay();
        setSwapError((q && q.error) || t('暂无报价', 'No quote'));
        return;
      }
      const outHuman = q.amountOutFormatted || intents.fromBaseUnits(q.amountOut || '0', toToken.decimals);
      const routeText = q.routeLabel || (q.compositeType === 'PRL_TO_NEAR_DCL'
        ? (q.bridgeQuote ? '1Click (Pearl➔NEAR) + Rhea DCL' : 'Ref + Rhea')
        : (q.compositeType === 'PRL_TO_EXTERNAL' || q.compositeType === 'EXTERNAL_TO_PRL'
            ? 'Ref + 1Click'
            : (q.compositeType === 'PRL_TO_NEAR_REF' || q.compositeType === 'NEAR_TO_PRL_REF'
                ? (q.bridgeQuote ? '1Click (Pearl➔NEAR) + Ref Finance' : 'Ref Finance')
                : '1Click Cross-Chain')));
      applyAndCacheQuote(q, routeText, Number(outHuman), q.amountInUsd, q.amountOutUsd);
    } catch (e) {
      if (isCancelledOrStale() || (e && (e.name === 'AbortError' || /abort|取消/i.test(String(e.message || ''))))) return;
      st.swap._quoting = false;
      resetSwapQuoteDisplay();
      setSwapError(e && e.message ? e.message : t('询价失败', 'Quote failed'));
    } finally {
      if (st.swap._quoteAbortCtrl === abortCtrl) st.swap._quoteAbortCtrl = null;
    }
  }

  async function broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress }) {
    const contracts = getContracts();
    const bc = String(fromToken.blockchain || '').toLowerCase();
    if (bc === 'near' && fromToken.symbol === 'NEAR') {
      return contracts.signAndSendNearTransfer({ wallet, receiverId: depositAddress, amountNear: amt });
    }
    if (bc === 'near' && fromToken.contractAddress && typeof contracts.executeNearNep141Transfer === 'function') {
      return contracts.executeNearNep141Transfer({
        wallet,
        tokenContract: fromToken.contractAddress,
        receiverId: depositAddress,
        amount: amt,
        decimals: fromToken.decimals,
        tokenSymbol: fromToken.symbol,
        tokenBalance: avail
      });
    }
    if (bc === 'sol') {
      const isNativeSol = !fromToken.contractAddress ||
        fromToken.contractAddress === 'So11111111111111111111111111111111111111112' ||
        fromToken.symbol === 'SOL';
      if (isNativeSol) {
        return contracts.executeSolanaNativeTransfer({ wallet, toAddress: depositAddress, amountSol: amt });
      }
      return contracts.executeSolanaSplTransfer({
        wallet,
        mintAddress: fromToken.contractAddress,
        toAddress: depositAddress,
        amount: amt,
        decimals: fromToken.decimals || 6,
        tokenBalance: avail
      });
    }
    if (bc === 'prl') {
      const res = await contracts.executePearlTransfer({ wallet, toAddress: depositAddress, amountPrl: amt, feeDeductMode: 'extra' });
      applyOptimisticChainSpend(wallet, 'prl', amt, Number(res && res.feePrl) || 0, res && res.txHash);
      return res;
    }
    if (bc === 'btc') {
      const res = await contracts.executeBitcoinTransfer({ wallet, toAddress: depositAddress, amountBtc: amt, feeDeductMode: 'extra' });
      applyOptimisticChainSpend(wallet, 'btc', amt, Number(res && res.feeBtc) || 0, res && res.txHash);
      return res;
    }
    if (contracts && contracts.EVM_CHAINS && contracts.EVM_CHAINS[bc]) {
      await ensureEthersLoaded();
      return contracts.executeEvmTransfer({
        wallet,
        chainKey: bc,
        toAddress: depositAddress,
        amount: amt,
        tokenContract: fromToken.contractAddress,
        decimals: fromToken.decimals,
        tokenBalance: avail
      });
    }
    throw new Error(t(`暂不支持从 ${bc.toUpperCase()} 自动发送源链交易`, `Auto origin deposit from ${bc.toUpperCase()} is unavailable`));
  }

  async function executeActiveSwap() {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const amt = Number(st.swap.amountIn);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast(t('请输入兑换数量', 'Enter swap amount'));
      return;
    }

    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (!fromToken || !toToken || fromToken.assetId === toToken.assetId) return;

    if (!isSwapOriginSupported(fromToken)) {
      const unsupMsg = t(`暂不支持从 ${String(fromToken.blockchain || '').toUpperCase()} 发起闪兑`, `Swaps from ${String(fromToken.blockchain || '').toUpperCase()} are not supported yet`);
      resetSwapQuoteDisplay();
      setSwapError(unsupMsg);
      showToast(unsupMsg);
      return;
    }

    const avail = getSwapTokenAvailableBalance(fromToken);
    const isNative = isSwapTokenNative(fromToken);

    // Strict Local Balance Pre-Validation BEFORE firing RPC / quotes
    try {
      const gasReserveInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', st.swap.quoteData || null);
      contracts.validateSufficientChainBalance({
        wallet,
        chain: fromToken.blockchain,
        tokenSymbol: fromToken.symbol,
        amount: amt,
        isNative,
        tokenBalance: avail !== null ? avail : 0,
        gasBuffer: isNative && fromToken.blockchain === 'sol' && gasReserveInfo.selectedReserve > 0
          ? gasReserveInfo.selectedReserve
          : null
      });
      validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData: st.swap.quoteData, amountIn: amt });
    } catch (err) {
      setSwapError(err.message);
      showToast(err.message);
      return;
    }

    const authImpact = st.swap.quoteData ? computeSwapPriceImpact(st.swap._usdInVal, st.swap._usdOutVal) : null;
    const impactPromptSuffix = authImpact && (authImpact.level === 'high' || authImpact.level === 'critical')
      ? ` (⚠️ ${t('价差', 'Impact')} -${authImpact.pct.toFixed(1)}%)`
      : '';
    if (!(await verifySecurityAuthAsync(wallet, `${t('确认兑换', 'Confirm swap')} ${st.swap.amountIn} ${fromToken.symbol} → ${toToken.symbol}${impactPromptSuffix}`))) return;

    st.swap._executing = true;
    setSwapError('');

    try {
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const amountRaw = intents.toBaseUnits(st.swap.amountIn, fromToken.decimals);
      const sameChainDex = isSameChainContractSwap(fromToken, toToken);

      if (sameChainDex) {
        if (fromToken.blockchain === 'near') {
          const is1ClickBest = st.swap.quoteData?.routeSource === 'NEAR_INTENTS_1CLICK'
            || (st.swap.quoteData?.bestSource === '1Click Solver' && !st.swap.quoteData?.compositeType);
          const hasNearDexQuote = Boolean(
            st.swap.quoteData
            && (st.swap.quoteData.actions?.length || (st.swap.quoteData.isDcl && st.swap.quoteData.poolIds?.length))
          );
          if (!st.swap.quoteData?.compositeType && !is1ClickBest) {
            const refQ = hasNearDexQuote
              ? st.swap.quoteData
              : await contracts.quoteNearRefFinanceSwap({
                  tokenIn: fromToken.contractAddress,
                  tokenOut: toToken.contractAddress,
                  amountRaw,
                  slippageBps: st.swap.slippageBps
                });
            // Only take single-step Ref/DCL swap if pool liquidity exists on NEAR
            if (refQ && refQ.ok && (refQ.actions?.length || (refQ.isDcl && refQ.poolIds?.length))) {
              const res = await contracts.executeNearRefFinanceSwap({
                wallet,
                routeData: refQ.routeData,
                actions: refQ.actions,
                poolIds: refQ.poolIds,
                minAmountOut: refQ.minAmountOut,
                tokenIn: fromToken.contractAddress,
                tokenOut: toToken.contractAddress,
                amountRaw,
                slippageBps: st.swap.slippageBps,
                tokenBalance: avail,
                inputDecimals: fromToken.decimals,
                tokenSymbol: fromToken.symbol
              });
              recordWalletActivity(wallet, {
                type: 'swap',
                symbol: fromToken.symbol,
                toSymbol: toToken.symbol,
                chain: fromToken.blockchain,
                amount: amt,
                txHash: res.txHash,
                title: `${fromToken.symbol} ➔ ${toToken.symbol}`
              });
              showToast(`✅ ${refQ.isDcl ? 'Rhea CLMM' : 'Ref Finance'} ${t('成交广播成功', 'Swap broadcast')}: ${shortenAddr(res.txHash)}`);
              refreshAllBalancesAsync(false);
              return;
            }
          }
        } else if (fromToken.blockchain === 'sol') {
          const quoteResp = st.swap.quoteData && st.swap.quoteData.outAmount
            ? st.swap.quoteData
            : await contracts.quoteSolanaJupiterSwap({
                inputMint: fromToken.contractAddress,
                outputMint: toToken.contractAddress,
                amountRaw,
                slippageBps: st.swap.slippageBps
              });
          const res = await contracts.executeSolanaJupiterSwap({
            wallet,
            quoteResponse: quoteResp,
            wrapAndUnwrapSol: true,
            tokenBalance: avail,
            inputDecimals: fromToken.decimals
          });
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            chain: fromToken.blockchain,
            amount: amt,
            txHash: res.txHash,
            title: `${fromToken.symbol} ➔ ${toToken.symbol}`
          });
          showToast(`✅ ${quoteResp.bestSource || 'Jupiter'} ${t('成交广播成功', 'Swap broadcast')}: ${shortenAddr(res.txHash)}`);
          refreshAllBalancesAsync(false);
          return;
        } else {
          // EVM Contract DEX Execution (signed via NEAR MPC)
          await ensureEthersLoaded();
          const q = st.swap.quoteData && st.swap.quoteData.routeData
            ? st.swap.quoteData
            : await contracts.quoteEvmDexSwap({
                chainKey: fromToken.blockchain,
                srcToken: fromToken.contractAddress,
                destToken: toToken.contractAddress,
                amountRaw,
                srcDecimals: fromToken.decimals,
                destDecimals: toToken.decimals,
                slippageBps: st.swap.slippageBps,
                fromAddress: wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : ''
              });
          if (!q.ok || !q.routeData) throw new Error(q.error || t('获取 EVM 路由失败', 'EVM route unavailable'));

          const res = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: fromToken.blockchain,
            routeSource: q.routeSource,
            routeData: q.routeData,
            srcToken: fromToken.contractAddress,
            destToken: toToken.contractAddress,
            amountRaw,
            srcDecimals: fromToken.decimals,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail
          });
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            chain: fromToken.blockchain,
            amount: amt,
            txHash: res.txHash,
            title: `${fromToken.symbol} ➔ ${toToken.symbol}`
          });
          showToast(`✅ ${q.label} ${t('MPC 兑换广播成功', 'MPC Swap broadcast')}: ${shortenAddr(res.txHash)}`);
          refreshAllBalancesAsync(false);
          return;
        }
      }

      const nearId = wallet.nearNamedAccount || wallet.nearAddress;
      const rawRecipient = st.swap.recipientAddress || getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
      if (!rawRecipient) throw new Error(t('请填写目标链收款地址', 'Destination address required'));
      const refundTo = getWalletDefaultRecipientForChain(wallet, fromToken.blockchain) || nearId;

      let activeQuote = st.swap.quoteData;
      const forceSelfPre = doesSwapRouteRequireSelfRecipient(fromToken, toToken, activeQuote);
      let recipient = forceSelfPre ? (getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || rawRecipient) : rawRecipient;
      if (!activeQuote && typeof intents.quoteCrossChainWithDexRelay === 'function') {
        activeQuote = await intents.quoteCrossChainWithDexRelay({
          fromToken,
          toToken,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient,
          refundTo,
          nearAccountId: nearId,
          solAddress: wallet.solAddress,
          evmAddress: wallet.mpcEvmAddress || wallet.evmAddress
        }).catch(() => null);
      }
      if (doesSwapRouteRequireSelfRecipient(fromToken, toToken, activeQuote)) {
        recipient = getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || recipient;
      }

      validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData: activeQuote, amountIn: amt });

      // Composite PRL & Smart Hub Multi-Stage Routes
      const originIsPrl = isPrlSwapToken(fromToken);
      const destIsPrl = isPrlSwapToken(toToken);

      if (activeQuote?.compositeType === 'SMART_HUB_ROUTE' && Array.isArray(activeQuote.stages) && activeQuote.stages.length > 0) {
        let stages = activeQuote.stages.slice();
        let stageAmtRaw = amountRaw;
        if (stages[0] && stages[0].type === 'ORIGIN_DEX') {
          const origStage = stages.shift();
          if (origStage.chain === 'sol') {
            const solAddr = wallet.solAddress;
            const preSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
            const preLamports = BigInt(preSolRes?.nativeLamports || '0');
            const s0Quote = origStage.quote || await contracts.quoteSolanaJupiterSwap({
              inputMint: fromToken.contractAddress,
              outputMint: 'So11111111111111111111111111111111111111112',
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
            await contracts.executeSolanaJupiterSwap({
              wallet,
              quoteResponse: s0Quote,
              wrapAndUnwrapSol: true,
              tokenBalance: avail,
              inputDecimals: fromToken.decimals
            });
            const postSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
            const postLamports = BigInt(postSolRes?.nativeLamports || '0');
            const deltaL = postLamports > preLamports ? (postLamports - preLamports) : BigInt(s0Quote.outAmount || '0');
            stageAmtRaw = (deltaL > 0n ? deltaL : BigInt(s0Quote.outAmount || '0')).toString();
          } else {
            await ensureEthersLoaded();
            const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
            const preEvm = await contracts.fetchEvmNativeAndErc20Balance(origStage.chain, evmAddr).catch(() => null);
            const preWei = BigInt(preEvm?.nativeRaw || '0');
            const s0Q = origStage.quote || await contracts.quoteEvmDexSwap({
              chainKey: origStage.chain,
              srcToken: fromToken.contractAddress,
              destToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
              amountRaw,
              srcDecimals: fromToken.decimals,
              destDecimals: 18,
              slippageBps: st.swap.slippageBps,
              fromAddress: evmAddr
            });
            await contracts.executeEvmDexSwap({
              wallet,
              chainKey: origStage.chain,
              routeSource: s0Q.routeSource,
              routeData: s0Q.routeData,
              srcToken: fromToken.contractAddress,
              destToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
              amountRaw,
              srcDecimals: fromToken.decimals,
              slippageBps: st.swap.slippageBps,
              tokenBalance: avail
            });
            const postEvm = await contracts.fetchEvmNativeAndErc20Balance(origStage.chain, evmAddr).catch(() => null);
            const postWei = BigInt(postEvm?.nativeRaw || '0');
            const deltaW = postWei > preWei ? (postWei - preWei) : BigInt(s0Q.amountOut || '0');
            stageAmtRaw = (deltaW > 0n ? deltaW : BigInt(s0Q.amountOut || '0')).toString();
          }
        }
        const first = stages[0];
        if (!first) return;
        const destDexLeg = stages.find((s) => s.type === 'DEST_DEX') || null;
        const resolveBridgeOutRecipient = (leg) => {
          if (destDexLeg) {
            return destDexLeg.chain === 'sol'
              ? (wallet.solAddress || recipient)
              : (wallet.mpcEvmAddress || wallet.evmAddress || recipient);
          }
          return (leg && leg.recipient) || recipient;
        };
        const buildDestDexFollowUp = async (expectedInRaw) => {
          if (!destDexLeg) return {};
          if (destDexLeg.chain === 'sol') {
            const preSol = await contracts.fetchSolanaNativeAndSplBalances(wallet.solAddress, []).catch(() => null);
            return {
              followUpSolDexSwap: {
                outputMint: toToken.contractAddress,
                outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
                toSymbol: toToken.symbol,
                expectedSolRaw: String(expectedInRaw || '0'),
                preSolLamports: String(preSol?.nativeLamports || '0'),
                reserveSol: getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve,
                slippageBps: st.swap.slippageBps
              }
            };
          }
          const evmRecip = wallet.mpcEvmAddress || wallet.evmAddress;
          const preEvm = await contracts.fetchEvmNativeAndErc20Balance(destDexLeg.chain, evmRecip).catch(() => null);
          return {
            followUpEvmDexSwap: {
              chainKey: destDexLeg.chain,
              destToken: toToken.contractAddress,
              destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
              toSymbol: toToken.symbol,
              expectedInRaw: String(expectedInRaw || '0'),
              preNativeWei: String(preEvm?.nativeRaw || '0'),
              reserveNative: getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve,
              slippageBps: st.swap.slippageBps
            }
          };
        };
        if (first.type === 'BRIDGE_IN') {
          const swapLeg = stages.find((s) => s.type === 'NEAR_SWAP') || null;
          const outLeg = stages.find((s) => s.type === 'BRIDGE_OUT') || null;
          const liveIn = await intents.quoteIntentSwapOrWithdraw({
            originAsset: first.originAsset || fromToken.assetId,
            destinationAsset: first.destinationAsset,
            amountRaw: stageAmtRaw,
            slippageBps: st.swap.slippageBps,
            recipient: (!swapLeg && !outLeg) ? recipient : nearId,
            refundTo,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            appFeeBps: outLeg ? 0 : 25,
            dry: false
          });
          if (!liveIn.ok || !liveIn.depositAddress) {
            throw new Error(liveIn.error || t('创建第一阶段跨链订单失败', 'Failed to create Stage 1 cross-chain order'));
          }
          const destFollow = outLeg ? await buildDestDexFollowUp(outLeg.expectedOut) : {};
          const bridgeOutRecip = outLeg ? resolveBridgeOutRecipient(outLeg) : recipient;
          const bridgeToken = stages.length < activeQuote.stages.length
            ? {
                blockchain: fromToken.blockchain,
                symbol: fromToken.blockchain === 'sol' ? 'SOL' : fromToken.blockchain.toUpperCase(),
                contractAddress: '',
                decimals: fromToken.blockchain === 'sol' ? 9 : 18
              }
            : fromToken;
          const bridgeAmtNum = stages.length < activeQuote.stages.length
            ? Number(intents.fromBaseUnits(stageAmtRaw, bridgeToken.decimals))
            : amt;
          const inTx = await broadcastOriginDepositTx({ wallet, fromToken: bridgeToken, amt: bridgeAmtNum, avail: bridgeAmtNum, depositAddress: liveIn.depositAddress });
          if (!inTx || !inTx.txHash) {
            throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
          }
          const bridgeOrder = {
            walletId: wallet.id,
            depositAddress: liveIn.depositAddress,
            memo: liveIn.memo || null,
            status: 'PENDING_DEPOSIT',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: inTx.txHash,
            autoBroadcasted: true,
            createdAt: Date.now()
          };
          if (swapLeg) {
            bridgeOrder.followUpRefSwap = {
              tokenIn: swapLeg.tokenIn,
              tokenOut: swapLeg.tokenOut,
              isDcl: Boolean(swapLeg.isDcl),
              poolIds: Array.isArray(swapLeg.poolIds) ? swapLeg.poolIds : [],
              amountUsdcRaw: liveIn.amountOut || first.expectedOut,
              slippageBps: st.swap.slippageBps,
              inputDecimals: swapLeg.inDecimals || first.hubDecimals || 8,
              tokenSymbol: swapLeg.inSymbol || first.hubSymbol || 'PRL',
              followUpBridgeOut: outLeg ? {
                originAsset: outLeg.originAsset,
                destinationAsset: outLeg.destinationAsset,
                hubContract: outLeg.hubContract,
                hubDecimals: outLeg.hubDecimals || swapLeg.outDecimals || 8,
                hubSymbol: outLeg.hubSymbol || swapLeg.outSymbol || 'PRL',
                recipient: bridgeOutRecip,
                expectedInRaw: outLeg.expectedIn || swapLeg.expectedOut,
                ...destFollow
              } : null
            };
          } else if (outLeg) {
            bridgeOrder.followUpBridgeOut = {
              originAsset: outLeg.originAsset,
              destinationAsset: outLeg.destinationAsset,
              hubContract: outLeg.hubContract,
              hubDecimals: outLeg.hubDecimals || first.hubDecimals || 8,
              hubSymbol: outLeg.hubSymbol || first.hubSymbol || 'PRL',
              recipient: bridgeOutRecip,
              expectedInRaw: outLeg.expectedIn || first.expectedOut,
              ...destFollow
            };
          }
          st.swap.activeOrder = bridgeOrder;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            chain: fromToken.blockchain,
            amount: amt,
            txHash: inTx.txHash,
            title: `${fromToken.symbol} ➔ ${toToken.symbol}`
          });
          await intents.submitExternalDepositTxHash({
            depositAddress: liveIn.depositAddress,
            txHash: inTx.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('跨链第一阶段已发送，到账后将自动完成后续兑换', 'Stage 1 sent; will auto-complete remaining stages on arrival')}`);
          return;
        }

        if (first.type === 'NEAR_SWAP') {
          const outLeg = stages.find((s) => s.type === 'BRIDGE_OUT') || null;
          const preOutBal = outLeg
            ? await intents.fetchNearNep141Balances(nearId, { [first.tokenOut]: first.outDecimals || 8 }).catch(() => null)
            : null;
          const preOutRaw = BigInt(preOutBal?.[first.tokenOut]?.raw || '0');
          const swapRes = await contracts.executeNearRefFinanceSwap({
            wallet,
            tokenIn: first.tokenIn,
            tokenOut: first.tokenOut,
            amountRaw: stageAmtRaw,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail,
            inputDecimals: first.inDecimals || fromToken.decimals || 18,
            tokenSymbol: first.inSymbol || fromToken.symbol
          });
          if (!outLeg) {
            recordWalletActivity(wallet, {
              type: 'swap',
              symbol: fromToken.symbol,
              toSymbol: toToken.symbol,
              chain: fromToken.blockchain,
              amount: amt,
              txHash: swapRes.txHash,
              title: `${fromToken.symbol} ➔ ${toToken.symbol}`
            });
            showToast(`✅ Ref Finance ${t('成交广播成功', 'Swap broadcast')}: ${shortenAddr(swapRes.txHash)}`);
            refreshAllBalancesAsync(false);
            return;
          }
          const postOutBal = await intents.fetchNearNep141Balances(nearId, { [first.tokenOut]: first.outDecimals || 8 }).catch(() => null);
          const postOutRaw = BigInt(postOutBal?.[first.tokenOut]?.raw || '0');
          const deltaOut = postOutRaw > preOutRaw ? (postOutRaw - preOutRaw) : BigInt(swapRes.amountOut || first.expectedOut || '0');
          const bridgeInRaw = (deltaOut > 0n ? deltaOut : BigInt(first.expectedOut || '0')).toString();
          const destFollow = await buildDestDexFollowUp(outLeg.expectedOut);
          const liveOut = await intents.quoteIntentSwapOrWithdraw({
            originAsset: outLeg.originAsset,
            destinationAsset: outLeg.destinationAsset,
            amountRaw: bridgeInRaw,
            slippageBps: st.swap.slippageBps,
            recipient: resolveBridgeOutRecipient(outLeg),
            refundTo: nearId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: false
          });
          if (!liveOut.ok || !liveOut.depositAddress) {
            throw new Error(liveOut.error || t('获取第二阶段跨链桥路由失败', 'Failed to get Stage 2 bridge route'));
          }
          const bridgeDec = outLeg.hubDecimals || first.outDecimals || 8;
          const bridgeSym = outLeg.hubSymbol || first.outSymbol || 'PRL';
          const bridgeHuman = intents.fromBaseUnits(bridgeInRaw, bridgeDec);
          let sendBridge = null;
          if (outLeg.hubContract === 'wrap.near') {
            sendBridge = await contracts.executeNearNep141Transfer({
              wallet,
              tokenContract: 'wrap.near',
              receiverId: liveOut.depositAddress,
              amount: bridgeHuman,
              decimals: 24,
              tokenSymbol: 'wNEAR',
              tokenBalance: Number(bridgeHuman)
            });
          } else {
            sendBridge = await contracts.executeNearNep141Transfer({
              wallet,
              tokenContract: outLeg.hubContract,
              receiverId: liveOut.depositAddress,
              amount: bridgeHuman,
              decimals: bridgeDec,
              tokenSymbol: bridgeSym,
              tokenBalance: Number(bridgeHuman)
            });
          }
          await intents.submitExternalDepositTxHash({
            depositAddress: liveOut.depositAddress,
            txHash: sendBridge.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: liveOut.depositAddress,
            memo: liveOut.memo || null,
            status: 'PENDING_DEPOSIT',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: sendBridge.txHash,
            autoBroadcasted: true,
            createdAt: Date.now(),
            ...destFollow
          };
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            chain: fromToken.blockchain,
            amount: amt,
            txHash: sendBridge.txHash,
            title: `${fromToken.symbol} ➔ ${toToken.symbol}`
          });
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('已完成 NEAR 链内兑换并自动发起跨链交付', 'Swapped on NEAR & bridging to destination chain')}`);
          return;
        }
      }

      // Sub-route A: NEAR Token -> PRL (Pearl L1) via Ref Finance -> 1Click bridge
      if (!originIsPrl && destIsPrl && toToken.blockchain === 'prl' && fromToken.blockchain === 'near') {
        const refRes = await contracts.executeNearRefFinanceSwap({
          wallet,
          tokenIn: fromToken.contractAddress || 'wrap.near',
          tokenOut: intents.PRL_NEAR_CONTRACT,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          tokenBalance: avail,
          inputDecimals: fromToken.decimals,
          tokenSymbol: fromToken.symbol
        });
        const prlOutRaw = (st.swap.quoteData && st.swap.quoteData.refQuote && st.swap.quoteData.refQuote.amountOut) || refRes.amountOut;
        if (!prlOutRaw) throw new Error(t('Ref Finance 成交后未获得预期 PRL 数量', 'Missing PRL amount after Ref swap'));
        const bridgeQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: intents.PRL_NEAR_ASSET_ID,
          destinationAsset: intents.PRL_PEARL_ASSET_ID,
          amountRaw: prlOutRaw,
          slippageBps: st.swap.slippageBps,
          recipient,
          refundTo: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!bridgeQuote.ok || !bridgeQuote.depositAddress) {
          throw new Error(bridgeQuote.error || t('获取 PRL 跨链桥路由失败', 'Failed to get PRL bridge route'));
        }
        const prlHuman = intents.fromBaseUnits(prlOutRaw, 8);
        const sendBridge = await contracts.executeNearNep141Transfer({
          wallet,
          tokenContract: intents.PRL_NEAR_CONTRACT,
          receiverId: bridgeQuote.depositAddress,
          amount: prlHuman,
          decimals: 8,
          tokenSymbol: 'PRL',
          tokenBalance: Number(prlHuman)
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: bridgeQuote.depositAddress,
          txHash: sendBridge.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: bridgeQuote.depositAddress,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: 'PRL',
          originTxHash: sendBridge.txHash,
          autoBroadcasted: true,
          createdAt: Date.now()
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: sendBridge.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('已通过 Ref Finance 兑换并通过 1Click 桥接至 Pearl', 'Swapped via Ref & bridging PRL to Pearl')}`);
        return;
      }

      // Sub-route P: PRL -> NEAR-chain token via Ref multi-hop (tokens 1Click does not list, e.g. oRHEA)
      if (originIsPrl && !destIsPrl && toToken.blockchain === 'near' && toToken.contractAddress
          && st.swap.quoteData?.compositeType === 'PRL_TO_NEAR_REF' && st.swap.quoteData.refQuote) {
        const refQ = st.swap.quoteData.refQuote;
        if (fromToken.blockchain === 'near') {
          const res = await contracts.executeNearRefFinanceSwap({
            wallet,
            routeData: refQ.routeData,
            actions: refQ.actions,
            poolIds: refQ.poolIds,
            minAmountOut: refQ.minAmountOut,
            tokenIn: intents.PRL_NEAR_CONTRACT,
            tokenOut: toToken.contractAddress,
            amountRaw,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail,
            inputDecimals: 8,
            tokenSymbol: 'PRL'
          });
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            chain: fromToken.blockchain,
            amount: amt,
            txHash: res.txHash,
            title: `${fromToken.symbol} ➔ ${toToken.symbol}`
          });
          showToast(`✅ Ref Finance ${t('成交广播成功', 'Swap broadcast')}: ${shortenAddr(res.txHash)}`);
          refreshAllBalancesAsync(false);
          return;
        }
        const bridgeLive = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: intents.PRL_NEAR_ASSET_ID,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: nearId,
          refundTo,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!bridgeLive.ok || !bridgeLive.depositAddress) {
          throw new Error(bridgeLive.error || t('创建 PRL 跨链订单失败', 'Failed to create PRL bridge order'));
        }
        const bridgeTx = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: bridgeLive.depositAddress });
        if (!bridgeTx || !bridgeTx.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: bridgeLive.depositAddress,
          memo: bridgeLive.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: bridgeTx.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpRefSwap: {
            tokenIn: intents.PRL_NEAR_CONTRACT,
            tokenOut: toToken.contractAddress,
            amountUsdcRaw: bridgeLive.amountOut,
            slippageBps: st.swap.slippageBps,
            inputDecimals: 8,
            tokenSymbol: 'PRL'
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: bridgeTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: bridgeLive.depositAddress,
          txHash: bridgeTx.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('跨链已发送，到账后自动兑换', 'Bridge sent; auto-swap on arrival')}`);
        return;
      }
      // Sub-route B: PRL (NEAR) -> External chain (e.g. SOL / ETH / BNB)
      if (originIsPrl && !destIsPrl && fromToken.blockchain === 'near') {
        const preUsdc = await intents.fetchNearNep141Balances(nearId, { usdc: intents.NEAR_USDC_CONTRACT }).catch(() => null);
        const preUsdcRaw = BigInt(preUsdc?.usdc?.raw || '0');
        const step1Q = (st.swap.quoteData && st.swap.quoteData.refQuote)
          ? st.swap.quoteData.refQuote
          : await contracts.quoteNearRefFinanceSwap({
              tokenIn: intents.PRL_NEAR_CONTRACT,
              tokenOut: intents.NEAR_USDC_CONTRACT,
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
        if (!step1Q.ok || !step1Q.amountOut) {
          throw new Error(step1Q.error || t('Ref Finance 暂无 PRL/USDC 路由', 'Ref Finance PRL/USDC route unavailable'));
        }
        await contracts.executeNearRefFinanceSwap({
          wallet,
          routeData: step1Q.routeData,
          actions: step1Q.actions,
          tokenIn: intents.PRL_NEAR_CONTRACT,
          tokenOut: intents.NEAR_USDC_CONTRACT,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          tokenBalance: avail,
          inputDecimals: 8,
          tokenSymbol: 'PRL'
        });

        // Verify actual post-swap USDC increase on NEAR before step 2
        const postUsdc = await intents.fetchNearNep141Balances(nearId, { usdc: intents.NEAR_USDC_CONTRACT }).catch(() => null);
        const postUsdcRaw = BigInt(postUsdc?.usdc?.raw || '0');
        const deltaRaw = postUsdcRaw > preUsdcRaw ? (postUsdcRaw - preUsdcRaw) : BigInt(step1Q.minAmountOut || step1Q.amountOut);
        const sendUsdcRaw = deltaRaw > 0n ? deltaRaw.toString() : String(step1Q.amountOut);

        // If destination is QTC on NEAR, execute atomic Step 2 directly on Rhea CLMM (dclv2.ref-labs.near) when quoted
        if (
          (st.swap.quoteData?.compositeType === 'PRL_TO_NEAR_DCL' || toToken.assetId === intents.QTC_NEAR_ASSET_ID) &&
          typeof contracts.executeNearDclPoolSwap === 'function'
        ) {
          const dclCheck = await contracts.quoteNearDclPoolSwap({
            tokenIn: intents.NEAR_USDC_CONTRACT,
            tokenOut: intents.QTC_NEAR_CONTRACT,
            amountRaw: sendUsdcRaw,
            slippageBps: st.swap.slippageBps
          }).catch(() => null);
          if (dclCheck && dclCheck.ok) {
            const usdcHuman = Number(intents.fromBaseUnits(sendUsdcRaw, 6));
            const dclRes = await contracts.executeNearDclPoolSwap({
              wallet,
              poolIds: dclCheck.poolIds,
              tokenIn: intents.NEAR_USDC_CONTRACT,
              tokenOut: intents.QTC_NEAR_CONTRACT,
              amountRaw: sendUsdcRaw,
              minAmountOut: dclCheck.minAmountOut,
              slippageBps: st.swap.slippageBps,
              tokenBalance: usdcHuman,
              inputDecimals: 6,
              tokenSymbol: 'USDC'
            });
            recordWalletActivity(wallet, {
              type: 'swap',
              symbol: fromToken.symbol,
              toSymbol: toToken.symbol,
              chain: fromToken.blockchain,
              amount: amt,
              txHash: dclRes.txHash,
              title: `${fromToken.symbol} ➔ ${toToken.symbol}`
            });
            showToast(`✅ ${t('已通过 Ref + Rhea CLMM 兑换为 QTC', 'Swapped PRL -> USDC -> QTC via Ref + Rhea CLMM')}: ${shortenAddr(dclRes.txHash)}`);
            refreshAllBalancesAsync(false);
            return;
          }
        }

        const isRelaySolDex = activeQuote?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX';
        const isRelayEvmDex = activeQuote?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX';
        const step2DestAsset = (isRelaySolDex || isRelayEvmDex) ? activeQuote.intermediaryAssetId : toToken.assetId;
        const step2Recip = isRelaySolDex
          ? wallet.solAddress
          : (isRelayEvmDex ? (wallet.mpcEvmAddress || wallet.evmAddress) : recipient);
        if (!step2Recip) throw new Error(t('缺少目标链接收地址', 'Missing destination address'));

        const preSolSnapshot = isRelaySolDex
          ? await contracts.fetchSolanaNativeAndSplBalances(step2Recip, []).catch(() => null)
          : null;
        const preEvmSnapshot = isRelayEvmDex
          ? await contracts.fetchEvmNativeAndErc20Balance(toToken.blockchain, step2Recip).catch(() => null)
          : null;

        const step2Live = await intents.quoteIntentSwapOrWithdraw({
          originAsset: intents.NEAR_USDC_ASSET_ID,
          destinationAsset: step2DestAsset,
          amountRaw: sendUsdcRaw,
          slippageBps: st.swap.slippageBps,
          recipient: step2Recip,
          refundTo: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!step2Live.ok || !step2Live.depositAddress) {
          throw new Error(step2Live.error || t('创建 USDC 跨链第二步订单失败', 'Failed to create 1Click step 2 order'));
        }
        const usdcHuman = intents.fromBaseUnits(sendUsdcRaw, 6);
        const sendTx = await contracts.executeNearNep141Transfer({
          wallet,
          tokenContract: intents.NEAR_USDC_CONTRACT,
          receiverId: step2Live.depositAddress,
          amount: usdcHuman,
          decimals: 6,
          tokenSymbol: 'USDC',
          tokenBalance: Number(usdcHuman)
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: step2Live.depositAddress,
          txHash: sendTx.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        const nextOrder = {
          walletId: wallet.id,
          depositAddress: step2Live.depositAddress,
          memo: step2Live.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: 'PRL',
          toSymbol: toToken.symbol,
          originTxHash: sendTx.txHash,
          autoBroadcasted: true,
          createdAt: Date.now()
        };
        const subBReserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
        if (isRelaySolDex) {
          nextOrder.followUpSolDexSwap = {
            outputMint: toToken.contractAddress,
            outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            expectedSolRaw: String(step2Live.amountOut || '0'),
            preSolLamports: String(preSolSnapshot?.nativeLamports || '0'),
            reserveSol: subBReserve,
            slippageBps: st.swap.slippageBps
          };
        } else if (isRelayEvmDex) {
          nextOrder.followUpEvmDexSwap = {
            chainKey: String(toToken.blockchain || '').toLowerCase(),
            destToken: toToken.contractAddress,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
            toSymbol: toToken.symbol,
            expectedInRaw: String(step2Live.amountOut || '0'),
            preNativeWei: String(preEvmSnapshot?.nativeRaw || '0'),
            reserveNative: subBReserve,
            slippageBps: st.swap.slippageBps
          };
        }
        st.swap.activeOrder = nextOrder;
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: sendTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('已通过 Ref Finance 换出 USDC 并提交 1Click 跨链', 'Swapped PRL to USDC & sent cross-chain')}`);
        return;
      }

      // Sub-route C: Non-Ref token (e.g. SOL / ETH / BNB / QTC) -> PRL (Step 1: 1Click -> NEAR USDC, Step 2 follow-up: Ref USDC -> PRL [+ Stage 3 -> Pearl L1])
      if (!originIsPrl && destIsPrl && (fromToken.blockchain !== 'near' || st.swap.quoteData?.compositeType === 'EXTERNAL_TO_PRL')) {
        const destNeedsPearlBridge = toToken.blockchain === 'prl';
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: intents.NEAR_USDC_ASSET_ID,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: nearId,
          refundTo,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          appFeeBps: destNeedsPearlBridge ? 0 : 25,
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建跨链第一步订单失败', 'Failed to create step 1 cross-chain order'));
        }
        const txRes = await broadcastOriginDepositTx({
          wallet,
          fromToken,
          amt,
          avail,
          depositAddress: liveQuote.depositAddress
        });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol || 'PRL',
          originTxHash: txRes.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpRefSwap: {
            tokenIn: intents.NEAR_USDC_CONTRACT,
            tokenOut: intents.PRL_NEAR_CONTRACT,
            amountUsdcRaw: liveQuote.amountOut,
            slippageBps: st.swap.slippageBps,
            inputDecimals: 6,
            tokenSymbol: 'USDC',
            followUpBridgeOut: destNeedsPearlBridge ? {
              originAsset: intents.PRL_NEAR_ASSET_ID,
              destinationAsset: intents.PRL_PEARL_ASSET_ID,
              hubContract: intents.PRL_NEAR_CONTRACT,
              hubDecimals: 8,
              hubSymbol: 'PRL',
              recipient
            } : null
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol || 'PRL',
          chain: fromToken.blockchain,
          amount: amt,
          txHash: txRes.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol || 'PRL'}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: liveQuote.depositAddress,
          txHash: txRes.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('跨链第一阶段已发送，成交后将自动兑换为 PRL', 'Step 1 sent; will auto-swap to PRL upon fill')}`);
        return;
      }

      // Super-Aggregator Route 1: SOL DEX Token (e.g. NVDAx / TSLAx / JUP) -> SOL (Jupiter/Raydium) -> 1Click External Token
      if (activeQuote?.compositeType === 'SOL_DEX_TO_CROSS_CHAIN') {
        const solAddr = wallet.solAddress;
        if (!solAddr) throw new Error(t('缺少 Solana MPC 地址', 'Missing Solana MPC address'));
        const preSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
        const preLamports = BigInt(preSolRes?.nativeLamports || '0');

        const s1Quote = (activeQuote.stage1DexQuote && activeQuote.stage1DexQuote.outAmount)
          ? activeQuote.stage1DexQuote
          : await contracts.quoteSolanaJupiterSwap({
              inputMint: fromToken.contractAddress,
              outputMint: 'So11111111111111111111111111111111111111112',
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
        await contracts.executeSolanaJupiterSwap({
          wallet,
          quoteResponse: s1Quote,
          wrapAndUnwrapSol: true,
          tokenBalance: avail,
          inputDecimals: fromToken.decimals
        });

        let postSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
        let postLamports = BigInt(postSolRes?.nativeLamports || '0');
        if (postLamports <= preLamports) {
          await new Promise((r) => setTimeout(r, 1800));
          postSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
          postLamports = BigInt(postSolRes?.nativeLamports || '0');
        }
        const deltaLamports = postLamports > preLamports ? (postLamports - preLamports) : BigInt(s1Quote.outAmount || '0');
        const maxSendable = postLamports > 2000000n ? (postLamports - 2000000n) : deltaLamports;
        const sendLamports = deltaLamports > maxSendable ? maxSendable : deltaLamports;
        if (sendLamports <= 0n) throw new Error(t('SOL 余额不足以执行跨链第二阶段', 'Insufficient SOL for Stage 2 bridge'));

        const stage2Live = await intents.quoteIntentSwapOrWithdraw({
          originAsset: 'nep141:sol.omft.near',
          destinationAsset: toToken.assetId,
          amountRaw: sendLamports.toString(),
          slippageBps: st.swap.slippageBps,
          recipient,
          refundTo: solAddr,
          nearAccountId: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!stage2Live.ok || !stage2Live.depositAddress) {
          throw new Error(stage2Live.error || t('第二阶段跨链下单失败', 'Stage 2 cross-chain order failed'));
        }
        const sendSolNum = Number(contracts.fromBaseUnits(sendLamports.toString(), 9));
        const sendSolTx = await contracts.executeSolanaNativeTransfer({
          wallet,
          toAddress: stage2Live.depositAddress,
          amountSol: sendSolNum
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: stage2Live.depositAddress,
          txHash: sendSolTx.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: stage2Live.depositAddress,
          memo: stage2Live.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: sendSolTx.txHash,
          autoBroadcasted: true,
          createdAt: Date.now()
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: sendSolTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('已换出 SOL 并发送跨链交付至目标链', 'Swapped to SOL & bridging cross-chain')}`);
        return;
      }

      // Super-Aggregator Route 2: Cross-Chain (1Click -> SOL) + Auto Stage 2 Solana DEX Swap (e.g. NEAR -> NVDAx / TSLAx / JUP)
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX') {
        const solRecip = wallet.solAddress;
        if (!solRecip) throw new Error(t('缺少 Solana MPC 地址', 'Missing Solana MPC address'));
        const preSolRes = await contracts.fetchSolanaNativeAndSplBalances(solRecip, []).catch(() => null);
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: activeQuote.intermediaryAssetId || 'nep141:sol.omft.near',
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: solRecip,
          refundTo,
          nearAccountId: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建第一阶段跨链订单失败', 'Failed to create Stage 1 SOL order'));
        }
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
        const solReserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: txRes.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpSolDexSwap: {
            outputMint: toToken.contractAddress,
            outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            expectedSolRaw: String(liveQuote.amountOut || activeQuote.intermediaryRaw || '0'),
            preSolLamports: String(preSolRes?.nativeLamports || '0'),
            reserveSol: solReserve,
            slippageBps: st.swap.slippageBps
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: txRes.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: liveQuote.depositAddress,
          txHash: txRes.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        showToast(`✅ ${t('跨链第一阶段已发送，到账 SOL 后将自动买入', 'Stage 1 sent; will auto-buy')} ${toToken.symbol}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 3: Cross-Chain (1Click -> EVM Hub) + Auto Stage 2 EVM Multi-Pool DEX (e.g. NEAR -> PONS / AERO / UNI)
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX') {
        const targetBc = String(toToken.blockchain || '').toLowerCase();
        const evmRecip = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmRecip) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
        const preEvmRes = await contracts.fetchEvmNativeAndErc20Balance(targetBc, evmRecip).catch(() => null);
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: activeQuote.intermediaryAssetId,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: evmRecip,
          refundTo,
          nearAccountId: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建 EVM 第一阶段跨链订单失败', 'Failed to create Stage 1 EVM order'));
        }
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
        const evmReserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: txRes.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpEvmDexSwap: {
            chainKey: targetBc,
            destToken: toToken.contractAddress,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
            toSymbol: toToken.symbol,
            expectedInRaw: String(liveQuote.amountOut || activeQuote.intermediaryRaw || '0'),
            preNativeWei: String(preEvmRes?.nativeRaw || '0'),
            reserveNative: evmReserve,
            slippageBps: st.swap.slippageBps
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: txRes.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: liveQuote.depositAddress,
          txHash: txRes.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        showToast(`✅ ${t('跨链第一阶段已发送，到账后将自动执行 DEX 兑换', 'Stage 1 sent; will auto-swap via DEX on arrival')}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 4: Direct EVM -> Arc Mainnet (5042) via Relay / LI.FI
      if (activeQuote?.compositeType === 'EVM_TO_ARC_MAINNET' && typeof contracts.executeEvmRawSteps === 'function') {
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmAddr) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
        const origChain = String(fromToken.blockchain || '').toLowerCase();
        const cfgOrig = contracts.EVM_CHAINS && contracts.EVM_CHAINS[origChain];
        const bQuote = activeQuote.bridgeQuote;
        const arcDestLower = String(toToken.contractAddress || intents.ARC_USDC_CONTRACT).toLowerCase();
        const needsArcDexSwap = Boolean(toToken.contractAddress && arcDestLower !== intents.ARC_USDC_CONTRACT.toLowerCase() && arcDestLower !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
        const preArcRes = needsArcDexSwap
          ? await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null)
          : null;
        let bridgeResTx = null;
        if (bQuote && bQuote.provider === 'LI.FI' && bQuote.transactionRequest) {
          const lRes = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: origChain,
            routeSource: 'lifi',
            routeData: bQuote,
            srcToken: fromToken.contractAddress || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destToken: intents.ARC_USDC_CONTRACT,
            amountRaw,
            srcDecimals: fromToken.decimals,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail
          });
          bridgeResTx = lRes;
        } else {
          const relayRecip = (needsArcDexSwap || !recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) ? evmAddr : recipient;
          const liveRelay = await intents.quoteRelayBridge({
            user: evmAddr,
            recipient: relayRecip,
            originChainId: cfgOrig ? cfgOrig.chainId : 8453,
            destinationChainId: 5042,
            originCurrency: fromToken.contractAddress || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destinationCurrency: intents.ARC_USDC_CONTRACT,
            amount: amountRaw
          });
          if (!liveRelay.ok || !liveRelay.steps?.length) throw new Error(liveRelay.error || t('Relay 构建 Arc 跨链失败', 'Relay Arc build failed'));
          bridgeResTx = await contracts.executeEvmRawSteps({ wallet, chainKey: origChain, steps: liveRelay.steps });
        }
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: bridgeResTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        if (needsArcDexSwap) {
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: bridgeResTx.txHash,
            status: 'PENDING_ARC_BRIDGE',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: bridgeResTx.txHash,
            autoBroadcasted: true,
            createdAt: Date.now(),
            followUpArcDexSwap: {
              destContract: toToken.contractAddress,
              destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
              toSymbol: toToken.symbol,
              expectedArcUsdcRaw: String(bQuote?.amountOut || '0'),
              preArcUsdcRaw: String(preArcRes?.nativeRaw || '0'),
              slippageBps: st.swap.slippageBps
            }
          };
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('已跨链至 Arc 主网，到账后将自动兑换为', 'Bridged to Arc Mainnet; will auto-swap to')} ${toToken.symbol}`);
          return;
        }
        showToast(`✅ ${t('已发送至 Arc Mainnet', 'Sent to Arc Mainnet')}: ${shortenAddr(bridgeResTx.txHash)}`);
        refreshAllBalancesAsync(false);
        return;
      }

      // Super-Aggregator Route 5: Cross-Chain (1Click -> Base USDC) + Relay (Base -> Arc 5042) + optional Arc KyberSwap
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_ARC_MAINNET') {
        const evmRecip = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmRecip) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
        const preBaseRes = await contracts.fetchEvmNativeAndErc20Balance('base', evmRecip, intents.BASE_USDC_EVM, 6).catch(() => null);
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: intents.BASE_USDC_1CLICK_ID,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: evmRecip,
          refundTo,
          nearAccountId: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建 Base USDC 中转订单失败', 'Failed to create Base USDC stage 1 order'));
        }
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
        const arcDestLower = String(toToken.contractAddress || intents.ARC_USDC_CONTRACT).toLowerCase();
        const needsArcDexSwap = Boolean(
          toToken.contractAddress &&
          arcDestLower !== intents.ARC_USDC_CONTRACT.toLowerCase() &&
          arcDestLower !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        );
        const arcRelayRecipient = (!needsArcDexSwap && recipient && /^0x[0-9a-fA-F]{40}$/.test(recipient))
          ? recipient
          : evmRecip;
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: txRes.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpArcRelay: {
            destContract: toToken.contractAddress || intents.ARC_USDC_CONTRACT,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            recipient: arcRelayRecipient,
            expectedBaseRaw: String(liveQuote.amountOut || activeQuote.baseBridgeRaw || '0'),
            preBaseRaw: String(preBaseRes?.tokenRaw || '0'),
            slippageBps: st.swap.slippageBps
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: txRes.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: liveQuote.depositAddress,
          txHash: txRes.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        showToast(`✅ ${t('第一阶段已发送，到账 Base 后将自动通过 Relay 跨链至 Arc 主网', 'Stage 1 sent; will auto-bridge Base -> Arc via Relay')}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 6: Arc Mainnet (5042) -> Base -> Target Chain
      if (activeQuote?.compositeType === 'ARC_MAINNET_TO_CROSS_CHAIN' && typeof contracts.executeEvmRawSteps === 'function') {
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmAddr) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
        const srcContract = (fromToken.contractAddress || intents.ARC_USDC_CONTRACT).toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
          ? intents.ARC_USDC_CONTRACT
          : fromToken.contractAddress;
        let arcUsdcRaw = amountRaw;
        if (srcContract.toLowerCase() !== intents.ARC_USDC_CONTRACT.toLowerCase()) {
          const s1Q = activeQuote.stage1DexQuote?.routeData
            ? activeQuote.stage1DexQuote
            : await contracts.quoteEvmDexSwap({
                chainKey: 'arc',
                srcToken: srcContract,
                destToken: intents.ARC_USDC_CONTRACT,
                amountRaw,
                srcDecimals: fromToken.decimals,
                destDecimals: 6,
                slippageBps: st.swap.slippageBps,
                fromAddress: evmAddr
              });
          if (!s1Q.ok || !s1Q.routeData) throw new Error(s1Q.error || t('Arc 换出 USDC 失败', 'Arc swap to USDC failed'));
          const s1Tx = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: 'arc',
            routeSource: s1Q.routeSource,
            routeData: s1Q.routeData,
            srcToken: srcContract,
            destToken: intents.ARC_USDC_CONTRACT,
            amountRaw,
            srcDecimals: fromToken.decimals,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail
          });
          arcUsdcRaw = s1Q.amountOut;
          showToast(`✅ ${t('Arc 第一步已换出 USDC，正在跨链至 Base', 'Arc USDC swapped; bridging to Base')}: ${shortenAddr(s1Tx.txHash)}`);
        }
        const hasStage3 = Boolean(activeQuote.stage3Quote);
        const validRecipEvm = recipient && /^0x[0-9a-fA-F]{40}$/.test(recipient) ? recipient : evmAddr;
        const bridgeRecip = hasStage3 ? evmAddr : validRecipEvm;
        const preBaseRes = hasStage3
          ? await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null)
          : null;
        let rTx = null;
        let bridgeOutRaw = String(activeQuote.baseOutRaw || arcUsdcRaw);
        const arcBQuote = activeQuote.bridgeQuote;
        if (arcBQuote && arcBQuote.provider === 'LI.FI' && arcBQuote.transactionRequest && bridgeRecip.toLowerCase() === evmAddr.toLowerCase()) {
          rTx = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: 'arc',
            routeSource: 'lifi',
            routeData: arcBQuote,
            srcToken: intents.ARC_USDC_CONTRACT,
            destToken: intents.BASE_USDC_EVM,
            amountRaw: arcUsdcRaw,
            srcDecimals: 6,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail
          });
        } else {
          const liveRelay = await intents.quoteRelayBridge({
            user: evmAddr,
            recipient: bridgeRecip,
            originChainId: 5042,
            destinationChainId: 8453,
            originCurrency: intents.ARC_USDC_CONTRACT,
            destinationCurrency: intents.BASE_USDC_EVM,
            amount: arcUsdcRaw
          });
          if (!liveRelay.ok || !liveRelay.steps?.length) throw new Error(liveRelay.error || t('Relay 从 Arc 跨链失败', 'Relay bridge from Arc failed'));
          bridgeOutRaw = String(liveRelay.amountOut || bridgeOutRaw);
          rTx = await contracts.executeEvmRawSteps({ wallet, chainKey: 'arc', steps: liveRelay.steps });
        }
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: 'arc',
          amount: amt,
          txHash: rTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        if (hasStage3) {
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: rTx.txHash,
            status: 'PENDING_BASE_BRIDGE',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: rTx.txHash,
            autoBroadcasted: true,
            createdAt: Date.now(),
            followUpBaseOneClick: {
              destinationAsset: toToken.assetId,
              destBlockchain: toToken.blockchain,
              recipient,
              preBaseRaw: String(preBaseRes?.tokenRaw || '0'),
              expectedBaseRaw: bridgeOutRaw,
              slippageBps: st.swap.slippageBps,
              toSymbol: toToken.symbol
            }
          };
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('Arc -> Base 跨链已广播，到账后将自动完成目标链兑换', 'Arc -> Base bridged; will auto-complete stage 3 swap')}: ${shortenAddr(rTx.txHash)}`);
          return;
        }
        showToast(`✅ ${t('Arc -> Base Relay 跨链已广播', 'Arc -> Base Relay tx broadcast')}: ${shortenAddr(rTx.txHash)}`);
        refreshAllBalancesAsync(false);
        return;
      }

      // Cross-Chain 1Click Route (ORIGIN_CHAIN -> DESTINATION_CHAIN direct L1 to L1, including Pearl PRL multi-stage closure)
      const isPearlOriginFollowUp = originIsPrl && !destIsPrl && fromToken.blockchain === 'prl';
      const isPearlToNearDcl = isPearlOriginFollowUp && toToken.blockchain === 'near' && toToken.assetId === intents.QTC_NEAR_ASSET_ID;
      const isPearlToNearRef = isPearlOriginFollowUp && toToken.blockchain === 'near' && Boolean(toToken.contractAddress) && toToken.contractAddress !== intents.PRL_NEAR_CONTRACT && !isPearlToNearDcl;
      const isPearlToExternal = isPearlOriginFollowUp && toToken.blockchain !== 'near';

      const effectiveDestAsset = isPearlOriginFollowUp ? intents.PRL_NEAR_ASSET_ID : toToken.assetId;
      const effectiveRecipient = isPearlOriginFollowUp ? nearId : recipient;

      const liveQuote = await intents.quoteIntentSwapOrWithdraw({
        originAsset: fromToken.assetId,
        destinationAsset: effectiveDestAsset,
        amountRaw,
        slippageBps: st.swap.slippageBps,
        recipient: effectiveRecipient,
        refundTo,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        appFeeBps: isPearlToExternal ? 0 : 25,
        dry: false
      });
      if (!liveQuote.ok || !liveQuote.depositAddress) {
        throw new Error(liveQuote.error || t('创建跨链订单失败', 'Failed to create cross-chain order'));
      }

      if (
        !isPearlOriginFollowUp &&
        toToken.blockchain === 'near' &&
        toToken.contractAddress &&
        effectiveRecipient === nearId &&
        typeof contracts.ensureNearNep141StorageRegistered === 'function'
      ) {
        await contracts.ensureNearNep141StorageRegistered({
          resolvedWallet: wallet,
          accountId: nearId,
          tokenContract: toToken.contractAddress
        }).catch(() => {});
      }

      // Broadcast FIRST before displaying any order tracking card
      const txRes = await broadcastOriginDepositTx({
        wallet,
        fromToken,
        amt,
        avail,
        depositAddress: liveQuote.depositAddress
      });
      if (!txRes || !txRes.txHash) {
        throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
      }

      let followUpRefSwap = null;
      if (isPearlToNearRef) {
        followUpRefSwap = {
          tokenIn: intents.PRL_NEAR_CONTRACT,
          tokenOut: toToken.contractAddress,
          amountUsdcRaw: liveQuote.amountOut,
          slippageBps: st.swap.slippageBps,
          inputDecimals: 8,
          tokenSymbol: 'PRL'
        };
      } else if (isPearlToNearDcl) {
        followUpRefSwap = {
          tokenIn: intents.PRL_NEAR_CONTRACT,
          tokenOut: intents.NEAR_USDC_CONTRACT,
          amountUsdcRaw: liveQuote.amountOut,
          slippageBps: st.swap.slippageBps,
          inputDecimals: 8,
          tokenSymbol: 'PRL',
          followUpDclSwap: {
            tokenIn: intents.NEAR_USDC_CONTRACT,
            tokenOut: intents.QTC_NEAR_CONTRACT,
            toSymbol: 'QTC',
            slippageBps: st.swap.slippageBps
          }
        };
      } else if (isPearlToExternal) {
        const isRelaySolDex = activeQuote?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX';
        const isRelayEvmDex = activeQuote?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX';
        const outDestAsset = (isRelaySolDex || isRelayEvmDex) ? activeQuote.intermediaryAssetId : toToken.assetId;
        const outRecip = isRelaySolDex
          ? wallet.solAddress
          : (isRelayEvmDex ? (wallet.mpcEvmAddress || wallet.evmAddress) : recipient);
        const targetReserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
        followUpRefSwap = {
          tokenIn: intents.PRL_NEAR_CONTRACT,
          tokenOut: intents.NEAR_USDC_CONTRACT,
          amountUsdcRaw: liveQuote.amountOut,
          slippageBps: st.swap.slippageBps,
          inputDecimals: 8,
          tokenSymbol: 'PRL',
          followUpBridgeOut: {
            originAsset: intents.NEAR_USDC_ASSET_ID,
            destinationAsset: outDestAsset,
            hubContract: intents.NEAR_USDC_CONTRACT,
            hubDecimals: 6,
            hubSymbol: 'USDC',
            recipient: outRecip,
            expectedInRaw: String(activeQuote?.intermediaryRaw || liveQuote.amountOut || '0'),
            ...(isRelaySolDex ? {
              followUpSolDexSwap: {
                outputMint: toToken.contractAddress,
                outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
                toSymbol: toToken.symbol,
                expectedSolRaw: String(activeQuote?.intermediaryRaw || '0'),
                reserveSol: targetReserve,
                slippageBps: st.swap.slippageBps
              }
            } : {}),
            ...(isRelayEvmDex ? {
              followUpEvmDexSwap: {
                chainKey: String(toToken.blockchain || '').toLowerCase(),
                destToken: toToken.contractAddress,
                destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
                toSymbol: toToken.symbol,
                expectedInRaw: String(activeQuote?.intermediaryRaw || '0'),
                reserveNative: targetReserve,
                slippageBps: st.swap.slippageBps
              }
            } : {})
          }
        };
      }

      st.swap.activeOrder = {
        walletId: wallet.id,
        depositAddress: liveQuote.depositAddress,
        memo: liveQuote.memo || null,
        status: 'PENDING_DEPOSIT',
        fromSymbol: fromToken.symbol,
        toSymbol: toToken.symbol,
        originTxHash: txRes.txHash,
        autoBroadcasted: true,
        createdAt: Date.now(),
        ...(followUpRefSwap ? { followUpRefSwap } : {})
      };
      if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);

      recordWalletActivity(wallet, {
        type: 'swap',
        symbol: fromToken.symbol,
        toSymbol: toToken.symbol,
        chain: fromToken.blockchain,
        amount: amt,
        txHash: txRes.txHash,
        title: `${fromToken.symbol} ➔ ${toToken.symbol}`
      });
      await intents.submitExternalDepositTxHash({
        depositAddress: liveQuote.depositAddress,
        txHash: txRes.txHash,
        nearSenderAccount: nearId
      }).catch(() => {});
      renderSwapOrderCard();
      showToast(`✅ ${t('源链已签名发送，正在跨链交付至', 'Origin tx sent, delivering to')} ${shortenAddr(effectiveRecipient)}`);
      startOrderStatusPolling();
    } catch (err) {
      st.swap._executing = false;
      setSwapError(err && err.message ? err.message : t('兑换失败', 'Swap failed'));
      showToast(err && err.message ? err.message : t('兑换失败', 'Swap failed'));
    } finally {
      st.swap._executing = false;
      updateSwapPrimaryButtonState();
    }
  }

  function renderSwapOrderCard() {
    const st = getState();
    const order = st.swap.activeOrder;
    const activeWallet = st.getActiveWallet();
    const card = $('swap-order-card');
    if (!card) return;
    if (!order || !order.depositAddress || (order.walletId && activeWallet && order.walletId !== activeWallet.id)) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    if ($('swap-order-deposit-addr')) $('swap-order-deposit-addr').textContent = order.depositAddress;
    if ($('swap-order-status')) $('swap-order-status').textContent = order.status || 'PENDING';

    const txRow = $('swap-order-tx-row');
    const txEl = $('swap-order-origin-tx');
    if (txRow) {
      txRow.classList.toggle('hidden', !order.originTxHash);
      if (txEl && order.originTxHash) {
        txEl.textContent = shortenAddr(order.originTxHash);
      }
    }

    const isAuto = Boolean(order.autoBroadcasted);
    const manualBox = $('swap-order-manual-box');
    if (manualBox) {
      manualBox.classList.toggle('hidden', isAuto);
    }
    const qrWrap = $('swap-order-qr');
    if (qrWrap) {
      if (isAuto) {
        qrWrap.classList.add('hidden');
        qrWrap.innerHTML = '';
      } else {
        qrWrap.classList.remove('hidden');
        renderQrInto('swap-order-qr', order.depositAddress, 136);
      }
    }

    const resumeBtn = $('btn-resume-swap-stage');
    if (resumeBtn) {
      resumeBtn.classList.toggle('hidden', !order.followUpFailed);
    }
  }

  function copySwapOrderDeposit() {
    const addr = getState().swap.activeOrder?.depositAddress;
    if (addr) copyText(addr, t('充值地址', 'Deposit Address'));
  }

  async function executeFollowUpBridgeOut(wallet, order, outFollow, bridgeInRaw, fallbackContract = '') {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const nearId = wallet.nearNamedAccount || wallet.nearAddress;
    if (BigInt(bridgeInRaw) <= 0n) {
      throw new Error(t('Ref 兑换后余额不足以发起后续跨链', 'Insufficient balance after swap for follow-up bridge'));
    }
    const liveOut = await intents.quoteIntentSwapOrWithdraw({
      originAsset: outFollow.originAsset,
      destinationAsset: outFollow.destinationAsset,
      amountRaw: String(bridgeInRaw),
      slippageBps: order.followUpRefSwap?.slippageBps || 100,
      recipient: outFollow.recipient,
      refundTo: nearId,
      depositType: 'ORIGIN_CHAIN',
      recipientType: 'DESTINATION_CHAIN',
      appFeeBps: 25,
      dry: false
    });
    if (!liveOut.ok || !liveOut.depositAddress) {
      throw new Error(liveOut.error || t('获取后续跨链桥路由失败', 'Failed to get follow-up bridge route'));
    }
    const bDec = outFollow.hubDecimals || 8;
    const bSym = outFollow.hubSymbol || 'PRL';
    const bHuman = intents.fromBaseUnits(String(bridgeInRaw), bDec);
    const sendB = await contracts.executeNearNep141Transfer({
      wallet,
      tokenContract: outFollow.hubContract || fallbackContract,
      receiverId: liveOut.depositAddress,
      amount: bHuman,
      decimals: bDec,
      tokenSymbol: bSym,
      tokenBalance: Number(bHuman)
    });
    await intents.submitExternalDepositTxHash({
      depositAddress: liveOut.depositAddress,
      txHash: sendB.txHash,
      nearSenderAccount: nearId
    }).catch(() => {});
    st.swap.activeOrder = {
      walletId: wallet.id,
      depositAddress: liveOut.depositAddress,
      memo: liveOut.memo || null,
      status: 'PENDING_DEPOSIT',
      fromSymbol: order.fromSymbol,
      toSymbol: order.toSymbol,
      originTxHash: sendB.txHash,
      autoBroadcasted: true,
      createdAt: Date.now(),
      followUpSolDexSwap: outFollow.followUpSolDexSwap || null,
      followUpEvmDexSwap: outFollow.followUpEvmDexSwap || null
    };
    if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
    renderSwapOrderCard();
    startOrderStatusPolling();
    showToast(`✅ ${t('后续跨链交付已发起', 'Follow-up bridge sent')}`);
  }

  async function runActiveSwapFollowUp(order) {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    if (!order || order._followUpInFlight || order.followUpExecuted) return;
    const hasFollowUp = Boolean(
      order.followUpRefSwap ||
      order.followUpBridgeOut ||
      order.followUpSolDexSwap ||
      order.followUpEvmDexSwap ||
      order.followUpArcRelay ||
      order.followUpArcDexSwap ||
      order.followUpBaseOneClick
    );
    if (!hasFollowUp) return;

    const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
    if (!wallet) return;

    order._followUpInFlight = true;
    order.followUpFailed = false;
    try {
      if (order.followUpRefSwap) {
        const follow = order.followUpRefSwap;
        const swapFn = (follow.isDcl && Array.isArray(follow.poolIds) && follow.poolIds.length > 0 && contracts?.executeNearDclPoolSwap)
          ? 'dcl'
          : 'ref';
        if (contracts && (swapFn === 'dcl' || typeof contracts.executeNearRefFinanceSwap === 'function')) {
          const nearId = wallet.nearNamedAccount || wallet.nearAddress;
          const balMap = await intents.fetchNearNep141Balances(nearId, { [follow.tokenIn]: follow.inputDecimals || 6 }).catch(() => null);
          const liveRaw = balMap?.[follow.tokenIn]?.raw;
          const amtInRaw = (liveRaw && BigInt(liveRaw) > 0n)
            ? (follow.amountUsdcRaw && BigInt(liveRaw) > BigInt(follow.amountUsdcRaw)
                ? String(follow.amountUsdcRaw)
                : String(liveRaw))
            : String(follow.amountUsdcRaw || '0');
          if (BigInt(amtInRaw) > 0n) {
            const outFollow = follow.followUpBridgeOut || null;
            const dclFollow = follow.followUpDclSwap || null;
            const preBridgeBal = outFollow
              ? await intents.fetchNearNep141Balances(nearId, { [follow.tokenOut]: outFollow.hubDecimals || 8 }).catch(() => null)
              : (dclFollow ? await intents.fetchNearNep141Balances(nearId, { [dclFollow.tokenIn]: 6 }).catch(() => null) : null);
            const preOutRaw = BigInt(preBridgeBal?.[follow.tokenOut]?.raw || '0');
            const swapRes = swapFn === 'dcl'
              ? await contracts.executeNearDclPoolSwap({
                  wallet,
                  poolIds: follow.poolIds,
                  tokenIn: follow.tokenIn,
                  tokenOut: follow.tokenOut,
                  amountRaw: amtInRaw,
                  slippageBps: follow.slippageBps || 100,
                  inputDecimals: follow.inputDecimals || 6,
                  tokenSymbol: follow.tokenSymbol || 'USDC'
                })
              : await contracts.executeNearRefFinanceSwap({
                  wallet,
                  tokenIn: follow.tokenIn,
                  tokenOut: follow.tokenOut,
                  amountRaw: amtInRaw,
                  slippageBps: follow.slippageBps || 100,
                  inputDecimals: follow.inputDecimals || 6,
                  tokenSymbol: follow.tokenSymbol || 'USDC'
                });

            if (dclFollow && typeof contracts.executeNearDclPoolSwap === 'function') {
              const postUsdcBal = await intents.fetchNearNep141Balances(nearId, { [dclFollow.tokenIn]: 6 }).catch(() => null);
              const postUsdcRaw = BigInt(postUsdcBal?.[dclFollow.tokenIn]?.raw || '0');
              const deltaUsdc = postUsdcRaw > preOutRaw ? (postUsdcRaw - preOutRaw) : BigInt(swapRes.amountOut || '0');
              const dclInRaw = (deltaUsdc > 0n ? deltaUsdc : BigInt(swapRes.amountOut || '0')).toString();
              const dclQ = await contracts.quoteNearDclPoolSwap({
                tokenIn: dclFollow.tokenIn,
                tokenOut: dclFollow.tokenOut,
                amountRaw: dclInRaw,
                slippageBps: dclFollow.slippageBps || follow.slippageBps || 100
              });
              if (!dclQ || !dclQ.ok) {
                throw new Error((dclQ && dclQ.error) || t('DCL 第二阶段询价失败', 'DCL stage 2 quote failed'));
              }
              const dclRes = await contracts.executeNearDclPoolSwap({
                wallet,
                poolIds: dclQ.poolIds,
                tokenIn: dclFollow.tokenIn,
                tokenOut: dclFollow.tokenOut,
                amountRaw: dclInRaw,
                minAmountOut: dclQ.minAmountOut,
                slippageBps: dclFollow.slippageBps || follow.slippageBps || 100,
                tokenBalance: Number(intents.fromBaseUnits(dclInRaw, 6)),
                inputDecimals: 6,
                tokenSymbol: 'USDC'
              });
              order.followUpExecuted = true;
              order.followUpFailed = false;
              if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
              renderSwapOrderCard();
              showToast(`✅ ${t('第二阶段 Rhea CLMM 已完成兑换', 'Stage 2 Rhea CLMM swap completed')}: ${shortenAddr(dclRes.txHash)}`);
              return;
            }

            if (outFollow && outFollow.destinationAsset) {
              const postOutBal = await intents.fetchNearNep141Balances(nearId, { [follow.tokenOut]: outFollow.hubDecimals || 8 }).catch(() => null);
              const postOutRaw = BigInt(postOutBal?.[follow.tokenOut]?.raw || '0');
              const deltaOut = postOutRaw > preOutRaw ? (postOutRaw - preOutRaw) : BigInt(swapRes.amountOut || outFollow.expectedInRaw || '0');
              const bridgeInRaw = (deltaOut > 0n ? deltaOut : BigInt(outFollow.expectedInRaw || '0')).toString();
              await executeFollowUpBridgeOut(wallet, order, outFollow, bridgeInRaw, follow.tokenOut);
              return;
            }
            order.followUpExecuted = true;
            order.followUpFailed = false;
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
            renderSwapOrderCard();
            showToast(`✅ ${t('第二阶段 Ref Finance 已自动兑换', 'Step 2 auto-swapped on Ref')}: ${shortenAddr(swapRes.txHash)}`);
            return;
          }
        }
      }

      if (order.followUpBridgeOut && order.followUpBridgeOut.destinationAsset) {
        const outFollow = order.followUpBridgeOut;
        const nearId = wallet.nearNamedAccount || wallet.nearAddress;
        if (contracts && nearId) {
          const balMap = await intents.fetchNearNep141Balances(nearId, { [outFollow.hubContract]: outFollow.hubDecimals || 8 }).catch(() => null);
          const liveRaw = BigInt(balMap?.[outFollow.hubContract]?.raw || '0');
          const expectedRaw = BigInt(outFollow.expectedInRaw || '0');
          const bridgeInRaw = liveRaw > 0n
            ? (expectedRaw > 0n && liveRaw > expectedRaw ? expectedRaw : liveRaw)
            : expectedRaw;
          await executeFollowUpBridgeOut(wallet, order, outFollow, bridgeInRaw.toString(), outFollow.hubContract);
          return;
        }
      }

      if (order.followUpSolDexSwap) {
        const follow = order.followUpSolDexSwap;
        if (wallet.solAddress && contracts && typeof contracts.executeSolanaJupiterSwap === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const balRes = await contracts.fetchSolanaNativeAndSplBalances(wallet.solAddress, []).catch(() => null);
          const availLamports = BigInt(balRes?.nativeLamports || '0');
          const preLamports = BigInt(follow.preSolLamports || '0');
          const expectedLamports = BigInt(follow.expectedSolRaw || '0');
          const reserveSolVal = typeof follow.reserveSol === 'number' && Number.isFinite(follow.reserveSol) ? follow.reserveSol : 0.0035;
          const reserveLamports = BigInt(intents.toBaseUnits(String(reserveSolVal), 9));
          const maxSpendable = availLamports > reserveLamports ? availLamports - reserveLamports : 0n;
          const deltaLamports = availLamports > preLamports ? availLamports - preLamports : 0n;
          let swapInLamports = deltaLamports > 0n ? deltaLamports : expectedLamports;
          if (expectedLamports > 0n && swapInLamports > expectedLamports) swapInLamports = expectedLamports;
          if (swapInLamports > maxSpendable) swapInLamports = maxSpendable;
          if (swapInLamports <= 0n) throw new Error(t('Solana 账户 SOL 余额不足以保留手续费', 'Insufficient SOL after fee reserve'));
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances.sol = Number(contracts.fromBaseUnits(availLamports.toString(), 9));
          const jQuote = await contracts.quoteSolanaJupiterSwap({
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: follow.outputMint,
            amountRaw: swapInLamports.toString(),
            slippageBps: follow.slippageBps || 100,
            platformFeeBps: 0
          });
          const jRes = await contracts.executeSolanaJupiterSwap({
            wallet,
            quoteResponse: jQuote,
            wrapAndUnwrapSol: true,
            tokenBalance: Number(contracts.fromBaseUnits(availLamports.toString(), 9)),
            inputDecimals: 9
          });
          order.followUpExecuted = true;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          showToast(`✅ ${t('第二阶段已自动买入', 'Stage 2 bought')} ${follow.toSymbol}: ${shortenAddr(jRes.txHash)}`);
          return;
        }
      }

      if (order.followUpEvmDexSwap) {
        const follow = order.followUpEvmDexSwap;
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (evmAddr && contracts && typeof contracts.executeEvmDexSwap === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const balRes = await contracts.fetchEvmNativeAndErc20Balance(follow.chainKey, evmAddr).catch(() => null);
          const availWei = BigInt(balRes?.nativeRaw || '0');
          const preWei = BigInt(follow.preNativeWei || '0');
          const expectedWei = BigInt(follow.expectedInRaw || '0');
          const reserveHuman = typeof follow.reserveNative === 'number' && Number.isFinite(follow.reserveNative)
            ? follow.reserveNative
            : ((contracts.CHAIN_MIN_GAS_RESERVES && contracts.CHAIN_MIN_GAS_RESERVES[follow.chainKey]) || 0.0005);
          const reserveWei = BigInt(intents.toBaseUnits(String(reserveHuman), 18));
          const maxSpendable = availWei > reserveWei ? availWei - reserveWei : 0n;
          const deltaWei = availWei > preWei ? availWei - preWei : 0n;
          let swapInWei = deltaWei > 0n ? deltaWei : expectedWei;
          if (expectedWei > 0n && swapInWei > expectedWei) swapInWei = expectedWei;
          if (swapInWei > maxSpendable) swapInWei = maxSpendable;
          if (swapInWei <= 0n) throw new Error(t('目标链原生 Gas 余额不足', 'Insufficient native balance after gas reserve'));
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances[follow.chainKey] = Number(contracts.fromBaseUnits(availWei.toString(), 18));
          const evmQ = await contracts.quoteEvmDexSwap({
            chainKey: follow.chainKey,
            srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destToken: follow.destToken,
            amountRaw: swapInWei.toString(),
            srcDecimals: 18,
            destDecimals: follow.destDecimals || 18,
            slippageBps: follow.slippageBps || 100,
            feeBps: 0,
            fromAddress: evmAddr
          });
          if (!evmQ.ok || !evmQ.routeData) throw new Error(evmQ.error || t('获取第二阶段 DEX 路由失败', 'Stage 2 EVM DEX quote failed'));
          const evmRes = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: follow.chainKey,
            routeSource: evmQ.routeSource,
            routeData: evmQ.routeData,
            srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destToken: follow.destToken,
            amountRaw: swapInWei.toString(),
            srcDecimals: 18,
            slippageBps: follow.slippageBps || 100,
            tokenBalance: Number(contracts.fromBaseUnits(availWei.toString(), 18)),
            feeBps: 0
          });
          order.followUpExecuted = true;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          showToast(`✅ ${t('第二阶段 MPC 已自动兑换为', 'Stage 2 swapped to')} ${follow.toSymbol}: ${shortenAddr(evmRes.txHash)}`);
          return;
        }
      }

      if (order.followUpArcRelay) {
        const follow = order.followUpArcRelay;
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (evmAddr && contracts && typeof contracts.executeEvmRawSteps === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const baseBal = await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null);
          const availRaw = BigInt(baseBal?.tokenRaw || '0');
          const preRaw = BigInt(follow.preBaseRaw || '0');
          const expectedRaw = BigInt(follow.expectedBaseRaw || '0');
          const deltaRaw = availRaw > preRaw ? availRaw - preRaw : 0n;
          let bridgeInRaw = deltaRaw > 0n ? deltaRaw : expectedRaw;
          if (expectedRaw > 0n && bridgeInRaw > expectedRaw) bridgeInRaw = expectedRaw;
          if (bridgeInRaw > availRaw && availRaw > 0n) bridgeInRaw = availRaw;
          if (bridgeInRaw <= 0n) throw new Error(t('Base USDC 余额不足以发起 Relay 跨链至 Arc', 'Insufficient Base USDC for Relay to Arc'));

          const destLower = String(follow.destContract || intents.ARC_USDC_CONTRACT).toLowerCase();
          const needsArcSwap = Boolean(follow.destContract && destLower !== intents.ARC_USDC_CONTRACT.toLowerCase() && destLower !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
          const relayRecipient = (!needsArcSwap && follow.recipient && /^0x[0-9a-fA-F]{40}$/.test(follow.recipient))
            ? follow.recipient
            : evmAddr;
          const preArcRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
          const relayLive = await intents.quoteRelayBridge({
            user: evmAddr,
            recipient: relayRecipient,
            originChainId: 8453,
            destinationChainId: 5042,
            originCurrency: intents.BASE_USDC_EVM,
            destinationCurrency: intents.ARC_USDC_CONTRACT,
            amount: bridgeInRaw.toString()
          });
          if (!relayLive.ok || !relayLive.steps?.length) throw new Error(relayLive.error || t('Relay Base->Arc 构建失败', 'Relay Base->Arc failed'));
          const relayTx = await contracts.executeEvmRawSteps({ wallet, chainKey: 'base', steps: relayLive.steps });
          if (needsArcSwap) {
            delete order.followUpArcRelay;
            order.status = 'PENDING_ARC_BRIDGE';
            order.followUpExecuted = false;
            order.followUpFailed = false;
            order.followUpArcDexSwap = {
              destContract: follow.destContract,
              destDecimals: follow.destDecimals || 18,
              toSymbol: follow.toSymbol,
              expectedArcUsdcRaw: String(relayLive.amountOut || bridgeInRaw.toString()),
              preArcUsdcRaw: String(preArcRes?.nativeRaw || '0'),
              slippageBps: follow.slippageBps || 100
            };
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
            renderSwapOrderCard();
            startOrderStatusPolling();
            showToast(`✅ ${t('第二阶段 Relay 已发送至 Arc 主网，到账后将自动兑换', 'Stage 2 Relay sent to Arc; will auto-swap on arrival')}: ${shortenAddr(relayTx.txHash)}`);
            return;
          }
          order.followUpExecuted = true;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          showToast(`✅ ${t('第二阶段 Relay 已发送至 Arc 主网', 'Stage 2 Relay sent to Arc Mainnet')}: ${shortenAddr(relayTx.txHash)}`);
          return;
        }
      }

      if (order.followUpArcDexSwap) {
        const follow = order.followUpArcDexSwap;
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (evmAddr && contracts && typeof contracts.executeEvmDexSwap === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const arcBalRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
          const availWei = BigInt(arcBalRes?.nativeRaw || '0');
          const preWei = BigInt(follow.preArcUsdcRaw || '0');
          const expected6 = BigInt(follow.expectedArcUsdcRaw || '0');
          const expectedWei = expected6 > 0n ? (expected6 * 1000000000000n) : 0n;
          const reserveWei = BigInt(intents.toBaseUnits('0.02', 18));
          const maxSpendableWei = availWei > reserveWei ? availWei - reserveWei : 0n;
          const deltaWei = availWei > preWei ? availWei - preWei : 0n;
          let swapInWei = deltaWei > 0n ? deltaWei : expectedWei;
          if (expectedWei > 0n && swapInWei > expectedWei) swapInWei = expectedWei;
          if (swapInWei > maxSpendableWei) swapInWei = maxSpendableWei;
          const swapIn6 = swapInWei / 1000000000000n;
          if (swapIn6 <= 0n) {
            throw new Error(t('Arc 主网 USDC 尚未到账或不足预留 Gas', 'Arc Mainnet USDC not yet arrived or below gas reserve'));
          }
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances.arc = Number(contracts.fromBaseUnits(availWei.toString(), 18));
          const arcQ = await contracts.quoteEvmDexSwap({
            chainKey: 'arc',
            srcToken: intents.ARC_USDC_CONTRACT,
            destToken: follow.destContract,
            amountRaw: swapIn6.toString(),
            srcDecimals: 6,
            destDecimals: follow.destDecimals || 18,
            slippageBps: follow.slippageBps || 100,
            feeBps: 0,
            fromAddress: evmAddr
          });
          if (!arcQ.ok || !arcQ.routeData) {
            throw new Error(arcQ.error || t('获取 Arc DEX 路由失败', 'Arc DEX quote failed'));
          }
          const arcRes = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: 'arc',
            routeSource: arcQ.routeSource,
            routeData: arcQ.routeData,
            srcToken: intents.ARC_USDC_CONTRACT,
            destToken: follow.destContract,
            amountRaw: swapIn6.toString(),
            srcDecimals: 6,
            slippageBps: follow.slippageBps || 100,
            tokenBalance: Number(contracts.fromBaseUnits(availWei.toString(), 18)),
            feeBps: 0
          });
          order.status = 'COMPLETED';
          order.followUpExecuted = true;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          showToast(`✅ ${t('Arc 主网已自动兑换为', 'Arc Mainnet swapped to')} ${follow.toSymbol}: ${shortenAddr(arcRes.txHash)}`);
          return;
        }
      }

      if (order.followUpBaseOneClick && order.followUpBaseOneClick.destinationAsset) {
        const follow = order.followUpBaseOneClick;
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        const nearId = wallet.nearNamedAccount || wallet.nearAddress;
        if (evmAddr && contracts && typeof contracts.executeEvmTransfer === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const baseBal = await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null);
          const availRaw = BigInt(baseBal?.tokenRaw || '0');
          const preRaw = BigInt(follow.preBaseRaw || '0');
          const expectedRaw = BigInt(follow.expectedBaseRaw || '0');
          const deltaRaw = availRaw > preRaw ? availRaw - preRaw : 0n;
          let bridgeInRaw = deltaRaw > 0n ? deltaRaw : expectedRaw;
          if (expectedRaw > 0n && bridgeInRaw > expectedRaw) bridgeInRaw = expectedRaw;
          if (availRaw > 0n && bridgeInRaw > availRaw) bridgeInRaw = availRaw;
          if (bridgeInRaw <= 0n || availRaw < bridgeInRaw) {
            throw new Error(t('Base USDC 尚未到账，无法发起第三阶段跨链', 'Base USDC not yet arrived for stage 3 swap'));
          }
          const s3Quote = await intents.quoteIntentSwapOrWithdraw({
            originAsset: intents.BASE_USDC_1CLICK_ID,
            destinationAsset: follow.destinationAsset,
            amountRaw: bridgeInRaw.toString(),
            slippageBps: follow.slippageBps || 100,
            recipient: follow.recipient,
            refundTo: nearId || evmAddr,
            nearAccountId: nearId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: false
          });
          if (!s3Quote.ok || !s3Quote.depositAddress) {
            throw new Error(s3Quote.error || t('获取第三阶段跨链路由失败', 'Failed to get stage 3 1Click route'));
          }
          const sendS3 = await contracts.executeEvmTransfer({
            wallet,
            chainKey: 'base',
            toAddress: s3Quote.depositAddress,
            amount: intents.fromBaseUnits(bridgeInRaw.toString(), 6),
            tokenContract: intents.BASE_USDC_EVM,
            decimals: 6,
            tokenBalance: Number(intents.fromBaseUnits(availRaw.toString(), 6))
          });
          await intents.submitExternalDepositTxHash({
            depositAddress: s3Quote.depositAddress,
            txHash: sendS3.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          delete order.followUpBaseOneClick;
          order.depositAddress = s3Quote.depositAddress;
          order.memo = s3Quote.memo || null;
          order.status = 'PENDING_DEPOSIT';
          order.originTxHash = sendS3.txHash;
          order.followUpExecuted = false;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('第三阶段 Base USDC -> 目标链跨链已发起', 'Stage 3 Base USDC bridge sent')}: ${shortenAddr(sendS3.txHash)}`);
          return;
        }
      }
    } catch (err) {
      order.followUpExecuted = false;
      order.followUpFailed = true;
      order.followUpError = (err && err.message) || t('后续自动兑换执行失败', 'Follow-up swap execution failed');
      if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
      renderSwapOrderCard();
      showToast(order.followUpError);
    } finally {
      delete order._followUpInFlight;
    }
  }

  async function resumeActiveSwapFollowUp() {
    const st = getState();
    const order = st.swap.activeOrder;
    if (!order || order.followUpExecuted) return;
    order.followUpFailed = false;
    renderSwapOrderCard();
    await runActiveSwapFollowUp(order);
    refreshAllBalancesAsync(false);
  }

  async function refreshActiveSwapOrderStatus() {
    const st = getState();
    const order = st.swap.activeOrder;
    const intents = getIntents();
    const contracts = getContracts();
    if (!order || !order.depositAddress) return;
    if (order.followUpBaseOneClick && !order.followUpExecuted && !order.followUpFailed && order.status === 'PENDING_BASE_BRIDGE') {
      const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
      const evmAddr = wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '';
      if (evmAddr && contracts) {
        const baseBalRes = await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null);
        const availRaw = BigInt(baseBalRes?.tokenRaw || '0');
        const preRaw = BigInt(order.followUpBaseOneClick.preBaseRaw || '0');
        if (availRaw > preRaw) {
          if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
          order.status = 'SUCCESS';
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          await runActiveSwapFollowUp(order);
          refreshAllBalancesAsync(false);
        }
      }
      return;
    }
    if (order.followUpArcDexSwap && !order.followUpExecuted && !order.followUpFailed && order.status === 'PENDING_ARC_BRIDGE') {
      const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
      const evmAddr = wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '';
      if (evmAddr && contracts) {
        const arcBalRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
        const availWei = BigInt(arcBalRes?.nativeRaw || '0');
        const preWei = BigInt(order.followUpArcDexSwap.preArcUsdcRaw || '0');
        const reserveWei = BigInt(intents.toBaseUnits('0.02', 18));
        if (availWei > preWei && availWei > reserveWei) {
          if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
          order.status = 'SUCCESS';
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          await runActiveSwapFollowUp(order);
          refreshAllBalancesAsync(false);
        }
      }
      return;
    }
    const res = await intents.fetchSwapOrderStatus(order.depositAddress);
    if (res.ok && res.status) {
      order.status = res.status;
      if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
      renderSwapOrderCard();
      const upper = String(res.status).toUpperCase();
      if (['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED'].includes(upper)) {
        if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
        if (['SUCCESS', 'COMPLETED'].includes(upper) && !order.followUpExecuted && !order.followUpFailed) {
          await runActiveSwapFollowUp(order);
        }
        refreshAllBalancesAsync(false);
      }
    }
  }

  function startOrderStatusPolling() {
    if (_orderPollTimer) clearInterval(_orderPollTimer);
    _orderPollCount = 0;
    refreshActiveSwapOrderStatus();
    _orderPollTimer = setInterval(() => {
      _orderPollCount += 1;
      if (_orderPollCount > 240) {
        clearInterval(_orderPollTimer);
        _orderPollTimer = null;
        return;
      }
      refreshActiveSwapOrderStatus();
    }, 6000);
  }

  async function submitSwapOrderTxHash() {
    const st = getState();
    const intents = getIntents();
    const wallet = st.getActiveWallet();
    const order = st.swap.activeOrder;
    const hash = ($('swap-order-txhash-input')?.value || '').trim();
    if (!order || !order.depositAddress || !hash) {
      showToast(t('请输入有效的 TxHash', 'Enter a valid TxHash'));
      return;
    }
    const res = await intents.submitExternalDepositTxHash({
      depositAddress: order.depositAddress,
      txHash: hash,
      nearSenderAccount: wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : undefined
    });
    if (res.ok) {
      showToast(t('已提交充值凭证，加速确认中', 'Deposit hash submitted'));
      refreshActiveSwapOrderStatus();
    } else {
      showToast(res.error || t('提交失败', 'Submit failed'));
    }
  }

  function clearActiveSwapOrder() {
    if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
    const st = getState();
    st.swap.activeOrder = null;
    if (typeof st.clearSavedSwapOrder === 'function') st.clearSavedSwapOrder();
    renderSwapOrderCard();
  }

  // ==================== Token Picker Modal ====================

  const PICKER_CHAIN_STORAGE_KEY = 'near_ca_swap_picker_chain';

  function loadSavedPickerChain() {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(PICKER_CHAIN_STORAGE_KEY) : null;
      return v ? String(v) : 'all';
    } catch (_) {
      return 'all';
    }
  }

  function openTokenPicker(side) {
    const st = getState();
    st.limit.pickerSide = null;
    st.swap.pickerSide = side === 'to' ? 'to' : 'from';
    st.swap.pickerChainFilter = loadSavedPickerChain();
    st.swap.pickerSearch = '';
    if ($('token-picker-search')) $('token-picker-search').value = '';
    renderTokenPickerList();
    openSheet('sheet-token-picker');
  }

  function openLimitTokenPicker(side) {
    const st = getState();
    st.limit.pickerSide = side === 'to' ? 'to' : 'from';
    st.swap.pickerSide = st.limit.pickerSide;
    st.swap.pickerSearch = '';
    if ($('token-picker-search')) $('token-picker-search').value = '';
    renderTokenPickerList();
    openSheet('sheet-token-picker');
  }

  function setTokenPickerChain(chainKey) {
    getState().swap.pickerChainFilter = chainKey;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(PICKER_CHAIN_STORAGE_KEY, String(chainKey)); } catch (_) {}
    renderTokenPickerList();
  }

  function toggleFavoriteSwapToken(assetId) {
    const st = getState();
    if (typeof st.toggleFavoriteTokenId === 'function') {
      st.toggleFavoriteTokenId(assetId);
    }
    renderTokenPickerList();
  }

  let _jupSearchTimer = null;
  let _lastJupSearchQuery = '';
  const PREFERRED_PICKER_CHAINS = ['near', 'prl', 'qtc', 'sol', 'eth', 'base', 'arb', 'bsc', 'arc', 'hood', 'btc'];

  function renderTokenPickerList() {
    const st = getState();
    const tokens = getTokens();
    const intents = getIntents();
    const wallet = st.getActiveWallet();
    const limitPickerSide = st.limit && st.limit.pickerSide;
    if (limitPickerSide) {
      const limitCatalog = getLimitPickerCatalog(limitPickerSide);
      const search = ($('token-picker-search')?.value || '').trim().toLowerCase();
      const favBar = $('token-picker-favorites');
      if (favBar) {
        favBar.classList.add('hidden');
        favBar.innerHTML = '';
      }
      const chainBar = $('token-picker-chains');
      if (chainBar) {
        const meta = tokens.getChainMeta(st.limit.chain);
        chainBar.innerHTML = `<button type="button" class="filter-pill active">${escapeHtml(meta.shortName)}</button>`;
      }
      const rows = limitCatalog
        .filter((tok) => {
          if (!search) return true;
          const hay = `${tok.symbol} ${tok.name} ${tok.contractAddress || ''}`.toLowerCase();
          return hay.includes(search);
        })
        .map((tok) => ({
          tok,
          bal: wallet ? getLimitTokenBalance(wallet, tok) : null
        }))
        .sort((a, b) => {
          const posA = typeof a.bal === 'number' && a.bal > 0;
          const posB = typeof b.bal === 'number' && b.bal > 0;
          if (posA !== posB) return posA ? -1 : 1;
          return (b.bal || 0) - (a.bal || 0);
        });
      const listEl = $('token-picker-list');
      if (!listEl) return;
      listEl.innerHTML = rows.map(({ tok, bal }) => {
        const liveP = (typeof tok.price === 'number' && tok.price > 0) ? tok.price : getSymbolPrice(tok.symbol);
        return `
          <div class="asset-sub-row" role="button" tabindex="0" style="width:100%;cursor:pointer;text-align:left;" data-action="select-swap-token" data-asset-id="${escapeHtml(tok.contractAddress || tok.assetId)}">
            <div class="asset-sub-info">
              ${tokens.renderTokenIconWithBadge(tok, 32, true)}
              <div class="asset-sub-meta">
                <span class="asset-sub-name">${escapeHtml(tok.symbol)} · ${escapeHtml(tok.networkName || tok.blockchain)}</span>
                <span class="asset-sub-tag">${escapeHtml(tok.name || '')}</span>
              </div>
            </div>
            <div class="asset-sub-right">
              <span class="asset-sub-bal">${escapeHtml(formatBal(bal, 5))}</span>
              <span class="asset-sub-tag">${escapeHtml(formatTokenPrice(liveP))}</span>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    const catalog = getSwapTokenCatalog();
    const isFromPicker = st.swap.pickerSide === 'from';
    const pickerCatalog = isFromPicker ? catalog.filter(isSwapOriginSupported) : catalog;

    const search = ($('token-picker-search')?.value || '').trim().toLowerCase();
    const uniqueChains = Array.from(new Set(pickerCatalog.map((x) => x.blockchain).filter(Boolean)));
    const orderedChains = [
      ...PREFERRED_PICKER_CHAINS.filter((ck) => (!isFromPicker || isSwapOriginSupported({ blockchain: ck })) && (ck === 'arc' || uniqueChains.includes(ck))),
      ...uniqueChains.filter((ck) => !PREFERRED_PICKER_CHAINS.includes(ck))
    ];

    const favIds = Array.isArray(st.favoriteTokenIds) ? st.favoriteTokenIds : [];
    const favSet = new Set(favIds.map((id) => String(id || '').toLowerCase()));
    const catalogById = new Map();
    for (const item of pickerCatalog) {
      if (item && item.assetId) catalogById.set(String(item.assetId).toLowerCase(), item);
    }

    const favBar = $('token-picker-favorites');
    if (favBar) {
      const favTokens = favIds
        .map((id) => catalogById.get(String(id || '').toLowerCase()))
        .filter(Boolean);
      if (favTokens.length > 0) {
        favBar.classList.remove('hidden');
        favBar.innerHTML = favTokens.map((tok) => `
          <button type="button" class="filter-pill flex items-center gap-1" style="display:inline-flex;align-items:center;gap:5px;" data-action="select-swap-token" data-asset-id="${escapeHtml(tok.assetId)}">
            ${tokens.renderTokenIconWithBadge(tok, 18, true)}
            <span>${escapeHtml(tok.symbol)}</span>
          </button>
        `).join('');
      } else {
        favBar.classList.add('hidden');
        favBar.innerHTML = '';
      }
    }

    const chainBar = $('token-picker-chains');
    if (chainBar) {
      chainBar.innerHTML = [
        `<button type="button" class="filter-pill ${st.swap.pickerChainFilter === 'all' ? 'active' : ''}" data-action="set-picker-chain" data-chain="all">${t('全部网络', 'All')}</button>`,
        ...orderedChains.slice(0, 15).map((ck) => {
          const meta = tokens.getChainMeta(ck);
          return `<button type="button" class="filter-pill ${st.swap.pickerChainFilter === ck ? 'active' : ''}" data-action="set-picker-chain" data-chain="${escapeHtml(ck)}">${escapeHtml(meta.shortName)}</button>`;
        })
      ].join('');
    }

    if (search.length >= 2 && search !== _lastJupSearchQuery && intents && typeof intents.searchJupiterTokensV2 === 'function') {
      if (_jupSearchTimer) clearTimeout(_jupSearchTimer);
      const querySnapshot = search;
      _jupSearchTimer = setTimeout(async () => {
        _lastJupSearchQuery = querySnapshot;
        const hits = await intents.searchJupiterTokensV2(querySnapshot).catch(() => []);
        if (!Array.isArray(hits) || hits.length === 0) return;
        const existing = new Set((st.dynamicSolTokens || []).map((x) => String(x.assetId || '').toLowerCase()));
        const merged = [...(st.dynamicSolTokens || [])];
        for (const h of hits) {
          if (h && h.assetId && !existing.has(String(h.assetId).toLowerCase())) {
            existing.add(String(h.assetId).toLowerCase());
            merged.push(h);
          }
        }
        st.dynamicSolTokens = merged.slice(-120);
        const currentSearch = ($('token-picker-search')?.value || '').trim().toLowerCase();
        if (currentSearch === querySnapshot) renderTokenPickerList();
      }, 250);
    }

    const filteredWithMeta = pickerCatalog
      .map((tok, catalogIdx) => ({ tok, catalogIdx }))
      .filter(({ tok }) => {
        if (st.swap.pickerChainFilter !== 'all' && tok.blockchain !== st.swap.pickerChainFilter) {
          return false;
        }
        if (search) {
          const hay = `${tok.symbol} ${tok.name} ${tok.networkName} ${tok.contractAddress || ''}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .map(({ tok, catalogIdx }) => ({
        tok,
        catalogIdx,
        bal: wallet ? getSwapTokenAvailableBalance(tok, st.swap.pickerSide === 'from') : null
      }))
      .sort((a, b) => {
        const posA = typeof a.bal === 'number' && a.bal > 0;
        const posB = typeof b.bal === 'number' && b.bal > 0;
        if (posA !== posB) return posA ? -1 : 1;
        if (posA && posB) {
          const usdA = a.bal * (typeof a.tok.price === 'number' && a.tok.price > 0 ? a.tok.price : 0);
          const usdB = b.bal * (typeof b.tok.price === 'number' && b.tok.price > 0 ? b.tok.price : 0);
          if (usdB !== usdA) return usdB - usdA;
          if (b.bal !== a.bal) return b.bal - a.bal;
        }
        return a.catalogIdx - b.catalogIdx;
      })
      .slice(0, 80);

    const listEl = $('token-picker-list');
    if (!listEl) return;
    listEl.innerHTML = filteredWithMeta.map(({ tok, bal }) => {
      const liveP = (typeof tok.price === 'number' && tok.price > 0) ? tok.price : getSymbolPrice(tok.symbol);
      const priceText = formatTokenPrice(liveP);
      const isFav = favSet.has(String(tok.assetId || '').toLowerCase());
      const starStyle = isFav
        ? 'color:#F59E0B;font-size:16px;padding:4px 6px;background:transparent;border:none;cursor:pointer;line-height:1;'
        : 'color:var(--text-muted);font-size:16px;padding:4px 6px;background:transparent;border:none;cursor:pointer;line-height:1;';
      return `
        <div class="asset-sub-row" role="button" tabindex="0" style="width:100%;cursor:pointer;text-align:left;" data-action="select-swap-token" data-asset-id="${escapeHtml(tok.assetId)}">
          <div class="asset-sub-info">
            ${tokens.renderTokenIconWithBadge(tok, 32, true)}
            <div class="asset-sub-meta">
              <span class="asset-sub-name">${escapeHtml(tok.symbol)} · ${escapeHtml(tok.networkName || tok.blockchain)}</span>
              <span class="asset-sub-tag">${escapeHtml(tok.name || '')}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="asset-sub-right">
              <span class="asset-sub-bal">${escapeHtml(formatBal(bal, 5))}</span>
              <span class="asset-sub-tag">${escapeHtml(priceText)}</span>
            </div>
            <button type="button" style="${starStyle}" data-action="toggle-fav-token" data-stop="1" data-asset-id="${escapeHtml(tok.assetId)}" aria-label="Favorite">${isFav ? '★' : '☆'}</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function selectSwapToken(assetId) {
    const st = getState();
    if (st.limit && st.limit.pickerSide) {
      const side = st.limit.pickerSide;
      st.limit.pickerSide = null;
      if (side === 'from') {
        st.limit.sellContract = assetId;
      } else {
        st.limit.buyContract = assetId;
      }
      st.limit.targetRate = '';
      st.limit.priceInverted = null;
      st.limit.snappedPoint = null;
      st.limit.liveMarketRate = null;
      st.limit.poolInfo = null;
      st.limit.evmAllowanceRaw = null;
      closeAllSheets();
      renderLimitOrderView();
      refreshLimitMarketContextAsync().catch(() => {});
      return;
    }
    if (st.swap.pickerSide === 'from') {
      st.swap.fromAssetId = assetId;
    } else {
      st.swap.toAssetId = assetId;
      st.swap.recipientAddress = '';
    }
    st.swap.rateInverted = false;
    resetSwapQuoteDisplay();
    if (typeof st.saveSwapPair === 'function') st.saveSwapPair();
    setSwapError('');
    closeAllSheets();
    renderSwapView();
    if (st.swap.amountIn) scheduleSwapQuote();
  }

  // ==================== Multi-Chain Limit Orders UI Controller ====================

  function getLimitTokenListForChain(chainKey) {
    const lo = getLimitOrders();
    const tokens = getTokens();
    const catalog = getSwapTokenCatalog();
    const chain = String(chainKey || 'near').toLowerCase();

    if (chain === 'near') {
      const allowed = lo ? lo.getNearLimitSellTokens() : [];
      const metaMap = (lo && lo.NEAR_LIMIT_TOKEN_META) || {};
      const out = [];
      for (const cid of allowed) {
        const meta = metaMap[cid];
        const catHit = catalog.find(
          (item) => item && item.blockchain === 'near' && String(item.contractAddress || '').toLowerCase() === cid.toLowerCase()
        );
        const symbol = (meta && meta.symbol) || (catHit && catHit.symbol) || cid.split('.')[0].toUpperCase();
        const decimals = (meta && typeof meta.decimals === 'number') ? meta.decimals : (catHit && typeof catHit.decimals === 'number' ? catHit.decimals : 18);
        const livePrice = catHit && typeof catHit.price === 'number' ? catHit.price : getSymbolPrice(symbol === 'wNEAR' ? 'NEAR' : symbol);
        out.push({
          symbol,
          name: (meta && meta.name) || (catHit && catHit.name) || symbol,
          blockchain: 'near',
          assetId: (meta && meta.assetId) || (catHit && catHit.assetId) || `nep141:${cid}`,
          contractAddress: cid,
          decimals,
          networkName: 'NEAR DCL',
          logoURI: (catHit && catHit.logoURI) || (tokens && tokens.TOKEN_ICON_MAP ? tokens.TOKEN_ICON_MAP[symbol.toUpperCase()] : ''),
          price: livePrice
        });
      }
      return out;
    }

    if (chain === 'sol') {
      return catalog.filter((item) => lo && lo.isSolanaTokenEligibleForLimit(item));
    }

    const byAddr = new Map();
    for (const item of catalog) {
      if (item && String(item.blockchain || '').toLowerCase() === chain && item.contractAddress) {
        byAddr.set(String(item.contractAddress).toLowerCase(), item);
      }
    }
    const fallbacks = (lo && lo.LIMIT_EVM_FALLBACK_TOKENS && lo.LIMIT_EVM_FALLBACK_TOKENS[chain]) || [];
    for (const fb of fallbacks) {
      const key = String(fb.contractAddress || '').toLowerCase();
      if (key && !byAddr.has(key)) {
        const price = getSymbolPrice(fb.symbol);
        byAddr.set(key, { ...fb, price });
      }
    }
    return Array.from(byAddr.values());
  }

  function getLimitTokenBalance(wallet, token) {
    if (!wallet || !token) return null;
    const bc = String(token.blockchain || '').toLowerCase();
    if (bc === 'near') {
      const cid = String(token.contractAddress || '').trim();
      const entry = wallet.nearNep141Balances && wallet.nearNep141Balances[cid];
      return entry && typeof entry.formatted === 'number' && Number.isFinite(entry.formatted) ? entry.formatted : 0;
    }
    return getWalletNativeBalanceForToken(wallet, bc, token.symbol, token.contractAddress);
  }

  function getLimitPickerCatalog(side) {
    const st = getState();
    const lo = getLimitOrders();
    const chain = st.limit.chain || 'near';
    const list = getLimitTokenListForChain(chain);
    if (chain === 'near') {
      if (side === 'to') {
        const counters = lo ? lo.getNearLimitCounterTokens(st.limit.sellContract) : [];
        const set = new Set(counters.map((c) => c.toLowerCase()));
        return list.filter((tok) => set.has(String(tok.contractAddress || '').toLowerCase()));
      }
      return list;
    }
    if (chain === 'sol') {
      const exclude = String(side === 'from' ? st.limit.buyContract : st.limit.sellContract || '').toLowerCase();
      return list.filter((tok) => String(tok.contractAddress || '').toLowerCase() !== exclude);
    }
    if (side === 'from') {
      const exclude = String(st.limit.buyContract || '').toLowerCase();
      return list.filter((tok) => !(lo && lo.isEvmNativeSentinel(tok.contractAddress)) && String(tok.contractAddress || '').toLowerCase() !== exclude);
    }
    const exclude = String(st.limit.sellContract || '').toLowerCase();
    return list.filter((tok) => String(tok.contractAddress || '').toLowerCase() !== exclude);
  }

  function resolveLimitSelectedTokens() {
    const st = getState();
    const lo = getLimitOrders();
    const chain = st.limit.chain || 'near';
    const list = getLimitTokenListForChain(chain);
    if (list.length === 0) return { sellToken: null, buyToken: null };

    const findByAddr = (addr) => list.find((item) => String(item.contractAddress || '').toLowerCase() === String(addr || '').toLowerCase()) || null;
    let sellToken = findByAddr(st.limit.sellContract);
    let buyToken = findByAddr(st.limit.buyContract);

    if (chain !== 'near' && chain !== 'sol' && sellToken && lo && lo.isEvmNativeSentinel(sellToken.contractAddress)) {
      sellToken = null;
    }
    if (!sellToken) {
      if (chain === 'near') sellToken = findByAddr('token.rhealab.near') || list[0];
      else if (chain === 'sol') sellToken = findByAddr('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') || list[0];
      else sellToken = list.find((x) => !(lo && lo.isEvmNativeSentinel(x.contractAddress)) && x.symbol === 'USDC') || list.find((x) => !(lo && lo.isEvmNativeSentinel(x.contractAddress))) || list[0];
    }

    if (chain === 'near' && lo) {
      const counters = lo.getNearLimitCounterTokens(sellToken.contractAddress);
      const validCounterSet = new Set(counters.map((c) => c.toLowerCase()));
      if (!buyToken || !validCounterSet.has(String(buyToken.contractAddress || '').toLowerCase())) {
        const preferredCounter = sellToken.contractAddress === 'token.rhealab.near' ? 'otoken.rhealab.near' : counters[0];
        buyToken = findByAddr(preferredCounter) || list.find((x) => validCounterSet.has(String(x.contractAddress || '').toLowerCase())) || null;
      }
    } else if (!buyToken || String(buyToken.contractAddress || '').toLowerCase() === String(sellToken.contractAddress || '').toLowerCase()) {
      const cfg = lo && lo.COW_CHAINS ? lo.COW_CHAINS[chain] : null;
      if (chain === 'sol') {
        buyToken = findByAddr(lo.SOL_NATIVE_MINT) || list.find((x) => x.contractAddress !== sellToken.contractAddress) || null;
      } else {
        buyToken = (cfg && findByAddr(cfg.wrappedNative)) || list.find((x) => x.contractAddress !== sellToken.contractAddress) || null;
      }
    }

    if (sellToken) st.limit.sellContract = sellToken.contractAddress;
    if (buyToken) st.limit.buyContract = buyToken.contractAddress;
    return { sellToken, buyToken };
  }

  function setSwapPanelMode(mode) {
    const st = getState();
    const next = mode === 'limit' ? 'limit' : 'market';
    st.swap.panelMode = next;
    const marketPanel = $('swap-market-panel');
    const limitPanel = $('swap-limit-panel');
    const marketBtn = $('swap-mode-market-btn');
    const limitBtn = $('swap-mode-limit-btn');
    if (marketPanel) marketPanel.classList.toggle('hidden', next !== 'market');
    if (limitPanel) limitPanel.classList.toggle('hidden', next !== 'limit');
    if (marketBtn) marketBtn.classList.toggle('active', next === 'market');
    if (limitBtn) limitBtn.classList.toggle('active', next === 'limit');
    if (next === 'limit') {
      renderLimitOrderView();
      refreshLimitMarketContextAsync().catch(() => {});
      refreshLimitOrdersAsync(false).catch(() => {});
    } else {
      renderSwapView();
    }
  }

  function setLimitChain(chainKey) {
    const st = getState();
    const key = String(chainKey || 'near').toLowerCase();
    st.limit.chain = key;
    st.limit.sellContract = '';
    st.limit.buyContract = '';
    st.limit.amountIn = '';
    st.limit.targetRate = '';
    st.limit.priceInverted = null;
    st.limit.snappedPoint = null;
    st.limit.liveMarketRate = null;
    st.limit.poolInfo = null;
    st.limit.evmAllowanceRaw = null;
    st.limit.errorMsg = '';
    st.limit.ordersActive = [];
    st.limit.ordersHistory = [];
    renderLimitOrderView();
    refreshLimitMarketContextAsync().catch(() => {});
    refreshLimitOrdersAsync(false).catch(() => {});
  }

  function resolveLimitPriceOrientation(sellToken, buyToken) {
    const st = getState();
    if (!sellToken || !buyToken) {
      return { inverted: false, baseSymbol: sellToken?.symbol || '--', quoteSymbol: buyToken?.symbol || '--' };
    }
    const manual = st.limit.priceInverted;
    const auto = isStablecoinSymbol(sellToken.symbol) && !isStablecoinSymbol(buyToken.symbol);
    const inverted = (manual === true || manual === false) ? manual : auto;
    return {
      inverted,
      baseSymbol: inverted ? buyToken.symbol : sellToken.symbol,
      quoteSymbol: inverted ? sellToken.symbol : buyToken.symbol
    };
  }

  function toLimitDisplayPrice(canonicalRateOutPerIn, inverted) {
    const r = Number(canonicalRateOutPerIn);
    if (!Number.isFinite(r) || r <= 0) return '';
    const disp = inverted ? (1 / r) : r;
    return Number(disp.toPrecision(6)).toString();
  }

  function toggleLimitPriceOrientation() {
    const st = getState();
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    const nextInverted = !inverted;
    st.limit.priceInverted = nextInverted;
    if ($('limit-target-rate')) {
      $('limit-target-rate').value = toLimitDisplayPrice(st.limit.targetRate, nextInverted);
    }
    renderLimitOrderView();
  }

  function handleLimitInput() {
    const st = getState();
    st.limit.amountIn = ($('limit-amount-in')?.value || '').trim();
    st.limit.errorMsg = '';
    renderLimitOrderCalculations();
  }

  function handleLimitRateInput() {
    const st = getState();
    const raw = ($('limit-target-rate')?.value || '').trim();
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    const num = Number(raw);
    if (!raw) {
      st.limit.targetRate = '';
    } else if (inverted) {
      st.limit.targetRate = Number.isFinite(num) && num > 0 ? Number((1 / num).toPrecision(8)).toString() : '';
    } else {
      st.limit.targetRate = raw;
    }
    st.limit.snappedPoint = null;
    st.limit.errorMsg = '';
    renderLimitOrderCalculations();
  }

  function setLimitMaxAmount() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const { sellToken } = resolveLimitSelectedTokens();
    if (!wallet || !sellToken) return;
    const bal = getLimitTokenBalance(wallet, sellToken) || 0;
    let maxAmt = bal;
    if (st.limit.chain === 'sol' && sellToken.contractAddress === getLimitOrders()?.SOL_NATIVE_MINT) {
      maxAmt = Math.max(0, bal - (getLimitOrders()?.SOL_LIMIT_GAS_RESERVE || 0.005));
    }
    st.limit.amountIn = maxAmt > 0 ? String(Number(maxAmt.toFixed(6))) : '0';
    if ($('limit-amount-in')) $('limit-amount-in').value = st.limit.amountIn;
    renderLimitOrderCalculations();
  }

  function flipLimitTokens() {
    const st = getState();
    const lo = getLimitOrders();
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    if (!sellToken || !buyToken) return;
    if (st.limit.chain !== 'near' && st.limit.chain !== 'sol' && lo && lo.isEvmNativeSentinel(buyToken.contractAddress)) {
      showToast(t('原生 Gas 币不可直接挂单卖出', 'Native gas coin cannot be sold directly'));
      return;
    }
    const prevRate = Number(st.limit.targetRate);
    st.limit.sellContract = buyToken.contractAddress;
    st.limit.buyContract = sellToken.contractAddress;
    st.limit.priceInverted = null;
    st.limit.snappedPoint = null;
    st.limit.evmAllowanceRaw = null;
    st.limit.liveMarketRate = st.limit.liveMarketRate && st.limit.liveMarketRate > 0 ? (1 / st.limit.liveMarketRate) : null;
    st.limit.targetRate = Number.isFinite(prevRate) && prevRate > 0 ? Number((1 / prevRate).toPrecision(6)).toString() : '';
    renderLimitOrderView();
    refreshLimitMarketContextAsync().catch(() => {});
  }

  function applyLimitRateOffset(pct) {
    const st = getState();
    const lo = getLimitOrders();
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    const baseCanonical = Number(st.limit.liveMarketRate || st.limit.targetRate);
    if (!Number.isFinite(baseCanonical) || baseCanonical <= 0) {
      showToast(t('暂无实时参考价', 'Live reference price unavailable'));
      return;
    }
    const baseDisplay = inverted ? (1 / baseCanonical) : baseCanonical;
    const nextDisplay = baseDisplay * (1 + Number(pct || 0));
    if (!Number.isFinite(nextDisplay) || nextDisplay <= 0) return;
    let nextRate = inverted ? (1 / nextDisplay) : nextDisplay;
    let nextPt = null;
    if (st.limit.chain === 'near' && lo) {
      const poolId = sellToken && buyToken
        ? ((st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress))
        : null;
      if (poolId) {
        try {
          nextPt = lo.priceToDclPoint({
            rateOutPerIn: nextRate,
            sellToken: sellToken.contractAddress,
            buyToken: buyToken.contractAddress,
            poolId,
            poolInfo: st.limit.poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
          nextRate = lo.dclPointToPrice({
            point: nextPt,
            sellToken: sellToken.contractAddress,
            poolId,
            poolInfo: st.limit.poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
        } catch (_) {}
      }
    }
    st.limit.snappedPoint = nextPt;
    st.limit.targetRate = Number(nextRate.toPrecision(6)).toString();
    if ($('limit-target-rate')) {
      $('limit-target-rate').value = toLimitDisplayPrice(nextRate, inverted);
    }
    renderLimitOrderCalculations();
  }

  function applyLimitRateOffsetByIndex(idx) {
    const mags = [0, 0.02, 0.05, 0.10];
    const mag = mags[Number(idx)] ?? 0;
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    return applyLimitRateOffset(inverted && mag > 0 ? -mag : mag);
  }

  function stepLimitDclPoint(dir) {
    const st = getState();
    const lo = getLimitOrders();
    if (!lo || st.limit.chain !== 'near') return;
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    if (!sellToken || !buyToken) return;
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    const poolId = (st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
    if (!poolId) return;
    const delta = (st.limit.poolInfo && st.limit.poolInfo.pointDelta) || 40;
    const tokenX = (st.limit.poolInfo && st.limit.poolInfo.tokenX) || poolId.split('|')[0];
    const sellIsX = lo.normalizeNearContract(sellToken.contractAddress) === tokenX;
    let curPt = st.limit.snappedPoint;
    if (curPt === null || curPt === undefined) {
      const ref = Number(st.limit.targetRate || st.limit.liveMarketRate);
      if (!Number.isFinite(ref) || ref <= 0) return;
      curPt = lo.priceToDclPoint({
        rateOutPerIn: ref,
        sellToken: sellToken.contractAddress,
        buyToken: buyToken.contractAddress,
        poolId,
        poolInfo: st.limit.poolInfo,
        sellDecimals: sellToken.decimals,
        buyDecimals: buyToken.decimals
      });
    }
    const visualDir = inverted ? -Number(dir) : Number(dir);
    const stepDelta = (visualDir >= 0 ? 1 : -1) * (sellIsX ? delta : -delta);
    const nextPt = curPt + stepDelta;
    const nextRate = lo.dclPointToPrice({
      point: nextPt,
      sellToken: sellToken.contractAddress,
      poolId,
      poolInfo: st.limit.poolInfo,
      sellDecimals: sellToken.decimals,
      buyDecimals: buyToken.decimals
    });
    st.limit.snappedPoint = nextPt;
    st.limit.targetRate = Number(nextRate.toPrecision(6)).toString();
    if ($('limit-target-rate')) {
      $('limit-target-rate').value = toLimitDisplayPrice(nextRate, inverted);
    }
    renderLimitOrderCalculations();
  }

  function toggleLimitSplitTicks(checked) {
    getState().limit.splitTwoTicks = Boolean(checked);
    renderLimitOrderCalculations();
  }

  function setLimitExpiryDays(days) {
    const st = getState();
    st.limit.expiryDays = Number(days) || 7;
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#limit-expiry-pills [data-exp-days]').forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-exp-days')) === st.limit.expiryDays);
      });
    }
  }

  function setLimitOrdersTab(tab) {
    const st = getState();
    st.limit.ordersTab = tab === 'history' ? 'history' : 'active';
    const actBtn = $('limit-tab-active');
    const histBtn = $('limit-tab-history');
    if (actBtn) actBtn.classList.toggle('active', st.limit.ordersTab === 'active');
    if (histBtn) histBtn.classList.toggle('active', st.limit.ordersTab === 'history');
    renderLimitOrdersList();
  }

  function evaluateLimitOrderState() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    const chain = st.limit.chain || 'near';
    const { sellToken, buyToken } = resolveLimitSelectedTokens();

    if (st.limit.submitting) {
      return { disabled: true, action: 'submit', text: t('提交中...', 'Submitting...'), error: '' };
    }
    if (!wallet || !sellToken || !buyToken) {
      return { disabled: true, action: 'submit', text: t('请选择挂单币对', 'Select limit pair'), error: '' };
    }

    const amt = Number(st.limit.amountIn);
    const rate = Number(st.limit.targetRate);
    const sellBal = Number(getLimitTokenBalance(wallet, sellToken) || 0);
    const sellPrice = (typeof sellToken.price === 'number' && sellToken.price > 0) ? sellToken.price : getSymbolPrice(sellToken.symbol === 'wNEAR' ? 'NEAR' : sellToken.symbol);
    const sellUsd = (Number.isFinite(amt) && amt > 0 && sellPrice) ? amt * sellPrice : null;

    if (chain === 'near' && lo) {
      const poolId = lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
      if (!poolId) {
        return { disabled: true, action: 'submit', text: t('该币对暂无 DCL 池', 'No DCL pool for pair'), error: '' };
      }
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(rate) || rate <= 0) {
        return { disabled: true, action: 'submit', text: t('请输入数量与目标价', 'Enter amount & target price'), error: '' };
      }
      if (sellBal < amt) {
        return { disabled: true, action: 'submit', text: t(`${sellToken.symbol} 余额不足`, `Insufficient ${sellToken.symbol}`), error: '' };
      }
      const nearAvail = Number(contracts?.resolveWalletChainBalance(wallet, 'near') || 0);
      const minNear = st.limit.dclStorageRegistered === false ? (lo.DCL_STORAGE_DEPOSIT_NEAR + lo.DCL_GAS_RESERVE_NEAR) : lo.DCL_GAS_RESERVE_NEAR;
      if (nearAvail < minNear) {
        return { disabled: true, action: 'submit', text: t(`NEAR 余额不足 (需 ${minNear.toFixed(2)} NEAR)`, `Need ${minNear.toFixed(2)} NEAR`), error: '' };
      }
      return { disabled: false, action: 'submit', text: t('提交限价单', 'Place Limit Order'), error: '' };
    }

    if (chain === 'sol' && lo) {
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(rate) || rate <= 0) {
        return { disabled: true, action: 'submit', text: t('请输入数量与目标价', 'Enter amount & target price'), error: '' };
      }
      if (sellUsd !== null && sellUsd < lo.SOL_LIMIT_MIN_USD) {
        return { disabled: true, action: 'submit', text: t(`低于最低限额 ($${lo.SOL_LIMIT_MIN_USD})`, `Below $${lo.SOL_LIMIT_MIN_USD} min`), error: '' };
      }
      const isNativeSol = sellToken.contractAddress === lo.SOL_NATIVE_MINT;
      const solAvail = Number(contracts?.resolveWalletChainBalance(wallet, 'sol') || 0);
      if (isNativeSol) {
        if (solAvail < amt + lo.SOL_LIMIT_GAS_RESERVE) {
          return { disabled: true, action: 'submit', text: t('SOL 余额不足 (含可退租金)', 'Insufficient SOL (+ rent)'), error: '' };
        }
      } else {
        if (sellBal < amt) {
          return { disabled: true, action: 'submit', text: t(`${sellToken.symbol} 余额不足`, `Insufficient ${sellToken.symbol}`), error: '' };
        }
        if (solAvail < lo.SOL_LIMIT_GAS_RESERVE) {
          return { disabled: true, action: 'submit', text: t(`SOL 租金不足 (需 ${lo.SOL_LIMIT_GAS_RESERVE} SOL)`, `Need ${lo.SOL_LIMIT_GAS_RESERVE} SOL`), error: '' };
        }
      }
      return { disabled: false, action: 'submit', text: t('提交限价单', 'Place Limit Order'), error: '' };
    }

    if (lo && lo.isEvmChainLimitSupported(chain)) {
      const cfg = lo.COW_CHAINS[chain];
      if (lo.isEvmNativeSentinel(sellToken.contractAddress)) {
        return { disabled: true, action: 'submit', text: t(`请先封装为 ${cfg.wrappedSymbol}`, `Wrap to ${cfg.wrappedSymbol} first`), error: '' };
      }
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(rate) || rate <= 0) {
        return { disabled: true, action: 'submit', text: t('请输入数量与目标价', 'Enter amount & target price'), error: '' };
      }
      if (sellUsd !== null && sellUsd < cfg.minUsd) {
        return { disabled: true, action: 'submit', text: t(`低于最低限额 ($${cfg.minUsd})`, `Below $${cfg.minUsd} min`), error: '' };
      }
      if (sellBal < amt) {
        return { disabled: true, action: 'submit', text: t(`${sellToken.symbol} 余额不足`, `Insufficient ${sellToken.symbol}`), error: '' };
      }
      if (st.limit.evmAllowanceRaw !== null && st.limit.evmAllowanceRaw !== undefined) {
        try {
          const sellBase = BigInt(contracts.toBaseUnits(String(amt), sellToken.decimals));
          if (BigInt(st.limit.evmAllowanceRaw) < sellBase) {
            return { disabled: false, action: 'approve', text: t(`授权 ${sellToken.symbol}`, `Approve ${sellToken.symbol}`), error: '' };
          }
        } catch (_) {}
      }
      return { disabled: false, action: 'submit', text: t('提交限价单', 'Place Limit Order'), error: '' };
    }

    return { disabled: true, action: 'submit', text: t('当前链不支持限价单', 'Unsupported chain'), error: '' };
  }

  function renderLimitOrderCalculations() {
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    const chain = st.limit.chain || 'near';
    const { sellToken, buyToken } = resolveLimitSelectedTokens();

    const amt = Number(st.limit.amountIn);
    let rate = Number(st.limit.targetRate);
    let snappedPt = st.limit.snappedPoint;

    let splitHtml = '';
    if (chain === 'near' && lo && sellToken && buyToken && Number.isFinite(rate) && rate > 0) {
      const poolId = (st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
      if (poolId) {
        try {
          if (snappedPt === null || snappedPt === undefined) {
            snappedPt = lo.priceToDclPoint({
              rateOutPerIn: rate,
              sellToken: sellToken.contractAddress,
              buyToken: buyToken.contractAddress,
              poolId,
              poolInfo: st.limit.poolInfo,
              sellDecimals: sellToken.decimals,
              buyDecimals: buyToken.decimals
            });
            st.limit.snappedPoint = snappedPt;
          }
          const exactRate = lo.dclPointToPrice({
            point: snappedPt,
            sellToken: sellToken.contractAddress,
            poolId,
            poolInfo: st.limit.poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
          if ($('limit-snapped-tick-label')) {
            const { inverted, baseSymbol, quoteSymbol } = resolveLimitPriceOrientation(sellToken, buyToken);
            const dispExact = (inverted && exactRate > 0) ? (1 / exactRate) : exactRate;
            $('limit-snapped-tick-label').textContent = `1 ${baseSymbol} = ${formatBal(dispExact, 4)} ${quoteSymbol}`;
          }
          if (st.limit.splitTwoTicks && typeof lo.resolveSplitTwoTickPoints === 'function') {
            const pts = lo.resolveSplitTwoTickPoints({
              rateOutPerIn: rate,
              sellToken: sellToken.contractAddress,
              buyToken: buyToken.contractAddress,
              poolId,
              poolInfo: st.limit.poolInfo,
              sellDecimals: sellToken.decimals,
              buyDecimals: buyToken.decimals
            });
            const r0 = lo.dclPointToPrice({ point: pts[0], sellToken: sellToken.contractAddress, poolId, poolInfo: st.limit.poolInfo, sellDecimals: sellToken.decimals, buyDecimals: buyToken.decimals });
            const r1 = lo.dclPointToPrice({ point: pts[1], sellToken: sellToken.contractAddress, poolId, poolInfo: st.limit.poolInfo, sellDecimals: sellToken.decimals, buyDecimals: buyToken.decimals });
            rate = (r0 + r1) / 2;
            const legText = Number.isFinite(amt) && amt > 0
              ? `${formatBal(amt / 2, 4)} ${sellToken.symbol} @ ${formatBal(r0, 4)}  +  ${formatBal(amt / 2, 4)} ${sellToken.symbol} @ ${formatBal(r1, 4)}`
              : `50% @ ${formatBal(r0, 4)}  +  50% @ ${formatBal(r1, 4)}`;
            splitHtml = escapeHtml(`${t('将拆分为', 'Splits into')}: ${legText} ${buyToken.symbol}`);
          } else {
            rate = exactRate;
          }
        } catch (_) {
          if ($('limit-snapped-tick-label')) $('limit-snapped-tick-label').textContent = '--';
        }
      }
    } else if ($('limit-snapped-tick-label')) {
      $('limit-snapped-tick-label').textContent = '--';
    }
    const splitPreviewEl = $('limit-split-preview');
    if (splitPreviewEl) {
      splitPreviewEl.classList.toggle('hidden', !splitHtml);
      splitPreviewEl.innerHTML = splitHtml;
    }

    const estOut = (Number.isFinite(amt) && amt > 0 && Number.isFinite(rate) && rate > 0) ? (amt * rate) : null;
    if ($('limit-amount-out')) {
      $('limit-amount-out').value = estOut !== null ? formatBal(estOut, 6) : '';
    }
    if ($('limit-meta-est-out')) {
      $('limit-meta-est-out').textContent = estOut !== null && buyToken ? `${formatBal(estOut, 6)} ${buyToken.symbol}` : '--';
    }

    const sellPrice = sellToken ? ((typeof sellToken.price === 'number' && sellToken.price > 0) ? sellToken.price : getSymbolPrice(sellToken.symbol === 'wNEAR' ? 'NEAR' : sellToken.symbol)) : null;
    const buyPrice = buyToken ? ((typeof buyToken.price === 'number' && buyToken.price > 0) ? buyToken.price : getSymbolPrice(buyToken.symbol === 'wNEAR' ? 'NEAR' : buyToken.symbol)) : null;
    if ($('limit-usd-in')) $('limit-usd-in').textContent = (Number.isFinite(amt) && amt > 0 && sellPrice) ? formatUsd(amt * sellPrice) : '--';
    if ($('limit-usd-out')) $('limit-usd-out').textContent = (estOut !== null && buyPrice) ? formatUsd(estOut * buyPrice) : '--';

    if ($('limit-meta-gas')) {
      if (chain === 'near') $('limit-meta-gas').textContent = '~0.005 NEAR';
      else if (chain === 'sol') $('limit-meta-gas').textContent = '~0.0001 SOL';
      else $('limit-meta-gas').textContent = t('0 Gas (离线签名)', '0 Gas (Off-chain)');
    }
    if ($('limit-meta-deposit')) {
      if (chain === 'near') {
        if (st.limit.dclStorageRegistered === true) $('limit-meta-deposit').textContent = '0 NEAR';
        else if (st.limit.dclStorageRegistered === false) $('limit-meta-deposit').textContent = t('0.5 NEAR (首次可退)', '0.5 NEAR (Refundable)');
        else $('limit-meta-deposit').textContent = t('首次 0.5 NEAR / 已注册 0', '0.5 NEAR once / 0');
      } else if (chain === 'sol') {
        $('limit-meta-deposit').textContent = t('~0.0025 SOL (退回)', '~0.0025 SOL (Refundable)');
      } else {
        $('limit-meta-deposit').textContent = '0';
      }
    }
    if ($('limit-meta-min')) {
      if (chain === 'near') $('limit-meta-min').textContent = t('无限制', 'None');
      else if (chain === 'sol') $('limit-meta-min').textContent = `$${lo ? lo.SOL_LIMIT_MIN_USD : 5}`;
      else {
        const cfg = lo && lo.COW_CHAINS ? lo.COW_CHAINS[chain] : null;
        $('limit-meta-min').textContent = cfg ? `$${cfg.minUsd}` : '--';
      }
    }

    const btnState = evaluateLimitOrderState();
    const btn = $('btn-execute-limit');
    if (btn) {
      btn.disabled = Boolean(btnState.disabled);
      btn.textContent = btnState.text;
    }
    const errBanner = $('limit-error-banner');
    if (errBanner) {
      errBanner.classList.toggle('hidden', !st.limit.errorMsg);
      errBanner.textContent = st.limit.errorMsg || '';
    }

    const { inverted, baseSymbol, quoteSymbol } = resolveLimitPriceOrientation(sellToken, buyToken);
    if ($('limit-market-rate')) {
      const mktCanonical = Number(st.limit.liveMarketRate);
      if (Number.isFinite(mktCanonical) && mktCanonical > 0 && sellToken && buyToken) {
        const dispMkt = inverted ? (1 / mktCanonical) : mktCanonical;
        $('limit-market-rate').textContent = `1 ${baseSymbol} = ${formatBal(dispMkt, 5)} ${quoteSymbol}`;
      } else {
        $('limit-market-rate').textContent = '--';
      }
    }
    const usdHintEl = $('limit-target-usd-hint');
    if (usdHintEl) {
      const dispRate = (inverted && Number(st.limit.targetRate) > 0) ? (1 / Number(st.limit.targetRate)) : Number(st.limit.targetRate);
      const quoteUnitUsd = inverted ? sellPrice : buyPrice;
      if (sellToken && buyToken && Number.isFinite(dispRate) && dispRate > 0 && quoteUnitUsd && quoteUnitUsd > 0) {
        const equivUsd = formatTokenPrice(dispRate * quoteUnitUsd);
        usdHintEl.textContent = equivUsd !== '--' ? `1 ${baseSymbol} ≈ ${equivUsd}` : '';
      } else {
        usdHintEl.textContent = '';
      }
    }
    if ($('btn-limit-wrap')) {
      let showWrap = false;
      if (wallet && sellToken) {
        if (chain === 'near' && sellToken.contractAddress === 'wrap.near' && Number(wallet.nativeBalances?.near || 0) > 0.1) {
          showWrap = true;
        } else if (lo && lo.COW_CHAINS && lo.COW_CHAINS[chain]) {
          const cfg = lo.COW_CHAINS[chain];
          if (String(sellToken.contractAddress || '').toLowerCase() === cfg.wrappedNative.toLowerCase() && Number(wallet.nativeBalances?.[chain] || 0) > cfg.gasReserve) {
            showWrap = true;
          }
        }
      }
      $('btn-limit-wrap').classList.toggle('hidden', !showWrap);
    }
  }

  function renderLimitOrderView() {
    const st = getState();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const chain = st.limit.chain || 'near';

    if (typeof document !== 'undefined') {
      document.querySelectorAll('#limit-chain-pills [data-limit-chain]').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-limit-chain') === chain);
      });
    }

    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const renderTokBtn = (id, tok) => {
      const btn = $(id);
      if (!btn || !tok) return;
      btn.innerHTML = `${tokens.renderTokenIconWithBadge(tok, 24, true)}<span>${escapeHtml(tok.symbol)}</span><span style="opacity:0.55;font-size:10px;">▾</span>`;
    };
    renderTokBtn('limit-sell-token-btn', sellToken);
    renderTokBtn('limit-buy-token-btn', buyToken);

    const sellBal = sellToken ? getLimitTokenBalance(wallet, sellToken) : null;
    const buyBal = buyToken ? getLimitTokenBalance(wallet, buyToken) : null;
    if ($('limit-sell-balance')) $('limit-sell-balance').textContent = sellToken ? `${formatBal(sellBal, 6)} ${sellToken.symbol}` : '--';
    if ($('limit-buy-balance')) $('limit-buy-balance').textContent = buyToken ? `${formatBal(buyBal, 6)} ${buyToken.symbol}` : '--';
    const fmtLimitNet = (tok) => {
      if (!tok) return '--';
      const net = tok.networkName || chain.toUpperCase();
      const px = getTokenUnitPrice(tok);
      const pxStr = formatTokenPrice(px);
      return pxStr !== '--' ? `${net} · ${pxStr}` : net;
    };
    if ($('limit-sell-net-label')) $('limit-sell-net-label').textContent = fmtLimitNet(sellToken);
    if ($('limit-buy-net-label')) $('limit-buy-net-label').textContent = fmtLimitNet(buyToken);
    const { inverted, baseSymbol, quoteSymbol } = resolveLimitPriceOrientation(sellToken, buyToken);
    if ($('limit-rate-prefix')) $('limit-rate-prefix').textContent = sellToken && buyToken ? `1 ${baseSymbol} =` : '1 -- =';
    if ($('limit-rate-suffix')) $('limit-rate-suffix').textContent = sellToken && buyToken ? quoteSymbol : '--';

    if (typeof document !== 'undefined') {
      const signLabels = inverted ? ['-2%', '-5%', '-10%'] : ['+2%', '+5%', '+10%'];
      document.querySelectorAll('#limit-offset-pills [data-offset-idx]').forEach((b) => {
        const idx = Number(b.getAttribute('data-offset-idx'));
        if (idx >= 1 && idx <= 3) b.textContent = signLabels[idx - 1];
      });
    }

    if ($('limit-amount-in') && $('limit-amount-in').value !== String(st.limit.amountIn || '')) {
      $('limit-amount-in').value = st.limit.amountIn || '';
    }
    const rateInputEl = $('limit-target-rate');
    if (rateInputEl && (typeof document === 'undefined' || document.activeElement !== rateInputEl)) {
      const dispTarget = toLimitDisplayPrice(st.limit.targetRate, inverted);
      if (rateInputEl.value !== dispTarget) rateInputEl.value = dispTarget;
    }

    const isNear = chain === 'near';
    if ($('limit-near-tick-controls')) $('limit-near-tick-controls').classList.toggle('hidden', !isNear);
    if ($('limit-split-row')) $('limit-split-row').classList.toggle('hidden', !isNear);
    if ($('limit-split-toggle')) $('limit-split-toggle').checked = Boolean(st.limit.splitTwoTicks);
    if ($('limit-expiry-row')) $('limit-expiry-row').classList.toggle('hidden', isNear);
    setLimitExpiryDays(st.limit.expiryDays || 7);

    renderLimitOrderCalculations();
    renderLimitOrdersList();
  }

  async function refreshLimitMarketContextAsync() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!lo || !contracts || !wallet) return;

    const chain = st.limit.chain || 'near';
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    if (!sellToken || !buyToken) return;

    let liveRate = null;
    if (chain === 'near') {
      const sender = wallet.nearNamedAccount || wallet.nearAddress;
      const poolId = lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
      const oneUnit = contracts.toBaseUnits('1', sellToken.decimals);
      const [poolInfo, storageState, refQuote] = await Promise.all([
        poolId ? lo.fetchNearDclPoolInfo(poolId).catch(() => null) : Promise.resolve(null),
        sender ? lo.checkNearDclStorage(sender).catch(() => null) : Promise.resolve(null),
        contracts.quoteNearRefFinanceSwap({
          tokenIn: sellToken.contractAddress,
          tokenOut: buyToken.contractAddress,
          amountRaw: oneUnit,
          slippageBps: 100
        }).catch(() => null)
      ]);
      if (poolInfo) st.limit.poolInfo = poolInfo;
      if (storageState) st.limit.dclStorageRegistered = Boolean(storageState.registered);
      if (refQuote && refQuote.ok && refQuote.amountOut) {
        const outNum = Number(contracts.fromBaseUnits(refQuote.amountOut, buyToken.decimals));
        if (Number.isFinite(outNum) && outNum > 0) liveRate = outNum;
      }
      if (liveRate === null && poolInfo) {
        try {
          liveRate = lo.dclPointToPrice({
            point: poolInfo.currentPoint,
            sellToken: sellToken.contractAddress,
            poolId,
            poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
        } catch (_) {}
      }
    } else if (chain === 'sol') {
      const oneUnit = contracts.toBaseUnits('1', sellToken.decimals);
      const q = await contracts.quoteSolanaJupiterSwap({
        inputMint: sellToken.contractAddress,
        outputMint: buyToken.contractAddress,
        amountRaw: oneUnit,
        slippageBps: 100
      }).catch(() => null);
      if (q && q.ok && q.outAmount) {
        const outNum = Number(contracts.fromBaseUnits(q.outAmount, buyToken.decimals));
        if (Number.isFinite(outNum) && outNum > 0) liveRate = outNum;
      }
    } else if (lo.isEvmChainLimitSupported(chain)) {
      const owner = wallet.evmAddress || wallet.mpcEvmAddress;
      const oneUnit = contracts.toBaseUnits('1', sellToken.decimals);
      const [allowance, q] = await Promise.all([
        owner ? lo.checkEvmCowAllowance({ chainKey: chain, owner, tokenAddress: sellToken.contractAddress }).catch(() => null) : Promise.resolve(null),
        contracts.quoteEvmDexSwap({
          chainKey: chain,
          tokenIn: sellToken.contractAddress,
          tokenOut: buyToken.contractAddress,
          amountRaw: oneUnit,
          userAddress: owner
        }).catch(() => null)
      ]);
      if (allowance !== null) st.limit.evmAllowanceRaw = allowance.toString();
      if (q && q.ok && q.amountOut) {
        const outNum = Number(contracts.fromBaseUnits(q.amountOut, buyToken.decimals));
        if (Number.isFinite(outNum) && outNum > 0) liveRate = outNum;
      }
    }

    if (liveRate === null) {
      const sp = (typeof sellToken.price === 'number' && sellToken.price > 0) ? sellToken.price : getSymbolPrice(sellToken.symbol === 'wNEAR' ? 'NEAR' : sellToken.symbol);
      const bp = (typeof buyToken.price === 'number' && buyToken.price > 0) ? buyToken.price : getSymbolPrice(buyToken.symbol === 'wNEAR' ? 'NEAR' : buyToken.symbol);
      if (sp && bp && bp > 0) liveRate = sp / bp;
    }

    if (liveRate !== null && Number.isFinite(liveRate) && liveRate > 0) {
      st.limit.liveMarketRate = liveRate;
      if (!st.limit.targetRate) {
        st.limit.targetRate = Number(liveRate.toPrecision(6)).toString();
        st.limit.snappedPoint = null;
        const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
        if ($('limit-target-rate')) $('limit-target-rate').value = toLimitDisplayPrice(st.limit.targetRate, inverted);
      }
    }
    renderLimitOrderCalculations();
  }

  async function refreshLimitOrdersAsync(showFeedback = false) {
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    if (!lo || !wallet) return;
    st.limit.ordersLoading = true;
    st.limit.rateLimited = false;
    try {
      const chain = st.limit.chain || 'near';
      if (chain === 'near') {
        const sender = wallet.nearNamedAccount || wallet.nearAddress;
        const res = await lo.fetchNearDclOrders(sender);
        st.limit.ordersActive = res.active;
        st.limit.ordersHistory = res.history;
      } else if (chain === 'sol') {
        const res = await lo.fetchSolanaLimitOrders(wallet.solAddress);
        st.limit.ordersActive = res.active;
        st.limit.ordersHistory = res.history;
      } else if (lo.isEvmChainLimitSupported(chain)) {
        const owner = wallet.evmAddress || wallet.mpcEvmAddress;
        const res = await lo.fetchEvmCowOrders(chain, owner);
        st.limit.ordersActive = res.active;
        st.limit.ordersHistory = res.history;
        st.limit.rateLimited = Boolean(res.rateLimited);
      }
      renderLimitOrdersList();
      if (showFeedback) {
        showToast(st.limit.rateLimited ? t('CoW 订单簿限流，请稍后刷新', 'CoW rate limited; retry shortly') : t('已刷新挂单列表', 'Orders refreshed'));
      }
    } catch (_) {
      if (showFeedback) showToast(t('获取挂单失败', 'Failed to load orders'));
    } finally {
      st.limit.ordersLoading = false;
    }
  }

  function renderLimitOrdersList() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const listEl = $('limit-orders-list');
    if (!listEl || !lo || !contracts) return;

    const chain = st.limit.chain || 'near';
    const isHistory = st.limit.ordersTab === 'history';
    const items = isHistory ? (st.limit.ordersHistory || []) : (st.limit.ordersActive || []);
    const tokenList = getLimitTokenListForChain(chain);
    const findMeta = (addr) => {
      const low = String(addr || '').toLowerCase();
      return tokenList.find((tk) => String(tk.contractAddress || '').toLowerCase() === low) || { symbol: (addr || '').slice(0, 6), decimals: 18 };
    };

    if (st.limit.rateLimited && items.length === 0) {
      listEl.innerHTML = `<div class="text-center" style="padding: 14px; font-size: 12px; color: var(--text-secondary);">${t('CoW API 请求频繁，请稍后刷新', 'CoW API rate limited; refresh shortly')}</div>`;
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = `<div class="text-center" style="padding: 14px; font-size: 12px; color: var(--text-secondary);">${isHistory ? t('暂无历史挂单', 'No order history') : t('暂无进行中的限价单', 'No active limit orders')}</div>`;
      return;
    }

    if (chain === 'near') {
      listEl.innerHTML = items.slice(0, 20).map((o) => {
        const sellMeta = findMeta(o.sell_token);
        const buyMeta = findMeta(o.buy_token);
        const orig = Number(contracts.fromBaseUnits(o.original_amount || o.original_deposit_amount || '0', sellMeta.decimals));
        const rem = Number(contracts.fromBaseUnits(o.remain_amount || '0', sellMeta.decimals));
        const unclaimed = Number(contracts.fromBaseUnits(o.unclaimed_amount || '0', buyMeta.decimals));
        const bought = Number(contracts.fromBaseUnits(o.bought_amount || '0', buyMeta.decimals));
        const pct = orig > 0 ? Math.min(100, Math.max(0, ((orig - rem) / orig) * 100)) : 0;
        let priceTxt = '--';
        try {
          const px = lo.dclPointToPrice({ point: o.point, sellToken: o.sell_token, poolId: o.pool_id, sellDecimals: sellMeta.decimals, buyDecimals: buyMeta.decimals });
          priceTxt = `1 ${sellMeta.symbol} = ${formatBal(px, 4)} ${buyMeta.symbol}`;
        } catch (_) {}
        return `
          <div class="limit-order-card-item">
            <div class="flex items-center justify-between gap-2">
              <span style="font-weight:700;font-size:13px;">${escapeHtml(sellMeta.symbol)} ➔ ${escapeHtml(buyMeta.symbol)}</span>
              <span class="badge badge-emerald mono">${escapeHtml(priceTxt)}</span>
            </div>
            <div class="limit-progress-track"><div class="limit-progress-fill" style="width:${pct.toFixed(1)}%;"></div></div>
            <div class="flex items-center justify-between" style="font-size:11.5px;color:var(--text-secondary);">
              <span>${t('进度', 'Filled')}: ${pct.toFixed(1)}% (${formatBal(orig - rem, 4)} / ${formatBal(orig, 4)})</span>
              <span>${t('已得', 'Got')}: ${formatBal(unclaimed > 0 ? unclaimed : bought, 4)} ${escapeHtml(buyMeta.symbol)}</span>
            </div>
            ${!isHistory ? `
              <div class="flex gap-2" style="margin-top:2px;">
                ${unclaimed > 0 ? `<button type="button" class="mini-action-btn primary" data-action="claim-limit-order" data-order-id="${escapeHtml(o.order_id)}" data-buy-token="${escapeHtml(o.buy_token)}">${t('领取', 'Claim')} ${formatBal(unclaimed, 4)}</button>` : ''}
                ${BigInt(String(o.remain_amount || '0')) > 0n ? `<button type="button" class="mini-action-btn" data-action="cancel-limit-order" data-chain="near" data-order-id="${escapeHtml(o.order_id)}" data-remain="${escapeHtml(o.remain_amount || '0')}" data-sell-token="${escapeHtml(o.sell_token)}" data-buy-token="${escapeHtml(o.buy_token)}">${t('撤单', 'Cancel')}</button>` : ''}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
      return;
    }

    if (chain === 'sol') {
      listEl.innerHTML = items.slice(0, 20).map((o) => {
        const sellMeta = findMeta(o.inputMint);
        const buyMeta = findMeta(o.outputMint);
        const make = Number(contracts.fromBaseUnits(o.makingAmount || '0', sellMeta.decimals));
        const rem = Number(contracts.fromBaseUnits(o.remainingMakingAmount || '0', sellMeta.decimals));
        const take = Number(contracts.fromBaseUnits(o.takingAmount || '0', buyMeta.decimals));
        const pct = make > 0 ? Math.min(100, Math.max(0, ((make - rem) / make) * 100)) : 0;
        const rateTxt = make > 0 && take > 0 ? `1 ${sellMeta.symbol} = ${formatBal(take / make, 4)} ${buyMeta.symbol}` : '--';
        const orderKey = o.orderKey || o.order || o.publicKey || '';
        return `
          <div class="limit-order-card-item">
            <div class="flex items-center justify-between gap-2">
              <span style="font-weight:700;font-size:13px;">${escapeHtml(sellMeta.symbol)} ➔ ${escapeHtml(buyMeta.symbol)}</span>
              <span class="badge badge-cyan mono">${escapeHtml(rateTxt)}</span>
            </div>
            <div class="limit-progress-track"><div class="limit-progress-fill" style="width:${pct.toFixed(1)}%;"></div></div>
            <div class="flex items-center justify-between" style="font-size:11.5px;color:var(--text-secondary);">
              <span>${formatBal(make, 4)} ${escapeHtml(sellMeta.symbol)} ➔ ${formatBal(take, 4)} ${escapeHtml(buyMeta.symbol)}</span>
              <span>${escapeHtml(String(o.status || (isHistory ? 'Done' : 'Open')))}</span>
            </div>
            ${!isHistory && orderKey ? `
              <div class="flex gap-2" style="margin-top:2px;">
                <button type="button" class="mini-action-btn" data-action="cancel-limit-order" data-chain="sol" data-order-id="${escapeHtml(orderKey)}">${t('撤单并退租金', 'Cancel & Reclaim SOL')}</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
      return;
    }

    listEl.innerHTML = items.slice(0, 20).map((o) => {
      const sellMeta = findMeta(o.sellToken);
      const buyMeta = findMeta(o.buyToken);
      const sellAmt = Number(contracts.fromBaseUnits(o.sellAmount || '0', sellMeta.decimals));
      const execSell = Number(contracts.fromBaseUnits(o.executedSellAmount || '0', sellMeta.decimals));
      const buyAmt = Number(contracts.fromBaseUnits(o.buyAmount || '0', buyMeta.decimals));
      const pct = sellAmt > 0 ? Math.min(100, Math.max(0, (execSell / sellAmt) * 100)) : 0;
      const rateTxt = sellAmt > 0 && buyAmt > 0 ? `1 ${sellMeta.symbol} = ${formatBal(buyAmt / sellAmt, 4)} ${buyMeta.symbol}` : '--';
      return `
        <div class="limit-order-card-item">
          <div class="flex items-center justify-between gap-2">
            <span style="font-weight:700;font-size:13px;">${escapeHtml(sellMeta.symbol)} ➔ ${escapeHtml(buyMeta.symbol)}</span>
            <span class="badge badge-emerald mono">${escapeHtml(rateTxt)}</span>
          </div>
          <div class="limit-progress-track"><div class="limit-progress-fill" style="width:${pct.toFixed(1)}%;"></div></div>
          <div class="flex items-center justify-between" style="font-size:11.5px;color:var(--text-secondary);">
            <span>${formatBal(sellAmt, 4)} ${escapeHtml(sellMeta.symbol)} ➔ ${formatBal(buyAmt, 4)} ${escapeHtml(buyMeta.symbol)}</span>
            <span>${escapeHtml(String(o.status || '--'))}</span>
          </div>
          ${!isHistory ? `
            <div class="flex gap-2" style="margin-top:2px;">
              <button type="button" class="mini-action-btn" data-action="cancel-limit-order" data-chain="${escapeHtml(chain)}" data-order-id="${escapeHtml(o.uid)}">${t('免费撤单', 'Cancel (0 Gas)')}</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  async function wrapNativeForLimitUI() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !contracts) return;
    const chain = st.limit.chain || 'near';
    const { sellToken } = resolveLimitSelectedTokens();
    if (!sellToken) return;

    const currentSellBal = Number(getLimitTokenBalance(wallet, sellToken) || 0);
    const entered = Number(st.limit.amountIn);
    const targetAmt = (Number.isFinite(entered) && entered > 0)
      ? Math.max(0.01, entered > currentSellBal ? (entered - currentSellBal) : entered)
      : (chain === 'near' ? 1 : 0.01);

    const authed = await verifySecurityAuthAsync(wallet, t(`封装 ${targetAmt} 原生代币`, `Wrap ${targetAmt} native coin`));
    if (!authed) return;

    st.limit.submitting = true;
    renderLimitOrderCalculations();
    try {
      const amountRaw = contracts.toBaseUnits(String(targetAmt), sellToken.decimals);
      if (chain === 'near') {
        await lo.wrapNearForLimit({ wallet, amountRaw });
      } else {
        await lo.wrapEvmNativeForLimit({ wallet, chainKey: chain, amountRaw });
      }
      showToast(t('封装成功，正在同步余额', 'Wrapped successfully'));
      await refreshAllBalancesAsync(true);
      await refreshLimitMarketContextAsync();
      renderLimitOrderView();
    } catch (err) {
      st.limit.errorMsg = err && err.message ? err.message : t('封装失败', 'Wrap failed');
      showToast(st.limit.errorMsg);
    } finally {
      st.limit.submitting = false;
      renderLimitOrderCalculations();
    }
  }

  async function executeLimitOrderAction() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !contracts) return;

    const btnState = evaluateLimitOrderState();
    if (btnState.disabled) {
      showToast(btnState.text);
      return;
    }
    const chain = st.limit.chain || 'near';
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    if (!sellToken || !buyToken) return;

    const actionTitle = btnState.action === 'approve'
      ? t(`授权 ${sellToken.symbol}`, `Approve ${sellToken.symbol}`)
      : t(`提交 ${sellToken.symbol} → ${buyToken.symbol} 限价单`, `Place ${sellToken.symbol} → ${buyToken.symbol} Limit Order`);
    const authed = await verifySecurityAuthAsync(wallet, actionTitle);
    if (!authed) return;

    st.limit.submitting = true;
    st.limit.errorMsg = '';
    renderLimitOrderCalculations();
    try {
      if (btnState.action === 'approve') {
        await lo.approveEvmCowToken({ wallet, chainKey: chain, tokenAddress: sellToken.contractAddress });
        showToast(t(`${sellToken.symbol} 授权成功`, `${sellToken.symbol} approved`));
        await refreshLimitMarketContextAsync();
        return;
      }

      const sellAmtNum = Number(st.limit.amountIn);
      const rateNum = Number(st.limit.targetRate);
      const sellRaw = contracts.toBaseUnits(String(st.limit.amountIn), sellToken.decimals);
      const buyAmtFloat = sellAmtNum * rateNum;
      const buyRaw = contracts.toBaseUnits(buyAmtFloat.toFixed(Math.min(12, buyToken.decimals)), buyToken.decimals);
      const sellPrice = (typeof sellToken.price === 'number' && sellToken.price > 0) ? sellToken.price : getSymbolPrice(sellToken.symbol === 'wNEAR' ? 'NEAR' : sellToken.symbol);
      const sellUsd = sellPrice ? sellAmtNum * sellPrice : null;
      const sellBal = getLimitTokenBalance(wallet, sellToken);

      if (chain === 'near') {
        const poolId = (st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
        const point = (st.limit.snappedPoint !== null && st.limit.snappedPoint !== undefined)
          ? st.limit.snappedPoint
          : lo.priceToDclPoint({
              rateOutPerIn: rateNum,
              sellToken: sellToken.contractAddress,
              buyToken: buyToken.contractAddress,
              poolId,
              poolInfo: st.limit.poolInfo,
              sellDecimals: sellToken.decimals,
              buyDecimals: buyToken.decimals
            });
        await lo.placeNearDclLimitOrder({
          wallet,
          poolId,
          sellToken: sellToken.contractAddress,
          buyToken: buyToken.contractAddress,
          amountRaw: sellRaw,
          point,
          splitTwoTicks: Boolean(st.limit.splitTwoTicks),
          rateOutPerIn: rateNum,
          poolInfo: st.limit.poolInfo,
          sellDecimals: sellToken.decimals,
          buyDecimals: buyToken.decimals,
          sellSymbol: sellToken.symbol,
          tokenBalance: sellBal
        });
      } else if (chain === 'sol') {
        const expSec = Math.floor(Date.now() / 1000) + (Number(st.limit.expiryDays) || 7) * 86400;
        await lo.placeSolanaLimitOrder({
          wallet,
          inputMint: sellToken.contractAddress,
          outputMint: buyToken.contractAddress,
          makingAmount: sellRaw,
          takingAmount: buyRaw,
          expiredAt: expSec,
          inputUsdValue: sellUsd,
          sellBalance: sellBal,
          sellDecimals: sellToken.decimals,
          sellSymbol: sellToken.symbol
        });
      } else {
        const validTo = Math.floor(Date.now() / 1000) + (Number(st.limit.expiryDays) || 7) * 86400;
        await lo.placeEvmCowLimitOrder({
          wallet,
          chainKey: chain,
          sellToken: sellToken.contractAddress,
          buyToken: buyToken.contractAddress,
          sellAmount: sellRaw,
          buyAmount: buyRaw,
          validTo,
          sellUsdValue: sellUsd,
          sellBalance: sellBal,
          sellDecimals: sellToken.decimals,
          sellSymbol: sellToken.symbol
        });
      }

      st.limit.amountIn = '';
      if ($('limit-amount-in')) $('limit-amount-in').value = '';
      showToast(t('限价单已提交', 'Limit order placed'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitMarketContextAsync().catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      st.limit.errorMsg = err && err.message ? err.message : t('限价单提交失败', 'Limit order failed');
      showToast(st.limit.errorMsg);
    } finally {
      st.limit.submitting = false;
      renderLimitOrderCalculations();
    }
  }

  async function claimLimitOrderUI(orderId, buyToken) {
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !orderId) return;
    const authed = await verifySecurityAuthAsync(wallet, t('领取已成交限价单资产', 'Claim filled limit order'));
    if (!authed) return;
    try {
      await lo.claimNearDclOrder({ wallet, orderId, buyToken });
      showToast(t('已领取至钱包', 'Claimed to wallet'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('领取失败', 'Claim failed'));
    }
  }

  async function cancelLimitOrderUI(chain, orderId, remainAmount, sellToken, buyToken) {
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !orderId) return;
    const authed = await verifySecurityAuthAsync(wallet, t('撤销限价单', 'Cancel limit order'));
    if (!authed) return;
    try {
      if (chain === 'near') {
        await lo.cancelNearDclOrder({ wallet, orderId, remainAmount, sellToken, buyToken });
      } else if (chain === 'sol') {
        await lo.cancelSolanaLimitOrder({ wallet, orderPubkey: orderId });
      } else {
        await lo.cancelEvmCowOrder({ wallet, chainKey: chain, orderUid: orderId });
      }
      showToast(t('已撤单', 'Order cancelled'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('撤单失败', 'Cancel failed'));
    }
  }

  // ==================== Perpetual Futures (Hyperliquid) Controller ====================

  let _perpQuoteTimer = null;

  function getSelectedPerpMarket() {
    const st = getState();
    const list = Array.isArray(st.perp && st.perp.markets) ? st.perp.markets : [];
    const coin = String((st.perp && st.perp.selectedCoin) || 'BTC');
    return list.find((m) => m.name === coin) || list[0] || null;
  }

  function resolvePerpMarginBounds(market) {
    const st = getState();
    const maxLev = market ? (Number(market.maxLeverage) || 20) : 50;
    const onlyIso = Boolean(market && market.onlyIsolated);
    if (onlyIso) st.perp.marginMode = 'isolated';
    if (st.perp.leverage > maxLev) st.perp.leverage = maxLev;
    if (st.perp.leverage < 1) st.perp.leverage = 1;
    return { maxLev, onlyIso };
  }

  function formatPerpPx(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '--';
    if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
    if (n >= 100) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    return n.toPrecision(4);
  }

  function evaluatePerpOrderState(override = {}) {
    const st = getState();
    const hl = getHyperliquid();
    const market = override.market !== undefined ? override.market : getSelectedPerpMarket();
    const acct = override.account !== undefined ? override.account : st.perp.account;
    const side = override.side || st.perp.side || 'long';
    const isBuy = side === 'long';
    const orderType = override.orderType || st.perp.orderType || 'market';
    const lev = Math.max(1, Number(override.leverage ?? st.perp.leverage) || 5);
    const margin = Number(override.marginInput ?? st.perp.marginInput);
    const limitPx = Number(override.limitPriceInput ?? st.perp.limitPriceInput);
    const availMargin = acct ? Number(acct.availableMargin || 0) : null;
    const markPx = market ? Number(market.markPx || 0) : null;
    const execPx = orderType === 'limit' ? limitPx : markPx;

    let notional = null;
    let sizeNum = null;
    let sizeStr = '--';
    let estLiqPx = null;
    if (Number.isFinite(margin) && margin > 0 && execPx && Number.isFinite(execPx) && execPx > 0) {
      notional = margin * lev;
      const rawSize = notional / execPx;
      sizeStr = hl ? hl.formatHlSize(rawSize, market ? market.szDecimals : 4) : rawSize.toFixed(4);
      sizeNum = Number(sizeStr);
      if (hl) {
        estLiqPx = hl.computeEstimatedLiqPrice({ markPx: execPx, leverage: lev, isLong: isBuy });
      }
    }

    const coinLabel = market ? market.name : (st.perp.selectedCoin || 'BTC');
    const actionLabel = isBuy ? `${t('开多', 'Open Long')} ${coinLabel}` : `${t('开空', 'Open Short')} ${coinLabel}`;

    if (st.perp.submitting) {
      return { disabled: true, error: '', text: t('提交签名中...', 'Submitting...'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (!market || !markPx) {
      return { disabled: true, error: '', text: t('同步市场行情...', 'Loading market...'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (orderType === 'limit' && (!Number.isFinite(limitPx) || limitPx <= 0)) {
      return { disabled: true, error: '', text: t('请输入限价价格', 'Enter limit price'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (!Number.isFinite(margin) || margin <= 0) {
      return { disabled: true, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (availMargin !== null && margin > availMargin + 1e-6) {
      const msg = t(`可用保证金不足 (当前: $${availMargin.toFixed(2)} USDC)`, `Insufficient margin (avail: $${availMargin.toFixed(2)} USDC)`);
      return { disabled: true, error: msg, text: t('保证金不足', 'Insufficient Margin'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    const minNotional = hl ? hl.HL_MIN_ORDER_USD : 10;
    if (!notional || notional < minNotional) {
      const msg = t(`名义价值需 >= $${minNotional} USDC (当前 $${(notional || 0).toFixed(2)})`, `Notional must be >= $${minNotional} USDC (now $${(notional || 0).toFixed(2)})`);
      return { disabled: true, error: msg, text: t(`最低名义 $${minNotional}`, `Min $${minNotional} Notional`), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (!sizeNum || sizeNum <= 0) {
      return { disabled: true, error: t('数量低于最小精度', 'Size below tick step'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    return { disabled: false, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx };
  }

  function formatCompactUsd(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '--';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }

  function renderPerpCandleSvg(candles, market = null) {
    const list = Array.isArray(candles) ? candles : [];
    if (list.length < 2) {
      return `<div style="text-align:center; padding: 36px 0; font-size: 11.5px; color: var(--text-muted);">--</div>`;
    }
    const W = 340;
    const H = 168;
    const plotL = 4;
    const plotR = 276;
    const plotW = plotR - plotL;
    const candleTop = 8;
    const candleBottom = 114;
    const volTop = 126;
    const volBottom = 162;

    let minLow = Infinity;
    let maxHigh = -Infinity;
    let maxVol = 0;
    for (const c of list) {
      if (c.l < minLow) minLow = c.l;
      if (c.h > maxHigh) maxHigh = c.h;
      if (Number.isFinite(c.v) && c.v > maxVol) maxVol = c.v;
    }
    const span = maxHigh - minLow || 1;
    const step = plotW / list.length;
    const bw = Math.max(2, step * 0.58);
    const yOf = (p) => Math.max(candleTop, Math.min(candleBottom, candleBottom - ((p - minLow) / span) * (candleBottom - candleTop)));

    // Grid lines + right price axis (High, Mid, Low)
    const midPx = (maxHigh + minLow) / 2;
    const gridLevels = [
      { y: candleTop + 2, px: maxHigh },
      { y: (candleTop + candleBottom) / 2, px: midPx },
      { y: candleBottom - 2, px: minLow }
    ];
    const gridSvg = gridLevels.map((g) =>
      `<line x1="${plotL}" y1="${g.y.toFixed(1)}" x2="${plotR}" y2="${g.y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 3" stroke-width="0.8" />` +
      `<text x="280" y="${(g.y + 3).toFixed(1)}" fill="rgba(203,213,225,0.7)" font-size="9" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(g.px))}</text>`
    ).join('');

    // Candlesticks + Volume Histogram
    const candleSvg = list.map((c, idx) => {
      const xCenter = plotL + idx * step + step / 2;
      const isUp = c.c >= c.o;
      const color = isUp ? '#34d399' : '#fb7185';
      const yH = yOf(c.h);
      const yL = yOf(c.l);
      const yO = yOf(c.o);
      const yC = yOf(c.c);
      const bodyTop = Math.min(yO, yC);
      const bodyH = Math.max(1.5, Math.abs(yO - yC));
      const xLeft = xCenter - bw / 2;
      let volRect = '';
      if (maxVol > 0 && Number.isFinite(c.v) && c.v > 0) {
        const vh = Math.max(1.5, (c.v / maxVol) * (volBottom - volTop));
        volRect = `<rect x="${xLeft.toFixed(1)}" y="${(volBottom - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${vh.toFixed(1)}" fill="${color}" fill-opacity="0.45" rx="0.6" />`;
      }
      return `<line x1="${xCenter.toFixed(1)}" y1="${yH.toFixed(1)}" x2="${xCenter.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${color}" stroke-width="1" />` +
        `<rect x="${xLeft.toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${color}" rx="0.8" />` +
        volRect;
    }).join('');

    // Separator between candle and volume zones + Mark Price indicator
    let markSvg = `<line x1="${plotL}" y1="${volTop - 4}" x2="${plotR}" y2="${volTop - 4}" stroke="rgba(255,255,255,0.06)" stroke-width="0.8" />`;
    const livePx = (market && Number(market.markPx)) || list[list.length - 1].c;
    if (Number.isFinite(livePx) && livePx > 0) {
      const ym = yOf(livePx);
      const pillY = Math.max(2, Math.min(candleBottom - 10, ym - 6));
      markSvg += `<line x1="${plotL}" y1="${ym.toFixed(1)}" x2="${plotR}" y2="${ym.toFixed(1)}" stroke="#00ec97" stroke-dasharray="3 2" stroke-width="0.9" stroke-opacity="0.8" />` +
        `<rect x="278" y="${pillY.toFixed(1)}" width="58" height="13" rx="3" fill="rgba(0,236,151,0.22)" stroke="rgba(0,236,151,0.65)" stroke-width="0.7" />` +
        `<text x="282" y="${(pillY + 9.5).toFixed(1)}" fill="#00ec97" font-size="8.5" font-weight="700" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(livePx))}</text>`;
    }

    return `<svg viewBox="0 0 ${W} ${H}" class="perp-chart-svg" preserveAspectRatio="xMidYMid meet">${gridSvg}${candleSvg}${markSvg}</svg>`;
  }

  function renderPerpOrderbook() {
    const st = getState();
    const ob = st.perp.orderbook;
    const coin = (st.perp && st.perp.selectedCoin) || 'BTC';
    const bidsEl = $('perp-ob-bids');
    const asksEl = $('perp-ob-asks');
    const bidSumEl = $('perp-ob-bid-summary');
    const askSumEl = $('perp-ob-ask-summary');
    const bidBarEl = $('perp-ob-bid-bar');
    const askBarEl = $('perp-ob-ask-bar');
    const szLabel = `${t('数量', 'Size')} (${coin})`;
    if ($('perp-ob-bid-sz-hdr')) $('perp-ob-bid-sz-hdr').textContent = szLabel;
    if ($('perp-ob-ask-sz-hdr')) $('perp-ob-ask-sz-hdr').textContent = szLabel;
    if (!bidsEl || !asksEl) return;

    if (!ob || (!ob.bids.length && !ob.asks.length)) {
      bidsEl.innerHTML = `<div class="perp-ob-row"><span>--</span><span>--</span></div>`;
      asksEl.innerHTML = `<div class="perp-ob-row"><span>--</span><span>--</span></div>`;
      if (bidSumEl) bidSumEl.textContent = '--';
      if (askSumEl) askSumEl.textContent = '--';
      if (bidBarEl) bidBarEl.style.width = '50%';
      if (askBarEl) askBarEl.style.width = '50%';
      return;
    }

    const bidTot = Number(ob.bidTotalSz || 0);
    const askTot = Number(ob.askTotalSz || 0);
    const ratio = Number.isFinite(ob.bidRatioPct) ? ob.bidRatioPct : 50;
    if (bidSumEl) {
      bidSumEl.textContent = `${t('20档买盘', '20-Lvl Bids')} ${formatBal(bidTot, 2)} ${coin} (${ob.bidOrderCount || 0}${t('单', '')})`;
    }
    if (askSumEl) {
      askSumEl.textContent = `${formatBal(askTot, 2)} ${coin} (${ob.askOrderCount || 0}${t('单', '')}) ${t('20档卖盘', 'Asks')}`;
    }
    if (bidBarEl) bidBarEl.style.width = `${Math.max(5, Math.min(95, ratio)).toFixed(1)}%`;
    if (askBarEl) askBarEl.style.width = `${Math.max(5, Math.min(95, 100 - ratio)).toFixed(1)}%`;

    const bidRows = ob.bids.slice(0, 10);
    const askRows = ob.asks.slice(0, 10);
    let maxBidSz = 0;
    let maxAskSz = 0;
    for (const r of bidRows) if (r.sz > maxBidSz) maxBidSz = r.sz;
    for (const r of askRows) if (r.sz > maxAskSz) maxAskSz = r.sz;

    bidsEl.innerHTML = bidRows.map((r) => {
      const pct = maxBidSz > 0 ? Math.max(6, (r.sz / maxBidSz) * 100) : 0;
      return `<button type="button" class="perp-ob-row bid" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="width:${pct.toFixed(0)}%"></div><span>${escapeHtml(r.sz.toFixed(3))}</span><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span></button>`;
    }).join('');
    asksEl.innerHTML = askRows.map((r) => {
      const pct = maxAskSz > 0 ? Math.max(6, (r.sz / maxAskSz) * 100) : 0;
      return `<button type="button" class="perp-ob-row ask" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="width:${pct.toFixed(0)}%"></div><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span><span>${escapeHtml(r.sz.toFixed(3))}</span></button>`;
    }).join('');
  }

  function renderPerpBottomList() {
    const st = getState();
    const listEl = $('perp-bottom-list');
    if (!listEl) return;
    const tab = st.perp.bottomTab || 'positions';
    $('perp-tab-positions')?.classList.toggle('active', tab === 'positions');
    $('perp-tab-orders')?.classList.toggle('active', tab === 'orders');
    $('perp-tab-fills')?.classList.toggle('active', tab === 'fills');

    const acct = st.perp.account;
    if (!acct) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">--</div>`;
      return;
    }

    if (tab === 'positions') {
      if (!acct.positions || acct.positions.length === 0) {
        listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">${escapeHtml(t('暂无持仓', 'No open positions'))}</div>`;
        return;
      }
      listEl.innerHTML = acct.positions.map((p) => {
        const upnl = Number(p.unrealizedPnl || 0);
        const upnlCls = upnl >= 0 ? 'text-emerald' : 'text-rose';
        const dirText = p.isLong ? t('多', 'Long') : t('空', 'Short');
        const roeStr = p.returnOnEquity !== null ? ` (${(p.returnOnEquity * 100).toFixed(1)}%)` : '';
        return `
          <div class="perp-pos-card">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <strong style="font-size: 13.5px;">${escapeHtml(p.coin)}</strong>
                <span class="ca-badge">${escapeHtml(dirText)} ${escapeHtml(String(p.leverageValue || '--'))}x</span>
                <span style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(p.leverageType || 'isolated')}</span>
              </div>
              <button type="button" class="mini-action-btn primary" data-action="close-perp-pos" data-coin="${escapeHtml(p.coin)}">${escapeHtml(t('市价平仓', 'Close'))}</button>
            </div>
            <div class="flex items-center justify-between" style="font-size: 11.5px; color: var(--text-secondary);">
              <span>${escapeHtml(t('数量', 'Size'))}: <strong class="mono">${escapeHtml(String(p.absSize))}</strong></span>
              <span>${escapeHtml(t('开仓', 'Entry'))}: <span class="mono">${escapeHtml(formatPerpPx(p.entryPx))}</span></span>
              <span>${escapeHtml(t('强平', 'Liq'))}: <span class="mono">${escapeHtml(formatPerpPx(p.liquidationPx))}</span></span>
            </div>
            <div class="flex items-center justify-between" style="font-size: 12px;">
              <span style="color: var(--text-muted);">${escapeHtml(t('未实现盈亏', 'uPnL'))}</span>
              <span class="mono ${upnlCls}" style="font-weight: 700;">${upnl >= 0 ? '+' : ''}$${escapeHtml(upnl.toFixed(2))}${escapeHtml(roeStr)}</span>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    if (tab === 'orders') {
      const orders = acct.openOrders || [];
      if (orders.length === 0) {
        listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">${escapeHtml(t('暂无活动委托', 'No open orders'))}</div>`;
        return;
      }
      listEl.innerHTML = orders.map((o) => {
        const isBuy = String(o.side || '').toUpperCase() === 'B';
        return `
          <div class="perp-pos-card">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <strong>${escapeHtml(String(o.coin || ''))}</strong>
                <span class="ca-badge">${escapeHtml(isBuy ? t('买入', 'Buy') : t('卖出', 'Sell'))}</span>
              </div>
              <button type="button" class="mini-action-btn" data-action="cancel-perp-order" data-coin="${escapeHtml(String(o.coin || ''))}" data-oid="${escapeHtml(String(o.oid || ''))}">${escapeHtml(t('撤单', 'Cancel'))}</button>
            </div>
            <div class="flex items-center justify-between" style="font-size: 11.5px; color: var(--text-secondary);">
              <span>${escapeHtml(t('价格', 'Price'))}: <span class="mono">$${escapeHtml(String(o.limitPx || '--'))}</span></span>
              <span>${escapeHtml(t('数量', 'Size'))}: <span class="mono">${escapeHtml(String(o.sz || '--'))}</span></span>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    const fills = acct.fills || [];
    if (fills.length === 0) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">${escapeHtml(t('暂无成交记录', 'No recent fills'))}</div>`;
      return;
    }
    listEl.innerHTML = fills.slice(0, 20).map((f) => {
      const isBuy = String(f.side || '').toUpperCase() === 'B';
      const pnl = Number(f.closedPnl || 0);
      return `
        <div class="perp-pos-card" style="padding: 8px 10px;">
          <div class="flex items-center justify-between" style="font-size: 12px;">
            <span><strong>${escapeHtml(String(f.coin || ''))}</strong> · ${escapeHtml(isBuy ? t('买入', 'Buy') : t('卖出', 'Sell'))} ${escapeHtml(String(f.sz || ''))} @ $${escapeHtml(String(f.px || '--'))}</span>
            <span class="mono ${pnl >= 0 ? 'text-emerald' : 'text-rose'}">${pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)}` : '--'}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function evaluatePerpOrderUI() {
    const st = getState();
    const market = getSelectedPerpMarket();
    const marginEl = $('perp-margin-input');
    const limitEl = $('perp-limit-price-input');
    if (marginEl && marginEl.value !== undefined) st.perp.marginInput = marginEl.value;
    if (limitEl && limitEl.value !== undefined) st.perp.limitPriceInput = limitEl.value;
    st.perp.tpInput = ($('perp-tp-input')?.value || '').trim();
    st.perp.slInput = ($('perp-sl-input')?.value || '').trim();

    const evalRes = evaluatePerpOrderState({ market });
    const ntlEl = $('perp-meta-notional');
    const szEl = $('perp-meta-size');
    const liqEl = $('perp-meta-liq');
    if (ntlEl) ntlEl.textContent = evalRes.notional ? `$${evalRes.notional.toFixed(2)} USDC` : '--';
    if (szEl) szEl.textContent = evalRes.sizeNum > 0 ? `${evalRes.sizeStr} ${market ? market.name : st.perp.selectedCoin}` : '--';
    if (liqEl) liqEl.textContent = evalRes.estLiqPx ? `$${formatPerpPx(evalRes.estLiqPx)}` : '--';

    const errEl = $('perp-error-banner');
    const errText = st.perp.errorMsg || evalRes.error || '';
    if (errEl) {
      errEl.textContent = errText;
      errEl.classList.toggle('hidden', !errText);
    }
    const btn = $('btn-perp-submit');
    if (btn) {
      btn.disabled = Boolean(evalRes.disabled);
      btn.textContent = evalRes.text;
    }
    return evalRes;
  }

  function renderPerpView() {
    const st = getState();
    const tokens = getTokens();
    const acct = st.perp.account;
    const market = getSelectedPerpMarket();
    const { maxLev, onlyIso } = resolvePerpMarginBounds(market);

    const equityEl = $('perp-equity-val');
    const availEl = $('perp-avail-val');
    const tktAvailEl = $('perp-ticket-avail');
    const upnlEl = $('perp-upnl-val');
    const spotBanner = $('perp-spot-banner');
    const spotAmtEl = $('perp-spot-pending-amt');

    if (acct) {
      if (equityEl) equityEl.textContent = `$${Number(acct.accountValue || 0).toFixed(2)}`;
      if (availEl) availEl.textContent = `$${Number(acct.availableMargin || 0).toFixed(2)}`;
      if (tktAvailEl) tktAvailEl.textContent = `$${Number(acct.availableMargin || 0).toFixed(2)}`;
      const totalUpnl = (acct.positions || []).reduce((acc, p) => acc + (Number(p.unrealizedPnl) || 0), 0);
      if (upnlEl) {
        upnlEl.textContent = `${totalUpnl >= 0 ? '+' : ''}$${totalUpnl.toFixed(2)}`;
        upnlEl.classList.toggle('text-emerald', totalUpnl >= 0);
        upnlEl.classList.toggle('text-rose', totalUpnl < 0);
      }
      const spotUsd = Number(acct.spotUsdc || 0);
      if (spotBanner) spotBanner.classList.toggle('hidden', spotUsd < 0.01);
      if (spotAmtEl) spotAmtEl.textContent = `${spotUsd.toFixed(2)} USDC`;
    } else {
      if (equityEl) equityEl.textContent = '--';
      if (availEl) availEl.textContent = '--';
      if (tktAvailEl) tktAvailEl.textContent = '--';
      if (upnlEl) upnlEl.textContent = '--';
      if (spotBanner) spotBanner.classList.add('hidden');
    }

    const coinSymbol = market ? market.name : (st.perp.selectedCoin || 'BTC');
    const coinIconEl = $('perp-coin-icon');
    if (coinIconEl && tokens && typeof tokens.renderTokenIconWithBadge === 'function') {
      coinIconEl.innerHTML = tokens.renderTokenIconWithBadge({ symbol: coinSymbol, blockchain: 'hype' }, 20, false);
    }
    const coinNameEl = $('perp-coin-name');
    const markPxEl = $('perp-mark-px');
    const chgEl = $('perp-change-24h');
    const frEl = $('perp-funding-rate');
    const volEl = $('perp-vol-24h');
    const oiEl = $('perp-oi-val');
    if (coinNameEl) coinNameEl.textContent = `${coinSymbol}-PERP`;
    if (markPxEl) markPxEl.textContent = market && market.markPx ? `$${formatPerpPx(market.markPx)}` : '--';
    if (chgEl) {
      if (market && typeof market.change24hPct === 'number') {
        const pos = market.change24hPct >= 0;
        chgEl.textContent = `${pos ? '+' : ''}${market.change24hPct.toFixed(2)}%`;
        chgEl.style.color = pos ? '#34d399' : '#fb7185';
      } else {
        chgEl.textContent = '--';
      }
    }
    if (volEl) {
      volEl.textContent = market && typeof market.dayNtlVlm === 'number' && market.dayNtlVlm > 0
        ? formatCompactUsd(market.dayNtlVlm)
        : '--';
    }
    if (oiEl) {
      const oiUsd = (market && market.openInterest && market.markPx) ? market.openInterest * market.markPx : null;
      oiEl.textContent = oiUsd ? formatCompactUsd(oiUsd) : '--';
    }
    if (frEl) {
      frEl.textContent = market && typeof market.fundingRate === 'number'
        ? `${(market.fundingRate * 100).toFixed(4)}%`
        : '--';
    }

    const curIv = st.perp.chartInterval || '15m';
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#perp-interval-pills [data-iv]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-iv') === curIv);
      });
    }
    const chartWrap = $('perp-chart-wrap');
    const chartSvgEl = $('perp-chart-svg');
    const chartHlEl = $('perp-chart-hl');
    if (chartWrap) chartWrap.classList.toggle('hidden', !st.perp.showChart);
    if (chartSvgEl && st.perp.showChart) {
      chartSvgEl.innerHTML = renderPerpCandleSvg(st.perp.candles, market);
      if (chartHlEl) {
        if (Array.isArray(st.perp.candles) && st.perp.candles.length >= 2) {
          let lo = Infinity;
          let hi = -Infinity;
          for (const c of st.perp.candles) {
            if (c.l < lo) lo = c.l;
            if (c.h > hi) hi = c.h;
          }
          chartHlEl.textContent = `H $${formatPerpPx(hi)} / L $${formatPerpPx(lo)}`;
        } else {
          chartHlEl.textContent = '--';
        }
      }
    }

    renderPerpOrderbook();
    renderPerpLongShortBar();

    $('perp-side-long')?.classList.toggle('active', st.perp.side === 'long');
    $('perp-side-short')?.classList.toggle('active', st.perp.side === 'short');
    $('perp-mode-isolated')?.classList.toggle('active', st.perp.marginMode !== 'cross');
    const crossBtn = $('perp-mode-cross');
    if (crossBtn) {
      crossBtn.classList.toggle('active', st.perp.marginMode === 'cross');
      crossBtn.disabled = onlyIso;
    }
    $('perp-type-market')?.classList.toggle('active', st.perp.orderType !== 'limit');
    $('perp-type-limit')?.classList.toggle('active', st.perp.orderType === 'limit');
    $('perp-limit-price-row')?.classList.toggle('hidden', st.perp.orderType !== 'limit');

    const slider = $('perp-leverage-slider');
    if (slider) {
      slider.max = String(maxLev);
      slider.value = String(st.perp.leverage);
    }
    const levValEl = $('perp-lev-val');
    if (levValEl) levValEl.textContent = `${st.perp.leverage}x`;

    evaluatePerpOrderUI();
    renderPerpBottomList();
  }

  function renderPerpLongShortBar() {
    const st = getState();
    const wrap = $('perp-ls-ratio-wrap');
    if (!wrap) return;
    const coin = (st.perp && st.perp.selectedCoin) || 'BTC';
    const ls = st.perp && st.perp.lsRatio && st.perp.lsRatio.coin === coin ? st.perp.lsRatio : null;
    if (!ls || !Number.isFinite(ls.longPct) || !Number.isFinite(ls.shortPct)) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    const longPct = Math.max(1, Math.min(99, ls.longPct));
    const shortPct = Math.max(1, Math.min(99, 100 - longPct));
    if ($('perp-ls-long-label')) $('perp-ls-long-label').textContent = `${t('做多', 'Long')} ${ls.longPct.toFixed(1)}%`;
    if ($('perp-ls-short-label')) $('perp-ls-short-label').textContent = `${ls.shortPct.toFixed(1)}% ${t('做空', 'Short')}`;
    if ($('perp-ls-long-bar')) $('perp-ls-long-bar').style.width = `${longPct.toFixed(1)}%`;
    if ($('perp-ls-short-bar')) $('perp-ls-short-bar').style.width = `${shortPct.toFixed(1)}%`;
  }

  async function refreshPerpLongShortAsync(coin, force = false) {
    const st = getState();
    const hl = getHyperliquid();
    if (!hl || typeof hl.fetchGlobalLongShortAccountRatio !== 'function') return null;
    const targetCoin = String(coin || (st.perp && st.perp.selectedCoin) || 'BTC');
    const res = await hl.fetchGlobalLongShortAccountRatio(targetCoin, { timeoutMs: 2500, force }).catch(() => null);
    if (st.perp.selectedCoin !== targetCoin) return null;
    st.perp.lsRatio = res || null;
    renderPerpLongShortBar();
    return res || null;
  }

  async function refreshPerpOrderbookAndCandlesAsync() {
    const st = getState();
    const hl = getHyperliquid();
    if (!hl) return;
    const coin = st.perp.selectedCoin || 'BTC';
    const iv = st.perp.chartInterval || '15m';
    const tasks = [hl.fetchHlOrderbook(coin).catch(() => null)];
    if (st.perp.showChart) tasks.push(hl.fetchHlCandles(coin, iv, 48).catch(() => []));
    const [ob, candles] = await Promise.all(tasks);
    if (st.perp.selectedCoin !== coin) return;
    if (ob) st.perp.orderbook = ob;
    if (Array.isArray(candles)) st.perp.candles = candles;
    renderPerpView();
  }

  function setPerpChartInterval(interval) {
    const st = getState();
    st.perp.chartInterval = ['5m', '15m', '1h', '4h'].includes(String(interval)) ? String(interval) : '15m';
    st.perp.showChart = true;
    renderPerpView();
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
  }

  async function refreshPerpDataAsync(force = false) {
    const st = getState();
    const hl = getHyperliquid();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!hl || !contracts || !wallet) return;
    await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    const hlAddr = contracts.resolveWalletEvmSender(wallet);
    const now = Date.now();
    const needMarkets = force || !st.perp.markets.length || (now - st.perp.lastMarketSyncTs > 30_000);
    const [mkts, acct] = await Promise.all([
      needMarkets ? hl.fetchHlMarkets().catch(() => null) : Promise.resolve(null),
      hlAddr ? hl.fetchHlAccountState(hlAddr).catch(() => null) : Promise.resolve(null)
    ]);
    if (Array.isArray(mkts) && mkts.length > 0) {
      st.perp.markets = mkts;
      st.perp.lastMarketSyncTs = Date.now();
    }
    if (acct) {
      st.perp.account = acct;
      st.perp.lastAccountSyncTs = Date.now();
    }
    await refreshPerpOrderbookAndCandlesAsync();
    if (force) {
      refreshPerpLongShortAsync(st.perp.selectedCoin || 'BTC', true).catch(() => {});
      showToast(t('合约数据已刷新', 'Perps synced'));
    }
  }

  function setPerpSide(side) {
    getState().perp.side = side === 'short' ? 'short' : 'long';
    getState().perp.errorMsg = '';
    renderPerpView();
  }

  function setPerpMarginMode(mode) {
    const st = getState();
    const market = getSelectedPerpMarket();
    if (mode === 'cross' && market && market.onlyIsolated) {
      showToast(t('该市场仅支持逐仓模式', 'This market supports Isolated margin only'));
      return;
    }
    st.perp.marginMode = mode === 'cross' ? 'cross' : 'isolated';
    renderPerpView();
  }

  function setPerpOrderType(orderType) {
    const st = getState();
    st.perp.orderType = orderType === 'limit' ? 'limit' : 'market';
    const market = getSelectedPerpMarket();
    if (st.perp.orderType === 'limit' && !st.perp.limitPriceInput && market && market.markPx) {
      st.perp.limitPriceInput = String(market.markPx);
      const inp = $('perp-limit-price-input');
      if (inp) inp.value = st.perp.limitPriceInput;
    }
    renderPerpView();
  }

  function setPerpLeverage(val) {
    const st = getState();
    const market = getSelectedPerpMarket();
    const maxLev = market ? (Number(market.maxLeverage) || 20) : 50;
    const n = Math.max(1, Math.min(maxLev, Math.round(Number(val) || 1)));
    st.perp.leverage = n;
    const levEl = $('perp-lev-val');
    if (levEl) levEl.textContent = `${n}x`;
    evaluatePerpOrderUI();
  }

  function handlePerpMarginInput() {
    getState().perp.errorMsg = '';
    evaluatePerpOrderUI();
  }

  function handlePerpLimitPriceInput() {
    getState().perp.errorMsg = '';
    evaluatePerpOrderUI();
  }

  function setPerpMarginPercent(pct) {
    const st = getState();
    const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : 0;
    if (avail <= 0) {
      showToast(t('可用保证金为 0，请先充值或从 Spot 划转', 'Available margin is 0; deposit or transfer first'));
      return;
    }
    const amt = (avail * Number(pct)).toFixed(2);
    st.perp.marginInput = amt;
    const inp = $('perp-margin-input');
    if (inp) inp.value = amt;
    st.perp.errorMsg = '';
    evaluatePerpOrderUI();
  }

  function togglePerpChart() {
    const st = getState();
    st.perp.showChart = !st.perp.showChart;
    renderPerpView();
    if (st.perp.showChart) refreshPerpOrderbookAndCandlesAsync().catch(() => {});
  }

  function fillPerpLimitPrice(px) {
    const st = getState();
    st.perp.orderType = 'limit';
    st.perp.limitPriceInput = String(px || '');
    const inp = $('perp-limit-price-input');
    if (inp) inp.value = st.perp.limitPriceInput;
    renderPerpView();
  }

  function setPerpBottomTab(tab) {
    getState().perp.bottomTab = ['positions', 'orders', 'fills'].includes(tab) ? tab : 'positions';
    renderPerpBottomList();
  }

  function setPerpMarketFilter(filter) {
    const st = getState();
    st.perp.marketFilter = ['hot', 'all', 'gainers', 'vol'].includes(filter) ? filter : 'hot';
    renderPerpMarketsSheet();
  }

  function renderPerpMarketsSheet() {
    const st = getState();
    const tokens = getTokens();
    const hl = getHyperliquid();
    const listEl = $('perp-market-list');
    if (!listEl) return;
    const q = String($('perp-market-search')?.value || st.perp.marketSearch || '').trim().toUpperCase();
    st.perp.marketSearch = q;
    const activeFilter = st.perp.marketFilter || 'hot';
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#perp-market-filters [data-mkt-filter]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-mkt-filter') === activeFilter);
      });
    }

    const mkts = Array.isArray(st.perp.markets) ? [...st.perp.markets] : [];
    let filtered = q ? mkts.filter((m) => m.name.toUpperCase().includes(q)) : mkts;
    if (!q && activeFilter === 'gainers') {
      filtered.sort((a, b) => (Number(b.change24hPct) || -999) - (Number(a.change24hPct) || -999));
    } else if (!q && activeFilter === 'vol') {
      filtered.sort((a, b) => (Number(b.dayNtlVlm) || 0) - (Number(a.dayNtlVlm) || 0));
    } else if (!q && activeFilter === 'hot') {
      const pinned = new Set((hl && hl.PINNED_COINS) || ['BTC', 'ETH', 'SOL', 'NEAR', 'HYPE']);
      const top = filtered.filter((m) => pinned.has(m.name));
      const rest = filtered.filter((m) => !pinned.has(m.name)).sort((a, b) => (Number(b.dayNtlVlm) || 0) - (Number(a.dayNtlVlm) || 0));
      filtered = [...top, ...rest.slice(0, 35)];
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 18px 0;">${escapeHtml(t('未找到匹配市场', 'No matching market'))}</div>`;
      return;
    }
    const selCoin = st.perp.selectedCoin || 'BTC';
    listEl.innerHTML = filtered.slice(0, 120).map((m) => {
      const chg = typeof m.change24hPct === 'number' ? m.change24hPct : null;
      const chgStr = chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '--';
      const chgCls = chg !== null ? (chg >= 0 ? 'text-emerald' : 'text-rose') : '';
      const iconHtml = tokens && typeof tokens.renderTokenIconWithBadge === 'function'
        ? tokens.renderTokenIconWithBadge({ symbol: m.name, blockchain: 'hype' }, 28, false)
        : '';
      const volText = typeof m.dayNtlVlm === 'number' && m.dayNtlVlm > 0 ? `${t('量', 'Vol')} ${formatCompactUsd(m.dayNtlVlm)}` : '';
      return `
        <button type="button" class="perp-market-item ${m.name === selCoin ? 'active' : ''}" data-action="select-perp-market" data-coin="${escapeHtml(m.name)}">
          <div class="flex items-center gap-2">
            ${iconHtml}
            <div class="flex flex-col" style="gap:1px;">
              <div class="flex items-center gap-1">
                <strong>${escapeHtml(m.name)}-PERP</strong>
                <span class="ca-badge">${escapeHtml(String(m.maxLeverage || 20))}x</span>
              </div>
              <span style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(volText)}</span>
            </div>
          </div>
          <div class="flex flex-col mono" style="font-size: 12.5px; text-align: right; gap: 2px;">
            <strong style="color: #fff;">${m.markPx ? `$${escapeHtml(formatPerpPx(m.markPx))}` : '--'}</strong>
            <span class="${chgCls}" style="font-size: 11px;">${escapeHtml(chgStr)}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  function openPerpMarketsSheet() {
    renderPerpMarketsSheet();
    openSheet('sheet-perp-markets');
    if (!getState().perp.markets.length) refreshPerpDataAsync(false).then(() => renderPerpMarketsSheet()).catch(() => {});
  }

  function selectPerpMarket(coin) {
    const st = getState();
    st.perp.selectedCoin = String(coin || 'BTC');
    st.perp.limitPriceInput = '';
    st.perp.errorMsg = '';
    st.perp.lsRatio = null;
    closeAllSheets();
    renderPerpView();
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
    refreshPerpLongShortAsync(st.perp.selectedCoin, false).catch(() => {});
  }

  async function executePerpOrderUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const evalRes = evaluatePerpOrderUI();
    if (evalRes.disabled || !evalRes.sizeNum) {
      if (evalRes.error) showToast(evalRes.error);
      return;
    }
    const market = getSelectedPerpMarket();
    if (!market) return;
    st.perp.submitting = true;
    st.perp.errorMsg = '';
    renderPerpView();
    try {
      await ensureEthersLoaded();
      const isBuy = st.perp.side === 'long';
      const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : null;
      await hl.placeHlPerpOrder({
        wallet,
        market,
        isBuy,
        size: evalRes.sizeNum,
        orderType: st.perp.orderType,
        limitPrice: st.perp.orderType === 'limit' ? Number(st.perp.limitPriceInput) : null,
        leverage: st.perp.leverage,
        isCross: st.perp.marginMode === 'cross',
        tpPrice: st.perp.tpInput ? Number(st.perp.tpInput) : null,
        slPrice: st.perp.slInput ? Number(st.perp.slInput) : null,
        availableMargin: avail
      });
      st.perp.marginInput = '';
      if ($('perp-margin-input')) $('perp-margin-input').value = '';
      showToast(`✅ ${t('合约委托已提交', 'Perp order submitted')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      st.perp.errorMsg = (err && err.message) || t('下单失败', 'Order failed');
      showToast(st.perp.errorMsg);
    } finally {
      st.perp.submitting = false;
      renderPerpView();
    }
  }

  async function closePerpPositionUI(coin) {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin) return;
    const pos = st.perp.account && (st.perp.account.positions || []).find((p) => p.coin === coin);
    let market = (st.perp.markets || []).find((m) => m.name === coin);
    if (!pos) return;
    try {
      await ensureEthersLoaded();
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      await hl.closeHlPositionMarket({ wallet, market, position: pos });
      showToast(`✅ ${coin} ${t('已市价平仓', 'position closed')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('平仓失败', 'Close failed'));
    }
  }

  async function cancelPerpOrderUI(coin, oid) {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin || !oid) return;
    let market = (st.perp.markets || []).find((m) => m.name === coin);
    try {
      await ensureEthersLoaded();
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      await hl.cancelHlOrder({ wallet, assetIndex: market.index, oid: Number(oid) });
      showToast(t('已撤单', 'Order cancelled'));
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('撤单失败', 'Cancel failed'));
    }
  }

  async function quickTransferSpotToPerpUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !st.perp.account) return;
    const amt = Number(st.perp.account.spotUsdc || 0);
    if (amt <= 0) return;
    try {
      await ensureEthersLoaded();
      await hl.transferHlUsdClass({ wallet, amount: amt, toPerp: true });
      showToast(`✅ ${t('已划转至合约账户', 'Moved to Perp account')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('划转失败', 'Transfer failed'));
    }
  }

  function getEligiblePerpOneClickEntries(wallet) {
    const hl = getHyperliquid();
    if (!wallet || !hl) return [];
    return getSendSourceEntriesForWallet(wallet).filter(
      (e) => Number(e.balance || 0) > 0 && hl.isDirectOneClickOriginForHl(e)
    );
  }

  function evaluatePerpOneClickState({ entry = null, amount = 0, quote = null, quoteError = '', quoting = false } = {}) {
    if (!entry) {
      return { disabled: true, error: '', text: t('暂无可用跨链资产', 'No eligible asset') };
    }
    const amt = Number(amount);
    const avail = Number(entry.balance || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', text: t('请输入充值数量', 'Enter amount') };
    }
    if (amt > avail + 1e-12) {
      const msg = t(`${entry.symbol} 余额不足 (可用: ${formatBal(avail, 4)})`, `Insufficient ${entry.symbol} (avail: ${formatBal(avail, 4)})`);
      return { disabled: true, error: msg, text: t(`${entry.symbol} 余额不足`, `Insufficient ${entry.symbol}`) };
    }
    if (quoting) {
      return { disabled: true, error: '', text: t('正在获取跨链报价...', 'Fetching route...') };
    }
    if (quoteError) {
      return { disabled: true, error: quoteError, text: t('当前路由暂不可用', 'Route unavailable') };
    }
    if (!quote || !quote.ok || !quote.amountOutFormatted) {
      return { disabled: true, error: '', text: t('等待跨链报价', 'Waiting for quote') };
    }
    return { disabled: false, error: '', text: t('确认跨链充值', 'Confirm Cross-Chain Deposit') };
  }

  function evaluatePerpArbDepositState({ amount = 0, arbUsdc = 0, arbEth = 0 } = {}) {
    const hl = getHyperliquid();
    const minUsdc = hl ? hl.HL_ARB_BRIDGE_MIN_USDC : 5;
    const minEth = hl ? hl.HL_ARB_MIN_ETH_GAS : 0.0002;
    const amt = Number(amount);
    const usdc = Number(arbUsdc || 0);
    const eth = Number(arbEth || 0);

    if (usdc < minUsdc) {
      const msg = t(`Arbitrum USDC 余额不足 (可用 ${usdc.toFixed(2)}，最低需 ${minUsdc} USDC)`, `Insufficient Arbitrum USDC (${usdc.toFixed(2)} avail, need >= ${minUsdc})`);
      return { disabled: true, error: msg, text: t('Arbitrum USDC 不足', 'Insufficient Arbitrum USDC') };
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', text: t('请输入充值数量 (>= 5 USDC)', 'Enter amount (>= 5 USDC)') };
    }
    if (amt < minUsdc) {
      const msg = t(`最低充值 ${minUsdc} USDC（低于 ${minUsdc} 将无法上账）`, `Minimum deposit is ${minUsdc} USDC`);
      return { disabled: true, error: msg, text: t(`最低充值 ${minUsdc} USDC`, `Min ${minUsdc} USDC`) };
    }
    if (amt > usdc + 1e-9) {
      const msg = t(`Arbitrum USDC 余额不足 (当前可用: ${usdc.toFixed(2)} USDC)`, `Insufficient Arbitrum USDC (avail: ${usdc.toFixed(2)})`);
      return { disabled: true, error: msg, text: t('Arbitrum USDC 不足', 'Insufficient Arbitrum USDC') };
    }
    if (eth < minEth) {
      const msg = t(`Arbitrum ETH Gas 不足 (需 >= ${minEth} ETH，当前 ${eth.toFixed(5)} ETH)`, `Need >= ${minEth} Arbitrum ETH for gas (${eth.toFixed(5)} avail)`);
      return { disabled: true, error: msg, text: t('Arbitrum ETH Gas 不足', 'Insufficient ETH Gas') };
    }
    return { disabled: false, error: '', text: t('确认 Arbitrum 充值', 'Confirm Arbitrum Deposit') };
  }

  function evaluatePerpWithdrawState({ amount = 0, withdrawable = null } = {}) {
    const hl = getHyperliquid();
    const minW = hl ? hl.HL_WITHDRAW_MIN_USDC : 2;
    const fee = hl ? hl.HL_WITHDRAW_FEE_USDC : 1;
    const amt = Number(amount);
    const avail = withdrawable === null || withdrawable === undefined ? 0 : Number(withdrawable);
    const netReceive = Number.isFinite(amt) && amt >= minW ? Math.max(0, amt - fee) : null;

    if (avail < minW) {
      const msg = t(`可提现余额不足 (当前 $${avail.toFixed(2)}，最低提现 ${minW} USDC)`, `Insufficient withdrawable ($${avail.toFixed(2)} avail, min ${minW} USDC)`);
      return { disabled: true, error: msg, netReceive: null, text: t('可提现余额不足', 'Insufficient Balance') };
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', netReceive: null, text: t('请输入提现数量', 'Enter withdraw amount') };
    }
    if (amt < minW) {
      const msg = t(`最低提现 ${minW} USDC（含 ${fee} USDC 协议手续费）`, `Minimum withdrawal is ${minW} USDC (incl. ${fee} USDC fee)`);
      return { disabled: true, error: msg, netReceive: null, text: t(`最低提现 ${minW} USDC`, `Min ${minW} USDC`) };
    }
    if (amt > avail + 1e-9) {
      const msg = t(`超出可提现余额 (可用: ${avail.toFixed(2)} USDC)`, `Exceeds withdrawable (${avail.toFixed(2)} USDC)`);
      return { disabled: true, error: msg, netReceive: null, text: t('超出可提现余额', 'Exceeds Withdrawable') };
    }
    return { disabled: false, error: '', netReceive, text: t('安全验证并提现', 'Verify & Withdraw') };
  }

  function evaluatePerpOneClickUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const entries = wallet ? getEligiblePerpOneClickEntries(wallet) : [];
    const selKey = $('perp-oc-origin-select')?.value || st.perp.fundingOriginAssetId || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0] || null;
    const amt = Number($('perp-oc-amount')?.value || 0);
    const res = evaluatePerpOneClickState({
      entry,
      amount: amt,
      quote: st.perp.fundingQuote,
      quoteError: st.perp.fundingQuoteError,
      quoting: st.perp.fundingQuoting
    });
    const outEl = $('perp-oc-quote-out');
    if (outEl) {
      if (st.perp.fundingQuoting) {
        outEl.className = 'meta-val';
        outEl.textContent = t('询价中...', 'Quoting...');
      } else if (st.perp.fundingQuote && st.perp.fundingQuote.ok && st.perp.fundingQuote.amountOutFormatted) {
        outEl.className = 'meta-val text-emerald';
        outEl.textContent = `${st.perp.fundingQuote.amountOutFormatted} USDC`;
      } else {
        outEl.className = 'meta-val';
        outEl.textContent = '--';
      }
    }
    const errEl = $('perp-oc-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const btn = $('btn-perp-oc-deposit');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  function evaluatePerpArbDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !contracts) return null;
    const arbUsdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    const arbEth = contracts.resolveWalletChainBalance(wallet, 'arb');
    const amt = Number($('perp-arb-amount')?.value || 0);
    const res = evaluatePerpArbDepositState({ amount: amt, arbUsdc, arbEth });
    const errEl = $('perp-arb-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const btn = $('btn-perp-arb-deposit');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  function evaluatePerpWithdrawUI() {
    const st = getState();
    const withdrawable = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    const amt = Number($('perp-withdraw-amount')?.value || 0);
    const res = evaluatePerpWithdrawState({ amount: amt, withdrawable });
    const netEl = $('perp-wd-net-val');
    if (netEl) netEl.textContent = res.netReceive !== null ? `${res.netReceive.toFixed(2)} USDC` : '--';
    const errEl = $('perp-wd-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const btn = $('btn-perp-withdraw');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  function setPerpOneClickMax() {
    const wallet = getState().getActiveWallet();
    const entries = wallet ? getEligiblePerpOneClickEntries(wallet) : [];
    const selKey = $('perp-oc-origin-select')?.value || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0];
    if (!entry || !$('perp-oc-amount')) return;
    $('perp-oc-amount').value = String(entry.balance || 0);
    schedulePerpOneClickQuote();
  }

  function setPerpArbMax() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !$('perp-arb-amount')) return;
    const usdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    $('perp-arb-amount').value = usdc > 0 ? usdc.toFixed(2) : '';
    evaluatePerpArbDepositUI();
  }

  function setPerpWithdrawMax() {
    const st = getState();
    const avail = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    if ($('perp-withdraw-amount')) $('perp-withdraw-amount').value = avail > 0 ? avail.toFixed(2) : '';
    evaluatePerpWithdrawUI();
  }

  function jumpFromPerpToSwap() {
    closeAllSheets();
    setSwapPanelMode('market');
    switchTab('swap');
  }

  function renderPerpFundingSheet() {
    const st = getState();
    const hl = getHyperliquid();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !contracts) return;

    const mode = st.perp.fundingMode === 'withdraw' ? 'withdraw' : 'deposit';
    const titleEl = $('perp-funding-sheet-title');
    if (titleEl) {
      titleEl.textContent = mode === 'withdraw' ? t('提现到钱包', 'Withdraw to Wallet') : t('合约充值', 'Deposit Funds');
    }
    $('perp-mode-deposit')?.classList.toggle('hidden', mode !== 'deposit');
    $('perp-mode-withdraw')?.classList.toggle('hidden', mode !== 'withdraw');

    const tab = st.perp.fundingTab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    $('perp-ftab-oneclick')?.classList.toggle('active', tab === 'oneclick');
    $('perp-ftab-arbitrum')?.classList.toggle('active', tab === 'arbitrum');
    $('perp-funding-panel-oneclick')?.classList.toggle('hidden', tab !== 'oneclick');
    $('perp-funding-panel-arbitrum')?.classList.toggle('hidden', tab !== 'arbitrum');

    const entries = getEligiblePerpOneClickEntries(wallet);
    $('perp-oc-empty-state')?.classList.toggle('hidden', entries.length > 0);
    $('perp-oc-form')?.classList.toggle('hidden', entries.length === 0);

    const sel = $('perp-oc-origin-select');
    if (sel && entries.length > 0) {
      const prevVal = st.perp.fundingOriginAssetId || sel.value;
      sel.innerHTML = entries.map((e) =>
        `<option value="${escapeHtml(e.key)}">${escapeHtml(`${e.symbol} · ${e.chainLabel} (${formatBal(e.balance, 4)})`)}</option>`
      ).join('');
      if (entries.some((e) => e.key === prevVal)) sel.value = prevVal;
      const chosen = entries.find((e) => e.key === sel.value) || entries[0] || null;
      st.perp.fundingOriginAssetId = chosen ? chosen.key : '';
      const availEl = $('perp-oc-origin-avail');
      if (availEl) availEl.textContent = chosen ? `${formatBal(chosen.balance, 4)} ${chosen.symbol}` : '--';
    } else if (sel) {
      sel.innerHTML = '';
    }

    const hlAddr = contracts.resolveWalletEvmSender(wallet);
    if ($('perp-oc-target-addr')) $('perp-oc-target-addr').textContent = hlAddr ? shortenAddr(hlAddr, 8, 6) : '--';
    if ($('perp-wd-dest-addr')) $('perp-wd-dest-addr').textContent = hlAddr ? shortenAddr(hlAddr, 8, 6) : '--';

    const arbUsdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    const arbEth = contracts.resolveWalletChainBalance(wallet, 'arb');
    if ($('perp-arb-usdc-avail')) $('perp-arb-usdc-avail').textContent = `${arbUsdc.toFixed(2)} USDC`;
    if ($('perp-arb-eth-avail')) $('perp-arb-eth-avail').textContent = `${arbEth.toFixed(5)} ETH`;

    const acct = st.perp.account;
    const spotUsd = acct ? Number(acct.spotUsdc || 0) : 0;
    const wdAvail = acct ? Number(acct.withdrawable || 0) : 0;
    if ($('perp-wd-avail')) $('perp-wd-avail').textContent = acct ? `${wdAvail.toFixed(2)} USDC` : '--';
    $('perp-wd-spot-banner')?.classList.toggle('hidden', spotUsd < 0.01);
    if ($('perp-wd-spot-amt')) $('perp-wd-spot-amt').textContent = `${spotUsd.toFixed(2)} USDC`;

    evaluatePerpOneClickUI();
    evaluatePerpArbDepositUI();
    evaluatePerpWithdrawUI();
  }

  function openPerpFundingSheet(modeOrTab = 'deposit') {
    const st = getState();
    if (modeOrTab === 'withdraw' || modeOrTab === 'transfer') {
      st.perp.fundingMode = 'withdraw';
    } else {
      st.perp.fundingMode = 'deposit';
      st.perp.fundingTab = modeOrTab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    }
    st.perp.fundingQuote = null;
    st.perp.fundingQuoteError = '';
    st.perp.fundingQuoting = false;
    renderPerpFundingSheet();
    openSheet('sheet-perp-funding');
  }

  function setPerpFundingTab(tab) {
    const st = getState();
    st.perp.fundingTab = tab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    renderPerpFundingSheet();
  }

  function schedulePerpOneClickQuote() {
    const st = getState();
    st.perp.fundingQuote = null;
    st.perp.fundingQuoteError = '';
    if (_perpQuoteTimer) clearTimeout(_perpQuoteTimer);
    const amt = Number($('perp-oc-amount')?.value || 0);
    const entries = getEligiblePerpOneClickEntries(st.getActiveWallet());
    const selKey = $('perp-oc-origin-select')?.value || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0] || null;
    if (!entry || !Number.isFinite(amt) || amt <= 0 || amt > Number(entry.balance || 0)) {
      st.perp.fundingQuoting = false;
      renderPerpFundingSheet();
      return;
    }
    st.perp.fundingQuoting = true;
    renderPerpFundingSheet();
    _perpQuoteTimer = setTimeout(async () => {
      try {
        const hl = getHyperliquid();
        const wallet = st.getActiveWallet();
        const curEntries = getEligiblePerpOneClickEntries(wallet);
        const curKey = $('perp-oc-origin-select')?.value || '';
        const curEntry = curEntries.find((e) => e.key === curKey) || curEntries[0];
        if (!hl || !wallet || !curEntry) return;
        const q = await hl.quoteOneClickDepositToHlSpot({ wallet, originToken: curEntry, amount: amt, dry: true });
        st.perp.fundingQuoting = false;
        if (q && q.ok) {
          st.perp.fundingQuote = q;
          st.perp.fundingQuoteError = '';
        } else {
          st.perp.fundingQuote = null;
          st.perp.fundingQuoteError = (q && q.error) || t('暂无跨链报价', 'Quote unavailable');
        }
      } catch (err) {
        st.perp.fundingQuoting = false;
        st.perp.fundingQuote = null;
        st.perp.fundingQuoteError = (err && err.message) || t('询价失败', 'Quote failed');
      } finally {
        evaluatePerpOneClickUI();
      }
    }, 360);
  }

  async function executePerpOneClickDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!hl || !intents || !contracts || !wallet) return;

    const amt = Number($('perp-oc-amount')?.value || 0);
    const key = $('perp-oc-origin-select')?.value || '';
    const entry = getEligiblePerpOneClickEntries(wallet).find((e) => e.key === key);
    const check = evaluatePerpOneClickState({
      entry,
      amount: amt,
      quote: st.perp.fundingQuote,
      quoteError: st.perp.fundingQuoteError,
      quoting: false
    });
    if (check.disabled) {
      if (check.error) showToast(check.error);
      evaluatePerpOneClickUI();
      return;
    }
    const avail = Number(entry.balance || 0);
    const btn = $('btn-perp-oc-deposit');
    if (btn) btn.disabled = true;
    try {
      await ensureEthersLoaded();
      const q = await hl.quoteOneClickDepositToHlSpot({ wallet, originToken: entry, amount: amt, dry: false });
      if (!q || !q.ok || !q.depositAddress) throw new Error((q && q.error) || t('获取跨链充值路由失败', 'Failed to get deposit route'));

      let txHash = '';
      if (entry.blockchain === 'near' && entry.kind !== 'nep141' && entry.symbol === 'NEAR') {
        txHash = (await contracts.signAndSendNearTransfer({ wallet, receiverId: q.depositAddress, amountNear: amt })).txHash;
      } else if (entry.blockchain === 'near' && entry.contractAddress) {
        txHash = (await contracts.executeNearNep141Transfer({ wallet, tokenContract: entry.contractAddress, receiverId: q.depositAddress, amount: amt, decimals: entry.decimals || 8, tokenSymbol: entry.symbol, tokenBalance: avail })).txHash;
      } else if (entry.blockchain === 'sol') {
        txHash = !entry.contractAddress || entry.contractAddress === 'So11111111111111111111111111111111111111112'
          ? (await contracts.executeSolanaNativeTransfer({ wallet, toAddress: q.depositAddress, amountSol: amt })).txHash
          : (await contracts.executeSolanaSplTransfer({ wallet, mintAddress: entry.contractAddress, toAddress: q.depositAddress, amount: amt, decimals: entry.decimals || 6, tokenBalance: avail })).txHash;
      } else if (entry.blockchain === 'btc') {
        const res = await contracts.executeBitcoinTransfer({ wallet, toAddress: q.depositAddress, amountBtc: amt, feeDeductMode: 'extra' });
        txHash = res.txHash;
        applyOptimisticChainSpend(wallet, 'btc', amt, Number(res.feeBtc) || 0, txHash);
      } else {
        txHash = (await contracts.executeEvmTransfer({ wallet, chainKey: entry.blockchain, toAddress: q.depositAddress, amount: amt, tokenContract: entry.contractAddress, decimals: entry.decimals || 18, tokenBalance: avail })).txHash;
      }

      if (txHash) {
        await intents.submitExternalDepositTxHash({ depositAddress: q.depositAddress, txHash, nearSenderAccount: wallet.nearNamedAccount || wallet.nearAddress }).catch(() => {});
      }
      showToast(`✅ ${t('跨链充值已发送，到账后点击「一键转入合约」即可下单', 'Deposit sent; click Move to Trading after confirmation')}`);
      closeAllSheets();
      refreshAllBalancesAsync(false);
    } catch (err) {
      st.perp.fundingQuoteError = (err && err.message) || t('跨链充值失败', 'Deposit failed');
      evaluatePerpOneClickUI();
      showToast(st.perp.fundingQuoteError);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function executePerpArbBridgeDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const pre = evaluatePerpArbDepositUI();
    if (pre && pre.disabled) {
      if (pre.error) showToast(pre.error);
      return;
    }
    const amt = Number($('perp-arb-amount')?.value || 0);
    const btn = $('btn-perp-arb-deposit');
    if (btn) btn.disabled = true;
    try {
      await ensureEthersLoaded();
      const res = await hl.depositArbUsdcToHlBridge({ wallet, amount: amt });
      showToast(`✅ ${t('Arbitrum 充值已提交', 'Arbitrum deposit sent')}: ${shortenAddr(res.txHash)}`);
      closeAllSheets();
      refreshAllBalancesAsync(false);
      refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('Arbitrum 充值失败', 'Arbitrum deposit failed'));
    } finally {
      if (btn) btn.disabled = false;
      evaluatePerpArbDepositUI();
    }
  }

  async function executePerpWithdrawUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const pre = evaluatePerpWithdrawUI();
    if (pre && pre.disabled) {
      if (pre.error) showToast(pre.error);
      return;
    }
    const amt = Number($('perp-withdraw-amount')?.value || 0);
    const withdrawable = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    const authed = await verifySecurityAuthAsync(wallet, t('提现 USDC 至 Arbitrum 钱包', 'Withdraw USDC to Arbitrum wallet'));
    if (!authed) return;

    const btn = $('btn-perp-withdraw');
    if (btn) btn.disabled = true;
    try {
      await ensureEthersLoaded();
      await hl.withdrawHlToArbitrum({ wallet, amount: amt, withdrawable });
      showToast(`✅ ${t('提现请求已提交至 Arbitrum (约几分钟到账)', 'Withdrawal submitted to Arbitrum')}`);
      closeAllSheets();
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('提现失败', 'Withdrawal failed'));
    } finally {
      if (btn) btn.disabled = false;
      evaluatePerpWithdrawUI();
    }
  }

  // ==================== Earn / Liquid Staking Controller ====================

  async function refreshStakingMetrics(showFeedback = false) {
    const st = getState();
    const contracts = getContracts();
    if (st.staking.loading && !showFeedback) return;
    st.staking.loading = true;
    try {
      const pools = await contracts.fetchLiveStakingMetrics({
        useCache: !showFeedback && Boolean(st.staking.pools),
        onFastUpdate: (fastPools) => {
          if (Array.isArray(fastPools) && fastPools.length > 0) {
            st.staking.pools = fastPools;
            renderEarnView();
          }
        }
      });
      st.staking.pools = pools;
      if (typeof st.saveCachedStakingMetrics === 'function') st.saveCachedStakingMetrics(pools);
      renderEarnView();
      const detailSheet = $('sheet-token-detail');
      if (detailSheet && detailSheet.classList && detailSheet.classList.contains('open')) {
        renderTokenDetailSheet();
      }
      if (showFeedback) showToast(t('已同步实时质押年化', 'Staking APY synced'));
    } catch (_) {
      if (showFeedback) showToast(t('获取质押利率失败', 'Failed to fetch APY'));
    } finally {
      st.staking.loading = false;
    }
  }
  const refreshEarnMetricsAsync = refreshStakingMetrics;

  function getEarnPoolAvailableBalance(wallet, pool) {
    if (!wallet || !pool) return null;
    const contracts = getContracts();
    if (pool.isBurrowSupply && pool.isNativeWrapSupply) {
      const nativeNear = wallet.nativeBalances ? wallet.nativeBalances.near : null;
      const wnear = wallet.nearNep141Balances?.[pool.tokenContract]?.formatted;
      if (typeof nativeNear !== 'number' && typeof wnear !== 'number') return null;
      return (typeof nativeNear === 'number' && Number.isFinite(nativeNear) ? nativeNear : 0) +
        (typeof wnear === 'number' && Number.isFinite(wnear) ? wnear : 0);
    }
    if (pool.isAaveV3 && pool.isNativeWrapSupply) {
      const nativeEth = wallet.nativeBalances ? wallet.nativeBalances[pool.chain] : null;
      const weth = contracts && typeof contracts.resolveWalletPoolTokenBalance === 'function'
        ? contracts.resolveWalletPoolTokenBalance(wallet, { ...pool, useNativeOrPrecompile: false })
        : 0;
      if (typeof nativeEth !== 'number' && !(weth > 0)) return null;
      return (typeof nativeEth === 'number' && Number.isFinite(nativeEth) ? nativeEth : 0) +
        (typeof weth === 'number' && Number.isFinite(weth) ? weth : 0);
    }
    if (contracts && typeof contracts.resolveWalletPoolTokenBalance === 'function' && (pool.isTokenStake && !pool.useNativeOrPrecompile)) {
      return contracts.resolveWalletPoolTokenBalance(wallet, pool);
    }
    if (!pool.isTokenStake || pool.useNativeOrPrecompile) {
      return wallet.nativeBalances ? wallet.nativeBalances[pool.chain] : null;
    }
    return 0;
  }

  function getFilteredStakingPools(pools, filterKey, searchQuery) {
    const list = Array.isArray(pools) ? pools : [];
    const q = String(searchQuery || '').trim().toLowerCase();
    if (q) {
      return list.filter((p) => {
        const haystack = [
          p.id, p.name, p.protocol, p.inSymbol, p.outSymbol,
          p.chainLabel, p.chain, p.contract, p.tokenContract, p.inputMint
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    const f = String(filterKey || 'featured').toLowerCase();
    if (f === 'all') return list;
    if (f === 'lending') return list.filter((p) => p.category === 'lending' || p.isAaveV3 || p.isBurrowSupply || p.isErc4626 || p.isLockConvert);
    if (f === 'staking') return list.filter((p) => p.category === 'staking' || (!p.isAaveV3 && !p.isBurrowSupply && !p.isErc4626 && !p.isLockConvert));
    if (f === 'near') return list.filter((p) => p.chain === 'near');
    if (f === 'sol') return list.filter((p) => p.chain === 'sol');
    if (f === 'evm') return list.filter((p) => p.chain !== 'near' && p.chain !== 'sol');
    return list.filter((p) => Boolean(p.featured));
  }

  function getPoolCategoryMeta(pool) {
    if (!pool) return { label: '', cls: 'cat-staking' };
    if (pool.isAaveV3 || pool.isBurrowSupply) {
      return { label: t('借贷 Lending', 'Lending'), cls: 'cat-lending' };
    }
    if (pool.isErc4626 || pool.isLockConvert || pool.category === 'lending') {
      return { label: t('金库 Vault', 'Vault'), cls: 'cat-vault' };
    }
    return { label: t('质押 Staking', 'Staking'), cls: 'cat-staking' };
  }

  function getEffectivePoolRate(pool) {
    if (!pool) return null;
    if (pool.isLockConvert && Array.isArray(pool.lockTiers) && pool.lockTiers.length > 0) {
      const lockDays = Number(getState().staking.lockDays || 181);
      const hit = pool.lockTiers.find((tier) => Number(tier.days) === lockDays) || pool.lockTiers[pool.lockTiers.length - 1];
      return hit ? Number(hit.rate) : pool.rate;
    }
    return pool.rate;
  }

  function formatLockTierLabel(tier) {
    const days = Number(tier.days);
    const pct = `${Math.round(Number(tier.rate) * 100)}%`;
    if (days === 15) return t(`2周 (15天 · ${pct})`, `2W (15d · ${pct})`);
    if (days === 45) return t(`1.5个月 (45天 · ${pct})`, `1.5M (45d · ${pct})`);
    if (days === 91) return t(`3个月 (91天 · ${pct})`, `3M (91d · ${pct})`);
    if (days === 181) return t(`6个月 (181天 · ${pct})`, `6M (181d · ${pct})`);
    return t(`${days}天 · ${pct}`, `${days}d · ${pct}`);
  }

  function formatPoolApyText(p) {
    if (p.isLockConvert) {
      if (Array.isArray(p.lockTiers) && p.lockTiers.length > 0) {
        const minPct = Math.round(p.lockTiers[0].rate * 100);
        const maxPct = Math.round(p.lockTiers[p.lockTiers.length - 1].rate * 100);
        return t(`${minPct}%~${maxPct}% 兑换`, `${minPct}%~${maxPct}%`);
      }
      return '--';
    }
    if (typeof p.apy === 'number' && Number.isFinite(p.apy)) {
      if (p.isJupiterDao || p.isAsrEstimated) {
        return t(`ASR 估算 ~${p.apy.toFixed(2)}%`, `ASR Est. ~${p.apy.toFixed(2)}%`);
      }
      return `${p.apy.toFixed(2)}%`;
    }
    return '--';
  }

  function renderEarnView() {
    const st = getState();
    const tokens = getTokens();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const allPools = st.staking.pools || contracts.STAKING_POOLS;
    const activeFilter = st.staking.filter || 'featured';
    const searchQuery = st.staking.search || '';
    const filteredPools = getFilteredStakingPools(allPools, activeFilter, searchQuery);

    if (typeof document !== 'undefined') {
      document.querySelectorAll('#earn-pool-filters .filter-pill').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === activeFilter && !searchQuery);
      });
    }
    if ($('earn-pool-search') && $('earn-pool-search').value !== searchQuery) {
      $('earn-pool-search').value = searchQuery;
    }

    const myPosCard = $('earn-my-positions-card');
    const myPosList = $('earn-my-positions-list');
    const myPosCount = $('earn-my-positions-count');
    if (myPosCard && myPosList) {
      const posItems = [];
      const valList = Array.isArray(wallet.nearStakingPositions) ? wallet.nearStakingPositions : [];
      for (const vp of valList) {
        if (!vp) continue;
        if (vp.type === 'lock_convert') {
          if (!(vp.totalAmount > 0.00001)) continue;
          const sym = vp.symbol || 'oRHEA';
          posItems.push({
            symbol: sym,
            chain: vp.chain || 'near',
            title: vp.title || vp.poolId || 'Rhea oRHEA Convert',
            subtitle: vp.subtitle || t('锁仓兑换中', 'Locked Converting'),
            amountText: `${formatBal(vp.totalAmount, 4)} ${sym}`,
            actionType: (vp.canClaim && Array.isArray(vp.claimableIds) && vp.claimableIds.length > 0) ? 'orhea_claim' : '',
            actionTarget: (vp.canClaim && Array.isArray(vp.claimableIds) && vp.claimableIds.length > 0) ? vp.claimableIds.join(',') : '',
            actionLabel: (vp.canClaim && Array.isArray(vp.claimableIds) && vp.claimableIds.length > 0) ? t('领取 RHEA', 'Claim') : ''
          });
          continue;
        }
        if (vp.type === 'xrhea_unstake') {
          if (!(vp.totalAmount > 0.00001)) continue;
          const sym = vp.symbol || 'RHEA';
          posItems.push({
            symbol: sym,
            chain: 'near',
            title: vp.title || 'Rhea xRHEA Unstake',
            subtitle: vp.subtitle || t('xRHEA 解质押解锁中', 'xRHEA unstaking cooldown'),
            amountText: `${formatBal(vp.totalAmount, 4)} ${sym}`,
            actionType: vp.canWithdraw && vp.requestId ? 'xrhea_claim' : '',
            actionTarget: vp.canWithdraw && vp.requestId ? String(vp.requestId) : '',
            actionLabel: vp.canWithdraw && vp.requestId ? t('领取 RHEA', 'Claim') : ''
          });
          continue;
        }
        if (vp.type === 'near_lst_unstaked') {
          if (!(vp.totalAmount > 0.0001)) continue;
          posItems.push({
            symbol: vp.symbol || 'NEAR',
            chain: 'near',
            title: vp.title || vp.contractId || 'NEAR LST',
            subtitle: vp.subtitle || t('解质押冷却中', 'Unbonding'),
            amountText: `${formatBal(vp.totalAmount, 4)} NEAR`,
            actionType: vp.canWithdraw && vp.contractId ? 'near_lst_withdraw' : '',
            actionTarget: vp.canWithdraw && vp.contractId ? vp.contractId : '',
            actionLabel: vp.canWithdraw && vp.contractId ? t('提取', 'Withdraw') : ''
          });
          continue;
        }
        if (vp.type === 'burrow_supply') {
          if (!(vp.totalAmount > 0.00001)) continue;
          const sym = vp.symbol || 'NEAR';
          posItems.push({
            symbol: sym,
            chain: 'near',
            title: vp.title || `Burrow ${sym}`,
            subtitle: vp.subtitle || t('Burrow 活期存款', 'Burrow Supply Position'),
            amountText: `${formatBal(vp.totalAmount, 4)} ${sym}`,
            actionType: 'burrow_withdraw',
            actionTarget: `${vp.tokenContract || 'wrap.near'}|${vp.decimals || 24}`,
            actionLabel: t('提取', 'Withdraw')
          });
          continue;
        }
        if (!(vp.totalNear > 0)) continue;
        const canWithdrawReady = Boolean(vp.canWithdraw && vp.unstakedNear > 0);
        const statusText = vp.stakedNear > 0 && vp.unstakedNear > 0
          ? `${t('质押中', 'Staked')}: ${formatBal(vp.stakedNear, 4)} · ${canWithdrawReady ? t('可提现', 'Withdrawable') : t('解质押冷却中', 'Unstaking')}: ${formatBal(vp.unstakedNear, 4)}`
          : (vp.stakedNear > 0
              ? `${t('验证节点质押中', 'Validator Staked')}`
              : (canWithdrawReady ? t('已解质押 · 可提取', 'Unstaked · Ready') : t('解质押冷却中 (4 Epochs)', 'Unstaking (Cooldown)')));
        posItems.push({
          symbol: 'NEAR',
          chain: 'near',
          title: vp.poolId,
          subtitle: statusText,
          amountText: `${formatBal(vp.totalNear, 4)} NEAR`,
          actionType: canWithdrawReady ? 'near_withdraw' : (vp.stakedNear > 0 ? 'near_unstake' : ''),
          actionTarget: vp.poolId,
          actionLabel: canWithdrawReady ? t('提取', 'Withdraw') : (vp.stakedNear > 0 ? t('解质押', 'Unstake') : '')
        });
      }
      const nepMap = wallet.nearNep141Balances || {};
      const nearLstContracts = [
        { cid: 'lst.rhealab.near', sym: 'rNEAR', name: 'Rhea Staked NEAR', actionType: 'near_lst_unstake' },
        { cid: 'xtoken.rhealab.near', sym: 'xRHEA', name: 'Staked RHEA', actionType: 'xrhea_unstake' },
        { cid: 'meta-pool.near', sym: 'stNEAR', name: 'Meta Pool stNEAR', actionType: 'near_lst_unstake' },
        { cid: 'linear-protocol.near', sym: 'LiNEAR', name: 'LiNEAR Protocol', actionType: 'near_lst_unstake' },
        { cid: 'v2-nearx.stader-labs.near', sym: 'NearX', name: 'Stader NearX', actionType: 'near_lst_unstake' }
      ];
      for (const lst of nearLstContracts) {
        const b = nepMap[lst.cid]?.formatted;
        if (typeof b === 'number' && b > 0.00001) {
          posItems.push({
            symbol: lst.sym,
            chain: 'near',
            title: lst.name,
            subtitle: lst.cid,
            amountText: `${formatBal(b, 4)} ${lst.sym}`,
            actionType: lst.actionType,
            actionTarget: `${lst.cid}|${b}`,
            actionLabel: t('解质押', 'Unstake')
          });
        }
      }
      const solPosList = Array.isArray(wallet.solStakingPositions) ? wallet.solStakingPositions : [];
      for (const sp of solPosList) {
        if (!sp || !(sp.amount > 0.00001)) continue;
        const isJup = sp.type === 'jupiter_dao';
        const subAddr = String(sp.subtitle || '');
        const shortAddr = subAddr.length > 12 ? `${subAddr.slice(0, 6)}...${subAddr.slice(-4)}` : subAddr;
        let jupActionType = '';
        let jupActionTarget = '';
        let jupActionLabel = '';
        if (isJup) {
          if (sp.canWithdraw) {
            jupActionType = 'jup_dao_withdraw';
            jupActionTarget = 'withdraw';
            jupActionLabel = t('提取', 'Withdraw');
          } else if (sp.isMaxLock) {
            jupActionType = 'jup_dao_toggle';
            jupActionTarget = 'toggle_max_lock';
            jupActionLabel = t('开启解锁', 'Unstake');
          }
        }
        posItems.push({
          symbol: sp.symbol || (isJup ? 'JUP' : 'SOL'),
          chain: sp.chain || 'sol',
          title: sp.title || (isJup ? 'Jupiter DAO (ASR)' : 'Solana Validator'),
          subtitle: isJup
            ? t('Jupiter DAO 锁仓质押', 'Jupiter DAO Locked Stake')
            : (shortAddr ? `${t('验证节点质押', 'Validator Stake')} · ${shortAddr}` : t('Solana 原生质押', 'Solana Native Stake')),
          amountText: `${formatBal(sp.amount, 4)} ${sp.symbol || (isJup ? 'JUP' : 'SOL')}`,
          actionType: jupActionType,
          actionTarget: jupActionTarget,
          actionLabel: jupActionLabel
        });
      }
      const solSpl = wallet.splBalances || {};
      const solLstMints = [
        { poolId: 'jito_sol', mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', sym: 'JitoSOL', name: 'Jito Liquid Staking' },
        { poolId: 'jupiter_sol', mint: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', sym: 'jupSOL', name: 'Jupiter Staked SOL' },
        { poolId: 'marinade_msol', mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', sym: 'mSOL', name: 'Marinade Staked SOL' },
        { poolId: 'sanctum_inf', mint: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', sym: 'INF', name: 'Sanctum Infinity' }
      ];
      for (const sl of solLstMints) {
        const b = solSpl[sl.mint];
        if (typeof b === 'number' && b > 0.00001) {
          posItems.push({
            symbol: sl.sym,
            chain: 'sol',
            title: sl.name,
            subtitle: 'Solana LST',
            amountText: `${formatBal(b, 4)} ${sl.sym}`,
            actionType: 'lst_exit',
            actionTarget: `${sl.poolId}|${b}`,
            actionLabel: t('换回 SOL', 'Exit')
          });
        }
      }
      const readErc20PosBal = (chainKey, contractAddr) => {
        const eb = wallet.erc20Balances;
        if (!eb || !chainKey || !contractAddr) return 0;
        const cKey = String(chainKey).toLowerCase();
        const addrLower = String(contractAddr).toLowerCase();
        const nested = eb[cKey]?.[addrLower];
        if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
        const flat = eb[`${cKey}_${addrLower}`];
        if (typeof flat === 'number' && Number.isFinite(flat)) return flat;
        return 0;
      };
      const seenEvmPoolIds = new Set();
      const liveEvmPositions = Array.isArray(wallet.evmStakingPositions) ? wallet.evmStakingPositions : [];
      for (const ep of liveEvmPositions) {
        if (!ep || !(ep.amount > 0.00001)) continue;
        if (ep.poolId) seenEvmPoolIds.add(ep.poolId);
        let actionType = '';
        let actionTarget = '';
        let actionLabel = '';
        if (ep.type === 'aave_v3' && ep.canWithdraw !== false && ep.poolId) {
          actionType = 'aave_withdraw';
          actionTarget = ep.poolId;
          actionLabel = t('提取', 'Withdraw');
        } else if (ep.type === 'erc4626' && ep.poolId) {
          if (ep.canUnstakeCooldown) {
            actionType = 'erc4626_unstake';
            actionTarget = ep.poolId;
            actionLabel = t('领取', 'Claim');
          } else if (ep.needsCooldown) {
            actionType = 'erc4626_cooldown';
            actionTarget = ep.poolId;
            actionLabel = t('发起冷却', 'Cooldown');
          } else if (ep.canRedeem) {
            actionType = 'erc4626_redeem';
            actionTarget = ep.poolId;
            actionLabel = t('赎回', 'Redeem');
          }
        } else if (ep.type === 'liquid_lst' && ep.canExit && ep.poolId) {
          actionType = 'lst_exit';
          actionTarget = `${ep.poolId}|${ep.amount}`;
          actionLabel = t('换回', 'Exit');
        }
        posItems.push({
          symbol: ep.outSymbol || ep.symbol,
          chain: ep.chain || 'eth',
          title: ep.title || ep.poolId,
          subtitle: ep.subtitle || `${String(ep.chain || 'eth').toUpperCase()} Earn`,
          amountText: `${formatBal(ep.amount, 4)} ${ep.symbol || ep.outSymbol}`,
          actionType,
          actionTarget,
          actionLabel
        });
      }
      const evmStakingPositions = [
        { chain: 'eth', contract: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', sym: 'stETH', title: 'Lido Staked ETH', subtitle: 'Ethereum · Lido', poolId: 'lido_steth', actionType: 'lst_exit' },
        { chain: 'eth', contract: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', sym: 'sUSDe', title: 'Ethena Staked USDe', subtitle: 'Ethereum · Ethena', poolId: 'ethena_susde', actionType: 'erc4626_cooldown' },
        { chain: 'eth', contract: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', sym: 'aEthUSDC', title: 'Aave V3 Ethereum USDC', subtitle: 'Ethereum · Aave V3', poolId: 'aave_eth_usdc', actionType: 'aave_withdraw' },
        { chain: 'eth', contract: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', sym: 'aEthWETH', title: 'Aave V3 Ethereum ETH', subtitle: 'Ethereum · Aave V3', poolId: 'aave_eth_weth', actionType: 'aave_withdraw' },
        { chain: 'base', contract: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', sym: 'aBasUSDC', title: 'Aave V3 Base USDC', subtitle: 'Base · Aave V3', poolId: 'aave_base_usdc', actionType: 'aave_withdraw' },
        { chain: 'arb', contract: '0x724dc807b04555b71ed48a6896b6F41593b8C637', sym: 'aArbUSDCn', title: 'Aave V3 Arbitrum USDC', subtitle: 'Arbitrum · Aave V3', poolId: 'aave_arb_usdc', actionType: 'aave_withdraw' },
        { chain: 'arc', contract: '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', sym: 'steakUSDC', title: 'Steakhouse Prime USDC', subtitle: 'Arc · Morpho', poolId: 'arc_steak_usdc', actionType: 'erc4626_redeem' },
        { chain: 'hype', contract: '0xfD739d4e423301CE9385c1fb8850539D657C296D', sym: 'kHYPE', title: 'Kinetiq Staked HYPE', subtitle: 'HyperEVM · Kinetiq', poolId: 'hyper_khype', actionType: 'lst_exit' }
      ];
      for (const ep of evmStakingPositions) {
        if (ep.poolId && seenEvmPoolIds.has(ep.poolId)) continue;
        const b = readErc20PosBal(ep.chain, ep.contract);
        if (typeof b === 'number' && b > 0.00001) {
          const isExit = ep.actionType === 'lst_exit';
          posItems.push({
            symbol: ep.sym,
            chain: ep.chain,
            title: ep.title,
            subtitle: ep.subtitle,
            amountText: `${formatBal(b, 4)} ${ep.sym}`,
            actionType: ep.actionType || '',
            actionTarget: isExit ? `${ep.poolId}|${b}` : (ep.poolId || ''),
            actionLabel: isExit
              ? t('换回', 'Exit')
              : (ep.actionType === 'erc4626_cooldown'
                  ? t('发起冷却', 'Cooldown')
                  : (ep.actionType === 'erc4626_redeem' ? t('赎回', 'Redeem') : t('提取', 'Withdraw')))
          });
        }
      }
      if (posItems.length > 0) {
        myPosCard.classList.remove('hidden');
        if (myPosCount) myPosCount.textContent = String(posItems.length);
        myPosList.innerHTML = posItems.map((it) => `
          <div class="flex items-center justify-between gap-2" style="padding:6px 8px;border-radius:10px;background:rgba(255,255,255,0.03);">
            <div class="flex items-center gap-2">
              ${tokens.renderTokenIconWithBadge({ symbol: it.symbol, blockchain: it.chain }, 28, true)}
              <div class="flex flex-col">
                <span class="mono" style="font-weight:700;font-size:12.5px;color:#fff;">${escapeHtml(it.title)}</span>
                <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(it.subtitle)}</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="mono text-emerald" style="font-weight:700;font-size:12.5px;">${escapeHtml(it.amountText)}</span>
              ${it.actionType && it.actionTarget ? `<button type="button" class="mini-action-btn" style="padding:4px 8px;font-size:11px;" data-action="earn-pos-action" data-type="${escapeHtml(it.actionType)}" data-target="${escapeHtml(it.actionTarget)}">${escapeHtml(it.actionLabel)}</button>` : ''}
            </div>
          </div>
        `).join('');
      } else {
        myPosCard.classList.add('hidden');
        myPosList.innerHTML = '';
      }
    }

    const listEl = $('staking-pools-list');
    if (listEl) {
      if (filteredPools.length === 0) {
        listEl.innerHTML = `<div class="ios-glass-card text-center" style="font-size:12.5px;color:var(--text-secondary);">${escapeHtml(t('未找到匹配的质押池或合约', 'No matching staking pools found'))}</div>`;
      } else {
        listEl.innerHTML = filteredPools.map((p) => {
          const selected = st.staking.selectedPoolId === p.id;
          const apyStr = formatPoolApyText(p);
          const avail = getEarnPoolAvailableBalance(wallet, p);
          const tvlStr = formatPoolTvlDisplay(p);
          const stakersStr = typeof p.stakersCount === 'number' && Number.isFinite(p.stakersCount) && p.stakersCount > 0
            ? p.stakersCount.toLocaleString('en-US')
            : '--';
          const catMeta = getPoolCategoryMeta(p);
          return `
            <div class="staking-pool-card ${selected ? 'selected' : ''}" data-action="select-staking-pool" data-pool-id="${escapeHtml(p.id)}">
              <div class="flex items-center gap-3">
                ${tokens.renderTokenIconWithBadge({ symbol: p.outSymbol, blockchain: p.chain, logoURI: getPoolIconUrl(p) }, 36, true)}
                <div class="flex flex-col">
                  <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                    <span style="font-weight:700;color:#fff;">${escapeHtml(p.name)}</span>
                    <span class="pool-cat-badge ${catMeta.cls}">${escapeHtml(catMeta.label)}</span>
                  </div>
                  <span style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(p.inSymbol)} ➔ ${escapeHtml(p.outSymbol)} · ${escapeHtml(p.chainLabel)}</span>
                  <span style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">🔒 ${escapeHtml(t('总质押', 'TVL'))}: ${escapeHtml(tvlStr)} · 👥 ${escapeHtml(t('人数', 'Stakers'))}: ${escapeHtml(stakersStr)}</span>
                </div>
              </div>
              <div class="flex flex-col" style="text-align:right;flex-shrink:0;">
                <span class="text-emerald" style="font-weight:800;font-size:14px;">${escapeHtml(apyStr)}</span>
                <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(formatBal(avail, 4))} ${escapeHtml(p.inSymbol)}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const activePool = (contracts.findStakingPool && contracts.findStakingPool(st.staking.selectedPoolId))
      || allPools.find((p) => p.id === st.staking.selectedPoolId)
      || filteredPools[0]
      || allPools[0];
    if (!activePool) return;
    if (st.staking.selectedPoolId !== activePool.id) st.staking.selectedPoolId = activePool.id;

    const avail = getEarnPoolAvailableBalance(wallet, activePool);
    if ($('earn-selected-title')) $('earn-selected-title').textContent = `${activePool.name} (${activePool.inSymbol} ➔ ${activePool.outSymbol})`;
    if ($('earn-avail-balance')) $('earn-avail-balance').textContent = `${formatBal(avail, 5)} ${activePool.inSymbol}`;
    if ($('earn-in-symbol')) $('earn-in-symbol').textContent = activePool.inSymbol;
    if ($('earn-live-apy')) $('earn-live-apy').textContent = formatPoolApyText(activePool);
    if ($('earn-tvl-val')) $('earn-tvl-val').textContent = formatPoolTvlDisplay(activePool);
    if ($('earn-stakers-val')) {
      $('earn-stakers-val').textContent = typeof activePool.stakersCount === 'number' && Number.isFinite(activePool.stakersCount) && activePool.stakersCount > 0
        ? activePool.stakersCount.toLocaleString('en-US')
        : '--';
    }

    const lockRow = $('earn-lock-row');
    const lockTiersEl = $('earn-lock-tiers');
    if (lockRow && lockTiersEl) {
      if (activePool.isLockConvert) {
        lockRow.classList.remove('hidden');
        const tiers = Array.isArray(activePool.lockTiers) ? activePool.lockTiers : [];
        if (tiers.length > 0) {
          const curDays = Number(st.staking.lockDays || 181);
          lockTiersEl.innerHTML = tiers.map((tier) => `
            <button type="button" class="filter-pill ${Number(tier.days) === curDays ? 'active' : ''}" data-action="select-earn-lock" data-days="${Number(tier.days)}">${escapeHtml(formatLockTierLabel(tier))}</button>
          `).join('');
        } else {
          lockTiersEl.innerHTML = `<span style="font-size:11.5px;color:var(--text-muted);">--</span>`;
        }
      } else {
        lockRow.classList.add('hidden');
        lockTiersEl.innerHTML = '';
      }
    }

    const effectiveRate = getEffectivePoolRate(activePool);
    if ($('earn-live-rate')) {
      $('earn-live-rate').textContent = typeof effectiveRate === 'number' && Number.isFinite(effectiveRate)
        ? `1 ${activePool.inSymbol} = ${effectiveRate.toFixed(4)} ${activePool.outSymbol}`
        : '--';
    }
    updateEarnEstimatedOut();
  }

  function setEarnPoolFilter(filterKey) {
    const st = getState();
    st.staking.filter = String(filterKey || 'featured').toLowerCase();
    st.staking.search = '';
    if ($('earn-pool-search')) $('earn-pool-search').value = '';
    renderEarnView();
  }

  function handleEarnPoolSearch(query) {
    getState().staking.search = String(query || '');
    renderEarnView();
  }

  function selectEarnLockTier(days) {
    getState().staking.lockDays = Number(days) || 181;
    renderEarnView();
  }

  function selectStakingPool(poolId) {
    getState().staking.selectedPoolId = poolId;
    const rec = $('earn-tx-receipt');
    if (rec) {
      rec.classList.add('hidden');
      rec.innerHTML = '';
    }
    renderEarnView();
  }

  function setEarnMaxAmount() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const pools = st.staking.pools || contracts.STAKING_POOLS;
    const activePool = (contracts.findStakingPool && contracts.findStakingPool(st.staking.selectedPoolId))
      || pools.find((p) => p.id === st.staking.selectedPoolId)
      || pools[0];
    if (!activePool) return;
    const avail = getEarnPoolAvailableBalance(wallet, activePool);
    if (avail === null || avail <= 0) return;
    const needsGasReserve = !activePool.isTokenStake || Boolean(activePool.isNativeWrapSupply);
    const reserve = needsGasReserve
      ? (activePool.isBurrowSupply ? 0.12 : (activePool.chain === 'near' ? 0.05 : activePool.chain === 'sol' ? 0.002 : activePool.chain === 'arc' ? 0.02 : 0.002))
      : 0;
    const maxAmt = Math.max(0, avail - reserve);
    if ($('earn-amount-in')) $('earn-amount-in').value = maxAmt > 0 ? Number(maxAmt.toFixed(6)).toString() : '0';
    updateEarnEstimatedOut();
  }

  function updateEarnEstimatedOut() {
    const st = getState();
    const contracts = getContracts();
    const pools = st.staking.pools || contracts.STAKING_POOLS;
    const activePool = (contracts.findStakingPool && contracts.findStakingPool(st.staking.selectedPoolId))
      || pools.find((p) => p.id === st.staking.selectedPoolId)
      || pools[0];
    const amt = Number($('earn-amount-in')?.value || 0);
    st.staking.amountIn = $('earn-amount-in')?.value || '';
    const outEl = $('earn-est-out');
    if (!outEl || !activePool) return;
    const effectiveRate = getEffectivePoolRate(activePool);
    if (Number.isFinite(amt) && amt > 0 && typeof effectiveRate === 'number' && Number.isFinite(effectiveRate)) {
      outEl.textContent = `${formatBal(amt * effectiveRate, 5)} ${activePool.outSymbol}`;
    } else {
      outEl.textContent = '--';
    }
  }

  async function executeSelectedStake() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const pools = st.staking.pools || contracts.STAKING_POOLS;
    const pool = (contracts.findStakingPool && contracts.findStakingPool(st.staking.selectedPoolId))
      || pools.find((p) => p.id === st.staking.selectedPoolId)
      || pools[0];
    const amt = Number($('earn-amount-in')?.value || 0);
    const avail = getEarnPoolAvailableBalance(wallet, pool);

    try {
      if (pool.isNativeWrapSupply) {
        contracts.validateSufficientChainBalance({
          wallet,
          chain: pool.chain,
          tokenSymbol: pool.inSymbol,
          amount: amt,
          isNative: false,
          tokenBalance: avail
        });
        const wrappedBal = contracts.resolveWalletPoolTokenBalance
          ? (contracts.resolveWalletPoolTokenBalance(wallet, { ...pool, useNativeOrPrecompile: false }) || 0)
          : 0;
        const nativeShortfall = Math.max(0, amt - Math.max(0, Number(wrappedBal) || 0));
        const gasReserve = pool.chain === 'near' ? 0.12 : 0.002;
        const nativeAvail = Number(wallet.nativeBalances?.[pool.chain] ?? (pool.chain === 'near' ? wallet.nearBalance : 0) ?? 0);
        if (nativeAvail < nativeShortfall + gasReserve) {
          throw new Error(
            t(
              `${pool.chainLabel} 原生 Gas 余额不足 (可用: ${nativeAvail.toFixed(4)}，需预留 ${gasReserve})`,
              `Insufficient native gas on ${pool.chainLabel} (Available: ${nativeAvail.toFixed(4)}, reserve ${gasReserve})`
            )
          );
        }
      } else {
        contracts.validateSufficientChainBalance({
          wallet,
          chain: pool.chain,
          tokenSymbol: pool.inSymbol,
          amount: amt,
          isNative: !pool.isTokenStake,
          tokenBalance: pool.isTokenStake ? avail : null
        });
      }
    } catch (err) {
      showToast(err.message);
      return;
    }

    if (!(await verifySecurityAuthAsync(wallet, `${t('确认质押', 'Confirm stake')} ${amt} ${pool.inSymbol}`))) return;

    const btn = $('btn-execute-stake');
    if (btn) btn.disabled = true;
    try {
      if (pool.chain !== 'near' && pool.chain !== 'sol') {
        await ensureEthersLoaded();
      }
      const res = await contracts.executeOnChainStaking({
        wallet,
        poolId: pool.id,
        amount: amt,
        lockDays: st.staking.lockDays || 181,
        tokenBalance: pool.isTokenStake ? avail : null
      });
      const rec = $('earn-tx-receipt');
      if (rec) {
        rec.classList.remove('hidden');
        rec.innerHTML = `
          <div class="meta-row"><span class="meta-key">TxHash</span><span class="mono text-emerald">${escapeHtml(shortenAddr(res.txHash, 10, 8))}</span></div>
          ${res.explorerUrl && isValidHttpsUrl(res.explorerUrl) ? `<a href="${escapeHtml(res.explorerUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan" style="font-size:11.5px;">${t('在区块浏览器查看 ↗', 'View on Explorer ↗')}</a>` : ''}
        `;
      }
      recordWalletActivity(wallet, {
        type: 'stake',
        symbol: pool.inSymbol,
        toSymbol: pool.outSymbol,
        chain: pool.chain,
        amount: amt,
        txHash: res.txHash,
        title: `${pool.name} (${pool.inSymbol} ➔ ${pool.outSymbol})`
      });
      showToast(`✅ ${pool.name} ${t('质押成功', 'Staked')}`);
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(err && err.message ? err.message : t('质押失败', 'Staking failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function executeEarnPositionAction(actionType, actionTarget) {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (!(await verifySecurityAuthAsync(wallet, t('确认质押赎回操作', 'Confirm Stake Redemption')))) return;

    try {
      showToast(t('正在签名并广播赎回交易...', 'Signing & broadcasting redemption...'));
      let res = null;
      if (actionType === 'near_unstake') {
        res = await contracts.unstakeFromNearValidator({ wallet, validatorId: actionTarget });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: 0,
          txHash: res.txHash,
          title: `${t('解质押', 'Unstake')} · ${actionTarget}`
        });
        showToast(`✅ ${t('已提交解质押 (冷却约 4 Epochs)', 'Unstake submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'near_withdraw') {
        res = await contracts.withdrawFromNearValidator({ wallet, validatorId: actionTarget });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: 0,
          txHash: res.txHash,
          title: `${t('提取质押', 'Withdraw')} · ${actionTarget}`
        });
        showToast(`✅ ${t('已提取至 NEAR 余额', 'Withdrawn to NEAR balance')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'aave_withdraw') {
        await ensureEthersLoaded();
        const poolCfg = contracts.findStakingPool ? contracts.findStakingPool(actionTarget) : null;
        res = await contracts.withdrawFromAaveV3({ wallet, poolId: actionTarget, amount: 'max' });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.inSymbol || 'USDC',
          chain: poolCfg?.chain || 'eth',
          amount: 0,
          txHash: res.txHash,
          title: `${t('Aave V3 全额提取', 'Aave V3 Withdraw')} · ${actionTarget}`
        });
        showToast(`✅ ${t('Aave 本息提取已广播', 'Aave V3 withdraw broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'burrow_withdraw') {
        const [tokContract, decStr] = String(actionTarget || '').split('|');
        res = await contracts.withdrawFromBurrow({ wallet, tokenContract: tokContract, amount: 'max', decimals: Number(decStr) || 24 });
        const sym = tokContract === 'wrap.near'
          ? 'NEAR'
          : (tokContract.includes('usdt') ? 'USDT' : (tokContract.includes('17208628') ? 'USDC' : 'NEAR'));
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: sym,
          chain: 'near',
          amount: 0,
          txHash: res.txHash,
          title: `${t('Burrow 全额提取', 'Burrow Withdraw')} · ${sym}`
        });
        showToast(`✅ ${t('Burrow 存款提取已广播', 'Burrow withdraw broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'orhea_claim') {
        const ids = String(actionTarget || '').split(',').map((s) => s.trim()).filter(Boolean);
        res = await contracts.claimRheaOrheaConversion({ wallet, conversionIds: ids });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'RHEA',
          chain: 'near',
          amount: 0,
          txHash: res.txHash,
          title: t('领取 oRHEA 到期兑换', 'Claim Matured RHEA')
        });
        showToast(`✅ ${t('RHEA 领取交易已广播', 'RHEA claim broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'xrhea_unstake') {
        const [cid, amtStr] = String(actionTarget || '').split('|');
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: cid || 'xtoken.rhealab.near',
          amount: Number(amtStr),
          action: 'unstake'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'RHEA',
          chain: 'near',
          amount: Number(amtStr) || 0,
          txHash: res.txHash,
          title: t('xRHEA 解质押', 'xRHEA Unstake')
        });
        showToast(`✅ ${t('已提交 xRHEA 解质押请求', 'xRHEA unstake requested')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'xrhea_claim') {
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: 'xtoken.rhealab.near',
          action: 'claim_unstake',
          requestId: actionTarget
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'RHEA',
          chain: 'near',
          amount: 0,
          txHash: res.txHash,
          title: t('领取已解锁 RHEA', 'Claim xRHEA Unstake')
        });
        showToast(`✅ ${t('RHEA 领取交易已广播', 'RHEA claim broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'near_lst_unstake') {
        const [cid, amtStr] = String(actionTarget || '').split('|');
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: cid,
          amount: Number(amtStr),
          action: 'unstake'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: Number(amtStr) || 0,
          txHash: res.txHash,
          title: `${t('解质押', 'Unstake')} · ${cid}`
        });
        showToast(`✅ ${t('已提交 NEAR LST 解质押 (冷却约 2-3 天)', 'NEAR LST unstake submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'near_lst_withdraw') {
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: actionTarget,
          action: 'withdraw_all'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: 0,
          txHash: res.txHash,
          title: `${t('提取已解质押 NEAR', 'Withdraw NEAR LST')} · ${actionTarget}`
        });
        showToast(`✅ ${t('NEAR 提取交易已广播', 'NEAR withdraw broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'jup_dao_toggle' || actionType === 'jup_dao_withdraw') {
        res = await contracts.unstakeJupiterDao({
          wallet,
          action: actionType === 'jup_dao_toggle' ? 'toggle_max_lock' : 'withdraw'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'JUP',
          chain: 'sol',
          amount: 0,
          txHash: res.txHash,
          title: actionType === 'jup_dao_toggle' ? t('开启 JUP 30天解锁', 'Start JUP 30d Unlock') : t('提取已解锁 JUP', 'Withdraw JUP')
        });
        showToast(
          actionType === 'jup_dao_toggle'
            ? `✅ ${t('已关闭永久锁仓，30天解锁倒计时开始', 'JUP 30d unlock started')}: ${shortenAddr(res.txHash)}`
            : `✅ ${t('JUP 提取交易已广播', 'JUP withdraw broadcast')}: ${shortenAddr(res.txHash)}`
        );
      } else if (actionType === 'lst_exit') {
        const [poolId, amtStr] = String(actionTarget || '').split('|');
        const poolCfg = contracts.findStakingPool ? contracts.findStakingPool(poolId) : null;
        if (poolCfg && poolCfg.chain !== 'near' && poolCfg.chain !== 'sol') {
          await ensureEthersLoaded();
        }
        res = await contracts.exitLiquidStakingToken({ wallet, poolId, amount: Number(amtStr) });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.outSymbol || 'LST',
          toSymbol: poolCfg?.inSymbol || '',
          chain: poolCfg?.chain || 'sol',
          amount: Number(amtStr) || 0,
          txHash: res.txHash,
          title: `${t('流动性质押换回', 'Exit LST')} · ${poolCfg?.name || poolId}`
        });
        showToast(`✅ ${t('LST 换回交易已广播', 'LST exit swap broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'erc4626_redeem' || actionType === 'erc4626_cooldown' || actionType === 'erc4626_unstake') {
        await ensureEthersLoaded();
        const poolCfg = contracts.findStakingPool ? contracts.findStakingPool(actionTarget) : null;
        const mode = actionType === 'erc4626_cooldown' ? 'cooldown' : (actionType === 'erc4626_unstake' ? 'unstake' : 'auto');
        res = await contracts.redeemErc4626Vault({ wallet, poolId: actionTarget, shares: 'max', mode });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.inSymbol || 'USDC',
          chain: poolCfg?.chain || 'eth',
          amount: 0,
          txHash: res.txHash,
          title: `${poolCfg?.name || actionTarget} (${mode})`
        });
        showToast(
          actionType === 'erc4626_cooldown'
            ? `✅ ${t('已发起 sUSDe 冷却解锁期', 'sUSDe cooldown initiated')}: ${shortenAddr(res.txHash)}`
            : `✅ ${t('金库赎回交易已广播', 'Vault redeem broadcast')}: ${shortenAddr(res.txHash)}`
        );
      }
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(err && err.message ? err.message : t('赎回失败', 'Redemption failed'));
    }
  }

  // ==================== Hub: .near Domain, MPC v1.signer, Contacts, WC ====================

  // ==================== NEAR Access Keys & Key Rotation Sheet ====================

  function generateRotateMnemonicInSheet() {
    const crypto = getCrypto();
    if (!crypto || typeof crypto.generateMnemonic !== 'function') return;
    const words = crypto.generateMnemonic(12);
    const phrase = Array.isArray(words) ? words.join(' ') : String(words || '').trim();
    if ($('near-keys-rotate-mnemonic')) {
      $('near-keys-rotate-mnemonic').value = phrase;
    }
  }

  function renderNearAccountSummary(wallet) {
    if (!wallet) return;
    const accountId = wallet.nearNamedAccount || wallet.nearAddress || '';
    if ($('near-keys-account-id')) {
      $('near-keys-account-id').textContent = wallet.nearNamedAccount || shortenAddr(accountId, 12, 8) || '--';
    }
    const nearBal = wallet.nativeBalances && typeof wallet.nativeBalances.near === 'number'
      ? wallet.nativeBalances.near
      : (typeof wallet.nearBalance === 'number' ? wallet.nearBalance : null);
    if ($('near-acct-balance-val')) {
      $('near-acct-balance-val').textContent = nearBal !== null ? `${formatBal(nearBal, 5)} NEAR` : '--';
    }
    const guideEl = $('near-acct-unactivated-guide');
    if (guideEl) {
      guideEl.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
    }
  }

  async function openNearAccountSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    renderNearAccountSummary(wallet);
    if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
    if ($('hub-near-bind-auth-input')) $('hub-near-bind-auth-input').value = '';
    $('near-bind-drawer')?.classList.add('hidden');
    $('near-keys-rotate-card')?.classList.add('hidden');
    const availEl = $('near-domain-avail-status');
    if (availEl) {
      availEl.textContent = '';
      availEl.classList.add('hidden');
    }
    openSheet('sheet-near-account');
    await refreshNearAccessKeysSheet();
  }

  async function openNearAccessKeysSheet() {
    return openNearAccountSheet();
  }

  async function refreshNearAccessKeysSheet() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts) return;
    const creds = contracts.getWalletNearSignerCredentials(wallet);
    const accountId = creds.accountId;
    renderNearAccountSummary(wallet);

    const rotateCard = $('near-keys-rotate-card');
    if (rotateCard) rotateCard.classList.add('hidden');
    const statusBadge = $('near-acct-status-badge');
    const guideEl = $('near-acct-unactivated-guide');
    const listEl = $('near-keys-list');
    if (listEl) {
      listEl.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px;">${t('正在查询链上密钥...', 'Loading on-chain keys...')}</div>`;
    }

    try {
      const res = await contracts.fetchNearAccessKeysAsync(accountId);
      if (!res.exists || res.keys.length === 0) {
        if (rotateCard) rotateCard.classList.add('hidden');
        if (guideEl) guideEl.classList.remove('hidden');
        if (statusBadge) {
          statusBadge.textContent = t('未激活', 'Unactivated');
          statusBadge.className = 'badge badge-cyan';
        }
        if (listEl) {
          listEl.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px;">${t('账户尚未在链上激活（首次收款或激活后可见密钥）', 'Account not yet active on-chain')}</div>`;
        }
        return;
      }

      if (rotateCard) rotateCard.classList.remove('hidden');
      if (guideEl) guideEl.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
      if (statusBadge) {
        statusBadge.textContent = wallet.nearNamedAccount ? t('已激活 .near', 'Active .near') : t('已激活隐式账户', 'Active Implicit');
        statusBadge.className = 'badge badge-emerald';
      }
      if (!listEl) return;

      const fullCount = res.keys.filter((k) => k.access_key && k.access_key.permission === 'FullAccess').length;
      listEl.innerHTML = res.keys.map((k) => {
        const pk = String(k.public_key || '');
        const isFull = Boolean(k.access_key && k.access_key.permission === 'FullAccess');
        const isCurrent = pk === creds.publicKeyStr || (creds.publicKeyHandleStr && pk === creds.publicKeyHandleStr);
        const canDelete = !isFull || fullCount > 1;
        return `
          <div class="ios-glass-card flex items-center justify-between gap-2" style="padding:10px 12px;">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                <span class="badge ${isFull ? 'badge-emerald' : 'badge-cyan'}">${isFull ? 'FullAccess' : 'dApp Key'}</span>
                ${isCurrent ? `<span class="ca-badge">${t('当前使用', 'In Use')}</span>` : ''}
              </div>
              <div class="mono" style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;margin-top:4px;">${escapeHtml(shortenAddr(pk, 14, 8))}</div>
            </div>
            ${canDelete
              ? `<button type="button" class="btn-danger" data-action="delete-near-key" data-pk="${escapeHtml(pk)}">${t('删除', 'Delete')}</button>`
              : ''}
          </div>
        `;
      }).join('');
    } catch (e) {
      if (rotateCard) rotateCard.classList.add('hidden');
      if (listEl) {
        listEl.innerHTML = `<div style="font-size:12px;color:var(--rose-alert);padding:8px;">${escapeHtml(e && e.message ? e.message : t('查询失败', 'Query failed'))}</div>`;
      }
    }
  }

  async function deleteNearAccessKeyFromSheet(targetPublicKeyStr) {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts) return;
    if (!(await verifySecurityAuthAsync(wallet, t('删除 NEAR 访问密钥', 'Delete NEAR Access Key')))) return;
    try {
      showToast(t('正在广播 DeleteKey 交易...', 'Broadcasting DeleteKey...'));
      const res = await contracts.deleteNearAccessKeyAsync({ wallet, targetPublicKeyStr });
      showToast(`✅ ${t('密钥已删除', 'Access Key deleted')}: ${shortenAddr(res.txHash, 8, 6)}`);
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(e && e.message ? e.message : t('删除失败', 'Delete failed'));
    }
  }

  async function addNearMnemonicKeyOnlyFromSheet() {
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts || !crypto) return;
    const rawPhrase = ($('near-keys-rotate-mnemonic')?.value || '').trim();
    const check = crypto.validateMnemonic(rawPhrase);
    if (!check.valid) {
      showToast(check.error || t('请先生成或输入有效助记词', 'Generate or enter a valid mnemonic'));
      return;
    }
    if (!(await verifySecurityAuthAsync(wallet, t('为 NEAR 账户添加新密钥', 'Add New Key to NEAR Account')))) return;

    try {
      showToast(t('正在执行 AddKey 添加密钥...', 'Broadcasting AddKey...'));
      const res = await contracts.rotateNearAccountKeyAsync({
        wallet,
        newMnemonic: check.words.join(' '),
        upgradeToMlDsa65: false,
        deleteOldKey: false
      });
      showToast(`✅ ${t('已添加新密钥（旧密钥保留有效）', 'New key added (old key kept)')}: ${shortenAddr(res.addTxHash, 8, 6)}`);
      if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(e && e.message ? e.message : t('添加密钥失败', 'AddKey failed'));
    }
  }

  async function confirmRotateNearAccountKey() {
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts || !crypto) return;
    const rawPhrase = ($('near-keys-rotate-mnemonic')?.value || '').trim();
    const check = crypto.validateMnemonic(rawPhrase);
    if (!check.valid) {
      showToast(check.error || t('请先生成或输入有效助记词', 'Generate or enter a valid mnemonic'));
      return;
    }
    if (!(await verifySecurityAuthAsync(wallet, t('更换 NEAR 控制助记词', 'Rotate NEAR Control Mnemonic')))) return;

    try {
      showToast(t('正在执行 AddKey + DeleteKey...', 'Rotating key on-chain...'));
      const res = await contracts.rotateNearAccountKeyAsync({
        wallet,
        newMnemonic: check.words.join(' '),
        upgradeToMlDsa65: false,
        deleteOldKey: true
      });
      wallet.mnemonic = res.newDerived.mnemonic;
      wallet.accountType = 'standard';
      wallet.nearPublicKey = res.newDerived.nearPublicKey;
      wallet.nearPrivateKey = res.newDerived.nearPrivateKey;
      wallet.nearPrivateSeedHex = res.newDerived.nearPrivateSeedHex;
      st.saveWallets();
      showToast(`✅ ${t('助记词与链上密钥已更换', 'Mnemonic & on-chain key rotated')}: ${shortenAddr(res.deleteTxHash || res.addTxHash, 8, 6)}`);
      if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
      renderAll();
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(e && e.message ? e.message : t('更换密钥失败', 'Key rotation failed'));
    }
  }

  function openWalletAddressesSheet() {
    renderHubView();
    openSheet('sheet-wallet-addresses');
  }

  function toggleNearBindDrawer() {
    $('near-bind-drawer')?.classList.toggle('hidden');
  }

  async function checkNearDomainAvailabilityUI() {
    const contracts = getContracts();
    const statusEl = $('near-domain-avail-status');
    const domain = ($('hub-near-domain-input')?.value || '').trim().toLowerCase();
    if (!contracts || typeof contracts.checkNearAccountAvailability !== 'function') return;
    if (statusEl) {
      statusEl.classList.remove('hidden');
      statusEl.style.color = 'var(--text-secondary)';
      statusEl.textContent = t('正在检测域名...', 'Checking availability...');
    }
    try {
      const res = await contracts.checkNearAccountAvailability(domain);
      if (statusEl) {
        statusEl.classList.remove('hidden');
        if (res.available) {
          statusEl.style.color = 'var(--near-emerald)';
          statusEl.textContent = `✓ ${res.accountId} ${t('可注册', 'is available')}`;
        } else {
          statusEl.style.color = 'var(--rose-alert)';
          statusEl.textContent = `✕ ${res.accountId} ${t('已被占用（若为您本人账号可点击下方绑定）', 'is already taken (bind below if yours)')}`;
        }
      }
    } catch (e) {
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.style.color = 'var(--rose-alert)';
        statusEl.textContent = e && e.message ? e.message : t('检测失败', 'Check failed');
      }
    }
  }

  function renderHubView() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (typeof st.recomputeWalletMpcAddresses === 'function') {
      st.recomputeWalletMpcAddresses(wallet);
    }

    const nearDisplay = wallet.nearNamedAccount || shortenAddr(wallet.nearAddress, 10, 8) || '--';
    if ($('hub-identity-name')) $('hub-identity-name').textContent = wallet.name || 'Nexus Wallet';
    if ($('hub-identity-near-id')) $('hub-identity-near-id').textContent = nearDisplay;
    const nearStatusBadge = $('hub-near-status-badge');
    if (nearStatusBadge) {
      nearStatusBadge.textContent = wallet.nearNamedAccount ? t('已命名 .near', 'Named .near') : t('隐式账户', 'Implicit');
      nearStatusBadge.className = wallet.nearNamedAccount ? 'badge badge-emerald' : 'badge badge-cyan';
    }
    if ($('hub-near-menu-sub')) {
      $('hub-near-menu-sub').textContent = wallet.nearNamedAccount
        ? wallet.nearNamedAccount
        : t('注册 .near / 链上密钥管理', 'Register .near / Manage Keys');
    }

    const wcCount = st.wc.client ? Object.keys(st.wc.client.getActiveSessions() || {}).length : 0;
    const hubWcBadge = $('hub-wc-count-badge');
    if (hubWcBadge) {
      hubWcBadge.textContent = String(wcCount);
      hubWcBadge.classList.toggle('hidden', wcCount === 0);
    }

    if ($('hub-near-current-id')) {
      $('hub-near-current-id').textContent = wallet.nearNamedAccount || wallet.nearAddress || '--';
    }
    if ($('hub-mpc-evm-address')) {
      $('hub-mpc-evm-address').textContent = wallet.mpcEvmAddress || wallet.evmAddress || '--';
    }

    const addrList = $('hub-addresses-list');
    if (addrList) {
      const items = [
        { k: t('NEAR 主账户', 'NEAR Master Account'), v: wallet.nearNamedAccount || wallet.nearAddress },
        { k: 'EVM (ETH / Base / ARB / OP / POL / BSC / Arc)', v: wallet.mpcEvmAddress || wallet.evmAddress },
        { k: 'Solana (SOL)', v: wallet.solAddress },
        { k: t('Bitcoin (BTC 主网)', 'Bitcoin (BTC Mainnet)'), v: wallet.btcAddress },
        { k: t('Pearl (PRL 主网)', 'Pearl (PRL Mainnet)'), v: wallet.address }
      ];
      addrList.innerHTML = items.map((x) => `
        <div class="meta-row hub-addr-row">
          <span class="meta-key">${escapeHtml(x.k)}</span>
          <div class="flex items-center gap-2" style="flex-shrink:0;">
            <span class="mono" style="font-size:11px;">${escapeHtml(shortenAddr(x.v, 8, 6))}</span>
            <button type="button" class="btn-ghost-sm hub-addr-copy-btn" data-action="copy-text" data-val="${escapeHtml(x.v || '')}" data-label="${escapeHtml(x.k)}">${t('复制', 'Copy')}</button>
          </div>
        </div>
      `).join('');
    }
    renderHubBiometricCardAsync();
  }

  async function renderHubBiometricCardAsync() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet || !$('hub-security-bio-card')) return;
    const profile = _cachedBioProfile || await detectDeviceBiometricProfileAsync();
    const statusBadge = $('hub-bio-status-badge');
    if (statusBadge) {
      const parts = [];
      if (profile && profile.supported) {
        parts.push(profile.platform === 'ios' ? 'Face ID / Touch ID' : t('生物识别', 'Biometrics'));
      }
      if (getNativeSecurityPlugin()) parts.push(t('锁屏密码', 'Passcode'));
      if (typeof st.hasWalletPin === 'function' ? st.hasWalletPin(wallet) : Boolean(wallet.pin || wallet.pinHash)) parts.push('PIN');
      const pinBtn = $('btn-hub-set-pin');
      if (pinBtn) pinBtn.classList.remove('hidden');
      statusBadge.textContent = parts.length ? parts.join(' + ') : t('未设置', 'Not set');
      statusBadge.className = parts.length ? 'badge badge-emerald' : 'badge badge-cyan';
    }
  }
  async function testBiometricAuthNow() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const profile = await detectDeviceBiometricProfileAsync();
    const res = await requestBiometricAuth(`${t('验证设备身份', 'Verify device identity')} (${profile.deviceModel})`, wallet);
    if (res.ok) {
      await renderHubBiometricCardAsync();
      showToast(`✅ ${t('生物识别验证通过', 'Biometric check passed')} (${res.biometryType || res.method})`);
      return;
    }
    if (res.cancelled) {
      showToast(t('已取消验证', 'Verification cancelled'));
      return;
    }
    showToast(res.error || t('当前环境不支持系统生物识别，请使用交易 PIN', 'System biometrics unavailable; use PIN'));
  }

  function openSetWalletPinPrompt() {
    openPinSheet();
  }

  async function registerNearDomainFromHub() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const domain = ($('hub-near-domain-input')?.value || '').trim().toLowerCase();
    if (!domain) {
      showToast(t('请输入要注册的 .near 域名', 'Enter .near domain'));
      return;
    }
    if (!(await verifySecurityAuthAsync(wallet, `${t('注册域名', 'Register domain')} ${domain}`))) return;
    try {
      const res = await contracts.registerNearNamedAccountOnChain({
        wallet,
        newAccountId: domain
      });
      wallet.nearNamedAccount = res.accountId;
      if (typeof st.recomputeWalletMpcAddresses === 'function') {
        st.recomputeWalletMpcAddresses(wallet);
      } else {
        wallet.mpcEvmAddress = await contracts.deriveMpcEvmAddressAsync(res.accountId, 'ethereum-1');
        wallet.evmAddress = wallet.mpcEvmAddress;
      }
      st.saveWallets();
      renderAll();
      if (res.sweptMode === 'delete_account_full_sweep') {
        showToast(`✅ ${res.accountId} ${t('无损注册成功，原隐式账户 100% 余额与押金已归集', 'registered with 100% implicit balance & deposit swept')}`);
      } else if (res.sweptMode === 'transfer_kept_ft') {
        showToast(`✅ ${res.accountId} ${t('注册成功，NEAR 余额已归集（保留原账户代币）', 'registered & NEAR swept (FT preserved)')}`);
      } else {
        showToast(`✅ ${res.accountId} ${t('注册成功，MPC 全链地址已切换', 'registered & MPC addresses updated')}`);
      }
      if ($('sheet-near-account')?.classList?.contains('open')) {
        await refreshNearAccessKeysSheet();
      }
      refreshAllBalancesAsync(true);
    } catch (err) {
      showToast(err && err.message ? err.message : t('注册失败', 'Registration failed'));
    }
  }

  async function bindNearDomainFromHub() {
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const domain = ($('hub-near-domain-input')?.value || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,59}\.(near|tg)$/.test(domain)) {
      showToast(t('请输入有效的 .near / .tg 账号', 'Enter a valid .near / .tg account'));
      return;
    }
    const authSecret = ($('hub-near-bind-auth-input')?.value || '').trim();
    try {
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const creds = contracts.getWalletNearSignerCredentials(wallet);
      const targetPub = creds.publicKeyStr;
      const targetHandle = creds.publicKeyHandleStr;

      const queryKeyOnDomain = async (pk) => contracts.nearRpcPostAsync({
        jsonrpc: '2.0',
        id: 'bind-check',
        method: 'query',
        params: {
          request_type: 'view_access_key',
          finality: 'final',
          account_id: domain,
          public_key: pk
        }
      }, 8000);

      let json = await queryKeyOnDomain(targetPub);
      if ((!json || json.error || !json.result) && targetHandle) {
        json = await queryKeyOnDomain(targetHandle);
      }

      if (!json || json.error || !json.result) {
        if (!authSecret) {
          throw new Error(t('该 .near 账号尚未授权当前钱包公钥；请在下方填入该 .near 的原助记词或私钥以自动授权绑定', 'Current wallet key is not authorized on this .near account. Paste its original mnemonic or private key below to auto-authorize.'));
        }
        let authPub = '';
        let authPriv = '';
        if (authSecret.startsWith('ed25519:') || /^[1-9A-HJ-NP-Za-km-z]{60,95}$/.test(authSecret)) {
          const cleanB58 = authSecret.replace(/^ed25519:/, '');
          const rawBytes = crypto.base58Decode(cleanB58);
          if (rawBytes.length < 64) throw new Error(t('Ed25519 私钥格式无效', 'Invalid Ed25519 private key'));
          const pubB58 = crypto.base58Encode(rawBytes.slice(32, 64));
          authPub = `ed25519:${pubB58}`;
          authPriv = `ed25519:${cleanB58}`;
        } else {
          const check = crypto.validateMnemonic(authSecret);
          if (!check.valid) throw new Error(check.error || t('原助记词或私钥格式无效', 'Invalid original mnemonic or private key'));
          const d = await crypto.deriveNearFromSeedAsync(check.words.join(' '), 0);
          authPub = d.nearPublicKey;
          authPriv = d.nearPrivateKey;
        }

        showToast(t('正在授权当前钱包绑定该 .near 账号...', 'Authorizing current wallet on .near account...'));
        await contracts.addNearAccessKeyAsync({
          wallet: {
            accountType: 'standard',
            nearNamedAccount: domain,
            nearAddress: domain,
            nearPublicKey: authPub,
            nearPrivateKey: authPriv,
            nearBalance: 1
          },
          newPublicKeyStr: targetPub
        });
      }

      wallet.nearNamedAccount = domain;
      if (typeof st.recomputeWalletMpcAddresses === 'function') {
        st.recomputeWalletMpcAddresses(wallet);
      } else {
        wallet.mpcEvmAddress = await contracts.deriveMpcEvmAddressAsync(domain, 'ethereum-1');
        wallet.evmAddress = wallet.mpcEvmAddress;
      }
      if ($('hub-near-bind-auth-input')) $('hub-near-bind-auth-input').value = '';
      $('near-bind-drawer')?.classList.add('hidden');
      st.saveWallets();
      renderAll();
      showToast(`✅ ${t('已绑定主账户', 'Bound master account')}: ${domain}`);
      if ($('sheet-near-account')?.classList?.contains('open')) {
        await refreshNearAccessKeysSheet();
      }
      refreshAllBalancesAsync(true);
    } catch (err) {
      showToast(err && err.message ? err.message : t('绑定失败', 'Bind failed'));
    }
  }

  function recomputeHubMpcAddress() {
    const crypto = getCrypto();
    const wallet = getState().getActiveWallet();
    if (!wallet || !crypto) return;
    const path = ($('hub-mpc-path-input')?.value || 'ethereum-1').trim() || 'ethereum-1';
    const nearId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!nearId) return;
    try {
      const lower = path.toLowerCase();
      let addr = '--';
      if (lower.startsWith('solana') && typeof crypto.deriveNearMpcSolanaAddress === 'function') {
        addr = crypto.deriveNearMpcSolanaAddress(nearId, path).mpcSolAddress;
      } else if (lower.startsWith('pearl') && typeof crypto.deriveNearMpcPearlAddress === 'function') {
        addr = crypto.deriveNearMpcPearlAddress(nearId, path).mpcPearlAddress;
      } else if (lower.startsWith('bitcoin') && typeof crypto.deriveNearMpcBitcoinAddress === 'function') {
        addr = crypto.deriveNearMpcBitcoinAddress(nearId, path).mpcBtcAddress;
      } else {
        addr = crypto.deriveNearMpcEvmAddress(nearId, path).mpcEvmAddress;
      }
      if ($('hub-mpc-evm-address')) $('hub-mpc-evm-address').textContent = addr;
    } catch (_) {}
  }

  function copyHubMpcAddress() {
    const addr = $('hub-mpc-evm-address')?.textContent || '';
    if (addr && addr !== '--') copyText(addr, 'MPC EVM Address');
  }

  async function executeHubMpcSign() {
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const rawInput = ($('hub-mpc-payload-input')?.value || '').trim();
    if (!rawInput) {
      showToast(t('请输入消息或 32 字节 Hex 哈希', 'Enter message or 32-byte hex hash'));
      return;
    }
    const path = ($('hub-mpc-path-input')?.value || 'ethereum-1').trim() || 'ethereum-1';
    const domainId = path.toLowerCase().startsWith('solana') ? 1 : 0;
    const cleanHex = rawInput.replace(/^0x/i, '');
    const payloadBytes = /^[0-9a-fA-F]{64}$/.test(cleanHex)
      ? crypto.hexToBytes(cleanHex)
      : crypto.keccak256Bytes(rawInput);

    if (!(await verifySecurityAuthAsync(wallet, t('确认 MPC 链抽象签名', 'Confirm MPC Chain Signature')))) return;
    try {
      const res = await contracts.requestNearMpcChainSignature({
        wallet,
        payloadHash32Bytes: payloadBytes,
        path,
        domainId
      });
      const rec = $('hub-mpc-receipt');
      if (rec) {
        rec.classList.remove('hidden');
        rec.innerHTML = `
          <div class="meta-row"><span class="meta-key">TxHash</span><span class="mono text-cyan">${escapeHtml(shortenAddr(res.txHash, 10, 8))}</span></div>
          ${res.explorerUrl && isValidHttpsUrl(res.explorerUrl) ? `<a href="${escapeHtml(res.explorerUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan" style="font-size:11.5px;">${t('查看链上执行结果 ↗', 'View on NearBlocks ↗')}</a>` : ''}
        `;
      }
      showToast(`✅ ${t('MPC 链签名请求已广播', 'MPC sign tx broadcast')}`);
    } catch (err) {
      showToast(err && err.message ? err.message : t('MPC 签名失败', 'MPC sign failed'));
    }
  }

  // ==================== Deep Mining Pro Sheet ====================

  async function openMiningProSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const inp = $('mining-address-input');
    if (inp && !inp.value && wallet && wallet.address) {
      inp.value = wallet.address;
      st.mining.minerAddress = wallet.address;
    }
    openSheet('sheet-mining-pro');
    await ensureMiningProLoaded();
    renderMiningWatchlist();
    renderMiningPoolSelector();
    renderMiningTelemetry();
    refreshMiningNetworkBar();
    if (inp && inp.value && !st.mining.telemetry) {
      runMiningDeepQuery();
    }
  }

  async function refreshMiningNetworkBar() {
    const st = getState();
    const mining = getMining() || await ensureMiningProLoaded();
    if (!mining) return;
    try {
      const net = await mining.fetchNetworkAndPoolTelemetry();
      st.mining.networkStats = net;
      renderMiningNetworkBar();
    } catch (_) {}
  }

  function renderMiningNetworkBar() {
    const st = getState();
    const el = $('mining-network-bar');
    if (!el) return;
    const net = st.mining.networkStats && st.mining.networkStats.network;
    if (!net) {
      el.innerHTML = `<div class="meta-row"><span class="meta-key">Pearl Mainnet</span><span class="meta-val">--</span></div>`;
      return;
    }
    el.innerHTML = `
      <div class="meta-row"><span class="meta-key">${t('区块高度', 'Height')}</span><span class="meta-val mono">${net.height !== null ? net.height.toLocaleString() : '--'}</span></div>
      <div class="meta-row"><span class="meta-key">${t('全网算力', 'Net Hashrate')}</span><span class="meta-val mono">${escapeHtml(net.networkHashrateFormatted || '--')}</span></div>
      <div class="meta-row"><span class="meta-key">${t('全网难度 / 块奖励', 'Diff / Reward')}</span><span class="meta-val mono">${net.difficultyM !== null ? net.difficultyM + 'M' : '--'} · ${net.blockRewardPrl !== null ? net.blockRewardPrl + ' PRL' : '--'}</span></div>
    `;
  }

  function renderMiningPoolSelector() {
    const poolKey = getState().mining.poolKey || 'auto';
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#sheet-mining-pro [data-pool]').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-pool') === poolKey);
      });
    }
  }

  function setMiningPoolKey(poolKey) {
    getState().mining.poolKey = poolKey;
    renderMiningPoolSelector();
    runMiningDeepQuery();
  }

  function renderMiningWatchlist() {
    const mining = getMining();
    const wrap = $('mining-watchlist');
    if (!wrap || !mining) return;
    const list = mining.getSavedMinerAddresses();
    if (list.length === 0) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = list.map((item) => `
      <span class="filter-pill" style="display:inline-flex;align-items:center;gap:6px;">
        <span style="cursor:pointer;" data-action="select-miner" data-addr="${escapeHtml(item.address)}">${escapeHtml(item.label || shortenAddr(item.address, 6, 5))}</span>
        <span style="cursor:pointer;opacity:0.65;" data-action="remove-miner" data-addr="${escapeHtml(item.address)}">×</span>
      </span>
    `).join('');
  }

  function selectSavedMiner(addr) {
    if ($('mining-address-input')) $('mining-address-input').value = addr;
    runMiningDeepQuery();
  }

  async function saveCurrentMinerAddress() {
    const mining = getMining() || await ensureMiningProLoaded();
    const addr = ($('mining-address-input')?.value || '').trim();
    if (!addr || !mining) return;
    try {
      mining.addSavedMinerAddress(addr, '', getState().mining.poolKey);
      renderMiningWatchlist();
      showToast(t('已加入矿工收藏列表', 'Saved to watchlist'));
    } catch (err) {
      showToast(err && err.message ? err.message : t('无效 Pearl 地址', 'Invalid Pearl address'));
    }
  }

  async function removeSavedMiner(addr) {
    const mining = getMining() || await ensureMiningProLoaded();
    if (!mining) return;
    mining.removeSavedMinerAddress(addr);
    renderMiningWatchlist();
  }

  let _miningQueryGen = 0;

  async function runMiningDeepQuery() {
    const st = getState();
    const mining = getMining() || await ensureMiningProLoaded();
    const addr = ($('mining-address-input')?.value || '').trim();
    if (!addr) {
      showToast(t('请输入 prl1p... 矿工地址', 'Enter prl1p... miner address'));
      return;
    }
    if (!mining) return;
    const myGen = ++_miningQueryGen;
    st.mining.minerAddress = addr;
    st.mining.loading = true;
    try {
      const tel = await mining.queryMinerDeepStats(addr, st.mining.poolKey);
      if (myGen !== _miningQueryGen) return;
      st.mining.telemetry = tel;
      renderMiningTelemetry();
    } catch (err) {
      if (myGen === _miningQueryGen) {
        showToast(err && err.message ? err.message : t('矿工数据查询失败', 'Miner query failed'));
      }
    } finally {
      if (myGen === _miningQueryGen) {
        st.mining.loading = false;
      }
    }
  }

  function renderMiningTelemetry() {
    const tel = getState().mining.telemetry;
    if ($('mining-kpi-30m')) $('mining-kpi-30m').textContent = tel ? (tel.hashrateCurrentFormatted || '--') : '--';
    if ($('mining-kpi-3h')) $('mining-kpi-3h').textContent = tel ? (tel.hashrateAvg3hFormatted || '--') : '--';
    if ($('mining-kpi-24h')) $('mining-kpi-24h').textContent = tel ? (tel.hashrateAvg24hFormatted || '--') : '--';
    if ($('mining-kpi-unpaid')) $('mining-kpi-unpaid').textContent = tel && tel.unpaidBalancePrl !== null ? `${formatBal(tel.unpaidBalancePrl, 4)} PRL` : '--';
    if ($('mining-payout-progress')) $('mining-payout-progress').style.width = `${tel && tel.payoutProgressPct !== null ? tel.payoutProgressPct : 0}%`;
    if ($('mining-threshold-label')) {
      $('mining-threshold-label').textContent = tel && tel.payoutThresholdPrl !== null
        ? `${t('阈值', 'Threshold')}: ${tel.payoutThresholdPrl} PRL (${tel.payoutProgressPct ?? '--'}%)`
        : `${t('已支付', 'Paid')}: ${tel && tel.totalPaidPrl !== null ? tel.totalPaidPrl + ' PRL' : '--'}`;
    }
    if ($('mining-kpi-share-rate')) $('mining-kpi-share-rate').textContent = tel && tel.shareAcceptRatePct !== null ? `${tel.shareAcceptRatePct}%` : '--';
    if ($('mining-kpi-share-counts')) {
      $('mining-kpi-share-counts').textContent = tel && tel.sharesValid !== null
        ? `${t('有效', 'Valid')}: ${tel.sharesValid} / ${t('无效', 'Invalid')}: ${tel.sharesInvalid ?? 0}`
        : '--';
    }

    const tbody = $('mining-workers-tbody');
    if (tbody) {
      const workers = tel && Array.isArray(tel.workers) ? tel.workers : [];
      if (workers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">${t('暂无矿机记录', 'No active rigs')}</td></tr>`;
      } else {
        tbody.innerHTML = workers.map((w) => `
          <tr>
            <td style="font-weight:700;color:#fff;">${escapeHtml(w.name)}</td>
            <td><span class="status-pill ${w.status === 'online' ? 'online' : 'offline'}">${w.status === 'online' ? t('在线', 'Online') : t('离线', 'Offline')}</span></td>
            <td class="mono">${escapeHtml(w.hashrate30mFormatted || '--')}</td>
            <td class="mono">${escapeHtml(w.hashrate24hFormatted || '--')}</td>
            <td class="mono">${w.validShares !== null ? w.validShares : '--'} / ${w.rejectedShares !== null ? w.rejectedShares : '--'}</td>
          </tr>
        `).join('');
      }
    }

    const payoutsEl = $('mining-payouts-list');
    const payoutsAllBtn = $('mining-payouts-all-btn');
    if (payoutsEl) {
      const payouts = tel && Array.isArray(tel.payoutHistory) ? tel.payoutHistory : [];
      _lastMiningNormalizedPayouts = payouts.map((p, idx) => {
        const tsSec = p.timestamp ? Math.floor(new Date(p.timestamp).getTime() / 1000) : null;
        return {
          id: `mine_${p.txid || idx}`,
          type: 'mine',
          symbol: 'PRL',
          chain: 'prl',
          amount: p.amountPrl !== null && Number.isFinite(Number(p.amountPrl)) ? Number(p.amountPrl) : null,
          netAmount: p.amountPrl !== null && Number.isFinite(Number(p.amountPrl)) ? Number(p.amountPrl) : null,
          txHash: p.txid || '',
          status: p.status || 'confirmed',
          counterparty: (tel && tel.address) || getState().mining.minerAddress || '',
          title: t('矿池打款', 'Pool Payout'),
          timestamp: Number.isFinite(tsSec) ? tsSec : null
        };
      });
      if (payoutsAllBtn) payoutsAllBtn.classList.toggle('hidden', _lastMiningNormalizedPayouts.length === 0);
      if (_lastMiningNormalizedPayouts.length === 0) {
        payoutsEl.innerHTML = `<div class="text-muted" style="font-size:11.5px;text-align:center;padding:8px;">${t('暂无打款记录', 'No payout history')}</div>`;
      } else {
        payoutsEl.innerHTML = renderCompactTxPreviewHtml(_lastMiningNormalizedPayouts, 'mining', 'PRL');
      }
    }
  }

  // ==================== Solana Rent Reclaim & Dust Burn ====================

  let _solRentScanAccounts = [];
  let _solRentSelectedAtas = new Set();

  function openSolRentReclaimSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet || !wallet.solAddress) {
      showToast(t('当前账户暂不支持 Solana 租金回收', 'Solana rent reclaim is not available for this account'));
      return;
    }
    _solRentScanAccounts = [];
    _solRentSelectedAtas = new Set();
    openSheet('sheet-sol-rent');
    scanSolRentReclaimUI();
  }

  async function scanSolRentReclaimUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const listEl = $('sol-rent-list');
    const sumEl = $('sol-rent-summary');
    if (!wallet || !wallet.solAddress || !contracts || typeof contracts.scanSolanaReclaimableAccounts !== 'function') return;

    if (sumEl) sumEl.textContent = t('扫描中...', 'Scanning...');
    if (listEl) listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:12px;text-align:center;">${t('正在扫描 Solana 代币账户...', 'Scanning Solana token accounts...')}</div>`;

    const solTokens = getSwapTokenCatalog().filter((tk) => String(tk.blockchain || '').toLowerCase() === 'sol' && tk.contractAddress);
    const tokenByMint = new Map();
    for (const tk of solTokens) tokenByMint.set(tk.contractAddress, tk);

    try {
      const scanPromise = contracts.scanSolanaReclaimableAccounts(wallet.solAddress, {
        priceResolver: (mint) => {
          const tk = tokenByMint.get(mint);
          if (!tk) return null;
          const p = getSymbolPrice(tk.symbol);
          return p !== null && Number.isFinite(Number(p)) ? Number(p) : null;
        }
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(t('Solana 节点响应超时，请点击刷新重试', 'Solana RPC timed out, please tap Refresh'))), 7000)
      );
      const res = await Promise.race([scanPromise, timeoutPromise]);
      _solRentScanAccounts = (res.accounts || []).map((acc) => {
        const tk = tokenByMint.get(acc.mint);
        return {
          ...acc,
          symbol: tk ? tk.symbol : shortenAddr(acc.mint)
        };
      });
      _solRentSelectedAtas = new Set(
        _solRentScanAccounts
          .filter((acc) => acc.isEmpty || acc.isDust)
          .map((acc) => acc.ataAddress)
      );
      renderSolRentList();
    } catch (err) {
      if (sumEl) sumEl.textContent = '--';
      if (listEl) listEl.innerHTML = `<div style="font-size:12px;color:var(--rose-alert);padding:12px;text-align:center;">${escapeHtml(err && err.message ? err.message : t('扫描失败', 'Scan failed'))}</div>`;
    }
  }

  function renderSolRentList() {
    const listEl = $('sol-rent-list');
    const sumEl = $('sol-rent-summary');
    const execBtn = $('btn-execute-sol-rent');
    if (!listEl) return;

    const emptyCount = _solRentScanAccounts.filter((a) => a.isEmpty).length;
    const dustCount = _solRentScanAccounts.filter((a) => a.isDust).length;
    const selectedList = _solRentScanAccounts.filter((a) => _solRentSelectedAtas.has(a.ataAddress));
    const selectedSol = selectedList.reduce((s, a) => s + Number(a.rentSol || 0), 0);

    if (sumEl) {
      sumEl.textContent = `${t('空账户', 'Empty')}: ${emptyCount} · ${t('粉尘', 'Dust')}: ${dustCount}`;
    }
    if (execBtn) {
      execBtn.disabled = selectedList.length === 0;
      execBtn.textContent = selectedList.length > 0
        ? `${t('一键回收并领取', 'Reclaim Selected')} (+${selectedSol.toFixed(4)} SOL)`
        : t('无可回收账户', 'Nothing Selected');
    }

    if (_solRentScanAccounts.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:16px;text-align:center;">${t('当前钱包没有可回收的 Solana 代币账户', 'No reclaimable Solana token accounts found')}</div>`;
      return;
    }

    listEl.innerHTML = _solRentScanAccounts.map((acc) => {
      const checked = _solRentSelectedAtas.has(acc.ataAddress) ? 'checked' : '';
      const badgeHtml = acc.isEmpty
        ? `<span class="ca-badge" style="font-size:10px;">${t('空账户', 'Empty')}</span>`
        : (acc.isDust
            ? `<span class="ca-badge" style="font-size:10px;border-color:rgba(251,113,133,0.4);color:var(--rose-alert);">${t('粉尘粉碎', 'Burn Dust')}</span>`
            : `<span class="ca-badge" style="font-size:10px;border-color:rgba(251,191,36,0.4);color:#fbbf24;">${t('有余额 (慎选)', 'Has Balance')}</span>`);
      const balInfo = acc.isEmpty
        ? t('余额: 0', 'Bal: 0')
        : `${t('余额', 'Bal')}: ${formatBal(acc.uiAmount, 6)}${acc.usdValue !== null ? ` (~$${acc.usdValue.toFixed(4)})` : ''}`;
      return `
        <label class="ios-glass-card flex items-center justify-between gap-2" style="padding:10px 12px;cursor:pointer;">
          <div class="flex items-center gap-2" style="min-width:0;">
            <input type="checkbox" ${checked} data-action="toggle-sol-rent" data-ata="${escapeHtml(acc.ataAddress)}" />
            <div class="flex flex-col" style="min-width:0;">
              <div class="flex items-center gap-1">
                <span style="font-weight:700;font-size:12.5px;">${escapeHtml(acc.symbol)}</span>
                ${badgeHtml}
              </div>
              <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(balInfo)}</span>
            </div>
          </div>
          <span class="mono" style="font-size:12px;font-weight:700;color:var(--mint-accent);white-space:nowrap;">+${acc.rentSol.toFixed(4)} SOL</span>
        </label>
      `;
    }).join('');
  }

  function toggleSolRentItem(ataAddress, isChecked) {
    if (isChecked) _solRentSelectedAtas.add(ataAddress);
    else _solRentSelectedAtas.delete(ataAddress);
    renderSolRentList();
  }

  async function executeSolRentReclaimUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const selected = _solRentScanAccounts.filter((a) => _solRentSelectedAtas.has(a.ataAddress));
    if (!wallet || selected.length === 0 || !contracts || typeof contracts.executeSolanaRentReclaim !== 'function') return;

    const totalSol = selected.reduce((s, a) => s + Number(a.rentSol || 0), 0);
    const hasBurn = selected.some((a) => !a.isEmpty);
    const promptText = hasBurn
      ? `${t('回收租金并粉碎', 'Reclaim & burn')} ${selected.length} ${t('个账户', 'accounts')} (+${totalSol.toFixed(4)} SOL)`
      : `${t('回收', 'Reclaim')} ${selected.length} ${t('个空账户租金', 'empty accounts')} (+${totalSol.toFixed(4)} SOL)`;

    if (!(await verifySecurityAuthAsync(wallet, promptText))) return;

    const btn = $('btn-execute-sol-rent');
    if (btn) btn.disabled = true;
    try {
      const res = await contracts.executeSolanaRentReclaim({ wallet, accounts: selected });
      const firstHash = res.txHashes && res.txHashes[0] ? `: ${shortenAddr(res.txHashes[0])}` : '';
      showToast(`✅ ${t('已回收', 'Reclaimed')} +${res.reclaimedSol.toFixed(4)} SOL (${res.closedCount} ${t('个账户', 'accounts')})${firstHash}`);
      await scanSolRentReclaimUI();
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(err && err.message ? err.message : t('租金回收失败', 'Rent reclaim failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ==================== NEAR NEP-145 Storage Deposit Reclaim ====================

  let _nearStorageScanAccounts = [];
  let _nearStorageSelectedContracts = new Set();

  function openNearStorageReclaimSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const nearAcct = wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : '';
    if (!wallet || !nearAcct) {
      showToast(t('当前账户暂不支持 NEAR 存储押金回收', 'NEAR storage reclaim is not available for this account'));
      return;
    }
    _nearStorageScanAccounts = [];
    _nearStorageSelectedContracts = new Set();
    openSheet('sheet-near-storage');
    scanNearStorageReclaimUI();
  }

  async function scanNearStorageReclaimUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const nearAcct = wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : '';
    const listEl = $('near-storage-list');
    const sumEl = $('near-storage-summary');
    if (!wallet || !nearAcct || !contracts || typeof contracts.scanNearReclaimableStorageAsync !== 'function') return;

    if (sumEl) sumEl.textContent = t('扫描中...', 'Scanning...');
    if (listEl) listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:12px;text-align:center;">${t('正在扫描 NEAR NEP-141 合约存储押金...', 'Scanning NEAR NEP-141 storage deposits...')}</div>`;

    try {
      const scanPromise = contracts.scanNearReclaimableStorageAsync(nearAcct);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(t('NEAR 节点响应超时，请点击刷新重试', 'NEAR RPC timed out, please tap Refresh'))), 8000)
      );
      const res = await Promise.race([scanPromise, timeoutPromise]);
      _nearStorageScanAccounts = Array.isArray(res && res.accounts) ? res.accounts : [];
      _nearStorageSelectedContracts = new Set(
        _nearStorageScanAccounts
          .filter((acc) => acc.isEmpty)
          .map((acc) => acc.contractId)
      );
      renderNearStorageList();
    } catch (err) {
      if (sumEl) sumEl.textContent = '--';
      if (listEl) listEl.innerHTML = `<div style="font-size:12px;color:var(--rose-alert);padding:12px;text-align:center;">${escapeHtml(err && err.message ? err.message : t('扫描失败', 'Scan failed'))}</div>`;
    }
  }

  function renderNearStorageList() {
    const listEl = $('near-storage-list');
    const sumEl = $('near-storage-summary');
    const execBtn = $('btn-execute-near-storage');
    if (!listEl) return;

    const emptyCount = _nearStorageScanAccounts.filter((a) => a.isEmpty).length;
    const lockedCount = _nearStorageScanAccounts.filter((a) => !a.isEmpty).length;
    const selectedList = _nearStorageScanAccounts.filter((a) => a.isEmpty && _nearStorageSelectedContracts.has(a.contractId));
    const selectedNear = selectedList.reduce((s, a) => s + Number(a.depositNear || 0), 0);

    if (sumEl) {
      sumEl.textContent = `${t('可回收', 'Reclaimable')}: ${emptyCount} · ${t('持仓占用', 'In Use')}: ${lockedCount}`;
    }
    if (execBtn) {
      execBtn.disabled = selectedList.length === 0;
      execBtn.textContent = selectedList.length > 0
        ? `${t('一键回收存储押金', 'Reclaim Storage Deposits')} (+${selectedNear.toFixed(5)} NEAR)`
        : t('无可回收合约', 'Nothing Selected');
    }

    if (_nearStorageScanAccounts.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:16px;text-align:center;">${t('当前 NEAR 账户暂无检测到存储押金记录', 'No NEAR token storage deposits found')}</div>`;
      return;
    }

    listEl.innerHTML = _nearStorageScanAccounts.map((acc) => {
      const checked = acc.isEmpty && _nearStorageSelectedContracts.has(acc.contractId) ? 'checked' : '';
      const disabledAttr = acc.isEmpty ? '' : 'disabled';
      const badgeHtml = acc.isEmpty
        ? `<span class="ca-badge" style="font-size:10px;">${t('空账本可回收', 'Empty · Reclaimable')}</span>`
        : `<span class="ca-badge" style="font-size:10px;border-color:rgba(251,191,36,0.4);color:#fbbf24;">${t('持仓中', 'In Use')}</span>`;
      const balInfo = acc.isEmpty
        ? `${t('余额: 0', 'Bal: 0')} · ${acc.contractId}`
        : `${t('余额', 'Bal')}: ${formatBal(acc.uiAmount, 5)} · ${acc.contractId}`;
      return `
        <label class="ios-glass-card flex items-center justify-between gap-2" style="padding:10px 12px;cursor:${acc.isEmpty ? 'pointer' : 'default'};${acc.isEmpty ? '' : 'opacity:0.75;'}">
          <div class="flex items-center gap-2" style="min-width:0;flex:1;">
            <input type="checkbox" ${checked} ${disabledAttr} data-action="toggle-near-storage" data-contract="${escapeHtml(acc.contractId)}" />
            <div class="flex flex-col" style="min-width:0;flex:1;">
              <div class="flex items-center gap-1">
                <span style="font-weight:700;font-size:12.5px;">${escapeHtml(acc.symbol)}</span>
                ${badgeHtml}
              </div>
              <span class="mono" style="font-size:10.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(balInfo)}</span>
            </div>
          </div>
          <span class="mono" style="font-size:12px;font-weight:700;color:${acc.isEmpty ? 'var(--mint-accent)' : 'var(--text-secondary)'};white-space:nowrap;">+${Number(acc.depositNear || 0).toFixed(5)} NEAR</span>
        </label>
      `;
    }).join('');
  }

  function toggleNearStorageItem(contractId, isChecked) {
    if (isChecked) _nearStorageSelectedContracts.add(contractId);
    else _nearStorageSelectedContracts.delete(contractId);
    renderNearStorageList();
  }

  async function executeNearStorageReclaimUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const selected = _nearStorageScanAccounts.filter((a) => a.isEmpty && _nearStorageSelectedContracts.has(a.contractId));
    if (!wallet || selected.length === 0 || !contracts || typeof contracts.executeNearStorageReclaim !== 'function') return;

    const totalNear = selected.reduce((s, a) => s + Number(a.depositNear || 0), 0);
    const promptText = `${t('回收 NEAR 存储押金', 'Reclaim NEAR Storage')} (${selected.length} · +${totalNear.toFixed(5)} NEAR)`;
    if (!(await verifySecurityAuthAsync(wallet, promptText))) return;

    const btn = $('btn-execute-near-storage');
    if (btn) btn.disabled = true;
    try {
      const res = await contracts.executeNearStorageReclaim({ wallet, contracts: selected });
      const firstHash = res.txHashes && res.txHashes[0] ? `: ${shortenAddr(res.txHashes[0])}` : '';
      showToast(`✅ ${t('已回收', 'Reclaimed')} +${totalNear.toFixed(5)} NEAR (${res.reclaimedCount} ${t('个合约', 'contracts')})${firstHash}`);
      await scanNearStorageReclaimUI();
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(err && err.message ? err.message : t('存储押金回收失败', 'Storage reclaim failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ==================== Contacts Sheet ====================

  function openContactsSheet() {
    _contactsPickerTarget = null;
    renderContactsList();
    openSheet('sheet-contacts');
  }

  function openContactsPicker(target) {
    if (target === 'swap') {
      const st = getState();
      const ft = resolveSwapToken(st.swap.fromAssetId, 0);
      const tt = resolveSwapToken(st.swap.toAssetId, 1);
      if (doesSwapRouteRequireSelfRecipient(ft, tt, st.swap.quoteData || null)) {
        showToast(t('当前路由仅支持当前钱包自收', 'Self-recipient required for this route'));
        return;
      }
    }
    _contactsPickerTarget = target;
    renderContactsList();
    openSheet('sheet-contacts');
  }

  function renderContactsList() {
    const st = getState();
    const listEl = $('contacts-list');
    if (!listEl) return;
    if (!st.contacts || st.contacts.length === 0) {
      listEl.innerHTML = `<div class="text-muted" style="text-align:center;padding:12px;">${t('暂无保存地址', 'No saved contacts')}</div>`;
      return;
    }
    listEl.innerHTML = st.contacts.map((c) => `
      <div class="meta-list">
        <div class="meta-row">
          <span style="font-weight:700;color:#fff;">${escapeHtml(c.name)}</span>
          <div class="flex gap-1">
            ${_contactsPickerTarget
              ? `<button type="button" class="mini-action-btn primary" data-action="pick-contact" data-addr="${escapeHtml(c.address)}">${t('选用', 'Use')}</button>`
              : `<button type="button" class="btn-ghost-sm" data-action="copy-text" data-val="${escapeHtml(c.address)}" data-label="${escapeHtml(c.name)}">${t('复制', 'Copy')}</button>`}
            <button type="button" class="btn-danger" style="padding:4px 8px;font-size:10.5px;" data-action="delete-contact" data-id="${escapeHtml(c.id)}">${t('删除', 'Del')}</button>
          </div>
        </div>
        <div class="mono text-secondary" style="font-size:11px;word-break:break-all;">${escapeHtml(c.address)}</div>
      </div>
    `).join('');
  }

  function addContactFromSheet() {
    const st = getState();
    const crypto = getCrypto();
    const name = ($('contact-name-input')?.value || '').trim();
    const address = ($('contact-addr-input')?.value || '').trim();
    if (!name || !address) {
      showToast(t('请填写备注名和地址', 'Enter contact name and address'));
      return;
    }
    const net = crypto.detectAddressNetwork(address);
    if (!net) {
      showToast(t('地址格式无效', 'Invalid wallet address'));
      return;
    }
    st.contacts.unshift({
      id: `c_${Date.now()}`,
      name,
      address,
      network: net,
      createdAt: new Date().toISOString()
    });
    st.saveContacts();
    if ($('contact-name-input')) $('contact-name-input').value = '';
    if ($('contact-addr-input')) $('contact-addr-input').value = '';
    renderContactsList();
    showToast(t('联系人已保存', 'Contact saved'));
  }

  function deleteContactById(id) {
    const st = getState();
    st.contacts = st.contacts.filter((c) => c.id !== id);
    st.saveContacts();
    renderContactsList();
  }

  function pickContactAddress(address) {
    const st = getState();
    const target = _contactsPickerTarget;
    _contactsPickerTarget = null;
    if (target === 'send') {
      const contactsSheet = $('sheet-contacts');
      if (contactsSheet) {
        contactsSheet.classList.remove('open');
        contactsSheet.setAttribute('aria-hidden', 'true');
      }
      openSheet('sheet-send');
      if ($('send-recipient-input')) $('send-recipient-input').value = address;
      handleSendRecipientInput();
    } else if (target === 'swap') {
      closeAllSheets();
      const ft = resolveSwapToken(st.swap.fromAssetId, 0);
      const tt = resolveSwapToken(st.swap.toAssetId, 1);
      if (!doesSwapRouteRequireSelfRecipient(ft, tt, st.swap.quoteData || null)) {
        st.swap.recipientAddress = address;
        if ($('swap-recipient-input')) $('swap-recipient-input').value = address;
      }
    } else {
      closeAllSheets();
    }
  }

  // ==================== WalletConnect v2 Sheet ====================

  function updateWcStatusPill(text, ok = false) {
    const pill = $('wc-status-pill');
    if (!pill) return;
    pill.textContent = text;
    pill.classList.toggle('active', Boolean(ok));
  }

  async function ensureWcReady() {
    const st = getState();
    const projectId = (st.wc.projectId || '').trim();
    if (!projectId) {
      updateWcStatusPill(t('未配置 ID', 'No ID'), false);
      return null;
    }
    if (st.wc.client && st.wc.initProjectId === projectId) {
      updateWcStatusPill(t('已就绪', 'Ready'), true);
      return st.wc.client;
    }
    let sdk = (typeof window !== 'undefined' && window.PearlWalletConnect) || (typeof globalThis !== 'undefined' && globalThis.PearlWalletConnect);
    if ((!sdk || !sdk.Core || !sdk.Web3Wallet) && typeof document !== 'undefined') {
      updateWcStatusPill(t('加载组件...', 'Loading...'), false);
      await loadScriptOnce('walletconnect.umd.min.js?v=6.16');
      sdk = (typeof window !== 'undefined' && window.PearlWalletConnect) || (typeof globalThis !== 'undefined' && globalThis.PearlWalletConnect);
    }
    if (!sdk || !sdk.Core || !sdk.Web3Wallet) {
      throw new Error(t('WalletConnect SDK 未加载', 'WalletConnect SDK unavailable'));
    }
    updateWcStatusPill(t('连接中...', 'Connecting...'), false);
    const core = new sdk.Core({ projectId });
    const client = await sdk.Web3Wallet.init({
      core,
      metadata: {
        name: 'NEAR Chain Abstraction Wallet',
        description: 'NEAR Account-Centric Chain Abstraction Self-Custody Wallet',
        url: (typeof location !== 'undefined' && location.origin) || 'https://near.org',
        icons: []
      }
    });

    client.on('session_proposal', (proposal) => {
      st.wc.pendingProposal = proposal;
      renderWcCards();
      openSheet('sheet-walletconnect');
    });
    client.on('session_request', (event) => {
      st.wc.pendingRequest = event;
      renderWcCards();
      openSheet('sheet-walletconnect');
    });
    client.on('session_delete', () => {
      renderWcSessions();
      renderHeaderAndHero();
    });

    st.wc.client = client;
    st.wc.initProjectId = projectId;
    updateWcStatusPill(t('已就绪', 'Ready'), true);
    renderWcSessions();
    renderHeaderAndHero();
    return client;
  }

  function renderWcCards() {
    const st = getState();
    const pCard = $('wc-proposal-card');
    const p = st.wc.pendingProposal;
    if (pCard) {
      if (!p) {
        pCard.classList.add('hidden');
      } else {
        const meta = (p.params && p.params.proposer && p.params.proposer.metadata) || {};
        if ($('wc-proposal-name')) $('wc-proposal-name').textContent = meta.name || 'DApp';
        if ($('wc-proposal-url')) $('wc-proposal-url').textContent = meta.url || '--';
        if ($('wc-proposal-chains')) $('wc-proposal-chains').textContent = 'eip155:1, 8453, 56, 42161';
        pCard.classList.remove('hidden');
      }
    }

    const rCard = $('wc-request-card');
    const ev = st.wc.pendingRequest;
    if (rCard) {
      if (!ev) {
        rCard.classList.add('hidden');
      } else {
        const req = (ev.params && ev.params.request) || {};
        if ($('wc-request-method')) $('wc-request-method').textContent = req.method || '--';
        if ($('wc-request-dapp')) $('wc-request-dapp').textContent = ev.params.chainId || 'eip155:1';
        if ($('wc-request-payload')) $('wc-request-payload').textContent = JSON.stringify(req.params || {}, null, 2);
        rCard.classList.remove('hidden');
      }
    }
  }

  function renderWcSessions() {
    const st = getState();
    const listEl = $('wc-sessions-list');
    if (!listEl) return;
    const sessions = st.wc.client ? Object.values(st.wc.client.getActiveSessions() || {}) : [];
    if (sessions.length === 0) {
      listEl.innerHTML = `<div class="text-muted" style="text-align:center;padding:10px;font-size:12px;">${t('暂无已连接 DApp', 'No active sessions')}</div>`;
      return;
    }
    listEl.innerHTML = sessions.map((s) => {
      const meta = (s.peer && s.peer.metadata) || {};
      return `
        <div class="meta-list">
          <div class="meta-row">
            <span style="font-weight:700;color:#fff;">${escapeHtml(meta.name || 'DApp')}</span>
            <button type="button" class="btn-danger" style="padding:4px 8px;font-size:10.5px;" data-action="disconnect-wc" data-topic="${escapeHtml(s.topic)}">${t('断开', 'Disconnect')}</button>
          </div>
          <span class="text-muted" style="font-size:11px;">${escapeHtml(meta.url || s.topic)}</span>
        </div>
      `;
    }).join('');
  }

  function toggleWcAdvancedSettings() {
    $('wc-advanced-drawer')?.classList.toggle('hidden');
  }

  async function openWalletConnectSheet() {
    const st = getState();
    if ($('wc-project-id-input')) $('wc-project-id-input').value = st.wc.projectId || '';
    if ($('wc-uri-input')) $('wc-uri-input').value = '';
    const advDrawer = $('wc-advanced-drawer');
    if (advDrawer) advDrawer.classList.toggle('hidden', Boolean(st.wc.projectId));
    renderWcCards();
    renderWcSessions();
    openSheet('sheet-walletconnect');
    if (st.wc.projectId) {
      try { await ensureWcReady(); } catch (_) { updateWcStatusPill(t('初始化失败', 'Init error'), false); }
    } else {
      updateWcStatusPill(t('未配置 ID', 'No ID'), false);
    }
  }

  async function saveWalletConnectProjectId() {
    const st = getState();
    const val = ($('wc-project-id-input')?.value || '').trim();
    if (!val || val.length < 16) {
      showToast(t('请输入有效的 Project ID', 'Enter a valid Project ID'));
      return;
    }
    st.wc.projectId = val;
    if (typeof localStorage !== 'undefined') localStorage.setItem('near_ca_wc_project_id', val);
    try {
      await ensureWcReady();
      $('wc-advanced-drawer')?.classList.add('hidden');
      showToast(t('✅ WalletConnect 已就绪', '✅ WalletConnect ready'));
    } catch (e) {
      showToast(e && e.message ? e.message : t('连接失败', 'Connection failed'));
    }
  }

  async function pasteToWcUri() {
    try {
      const text = await navigator.clipboard.readText();
      if ($('wc-uri-input') && text) $('wc-uri-input').value = text.trim();
    } catch (_) {
      showToast(t('请手动粘贴', 'Please paste manually'));
    }
  }

  async function pairWalletConnectUri() {
    const st = getState();
    const uri = ($('wc-uri-input')?.value || '').trim();
    if (!uri.startsWith('wc:')) {
      showToast(t('请输入有效的 wc: 链接', 'Paste a valid wc: URI'));
      return;
    }
    if (!st.wc.projectId) {
      showToast(t('请先保存 Project ID', 'Save Project ID first'));
      return;
    }
    try {
      const client = await ensureWcReady();
      await client.core.pairing.pair({ uri });
      showToast(t('已发起配对，等待 DApp 请求...', 'Pairing sent...'));
    } catch (e) {
      showToast(e && e.message ? e.message : t('配对失败', 'Pairing failed'));
    }
  }

  async function approveWcProposal() {
    const st = getState();
    const contracts = getContracts();
    const p = st.wc.pendingProposal;
    const client = st.wc.client;
    const wallet = st.getActiveWallet();
    if (!p || !client || !wallet) return;
    if (!(await verifySecurityAuthAsync(wallet, t('授权 WalletConnect 连接', 'Authorize WalletConnect')))) return;
    try {
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const chainsSet = new Set(['eip155:1', 'eip155:8453', 'eip155:56', 'eip155:42161', 'eip155:4663', 'eip155:999']);
      const reqNs = (p.params && p.params.requiredNamespaces) || {};
      const optNs = (p.params && p.params.optionalNamespaces) || {};
      [reqNs, optNs].forEach((ns) => {
        if (ns.eip155 && Array.isArray(ns.eip155.chains)) ns.eip155.chains.forEach((c) => chainsSet.add(c));
      });
      const chains = Array.from(chainsSet);
      await client.approveSession({
        id: p.id,
        namespaces: {
          eip155: {
            chains,
            accounts: chains.map((c) => `${c}:${wallet.evmAddress}`),
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4', 'wallet_switchEthereumChain'],
            events: ['chainChanged', 'accountsChanged']
          }
        }
      });
      st.wc.pendingProposal = null;
      renderWcCards();
      renderWcSessions();
      renderHeaderAndHero();
      showToast(t('✅ 已批准 DApp 连接', '✅ DApp approved'));
    } catch (e) {
      showToast(e && e.message ? e.message : t('批准失败', 'Approve failed'));
    }
  }

  async function rejectWcProposal() {
    const st = getState();
    const p = st.wc.pendingProposal;
    if (p && st.wc.client) {
      try { await st.wc.client.rejectSession({ id: p.id, reason: { code: 5000, message: 'User rejected' } }); } catch (_) {}
    }
    st.wc.pendingProposal = null;
    renderWcCards();
  }

  async function approveWcRequest() {
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const ev = st.wc.pendingRequest;
    const client = st.wc.client;
    const wallet = st.getActiveWallet();
    if (!ev || !client || !wallet) return;
    if (!(await verifySecurityAuthAsync(wallet, t('批准 WalletConnect DApp 请求', 'Approve WalletConnect request')))) return;
    try {
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const ethersLib = await ensureEthersLoaded();
      if (!ethersLib) throw new Error(t('EVM 签名库不可用', 'EVM signer unavailable'));
      const { topic, id, params } = ev;
      const method = params.request.method;
      const reqParams = params.request.params || [];
      let result;

      const signDigestViaMpc = async (digestHex) => {
        const digestBytes = crypto.hexToBytes(String(digestHex).replace(/^0x/i, ''));
        const mpcRes = await contracts.requestNearMpcChainSignature({
          wallet,
          payloadHash32Bytes: digestBytes,
          path: 'ethereum-1',
          domainId: 0
        });
        const sigObj = mpcRes && mpcRes.mpcSignature;
        if (!sigObj || !sigObj.big_r || !sigObj.big_r.affine_point || !sigObj.s || !sigObj.s.scalar) {
          throw new Error(t('NEAR MPC 未返回有效的 Secp256k1 签名', 'NEAR MPC did not return a valid Secp256k1 signature'));
        }
        return ethersLib.Signature.from({
          r: `0x${sigObj.big_r.affine_point.slice(2, 66)}`,
          s: `0x${sigObj.s.scalar.padStart(64, '0')}`,
          yParity: Number(sigObj.recovery_id || 0) & 1
        }).serialized;
      };

      if (method === 'personal_sign' || method === 'eth_sign') {
        const msgRaw = method === 'personal_sign' ? reqParams[0] : reqParams[1];
        const msgBytes = (typeof msgRaw === 'string' && msgRaw.startsWith('0x')) ? ethersLib.getBytes(msgRaw) : String(msgRaw);
        if (wallet.evmPrivateKey) {
          result = await new ethersLib.Wallet(wallet.evmPrivateKey).signMessage(msgBytes);
        } else {
          result = await signDigestViaMpc(ethersLib.hashMessage(msgBytes));
        }
      } else if (method.startsWith('eth_signTypedData')) {
        const rawTyped = typeof reqParams[1] === 'string' ? JSON.parse(reqParams[1]) : reqParams[1];
        const cleanTypes = { ...(rawTyped.types || {}) };
        delete cleanTypes.EIP712Domain;
        if (wallet.evmPrivateKey) {
          result = await new ethersLib.Wallet(wallet.evmPrivateKey).signTypedData(rawTyped.domain || {}, cleanTypes, rawTyped.message || {});
        } else {
          result = await signDigestViaMpc(ethersLib.TypedDataEncoder.hash(rawTyped.domain || {}, cleanTypes, rawTyped.message || {}));
        }
      } else if (method === 'eth_sendTransaction') {
        const txReq = reqParams[0] || {};
        const cid = Number(String(params.chainId || 'eip155:1').split(':')[1] || 1);
        const cfg = Object.entries(contracts.EVM_CHAINS).find(([, c]) => c.chainId === cid);
        if (!cfg) throw new Error(`Unsupported chainId: ${cid}`);
        if (wallet.evmPrivateKey) {
          const provider = new ethersLib.JsonRpcProvider(cfg[1].rpc, cfg[1].chainId);
          const tx = await new ethersLib.Wallet(wallet.evmPrivateKey).connect(provider).sendTransaction({
            to: txReq.to,
            data: txReq.data || '0x',
            value: txReq.value ? BigInt(txReq.value) : 0n
          });
          result = tx.hash;
        } else {
          const txRes = await contracts.sendEvmMpcSignedTransaction({
            wallet,
            chainKey: cfg[0],
            to: txReq.to,
            data: txReq.data || '0x',
            value: txReq.value ? BigInt(txReq.value).toString() : '0',
            path: 'ethereum-1'
          });
          result = txRes.txHash;
        }
      } else if (method === 'wallet_switchEthereumChain') {
        result = null;
      } else {
        throw new Error(`Unsupported method: ${method}`);
      }

      await client.respondSessionRequest({ topic, response: { id, jsonrpc: '2.0', result } });
      st.wc.pendingRequest = null;
      renderWcCards();
      showToast(t('✅ 签名已完成', '✅ Signed'));
    } catch (e) {
      if (client && ev && ev.topic) {
        await client.respondSessionRequest({
          topic: ev.topic,
          response: { id: ev.id, jsonrpc: '2.0', error: { code: 4001, message: (e && e.message) || 'Execution failed' } }
        }).catch(() => {});
      }
      st.wc.pendingRequest = null;
      renderWcCards();
      showToast(e && e.message ? e.message : t('签名失败', 'Sign failed'));
    }
  }

  async function rejectWcRequest() {
    const st = getState();
    const ev = st.wc.pendingRequest;
    if (ev && st.wc.client) {
      try {
        await st.wc.client.respondSessionRequest({
          topic: ev.topic,
          response: { id: ev.id, jsonrpc: '2.0', error: { code: 4001, message: 'User rejected' } }
        });
      } catch (_) {}
    }
    st.wc.pendingRequest = null;
    renderWcCards();
  }

  async function disconnectWcSession(topic) {
    const st = getState();
    if (!st.wc.client) return;
    try { await st.wc.client.disconnectSession({ topic, reason: { code: 6000, message: 'Disconnected' } }); } catch (_) {}
    renderWcSessions();
    renderHeaderAndHero();
    showToast(t('已断开 DApp 连接', 'Disconnected'));
  }

  // ==================== Root Render & Lifecycle ====================

  let _delegatedListenersBound = false;

  function initDelegatedEventListeners() {
    if (_delegatedListenersBound || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
    _delegatedListenersBound = true;

    document.addEventListener('click', (e) => {
      const target = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-action]') : null;
      if (!target) return;
      if (target.dataset && target.dataset.stop === '1') e.stopPropagation();
      const action = target.dataset ? target.dataset.action : '';
      const ds = target.dataset || {};
      switch (action) {
        case 'switch-wallet': switchActiveWallet(ds.walletId || ''); break;
        case 'delete-wallet': deleteWalletById(ds.walletId || ''); break;
        case 'toggle-backup-reveal': toggleBackupKeysReveal(); break;
        case 'copy-text': copyTextValue(ds.val || '', ds.label || ''); break;
        case 'quick-swap': quickActionSwapFromEntry(ds.assetId || '', ds.chain || '', ds.contract || ''); break;
        case 'quick-send': quickActionSendFromEntry(ds.symbol || '', ds.chain || '', ds.assetId || '', ds.contract || ''); break;
        case 'open-token-detail': openTokenDetailSheet(ds.symbol || ''); break;
        case 'set-token-detail-chain': setTokenDetailChain(ds.chain || 'all'); break;
        case 'open-tx-detail': {
          const src = ds.txSource || 'token';
          const idx = Number(ds.txIdx);
          const arr = src === 'mining'
            ? _lastMiningNormalizedPayouts
            : (src === 'modal' ? (getState().txModal?.items || []) : _lastTokenDetailMergedItems);
          const item = (Number.isInteger(idx) && arr[idx]) || (ds.txHash ? arr.find((x) => x && x.txHash === ds.txHash) : null);
          const backId = src === 'modal' ? 'sheet-tx-history' : (src === 'mining' ? 'sheet-mining-pro' : 'sheet-token-detail');
          if (item) openTxDetailSheet(item, backId);
          break;
        }
        case 'detail-swap': closeAllSheets(); quickActionSwapFromEntry(ds.assetId || '', ds.chain || '', ds.contract || ''); break;
        case 'detail-send': quickActionSendFromEntry(ds.symbol || '', ds.chain || '', ds.assetId || '', ds.contract || ''); break;
        case 'open-token-detail-pool': openTokenDetailPool(ds.poolId || ''); break;
        case 'set-send-evm-chain': setSendTargetEvmChain(ds.chain || 'eth'); break;
        case 'select-receive-network': selectReceiveNetwork(ds.net || 'near'); break;
        case 'select-swap-token': selectSwapToken(ds.assetId || ''); break;
        case 'set-picker-chain': setTokenPickerChain(ds.chain || 'all'); break;
        case 'toggle-fav-token': toggleFavoriteSwapToken(ds.assetId || ''); break;
        case 'claim-limit-order': claimLimitOrderUI(ds.orderId || '', ds.buyToken || ''); break;
        case 'cancel-limit-order': cancelLimitOrderUI(ds.chain || 'near', ds.orderId || '', ds.remain || '', ds.sellToken || '', ds.buyToken || ''); break;
        case 'select-perp-market': selectPerpMarket(ds.coin || 'BTC'); break;
        case 'fill-perp-ob-px': fillPerpLimitPrice(ds.px || ''); break;
        case 'close-perp-pos': closePerpPositionUI(ds.coin || ''); break;
        case 'cancel-perp-order': cancelPerpOrderUI(ds.coin || '', ds.oid || ''); break;
        case 'earn-pos-action': executeEarnPositionAction(ds.type || '', ds.target || ''); break;
        case 'select-staking-pool': selectStakingPool(ds.poolId || ''); break;
        case 'select-earn-lock': selectEarnLockTier(Number(ds.days) || 181); break;
        case 'delete-near-key': deleteNearAccessKeyFromSheet(ds.pk || ''); break;
        case 'select-miner': selectSavedMiner(ds.addr || ''); break;
        case 'remove-miner': removeSavedMiner(ds.addr || ''); break;
        case 'pick-contact': pickContactAddress(ds.addr || ''); break;
        case 'delete-contact': deleteContactById(ds.id || ''); break;
        case 'disconnect-wc': disconnectWcSession(ds.topic || ''); break;
        default: break;
      }
    });

    document.addEventListener('change', (e) => {
      const target = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-action]') : null;
      if (!target || !target.dataset) return;
      if (target.dataset.action === 'toggle-sol-rent') {
        toggleSolRentItem(target.dataset.ata || '', Boolean(target.checked));
      } else if (target.dataset.action === 'toggle-near-storage') {
        toggleNearStorageItem(target.dataset.contract || '', Boolean(target.checked));
      }
    });

    document.addEventListener('error', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG' || !img.classList || !img.classList.contains('token-img-fb')) return;
      const fb = img.dataset ? img.dataset.fb : '';
      if (fb && !img.dataset.fbTried) {
        img.dataset.fbTried = '1';
        img.src = fb;
        return;
      }
      img.style.display = 'none';
      if (img.nextElementSibling) img.nextElementSibling.style.display = 'block';
    }, true);
  }

  function renderAll() {
    const st = getState();
    renderOnboardingVisibility();
    if (st.getActiveWallet()) {
      renderHeaderAndHero();
      if (st.activeTab === 'wallet') renderUnifiedAssetList();
      if (st.activeTab === 'swap') {
        if (st.swap.panelMode === 'limit') renderLimitOrderView();
        else renderSwapView();
      }
      if (st.activeTab === 'perp') renderPerpView();
      if (st.activeTab === 'earn') renderEarnView();
      if (st.activeTab === 'hub') renderHubView();
      const isOpen = (id) => Boolean($(id)?.classList?.contains('open'));
      if (isOpen('sheet-token-detail')) renderTokenDetailSheet();
      if (isOpen('sheet-tx-history')) renderTxHistorySheet();
      if (isOpen('sheet-tx-detail')) renderTxDetailSheet();
      if (isOpen('sheet-receive')) renderReceiveSheet();
      if (isOpen('sheet-wallets')) renderWalletSwitcherList();
      if (isOpen('sheet-contacts')) renderContactsList();
      if (isOpen('sheet-token-picker')) renderTokenPickerList();
      if (isOpen('sheet-perp-markets')) renderPerpMarketsSheet();
      if (isOpen('sheet-perp-funding')) renderPerpFundingSheet();
      if (isOpen('sheet-mining-pro')) {
        renderMiningWatchlist();
        renderMiningPoolSelector();
        renderMiningNetworkBar();
        renderMiningTelemetry();
      }
      if (isOpen('sheet-sol-rent')) renderSolRentList();
      if (isOpen('sheet-near-storage')) renderNearStorageList();
      if (isOpen('sheet-wallet-addresses')) renderHubView();
      if (isOpen('sheet-near-account')) renderNearAccountSummary(st.getActiveWallet());
      if (isOpen('sheet-walletconnect')) {
        renderWcCards();
        renderWcSessions();
      }
    }
  }

  function bootstrapApp() {
    const st = getState();
    st.initState();
    initDelegatedEventListeners();
    initHomePullToRefresh();
    initAppSecurityLifecycle();
    st.onLanguageChange(() => renderAll());
    renderAll();
    const activeW = st.getActiveWallet();
    if (activeW) {
      refreshAllBalancesAsync(false);
      if (shouldEnableAppLockForWallet(activeW)) {
        engageAppLock(true);
      } else {
        clearAppLock();
      }
    } else {
      clearAppLock();
    }
    if (st.swap.activeOrder && st.swap.activeOrder.depositAddress) {
      renderSwapOrderCard();
      const upper = String(st.swap.activeOrder.status || '').toUpperCase();
      if (!['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED'].includes(upper)) {
        startOrderStatusPolling();
      }
    }
    startAutoPriceAndBalanceSync();
    const hasWcSessions = (() => {
      try {
        if (typeof localStorage === 'undefined') return false;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('wc@2:') && k.includes('session')) {
            const val = localStorage.getItem(k);
            if (val && val !== '{}' && val !== '[]') return true;
          }
        }
      } catch (_) {}
      return false;
    })();
    if (st.wc.projectId && hasWcSessions && typeof setTimeout === 'function') {
      setTimeout(() => { ensureWcReady().catch(() => {}); }, 2500);
    }
    if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
      const isLocalDev = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
      if (isLocalDev) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister().catch(() => {}));
        }).catch(() => {});
      } else {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    }
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', bootstrapApp);
  }

  const NearCAUI = {
    bootstrapApp,
    initHomePullToRefresh,
    ensureEthersLoaded,
    ensureQrcodeLoaded,
    ensureMiningProLoaded,
    formatTokenPrice,
    formatUsd,
    renderAll,
    switchTab,
    toggleLanguage,
    detectDeviceBiometricProfileAsync,
    registerOrVerifyWebAuthnPasskeyAsync,
    requestBiometricAuth,
    verifySecurityAuthAsync,
    verifyPinIfNeeded,
    APP_LOCK_TIMEOUT_MS,
    shouldEnableAppLockForWallet,
    engageAppLock,
    clearAppLock,
    unlockAppLockNow,
    unlockAppLockWithPin,
    handleAppVisibilityChange,
    setBackgroundPrivacyBlur,
    renderHubBiometricCardAsync,
    testBiometricAuthNow,
    openSetWalletPinPrompt,
    pressSecurityPinDigit,
    clearSecurityPin,
    backspaceSecurityPin,
    triggerSecurityBiometricNow,
    cancelSecurityAuthModal,
    refreshAllBalancesAsync,
    applyOptimisticChainSpend,
    reconcileFetchedChainBalance,
    getMergedTokenHistoryItems,
    computePtrPullDistance,
    getExplorerAddressUrl,
    getExplorerTxUrl,
    startAutoPriceAndBalanceSync,
    buildAllOnChainAssetGroups,
    buildAggregatedAssetGroups,
    renderUnifiedAssetList,
    toggleAssetExpand,
    openTokenDetailSheet,
    setTokenDetailChain,
    renderTokenDetailSheet,
    openAllTokenHistorySheet,
    openAllMiningPayoutHistorySheet,
    openTxDetailSheet,
    fetchChainTransactionDetailAsync,
    navigateBackFromTxHistory,
    navigateBackFromTxDetail,
    tokenDetailAction,
    copyTokenDetailAddress,
    recordWalletActivity,
    openSendSheet,
    setSendTargetEvmChain,
    executeUnifiedSend,
    openReceiveSheet,
    renderSwapView,
    renderSwapOrderCard,
    refreshActiveSwapOrderStatus,
    clearActiveSwapOrder,
    getTargetChainGasReserveInfo,
    computeNetSwapOutput,
    toggleSwapDetails,
    toggleSwapRateOrientation,
    setSwapGasReserveMode,
    fetchLiveSwapQuoteAsync,
    toggleFavoriteSwapToken,
    renderTokenPickerList,
    isSwapOriginSupported,
    validateSwapNearGasRequirement,
    evaluateSwapButtonState,
    doesSwapRouteRequireSelfRecipient,
    computeSwapPriceImpact,
    formatPoolApyText,
    executeActiveSwap,
    resumeActiveSwapFollowUp,
    setSwapPanelMode,
    setLimitChain,
    openLimitTokenPicker,
    renderLimitOrderView,
    resolveLimitPriceOrientation,
    toggleLimitPriceOrientation,
    evaluateLimitOrderState,
    stepLimitDclPoint,
    applyLimitRateOffset,
    applyLimitRateOffsetByIndex,
    toggleLimitSplitTicks,
    setLimitExpiryDays,
    setLimitOrdersTab,
    wrapNativeForLimitUI,
    executeLimitOrderAction,
    refreshLimitMarketContextAsync,
    refreshLimitOrdersAsync,
    claimLimitOrderUI,
    cancelLimitOrderUI,
    renderPerpView,
    renderPerpOrderbook,
    renderPerpLongShortBar,
    refreshPerpLongShortAsync,
    renderPerpCandleSvg,
    renderPerpMarketsSheet,
    handlePerpMarginInput,
    handlePerpLimitPriceInput,
    evaluatePerpOrderState,
    evaluatePerpOrderUI,
    refreshPerpDataAsync,
    openPerpMarketsSheet,
    selectPerpMarket,
    setPerpSide,
    setPerpMarginMode,
    setPerpOrderType,
    setPerpLeverage,
    setPerpMarginPercent,
    togglePerpChart,
    fillPerpLimitPrice,
    setPerpBottomTab,
    executePerpOrderUI,
    closePerpPositionUI,
    cancelPerpOrderUI,
    setPerpChartInterval,
    setPerpMarketFilter,
    openPerpFundingSheet,
    setPerpFundingTab,
    quickTransferSpotToPerpUI,
    evaluatePerpOneClickState,
    evaluatePerpArbDepositState,
    evaluatePerpWithdrawState,
    evaluatePerpArbDepositUI,
    evaluatePerpWithdrawUI,
    setPerpOneClickMax,
    setPerpArbMax,
    setPerpWithdrawMax,
    jumpFromPerpToSwap,
    schedulePerpOneClickQuote,
    executePerpOneClickDepositUI,
    executePerpArbBridgeDepositUI,
    executePerpWithdrawUI,
    refreshStakingMetrics,
    ensureStakingMetricsFresh,
    refreshEarnMetricsAsync,
    renderEarnView,
    setEarnPoolFilter,
    handleEarnPoolSearch,
    selectEarnLockTier,
    selectStakingPool,
    executeSelectedStake,
    executeEarnPositionAction,
    openMiningProSheet,
    runMiningDeepQuery,
    openWalletConnectSheet,
    openContactsSheet,
    openSolRentReclaimSheet,
    openNearStorageReclaimSheet,
    scanNearStorageReclaimUI,
    toggleNearStorageItem,
    executeNearStorageReclaimUI,
    openWalletSwitcherSheet,
    openBackupKeysSheet,
    toggleBackupKeysReveal,
    openPinSheet,
    openWalletAddressesSheet,
    openNearAccountSheet,
    checkNearDomainAvailabilityUI,
    toggleNearBindDrawer,
    toggleWcAdvancedSettings,
    registerNearDomainFromHub,
    bindNearDomainFromHub,
    openNearAccessKeysSheet,
    refreshNearAccessKeysSheet,
    deleteNearAccessKeyFromSheet,
    generateRotateMnemonicInSheet,
    addNearMnemonicKeyOnlyFromSheet,
    confirmRotateNearAccountKey
  };

  const globalHandlers = {
    switchTab,
    toggleLanguage,
    openCreateWalletFlow,
    confirmCreateWallet,
    openImportWalletFlow,
    validateOnboardImportLive,
    confirmImportWallet,
    cancelOnboardSubPanel,
    copyPendingMnemonic,
    openWalletSwitcherSheet,
    switchActiveWallet,
    deleteWalletById,
    startAdditionalWalletCreate,
    startAdditionalWalletImport,
    openBackupKeysSheet,
    toggleBackupKeysReveal,
    openWalletAddressesSheet,
    openNearAccountSheet,
    checkNearDomainAvailabilityUI,
    toggleNearBindDrawer,
    toggleWcAdvancedSettings,
    openNearAccessKeysSheet,
    refreshNearAccessKeysSheet,
    deleteNearAccessKeyFromSheet,
    generateRotateMnemonicInSheet,
    addNearMnemonicKeyOnlyFromSheet,
    confirmRotateNearAccountKey,
    openPinSheet,
    saveWalletPin,
    testBiometricAuthNow,
    openSetWalletPinPrompt,
    pressSecurityPinDigit,
    clearSecurityPin,
    backspaceSecurityPin,
    triggerSecurityBiometricNow,
    cancelSecurityAuthModal,
    unlockAppLockNow,
    unlockAppLockWithPin,
    copyTextValue,
    copyActiveNearId,
    jumpToNearDomainManager,
    focusMpcInspector,
    refreshAllBalancesAsync,
    applyOptimisticChainSpend,
    reconcileFetchedChainBalance,
    getMergedTokenHistoryItems,
    computePtrPullDistance,
    getExplorerAddressUrl,
    getExplorerTxUrl,
    startAutoPriceAndBalanceSync,
    toggleAssetExpand,
    openTokenDetailSheet,
    setTokenDetailChain,
    openAllTokenHistorySheet,
    openAllMiningPayoutHistorySheet,
    openTxDetailSheet,
    navigateBackFromTxHistory,
    navigateBackFromTxDetail,
    tokenDetailAction,
    copyTokenDetailAddress,
    openTokenDetailPool,
    recordWalletActivity,
    quickActionSwapFromEntry,
    quickActionSendFromEntry,
    openSendSheet,
    setSendTargetEvmChain,
    handleSendAssetChange,
    updateSendAvailabilityUI,
    handleSendRecipientInput,
    setSendMaxAmount,
    pasteToSendAddress,
    executeUnifiedSend,
    openReceiveSheet,
    selectReceiveNetwork,
    copyReceiveAddress,
    setSwapSlippage,
    toggleSwapDetails,
    toggleSwapRateOrientation,
    setSwapGasReserveMode,
    handleSwapRecipientInput,
    handleSwapAmountInput,
    setSwapMaxAmount,
    flipSwapTokens,
    openTokenPicker,
    setTokenPickerChain,
    toggleFavoriteSwapToken,
    renderTokenPickerList,
    selectSwapToken,
    executeActiveSwap,
    copySwapOrderDeposit,
    refreshActiveSwapOrderStatus,
    submitSwapOrderTxHash,
    resumeActiveSwapFollowUp,
    clearActiveSwapOrder,
    setSwapPanelMode,
    setLimitChain,
    openLimitTokenPicker,
    handleLimitInput,
    handleLimitRateInput,
    setLimitMaxAmount,
    flipLimitTokens,
    toggleLimitPriceOrientation,
    applyLimitRateOffset,
    applyLimitRateOffsetByIndex,
    stepLimitDclPoint,
    toggleLimitSplitTicks,
    setLimitExpiryDays,
    setLimitOrdersTab,
    wrapNativeForLimitUI,
    executeLimitOrderAction,
    refreshLimitOrdersAsync,
    claimLimitOrderUI,
    cancelLimitOrderUI,
    renderPerpView,
    renderPerpOrderbook,
    renderPerpCandleSvg,
    renderPerpMarketsSheet,
    handlePerpMarginInput,
    handlePerpLimitPriceInput,
    evaluatePerpOrderState,
    evaluatePerpOrderUI,
    refreshPerpDataAsync,
    openPerpMarketsSheet,
    selectPerpMarket,
    setPerpSide,
    setPerpMarginMode,
    setPerpOrderType,
    setPerpLeverage,
    setPerpMarginPercent,
    togglePerpChart,
    fillPerpLimitPrice,
    setPerpBottomTab,
    executePerpOrderUI,
    closePerpPositionUI,
    cancelPerpOrderUI,
    setPerpChartInterval,
    setPerpMarketFilter,
    openPerpFundingSheet,
    setPerpFundingTab,
    quickTransferSpotToPerpUI,
    evaluatePerpOneClickState,
    evaluatePerpArbDepositState,
    evaluatePerpWithdrawState,
    evaluatePerpArbDepositUI,
    evaluatePerpWithdrawUI,
    setPerpOneClickMax,
    setPerpArbMax,
    setPerpWithdrawMax,
    jumpFromPerpToSwap,
    schedulePerpOneClickQuote,
    executePerpOneClickDepositUI,
    executePerpArbBridgeDepositUI,
    executePerpWithdrawUI,
    refreshStakingMetrics,
    setEarnPoolFilter,
    handleEarnPoolSearch,
    selectEarnLockTier,
    selectStakingPool,
    setEarnMaxAmount,
    updateEarnEstimatedOut,
    executeSelectedStake,
    executeEarnPositionAction,
    registerNearDomainFromHub,
    bindNearDomainFromHub,
    recomputeHubMpcAddress,
    copyHubMpcAddress,
    executeHubMpcSign,
    openMiningProSheet,
    setMiningPoolKey,
    saveCurrentMinerAddress,
    selectSavedMiner,
    removeSavedMiner,
    runMiningDeepQuery,
    openContactsSheet,
    openContactsPicker,
    openSolRentReclaimSheet,
    scanSolRentReclaimUI,
    toggleSolRentItem,
    executeSolRentReclaimUI,
    openNearStorageReclaimSheet,
    scanNearStorageReclaimUI,
    toggleNearStorageItem,
    executeNearStorageReclaimUI,
    addContactFromSheet,
    deleteContactById,
    pickContactAddress,
    openWalletConnectSheet,
    saveWalletConnectProjectId,
    pasteToWcUri,
    pairWalletConnectUri,
    approveWcProposal,
    rejectWcProposal,
    approveWcRequest,
    rejectWcRequest,
    disconnectWcSession,
    closeAllSheets
  };

  if (root) {
    root.NearCAUI = NearCAUI;
    root.NearCA = root.NearCA || {};
    root.NearCA.ui = NearCAUI;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.NearCAUI = NearCAUI;
    globalThis.NearCA = globalThis.NearCA || {};
    globalThis.NearCA.ui = NearCAUI;
    Object.assign(globalThis, globalHandlers);
  }
  if (typeof window !== 'undefined') {
    window.NearCAUI = NearCAUI;
    window.NearCA = window.NearCA || {};
    window.NearCA.ui = NearCAUI;
    Object.assign(window, globalHandlers);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NearCAUI;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
