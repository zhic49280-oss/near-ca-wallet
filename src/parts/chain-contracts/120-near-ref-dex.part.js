  const REF_FINANCE_CONTRACT = 'v2.ref-finance.near';
  const REF_SMART_ROUTER_URL = 'https://smartrouter.ref.finance/findPath';
  const DCL_CONTRACT_ID = 'dclv2.ref-labs.near';
  const WRAP_NEAR_CONTRACT = 'wrap.near';
  const NEAR_USDC_CONTRACT_REF = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
  const KNOWN_REF_V2_POOLS = {
    'otoken.rhealab.near|token.rhealab.near': 6573,
    'token.rhealab.near|xtoken.rhealab.near': 6472,
    'lst.rhealab.near|wrap.near': 6494,
    'otoken.rhealab.near|wrap.near': 6574,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|token.rhealab.near': 6484,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|prl.omft.near': 9010,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near': 4512,
    'meta-pool.near|wrap.near': 3514,
    'linear-protocol.near|wrap.near': 3515
  };
  const NEAR_DCL_POOLS = {
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near|2000'
    ],
    'qtc.omft.near|wrap.near': ['qtc.omft.near|wrap.near|10000'],
    'otoken.rhealab.near|token.rhealab.near': ['otoken.rhealab.near|token.rhealab.near|10000'],
    'token.rhealab.near|xtoken.rhealab.near': ['token.rhealab.near|xtoken.rhealab.near|400'],
    'lst.rhealab.near|token.rhealab.near': ['lst.rhealab.near|token.rhealab.near|2000'],
    'token.rhealab.near|wrap.near': [
      'token.rhealab.near|wrap.near|2000',
      'token.rhealab.near|wrap.near|100',
      'token.rhealab.near|wrap.near|10000'
    ],
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|token.rhealab.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|token.rhealab.near|100'
    ],
    'qtc.omft.near|token.rhealab.near': ['qtc.omft.near|token.rhealab.near|2000'],
    'otoken.rhealab.near|wrap.near': ['otoken.rhealab.near|wrap.near|100'],
    'lst.rhealab.near|wrap.near': ['lst.rhealab.near|wrap.near|100']
  };

  function resolveNearDclPoolIds(inId, outId) {
    if (!inId || !outId || inId === outId) return [];
    const hit = NEAR_DCL_POOLS[`${inId}|${outId}`] || NEAR_DCL_POOLS[`${outId}|${inId}`];
    if (!hit) return [];
    return Array.isArray(hit) ? hit : [hit];
  }

  function resolveNearDclPoolId(inId, outId) {
    return resolveNearDclPoolIds(inId, outId)[0] || null;
  }

  async function viewNearContractCall(contractId, methodName, argsObj, signal = null) {
    const res = await nearRpcPostAsync(
      {
        jsonrpc: '2.0',
        id: `${contractId}-${methodName}`,
        method: 'query',
        params: {
          request_type: 'call_function',
          finality: 'final',
          account_id: contractId,
          method_name: methodName,
          args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(argsObj)))
        }
      },
      5000,
      signal
    ).catch(() => null);
    const bytes = res && res.result && res.result.result;
    return Array.isArray(bytes) ? JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) : null;
  }

  function computeSlippageMinAmount(amountOutStr, slippageBps = 100) {
    const out = BigInt(String(amountOutStr || '0'));
    if (out <= 0n) return '0';
    const clampedBps = Math.max(1, Math.min(5000, Number(slippageBps) || 100));
    return ((out * BigInt(10000 - clampedBps)) / 10000n).toString();
  }

  /**
   * Quotes a swap on Rhea / Ref CLMM (`dclv2.ref-labs.near`) via view call `quote`.
   */
  async function quoteNearDclPoolSwap({
    tokenIn,
    tokenOut,
    amountRaw,
    slippageBps = 100,
    signal = null
  } = {}) {
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!inId || !outId || inId === outId || !/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      return { ok: false, isDcl: true, dclContract: DCL_CONTRACT_ID, poolIds: [], amountOut: null, minAmountOut: '0', error: t('报价参数无效', 'Invalid quote parameters') };
    }
    const poolIdsList = resolveNearDclPoolIds(inId, outId);
    if (poolIdsList.length === 0) {
      return { ok: false, isDcl: true, dclContract: DCL_CONTRACT_ID, poolIds: [], amountOut: null, minAmountOut: '0', error: t('未配置该交易对 DCL 池', 'No DCL pool configured for this pair') };
    }

    try {
      const results = await Promise.all(
        poolIdsList.map(async (poolId) => {
          const qRes = await viewNearContractCall(DCL_CONTRACT_ID, 'quote', {
            pool_ids: [poolId],
            input_token: inId,
            output_token: outId,
            input_amount: amtStr
          }, signal).catch(() => null);
          const outAmt = qRes && qRes.amount !== undefined ? String(qRes.amount) : '0';
          if (!/^\d+$/.test(outAmt) || BigInt(outAmt) <= 0n) return null;
          return { poolId, outAmt, outBig: BigInt(outAmt) };
        })
      );
      const valid = results.filter(Boolean).sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
      if (valid.length === 0) {
        return { ok: false, isDcl: true, dclContract: DCL_CONTRACT_ID, poolIds: [poolIdsList[0]], amountOut: null, minAmountOut: '0', error: t('流动池暂无可用报价', 'Liquidity pool returned zero quote') };
      }
      const best = valid[0];
      const outAmt = best.outAmt;
      const minAmountOut = computeSlippageMinAmount(outAmt, slippageBps);
      return {
        ok: true,
        isDcl: true,
        dclContract: DCL_CONTRACT_ID,
        contractId: DCL_CONTRACT_ID,
        label: 'Rhea CLMM (dclv2.ref-labs.near)',
        routeSource: 'Ref DCL',
        poolIds: [best.poolId],
        tokenIn: inId,
        tokenOut: outId,
        amountIn: amtStr,
        amountOut: outAmt,
        minAmountOut,
        serviceFeeBps: 0,
        actions: [],
        routeData: { isDcl: true, poolIds: [best.poolId], amount_out: outAmt, min_amount_out: minAmountOut },
        error: null
      };
    } catch (err) {
      return {
        ok: false,
        isDcl: true,
        dclContract: DCL_CONTRACT_ID,
        poolIds: [poolIdsList[0]],
        amountOut: null,
        minAmountOut: '0',
        error: toUserFriendlyError(err, t('获取报价失败，请稍后重试', 'Failed to fetch quote. Please try again.'))
      };
    }
  }

  function normalizeNearRefTokenContract(tokenId) {
    const s = String(tokenId || '').trim();
    if (!s || s.toLowerCase() === 'near' || s === 'nep141:wrap.near') return WRAP_NEAR_CONTRACT;
    if (s.startsWith('1cs_v1:near:nep141:')) return s.slice('1cs_v1:near:nep141:'.length);
    if (s.startsWith('nep141:')) return s.slice('nep141:'.length);
    return s;
  }

  const _refV2PoolIdCache = new Map();

  async function resolveKnownOrApiRefV2PoolId(tA, tB, allowApiLookup = true, signal = null) {
    if (!tA || !tB || tA === tB) return null;
    const sortedKey = [tA, tB].sort().join('|');
    if (KNOWN_REF_V2_POOLS[sortedKey] !== undefined) return KNOWN_REF_V2_POOLS[sortedKey];
    if (!allowApiLookup) return null;
    const cached = _refV2PoolIdCache.get(sortedKey);
    if (cached && (Date.now() - cached.ts < 300_000)) {
      return cached.id;
    }
    try {
      const url = `https://api.ref.finance/list-pools-by-tokens?token0=${encodeURIComponent(tA)}&token1=${encodeURIComponent(tB)}`;
      const res = await fetchJsonWithTimeout(url, signal ? { signal } : {}, 5000).catch(() => null);
      if (!Array.isArray(res) || res.length === 0) return null;
      const sorted = [...res].sort((a, b) => Number(b.tvl || 0) - Number(a.tvl || 0));
      const topId = Number(sorted[0]?.id);
      const validId = Number.isFinite(topId) && topId >= 0 ? topId : null;
      if (validId !== null) _refV2PoolIdCache.set(sortedKey, { id: validId, ts: Date.now() });
      return validId;
    } catch (_) {
      return null;
    }
  }

  async function quoteDirectRefV2SingleHop(poolId, inId, outId, amtStr, slippageBps, signal = null) {
    if (poolId === null || poolId === undefined) return null;
    const retStr = await viewNearContractCall(REF_FINANCE_CONTRACT, 'get_return', {
      pool_id: Number(poolId),
      token_in: inId,
      amount_in: String(amtStr),
      token_out: outId
    }, signal).catch(() => null);
    const outAmt = retStr !== null && retStr !== undefined ? String(retStr).trim() : '';
    if (!/^\d+$/.test(outAmt) || BigInt(outAmt) <= 0n) return null;
    const minOut = computeSlippageMinAmount(outAmt, slippageBps);
    const actions = [{
      pool_id: Number(poolId),
      token_in: inId,
      token_out: outId,
      amount_in: String(amtStr),
      min_amount_out: minOut
    }];
    return {
      ok: true,
      label: `Ref Finance V2 (#${poolId})`,
      routeSource: 'Ref Finance',
      contractId: REF_FINANCE_CONTRACT,
      tokenIn: inId,
      tokenOut: outId,
      amountIn: String(amtStr),
      amountOut: outAmt,
      minAmountOut: minOut,
      serviceFeeBps: 0,
      actions,
      routeData: { directPoolId: Number(poolId), actions, amount_out: outAmt },
      error: null
    };
  }

  /**
   * Quotes an on-chain NEAR NEP-141 swap via Ref Finance SmartRouter + direct v2.ref-finance.near pools + 2-hop + Rhea DCL.
   */
  async function quoteNearRefFinanceSwap({
    tokenIn,
    tokenOut,
    amountRaw,
    slippageBps = 100,
    signal = null
  } = {}) {
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!inId || !outId || inId === outId) {
      return { ok: false, label: 'Ref Finance', amountOut: null, actions: [], routeData: null, error: t('请选择不同的 NEAR 代币', 'Select distinct NEAR tokens') };
    }
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      return { ok: false, label: 'Ref Finance', amountOut: null, actions: [], routeData: null, error: t('兑换数量必须大于 0', 'Amount must be positive') };
    }

    const slipVal = Number(slippageBps) || 100;
    const refCacheKey = `nearRef:${inId}:${outId}:${amtStr}:${slipVal}`;
    return withQuoteCacheAndDedup(refCacheKey, 10_000, async () => {
      const slippageDec = (Math.max(1, slipVal) / 10000).toFixed(4);
      const url = `${REF_SMART_ROUTER_URL}?amountIn=${encodeURIComponent(amtStr)}&tokenIn=${encodeURIComponent(inId)}&tokenOut=${encodeURIComponent(outId)}&pathDeep=3&slippage=${slippageDec}`;

      const knownPoolId = await resolveKnownOrApiRefV2PoolId(inId, outId, false, signal);
      const hasDclPool = resolveNearDclPoolIds(inId, outId).length > 0;
      const stage1Ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const mergedSig = (stage1Ctrl && signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function')
        ? AbortSignal.any([signal, stage1Ctrl.signal])
        : (stage1Ctrl ? stage1Ctrl.signal : signal);
      let onExtAbort = null;
      if (stage1Ctrl && signal && (!mergedSig || mergedSig === stage1Ctrl.signal)) {
        if (signal.aborted) stage1Ctrl.abort();
        else {
          onExtAbort = () => stage1Ctrl.abort();
          signal.addEventListener('abort', onExtAbort, { once: true });
        }
      }

      try {
        const smartRouterPromise = fetchJsonWithTimeout(url, { signal: mergedSig }, 5000).catch(() => null);
        const directKnownPromise = knownPoolId !== null
          ? quoteDirectRefV2SingleHop(knownPoolId, inId, outId, amtStr, slipVal, mergedSig).catch(() => null)
          : Promise.resolve(null);
        const dclStage1Promise = hasDclPool
          ? quoteNearDclPoolSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps: slipVal, signal: mergedSig }).catch(() => null)
          : Promise.resolve(null);

        const parseSmartRouter = (data) => {
          if (!data || Number(data.result_code) !== 0 || !data.result_data) return null;
          const rData = data.result_data;
          const routes = Array.isArray(rData.routes) ? rData.routes : [];
          const amountOut = rData.amount_out ? String(rData.amount_out) : '0';
          const actions = [];
          for (const route of routes) {
            const pools = Array.isArray(route.pools) ? route.pools : [];
            for (const p of pools) {
              if (p.pool_id === undefined || !p.token_in || !p.token_out) continue;
              const act = {
                pool_id: Number(p.pool_id),
                token_in: String(p.token_in),
                token_out: String(p.token_out),
                min_amount_out: String(p.min_amount_out || '0')
              };
              if (p.amount_in && String(p.amount_in) !== '0') {
                act.amount_in = String(p.amount_in);
              }
              actions.push(act);
            }
          }
          if (actions.length > 0 && /^\d+$/.test(amountOut) && BigInt(amountOut) > 0n) {
            return {
              ok: true,
              label: 'Ref Finance (v2.ref-finance.near)',
              routeSource: 'Ref Finance',
              contractId: REF_FINANCE_CONTRACT,
              tokenIn: inId,
              tokenOut: outId,
              amountIn: amtStr,
              amountOut,
              minAmountOut: String(routes[0]?.min_amount_out || '0'),
              serviceFeeBps: 0,
              actions,
              routeData: rData,
              error: null
            };
          }
          return null;
        };

        const [srRace, dirRace, dclRace] = await raceWithGraceWindow(
          [smartRouterPromise, directKnownPromise, dclStage1Promise],
          (v) => Boolean(v && ((v.ok && v.amountOut) || parseSmartRouter(v))),
          1500,
          5500,
          stage1Ctrl
        );

        const srData = srRace && srRace.status === 'fulfilled' ? srRace.value : null;
        const smartRouterBest = parseSmartRouter(srData);
        const directKnownRes = dirRace && dirRace.status === 'fulfilled' ? dirRace.value : null;
        const dclStage1Res = dclRace && dclRace.status === 'fulfilled' ? dclRace.value : null;

        // Stage 1 fast-path: if SmartRouter OR direct known/DCL returned a valid route, pick highest and skip waterfalls.
        const stage1Candidates = [smartRouterBest, directKnownRes, dclStage1Res].filter((c) => c && c.ok && c.amountOut);
        if (stage1Candidates.length > 0) {
          stage1Candidates.sort((a, b) => {
            const x = BigInt(a.amountOut);
            const y = BigInt(b.amountOut);
            return y > x ? 1 : (y < x ? -1 : 0);
          });
          return { serviceFeeBps: 0, ...stage1Candidates[0] };
        }

        // Fallback when SmartRouter failed: explore dynamic pool + 2-hop + 3-hop + DCL.
        const refCandidates = [...stage1Candidates];

        if (knownPoolId === null && !(signal && signal.aborted)) {
          const apiPoolId = await resolveKnownOrApiRefV2PoolId(inId, outId, true, signal);
          if (apiPoolId !== null) {
            const dynRes = await quoteDirectRefV2SingleHop(apiPoolId, inId, outId, amtStr, slipVal, signal).catch(() => null);
            if (dynRes) refCandidates.push(dynRes);
          }
        }

        const hubs = ['token.rhealab.near', WRAP_NEAR_CONTRACT, NEAR_USDC_CONTRACT_REF];
        const twoHopResults = (signal && signal.aborted)
          ? []
          : await Promise.all(hubs.map(async (mid) => {
              if (mid === inId || mid === outId) return null;
              try {
                const [pid1, pid2] = await Promise.all([
                  resolveKnownOrApiRefV2PoolId(inId, mid, true, signal),
                  resolveKnownOrApiRefV2PoolId(mid, outId, true, signal)
                ]);
                if (pid1 === null || pid2 === null) return null;
                const hop1 = await quoteDirectRefV2SingleHop(pid1, inId, mid, amtStr, slipVal, signal);
                if (!hop1) return null;
                const hop2 = await quoteDirectRefV2SingleHop(pid2, mid, outId, hop1.amountOut, slipVal, signal);
                if (!hop2) return null;
                const actions = [
                  { pool_id: Number(pid1), token_in: inId, token_out: mid, amount_in: amtStr, min_amount_out: '0' },
                  { pool_id: Number(pid2), token_in: mid, token_out: outId, min_amount_out: hop2.minAmountOut }
                ];
                return {
                  ok: true,
                  label: `Ref Finance V2 (#${pid1}➔#${pid2})`,
                  routeSource: 'Ref Finance',
                  contractId: REF_FINANCE_CONTRACT,
                  tokenIn: inId,
                  tokenOut: outId,
                  amountIn: amtStr,
                  amountOut: hop2.amountOut,
                  minAmountOut: hop2.minAmountOut,
                  actions,
                  routeData: { direct2Hop: [pid1, pid2], actions, amount_out: hop2.amountOut },
                  error: null
                };
              } catch (_) {
                return null;
              }
            }));
        twoHopResults.forEach((r) => { if (r) refCandidates.push(r); });
        // 3-hop via two hubs using known pools only (e.g. PRL -> USDC -> RHEA -> oRHEA), executed atomically by Ref actions.
        const threeHopJobs = [];
        if (!(signal && signal.aborted)) {
          for (const h1 of hubs) {
            for (const h2 of hubs) {
              if (h1 === h2 || h1 === inId || h1 === outId || h2 === inId || h2 === outId) continue;
              threeHopJobs.push((async () => {
                try {
                  const [p1, p2, p3] = await Promise.all([
                    resolveKnownOrApiRefV2PoolId(inId, h1, false, signal),
                    resolveKnownOrApiRefV2PoolId(h1, h2, false, signal),
                    resolveKnownOrApiRefV2PoolId(h2, outId, false, signal)
                  ]);
                  if (p1 === null || p2 === null || p3 === null) return null;
                  const q1 = await quoteDirectRefV2SingleHop(p1, inId, h1, amtStr, slipVal, signal);
                  if (!q1) return null;
                  const q2 = await quoteDirectRefV2SingleHop(p2, h1, h2, q1.amountOut, slipVal, signal);
                  if (!q2) return null;
                  const q3 = await quoteDirectRefV2SingleHop(p3, h2, outId, q2.amountOut, slipVal, signal);
                  if (!q3) return null;
                  const actions = [
                    { pool_id: Number(p1), token_in: inId, token_out: h1, amount_in: amtStr, min_amount_out: '0' },
                    { pool_id: Number(p2), token_in: h1, token_out: h2, min_amount_out: '0' },
                    { pool_id: Number(p3), token_in: h2, token_out: outId, min_amount_out: q3.minAmountOut }
                  ];
                  return {
                    ok: true,
                    label: `Ref Finance V2 (#${p1}➔#${p2}➔#${p3})`,
                    routeSource: 'Ref Finance',
                    contractId: REF_FINANCE_CONTRACT,
                    tokenIn: inId,
                    tokenOut: outId,
                    amountIn: amtStr,
                    amountOut: q3.amountOut,
                    minAmountOut: q3.minAmountOut,
                    actions,
                    routeData: { direct3Hop: [p1, p2, p3], actions, amount_out: q3.amountOut },
                    error: null
                  };
                } catch (_) {
                  return null;
                }
              })());
            }
          }
        }
        (await Promise.all(threeHopJobs)).forEach((r) => { if (r) refCandidates.push(r); });

        if (refCandidates.length > 0) {
          refCandidates.sort((a, b) => {
            const x = BigInt(a.amountOut);
            const y = BigInt(b.amountOut);
            return y > x ? 1 : (y < x ? -1 : 0);
          });
          return { serviceFeeBps: 0, ...refCandidates[0] };
        }
        if (hasDclPool) {
          const dclFallback = await quoteNearDclPoolSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps: slipVal, signal }).catch(() => null);
          if (dclFallback && dclFallback.ok) return dclFallback;
        }

        return {
          ok: false,
          label: 'Ref Finance',
          amountOut: null,
          actions: [],
          routeData: null,
          error: toUserFriendlyError(srData && srData.result_message, t('暂无可用流动性路径，请稍后重试', 'No liquidity route found. Please try again.'))
        };
      } finally {
        if (signal && onExtAbort) {
          try { signal.removeEventListener('abort', onExtAbort); } catch (_) {}
        }
      }
    });
  }

  async function ensureNearNep141StorageRegistered({ resolvedWallet, accountId, tokenContract } = {}) {
    const acct = String(accountId || '').trim();
    const cid = String(tokenContract || '').trim();
    if (!resolvedWallet || !acct || !cid || cid.toLowerCase() === 'near') return false;
    try {
      const sBal = await viewNearContractCall(cid, 'storage_balance_of', { account_id: acct });
      if (sBal && typeof sBal === 'object' && BigInt(String(sBal.total || '0')) > 0n) {
        return true;
      }
    } catch (_) {}

    let depositYocto = '1250000000000000000000';
    try {
      const minBal = await viewNearContractCall(cid, 'storage_minimum_balance', {});
      const minStr = minBal && typeof minBal === 'object' ? (minBal.min ?? minBal.minimum ?? null) : minBal;
      if (minStr !== null && minStr !== undefined && /^\d+$/.test(String(minStr))) {
        const minBig = BigInt(String(minStr));
        const maxCap = 50_000_000_000_000_000_000_000n; // 0.05 NEAR safety cap
        if (minBig > 0n) {
          depositYocto = (minBig <= maxCap ? minBig : maxCap).toString();
        }
      }
    } catch (_) {}

    await api.signAndSendNearFunctionCall({
      accountId: acct,
      publicKeyStr: resolvedWallet.nearPublicKey,
      privateKeyStr: resolvedWallet.nearPrivateKey,
      receiverId: cid,
      methodName: 'storage_deposit',
      argsJson: JSON.stringify({ account_id: acct, registration_only: true }),
      gas: '30000000000000',
      depositYocto
    });
    return true;
  }

  async function unwrapNearToNativeAsync({ resolvedWallet, accountId, amountYocto } = {}) {
    const acct = String(accountId || '').trim();
    const amt = String(amountYocto || '0').trim();
    if (!resolvedWallet || !acct || !/^\d+$/.test(amt) || BigInt(amt) <= 0n) return null;
    return api.signAndSendNearFunctionCall({
      accountId: acct,
      publicKeyStr: resolvedWallet.nearPublicKey,
      privateKeyStr: resolvedWallet.nearPrivateKey,
      receiverId: WRAP_NEAR_CONTRACT,
      methodName: 'near_withdraw',
      argsJson: JSON.stringify({ amount: amt }),
      gas: '30000000000000',
      depositYocto: '1'
    });
  }

  async function prepareNearSwapFundingAndStorage({ resolvedWallet, sender, inId, outId, amtStr }) {
    let wrappedShortfallYocto = '0';
    if (inId === WRAP_NEAR_CONTRACT) {
      let wrappedBal = 0n;
      try {
        const wStr = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'ft_balance_of', { account_id: sender });
        if (wStr && /^\d+$/.test(String(wStr).trim())) wrappedBal = BigInt(String(wStr).trim());
      } catch (_) {}
      const needed = BigInt(amtStr);
      if (wrappedBal < needed) {
        const shortfall = needed - wrappedBal;
        await ensureNearNep141StorageRegistered({
          resolvedWallet,
          accountId: sender,
          tokenContract: WRAP_NEAR_CONTRACT
        });
        await api.signAndSendNearFunctionCall({
          accountId: sender,
          publicKeyStr: resolvedWallet.nearPublicKey,
          privateKeyStr: resolvedWallet.nearPrivateKey,
          receiverId: WRAP_NEAR_CONTRACT,
          methodName: 'near_deposit',
          argsJson: '{}',
          gas: '30000000000000',
          depositYocto: shortfall.toString()
        });
        wrappedShortfallYocto = shortfall.toString();
      }
    }

    if (outId && outId !== WRAP_NEAR_CONTRACT) {
      await ensureNearNep141StorageRegistered({
        resolvedWallet,
        accountId: sender,
        tokenContract: outId
      });
    } else if (outId === WRAP_NEAR_CONTRACT) {
      await ensureNearNep141StorageRegistered({
        resolvedWallet,
        accountId: sender,
        tokenContract: WRAP_NEAR_CONTRACT
      }).catch(() => {});
    }

    return { wrappedShortfallYocto };
  }

