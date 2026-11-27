'use strict';

const vm = require('vm');
const { test, assert, fs, path, ROOT_DIR } = require('./helpers');

function walkFiles(dir, ext, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, ext, acc);
    else if (entry.isFile() && full.endsWith(ext)) acc.push(full);
  }
  return acc;
}

test('D1B-01 & D1B-02: __nexusOnBridgeResponse parses JSON primitives/objects safely & parseHexBigInt("0x") === 0n', async () => {
  const src = fs.readFileSync(path.join(ROOT_DIR, 'src/dapp-browser.js'), 'utf8');

  // Extract __nexusOnBridgeResponse from source and test runtime behavior
  const bridgeMatch = src.match(/window\.__nexusOnBridgeResponse = function \(id, result, error\) \{[\s\S]*?\n  \};/);
  assert.ok(bridgeMatch, '__nexusOnBridgeResponse must exist in src/dapp-browser.js');

  const pending = {};
  const win = {};
  const ctx = vm.createContext({ window: win, _pending: pending, Error, JSON });
  vm.runInContext(bridgeMatch[0], ctx);

  const callBridge = (result, error) => new Promise((resolve, reject) => {
    const id = 'req_1';
    pending[id] = { resolve, reject };
    win.__nexusOnBridgeResponse(id, result, error);
  });

  assert.equal(await callBridge('"0x1"'), '0x1');
  assert.equal(await callBridge('true'), true);
  assert.equal(await callBridge('null'), null);
  assert.deepEqual(await callBridge('{"chainId":"0x1","ok":true}'), { chainId: '0x1', ok: true });
  assert.equal(await callBridge('raw-non-json-string'), 'raw-non-json-string');
  await assert.rejects(
    () => callBridge(undefined, '{"code":4001,"message":"User rejected"}'),
    (err) => err && err.code === 4001 && err.message === 'User rejected'
  );

  // Extract parseHexBigInt and verify edge cases including "0x"
  const hexMatch = src.match(/function parseHexBigInt\(val\) \{[\s\S]*?\n  \}/);
  assert.ok(hexMatch, 'parseHexBigInt must exist in src/dapp-browser.js');
  const hexCtx = vm.createContext({ BigInt, String });
  vm.runInContext(hexMatch[0], hexCtx);
  assert.equal(hexCtx.parseHexBigInt('0x'), 0n);
  assert.equal(hexCtx.parseHexBigInt('0X'), 0n);
  assert.equal(hexCtx.parseHexBigInt(''), 0n);
  assert.equal(hexCtx.parseHexBigInt(null), 0n);
  assert.equal(hexCtx.parseHexBigInt('0x10'), 16n);
});

test('D1A-01/02/03: Stage-2 balance sync, fail-closed follow-up swap & EVM approval allowance re-check', () => {
  const followupSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/parts/ui-controller/131-swap-orders-followup.part.js'),
    'utf8'
  );
  assert.ok(
    followupSrc.includes('st.syncWalletCompatBalances(wallet)'),
    '131-swap-orders-followup must sync wallet compat balances'
  );
  assert.ok(
    followupSrc.includes('if (deltaLamports <= 0n && expectedLamports <= 0n)'),
    'SOL follow-up swap must fail closed when deltaLamports <= 0n && expectedLamports <= 0n'
  );
  assert.ok(
    followupSrc.includes('if (deltaWei <= 0n && expectedWei <= 0n)'),
    'EVM follow-up swap must fail closed when deltaWei <= 0n && expectedWei <= 0n'
  );

  const evmSrc = fs.readFileSync(
    path.join(ROOT_DIR, 'src/parts/chain-contracts/070-evm.part.js'),
    'utf8'
  );
  assert.ok(
    evmSrc.includes('erc20.allowance('),
    '070-evm must re-check ERC-20 allowance after approval receipt/timeout'
  );
  assert.ok(
    evmSrc.includes('Approval allowance not yet confirmed; please retry'),
    '070-evm must throw explicit error when approval allowance is not yet confirmed'
  );
});

