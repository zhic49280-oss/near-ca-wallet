      // Super-Aggregator Route 1: SOL DEX Token (e.g. NVDAx / TSLAx / JUP) -> SOL (Jupiter/Raydium) -> 1Click External Token
      if (activeQuote?.compositeType === 'SOL_DEX_TO_CROSS_CHAIN') {
        const solAddr = wallet.solAddress;
        if (!solAddr) throw new Error(t('缺少 Solana MPC 地址', 'Missing Solana MPC address'));
        const preSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
        const preLamports = BigInt(preSolRes?.nativeLamports || '0');

        const s1Quote = (activeQuote.stage1DexQuote && activeQuote.stage1DexQuote.outAmount)
          ? activeQuote.stage1DexQuote
          : await contracts.quoteSolanaJupiterSwap({
              inputMint: fromToken.contractAddress,
              outputMint: 'So11111111111111111111111111111111111111112',
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
        await contracts.executeSolanaJupiterSwap({
          wallet,
          quoteResponse: s1Quote,
          wrapAndUnwrapSol: true,
          tokenBalance: avail,
          inputDecimals: fromToken.decimals
        });

        let postSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
        let postLamports = BigInt(postSolRes?.nativeLamports || '0');
        if (postLamports <= preLamports) {
          await new Promise((r) => setTimeout(r, 1800));
          postSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
          postLamports = BigInt(postSolRes?.nativeLamports || '0');
        }
        const deltaLamports = postLamports > preLamports ? (postLamports - preLamports) : BigInt(s1Quote.outAmount || '0');
        const maxSendable = postLamports > 2000000n ? (postLamports - 2000000n) : deltaLamports;
        const sendLamports = deltaLamports > maxSendable ? maxSendable : deltaLamports;
        if (sendLamports <= 0n) throw new Error(t('SOL 余额不足以执行跨链第二阶段', 'Insufficient SOL for Stage 2 bridge'));

        const stage2Live = await intents.quoteIntentSwapOrWithdraw({
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
        const sendSolTx = await contracts.executeSolanaNativeTransfer({
          wallet,
          toAddress: stage2Live.depositAddress,
          amountSol: sendSolNum
        });
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
        showToast(`✅ ${t('已换出 SOL 并发送跨链交付至目标链', 'Swapped to SOL & bridging cross-chain')}`);
        return;
      }

      // Super-Aggregator Route 2: Cross-Chain (1Click -> SOL) + Auto Stage 2 Solana DEX Swap (e.g. NEAR -> NVDAx / TSLAx / JUP)
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX') {
        const solRecip = wallet.solAddress;
        if (!solRecip) throw new Error(t('缺少 Solana MPC 地址', 'Missing Solana MPC address'));
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
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress, gasOverride: originGasOverride });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
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
        showToast(`✅ ${t('跨链第一阶段已发送，到账 SOL 后将自动买入', 'Stage 1 sent; will auto-buy')} ${toToken.symbol}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 3: Cross-Chain (1Click -> EVM Hub) + Auto Stage 2 EVM Multi-Pool DEX (e.g. NEAR -> PONS / AERO / UNI)
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX') {
        const targetBc = String(toToken.blockchain || '').toLowerCase();
        const evmRecip = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmRecip) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
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
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress, gasOverride: originGasOverride });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
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
        showToast(`✅ ${t('跨链第一阶段已发送，到账后将自动执行 DEX 兑换', 'Stage 1 sent; will auto-swap via DEX on arrival')}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 4: Direct EVM -> Arc Mainnet (5042) via Relay / LI.FI
      if (activeQuote?.compositeType === 'EVM_TO_ARC_MAINNET' && typeof contracts.executeEvmRawSteps === 'function') {
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmAddr) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
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
          if (!liveRelay.ok || !liveRelay.steps?.length) throw new Error(liveRelay.error || t('Relay 构建 Arc 跨链失败', 'Relay Arc build failed'));
          bridgeResTx = await contracts.executeEvmRawSteps({ wallet, chainKey: origChain, steps: liveRelay.steps });
        }
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
          showToast(`✅ ${t('已跨链至 Arc 主网，到账后将自动兑换为', 'Bridged to Arc Mainnet; will auto-swap to')} ${toToken.symbol}`);
          return;
        }
        showToast(`✅ ${t('已发送至 Arc Mainnet', 'Sent to Arc Mainnet')}: ${shortenAddr(bridgeResTx.txHash)}`);
        refreshAllBalancesAsync(false);
        return;
      }

      // Super-Aggregator Route 5: Cross-Chain (1Click -> Base USDC) + Relay (Base -> Arc 5042) + optional Arc KyberSwap
      if (activeQuote?.compositeType === 'CROSS_CHAIN_TO_ARC_MAINNET') {
        const evmRecip = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmRecip) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
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
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress, gasOverride: originGasOverride });
        if (!txRes || !txRes.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
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
        showToast(`✅ ${t('第一阶段已发送，到账 Base 后将自动通过 Relay 跨链至 Arc 主网', 'Stage 1 sent; will auto-bridge Base -> Arc via Relay')}`);
        startOrderStatusPolling();
        return;
      }

      // Super-Aggregator Route 6: Arc Mainnet (5042) -> Base -> Target Chain
      if (activeQuote?.compositeType === 'ARC_MAINNET_TO_CROSS_CHAIN' && typeof contracts.executeEvmRawSteps === 'function') {
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (!evmAddr) throw new Error(t('缺少 EVM MPC 地址', 'Missing EVM MPC address'));
        const srcContract = (fromToken.contractAddress || intents.ARC_USDC_CONTRACT).toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
          ? intents.ARC_USDC_CONTRACT
          : fromToken.contractAddress;
        let arcUsdcRaw = amountRaw;
        if (srcContract.toLowerCase() !== intents.ARC_USDC_CONTRACT.toLowerCase()) {
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
          const s1Tx = await contracts.executeEvmDexSwap({
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
          arcUsdcRaw = s1Q.amountOut;
          showToast(`✅ ${t('Arc 第一步已换出 USDC，正在跨链至 Base', 'Arc USDC swapped; bridging to Base')}: ${shortenAddr(s1Tx.txHash)}`);
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
            tokenBalance: avail
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
          if (!liveRelay.ok || !liveRelay.steps?.length) throw new Error(liveRelay.error || t('Relay 从 Arc 跨链失败', 'Relay bridge from Arc failed'));
          bridgeOutRaw = String(liveRelay.amountOut || bridgeOutRaw);
          rTx = await contracts.executeEvmRawSteps({ wallet, chainKey: 'arc', steps: liveRelay.steps });
        }
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
          showToast(`✅ ${t('Arc -> Base 跨链已广播，到账后将自动完成目标链兑换', 'Arc -> Base bridged; will auto-complete stage 3 swap')}: ${shortenAddr(rTx.txHash)}`);
          return;
        }
        showToast(`✅ ${t('Arc -> Base Relay 跨链已广播', 'Arc -> Base Relay tx broadcast')}: ${shortenAddr(rTx.txHash)}`);
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

      // Broadcast FIRST before displaying any order tracking card
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
      showToast(`✅ ${t('源链已签名发送，正在跨链交付至', 'Origin tx sent, delivering to')} ${shortenAddr(effectiveRecipient)}`);
      startOrderStatusPolling();
    } catch (err) {
      st.swap._executing = false;
      setSwapError(err && err.message ? err.message : t('兑换失败', 'Swap failed'));
      showToast(err && err.message ? err.message : t('兑换失败', 'Swap failed'));
    } finally {
      st.swap._executing = false;
      updateSwapPrimaryButtonState();
    }
  }

