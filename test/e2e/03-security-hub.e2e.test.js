'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startTestServer,
  loadDistAssets,
  createWalletAppSession,
  isBroadcastRequest,
  assertZeroDevJargon
} = require('./e2e-harness.js');

const TEST_MNEMONIC_1 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_MNEMONIC_2 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

const VALID_EVM_ADDR = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
const BAD_CHECKSUM_EVM_ADDR = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9a';
const VALID_SOL_ADDR = '11111111111111111111111111111111';
const VALID_PRL_ADDR = 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt74';
const BAD_CHECKSUM_PRL_ADDR = 'prl1pr6yuq8u2r95wjzzgpdy8cpnncpl7l8zgy6x5q0367pnc53s2famqg7pt7q';

function createSeededWallet(overrides = {}) {
  return {
    id: 'e2e_wallet_1',
    name: 'E2E Main',
    mnemonic: TEST_MNEMONIC_1,
    nearAddress: '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000',
    nearPublicKey: 'ed25519:5J8Wx5fKx8F2o1V9Q3nP7sL6mK9rT2uV4wX6yZ8aB1cD',
    evmAddress: '0x1111111111111111111111111111111111111111',
    mpcEvmAddress: '0x1111111111111111111111111111111111111111',
    solAddress: VALID_SOL_ADDR,
    address: VALID_PRL_ADDR,
    btcAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    nativeBalances: {
      near: 12.5,
      sol: 2.0,
      eth: 0.5,
      base: 0.25,
      arb: 0.5,
      bsc: 0.2,
      op: 0.1,
      pol: 10,
      avax: 1,
      hype: 1,
      hood: 0,
      arc: 5,
      prl: 100,
      btc: 0.01
    },
    ...overrides
  };
}

