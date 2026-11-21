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

test('v4.0 Optimization: raceWithGraceWindow, fetchEvmChainBalancesBatch (Multicall3 + Batch fallback), executeSolanaSplTransfer & Earn Withdrawals', async () => {
  // 1. raceWithGraceWindow returns fast winner + grace window without waiting for hanging promise
  const start = Date.now();
  const fast = new Promise((r) => setTimeout(() => r({ ok: true, out: 100 }), 15));
  const medium = new Promise((r) => setTimeout(() => r({ ok: true, out: 120 }), 35));
  const hanging = new Promise((r) => setTimeout(() => r({ ok: true, out: 999 }), 3000));
  const raced = await chainContracts.raceWithGraceWindow([fast, medium, hanging], (v) => Boolean(v && v.ok), 80);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 400, `Expected raceWithGraceWindow < 400ms, got ${elapsed}ms`);
  assert.equal(raced[0]?.value?.out, 100);
  assert.equal(raced[1]?.value?.out, 120);
  assert.equal(raced[2], null);

  // 2a. fetchEvmChainBalancesBatch uses Multicall3 aggregate3 single eth_call first
  const origFetch = globalThis.fetch;
  try {
    let mcCallCount = 0;
    const ethersLib = require('../ethers.umd.min.js');
    const mcIface = new ethersLib.Interface(['function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])']);
    const encodedMcResp = mcIface.encodeFunctionResult('aggregate3', [[
      { success: true, returnData: '0x0000000000000000000000000000000000000000000000000de0b6b3a7640000' }, // 1 ETH
      { success: true, returnData: '0x0000000000000000000000000000000000000000000000000000000005f5e100' }, // 100 USDC (6 dec)
      { success: true, returnData: '0x00000000000000000000000000000000000000000000000000000000004c4b40' }  // 5 USDT (6 dec)
    ]]);
    globalThis.fetch = async (url, init) => {
      mcCallCount += 1;
      const payload = JSON.parse(init.body);
      assert.equal(payload.method, 'eth_call');
      assert.equal(payload.params[0].to, '0xcA11bde05977b3631167028862bE2a173976CA11');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: encodedMcResp }), { status: 200 });
    };
    const mcRes = await chainContracts.fetchEvmChainBalancesBatch(
      'eth',
      '0x1111111111111111111111111111111111111111',
      [
        { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
        { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
      ]
    );
    assert.equal(mcCallCount, 1);
    assert.equal(mcRes.nativeFormatted, 1);
    assert.equal(mcRes.tokens['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'].formatted, 100);
    assert.equal(mcRes.tokens['0xdac17f958d2ee523a2206206994597c13d831ec7'].formatted, 5);

    // 2b. Fallback to JSON-RPC batch if Multicall3 returns revert/failure
    let batchFallbackCalls = 0;
    globalThis.fetch = async (url, init) => {
      const payload = JSON.parse(init.body);
      if (!Array.isArray(payload) && payload.method === 'eth_call' && payload.params[0].to === '0xcA11bde05977b3631167028862bE2a173976CA11') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: payload.id, error: { code: -32000, message: 'execution reverted' } }), { status: 200 });
      }
      batchFallbackCalls += 1;
      assert.ok(Array.isArray(payload), 'Expected JSON-RPC batch fallback array');
      assert.equal(payload.length, 3);
      return new Response(JSON.stringify([
        { jsonrpc: '2.0', id: 0, result: '0x1bc16d674ec80000' }, // 2 ETH
        { jsonrpc: '2.0', id: 1, result: '0x000000000000000000000000000000000000000000000000000000000bebc200' }, // 200 USDC
        { jsonrpc: '2.0', id: 2, result: '0x0000000000000000000000000000000000000000000000000000000000989680' }  // 10 USDT
      ]), { status: 200 });
    };
    const batchRes = await chainContracts.fetchEvmChainBalancesBatch(
      'eth',
      '0x1111111111111111111111111111111111111111',
      [
        { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
        { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 }
      ]
    );
    assert.ok(batchFallbackCalls >= 1);
    assert.equal(batchRes.nativeFormatted, 2);
    assert.equal(batchRes.tokens['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'].formatted, 200);
    assert.equal(batchRes.tokens['0xdac17f958d2ee523a2206206994597c13d831ec7'].formatted, 10);
  } finally {
    globalThis.fetch = origFetch;
  }

  // 3. executeSolanaSplTransfer pre-validation blocks 0 balance & builds signed SPL TransferChecked tx
  const derived = await cryptoEngine.deriveAllChainKeysAsync(
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
  );
  const zeroSolWallet = {
    ...derived,
    nativeBalances: { near: 0, sol: 0, eth: 0 },
    splBalances: { EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: 0 }
  };
  await assert.rejects(
    chainContracts.executeSolanaSplTransfer({
      wallet: zeroSolWallet,
      mintAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      toAddress: '11111111111111111111111111111111',
      amount: 10,
      decimals: 6
    }),
    /余额不足|Insufficient/
  );

  // 4. Earn withdrawal functions pre-validate gas before network calls
  await assert.rejects(
    chainContracts.unstakeFromNearValidator({ wallet: zeroSolWallet, validatorId: 'astro-stakers.poolv1.near' }),
    /NEAR 余额不足|Insufficient NEAR/
  );
  await assert.rejects(
    chainContracts.withdrawFromAaveV3({ wallet: zeroSolWallet, poolId: 'aave_eth_usdc', amount: 'max' }),
    /Gas 不足|Insufficient native gas/
  );
});


