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

test('v6.0 Regression Suite: Bitcoin BIP-86/Taproot, PBKDF2 PIN, Checksums, Multicall3/Ethena, Zero Fake APY, Mining Pro & Server SSRF/XSS', async () => {
  // 1. Bitcoin BIP-86 derivation, Taproot Tx builder + Schnorr verify + dust guard
  const btc1 = await cryptoEngine.deriveBitcoinFromSeedAsync(TEST_MNEMONIC, "m/86'/0'/0'/0/0", true);
  const btc2 = await cryptoEngine.deriveBitcoinFromSeedAsync(TEST_MNEMONIC, "m/86'/0'/0'/0/1", true);
  assert.equal(btc1.address, 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr');
  assert.ok(btc1.tweakedPrivateKeyHex && btc1.pubkeyHex);

  const builtBtc = chainContracts.buildSignedBitcoinTaprootTx({
    fromAddress: btc1.address,
    toAddress: btc2.address,
    amountSats: '50000',
    feeSats: '1500',
    utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
    tweakedPrivateKeyHex: btc1.tweakedPrivateKeyHex
  });
  assert.ok(builtBtc.rawHex.startsWith('020000000001'));
  assert.equal(builtBtc.changeSats, '48500');

  assert.throws(
    () =>
      chainContracts.buildSignedBitcoinTaprootTx({
        fromAddress: btc1.address,
        toAddress: btc2.address,
        amountSats: '200', // below 546 sat dust limit
        feeSats: '1500',
        utxos: [{ txid: 'aa'.repeat(32), vout: 0, value: 100000, status: { confirmed: true } }],
        tweakedPrivateKeyHex: btc1.tweakedPrivateKeyHex
      }),
    /粉尘|dust/i
  );

  // 2. Strict Bech32 / Bech32m / Base58Check checksum rejection
  const mutatedBtc = btc1.address.slice(0, -1) + (btc1.address.endsWith('r') ? 'q' : 'r');
  assert.equal(cryptoEngine.validateChainAddress('btc', mutatedBtc).valid, false);
  const prl1 = (await cryptoEngine.derivePearlFromSeedAsync(TEST_MNEMONIC, "m/86'/808276'/0'/0/0", true)).address;
  const mutatedPrl = prl1.slice(0, -1) + (prl1.endsWith('4') ? '5' : '4');
  assert.equal(cryptoEngine.validatePearlAddress(mutatedPrl).valid, false);
  const validLegacyBtc = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const mutatedLegacyBtc = validLegacyBtc.slice(0, -1) + 'b';
  assert.throws(() => cryptoEngine.base58CheckDecode(mutatedLegacyBtc));
  assert.equal(cryptoEngine.validateChainAddress('btc', mutatedLegacyBtc).valid, false);

  // 3. Legacy PIN/Vault helpers removed (device-native auth only)
  assert.equal(state.hasWalletPin, undefined);
  assert.equal(state.setWalletPinAsync, undefined);
  assert.equal(state.verifyWalletPinAsync, undefined);

  // 4. Multicall3 round-trip & Ethena selectors (0x01320fe2 / 0x35269315)
  const sampleCalls = [
    { target: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', allowFailure: true, callData: '0x70a08231' + '11'.repeat(32) },
    { target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', allowFailure: true, callData: '0x35269315' }
  ];
  const mcEncoded = chainContracts.encodeMulticall3Aggregate3(sampleCalls);
  assert.ok(mcEncoded.startsWith('0x82ad56cb'));

  let capturedMcData = '';
  await withMockedFetch(async (url, opts) => {
    const body = opts?.body ? JSON.parse(opts.body) : null;
    if (body && body.method === 'eth_call' && body.params?.[0]?.to === '0xcA11bde05977b3631167028862bE2a173976CA11') {
      capturedMcData = body.params[0].data;
      const ethersLib = require('../ethers.umd.min.js');
      const mcIface = new ethersLib.Interface(['function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])']);
      const wordOne = '0x' + '00'.repeat(31) + '01';
      const wZero = '0x' + '00'.repeat(32);
      const retHex = mcIface.encodeFunctionResult('aggregate3', [[
        { success: true, returnData: wZero },
        { success: true, returnData: wZero },
        { success: true, returnData: wZero },
        { success: true, returnData: '0x0000000000000000000000000000000000000000000000056bc75e2d63100000' }, // 100 sUSDe
        { success: true, returnData: '0x' + '00'.repeat(32) + '00'.repeat(32) },
        { success: true, returnData: wordOne.slice(0, 66) }
      ]]);
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: retHex });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const evmPos = await chainContracts.fetchEvmAccountStakingPositionsAsync({
      evmAddress: '0xa2869D3977DEa9afc9B9c069491ac08F06F9e458'
    });
    assert.ok(capturedMcData.includes('01320fe2'), 'Multicall3 must use verified cooldowns(address) selector 0x01320fe2');
    assert.ok(capturedMcData.includes('35269315'), 'Multicall3 must use verified cooldownDuration() selector 0x35269315');
    assert.ok(evmPos.some((p) => p.poolId === 'ethena_susde' && p.needsCooldown === true));
  });

  // 5. Zero fake APY & zero 0x1111...1111 placeholder
  await withMockedFetch(async () => jsonResponse({}, 404), async () => {
    const offlinePools = await chainContracts.fetchLiveStakingMetrics({ useCache: false });
    const byId = Object.fromEntries(offlinePools.map((p) => [p.id, p]));
    assert.equal(byId.rhea_orhea_convert.apy, null);
    assert.equal(byId.stader_nearx.apy, null);
    assert.equal(byId.jupiter_jup.apy, null);
  });
  const intentsSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'near-intents.js'), 'utf8');
  assert.equal(intentsSrc.includes('0x1111111111111111111111111111111111111111'), false);

  // 6. Mining Pro: realHashrate NOT scaled by 2^32 & canonical PRLSCAN_TX_EXPLORER_BASE
  assert.equal(miningPro.PRLSCAN_TX_EXPLORER_BASE, 'https://prlscan.com/tx/');
  await withMockedFetch(async (url) => {
    if (url.includes('pearl.herominers.com/api/stats_address')) {
      const nowSec = Math.floor(Date.now() / 1000);
      return jsonResponse({
        stats: { hashrate: 100, balance: '0', paid: '0', minPaymentThreshold: '0' },
        workers: [{ name: 'real-rig', hashrate: 100, realHashrate: 250_000_000_000, lastShare: nowSec, shares_good: 10, shares_invalid: 0, shares_stale: 0 }],
        payments: []
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const heroRes = await miningPro.queryMinerDeepStats(prl1, 'herominers');
    assert.equal(heroRes.workers[0].hashrate30m, 250_000_000_000, 'realHashrate must not be multiplied by 2^32');
  });

  // 7. server.js SSRF & path-traversal protection
  const http = require('http');
  const srv = require('../server.js');
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const port = srv.address().port;
    const rawReq = (reqPath) =>
      new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: reqPath, method: 'GET' }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.end();
      });
    assert.equal(await rawReq('/pearl-proxy?path=//evil.com'), 400);
    assert.equal(await rawReq('/kryptex-proxy?path=/api/../../evil'), 400);
    assert.equal(await rawReq('/.git/config'), 403);
    assert.equal(await rawReq('/../package.json'), 403);
    assert.equal(await rawReq('/%2e%2e/package.json'), 403);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }

  // 8. Zero inline onclick=/onerror=/onchange= & zero PQ remnants in src/ & index.html
  const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'ui-controller.js'), 'utf8');
  const regSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'token-registry.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert.equal(/(?<!\.)\bon(?:click|error|change)\s*=/i.test(uiSrc), false);
  assert.equal(/(?<!\.)\bon(?:click|error|change)\s*=/i.test(regSrc), false);
  for (const src of [uiSrc, htmlSrc]) {
    assert.equal(/ml-dsa|post_quantum|postQuantum|activateUniversalAccount/i.test(src), false);
  }
});

