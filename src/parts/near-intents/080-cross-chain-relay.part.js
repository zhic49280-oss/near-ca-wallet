  async function _execQuoteCrossChainWithDexRelay(params = {}) {
    const { fromToken, toToken, signal = null } = params;
    if (!fromToken || !toToken) return quoteCrossChainWithDexRelayLegacy(params);
    const fromBc = String(fromToken.blockchain || '').toLowerCase();
    const toBc = String(toToken.blockchain || '').toLowerCase();
    if (fromBc === 'near' && toBc === 'near') return quoteCrossChainWithDexRelayLegacy(params);
    if (fromBc === 'arc' || toBc === 'arc') return quoteCrossChainWithDexRelayLegacy(params);

    const prlInvolved = isPrlAssetId(fromToken.assetId) || isPrlAssetId(toToken.assetId);
    const isOneClickDirectAsset = (tok) => /^(nep141:|nep245:|1cs_v1:)/i.test(String(resolveOneClickAssetId(tok, tok.blockchain) || ''));
    const isDexOnlySol = toBc === 'sol' && Boolean(toToken.contractAddress) && toToken.contractAddress !== SOL_NATIVE_WSOL && !isOneClickDirectAsset(toToken);
    const isDexOnlyEvm = ['eth', 'base', 'arb', 'op', 'pol', 'avax', 'bsc', 'hood'].includes(toBc) && Boolean(toToken.contractAddress) && toToken.contractAddress.toLowerCase() !== EVM_NATIVE_SENTINEL && !isOneClickDirectAsset(toToken);
    const isOriginDexOnly = (fromBc === 'sol' && Boolean(fromToken.contractAddress) && fromToken.contractAddress !== SOL_NATIVE_WSOL && !isOneClickDirectAsset(fromToken))
      || (['eth', 'base', 'arb', 'op', 'pol', 'avax', 'bsc', 'hood'].includes(fromBc) && Boolean(fromToken.contractAddress) && fromToken.contractAddress.toLowerCase() !== EVM_NATIVE_SENTINEL && !isOneClickDirectAsset(fromToken));

    // Fast path: direct 1Click-to-1Click pair (e.g. NEAR -> SOL/ETH/USDC) runs in 1 single request (~1s);
    // only falls back to multi-hub Smart Hub Router when direct quote fails.
    if (!prlInvolved && !isDexOnlySol && !isDexOnlyEvm && !isOriginDexOnly && isOneClickDirectAsset(fromToken) && isOneClickDirectAsset(toToken)) {
      const legacyDirect = await quoteCrossChainWithDexRelayLegacy(params).catch((e) => ({ ok: false, error: e && e.message ? e.message : 'legacy failed' }));
      if ((signal && signal.aborted) || (legacyDirect && legacyDirect.ok && /^\d+$/.test(String(legacyDirect.amountOut || '')) && BigInt(legacyDirect.amountOut) > 0n)) {
        return legacyDirect;
      }
      const smartFallback = await quoteSmartHubRoute(params).catch((e) => ({ ok: false, error: e && e.message ? e.message : 'smart route failed' }));
      return (smartFallback && smartFallback.ok) ? smartFallback : legacyDirect;
    }

    const smartPromise = quoteSmartHubRoute(params).catch((e) => ({ ok: false, error: e && e.message ? e.message : 'smart route failed' }));
    const legacyPromise = quoteCrossChainWithDexRelayLegacy(params).catch((e) => ({ ok: false, error: e && e.message ? e.message : 'legacy failed' }));

    // Never let multi-stage Smart Hub route block swap quote > 2000ms after a direct/legacy route has succeeded
    const cappedSmartPromise = new Promise((resolve) => {
      let settled = false;
      let timer = null;
      const finish = (val) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(val);
      };
      smartPromise.then(finish);
      legacyPromise.then((leg) => {
        const legOk = leg && leg.ok && /^\d+$/.test(String(leg.amountOut || '')) && BigInt(leg.amountOut) > 0n;
        if (legOk && !settled) {
          timer = setTimeout(() => finish({ ok: false, error: 'smart route timeout' }), 2000);
        }
      });
    });

    const [smart, legacy] = await Promise.all([cappedSmartPromise, legacyPromise]);
    const smartOk = smart && smart.ok;
    const legacyOk = legacy && legacy.ok && /^\d+$/.test(String(legacy.amountOut || '')) && BigInt(legacy.amountOut) > 0n;
    if (smartOk && legacyOk) {
      if (prlInvolved && legacy.compositeType) return smart;
      const sBig = BigInt(smart.amountOut);
      const lBig = BigInt(legacy.amountOut);
      const sStages = Array.isArray(smart.stages) ? smart.stages.length : 2;
      const lStages = Array.isArray(legacy.stages) ? legacy.stages.length : (legacy.compositeType ? 2 : 1);
      // Prefer fewer stages unless the extra stage beats it by > 0.3%; on equal stages & equal output, preserve legacy compositeType
      if (lStages < sStages && sBig * 1000n <= lBig * 1003n) return legacy;
      if (sStages < lStages && lBig * 1000n <= sBig * 1003n) return smart;
      return sBig > lBig ? smart : legacy;
    }
    if (smartOk) return smart;
    if (legacyOk) return legacy;
    return (smart && smart.error && smart.error !== 'same-chain') ? smart : legacy;
  }
  async function quoteCrossChainWithDexRelayLegacy({
    fromToken,
    toToken,
    amountRaw,
    slippageBps = 100,
    recipient,
    refundTo,
    nearAccountId,
    solAddress,
    evmAddress,
    requireThirdPartyRecipient = false,
    signal = null
  } = {}) {
    if (!fromToken || !toToken) {
      return { ok: false, error: t('缺少代币参数', 'Missing fromToken or toToken') };
    }
    const fromBc = String(fromToken.blockchain || '').toLowerCase();
    const toBc = String(toToken.blockchain || '').toLowerCase();
    const amtStr = String(amountRaw || '0').trim();
    const contracts = getContractsHelper();

    if (fromBc === 'near' && toBc === 'near') {
      return quoteBestNearPairSwap({ fromToken, toToken, amountRaw: amtStr, slippageBps, recipient, nearAccountId, requireThirdPartyRecipient, signal });
    }

    const originIsPrl = isPrlAssetId(fromToken.assetId);
    const destIsPrl = isPrlAssetId(toToken.assetId);
    const resolvedOriginAsset = resolveOneClickAssetId(fromToken, fromBc);
    const resolvedDestAsset = resolveOneClickAssetId(toToken, toBc);
    const isTargetOneClickDirect = /^(nep141:|1cs_v1:)/i.test(resolvedDestAsset);
    const isTargetSolDex = toBc === 'sol' && Boolean(toToken.contractAddress) && toToken.contractAddress !== SOL_NATIVE_WSOL && !isTargetOneClickDirect;
    const isOriginSolDex = fromBc === 'sol' && Boolean(fromToken.contractAddress) && fromToken.contractAddress !== SOL_NATIVE_WSOL && !/^(nep141:|1cs_v1:)/i.test(resolvedOriginAsset);
    const isTargetEvmToken = ['eth', 'base', 'arb', 'bsc', 'hood'].includes(toBc) && Boolean(toToken.contractAddress) && toToken.contractAddress.toLowerCase() !== EVM_NATIVE_SENTINEL;
    const isTargetEvmDex = isTargetEvmToken && !isTargetOneClickDirect;

    // 1. PRL pairs with 1Click-reachable tokens (not DEX-only target tokens or Arc)
    if ((originIsPrl !== destIsPrl) && !isTargetSolDex && !isTargetEvmDex && toBc !== 'arc' && fromBc !== 'arc') {
      const prlRes = await quoteIntentSwapOrWithdraw({
        originAsset: resolvedOriginAsset,
        destinationAsset: resolvedDestAsset,
        amountRaw: amtStr,
        slippageBps,
        recipient,
        refundTo,
        nearAccountId,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: true,
        signal
      });
      if (prlRes && prlRes.ok && prlRes.compositeType && !prlRes.routeLabel) {
        if (prlRes.bridgeQuote && prlRes.compositeType === 'PRL_TO_NEAR_REF') {
          prlRes.routeLabel = prlRes.refQuote && prlRes.refQuote.isDcl
            ? '1Click (Pearl➔NEAR) + Rhea DCL'
            : '1Click (Pearl➔NEAR) + Ref Finance';
        } else {
          prlRes.routeLabel = prlRes.compositeType === 'PRL_TO_EXTERNAL' || prlRes.compositeType === 'EXTERNAL_TO_PRL'
            ? 'Ref Finance (#9010) + 1Click'
            : 'Ref Finance (v2.ref-finance.near)';
        }
      }
      return prlRes;
    }

    // Helper: Stage 1 bridge quote from `fromToken` to an intermediate L1 native/hub asset (e.g. SOL, ETH, or Base USDC)
    const quoteBridgeToIntermediate = async (interAssetId, interRecipient) => {
      if (originIsPrl) {
        return quoteCompositePrlSwap({
          originAsset: resolvedOriginAsset,
          destinationAsset: interAssetId,
          amountRaw: amtStr,
          slippageBps,
          recipient: interRecipient,
          refundTo,
          nearAccountId,
          signal
        });
      }
      if (isOriginSolDex && contracts && typeof contracts.quoteSolanaJupiterSwap === 'function') {
        const solS1 = await contracts.quoteSolanaJupiterSwap({
          inputMint: fromToken.contractAddress,
          outputMint: SOL_NATIVE_WSOL,
          amountRaw: amtStr,
          slippageBps,
          signal
        });
        return quoteIntentSwapOrWithdraw({
          originAsset: SOL_1CLICK_ASSET_ID,
          destinationAsset: interAssetId,
          amountRaw: solS1.outAmount,
          slippageBps,
          recipient: interRecipient,
          refundTo: solAddress || refundTo,
          nearAccountId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true,
          signal
        });
      }
      if (resolvedOriginAsset.toLowerCase() === interAssetId.toLowerCase()) {
        return { ok: true, amountOut: amtStr, amountInUsd: null, serviceFeeBps: 0 };
      }
      return quoteIntentSwapOrWithdraw({
        originAsset: resolvedOriginAsset,
        destinationAsset: interAssetId,
        amountRaw: amtStr,
        slippageBps,
        recipient: interRecipient,
        refundTo,
        nearAccountId,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: true,
        signal
      });
    };

    // Case D: Any Chain -> Arc Mainnet (5042)
    if (toBc === 'arc' && fromBc !== 'arc') {
      const evmUser = /^0x[0-9a-fA-F]{40}$/.test(String(evmAddress || ''))
        ? evmAddress
        : (/^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : '');
      if (!evmUser) {
        return { ok: false, error: t('请先初始化或提供有效的 EVM 钱包地址', 'Valid EVM address required for Arc bridge quote') };
      }
      const arcRecip = /^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : evmUser;
      const rawDestAddr = String(toToken.contractAddress || ARC_USDC_CONTRACT).trim();
      const arcDestContract = rawDestAddr.toLowerCase() === EVM_NATIVE_SENTINEL ? ARC_USDC_CONTRACT : rawDestAddr;
      const destIsArcUsdc = arcDestContract.toLowerCase() === ARC_USDC_CONTRACT;
      const toDec = typeof toToken.decimals === 'number' ? toToken.decimals : (destIsArcUsdc ? 6 : 18);

      const pickBestEvmBridge = async (origChainId, origCurrency, bridgeAmt) => {
        const [rQ, lQ] = await Promise.all([
          quoteRelayBridge({
            user: evmUser,
            recipient: destIsArcUsdc ? arcRecip : evmUser,
            originChainId: origChainId,
            destinationChainId: 5042,
            originCurrency: origCurrency,
            destinationCurrency: ARC_USDC_CONTRACT,
            amount: bridgeAmt,
            signal
          }),
          quoteLifiBridge({
            fromChain: origChainId,
            toChain: 5042,
            fromToken: origCurrency,
            toToken: ARC_USDC_CONTRACT,
            fromAmount: bridgeAmt,
            fromAddress: evmUser,
            toAddress: destIsArcUsdc ? arcRecip : evmUser,
            slippageBps,
            signal
          })
        ]);
        const cands = [rQ, lQ].filter((x) => x && x.ok && BigInt(x.amountOut) > 0n);
        if (cands.length === 0) return rQ.error ? rQ : lQ;
        cands.sort((a, b) => (BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : BigInt(b.amountOut) < BigInt(a.amountOut) ? -1 : 0));
        return { ...cands[0], comparedBridgeCount: cands.length };
      };

      const directOriginChainId = ARC_BRIDGE_EVM_CHAINS[fromBc];
      let stage1 = null;
      let bridge = null;
      if (directOriginChainId && directOriginChainId !== 5042) {
        const origCurrency = fromToken.contractAddress || EVM_NATIVE_SENTINEL;
        bridge = await pickBestEvmBridge(directOriginChainId, origCurrency, amtStr);
      } else {
        stage1 = await quoteBridgeToIntermediate(BASE_USDC_1CLICK_ID, evmUser);
        if (!stage1 || !stage1.ok || !stage1.amountOut || BigInt(stage1.amountOut) <= 0n) {
          return stage1 || { ok: false, error: t('跨链至 Base USDC 询价失败', 'Stage 1 Base USDC quote failed') };
        }
        bridge = await pickBestEvmBridge(8453, BASE_USDC_EVM, stage1.amountOut);
      }

      if (!bridge || !bridge.ok) {
        return bridge || { ok: false, error: t('Relay/LI.FI 至 Arc 跨链询价失败', 'Bridge quote to Arc Mainnet failed') };
      }

      const arcUsdcOut = bridge.amountOut;
      let finalAmountOut = arcUsdcOut;
      let dexQuote = null;
      if (!destIsArcUsdc && contracts && typeof contracts.quoteEvmDexSwap === 'function') {
        dexQuote = await contracts.quoteEvmDexSwap({
          chainKey: 'arc',
          srcToken: ARC_USDC_CONTRACT,
          destToken: arcDestContract,
          amountRaw: arcUsdcOut,
          srcDecimals: 6,
          destDecimals: toDec,
          slippageBps,
          feeBps: 0,
          fromAddress: evmUser,
          signal
        });
        if (!dexQuote || !dexQuote.ok || !dexQuote.amountOut) {
          return dexQuote || { ok: false, error: t('Arc 链内 DEX 兑换询价失败', 'Arc DEX swap quote failed') };
        }
        finalAmountOut = dexQuote.amountOut;
      }

      const stages = [];
      if (stage1) stages.push(`1Click (${fromBc.toUpperCase()}➔Base)`);
      stages.push(`${bridge.provider} (${stage1 ? 'Base' : fromBc.toUpperCase()}➔Arc)`);
      if (dexQuote) stages.push(dexQuote.bestSource || dexQuote.label || 'KyberSwap (Arc)');

      return {
        ok: true,
        compositeType: directOriginChainId ? 'EVM_TO_ARC_MAINNET' : 'CROSS_CHAIN_TO_ARC_MAINNET',
        relayMode: 'CROSS_CHAIN_TO_ARC_MAINNET',
        stage1Quote: stage1,
        bridgeQuote: bridge,
        dexQuote,
        baseBridgeAssetId: stage1 ? BASE_USDC_1CLICK_ID : null,
        baseBridgeRaw: stage1 ? stage1.amountOut : null,
        intermediaryAssetId: ARC_USDC_CONTRACT,
        intermediaryRaw: arcUsdcOut,
        depositAddress: null,
        memo: null,
        serviceFeeBps: stage1 ? (stage1.serviceFeeBps ?? 25) : 0,
        amountOut: String(finalAmountOut),
        amountOutFormatted: fromBaseUnits(String(finalAmountOut), toDec),
        amountInUsd: (stage1 && stage1.amountInUsd) || bridge.amountInUsd || null,
        amountOutUsd: (dexQuote && dexQuote.amountOutUsd) || bridge.amountOutUsd || null,
        comparedPools: Math.max(Number(bridge.comparedBridgeCount || 1), Number(dexQuote?.comparedPools || 1)),
        bestSource: stages.join(' + '),
        routeLabel: stages.join(' + '),
        error: null
      };
    }

    // Case E: Arc Mainnet (5042) -> Any Chain
    if (fromBc === 'arc' && toBc !== 'arc') {
      const evmUser = /^0x[0-9a-fA-F]{40}$/.test(String(evmAddress || ''))
        ? evmAddress
        : (/^0x[0-9a-fA-F]{40}$/.test(String(refundTo || '')) ? refundTo : '');
      if (!evmUser) {
        return { ok: false, error: t('请先初始化或提供有效的 EVM 钱包地址', 'Valid EVM address required for Arc bridge quote') };
      }
      const rawSrcAddr = String(fromToken.contractAddress || ARC_USDC_CONTRACT).trim();
      const arcSrcContract = rawSrcAddr.toLowerCase() === EVM_NATIVE_SENTINEL ? ARC_USDC_CONTRACT : rawSrcAddr;
      const srcIsArcUsdc = arcSrcContract.toLowerCase() === ARC_USDC_CONTRACT;

      let arcUsdcAmt = srcIsArcUsdc && Number(fromToken.decimals) === 18
        ? (BigInt(amtStr) / 1000000000000n).toString()
        : amtStr;
      let stage1Dex = null;
      if (!srcIsArcUsdc && contracts && typeof contracts.quoteEvmDexSwap === 'function') {
        stage1Dex = await contracts.quoteEvmDexSwap({
          chainKey: 'arc',
          srcToken: arcSrcContract,
          destToken: ARC_USDC_CONTRACT,
          amountRaw: amtStr,
          srcDecimals: typeof fromToken.decimals === 'number' ? fromToken.decimals : 18,
          destDecimals: 6,
          slippageBps,
          feeBps: 0,
          fromAddress: evmUser,
          signal
        });
        if (!stage1Dex || !stage1Dex.ok || !stage1Dex.amountOut) {
          return stage1Dex || { ok: false, error: t('Arc 链内换出 USDC 失败', 'Arc DEX stage 1 quote failed') };
        }
        arcUsdcAmt = stage1Dex.amountOut;
      }

      const [rOut, lOut] = await Promise.all([
        quoteRelayBridge({
          user: evmUser,
          recipient: toBc === 'base' && /^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : evmUser,
          originChainId: 5042,
          destinationChainId: 8453,
          originCurrency: ARC_USDC_CONTRACT,
          destinationCurrency: BASE_USDC_EVM,
          amount: arcUsdcAmt,
          signal
        }),
        quoteLifiBridge({
          fromChain: 5042,
          toChain: 8453,
          fromToken: ARC_USDC_CONTRACT,
          toToken: BASE_USDC_EVM,
          fromAmount: arcUsdcAmt,
          fromAddress: evmUser,
          toAddress: toBc === 'base' && /^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : evmUser,
          slippageBps,
          signal
        })
      ]);
      const bridgeCands = [rOut, lOut].filter((x) => x && x.ok && BigInt(x.amountOut) > 0n);
      if (bridgeCands.length === 0) {
        return rOut.error ? rOut : lOut;
      }
      bridgeCands.sort((a, b) => (BigInt(b.amountOut) > BigInt(a.amountOut) ? 1 : BigInt(b.amountOut) < BigInt(a.amountOut) ? -1 : 0));
      const bestBridge = bridgeCands[0];

      const destIsBaseUsdc = toBc === 'base' && String(toToken.contractAddress || '').toLowerCase() === BASE_USDC_EVM.toLowerCase();
      if (destIsBaseUsdc) {
        const label = `${stage1Dex ? `${stage1Dex.bestSource || 'KyberSwap'} + ` : ''}${bestBridge.provider} (Arc➔Base)`;
        return {
          ok: true,
          compositeType: 'ARC_MAINNET_TO_CROSS_CHAIN',
          stage1DexQuote: stage1Dex,
          bridgeQuote: bestBridge,
          stage3Quote: null,
          intermediaryRaw: arcUsdcAmt,
          baseOutRaw: bestBridge.amountOut,
          serviceFeeBps: 0,
          amountOut: bestBridge.amountOut,
          amountOutFormatted: fromBaseUnits(bestBridge.amountOut, 6),
          amountInUsd: bestBridge.amountInUsd || null,
          amountOutUsd: bestBridge.amountOutUsd || null,
          comparedPools: bridgeCands.length,
          routeLabel: label,
          error: null
        };
      }

      const stage3 = destIsPrl
        ? await quoteCompositePrlSwap({
            originAsset: BASE_USDC_1CLICK_ID,
            destinationAsset: resolvedDestAsset,
            amountRaw: bestBridge.amountOut,
            slippageBps,
            recipient,
            refundTo: evmUser,
            nearAccountId,
            signal
          })
        : await quoteIntentSwapOrWithdraw({
            originAsset: BASE_USDC_1CLICK_ID,
            destinationAsset: resolvedDestAsset,
            amountRaw: bestBridge.amountOut,
            slippageBps,
            recipient,
            refundTo: evmUser,
            nearAccountId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: true,
            signal
          });
      if (!stage3 || !stage3.ok) {
        return stage3 || { ok: false, error: t('Base USDC 转目标链询价失败', 'Stage 3 cross-chain quote failed') };
      }
      const toDec = typeof toToken.decimals === 'number' ? toToken.decimals : resolveTokenDecimals(resolvedDestAsset);
      const label = `${stage1Dex ? `${stage1Dex.bestSource || 'KyberSwap'} + ` : ''}${bestBridge.provider} (Arc➔Base) + 1Click`;
      return {
        ...stage3,
        ok: true,
        compositeType: 'ARC_MAINNET_TO_CROSS_CHAIN',
        stage1DexQuote: stage1Dex,
        bridgeQuote: bestBridge,
        stage3Quote: stage3,
        serviceFeeBps: stage3.serviceFeeBps !== undefined ? stage3.serviceFeeBps : (stage3.depositAddress ? 25 : 0),
        intermediaryRaw: arcUsdcAmt,
        baseOutRaw: bestBridge.amountOut,
        amountOutFormatted: stage3.amountOutFormatted || fromBaseUnits(stage3.amountOut || '0', toDec),
        amountInUsd: bestBridge.amountInUsd || stage3.amountInUsd || null,
        comparedPools: bridgeCands.length,
        routeLabel: label
      };
    }

    // 2. Target is Solana Token (e.g. 100 NEAR -> NVDAx, TSLAx, JUP, BONK): compare Direct 1Click vs Cross-Chain -> SOL -> Jupiter+Raydium
    if (toBc === 'sol' && contracts && typeof contracts.quoteSolanaJupiterSwap === 'function') {
      const canTryDirect = /^(nep141:|1cs_v1:)/i.test(resolvedDestAsset);
      const solRecip = solAddress || recipient;
      const directPromise = canTryDirect
        ? quoteIntentSwapOrWithdraw({
            originAsset: resolvedOriginAsset,
            destinationAsset: resolvedDestAsset,
            amountRaw: amtStr,
            slippageBps,
            recipient: solRecip,
            refundTo,
            nearAccountId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: true,
            signal
          }).catch(() => null)
        : Promise.resolve(null);

      const relayPromise = (async () => {
        if (!toToken.contractAddress || toToken.contractAddress === SOL_NATIVE_WSOL) return null;
        const stage1 = await quoteBridgeToIntermediate(SOL_1CLICK_ASSET_ID, solRecip);
        if (!stage1 || !stage1.ok || !stage1.amountOut || BigInt(stage1.amountOut) <= 0n) return stage1;
        const stage2 = await contracts.quoteSolanaJupiterSwap({
          inputMint: SOL_NATIVE_WSOL,
          outputMint: toToken.contractAddress,
          amountRaw: stage1.amountOut,
          slippageBps,
          signal
        });
        const toDec = typeof toToken.decimals === 'number' ? toToken.decimals : 6;
        return {
          ok: true,
          compositeType: 'CROSS_CHAIN_TO_SOL_DEX',
          stage1Quote: stage1,
          stage2DexQuote: stage2,
          intermediaryAssetId: SOL_1CLICK_ASSET_ID,
          intermediaryRaw: stage1.amountOut,
          depositAddress: null,
          memo: null,
          amountOut: String(stage2.outAmount),
          amountOutFormatted: fromBaseUnits(String(stage2.outAmount), toDec),
          amountInUsd: stage1.amountInUsd || null,
          amountOutUsd: null,
          serviceFeeBps: stage1.serviceFeeBps !== undefined ? stage1.serviceFeeBps : 25,
          comparedPools: stage2.comparedPools || 1,
          bestSource: stage2.bestSource || 'Jupiter V1',
          routeLabel: `1Click (➔SOL) + ${stage2.routeLabel || stage2.bestSource || 'Jupiter V1'}`,
          error: null
        };
      })().catch((err) => ({ ok: false, error: err && err.message ? err.message : 'SOL DEX relay failed' }));

      const [dirRes, relRes] = await Promise.allSettled([directPromise, relayPromise]);
      const candidates = [];
      const dirVal = dirRes.status === 'fulfilled' ? dirRes.value : null;
      if (dirVal && dirVal.ok && dirVal.amountOut && BigInt(dirVal.amountOut) > 0n) {
        candidates.push({ outBig: BigInt(dirVal.amountOut), payload: { ...dirVal, routeLabel: dirVal.routeLabel || '1Click Solver' } });
      }
      const relVal = relRes.status === 'fulfilled' ? relRes.value : null;
      if (relVal && relVal.ok && relVal.amountOut && BigInt(relVal.amountOut) > 0n) {
        candidates.push({ outBig: BigInt(relVal.amountOut), payload: relVal });
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
        return candidates[0].payload;
      }
      return relVal || dirVal || { ok: false, error: t('暂无跨链至 Solana DEX 报价', 'No Solana DEX relay quote available') };
    }

    // 3. Origin is Solana DEX Token (e.g. NVDAx / TSLAx / JUP -> NEAR / ETH / PRL / QTC)
    if (isOriginSolDex && contracts && typeof contracts.quoteSolanaJupiterSwap === 'function') {
      try {
        const stage1 = await contracts.quoteSolanaJupiterSwap({
          inputMint: fromToken.contractAddress,
          outputMint: SOL_NATIVE_WSOL,
          amountRaw: amtStr,
          slippageBps,
          signal
        });
        const solRefund = solAddress || refundTo;
        const stage2 = await quoteIntentSwapOrWithdraw({
          originAsset: SOL_1CLICK_ASSET_ID,
          destinationAsset: resolvedDestAsset,
          amountRaw: stage1.outAmount,
          slippageBps,
          recipient,
          refundTo: solRefund,
          nearAccountId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: true,
          signal
        });
        if (!stage2 || !stage2.ok) return stage2 || { ok: false, error: t('第二阶段跨链询价失败', 'Stage 2 cross-chain quote failed') };
        return {
          ...stage2,
          ok: true,
          compositeType: 'SOL_DEX_TO_CROSS_CHAIN',
          stage1DexQuote: stage1,
          stage2Quote: stage2,
          intermediaryAssetId: SOL_1CLICK_ASSET_ID,
          intermediaryRaw: stage1.outAmount,
          serviceFeeBps: stage2.serviceFeeBps !== undefined ? stage2.serviceFeeBps : 25,
          comparedPools: stage1.comparedPools || 1,
          routeLabel: `${stage1.routeLabel || stage1.bestSource || 'Jupiter V1'} (➔SOL) + ${stage2.routeLabel || '1Click'}`
        };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : t('Solana DEX 跨链询价失败', 'SOL DEX cross-chain quote failed') };
      }
    }

    // 4. Direct 1Click (1-request fast path) -> Automatic EVM DEX Relay fallback (e.g. NEAR -> PONS on Robinhood)
    const canTryDirectCross = /^(nep141:|1cs_v1:)/i.test(resolvedOriginAsset) && /^(nep141:|1cs_v1:)/i.test(resolvedDestAsset);
    const evmInterAsset = EVM_NATIVE_1CLICK_MAP[toBc];
    const canTryEvmRelay = Boolean(isTargetEvmToken && evmInterAsset && contracts && typeof contracts.quoteEvmDexSwap === 'function');

    const runEvmRelay = async () => {
      const targetEvmRecip = evmAddress || recipient;
      const stage1 = await quoteBridgeToIntermediate(evmInterAsset, targetEvmRecip);
      if (!stage1 || !stage1.ok || !stage1.amountOut || BigInt(stage1.amountOut) <= 0n) {
        return stage1 || { ok: false, error: 'Stage 1 EVM bridge failed' };
      }
      const stage2 = await contracts.quoteEvmDexSwap({
        chainKey: toBc,
        srcToken: EVM_NATIVE_SENTINEL,
        destToken: toToken.contractAddress,
        amountRaw: stage1.amountOut,
        srcDecimals: 18,
        destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
        slippageBps,
        fromAddress: /^0x[0-9a-fA-F]{40}$/.test(String(targetEvmRecip || '')) ? targetEvmRecip : undefined,
        signal
      });
      if (!stage2 || !stage2.ok || !stage2.amountOut) {
        return stage2 || { ok: false, error: 'Stage 2 EVM DEX quote failed' };
      }
      return {
        ok: true,
        compositeType: 'CROSS_CHAIN_TO_EVM_DEX',
        stage1Quote: stage1,
        stage2DexQuote: stage2,
        intermediaryAssetId: evmInterAsset,
        intermediaryRaw: stage1.amountOut,
        depositAddress: null,
        memo: null,
        amountOut: String(stage2.amountOut),
        amountOutFormatted: stage2.amountOutFormatted,
        amountInUsd: stage1.amountInUsd || stage2.amountInUsd || null,
        amountOutUsd: stage2.amountOutUsd || null,
        serviceFeeBps: stage1.serviceFeeBps !== undefined ? stage1.serviceFeeBps : 25,
        comparedPools: stage2.comparedPools || 1,
        bestSource: stage2.bestSource || stage2.label,
        routeLabel: `1Click (➔${toBc.toUpperCase()}) + ${stage2.routeLabel || stage2.label}`,
        error: null
      };
    };

    let dirVal = null;
    if (canTryDirectCross) {
      dirVal = await quoteIntentSwapOrWithdraw({
        originAsset: resolvedOriginAsset,
        destinationAsset: resolvedDestAsset,
        amountRaw: amtStr,
        slippageBps,
        recipient,
        refundTo,
        nearAccountId,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: true,
        signal
      }).catch((err) => ({ ok: false, error: err && err.message ? err.message : 'Direct 1Click quote failed' }));
      if (dirVal && dirVal.ok && dirVal.amountOut && BigInt(dirVal.amountOut) > 0n) {
        return { ...dirVal, routeLabel: dirVal.routeLabel || '1Click Cross-Chain' };
      }
    }

    if (canTryEvmRelay) {
      const relVal = await runEvmRelay().catch((err) => ({ ok: false, error: err && err.message ? err.message : 'EVM DEX relay failed' }));
      if (relVal && relVal.ok && relVal.amountOut && BigInt(relVal.amountOut) > 0n) {
        return relVal;
      }
      return dirVal || relVal;
    }

    return dirVal || { ok: false, error: t('暂无跨链报价', 'No cross-chain quote available') };
  }

  /**
   * Signs an intents.near NEP-413 intent payload and publishes it to the Solver Relay
   * or executes execute_intents on-chain via NearCAContracts.
   */
  async function signAndPublishNep413Intent(params = {}) {
    const {
      nearAccountId,
      nearPrivateSeedHex,
      nearPublicKey,
      nearPrivateKey,
      intentActions,
      deadlineIso,
      quoteHashes = [],
      executionMode = 'relay',
      fallbackOnChain = false
    } = params;

    if (!nearAccountId || !nearPrivateSeedHex || !nearPublicKey) {
      throw new Error(t('缺少 NEAR 账户或签名私钥', 'Missing NEAR account credentials for NEP-413 signing'));
    }
    if (!Array.isArray(intentActions) || intentActions.length === 0) {
      throw new Error(t('缺少 intents 操作列表', 'intentActions must be a non-empty array'));
    }

    const cryptoEngine = getCryptoEngine();
    if (!cryptoEngine || typeof cryptoEngine.signNep413IntentMessageAsync !== 'function') {
      throw new Error(t('NEP-413 签名引擎不可用', 'NearCACrypto.signNep413IntentMessageAsync unavailable'));
    }

    const message = JSON.stringify({
      signer_id: nearAccountId,
      deadline: deadlineIso || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      intents: intentActions
    });

    const signed = await cryptoEngine.signNep413IntentMessageAsync({
      message,
      recipient: INTENTS_CONTRACT_ID,
      nearPrivateSeedHex,
      nearPublicKey
    });

    const nonceBase64 =
      signed.nonceBase64 ||
      (typeof signed.nonce === 'string'
        ? signed.nonce
        : signed.nonce
          ? bytesToBase64(signed.nonce)
          : '');
    const signatureStr =
      typeof signed.signature === 'string' && signed.signature.startsWith('ed25519:')
        ? signed.signature
        : `ed25519:${signed.signature}`;

    const signedData = {
      payload: {
        message,
        nonce: nonceBase64,
        recipient: INTENTS_CONTRACT_ID
      },
      standard: 'nep413',
      signature: signatureStr,
      public_key: nearPublicKey
    };

    async function executeOnChain() {
      const contracts = getContractsEngine();
      if (!contracts || typeof contracts.signAndSendNearFunctionCall !== 'function') {
        throw new Error(t('链上合约引擎不可用', 'NearCAContracts.signAndSendNearFunctionCall unavailable'));
      }
      if (!nearPrivateKey) {
        throw new Error(t('链上执行需要 nearPrivateKey', 'nearPrivateKey required for on-chain execute_intents'));
      }
      const txHash = await contracts.signAndSendNearFunctionCall({
        accountId: nearAccountId,
        publicKeyStr: nearPublicKey,
        privateKeyStr: nearPrivateKey,
        receiverId: INTENTS_CONTRACT_ID,
        methodName: 'execute_intents',
        argsJson: JSON.stringify({ signed: [signedData] }),
        gas: '100000000000000',
        depositYocto: '0'
      });
      return {
        signedPayload: signed,
        relayResult: { status: 'ONCHAIN_EXECUTED', txHash }
      };
    }

    if (executionMode === 'onchain') {
      return executeOnChain();
    }

    try {
      const resp = await fetchJsonWithTimeout(
        SOLVER_RELAY_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `publish_intent_${Date.now()}`,
            method: 'publish_intent',
            params: [
              {
                signed_data: signedData,
                quote_hashes: Array.isArray(quoteHashes) ? quoteHashes : []
              }
            ]
          })
        },
        12000
      );

      if (!resp.ok || !resp.data) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText || 'Solver relay failed'}`);
      }
      if (resp.data.error) {
        throw new Error(resp.data.error.message || JSON.stringify(resp.data.error));
      }

      return {
        signedPayload: signed,
        relayResult: resp.data.result !== undefined ? resp.data.result : resp.data
      };
    } catch (err) {
      if (fallbackOnChain && nearPrivateKey) {
        return executeOnChain();
      }
      throw err;
    }
  }

  /**
   * Polls 1Click swap/withdraw order status by depositAddress.
   */
  async function fetchSwapOrderStatus(depositAddress) {
    const addr = String(depositAddress || '').trim();
    if (!addr) {
      return { ok: false, status: null, depositAddress: '', data: null, error: t('缺少充值地址', 'Missing depositAddress') };
    }
    try {
      const resp = await fetchJsonWithTimeout(
        `${ONECLICK_API_URL}/status?depositAddress=${encodeURIComponent(addr)}`,
        {},
        DEFAULT_TIMEOUT_MS
      );
      if (!resp.ok || !resp.data) {
        const errMsg = (resp.data && (resp.data.message || resp.data.error)) || `HTTP ${resp.status}`;
        return { ok: false, status: null, depositAddress: addr, data: resp.data, error: String(errMsg) };
      }
      const status = resp.data.status || resp.data.state || 'PENDING';
      return {
        ok: true,
        status,
        depositAddress: addr,
        data: resp.data,
        error: null
      };
    } catch (err) {
      return {
        ok: false,
        status: null,
        depositAddress: addr,
        data: null,
        error: err && err.message ? err.message : t('状态查询失败', 'Status fetch failed')
      };
    }
  }

  /**
   * Submits an external chain deposit transaction hash to speed up 1Click intent fulfillment.
   */
  async function submitExternalDepositTxHash({ depositAddress, txHash, nearSenderAccount } = {}) {
    const depAddr = String(depositAddress || '').trim();
    const hash = String(txHash || '').trim();
    if (!depAddr || !hash) {
      return { ok: false, data: null, error: t('缺少充值地址或交易哈希', 'Missing depositAddress or txHash') };
    }

    const payload = { depositAddress: depAddr, txHash: hash };
    if (nearSenderAccount) {
      payload.nearSenderAccount = String(nearSenderAccount).trim();
    }

    try {
      const resp = await fetchJsonWithTimeout(
        `${ONECLICK_API_URL}/deposit/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        },
        DEFAULT_TIMEOUT_MS
      );
      if (!resp.ok) {
        const errMsg = (resp.data && (resp.data.message || resp.data.error)) || `HTTP ${resp.status}`;
        return { ok: false, data: resp.data, error: String(errMsg) };
      }
      return { ok: true, data: resp.data, error: null };
    } catch (err) {
      return {
        ok: false,
        data: null,
        error: err && err.message ? err.message : t('提交充值凭证失败', 'Deposit submit failed')
      };
    }
  }

