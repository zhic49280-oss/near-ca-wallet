  function getContractsHelper() {
    if (root && root.NearCAContracts) return root.NearCAContracts;
    if (typeof globalThis !== 'undefined' && globalThis.NearCAContracts) return globalThis.NearCAContracts;
    if (typeof window !== 'undefined' && window.NearCAContracts) return window.NearCAContracts;
    if (typeof require === 'function') {
      try {
        return require('./chain-contracts.js');
      } catch (_) {}
    }
    return null;
  }

  const SOL_NATIVE_WSOL = 'So11111111111111111111111111111111111111112';
  const SOL_1CLICK_ASSET_ID = 'nep141:sol.omft.near';
  const EVM_NATIVE_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const EVM_NATIVE_1CLICK_MAP = {
    eth: 'nep141:eth.omft.near',
    base: 'nep141:base.omft.near',
    arb: 'nep141:arb.omft.near',
    bsc: 'nep141:bnb.omdep.near',
    pol: 'nep141:pol.omdep.near',
    avax: 'nep141:avax.omdep.near',
    op: 'nep245:v2_1.omni.hot.tg:10_11111111111111111111',
    hood: 'nep141:hood.omft.near'
  };

  /**
   * Multi-pool best-price comparator for NEAR same-chain token pairs:
   * concurrently queries Ref V2 AMM, Rhea/Ref CLMM (dclv2 + PRL composite), and 1Click Solver.
   */
  function safeRaceWithGraceWindow(promises, graceMs = 700, globalTimeoutMs = 6000) {
    return new Promise((resolve) => {
      const results = promises.map(() => ({ status: 'pending', value: null }));
      let remaining = promises.length;
      if (remaining === 0) {
        resolve(results);
        return;
      }
      let settled = false;
      let graceTimer = null;
      const done = () => {
        if (settled) return;
        settled = true;
        if (graceTimer) clearTimeout(graceTimer);
        if (globalTimer) clearTimeout(globalTimer);
        resolve(results);
      };
      const globalTimer = setTimeout(done, globalTimeoutMs);
      promises.forEach((p, idx) => {
        Promise.resolve(p).then(
          (val) => {
            results[idx] = { status: 'fulfilled', value: val };
            remaining--;
            const hasWinner = val && val.ok && val.amountOut && /^\d+$/.test(String(val.amountOut)) && BigInt(val.amountOut) > 0n;
            if (remaining === 0) done();
            else if (hasWinner && !graceTimer) {
              graceTimer = setTimeout(done, graceMs);
            }
          },
          (err) => {
            results[idx] = { status: 'rejected', reason: err };
            remaining--;
            if (remaining === 0) done();
          }
        );
      });
    });
  }

  async function quoteBestNearPairSwap({
    fromToken,
    toToken,
    amountRaw,
    slippageBps = 100,
    recipient,
    nearAccountId,
    requireThirdPartyRecipient = false,
    signal = null
  } = {}) {
    const contracts = getContractsHelper();
    const nearAcct = nearAccountId || recipient;
    const tokenInContract = fromToken.contractAddress || extractNearTokenContract(fromToken.assetId) || 'wrap.near';
    const tokenOutContract = toToken.contractAddress || extractNearTokenContract(toToken.assetId) || 'wrap.near';
    const amtStr = String(amountRaw || '0').trim();
    const outDec = typeof toToken.decimals === 'number' ? toToken.decimals : resolveTokenDecimals(toToken.assetId);

    const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
    const cacheKey = `near|${tokenInContract}|${tokenOutContract}|${amtStr}|${slippageBps}|${nearAcct || ''}|${requireThirdPartyRecipient ? `3p:${String(recipient || '')}` : 'any'}`;
    const hit = _quoteCache.get(cacheKey);
    if (hit && hit.fetchRef === curFetch && Date.now() - hit.ts < 10_000) return { ...hit.val };

    if (requireThirdPartyRecipient) {
      const ocVal = await quoteRawOneClick({
        originAsset: fromToken.assetId,
        destinationAsset: toToken.assetId,
        amountRaw: amtStr,
        slippageBps,
        recipient: recipient || nearAcct,
        refundTo: nearAcct,
        nearAccountId: nearAcct,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: true,
        signal
      }).catch(() => null);
      if (ocVal && ocVal.ok && /^\d+$/.test(String(ocVal.amountOut || '0')) && BigInt(ocVal.amountOut) > 0n) {
        const out = {
          ...ocVal,
          ok: true,
          routeSource: 'NEAR_INTENTS_1CLICK',
          bestSource: '1Click Solver',
          comparedRoutesCount: 1,
          comparedPools: 1,
          routeLabel: t('1Click 直连 (第三方收款)', '1Click Direct (Custom Recipient)'),
          serviceFeeBps: ocVal.serviceFeeBps !== undefined ? ocVal.serviceFeeBps : 25,
          amountOut: String(ocVal.amountOut),
          amountOutFormatted: ocVal.amountOutFormatted || fromBaseUnits(ocVal.amountOut, outDec)
        };
        _quoteCache.set(cacheKey, { ts: Date.now(), fetchRef: curFetch, val: out });
        if (_quoteCache.size > 60) _quoteCache.delete(_quoteCache.keys().next().value);
        return out;
      }
      return {
        ok: false,
        error: t('该币对暂不支持自定义第三方收款地址，请改回本人地址', 'Custom recipient is unavailable for this pair; use your own address'),
        comparedRoutesCount: 0
      };
    }

    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const mergedSignal = (ctrl && signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function')
      ? AbortSignal.any([signal, ctrl.signal])
      : (ctrl ? ctrl.signal : signal);
    let onExtAbort = null;
    if (ctrl && signal && (!mergedSignal || mergedSignal === ctrl.signal)) {
      if (signal.aborted) ctrl.abort();
      else {
        onExtAbort = () => ctrl.abort();
        signal.addEventListener('abort', onExtAbort, { once: true });
      }
    }

    try {
      const refPromise = (contracts && typeof contracts.quoteNearRefFinanceSwap === 'function')
        ? contracts.quoteNearRefFinanceSwap({ tokenIn: tokenInContract, tokenOut: tokenOutContract, amountRaw: amtStr, slippageBps, signal: mergedSignal }).catch(() => null)
        : quoteRefSmartRouterPath({ tokenIn: tokenInContract, tokenOut: tokenOutContract, amountRaw: amtStr, slippageBps, signal: mergedSignal }).catch(() => null);

      const dclPromise = quoteNearDclPoolSwap({ tokenIn: tokenInContract, tokenOut: tokenOutContract, amountRaw: amtStr, slippageBps, signal: mergedSignal }).catch(() => null);

      const compositePrlPromise = (isPrlAssetId(fromToken.assetId) !== isPrlAssetId(toToken.assetId))
        ? quoteCompositePrlSwap({
            originAsset: fromToken.assetId,
            destinationAsset: toToken.assetId,
            amountRaw: amtStr,
            slippageBps,
            recipient: nearAcct,
            refundTo: nearAcct,
            nearAccountId: nearAcct,
            signal: mergedSignal
          }).catch(() => null)
        : Promise.resolve(null);

      const oneClickPromise = quoteRawOneClick({
        originAsset: fromToken.assetId,
        destinationAsset: toToken.assetId,
        amountRaw: amtStr,
        slippageBps,
        recipient: nearAcct,
        refundTo: nearAcct,
        nearAccountId: nearAcct,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: true,
        signal: mergedSignal
      }).catch(() => null);

      const [rRes, dRes, cRes, oRes] = await safeRaceWithGraceWindow(
        [refPromise, dclPromise, compositePrlPromise, oneClickPromise],
        2400,
        7500
      );
      if (ctrl && !ctrl.signal.aborted) ctrl.abort();

      const candidates = [];
      const pushCand = (source, res, defaultFeeBps = 0, formatter = null) => {
        if (!res || !res.ok || !res.amountOut || !/^\d+$/.test(String(res.amountOut))) return;
        const outBig = BigInt(res.amountOut);
        if (outBig <= 0n) return;
        candidates.push({
          source,
          outBig,
          payload: {
            ...res,
            serviceFeeBps: res.serviceFeeBps !== undefined ? res.serviceFeeBps : defaultFeeBps,
            amountOut: String(res.amountOut),
            amountOutFormatted: res.amountOutFormatted || (formatter ? formatter(res.amountOut) : fromBaseUnits(res.amountOut, outDec))
          }
        });
      };

      const refVal = rRes && rRes.status === 'fulfilled' ? rRes.value : null;
      if (refVal && refVal.ok && !refVal.isDcl) pushCand('Ref Finance V2', refVal, 0);
      const dclVal = dRes && dRes.status === 'fulfilled' ? dRes.value : null;
      if (dclVal && dclVal.ok) pushCand('Rhea CLMM (dclv2)', dclVal, 0);
      else if (refVal && refVal.ok && refVal.isDcl) pushCand('Rhea CLMM (dclv2)', refVal, 0);

      const compVal = cRes && cRes.status === 'fulfilled' ? cRes.value : null;
      if (compVal && compVal.ok) {
        pushCand(compVal.bestSource || 'Ref + Composite', compVal, compVal.serviceFeeBps || 0);
      }
      const ocVal = oRes && oRes.status === 'fulfilled' ? oRes.value : null;
      if (ocVal && ocVal.ok) pushCand('1Click Solver', { ...ocVal, routeSource: 'NEAR_INTENTS_1CLICK' }, 25);

      if (candidates.length === 0) {
        const errMsg = (compVal && compVal.error) || (ocVal && ocVal.error) || (refVal && refVal.error) || t('暂无 NEAR 流动性报价', 'No NEAR quote available');
        return { ok: false, error: errMsg, comparedRoutesCount: 0 };
      }

      candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
      const best = candidates[0];
      const comparedRoutesCount = candidates.length;
      const routeLabel = comparedRoutesCount > 1
        ? `⚡ ${t('最优', 'Best')}: ${best.source} (${t(`比价 ${comparedRoutesCount} 池`, `${comparedRoutesCount} pools`)})`
        : best.source;

      const out = {
        ...best.payload,
        ok: true,
        bestSource: best.source,
        comparedRoutesCount,
        comparedPools: comparedRoutesCount,
        routeLabel
      };
      _quoteCache.set(cacheKey, { ts: Date.now(), fetchRef: curFetch, val: out });
      if (_quoteCache.size > 60) _quoteCache.delete(_quoteCache.keys().next().value);
      return out;
    } finally {
      if (signal && onExtAbort) {
        try { signal.removeEventListener('abort', onExtAbort); } catch (_) {}
      }
    }
  }

