'use strict';

const vm = require('node:vm');
const {
  test,
  assert,
  cryptoEngine,
  tokenRegistry,
  nearIntents,
  chainContracts,
  limitOrders,
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

function withMockedDomAndWindow(domMap, fn) {
  const prevDoc = globalThis.document;
  const prevWin = globalThis.window;
  const prevEthers = globalThis.ethers;
  const prevSetInterval = globalThis.setInterval;
  const prevClearInterval = globalThis.clearInterval;

  const doc = {
    hidden: false,
    documentElement: {
      lang: 'en',
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false }
    },
    body: {
      classList: { toggle() {}, add() {}, remove() {}, contains: () => false }
    },
    addEventListener() {},
    removeEventListener() {},
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
  globalThis.document = doc;
  globalThis.ethers = ethers;
  globalThis.window = globalThis;

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
      if (prevEthers === undefined) delete globalThis.ethers;
      else globalThis.ethers = prevEthers;
      globalThis.setInterval = prevSetInterval;
      globalThis.clearInterval = prevClearInterval;
    });
}

test('Audit closure P0: SMART_HUB_ROUTE executes first-stage BRIDGE_OUT (native & NEP-141) with DEST_DEX follow-up and blocks unsupported stage fallthrough', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const wallet = state.normalizeWalletRecord({
      id: 'w_hub_bridge_out',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nearPrivateSeedHex: keys.nearPrivateSeedHex,
      solAddress: keys.solAddress,
      mpcEvmAddress: keys.mpcEvmAddress,
      evmAddress: keys.mpcEvmAddress,
      nativeBalances: { near: 5, sol: 0.2, eth: 0.1 },
      nearNep141Balances: { 'pearl.near': { raw: '50000000000', formatted: 500 } }
    });
    state.wallets = [wallet];
    state.activeWalletId = wallet.id;
    state.lang = 'en';

    const domMap = new Map([
      ['swap-amount-in', createMockDomElement('swap-amount-in', { value: '1' })],
      ['swap-amount-out', createMockDomElement('swap-amount-out', { value: '5' })],
      ['swap-order-card', createMockDomElement('swap-order-card')],
      ['swap-order-status', createMockDomElement('swap-order-status')],
      ['swap-order-deposit-addr', createMockDomElement('swap-order-deposit-addr')]
    ]);

    const origQuoteIntent = nearIntents.quoteIntentSwapOrWithdraw;
    const origSubmitTx = nearIntents.submitExternalDepositTxHash;
    const origFetchStatus = nearIntents.fetchSwapOrderStatus;
    const origNearTransfer = chainContracts.signAndSendNearTransfer;
    const origNep141Transfer = chainContracts.executeNearNep141Transfer;
    const origFetchSol = chainContracts.fetchSolanaNativeAndSplBalances;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;

    const quoteCalls = [];
    const nearTxCalls = [];
    const nep141TxCalls = [];
    const submittedHashes = [];

    nearIntents.quoteIntentSwapOrWithdraw = async (params) => {
      quoteCalls.push(params);
      return {
        ok: true,
        depositAddress: 'bridge-deposit.intents.near',
        memo: 'memo-1',
        amountOut: '250000000'
      };
    };
    nearIntents.submitExternalDepositTxHash = async (p) => {
      submittedHashes.push(p);
      return { ok: true };
    };
    nearIntents.fetchSwapOrderStatus = async () => ({ ok: true, status: 'PENDING_DEPOSIT' });
    chainContracts.signAndSendNearTransfer = async (p) => {
      nearTxCalls.push(p);
      return { txHash: 'near_bridge_out_tx_1' };
    };
    chainContracts.executeNearNep141Transfer = async (p) => {
      nep141TxCalls.push(p);
      return { txHash: 'nep141_bridge_out_tx_2' };
    };
    chainContracts.fetchSolanaNativeAndSplBalances = async () => ({ nativeLamports: '100000000', nativeSol: 0.1 });
    chainContracts.ensureWalletSigningKeysAsync = async () => wallet;

    try {
      await withMockedDomAndWindow(domMap, async () => {
        const fromNear = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.blockchain === 'near' && t.symbol === 'NEAR');
        const toSolUsdc = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.blockchain === 'sol' && t.symbol === 'USDC')
          || tokenRegistry.DEX_CHAIN_TOKENS.sol.find((t) => t.symbol === 'USDC');
        assert.ok(fromNear && toSolUsdc, 'Expected NEAR and SOL USDC tokens in registry');

        // 1) Native NEAR BRIDGE_OUT -> SOL DEST_DEX
        state.swap.fromAssetId = fromNear.assetId;
        state.swap.toAssetId = toSolUsdc.assetId;
        state.swap.amountIn = '1';
        state.swap.activeOrder = null;
        state.swap.quoteData = {
          compositeType: 'SMART_HUB_ROUTE',
          amountOut: '5000000',
          quotedAt: Date.now(),
          stages: [
            {
              type: 'BRIDGE_OUT',
              originAsset: 'nep141:wrap.near',
              destinationAsset: 'nep141:sol.omft.near',
              expectedOut: '250000000'
            },
            {
              type: 'DEST_DEX',
              chain: 'sol',
              expectedOut: '5000000'
            }
          ]
        };

        await uiController.executeActiveSwap();
        assert.equal(quoteCalls.length, 1);
        assert.equal(quoteCalls[0].depositType, 'ORIGIN_CHAIN');
        assert.equal(quoteCalls[0].recipientType, 'DESTINATION_CHAIN');
        assert.equal(quoteCalls[0].recipient, wallet.solAddress);
        assert.equal(nearTxCalls.length, 1);
        assert.equal(nearTxCalls[0].receiverId, 'bridge-deposit.intents.near');
        assert.ok(state.swap.activeOrder && state.swap.activeOrder.originTxHash === 'near_bridge_out_tx_1');
        assert.ok(state.swap.activeOrder.followUpSolDexSwap, 'Must attach followUpSolDexSwap for DEST_DEX');
        assert.equal(state.swap.activeOrder.followUpSolDexSwap.outputMint, toSolUsdc.contractAddress);
        assert.equal(submittedHashes[0].txHash, 'near_bridge_out_tx_1');
        if (typeof globalThis.clearActiveSwapOrder === 'function') globalThis.clearActiveSwapOrder();

        // 2) NEP-141 BRIDGE_OUT first stage
        const fromPrlNear = {
          assetId: 'nep141:pearl.near',
          symbol: 'PRL',
          blockchain: 'near',
          contractAddress: 'pearl.near',
          decimals: 8
        };
        const prevCore = tokenRegistry.UNIFIED_CORE_TOKENS.slice();
        tokenRegistry.UNIFIED_CORE_TOKENS.push(fromPrlNear);
        try {
          state.swap.fromAssetId = fromPrlNear.assetId;
          state.swap.toAssetId = toSolUsdc.assetId;
          state.swap.amountIn = '10';
          state.swap.activeOrder = null;
          state.swap.quoteData = {
            compositeType: 'SMART_HUB_ROUTE',
            amountOut: '4000000',
            quotedAt: Date.now(),
            stages: [
              {
                type: 'BRIDGE_OUT',
                originAsset: 'nep141:pearl.near',
                destinationAsset: 'nep141:sol.omft.near',
                hubContract: 'pearl.near',
                hubDecimals: 8,
                hubSymbol: 'PRL',
                expectedOut: '200000000'
              },
              {
                type: 'DEST_DEX',
                chain: 'sol',
                expectedOut: '4000000'
              }
            ]
          };
          await uiController.executeActiveSwap();
          assert.equal(nep141TxCalls.length, 1);
          assert.equal(nep141TxCalls[0].tokenContract, 'pearl.near');
          assert.equal(nep141TxCalls[0].receiverId, 'bridge-deposit.intents.near');
          assert.equal(state.swap.activeOrder.originTxHash, 'nep141_bridge_out_tx_2');
          if (typeof globalThis.clearActiveSwapOrder === 'function') globalThis.clearActiveSwapOrder();
        } finally {
          tokenRegistry.UNIFIED_CORE_TOKENS.length = 0;
          tokenRegistry.UNIFIED_CORE_TOKENS.push(...prevCore);
        }

        // 3) Unsupported SMART_HUB_ROUTE stage must abort (not fall through to 1Click direct)
        state.swap.fromAssetId = fromNear.assetId;
        state.swap.toAssetId = toSolUsdc.assetId;
        state.swap.amountIn = '1';
        state.swap.activeOrder = null;
        state.swap.quoteData = {
          compositeType: 'SMART_HUB_ROUTE',
          amountOut: '5000000',
          quotedAt: Date.now(),
          stages: [{ type: 'UNKNOWN_FUTURE_STAGE' }]
        };
        const quoteCountBefore = quoteCalls.length;
        await uiController.executeActiveSwap();
        assert.equal(quoteCalls.length, quoteCountBefore, 'Unsupported SMART_HUB_ROUTE stage must not fall through to direct 1Click');
        assert.equal(state.swap.activeOrder, null);
      });
    } finally {
      if (typeof globalThis.clearActiveSwapOrder === 'function') globalThis.clearActiveSwapOrder();
      nearIntents.quoteIntentSwapOrWithdraw = origQuoteIntent;
      nearIntents.submitExternalDepositTxHash = origSubmitTx;
      nearIntents.fetchSwapOrderStatus = origFetchStatus;
      chainContracts.signAndSendNearTransfer = origNearTransfer;
      chainContracts.executeNearNep141Transfer = origNep141Transfer;
      chainContracts.fetchSolanaNativeAndSplBalances = origFetchSol;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
    }
  });
});

