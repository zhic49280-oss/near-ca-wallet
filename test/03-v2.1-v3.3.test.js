'use strict';

const {
  test,
  assert,
  fs,
  path,
  nodeCrypto,
  ROOT_DIR,
  cryptoEngine,
  tokenRegistry,
  nearIntents,
  chainContracts,
  limitOrders,
  hlPerps,
  miningPro,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  createMemoryStorage,
  withMockedStorage,
  readBorshString,
  INITIAL_STAKING_SNAPSHOT,
  createMockClassList,
  createMockDomElement
} = require('./helpers.js');

// ==================== v2.1 Biometrics, Native iOS/Android & Security Modal ====================

test('v2.1 Native iOS/Android Capacitor Security Bridge Files & Config', () => {
  const capConfigPath = path.join(ROOT_DIR, 'capacitor.config.json');
  const capConfig = JSON.parse(fs.readFileSync(capConfigPath, 'utf8'));
  assert.equal(capConfig.appId, 'io.nexus.wallet');
  assert.equal(capConfig.appName, 'Nexus Wallet');
  assert.equal(capConfig.webDir, 'dist');
  assert.equal(capConfig.plugins.CapacitorHttp.enabled, true);

  const infoPlist = fs.readFileSync(path.join(ROOT_DIR, 'ios', 'App', 'App', 'Info.plist'), 'utf8');
  assert.match(infoPlist, /NSFaceIDUsageDescription/);
  assert.match(infoPlist, /<string>2\.1<\/string>/);

  const swiftPlugin = fs.readFileSync(path.join(ROOT_DIR, 'ios', 'App', 'App', 'NativeSecurityPlugin.swift'), 'utf8');
  assert.match(swiftPlugin, /public let jsName = "NativeSecurity"/);
  assert.match(swiftPlugin, /getSecurityCapabilities/);
  assert.match(swiftPlugin, /authenticateWithBiometrics/);
  assert.match(swiftPlugin, /deviceOwnerAuthenticationWithBiometrics/);
  assert.match(swiftPlugin, /\.deviceOwnerAuthentication,\s*localizedReason/);

  const manifest = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android\.permission\.USE_BIOMETRIC/);
  assert.match(manifest, /android\.permission\.USE_FINGERPRINT/);
  assert.match(manifest, /io\.nexus\.wallet\.MainActivity/);

  const mainActivity = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'io', 'nexus', 'wallet', 'MainActivity.java'), 'utf8');
  assert.match(mainActivity, /registerPlugin\(NativeSecurityPlugin\.class\)/);

  const javaPlugin = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'io', 'nexus', 'wallet', 'NativeSecurityPlugin.java'), 'utf8');
  assert.match(javaPlugin, /@CapacitorPlugin\(name = "NativeSecurity"\)/);
  assert.match(javaPlugin, /getSecurityCapabilities/);
  assert.match(javaPlugin, /authenticateWithBiometrics/);
  assert.match(javaPlugin, /BiometricPrompt/);
  assert.match(javaPlugin, /KeyguardManager/);
});

test('v2.1 Multi-Brand Device & Biometric Capability Detection', async () => {
  const iphone = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    hasWebAuthnPlatform: true
  });
  assert.equal(iphone.platform, 'ios');
  assert.equal(iphone.deviceModel, 'Apple iPhone');
  assert.match(iphone.methodsText, /Face ID \/ Touch ID/);

  const xiaomi = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; 24031PN0DC Build/UKQ1.231003.002) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36'
  });
  assert.equal(xiaomi.platform, 'android');
  assert.match(xiaomi.deviceModel, /Xiaomi.*24031PN0DC/);

  const redmi = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Redmi K70 Pro Build/UKQ1.231003.002) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(redmi.platform, 'android');
  assert.match(redmi.brand, /Xiaomi/i);

  const huawei = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 12; NOH-AN00 Build/HUAWEINOH-AN00) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(huawei.brand, 'Huawei');
  assert.match(huawei.deviceModel, /NOH-AN00/);

  const honor = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; HONOR BVL-AN16 Build/HONORBVL) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(honor.brand, 'Honor');

  const oneplus = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; OnePlus PJF110 Build/UKQ1) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(oneplus.brand, 'OnePlus');

  const cph = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; CPH2581 Build/UKQ1) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.match(cph.brand, /OPPO|OnePlus/);

  const vivo = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; V2309A Build/UP1A) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(vivo.brand, 'vivo');

  const iqoo = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; iQOO 12 Pro Build/UP1A) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.match(iqoo.brand, /iQOO/);

  const samsung = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-S9280 Build/UP1A) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(samsung.brand, 'Samsung');
  assert.match(samsung.deviceModel, /SM-S9280/);

  const pixel = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro Build/AP3A) AppleWebKit/537.36 Mobile Safari/537.36'
  });
  assert.equal(pixel.brand, 'Google Pixel');

  const macos = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15',
    hasWebAuthnPlatform: true
  });
  assert.equal(macos.platform, 'macos');
  assert.match(macos.methodsText, /Touch ID/);

  const windows = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    hasWebAuthnPlatform: true
  });
  assert.equal(windows.platform, 'windows');
  assert.match(windows.methodsText, /Windows Hello/);

  const nativeAndroid = await uiController.detectDeviceBiometricProfileAsync({
    userAgent: 'Dalvik/2.1.0 (Linux; Android 14)',
    nativePlugin: {
      async getSecurityCapabilities() {
        return {
          platform: 'android',
          manufacturer: 'Xiaomi',
          brand: 'Xiaomi',
          brandFamily: 'Xiaomi/Redmi',
          model: '24031PN0DC',
          hasFingerprint: true,
          hasFace: true,
          hasDeviceCredential: true,
          biometryType: 'fingerprint_and_face',
          supportsBiometrics: true,
          supportsPasscode: true
        };
      },
      async authenticateWithBiometrics() {
        return { authenticated: true, type: 'biometric' };
      }
    }
  });
  assert.equal(nativeAndroid.nativeAvailable, true);
  assert.equal(nativeAndroid.biometricAvailable, true);
  assert.equal(nativeAndroid.devicePasscodeAvailable, true);
  assert.match(nativeAndroid.deviceModel, /Xiaomi.*24031PN0DC/);
});

