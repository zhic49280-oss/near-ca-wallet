'use strict';

const vm = require('vm');
const { test, assert, fs, path, ROOT_DIR } = require('./helpers.js');

function loadJsxModule(relPath) {
  const esbuild = require('esbuild');
  const preact = require('preact');
  const absPath = path.join(ROOT_DIR, relPath);
  const src = fs.readFileSync(absPath, 'utf8');
  const out = esbuild.transformSync(src, {
    loader: 'jsx',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    format: 'cjs'
  });
  const mod = { exports: {} };
  const fn = vm.runInNewContext(
    `(function(require, module, exports) {\n${out.code}\n})`,
    { console, Date, Number, String, Boolean, Array, Object, Set, Map, Math }
  );
  fn((id) => {
    if (id === 'preact') return preact;
    throw new Error(`Unexpected import "${id}" in ${relPath}`);
  }, mod, mod.exports);
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

test('FW-3.1: TokenHistoryPanel renders loading, empty, partial, and merged history rows', () => {
  const { h } = require('preact');
  const { TokenHistoryPanel } = loadJsxModule('src/app/components/TokenHistoryPanel.jsx');
  assert.equal(typeof TokenHistoryPanel, 'function');

  const loadingText = collectText(h(TokenHistoryPanel, { items: [], loading: true, isEn: true }));
  assert.ok(loadingText.includes('Loading on-chain activity'));

  const emptyZh = collectText(h(TokenHistoryPanel, { items: [], loading: false, isEn: false }));
  assert.ok(emptyZh.includes('暂无该代币链上变动记录'));

  const partialEn = collectText(h(TokenHistoryPanel, {
    items: [{ id: '1', type: 'swap', symbol: 'NEAR', toSymbol: 'USDC', amount: 2.5, chain: 'near', timestamp: Math.floor(Date.now() / 1000) - 120, txHash: '0xabc' }],
    symKey: 'NEAR',
    partialUnavailable: true,
    isEn: true,
    getChainMeta: () => ({ shortName: 'NEAR' })
  }));
  assert.ok(partialEn.includes('Swap NEAR ➔ USDC'));
  assert.ok(partialEn.includes('-2.5 NEAR'));
  assert.ok(partialEn.includes('2m ago · NEAR'));
  assert.ok(partialEn.includes('Confirmed'));
  assert.ok(partialEn.includes('temporarily unavailable'));

  let clicked = null;
  const vnode = h(TokenHistoryPanel, {
    items: [{ id: '2', type: 'receive', symbol: 'SOL', amount: 1.25, chain: 'sol', txHash: 'sig123' }],
    symKey: 'SOL',
    isEn: true,
    onOpenTxDetail: (it, idx) => { clicked = { it, idx }; }
  });
  const btns = findElements(vnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'open-tx-detail');
  assert.equal(btns.length, 1);
  assert.equal(btns[0].props['data-tx-source'], 'token');
  assert.equal(btns[0].props['data-tx-hash'], 'sig123');
  btns[0].props.onClick();
  assert.equal(clicked.idx, 0);
  assert.equal(clicked.it.txHash, 'sig123');
});

test('FW-3.2: ContactsPanel renders empty, copy/delete, and picker modes', () => {
  const { h } = require('preact');
  const { ContactsPanel } = loadJsxModule('src/app/components/ContactsPanel.jsx');
  assert.equal(typeof ContactsPanel, 'function');

  assert.ok(collectText(h(ContactsPanel, { contacts: [], isEn: true })).includes('No saved contacts'));
  assert.ok(collectText(h(ContactsPanel, { contacts: [], isEn: false })).includes('暂无保存地址'));

  const sampleContacts = [
    { id: 'c1', name: 'Alice', address: '0x1234567890abcdef1234567890abcdef12345678', network: 'evm' }
  ];

  const normalVnode = h(ContactsPanel, { contacts: sampleContacts, pickerTarget: null, isEn: true });
  const copyBtns = findElements(normalVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'copy-text');
  const delBtns = findElements(normalVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'delete-contact');
  assert.equal(copyBtns.length, 1);
  assert.equal(copyBtns[0].props['data-val'], sampleContacts[0].address);
  assert.equal(delBtns.length, 1);
  assert.equal(delBtns[0].props['data-id'], 'c1');
  assert.ok(collectText(normalVnode).includes('EVM'));

  const pickerVnode = h(ContactsPanel, { contacts: sampleContacts, pickerTarget: 'send', isEn: false });
  const pickBtns = findElements(pickerVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'pick-contact');
  assert.equal(pickBtns.length, 1);
  assert.equal(pickBtns[0].props['data-addr'], sampleContacts[0].address);
  assert.ok(collectText(pickBtns[0]).includes('选用'));
});

test('FW-3.3: HubToolsPanels exports NearKeysPanel, SolRentPanel, NearStoragePanel with zero jargon', () => {
  const { h } = require('preact');
  const { NearKeysPanel, SolRentPanel, NearStoragePanel } = loadJsxModule('src/app/components/HubToolsPanels.jsx');
  assert.equal(typeof NearKeysPanel, 'function');
  assert.equal(typeof SolRentPanel, 'function');
  assert.equal(typeof NearStoragePanel, 'function');

  // Check zero developer jargon in HubToolsPanels.jsx source
  const hubSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/components/HubToolsPanels.jsx'), 'utf8');
  for (const jargon of ['FullAccess', 'AddKey', 'DeleteKey', 'NEP-141', 'Implicit', 'RPC', 'HTTP']) {
    assert.equal(hubSrc.includes(jargon), false, `HubToolsPanels.jsx must not contain developer jargon "${jargon}"`);
  }

  // NearKeysPanel
  assert.ok(collectText(h(NearKeysPanel, { loading: true, isEn: true })).includes('Loading account keys'));
  assert.ok(collectText(h(NearKeysPanel, { unactivated: true, isEn: true })).includes('not yet activated'));
  const keysVnode = h(NearKeysPanel, {
    keys: [
      { publicKey: 'ed25519:CurrentKey111111111111111111111', isFull: true, isCurrent: true, canDelete: false },
      { publicKey: 'ed25519:OtherAppKey2222222222222222222', isFull: false, isCurrent: false, canDelete: true }
    ],
    busyKey: 'ed25519:OtherAppKey2222222222222222222',
    isEn: true
  });
  const delKeyBtns = findElements(keysVnode, (n) => n.type === 'button' && n.props && n.props['data-action'] === 'delete-near-key');
  assert.equal(delKeyBtns.length, 1);
  assert.equal(delKeyBtns[0].props.disabled, true);
  assert.ok(collectText(keysVnode).includes('Full Key'));
  assert.ok(collectText(keysVnode).includes('In Use'));

  // SolRentPanel
  const solVnode = h(SolRentPanel, {
    accounts: [
      { ataAddress: 'ata_1', symbol: 'BONK', isEmpty: true, isDust: false, uiAmount: 0, usdValue: null, rentSol: 0.002039 }
    ],
    selectedAtas: ['ata_1'],
    isEn: true
  });
  const solChecks = findElements(solVnode, (n) => n.type === 'input' && n.props && n.props['data-action'] === 'toggle-sol-rent');
  assert.equal(solChecks.length, 1);
  assert.equal(solChecks[0].props.checked, true);
  assert.ok(collectText(solVnode).includes('+0.0020 SOL'));

  // NearStoragePanel
  const storageVnode = h(NearStoragePanel, {
    accounts: [
      { contractId: 'wrap.near', symbol: 'wNEAR', isEmpty: true, uiAmount: 0, depositNear: 0.00125 },
      { contractId: 'usdt.tether-token.near', symbol: 'USDt', isEmpty: false, uiAmount: 10, depositNear: 0.00125 }
    ],
    selectedContracts: ['wrap.near'],
    isEn: false
  });
  const storageChecks = findElements(storageVnode, (n) => n.type === 'input' && n.props && n.props['data-action'] === 'toggle-near-storage');
  assert.equal(storageChecks.length, 2);
  assert.equal(storageChecks[0].props.checked, true);
  assert.equal(storageChecks[0].props.disabled, false);
  assert.equal(storageChecks[1].props.checked, false);
  assert.equal(storageChecks[1].props.disabled, true);
});

test('FW-3.4: ui-controller part integrations exist, preserve fallback, and stay under 60KB', () => {
  const checks = [
    ['061-token-detail-ui.part.js', 'mountTokenHistoryPanel'],
    ['220-contacts.part.js', 'mountContactsPanel'],
    ['180-near-keys.part.js', 'mountNearKeysPanel'],
    ['200-solana-rent.part.js', 'mountSolRentPanel'],
    ['210-near-storage.part.js', 'mountNearStoragePanel']
  ];
  for (const [file, fnName] of checks) {
    const fullPath = path.join(ROOT_DIR, 'src/parts/ui-controller', file);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size <= 60 * 1024, `${file} (${stat.size} bytes) must stay <= 60KB`);
    const src = fs.readFileSync(fullPath, 'utf8');
    assert.ok(src.includes(`fw.${fnName}`), `${file} must wire fw.${fnName}`);
  }
});
