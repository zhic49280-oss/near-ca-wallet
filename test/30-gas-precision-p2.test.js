'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  cryptoEngine,
  tokenRegistry,
  nearIntents,
  chainContracts,
  state,
  dappBrowser,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  withMockedStorage,
  createMockDomElement
} = require('./helpers.js');
const ethers = require('../ethers.umd.min.js');

function createDomEnv(domMap) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevEthers = globalThis.ethers;
  const createdNodes = [];
  const docListeners = new Map();

  const makeStyle = () => ({
    setProperty() {},
    removeProperty() {}
  });

  const makeEl = (id, tag = 'div', extra = {}) => {
    const listeners = new Map();
    const base = createMockDomElement(id, {
      tagName: String(tag).toUpperCase(),
      value: '',
      checked: false,
      dataset: {},
      style: makeStyle(),
      children: [],
      parentNode: null,
      appendChild(child) {
        if (child) {
          child.parentNode = this;
          this.children.push(child);
          if (child.id) domMap.set(child.id, child);
        }
        return child;
      },
      insertBefore(newNode, refNode) {
        if (!newNode) return newNode;
        newNode.parentNode = this;
        const idx = refNode ? this.children.indexOf(refNode) : -1;
        if (idx >= 0) this.children.splice(idx, 0, newNode);
        else this.children.push(newNode);
        if (newNode.id) domMap.set(newNode.id, newNode);
        return newNode;
      },
      addEventListener(ev, fn) {
        if (!listeners.has(ev)) listeners.set(ev, []);
        listeners.get(ev).push(fn);
      },
      dispatchEvent(ev) {
        for (const fn of (listeners.get(ev.type) || [])) fn(ev);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      ...extra
    });
    base._listeners = listeners;
    return base;
  };

  const doc = {
    hidden: false,
    activeElement: null,
    documentElement: {
      lang: 'en',
      scrollTop: 0,
      style: makeStyle(),
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false }
    },
    body: {
      scrollTop: 0,
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false }
    },
    createElement(tag) {
      const node = makeEl('', tag);
      createdNodes.push(node);
      return node;
    },
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    },
    removeEventListener(ev, fn) {
      const arr = docListeners.get(ev);
      if (arr) {
        const idx = arr.indexOf(fn);
        if (idx >= 0) arr.splice(idx, 1);
      }
    },
    getElementById: (id) => domMap.get(id) || null,
    querySelectorAll: (sel) => {
      if (sel === '.bottom-sheet.open') {
        return Array.from(domMap.values()).filter((el) => el.classList && el.classList.contains('open') && el._isSheet);
      }
      if (sel === '.bottom-sheet') {
        return Array.from(domMap.values()).filter((el) => el._isSheet);
      }
      return [];
    },
    querySelector: (sel) => {
      if (sel === '#wc-request-card .btn-secondary') return domMap.get('btn-wc-request-reject') || null;
      if (sel === '#wc-request-card .btn-primary') return domMap.get('btn-wc-request-approve') || null;
      return null;
    }
  };

  return {
    makeEl,
    doc,
    createdNodes,
    install() {
      globalThis.document = doc;
      globalThis.ethers = ethers;
      globalThis.window = globalThis;
    },
    restore() {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
      if (prevEthers === undefined) delete globalThis.ethers;
      else globalThis.ethers = prevEthers;
    }
  };
}

function makeNearRpcMock({ storageUsage = 182, amountYocto = '1000000000000000000000000', storageMap = {}, minDepositYocto = '1250000000000000000000' }) {
  return async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(String(opts.body)) : {};
    if (body.method === 'query' && body.params?.request_type === 'view_account') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id || 1,
        result: { amount: amountYocto, locked: '0', storage_usage: storageUsage, block_height: 123 }
      });
    }
    if (body.method === 'query' && body.params?.request_type === 'call_function') {
      const acct = body.params.account_id;
      const fn = body.params.method_name;
      if (fn === 'storage_balance_of') {
        const val = Object.prototype.hasOwnProperty.call(storageMap, acct) ? storageMap[acct] : null;
        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id || 1,
          result: { result: Array.from(Buffer.from(JSON.stringify(val), 'utf8')) }
        });
      }
      if (fn === 'storage_balance_bounds') {
        const val = { min: minDepositYocto, max: minDepositYocto };
        return jsonResponse({
          jsonrpc: '2.0',
          id: body.id || 1,
          result: { result: Array.from(Buffer.from(JSON.stringify(val), 'utf8')) }
        });
      }
    }
    throw new Error(`Unexpected URL in NEAR RPC mock: ${url}`);
  };
}