test('v4.0 Swap Target Gas & Solana ATA Rent Reserve: zero-latency detection for new vs existing SPL ATA & Extra/None modes', () => {
  const newSplMint = 'XsoNr11111111111111111111111111111111111111';
  const existingSplMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const nearTok = { blockchain: 'near', symbol: 'NEAR', contractAddress: 'wrap.near' };
  const newSplTok = { blockchain: 'sol', symbol: 'STONK', contractAddress: newSplMint };
  const existingSplTok = { blockchain: 'sol', symbol: 'USDC', contractAddress: existingSplMint };
  const hoodTok = { blockchain: 'hood', symbol: 'PONS', contractAddress: '0x1111111111111111111111111111111111111111' };

  const emptyWallet = {
    accountType: 'standard',
    nativeBalances: { sol: 0, hood: 0 },
    splBalances: { [existingSplMint]: { formatted: 0 } }
  };

  const destSolQuote = { compositeType: 'SMART_HUB_ROUTE', stages: [{ type: 'BRIDGE_OUT' }, { type: 'DEST_DEX', chain: 'sol' }] };
  const destHoodQuote = { compositeType: 'SMART_HUB_ROUTE', stages: [{ type: 'BRIDGE_OUT' }, { type: 'DEST_DEX', chain: 'hood' }] };

  // Without resolved quoteData for cross-chain, never guess target gas reserve
  assert.equal(uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'auto').showSelector, false);

  // New SPL token with 0 SOL & DEST_DEX quote -> recommends 0.0035 SOL (0.0025 ATA rent + 0.001 gas)
  const rNew = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'auto', destSolQuote);
  assert.equal(rNew.showSelector, true);
  assert.equal(rNew.isNewSolAta, true);
  assert.equal(rNew.recommendedReserve, 0.0035);
  assert.equal(rNew.selectedReserve, 0.0035);

  // Extra mode -> 0.01 SOL (never allows 0 reserve when target lacks gas)
  assert.equal(uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'extra', destSolQuote).selectedReserve, 0.01);
  assert.equal(uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'none', destSolQuote).selectedReserve, 0.0035);

  // Existing SPL ATA with 0 SOL -> recommends 0.001 SOL (gas only, no ATA rent)
  const rOld = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, existingSplTok, 'auto', destSolQuote);
  assert.equal(rOld.isNewSolAta, false);
  assert.equal(rOld.recommendedReserve, 0.001);

  // When wallet already has >= 0.005 SOL -> auto reserve drops to 0
  const fundedWallet = {
    accountType: 'standard',
    nativeBalances: { sol: 0.05, hood: 0.01 },
    splBalances: {}
  };
  assert.equal(uiController.getTargetChainGasReserveInfo(fundedWallet, nearTok, newSplTok, 'auto', destSolQuote).selectedReserve, 0);
  assert.equal(uiController.getTargetChainGasReserveInfo(fundedWallet, nearTok, hoodTok, 'auto', destHoodQuote).selectedReserve, 0);

  // Native EVM target (e.g. NVDAx -> Base ETH) or direct 1Click route without DEST_DEX -> no gas reserve needed
  const baseEthTok = { blockchain: 'base', symbol: 'ETH', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' };
  const baseUsdcTok = { blockchain: 'base', symbol: 'USDC', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' };
  const rBaseEth = uiController.getTargetChainGasReserveInfo(emptyWallet, newSplTok, baseEthTok, 'auto');
  assert.equal(rBaseEth.showSelector, false);
  assert.equal(rBaseEth.selectedReserve, 0);
  const directQuoteNoDestDex = { compositeType: 'ONECLICK_DIRECT', stages: [{ type: 'ONECLICK' }] };
  const rDirectUsdc = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, baseUsdcTok, 'auto', directQuoteNoDestDex);
  assert.equal(rDirectUsdc.showSelector, false);
  assert.equal(rDirectUsdc.selectedReserve, 0);

  // Net swap output deducts selectedReserve proportionally from DEST_DEX stage
  const multiStageQuote = {
    compositeType: 'SMART_HUB_ROUTE',
    amountOutFormatted: '100',
    stages: [
      { type: 'BRIDGE_OUT', expectedOut: '1000000000' }, // 1.0 SOL
      { type: 'DEST_DEX', chain: 'sol' }
    ]
  };
  const rExtra = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'extra', multiStageQuote);
  const netExtra = uiController.computeNetSwapOutput(multiStageQuote, newSplTok, rExtra, 100);
  assert.ok(Math.abs(netExtra.netOutNum - 99) < 1e-6);
  const netFunded = uiController.computeNetSwapOutput(
    multiStageQuote,
    newSplTok,
    uiController.getTargetChainGasReserveInfo(fundedWallet, nearTok, newSplTok, 'auto', multiStageQuote),
    100
  );
  assert.equal(netFunded.netOutNum, 100);
});

