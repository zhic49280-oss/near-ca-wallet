'use strict';

const { test, assert, fs, path, ROOT_DIR, cryptoEngine, nearIntents, chainContracts, hlPerps, limitOrders, miningPro, state, uiController, TEST_MNEMONIC, jsonResponse, withMockedFetch } = require('./helpers');

test('Item 4 & 5: HL reverseHlPositionMarket checks margin before cancelling TP/SL, and placeHlPerpOrder uses currentLeverage when leverage is null', async () => {
  const wallet = {
    id: 'w_hl_test',
    mnemonic: TEST_MNEMONIC,
    nearAddress: 'test.near',
    mpcEvmAddress: '0x1111111111111111111111111111111111111111'
  };
  const market = { index: 0, name: 'BTC', szDecimals: 5, maxLeverage: 40, onlyIsolated: false, markPx: 100000 };
  const position = { coin: 'BTC', isLong: true, absSize: 1, leverageValue: 10, leverageType: 'isolated', marginUsed: 1000, unrealizedPnl: 0 };

  let cancelCalled = false;
  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.hyperliquid.xyz/info') && opts?.body) {
      const body = JSON.parse(opts.body);
      if (body.type === 'frontendOpenOrders') {
        cancelCalled = true;
        return jsonResponse([{ coin: 'BTC', oid: 123, isTrigger: true }]);
      }
    }
    return jsonResponse({ status: 'ok' });
  }, async () => {
    await assert.rejects(
      () => hlPerps.reverseHlPositionMarket({
        wallet,
        market,
        position,
        markPrice: 100000, // reqMargin = 100000 / 10 = 10000
        availableMargin: 100 // effectiveAvail = 100 + 1000 = 1100 < 10000
      }),
      /Insufficient margin|保证金不足/
    );
    assert.equal(cancelCalled, false, 'Must NOT query/cancel TP/SL triggers if reverse margin check fails');
  });

  // Item 5: placeHlPerpOrder with leverage: null and currentLeverage: 20 should check margin at 20x (5000) not default 5x (20000)
  await assert.rejects(
    () => hlPerps.placeHlPerpOrder({
      wallet,
      market,
      isBuy: true,
      size: 1,
      orderType: 'limit',
      limitPrice: 100000,
      leverage: null,
      currentLeverage: 20,
      availableMargin: 4000 // < 5000
    }),
    /保证金不足|Insufficient/
  );
});

test('Item 6: Re-entrancy locks are acquired BEFORE verifySecurityAuthAsync in all target modules', () => {
  const checks = [
    ['src/parts/ui-controller/164-perps-funding.part.js', ['executePerpOneClickDepositUI', 'executePerpArbBridgeDepositUI', 'executePerpWithdrawUI'], '_perpFundingBusy = true'],
    ['src/parts/ui-controller/163-perps-trade.part.js', ['executePerpOrderUI'], 'st.perp.submitting = true'],
    ['src/parts/ui-controller/163-perps-trade.part.js', ['closePerpPositionUI', 'submitPerpPositionTpSlUI', 'reversePerpPositionUI', 'cancelPerpOrderUI', 'quickTransferSpotToPerpUI'], '_perpTradeActionBusy = true'],
    ['src/parts/ui-controller/163-perps-trade.part.js', ['executePerpBatchAction'], '_perpBatchBusy = true'],
    ['src/parts/ui-controller/170-earn.part.js', ['executeSelectedStake'], '_earnStakeInFlight = true'],
    ['src/parts/ui-controller/170-earn.part.js', ['executeEarnPositionAction'], '_earnActionInFlight = true'],
    ['src/parts/ui-controller/200-solana-rent.part.js', ['executeSolRentReclaimUI'], '_solRentReclaimInFlight = true'],
    ['src/parts/ui-controller/210-near-storage.part.js', ['executeNearStorageReclaimUI'], '_nearStorageReclaimInFlight = true'],
    ['src/parts/ui-controller/151-limit-orders-ui.part.js', ['wrapNativeForLimitUI', 'executeLimitOrderAction', 'claimLimitOrderUI', 'cancelLimitOrderUI'], '_limitOrderActionInFlight = true'],
    ['src/parts/ui-controller/180-near-keys.part.js', ['deleteNearAccessKeyFromSheet', 'addNearMnemonicKeyOnlyFromSheet', 'registerNearDomainFromHub', 'bindNearDomainFromHub', 'confirmRotateNearAccountKey'], '_nearKeyActionBusy = true'],
    ['src/parts/ui-controller/230-walletconnect.part.js', ['approveWcProposal'], '_wcApprovingProposal = true'],
    ['src/parts/ui-controller/230-walletconnect.part.js', ['approveWcRequest'], '_wcApprovingRequest = true']
  ];
  for (const [relPath, fnNames, lockAssign] of checks) {
    const src = fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
    for (const fnName of fnNames) {
      const idx = src.indexOf(`function ${fnName}`);
      assert.ok(idx !== -1, `${fnName} must exist in ${relPath}`);
      const slice = src.slice(idx, idx + 8000);
      const lockIdx = slice.indexOf(lockAssign);
      const authIdx = slice.indexOf('verifySecurityAuthAsync(');
      assert.ok(lockIdx !== -1, `${fnName} in ${relPath} must set ${lockAssign}`);
      if (authIdx !== -1) {
        assert.ok(lockIdx < authIdx, `${fnName} in ${relPath} must acquire lock BEFORE verifySecurityAuthAsync`);
      }
    }
  }
});

