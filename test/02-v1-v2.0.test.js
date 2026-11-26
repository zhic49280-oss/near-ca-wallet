'use strict';

const {
  test,
  assert,
  fs,
  path,
  nodeCrypto,
  ROOT_DIR,
  cryptoEngine,
  tokenRegistry,
  nearIntents,
  chainContracts,
  limitOrders,
  hlPerps,
  miningPro,
  state,
  uiController,
  TEST_MNEMONIC,
  jsonResponse,
  withMockedFetch,
  createMemoryStorage,
  withMockedStorage,
  readBorshString,
  INITIAL_STAKING_SNAPSHOT,
  createMockClassList,
  createMockDomElement
} = require('./helpers.js');

test('v1.7 Module 2: Solana xStocks (16 tokenized equities), Robinhood (PONS/USDG/CASHCAT) & Arc Network (no fake ARC token)', () => {
  const expectedXStocks = [
    'NVDAx', 'TSLAx', 'AAPLx', 'MSFTx', 'GOOGLx', 'AMZNx', 'METAx', 'SPYx',
    'QQQx', 'MSTRx', 'COINx', 'PLTRx', 'HOODx', 'CRCLx', 'GLDx', 'SPCXx'
  ];
  const solDex = tokenRegistry.DEX_CHAIN_TOKENS.sol || [];
  for (const sym of expectedXStocks) {
    const hit = solDex.find((t) => t.symbol === sym);
    assert.ok(hit, `DEX_CHAIN_TOKENS.sol must include ${sym}`);
    assert.equal(hit.decimals, 8, `${sym} must have decimals === 8`);
    assert.equal(hit.category, 'xstock', `${sym} must have category === 'xstock'`);
    assert.equal(hit.price, null, `${sym} must start with price === null`);
  }

  const hoodCore = tokenRegistry.UNIFIED_CORE_TOKENS.filter((t) => t.blockchain === 'hood');
  const hoodDex = tokenRegistry.DEX_CHAIN_TOKENS.hood || [];
  for (const sym of ['PONS', 'USDG', 'CASHCAT', 'ETH']) {
    assert.ok(hoodCore.some((t) => t.symbol === sym), `UNIFIED_CORE_TOKENS.hood must retain ${sym}`);
    assert.ok(hoodDex.some((t) => t.symbol === sym), `DEX_CHAIN_TOKENS.hood must retain ${sym}`);
  }

  assert.equal(tokenRegistry.getChainMeta('arc').key, 'arc');
  assert.equal(tokenRegistry.getChainMeta('arcnetwork').key, 'arc');
  assert.equal(tokenRegistry.getChainMeta('arc').name, 'Arc Network');
  const allCuratedTokens = [
    ...tokenRegistry.UNIFIED_CORE_TOKENS,
    ...Object.values(tokenRegistry.DEX_CHAIN_TOKENS).flat()
  ];
  assert.equal(
    allCuratedTokens.some((t) => String(t.symbol || '').toUpperCase() === 'ARC'),
    false,
    'Curated token lists must NEVER contain a fake ARC token (Arc Network has not launched a native token and uses USDC for gas)'
  );
});

