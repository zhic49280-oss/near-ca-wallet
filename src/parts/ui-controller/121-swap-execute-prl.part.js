      const isDirect1ClickPrl = Boolean((originIsPrl !== destIsPrl) && activeQuote && isDirectOneClickQuote(activeQuote));

      // Sub-route A: NEAR Token -> PRL (Pearl L1) via Ref Finance -> 1Click bridge
      if (!isDirect1ClickPrl && !originIsPrl && destIsPrl && toToken.blockchain === 'prl' && fromToken.blockchain === 'near') {
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
        const prlOutRaw = (st.swap.quoteData && st.swap.quoteData.refQuote && st.swap.quoteData.refQuote.amountOut) || refRes.amountOut;
        if (!prlOutRaw) throw new Error(t('Ref Finance 成交后未获得预期 PRL 数量', 'Missing PRL amount after Ref swap'));
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
        });
        if (!bridgeQuote.ok || !bridgeQuote.depositAddress) {
          throw new Error(bridgeQuote.error || t('获取 PRL 跨链桥路由失败', 'Failed to get PRL bridge route'));
        }
        const prlHuman = intents.fromBaseUnits(prlOutRaw, 8);
        const sendBridge = await contracts.executeNearNep141Transfer({
          wallet,
          tokenContract: intents.PRL_NEAR_CONTRACT,
          receiverId: bridgeQuote.depositAddress,
          amount: prlHuman,
          decimals: 8,
          tokenSymbol: 'PRL',
          tokenBalance: Number(prlHuman)
        });
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
        showToast(`✅ ${t('已通过 Ref Finance 兑换并通过 1Click 桥接至 Pearl', 'Swapped via Ref & bridging PRL to Pearl')}`);
        return;
      }

      // Sub-route P: PRL -> NEAR-chain token via Ref multi-hop (tokens 1Click does not list, e.g. oRHEA)
      if (!isDirect1ClickPrl && originIsPrl && !destIsPrl && toToken.blockchain === 'near' && toToken.contractAddress
          && st.swap.quoteData?.compositeType === 'PRL_TO_NEAR_REF' && st.swap.quoteData.refQuote) {
        const refQ = st.swap.quoteData.refQuote;
        if (fromToken.blockchain === 'near') {
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
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            chain: fromToken.blockchain,
            amount: amt,
            txHash: res.txHash,
            title: `${fromToken.symbol} ➔ ${toToken.symbol}`
          });
          showToast(`✅ Ref Finance ${t('成交广播成功', 'Swap broadcast')}: ${shortenAddr(res.txHash)}`);
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
        const bridgeTx = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: bridgeLive.depositAddress, gasOverride: originGasOverride });
        if (!bridgeTx || !bridgeTx.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
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
        showToast(`✅ ${t('跨链已发送，到账后自动兑换', 'Bridge sent; auto-swap on arrival')}`);
        return;
      }
      // Sub-route B: PRL (NEAR) -> External chain (e.g. SOL / ETH / BNB)
      if (!isDirect1ClickPrl && originIsPrl && !destIsPrl && fromToken.blockchain === 'near') {
        const preUsdc = await intents.fetchNearNep141Balances(nearId, { usdc: intents.NEAR_USDC_CONTRACT }).catch(() => null);
        const preUsdcRaw = BigInt(preUsdc?.usdc?.raw || '0');
        const step1Q = (st.swap.quoteData && st.swap.quoteData.refQuote)
          ? st.swap.quoteData.refQuote
          : await contracts.quoteNearRefFinanceSwap({
              tokenIn: intents.PRL_NEAR_CONTRACT,
              tokenOut: intents.NEAR_USDC_CONTRACT,
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
        if (!step1Q.ok || !step1Q.amountOut) {
          throw new Error(step1Q.error || t('Ref Finance 暂无 PRL/USDC 路由', 'Ref Finance PRL/USDC route unavailable'));
        }
        await contracts.executeNearRefFinanceSwap({
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

        // Verify actual post-swap USDC increase on NEAR before step 2
        const postUsdc = await intents.fetchNearNep141Balances(nearId, { usdc: intents.NEAR_USDC_CONTRACT }).catch(() => null);
        const postUsdcRaw = BigInt(postUsdc?.usdc?.raw || '0');
        const deltaRaw = postUsdcRaw > preUsdcRaw ? (postUsdcRaw - preUsdcRaw) : BigInt(step1Q.minAmountOut || step1Q.amountOut);
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
            const usdcHuman = Number(intents.fromBaseUnits(sendUsdcRaw, 6));
            const dclRes = await contracts.executeNearDclPoolSwap({
              wallet,
              poolIds: dclCheck.poolIds,
              tokenIn: intents.NEAR_USDC_CONTRACT,
              tokenOut: intents.QTC_NEAR_CONTRACT,
              amountRaw: sendUsdcRaw,
              minAmountOut: dclCheck.minAmountOut,
              slippageBps: st.swap.slippageBps,
              tokenBalance: usdcHuman,
              inputDecimals: 6,
              tokenSymbol: 'USDC'
            });
            recordWalletActivity(wallet, {
              type: 'swap',
              symbol: fromToken.symbol,
              toSymbol: toToken.symbol,
              chain: fromToken.blockchain,
              amount: amt,
              txHash: dclRes.txHash,
              title: `${fromToken.symbol} ➔ ${toToken.symbol}`
            });
            showToast(`✅ ${t('已通过 Ref + Rhea CLMM 兑换为 QTC', 'Swapped PRL -> USDC -> QTC via Ref + Rhea CLMM')}: ${shortenAddr(dclRes.txHash)}`);
            refreshAllBalancesAsync(false);
            return;
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

        const step2Live = await intents.quoteIntentSwapOrWithdraw({
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
          throw new Error(step2Live.error || t('创建 USDC 跨链第二步订单失败', 'Failed to create 1Click step 2 order'));
        }
        const usdcHuman = intents.fromBaseUnits(sendUsdcRaw, 6);
        const sendTx = await contracts.executeNearNep141Transfer({
          wallet,
          tokenContract: intents.NEAR_USDC_CONTRACT,
          receiverId: step2Live.depositAddress,
          amount: usdcHuman,
          decimals: 6,
          tokenSymbol: 'USDC',
          tokenBalance: Number(usdcHuman)
        });
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
        showToast(`✅ ${t('已通过 Ref Finance 换出 USDC 并提交 1Click 跨链', 'Swapped PRL to USDC & sent cross-chain')}`);
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
        const txRes = await broadcastOriginDepositTx({
          wallet,
          fromToken,
          amt,
          avail,
          depositAddress: liveQuote.depositAddress,
          gasOverride: originGasOverride
        });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
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
        showToast(`✅ ${t('跨链第一阶段已发送，成交后将自动兑换为 PRL', 'Step 1 sent; will auto-swap to PRL upon fill')}`);
        return;
      }

