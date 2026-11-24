  async function broadcastOriginDepositTx({ wallet, fromToken, amt, avail, depositAddress, gasOverride = null }) {
    const contracts = getContracts();
    const bc = String(fromToken.blockchain || '').toLowerCase();
    const gasBuffer = gasOverride && gasOverride.gasBuffer !== undefined ? gasOverride.gasBuffer : null;
    const gasMeta = (gasOverride && gasOverride.meta) || {};
    if (bc === 'near' && fromToken.symbol === 'NEAR') {
      return contracts.signAndSendNearTransfer({ wallet, receiverId: depositAddress, amountNear: amt, gasBuffer });
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
        return contracts.executeSolanaNativeTransfer({ wallet, toAddress: depositAddress, amountSol: amt, gasBuffer });
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
      const res = await contracts.executePearlTransfer({
        wallet,
        toAddress: depositAddress,
        amountPrl: amt,
        feeDeductMode: 'extra',
        feePerKbPrl: gasMeta.feePerKbPrl ?? null,
        gasBuffer
      });
      applyOptimisticChainSpend(wallet, 'prl', amt, Number(res && res.feePrl) || 0, res && res.txHash);
      return res;
    }
    if (bc === 'btc') {
      const res = await contracts.executeBitcoinTransfer({
        wallet,
        toAddress: depositAddress,
        amountBtc: amt,
        feeDeductMode: 'extra',
        feeRateSatVb: gasMeta.feeRateSatVb ?? null,
        gasBuffer
      });
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
        tokenBalance: avail,
        gasBuffer,
        gasPriceWei: gasMeta.gasPriceWei ?? null,
        gasLimit: gasMeta.gasLimit ?? null
      });
    }
    throw new Error(t(`暂不支持从 ${bc.toUpperCase()} 自动发送源链交易`, `Auto origin deposit from ${bc.toUpperCase()} is unavailable`));
  }

  async function executeActiveSwap() {
    const st = getState();
    if (st.swap._executing) return;
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const existingOrder = st.swap.activeOrder;
    const hasPendingMultiStage = existingOrder && existingOrder.walletId === wallet.id && (
      existingOrder.followUpConfidentialSwap ||
      existingOrder.followUpRefSwap ||
      existingOrder.followUpDclSwap ||
      existingOrder.followUpSolDexSwap ||
      existingOrder.followUpEvmDexSwap ||
      existingOrder.followUpArcRelay ||
      existingOrder.followUpArcDexSwap ||
      existingOrder.followUpBaseOneClick ||
      existingOrder.followUpBridgeOut
    ) && !['SUCCESS', 'COMPLETED', 'FAILED', 'REFUNDED'].includes(String(existingOrder.status || '').toUpperCase()) && !existingOrder.followUpExecuted;
    if (hasPendingMultiStage) {
      showToast(t('当前有一笔多段闪兑正在执行，请等待完成后再发起新兑换', 'A multi-step swap is in progress. Please wait for it to finish.'));
      return;
    }

    const rawAmt = Number(st.swap.amountIn);
    if (!Number.isFinite(rawAmt) || rawAmt <= 0) {
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
    const gasPlan = resolveEffectiveSwapGasPlan(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', st.swap.quoteData || null);
    const gasBuf = isNative ? gasPlan.gasBuffer : null;
    const originGasOverride = isNative
      ? { gasBuffer: gasPlan.gasBuffer, meta: (gasPlan.liveGas && gasPlan.liveGas.meta) || {} }
      : null;
    let effectiveAvail = avail !== null ? avail : 0;
    if (isNative && gasPlan.liveGas && gasPlan.liveGas.liveBalanceBaseUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
      const liveNum = Number(contracts.fromBaseUnits(gasPlan.liveGas.liveBalanceBaseUnits, fromToken.decimals || 18));
      if (Number.isFinite(liveNum) && liveNum > 0 && liveNum <= effectiveAvail + 1e-12) {
        effectiveAvail = liveNum;
      }
    }
    const amt = rawAmt;
    const amtStr = String(st.swap.amountIn);

    // Strict Local Balance Pre-Validation BEFORE firing RPC / quotes
    try {
      contracts.validateSufficientChainBalance({
        wallet,
        chain: fromToken.blockchain,
        tokenSymbol: fromToken.symbol,
        amount: amt,
        isNative,
        tokenBalance: effectiveAvail,
        gasBuffer: gasBuf
      });
      validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData: st.swap.quoteData, amountIn: amt });
      const activeCompType = st.swap.quoteData && st.swap.quoteData.compositeType;
      if (activeCompType === 'CROSS_CHAIN_TO_ARC_MAINNET' || activeCompType === 'ARC_MAINNET_TO_CROSS_CHAIN') {
        const baseEthBal = Number((wallet.nativeBalances && wallet.nativeBalances.base) ?? 0);
        if (baseEthBal < 0.00005) {
          throw new Error(t(`Base 链 ETH Gas 余额不足 (当前: ${baseEthBal.toFixed(6)} ETH，中继需要 >= 0.00005 ETH)`, `Insufficient Base ETH for relay gas (${baseEthBal.toFixed(6)} < 0.00005 ETH)`));
        }
      }
    } catch (err) {
      setSwapError(err.message);
      showToast(err.message);
      return;
    }

    st.swap._executing = true;
    let _swapAbortedOrFailed = false;
    try {
      const authImpact = st.swap.quoteData ? computeSwapPriceImpact(st.swap._usdInVal, st.swap._usdOutVal) : null;
      const impactPromptSuffix = authImpact && (authImpact.level === 'high' || authImpact.level === 'critical')
        ? ` (⚠️ ${t('价差', 'Impact')} -${authImpact.pct.toFixed(1)}%)`
        : '';
      const isThirdParty = isCustomThirdPartySwapRecipient(wallet, toToken);
      const thirdPartySuffix = isThirdParty ? ` → ${shortenAddr(st.swap.recipientAddress)}` : '';
      if (!(await verifySecurityAuthAsync(wallet, `${t('确认兑换', 'Confirm swap')} ${amtStr} ${fromToken.symbol} → ${toToken.symbol}${impactPromptSuffix}${thirdPartySuffix}`))) {
        _swapAbortedOrFailed = true;
        return;
      }

      setSwapError('');
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const amountRaw = intents.toBaseUnits(amtStr, fromToken.decimals);
      const sameChainDex = isSameChainContractSwap(fromToken, toToken);

      if (sameChainDex) {
        if (fromToken.blockchain === 'near') {
          const is1ClickBest = st.swap.quoteData?.routeSource === 'NEAR_INTENTS_1CLICK'
            || (st.swap.quoteData?.bestSource === '1Click Solver' && !st.swap.quoteData?.compositeType);
          const hasNearDexQuote = Boolean(
            st.swap.quoteData
            && (st.swap.quoteData.actions?.length || (st.swap.quoteData.isDcl && st.swap.quoteData.poolIds?.length))
          );
          if (!st.swap.quoteData?.compositeType && !is1ClickBest && !isThirdParty) {
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
          if (isThirdParty) {
            throw new Error(t('当前路由不支持发往第三方地址，请改回本人地址后重试', 'Current route cannot send to a third-party address; switch recipient to your own address'));
          }
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
            inputDecimals: fromToken.decimals,
            gasBuffer: isNative ? gasBuf : null
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
          if (isThirdParty) {
            throw new Error(t('当前路由不支持发往第三方地址，请改回本人地址后重试', 'Current route cannot send to a third-party address; switch recipient to your own address'));
          }
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
            tokenBalance: avail,
            gasBuffer: isNative ? gasBuf : null
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
      let recipient = (!isThirdParty && forceSelfPre) ? (getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || rawRecipient) : rawRecipient;
      if (!activeQuote && typeof intents.quoteCrossChainWithDexRelay === 'function') {
        activeQuote = await intents.quoteCrossChainWithDexRelay({
          fromToken,
          toToken,
          amountRaw,
          slippageBps: st.swap.slippageBps,
          recipient,
          refundTo,
          nearAccountId: nearId,
          nearImplicitAddress: wallet.nearAddress,
          nearPrivateSeedHex: wallet.nearPrivateSeedHex,
          nearPublicKey: wallet.nearPublicKey,
          availNearBalance: Number(wallet.nativeBalances?.near ?? wallet.nearBalance ?? 0),
          solAddress: wallet.solAddress,
          evmAddress: wallet.mpcEvmAddress || wallet.evmAddress,
          requireThirdPartyRecipient: isThirdParty
        }).catch(() => null);
      }
      if (isThirdParty && doesSwapRouteRequireSelfRecipient(fromToken, toToken, activeQuote)) {
        throw new Error(t('当前路由不支持发往第三方地址，请改回本人地址后重试', 'Current route cannot send to a third-party address; switch recipient to your own address'));
      }
      if (!isThirdParty && doesSwapRouteRequireSelfRecipient(fromToken, toToken, activeQuote)) {
        recipient = getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || recipient;
      }

      validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData: activeQuote, amountIn: amt });

      // Composite PRL & Smart Hub Multi-Stage Routes
      const originIsPrl = isPrlSwapToken(fromToken);
      const destIsPrl = isPrlSwapToken(toToken);

      if (activeQuote?.compositeType === 'NEARCOM_CONFIDENTIAL_SWAP' && typeof intents.requestNearcomConfidentialDeposit === 'function') {
        const depRes = await intents.requestNearcomConfidentialDeposit({
          wallet,
          fromToken,
          originAsset: activeQuote.originAsset,
          originChain: activeQuote.originChain,
          amountRaw
        });
        if (!depRes || !depRes.ok || !depRes.depositAddress) {
          throw new Error((depRes && depRes.error) || t('创建 near.com 机密入金订单失败', 'Failed to create confidential deposit order'));
        }
        const inTx = await broadcastOriginDepositTx({
          wallet,
          fromToken,
          amt,
          avail,
          depositAddress: depRes.depositAddress,
          gasOverride: originGasOverride
        });
        if (!inTx || !inTx.txHash) {
          throw new Error(t('源链交易广播失败，请检查余额与网络后重试', 'Origin transaction broadcast failed'));
        }
        st.swap.activeOrder = {
          walletId: wallet.id,
          depositAddress: depRes.depositAddress,
          memo: depRes.memo || null,
          status: 'PENDING_DEPOSIT',
          fromSymbol: fromToken.symbol,
          toSymbol: toToken.symbol,
          originTxHash: inTx.txHash,
          autoBroadcasted: true,
          createdAt: Date.now(),
          followUpConfidentialSwap: {
            depositProof: depRes.proof,
            originAsset: activeQuote.originAsset,
            destinationAsset: activeQuote.destinationAsset,
            destinationChain: activeQuote.destinationChain,
            destinationBlockchain: toToken.blockchain,
            amountInRaw: amountRaw,
            slippageBps: st.swap.slippageBps,
            recipient,
            feeBps: activeQuote.serviceFeeBps !== undefined ? activeQuote.serviceFeeBps : 25,
            feeRecipient: intents.DEFAULT_REFERRAL_ACCOUNT
          }
        };
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
        renderSwapOrderCard();
        startOrderStatusPolling();
        showToast(`✅ ${t('源链入金已广播，到账后将自动完成 near.com 机密兑换与提现', 'Deposit broadcast; will auto-complete confidential swap & withdraw')}`);
        return;
      }

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
        if (!first) {
          _swapAbortedOrFailed = true;
          return;
        }
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
            ? Math.max(0, Number(intents.fromBaseUnits(stageAmtRaw, bridgeToken.decimals)) - (typeof contracts.getNativeGasReserve === 'function' ? contracts.getNativeGasReserve(bridgeToken.blockchain) : 0.002))
            : amt;
          const bridgeAvail = stages.length < activeQuote.stages.length
            ? Number(intents.fromBaseUnits(stageAmtRaw, bridgeToken.decimals))
            : avail;
          if (bridgeAmtNum <= 0) {
            throw new Error(t('源链兑换后余额不足以支付跨链手续费', 'Post-swap balance insufficient for bridge gas'));
          }
          const inTx = await broadcastOriginDepositTx({
            wallet,
            fromToken: bridgeToken,
            amt: bridgeAmtNum,
            avail: bridgeAvail,
            depositAddress: liveIn.depositAddress,
            gasOverride: stages.length < activeQuote.stages.length ? null : originGasOverride
          });
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

