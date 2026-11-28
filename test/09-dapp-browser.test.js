'use strict';

const vm = require('node:vm');
const {
  test,
  assert,
  fs,
  path,
  nodeCrypto,
  ROOT_DIR,
  cryptoEngine,
  tokenRegistry,
  chainContracts,
  hlPerps,
  miningPro,
  state,
  dappBrowser,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  withMockedStorage,
  createMockClassList,
  createMockDomElement
} = require('./helpers.js');

const ethersLib = require('../ethers.umd.min.js');

test('v6.24 UI & UX Fixes: global sheet scroll lock, keyboard-safe picker/perp height, and Earn sheet modal', () => {
  const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  const earnHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'views', 'EarnView.jsx'), 'utf8');
  const sheetsHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'sheets', 'ToolsAndChainSheets.jsx'), 'utf8');

  assert.ok(styleCss.includes('body.sheet-scroll-locked'), 'style.css must lock body scroll when sheets open');
  assert.ok(styleCss.includes('#sheet-token-picker.open'), 'style.css must enforce tall height on token picker');
  assert.ok(styleCss.includes('#sheet-perp-markets.open'), 'style.css must enforce tall height on perp markets');
  assert.equal(earnHtml.includes('max-height: 44vh'), false, 'Earn pools list must not have inner 44vh scroll box');
  assert.equal(earnHtml.includes('id="earn-amount-in"'), false, 'Earn staking form should live inside bottom sheet, not below list');
  assert.ok(sheetsHtml.includes('id="sheet-earn-stake"'), '080-sheets must include #sheet-earn-stake modal');
  assert.ok(sheetsHtml.includes('id="earn-amount-in"'), '#sheet-earn-stake must contain staking inputs');

  const prevDoc = globalThis.document;
  const bodyClassList = createMockClassList([]);
  const htmlClassList = createMockClassList([]);
  const backdropEl = createMockDomElement('sheet-backdrop');
  const pickerSheet = createMockDomElement('sheet-token-picker', { attributes: {} });
  const earnSheet = createMockDomElement('sheet-earn-stake', { attributes: {} });
  const domMap = new Map([
    ['sheet-backdrop', backdropEl],
    ['sheet-token-picker', pickerSheet],
    ['sheet-earn-stake', earnSheet]
  ]);
  globalThis.document = {
    body: { classList: bodyClassList },
    documentElement: { classList: htmlClassList, style: { setProperty() {} } },
    getElementById: (id) => domMap.get(id) || null,
    querySelectorAll: (sel) => {
      if (sel === '.bottom-sheet.open') {
        return [pickerSheet, earnSheet].filter((el) => el.classList.contains('open'));
      }
      return [];
    }
  };
  try {
    uiController.openSheet('sheet-token-picker');
    assert.equal(bodyClassList.contains('sheet-scroll-locked'), true, 'opening sheet locks background scroll');
    assert.equal(pickerSheet.classList.contains('open'), true);

    uiController.selectStakingPool('rhea-x');
    assert.equal(earnSheet.classList.contains('open'), true, 'selecting staking pool opens #sheet-earn-stake');
    assert.equal(pickerSheet.classList.contains('open'), false);
    assert.equal(bodyClassList.contains('sheet-scroll-locked'), true);

    uiController.closeAllSheets();
    assert.equal(earnSheet.classList.contains('open'), false);
    assert.equal(bodyClassList.contains('sheet-scroll-locked'), false, 'closing all sheets unlocks scroll');
  } finally {
    globalThis.document = prevDoc;
  }
});

test('v6.24 UI & UX Fixes: kPEPE/kBONK/kSHIB perp icon normalization preserves kHYPE & collapsible TP/SL', () => {
  const kpepeIcon = tokenRegistry.resolveTokenIcon({ symbol: 'kPEPE', blockchain: 'arb' });
  assert.ok(
    kpepeIcon.primaryUrl && (kpepeIcon.primaryUrl.startsWith('assets/icons/') || kpepeIcon.primaryUrl.startsWith('https://')) && !kpepeIcon.primaryUrl.includes('mitte.gg'),
    `kPEPE should resolve valid non-mitte PEPE icon, got ${kpepeIcon.primaryUrl}`
  );
  assert.equal(kpepeIcon.primaryUrl, tokenRegistry.resolveTokenIcon({ symbol: 'PEPE' }).primaryUrl);

  const kbonkIcon = tokenRegistry.resolveTokenIcon({ symbol: 'kBONK' });
  assert.equal(kbonkIcon.primaryUrl, tokenRegistry.resolveTokenIcon({ symbol: 'BONK' }).primaryUrl);

  const khypeIcon = tokenRegistry.resolveTokenIcon({ symbol: 'kHYPE', blockchain: 'hype' });
  assert.notEqual(khypeIcon.primaryUrl, tokenRegistry.resolveTokenIcon({ symbol: 'HYPE', blockchain: 'hype' }).primaryUrl, 'kHYPE must retain its dedicated icon');

  const perpHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'views', 'PerpsView.jsx'), 'utf8');
  assert.ok(perpHtml.includes('id="perp-tpsl-drawer"'), 'Perp TP/SL container must exist in PerpsView');
  assert.ok(perpHtml.includes('id="perp-tp-input"') && perpHtml.includes('id="perp-sl-input"'), 'Perp TP/SL inputs must be rendered inline');
  assert.ok(perpHtml.includes('perp-okx-stats-strip'), 'Perp metadata must use compact OKX stats strip');
  assert.equal(uiController.togglePerpTpSl, undefined, 'Dead togglePerpTpSl function must remain removed');
});

test('v6.24 UI & UX Fixes: Token Picker pinned bar [All,NEAR,SOL,ETH,HOOD,ARC] + single temporary active chain + More Networks', async () => {
  const prevDoc = globalThis.document;
  const chainBar = createMockDomElement('token-picker-chains');
  const moreEl = createMockDomElement('token-picker-more-chains', { classes: ['hidden'] });
  const listEl = createMockDomElement('token-picker-list');
  const favEl = createMockDomElement('token-picker-favorites', { classes: ['hidden'] });
  const domMap = new Map([
    ['token-picker-chains', chainBar],
    ['token-picker-more-chains', moreEl],
    ['token-picker-list', listEl],
    ['token-picker-favorites', favEl]
  ]);
  globalThis.document = {
    getElementById: (id) => domMap.get(id) || null,
    querySelectorAll: () => []
  };

  try {
    state.swap.pickerSide = 'from';
    state.swap.pickerChainFilter = 'all';
    state.swap.pickerShowMoreChains = false;
    state.limit.pickerSide = null;
    uiController.renderTokenPickerList();

    for (const c of ['all', 'near', 'sol', 'eth', 'hood', 'arc']) {
      assert.ok(chainBar.innerHTML.includes(`data-chain="${c}"`), `Pinned chain bar missing ${c}`);
    }
    assert.ok(chainBar.innerHTML.includes('data-action="toggle-picker-more-chains"'), 'Missing More Networks button');
    assert.equal(chainBar.innerHTML.includes('data-chain="hype"'), false, 'hype should not appear before selection');
    assert.equal(moreEl.classList.contains('hidden'), true);

    uiController.toggleTokenPickerMoreChains();
    assert.equal(moreEl.classList.contains('hidden'), false, 'More Networks grid must expand');
    assert.ok(moreEl.innerHTML.includes('data-chain="hype"'), 'HYPE must appear inside More Networks grid');

    await withMockedStorage({}, () => {
      uiController.setTokenPickerChain('hype');
    });
    assert.ok(chainBar.innerHTML.includes('data-chain="hype"'), 'HYPE must temporarily appear in chain bar when selected');
    assert.equal(moreEl.classList.contains('hidden'), true, 'Selecting a chain collapses More Networks grid');

    await withMockedStorage({}, () => {
      uiController.setTokenPickerChain('prl');
    });
    assert.equal(chainBar.innerHTML.includes('data-chain="hype"'), false, 'Previous temporary chain HYPE must disappear when selecting PRL');
    assert.ok(chainBar.innerHTML.includes('data-chain="prl"'), 'PRL must replace HYPE in temporary slot');
  } finally {
    state.swap.pickerChainFilter = 'all';
    state.swap.pickerShowMoreChains = false;
    globalThis.document = prevDoc;
  }
});

