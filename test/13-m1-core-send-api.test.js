'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  cryptoEngine,
  tokenRegistry,
  nearIntents,
  chainContracts,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  withMockedStorage,
  createMockDomElement
} = require('./helpers.js');

test('M1.1: getNativeGasReserve exports exact reserves, supports aliases & blocks 0-gas non-native send before auth/fetch', async () => {
  assert.equal(typeof chainContracts.getNativeGasReserve, 'function');
  for (const [k, v] of Object.entries(chainContracts.DEFAULT_GAS_BUFFERS)) {
    assert.equal(chainContracts.getNativeGasReserve(k), v);
  }
  assert.equal(chainContracts.getNativeGasReserve('bnb'), chainContracts.DEFAULT_GAS_BUFFERS.bsc);
  assert.equal(chainContracts.getNativeGasReserve('ETH'), chainContracts.DEFAULT_GAS_BUFFERS.eth);
  assert.equal(chainContracts.getNativeGasReserve('polygon'), chainContracts.DEFAULT_GAS_BUFFERS.pol);
  assert.equal(chainContracts.getNativeGasReserve('matic'), chainContracts.DEFAULT_GAS_BUFFERS.pol);
  assert.equal(chainContracts.getNativeGasReserve('solana'), chainContracts.DEFAULT_GAS_BUFFERS.sol);
  assert.equal(chainContracts.getNativeGasReserve('unknown_chain'), 0);

  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_m1_gas_precheck',
      name: 'ZeroGas',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { near: 1, eth: 0, base: 0, arb: 0, bsc: 0, op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, sol: 0, prl: 0, btc: 0 },
      erc20Balances: { eth_0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48: 50 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const domMap = new Map([
      ['send-asset-select', { value: 'USDC' }],
      ['send-source-select', { value: 'eth|nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near|0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }],
      ['send-recipient-input', { value: '0x000000000000000000000000000000000000dEaD' }],
      ['send-amount-input', { value: '10' }],
      ['send-detected-net', createMockDomElement('send-detected-net')],
      ['send-route-preview', createMockDomElement('send-route-preview')],
      ['send-gas-fix-banner', createMockDomElement('send-gas-fix-banner')],
      ['send-evm-chain-row', createMockDomElement('send-evm-chain-row')],
      ['send-available-bal', createMockDomElement('send-available-bal')],
      ['btn-confirm-send', createMockDomElement('btn-confirm-send')],
      ['toast', createMockDomElement('toast')]
    ]);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: () => []
    };
    let authCalled = false;
    globalThis.window = {
      Capacitor: {
        Plugins: {
          NativeSecurity: {
            async getSecurityCapabilities() { return { platform: 'ios', supportsBiometrics: true }; },
            async authenticateWithBiometrics() { authCalled = true; return { authenticated: true }; }
          }
        }
      }
    };
    try {
      await withMockedFetch(async () => {
        throw new Error('fetch must not fire when native gas reserve check fails');
      }, async (calls) => {
        await uiController.executeUnifiedSend();
        assert.equal(authCalled, false, 'Must block before biometric/PIN auth');
        assert.equal(calls.length, 0, 'Must block before any network request');
        assert.match(domMap.get('toast').textContent, /ETH.*(手续费|fee)/i);
      });
    } finally {
      globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
    }
  });
});

test('M1.2: Arc USDC deduplication, quickActionSwapFromEntry native resolution & 0-decimal ?? handling', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_m1_arc_dedup',
      name: 'Arc',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { near: 0, sol: 0, eth: 0, base: 0, arb: 0, bsc: 0, op: 0, pol: 0, avax: 0, hype: 1.5, hood: 0, arc: 12.5, prl: 0, btc: 0 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    const groups = uiController.buildAllOnChainAssetGroups(w);
    const usdcGroup = groups.find((g) => g.symbolKey === 'USDC');
    assert.ok(usdcGroup);
    const arcEntries = usdcGroup.entries.filter((e) => e.blockchain === 'arc');
    assert.equal(arcEntries.length, 1, 'Must render exactly 1 Arc USDC entry without duplicate 0-balance row');
    assert.equal(arcEntries[0].decimals, 18);
    assert.equal(arcEntries[0].balance, 12.5);
    assert.equal(arcEntries[0].assetId, 'arc:native:usdc');

    // Catalog retains 6-decimal precompile for Swap
    const arcCatalogTok = tokenRegistry.DEX_CHAIN_TOKENS.arc.find((t) => t.contractAddress && t.contractAddress.toLowerCase() === '0x3600000000000000000000000000000000000000');
    assert.ok(arcCatalogTok && arcCatalogTok.decimals === 6);

    const prevDoc = globalThis.document;
    globalThis.document = { getElementById: () => null, querySelectorAll: () => [] };
    try {
      globalThis.quickActionSwapFromEntry('arc:native:usdc', 'arc', '');
      assert.equal(state.swap.fromAssetId, 'arc:0x3600000000000000000000000000000000000000');

      const hypeGroup = groups.find((g) => g.symbolKey === 'HYPE');
      assert.equal(hypeGroup.entries[0].assetId, 'hype:native:hype');
      globalThis.quickActionSwapFromEntry('hype:native:hype', 'hype', '');
      assert.equal(state.swap.fromAssetId, 'hype:native:hype');
    } finally {
      globalThis.document = prevDoc;
    }

    // 0-decimal guard in 080-send.part.js
    const sendSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/080-send.part.js'), 'utf8');
    assert.equal(/\.decimals\s*\|\|\s*\d+/.test(sendSrc), false, '080-send must use ?? instead of || for asset.decimals');
  });
});