test('v1.7 Module 3: fetchLiveDefuseTokenPrices keeps hood (PONS/USDG), filters dead test tokens, hydrates xStocks & searchJupiterTokensV2', async () => {
  const nvdax = tokenRegistry.DEX_CHAIN_TOKENS.sol.find((t) => t.symbol === 'NVDAx');
  const prevPrice = nvdax ? nvdax.price : null;
  try {
    await withMockedFetch(async (url) => {
      if (url.includes('1click.chaindefuser.com/v0/tokens')) {
        return jsonResponse([
          { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.25 },
          { assetId: 'nep141:hood-0x39dbed3a2bd333467115de45665cc57f813c4571.omft.near', symbol: 'PONS', blockchain: 'hood', contractAddress: '0x39dbed3a2bd333467115de45665cc57f813c4571', decimals: 18, price: 0.12 },
          { assetId: 'nep141:dead-ssc1.omft.near', symbol: 'SSC1_PIT', blockchain: 'sol', decimals: 6, price: 1.0 },
          { assetId: 'nep141:dead-fogo.omft.near', symbol: 'FOGO', blockchain: 'sol', decimals: 6, price: 0.5 },
          { assetId: 'nep141:deprecated-test.omft.near', symbol: 'DEPRECATED_TOK', blockchain: 'eth', decimals: 18, price: 1.0 }
        ]);
      }
      if (url.includes('lite-api.jup.ag/tokens/v2/search?query=xStock')) {
        return jsonResponse([
          { id: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', symbol: 'NVDAx', name: 'NVIDIA xStock', decimals: 8, usdPrice: 138.45, icon: 'https://cdn.example.com/nvdax.png' }
        ]);
      }
      if (url.includes('lite-api.jup.ag/tokens/v2/search?query=WIF')) {
        return jsonResponse([
          { id: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF', name: 'dogwifhat', decimals: 6, usdPrice: 1.88, icon: 'https://cdn.example.com/wif.png' }
        ]);
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      const live = await nearIntents.fetchLiveDefuseTokenPrices();
      assert.ok(Array.isArray(live));
      assert.ok(live.some((t) => t.symbol === 'PONS' && t.blockchain === 'hood'), 'hood PONS must be kept');
      assert.equal(live.some((t) => t.symbol === 'SSC1_PIT' || t.symbol === 'FOGO'), false, 'dead test tokens must be filtered');
      assert.equal(live.some((t) => t.symbol === 'DEPRECATED_TOK'), false, 'DEPRECATED tokens must be filtered');
      assert.equal(nvdax.price, 138.45, 'NVDAx must hydrate live price from Jupiter V2 xStocks');

      const searchHits = await nearIntents.searchJupiterTokensV2('WIF');
      assert.equal(searchHits.length, 1);
      assert.equal(searchHits[0].symbol, 'WIF');
      assert.equal(searchHits[0].blockchain, 'sol');
      assert.equal(searchHits[0].price, 1.88);
    });
  } finally {
    if (nvdax) nvdax.price = prevPrice;
  }
});

test('v1.7 Module 4: quoteSolanaJupiterSwap compares Jupiter V1 & Raydium V1 and picks highest outAmount', async () => {
  await withMockedFetch(async (url) => {
    if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
      return jsonResponse({ outAmount: '45000000', otherAmountThreshold: '44500000', routePlan: [] });
    }
    if (url.includes('transaction-v1.raydium.io/compute/swap-base-in')) {
      return jsonResponse({ success: true, data: { swapType: 'BaseIn', inputMint: 'So111', outputMint: 'Xsc9', inputAmount: '1000000000', outputAmount: '46500000' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q = await chainContracts.quoteSolanaJupiterSwap({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
      amountRaw: '1000000000',
      slippageBps: 100
    });
    assert.equal(q.outAmount, '46500000');
    assert.equal(q.bestSource, 'Raydium V1');
    assert.equal(q.comparedPools, 2);
    assert.ok(q.routeLabel.includes('Raydium V1'));
  });
});

test('v1.7 Module 4: quoteEvmDexSwap compares KyberSwap + ParaSwap + OpenOcean and handles HTTP 403 gracefully', async () => {
  await withMockedFetch(async (url) => {
    if (url.includes('aggregator-api.kyberswap.com')) {
      return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '1000000000000000000', amountInUsd: '100', amountOutUsd: '99.8' } } });
    }
    if (url.includes('api.paraswap.io/prices')) {
      return jsonResponse({ priceRoute: { destAmount: '1050000000000000000', srcUSD: '100', destUSD: '104.5' } });
    }
    if (url.includes('open-api.openocean.finance')) {
      return jsonResponse({ code: 403, error: 'Forbidden' }, 403, 'Forbidden');
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q = await chainContracts.quoteEvmDexSwap({
      chainKey: 'base',
      srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      destToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountRaw: '50000000000000000',
      srcDecimals: 18,
      destDecimals: 6,
      slippageBps: 100
    });
    assert.equal(q.ok, true);
    assert.equal(q.bestSource, 'ParaSwap');
    assert.equal(q.amountOut, '1050000000000000000');
    assert.equal(q.comparedPools, 2);
  });
});

test('v1.7 Module 3: quoteBestNearPairSwap & quoteCrossChainWithDexRelay (NEAR -> NVDAx, NVDAx -> NEAR, 100 NEAR -> PONS)', async () => {
  // 1. NEAR -> QTC multi-pool best price (Rhea CLMM dclv2 beats 1Click)
  await withMockedFetch(async (url, opts) => {
    if (url.includes('smartrouter.ref.finance')) {
      return jsonResponse({ code: 1000, msg: 'No path' });
    }
    if (url.includes('rpc.mainnet.near.org')) {
      const resultBytes = [...Buffer.from(JSON.stringify({ amount: '950000000000' }), 'utf8')];
      return jsonResponse({ jsonrpc: '2.0', result: { result: resultBytes } });
    }
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      return jsonResponse({ quote: { amountOut: '900000000000', amountOutFormatted: '0.9', amountInUsd: '10', amountOutUsd: '9.5' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const bestNear = await nearIntents.quoteBestNearPairSwap({
      fromToken: { symbol: 'USDC', blockchain: 'near', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6 },
      toToken: { symbol: 'QTC', blockchain: 'near', assetId: '1cs_v1:near:nep141:qtc.omft.near', contractAddress: 'qtc.omft.near', decimals: 12 },
      amountRaw: '10000000',
      recipient: 'alice.near',
      nearAccountId: 'alice.near'
    });
    assert.equal(bestNear.ok, true);
    assert.equal(bestNear.amountOut, '950000000000');
    assert.equal(bestNear.bestSource, 'Rhea CLMM (dclv2)');
    assert.equal(bestNear.comparedRoutesCount, 2);
  });

  // 2. 100 NEAR -> NVDAx (CROSS_CHAIN_TO_SOL_DEX: 1Click -> SOL + Jupiter/Raydium)
  await withMockedFetch(async (url) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      return jsonResponse({ quote: { amountOut: '3900000000', amountOutFormatted: '3.9', amountInUsd: '325', amountOutUsd: '324' } });
    }
    if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
      return jsonResponse({ outAmount: '234560000', otherAmountThreshold: '232000000', routePlan: [] });
    }
    if (url.includes('transaction-v1.raydium.io')) {
      return jsonResponse({ success: true, data: { outputAmount: '231000000' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: { symbol: 'NEAR', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 },
      toToken: tokenRegistry.DEX_CHAIN_TOKENS.sol.find((t) => t.symbol === 'NVDAx'),
      amountRaw: '100000000000000000000000000',
      recipient: '11111111111111111111111111111111',
      refundTo: 'alice.near',
      nearAccountId: 'alice.near',
      solAddress: '11111111111111111111111111111111'
    });
    assert.equal(q.ok, true);
    assert.equal(q.compositeType, 'CROSS_CHAIN_TO_SOL_DEX');
    assert.equal(q.amountOut, '234560000');
    assert.equal(q.amountOutFormatted, '2.3456');
  });

  // 3. NVDAx -> NEAR (SOL_DEX_TO_CROSS_CHAIN: Jupiter/Raydium -> SOL + 1Click)
  await withMockedFetch(async (url) => {
    if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
      return jsonResponse({ outAmount: '1650000000', otherAmountThreshold: '1630000000', routePlan: [] });
    }
    if (url.includes('transaction-v1.raydium.io')) {
      return jsonResponse({ success: false }, 400, 'Bad Request');
    }
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      return jsonResponse({ quote: { amountOut: '42000000000000000000000000', amountOutFormatted: '42', amountInUsd: '138', amountOutUsd: '137' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: tokenRegistry.DEX_CHAIN_TOKENS.sol.find((t) => t.symbol === 'NVDAx'),
      toToken: { symbol: 'NEAR', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 },
      amountRaw: '100000000',
      recipient: 'alice.near',
      refundTo: '11111111111111111111111111111111',
      nearAccountId: 'alice.near',
      solAddress: '11111111111111111111111111111111'
    });
    assert.equal(q.ok, true);
    assert.equal(q.compositeType, 'SOL_DEX_TO_CROSS_CHAIN');
    assert.equal(q.amountOutFormatted, '42');
  });

  // 4. 100 NEAR -> PONS (hood): when Direct 1Click returns No liquidity available, Route B (1Click -> HOOD ETH + KyberSwap Robinhood) succeeds!
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const body = JSON.parse(opts.body || '{}');
      if (body.destinationAsset === 'nep141:hood.omft.near') {
        return jsonResponse({ quote: { amountOut: '177000000000000000', amountOutFormatted: '0.177', amountInUsd: '325', amountOutUsd: '324' } });
      }
      return jsonResponse({ message: 'No liquidity available' }, 400, 'Bad Request');
    }
    if (url.includes('aggregator-api.kyberswap.com/robinhood/api/v1/routes')) {
      return jsonResponse({
        code: 0,
        data: { routeSummary: { amountOut: '2710000000000000000000', amountInUsd: '324', amountOutUsd: '320' } }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const ponsHood = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PONS' && t.blockchain === 'hood');
    const q = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: { symbol: 'NEAR', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 },
      toToken: ponsHood,
      amountRaw: '100000000000000000000000000',
      recipient: '0x1111111111111111111111111111111111111111',
      refundTo: 'alice.near',
      nearAccountId: 'alice.near',
      evmAddress: '0x1111111111111111111111111111111111111111'
    });
    assert.equal(q.ok, true);
    assert.equal(q.compositeType, 'CROSS_CHAIN_TO_EVM_DEX');
    assert.equal(q.amountOut, '2710000000000000000000');
    assert.ok(q.routeLabel.includes('HOOD') && q.routeLabel.includes('KyberSwap'));
  });
});

test('Arc Network: EVM_CHAINS.arc config, balance pre-validation, and USDC-only grouping without fake ARC coin', async () => {
  assert.equal(chainContracts.EVM_CHAINS.arc.chainId, 5042);
  assert.equal(chainContracts.EVM_CHAINS.arc.symbol, 'USDC');
  assert.equal(chainContracts.EVM_CHAINS.arc.rpc, 'https://rpc.mainnet.arc.io');

  await withMockedStorage({}, async () => {
    const w = state.normalizeWalletRecord({
      id: 'w_arc',
      name: 'ArcTest',
      mnemonic: TEST_MNEMONIC,
      nativeBalances: { arc: 12.5 }
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.syncWalletCompatBalances(w);

    assert.throws(
      () => chainContracts.validateSufficientChainBalance({ wallet: w, chain: 'arc', tokenSymbol: 'USDC', amount: 12.5, isNative: true }),
      (err) => err.code === 'INSUFFICIENT_BALANCE' && /USDC/.test(err.message)
    );
    const valid = chainContracts.validateSufficientChainBalance({ wallet: w, chain: 'arc', tokenSymbol: 'USDC', amount: 5, isNative: true });
    assert.equal(valid.ok, true);

    const groups = uiController.buildAggregatedAssetGroups(w);
    const arcFakeGroup = groups.find((g) => g.symbolKey === 'ARC');
    assert.equal(arcFakeGroup, undefined, 'Home asset groups must NEVER show a fake ARC token');
    const usdcGroup = groups.find((g) => g.symbolKey === 'USDC');
    assert.ok(usdcGroup, 'Funded Arc native balance must group under USDC');
    const arcEntry = usdcGroup.entries.find((e) => e.blockchain === 'arc');
    assert.ok(arcEntry);
    assert.equal(arcEntry.balance, 12.5);
    assert.equal(arcEntry.assetId, 'arc:native:usdc');
  });
});

test('v1.8: Official QTC icon, zero ref-new-1 S3 URLs, sanitizeImageUrl SVG/base64, ft_metadata hydration & receipt token filtering', async () => {
  assert.ok(
    tokenRegistry.TOKEN_ICON_MAP.QTC.startsWith('https://')
  );
  for (const [sym, url] of Object.entries(tokenRegistry.TOKEN_ICON_MAP)) {
    assert.equal(String(url).includes('ref-new-1.s3.amazonaws.com'), false, `TOKEN_ICON_MAP.${sym} must not use 403 S3 URL`);
  }

  assert.ok(tokenRegistry.sanitizeImageUrl('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E'));
  assert.ok(tokenRegistry.sanitizeImageUrl('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5" fill="#fff"/></svg>').startsWith('data:image/svg+xml;utf8,'));
  assert.equal(tokenRegistry.sanitizeImageUrl('data:image/svg+xml,<svg onload="alert(1)"><script>alert(1)</script></svg>'), '');
  assert.equal(tokenRegistry.sanitizeImageUrl('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='), '');

  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/tokens')) {
      return jsonResponse([
        { assetId: 'nep141:853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near', symbol: 'FRAX', blockchain: 'near', contractAddress: '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near', decimals: 18, price: 1.0 },
        { assetId: 'nep141:stjack.tkn.primitives.near', symbol: 'STJACK', blockchain: 'near', contractAddress: 'stjack.tkn.primitives.near', decimals: 18, price: 0.01 },
        { assetId: 'nep141:strkbtc.omdep.near', symbol: 'strkBTC', blockchain: 'near', decimals: 8, price: 90000 },
        { assetId: 'nep141:gtusdcp.omft.near', symbol: 'gtUSDCp', blockchain: 'base', decimals: 6, price: 1.0 }
      ]);
    }
    if (url.includes('free.rpc.fastnear.com')) {
      const body = JSON.parse(opts.body || '{}');
      const acct = body?.params?.account_id;
      if (acct === '853d955acef822db058eb8505911ed77f175b99e.factory.bridge.near') {
        const metaBytes = [...Buffer.from(JSON.stringify({ symbol: 'FRAX', icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E' }), 'utf8')];
        return jsonResponse({ jsonrpc: '2.0', result: { result: metaBytes } });
      }
    }
    if (url.includes('indexer.ref.finance/list-token')) {
      return jsonResponse({ 'frax.near': { symbol: 'FRAX', icon: 'https://ref-new-1.s3.amazonaws.com/token/bad.svg' } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const live = await nearIntents.fetchLiveDefuseTokenPrices();
    assert.ok(Array.isArray(live));
    const frax = live.find((t) => t.symbol === 'FRAX');
    assert.ok(frax, 'FRAX must remain in live tokens');
    assert.ok(frax.logoURI && frax.logoURI.startsWith('data:image/svg+xml'), 'FRAX must receive self-contained ft_metadata SVG icon');
    assert.equal(frax.logoURI.includes('ref-new-1.s3.amazonaws.com'), false, 'Broken S3 icon must never override');
    for (const dead of ['STJACK', 'strkBTC', 'gtUSDCp']) {
      assert.equal(live.some((t) => t.symbol === dead), false, `${dead} must be filtered`);
    }
  });
});

test('v1.8: Favorite tokens bar, Arc receive/hub/picker support, no xStocks filter pill, no mining sweep card', async () => {
  const { readPreactAppSources } = require('./helpers.js');
  const appUi = readPreactAppSources();
  assert.ok(appUi.includes('id="token-picker-favorites"'), 'Preact app UI must contain #token-picker-favorites');
  assert.equal(appUi.includes('mining-sweep-amount'), false, '#sheet-mining-pro must not contain redundant sweep card');
  assert.equal(appUi.includes('mining-sweep-dest'), false, '#sheet-mining-pro must not contain redundant sweep dropdown');
  assert.ok(Array.isArray(tokenRegistry.DEX_CHAIN_TOKENS.arc) && tokenRegistry.DEX_CHAIN_TOKENS.arc[0].symbol === 'USDC');

  await withMockedStorage({}, async (storage) => {
    const w = state.normalizeWalletRecord({
      id: 'w_v18',
      name: 'V18Wallet',
      mnemonic: TEST_MNEMONIC,
      nearAddress: 'a'.repeat(64)
    });
    state.wallets = [w];
    state.activeWalletId = w.id;
    state.loadFavoriteTokens();
    assert.ok(state.favoriteTokenIds.includes('nep141:wrap.near'));

    const favNvdaxId = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
    assert.equal(state.toggleFavoriteTokenId(favNvdaxId), true);
    assert.ok(JSON.parse(storage.getItem(state.FAV_TOKENS_STORAGE_KEY)).includes(favNvdaxId));
    assert.equal(state.toggleFavoriteTokenId(favNvdaxId), false);
    assert.equal(JSON.parse(storage.getItem(state.FAV_TOKENS_STORAGE_KEY)).includes(favNvdaxId), false);

    const prevDoc = globalThis.document;
    const makeClassList = () => ({ add() {}, remove() {}, toggle() {} });
    const domNodes = {
      'token-picker-search': { value: '' },
      'token-picker-favorites': { innerHTML: '', classList: makeClassList() },
      'token-picker-chains': { innerHTML: '' },
      'token-picker-list': { innerHTML: '' },
      'sheet-receive': { classList: makeClassList(), setAttribute() {} },
      'modal-backdrop': { classList: makeClassList() },
      'receive-network-pills': { innerHTML: '' },
      'receive-addr-label': { textContent: '' },
      'receive-addr-value': { textContent: '' },
      'receive-qr-container': { innerHTML: '' },
      'hub-near-current-id': { textContent: '' },
      'hub-mpc-evm-address': { textContent: '' },
      'hub-addresses-list': { innerHTML: '' }
    };
    globalThis.document = {
      body: { style: {} },
      getElementById(id) {
        return domNodes[id] || null;
      },
      querySelectorAll() {
        return [];
      }
    };
    try {
      uiController.renderTokenPickerList();
      assert.ok(domNodes['token-picker-favorites'].innerHTML.includes('data-action="select-swap-token"'));
      assert.ok(domNodes['token-picker-chains'].innerHTML.includes('data-action="set-picker-chain" data-chain="arc"'));
      assert.equal(domNodes['token-picker-chains'].innerHTML.includes('data-chain="xstock"'), false, 'xStocks filter pill must be removed');
      assert.ok(domNodes['token-picker-list'].innerHTML.includes('data-action="toggle-fav-token"'));

      uiController.openReceiveSheet('arc');
      assert.ok(domNodes['receive-network-pills'].innerHTML.includes('data-action="select-receive-network" data-net="evm"'));
      assert.ok(domNodes['receive-network-pills'].innerHTML.includes('EVM (ETH / Base / ARB / OP / POL / BSC / Arc)'));
      assert.equal(domNodes['receive-network-pills'].innerHTML.includes('data-net="arc"'), false);
      assert.equal(domNodes['receive-addr-value'].textContent, w.mpcEvmAddress);

      uiController.switchTab('hub');
      assert.ok(domNodes['hub-addresses-list'].innerHTML.includes('EVM (ETH / Base / ARB / OP / POL / BSC / Arc)'));
      assert.equal(domNodes['hub-addresses-list'].innerHTML.includes('Arc Network (USDC'), false);
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  });
});

test('v1.9: Whitish Circle Arc icon/badge, QTC orange badge, 18 Arc Mainnet tokens, & Kyber/LI.FI live discovery', async () => {
  const arcMeta = tokenRegistry.getChainMeta('arc');
  assert.equal(arcMeta.color, '#F8FAFC');
  assert.equal(arcMeta.textColor, '#0F172A');
  assert.ok(arcMeta.logoUrl.endsWith('/arc-dark.svg'));
  assert.ok(arcMeta.fallbackLogoUrl.startsWith('data:image/svg+xml;base64,'));
  assert.ok(arcMeta.badgeSvg.includes('#F8FAFC') && arcMeta.badgeSvg.includes('#0F172A'));

  const qtcMeta = tokenRegistry.getChainMeta('qtc');
  assert.ok(qtcMeta.badgeSvg.includes('#F97316') && qtcMeta.badgeSvg.includes('#0A0A0A'));
  assert.equal(qtcMeta.badgeSvg.includes('#00F5D4'), false, 'QTC badge must not use cyan atom styling');

  const arcList = tokenRegistry.DEX_CHAIN_TOKENS.arc || [];
  assert.ok(arcList.length >= 18, 'DEX_CHAIN_TOKENS.arc must contain at least 18 real Arc Mainnet tokens');
  for (const sym of ['USDC', 'EURC', 'cirBTC', 'WETH', 'CRCL', 'AF', 'ARCMAN', 'ARCOON', 'ARGUS', 'ASTOCK', 'TOLLY', 'FAZE', 'KAIRO', 'LONG', 'oBrain', 'MALA', 'DUKE', 'ARCUS']) {
    assert.ok(arcList.some((t) => t.symbol === sym), `DEX_CHAIN_TOKENS.arc must include ${sym}`);
  }
  const arcUsdc = arcList.find((t) => t.symbol === 'USDC');
  assert.equal(String(arcUsdc.contractAddress).toLowerCase(), '0x3600000000000000000000000000000000000000');
  assert.equal(arcUsdc.decimals, 6);
  assert.equal(arcList.some((t) => String(t.symbol).toUpperCase() === 'ARC'), false, 'Arc catalog must NEVER expose a fake ARC token');

  for (const sym of ['EURC', 'WUSDC', 'XYUSDC', 'USYC', 'CIRBTC', 'RAY', 'VIRTUAL', 'DEGEN', 'PENDLE', 'FDUSD', 'BTCB']) {
    assert.ok(tokenRegistry.TOKEN_ICON_MAP[sym], `TOKEN_ICON_MAP must include ${sym}`);
  }

  await withMockedFetch(async (url) => {
    if (url.includes('1click.chaindefuser.com/v0/tokens')) {
      return jsonResponse([
        { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.25 },
        { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', symbol: 'USDC', blockchain: 'near', contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, price: 1.0 }
      ]);
    }
    if (url.includes('ks-setting.kyberswap.com/api/v1/tokens')) {
      return jsonResponse({
        data: {
          tokens: [
            { chainId: 8453, address: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b', symbol: 'VIRTUAL', name: 'Virtuals Protocol', decimals: 18, logoURI: 'https://cdn.example.org/virtual.png' },
            { chainId: 5042, address: '0x000000000000000000000000000000000000dead', symbol: 'ARC', name: 'Fake ARC', decimals: 18 },
            { chainId: 5042, address: '0x1111111111111111111111111111111111111111', symbol: 'ARCNEW', name: 'Arc New Mainnet', decimals: 18, logoURI: 'https://cdn.example.org/arcnew.png' }
          ]
        }
      });
    }
    if (url.includes('li.quest/v1/tokens')) {
      return jsonResponse({
        tokens: {
          5042: [
            { chainId: 5042, address: '0x1B11111111111111111111111111111111111111', symbol: 'CRCL', name: 'Circle Stock', decimals: 18, priceUSD: '105.42', logoURI: 'https://cdn.example.org/crcl.png' },
            { chainId: 5042, address: '0x000000000000000000000000000000000000beef', symbol: 'ARC', name: 'Fake ARC', decimals: 18, priceUSD: '9.99' },
            { chainId: 5042, address: '0x2222222222222222222222222222222222222222', symbol: 'LIFINEW', name: 'Lifi Arc Token', decimals: 6, priceUSD: '2.50', logoURI: 'https://cdn.example.org/lifinew.png' }
          ]
        }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const live = await nearIntents.fetchLiveDefuseTokenPrices();
    assert.ok(live.some((t) => t.blockchain === 'base' && t.symbol === 'VIRTUAL'));
    assert.ok(live.some((t) => t.blockchain === 'arc' && t.symbol === 'ARCNEW'));
    const lifiToken = live.find((t) => t.blockchain === 'arc' && t.symbol === 'LIFINEW');
    assert.ok(lifiToken, 'LI.FI Arc Mainnet discovery must merge new tokens');
    assert.equal(lifiToken.price, 2.5);
    assert.equal(lifiToken.logoURI, 'https://cdn.example.org/lifinew.png');
    assert.equal(live.some((t) => String(t.symbol).toUpperCase() === 'ARC'), false, 'Fake ARC symbol must never enter catalog');
  });
});

test('v1.9: Arc Mainnet (5042) same-chain Kyber vs LI.FI multi-pool quoting & cross-chain Relay/LI.FI/1Click routing', async () => {
  assert.equal(chainContracts.EVM_CHAINS.arc.chainId, 5042);
  assert.equal(chainContracts.EVM_CHAINS.arc.kyber, 'arc');
  assert.equal(chainContracts.EVM_CHAINS.arc.explorer, 'https://explorer.arc.io/tx/');
  assert.equal(chainContracts.EVM_CHAINS.arc.gasReserve, 0.02);

  // 1. Same-chain Arc Mainnet quote: native 0xEeee... (18 dec) normalized to 0x3600...0000 (6 dec), competing KyberSwap vs LI.FI
  let seenKyberAmount = null;
  let seenKyberTokenIn = null;
  let seenLifiAmount = null;
  await withMockedFetch(async (url) => {
    if (url.includes('aggregator-api.kyberswap.com/arc/api/v1/routes')) {
      const u = new URL(url);
      seenKyberTokenIn = u.searchParams.get('tokenIn');
      seenKyberAmount = u.searchParams.get('amountIn');
      return jsonResponse({
        code: 0,
        data: {
          routerAddress: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
          routeSummary: {
            tokenIn: seenKyberTokenIn,
            amountIn: seenKyberAmount,
            amountOut: '908399'
          }
        }
      });
    }
    if (url.includes('li.quest/v1/quote')) {
      const u = new URL(url);
      seenLifiAmount = u.searchParams.get('fromAmount');
      return jsonResponse({
        estimate: { toAmount: '906128', approvalAddress: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' },
        transactionRequest: { to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', data: '0xabcdef', value: '0x0' }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const eurcQuote = await chainContracts.quoteEvmDexSwap({
      chainKey: 'arc',
      srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      destToken: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
      amountRaw: '1000000000000000000', // 1 USDC in 18 dec -> must normalize to 1000000 (6 dec)
      srcDecimals: 18,
      destDecimals: 6,
      fromAddress: '0xa2869D3977DEa9afc9B9c069491ac08F06F9e458'
    });
    assert.equal(seenKyberTokenIn?.toLowerCase(), '0x3600000000000000000000000000000000000000');
    assert.equal(seenKyberAmount, '1000000');
    assert.equal(seenLifiAmount, '1000000');
    assert.equal(eurcQuote.ok, true);
    assert.equal(eurcQuote.bestSource, 'KyberSwap');
    assert.equal(eurcQuote.routeSource, 'kyber');
    assert.ok(eurcQuote.comparedPools >= 2, 'Arc Mainnet USDC->EURC must compare KyberSwap and LI.FI');
    assert.equal(eurcQuote.amountOut, '908399');
  });

  // 2. Cross-chain Arc Mainnet quoting: NEAR->Arc USDC, NEAR->Arc EURC, Base USDC->Arc USDC, Arc USDC->NEAR
  const nearTok = { symbol: 'NEAR', assetId: 'nep141:wrap.near', blockchain: 'near', decimals: 24 };
  const arcUsdcTok = { symbol: 'USDC', assetId: 'arc:0x3600000000000000000000000000000000000000', blockchain: 'arc', contractAddress: '0x3600000000000000000000000000000000000000', decimals: 6 };
  const arcEurcTok = { symbol: 'EURC', assetId: 'arc:0x89b50855aa3be2f677cd6303cec089b5f319d72a', blockchain: 'arc', contractAddress: '0x89b50855aa3be2f677cd6303cec089b5f319d72a', decimals: 6 };
  const baseUsdcTok = { symbol: 'USDC', assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near', blockchain: 'base', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 };

  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const body = JSON.parse(opts.body || '{}');
      if (String(body.destinationAsset || '').includes('base')) {
        return jsonResponse({
          quote: { depositAddress: 'base-dep.intents.near', amountOut: '3250000', timeEstimate: 15, amountOutUsd: '3.25' },
          correlationId: 'cid-near-base'
        });
      }
      return jsonResponse({
        quote: { depositAddress: 'near-dep.intents.near', amountOut: '1000000000000000000000000', timeEstimate: 15, amountOutUsd: '3.25' },
        correlationId: 'cid-base-near'
      });
    }
    if (url.includes('api.relay.link/quote')) {
      const body = JSON.parse(opts.body || '{}');
      const outAmt = body.originChainId === 5042 ? '3150000' : '3177801';
      return jsonResponse({
        steps: [{ id: 'deposit', items: [{ data: { to: '0x1111111111111111111111111111111111111111', data: '0x1234', value: '0', chainId: body.originChainId } }] }],
        details: { currencyOut: { amount: outAmt } }
      });
    }
    if (url.includes('li.quest/v1/quote')) {
      const u = new URL(url);
      const fromAmt = BigInt(u.searchParams.get('fromAmount') || '1000000');
      const outAmt = (fromAmt * 95n / 100n).toString();
      return jsonResponse({
        estimate: { toAmount: outAmt, approvalAddress: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE' },
        transactionRequest: { to: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE', data: '0x9999', value: '0x0' }
      });
    }
    if (url.includes('aggregator-api.kyberswap.com/arc/api/v1/routes')) {
      return jsonResponse({
        code: 0,
        data: { routerAddress: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5', routeSummary: { amountOut: '2886000' } }
      });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const q1 = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: nearTok,
      toToken: arcUsdcTok,
      amountRaw: '1000000000000000000000000',
      recipient: '0xabc0000000000000000000000000000000000001',
      refundTo: 'alice.near',
      nearAccountId: 'alice.near',
      evmAddress: '0xabc0000000000000000000000000000000000001'
    });
    assert.equal(q1.ok, true);
    assert.equal(q1.compositeType, 'CROSS_CHAIN_TO_ARC_MAINNET');
    assert.ok(q1.stage1Quote && q1.bridgeQuote);
    assert.equal(q1.amountOut, '3177801');

    const q2 = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: nearTok,
      toToken: arcEurcTok,
      amountRaw: '1000000000000000000000000',
      recipient: '0xabc0000000000000000000000000000000000001',
      refundTo: 'alice.near',
      nearAccountId: 'alice.near',
      evmAddress: '0xabc0000000000000000000000000000000000001'
    });
    assert.equal(q2.ok, true);
    assert.equal(q2.compositeType, 'CROSS_CHAIN_TO_ARC_MAINNET');
    assert.ok(q2.stage1Quote && q2.bridgeQuote && q2.dexQuote);
    assert.ok(q2.comparedPools >= 2);
    assert.equal(q2.amountOut, '3018910'); // LI.FI (3018910) beats mocked KyberSwap (2886000)

    const q3 = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: baseUsdcTok,
      toToken: arcUsdcTok,
      amountRaw: '3250000',
      recipient: '0xabc0000000000000000000000000000000000001',
      refundTo: '0xabc0000000000000000000000000000000000001',
      nearAccountId: 'alice.near',
      evmAddress: '0xabc0000000000000000000000000000000000001'
    });
    assert.equal(q3.ok, true);
    assert.equal(q3.compositeType, 'EVM_TO_ARC_MAINNET');
    assert.ok(q3.bridgeQuote);
    assert.equal(q3.amountOut, '3177801');

    const q4 = await nearIntents.quoteCrossChainWithDexRelay({
      fromToken: arcUsdcTok,
      toToken: nearTok,
      amountRaw: '3250000',
      recipient: 'alice.near',
      refundTo: '0xabc0000000000000000000000000000000000001',
      nearAccountId: 'alice.near',
      evmAddress: '0xabc0000000000000000000000000000000000001'
    });
    assert.equal(q4.ok, true);
    assert.equal(q4.compositeType, 'ARC_MAINNET_TO_CROSS_CHAIN');
    assert.ok(q4.bridgeQuote && q4.stage3Quote);
    assert.equal(q4.amountOut, '1000000000000000000000000');
  });
});

test('v1.9 Requirement #5: Rhea Ecosystem tokens (RHEA/rNEAR/xRHEA/oRHEA) registry, ft_metadata icons, live prices & Ref/DCL swap', async () => {
  const nearTokens = tokenRegistry.DEX_CHAIN_TOKENS.near || [];
  const expectedRhea = [
    { symbol: 'RHEA', contract: 'token.rhealab.near', decimals: 18 },
    { symbol: 'rNEAR', contract: 'lst.rhealab.near', decimals: 24 },
    { symbol: 'xRHEA', contract: 'xtoken.rhealab.near', decimals: 18 },
    { symbol: 'oRHEA', contract: 'otoken.rhealab.near', decimals: 18 }
  ];
  for (const item of expectedRhea) {
    const hit = nearTokens.find((t) => t.symbol === item.symbol);
    assert.ok(hit, `DEX_CHAIN_TOKENS.near must include ${item.symbol}`);
    assert.equal(hit.contractAddress, item.contract);
    assert.equal(hit.decimals, item.decimals);
    assert.equal(nearIntents.DEFAULT_NEAR_NEP141_CONTRACTS[item.contract], item.decimals);
  }

  const fakeSvgIcon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiPjwvc3ZnPg==';
  const rheaRef = nearTokens.find((t) => t.symbol === 'RHEA');
  const prevRheaPrice = rheaRef.price;
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('1click.chaindefuser.com/v0/tokens')) {
        return jsonResponse([{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.2 }]);
      }
      if (url.includes('indexer.ref.finance/list-token-price')) {
        return jsonResponse({
          'token.rhealab.near': { price: '0.0322', symbol: 'RHEA', decimal: 18 },
          'lst.rhealab.near': { price: '3.42', symbol: 'rNEAR', decimal: 24 },
          'xtoken.rhealab.near': { price: '0.0360', symbol: 'XRHEA', decimal: 18 },
          'otoken.rhealab.near': { price: '0.0194', symbol: 'ORHEA', decimal: 18 }
        });
      }
      if ((url.includes('fastnear.com') || url.includes('rpc.mainnet.near.org')) && opts?.body) {
        const b = JSON.parse(opts.body);
        if (b?.params?.method_name === 'ft_metadata') {
          const acc = b.params.account_id;
          const bytes = [...Buffer.from(JSON.stringify({ symbol: acc.split('.')[0].toUpperCase(), icon: fakeSvgIcon }), 'utf8')];
          return jsonResponse({ jsonrpc: '2.0', result: { result: bytes } });
        }
      }
      if (url.includes('smartrouter.ref.finance/findPath')) {
        return jsonResponse({
          result_code: 0,
          result_data: {
            amount_out: '10018446387477801536748',
            routes: [{ pools: [{ pool_id: 9999, token_in: 'token.rhealab.near', token_out: 'wrap.near', min_amount_out: '9900000000000000000000' }] }]
          }
        });
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      await nearIntents.fetchLiveDefuseTokenPrices();
      assert.equal(rheaRef.price, 0.0322, 'RHEA price must hydrate from indexer.ref.finance/list-token-price');
      assert.ok(rheaRef.logoURI && /^data:image\/(?:png|svg\+xml);base64,/.test(rheaRef.logoURI));
      assert.ok(/^data:image\/(?:png|svg\+xml);base64,/.test(tokenRegistry.resolveTokenIcon(rheaRef).primaryUrl));

      const swapQ = await nearIntents.quoteBestNearPairSwap({
        fromToken: rheaRef,
        toToken: nearTokens.find((t) => t.symbol === 'NEAR'),
        amountRaw: '1000000000000000000',
        recipient: 'alice.near',
        nearAccountId: 'alice.near'
      });
      assert.equal(swapQ.ok, true);
      assert.equal(swapQ.amountOut, '10018446387477801536748');
    });
  } finally {
    rheaRef.price = prevRheaPrice;
  }
});

test('v1.9 Requirement #6: Rhea 3 pools + 16-pool Staking Hub live rates, tx signing, pre-validation, search & filter UI', async () => {
  const rpcJsonBytes = (obj) => [...Buffer.from(JSON.stringify(obj), 'utf8')];
  const padHex = (v) => `0x${BigInt(v).toString(16).padStart(64, '0')}`;

  await withMockedFetch(async (url, opts) => {
    if ((url.includes('rpc.mainnet.near.org') || url.includes('near.drpc.org')) && opts?.body) {
      const b = JSON.parse(opts.body);
      const acc = b?.params?.account_id;
      const m = b?.params?.method_name;
      if (acc === 'lst.rhealab.near' && m === 'get_summary') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes({ ft_price: '1069637344361771804257671' }) } });
      }
      if (acc === 'xtoken.rhealab.near' && m === 'get_virtual_price') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('111881575') } });
      }
      if (acc === 'xtoken.rhealab.near' && m === 'contract_metadata') {
        return jsonResponse({
          jsonrpc: '2.0',
          result: { result: rpcJsonBytes({ reward_per_sec: '160108024691358040', cur_locked_token_amount: '136117762726615079773327417' }) }
        });
      }
      if (acc === 'orhea-conv.rhealab.near' && m === 'get_conversion_strategy_infos') {
        return jsonResponse({
          jsonrpc: '2.0',
          result: {
            result: rpcJsonBytes({
              '{"Oneshot":{"lock_period_days":15,"source_token_id":"otoken.rhealab.near","target_token_id":"token.rhealab.near"}}': { conversion_rate: '500000000000000000000000000000' },
              '{"Oneshot":{"lock_period_days":45,"source_token_id":"otoken.rhealab.near","target_token_id":"token.rhealab.near"}}': { conversion_rate: '600000000000000000000000000000' },
              '{"Oneshot":{"lock_period_days":91,"source_token_id":"otoken.rhealab.near","target_token_id":"token.rhealab.near"}}': { conversion_rate: '700000000000000000000000000000' },
              '{"Oneshot":{"lock_period_days":181,"source_token_id":"otoken.rhealab.near","target_token_id":"token.rhealab.near"}}': { conversion_rate: '1000000000000000000000000000000' }
            })
          }
        });
      }
      if (acc === 'linear-protocol.near' && m === 'ft_price') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('1431741150062675486967391') } });
      }
      if (acc === 'v2-nearx.stader-labs.near' && m === 'get_nearx_price') {
        return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('1836624380879012817590929') } });
      }
    }
    if (url.includes('api.ref.finance/get-rnear-apy')) {
      return jsonResponse({ code: 0, data: '4.489928', msg: 'success' });
    }
    if (url.includes('validators.narwallets.com/metrics_json')) {
      return jsonResponse({ st_near_30_day_apy: 4.07, st_near_price: 1.515, linear_30_day_apy: 4.25 });
    }
    if (url.includes('yields.llama.fi/pools')) {
      return jsonResponse({
        data: [
          { chain: 'Solana', project: 'jito-liquid-staking', symbol: 'JITOSOL', apy: 4.94, tvlUsd: 700000000 },
          { chain: 'Solana', project: 'jupiter-staked-sol', symbol: 'JUPSOL', apy: 5.15, tvlUsd: 370000000 },
          { chain: 'Solana', project: 'marinade-liquid-staking', symbol: 'MSOL', apy: 5.71, tvlUsd: 160000000 },
          { chain: 'Solana', project: 'sanctum-infinity', symbol: 'INF', apy: 5.41, tvlUsd: 136000000 },
          { chain: 'Ethereum', project: 'ethena-usde', symbol: 'SUSDE', apy: 5.32, tvlUsd: 1180000000 },
          { chain: 'Hyperliquid L1', project: 'kinetiq-khype', symbol: 'KHYPE', apy: 1.84, tvlUsd: 672000000 },
          { chain: 'Base', project: 'aave-v3', symbol: 'USDC', apy: 6.24, tvlUsd: 13400000 },
          { chain: 'Arc', project: 'morpho-blue', symbol: 'STEAKUSDC', apy: 3.61, tvlUsd: 5291000 }
        ]
      });
    }
    if (url.includes('extra-api.sanctum.so/v1/sol-value/current')) {
      return jsonResponse({ solValues: { INF: '1407837461', JitoSOL: '1275866054', jupSOL: '1183944980', mSOL: '1376648063' } });
    }
    if (url.includes('datapi.jup.ag/v1/assets/search')) {
      return jsonResponse([
        { id: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP', holderCount: 836170, totalSupply: 6861485665, mcap: 842182762 },
        { id: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', symbol: 'JupSOL', holderCount: 33656, totalSupply: 4225676, mcap: 372660499 },
        { id: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', symbol: 'JitoSOL', holderCount: 184253, totalSupply: 7721878, mcap: 734504232 }
      ]);
    }
    if (url.includes('solana') && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b.method === 'getAccountInfo' && b.params?.[0] === 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN') {
        const buf = Buffer.alloc(100);
        buf.writeBigUInt64LE(1174883785710397n, 73);
        return jsonResponse({ jsonrpc: '2.0', result: { value: { data: [buf.toString('base64'), 'base64'] } } });
      }
    }
    if (url.includes('rpc.mainnet.arc.io')) {
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: padHex(996425985202804641n) });
    }
    if (url.includes('aggregator-api.kyberswap.com/hyperevm/api/v1/routes')) {
      return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '973407907372663296' } } });
    }
    if (url.includes('eth-api.lido.fi')) {
      return jsonResponse({ data: { smaApr: 3.12 } });
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const pools = await chainContracts.fetchAllStakingRates();
    assert.equal(pools.length, 21);
    const byId = Object.fromEntries(pools.map((p) => [p.id, p]));
    assert.equal(byId.rhea_rnear.apy, 4.49);
    assert.ok(Math.abs(byId.rhea_rnear.rate - 1 / 1.069637) < 0.001);
    assert.equal(byId.rhea_xrhea.apy, 3.71);
    assert.ok(Math.abs(byId.rhea_xrhea.rate - 1 / 1.11881575) < 0.001);
    assert.equal(byId.rhea_orhea_convert.lockTiers.length, 4);
    assert.equal(byId.rhea_orhea_convert.lockTiers[0].rate, 0.5);
    assert.equal(byId.rhea_orhea_convert.lockTiers[3].rate, 1.0);
    assert.equal(byId.jupiter_jup.inSymbol, 'JUP');
    assert.equal(byId.jupiter_jup.outSymbol, 'Staked JUP');
    assert.equal(byId.jupiter_jup.rate, 1.0);
    assert.equal(byId.jupiter_jup.apy, null);
    assert.equal(byId.jupiter_jup.isAsrEstimated, false);
    assert.equal(byId.jupiter_jup.stakersCount, 836170);
    assert.ok(byId.jupiter_jup.tvlText && byId.jupiter_jup.tvlText.includes('JUP'));
    assert.equal(byId.jupiter_sol.apy, 5.15);
    assert.equal(byId.jupiter_sol.stakersCount, 33656);
    assert.equal(byId.arc_steak_usdc.apy, 3.61);
    assert.ok(Math.abs(byId.arc_steak_usdc.rate - 0.996425) < 0.001);

    // Pre-validation & real transaction payloads for Rhea pools
    const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
    const emptyWallet = state.normalizeWalletRecord({
      id: 'w_rhea_empty',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nativeBalances: { near: 0, arc: 0.01 }
    });
    await assert.rejects(
      () => chainContracts.executePoolStake({ wallet: emptyWallet, poolId: 'rhea_xrhea', amount: 10 }),
      (err) => err.code === 'INSUFFICIENT_BALANCE' && /RHEA/.test(err.message)
    );
    await assert.rejects(
      () => chainContracts.executePoolStake({ wallet: emptyWallet, poolId: 'arc_steak_usdc', amount: 1 }),
      (err) => err.code === 'INSUFFICIENT_BALANCE' && /USDC/.test(err.message)
    );

    const fundedWallet = state.normalizeWalletRecord({
      id: 'w_rhea_funded',
      mnemonic: TEST_MNEMONIC,
      nearNamedAccount: 'alice.near',
      nearPublicKey: keys.nearPublicKey,
      nearPrivateKey: keys.nearPrivateKey,
      nativeBalances: { near: 5.0 },
      nearNep141Balances: {
        'token.rhealab.near': { raw: '100000000000000000000', formatted: 100 },
        'otoken.rhealab.near': { raw: '50000000000000000000', formatted: 50 }
      }
    });
    const sentCalls = [];
    const origFnCall = chainContracts.signAndSendNearFunctionCall;
    chainContracts.signAndSendNearFunctionCall = async (params) => {
      sentCalls.push(params);
      return `tx_${params.receiverId}_${params.methodName}`;
    };
    try {
      const r1 = await chainContracts.executePoolStake({ wallet: fundedWallet, poolId: 'rhea_rnear', amount: 2 });
      assert.equal(r1.poolId, 'rhea_rnear');
      assert.equal(sentCalls[0].receiverId, 'lst.rhealab.near');
      assert.equal(sentCalls[0].methodName, 'deposit_and_stake');
      assert.equal(sentCalls[0].depositYocto, chainContracts.toBaseUnits(2, 24));

      const r2 = await chainContracts.executePoolStake({ wallet: fundedWallet, poolId: 'rhea_xrhea', amount: 10 });
      assert.equal(r2.poolId, 'rhea_xrhea');
      assert.equal(sentCalls[1].receiverId, 'token.rhealab.near');
      assert.equal(sentCalls[1].methodName, 'ft_transfer_call');
      const args2 = JSON.parse(sentCalls[1].argsJson);
      assert.equal(args2.receiver_id, 'xtoken.rhealab.near');

      const r3 = await chainContracts.executePoolStake({ wallet: fundedWallet, poolId: 'rhea_orhea_convert', amount: 10, lockDays: 91 });
      assert.equal(r3.poolId, 'rhea_orhea_convert');
      assert.equal(sentCalls[2].receiverId, 'otoken.rhealab.near');
      assert.equal(sentCalls[2].methodName, 'ft_transfer_call');
      const args3 = JSON.parse(sentCalls[2].argsJson);
      assert.equal(args3.receiver_id, 'orhea-conv.rhealab.near');
      assert.deepEqual(JSON.parse(args3.msg), {
        Oneshot: {
          lock_period_days: 91,
          source_token_id: 'otoken.rhealab.near',
          target_token_id: 'token.rhealab.near'
        }
      });
    } finally {
      chainContracts.signAndSendNearFunctionCall = origFnCall;
    }

    // Verify UI search, filters & oRHEA lock period selector
    const makeClassList = () => {
      const set = new Set(['hidden']);
      return {
        add: (...c) => c.forEach((x) => set.add(x)),
        remove: (...c) => c.forEach((x) => set.delete(x)),
        toggle: (c, force) => (force === undefined ? (set.has(c) ? set.delete(c) : set.add(c)) : (force ? set.add(c) : set.delete(c))),
        has: (c) => set.has(c)
      };
    };
    const domNodes = {
      'staking-pools-list': { innerHTML: '' },
      'earn-pool-search': { value: '' },
      'earn-selected-title': { textContent: '' },
      'earn-avail-balance': { textContent: '' },
      'earn-in-symbol': { textContent: '' },
      'earn-live-apy': { textContent: '' },
      'earn-tvl-val': { textContent: '' },
      'earn-stakers-val': { textContent: '' },
      'earn-live-rate': { textContent: '' },
      'earn-amount-in': { value: '10' },
      'earn-est-out': { textContent: '' },
      'earn-lock-row': { classList: makeClassList() },
      'earn-lock-tiers': { innerHTML: '' }
    };
    const prevDoc = globalThis.document;
    globalThis.document = { getElementById: (id) => domNodes[id] || null, querySelectorAll: () => [] };
    try {
      await withMockedStorage({}, async () => {
        state.wallets = [fundedWallet];
        state.activeWalletId = fundedWallet.id;
        state.staking.pools = pools;
        state.staking.filter = 'featured';
        state.staking.search = '';
        state.staking.selectedPoolId = 'rhea_rnear';

        uiController.renderEarnView();
        assert.equal((domNodes['staking-pools-list'].innerHTML.match(/staking-pool-card/g) || []).length, 9, 'Featured pill must render 9 major featured pools');

        uiController.selectStakingPool('jupiter_jup');
        assert.ok(domNodes['earn-tvl-val'].textContent.includes('JUP'));
        assert.equal(domNodes['earn-stakers-val'].textContent, '836,170');

        uiController.setEarnPoolFilter('all');
        assert.equal((domNodes['staking-pools-list'].innerHTML.match(/staking-pool-card/g) || []).length, 21, 'All Pools pill must render all 21 pools');

        // Typing into search must search ALL 16 pools even while featured filter is active
        uiController.setEarnPoolFilter('featured');
        uiController.handleEarnPoolSearch('LiNEAR');
        assert.ok(domNodes['staking-pools-list'].innerHTML.includes('LiNEAR Protocol'));

        uiController.handleEarnPoolSearch('');
        uiController.selectStakingPool('rhea_orhea_convert');
        assert.equal(domNodes['earn-lock-row'].classList.has('hidden'), false, 'Lock period selector must appear for oRHEA Convert');
        domNodes['earn-amount-in'].value = '10';
        uiController.selectEarnLockTier(91);
        assert.equal(domNodes['earn-live-rate'].textContent, '1 oRHEA = 0.7000 RHEA');
        assert.ok(domNodes['earn-est-out'].textContent.startsWith('7 RHEA'));
      });
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  });
});

