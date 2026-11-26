'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');

function loadStoreModuleWithMockPreact({ windowObj, stateObj } = {}) {
  const src = fs.readFileSync(path.join(ROOT_DIR, 'src/app/store/useWalletStore.js'), 'utf8');
  const transformed = esbuild.transformSync(src, { loader: 'js', format: 'cjs' }).code;

  const hookStates = [];
  const effectCleanups = [];
  let hookIdx = 0;

  const mockPreactHooks = {
    useState(initVal) {
      const idx = hookIdx++;
      if (!(idx in hookStates)) {
        hookStates[idx] = typeof initVal === 'function' ? initVal() : initVal;
      }
      const setState = (updater) => {
        hookStates[idx] = typeof updater === 'function' ? updater(hookStates[idx]) : updater;
      };
      return [hookStates[idx], setState];
    },
    useEffect(fn) {
      const cleanup = fn();
      if (typeof cleanup === 'function') effectCleanups.push(cleanup);
    }
  };

  const mod = { exports: {} };
  const fn = new Function(
    'exports',
    'require',
    'module',
    'window',
    'globalThis',
    'CustomEvent',
    transformed
  );

  const CustomEventShim = function CustomEvent(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  };

  const fakeGlobal = { NearCAState: stateObj || null };
  fn(
    mod.exports,
    (id) => {
      if (id === 'preact/hooks') return mockPreactHooks;
      throw new Error(`Unexpected require: ${id}`);
    },
    mod,
    windowObj,
    fakeGlobal,
    CustomEventShim
  );

  return {
    exports: mod.exports,
    getTick: () => hookStates[0] || 0,
    resetHookIdx: () => { hookIdx = 0; },
    cleanupEffects: () => effectCleanups.forEach((c) => c())
  };
}

test('useWalletStore batches rapid notifyFrameworkState calls per microtask and filters topics', async () => {
  const listeners = new Map();
  const dispatched = [];
  const windowObj = {
    NearCAState: {
      lang: 'en',
      t: (zh, en) => en,
      getActiveWallet: () => ({ id: 'w1', name: 'Main' }),
      onLanguageChange: () => () => {}
    },
    addEventListener(type, cb) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(cb);
    },
    removeEventListener(type, cb) {
      if (listeners.has(type)) listeners.get(type).delete(cb);
    },
    dispatchEvent(evt) {
      dispatched.push(evt);
      const set = listeners.get(evt.type);
      if (set) {
        for (const cb of set) cb(evt);
      }
    }
  };

  const store = loadStoreModuleWithMockPreact({ windowObj, stateObj: windowObj.NearCAState });
  store.exports.useWalletState(['balances']);

  // Burst of 3 notifications in the same tick -> should coalesce into 1 CustomEvent
  store.exports.notifyFrameworkState('perp');
  store.exports.notifyFrameworkState('perp');
  store.exports.notifyFrameworkState('swap');
  await new Promise((r) => queueMicrotask(r));

  assert.equal(dispatched.length, 1);
  assert.deepEqual(dispatched[0].detail.topics, ['perp', 'swap']);
  // 'balances' listener must NOT have bumped for 'perp'/'swap'
  assert.equal(store.getTick(), 0);

  // Now notify 'balances' -> must bump
  store.exports.notifyFrameworkState('balances');
  await new Promise((r) => queueMicrotask(r));
  assert.equal(dispatched.length, 2);
  assert.equal(store.getTick(), 1);

  // Test useLang & useActiveWallet helpers
  store.resetHookIdx();
  const langHook = store.exports.useLang();
  assert.equal(langHook.lang, 'en');
  assert.equal(langHook.isEn, true);
  assert.equal(langHook.t('中文', 'English'), 'English');

  store.resetHookIdx();
  const activeWallet = store.exports.useActiveWallet();
  assert.deepEqual(activeWallet, { id: 'w1', name: 'Main' });

  store.cleanupEffects();
});