test('v2.1 Native Capacitor Auth, WebAuthn Passkey & Interactive #sheet-security-auth Keypad + Biometric Lock', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_sec_test',
      name: 'Bio Test Wallet',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'bio.near',
      pin: '123456'
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.saveWallets();

    // 1. Test Native Capacitor iOS Face ID & Android BiometricPrompt auth paths
    const iosRes = await uiController.requestBiometricAuth('Test Face ID', w, {
      nativePlugin: {
        async authenticateWithBiometrics() {
          return { authenticated: true, type: 'faceID' };
        }
      }
    });
    assert.equal(iosRes.ok, true);
    assert.equal(iosRes.method, 'native');
    assert.equal(iosRes.biometryType, 'faceID');

    const androidRes = await uiController.requestBiometricAuth('Test Android Biometric', w, {
      nativePlugin: {
        async authenticateWithBiometrics() {
          return { authenticated: true, type: 'biometric' };
        }
      }
    });
    assert.equal(androidRes.ok, true);
    assert.equal(androidRes.method, 'native');
    assert.equal(androidRes.biometryType, 'biometric');

    // 2. Test WebAuthn Passkey registration (.create) + subsequent verification (.get)
    let createCalls = 0;
    let getCalls = 0;
    let lastAllowCredBytes = null;
    const rawCredId = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]).buffer;
    const mockNav = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      credentials: {
        async create() {
          createCalls += 1;
          return { rawId: rawCredId };
        },
        async get(opts) {
          getCalls += 1;
          lastAllowCredBytes = opts?.publicKey?.allowCredentials?.[0]?.id || null;
          return { rawId: rawCredId };
        }
      }
    };
    const mockPKC = {
      async isUserVerifyingPlatformAuthenticatorAvailable() {
        return true;
      }
    };

    const webAuthnReg = await uiController.requestBiometricAuth('Enable Passkey', w, {
      navigator: mockNav,
      PublicKeyCredential: mockPKC
    });
    assert.equal(webAuthnReg.ok, true);
    assert.equal(webAuthnReg.method, 'webauthn');
    assert.equal(createCalls, 1);
    assert.ok(w.webauthnCredentialId && w.webauthnCredentialId.length > 5);

    const webAuthnVerify = await uiController.requestBiometricAuth('Verify Passkey', w, {
      navigator: mockNav,
      PublicKeyCredential: mockPKC
    });
    assert.equal(webAuthnVerify.ok, true);
    assert.equal(webAuthnVerify.method, 'webauthn');
    assert.equal(getCalls, 1);
    assert.deepEqual(Array.from(lastAllowCredBytes), [10, 20, 30, 40, 50, 60, 70, 80]);

    // 3. Test Device-Native Security Auth (Capacitor NativeSecurity + WebAuthn fallback + Hub Biometric Card)
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const domMap = new Map([
      ['hub-security-bio-card', createMockDomElement('hub-security-bio-card')],
      ['hub-bio-status-badge', createMockDomElement('hub-bio-status-badge')]
    ]);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => [],
      querySelector: () => null
    };
    globalThis.window = {
      navigator: mockNav,
      PublicKeyCredential: mockPKC,
      Capacitor: {
        Plugins: {
          NativeSecurity: {
            async getSecurityCapabilities() {
              return { platform: 'ios', deviceModel: 'iPhone', biometryType: 'faceID', supportsBiometrics: true, supportsPasscode: true };
            },
            async authenticateWithBiometrics() {
              return { authenticated: true, type: 'faceID' };
            }
          }
        }
      }
    };

    try {
      // Biometrics (native mock) pass automatically
      assert.equal(await uiController.verifySecurityAuthAsync(w, 'Confirm Transfer'), true);

      // Native failure blocks transfer (no PIN fallback)
      const nativeAuthFn = globalThis.window.Capacitor.Plugins.NativeSecurity.authenticateWithBiometrics;
      globalThis.window.Capacitor.Plugins.NativeSecurity.authenticateWithBiometrics = async () => ({ authenticated: false, error: 'fail' });
      assert.equal(await uiController.verifySecurityAuthAsync(w, 'Confirm Transfer'), false);
      globalThis.window.Capacitor.Plugins.NativeSecurity.authenticateWithBiometrics = nativeAuthFn;

      // Web (no native plugin, no WebAuthn): degrades gracefully without deadlocking wallet
      delete globalThis.window.Capacitor;
      globalThis.window.navigator = {};
      await uiController.detectDeviceBiometricProfileAsync?.();
      assert.equal(await uiController.verifySecurityAuthAsync(w, 'Confirm Transfer'), true);
      await uiController.renderHubBiometricCardAsync?.();
    } finally {
      globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
    }
  });
});

test('v2.8 Task 1: EVM Staking Pools TVL (token qty + USD) & holder stakersCount in fetchLiveStakingMetrics', async () => {
  const prevLang = state.lang;
  state.setLanguage('en');
  const padHex = (n) => '0x' + BigInt(n).toString(16).padStart(64, '0');
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('yields.llama.fi/pools')) {
        return jsonResponse({
          data: [
            { chain: 'Ethereum', project: 'lido', symbol: 'STETH', apy: 3.05, tvlUsd: 24500000000 },
            { chain: 'Arc', project: 'morpho-blue', symbol: 'STEAKUSDC', apy: 4.12, tvlUsd: 6500000 },
            { chain: 'Base', project: 'aave-v3', symbol: 'USDC', apy: 5.88, tvlUsd: 18200000 },
            { chain: 'Ethereum', project: 'ethena-usde', symbol: 'SUSDE', apy: 6.45, tvlUsd: 1250000000 },
            { chain: 'Hyperliquid L1', project: 'kinetiq-khype', symbol: 'KHYPE', apy: 2.15, tvlUsd: 540000000 }
          ]
        });
      }
      if (url.includes('eth.blockscout.com/api/v2/tokens/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')) {
        return jsonResponse({ holders_count: '492310', total_supply: (9450000n * 10n ** 18n).toString() });
      }
      if (url.includes('eth.blockscout.com/api/v2/tokens/0x9D39A5DE30e57443BfF2A8307A4256c8797A3497')) {
        return jsonResponse({ holders_count: '76540', total_supply: (1100000000n * 10n ** 18n).toString() });
      }
      if (url.includes('api.geckoterminal.com/api/v2/networks/base/tokens/0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB/info')) {
        return jsonResponse({ data: { attributes: { holders: { count: 14280 } } } });
      }
      if (url.includes('eth-api.lido.fi')) {
        return jsonResponse({ data: { smaApr: 3.1 } });
      }
      if (url.includes('aggregator-api.kyberswap.com/hyperevm/api/v1/routes')) {
        return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '950000000000000000' } } });
      }
      if (opts?.body) {
        const body = JSON.parse(opts.body);
        if (body.method === 'eth_call') {
          const to = String(body.params?.[0]?.to || '').toLowerCase();
          const data = String(body.params?.[0]?.data || '').toLowerCase();
          if (to === '0x9d39a5de30e57443bff2a8307a4256c8797a3497' && data === '0x01e1d114') {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(1250000000n * 10n ** 18n) });
          }
          if (to === '0x9d39a5de30e57443bff2a8307a4256c8797a3497' && data.startsWith('0x07a2d13a')) {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(1150000000000000000n) });
          }
          if (to === '0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298' && data === '0x01e1d114') {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(6500000n * 10n ** 6n) });
          }
          if (to === '0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298' && data.startsWith('0xef8b30f7')) {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(990000000000000000n) });
          }
          if (to === '0xfd739d4e423301ce9385c1fb8850539d657c296d' && data === '0x18160ddd') {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(19000000n * 10n ** 18n) });
          }
        }
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const pools = await chainContracts.fetchLiveStakingMetrics();
      const byId = Object.fromEntries(pools.map((p) => [p.id, p]));

      assert.equal(byId.lido_steth.stakersCount, 492310);
      assert.equal(byId.lido_steth.tvlText, '9.45M ETH ($24.50B)');

      assert.equal(byId.arc_steak_usdc.tvlText, '6.50M USDC ($6.50M)');

      assert.equal(byId.aave_base_usdc.stakersCount, 14280);
      assert.equal(byId.aave_base_usdc.tvlText, '18.20M USDC ($18.20M)');

      assert.equal(byId.ethena_susde.stakersCount, 76540);
      assert.equal(byId.ethena_susde.tvlText, '1.25B USDe ($1.25B)');

      // 19M kHYPE / 0.95 rate = 20.00M HYPE
      assert.equal(byId.hyper_khype.tvlText, '20.00M HYPE ($540.00M)');
    });
  } finally {
    state.setLanguage(prevLang);
  }
});

