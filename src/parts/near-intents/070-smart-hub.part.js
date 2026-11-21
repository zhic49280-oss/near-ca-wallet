  /**
   * Super-Aggregator: automatically quotes ANY Token <-> ANY Token across:
   * 1) NEAR multi-pool (Ref V2 AMM vs Rhea CLMM dclv2 vs 1Click)
   * 2) Direct 1Click cross-chain bridge
   * 3) 2-Stage Cross-Chain Bridge (1Click / Ref #9010) + Target Chain DEX (Jupiter/Raydium or EVM Kyber/Para/OpenOcean)
   * 4) Arc Mainnet (5042) Cross-Chain Relay (1Click <-> Base USDC <-> Relay/Li.Fi <-> KyberSwap Arc)
   */
  // ==================== Smart Hub Router (any chain -> any chain via NEAR liquidity hub) ====================
  // Stages: [1Click bridge-in -> NEAR hub] -> [Ref v2 multi-hop / Rhea CLMM on NEAR] -> [1Click bridge-out -> destination chain]
  // Every candidate (entry hub x exit hub) is quoted live and the highest final output wins.
  const SMART_HUBS = [
    { key: 'wnear', contract: 'wrap.near', asset: 'nep141:wrap.near', decimals: 24, symbol: 'wNEAR' },
    { key: 'usdc', contract: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', asset: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, symbol: 'USDC' },
    { key: 'prl', contract: 'prl.omft.near', asset: '1cs_v1:near:nep141:prl.omft.near', decimals: 8, symbol: 'PRL' }
  ];

  function chainLabel(bc) {
    const b = String(bc || '').toLowerCase();
    return b === 'prl' ? 'Pearl' : b.toUpperCase();
  }

  async function quoteSmartHubRoute({
    fromToken,
    toToken,
    amountRaw,
    slippageBps = 100,
    recipient,
    refundTo,
    nearAccountId,
    evmAddress = '',
    solAddress = '',
    signal = null
  } = {}) {
    try {
      const contracts = getContractsHelper();
      const nearAcct = String(nearAccountId || '').trim();
      if (!fromToken || !toToken || !nearAcct || !contracts || typeof contracts.quoteNearRefFinanceSwap !== 'function') {
        return { ok: false, error: t('智能路由参数不完整', 'Smart route parameters incomplete') };
      }
      const fromBc = String(fromToken.blockchain || '').toLowerCase();
      const toBc = String(toToken.blockchain || '').toLowerCase();
      const amtStr = String(amountRaw || '0').trim();
      if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) return { ok: false, error: t('兑换数量无效', 'Invalid amount') };

      const hubCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const hubSignal = (hubCtrl && signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function')
        ? AbortSignal.any([signal, hubCtrl.signal])
        : (hubCtrl ? hubCtrl.signal : signal);
      let onExtAbort = null;
      if (hubCtrl && signal && (!hubSignal || hubSignal === hubCtrl.signal)) {
        if (signal.aborted) hubCtrl.abort();
        else {
          onExtAbort = () => hubCtrl.abort();
          signal.addEventListener('abort', onExtAbort, { once: true });
        }
      }
      try {

      const fromAsset = resolveOneClickAssetId(fromToken, fromBc);
      const toAsset = resolveOneClickAssetId(toToken, toBc);
      const toDec = typeof toToken.decimals === 'number' ? toToken.decimals : resolveTokenDecimals(toAsset);
      const fromDec = typeof fromToken.decimals === 'number' ? fromToken.decimals : resolveTokenDecimals(fromAsset);
      const toNearContract = toBc === 'near' ? (toToken.contractAddress || extractNearTokenContract(toToken.assetId) || 'wrap.near') : null;
      const fromNearContract = fromBc === 'near' ? (fromToken.contractAddress || extractNearTokenContract(fromToken.assetId) || 'wrap.near') : null;
      if (fromBc === 'near' && toBc === 'near') return { ok: false, error: 'same-chain' };
      const okAmt = (q) => q && q.ok && /^\d+$/.test(String(q.amountOut || '')) && BigInt(q.amountOut) > 0n;

      const isOneClickId = (s) => /^(nep141:|nep245:|1cs_v1:)/i.test(String(s || ''));
      const originIsSolDex = fromBc === 'sol' && !isOneClickId(fromAsset) && Boolean(fromToken.contractAddress)
        && fromToken.contractAddress.toLowerCase() !== SOL_NATIVE_WSOL.toLowerCase();
      const originIsEvmDex = ['eth', 'base', 'arb', 'op', 'pol', 'avax', 'bsc', 'hood'].includes(fromBc) && !isOneClickId(fromAsset) && Boolean(fromToken.contractAddress)
        && fromToken.contractAddress.toLowerCase() !== EVM_NATIVE_SENTINEL;
      const targetIsSolDex = toBc === 'sol' && !isOneClickId(toAsset) && Boolean(toToken.contractAddress)
        && toToken.contractAddress.toLowerCase() !== SOL_NATIVE_WSOL.toLowerCase();
      const targetIsEvmDex = ['eth', 'base', 'arb', 'op', 'pol', 'avax', 'bsc', 'hood'].includes(toBc) && !isOneClickId(toAsset) && Boolean(toToken.contractAddress)
        && toToken.contractAddress.toLowerCase() !== EVM_NATIVE_SENTINEL;
      const bridgeOutRecipient = targetIsSolDex
        ? (String(solAddress || '').trim() || recipient)
        : (targetIsEvmDex
            ? (/^0x[0-9a-fA-F]{40}$/.test(String(evmAddress || '').trim()) ? evmAddress : recipient)
            : recipient);

      // Optional Stage 0: Origin Chain DEX -> Origin Chain Native (when origin token is DEX-only)
      let stage0Dex = null;
      let bridgeInOriginAsset = fromAsset;
      let bridgeInAmountRaw = amtStr;
      let bridgeInRefundTo = refundTo || nearAcct;
      if (originIsSolDex && typeof contracts.quoteSolanaJupiterSwap === 'function') {
        const jupS0 = await contracts.quoteSolanaJupiterSwap({
          inputMint: fromToken.contractAddress,
          outputMint: SOL_NATIVE_WSOL,
          amountRaw: amtStr,
          slippageBps,
          signal: hubSignal
        }).catch(() => null);
        if (!jupS0 || !jupS0.outAmount || BigInt(jupS0.outAmount) <= 0n) {
          return { ok: false, error: t('Solana 源链 DEX 询价失败', 'Origin Solana DEX quote failed') };
        }
        stage0Dex = { chain: 'sol', quote: jupS0, label: `${jupS0.bestSource || 'Jupiter'} (➔SOL)` };
        bridgeInOriginAsset = SOL_1CLICK_ASSET_ID;
        bridgeInAmountRaw = String(jupS0.outAmount);
      } else if (originIsEvmDex && EVM_NATIVE_1CLICK_MAP[fromBc] && typeof contracts.quoteEvmDexSwap === 'function') {
        const validEvmFrom = /^0x[0-9a-fA-F]{40}$/.test(String(evmAddress || ''))
          ? evmAddress
          : (/^0x[0-9a-fA-F]{40}$/.test(String(refundTo || '')) ? refundTo : (/^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : ''));
        const evmS0 = await contracts.quoteEvmDexSwap({
          chainKey: fromBc,
          srcToken: fromToken.contractAddress,
          destToken: EVM_NATIVE_SENTINEL,
          amountRaw: amtStr,
          srcDecimals: fromDec,
          destDecimals: 18,
          slippageBps,
          fromAddress: validEvmFrom || undefined,
          signal: hubSignal
        }).catch(() => null);
        if (!evmS0 || !evmS0.ok || !evmS0.amountOut || BigInt(evmS0.amountOut) <= 0n) {
          return { ok: false, error: t('EVM 源链 DEX 询价失败', 'Origin EVM DEX quote failed') };
        }
        stage0Dex = { chain: fromBc, quote: evmS0, label: `${evmS0.bestSource || evmS0.label} (➔${fromBc.toUpperCase()})` };
        bridgeInOriginAsset = EVM_NATIVE_1CLICK_MAP[fromBc];
        bridgeInAmountRaw = String(evmS0.amountOut);
      }

      // ---- Entry options (pruned: Pearl PRL only enters via PRL hub; non-PRL prioritizes USDC + wNEAR)
      const hasBridgeOut = toBc !== 'near';
      const entryFeeBps = hasBridgeOut ? 0 : 25;
      let entries = [];
      let bridgeInErr = '';
      if (fromBc === 'near') {
        entries.push({ contract: fromNearContract, decimals: fromDec, symbol: fromToken.symbol, out: amtStr, bridgeIn: null, hubAsset: fromAsset });
      } else {
        const hubs = fromBc === 'prl'
          ? SMART_HUBS.filter((h) => h.key === 'prl')
          : SMART_HUBS.filter((h) => h.key === 'usdc' || h.key === 'wnear');
        const bridged = await Promise.all(hubs.map(async (h) => {
          if (String(bridgeInOriginAsset).toLowerCase() === h.asset.toLowerCase()) return null;
          const q = await quoteRawOneClick({
            originAsset: bridgeInOriginAsset,
            destinationAsset: h.asset,
            amountRaw: bridgeInAmountRaw,
            slippageBps,
            recipient: nearAcct,
            refundTo: bridgeInRefundTo,
            nearAccountId: nearAcct,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            appFeeBps: entryFeeBps,
            dry: true,
            signal: hubSignal
          }).catch((err) => ({ ok: false, error: err && err.message ? err.message : '' }));
          if (!okAmt(q) && q && q.error && !bridgeInErr) bridgeInErr = q.error;
          return okAmt(q) ? { contract: h.contract, decimals: h.decimals, symbol: h.symbol, out: String(q.amountOut), bridgeIn: q, hubAsset: h.asset } : null;
        }));
        entries = bridged.filter(Boolean);
      }
      if (entries.length === 0) {
        return { ok: false, error: bridgeInErr || t('该来源资产暂无法跨入 NEAR 流动性', 'Origin asset cannot be bridged into NEAR liquidity') };
      }

      // ---- Exit options (pruned <= 6 combos max: Pearl PRL exits via PRL hub; other chains via USDC + wNEAR)
      const bridgeOutDestAsset = targetIsSolDex
        ? SOL_1CLICK_ASSET_ID
        : (targetIsEvmDex && EVM_NATIVE_1CLICK_MAP[toBc] ? EVM_NATIVE_1CLICK_MAP[toBc] : toAsset);
      const exits = toBc === 'near'
        ? [{ contract: toNearContract, decimals: toDec, symbol: toToken.symbol, asset: toAsset, isFinal: true }]
        : (toBc === 'prl'
            ? SMART_HUBS.filter((h) => h.key === 'prl').map((h) => ({ contract: h.contract, decimals: h.decimals, symbol: h.symbol, asset: h.asset, isFinal: false }))
            : SMART_HUBS.filter((h) => h.key === 'usdc' || h.key === 'wnear').map((h) => ({ contract: h.contract, decimals: h.decimals, symbol: h.symbol, asset: h.asset, isFinal: false })));

      const combosRaw = [];
      entries.forEach((e) => exits.forEach((x) => {
        if (x.isFinal || fromBc === 'near' || e.contract !== x.contract || String(bridgeInOriginAsset).toLowerCase() !== String(bridgeOutDestAsset).toLowerCase()) {
          combosRaw.push({ e, x, priority: e.contract === '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1' ? 0 : 1 });
        }
      }));
      combosRaw.sort((a, b) => a.priority - b.priority);
      const combos = combosRaw.slice(0, 6);

      const evaluated = await safeRaceWithGraceWindow(combos.map(async ({ e, x }) => {
        try {
          let midOut = e.out;
          let swapQ = null;
          if (e.contract !== x.contract) {
            swapQ = await contracts.quoteNearRefFinanceSwap({ tokenIn: e.contract, tokenOut: x.contract, amountRaw: e.out, slippageBps, signal: hubSignal }).catch(() => null);
            if (!okAmt(swapQ)) return null;
            midOut = String(swapQ.amountOut);
          }
          let bridgeOut = null;
          let finalOut = midOut;
          if (!x.isFinal) {
            bridgeOut = await quoteRawOneClick({
              originAsset: x.asset,
              destinationAsset: bridgeOutDestAsset,
              amountRaw: midOut,
              slippageBps,
              recipient: bridgeOutRecipient,
              refundTo: nearAcct,
              nearAccountId: nearAcct,
              depositType: 'ORIGIN_CHAIN',
              recipientType: 'DESTINATION_CHAIN',
              appFeeBps: 25,
              dry: true,
              signal: hubSignal
            }).catch(() => null);
            if (!okAmt(bridgeOut)) return null;
            finalOut = String(bridgeOut.amountOut);
          }
          let destDexQ = null;
          if (targetIsSolDex && typeof contracts.quoteSolanaJupiterSwap === 'function') {
            destDexQ = await contracts.quoteSolanaJupiterSwap({
              inputMint: SOL_NATIVE_WSOL,
              outputMint: toToken.contractAddress,
              amountRaw: finalOut,
              slippageBps,
              signal: hubSignal
            }).catch(() => null);
            if (!destDexQ || !destDexQ.outAmount || BigInt(destDexQ.outAmount) <= 0n) return null;
            finalOut = String(destDexQ.outAmount);
          } else if (targetIsEvmDex && typeof contracts.quoteEvmDexSwap === 'function') {
            const validEvmFrom = /^0x[0-9a-fA-F]{40}$/.test(String(evmAddress || ''))
              ? evmAddress
              : (/^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : (/^0x[0-9a-fA-F]{40}$/.test(String(refundTo || '')) ? refundTo : ''));
            destDexQ = await contracts.quoteEvmDexSwap({
              chainKey: toBc,
              srcToken: EVM_NATIVE_SENTINEL,
              destToken: toToken.contractAddress,
              amountRaw: finalOut,
              srcDecimals: 18,
              destDecimals: toDec,
              slippageBps,
              fromAddress: validEvmFrom || undefined,
              signal: hubSignal
            }).catch(() => null);
            if (!destDexQ || !destDexQ.ok || !destDexQ.amountOut || BigInt(destDexQ.amountOut) <= 0n) return null;
            finalOut = String(destDexQ.amountOut);
          }
          const stageCount = (stage0Dex ? 1 : 0) + (e.bridgeIn ? 1 : 0) + (swapQ ? 1 : 0) + (bridgeOut ? 1 : 0) + (destDexQ ? 1 : 0);
          if (stageCount === 0) return null;
          return { ok: true, amountOut: finalOut, e, x, swapQ, bridgeOut, destDexQ, midOut, finalOut, outBig: BigInt(finalOut), stageCount };
        } catch (_) {
          return null;
        }
      }), 1200, 11000);
      if (hubCtrl && !hubCtrl.signal.aborted) hubCtrl.abort();

      const valid = evaluated
        .map((r) => (r && r.status === 'fulfilled' ? r.value : null))
        .filter((v) => v && v.outBig > 0n)
        .sort((a, b) => {
          if (a.outBig === b.outBig) return a.stageCount - b.stageCount;
          if (a.stageCount !== b.stageCount) {
            const fewer = a.stageCount < b.stageCount ? a : b;
            const more = a.stageCount < b.stageCount ? b : a;
            if (more.outBig * 1000n <= fewer.outBig * 1003n) {
              return a === fewer ? -1 : 1;
            }
          }
          return b.outBig > a.outBig ? 1 : -1;
        });
      if (valid.length === 0) {
        return { ok: false, error: t('暂无可用的跨链/多跳兑换路径', 'No viable multi-stage route found') };
      }
      const best = valid[0];
      const stages = [];
      const labels = [];
      if (stage0Dex) {
        stages.push({
          type: 'ORIGIN_DEX',
          chain: stage0Dex.chain,
          quote: stage0Dex.quote
        });
        labels.push(stage0Dex.label);
      }
      if (best.e.bridgeIn) {
        stages.push({
          type: 'BRIDGE_IN',
          originAsset: bridgeInOriginAsset,
          destinationAsset: best.e.hubAsset,
          hubContract: best.e.contract,
          hubDecimals: best.e.decimals,
          hubSymbol: best.e.symbol,
          expectedOut: best.e.out
        });
        labels.push(
          !best.swapQ && !best.bridgeOut && !best.destDexQ
            ? `1Click (${chainLabel(fromBc)}➔${chainLabel(toBc)})`
            : `1Click (${chainLabel(fromBc)}➔NEAR ${best.e.symbol})`
        );
      }
      if (best.swapQ) {
        stages.push({
          type: 'NEAR_SWAP',
          tokenIn: best.e.contract,
          tokenOut: best.x.contract,
          inDecimals: best.e.decimals,
          inSymbol: best.e.symbol,
          outDecimals: best.x.decimals,
          outSymbol: best.x.symbol,
          expectedIn: best.e.out,
          expectedOut: best.midOut,
          isDcl: Boolean(best.swapQ.isDcl),
          poolIds: Array.isArray(best.swapQ.poolIds) ? best.swapQ.poolIds : [],
          refQuote: best.swapQ
        });
        labels.push(best.swapQ.label || 'Ref Finance');
      }
      if (best.bridgeOut) {
        stages.push({
          type: 'BRIDGE_OUT',
          originAsset: best.x.asset,
          destinationAsset: bridgeOutDestAsset,
          hubContract: best.x.contract,
          hubDecimals: best.x.decimals,
          hubSymbol: best.x.symbol,
          recipient: bridgeOutRecipient,
          expectedIn: best.midOut,
          expectedOut: best.bridgeOut.amountOut
        });
        labels.push(`1Click (NEAR➔${chainLabel(toBc)})`);
      }
      if (best.destDexQ) {
        stages.push({
          type: 'DEST_DEX',
          chain: toBc,
          quote: best.destDexQ
        });
        labels.push(best.destDexQ.routeLabel || best.destDexQ.bestSource || best.destDexQ.label || `${toBc.toUpperCase()} DEX`);
      }
      const routeLabel = `${valid.length > 1 ? '⚡ ' : ''}${labels.join(' + ')}`;
      const hasAny1Click = Boolean(best.e.bridgeIn || best.bridgeOut);
      return {
        ok: true,
        compositeType: 'SMART_HUB_ROUTE',
        stages,
        depositAddress: null,
        memo: null,
        amountOut: best.finalOut,
        amountOutFormatted: fromBaseUnits(best.finalOut, toDec),
        amountInUsd: (best.e.bridgeIn && best.e.bridgeIn.amountInUsd) || null,
        amountOutUsd: (best.bridgeOut && best.bridgeOut.amountOutUsd) || null,
        serviceFeeBps: hasAny1Click ? 25 : 0,
        comparedPools: valid.length,
        bestSource: labels.join(' + '),
        routeLabel,
        error: null
      };
      } finally {
        if (signal && onExtAbort) {
          try { signal.removeEventListener('abort', onExtAbort); } catch (_) {}
        }
      }
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : t('智能路由询价失败', 'Smart route quote failed') };
    }
  }

  /**
   * Public cross-chain quote entry: fast-paths direct 1Click-capable pairs in 1 request, falling back
   * to Smart Hub Router only when needed (PRL pairs, DEX-only targets, or no direct liquidity).
   */
  async function quoteCrossChainWithDexRelay(params = {}) {
    const { fromToken, toToken, amountRaw, slippageBps = 100, recipient, signal = null } = params;
    if (!fromToken || !toToken) return quoteCrossChainWithDexRelayLegacy(params);
    const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
    const cacheKey = `xc|${fromToken.blockchain}:${fromToken.assetId}|${toToken.blockchain}:${toToken.assetId}|${String(amountRaw || '')}|${slippageBps}|${String(recipient || '')}`;
    const hit = _quoteCache.get(cacheKey);
    if (hit && hit.fetchRef === curFetch && Date.now() - hit.ts < 10_000) return { ...hit.val };
    const inflight = _quoteInFlight.get(cacheKey);
    if (inflight && inflight.fetchRef === curFetch) {
      if (!signal) return inflight.promise;
      return Promise.race([
        inflight.promise,
        new Promise((r) => {
          const onA = () => r({ ok: false, error: t('请求已取消', 'Request aborted') });
          if (signal.aborted) onA();
          else signal.addEventListener('abort', onA, { once: true });
        })
      ]);
    }
    const run = _execQuoteCrossChainWithDexRelay(params).then((res) => {
      if (res && res.ok) {
        _quoteCache.set(cacheKey, { ts: Date.now(), fetchRef: curFetch, val: res });
        if (_quoteCache.size > 60) _quoteCache.delete(_quoteCache.keys().next().value);
      }
      return res;
    }).finally(() => {
      const cur = _quoteInFlight.get(cacheKey);
      if (cur && cur.promise === run) _quoteInFlight.delete(cacheKey);
    });
    _quoteInFlight.set(cacheKey, { fetchRef: curFetch, promise: run });
    return run;
  }

