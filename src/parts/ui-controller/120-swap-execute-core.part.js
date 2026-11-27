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

  function setSwapControlsDisabled(disabled) {
    const flag = Boolean(disabled);
    ['swap-amount-in', 'swap-from-token-btn', 'swap-to-token-btn', 'swap-flip-btn', 'swap-recipient-input'].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = flag;
    });
  }

  async function executeActiveSwap() {
    const st = getState();
    if (st.swap._executing) return;
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const existingOrder = st.swap.activeOrder;
    const hasPendingMultiStage = existingOrder && existingOrder.walletId === wallet.id &&
      hasPendingSwapFollowUp(existingOrder) && !existingOrder.followUpExecuted && (
      existingOrder.followUpFailed ||
      !['SUCCESS', 'COMPLETED', 'FAILED', 'REFUNDED'].includes(String(existingOrder.status || '').toUpperCase())
    );
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
      const liveScaled = scaleSwapLiveGasUnits(fromToken, gasPlan.liveGas.liveBalanceBaseUnits, null);
      const liveNum = Number(contracts.fromBaseUnits(liveScaled.balanceUnits, fromToken.decimals || 18));
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
      if (!isNative && (typeof contracts.getNativeGasReserve === 'function' || contracts.DEFAULT_GAS_BUFFERS)) {
        const ck = String(fromToken.blockchain || '').toLowerCase();
        const minNative = typeof contracts.getNativeGasReserve === 'function'
          ? contracts.getNativeGasReserve(ck)
          : Number((contracts.DEFAULT_GAS_BUFFERS && contracts.DEFAULT_GAS_BUFFERS[ck]) || 0);
        const nativeBal = Number((wallet.nativeBalances && wallet.nativeBalances[ck]) ?? 0);
        if (minNative > 0 && nativeBal + 1e-12 < minNative) {
          throw new Error(`${String(fromToken.blockchain || '').toUpperCase()} ${t('主链 Gas 余额不足', 'native gas insufficient')} (${nativeBal.toFixed(5)} < ${minNative})`);
        }
      }
      const activeCompType = st.swap.quoteData && st.swap.quoteData.compositeType;
      const needsBaseRelayGas =
        activeCompType === 'CROSS_CHAIN_TO_ARC_MAINNET' ||
        (activeCompType === 'ARC_MAINNET_TO_CROSS_CHAIN' && Boolean(st.swap.quoteData && st.swap.quoteData.stage3Quote));
      if (needsBaseRelayGas) {
        const baseEthBal = Number((wallet.nativeBalances && wallet.nativeBalances.base) ?? 0);
        if (baseEthBal < 0.00005) {
          throw new Error(t(`Base 链 ETH Gas 余额不足 (当前: ${baseEthBal.toFixed(6)} ETH，中继需要 >= 0.00005 ETH)`, `Insufficient Base ETH for relay gas (${baseEthBal.toFixed(6)} < 0.00005 ETH)`));
        }
      }
    } catch (err) {
      const friendly = toUserFriendlyError(err, '兑换校验失败，请检查后重试', 'Swap validation failed. Please check and retry.');
      setSwapError(friendly);
      showToast(friendly);
      return;
    }

    st.swap._executing = true;
    setSwapControlsDisabled(true);
    updateSwapPrimaryButtonState();
    let _swapAbortedOrFailed = false;
    try {
      if (!st.swap.quoteData) {
        if (typeof fetchLiveSwapQuoteAsync === 'function') {
          await fetchLiveSwapQuoteAsync();
        }
        if (!st.swap.quoteData) {
          _swapAbortedOrFailed = true;
          const errText = st.swap._lastError || t('暂无可用报价，请稍后重试', 'No quote available. Please try again.');
          setSwapError(errText);
          showToast(errText);
          return;
        }
      }
      if (st.swap.quoteData && st.swap.quoteData.quotedAt && (Date.now() - Number(st.swap.quoteData.quotedAt)) > 30000) {
        if (typeof fetchLiveSwapQuoteAsync === 'function') {
          await fetchLiveSwapQuoteAsync();
        }
        _swapAbortedOrFailed = true;
        showToast(t('报价已超过 30 秒并已刷新，请确认新报价后再次点击闪兑', 'Quote expired (>30s) and refreshed; confirm new rate and tap Swap again'));
        return;
      }
      const authImpact = st.swap.quoteData ? computeSwapPriceImpact(st.swap._usdInVal, st.swap._usdOutVal) : null;
      const impactPromptSuffix = authImpact && (authImpact.level === 'high' || authImpact.level === 'critical')
        ? ` (⚠️ ${t('价差', 'Impact')} -${authImpact.pct.toFixed(1)}%)`
        : '';
      const isThirdParty = isCustomThirdPartySwapRecipient(wallet, toToken);
      const sameChainDexPre = isSameChainContractSwap(fromToken, toToken);
      const is1ClickBestPre = Boolean(
        st.swap.quoteData?.routeSource === 'NEAR_INTENTS_1CLICK'
        || (st.swap.quoteData?.bestSource === '1Click Solver' && !st.swap.quoteData?.compositeType)
      );
      if (isThirdParty && (
        (sameChainDexPre && (fromToken.blockchain !== 'near' || (!st.swap.quoteData?.compositeType && !is1ClickBestPre)))
        || doesSwapRouteRequireSelfRecipient(fromToken, toToken, st.swap.quoteData || null)
      )) {
        const msg = t('当前路由不支持发往第三方地址，请改回本人地址后重试', 'Current route cannot send to a third-party address; switch recipient to your own address');
        setSwapError(msg);
        showToast(msg);
        _swapAbortedOrFailed = true;
        return;
      }
      const thirdPartySuffix = isThirdParty ? ` → ${shortenAddr(st.swap.recipientAddress)}` : '';
      const flowPlan = buildSwapTxFlowPlan({
        wallet,
        fromToken,
        toToken,
        amtStr,
        quoteData: st.swap.quoteData || null,
        usdInVal: st.swap._usdInVal,
        usdOutVal: st.swap._usdOutVal,
        isThirdParty,
        recipient: st.swap.recipientAddress || getWalletDefaultRecipientForChain(wallet, toToken.blockchain),
        slippageBps: st.swap.slippageBps
      });
      if (!(await openTxPreviewModalAsync(flowPlan.previewConfig))) {
        _swapAbortedOrFailed = true;
        return;
      }
      const isCriticalImpact = Boolean(authImpact && authImpact.level === 'critical');
      const slippageBpsNum = Number(st.swap.slippageBps || 100);
      const isHighSlippage = Number.isFinite(slippageBpsNum) && slippageBpsNum >= 300;
      if (isCriticalImpact || isHighSlippage || isThirdParty) {
        const riskLines = [];
        if (isCriticalImpact) {
          riskLines.push(t(`• 价格影响过高：-${authImpact.pct.toFixed(1)}%（>= 15%）`, `• Critical price impact: -${authImpact.pct.toFixed(1)}% (>= 15%)`));
        }
        if (isHighSlippage) {
          riskLines.push(t(`• 滑点设置过高：${(slippageBpsNum / 100).toFixed(2)}%（>= 3%）`, `• High slippage tolerance: ${(slippageBpsNum / 100).toFixed(2)}% (>= 3%)`));
        }
        if (isThirdParty) {
          const fullRecipient = st.swap.recipientAddress || getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
          riskLines.push(t(`• 第三方收款地址（非当前钱包）：\n${fullRecipient}`, `• Third-party recipient address:\n${fullRecipient}`));
        }
        const riskConfirmed = await showConfirmDialogAsync(
          `${t('检测到以下高风险兑换参数，请核对后确认：', 'High-risk swap parameters detected. Please review carefully:')}\n\n${riskLines.join('\n')}`,
          {
            danger: isCriticalImpact || isHighSlippage,
            title: t('⚠️ 高风险兑换二次确认', '⚠️ High-Risk Swap Confirmation'),
            confirmText: t('我已知晓风险，继续', 'I Understand, Continue'),
            cancelText: t('取消', 'Cancel')
          }
        );
        if (!riskConfirmed) {
          closeTxFlowModal();
          _swapAbortedOrFailed = true;
          return;
        }
      }
      if (!(await verifySecurityAuthAsync(wallet, `${t('确认兑换', 'Confirm swap')} ${amtStr} ${fromToken.symbol} → ${toToken.symbol}${impactPromptSuffix}${thirdPartySuffix}`))) {
        closeTxFlowModal();
        _swapAbortedOrFailed = true;
        return;
      }
      if (st.swap.quoteData && st.swap.quoteData.quotedAt && (Date.now() - Number(st.swap.quoteData.quotedAt)) > 30000) {
        closeTxFlowModal();
        if (typeof fetchLiveSwapQuoteAsync === 'function') {
          await fetchLiveSwapQuoteAsync();
        }
        _swapAbortedOrFailed = true;
        showToast(t('验证期间报价已过期并已刷新，请确认新报价后再次点击闪兑', 'Quote expired during auth and refreshed; confirm new rate and tap Swap again'));
        return;
      }

      setSwapError('');
      let _activeStepIdx = 0;
      const stepper = createTxStepperController(t('正在执行兑换', 'Executing Swap'), flowPlan.steps);
      const advanceStep = (idx, status, opts) => {
        _activeStepIdx = idx;
        stepper.setStep(idx, status, opts);
      };
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
              advanceStep(0, 'active');
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
          advanceStep(0, 'active');
          const res = await contracts.executeSolanaJupiterSwap({
            wallet,
            quoteResponse: quoteResp,
            wrapAndUnwrapSol: true,
            tokenBalance: avail,
            inputDecimals: fromToken.decimals,
            gasBuffer: isNative ? gasBuf : null
          });
          advanceStep(0, 'done', { txHash: res.txHash, chain: 'sol' });
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

          advanceStep(0, 'active');
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
          advanceStep(0, 'done', { txHash: res.txHash, chain: fromToken.blockchain });
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
        advanceStep(0, 'active');
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
          amt: amtStr,
          avail,
          depositAddress: depRes.depositAddress,
          gasOverride: originGasOverride
        });
        if (!inTx || !inTx.txHash) {
          throw new Error(t('转出失败，请检查余额与网络后重试', 'Transfer failed. Please check balance and network.'));
        }
        advanceStep(0, 'done', { txHash: inTx.txHash, chain: fromToken.blockchain });
        if (flowPlan.steps.length > 1) advanceStep(1, 'active');
        stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
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
        showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
        return;
      }

      if (activeQuote?.compositeType === 'SMART_HUB_ROUTE' && Array.isArray(activeQuote.stages) && activeQuote.stages.length > 0) {
        let stages = activeQuote.stages.slice();
        let stageAmtRaw = amountRaw;
        let smartStep = 0;
        if (stages[0] && stages[0].type === 'ORIGIN_DEX') {
          const origStage = stages.shift();
          advanceStep(smartStep, 'active');
          if (origStage.chain === 'sol') {
            const solAddr = wallet.solAddress;
            const preSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
            const preLamports = preSolRes?.nativeLamports != null ? BigInt(preSolRes.nativeLamports) : null;
            const s0Quote = origStage.quote || await contracts.quoteSolanaJupiterSwap({
              inputMint: fromToken.contractAddress,
              outputMint: 'So11111111111111111111111111111111111111112',
              amountRaw,
              slippageBps: st.swap.slippageBps
            });
            const origTx = await contracts.executeSolanaJupiterSwap({
              wallet,
              quoteResponse: s0Quote,
              wrapAndUnwrapSol: true,
              tokenBalance: avail,
              inputDecimals: fromToken.decimals
            });
            recordWalletActivity(wallet, {
              type: 'swap',
              symbol: fromToken.symbol,
              toSymbol: 'SOL',
              chain: 'sol',
              amount: amt,
              txHash: origTx?.txHash || '',
              title: `${fromToken.symbol} ➔ SOL (Stage 1)`
            });
            if (origTx?.txHash && typeof contracts.waitForSolanaTxConfirmation === 'function') {
              const origConfirmed = await contracts.waitForSolanaTxConfirmation(origTx.txHash, 45000);
              if (!origConfirmed) {
                throw new Error(t(
                  `第一阶段交易尚未确认，已暂停第二阶段以保护既有余额 (Tx: ${origTx.txHash})`,
                  `Stage 1 tx not yet confirmed on-chain; Stage 2 paused to protect existing balance (Tx: ${origTx.txHash})`
                ));
              }
            }
            const postSolRes = await contracts.fetchSolanaNativeAndSplBalances(solAddr, []).catch(() => null);
            if (postSolRes && typeof postSolRes.nativeSol === 'number') {
              wallet.nativeBalances = wallet.nativeBalances || {};
              wallet.nativeBalances.sol = postSolRes.nativeSol;
              if (typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
            }
            const expectedL = BigInt(s0Quote.outAmount || '0');
            const hasPreL = preLamports !== null;
            let deltaL = (hasPreL && postSolRes?.nativeLamports != null)
              ? (BigInt(postSolRes.nativeLamports) > preLamports ? (BigInt(postSolRes.nativeLamports) - preLamports) : 0n)
              : (hasPreL ? 0n : expectedL);
            if (hasPreL && deltaL <= 0n) {
              throw new Error(t(
                `第一阶段兑换后 SOL 余额未增加，已暂停第二阶段以保护既有余额${origTx?.txHash ? ` (Tx: ${origTx.txHash})` : ''}`,
                `SOL balance did not increase after Stage 1 swap; Stage 2 paused to protect existing balance${origTx?.txHash ? ` (Tx: ${origTx.txHash})` : ''}`
              ));
            }
            if (expectedL > 0n && deltaL > expectedL) deltaL = expectedL;
            stageAmtRaw = (hasPreL ? deltaL : (deltaL > 0n ? deltaL : expectedL)).toString();
            advanceStep(smartStep, 'done', { txHash: origTx?.txHash, chain: 'sol' });
            smartStep += 1;
          } else {
            await ensureEthersLoaded();
            const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
            const preEvm = await contracts.fetchEvmNativeAndErc20Balance(origStage.chain, evmAddr).catch(() => null);
            const preWei = preEvm?.nativeRaw != null ? BigInt(preEvm.nativeRaw) : null;
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
            const origTx = await contracts.executeEvmDexSwap({
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
            recordWalletActivity(wallet, {
              type: 'swap',
              symbol: fromToken.symbol,
              toSymbol: origStage.chain.toUpperCase(),
              chain: origStage.chain,
              amount: amt,
              txHash: origTx?.txHash || '',
              title: `${fromToken.symbol} ➔ ${origStage.chain.toUpperCase()} (Stage 1)`
            });
            if (origTx?.txHash && typeof contracts.waitForEvmTxConfirmation === 'function') {
              const origConfirmed = await contracts.waitForEvmTxConfirmation(origStage.chain, origTx.txHash, 45000);
              if (!origConfirmed) {
                throw new Error(t(
                  `第一阶段交易尚未确认，已暂停第二阶段以保护既有余额 (Tx: ${origTx.txHash})`,
                  `Stage 1 tx not yet confirmed on-chain; Stage 2 paused to protect existing balance (Tx: ${origTx.txHash})`
                ));
              }
            }
            const postEvm = await contracts.fetchEvmNativeAndErc20Balance(origStage.chain, evmAddr).catch(() => null);
            if (postEvm && typeof postEvm.nativeFormatted === 'number') {
              wallet.nativeBalances = wallet.nativeBalances || {};
              wallet.nativeBalances[origStage.chain] = postEvm.nativeFormatted;
              if (typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
            }
            const expectedW = BigInt(s0Q.amountOut || '0');
            const hasPreW = preWei !== null;
            let deltaW = (hasPreW && postEvm?.nativeRaw != null)
              ? (BigInt(postEvm.nativeRaw) > preWei ? (BigInt(postEvm.nativeRaw) - preWei) : 0n)
              : (hasPreW ? 0n : expectedW);
            if (hasPreW && deltaW <= 0n) {
              throw new Error(t(
                `第一阶段兑换后 ${origStage.chain.toUpperCase()} 余额未增加，已暂停第二阶段以保护既有余额${origTx?.txHash ? ` (Tx: ${origTx.txHash})` : ''}`,
                `${origStage.chain.toUpperCase()} balance did not increase after Stage 1 swap; Stage 2 paused to protect existing balance${origTx?.txHash ? ` (Tx: ${origTx.txHash})` : ''}`
              ));
            }
            if (expectedW > 0n && deltaW > expectedW) deltaW = expectedW;
            stageAmtRaw = (hasPreW ? deltaW : (deltaW > 0n ? deltaW : expectedW)).toString();
            advanceStep(smartStep, 'done', { txHash: origTx?.txHash, chain: origStage.chain });
            smartStep += 1;
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
          const isPostOriginDex = stages.length < activeQuote.stages.length;
          const bridgeToken = isPostOriginDex
            ? {
                blockchain: fromToken.blockchain,
                symbol: fromToken.blockchain === 'sol' ? 'SOL' : fromToken.blockchain.toUpperCase(),
                contractAddress: '',
                decimals: fromToken.blockchain === 'sol' ? 9 : 18
              }
            : fromToken;
          const reserveNum = typeof contracts.getNativeGasReserve === 'function' ? contracts.getNativeGasReserve(bridgeToken.blockchain) : 0.002;
          const reserveRaw = BigInt(intents.toBaseUnits(String(reserveNum), bridgeToken.decimals));
          const stageBig = BigInt(stageAmtRaw || '0');
          const bridgeAmtRaw = stageBig > reserveRaw ? (stageBig - reserveRaw).toString() : '0';
          const bridgeAmtStr = isPostOriginDex ? intents.fromBaseUnits(bridgeAmtRaw, bridgeToken.decimals) : amtStr;
          const bridgeAvail = isPostOriginDex
            ? Number(intents.fromBaseUnits(stageAmtRaw, bridgeToken.decimals))
            : avail;
          if (isPostOriginDex ? (BigInt(bridgeAmtRaw) <= 0n) : (amt <= 0)) {
            throw new Error(t('源链兑换后余额不足以支付跨链手续费', 'Post-swap balance insufficient for bridge gas'));
          }
          const quoteAmtRaw = isPostOriginDex ? bridgeAmtRaw : stageAmtRaw;
          const liveIn = await intents.quoteIntentSwapOrWithdraw({
            originAsset: first.originAsset || fromToken.assetId,
            destinationAsset: first.destinationAsset,
            amountRaw: quoteAmtRaw,
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
          advanceStep(smartStep, 'active');
          const inTx = await broadcastOriginDepositTx({
            wallet,
            fromToken: bridgeToken,
            amt: bridgeAmtStr,
            avail: bridgeAvail,
            depositAddress: liveIn.depositAddress,
            gasOverride: stages.length < activeQuote.stages.length ? null : originGasOverride
          });
          if (!inTx || !inTx.txHash) {
            throw new Error(t('转出失败，请检查余额与网络后重试', 'Transfer failed. Please check balance and network.'));
          }
          advanceStep(smartStep, 'done', { txHash: inTx.txHash, chain: fromToken.blockchain });
          if (smartStep + 1 < flowPlan.steps.length) advanceStep(smartStep + 1, 'active');
          stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
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
          showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
          return;
        }

        if (first.type === 'NEAR_SWAP') {
          const outLeg = stages.find((s) => s.type === 'BRIDGE_OUT') || null;
          const preOutBal = outLeg
            ? await intents.fetchNearNep141Balances(nearId, { [first.tokenOut]: first.outDecimals || 8 }).catch(() => null)
            : null;
          const preOutRaw = preOutBal?.[first.tokenOut]?.raw != null ? BigInt(preOutBal[first.tokenOut].raw) : null;
          advanceStep(smartStep, 'active');
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
          advanceStep(smartStep, 'done', { txHash: swapRes.txHash, chain: 'near' });
          if (!outLeg) {
            stepper.finish(true, { text: t('兑换成功', 'Swap completed'), doneTitle: t('兑换成功', 'Swap Completed') });
            recordWalletActivity(wallet, {
              type: 'swap',
              symbol: fromToken.symbol,
              toSymbol: toToken.symbol,
              chain: fromToken.blockchain,
              amount: amt,
              txHash: swapRes.txHash,
              title: `${fromToken.symbol} ➔ ${toToken.symbol}`
            });
            showToast(`✅ ${t('兑换成功', 'Swap completed')}: ${shortenAddr(swapRes.txHash)}`);
            refreshAllBalancesAsync(false);
            return;
          }
          recordWalletActivity(wallet, {
            type: 'swap',
            symbol: fromToken.symbol,
            toSymbol: first.outSymbol || toToken.symbol,
            chain: 'near',
            amount: amt,
            txHash: swapRes.txHash,
            title: `${fromToken.symbol} ➔ ${first.outSymbol || toToken.symbol} (Stage 1)`
          });
          const postOutBal = await intents.fetchNearNep141Balances(nearId, { [first.tokenOut]: first.outDecimals || 8 }).catch(() => null);
          const expectedOut = BigInt(swapRes.amountOut || first.expectedOut || '0');
          const hasPreOut = preOutRaw !== null;
          let deltaOut = (hasPreOut && postOutBal?.[first.tokenOut]?.raw != null)
            ? (BigInt(postOutBal[first.tokenOut].raw) > preOutRaw ? (BigInt(postOutBal[first.tokenOut].raw) - preOutRaw) : 0n)
            : (hasPreOut ? 0n : expectedOut);
          if (hasPreOut && deltaOut <= 0n) {
            throw new Error(t(
              `第一阶段兑换后余额未增加，已暂停第二阶段以保护既有余额${swapRes?.txHash ? ` (Tx: ${swapRes.txHash})` : ''}`,
              `Balance did not increase after Stage 1 swap; Stage 2 paused to protect existing balance${swapRes?.txHash ? ` (Tx: ${swapRes.txHash})` : ''}`
            ));
          }
          if (expectedOut > 0n && deltaOut > expectedOut) deltaOut = expectedOut;
          const bridgeInRaw = (hasPreOut ? deltaOut : (deltaOut > 0n ? deltaOut : BigInt(first.expectedOut || '0'))).toString();
          const destFollow = await buildDestDexFollowUp(outLeg.expectedOut);
          let liveOut;
          let sendBridge = null;
          if (smartStep + 1 < flowPlan.steps.length) advanceStep(smartStep + 1, 'active');
          try {
            liveOut = await intents.quoteIntentSwapOrWithdraw({
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
            const targetContract = outLeg.hubContract === 'wrap.near' ? 'wrap.near' : outLeg.hubContract;
            const hubBalMap = await intents.fetchNearNep141Balances(nearId, { [targetContract]: outLeg.hubContract === 'wrap.near' ? 24 : bridgeDec }).catch(() => null);
            const realHubBal = (hubBalMap && hubBalMap[targetContract] && hubBalMap[targetContract].formatted !== undefined)
              ? Number(hubBalMap[targetContract].formatted)
              : (wallet.nearNep141Balances && wallet.nearNep141Balances[targetContract]
                  ? Number(wallet.nearNep141Balances[targetContract].formatted)
                  : null);
            if (outLeg.hubContract === 'wrap.near') {
              sendBridge = await contracts.executeNearNep141Transfer({
                wallet,
                tokenContract: 'wrap.near',
                receiverId: liveOut.depositAddress,
                amount: bridgeHuman,
                decimals: 24,
                tokenSymbol: 'wNEAR',
                tokenBalance: realHubBal
              });
            } else {
              sendBridge = await contracts.executeNearNep141Transfer({
                wallet,
                tokenContract: outLeg.hubContract,
                receiverId: liveOut.depositAddress,
                amount: bridgeHuman,
                decimals: bridgeDec,
                tokenSymbol: bridgeSym,
                tokenBalance: realHubBal
              });
            }
          } catch (s2Err) {
            st.swap.activeOrder = {
              walletId: wallet.id,
              depositAddress: swapRes.txHash || `near_hub_bridge_${Date.now()}`,
              status: 'SUCCESS',
              fromSymbol: fromToken.symbol,
              toSymbol: toToken.symbol,
              originTxHash: swapRes.txHash || '',
              autoBroadcasted: true,
              createdAt: Date.now(),
              followUpFailed: true,
              followUpError: toUserFriendlyError(s2Err, '第一阶段已成交，第二步跨链失败，请点击继续重试', 'Stage 1 swapped; tap Resume for Stage 2 bridge'),
              followUpBridgeOut: {
                originAsset: outLeg.originAsset,
                destinationAsset: outLeg.destinationAsset,
                hubContract: outLeg.hubContract,
                hubDecimals: outLeg.hubDecimals || first.outDecimals || 8,
                hubSymbol: outLeg.hubSymbol || first.outSymbol || 'PRL',
                recipient: resolveBridgeOutRecipient(outLeg),
                expectedInRaw: bridgeInRaw,
                slippageBps: st.swap.slippageBps,
                toSymbol: toToken.symbol,
                ...destFollow
              }
            };
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
            renderSwapOrderCard();
            throw s2Err;
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
          if (smartStep + 1 < flowPlan.steps.length) advanceStep(smartStep + 1, 'done', { txHash: sendBridge.txHash, chain: 'near' });
          stepper.finish(true, { text: t('已从源链转出，目标链预计 1–3 分钟到账，可在下方查看进度', 'Sent from origin chain. Arriving in ~1–3 min — track progress below.'), inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
          showToast(`✅ ${t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min')}`);
          return;
        }
      }