test('Audit closure P0: confirmRotateNearAccountKey never hijacks pure MPC wallets into legacyEvmMnemonic/legacySolMnemonic, while preserving local-key wallets', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const newMnemonic = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

    const pureMpcWallet = state.normalizeWalletRecord({
      id: 'w_pure_mpc_rotate',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nearPrivateSeedHex: keys.nearPrivateSeedHex,
      mpcEvmAddress: keys.mpcEvmAddress,
      evmAddress: keys.mpcEvmAddress,
      solAddress: keys.solAddress,
      nativeBalances: { near: 2, eth: 1.5, sol: 2.0, prl: 0, btc: 0 }
    });
    assert.equal(pureMpcWallet.evmPrivateKey, '');
    assert.equal(pureMpcWallet.solPrivateSeedHex, '');

    const localKeyWallet = state.normalizeWalletRecord({
      id: 'w_local_key_rotate',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'bob.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nearPrivateSeedHex: keys.nearPrivateSeedHex,
      evmPrivateKey: '0x0123456789012345678901234567890123456789012345678901234567890123',
      solPrivateSeedHex: keys.nearPrivateSeedHex,
      mpcEvmAddress: keys.mpcEvmAddress,
      evmAddress: new ethers.Wallet('0x0123456789012345678901234567890123456789012345678901234567890123').address,
      solAddress: keys.solAddress,
      nativeBalances: { near: 2, eth: 1.5, sol: 2.0, prl: 0, btc: 0 }
    });

    const rotInput = createMockDomElement('near-keys-rotate-mnemonic', { value: newMnemonic });
    const rotBtn = createMockDomElement('btn-near-keys-rotate-confirm', { textContent: 'Rotate' });
    const domMap = new Map([
      ['near-keys-rotate-mnemonic', rotInput],
      ['btn-near-keys-rotate-confirm', rotBtn]
    ]);

    const origFetchPrl = chainContracts.fetchPearlNativeBalance;
    const origFetchBtc = chainContracts.fetchBitcoinNativeBalance;
    const origRotate = chainContracts.rotateNearAccountKeyAsync;
    const origFetchKeys = chainContracts.fetchNearAccessKeysAsync;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    const origConfirm = globalThis.confirm;

    chainContracts.fetchPearlNativeBalance = async () => 0;
    chainContracts.fetchBitcoinNativeBalance = async () => 0;
    chainContracts.fetchNearAccessKeysAsync = async () => ({ keys: [] });
    chainContracts.ensureWalletSigningKeysAsync = async (w) => w;
    chainContracts.rotateNearAccountKeyAsync = async ({ newMnemonic: nextP }) => {
      const derived = await cryptoEngine.deriveNearFromSeedAsync(nextP, 0);
      return { addTxHash: 'near_add_1', deleteTxHash: 'near_del_1', newDerived: { ...derived, mnemonic: nextP } };
    };

    try {
      await withMockedDomAndWindow(domMap, async () => {
        let confirmPrompts = 0;
        globalThis.confirm = () => { confirmPrompts += 1; return true; };

        // 1) Pure MPC wallet must NOT be hijacked into legacyEvmMnemonic/legacySolMnemonic
        state.wallets = [pureMpcWallet];
        state.activeWalletId = pureMpcWallet.id;
        await uiController.confirmRotateNearAccountKey();
        assert.equal(pureMpcWallet.legacyEvmMnemonic, '', 'Pure MPC wallet must NOT set legacyEvmMnemonic');
        assert.equal(pureMpcWallet.legacySolMnemonic, '', 'Pure MPC wallet must NOT set legacySolMnemonic');
        assert.equal(confirmPrompts, 0, 'Pure MPC wallet with 0 PRL/BTC must not show false EVM/Solana legacy warning');

        // 2) Local-key wallet MUST preserve legacyEvmMnemonic & legacySolMnemonic and prompt
        rotInput.value = newMnemonic;
        state.wallets = [localKeyWallet];
        state.activeWalletId = localKeyWallet.id;
        await uiController.confirmRotateNearAccountKey();
        assert.equal(confirmPrompts, 1, 'Local-key wallet with EVM/SOL balances must warn before rotate');
        assert.equal(localKeyWallet.legacyEvmMnemonic, TEST_MNEMONIC);
        assert.equal(localKeyWallet.legacySolMnemonic, TEST_MNEMONIC);
      });
    } finally {
      chainContracts.fetchPearlNativeBalance = origFetchPrl;
      chainContracts.fetchBitcoinNativeBalance = origFetchBtc;
      chainContracts.rotateNearAccountKeyAsync = origRotate;
      chainContracts.fetchNearAccessKeysAsync = origFetchKeys;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
      if (origConfirm === undefined) delete globalThis.confirm;
      else globalThis.confirm = origConfirm;
    }
  });
});