test('Wave 4 Gas Precision 1: NEAR -> PRL (NEP-141) Max matches button & execute validation (unregistered & registered, zero NEAR Gas error)', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const wallet = state.normalizeWalletRecord({
      id: 'w_near_prl_max',
      mnemonic: TEST_MNEMONIC,
      nearAddress: keys.nearAddress,
      nearNamedAccount: 'alice.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nearPrivateSeedHex: keys.nearPrivateSeedHex,
      mpcEvmAddress: keys.mpcEvmAddress,
      evmAddress: keys.mpcEvmAddress,
      solAddress: keys.solAddress,
      nativeBalances: { near: 1.0, sol: 0.5, eth: 0.1 },
      nearNep141Balances: {}
    });
    state.wallets = [wallet];
    state.activeWalletId = wallet.id;
    state.lang = 'zh';
    state.swap.fromAssetId = 'nep141:wrap.near';
    state.swap.toAssetId = '1cs_v1:near:nep141:prl.omft.near';
    state.swap.amountIn = '';
    state.swap.quoteData = null;

    const domMap = new Map();
    const env = createDomEnv(domMap);
    for (const id of [
      'swap-amount-in', 'swap-amount-out', 'swap-usd-in', 'swap-usd-out',
      'btn-execute-swap', 'swap-gas-fix-banner', 'swap-gas-fix-text',
      'swap-error-banner', 'swap-quote-route', 'swap-quote-rate', 'swap-quote-fee',
      'swap-auto-route-badge', 'swap-recipient-input', 'swap-recipient-contacts-btn',
      'swap-price-impact-banner', 'toast'
    ]) {
      domMap.set(id, env.makeEl(id, id === 'btn-execute-swap' ? 'button' : (id.includes('input') || id.includes('amount') ? 'input' : 'div')));
    }

    const fromToken = {
      symbol: 'NEAR',
      blockchain: 'near',
      assetId: 'nep141:wrap.near',
      contractAddress: 'wrap.near',
      decimals: 24
    };
    const toToken = {
      symbol: 'PRL',
      blockchain: 'near',
      assetId: '1cs_v1:near:nep141:prl.omft.near',
      contractAddress: 'prl.omft.near',
      decimals: 8
    };
    const refQuoteData = {
      ok: true,
      compositeType: 'NEAR_TO_PRL_REF',
      amountOut: '2500000000',
      amountOutFormatted: '25',
      refQuote: { ok: true, actions: [{ pool_id: 1, token_in: 'wrap.near', token_out: 'prl.omft.near', min_amount_out: '2400000000' }], minAmountOut: '2400000000' }
    };

    const origExecRef = chainContracts.executeNearRefFinanceSwap;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    const origBio = globalThis.navigator?.credentials;
    env.install();
    try {
      // Case A: prl.omft.near unregistered (storage_balance_of -> null), wrap.near registered
      await withMockedFetch(makeNearRpcMock({
        storageUsage: 182, // 0.00182 NEAR lock
        amountYocto: '1000000000000000000000000', // 1.0 NEAR
        storageMap: {
          'wrap.near': { total: '1250000000000000000000', available: '0' },
          'prl.omft.near': null
        },
        minDepositYocto: '1250000000000000000000' // 0.00125 NEAR
      }), async () => {
        state.swap._liveGas = null;
        await uiController.setSwapMaxAmount();
        // Exact reserve = 0.00182 (storage) + 0.00125 (prl deposit) + 0.005 (exec) = 0.00807 NEAR
        assert.equal(state.swap.amountIn, '0.99193', 'Unregistered PRL Max must leave exact 0.00807 NEAR');
        assert.equal(state.swap._isMaxSweep, true);

        const btnPreQuote = uiController.evaluateSwapButtonState({
          wallet, fromToken, toToken, amountIn: state.swap.amountIn, quoteData: null
        });
        assert.equal(btnPreQuote.disabled, false, `Pre-quote button must be enabled, got ${JSON.stringify(btnPreQuote)}`);
        assert.equal(btnPreQuote.reason, 'ready');

        const btnWithQuote = uiController.evaluateSwapButtonState({
          wallet, fromToken, toToken, amountIn: state.swap.amountIn, quoteData: refQuoteData
        });
        assert.equal(btnWithQuote.disabled, false, `Post-quote button must NOT fail with NEAR Gas insufficient, got ${JSON.stringify(btnWithQuote)}`);
        assert.equal(btnWithQuote.reason, 'ready');

        const gasValidation = uiController.validateSwapNearGasRequirement({
          wallet, fromToken, toToken, quoteData: refQuoteData, amountIn: Number(state.swap.amountIn)
        });
        assert.equal(gasValidation.ok, true);
        assert.equal(gasValidation.requiredNear, 0.00807);
      });

      // Case B: both wrap.near and prl.omft.near already registered
      await withMockedFetch(makeNearRpcMock({
        storageUsage: 182,
        amountYocto: '1000000000000000000000000',
        storageMap: {
          'wrap.near': { total: '1250000000000000000000', available: '0' },
          'prl.omft.near': { total: '1250000000000000000000', available: '0' }
        }
      }), async () => {
        state.swap._liveGas = null;
        await uiController.setSwapMaxAmount();
        // Exact reserve = 0.00182 + 0.005 = 0.00682 NEAR (smaller than unregistered 0.00807)
        assert.equal(state.swap.amountIn, '0.99318', 'Registered PRL Max must leave exact 0.00682 NEAR without double-charging deposit');

        const btnReg = uiController.evaluateSwapButtonState({
          wallet, fromToken, toToken, amountIn: state.swap.amountIn, quoteData: refQuoteData
        });
        assert.equal(btnReg.disabled, false);
        assert.equal(btnReg.reason, 'ready');

        // Execute same-chain NEAR_TO_PRL_REF and verify gasBuffer propagation (< 0.02 old cap)
        const refExecCalls = [];
        chainContracts.ensureWalletSigningKeysAsync = async (w) => w;
        chainContracts.executeNearRefFinanceSwap = async (arg) => {
          refExecCalls.push(arg);
          return { txHash: 'near_tx_prl_ref_1' };
        };
        state.swap.quoteData = { ...refQuoteData, quotedAt: Date.now() };
        await uiController.executeActiveSwap();
        await new Promise((r) => setTimeout(r, 20));
        assert.equal(refExecCalls.length, 1, 'NEAR -> PRL same-chain must execute via executeNearRefFinanceSwap');
        assert.equal(refExecCalls[0].gasBuffer, 0.00682);
        assert.equal(refExecCalls[0].tokenOut, 'prl.omft.near');
      });
    } finally {
      chainContracts.executeNearRefFinanceSwap = origExecRef;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
      if (origBio === undefined && globalThis.navigator) { /* keep */ }
      env.restore();
    }
  });
});