test('v6.1 Audit & Performance Regression Suite: Hydration, SWR Cache, Precheck, Abort, 1Click Native IDs, Mining, SW & Gzip', async () => {
  const zlib = require('zlib');
  const http = require('http');

  // 1. setLiveDefuseTokens syncs prices onto core catalog & resolveTokenIcon prioritizes inline data icons over remote URLs
  const nearCore = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t && t.assetId === 'nep141:wrap.near');
  const prevNearPrice = nearCore ? nearCore.price : null;
  const prevNearUpdatedAt = nearCore ? nearCore.priceUpdatedAt : null;
  const prevLive = state.liveTokens;
  try {
    tokenRegistry.setLiveDefuseTokens([
      {
        assetId: 'nep141:wrap.near',
        symbol: 'NEAR',
        blockchain: 'near',
        decimals: 24,
        price: 3.21,
        priceUpdatedAt: '2026-01-01T00:00:00Z'
      }
    ]);
    assert.equal(nearCore.price, 3.21);
    const ethIcon = tokenRegistry.resolveTokenIcon({
      symbol: 'ETH',
      blockchain: 'eth',
      logoURI: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png'
    });
    assert.equal(ethIcon.primaryUrl, 'https://assets.coingecko.com/coins/images/279/large/ethereum.png');
    assert.ok(ethIcon.fallbackUrl.startsWith('data:image/'));
    const customSvgIcon = tokenRegistry.resolveTokenIcon({
      symbol: 'ETH',
      blockchain: 'eth',
      logoURI: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='
    });
    assert.equal(customSvgIcon.primaryUrl, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
  } finally {
    if (nearCore) {
      nearCore.price = prevNearPrice;
      nearCore.priceUpdatedAt = prevNearUpdatedAt;
    }
    tokenRegistry.setLiveDefuseTokens(Array.isArray(prevLive) ? prevLive : []);
  }

  // 2. state.js: op/pol/avax balance keys, accountType preservation, legacy PIN fields stripped, and 24h SWR cache TTL
  const norm = state.normalizeWalletRecord({
    id: 'w_v61_norm',
    mnemonic: TEST_MNEMONIC,
    accountType: 'imported_key',
    pin: '123456',
    pinHash: 'deadbeef',
    nativeBalances: { op: 1.25, pol: 9.5, avax: 0.75 }
  });
  assert.equal(norm.accountType, 'imported_key');
  assert.equal(norm.pin, undefined);
  assert.equal(norm.pinHash, undefined);
  assert.equal(norm.nativeBalances.op, 1.25);
  assert.equal(norm.nativeBalances.pol, 9.5);
  assert.equal(norm.nativeBalances.avax, 0.75);
  assert.equal(norm.multiBalances.op, 1.25);
  assert.equal(norm.multiBalances.pol, 9.5);
  assert.equal(norm.multiBalances.avax, 0.75);

  await withMockedStorage({
    [state.LIVE_TOKENS_STORAGE_KEY]: JSON.stringify({
      updatedAt: Date.now() - 12 * 3600_000,
      tokens: [{ assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 2.88 }]
    })
  }, async () => {
    const prevList = state.liveTokens;
    try {
      state.liveTokens = [];
      const loaded = state.loadCachedLiveTokens();
      assert.ok(Array.isArray(loaded) && loaded.length === 1);
      assert.equal(loaded[0].price, 2.88);
    } finally {
      state.liveTokens = prevList;
    }
  });

  // 3. Upfront SPL balance check runs before any RPC call
  let splFetchCount = 0;
  await withMockedFetch(async () => {
    splFetchCount += 1;
    return jsonResponse({}, 500);
  }, async () => {
    await assert.rejects(
      () => chainContracts.executeSolanaSplTransfer({
        wallet: {
          mnemonic: TEST_MNEMONIC,
          solAddress: '11111111111111111111111111111111',
          nativeBalances: { sol: 0 },
          splBalances: {}
        },
        mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        toAddress: '11111111111111111111111111111111',
        amount: 10,
        decimals: 6,
        tokenBalance: 0
      }),
      /余额不足|Insufficient/i
    );
  });
  assert.equal(splFetchCount, 0);

  // 4. quoteIntentSwapOrWithdraw (quoteRawOneClick) honors external AbortSignal AND 10s quote dedup/cache
  let quoteFetchCalls = 0;
  await withMockedFetch(async (url, opts) => {
    quoteFetchCalls += 1;
    if (opts && opts.signal && opts.signal.aborted) {
      throw new Error('Already aborted');
    }
    if (opts && opts.signal) {
      return new Promise((_, reject) => {
        const onAbort = () => reject(new Error('Aborted by external signal'));
        if (opts.signal.aborted) return onAbort();
        opts.signal.addEventListener('abort', onAbort, { once: true });
      });
    }
    return jsonResponse({}, 500);
  }, async () => {
    const extCtrl = new AbortController();
    setTimeout(() => extCtrl.abort(), 15);
    const res = await nearIntents.quoteIntentSwapOrWithdraw({
      originAsset: 'nep141:wrap.near',
      destinationAsset: 'nep141:sol.omft.near',
      amountRaw: '1000000000000000000000000',
      recipient: '11111111111111111111111111111111',
      refundTo: 'alice.near',
      dry: true,
      signal: extCtrl.signal
    });
    assert.equal(res.ok, false);
  });
  assert.equal(quoteFetchCalls, 1);

  let dedupCalls = 0;
  await withMockedFetch(async () => {
    dedupCalls += 1;
    return jsonResponse({
      quote: {
        amountOut: '5000000',
        minAmountOut: '4950000',
        amountInUsd: '2.50',
        amountOutUsd: '2.49'
      }
    });
  }, async () => {
    const [q1, q2] = await Promise.all([
      nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        amountRaw: '1234567890000000000000000',
        recipient: 'alice.near',
        refundTo: 'alice.near',
        dry: true
      }),
      nearIntents.quoteIntentSwapOrWithdraw({
        originAsset: 'nep141:wrap.near',
        destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        amountRaw: '1234567890000000000000000',
        recipient: 'alice.near',
        refundTo: 'alice.near',
        dry: true
      })
    ]);
    assert.equal(q1.ok, true);
    assert.equal(q2.ok, true);
    assert.equal(dedupCalls, 1);
  });

  // 5. POL/AVAX/OP 1Click native asset resolution + HeroMiners zero threshold fallback
  assert.equal(nearIntents.resolveOneClickAssetId({ symbol: 'POL', blockchain: 'pol' }), 'nep141:pol.omdep.near');
  assert.equal(nearIntents.resolveOneClickAssetId({ symbol: 'AVAX', blockchain: 'avax' }), 'nep141:avax.omdep.near');
  assert.equal(nearIntents.resolveOneClickAssetId({ symbol: 'OP', blockchain: 'op' }), 'nep245:v2_1.omni.hot.tg:10_11111111111111111111');

  await withMockedFetch(async (url) => {
    if (url.includes('pearl.herominers.com/api/stats_address')) {
      return jsonResponse({
        stats: { hashrate: 50, balance: '100000000', paid: '0', minPaymentThreshold: '0' },
        workers: [],
        payments: []
      });
    }
    if (url.includes('pearl.herominers.com/api/stats')) {
      return jsonResponse({
        network: { height: 1000 },
        pool: { minPaymentThreshold: 500000000 },
        config: { coinUnits: 100000000, minPaymentThreshold: 500000000 }
      });
    }
    return jsonResponse({}, 404);
  }, async () => {
    const derived = cryptoEngine.derivePearlFromSeed(TEST_MNEMONIC, "m/86'/808276'/0'/0/0", true);
    const heroStats = await miningPro.queryMinerDeepStats(derived.address, 'herominers');
    assert.equal(heroStats.payoutThresholdPrl, 5);
  });

  // 6. sw.js cross-origin pass-through + server.js gzip + OPTIONS preflight
  const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  const swVerMatch = swSrc.match(/const CACHE_NAME = 'nexus-wallet-v(\d+\.\d+)';/);
  assert.ok(swVerMatch, 'sw.js must define nexus-wallet-vX.Y cache name');
  const curVer = swVerMatch[1];
  assert.ok(swSrc.includes(`./bip39-wordlist.js?v=${curVer}`));
  assert.match(swSrc, /if\s*\(reqUrl\.origin\s*!==\s*self\.location\.origin\)\s*\{\s*return;\s*\}/);

  const srv = require('../server.js');
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  try {
    const port = srv.address().port;
    const gzRes = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: `/style.css?v=${curVer}`,
        method: 'GET',
        headers: { 'Accept-Encoding': 'gzip' }
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(gzRes.status, 200);
    assert.equal(gzRes.headers['content-encoding'], 'gzip');
    assert.match(String(gzRes.headers['vary'] || ''), /Accept-Encoding/i);
    const gunzipped = zlib.gunzipSync(gzRes.body).toString('utf8');
    assert.equal(gunzipped, fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8'));

    const optStatus = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/pearl-proxy', method: 'OPTIONS' }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(optStatus, 204);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
});