test('v2.8 Task 2: Multi-chain staking positions discovery (NEAR oRHEA + Solana JUP/Validator + EVM LSTs)', async () => {
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const solAddr = keys.solAddress;

  const voterProgId = 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj';
  const lockerAddr = 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN';
  const bs58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const decode58 = (str) => {
    const bytes = [0];
    for (const ch of str) {
      let carry = bs58Alphabet.indexOf(ch);
      for (let i = 0; i < bytes.length; i++) {
        carry += bytes[i] * 58;
        bytes[i] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    for (let i = 0; i < str.length && str[i] === '1'; i++) bytes.push(0);
    return new Uint8Array(bytes.reverse());
  };
  const escrowPda = await chainContracts.findSolanaPdaAsync(
    [new TextEncoder().encode('Escrow'), decode58(lockerAddr), decode58(solAddr)],
    decode58(voterProgId)
  );

  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/alice.near/full')) {
      return jsonResponse({ pools: [{ pool_id: 'astro-stakers.poolv1.near' }] });
    }
    if (url.includes('rpc.mainnet.near.org') && opts?.body) {
      const b = JSON.parse(opts.body);
      const acc = b.params?.account_id;
      const m = b.params?.method_name;
      if (acc === 'astro-stakers.poolv1.near' && m === 'get_account') {
        const resBytes = [...Buffer.from(JSON.stringify({
          staked_balance: (15n * 10n ** 24n).toString(),
          unstaked_balance: '0',
          can_withdraw: false
        }))];
        return jsonResponse({ jsonrpc: '2.0', result: { result: resBytes } });
      }
      if (acc === 'orhea-conv.rhealab.near' && m === 'get_account_conversions') {
        const resBytes = [...Buffer.from(JSON.stringify([
          { source_amount: (25n * 10n ** 18n).toString(), is_withdrawn: false },
          { source_amount: (10n * 10n ** 18n).toString(), is_withdrawn: true },
          { source_amount: (5n * 10n ** 18n).toString(), status: 'Locked' }
        ]))];
        return jsonResponse({ jsonrpc: '2.0', result: { result: resBytes } });
      }
    }
    if (url.includes('solana') && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b.method === 'getAccountInfo' && b.params?.[0] === escrowPda.address) {
        const buf = Buffer.alloc(136);
        buf.writeBigUInt64LE(123450000n, 105); // 123.45 JUP
        return jsonResponse({ jsonrpc: '2.0', result: { value: { data: [buf.toString('base64'), 'base64'] } } });
      }
      if (b.method === 'getProgramAccounts' && b.params?.[0] === 'Stake11111111111111111111111111111111111111') {
        return jsonResponse({
          jsonrpc: '2.0',
          result: [
            {
              pubkey: 'StakeAcc11111111111111111111111111111111111',
              account: {
                lamports: 2500000000, // 2.5 SOL
                data: { parsed: { info: { stake: { delegation: { voter: 'JitoValidator111111111111111' } } } } }
              }
            }
          ]
        });
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const nearPos = await chainContracts.fetchNearAccountStakingPositionsAsync('alice.near');
    assert.equal(nearPos.length, 2);
    const valPos = nearPos.find((p) => p.type === 'validator');
    const convPos = nearPos.find((p) => p.type === 'lock_convert');
    assert.equal(valPos.poolId, 'astro-stakers.poolv1.near');
    assert.equal(valPos.totalNear, 15);
    assert.equal(convPos.poolId, 'rhea_orhea_convert');
    assert.equal(convPos.contractId, 'orhea-conv.rhealab.near');
    assert.equal(convPos.symbol, 'oRHEA');
    assert.equal(convPos.totalAmount, 30);

    const solPos = await chainContracts.fetchSolanaAccountStakingPositionsAsync(solAddr);
    assert.equal(solPos.length, 2);
    const jupPos = solPos.find((p) => p.type === 'jupiter_dao');
    const solValPos = solPos.find((p) => p.type === 'sol_validator');
    assert.equal(jupPos.symbol, 'JUP');
    assert.equal(jupPos.amount, 123.45);
    assert.equal(jupPos.subtitle, escrowPda.address);
    assert.equal(solValPos.symbol, 'SOL');
    assert.equal(solValPos.title, 'JitoValidator111111111111111');
    assert.equal(solValPos.amount, 2.5);

    // Verify renderEarnView renders all 5 categories into #earn-my-positions-list
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const domMap = new Map();
    const makeEl = (id) => {
      const classes = new Set();
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => (force ? classes.add(c) : classes.delete(c)),
          contains: (c) => classes.has(c)
        },
        getAttribute: () => null
      };
      domMap.set(id, el);
      return el;
    };
    ['earn-my-positions-card', 'earn-my-positions-list', 'earn-my-positions-count', 'staking-pools-list'].forEach(makeEl);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };

    try {
      const testWallet = state.normalizeWalletRecord({
        id: 'w_earn_positions',
        name: 'Positions Test',
        nearNamedAccount: 'alice.near',
        solAddress: solAddr,
        nearStakingPositions: nearPos,
        solStakingPositions: solPos,
        nearNep141Balances: { 'lst.rhealab.near': { raw: '5000000000000000000000000', formatted: 5 } },
        splBalances: { J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: 3.25 },
        erc20Balances: {
          eth: {
            '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': 1.5,
            '0x9d39a5de30e57443bff2a8307a4256c8797a3497': 200
          },
          base: { '0x4e65fe4dba92790696d040ac24aa414708f5c0ab': 500 },
          arc: { '0xbeef0016cb2fd5c352ea7ca08a9f54739dfa7298': 250 },
          hype: { '0xfd739d4e423301ce9385c1fb8850539d657c296d': 12.5 }
        }
      });
      state.wallets = [testWallet];
      state.activeWalletId = testWallet.id;
      uiController.renderEarnView();

      const card = domMap.get('earn-my-positions-card');
      const countEl = domMap.get('earn-my-positions-count');
      const listHtml = domMap.get('earn-my-positions-list').innerHTML;

      assert.equal(card.classList.contains('hidden'), false);
      assert.equal(countEl.textContent, '11');
      for (const expected of [
        'astro-stakers.poolv1.near',
        'Rhea oRHEA Convert',
        '30 oRHEA',
        '5 rNEAR',
        'Jupiter DAO (ASR)',
        '123.45 JUP',
        'JitoValidator111111111111111',
        '2.5 SOL',
        '3.25 JitoSOL',
        'Lido Staked ETH',
        '1.5 stETH',
        'Ethena Staked USDe',
        '200 sUSDe',
        'Aave V3 Base USDC',
        '500 aBasUSDC',
        'Steakhouse Prime USDC',
        '250 steakUSDC',
        'Kinetiq Staked HYPE',
        '12.5 kHYPE'
      ]) {
        assert.ok(listHtml.includes(expected), `Expected position output to include ${expected}`);
      }
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
    }
  });
});

test('v2.8 Task 3: Human-readable minimum bridge amount error in quoteRawOneClick', async () => {
  const prevLang = state.lang;
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('1click.chaindefuser.com/v0/quote')) {
        const body = JSON.parse(opts.body);
        if (body.originAsset === 'nep141:wrap.near') {
          return jsonResponse({ message: 'Amount is too low for bridge, try at least 500000000000000000000000' }, 400);
        }
        return jsonResponse({ message: 'Amount is too low for bridge, try at least 12345678' }, 400);
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      state.setLanguage('en');
      const qEn = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:sol.omft.near',
        amountRaw: '10000000000000000000000',
        recipient: '7xLk17EQQ5KLDLDe44wCmupJKJjTGd8hs3eSVVhCx932',
        refundTo: 'alice.near'
      });
      assert.equal(qEn.ok, false);
      assert.equal(qEn.error, 'Amount too low for bridge (min ~0.5)');

      state.setLanguage('zh');
      const qZh = await nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        destinationAsset: 'nep141:sol.omft.near',
        amountRaw: '1000000',
        recipient: '7xLk17EQQ5KLDLDe44wCmupJKJjTGd8hs3eSVVhCx932',
        refundTo: 'alice.near'
      });
      assert.equal(qZh.ok, false);
      assert.equal(qZh.error, '跨链金额过低，最低需约 12.3457');
    });
  } finally {
    state.setLanguage(prevLang);
  }
});

