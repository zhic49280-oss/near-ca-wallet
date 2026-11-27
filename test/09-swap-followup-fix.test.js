'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  nearIntents,
  chainContracts,
  state,
  uiController,
  TEST_MNEMONIC,
  withMockedStorage,
  createMockDomElement
} = require('./helpers.js');

function withMockedDom(domMap, fn) {
  const prevDoc = globalThis.document;
  globalThis.document = {
    hidden: false,
    documentElement: { lang: 'en' },
    addEventListener: () => {},
    removeEventListener: () => {},
    getElementById: (id) => domMap.get(id) || null,
    querySelectorAll: () => [],
    querySelector: () => null
  };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    });
}

test('P1-1 followUpArcDexSwap blocks when preArcUsdcRaw > 0 and availWei <= preWei without calling executeEvmDexSwap', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_arc_guard',
      mnemonic: TEST_MNEMONIC,
      evmAddress: '0x1111111111111111111111111111111111111111',
      mpcEvmAddress: '0x1111111111111111111111111111111111111111'
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.lang = 'en';

    const prevEthers = globalThis.ethers;
    globalThis.ethers = {};
    const origFetchBal = chainContracts.fetchEvmNativeAndErc20Balance;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    const origQuote = chainContracts.quoteEvmDexSwap;
    const origExec = chainContracts.executeEvmDexSwap;

    let quoteCalls = 0;
    let execCalls = 0;
    chainContracts.ensureWalletSigningKeysAsync = async () => {};
    chainContracts.fetchEvmNativeAndErc20Balance = async () => ({
      nativeRaw: '5000000000000000000', // 5.0 USDC (existing balance)
      native: 5
    });
    chainContracts.quoteEvmDexSwap = async () => {
      quoteCalls += 1;
      return { ok: true, routeSource: 'mock', routeData: {} };
    };
    chainContracts.executeEvmDexSwap = async () => {
      execCalls += 1;
      return { txHash: '0xdeadbeef' };
    };

    try {
      const order = {
        walletId: w.id,
        depositAddress: '0xdeposit_arc_1',
        status: 'SUCCESS',
        followUpExecuted: false,
        followUpFailed: false,
        followUpArcDexSwap: {
          destContract: '0x2222222222222222222222222222222222222222',
          destDecimals: 18,
          toSymbol: 'ARCX',
          expectedArcUsdcRaw: '2000000', // 2 USDC (6 dec)
          preArcUsdcRaw: '5000000000000000000', // 5.0 USDC (18 dec)
          slippageBps: 100
        }
      };
      state.swap.activeOrder = order;
      await withMockedDom(new Map(), async () => {
        await uiController.resumeActiveSwapFollowUp();
      });

      assert.equal(quoteCalls, 0, 'quoteEvmDexSwap must not be called when deltaWei <= 0n');
      assert.equal(execCalls, 0, 'executeEvmDexSwap must not be called when deltaWei <= 0n');
      assert.equal(order.followUpExecuted, false);
      assert.equal(order.followUpFailed, true);
      assert.ok(
        String(order.followUpError || '').includes('has not arrived yet') ||
        String(order.followUpError || '').includes('尚未到账'),
        `Expected unarrived error, got: ${order.followUpError}`
      );
    } finally {
      if (prevEthers === undefined) delete globalThis.ethers;
      else globalThis.ethers = prevEthers;
      chainContracts.fetchEvmNativeAndErc20Balance = origFetchBal;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
      chainContracts.quoteEvmDexSwap = origQuote;
      chainContracts.executeEvmDexSwap = origExec;
    }
  });
});