test('Wave 4 Gas Precision 2: Solana live priority fee + new ATA 0.00203928 SOL rent & EVM/SOL estimateDestDexGasAsync', async () => {
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const wallet = state.normalizeWalletRecord({
    id: 'w_sol_gas',
    mnemonic: TEST_MNEMONIC,
    ...keys,
    nativeBalances: { sol: 1.0, base: 0.1 }
  });

  // 1) New ATA + live priority fees: median(500k, 1M, 1.5M) = 1M micro-lamports
  // bufferedMicro = 1.25M -> priorityLamports = (1.25M * 300k)/1e6 = 375k
  // execLamports = 5000 + 375000 + 50000 = 430000n; + rent 2039280n = 2469280n (0.00246928 SOL)
  await withMockedFetch(async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(String(opts.body)) : {};
    if (body.method === 'getRecentPrioritizationFees') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: 1,
        result: [{ prioritizationFee: 500000 }, { prioritizationFee: 1000000 }, { prioritizationFee: 1500000 }]
      });
    }
    if (body.method === 'getTokenAccountsByOwner') {
      return jsonResponse({ jsonrpc: '2.0', id: 2, result: { value: [] } });
    }
    if (body.method === 'eth_gasPrice') {
      return jsonResponse({ jsonrpc: '2.0', id: 3, result: '0x5f5e100' }); // 0.1 gwei
    }
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const solNewAta = await chainContracts.estimateLiveNativeGasAsync({
      wallet,
      chain: 'sol',
      kind: 'dex_swap',
      toToken: { blockchain: 'sol', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }
    });
    assert.equal(solNewAta.isLive, true);
    assert.equal(solNewAta.meta.isNewSolAta, true);
    assert.equal(solNewAta.meta.rentLamports, '2039280');
    assert.equal(solNewAta.meta.execLamports, '430000');
    assert.equal(solNewAta.exactFeeBaseUnits, '2469280');
    assert.equal(solNewAta.gasReserve, 0.00246928);

    const destSolNew = await chainContracts.estimateDestDexGasAsync({ chainKey: 'sol', wallet, isNewSolAta: true });
    assert.equal(destSolNew.isLive, true);
    assert.equal(destSolNew.exactFeeBaseUnits, '2469280');
    assert.equal(destSolNew.meta.rentLamports, '2039280');

    const destSolExisting = await chainContracts.estimateDestDexGasAsync({ chainKey: 'sol', wallet, isNewSolAta: false });
    assert.equal(destSolExisting.isLive, true);
    assert.equal(destSolExisting.exactFeeBaseUnits, '430000');
    assert.equal(destSolExisting.meta.rentLamports, '0');

    // OP Stack Base DEX gas = (0.1 gwei * 280000 * 115 / 100) + 5000000000000n L1 pad + 1n
    const destBase = await chainContracts.estimateDestDexGasAsync({ chainKey: 'base', wallet });
    assert.equal(destBase.isLive, true);
    const expectedBaseWei = ((100000000n * 280000n * 115n) / 100n) + 5000000000000n + 1n;
    assert.equal(destBase.exactFeeBaseUnits, expectedBaseWei.toString());
    assert.equal(destBase.meta.l1PadWei, '5000000000000');
  });

  // 2) Existing ATA skips 0.00203928 rent
  await withMockedFetch(async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(String(opts.body)) : {};
    if (body.method === 'getRecentPrioritizationFees') {
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: [{ prioritizationFee: 0 }] });
    }
    if (body.method === 'getTokenAccountsByOwner') {
      return jsonResponse({ jsonrpc: '2.0', id: 2, result: { value: [{ pubkey: 'ExistingAta111' }] } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }, async () => {
    const solExisting = await chainContracts.estimateLiveNativeGasAsync({
      wallet,
      chain: 'sol',
      kind: 'dex_swap',
      toToken: { blockchain: 'sol', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }
    });
    assert.equal(solExisting.isLive, true);
    assert.equal(solExisting.meta.isNewSolAta, false);
    assert.equal(solExisting.meta.rentLamports, '0');
    assert.equal(solExisting.exactFeeBaseUnits, '100000'); // floor 0.0001 SOL
    assert.equal(solExisting.gasReserve, 0.0001);
  });

  // 3) Offline RPC falls back to 0.0015 SOL
  await withMockedFetch(async () => { throw new Error('rpc offline'); }, async () => {
    const solOffline = await chainContracts.estimateLiveNativeGasAsync({ wallet, chain: 'sol', kind: 'dex_swap' });
    assert.equal(solOffline.isLive, false);
    assert.equal(solOffline.gasReserve, 0.0015);
  });
});