test('v6.3 Regression Suite: NEAR Storage Reclaim, Dynamic storage_minimum_balance, Validator Dust Guard, Dynamic NEAR FT & Minimal History', async () => {
  const encodeJsonBytes = (obj) => Array.from(Buffer.from(JSON.stringify(obj), 'utf8'));

  // 1. Dynamic NEAR NEP-141 discovery (unknown token + ft_metadata + FastNear null balance RPC fallback)
  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/alice.near/ft')) {
      return jsonResponse({
        account_id: 'alice.near',
        tokens: [
          { contract_id: 'token.rhealab.near', balance: null },
          { contract_id: 'npro.nearmobile.near', balance: '2500000000000000000000000' }
        ]
      });
    }
    if (opts && opts.body) {
      const rpc = JSON.parse(opts.body);
      const cid = rpc.params && rpc.params.account_id;
      const method = rpc.params && rpc.params.method_name;
      if (cid === 'token.rhealab.near' && method === 'ft_balance_of') {
        return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes('101500000000000000000') } });
      }
      if (cid === 'npro.nearmobile.near' && method === 'ft_metadata') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { result: encodeJsonBytes({ symbol: 'NPRO', name: 'NEAR Mobile', decimals: 24, icon: '' }) }
        });
      }
    }
    return jsonResponse({}, 404);
  }, async () => {
    const nepMap = await nearIntents.fetchNearNep141Balances('alice.near');
    assert.equal(nepMap['token.rhealab.near'].formatted, 101.5);
    assert.equal(nepMap['npro.nearmobile.near'].formatted, 2.5);
    assert.equal(nepMap['npro.nearmobile.near'].symbol, 'NPRO');
  });

  // 2. scanNearReclaimableStorageAsync & executeNearStorageReclaim
  const sentNearCalls = [];
  const origNearCall = chainContracts.signAndSendNearFunctionCall;
  chainContracts.signAndSendNearFunctionCall = async (params) => {
    sentNearCalls.push(params);
    return 'near_tx_v63_' + sentNearCalls.length;
  };
  try {
    await withMockedFetch(async (url, opts) => {
      if (url.includes('api.fastnear.com/v1/account/alice.near/ft')) {
        return jsonResponse({
          account_id: 'alice.near',
          tokens: [
            { contract_id: 'wrap.near', balance: '0' },
            { contract_id: 'token.rhealab.near', balance: '101500000000000000000' }
          ]
        });
      }
      if (opts && opts.body) {
        const rpc = JSON.parse(opts.body);
        const cid = rpc.params && rpc.params.account_id;
        const method = rpc.params && rpc.params.method_name;
        if (method === 'storage_balance_of') {
          if (cid === 'wrap.near' || cid === 'token.rhealab.near') {
            return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes({ total: '1250000000000000000000', available: '0' }) } });
          }
          return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes(null) } });
        }
        if (method === 'ft_balance_of') {
          if (cid === 'token.rhealab.near') {
            return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes('101500000000000000000') } });
          }
          return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes('0') } });
        }
        if (cid === 'npro.nearmobile.near' && method === 'storage_minimum_balance') {
          return jsonResponse({ jsonrpc: '2.0', id: rpc.id, result: { result: encodeJsonBytes('2500000000000000000000') } });
        }
      }
      return jsonResponse({}, 404);
    }, async () => {
      const scanRes = await chainContracts.scanNearReclaimableStorageAsync('alice.near');
      assert.equal(scanRes.ok, true);
      const wrapAcc = scanRes.accounts.find((a) => a.contractId === 'wrap.near');
      const rheaAcc = scanRes.accounts.find((a) => a.contractId === 'token.rhealab.near');
      assert.ok(wrapAcc && wrapAcc.isEmpty === true && wrapAcc.canReclaim === true);
      assert.ok(Math.abs(wrapAcc.depositNear - 0.00125) < 1e-8);
      assert.ok(rheaAcc && rheaAcc.isEmpty === false && rheaAcc.canReclaim === false);

      const testKeys = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC);
      const testWallet = {
        mnemonic: TEST_MNEMONIC,
        nearNamedAccount: 'alice.near',
        nearAddress: testKeys.nearAddress,
        nearPublicKey: testKeys.nearPublicKey,
        nearPrivateKey: testKeys.nearPrivateKey,
        nativeBalances: { near: 1.5 }
      };

      const reclaimRes = await chainContracts.executeNearStorageReclaim({
        wallet: testWallet,
        contracts: ['wrap.near']
      });
      assert.equal(reclaimRes.ok, true);
      assert.equal(reclaimRes.reclaimedCount, 1);
      assert.equal(sentNearCalls[0].receiverId, 'wrap.near');
      assert.equal(sentNearCalls[0].methodName, 'storage_unregister');
      assert.equal(JSON.parse(sentNearCalls[0].argsJson).force, false);
      assert.equal(sentNearCalls[0].depositYocto, '1');

      // 3. ensureNearNep141StorageRegistered queries storage_minimum_balance
      await chainContracts.ensureNearNep141StorageRegistered({
        resolvedWallet: testWallet,
        accountId: 'alice.near',
        tokenContract: 'npro.nearmobile.near'
      });
      const depCall = sentNearCalls[sentNearCalls.length - 1];
      assert.equal(depCall.receiverId, 'npro.nearmobile.near');
      assert.equal(depCall.methodName, 'storage_deposit');
      assert.equal(depCall.depositYocto, '2500000000000000000000');
    });
  } finally {
    chainContracts.signAndSendNearFunctionCall = origNearCall;
  }

  // 4. fetchNearAccountStakingPositionsAsync filters < 0.0005 NEAR dust and blocks withdraw when unstaked_balance === 0
  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/alice.near/full')) {
      return jsonResponse({
        pools: [
          { pool_id: 'meteor.poolv1.near' },
          { pool_id: 'figment.poolv1.near' }
        ]
      });
    }
    if (opts && opts.body) {
      const rpc = JSON.parse(opts.body);
      const cid = rpc.params && rpc.params.account_id;
      const method = rpc.params && rpc.params.method_name;
      if (cid === 'meteor.poolv1.near' && method === 'get_account') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { result: encodeJsonBytes({ staked_balance: '50879158645145494110', unstaked_balance: '0', can_withdraw: true }) }
        });
      }
      if (cid === 'figment.poolv1.near' && method === 'get_account') {
        return jsonResponse({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { result: encodeJsonBytes({ staked_balance: '1000000000000000000000000', unstaked_balance: '0', can_withdraw: true }) }
        });
      }
    }
    return jsonResponse({ jsonrpc: '2.0', id: 1, result: { result: encodeJsonBytes(null) } });
  }, async () => {
    const pos = await chainContracts.fetchNearAccountStakingPositionsAsync('alice.near');
    assert.equal(pos.find((p) => p.poolId === 'meteor.poolv1.near'), undefined, 'Must filter 0.00005 NEAR residual dust');
    const fig = pos.find((p) => p.poolId === 'figment.poolv1.near');
    assert.ok(fig, 'Valid 1 NEAR stake must remain');
    assert.equal(fig.canWithdraw, false, 'canWithdraw must be false when unstaked_balance === 0');
  });

  // 5. Minimal token detail activity renders +/- signs on stake/unstake and drops Mining badge
  await withMockedStorage({}, async () => {
    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const domMap = new Map();
    const makeEl = (id) => {
      if (!domMap.has(id)) {
        domMap.set(id, {
          id,
          className: '',
          innerHTML: '',
          textContent: '',
          href: '',
          value: '',
          disabled: false,
          setAttribute() {},
          removeAttribute() {},
          classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            toggle(c, f) { if (f === undefined) { if (this._set.has(c)) this._set.delete(c); else this._set.add(c); } else if (f) this._set.add(c); else this._set.delete(c); },
            contains(c) { return this._set.has(c); }
          }
        });
      }
      return domMap.get(id);
    };
    [
      'sheet-backdrop', 'sheet-token-detail', 'token-detail-icon', 'token-detail-title',
      'token-detail-chains', 'token-detail-balance', 'token-detail-usd',
      'token-detail-addr-row', 'token-detail-addr', 'token-detail-explorer-link',
      'token-detail-breakdown-card', 'token-detail-breakdown-list',
      'token-detail-earn-card', 'token-detail-earn-list', 'token-detail-history-list',
      'token-detail-price-label', 'token-detail-price-val'
    ].forEach(makeEl);
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => []
    };
    try {
      const w = state.normalizeWalletRecord({
        id: 'w_v63_hist',
        mnemonic: TEST_MNEMONIC,
        nearNamedAccount: 'alice.near',
        nativeBalances: { near: 5 },
        activityHistory: [
          { id: 's1', type: 'stake', symbol: 'RHEA', toSymbol: 'xRHEA', chain: 'near', amount: 100, txHash: 'stake_tx_1', title: 'Rhea', timestamp: 1700000300 },
          { id: 'u1', type: 'unstake', symbol: 'RHEA', chain: 'near', amount: 50, txHash: 'unstake_tx_1', title: 'Rhea', timestamp: 1700000400 }
        ],
        nearNep141Balances: { 'token.rhealab.near': { raw: '100000000000000000000', formatted: 100 } }
      });
      state.wallets = [w];
      state.activeWalletId = w.id;
      await withMockedFetch(async () => jsonResponse({ txns: [] }), async () => {
        uiController.openTokenDetailSheet('RHEA');
        await new Promise((r) => setTimeout(r, 20));
        const histHtml = domMap.get('token-detail-history-list').innerHTML;
        assert.ok(histHtml.includes('-100 RHEA'));
        assert.ok(histHtml.includes('+50 RHEA'));
        assert.equal(histHtml.includes('挖矿') || histHtml.includes('>Mining<'), false);
      });
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
    }
  });
});