test('v6.24 UI & UX Fixes: NEAR account sheet hides registration card & blocks duplicate registration; Mining Pro isolates on-chain transfers', async () => {
  const prevDoc = globalThis.document;
  const regCard = createMockDomElement('hub-near-domain-card');
  const toastEl = createMockDomElement('toast');
  const payoutsTitle = createMockDomElement('mining-payouts-title');
  const payoutsList = createMockDomElement('mining-payouts-list');
  const payoutsAll = createMockDomElement('mining-payouts-all-btn', { classes: ['hidden'] });
  const domMap = new Map([
    ['hub-near-domain-card', regCard],
    ['toast', toastEl],
    ['mining-payouts-title', payoutsTitle],
    ['mining-payouts-list', payoutsList],
    ['mining-payouts-all-btn', payoutsAll]
  ]);
  globalThis.document = {
    getElementById: (id) => domMap.get(id) || null,
    querySelectorAll: () => []
  };

  const prevWallets = state.wallets;
  const prevActive = state.activeWalletId;
  try {
    await withMockedStorage({}, async () => {
      state.wallets = [{
        id: 'w_named',
        name: 'Named',
        nearAddress: 'a'.repeat(64),
        nearNamedAccount: 'alice.near',
        solAddress: '',
        evmAddress: ''
      }];
      state.activeWalletId = 'w_named';
      uiController.renderNearAccountSummary(state.getActiveWallet());
      assert.equal(regCard.classList.contains('hidden'), true, '.near wallet must hide registration card');

      await uiController.registerNearDomainFromHub();
      assert.ok(toastEl.textContent.includes('alice.near'), 'duplicate registration must be blocked with toast');

      state.wallets[0].nearNamedAccount = null;
      uiController.renderNearAccountSummary(state.getActiveWallet());
      assert.equal(regCard.classList.contains('hidden'), false, 'implicit wallet without .near must show registration card');

      const mockOnChain = {
        onChainBalancePrl: 10,
        totalReceivedPrl: 1,
        incomingTxs: [{ txid: 'regular_transfer_1', amountPrl: 1, timestamp: '2026-11-20T14:14:00Z', status: 'confirmed' }]
      };
      const autoNoPool = miningPro.buildUnifiedMinerTelemetry('prl1test', null, mockOnChain, 'auto');
      assert.equal(autoNoPool.poolSource, 'none');
      assert.equal(autoNoPool.totalPaidPrl, null, 'Auto mode must NOT report regular incoming transfers as paid pool balance');
      assert.deepEqual(autoNoPool.payoutHistory, [], 'Auto mode must NOT show incoming transfers as pool payouts');

      const onChainExplicit = miningPro.buildUnifiedMinerTelemetry('prl1test', null, mockOnChain, 'onchain');
      assert.equal(onChainExplicit.poolSource, 'onchain');
      assert.equal(onChainExplicit.totalPaidPrl, 1);
      assert.equal(onChainExplicit.payoutHistory.length, 1);

      state.mining.poolKey = 'onchain';
      state.mining.telemetry = onChainExplicit;
      uiController.renderMiningTelemetry();
      assert.ok(payoutsTitle.textContent.includes('链上转入') || payoutsTitle.textContent.includes('On-Chain'));
      assert.equal(payoutsList.innerHTML.includes('矿池打款'), false);
    });
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActive;
    state.mining.poolKey = 'auto';
    state.mining.telemetry = null;
    globalThis.document = prevDoc;
  }
});

test('v6.24 DApp Browser: URL sanitization rejects dangerous schemes & allows valid HTTPS/localhost URLs', () => {
  assert.equal(dappBrowser.sanitizeDAppUrl('https://app.uniswap.org/swap'), 'https://app.uniswap.org/swap');
  assert.equal(dappBrowser.sanitizeDAppUrl('jup.ag'), 'https://jup.ag/');
  assert.equal(dappBrowser.sanitizeDAppUrl('localhost:3000/test'), 'http://localhost:3000/test');
  assert.equal(dappBrowser.sanitizeDAppUrl('http://127.0.0.1:8545'), 'http://127.0.0.1:8545/');

  for (const bad of [
    '',
    '   ',
    'javascript:alert(1)',
    'DATA:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'vbscript:msgbox(1)',
    'blob:https://example.com/123',
    'about:blank',
    'http://phishing.example.com',
    'https://user:pass@evil.example.com'
  ]) {
    assert.equal(dappBrowser.sanitizeDAppUrl(bad), null, `Unsafe URL must be rejected: ${bad}`);
  }
  assert.ok(Array.isArray(dappBrowser.DAPP_CATALOG) && dappBrowser.DAPP_CATALOG.length >= 10);
  assert.ok(dappBrowser.DAPP_CATALOG.every((d) => dappBrowser.sanitizeDAppUrl(d.url)));
});