test('D2-01/02: Zero kebab-case SVG presentation attributes across src/app/**/*.jsx', () => {
  const jsxFiles = walkFiles(path.join(ROOT_DIR, 'src/app'), '.jsx');
  assert.ok(jsxFiles.length > 0, 'Expected JSX files under src/app');
  const kebabAttrs = [
    'stop-color=',
    'stop-opacity=',
    'stroke-width=',
    'stroke-linecap=',
    'stroke-linejoin=',
    'fill-opacity=',
    'fill-rule=',
    'clip-rule=',
    'text-anchor='
  ];
  for (const file of jsxFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT_DIR, file);
    for (const attr of kebabAttrs) {
      assert.equal(content.includes(attr), false, `${rel} must not contain kebab-case SVG attribute ${attr}`);
    }
  }
});

test('D3-01..04: No dead api.kitwallet.app calls and OpenOcean disabled by default', () => {
  const srcFiles = [
    ...walkFiles(path.join(ROOT_DIR, 'src/parts'), '.js'),
    ...walkFiles(path.join(ROOT_DIR, 'src/app'), '.jsx'),
    path.join(ROOT_DIR, 'src/dapp-browser.js')
  ];
  for (const file of srcFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(
      content.includes('api.kitwallet.app'),
      false,
      `${path.relative(ROOT_DIR, file)} must not reference dead api.kitwallet.app`
    );
  }

  const evmCfg = fs.readFileSync(
    path.join(ROOT_DIR, 'src/parts/chain-contracts/000-config-evm-chains.part.js'),
    'utf8'
  );
  const openOceanMatches = evmCfg.match(/openOcean\s*:\s*[^,\n]+/g) || [];
  assert.ok(openOceanMatches.length > 0, 'Expected openOcean config entries in 000-config-evm-chains.part.js');
  for (const m of openOceanMatches) {
    assert.match(m, /openOcean\s*:\s*null/, `OpenOcean must be disabled by default (null), got: ${m}`);
  }
});

test('D4-01..05: Preact reactivity hooks, mountSwapHistory loop guard & PerpOrderbookSidePanel row keys', () => {
  const shellSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/views/AppShellViews.jsx'), 'utf8');
  const headerFn = shellSrc.slice(shellSrc.indexOf('export function AppHeader()'), shellSrc.indexOf('export function OnboardingAndWalletViews()'));
  assert.ok(headerFn.includes('useI18n()'), 'AppHeader must use useI18n()');
  assert.ok(headerFn.includes('useActiveWallet()'), 'AppHeader must use useActiveWallet()');

  const navFn = shellSrc.slice(shellSrc.indexOf('export function BottomNav()'));
  assert.ok(navFn.includes('useI18n()'), 'BottomNav must use useI18n()');
  assert.ok(navFn.includes("useWalletState(['wallet', 'nav'])"), 'BottomNav must subscribe to wallet & nav topics');

  const mainSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/main.jsx'), 'utf8');
  const mountSwapFn = mainSrc.slice(mainSrc.indexOf('export function mountSwapHistory('), mainSrc.indexOf('export function mountAssetList('));
  assert.equal(
    mountSwapFn.includes("notifyFrameworkState('swap')"),
    false,
    'mountSwapHistory must not call notifyFrameworkState("swap") to avoid render loops'
  );

  const obSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/components/PerpOrderbookAndPositions.jsx'), 'utf8');
  const obSideFn = obSrc.slice(obSrc.indexOf('export function PerpOrderbookSidePanel('), obSrc.indexOf('export function PerpBottomListPanel('));
  assert.ok(obSideFn.includes('key={idx}'), 'PerpOrderbookSidePanel rows must be keyed by fixed slot idx for 60fps DOM reuse');
});