test('v2.9: OKX-style Token Detail Sheet (openTokenDetailSheet, setTokenDetailChain, earn matching, recordWalletActivity & auto-sync)', async () => {
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="sheet-token-detail"'), 'index.html must include #sheet-token-detail');

  for (const fnName of [
    'openTokenDetailSheet',
    'setTokenDetailChain',
    'tokenDetailAction',
    'copyTokenDetailAddress',
    'startAutoPriceAndBalanceSync',
    'recordWalletActivity'
  ]) {
    assert.equal(typeof uiController[fnName], 'function', `uiController.${fnName} must be exported`);
    assert.equal(typeof globalThis[fnName], 'function', `globalThis.${fnName} must be exported`);
  }

  await withMockedStorage({}, async () => {
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const prevLiveTokens = state.liveTokens;
    const prevLang = state.lang;

    const wallet = state.normalizeWalletRecord({
      id: 'w_v29_detail',
      name: 'DetailTest',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nearAddress: 'a'.repeat(64),
      nativeBalances: { near: 12.5, prl: 100, sol: 3.2 },
      nearNep141Balances: {
        'prl.omft.near': { raw: '5000000000', formatted: 50 }
      }
    });
    state.wallets = [wallet];
    state.activeWalletId = wallet.id;
    state.liveTokens = [
      { symbol: 'PRL', blockchain: 'near', price: 0.42 },
      { symbol: 'NEAR', blockchain: 'near', price: 3.5 }
    ];
    state.setLanguage('zh');

    const domMap = new Map();
    const makeEl = (id) => {
      const classes = new Set();
      if (id === 'token-detail-earn-card') classes.add('hidden');
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        href: '#',
        attributes: {},
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
          contains: (c) => classes.has(c)
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k] || null; }
      };
      domMap.set(id, el);
      return el;
    };

    [
      'home-unified-asset-list',
      'hero-total-usd',
      'sheet-backdrop',
      'sheet-token-detail',
      'token-detail-icon',
      'token-detail-title',
      'token-detail-chains',
      'token-detail-balance',
      'token-detail-usd',
      'token-detail-addr-row',
      'token-detail-addr',
      'token-detail-explorer-link',
      'token-detail-breakdown-card',
      'token-detail-breakdown-list',
      'token-detail-earn-card',
      'token-detail-earn-list',
      'token-detail-history-list',
      'token-detail-price-label',
      'token-detail-price-val'
    ].forEach(makeEl);

    globalThis.document = {
      documentElement: { lang: 'zh-CN' },
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };

    try {
      // 1. Home list hides chain mini-pills and opens Token Detail Sheet on click
      uiController.renderUnifiedAssetList();
      const homeHtml = domMap.get('home-unified-asset-list').innerHTML;
      assert.ok(homeHtml.includes('data-action="open-token-detail" data-symbol="PRL"'));
      assert.equal(homeHtml.includes('net-mini-pill'), false, 'Home list must not render net-mini-pill');

      // 2. Record local wallet activity & verify normalization preserves activityHistory
      const act = uiController.recordWalletActivity(wallet, {
        type: 'swap',
        symbol: 'PRL',
        toSymbol: 'USDC',
        chain: 'near',
        amount: 25,
        txHash: 'LocalTxHash1111111111111111',
        title: 'PRL ➔ USDC'
      });
      assert.ok(act && act.id);
      const reNormalized = state.normalizeWalletRecord(JSON.parse(JSON.stringify(wallet)));
      assert.equal(reNormalized.activityHistory.length, 1);
      assert.equal(reNormalized.activityHistory[0].txHash, 'LocalTxHash1111111111111111');

      // 3. Open Token Detail Sheet for PRL with mocked explorer APIs
      await withMockedFetch(async (url) => {
        if (url.includes('api.prlscan.com/v1/addresses/')) {
          return jsonResponse({
            txs: [
              { txid: 'prl_tx_001', time: 1700000100, delta_grains: '2500000000', is_coinbase: true }
            ]
          });
        }
        if (url.includes('api.nearblocks.io/v1/account/alice.near/ft-txns')) {
          return jsonResponse({
            txns: [
              {
                transaction_hash: 'near_ft_001',
                block_timestamp: '1700000200000000000',
                delta_amount: '5000000000',
                contract: 'prl.omft.near',
                involved_account_id: 'bridge.near',
                ft: { symbol: 'PRL', decimals: 8 }
              }
            ]
          });
        }
        if (url.includes('api.nearblocks.io/v1/account/alice.near/txns')) {
          return jsonResponse({ txns: [] });
        }
        return jsonResponse({}, 404, 'Not Found');
      }, async () => {
        uiController.openTokenDetailSheet('PRL');
        assert.equal(domMap.get('sheet-token-detail').classList.contains('open'), true);
        assert.equal(domMap.get('token-detail-title').textContent, 'PRL');
        assert.equal(domMap.get('token-detail-balance').textContent, '150');
        assert.equal(domMap.get('token-detail-usd').textContent, '$63.00');
        assert.ok(domMap.get('token-detail-chains').innerHTML.includes('data-action="set-token-detail-chain" data-chain="all"'));
        assert.ok(domMap.get('token-detail-chains').innerHTML.includes('data-action="set-token-detail-chain" data-chain="prl"'));
        assert.ok(domMap.get('token-detail-chains').innerHTML.includes('data-action="set-token-detail-chain" data-chain="near"'));
        assert.equal(domMap.get('token-detail-breakdown-card').classList.contains('hidden'), false);
        assert.ok(domMap.get('token-detail-breakdown-list').innerHTML.includes('Pearl Network'));

        // Let background fetch settle
        await new Promise((r) => setTimeout(r, 30));
        const histHtml = domMap.get('token-detail-history-list').innerHTML;
        assert.ok(histHtml.includes('PRL ➔ USDC'), 'Local activity must appear in history');
        assert.ok(histHtml.includes('prl_tx_001'), 'Pearl L1 history must appear');
        assert.ok(histHtml.includes('near_ft_001'), 'NEAR NEP-141 history must appear');

        // 4. Filter by 'prl' chain
        uiController.setTokenDetailChain('prl');
        assert.equal(domMap.get('token-detail-balance').textContent, '100');
        assert.equal(domMap.get('token-detail-addr').textContent, wallet.address);
        assert.ok(domMap.get('token-detail-explorer-link').href.includes('prlscan.com/address/'));
        assert.equal(domMap.get('token-detail-breakdown-card').classList.contains('hidden'), true);
        await new Promise((r) => setTimeout(r, 30));

        // 5. Open NEAR Token Detail Sheet and verify Earn pool matching
        uiController.openTokenDetailSheet('NEAR');
        const earnCard = domMap.get('token-detail-earn-card');
        const earnHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.equal(earnCard.classList.contains('hidden'), false, 'NEAR detail sheet must unhide Earn section');
        assert.ok(earnHtml.includes('rhea_rnear'), 'NEAR detail sheet must list Rhea rNEAR pool');
        assert.ok(earnHtml.includes('NEAR ➔ rNEAR'));
        await new Promise((r) => setTimeout(r, 30));
      });

      // 6. Auto-sync timer starts and clears cleanly
      const timerId = uiController.startAutoPriceAndBalanceSync();
      assert.ok(timerId);
      clearInterval(timerId);
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
      state.liveTokens = prevLiveTokens;
      state.setLanguage(prevLang);
    }
  });
});