test('v6.24 DApp Browser: injected provider script idempotency, EIP-6963 discovery, EVM/Solana/NEAR API & RPC bridge', async () => {
  const derived = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const evmSigner = ethersLib.Wallet.fromPhrase(TEST_MNEMONIC);
  const wallet = {
    id: 'w_dapp',
    name: 'DApp Test',
    mnemonic: TEST_MNEMONIC,
    ...derived,
    evmPrivateKey: evmSigner.privateKey,
    evmAddress: evmSigner.address,
    solPrivateSeedHex: derived.nearPrivateSeedHex
  };
  await chainContracts.ensureWalletSigningKeysAsync(wallet);

  const injected = dappBrowser.buildInjectedProviderScript({
    evmAddress: wallet.evmAddress,
    chainIdHex: '0x1',
    solanaPublicKey: wallet.solAddress,
    nearAccountId: 'alice.near',
    nearPublicKey: wallet.nearPublicKey
  });

  const dispatchedEvents = [];
  const docListeners = new Map();
  const winObj = {
    location: { origin: 'https://app.uniswap.org', href: 'https://app.uniswap.org/swap' },
    addEventListener(ev, fn) {
      if (!docListeners.has(ev)) docListeners.set(ev, []);
      docListeners.get(ev).push(fn);
    },
    dispatchEvent(ev) {
      dispatchedEvents.push(ev);
      for (const fn of (docListeners.get(ev.type) || [])) fn(ev);
      return true;
    },
    __NEXUS_TEST_BRIDGE__: {
      postMessage(serialized) {
        const msg = JSON.parse(serialized);
        setImmediate(() => {
          if (msg.method === 'eth_chainId') {
            winObj.__nexusOnBridgeResponse(msg.id, '0x1', null);
          } else if (msg.method === 'wallet_switchEthereumChain') {
            winObj.__nexusOnBridgeResponse(msg.id, null, null);
          } else {
            winObj.__nexusOnBridgeResponse(msg.id, null, { code: 4001, message: 'User rejected' });
          }
        });
      }
    }
  };

  function MockCustomEvent(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }

  const navObj = { wallets: [] };
  const ctx = vm.createContext({
    window: winObj,
    navigator: navObj,
    document: { title: 'Uniswap Interface' },
    CustomEvent: MockCustomEvent,
    TextEncoder,
    Uint8Array,
    Buffer,
    Promise,
    JSON,
    Object,
    String,
    Number,
    Array,
    Error,
    parseInt,
    setImmediate
  });
  ctx.self = ctx.window;

  vm.runInContext(injected, ctx);
  const firstEth = winObj.ethereum;
  // Re-run injection script to assert strict idempotency
  vm.runInContext(injected, ctx);
  assert.equal(winObj.ethereum, firstEth, 'Provider script must be strictly idempotent');
  assert.equal(winObj.ethereum.isMetaMask, true);
  assert.equal(winObj.ethereum.isNexusWallet, true);
  assert.equal(winObj.solana.isPhantom, true);
  assert.equal(winObj.solana.isNexusWallet, true);
  assert.equal(winObj.solana.publicKey.toBase58(), wallet.solAddress);
  assert.equal(winObj.near.isNexusWallet, true);
  assert.equal(winObj.near.accountId, 'alice.near');

  const eip6963Events = dispatchedEvents.filter((e) => e.type === 'eip6963:announceProvider');
  assert.equal(eip6963Events.length, 1);
  assert.equal(eip6963Events[0].detail.info.rdns, 'io.nexus.wallet');
  assert.equal(eip6963Events[0].detail.provider, winObj.ethereum);

  // Trigger eip6963:requestProvider
  winObj.dispatchEvent(new MockCustomEvent('eip6963:requestProvider'));
  assert.equal(dispatchedEvents.filter((e) => e.type === 'eip6963:announceProvider').length, 2);

  // Check Solana Wallet Standard registration callback
  assert.equal(navObj.wallets.length, 1);
  let registeredStdWallet = null;
  navObj.wallets[0]({ register: (w) => { registeredStdWallet = w; } });
  assert.equal(registeredStdWallet.name, 'Nexus Wallet');

  // Bridge round-trip & chainChanged event
  const cid = await winObj.ethereum.request({ method: 'eth_chainId' });
  assert.equal(cid, '0x1');
  let switchedTo = null;
  winObj.ethereum.on('chainChanged', (next) => { switchedTo = next; });
  await winObj.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
  assert.equal(winObj.ethereum.chainId, '0x2105');
  assert.equal(switchedTo, '0x2105');

  // Test handleDAppRpcRequest: read-only passthrough, 4902 unknown chain, 4001 rejection, personal_sign verification, Solana/NEAR signMessage
  const rpcCalls = [];
  const mockContracts = {
    ...chainContracts,
    async callEvmRpc(chainKey, payload) {
      rpcCalls.push({ chainKey, payload });
      return '0x1234ab';
    }
  };

  let activeChain = 'eth';
  const blockHex = await dappBrowser.handleDAppRpcRequest(
    { id: '1', namespace: 'evm', method: 'eth_blockNumber', params: [], origin: 'https://app.uniswap.org' },
    { wallet, contracts: mockContracts, crypto: cryptoEngine, ethers: ethersLib, activeEvmChainKey: activeChain }
  );
  assert.equal(blockHex, '0x1234ab');
  assert.equal(rpcCalls[0].chainKey, 'eth');

  // Switch to Base (8453 -> 0x2105)
  await dappBrowser.handleDAppRpcRequest(
    { id: '2', namespace: 'evm', method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] },
    { wallet, contracts: mockContracts, setEvmChain: (k) => { activeChain = k; } }
  );
  assert.equal(activeChain, 'base');

  // Unknown chain triggers 4902
  await assert.rejects(
    dappBrowser.handleDAppRpcRequest(
      { id: '3', namespace: 'evm', method: 'wallet_switchEthereumChain', params: [{ chainId: '0xdeadbeef' }] },
      { wallet, contracts: mockContracts }
    ),
    (err) => err && err.code === 4902
  );

  // User rejection triggers 4001
  await assert.rejects(
    dappBrowser.handleDAppRpcRequest(
      { id: '4', namespace: 'evm', method: 'personal_sign', params: ['0x48656c6c6f', wallet.evmAddress] },
      { wallet, contracts: mockContracts, ethers: ethersLib, requestApprovalAsync: async () => false }
    ),
    (err) => err && err.code === 4001
  );

  // personal_sign verified against wallet.evmAddress
  const messageText = 'Sign in to Uniswap via Nexus Wallet';
  const sig = await dappBrowser.handleDAppRpcRequest(
    { id: '5', namespace: 'evm', method: 'personal_sign', params: [ethersLib.hexlify(ethersLib.toUtf8Bytes(messageText)), wallet.evmAddress] },
    {
      wallet,
      contracts: mockContracts,
      crypto: cryptoEngine,
      ethers: ethersLib,
      requestApprovalAsync: async () => true,
      verifyAuthAsync: async () => true
    }
  );
  assert.equal(ethersLib.verifyMessage(messageText, sig).toLowerCase(), wallet.evmAddress.toLowerCase());

  // Solana signMessage
  const solSigRes = await dappBrowser.handleDAppRpcRequest(
    {
      id: '6',
      namespace: 'solana',
      method: 'signMessage',
      params: [{ messageBase64: cryptoEngine.bytesToBase64(new TextEncoder().encode('Hello Solana')) }]
    },
    { wallet, contracts: mockContracts, crypto: cryptoEngine, requestApprovalAsync: async () => true }
  );
  assert.equal(solSigRes.publicKey, wallet.solAddress);
  assert.equal(cryptoEngine.base64ToBytes(solSigRes.signatureBase64).length, 64);

  // NEAR NEP-413 signMessage (must return NEP-413 accountId + 64-byte base64 signature)
  const namedWallet = { ...wallet, nearNamedAccount: 'zhic49280.near' };
  const nearSigRes = await dappBrowser.handleDAppRpcRequest(
    {
      id: '7',
      namespace: 'near',
      method: 'signMessage',
      params: [{ message: 'Sign in NEAR', recipient: 'app.rhea.finance', nonce: cryptoEngine.bytesToBase64(new Uint8Array(32).fill(7)) }]
    },
    { wallet: namedWallet, contracts: mockContracts, crypto: cryptoEngine, requestApprovalAsync: async () => true }
  );
  assert.equal(nearSigRes.accountId, 'zhic49280.near');
  assert.equal(nearSigRes.publicKey, wallet.nearPublicKey);
  assert.equal(cryptoEngine.base64ToBytes(nearSigRes.signature).length, 64);
  assert.ok(nearSigRes.signatureBase58 && nearSigRes.signatureBase58.startsWith('ed25519:'));

  const nearSigArrayNonceRes = await dappBrowser.handleDAppRpcRequest(
    {
      id: '8',
      namespace: 'near',
      method: 'signMessage',
      params: [{ message: 'Sign in near.com', recipient: 'near.com', nonce: Array.from({ length: 32 }, (_, i) => i + 1), state: 'login-state-1' }]
    },
    { wallet: namedWallet, contracts: mockContracts, crypto: cryptoEngine, requestApprovalAsync: async () => true }
  );
  assert.equal(nearSigArrayNonceRes.accountId, 'zhic49280.near');
  assert.equal(nearSigArrayNonceRes.state, 'login-state-1');
  assert.equal(cryptoEngine.base64ToBytes(nearSigArrayNonceRes.signature).length, 64);
});

test('v6.24 DApp Browser: Native iOS/Android plugin registration, CI workflows, and zero inline HTML events in ui-controller', () => {
  const iosPlugin = fs.readFileSync(path.join(ROOT_DIR, 'ios', 'App', 'App', 'NativeDAppBrowserPlugin.swift'), 'utf8');
  const mainVc = fs.readFileSync(path.join(ROOT_DIR, 'ios', 'App', 'App', 'MainViewController.swift'), 'utf8');
  const androidPlugin = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'io', 'nexus', 'wallet', 'NativeDAppBrowserPlugin.java'), 'utf8');
  const mainAct = fs.readFileSync(path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'java', 'io', 'nexus', 'wallet', 'MainActivity.java'), 'utf8');
  const iosYml = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'build-ios-ipa.yml'), 'utf8');
  const androidYml = fs.readFileSync(path.join(ROOT_DIR, '.github', 'workflows', 'build-android-apk.yml'), 'utf8');

  assert.ok(iosPlugin.includes('class NativeDAppBrowserPlugin'));
  assert.ok(mainVc.includes('registerPluginInstance(NativeDAppBrowserPlugin())'));
  assert.ok(androidPlugin.includes('@CapacitorPlugin(name = "NativeDAppBrowser")'));
  assert.ok(mainAct.includes('registerPlugin(NativeDAppBrowserPlugin.class)'));
  assert.ok(iosYml.includes('NativeDAppBrowserPlugin.swift'));
  assert.ok(androidYml.includes('NativeDAppBrowserPlugin.java'));
});


test('v6.25 Token & Perp Icons + Sheet Scroll Lock Fix: zero dead mitte.gg URLs, HIP-3 stocks & prefix normalization', () => {
  const iconMapVals = Object.values(tokenRegistry.TOKEN_ICON_MAP || {});
  assert.equal(
    iconMapVals.some((u) => typeof u === 'string' && u.includes('mitte.gg')),
    false,
    'TOKEN_ICON_MAP must not contain dead image.mitte.gg URLs'
  );

  assert.equal(tokenRegistry.normalizePerpBaseSymbol('xyz:CRCL'), 'CRCL');
  assert.equal(tokenRegistry.normalizePerpBaseSymbol('io:PEARL'), 'PRL');
  assert.equal(tokenRegistry.normalizePerpBaseSymbol('kPEPE-USDC'), 'PEPE');
  assert.notEqual(
    tokenRegistry.resolveTokenIcon({ symbol: 'kHYPE', blockchain: 'hype' }).primaryUrl,
    tokenRegistry.resolveTokenIcon({ symbol: 'HYPE', blockchain: 'hype' }).primaryUrl
  );

  for (const sym of ['PEPE', 'kPEPE', 'SHIB', 'xyz:CRCL', 'CRCL', 'NVDA', 'TSLA']) {
    const res = tokenRegistry.resolveTokenIcon({ symbol: sym, blockchain: sym.includes(':') ? 'eth' : 'hype' });
    assert.ok(
      res && res.primaryUrl && (res.primaryUrl.startsWith('assets/icons/') || res.primaryUrl.startsWith('https://')),
      `${sym} should resolve a valid bundled or HTTPS icon`
    );
    assert.equal(res.primaryUrl.includes('mitte.gg'), false, `${sym} icon must not use dead mitte.gg host`);
  }
  const pearlPerpIcon = tokenRegistry.resolveTokenIcon({ symbol: 'io:PEARL', blockchain: 'eth' });
  assert.equal(pearlPerpIcon.isPearlSvg, true, 'io:PEARL should resolve built-in Pearl SVG');

  const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  const lockBlockMatch = styleCss.match(/body\.sheet-scroll-locked\s*\{[^}]*\}/);
  assert.ok(lockBlockMatch, 'sheet-scroll-locked CSS block must exist');
  assert.equal(lockBlockMatch[0].includes('touch-action: none'), false, 'sheet-scroll-locked must not freeze touch-action scrolling');
});

