'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  state,
  uiController,
  hlPerps,
  chainContracts,
  TEST_MNEMONIC,
  withMockedStorage,
  withMockedFetch,
  jsonResponse
} = require('./helpers.js');

test('Integrity 1: Every data-action in Preact JSX components is handled in 240-lifecycle.part.js', () => {
  const lifecycleSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/240-lifecycle.part.js'), 'utf8');
  const compDir = path.join(ROOT_DIR, 'src/app/components');
  const files = fs.readdirSync(compDir).filter((f) => f.endsWith('.jsx'));
  for (const f of files) {
    const src = fs.readFileSync(path.join(compDir, f), 'utf8');
    const matches = src.matchAll(/data-action="([^"]+)"/g);
    for (const m of matches) {
      const action = m[1];
      assert.ok(
        lifecycleSrc.includes(`'${action}'`) || lifecycleSrc.includes(`"${action}"`),
        `data-action="${action}" in ${f} must be handled in 240-lifecycle.part.js`
      );
    }
  }
});

test('Integrity 2: Zero undefined/broken symbol references across src/', () => {
  const partsDir = path.join(ROOT_DIR, 'src/parts');
  const walk = (dir) => {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walk(full));
      else if (ent.name.endsWith('.js') || ent.name.endsWith('.html')) out.push(full);
    }
    return out;
  };
  const allFiles = [
    ...walk(partsDir),
    path.join(ROOT_DIR, 'src/hyperliquid-perps.js'),
    path.join(ROOT_DIR, 'src/limit-orders.js'),
    path.join(ROOT_DIR, 'src/mining-pro.js')
  ];
  const forbidden = [
    /\b_followUpRunning\b/,
    /\bSOLANA_EXPLORER_TX\b/,
    /\bopenBackupSheet\s*\(/
  ];
  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    for (const re of forbidden) {
      assert.equal(re.test(content), false, `Forbidden undefined symbol ${re} found in ${path.relative(ROOT_DIR, file)}`);
    }
  }
  const secSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/010-security.part.js'), 'utf8');
  assert.equal(/\bopenSetWalletPinPrompt\b/.test(secSrc), false, '010-security.part.js must not reference removed PIN prompts');
});

test('P0 Behavioral: Perps parseHlClearinghouseState, fetchHlOpenOrders, isAppLocked, clearActiveSwapOrder, wNEAR & WC 0-ETH', async () => {
  // 1. parseHlClearinghouseState & fetchHlOpenOrders
  const parsed = hlPerps.parseHlClearinghouseState({
    marginSummary: { accountValue: '100', totalMarginUsed: '25' },
    withdrawable: '75',
    assetPositions: [{ position: { coin: 'BTC', szi: '0.1', entryPx: '90000', unrealizedPnl: '5', liquidationPx: '80000', marginUsed: '25', leverage: { value: 10, type: 'isolated' } } }]
  }, [{ coin: 'BTC', oid: 123, isTrigger: true }]);
  assert.equal(parsed.availableMargin, 75);
  assert.equal(parsed.positions.length, 1);
  assert.equal(parsed.positions[0].liquidationPx, 80000);
  assert.equal(parsed.openOrders.length, 1);

  await withMockedFetch(async () => jsonResponse([{ coin: 'ETH', oid: 456, orderType: 'Stop Market' }]), async () => {
    const orders = await hlPerps.fetchHlOpenOrders('0x1111111111111111111111111111111111111111');
    assert.equal(orders.length, 1);
    assert.equal(orders[0].isTrigger, true);
  });

  // 2. isAppLocked exported & clearActiveSwapOrder does not throw ReferenceError
  assert.equal(typeof uiController.isAppLocked, 'function');
  assert.equal(uiController.isAppLocked(), false);

  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({ id: 'w_p0_clr', name: 'Clr', mnemonic: TEST_MNEMONIC });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.swap.activeOrder = { walletId: w.id, depositAddress: 'dep1', status: 'PENDING_DEPOSIT' };
    uiController.clearActiveSwapOrder(true);
    assert.equal(state.swap.activeOrder, null);

    // 3. recordWalletActivity preserves counterparty
    uiController.recordWalletActivity(w, { type: 'send', symbol: 'NEAR', chain: 'near', amount: 1, counterparty: 'bob.near', txHash: 'tx1' });
    assert.equal(w.activityHistory[0].counterparty, 'bob.near');
  });

  // 4. validateSufficientChainBalance allows 0 value for WC contract calls when allowZeroAmount=true
  assert.doesNotThrow(() => {
    chainContracts.validateSufficientChainBalance({
      wallet: { nativeBalances: { eth: 0.05 } },
      chain: 'eth',
      tokenSymbol: 'ETH',
      amount: 0,
      isNative: true,
      allowZeroAmount: true
    });
  });
});
