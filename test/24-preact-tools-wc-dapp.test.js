'use strict';

const vm = require('vm');
const { test, assert, fs, path, ROOT_DIR } = require('./helpers.js');

function loadJsxModule(relPath, cache = new Map()) {
  const absPath = path.resolve(ROOT_DIR, relPath);
  if (cache.has(absPath)) return cache.get(absPath);

  const esbuild = require('esbuild');
  const preact = require('preact');
  const src = fs.readFileSync(absPath, 'utf8');
  const out = esbuild.transformSync(src, {
    loader: 'jsx',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    format: 'cjs'
  });
  const mod = { exports: {} };
  cache.set(absPath, mod.exports);

  const hooksStub = {
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (init) => ({ current: init }),
    useCallback: (fn) => fn
  };
  const fn = vm.runInNewContext(
    `(function(require, module, exports) {\n${out.code}\n})`,
    { console, Date, Number, String, Boolean, Array, Object, Set, Map, Math, URL }
  );
  fn((id) => {
    if (id === 'preact') return preact;
    if (id === 'preact/hooks') return hooksStub;
    if (id.startsWith('./') || id.startsWith('../')) {
      const targetAbs = path.resolve(path.dirname(absPath), id);
      const targetRel = path.relative(ROOT_DIR, targetAbs);
      return loadJsxModule(targetRel, cache);
    }
    throw new Error(`Unexpected import "${id}" in ${relPath}`);
  }, mod, mod.exports);

  cache.set(absPath, mod.exports);
  return mod.exports;
}

function collectText(vnode) {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') return '';
  if (typeof vnode === 'string' || typeof vnode === 'number') return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(collectText).join('');
  if (typeof vnode === 'object') {
    if (typeof vnode.type === 'function') {
      return collectText(vnode.type(vnode.props || {}));
    }
    const children = vnode.props && vnode.props.children;
    return collectText(children);
  }
  return '';
}

function findElements(vnode, predicate, acc = []) {
  if (!vnode || typeof vnode !== 'object') return acc;
  if (Array.isArray(vnode)) {
    for (const child of vnode) findElements(child, predicate, acc);
    return acc;
  }
  if (typeof vnode.type === 'function') {
    return findElements(vnode.type(vnode.props || {}), predicate, acc);
  }
  if (predicate(vnode)) acc.push(vnode);
  const children = vnode.props && vnode.props.children;
  if (children !== undefined) findElements(children, predicate, acc);
  return acc;
}

test('FW-4.1: ToastBanner renders visible/hidden states and tone', () => {
  const { h } = require('preact');
  const { ToastBanner } = loadJsxModule('src/app/components/ui/ToastBanner.jsx');
  assert.equal(typeof ToastBanner, 'function');

  const hiddenVnode = findElements(h(ToastBanner, { message: 'Saved', visible: false }), (n) => n.type === 'div')[0];
  assert.equal(hiddenVnode.props.id, 'toast');
  assert.equal(hiddenVnode.props.class.includes('show'), false);

  const shownVnode = findElements(h(ToastBanner, { message: 'Saved', visible: true, tone: 'emerald' }), (n) => n.type === 'div')[0];
  assert.equal(shownVnode.props.class.includes('toast'), true);
  assert.equal(shownVnode.props.class.includes('show'), true);
  assert.equal(shownVnode.props['data-tone'], 'emerald');
  assert.ok(collectText(shownVnode).includes('Saved'));
});

test('FW-4.2: MiningProPanel exports MiningTelemetryPanel and MiningWorkersPanel', () => {
  const { h } = require('preact');
  const { MiningTelemetryPanel, MiningWorkersPanel } = loadJsxModule('src/app/components/MiningProPanel.jsx');
  assert.equal(typeof MiningTelemetryPanel, 'function');
  assert.equal(typeof MiningWorkersPanel, 'function');

  const fallbackNet = collectText(h(MiningTelemetryPanel, { network: null, isEn: true }));
  assert.ok(fallbackNet.includes('Pearl Mainnet'));
  assert.ok(fallbackNet.includes('--'));

  const netText = collectText(h(MiningTelemetryPanel, {
    network: { height: 123456, networkHashrateFormatted: '1.2 GH/s', difficultyM: 42, blockRewardPrl: 5 },
    isEn: true
  }));
  assert.ok(netText.includes('123,456'));
  assert.ok(netText.includes('1.2 GH/s'));
  assert.ok(netText.includes('42M · 5 PRL'));

  const watchVnode = h(MiningTelemetryPanel, {
    mode: 'watchlist',
    watchlist: [{ address: 'prl1p1234567890abcdef', label: 'RigA' }],
    isEn: false
  });
  const selectSpans = findElements(watchVnode, (n) => n.props && n.props['data-action'] === 'select-miner');
  const removeSpans = findElements(watchVnode, (n) => n.props && n.props['data-action'] === 'remove-miner');
  assert.equal(selectSpans.length, 1);
  assert.equal(removeSpans.length, 1);

  const emptyWorkers = collectText(h(MiningWorkersPanel, { workers: [], isEn: false }));
  assert.ok(emptyWorkers.includes('暂无矿机记录'));

  const workersVnode = h(MiningWorkersPanel, {
    workers: [
      { name: 'gpu-01', status: 'online', hashrate30mFormatted: '120 MH/s', hashrate24hFormatted: '118 MH/s', validShares: 100, rejectedShares: 1 }
    ],
    isEn: true
  });
  const workersText = collectText(workersVnode);
  assert.ok(workersText.includes('gpu-01'));
  assert.ok(workersText.includes('Online'));
  assert.ok(workersText.includes('100 / 1'));
});