test('P1-1 followUpArcDexSwap uses only deltaWei bounded by expectedWei and maxSpendableWei', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_arc_delta',
      mnemonic: TEST_MNEMONIC,
      evmAddress: '0x1111111111111111111111111111111111111111',
      mpcEvmAddress: '0x1111111111111111111111111111111111111111'
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.lang = 'en';

    const prevEthers = globalThis.ethers;
    globalThis.ethers = {};
    const origFetchBal = chainContracts.fetchEvmNativeAndErc20Balance;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    const origQuote = chainContracts.quoteEvmDexSwap;
    const origExec = chainContracts.executeEvmDexSwap;

    let quotedAmountRaw = null;
    let executedAmountRaw = null;
    chainContracts.ensureWalletSigningKeysAsync = async () => {};
    // Pre = 5.0 USDC, Avail = 6.5 USDC => delta = 1.5 USDC; expected = 2.0 USDC => swapIn = 1.5 USDC (1500000 in 6 dec)
    chainContracts.fetchEvmNativeAndErc20Balance = async () => ({
      nativeRaw: '6500000000000000000',
      native: 6.5
    });
    chainContracts.quoteEvmDexSwap = async (params) => {
      quotedAmountRaw = params.amountRaw;
      return { ok: true, routeSource: 'mock', routeData: { raw: true } };
    };
    chainContracts.executeEvmDexSwap = async (params) => {
      executedAmountRaw = params.amountRaw;
      return { txHash: '0xarcswap123' };
    };

    try {
      const order = {
        walletId: w.id,
        depositAddress: '0xdeposit_arc_2',
        status: 'SUCCESS',
        followUpExecuted: false,
        followUpFailed: false,
        followUpArcDexSwap: {
          destContract: '0x2222222222222222222222222222222222222222',
          destDecimals: 18,
          toSymbol: 'ARCX',
          expectedArcUsdcRaw: '2000000', // 2.0 USDC
          preArcUsdcRaw: '5000000000000000000', // 5.0 USDC
          slippageBps: 100
        }
      };
      state.swap.activeOrder = order;
      await withMockedDom(new Map(), async () => {
        await uiController.resumeActiveSwapFollowUp();
      });

      assert.equal(quotedAmountRaw, '1500000', 'Must quote exact deltaWei (1.5 USDC = 1500000)');
      assert.equal(executedAmountRaw, '1500000', 'Must execute exact deltaWei (1.5 USDC = 1500000)');
      assert.equal(order.followUpExecuted, true);
      assert.equal(order.followUpFailed, false);
    } finally {
      if (prevEthers === undefined) delete globalThis.ethers;
      else globalThis.ethers = prevEthers;
      chainContracts.fetchEvmNativeAndErc20Balance = origFetchBal;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
      chainContracts.quoteEvmDexSwap = origQuote;
      chainContracts.executeEvmDexSwap = origExec;
    }
  });
});