test('Audit closure P1: EVM executeEvmRawSteps intermediate/final revert & sendEvmMpcSignedTransaction terminal receipt + CoW ETH USDT zero-reset', async () => {
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const localPriv = '0x0123456789012345678901234567890123456789012345678901234567890123';
  const localAddr = new ethers.Wallet(localPriv).address;
  const wallet = state.normalizeWalletRecord({
    id: 'w_evm_receipts',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    evmPrivateKey: localPriv,
    evmAddress: localAddr,
    mpcEvmAddress: keys.mpcEvmAddress,
    nativeBalances: { eth: 1, base: 1 }
  });

  const prevEthers = globalThis.ethers;
  globalThis.ethers = ethers;
  try {
    // 1) executeEvmRawSteps intermediate step revert stops before step 2
    const parseRpcBody = (opts) => {
      const raw = typeof opts?.body === 'string' ? opts.body : Buffer.from(opts?.body || '{}').toString('utf8');
      return JSON.parse(raw);
    };
    const rpcOk = (body) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
    const mockBlock = {
      hash: '0x' + '1'.repeat(64),
      parentHash: '0x' + '0'.repeat(64),
      number: '0x10',
      timestamp: '0x65000000',
      nonce: '0x0000000000000000',
      difficulty: '0x0',
      gasLimit: '0x1c9c380',
      gasUsed: '0x0',
      miner: '0x' + '0'.repeat(40),
      extraData: '0x',
      baseFeePerGas: '0x3b9aca00',
      transactions: []
    };
    const handleRpcItem = (b, onSend) => {
      if (b.method === 'eth_chainId') return { jsonrpc: '2.0', id: b.id, result: '0x1' };
      if (b.method === 'eth_getTransactionCount') return { jsonrpc: '2.0', id: b.id, result: '0x1' };
      if (b.method === 'eth_feeHistory' || b.method === 'eth_maxPriorityFeePerGas') return { jsonrpc: '2.0', id: b.id, result: '0x3b9aca00' };
      if (b.method === 'eth_gasPrice') return { jsonrpc: '2.0', id: b.id, result: '0x3b9aca00' };
      if (b.method === 'eth_getBlockByNumber') return { jsonrpc: '2.0', id: b.id, result: mockBlock };
      if (b.method === 'eth_estimateGas') return { jsonrpc: '2.0', id: b.id, result: '0x5208' };
      if (b.method === 'eth_sendRawTransaction') return onSend(b);
      if (b.method === 'eth_getTransactionReceipt') {
        return { jsonrpc: '2.0', id: b.id, result: { transactionHash: b.params[0], blockNumber: '0x10', status: '0x0' } };
      }
      return { jsonrpc: '2.0', id: b.id, result: '0x0' };
    };
    let broadcastIdx = 0;
    const sentDatas = [];
    await withMockedFetch(async (_url, opts) => {
      const parsed = parseRpcBody(opts);
      const runOne = (b) => handleRpcItem(b, (item) => {
        broadcastIdx += 1;
        sentDatas.push(ethers.Transaction.from(item.params[0]).data);
        return { jsonrpc: '2.0', id: item.id, result: ethers.keccak256(item.params[0]) };
      });
      return rpcOk(Array.isArray(parsed) ? parsed.map(runOne) : runOne(parsed));
    }, async () => {
      await assert.rejects(
        () => chainContracts.executeEvmRawSteps({
          wallet,
          chainKey: 'eth',
          steps: [
            { to: '0x2222222222222222222222222222222222222222', data: '0x1111', value: '0', gasLimit: '21000' },
            { to: '0x2222222222222222222222222222222222222222', data: '0x2222', value: '0', gasLimit: '21000' }
          ]
        }),
        /reverted|执行失败/i
      );
      assert.equal(broadcastIdx, 1, 'Step 0 revert must halt before broadcasting step 1');
    });

    // 2) CoW ETH USDT allowance > 0 inserts approve(0) before approve(MaxUint256)
    broadcastIdx = 0;
    sentDatas.length = 0;
    const usdtAddr = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
    await withMockedFetch(async (_url, opts) => {
      const parsed = parseRpcBody(opts);
      const runOne = (b) => {
        if (b.method === 'eth_chainId') return { jsonrpc: '2.0', id: b.id, result: '0x1' };
        if (b.method === 'eth_call') {
          return { jsonrpc: '2.0', id: b.id, result: '0x' + (100n).toString(16).padStart(64, '0') };
        }
        if (b.method === 'eth_getTransactionCount') return { jsonrpc: '2.0', id: b.id, result: '0x' + (broadcastIdx + 1).toString(16) };
        if (b.method === 'eth_gasPrice' || b.method === 'eth_maxPriorityFeePerGas') return { jsonrpc: '2.0', id: b.id, result: '0x3b9aca00' };
        if (b.method === 'eth_getBlockByNumber') return { jsonrpc: '2.0', id: b.id, result: mockBlock };
        if (b.method === 'eth_estimateGas') return { jsonrpc: '2.0', id: b.id, result: '0xc350' };
        if (b.method === 'eth_sendRawTransaction') {
          broadcastIdx += 1;
          sentDatas.push(ethers.Transaction.from(b.params[0]).data);
          return { jsonrpc: '2.0', id: b.id, result: ethers.keccak256(b.params[0]) };
        }
        if (b.method === 'eth_getTransactionReceipt') {
          return { jsonrpc: '2.0', id: b.id, result: { transactionHash: b.params[0], blockNumber: '0x20', status: '0x1' } };
        }
        return { jsonrpc: '2.0', id: b.id, result: '0x1' };
      };
      return rpcOk(Array.isArray(parsed) ? parsed.map(runOne) : runOne(parsed));
    }, async () => {
      const res = await limitOrders.approveEvmCowToken({
        wallet,
        chainKey: 'eth',
        tokenAddress: usdtAddr
      });
      assert.ok(res && res.receipt && res.receipt.status === '0x1');
      assert.equal(sentDatas.length, 2, 'USDT with non-zero allowance must broadcast approve(0) then approve(MaxUint256)');
      assert.ok(sentDatas[0].endsWith('0'.repeat(64)), 'First tx must reset allowance to 0');
      assert.ok(sentDatas[1].endsWith('f'.repeat(64)), 'Second tx must approve MaxUint256');
    });

    // 3) sendEvmMpcSignedTransaction validates terminal receipt status
    const mpcWallet = ethers.Wallet.createRandom();
    const mpcOnlyWallet = {
      id: 'w_mpc_evm_rec',
      accountType: 'standard',
      nearNamedAccount: 'alice.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nearPrivateSeedHex: keys.nearPrivateSeedHex,
      mpcEvmAddress: mpcWallet.address,
      evmAddress: mpcWallet.address,
      nativeBalances: { near: 2, eth: 1 }
    };
    const origMpcSign = chainContracts.requestNearMpcChainSignature;
    chainContracts.requestNearMpcChainSignature = async ({ payloadHash32Bytes }) => {
      const sigHex = mpcWallet.signingKey.sign(payloadHash32Bytes);
      return {
        mpcSignature: {
          big_r: { affine_point: '02' + sigHex.r.slice(2) },
          s: { scalar: sigHex.s.slice(2) },
          recovery_id: sigHex.yParity
        }
      };
    };
    try {
      let mpcReceiptStatus = '0x0';
      await withMockedFetch(async (_url, opts) => {
        const parsed = parseRpcBody(opts);
        const runOne = (b) => {
          if (b.method === 'eth_getTransactionReceipt') {
            return { jsonrpc: '2.0', id: b.id, result: { transactionHash: b.params[0], blockNumber: '0x30', status: mpcReceiptStatus } };
          }
          return handleRpcItem(b, (item) => ({ jsonrpc: '2.0', id: item.id, result: ethers.keccak256(item.params[0]) }));
        };
        return rpcOk(Array.isArray(parsed) ? parsed.map(runOne) : runOne(parsed));
      }, async () => {
        await assert.rejects(
          () => chainContracts.sendEvmMpcSignedTransaction({
            wallet: mpcOnlyWallet,
            chainKey: 'eth',
            to: '0x2222222222222222222222222222222222222222',
            value: '1'
          }),
          /reverted|执行失败/i
        );
        mpcReceiptStatus = '0x1';
        const okRes = await chainContracts.sendEvmMpcSignedTransaction({
          wallet: mpcOnlyWallet,
          chainKey: 'eth',
          to: '0x2222222222222222222222222222222222222222',
          value: '1'
        });
        assert.ok(okRes && okRes.txHash && okRes.receipt && okRes.receipt.status === '0x1');
      });
    } finally {
      chainContracts.requestNearMpcChainSignature = origMpcSign;
    }
  } finally {
    if (prevEthers === undefined) delete globalThis.ethers;
    else globalThis.ethers = prevEthers;
  }
});

