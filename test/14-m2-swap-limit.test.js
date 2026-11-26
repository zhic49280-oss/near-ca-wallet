'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  nearIntents,
  chainContracts,
  limitOrders,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  withMockedStorage,
  createMockDomElement
} = require('./helpers.js');

test('M2.1: Limit orders DCL_GAS_RESERVE_NEAR is 0.05 & CoW BSC 429/402 (x402) handled gracefully', async () => {
  assert.equal(limitOrders.DCL_GAS_RESERVE_NEAR, 0.05);
  assert.equal(limitOrders.DCL_STORAGE_DEPOSIT_NEAR, 0.5);

  await withMockedFetch(async (url) => {
    if (url.includes('api.cow.fi/bnb/api/v1/account/')) {
      return jsonResponse({ error: 'x402.cow.fi rate limit' }, 429, 'Too Many Requests');
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const res429 = await limitOrders.fetchEvmCowOrders('bsc', '0x000000000000000000000000000000000000dEaD');
    assert.equal(res429.rateLimited, true);
    assert.deepEqual(res429.active, []);
    assert.deepEqual(res429.history, []);
  });

  await withMockedFetch(async (url) => {
    if (url.includes('api.cow.fi/bnb/api/v1/account/')) {
      return jsonResponse({ error: 'Payment Required via x402.cow.fi' }, 402, 'Payment Required');
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const res402 = await limitOrders.fetchEvmCowOrders('bsc', '0x000000000000000000000000000000000000dEaD');
    assert.equal(res402.rateLimited, true);
    assert.equal(res402.unavailable, true);
  });
});

test('M2.2: CoW BSC placeEvmCowLimitOrder HTTP 429 throws user-friendly BSC message without CoW/HTTP jargon', async () => {
  const prevEthers = globalThis.ethers;
  const ethers = require('../ethers.umd.min.js');
  globalThis.ethers = ethers;
  try {
    await withMockedStorage({}, async () => {
      state.initState();
      const w = state.normalizeWalletRecord({
        id: 'w_m2_cow_429',
        name: 'CowBsc',
        mnemonic: TEST_MNEMONIC,
        nativeBalances: { bsc: 1 }
      });
      const ethW = ethers.Wallet.fromPhrase(TEST_MNEMONIC);
      w.evmAddress = ethW.address;
      w.evmPrivateKey = ethW.privateKey;
      await chainContracts.ensureWalletSigningKeysAsync(w);
      const prevCheck = limitOrders.checkEvmCowAllowance;
      await withMockedFetch(async (url, opts) => {
        if (opts?.method === 'POST' && opts.body && opts.body.includes('eth_call')) {
          // allowance = max uint256
          return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' });
        }
        if (url.includes('api.cow.fi/bnb/api/v1/orders')) {
          return jsonResponse({ description: 'x402.cow.fi HTTP 429' }, 429, 'Too Many Requests');
        }
        return jsonResponse({}, 404);
      }, async () => {
        await assert.rejects(
          limitOrders.placeEvmCowLimitOrder({
            wallet: w,
            chainKey: 'bsc',
            sellToken: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            buyToken: '0x55d398326f99059fF775485246999027B3197955',
            sellAmount: '1000000000000000000',
            buyAmount: '500000000000000000000',
            sellUsdValue: 600,
            sellBalance: 10,
            sellDecimals: 18,
            sellSymbol: 'WBNB'
          }),
          (err) => {
            assert.match(err.message, /BSC/);
            assert.doesNotMatch(err.message, /CoW|HTTP\s*429|x402/i);
            return true;
          }
        );
      });
      assert.equal(typeof prevCheck, 'function');
    });
  } finally {
    if (prevEthers === undefined) delete globalThis.ethers;
    else globalThis.ethers = prevEthers;
  }
});

test('M2.3: Limit orders setLimitMaxAmount reserves 0.5 NEAR DCL storage + 0.05 gas, and chain/flip/picker reset error flags', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_m2_limit_max',
      name: 'LimitMax',
      mnemonic: TEST_MNEMONIC,
      nearBalance: 10,
      nativeBalances: { near: 10 },
      nearNep141Balances: { 'wrap.near': { raw: '0', formatted: 0 } }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    const prevDoc = globalThis.document;
    const domMap = new Map([
      ['limit-amount-in', createMockDomElement('limit-amount-in')],
      ['limit-target-rate', createMockDomElement('limit-target-rate')]
    ]);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };
    try {
      state.limit.chain = 'near';
      state.limit.sellContract = 'wrap.near';
      state.limit.buyContract = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
      state.limit.dclStorageRegistered = false;
      uiController.setLimitMaxAmount();
      assert.equal(state.limit.amountIn, '9.45', 'Must reserve 0.5 DCL storage + 0.05 gas when unregistered');

      state.limit.dclStorageRegistered = true;
      uiController.setLimitMaxAmount();
      assert.equal(state.limit.amountIn, '9.95', 'Must reserve 0.05 gas when DCL storage already registered');

      state.limit.evmAllowanceFailed = true;
      state.limit.solUnavailable = true;
      state.limit.errorMsg = 'stale error';
      uiController.setLimitChain('eth');
      assert.equal(state.limit.evmAllowanceFailed, false);
      assert.equal(state.limit.solUnavailable, false);
      assert.equal(state.limit.errorMsg, '');

      state.limit.evmAllowanceFailed = true;
      state.limit.solUnavailable = true;
      state.limit.errorMsg = 'stale error 2';
      const flipFn = uiController.flipLimitTokens || globalThis.flipLimitTokens;
      assert.equal(typeof flipFn, 'function');
      flipFn();
      assert.equal(state.limit.evmAllowanceFailed, false);
      assert.equal(state.limit.solUnavailable, false);
      assert.equal(state.limit.errorMsg, '');

      state.limit.pickerSide = 'from';
      state.limit.evmAllowanceFailed = true;
      state.limit.solUnavailable = true;
      state.limit.errorMsg = 'stale error 3';
      const selectFn = uiController.selectSwapToken || globalThis.selectSwapToken;
      assert.equal(typeof selectFn, 'function');
      selectFn('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
      assert.equal(state.limit.evmAllowanceFailed, false);
      assert.equal(state.limit.solUnavailable, false);
      assert.equal(state.limit.errorMsg, '');
    } finally {
      globalThis.document = prevDoc;
    }
  });
});

