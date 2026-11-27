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

test('v6.7 Stage A: Zero-flash App Lock, 1-minute auto-lock, Native Privacy Blur & AGENTS.md Git Rule', async () => {
  const agentsMd = fs.readFileSync(path.join(ROOT_DIR, 'AGENTS.md'), 'utf8');
  assert.match(agentsMd, /git commit/i);
  assert.match(agentsMd, /严禁.*git push|git push/i);

  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const appShellViews = fs.readFileSync(path.join(ROOT_DIR, 'src/app/views/AppShellViews.jsx'), 'utf8');
  const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.ok(indexHtml.includes("document.documentElement.classList.add('nexus-locked')"), 'index.html must apply nexus-locked synchronously before body paints');
  assert.ok(appShellViews.includes('id="app-lock-overlay"'));
  assert.ok(appShellViews.includes('id="app-privacy-shield"'));
  assert.ok(styleCss.includes('html.nexus-locked #app-lock-overlay'));
  assert.ok(styleCss.includes('html.nexus-privacy-blur #app-privacy-shield'));

  const swiftMain = fs.readFileSync(path.join(ROOT_DIR, 'ios', 'App', 'App', 'MainViewController.swift'), 'utf8');
  const swiftSec = fs.readFileSync(path.join(ROOT_DIR, 'ios', 'App', 'App', 'NativeSecurityPlugin.swift'), 'utf8');
  assert.match(swiftSec, /public static var isAuthenticating/);
  assert.match(swiftMain, /UIVisualEffectView/);
  assert.match(swiftMain, /willResignActiveNotification/);
  assert.match(swiftMain, /NativeSecurityPlugin\.isAuthenticating/);

  const javaMain = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'io', 'nexus', 'wallet', 'MainActivity.java'), 'utf8');
  const javaSec = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'io', 'nexus', 'wallet', 'NativeSecurityPlugin.java'), 'utf8');
  assert.match(javaSec, /public static volatile boolean isAuthenticating/);
  assert.match(javaMain, /FLAG_SECURE/);
  assert.match(javaMain, /NativeSecurityPlugin\.isAuthenticating/);

  assert.equal(uiController.APP_LOCK_TIMEOUT_MS, 60_000, 'Auto-lock timeout must be fixed at 1 minute (60,000 ms)');

  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_applock_v67',
      name: 'Lock Wallet',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'lock.near'
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.saveWallets();

    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const rootClassList = (() => {
      const s = new Set();
      return {
        add: (c) => s.add(c),
        remove: (c) => s.delete(c),
        toggle: (c, force) => (force === undefined ? (s.has(c) ? s.delete(c) : s.add(c)) : (force ? s.add(c) : s.delete(c))),
        contains: (c) => s.has(c)
      };
    })();
    const domMap = new Map([
      ['app-lock-overlay', createMockDomElement('app-lock-overlay')],
      ['app-privacy-shield', createMockDomElement('app-privacy-shield')],
      ['app-lock-status', createMockDomElement('app-lock-status')],
      ['btn-app-lock-unlock', createMockDomElement('btn-app-lock-unlock')]
    ]);
    globalThis.document = {
      documentElement: { classList: rootClassList },
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => [],
      querySelector: () => null
    };
    let authCalls = 0;
    let authResult = { authenticated: true, type: 'faceID' };
    globalThis.window = {
      Capacitor: {
        Plugins: {
          NativeSecurity: {
            async getSecurityCapabilities() {
              return { platform: 'ios', deviceModel: 'iPhone', biometryType: 'faceID', supportsBiometrics: true, supportsPasscode: true };
            },
            async authenticateWithBiometrics() {
              authCalls += 1;
              return authResult;
            }
          }
        }
      }
    };

    try {
      // Cold-start engage lock & auto-unlock with biometrics/passcode
      assert.equal(uiController.shouldEnableAppLockForWallet(w), true);
      uiController.engageAppLock(false);
      assert.equal(rootClassList.contains('nexus-locked'), true);

      assert.equal(await uiController.unlockAppLockNow(), true);
      assert.equal(authCalls, 1);
      assert.equal(rootClassList.contains('nexus-locked'), false);

      // Backgrounding shows privacy blur; returning within < 60s removes blur without re-locking
      uiController.handleAppVisibilityChange(true, 1_000_000);
      assert.equal(rootClassList.contains('nexus-privacy-blur'), true);
      assert.equal(rootClassList.contains('nexus-locked'), false);
      uiController.handleAppVisibilityChange(false, 1_045_000);
      assert.equal(rootClassList.contains('nexus-privacy-blur'), false);
      assert.equal(rootClassList.contains('nexus-locked'), false);

      // Backgrounding >= 60s engages lock on resume
      authResult = { authenticated: false, code: 'AUTH_CANCELLED', error: 'Cancelled' };
      uiController.handleAppVisibilityChange(true, 2_000_000);
      assert.equal(rootClassList.contains('nexus-privacy-blur'), true);
      uiController.handleAppVisibilityChange(false, 2_060_000);
      await new Promise((r) => setTimeout(r, 20));
      assert.equal(rootClassList.contains('nexus-privacy-blur'), false);
      assert.equal(rootClassList.contains('nexus-locked'), true, 'Must re-lock after >= 60s in background');
      assert.equal(authCalls, 2);

      // Retry after cancel succeeds
      authResult = { authenticated: true, type: 'passcode' };
      assert.equal(await uiController.unlockAppLockNow(), true);
      assert.equal(rootClassList.contains('nexus-locked'), false);
    } finally {
      globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
    }
  });
});