test('Wave 3 Live-Fix: #app-root width rule in style.css and /solana-rpc proxy in server.js', () => {
  const cssSrc = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.match(cssSrc, /#app-root\s*\{[^}]*width:\s*100%/, 'style.css must define #app-root width: 100%');
  assert.ok(cssSrc.includes('.nav-item:focus:not(:focus-visible)'), 'style.css must suppress non-keyboard nav focus ring');

  const serverSrc = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  assert.ok(serverSrc.includes("reqPathname === '/solana-rpc'"), 'server.js must expose /solana-rpc proxy route');
  assert.ok(serverSrc.includes('api.mainnet-beta.solana.com'), 'server.js /solana-rpc must forward to api.mainnet-beta.solana.com');
});

test('Wave 4: 100% single-tree reactive Preact PanelSlot architecture', () => {
  const storeSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/store/useWalletStore.js'), 'utf8');
  assert.ok(storeSrc.includes('export function registerPanelSlot('), 'useWalletStore must export registerPanelSlot');
  assert.ok(storeSrc.includes('export function isPanelSlotRegistered('), 'useWalletStore must export isPanelSlotRegistered');
  assert.ok(storeSrc.includes('export function setPanelProps('), 'useWalletStore must export setPanelProps');
  assert.ok(storeSrc.includes('export function clearPanelProps('), 'useWalletStore must export clearPanelProps');
  assert.ok(storeSrc.includes('export function usePanelProps('), 'useWalletStore must export usePanelProps');

  const panelSlotSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/components/PanelSlot.jsx'), 'utf8');
  assert.ok(panelSlotSrc.includes('export function PanelSlot('), 'PanelSlot.jsx must export PanelSlot');
  assert.ok(panelSlotSrc.includes('usePanelProps(slotId)'), 'PanelSlot must subscribe via usePanelProps(slotId)');

  const viewFiles = fs.readdirSync(path.join(ROOT_DIR, 'src/app/views'))
    .filter((f) => f.endsWith('.jsx') && f !== 'TradingViews.jsx')
    .map((f) => path.join(ROOT_DIR, 'src/app/views', f));
  const sheetFiles = fs.readdirSync(path.join(ROOT_DIR, 'src/app/sheets'))
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => path.join(ROOT_DIR, 'src/app/sheets', f));

  for (const filePath of [...viewFiles, ...sheetFiles]) {
    const src = fs.readFileSync(filePath, 'utf8');
    const usesHooks = /\b(useI18n|useLang|useWalletState|usePanelProps)\b/.test(src);
    assert.ok(usesHooks, `${path.basename(filePath)} must use Preact Hooks (useLang/useWalletState/usePanelProps)`);
  }

  const allAppSrc = [...viewFiles, ...sheetFiles]
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n');
  for (const slotId of [
    'earn-my-positions-list',
    'home-unified-asset-list',
    'swap-history-list',
    'perp-overview-list',
    'perp-bottom-list',
    'sol-rent-list',
    'sheet-tx-flow',
    'toast-host'
  ]) {
    assert.ok(
      allAppSrc.includes(`slotId="${slotId}"`) && allAppSrc.includes('<PanelSlot'),
      `PanelSlot for "${slotId}" must be wired in src/app/`
    );
  }
  const perpsViewSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/app/views/PerpsView.jsx'), 'utf8');
  assert.ok(
    perpsViewSrc.includes('id="perp-ob-asks"') && perpsViewSrc.includes('id="perp-ob-bids"'),
    'PerpsView must retain 120Hz #perp-ob-asks and #perp-ob-bids containers'
  );
  assert.equal(
    perpsViewSrc.includes('slotId="perp-ob-asks"') || perpsViewSrc.includes('slotId="perp-ob-bids"'),
    false,
    'Dead PanelSlot wrappers inside #perp-ob-asks / #perp-ob-bids must stay removed'
  );
});