test('M2.4: Confidential swap 45s poll timeout throws CONFIDENTIAL_SWAP_PENDING without proceeding to withdraw', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_m2_conf_timeout',
      name: 'ConfTimeout',
      mnemonic: TEST_MNEMONIC
    });
    await chainContracts.ensureWalletSigningKeysAsync(w);

    const origNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    let withdrawCalled = false;
    try {
      await withMockedFetch(async (url) => {
        if (url.includes('/api/auth/message')) {
          return jsonResponse({ message: { message: 'Sign in', recipient: 'intents.near', nonce: Array(32).fill(1) } });
        }
        if (url.includes('/api/auth/authenticate')) {
          return jsonResponse({ accessToken: 'tok_1', refreshToken: 'ref_1', expiresAt: fakeNow + 900_000 });
        }
        if (url.includes('/api/account/balances')) {
          return jsonResponse({ balances: [{ tokenId: 'nep141:wrap.near', available: '1000000000000000000000000' }] });
        }
        if (url.includes('/api/swap/quote')) {
          return jsonResponse({ ok: { quote: { amountOut: '5000000', amountOutUsd: '5.00', depositAddress: 'swap_dep_1' } } });
        }
        if (url.includes('/api/swap/intent')) {
          return jsonResponse({
            ok: {
              intent: {
                standard: 'nep413',
                payload: {
                  message: JSON.stringify({ signer_id: w.nearNamedAccount || w.nearAddress, intents: [{ intent: 'transfer', receiver_id: 'swap_dep_1' }] }),
                  recipient: 'intents.far',
                  nonce: Buffer.from(Array(32).fill(3)).toString('base64')
                }
              }
            }
          });
        }
        if (url.includes('/api/swap/submit')) {
          return jsonResponse({ ok: { intentHash: 'hash_swap_1' } });
        }
        if (url.includes('/api/swap/status')) {
          fakeNow += 50_000; // jump past 45s pollDeadline
          return jsonResponse({ ok: { status: 'PROCESSING' } });
        }
        if (url.includes('/api/withdraw/')) {
          withdrawCalled = true;
          return jsonResponse({ ok: {} });
        }
        return jsonResponse({}, 404);
      }, async () => {
        await assert.rejects(
          nearIntents.executeNearcomConfidentialSwapAndWithdraw({
            wallet: w,
            originAsset: 'nep141:wrap.near',
            destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
            destinationChain: 'near',
            amountInRaw: '1000000000000000000000000',
            recipient: w.nearNamedAccount || w.nearAddress
          }),
          (err) => {
            assert.equal(err.code, 'CONFIDENTIAL_SWAP_PENDING');
            return true;
          }
        );
        assert.equal(withdrawCalled, false, 'Must not proceed to withdraw when swap poll times out');
      });
    } finally {
      Date.now = origNow;
    }
  });
});

