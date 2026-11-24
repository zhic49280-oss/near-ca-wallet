'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  state,
  chainContracts,
  uiController,
  TEST_MNEMONIC,
  withMockedStorage
} = require('./helpers.js');

test('Phase 3.1: Limit order flip clears amountIn and targetRate & evaluates solUnavailable', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_limit_p3',
      name: 'Limit Wallet',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { sol: 2.0, near: 5.0 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.limit.chain = 'sol';
    state.limit.solUnavailable = true;
    state.limit.amountIn = '1';
    state.limit.targetRate = '150';

    const btn = uiController.evaluateLimitOrderState();
    assert.equal(btn.disabled, true);

    const limitCore = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/150-limit-orders-core.part.js'), 'utf8');
    assert.ok(limitCore.includes("st.limit.amountIn = '';"));
    assert.ok(limitCore.includes("st.limit.targetRate = '';"));
    assert.ok(limitCore.includes('retry_allowance'));
  });
});

test('Phase 3.2: Limit UI parses wNEAR object balance & uses exact BigInt buyRaw', () => {
  const limitUi = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/151-limit-orders-ui.part.js'), 'utf8');
  assert.ok(limitUi.includes("typeof wnearEntry === 'object'"), 'Must unwrap wNEAR { formatted, raw } object');
  assert.ok(limitUi.includes('computeExactBuyRaw'), 'Must use exact BigInt multiplication for buyRaw');
  assert.ok(limitUi.includes('_limitOrderActionInFlight'), 'Claim and cancel buttons must have re-entry lock');

  const limitMod = fs.readFileSync(path.join(ROOT_DIR, 'src/limit-orders.js'), 'utf8');
  assert.ok(limitMod.includes('partialTxHashes'), 'Two-tick split must report partial leg success');
});

test('Phase 3.3: Earn builds real Solana Stake Deactivate/Withdraw instructions, removes hardcoded Jupiter APY, and fixes Burrow combo check', () => {
  const deactIx = chainContracts.buildSolanaStakeDeactivateInstruction({
    stakeAccount: '11111111111111111111111111111111',
    authority: '11111111111111111111111111111111'
  });
  assert.equal(deactIx.programId, 'Stake11111111111111111111111111111111111111');
  assert.equal(new DataView(deactIx.data.buffer).getUint32(0, true), 5);

  const withdrawIx = chainContracts.buildSolanaStakeWithdrawInstruction({
    stakeAccount: '11111111111111111111111111111111',
    recipient: '11111111111111111111111111111111',
    authority: '11111111111111111111111111111111',
    lamports: '1000000000'
  });
  assert.equal(new DataView(withdrawIx.data.buffer).getUint32(0, true), 4);
  assert.equal(new DataView(withdrawIx.data.buffer).getBigUint64(4, true), 1000000000n);

  const metricsPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/100-staking-metrics.part.js'), 'utf8');
  assert.ok(!metricsPart.includes('200_000_000'), 'Must not hardcode 200M JUP ASR APY constant');
  assert.ok(metricsPart.includes('runTasksWithLimit'), 'Metrics fetch must bound concurrency');

  const execPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/110-staking-execute.part.js'), 'utf8');
  assert.ok(execPart.includes('pool.isAaveV3 || pool.isBurrowSupply'), 'Burrow must support combined wNEAR + NEAR balance');

  const earnPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/170-earn.part.js'), 'utf8');
  assert.ok(earnPart.includes('getEarnPoolLockupNotice'));
  assert.ok(earnPart.includes('getEarnPoolMinStake'));
  assert.ok(earnPart.includes('sol_validator_deactivate'));
  assert.ok(earnPart.includes('_earnActionInFlight'));
});
