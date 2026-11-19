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
    const QRLib = (typeof window !== 'undefined' && window.QRCode) || (typeof globalThis !== 'undefined' && globalThis.QRCode);
    if (QRLib) {
      try {
        new QRLib(container, {
          text: str,
          width: size,
          height: size,
          colorDark: '#06080f',
          colorLight: '#ffffff',
          correctLevel: QRLib.CorrectLevel ? QRLib.CorrectLevel.M : undefined
        });
        return;
      } catch (_) {}
    }
    container.textContent = str;
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

  async function requestBiometricAuth(reason, wallet, overrides = {}) {
    const promptReason = String(reason || t('请验证身份以继续', 'Authenticate to continue'));
    const nativePlugin = getNativeSecurityPlugin(overrides.nativePlugin);
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
        const errMsg = (res && res.error) ? String(res.error) : t('生物识别未通过', 'Biometric authentication failed');
        return {
          ok: false,
          cancelled: Boolean((res && res.cancelled) || /cancel/i.test(errMsg)),
          error: errMsg
        };
      } catch (err) {
        const msg = err && err.message ? String(err.message) : 'Native biometric error';
        return {
          ok: false,
          cancelled: /cancel|abort|dismiss/i.test(msg),
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

  function pressSecurityPinDigit(digit) {
    if (!_secAuthState.wallet || !_secAuthState.wallet.pin) return;
    const clean = String(digit || '').replace(/\D/g, '').slice(0, 1);
    if (!clean) return;
    if (_secAuthState.pinBuffer.length >= _secAuthState.expectedLen) return;
    _secAuthState.pinBuffer += clean;
    renderSecurityPinDots();
    if (_secAuthState.pinBuffer.length >= _secAuthState.expectedLen) {
      if (_secAuthState.pinBuffer === String(_secAuthState.wallet.pin)) {
        finishSecurityAuthModal(true);
      } else {
        showToast(t('交易密码错误', 'Incorrect PIN'));
        _secAuthState.pinBuffer = '';
        renderSecurityPinDots();
      }
    }
  }

  function clearSecurityPin() {
    _secAuthState.pinBuffer = '';
    renderSecurityPinDots();
  }

  function backspaceSecurityPin() {
    _secAuthState.pinBuffer = _secAuthState.pinBuffer.slice(0, -1);
    renderSecurityPinDots();
  }

  async function verifySecurityAuthAsync(wallet, reason = '') {
    const w = wallet || getState().getActiveWallet();
    if (!w) return false;
    const hasPin = Boolean(w.pin);
    const profile = _cachedBioProfile || await detectDeviceBiometricProfileAsync();
    const bioSupported = Boolean(profile && profile.supported);
    // On iOS / Android the native prompt already falls back to the phone unlock passcode; wallet PIN is web-only.
    const nativeAuth = Boolean(getNativeSecurityPlugin());

    // 1. Always try system biometrics first (Face ID / Touch ID / fingerprint / face)
    if (bioSupported) {
      const bioRes = await requestBiometricAuth(reason, w);
      if (bioRes.ok) return true;
      if (!hasPin || nativeAuth) {
        showToast(bioRes.cancelled
          ? t('已取消验证', 'Verification cancelled')
          : (bioRes.error || t('验证未通过', 'Verification failed')));
        return false;
      }
    } else if (!hasPin) {
      showToast(t('请先设置安全 PIN', 'Set a security PIN first'));
      if (typeof openSetWalletPinPrompt === 'function') openSetWalletPinPrompt();
      return false;
    }

    // 2. PIN fallback
    const modalEl = $('sheet-security-auth');
    if (!modalEl || typeof document === 'undefined') {
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        const entered = window.prompt(t('请输入安全 PIN', 'Enter PIN'));
        if (entered === null) return false;
        if (String(entered).trim() !== String(w.pin)) {
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

    const expectedLen = String(w.pin).length >= 4 ? Math.min(6, String(w.pin).length) : 6;
    _secAuthState = {
      resolve: null,
      wallet: w,
      reason: String(reason || ''),
      pinBuffer: '',
      expectedLen
    };

    const reasonEl = $('security-auth-reason');
    if (reasonEl) reasonEl.textContent = reason || t('请输入 PIN', 'Enter PIN');
    const pinSection = $('security-pin-section');
    if (pinSection) pinSection.classList.remove('hidden');
    renderSecurityPinDots();

    const bioBtn = $('btn-security-biometric');
    if (bioBtn) bioBtn.classList.toggle('hidden', !bioSupported);

    openSheet('sheet-security-auth');

    return new Promise((resolve) => {
      _secAuthState.resolve = resolve;
    });
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
    if (typeof _secAuthState.resolve === 'function') {
      const pending = _secAuthState.resolve;
      _secAuthState = { resolve: null, wallet: null, reason: '', pinBuffer: '', expectedLen: 6 };
      pending(false);
    }
    const backdrop = $('sheet-backdrop');
    if (backdrop) backdrop.classList.remove('open');
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
    st.activeTab = ['wallet', 'swap', 'earn', 'hub'].includes(tab) ? tab : 'wallet';

    const views = ['wallet', 'swap', 'earn', 'hub'];
    for (const v of views) {
      const el = $(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== st.activeTab);
    }

    if (typeof document !== 'undefined') {
      document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === st.activeTab);
      });
    }

    if (st.activeTab === 'swap') {
      renderSwapView();
      if (!st.swap.quoteData && st.swap.amountIn) scheduleSwapQuote();
    } else if (st.activeTab === 'earn') {
      if (!st.staking.filter) st.staking.filter = 'featured';
      renderEarnView();
      if (!st.staking.pools) refreshStakingMetrics(false);
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
      ['wallet', 'swap', 'earn', 'hub'].forEach((v) => {
        const el = $(`view-${v}`);
        if (el) el.classList.add('hidden');
      });
      cancelOnboardSubPanel();
    } else {
      switchTab(st.activeTab || 'wallet');
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

  let _pendingCreateMode = 'standard';
  let _pendingImportMode = 'standard';

  function openCreateWalletFlow() {
    const crypto = getCrypto();
    const st = getState();
    if (!crypto || typeof crypto.generateMnemonic !== 'function') {
      showToast(t('加密引擎未就绪', 'Crypto engine unavailable'));
      return;
    }
    _pendingCreateMode = 'standard';
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
    $('onboard-create-pq-badge')?.classList.add('hidden');
    $('onboard-pq-addr-preview')?.classList.add('hidden');
    const hintEl = $('onboard-create-hint');
    if (hintEl) hintEl.textContent = t('请妥善离线保存以下 12 个单词，它是恢复所有链上资产的唯一凭证', 'Store these 12 words safely offline. They control all derived chain accounts.');
    $('onboard-choice-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.add('hidden');
    $('onboard-create-panel')?.classList.remove('hidden');
  }

  async function openCreatePqWalletFlow() {
    const crypto = getCrypto();
    const st = getState();
    if (!crypto || typeof crypto.generateMnemonic !== 'function' || typeof crypto.deriveNearMlDsa65FromMnemonicAsync !== 'function') {
      showToast(t('ML-DSA-65 后量子引擎未就绪', 'ML-DSA-65 engine unavailable'));
      return;
    }
    _pendingCreateMode = 'post_quantum';
    const rawGenerated = crypto.generateMnemonic(24);
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
    $('onboard-create-pq-badge')?.classList.remove('hidden');
    $('onboard-pq-addr-preview')?.classList.remove('hidden');
    const addrEl = $('onboard-pq-addr-val');
    if (addrEl) addrEl.textContent = t('正在派生 0u 后量子地址...', 'Deriving 0u PQ address...');
    const hintEl = $('onboard-create-hint');
    if (hintEl) hintEl.textContent = t('请妥善离线保存以下 24 个单词，它仅用于恢复此独立后量子账户', 'Store these 24 words safely offline. They belong only to this independent post-quantum vault.');
    $('onboard-choice-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.add('hidden');
    $('onboard-create-panel')?.classList.remove('hidden');

    try {
      const pq = await crypto.deriveNearMlDsa65FromMnemonicAsync(phrase, 0);
      if (st.pendingMnemonic === phrase && addrEl) {
        addrEl.textContent = pq.universalAccountId || '--';
      }
    } catch (e) {
      if (addrEl) addrEl.textContent = e && e.message ? e.message : '--';
    }
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
    let nearNamedAccount = '';
    if (contracts && typeof contracts.discoverNearAccountsByPublicKeyAsync === 'function' && derived.nearPublicKey) {
      const discovered = await contracts.discoverNearAccountsByPublicKeyAsync(derived.nearPublicKey).catch(() => []);
      if (discovered.length > 0) nearNamedAccount = discovered[0];
    }
    const idx = st.wallets.length + 1;
    return st.normalizeWalletRecord({
      id: `near_ca_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '').trim() || nearNamedAccount || `Account ${idx}`,
      mnemonic: String(mnemonic).trim(),
      pin: String(pin || '').trim(),
      nearNamedAccount,
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
      btcAddress: derived.btcAddress
    });
  }

  async function buildPqWalletFromInput(inputStr, name = '', pin = '', boundNearId = '') {
    const crypto = getCrypto();
    const st = getState();
    const clean = String(inputStr || '').trim();
    let pq;
    let mnemonic = '';
    if (clean.startsWith('ml-dsa-65:')) {
      pq = crypto.importNearMlDsa65FromSecretKey(clean);
    } else {
      pq = await crypto.deriveNearMlDsa65FromMnemonicAsync(clean, 0);
      mnemonic = pq.mnemonic;
    }
    const nearNamedAccount = String(boundNearId || '').trim().toLowerCase();
    const idx = st.wallets.filter((w) => w.accountType === 'post_quantum').length + 1;
    return st.normalizeWalletRecord({
      id: `near_pq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '').trim() || nearNamedAccount || `PQ Vault ${idx}`,
      accountType: 'post_quantum',
      mnemonic,
      pin: String(pin || '').trim(),
      nearNamedAccount,
      nearAddress: nearNamedAccount || pq.universalAccountId,
      nearUniversalAddress: pq.universalAccountId,
      nearMlDsa65PublicKey: pq.publicKey,
      nearMlDsa65PublicKeyHandle: pq.publicKeyHandle,
      nearMlDsa65PrivateKey: pq.secretKey
    });
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
      const isPqCreate = _pendingCreateMode === 'post_quantum';
      const wallet = isPqCreate
        ? await buildPqWalletFromInput(phrase, name, pin, '')
        : await buildWalletFromMnemonic(phrase, name, pin);
      st.wallets.push(wallet);
      st.activeWalletId = wallet.id;
      st.pendingMnemonic = '';
      _pendingCreateMode = 'standard';
      _isAddingAdditionalWallet = false;
      st.activeTab = 'wallet';
      st.saveWallets();
      showToast(isPqCreate ? t('后量子账户已创建', 'Post-quantum vault created') : t('钱包已创建', 'Wallet created'));
      renderAll();
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(e && e.message ? e.message : t('创建失败', 'Create failed'));
    }
  }

  function setOnboardImportMode(mode) {
    _pendingImportMode = mode === 'post_quantum' ? 'post_quantum' : 'standard';
    const isPq = _pendingImportMode === 'post_quantum';
    if ($('btn-import-mode-std')) $('btn-import-mode-std').className = isPq ? 'btn-secondary flex-1' : 'btn-primary flex-1';
    if ($('btn-import-mode-pq')) $('btn-import-mode-pq').className = isPq ? 'btn-primary flex-1' : 'btn-secondary flex-1';
    $('onboard-import-near-id')?.classList.toggle('hidden', !isPq);
    const ta = $('onboard-import-phrase');
    if (ta) {
      ta.placeholder = isPq
        ? t('输入 24 个英文助记词，或 ml-dsa-65:... 后量子私钥', 'Enter 24 BIP-39 words or ml-dsa-65:... secret key')
        : t('输入 12 或 24 个英文助记词，使用空格分隔', 'Enter 12 or 24 BIP-39 words separated by spaces');
    }
    validateOnboardImportLive();
  }

  function openImportWalletFlow() {
    $('onboard-choice-panel')?.classList.add('hidden');
    $('onboard-create-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.remove('hidden');
    const ta = $('onboard-import-phrase');
    if (ta) ta.value = '';
    const nearIdInp = $('onboard-import-near-id');
    if (nearIdInp) nearIdInp.value = '';
    const status = $('onboard-import-status');
    if (status) status.textContent = '';
    setOnboardImportMode('standard');
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
    if (_pendingImportMode === 'post_quantum' && phrase.startsWith('ml-dsa-65:')) {
      try {
        const pq = crypto.importNearMlDsa65FromSecretKey(phrase);
        statusEl.style.color = 'var(--near-emerald)';
        statusEl.textContent = t(`✓ 有效 ML-DSA-65 私钥 (${shortenAddr(pq.universalAccountId, 8, 6)})`, `✓ Valid ML-DSA-65 key (${shortenAddr(pq.universalAccountId, 8, 6)})`);
        return { valid: true, isRawSecretKey: true };
      } catch (err) {
        statusEl.style.color = 'var(--rose-alert)';
        statusEl.textContent = (err && err.message) || t('ML-DSA-65 私钥格式无效', 'Invalid ML-DSA-65 secret key');
        return { valid: false };
      }
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
    const boundNearId = ($('onboard-import-near-id')?.value || '').trim().toLowerCase();

    if (_pendingImportMode === 'post_quantum') {
      if (!raw.startsWith('ml-dsa-65:')) {
        const check = crypto.validateMnemonic(raw);
        if (!check.valid) {
          showToast(check.error || t('无效后量子助记词或私钥', 'Invalid PQ phrase or secret key'));
          return;
        }
      }
      try {
        const wallet = await buildPqWalletFromInput(raw, name, '', boundNearId);
        const existing = st.wallets.find(
          (w) => w.accountType === 'post_quantum' && w.nearMlDsa65PublicKey && w.nearMlDsa65PublicKey === wallet.nearMlDsa65PublicKey
        );
        if (existing) {
          st.activeWalletId = existing.id;
          showToast(t('已切换至该后量子账户', 'Switched to existing PQ vault'));
        } else {
          st.wallets.push(wallet);
          st.activeWalletId = wallet.id;
          showToast(t('后量子账户导入成功', 'Post-quantum vault imported'));
        }
        st.saveWallets();
        renderAll();
        refreshAllBalancesAsync(true);
      } catch (e) {
        showToast(e && e.message ? e.message : t('导入失败', 'Import failed'));
      }
      return;
    }

    const check = crypto.validateMnemonic(raw);
    if (!check.valid) {
      showToast(check.error || t('无效助记词', 'Invalid recovery phrase'));
      return;
    }
    const normalizedPhrase = check.words.join(' ');
    try {
      const wallet = await buildWalletFromMnemonic(normalizedPhrase, name, '');
      const existing = st.wallets.find((w) => w.accountType !== 'post_quantum' && w.nearAddress && w.nearAddress === wallet.nearAddress);
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

  function startAdditionalPqWalletCreate() {
    closeAllSheets();
    _isAddingAdditionalWallet = true;
    ['wallet', 'swap', 'earn', 'hub'].forEach((v) => $(`view-${v}`)?.classList.add('hidden'));
    $('bottom-nav')?.classList.add('hidden');
    $('view-onboarding')?.classList.remove('hidden');
    openCreatePqWalletFlow();
  }

  function startAdditionalWalletCreate() {
    closeAllSheets();
    _isAddingAdditionalWallet = true;
    ['wallet', 'swap', 'earn', 'hub'].forEach((v) => $(`view-${v}`)?.classList.add('hidden'));
    $('bottom-nav')?.classList.add('hidden');
    $('view-onboarding')?.classList.remove('hidden');
    openCreateWalletFlow();
  }

  function startAdditionalWalletImport() {
    closeAllSheets();
    _isAddingAdditionalWallet = true;
    ['wallet', 'swap', 'earn', 'hub'].forEach((v) => $(`view-${v}`)?.classList.add('hidden'));
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
      const isPq = w.accountType === 'post_quantum';
      const nearId = w.nearNamedAccount || shortenAddr(w.nearAddress || w.nearUniversalAddress, 8, 6);
      return `
        <div class="ios-glass-card flex items-center justify-between gap-2" style="padding:12px;border-color:${isActive ? 'rgba(0,236,151,0.45)' : 'var(--border-glass)'};">
          <div class="min-w-0 flex-1" style="cursor:pointer;" onclick="switchActiveWallet('${escapeHtml(w.id)}')">
            <div class="flex items-center gap-2">
              <span style="font-weight:700;color:#fff;">${escapeHtml(w.name)}</span>
              ${isPq ? `<span class="badge badge-cyan">PQ · ML-DSA-65</span>` : ''}
              ${isActive ? `<span class="ca-badge">${t('当前', 'Active')}</span>` : ''}
            </div>
            <div class="mono text-emerald" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(nearId)}</div>
          </div>
          ${st.wallets.length > 1
            ? `<button type="button" class="btn-danger" onclick="deleteWalletById('${escapeHtml(w.id)}')">${t('删除', 'Delete')}</button>`
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

    const isPq = wallet.accountType === 'post_quantum';
    const rows = isPq
      ? [
          { label: t('助记词 (24词)', 'Recovery Phrase (24 Words)'), val: wallet.mnemonic || t('由原始私钥导入', 'Imported via Secret Key'), secret: Boolean(wallet.mnemonic) },
          { label: t('NEAR 后量子账户', 'NEAR PQ Account'), val: wallet.nearNamedAccount || wallet.nearUniversalAddress || wallet.nearAddress, secret: false },
          { label: t('ML-DSA-65 公钥摘要', 'ML-DSA-65 Key Handle'), val: wallet.nearMlDsa65PublicKeyHandle, secret: false },
          { label: t('ML-DSA-65 私钥', 'ML-DSA-65 Secret Key'), val: wallet.nearMlDsa65PrivateKey, secret: true }
        ]
      : [
          { label: t('助记词 (12/24词)', 'Recovery Phrase'), val: wallet.mnemonic, secret: true },
          { label: t('NEAR 主账户', 'NEAR Master Account'), val: wallet.nearNamedAccount || wallet.nearAddress, secret: false },
          { label: t('NEAR 主私钥', 'NEAR Master Private Key'), val: wallet.nearPrivateKey, secret: true },
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
          <button type="button" id="btn-backup-reveal-toggle" class="btn-secondary" style="margin-top:6px;padding:7px 12px;font-size:12px;" onclick="toggleBackupKeysReveal()">${escapeHtml(t('显示助记词与私钥', 'Reveal Phrase & Keys'))}</button>
        </div>
      `;
      const hint = isPq
        ? `<div style="font-size:11.5px;color:var(--text-secondary);padding:4px 2px;">${escapeHtml(t('此账户为独立 ML-DSA-65 后量子金库，仅用于 NEAR 链上资产。', 'Independent ML-DSA-65 post-quantum vault for NEAR assets.'))}</div>`
        : `<div style="font-size:11.5px;color:var(--text-secondary);padding:4px 2px;">${escapeHtml(t('EVM、Solana、Bitcoin、Pearl 均由当前 NEAR 主账户通过 v1.signer MPC 统一控制。', 'EVM, Solana, Bitcoin & Pearl accounts are controlled by this NEAR Master Account via v1.signer MPC.'))}</div>`;
      container.innerHTML = warnBox + hint + rows.map((r) => `
        <div class="meta-list">
          <div class="meta-row">
            <span class="meta-key">${escapeHtml(r.label)}</span>
            <button type="button" class="btn-ghost-sm" onclick="copyTextValue(this.dataset.val, this.dataset.label)" data-val="${escapeHtml(r.val || '')}" data-label="${escapeHtml(r.label)}">${t('复制', 'Copy')}</button>
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
    if (wallet.pin && !(await verifySecurityAuthAsync(wallet, t('修改钱包安全密码', 'Update wallet PIN')))) return;
    wallet.pin = nextPin;
    st.saveWallets();
    closeAllSheets();
    renderHubBiometricCardAsync();
    showToast(nextPin ? t('安全密码已更新', 'PIN updated') : t('已清除安全密码', 'PIN cleared'));
  }

  // ==================== Multi-Chain Balance & Price Sync ====================

  function getSymbolPrice(symbol) {
    const tokens = getTokens();
    const st = getState();
    const symUpper = String(symbol || '').toUpperCase();
    const dexLists = tokens.DEX_CHAIN_TOKENS && typeof tokens.DEX_CHAIN_TOKENS === 'object'
      ? Object.values(tokens.DEX_CHAIN_TOKENS)
      : [];
    const lists = [st.liveTokens || [], tokens.UNIFIED_CORE_TOKENS || [], st.dynamicSolTokens || [], ...dexLists];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      const hit = list.find((item) => item && String(item.symbol || '').toUpperCase() === symUpper && typeof item.price === 'number' && item.price > 0);
      if (hit) return hit.price;
    }
    if (symUpper === 'WNEAR') return getSymbolPrice('NEAR');
    if (symUpper === 'WETH') return getSymbolPrice('ETH');
    return null;
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

  async function fetchBitcoinNativeBalance(btcAddress) {
    if (!btcAddress || typeof fetch !== 'function') return null;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
      try {
        const resp = await fetch(
          `https://mempool.space/api/address/${encodeURIComponent(btcAddress)}`,
          controller ? { signal: controller.signal } : {}
        );
        if (!resp.ok) return null;
        const data = await resp.json();
        const stats = data && data.chain_stats ? data.chain_stats : null;
        if (!stats) return null;
        const sats = Number(stats.funded_txo_sum || 0) - Number(stats.spent_txo_sum || 0);
        return Number.isFinite(sats) ? sats / 1e8 : null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch (_) {
      return null;
    }
  }

  let _isRefreshing = false;

  async function refreshAllBalancesAsync(showFeedback = false) {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const tokens = getTokens();
    const mining = getMining();
    const wallet = st.getActiveWallet();
    if (!wallet || _isRefreshing) return;

    _isRefreshing = true;

    try {
      await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
      if (!wallet.nearNamedAccount && wallet.nearPublicKey && !wallet._nearAccountChecked && typeof contracts.discoverNearAccountsByPublicKeyAsync === 'function') {
        wallet._nearAccountChecked = true;
        const discovered = await contracts.discoverNearAccountsByPublicKeyAsync(wallet.nearPublicKey).catch(() => []);
        if (discovered.length > 0) {
          wallet.nearNamedAccount = discovered[0];
          wallet.discoveredNearAccounts = discovered;
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          st.saveWallets();
        }
      }
      const nearAccountId = wallet.nearNamedAccount || wallet.nearAddress;

      const solTokens = (tokens.DEX_CHAIN_TOKENS && tokens.DEX_CHAIN_TOKENS.sol) || [];
      const solMints = solTokens.map((x) => x.contractAddress).filter((m) => m && m !== 'So11111111111111111111111111111111111111112');

      const evmAllChainKeys = ['eth', 'base', 'arb', 'bsc', 'hype', 'hood', 'arc'];
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
        if (_progRenderTimer || typeof setTimeout !== 'function') return;
        _progRenderTimer = setTimeout(() => {
          _progRenderTimer = null;
          st.syncWalletCompatBalances(wallet);
          if (st.activeTab === 'wallet') {
            renderHeaderAndHero();
            renderUnifiedAssetList();
          }
          const ds = $('sheet-token-detail');
          if (ds && ds.classList && ds.classList.contains('open')) {
            renderTokenDetailSheet();
          }
        }, 80);
      };

      if (nearAccountId && typeof contracts.fetchNearAccountStakingPositionsAsync === 'function') {
        contracts.fetchNearAccountStakingPositionsAsync(nearAccountId).then((list) => {
          if (Array.isArray(list)) {
            wallet.nearStakingPositions = list;
            st.saveWallets();
            if (st.activeTab === 'earn') renderEarnView();
          }
        }).catch(() => {});
      }
      if (wallet.solAddress && typeof contracts.fetchSolanaAccountStakingPositionsAsync === 'function') {
        contracts.fetchSolanaAccountStakingPositionsAsync(wallet.solAddress).then((list) => {
          if (Array.isArray(list)) {
            wallet.solStakingPositions = list;
            st.saveWallets();
            if (st.activeTab === 'earn') renderEarnView();
          }
        }).catch(() => {});
      }
      if (wallet.address && mining) {
        mining.queryMinerDeepStats(wallet.address, 'onchain').then((res) => {
          if (res && typeof res.onChainBalancePrl === 'number' && Number.isFinite(res.onChainBalancePrl)) {
            wallet.nativeBalances.prl = res.onChainBalancePrl;
            st.syncWalletCompatBalances(wallet);
            st.saveWallets();
            scheduleProgressiveWalletRender();
          }
        }).catch(() => {});
      }
      if (wallet.btcAddress) {
        fetchBitcoinNativeBalance(wallet.btcAddress).then((bal) => {
          if (typeof bal === 'number' && Number.isFinite(bal)) {
            wallet.nativeBalances.btc = bal;
            st.syncWalletCompatBalances(wallet);
            st.saveWallets();
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
        intents.fetchLiveDefuseTokenPrices({ useCache: !showFeedback }).then((res) => {
          if (Array.isArray(res)) {
            st.liveTokens = res;
            st.pricesUpdatedAt = Date.now();
            if (typeof st.saveCachedLiveTokens === 'function') st.saveCachedLiveTokens(res);
            scheduleProgressiveWalletRender();
          }
          return res;
        }).catch(() => null),
        nearAccountId ? intents.fetchNearNativeBalance(nearAccountId).then((v) => {
          if (typeof v === 'number' && Number.isFinite(v)) {
            wallet.nativeBalances.near = v;
            scheduleProgressiveWalletRender();
          }
          return v;
        }).catch(() => null) : Promise.resolve(null),
        (nearAccountId && typeof intents.fetchNearNep141Balances === 'function')
          ? intents.fetchNearNep141Balances(nearAccountId).then((map) => {
              if (map && typeof map === 'object') {
                wallet.nearNep141Balances = { ...(wallet.nearNep141Balances || {}), ...map };
                scheduleProgressiveWalletRender();
              }
              return map;
            }).catch(() => null)
          : Promise.resolve(null),
        wallet.solAddress ? contracts.fetchSolanaNativeAndSplBalances(wallet.solAddress, solMints).then((res) => {
          if (res && typeof res === 'object') {
            if (typeof res.nativeSol === 'number') wallet.nativeBalances.sol = res.nativeSol;
            if (res.tokens && typeof res.tokens === 'object') {
              for (const [mint, info] of Object.entries(res.tokens)) {
                if (info && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
                  wallet.splBalances[mint] = info.formatted;
                }
              }
            }
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
            if (res) {
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

      if (Array.isArray(pricesRes)) {
        st.liveTokens = pricesRes;
        st.pricesUpdatedAt = Date.now();
        if (typeof st.saveCachedLiveTokens === 'function') st.saveCachedLiveTokens(pricesRes);
      }

      if (typeof nearBalRes === 'number' && Number.isFinite(nearBalRes)) {
        wallet.nativeBalances.near = nearBalRes;
      }

      if (nep141BalRes && typeof nep141BalRes === 'object') {
        wallet.nearNep141Balances = { ...(wallet.nearNep141Balances || {}), ...nep141BalRes };
      }

      if (solBalRes && typeof solBalRes === 'object') {
        if (typeof solBalRes.nativeSol === 'number') {
          wallet.nativeBalances.sol = solBalRes.nativeSol;
        }
        if (solBalRes.tokens && typeof solBalRes.tokens === 'object') {
          for (const [mint, info] of Object.entries(solBalRes.tokens)) {
            if (info && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
              wallet.splBalances[mint] = info.formatted;
            }
          }
        }
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
      _isRefreshing = false;
    }
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
      { sym: 'ETH', chain: 'hood', name: 'Robinhood Chain', balKey: 'hood', assetId: 'nep141:hood.omft.near', decimals: 18 },
      { sym: 'USDC', chain: 'arc', name: 'Arc Network', balKey: 'arc', assetId: 'arc:native:usdc', decimals: 18 },
      { sym: 'BNB', chain: 'bsc', name: 'BNB Smart Chain', balKey: 'bsc', assetId: 'nep141:bnb.omdep.near', decimals: 18 },
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

      if (wallet.accountType === 'post_quantum') {
        visibleEntries = visibleEntries.filter((e) => e.blockchain === 'near');
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
                      <button type="button" class="mini-action-btn primary" onclick="event.stopPropagation();quickActionSwapFromEntry('${escapeHtml(e.assetId)}','${escapeHtml(e.blockchain)}','${escapeHtml(e.contractAddress || '')}')">${t('闪兑', 'Swap')}</button>
                      <button type="button" class="mini-action-btn" onclick="event.stopPropagation();quickActionSendFromEntry('${escapeHtml(g.symbol)}','${escapeHtml(e.blockchain)}','${escapeHtml(e.assetId)}','${escapeHtml(e.contractAddress || '')}')">${t('转账', 'Send')}</button>
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
          <button type="button" class="asset-parent-row" onclick="openTokenDetailSheet('${escapeHtml(g.symbolKey)}')">
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
    if (bc === 'prl') return `https://explorer.prlscan.com/address/${enc}`;
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
    if (bc === 'prl') return `https://explorer.prlscan.com/tx/${enc}`;
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
    const stale = !st.staking.pools || !st.staking.updatedAt || (Date.now() - st.staking.updatedAt > 60_000);
    if (stale && !st.staking.loading) {
      refreshStakingMetrics(false);
    }
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

  function getMergedTokenHistoryItems(wallet, symKey, chainFilter) {
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

    const remoteList = Array.isArray(_tokenDetailState.historyItems) ? _tokenDetailState.historyItems : [];
    const byKey = new Map();
    for (const item of [...matchedLocal, ...remoteList]) {
      const key = item.txHash ? `${item.txHash.toLowerCase()}_${item.chain || ''}` : item.id;
      if (!byKey.has(key)) {
        byKey.set(key, item);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  }

  function renderTokenDetailHistoryList() {
    const listEl = $('token-detail-history-list');
    if (!listEl) return;
    const st = getState();
    const wallet = st.getActiveWallet();
    const tokens = getTokens();
    const symKey = _tokenDetailState.symbolKey;
    const chainFilter = _tokenDetailState.chainFilter || 'all';
    if (!wallet || !symKey) {
      listEl.innerHTML = '';
      return;
    }

    const items = getMergedTokenHistoryItems(wallet, symKey, chainFilter);
    if (_tokenDetailState.historyLoading && items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:8px 0;">${escapeHtml(t('正在加载链上交易记录...', 'Loading on-chain activity...'))}</div>`;
      return;
    }
    if (items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:8px 0;">${escapeHtml(t('暂无该代币链上变动记录，可点击右上方前往区块浏览器查看', 'No recent token activity found; click Explorer above to view on-chain'))}</div>`;
      return;
    }

    const typeLabels = {
      receive: { zh: '转入', en: 'Receive', color: 'var(--near-emerald)' },
      send: { zh: '转出', en: 'Send', color: 'var(--rose-alert)' },
      swap: { zh: '闪兑', en: 'Swap', color: 'var(--cyan-glow)' },
      stake: { zh: '质押', en: 'Stake', color: '#a78bfa' },
      unstake: { zh: '解质押', en: 'Unstake', color: '#fbbf24' },
      mine: { zh: '挖矿', en: 'Mining', color: '#fbbf24' },
      tx: { zh: '链上', en: 'On-Chain', color: 'var(--text-secondary)' },
      failed: { zh: '失败', en: 'Failed', color: 'var(--rose-alert)' }
    };

    listEl.innerHTML = items.slice(0, 20).map((it) => {
      const badge = typeLabels[it.type] || typeLabels.tx;
      const chainMeta = it.chain ? tokens.getChainMeta(it.chain) : null;
      const netTag = chainMeta ? chainMeta.shortName : (it.chain ? it.chain.toUpperCase() : '');
      const amtStr = (typeof it.amount === 'number' && Number.isFinite(it.amount))
        ? `${it.type === 'send' ? '-' : (it.type === 'receive' || it.type === 'mine' ? '+' : '')}${formatBal(it.amount, 5)} ${escapeHtml(it.symbol || symKey)}`
        : '';
      const timeStr = formatActivityTime(it.timestamp);
      const txUrl = it.txHash ? getExplorerTxUrl(it.chain, it.txHash) : '';
      const txShort = it.txHash ? shortenAddr(it.txHash, 6, 4) : '';
      const subText = [netTag, it.title, timeStr, txShort].filter(Boolean).join(' · ');
      const tagOpen = txUrl
        ? `<a href="${escapeHtml(txUrl)}" target="_blank" rel="noopener noreferrer" class="detail-row-item" style="text-decoration:none;color:inherit;">`
        : `<div class="detail-row-item">`;
      const tagClose = txUrl ? `</a>` : `</div>`;
      return `
        ${tagOpen}
          <div class="flex flex-col" style="min-width:0;flex:1;gap:2px;">
            <div class="flex items-center gap-2">
              <span class="mono" style="font-size:11px;font-weight:700;color:${badge.color};">${escapeHtml(t(badge.zh, badge.en))}</span>
              <span style="font-size:11.5px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(it.title || netTag || symKey)}</span>
            </div>
            <span class="mono" style="font-size:10.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(subText)}</span>
          </div>
          <div class="flex flex-col" style="text-align:right;flex-shrink:0;">
            ${amtStr ? `<span class="mono" style="font-size:12px;font-weight:700;color:${badge.color};">${amtStr}</span>` : ''}
            ${txUrl ? `<span style="font-size:10.5px;color:var(--text-secondary);">↗</span>` : ''}
          </div>
        ${tagClose}
      `;
    }).join('');
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
      const allPill = `<button type="button" class="filter-pill ${chainFilter === 'all' ? 'active' : ''}" onclick="setTokenDetailChain('all')">${escapeHtml(t('全部网络', 'All Networks'))}</button>`;
      const netPills = Array.from(chainTotals.values()).map((ct) => {
        const meta = tokens.getChainMeta(ct.blockchain);
        const balSuffix = typeof ct.balance === 'number' && ct.balance > 0 ? ` · ${formatBal(ct.balance, 4)}` : '';
        return `<button type="button" class="filter-pill ${chainFilter === ct.blockchain ? 'active' : ''}" onclick="setTokenDetailChain('${escapeHtml(ct.blockchain)}')">${escapeHtml((meta.shortName || meta.name) + balSuffix)}</button>`;
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
      explorerEl.href = url || '#';
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
          const cleanNetName = e.kind === 'nep141'
            ? `${meta.name} (NEP-141)`
            : (meta.name || e.networkName);
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
                <button type="button" class="mini-action-btn primary" onclick="closeAllSheets();quickActionSwapFromEntry('${escapeHtml(e.assetId)}','${escapeHtml(e.blockchain)}','${escapeHtml(e.contractAddress || '')}')">${escapeHtml(t('闪兑', 'Swap'))}</button>
                <button type="button" class="mini-action-btn" onclick="quickActionSendFromEntry('${escapeHtml(group.symbol)}','${escapeHtml(e.blockchain)}','${escapeHtml(e.assetId)}','${escapeHtml(e.contractAddress || '')}')">${escapeHtml(t('转账', 'Send'))}</button>
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
            <button type="button" class="detail-row-item detail-row-clickable" onclick="openTokenDetailPool('${escapeHtml(p.id)}')">
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
      const receiveNet = ['eth', 'base', 'arb', 'bsc', 'hype', 'hood'].includes(bc) ? 'evm' : bc;
      closeAllSheets();
      openReceiveSheet(receiveNet);
      return;
    }
    if (act === 'swap' || act === 'bridge') {
      closeAllSheets();
      quickActionSwapFromEntry(entry.assetId, entry.blockchain, entry.contractAddress || '');
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
        const data = await fetchJsonWithTimeout(`https://api.prlscan.com/v1/addresses/${encodeURIComponent(wallet.address)}/txs?limit=15`);
        const txs = Array.isArray(data) ? data : (Array.isArray(data && data.txs) ? data.txs : (Array.isArray(data && data.items) ? data.items : []));
        return txs.map((tx) => {
          const delta = Number(tx.delta_grains || 0) / 1e8;
          const isCoinbase = Boolean(tx.is_coinbase);
          const type = isCoinbase ? 'mine' : (delta >= 0 ? 'receive' : 'send');
          const rawTime = tx.time !== undefined ? tx.time : (tx.timestamp !== undefined ? tx.timestamp : tx.block_time);
          const tsNum = typeof rawTime === 'number'
            ? (rawTime > 1e12 ? Math.floor(rawTime / 1000) : rawTime)
            : (rawTime ? Math.floor(Date.parse(rawTime) / 1000) : null);
          return {
            id: `prl_${tx.txid || tx.hash}`,
            type,
            symbol: 'PRL',
            chain: 'prl',
            amount: Number.isFinite(delta) ? Math.abs(delta) : null,
            txHash: tx.txid || tx.hash || '',
            title: isCoinbase ? t('区块挖矿奖励', 'Mining Reward') : t('Pearl L1 转账', 'Pearl L1 Transfer'),
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

    if (targetChains.includes('eth') && wallet.evmAddress) {
      tasks.push((async () => {
        const isNativeEth = symKey === 'ETH';
        const endpoint = isNativeEth
          ? `https://eth.blockscout.com/api/v2/addresses/${encodeURIComponent(wallet.evmAddress)}/transactions`
          : `https://eth.blockscout.com/api/v2/addresses/${encodeURIComponent(wallet.evmAddress)}/token-transfers`;
        const data = await fetchJsonWithTimeout(endpoint);
        const items = Array.isArray(data && data.items) ? data.items : [];
        const addrLower = wallet.evmAddress.toLowerCase();
        const out = [];
        for (const it of items) {
          if (!isNativeEth) {
            const tokSym = String(it.token && it.token.symbol || '').toUpperCase();
            if (tokSym !== symKey) continue;
            const dec = Number((it.token && it.token.decimals) || (it.total && it.total.decimals) || 18);
            const rawVal = Number((it.total && it.total.value) || 0);
            const fromHash = String(it.from && it.from.hash || '').toLowerCase();
            const isIn = fromHash !== addrLower;
            out.push({
              id: `eth_tok_${it.tx_hash || it.transaction_hash}_${out.length}`,
              type: isIn ? 'receive' : 'send',
              symbol: symKey,
              chain: 'eth',
              amount: Number.isFinite(rawVal) ? rawVal / (10 ** dec) : null,
              txHash: it.tx_hash || it.transaction_hash || '',
              title: isIn ? `${t('来自', 'From')} ${shortenAddr(it.from && it.from.hash)}` : `${t('至', 'To')} ${shortenAddr(it.to && it.to.hash)}`,
              timestamp: it.timestamp ? Math.floor(Date.parse(it.timestamp) / 1000) : null
            });
          } else {
            const fromHash = String(it.from && it.from.hash || '').toLowerCase();
            const isIn = fromHash !== addrLower;
            const valEth = Number(it.value || 0) / 1e18;
            out.push({
              id: `eth_tx_${it.hash}`,
              type: isIn ? 'receive' : 'send',
              symbol: 'ETH',
              chain: 'eth',
              amount: Number.isFinite(valEth) ? valEth : null,
              txHash: it.hash || '',
              title: isIn ? `${t('来自', 'From')} ${shortenAddr(it.from && it.from.hash)}` : `${t('至', 'To')} ${shortenAddr(it.to && it.to.hash)}`,
              timestamp: it.timestamp ? Math.floor(Date.parse(it.timestamp) / 1000) : null
            });
          }
        }
        return out;
      })());
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
      if (typeof document !== 'undefined' && document.hidden) return;
      const st = getState();
      if (st && st.getActiveWallet() && !_isRefreshing) {
        refreshAllBalancesAsync(false);
      }
    }, 15000);
    return _autoSyncTimer;
  }

  // ==================== Header & Home Wallet Rendering ====================

  function renderHeaderAndHero() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const isPq = wallet.accountType === 'post_quantum';
    const nearId = wallet.nearNamedAccount || wallet.nearUniversalAddress || wallet.nearAddress || '';
    const displayId = wallet.nearNamedAccount ? wallet.nearNamedAccount : shortenAddr(nearId, 6, 4);

    const headerLbl = $('header-account-label');
    if (headerLbl) headerLbl.textContent = displayId;

    const caBadge = document.querySelector('#header-account-pill .ca-badge');
    if (caBadge) {
      caBadge.textContent = isPq ? 'PQ · ML-DSA-65' : 'NEAR CA';
    }

    const heroNearId = $('hero-near-id');
    if (heroNearId) heroNearId.textContent = wallet.nearNamedAccount || shortenAddr(nearId, 10, 8);

    const regBtn = $('btn-hero-register-near');
    if (regBtn) {
      regBtn.classList.toggle('hidden', isPq || Boolean(wallet.nearNamedAccount));
    }

    const mpcBtn = $('header-mpc-btn');
    if (mpcBtn) {
      mpcBtn.classList.toggle('hidden', isPq);
    }

    const wcDot = $('header-wc-dot');
    if (wcDot) {
      const hasSessions = st.wc.client && Object.keys(st.wc.client.getActiveSessions() || {}).length > 0;
      wcDot.classList.toggle('connected', Boolean(hasSessions));
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
    switchTab('hub');
    const inp = $('hub-near-domain-input');
    if (inp) inp.focus();
  }

  function focusMpcInspector() {
    switchTab('hub');
    const card = $('hub-mpc-card');
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ==================== Unified Send Sheet (100% Real On-Chain Balances) ====================

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
    if (isNativeContract && ['eth', 'base', 'arb', 'bsc', 'hype', 'hood', 'arc'].includes(bc)) {
      return wallet.nativeBalances[bc];
    }
    if (bc === 'sol' && contractAddress && wallet.splBalances) {
      const v = wallet.splBalances[contractAddress];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    if (contractAddress && ['eth', 'base', 'arb', 'bsc', 'hype', 'hood', 'arc'].includes(bc)) {
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

    if ($('send-recipient-input')) $('send-recipient-input').value = opts.recipient || '';
    if ($('send-amount-input')) $('send-amount-input').value = '';
    if ($('send-detected-net')) $('send-detected-net').textContent = '';
    $('send-route-preview')?.classList.add('hidden');

    updateSendAvailabilityUI();
    openSheet('sheet-send');
  }

  function handleSendAssetChange() {
    const sym = ($('send-asset-select')?.value || '').toUpperCase();
    populateSendSourceSelect(sym);
    updateSendAvailabilityUI();
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

    const reserves = { near: 0.005, sol: 0.002, eth: 0.0015, base: 0.0002, arb: 0.0002, bsc: 0.0005, hype: 0.0005, hood: 0.0002, arc: 0.02, prl: 0.001, btc: 0.0001 };
    const isNativeGas = !asset.contractAddress ||
      asset.blockchain === 'prl' ||
      asset.contractAddress === 'So11111111111111111111111111111111111111112' ||
      asset.contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      asset.contractAddress === 'wrap.near';
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
    if (!labelEl) return;
    if (!addr) {
      labelEl.textContent = '';
      return;
    }
    const net = crypto.detectAddressNetwork(addr);
    if (net) {
      const meta = tokens.getChainMeta(net === 'evm' ? 'eth' : net);
      labelEl.style.color = 'var(--cyan-glow)';
      labelEl.textContent = `${t('已识别目标网络', 'Detected Network')}: ${net === 'evm' ? 'EVM (0x...)' : meta.name}`;
    } else {
      labelEl.style.color = 'var(--rose-alert)';
      labelEl.textContent = t('无法识别地址格式，请核对', 'Unrecognized address format');
    }
  }

  function resolveDestinationAssetForNetwork(symbol, detectedNet, fallbackAssetId) {
    const tokens = getTokens();
    const symUpper = String(symbol || '').toUpperCase();
    const core = tokens.UNIFIED_CORE_TOKENS || [];
    const targetChain = detectedNet === 'evm' ? 'eth' : detectedNet;
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
    if (targetChain === 'eth') {
      const anyEvm = core.find((c) => ['eth', 'base', 'arb', 'bsc'].includes(c.blockchain) && String(c.symbol).toUpperCase() === symUpper);
      if (anyEvm) return anyEvm;
    }
    return core.find((c) => c.assetId === fallbackAssetId) || { assetId: fallbackAssetId, blockchain: targetChain, symbol };
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
      asset.contractAddress === 'So11111111111111111111111111111111111111112' ||
      asset.contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      asset.contractAddress === 'wrap.near';
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
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const isEvmOrigin = ['eth', 'base', 'arb', 'bsc', 'hype', 'hood', 'arc'].includes(asset.blockchain);
      const isSameChain =
        (asset.blockchain === 'near' && detectedNet === 'near') ||
        (asset.blockchain === 'sol' && detectedNet === 'sol') ||
        (isEvmOrigin && detectedNet === 'evm') ||
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
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ PRL ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }
        if (asset.blockchain === 'btc') {
          throw new Error(t('Bitcoin 原生 UTXO 转账需专用 UTXO 构造节点，暂不支持直接发送', 'Bitcoin UTXO broadcast is unsupported directly'));
        }
        throw new Error(t('该同链代币转账暂未接通签名广播', 'Direct transfer unsupported for this token'));
      }

      // Case 2: Cross-chain L1 -> L1 transfer via 1Click ORIGIN_CHAIN -> DESTINATION_CHAIN
      const canBroadcastOrigin =
        asset.blockchain === 'near' ||
        asset.blockchain === 'sol' ||
        asset.blockchain === 'prl' ||
        (isEvmOrigin && asset.blockchain !== 'arc');

      if (!canBroadcastOrigin) {
        throw new Error(t('所选源链暂不支持自动签名跨链，请在收款网络切换或使用支持的源链', 'Origin chain does not support automated cross-chain broadcast'));
      }

      const destAsset = resolveDestinationAssetForNetwork(asset.symbol, detectedNet, asset.assetId);
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

      const nearSenderAccount = wallet.nearNamedAccount || wallet.nearAddress;
      if (depositTxHash) {
        await intents.submitExternalDepositTxHash({
          depositAddress: quote.depositAddress,
          txHash: depositTxHash,
          nearSenderAccount
        }).catch(() => {});
      }

      recordWalletActivity(wallet, {
        type: 'send',
        symbol: asset.symbol,
        chain: asset.blockchain,
        amount: amountNum,
        txHash: depositTxHash || quote.depositAddress,
        title: `${t('跨链转账至', 'Cross-chain to')} ${shortenAddr(recipient)}`
      });
      showToast(`✅ ${t('跨链转账已广播', 'Cross-chain transfer sent')}: ${shortenAddr(depositTxHash || quote.depositAddress)}`);
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
    st.receive.selectedNetwork = networkKey;
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

    const isPq = wallet.accountType === 'post_quantum';
    const options = isPq
      ? [{ key: 'near', label: 'NEAR (ML-DSA-65)', addr: wallet.nearNamedAccount || wallet.nearUniversalAddress || wallet.nearAddress }]
      : [
          { key: 'near', label: 'NEAR (.near / NEP-141)', addr: wallet.nearNamedAccount || wallet.nearAddress },
          { key: 'evm', label: 'EVM (ETH/Base/ARB/BSC/Robinhood · v1.signer)', addr: wallet.mpcEvmAddress || wallet.evmAddress },
          { key: 'arc', label: 'Arc Network (USDC · v1.signer)', addr: wallet.mpcEvmAddress || wallet.evmAddress },
          { key: 'sol', label: 'Solana (SOL/SPL · v1.signer)', addr: wallet.solAddress },
          { key: 'btc', label: 'Bitcoin (BTC · v1.signer)', addr: wallet.btcAddress },
          { key: 'prl', label: 'Pearl (PRL 主网)', addr: wallet.address },
          { key: 'qtc', label: t('QTC (Quantus 跨链收款)', 'QTC (Quantus Deposit)'), addr: wallet.qtcDepositAddress || '' }
        ];

    const pillsEl = $('receive-network-pills');
    if (pillsEl) {
      pillsEl.innerHTML = options.map((o) => `
        <button type="button" class="filter-pill ${st.receive.selectedNetwork === o.key ? 'active' : ''}" onclick="selectReceiveNetwork('${o.key}')">${escapeHtml(o.label)}</button>
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

  function getSwapTokenCatalog() {
    const st = getState();
    const tokens = getTokens();
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
    for (const item of (tokens.UNIFIED_CORE_TOKENS || [])) addToken(item);
    addToken({
      symbol: 'PRL',
      name: 'Pearl Network (NEAR NEP-141)',
      blockchain: 'near',
      assetId: '1cs_v1:near:nep141:prl.omft.near',
      contractAddress: 'prl.omft.near',
      decimals: 8,
      networkName: 'NEAR Protocol (NEP-141)',
      price: getSymbolPrice('PRL')
    });

    // 2. Direct On-Chain DEX Tokens (Solana Jupiter/Raydium/xStocks, EVM Kyber/Para/OpenOcean)
    for (const item of dexTokens) addToken(item);
    for (const item of (st.dynamicSolTokens || [])) addToken(item);

    // 3. Live 1Click catalog additions
    for (const item of (st.liveTokens || [])) addToken(item);

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
    if (fromBc === 'near' || fromBc === 'sol' || ['eth', 'base', 'arb', 'bsc', 'hype', 'hood', 'arc'].includes(fromBc)) {
      return Boolean(fromToken.contractAddress && toToken.contractAddress);
    }
    return false;
  }

  function isPrlSwapToken(tok) {
    return Boolean(tok && String(tok.symbol || '').toUpperCase() === 'PRL');
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
    if (!wallet || !fromToken || !toToken || wallet.accountType === 'post_quantum') return empty;

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
    const isNewSolAta = Boolean(
      isBuyingSolToken &&
        !(wallet.splBalances && Object.prototype.hasOwnProperty.call(wallet.splBalances, toToken.contractAddress))
    );

    // Cross-chain target gas reserve ONLY applies when a resolved route actually contains a DEST_DEX stage
    if (!(sameChain && toChain === 'sol' && isNewSolAta)) {
      const hasDestDex = Boolean(quoteData && Array.isArray(quoteData.stages) && quoteData.stages.some((s) => s && s.type === 'DEST_DEX'));
      if (!hasDestDex) return empty;
    }

    const nb = (wallet && wallet.nativeBalances) || {};
    const currentGasBal = Number(nb[toChain] || 0);
    const gasSymbolMap = { sol: 'SOL', eth: 'ETH', base: 'ETH', arb: 'ETH', hood: 'ETH', bsc: 'BNB', hype: 'HYPE', arc: 'USDC', near: 'NEAR' };
    const gasSymbol = gasSymbolMap[toChain] || toChain.toUpperCase();

    let minReq = 0;
    let extraReserve = 0;
    if (toChain === 'sol' && !isSolNative) {
      minReq = isNewSolAta ? 0.0035 : 0.001;
      extraReserve = 0.01;
    } else if (['eth', 'base', 'arb', 'hood', 'bsc', 'hype', 'arc'].includes(toChain) && !sameChain) {
      const defaults = { eth: 0.0015, base: 0.0003, arb: 0.0003, hood: 0.0003, bsc: 0.0005, hype: 0.0005, arc: 0.02 };
      const extras = { eth: 0.005, base: 0.002, arb: 0.002, hood: 0.002, bsc: 0.002, hype: 0.005, arc: 0.05 };
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
    if (destIdx > 0 && stages[destIdx - 1] && stages[destIdx - 1].expectedOut) {
      const nativeDecimals = gasReserveInfo.chainKey === 'sol' ? 9 : 18;
      const bridgeNativeHuman = Number(intents.fromBaseUnits(String(stages[destIdx - 1].expectedOut), nativeDecimals));
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
      const outPrice = getSymbolPrice(toToken.symbol);
      const usdOut = st.swap.quoteData.amountOutUsd
        ? formatUsd(Number(st.swap.quoteData.amountOutUsd) * ratio)
        : (outPrice !== null && Number.isFinite(netOutNum) ? formatUsd(netOutNum * outPrice) : '--');
      if ($('swap-usd-out')) $('swap-usd-out').textContent = usdOut;
    }
  }

  function renderSwapView() {
    const st = getState();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const isPq = wallet.accountType === 'post_quantum';
    const execBtn = $('btn-execute-swap');
    const amtInputEl = $('swap-amount-in');
    const fromPickerBtn = $('swap-from-token-btn');
    const toPickerBtn = $('swap-to-token-btn');
    const recInputEl = $('swap-recipient-input');
    if (isPq) {
      if (execBtn) execBtn.disabled = true;
      if (amtInputEl) {
        amtInputEl.value = '';
        amtInputEl.disabled = true;
      }
      if (fromPickerBtn) fromPickerBtn.disabled = true;
      if (toPickerBtn) toPickerBtn.disabled = true;
      if (recInputEl) {
        recInputEl.value = '';
        recInputEl.disabled = true;
      }
      if ($('swap-auto-route-badge')) {
        $('swap-auto-route-badge').textContent = t('PQ · 暂不支持闪兑', 'PQ · Swap Unavailable');
      }
      setSwapError(t('后量子账户暂不支持 NEAR Intents 跨链闪兑，请切换至标准账户使用闪兑与跨链桥', 'Post-quantum accounts do not support NEAR Intents cross-chain swaps yet. Switch to a standard account.'));
      return;
    }
    if (execBtn) execBtn.disabled = false;
    if (amtInputEl) amtInputEl.disabled = false;
    if (fromPickerBtn) fromPickerBtn.disabled = false;
    if (toPickerBtn) toPickerBtn.disabled = false;

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
    if ($('swap-from-net-label')) $('swap-from-net-label').textContent = fromToken ? (fromToken.networkName || fromToken.blockchain) : '--';
    if ($('swap-to-net-label')) $('swap-to-net-label').textContent = toToken ? (toToken.networkName || toToken.blockchain) : '--';

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
        routeBadge.textContent = 'Ref (#9010) + Rhea / 1Click';
      } else {
        routeBadge.textContent = `${fromMeta.shortName} ➔ ${toMeta.shortName} · ${t('超级多池聚合', 'Super-Aggregator')}`;
      }
    }

    const recInput = $('swap-recipient-input');
    if (recInput) {
      if (sameChainDex) {
        recInput.value = getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
        recInput.disabled = true;
      } else {
        recInput.disabled = false;
        if (!st.swap.recipientAddress && toToken) {
          st.swap.recipientAddress = getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
        }
        recInput.value = st.swap.recipientAddress;
      }
    }

    const amtInp = $('swap-amount-in');
    if (amtInp && amtInp.value !== String(st.swap.amountIn || '')) {
      amtInp.value = st.swap.amountIn || '';
    }
    if ($('swap-amount-out')) {
      $('swap-amount-out').value = st.swap.amountOut || '';
    }
    renderSwapGasReserveRow(wallet, fromToken, toToken);

    if (typeof document !== 'undefined') {
      document.querySelectorAll('#swap-quote-meta [data-bps]').forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-bps')) === Number(st.swap.slippageBps));
      });
    }

    renderSwapOrderCard();
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
    if ($('swap-amount-out')) $('swap-amount-out').value = '';
    if ($('swap-quote-rate')) $('swap-quote-rate').textContent = '--';
    if ($('swap-quote-route')) $('swap-quote-route').textContent = '--';
    if ($('swap-usd-in')) $('swap-usd-in').textContent = '--';
    if ($('swap-usd-out')) $('swap-usd-out').textContent = '--';
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (wallet && fromToken && toToken) {
      renderSwapGasReserveRow(wallet, fromToken, toToken);
    }
  }

  function handleSwapAmountInput() {
    const st = getState();
    st.swap.amountIn = ($('swap-amount-in')?.value || '').trim();
    resetSwapQuoteDisplay();
    if (!st.swap.amountIn || Number(st.swap.amountIn) <= 0) setSwapError('');
    scheduleSwapQuote();
  }

  function setSwapMaxAmount() {
    const st = getState();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const bal = getSwapTokenAvailableBalance(fromToken);
    if (!fromToken || bal === null || bal <= 0) return;

    const reserves = { sol: 0.002, eth: 0.0015, base: 0.0002, arb: 0.0002, bsc: 0.0005, hype: 0.0005, hood: 0.0002, arc: 0.02, near: 0.005, prl: 0.001, btc: 0.0001 };
    const isNative = !fromToken.contractAddress ||
      fromToken.blockchain === 'prl' ||
      fromToken.contractAddress === 'So11111111111111111111111111111111111111112' ||
      fromToken.contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      fromToken.contractAddress === 'wrap.near' ||
      (fromToken.blockchain === 'arc' && fromToken.contractAddress.toLowerCase() === '0x3600000000000000000000000000000000000000');
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
    if (typeof st.saveSwapPair === 'function') st.saveSwapPair();
    setSwapError('');
    resetSwapQuoteDisplay();
    renderSwapView();
    if (st.swap.amountIn) scheduleSwapQuote();
  }

  const _swapQuoteCache = new Map();

  function scheduleSwapQuote() {
    if (_swapQuoteTimer) clearTimeout(_swapQuoteTimer);
    resetSwapQuoteDisplay();
    _swapQuoteTimer = setTimeout(() => { fetchLiveSwapQuoteAsync(); }, 220);
  }

  function setSwapError(msg) {
    const el = $('swap-error-banner');
    if (el) {
      el.classList.add('hidden');
      el.textContent = '';
    }
    const btn = $('btn-execute-swap');
    const routeEl = $('swap-quote-route');
    if (!msg) {
      if (btn) {
        btn.classList.remove('is-error');
        btn.textContent = t('确认闪兑', 'Execute Swap');
      }
    } else {
      if (routeEl && (!routeEl.textContent || routeEl.textContent === '--' || routeEl.textContent.includes('比价') || routeEl.textContent.includes('Comparing'))) {
        routeEl.textContent = msg;
      }
      if (btn) {
        btn.classList.add('is-error');
        btn.textContent = msg;
      }
    }
  }

  async function fetchLiveSwapQuoteAsync() {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const amt = Number(st.swap.amountIn);
    if (!Number.isFinite(amt) || amt <= 0) {
      setSwapError('');
      return;
    }

    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (!fromToken || !toToken || fromToken.assetId === toToken.assetId) return;

    const sameChainDex = isSameChainContractSwap(fromToken, toToken);
    const amountRaw = intents.toBaseUnits(st.swap.amountIn, fromToken.decimals);
    if (amountRaw === '0') return;

    const reqSnapshot = {
      amountIn: st.swap.amountIn,
      fromId: fromToken.assetId,
      toId: toToken.assetId
    };
    const isStaleReq = () => st.swap.amountIn !== reqSnapshot.amountIn || st.swap.fromAssetId !== reqSnapshot.fromId || st.swap.toAssetId !== reqSnapshot.toId;

    const cacheKey = `${fromToken.assetId}|${toToken.assetId}|${amountRaw}|${st.swap.slippageBps || 100}|${st.swap.recipientAddress || ''}`;
    const cached = _swapQuoteCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < 8000)) {
      setSwapError('');
      st.swap.quoteData = cached.quoteData;
      st.swap.quoteSource = cached.quoteSource;
      const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', cached.quoteData);
      const { netOutNum, ratio } = computeNetSwapOutput(cached.quoteData, toToken, gInfo, cached.grossOutNum);
      const netOutText = formatBal(netOutNum, 6);
      const outPrice = getSymbolPrice(toToken.symbol);
      const netUsdOut = cached.usdOutRaw
        ? formatUsd(Number(cached.usdOutRaw) * ratio)
        : (outPrice !== null && Number.isFinite(netOutNum) ? formatUsd(netOutNum * outPrice) : (cached.usdOut || '--'));
      st.swap.amountOut = netOutText;
      if ($('swap-amount-out')) $('swap-amount-out').value = netOutText;
      if ($('swap-quote-route')) $('swap-quote-route').textContent = cached.quoteSource;
      if ($('swap-auto-route-badge')) $('swap-auto-route-badge').textContent = cached.quoteSource;
      if ($('swap-quote-rate') && cached.rateText) $('swap-quote-rate').textContent = cached.rateText;
      if ($('swap-usd-in') && cached.usdIn) $('swap-usd-in').textContent = cached.usdIn;
      if ($('swap-usd-out')) $('swap-usd-out').textContent = netUsdOut;
      renderSwapGasReserveRow(wallet, fromToken, toToken);
      return;
    }

    const applyAndCacheQuote = (quoteData, quoteSource, outHumanNum, usdInRaw, usdOutRaw) => {
      setSwapError('');
      const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', quoteData);
      const { netOutNum, ratio } = computeNetSwapOutput(quoteData, toToken, gInfo, outHumanNum);
      const amtOutText = formatBal(netOutNum, 6);
      const rateText = outHumanNum > 0 ? `1 ${fromToken.symbol} ≈ ${formatBal(outHumanNum / amt, 5)} ${toToken.symbol}` : '';
      const inPrice = getSymbolPrice(fromToken.symbol);
      const outPrice = getSymbolPrice(toToken.symbol);
      const usdIn = usdInRaw ? formatUsd(Number(usdInRaw)) : (inPrice !== null ? formatUsd(amt * inPrice) : '--');
      const usdOut = usdOutRaw
        ? formatUsd(Number(usdOutRaw) * ratio)
        : (outPrice !== null && Number.isFinite(netOutNum) ? formatUsd(netOutNum * outPrice) : '--');
      st.swap.quoteData = quoteData;
      st.swap.quoteSource = quoteSource;
      st.swap.amountOut = amtOutText;
      if ($('swap-amount-out')) $('swap-amount-out').value = amtOutText;
      if ($('swap-quote-route')) $('swap-quote-route').textContent = quoteSource;
      if ($('swap-auto-route-badge')) $('swap-auto-route-badge').textContent = quoteSource;
      if ($('swap-quote-rate') && rateText) $('swap-quote-rate').textContent = rateText;
      if ($('swap-usd-in')) $('swap-usd-in').textContent = usdIn;
      if ($('swap-usd-out')) $('swap-usd-out').textContent = usdOut;
      renderSwapGasReserveRow(wallet, fromToken, toToken);
      if (_swapQuoteCache.size > 40) _swapQuoteCache.clear();
      _swapQuoteCache.set(cacheKey, { ts: Date.now(), quoteData, quoteSource, grossOutNum: outHumanNum, amountOut: amtOutText, rateText, usdIn, usdOutRaw, usdOut });
    };

    if ($('swap-quote-route')) $('swap-quote-route').textContent = t('多池比价中...', 'Comparing pools...');

    try {

      if (sameChainDex && fromToken.blockchain !== 'near') {
        if (fromToken.blockchain === 'sol') {
          const jQuote = await contracts.quoteSolanaJupiterSwap({
            inputMint: fromToken.contractAddress,
            outputMint: toToken.contractAddress,
            amountRaw,
            slippageBps: st.swap.slippageBps
          });
          if (isStaleReq()) return;
          const outHuman = contracts.fromBaseUnits(jQuote.outAmount, toToken.decimals);
          const routeText = jQuote.routeLabel || jQuote.bestSource || 'Solana Jupiter V1';
          st.swap.quoteData = jQuote;
          st.swap.quoteSource = routeText;
          st.swap.amountOut = formatBal(Number(outHuman), 6);
          if ($('swap-amount-out')) $('swap-amount-out').value = st.swap.amountOut;
          if ($('swap-quote-route')) $('swap-quote-route').textContent = routeText;
          if ($('swap-auto-route-badge')) $('swap-auto-route-badge').textContent = routeText;
          if ($('swap-quote-rate') && Number(outHuman) > 0) {
            $('swap-quote-rate').textContent = `1 ${fromToken.symbol} ≈ ${formatBal(Number(outHuman) / amt, 5)} ${toToken.symbol}`;
          }
          const inPrice = getSymbolPrice(fromToken.symbol);
          const outPrice = getSymbolPrice(toToken.symbol);
          if ($('swap-usd-in')) $('swap-usd-in').textContent = inPrice !== null ? formatUsd(amt * inPrice) : '--';
          if ($('swap-usd-out')) $('swap-usd-out').textContent = outPrice !== null ? formatUsd(Number(outHuman) * outPrice) : '--';
          return;
        }

        const evmQuote = await contracts.quoteEvmDexSwap({
          chainKey: fromToken.blockchain,
          srcToken: fromToken.contractAddress,
          destToken: toToken.contractAddress,
          amountRaw,
          srcDecimals: fromToken.decimals,
          destDecimals: toToken.decimals,
          slippageBps: st.swap.slippageBps
        });
        if (isStaleReq()) return;
        if (!evmQuote.ok) {
          resetSwapQuoteDisplay();
          setSwapError(evmQuote.error || t('暂无链上报价', 'No DEX quote'));
          return;
        }
        const routeText = evmQuote.routeLabel || evmQuote.label;
        st.swap.quoteData = evmQuote;
        st.swap.quoteSource = routeText;
        st.swap.amountOut = formatBal(Number(evmQuote.amountOutFormatted), 6);
        if ($('swap-amount-out')) $('swap-amount-out').value = st.swap.amountOut;
        if ($('swap-quote-route')) $('swap-quote-route').textContent = routeText;
        if ($('swap-auto-route-badge')) $('swap-auto-route-badge').textContent = routeText;
        if ($('swap-quote-rate') && Number(evmQuote.amountOutFormatted) > 0) {
          $('swap-quote-rate').textContent = `1 ${fromToken.symbol} ≈ ${formatBal(Number(evmQuote.amountOutFormatted) / amt, 5)} ${toToken.symbol}`;
        }
        const inPrice = getSymbolPrice(fromToken.symbol);
        const outPrice = getSymbolPrice(toToken.symbol);
        const outHumanNum = Number(evmQuote.amountOutFormatted);
        if ($('swap-usd-in')) {
          $('swap-usd-in').textContent = evmQuote.amountInUsd
            ? formatUsd(Number(evmQuote.amountInUsd))
            : (inPrice !== null ? formatUsd(amt * inPrice) : '--');
        }
        if ($('swap-usd-out')) {
          $('swap-usd-out').textContent = evmQuote.amountOutUsd
            ? formatUsd(Number(evmQuote.amountOutUsd))
            : (outPrice !== null && Number.isFinite(outHumanNum) ? formatUsd(outHumanNum * outPrice) : '--');
        }
        return;
      }

      // Super-Aggregator: NEAR multi-pool (Ref V2 + Rhea CLMM + 1Click), PRL composite, Direct 1Click & 2-Stage Cross-Chain + DEX Relay
      const nearId = wallet.nearNamedAccount || wallet.nearAddress;
      const recipient = st.swap.recipientAddress || getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || nearId;
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
        evmAddress: wallet.mpcEvmAddress || wallet.evmAddress
      });
      if (isStaleReq()) return;
      if (!q || !q.ok) {
        resetSwapQuoteDisplay();
        setSwapError((q && q.error) || t('暂无报价', 'No quote'));
        return;
      }
      const outHuman = q.amountOutFormatted || intents.fromBaseUnits(q.amountOut || '0', toToken.decimals);
      const routeText = q.routeLabel || (q.compositeType === 'PRL_TO_NEAR_DCL'
        ? 'Ref (#9010) + Rhea CLMM (dclv2)'
        : (q.compositeType === 'PRL_TO_EXTERNAL' || q.compositeType === 'EXTERNAL_TO_PRL'
            ? 'Ref Finance (#9010) + 1Click'
            : (q.compositeType === 'PRL_TO_NEAR_REF' || q.compositeType === 'NEAR_TO_PRL_REF'
                ? 'Ref Finance (v2.ref-finance.near)'
                : '1Click Cross-Chain')));
      st.swap.quoteData = q;
      st.swap.quoteSource = routeText;
      st.swap.amountOut = formatBal(Number(outHuman), 6);
      applyAndCacheQuote(q, routeText, Number(outHuman), q.amountInUsd, q.amountOutUsd);
    } catch (e) {
      resetSwapQuoteDisplay();
      setSwapError(e && e.message ? e.message : t('询价失败', 'Quote failed'));
    }
  }

  async function broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress }) {
    const contracts = getContracts();
    const bc = String(fromToken.blockchain || '').toLowerCase();
    if (bc === 'near' && (!fromToken.contractAddress || fromToken.contractAddress === 'wrap.near') && fromToken.symbol === 'NEAR') {
      return contracts.signAndSendNearTransfer({ wallet, receiverId: depositAddress, amountNear: amt });
    }
    if (bc === 'near' && fromToken.contractAddress && fromToken.contractAddress !== 'wrap.near' && typeof contracts.executeNearNep141Transfer === 'function') {
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
    if (bc === 'sol' && (!fromToken.contractAddress || fromToken.contractAddress === 'So11111111111111111111111111111111111111112') && fromToken.symbol === 'SOL') {
      return contracts.executeSolanaNativeTransfer({ wallet, toAddress: depositAddress, amountSol: amt });
    }
    if (bc === 'prl') {
      return contracts.executePearlTransfer({ wallet, toAddress: depositAddress, amountPrl: amt, feeDeductMode: 'extra' });
    }
    if (['eth', 'base', 'arb', 'bsc', 'hype', 'hood'].includes(bc)) {
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
    return null;
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

    if (wallet.accountType === 'post_quantum' && (fromToken.blockchain !== 'near' || toToken.blockchain !== 'near')) {
      const pqMsg = t('后量子账户暂不支持 NEAR Intents 跨链闪兑，请切换至标准账户', 'Post-quantum accounts do not support NEAR Intents cross-chain swaps yet. Switch to a standard account.');
      setSwapError(pqMsg);
      showToast(pqMsg);
      return;
    }

    const avail = getSwapTokenAvailableBalance(fromToken);
    const isNative = !fromToken.contractAddress ||
      fromToken.blockchain === 'prl' ||
      fromToken.contractAddress === 'So11111111111111111111111111111111111111112' ||
      fromToken.contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      fromToken.contractAddress === 'wrap.near' ||
      (fromToken.blockchain === 'arc' && fromToken.contractAddress.toLowerCase() === '0x3600000000000000000000000000000000000000');

    // Strict Local Balance Pre-Validation BEFORE firing RPC / quotes
    try {
      const gasReserveInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto');
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
    } catch (err) {
      setSwapError(err.message);
      showToast(err.message);
      return;
    }

    if (!(await verifySecurityAuthAsync(wallet, `${t('确认兑换', 'Confirm swap')} ${st.swap.amountIn} ${fromToken.symbol} → ${toToken.symbol}`))) return;

    const btn = $('btn-execute-swap');
    if (btn) btn.disabled = true;
    setSwapError('');

    try {
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const amountRaw = intents.toBaseUnits(st.swap.amountIn, fromToken.decimals);
      const sameChainDex = isSameChainContractSwap(fromToken, toToken);

      if (sameChainDex) {
        if (fromToken.blockchain === 'near') {
          if (!st.swap.quoteData?.compositeType) {
            const refQ = st.swap.quoteData && (st.swap.quoteData.actions?.length || st.swap.quoteData.isDcl)
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
          // EVM Contract DEX Execution (signed via NEAR MPC v1.signer)
          const q = st.swap.quoteData && st.swap.quoteData.routeData
            ? st.swap.quoteData
            : await contracts.quoteEvmDexSwap({
                chainKey: fromToken.blockchain,
                srcToken: fromToken.contractAddress,
                destToken: toToken.contractAddress,
                amountRaw,
                srcDecimals: fromToken.decimals,
                destDecimals: toToken.decimals,
                slippageBps: st.swap.slippageBps
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
      const recipient = st.swap.recipientAddress || getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
      if (!recipient) throw new Error(t('请填写目标链收款地址', 'Destination address required'));
      const refundTo = getWalletDefaultRecipientForChain(wallet, fromToken.blockchain) || nearId;

      let activeQuote = st.swap.quoteData;
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
              slippageBps: st.swap.slippageBps
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
                reserveSol: getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto').selectedReserve,
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
              reserveNative: getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto').selectedReserve,
              slippageBps: st.swap.slippageBps
            }
          };
        };
        if (first.type === 'BRIDGE_IN') {
          const liveIn = await intents.quoteIntentSwapOrWithdraw({
            originAsset: first.originAsset || fromToken.assetId,
            destinationAsset: first.destinationAsset,
            amountRaw: stageAmtRaw,
            slippageBps: st.swap.slippageBps,
            recipient: nearId,
            refundTo,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: false
          });
          if (!liveIn.ok || !liveIn.depositAddress) {
            throw new Error(liveIn.error || t('创建第一阶段跨链订单失败', 'Failed to create Stage 1 cross-chain order'));
          }
          const swapLeg = stages.find((s) => s.type === 'NEAR_SWAP') || null;
          const outLeg = stages.find((s) => s.type === 'BRIDGE_OUT') || null;
          const destFollow = outLeg ? await buildDestDexFollowUp(outLeg.expectedOut) : {};
          st.swap.activeOrder = {
            depositAddress: liveIn.depositAddress,
            memo: liveIn.memo || null,
            status: 'PENDING_DEPOSIT',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            followUpRefSwap: swapLeg ? {
              tokenIn: swapLeg.tokenIn,
              tokenOut: swapLeg.tokenOut,
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
                recipient: outLeg.recipient || recipient,
                expectedInRaw: outLeg.expectedIn || swapLeg.expectedOut,
                ...destFollow
              } : null
            } : null
          };
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
          renderSwapOrderCard();
          const inTx = await broadcastOriginDepositTx({ wallet, fromToken: bridgeToken, amt: bridgeAmtNum, avail: bridgeAmtNum, depositAddress: liveIn.depositAddress });
          if (inTx && inTx.txHash) {
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
            showToast(`✅ ${t('跨链第一阶段已发送，到账后将自动完成后续兑换', 'Stage 1 sent; will auto-complete remaining stages on arrival')}`);
          } else {
            showToast(t('第一阶段订单已生成，请向下方充值地址转入源资产，到账后自动执行后续兑换', 'Stage 1 order created; deposit to address below to auto-trigger swap'));
          }
          startOrderStatusPolling();
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
            recipient: outLeg.recipient || recipient,
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
          const bridgeHuman = Number(intents.fromBaseUnits(bridgeInRaw, bridgeDec));
          let sendBridge = null;
          if (outLeg.hubContract === 'wrap.near') {
            sendBridge = await contracts.executeNearNep141Transfer({
              wallet,
              tokenContract: 'wrap.near',
              receiverId: liveOut.depositAddress,
              amount: bridgeHuman,
              decimals: 24,
              tokenSymbol: 'wNEAR',
              tokenBalance: bridgeHuman
            });
          } else {
            sendBridge = await contracts.executeNearNep141Transfer({
              wallet,
              tokenContract: outLeg.hubContract,
              receiverId: liveOut.depositAddress,
              amount: bridgeHuman,
              decimals: bridgeDec,
              tokenSymbol: bridgeSym,
              tokenBalance: bridgeHuman
            });
          }
          await intents.submitExternalDepositTxHash({
            depositAddress: liveOut.depositAddress,
            txHash: sendBridge.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          st.swap.activeOrder = {
            depositAddress: liveOut.depositAddress,
            memo: liveOut.memo || null,
            status: 'PENDING_DEPOSIT',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            ...destFollow
          };
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('已完成 NEAR 链内兑换并自动发起跨链交付', 'Swapped on NEAR & bridging to destination chain')}`);
          return;
        }
      }

      // Sub-route A: NEAR Token -> PRL (Pearl L1) via Ref Finance -> 1Click bridge
      if (!originIsPrl && destIsPrl && fromToken.blockchain === 'near') {
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
        const prlHuman = Number(intents.fromBaseUnits(prlOutRaw, 8));
        const sendBridge = await contracts.executeNearNep141Transfer({
          wallet,
          tokenContract: intents.PRL_NEAR_CONTRACT,
          receiverId: bridgeQuote.depositAddress,
          amount: prlHuman,
          decimals: 8,
          tokenSymbol: 'PRL',
          tokenBalance: prlHuman
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: bridgeQuote.depositAddress,
          txHash: sendBridge.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        st.swap.activeOrder = {
          depositAddress: bridgeQuote.depositAddress,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: 'PRL'
        };
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
        st.swap.activeOrder = {
          depositAddress: bridgeLive.depositAddress,
          memo: bridgeLive.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          followUpRefSwap: {
            tokenIn: intents.PRL_NEAR_CONTRACT,
            tokenOut: toToken.contractAddress,
            amountUsdcRaw: bridgeLive.amountOut,
            slippageBps: st.swap.slippageBps,
            inputDecimals: 8,
            tokenSymbol: 'PRL'
          }
        };
        renderSwapOrderCard();
        const bridgeTx = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: bridgeLive.depositAddress });
        if (bridgeTx && bridgeTx.txHash) {
          await intents.submitExternalDepositTxHash({
            depositAddress: bridgeLive.depositAddress,
            txHash: bridgeTx.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          showToast(`✅ ${t('跨链已发送，到账后自动兑换', 'Bridge sent; auto-swap on arrival')}`);
        } else {
          showToast(t('订单已生成，请向下方充值地址转入资产', 'Order created; deposit to the address below'));
        }
        startOrderStatusPolling();
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
            showToast(`✅ ${t('已通过 Ref (#9010) + Rhea CLMM 兑换为 QTC', 'Swapped PRL -> USDC -> QTC via Ref + Rhea CLMM')}: ${shortenAddr(dclRes.txHash)}`);
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
        const usdcHuman = Number(intents.fromBaseUnits(sendUsdcRaw, 6));
        const sendTx = await contracts.executeNearNep141Transfer({
          wallet,
          tokenContract: intents.NEAR_USDC_CONTRACT,
          receiverId: step2Live.depositAddress,
          amount: usdcHuman,
          decimals: 6,
          tokenSymbol: 'USDC',
          tokenBalance: usdcHuman
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: step2Live.depositAddress,
          txHash: sendTx.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        const nextOrder = {
          depositAddress: step2Live.depositAddress,
          memo: step2Live.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: 'PRL',
          toSymbol: toToken.symbol
        };
        if (isRelaySolDex) {
          nextOrder.followUpSolDexSwap = {
            outputMint: toToken.contractAddress,
            outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            expectedSolRaw: String(step2Live.amountOut || '0'),
            preSolLamports: String(preSolSnapshot?.nativeLamports || '0'),
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
            slippageBps: st.swap.slippageBps
          };
        }
        st.swap.activeOrder = nextOrder;
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('已通过 Ref Finance 换出 USDC 并提交 1Click 跨链', 'Swapped PRL to USDC & sent cross-chain')}`);
        return;
      }

      // Sub-route C: Non-Ref token (e.g. SOL / ETH / BNB / QTC) -> PRL (Step 1: 1Click -> NEAR USDC, Step 2 follow-up: Ref USDC -> PRL)
      if (!originIsPrl && destIsPrl && (fromToken.blockchain !== 'near' || st.swap.quoteData?.compositeType === 'EXTERNAL_TO_PRL')) {
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: intents.NEAR_USDC_ASSET_ID,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: nearId,
          refundTo,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建跨链第一步订单失败', 'Failed to create step 1 cross-chain order'));
        }
        st.swap.activeOrder = {
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: 'PRL',
          followUpRefSwap: {
            tokenIn: intents.NEAR_USDC_CONTRACT,
            tokenOut: intents.PRL_NEAR_CONTRACT,
            amountUsdcRaw: liveQuote.amountOut,
            slippageBps: st.swap.slippageBps
          }
        };
        renderSwapOrderCard();

        const txRes = await broadcastOriginDepositTx({
          wallet,
          fromToken,
          amt,
          avail,
          depositAddress: liveQuote.depositAddress
        });
        if (txRes && txRes.txHash) {
          await intents.submitExternalDepositTxHash({
            depositAddress: liveQuote.depositAddress,
            txHash: txRes.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          showToast(`✅ ${t('跨链第一阶段已发送，成交后将自动在 Ref 兑换为 PRL', 'Step 1 sent; will auto-swap to PRL on Ref upon fill')}`);
        } else {
          showToast(t('第一阶段订单已生成，请向充值地址转入源资产', 'Step 1 order created; deposit to address below'));
        }
        startOrderStatusPolling();
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
          depositAddress: stage2Live.depositAddress,
          memo: stage2Live.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol
        };
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
        st.swap.activeOrder = {
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          followUpSolDexSwap: {
            outputMint: toToken.contractAddress,
            outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            expectedSolRaw: String(liveQuote.amountOut || activeQuote.intermediaryRaw || '0'),
            preSolLamports: String(preSolRes?.nativeLamports || '0'),
            slippageBps: st.swap.slippageBps
          }
        };
        renderSwapOrderCard();
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
        if (txRes && txRes.txHash) {
          await intents.submitExternalDepositTxHash({
            depositAddress: liveQuote.depositAddress,
            txHash: txRes.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          showToast(`✅ ${t('跨链第一阶段已发送，到账 SOL 后将自动买入', 'Stage 1 sent; will auto-buy')} ${toToken.symbol}`);
        } else {
          showToast(t('第一阶段订单已生成，请向充值地址转入源资产', 'Stage 1 order created; deposit to address below'));
        }
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
        st.swap.activeOrder = {
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          followUpEvmDexSwap: {
            chainKey: targetBc,
            destToken: toToken.contractAddress,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
            toSymbol: toToken.symbol,
            expectedInRaw: String(liveQuote.amountOut || activeQuote.intermediaryRaw || '0'),
            preNativeWei: String(preEvmRes?.nativeRaw || '0'),
            slippageBps: st.swap.slippageBps
          }
        };
        renderSwapOrderCard();
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
        if (txRes && txRes.txHash) {
          await intents.submitExternalDepositTxHash({
            depositAddress: liveQuote.depositAddress,
            txHash: txRes.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          showToast(`✅ ${t('跨链第一阶段已发送，到账后将自动执行 DEX 兑换', 'Stage 1 sent; will auto-swap via DEX on arrival')}`);
        } else {
          showToast(t('第一阶段订单已生成，请向充值地址转入源资产', 'Stage 1 order created; deposit to address below'));
        }
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 4: Direct EVM -> Arc Mainnet (5042) via Relay / LI.FI
      if (activeQuote?.compositeType === 'EVM_TO_ARC_MAINNET' && typeof contracts.executeEvmRawSteps === 'function') {
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmAddr) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
        const origChain = String(fromToken.blockchain || '').toLowerCase();
        const cfgOrig = contracts.EVM_CHAINS && contracts.EVM_CHAINS[origChain];
        const bQuote = activeQuote.bridgeQuote;
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
          const liveRelay = await intents.quoteRelayBridge({
            user: evmAddr,
            recipient: evmAddr,
            originChainId: cfgOrig ? cfgOrig.chainId : 8453,
            destinationChainId: 5042,
            originCurrency: fromToken.contractAddress || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destinationCurrency: intents.ARC_USDC_CONTRACT,
            amount: amountRaw
          });
          if (!liveRelay.ok || !liveRelay.steps?.length) throw new Error(liveRelay.error || t('Relay 构建 Arc 跨链失败', 'Relay Arc build failed'));
          bridgeResTx = await contracts.executeEvmRawSteps({ wallet, chainKey: origChain, steps: liveRelay.steps });
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
        st.swap.activeOrder = {
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          followUpArcRelay: {
            destContract: toToken.contractAddress || intents.ARC_USDC_CONTRACT,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            expectedBaseRaw: String(liveQuote.amountOut || activeQuote.baseBridgeRaw || '0'),
            preBaseRaw: String(preBaseRes?.tokenRaw || '0'),
            slippageBps: st.swap.slippageBps
          }
        };
        renderSwapOrderCard();
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
        if (txRes && txRes.txHash) {
          await intents.submitExternalDepositTxHash({
            depositAddress: liveQuote.depositAddress,
            txHash: txRes.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          showToast(`✅ ${t('第一阶段已发送，到账 Base 后将自动通过 Relay 跨链至 Arc 主网', 'Stage 1 sent; will auto-bridge Base -> Arc via Relay')}`);
        } else {
          showToast(t('第一阶段订单已生成，请向充值地址转入源资产', 'Stage 1 order created; deposit below'));
        }
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 6: Arc Mainnet (5042) -> Base -> Target Chain
      if (activeQuote?.compositeType === 'ARC_MAINNET_TO_CROSS_CHAIN' && typeof contracts.executeEvmRawSteps === 'function') {
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmAddr) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
        const srcContract = (fromToken.contractAddress || intents.ARC_USDC_CONTRACT).toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
          ? intents.ARC_USDC_CONTRACT
          : fromToken.contractAddress;
        let arcUsdcRaw = amountRaw;
        if (srcContract.toLowerCase() !== intents.ARC_USDC_CONTRACT) {
          const s1Q = activeQuote.stage1DexQuote?.routeData
            ? activeQuote.stage1DexQuote
            : await contracts.quoteEvmDexSwap({
                chainKey: 'arc',
                srcToken: srcContract,
                destToken: intents.ARC_USDC_CONTRACT,
                amountRaw,
                srcDecimals: fromToken.decimals,
                destDecimals: 6,
                slippageBps: st.swap.slippageBps
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
        const liveRelay = await intents.quoteRelayBridge({
          user: evmAddr,
          recipient: evmAddr,
          originChainId: 5042,
          destinationChainId: 8453,
          originCurrency: intents.ARC_USDC_CONTRACT,
          destinationCurrency: intents.BASE_USDC_EVM,
          amount: arcUsdcRaw
        });
        if (!liveRelay.ok || !liveRelay.steps?.length) throw new Error(liveRelay.error || t('Relay 从 Arc 跨链失败', 'Relay bridge from Arc failed'));
        const rTx = await contracts.executeEvmRawSteps({ wallet, chainKey: 'arc', steps: liveRelay.steps });
        showToast(`✅ ${t('Arc -> Base Relay 跨链已广播', 'Arc -> Base Relay tx broadcast')}: ${shortenAddr(rTx.txHash)}`);
        refreshAllBalancesAsync(false);
        return;
      }

      // Cross-Chain 1Click Route (ORIGIN_CHAIN -> DESTINATION_CHAIN direct L1 to L1, including PRL Pearl <-> PRL NEAR)
      const effectiveDestAsset = (originIsPrl && !destIsPrl && fromToken.blockchain === 'prl')
        ? intents.PRL_NEAR_ASSET_ID
        : toToken.assetId;
      const effectiveRecipient = (originIsPrl && !destIsPrl && fromToken.blockchain === 'prl')
        ? nearId
        : recipient;

      const liveQuote = await intents.quoteIntentSwapOrWithdraw({
        originAsset: fromToken.assetId,
        destinationAsset: effectiveDestAsset,
        amountRaw,
        slippageBps: st.swap.slippageBps,
        recipient: effectiveRecipient,
        refundTo,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: false
      });
      if (!liveQuote.ok || !liveQuote.depositAddress) {
        throw new Error(liveQuote.error || t('创建跨链订单失败', 'Failed to create cross-chain order'));
      }

      st.swap.activeOrder = {
        depositAddress: liveQuote.depositAddress,
        memo: liveQuote.memo || null,
        status: 'PENDING_DEPOSIT',
        fromSymbol: fromToken.symbol,
        toSymbol: toToken.symbol
      };
      renderSwapOrderCard();

      // Auto-broadcast origin chain transaction directly into liveQuote.depositAddress
      const txRes = await broadcastOriginDepositTx({
        wallet,
        fromToken,
        amt,
        avail,
        depositAddress: liveQuote.depositAddress
      });

      if (txRes && txRes.txHash) {
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
        showToast(`✅ ${t('源链已签名发送，正在跨链交付至', 'Origin tx sent, delivering to')} ${shortenAddr(effectiveRecipient)}`);
        startOrderStatusPolling();
      } else {
        showToast(t('订单已生成，请向下方充值地址转入资产', 'Order created; deposit to the address below'));
        startOrderStatusPolling();
      }
    } catch (err) {
      setSwapError(err && err.message ? err.message : t('兑换失败', 'Swap failed'));
      showToast(err && err.message ? err.message : t('兑换失败', 'Swap failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderSwapOrderCard() {
    const order = getState().swap.activeOrder;
    const card = $('swap-order-card');
    if (!card) return;
    if (!order || !order.depositAddress) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    if ($('swap-order-deposit-addr')) $('swap-order-deposit-addr').textContent = order.depositAddress;
    if ($('swap-order-status')) $('swap-order-status').textContent = order.status || 'PENDING';
    const qrWrap = $('swap-order-qr');
    if (qrWrap) {
      qrWrap.classList.remove('hidden');
      renderQrInto('swap-order-qr', order.depositAddress, 136);
    }
  }

  function copySwapOrderDeposit() {
    const addr = getState().swap.activeOrder?.depositAddress;
    if (addr) copyText(addr, t('充值地址', 'Deposit Address'));
  }

  async function refreshActiveSwapOrderStatus() {
    const st = getState();
    const order = st.swap.activeOrder;
    const intents = getIntents();
    const contracts = getContracts();
    if (!order || !order.depositAddress) return;
    const res = await intents.fetchSwapOrderStatus(order.depositAddress);
    if (res.ok && res.status) {
      order.status = res.status;
      renderSwapOrderCard();
      const upper = String(res.status).toUpperCase();
      if (['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED'].includes(upper)) {
        if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
        if (['SUCCESS', 'COMPLETED'].includes(upper) && order.followUpRefSwap && !order.followUpExecuted) {
          order.followUpExecuted = true;
          const follow = order.followUpRefSwap;
          const wallet = st.getActiveWallet();
          if (wallet && contracts && typeof contracts.executeNearRefFinanceSwap === 'function') {
            try {
              const nearId = wallet.nearNamedAccount || wallet.nearAddress;
              const balMap = await intents.fetchNearNep141Balances(nearId, { usdc: follow.tokenIn }).catch(() => null);
              const amtInRaw = (balMap?.usdc?.raw && BigInt(balMap.usdc.raw) > 0n)
                ? (follow.amountUsdcRaw && BigInt(balMap.usdc.raw) > BigInt(follow.amountUsdcRaw)
                    ? String(follow.amountUsdcRaw)
                    : String(balMap.usdc.raw))
                : String(follow.amountUsdcRaw || '0');
              if (BigInt(amtInRaw) > 0n) {
                const outFollow = follow.followUpBridgeOut || null;
                const preOutBal = outFollow
                  ? await intents.fetchNearNep141Balances(nearId, { [follow.tokenOut]: outFollow.hubDecimals || 8 }).catch(() => null)
                  : null;
                const preOutRaw = BigInt(preOutBal?.[follow.tokenOut]?.raw || '0');
                const refRes = await contracts.executeNearRefFinanceSwap({
                  wallet,
                  tokenIn: follow.tokenIn,
                  tokenOut: follow.tokenOut,
                  amountRaw: amtInRaw,
                  slippageBps: follow.slippageBps || 100,
                  inputDecimals: follow.inputDecimals || 6,
                  tokenSymbol: follow.tokenSymbol || 'USDC'
                });
                if (outFollow && outFollow.destinationAsset) {
                  const postOutBal = await intents.fetchNearNep141Balances(nearId, { [follow.tokenOut]: outFollow.hubDecimals || 8 }).catch(() => null);
                  const postOutRaw = BigInt(postOutBal?.[follow.tokenOut]?.raw || '0');
                  const deltaOut = postOutRaw > preOutRaw ? (postOutRaw - preOutRaw) : BigInt(refRes.amountOut || outFollow.expectedInRaw || '0');
                  const bridgeInRaw = (deltaOut > 0n ? deltaOut : BigInt(outFollow.expectedInRaw || '0')).toString();
                  if (BigInt(bridgeInRaw) > 0n) {
                    const liveOut = await intents.quoteIntentSwapOrWithdraw({
                      originAsset: outFollow.originAsset,
                      destinationAsset: outFollow.destinationAsset,
                      amountRaw: bridgeInRaw,
                      slippageBps: follow.slippageBps || 100,
                      recipient: outFollow.recipient,
                      refundTo: nearId,
                      depositType: 'ORIGIN_CHAIN',
                      recipientType: 'DESTINATION_CHAIN',
                      dry: false
                    });
                    if (liveOut.ok && liveOut.depositAddress) {
                      const bDec = outFollow.hubDecimals || 8;
                      const bSym = outFollow.hubSymbol || 'PRL';
                      const bHuman = Number(intents.fromBaseUnits(bridgeInRaw, bDec));
                      const sendB = await contracts.executeNearNep141Transfer({
                        wallet,
                        tokenContract: outFollow.hubContract || follow.tokenOut,
                        receiverId: liveOut.depositAddress,
                        amount: bHuman,
                        decimals: bDec,
                        tokenSymbol: bSym,
                        tokenBalance: bHuman
                      });
                      await intents.submitExternalDepositTxHash({
                        depositAddress: liveOut.depositAddress,
                        txHash: sendB.txHash,
                        nearSenderAccount: nearId
                      }).catch(() => {});
                      st.swap.activeOrder = {
                        depositAddress: liveOut.depositAddress,
                        memo: liveOut.memo || null,
                        status: 'PENDING_DEPOSIT',
                        fromSymbol: order.fromSymbol,
                        toSymbol: order.toSymbol,
                        followUpSolDexSwap: outFollow.followUpSolDexSwap || null,
                        followUpEvmDexSwap: outFollow.followUpEvmDexSwap || null
                      };
                      renderSwapOrderCard();
                      startOrderStatusPolling();
                      showToast(`✅ ${t('第二阶段已换币并自动发起第三阶段跨链交付', 'Stage 2 swapped & Stage 3 bridge sent')}`);
                      return;
                    }
                  }
                }
                showToast(`✅ ${t('第二阶段 Ref Finance 已自动兑换', 'Step 2 auto-swapped on Ref')}: ${shortenAddr(refRes.txHash)}`);
              }
            } catch (err) {
              showToast(err && err.message ? err.message : t('自动兑换 PRL 失败，请在资产页手动闪兑', 'Auto Ref swap failed'));
            }
          }
        }
        if (['SUCCESS', 'COMPLETED'].includes(upper) && order.followUpSolDexSwap && !order.followUpExecuted) {
          order.followUpExecuted = true;
          const follow = order.followUpSolDexSwap;
          const wallet = st.getActiveWallet();
          if (wallet && wallet.solAddress && contracts && typeof contracts.executeSolanaJupiterSwap === 'function') {
            try {
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
              const jQuote = await contracts.quoteSolanaJupiterSwap({
                inputMint: 'So11111111111111111111111111111111111111112',
                outputMint: follow.outputMint,
                amountRaw: swapInLamports.toString(),
                slippageBps: follow.slippageBps || 100
              });
              const jRes = await contracts.executeSolanaJupiterSwap({
                wallet,
                quoteResponse: jQuote,
                wrapAndUnwrapSol: true,
                tokenBalance: Number(contracts.fromBaseUnits(availLamports.toString(), 9)),
                inputDecimals: 9
              });
              showToast(`✅ ${t('第二阶段已自动买入', 'Stage 2 bought')} ${follow.toSymbol}: ${shortenAddr(jRes.txHash)}`);
            } catch (err) {
              showToast(err && err.message ? err.message : t('Solana 自动兑换失败', 'Auto Solana DEX swap failed'));
            }
          }
        }
        if (['SUCCESS', 'COMPLETED'].includes(upper) && order.followUpEvmDexSwap && !order.followUpExecuted) {
          order.followUpExecuted = true;
          const follow = order.followUpEvmDexSwap;
          const wallet = st.getActiveWallet();
          const evmAddr = wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '';
          if (wallet && evmAddr && contracts && typeof contracts.executeEvmDexSwap === 'function') {
            try {
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
              const evmQ = await contracts.quoteEvmDexSwap({
                chainKey: follow.chainKey,
                srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
                destToken: follow.destToken,
                amountRaw: swapInWei.toString(),
                srcDecimals: 18,
                destDecimals: follow.destDecimals || 18,
                slippageBps: follow.slippageBps || 100
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
                tokenBalance: Number(contracts.fromBaseUnits(availWei.toString(), 18))
              });
              showToast(`✅ ${t('第二阶段 MPC 已自动兑换为', 'Stage 2 MPC swapped to')} ${follow.toSymbol}: ${shortenAddr(evmRes.txHash)}`);
            } catch (err) {
              showToast(err && err.message ? err.message : t('EVM 自动兑换失败', 'Auto EVM DEX swap failed'));
            }
          }
        }
        if (['SUCCESS', 'COMPLETED'].includes(upper) && order.followUpArcRelay && !order.followUpExecuted) {
          order.followUpExecuted = true;
          const follow = order.followUpArcRelay;
          const wallet = st.getActiveWallet();
          const evmAddr = wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '';
          if (wallet && evmAddr && contracts && typeof contracts.executeEvmRawSteps === 'function') {
            try {
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

              const relayLive = await intents.quoteRelayBridge({
                user: evmAddr,
                recipient: evmAddr,
                originChainId: 8453,
                destinationChainId: 5042,
                originCurrency: intents.BASE_USDC_EVM,
                destinationCurrency: intents.ARC_USDC_CONTRACT,
                amount: bridgeInRaw.toString()
              });
              if (!relayLive.ok || !relayLive.steps?.length) throw new Error(relayLive.error || t('Relay Base->Arc 构建失败', 'Relay Base->Arc failed'));
              const relayTx = await contracts.executeEvmRawSteps({ wallet, chainKey: 'base', steps: relayLive.steps });
              showToast(`✅ ${t('第二阶段 Relay 已发送至 Arc 主网', 'Stage 2 Relay sent to Arc Mainnet')}: ${shortenAddr(relayTx.txHash)}`);
            } catch (err) {
              showToast(err && err.message ? err.message : t('Relay 跨链至 Arc 失败', 'Auto Relay to Arc failed'));
            }
          }
        }
        refreshAllBalancesAsync(false);
      }
    }
  }

  function startOrderStatusPolling() {
    if (_orderPollTimer) clearInterval(_orderPollTimer);
    refreshActiveSwapOrderStatus();
    _orderPollTimer = setInterval(refreshActiveSwapOrderStatus, 6000);
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
    getState().swap.activeOrder = null;
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
    st.swap.pickerSide = side === 'to' ? 'to' : 'from';
    st.swap.pickerChainFilter = loadSavedPickerChain();
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
    const catalog = getSwapTokenCatalog();

    const search = ($('token-picker-search')?.value || '').trim().toLowerCase();
    const uniqueChains = Array.from(new Set(catalog.map((x) => x.blockchain).filter(Boolean)));
    const orderedChains = [
      ...PREFERRED_PICKER_CHAINS.filter((ck) => ck === 'arc' || uniqueChains.includes(ck)),
      ...uniqueChains.filter((ck) => !PREFERRED_PICKER_CHAINS.includes(ck))
    ];

    const favIds = Array.isArray(st.favoriteTokenIds) ? st.favoriteTokenIds : [];
    const favSet = new Set(favIds.map((id) => String(id || '').toLowerCase()));
    const catalogById = new Map();
    for (const item of catalog) {
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
          <button type="button" class="filter-pill flex items-center gap-1" style="display:inline-flex;align-items:center;gap:5px;" onclick="selectSwapToken('${escapeHtml(tok.assetId)}')">
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
        `<button type="button" class="filter-pill ${st.swap.pickerChainFilter === 'all' ? 'active' : ''}" onclick="setTokenPickerChain('all')">${t('全部网络', 'All')}</button>`,
        ...orderedChains.slice(0, 15).map((ck) => {
          const meta = tokens.getChainMeta(ck);
          return `<button type="button" class="filter-pill ${st.swap.pickerChainFilter === ck ? 'active' : ''}" onclick="setTokenPickerChain('${escapeHtml(ck)}')">${escapeHtml(meta.shortName)}</button>`;
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

    const filteredWithMeta = catalog
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
        <div class="asset-sub-row" role="button" tabindex="0" style="width:100%;cursor:pointer;text-align:left;" onclick="selectSwapToken('${escapeHtml(tok.assetId)}')">
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
            <button type="button" style="${starStyle}" onclick="event.stopPropagation();toggleFavoriteSwapToken('${escapeHtml(tok.assetId)}')" aria-label="Favorite">${isFav ? '★' : '☆'}</button>
          </div>
        </div>
      `;
    }).join('');
  }

  function selectSwapToken(assetId) {
    const st = getState();
    if (st.swap.pickerSide === 'from') {
      st.swap.fromAssetId = assetId;
    } else {
      st.swap.toAssetId = assetId;
      st.swap.recipientAddress = '';
    }
    resetSwapQuoteDisplay();
    if (typeof st.saveSwapPair === 'function') st.saveSwapPair();
    setSwapError('');
    closeAllSheets();
    renderSwapView();
    if (st.swap.amountIn) scheduleSwapQuote();
  }

  // ==================== Earn / Liquid Staking Controller ====================

  async function refreshStakingMetrics(showFeedback = false) {
    const st = getState();
    const contracts = getContracts();
    if (st.staking.loading && !showFeedback) return;
    st.staking.loading = true;
    try {
      const pools = await contracts.fetchLiveStakingMetrics({ useCache: !showFeedback && Boolean(st.staking.pools) });
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
    return typeof p.apy === 'number' && Number.isFinite(p.apy) ? `${p.apy.toFixed(2)}%` : '--%';
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
            amountText: `${formatBal(vp.totalAmount, 4)} ${sym}`
          });
          continue;
        }
        if (!(vp.totalNear > 0)) continue;
        const statusText = vp.stakedNear > 0 && vp.unstakedNear > 0
          ? `${t('质押中', 'Staked')}: ${formatBal(vp.stakedNear, 4)} · ${vp.canWithdraw ? t('可提现', 'Withdrawable') : t('解质押冷却中', 'Unstaking')}: ${formatBal(vp.unstakedNear, 4)}`
          : (vp.stakedNear > 0
              ? `${t('验证节点质押中', 'Validator Staked')}`
              : (vp.canWithdraw ? t('已解质押 · 可提取', 'Unstaked · Ready') : t('解质押冷却中 (4 Epochs)', 'Unstaking (Cooldown)')));
        posItems.push({
          symbol: 'NEAR',
          chain: 'near',
          title: vp.poolId,
          subtitle: statusText,
          amountText: `${formatBal(vp.totalNear, 4)} NEAR`,
          actionType: vp.canWithdraw ? 'near_withdraw' : (vp.stakedNear > 0 ? 'near_unstake' : ''),
          actionTarget: vp.poolId,
          actionLabel: vp.canWithdraw ? t('提取', 'Withdraw') : (vp.stakedNear > 0 ? t('解质押', 'Unstake') : '')
        });
      }
      const nepMap = wallet.nearNep141Balances || {};
      const nearLstContracts = [
        { cid: 'lst.rhealab.near', sym: 'rNEAR', name: 'Rhea Staked NEAR' },
        { cid: 'xtoken.rhealab.near', sym: 'xRHEA', name: 'Staked RHEA' },
        { cid: 'meta-pool.near', sym: 'stNEAR', name: 'Meta Pool stNEAR' },
        { cid: 'linear-protocol.near', sym: 'LiNEAR', name: 'LiNEAR Protocol' },
        { cid: 'v2-nearx.stader-labs.near', sym: 'NearX', name: 'Stader NearX' }
      ];
      for (const lst of nearLstContracts) {
        const b = nepMap[lst.cid]?.formatted;
        if (typeof b === 'number' && b > 0.00001) {
          posItems.push({
            symbol: lst.sym,
            chain: 'near',
            title: lst.name,
            subtitle: lst.cid,
            amountText: `${formatBal(b, 4)} ${lst.sym}`
          });
        }
      }
      const solPosList = Array.isArray(wallet.solStakingPositions) ? wallet.solStakingPositions : [];
      for (const sp of solPosList) {
        if (!sp || !(sp.amount > 0.00001)) continue;
        const isJup = sp.type === 'jupiter_dao';
        const subAddr = String(sp.subtitle || '');
        const shortAddr = subAddr.length > 12 ? `${subAddr.slice(0, 6)}...${subAddr.slice(-4)}` : subAddr;
        posItems.push({
          symbol: sp.symbol || (isJup ? 'JUP' : 'SOL'),
          chain: sp.chain || 'sol',
          title: sp.title || (isJup ? 'Jupiter DAO (ASR)' : 'Solana Validator'),
          subtitle: isJup
            ? t('Jupiter DAO 锁仓质押', 'Jupiter DAO Locked Stake')
            : (shortAddr ? `${t('验证节点质押', 'Validator Stake')} · ${shortAddr}` : t('Solana 原生质押', 'Solana Native Stake')),
          amountText: `${formatBal(sp.amount, 4)} ${sp.symbol || (isJup ? 'JUP' : 'SOL')}`
        });
      }
      const solSpl = wallet.splBalances || {};
      const solLstMints = [
        { mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', sym: 'JitoSOL', name: 'Jito Liquid Staking' },
        { mint: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', sym: 'jupSOL', name: 'Jupiter Staked SOL' },
        { mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', sym: 'mSOL', name: 'Marinade Staked SOL' },
        { mint: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', sym: 'INF', name: 'Sanctum Infinity' }
      ];
      for (const sl of solLstMints) {
        const b = solSpl[sl.mint];
        if (typeof b === 'number' && b > 0.00001) {
          posItems.push({
            symbol: sl.sym,
            chain: 'sol',
            title: sl.name,
            subtitle: 'Solana LST',
            amountText: `${formatBal(b, 4)} ${sl.sym}`
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
      const evmStakingPositions = [
        { chain: 'eth', contract: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', sym: 'stETH', title: 'Lido Staked ETH', subtitle: 'Ethereum · Lido' },
        { chain: 'eth', contract: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', sym: 'sUSDe', title: 'Ethena Staked USDe', subtitle: 'Ethereum · Ethena' },
        { chain: 'eth', contract: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', sym: 'aEthUSDC', title: 'Aave V3 Ethereum USDC', subtitle: 'Ethereum · Aave V3', poolId: 'aave_eth_usdc' },
        { chain: 'eth', contract: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', sym: 'aEthWETH', title: 'Aave V3 Ethereum ETH', subtitle: 'Ethereum · Aave V3', poolId: 'aave_eth_weth' },
        { chain: 'base', contract: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', sym: 'aBasUSDC', title: 'Aave V3 Base USDC', subtitle: 'Base · Aave V3', poolId: 'aave_base_usdc' },
        { chain: 'arb', contract: '0x724dc807b04555b71ed48a6896b6F41593b8C637', sym: 'aArbUSDCn', title: 'Aave V3 Arbitrum USDC', subtitle: 'Arbitrum · Aave V3', poolId: 'aave_arb_usdc' },
        { chain: 'arc', contract: '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', sym: 'steakUSDC', title: 'Steakhouse Prime USDC', subtitle: 'Arc · Morpho' },
        { chain: 'hype', contract: '0xfD739d4e423301CE9385c1fb8850539D657C296D', sym: 'kHYPE', title: 'Kinetiq Staked HYPE', subtitle: 'HyperEVM · Kinetiq' }
      ];
      for (const ep of evmStakingPositions) {
        const b = readErc20PosBal(ep.chain, ep.contract);
        if (typeof b === 'number' && b > 0.00001) {
          posItems.push({
            symbol: ep.sym,
            chain: ep.chain,
            title: ep.title,
            subtitle: ep.subtitle,
            amountText: `${formatBal(b, 4)} ${ep.sym}`,
            actionType: ep.poolId ? 'aave_withdraw' : '',
            actionTarget: ep.poolId || '',
            actionLabel: ep.poolId ? t('提取', 'Withdraw') : ''
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
              ${it.actionType && it.actionTarget ? `<button type="button" class="mini-action-btn" style="padding:4px 8px;font-size:11px;" onclick="executeEarnPositionAction('${escapeHtml(it.actionType)}','${escapeHtml(it.actionTarget)}')">${escapeHtml(it.actionLabel)}</button>` : ''}
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
            <div class="staking-pool-card ${selected ? 'selected' : ''}" onclick="selectStakingPool('${escapeHtml(p.id)}')">
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
            <button type="button" class="filter-pill ${Number(tier.days) === curDays ? 'active' : ''}" onclick="selectEarnLockTier(${Number(tier.days)})">${escapeHtml(formatLockTierLabel(tier))}</button>
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
    const reserve = !activePool.isTokenStake
      ? (activePool.chain === 'near' ? 0.05 : activePool.chain === 'sol' ? 0.002 : activePool.chain === 'arc' ? 0.02 : 0.002)
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
      contracts.validateSufficientChainBalance({
        wallet,
        chain: pool.chain,
        tokenSymbol: pool.inSymbol,
        amount: amt,
        isNative: !pool.isTokenStake,
        tokenBalance: pool.isTokenStake ? avail : null
      });
    } catch (err) {
      showToast(err.message);
      return;
    }

    if (!(await verifySecurityAuthAsync(wallet, `${t('确认质押', 'Confirm stake')} ${amt} ${pool.inSymbol}`))) return;

    const btn = $('btn-execute-stake');
    if (btn) btn.disabled = true;
    try {
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
          ${res.explorerUrl ? `<a href="${escapeHtml(res.explorerUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan" style="font-size:11.5px;">${t('在区块浏览器查看 ↗', 'View on Explorer ↗')}</a>` : ''}
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
        res = await contracts.withdrawFromAaveV3({ wallet, poolId: actionTarget, amount: 'max' });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'AAVE',
          chain: 'evm',
          amount: 0,
          txHash: res.txHash,
          title: `${t('Aave V3 全额提取', 'Aave V3 Withdraw')} · ${actionTarget}`
        });
        showToast(`✅ ${t('Aave 本息提取已广播', 'Aave V3 withdraw broadcast')}: ${shortenAddr(res.txHash)}`);
      }
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(err && err.message ? err.message : t('赎回失败', 'Redemption failed'));
    }
  }

  // ==================== Hub: .near Domain, MPC v1.signer, Contacts, WC ====================

  // ==================== NEAR Access Keys & Key Rotation Sheet ====================

  let _rotateKeyMode = 'standard';

  function setRotateKeyMode(mode) {
    _rotateKeyMode = mode === 'post_quantum' ? 'post_quantum' : 'standard';
    const isPq = _rotateKeyMode === 'post_quantum';
    if ($('btn-rotate-mode-std')) $('btn-rotate-mode-std').className = isPq ? 'btn-secondary flex-1' : 'btn-primary flex-1';
    if ($('btn-rotate-mode-pq')) $('btn-rotate-mode-pq').className = isPq ? 'btn-primary flex-1' : 'btn-secondary flex-1';
  }

  function generateRotateMnemonicInSheet() {
    const crypto = getCrypto();
    if (!crypto || typeof crypto.generateMnemonic !== 'function') return;
    const len = _rotateKeyMode === 'post_quantum' ? 24 : 12;
    const words = crypto.generateMnemonic(len);
    const phrase = Array.isArray(words) ? words.join(' ') : String(words || '').trim();
    if ($('near-keys-rotate-mnemonic')) {
      $('near-keys-rotate-mnemonic').value = phrase;
    }
  }

  async function openNearAccessKeysSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (!(await verifySecurityAuthAsync(wallet, t('管理 NEAR 密钥与更换助记词', 'Manage NEAR Access Keys')))) return;
    setRotateKeyMode(wallet.accountType === 'post_quantum' ? 'post_quantum' : 'standard');
    if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
    openSheet('sheet-near-keys');
    await refreshNearAccessKeysSheet();
  }

  async function refreshNearAccessKeysSheet() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts) return;
    const creds = contracts.getWalletNearSignerCredentials(wallet);
    const accountId = creds.accountId;
    if ($('near-keys-account-id')) {
      $('near-keys-account-id').textContent = shortenAddr(accountId, 12, 8) || '--';
    }
    const listEl = $('near-keys-list');
    if (listEl) {
      listEl.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px;">${t('正在查询链上密钥...', 'Loading on-chain keys...')}</div>`;
    }

    try {
      const res = await contracts.fetchNearAccessKeysAsync(accountId);
      const activateCard = $('near-keys-activate-card');
      if (activateCard) {
        const showActivate = Boolean(!res.exists && wallet.accountType === 'post_quantum' && wallet.nearUniversalAddress);
        activateCard.classList.toggle('hidden', !showActivate);
        if (showActivate && $('near-keys-funding-select')) {
          const funders = st.wallets.filter((w) => w.id !== wallet.id && w.accountType !== 'post_quantum' && (w.nearNamedAccount || w.nearAddress));
          $('near-keys-funding-select').innerHTML = funders.length
            ? funders.map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.name)} (${escapeHtml(shortenAddr(f.nearNamedAccount || f.nearAddress, 6, 4))})</option>`).join('')
            : `<option value="">${t('暂无可用的普通 NEAR 出资账户', 'No standard NEAR funding account')}</option>`;
        }
      }

      if (!listEl) return;
      if (!res.exists || res.keys.length === 0) {
        listEl.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px;">${t('账户尚未在链上激活（首次收款或激活后可见密钥）', 'Account not yet active on-chain')}</div>`;
        return;
      }

      const fullCount = res.keys.filter((k) => k.access_key && k.access_key.permission === 'FullAccess').length;
      listEl.innerHTML = res.keys.map((k) => {
        const pk = String(k.public_key || '');
        const isFull = Boolean(k.access_key && k.access_key.permission === 'FullAccess');
        const isCurrent = pk === creds.publicKeyStr || (creds.publicKeyHandleStr && pk === creds.publicKeyHandleStr);
        const isPqKey = pk.startsWith('ml-dsa-65');
        const canDelete = !isFull || fullCount > 1;
        return `
          <div class="ios-glass-card flex items-center justify-between gap-2" style="padding:10px 12px;">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                <span class="badge ${isFull ? 'badge-emerald' : 'badge-cyan'}">${isFull ? 'FullAccess' : 'dApp Key'}</span>
                ${isPqKey ? `<span class="badge badge-cyan">ML-DSA-65</span>` : ''}
                ${isCurrent ? `<span class="ca-badge">${t('当前使用', 'In Use')}</span>` : ''}
              </div>
              <div class="mono" style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;margin-top:4px;">${escapeHtml(shortenAddr(pk, 14, 8))}</div>
            </div>
            ${canDelete
              ? `<button type="button" class="btn-danger" onclick="deleteNearAccessKeyFromSheet('${escapeHtml(pk)}')">${t('删除', 'Delete')}</button>`
              : ''}
          </div>
        `;
      }).join('');
    } catch (e) {
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

    const addPq = _rotateKeyMode === 'post_quantum';
    try {
      showToast(t('正在执行 AddKey 添加密钥...', 'Broadcasting AddKey...'));
      const res = await contracts.rotateNearAccountKeyAsync({
        wallet,
        newMnemonic: check.words.join(' '),
        upgradeToMlDsa65: addPq,
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

    const upgradeToPq = _rotateKeyMode === 'post_quantum';
    try {
      showToast(t('正在执行 AddKey + DeleteKey...', 'Rotating key on-chain...'));
      const res = await contracts.rotateNearAccountKeyAsync({
        wallet,
        newMnemonic: check.words.join(' '),
        upgradeToMlDsa65: upgradeToPq,
        deleteOldKey: true
      });
      wallet.mnemonic = res.newDerived.mnemonic;
      if (upgradeToPq) {
        wallet.accountType = 'post_quantum';
        wallet.nearMlDsa65PublicKey = res.newDerived.publicKey;
        wallet.nearMlDsa65PublicKeyHandle = res.newDerived.publicKeyHandle;
        wallet.nearMlDsa65PrivateKey = res.newDerived.secretKey;
        wallet.nearPublicKey = '';
        wallet.nearPrivateKey = '';
        wallet.nearPrivateSeedHex = '';
      } else {
        wallet.accountType = 'standard';
        wallet.nearPublicKey = res.newDerived.nearPublicKey;
        wallet.nearPrivateKey = res.newDerived.nearPrivateKey;
        wallet.nearPrivateSeedHex = res.newDerived.nearPrivateSeedHex;
        wallet.nearMlDsa65PublicKey = '';
        wallet.nearMlDsa65PublicKeyHandle = '';
        wallet.nearMlDsa65PrivateKey = '';
      }
      st.saveWallets();
      showToast(`✅ ${t('助记词与链上密钥已更换', 'Mnemonic & on-chain key rotated')}: ${shortenAddr(res.deleteTxHash || res.addTxHash, 8, 6)}`);
      if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
      renderAll();
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(e && e.message ? e.message : t('更换密钥失败', 'Key rotation failed'));
    }
  }

  async function activateUniversalAccountFromSheet() {
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const pqWallet = st.getActiveWallet();
    if (!pqWallet || !contracts || !crypto) return;
    const funderId = $('near-keys-funding-select')?.value || '';
    const fundingWallet = st.wallets.find((w) => w.id === funderId);
    if (!fundingWallet) {
      showToast(t('请选择一个有效的普通 NEAR 出资账户', 'Select a valid standard NEAR funding wallet'));
      return;
    }
    if (!(await verifySecurityAuthAsync(fundingWallet, t('激活 0u 后量子地址 (0.05 NEAR)', 'Activate 0u PQ Address (0.05 NEAR)')))) return;
    try {
      const built = crypto.buildUniversalStateInitFromMlDsa65PublicKey(pqWallet.nearMlDsa65PublicKey);
      const rawStateInitHex = crypto.bytesToHex(built.rawStateInitBytes);
      showToast(t('正在链上激活 0u 地址...', 'Activating 0u address on-chain...'));
      const res = await contracts.activateUniversalAccountAsync({
        fundingWallet,
        targetUniversalAccountId: pqWallet.nearUniversalAddress,
        rawStateInitHex,
        depositNear: '0.05'
      });
      showToast(`✅ ${t('0u 后量子账户已激活', '0u PQ account activated')}: ${shortenAddr(res.txHash, 8, 6)}`);
      await refreshNearAccessKeysSheet();
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(e && e.message ? e.message : t('激活失败', 'Activation failed'));
    }
  }

  function renderHubView() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (typeof st.recomputeWalletMpcAddresses === 'function') {
      st.recomputeWalletMpcAddresses(wallet);
    }

    if ($('hub-near-current-id')) {
      $('hub-near-current-id').textContent = wallet.nearNamedAccount || wallet.nearAddress || '--';
    }
    if ($('hub-mpc-evm-address')) {
      $('hub-mpc-evm-address').textContent = wallet.mpcEvmAddress || wallet.evmAddress || '--';
    }

    const addrList = $('hub-addresses-list');
    if (addrList) {
      const isPq = wallet.accountType === 'post_quantum';
      $('hub-mpc-card')?.classList.toggle('hidden', isPq);
      $('hub-near-domain-card')?.classList.toggle('hidden', isPq);
      const items = isPq
        ? [
            { k: t('NEAR 后量子账户 (ML-DSA-65)', 'NEAR PQ Account (ML-DSA-65)'), v: wallet.nearNamedAccount || wallet.nearUniversalAddress || wallet.nearAddress },
            { k: t('0u 通用后量子地址', '0u Universal Address'), v: wallet.nearUniversalAddress || '--' },
            { k: t('ML-DSA-65 公钥摘要', 'ML-DSA-65 Key Handle'), v: wallet.nearMlDsa65PublicKeyHandle || '--' }
          ]
        : [
            { k: t('NEAR 主账户', 'NEAR Master Account'), v: wallet.nearNamedAccount || wallet.nearAddress },
            { k: 'EVM (v1.signer · ethereum-1)', v: wallet.mpcEvmAddress || wallet.evmAddress },
            { k: 'Arc Network (USDC · v1.signer)', v: wallet.mpcEvmAddress || wallet.evmAddress },
            { k: 'Solana (v1.signer · solana-1)', v: wallet.solAddress },
            { k: 'Bitcoin (v1.signer · bitcoin-1)', v: wallet.btcAddress },
            { k: 'Pearl (PRL 主网 · BIP-86)', v: wallet.address }
          ];
      addrList.innerHTML = items.map((x) => `
        <div class="meta-row">
          <span class="meta-key">${escapeHtml(x.k)}</span>
          <div class="flex items-center gap-2">
            <span class="mono" style="font-size:11px;">${escapeHtml(shortenAddr(x.v, 8, 6))}</span>
            <button type="button" class="btn-ghost-sm" onclick="copyTextValue(this.dataset.val, this.dataset.label)" data-val="${escapeHtml(x.v || '')}" data-label="${escapeHtml(x.k)}">${t('复制', 'Copy')}</button>
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
      else if (wallet.pin) parts.push('PIN');
      const pinBtn = $('btn-hub-set-pin');
      if (pinBtn) pinBtn.classList.toggle('hidden', Boolean(getNativeSecurityPlugin()));
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
      st.saveWallets();
      renderAll();
      showToast(`✅ ${res.accountId} ${t('注册成功，MPC 全链地址已切换', 'registered & MPC addresses updated')}`);
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
        if (authSecret.startsWith('ml-dsa-65:')) {
          const pqAuth = crypto.importNearMlDsa65FromSecretKey(authSecret);
          authPub = pqAuth.publicKey;
          authPriv = pqAuth.secretKey;
        } else if (authSecret.startsWith('ed25519:') || /^[1-9A-HJ-NP-Za-km-z]{60,95}$/.test(authSecret)) {
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
            accountType: authPub.startsWith('ml-dsa-65:') ? 'post_quantum' : 'standard',
            nearNamedAccount: domain,
            nearAddress: domain,
            nearPublicKey: authPub.startsWith('ed25519:') ? authPub : '',
            nearPrivateKey: authPriv.startsWith('ed25519:') ? authPriv : '',
            nearMlDsa65PublicKey: authPub.startsWith('ml-dsa-65:') ? authPub : '',
            nearMlDsa65PrivateKey: authPriv.startsWith('ml-dsa-65:') ? authPriv : '',
            nearBalance: 1
          },
          newPublicKeyStr: targetPub
        });
      }

      wallet.nearNamedAccount = domain;
      if (wallet.accountType !== 'post_quantum') {
        if (typeof st.recomputeWalletMpcAddresses === 'function') {
          st.recomputeWalletMpcAddresses(wallet);
        } else {
          wallet.mpcEvmAddress = await contracts.deriveMpcEvmAddressAsync(domain, 'ethereum-1');
          wallet.evmAddress = wallet.mpcEvmAddress;
        }
      }
      if ($('hub-near-bind-auth-input')) $('hub-near-bind-auth-input').value = '';
      st.saveWallets();
      renderAll();
      showToast(`✅ ${t('已绑定主账户', 'Bound master account')}: ${domain}`);
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
    const cleanHex = rawInput.replace(/^0x/i, '');
    const payloadBytes = /^[0-9a-fA-F]{64}$/.test(cleanHex)
      ? crypto.hexToBytes(cleanHex)
      : crypto.keccak256Bytes(rawInput);

    if (!(await verifySecurityAuthAsync(wallet, t('确认 MPC 链抽象签名', 'Confirm MPC Chain Signature')))) return;
    try {
      const res = await contracts.requestNearMpcChainSignature({
        wallet,
        payloadHash32Bytes: payloadBytes,
        path
      });
      const rec = $('hub-mpc-receipt');
      if (rec) {
        rec.classList.remove('hidden');
        rec.innerHTML = `
          <div class="meta-row"><span class="meta-key">v1.signer Tx</span><span class="mono text-cyan">${escapeHtml(shortenAddr(res.txHash, 10, 8))}</span></div>
          <a href="${escapeHtml(res.explorerUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan" style="font-size:11.5px;">${t('查看链上执行结果 ↗', 'View on NearBlocks ↗')}</a>
        `;
      }
      showToast(`✅ ${t('MPC 链签名请求已广播', 'MPC sign tx broadcast')}`);
    } catch (err) {
      showToast(err && err.message ? err.message : t('MPC 签名失败', 'MPC sign failed'));
    }
  }

  // ==================== Deep Mining Pro Sheet ====================

  function openMiningProSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const inp = $('mining-address-input');
    if (inp && !inp.value && wallet && wallet.address) {
      inp.value = wallet.address;
      st.mining.minerAddress = wallet.address;
    }
    renderMiningWatchlist();
    renderMiningPoolSelector();
    renderMiningTelemetry();
    openSheet('sheet-mining-pro');
    refreshMiningNetworkBar();
    if (inp && inp.value && !st.mining.telemetry) {
      runMiningDeepQuery();
    }
  }

  async function refreshMiningNetworkBar() {
    const st = getState();
    const mining = getMining();
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
        <span style="cursor:pointer;" onclick="selectSavedMiner('${escapeHtml(item.address)}')">${escapeHtml(item.label || shortenAddr(item.address, 6, 5))}</span>
        <span style="cursor:pointer;opacity:0.65;" onclick="removeSavedMiner('${escapeHtml(item.address)}')">×</span>
      </span>
    `).join('');
  }

  function selectSavedMiner(addr) {
    if ($('mining-address-input')) $('mining-address-input').value = addr;
    runMiningDeepQuery();
  }

  function saveCurrentMinerAddress() {
    const mining = getMining();
    const addr = ($('mining-address-input')?.value || '').trim();
    if (!addr) return;
    try {
      mining.addSavedMinerAddress(addr, '', getState().mining.poolKey);
      renderMiningWatchlist();
      showToast(t('已加入矿工收藏列表', 'Saved to watchlist'));
    } catch (err) {
      showToast(err && err.message ? err.message : t('无效 Pearl 地址', 'Invalid Pearl address'));
    }
  }

  function removeSavedMiner(addr) {
    const mining = getMining();
    mining.removeSavedMinerAddress(addr);
    renderMiningWatchlist();
  }

  async function runMiningDeepQuery() {
    const st = getState();
    const mining = getMining();
    const addr = ($('mining-address-input')?.value || '').trim();
    if (!addr) {
      showToast(t('请输入 prl1p... 矿工地址', 'Enter prl1p... miner address'));
      return;
    }
    st.mining.minerAddress = addr;
    st.mining.loading = true;
    try {
      const tel = await mining.queryMinerDeepStats(addr, st.mining.poolKey);
      st.mining.telemetry = tel;
      renderMiningTelemetry();
    } catch (err) {
      showToast(err && err.message ? err.message : t('矿工数据查询失败', 'Miner query failed'));
    } finally {
      st.mining.loading = false;
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
    if (payoutsEl) {
      const payouts = tel && Array.isArray(tel.payoutHistory) ? tel.payoutHistory : [];
      if (payouts.length === 0) {
        payoutsEl.innerHTML = `<div class="text-muted" style="font-size:11.5px;text-align:center;padding:8px;">${t('暂无打款记录', 'No payout history')}</div>`;
      } else {
        payoutsEl.innerHTML = payouts.slice(0, 12).map((p) => `
          <div class="meta-list" style="padding:8px 10px;">
            <div class="meta-row">
              <span class="mono text-emerald" style="font-weight:700;">+${p.amountPrl !== null ? formatBal(p.amountPrl, 6) : '--'} PRL</span>
              <span style="font-size:11px;color:var(--text-muted);">${p.timestamp ? new Date(p.timestamp).toLocaleString() : '--'}</span>
            </div>
            <div class="meta-row" style="font-size:10.5px;">
              <span>${escapeHtml(p.status || 'confirmed')}</span>
              ${p.explorerUrl ? `<a href="${escapeHtml(p.explorerUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan">${escapeHtml(shortenAddr(p.txid, 8, 6))} ↗</a>` : ''}
            </div>
          </div>
        `).join('');
      }
    }
  }

  // ==================== Solana Rent Reclaim & Dust Burn ====================

  let _solRentScanAccounts = [];
  let _solRentSelectedAtas = new Set();

  function openSolRentReclaimSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet || !wallet.solAddress || wallet.accountType === 'post_quantum') {
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

    const solTokens = getTokens().filter((tk) => String(tk.blockchain || '').toLowerCase() === 'sol' && tk.contractAddress);
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
            <input type="checkbox" ${checked} onchange="toggleSolRentItem('${escapeHtml(acc.ataAddress)}', this.checked)" />
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
      if (typeof refreshAllBalances === 'function') refreshAllBalances().catch(() => {});
    } catch (err) {
      showToast(err && err.message ? err.message : t('租金回收失败', 'Rent reclaim failed'));
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
              ? `<button type="button" class="mini-action-btn primary" onclick="pickContactAddress('${escapeHtml(c.address)}')">${t('选用', 'Use')}</button>`
              : `<button type="button" class="btn-ghost-sm" onclick="copyTextValue(this.dataset.val, this.dataset.label)" data-val="${escapeHtml(c.address)}" data-label="${escapeHtml(c.name)}">${t('复制', 'Copy')}</button>`}
            <button type="button" class="btn-danger" style="padding:4px 8px;font-size:10.5px;" onclick="deleteContactById('${escapeHtml(c.id)}')">${t('删除', 'Del')}</button>
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
    closeAllSheets();
    if (target === 'send') {
      openSendSheet({ recipient: address });
      handleSendRecipientInput();
    } else if (target === 'swap') {
      st.swap.recipientAddress = address;
      if ($('swap-recipient-input')) $('swap-recipient-input').value = address;
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
    const sdk = (typeof window !== 'undefined' && window.PearlWalletConnect) || (typeof globalThis !== 'undefined' && globalThis.PearlWalletConnect);
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
            <button type="button" class="btn-danger" style="padding:4px 8px;font-size:10.5px;" onclick="disconnectWcSession('${escapeHtml(s.topic)}')">${t('断开', 'Disconnect')}</button>
          </div>
          <span class="text-muted" style="font-size:11px;">${escapeHtml(meta.url || s.topic)}</span>
        </div>
      `;
    }).join('');
  }

  async function openWalletConnectSheet() {
    const st = getState();
    if ($('wc-project-id-input')) $('wc-project-id-input').value = st.wc.projectId || '';
    if ($('wc-uri-input')) $('wc-uri-input').value = '';
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
      const ethersLib = (typeof window !== 'undefined' && window.ethers) || (typeof globalThis !== 'undefined' && globalThis.ethers);
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

  function renderAll() {
    const st = getState();
    renderOnboardingVisibility();
    if (st.getActiveWallet()) {
      renderHeaderAndHero();
      if (st.activeTab === 'wallet') renderUnifiedAssetList();
      if (st.activeTab === 'swap') renderSwapView();
      if (st.activeTab === 'earn') renderEarnView();
      if (st.activeTab === 'hub') renderHubView();
      const detailSheet = $('sheet-token-detail');
      if (detailSheet && detailSheet.classList && detailSheet.classList.contains('open')) {
        renderTokenDetailSheet();
      }
    }
  }

  function bootstrapApp() {
    const st = getState();
    st.initState();
    st.onLanguageChange(() => renderAll());
    renderAll();
    if (st.getActiveWallet()) {
      refreshAllBalancesAsync(false);
      refreshStakingMetrics(false);
    }
    startAutoPriceAndBalanceSync();
    if (st.wc.projectId) {
      ensureWcReady().catch(() => {});
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
    renderHubBiometricCardAsync,
    testBiometricAuthNow,
    openSetWalletPinPrompt,
    pressSecurityPinDigit,
    clearSecurityPin,
    backspaceSecurityPin,
    triggerSecurityBiometricNow,
    cancelSecurityAuthModal,
    refreshAllBalancesAsync,
    startAutoPriceAndBalanceSync,
    buildAllOnChainAssetGroups,
    buildAggregatedAssetGroups,
    renderUnifiedAssetList,
    toggleAssetExpand,
    openTokenDetailSheet,
    setTokenDetailChain,
    renderTokenDetailSheet,
    tokenDetailAction,
    copyTokenDetailAddress,
    recordWalletActivity,
    openSendSheet,
    executeUnifiedSend,
    openReceiveSheet,
    renderSwapView,
    getTargetChainGasReserveInfo,
    computeNetSwapOutput,
    toggleSwapDetails,
    setSwapGasReserveMode,
    fetchLiveSwapQuoteAsync,
    toggleFavoriteSwapToken,
    renderTokenPickerList,
    executeActiveSwap,
    refreshStakingMetrics,
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
    openWalletSwitcherSheet,
    openBackupKeysSheet,
    toggleBackupKeysReveal,
    openPinSheet,
    openCreatePqWalletFlow,
    setOnboardImportMode,
    startAdditionalPqWalletCreate,
    openNearAccessKeysSheet,
    refreshNearAccessKeysSheet,
    deleteNearAccessKeyFromSheet,
    setRotateKeyMode,
    generateRotateMnemonicInSheet,
    addNearMnemonicKeyOnlyFromSheet,
    confirmRotateNearAccountKey,
    activateUniversalAccountFromSheet
  };

  const globalHandlers = {
    switchTab,
    toggleLanguage,
    openCreateWalletFlow,
    openCreatePqWalletFlow,
    confirmCreateWallet,
    openImportWalletFlow,
    setOnboardImportMode,
    validateOnboardImportLive,
    confirmImportWallet,
    cancelOnboardSubPanel,
    copyPendingMnemonic,
    openWalletSwitcherSheet,
    switchActiveWallet,
    deleteWalletById,
    startAdditionalWalletCreate,
    startAdditionalPqWalletCreate,
    startAdditionalWalletImport,
    openBackupKeysSheet,
    toggleBackupKeysReveal,
    openNearAccessKeysSheet,
    refreshNearAccessKeysSheet,
    deleteNearAccessKeyFromSheet,
    setRotateKeyMode,
    generateRotateMnemonicInSheet,
    addNearMnemonicKeyOnlyFromSheet,
    confirmRotateNearAccountKey,
    activateUniversalAccountFromSheet,
    openPinSheet,
    saveWalletPin,
    testBiometricAuthNow,
    openSetWalletPinPrompt,
    pressSecurityPinDigit,
    clearSecurityPin,
    backspaceSecurityPin,
    triggerSecurityBiometricNow,
    cancelSecurityAuthModal,
    copyTextValue,
    copyActiveNearId,
    jumpToNearDomainManager,
    focusMpcInspector,
    refreshAllBalancesAsync,
    startAutoPriceAndBalanceSync,
    toggleAssetExpand,
    openTokenDetailSheet,
    setTokenDetailChain,
    tokenDetailAction,
    copyTokenDetailAddress,
    openTokenDetailPool,
    recordWalletActivity,
    quickActionSwapFromEntry,
    quickActionSendFromEntry,
    openSendSheet,
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
    clearActiveSwapOrder,
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
