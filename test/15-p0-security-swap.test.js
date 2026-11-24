'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  state,
  uiController,
  tokenRegistry,
  nearIntents,
  TEST_MNEMONIC,
  withMockedStorage,
  withMockedFetch,
  jsonResponse
} = require('./helpers.js');

test('P0.1: Vault refuses empty overwrite & biometricEnabled=false disables biometric lock', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_p0_vault',
      name: 'Vault P0',
      mnemonic: TEST_MNEMONIC,
      nearPrivateKey: 'ed25519:testkey',
      pin: '123456',
      webauthnCredentialId: 'cred-1',
      biometricEnabled: false
    });
    const env = await state.encryptWalletSecretsToVaultAsync(w, '123456');
    assert.ok(env && env.ctBase64);

    // Strip all plaintext secrets (simulating locked wallet B after cold load)
    for (const k of [
      'mnemonic', 'prlMnemonic', 'btcMnemonic', 'legacyEvmMnemonic', 'legacySolMnemonic',
      'nearPrivateKey', 'nearPrivateSeedHex', 'evmPrivateKey', 'solPrivateSeedHex',
      'privateKeyHex', 'tweakedPrivateKeyHex', 'btcPrivateKeyHex', 'btcTweakedPrivateKeyHex'
    ]) {
      w[k] = '';
    }
    const overwriteAttempt = await state.encryptWalletSecretsToVaultAsync(w, '999999');
    assert.equal(overwriteAttempt, null, 'Must refuse to overwrite existing encryptedVault with empty secrets');
    assert.equal(w.encryptedVault.ctBase64, env.ctBase64, 'Original vault ciphertext must remain intact');

    // Verify unlock still works with original PIN
    const unlocked = await state.unlockWalletVaultSecretsAsync(w, '123456');
    assert.equal(unlocked, true);
    assert.equal(w.mnemonic, TEST_MNEMONIC);

    // Verify biometricEnabled=false prevents biometric-only app lock when no PIN
    const noPinBioOff = state.normalizeWalletRecord({
      id: 'w_p0_bio_off',
      webauthnCredentialId: 'cred-2',
      biometricEnabled: false
    });
    assert.equal(uiController.shouldEnableAppLockForWallet(noPinBioOff, { nativePlugin: {} }), false);

    // Verify zero calls to nonexistent openSetWalletPinPrompt(...)
    const secSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/010-security.part.js'), 'utf8');
    assert.equal(/\bopenSetWalletPinPrompt\s*\(/.test(secSrc), false, 'Must not call nonexistent openSetWalletPinPrompt()');
  });
});

test('P0.2: Swap evaluateSwapButtonState blocks net_out_zero using selectedReserve & blocks during quoting', () => {
  const fromToken = {
    assetId: 'nep141:wrap.near',
    symbol: 'NEAR',
    blockchain: 'near',
    decimals: 24,
    contractAddress: 'wrap.near'
  };
  const toToken = {
    assetId: 'sol:dex:bonk',
    symbol: 'BONK',
    blockchain: 'sol',
    decimals: 5,
    contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'
  };
  const wallet = {
    id: 'w_swap_p0',
    nearBalance: 5,
    nativeBalances: { near: 5, sol: 0 }
  };
  const quoteData = {
    amountOutFormatted: '100',
    stages: [
      { type: 'BRIDGE_OUT', expectedOut: '1000000' }, // 0.001 SOL (< 0.015 SOL reserve)
      { type: 'DEST_DEX', expectedOut: '10000000' }
    ]
  };
  const res = uiController.evaluateSwapButtonState({
    wallet,
    fromToken,
    toToken,
    amountIn: '1',
    quoteData,
    isQuoting: false,
    isExecuting: false,
    gasReserveMode: 'auto'
  });
  assert.equal(res.disabled, true);
  assert.equal(res.reason, 'net_out_zero', 'Must block swap when target gas reserve consumes 100% of intermediary');

  const pendingRes = uiController.evaluateSwapButtonState({
    wallet,
    fromToken,
    toToken,
    amountIn: '1',
    quoteData: null,
    isQuoting: true,
    isExecuting: false
  });
  assert.equal(pendingRes.disabled, true);
  assert.equal(pendingRes.reason, 'quoting');
});

test('P0.3: Swap selectSwapToken auto-flips opposite side & fetchLiveDefuseTokenPrices refreshes non-1Click prices', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({ id: 'w_flip', name: 'Flip', mnemonic: TEST_MNEMONIC });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.swap.fromAssetId = 'nep141:wrap.near';
    state.swap.toAssetId = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
    state.swap.pickerSide = 'from';

    // Pick same token as toAssetId -> must auto-flip
    globalThis.selectSwapToken(state.swap.toAssetId);
    assert.equal(state.swap.fromAssetId, 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1');
    assert.equal(state.swap.toAssetId, 'nep141:wrap.near');

    // Non-1Click token price must refresh across separate runs
    const prlToken = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PRL' && t.blockchain === 'prl');
    if (prlToken) {
      prlToken.price = 1.23; // stale price from previous run
      await withMockedFetch(async (url) => {
        if (url.includes('1click.chaindefuser.com')) return jsonResponse([]);
        if (url.includes('prlscan.com')) return jsonResponse({ price_usd: 2.5 });
        return jsonResponse({}, 404);
      }, async () => {
        await nearIntents.fetchLiveDefuseTokenPrices({ force: true });
      });
      assert.equal(prlToken.price, 2.5, 'Non-1Click PRL price must refresh instead of staying frozen at 1.23');
    }
  });
});
