'use strict';

const { test, assert, fs, path, ROOT_DIR, cryptoEngine, chainContracts, state, TEST_MNEMONIC } = require('./helpers');

test('Item 11-15: toUserFriendlyError mappings, jargon sanitization, and unified confirm dialog + send receipt', () => {
  const prevLang = state.lang;
  try {
    state.setLanguage('zh');
    assert.equal(
      chainContracts.toUserFriendlyError(new Error('HTTP 400 Bad Request'), '兜底', 'Fallback'),
      '请求参数有误，请检查输入后重试'
    );
    assert.equal(
      chainContracts.toUserFriendlyError(new Error('insufficient lamports for rent'), '兜底', 'Fallback'),
      'SOL 余额不足以支付网络手续费或账户租金，请充值后重试'
    );
    assert.equal(
      chainContracts.toUserFriendlyError(new Error('Transaction simulation failed: custom program error: 0x1'), '兜底', 'Fallback'),
      '交易预校验失败，请检查余额或交易参数后重试'
    );
    assert.equal(
      chainContracts.toUserFriendlyError(new Error('TransactionExpiredBlockheightExceededError'), '兜底', 'Fallback'),
      '交易已超时过期，请重试'
    );
    assert.equal(
      chainContracts.toUserFriendlyError(new Error('gas estimation failed'), '兜底', 'Fallback'),
      '网络手续费估算失败，请检查余额或稍后重试'
    );
    assert.equal(
      chainContracts.toUserFriendlyError(new Error('execution reverted'), '兜底', 'Fallback'),
      '合约执行失败，请检查交易参数或稍后重试'
    );
    assert.equal(
      chainContracts.toUserFriendlyError(new Error('Unexpected Borsh deserialization failure'), '操作失败兜底', 'Fallback'),
      '操作失败兜底'
    );

    state.setLanguage('en');
    assert.equal(
      chainContracts.toUserFriendlyError(new Error('HTTP 400 Bad Request'), '兜底', 'Fallback'),
      'Invalid request parameters. Please check your input and retry.'
    );

    // Item 15: unified confirm dialog & send receipt exist
    const confirmHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/index-html/085-sheet-confirm.part.html'), 'utf8');
    assert.ok(confirmHtml.includes('id="sheet-confirm-dialog"'));
    const sendHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/index-html/060-sheets-core.part.html'), 'utf8');
    assert.ok(sendHtml.includes('id="send-tx-receipt"'));
    const perpHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/index-html/030-view-perp.part.html'), 'utf8');
    assert.ok(perpHtml.includes('id="perp-ob-bid-sz-hdr" data-i18n="perp.obSizeHdr"'));
  } finally {
    state.setLanguage(prevLang || 'zh');
  }
});

test('Item 16-19: Perp chart MA cache & overlay scrub, allMids throttle, visibility poll, CSS & sheet-handle drag', () => {
  const chartSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/161-perps-chart.part.js'), 'utf8');
  assert.ok(chartSrc.includes('getCachedPerpMa'));
  assert.ok(chartSrc.includes('updatePerpCrosshairOverlay'));

  const tradeSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/163-perps-trade.part.js'), 'utf8');
  assert.ok(tradeSrc.includes('scheduleThrottledAllMidsRender'));

  const navSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/020-navigation.part.js'), 'utf8');
  assert.ok(navSrc.includes('bindSheetHandleDrag'));

  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.ok(cssSrc.includes('#view-wallet.ptr-pulling'));
  assert.ok(cssSrc.includes('backdrop-filter: blur(12px)'));
  assert.ok(!cssSrc.includes('.hub-menu-group {\n  margin-bottom: 14px;\n  border-radius: 16px;\n  background: rgba(20, 26, 40, 0.72);\n  border: 1px solid rgba(255, 255, 255, 0.08);\n  overflow: hidden;\n  backdrop-filter:'));
});

test('Item 24-26: Preact topics, MPC hot path skips legacy Pearl/BTC, ToastBanner wired & sync-assets skips jsqr-lazy', () => {
  const earnPanelSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/components/EarnPoolsPanel.jsx'), 'utf8');
  assert.ok(earnPanelSrc.includes("useWalletState(['earn', 'lang'])"));

  const storeHookSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/store/useWalletStore.js'), 'utf8');
  assert.ok(!storeHookSrc.includes('onLanguageChange'));

  const mpcDefault = cryptoEngine.deriveNearMpcAllAddresses('alice.near');
  assert.ok(mpcDefault.evmAddress && mpcDefault.solAddress);
  assert.equal(mpcDefault.pearlAddress, undefined, 'Hot path must skip legacy Pearl MPC derivation');
  assert.equal(mpcDefault.btcAddress, undefined, 'Hot path must skip legacy BTC MPC derivation');

  const mpcLegacy = cryptoEngine.deriveNearMpcAllAddresses('alice.near', { includeLegacy: true });
  assert.ok(mpcLegacy.pearlAddress && mpcLegacy.btcAddress);

  const syncSrc = fs.readFileSync(path.join(ROOT_DIR, 'scripts/sync-assets.js'), 'utf8');
  assert.ok(syncSrc.includes("rel !== 'src/jsqr-lazy.js'"));
});
