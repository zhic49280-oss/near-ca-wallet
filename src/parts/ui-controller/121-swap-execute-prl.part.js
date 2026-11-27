      const isDirect1ClickPrl = Boolean((originIsPrl !== destIsPrl) && activeQuote && isDirectOneClickQuote(activeQuote));

      // Sub-route A: NEAR Token -> PRL (Pearl L1) via Ref Finance -> 1Click bridge
      if (!isDirect1ClickPrl && !originIsPrl && destIsPrl && toToken.blockchain === 'prl' && fromToken.blockchain === 'near') {
        advanceStep(0, 'active');
        const refRes = await contracts.executeNearRefFinanceSwap({
          wallet,
          tokenIn: fromToken.contractAddress || 'wrap.near',
          tokenOut: intents.PRL_NEAR_CONTRACT,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          tokenBalance: avail,
          inputDecimals: fromToken.decimals,
          tokenSymbol: fromToken.symbol
        });
        advanceStep(0, 'done', { txHash: refRes.txHash, chain: 'near' });
        advanceStep(1, 'active');
        const prlOutRaw = refRes.amountOut || (st.swap.quoteData && st.swap.quoteData.refQuote && st.swap.quoteData.refQuote.amountOut);
        if (!prlOutRaw) throw new Error(t('兑换后未获得预期 PRL 数量', 'Missing PRL amount after swap'));
        const bridgeQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: intents.PRL_NEAR_ASSET_ID,
          destinationAsset: intents.PRL_PEARL_ASSET_ID,
          amountRaw: prlOutRaw,
          slippageBps: st.swap.slippageBps,
          recipient,
          refundTo: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        }).catch((err) => ({ ok: false, error: err && err.message ? err.message : 'Bridge quote failed' }));
        if (!bridgeQuote.ok || !bridgeQuote.depositAddress) {
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: refRes.txHash || `near_prl_${Date.now()}`,
            status: 'SUCCESS',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: refRes.txHash || '',
            autoBroadcasted: true,
            createdAt: Date.now(),
            followUpFailed: true,
            followUpError: toUserFriendlyError(bridgeQuote.error, '获取 PRL 跨链桥路由失败，请点击继续重试', 'Failed to get PRL bridge route; tap Resume to retry'),
            followUpBridgeOut: {
              originAsset: intents.PRL_NEAR_ASSET_ID,
              hubContract: intents.PRL_NEAR_CONTRACT,
              hubDecimals: 8,
              destinationAsset: intents.PRL_PEARL_ASSET_ID,
              recipient,
              expectedInRaw: prlOutRaw,
              slippageBps: st.swap.slippageBps,
              toSymbol: toToken.symbol
            }
          };
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          renderSwapOrderCard();
          throw new Error(toUserFriendlyError(bridgeQuote.error, '获取 PRL 跨链桥路由失败，请点击订单卡片中的“继续执行下一步”重试', 'Failed to get PRL bridge route; tap Resume in the order card'));
        }
        const prlHuman = intents.fromBaseUnits(prlOutRaw, 8);
        const prlBalMap = await intents.fetchNearNep141Balances(nearId, { [intents.PRL_NEAR_CONTRACT]: 8 }).catch(() => null);
        const realPrlBal = (prlBalMap && prlBalMap[intents.PRL_NEAR_CONTRACT] && prlBalMap[intents.PRL_NEAR_CONTRACT].formatted !== undefined)
          ? Number(prlBalMap[intents.PRL_NEAR_CONTRACT].formatted)
          : (wallet.nearNep141Balances && wallet.nearNep141Balances[intents.PRL_NEAR_CONTRACT]
              ? Number(wallet.nearNep141Balances[intents.PRL_NEAR_CONTRACT].formatted)
              : null);
        let sendBridge;
        try {
          sendBridge = await contracts.executeNearNep141Transfer({
            wallet,
            tokenContract: intents.PRL_NEAR_CONTRACT,
            receiverId: bridgeQuote.depositAddress,
            amount: prlHuman,
            decimals: 8,
            tokenSymbol: 'PRL',
            tokenBalance: realPrlBal
          });
        } catch (bridgeErr) {
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: refRes.txHash || `near_prl_${Date.now()}`,
            status: 'SUCCESS',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: refRes.txHash || '',
            autoBroadcasted: true,
            createdAt: Date.now(),
            followUpFailed: true,
            followUpError: toUserFriendlyError(bridgeErr, '第一阶段已换出 PRL，第二步跨链失败，请点击继续重试', 'Stage 1 swapped to PRL; tap Resume for Stage 2'),
            followUpBridgeOut: {
              originAsset: intents.PRL_NEAR_ASSET_ID,
              hubContract: intents.PRL_NEAR_CONTRACT,
              hubDecimals: 8,
              destinationAsset: intents.PRL_PEARL_ASSET_ID,
              recipient,
              expectedInRaw: prlOutRaw,
              slippageBps: st.swap.slippageBps,
              toSymbol: toToken.symbol
            }
          };
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          renderSwapOrderCard();
          throw bridgeErr;
        }
        await intents.submitExternalDepositTxHash({
          depositAddress: bridgeQuote.depositAddress,
          txHash: sendBridge.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: bridgeQuote.depositAddress,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: 'PRL',
          originTxHash: sendBridge.txHash,
          autoBroadcasted: true,
          createdAt: Date.now()
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: sendBridge.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        renderSwapOrderCard();
        startOrderStatusPolling();
        advanceStep(1, 'done', { txHash: sendBridge.txHash, chain: 'near' });
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        return;
      }

      // Sub-route P: PRL -> NEAR-chain token via Ref multi-hop (tokens 1Click does not list, e.g. oRHEA)
      if (!isDirect1ClickPrl && originIsPrl && !destIsPrl && toToken.blockchain === 'near' && toToken.contractAddress
          && st.swap.quoteData?.compositeType === 'PRL_TO_NEAR_REF' && st.swap.quoteData.refQuote) {
        const refQ = st.swap.quoteData.refQuote;
        if (fromToken.blockchain === 'near') {
          advanceStep(0, 'active');
          const res = await contracts.executeNearRefFinanceSwap({
            wallet,
            routeData: refQ.routeData,
            actions: refQ.actions,
            poolIds: refQ.poolIds,
            minAmountOut: refQ.minAmountOut,
            tokenIn: intents.PRL_NEAR_CONTRACT,
            tokenOut: toToken.contractAddress,
            amountRaw,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail,
            inputDecimals: 8,
            tokenSymbol: 'PRL'
          });
          advanceStep(0, 'done', { txHash: res.txHash, chain: 'near' });
          stepper.finish(true, { text: t('兑换成功', 'Swap completed'), doneTitle: t('兑换成功', 'Swap Completed') });
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            chain: fromToken.blockchain,
            amount: amt,
            txHash: res.txHash,
            title: `${fromToken.symbol} ➔ ${toToken.symbol}`
          });
          showToast(`✅ ${t('兑换成功', 'Swap completed')}: ${shortenAddr(res.txHash)}`);
          refreshAllBalancesAsync(false);
          return;
        }
        const bridgeLive = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: intents.PRL_NEAR_ASSET_ID,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: nearId,
          refundTo,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!bridgeLive.ok || !bridgeLive.depositAddress) {
          throw new Error(bridgeLive.error || t('创建 PRL 跨链订单失败', 'Failed to create PRL bridge order'));
        }
        advanceStep(0, 'active');
        const bridgeTx = await broadcastOriginDepositTx({ wallet, fromToken, amt: amtStr, avail, depositAddress: bridgeLive.depositAddress, gasOverride: originGasOverride });
        if (!bridgeTx || !bridgeTx.txHash) {
          throw new Error(t('转出失败，请检查余额与网络后重试', 'Transfer failed. Please check balance and network.'));
        }
        advanceStep(0, 'done', { txHash: bridgeTx.txHash, chain: fromToken.blockchain });
        if (flowPlan.steps.length > 1) advanceStep(1, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: bridgeLive.depositAddress,
          memo: bridgeLive.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: bridgeTx.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpRefSwap: {
            tokenIn: intents.PRL_NEAR_CONTRACT,
            tokenOut: toToken.contractAddress,
            amountUsdcRaw: bridgeLive.amountOut,
            slippageBps: st.swap.slippageBps,
            inputDecimals: 8,
            tokenSymbol: 'PRL'
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: bridgeTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: bridgeLive.depositAddress,
          txHash: bridgeTx.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        return;
      }
      // Sub-route B: PRL (NEAR) -> External chain (e.g. SOL / ETH / BNB)
      if (!isDirect1ClickPrl && originIsPrl && !destIsPrl && fromToken.blockchain === 'near') {
        const preUsdc = await intents.fetchNearNep141Balances(nearId, { usdc: intents.NEAR_USDC_CONTRACT }).catch(() => null);
        const preUsdcRaw = preUsdc?.usdc?.raw != null ? BigInt(preUsdc.usdc.raw) : null;
        const step1Q = (st.swap.quoteData && st.swap.quoteData.refQuote)
          ? st.swap.quoteData.refQuote
          : await contracts.quoteNearRefFinanceSwap({
              tokenIn: intents.PRL_NEAR_CONTRACT,
              tokenOut: intents.NEAR_USDC_CONTRACT,
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
        if (!step1Q.ok || !step1Q.amountOut) {
          throw new Error(step1Q.error || t('暂无可用兑换路径', 'No swap route available'));
        }
        advanceStep(0, 'active');
        const refPrlRes = await contracts.executeNearRefFinanceSwap({
          wallet,
          routeData: step1Q.routeData,
          actions: step1Q.actions,
          tokenIn: intents.PRL_NEAR_CONTRACT,
          tokenOut: intents.NEAR_USDC_CONTRACT,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          tokenBalance: avail,
          inputDecimals: 8,
          tokenSymbol: 'PRL'
        });
        advanceStep(0, 'done', { txHash: refPrlRes.txHash, chain: 'near' });
        if (flowPlan.steps.length > 1) advanceStep(1, 'active');

        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: 'USDC',
          chain: 'near',
          amount: amt,
          txHash: refPrlRes.txHash,
          title: `${fromToken.symbol} ➔ USDC (Stage 1)`
        });

        // Verify actual post-swap USDC increase on NEAR before step 2
        const postUsdc = await intents.fetchNearNep141Balances(nearId, { usdc: intents.NEAR_USDC_CONTRACT }).catch(() => null);
        const expectedUsdc = BigInt(step1Q.amountOut || step1Q.minAmountOut || '0');
        const fallbackUsdc = BigInt(step1Q.minAmountOut || step1Q.amountOut || '0');
        let deltaRaw = (preUsdcRaw !== null && postUsdc?.usdc?.raw != null)
          ? (BigInt(postUsdc.usdc.raw) > preUsdcRaw ? (BigInt(postUsdc.usdc.raw) - preUsdcRaw) : fallbackUsdc)
          : fallbackUsdc;
        if (expectedUsdc > 0n && deltaRaw > expectedUsdc) deltaRaw = expectedUsdc;
        const sendUsdcRaw = deltaRaw > 0n ? deltaRaw.toString() : String(step1Q.amountOut);

        // If destination is QTC on NEAR, execute atomic Step 2 directly on Rhea CLMM (dclv2.ref-labs.near) when quoted
        if (
          (st.swap.quoteData?.compositeType === 'PRL_TO_NEAR_DCL' || toToken.assetId === intents.QTC_NEAR_ASSET_ID) &&
          typeof contracts.executeNearDclPoolSwap === 'function'
        ) {
          const dclCheck = await contracts.quoteNearDclPoolSwap({
            tokenIn: intents.NEAR_USDC_CONTRACT,
            tokenOut: intents.QTC_NEAR_CONTRACT,
            amountRaw: sendUsdcRaw,
            slippageBps: st.swap.slippageBps
          }).catch(() => null);
          if (dclCheck && dclCheck.ok) {
            try {
              const usdcBalMap = await intents.fetchNearNep141Balances(nearId, { [intents.NEAR_USDC_CONTRACT]: 6 }).catch(() => null);
              const realUsdcBal = (usdcBalMap && usdcBalMap[intents.NEAR_USDC_CONTRACT] && usdcBalMap[intents.NEAR_USDC_CONTRACT].formatted !== undefined)
                ? Number(usdcBalMap[intents.NEAR_USDC_CONTRACT].formatted)
                : (wallet.nearNep141Balances && wallet.nearNep141Balances[intents.NEAR_USDC_CONTRACT]
                    ? Number(wallet.nearNep141Balances[intents.NEAR_USDC_CONTRACT].formatted)
                    : null);
              const dclRes = await contracts.executeNearDclPoolSwap({
                wallet,
                poolIds: dclCheck.poolIds,
                tokenIn: intents.NEAR_USDC_CONTRACT,
                tokenOut: intents.QTC_NEAR_CONTRACT,
                amountRaw: sendUsdcRaw,
                minAmountOut: dclCheck.minAmountOut,
                slippageBps: st.swap.slippageBps,
                tokenBalance: realUsdcBal,
                inputDecimals: 6,
                tokenSymbol: 'USDC'
              });
              advanceStep(1, 'done', { txHash: dclRes.txHash, chain: 'near' });
              stepper.finish(true, { text: t('兑换成功', 'Swap completed'), doneTitle: t('兑换成功', 'Swap Completed') });
              recordWalletActivity(wallet, {
                type: 'swap',
                symbol: fromToken.symbol,
                toSymbol: toToken.symbol,
                chain: fromToken.blockchain,
                amount: amt,
                txHash: dclRes.txHash,
                title: `${fromToken.symbol} ➔ ${toToken.symbol}`
              });
              showToast(`✅ ${t('兑换成功', 'Swap completed')}: ${shortenAddr(dclRes.txHash)}`);
              refreshAllBalancesAsync(false);
              return;
            } catch (dclErr) {
              st.swap.activeOrder = {
                walletId: wallet.id,
                depositAddress: refPrlRes.txHash || `near_dcl_${Date.now()}`,
                status: 'SUCCESS',
                fromSymbol: fromToken.symbol,
                toSymbol: toToken.symbol,
                originTxHash: refPrlRes.txHash || '',
                autoBroadcasted: true,
                createdAt: Date.now(),
                followUpFailed: true,
                followUpError: toUserFriendlyError(dclErr, '后续兑换暂未完成，请点击继续重试', 'Follow-up swap incomplete; tap Resume to retry'),
                followUpDclSwap: {
                  tokenIn: intents.NEAR_USDC_CONTRACT,
                  tokenOut: intents.QTC_NEAR_CONTRACT,
                  amountRaw: sendUsdcRaw,
                  slippageBps: st.swap.slippageBps,
                  toSymbol: toToken.symbol
                }
              };
              if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
              renderSwapOrderCard();
              throw dclErr;
            }
          }
        }

        const isRelaySolDex = activeQuote?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX';
        const isRelayEvmDex = activeQuote?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX';
        const step2DestAsset = (isRelaySolDex || isRelayEvmDex) ? activeQuote.intermediaryAssetId : toToken.assetId;
        const step2Recip = isRelaySolDex
          ? wallet.solAddress
          : (isRelayEvmDex ? (wallet.mpcEvmAddress || wallet.evmAddress) : recipient);
        if (!step2Recip) throw new Error(t('缺少目标链接收地址', 'Missing destination address'));

        const preSolSnapshot = isRelaySolDex
          ? await contracts.fetchSolanaNativeAndSplBalances(step2Recip, []).catch(() => null)
          : null;
        const preEvmSnapshot = isRelayEvmDex
          ? await contracts.fetchEvmNativeAndErc20Balance(toToken.blockchain, step2Recip).catch(() => null)
          : null;

        let step2Live;
        let sendTx;
        try {
          step2Live = await intents.quoteIntentSwapOrWithdraw({
            originAsset: intents.NEAR_USDC_ASSET_ID,
            destinationAsset: step2DestAsset,
            amountRaw: sendUsdcRaw,
            slippageBps: st.swap.slippageBps,
            recipient: step2Recip,
            refundTo: nearId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: false
          });
          if (!step2Live.ok || !step2Live.depositAddress) {
            throw new Error(step2Live.error || t('创建跨链订单失败，请重试', 'Failed to create cross-chain order'));
          }
          const usdcHuman = intents.fromBaseUnits(sendUsdcRaw, 6);
          const step2BalMap = await intents.fetchNearNep141Balances(nearId, { [intents.NEAR_USDC_CONTRACT]: 6 }).catch(() => null);
          const realStep2UsdcBal = (step2BalMap && step2BalMap[intents.NEAR_USDC_CONTRACT] && step2BalMap[intents.NEAR_USDC_CONTRACT].formatted !== undefined)
            ? Number(step2BalMap[intents.NEAR_USDC_CONTRACT].formatted)
            : (wallet.nearNep141Balances && wallet.nearNep141Balances[intents.NEAR_USDC_CONTRACT]
                ? Number(wallet.nearNep141Balances[intents.NEAR_USDC_CONTRACT].formatted)
                : null);
          sendTx = await contracts.executeNearNep141Transfer({
            wallet,
            tokenContract: intents.NEAR_USDC_CONTRACT,
            receiverId: step2Live.depositAddress,
            amount: usdcHuman,
            decimals: 6,
            tokenSymbol: 'USDC',
            tokenBalance: realStep2UsdcBal
          });
        } catch (s2Err) {
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: refPrlRes.txHash || `near_usdc_bridge_${Date.now()}`,
            status: 'SUCCESS',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: refPrlRes.txHash || '',
            autoBroadcasted: true,
            createdAt: Date.now(),
            followUpFailed: true,
            followUpError: toUserFriendlyError(s2Err, '第一阶段已换出 NEAR USDC，第二步跨链失败，请点击继续重试', 'Stage 1 swapped to NEAR USDC; tap Resume for Stage 2'),
            followUpBridgeOut: {
              originAsset: intents.NEAR_USDC_ASSET_ID,
              hubContract: intents.NEAR_USDC_CONTRACT,
              hubDecimals: 6,
              destinationAsset: step2DestAsset,
              recipient: step2Recip,
              expectedInRaw: sendUsdcRaw,
              slippageBps: st.swap.slippageBps,
              toSymbol: toToken.symbol
            }
          };
          {
            const s2Reserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
            if (isRelaySolDex) {
              st.swap.activeOrder.followUpBridgeOut.followUpSolDexSwap = {
                outputMint: toToken.contractAddress,
                outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
                toSymbol: toToken.symbol,
                preSolLamports: preSolSnapshot?.nativeLamports != null ? String(preSolSnapshot.nativeLamports) : undefined,
                expectedSolRaw: String(step2Live?.amountOut || activeQuote?.intermediaryRaw || '0'),
                reserveSol: s2Reserve,
                slippageBps: st.swap.slippageBps
              };
            } else if (isRelayEvmDex) {
              st.swap.activeOrder.followUpBridgeOut.followUpEvmDexSwap = {
                chainKey: String(toToken.blockchain || '').toLowerCase(),
                destToken: toToken.contractAddress,
                destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
                toSymbol: toToken.symbol,
                preNativeWei: preEvmSnapshot?.nativeRaw != null ? String(preEvmSnapshot.nativeRaw) : undefined,
                expectedInRaw: String(step2Live?.amountOut || activeQuote?.intermediaryRaw || '0'),
                reserveNative: s2Reserve,
                slippageBps: st.swap.slippageBps
              };
            }
          }
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          renderSwapOrderCard();
          throw s2Err;
        }
        await intents.submitExternalDepositTxHash({
          depositAddress: step2Live.depositAddress,
          txHash: sendTx.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        const nextOrder = {
          walletId: wallet.id,
          depositAddress: step2Live.depositAddress,
          memo: step2Live.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: 'PRL',
          toSymbol: toToken.symbol,
          originTxHash: sendTx.txHash,
          autoBroadcasted: true,
          createdAt: Date.now()
        };
        const subBReserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
        if (isRelaySolDex) {
          nextOrder.followUpSolDexSwap = {
            outputMint: toToken.contractAddress,
            outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            expectedSolRaw: String(step2Live.amountOut || '0'),
            preSolLamports: String(preSolSnapshot?.nativeLamports || '0'),
            reserveSol: subBReserve,
            slippageBps: st.swap.slippageBps
          };
        } else if (isRelayEvmDex) {
          nextOrder.followUpEvmDexSwap = {
            chainKey: String(toToken.blockchain || '').toLowerCase(),
            destToken: toToken.contractAddress,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
            toSymbol: toToken.symbol,
            expectedInRaw: String(step2Live.amountOut || '0'),
            preNativeWei: String(preEvmSnapshot?.nativeRaw || '0'),
            reserveNative: subBReserve,
            slippageBps: st.swap.slippageBps
          };
        }
        st.swap.activeOrder = nextOrder;
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: sendTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        renderSwapOrderCard();
        startOrderStatusPolling();
        advanceStep(1, 'done', { txHash: sendTx.txHash, chain: 'near' });
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        return;
      }

      // Sub-route C: Non-Ref token (e.g. SOL / ETH / BNB / QTC) -> PRL (Step 1: 1Click -> NEAR USDC, Step 2 follow-up: Ref USDC -> PRL [+ Stage 3 -> Pearl L1])
      if (!isDirect1ClickPrl && !originIsPrl && destIsPrl && (fromToken.blockchain !== 'near' || st.swap.quoteData?.compositeType === 'EXTERNAL_TO_PRL')) {
        const destNeedsPearlBridge = toToken.blockchain === 'prl';
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: intents.NEAR_USDC_ASSET_ID,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: nearId,
          refundTo,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          appFeeBps: destNeedsPearlBridge ? 0 : 25,
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建跨链第一步订单失败', 'Failed to create step 1 cross-chain order'));
        }
        advanceStep(0, 'active');
        const txRes = await broadcastOriginDepositTx({
          wallet,
          fromToken,
          amt: amtStr,
          avail,
          depositAddress: liveQuote.depositAddress,
          gasOverride: originGasOverride
        });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('转出失败，请检查余额与网络后重试', 'Transfer failed. Please check balance and network.'));
        }
        advanceStep(0, 'done', { txHash: txRes.txHash, chain: fromToken.blockchain });
        if (flowPlan.steps.length > 1) advanceStep(1, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol || 'PRL',
          originTxHash: txRes.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpRefSwap: {
            tokenIn: intents.NEAR_USDC_CONTRACT,
            tokenOut: intents.PRL_NEAR_CONTRACT,
            amountUsdcRaw: liveQuote.amountOut,
            slippageBps: st.swap.slippageBps,
            inputDecimals: 6,
            tokenSymbol: 'USDC',
            followUpBridgeOut: destNeedsPearlBridge ? {
              originAsset: intents.PRL_NEAR_ASSET_ID,
              destinationAsset: intents.PRL_PEARL_ASSET_ID,
              hubContract: intents.PRL_NEAR_CONTRACT,
              hubDecimals: 8,
              hubSymbol: 'PRL',
              recipient
            } : null
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol || 'PRL',
          chain: fromToken.blockchain,
          amount: amt,
          txHash: txRes.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol || 'PRL'}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: liveQuote.depositAddress,
          txHash: txRes.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        return;
      }