test('P1-5 startOrderStatusPolling timeout preserves SwapActiveOrderPanel VDOM and clears pollTimedOut on refresh', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_poll_vdom',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near'
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.saveWallets();
    state.lang = 'en';

    const order = {
      walletId: w.id,
      depositAddress: '0xdeposit_poll_1',
      status: 'PENDING_DEPOSIT',
      createdAt: Date.now()
    };
    state.swap.activeOrder = order;

    const statusEl = createMockDomElement('swap-order-status');
    statusEl.textContent = 'PREACT_VDOM_SENTINEL';
    const cardEl = createMockDomElement('swap-order-card');
    const domMap = new Map([
      ['swap-order-card', cardEl],
      ['swap-order-status', statusEl]
    ]);

    const prevFw = globalThis.NearCAFramework;
    const prevSetInterval = globalThis.setInterval;
    const prevClearInterval = globalThis.clearInterval;
    const prevFetchStatus = nearIntents.fetchSwapOrderStatus;
    const prevEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    const prevFetchPrices = nearIntents.fetchLiveDefuseTokenPrices;
    const prevFetchIntentsBal = nearIntents.fetchIntentsUnifiedBalances;
    const prevFetchNear = nearIntents.fetchNearNativeBalance;
    const prevFetchNep141 = nearIntents.fetchNearNep141Balances;
    const prevFetchStaking = chainContracts.fetchNearAccountStakingPositionsAsync;
    const prevDiscoverNear = chainContracts.discoverNearAccountsByPublicKeyAsync;
    const prevFetchEvmBatch = chainContracts.fetchEvmChainBalancesBatch;
    const prevFetchSol = chainContracts.fetchSolanaBalance;
    const prevFetchBtc = chainContracts.fetchBitcoinBalance;
    const prevFetchPrl = chainContracts.fetchPearlBalance;

    chainContracts.ensureWalletSigningKeysAsync = async () => {};
    nearIntents.fetchLiveDefuseTokenPrices = async () => ({ ok: false });
    nearIntents.fetchIntentsUnifiedBalances = async () => ({ ok: false });
    nearIntents.fetchNearNativeBalance = async () => null;
    nearIntents.fetchNearNep141Balances = async () => ({});
    chainContracts.fetchNearAccountStakingPositionsAsync = async () => [];
    chainContracts.discoverNearAccountsByPublicKeyAsync = async () => [];
    chainContracts.fetchEvmChainBalancesBatch = async () => ({});
    chainContracts.fetchSolanaBalance = async () => null;
    chainContracts.fetchBitcoinBalance = async () => null;
    chainContracts.fetchPearlBalance = async () => null;

    const mountedPropsHistory = [];
    globalThis.NearCAFramework = {
      mountSwapActiveOrderPanel: (_el, props) => {
        mountedPropsHistory.push(props);
      }
    };

    let capturedIntervalCb = null;
    let clearedCount = 0;
    globalThis.setInterval = (cb, ms) => {
      if (ms === 6000) capturedIntervalCb = cb;
      return { id: 999, unref: () => {} };
    };
    globalThis.clearInterval = () => {
      clearedCount += 1;
    };
    nearIntents.fetchSwapOrderStatus = async () => ({ ok: true, status: 'PROCESSING' });

    try {
      await withMockedDom(domMap, async () => {
        // Persist order so bootstrapApp() -> st.initState() loads it and starts polling
        state.saveActiveSwapOrder(order);
        uiController.bootstrapApp();
        await new Promise((r) => setTimeout(r, 10));
        const activeOrder = state.swap.activeOrder;
        assert.equal(typeof capturedIntervalCb, 'function', 'startOrderStatusPolling must register interval');

        // Advance 241 ticks to trigger _orderPollCount > 240 timeout
        for (let i = 0; i < 241; i += 1) {
          capturedIntervalCb();
        }

        assert.ok(clearedCount >= 1, 'stopOrderStatusPolling must clear interval on timeout');
        assert.equal(activeOrder.pollTimedOut, true, 'order.pollTimedOut must be marked true on timeout');
        assert.equal(
          statusEl.textContent,
          'PREACT_VDOM_SENTINEL',
          'Must NOT overwrite #swap-order-status textContent when Preact SwapActiveOrderPanel is mounted'
        );
        const lastMountProps = mountedPropsHistory[mountedPropsHistory.length - 1];
        assert.equal(lastMountProps.pollTimedOut, true, 'mountSwapActiveOrderPanel must receive pollTimedOut: true');

        // Refreshing and getting a new status must clear pollTimedOut
        await new Promise((r) => setTimeout(r, 10));
        await uiController.refreshActiveSwapOrderStatus(true);
        assert.equal(activeOrder.pollTimedOut, false, 'order.pollTimedOut must be cleared when new status arrives');
        assert.equal(activeOrder.status, 'PROCESSING');
      });
    } finally {
      state.activeTab = 'none';
      state.activeWalletId = null;
      state.wallets = [];
      chainContracts.ensureWalletSigningKeysAsync = prevEnsureKeys;
      nearIntents.fetchLiveDefuseTokenPrices = prevFetchPrices;
      nearIntents.fetchIntentsUnifiedBalances = prevFetchIntentsBal;
      nearIntents.fetchNearNativeBalance = prevFetchNear;
      nearIntents.fetchNearNep141Balances = prevFetchNep141;
      chainContracts.fetchNearAccountStakingPositionsAsync = prevFetchStaking;
      chainContracts.discoverNearAccountsByPublicKeyAsync = prevDiscoverNear;
      chainContracts.fetchEvmChainBalancesBatch = prevFetchEvmBatch;
      chainContracts.fetchSolanaBalance = prevFetchSol;
      chainContracts.fetchBitcoinBalance = prevFetchBtc;
      chainContracts.fetchPearlBalance = prevFetchPrl;
      globalThis.NearCAFramework = prevFw;
      globalThis.setInterval = prevSetInterval;
      globalThis.clearInterval = prevClearInterval;
      nearIntents.fetchSwapOrderStatus = prevFetchStatus;
    }
  });
});

test('P2 rhea_xrhea storage deposit uses 1250000000000000000000 (0.00125 NEAR) and SwapQuoteStatusPanel supports pollTimedOut', () => {
  const stakingSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/parts/chain-contracts/110-staking-execute.part.js'),
    'utf8'
  );
  assert.ok(
    stakingSrc.includes("pool.id === 'rhea_xrhea'") &&
    stakingSrc.includes("'1250000000000000000000'"),
    'rhea_xrhea must use 1250000000000000000000 (0.00125 NEAR) storage deposit'
  );

  const panelSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/app/components/SwapQuoteStatusPanel.jsx'),
    'utf8'
  );
  assert.ok(panelSrc.includes('pollTimedOut'), 'SwapActiveOrderPanel must accept pollTimedOut');
  assert.ok(panelSrc.includes('Still confirming · Tap Refresh'));
  assert.ok(panelSrc.includes('仍在确认中 · 点击刷新'));
});

