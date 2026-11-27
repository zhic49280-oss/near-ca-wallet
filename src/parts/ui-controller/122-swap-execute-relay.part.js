      // Super-Aggregator Route 1: SOL DEX Token (e.g. NVDAx / TSLAx / JUP) -> SOL (Jupiter/Raydium) -> 1Click External Token
      if (activeQuote?.compositeType === 'SOL_DEX_TO_CROSS_CHAIN') {
        const solAddr = wallet.solAddress;
        if (!solAddr) throw new Error(t('缺少 Solana 收款地址', 'Missing Solana address'));
        const preSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
        const preLamports = preSolRes?.nativeLamports != null ? BigInt(preSolRes.nativeLamports) : null;

        const s1Quote = (activeQuote.stage1DexQuote && activeQuote.stage1DexQuote.outAmount)
          ? activeQuote.stage1DexQuote
          : await contracts.quoteSolanaJupiterSwap({
              inputMint: fromToken.contractAddress,
              outputMint: 'So11111111111111111111111111111111111111112',
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
        advanceStep(0, 'active');
        const s1Tx = await contracts.executeSolanaJupiterSwap({
          wallet,
          quoteResponse: s1Quote,
          wrapAndUnwrapSol: true,
          tokenBalance: avail,
          inputDecimals: fromToken.decimals
        });
        advanceStep(0, 'done', { txHash: s1Tx?.txHash, chain: 'sol' });
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: 'SOL',
          chain: 'sol',
          amount: amt,
          txHash: s1Tx?.txHash || '',
          title: `${fromToken.symbol} ➔ SOL (Stage 1)`
        });

        if (s1Tx?.txHash && typeof contracts.waitForSolanaTxConfirmation === 'function') {
          const s1Confirmed = await contracts.waitForSolanaTxConfirmation(s1Tx.txHash, 45000);
          if (!s1Confirmed) {
            throw new Error(t(
              `第一阶段交易尚未确认，已暂停第二阶段以保护既有余额 (Tx: ${s1Tx.txHash})`,
              `Stage 1 tx not yet confirmed on-chain; Stage 2 paused to protect existing balance (Tx: ${s1Tx.txHash})`
            ));
          }
        }
        const postSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
        const postLamports = BigInt(postSolRes?.nativeLamports || '0');
        if (postSolRes && typeof postSolRes.nativeSol === 'number') {
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances.sol = postSolRes.nativeSol;
          if (typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
        }
        const solGasReserve = typeof contracts.getNativeGasReserve === 'function' ? contracts.getNativeGasReserve('sol') : 0.002;
        const reserveLamports = BigInt(contracts.toBaseUnits(String(solGasReserve), 9));
        const expectedLamports = BigInt(s1Quote.outAmount || '0');
        const hasPreLamports = preLamports !== null;
        let deltaLamports = (hasPreLamports && postSolRes?.nativeLamports != null)
          ? (postLamports > preLamports ? (postLamports - preLamports) : 0n)
          : (hasPreLamports ? 0n : expectedLamports);
        if (hasPreLamports && deltaLamports <= 0n) {
          throw new Error(t(
            `第一阶段兑换后 SOL 余额未增加，已暂停第二阶段以保护既有余额${s1Tx?.txHash ? ` (Tx: ${s1Tx.txHash})` : ''}`,
            `SOL balance did not increase after Stage 1 swap; Stage 2 paused to protect existing balance${s1Tx?.txHash ? ` (Tx: ${s1Tx.txHash})` : ''}`
          ));
        }
        if (expectedLamports > 0n && deltaLamports > expectedLamports) deltaLamports = expectedLamports;
        const maxSendable = postLamports > reserveLamports ? (postLamports - reserveLamports) : 0n;
        const sendLamports = deltaLamports > maxSendable ? maxSendable : deltaLamports;
        if (sendLamports <= 0n) throw new Error(t('SOL 余额不足以执行跨链第二阶段', 'Insufficient SOL for Stage 2 bridge'));

        let stage2Live;
        let sendSolTx;
        advanceStep(1, 'active');
        try {
          stage2Live = await intents.quoteIntentSwapOrWithdraw({
            originAsset: 'nep141:sol.omft.near',
            destinationAsset: toToken.assetId,
            amountRaw: sendLamports.toString(),
            slippageBps: st.swap.slippageBps,
            recipient,
            refundTo: solAddr,
            nearAccountId: nearId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: false
          });
          if (!stage2Live.ok || !stage2Live.depositAddress) {
            throw new Error(stage2Live.error || t('第二阶段跨链下单失败', 'Stage 2 cross-chain order failed'));
          }
          const sendSolNum = Number(contracts.fromBaseUnits(sendLamports.toString(), 9));
          sendSolTx = await contracts.executeSolanaNativeTransfer({
            wallet,
            toAddress: stage2Live.depositAddress,
            amountSol: sendSolNum,
            gasBuffer: solGasReserve
          });
        } catch (s2Err) {
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: s1Tx?.txHash || `sol_bridge_${Date.now()}`,
            status: 'SUCCESS',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: s1Tx?.txHash || '',
            autoBroadcasted: true,
            createdAt: Date.now(),
            followUpFailed: true,
            followUpError: toUserFriendlyError(s2Err, '第一步已换出 SOL，第二步跨链失败，请点击继续重试', 'Stage 1 swapped to SOL; tap Resume for Stage 2'),
            followUpBaseOneClick: null,
            followUpSolBridgeOut: {
              destinationAsset: toToken.assetId,
              amountRaw: sendLamports.toString(),
              recipient,
              slippageBps: st.swap.slippageBps,
              toSymbol: toToken.symbol
            }
          };
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          renderSwapOrderCard();
          throw s2Err;
        }
        await intents.submitExternalDepositTxHash({
          depositAddress: stage2Live.depositAddress,
          txHash: sendSolTx.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: stage2Live.depositAddress,
          memo: stage2Live.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: sendSolTx.txHash,
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
          txHash: sendSolTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        renderSwapOrderCard();
        startOrderStatusPolling();
        advanceStep(1, 'done', { txHash: sendSolTx.txHash, chain: 'sol' });
        if (flowPlan.steps.length > 2) advanceStep(2, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        return;
      }

      // Super-Aggregator Route 2: Cross-Chain (1Click -> SOL) + Auto Stage 2 Solana DEX Swap (e.g. NEAR -> NVDAx / TSLAx / JUP)
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX') {
        const solRecip = wallet.solAddress;
        if (!solRecip) throw new Error(t('缺少 Solana 收款地址', 'Missing Solana address'));
        const preSolRes = await contracts.fetchSolanaNativeAndSplBalances(solRecip, []).catch(() => null);
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: activeQuote.intermediaryAssetId || 'nep141:sol.omft.near',
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: solRecip,
          refundTo,
          nearAccountId: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建第一阶段跨链订单失败', 'Failed to create Stage 1 SOL order'));
        }
        advanceStep(0, 'active');
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt: amtStr, avail, depositAddress: liveQuote.depositAddress, gasOverride: originGasOverride });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('转出失败，请检查余额与网络后重试', 'Transfer failed. Please check balance and network.'));
        }
        advanceStep(0, 'done', { txHash: txRes.txHash, chain: fromToken.blockchain });
        if (flowPlan.steps.length > 1) advanceStep(1, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        const solReserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: txRes.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpSolDexSwap: {
            outputMint: toToken.contractAddress,
            outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            expectedSolRaw: String(liveQuote.amountOut || activeQuote.intermediaryRaw || '0'),
            preSolLamports: String(preSolRes?.nativeLamports || '0'),
            reserveSol: solReserve,
            slippageBps: st.swap.slippageBps
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: txRes.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: liveQuote.depositAddress,
          txHash: txRes.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 3: Cross-Chain (1Click -> EVM Hub) + Auto Stage 2 EVM Multi-Pool DEX (e.g. NEAR -> PONS / AERO / UNI)
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX') {
        const targetBc = String(toToken.blockchain || '').toLowerCase();
        const evmRecip = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmRecip) throw new Error(t('缺少 EVM 收款地址', 'Missing EVM address'));
        const preEvmRes = await contracts.fetchEvmNativeAndErc20Balance(targetBc, evmRecip).catch(() => null);
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: activeQuote.intermediaryAssetId,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: evmRecip,
          refundTo,
          nearAccountId: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建 EVM 第一阶段跨链订单失败', 'Failed to create Stage 1 EVM order'));
        }
        advanceStep(0, 'active');
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt: amtStr, avail, depositAddress: liveQuote.depositAddress, gasOverride: originGasOverride });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('转出失败，请检查余额与网络后重试', 'Transfer failed. Please check balance and network.'));
        }
        advanceStep(0, 'done', { txHash: txRes.txHash, chain: fromToken.blockchain });
        if (flowPlan.steps.length > 1) advanceStep(1, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        const evmReserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: txRes.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpEvmDexSwap: {
            chainKey: targetBc,
            destToken: toToken.contractAddress,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
            toSymbol: toToken.symbol,
            expectedInRaw: String(liveQuote.amountOut || activeQuote.intermediaryRaw || '0'),
            preNativeWei: String(preEvmRes?.nativeRaw || '0'),
            reserveNative: evmReserve,
            slippageBps: st.swap.slippageBps
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: txRes.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: liveQuote.depositAddress,
          txHash: txRes.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 4: Direct EVM -> Arc Mainnet (5042) via Relay / LI.FI
      if (activeQuote?.compositeType === 'EVM_TO_ARC_MAINNET' && typeof contracts.executeEvmRawSteps === 'function') {
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmAddr) throw new Error(t('缺少 EVM 收款地址', 'Missing EVM address'));
        const origChain = String(fromToken.blockchain || '').toLowerCase();
        const cfgOrig = contracts.EVM_CHAINS && contracts.EVM_CHAINS[origChain];
        const bQuote = activeQuote.bridgeQuote;
        const arcDestLower = String(toToken.contractAddress || intents.ARC_USDC_CONTRACT).toLowerCase();
        const needsArcDexSwap = Boolean(toToken.contractAddress && arcDestLower !== intents.ARC_USDC_CONTRACT.toLowerCase() && arcDestLower !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
        const preArcRes = needsArcDexSwap
          ? await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null)
          : null;
        if (needsArcDexSwap && !preArcRes) {
          throw new Error(t('无法读取 Arc 网络初始余额，请稍后重试', 'Failed to read pre-bridge Arc balance; please retry'));
        }
        let bridgeResTx = null;
        advanceStep(0, 'active');
        if (bQuote && bQuote.provider === 'LI.FI' && bQuote.transactionRequest) {
          const lRes = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: origChain,
            routeSource: 'lifi',
            routeData: bQuote,
            srcToken: fromToken.contractAddress || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destToken: intents.ARC_USDC_CONTRACT,
            amountRaw,
            srcDecimals: fromToken.decimals,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail,
            gasBuffer: isNative ? gasBuf : null
          });
          bridgeResTx = lRes;
        } else {
          const relayRecip = (needsArcDexSwap || !recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) ? evmAddr : recipient;
          const liveRelay = await intents.quoteRelayBridge({
            user: evmAddr,
            recipient: relayRecip,
            originChainId: cfgOrig ? cfgOrig.chainId : 8453,
            destinationChainId: 5042,
            originCurrency: fromToken.contractAddress || '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destinationCurrency: intents.ARC_USDC_CONTRACT,
            amount: amountRaw
          });
          if (!liveRelay.ok || !liveRelay.steps?.length) throw new Error(liveRelay.error || t('跨链服务暂时不可用，请稍后重试', 'Cross-chain service temporarily unavailable'));
          bridgeResTx = await contracts.executeEvmRawSteps({ wallet, chainKey: origChain, steps: liveRelay.steps });
        }
        advanceStep(0, 'done', { txHash: bridgeResTx.txHash, chain: origChain });
        if (flowPlan.steps.length > 1) advanceStep(1, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: bridgeResTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        if (needsArcDexSwap) {
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: bridgeResTx.txHash,
            status: 'PENDING_ARC_BRIDGE',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: bridgeResTx.txHash,
            autoBroadcasted: true,
            createdAt: Date.now(),
            followUpArcDexSwap: {
              destContract: toToken.contractAddress,
              destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
              toSymbol: toToken.symbol,
              expectedArcUsdcRaw: String(bQuote?.amountOut || '0'),
              preArcUsdcRaw: String(preArcRes?.nativeRaw || '0'),
              slippageBps: st.swap.slippageBps
            }
          };
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
          return;
        }
        showToast(`✅ ${t('跨链处理中，预计几分钟到账', 'Cross-chain swap processing, arriving in a few minutes')}: ${shortenAddr(bridgeResTx.txHash)}`);
        refreshAllBalancesAsync(false);
        return;
      }

      // Super-Aggregator Route 5: Cross-Chain (1Click -> Base USDC) + Relay (Base -> Arc 5042) + optional Arc KyberSwap
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_ARC_MAINNET') {
        const evmRecip = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmRecip) throw new Error(t('缺少 EVM 收款地址', 'Missing EVM address'));
        const preBaseRes = await contracts.fetchEvmNativeAndErc20Balance('base', evmRecip, intents.BASE_USDC_EVM, 6).catch(() => null);
        const liveQuote = await intents.quoteIntentSwapOrWithdraw({
          originAsset: fromToken.assetId,
          destinationAsset: intents.BASE_USDC_1CLICK_ID,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient: evmRecip,
          refundTo,
          nearAccountId: nearId,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          dry: false
        });
        if (!liveQuote.ok || !liveQuote.depositAddress) {
          throw new Error(liveQuote.error || t('创建 Base USDC 中转订单失败', 'Failed to create Base USDC stage 1 order'));
        }
        advanceStep(0, 'active');
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt: amtStr, avail, depositAddress: liveQuote.depositAddress, gasOverride: originGasOverride });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('转出失败，请检查余额与网络后重试', 'Transfer failed. Please check balance and network.'));
        }
        advanceStep(0, 'done', { txHash: txRes.txHash, chain: fromToken.blockchain });
        if (flowPlan.steps.length > 1) advanceStep(1, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        const arcDestLower = String(toToken.contractAddress || intents.ARC_USDC_CONTRACT).toLowerCase();
        const needsArcDexSwap = Boolean(
          toToken.contractAddress &&
          arcDestLower !== intents.ARC_USDC_CONTRACT.toLowerCase() &&
          arcDestLower !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
        );
        const arcRelayRecipient = (!needsArcDexSwap && recipient && /^0x[0-9a-fA-F]{40}$/.test(recipient))
          ? recipient
          : evmRecip;
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: liveQuote.depositAddress,
          memo: liveQuote.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: txRes.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpArcRelay: {
            direction: 'base_to_arc',
            destContract: toToken.contractAddress || intents.ARC_USDC_CONTRACT,
            destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
            toSymbol: toToken.symbol,
            recipient: arcRelayRecipient,
            expectedBaseRaw: String(liveQuote.amountOut || activeQuote.baseBridgeRaw || '0'),
            preBaseRaw: String(preBaseRes?.tokenRaw || '0'),
            slippageBps: st.swap.slippageBps
          }
        };
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: fromToken.blockchain,
          amount: amt,
          txHash: txRes.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        await intents.submitExternalDepositTxHash({
          depositAddress: liveQuote.depositAddress,
          txHash: txRes.txHash,
          nearSenderAccount: nearId
        }).catch(() => {});
        renderSwapOrderCard();
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 6: Arc Mainnet (5042) -> Base -> Target Chain
      if (activeQuote?.compositeType === 'ARC_MAINNET_TO_CROSS_CHAIN' && typeof contracts.executeEvmRawSteps === 'function') {
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmAddr) throw new Error(t('缺少 EVM 收款地址', 'Missing EVM address'));
        const srcContract = (fromToken.contractAddress || intents.ARC_USDC_CONTRACT).toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
          ? intents.ARC_USDC_CONTRACT
          : fromToken.contractAddress;
        const isArcSwapStage1 = srcContract.toLowerCase() !== intents.ARC_USDC_CONTRACT.toLowerCase();
        let arcUsdcRaw = (!isArcSwapStage1 && Number(fromToken.decimals) === 18)
          ? (BigInt(amountRaw) / 1000000000000n).toString()
          : amountRaw;
        let arcStep = 0;
        let s1Tx = null;
        if (isArcSwapStage1) {
          advanceStep(arcStep, 'active');
          const preArcRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
          const preArcWei = preArcRes?.nativeRaw != null ? BigInt(preArcRes.nativeRaw) : null;
          const s1Q = activeQuote.stage1DexQuote?.routeData
            ? activeQuote.stage1DexQuote
            : await contracts.quoteEvmDexSwap({
                chainKey: 'arc',
                srcToken: srcContract,
                destToken: intents.ARC_USDC_CONTRACT,
                amountRaw,
                srcDecimals: fromToken.decimals,
                destDecimals: 6,
                slippageBps: st.swap.slippageBps,
                fromAddress: evmAddr
              });
          if (!s1Q.ok || !s1Q.routeData) throw new Error(s1Q.error || t('Arc 换出 USDC 失败', 'Arc swap to USDC failed'));
          s1Tx = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: 'arc',
            routeSource: s1Q.routeSource,
            routeData: s1Q.routeData,
            srcToken: srcContract,
            destToken: intents.ARC_USDC_CONTRACT,
            amountRaw,
            srcDecimals: fromToken.decimals,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail,
            gasBuffer: isNative ? gasBuf : null
          });
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: 'USDC',
            chain: 'arc',
            amount: amt,
            txHash: s1Tx?.txHash || '',
            title: `${fromToken.symbol} ➔ USDC (Arc Stage 1)`
          });
          showToast(`✅ ${t('跨链处理中，预计几分钟到账', 'Cross-chain swap processing, arriving in a few minutes')}: ${shortenAddr(s1Tx.txHash)}`);
          if (s1Tx?.txHash && typeof contracts.waitForEvmTxConfirmation === 'function') {
            const s1Confirmed = await contracts.waitForEvmTxConfirmation('arc', s1Tx.txHash, 45000);
            if (!s1Confirmed) {
              throw new Error(t(
                `第一阶段交易尚未确认，已暂停第二阶段以保护既有余额 (Tx: ${s1Tx.txHash})`,
                `Stage 1 tx not yet confirmed on-chain; Stage 2 paused to protect existing balance (Tx: ${s1Tx.txHash})`
              ));
            }
          }
          const postArcRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
          const postArcWei = BigInt(postArcRes?.nativeRaw || '0');
          if (postArcRes && typeof postArcRes.nativeFormatted === 'number') {
            wallet.nativeBalances = wallet.nativeBalances || {};
            wallet.nativeBalances.arc = postArcRes.nativeFormatted;
            if (typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
          }
          const reserveArcWei = BigInt(intents.toBaseUnits('0.02', 18));
          const maxSpendableWei = postArcWei > reserveArcWei ? (postArcWei - reserveArcWei) : 0n;
          const hasPreArc = preArcWei !== null;
          const deltaArcWei = (hasPreArc && postArcRes?.nativeRaw != null && postArcWei > preArcWei)
            ? (postArcWei - preArcWei)
            : 0n;
          if (hasPreArc && deltaArcWei <= 0n) {
            throw new Error(t(
              `第一阶段兑换后 Arc USDC 余额未增加，已暂停第二阶段以保护既有余额${s1Tx?.txHash ? ` (Tx: ${s1Tx.txHash})` : ''}`,
              `Arc USDC balance did not increase after Stage 1 swap; Stage 2 paused to protect existing balance${s1Tx?.txHash ? ` (Tx: ${s1Tx.txHash})` : ''}`
            ));
          }
          const expectedArcWei = BigInt(s1Q.amountOut || '0') * 1000000000000n;
          let bridgeArcWei = hasPreArc ? deltaArcWei : expectedArcWei;
          if (expectedArcWei > 0n && bridgeArcWei > expectedArcWei) bridgeArcWei = expectedArcWei;
          if (postArcRes && bridgeArcWei > maxSpendableWei) bridgeArcWei = maxSpendableWei;
          const bridgeArc6 = bridgeArcWei / 1000000000000n;
          if (bridgeArc6 <= 0n) {
            throw new Error(t('Arc 主网兑换后 USDC 余额不足以发起跨链', 'Insufficient Arc USDC after swap to bridge'));
          }
          arcUsdcRaw = bridgeArc6.toString();
          advanceStep(arcStep, 'done', { txHash: s1Tx?.txHash, chain: 'arc' });
          arcStep += 1;
        }
        const hasStage3 = Boolean(activeQuote.stage3Quote);
        const validRecipEvm = recipient && /^0x[0-9a-fA-F]{40}$/.test(recipient) ? recipient : evmAddr;
        const bridgeRecip = hasStage3 ? evmAddr : validRecipEvm;
        const preBaseRes = hasStage3
          ? await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null)
          : null;
        if (hasStage3 && !preBaseRes) {
          throw new Error(t('无法读取 Base 链初始余额，请稍后重试', 'Failed to read pre-bridge Base balance; please retry'));
        }
        let rTx = null;
        let bridgeOutRaw = String(activeQuote.baseOutRaw || arcUsdcRaw);
        const arcBQuote = activeQuote.bridgeQuote;
        advanceStep(arcStep, 'active');
        try {
          if (arcBQuote && arcBQuote.provider === 'LI.FI' && arcBQuote.transactionRequest && bridgeRecip.toLowerCase() === evmAddr.toLowerCase()) {
            rTx = await contracts.executeEvmDexSwap({
              wallet,
              chainKey: 'arc',
              routeSource: 'lifi',
              routeData: arcBQuote,
              srcToken: intents.ARC_USDC_CONTRACT,
              destToken: intents.BASE_USDC_EVM,
              amountRaw: arcUsdcRaw,
              srcDecimals: 6,
              slippageBps: st.swap.slippageBps,
              tokenBalance: isArcSwapStage1 ? Number(intents.fromBaseUnits(arcUsdcRaw, 6)) : avail
            });
          } else {
            const liveRelay = await intents.quoteRelayBridge({
              user: evmAddr,
              recipient: bridgeRecip,
              originChainId: 5042,
              destinationChainId: 8453,
              originCurrency: intents.ARC_USDC_CONTRACT,
              destinationCurrency: intents.BASE_USDC_EVM,
              amount: arcUsdcRaw
            });
            if (!liveRelay.ok || !liveRelay.steps?.length) throw new Error(liveRelay.error || t('跨链服务暂时不可用，请稍后重试', 'Cross-chain service temporarily unavailable'));
            bridgeOutRaw = String(liveRelay.amountOut || bridgeOutRaw);
            rTx = await contracts.executeEvmRawSteps({ wallet, chainKey: 'arc', steps: liveRelay.steps });
          }
        } catch (arcStage2Err) {
          if (srcContract.toLowerCase() !== intents.ARC_USDC_CONTRACT.toLowerCase()) {
            const stage1Hash = (s1Tx && s1Tx.txHash) || '';
            st.swap.activeOrder = {
              walletId: wallet.id,
              depositAddress: stage1Hash || `arc_bridge_${Date.now()}`,
              status: 'SUCCESS',
              fromSymbol: fromToken.symbol,
              toSymbol: toToken.symbol,
              originTxHash: stage1Hash,
              autoBroadcasted: true,
              createdAt: Date.now(),
              followUpFailed: true,
              followUpError: toUserFriendlyError(arcStage2Err, 'Arc 第一步已换出 USDC，跨链至 Base 失败，请重发或调整金额', 'Arc Stage 1 swapped to USDC; Stage 2 bridge failed'),
              followUpArcRelay: {
                direction: 'arc_to_base',
                originAsset: intents.ARC_USDC_CONTRACT,
                destinationAsset: toToken.assetId,
                amountRaw: arcUsdcRaw,
                recipient: bridgeRecip,
                toSymbol: toToken.symbol,
                slippageBps: st.swap.slippageBps
              }
            };
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
            renderSwapOrderCard();
          }
          throw arcStage2Err;
        }
        advanceStep(arcStep, 'done', { txHash: rTx.txHash, chain: 'arc' });
        if (hasStage3 && arcStep + 1 < flowPlan.steps.length) advanceStep(arcStep + 1, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
        recordWalletActivity(wallet, {
          type: 'swap',
          symbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          chain: 'arc',
          amount: amt,
          txHash: rTx.txHash,
          title: `${fromToken.symbol} ➔ ${toToken.symbol}`
        });
        if (hasStage3) {
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: rTx.txHash,
            status: 'PENDING_BASE_BRIDGE',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: rTx.txHash,
            autoBroadcasted: true,
            createdAt: Date.now(),
            followUpBaseOneClick: {
              destinationAsset: toToken.assetId,
              destBlockchain: toToken.blockchain,
              recipient,
              preBaseRaw: String(preBaseRes?.tokenRaw || '0'),
              expectedBaseRaw: bridgeOutRaw,
              slippageBps: st.swap.slippageBps,
              toSymbol: toToken.symbol
            }
          };
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('跨链处理中，预计几分钟到账', 'Cross-chain swap processing, arriving in a few minutes')}: ${shortenAddr(rTx.txHash)}`);
          return;
        }
        showToast(`✅ ${t('跨链处理中，预计几分钟到账', 'Cross-chain swap processing, arriving in a few minutes')}: ${shortenAddr(rTx.txHash)}`);
        refreshAllBalancesAsync(false);
        return;
      }

      // Cross-Chain 1Click Route (ORIGIN_CHAIN -> DESTINATION_CHAIN direct L1 to L1, including Pearl PRL multi-stage closure)
      const isPearlOriginFollowUp = originIsPrl && !destIsPrl && fromToken.blockchain === 'prl' && !isDirect1ClickPrl;
      const isPearlToNearDcl = isPearlOriginFollowUp && toToken.blockchain === 'near' && toToken.assetId === intents.QTC_NEAR_ASSET_ID;
      const isPearlToNearRef = isPearlOriginFollowUp && toToken.blockchain === 'near' && Boolean(toToken.contractAddress) && toToken.contractAddress !== intents.PRL_NEAR_CONTRACT && !isPearlToNearDcl;
      const isPearlToExternal = isPearlOriginFollowUp && toToken.blockchain !== 'near';

      const effectiveDestAsset = isPearlOriginFollowUp ? intents.PRL_NEAR_ASSET_ID : toToken.assetId;
      const effectiveRecipient = isPearlOriginFollowUp ? nearId : recipient;

      const liveQuote = await intents.quoteIntentSwapOrWithdraw({
        originAsset: fromToken.assetId,
        destinationAsset: effectiveDestAsset,
        amountRaw,
        slippageBps: st.swap.slippageBps,
        recipient: effectiveRecipient,
        refundTo,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        appFeeBps: isPearlToExternal ? 0 : 25,
        deadlineIso: fromToken.blockchain === 'btc' ? new Date(Date.now() + 90 * 60 * 1000).toISOString() : undefined,
        dry: false
      });
      if (!liveQuote.ok || !liveQuote.depositAddress) {
        throw new Error(liveQuote.error || t('创建跨链订单失败', 'Failed to create cross-chain order'));
      }

      if (
        !isPearlOriginFollowUp &&
        toToken.blockchain === 'near' &&
        toToken.contractAddress &&
        effectiveRecipient === nearId &&
        typeof contracts.ensureNearNep141StorageRegistered === 'function'
      ) {
        await contracts.ensureNearNep141StorageRegistered({
          resolvedWallet: wallet,
          accountId: nearId,
          tokenContract: toToken.contractAddress
        }).catch(() => {});
      }

      const isRelaySolDexPre = isPearlToExternal && activeQuote?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX';
      const isRelayEvmDexPre = isPearlToExternal && activeQuote?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX';
      const preRelaySolSnapshot = (isRelaySolDexPre && wallet.solAddress)
        ? await contracts.fetchSolanaNativeAndSplBalances(wallet.solAddress, []).catch(() => null)
        : null;
      const preRelayEvmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
      const preRelayEvmSnapshot = (isRelayEvmDexPre && preRelayEvmAddr)
        ? await contracts.fetchEvmNativeAndErc20Balance(toToken.blockchain, preRelayEvmAddr).catch(() => null)
        : null;

      // Broadcast FIRST before displaying any order tracking card
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

      let followUpRefSwap = null;
      if (isPearlToNearRef) {
        followUpRefSwap = {
          tokenIn: intents.PRL_NEAR_CONTRACT,
          tokenOut: toToken.contractAddress,
          amountUsdcRaw: liveQuote.amountOut,
          slippageBps: st.swap.slippageBps,
          inputDecimals: 8,
          tokenSymbol: 'PRL'
        };
      } else if (isPearlToNearDcl) {
        followUpRefSwap = {
          tokenIn: intents.PRL_NEAR_CONTRACT,
          tokenOut: intents.NEAR_USDC_CONTRACT,
          amountUsdcRaw: liveQuote.amountOut,
          slippageBps: st.swap.slippageBps,
          inputDecimals: 8,
          tokenSymbol: 'PRL',
          followUpDclSwap: {
            tokenIn: intents.NEAR_USDC_CONTRACT,
            tokenOut: intents.QTC_NEAR_CONTRACT,
            toSymbol: 'QTC',
            slippageBps: st.swap.slippageBps
          }
        };
      } else if (isPearlToExternal) {
        const isRelaySolDex = activeQuote?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX';
        const isRelayEvmDex = activeQuote?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX';
        const outDestAsset = (isRelaySolDex || isRelayEvmDex) ? activeQuote.intermediaryAssetId : toToken.assetId;
        const outRecip = isRelaySolDex
          ? wallet.solAddress
          : (isRelayEvmDex ? (wallet.mpcEvmAddress || wallet.evmAddress) : recipient);
        const targetReserve = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve;
        followUpRefSwap = {
          tokenIn: intents.PRL_NEAR_CONTRACT,
          tokenOut: intents.NEAR_USDC_CONTRACT,
          amountUsdcRaw: liveQuote.amountOut,
          slippageBps: st.swap.slippageBps,
          inputDecimals: 8,
          tokenSymbol: 'PRL',
          followUpBridgeOut: {
            originAsset: intents.NEAR_USDC_ASSET_ID,
            destinationAsset: outDestAsset,
            hubContract: intents.NEAR_USDC_CONTRACT,
            hubDecimals: 6,
            hubSymbol: 'USDC',
            recipient: outRecip,
            expectedInRaw: String(activeQuote?.intermediaryRaw || liveQuote.amountOut || '0'),
            ...(isRelaySolDex ? {
              followUpSolDexSwap: {
                outputMint: toToken.contractAddress,
                outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
                toSymbol: toToken.symbol,
                preSolLamports: preRelaySolSnapshot?.nativeLamports != null ? String(preRelaySolSnapshot.nativeLamports) : undefined,
                expectedSolRaw: String(activeQuote?.intermediaryRaw || '0'),
                reserveSol: targetReserve,
                slippageBps: st.swap.slippageBps
              }
            } : {}),
            ...(isRelayEvmDex ? {
              followUpEvmDexSwap: {
                chainKey: String(toToken.blockchain || '').toLowerCase(),
                destToken: toToken.contractAddress,
                destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
                toSymbol: toToken.symbol,
                preNativeWei: preRelayEvmSnapshot?.nativeRaw != null ? String(preRelayEvmSnapshot.nativeRaw) : undefined,
                expectedInRaw: String(activeQuote?.intermediaryRaw || '0'),
                reserveNative: targetReserve,
                slippageBps: st.swap.slippageBps
              }
            } : {})
          }
        };
      }

      st.swap.activeOrder = {
        walletId: wallet.id,
        depositAddress: liveQuote.depositAddress,
        memo: liveQuote.memo || null,
        status: 'PENDING_DEPOSIT',
        fromSymbol: fromToken.symbol,
        toSymbol: toToken.symbol,
        originTxHash: txRes.txHash,
        autoBroadcasted: true,
        createdAt: Date.now(),
        ...(followUpRefSwap ? { followUpRefSwap } : {})
      };
      if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);

      recordWalletActivity(wallet, {
        type: 'swap',
        symbol: fromToken.symbol,
        toSymbol: toToken.symbol,
        chain: fromToken.blockchain,
        amount: amt,
        txHash: txRes.txHash,
        title: `${fromToken.symbol} ➔ ${toToken.symbol}`
      });
      await intents.submitExternalDepositTxHash({
        depositAddress: liveQuote.depositAddress,
        txHash: txRes.txHash,
        nearSenderAccount: nearId
      }).catch(() => {});
      renderSwapOrderCard();
      showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
      startOrderStatusPolling();
    } catch (err) {
      _swapAbortedOrFailed = true;
      st.swap._executing = false;
      const friendly = toUserFriendlyError(err, '兑换失败，请稍后重试', 'Swap failed. Please try again.');
      if (typeof stepper !== 'undefined' && stepper) {
        stepper.setStep(typeof _activeStepIdx === 'number' ? _activeStepIdx : 0, 'error', { error: friendly });
        stepper.finish(false, {
          text: friendly,
          resumable: Boolean(st.swap.activeOrder && st.swap.activeOrder.followUpFailed)
        });
      }
      setSwapError(friendly);
      showToast(friendly);
    } finally {
      if (!_swapAbortedOrFailed && typeof clearSwapAmountAndQuote === 'function') {
        clearSwapAmountAndQuote();
      }
      st.swap._executing = false;
      if (typeof setSwapControlsDisabled === 'function') setSwapControlsDisabled(false);
      updateSwapPrimaryButtonState();
    }
  }

