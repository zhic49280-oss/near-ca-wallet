const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ROOT_DIR,
  TEST_MNEMONIC,
  cryptoEngine,
  chainContracts,
  state,
  withMockedFetch,
  withMockedStorage,
  jsonResponse
} = require('./helpers');

test('v6.89 Regression 1: oRHEA storage_deposit, 3-scale timestamp, lockDays guard & CoW x402 across chains', async () => {
  const execSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/110-staking-execute.part.js'), 'utf8');
  assert.ok(execSrc.includes("methodName: 'storage_deposit'"), 'oRHEA/Burrow staking must support storage_deposit');
  assert.ok(execSrc.includes('pool.isLockConvert'), 'Lock-convert staking must check pool.isLockConvert');
  assert.ok(execSrc.includes('Unsupported lock period:'), 'Invalid lockDays must throw clear error');

  // Invalid lockDays must be rejected before network execution
  const wallet = state.normalizeWalletRecord({
    id: 'w_orhea_test',
    mnemonic: TEST_MNEMONIC,
    name: 'oRHEA Test',
    nearAddress: 'test-orhea.near',
    nearPublicKey: 'ed25519:11111111111111111111111111111111',
    nearPrivateKey: 'ed25519:2222222222222222222222222222222222222222222222222222222222222222',
    evmAddress: '0x1111111111111111111111111111111111111111',
    evmPrivateKey: '0x3333333333333333333333333333333333333333333333333333333333333333'
  });
  wallet.nearNep141Balances = { 'otoken.rhealab.near': { raw: '100000000000000000000', formatted: '100' } };
  wallet.nativeBalances = { near: 5 };
  await withMockedFetch(async () => jsonResponse({
    jsonrpc: '2.0',
    id: 1,
    result: { result: Array.from(Buffer.from(JSON.stringify({ total: '3000000000000000000000', available: '0' }))) }
  }), async () => {
    await assert.rejects(
      () => chainContracts.executeOnChainStaking({
        wallet,
        poolId: 'rhea_orhea_convert',
        amount: 10,
        lockDays: 7,
        tokenBalance: 100
      }),
      /Unsupported lock period|不支持的锁仓周期/
    );
  });

  // 3-scale timestamp handling in oRHEA position/claim parsers
  const rpcBalSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/030-rpc-balances.part.js'), 'utf8');
  const miscSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/135-near-storage-misc.part.js'), 'utf8');
  assert.ok(rpcBalSrc.includes('1000000000000000n'), '030-rpc-balances must distinguish ms vs ns timestamps');
  assert.ok(miscSrc.includes('startMs + lockDays * 86400_000'), '135-near-storage-misc must compute startMs + lockDays');

  // CoW x402 handling across chains in limit-orders.js
  const limitSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/limit-orders.js'), 'utf8');
  const x402Matches = limitSrc.match(/res\.status === 402 \|\| \/x402\/i\.test\(desc\)/g) || [];
  assert.ok(x402Matches.length >= 3, 'limit-orders.js must handle HTTP 402 / x402 across quote/order/cancel paths');
});

test('v6.89 Regression 2: OS-native security only (no in-app PIN/Vault modal), CSPRNG guard & Perps scroll reset', async () => {
  const secSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/010-security.part.js'), 'utf8');
  assert.equal(secSrc.includes('nexus-pin-modal'), false, 'Must NOT include in-app PIN modal (OS biometric/passcode only)');
  assert.equal(secSrc.includes('Math.random()'), false, 'getRandomBytesCompat must never fall back to Math.random()');
  assert.ok(secSrc.includes('crypto.getRandomValues'), 'getRandomBytesCompat must require crypto.getRandomValues');

  const storeSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/state/000-store.part.js'), 'utf8');
  assert.equal(storeSrc.includes('VAULT_PIN_STORAGE_KEY'), false, 'Must NOT include in-app PIN storage key');

  const obSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/162-perps-orderbook.part.js'), 'utf8');
  assert.ok(obSrc.includes('scrollPerpViewportTo(0)'), 'openPerpTradeScreen must scroll viewport to top');
  assert.ok(obSrc.includes('_perpOverviewScrollY = readPerpViewportScrollY()'), 'openPerpTradeScreen must save overview scroll position');
  assert.ok(obSrc.includes('scrollPerpViewportTo(_perpOverviewScrollY)'), 'backToPerpOverview must restore overview scroll position');
});

test('v6.89 Regression 3: iOS ProMotion 120Hz, swap follow-up delta guard, perp TP/SL guard & PerpsView declarative active', () => {
  const plist = fs.readFileSync(path.join(ROOT_DIR, 'ios/App/App/Info.plist'), 'utf8');
  assert.match(
    plist,
    /<key>CADisableMinimumFrameDurationOnPhone<\/key>\s*<true\/>/,
    'iOS Info.plist must enable CADisableMinimumFrameDurationOnPhone for 120Hz ProMotion'
  );

  const followSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/131-swap-orders-followup.part.js'), 'utf8');
  assert.ok(followSrc.includes('hasPreLamports && deltaLamports <= 0n'), 'SOL DEX follow-up must guard against zero/negative balance delta');
  assert.ok(followSrc.includes('hasPreWei && deltaWei <= 0n'), 'EVM DEX follow-up must guard against zero/negative balance delta');
  assert.ok(followSrc.includes('hasPreBase && deltaRaw <= 0n'), 'Base 1Click follow-up must guard against zero/negative balance delta');

  const perpTradeSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/163-perps-trade.part.js'), 'utf8');
  assert.ok(perpTradeSrc.includes('if (tpStr && (!Number.isFinite(tpParsed) || tpParsed <= 0))'), 'Perp trade must reject negative/NaN TP');
  assert.ok(perpTradeSrc.includes('if (slStr && (!Number.isFinite(slParsed) || slParsed <= 0))'), 'Perp trade must reject negative/NaN SL');

  const perpsViewSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/views/PerpsView.jsx'), 'utf8');
  assert.ok(perpsViewSrc.includes("chartInterval === iv ? ' active' : ''"), 'PerpsView must declaratively bind active class on interval pills');
});