test('Wave 4 Gas Precision 3: Stage 2 DEST_DEX Auto (near-zero dust) vs Extra reserve mode', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const wallet = state.normalizeWalletRecord({
      id: 'w_stage2_dest',
      mnemonic: TEST_MNEMONIC,
      ...keys,
      nativeBalances: { near: 5, sol: 0, base: 0 },
      splBalances: {},
      solAtaMints: {}
    });
    state.wallets = [wallet];
    state.activeWalletId = wallet.id;

    // Part A: getTargetChainGasReserveInfo uses live _destDexLiveGas in Auto vs Extra
    const fromNear = { symbol: 'NEAR', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 };
    const toSolBonk = { symbol: 'BONK', blockchain: 'sol', assetId: 'sol:DezX', contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 };
    const quoteSolStage2 = { compositeType: 'CROSS_CHAIN_TO_SOL_DEX', stages: [{ type: 'BRIDGE' }, { type: 'DEST_DEX', chain: 'sol' }], amountOutFormatted: '1000', intermediaryRaw: '100000000' };

    state.swap._destDexLiveGas = {
      key: 'sol:1',
      ts: Date.now(),
      data: { isLive: true, gasReserve: 0.00246928, exactFeeBaseUnits: '2469280' }
    };
    const autoInfo = uiController.getTargetChainGasReserveInfo(wallet, fromNear, toSolBonk, 'auto', quoteSolStage2);
    assert.equal(autoInfo.showSelector, true);
    assert.equal(autoInfo.isNewSolAta, true);
    assert.equal(autoInfo.recommendedReserve, 0.00247); // ceil(0.00246928, 1e-6) = 0.00247
    assert.equal(autoInfo.selectedReserve, 0.00247);

    const extraInfo = uiController.getTargetChainGasReserveInfo(wallet, fromNear, toSolBonk, 'extra', quoteSolStage2);
    assert.equal(extraInfo.extraReserve, 0.01);
    assert.equal(extraInfo.selectedReserve, 0.01);

    // Part B: Stage 2 followUpSolDexSwap & followUpEvmDexSwap dynamic recalculation
    const domMap = new Map();
    const env = createDomEnv(domMap);
    for (const id of ['swap-order-card', 'swap-order-status', 'toast']) domMap.set(id, env.makeEl(id));

    const origSolBal = chainContracts.fetchSolanaNativeAndSplBalances;
    const origJupQ = chainContracts.quoteSolanaJupiterSwap;
    const origJupExec = chainContracts.executeSolanaJupiterSwap;
    const origEvmBal = chainContracts.fetchEvmNativeAndErc20Balance;
    const origEvmQ = chainContracts.quoteEvmDexSwap;
    const origEvmExec = chainContracts.executeEvmDexSwap;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;

    env.install();
    try {
      chainContracts.ensureWalletSigningKeysAsync = async (w) => w;

      const solQuotes = [];
      const solExecs = [];
      chainContracts.fetchSolanaNativeAndSplBalances = async () => ({
        nativeLamports: '100000000', // 0.1 SOL arrived
        ataMints: {} // ATA missing -> dynamically detected
      });
      chainContracts.quoteSolanaJupiterSwap = async (arg) => {
        solQuotes.push(arg);
        return { outAmount: '500000', routeLabel: 'Jupiter' };
      };
      chainContracts.executeSolanaJupiterSwap = async (arg) => {
        solExecs.push(arg);
        return { txHash: 'sol_s2_tx' };
      };

      // 1) SOL Auto mode -> leaves only exact live exec + ATA rent (2469280 lamports)
      await withMockedFetch(async (url, opts) => {
        const body = opts && opts.body ? JSON.parse(String(opts.body)) : {};
        if (body.method === 'getRecentPrioritizationFees') {
          return jsonResponse({ jsonrpc: '2.0', id: 1, result: [{ prioritizationFee: 1000000 }] });
        }
        if (body.method === 'eth_gasPrice') {
          return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x5f5e100' }); // 0.1 gwei
        }
        return jsonResponse({}, 404);
      }, async () => {
        state.swap.activeOrder = {
          walletId: wallet.id,
          status: 'SUCCESS',
          depositAddress: 'dep_sol_auto',
          followUpExecuted: false,
          followUpSolDexSwap: {
            outputMint: toSolBonk.contractAddress,
            toSymbol: 'BONK',
            preSolLamports: '0',
            expectedSolRaw: '100000000',
            gasReserveMode: 'auto',
            reserveSol: 0.0035,
            slippageBps: 100
          }
        };
        await uiController.resumeActiveSwapFollowUp();
        assert.equal(solQuotes.length, 1);
        // 100_000_000 - 2_469_280 = 97_530_720 (near-zero residual dust!)
        assert.equal(solQuotes[0].amountRaw, '97530720');
        assert.equal(solExecs[0].gasBuffer, 0.00246928);
        assert.equal(state.swap.activeOrder.followUpExecuted, true);

        // 2) SOL Extra mode -> retains full 0.01 SOL (10_000_000 lamports)
        state.swap.activeOrder = {
          walletId: wallet.id,
          status: 'SUCCESS',
          depositAddress: 'dep_sol_extra',
          followUpExecuted: false,
          followUpSolDexSwap: {
            outputMint: toSolBonk.contractAddress,
            toSymbol: 'BONK',
            preSolLamports: '0',
            expectedSolRaw: '100000000',
            gasReserveMode: 'extra',
            reserveSol: 0.01,
            slippageBps: 100
          }
        };
        await uiController.resumeActiveSwapFollowUp();
        assert.equal(solQuotes.length, 2);
        assert.equal(solQuotes[1].amountRaw, '90000000');
        assert.equal(solExecs[1].gasBuffer, 0.01);

        // 3) EVM Base Auto vs Extra
        const evmQuotes = [];
        const evmExecs = [];
        chainContracts.fetchEvmNativeAndErc20Balance = async () => ({ nativeRaw: '100000000000000000' }); // 0.1 ETH
        chainContracts.quoteEvmDexSwap = async (arg) => {
          evmQuotes.push(arg);
          return { ok: true, routeSource: 'ParaSwap', routeData: { tx: {} } };
        };
        chainContracts.executeEvmDexSwap = async (arg) => {
          evmExecs.push(arg);
          return { txHash: '0xevm_s2_tx' };
        };

        const expectedBaseWei = ((100000000n * 280000n * 115n) / 100n) + 5000000000000n + 1n;
        state.swap.activeOrder = {
          walletId: wallet.id,
          status: 'SUCCESS',
          depositAddress: 'dep_base_auto',
          followUpExecuted: false,
          followUpEvmDexSwap: {
            chainKey: 'base',
            destToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            destDecimals: 6,
            toSymbol: 'USDC',
            preNativeWei: '0',
            expectedInRaw: '100000000000000000',
            gasReserveMode: 'auto',
            reserveNative: 0.0003,
            slippageBps: 100
          }
        };
        await uiController.resumeActiveSwapFollowUp();
        assert.equal(evmQuotes[0].amountRaw, (100000000000000000n - expectedBaseWei).toString());
        assert.ok(evmExecs[0].gasBuffer < 0.0001, `Auto Base gasBuffer should be live ~0.0000372 ETH, got ${evmExecs[0].gasBuffer}`);

        state.swap.activeOrder = {
          walletId: wallet.id,
          status: 'SUCCESS',
          depositAddress: 'dep_base_extra',
          followUpExecuted: false,
          followUpEvmDexSwap: {
            chainKey: 'base',
            destToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            destDecimals: 6,
            toSymbol: 'USDC',
            preNativeWei: '0',
            expectedInRaw: '100000000000000000',
            gasReserveMode: 'extra',
            reserveNative: 0.002,
            slippageBps: 100
          }
        };
        await uiController.resumeActiveSwapFollowUp();
        assert.equal(evmQuotes[1].amountRaw, (100000000000000000n - 2000000000000000n).toString());
        assert.equal(evmExecs[1].gasBuffer, 0.002);
        await new Promise((r) => setTimeout(r, 30));
      });
    } finally {
      chainContracts.fetchSolanaNativeAndSplBalances = origSolBal;
      chainContracts.quoteSolanaJupiterSwap = origJupQ;
      chainContracts.executeSolanaJupiterSwap = origJupExec;
      chainContracts.fetchEvmNativeAndErc20Balance = origEvmBal;
      chainContracts.quoteEvmDexSwap = origEvmQ;
      chainContracts.executeEvmDexSwap = origEvmExec;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
      env.restore();
    }
  });
});