test('Audit closure P1: Solana multisig slot matching (Legacy & v0), non-signer rejection, terminal confirmation err & Jupiter already-processed guard', async () => {
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const feePayerBytes = Buffer.alloc(32, 0x22);
  const signerBytes = Buffer.from(cryptoEngine.base58Decode(keys.solAddress));
  const progBytes = Buffer.alloc(32, 0x33);
  const msgTail = Buffer.from([1, 0, 1, 2, 0, 1, 0]); // dummy blockhash/ix bytes tail

  // Legacy tx with 2 required signers: slot 0 = feePayer, slot 1 = wallet.solAddress
  const legacyTx = Buffer.concat([
    Buffer.from([2]),
    Buffer.alloc(64),
    Buffer.alloc(64),
    Buffer.from([2, 0, 1, 3]),
    feePayerBytes,
    signerBytes,
    progBytes,
    Buffer.alloc(32, 0x55),
    msgTail
  ]).toString('base64');

  const signedLegacy = await chainContracts.signSolanaBase64Tx(legacyTx, keys.nearPrivateSeedHex, { solAddress: keys.solAddress });
  assert.equal(signedLegacy.slotIndex, 1, 'Legacy multisig must sign at slotIndex 1');
  assert.ok(Buffer.from(signedLegacy.txBytes.slice(1, 65)).every((b) => b === 0), 'Slot 0 signature must remain untouched');
  assert.ok(Buffer.from(signedLegacy.txBytes.slice(65, 129)).some((b) => b !== 0), 'Slot 1 signature must be populated');

  // Versioned v0 (0x80) tx with 2 required signers: slot 1 = wallet.solAddress
  const v0Tx = Buffer.concat([
    Buffer.from([2]),
    Buffer.alloc(64),
    Buffer.alloc(64),
    Buffer.from([0x80, 2, 0, 1, 3]),
    feePayerBytes,
    signerBytes,
    progBytes,
    Buffer.alloc(32, 0x66),
    msgTail
  ]).toString('base64');
  const signedV0 = await chainContracts.signSolanaBase64Tx(v0Tx, keys.nearPrivateSeedHex, { solAddress: keys.solAddress });
  assert.equal(signedV0.slotIndex, 1, 'Versioned v0 multisig must sign at slotIndex 1');

  // Non-signer rejection when wallet.solAddress is only at non-signer index 1 (numReqSigs = 1)
  const nonSignerTx = Buffer.concat([
    Buffer.from([1]),
    Buffer.alloc(64),
    Buffer.from([1, 0, 1, 2]),
    feePayerBytes,
    signerBytes,
    Buffer.alloc(32, 0x77)
  ]).toString('base64');
  await assert.rejects(
    () => chainContracts.signSolanaBase64Tx(nonSignerTx, keys.nearPrivateSeedHex, { solAddress: keys.solAddress }),
    /签名列表|required signers/i
  );

  // Solana signAndBroadcastSolanaBase64Tx rejects when getSignatureStatuses returns err
  await withMockedFetch(async (_url, opts) => {
    const b = JSON.parse(opts.body);
    if (b.method === 'sendTransaction') return jsonResponse({ jsonrpc: '2.0', id: b.id, result: 'SolFailSig111111111111111111111111111111' });
    if (b.method === 'getSignatureStatuses') {
      return jsonResponse({ jsonrpc: '2.0', id: b.id, result: { value: [{ confirmationStatus: 'confirmed', err: { InstructionError: [0, 'Custom'] } }] } });
    }
    return jsonResponse({}, 404);
  }, async () => {
    await assert.rejects(
      () => chainContracts.signAndBroadcastSolanaBase64Tx(legacyTx, keys.nearPrivateSeedHex, { solAddress: keys.solAddress }),
      /执行失败|failed/i
    );
  });

  // Jupiter Trigger: already processed with stVal === null must NOT falsely succeed
  const jupWallet = state.normalizeWalletRecord({
    id: 'w_jup_already_proc',
    mnemonic: TEST_MNEMONIC,
    solAddress: keys.solAddress,
    nativeBalances: { sol: 1 },
    splBalances: { EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 100 }
  });
  jupWallet.solPrivateSeedHex = keys.nearPrivateSeedHex;
  const singleSolTx = Buffer.concat([
    Buffer.from([1]),
    Buffer.alloc(64),
    Buffer.from([1, 0, 1, 1]),
    signerBytes,
    Buffer.alloc(32, 0x88)
  ]).toString('base64');
  await withMockedFetch(async (url, opts) => {
    if (url.includes('/trigger/v1/createOrder')) return jsonResponse({ requestId: 'req_ap', transaction: singleSolTx, order: 'Ord111' });
    if (url.includes('/trigger/v1/execute')) return jsonResponse({ error: 'temporary gateway error' }, 502);
    const b = JSON.parse(opts.body || '{}');
    if (b.method === 'sendTransaction') return jsonResponse({ jsonrpc: '2.0', id: b.id, error: { code: -32002, message: 'Transaction already processed' } });
    if (b.method === 'getSignatureStatuses') return jsonResponse({ jsonrpc: '2.0', id: b.id, result: { value: [null] } });
    return jsonResponse({}, 404);
  }, async () => {
    await assert.rejects(
      () => limitOrders.placeSolanaLimitOrder({
        wallet: jupWallet,
        inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        outputMint: limitOrders.SOL_NATIVE_MINT,
        makingAmount: '10000000',
        takingAmount: '200000000',
        inputUsdValue: 10,
        sellBalance: 100,
        sellDecimals: 6,
        sellSymbol: 'USDC'
      }),
      /already processed/i
    );
  });
});