test('v6.4 Fixes: Official Icons + Fallback, Live Jupiter ASR APY, Swap USD & Button Error UX, Scheme A Recipient Lock, PRL Route Label, Merged EVM/Arc, Solana ATA Detection & Cache v6.4', async () => {
  // 1. Official remote icons take primaryUrl while local makeLocalIcon SVG acts as offline fallbackUrl
  for (const sym of ['PONS', 'QTC', 'SOL', 'BTC', 'EURC']) {
    const icon = tokenRegistry.resolveTokenIcon({ symbol: sym, blockchain: sym === 'SOL' ? 'sol' : (sym === 'BTC' ? 'btc' : 'near') });
    assert.ok(
      icon.primaryUrl.startsWith('assets/icons/') || icon.primaryUrl.startsWith('https://'),
      `${sym} primaryUrl must use bundled local or official remote icon`
    );
    assert.ok(icon.fallbackUrl.startsWith('data:image/svg+xml;base64,'), `${sym} fallbackUrl must use local SVG data URI`);
  }
  const arcusTok = (tokenRegistry.DEX_CHAIN_TOKENS.arc || []).find((t) => t.symbol === 'ARCUS');
  assert.ok(arcusTok && String(arcusTok.logoURI).startsWith('https://'), 'ARCUS must retain official remote logoURI');
  const arcChain = tokenRegistry.getChainMeta('arc');
  assert.ok(arcChain.logoUrl.endsWith('/arc-dark.svg'), 'CHAIN_META.arc.logoUrl must use official arc-dark.svg');
  assert.ok(arcChain.fallbackLogoUrl.startsWith('data:image/svg+xml;base64,'), 'CHAIN_META.arc.fallbackLogoUrl must use local SVG fallback');

  // 2. Jupiter DAO ASR formatting in zh & en
  const prevLang = state.lang;
  try {
    state.lang = 'zh';
    assert.equal(
      uiController.formatPoolApyText({ apy: 17.02, isJupiterDao: true, isAsrEstimated: true }),
      'ASR 估算 ~17.02%'
    );
    state.lang = 'en';
    assert.equal(
      uiController.formatPoolApyText({ apy: 17.02, isJupiterDao: true, isAsrEstimated: true }),
      'ASR Est. ~17.02%'
    );
  } finally {
    state.lang = prevLang;
  }

  // 3 & 4. SWR persistence of NEAR DEX prices (oRHEA), live #swap-usd-in, & unified button-only error/balance UX
  const orheaTok = (tokenRegistry.DEX_CHAIN_TOKENS.near || []).find((t) => String(t.symbol).toUpperCase() === 'ORHEA');
  const usdtNearTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'USDT' && t.blockchain === 'near');
  const prevOrheaPrice = orheaTok ? orheaTok.price : null;
  await withMockedStorage({}, async () => {
    assert.ok(orheaTok && usdtNearTok);
    orheaTok.price = 0.0193;
    state.saveCachedLiveTokens([
      { assetId: 'nep141:wrap.near', symbol: 'NEAR', blockchain: 'near', decimals: 24, price: 3.1 }
    ]);
    orheaTok.price = null;
    state.loadCachedLiveTokens();
    assert.equal(orheaTok.price, 0.0193, 'loadCachedLiveTokens must re-hydrate static NEAR DEX token prices');

    const prevDoc = globalThis.document;
    const prevWallets = state.wallets.slice();
    const prevActiveId = state.activeWalletId;
    const prevSwap = { ...state.swap };
    const domMap = new Map();
    const mkEl = (id) => {
      if (!domMap.has(id)) {
        domMap.set(id, {
          id,
          value: '',
          textContent: '',
          innerHTML: '',
          title: '',
          disabled: false,
          setAttribute() {},
          classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            toggle(c, f) { if (f === undefined) { if (this._set.has(c)) this._set.delete(c); else this._set.add(c); } else if (f) this._set.add(c); else this._set.delete(c); },
            contains(c) { return this._set.has(c); }
          },
          querySelector() { return null; },
          querySelectorAll() { return []; }
        });
      }
      return domMap.get(id);
    };
    [
      'swap-from-token-btn', 'swap-to-token-btn', 'swap-from-balance', 'swap-to-balance',
      'swap-from-net-label', 'swap-to-net-label', 'swap-auto-route-badge', 'swap-recipient-input',
      'swap-recipient-contacts-btn', 'swap-amount-in', 'swap-amount-out', 'swap-usd-in', 'swap-usd-out',
      'swap-quote-rate', 'swap-quote-route', 'swap-quote-fee', 'swap-gas-reserve-row',
      'swap-gas-reserve-label', 'swap-details-summary', 'swap-error-banner', 'btn-execute-swap'
    ].forEach(mkEl);
    domMap.get('swap-error-banner').classList.add('hidden');
    globalThis.document = {
      getElementById: (id) => domMap.get(id) || null,
      querySelector: () => null,
      querySelectorAll: () => []
    };

    try {
      const keys = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
      const w = state.normalizeWalletRecord({
        id: 'w_v64_swap_ui',
        mnemonic: TEST_MNEMONIC,
        nearNamedAccount: 'alice.near',
        nearPublicKey: keys.nearPublicKey,
        nearPrivateKey: keys.nearPrivateKey,
        nativeBalances: { near: 0.1, sol: 0.0025 },
        nearNep141Balances: { [orheaTok.contractAddress]: { raw: '0', formatted: 0 } }
      });
      state.wallets = [w];
      state.activeWalletId = w.id;
      state.lang = 'zh';
      state.swap.fromAssetId = orheaTok.assetId;
      state.swap.toAssetId = usdtNearTok.assetId;
      state.swap.amountIn = '1000';
      state.swap.quoteData = null;
      state.swap._lastError = '';
      uiController.renderSwapView();

      assert.equal(domMap.get('swap-usd-in').textContent, '$19.30');
      const btn = domMap.get('btn-execute-swap');
      assert.equal(btn.disabled, true);
      assert.equal(btn.classList.contains('is-error'), true);
      assert.ok(btn.textContent.includes('oRHEA') && btn.textContent.includes('余额不足'));
      assert.equal(domMap.get('swap-recipient-input').disabled, true, 'Same-chain NEAR DEX swap must lock recipient');

      // Quote errors also stay solely on the primary button while #swap-error-banner stays hidden
      domMap.get('swap-amount-in').value = '1000';
      w.nearNep141Balances[orheaTok.contractAddress] = { raw: '5000000000000000000000', formatted: 5000 };
      const resQuoteErr = uiController.evaluateSwapButtonState({
        wallet: w,
        fromToken: orheaTok,
        toToken: usdtNearTok,
        amountIn: '1000',
        quoteError: '暂无报价'
      });
      assert.equal(resQuoteErr.reason, 'quote_error');
      assert.equal(resQuoteErr.disabled, true);
      assert.equal(resQuoteErr.isError, true);

      // Simulate error banner call -> banner stays hidden
      if (typeof uiController.renderSwapView === 'function') {
        state.swap._lastError = '报价超时';
        uiController.renderSwapView();
      }
      assert.equal(domMap.get('swap-error-banner').classList.contains('hidden'), true);

      // Native SOL gas buffer & NEAR hub gas validation inside evaluateSwapButtonState
      const solTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'SOL' && t.blockchain === 'sol');
      const jupTok = (tokenRegistry.DEX_CHAIN_TOKENS.sol || []).find((t) => t.symbol === 'JUP');
      const gasShort = uiController.evaluateSwapButtonState({
        wallet: w,
        fromToken: solTok,
        toToken: jupTok,
        amountIn: '0.002'
      });
      assert.equal(gasShort.reason, 'insufficient_gas');
      assert.equal(gasShort.disabled, true);

      const prlTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PRL' && t.blockchain === 'prl');
      const qtcTok = { symbol: 'QTC', name: 'Quantus Network', blockchain: 'qtc', assetId: 'nep141:qtc.omft.near', decimals: 12 };
      w.nativeBalances.near = 0;
      w.nativeBalances.prl = 500;
      const nearGasShort = uiController.evaluateSwapButtonState({
        wallet: w,
        fromToken: prlTok,
        toToken: qtcTok,
        amountIn: '10',
        quoteData: { compositeType: 'PRL_TO_EXTERNAL' }
      });
      assert.equal(nearGasShort.reason, 'insufficient_near_gas');
      assert.equal(nearGasShort.disabled, true);

      // 5. Scheme A recipient lock matrix
      const nearNativeTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'NEAR' && t.blockchain === 'near');
      const solUsdcTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'USDC' && t.blockchain === 'sol');
      const baseEthTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'ETH' && t.blockchain === 'base');
      const arcUsdcTok = (tokenRegistry.DEX_CHAIN_TOKENS.arc || []).find((t) => t.symbol === 'USDC');
      const arcEurcTok = (tokenRegistry.DEX_CHAIN_TOKENS.arc || []).find((t) => t.symbol === 'EURC');

      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(orheaTok, usdtNearTok), true, 'Same-chain DEX requires self');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlTok, nearNativeTok, { compositeType: 'PRL_TO_NEAR_REF' }), true, 'PRL -> NEAR ends on Ref DEX -> self');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlTok, jupTok), true, 'PRL -> JUP ends on Jupiter DEX -> self');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(baseEthTok, arcEurcTok), true, 'Base ETH -> Arc EURC ends on Arc DEX -> self');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlTok, qtcTok), false, 'PRL -> QTC ends on 1Click bridge -> editable');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(prlTok, solUsdcTok), false, 'PRL -> SOL USDC ends on 1Click bridge -> editable');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(nearNativeTok, baseEthTok), false, 'NEAR -> Base ETH -> editable');
      assert.equal(uiController.doesSwapRouteRequireSelfRecipient(baseEthTok, arcUsdcTok), false, 'Base ETH -> Arc USDC ends on Relay -> editable');

      // SMART_HUB_ROUTE forces self SOL address on BRIDGE_OUT when DEST_DEX (JUP) follows
      const ownSolAddr = w.solAddress;
      const customSolAddr = 'B7n2uQk6gZ9cK4mW1rX8pS3vD5tN9yL2aE4hF6jC8mN1p';
      await withMockedFetch(async (url, opts) => {
        if (url.includes('1click.chaindefuser.com/v0/quote')) {
          const req = JSON.parse(opts.body);
          if (req.originAsset === prlTok.assetId) {
            return jsonResponse({
              quote: { amountOut: '10000000000', amountOutFormatted: '100', amountInUsd: '100', amountOutUsd: '100' }
            });
          }
          if (req.destinationAsset === 'nep141:sol.omft.near' || req.destinationAsset === solUsdcTok.assetId) {
            return jsonResponse({
              quote: { amountOut: '500000000', amountOutFormatted: '0.5', amountInUsd: '100', amountOutUsd: '99.5' }
            });
          }
          return jsonResponse({}, 400);
        }
        if (url.includes('smartrouter.ref.finance')) {
          const u = new URL(url);
          const tIn = u.searchParams.get('tokenIn') || 'prl.omft.near';
          const tOut = u.searchParams.get('tokenOut') || 'wrap.near';
          const amtIn = u.searchParams.get('amountIn') || '10000000000';
          return jsonResponse({
            result_code: 0,
            result_data: {
              amount_out: '5000000000000000000000000',
              routes: [{
                min_amount_out: '4900000000000000000000000',
                pools: [{
                  pool_id: 9010,
                  token_in: tIn,
                  token_out: tOut,
                  amount_in: amtIn,
                  min_amount_out: '4900000000000000000000000'
                }]
              }]
            }
          });
        }
        if (url.includes('api.jup.ag') || url.includes('lite-api.jup.ag')) {
          return jsonResponse({ outAmount: '80000000' });
        }
        return jsonResponse({}, 404);
      }, async () => {
        const smartJup = await nearIntents.quoteSmartHubRoute({
          fromToken: prlTok,
          toToken: jupTok,
          amountRaw: '10000000000',
          slippageBps: 100,
          recipient: customSolAddr,
          refundTo: w.address,
          nearAccountId: w.nearNamedAccount,
          solAddress: ownSolAddr,
          evmAddress: w.mpcEvmAddress
        });
        assert.equal(smartJup.ok, true);
        const bridgeOutStage = smartJup.stages.find((s) => s.type === 'BRIDGE_OUT');
        assert.ok(bridgeOutStage);
        assert.equal(bridgeOutStage.recipient, ownSolAddr, 'Intermediate BRIDGE_OUT before DEST_DEX must use self wallet solAddress');

        const smartUsdc = await nearIntents.quoteCrossChainWithDexRelay({
          fromToken: prlTok,
          toToken: solUsdcTok,
          amountRaw: '10000000000',
          slippageBps: 100,
          recipient: customSolAddr,
          refundTo: w.address,
          nearAccountId: w.nearNamedAccount,
          solAddress: ownSolAddr,
          evmAddress: w.mpcEvmAddress
        });
        assert.equal(smartUsdc.ok, true);
        if (Array.isArray(smartUsdc.stages)) {
          const outUsdc = smartUsdc.stages.find((s) => s.type === 'BRIDGE_OUT');
          if (outUsdc) assert.equal(outUsdc.recipient, customSolAddr);
        }
      });

      // 6. PRL -> NEAR Ref route label explicitly shows 1Click (Pearl->NEAR)
      await withMockedFetch(async (url) => {
        if (url.includes('1click.chaindefuser.com/v0/quote')) {
          return jsonResponse({
            quote: { amountOut: '1000000000', amountOutFormatted: '10', amountInUsd: '20', amountOutUsd: '19.9' }
          });
        }
        if (url.includes('smartrouter.ref.finance')) {
          return jsonResponse({
            result_code: 0,
            result_data: {
              amount_out: '5000000000000000000000000',
              routes: [{
                min_amount_out: '4900000000000000000000000',
                pools: [{
                  pool_id: 9010,
                  token_in: 'prl.omft.near',
                  token_out: 'wrap.near',
                  amount_in: '1000000000',
                  min_amount_out: '4900000000000000000000000'
                }]
              }]
            }
          });
        }
        return jsonResponse({}, 404);
      }, async () => {
        const prlNearQuote = await nearIntents.quoteCrossChainWithDexRelay({
          fromToken: prlTok,
          toToken: nearNativeTok,
          amountRaw: '1000000000',
          slippageBps: 100,
          recipient: w.nearNamedAccount,
          refundTo: w.address,
          nearAccountId: w.nearNamedAccount,
          solAddress: ownSolAddr,
          evmAddress: w.mpcEvmAddress
        });
        assert.equal(prlNearQuote.ok, true);
        assert.ok(
          String(prlNearQuote.routeLabel || '').includes('1Click (Pearl➔NEAR'),
          `Expected 1Click (Pearl➔NEAR...) in routeLabel, got ${prlNearQuote.routeLabel}`
        );
      });

      // 8. Solana ATA detection distinguishes existing 0-bal ATA from uninitialized ATA
      const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const JUP_MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
      await withMockedFetch(async (_url, opts) => {
        const body = JSON.parse(opts.body);
        if (body.method === 'getBalance') {
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { value: 2000000 } });
        }
        if (body.method === 'getTokenAccountsByOwner') {
          const progId = body.params?.[1]?.programId;
          if (progId === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            return jsonResponse({
              jsonrpc: '2.0',
              id: body.id,
              result: {
                value: [
                  { account: { data: { parsed: { info: { mint: USDC_MINT, tokenAmount: { amount: '0', decimals: 6 } } } } } }
                ]
              }
            });
          }
          return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { value: [] } });
        }
        return jsonResponse({}, 404);
      }, async () => {
        const solBal = await chainContracts.fetchSolanaNativeAndSplBalances(w.solAddress, [USDC_MINT, JUP_MINT]);
        assert.equal(solBal.tokens[USDC_MINT].hasAta, true);
        assert.equal(solBal.tokens[JUP_MINT].hasAta, false);
        assert.equal(solBal.ataMints[USDC_MINT], true);
        assert.equal(Boolean(solBal.ataMints[JUP_MINT]), false);

        w.nativeBalances.sol = 0;
        w.splBalances = { [USDC_MINT]: 0, [JUP_MINT]: 0 };
        w.solAtaMints = solBal.ataMints;
        const jupReserve = uiController.getTargetChainGasReserveInfo(w, prlTok, jupTok, 'auto', {
          compositeType: 'SMART_HUB_ROUTE',
          stages: [{ type: 'DEST_DEX', chain: 'sol' }]
        });
        assert.equal(jupReserve.isNewSolAta, true);
        assert.equal(jupReserve.recommendedReserve, 0.0035);

        const usdcReserve = uiController.getTargetChainGasReserveInfo(w, prlTok, solUsdcTok, 'auto', {
          compositeType: 'SMART_HUB_ROUTE',
          stages: [{ type: 'DEST_DEX', chain: 'sol' }]
        });
        assert.equal(usdcReserve.isNewSolAta, false);
      });
    } finally {
      globalThis.document = prevDoc;
      state.wallets = prevWallets;
      state.activeWalletId = prevActiveId;
      state.lang = prevLang;
      Object.assign(state.swap, prevSwap);
      if (orheaTok) orheaTok.price = prevOrheaPrice;
    }
  });

  // 9. Static cache & lazy module versions remain synchronized with sw.js CACHE_NAME
  const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  const uiSrc = fs.readFileSync(path.join(ROOT_DIR, 'src', 'ui-controller.js'), 'utf8');
  const curVerMatch = swSrc.match(/const CACHE_NAME = 'nexus-wallet-v(\d+\.\d+)';/);
  assert.ok(curVerMatch, 'sw.js must define nexus-wallet-vX.Y');
  const curVer = curVerMatch[1];
  const [majVer, minVer] = curVer.split('.').map(Number);
  assert.ok(majVer > 6 || (majVer === 6 && minVer >= 7), `Expected v6.7+, got v${curVer}`);
  assert.equal(swSrc.includes('?v=6.5'), false);
  assert.ok(htmlSrc.includes(`src/ui-controller.js?v=${curVer}`));
  assert.equal(htmlSrc.includes('?v=6.5'), false);
  assert.ok(uiSrc.includes(`ethers.umd.min.js?v=${curVer}`));
  assert.equal(uiSrc.includes('?v=6.5'), false);

  // 10. NEAR Pair Comparator Grace Window waits for slower 1Click Solver instead of letting shallow fast Rhea CLMM abort it
  const nearWrapTok = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'NEAR' && t.blockchain === 'near');
  const qtcNearCoreTok = (tokenRegistry.DEX_CHAIN_TOKENS.near || []).find((t) => t.symbol === 'QTC');
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      if (opts?.signal?.aborted) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return jsonResponse({
        quote: {
          amountOut: '2357397651877',
          amountOutFormatted: '2.357397651877',
          amountInUsd: '91.50',
          amountOutUsd: '90.54'
        }
      });
    }
    if (opts?.body) {
      const rpcBody = JSON.parse(opts.body);
      if (rpcBody?.params?.account_id === 'dclv2.ref-labs.near' && rpcBody?.params?.method_name === 'quote') {
        const payloadBytes = Array.from(Buffer.from(JSON.stringify({ amount: '2113772000000' })));
        return jsonResponse({ jsonrpc: '2.0', id: rpcBody.id, result: { result: payloadBytes } });
      }
    }
    return jsonResponse({}, 404);
  }, async () => {
    const cmpRes = await nearIntents.quoteBestNearPairSwap({
      fromToken: nearWrapTok,
      toToken: qtcNearCoreTok,
      amountRaw: '30000000000000000000000000',
      slippageBps: 100,
      recipient: 'alice.near',
      nearAccountId: 'alice.near'
    });
    assert.equal(cmpRes.ok, true);
    assert.equal(cmpRes.bestSource, '1Click Solver');
    assert.equal(cmpRes.amountOut, '2357397651877');
    assert.ok(cmpRes.comparedPools >= 2, `Expected >= 2 compared pools, got ${cmpRes.comparedPools}`);
  });

  // 11. Stale v6.3 localStorage SVG logoURI cleanup (PONS / QTC) & High Price Impact Warning
  const ponsCore = tokenRegistry.UNIFIED_CORE_TOKENS.find((t) => t.symbol === 'PONS' && t.blockchain === 'hood');
  const stalePonsSvg = tokenRegistry.resolveTokenIcon({ symbol: 'PONS', blockchain: 'hood' }).fallbackUrl;
  assert.ok(stalePonsSvg.startsWith('data:image/svg+xml;base64,'));
  await withMockedStorage({}, async () => {
    state.saveCachedLiveTokens([
      {
        assetId: ponsCore.assetId,
        symbol: 'PONS',
        name: 'Pons',
        blockchain: 'hood',
        contractAddress: ponsCore.contractAddress,
        decimals: 18,
        price: 0.103,
        logoURI: stalePonsSvg
      }
    ]);
    const loaded = state.loadCachedLiveTokens();
    const loadedPons = loaded.find((t) => t.symbol === 'PONS');
    assert.equal(loadedPons.logoURI, '', 'Stale generated SVG logoURI must be stripped from cached liveTokens');
    assert.equal(Boolean(ponsCore.logoURI && ponsCore.logoURI.startsWith('data:image/svg+xml')), false);
    const resolvedPons = tokenRegistry.resolveTokenIcon({
      symbol: 'PONS',
      blockchain: 'hood',
      logoURI: stalePonsSvg
    });
    assert.ok(
      resolvedPons.primaryUrl.startsWith('assets/icons/') || resolvedPons.primaryUrl.startsWith('https://'),
      'resolveTokenIcon must prioritize bundled/official icon over stale generated SVG'
    );
    assert.equal(resolvedPons.fallbackUrl, stalePonsSvg);
  });

  const lowImpact = uiController.computeSwapPriceImpact(91.50, 90.54);
  assert.equal(lowImpact.level, 'none');
  const highImpact = uiController.computeSwapPriceImpact(91.50, 81.08);
  assert.equal(highImpact.level, 'high');
  assert.equal(highImpact.pct, 11.39);
  const critImpact = uiController.computeSwapPriceImpact(100, 78);
  assert.equal(critImpact.level, 'critical');
  assert.equal(critImpact.pct, 22);
  const nullImpact = uiController.computeSwapPriceImpact(0, 10);
  assert.equal(nullImpact.level, 'none');

  const keysImpact = await cryptoEngine.deriveAllChainKeysAsync(TEST_MNEMONIC);
  const fundedNearWallet = state.normalizeWalletRecord({
    id: 'w_v66_impact',
    mnemonic: TEST_MNEMONIC,
    nearNamedAccount: 'alice.near',
    nearPublicKey: keysImpact.nearPublicKey,
    nearPrivateKey: keysImpact.nearPrivateKey,
    nativeBalances: { near: 100 }
  });
  const btnCrit = uiController.evaluateSwapButtonState({
    wallet: fundedNearWallet,
    fromToken: nearWrapTok,
    toToken: qtcNearCoreTok,
    amountIn: '30',
    priceImpact: critImpact
  });
  assert.equal(btnCrit.reason, 'ready_high_impact');
  assert.equal(btnCrit.disabled, false);
  assert.equal(btnCrit.isWarning, true);
  assert.ok(btnCrit.text.includes('-22.0%'));
});