test('FW-4.3: WalletConnectPanel exports WcSessionsPanel and WcProposalPanel with loading guard', () => {
  const { h } = require('preact');
  const { WcSessionsPanel, WcProposalPanel } = loadJsxModule('src/app/components/WalletConnectPanel.jsx');
  assert.equal(typeof WcSessionsPanel, 'function');
  assert.equal(typeof WcProposalPanel, 'function');

  assert.ok(collectText(h(WcSessionsPanel, { sessions: [], isEn: true })).includes('No active sessions'));

  const sessVnode = h(WcSessionsPanel, {
    sessions: [{ topic: 'topic_abc', peer: { metadata: { name: 'Uniswap', url: 'https://app.uniswap.org' } } }],
    isEn: false
  });
  const discBtns = findElements(sessVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'disconnect-wc');
  assert.equal(discBtns.length, 1);
  assert.equal(discBtns[0].props['data-topic'], 'topic_abc');

  assert.equal(h(WcProposalPanel, { proposal: null }).type(h(WcProposalPanel, { proposal: null }).props), null);

  let approved = 0;
  const propVnode = h(WcProposalPanel, {
    proposal: {
      params: {
        proposer: { metadata: { name: 'Ref Finance', url: 'https://app.ref.finance' } },
        requiredNamespaces: { eip155: { chains: ['eip155:1'] } }
      }
    },
    approving: true,
    isEn: true,
    onApprove: () => { approved += 1; }
  });
  const propText = collectText(propVnode);
  assert.ok(propText.includes('Ref Finance'));
  assert.ok(propText.includes('eip155:1'));
  assert.ok(propText.includes('Approving...'));
  const approveBtn = findElements(propVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'approve-wc-proposal')[0];
  assert.equal(approveBtn.props.disabled, true);
  approveBtn.props.onClick();
  assert.equal(approved, 0);
});

test('FW-4.4: DAppBrowserPanels exports DAppBookmarksPanel and DAppApprovePanel', () => {
  const { h } = require('preact');
  const { DAppBookmarksPanel, DAppApprovePanel } = loadJsxModule('src/app/components/DAppBrowserPanels.jsx');
  assert.equal(typeof DAppBookmarksPanel, 'function');
  assert.equal(typeof DAppApprovePanel, 'function');

  const connVnode = h(DAppBookmarksPanel, {
    mode: 'connected',
    connected: [{ origin: 'https://app.ref.finance', host: 'app.ref.finance', badges: 'NEAR' }],
    isEn: true
  });
  assert.equal(findElements(connVnode, (n) => n.props && n.props['data-action'] === 'disconnect-all-dapp-origins').length, 1);
  assert.equal(findElements(connVnode, (n) => n.props && n.props['data-action'] === 'disconnect-dapp-origin').length, 1);

  const catVnode = h(DAppBookmarksPanel, {
    mode: 'catalog',
    chainFilter: 'NEAR',
    catalog: [
      { name: 'Ref Finance', chain: 'NEAR', url: 'https://app.ref.finance', descEn: 'NEAR DEX', descZh: 'NEAR 交易所' },
      { name: 'Jupiter', chain: 'Solana', url: 'https://jup.ag', descEn: 'Solana DEX', descZh: 'Solana 聚合' }
    ],
    isEn: true
  });
  const launchBtns = findElements(catVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'launch-dapp');
  assert.equal(launchBtns.length, 1);
  assert.equal(launchBtns[0].props['data-url'], 'https://app.ref.finance');

  const approveVnode = h(DAppApprovePanel, {
    origin: 'https://app.ref.finance',
    chainLabel: 'NEAR Mainnet',
    method: 'Sign Message',
    account: 'alice.near',
    summary: 'Sign in to Ref',
    isEn: true
  });
  const approveText = collectText(approveVnode);
  assert.ok(approveText.includes('https://app.ref.finance'));
  assert.ok(approveText.includes('NEAR Mainnet'));
  assert.ok(approveText.includes('alice.near'));
  assert.ok(approveText.includes('Approve & Sign'));
});

test('FW-4.5: New JSX components contain zero dangerouslySetInnerHTML and zero developer jargon', () => {
  const files = [
    'src/app/components/ui/ToastBanner.jsx',
    'src/app/components/MiningProPanel.jsx',
    'src/app/components/WalletConnectPanel.jsx',
    'src/app/components/DAppBrowserPanels.jsx'
  ];
  const forbidden = ['dangerouslySetInnerHTML', 'WebView', 'CORS', 'HRP', 'broadcast', 'NEP-413', 'RPC', 'HTTP'];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    for (const term of forbidden) {
      assert.equal(src.includes(term), false, `${rel} must not contain "${term}"`);
    }
    const withoutExportName = src.replace(/MiningTelemetryPanel/g, '');
    assert.equal(withoutExportName.includes('Telemetry'), false, `${rel} must not expose "Telemetry"`);
  }
});

test('FW-4.6: ui-controller part integrations exist, preserve fallback, and stay under 60KB', () => {
  const checks = [
    ['190-mining.part.js', 'mountMiningTelemetryPanel'],
    ['190-mining.part.js', 'mountMiningWorkersPanel'],
    ['230-walletconnect.part.js', 'mountWcSessionsPanel'],
    ['230-walletconnect.part.js', 'mountWcProposalPanel'],
    ['235-dapp-browser.part.js', 'mountDAppBookmarksPanel'],
    ['235-dapp-browser.part.js', 'mountDAppApprovePanel']
  ];
  for (const [file, fnName] of checks) {
    const fullPath = path.join(ROOT_DIR, 'src/parts/ui-controller', file);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size <= 60 * 1024, `${file} (${stat.size} bytes) must stay <= 60KB`);
    const src = fs.readFileSync(fullPath, 'utf8');
    assert.ok(src.includes(`fw.${fnName}`), `${file} must wire fw.${fnName}`);
  }
});