test('Audit closure P1: NEAR FinalExecutionOutcome, BigInt/Uint8Array bridge serialization, and Solana Wallet Standard change events & variadic args', async () => {
  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const wallet = state.normalizeWalletRecord({
    id: 'w_near_outcome',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    solAddress: keys.solAddress,
    nativeBalances: { near: 5 }
  });

  // 1) chainContracts.signAndSendNearActionsBatch returns full FinalExecutionOutcome
  const dummyBlockHash = cryptoEngine.base58Encode(Buffer.alloc(32, 3));
  await withMockedFetch(async (_url, opts) => {
    const rpc = JSON.parse(opts.body);
    if (rpc.method === 'query' && rpc.params?.request_type === 'view_access_key') {
      return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { nonce: 5, block_hash: dummyBlockHash } });
    }
    if (rpc.method === 'broadcast_tx_commit') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          status: { SuccessValue: 'b2s=' },
          transaction: { hash: 'NEAR_OUTCOME_HASH_1', signer_id: 'alice.near', receiver_id: 'bob.near', actions: [] },
          transaction_outcome: { id: 'NEAR_OUTCOME_HASH_1', outcome: { status: { SuccessValue: 'b2s=' }, logs: ['ok'], receipt_ids: ['r1'], gas_burnt: 100 } },
          receipts_outcome: [{ id: 'r1', outcome: { status: { SuccessValue: '' }, logs: [], receipt_ids: [], gas_burnt: 50 } }]
        }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const batchRes = await chainContracts.signAndSendNearActionsBatch({
      accountId: 'alice.near',
      publicKeyStr: keys.nearPublicKey,
      privateKeyStr: keys.nearPrivateKey,
      receiverId: 'bob.near',
      actions: [{ type: 'FunctionCall', params: { methodName: 'ping', args: new Uint8Array([123, 125]), gas: '30000000000000', deposit: '0' } }],
      wallet
    });
    assert.equal(batchRes.txHash, 'NEAR_OUTCOME_HASH_1');
    assert.ok(batchRes.outcome && batchRes.outcome.transaction && batchRes.outcome.transaction.hash === 'NEAR_OUTCOME_HASH_1');
    assert.equal(batchRes.outcome.receipts_outcome.length, 1);
    assert.deepEqual(batchRes.outcome.status, { SuccessValue: 'b2s=' });
  });

  // 2) Injected provider BigInt & Uint8Array bridge round-trip + FinalExecutionOutcome + Solana standard:events 'change' & variadic signTransaction
  const script = dappBrowser.buildInjectedProviderScript({
    authorizedOrigin: 'https://dapp.example',
    nearAccountId: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    solanaPublicKey: keys.solAddress
  });

  const postedPayloads = [];
  const registeredWallets = [];
  const storageMap = new Map();
  const sandbox = {
    window: null,
    navigator: { wallets: [] },
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k)
    },
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init && init.detail; },
    Uint8Array,
    ArrayBuffer,
    Buffer,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary')
  };
  sandbox.window = sandbox;
  sandbox.location = { origin: 'https://dapp.example' };
  sandbox.dispatchEvent = () => {};
  sandbox.__NEXUS_TEST_BRIDGE__ = {
    postMessage: (raw) => {
      const parsed = JSON.parse(raw);
      postedPayloads.push(parsed);
      queueMicrotask(async () => {
        try {
          if (parsed.namespace === 'near') {
            const res = await dappBrowser.handleDAppRpcRequest(parsed, {
              wallet,
              contracts: {
                getWalletNearSignerCredentials: () => ({
                  accountId: 'alice.near',
                  publicKeyStr: keys.nearPublicKey,
                  privateKeyStr: keys.nearPrivateKey
                }),
                signAndSendNearActionsBatch: async ({ actions }) => {
                  assert.ok(actions[0].params.args instanceof Uint8Array, 'Bridge must restore Uint8Array args');
                  assert.equal(actions[0].params.deposit, '1000000000000000000000000', 'Bridge must serialize BigInt deposit cleanly');
                  return {
                    txHash: 'NEAR_BRIDGE_TX_1',
                    result: {
                      status: { SuccessValue: '' },
                      transaction: { hash: 'NEAR_BRIDGE_TX_1', signer_id: 'alice.near', receiver_id: 'app.near' },
                      transaction_outcome: { id: 'NEAR_BRIDGE_TX_1', outcome: { status: { SuccessValue: '' }, logs: [], receipt_ids: [], gas_burnt: 1 } },
                      receipts_outcome: [{ id: 'rcpt_1', outcome: { status: { SuccessValue: '' }, logs: [], receipt_ids: [], gas_burnt: 1 } }]
                    }
                  };
                }
              },
              crypto: cryptoEngine,
              origin: 'https://dapp.example',
              requestApprovalAsync: async () => true,
              verifyAuthAsync: async () => true
            });
            sandbox.__nexusOnBridgeResponse(parsed.id, JSON.stringify(res), null);
          } else if (parsed.namespace === 'solana' && parsed.method === 'signAllTransactions') {
            sandbox.__nexusOnBridgeResponse(parsed.id, JSON.stringify({ signedBase64List: parsed.params[0].transactionsBase64 }), null);
          } else if (parsed.namespace === 'solana' && parsed.method === 'disconnect') {
            sandbox.__nexusOnBridgeResponse(parsed.id, JSON.stringify(true), null);
          } else {
            sandbox.__nexusOnBridgeResponse(parsed.id, JSON.stringify({ publicKey: keys.solAddress }), null);
          }
        } catch (err) {
          sandbox.__nexusOnBridgeResponse(parsed.id, null, JSON.stringify({ code: 500, message: err.message }));
        }
      });
    }
  };
  vm.runInNewContext(script, sandbox);
  sandbox.navigator.wallets.forEach((fn) => fn({ register: (w) => registeredWallets.push(w) }));
  const solStd = registeredWallets.find((w) => w.chains && w.chains.includes('solana:mainnet'));
  assert.ok(solStd, 'Solana Wallet Standard object must register');

  // Test BigInt + Uint8Array through nearProvider.signAndSendTransaction
  const nearOutcome = await sandbox.window.near.signAndSendTransaction({
    receiverId: 'app.near',
    actions: [{ type: 'FunctionCall', params: { methodName: 'buy', args: new Uint8Array([123, 125]), gas: 30000000000000n, deposit: 1000000000000000000000000n } }]
  });
  assert.equal(nearOutcome.txHash, 'NEAR_BRIDGE_TX_1');
  assert.ok(nearOutcome.status && nearOutcome.transaction && nearOutcome.transaction_outcome);
  assert.equal(nearOutcome.receipts_outcome.length, 1);

  // Test Solana standard:events 'change' & variadic signTransaction
  const changeEvents = [];
  solStd.features['standard:events'].on('change', (ev) => changeEvents.push(ev));
  const dummyRawTx = new Uint8Array([1, 2, 3, 4]);
  const signedMulti = await solStd.features['solana:signTransaction'].signTransaction(
    { transaction: dummyRawTx },
    { transaction: dummyRawTx }
  );
  assert.equal(signedMulti.length, 2, 'Variadic solana:signTransaction must accept multiple inputs');
  await solStd.features['standard:disconnect'].disconnect();
  assert.ok(changeEvents.some((ev) => Array.isArray(ev.accounts) && ev.accounts.length === 0), 'Disconnect must emit Wallet Standard change event with empty accounts');
});