test('v2.0 Fix 1: formatTokenPrice precision, Arc DexScreener+Kyber pricing & priority order in picker', async () => {
  assert.equal(uiController.formatTokenPrice(null), '--');
  assert.equal(uiController.formatTokenPrice(0), '--');
  assert.equal(uiController.formatTokenPrice(54.75), '$54.75');
  assert.equal(uiController.formatTokenPrice(0.0322), '$0.0322');
  assert.equal(uiController.formatTokenPrice(0.00075), '$0.000750');
  assert.equal(uiController.formatTokenPrice(0.000126), '$0.000126');
  assert.equal(uiController.formatTokenPrice(0.00001842), '$0.00001842');
  assert.equal(uiController.formatTokenPrice(0.00075).includes('$0.00 '), false);

  const astockTok = tokenRegistry.DEX_CHAIN_TOKENS.arc.find((t) => t.symbol === 'ASTOCK');
  const arcoonTok = tokenRegistry.DEX_CHAIN_TOKENS.arc.find((t) => t.symbol === 'ARCOON');
  const prevAstockPrice = astockTok.price;
  const prevArcoonPrice = arcoonTok.price;
  astockTok.price = null;
  arcoonTok.price = null;

  try {
    await withMockedFetch(async (url) => {
      if (url.includes('1click.chaindefuser.com/v0/tokens')) {
        return jsonResponse([{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.2 }]);
      }
      if (url.includes('api.dexscreener.com/latest/dex/tokens/') && url.includes('0x4c9b47dbd5933aa4574b2c27f82419e4dbbd0222')) {
        return jsonResponse({
          pairs: [
            { baseToken: { address: '0x4c9b47dbd5933aa4574b2c27f82419e4dbbd0222', symbol: 'ASTOCK' }, priceUsd: '0.000750', liquidity: { usd: 94000 } }
          ]
        });
      }
      if (url.includes('aggregator-api.kyberswap.com/arc/api/v1/routes') && url.includes('0x4621a0baa0b5d97aae77704cf2a84dabe78a4fed')) {
        return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '1251877132499883917312', amountInUsd: '10' } } });
      }
      return jsonResponse({}, 404, 'Not Found');
    }, async () => {
      await nearIntents.fetchLiveDefuseTokenPrices();
      assert.equal(astockTok.price, 0.00075);
      assert.ok(Math.abs(arcoonTok.price - 0.007988) < 0.0002);
    });

    // Verify picker priority order puts USDC, EURC, cirBTC, WETH, CRCL, steakUSDC BEFORE AF/ARCMAN
    const pickerList = { innerHTML: '' };
    const prevDoc = globalThis.document;
    globalThis.document = {
      getElementById: (id) => (id === 'token-picker-list' ? pickerList : id === 'token-picker-search' ? { value: '' } : null),
      querySelectorAll: () => []
    };
    try {
      await withMockedStorage({}, async () => {
        const w = state.normalizeWalletRecord({ id: 'w_arc_pick', mnemonic: TEST_MNEMONIC });
        state.wallets = [w];
        state.activeWalletId = w.id;
        state.swap.pickerChainFilter = 'arc';
        uiController.renderTokenPickerList();
        const symbols = [...pickerList.innerHTML.matchAll(/<span class="asset-sub-name">([^·<]+) ·/g)].map((m) => m[1].trim());
        assert.deepEqual(symbols.slice(0, 6), ['USDC', 'EURC', 'cirBTC', 'WETH', 'CRCL', 'steakUSDC']);
        assert.ok(pickerList.innerHTML.includes('$0.000750'), 'Sub-cent Arc price must show 6 decimals instead of $0.00');
      });
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }
  } finally {
    astockTok.price = prevAstockPrice;
    arcoonTok.price = prevArcoonPrice;
  }
});

