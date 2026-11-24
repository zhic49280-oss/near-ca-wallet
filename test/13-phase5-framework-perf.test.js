'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR
} = require('./helpers.js');

test('Phase 5.1: Preact framework exports all high-frequency mount bridges and topic store', () => {
  const mainJsx = fs.readFileSync(path.join(ROOT_DIR, 'src/app/main.jsx'), 'utf8');
  for (const fn of ['mountSwapHistory', 'mountAssetList', 'mountTokenPicker', 'mountPerpOverview', 'mountPerpOrderbookSide', 'mountPerpBottomList']) {
    assert.ok(mainJsx.includes(fn), `src/app/main.jsx must export ${fn}`);
  }
  const storeJs = fs.readFileSync(path.join(ROOT_DIR, 'src/app/store/useWalletStore.js'), 'utf8');
  assert.ok(storeJs.includes('topicSet.has'), 'useWalletStore must support topic-scoped subscriptions');

  const fwBuilt = fs.readFileSync(path.join(ROOT_DIR, 'src/framework-ui.js'), 'utf8');
  assert.ok(fwBuilt.length > 0);
});

test('Phase 5.2: UI controllers wire Preact mounts with Node fallback & throttle background RPCs/renders', () => {
  const tokenList = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/050-token-list.part.js'), 'utf8');
  assert.ok(tokenList.includes('fw.mountAssetList'));

  const picker = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/140-token-picker.part.js'), 'utf8');
  assert.ok(picker.includes('fw.mountTokenPicker'));

  const perpOb = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/162-perps-orderbook.part.js'), 'utf8');
  assert.ok(perpOb.includes('fw.mountPerpOverview'));
  assert.ok(perpOb.includes('if (!isTradeView)'), 'Hidden overview panel must not rebuild during trade view');

  const lifecycle = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/240-lifecycle.part.js'), 'utf8');
  assert.ok(lifecycle.includes('_deferredBootSync = true'), 'Locked boot must defer full-chain sync until unlock');

  const sec = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/010-security.part.js'), 'utf8');
  assert.ok(sec.includes('_deferredBootSync = false'), 'clearAppLock must resume deferred boot sync');

  const autoSync = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/061-token-detail-ui.part.js'), 'utf8');
  assert.ok(autoSync.includes('isAppLocked()'), 'Auto sync must skip while locked');
  assert.ok(autoSync.includes("st.activeTab === 'hub'"), 'Auto sync must skip irrelevant hub tab');

  const balSync = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/040-balance-sync.part.js'), 'utf8');
  assert.ok(balSync.includes('250);'), 'Progressive render debounce must be >= 250ms');
});