test('v4.4 Solana ATA Rent Reclaim & Dust Burn Instructions', () => {
  const owner = 'CDKfRrFcfgiMsNeyzUjGr9hEtnzWeSy2Gz5WmJj5xBK';
  const mint1 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const mint2 = 'XsoNr11111111111111111111111111111111111111';
  const ata1 = '5B3v3n5r5V6n6X7x8Y9yAzB1c2d3e4f5g6h7i8j9k1l2';
  const ata2 = '6C4w4o6s6W7o7Y8y9Z0zB1C2d3e4f5g6h7i8j9k1l2m3';

  const ixs = chainContracts.buildSolanaCloseOrBurnInstructions({
    ownerAddress: owner,
    accounts: [
      { ataAddress: ata1, mint: mint1, programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', rawAmount: '0' },
      { ataAddress: ata2, mint: mint2, programId: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', rawAmount: '500' }
    ]
  });

  // Empty account -> 1 CloseAccount ix (opcode 9); Dust account -> Burn (opcode 8) + CloseAccount (opcode 9)
  assert.equal(ixs.length, 3);
  assert.equal(ixs[0].programId, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  assert.equal(ixs[0].data[0], 9);
  assert.equal(ixs[1].programId, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  assert.equal(ixs[1].data[0], 8);
  assert.equal(ixs[1].data[1], 500 & 0xff);
  assert.equal(ixs[1].data[2], (500 >> 8) & 0xff);
  assert.equal(ixs[2].programId, 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  assert.equal(ixs[2].data[0], 9);
});

test('v5.2 Pearl Network Taproot (BIP-340 Schnorr + BIP-341 SegWit v1) UTXO Signing & Builder', async () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
  const pearl = await cryptoEngine.derivePearlFromSeedAsync(mnemonic, "m/86'/808276'/0'/0/0", true);
  assert.ok(pearl.address.startsWith('prl1p'));
  assert.ok(pearl.tweakedPrivateKeyHex);

  // BIP-340 Schnorr sign & verify round-trip
  const msg32 = cryptoEngine.sha256Bytes('pearl-taproot-test-msg');
  const sig64 = cryptoEngine.signSchnorrBip340(msg32, pearl.tweakedPrivateKeyHex);
  assert.equal(sig64.length, 64);
  assert.equal(cryptoEngine.verifySchnorrBip340(sig64, msg32, pearl.pubkeyHex), true);

  // Build real SegWit v1 Taproot transaction
  const recipient = (await cryptoEngine.derivePearlFromSeedAsync(mnemonic, "m/86'/808276'/0'/0/1", true)).address;
  const built = chainContracts.buildSignedPearlTaprootTx({
    fromAddress: pearl.address,
    toAddress: recipient,
    amountGrains: '500000000', // 5 PRL
    feeGrains: '100000', // 0.001 PRL
    utxos: [
      { txid: '11'.repeat(32), vout: 0, value: '1049344800' } // 10.493448 PRL
    ],
    tweakedPrivateKeyHex: pearl.tweakedPrivateKeyHex
  });

  assert.equal(built.inputCount, 1);
  assert.equal(built.outputCount, 2); // recipient + change
  assert.equal(built.changeGrains, String(1049344800 - 500000000 - 100000));
  // Version 2 LE (02000000) + SegWit marker/flag (0001)
  assert.ok(built.rawHex.startsWith('020000000001'));

  // Insufficient UTXOs throws locally before broadcast
  assert.throws(() => {
    chainContracts.buildSignedPearlTaprootTx({
      fromAddress: pearl.address,
      toAddress: recipient,
      amountGrains: '2000000000',
      feeGrains: '100000',
      utxos: [{ txid: '22'.repeat(32), vout: 0, value: '100000000' }],
      tweakedPrivateKeyHex: pearl.tweakedPrivateKeyHex
    });
  }, /PRL UTXO/);
});

test('v5.4 Fee Policy: NEAR/1Click 25bps (zhic49280.near), Solana/EVM DEX 0bps default', async () => {
  await withMockedFetch(async (url, opts) => {
    if (url.includes('1click.chaindefuser.com/v0/quote')) {
      const body = JSON.parse(opts.body);
      return jsonResponse({
        quote: {
          amountOut: '9975000',
          amountOutFormatted: '9.975',
          amountInUsd: '10',
          amountOutUsd: '9.975',
          depositAddress: null,
          _echoAppFees: body.appFees || null
        }
      });
    }
    if (url.includes('lite-api.jup.ag/swap/v1/quote')) {
      assert.equal(url.includes('platformFeeBps='), false, 'Jupiter default must charge 0 platformFeeBps');
      return jsonResponse({ outAmount: '5000000' });
    }
    if (url.includes('aggregator-api.kyberswap.com')) {
      assert.equal(url.includes('feeAmount='), false, 'KyberSwap default must charge 0 feeBps');
      return jsonResponse({ code: 0, data: { routeSummary: { amountOut: '1000000000', amountInUsd: '10', amountOutUsd: '10' } } });
    }
    if (url.includes('api.paraswap.io/prices')) {
      assert.equal(url.includes('partnerFeeBps='), false, 'ParaSwap default must charge 0 partnerFeeBps');
      return jsonResponse({ priceRoute: { destAmount: '900000000' } });
    }
    return jsonResponse({}, 404);
  }, async (calls) => {
    const ocDefault = await nearIntents.quoteIntentSwapOrWithdraw({
      originAsset: 'nep141:wrap.near',
      destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      amountRaw: '1000000000000000000000000',
      recipient: 'alice.near',
      dry: true
    });
    assert.equal(ocDefault.ok, true);
    assert.equal(ocDefault.serviceFeeBps, 25);
    assert.deepEqual(ocDefault.quote._echoAppFees, [{ recipient: 'zhic49280.near', fee: 25 }]);

    const ocZero = await nearIntents.quoteIntentSwapOrWithdraw({
      originAsset: 'nep141:sol.omft.near',
      destinationAsset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      amountRaw: '1000000000',
      recipient: 'alice.near',
      appFeeBps: 0,
      dry: true
    });
    assert.equal(ocZero.ok, true);
    assert.equal(ocZero.serviceFeeBps, 0);
    assert.equal(ocZero.quote._echoAppFees, null);

    const solQ = await chainContracts.quoteSolanaJupiterSwap({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amountRaw: '100000000'
    });
    assert.equal(solQ.serviceFeeBps, 0);
    assert.equal(solQ.outAmount, '5000000');

    const evmQ = await chainContracts.quoteEvmDexSwap({
      chainKey: 'base',
      srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      destToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amountRaw: '100000000000000000',
      srcDecimals: 18,
      destDecimals: 6
    });
    assert.equal(evmQ.ok, true);
    assert.equal(evmQ.serviceFeeBps, 0);
    assert.equal(calls.some((c) => c.url.includes('platformFeeBps=') || c.url.includes('feeAmount=')), false);
  });
});

test('v5.4 True Net Swap Output & Source Gating & Active Order Persistence / UX', async () => {
  // 1. Legacy CROSS_CHAIN_TO_SOL_DEX / CROSS_CHAIN_TO_EVM_DEX reserve & net deduction via intermediaryRaw
  const emptyWallet = {
    id: 'w_v54',
    accountType: 'standard',
    nearNamedAccount: 'alice.near',
    nativeBalances: { sol: 0, eth: 0, near: 10, prl: 50 },
    splBalances: {}
  };
  const nearTok = { blockchain: 'near', symbol: 'NEAR', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24 };
  const newSplTok = { blockchain: 'sol', symbol: 'JUP', assetId: 'sol:JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', contractAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 };
  const legacySolDexQuote = {
    compositeType: 'CROSS_CHAIN_TO_SOL_DEX',
    intermediaryRaw: '1000000000', // 1.0 SOL bridged
    amountOut: '200000000',
    amountOutFormatted: '200'
  };
  const gInfo = uiController.getTargetChainGasReserveInfo(emptyWallet, nearTok, newSplTok, 'auto', legacySolDexQuote);
  assert.equal(gInfo.showSelector, true);
  assert.equal(gInfo.selectedReserve, 0.0035);
  const net = uiController.computeNetSwapOutput(legacySolDexQuote, newSplTok, gInfo, 200);
  assert.ok(Math.abs(net.netOutNum - 200 * (1 - 0.0035)) < 1e-6);

  // 2. Source chain gating
  assert.equal(uiController.isSwapOriginSupported({ blockchain: 'prl' }), true);
  assert.equal(uiController.isSwapOriginSupported({ blockchain: 'arc' }), true);
  assert.equal(uiController.isSwapOriginSupported({ blockchain: 'btc' }), true);
  assert.equal(uiController.isSwapOriginSupported({ blockchain: 'qtc' }), false);

  // 3. Persistent active swap order across initState + clearSavedSwapOrder
  await withMockedStorage({}, async () => {
    const sampleOrder = {
      depositAddress: 'prl1p0000000000000000000000000000000000000000000000000000q3p4s5',
      originTxHash: 'abc123def4567890',
      autoBroadcasted: true,
      followUpFailed: true,
      status: 'SUCCESS',
      fromSymbol: 'PRL',
      toSymbol: 'SOL',
      createdAt: Date.now()
    };
    state.saveActiveSwapOrder(sampleOrder);
    state.swap.activeOrder = null;
    state.initState();
    assert.equal(state.swap.activeOrder?.originTxHash, 'abc123def4567890');
    assert.equal(state.swap.activeOrder?.autoBroadcasted, true);

    // Mock DOM to verify manual QR box hidden when autoBroadcasted=true, and resume button shown when followUpFailed=true
    const makeEl = () => {
      const classes = new Set();
      return {
        textContent: '',
        innerHTML: '',
        value: '',
        disabled: false,
        classList: {
          add: (...xs) => xs.forEach((x) => classes.add(x)),
          remove: (...xs) => xs.forEach((x) => classes.delete(x)),
          toggle: (x, force) => (force === undefined ? (classes.has(x) ? classes.delete(x) : classes.add(x)) : (force ? classes.add(x) : classes.delete(x))),
          contains: (x) => classes.has(x)
        }
      };
    };
    const domMap = {
      'swap-order-card': makeEl(),
      'swap-order-deposit-addr': makeEl(),
      'swap-order-status': makeEl(),
      'swap-order-tx-row': makeEl(),
      'swap-order-origin-tx': makeEl(),
      'swap-order-manual-box': makeEl(),
      'swap-order-qr': makeEl(),
      'btn-resume-swap-stage': makeEl()
    };
    const prevDoc = globalThis.document;
    globalThis.document = {
      getElementById: (id) => domMap[id] || null,
      querySelectorAll: () => [],
      querySelector: () => null
    };
    try {
      uiController.renderSwapOrderCard();
      assert.equal(domMap['swap-order-card'].classList.contains('hidden'), false);
      assert.equal(domMap['swap-order-manual-box'].classList.contains('hidden'), true, 'Auto-broadcasted swaps must hide manual QR/paste box');
      assert.equal(domMap['swap-order-qr'].classList.contains('hidden'), true);
      assert.equal(domMap['swap-order-tx-row'].classList.contains('hidden'), false);
      assert.equal(domMap['btn-resume-swap-stage'].classList.contains('hidden'), false);
    } finally {
      if (prevDoc === undefined) delete globalThis.document;
      else globalThis.document = prevDoc;
    }

    state.clearSavedSwapOrder();
    state.swap.activeOrder = null;
    state.initState();
    assert.equal(state.swap.activeOrder, null);
  });
});

test('v5.4 Pearl UTXO v0/v1 SPK, Immature Coinbase Filtering, FastNear /ft & Key Derivation Cache', async () => {
  // 1. SegWit v0 (prl1q) & v1 Taproot (prl1p) output scriptPubKey support
  const prog20 = Array.from({ length: 20 }, (_, i) => (i + 1) & 0xff);
  const convert8to5 = (bytes) => {
    let acc = 0; let bits = 0; const res = [];
    for (const b of bytes) {
      acc = (acc << 8) | b; bits += 8;
      while (bits >= 5) { bits -= 5; res.push((acc >> bits) & 31); }
    }
    if (bits > 0) res.push((acc << (5 - bits)) & 31);
    return res;
  };
  const charset = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const hrpExpand = (h) => [...h.split('').map(c => c.charCodeAt(0) >> 5), 0, ...h.split('').map(c => c.charCodeAt(0) & 31)];
  const polymod = (vals) => {
    const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let c = 1;
    for (const v of vals) {
      const b = c >>> 25; c = ((c & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= G[i];
    }
    return c;
  };
  const valsV0 = [0, ...convert8to5(prog20)];
  const chkV0 = polymod(hrpExpand('prl').concat(valsV0).concat([0, 0, 0, 0, 0, 0])) ^ 1;
  const addrV0 = 'prl1' + valsV0.concat([0, 1, 2, 3, 4, 5].map(i => (chkV0 >> (5 * (5 - i))) & 31)).map(v => charset[v]).join('');
  const spkV0 = chainContracts.pearlOutputScriptPubKey(cryptoEngine, addrV0);
  assert.equal(spkV0[0], 0x00);
  assert.equal(spkV0[1], 20);

  const pearl = await cryptoEngine.derivePearlFromSeedAsync(TEST_MNEMONIC, "m/86'/808276'/0'/0/0", true);
  const spkV1 = chainContracts.pearlOutputScriptPubKey(cryptoEngine, pearl.address);
  assert.equal(spkV1[0], 0x51);
  assert.equal(spkV1[1], 0x20);

  // 2. Reject immature coinbase UTXO before broadcast
  await withMockedFetch(async (url) => {
    if (url.includes('/api/v2/utxo/')) {
      return jsonResponse([{ txid: 'aa'.repeat(32), vout: 0, value: '1000000000', coinbase: true, confirmations: 12 }]);
    }
    if (url.includes('/api/v2/estimatefee/')) return jsonResponse({ result: '0.0065' });
    return jsonResponse({}, 404);
  }, async () => {
    await assert.rejects(
      chainContracts.executePearlTransfer({
        wallet: { ...pearl, nativeBalances: { prl: 10 }, address: pearl.address, tweakedPrivateKeyHex: pearl.tweakedPrivateKeyHex },
        toAddress: addrV0,
        amountPrl: 1
      }),
      /UTXO|成熟|maturing/i
    );
  });

  // 3. Key derivation cache sets _mpcDerivedForNearId
  const cachedWallet = { mnemonic: TEST_MNEMONIC, nearNamedAccount: 'alice.near', nearAddress: 'alice.near' };
  await chainContracts.ensureWalletSigningKeysAsync(cachedWallet);
  assert.equal(cachedWallet._mpcDerivedForNearId, 'alice.near');
  const firstEvm = cachedWallet.evmAddress;
  await chainContracts.ensureWalletSigningKeysAsync(cachedWallet);
  assert.equal(cachedWallet.evmAddress, firstEvm);

  // 4. FastNear single-request /ft aggregation for >2 contracts
  await withMockedFetch(async (url) => {
    if (url.includes('api.fastnear.com/v1/account/alice.near/ft')) {
      return jsonResponse({
        account_id: 'alice.near',
        tokens: [
          { contract_id: 'prl.omft.near', balance: '250000000' },
          { contract_id: 'wrap.near', balance: '1000000000000000000000000' }
        ]
      });
    }
    return jsonResponse({}, 404);
  }, async (calls) => {
    const res = await nearIntents.fetchNearNep141Balances('alice.near', {
      'prl.omft.near': 8,
      'wrap.near': 24,
      'usdt.tether-token.near': 6
    });
    assert.equal(res['prl.omft.near'].formatted, 2.5);
    assert.equal(res['wrap.near'].formatted, 1);
    assert.equal(res['usdt.tether-token.near'].formatted, 0);
    assert.equal(calls.length, 1);
  });
});

test('v5.4 Staking: Burrow 24-dec wrap.near / max withdraw, Burrow supply positions & NEAR 429 cooldown', async () => {
  await withMockedFetch(async (url, opts) => {
    if (url.includes('api.fastnear.com/v1/account/bob.near/full')) {
      return jsonResponse({ pools: [] });
    }
    if ((url.includes('free.rpc.fastnear.com') || url.includes('rpc.mainnet.near.org')) && opts?.body) {
      const b = JSON.parse(opts.body);
      if (b.method === 'query' && b.params?.account_id === 'contract.main.burrow.near' && b.params?.method_name === 'get_account') {
        const resBytes = [...Buffer.from(JSON.stringify({
          supplied: [{ token_id: 'wrap.near', balance: (2n * 10n ** 24n).toString(), shares: '1', apr: '0.03' }]
        }))];
        return jsonResponse({ jsonrpc: '2.0', result: { result: resBytes } });
      }
      if (b.method === 'query' && b.params?.account_id === 'contract.main.burrow.near' && b.params?.method_name === 'get_asset') {
        const resBytes = [...Buffer.from(JSON.stringify({ config: { extra_decimals: 0 } }))];
        return jsonResponse({ jsonrpc: '2.0', result: { result: resBytes } });
      }
      if (b.method === 'query' && b.params?.request_type === 'view_access_key') {
        return jsonResponse({ jsonrpc: '2.0', result: { nonce: 10, block_hash: '11111111111111111111111111111111' } });
      }
      if (b.method === 'broadcast_tx_commit') {
        return jsonResponse({ jsonrpc: '2.0', result: { transaction: { hash: 'BurrowWithdrawHash555' }, status: { SuccessValue: '' } } });
      }
    }
    return jsonResponse({}, 404);
  }, async (calls) => {
    const pos = await chainContracts.fetchNearAccountStakingPositionsAsync('bob.near');
    const burrowPos = pos.find((p) => p.type === 'burrow_supply');
    assert.ok(burrowPos, 'Burrow supplied position must be discovered');
    assert.equal(burrowPos.totalAmount, 2);
    assert.equal(burrowPos.decimals, 24);

    const nearKeys = await cryptoEngine.deriveNearFromSeedAsync(TEST_MNEMONIC, 0);
    const wallet = {
      id: 'w_bob',
      accountType: 'standard',
      nearNamedAccount: 'bob.near',
      nearAddress: nearKeys.nearAddress,
      nearPublicKey: nearKeys.nearPublicKey,
      nearPrivateKey: nearKeys.nearPrivateKey,
      nearPrivateSeedHex: nearKeys.nearPrivateSeedHex,
      nearBalance: 5,
      nativeBalances: { near: 5 }
    };
    const wMax = await chainContracts.withdrawFromBurrow({ wallet, tokenContract: 'wrap.near', amount: 'max', decimals: 24 });
    assert.equal(wMax.txHash, 'BurrowWithdrawHash555');
    // Verify tx payload omitted max_amount on 'max'
    const lastBcast = calls.filter((c) => c.options?.body && c.options.body.includes('broadcast_tx_commit')).pop();
    const signedRaw = Buffer.from(JSON.parse(lastBcast.options.body).params[0], 'base64').toString('utf8');
    assert.equal(signedRaw.includes('max_amount'), false, 'Burrow max withdraw should omit max_amount to withdraw 100%');
    assert.equal(signedRaw.includes('"token_id":"wrap.near"'), true);
  });
});

test('v5.5 Upfront NEAR Hub & MPC Gas Pre-Validation before Multi-Stage Swaps', () => {
  const zeroNearWallet = { accountType: 'standard', nativeBalances: { near: 0, prl: 20, sol: 1 }, nearBalance: 0 };
  const fundedNearWallet = { accountType: 'standard', nativeBalances: { near: 0.05, prl: 20, sol: 1 }, nearBalance: 0.05 };

  const prlL1Tok = { blockchain: 'prl', symbol: 'PRL', assetId: 'nep141:prl.omft.near' };
  const prlNearTok = { blockchain: 'near', symbol: 'PRL', assetId: '1cs_v1:near:nep141:prl.omft.near', contractAddress: 'prl.omft.near' };
  const solTok = { blockchain: 'sol', symbol: 'SOL', assetId: 'nep141:sol.omft.near', contractAddress: 'So11111111111111111111111111111111111111112' };
  const ethTok = { blockchain: 'eth', symbol: 'ETH', assetId: 'nep141:eth.omft.near', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' };

  // 1. Pearl L1 PRL -> SOL with 0 NEAR must be blocked upfront (needs >= 0.02 NEAR for NEAR hub stage)
  assert.throws(
    () => uiController.validateSwapNearGasRequirement({ wallet: zeroNearWallet, fromToken: prlL1Tok, toToken: solTok }),
    /NEAR 余额不足|Insufficient NEAR/
  );

  // With SMART_HUB_ROUTE + DEST_DEX, requires 0.03 NEAR (0.02 hub + 0.01 MPC)
  assert.throws(
    () => uiController.validateSwapNearGasRequirement({
      wallet: { accountType: 'standard', nativeBalances: { near: 0.025 } },
      fromToken: prlL1Tok,
      toToken: solTok,
      quoteData: { compositeType: 'SMART_HUB_ROUTE', stages: [{ type: 'BRIDGE_IN' }, { type: 'NEAR_SWAP' }, { type: 'BRIDGE_OUT' }, { type: 'DEST_DEX', chain: 'sol' }] }
    }),
    /NEAR 余额不足|Insufficient NEAR/
  );

  // 2. Pure Pearl L1 PRL -> NEAR PRL bridge needs 0 NEAR (direct 1Click L1 bridge)
  const bridgeCheck = uiController.validateSwapNearGasRequirement({ wallet: zeroNearWallet, fromToken: prlL1Tok, toToken: prlNearTok });
  assert.equal(bridgeCheck.ok, true);
  assert.equal(bridgeCheck.requiredNear, 0);

  // 3. MPC SOL -> ETH with 0 NEAR and no solPrivateSeedHex must be blocked upfront (needs >= 0.01 NEAR)
  assert.throws(
    () => uiController.validateSwapNearGasRequirement({ wallet: zeroNearWallet, fromToken: solTok, toToken: ethTok }),
    /NEAR 余额不足|Insufficient NEAR/
  );

  // 4. Funded NEAR wallet passes both Pearl L1 PRL -> SOL (with DEST_DEX) and MPC SOL -> ETH
  const prlOk = uiController.validateSwapNearGasRequirement({
    wallet: fundedNearWallet,
    fromToken: prlL1Tok,
    toToken: solTok,
    quoteData: { compositeType: 'SMART_HUB_ROUTE', stages: [{ type: 'BRIDGE_IN' }, { type: 'NEAR_SWAP' }, { type: 'BRIDGE_OUT' }, { type: 'DEST_DEX', chain: 'sol' }] }
  });
  assert.equal(prlOk.ok, true);
  assert.equal(prlOk.requiredNear, 0.03);

  const solOk = uiController.validateSwapNearGasRequirement({ wallet: fundedNearWallet, fromToken: solTok, toToken: ethTok });
  assert.equal(solOk.ok, true);
  assert.equal(solOk.requiredNear, 0.01);
});