test('v6.25 Hyperliquid HIP-3 Markets, -USDC Pairs, Real Fees, Post-Only (Alo), TP/SL Edit & Reverse Position', async () => {
  assert.equal(hlPerps.formatPerpPairName('BTC'), 'BTC-USDC');
  assert.equal(hlPerps.formatPerpPairName('xyz:CRCL'), 'CRCL-USDC');
  assert.equal(hlPerps.extractPerpDexTag('xyz:CRCL'), 'xyz');

  await withMockedFetch(async (_url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    if (body.type === 'perpDexs') {
      return jsonResponse([null, { name: 'xyz', fullName: 'Trade.xyz' }]);
    }
    if (body.type === 'metaAndAssetCtxs' && body.dex === 'xyz') {
      return jsonResponse([
        { universe: [{ name: 'xyz:CRCL', szDecimals: 2, maxLeverage: 10, onlyIsolated: true }] },
        [{ markPx: '50.10', midPx: '50.10', prevDayPx: '48.90', funding: '0.000077', openInterest: '100000', dayNtlVlm: '8347634' }]
      ]);
    }
    if (body.type === 'metaAndAssetCtxs') {
      return jsonResponse([
        { universe: [{ name: 'BTC', szDecimals: 5, maxLeverage: 40 }] },
        [{ markPx: '60900', midPx: '60900', prevDayPx: '60000', funding: '0.000012', openInterest: '50000', dayNtlVlm: '2950000000' }]
      ]);
    }
    if (body.type === 'clearinghouseState' && body.dex === 'xyz') {
      return jsonResponse({
        assetPositions: [{
          position: {
            coin: 'xyz:CRCL',
            szi: '1',
            entryPx: '67.50',
            positionValue: '50.10',
            unrealizedPnl: '-17.40',
            returnOnEquity: '-2.538',
            liquidationPx: '21.53',
            marginUsed: '5.06',
            leverage: { value: 10, type: 'isolated' }
          }
        }]
      });
    }
    if (body.type === 'clearinghouseState') {
      return jsonResponse({
        marginSummary: { accountValue: '250.00', totalMarginUsed: '5.06', totalNtlPos: '50.10' },
        withdrawable: '244.94',
        assetPositions: []
      });
    }
    if (body.type === 'spotClearinghouseState') {
      return jsonResponse({ balances: [{ coin: 'USDC', total: '12.50', hold: '0' }] });
    }
    if (body.type === 'frontendOpenOrders' && body.dex === 'xyz') {
      return jsonResponse([
        { coin: 'xyz:CRCL', oid: 7001, orderType: 'Take Profit Market', isTrigger: true, triggerPx: '80.0' },
        { coin: 'xyz:CRCL', oid: 7002, orderType: 'Stop Market', isTrigger: true, triggerPx: '25.0' }
      ]);
    }
    if (body.type === 'frontendOpenOrders' || body.type === 'openOrders' || body.type === 'userFills') {
      return jsonResponse([]);
    }
    if (body.type === 'userFees') {
      return jsonResponse({ userCrossRate: '0.00045', userAddRate: '0.00015' });
    }
    return jsonResponse({});
  }, async () => {
    const mkts = await hlPerps.fetchHlMarkets();
    const crcl = mkts.find((m) => m.name === 'xyz:CRCL');
    assert.ok(crcl, 'xyz:CRCL HIP-3 market must be discovered');
    assert.equal(crcl.index, 110000, 'HIP-3 dexIdx=1 idx=0 asset index must equal 100000 + 1*10000 + 0');
    assert.equal(crcl.pairLabel, 'CRCL-USDC');
    assert.equal(crcl.baseSymbol, 'CRCL');
    assert.equal(crcl.dex, 'xyz');
    assert.equal(crcl.category, 'stocks');
    assert.ok(Math.abs(crcl.priceChange24h - 1.2) < 1e-6);

    const acct = await hlPerps.fetchHlAccountState('0x1111111111111111111111111111111111111111');
    assert.equal(acct.makerFeeRate, 0.00015);
    assert.equal(acct.takerFeeRate, 0.00045);
    assert.equal(acct.spotUsdc, 12.5);
    const crclPos = acct.positions.find((p) => p.coin === 'xyz:CRCL');
    assert.ok(crclPos, 'HIP-3 xyz:CRCL position must be merged into positions');
    assert.equal(crclPos.tpTriggerPx, 80);
    assert.equal(crclPos.slTriggerPx, 25);
  });

  const derived = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const evmSigner = ethersLib.Wallet.fromPhrase(TEST_MNEMONIC);
  const wallet = {
    id: 'w_hl_test',
    name: 'HL Test',
    mnemonic: TEST_MNEMONIC,
    ...derived,
    evmPrivateKey: evmSigner.privateKey,
    evmAddress: evmSigner.address
  };
  const prevEthers = globalThis.ethers;
  globalThis.ethers = ethersLib;
  const postedActions = [];
  try {
    await withMockedFetch(async (url, opts) => {
      if (String(url).includes('/exchange')) {
        const payload = JSON.parse(opts.body);
        postedActions.push(payload.action);
        return jsonResponse({ status: 'ok', response: { type: 'order', data: { statuses: [{ resting: { oid: 999 } }] } } });
      }
      return jsonResponse({});
    }, async () => {
      const crclMkt = { index: 110000, name: 'xyz:CRCL', szDecimals: 2, maxLeverage: 10, onlyIsolated: true, markPx: 50.1 };
      await hlPerps.placeHlPerpOrder({
        wallet,
        market: crclMkt,
        isBuy: true,
        size: 1,
        orderType: 'post_only',
        limitPrice: 49.5,
        reduceOnly: true
      });
      const postOnlyAct = postedActions.find((a) => a.type === 'order');
      assert.ok(postOnlyAct, 'post_only order must be posted');
      assert.equal(postOnlyAct.orders[0].a, 110000);
      assert.equal(postOnlyAct.orders[0].r, true);
      assert.deepEqual(postOnlyAct.orders[0].t, { limit: { tif: 'Alo' } });

      postedActions.length = 0;
      await hlPerps.updateHlPositionTpSl({
        wallet,
        market: crclMkt,
        position: { coin: 'xyz:CRCL', isLong: true, absSize: 2 },
        tpPrice: 75,
        slPrice: 30,
        openOrders: [{ coin: 'xyz:CRCL', oid: 7001, isTrigger: true, orderType: 'Take Profit Market' }]
      });
      const cancelAct = postedActions.find((a) => a.type === 'cancel');
      const tpslAct = postedActions.find((a) => a.type === 'order' && a.grouping === 'positionTpsl');
      assert.ok(cancelAct && cancelAct.cancels[0].o === 7001, 'old TP/SL trigger order must be cancelled first');
      assert.ok(tpslAct && tpslAct.orders.length === 2, 'TP & SL positionTpsl orders must be submitted');
      assert.equal(tpslAct.orders[0].t.trigger.tpsl, 'tp');
      assert.equal(tpslAct.orders[1].t.trigger.tpsl, 'sl');

      postedActions.length = 0;
      await hlPerps.reverseHlPositionMarket({
        wallet,
        market: crclMkt,
        position: { coin: 'xyz:CRCL', isLong: true, absSize: 2, leverageValue: 5, leverageType: 'isolated' }
      });
      const revOrderAct = postedActions.find((a) => a.type === 'order');
      assert.ok(revOrderAct, 'reverse position must place opposite order');
      assert.equal(revOrderAct.orders[0].b, false, 'reversing Long must submit Sell');
      assert.equal(Number(revOrderAct.orders[0].s), 4, 'reversing 2 contracts must submit 2x size = 4');
    });
  } finally {
    globalThis.ethers = prevEthers;
  }
});

