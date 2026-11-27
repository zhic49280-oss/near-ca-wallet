'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  nearIntents,
  chainContracts,
  hlPerps,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  withMockedStorage,
  createMockDomElement
} = require('./helpers.js');

test('v6.36 Audit Fixes: legacy PIN/Vault fields are dropped by normalizeWalletRecord and head pre-paint lock supports object storage', () => {
  const normalized = state.normalizeWalletRecord({
    id: 'w_legacy',
    name: 'Legacy',
    mnemonic: TEST_MNEMONIC,
    pin: '1234',
    pinHash: 'abcd',
    pinSalt: '1234',
    pinIterations: 100000,
    pinLen: 4,
    encryptedVault: { ctBase64: 'abc' }
  });
  assert.equal(normalized.pin, undefined);
  assert.equal(normalized.pinHash, undefined);
  assert.equal(normalized.pinSalt, undefined);
  assert.equal(normalized.pinLen, undefined);
  assert.equal(normalized.encryptedVault, undefined);

  const headHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/index-html/000-head-shell.part.html'), 'utf8');
  assert.ok(headHtml.includes('Array.isArray(parsed.wallets)'), 'Pre-paint lock must unpack { wallets: [...] } object');
  assert.equal(/pinHash|btn-app-lock-pin/.test(headHtml), false, 'Pre-paint lock must not reference PIN');
});

test('v6.36 Audit Fixes: Receive EVM address matches local evmPrivateKey wallet & APP_FEE_CONFIG is exported', async () => {
  assert.ok(nearIntents.APP_FEE_CONFIG, 'APP_FEE_CONFIG should be exported');
  assert.equal(nearIntents.APP_FEE_CONFIG.SWAP_CROSS_CHAIN_BPS, 25);
  assert.equal(nearIntents.APP_FEE_CONFIG.SEND_CROSS_CHAIN_BPS, 25);

  const prevDoc = globalThis.document;
  const prevQr = globalThis.QRCode;
  globalThis.QRCode = { toCanvas: () => {}, toDataURL: async () => '' };
  const domNodes = {
    'receive-network-pills': createMockDomElement(),
    'receive-addr-label': createMockDomElement(),
    'receive-addr-value': createMockDomElement(),
    'receive-qr-container': createMockDomElement(),
    'sheet-receive': createMockDomElement()
  };
  globalThis.document = {
    getElementById: (id) => domNodes[id] || null,
    querySelectorAll: () => []
  };
  try {
    await withMockedStorage({}, () => {
      const w = state.normalizeWalletRecord({
        id: 'w_local_evm',
        name: 'LocalEVM',
        mnemonic: TEST_MNEMONIC,
        evmAddress: '0x1111111111111111111111111111111111111111',
        mpcEvmAddress: '0x2222222222222222222222222222222222222222'
      });
      w.evmPrivateKey = '0x1111111111111111111111111111111111111111111111111111111111111111';
      w.evmAddress = '0x1111111111111111111111111111111111111111';
      state.wallets = [w];
      state.activeWalletId = w.id;
      uiController.openReceiveSheet('evm');
      assert.equal(domNodes['receive-addr-value'].textContent, '0x1111111111111111111111111111111111111111');
    });
  } finally {
    globalThis.document = prevDoc;
    globalThis.QRCode = prevQr;
  }
});

test('v6.36 Audit Fixes: Solana RPC getTokenAccountsByOwner failure sets splFetchFailed instead of zeroing balances', async () => {
  await withMockedFetch(async (_url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    if (body.method === 'getBalance') {
      return jsonResponse({ jsonrpc: '2.0', result: { value: 1500000000 } });
    }
    return jsonResponse({ error: { message: '429 Too Many Requests' } }, 429, 'Too Many Requests');
  }, async () => {
    const res = await chainContracts.fetchSolanaNativeAndSplBalances(
      '11111111111111111111111111111111',
      ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v']
    );
    assert.ok(res);
    assert.equal(res.nativeSol, 1.5);
    assert.equal(res.splFetchFailed, true);
    assert.equal(res.tokens['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'], undefined);
  });
});

test('v6.36 Audit Fixes: Hyperliquid TP/SL market triggers include protective slippage and Binance L/S helper removed', async () => {
  assert.equal(hlPerps.resolveBinanceFuturesSymbol, undefined, 'Deprecated resolveBinanceFuturesSymbol must be removed');

  const src = fs.readFileSync(path.join(ROOT_DIR, 'src/hyperliquid-perps.js'), 'utf8');
  assert.ok(src.includes('slNum * 1.08') && src.includes('slNum * 0.92'), 'SL market trigger must apply 8% protective slippage');
});

test('v6.36 Audit Fixes: NEAR key delete blocks In-Use key & sw.js/server.js hardened for v6.36', async () => {
  const keysSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/090-near-keys.part.js'), 'utf8');
  assert.ok(keysSrc.includes('resolvedTarget === creds.publicKeyStr'), 'Must block deleting active key');

  const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  assert.match(swSrc, /nexus-wallet-v6\.(3[7-9]|[4-9]\d)/, 'sw.js must be bumped to >= v6.37');
  assert.ok(swSrc.includes('Promise.allSettled'), 'sw.js must precache fault-tolerantly');

  const srvSrc = fs.readFileSync(path.join(ROOT_DIR, 'server.js'), 'utf8');
  assert.ok(srvSrc.includes("process.env.HOST || '127.0.0.1'"), 'server.js must bind 127.0.0.1 by default');
});