test('Item 7, 8, 9, 10: Swap followUpSolBridgeOut, Arc 6-dec scaling, string precision, WNEAR balance & qtcDepositAddressAt', () => {
  const ordersSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/130-swap-orders.part.js'), 'utf8');
  assert.ok(ordersSrc.includes('order.followUpSolBridgeOut'), 'hasPendingSwapFollowUp must include followUpSolBridgeOut');

  const prlSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/121-swap-execute-prl.part.js'), 'utf8');
  assert.ok(prlSrc.includes('Stage 1 swapped to PRL; tap Resume for Stage 2'), 'PRL stage 2 transfer must save resumable followUpBridgeOut on failure');

  // Item 8: Arc 6-dec scaling
  const swapCatalogSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/101-swap-catalog.part.js'), 'utf8');
  assert.ok(swapCatalogSrc.includes('function scaleSwapLiveGasUnits('), 'scaleSwapLiveGasUnits helper must exist');

  // Item 9: chain-contracts toBaseUnits accepts exact decimal strings without Number() truncation
  assert.equal(chainContracts.toBaseUnits('0.12345678', 8), '12345678');
  assert.equal(chainContracts.toBaseUnits('1000000.00000001', 8), '100000000000001');

  // Item 10: normalizeWalletRecord preserves qtcDepositAddressAt
  const norm = state.normalizeWalletRecord({
    id: 'w_qtc',
    mnemonic: TEST_MNEMONIC,
    qtcDepositAddress: 'qz12345',
    qtcDepositAddressAt: 1700000000000
  });
  assert.equal(norm.qtcDepositAddressAt, 1700000000000);

  // Item 10: WNEAR (wrap.near) reads nearNep141Balances rather than nativeBalances.near
  const sendSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/080-send.part.js'), 'utf8');
  assert.ok(sendSrc.includes("(!isNativeContract || contractAddress === 'wrap.near')"), 'WNEAR wrap.near must read nearNep141Balances');

  // Item 10: 030-onboarding resetPerWalletTransientState syntax + stopPerpLiveFeed
  const onbSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/030-onboarding.part.js'), 'utf8');
  assert.ok(onbSrc.includes('stopPerpLiveFeed()'), 'resetPerWalletTransientState must call stopPerpLiveFeed()');
});

test('Item 20-23: Arc RPC dedup, AbortSignal propagation, shared NEAR 429 cooldown & sw.js resilience', async () => {
  // Item 20: no duplicate direct rpc.mainnet.arc.io call in 100-staking-metrics
  const metricsSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/100-staking-metrics.part.js'), 'utf8');
  assert.ok(!metricsSrc.includes('arc_steak_fallback'), 'Duplicate direct arc RPC call must be removed');

  // Item 21: nearRpcQueryWithFallback respects pre-aborted external signal (via 000-core-utils)
  const coreUtilsSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/near-intents/000-core-utils.part.js'), 'utf8');
  assert.ok(coreUtilsSrc.includes('entry.waiters === 0 && entry.ctrl'), 'nearRpcQueryWithFallback must abort shared controller when all waiters abort');
  const hlSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/hyperliquid-perps.js'), 'utf8');
  assert.ok(hlSrc.includes("extSignal.addEventListener('abort', onExtAbort"), 'hyperliquid-perps fetchJsonWithTimeout must merge external AbortSignal');

  // Item 22: shared __nearRpc429Until object
  assert.ok(globalThis.__nearRpc429Until && typeof globalThis.__nearRpc429Until === 'object', 'Shared __nearRpc429Until must exist on globalThis');

  // Item 23: sw.js catch fallback + AbortController
  const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  assert.ok(swSrc.includes('new AbortController()'), 'sw.js HTML race must use AbortController');
  assert.ok(swSrc.includes('Response.error()'), 'sw.js fetch handlers must fallback to cache or Response.error()');
});