test('Audit closure P1: resolveWalletEvmSender unifies local key priority across contracts, Perp cache & bindNearDomainFromHub', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const localPriv = '0x0123456789012345678901234567890123456789012345678901234567890123';
    const localAddr = new ethers.Wallet(localPriv).address;
    assert.notEqual(localAddr.toLowerCase(), keys.mpcEvmAddress.toLowerCase());

    const localWallet = state.normalizeWalletRecord({
      id: 'w_unified_evm',
      mnemonic: TEST_MNEMONIC,
      nearAddress: keys.nearAddress,
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nearPrivateSeedHex: keys.nearPrivateSeedHex,
      evmPrivateKey: localPriv,
      evmAddress: localAddr,
      mpcEvmAddress: keys.mpcEvmAddress,
      solAddress: keys.solAddress
    });

    assert.equal(chainContracts.resolveWalletEvmSender(localWallet, ethers), localAddr);
    assert.equal(chainContracts.resolveWalletEvmSender({ mpcEvmAddress: keys.mpcEvmAddress, evmAddress: localAddr }), keys.mpcEvmAddress);

    // loadCachedPerpSnapshot must look up using localAddr (not mpcEvmAddress) when evmPrivateKey exists
    state.wallets = [localWallet];
    state.activeWalletId = localWallet.id;
    state.saveCachedPerpSnapshot({
      account: { accountValue: '555', withdrawable: '555', positions: [] },
      accountAddr: localAddr
    });
    state.perp.account = null;
    state.loadCachedPerpSnapshot();
    assert.equal(state.perp.account && state.perp.account.accountValue, '555', 'Perp snapshot lookup must align with resolveWalletEvmSender');

    // bindNearDomainFromHub must NOT overwrite local evmAddress when evmPrivateKey exists
    const domMap = new Map([
      ['hub-near-domain-input', createMockDomElement('hub-near-domain-input', { value: 'alice.near' })],
      ['hub-near-bind-auth-input', createMockDomElement('hub-near-bind-auth-input', { value: '' })],
      ['btn-bind-near-domain', createMockDomElement('btn-bind-near-domain', { textContent: 'Bind' })]
    ]);
    const origNearRpc = chainContracts.nearRpcPostAsync;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    chainContracts.ensureWalletSigningKeysAsync = async (w) => w;
    chainContracts.nearRpcPostAsync = async () => ({ jsonrpc: '2.0', result: { permission: 'FullAccess' } });
    try {
      await withMockedDomAndWindow(domMap, async () => {
        await uiController.bindNearDomainFromHub();
        assert.equal(localWallet.nearNamedAccount, 'alice.near');
        assert.equal(localWallet.evmAddress, localAddr, 'Local evmAddress must NOT be overwritten by MPC address on .near bind');
      });
    } finally {
      chainContracts.nearRpcPostAsync = origNearRpc;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
    }
  });
});

