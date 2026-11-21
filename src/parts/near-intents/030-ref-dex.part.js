  const REF_SMART_ROUTER_URL = 'https://smartrouter.ref.finance/findPath';
  const DCL_CONTRACT_ID = 'dclv2.ref-labs.near';
  const PRL_PEARL_ASSET_ID = 'nep141:prl.omft.near';
  const PRL_NEAR_ASSET_ID = '1cs_v1:near:nep141:prl.omft.near';
  const PRL_NEAR_CONTRACT = 'prl.omft.near';
  const QTC_ORIGIN_ASSET_ID = 'nep141:qtc.omft.near';
  const QTC_NEAR_ASSET_ID = '1cs_v1:near:nep141:qtc.omft.near';
  const QTC_NEAR_CONTRACT = 'qtc.omft.near';
  const NEAR_USDC_ASSET_ID = 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
  const NEAR_USDC_CONTRACT = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
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

  const NEAR_ASSET_DECIMALS = {
    'nep141:wrap.near': 24,
    'nep141:usdt.tether-token.near': 6,
    [NEAR_USDC_ASSET_ID]: 6,
    [PRL_PEARL_ASSET_ID]: 8,
    [PRL_NEAR_ASSET_ID]: 8,
    [QTC_ORIGIN_ASSET_ID]: 12,
    [QTC_NEAR_ASSET_ID]: 12
  };

  async function quoteNearDclPoolSwap({ tokenIn, tokenOut, amountRaw, slippageBps = 100, signal = null } = {}) {
    const inId = String(tokenIn || '').trim();
    const outId = String(tokenOut || '').trim();
    const amtStr = String(amountRaw || '0').trim();
    const pairKeyA = `${inId}|${outId}`;
    const pairKeyB = `${outId}|${inId}`;
    const poolCandidates = NEAR_DCL_POOLS[pairKeyA] || NEAR_DCL_POOLS[pairKeyB] || [];
    const poolIdsList = Array.isArray(poolCandidates) ? poolCandidates : [poolCandidates];
    if (poolIdsList.length === 0 || !/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      return { ok: false, isDcl: true, poolIds: [], amountOut: null, minAmountOut: '0', error: t('未找到 DCL 池', 'DCL pool not found') };
    }
    try {
      const results = await Promise.all(
        poolIdsList.map(async (poolId) => {
          const resp = await nearRpcQueryWithFallback(
            {
              jsonrpc: '2.0',
              id: `dcl-quote-${poolId}`,
              method: 'query',
              params: {
                request_type: 'call_function',
                finality: 'final',
                account_id: DCL_CONTRACT_ID,
                method_name: 'quote',
                args_base64: utf8ToBase64(JSON.stringify({
                  pool_ids: [poolId],
                  input_token: inId,
                  output_token: outId,
                  input_amount: amtStr
                }))
              }
            },
            5000,
            signal
          ).catch(() => null);
          const bytes = resp && resp.ok && resp.data && resp.data.result && resp.data.result.result;
          if (!Array.isArray(bytes)) return null;
          const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
          const outAmt = parsed && parsed.amount !== undefined ? String(parsed.amount) : '0';
          if (!/^\d+$/.test(outAmt) || BigInt(outAmt) <= 0n) return null;
          return { poolId, outAmt, outBig: BigInt(outAmt) };
        })
      );
      const valid = results.filter(Boolean).sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
      if (valid.length === 0) {
        return { ok: false, isDcl: true, poolIds: [poolIdsList[0]], amountOut: null, minAmountOut: '0', error: t('DCL 池深度不足', 'Insufficient DCL liquidity') };
      }
      const best = valid[0];
      const outAmt = best.outAmt;
      const bps = Math.max(1, Math.min(5000, Number(slippageBps) || 100));
      const minAmountOut = ((BigInt(outAmt) * BigInt(10000 - bps)) / 10000n).toString();
      return {
        ok: true,
        isDcl: true,
        dclContract: DCL_CONTRACT_ID,
        poolIds: [best.poolId],
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
        poolIds: [poolIdsList[0]],
        amountOut: null,
        minAmountOut: '0',
        error: err && err.message ? err.message : t('DCL 询价失败', 'DCL quote failed')
      };
    }
  }

  /**
   * Generates a 1Click cross-chain deposit address for bridging external assets (e.g. Quantus QTC) into NEAR.
   */
  async function requestCrossChainDepositAddress({
    originAsset = QTC_ORIGIN_ASSET_ID,
    destinationAsset = QTC_NEAR_ASSET_ID,
    amountRaw = '1000000000000',
    nearAccountId
  } = {}) {
    const nearAcct = String(nearAccountId || '').trim();
    if (!nearAcct) {
      return { ok: false, depositAddress: null, deadline: null, minAmountInFormatted: null, error: t('缺少 NEAR 收款账户', 'Missing nearAccountId') };
    }
    try {
      const body = {
        dry: false,
        swapType: 'EXACT_INPUT',
        slippageTolerance: 100,
        originAsset,
        depositType: 'ORIGIN_CHAIN',
        destinationAsset,
        amount: String(amountRaw),
        refundTo: nearAcct,
        refundType: 'INTENTS',
        recipient: nearAcct,
        recipientType: 'DESTINATION_CHAIN',
        deadline: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        referral: DEFAULT_REFERRAL_ACCOUNT
      };
      const resp = await fetchJsonWithTimeout(
        `${ONECLICK_API_URL}/quote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        },
        DEFAULT_TIMEOUT_MS
      );
      const data = resp.data || {};
      const q = data.quote || {};
      const depositAddress = q.depositAddress || data.depositAddress || null;
      if (resp.ok && depositAddress) {
        return {
          ok: true,
          depositAddress,
          deadline: q.deadline || body.deadline,
          minAmountInFormatted: q.minAmountInFormatted || q.amountInFormatted || fromBaseUnits(q.minAmountIn || amountRaw, resolveTokenDecimals(originAsset)),
          amountInFormatted: q.amountInFormatted || null,
          amountOutFormatted: q.amountOutFormatted || null,
          error: null
        };
      }
      const errMsg = data.message || data.error || `HTTP ${resp.status || 'ERR'}`;
      return { ok: false, depositAddress: null, deadline: null, minAmountInFormatted: null, error: String(errMsg) };
    } catch (err) {
      return {
        ok: false,
        depositAddress: null,
        deadline: null,
        minAmountInFormatted: null,
        error: err && err.message ? err.message : t('获取跨链收款地址失败', 'Failed to obtain cross-chain deposit address')
      };
    }
  }

  function isPrlAssetId(assetId) {
    const low = String(assetId || '').trim().toLowerCase();
    return low === PRL_PEARL_ASSET_ID || low === PRL_NEAR_ASSET_ID || low === PRL_NEAR_CONTRACT;
  }

  function extractNearTokenContract(assetId) {
    const s = String(assetId || '').trim();
    const low = s.toLowerCase();
    if (low === PRL_PEARL_ASSET_ID || low === PRL_NEAR_ASSET_ID || low === PRL_NEAR_CONTRACT) {
      return PRL_NEAR_CONTRACT;
    }
    if (low === 'nep141:wrap.near' || low === 'wrap.near' || low === 'near') return 'wrap.near';
    if (low === 'nep141:usdt.tether-token.near' || low === 'usdt.tether-token.near') return 'usdt.tether-token.near';
    if (low === NEAR_USDC_ASSET_ID || low === NEAR_USDC_CONTRACT) return NEAR_USDC_CONTRACT;
    if (s.startsWith('1cs_v1:near:nep141:')) return s.slice('1cs_v1:near:nep141:'.length);
    if (low.startsWith('nep141:')) {
      const inner = s.slice('nep141:'.length);
      if (inner && !inner.toLowerCase().endsWith('.omft.near') && !inner.toLowerCase().endsWith('.omdep.near')) {
        return inner;
      }
    }
    return null;
  }

  async function quoteRefSmartRouterPath({ tokenIn, tokenOut, amountRaw, slippageBps = 100, signal = null } = {}) {
    const slippageDec = (Math.max(1, Number(slippageBps) || 100) / 10000).toFixed(4);
    const url = `${REF_SMART_ROUTER_URL}?amountIn=${encodeURIComponent(String(amountRaw))}&tokenIn=${encodeURIComponent(tokenIn)}&tokenOut=${encodeURIComponent(tokenOut)}&pathDeep=3&slippage=${slippageDec}`;
    const resp = await fetchJsonWithTimeout(url, signal ? { signal } : {}, 5500).catch(() => null);
    const data = resp && resp.ok ? resp.data : null;
    const rData = data && Number(data.result_code) === 0 ? data.result_data : null;
    const routes = rData && Array.isArray(rData.routes) ? rData.routes : [];
    const amountOut = rData && rData.amount_out ? String(rData.amount_out) : '0';
    if (!rData || routes.length === 0 || !/^\d+$/.test(amountOut) || BigInt(amountOut) <= 0n) {
      const dclQ = await quoteNearDclPoolSwap({ tokenIn, tokenOut, amountRaw, slippageBps, signal });
      if (dclQ.ok) return dclQ;
      return { ok: false, amountOut: null, actions: [], routeData: null, error: (data && data.result_message) || t('Ref 流动性路由不可用', 'Ref Finance route unavailable') };
    }
    const actions = [];
    for (const route of routes) {
      for (const p of (route.pools || [])) {
        if (p.pool_id === undefined || !p.token_in || !p.token_out) continue;
        const act = {
          pool_id: Number(p.pool_id),
          token_in: String(p.token_in),
          token_out: String(p.token_out),
          min_amount_out: String(p.min_amount_out || '0')
        };
        if (p.amount_in && String(p.amount_in) !== '0') act.amount_in = String(p.amount_in);
        actions.push(act);
      }
    }
    if (actions.length === 0) {
      const dclQ = await quoteNearDclPoolSwap({ tokenIn, tokenOut, amountRaw, slippageBps, signal });
      if (dclQ.ok) return dclQ;
    }
    return {
      ok: actions.length > 0,
      amountOut,
      minAmountOut: String(routes[0]?.min_amount_out || '0'),
      serviceFeeBps: 0,
      actions,
      routeData: rData,
      error: null
    };
  }

  function resolveOneClickAssetId(tokenOrAssetId, blockchainHint = '') {
    const isObj = tokenOrAssetId && typeof tokenOrAssetId === 'object';
    const rawId = String(isObj ? (tokenOrAssetId.assetId || '') : (tokenOrAssetId || '')).trim();
    if (/^(nep141:|nep245:|1cs_v1:)/i.test(rawId)) return rawId;

    const bc = String(blockchainHint || (isObj ? tokenOrAssetId.blockchain : '') || '').trim().toLowerCase();
    const contractRaw = String(isObj ? (tokenOrAssetId.contractAddress || rawId) : rawId).trim().toLowerCase();
    const symUpper = String(isObj ? (tokenOrAssetId.symbol || '') : '').trim().replace(/^\$/, '').toUpperCase();
    const isNativeSentinel = contractRaw === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      || contractRaw === 'sol1111111111111111111111111111111111111111'
      || contractRaw === 'so11111111111111111111111111111111111111112'
      || contractRaw.includes(':native:')
      || ((contractRaw === '' || contractRaw === 'native') && ['ETH', 'BNB', 'POL', 'MATIC', 'AVAX', 'OP', 'SOL', 'NEAR', 'HYPE'].includes(symUpper));

    const registry = getTokenRegistry();
    const pools = [];
    if (Array.isArray(_cachedDefuseTokens) && _cachedDefuseTokens.length > 0) pools.push(_cachedDefuseTokens);
    if (registry) {
      if (Array.isArray(registry.LIVE_DEFUSE_TOKENS)) pools.push(registry.LIVE_DEFUSE_TOKENS);
      if (Array.isArray(registry.UNIFIED_CORE_TOKENS)) pools.push(registry.UNIFIED_CORE_TOKENS);
    }

    for (const list of pools) {
      for (const item of list) {
        if (!item || !/^(nep141:|nep245:|1cs_v1:)/i.test(String(item.assetId || ''))) continue;
        const itemBc = String(item.blockchain || '').toLowerCase();
        if (bc && itemBc !== bc) continue;
        const itemContract = String(item.contractAddress || '').trim().toLowerCase();
        if (contractRaw && !isNativeSentinel && itemContract && itemContract === contractRaw) {
          return item.assetId;
        }
      }
    }

    if (bc && symUpper) {
      for (const list of pools) {
        for (const item of list) {
          if (!item || !/^(nep141:|nep245:|1cs_v1:)/i.test(String(item.assetId || ''))) continue;
          if (String(item.blockchain || '').toLowerCase() !== bc) continue;
          if (String(item.symbol || '').trim().toUpperCase() === symUpper) {
            return item.assetId;
          }
        }
      }
    }

    if (isNativeSentinel && bc && typeof EVM_NATIVE_1CLICK_MAP !== 'undefined' && EVM_NATIVE_1CLICK_MAP[bc]) {
      return EVM_NATIVE_1CLICK_MAP[bc];
    }

    return rawId;
  }

