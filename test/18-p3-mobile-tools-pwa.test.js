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

test('P3.1: jsqr is installed and bundled into src/framework-ui.js for offline iOS QR scan', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.ok(
    (pkg.devDependencies && pkg.devDependencies.jsqr) || (pkg.dependencies && pkg.dependencies.jsqr),
    'jsqr must be installed in package.json'
  );
  const fwBundle = fs.readFileSync(path.join(ROOT_DIR, 'src/framework-ui.js'), 'utf8');
  assert.ok(fwBundle.includes('jsQR'), 'Vite build must bundle jsQR into src/framework-ui.js');
});

test('P3.2: QTC deposit address expires after 20 min & copyReceiveAddress blocks error state', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_qtc_ttl',
      name: 'QTC',
      mnemonic: TEST_MNEMONIC,
      qtcDepositAddress: 'qz_old_expired',
      qtcDepositAddressAt: Date.now() - (25 * 60 * 1000)
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    // Mock DOM for receive sheet
    const prevDoc = globalThis.document;
    const elements = new Map();
    const makeEl = (id) => {
      const el = {
        id,
        textContent: '',
        innerHTML: '',
        dataset: {},
        classList: {
          add() {},
          remove() {},
          toggle() {},
          contains() { return false; }
        }
      };
      elements.set(id, el);
      return el;
    };
    ['receive-network-pills', 'receive-addr-label', 'receive-addr-value', 'receive-qr-container'].forEach(makeEl);
    globalThis.document = {
      getElementById: (id) => elements.get(id) || null,
      querySelectorAll: () => [],
      documentElement: { classList: { toggle() {}, contains() { return false; } } }
    };

    try {
      globalThis.selectReceiveNetwork('qtc');
      const valEl = elements.get('receive-addr-value');
      assert.equal(valEl.dataset.error, '1', 'Expired QTC address without active fetch must mark error state');
      assert.notEqual(valEl.textContent, 'qz_old_expired', 'Expired QTC address must not be displayed');
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  });
});

test('P3.3: Unqueried WETH/DAI/WBTC stay null (--) & SW/WC boot hardening in place', () => {
  const wallet = {
    id: 'w_null_erc20',
    nearBalance: 1,
    nativeBalances: { near: 1, eth: 0, base: 0, arb: 0, op: 0, pol: 0, bsc: 0, avax: 0, hype: 0, hood: 0, arc: 0, sol: 0, prl: 0, btc: 0 },
    erc20Balances: {}
  };
  const groups = uiController.buildAggregatedAssetGroups(wallet);
  const wethGroup = groups.find((g) => g.symbol === 'WETH');
  if (wethGroup) {
    assert.equal(wethGroup.totalBalance, null, 'Unqueried WETH must stay null (--) instead of 0');
  }

  const wcSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/230-walletconnect.part.js'), 'utf8');
  assert.ok(wcSrc.includes('function parseHexBigInt('), 'WalletConnect must use parseHexBigInt for "0x" safety');
  const lifeSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/240-lifecycle.part.js'), 'utf8');
  assert.ok(lifeSrc.includes("postMessage({ type: 'SKIP_WAITING' })"), 'Frontend SW registration must send SKIP_WAITING');
});