test('v6.25 Two-Stage Perp Overview, Search+Sort Filter Fix, Real Maker/Taker Fee Preview & -USDC UI', () => {
  const prevDoc = globalThis.document;
  const prevPerp = { ...state.perp };
  const domIds = [
    'perp-overview-panel', 'perp-trade-panel', 'perp-overview-positions-wrap',
    'perp-overview-list', 'perp-overview-search', 'perp-sort-ind-vol',
    'perp-sort-ind-px', 'perp-sort-ind-chg', 'perp-market-search',
    'perp-market-list', 'perp-coin-icon', 'perp-coin-name', 'perp-mark-px',
    'perp-change-24h', 'perp-funding-rate', 'perp-vol-24h', 'perp-oi-val',
    'perp-ob-asks', 'perp-ob-bids', 'perp-ob-mid-badge', 'perp-ob-bid-sz-hdr',
    'perp-ob-bid-summary', 'perp-ob-ask-summary', 'perp-ob-bid-bar',
    'perp-ob-ask-bar', 'perp-ls-ratio-wrap', 'perp-bottom-list',
    'perp-meta-notional', 'perp-meta-size', 'perp-meta-liq', 'perp-meta-fee',
    'perp-error-banner', 'btn-perp-submit', 'perp-limit-price-row'
  ];
  const domMap = new Map(domIds.map((id) => [id, createMockDomElement(id)]));
  globalThis.document = {
    getElementById: (id) => domMap.get(id) || null,
    querySelectorAll: () => []
  };

  try {
    state.perp.markets = [
      { index: 0, name: 'BTC', baseSymbol: 'BTC', pairLabel: 'BTC-USDC', dex: '', category: 'crypto', szDecimals: 4, maxLeverage: 40, markPx: 60000, prevDayPx: 59000, priceChange24h: 1000, change24hPct: 1.69, dayNtlVlm: 2_500_000_000 },
      { index: 1, name: 'ETH', baseSymbol: 'ETH', pairLabel: 'ETH-USDC', dex: '', category: 'crypto', szDecimals: 3, maxLeverage: 25, markPx: 3000, prevDayPx: 2800, priceChange24h: 200, change24hPct: 7.14, dayNtlVlm: 1_200_000_000 },
      { index: 110000, name: 'xyz:CRCL', baseSymbol: 'CRCL', pairLabel: 'CRCL-USDC', dex: 'xyz', category: 'stocks', szDecimals: 2, maxLeverage: 10, onlyIsolated: true, markPx: 50, prevDayPx: 48, priceChange24h: 2, change24hPct: 4.17, dayNtlVlm: 8_300_000 }
    ];
    state.perp.account = { availableMargin: 500, equity: 500, accountValue: 500, makerFeeRate: 0.00015, takerFeeRate: 0.00045, positions: [], openOrders: [], fills: [] };

    const crclMarket = state.perp.markets[2];
    const takerEval = uiController.evaluatePerpOrderState({
      market: crclMarket,
      account: state.perp.account,
      orderType: 'market',
      leverage: 10,
      marginInput: '100'
    });
    assert.equal(takerEval.disabled, false);
    assert.ok(Math.abs(takerEval.estFeeUsd - 0.45) < 1e-6, 'Market taker fee = $1000 * 0.00045 = $0.45');
    assert.ok(takerEval.text.includes('CRCL-USDC'), `Button text should show CRCL-USDC, got ${takerEval.text}`);

    const makerEval = uiController.evaluatePerpOrderState({
      market: crclMarket,
      account: state.perp.account,
      orderType: 'post_only',
      limitPriceInput: '50',
      leverage: 10,
      marginInput: '100'
    });
    assert.ok(Math.abs(makerEval.estFeeUsd - 0.15) < 1e-6, 'Post-Only maker fee = $1000 * 0.00015 = $0.15');

    // Market search + gainers sort MUST both apply even when query is non-empty!
    domMap.get('perp-market-search').value = 'C';
    state.perp.marketFilter = 'gainers';
    uiController.renderPerpMarketsSheet();
    const sheetHtml = domMap.get('perp-market-list').innerHTML;
    assert.ok(sheetHtml.includes('CRCL-USDC') && sheetHtml.includes('BTC-USDC'));
    assert.equal(sheetHtml.includes('-PERP'), false, 'Market sheet must use -USDC naming, never -PERP');
    assert.ok(sheetHtml.indexOf('CRCL-USDC') < sheetHtml.indexOf('BTC-USDC'), 'gainers filter must sort CRCL (+4.17%) ahead of BTC (+1.69%) even with search="C"');

    state.perp.marketFilter = 'stocks';
    domMap.get('perp-market-search').value = '';
    uiController.renderPerpMarketsSheet();
    const stocksHtml = domMap.get('perp-market-list').innerHTML;
    assert.ok(stocksHtml.includes('CRCL-USDC') && !stocksHtml.includes('BTC-USDC'));

    uiController.openPerpTradeScreen('xyz:CRCL');
    assert.equal(state.perp.subView, 'trade');
    assert.equal(state.perp.selectedCoin, 'xyz:CRCL');
    assert.equal(domMap.get('perp-trade-panel').classList.contains('hidden'), false);
    assert.equal(domMap.get('perp-overview-panel').classList.contains('hidden'), true);

    uiController.backToPerpOverview();
    assert.equal(state.perp.subView, 'overview');
    assert.equal(domMap.get('perp-overview-panel').classList.contains('hidden'), false);
  } finally {
    Object.assign(state.perp, prevPerp);
    globalThis.document = prevDoc;
  }
});

test('v6.25->v6.29 Unified Pure-External Gas Model: exact input matches quote/broadcast and exposes maxSpendable fix', async () => {
  assert.equal(uiController.floorToDecimals(15.7791468, 6), 15.779146);

  const prlBuf = Number(chainContracts.DEFAULT_GAS_BUFFERS.prl || 0);
  const partialPrl = uiController.resolveNativeFeeDeductPlan({ chain: 'prl', amount: 10, avail: 12, isNative: true, decimals: 8 });
  assert.equal(partialPrl.mode, 'extra');
  assert.equal(partialPrl.effectiveAmount, 10);

  const fullPrlExact = uiController.resolveNativeFeeDeductPlan({ chain: 'prl', amount: 12, avail: 12, isNative: true, decimals: 8 });
  assert.equal(fullPrlExact.mode, 'insufficient_gas');
  assert.ok(fullPrlExact.maxSpendable > 0 && fullPrlExact.maxSpendable <= 12 - prlBuf);

  const fullPrlFloored = uiController.resolveNativeFeeDeductPlan({ chain: 'prl', amount: 15.779146, avail: 15.7791468, isNative: true, decimals: 8 });
  assert.equal(fullPrlFloored.mode, 'insufficient_gas');
  assert.equal(fullPrlFloored.maxSpendableStr, '15.7761468');

  const exactMaxPrl = uiController.resolveNativeFeeDeductPlan({
    chain: 'prl',
    amount: fullPrlFloored.maxSpendable,
    avail: 15.7791468,
    isNative: true,
    decimals: 8
  });
  assert.equal(exactMaxPrl.mode, 'extra');
  assert.equal(exactMaxPrl.effectiveAmount, 15.7761468);

  const solShortfall = uiController.resolveNativeFeeDeductPlan({ chain: 'sol', amount: 0.002, avail: 0.0025, isNative: true, decimals: 9 });
  assert.equal(solShortfall.mode, 'insufficient_gas');

  const derived = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const prlWallet = {
    id: 'w_prl_fee_test',
    name: 'PRL Gas Plan',
    mnemonic: TEST_MNEMONIC,
    ...derived,
    nativeBalances: { prl: 15.7791468, near: 2, sol: 0.0025 },
    erc20Balances: {},
    splBalances: {},
    nearFtBalances: {},
    intentsBalances: {}
  };
  const prlToken = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PRL' && t.blockchain === 'prl')
    || { assetId: 'prl-native', symbol: 'PRL', blockchain: 'prl', decimals: 8, isNative: true };
  const solToken = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'SOL' && t.blockchain === 'sol')
    || { assetId: 'nep141:sol.omft.near', symbol: 'SOL', blockchain: 'sol', decimals: 9, isNative: true };
  const usdcNear = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'USDC' && t.blockchain === 'near')
    || { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', symbol: 'USDC', blockchain: 'near', decimals: 6 };

  const btnFullPrl = uiController.evaluateSwapButtonState({
    wallet: prlWallet,
    fromToken: prlToken,
    toToken: usdcNear,
    amountIn: '15.779146'
  });
  assert.equal(btnFullPrl.disabled, true, 'Entering raw full balance must trigger gentle insufficient_gas fix rather than hidden internal deduction');
  assert.equal(btnFullPrl.reason, 'insufficient_gas');
  assert.equal(btnFullPrl.maxSpendableStr, '15.7761468');

  const btnExactMaxPrl = uiController.evaluateSwapButtonState({
    wallet: prlWallet,
    fromToken: prlToken,
    toToken: usdcNear,
    amountIn: btnFullPrl.maxSpendableStr
  });
  assert.equal(btnExactMaxPrl.disabled, false);
  assert.equal(btnExactMaxPrl.reason, 'ready');

  const btnSolShortfall = uiController.evaluateSwapButtonState({
    wallet: prlWallet,
    fromToken: solToken,
    toToken: usdcNear,
    amountIn: '0.002498'
  });
  assert.equal(btnSolShortfall.disabled, true);
  assert.equal(btnSolShortfall.reason, 'insufficient_gas');
  assert.equal(btnSolShortfall.maxSpendableStr, '0.002495');
});

