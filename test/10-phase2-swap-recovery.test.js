'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  state,
  uiController,
  TEST_MNEMONIC,
  withMockedStorage
} = require('./helpers.js');

test('Phase 2.1: Non-native swap button blocks when source-chain native gas is insufficient (behavioral)', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_swap_gas',
      name: 'Gas Check Wallet',
      mnemonic: TEST_MNEMONIC,
      evmAddress: '0x1111111111111111111111111111111111111111',
      nearAddress: '1111111111111111111111111111111111111111111111111111111111111111',
      nativeBalances: { eth: 0.00001, near: 1.0 } // ETH gas below reserve!
    });
    state.setWalletErc20Balance(w, 'eth', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 500);
    state.wallets = [w];
    state.activeWalletId = w.id;

    const btnState = uiController.evaluateSwapButtonState({
      wallet: w,
      fromToken: {
        assetId: '1cs_v1:eth:erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        blockchain: 'eth',
        symbol: 'USDC',
        decimals: 6,
        contractAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
      },
      toToken: {
        assetId: '1cs_v1:near:nep141:wrap.near',
        blockchain: 'near',
        symbol: 'NEAR',
        decimals: 24,
        contractAddress: 'wrap.near'
      },
      amountIn: '10',
      isQuoting: false,
      quoteError: '',
      quoteData: { amountOutFormatted: '2.5', quotedAt: Date.now() }
    });
    assert.equal(btnState.disabled, true);
    assert.equal(btnState.reason, 'insufficient_gas');
  });
});

test('Phase 2.2: PRL recovery, followUpDclSwap, and Arc->Base->PRL Stage 3 parameters are complete', () => {
  const prlExec = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/121-swap-execute-prl.part.js'), 'utf8');
  assert.ok(prlExec.includes('originAsset: intents.PRL_NEAR_ASSET_ID'), 'Sub-route A followUpBridgeOut must include originAsset');
  assert.ok(prlExec.includes('hubContract: intents.PRL_NEAR_CONTRACT'), 'Sub-route A followUpBridgeOut must include hubContract');
  assert.ok(prlExec.includes('followUpDclSwap:'), 'Sub-route B DCL failure must persist followUpDclSwap recovery');

  const ordersPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/130-swap-orders.part.js'), 'utf8');
  assert.ok(ordersPart.includes('function hasPendingSwapFollowUp('));
  assert.ok(ordersPart.includes('order.followUpDclSwap'));
  assert.ok(ordersPart.includes('order.followUpSolBridgeOut'));
  // Arc->Base->PRL stage 3 must call quoteIntentSwapOrWithdraw with dry: false instead of quoteCompositePrlSwap
  const s3Idx = ordersPart.indexOf('followUpBaseOneClick');
  assert.ok(s3Idx > 0);
  assert.ok(!ordersPart.slice(s3Idx).includes('quoteCompositePrlSwap('), 'Stage 3 must call quoteIntentSwapOrWithdraw with dry:false');
  assert.ok(ordersPart.includes('_orderPollInFlight'), 'Polling must have concurrency lock');
  assert.ok(ordersPart.includes('function startOrderStatusPolling(immediate = true)'));
});

test('Phase 2.3: Quote TTL, race guard, Stage 2 recovery cards, and framework activity notification', () => {
  const quotePart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/110-swap-quote.part.js'), 'utf8');
  assert.ok(quotePart.includes('_quoteReqSeq'));
  assert.ok(quotePart.includes('quotedAt: Date.now()'));
  assert.ok(quotePart.includes('const isExec = Boolean(st.swap._executing);'));

  const coreExec = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/120-swap-execute-core.part.js'), 'utf8');
  assert.ok(coreExec.includes('30000'), 'Must enforce 30s quote TTL before swap execution');
  assert.ok(coreExec.includes('followUpBridgeOut:'), 'NEAR_SWAP Stage 2 failure must persist recovery order');

  const relayExec = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/122-swap-execute-relay.part.js'), 'utf8');
  assert.ok(relayExec.includes('followUpSolBridgeOut:'), 'SOL_DEX Stage 2 failure must persist recovery order');
  assert.ok(relayExec.includes('followUpArcRelay:'), 'ARC Stage 2 failure must persist recovery order');

  const detailCore = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/060-token-detail-core.part.js'), 'utf8');
  assert.ok(detailCore.includes('notifyFrameworkState'), 'recordWalletActivity must notify Preact SwapHistoryPanel');

  const secPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/010-security.part.js'), 'utf8');
  assert.ok(secPart.includes('startOrderStatusPolling(false)'), 'Visibility restore must avoid duplicate poll request');
});