test('Wave 4 Gas Precision 4: 15s TTL & Max mode slight gas hike auto-trim vs spike block (Swap & Send)', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const wallet = state.normalizeWalletRecord({
      id: 'w_ttl_spike',
      mnemonic: TEST_MNEMONIC,
      ...keys,
      nearNamedAccount: 'alice.near',
      nativeBalances: { near: 1.0, sol: 0.5 },
      nearNep141Balances: {}
    });
    state.wallets = [wallet];
    state.activeWalletId = wallet.id;
    state.lang = 'en';

    const domMap = new Map();
    const env = createDomEnv(domMap);
    for (const id of [
      'swap-amount-in', 'swap-amount-out', 'swap-usd-in', 'swap-usd-out',
      'btn-execute-swap', 'swap-gas-fix-banner', 'swap-gas-fix-text',
      'swap-error-banner', 'swap-quote-route', 'swap-quote-rate', 'swap-quote-fee',
      'swap-auto-route-badge', 'swap-recipient-input', 'swap-recipient-contacts-btn',
      'swap-price-impact-banner', 'swap-order-card', 'swap-order-status',
      'send-asset-select', 'send-source-select', 'send-amount-input',
      'send-recipient-input', 'send-detected-net', 'send-evm-chain-row',
      'send-evm-chain-pills', 'send-route-preview', 'send-gas-fix-banner',
      'send-gas-fix-text', 'btn-send-max', 'btn-confirm-send', 'send-available-label',
      'sheet-send', 'sheet-backdrop', 'toast'
    ]) {
      domMap.set(id, env.makeEl(id, id.includes('btn') ? 'button' : (id.includes('input') || id.includes('select') || id.includes('amount') ? 'input' : 'div'), { _isSheet: id.startsWith('sheet-') }));
    }

    const origNearExec = chainContracts.executeNearRefFinanceSwap;
    const origNearSend = chainContracts.signAndSendNearTransfer;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    const origQuoteNearRef = chainContracts.quoteNearRefFinanceSwap;
    const origEstimateGas = chainContracts.estimateLiveNativeGasAsync;
    const toastLog = [];
    const toastEl = domMap.get('toast');
    let _toastTxt = '';
    Object.defineProperty(toastEl, 'textContent', {
      configurable: true,
      get: () => _toastTxt,
      set: (v) => {
        _toastTxt = String(v);
        toastLog.push(_toastTxt);
      }
    });

    env.install();
    try {
      await withMockedFetch(async () => jsonResponse({}, 404), async () => {
        chainContracts.ensureWalletSigningKeysAsync = async (w) => w;

        // ---- SWAP TTL + HIKE TESTS ----
        state.swap.fromAssetId = 'nep141:wrap.near';
        state.swap.toAssetId = '1cs_v1:near:nep141:prl.omft.near';
        const swapExecs = [];
        chainContracts.executeNearRefFinanceSwap = async (arg) => {
          swapExecs.push(arg);
          return { txHash: 'near_ref_trimmed' };
        };
        chainContracts.quoteNearRefFinanceSwap = async ({ amountRaw }) => ({
          ok: true,
          actions: [{ pool_id: 1, token_in: 'wrap.near', token_out: 'prl.omft.near', min_amount_out: '100' }],
          minAmountOut: '100',
          amountOut: '110',
          amountOutFormatted: '1.1',
          amountRaw
        });

        // Set expired live gas (16s ago > 15s TTL) at 0.00682 NEAR -> Max amount = 0.99318
        let currentSwapGas = 0.00682;
        chainContracts.estimateLiveNativeGasAsync = async () => ({
          chain: 'near',
          kind: 'dex_swap',
          gasReserve: currentSwapGas,
          exactFeeBaseUnits: nearIntents.toBaseUnits(String(currentSwapGas), 24),
          liveBalanceBaseUnits: '1000000000000000000000000',
          isLive: true,
          meta: {}
        });

        await uiController.setSwapMaxAmount();
        assert.equal(state.swap.amountIn, '0.99318');
        assert.equal(state.swap._isMaxSweep, true);

        // Simulate 16s elapsed (TTL expired) + slight gas hike 0.00682 -> 0.00882 (<5% deficit, <3x spike)
        state.swap._liveGas.ts = Date.now() - 16_000;
        currentSwapGas = 0.00882;
        state.swap.quoteData = {
          ok: true,
          compositeType: 'NEAR_TO_PRL_REF',
          quotedAt: Date.now(),
          amountOutFormatted: '1.1',
          refQuote: { ok: true, actions: [{ pool_id: 1, token_in: 'wrap.near', token_out: 'prl.omft.near', min_amount_out: '100' }], minAmountOut: '100' }
        };
        await uiController.executeActiveSwap();
        assert.equal(swapExecs.length, 1, 'Slight gas hike in Max mode must auto-trim and execute');
        assert.equal(swapExecs[0].amountRaw, nearIntents.toBaseUnits('0.99118', 24));
        assert.equal(state.swap.amountIn, '', 'Completed swap must clear form state');
        assert.ok(toastLog.some((msg) => msg.includes('auto-adjusted') && msg.includes('0.99118')), `Expected auto-adjusted toast, got ${JSON.stringify(toastLog)}`);

        // Large gas spike (0.00882 -> 0.08 NEAR, >3x and >5% deficit) -> abort before execution
        state.swap.activeOrder = null;
        await uiController.setSwapMaxAmount();
        assert.equal(state.swap.amountIn, '0.99118');
        state.swap._liveGas.ts = Date.now() - 16_000;
        currentSwapGas = 0.08;
        state.swap.quoteData = {
          ok: true,
          compositeType: 'NEAR_TO_PRL_REF',
          quotedAt: Date.now(),
          amountOutFormatted: '1.1',
          refQuote: { ok: true, actions: [{ pool_id: 1, token_in: 'wrap.near', token_out: 'prl.omft.near', min_amount_out: '100' }], minAmountOut: '100' }
        };
        await uiController.executeActiveSwap();
        assert.equal(swapExecs.length, 1, 'Large gas spike must block execution without executing swap');
        assert.ok(/spiked|auto-trim/i.test(state.swap._lastError), `Expected gas spike error, got ${state.swap._lastError}`);

        // ---- SEND TTL + HIKE TESTS ----
        let currentSendGas = 0.002;
        chainContracts.estimateLiveNativeGasAsync = async () => ({
          chain: 'near',
          kind: 'transfer',
          gasReserve: currentSendGas,
          exactFeeBaseUnits: nearIntents.toBaseUnits(String(currentSendGas), 24),
          liveBalanceBaseUnits: '1000000000000000000000000',
          isLive: true,
          meta: {}
        });
        const sendExecs = [];
        chainContracts.signAndSendNearTransfer = async (arg) => {
          sendExecs.push(arg);
          return { txHash: 'near_send_tx_1' };
        };

        uiController.openSendSheet({ symbol: 'NEAR', chainKey: 'near', recipient: 'bob.near' });
        await uiController.setSendMaxAmount();
        assert.equal(domMap.get('send-amount-input').value, '0.998');
        assert.equal(state.send._isMaxSweep, true);

        // Expire 15s TTL & bump gas slightly 0.002 -> 0.0028 (40% hike <= 50% prevGas, deficit 0.0008 <= 5%)
        toastLog.length = 0;
        state.send._liveGas.ts = Date.now() - 16_000;
        currentSendGas = 0.0028;
        await uiController.executeUnifiedSend();
        assert.equal(sendExecs.length, 1, 'Slight gas hike in Send Max mode must auto-trim and broadcast');
        assert.equal(String(sendExecs[0].amountNear), '0.9972');
        assert.ok(toastLog.some((msg) => msg.includes('auto-adjusted') && msg.includes('0.9972')), `Expected send auto-adjusted toast, got ${JSON.stringify(toastLog)}`);

        // Non-Max manual input must NEVER auto-trim
        uiController.openSendSheet({ symbol: 'NEAR', chainKey: 'near', recipient: 'bob.near' });
        domMap.get('send-amount-input').value = '0.9972';
        uiController.handleSendAmountInput();
        assert.equal(state.send._isMaxSweep, false);
        state.send._liveGas = {
          key: `${wallet.id}:near:transfer`,
          ts: Date.now() - 16_000,
          data: { chain: 'near', kind: 'transfer', gasReserve: 0.0028, exactFeeBaseUnits: nearIntents.toBaseUnits('0.0028', 24), liveBalanceBaseUnits: '1000000000000000000000000', isLive: true }
        };
        currentSendGas = 0.004;
        await uiController.executeUnifiedSend();
        assert.equal(sendExecs.length, 1, 'Manual non-Max Send must abort instead of trimming when gas rises');
        assert.ok(/insufficient/i.test(domMap.get('toast').textContent), `Expected insufficient fee toast, got ${domMap.get('toast').textContent}`);

        // Drain fire-and-forget balance refresh microtasks before tearing down mocked fetch/DOM
        await new Promise((r) => setTimeout(r, 30));
      });
    } finally {
      chainContracts.executeNearRefFinanceSwap = origNearExec;
      chainContracts.signAndSendNearTransfer = origNearSend;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
      chainContracts.quoteNearRefFinanceSwap = origQuoteNearRef;
      chainContracts.estimateLiveNativeGasAsync = origEstimateGas;
      env.restore();
    }
  });
});