test('v6.26 OKX Default-On K-Line Chart, Full HIP-3 Icon Resolution & Scrollability Fixes', () => {
  assert.equal(state.perp.showChart, true, 'K-line chart must be enabled by default');
  const perpHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'views', 'PerpsView.jsx'), 'utf8');
  assert.equal(/id="perp-chart-wrap"[^>]*\bhidden\b/.test(perpHtml), false, '#perp-chart-wrap must not start hidden');
  assert.ok(perpHtml.includes("'1d'") && perpHtml.includes('data-iv={iv}'), 'Interval pills must include 1d');

  const now = Date.now();
  const series = Array.from({ length: 28 }, (_, i) => {
    const base = 100 + Math.sin(i / 3) * 6 + i * 0.4;
    return {
      t: now - (28 - i) * 900_000,
      o: base - 0.8,
      h: base + 1.9,
      l: base - 1.7,
      c: base + 0.6,
      v: 1000 + i * 120
    };
  });
  const okxSvg = uiController.renderPerpCandleSvg(series, { markPx: 112.4 });
  assert.ok(okxSvg.includes('MA5:') && okxSvg.includes('MA10:') && okxSvg.includes('MA20:'), 'K-line SVG must display MA5/MA10/MA20 legend');
  assert.ok(okxSvg.includes('stroke="#f59e0b"') && okxSvg.includes('stroke="#38bdf8"') && okxSvg.includes('stroke="#c084fc"'), 'K-line SVG must draw MA5/10/20 polylines');
  assert.ok(okxSvg.includes('←') || okxSvg.includes('→'), 'K-line SVG must render High/Low callout pins');
  assert.ok(okxSvg.includes('stroke="#00ec97"'), 'K-line SVG must preserve live mark price dashed line');

  for (const sym of [
    'xyz:SP500', 'xyz:SKHX', 'xyz:SOXL', 'xyz:MU', 'xyz:CL',
    'xyz:BRENTOIL', 'xyz:SILVER', 'xyz:ANT', 'io:OAI', 'para:TOTAL2',
    'xyz:QCOM', 'xyz:AVGO', 'xyz:UNKNOWN'
  ]) {
    const icon = tokenRegistry.resolveTokenIcon({ symbol: sym, blockchain: 'hype' });
    assert.ok(
      icon.primaryUrl && (icon.primaryUrl.startsWith('assets/icons/') || icon.primaryUrl.startsWith('https://')),
      `${sym} should resolve a valid bundled or HTTPS icon`
    );
    assert.equal(icon.primaryUrl.includes('cryptocurrency-icons'), false, `${sym} must not resolve dead spothq crypto icon URL`);
    if (icon.fallbackUrl) {
      assert.equal(icon.fallbackUrl.includes('cryptocurrency-icons'), false, `${sym} fallback must not use dead spothq URL`);
    }
  }

  const unknFallback = tokenRegistry.getFallbackTokenIconSvg('xyz:UNKNOWN', 'hype', 32);
  assert.ok(unknFallback.includes('>UNKN<'), `Expected UNKN fallback badge, got ${unknFallback}`);
  assert.equal(unknFallback.includes('XYZ:'), false, 'Fallback badge must strip dex prefix');

  const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.ok(styleCss.includes('overflow-x: clip;'), 'body must use overflow-x: clip so Chromium does not create a secondary scroll blocker');
});

test('v6.27 Local Bundled Icons, Multi-Target Sync Verification, Perp SWR Snapshot Cache & Server/SW Config', async () => {
  // 1. sanitizeImageUrl accepts bundled local assets/icons/* & rejects traversal / html
  assert.equal(tokenRegistry.sanitizeImageUrl('assets/icons/BTC.png'), 'assets/icons/BTC.png');
  assert.equal(tokenRegistry.sanitizeImageUrl('assets/icons/../sw.js'), '');
  assert.equal(tokenRegistry.sanitizeImageUrl('assets/icons/evil.html'), '');

  // 2. LOCAL_TOKEN_ICON_MAP coverage, valid image headers, and SHA-256 sync across root/dist/android/ios
  const localMap = tokenRegistry.LOCAL_TOKEN_ICON_MAP || {};
  const entries = Object.entries(localMap);
  assert.ok(entries.length >= 120, `Expected >= 120 bundled local icon entries, got ${entries.length}`);

  const checkedFiles = new Set();
  const targets = [
    path.join(ROOT_DIR, 'dist'),
    path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public'),
    path.join(ROOT_DIR, 'ios', 'App', 'App', 'public')
  ];
  for (const [sym, relPath] of entries) {
    assert.ok(relPath.startsWith('assets/icons/'), `Invalid relPath for ${sym}: ${relPath}`);
    if (checkedFiles.has(relPath)) continue;
    checkedFiles.add(relPath);
    const rootFile = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(rootFile), `Missing bundled icon file: ${relPath}`);
    const buf = fs.readFileSync(rootFile);
    assert.ok(buf.length >= 60, `Icon too small: ${relPath}`);
    const headText = buf.subarray(0, 128).toString('utf8').toLowerCase();
    assert.equal(headText.includes('<!doctype html') || headText.includes('<html'), false, `Icon ${relPath} must not be HTML`);
    const rootHash = nodeCrypto.createHash('sha256').update(buf).digest('hex');
    for (const dir of targets) {
      const targetFile = path.join(dir, relPath);
      assert.ok(fs.existsSync(targetFile), `Missing synced icon ${targetFile}`);
      const targetHash = nodeCrypto.createHash('sha256').update(fs.readFileSync(targetFile)).digest('hex');
      assert.equal(targetHash, rootHash, `Checksum mismatch for synced icon ${targetFile}`);
    }
  }

  // 3. resolveTokenIcon prioritizes bundled local assets while preserving inline data URIs and explicit custom URLs
  for (const sym of ['BTC', 'SOL', 'PEPE', 'kPEPE', 'xyz:SP500', 'xyz:SKHX', 'xyz:CRCL', 'NVDA', 'QTC', 'PONS']) {
    const res = tokenRegistry.resolveTokenIcon({ symbol: sym, blockchain: sym === 'SOL' ? 'sol' : (sym === 'QTC' ? 'qtc' : 'hype') });
    assert.ok(res.primaryUrl.startsWith('assets/icons/'), `${sym} must resolve to bundled assets/icons/*, got ${res.primaryUrl}`);
  }
  for (const sym of ['NEAR', 'ETH', 'USDC', 'RHEA', 'KHYPE']) {
    const res = tokenRegistry.resolveTokenIcon({ symbol: sym, blockchain: sym === 'KHYPE' ? 'hype' : 'near' });
    assert.ok(res.primaryUrl.startsWith('data:image/'), `${sym} must keep zero-latency inline data URI, got ${res.primaryUrl}`);
  }
  const customSol = tokenRegistry.resolveTokenIcon({
    symbol: 'SOL',
    blockchain: 'sol',
    logoURI: 'https://example.com/custom-sol.png'
  });
  assert.equal(customSol.primaryUrl, 'https://example.com/custom-sol.png', 'Explicit custom logoURI must take precedence');

  // 4. Perp SWR Snapshot Cache: persists markets, address-scoped account, candles, orderbook
  const prevPerp = { ...state.perp };
  try {
    await withMockedStorage({}, async () => {
      const sampleMkts = [
        { index: 0, name: 'BTC', baseSymbol: 'BTC', pairLabel: 'BTC-USDC', dex: '', category: 'crypto', szDecimals: 4, maxLeverage: 40, markPx: 62000, prevDayPx: 60000, priceChange24h: 2000, change24hPct: 3.33, dayNtlVlm: 3_000_000_000 }
      ];
      const addrA = '0x1111111111111111111111111111111111111111';
      const addrB = '0x2222222222222222222222222222222222222222';
      const sampleAcctA = { user: addrA, accountValue: 123.45, availableMargin: 100.25, positions: [{ coin: 'BTC', isLong: true, absSize: 0.01 }], openOrders: [], fills: [] };
      const sampleCandles = [
        { t: 1700000000000, o: 61000, h: 62500, l: 60500, c: 62000, v: 500 },
        { t: 1700000900000, o: 62000, h: 62200, l: 61800, c: 62100, v: 300 }
      ];
      const sampleOb = { bids: [{ px: '62090', sz: '1.0', n: 1 }], asks: [{ px: '62100', sz: '1.2', n: 1 }] };

      const saved = state.saveCachedPerpSnapshot({
        markets: sampleMkts,
        account: sampleAcctA,
        accountAddr: addrA,
        candles: sampleCandles,
        candleCoin: 'BTC',
        candleInterval: '15m',
        orderbook: sampleOb,
        orderbookCoin: 'BTC'
      });
      assert.equal(saved, true);

      state.perp.markets = [];
      state.perp.account = null;
      state.perp.candles = [];
      state.perp.orderbook = null;
      state.perp.selectedCoin = 'BTC';
      state.perp.chartInterval = '15m';

      state.loadCachedPerpSnapshot(addrA);
      assert.equal(state.perp.markets.length, 1);
      assert.equal(state.perp.markets[0].name, 'BTC');
      assert.equal(state.perp.account.accountValue, 123.45);
      assert.equal(state.perp.account.positions.length, 1);
      assert.equal(state.perp.candles.length, 2);
      assert.equal(state.perp.orderbook.bids[0].px, '62090');

      // Address isolation check: Wallet B must not inherit Wallet A positions/equity
      state.perp.account = null;
      state.loadCachedPerpSnapshot(addrB);
      assert.equal(state.perp.account, null, 'Wallet B must not load Wallet A perp account snapshot');

      assert.equal(state.getCachedPerpCandles('BTC', '15m').length, 2);
      assert.equal(state.getCachedPerpCandles('ETH', '15m'), null);
    });
  } finally {
    Object.assign(state.perp, prevPerp);
  }

  // 5. server.js MIME types & sw.js cache rule for .webp / .jpg
  const serverJs = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  const swJs = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  assert.ok(serverJs.includes("'.webp': 'image/webp'"), 'server.js must serve image/webp');
  assert.ok(serverJs.includes("'.jpg': 'image/jpeg'"), 'server.js must serve image/jpeg');
  assert.ok(swJs.includes('webp|jpe?g'), 'sw.js must cache bundled webp/jpg icons');
  const swVerMatch = swJs.match(/nexus-wallet-v6\.(\d+)/);
  assert.ok(swVerMatch && Number(swVerMatch[1]) >= 27, 'sw.js cache version must be >= v6.27');
});