function mockJsonResponse(payload, status = 200) {
  const raw = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Status ${status}`,
    headers: new Headers({ 'content-type': 'application/json' }),
    async json() { return JSON.parse(raw); },
    async text() { return raw; }
  };
}

function createMockWalletConnectSdk(options = {}) {
  const calls = {
    pair: [],
    approveSession: [],
    rejectSession: [],
    respondSessionRequest: [],
    disconnectSession: []
  };
  let activeSessions = { ...(options.initialSessions || {}) };
  const listeners = new Map();

  class Core {
    constructor(cfg) {
      this.projectId = cfg.projectId;
      this.pairing = {
        pair: async ({ uri }) => {
          calls.pair.push(uri);
        }
      };
    }
  }

  const client = {
    on(evName, fn) {
      const list = listeners.get(evName) || [];
      list.push(fn);
      listeners.set(evName, list);
    },
    emit(evName, payload) {
      for (const fn of (listeners.get(evName) || [])) {
        fn(payload);
      }
    },
    getActiveSessions() {
      return { ...activeSessions };
    },
    session: {
      get(topic) {
        return activeSessions[topic] || null;
      }
    },
    async approveSession(arg) {
      calls.approveSession.push(arg);
      const topic = `topic_${calls.approveSession.length}`;
      const proposal = options.lastProposal || {};
      const sess = {
        topic,
        namespaces: arg.namespaces,
        peer: { metadata: (proposal.params && proposal.params.proposer && proposal.params.proposer.metadata) || { name: 'Mock DApp', url: 'https://dapp.example' } }
      };
      activeSessions[topic] = sess;
      return sess;
    },
    async rejectSession(arg) {
      calls.rejectSession.push(arg);
    },
    async respondSessionRequest(arg) {
      calls.respondSessionRequest.push(arg);
    },
    async disconnectSession(arg) {
      calls.disconnectSession.push(arg);
      delete activeSessions[arg.topic];
    }
  };

  return {
    sdk: {
      Core,
      Web3Wallet: {
        init: async ({ core } = {}) => {
          client.core = core || new Core({ projectId: 'default' });
          return client;
        }
      }
    },
    client,
    calls,
    setProposalMetadata(proposal) {
      options.lastProposal = proposal;
    }
  };
}

function createMockNativeDAppBrowser() {
  const listeners = new Map();
  const calls = {
    openUrl: [],
    sendResponse: [],
    setOverlayVisible: [],
    emitProviderEvent: []
  };
  const plugin = {
    addListener(name, fn) {
      const list = listeners.get(name) || [];
      list.push(fn);
      listeners.set(name, list);
    },
    emit(name, payload) {
      for (const fn of (listeners.get(name) || [])) {
        fn(payload);
      }
    },
    async openUrl(arg) {
      calls.openUrl.push(arg);
    },
    async sendResponse(arg) {
      calls.sendResponse.push(arg);
    },
    async setOverlayVisible(arg) {
      calls.setOverlayVisible.push(arg);
    },
    async emitProviderEvent(arg) {
      calls.emitProviderEvent.push(arg);
    }
  };
  return { plugin, calls };
}

// =====================================================================
// FEATURE 9 — DEVICE-NATIVE SECURITY & APP LOCK (TIER 1)
// =====================================================================

test('F9 Tier 1.1: Device-native auth only — PIN/Vault completely removed & legacy PIN fields stripped on boot', async () => {
  const legacyWallet = {
    ...createSeededWallet(),
    pin: '135790',
    pinHash: 'deadbeef',
    pinSalt: '1234',
    pinIterations: 100000,
    pinLen: 6,
    encryptedVault: { v: 1, ctBase64: 'abc' }
  };
  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [legacyWallet], activeWalletId: legacyWallet.id })
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    assert.equal(session.document.getElementById('sheet-pin'), null, '#sheet-pin must be removed');
    assert.equal(session.document.getElementById('sheet-security-auth'), null, '#sheet-security-auth must be removed');
    assert.equal(session.document.getElementById('btn-app-lock-pin'), null, '#btn-app-lock-pin must be removed');

    const active = session.window.NearCAState.getActiveWallet();
    assert.equal(active.pin, undefined);
    assert.equal(active.pinHash, undefined);
    assert.equal(active.encryptedVault, undefined);

    await session.switchTab('hub');
    await session.click('#hub-security-bio-card');
    await session.flushMicrotasks(8);
    assert.ok(
      session.getToastHistory().some((x) => /生物识别验证通过|Biometric check passed/.test(x.text)),
      'Hub security card must trigger NativeSecurity biometric check'
    );
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F9 Tier 1.4: Biometric-only cold-boot unlock (WebAuthn) & Backup sheet reveal/mask/copy guard', async () => {
  let getCallCount = 0;
  const credObj = {
    id: 'e2e_cred_id_1',
    rawId: new Uint8Array([1, 2, 3, 4]).buffer
  };
  const wallet = createSeededWallet({ webauthnCredentialId: 'e2e_cred_id_1' });

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    publicKeyCredential: {
      async isUserVerifyingPlatformAuthenticatorAvailable() { return true; },
      async create() { return credObj; },
      async get() {
        getCallCount += 1;
        return credObj;
      }
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    assert.ok(getCallCount >= 1, 'Biometric-only cold boot must invoke WebAuthn get()');

    // Open Backup sheet via Hub -> triggers WebAuthn auth -> starts masked -> blocks unrevealed copy -> reveals -> copies
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openBackupKeysSheet"]');
    await session.waitFor(() => session.hasClass('#sheet-backup', 'open'), 3000);
    assert.ok(getCallCount >= 2, 'Backup sheet must require security auth');

    const secretCopyBtn = session.document.querySelector('#backup-keys-content button[data-secret-copy="1"]');
    assert.ok(secretCopyBtn, 'Backup sheet must render data-secret-copy="1" buttons');
    const firstSecretEl = session.document.querySelector('#backup-keys-content .backup-secret-val');
    assert.ok(firstSecretEl.textContent.includes('••••'), 'Secrets must initially be masked');

    const clipLenBefore = session.clipboardLog.length;
    secretCopyBtn.click();
    await session.flushMicrotasks(6);
    assert.equal(session.clipboardLog.length, clipLenBefore, 'Unrevealed secret copy must be blocked');
    assert.ok(
      session.getToastHistory().some((x) => /显示助记词|Reveal phrase/.test(x.text)),
      'Blocked copy must instruct user to reveal secrets first'
    );

    await session.click('#btn-backup-reveal-toggle');
    assert.equal(firstSecretEl.textContent, TEST_MNEMONIC_1, 'Reveal toggle must show real mnemonic');
    secretCopyBtn.click();
    await session.flushMicrotasks(6);
    assert.equal(session.clipboardLog.at(-1), TEST_MNEMONIC_1, 'Post-reveal copy must write real mnemonic to clipboard');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F9 Tier 1.5: Visibility privacy shield, <60s foreground resume refreshes Perps/Limit Orders without relocking & >=60s relocks', async () => {
  const wallet = createSeededWallet();
  let perpAccountCalls = 0;
  let limitOrderCalls = 0;

  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/api\.hyperliquid\.xyz\/info/i.test(url)) {
        const body = init.body ? JSON.parse(init.body) : {};
        if (body.type === 'metaAndAssetCtxs') {
          return mockJsonResponse([
            { universe: [{ name: 'BTC', szDecimals: 4, maxLeverage: 40 }] },
            [{ markPx: '95500', prevDayPx: '93000', dayNtlVlm: '1000', openInterest: '100', funding: '0.0001' }]
          ]);
        }
        if (body.type === 'clearinghouseState') {
          perpAccountCalls += 1;
        }
        return mockJsonResponse({ marginSummary: { accountValue: '0', totalMarginUsed: '0' }, withdrawable: '0', assetPositions: [], balances: [] });
      }
      if (/trigger\.jup\.ag|cow\.fi/i.test(url)) {
        limitOrderCalls += 1;
        return mockJsonResponse({ orders: [] });
      }
      if (init.body && typeof init.body === 'string') {
        try {
          const rpc = JSON.parse(init.body);
          if (rpc.params?.request_type === 'call_function' && /dcl/i.test(rpc.params?.account_id || '')) {
            limitOrderCalls += 1;
            return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: Array.from(Buffer.from('[]', 'utf8')) } });
          }
        } catch (_) {}
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' });
    }
  });
  try {
    // Unlock initial cold boot via NativeSecurity
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);

    // 1. Switch to Perp view, trigger DOM visibilitychange hidden=true -> privacy shield engages
    await session.switchTab('perp');
    await session.waitFor(() => perpAccountCalls > 0 && session.window.NearCAState.perp.lastAccountSyncTs > 0, 3000);
    await session.flushMicrotasks(16);
    const acctBefore = perpAccountCalls;

    session.document.hidden = true;
    session.document.visibilityState = 'hidden';
    session.document.dispatchEvent(new session.window.Event('visibilitychange'));
    await session.flushMicrotasks(6);
    assert.equal(session.document.documentElement.classList.contains('nexus-privacy-blur'), true);
    assert.equal(session.document.getElementById('app-privacy-shield').getAttribute('aria-hidden'), 'false');

    // Resume within <60s -> clears blur, does NOT relock, refreshes Perp account data
    session.document.hidden = false;
    session.document.visibilityState = 'visible';
    session.document.dispatchEvent(new session.window.Event('visibilitychange'));
    await session.waitFor(() => perpAccountCalls > acctBefore, 2000);
    assert.equal(session.document.documentElement.classList.contains('nexus-privacy-blur'), false);
    assert.equal(session.document.getElementById('app-privacy-shield').getAttribute('aria-hidden'), 'true');
    assert.equal(session.document.documentElement.classList.contains('nexus-locked'), false);
    assert.ok(perpAccountCalls > acctBefore, 'Foreground <60s resume on Perp tab must refresh Perp account data');

    // 2. Switch to Swap Limit mode, background & resume <60s -> refreshes Limit Orders
    await session.switchTab('swap');
    await session.click('#view-swap button[onclick*="setSwapPanelMode(\'limit\')"]');
    await session.waitFor(() => limitOrderCalls > 0, 2000);
    const limitBefore = limitOrderCalls;
    const t0 = Date.now();
    session.window.NearCAUI.handleAppVisibilityChange(true, t0);
    session.window.NearCAUI.handleAppVisibilityChange(false, t0 + 15_000);
    await session.waitFor(() => limitOrderCalls > limitBefore, 2000);
    assert.equal(session.document.documentElement.classList.contains('nexus-locked'), false);
    assert.ok(limitOrderCalls > limitBefore, 'Foreground <60s resume in Limit mode must refresh limit orders');

    // 3. Background & resume >= 60s -> engages nexus-locked
    const t1 = t0 + 20_000;
    session.window.NearCAUI.handleAppVisibilityChange(true, t1);
    assert.equal(session.document.documentElement.classList.contains('nexus-privacy-blur'), true);
    session.window.NearCAUI.handleAppVisibilityChange(false, t1 + 60_000);
    await session.flushMicrotasks(10);
    assert.equal(session.document.documentElement.classList.contains('nexus-privacy-blur'), false);
    assert.equal(session.document.documentElement.classList.contains('nexus-locked'), true, '>= 60s background must re-engage nexus-locked');
    assert.equal(session.document.getElementById('app-lock-overlay').getAttribute('aria-hidden'), 'false');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F9 Tier 1.6: NativeSecurity biometric-only unlock & deferred boot sync', async () => {
  let nativeBioCalls = 0;
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() {
            nativeBioCalls += 1;
            return { verified: true, type: 'face' };
          }
        }
      }
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    assert.ok(nativeBioCalls >= 1, 'NativeSecurity biometric cold-boot unlock must succeed');
    assert.equal(session.document.getElementById('app-lock-overlay').getAttribute('aria-hidden'), 'true');
    assert.equal(session.isVisible('#view-wallet'), true);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

// =====================================================================
// FEATURE 9 — SECURITY & APP LOCK (TIER 2)
// =====================================================================

test('F9 Tier 2.3: Backup secrets re-mask on blur and wipe on closeAllSheets', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: makeBioCapacitorMock(),
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);

    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openBackupKeysSheet"]');
    await session.waitFor(() => session.hasClass('#sheet-backup', 'open'), 2000);

    await session.click('#btn-backup-reveal-toggle');
    const secretEl = session.document.querySelector('#backup-keys-content .backup-secret-val');
    assert.equal(secretEl.textContent, TEST_MNEMONIC_1);

    session.window.dispatchEvent(new session.window.Event('blur'));
    await session.flushMicrotasks(6);
    assert.ok(secretEl.textContent.includes('••••'), 'window blur must immediately re-mask revealed backup secrets');

    await session.closeSheet('sheet-backup');
    assert.equal(session.document.getElementById('backup-keys-content').innerHTML, '', 'closeAllSheets() must wipe #backup-keys-content');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F9 Tier 2.4: [POST-FIX] WebAuthn & NativeSecurity errors (NotAllowedError, SecurityError, AUTH_UNAVAILABLE) sanitized with zero dev jargon', async () => {
  // Part A: WebAuthn NotAllowedError & SecurityError
  let nextErr = Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' });
  const walletA = createSeededWallet({ webauthnCredentialId: 'cred_a' });
  const sessionA = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [walletA], activeWalletId: walletA.id })
    },
    publicKeyCredential: {
      async isUserVerifyingPlatformAuthenticatorAvailable() { return true; },
      async create() { throw nextErr; },
      async get() { throw nextErr; }
    }
  });
  try {
    await sessionA.waitFor(() => sessionA.document.documentElement.classList.contains('nexus-locked'), 2000);
    await sessionA.flushMicrotasks(12);
    const statusNotAllowed = sessionA.getVisibleText('#app-lock-status');
    assert.ok(statusNotAllowed.length > 0);
    assertZeroDevJargon(statusNotAllowed, 'WebAuthn NotAllowedError status');

    nextErr = Object.assign(new Error('DOMException: WebAuthn SecurityError CORS HTTP 500'), { name: 'SecurityError' });
    await sessionA.click('#btn-app-lock-unlock');
    await sessionA.flushMicrotasks(12);
    const statusSecurity = sessionA.getVisibleText('#app-lock-status');
    assertZeroDevJargon(statusSecurity, 'WebAuthn SecurityError status');
    for (const toast of sessionA.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'WebAuthn error toast');
    }
    sessionA.assertNoRuntimeErrors();
    sessionA.assertNoRealBroadcasts();
  } finally {
    sessionA.cleanup();
  }

  // Part B: NativeSecurity AUTH_UNAVAILABLE degrades gracefully without deadlocking wallet, plus [POST-FIX] testBiometricAuthNow raw error sanitization
  const walletB = createSeededWallet();
  let nativeRes = { verified: false, code: 'AUTH_UNAVAILABLE', error: 'WebView LocalAuthentication AUTH_UNAVAILABLE HTTP 500' };
  const sessionB = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [walletB], activeWalletId: walletB.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() { return nativeRes; }
        }
      }
    }
  });
  try {
    await sessionB.waitFor(() => !sessionB.document.documentElement.classList.contains('nexus-locked'), 3000);
    assert.ok(
      sessionB.getToastHistory().some((x) => /锁屏|screen lock|biometrics/i.test(x.text)),
      'AUTH_UNAVAILABLE must show friendly device lock recommendation toast'
    );
    for (const toast of sessionB.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'AUTH_UNAVAILABLE toast');
    }

    // Also test testBiometricAuthNow() raw native error sanitization [POST-FIX]
    nativeRes = { verified: false, error: 'HTTP 500 WebView LocalAuthentication failed' };
    assert.equal(typeof sessionB.window.testBiometricAuthNow, 'function', 'testBiometricAuthNow must be exposed');
    await sessionB.window.testBiometricAuthNow();
    await sessionB.flushMicrotasks(8);
    for (const toast of sessionB.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'testBiometricAuthNow toast');
    }
    sessionB.assertNoRuntimeErrors();
    sessionB.assertNoRealBroadcasts();
  } finally {
    sessionB.cleanup();
  }
});

test('F9 Tier 2.5: biometricEnabled: false clears cold-boot lock', async () => {
  const walletNoBio = createSeededWallet({ webauthnCredentialId: 'cred_disabled', biometricEnabled: false });
  const sessionA = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [walletNoBio], activeWalletId: walletNoBio.id })
    }
  });
  try {
    await sessionA.flushMicrotasks(12);
    assert.equal(sessionA.document.documentElement.classList.contains('nexus-locked'), false, 'biometricEnabled: false must clear cold-boot lock');
    assert.equal(sessionA.document.getElementById('app-lock-overlay').getAttribute('aria-hidden'), 'true');
    sessionA.assertNoRuntimeErrors();
    sessionA.assertNoRealBroadcasts();
  } finally {
    sessionA.cleanup();
  }
});

test('F9 Tier 2.6: [POST-FIX] Cancelling biometric backup auth leaves #sheet-backup closed', async () => {
  const wallet = createSeededWallet();
  let allowUnlock = true;
  const session = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() {
            return allowUnlock ? { verified: true, type: 'face' } : { verified: false, code: 'AUTH_CANCELLED', cancelled: true };
          }
        }
      }
    },
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);

    allowUnlock = false;
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openBackupKeysSheet"]');
    await session.flushMicrotasks(8);
    assert.equal(session.hasClass('#sheet-backup', 'open'), false, 'Cancelled auth must NOT open #sheet-backup');
    assert.equal(session.document.getElementById('backup-keys-content').innerHTML, '');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

// =====================================================================
// FEATURE 10 — HUB TOOLS: NEAR KEYS/STORAGE, SOL RENT, CONTACTS, MULTI-WALLET (TIER 1: 6 TESTS)
// =====================================================================

test('F10 Tier 1.1: [POST-FIX] #sheet-near-account summary, .near availability, view_access_key_list, refresh loading state & zero jargon', async () => {
  const wallet = createSeededWallet();
  let delayNextKeyList = false;
  let releaseKeyList = null;

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (init.body && typeof init.body === 'string') {
        const rpc = JSON.parse(init.body);
        const rt = rpc && rpc.params && rpc.params.request_type;
        if (rt === 'view_access_key_list') {
          if (delayNextKeyList) {
            await new Promise((resolve) => { releaseKeyList = resolve; });
          }
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: rpc.id,
            result: {
              keys: [
                { public_key: wallet.nearPublicKey, access_key: { nonce: 1, permission: 'FullAccess' } },
                { public_key: 'ed25519:999988887777666655554444333322221111aaaaBBBBccccDDDD', access_key: { nonce: 2, permission: { FunctionCall: { receiver_id: 'app.near', method_names: [] } } } }
              ]
            }
          });
        }
        if (rt === 'view_account') {
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: rpc.id,
            error: {
              name: 'HANDLER_ERROR',
              cause: { name: 'UNKNOWN_ACCOUNT', info: { requested_account_id: rpc.params.account_id } }
            }
          });
        }
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' });
    }
  });
  try {
    await session.switchTab('hub');
    assertZeroDevJargon(session.getVisibleText('#hub-near-status-badge'), '#hub-near-status-badge');

    await session.click('#view-hub button[onclick*="openNearAccountSheet"]');
    await session.waitFor(() => session.document.querySelectorAll('#near-keys-list .ios-glass-card').length === 2, 3000);

    assert.equal(session.hasClass('#near-keys-rotate-card', 'hidden'), false, 'Active NEAR account must show #near-keys-rotate-card');
    assert.ok(session.getVisibleText('#near-acct-balance-val').includes('12.5'));
    assert.ok(session.getVisibleText('#near-keys-list').includes('当前使用') || session.getVisibleText('#near-keys-list').includes('In Use'));

    const deleteBtns = session.document.querySelectorAll('#near-keys-list [data-action="delete-near-key"]');
    assert.equal(deleteBtns.length, 1, 'Delete button must only render on non-active dApp key, NEVER on In Use key');
    assert.equal(deleteBtns[0].getAttribute('data-pk'), 'ed25519:999988887777666655554444333322221111aaaaBBBBccccDDDD');

    // Domain availability check
    await session.setInputValue('#hub-near-domain-input', 'alice-e2e.near');
    await session.click('#sheet-near-account button[onclick*="checkNearDomainAvailabilityUI"]');
    await session.waitFor(() => session.getVisibleText('#near-domain-avail-status').includes('alice-e2e.near'), 3000);
    assert.ok(/可注册|available/.test(session.getVisibleText('#near-domain-avail-status')));

    // Refresh loading/disabled state [POST-FIX]
    delayNextKeyList = true;
    const refreshBtn = session.document.querySelector('#sheet-near-account button[onclick*="refreshNearAccessKeysSheet"]');
    assert.ok(refreshBtn, 'Refresh button must exist in #sheet-near-account');
    refreshBtn.click();
    await session.flushMicrotasks(4);
    assert.equal(refreshBtn.disabled, true, 'Refresh button in #sheet-near-account must disable while loading');
    delayNextKeyList = false;
    if (releaseKeyList) releaseKeyList();
    await session.waitFor(() => refreshBtn.disabled === false, 3000);

    // Strip raw on-chain ed25519:<key> public key identifiers (standard NEAR pubkey format in #near-keys-list),
    // while keeping assertZeroDevJargon strict on all UI labels, status badges, and standalone Ed25519 prose.
    const nearSheetVisibleText = session.getVisibleText('#sheet-near-account')
      .replace(/\bed25519:[A-Za-z0-9]{6,}(?:\.\.\.[A-Za-z0-9]{4,})?\b/g, '<near-pub-key>');
    assertZeroDevJargon(nearSheetVisibleText, '#sheet-near-account');
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F10 Tier 1.2: [POST-FIX] #sheet-near-storage scan, pre-checked empty vs disabled in-use, toggle, refresh loading & zero NEP-141 jargon', async () => {
  const wallet = createSeededWallet();
  let delayNextScan = false;
  let releaseScan = null;

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/api\.fastnear\.com\/v1\/account\/.*\/ft/i.test(url)) {
        if (delayNextScan) {
          await new Promise((resolve) => { releaseScan = resolve; });
        }
        return mockJsonResponse({
          tokens: [
            { contract_id: 'wrap.near', balance: '0' },
            { contract_id: 'usdt.tether-token.near', balance: '5000000' }
          ]
        });
      }
      if (init.body && typeof init.body === 'string') {
        const rpc = JSON.parse(init.body);
        const rt = rpc && rpc.params && rpc.params.request_type;
        if (rt === 'call_function') {
          const contractId = rpc.params.account_id;
          const method = rpc.params.method_name;
          let payload = null;
          if (contractId === 'wrap.near' || contractId === 'usdt.tether-token.near') {
            if (method === 'storage_balance_of') {
              payload = { total: '1250000000000000000000', available: '0' };
            } else if (method === 'ft_balance_of') {
              payload = contractId === 'wrap.near' ? '0' : '5000000';
            } else if (method === 'ft_metadata') {
              payload = { symbol: contractId === 'wrap.near' ? 'wNEAR' : 'USDt', decimals: contractId === 'wrap.near' ? 24 : 6 };
            }
          }
          const bytes = Array.from(Buffer.from(JSON.stringify(payload), 'utf8'));
          return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: bytes } });
        }
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' });
    }
  });
  try {
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openNearStorageReclaimSheet"]');
    await session.waitFor(() => session.document.querySelectorAll('#near-storage-list input[data-action="toggle-near-storage"]').length === 2, 3000);

    const emptyCb = session.document.querySelector('input[data-action="toggle-near-storage"][data-contract="wrap.near"]');
    const inUseCb = session.document.querySelector('input[data-action="toggle-near-storage"][data-contract="usdt.tether-token.near"]');
    assert.equal(emptyCb.checked, true, 'Empty contract must be pre-checked');
    assert.equal(emptyCb.disabled, false);
    assert.equal(inUseCb.checked, false, 'In-use contract must be unchecked');
    assert.equal(inUseCb.disabled, true, 'In-use contract checkbox must be disabled');

    assert.equal(session.isDisabled('#btn-execute-near-storage'), false);
    assert.ok(session.getVisibleText('#btn-execute-near-storage').includes('0.00125'));

    // Toggle empty contract off -> execute button disabled
    await session.setChecked('input[data-action="toggle-near-storage"][data-contract="wrap.near"]', false);
    assert.equal(session.isDisabled('#btn-execute-near-storage'), true);

    // Toggle back on -> execute button re-enabled
    await session.setChecked('input[data-action="toggle-near-storage"][data-contract="wrap.near"]', true);
    assert.equal(session.isDisabled('#btn-execute-near-storage'), false);

    // Refresh loading state [POST-FIX]
    delayNextScan = true;
    const refreshBtn = session.document.querySelector('#sheet-near-storage button[onclick*="scanNearStorageReclaimUI"]');
    refreshBtn.click();
    await session.flushMicrotasks(4);
    assert.equal(refreshBtn.disabled, true, 'Refresh button in #sheet-near-storage must disable while scanning');
    if (releaseScan) releaseScan();
    await session.waitFor(() => refreshBtn.disabled === false, 3000);

    assertZeroDevJargon(session.getVisibleText('#sheet-near-storage'), '#sheet-near-storage');
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F10 Tier 1.3: [POST-FIX] #sheet-sol-rent scan SPL & Token-2022 accounts, empty pre-checked, dust unchecked, frozen excluded & refresh loading', async () => {
  const wallet = createSeededWallet();
  let delayNextScan = false;
  const pendingScans = [];

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (init.body && typeof init.body === 'string') {
        const rpc = JSON.parse(init.body);
        if (rpc.method === 'getTokenAccountsByOwner') {
          if (delayNextScan) {
            await new Promise((resolve) => { pendingScans.push(resolve); });
          }
          const programId = rpc.params && rpc.params[1] && rpc.params[1].programId;
          if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            return mockJsonResponse({
              jsonrpc: '2.0',
              id: rpc.id,
              result: {
                value: [
                  {
                    pubkey: 'EmptyAta1111111111111111111111111111111111',
                    account: {
                      lamports: 2039280,
                      data: { parsed: { info: { mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', state: 'initialized', tokenAmount: { amount: '0', decimals: 6, uiAmount: 0 } } } }
                    }
                  },
                  {
                    pubkey: 'FrozenAta111111111111111111111111111111111',
                    account: {
                      lamports: 2039280,
                      data: { parsed: { info: { mint: 'MintFrozen111111111111111111111111111111111', state: 'frozen', tokenAmount: { amount: '0', decimals: 6, uiAmount: 0 } } } }
                    }
                  }
                ]
              }
            });
          }
          // Token-2022 dust account
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: rpc.id,
            result: {
              value: [
                {
                  pubkey: 'DustAta20221111111111111111111111111111111',
                  account: {
                    lamports: 2074080,
                    data: { parsed: { info: { mint: 'MintDust2022111111111111111111111111111111', state: 'initialized', tokenAmount: { amount: '1', decimals: 6, uiAmount: 0.000001 } } } }
                  }
                }
              ]
            }
          });
        }
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' });
    }
  });
  try {
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openSolRentReclaimSheet"]');
    await session.waitFor(() => session.document.querySelectorAll('#sol-rent-list input[data-action="toggle-sol-rent"]').length === 2, 3000);

    const emptyCb = session.document.querySelector('input[data-action="toggle-sol-rent"][data-ata="EmptyAta1111111111111111111111111111111111"]');
    const dustCb = session.document.querySelector('input[data-action="toggle-sol-rent"][data-ata="DustAta20221111111111111111111111111111111"]');
    const frozenCb = session.document.querySelector('input[data-action="toggle-sol-rent"][data-ata="FrozenAta111111111111111111111111111111111"]');
    assert.ok(emptyCb && emptyCb.checked === true, 'Empty ATA must be pre-checked');
    assert.ok(dustCb && dustCb.checked === false, 'Dust ATA must be unchecked by default');
    assert.equal(frozenCb, null, 'Frozen ATA must be excluded');
    assert.ok(/0\.0020 SOL/.test(session.getVisibleText('#btn-execute-sol-rent')));

    await session.setChecked('input[data-action="toggle-sol-rent"][data-ata="EmptyAta1111111111111111111111111111111111"]', false);
    assert.equal(session.isDisabled('#btn-execute-sol-rent'), true);
    await session.setChecked('input[data-action="toggle-sol-rent"][data-ata="DustAta20221111111111111111111111111111111"]', true);
    assert.equal(session.isDisabled('#btn-execute-sol-rent'), false);
    assert.ok(/0\.0021 SOL/.test(session.getVisibleText('#btn-execute-sol-rent')));

    // Refresh loading state [POST-FIX]
    delayNextScan = true;
    const refreshBtn = session.document.querySelector('#sheet-sol-rent button[onclick*="scanSolRentReclaimUI"]');
    refreshBtn.click();
    await session.flushMicrotasks(4);
    assert.equal(refreshBtn.disabled, true, 'Refresh button in #sheet-sol-rent must disable while scanning');
    delayNextScan = false;
    while (pendingScans.length > 0) {
      pendingScans.shift()();
    }
    await session.waitFor(() => refreshBtn.disabled === false, 3000);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F10 Tier 1.4: #sheet-contacts add multi-chain contacts, persist, clear inputs, pick into Send & 2-tap delete', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openContactsSheet"]');
    assert.equal(session.hasClass('#sheet-contacts', 'open'), true);

    await session.setInputValue('#contact-name-input', 'Alice NEAR');
    await session.setInputValue('#contact-addr-input', 'alice.near');
    await session.click('#sheet-contacts button[onclick*="addContactFromSheet"]');

    assert.equal(session.document.getElementById('contact-name-input').value, '', 'Name input must clear after save');
    assert.equal(session.document.getElementById('contact-addr-input').value, '', 'Address input must clear after save');

    await session.setInputValue('#contact-name-input', 'Bob EVM');
    await session.setInputValue('#contact-addr-input', VALID_EVM_ADDR);
    await session.click('#sheet-contacts button[onclick*="addContactFromSheet"]');

    const contacts = JSON.parse(session.localStorage.getItem('near_ca_contacts_v1'));
    assert.equal(contacts.length, 2);
    assert.ok(session.getVisibleText('#contacts-list').includes('Alice NEAR'));
    assert.ok(session.getVisibleText('#contacts-list').includes('Bob EVM'));
    await session.closeSheet('sheet-contacts');

    // Pick contact into Send sheet
    await session.switchTab('wallet');
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    await session.click('#sheet-send button[onclick*="openContactsPicker(\'send\')"]');
    assert.equal(session.hasClass('#sheet-contacts', 'open'), true);
    await session.click('#contacts-list [data-action="pick-contact"][data-addr="alice.near"]');
    assert.equal(session.hasClass('#sheet-send', 'open'), true);
    assert.equal(session.document.getElementById('send-recipient-input').value, 'alice.near');
    await session.closeSheet('sheet-send');

    // Re-open contacts & test 2-tap delete
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openContactsSheet"]');
    const firstDelBtn = '#contacts-list [data-action="delete-contact"]';
    await session.click(firstDelBtn);
    assert.equal(JSON.parse(session.localStorage.getItem('near_ca_contacts_v1')).length, 2, '1st delete tap must only prompt');
    await session.click(firstDelBtn);
    assert.equal(JSON.parse(session.localStorage.getItem('near_ca_contacts_v1')).length, 1, '2nd delete tap within 8s must delete contact');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F10 Tier 1.5: #sheet-wallets multi-wallet create/switch & #sheet-wallet-addresses 5-chain copy', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    // 1. Multi-chain addresses copy
    const activeW = session.window.NearCAState.getActiveWallet();
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openWalletAddressesSheet"]');
    assert.equal(session.hasClass('#sheet-wallet-addresses', 'open'), true);
    const addrRows = session.document.querySelectorAll('#hub-addresses-list .hub-addr-row');
    assert.equal(addrRows.length, 5, 'Must render 5 chain addresses (NEAR, EVM, SOL, BTC, PRL)');
    const prlCopyBtn = session.document.querySelector(`#hub-addresses-list [data-action="copy-text"][data-val="${activeW.address}"]`);
    assert.ok(prlCopyBtn, 'PRL copy button must match active wallet address');
    prlCopyBtn.click();
    await session.flushMicrotasks(6);
    assert.equal(session.clipboardLog.at(-1), activeW.address);
    await session.closeSheet('sheet-wallet-addresses');

    // 2. Multi-wallet create & switch
    await session.click('#view-hub button[onclick*="openWalletSwitcherSheet"]');
    assert.equal(session.hasClass('#sheet-wallets', 'open'), true);
    await session.click('#sheet-wallets button[onclick*="startAdditionalWalletCreate"]');
    await session.waitFor(() => session.isVisible('#view-onboarding'), 2000);
    await session.setInputValue('#onboard-create-name', 'E2E Secondary');
    await session.click('#btn-confirm-create-wallet');
    await session.waitFor(() => session.isVisible('#view-wallet'), 5000);

    const storeAfterCreate = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1'));
    assert.equal(storeAfterCreate.wallets.length, 2);
    assert.notEqual(storeAfterCreate.activeWalletId, 'e2e_wallet_1');

    // Switch back to e2e_wallet_1
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openWalletSwitcherSheet"]');
    await session.click('[data-action="switch-wallet"][data-wallet-id="e2e_wallet_1"]');
    await session.flushMicrotasks(10);

    const storeAfterSwitch = JSON.parse(session.localStorage.getItem('near_ca_wallets_v1'));
    assert.equal(storeAfterSwitch.activeWalletId, 'e2e_wallet_1');
    assert.ok(session.getToastHistory().some((x) => /已切换账户|Switched to/.test(x.text)));

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F10 Tier 1.6: [POST-FIX] PRL custom seed bind/restore confirms BEFORE auth (single auth) & zero zombie hub-mpc-*', async () => {
  const { html, i18nDict } = loadDistAssets();
  assert.equal(/hub-mpc-/i.test(html), false, 'HTML must contain zero zombie hub-mpc-* elements');
  for (const lang of ['zh', 'en']) {
    const mpcKeys = Object.keys(i18nDict[lang] || {}).filter((k) => k.startsWith('hub.mpc'));
    assert.deepEqual(mpcKeys, [], `i18nDict.${lang} must remove zombie hub.mpc* keys`);
  }

  let authCalls = 0;
  const wallet = createSeededWallet({ nativeBalances: { ...createSeededWallet().nativeBalances, prl: 5.0 } });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() {
            authCalls += 1;
            return { verified: true };
          }
        }
      }
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    authCalls = 0;

    // Verify zombie MPC handlers are removed from window / NearCAUI
    assert.equal(typeof session.window.recomputeHubMpcAddress, 'undefined', 'Zombie recomputeHubMpcAddress must be removed');
    assert.equal(typeof session.window.copyHubMpcAddress, 'undefined', 'Zombie copyHubMpcAddress must be removed');
    assert.equal(typeof session.window.executeHubMpcSign, 'undefined', 'Zombie executeHubMpcSign must be removed');

    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openWalletAddressesSheet"]');
    await session.setInputValue('#prl-bind-mnemonic-input', TEST_MNEMONIC_2);

    // 1st click: must prompt 8s confirm toast WITHOUT calling verifySecurityAuthAsync
    const toastsBeforeBind = session.getToastHistory().length;
    await session.click('#sheet-wallet-addresses button[onclick*="bindOrReplacePrlMnemonicUI"]');
    await session.waitFor(() => session.getToastHistory().length > toastsBeforeBind || authCalls > 0, 3000);
    assert.equal(authCalls, 0, '[POST-FIX] 1st click on bindOrReplacePrlMnemonicUI must confirm BEFORE verifySecurityAuthAsync');

    // 2nd click within 8s: calls verifySecurityAuthAsync ONCE & binds new PRL address
    await session.click('#sheet-wallet-addresses button[onclick*="bindOrReplacePrlMnemonicUI"]');
    await session.waitFor(() => session.document.getElementById('prl-bind-mnemonic-input').value === '', 3000);
    assert.equal(authCalls, 1, '2nd click must trigger exactly 1 security auth');
    assert.equal(session.hasClass('#btn-prl-restore-default', 'hidden'), false);

    // Restore default PRL (seed balance=3.0 so confirm triggers)
    session.window.NearCAState.getActiveWallet().nativeBalances.prl = 3.0;
    const toastsBeforeRestore = session.getToastHistory().length;
    await session.click('#btn-prl-restore-default');
    await session.waitFor(() => session.getToastHistory().length > toastsBeforeRestore || authCalls > 1, 3000);
    assert.equal(authCalls, 1, '[POST-FIX] 1st click on restoreDefaultPrlAccountUI must confirm BEFORE verifySecurityAuthAsync');
    await session.click('#btn-prl-restore-default');
    await session.waitFor(() => session.hasClass('#btn-prl-restore-default', 'hidden'), 3000);
    assert.equal(authCalls, 2, '2nd click on restoreDefaultPrlAccountUI must trigger single auth');

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