test('Wave 4 P2-A: Pure CSPRNG (throws without crypto, no Math.random) & EIP-712 pruneEip712Types', async () => {
  // 1) Pure CSPRNG check in source & runtime
  const confSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/near-intents/045-nearcom-confidential.part.js'), 'utf8');
  assert.equal(confSrc.includes('Math.random'), false, '045-nearcom-confidential must not fall back to Math.random');

  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const fromNear = { symbol: 'NEAR', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 };
  const toEth = { symbol: 'ETH', blockchain: 'eth', assetId: 'nep141:eth.omft.near', decimals: 18 };

  const cryptoDesc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: undefined });
    const noCryptoRes = await nearIntents.quoteNearcomConfidentialSwap({
      fromToken: fromNear,
      toToken: toEth,
      amountRaw: '1000000000000000000000000',
      nearPrivateSeedHex: keys.nearPrivateSeedHex,
      nearPublicKey: keys.nearPublicKey,
      nearImplicitAddress: keys.nearAddress,
      dry: false
    });
    assert.equal(noCryptoRes.ok, false);
    assert.match(noCryptoRes.error, /Secure CSPRNG unavailable/i);
  } finally {
    if (cryptoDesc) Object.defineProperty(globalThis, 'crypto', cryptoDesc);
  }

  // Fallback to crypto.getRandomValues when randomUUID is absent
  const getRandomOnly = {
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i++) arr[i] = (i * 17 + 5) & 0xff;
      return arr;
    }
  };
  let capturedIdempKey = '';
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: getRandomOnly });
    await withMockedFetch(async (url, opts) => {
      const u = String(url);
      if (u.includes('/api/auth/message')) {
        return jsonResponse({ message: { message: 'Sign in', nonce: Array.from({ length: 32 }, (_, i) => i), recipient: 'intents.near' } });
      }
      if (u.includes('/api/auth/authenticate')) {
        return jsonResponse({ accessToken: 'tok_csprng', refreshToken: 'ref_1' });
      }
      if (u.includes('/api/swap/quote')) {
        const body = JSON.parse(String(opts.body));
        capturedIdempKey = body.idempotencyKey || '';
        return jsonResponse({ ok: { quote: { amountOut: '10000000000000000' } } });
      }
      throw new Error(`Unexpected URL: ${u}`);
    }, async () => {
      const okRes = await nearIntents.quoteNearcomConfidentialSwap({
        fromToken: fromNear,
        toToken: toEth,
        amountRaw: '1000000000000000000000000',
        nearPrivateSeedHex: keys.nearPrivateSeedHex,
        nearPublicKey: keys.nearPublicKey,
        nearImplicitAddress: keys.nearAddress,
        dry: false
      });
      assert.equal(okRes.ok, true);
      assert.match(capturedIdempKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });
  } finally {
    if (cryptoDesc) Object.defineProperty(globalThis, 'crypto', cryptoDesc);
  }

  // 2) pruneEip712Types strips EIP712Domain & orphan structs, preserves nested/array structs, signs cleanly with ethers
  const rawTypes = {
    EIP712Domain: [{ name: 'name', type: 'string' }, { name: 'chainId', type: 'uint256' }],
    Order: [
      { name: 'maker', type: 'address' },
      { name: 'items', type: 'Asset[]' },
      { name: 'fees', type: 'Fee[2]' }
    ],
    Asset: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint256' }],
    Fee: [{ name: 'recipient', type: 'address' }, { name: 'bps', type: 'uint16' }],
    UnusedOrphan: [{ name: 'dead', type: 'uint256' }],
    UnusedNested: [{ name: 'orphan', type: 'UnusedOrphan' }]
  };
  const cleanTypes = dappBrowser.pruneEip712Types(rawTypes, 'Order');
  assert.deepEqual(Object.keys(cleanTypes).sort(), ['Asset', 'Fee', 'Order']);
  assert.equal(cleanTypes.EIP712Domain, undefined);
  assert.equal(cleanTypes.UnusedOrphan, undefined);

  const signer = new ethers.Wallet('0x0123456789012345678901234567890123456789012345678901234567890123');
  const sig = await signer.signTypedData(
    { name: 'TestDApp', chainId: 1 },
    cleanTypes,
    {
      maker: signer.address,
      items: [{ token: '0x0000000000000000000000000000000000000001', amount: '100' }],
      fees: [
        { recipient: '0x0000000000000000000000000000000000000002', bps: 10 },
        { recipient: '0x0000000000000000000000000000000000000003', bps: 20 }
      ]
    }
  );
  assert.match(sig, /^0x[0-9a-f]{130}$/i);
});