test('M2.5: Arc USDC 6-vs-18 decimals normalized in quoteEvmDexSwap & OpenOcean HTTP 403 sanitized', async () => {
  await withMockedFetch(async (url) => {
    if (url.includes('kyberswap.com')) {
      assert.ok(url.includes('amountIn=2000000'), 'Arc native 18-dec 2 USDC must normalize to 6-dec 2000000 for DEX quote');
      return jsonResponse({
        code: 0,
        data: { routeSummary: { amountOut: '1990000', amountInUsd: '2.00', amountOutUsd: '1.99' } }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const q = await chainContracts.quoteEvmDexSwap({
      chainKey: 'arc',
      srcToken: '0x3600000000000000000000000000000000000000',
      destToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      amountRaw: '2000000000000000000',
      srcDecimals: 18,
      destDecimals: 18
    });
    assert.equal(q.ok, true);
    assert.equal(q.amountOut, '1990000000000000000', 'Arc 6-dec output must scale back to 18-dec native');
  });

  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_m2_oo_403',
      name: 'OO403',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { eth: 1 },
      erc20Balances: { eth: { '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': 100 } }
    });
    await chainContracts.ensureWalletSigningKeysAsync(w);
    await withMockedFetch(async (url) => {
      if (url.includes('openocean.finance')) {
        return jsonResponse({ message: 'OpenOcean HTTP 403 Forbidden' }, 403, 'Forbidden');
      }
      return jsonResponse({}, 404);
    }, async () => {
      await assert.rejects(
        chainContracts.executeEvmDexSwap({
          wallet: w,
          chainKey: 'eth',
          routeSource: 'openocean',
          routeData: { outAmount: '1000000' },
          srcToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          destToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
          amountRaw: '1000000',
          srcDecimals: 6,
          tokenBalance: 100
        }),
        (err) => {
          assert.doesNotMatch(err.message, /403|Forbidden|OpenOcean/i);
          return true;
        }
      );
    });
  });
});

test('M2.6: Part-file source checks for real tokenBalance, refresh button, allowance polling & jargon-free errors', () => {
  const prlPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/121-swap-execute-prl.part.js'), 'utf8');
  const corePart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/120-swap-execute-core.part.js'), 'utf8');
  const ordersPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/130-swap-orders.part.js'), 'utf8');
  assert.doesNotMatch(prlPart, /tokenBalance:\s*Number\((?:prlHuman|usdcHuman)\)|tokenBalance:\s*usdcHuman/);
  assert.doesNotMatch(corePart, /tokenBalance:\s*Number\(bridgeHuman\)/);
  assert.doesNotMatch(ordersPart, /tokenBalance:\s*Number\(bHuman\)/);

  const htmlPart = fs.readFileSync(path.join(ROOT_DIR, 'src/app/views/TradingViews.jsx'), 'utf8');
  assert.ok(htmlPart.includes('id="btn-refresh-limit-orders"'), 'Limit refresh button must have id="btn-refresh-limit-orders"');

  const limitUiPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/151-limit-orders-ui.part.js'), 'utf8');
  assert.ok(limitUiPart.includes('checkEvmCowAllowance'), 'Post-approve allowance polling must be present');
  assert.doesNotMatch(limitUiPart, /CoW API 请求频繁/);
});