test('v3.0: Pill-scroll CSS, address-row visibility, chain-scoped earn/staking grouping, Solana partial RPC fallback, wrapped L1 exclusion & Aave Eth/Arb pools', async () => {
  // 1. CSS checks for .pill-scroll & .filter-pill
  const css = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.ok(/\.pill-scroll\s*\{[^}]*flex-shrink:\s*0;[^}]*min-height:\s*34px;/s.test(css), '.pill-scroll must prevent vertical squishing');
  assert.ok(/\.filter-pill\s*\{[^}]*flex-shrink:\s*0;/s.test(css), '.filter-pill must have flex-shrink: 0');

  // 2. fetchSolanaNativeAndSplBalances still returns nativeSol when getTokenAccountsByOwner fails/rate-limits
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  await withMockedFetch(async (_url, opts) => {
    const b = JSON.parse(opts.body);
    if (b.method === 'getBalance') {
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: 250000000 } });
    }
    if (b.method === 'getTokenAccountsByOwner') {
      return jsonResponse({ error: { code: 429, message: 'Too many requests' } }, 429);
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const solRes = await chainContracts.fetchSolanaNativeAndSplBalances(keys.solAddress, []);
    assert.ok(solRes, 'fetchSolanaNativeAndSplBalances must succeed when getTokenAccountsByOwner fails');
    assert.equal(solRes.nativeSol, 0.25);
  });

  // 3. Aave V3 Ethereum & Arbitrum USDC pools live metrics from DefiLlama + category filter
  await withMockedFetch(async (url) => {
    if (url.includes('yields.llama.fi/pools')) {
      return jsonResponse({
        data: [
          { chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', apy: 4.35, tvlUsd: 3200000000 },
          { chain: 'Arbitrum', project: 'aave-v3', symbol: 'USDC', apy: 5.12, tvlUsd: 240000000 }
        ]
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const prevLang = state.lang;
    state.setLanguage('en');
    try {
      const pools = await chainContracts.fetchLiveStakingMetrics();
      const byId = Object.fromEntries(pools.map((p) => [p.id, p]));
      assert.equal(byId.aave_eth_usdc.category, 'lending');
      assert.equal(byId.aave_eth_usdc.apy, 4.35);
      assert.equal(byId.aave_eth_usdc.rate, 1.0);
      assert.equal(byId.aave_eth_usdc.tvlText, '3.20B USDC ($3.20B)');
      assert.equal(byId.aave_arb_usdc.category, 'lending');
      assert.equal(byId.aave_arb_usdc.apy, 5.12);
      assert.equal(byId.aave_arb_usdc.rate, 1.0);
      assert.equal(byId.aave_arb_usdc.tvlText, '240.00M USDC ($240.00M)');
    } finally {
      state.setLanguage(prevLang);
    }
  });

  // 4. buildAllOnChainAssetGroups: Wrapped SOL (BSC) excluded unless > 0, loaded ERC-20 chains default null -> 0
  await withMockedStorage({}, async () => {
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const prevLang = state.lang;

    const w = state.normalizeWalletRecord({
      id: 'w_v30_test',
      name: 'V30Test',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nativeBalances: { near: 5, sol: 0, bsc: 0, eth: 0 },
      erc20Balances: {}
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.setLanguage('en');

    const groups = uiController.buildAllOnChainAssetGroups(w);
    const solGrp = groups.find((g) => g.symbolKey === 'SOL');
    assert.ok(solGrp);
    assert.equal(solGrp.entries.some((e) => e.blockchain === 'bsc'), false, 'Wrapped SOL (BSC) at 0 must not merge into SOL');
    const solNative = solGrp.entries.find((e) => e.blockchain === 'sol');
    assert.equal(solNative.balance, 0);

    const usdcGrp = groups.find((g) => g.symbolKey === 'USDC');
    const ethUsdc = usdcGrp.entries.find((e) => e.blockchain === 'eth');
    assert.equal(ethUsdc.balance, 0, 'Loaded EVM chain ERC-20 entry must default to 0 instead of null');

    // 5. Token detail sheet: addr row hidden on 'all', visible on specific chain, earn pools strictly chain-scoped & separated
    const domMap = new Map();
    const makeEl = (id) => {
      const classes = new Set();
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        href: '#',
        attributes: {},
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
          contains: (c) => classes.has(c)
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k] || null; }
      };
      domMap.set(id, el);
      return el;
    };
    [
      'sheet-backdrop', 'sheet-token-detail', 'token-detail-icon', 'token-detail-title',
      'token-detail-chains', 'token-detail-balance', 'token-detail-usd',
      'token-detail-addr-row', 'token-detail-addr', 'token-detail-explorer-link',
      'token-detail-breakdown-card', 'token-detail-breakdown-list',
      'token-detail-earn-card', 'token-detail-earn-list', 'token-detail-history-list',
      'token-detail-price-label', 'token-detail-price-val',
      'staking-pools-list', 'earn-selected-title', 'earn-avail-balance',
      'earn-in-symbol', 'earn-live-apy', 'earn-tvl-val', 'earn-stakers-val',
      'earn-live-rate', 'earn-amount-in', 'earn-est-out', 'earn-lock-row', 'earn-lock-tiers'
    ].forEach(makeEl);

    globalThis.document = {
      documentElement: { lang: 'en' },
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };

    try {
      await withMockedFetch(async () => jsonResponse({}, 404, 'Not Found'), async () => {
        uiController.openTokenDetailSheet('SOL');
        assert.equal(domMap.get('token-detail-addr-row').classList.contains('hidden'), true, 'addr-row must be hidden on all networks');
        uiController.setTokenDetailChain('sol');
        assert.equal(domMap.get('token-detail-addr-row').classList.contains('hidden'), false, 'addr-row must show on sol network');
        assert.equal(domMap.get('token-detail-earn-card').classList.contains('hidden'), false, 'Solana staking pools must show on sol');
        assert.ok(domMap.get('token-detail-earn-list').innerHTML.includes('jito_sol'));

        uiController.setTokenDetailChain('near');
        assert.equal(domMap.get('token-detail-addr-row').classList.contains('hidden'), false, 'addr-row must show on near network');
        assert.equal(domMap.get('token-detail-earn-card').classList.contains('hidden'), true, 'Solana SOL pools must not appear when near network is selected');

        uiController.openTokenDetailSheet('ETH');
        const ethEarnHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.ok(ethEarnHtml.includes('Staking'), 'Staking card header must render for ETH');
        assert.ok(ethEarnHtml.includes('Lending &amp; Earn'), 'Lending & Earn card header must render for ETH (aave_eth_weth)');
        assert.ok(ethEarnHtml.includes('lido_steth'));
        assert.ok(ethEarnHtml.includes('aave_eth_weth'));

        uiController.openTokenDetailSheet('USDC');
        const usdcAllEarnHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.ok(usdcAllEarnHtml.includes('Lending &amp; Earn'), 'Lending & Earn card header must render for USDC');
        assert.equal(usdcAllEarnHtml.includes('⚡'), false);
        assert.ok(usdcAllEarnHtml.includes('aave_eth_usdc'));
        assert.ok(usdcAllEarnHtml.includes('aave_arb_usdc'));

        uiController.setTokenDetailChain('eth');
        const usdcEthHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.ok(usdcEthHtml.includes('aave_eth_usdc'));
        assert.equal(usdcEthHtml.includes('aave_arb_usdc'), false, 'Chain filter eth must exclude Arbitrum Aave pool');
        assert.equal(usdcEthHtml.includes('aave_base_usdc'), false, 'Chain filter eth must exclude Base Aave pool');

        // 6. Earn View lending filter & category badge
        uiController.setEarnPoolFilter('lending');
        const lendingHtml = domMap.get('staking-pools-list').innerHTML;
        assert.ok(lendingHtml.includes('burrow_near_wnear'));
        assert.ok(lendingHtml.includes('burrow_near_usdt'));
        assert.ok(lendingHtml.includes('aave_eth_weth'));
        assert.ok(lendingHtml.includes('aave_eth_usdc'));
        assert.ok(lendingHtml.includes('aave_arb_usdc'));
        assert.ok(lendingHtml.includes('aave_base_usdc'));
        assert.ok(lendingHtml.includes('arc_steak_usdc'));
        assert.ok(lendingHtml.includes('ethena_susde'));
        assert.equal(lendingHtml.includes('jito_sol'), false, 'Lending filter must exclude liquid staking pools');
        assert.ok(lendingHtml.includes('pool-cat-badge cat-lending'));
        assert.ok(lendingHtml.includes('pool-cat-badge cat-vault'));
      });
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
      state.setLanguage(prevLang);
    }
  });
});

test('v3.1: Burrow NEAR/USDT & Aave ETH lending pools, EVM holder counts, localStorage metric/price caching, progressive sync & fast quote cap', async () => {
  const prevLang = state.lang;
  state.setLanguage('en');

  // 1. Live Burrow RPC + Aave ETH/Arb holder counts + 60s TTL cache
  let llamaFetches = 0;
  await withMockedFetch(async (url, opts) => {
    if (url.includes('yields.llama.fi/pools')) {
      llamaFetches += 1;
      return jsonResponse({
        data: [
          { chain: 'Ethereum', project: 'aave-v3', symbol: 'USDC', apy: 4.35, tvlUsd: 3200000000 },
          { chain: 'Arbitrum', project: 'aave-v3', symbol: 'USDC', apy: 5.12, tvlUsd: 240000000 },
          { chain: 'Ethereum', project: 'aave-v3', symbol: 'WETH', apy: 1.44, tvlUsd: 559214208 },
          { chain: 'Near', project: 'rhea-lend', symbol: 'USDT', apy: 12.6, tvlUsd: 1495604 }
        ]
      });
    }
    if (url.includes('eth.blockscout.com/api/v2/tokens/0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c')) {
      return jsonResponse({ holders_count: '29029' });
    }
    if (url.includes('eth.blockscout.com/api/v2/tokens/0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8')) {
      return jsonResponse({ holders_count: '47849', total_supply: (2358553n * 10n ** 18n).toString() });
    }
    if (url.includes('api.geckoterminal.com/api/v2/networks/arbitrum/tokens/0x724dc807b04555b71ed48a6896b6f41593b8c637/info')) {
      return jsonResponse({ data: { attributes: { holders: { count: 39704 } } } });
    }
    if (url.includes('rpc.mainnet.near.org') && opts?.body) {
      const b = JSON.parse(opts.body);
      const acc = b.params?.account_id;
      const m = b.params?.method_name;
      if (acc === 'contract.main.burrow.near' && m === 'get_num_accounts') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: [...Buffer.from(JSON.stringify(73069))] } });
      }
      if (acc === 'contract.main.burrow.near' && m === 'get_asset') {
        const args = JSON.parse(Buffer.from(b.params.args_base64, 'base64').toString());
        if (args.token_id === 'wrap.near') {
          return jsonResponse({
            jsonrpc: '2.0',
            result: {
              result: [...Buffer.from(JSON.stringify({
                token_id: 'wrap.near',
                supplied: { balance: (3244651n * 10n ** 24n).toString() },
                config: { extra_decimals: 0 },
                supply_apr: '0.002323'
              }))]
            }
          });
        }
        if (args.token_id === 'usdt.tether-token.near') {
          return jsonResponse({
            jsonrpc: '2.0',
            result: {
              result: [...Buffer.from(JSON.stringify({
                token_id: 'usdt.tether-token.near',
                supplied: { balance: (11041935n * 10n ** 18n).toString() },
                config: { extra_decimals: 12 },
                supply_apr: '0.125949'
              }))]
            }
          });
        }
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const pools = await chainContracts.fetchLiveStakingMetrics();
    assert.equal(llamaFetches, 1);
    const byId = Object.fromEntries(pools.map((p) => [p.id, p]));
    assert.equal(byId.aave_eth_usdc.stakersCount, 29029);
    assert.equal(byId.aave_arb_usdc.stakersCount, 39704);
    assert.equal(byId.aave_eth_weth.apy, 1.44);
    assert.equal(byId.aave_eth_weth.stakersCount, 47849);
    assert.equal(byId.aave_eth_weth.tvlText, '2.36M ETH ($559.21M)');
    assert.equal(byId.burrow_near_wnear.apy, 0.23);
    assert.equal(byId.burrow_near_wnear.stakersCount, 73069);
    assert.ok(byId.burrow_near_wnear.tvlText.includes('3.24M NEAR'));
    assert.equal(byId.burrow_near_usdt.apy, 12.6);
    assert.equal(byId.burrow_near_usdt.stakersCount, 73069);
    assert.ok(byId.burrow_near_usdt.tvlText.includes('11.04M USDT'));

    // Subsequent call with { useCache: true } must hit 60s TTL cache without calling DefiLlama again
    await chainContracts.fetchLiveStakingMetrics({ useCache: true });
    assert.equal(llamaFetches, 1);
  });

  // 2. Burrow NEAR executeOnChainStaking: wraps native NEAR via near_deposit -> ft_transfer_call
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const burrowWallet = state.normalizeWalletRecord({
    id: 'w_burrow_test',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nativeBalances: { near: 5.0 },
    nearNep141Balances: { 'usdt.tether-token.near': { raw: '10000000', formatted: 10 } }
  });
  const burrowCalls = [];
  const origNearSend = chainContracts.signAndSendNearFunctionCall;
  chainContracts.signAndSendNearFunctionCall = async (params) => {
    burrowCalls.push(params);
    return `tx_${params.receiverId}_${params.methodName}`;
  };
  try {
    await withMockedFetch(async () => jsonResponse({}, 404, 'Not Found'), async () => {
      const resNear = await chainContracts.executeOnChainStaking({ wallet: burrowWallet, poolId: 'burrow_near_wnear', amount: 2 });
      assert.equal(resNear.poolId, 'burrow_near_wnear');
      assert.equal(burrowCalls.length, 2);
      assert.equal(burrowCalls[0].receiverId, 'wrap.near');
      assert.equal(burrowCalls[0].methodName, 'near_deposit');
      assert.equal(burrowCalls[0].depositYocto, chainContracts.toBaseUnits(2, 24));
      assert.equal(burrowCalls[1].receiverId, 'wrap.near');
      assert.equal(burrowCalls[1].methodName, 'ft_transfer_call');
      assert.equal(JSON.parse(burrowCalls[1].argsJson).receiver_id, 'contract.main.burrow.near');

      const resUsdt = await chainContracts.executeOnChainStaking({ wallet: burrowWallet, poolId: 'burrow_near_usdt', amount: 5 });
      assert.equal(resUsdt.poolId, 'burrow_near_usdt');
      assert.equal(burrowCalls[2].receiverId, 'usdt.tether-token.near');
      assert.equal(burrowCalls[2].methodName, 'ft_transfer_call');
      assert.equal(JSON.parse(burrowCalls[2].argsJson).receiver_id, 'contract.main.burrow.near');
    });
  } finally {
    chainContracts.signAndSendNearFunctionCall = origNearSend;
  }

  // 3. localStorage cache persistence & 0ms hydration for liveTokens + staking metrics
  await withMockedStorage({}, async () => {
    const prevLiveTokens = state.liveTokens;
    const prevStakingPools = state.staking.pools;
    const prevStakingUpdatedAt = state.staking.updatedAt;
    try {
      state.saveCachedLiveTokens([{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', price: 4.56 }]);
      state.saveCachedStakingMetrics(chainContracts.STAKING_POOLS);
      state.liveTokens = [];
      state.staking.pools = null;
      state.staking.updatedAt = null;
      state.initState();
      assert.equal(state.liveTokens.length, 1);
      assert.equal(state.liveTokens[0].price, 4.56);
      assert.ok(Array.isArray(state.staking.pools));
      assert.ok(state.staking.updatedAt > 0);
    } finally {
      state.liveTokens = prevLiveTokens;
      state.staking.pools = prevStakingPools;
      state.staking.updatedAt = prevStakingUpdatedAt;
    }
  });

  // 4. openTokenDetailSheet triggers background staking metrics fetch when stale and re-renders live APY + separate cards
  await withMockedStorage({}, async () => {
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const prevPools = state.staking.pools;
    const prevUpdatedAt = state.staking.updatedAt;
    state.staking.pools = null;
    state.staking.updatedAt = null;
    state.staking.loading = false;
    const w = state.normalizeWalletRecord({
      id: 'w_detail_auto_apy',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nativeBalances: { near: 3 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    const domMap = new Map();
    const makeEl = (id) => {
      const classes = new Set();
      const el = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        href: '#',
        attributes: {},
        classList: {
          add: (c) => classes.add(c),
          remove: (c) => classes.delete(c),
          toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c))),
          contains: (c) => classes.has(c)
        },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k] || null; }
      };
      domMap.set(id, el);
      return el;
    };
    [
      'sheet-backdrop', 'sheet-token-detail', 'token-detail-icon', 'token-detail-title',
      'token-detail-chains', 'token-detail-balance', 'token-detail-usd',
      'token-detail-addr-row', 'token-detail-addr', 'token-detail-explorer-link',
      'token-detail-breakdown-card', 'token-detail-breakdown-list',
      'token-detail-earn-card', 'token-detail-earn-list', 'token-detail-history-list',
      'token-detail-price-label', 'token-detail-price-val',
      'staking-pools-list', 'earn-selected-title', 'earn-avail-balance',
      'earn-in-symbol', 'earn-live-apy', 'earn-tvl-val', 'earn-stakers-val',
      'earn-live-rate', 'earn-amount-in', 'earn-est-out', 'earn-lock-row', 'earn-lock-tiers'
    ].forEach(makeEl);
    globalThis.document = {
      documentElement: { lang: 'en' },
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };

    try {
      await withMockedFetch(async (url) => {
        if (url.includes('api.ref.finance/get-rnear-apy')) return jsonResponse({ data: 5.55 });
        return jsonResponse({}, 404, 'Not Found');
      }, async () => {
        uiController.openTokenDetailSheet('NEAR');
        await new Promise((r) => setTimeout(r, 40));
        const earnHtml = domMap.get('token-detail-earn-list').innerHTML;
        assert.ok(earnHtml.includes('rhea_rnear'));
        assert.ok(earnHtml.includes('burrow_near_wnear'));
        assert.ok(earnHtml.includes('5.55%'), 'Background staking refresh must re-render live APY in open Token Detail Sheet');
        assert.equal((earnHtml.match(/ios-glass-card/g) || []).length, 2, 'NEAR must render two separate cards for Staking and Lending & Earn');
      });
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
      state.staking.pools = prevPools;
      state.staking.updatedAt = prevUpdatedAt;
      state.setLanguage(prevLang);
    }
  });
});

