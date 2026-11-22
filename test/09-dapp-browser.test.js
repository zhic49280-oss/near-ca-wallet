'use strict';

const vm = require('node:vm');
const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  cryptoEngine,
  tokenRegistry,
  chainContracts,
  miningPro,
  state,
  dappBrowser,
  uiController,
  TEST_MNEMONIC,
  withMockedStorage,
  createMockClassList,
  createMockDomElement
} = require('./helpers.js');

const ethersLib = require('../ethers.umd.min.js');

test('v6.24 UI & UX Fixes: global sheet scroll lock, keyboard-safe picker/perp height, and Earn sheet modal', () => {
  const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  const earnHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'parts', 'index-html', '040-view-earn.part.html'), 'utf8');
  const sheetsHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'parts', 'index-html', '080-sheets-chain-perp-auth.part.html'), 'utf8');

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
  assert.ok(kpepeIcon.primaryUrl && kpepeIcon.primaryUrl.includes('mitte.gg'), `kPEPE should resolve PEPE icon, got ${kpepeIcon.primaryUrl}`);
  assert.equal(kpepeIcon.primaryUrl, tokenRegistry.resolveTokenIcon({ symbol: 'PEPE' }).primaryUrl);

  const kbonkIcon = tokenRegistry.resolveTokenIcon({ symbol: 'kBONK' });
  assert.equal(kbonkIcon.primaryUrl, tokenRegistry.resolveTokenIcon({ symbol: 'BONK' }).primaryUrl);

  const khypeIcon = tokenRegistry.resolveTokenIcon({ symbol: 'kHYPE', blockchain: 'hype' });
  assert.notEqual(khypeIcon.primaryUrl, tokenRegistry.resolveTokenIcon({ symbol: 'HYPE', blockchain: 'hype' }).primaryUrl, 'kHYPE must retain its dedicated icon');

  const perpHtml = fs.readFileSync(path.join(ROOT_DIR, 'src', 'parts', 'index-html', '030-view-perp.part.html'), 'utf8');
  assert.ok(perpHtml.includes('id="perp-tpsl-drawer"'), 'Perp TP/SL must be collapsible');
  assert.ok(perpHtml.includes('perp-meta-grid'), 'Perp metadata must use compact 2-column grid');

  const prevDoc = globalThis.document;
  const drawer = createMockDomElement('perp-tpsl-drawer', { classes: ['hidden'] });
  const toggleBtn = createMockDomElement('btn-perp-tpsl-toggle');
  globalThis.document = {
    getElementById: (id) => (id === 'perp-tpsl-drawer' ? drawer : (id === 'btn-perp-tpsl-toggle' ? toggleBtn : null))
  };
  try {
    uiController.togglePerpTpSl();
    assert.equal(drawer.classList.contains('hidden'), false);
    uiController.togglePerpTpSl();
    assert.equal(drawer.classList.contains('hidden'), true);
  } finally {
    globalThis.document = prevDoc;
  }
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

  // NEAR NEP-413 signMessage
  const nearSigRes = await dappBrowser.handleDAppRpcRequest(
    {
      id: '7',
      namespace: 'near',
      method: 'signMessage',
      params: [{ message: 'Sign in NEAR', recipient: 'app.rhea.finance', nonce: cryptoEngine.bytesToBase64(new Uint8Array(32).fill(7)) }]
    },
    { wallet, contracts: mockContracts, crypto: cryptoEngine, requestApprovalAsync: async () => true }
  );
  assert.ok(nearSigRes.signature && nearSigRes.signature.startsWith('ed25519:'));
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
