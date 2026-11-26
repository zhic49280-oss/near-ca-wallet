  function renderSwapView() {
    const st = getState();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const amtInputEl = $('swap-amount-in');
    const fromPickerBtn = $('swap-from-token-btn');
    const toPickerBtn = $('swap-to-token-btn');
    const isExec = Boolean(st.swap._executing);
    if (amtInputEl) amtInputEl.disabled = isExec;
    if (fromPickerBtn) fromPickerBtn.disabled = isExec;
    if (toPickerBtn) toPickerBtn.disabled = isExec;

    const errBanner = $('swap-error-banner');
    if (errBanner) {
      errBanner.classList.add('hidden');
      errBanner.textContent = '';
    }

    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (fromToken) st.swap.fromAssetId = fromToken.assetId;
    if (toToken) st.swap.toAssetId = toToken.assetId;

    const renderBtn = (elId, tok) => {
      const btn = $(elId);
      if (!btn || !tok) return;
      btn.innerHTML = `${tokens.renderTokenIconWithBadge(tok, 24, true)}<span>${escapeHtml(tok.symbol)}</span><span style="opacity:0.55;font-size:10px;">▾</span>`;
    };
    renderBtn('swap-from-token-btn', fromToken);
    renderBtn('swap-to-token-btn', toToken);

    const fromBal = getSwapTokenAvailableBalance(fromToken);
    const toBal = getSwapTokenAvailableBalance(toToken);
    if ($('swap-from-balance')) $('swap-from-balance').textContent = `${formatBal(fromBal, 6)} ${fromToken ? fromToken.symbol : ''}`;
    if ($('swap-to-balance')) $('swap-to-balance').textContent = `${formatBal(toBal, 6)} ${toToken ? toToken.symbol : ''}`;
    const formatNetAndPrice = (tok) => {
      if (!tok) return '--';
      const net = tok.networkName || tok.blockchain || '--';
      const px = getTokenUnitPrice(tok);
      const pxStr = formatTokenPrice(px);
      return pxStr !== '--' ? `${net} · ${pxStr}` : net;
    };
    if ($('swap-from-net-label')) $('swap-from-net-label').textContent = formatNetAndPrice(fromToken);
    if ($('swap-to-net-label')) $('swap-to-net-label').textContent = formatNetAndPrice(toToken);
    renderSwapRateDisplay(fromToken, toToken);

    const sameChainDex = isSameChainContractSwap(fromToken, toToken);
    const routeBadge = $('swap-auto-route-badge');
    if (routeBadge && fromToken && toToken) {
      const fromMeta = tokens.getChainMeta(fromToken.blockchain);
      const toMeta = tokens.getChainMeta(toToken.blockchain);
      if (sameChainDex) {
        if (fromToken.blockchain === 'near') {
          routeBadge.textContent = t('NEAR 最优路由', 'NEAR Best Route');
        } else if (fromToken.blockchain === 'sol') {
          routeBadge.textContent = t('Solana 最优路由', 'Solana Best Route');
        } else if (fromToken.blockchain === 'arc') {
          routeBadge.textContent = t('Arc 最优路由', 'Arc Best Route');
        } else {
          routeBadge.textContent = `${fromMeta.shortName} ${t('多池聚合', 'Multi-Pool DEX')}`;
        }
      } else if (toToken.category === 'xstock' || fromToken.category === 'xstock') {
        routeBadge.textContent = `${fromMeta.shortName} ➔ ${toMeta.shortName} · ${t('xStocks 跨链聚合', 'xStocks Cross-Chain')}`;
      } else if (isPrlSwapToken(fromToken) !== isPrlSwapToken(toToken)) {
        routeBadge.textContent = t('多池跨链聚合', 'Multi-Pool Cross-Chain');
      } else {
        routeBadge.textContent = `${fromMeta.shortName} ➔ ${toMeta.shortName} · ${t('跨链最优聚合', 'Best Cross-Chain')}`;
      }
      routeBadge.title = routeBadge.textContent || '';
    }

    syncSwapRecipientInputState(wallet, fromToken, toToken, st.swap.quoteData || null);

    const amtInp = $('swap-amount-in');
    if (amtInp && amtInp.value !== String(st.swap.amountIn || '')) {
      amtInp.value = st.swap.amountIn || '';
    }
    if ($('swap-amount-out')) {
      $('swap-amount-out').value = st.swap.amountOut || '';
    }
    renderSwapGasReserveRow(wallet, fromToken, toToken);
    updateSwapUsdEstimates();
    updateSwapPrimaryButtonState();

    if (typeof document !== 'undefined') {
      document.querySelectorAll('#swap-quote-meta [data-bps]').forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-bps')) === Number(st.swap.slippageBps));
      });
    }

    renderSwapOrderCard();
    if (typeof renderSwapHistoryCard === 'function') renderSwapHistoryCard();
    if (isSwapTokenNative(fromToken)) {
      prefetchSwapLiveGasAsync(false).catch(() => {});
    }
    if (st.swap.panelMode === 'limit') {
      renderLimitOrderView();
    }
  }

  function setSwapSlippage(bps) {
    const st = getState();
    st.swap.slippageBps = Number(bps) || 100;
    renderSwapView();
    if (st.swap.amountIn) scheduleSwapQuote();
  }

  function handleSwapRecipientInput() {
    const st = getState();
    st.swap.recipientAddress = ($('swap-recipient-input')?.value || '').trim();
    if (Number(st.swap.amountIn) > 0) {
      scheduleSwapQuote();
    }
  }

  function renderSwapRouteDisplay(routeText = '--', quoting = false, errorText = '') {
    const routeEl = $('swap-quote-route');
    if (!routeEl) return;
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountSwapRouteInfoPanel === 'function') {
      fw.mountSwapRouteInfoPanel(routeEl, {
        routeText,
        quoting,
        errorText,
        isEn: getState().lang === 'en'
      });
      return;
    }
    routeEl.textContent = errorText || (quoting ? t('多池比价中...', 'Comparing pools...') : (routeText || '--'));
  }

  function resetSwapQuoteDisplay() {
    const st = getState();
    st.swap.amountOut = '';
    st.swap.quoteData = null;
    st.swap._quoteRateOutPerIn = null;
    if ($('swap-amount-out')) $('swap-amount-out').value = '';
    renderSwapRouteDisplay('--', false, '');
    if ($('swap-quote-fee')) $('swap-quote-fee').textContent = '--';
    if ($('swap-usd-out')) $('swap-usd-out').textContent = '--';
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    renderSwapRateDisplay(fromToken, toToken, null);
    if (wallet && fromToken && toToken) {
      syncSwapRecipientInputState(wallet, fromToken, toToken, null);
      renderSwapGasReserveRow(wallet, fromToken, toToken);
    }
    updateSwapUsdEstimates();
  }

  function handleSwapAmountInput() {
    const st = getState();
    st.swap.amountIn = ($('swap-amount-in')?.value || '').trim();
    st.swap._lastError = '';
    st.swap._quoting = false;
    resetSwapQuoteDisplay();
    updateSwapPrimaryButtonState();
    scheduleSwapQuote();
  }

  async function setSwapMaxAmount() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    const bal = getSwapTokenAvailableBalance(fromToken);
    if (!fromToken || bal === null || bal <= 0) return;

    const isNative = isSwapTokenNative(fromToken);
    if (!isNative) {
      const rawUnits = getWalletTokenRawBaseUnits(wallet, fromToken.blockchain, fromToken.contractAddress);
      st.swap.amountIn = formatMaxDecimalString(bal, fromToken.decimals || 6, rawUnits);
      if ($('swap-amount-in')) $('swap-amount-in').value = st.swap.amountIn;
      handleSwapAmountInput();
      return;
    }

    const tokenIdAtStart = fromToken.assetId;
    const liveGas = await prefetchSwapLiveGasAsync(false).catch(() => null);
    const curFrom = resolveSwapToken(st.swap.fromAssetId, 0);
    if (!curFrom || curFrom.assetId !== tokenIdAtStart) return;

    const plan = resolveEffectiveSwapGasPlan(wallet, curFrom, toToken, st.swap.gasReserveMode || 'auto', st.swap.quoteData || null);
    let effectiveBal = bal;
    let rawUnits = null;
    const scaledGas = scaleSwapLiveGasUnits(curFrom, liveGas && liveGas.liveBalanceBaseUnits, plan.exactFeeBaseUnits);
    if (liveGas && liveGas.liveBalanceBaseUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
      const scaledLiveRaw = scaledGas.balanceUnits;
      const liveNum = Number(contracts.fromBaseUnits(scaledLiveRaw, curFrom.decimals || 18));
      if (Number.isFinite(liveNum) && liveNum > 0 && liveNum <= bal + 1e-12) {
        effectiveBal = liveNum;
        rawUnits = scaledLiveRaw;
      }
    }
    const effFeeBaseUnits = scaledGas.feeUnits;
    const maxInfo = computeExactMaxSpendable({
      balance: effectiveBal,
      rawBaseUnits: rawUnits,
      decimals: curFrom.decimals || 6,
      isNative: true,
      gasReserve: plan.gasBuffer || 0,
      exactFeeBaseUnits: effFeeBaseUnits
    });
    st.swap.amountIn = maxInfo.maxAmountStr || '0';
    if ($('swap-amount-in')) $('swap-amount-in').value = st.swap.amountIn;
    handleSwapAmountInput();
  }

  function clearSwapAmountAndQuote() {
    const st = getState();
    resetFormFields(['swap-amount-in'], st.swap, { amountIn: '', _lastError: '' });
    resetSwapQuoteDisplay();
    updateSwapPrimaryButtonState();
  }

  function flipSwapTokens() {
    const st = getState();
    const tmp = st.swap.fromAssetId;
    st.swap.fromAssetId = st.swap.toAssetId;
    st.swap.toAssetId = tmp;
    st.swap.recipientAddress = '';
    st.swap.rateInverted = false;
    st.swap._quoteRateOutPerIn = null;
    st.swap._quoting = false;
    st.swap._lastError = '';
    st.swap._liveGas = null;
    resetFormFields(['swap-amount-in'], st.swap, { amountIn: '' });
    if (typeof st.saveSwapPair === 'function') st.saveSwapPair();
    setSwapError('');
    resetSwapQuoteDisplay();
    renderSwapView();
  }

  const _swapQuoteCache = new Map();

  function scheduleSwapQuote() {
    if (_swapQuoteTimer) clearTimeout(_swapQuoteTimer);
    const st = getState();
    if (st && st.swap && st.swap._quoteAbortCtrl) {
      try { st.swap._quoteAbortCtrl.abort(); } catch (_) {}
      st.swap._quoteAbortCtrl = null;
    }
    st.swap._quoting = false;
    const amtNum = Number(st.swap.amountIn);
    st.swap._quotePending = Number.isFinite(amtNum) && amtNum > 0;
    st.swap._lastError = '';
    resetSwapQuoteDisplay();
    updateSwapPrimaryButtonState();
    _swapQuoteTimer = setTimeout(() => { fetchLiveSwapQuoteAsync(); }, 350);
  }

  function setSwapError(msg) {
    const st = getState();
    const el = $('swap-error-banner');
    const routeEl = $('swap-quote-route');
    const text = msg ? toUserFriendlyError(msg, '暂无可用报价，请稍后重试', 'No quote available. Please try again.') : '';
    if (el) {
      el.textContent = text;
      el.classList.toggle('hidden', !text);
    }
    st.swap._lastError = text;
    if (text && routeEl && (!routeEl.textContent || routeEl.textContent === '--' || routeEl.textContent.includes('比价') || routeEl.textContent.includes('Comparing'))) {
      renderSwapRouteDisplay('--', false, text);
    }
    updateSwapPrimaryButtonState();
  }

  async function fetchLiveSwapQuoteAsync() {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    st.swap._quotePending = false;

    const amtRaw = Number(st.swap.amountIn);
    if (!Number.isFinite(amtRaw) || amtRaw <= 0) {
      st.swap._quoting = false;
      setSwapError('');
      return;
    }

    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (!fromToken || !toToken || fromToken.assetId === toToken.assetId) return;

    updateSwapUsdEstimates();

    if (!isSwapOriginSupported(fromToken)) {
      const unsupMsg = t(`暂不支持从 ${String(fromToken.blockchain || '').toUpperCase()} 发起闪兑`, `Swaps from ${String(fromToken.blockchain || '').toUpperCase()} are not supported yet`);
      st.swap._quoting = false;
      resetSwapQuoteDisplay();
      setSwapError(unsupMsg);
      return;
    }

    const amt = amtRaw;
    const amtInputStr = String(st.swap.amountIn);

    const sameChainDex = isSameChainContractSwap(fromToken, toToken);
    const amountRaw = intents.toBaseUnits(amtInputStr, fromToken.decimals);
    if (amountRaw === '0') {
      st.swap._quoting = false;
      setSwapError(t('输入金额过小', 'Amount too small'));
      return;
    }

    st.swap._quoteReqSeq = (st.swap._quoteReqSeq || 0) + 1;
    const reqSeq = st.swap._quoteReqSeq;
    const reqSnapshot = {
      seq: reqSeq,
      amountIn: st.swap.amountIn,
      fromId: fromToken.assetId,
      toId: toToken.assetId,
      slippageBps: st.swap.slippageBps || 100,
      recipientAddress: st.swap.recipientAddress || '',
      gasReserveMode: st.swap.gasReserveMode || 'auto'
    };
    const isStaleReq = () => (
      st.swap._quoteReqSeq !== reqSnapshot.seq ||
      st.swap.amountIn !== reqSnapshot.amountIn ||
      st.swap.fromAssetId !== reqSnapshot.fromId ||
      st.swap.toAssetId !== reqSnapshot.toId ||
      (st.swap.slippageBps || 100) !== reqSnapshot.slippageBps ||
      (st.swap.recipientAddress || '') !== reqSnapshot.recipientAddress ||
      (st.swap.gasReserveMode || 'auto') !== reqSnapshot.gasReserveMode
    );

    const cacheKey = `${wallet.id || ''}|${fromToken.assetId}|${toToken.assetId}|${amountRaw}|${st.swap.slippageBps || 100}|${st.swap.recipientAddress || ''}|${st.swap.gasReserveMode || 'auto'}`;
    const cached = _swapQuoteCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts < 15000)) {
      st.swap._quoting = false;
      st.swap._lastError = '';
      setSwapError('');
      st.swap.quoteData = cached.quoteData ? { ...cached.quoteData, quotedAt: cached.ts } : null;
      st.swap.quoteSource = cached.quoteSource;
      const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', cached.quoteData);
      const { netOutNum, ratio } = computeNetSwapOutput(cached.quoteData, toToken, gInfo, cached.grossOutNum);
      const netOutText = formatBal(netOutNum, 6);
      const unitIn = getTokenUnitPrice(fromToken);
      const outPrice = getTokenUnitPrice(toToken);
      const numUsdIn = cached.usdInRaw && Number(cached.usdInRaw) > 0
        ? Number(cached.usdInRaw)
        : (unitIn !== null ? amt * unitIn : null);
      const numUsdOut = cached.usdOutRaw && Number(cached.usdOutRaw) > 0
        ? Number(cached.usdOutRaw) * ratio
        : (outPrice !== null && Number.isFinite(netOutNum) ? netOutNum * outPrice : null);
      st.swap._usdInVal = numUsdIn;
      st.swap._usdOutVal = numUsdOut;
      const usdInText = numUsdIn !== null ? formatUsd(numUsdIn) : '--';
      const netUsdOut = numUsdOut !== null ? formatUsd(numUsdOut) : (cached.usdOut || '--');
      st.swap.amountOut = netOutText;
      st.swap._quoteRateOutPerIn = Number.isFinite(cached.rateOutPerIn) && cached.rateOutPerIn > 0
        ? cached.rateOutPerIn
        : (amt > 0 && cached.grossOutNum > 0 ? cached.grossOutNum / amt : null);
      if ($('swap-amount-out')) $('swap-amount-out').value = netOutText;
      renderSwapRouteDisplay(cached.quoteSource, false, '');
      if ($('swap-auto-route-badge')) {
        $('swap-auto-route-badge').textContent = cached.quoteSource;
        $('swap-auto-route-badge').title = cached.quoteSource;
      }
      if ($('swap-quote-fee')) {
        const feeBps = Number(cached.quoteData?.serviceFeeBps ?? cached.feeBps ?? 0);
        $('swap-quote-fee').textContent = feeBps > 0 ? `${(feeBps / 100).toString()}%` : '0%';
      }
      renderSwapRateDisplay(fromToken, toToken, st.swap._quoteRateOutPerIn);
      if ($('swap-usd-in')) $('swap-usd-in').textContent = usdInText;
      if ($('swap-usd-out')) $('swap-usd-out').textContent = netUsdOut;
      syncSwapRecipientInputState(wallet, fromToken, toToken, cached.quoteData);
      renderSwapGasReserveRow(wallet, fromToken, toToken);
      updateSwapPrimaryButtonState();
      return;
    }

    if (st.swap._quoteAbortCtrl) {
      try { st.swap._quoteAbortCtrl.abort(); } catch (_) {}
    }
    const abortCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    st.swap._quoteAbortCtrl = abortCtrl;
    const reqSignal = abortCtrl ? abortCtrl.signal : null;
    const isCancelledOrStale = () => Boolean((reqSignal && reqSignal.aborted) || isStaleReq());

    const applyAndCacheQuote = (quoteData, quoteSource, outHumanNum, usdInRaw, usdOutRaw) => {
      st.swap._quoting = false;
      st.swap._lastError = '';
      setSwapError('');
      const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', quoteData);
      const { netOutNum, ratio } = computeNetSwapOutput(quoteData, toToken, gInfo, outHumanNum);
      const amtOutText = formatBal(netOutNum, 6);
      const rateOutPerIn = (amt > 0 && outHumanNum > 0) ? (outHumanNum / amt) : null;
      const rateText = rateOutPerIn ? `1 ${fromToken.symbol} ≈ ${formatBal(rateOutPerIn, 5)} ${toToken.symbol}` : '';
      const inPrice = getTokenUnitPrice(fromToken);
      const outPrice = getTokenUnitPrice(toToken);
      const numUsdIn = usdInRaw && Number(usdInRaw) > 0
        ? Number(usdInRaw)
        : (inPrice !== null ? amt * inPrice : null);
      const numUsdOut = usdOutRaw && Number(usdOutRaw) > 0
        ? Number(usdOutRaw) * ratio
        : (outPrice !== null && Number.isFinite(netOutNum) ? netOutNum * outPrice : null);
      st.swap._usdInVal = numUsdIn;
      st.swap._usdOutVal = numUsdOut;
      const usdIn = numUsdIn !== null ? formatUsd(numUsdIn) : '--';
      const usdOut = numUsdOut !== null ? formatUsd(numUsdOut) : '--';
      const feeBps = Number(quoteData?.serviceFeeBps ?? 0);
      st.swap.quoteData = quoteData ? { ...quoteData, quotedAt: Date.now() } : quoteData;
      st.swap.quoteSource = quoteSource;
      st.swap.amountOut = amtOutText;
      st.swap._quoteRateOutPerIn = rateOutPerIn;
      if ($('swap-amount-out')) $('swap-amount-out').value = amtOutText;
      renderSwapRouteDisplay(quoteSource, false, '');
      if ($('swap-auto-route-badge')) {
        $('swap-auto-route-badge').textContent = quoteSource;
        $('swap-auto-route-badge').title = quoteSource;
      }
      if ($('swap-quote-fee')) $('swap-quote-fee').textContent = feeBps > 0 ? `${(feeBps / 100).toString()}%` : '0%';
      renderSwapRateDisplay(fromToken, toToken, rateOutPerIn);
      if ($('swap-usd-in')) $('swap-usd-in').textContent = usdIn;
      if ($('swap-usd-out')) $('swap-usd-out').textContent = usdOut;
      syncSwapRecipientInputState(wallet, fromToken, toToken, quoteData);
      renderSwapGasReserveRow(wallet, fromToken, toToken);
      updateSwapPrimaryButtonState();
      if (_swapQuoteCache.size > 40) _swapQuoteCache.clear();
      _swapQuoteCache.set(cacheKey, { ts: Date.now(), quoteData, quoteSource, feeBps, grossOutNum: outHumanNum, rateOutPerIn, amountOut: amtOutText, rateText, usdInRaw: usdInRaw || null, usdOutRaw, usdOut });
    };

    st.swap._quoting = true;
    st.swap._lastError = '';
    renderSwapRouteDisplay('--', true, '');
    updateSwapPrimaryButtonState();

    try {

      if (sameChainDex && fromToken.blockchain !== 'near') {
        if (fromToken.blockchain === 'sol') {
          const jQuote = await contracts.quoteSolanaJupiterSwap({
            inputMint: fromToken.contractAddress,
            outputMint: toToken.contractAddress,
            amountRaw,
            slippageBps: st.swap.slippageBps,
            platformFeeBps: 0,
            signal: reqSignal
          });
          if (isCancelledOrStale()) return;
          const outHuman = contracts.fromBaseUnits(jQuote.outAmount, toToken.decimals);
          const routeText = jQuote.routeLabel || jQuote.bestSource || 'Solana Jupiter V1';
          applyAndCacheQuote({ serviceFeeBps: 0, ...jQuote }, routeText, Number(outHuman), null, null);
          return;
        }

        const evmQuote = await contracts.quoteEvmDexSwap({
          chainKey: fromToken.blockchain,
          srcToken: fromToken.contractAddress,
          destToken: toToken.contractAddress,
          amountRaw,
          srcDecimals: fromToken.decimals,
          destDecimals: toToken.decimals,
          slippageBps: st.swap.slippageBps,
          feeBps: 0,
          fromAddress: wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '',
          signal: reqSignal
        });
        if (isCancelledOrStale()) return;
        if (!evmQuote.ok) {
          st.swap._quoting = false;
          resetSwapQuoteDisplay();
          setSwapError(toUserFriendlyError(evmQuote.error, '暂无可用报价，请稍后重试', 'No quote available. Please try again.'));
          return;
        }
        const routeText = evmQuote.routeLabel || evmQuote.label;
        applyAndCacheQuote({ serviceFeeBps: 0, ...evmQuote }, routeText, Number(evmQuote.amountOutFormatted), evmQuote.amountInUsd, evmQuote.amountOutUsd);
        return;
      }

      // Super-Aggregator: NEAR multi-pool (Ref V2 + Rhea CLMM + 1Click), PRL composite, Direct 1Click & 2-Stage Cross-Chain + DEX Relay
      const nearId = wallet.nearNamedAccount || wallet.nearAddress;
      const isThirdParty = isCustomThirdPartySwapRecipient(wallet, toToken);
      const defaultSelf = getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
      const recipient = isThirdParty
        ? st.swap.recipientAddress
        : (doesSwapRouteRequireSelfRecipient(fromToken, toToken, null)
            ? (defaultSelf || nearId)
            : (st.swap.recipientAddress || defaultSelf || nearId));
      const refundTo = getWalletDefaultRecipientForChain(wallet, fromToken.blockchain) || nearId;

      const q = await intents.quoteCrossChainWithDexRelay({
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
        requireThirdPartyRecipient: isThirdParty,
        signal: reqSignal
      });
      if (isCancelledOrStale()) return;
      if (!q || !q.ok) {
        st.swap._quoting = false;
        resetSwapQuoteDisplay();
        setSwapError(toUserFriendlyError(q && q.error, '暂无可用报价，请稍后重试', 'No quote available. Please try again.'));
        return;
      }
      const outHuman = q.amountOutFormatted || intents.fromBaseUnits(q.amountOut || '0', toToken.decimals);
      const routeText = q.routeLabel || (q.compositeType === 'PRL_TO_NEAR_DCL'
        ? (q.bridgeQuote ? '1Click (Pearl➔NEAR) + Rhea DCL' : 'Ref + Rhea')
        : (q.compositeType === 'PRL_TO_EXTERNAL' || q.compositeType === 'EXTERNAL_TO_PRL'
            ? 'Ref + 1Click'
            : (q.compositeType === 'PRL_TO_NEAR_REF' || q.compositeType === 'NEAR_TO_PRL_REF'
                ? (q.bridgeQuote ? '1Click (Pearl➔NEAR) + Ref Finance' : 'Ref Finance')
                : '1Click Cross-Chain')));
      applyAndCacheQuote(q, routeText, Number(outHuman), q.amountInUsd, q.amountOutUsd);
    } catch (e) {
      if (isCancelledOrStale() || (e && (e.name === 'AbortError' || /abort|取消/i.test(String(e.message || ''))))) return;
      st.swap._quoting = false;
      resetSwapQuoteDisplay();
      setSwapError(toUserFriendlyError(e, '获取报价失败，请稍后重试', 'Failed to fetch quote. Please try again.'));
    } finally {
      if (st.swap._quoteAbortCtrl === abortCtrl) st.swap._quoteAbortCtrl = null;
    }
  }