test('v2.0 Fix 2: 1 RHEA -> oRHEA via Ref V2 Pool #6573, dynamic pool lookup, 2-hop & DCL pools', async () => {
  const rpcJsonBytes = (obj) => [...Buffer.from(JSON.stringify(obj), 'utf8')];
  await withMockedFetch(async (url, opts) => {
    if (url.includes('smartrouter.ref.finance/findPath')) {
      return jsonResponse({ result_code: 1008, result_message: 'Pool TVL too low', result_data: { routes: [] } });
    }
    if ((url.includes('rpc.mainnet.near.org') || url.includes('near.drpc.org')) && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b?.params?.account_id === 'v2.ref-finance.near' && b?.params?.method_name === 'get_return') {
        const args = JSON.parse(Buffer.from(b.params.args_base64, 'base64').toString('utf8'));
        if (args.pool_id === 6573 && args.token_in === 'token.rhealab.near' && args.token_out === 'otoken.rhealab.near') {
          return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('1438414689682104290') } });
        }
        if (args.pool_id === 6472 && args.token_in === 'xtoken.rhealab.near' && args.token_out === 'token.rhealab.near') {
          return jsonResponse({ jsonrpc: '2.0', result: { result: rpcJsonBytes('1118815750000000000') } });
        }
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const rheaTok = tokenRegistry.DEX_CHAIN_TOKENS.near.find((t) => t.symbol === 'RHEA');
    const orheaTok = tokenRegistry.DEX_CHAIN_TOKENS.near.find((t) => t.symbol === 'oRHEA');
    const xrheaTok = tokenRegistry.DEX_CHAIN_TOKENS.near.find((t) => t.symbol === 'xRHEA');

    const best = await nearIntents.quoteBestNearPairSwap({
      fromToken: rheaTok,
      toToken: orheaTok,
      amountRaw: '1000000000000000000',
      recipient: 'alice.near',
      nearAccountId: 'alice.near'
    });
    assert.equal(best.ok, true);
    assert.equal(best.amountOut, '1438414689682104290');
    assert.equal(best.actions[0].pool_id, 6573);

    // 2-hop Ref V2: xRHEA -> RHEA (#6472) -> oRHEA (#6573)
    const twoHop = await chainContracts.quoteNearRefFinanceSwap({
      tokenIn: xrheaTok.contractAddress,
      tokenOut: orheaTok.contractAddress,
      amountRaw: '1000000000000000000'
    });
    assert.equal(twoHop.ok, true);
    assert.equal(twoHop.actions.length, 2);
    assert.equal(twoHop.actions[0].pool_id, 6472);
    assert.equal(twoHop.actions[1].pool_id, 6573);
    assert.equal(twoHop.amountOut, '1438414689682104290');
  });
});

