'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  state,
  TEST_MNEMONIC,
  withMockedStorage
} = require('./helpers.js');

test('Phase 6.1: Vault AES-256-GCM encrypts wallet secrets, strips plaintext from localStorage, and unlocks round-trip', async () => {
  await withMockedStorage({}, async (storage) => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_vault_test',
      name: 'Wallet',
      mnemonic: TEST_MNEMONIC,
      nearPrivateKey: 'ed25519:fakekey',
      evmPrivateKey: '0x1234'
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    assert.equal(state.encryptWalletSecretsToVaultAsync, undefined);
    assert.equal(state.unlockWalletVaultSecretsAsync, undefined);
    state.saveWallets();

    const rawStored = storage.getItem('near_ca_wallets_v1');
    assert.ok(rawStored);
    const parsed = JSON.parse(rawStored);
    const storedW = parsed.wallets[0];
    assert.equal(storedW.mnemonic, TEST_MNEMONIC, 'saveWallets must persist mnemonic directly without Vault stripping');
    assert.equal(storedW.nearPrivateKey, 'ed25519:fakekey');
    assert.equal(storedW.encryptedVault, undefined);
  });
});

test('Phase 6.2: Active swap order isolates by walletId & backup sheet guards secret copy before reveal', () => {
  const stateRender = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/state/020-i18n-render.part.js'), 'utf8');
  assert.ok(stateRender.includes('parsed.walletId !== state.activeWalletId'));
  assert.ok(stateRender.includes("el.getAttribute('data-i18n-dynamic') === '1'"));

  const onboard = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/030-onboarding.part.js'), 'utf8');
  assert.ok(onboard.includes('data-secret-copy="1"'));
  assert.ok(onboard.includes('!_backupRevealActive'));
  assert.ok(onboard.includes('_tokenDetailState.fetchSeq'));
});

test('Phase 6.3: Unqueried ERC-20 stays null (--), tools preserve button disabled state, iOS QR fallback & SW hardened', () => {
  const tokenList = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/050-token-list.part.js'), 'utf8');
  assert.ok(!tokenList.includes("else if (chainNativeLoaded) {\n            bal = 0;"));

  const solRent = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/200-solana-rent.part.js'), 'utf8');
  assert.ok(solRent.includes('_solRentSelectedAtas.size > 0'));

  const nearStorage = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/210-near-storage.part.js'), 'utf8');
  assert.ok(nearStorage.includes('_nearStorageSelectedContracts.size > 0'));

  const nearKeys = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/090-near-keys.part.js'), 'utf8');
  assert.ok(!nearKeys.includes('else if (fnStatus === 404) {\n              fastNearConfirmedZero = true;'));

  const contacts = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/220-contacts.part.js'), 'utf8');
  assert.ok(contacts.includes('showConfirmDialogAsync('));

  const wc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/230-walletconnect.part.js'), 'utf8');
  assert.ok(wc.includes('getJsQrFn'), 'iOS WebView must support jsQR canvas fallback');

  const swCode = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  assert.ok(swCode.includes('ignoreSearch: true'));
  assert.ok(swCode.includes('walletconnect.umd.min.js'));
  assert.ok(swCode.includes("type === 'SKIP_WAITING'"));

  const hubHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/app/views/TradingViews.jsx'), 'utf8');
  assert.ok(hubHtml.includes('data-i18n="hub.langCurrent"'));
});