test('Wave 4 P2-B: WC setApprovalForAll(false) has no warning, eth_sign & high-risk approvals show red risk banner', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const wallet = state.normalizeWalletRecord({ id: 'w_wc_ui', mnemonic: TEST_MNEMONIC, ...keys });
    state.wallets = [wallet];
    state.activeWalletId = wallet.id;
    state.lang = 'en';
    state.wc.client = {
      getActiveSessions: () => ({}),
      session: { get: () => ({ peer: { metadata: { name: 'TestDApp' } } }) }
    };

    const domMap = new Map();
    const env = createDomEnv(domMap);
    for (const id of [
      'wc-request-card', 'wc-request-method', 'wc-request-dapp', 'wc-request-payload',
      'wc-proposal-card', 'wc-sessions-list', 'wc-project-id-input', 'wc-uri-input',
      'wc-advanced-drawer', 'wc-status-pill', 'btn-wc-request-approve', 'btn-wc-request-reject',
      'sheet-walletconnect', 'sheet-backdrop', 'toast'
    ]) {
      domMap.set(id, env.makeEl(id, id.includes('btn') ? 'button' : 'div', { _isSheet: id === 'sheet-walletconnect' }));
    }
    const rCard = domMap.get('wc-request-card');
    rCard.appendChild(domMap.get('wc-request-method'));
    rCard.appendChild(domMap.get('wc-request-dapp'));
    rCard.appendChild(domMap.get('wc-request-payload'));

    const prevFw = globalThis.NearCAFramework;
    globalThis.NearCAFramework = { mountWcProposalPanel() {}, mountWcSessionsPanel() {} };
    env.install();
    try {
      const opPadded = '000000000000000000000000' + '1111111111111111111111111111111111111111';
      const zeroArg = '0'.repeat(64);
      const oneArg = '0'.repeat(63) + '1';

      // 1) setApprovalForAll(operator, false) -> no ⚠️, banner hidden, card not is-high-risk
      state.wc.pendingRequest = {
        id: 1,
        topic: 't1',
        params: {
          chainId: 'eip155:1',
          request: {
            method: 'eth_sendTransaction',
            params: [{ to: '0x2222222222222222222222222222222222222222', value: '0x0', data: `0xa22cb465${opPadded}${zeroArg}` }]
          }
        }
      };
      await uiController.openWalletConnectSheet();
      const revokePayload = domMap.get('wc-request-payload').textContent;
      assert.equal(revokePayload.includes('⚠️'), false, `Revoke setApprovalForAll(false) must NOT show ⚠️: ${revokePayload}`);
      assert.ok(/Revoke|Revoked/i.test(revokePayload));
      assert.equal(rCard.classList.contains('is-high-risk'), false);
      const bannerEl = domMap.get('wc-request-risk-banner');
      if (bannerEl) assert.equal(bannerEl.classList.contains('hidden'), true);

      // 2) setApprovalForAll(operator, true) -> red risk banner + is-high-risk
      state.wc.pendingRequest = {
        id: 2,
        topic: 't1',
        params: {
          chainId: 'eip155:1',
          request: {
            method: 'eth_sendTransaction',
            params: [{ to: '0x2222222222222222222222222222222222222222', value: '0x0', data: `0xa22cb465${opPadded}${oneArg}` }]
          }
        }
      };
      await uiController.openWalletConnectSheet();
      assert.equal(rCard.classList.contains('is-high-risk'), true);
      assert.equal(domMap.get('wc-request-risk-banner').classList.contains('hidden'), false);
      assert.ok(domMap.get('wc-request-risk-banner').textContent.includes('NFT'));

      // 3) eth_sign -> red risk banner + is-high-risk
      state.wc.pendingRequest = {
        id: 3,
        topic: 't1',
        params: {
          chainId: 'eip155:1',
          request: {
            method: 'eth_sign',
            params: [wallet.mpcEvmAddress, '0x' + 'aa'.repeat(32)]
          }
        }
      };
      await uiController.openWalletConnectSheet();
      assert.equal(rCard.classList.contains('is-high-risk'), true);
      const ethSignBanner = domMap.get('wc-request-risk-banner');
      assert.ok(ethSignBanner && !ethSignBanner.classList.contains('hidden'));
      assert.ok(ethSignBanner.textContent.includes('eth_sign'));
    } finally {
      if (prevFw === undefined) delete globalThis.NearCAFramework;
      else globalThis.NearCAFramework = prevFw;
      env.restore();
    }
  });
});