// =====================================================================
// FEATURE 10 — HUB TOOLS (TIER 2: 6 TESTS)
// =====================================================================

test('F10 Tier 2.1: [POST-FIX] confirmRotateNearAccountKey confirm-before-auth ordering, key deletion safety blocks & unactivated NEAR account UI', async () => {
  let authCalls = 0;
  let nearExists = false;
  const wallet = createSeededWallet({ nativeBalances: { ...createSeededWallet().nativeBalances, prl: 2.0, near: 5.0 } });

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() {
            authCalls += 1;
            return { verified: true };
          }
        }
      }
    },
    fetchMock: async (url, init = {}) => {
      if (init.body && typeof init.body === 'string') {
        const rpc = JSON.parse(init.body);
        const rt = rpc && rpc.params && rpc.params.request_type;
        if (rt === 'view_access_key_list') {
          if (!nearExists) {
            return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, error: { name: 'HANDLER_ERROR', cause: { name: 'UNKNOWN_ACCOUNT' } } });
          }
          return mockJsonResponse({
            jsonrpc: '2.0',
            id: rpc.id,
            result: { keys: [{ public_key: wallet.nearPublicKey, access_key: { nonce: 1, permission: 'FullAccess' } }] }
          });
        }
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' });
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    authCalls = 0;

    // 1. Unactivated account hides #near-keys-rotate-card & shows guide without Implicit jargon [POST-FIX]
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openNearAccountSheet"]');
    await session.waitFor(() => session.getVisibleText('#near-keys-list').length > 0, 3000);
    assert.equal(session.hasClass('#near-keys-rotate-card', 'hidden'), true, 'Unactivated NEAR account must hide #near-keys-rotate-card');
    assert.equal(session.hasClass('#near-acct-unactivated-guide', 'hidden'), false);
    assertZeroDevJargon(session.getVisibleText('#sheet-near-account'), 'Unactivated #sheet-near-account');

    // 2. Activated account with sole FullAccess key: no delete button & direct delete throws safety block
    nearExists = true;
    await session.click('#sheet-near-account button[onclick*="refreshNearAccessKeysSheet"]');
    await session.waitFor(() => !session.hasClass('#near-keys-rotate-card', 'hidden'), 3000);
    assert.equal(session.document.querySelectorAll('#near-keys-list [data-action="delete-near-key"]').length, 0);
    await assert.rejects(
      () => session.window.NearCAContracts.deleteNearAccessKeyAsync({ wallet, targetPublicKeyStr: wallet.nearPublicKey }),
      /(?:不能删除当前钱包正在使用的私钥|Cannot delete the key currently in use|Cannot delete currently active key|last FullAccess key)/i
    );

    // 3. Rotate key with old assets: 1st click must confirm BEFORE auth [POST-FIX]
    await session.setInputValue('#near-keys-rotate-mnemonic', TEST_MNEMONIC_2);
    const toastsBeforeRotate1 = session.getToastHistory().length;
    await session.click('#btn-near-keys-rotate-confirm');
    await session.waitFor(() => session.getToastHistory().length > toastsBeforeRotate1 || authCalls > 0, 3000);
    assert.equal(authCalls, 0, '[POST-FIX] 1st click on confirmRotateNearAccountKey must show confirm toast BEFORE verifySecurityAuthAsync');

    // 2nd click triggers single auth and hits broadcast guard (no real broadcast)
    const toastsBeforeRotate2 = session.getToastHistory().length;
    await session.click('#btn-near-keys-rotate-confirm');
    await session.waitFor(() => authCalls === 1, 3000);
    await session.waitFor(
      () => session.getToastHistory().length > toastsBeforeRotate2 && !session.isDisabled('#btn-near-keys-rotate-confirm'),
      3000
    );
    await session.flushMicrotasks(10);
    assert.equal(authCalls, 1, '2nd click must prompt auth exactly once');
    const rotateToasts = session.getToastHistory().slice(toastsBeforeRotate2);
    assert.equal(
      rotateToasts.some((x) => /AddKey|DeleteKey/i.test(x.text)),
      false,
      '[POST-FIX] Rotate progress toast must NOT expose AddKey / DeleteKey jargon'
    );
    for (const toast of session.getToastHistory().filter((x) => !/E2E_BROADCAST_BLOCKED/i.test(x.text))) {
      assertZeroDevJargon(toast.text, 'NEAR rotate toast');
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F10 Tier 2.2: [POST-FIX] Invalid inputs rejected before RPC/auth: invalid .near domain, invalid mnemonic, empty/duplicate & bad-checksum EVM/PRL contact', async () => {
  const wallet = createSeededWallet();
  let viewAccountCalls = 0;
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id }),
      near_ca_contacts_v1: JSON.stringify([{ id: 'c1', name: 'Existing', address: VALID_EVM_ADDR, network: 'evm' }])
    },
    fetchMock: async (url, init = {}) => {
      if (init.body && typeof init.body === 'string') {
        try {
          const rpc = JSON.parse(init.body);
          if (rpc.params?.request_type === 'view_account') {
            viewAccountCalls += 1;
          }
        } catch (_) {}
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: 1, result: { keys: [] } });
    }
  });
  try {
    // 1. Invalid .near domains rejected before RPC
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openNearAccountSheet"]');
    await session.flushMicrotasks(8);
    viewAccountCalls = 0;

    await session.setInputValue('#hub-near-domain-input', 'a');
    await session.click('#sheet-near-account button[onclick*="checkNearDomainAvailabilityUI"]');
    assert.equal(viewAccountCalls, 0, 'Invalid 1-char .near domain must be rejected locally before view_account RPC');

    // Invalid mnemonic on rotate & PRL bind rejected before auth/RPC
    await session.setInputValue('#near-keys-rotate-mnemonic', 'abandon abandon abandon');
    await session.click('#btn-near-keys-rotate-confirm');
    await session.closeSheet('sheet-near-account');

    await session.click('#view-hub button[onclick*="openWalletAddressesSheet"]');
    await session.setInputValue('#prl-bind-mnemonic-input', 'not a valid twelve word mnemonic phrase at all');
    await session.click('#sheet-wallet-addresses button[onclick*="bindOrReplacePrlMnemonicUI"]');
    await session.closeSheet('sheet-wallet-addresses');

    // 2. Contacts invalid inputs + [POST-FIX] bad-checksum EVM & PRL rejection
    await session.click('#view-hub button[onclick*="openContactsSheet"]');
    // Empty name
    await session.setInputValue('#contact-name-input', '');
    await session.setInputValue('#contact-addr-input', 'bob.near');
    await session.click('#sheet-contacts button[onclick*="addContactFromSheet"]');
    assert.equal(JSON.parse(session.localStorage.getItem('near_ca_contacts_v1')).length, 1);

    // Case-insensitive duplicate EVM address
    await session.setInputValue('#contact-name-input', 'Dup');
    await session.setInputValue('#contact-addr-input', VALID_EVM_ADDR.toLowerCase());
    await session.click('#sheet-contacts button[onclick*="addContactFromSheet"]');
    assert.equal(JSON.parse(session.localStorage.getItem('near_ca_contacts_v1')).length, 1);

    // [POST-FIX] Mixed-case bad-checksum EVM address (catches !crypto.validateChainAddress() object truthiness bug)
    await session.setInputValue('#contact-name-input', 'BadChecksumEVM');
    await session.setInputValue('#contact-addr-input', BAD_CHECKSUM_EVM_ADDR);
    await session.click('#sheet-contacts button[onclick*="addContactFromSheet"]');
    assert.equal(
      JSON.parse(session.localStorage.getItem('near_ca_contacts_v1')).length,
      1,
      '[POST-FIX] Bad-checksum mixed-case EVM address must be rejected in addContactFromSheet'
    );

    // [POST-FIX] Bad-checksum PRL address
    await session.setInputValue('#contact-name-input', 'BadChecksumPRL');
    await session.setInputValue('#contact-addr-input', BAD_CHECKSUM_PRL_ADDR);
    await session.click('#sheet-contacts button[onclick*="addContactFromSheet"]');
    assert.equal(
      JSON.parse(session.localStorage.getItem('near_ca_contacts_v1')).length,
      1,
      '[POST-FIX] Bad-checksum prl1... address must be rejected in addContactFromSheet'
    );

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F10 Tier 2.3: Pre-execution balance & safety guards on SOL Rent & NEAR Storage block before any broadcast', async () => {
  // Part A: Missing solAddress blocks opening #sheet-sol-rent (no mnemonic/nearAddress so MPC self-heal does not populate solAddress)
  const noSolWallet = {
    id: 'no_sol_wallet',
    name: 'No SOL',
    accountType: 'standard',
    mnemonic: '',
    nearAddress: '',
    nearNamedAccount: '',
    evmAddress: VALID_EVM_ADDR,
    solAddress: '',
    address: VALID_PRL_ADDR,
    btcAddress: ''
  };
  const sessionA = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [noSolWallet], activeWalletId: noSolWallet.id })
    }
  });
  try {
    await sessionA.switchTab('hub');
    await sessionA.click('#view-hub button[onclick*="openSolRentReclaimSheet"]');
    assert.equal(sessionA.hasClass('#sheet-sol-rent', 'open'), false, 'Missing solAddress must block opening #sheet-sol-rent');
    assert.ok(sessionA.getToastHistory().some((x) => /Solana/.test(x.text)));
    sessionA.assertNoRuntimeErrors();
    sessionA.assertNoRealBroadcasts();
  } finally {
    sessionA.cleanup();
  }

  // Part B: Low SOL / Low NEAR blocks execution pre-broadcast, and dust ATA displays BURN warning in auth reason
  const lowGasWallet = createSeededWallet({
    nativeBalances: { ...createSeededWallet().nativeBalances, sol: 0.000001, near: 0.0002 }
  });
  const authReasons = [];
  const bioCap = makeBioCapacitorMock();
  const origAuth = bioCap.Plugins.NativeSecurity.authenticateWithBiometrics;
  bioCap.Plugins.NativeSecurity.authenticateWithBiometrics = async (opts) => {
    if (opts && opts.reason) authReasons.push(opts.reason);
    return origAuth(opts);
  };
  const sessionB = await createWalletAppSession({
    viewportWidth: 375,
    capacitor: bioCap,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [lowGasWallet], activeWalletId: lowGasWallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/api\.fastnear\.com\/v1\/account\/.*\/ft/i.test(url)) {
        return mockJsonResponse({ tokens: [{ contract_id: 'wrap.near', balance: '0' }] });
      }
      if (init.body && typeof init.body === 'string') {
        const rpc = JSON.parse(init.body);
        if (rpc.method === 'getTokenAccountsByOwner') {
          const programId = rpc.params?.[1]?.programId;
          if (programId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            return mockJsonResponse({
              jsonrpc: '2.0',
              id: rpc.id,
              result: {
                value: [
                  {
                    pubkey: 'DustAtaOnly111111111111111111111111111111',
                    account: { lamports: 2039280, data: { parsed: { info: { mint: 'DustMint111', state: 'initialized', tokenAmount: { amount: '5', decimals: 6, uiAmount: 0.000005 } } } } }
                  }
                ]
              }
            });
          }
          return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { value: [] } });
        }
        if (rpc.params?.request_type === 'call_function') {
          const payload = rpc.params.method_name === 'storage_balance_of'
            ? { total: '1250000000000000000000', available: '0' }
            : (rpc.params.method_name === 'ft_balance_of' ? '0' : { symbol: 'wNEAR', decimals: 24 });
          return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: Array.from(Buffer.from(JSON.stringify(payload), 'utf8')) } });
        }
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' });
    }
  });
  try {
    await sessionB.waitFor(() => !sessionB.document.documentElement.classList.contains('nexus-locked'), 3000);

    // SOL Rent dust burn warning + insufficient SOL pre-check
    await sessionB.switchTab('hub');
    await sessionB.click('#view-hub button[onclick*="openSolRentReclaimSheet"]');
    await sessionB.waitFor(() => sessionB.document.querySelector('input[data-action="toggle-sol-rent"]'), 3000);
    await sessionB.setChecked('input[data-action="toggle-sol-rent"]', true);
    const solToastsBefore = sessionB.getToastHistory().length;
    await sessionB.click('#btn-execute-sol-rent');
    await sessionB.waitFor(
      () => sessionB.getToastHistory().slice(solToastsBefore).some((x) => /SOL 余额不足|Insufficient SOL/i.test(x.text)),
      3000
    );
    assert.ok(authReasons.some((r) => /BURN|销毁/.test(r)), 'Dust burn must warn user in auth prompt');
    await sessionB.flushMicrotasks(12);
    assert.equal(sessionB.getNetworkLog().filter((x) => x.blocked).length, 0, 'Insufficient SOL must block BEFORE sendTransaction broadcast');
    await sessionB.closeSheet('sheet-sol-rent');

    // NEAR Storage insufficient NEAR pre-check
    await sessionB.click('#view-hub button[onclick*="openNearStorageReclaimSheet"]');
    await sessionB.waitFor(() => sessionB.document.querySelector('input[data-action="toggle-near-storage"]'), 3000);
    const nearToastsBefore = sessionB.getToastHistory().length;
    await sessionB.click('#btn-execute-near-storage');
    await sessionB.waitFor(
      () => sessionB.getToastHistory().slice(nearToastsBefore).some((x) => /NEAR 余额不足|Insufficient NEAR/i.test(x.text)),
      3000
    );
    await sessionB.flushMicrotasks(12);
    assert.equal(sessionB.getNetworkLog().filter((x) => x.blocked).length, 0, 'Insufficient NEAR must block BEFORE broadcast_tx_commit');

    sessionB.assertNoRuntimeErrors();
    sessionB.assertNoRealBroadcasts();
  } finally {
    sessionB.cleanup();
  }
});

