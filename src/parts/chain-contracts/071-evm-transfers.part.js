  function normalizeArcUsdcParams({ chainKey, chainId, srcToken, destToken, amountRaw, srcDecimals = 18, destDecimals = 18 } = {}) {
    const key = String(chainKey || '').toLowerCase();
    const isArcMainnet = key === 'arc' || Number(chainId) === 5042;
    const srcLower = String(srcToken || '').trim().toLowerCase();
    const destLower = String(destToken || '').trim().toLowerCase();
    const arcSrcNative = isArcMainnet && (!srcToken || srcLower === NATIVE_EVM_SENTINEL || srcLower === ARC_USDC_PRECOMPILE);
    const arcDestNative = isArcMainnet && (destLower === NATIVE_EVM_SENTINEL || destLower === ARC_USDC_PRECOMPILE);
    const effSrc = arcSrcNative ? ARC_USDC_PRECOMPILE : String(srcToken || NATIVE_EVM_SENTINEL).trim();
    const effDest = arcDestNative ? ARC_USDC_PRECOMPILE : String(destToken || '').trim();
    const effSrcDec = arcSrcNative ? 6 : Number(srcDecimals);
    const effDestDec = arcDestNative ? 6 : Number(destDecimals);
    const rawStr = String(amountRaw === undefined || amountRaw === null ? '' : amountRaw).trim();
    const effAmtStr = (arcSrcNative && Number(srcDecimals) === 18 && /^\d+$/.test(rawStr))
      ? (BigInt(rawStr) / 1000000000000n).toString()
      : rawStr;
    const scaleArcOut = (rawOutStr) => {
      const b = BigInt(rawOutStr);
      if (arcDestNative && Number(destDecimals) === 18) return b * 1000000000000n;
      return b;
    };
    return { isArcMainnet, arcSrcNative, arcDestNative, effSrc, effDest, effSrcDec, effDestDec, effAmtStr, scaleArcOut };
  }

  async function quoteArcNetworkDexSwap(params = {}) {
    return quoteEvmDexSwap({ ...params, chainKey: 'arc' });
  }

  async function quoteEvmDexSwap({
    chainKey,
    srcToken,
    destToken,
    amountRaw,
    srcDecimals = 18,
    destDecimals = 18,
    slippageBps = 100,
    feeBps = 0,
    feeReceiver = DEFAULT_EVM_FEE_RECEIVER,
    fromAddress = '',
    signal = null
  } = {}) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));
    if (!srcToken || !destToken) throw new Error(t('缺少代币地址', 'Missing srcToken or destToken'));

    const amtStr = String(amountRaw === undefined || amountRaw === null ? '' : amountRaw).trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'amountRaw must be positive'));
    }

    const {
      isArcMainnet,
      effSrc,
      effDest,
      effSrcDec,
      effDestDec,
      effAmtStr,
      scaleArcOut
    } = normalizeArcUsdcParams({
      chainKey: key,
      chainId: cfg.chainId,
      srcToken,
      destToken,
      amountRaw: amtStr,
      srcDecimals,
      destDecimals
    });
    if (!/^\d+$/.test(effAmtStr) || BigInt(effAmtStr) <= 0n) {
      return {
        ok: false,
        routeSource: null,
        label: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        routeData: null,
        comparedPools: 0,
        error: t('兑换数量过小', 'Amount too small')
      };
    }

    const bps = feeBps !== undefined && feeBps !== null && Number.isFinite(Number(feeBps)) ? Math.max(0, Math.round(Number(feeBps))) : 0;
    const validFromAddr = /^0x[0-9a-fA-F]{40}$/.test(String(fromAddress || '')) ? String(fromAddress).trim() : '';
    const slipNum = Number(slippageBps) || 100;
    const evmCacheKey = `evm:${key}:${effSrc.toLowerCase()}:${effDest.toLowerCase()}:${effAmtStr}:${slipNum}:${bps}:${validFromAddr.toLowerCase()}`;

    return withQuoteCacheAndDedup(evmCacheKey, 10_000, async () => {
      const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
      const isAggCoolingDown = (prov) => {
        const entry = _aggCooldownUntil[prov];
        if (!entry) return false;
        if (typeof entry === 'number') return entry > Date.now();
        return entry.fetchRef === curFetch && entry.until > Date.now();
      };
      const markAggCooldown = (prov, ms = 120_000) => {
        _aggCooldownUntil[prov] = { until: Date.now() + ms, fetchRef: curFetch };
      };

      const feeQueryKyber = bps > 0 && feeReceiver
        ? `&feeAmount=${bps}&isInBps=true&chargeFeeBy=currency_in&feeReceiver=${encodeURIComponent(feeReceiver)}`
        : '';
      const kyberUrl = cfg.kyber && !isAggCoolingDown(`kyber:${key}`)
        ? `https://aggregator-api.kyberswap.com/${cfg.kyber}/api/v1/routes?tokenIn=${encodeURIComponent(effSrc)}&tokenOut=${encodeURIComponent(effDest)}&amountIn=${encodeURIComponent(effAmtStr)}${feeQueryKyber}`
        : null;

      const feeQueryPara = bps > 0 && feeReceiver
        ? `&partner=pearlwallet&partnerAddress=${encodeURIComponent(feeReceiver)}&partnerFeeBps=${bps}`
        : '';
      const skipPara = cfg.chainId === 999 || cfg.chainId === 4663 || cfg.chainId === 5042 || isAggCoolingDown(`paraswap:${key}`);
      const paraUrl = !skipPara
        ? `https://api.paraswap.io/prices?srcToken=${encodeURIComponent(effSrc)}&destToken=${encodeURIComponent(effDest)}&amount=${encodeURIComponent(effAmtStr)}&srcDecimals=${effSrcDec}&destDecimals=${effDestDec}&network=${cfg.chainId}&side=SELL${feeQueryPara}`
        : null;

      const ooAmountHuman = fromBaseUnits(effAmtStr, effSrcDec);
      const ooSlippagePct = (slipNum / 100).toFixed(2);
      const ooUrl = cfg.openOcean && !isAggCoolingDown('openocean')
        ? `${OPENOCEAN_API_URL}/${cfg.openOcean}/quote?inTokenAddress=${encodeURIComponent(effSrc)}&outTokenAddress=${encodeURIComponent(effDest)}&amount=${encodeURIComponent(ooAmountHuman)}&slippage=${ooSlippagePct}`
        : null;

      const lifiSlip = (slipNum / 10000).toFixed(4);
      const lifiUrl = isArcMainnet && validFromAddr && !isAggCoolingDown(`lifi:${key}`)
        ? `${LIFI_API_URL}/quote?fromChain=${cfg.chainId}&toChain=${cfg.chainId}&fromToken=${encodeURIComponent(effSrc)}&toToken=${encodeURIComponent(effDest)}&fromAmount=${encodeURIComponent(effAmtStr)}&fromAddress=${encodeURIComponent(validFromAddr)}&slippage=${lifiSlip}`
        : null;

      const localCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const mergedSig = (localCtrl && signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function')
        ? AbortSignal.any([signal, localCtrl.signal])
        : (localCtrl ? localCtrl.signal : signal);
      let onExtAbort = null;
      if (localCtrl && signal && (!mergedSig || mergedSig === localCtrl.signal)) {
        if (signal.aborted) localCtrl.abort();
        else {
          onExtAbort = () => localCtrl.abort();
          signal.addEventListener('abort', onExtAbort, { once: true });
        }
      }

      const fetchAgg = (url, prov, timeout = 4500) => {
        if (!url) return Promise.resolve(null);
        const fetchOpts = { signal: mergedSig };
        if (url.includes('aggregator-api.kyberswap.com')) {
          fetchOpts.headers = { 'x-client-id': 'nexus-wallet' };
        }
        return fetchJsonWithTimeout(url, fetchOpts, timeout).catch((err) => {
          if (!(localCtrl && localCtrl.signal.aborted) && err && (err.status === 403 || err.status === 429 || err.name === 'AbortError' || err.status >= 500)) {
            markAggCooldown(prov, err.status === 403 ? 10 * 60_000 : 120_000);
          }
          return null;
        });
      };

      try {
        const [kRes, pRes, lRes] = await raceWithGraceWindow(
          [
            fetchAgg(kyberUrl, `kyber:${key}`, 4500),
            fetchAgg(paraUrl, `paraswap:${key}`, 4500),
            fetchAgg(lifiUrl, `lifi:${key}`, 4500)
          ],
          (v) => Boolean(
            v && (
              (v.code === 0 && v.data && v.data.routeSummary && v.data.routeSummary.amountOut) ||
              (v.priceRoute && v.priceRoute.destAmount) ||
              (v.estimate && v.estimate.toAmount)
            )
          ),
          1200,
          5000,
          localCtrl
        );

        const candidates = [];
        const kRoute =
          kRes && kRes.status === 'fulfilled' && kRes.value && kRes.value.code === 0 && kRes.value.data && kRes.value.data.routeSummary
            ? kRes.value.data.routeSummary
            : null;
        if (kRoute && kRoute.amountOut) {
          const scaledOut = scaleArcOut(kRoute.amountOut);
          candidates.push({
            routeSource: 'kyber',
            label: 'KyberSwap',
            outBig: scaledOut,
            amountOut: scaledOut.toString(),
            amountInUsd: kRoute.amountInUsd || null,
            amountOutUsd: kRoute.amountOutUsd || null,
            routeData: { ...kRoute, _arcNormSrc: effSrc, _arcNormDest: effDest, _arcNormAmtIn: effAmtStr }
          });
        }

        const pRoute =
          pRes && pRes.status === 'fulfilled' && pRes.value && pRes.value.priceRoute && pRes.value.priceRoute.destAmount
            ? pRes.value.priceRoute
            : null;
        if (pRoute && pRoute.destAmount) {
          candidates.push({
            routeSource: 'paraswap',
            label: 'ParaSwap',
            outBig: BigInt(pRoute.destAmount),
            amountOut: String(pRoute.destAmount),
            amountInUsd: pRoute.srcUSD || null,
            amountOutUsd: pRoute.destUSD || null,
            routeData: pRoute
          });
        }

        const lRoute =
          lRes && lRes.status === 'fulfilled' && lRes.value && lRes.value.estimate && lRes.value.estimate.toAmount
            ? lRes.value
            : null;
        if (lRoute && /^\d+$/.test(String(lRoute.estimate.toAmount)) && BigInt(lRoute.estimate.toAmount) > 0n) {
          const scaledOut = scaleArcOut(lRoute.estimate.toAmount);
          candidates.push({
            routeSource: 'lifi',
            label: 'LI.FI',
            outBig: scaledOut,
            amountOut: scaledOut.toString(),
            amountInUsd: lRoute.estimate.fromAmountUSD || null,
            amountOutUsd: lRoute.estimate.toAmountUSD || null,
            routeData: { ...lRoute, _arcNormSrc: effSrc, _arcNormDest: effDest, _arcNormAmtIn: effAmtStr }
          });
        }

        // OpenOcean 作为最后兜底：仅当 KyberSwap / ParaSwap（及 LI.FI）均无可用报价时才发起请求，避免冷启动首单白发 403 请求
        if (candidates.length === 0 && ooUrl) {
          const ooVal = await fetchJsonWithTimeout(ooUrl, { signal }, 4000).catch((err) => {
            const msg = String((err && err.message) || '');
            const status = (err && Number(err.status)) || (/403|forbidden|cloudflare/i.test(msg) ? 403 : 0);
            if (status === 403 && err && !err.status) err.status = 403;
            if (status === 403 || status === 429 || (err && err.name === 'AbortError') || status >= 500) {
              markAggCooldown('openocean', status === 403 ? 10 * 60_000 : 120_000);
            }
            return null;
          });
          const ooRoute =
            ooVal && Number(ooVal.code) === 200 && ooVal.data && ooVal.data.outAmount
              ? ooVal.data
              : null;
          if (ooRoute && /^\d+$/.test(String(ooRoute.outAmount)) && BigInt(ooRoute.outAmount) > 0n) {
            const scaledOut = scaleArcOut(ooRoute.outAmount);
            candidates.push({
              routeSource: 'openocean',
              label: 'OpenOcean',
              outBig: scaledOut,
              amountOut: scaledOut.toString(),
              amountInUsd: null,
              amountOutUsd: null,
              routeData: { ...ooRoute, _arcNormSrc: effSrc, _arcNormDest: effDest, _arcNormAmtIn: effAmtStr }
            });
          }
        }

        if (candidates.length === 0) {
          return {
            ok: false,
            routeSource: null,
            label: null,
            amountOut: null,
            amountOutFormatted: null,
            amountInUsd: null,
            amountOutUsd: null,
            routeData: null,
            comparedPools: 0,
            error: t('暂无链上聚合报价', 'No DEX quote available')
          };
        }

        candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
        const best = candidates[0];
        const comparedPools = candidates.length;
        const routeLabel = comparedPools > 1
          ? `⚡ ${t('最优', 'Best')}: ${best.label} (${t(`比价 ${comparedPools} 池`, `${comparedPools} pools`)})`
          : best.label;
        return {
          ok: true,
          routeSource: best.routeSource,
          label: best.label,
          bestSource: best.label,
          comparedPools,
          routeLabel,
          amountOut: best.amountOut,
          amountOutFormatted: fromBaseUnits(best.amountOut, destDecimals),
          amountInUsd: best.amountInUsd,
          amountOutUsd: best.amountOutUsd,
          routeData: best.routeData,
          slippageBps,
          serviceFeeBps: bps,
          error: null
        };
      } finally {
        if (signal && onExtAbort) {
          try { signal.removeEventListener('abort', onExtAbort); } catch (_) {}
        }
      }
    });
  }

  async function executeEvmDexSwap({
    wallet,
    chainKey,
    routeSource,
    routeData,
    srcToken,
    destToken,
    amountRaw,
    srcDecimals = 18,
    slippageBps = 100,
    tokenBalance = null,
    feeBps = 0,
    feeReceiver = DEFAULT_EVM_FEE_RECEIVER,
    gasBuffer = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));

    const arcNorm = normalizeArcUsdcParams({
      chainKey: key,
      chainId: cfg.chainId,
      srcToken,
      destToken,
      amountRaw,
      srcDecimals
    });
    const isArcMainnet = arcNorm.isArcMainnet;
    const isNative = !srcToken || String(srcToken).toLowerCase() === NATIVE_EVM_SENTINEL || (isArcMainnet && String(srcToken).toLowerCase() === ARC_USDC_PRECOMPILE);
    const effSrc = (routeData && routeData._arcNormSrc) || arcNorm.effSrc;
    const effDest = (routeData && routeData._arcNormDest) || arcNorm.effDest;
    const effAmt = (routeData && routeData._arcNormAmtIn) || arcNorm.effAmtStr;

    const humanAmt = Number(fromBaseUnits(String(amountRaw), srcDecimals));
    if (isNative) {
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: cfg.symbol,
        amount: humanAmt,
        isNative: true,
        gasBuffer
      });
    } else {
      let effectiveErc20 =
        tokenBalance !== null && tokenBalance !== undefined
          ? tokenBalance
          : (wallet.erc20Balances && wallet.erc20Balances[key] && wallet.erc20Balances[key][String(srcToken).toLowerCase()] !== undefined
              ? wallet.erc20Balances[key][String(srcToken).toLowerCase()]
              : null);
      if (effectiveErc20 === null && wallet.evmAddress) {
        const fetched = await fetchEvmNativeAndErc20Balance(key, wallet.evmAddress, srcToken, srcDecimals).catch(() => null);
        if (fetched && fetched.tokenFormatted !== null && fetched.tokenFormatted !== undefined) {
          effectiveErc20 = fetched.tokenFormatted;
        }
      }
      if (effectiveErc20 !== null) {
        validateSufficientChainBalance({
          wallet,
          chain: key,
          tokenSymbol: 'TOKEN',
          amount: humanAmt,
          isNative: false,
          tokenBalance: effectiveErc20
        });
      }
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: cfg.symbol,
        amount: cfg.gasReserve,
        isNative: false,
        tokenBalance: resolveWalletChainBalance(wallet, key)
      });
    }

    if (!routeData) {
      throw new Error(t('缺少链上路由数据', 'Missing routeData'));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.evmAddress || (!wallet.evmPrivateKey && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC EVM 地址不可用', 'NEAR Master Account or MPC EVM address unavailable'));
    }

    let toAddr = '';
    let txData = '';
    let txVal = '0';
    let approvalAddr = isNative && !isArcMainnet ? null : effSrc;
    let spenderAddr = null;
    let approvalAmt = effAmt;

    if (routeSource === 'lifi') {
      const lifiSlip = ((Number(slippageBps) || 100) / 10000).toFixed(4);
      let lData = routeData;
      if (!lData.transactionRequest || String(lData.transactionRequest.from || '').toLowerCase() !== wallet.evmAddress.toLowerCase()) {
        lData = await fetchJsonWithTimeout(
          `${LIFI_API_URL}/quote?fromChain=${cfg.chainId}&toChain=${cfg.chainId}&fromToken=${encodeURIComponent(effSrc)}&toToken=${encodeURIComponent(effDest)}&fromAmount=${encodeURIComponent(effAmt)}&fromAddress=${encodeURIComponent(wallet.evmAddress)}&slippage=${lifiSlip}`,
          {},
          12000
        );
      }
      const txReq = lData && lData.transactionRequest;
      if (!txReq || !txReq.to || !txReq.data) {
        throw new Error(toUserFriendlyError(lData && lData.message, '兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.'));
      }
      toAddr = txReq.to;
      txData = txReq.data;
      txVal = txReq.value || '0';
      spenderAddr = (lData.estimate && lData.estimate.approvalAddress) || toAddr;
      if (isArcMainnet && isNative) approvalAddr = ARC_USDC_PRECOMPILE;
    } else if (routeSource === 'paraswap') {
      const bps = feeBps !== undefined && feeBps !== null && Number.isFinite(Number(feeBps)) ? Math.max(0, Math.round(Number(feeBps))) : 0;
      const paraPayload = {
        srcToken,
        destToken,
        srcAmount: String(amountRaw),
        priceRoute: routeData,
        userAddress: wallet.evmAddress,
        slippage: Number(slippageBps) || 100
      };
      if (bps > 0 && feeReceiver) {
        paraPayload.partner = 'pearlwallet';
        paraPayload.partnerAddress = feeReceiver;
        paraPayload.partnerFeeBps = bps;
      }
      const pBuild = await fetchJsonWithTimeout(
        `https://api.paraswap.io/transactions/${cfg.chainId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-client-id': 'nexus-wallet' },
          body: JSON.stringify(paraPayload)
        },
        12000
      ).catch((err) => {
        throw new Error(toUserFriendlyError(err, '兑换交易构建失败，请稍后重试', 'Swap transaction build failed. Please try again.'));
      });
      if (!pBuild || !pBuild.to || !pBuild.data) {
        throw new Error(toUserFriendlyError(pBuild && pBuild.error, '兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.'));
      }
      toAddr = pBuild.to;
      txData = pBuild.data;
      txVal = pBuild.value || '0';
      spenderAddr = (routeData && routeData.tokenTransferProxy) || toAddr;
    } else if (routeSource === 'openocean' && cfg.openOcean) {
      const ooHuman = fromBaseUnits(String(amountRaw), srcDecimals);
      const ooSlip = ((Number(slippageBps) || 100) / 100).toFixed(2);
      const ooBuild = await fetchJsonWithTimeout(
        `${OPENOCEAN_API_URL}/${cfg.openOcean}/swap?inTokenAddress=${encodeURIComponent(srcToken)}&outTokenAddress=${encodeURIComponent(destToken)}&amount=${encodeURIComponent(ooHuman)}&slippage=${ooSlip}&account=${encodeURIComponent(wallet.evmAddress)}`,
        {},
        12000
      ).catch((err) => {
        if (err && (err.status === 403 || err.status === 429 || err.status >= 500)) {
          markAggCooldown('openocean', err.status === 403 ? 10 * 60_000 : 120_000);
        }
        throw new Error(toUserFriendlyError(err, '兑换路由暂时不可用，请刷新报价后重试', 'Swap route temporarily unavailable. Please refresh quote and retry.'));
      });
      const ooData = ooBuild && Number(ooBuild.code) === 200 ? ooBuild.data : null;
      if (!ooData || !ooData.to || !ooData.data) {
        throw new Error(toUserFriendlyError(ooBuild && ooBuild.message, '兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.'));
      }
      toAddr = ooData.to;
      txData = ooData.data;
      txVal = ooData.value || (isNative ? String(amountRaw) : '0');
      spenderAddr = toAddr;
    } else {
      const cleanSummary = { ...routeData };
      delete cleanSummary._arcNormSrc;
      delete cleanSummary._arcNormDest;
      delete cleanSummary._arcNormAmtIn;
      const buildRes = await fetchJsonWithTimeout(
        `https://aggregator-api.kyberswap.com/${cfg.kyber}/api/v1/route/build`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-client-id': 'nexus-wallet' },
          body: JSON.stringify({
            routeSummary: cleanSummary,
            sender: wallet.evmAddress,
            recipient: wallet.evmAddress,
            slippageTolerance: Number(slippageBps) || 100
          })
        },
        12000
      ).catch((err) => {
        throw new Error(toUserFriendlyError(err, '兑换交易构建失败，请稍后重试', 'Swap transaction build failed. Please try again.'));
      });
      const buildData = buildRes && buildRes.code === 0 ? buildRes.data : null;
      if (!buildData || !buildData.routerAddress || !buildData.data) {
        throw new Error(toUserFriendlyError(buildRes && buildRes.message, '兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.'));
      }
      toAddr = buildData.routerAddress;
      txData = buildData.data;
      txVal = isArcMainnet ? String(buildData.transactionValue || '0') : (isNative ? String(amountRaw) : '0');
      spenderAddr = toAddr;
      if (isArcMainnet && isNative) {
        approvalAddr = ARC_USDC_PRECOMPILE;
        approvalAmt = effAmt;
      }
    }

    if (wallet.evmPrivateKey) {
      return sendEvmSignedTransaction({
        chainKey: key,
        privateKey: wallet.evmPrivateKey,
        to: toAddr,
        data: txData,
        value: txVal,
        approvalToken: approvalAddr,
        spender: spenderAddr || toAddr,
        amountRaw: String(approvalAmt)
      });
    }
    return sendEvmMpcSignedTransaction({
      wallet,
      chainKey: key,
      to: toAddr,
      data: txData,
      value: txVal,
      approvalToken: approvalAddr,
      spender: spenderAddr || toAddr,
      amountRaw: String(approvalAmt),
      path: 'ethereum-1'
    });
  }

  async function executeEvmRawSteps({ wallet, chainKey, steps = [] } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));
    if (!Array.isArray(steps) || steps.length === 0) throw new Error(t('缺少链上交易步骤', 'Missing EVM execution steps'));
    await ensureWalletSigningKeysAsync(wallet);

    const execQueue = [];
    for (const step of steps) {
      if (step && Array.isArray(step.items) && step.items.length > 0) {
        for (const item of step.items) {
          const itemData = item && item.data ? item.data : item;
          if (itemData && itemData.to && itemData.data) execQueue.push(itemData);
        }
      } else if (step && step.to && step.data) {
        execQueue.push(step);
      }
    }
    if (execQueue.length === 0) throw new Error(t('未执行任何链上交易步骤', 'No executable EVM step found'));

    let lastRes = null;
    for (let i = 0; i < execQueue.length; i++) {
      const itemData = execQueue[i];
      const stepChain = Number(itemData.chainId || cfg.chainId);
      const targetKey = Object.keys(EVM_CHAINS).find((k) => EVM_CHAINS[k].chainId === stepChain) || key;
      const stepParams = {
        chainKey: targetKey,
        to: itemData.to,
        data: itemData.data,
        value: itemData.value !== undefined ? String(itemData.value) : '0'
      };
      if (wallet.evmPrivateKey) {
        lastRes = await sendEvmSignedTransaction({ privateKey: wallet.evmPrivateKey, ...stepParams });
      } else {
        lastRes = await sendEvmMpcSignedTransaction({ wallet, path: 'ethereum-1', ...stepParams });
      }
      if (i + 1 < execQueue.length && lastRes && lastRes.txHash) {
        await waitForEvmTxConfirmation(targetKey, lastRes.txHash, 45000).catch(() => null);
      }
    }
    return lastRes;
  }

