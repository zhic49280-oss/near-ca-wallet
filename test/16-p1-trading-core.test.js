'use strict';

const {
  test,
  assert,
  hlPerps,
  limitOrders,
  chainContracts,
  TEST_MNEMONIC,
  withMockedFetch,
  jsonResponse
} = require('./helpers.js');

test('P1.1: formatHlPrice clamps to Hyperliquid maxDec (no 12-decimal output) & reverseHlPositionMarket deducts negative PnL', async () => {
  assert.equal(hlPerps.formatHlPrice(0.000000123456, 0), '0.000001');
  assert.equal(hlPerps.formatHlPrice(0.000000123456, 2), '0.0001');
  assert.equal(hlPerps.formatHlPrice(0.000000123456, 0, true), '0.00000012');

  await assert.rejects(
    () => hlPerps.reverseHlPositionMarket({
      wallet: { evmAddress: '0x1111111111111111111111111111111111111111' },
      market: { name: 'ETH', index: 1, szDecimals: 4, markPx: 2000 },
      position: { isLong: true, absSize: 1, marginUsed: 200, leverageValue: 10, leverageType: 'isolated', unrealizedPnl: -150 },
      availableMargin: 50
    }),
    /Insufficient margin|保证金不足/
  );
});

test('P1.2: fetchSolanaLimitOrders marks unavailable=true on network/CORS failure & placeNearDclLimitOrder checks storage before wrapping', async () => {
  await withMockedFetch(async () => {
    throw new Error('CORS blocked');
  }, async () => {
    const res = await limitOrders.fetchSolanaLimitOrders('11111111111111111111111111111111');
    assert.equal(res.unavailable, true);
  });

  const origView = chainContracts.viewNearContractCall;
  const origFnCall = chainContracts.signAndSendNearFunctionCall;
  const origEnsure = chainContracts.ensureWalletSigningKeysAsync;
  const calls = [];
  chainContracts.ensureWalletSigningKeysAsync = async (w) => w;
  chainContracts.viewNearContractCall = async (contract, method) => {
    if (contract === 'wrap.near' && method === 'ft_balance_of') return '0';
    if (method === 'storage_balance_of') return null;
    return null;
  };
  chainContracts.signAndSendNearFunctionCall = async (args) => {
    calls.push(args);
    return 'fake_tx';
  };
  try {
    await assert.rejects(
      () => limitOrders.placeNearDclLimitOrder({
        wallet: {
          nearAddress: 'alice.near',
          nearPublicKey: 'ed25519:11111111111111111111111111111111',
          nearPrivateKey: 'ed25519:2222222222222222222222222222222222222222222222222222222222222222',
          nearBalance: 1.0,
          nativeBalances: { near: 1.0 },
          mnemonic: TEST_MNEMONIC
        },
        sellToken: 'wrap.near',
        buyToken: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        poolId: 'wrap.near|17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|2000',
        amountRaw: '900000000000000000000000', // 0.9 NEAR (+ 0.52 NEAR storage+gas > 1.0 NEAR)
        sellDecimals: 24,
        point: 0
      }),
      /Insufficient NEAR|NEAR 余额不足/
    );
    assert.equal(calls.length, 0, 'Must NOT broadcast wrap.near near_deposit before verifying storage+gas sufficiency');
  } finally {
    chainContracts.viewNearContractCall = origView;
    chainContracts.signAndSendNearFunctionCall = origFnCall;
    chainContracts.ensureWalletSigningKeysAsync = origEnsure;
  }
});

test('P1.3: fetchSolanaStakingPositions distinguishes cooling down vs ready-to-withdraw by current epoch', async () => {
  await withMockedFetch(async (url, opts) => {
    if (url.includes('solana') || (opts && String(opts.body || '').includes('getEpochInfo'))) {
      const body = JSON.parse(opts.body);
      if (body.method === 'getEpochInfo') return jsonResponse({ jsonrpc: '2.0', id: 1, result: { epoch: 700 } });
      if (body.method === 'getProgramAccounts') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: 1,
          result: [
            {
              pubkey: 'StakeCooling1111111111111111111111111111111',
              account: {
                lamports: 2_000_000_000,
                data: { parsed: { info: { stake: { delegation: { voter: 'Vote1', deactivationEpoch: '700' } } } } }
              }
            },
            {
              pubkey: 'StakeReady111111111111111111111111111111111',
              account: {
                lamports: 3_000_000_000,
                data: { parsed: { info: { stake: { delegation: { voter: 'Vote2', deactivationEpoch: '699' } } } } }
              }
            }
          ]
        });
      }
      if (body.method === 'getAccountInfo') return jsonResponse({ jsonrpc: '2.0', id: 1, result: { value: null } });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const positions = await chainContracts.fetchSolanaAccountStakingPositionsAsync('11111111111111111111111111111111');
    const cooling = positions.find((p) => p.subtitle.startsWith('StakeCooling'));
    const ready = positions.find((p) => p.subtitle.startsWith('StakeReady'));
    assert.ok(cooling && ready);
    assert.equal(cooling.isCoolingDown, true);
    assert.equal(cooling.isReadyToWithdraw, false);
    assert.equal(ready.isCoolingDown, false);
    assert.equal(ready.isReadyToWithdraw, true);
  });
});