test('000-store.part.js emits framework state topics on storage & balance mutations without throwing when absent', () => {
  const partsDir = path.join(ROOT_DIR, 'src/parts/state');
  const combined = ['000-store.part.js', '010-i18n-dict.part.js', '020-i18n-render.part.js']
    .map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8'))
    .join('\n');

  const storageMap = new Map();
  const emittedTopics = [];
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k)
    },
    NearCAFramework: {
      notifyFrameworkState: (topic) => emittedTopics.push(topic)
    }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;

  vm.runInNewContext(combined, sandbox);
  const st = sandbox.NearCAState;
  assert.ok(st, 'NearCAState should initialize in sandbox');

  st.saveWallets();
  st.saveContacts();
  st.setLanguage('en');
  st.saveActiveSwapOrder({ depositAddress: '0x123' });
  st.clearSavedSwapOrder();
  const w = { erc20Balances: {} };
  st.setWalletErc20Balance(w, 'eth', '0xabc', 12.5);

  assert.ok(emittedTopics.includes('wallet'));
  assert.ok(emittedTopics.includes('contacts'));
  assert.ok(!emittedTopics.includes('lang'));
  assert.ok(emittedTopics.includes('swap'));
  assert.ok(emittedTopics.includes('balances'));

  // Must not throw when NearCAFramework is absent
  delete sandbox.NearCAFramework;
  assert.doesNotThrow(() => {
    st.saveWallets();
    st.setWalletErc20Balance(w, 'base', '0xdef', 1);
  });
});

test('Shared UI primitives (ActionButton, EmptyState, StatusBadge) compile and render expected props', () => {
  const uiFiles = ['ActionButton.jsx', 'EmptyState.jsx', 'StatusBadge.jsx'];
  const hMock = (type, props, ...children) => ({ type, props: props || {}, children });

  for (const file of uiFiles) {
    const fullPath = path.join(ROOT_DIR, 'src/app/components/ui', file);
    assert.ok(fs.existsSync(fullPath), `${file} should exist`);
    const code = fs.readFileSync(fullPath, 'utf8');
    const cjs = esbuild.transformSync(code, {
      loader: 'jsx',
      jsxFactory: 'h',
      format: 'cjs'
    }).code;

    const mod = { exports: {} };
    const fn = new Function('exports', 'require', 'module', cjs);
    fn(mod.exports, (id) => {
      if (id === 'preact') return { h: hMock };
      throw new Error(`Unexpected require: ${id}`);
    }, mod);

    const Comp = mod.exports.default;
    assert.equal(typeof Comp, 'function', `${file} should export a component function`);

    if (file === 'ActionButton.jsx') {
      let clicked = 0;
      const vnode = Comp({
        loading: true,
        loadingText: 'Sending...',
        dataAction: 'send-tx',
        onClick: () => { clicked += 1; }
      }, 'Send');
      assert.equal(vnode.type, 'button');
      assert.equal(vnode.props.disabled, true);
      assert.equal(vnode.props['aria-busy'], 'true');
      assert.equal(vnode.props['data-action'], 'send-tx');
      vnode.props.onClick({ preventDefault() {} });
      assert.equal(clicked, 0, 'loading ActionButton should block onClick');
    } else if (file === 'StatusBadge.jsx') {
      const vnode = Comp({ tone: 'emerald' }, 'SUCCESS');
      assert.equal(vnode.type, 'span');
      assert.ok(vnode.props.class.includes('text-emerald-300'));
    } else if (file === 'EmptyState.jsx') {
      const vnode = Comp({ loading: true, title: 'Loading...' });
      assert.equal(vnode.type, 'div');
    }
  }
});

test('Lazy jsQR build script, sync config, gitignore, and scanner loader are wired', () => {
  const buildScriptPath = path.join(ROOT_DIR, 'scripts/build-jsqr.js');
  assert.ok(fs.existsSync(buildScriptPath), 'scripts/build-jsqr.js should exist');
  const buildMod = require(buildScriptPath);
  assert.equal(typeof buildMod.buildJsQr, 'function');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts.build.includes('node scripts/build-jsqr.js'));
  assert.ok(pkg.scripts.sync === 'npm run build' || pkg.scripts.sync.includes('node scripts/build-jsqr.js'));

  const syncAssetsSrc = fs.readFileSync(path.join(ROOT_DIR, 'scripts/sync-assets.js'), 'utf8');
  assert.ok(syncAssetsSrc.includes("'src/jsqr-lazy.js'"));

  const gitignoreSrc = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
  assert.ok(gitignoreSrc.includes('/src/jsqr-lazy.js'));

  const wcPartSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/230-walletconnect.part.js'), 'utf8');
  assert.ok(wcPartSrc.includes('ensureJsQrLoaded'));
  assert.ok(wcPartSrc.includes('src/jsqr-lazy.js'));
});