test('v2.0 Fix 3: Jupiter DAO Staking (JUP -> Staked JUP) PDA derivation, pre-validation & signed tx broadcast', async () => {
  const voterProg = cryptoEngine.base58Decode('voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj');
  const locker = cryptoEngine.base58Decode('CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN');
  const sampleOwner = cryptoEngine.base58Decode('76Xruq2npxNFXYBhw8kyg4bTtfhmn71fTZtzEHVw7RPM');
  const pda = await chainContracts.findSolanaPdaAsync(
    [new TextEncoder().encode('Escrow'), locker, sampleOwner],
    voterProg
  );
  assert.equal(pda.address, 'GamrkyF6eUik7nFYPJ2sKDzicAhZaLebgZr7V4ce9ZME');

  const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const noJupWallet = state.normalizeWalletRecord({
    id: 'w_nojup',
    mnemonic: TEST_MNEMONIC,
    nativeBalances: { sol: 0.1 },
    splBalances: { JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 0 }
  });
  await assert.rejects(
    () => chainContracts.executePoolStake({ wallet: noJupWallet, poolId: 'jupiter_jup', amount: 10 }),
    (err) => err.code === 'INSUFFICIENT_BALANCE' && /JUP/.test(err.message)
  );

  const fundedJupWallet = state.normalizeWalletRecord({
    id: 'w_jup_ok',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keys.nearPublicKey,
    nearPrivateKey: keys.nearPrivateKey,
    nearPrivateSeedHex: keys.nearPrivateSeedHex,
    nativeBalances: { near: 2.0, sol: 0.1 },
    splBalances: { JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 100 }
  });
  state.syncWalletCompatBalances(fundedJupWallet);
  let broadcastedTxB64 = null;
  const dummyBlockHash = cryptoEngine.base58Encode(Buffer.alloc(32, 7));
  const mpcSigSuccessB64 = Buffer.from(JSON.stringify({ signature: Array(64).fill(7) }), 'utf8').toString('base64');
  await withMockedFetch(async (url, opts) => {
    if (url.includes('solana') && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b.method === 'getAccountInfo') return jsonResponse({ jsonrpc: '2.0', result: { value: null } });
      if (b.method === 'getLatestBlockhash') return jsonResponse({ jsonrpc: '2.0', result: { value: { blockhash: cryptoEngine.base58Encode(Buffer.alloc(32, 9)) } } });
      if (b.method === 'sendTransaction') {
        broadcastedTxB64 = b.params[0];
        return jsonResponse({ jsonrpc: '2.0', result: '5jupDaoStakeSig111111111111111111111111111' });
      }
    }
    if ((url.includes('rpc.mainnet.near.org') || url.includes('near.drpc.org')) && opts?.body) {
      const rpc = JSON.parse(opts.body);
      if (rpc.method === 'query' && rpc.params?.request_type === 'view_access_key') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { nonce: 11, block_hash: dummyBlockHash } });
      }
      if (rpc.method === 'broadcast_tx_commit') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { transaction: { hash: 'MPC_JUP_SIGN' }, status: { SuccessValue: mpcSigSuccessB64 } } });
      }
    }
    return jsonResponse({}, 404, 'Not Found');
  }, async () => {
    const res = await chainContracts.executePoolStake({ wallet: fundedJupWallet, poolId: 'jupiter_jup', amount: 25 });
    assert.equal(res.txHash, '5jupDaoStakeSig111111111111111111111111111');
    assert.equal(res.inSymbol, 'JUP');
    assert.equal(res.outSymbol, 'Staked JUP');
    assert.ok(broadcastedTxB64 && Buffer.from(broadcastedTxB64, 'base64').length > 100);
  });
});