test('v6.8 Stage B: Multi-Chain Limit Orders (NEAR DCL ticks/split/claim/cancel, Solana Jupiter Trigger, EVM CoW EIP-712 & UI)', async () => {
  const ethers = require('../ethers.umd.min.js');
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);

  // 1. NEAR DCL Exact Tick Math for oRHEA/RHEA (pointDelta = 200)
  const poolIdOrhea = 'otoken.rhealab.near|token.rhealab.near|10000';
  const r5800 = limitOrders.dclPointToPrice({
    point: -5800,
    sellToken: 'token.rhealab.near',
    poolId: poolIdOrhea,
    sellDecimals: 18,
    buyDecimals: 18
  });
  const r6000 = limitOrders.dclPointToPrice({
    point: -6000,
    sellToken: 'token.rhealab.near',
    poolId: poolIdOrhea,
    sellDecimals: 18,
    buyDecimals: 18
  });
  assert.ok(Math.abs(r5800 - 1.7860) < 0.001, `Expected ~1.7860 at -5800, got ${r5800}`);
  assert.ok(Math.abs(r6000 - 1.8221) < 0.001, `Expected ~1.8221 at -6000, got ${r6000}`);

  const splitPts = limitOrders.resolveSplitTwoTickPoints({
    rateOutPerIn: 1.80,
    sellToken: 'token.rhealab.near',
    buyToken: 'otoken.rhealab.near',
    poolId: poolIdOrhea,
    sellDecimals: 18,
    buyDecimals: 18
  });
  assert.deepEqual(splitPts, [-5800, -6000]);

  // Mixed decimals check (USDC 6 dec / wNEAR 24 dec)
  const usdcNearPool = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near|2000';
  const usdcPerNearPt = limitOrders.priceToDclPoint({
    rateOutPerIn: 3.0,
    sellToken: 'wrap.near',
    buyToken: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    poolId: usdcNearPool,
    sellDecimals: 24,
    buyDecimals: 6
  });
  const backNearPrice = limitOrders.dclPointToPrice({
    point: usdcPerNearPt,
    sellToken: 'wrap.near',
    poolId: usdcNearPool,
    sellDecimals: 24,
    buyDecimals: 6
  });
  assert.ok(Math.abs(backNearPrice - 3.0) < 0.05, `Mixed-decimal round trip failed: got ${backNearPrice}`);

  // 2. NEAR DCL Pre-check (0.5 NEAR deposit when unregistered) + 2-tick LimitOrderWithSwap + Claim + Cancel
  const lowNearWallet = state.normalizeWalletRecord({
    id: 'w_lo_near_low',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nativeBalances: { near: 0.1 },
    nearNep141Balances: { 'token.rhealab.near': { formatted: 500, raw: (500n * 10n ** 18n).toString(), decimals: 18 } }
  });
  await withMockedFetch(async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : {};
    if (body?.params?.method_name === 'storage_balance_of') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { result: Array.from(Buffer.from('null')) } });
    }
    return jsonResponse({}, 404);
  }, async () => {
    await assert.rejects(
      limitOrders.placeNearDclLimitOrder({
        wallet: lowNearWallet,
        poolId: poolIdOrhea,
        sellToken: 'token.rhealab.near',
        buyToken: 'otoken.rhealab.near',
        amountRaw: (100n * 10n ** 18n).toString(),
        point: -5800,
        sellDecimals: 18,
        buyDecimals: 18,
        sellSymbol: 'RHEA',
        tokenBalance: 500
      }),
      /0\.52|NEAR 余额不足|Insufficient NEAR/i
    );
  });

  const fundedNearLoWallet = state.normalizeWalletRecord({
    id: 'w_lo_near_ok',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nativeBalances: { near: 5.0 },
    nearNep141Balances: { 'token.rhealab.near': { formatted: 500, raw: (500n * 10n ** 18n).toString(), decimals: 18 } }
  });
  const nearCalls = [];
  let userInnerBalance = '123000000000000000000';
  await withMockedFetch(async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : {};
    if (body.method === 'query' && body.params?.request_type === 'call_function') {
      const m = body.params.method_name;
      if (m === 'storage_balance_of') {
        const resVal = body.params.account_id === 'dclv2.ref-labs.near' ? { total: '500000000000000000000000' } : { total: '1250000000000000000000' };
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { result: Array.from(Buffer.from(JSON.stringify(resVal))) } });
      }
      if (m === 'list_user_assets') {
        const assets = { 'otoken.rhealab.near': userInnerBalance, 'token.rhealab.near': '50000000000000000000' };
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { result: Array.from(Buffer.from(JSON.stringify(assets))) } });
      }
    }
    if (body.method === 'query' && body.params?.request_type === 'view_access_key') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
    }
    if (body.method === 'broadcast_tx_commit') {
      nearCalls.push(body);
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { transaction: { hash: `near_lo_tx_${nearCalls.length}` } } });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const resSplit = await limitOrders.placeNearDclLimitOrder({
      wallet: fundedNearLoWallet,
      poolId: poolIdOrhea,
      sellToken: 'token.rhealab.near',
      buyToken: 'otoken.rhealab.near',
      amountRaw: (100n * 10n ** 18n).toString(),
      point: -5800,
      splitTwoTicks: true,
      rateOutPerIn: 1.80,
      sellDecimals: 18,
      buyDecimals: 18,
      sellSymbol: 'RHEA',
      tokenBalance: 500
    });
    assert.equal(resSplit.ok, true);
    assert.equal(resSplit.legs.length, 2);
    assert.equal(resSplit.legs[0].point, -5800);
    assert.equal(resSplit.legs[1].point, -6000);
    assert.equal(nearCalls.length, 2);

    const claimRes = await limitOrders.claimNearDclOrder({
      wallet: fundedNearLoWallet,
      orderId: `${poolIdOrhea}#1`,
      buyToken: 'otoken.rhealab.near'
    });
    assert.equal(claimRes.ok, true);
    assert.equal(claimRes.withdrawn.length, 1);

    const cancelRes = await limitOrders.cancelNearDclOrder({
      wallet: fundedNearLoWallet,
      orderId: `${poolIdOrhea}#1`,
      remainAmount: '50000000000000000000',
      sellToken: 'token.rhealab.near',
      buyToken: 'otoken.rhealab.near'
    });
    assert.equal(cancelRes.ok, true);
    assert.equal(cancelRes.withdrawn.length, 2);
  });

  // 3. Solana Jupiter Trigger V1: $5 min gate, 0.005 SOL rent+gas gate & mocked create->sign->execute
  const solWalletLow = state.normalizeWalletRecord({
    id: 'w_lo_sol_low',
    mnemonic: TEST_MNEMONIC,
    solAddress: keys.solAddress,
    solPrivateSeedHex: keys.solPrivateSeedHex,
    nativeBalances: { sol: 0.002 },
    splBalances: { EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 100 }
  });
  let jupNetworkHit = false;
  await withMockedFetch(async () => {
    jupNetworkHit = true;
    return jsonResponse({}, 500);
  }, async () => {
    await assert.rejects(
      limitOrders.placeSolanaLimitOrder({
        wallet: solWalletLow,
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: limitOrders.SOL_NATIVE_MINT,
        makingAmount: '2000000',
        takingAmount: '100000000',
        inputUsdValue: 2,
        sellBalance: 100,
        sellDecimals: 6,
        sellSymbol: 'USDC'
      }),
      /\$5/
    );
    assert.equal(jupNetworkHit, false, 'Below $5 min must block BEFORE network call');

    await assert.rejects(
      limitOrders.placeSolanaLimitOrder({
        wallet: solWalletLow,
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: limitOrders.SOL_NATIVE_MINT,
        makingAmount: '10000000',
        takingAmount: '200000000',
        inputUsdValue: 10,
        sellBalance: 100,
        sellDecimals: 6,
        sellSymbol: 'USDC'
      }),
      /SOL|rent|租金/i
    );
    assert.equal(jupNetworkHit, false, 'Insufficient SOL rent+gas must block BEFORE network call');
  });

  const solWalletOk = state.normalizeWalletRecord({
    id: 'w_lo_sol_ok',
    mnemonic: TEST_MNEMONIC,
    solAddress: keys.solAddress,
    nativeBalances: { sol: 1.5 },
    splBalances: { EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 100 }
  });
  solWalletOk.solPrivateSeedHex = keys.nearPrivateSeedHex;
  const testEvmWallet = ethers.Wallet.createRandom();
  const evmWalletKey = testEvmWallet.privateKey;
  const evmWalletAddr = testEvmWallet.address;
  const dummySolTx = Buffer.concat([
    Buffer.from([1]),
    Buffer.alloc(64),
    Buffer.from([1, 0, 1, 1]),
    Buffer.from(cryptoEngine.base58Decode(keys.solAddress))
  ]).toString('base64');
  let signedExecTx = null;
  await withMockedFetch(async (url, opts) => {
    if (url.includes('/trigger/v1/createOrder')) {
      return jsonResponse({ requestId: 'req_jup_1', transaction: dummySolTx, order: 'OrderPubkey111111111111111111111111111' });
    }
    if (url.includes('/trigger/v1/execute')) {
      signedExecTx = JSON.parse(opts.body);
      return jsonResponse({ status: 'Success', signature: 'sol_trig_sig_1' });
    }
    if (url.includes('/trigger/v1/cancelOrder')) {
      return jsonResponse({ requestId: 'req_jup_cancel_1', transaction: dummySolTx });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const solOrderRes = await limitOrders.placeSolanaLimitOrder({
      wallet: solWalletOk,
      inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      outputMint: limitOrders.SOL_NATIVE_MINT,
      makingAmount: '10000000',
      takingAmount: '200000000',
      inputUsdValue: 10,
      sellBalance: 100,
      sellDecimals: 6,
      sellSymbol: 'USDC'
    });
    assert.equal(solOrderRes.ok, true);
    assert.equal(solOrderRes.txHash, 'sol_trig_sig_1');
    assert.ok(signedExecTx && signedExecTx.signedTransaction !== dummySolTx, 'Solana trigger tx must be signed with real Ed25519 signature');

    const solCancelRes = await limitOrders.cancelSolanaLimitOrder({
      wallet: solWalletOk,
      orderPubkey: 'OrderPubkey111111111111111111111111111'
    });
    assert.equal(solCancelRes.ok, true);
  });

  // 4. EVM CoW Protocol: native sentinel block, unsupported chain block, EIP-712 Order & Cancel recovery
  const evmWalletOk = state.normalizeWalletRecord({
    id: 'w_lo_evm_ok',
    mnemonic: TEST_MNEMONIC,
    evmAddress: evmWalletAddr,
    nativeBalances: { base: 0.5 },
    erc20Balances: { base: { '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': 100 } }
  });
  evmWalletOk.evmPrivateKey = evmWalletKey;
  await assert.rejects(
    limitOrders.placeEvmCowLimitOrder({
      wallet: evmWalletOk,
      chainKey: 'base',
      sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      buyToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      sellAmount: '1000000000000000000',
      buyAmount: '2000000000',
      sellUsdValue: 100
    }),
    /原生|Native/i
  );
  await assert.rejects(
    limitOrders.placeEvmCowLimitOrder({
      wallet: evmWalletOk,
      chainKey: 'op',
      sellToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      buyToken: '0x4200000000000000000000000000000000000006',
      sellAmount: '10000000',
      buyAmount: '5000000000000000',
      sellUsdValue: 10
    }),
    /不支持|unavailable/i
  );

  let postedCowOrder = null;
  let deletedCowCancel = null;
  await withMockedFetch(async (url, opts) => {
    if (opts?.method === 'POST' && opts.body && opts.body.includes('eth_call')) {
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x' + (1000000000n).toString(16).padStart(64, '0') });
    }
    if (url.includes('api.cow.fi/base/api/v1/orders') && opts?.method === 'POST') {
      postedCowOrder = JSON.parse(opts.body);
      return jsonResponse('"0xdeadbeef01"');
    }
    if (url.includes('api.cow.fi/base/api/v1/orders') && opts?.method === 'DELETE') {
      deletedCowCancel = JSON.parse(opts.body);
      return jsonResponse({ cancelled: true });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const cowRes = await limitOrders.placeEvmCowLimitOrder({
      wallet: evmWalletOk,
      chainKey: 'base',
      sellToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      buyToken: '0x4200000000000000000000000000000000000006',
      sellAmount: '25000000',
      buyAmount: '10000000000000000',
      validTo: Math.floor(Date.now() / 1000) + 86400,
      sellUsdValue: 25,
      sellBalance: 100,
      sellDecimals: 6,
      sellSymbol: 'USDC'
    });
    assert.equal(cowRes.ok, true);
    assert.ok(postedCowOrder && postedCowOrder.signature);
    const recoveredOrderOwner = ethers.verifyTypedData(
      limitOrders.buildCowDomain(8453),
      limitOrders.COW_ORDER_EIP712_TYPES,
      cowRes.order,
      postedCowOrder.signature
    );
    assert.equal(recoveredOrderOwner.toLowerCase(), evmWalletAddr.toLowerCase());

    await limitOrders.cancelEvmCowOrder({
      wallet: evmWalletOk,
      chainKey: 'base',
      orderUid: '0x' + 'ab'.repeat(56)
    });
    assert.ok(deletedCowCancel && deletedCowCancel.signature);
    const recoveredCancelOwner = ethers.verifyTypedData(
      limitOrders.buildCowDomain(8453),
      limitOrders.COW_CANCEL_EIP712_TYPES,
      { orderUids: deletedCowCancel.orderUids },
      deletedCowCancel.signature
    );
    assert.equal(recoveredCancelOwner.toLowerCase(), evmWalletAddr.toLowerCase());
  });

  // 4b. Unified EVM EIP-712 MPC v1.signer path test (non-local evmPrivateKey wallet)
  const mpcTestWalletObj = ethers.Wallet.createRandom();
  const mpcWalletOnly = state.normalizeWalletRecord({
    id: 'w_lo_mpc_only',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    _mpcDerivedForNearId: 'alice.near',
    evmAddress: mpcTestWalletObj.address,
    mpcEvmAddress: mpcTestWalletObj.address,
    solAddress: keys.solAddress,
    solPublicKey: keys.solAddress,
    nativeBalances: { near: 1.0 }
  });
  delete mpcWalletOnly.evmPrivateKey;
  const cowDomTest = limitOrders.buildCowDomain(8453);
  const cowValTest = { orderUids: ['0x' + 'cd'.repeat(56)] };
  await withMockedFetch(async (url, opts) => {
    const rpcBody = opts?.body ? JSON.parse(opts.body) : {};
    if (rpcBody.method === 'query' && rpcBody.params?.request_type === 'view_access_key') {
      return jsonResponse({ jsonrpc: '2.0', id: rpcBody.id, result: { nonce: 55, block_hash: '11111111111111111111111111111111' } });
    }
    if (rpcBody.method === 'broadcast_tx_commit') {
      const digest = ethers.TypedDataEncoder.hash(cowDomTest, limitOrders.COW_CANCEL_EIP712_TYPES, cowValTest);
      const rawSig = new ethers.SigningKey(mpcTestWalletObj.privateKey).sign(digest);
      const mpcJson = {
        big_r: { affine_point: '02' + rawSig.r.slice(2) },
        s: { scalar: rawSig.s.slice(2) },
        recovery_id: rawSig.yParity
      };
      return jsonResponse({
        jsonrpc: '2.0',
        id: rpcBody.id,
        result: {
          transaction: { hash: 'mpc_eip712_tx_1' },
          status: { SuccessValue: Buffer.from(JSON.stringify(mpcJson)).toString('base64') }
        }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const mpcTypedRes = await chainContracts.signEvmTypedDataUnified({
      wallet: mpcWalletOnly,
      domain: cowDomTest,
      types: limitOrders.COW_CANCEL_EIP712_TYPES,
      value: cowValTest
    });
    assert.equal(mpcTypedRes.mode, 'mpc');
    assert.equal(mpcTypedRes.signerAddress.toLowerCase(), mpcTestWalletObj.address.toLowerCase());
    const recoveredMpc = ethers.verifyTypedData(cowDomTest, limitOrders.COW_CANCEL_EIP712_TYPES, cowValTest, mpcTypedRes.signature);
    assert.equal(recoveredMpc.toLowerCase(), mpcTestWalletObj.address.toLowerCase());
  });

  // 5. UI Peer Toggle (闪兑 | 限价) & DOM state
  const { readPreactAppSources } = require('./helpers.js');
  const indexHtml = readPreactAppSources();
  assert.ok(indexHtml.includes('id="swap-mode-toggle"'));
  assert.ok(indexHtml.includes('id="swap-limit-panel"'));
  assert.ok(indexHtml.includes('id="limit-orders-card"'));
  const prevDoc = globalThis.document;
  const swapDom = new Map([
    ['swap-market-panel', createMockDomElement('swap-market-panel')],
    ['swap-limit-panel', createMockDomElement('swap-limit-panel', { classes: ['hidden'] })],
    ['swap-mode-market-btn', createMockDomElement('swap-mode-market-btn', { classes: ['active'] })],
    ['swap-mode-limit-btn', createMockDomElement('swap-mode-limit-btn')]
  ]);
  globalThis.document = {
    getElementById: (id) => swapDom.get(id) || null,
    querySelectorAll: () => [],
    querySelector: () => null
  };
  try {
    uiController.setSwapPanelMode('limit');
    assert.equal(state.swap.panelMode, 'limit');
    assert.equal(swapDom.get('swap-market-panel').classList.contains('hidden'), true);
    assert.equal(swapDom.get('swap-limit-panel').classList.contains('hidden'), false);
    assert.equal(swapDom.get('swap-mode-limit-btn').classList.contains('active'), true);
    assert.equal(swapDom.get('swap-mode-market-btn').classList.contains('active'), false);
    uiController.setSwapPanelMode('market');
    assert.equal(state.swap.panelMode, 'market');
    assert.equal(swapDom.get('swap-market-panel').classList.contains('hidden'), false);
    assert.equal(swapDom.get('swap-limit-panel').classList.contains('hidden'), true);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('v6.9 Stage C: Bottom Nav Restructure & Hyperliquid Perpetual Futures + 1Click/Arbitrum Funding', async () => {
  const ethers = require('../ethers.umd.min.js');
  const { readPreactAppSources } = require('./helpers.js');
  const indexHtml = readPreactAppSources();

  // 1. Bottom Nav Restructure: 4 tabs [wallet, swap, perp, hub], Home Earn trigger kept, Earn Back button added
  const navMatch = indexHtml.match(/<nav id="bottom-nav"[\s\S]*?<\/nav>/);
  assert.ok(navMatch, 'bottom-nav must exist');
  const navTabs = [...navMatch[0].matchAll(/data-tab="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(navTabs, ['wallet', 'swap', 'perp', 'hub']);
  assert.ok(indexHtml.includes('id="view-perp"'));
  assert.ok(indexHtml.includes('id="sheet-perp-markets"'));
  assert.ok(indexHtml.includes('id="sheet-perp-funding"'));
  const walletSection = indexHtml.match(/<section id="view-wallet"[\s\S]*?<\/section>/)[0];
  assert.ok(walletSection.includes("switchTab('earn')"), 'Home view must still have quick action to open Staking');
  const earnSection = indexHtml.match(/<section id="view-earn"[\s\S]*?<\/section>/)[0];
  assert.ok(earnSection.includes("switchTab('wallet')") && earnSection.includes('data-i18n="common.back"'), '#view-earn must include a Back button');

  // Verify switchTab('perp') & switchTab('earn') DOM state
  await withMockedStorage({}, async () => {
    state.initState();
    const wNav = state.normalizeWalletRecord({ id: 'w_nav_c', mnemonic: TEST_MNEMONIC, nearNamedAccount: 'nav.near' });
    state.wallets = [wNav];
    state.activeWalletId = wNav.id;
    const prevDoc = globalThis.document;
    const viewsMap = new Map([
      ['view-wallet', createMockDomElement('view-wallet')],
      ['view-swap', createMockDomElement('view-swap', { classes: ['hidden'] })],
      ['view-perp', createMockDomElement('view-perp', { classes: ['hidden'] })],
      ['view-earn', createMockDomElement('view-earn', { classes: ['hidden'] })],
      ['view-hub', createMockDomElement('view-hub', { classes: ['hidden'] })]
    ]);
    const navBtns = navTabs.map((tabName) => {
      const el = createMockDomElement(`nav-${tabName}`, { classes: tabName === 'wallet' ? ['nav-item', 'active'] : ['nav-item'] });
      el.setAttribute('data-tab', tabName);
      return el;
    });
    globalThis.document = {
      getElementById: (id) => viewsMap.get(id) || null,
      querySelectorAll: (sel) => (sel === '.nav-item' ? navBtns : []),
      querySelector: () => null
    };
    try {
      uiController.switchTab('perp');
      assert.equal(state.activeTab, 'perp');
      assert.equal(viewsMap.get('view-perp').classList.contains('hidden'), false);
      assert.equal(viewsMap.get('view-wallet').classList.contains('hidden'), true);
      assert.equal(navBtns.find((b) => b.getAttribute('data-tab') === 'perp').classList.contains('active'), true);

      uiController.switchTab('earn');
      assert.equal(state.activeTab, 'earn');
      assert.equal(viewsMap.get('view-earn').classList.contains('hidden'), false);
      assert.equal(navBtns.find((b) => b.getAttribute('data-tab') === 'wallet').classList.contains('active'), true);
    } finally {
      globalThis.document = prevDoc;
    }
  });

  // 2. Pure-JS Msgpack byte vectors (order preservation, int/uint64, bool, str, array)
  const mpCancel = hlPerps.msgpackEncode({ type: 'cancel', cancels: [{ a: 0, o: 123456789012 }] });
  assert.equal(
    Buffer.from(mpCancel).toString('hex'),
    '82a474797065a663616e63656ca763616e63656c739182a16100a16fcf0000001cbe991a14'
  );
  const mpNeg = hlPerps.msgpackEncode([-1, -33, true, false, null]);
  assert.equal(Buffer.from(mpNeg).toString('hex'), '95ffd0dfc3c2c0');

  // 3. Price & Size formatting (CRITICAL integer zero preservation!)
  assert.equal(hlPerps.formatHlPrice(1200, 6), '1200', 'Must NEVER turn 1200 into 12');
  assert.equal(hlPerps.formatHlPrice(1200, 0), '1200');
  assert.equal(hlPerps.formatHlPrice(91234.56, 5), '91235');
  assert.equal(hlPerps.formatHlPrice(1.23456789, 1), '1.2346');
  assert.equal(hlPerps.formatHlPrice(0.000123456, 0), '0.000123');
  assert.equal(hlPerps.formatHlSize(1.2399, 2), '1.23');
  assert.equal(hlPerps.formatHlSize(1200, 0), '1200');

  // 4. computeHlActionHash determinism & vault distinction
  const sampleAction = { type: 'updateLeverage', asset: 0, isCross: false, leverage: 5 };
  const hNoVault = hlPerps.computeHlActionHash(sampleAction, 1700000000000, null);
  const hWithVault = hlPerps.computeHlActionHash(sampleAction, 1700000000000, '0x1111111111111111111111111111111111111111');
  assert.match(hNoVault, /^0x[0-9a-f]{64}$/);
  assert.equal(hNoVault, hlPerps.computeHlActionHash(sampleAction, 1700000000000, null));
  assert.notEqual(hNoVault, hWithVault);

  // 5. EIP-712 L1 Agent (Local & MPC) + UserSigned (usdClassTransfer & withdraw3) signature recovery
  const testKeys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const hlLocalW = ethers.Wallet.createRandom();
  const hlWalletLocal = state.normalizeWalletRecord({
    id: 'w_hl_local',
    mnemonic: TEST_MNEMONIC,
    evmAddress: hlLocalW.address
  });
  hlWalletLocal.evmPrivateKey = hlLocalW.privateKey;

  const l1SignedLocal = await hlPerps.signHlL1Action({
    wallet: hlWalletLocal,
    action: sampleAction,
    nonce: 1700000001234
  });
  const recoveredL1Local = ethers.verifyTypedData(
    hlPerps.HL_EIP712_L1_DOMAIN,
    hlPerps.HL_AGENT_EIP712_TYPES,
    { source: 'a', connectionId: l1SignedLocal.connectionId },
    l1SignedLocal.signatureHex
  );
  assert.equal(recoveredL1Local.toLowerCase(), hlLocalW.address.toLowerCase());

  const usdAction = { type: 'usdClassTransfer', amount: '25.5', toPerp: true, nonce: 1700000005678 };
  const usdSigned = await hlPerps.signHlUserSignedAction({
    wallet: hlWalletLocal,
    action: usdAction,
    payloadTypes: hlPerps.HL_USD_CLASS_TRANSFER_TYPES,
    primaryType: 'HyperliquidTransaction:UsdClassTransfer'
  });
  const recoveredUsd = ethers.verifyTypedData(
    hlPerps.HL_EIP712_USER_DOMAIN,
    { 'HyperliquidTransaction:UsdClassTransfer': hlPerps.HL_USD_CLASS_TRANSFER_TYPES },
    usdSigned.action,
    usdSigned.signatureHex
  );
  assert.equal(recoveredUsd.toLowerCase(), hlLocalW.address.toLowerCase());

  // MPC L1 Agent test
  const hlMpcW = ethers.Wallet.createRandom();
  const hlMpcOnly = state.normalizeWalletRecord({
    id: 'w_hl_mpc',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: testKeys.nearPublicKey,
    nearPrivateKey: testKeys.nearPrivateKey,
    _mpcDerivedForNearId: 'alice.near',
    evmAddress: hlMpcW.address,
    mpcEvmAddress: hlMpcW.address,
    solAddress: testKeys.solAddress,
    solPublicKey: testKeys.solAddress,
    nativeBalances: { near: 2.0 }
  });
  delete hlMpcOnly.evmPrivateKey;

  await withMockedFetch(async (url, opts) => {
    const rpcBody = opts?.body ? JSON.parse(opts.body) : {};
    if (rpcBody.method === 'query' && rpcBody.params?.request_type === 'view_access_key') {
      return jsonResponse({ jsonrpc: '2.0', id: rpcBody.id, result: { nonce: 88, block_hash: '11111111111111111111111111111111' } });
    }
    if (rpcBody.method === 'broadcast_tx_commit') {
      const digest = ethers.TypedDataEncoder.hash(
        hlPerps.HL_EIP712_L1_DOMAIN,
        hlPerps.HL_AGENT_EIP712_TYPES,
        { source: 'a', connectionId: hlPerps.computeHlActionHash(sampleAction, 1700000009999) }
      );
      const sigRaw = new ethers.SigningKey(hlMpcW.privateKey).sign(digest);
      const mpcJson = {
        big_r: { affine_point: '02' + sigRaw.r.slice(2) },
        s: { scalar: sigRaw.s.slice(2) },
        recovery_id: sigRaw.yParity
      };
      return jsonResponse({
        jsonrpc: '2.0',
        id: rpcBody.id,
        result: { transaction: { hash: 'hl_mpc_tx_1' }, status: { SuccessValue: Buffer.from(JSON.stringify(mpcJson)).toString('base64') } }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const l1Mpc = await hlPerps.signHlL1Action({
      wallet: hlMpcOnly,
      action: sampleAction,
      nonce: 1700000009999
    });
    assert.equal(l1Mpc.signerAddress.toLowerCase(), hlMpcW.address.toLowerCase());
  });

  // 6. Hard Gates: < $10 order notional, insufficient margin, < 5 USDC Arb Bridge2, < 2 USDC withdraw + TP/SL normalTpsl order payload
  const btcMarket = { index: 0, name: 'BTC', szDecimals: 5, maxLeverage: 40, onlyIsolated: false, markPx: 90000 };
  let hlNetworkCalled = false;
  await withMockedFetch(async (url, opts) => {
    hlNetworkCalled = true;
    const body = opts?.body ? JSON.parse(opts.body) : {};
    return jsonResponse({ status: 'ok', response: { type: 'default', data: { statuses: [{ filled: { totalSz: '0.001' } }] } }, echo: body });
  }, async () => {
    // < $10 notional blocked before network
    await assert.rejects(
      hlPerps.placeHlPerpOrder({
        wallet: hlWalletLocal,
        market: btcMarket,
        isBuy: true,
        size: 0.00005, // ~$4.50
        orderType: 'market',
        leverage: 5,
        availableMargin: 100
      }),
      /\$10/
    );
    assert.equal(hlNetworkCalled, false);

    // Insufficient available margin blocked before network
    await assert.rejects(
      hlPerps.placeHlPerpOrder({
        wallet: hlWalletLocal,
        market: btcMarket,
        isBuy: true,
        size: 0.01, // $900 @ 5x = $180 margin
        orderType: 'market',
        leverage: 5,
        availableMargin: 50
      }),
      /保证金|margin/i
    );
    assert.equal(hlNetworkCalled, false);

    // Arbitrum Bridge2 < 5 USDC hard block before network/RPC
    await assert.rejects(
      hlPerps.depositArbUsdcToHlBridge({
        wallet: hlWalletLocal,
        amount: 4.99,
        arbUsdcBalance: 100,
        arbEthBalance: 0.1
      }),
      /5 USDC/
    );
    assert.equal(hlNetworkCalled, false);

    // Withdraw < 2 USDC and > withdrawable hard blocks before network
    await assert.rejects(
      hlPerps.withdrawHlToArbitrum({ wallet: hlWalletLocal, amount: 1.5, withdrawable: 100 }),
      /2 USDC/
    );
    await assert.rejects(
      hlPerps.withdrawHlToArbitrum({ wallet: hlWalletLocal, amount: 50, withdrawable: 20 }),
      /不足|Insufficient/i
    );
    assert.equal(hlNetworkCalled, false);
  });

  // Valid Order + normalTpsl child triggers + default Isolated leverage
  const hlPosts = [];
  await withMockedFetch(async (url, opts) => {
    if (url.includes('/exchange')) {
      const body = JSON.parse(opts.body);
      hlPosts.push(body);
      return jsonResponse({ status: 'ok', response: { type: 'default', data: { statuses: [{ resting: { oid: 999 } }] } } });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const ordRes = await hlPerps.placeHlPerpOrder({
      wallet: hlWalletLocal,
      market: btcMarket,
      isBuy: true,
      size: 0.002, // $180 @ 5x = $36 margin
      orderType: 'limit',
      limitPrice: 90000,
      leverage: 5,
      isCross: false,
      tpPrice: 98000,
      slPrice: 86000,
      availableMargin: 100
    });
    assert.equal(ordRes.ok, true);
    assert.equal(hlPosts.length, 2); // updateLeverage + order
    assert.equal(hlPosts[0].action.type, 'updateLeverage');
    assert.equal(hlPosts[0].action.isCross, false);
    assert.equal(hlPosts[1].action.grouping, 'normalTpsl');
    assert.equal(hlPosts[1].action.orders.length, 3);
    assert.equal(hlPosts[1].action.orders[1].t.trigger.tpsl, 'tp');
    assert.equal(hlPosts[1].action.orders[2].t.trigger.tpsl, 'sl');
  });

  // 7. 1Click quote for HyperCore Spot USDC targets Hyperliquid EVM address
  let capturedOneClickReq = null;
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      capturedOneClickReq = JSON.parse(opts.body);
      return jsonResponse({
        quote: { amountOut: '2495000000', amountOutFormatted: '24.95', amountInUsd: '25.00', amountOutUsd: '24.95' }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const solUsdc = {
      assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
      blockchain: 'sol',
      symbol: 'USDC',
      decimals: 6
    };
    const ocRes = await hlPerps.quoteOneClickDepositToHlSpot({
      wallet: hlWalletLocal,
      originToken: solUsdc,
      amount: 25,
      dry: true
    });
    assert.equal(ocRes.ok, true);
    assert.equal(capturedOneClickReq.destinationAsset, hlPerps.HL_ONECLICK_SPOT_USDC_ASSET_ID);
    assert.equal(capturedOneClickReq.recipient, hlLocalW.address.toLowerCase());
  });
});

test('v6.10 UI/UX Overhaul: 1Click PRL Guard & Lowercase Recipient, 20-Level Orderbook, Enhanced K-Line & Live Deposit/Withdraw Checks', async () => {
  const ethers = require('../ethers.umd.min.js');
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const wTest = ethers.Wallet.createRandom();
  const hlWallet = state.normalizeWalletRecord({
    id: 'w_v610_hl',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    _mpcDerivedForNearId: 'alice.near',
    evmAddress: wTest.address,
    mpcEvmAddress: wTest.address,
    solAddress: keys.solAddress,
    solPublicKey: keys.solAddress
  });

  // 1. Direct 1Click filter blocks PRL / QTC / Arc & rejects PRL BEFORE network call
  const prlTok = { assetId: 'nep141:prl.omft.near', blockchain: 'prl', symbol: 'PRL', decimals: 9 };
  const nearTok = { assetId: 'nep141:wrap.near', blockchain: 'near', symbol: 'NEAR', decimals: 24 };
  const solUsdcTok = { assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', blockchain: 'sol', symbol: 'USDC', decimals: 6 };
  assert.equal(hlPerps.isDirectOneClickOriginForHl(prlTok), false);
  assert.equal(hlPerps.isDirectOneClickOriginForHl({ assetId: 'qtc', blockchain: 'qtc', symbol: 'QTC' }), false);
  assert.equal(hlPerps.isDirectOneClickOriginForHl(nearTok), true);
  assert.equal(hlPerps.isDirectOneClickOriginForHl(solUsdcTok), true);

  let hit1Click = false;
  let capturedBody = null;
  await withMockedFetch(async (url, opts) => {
    hit1Click = true;
    capturedBody = JSON.parse(opts.body);
    return jsonResponse({ quote: { amountOut: '2910000000', amountOutFormatted: '29.10' } });
  }, async () => {
    const prlRes = await hlPerps.quoteOneClickDepositToHlSpot({ wallet: hlWallet, originToken: prlTok, amount: 10 });
    assert.equal(prlRes.ok, false);
    assert.equal(prlRes.unsupportedDirect, true);
    assert.equal(hit1Click, false, 'PRL must be blocked before calling 1Click');

    const okRes = await hlPerps.quoteOneClickDepositToHlSpot({ wallet: hlWallet, originToken: nearTok, amount: 10 });
    assert.equal(okRes.ok, true);
    assert.equal(capturedBody.recipient, wTest.address.toLowerCase(), '1Click recipient must be lowercase EVM address');
  });

  // 2. 20-Level Orderbook Depth Aggregation
  await withMockedFetch(async () => jsonResponse({
    levels: [
      [
        { px: '61500', sz: '2.5', n: 4 },
        { px: '61499', sz: '1.5', n: 2 }
      ],
      [
        { px: '61501', sz: '1.0', n: 3 }
      ]
    ]
  }), async () => {
    const ob = await hlPerps.fetchHlOrderbook('BTC');
    assert.equal(ob.bidTotalSz, 4);
    assert.equal(ob.bidOrderCount, 6);
    assert.equal(ob.askTotalSz, 1);
    assert.equal(ob.askOrderCount, 3);
    assert.equal(ob.bidRatioPct, 80);
  });

  // 3. Enhanced K-line SVG with price axis, current mark price dashed line & volume bars
  const svgHtml = uiController.renderPerpCandleSvg([
    { t: 1, o: 100, h: 108, l: 98, c: 105, v: 42 },
    { t: 2, o: 105, h: 112, l: 103, c: 109, v: 85 }
  ], { markPx: 109 });
  assert.ok(svgHtml.includes('<text'), 'K-line SVG must render price axis labels');
  assert.ok(svgHtml.includes('stroke="#00ec97"'), 'K-line SVG must render live Mark Price dashed line');
  assert.ok(svgHtml.includes('fill-opacity="0.45"'), 'K-line SVG must render volume histogram bars');

  // 4. Live Arbitrum Deposit & Withdraw UI Pre-Validation
  const arbNoBal = uiController.evaluatePerpArbDepositState({ amount: 10, arbUsdc: 0, arbEth: 0 });
  assert.equal(arbNoBal.disabled, true);
  assert.match(arbNoBal.text, /USDC/);

  const arbLowAmt = uiController.evaluatePerpArbDepositState({ amount: 3, arbUsdc: 20, arbEth: 0.01 });
  assert.equal(arbLowAmt.disabled, true);
  assert.match(arbLowAmt.error, /5 USDC/);

  const arbNoGas = uiController.evaluatePerpArbDepositState({ amount: 10, arbUsdc: 20, arbEth: 0.00005 });
  assert.equal(arbNoGas.disabled, true);
  assert.match(arbNoGas.error, /ETH/);

  const arbReady = uiController.evaluatePerpArbDepositState({ amount: 10, arbUsdc: 20, arbEth: 0.005 });
  assert.equal(arbReady.disabled, false);

  const wdTooLow = uiController.evaluatePerpWithdrawState({ amount: 1.5, withdrawable: 50 });
  assert.equal(wdTooLow.disabled, true);
  assert.equal(wdTooLow.netReceive, null);

  const wdOver = uiController.evaluatePerpWithdrawState({ amount: 60, withdrawable: 50 });
  assert.equal(wdOver.disabled, true);

  const wdOk = uiController.evaluatePerpWithdrawState({ amount: 10, withdrawable: 50 });
  assert.equal(wdOk.disabled, false);
  assert.equal(wdOk.netReceive, 9);

  // 5. UI Classes, No Duplicate withdrawBtn i18n Key & Clean DOM Structure
  const { readPreactAppSources } = require('./helpers.js');
  const indexHtml = readPreactAppSources();
  assert.equal(state.i18nDict.zh['perp.withdrawBtn'], '提现');
  assert.equal(state.i18nDict.en['perp.withdrawBtn'], 'Withdraw');
  assert.equal(state.i18nDict.zh['perp.withdrawConfirmBtn'], '安全验证并提现');
  assert.match(indexHtml, /id="perp-coin-btn"\s+className="token-select-btn"/);
  assert.ok(indexHtml.includes('className="nexus-switch"'));
  assert.ok(indexHtml.includes('id="limit-split-preview"'));
  assert.ok(indexHtml.includes('id="perp-oc-empty-state"'));
  assert.ok(indexHtml.includes('id="perp-arb-error"'));
  assert.ok(indexHtml.includes('id="perp-wd-error"'));
});