test('Audit closure P1: Per-wallet isolation for activeOrder (migration, switch isolation) & WalletConnect (session mapping, in-flight reject lock, delete cleanup)', async () => {
  await withMockedStorage({}, async (storage) => {
    state.initState();
    const keysA = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const wA = state.normalizeWalletRecord({
      id: 'w_iso_a',
      name: 'Wallet A',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'a.near',
      nearPublicKey: keysA.nearPublicKey,
      nearPrivateKey: keysA.nearPrivateKey,
      nearPrivateSeedHex: keysA.nearPrivateSeedHex,
      evmAddress: keysA.mpcEvmAddress,
      mpcEvmAddress: keysA.mpcEvmAddress
    });
    const wB = state.normalizeWalletRecord({
      id: 'w_iso_b',
      name: 'Wallet B',
      mnemonic: 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong',
      nearNamedAccount: 'b.near',
      evmAddress: '0x2222222222222222222222222222222222222222',
      mpcEvmAddress: '0x2222222222222222222222222222222222222222'
    });
    state.wallets = [wA, wB];
    state.activeWalletId = wA.id;
    state.saveWallets();

    // 1) Legacy unkeyed order migrates to wA without leaking to wB
    const legacyOrder = { walletId: wA.id, depositAddress: 'dep_a', status: 'PENDING_DEPOSIT', createdAt: Date.now() };
    storage.setItem('near_ca_active_swap_order_v1', JSON.stringify(legacyOrder));
    state.activeWalletId = wB.id;
    assert.equal(state.loadActiveSwapOrder(), null, 'Switching to wB must not see wA legacy order');
    assert.ok(storage.getItem('near_ca_active_swap_order_v1_w_iso_a'), 'Legacy order must migrate to wA slot');
    state.activeWalletId = wA.id;
    assert.equal(state.loadActiveSwapOrder().depositAddress, 'dep_a');

    // 2) Switching wallet during refreshActiveSwapOrderStatus must not overwrite wB activeOrder
    const orderA = { walletId: wA.id, depositAddress: 'dep_a_poll', status: 'PENDING_DEPOSIT', createdAt: Date.now() };
    const orderB = { walletId: wB.id, depositAddress: 'dep_b_poll', status: 'PENDING_DEPOSIT', createdAt: Date.now() };
    state.swap.activeOrder = orderA;
    state.saveActiveSwapOrder(orderA, wA.id);
    state.saveActiveSwapOrder(orderB, wB.id);

    const origFetchStatus = nearIntents.fetchSwapOrderStatus;
    nearIntents.fetchSwapOrderStatus = async () => {
      // Simulate user switching wallet mid-flight
      uiController.switchActiveWallet(wB.id);
      return { ok: true, status: 'SUCCESS' };
    };
    const domMap = new Map([
      ['swap-order-card', createMockDomElement('swap-order-card')],
      ['swap-order-status', createMockDomElement('swap-order-status')],
      ['wc-sessions-list', createMockDomElement('wc-sessions-list')],
      ['wc-request-card', createMockDomElement('wc-request-card')],
      ['btn-wc-request-approve', createMockDomElement('btn-wc-request-approve')],
      ['btn-wc-request-reject', createMockDomElement('btn-wc-request-reject')],
      ['wc-request-method', createMockDomElement('wc-request-method')],
      ['wc-request-dapp', createMockDomElement('wc-request-dapp')],
      ['wc-request-payload', createMockDomElement('wc-request-payload')],
      ['header-account-label', createMockDomElement('header-account-label')],
      ['hero-near-id', createMockDomElement('hero-near-id')]
    ]);
    try {
      await withMockedDomAndWindow(domMap, async () => {
        await uiController.refreshActiveSwapOrderStatus(true);
        assert.equal(state.activeWalletId, wB.id);
        assert.equal(state.swap.activeOrder && state.swap.activeOrder.depositAddress, 'dep_b_poll', 'wB activeOrder must remain intact when wA poll settles after switch');
        assert.equal(JSON.parse(storage.getItem('near_ca_active_swap_order_v1_w_iso_a')).status, 'PENDING_DEPOSIT', 'Stale poll after switch must not overwrite wB or corrupt state');

        // 3) WC session isolation, in-flight reject lock & wallet delete cleanup
        const responded = [];
        const disconnectedTopics = [];
        const activeSessions = {
          topic_a: { topic: 'topic_a', peer: { metadata: { name: 'DApp A', url: 'https://a.example' } }, namespaces: { eip155: { accounts: [`eip155:1:${wA.mpcEvmAddress}`] } } },
          topic_b: { topic: 'topic_b', peer: { metadata: { name: 'DApp B', url: 'https://b.example' } }, namespaces: { eip155: { accounts: [`eip155:1:${wB.mpcEvmAddress}`] } } }
        };
        storage.setItem('near_ca_wc_session_wallets_v1', JSON.stringify({ topic_a: wA.id, topic_b: wB.id }));
        state.wc.client = {
          getActiveSessions: () => activeSessions,
          session: { get: (t) => activeSessions[t] || null },
          respondSessionRequest: async (arg) => { responded.push(arg); },
          disconnectSession: async ({ topic }) => { disconnectedTopics.push(topic); delete activeSessions[topic]; }
        };

        // Active is wB, pendingRequest belongs to topic_a (wA) -> approveWcRequest must reject with 4100 mismatch
        state.wc.pendingRequest = { id: 101, topic: 'topic_a', params: { request: { method: 'personal_sign', params: ['0x6869', wA.mpcEvmAddress] } } };
        await globalThis.approveWcRequest();
        assert.equal(responded.length, 1);
        assert.equal(responded[0].response.error.code, 4100);

        // In-flight approveWcRequest disables #btn-wc-request-reject & blocks rejectWcRequest
        state.activeWalletId = wA.id;
        let resolveEnsure;
        const origEnsureKeysWc = chainContracts.ensureWalletSigningKeysAsync;
        chainContracts.ensureWalletSigningKeysAsync = () => new Promise((r) => { resolveEnsure = r; });
        state.wc.pendingRequest = { id: 102, topic: 'topic_a', params: { request: { method: 'personal_sign', params: ['0x6869', wA.mpcEvmAddress] } } };
        const approvePromise = globalThis.approveWcRequest();
        await new Promise((r) => setTimeout(r, 10));
        assert.equal(domMap.get('btn-wc-request-reject').disabled, true, 'Reject button must be disabled while WC approval is in flight');
        await globalThis.rejectWcRequest();
        assert.equal(responded.length, 1, 'rejectWcRequest must be blocked while approval is in flight');
        resolveEnsure(wA);
        chainContracts.ensureWalletSigningKeysAsync = origEnsureKeysWc;
        await approvePromise;

        // Deleting wB cleans up topic_b WC session
        state.activeWalletId = wA.id;
        const prevConfirm = globalThis.confirm;
        globalThis.confirm = () => true;
        try {
          await globalThis.deleteWalletById(wB.id);
        } finally {
          if (prevConfirm === undefined) delete globalThis.confirm;
          else globalThis.confirm = prevConfirm;
        }
        assert.deepEqual(disconnectedTopics, ['topic_b']);
        assert.equal(Boolean(activeSessions.topic_a), true);
        assert.equal(Boolean(activeSessions.topic_b), false);
      });
    } finally {
      nearIntents.fetchSwapOrderStatus = origFetchStatus;
    }
  });
});