test('v3.2: Pool icons on all 21 pools, Burrow TVL USD consistency, silent home sync UI, and iOS workflow git-add fix', async () => {
  // 1. All 21 STAKING_POOLS have valid non-blocked icon URLs & TOKEN_ICON_MAP covers bNEAR/bUSDT/bUSDC/aEthUSDC/aArbUSDCn/aBasUSDC/aEthWETH/steakUSDC
  assert.equal(chainContracts.STAKING_POOLS.length, 21);
  for (const p of chainContracts.STAKING_POOLS) {
    assert.ok(typeof p.icon === 'string' && p.icon.length > 0 && Boolean(tokenRegistry.sanitizeImageUrl(p.icon)), `Pool ${p.id} must have a valid sanitized icon URL`);
    assert.ok(!p.icon.includes('raw.githubusercontent.com') && !p.icon.includes('assets.coingecko.com'), `Pool ${p.id} must not depend on GFW-blocked domains`);
  }
  for (const sym of ['BNEAR', 'BUSDT', 'BUSDC', 'AETHUSDC', 'AARBUSDCN', 'ABASUSDC', 'AETHWETH', 'STEAKUSDC']) {
    assert.ok(tokenRegistry.TOKEN_ICON_MAP[sym], `TOKEN_ICON_MAP must include ${sym}`);
  }

  // 2. Burrow USDT TVL uses 1.0 USD per USDT on supplied.balance, and Burrow NEAR TVL includes ($USD) via live NEAR price
  const prevLang = state.lang;
  const prevLiveTokens = state.liveTokens;
  state.setLanguage('en');
  state.liveTokens = [{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', price: 3.0 }];
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('yields.llama.fi/pools')) {
        return jsonResponse({
          data: [{ chain: 'Near', project: 'rhea-lend', symbol: 'USDT', apy: 12.6, tvlUsd: 1495604 }]
        });
      }
      if (url.includes('rpc.mainnet.near.org') && opts?.body) {
        const b = JSON.parse(opts.body);
        if (b.params?.account_id === 'contract.main.burrow.near' && b.params?.method_name === 'get_asset') {
          const args = JSON.parse(Buffer.from(b.params.args_base64, 'base64').toString());
          if (args.token_id === 'wrap.near') {
            return jsonResponse({
              jsonrpc: '2.0',
              result: {
                result: [...Buffer.from(JSON.stringify({
                  token_id: 'wrap.near',
                  supplied: { balance: (3240000n * 10n ** 24n).toString() },
                  config: { extra_decimals: 0 },
                  supply_apr: '0.0023'
                }))]
              }
            });
          }
          if (args.token_id === 'usdt.tether-token.near') {
            return jsonResponse({
              jsonrpc: '2.0',
              result: {
                result: [...Buffer.from(JSON.stringify({
                  token_id: 'usdt.tether-token.near',
                  supplied: { balance: (11040000n * 10n ** 18n).toString() },
                  config: { extra_decimals: 12 },
                  supply_apr: '0.126'
                }))]
              }
            });
          }
        }
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const pools = await chainContracts.fetchLiveStakingMetrics();
      const byId = Object.fromEntries(pools.map((p) => [p.id, p]));
      assert.equal(byId.burrow_near_usdt.tvlText, '11.04M USDT ($11.04M)');
      assert.equal(byId.burrow_near_wnear.tvlText, '3.24M NEAR ($9.72M)');
    });
  } finally {
    state.liveTokens = prevLiveTokens;
    state.setLanguage(prevLang);
  }

  // 3. Pull-to-Refresh replaces hidden manual refresh button + build-ios-ipa.yml git add fix
  const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.ok(html.includes('id="home-ptr-indicator"'), 'Home view must include Pull-to-Refresh indicator');
  assert.equal(html.includes('id="btn-refresh-balances"'), false, 'Hidden manual refresh button must be removed');
  assert.equal(html.includes('id="home-sync-status"'), false, 'Legacy hidden sync status must be removed');

  const iosYml = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'build-ios-ipa.yml'), 'utf8');
  assert.equal(iosYml.includes('git add sidestore-source.json build/NEAR-CA-Wallet-unsigned.ipa'), false, 'Workflow must not git add ignored build/ IPA');
  assert.ok(iosYml.includes('git add sidestore-source.json'), 'Workflow must git add sidestore-source.json');
  assert.ok(iosYml.includes('git pull --rebase') && iosYml.includes('origin main && git push'), 'Workflow must rebase before pushing');
});

