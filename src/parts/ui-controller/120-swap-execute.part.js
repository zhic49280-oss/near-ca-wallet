  async function broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress }) {
    const contracts = getContracts();
    const bc = String(fromToken.blockchain || '').toLowerCase();
    if (bc === 'near' && fromToken.symbol === 'NEAR') {
      return contracts.signAndSendNearTransfer({ wallet, receiverId: depositAddress, amountNear: amt });
    }
    if (bc === 'near' && fromToken.contractAddress && typeof contracts.executeNearNep141Transfer === 'function') {
      return contracts.executeNearNep141Transfer({
        wallet,
        tokenContract: fromToken.contractAddress,
        receiverId: depositAddress,
        amount: amt,
        decimals: fromToken.decimals,
        tokenSymbol: fromToken.symbol,
        tokenBalance: avail
      });
    }
    if (bc === 'sol') {
      const isNativeSol = !fromToken.contractAddress ||
        fromToken.contractAddress === 'So11111111111111111111111111111111111111112' ||
        fromToken.symbol === 'SOL';
      if (isNativeSol) {
        return contracts.executeSolanaNativeTransfer({ wallet, toAddress: depositAddress, amountSol: amt });
      }
      return contracts.executeSolanaSplTransfer({
        wallet,
        mintAddress: fromToken.contractAddress,
        toAddress: depositAddress,
        amount: amt,
        decimals: fromToken.decimals || 6,
        tokenBalance: avail
      });
    }
    if (bc === 'prl') {
      const res = await contracts.executePearlTransfer({ wallet, toAddress: depositAddress, amountPrl: amt, feeDeductMode: 'extra' });
      applyOptimisticChainSpend(wallet, 'prl', amt, Number(res && res.feePrl) || 0, res && res.txHash);
      return res;
    }
    if (bc === 'btc') {
      const res = await contracts.executeBitcoinTransfer({ wallet, toAddress: depositAddress, amountBtc: amt, feeDeductMode: 'extra' });
      applyOptimisticChainSpend(wallet, 'btc', amt, Number(res && res.feeBtc) || 0, res && res.txHash);
      return res;
    }
    if (contracts && contracts.EVM_CHAINS && contracts.EVM_CHAINS[bc]) {
      await ensureEthersLoaded();
      return contracts.executeEvmTransfer({
        wallet,
        chainKey: bc,
        toAddress: depositAddress,
        amount: amt,
        tokenContract: fromToken.contractAddress,
        decimals: fromToken.decimals,
        tokenBalance: avail
      });
    }
    throw new Error(t(`暂不支持从 ${bc.toUpperCase()} 自动发送源链交易`, `Auto origin deposit from ${bc.toUpperCase()} is unavailable`));
  }

  async function executeActiveSwap() {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const amt = Number(st.swap.amountIn);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast(t('请输入兑换数量', 'Enter swap amount'));
      return;
    }

    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (!fromToken || !toToken || fromToken.assetId === toToken.assetId) return;

    if (!isSwapOriginSupported(fromToken)) {
      const unsupMsg = t(`暂不支持从 ${String(fromToken.blockchain || '').toUpperCase()} 发起闪兑`, `Swaps from ${String(fromToken.blockchain || '').toUpperCase()} are not supported yet`);
      resetSwapQuoteDisplay();
      setSwapError(unsupMsg);
      showToast(unsupMsg);
      return;
    }

    const avail = getSwapTokenAvailableBalance(fromToken);
    const isNative = isSwapTokenNative(fromToken);

    // Strict Local Balance Pre-Validation BEFORE firing RPC / quotes
    try {
      const gasReserveInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', st.swap.quoteData || null);
      contracts.validateSufficientChainBalance({
        wallet,
        chain: fromToken.blockchain,
        tokenSymbol: fromToken.symbol,
        amount: amt,
        isNative,
        tokenBalance: avail !== null ? avail : 0,
        gasBuffer: isNative && fromToken.blockchain === 'sol' && gasReserveInfo.selectedReserve > 0
          ? gasReserveInfo.selectedReserve
          : null
      });
      validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData: st.swap.quoteData, amountIn: amt });
    } catch (err) {
      setSwapError(err.message);
      showToast(err.message);
      return;
    }

    const authImpact = st.swap.quoteData ? computeSwapPriceImpact(st.swap._usdInVal, st.swap._usdOutVal) : null;
    const impactPromptSuffix = authImpact && (authImpact.level === 'high' || authImpact.level === 'critical')
      ? ` (⚠️ ${t('价差', 'Impact')} -${authImpact.pct.toFixed(1)}%)`
      : '';
    if (!(await verifySecurityAuthAsync(wallet, `${t('确认兑换', 'Confirm swap')} ${st.swap.amountIn} ${fromToken.symbol} → ${toToken.symbol}${impactPromptSuffix}`))) return;

    st.swap._executing = true;
    setSwapError('');

    try {
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const amountRaw = intents.toBaseUnits(st.swap.amountIn, fromToken.decimals);
      const sameChainDex = isSameChainContractSwap(fromToken, toToken);

      if (sameChainDex) {
        if (fromToken.blockchain === 'near') {
          const is1ClickBest = st.swap.quoteData?.routeSource === 'NEAR_INTENTS_1CLICK'
            || (st.swap.quoteData?.bestSource === '1Click Solver' && !st.swap.quoteData?.compositeType);
          const hasNearDexQuote = Boolean(
            st.swap.quoteData
            && (st.swap.quoteData.actions?.length || (st.swap.quoteData.isDcl && st.swap.quoteData.poolIds?.length))
          );
          if (!st.swap.quoteData?.compositeType && !is1ClickBest) {
            const refQ = hasNearDexQuote
              ? st.swap.quoteData
              : await contracts.quoteNearRefFinanceSwap({
                  tokenIn: fromToken.contractAddress,
                  tokenOut: toToken.contractAddress,
                  amountRaw,
                  slippageBps: st.swap.slippageBps
                });
            // Only take single-step Ref/DCL swap if pool liquidity exists on NEAR
            if (refQ && refQ.ok && (refQ.actions?.length || (refQ.isDcl && refQ.poolIds?.length))) {
              const res = await contracts.executeNearRefFinanceSwap({
                wallet,
                routeData: refQ.routeData,
                actions: refQ.actions,
                poolIds: refQ.poolIds,
                minAmountOut: refQ.minAmountOut,
                tokenIn: fromToken.contractAddress,
                tokenOut: toToken.contractAddress,
                amountRaw,
                slippageBps: st.swap.slippageBps,
                tokenBalance: avail,
                inputDecimals: fromToken.decimals,
                tokenSymbol: fromToken.symbol
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
              showToast(`✅ ${refQ.isDcl ? 'Rhea CLMM' : 'Ref Finance'} ${t('成交广播成功', 'Swap broadcast')}: ${shortenAddr(res.txHash)}`);
              refreshAllBalancesAsync(false);
              return;
            }
          }
        } else if (fromToken.blockchain === 'sol') {
          const quoteResp = st.swap.quoteData && st.swap.quoteData.outAmount
            ? st.swap.quoteData
            : await contracts.quoteSolanaJupiterSwap({
                inputMint: fromToken.contractAddress,
                outputMint: toToken.contractAddress,
                amountRaw,
                slippageBps: st.swap.slippageBps
              });
          const res = await contracts.executeSolanaJupiterSwap({
            wallet,
            quoteResponse: quoteResp,
            wrapAndUnwrapSol: true,
            tokenBalance: avail,
            inputDecimals: fromToken.decimals
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
          showToast(`✅ ${quoteResp.bestSource || 'Jupiter'} ${t('成交广播成功', 'Swap broadcast')}: ${shortenAddr(res.txHash)}`);
          refreshAllBalancesAsync(false);
          return;
        } else {
          // EVM Contract DEX Execution (signed via NEAR MPC)
          await ensureEthersLoaded();
          const q = st.swap.quoteData && st.swap.quoteData.routeData
            ? st.swap.quoteData
            : await contracts.quoteEvmDexSwap({
                chainKey: fromToken.blockchain,
                srcToken: fromToken.contractAddress,
                destToken: toToken.contractAddress,
                amountRaw,
                srcDecimals: fromToken.decimals,
                destDecimals: toToken.decimals,
                slippageBps: st.swap.slippageBps,
                fromAddress: wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : ''
              });
          if (!q.ok || !q.routeData) throw new Error(q.error || t('获取 EVM 路由失败', 'EVM route unavailable'));

          const res = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: fromToken.blockchain,
            routeSource: q.routeSource,
            routeData: q.routeData,
            srcToken: fromToken.contractAddress,
            destToken: toToken.contractAddress,
            amountRaw,
            srcDecimals: fromToken.decimals,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail
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
          showToast(`✅ ${q.label} ${t('MPC 兑换广播成功', 'MPC Swap broadcast')}: ${shortenAddr(res.txHash)}`);
          refreshAllBalancesAsync(false);
          return;
        }
      }

      const nearId = wallet.nearNamedAccount || wallet.nearAddress;
      const rawRecipient = st.swap.recipientAddress || getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
      if (!rawRecipient) throw new Error(t('请填写目标链收款地址', 'Destination address required'));
      const refundTo = getWalletDefaultRecipientForChain(wallet, fromToken.blockchain) || nearId;

      let activeQuote = st.swap.quoteData;
      const forceSelfPre = doesSwapRouteRequireSelfRecipient(fromToken, toToken, activeQuote);
      let recipient = forceSelfPre ? (getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || rawRecipient) : rawRecipient;
      if (!activeQuote && typeof intents.quoteCrossChainWithDexRelay === 'function') {
        activeQuote = await intents.quoteCrossChainWithDexRelay({
          fromToken,
          toToken,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient,
          refundTo,
          nearAccountId: nearId,
          solAddress: wallet.solAddress,
          evmAddress: wallet.mpcEvmAddress || wallet.evmAddress
        }).catch(() => null);
      }
      if (doesSwapRouteRequireSelfRecipient(fromToken, toToken, activeQuote)) {
        recipient = getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || recipient;
      }

      validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData: activeQuote, amountIn: amt });

      // Composite PRL & Smart Hub Multi-Stage Routes
      const originIsPrl = isPrlSwapToken(fromToken);
      const destIsPrl = isPrlSwapToken(toToken);

      if (activeQuote?.compositeType === 'SMART_HUB_ROUTE' && Array.isArray(activeQuote.stages) && activeQuote.stages.length > 0) {
        let stages = activeQuote.stages.slice();
        let stageAmtRaw = amountRaw;
        if (stages[0] && stages[0].type === 'ORIGIN_DEX') {
          const origStage = stages.shift();
          if (origStage.chain === 'sol') {
            const solAddr = wallet.solAddress;
            const preSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
            const preLamports = BigInt(preSolRes?.nativeLamports || '0');
            const s0Quote = origStage.quote || await contracts.quoteSolanaJupiterSwap({
              inputMint: fromToken.contractAddress,
              outputMint: 'So11111111111111111111111111111111111111112',
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
            await contracts.executeSolanaJupiterSwap({
              wallet,
              quoteResponse: s0Quote,
              wrapAndUnwrapSol: true,
              tokenBalance: avail,
              inputDecimals: fromToken.decimals
            });
            const postSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
            const postLamports = BigInt(postSolRes?.nativeLamports || '0');
            const deltaL = postLamports > preLamports ? (postLamports - preLamports) : BigInt(s0Quote.outAmount || '0');
            stageAmtRaw = (deltaL > 0n ? deltaL : BigInt(s0Quote.outAmount || '0')).toString();
          } else {
            await ensureEthersLoaded();
            const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
            const preEvm = await contracts.fetchEvmNativeAndErc20Balance(origStage.chain, evmAddr).catch(() => null);
            const preWei = BigInt(preEvm?.nativeRaw || '0');
            const s0Q = origStage.quote || await contracts.quoteEvmDexSwap({
              chainKey: origStage.chain,
              srcToken: fromToken.contractAddress,
              destToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
              amountRaw,
              srcDecimals: fromToken.decimals,
              destDecimals: 18,
              slippageBps: st.swap.slippageBps,
              fromAddress: evmAddr
            });
            await contracts.executeEvmDexSwap({
              wallet,
              chainKey: origStage.chain,
              routeSource: s0Q.routeSource,
              routeData: s0Q.routeData,
              srcToken: fromToken.contractAddress,
              destToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
              amountRaw,
              srcDecimals: fromToken.decimals,
              slippageBps: st.swap.slippageBps,
              tokenBalance: avail
            });
            const postEvm = await contracts.fetchEvmNativeAndErc20Balance(origStage.chain, evmAddr).catch(() => null);
            const postWei = BigInt(postEvm?.nativeRaw || '0');
            const deltaW = postWei > preWei ? (postWei - preWei) : BigInt(s0Q.amountOut || '0');
            stageAmtRaw = (deltaW > 0n ? deltaW : BigInt(s0Q.amountOut || '0')).toString();
          }
        }
        const first = stages[0];
        if (!first) return;
        const destDexLeg = stages.find((s) => s.type === 'DEST_DEX') || null;
        const resolveBridgeOutRecipient = (leg) => {
          if (destDexLeg) {
            return destDexLeg.chain === 'sol'
              ? (wallet.solAddress || recipient)
              : (wallet.mpcEvmAddress || wallet.evmAddress || recipient);
          }
          return (leg && leg.recipient) || recipient;
        };
        const buildDestDexFollowUp = async (expectedInRaw) => {
          if (!destDexLeg) return {};
          if (destDexLeg.chain === 'sol') {
            const preSol = await contracts.fetchSolanaNativeAndSplBalances(wallet.solAddress, []).catch(() => null);
            return {
              followUpSolDexSwap: {
                outputMint: toToken.contractAddress,
                outputDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 6,
                toSymbol: toToken.symbol,
                expectedSolRaw: String(expectedInRaw || '0'),
                preSolLamports: String(preSol?.nativeLamports || '0'),
                reserveSol: getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve,
                slippageBps: st.swap.slippageBps
              }
            };
          }
          const evmRecip = wallet.mpcEvmAddress || wallet.evmAddress;
          const preEvm = await contracts.fetchEvmNativeAndErc20Balance(destDexLeg.chain, evmRecip).catch(() => null);
          return {
            followUpEvmDexSwap: {
              chainKey: destDexLeg.chain,
              destToken: toToken.contractAddress,
              destDecimals: typeof toToken.decimals === 'number' ? toToken.decimals : 18,
              toSymbol: toToken.symbol,
              expectedInRaw: String(expectedInRaw || '0'),
              preNativeWei: String(preEvm?.nativeRaw || '0'),
              reserveNative: getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', activeQuote).selectedReserve,
              slippageBps: st.swap.slippageBps
            }
          };
        };
        if (first.type === 'BRIDGE_IN') {
          const swapLeg = stages.find((s) => s.type === 'NEAR_SWAP') || null;
          const outLeg = stages.find((s) => s.type === 'BRIDGE_OUT') || null;
          const liveIn = await intents.quoteIntentSwapOrWithdraw({
            originAsset: first.originAsset || fromToken.assetId,
            destinationAsset: first.destinationAsset,
            amountRaw: stageAmtRaw,
            slippageBps: st.swap.slippageBps,
            recipient: (!swapLeg && !outLeg) ? recipient : nearId,
            refundTo,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            appFeeBps: outLeg ? 0 : 25,
            dry: false
          });
          if (!liveIn.ok || !liveIn.depositAddress) {
            throw new Error(liveIn.error || t('创建第一阶段跨链订单失败', 'Failed to create Stage 1 cross-chain order'));
          }
          const destFollow = outLeg ? await buildDestDexFollowUp(outLeg.expectedOut) : {};
          const bridgeOutRecip = outLeg ? resolveBridgeOutRecipient(outLeg) : recipient;
          const bridgeToken = stages.length < activeQuote.stages.length
            ? {
                blockchain: fromToken.blockchain,
                symbol: fromToken.blockchain === 'sol' ? 'SOL' : fromToken.blockchain.toUpperCase(),
                contractAddress: '',
                decimals: fromToken.blockchain === 'sol' ? 9 : 18
              }
            : fromToken;
          const bridgeAmtNum = stages.length < activeQuote.stages.length
            ? Number(intents.fromBaseUnits(stageAmtRaw, bridgeToken.decimals))
            : amt;
          const inTx = await broadcastOriginDepositTx({ wallet, fromToken: bridgeToken, amt: bridgeAmtNum, avail: bridgeAmtNum, depositAddress: liveIn.depositAddress });
          if (!inTx || !inTx.txHash) {
            throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
          }
          const bridgeOrder = {
            walletId: wallet.id,
            depositAddress: liveIn.depositAddress,
            memo: liveIn.memo || null,
            status: 'PENDING_DEPOSIT',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: inTx.txHash,
            autoBroadcasted: true,
            createdAt: Date.now()
          };
          if (swapLeg) {
            bridgeOrder.followUpRefSwap = {
              tokenIn: swapLeg.tokenIn,
              tokenOut: swapLeg.tokenOut,
              isDcl: Boolean(swapLeg.isDcl),
              poolIds: Array.isArray(swapLeg.poolIds) ? swapLeg.poolIds : [],
              amountUsdcRaw: liveIn.amountOut || first.expectedOut,
              slippageBps: st.swap.slippageBps,
              inputDecimals: swapLeg.inDecimals || first.hubDecimals || 8,
              tokenSymbol: swapLeg.inSymbol || first.hubSymbol || 'PRL',
              followUpBridgeOut: outLeg ? {
                originAsset: outLeg.originAsset,
                destinationAsset: outLeg.destinationAsset,
                hubContract: outLeg.hubContract,
                hubDecimals: outLeg.hubDecimals || swapLeg.outDecimals || 8,
                hubSymbol: outLeg.hubSymbol || swapLeg.outSymbol || 'PRL',
                recipient: bridgeOutRecip,
                expectedInRaw: outLeg.expectedIn || swapLeg.expectedOut,
                ...destFollow
              } : null
            };
          } else if (outLeg) {
            bridgeOrder.followUpBridgeOut = {
              originAsset: outLeg.originAsset,
              destinationAsset: outLeg.destinationAsset,
              hubContract: outLeg.hubContract,
              hubDecimals: outLeg.hubDecimals || first.hubDecimals || 8,
              hubSymbol: outLeg.hubSymbol || first.hubSymbol || 'PRL',
              recipient: bridgeOutRecip,
              expectedInRaw: outLeg.expectedIn || first.expectedOut,
              ...destFollow
            };
          }
          st.swap.activeOrder = bridgeOrder;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            chain: fromToken.blockchain,
            amount: amt,
            txHash: inTx.txHash,
            title: `${fromToken.symbol} ➔ ${toToken.symbol}`
          });
          await intents.submitExternalDepositTxHash({
            depositAddress: liveIn.depositAddress,
            txHash: inTx.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('跨链第一阶段已发送，到账后将自动完成后续兑换', 'Stage 1 sent; will auto-complete remaining stages on arrival')}`);
          return;
        }

        if (first.type === 'NEAR_SWAP') {
          const outLeg = stages.find((s) => s.type === 'BRIDGE_OUT') || null;
          const preOutBal = outLeg
            ? await intents.fetchNearNep141Balances(nearId, { [first.tokenOut]: first.outDecimals || 8 }).catch(() => null)
            : null;
          const preOutRaw = BigInt(preOutBal?.[first.tokenOut]?.raw || '0');
          const swapRes = await contracts.executeNearRefFinanceSwap({
            wallet,
            tokenIn: first.tokenIn,
            tokenOut: first.tokenOut,
            amountRaw: stageAmtRaw,
            slippageBps: st.swap.slippageBps,
            tokenBalance: avail,
            inputDecimals: first.inDecimals || fromToken.decimals || 18,
            tokenSymbol: first.inSymbol || fromToken.symbol
          });
          if (!outLeg) {
            recordWalletActivity(wallet, {
              type: 'swap',
              symbol: fromToken.symbol,
              toSymbol: toToken.symbol,
              chain: fromToken.blockchain,
              amount: amt,
              txHash: swapRes.txHash,
              title: `${fromToken.symbol} ➔ ${toToken.symbol}`
            });
            showToast(`✅ Ref Finance ${t('成交广播成功', 'Swap broadcast')}: ${shortenAddr(swapRes.txHash)}`);
            refreshAllBalancesAsync(false);
            return;
          }
          const postOutBal = await intents.fetchNearNep141Balances(nearId, { [first.tokenOut]: first.outDecimals || 8 }).catch(() => null);
          const postOutRaw = BigInt(postOutBal?.[first.tokenOut]?.raw || '0');
          const deltaOut = postOutRaw > preOutRaw ? (postOutRaw - preOutRaw) : BigInt(swapRes.amountOut || first.expectedOut || '0');
          const bridgeInRaw = (deltaOut > 0n ? deltaOut : BigInt(first.expectedOut || '0')).toString();
          const destFollow = await buildDestDexFollowUp(outLeg.expectedOut);
          const liveOut = await intents.quoteIntentSwapOrWithdraw({
            originAsset: outLeg.originAsset,
            destinationAsset: outLeg.destinationAsset,
            amountRaw: bridgeInRaw,
            slippageBps: st.swap.slippageBps,
            recipient: resolveBridgeOutRecipient(outLeg),
            refundTo: nearId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: false
          });
          if (!liveOut.ok || !liveOut.depositAddress) {
            throw new Error(liveOut.error || t('获取第二阶段跨链桥路由失败', 'Failed to get Stage 2 bridge route'));
          }
          const bridgeDec = outLeg.hubDecimals || first.outDecimals || 8;
          const bridgeSym = outLeg.hubSymbol || first.outSymbol || 'PRL';
          const bridgeHuman = intents.fromBaseUnits(bridgeInRaw, bridgeDec);
          let sendBridge = null;
          if (outLeg.hubContract === 'wrap.near') {
            sendBridge = await contracts.executeNearNep141Transfer({
              wallet,
              tokenContract: 'wrap.near',
              receiverId: liveOut.depositAddress,
              amount: bridgeHuman,
              decimals: 24,
              tokenSymbol: 'wNEAR',
              tokenBalance: Number(bridgeHuman)
            });
          } else {
            sendBridge = await contracts.executeNearNep141Transfer({
              wallet,
              tokenContract: outLeg.hubContract,
              receiverId: liveOut.depositAddress,
              amount: bridgeHuman,
              decimals: bridgeDec,
              tokenSymbol: bridgeSym,
              tokenBalance: Number(bridgeHuman)
            });
          }
          await intents.submitExternalDepositTxHash({
            depositAddress: liveOut.depositAddress,
            txHash: sendBridge.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          st.swap.activeOrder = {
            walletId: wallet.id,
            depositAddress: liveOut.depositAddress,
            memo: liveOut.memo || null,
            status: 'PENDING_DEPOSIT',
            fromSymbol: fromToken.symbol,
            toSymbol: toToken.symbol,
            originTxHash: sendBridge.txHash,
            autoBroadcasted: true,
            createdAt: Date.now(),
            ...destFollow
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
          showToast(`✅ ${t('已完成 NEAR 链内兑换并自动发起跨链交付', 'Swapped on NEAR & bridging to destination chain')}`);
          return;
        }
      }

      // Sub-route A: NEAR Token -> PRL (Pearl L1) via Ref Finance -> 1Click bridge
      if (!originIsPrl && destIsPrl && toToken.blockchain === 'prl' && fromToken.blockchain === 'near') {
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
      if (originIsPrl && !destIsPrl && toToken.blockchain === 'near' && toToken.contractAddress
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
        const bridgeTx = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: bridgeLive.depositAddress });
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
      if (originIsPrl && !destIsPrl && fromToken.blockchain === 'near') {
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
      if (!originIsPrl && destIsPrl && (fromToken.blockchain !== 'near' || st.swap.quoteData?.compositeType === 'EXTERNAL_TO_PRL')) {
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
          depositAddress: liveQuote.depositAddress
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
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
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
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
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
            tokenBalance: avail
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
        const txRes = await broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress: liveQuote.depositAddress });
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
            tokenBalance: avail
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
      const isPearlOriginFollowUp = originIsPrl && !destIsPrl && fromToken.blockchain === 'prl';
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
        depositAddress: liveQuote.depositAddress
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

