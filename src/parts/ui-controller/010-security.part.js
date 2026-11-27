  // ==================== Native Biometrics, WebAuthn & Security Modal ====================

  let _cachedBioProfile = null;
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
    throw new Error('Cryptographically secure random number generator (crypto.getRandomValues) is unavailable');
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
        methods = ['Windows Hello', t('指纹 / 人脸 / 系统密码', 'Fingerprint / Face / Device Password')];
      }
    } else {
      brand = 'Web';
      if (!deviceModel) deviceModel = t('当前设备', 'Current Device');
      if (methods.length === 0) {
        methods = hasWebAuthnPlatform
          ? [t('平台生物识别通行密钥', 'Platform Passkey')]
          : [t('设备锁屏', 'Device Lock')];
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
      return { ok: false, unavailable: true, error: t('当前浏览器不支持设备通行密钥', 'Biometric passkey unsupported') };
    }
    if (typeof location !== 'undefined' && location.protocol === 'file:' && !overrides.navigator) {
      return { ok: false, unavailable: true, error: t('本地文件协议不支持设备通行密钥', 'Passkey requires HTTPS or localhost') };
    }
    const PubKeyCred = getPublicKeyCredCtor(overrides);
    if (PubKeyCred && typeof PubKeyCred.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      const avail = await PubKeyCred.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
      if (!avail) {
        return { ok: false, unavailable: true, error: t('未检测到平台生物识别验证器', 'Platform authenticator unavailable') };
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
          return { ok: false, cancelled: true, error: t('未返回验证凭据', 'No assertion returned') };
        }
        return {
          ok: true,
          method: 'webauthn',
          credentialId: bytesToBase64Url(assertion.rawId) || activeWallet.webauthnCredentialId
        };
      }

      const userLabel = (activeWallet && (activeWallet.nearNamedAccount || activeWallet.name)) || 'Nexus Wallet';
      const userId = getRandomBytesCompat(16);
      const cred = await nav.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Nexus Wallet', id: rpId },
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
        return { ok: false, cancelled: true, error: t('未创建验证凭据', 'No credential created') };
      }
      const credId = bytesToBase64Url(cred.rawId || cred.id);
      if (activeWallet && credId) {
        activeWallet.webauthnCredentialId = credId;
        st.saveWallets();
      }
      return { ok: true, method: 'webauthn', registered: true, credentialId: credId };
    } catch (err) {
      const name = err && err.name ? String(err.name) : '';
      const rawMsg = err && err.message ? String(err.message) : '';
      const hasRegisteredCred = Boolean(activeWallet && activeWallet.webauthnCredentialId);
      const cancelled = name === 'NotAllowedError' || name === 'AbortError' || /cancel/i.test(rawMsg);
      const unavailable =
        name === 'NotSupportedError' ||
        (!hasRegisteredCred && (name === 'SecurityError' || name === 'InvalidStateError')) ||
        (!hasRegisteredCred && /unavailable|not supported/i.test(rawMsg));
      const msg = cancelled
        ? t('已取消生物识别验证', 'Biometric verification cancelled')
        : toUserFriendlyError(err, '生物识别验证失败，请重试', 'Biometric verification failed. Please retry.');
      return { ok: false, cancelled, unavailable, error: msg };
    }
  }

  const APP_LOCK_TIMEOUT_MS = 60_000;
  const _appLockState = {
    locked: false,
    authenticating: false,
    backgroundedAt: 0,
    inBackground: false,
    lifecycleBound: false
  };

  function isWalletBiometricAllowed(wallet) {
    return Boolean(wallet && wallet.biometricEnabled !== false);
  }

  function isAppLocked() {
    return Boolean(_appLockState.locked);
  }

  function shouldEnableAppLockForWallet(wallet, overrides = {}) {
    if (!wallet) return false;
    const bioAllowed = isWalletBiometricAllowed(wallet);
    const nativePlugin = bioAllowed ? getNativeSecurityPlugin(overrides.nativePlugin) : null;
    const hasWebAuthn = bioAllowed ? Boolean(wallet.webauthnCredentialId) : false;
    return Boolean(nativePlugin || hasWebAuthn);
  }

  function setRootClass(cls, enabled) {
    if (typeof document === 'undefined' || !document.documentElement || !document.documentElement.classList) return;
    document.documentElement.classList.toggle(cls, Boolean(enabled));
  }

  function clearAppLock() {
    const wasLocked = Boolean(_appLockState.locked);
    _appLockState.locked = false;
    _appLockState.backgroundedAt = 0;
    setRootClass('nexus-locked', false);
    const overlay = $('app-lock-overlay');
    if (overlay) overlay.setAttribute('aria-hidden', 'true');
    const st = getState();
    if (st && st._deferredBootSync) {
      st._deferredBootSync = false;
      if (st.getActiveWallet()) {
        if (typeof refreshAllBalancesAsync === 'function') refreshAllBalancesAsync(false).catch(() => {});
        if (typeof refreshPerpDataAsync === 'function') refreshPerpDataAsync(false).catch(() => {});
        if (typeof ensureStakingMetricsFresh === 'function') ensureStakingMetricsFresh(300_000);
        if (typeof handleForegroundResume === 'function') {
          handleForegroundResume({ immediateBalanceSync: false, skipPerpAccountRefresh: true });
        }
      }
    } else if (wasLocked && st && st.getActiveWallet()) {
      if (typeof handleForegroundResume === 'function') {
        handleForegroundResume({ immediateBalanceSync: true });
      }
    }
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
    const crypto = getCrypto();
    if (crypto && typeof crypto.clearPbkdf2Cache === 'function') crypto.clearPbkdf2Cache();
    else if (typeof globalThis !== 'undefined' && typeof globalThis.__clearPbkdf2Cache === 'function') globalThis.__clearPbkdf2Cache();
    _appLockState.locked = true;
    setRootClass('nexus-locked', true);
    const overlay = $('app-lock-overlay');
    if (overlay) overlay.setAttribute('aria-hidden', 'false');
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

    const bioAllowed = isWalletBiometricAllowed(wallet);
    const nativePlugin = bioAllowed ? getNativeSecurityPlugin(overrides.nativePlugin) : null;
    const profile = !bioAllowed
      ? { supported: false }
      : (nativePlugin ? { supported: true } : (_cachedBioProfile || await detectDeviceBiometricProfileAsync(overrides)));
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
        if (bioUnavailable) {
          hintEnableDeviceLock();
          clearAppLock();
          return true;
        }
        if (statusEl) {
          statusEl.textContent = (res && res.cancelled)
            ? t('已取消验证，请点击下方按钮重试', 'Verification cancelled. Tap below to retry.')
            : toUserFriendlyError(res && res.error, '验证未通过，请重试', 'Verification failed. Please retry.');
        }
        return false;
      }
      clearAppLock();
      return true;
    } finally {
      if (unlockBtn) unlockBtn.disabled = false;
    }
  }


  function handleAppVisibilityChange(isHidden, nowMs = Date.now(), overrides = {}) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) {
      _appLockState.inBackground = Boolean(isHidden);
      setBackgroundPrivacyBlur(false);
      clearAppLock();
      return;
    }
    if (isHidden) {
      const wasInBackground = Boolean(_appLockState.inBackground);
      _appLockState.inBackground = true;
      if (!wasInBackground) {
        if (typeof pausePerpRealtime === 'function') pausePerpRealtime();
        else if (typeof stopPerpLiveFeed === 'function') stopPerpLiveFeed();
        if (typeof stopOrderStatusPolling === 'function') stopOrderStatusPolling();
        if (typeof stopAutoPriceAndBalanceSync === 'function') stopAutoPriceAndBalanceSync({ fromBackground: true });
        if (typeof pausePerpOneClickDepositPolling === 'function') pausePerpOneClickDepositPolling();
      }
      if (_appLockState.authenticating) return;
      if (!_appLockState.backgroundedAt) {
        _appLockState.backgroundedAt = Number(nowMs) || Date.now();
      }
      setBackgroundPrivacyBlur(true);
      return;
    }
    if (typeof isAppInBackground === 'function' && isAppInBackground()) return;
    const wasInBackground = Boolean(_appLockState.inBackground || _appLockState.backgroundedAt > 0);
    _appLockState.inBackground = false;
    setBackgroundPrivacyBlur(false);
    if (_appLockState.authenticating) {
      _appLockState.backgroundedAt = 0;
      return;
    }
    const leftAt = _appLockState.backgroundedAt;
    _appLockState.backgroundedAt = 0;
    if (!wasInBackground) return;
    if (leftAt > 0 && (Number(nowMs) - leftAt) >= APP_LOCK_TIMEOUT_MS && shouldEnableAppLockForWallet(wallet, overrides)) {
      engageAppLock(true, overrides);
      return;
    }
    if (!isAppLocked() && st && typeof handleForegroundResume === 'function') {
      handleForegroundResume({ immediateBalanceSync: true });
    }
  }

  function initAppSecurityLifecycle() {
    if (_appLockState.lifecycleBound || typeof document === 'undefined') return;
    _appLockState.lifecycleBound = true;

    document.addEventListener('visibilitychange', () => {
      handleAppVisibilityChange(Boolean(document.hidden), Date.now());
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('focus', () => {
        handleAppVisibilityChange(false, Date.now());
      });
      const capApp = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      if (capApp && typeof capApp.addListener === 'function') {
        try {
          capApp.addListener('appStateChange', (stateInfo) => {
            const isActive = Boolean(stateInfo && stateInfo.isActive);
            if (typeof setCapAppBackgrounded === 'function') setCapAppBackgrounded(!isActive);
            handleAppVisibilityChange(!isActive, Date.now());
          });
        } catch (_) {}
      }
    }
  }

  async function requestBiometricAuth(reason, wallet, overrides = {}) {
    if (_appLockState.authenticating) {
      return { ok: false, cancelled: true, busy: true, error: t('身份验证正在进行中', 'Authentication already in progress') };
    }
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
          const rawErrMsg = (res && res.error) ? String(res.error) : '';
          const unavailable = errCode === 'AUTH_UNAVAILABLE' || /AUTH_UNAVAILABLE|unavailable|not enrolled|passcode not set|not configured/i.test(rawErrMsg);
          const cancelled = Boolean((res && res.cancelled) || errCode === 'AUTH_CANCELLED' || /AUTH_CANCELLED|取消|cancel|abort|dismiss/i.test(rawErrMsg));
          const errMsg = cancelled
            ? t('已取消生物识别验证', 'Biometric verification cancelled')
            : toUserFriendlyError(rawErrMsg, '生物识别未通过', 'Biometric authentication failed');
          return {
            ok: false,
            code: errCode,
            unavailable,
            cancelled,
            error: errMsg
          };
        } catch (err) {
          const errCode = (err && err.code) ? String(err.code) : '';
          const rawMsg = err && err.message ? String(err.message) : '';
          const unavailable = errCode === 'AUTH_UNAVAILABLE' || /AUTH_UNAVAILABLE|unavailable|not enrolled|passcode not set|not configured/i.test(rawMsg);
          const cancelled = errCode === 'AUTH_CANCELLED' || /AUTH_CANCELLED|取消|cancel|abort|dismiss/i.test(rawMsg);
          const msg = cancelled
            ? t('已取消生物识别验证', 'Biometric verification cancelled')
            : toUserFriendlyError(err, '生物识别验证异常，请重试', 'Biometric verification failed; please retry');
          return {
            ok: false,
            code: errCode,
            unavailable,
            cancelled,
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

  // 设备能力不足时的友好提示（每次会话仅提示一次，避免打扰）
  let _noDeviceAuthHinted = false;
  function hintEnableDeviceLock() {
    if (_noDeviceAuthHinted) return;
    _noDeviceAuthHinted = true;
    showToast(t('建议在系统设置中开启锁屏密码或生物识别，以更好保护资产', 'Enable a device screen lock or biometrics in system settings to better protect your assets'));
  }

  async function verifySecurityAuthAsync(wallet, reason = '') {
    const st = getState();
    const w = wallet || st.getActiveWallet();
    if (!w) return false;
    if (!isWalletBiometricAllowed(w)) return true;
    const profile = _cachedBioProfile || await detectDeviceBiometricProfileAsync();
    if (!(profile && profile.supported)) {
      hintEnableDeviceLock();
      return true;
    }
    const res = await requestBiometricAuth(reason, w);
    if (res && res.ok) return true;
    if (res && res.unavailable) {
      hintEnableDeviceLock();
      return true;
    }
    if (res && res.cancelled) {
      showToast(t('已取消验证', 'Verification cancelled'));
    } else {
      showToast(toUserFriendlyError(res && res.error, '验证未通过，请重试', 'Verification failed. Please retry.'));
    }
    return false;
  }