test('v3.3: Zero-GFW-block distinct pool icons, server Cache-Control no-store, staking cache v3, and tvlTokenAmount ($USD) on NEAR/JUP pools', async () => {
  // 1. All 21 pools resolve a valid non-empty primaryUrl via resolveTokenIcon and avoid GFW-blocked CDNs
  assert.equal(chainContracts.STAKING_POOLS.length, 21);
  for (const p of chainContracts.STAKING_POOLS) {
    const sanitized = tokenRegistry.sanitizeImageUrl(p.icon);
    assert.ok(sanitized, `Pool ${p.id} icon must pass sanitizeImageUrl`);
    const resolved = tokenRegistry.resolveTokenIcon({ symbol: p.outSymbol, blockchain: p.chain, logoURI: p.icon });
    assert.ok(resolved.primaryUrl && resolved.primaryUrl.length > 0, `Pool ${p.id} resolveTokenIcon must return primaryUrl`);
    assert.ok(!resolved.primaryUrl.includes('raw.githubusercontent.com'), `Pool ${p.id} must not use raw.githubusercontent.com`);
    assert.ok(!resolved.primaryUrl.includes('assets.coingecko.com'), `Pool ${p.id} must not use assets.coingecko.com`);
  }

  // Distinct icons across the 6 NEAR staking pools + Burrow NEAR vs Burrow USDT
  const nearPools = ['rhea_rnear', 'rhea_xrhea', 'rhea_orhea_convert', 'metapool_stnear', 'linear_near', 'stader_nearx']
    .map((id) => chainContracts.STAKING_POOLS.find((p) => p.id === id)?.icon);
  assert.equal(new Set(nearPools).size, 6, 'All 6 NEAR staking pools must have distinct protocol logos');
  const byPool = Object.fromEntries(chainContracts.STAKING_POOLS.map((p) => [p.id, p]));
  assert.notEqual(byPool.burrow_near_wnear.icon, byPool.burrow_near_usdt.icon, 'Burrow NEAR and Burrow USDT must have distinct icons');

  for (const sym of ['BNEAR', 'BUSDT', 'BUSDC', 'AETHUSDC', 'AARBUSDCN', 'ABASUSDC', 'AETHWETH', 'STEAKUSDC', 'STAKED JUP', 'JUP']) {
    const mapped = tokenRegistry.TOKEN_ICON_MAP[sym];
    assert.ok(mapped && tokenRegistry.sanitizeImageUrl(mapped), `TOKEN_ICON_MAP[${sym}] must be sanitized`);
    assert.ok(!mapped.includes('raw.githubusercontent.com') && !mapped.includes('assets.coingecko.com'), `TOKEN_ICON_MAP[${sym}] must not use GFW-blocked domains`);
  }

  // 2. server.js Cache-Control rules & state.js cache key v3
  const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  assert.ok(serverSrc.includes('no-store, no-cache, must-revalidate'), 'server.js must set no-store Cache-Control on unversioned entry');
  assert.ok(serverSrc.includes('public, max-age=31536000, immutable'), 'server.js must set immutable cache on ?v= static assets');
  assert.equal(state.STAKING_METRICS_STORAGE_KEY, 'near_ca_staking_metrics_v3');

  // 3. tvlTokenAmount populated on the 7 NEAR/JUP pools & renderEarnView appends ($USD)
  const prevLang = state.lang;
  const prevLiveTokens = state.liveTokens;
  const prevPools = state.staking.pools;
  const prevUpdatedAt = state.staking.updatedAt;
  const prevFilter = state.staking.filter;
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevDoc = globalThis.document;
  state.setLanguage('en');
  state.wallets = [{ id: 'w_v33', name: 'V33', nearAccountId: 'v33.near', balances: { NEAR: 10 } }];
  state.activeWalletId = 'w_v33';
  state.staking.filter = 'all';
  state.liveTokens = [
    { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', price: 2.0 },
    { assetId: 'nep141:token.rhealab.near', symbol: 'RHEA', blockchain: 'near', price: 0.5 },
    { assetId: 'nep141:otoken.rhealab.near', symbol: 'oRHEA', blockchain: 'near', price: 0.4 },
    { assetId: 'solana:JUP', symbol: 'JUP', blockchain: 'sol', price: 1.2 }
  ];

  // Build 81-byte Solana Locker buffer with lockedJup = 500,000,000 * 1e6 at offset 73
  const lockerBuf = Buffer.alloc(81);
  lockerBuf.writeBigUInt64LE(500_000_000n * 1_000_000n, 73);
  const lockerB64 = lockerBuf.toString('base64');

  const encodeNearRes = (obj) => jsonResponse({
    jsonrpc: '2.0',
    result: { result: [...Buffer.from(JSON.stringify(obj))] }
  });

  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('rpc.mainnet.near.org') && opts?.body) {
        const b = JSON.parse(opts.body);
        const acct = b.params?.account_id;
        const meth = b.params?.method_name;
        if (acct === 'lst.rhealab.near' && meth === 'get_summary') {
          return encodeNearRes({ ft_price: (10n ** 24n).toString(), total_staked_near_amount: (1_000_000n * 10n ** 24n).toString() });
        }
        if (acct === 'xtoken.rhealab.near' && meth === 'contract_metadata') {
          return encodeNearRes({ cur_locked_token_amount: (2_000_000n * 10n ** 18n).toString(), reward_per_sec: '0', current_account_num: 1200 });
        }
        if (acct === 'orhea-conv.rhealab.near' && meth === 'get_converted_source_token_amounts') {
          return encodeNearRes({ 'otoken.rhealab.near': (3_000_000n * 10n ** 18n).toString() });
        }
        if (acct === 'meta-pool.near' && meth === 'get_contract_state') {
          return encodeNearRes({ total_for_staking: (4_000_000n * 10n ** 24n).toString(), accounts_count: 5000 });
        }
        if (acct === 'linear-protocol.near' && meth === 'get_summary') {
          return encodeNearRes({ ft_price: (10n ** 24n).toString(), total_staked_near_amount: (5_000_000n * 10n ** 24n).toString() });
        }
        if (acct === 'v2-nearx.stader-labs.near' && meth === 'get_total_staked_balance') {
          return encodeNearRes((6_000_000n * 10n ** 24n).toString());
        }
      }
      if (opts?.body && String(opts.body).includes('getAccountInfo') && String(opts.body).includes('CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN')) {
        return jsonResponse({ jsonrpc: '2.0', result: { value: { data: [lockerB64, 'base64'] } } });
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const pools = await chainContracts.fetchLiveStakingMetrics();
      const map = Object.fromEntries(pools.map((p) => [p.id, p]));
      assert.equal(map.rhea_rnear.tvlTokenAmount, 1_000_000);
      assert.equal(map.rhea_xrhea.tvlTokenAmount, 2_000_000);
      assert.equal(map.rhea_orhea_convert.tvlTokenAmount, 3_000_000);
      assert.equal(map.metapool_stnear.tvlTokenAmount, 4_000_000);
      assert.equal(map.linear_near.tvlTokenAmount, 5_000_000);
      assert.equal(map.stader_nearx.tvlTokenAmount, 6_000_000);
      assert.equal(map.jupiter_jup.tvlTokenAmount, 500_000_000);

      // Render Earn view and confirm ($USD) is appended via formatPoolTvlDisplay
      state.staking.pools = pools;
      state.staking.updatedAt = Date.now();
      const domMap = new Map();
      const makeEl = (id) => {
        const el = {
          id, innerHTML: '', textContent: '', value: '', classList: new Set(),
          attributes: {}, setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k]; },
          classListProxy: null
        };
        el.classList = {
          add: (...cls) => cls.forEach((c) => el._cls.add(c)),
          remove: (...cls) => cls.forEach((c) => el._cls.delete(c)),
          toggle: (c, f) => { if (f === undefined ? !el._cls.has(c) : f) el._cls.add(c); else el._cls.delete(c); },
          contains: (c) => el._cls.has(c)
        };
        el._cls = new Set();
        domMap.set(id, el);
        return el;
      };
      ['staking-pools-list', 'earn-selected-title', 'earn-avail-balance', 'earn-in-symbol',
        'earn-live-apy', 'earn-tvl-val', 'earn-stakers-val', 'earn-live-rate', 'earn-amount-in',
        'earn-est-out', 'earn-lock-row', 'earn-lock-tiers'].forEach(makeEl);
      globalThis.document = {
        documentElement: { lang: 'en' },
        getElementById: (id) => domMap.get(id) || null,
        querySelectorAll: () => []
      };
      uiController.renderEarnView();
      const html = domMap.get('staking-pools-list').innerHTML;
      assert.ok(html.includes('1.00M NEAR ($2.00M)'), 'rhea_rnear must render ($USD) in Earn list');
      assert.ok(html.includes('2.00M RHEA ($1.00M)'), 'rhea_xrhea must render ($USD) in Earn list');
      assert.ok(html.includes('3.00M oRHEA ($1.20M)'), 'rhea_orhea_convert must render ($USD) in Earn list');
      assert.ok(html.includes('4.00M NEAR ($8.00M)'), 'metapool_stnear must render ($USD) in Earn list');
      assert.ok(html.includes('5.00M NEAR ($10.00M)'), 'linear_near must render ($USD) in Earn list');
      assert.ok(html.includes('6.00M NEAR ($12.00M)'), 'stader_nearx must render ($USD) in Earn list');
      assert.ok(html.includes('500.00M JUP ($600.00M)'), 'jupiter_jup must render ($USD) in Earn list');
    });
  } finally {
    globalThis.document = prevDoc;
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    state.staking.filter = prevFilter;
    state.staking.pools = prevPools;
    state.staking.updatedAt = prevUpdatedAt;
    state.liveTokens = prevLiveTokens;
    state.setLanguage(prevLang);
  }
});