test('v6.28 Perp Order Ticket Cleanup: remove redundant 0 Gas row while keeping Arbitrum ETH gas check', () => {
  const perpHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'views', 'PerpsView.jsx'), 'utf8');
  for (const id of ['perp-meta-notional', 'perp-meta-size', 'perp-meta-liq', 'perp-meta-fee']) {
    assert.ok(perpHtml.includes(id), `Perp order ticket must retain ${id}`);
  }
  for (const removed of ['perp.gasLabel', 'perp.gasZeroVal', '0 Gas', 'perp-meta-cell-full']) {
    assert.ok(!perpHtml.includes(removed), `Perp order ticket must omit ${removed}`);
  }

  const sheetsHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'sheets', 'ToolsAndChainSheets.jsx'), 'utf8');
  assert.ok(sheetsHtml.includes('perp-arb-usdc-avail'), 'Arbitrum deposit sheet must keep perp-arb-usdc-avail');
  assert.ok(sheetsHtml.includes('perp-arb-error'), 'Arbitrum deposit sheet must keep perp-arb-error');
  assert.ok(sheetsHtml.includes('perp.arbMinVal'), 'Arbitrum deposit sheet must keep perp.arbMinVal');
  assert.equal(sheetsHtml.includes('perp-arb-eth-avail'), false, 'Arbitrum deposit sheet must omit redundant perp-arb-eth-avail row');
  assert.equal(sheetsHtml.includes('perp.arbEthBalLabel'), false, 'Arbitrum deposit sheet must omit perp.arbEthBalLabel');
  assert.equal(sheetsHtml.includes('perp.arbBridgeNotice'), false, 'Arbitrum deposit sheet must omit yellow perp.arbBridgeNotice box');

  const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.ok(!styleCss.includes('.perp-meta-cell-full'), 'style.css must remove unused .perp-meta-cell-full rule');

  const swJs = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  const swVer28 = swJs.match(/nexus-wallet-v6\.(\d+)/);
  assert.ok(swVer28 && Number(swVer28[1]) >= 28, 'sw.js cache version must be >= v6.28');
});

