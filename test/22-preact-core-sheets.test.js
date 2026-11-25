'use strict';

const vm = require('vm');
const { test, assert, fs, path, ROOT_DIR } = require('./helpers.js');

const moduleCache = new Map();

function loadJsxModule(relPath) {
  const absPath = path.join(ROOT_DIR, relPath);
  if (moduleCache.has(absPath)) return moduleCache.get(absPath);

  const esbuild = require('esbuild');
  const preact = require('preact');
  const hooks = {
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {}
  };
  const src = fs.readFileSync(absPath, 'utf8');
  const out = esbuild.transformSync(src, {
    loader: 'jsx',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    format: 'cjs'
  });
  const mod = { exports: {} };
  moduleCache.set(absPath, mod.exports);

  const fn = vm.runInNewContext(
    `(function(require, module, exports) {\n${out.code}\n})`,
    { console, Date, Number, String, Boolean, Array, Object, Set, Map, Math, encodeURIComponent }
  );
  fn((id) => {
    if (id === 'preact') return preact;
    if (id === 'preact/hooks') return hooks;
    if (id.startsWith('.')) {
      const resolved = path.normalize(path.join(path.dirname(absPath), id));
      const rel = path.relative(ROOT_DIR, resolved);
      if (resolved.endsWith('useWalletStore.js')) {
        return {
          useWalletState: () => null,
          notifyFrameworkState: () => {},
          useLang: () => ({ lang: 'zh', isEn: false, t: (zh) => zh }),
          useActiveWallet: () => null
        };
      }
      return loadJsxModule(rel);
    }
    throw new Error(`Unexpected import "${id}" in ${relPath}`);
  }, mod, mod.exports);
  moduleCache.set(absPath, mod.exports);
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

test('P2A-1: WalletManagerPanels exports and renders WalletListPanel, BackupSecretsPanel, WalletAddressesPanel', () => {
  const { h } = require('preact');
  const {
    WalletListPanel,
    BackupSecretsPanel,
    WalletAddressesPanel
  } = loadJsxModule('src/app/components/WalletManagerPanels.jsx');

  assert.equal(typeof WalletListPanel, 'function');
  assert.equal(typeof BackupSecretsPanel, 'function');
  assert.equal(typeof WalletAddressesPanel, 'function');

  // Empty wallet list
  assert.ok(collectText(h(WalletListPanel, { wallets: [], isEn: true })).includes('No wallets'));
  assert.ok(collectText(h(WalletListPanel, { wallets: [], isEn: false })).includes('暂无钱包'));

  // Multi-wallet list with active badge and delete action
  const wallets = [
    { id: 'w1', name: 'Main', nearNamedAccount: 'alice.near', nearAddress: 'abc' },
    { id: 'w2', name: 'Alt', nearNamedAccount: '', nearAddress: '0123456789abcdef0123456789abcdef' }
  ];
  const listVnode = h(WalletListPanel, { wallets, activeWalletId: 'w1', isEn: true });
  const listText = collectText(listVnode);
  assert.ok(listText.includes('Main'));
  assert.ok(listText.includes('Active'));
  assert.ok(listText.includes('alice.near'));
  const delBtns = findElements(listVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'delete-wallet');
  assert.equal(delBtns.length, 2);

  // BackupSecretsPanel masked vs revealed
  let toggled = false;
  const rows = [
    { label: 'Recovery Phrase', val: 'abandon ability able', secret: true },
    { label: 'NEAR Master Account', val: 'alice.near', secret: false }
  ];
  const maskedVnode = h(BackupSecretsPanel, {
    rows,
    revealed: false,
    isEn: true,
    onToggleReveal: () => { toggled = true; }
  });
  const maskedText = collectText(maskedVnode);
  assert.ok(maskedText.includes('Reveal Phrase & Keys'));
  assert.ok(maskedText.includes('•••• ••••'));
  assert.ok(!maskedText.includes('abandon ability able'));
  const toggleBtn = findElements(maskedVnode, (n) => n.type === 'button' && n.props && n.props.id === 'btn-backup-reveal-toggle')[0];
  assert.ok(toggleBtn);
  toggleBtn.props.onClick();
  assert.equal(toggled, true);

  const revealedText = collectText(h(BackupSecretsPanel, { rows, revealed: true, isEn: true }));
  assert.ok(revealedText.includes('Hide Phrase & Keys'));
  assert.ok(revealedText.includes('abandon ability able'));

  // WalletAddressesPanel
  assert.ok(collectText(h(WalletAddressesPanel, { items: [], isEn: false })).includes('暂无地址'));
  const addrVnode = h(WalletAddressesPanel, {
    items: [{ k: 'NEAR Master Account', v: 'alice.near' }],
    isEn: true
  });
  const copyBtns = findElements(addrVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'copy-text');
  assert.equal(copyBtns.length, 1);
  assert.equal(copyBtns[0].props['data-val'], 'alice.near');
});

test('P2A-2: SendReceivePanels exports and renders SendFeeSummaryPanel and ReceiveAddressListPanel', () => {
  const { h } = require('preact');
  const {
    SendFeeSummaryPanel,
    ReceiveAddressListPanel
  } = loadJsxModule('src/app/components/SendReceivePanels.jsx');

  assert.equal(typeof SendFeeSummaryPanel, 'function');
  assert.equal(typeof ReceiveAddressListPanel, 'function');

  assert.equal(h(SendFeeSummaryPanel, { visible: false }).type === SendFeeSummaryPanel ? collectText(h(SendFeeSummaryPanel, { visible: false })) : '', '');

  const errText = collectText(h(SendFeeSummaryPanel, { visible: true, errorText: 'Cross-chain send is unavailable', isEn: true }));
  assert.ok(errText.includes('Cross-chain send is unavailable'));

  const routeText = collectText(h(SendFeeSummaryPanel, {
    visible: true,
    fromChain: 'NEAR',
    toChain: 'ETH',
    feePctText: '0.25%',
    estOutText: 'Est. Receive: ~9.975 USDC',
    isEn: true
  }));
  assert.ok(routeText.includes('NEAR ➔ ETH'));
  assert.ok(routeText.includes('Cross-Chain Fee: 0.25%'));
  assert.ok(routeText.includes('Est. Receive: ~9.975 USDC'));

  const pillsVnode = h(ReceiveAddressListPanel, {
    options: [
      { key: 'near', label: 'NEAR (.near)' },
      { key: 'evm', label: 'EVM' }
    ],
    selectedNetwork: 'evm',
    mode: 'pills',
    isEn: true
  });
  const pillBtns = findElements(pillsVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'select-receive-network');
  assert.equal(pillBtns.length, 2);
  assert.ok(pillBtns[1].props.className.includes('active'));

  const qtcErrVnode = h(ReceiveAddressListPanel, { mode: 'qtc-error', isEn: true });
  assert.ok(collectText(qtcErrVnode).includes('Failed to fetch QTC deposit address'));
  const retryBtns = findElements(qtcErrVnode, (n) => n.type === 'button' && n.props && n.props['data-net'] === 'qtc');
  assert.equal(retryBtns.length, 1);
});

test('P2A-3: TokenDetailPanels exports and renders TokenBreakdownPanel, TxHistorySheetPanel, TxDetailPanel', () => {
  const { h } = require('preact');
  const {
    TokenBreakdownPanel,
    TxHistorySheetPanel,
    TxDetailPanel
  } = loadJsxModule('src/app/components/TokenDetailPanels.jsx');

  assert.equal(typeof TokenBreakdownPanel, 'function');
  assert.equal(typeof TxHistorySheetPanel, 'function');
  assert.equal(typeof TxDetailPanel, 'function');

  const breakdownVnode = h(TokenBreakdownPanel, {
    entries: [{ blockchain: 'near', assetId: 'nep141:wrap.near', balance: 12.5, token: { symbol: 'NEAR' } }],
    symbol: 'NEAR',
    isEn: true,
    getChainMeta: () => ({ name: 'NEAR Protocol' })
  });
  const bdText = collectText(breakdownVnode);
  assert.ok(bdText.includes('NEAR Protocol'));
  assert.ok(bdText.includes('12.5 NEAR'));
  const swapBtns = findElements(breakdownVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'detail-swap');
  const sendBtns = findElements(breakdownVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'detail-send');
  assert.equal(swapBtns.length, 1);
  assert.equal(sendBtns.length, 1);

  assert.ok(collectText(h(TxHistorySheetPanel, { items: [], isEn: true })).includes('No transactions found'));
  const histVnode = h(TxHistorySheetPanel, {
    items: [{ id: 't1', type: 'send', symbol: 'SOL', amount: 1.5, chain: 'sol', txHash: '5abc1234567890def', status: 'confirmed' }],
    isEn: true,
    getChainMeta: () => ({ shortName: 'SOL' }),
    getExplorerTxUrl: (_c, hStr) => `https://solscan.io/tx/${hStr}`,
    isValidHttpsUrl: (u) => u.startsWith('https://')
  });
  const histText = collectText(histVnode);
  assert.ok(histText.includes('Send SOL'));
  assert.ok(histText.includes('-1.5 SOL'));
  assert.ok(histText.includes('Explorer'));

  const detailVnode = h(TxDetailPanel, {
    item: { id: 't1', type: 'receive', symbol: 'ETH', amount: 0.25, chain: 'eth', txHash: '0x1234567890abcdef1234567890', status: 'confirmed' },
    isEn: true,
    getChainMeta: () => ({ name: 'Ethereum' }),
    getExplorerTxUrl: (_c, hStr) => `https://etherscan.io/tx/${hStr}`,
    isValidHttpsUrl: (u) => u.startsWith('https://')
  });
  const detailText = collectText(detailVnode);
  assert.ok(detailText.includes('Receive ETH'));
  assert.ok(detailText.includes('+0.25 ETH'));
  assert.ok(detailText.includes('Confirmed'));
  assert.ok(detailText.includes('Ethereum'));
  assert.ok(detailText.includes('View on Block Explorer'));
});

test('P2A-4: Zero dangerouslySetInnerHTML in new JSX panels and framework mounts wired in ui-controller parts', () => {
  const jsxFiles = [
    'src/app/components/WalletManagerPanels.jsx',
    'src/app/components/SendReceivePanels.jsx',
    'src/app/components/TokenDetailPanels.jsx'
  ];
  for (const rel of jsxFiles) {
    const content = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
    assert.ok(!content.includes('dangerouslySetInnerHTML'), `${rel} must not use dangerouslySetInnerHTML`);
  }

  const p030 = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/030-onboarding.part.js'), 'utf8');
  assert.ok(p030.includes('fw.mountWalletListPanel('));
  assert.ok(p030.includes('fw.mountBackupSecretsPanel('));

  const p060 = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/060-token-detail-core.part.js'), 'utf8');
  assert.ok(p060.includes('fw.mountTxHistorySheetPanel('));
  assert.ok(p060.includes('fw.mountTxDetailPanel('));

  const p061 = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/061-token-detail-ui.part.js'), 'utf8');
  assert.ok(p061.includes('fw.mountTokenBreakdownPanel('));

  const p080 = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/080-send.part.js'), 'utf8');
  assert.ok(p080.includes('fw.mountSendFeeSummaryPanel('));

  const p090 = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/090-receive.part.js'), 'utf8');
  assert.ok(p090.includes('fw.mountReceiveAddressListPanel('));
});