test('F10 Tier 2.4: [POST-FIX] Hub RPC failures (HTTP 403/500/-32000/timeout) sanitized via toUserFriendlyError with zero dev jargon', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/api\.fastnear\.com/i.test(url)) {
        return mockJsonResponse({ error: 'HTTP 403 Forbidden via CORS' }, 403);
      }
      if (init.body && typeof init.body === 'string') {
        const rpc = JSON.parse(init.body);
        if (rpc.method === 'getTokenAccountsByOwner') {
          return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Solana RPC HTTP 500 internal error' } }, 500);
        }
        return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'NEAR RPC ETIMEDOUT' } }, 500);
      }
      throw new TypeError('FetchError ETIMEDOUT');
    }
  });
  try {
    await session.switchTab('hub');

    await session.click('#view-hub button[onclick*="openNearAccountSheet"]');
    await session.waitFor(() => !/正在查询链上密钥|Loading on-chain keys/.test(session.getVisibleText('#near-keys-list')), 3000);
    assertZeroDevJargon(session.getVisibleText('#sheet-near-account'), 'NEAR account RPC error');
    await session.setInputValue('#hub-near-domain-input', 'alice-fail.near');
    await session.click('#sheet-near-account button[onclick*="checkNearDomainAvailabilityUI"]');
    await session.waitFor(() => !/正在检测域名|Checking availability/.test(session.getVisibleText('#near-domain-avail-status')), 3000);
    assertZeroDevJargon(session.getVisibleText('#near-domain-avail-status'), 'Domain check RPC error');
    await session.closeSheet('sheet-near-account');

    await session.click('#view-hub button[onclick*="openNearStorageReclaimSheet"]');
    await session.waitFor(() => !/扫描中|Scanning/.test(session.getVisibleText('#near-storage-summary')), 3000);
    assertZeroDevJargon(session.getVisibleText('#sheet-near-storage'), 'NEAR storage RPC error');
    await session.closeSheet('sheet-near-storage');

    await session.click('#view-hub button[onclick*="openSolRentReclaimSheet"]');
    await session.waitFor(() => !/扫描中|Scanning/.test(session.getVisibleText('#sol-rent-summary')), 3000);
    assertZeroDevJargon(session.getVisibleText('#sheet-sol-rent'), 'SOL rent RPC error');
    await session.closeSheet('sheet-sol-rent');

    for (const toast of session.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'Hub RPC error toast');
    }
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F10 Tier 2.5: Multi-wallet delete boundaries (1-wallet block, 1st tap prompt) & Hub form resets on closeAllSheets', async () => {
  const w1 = createSeededWallet({ id: 'w1', name: 'Wallet One' });
  const w2 = createSeededWallet({
    id: 'w2',
    name: 'Wallet Two',
    mnemonic: TEST_MNEMONIC_2,
    nearAddress: '22223333444455556666777788889999aaaabbbbccccddddeeeeffff1111'
  });

  // Part A: Single wallet cannot be deleted
  const singleSession = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [w1], activeWalletId: 'w1' })
    }
  });
  try {
    await singleSession.window.deleteWalletById('w1');
    assert.equal(JSON.parse(singleSession.localStorage.getItem('near_ca_wallets_v1')).wallets.length, 1);
    assert.ok(singleSession.getToastHistory().some((x) => /至少保留一个钱包|Keep at least one wallet/.test(x.text)));
    singleSession.assertNoRuntimeErrors();
    singleSession.assertNoRealBroadcasts();
  } finally {
    singleSession.cleanup();
  }

  // Part B: 2 wallets -> 1st delete tap only prompts, 2nd delete tap within 8s + auth deletes wallet; Hub inputs reset on closeAllSheets
  let multiAuthCalls = 0;
  const multiSession = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [w1, w2], activeWalletId: 'w1' })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() {
            multiAuthCalls += 1;
            return { verified: true };
          }
        }
      }
    }
  });
  try {
    await multiSession.waitFor(() => !multiSession.document.documentElement.classList.contains('nexus-locked'), 3000);
    multiAuthCalls = 0;
    await multiSession.switchTab('hub');
    await multiSession.click('#view-hub button[onclick*="openWalletSwitcherSheet"]');
    await multiSession.click('#wallets-switcher-list [data-action="delete-wallet"][data-wallet-id="w2"]');
    assert.equal(JSON.parse(multiSession.localStorage.getItem('near_ca_wallets_v1')).wallets.length, 2, '1st tap must NOT delete wallet');
    assert.equal(multiAuthCalls, 0, '1st tap must NOT trigger auth');

    await multiSession.click('#wallets-switcher-list [data-action="delete-wallet"][data-wallet-id="w2"]');
    await multiSession.waitFor(() => JSON.parse(multiSession.localStorage.getItem('near_ca_wallets_v1')).wallets.length === 1, 3000);
    assert.equal(multiAuthCalls, 1, '2nd tap within 8s must trigger single auth');
    assert.equal(JSON.parse(multiSession.localStorage.getItem('near_ca_wallets_v1')).wallets[0].id, 'w1');
    assert.ok(multiSession.getToastHistory().some((x) => /已移除钱包|Wallet removed/.test(x.text)));
    await multiSession.closeSheet('sheet-wallets');

    // Fill Hub inputs across sheets and verify closeSheet() resets them
    await multiSession.click('#view-hub button[onclick*="openContactsSheet"]');
    await multiSession.setInputValue('#contact-name-input', 'TempName');
    await multiSession.setInputValue('#contact-addr-input', 'temp.near');
    await multiSession.closeSheet('sheet-contacts');
    assert.equal(multiSession.document.getElementById('contact-name-input').value, '');
    assert.equal(multiSession.document.getElementById('contact-addr-input').value, '');

    await multiSession.click('#view-hub button[onclick*="openWalletAddressesSheet"]');
    await multiSession.setInputValue('#prl-bind-mnemonic-input', TEST_MNEMONIC_2);
    await multiSession.closeSheet('sheet-wallet-addresses');
    assert.equal(multiSession.document.getElementById('prl-bind-mnemonic-input').value, '');

    await multiSession.click('#view-hub button[onclick*="openNearAccountSheet"]');
    await multiSession.setInputValue('#near-keys-rotate-mnemonic', TEST_MNEMONIC_2);
    await multiSession.setInputValue('#hub-near-domain-input', 'alice.near');
    await multiSession.setInputValue('#hub-near-bind-auth-input', 'secret');
    await multiSession.closeSheet('sheet-near-account');
    assert.equal(multiSession.document.getElementById('near-keys-rotate-mnemonic').value, '');
    assert.equal(multiSession.document.getElementById('hub-near-domain-input').value, '');
    assert.equal(multiSession.document.getElementById('hub-near-bind-auth-input').value, '');

    multiSession.assertNoRuntimeErrors();
    multiSession.assertNoRealBroadcasts();
  } finally {
    multiSession.cleanup();
  }
});