test('M1.3: Dead 1rpc.io removed, BTC fee avoids blockstream 404, 1Click filter blocks Arc/extraDiscovery, Blockscout 403 uses eth_getLogs', async () => {
  const cfgSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/000-config-evm-chains.part.js'), 'utf8');
  assert.equal(cfgSrc.includes('1rpc.io'), false, 'All 1rpc.io endpoints must be replaced');

  const btcSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/060-bitcoin.part.js'), 'utf8');
  assert.equal(btcSrc.includes("'/v1/fees/recommended'"), false, 'BTC fee lookup must not hit blockstream /v1/fees/recommended 404');
  assert.equal(btcSrc.includes('sortedUtxos.length > 1 ? 1 : 1'), false, 'Dead ternary must be removed');

  // Verify 1Click filter excludes extraDiscoveryTokens & arc/hype in cross-chain send preview
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({
      id: 'w_m1_1click_filter',
      name: 'Filter',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { near: 1, sol: 1, eth: 1, base: 1, arb: 1, bsc: 1, op: 1, pol: 1, avax: 1, hype: 1, hood: 1, arc: 1, prl: 1, btc: 1 },
      erc20Balances: { base_0x833589fcd6edb6e08f4c7c32d4f71b54bda02913: 50 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;

    // Seed _cachedDefuseTokens with valid 1Click Base USDC + non-1Click Arc discovery token
    await withMockedFetch(async (url) => {
      if (url.includes('1click.chaindefuser.com')) {
        return jsonResponse([
          { assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', symbol: 'USDC', blockchain: 'base', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, price: 1 },
          { assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near', symbol: 'USDC', blockchain: 'sol', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, price: 1 }
        ]);
      }
      return jsonResponse({}, 404);
    }, async () => {
      await nearIntents.fetchLiveDefuseTokenPrices({ force: true });
    });

    const prevDoc = globalThis.document;
    const previewEl = createMockDomElement('send-route-preview');
    const domMap = new Map([
      ['send-asset-select', { value: 'USDC' }],
      ['send-source-select', { value: 'base|nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near|0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }],
      ['send-recipient-input', { value: '0x000000000000000000000000000000000000dEaD' }],
      ['send-amount-input', { value: '5' }],
      ['send-detected-net', createMockDomElement('send-detected-net')],
      ['send-evm-chain-row', createMockDomElement('send-evm-chain-row')],
      ['send-evm-chain-pills', createMockDomElement('send-evm-chain-pills')],
      ['send-route-preview', previewEl]
    ]);
    globalThis.document = { getElementById: (id) => domMap.get(id) || null, querySelectorAll: () => [] };
    try {
      uiController.setSendTargetEvmChain('arc');
      assert.equal(previewEl.textContent.includes('BASE ➔ ARC'), false, 'Non-1Click Arc destination must be rejected');

      uiController.setSendTargetEvmChain('hype');
      assert.equal(previewEl.textContent.includes('BASE ➔ HYPE'), false, 'Non-1Click HyperEVM destination must be rejected');
    } finally {
      globalThis.document = prevDoc;
    }

    // Blockscout 403 -> RPC eth_getLogs fallback on Arc USDC (6 decimals)
    const evmAddr = w.mpcEvmAddress || w.evmAddress;
    const paddedTo = '0x' + evmAddr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const paddedFrom = '0x' + '1'.repeat(64);
    const prevDoc2 = globalThis.document;
    const histEl = createMockDomElement('token-detail-history-list');
    const domMap2 = new Map([
      ['token-detail-history-list', histEl],
      ['token-detail-history-all-btn', createMockDomElement('token-detail-history-all-btn')]
    ]);
    globalThis.document = { getElementById: (id) => domMap2.get(id) || null, querySelectorAll: () => [] };
    try {
      await withMockedFetch(async (url, opts) => {
        if (url.includes('explorer.arc.io')) {
          return jsonResponse('<!DOCTYPE html><title>Just a moment...</title>', 403, 'Forbidden');
        }
        if (url.includes('rpc.mainnet.arc.io') && opts?.body) {
          const b = JSON.parse(opts.body);
          if (b.method === 'eth_blockNumber') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x1000' });
          if (b.method === 'eth_getLogs') {
            const isIn = b.params[0].topics[2] === paddedTo;
            return jsonResponse({
              jsonrpc: '2.0',
              id: 1,
              result: isIn ? [{
                transactionHash: '0x' + 'ab'.repeat(32),
                logIndex: '0x0',
                blockNumber: '0xf00',
                topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', paddedFrom, paddedTo],
                data: '0x0000000000000000000000000000000000000000000000000000000000989680' // 10_000_000 = 10 USDC @ 6 dec
              }] : []
            });
          }
          if (b.method === 'eth_getBlockByNumber') {
            return jsonResponse({ jsonrpc: '2.0', id: 1, result: { timestamp: '0x67000000' } });
          }
        }
        return jsonResponse({}, 404);
      }, async () => {
        uiController.openTokenDetailSheet('USDC', 'arc');
        await new Promise((r) => setTimeout(r, 40));
        const merged = uiController.getMergedTokenHistoryItems(w, 'USDC', 'arc');
        const arcLog = merged.find((x) => x.txHash === '0x' + 'ab'.repeat(32));
        assert.ok(arcLog, 'RPC eth_getLogs fallback must recover Arc USDC Transfer on Blockscout 403');
        assert.equal(arcLog.amount, 10, 'Arc 0x3600... Transfer logs must decode at 6 decimals');
        assert.equal(histEl.innerHTML.includes('403'), false, 'Must never show raw HTTP 403 to user');
      });
    } finally {
      globalThis.document = prevDoc2;
    }
  });
});

test('M1.4: toUserFriendlyError strips HTTP/JSON/RPC/WebAuthn/dev jargon and preserves balance numbers', () => {
  assert.equal(typeof chainContracts.toUserFriendlyError, 'function');
  assert.equal(typeof state.toUserFriendlyError, 'function');

  const cases = [
    new Error('HTTP 403: Forbidden <!DOCTYPE html>Just a moment... Cloudflare'),
    new Error('{"code":-32001,"message":"You\'ve reached the usage limit"}'),
    Object.assign(new Error('NotAllowedError: The operation either timed out or was not allowed. See https://w3c.github.io/webauthn'), { name: 'NotAllowedError' }),
    Object.assign(new Error('SecurityError: relying party mismatch'), { name: 'SecurityError' }),
    new Error('NearCACrypto.ed25519SignAsync unavailable: ethers Blockbook MPC 1Click Borsh NEP-141 WebView CORS\n    at foo (bar.js:1:2)')
  ];
  for (const err of cases) {
    const out = chainContracts.toUserFriendlyError(err, '操作失败', 'Operation failed');
    assert.ok(out.length > 0);
    assert.equal(/HTTP\s*\d+|32001|NearCACrypto|ethers|Blockbook|1Click|Borsh|NEP-141|WebAuthn|WebView|CORS|relying party|cloudflare|<!doctype/i.test(out), false, `Jargon leaked: ${out}`);
  }

  // Preserves exact balance numbers on INSUFFICIENT_BALANCE & does not leak "zh | en" or "zh / en"
  let insErr = null;
  try {
    chainContracts.validateSufficientChainBalance({ wallet: { nearBalance: 0.1 }, chain: 'near', tokenSymbol: 'NEAR', amount: 2, isNative: true });
  } catch (e) {
    insErr = e;
  }
  assert.ok(insErr && insErr.code === 'INSUFFICIENT_BALANCE');
  assert.equal(insErr.message.includes(' / '), false, 'Must not emit zh / en concatenation');
  const friendlyBal = chainContracts.toUserFriendlyError(insErr);
  assert.match(friendlyBal, /0\.1000\s+NEAR/);
});

test('M1.5: NEAR key self-healing, null-balance verification, security/navigation/sync/receive fixes', async () => {
  // 1. Self-healing NEAR keys in normalizeWalletRecord
  const expectedNear = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC, 0);
  const healed = state.normalizeWalletRecord({ id: 'w_old_mnemonic_only', mnemonic: TEST_MNEMONIC });
  assert.equal(healed.nearAddress, expectedNear.nearAddress);
  assert.equal(healed.nearPublicKey, expectedNear.nearPublicKey);
  assert.equal(healed.nearPrivateKey, expectedNear.nearPrivateKey);
  assert.equal(healed.nearPrivateSeedHex, expectedNear.nearPrivateSeedHex);
  assert.ok(healed.mpcEvmAddress && healed.evmAddress && healed.solAddress && healed.address && healed.btcAddress);

  // 2. Null-balance live verification in Pearl / BTC / NEAR
  await withMockedFetch(async () => jsonResponse({}, 500), async () => {
    await assert.rejects(
      chainContracts.executePearlTransfer({ wallet: { address: healed.address, mnemonic: TEST_MNEMONIC }, toAddress: healed.address, amountPrl: 1 }),
      /无法确认|Unable to verify/i
    );
    await assert.rejects(
      chainContracts.executeBitcoinTransfer({ wallet: { btcAddress: healed.btcAddress, mnemonic: TEST_MNEMONIC }, toAddress: healed.btcAddress, amountBtc: 0.001 }),
      /无法确认|Unable to verify/i
    );
    await assert.rejects(
      chainContracts.executeNearNep141Transfer({ wallet: { ...healed, nativeBalances: { near: 5 } }, tokenContract: 'usdt.tether-token.near', receiverId: 'bob.near', amount: 1 }),
      /无法确认|Unable to verify/i
    );
  });

  // 3. Onboarding HTML IDs, zero global `event`, dead checksumValid removed & backup copy guard works without `event`
  const onboardHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/app/views/AppShellViews.jsx'), 'utf8');
  assert.ok(onboardHtml.includes('id="btn-confirm-create-wallet"'));
  assert.ok(onboardHtml.includes('id="btn-confirm-import-wallet"'));
  const sendHtml = fs.readFileSync(path.join(ROOT_DIR, 'src/app/sheets/CoreSheets.jsx'), 'utf8');
  assert.ok(sendHtml.includes('id="btn-send-max"'));

  const onboardJs = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/030-onboarding.part.js'), 'utf8');
  assert.equal(/\bevent\b/.test(onboardJs), false, '030-onboarding must not rely on deprecated global event');
  assert.equal(onboardJs.includes('checksumValid'), false, 'Dead checksumValid branch must be removed');

  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({ id: 'w_m1_sec', mnemonic: TEST_MNEMONIC });
    state.wallets = [w];
    state.activeWalletId = w.id;

    // Cold-boot unlockAppLockNow uses device-native biometrics
    const prevDoc = globalThis.document;
    const prevWin = globalThis.window;
    const prevEvent = globalThis.event;
    delete globalThis.event;
    const domMap = new Map([
      ['app-lock-overlay', createMockDomElement('app-lock-overlay')],
      ['app-lock-status', createMockDomElement('app-lock-status')],
      ['btn-app-lock-unlock', createMockDomElement('btn-app-lock-unlock')],
      ['sheet-backdrop', createMockDomElement('sheet-backdrop')],
      ['sheet-backup', createMockDomElement('sheet-backup', { classes: ['open'] })],
      ['toast', createMockDomElement('toast')],
      ['send-amount-input', { value: '12' }],
      ['send-recipient-input', { value: 'alice.near' }],
      ['token-picker-search', { value: 'USDC' }],
      ['perp-market-search', { value: 'BTC' }],
      ['send-detected-net', createMockDomElement('send-detected-net')],
      ['send-route-preview', createMockDomElement('send-route-preview')],
      ['send-gas-fix-banner', createMockDomElement('send-gas-fix-banner')],
      ['send-evm-chain-row', createMockDomElement('send-evm-chain-row')]
    ]);
    globalThis.document = {
      documentElement: { classList: createMockDomElement('root').classList },
      body: { classList: createMockDomElement('body').classList },
      getElementById: (id) => domMap.get(id) || null,
      querySelectorAll: (sel) => (sel === '#backup-keys-content .backup-secret-val' ? [{ dataset: { secret: 'secret-phrase-123' } }] : []),
      querySelector: () => null
    };
    let bioCalls = 0;
    globalThis.window = {
      Capacitor: {
        Plugins: {
          NativeSecurity: {
            async getSecurityCapabilities() { return { platform: 'ios', supportsBiometrics: true }; },
            async authenticateWithBiometrics() { bioCalls += 1; return { authenticated: true }; }
          }
        }
      }
    };
    try {
      // Unrevealed backup secret must be blocked even when global `event` is undefined
      globalThis.copyTextValue('secret-phrase-123', 'Phrase');
      assert.match(domMap.get('toast').textContent, /显示助记词|Reveal/i);

      const unlocked = await uiController.unlockAppLockNow();
      assert.equal(bioCalls, 1, 'Cold-boot unlockAppLockNow must invoke NativeSecurity biometrics');
      assert.equal(unlocked, true);

      // closeAllSheets resets st.send, st.perp funding/search & DOM
      state.send.recipient = 'alice.near';
      state.send.amount = '5';
      state.perp.fundingAmount = '100';
      state.perp.fundingQuoteError = 'err';
      state.perp.editingTpslCoin = 'ETH';
      state.perp.marketSearch = 'BTC';
      uiController.closeAllSheets();
      assert.equal(state.send.recipient, '');
      assert.equal(state.send.amount, '');
      assert.equal(state.perp.fundingAmount, '');
      assert.equal(state.perp.fundingQuoteError, '');
      assert.equal(state.perp.editingTpslCoin, '');
      assert.equal(state.perp.marketSearch, '');
      assert.equal(domMap.get('token-picker-search').value, '');
      assert.equal(domMap.get('perp-market-search').value, '');
    } finally {
      globalThis.document = prevDoc;
      if (prevWin === undefined) delete globalThis.window;
      else globalThis.window = prevWin;
      if (prevEvent !== undefined) globalThis.event = prevEvent;
    }

    // QTC receive catch & sanitization on network failure
    const prevDoc3 = globalThis.document;
    const dom3 = new Map([
      ['receive-network-pills', createMockDomElement('receive-network-pills')],
      ['receive-addr-label', createMockDomElement('receive-addr-label')],
      ['receive-addr-value', createMockDomElement('receive-addr-value', { dataset: {} })],
      ['receive-qr-container', createMockDomElement('receive-qr-container')],
      ['toast', createMockDomElement('toast')]
    ]);
    globalThis.document = { getElementById: (id) => dom3.get(id) || null, querySelectorAll: () => [] };
    try {
      const qtcWallet = state.normalizeWalletRecord({ id: 'w_m1_qtc', mnemonic: TEST_MNEMONIC });
      state.wallets = [qtcWallet];
      state.activeWalletId = qtcWallet.id;
      await withMockedFetch(async () => { throw new Error('HTTP 502 Bad Gateway 1Click'); }, async () => {
        globalThis.selectReceiveNetwork('qtc');
        await new Promise((r) => setTimeout(r, 30));
        const toastMsg = dom3.get('toast').textContent;
        assert.ok(toastMsg.length > 0);
        assert.equal(/502|1Click/i.test(toastMsg), false, `Sanitizer must strip raw 502/1Click: ${toastMsg}`);
      });
    } finally {
      globalThis.document = prevDoc3;
    }

    // refreshAllBalancesAsync(true) awaits null PRL/BTC sync and disables/re-enables #btn-home-refresh
    const prevDoc4 = globalThis.document;
    const refreshBtn = createMockDomElement('btn-home-refresh');
    refreshBtn.textContent = '刷新';
    const dom4 = new Map([
      ['btn-home-refresh', refreshBtn],
      ['toast', createMockDomElement('toast')]
    ]);
    globalThis.document = { getElementById: (id) => dom4.get(id) || null, querySelectorAll: () => [], querySelector: () => null };
    const origPrlFetch = chainContracts.fetchPearlNativeBalance;
    const origBtcFetch = chainContracts.fetchBitcoinNativeBalance;
    try {
      const syncW = state.normalizeWalletRecord({ id: 'w_m1_sync', mnemonic: TEST_MNEMONIC });
      state.wallets = [syncW];
      state.activeWalletId = syncW.id;
      await withMockedFetch(async (url) => {
        if (url.includes('blockbook.pearlresearch.ai') || url.includes('mempool.space') || url.includes('blockstream.info')) {
          return jsonResponse({}, 500);
        }
        return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x0' });
      }, async () => {
        const p = uiController.refreshAllBalancesAsync(true);
        assert.equal(refreshBtn.disabled, true, '#btn-home-refresh must be disabled while syncing');
        await p;
        assert.equal(refreshBtn.disabled, false, '#btn-home-refresh must be re-enabled in finally');
        assert.match(dom4.get('toast').textContent, /仍在后台同步|Syncing remaining/i);
      });
    } finally {
      chainContracts.fetchPearlNativeBalance = origPrlFetch;
      chainContracts.fetchBitcoinNativeBalance = origBtcFetch;
      globalThis.document = prevDoc4;
    }
  });
});

test('M1.6: All M1 part files obey <= 50 KB (51,200 B) soft cap', () => {
  const m1Files = [
    ...fs.readdirSync(path.join(ROOT_DIR, 'src/parts/crypto-engine')).filter((f) => f.endsWith('.part.js')).map((f) => `src/parts/crypto-engine/${f}`),
    'src/parts/state/000-store.part.js',
    ...fs.readdirSync(path.join(ROOT_DIR, 'src/parts/token-registry')).filter((f) => f.endsWith('.part.js')).map((f) => `src/parts/token-registry/${f}`),
    ...['000-config-evm-chains', '020-utils-crypto', '030-rpc-balances', '050-pearl', '060-bitcoin', '080-near', '135-live-gas-estimator', '140-exports'].map((n) => `src/parts/chain-contracts/${n}.part.js`),
    ...['000-core', '010-security', '020-navigation', '030-onboarding', '040-balance-sync', '050-token-list', '060-token-detail-core', '061-token-detail-ui', '070-home', '080-send', '090-receive'].map((n) => `src/parts/ui-controller/${n}.part.js`),
    'src/app/views/AppShellViews.jsx',
    'src/app/sheets/CoreSheets.jsx'
  ];
  for (const rel of m1Files) {
    const sz = fs.statSync(path.join(ROOT_DIR, rel)).size;
    assert.ok(sz <= 51200, `${rel} (${sz} B) exceeds 50 KB (51,200 B) soft cap`);
  }
});

test('M1.7: Iteration 2 regressions — toUserFriendlyError nesting/NotAllowedError/stripping, BTC dust convergence, eth_getLogs half-failure & mnemonic parity', async () => {
  const prevLang = state.lang;
  try {
    // 1. toUserFriendlyError in both zh and en
    for (const lang of ['zh', 'en']) {
      state.setLanguage(lang);

      const r1 = chainContracts.toUserFriendlyError({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'Usage limit exceeded' } });
      assert.equal(/object Object|-32001/i.test(r1), false, `[${lang}] r1 leaked: ${r1}`);
      assert.match(r1, lang === 'zh' ? /繁忙/ : /busy/i);

      const r2 = chainContracts.toUserFriendlyError({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Internal JSON-RPC error', data: { message: 'execution reverted' } } });
      assert.equal(/object Object|-32603|JSON-RPC|Internal error/i.test(r2), false, `[${lang}] r2 leaked: ${r2}`);

      const r3 = chainContracts.toUserFriendlyError({ code: -32603, message: 'Internal JSON-RPC error' });
      assert.equal(/-32603|JSON-RPC|Internal error/i.test(r3), false, `[${lang}] r3 leaked: ${r3}`);
      if (lang === 'zh') assert.match(r3, /[\u4e00-\u9fff]/);

      const r4 = chainContracts.toUserFriendlyError(Object.assign(new Error('NotAllowedError: The operation either timed out or was not allowed.'), { name: 'NotAllowedError' }));
      assert.match(r4, lang === 'zh' ? /取消/ : /cancelled/i);

      const r5 = chainContracts.toUserFriendlyError('NotAllowedError: The operation either timed out or was not allowed. See https://w3c.github.io/webauthn');
      assert.match(r5, lang === 'zh' ? /取消/ : /cancelled/i);

      const r6 = chainContracts.toUserFriendlyError('JSON-RPC error -32603: upstream failed');
      assert.equal(/-32603|JSON-RPC/i.test(r6), false, `[${lang}] r6 leaked: ${r6}`);

      const r7 = chainContracts.toUserFriendlyError('HTTP 403 Forbidden');
      assert.equal(/403|Forbidden|HTTP/i.test(r7), false, `[${lang}] r7 leaked: ${r7}`);

      const r8 = chainContracts.toUserFriendlyError(new Error('RPC failed: HTTP 500'));
      assert.equal(/\bRPC\b|500|HTTP/i.test(r8), false, `[${lang}] r8 leaked: ${r8}`);

      const r9 = chainContracts.toUserFriendlyError({ message: 'RPC error', data: { message: 'HTTP 429 rate limit exceeded' } });
      assert.equal(/\bRPC\b|429|HTTP/i.test(r9), false, `[${lang}] r9 leaked: ${r9}`);
      assert.match(r9, lang === 'zh' ? /繁忙/ : /busy/i);

      const r10 = chainContracts.toUserFriendlyError(Object.assign(new Error('Request failed'), { cause: new Error('HTTP 403 Cloudflare') }));
      assert.match(r10, lang === 'zh' ? /不可用/ : /unavailable/i);

      const r11 = chainContracts.toUserFriendlyError({ cause: { message: 'HTTP 500 Bad Gateway' } });
      assert.match(r11, lang === 'zh' ? /不可用/ : /unavailable/i);

      const r12 = chainContracts.toUserFriendlyError('Bad input\nsendTx@https://wallet.example/app.js:123:45');
      assert.equal(r12, 'Bad input');
      assert.equal(r12.includes('@'), false);
    }

    // 2. deriveNearFromSeed / deriveNearFromSeedAsync mixed-case & whitespace mnemonic parity
    const dirtyMnemonic = TEST_MNEMONIC
      .split(' ')
      .map((w, idx) => (idx % 2 === 0 ? w.toUpperCase() : w))
      .join('  \n\t ');
    const expectedNear = cryptoEngine.deriveNearFromSeed(TEST_MNEMONIC, 0);
    const dirtySync = cryptoEngine.deriveNearFromSeed(dirtyMnemonic, 0);
    const dirtyAsync = await cryptoEngine.deriveNearFromSeedAsync(dirtyMnemonic, 0);
    assert.deepEqual(dirtySync, expectedNear);
    assert.deepEqual(dirtyAsync, expectedNear);

    // 3. BTC 3x600-sat dust-boundary fee convergence (must never underpay < feeRateSatVb)
    await withMockedStorage({}, async () => {
      state.initState();
      const btcWallet = state.normalizeWalletRecord({
        id: 'w_m1_btc_dust_conv',
        name: 'BtcDust',
        mnemonic: TEST_MNEMONIC,
        nativeBalances: { near: 0, sol: 0, eth: 0, base: 0, arb: 0, bsc: 0, op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, prl: 0, btc: 0.000018 }
      });
      const fakeTxid = 'a'.repeat(64);
      let broadcastHex = '';
      await withMockedFetch(async (url, opts) => {
        if (url.includes('/utxo')) {
          return jsonResponse([
            { txid: fakeTxid, vout: 0, value: 600 },
            { txid: fakeTxid, vout: 1, value: 600 },
            { txid: fakeTxid, vout: 2, value: 600 }
          ]);
        }
        if (url.includes('fees/recommended')) {
          return jsonResponse({ fastestFee: 1, halfHourFee: 1, hourFee: 1 });
        }
        if (url.includes('fee-estimates')) {
          return jsonResponse({ '2': 1 });
        }
        if (url.endsWith('/tx') && opts?.method === 'POST') {
          broadcastHex = String(opts.body || '');
          return new Response('b'.repeat(64), { status: 200 });
        }
        return jsonResponse({}, 404);
      }, async () => {
        const res = await chainContracts.executeBitcoinTransfer({
          wallet: btcWallet,
          toAddress: btcWallet.btcAddress,
          amountBtc: 0.00001,
          feeDeductMode: 'extra',
          gasBuffer: 0
        });
        assert.equal(res.ok, true);
        assert.ok(broadcastHex.length > 0);
        const feeSats = Math.round(res.feeBtc * 1e8);
        // With 3 inputs (1800 sats) and 1000-sat send at 1 sat/vB, 2 outputs would need 272+546=818 > 800,
        // so valid tx has 1 output (229 vbytes) and pays >= 229 sats (actual 800 sats), never 229 sats on 2 outputs!
        assert.ok(feeSats >= 272, `Expected converged fee >= 272 sats (1-output actualFee=800), got ${feeSats}`);
      });
    });

    // 4. 061-token-detail-ui half-direction eth_getLogs failure surfaces historyPartialUnavailable
    await withMockedStorage({}, async () => {
      state.initState();
      state.setLanguage('en');
      const w = state.normalizeWalletRecord({
        id: 'w_m1_half_logs',
        name: 'HalfLogs',
        mnemonic: TEST_MNEMONIC,
        nativeBalances: { near: 0, sol: 0, eth: 0, base: 0, arb: 1, bsc: 0, op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, prl: 0, btc: 0 },
        erc20Balances: { arb_0xaf88d065e77c8cc2239327c5edb3a432268e5831: 10 }
      });
      state.wallets = [w];
      state.activeWalletId = w.id;
      const evmAddr = w.mpcEvmAddress || w.evmAddress;
      const paddedAddr = '0x' + evmAddr.toLowerCase().replace(/^0x/, '').padStart(64, '0');

      const prevDoc = globalThis.document;
      const histEl = createMockDomElement('token-detail-history-list');
      const domMap = new Map([
        ['token-detail-history-list', histEl],
        ['token-detail-history-all-btn', createMockDomElement('token-detail-history-all-btn')]
      ]);
      globalThis.document = { getElementById: (id) => domMap.get(id) || null, querySelectorAll: () => [] };
      try {
        await withMockedFetch(async (url, opts) => {
          if (url.includes('arbitrum.blockscout.com')) {
            return jsonResponse('Forbidden', 403, 'Forbidden');
          }
          if (url.includes('arb1.arbitrum.io/rpc') && opts?.body) {
            const b = JSON.parse(opts.body);
            if (b.method === 'eth_blockNumber') return jsonResponse({ jsonrpc: '2.0', id: 1, result: '0x1000' });
            if (b.method === 'eth_getLogs') {
              const isOut = b.params[0].topics[1] === paddedAddr;
              if (isOut) return jsonResponse({ jsonrpc: '2.0', id: 1, result: [] });
              return jsonResponse({ error: 'internal error' }, 500, 'Internal Server Error');
            }
          }
          return jsonResponse({}, 404);
        }, async () => {
          uiController.openTokenDetailSheet('USDC', 'arb');
          await new Promise((r) => setTimeout(r, 40));
          assert.match(histEl.innerHTML, /temporarily unavailable/i);
          assert.equal(histEl.innerHTML.includes('No recent token activity found'), false);
        });
      } finally {
        globalThis.document = prevDoc;
      }
    });
  } finally {
    state.setLanguage(prevLang);
  }
});

test('M1.8: Iteration 3 regressions — alias balance resolution without tokenBalance, Firefox stack frames, spaced Network Error & multiline prose', () => {
  const prevLang = state.lang;
  try {
    // 1. validateSufficientChainBalance & resolveWalletChainBalance with GAS_CHAIN_ALIASES (no tokenBalance) + prototype key safety
    const wallet = {
      nearBalance: 2,
      balance: 3,
      nativeBalances: { near: 2, prl: 3, eth: 1, bsc: 1, pol: 1, sol: 1, btc: 1 },
      multiBalances: { eth: 1, bsc: 1, pol: 1, sol: 1, btc: 1 }
    };
    const aliasExpectations = [
      ['ethereum', 'ETH', 0.0015],
      ['bnb', 'BNB', 0.0005],
      ['matic', 'POL', 0.05],
      ['  ETHEREUM  ', 'ETH', 0.0015],
      ['polygon', 'POL', 0.05],
      ['solana', 'SOL', 0.002],
      ['bitcoin', 'BTC', 0.00005],
      ['pearl', 'PRL', 0.003]
    ];
    for (const [chain, sym, expectedBuf] of aliasExpectations) {
      const res = chainContracts.validateSufficientChainBalance({
        wallet,
        chain,
        tokenSymbol: sym,
        amount: 0.5,
        isNative: true
      });
      assert.equal(res.ok, true);
      assert.equal(res.gasBuffer, expectedBuf);
      assert.equal(res.available, chain === 'pearl' ? 3 : 1);
    }

    assert.throws(
      () => chainContracts.validateSufficientChainBalance({
        wallet,
        chain: '  ETHEREUM  ',
        tokenSymbol: 'ETH',
        amount: 0.999,
        isNative: true
      }),
      (err) => err && err.code === 'INSUFFICIENT_BALANCE' && /1\.0000\s+ETH/.test(err.message)
    );

    for (const protoKey of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      assert.equal(chainContracts.getNativeGasReserve(protoKey), 0);
      const protoRes = chainContracts.validateSufficientChainBalance({
        wallet,
        chain: protoKey,
        tokenSymbol: 'TEST',
        amount: 0.5,
        tokenBalance: 10
      });
      assert.equal(protoRes.ok, true);
      assert.equal(protoRes.gasBuffer, 0);
      assert.throws(
        () => chainContracts.validateSufficientChainBalance({
          wallet,
          chain: protoKey,
          tokenSymbol: 'TEST',
          amount: 0.5,
          isNative: true
        }),
        (err) => err && err.code === 'INSUFFICIENT_BALANCE' && /0\.0000\s+TEST/.test(err.message)
      );
    }

    // 2. toUserFriendlyError Firefox frames, spaced Network Error, and \nat prose preservation vs stack stripping
    for (const lang of ['zh', 'en']) {
      state.setLanguage(lang);

      assert.equal(
        chainContracts.toUserFriendlyError('Bad input\nasync*sendTx/<@https://wallet.example/app.js:123:45'),
        'Bad input'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input async*sendTx/<@https://wallet.example/app.js:123:45'),
        'Bad input'
      );
      const leadingFrame = chainContracts.toUserFriendlyError('async*sendTx/<@https://wallet.example/app.js:123:45');
      assert.equal(/async\*|<@|sendTx|https:/i.test(leadingFrame), false, `Leading Firefox frame leaked: ${leadingFrame}`);

      const netErrOut = chainContracts.toUserFriendlyError(new Error('Network Error'));
      if (lang === 'zh') {
        assert.match(netErrOut, /[\u4e00-\u9fff]/);
      } else {
        assert.match(netErrOut, /network/i);
      }

      assert.equal(
        chainContracts.toUserFriendlyError('Invalid amount\nat least 1 token required'),
        'Invalid amount\nat least 1 token required'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Retry\nat 12:30 PM'),
        'Retry\nat 12:30 PM'
      );

      assert.equal(
        chainContracts.toUserFriendlyError('Bad input\n    at sendTx (https://wallet.example/app.js:12:34)'),
        'Bad input'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input\n    at https://wallet.example/app.js:12:34'),
        'Bad input'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input\n    at C:\\app\\main.js:12:34'),
        'Bad input'
      );
    }
  } finally {
    state.setLanguage(prevLang);
  }
});

test('M1.9: Iteration 4 regressions — Firefox global/anonymous/debugger frames, JSON.parse/ethers v6 sanitization, Pearl 546n dust convergence & fullwidth mnemonic validation', async () => {
  const prevLang = state.lang;
  try {
    // 1. Firefox global code@ / anonymous @ / debugger eval code / moz-extension / resource frames & JSON.parse / ethers v6 sanitization
    for (const lang of ['zh', 'en']) {
      state.setLanguage(lang);

      // Firefox global code@ & anonymous @ (leading & inline) + debugger eval code + moz-extension + resource
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input global code@https://wallet.example/app.js:1:1'),
        'Bad input'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input anonymous @https://wallet.example/app.js:1:1'),
        'Bad input'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input anonymous function@https://wallet.example/app.js:1:1'),
        'Bad input'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input\nfoo@debugger eval code:1:1'),
        'Bad input'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input async*fn/<@moz-extension://abc-123/content.js:10:2'),
        'Bad input'
      );
      assert.equal(
        chainContracts.toUserFriendlyError('Bad input fn@resource://gre/modules/Foo.jsm:10:2'),
        'Bad input'
      );

      const leadingGlobal = chainContracts.toUserFriendlyError('global code@https://wallet.example/app.js:1:1');
      assert.equal(/global|code@|https:/i.test(leadingGlobal), false, `[${lang}] leading global code leaked: ${leadingGlobal}`);
      const leadingAnon = chainContracts.toUserFriendlyError('anonymous @https://wallet.example/app.js:1:1');
      assert.equal(/anonymous|https:/i.test(leadingAnon), false, `[${lang}] leading anonymous leaked: ${leadingAnon}`);

      // Email addresses and legitimate multiline prose remain intact
      assert.equal(chainContracts.toUserFriendlyError('Contact support@nexus.io for help'), 'Contact support@nexus.io for help');
      assert.equal(chainContracts.toUserFriendlyError('Contact user+tag@sub.domain.co.uk'), 'Contact user+tag@sub.domain.co.uk');

      // V8 / Firefox / Safari JSON.parse SyntaxError shapes
      let jsonSyntaxErr;
      try { JSON.parse('0xdeadbeef'); } catch (e) { jsonSyntaxErr = e; }
      const jsonSamples = [
        jsonSyntaxErr,
        new Error('Unexpected end of JSON input'),
        new Error('"0xdead" is not valid JSON'),
        new Error('JSON.parse: unexpected character at line 1 column 1 of the JSON data'),
        new Error('JSON Parse error: Unexpected identifier "x"'),
        new Error('Unterminated string in JSON at position 4'),
        new Error("Expected ',' or '}' after property value in JSON at position 12")
      ];
      for (const sample of jsonSamples) {
        const sanitized = chainContracts.toUserFriendlyError(sample, '请求失败', 'Request failed');
        assert.equal(/SyntaxError|Unexpected|JSON|position|column/i.test(sanitized), false, `[${lang}] JSON error leaked: ${sanitized}`);
        assert.equal(sanitized, lang === 'zh' ? '请求失败' : 'Request failed');
      }

      // ethers v6 diagnostic payloads
      const ethersSamples = [
        new Error('invalid value for value.parentHash (invalid hash (argument="value", value=null, code=INVALID_ARGUMENT, version=6.17.0)) (value={ "baseFeePerGas": "0x3b9aca00", "number": "0x10" }, code=BAD_DATA, version=6.17.0)'),
        Object.assign(new Error('execution reverted (unknown custom error) (action="estimateGas", data="0x", reason=null, transaction={ "to": "0x1234" }, invocation=null, revert=null, code=CALL_EXCEPTION, version=6.17.0)'), { code: 'CALL_EXCEPTION' }),
        Object.assign(new Error('overflow (fault="overflow", operation="BigNumber", value=123, code=NUMERIC_FAULT, version=6.17.0)'), { code: 'NUMERIC_FAULT' }),
        Object.assign(new Error('cannot estimate gas (code=UNPREDICTABLE_GAS_LIMIT, version=6.17.0)'), { code: 'UNPREDICTABLE_GAS_LIMIT' })
      ];
      for (const sample of ethersSamples) {
        const sanitized = chainContracts.toUserFriendlyError(sample, '请求失败', 'Request failed');
        assert.equal(/BAD_DATA|INVALID_ARGUMENT|CALL_EXCEPTION|NUMERIC_FAULT|UNPREDICTABLE_GAS_LIMIT|version=6|argument=|baseFeePerGas|parentHash/i.test(sanitized), false, `[${lang}] ethers payload leaked: ${sanitized}`);
        assert.equal(sanitized, lang === 'zh' ? '请求失败' : 'Request failed');
      }

      // Legitimate user errors still preserved
      assert.equal(chainContracts.toUserFriendlyError('Invalid amount'), 'Invalid amount');
    }

    // 2. executePearlTransfer across 546n dust boundary must never underpay a 2-output Taproot transaction
    await withMockedStorage({}, async () => {
      state.initState();
      const prlWallet = state.normalizeWalletRecord({
        id: 'w_m1_prl_dust_conv',
        name: 'PrlDust',
        mnemonic: TEST_MNEMONIC,
        nativeBalances: { near: 0, sol: 0, eth: 0, base: 0, arb: 0, bsc: 0, op: 0, pol: 0, avax: 0, hype: 0, hood: 0, arc: 0, prl: 0.01, btc: 0 }
      });
      const utxo = [{ txid: 'f'.repeat(64), vout: 0, value: 1000000, confirmations: 10 }];

      // Boundary 1: oscillation range 828954..829954 (step 50 + endpoints) must never build an underpaid 2-out tx
      const oscillationTargets = [];
      for (let g = 828954; g <= 829954; g += 50) oscillationTargets.push(g);
      if (!oscillationTargets.includes(829954)) oscillationTargets.push(829954);

      for (const reqGrains of oscillationTargets) {
        let broadcastHex = '';
        let threwInsufficient = false;
        await withMockedFetch(async (url, opts) => {
          if (url.includes('/api/v2/utxo/')) return jsonResponse(utxo);
          if (url.includes('/api/v2/sendtx/') && opts?.method === 'POST') {
            broadcastHex = String(opts.body || '');
            return jsonResponse({ result: 'e'.repeat(64) });
          }
          return jsonResponse({}, 404);
        }, async () => {
          try {
            const res = await chainContracts.executePearlTransfer({
              wallet: prlWallet,
              toAddress: prlWallet.address,
              amountPrl: (reqGrains / 1e8).toFixed(8),
              feeDeductMode: 'extra',
              feePerKbPrl: 0.015,
              gasBuffer: 0,
              tokenBalance: 0.01
            });
            const buf = Buffer.from(broadcastHex, 'hex');
            const outCount = buf[48];
            const feePaidGrains = Math.round(res.feePrl * 1e8);
            if (outCount === 2) {
              assert.ok(feePaidGrains >= 234000, `Underpaid 2-output PRL tx at ${reqGrains}: ${feePaidGrains}`);
            } else {
              assert.equal(outCount, 1);
              assert.ok(feePaidGrains >= 169500, `Underpaid 1-output PRL tx at ${reqGrains}: ${feePaidGrains}`);
            }
          } catch (err) {
            threwInsufficient = /UTXO|余额不足|Insufficient/i.test(String(err && err.message));
            assert.equal(threwInsufficient, true, `Unexpected error at ${reqGrains}: ${err && err.message}`);
          }
        });
      }

      // Boundary 2: exact 2-output vs 1-output change threshold at 1000000 - 234000 - 546 = 765454 grains
      for (const [reqGrains, expectedOutCount, minFee] of [
        [765454, 2, 234000],
        [765455, 1, 169500]
      ]) {
        let broadcastHex = '';
        await withMockedFetch(async (url, opts) => {
          if (url.includes('/api/v2/utxo/')) return jsonResponse(utxo);
          if (url.includes('/api/v2/sendtx/') && opts?.method === 'POST') {
            broadcastHex = String(opts.body || '');
            return jsonResponse({ result: 'd'.repeat(64) });
          }
          return jsonResponse({}, 404);
        }, async () => {
          const res = await chainContracts.executePearlTransfer({
            wallet: prlWallet,
            toAddress: prlWallet.address,
            amountPrl: (reqGrains / 1e8).toFixed(8),
            feeDeductMode: 'extra',
            feePerKbPrl: 0.015,
            gasBuffer: 0,
            tokenBalance: 0.01
          });
          assert.equal(res.ok, true);
          const buf = Buffer.from(broadcastHex, 'hex');
          assert.equal(buf[48], expectedOutCount, `Expected ${expectedOutCount} outputs at ${reqGrains}`);
          const feePaidGrains = Math.round(res.feePrl * 1e8);
          assert.ok(feePaidGrains >= minFee, `Expected fee >= ${minFee} at ${reqGrains}, got ${feePaidGrains}`);
        });
      }
    });

    // 3. validateMnemonic accepts fullwidth ASCII IME input consistently with normalizeMnemonicInput
    const toFullwidth = (str) => str.replace(/[!-~]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xFEE0));
    const fullwidthLower = toFullwidth(TEST_MNEMONIC).replace(/ /g, '　');
    const fullwidthMixed = TEST_MNEMONIC
      .split(' ')
      .map((w, idx) => toFullwidth(idx % 2 === 0 ? w.toUpperCase() : w))
      .join('，');
    for (const fwInput of [fullwidthLower, fullwidthMixed]) {
      const check = cryptoEngine.validateMnemonic(fwInput);
      assert.equal(check.valid, true, `Fullwidth mnemonic validation failed: ${check.error}`);
      assert.equal(check.checksumValid, true);
      assert.deepEqual(check.words, TEST_MNEMONIC.split(' '));
    }
  } finally {
    state.setLanguage(prevLang);
  }
});

test('M1.10: Iteration 5 regressions — mnemonic normalization parity, Firefox async*/accessor frames, V8/JSC JSON.parse strings, UNKNOWN_ERROR/payload & Pearl fee guard', async () => {
  const prevLang = state.lang;
  try {
    // 1. cryptoPbkdf2Sync, cryptoPbkdf2Async & deriveAllChainKeysAsync parity with validateMnemonic
    const toFullwidth = (str) => str.replace(/[!-~]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0xFEE0));
    const canonicalSeedHex = Buffer.from(cryptoEngine.cryptoPbkdf2Sync(TEST_MNEMONIC)).toString('hex');
    const canonicalKeys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);

    const variants = [
      TEST_MNEMONIC.split(' ').join(', '),
      toFullwidth(TEST_MNEMONIC.toUpperCase()).replace(/ /g, '，'),
      TEST_MNEMONIC.split(' ').map((w, i) => toFullwidth(i % 2 === 0 ? w.toUpperCase() : w)).join('；'),
      TEST_MNEMONIC.split(' ').join('. '),
      TEST_MNEMONIC.split(' ').join('。'),
      `  ${toFullwidth(TEST_MNEMONIC.split(' ').slice(0, 6).join('，'))}；${TEST_MNEMONIC.split(' ').slice(6).join('。\u00A0\t')}  `
    ];
    for (const v of variants) {
      const check = cryptoEngine.validateMnemonic(v);
      assert.equal(check.valid, true, `validateMnemonic rejected variant: ${v}`);
      assert.equal(Buffer.from(cryptoEngine.cryptoPbkdf2Sync(v)).toString('hex'), canonicalSeedHex);
      assert.equal(Buffer.from(await cryptoEngine.cryptoPbkdf2Async(v)).toString('hex'), canonicalSeedHex);
      const keys = await cryptoEngine.deriveAllChainKeysAsync(v);
      assert.equal(keys.nearAddress, canonicalKeys.nearAddress);
      assert.equal(keys.evmAddress, canonicalKeys.evmAddress);
      assert.equal(keys.solAddress, canonicalKeys.solAddress);
      assert.equal(keys.btcAddress, canonicalKeys.btcAddress);
      assert.equal(keys.pearlAddress, canonicalKeys.pearlAddress);
    }

    // 2. toUserFriendlyError Firefox async* + accessor frames, V8/JSC stringified JSON.parse & UNKNOWN_ERROR/payload
    for (const lang of ['zh', 'en']) {
      state.setLanguage(lang);

      for (const frame of [
        'async*anonymous function@https://wallet.example/app.js:1:1',
        'async*anonymous @https://wallet.example/app.js:1:1',
        'async*global code@https://wallet.example/app.js:1:1',
        'get balance@https://wallet.example/app.js:12:3',
        'set amount@https://wallet.example/app.js:15:3'
      ]) {
        const leadingOut = chainContracts.toUserFriendlyError(frame, '请求失败', 'Request failed');
        assert.equal(leadingOut, lang === 'zh' ? '请求失败' : 'Request failed', `[${lang}] leading frame leaked: ${leadingOut}`);
        assert.equal(/async\*|anonymous|global|get\b|set\b|https:/i.test(leadingOut), false);

        const inlineOut = chainContracts.toUserFriendlyError(`Bad input ${frame}`, '请求失败', 'Request failed');
        assert.equal(inlineOut, 'Bad input', `[${lang}] inline frame leaked: ${inlineOut}`);
      }

      // Preserves emails and valid prose
      assert.equal(chainContracts.toUserFriendlyError('Contact support@nexus.io for help'), 'Contact support@nexus.io for help');
      assert.equal(chainContracts.toUserFriendlyError('Contact user+tag@sub.domain.co.uk'), 'Contact user+tag@sub.domain.co.uk');
      assert.equal(chainContracts.toUserFriendlyError('Global market data unavailable'), 'Global market data unavailable');
      assert.equal(chainContracts.toUserFriendlyError('Anonymous mode enabled'), 'Anonymous mode enabled');
      assert.equal(chainContracts.toUserFriendlyError('Invalid amount'), 'Invalid amount');

      // Stringified / re-wrapped V8 JSON.parse SyntaxError variants & older JSC string
      const rawJsonMsgs = [];
      for (const badJson of ['{"a": "\\x"}', '{"a": -}', '{"a": 1e}', '{"a": 1.}']) {
        try { JSON.parse(badJson); } catch (e) { rawJsonMsgs.push(e.message, new Error(e.message)); }
      }
      rawJsonMsgs.push('Unable to parse JSON string', new Error('Unable to parse JSON string'));
      for (const sample of rawJsonMsgs) {
        const out = chainContracts.toUserFriendlyError(sample, '请求失败', 'Request failed');
        assert.equal(/JSON|position|column|parse/i.test(out), false, `[${lang}] JSON parse message leaked: ${out}`);
        assert.equal(out, lang === 'zh' ? '请求失败' : 'Request failed');
      }

      // ethers v6 UNKNOWN_ERROR + payload={...} without version=
      const unknownErrOut = chainContracts.toUserFriendlyError(
        'could not coalesce error (payload={ "method": "eth_call" }, code=UNKNOWN_ERROR)',
        '请求失败',
        'Request failed'
      );
      assert.equal(unknownErrOut, lang === 'zh' ? '请求失败' : 'Request failed');
    }

    // 3. buildSignedPearlTaprootTx rejects zero/negative fees and sub-dust amounts
    await withMockedStorage({}, async () => {
      state.initState();
      const w = state.normalizeWalletRecord({ id: 'w_m1_prl_fee_guard', mnemonic: TEST_MNEMONIC });
      const utxos = [{ txid: 'f'.repeat(64), vout: 0, value: 1000000, confirmations: 10 }];
      for (const feeGrains of ['0', '-1000']) {
        assert.throws(() => chainContracts.buildSignedPearlTaprootTx({
          fromAddress: w.address,
          toAddress: w.address,
          amountGrains: '500000',
          feeGrains,
          utxos,
          tweakedPrivateKeyHex: w.tweakedPrivateKeyHex
        }), /矿工费必须大于 0|miner fee must be positive/);
      }
      assert.throws(() => chainContracts.buildSignedPearlTaprootTx({
        fromAddress: w.address,
        toAddress: w.address,
        amountGrains: '545',
        feeGrains: '10000',
        utxos,
        tweakedPrivateKeyHex: w.tweakedPrivateKeyHex
      }), /过小|minimum threshold/);
    });
  } finally {
    state.setLanguage(prevLang);
  }
});