test('Audit closure P1: DApp nativeOrigin binding, unauthorized/disconnected leak prevention & .near hydration before key derivation', async () => {
  await withMockedStorage({}, async (storage) => {
    state.initState();
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const w = state.normalizeWalletRecord({
      id: 'w_dapp_sec',
      mnemonic: TEST_MNEMONIC,
      nearAddress: keys.nearAddress,
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nearPrivateSeedHex: keys.nearPrivateSeedHex,
      mpcEvmAddress: keys.mpcEvmAddress,
      evmAddress: keys.mpcEvmAddress,
      solAddress: keys.solAddress
    });
    w.nearNamedAccount = '';
    w.discoveredNearAccounts = [];
    state.wallets = [w];
    state.activeWalletId = w.id;

    const bridgeResponses = [];
    const openUrlPayloads = [];
    const bridgeListeners = {};
    const callOrder = [];

    const origDiscover = chainContracts.discoverNearAccountsByPublicKeyAsync;
    const origEnsureKeys = chainContracts.ensureWalletSigningKeysAsync;
    chainContracts.discoverNearAccountsByPublicKeyAsync = async () => {
      callOrder.push('hydrate');
      return ['hydrated.near'];
    };
    chainContracts.ensureWalletSigningKeysAsync = async (walletObj) => {
      callOrder.push('ensureKeys');
      return walletObj;
    };

    const domMap = new Map([
      ['dapp-connected-section', createMockDomElement('dapp-connected-section')],
      ['dapp-catalog-list', createMockDomElement('dapp-catalog-list')],
      ['dapp-filter-bar', createMockDomElement('dapp-filter-bar')],
      ['dapp-url-input', createMockDomElement('dapp-url-input')],
      ['sheet-dapp-browser', createMockDomElement('sheet-dapp-browser', { _isSheet: true })],
      ['sheet-dapp-approve', createMockDomElement('sheet-dapp-approve', { _isSheet: true })],
      ['sheet-backdrop', createMockDomElement('sheet-backdrop')]
    ]);

    try {
      await withMockedDomAndWindow(domMap, async () => {
        globalThis.Capacitor = {
          Plugins: {
            NativeDAppBrowser: {
              addListener: (ev, fn) => { bridgeListeners[ev] = fn; return { remove() {} }; },
              openUrl: async (opts) => { openUrlPayloads.push(opts); },
              setOverlayVisible: async () => {},
              emitProviderEvent: async () => {},
              sendResponse: async (res) => { bridgeResponses.push(res); }
            }
          }
        };

        // 1) Unauthorized external origin must NOT leak addresses in injectedScript or getAccountId, and hydrates .near BEFORE ensureWalletSigningKeysAsync
        await withMockedFetch(async (url) => {
          if (url.includes('fastnear.com')) return jsonResponse({ account_ids: ['hydrated.near'] });
          return jsonResponse({}, 404);
        }, async () => {
          await uiController.launchDAppUrl('https://untrusted.example/app');
        });
        assert.ok(callOrder.indexOf('hydrate') >= 0 && callOrder.indexOf('ensureKeys') > callOrder.indexOf('hydrate'), `Expected hydrate before ensureKeys, got ${JSON.stringify(callOrder)}`);
        assert.equal(w.nearNamedAccount, 'hydrated.near');
        assert.equal(openUrlPayloads.length, 1);
        assert.ok(openUrlPayloads[0].injectedScript.includes('"evmAddress":""'), 'Unauthorized origin must not inject evmAddress');
        assert.ok(openUrlPayloads[0].injectedScript.includes('"solanaPublicKey":""'), 'Unauthorized origin must not inject solanaPublicKey');
        assert.ok(openUrlPayloads[0].injectedScript.includes('"nearAccountId":""'), 'Unauthorized origin must not inject nearAccountId');

        // 2) Missing nativeOrigin when browser closed rejects with 4100 Untrusted DApp origin
        bridgeListeners.browserClosed();
        bridgeListeners.bridgeMessage({
          payload: JSON.stringify({ id: 'no-origin-1', namespace: 'evm', method: 'eth_accounts', origin: 'https://app.rhea.finance', params: [] })
        });
        for (let i = 0; i < 20 && !bridgeResponses.some((r) => r.id === 'no-origin-1'); i++) {
          await new Promise((r) => setTimeout(r, 10));
        }
        const r2 = bridgeResponses.find((r) => r.id === 'no-origin-1');
        assert.ok(r2, 'Expected bridge response for no-origin-1');
        assert.equal(JSON.parse(r2.errorJson).code, 4100);

        // 3) Connect catalog origin, prove trusted nativeOrigin gets hydrated .near, then verify spoofed msg.origin from evil nativeOrigin is ignored
        await uiController.launchDAppUrl('https://app.rhea.finance');
        assert.ok(openUrlPayloads[1].injectedScript.includes('hydrated.near'), 'Connected catalog origin gets hydrated .near');

        bridgeListeners.bridgeMessage({
          nativeOrigin: 'https://app.rhea.finance',
          nativeUrl: 'https://app.rhea.finance/',
          payload: JSON.stringify({
            id: 'legit-rhea-1',
            namespace: 'near',
            method: 'getAccountId',
            origin: 'https://app.rhea.finance',
            params: []
          })
        });
        for (let i = 0; i < 20 && !bridgeResponses.some((r) => r.id === 'legit-rhea-1'); i++) {
          await new Promise((r) => setTimeout(r, 10));
        }
        const rLegit = bridgeResponses.find((r) => r.id === 'legit-rhea-1');
        assert.ok(rLegit, 'Expected bridge response for legit-rhea-1');
        assert.equal(JSON.parse(rLegit.resultJson), 'hydrated.near', 'Connected origin with matching nativeOrigin must return hydrated .near');

        bridgeListeners.bridgeMessage({
          nativeOrigin: 'https://evil.example',
          nativeUrl: 'https://evil.example/phish',
          payload: JSON.stringify({
            id: 'spoof-1',
            namespace: 'near',
            method: 'getAccountId',
            origin: 'https://app.rhea.finance',
            params: []
          })
        });
        bridgeListeners.bridgeMessage({
          nativeOrigin: 'https://evil.example',
          nativeUrl: 'https://evil.example/phish',
          payload: JSON.stringify({
            id: 'spoof-evm-1',
            namespace: 'evm',
            method: 'eth_accounts',
            origin: 'https://app.rhea.finance',
            params: []
          })
        });
        for (let i = 0; i < 20 && (!bridgeResponses.some((r) => r.id === 'spoof-1') || !bridgeResponses.some((r) => r.id === 'spoof-evm-1')); i++) {
          await new Promise((r) => setTimeout(r, 10));
        }
        const r1 = bridgeResponses.find((r) => r.id === 'spoof-1');
        const rEvmSpoof = bridgeResponses.find((r) => r.id === 'spoof-evm-1');
        assert.ok(r1 && rEvmSpoof, 'Expected bridge responses for spoof-1 and spoof-evm-1');
        assert.equal(JSON.parse(r1.resultJson), '', 'Spoofed msg.origin must NOT inherit connected NEAR account when nativeOrigin differs');
        assert.deepEqual(JSON.parse(rEvmSpoof.resultJson), [], 'Spoofed msg.origin must NOT inherit connected EVM accounts when nativeOrigin differs');

        // 4) Disconnecting a catalog origin persists in near_ca_dapp_disconnected_v1 and suppresses re-injection
        uiController.disconnectDAppOrigin('https://app.rhea.finance');
        const disconnStored = JSON.parse(storage.getItem('near_ca_dapp_disconnected_v1') || '[]');
        assert.ok(disconnStored.some((k) => k.includes('https://app.rhea.finance')), 'Disconnected origin must persist');
        await uiController.launchDAppUrl('https://app.rhea.finance');
        assert.ok(openUrlPayloads[2].injectedScript.includes('"nearAccountId":""'), 'Disconnected origin must not auto-reconnect or leak nearAccountId');
      });
    } finally {
      delete globalThis.Capacitor;
      chainContracts.discoverNearAccountsByPublicKeyAsync = origDiscover;
      chainContracts.ensureWalletSigningKeysAsync = origEnsureKeys;
    }
  });
});