test('F10 Tier 2.6: NEAR Storage safety: ft_balance_of failure (null) is NOT treated as empty (protects tokens)', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url, init = {}) => {
      if (/api\.fastnear\.com\/v1\/account\/.*\/ft/i.test(url)) {
        return mockJsonResponse({ tokens: [{ contract_id: 'unknown-ft.near', balance: '0' }] });
      }
      if (init.body && typeof init.body === 'string') {
        const rpc = JSON.parse(init.body);
        if (rpc.params?.request_type === 'call_function') {
          if (rpc.params.method_name === 'storage_balance_of') {
            return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: Array.from(Buffer.from(JSON.stringify({ total: '1250000000000000000000', available: '0' }), 'utf8')) } });
          }
          if (rpc.params.method_name === 'ft_balance_of') {
            return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: 'Contract timeout' } }, 500);
          }
          if (rpc.params.method_name === 'ft_metadata') {
            return mockJsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: Array.from(Buffer.from(JSON.stringify({ symbol: 'UNK', decimals: 6 }), 'utf8')) } });
          }
        }
      }
      return mockJsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' });
    }
  });
  try {
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openNearStorageReclaimSheet"]');
    await session.waitFor(() => session.document.querySelector('input[data-action="toggle-near-storage"][data-contract="unknown-ft.near"]'), 3000);

    const cb = session.document.querySelector('input[data-action="toggle-near-storage"][data-contract="unknown-ft.near"]');
    assert.equal(cb.checked, false, 'When ft_balance_of returns null, contract must NOT be pre-checked');
    assert.equal(cb.disabled, true, 'When ft_balance_of returns null, contract checkbox must be disabled for safety');
    assert.equal(session.isDisabled('#btn-execute-near-storage'), true);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

// =====================================================================
// FEATURE 11 — MINING, WALLETCONNECT & DAPP BROWSER (TIER 1: 6 TESTS)
// =====================================================================

test('F11 Tier 1.1: [POST-FIX] Mining Pro lazy-loads mining-pro.js, populates KPIs/workers/payouts, disables #btn-mining-query & manages pools/watchlist', async () => {
  const wallet = createSeededWallet();
  let delayMinerFetch = false;
  let releaseMinerFetch = null;

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/api\.prlscan\.com\/v1\/network\/stats/i.test(url)) {
        return mockJsonResponse({ height: 543210, networkHashrate: 1200000000, difficulty: 8500000, blockReward: 12.5 });
      }
      if (/pearl\.herominers\.com\/api\/pool\/stats/i.test(url)) {
        return mockJsonResponse({ pool: { hashrate: 450000000, miners: 180 }, config: { minPaymentThreshold: 500000000 } });
      }
      if (/pearl\.herominers\.com\/api\/stats_address/i.test(url)) {
        if (delayMinerFetch) {
          await new Promise((resolve) => { releaseMinerFetch = resolve; });
        }
        return mockJsonResponse({
          stats: { hashrate: 12500000, hashrate_3h: 11800000, hashrate_24h: 11000000, balance: 250000000, paid: 1000000000, shares_good: 990, shares_stale: 5, shares_invalid: 5 },
          workers: [{ name: 'rig-01', hashrate: 12500000, hashrate_24h: 11000000, shares_good: 990, shares_invalid: 5, lastShare: Math.floor(Date.now() / 1000) }],
          payments: ['txid_abc123:500000000:1700000000:100']
        });
      }
      if (/blockbook\.pearlresearch\.ai\/api\/v2\/address\//i.test(url)) {
        const reqAddr = (url.split('/api/v2/address/')[1] || '').split(/[/?]/)[0] || VALID_PRL_ADDR;
        return mockJsonResponse({ balance: '10000000000', transactions: [{ txid: 'onchain_tx_1', blockTime: 1700000100, vout: [{ addresses: [reqAddr], value: '250000000' }] }] });
      }
      return mockJsonResponse({ error: 'not mocked' }, 404);
    }
  });
  try {
    const activeAddr = session.window.NearCAState.getActiveWallet().address;
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openMiningProSheet"]');
    await new Promise((r) => setTimeout(r, 40));
    await session.flushMicrotasks(12);
    await session.waitFor(() => session.window.NearCAMining && session.getVisibleText('#mining-kpi-30m') !== '--', 3000);

    assert.equal(session.document.getElementById('mining-address-input').value, activeAddr);
    assert.ok(/[KMGTPE]H\/s/.test(session.getVisibleText('#mining-kpi-30m')), '30m hashrate KPI must populate');
    assert.ok(session.getVisibleText('#mining-kpi-unpaid').includes('PRL'));
    assert.ok(session.getVisibleText('#mining-kpi-share-rate').includes('%'));
    assert.ok(session.getVisibleText('#mining-workers-tbody').includes('rig-01'));
    assert.ok(session.document.querySelectorAll('#mining-payouts-list > *').length > 0);

    // [POST-FIX] #btn-mining-query exists & disables during query even without global `event`
    const queryBtn = session.document.getElementById('btn-mining-query');
    assert.ok(queryBtn, '[POST-FIX] #btn-mining-query must exist in #sheet-mining-pro');
    delayMinerFetch = true;
    session.window.runMiningDeepQuery();
    await session.flushMicrotasks(4);
    assert.equal(queryBtn.disabled, true, '[POST-FIX] #btn-mining-query must disable while querying');
    if (releaseMinerFetch) releaseMinerFetch();
    await session.waitFor(() => queryBtn.disabled === false, 3000);

    // Pool switch to onchain
    await session.click('#sheet-mining-pro [data-pool="onchain"]');
    await session.waitFor(() => session.hasClass('#sheet-mining-pro [data-pool="onchain"]', 'active'), 2000);

    // Watchlist save & remove
    await session.click('#sheet-mining-pro button[onclick*="saveCurrentMinerAddress"]');
    assert.ok(session.document.querySelectorAll('#mining-watchlist [data-action="select-miner"]').length >= 1);
    await session.click('#mining-watchlist [data-action="remove-miner"]');
    assert.equal(session.document.querySelectorAll('#mining-watchlist [data-action="select-miner"]').length, 0);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 1.2: [POST-FIX] server.js /pearl-proxy & /kryptex-proxy validation + Mining empty-telemetry checks actual fields without CORS/Telemetry jargon', async () => {
  // Part A: server.js proxy path whitelist & rejection
  const srv = await startTestServer();
  try {
    const badUrls = [
      '/pearl-proxy',
      '/pearl-proxy?path=/api/v2/../../etc/passwd',
      '/pearl-proxy?path=/api/v2/@evil.com',
      '/kryptex-proxy',
      '/kryptex-proxy?path=/not-allowed/stats',
      '/kryptex-proxy?path=//evil.com/prl/stats'
    ];
    for (const u of badUrls) {
      const res = await fetch(`${srv.baseUrl}${u}`);
      assert.equal(res.status, 400, `Expected 400 for ${u}`);
      const json = await res.json();
      assert.equal(json.error, 'Invalid path parameter');
    }
  } finally {
    await srv.close();
  }

  // Part B: Mining empty telemetry on non-localhost web uses hashrateCurrent/workersOnlineCount/unpaidBalancePrl & zero jargon
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async () => mockJsonResponse({ error: 'blocked' }, 503)
  });
  try {
    session.window.location.hostname = 'wallet.example.com';
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openMiningProSheet"]');
    await new Promise((r) => setTimeout(r, 40));
    await session.flushMicrotasks(12);
    await session.waitFor(() => session.window.NearCAMining, 2000);

    await session.window.runMiningDeepQuery();
    await session.flushMicrotasks(12);

    const toasts = session.getToastHistory();
    assert.ok(
      toasts.length > 0,
      '[POST-FIX] Empty/null mining telemetry on static web must trigger user guidance toast (requires hashrateCurrent/workersOnlineCount/unpaidBalancePrl check)'
    );
    for (const toast of toasts) {
      assertZeroDevJargon(toast.text, 'Mining empty telemetry toast');
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 1.3: WalletConnect v2 init, advanced drawer, Project ID save, wc: pairing, proposal approve/reject & disconnect', async () => {
  const wallet = createSeededWallet();
  const wcMock = createMockWalletConnectSdk();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() { return { verified: true }; }
        }
      }
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    session.window.PearlWalletConnect = wcMock.sdk;

    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openWalletConnectSheet"]');
    await session.waitFor(() => /Ready|已就绪/.test(session.getVisibleText('#wc-status-pill')), 2000);

    // Toggle advanced drawer & save custom 32-char Project ID
    await session.click('#wc-advanced-toggle-btn');
    assert.equal(session.hasClass('#wc-advanced-drawer', 'hidden'), false);
    const customId = '1234567890abcdef1234567890abcdef';
    await session.setInputValue('#wc-project-id-input', customId);
    await session.click('#wc-advanced-drawer button[onclick*="saveWalletConnectProjectId"]');
    await session.waitFor(() => session.hasClass('#wc-advanced-drawer', 'hidden'), 2000);
    assert.equal(session.localStorage.getItem('near_ca_wc_project_id'), customId);

    // Pair wc: URI
    const wcUri = 'wc:0123456789abcdef@2?relay-protocol=irn&symKey=abcd';
    await session.setInputValue('#wc-uri-input', wcUri);
    await session.click('#btn-wc-pair');
    await session.waitFor(() => wcMock.calls.pair.length >= 1, 2000);
    assert.equal(wcMock.calls.pair.at(-1), wcUri);

    // Emit proposal #1 and reject
    const proposal1 = { id: 101, params: { proposer: { metadata: { name: 'BadDApp', url: 'https://bad.example' } }, requiredNamespaces: { eip155: { chains: ['eip155:1'] } } } };
    wcMock.setProposalMetadata(proposal1);
    wcMock.client.emit('session_proposal', proposal1);
    await session.waitFor(() => !session.hasClass('#wc-proposal-card', 'hidden'), 2000);
    assert.equal(session.getVisibleText('#wc-proposal-name'), 'BadDApp');
    await session.click('#wc-proposal-card button[onclick*="rejectWcProposal"]');
    await session.waitFor(() => wcMock.calls.rejectSession.length === 1 && session.hasClass('#wc-proposal-card', 'hidden'), 2000);

    // Emit proposal #2 and approve
    const proposal2 = { id: 102, params: { proposer: { metadata: { name: 'Uniswap', url: 'https://app.uniswap.org' } }, requiredNamespaces: { eip155: { chains: ['eip155:1', 'eip155:8453'] } } } };
    wcMock.setProposalMetadata(proposal2);
    wcMock.client.emit('session_proposal', proposal2);
    await session.waitFor(() => !session.hasClass('#wc-proposal-card', 'hidden'), 2000);
    await session.click('#wc-proposal-card button[onclick*="approveWcProposal"]');
    await session.waitFor(() => wcMock.calls.approveSession.length === 1, 3000);

    assert.ok(session.getVisibleText('#wc-sessions-list').includes('Uniswap'));
    assert.equal(session.hasClass('#header-wc-dot', 'connected'), true);
    assert.equal(session.getVisibleText('#hub-wc-count-badge'), '1');

    // Disconnect session
    await session.click('#wc-sessions-list [data-action="disconnect-wc"]');
    await session.waitFor(() => wcMock.calls.disconnectSession.length === 1, 2000);
    assert.equal(session.hasClass('#header-wc-dot', 'connected'), false);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 1.4: WalletConnect v2 session_request (personal_sign, wallet_switchEthereumChain, reject 4001) & queue shift', async () => {
  const wallet = createSeededWallet({
    evmPrivateKey: '0x0123456789012345678901234567890123456789012345678901234567890123'
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    preloadEthers: true,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() { return { verified: true }; }
        }
      }
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    const activeW = session.window.NearCAState.getActiveWallet();
    activeW.evmPrivateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';
    const activeEvmAddr = session.window.NearCAContracts.resolveWalletEvmSender(activeW);
    const wcMock = createMockWalletConnectSdk({
      initialSessions: {
        topic_1: {
          topic: 'topic_1',
          peer: { metadata: { name: 'Demo DApp', url: 'https://demo.example' } },
          namespaces: { eip155: { accounts: [`eip155:1:${activeEvmAddr}`] } }
        }
      }
    });
    session.window.PearlWalletConnect = wcMock.sdk;
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openWalletConnectSheet"]');
    await session.waitFor(() => session.window.NearCAState.wc.client, 2000);

    // Queue 2 requests: personal_sign + wallet_switchEthereumChain
    wcMock.client.emit('session_request', {
      id: 1,
      topic: 'topic_1',
      params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x48656c6c6f', activeEvmAddr] } }
    });
    wcMock.client.emit('session_request', {
      id: 2,
      topic: 'topic_1',
      params: { chainId: 'eip155:1', request: { method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] } }
    });
    await session.flushMicrotasks(6);

    assert.equal(session.getVisibleText('#wc-request-method'), 'personal_sign');
    assert.equal(session.getVisibleText('#wc-request-payload'), 'Hello');

    await session.click('#wc-request-card button[onclick*="approveWcRequest"]');
    await session.waitFor(() => wcMock.calls.respondSessionRequest.length === 1, 3000);
    assert.match(wcMock.calls.respondSessionRequest[0].response.result, /^0x[0-9a-fA-F]{130}$/);

    // Queue automatically shifted to request #2
    await session.waitFor(() => session.getVisibleText('#wc-request-method') === 'wallet_switchEthereumChain', 2000);
    await session.click('#wc-request-card button[onclick*="approveWcRequest"]');
    await session.waitFor(() => wcMock.calls.respondSessionRequest.length === 2, 3000);
    assert.equal(wcMock.calls.respondSessionRequest[1].response.result, null);
    assert.equal(session.hasClass('#wc-request-card', 'hidden'), true);

    // Reject a 3rd request -> JSON-RPC 4001
    wcMock.client.emit('session_request', {
      id: 3,
      topic: 'topic_1',
      params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x41', activeEvmAddr] } }
    });
    await session.waitFor(() => !session.hasClass('#wc-request-card', 'hidden'), 2000);
    await session.click('#wc-request-card button[onclick*="rejectWcRequest"]');
    await session.waitFor(() => wcMock.calls.respondSessionRequest.length === 3, 2000);
    assert.equal(wcMock.calls.respondSessionRequest[2].response.error.code, 4001);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 1.5: DApp Browser catalog filters, bare-domain https normalization, external #sheet-dapp-approve, allowlist & disconnect', async () => {
  const wallet = createSeededWallet();
  const mockBridge = createMockNativeDAppBrowser();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeDAppBrowser: mockBridge.plugin
      }
    }
  });
  try {
    await session.switchTab('hub');
    await session.click('#hub-dapp-browser-btn');
    assert.equal(session.hasClass('#sheet-dapp-browser', 'open'), true);

    const allCards = session.document.querySelectorAll('#dapp-catalog-list .dapp-catalog-card').length;
    assert.ok(allCards >= 10, 'Catalog must render DApp cards');

    await session.click('#dapp-filter-bar [data-action="set-dapp-filter"][data-chain="NEAR"]');
    const nearCards = session.document.querySelectorAll('#dapp-catalog-list .dapp-catalog-card').length;
    assert.ok(nearCards > 0 && nearCards < allCards, 'NEAR filter must narrow catalog list');

    // Bare domain normalization + catalog allowlist auto-connect
    await session.setInputValue('#dapp-url-input', 'app.uniswap.org');
    await session.click('#btn-dapp-open');
    await session.flushMicrotasks(8);
    assert.equal(mockBridge.calls.openUrl.at(-1).url, 'https://app.uniswap.org/');

    // Unknown external origin eth_requestAccounts -> opens #sheet-dapp-approve -> reject returns 4001 -> confirm returns address
    mockBridge.plugin.emit('bridgeMessage', {
      payload: {
        id: 'dapp_req_1',
        namespace: 'evm',
        method: 'eth_requestAccounts',
        origin: 'https://unknown-dapp.example',
        url: 'https://unknown-dapp.example/app'
      }
    });
    await session.waitFor(() => session.hasClass('#sheet-dapp-approve', 'open'), 2000);
    assert.equal(session.getVisibleText('#dapp-approve-origin'), 'https://unknown-dapp.example');
    await session.click('#btn-dapp-reject');
    await session.waitFor(() => mockBridge.calls.sendResponse.length === 1, 2000);
    assert.equal(JSON.parse(mockBridge.calls.sendResponse[0].errorJson).code, 4001);

    mockBridge.plugin.emit('bridgeMessage', {
      payload: {
        id: 'dapp_req_2',
        namespace: 'evm',
        method: 'eth_requestAccounts',
        origin: 'https://unknown-dapp.example',
        url: 'https://unknown-dapp.example/app'
      }
    });
    await session.waitFor(() => session.hasClass('#sheet-dapp-approve', 'open'), 2000);
    await session.click('#btn-dapp-confirm');
    await session.waitFor(() => mockBridge.calls.sendResponse.length === 2, 2000);
    const activeEvmAddr = session.window.NearCAState.getActiveWallet().evmAddress;
    assert.deepEqual(JSON.parse(mockBridge.calls.sendResponse[1].resultJson), [activeEvmAddr]);

    // Disconnect connected origin
    await session.click('#hub-dapp-browser-btn');
    assert.ok(session.getVisibleText('#dapp-connected-section').includes('unknown-dapp.example'));
    await session.click('#dapp-connected-section [data-action="disconnect-dapp-origin"][data-origin="https://unknown-dapp.example"]');
    assert.equal(session.hasClass('#dapp-connected-section', 'hidden'), false);
    await session.click('#dapp-connected-section [data-action="disconnect-all-dapp-origins"]');
    assert.equal(session.hasClass('#dapp-connected-section', 'hidden'), true);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 1.6: Broadcast Safety Guard intercepts Feature 10 & 11 mutation vectors including encoded proxy & host Request', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    // 1. Direct isBroadcastRequest checks
    assert.equal(isBroadcastRequest('https://rpc.mainnet.near.org', { method: 'POST', body: JSON.stringify({ method: 'broadcast_tx_commit' }) }).blocked, true);
    assert.equal(isBroadcastRequest('https://solana-rpc.publicnode.com', { method: 'POST', body: JSON.stringify({ method: 'sendTransaction' }) }).blocked, true);
    assert.equal(isBroadcastRequest('https://eth.llamarpc.com', { method: 'POST', body: JSON.stringify({ method: 'eth_sendRawTransaction' }) }).blocked, true);
    assert.equal(isBroadcastRequest('/pearl-proxy?path=%252Fapi%252Fv2%252Fsendtx%252F', { method: 'POST', body: '00' }).blocked, true);

    // 2. Sandbox fetch rejections (string, SandboxRequest, host Request)
    await assert.rejects(
      () => session.window.fetch('https://rpc.mainnet.near.org', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'broadcast_tx_commit', params: ['AA=='] }) }),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch('https://solana-rpc.publicnode.com', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'sendTransaction', params: ['AA=='] }) }),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch(new session.window.Request('https://eth.llamarpc.com', { method: 'POST', body: new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_sendRawTransaction', params: ['0x01'] })) })),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch(new Request('https://eth.llamarpc.com', { method: 'POST', body: new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'eth_sendRawTransaction', params: ['0x02'] })) })),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch('/pearl-proxy?path=%2Fapi%2Fv2%2Fsendtx%2F', { method: 'POST', body: 'deadbeef' }),
      /E2E_BROADCAST_BLOCKED/
    );

    const blocked = session.getNetworkLog().filter((x) => x.blocked);
    assert.equal(blocked.length, 5);
    assert.ok(blocked.every((x) => x.realNetworkSent === false));
    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

// =====================================================================
// FEATURE 11 — MINING, WALLETCONNECT & DAPP BROWSER (TIER 2: 6 TESTS)
// =====================================================================

test('F11 Tier 2.1: [POST-FIX] Mining rejects invalid prl1... addresses with zero HRP/Bech32/Telemetry jargon', async () => {
  const wallet = createSeededWallet();
  let minerQueryCalls = 0;
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/stats_address|api\/v2\/address/i.test(url)) minerQueryCalls += 1;
      return mockJsonResponse({});
    }
  });
  try {
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openMiningProSheet"]');
    await new Promise((r) => setTimeout(r, 40));
    await session.flushMicrotasks(12);
    await session.waitFor(() => session.window.NearCAMining, 2000);
    minerQueryCalls = 0;

    const badAddresses = [
      '',
      'prl1p',
      'Prl1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdj2x9v7',
      'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
      BAD_CHECKSUM_PRL_ADDR
    ];
    for (const bad of badAddresses) {
      await session.setInputValue('#mining-address-input', bad);
      await session.window.runMiningDeepQuery();
      await session.window.saveCurrentMinerAddress();
      await session.flushMicrotasks(8);
    }

    assert.equal(minerQueryCalls, 0, 'Invalid Pearl addresses must not trigger miner network queries');
    assert.equal(session.document.querySelectorAll('#mining-watchlist [data-action="select-miner"]').length, 0);
    for (const toast of session.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'Invalid Pearl address toast');
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 2.2: [POST-FIX] Mining stale async query race (_miningQueryGen) & HTTP 500/all-null telemetry renders -- with zero CORS/HTTP/Telemetry jargon', async () => {
  const wallet = createSeededWallet();
  let releaseSlow = null;
  let mode = 'race';
  let slowAddr = '';

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (mode === 'all500') {
        return mockJsonResponse({ error: 'HTTP 500 CORS Upstream Telemetry failure' }, 500);
      }
      if (/pearl\.herominers\.com\/api\/stats_address/i.test(url)) {
        if (slowAddr && url.includes(slowAddr)) {
          await new Promise((resolve) => { releaseSlow = resolve; });
          return mockJsonResponse({ stats: { hashrate: 1, balance: 9900000000 }, workers: [], payments: [] });
        }
        return mockJsonResponse({ stats: { hashrate: 0.01, balance: 100000000 }, workers: [], payments: [] });
      }
      return mockJsonResponse({}, 404);
    }
  });
  try {
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openMiningProSheet"]');
    await new Promise((r) => setTimeout(r, 40));
    await session.flushMicrotasks(12);
    await session.waitFor(() => session.window.NearCAMining, 2000);

    const MINER_A = session.window.NearCAState.getActiveWallet().address;
    slowAddr = MINER_A;
    const derivedB = await session.window.NearCACrypto.derivePearlFromSeedAsync(TEST_MNEMONIC_2, "m/86'/808276'/0'/0/0", true);
    const addrB = derivedB.address;

    await session.setInputValue('#mining-address-input', MINER_A);
    const slowPromise = session.window.runMiningDeepQuery();
    await session.flushMicrotasks(4);

    await session.setInputValue('#mining-address-input', addrB);
    const fastPromise = session.window.runMiningDeepQuery();
    await fastPromise;

    const kpiAfterFast = session.getVisibleText('#mining-kpi-30m');
    assert.ok(kpiAfterFast.includes('42'), `Fast query B must render 42 MH/s, got "${kpiAfterFast}"`);

    if (releaseSlow) releaseSlow();
    await slowPromise;
    await session.flushMicrotasks(8);
    assert.equal(session.getVisibleText('#mining-kpi-30m'), kpiAfterFast, 'Stale slow query A must NOT overwrite faster query B');

    // HTTP 500 / all-null telemetry renders '--' and zero jargon
    mode = 'all500';
    session.window.location.hostname = 'app.nexuswallet.io';
    const before500Toasts = session.getToastHistory().length;
    await session.window.runMiningDeepQuery();
    await session.flushMicrotasks(10);

    assert.equal(session.getVisibleText('#mining-kpi-30m'), '--');
    assert.equal(session.getVisibleText('#mining-kpi-unpaid'), '--');
    assert.equal(session.getVisibleText('#mining-kpi-share-rate'), '--');
    assert.ok(
      session.getToastHistory().length > before500Toasts,
      '[POST-FIX] All-500 / null telemetry must display a user-friendly guidance toast'
    );
    for (const toast of session.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'Mining HTTP 500 toast');
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 2.3: [POST-FIX] WalletConnect boundaries: invalid URI, Project ID <16 chars, active wallet mismatch (4100), eth_sendTransaction balance check & QR zero WebView jargon', async () => {
  const w1 = createSeededWallet({ id: 'w1' });
  const w2 = createSeededWallet({
    id: 'w2',
    mnemonic: TEST_MNEMONIC_2,
    nearAddress: '22223333444455556666777788889999aaaabbbbccccddddeeeeffff1111'
  });
  const session = await createWalletAppSession({
    viewportWidth: 375,
    preloadEthers: true,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [w1, w2], activeWalletId: 'w1' })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() { return { verified: true }; }
        }
      }
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    const w1Addr = session.window.NearCAState.wallets[0].evmAddress;
    const wcMock = createMockWalletConnectSdk({
      initialSessions: {
        topic_1: {
          topic: 'topic_1',
          peer: { metadata: { name: 'MismatchDApp', url: 'https://mismatch.example' } },
          namespaces: { eip155: { accounts: [`eip155:1:${w1Addr}`] } }
        }
      }
    });
    session.window.PearlWalletConnect = wcMock.sdk;
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openWalletConnectSheet"]');
    await session.waitFor(() => session.window.NearCAState.wc.client, 2000);

    // 1. Project ID < 16 chars rejected
    await session.click('#wc-advanced-toggle-btn');
    await session.setInputValue('#wc-project-id-input', 'short123');
    await session.click('#wc-advanced-drawer button[onclick*="saveWalletConnectProjectId"]');
    await session.flushMicrotasks(6);
    assert.equal(session.localStorage.getItem('near_ca_wc_project_id'), null);

    // 2. Non-wc: URI rejected without calling pair()
    await session.setInputValue('#wc-uri-input', 'https://evil.com/connect');
    await session.click('#btn-wc-pair');
    await session.flushMicrotasks(6);
    assert.equal(wcMock.calls.pair.length, 0);

    // 3. eth_sendTransaction exceeding 0.5 ETH balance blocked BEFORE eth_sendRawTransaction
    wcMock.client.emit('session_request', {
      id: 10,
      topic: 'topic_1',
      params: {
        chainId: 'eip155:1',
        request: { method: 'eth_sendTransaction', params: [{ to: VALID_EVM_ADDR, value: '0x2b5e3af16b1880000' }] } // 50 ETH
      }
    });
    await session.waitFor(() => !session.hasClass('#wc-request-card', 'hidden'), 2000);
    await session.click('#wc-request-card button[onclick*="approveWcRequest"]');
    await session.waitFor(() => wcMock.calls.respondSessionRequest.length === 1, 3000);
    assert.ok(wcMock.calls.respondSessionRequest[0].response.error, 'Insufficient ETH must fail pre-broadcast');
    assert.equal(session.getNetworkLog().filter((x) => x.blocked).length, 0, 'Insufficient ETH must never reach broadcast');

    // 4. Active wallet mismatch responds with 4100 without auth
    session.window.NearCAState.activeWalletId = 'w2';
    wcMock.client.emit('session_request', {
      id: 11,
      topic: 'topic_1',
      params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x41', w1Addr] } }
    });
    await session.waitFor(() => !session.hasClass('#wc-request-card', 'hidden'), 2000);
    await session.click('#wc-request-card button[onclick*="approveWcRequest"]');
    await session.waitFor(() => wcMock.calls.respondSessionRequest.length === 2, 3000);
    assert.equal(wcMock.calls.respondSessionRequest[1].response.error.code, 4100, 'Wallet mismatch must reject with JSON-RPC 4100');

    // 5. QR scanner missing decoder -> [POST-FIX] zero WebView / 系统内核 jargon (checked in zh-CN & en)
    session.window.navigator.mediaDevices = {
      getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] })
    };
    const qrVideoEl = session.document.getElementById('qr-scanner-video');
    assert.ok(qrVideoEl, '#qr-scanner-video must exist');
    qrVideoEl.play = async () => {};
    session.window.jsQR = null;

    for (const toggleLang of [false, true]) {
      if (toggleLang) {
        await session.click('#header-lang-btn');
      }
      const langTag = session.document.documentElement.lang;
      await session.click('#sheet-walletconnect button[onclick*="openQrScannerSheet(\'wc\')"]');
      await session.waitFor(
        () => {
          const st = session.getVisibleText('#qr-scanner-status');
          return st.length > 0 && !/正在启动摄像头|Starting camera/.test(st);
        },
        2000
      );
      const qrStatus = session.getVisibleText('#qr-scanner-status');
      assert.doesNotMatch(
        qrStatus,
        /无法访问摄像头|Camera access denied/i,
        `QR decoder unsupported branch (${langTag}) must not fall into camera-denied catch`
      );
      assertZeroDevJargon(qrStatus, `[POST-FIX] QR scanner missing decoder status (${langTag})`);

      const toastsBeforeQrFile = session.getToastHistory().length;
      await session.window.handleQrScannerFileSelect({ target: { files: [{ name: 'qr.png' }] } });
      await session.flushMicrotasks(6);
      assert.ok(
        session.getToastHistory().length > toastsBeforeQrFile,
        `QR file decode unsupported (${langTag}) must emit a toast`
      );
      for (const toast of session.getToastHistory().slice(toastsBeforeQrFile)) {
        assertZeroDevJargon(toast.text, `[POST-FIX] QR file decode toast (${langTag})`);
      }
      await session.click('#sheet-qr-scanner button[onclick*="closeQrScannerSheet"]');
    }
    for (const toast of session.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'QR scanner / WC toast');
    }

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 2.4: [POST-FIX] DApp Browser security boundaries: unsafe URLs rejected, unconnected eth_accounts returns [], browserClosed rejects approval & #dapp-url-input resets', async () => {
  const wallet = createSeededWallet();
  const mockBridge = createMockNativeDAppBrowser();
  const openedUrls = [];

  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeDAppBrowser: mockBridge.plugin
      }
    }
  });
  try {
    session.window.open = (u) => { openedUrls.push(u); return null; };
    await session.switchTab('hub');
    await session.click('#hub-dapp-browser-btn');

    const unsafeUrls = [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'http://evil.com',
      'https://user:pass@evil.com',
      'https://evil.com/<script>'
    ];
    for (const badUrl of unsafeUrls) {
      await session.setInputValue('#dapp-url-input', badUrl);
      await session.click('#btn-dapp-open');
    }
    assert.equal(mockBridge.calls.openUrl.length, 0, 'Unsafe URLs must never invoke NativeDAppBrowser.openUrl');
    assert.equal(openedUrls.length, 0, 'Unsafe URLs must never invoke window.open');

    // [POST-FIX] #dapp-url-input must reset on closeSheet()
    await session.setInputValue('#dapp-url-input', 'https://app.uniswap.org');
    await session.closeSheet('sheet-dapp-browser');
    assert.equal(
      session.document.getElementById('dapp-url-input').value,
      '',
      '[POST-FIX] closeAllSheets() must reset #dapp-url-input'
    );

    // Unconnected eth_accounts returns [] without prompting approval
    mockBridge.plugin.emit('bridgeMessage', {
      payload: {
        id: 'dapp_unconn_1',
        namespace: 'evm',
        method: 'eth_accounts',
        origin: 'https://untrusted-site.example',
        url: 'https://untrusted-site.example'
      }
    });
    await session.waitFor(() => mockBridge.calls.sendResponse.length === 1, 2000);
    assert.deepEqual(JSON.parse(mockBridge.calls.sendResponse[0].resultJson), [], 'Unconnected eth_accounts must return []');
    assert.equal(session.hasClass('#sheet-dapp-approve', 'open'), false);

    // browserClosed rejects pending #sheet-dapp-approve
    mockBridge.plugin.emit('bridgeMessage', {
      payload: {
        id: 'dapp_close_1',
        namespace: 'evm',
        method: 'eth_requestAccounts',
        origin: 'https://pending-close.example',
        url: 'https://pending-close.example'
      }
    });
    await session.waitFor(() => session.hasClass('#sheet-dapp-approve', 'open'), 2000);
    mockBridge.plugin.emit('browserClosed', {});
    await session.waitFor(() => mockBridge.calls.sendResponse.length === 2, 2000);
    assert.equal(JSON.parse(mockBridge.calls.sendResponse[1].errorJson).code, 4001);
    assert.equal(session.hasClass('#sheet-dapp-approve', 'open'), false);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 2.5: [POST-FIX] DApp Approval & Mining UI contain zero developer jargon (no NEP-413, broadcast, WebView, Telemetry, 遥测)', async () => {
  const wallet = createSeededWallet();
  const mockBridge = createMockNativeDAppBrowser();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeDAppBrowser: mockBridge.plugin
      }
    }
  });
  try {
    // 1. Check #sheet-mining-pro in zh & en
    for (const toggleLang of [false, true]) {
      if (toggleLang) await session.click('#header-lang-btn');
      await session.openSheet('sheet-mining-pro');
      await new Promise((r) => setTimeout(r, 40));
      await session.flushMicrotasks(12);
      assertZeroDevJargon(session.getVisibleText('#sheet-mining-pro'), `#sheet-mining-pro (${session.document.documentElement.lang})`);
      await session.closeSheet('sheet-mining-pro');
    }

    // 2. Check #sheet-dapp-approve on NEAR signMessage & Solana signAndSendTransaction
    await session.switchTab('hub');
    await session.click('#hub-dapp-browser-btn');

    mockBridge.plugin.emit('bridgeMessage', {
      payload: {
        id: 'dapp_near_sign',
        namespace: 'near',
        method: 'signMessage',
        params: [{ message: 'Login to App', recipient: 'app.near', nonce: Array.from(new Uint8Array(32).fill(1)) }],
        origin: 'https://external-near.example',
        url: 'https://external-near.example'
      }
    });
    await session.waitFor(() => session.hasClass('#sheet-dapp-approve', 'open'), 2000);
    assertZeroDevJargon(session.getVisibleText('#sheet-dapp-approve'), '[POST-FIX] #sheet-dapp-approve (NEAR signMessage)');
    await session.click('#btn-dapp-reject');
    await session.flushMicrotasks(6);

    mockBridge.plugin.emit('bridgeMessage', {
      payload: {
        id: 'dapp_sol_tx',
        namespace: 'solana',
        method: 'signAndSendTransaction',
        params: [{ transaction: 'AAAA' }],
        origin: 'https://external-sol.example',
        url: 'https://external-sol.example'
      }
    });
    await session.waitFor(() => session.hasClass('#sheet-dapp-approve', 'open'), 2000);
    assertZeroDevJargon(session.getVisibleText('#sheet-dapp-approve'), '[POST-FIX] #sheet-dapp-approve (Solana tx)');
    await session.click('#btn-dapp-reject');
    await session.flushMicrotasks(6);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('F11 Tier 2.6: WalletConnect unsupported chain switch (4902) & QR scanner address URI parsing / permission fallback', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    preloadEthers: true,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    capacitor: {
      isNativePlatform: () => true,
      Plugins: {
        NativeSecurity: {
          async getBiometricStatus() { return { available: true, biometryType: 'face' }; },
          async authenticateWithBiometrics() { return { verified: true }; }
        }
      }
    }
  });
  try {
    await session.waitFor(() => !session.document.documentElement.classList.contains('nexus-locked'), 3000);
    const activeW = session.window.NearCAState.getActiveWallet();
    activeW.evmPrivateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';
    const activeEvmAddr = session.window.NearCAContracts.resolveWalletEvmSender(activeW);
    const wcMock = createMockWalletConnectSdk({
      initialSessions: {
        topic_1: {
          topic: 'topic_1',
          peer: { metadata: { name: 'ChainTest', url: 'https://chaintest.example' } },
          namespaces: { eip155: { accounts: [`eip155:1:${activeEvmAddr}`] } }
        }
      }
    });
    session.window.PearlWalletConnect = wcMock.sdk;
    await session.switchTab('hub');
    await session.click('#view-hub button[onclick*="openWalletConnectSheet"]');
    await session.waitFor(() => session.window.NearCAState.wc.client, 2000);

    // Unsupported chainId switch -> responds JSON-RPC 4902
    wcMock.client.emit('session_request', {
      id: 77,
      topic: 'topic_1',
      params: { chainId: 'eip155:1', request: { method: 'wallet_switchEthereumChain', params: [{ chainId: '0xdeadbeef' }] } }
    });
    await session.flushMicrotasks(6);
    await session.click('#wc-request-card button[onclick*="approveWcRequest"]');
    await session.waitFor(() => wcMock.calls.respondSessionRequest.length === 1, 3000);
    assert.equal(wcMock.calls.respondSessionRequest[0].response.error.code, 4902);
    await session.closeSheet('sheet-walletconnect');

    // QR scanner camera denied + closeQrScannerSheet returns to #sheet-send + EIP-681 payment QR parsing
    session.window.navigator.mediaDevices = {
      getUserMedia: async () => { throw new Error('Permission denied'); }
    };
    await session.switchTab('wallet');
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    await session.click('#sheet-send button[onclick*="openQrScannerSheet"]');
    await session.flushMicrotasks(8);
    assert.equal(session.hasClass('#sheet-qr-scanner', 'open'), true);
    assertZeroDevJargon(session.getVisibleText('#qr-scanner-status'), 'Camera denied status');

    await session.window.handleQrScanResultAsync(`ethereum:pay-${VALID_EVM_ADDR}?value=1`);
    assert.equal(session.hasClass('#sheet-send', 'open'), true);
    assert.equal(session.document.getElementById('send-recipient-input').value, VALID_EVM_ADDR);

    session.assertNoRuntimeErrors();
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});