test('v6.29 Full-Precision MAX, Live Gas Estimator, Auto-Fix Banners & Home Dust Folding', async () => {
  // 1. Full-precision decimal formatting (no 6-decimal dust truncation)
  assert.equal(uiController.formatMaxDecimalString(15.7791468, 8), '15.7791468');
  assert.equal(uiController.formatMaxDecimalString(0.00000042, 8), '0.00000042');
  assert.equal(uiController.formatMaxDecimalString(0.5, 18, '500000000000000001'), '0.500000000000000001');

  // 2. Exact zero-dust native spendable sweeps (BigInt exact subtraction)
  const solSweep = uiController.computeExactMaxSpendable({
    balance: 0.5,
    decimals: 9,
    isNative: true,
    gasReserve: 0.000005,
    exactFeeBaseUnits: '5000'
  });
  assert.equal(solSweep.maxAmountStr, '0.499995');

  const btcSweep = uiController.computeExactMaxSpendable({
    balance: 0.001,
    rawBaseUnits: '100000',
    decimals: 8,
    isNative: true,
    gasReserve: 0.0000018,
    exactFeeBaseUnits: '180'
  });
  assert.equal(btcSweep.maxAmountStr, '0.0009982');

  const evmSweep = uiController.computeExactMaxSpendable({
    balance: 1,
    rawBaseUnits: '1000000000000000000',
    decimals: 18,
    isNative: true,
    gasReserve: 0.000021,
    exactFeeBaseUnits: '21000000000000'
  });
  assert.equal(evmSweep.maxAmountStr, '0.999979');

  // 3. Live Gas Estimator (SOL, EVM, BTC, PRL + offline fallback)
  const derived = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const testWallet = state.normalizeWalletRecord({
    id: 'w_v629_gas',
    name: 'v629 Gas Wallet',
    mnemonic: TEST_MNEMONIC,
    ...derived,
    nativeBalances: { near: 5, sol: 0.5, eth: 1, base: 0.1, prl: 12, btc: 0.005 },
    erc20Balances: {},
    splBalances: {},
    nearNep141Balances: {},
    intentsBalances: {}
  });

  const solTransferGas = await chainContracts.estimateLiveNativeGasAsync({ wallet: testWallet, chain: 'sol', kind: 'transfer' });
  assert.equal(solTransferGas.isLive, true);
  assert.equal(solTransferGas.gasReserve, 0.000005);
  assert.equal(solTransferGas.exactFeeBaseUnits, '5000');

  const solDexGas = await chainContracts.estimateLiveNativeGasAsync({ wallet: testWallet, chain: 'sol', kind: 'dex_swap' });
  if (solDexGas.isLive) {
    assert.ok(solDexGas.gasReserve >= 0.0001 && solDexGas.gasReserve <= 0.003, `Live SOL dex_swap reserve out of bounds: ${solDexGas.gasReserve}`);
    assert.ok(Number(solDexGas.exactFeeBaseUnits) >= 100000 && Number(solDexGas.exactFeeBaseUnits) <= 3000000);
  } else {
    assert.equal(solDexGas.gasReserve, 0.0015);
  }

  await withMockedFetch(async (url, opts) => {
    const bodyStr = opts && opts.body ? String(opts.body) : '';
    if (bodyStr.includes('getRecentPrioritizationFees')) {
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: [{ prioritizationFee: 100000 }, { prioritizationFee: 200000 }, { prioritizationFee: 300000 }] });
    }
    if (bodyStr.includes('getTokenAccountsByOwner')) {
      return jsonResponse({ jsonrpc: '2.0', id: 2, result: { value: [{ pubkey: 'ExistingAta1111111111111111111111111111111' }] } });
    }
    throw new Error('Unexpected URL in SOL mock: ' + url);
  }, async () => {
    const solDexLive = await chainContracts.estimateLiveNativeGasAsync({
      wallet: testWallet,
      chain: 'sol',
      kind: 'dex_swap',
      toToken: { blockchain: 'sol', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' }
    });
    assert.equal(solDexLive.isLive, true);
    assert.ok(solDexLive.gasReserve >= 0.0001 && solDexLive.gasReserve <= 0.003);
    assert.equal(solDexLive.meta.medianPriorityFee, 200000);
    assert.equal(solDexLive.meta.isNewSolAta, false);
  });

  await withMockedFetch(async () => { throw new Error('sol rpc down'); }, async () => {
    const solDexOffline = await chainContracts.estimateLiveNativeGasAsync({ wallet: testWallet, chain: 'sol', kind: 'dex_swap' });
    assert.equal(solDexOffline.isLive, false);
    assert.equal(solDexOffline.gasReserve, 0.0015);
  });

  await withMockedFetch(async (url, opts) => {
    const bodyStr = opts && opts.body ? String(opts.body) : '';
    if (bodyStr.includes('eth_gasPrice')) {
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x3b9aca00' }); // 1 gwei
    }
    if (bodyStr.includes('eth_getBalance')) {
      return jsonResponse({ jsonrpc: '2.0', id: 2, result: '0xde0b6b3a7640000' }); // 1 ETH
    }
    if (bodyStr.includes('eth_estimateGas')) {
      return jsonResponse({ jsonrpc: '2.0', id: 3, result: '0x5208' }); // 21000
    }
    if (url.includes('mempool.space/api/v1/fees/recommended')) {
      return jsonResponse({ fastestFee: 5, halfHourFee: 3 });
    }
    if (url.includes('/utxo')) {
      return jsonResponse([{ txid: 'a'.repeat(64), vout: 0, value: 500000, confirmations: 120 }]);
    }
    if (url.includes('/estimatefee/2')) {
      return jsonResponse({ result: '0.002' });
    }
    throw new Error('Unexpected URL in mock: ' + url);
  }, async () => {
    const ethGas = await chainContracts.estimateLiveNativeGasAsync({ wallet: testWallet, chain: 'eth', kind: 'transfer' });
    assert.equal(ethGas.isLive, true);
    assert.ok(ethGas.gasReserve > 0 && ethGas.gasReserve < chainContracts.DEFAULT_GAS_BUFFERS.eth);
    assert.equal(ethGas.liveBalanceBaseUnits, '1000000000000000000');
    assert.ok(ethGas.meta.gasPriceWei && ethGas.meta.gasLimit === '21000');

    const btcGas = await chainContracts.estimateLiveNativeGasAsync({ wallet: testWallet, chain: 'btc', kind: 'transfer' });
    assert.equal(btcGas.isLive, true);
    assert.equal(btcGas.meta.feeRateSatVb, 3);
    assert.equal(btcGas.exactFeeBaseUnits, String((12 + 58 + 43) * 3));
    assert.equal(btcGas.liveBalanceBaseUnits, '500000');

    const prlGas = await chainContracts.estimateLiveNativeGasAsync({ wallet: testWallet, chain: 'prl', kind: 'transfer' });
    assert.equal(prlGas.isLive, true);
    assert.equal(prlGas.meta.feePerKbPrl, 0.002);
    assert.equal(prlGas.liveBalanceBaseUnits, '500000');
  });

  // Fallback on RPC error
  await withMockedFetch(async () => { throw new Error('network down'); }, async () => {
    const fbEth = await chainContracts.estimateLiveNativeGasAsync({ wallet: testWallet, chain: 'eth', kind: 'transfer' });
    assert.equal(fbEth.isLive, false);
    assert.equal(fbEth.gasReserve, chainContracts.DEFAULT_GAS_BUFFERS.eth);
  });

  // 4. Home Dust Folding (< $0.05) + Core Symbol & Unknown-Price Protection
  const fakeGroups = [
    { symbolKey: 'NEAR', symbol: 'NEAR', totalBalance: 0, totalUsd: 0, price: 2, primaryToken: { blockchain: 'near' }, entries: [{ blockchain: 'near', assetId: 'nep141:wrap.near', balance: 0, token: { symbol: 'NEAR', blockchain: 'near' } }] },
    { symbolKey: 'ETH', symbol: 'ETH', totalBalance: 0.00001, totalUsd: 0.02, price: 2000, primaryToken: { blockchain: 'eth' }, entries: [{ blockchain: 'eth', assetId: 'nep141:eth.omft.near', balance: 0.00001, token: { symbol: 'ETH', blockchain: 'eth' } }] },
    { symbolKey: 'USDC', symbol: 'USDC', totalBalance: 10, totalUsd: 10, price: 1, primaryToken: { blockchain: 'near' }, entries: [] },
    { symbolKey: 'BONK', symbol: 'BONK', totalBalance: 1000, totalUsd: 0.02, price: 0.00002, primaryToken: { blockchain: 'sol' }, entries: [] },
    { symbolKey: 'UNKNOWN', symbol: 'UNKNOWN', totalBalance: 5, totalUsd: null, price: null, primaryToken: { blockchain: 'near' }, entries: [] }
  ];
  const part = uiController.partitionDustAssetGroups(fakeGroups, 0.05);
  assert.deepEqual(part.mainGroups.map((g) => g.symbolKey), ['NEAR', 'ETH', 'USDC', 'UNKNOWN']);
  assert.deepEqual(part.dustGroups.map((g) => g.symbolKey), ['BONK']);
  assert.ok(Math.abs(part.dustTotalUsd - 0.02) < 1e-12);

  // Full renderUnifiedAssetList toggle check
  const prevWallets = state.wallets;
  const prevActiveId = state.activeWalletId;
  const prevDust = state.showDustAssets;
  const prevLiveTokens = state.liveTokens;
  const prevDoc = globalThis.document;
  try {
    const dustWallet = state.normalizeWalletRecord({
      id: 'w_dust_render',
      name: 'Dust Render',
      mnemonic: TEST_MNEMONIC,
      ...derived,
      nativeBalances: { near: 0, prl: 0, sol: 0, eth: 0, bsc: 0, btc: 0 },
      splBalances: { DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: 1000 }, // BONK
      nearNep141Balances: {},
      erc20Balances: {}
    });
    state.wallets = [dustWallet];
    state.activeWalletId = dustWallet.id;
    state.showDustAssets = false;
    state.liveTokens = [{ symbol: 'BONK', blockchain: 'sol', contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', price: 0.00002 }];
    const homeListEl = createMockDomElement('home-unified-asset-list');
    const heroUsdEl = createMockDomElement('hero-total-usd');
    globalThis.document = {
      documentElement: { lang: 'zh-CN' },
      getElementById: (id) => (id === 'home-unified-asset-list' ? homeListEl : (id === 'hero-total-usd' ? heroUsdEl : null)),
      querySelectorAll: () => []
    };

    uiController.renderUnifiedAssetList();
    assert.ok(homeListEl.innerHTML.includes('dust-drawer-toggle'), 'Small < $0.05 non-core balance must fold into dust drawer');
    assert.ok(!homeListEl.innerHTML.includes('data-symbol="BONK"'), 'Collapsed dust drawer must hide BONK card initially');
    assert.equal(heroUsdEl.textContent, '$0.02', 'Portfolio USD total must still include folded dust');

    uiController.toggleHomeDustAssets();
    assert.equal(state.showDustAssets, true);
    assert.ok(homeListEl.innerHTML.includes('data-symbol="BONK"'), 'Expanding dust drawer must reveal BONK card');
  } finally {
    state.wallets = prevWallets;
    state.activeWalletId = prevActiveId;
    state.showDustAssets = prevDust;
    state.liveTokens = prevLiveTokens;
    globalThis.document = prevDoc;
  }

  // 5. HTML Gas-Fix Banners, Zero Inline Events in ui-controller & SW v6.29
  const swapHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'views', 'SwapLimitView.jsx'), 'utf8');
  const sendHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'app', 'sheets', 'CoreSheets.jsx'), 'utf8');
  assert.ok(swapHtml.includes('id="swap-gas-fix-banner"') && swapHtml.includes('applySwapMaxSpendableFix()'));
  assert.ok(sendHtml.includes('id="send-gas-fix-banner"') && sendHtml.includes('applySendMaxSpendableFix'));

  const uiPartsDir = path.join(ROOT_DIR, 'src', 'parts', 'ui-controller');
  for (const f of fs.readdirSync(uiPartsDir).filter((n) => n.endsWith('.part.js'))) {
    const src = fs.readFileSync(path.join(uiPartsDir, f), 'utf8');
    assert.equal(/\son(click|change|input)=/i.test(src), false, `ui-controller/${f} must have zero inline HTML events`);
  }

  const swLatest = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  assert.ok(/nexus-wallet-v6\.(?:29|[3-9]\d)/.test(swLatest), 'sw.js must bump cache version to v6.29+');
});