test('P1-1 followUpArcRelay throws before Relay broadcast when needsArcSwap=true and Arc balance is null', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_arc_relay_guard',
      mnemonic: TEST_MNEMONIC,
      evmAddress: '0x1111111111111111111111111111111111111111',
      mpcEvmAddress: '0x1111111111111111111111111111111111111111'
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.lang = 'en';

    const prevEthers = globalThis.ethers;
    globalThis.ethers = {};
    const origFetchBal = chainContracts.fetchEvmNativeAndErc20Balance;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    const origExecRawSteps = chainContracts.executeEvmRawSteps;
    const origQuoteRelay = nearIntents.quoteRelayBridge;
    const origDiscoverNear = chainContracts.discoverNearAccountsByPublicKeyAsync;
    const origFetchStaking = chainContracts.fetchNearAccountStakingPositionsAsync;
    const origFetchPrices = nearIntents.fetchLiveDefuseTokenPrices;
    const origFetchIntentsBal = nearIntents.fetchIntentsUnifiedBalances;
    const origFetchNear = nearIntents.fetchNearNativeBalance;
    const origFetchNep141 = nearIntents.fetchNearNep141Balances;
    const origFetchEvmBatch = chainContracts.fetchEvmChainBalancesBatch;

    let relayQuoteCalls = 0;
    let execRawStepsCalls = 0;
    chainContracts.ensureWalletSigningKeysAsync = async () => {};
    chainContracts.discoverNearAccountsByPublicKeyAsync = async () => [];
    chainContracts.fetchNearAccountStakingPositionsAsync = async () => [];
    nearIntents.fetchLiveDefuseTokenPrices = async () => ({ ok: false });
    nearIntents.fetchIntentsUnifiedBalances = async () => ({ ok: false });
    nearIntents.fetchNearNativeBalance = async () => null;
    nearIntents.fetchNearNep141Balances = async () => ({});
    chainContracts.fetchEvmChainBalancesBatch = async () => ({});
    chainContracts.fetchEvmNativeAndErc20Balance = async (chainKey) => {
      if (chainKey === 'base') {
        return { tokenRaw: '5000000', nativeRaw: '10000000000000000' };
      }
      if (chainKey === 'arc') {
        return null;
      }
      return null;
    };
    nearIntents.quoteRelayBridge = async () => {
      relayQuoteCalls += 1;
      return { ok: true, steps: [{ to: '0x0', data: '0x' }], amountOut: '2000000' };
    };
    chainContracts.executeEvmRawSteps = async () => {
      execRawStepsCalls += 1;
      return { txHash: '0xdeadbeef' };
    };

    try {
      const order = {
        walletId: w.id,
        depositAddress: '0xdeposit_arc_relay_1',
        status: 'SUCCESS',
        followUpExecuted: false,
        followUpFailed: false,
        followUpArcRelay: {
          direction: 'BASE_TO_ARC',
          destContract: '0x2222222222222222222222222222222222222222',
          destDecimals: 18,
          toSymbol: 'ARCX',
          expectedBaseRaw: '2000000',
          preBaseRaw: '1000000',
          slippageBps: 100
        }
      };
      state.swap.activeOrder = order;
      await withMockedDom(new Map(), async () => {
        await uiController.resumeActiveSwapFollowUp();
      });

      assert.equal(relayQuoteCalls, 0, 'quoteRelayBridge must not be called when Arc balance is null');
      assert.equal(execRawStepsCalls, 0, 'executeEvmRawSteps must not be called when Arc balance is null');
      assert.equal(order.followUpArcDexSwap, undefined, 'followUpArcDexSwap must not be written with preArcUsdcRaw: 0');
      assert.equal(order.followUpExecuted, false);
      assert.equal(order.followUpFailed, true);
      assert.ok(
        String(order.followUpError || '').includes('Arc Mainnet balance') ||
        String(order.followUpError || '').includes('Arc 主网余额'),
        `Expected Arc balance read error, got: ${order.followUpError}`
      );
    } finally {
      state.activeTab = 'none';
      state.activeWalletId = null;
      state.wallets = [];
      if (prevEthers === undefined) delete globalThis.ethers;
      else globalThis.ethers = prevEthers;
      chainContracts.fetchEvmNativeAndErc20Balance = origFetchBal;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
      chainContracts.executeEvmRawSteps = origExecRawSteps;
      nearIntents.quoteRelayBridge = origQuoteRelay;
      chainContracts.discoverNearAccountsByPublicKeyAsync = origDiscoverNear;
      chainContracts.fetchNearAccountStakingPositionsAsync = origFetchStaking;
      nearIntents.fetchLiveDefuseTokenPrices = origFetchPrices;
      nearIntents.fetchIntentsUnifiedBalances = origFetchIntentsBal;
      nearIntents.fetchNearNativeBalance = origFetchNear;
      nearIntents.fetchNearNep141Balances = origFetchNep141;
      chainContracts.fetchEvmChainBalancesBatch = origFetchEvmBatch;
    }
  });
});
