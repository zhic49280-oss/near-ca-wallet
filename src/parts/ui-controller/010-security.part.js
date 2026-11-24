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
      return { ok: false, error: t('当前浏览器不支持设备通行密钥', 'Biometric passkey unsupported') };
    }
    if (typeof location !== 'undefined' && location.protocol === 'file:' && !overrides.navigator) {
      return { ok: false, error: t('本地文件协议不支持设备通行密钥', 'Passkey requires HTTPS or localhost') };
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
      const msg = err && err.message ? String(err.message) : t('生物识别验证失败', 'Biometric verification failed');
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
        if (bioUnavailable && !hasConfiguredWalletPin(wallet)) {
          if (statusEl) {
            statusEl.textContent = t('设备生物识别不可用且未设置 PIN，请先设置安全 PIN', 'Device biometrics unavailable and no PIN set. Please set a security PIN.');
          }
          showToast(t('设备生物识别不可用，请先设置安全 PIN', 'Biometrics unavailable, please set a security PIN first'));
          if (typeof openSetWalletPinPrompt === 'function') openSetWalletPinPrompt();
          return false;
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
    if (st && st.swap && st.swap.activeOrder && st.swap.activeOrder.depositAddress) {
      const ord = st.swap.activeOrder;
      const upper = String(ord.status || '').toUpperCase();
      const pendingFollow = typeof hasPendingSwapFollowUp === 'function' && hasPendingSwapFollowUp(ord) && !ord.followUpFailed;
      if (!['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED'].includes(upper) || pendingFollow) {
        if (typeof refreshActiveSwapOrderStatus === 'function') refreshActiveSwapOrderStatus(false).catch(() => {});
        if (typeof startOrderStatusPolling === 'function') startOrderStatusPolling(false);
      }
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
          const msg = err && err.message ? String(err.message) : t('生物识别验证异常', 'Native biometric error');
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
    if (dotsWrap) {
      const dots = dotsWrap.querySelectorAll('.bio-pin-dot');
      const targetLen = _secAuthState.expectedLen || 6;
      const enteredLen = (_secAuthState.pinBuffer || '').length;
      dots.forEach((dot, idx) => {
        dot.style.display = idx < targetLen ? '' : 'none';
        dot.classList.toggle('filled', idx < enteredLen);
      });
    }
    const confirmBtn = $('btn-security-pin-confirm');
    if (confirmBtn) {
      const enteredLen = (_secAuthState.pinBuffer || '').length;
      const showConfirm = Boolean(_secAuthState.allowShortSubmit && enteredLen >= 4 && enteredLen < (_secAuthState.expectedLen || 6));
      confirmBtn.classList.toggle('hidden', !showConfirm);
    }
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
    if (typeof syncSheetScrollLock === 'function') syncSheetScrollLock();
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

  async function submitSecurityPin() {
    const st = getState();
    const w = _secAuthState.wallet;
    if (!w || !(typeof st.hasWalletPin === 'function' ? st.hasWalletPin(w) : Boolean(w.pin)) || _secAuthState.verifying) return;
    const candidate = String(_secAuthState.pinBuffer || '');
    if (candidate.length < 4) return;
    _secAuthState.verifying = true;
    try {
      const ok = typeof st.verifyWalletPinAsync === 'function'
        ? await st.verifyWalletPinAsync(w, candidate)
        : candidate === String(w.pin);
      if (ok) {
        if (!w.pinLen || w.pinLen !== candidate.length) {
          w.pinLen = candidate.length;
          if (typeof st.saveWallets === 'function') st.saveWallets();
        }
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
      await submitSecurityPin();
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
      showToast(t('安全验证窗口不可用', 'Security verification dialog unavailable'));
      return false;
    }

    if (typeof _secAuthState.resolve === 'function') {
      _secAuthState.resolve(false);
    }

    const knownLen = w.pinLen >= 4 ? Math.min(6, w.pinLen) : (w.pin && String(w.pin).length >= 4 ? Math.min(6, String(w.pin).length) : 0);
    const expectedLen = knownLen || 6;
    _secAuthState = {
      resolve: null,
      wallet: w,
      reason: String(reason || ''),
      pinBuffer: '',
      expectedLen,
      allowShortSubmit: knownLen === 0,
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
      if (!bioUnavailable && !hasPin) {
        if (bioRes.cancelled) {
          showToast(t('已取消验证', 'Verification cancelled'));
        } else if (!nativeAuth) {
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