test('Wave 4 P2-C: 42 local-only bundled icons resolve locally first & PTR dy=6 deadzone', () => {
  // 1) All local-only symbols (not inline data:image in TOKEN_ICON_MAP) resolve to existing assets/icons/*
  const localMap = tokenRegistry.LOCAL_TOKEN_ICON_MAP || {};
  const iconMap = tokenRegistry.TOKEN_ICON_MAP || {};
  const localOnlySymbols = Object.keys(localMap).filter((sym) => {
    const mapped = iconMap[sym];
    return !(typeof mapped === 'string' && mapped.startsWith('data:image/'));
  });
  assert.ok(localOnlySymbols.length >= 42, `Expected >= 42 non-inline local bundled icons, got ${localOnlySymbols.length}`);

  for (const sym of localOnlySymbols) {
    const resolved = tokenRegistry.resolveTokenIcon({ symbol: sym, blockchain: sym.includes(':') ? 'hype' : 'eth' });
    assert.ok(
      resolved.primaryUrl.startsWith('assets/icons/'),
      `Expected local icon for ${sym}, got ${resolved.primaryUrl}`
    );
    const diskPath = path.join(ROOT_DIR, resolved.primaryUrl);
    assert.ok(fs.existsSync(diskPath), `Missing local icon file on disk for ${sym}: ${diskPath}`);
  }

  // Explicit custom logoURI (different from TOKEN_ICON_MAP) wins over bundled icon
  const customLogo = tokenRegistry.resolveTokenIcon({
    symbol: 'ENA',
    blockchain: 'eth',
    logoURI: 'https://custom.example/ena-override.png'
  });
  assert.equal(customLogo.primaryUrl, 'https://custom.example/ena-override.png');

  // seedLivePricesCache upgrades remote https:// logoURI for bundled tokens, keeps empty ''
  const seeded = [
    { assetId: 'eth:0x57e114b691db790c35207b2e685d4a43181e6061', symbol: 'ENA', blockchain: 'eth', logoURI: 'https://remote.example/ena.png' },
    { assetId: 'eth:0x0000', symbol: 'ENA', blockchain: 'eth', logoURI: '' }
  ];
  nearIntents.seedLivePricesCache(seeded);
  assert.equal(seeded[0].logoURI, localMap.ENA);
  assert.equal(seeded[1].logoURI, '');

  // 2) PTR dy=6 deadzone: dy=5 and dy=6 do NOT trigger pulling; dy=7 triggers pulling
  const domMap = new Map();
  const env = createDomEnv(domMap);
  const viewWallet = env.makeEl('view-wallet');
  const ind = env.makeEl('home-ptr-indicator');
  const txt = env.makeEl('home-ptr-text');
  domMap.set('view-wallet', viewWallet);
  domMap.set('home-ptr-indicator', ind);
  domMap.set('home-ptr-text', txt);

  env.install();
  try {
    uiController.initHomePullToRefresh();

    // Touch start at y=100, move to y=105 (dy=5) -> inside 6px deadzone
    viewWallet.dispatchEvent({ type: 'touchstart', touches: [{ clientX: 150, clientY: 100 }] });
    viewWallet.dispatchEvent({ type: 'touchmove', touches: [{ clientX: 150, clientY: 105 }], cancelable: true, preventDefault() {} });
    assert.equal(viewWallet.classList.contains('ptr-pulling'), false, 'dy=5 must stay within PTR deadzone');
    assert.equal(ind.classList.contains('pulling'), false);

    // Move to y=106 (dy=6) -> still inside dist <= 6 deadzone
    viewWallet.dispatchEvent({ type: 'touchmove', touches: [{ clientX: 150, clientY: 106 }], cancelable: true, preventDefault() {} });
    assert.equal(viewWallet.classList.contains('ptr-pulling'), false, 'dy=6 must stay within PTR deadzone');
    assert.equal(ind.classList.contains('pulling'), false);

    // Move to y=107 (dy=7) -> crosses deadzone and activates pulling
    let prevented = false;
    viewWallet.dispatchEvent({ type: 'touchmove', touches: [{ clientX: 150, clientY: 107 }], cancelable: true, preventDefault() { prevented = true; } });
    assert.equal(viewWallet.classList.contains('ptr-pulling'), true, 'dy=7 must engage PTR');
    assert.equal(ind.classList.contains('pulling'), true);
    assert.equal(prevented, true);

    viewWallet.dispatchEvent({ type: 'touchcancel' });
  } finally {
    env.restore();
  }
});
