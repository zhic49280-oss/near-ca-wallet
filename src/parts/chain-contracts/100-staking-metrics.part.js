  // ==================== On-Chain Staking (Meta Pool / Jito / Lido) ====================

  function findStakingPool(poolId) {
    const key = String(poolId || '').toLowerCase().trim();
    if (!key) return null;
    if (key === 'near' || key === 'metapool' || key === 'meta-pool' || key === 'stnear') {
      return STAKING_POOLS.find((p) => p.id === 'metapool_stnear') || STAKING_POOLS[0];
    }
    if (key === 'jito' || key === 'sol' || key === 'jitosol') {
      return STAKING_POOLS.find((p) => p.id === 'jito_sol') || null;
    }
    if (key === 'lido' || key === 'eth' || key === 'steth') {
      return STAKING_POOLS.find((p) => p.id === 'lido_steth') || null;
    }
    return STAKING_POOLS.find((p) => p.id === key || (Array.isArray(p.legacyIds) && p.legacyIds.includes(key))) || null;
  }

  async function ethReadCall(chainKey, to, data, timeoutMs = 6000) {
    const key = String(chainKey || '').toLowerCase();
    const chain = EVM_CHAINS[key];
    if (!chain || !to || !data) return null;
    const res = await callEvmRpc(
      key,
      {
        jsonrpc: '2.0',
        id: `eth_call_${chain.chainId}`,
        method: 'eth_call',
        params: [{ to, data }, 'latest']
      },
      timeoutMs
    ).catch(() => null);
    const hex = res && typeof res.result === 'string' ? res.result : null;
    return hex && hex !== '0x' ? hex : null;
  }

  let _llamaPoolsCache = { ts: 0, data: null };
  let _stakingMetricsCache = { ts: 0, pools: null };
  let _stakingMetricsInFlight = null;

  const RELEVANT_LLAMA_PROJECTS = new Set([
    'rhea-lst',
    'jito-liquid-staking',
    'jupiter-staked-sol',
    'marinade-liquid-staking',
    'sanctum-infinity',
    'lido',
    'aave-v3',
    'ethena-usde',
    'kinetiq-khype'
  ]);

  function filterAndSortLlamaPools(rawPools) {
    if (!Array.isArray(rawPools)) return [];
    const filtered = [];
    for (let i = 0; i < rawPools.length; i++) {
      const p = rawPools[i];
      if (!p) continue;
      const proj = String(p.project || '').toLowerCase();
      const ch = String(p.chain || '').toLowerCase();
      if (
        RELEVANT_LLAMA_PROJECTS.has(proj) ||
        ch === 'near' ||
        ch === 'arc' ||
        proj.includes('burrow') ||
        proj.includes('rhea-lend')
      ) {
        filtered.push(p);
      }
    }
    filtered.sort((a, b) => Number(b.tvlUsd || 0) - Number(a.tvlUsd || 0));
    return filtered;
  }

  /**
   * Fetches live APY and conversion rates across all staking/lending pools from real RPCs and protocol APIs.
   * Never populates fake values: keeps apy/rate as null when an upstream feed is unreachable.
   */
  async function fetchLiveStakingMetrics(opts = {}) {
    if (opts && opts.useCache === true && _stakingMetricsCache.pools && (Date.now() - _stakingMetricsCache.ts < 300_000)) {
      return _stakingMetricsCache.pools;
    }
    if (_stakingMetricsInFlight) {
      return _stakingMetricsInFlight;
    }
    _stakingMetricsInFlight = _runFetchLiveStakingMetrics(opts).finally(() => {
      _stakingMetricsInFlight = null;
    });
    return _stakingMetricsInFlight;
  }

  async function _runFetchLiveStakingMetrics(opts = {}) {
    const setPool = (id, patch) => {
      const target = findStakingPool(id);
      if (target && patch && typeof patch === 'object') {
        Object.assign(target, patch);
      }
    };

    const formatCompactNum = (val) => {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) return null;
      const lang = getConfiguredLang();
      if (lang === 'en') {
        if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
        if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
        if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
        return Math.round(n).toLocaleString('en-US');
      }
      if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
      if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('en-US')}万`;
      return Math.round(n).toLocaleString('en-US');
    };
    const formatTvlToken = (tokenAmt, sym, usdAmt = null) => {
      const cTok = formatCompactNum(tokenAmt);
      if (!cTok) return null;
      const cUsd = usdAmt > 0 ? formatCompactNum(usdAmt) : null;
      return cUsd ? `${cTok} ${sym} ($${cUsd})` : `${cTok} ${sym}`;
    };

    const useCachedLlama = Boolean(opts && opts.useCache === true && Array.isArray(_llamaPoolsCache.data) && (Date.now() - _llamaPoolsCache.ts < 900_000));
    const llamaPromise = useCachedLlama
      ? Promise.resolve({ data: _llamaPoolsCache.data })
      : fetchJsonWithTimeout('https://yields.llama.fi/pools', {}, 7000);
    const runTasksWithLimit = async (taskFns, limit = 6) => {
      const results = new Array(taskFns.length);
      let cursor = 0;
      const worker = async () => {
        while (cursor < taskFns.length) {
          const i = cursor++;
          try {
            results[i] = { status: 'fulfilled', value: await taskFns[i]() };
          } catch (reason) {
            results[i] = { status: 'rejected', reason };
          }
        }
      };
      const workers = Array.from({ length: Math.min(limit, taskFns.length) }, () => worker());
      await Promise.all(workers);
      return results;
    };

    const fastTaskFns = [
      () => fetchJsonWithTimeout('https://validators.narwallets.com/metrics_json', {}, 6000),
      () => viewNearContractCall('lst.rhealab.near', 'get_summary', {}),
      () => viewNearContractCall('lst.rhealab.near', 'get_number_of_accounts', {}),
      () => fetchJsonWithTimeout('https://api.ref.finance/get-rnear-apy', {}, 6000),
      () => viewNearContractCall('xtoken.rhealab.near', 'get_virtual_price', {}),
      () => viewNearContractCall('xtoken.rhealab.near', 'contract_metadata', {}),
      () => viewNearContractCall('orhea-conv.rhealab.near', 'get_conversion_strategy_infos', {}),
      () => viewNearContractCall('orhea-conv.rhealab.near', 'get_converted_source_token_amounts', {}),
      () => viewNearContractCall('orhea-conv.rhealab.near', 'get_accounts_count', {}),
      () => viewNearContractCall('meta-pool.near', 'get_contract_state', {}),
      () => viewNearContractCall('linear-protocol.near', 'get_summary', {}),
      () => viewNearContractCall('linear-protocol.near', 'get_number_of_accounts', {}),
      () => viewNearContractCall('v2-nearx.stader-labs.near', 'get_nearx_price', {}),
      () => viewNearContractCall('v2-nearx.stader-labs.near', 'get_total_staked_balance', {}),
      () => viewNearContractCall('v2-nearx.stader-labs.near', 'get_number_of_accounts', {}),
      () => fetchJsonWithTimeout('https://extra-api.sanctum.so/v1/sol-value/current?lst=INF&lst=jupSOL&lst=mSOL&lst=JitoSOL', {}, 6000),
      () => fetchJsonWithTimeout('https://kobe.mainnet.jito.network/api/v1/stake_pool_stats', {}, 6000),
      () => fetchJsonWithTimeout(
        `${JUPITER_API_URL}/quote?inputMint=${WSOL_MINT}&outputMint=J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn&amount=1000000000&slippageBps=50`,
        {},
        6000
      ),
      () => Promise.race([
        callSolanaRpc('getAccountInfo', ['CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN', { encoding: 'base64' }], 4000),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000))
      ]),
      () => fetchJsonWithTimeout(
        'https://datapi.jup.ag/v1/assets/search?query=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v,J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn,mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So,5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm',
        {},
        6000
      ),
      () => fetchJsonWithTimeout('https://api.marinade.finance/msol/apy/30d', {}, 6000),
      () => fetchJsonWithTimeout('https://eth-api.lido.fi/v1/protocol/steth/apr/sma', {}, 6000),
      () => ethReadCall('arc', '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', '0xef8b30f700000000000000000000000000000000000000000000000000000000000f4240'),
      () => ethReadCall('eth', '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', '0x07a2d13a0000000000000000000000000000000000000000000000000de0b6b3a7640000'),
      () => fetchJsonWithTimeout(
        'https://aggregator-api.kyberswap.com/hyperevm/api/v1/routes?tokenIn=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&tokenOut=0xfD739d4e423301CE9385c1fb8850539D657C296D&amountIn=1000000000000000000',
        {},
        6000
      ),
      () => fetchJsonWithTimeout('https://eth.blockscout.com/api/v2/tokens/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', {}, 6000),
      () => fetchJsonWithTimeout('https://eth.blockscout.com/api/v2/tokens/0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', {}, 6000),
      () => ethReadCall('eth', '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', '0x01e1d114'),
      () => fetchJsonWithTimeout('https://api.geckoterminal.com/api/v2/networks/base/tokens/0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB/info', {}, 6000),
      () => ethReadCall('base', '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', '0x18160ddd'),
      () => ethReadCall('arc', '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', '0x01e1d114'),
      () => ethReadCall('hype', '0xfD739d4e423301CE9385c1fb8850539D657C296D', '0x18160ddd'),
      () => viewNearContractCall('contract.main.burrow.near', 'get_asset', { token_id: 'wrap.near' }),
      () => viewNearContractCall('contract.main.burrow.near', 'get_asset', { token_id: 'usdt.tether-token.near' }),
      () => viewNearContractCall('contract.main.burrow.near', 'get_num_accounts', {}),
      () => fetchJsonWithTimeout('https://eth.blockscout.com/api/v2/tokens/0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', {}, 6000),
      () => fetchJsonWithTimeout('https://eth.blockscout.com/api/v2/tokens/0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', {}, 6000),
      () => fetchJsonWithTimeout('https://api.geckoterminal.com/api/v2/networks/arbitrum/tokens/0x724dc807b04555b71ed48a6896b6f41593b8c637/info', {}, 6000),
      () => fetchJsonWithTimeout('https://api.geckoterminal.com/api/v2/networks/hyperevm/tokens/0xfd739d4e423301ce9385c1fb8850539d657c296d/info', {}, 6000),
      () => fetchJsonWithTimeout('https://explorer.arc.io/api/v2/tokens/0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', {}, 5000)
    ];

    const fastResults = await runTasksWithLimit(fastTaskFns, 6);
    const [
      narRes,
      rnearSummaryRes,
      rnearAccountsRes,
      rnearApyRes,
      xrheaVpRes,
      xrheaMetaRes,
      orheaStratRes,
      orheaAmountsRes,
      orheaAccountsRes,
      metapoolStateRes,
      linearSummaryRes,
      linearAccountsRes,
      staderPriceRes,
      staderTotalRes,
      staderAccountsRes,
      sanctumValRes,
      jitoApyRes,
      jitoRateRes,
      jupLockerRes,
      jupAssetsRes,
      marinadeApyRes,
      lidoRes,
      arcSteakPreviewRes,
      ethSusdeAssetsRes,
      hyperKhypeRes,
      lidoBlockscoutRes,
      susdeBlockscoutRes,
      susdeTotalAssetsRes,
      aaveBaseInfoRes,
      aaveBaseSupplyRes,
      arcSteakAssetsRes,
      khypeSupplyRes,
      burrowWnearRes,
      burrowUsdtRes,
      burrowAccountsRes,
      aaveEthUsdcInfoRes,
      aaveEthWethInfoRes,
      aaveArbUsdcInfoRes,
      khypeInfoRes,
      arcSteakInfoRes
    ] = fastResults;

    // If caller wants early render, notify once NEAR/Jito/Marinade/Blockscout RPCs are in while DeFiLlama finishes in parallel
    let earlyLlama = null;
    if (opts && typeof opts.onFastUpdate === 'function') {
      const probe = await Promise.race([
        llamaPromise.then((v) => ({ done: true, value: v })).catch(() => ({ done: true, value: null })),
        new Promise((resolve) => setTimeout(() => resolve({ done: false, value: null }), 120))
      ]);
      if (probe && probe.done) {
        earlyLlama = probe.value;
      } else {
        // Apply fast NEAR/Solana/Lido metrics first so UI shows numbers without waiting 4s for DeFiLlama JSON
        try {
          if (narRes.status === 'fulfilled' && narRes.value) {
            const m = narRes.value;
            const apy = Number(m.st_near_30_day_apy || m.st_near_7_day_apy);
            const price = Number(m.st_near_price);
            if (Number.isFinite(apy) && apy > 0) setPool('metapool_stnear', { apy: Number(apy.toFixed(2)) });
            if (Number.isFinite(price) && price > 0) setPool('metapool_stnear', { rate: 1 / price });
            const linApy = Number(m.linear_30_day_apy || m.linear_3_day_apy);
            if (Number.isFinite(linApy) && linApy > 0) setPool('linear_near', { apy: Number(linApy.toFixed(2)) });
          }
          if (rnearApyRes.status === 'fulfilled' && rnearApyRes.value && rnearApyRes.value.data !== undefined) {
            const num = Number(rnearApyRes.value.data);
            if (Number.isFinite(num) && num > 0) setPool('rhea_rnear', { apy: Number(num.toFixed(2)) });
          }
          if (jitoApyRes.status === 'fulfilled' && jitoApyRes.value && Array.isArray(jitoApyRes.value.apy) && jitoApyRes.value.apy.length > 0) {
            const latestApy = Number(jitoApyRes.value.apy[jitoApyRes.value.apy.length - 1].data) * 100;
            if (Number.isFinite(latestApy) && latestApy > 0 && latestApy < 50) {
              setPool('jito_sol', { apy: Number(latestApy.toFixed(2)) });
            }
          }
          opts.onFastUpdate(STAKING_POOLS);
        } catch (_) {}
      }
    }

    let llamaPools = [];
    try {
      const llamaRaw = earlyLlama || (await llamaPromise);
      if (llamaRaw && Array.isArray(llamaRaw.data)) {
        llamaPools = useCachedLlama ? llamaRaw.data : filterAndSortLlamaPools(llamaRaw.data);
      }
    } catch (_) {
      llamaPools = [];
    }
    if (!useCachedLlama && llamaPools.length > 0) {
      _llamaPoolsCache = { ts: Date.now(), data: llamaPools };
    }
    const findLlamaPool = (predicate) => {
      for (let i = 0; i < llamaPools.length; i++) {
        const p = llamaPools[i];
        if (p && predicate(p)) return p; // already sorted descending by tvlUsd
      }
      return null;
    };
    const findLlamaApy = (predicate) => {
      const top = findLlamaPool((p) => typeof p.apy === 'number' && Number.isFinite(p.apy) && p.apy > 0 && predicate(p));
      return top ? Number(Number(top.apy).toFixed(2)) : null;
    };
    const findLlamaTvlUsd = (predicate) => {
      const top = findLlamaPool((p) => typeof p.tvlUsd === 'number' && Number.isFinite(p.tvlUsd) && p.tvlUsd > 0 && predicate(p));
      return top ? Number(top.tvlUsd) : null;
    };
    const findLlamaTvlText = (predicate) => {
      const top = findLlamaPool((p) => typeof p.tvlUsd === 'number' && Number.isFinite(p.tvlUsd) && p.tvlUsd > 0 && predicate(p));
      if (!top) return null;
      const c = formatCompactNum(top.tvlUsd);
      return c ? `$${c}` : null;
    };

    // 1. Rhea Liquid Staking (NEAR -> rNEAR, lst.rhealab.near)
    if (rnearSummaryRes.status === 'fulfilled' && rnearSummaryRes.value) {
      const sum = rnearSummaryRes.value;
      if (sum.ft_price) {
        try {
          const ftPrice = Number(BigInt(String(sum.ft_price)) / 10n ** 12n) / 1e12;
          if (Number.isFinite(ftPrice) && ftPrice > 0) setPool('rhea_rnear', { rate: 1 / ftPrice });
        } catch (_) {}
      }
      if (sum.total_staked_near_amount) {
        try {
          const stakedNear = Number(BigInt(String(sum.total_staked_near_amount)) / 10n ** 18n) / 1e6;
          const tvlText = formatTvlToken(stakedNear, 'NEAR');
          if (tvlText) setPool('rhea_rnear', { tvlText, tvlTokenAmount: stakedNear });
        } catch (_) {}
      }
    }
    if (rnearAccountsRes.status === 'fulfilled' && Number(rnearAccountsRes.value) > 0) {
      setPool('rhea_rnear', { stakersCount: Number(rnearAccountsRes.value) });
    }
    let rnearApy = null;
    if (rnearApyRes.status === 'fulfilled' && rnearApyRes.value && rnearApyRes.value.data !== undefined) {
      const num = Number(rnearApyRes.value.data);
      if (Number.isFinite(num) && num > 0) rnearApy = Number(num.toFixed(2));
    }
    if (rnearApy === null) {
      rnearApy = findLlamaApy((p) => p.project === 'rhea-lst' && String(p.symbol || '').toUpperCase() === 'RNEAR');
    }
    if (rnearApy !== null) setPool('rhea_rnear', { apy: rnearApy });

    // 2. Rhea xRHEA Staking (RHEA -> xRHEA, xtoken.rhealab.near)
    if (xrheaVpRes.status === 'fulfilled' && xrheaVpRes.value !== null && xrheaVpRes.value !== undefined) {
      const vpNum = Number(xrheaVpRes.value);
      if (Number.isFinite(vpNum) && vpNum > 0) {
        const priceRheaPerXrhea = vpNum / 1e8;
        setPool('rhea_xrhea', { rate: 1 / priceRheaPerXrhea });
      }
    }
    let xrheaApy = null;
    if (xrheaMetaRes.status === 'fulfilled' && xrheaMetaRes.value) {
      const cm = xrheaMetaRes.value;
      const rps = Number(cm.reward_per_sec);
      const locked = Number(cm.cur_locked_token_amount || cm.locked_token_amount);
      if (Number.isFinite(rps) && rps > 0 && Number.isFinite(locked) && locked > 0) {
        const calc = ((rps * 31536000) / locked) * 100;
        if (Number.isFinite(calc) && calc > 0 && calc < 500) xrheaApy = Number(calc.toFixed(2));
      }
      if (cm.cur_locked_token_amount || cm.locked_token_amount) {
        try {
          const lockedRhea = Number(BigInt(String(cm.cur_locked_token_amount || cm.locked_token_amount)) / 10n ** 12n) / 1e6;
          const tvlText = formatTvlToken(lockedRhea, 'RHEA');
          if (tvlText) setPool('rhea_xrhea', { tvlText, tvlTokenAmount: lockedRhea });
        } catch (_) {}
      }
      if (Number(cm.current_account_num) > 0) {
        setPool('rhea_xrhea', { stakersCount: Number(cm.current_account_num) });
      }
    }
    if (xrheaApy === null) {
      xrheaApy = findLlamaApy((p) => p.project === 'rhea-lst' && String(p.symbol || '').toUpperCase() === 'XRHEA');
    }
    if (xrheaApy !== null) setPool('rhea_xrhea', { apy: xrheaApy });

    // 3. Rhea oRHEA Convert (orhea-conv.rhealab.near)
    if (orheaStratRes.status === 'fulfilled' && orheaStratRes.value && typeof orheaStratRes.value === 'object') {
      const tiers = [];
      for (const [kStr, v] of Object.entries(orheaStratRes.value)) {
        try {
          const parsedKey = JSON.parse(kStr);
          const days = Number(parsedKey?.Oneshot?.lock_period_days);
          const rateBig = v && v.conversion_rate ? BigInt(String(v.conversion_rate)) : 0n;
          const rateVal = Number(rateBig / 10n ** 26n) / 10000;
          if (Number.isFinite(days) && days > 0 && Number.isFinite(rateVal) && rateVal > 0) {
            tiers.push({ days, rate: rateVal });
          }
        } catch (_) {}
      }
      if (tiers.length > 0) {
        tiers.sort((a, b) => a.days - b.days);
        const minR = tiers[0].rate;
        const maxR = tiers[tiers.length - 1].rate;
        setPool('rhea_orhea_convert', {
          lockTiers: tiers,
          rate: maxR,
          rateRangeText: `${minR.toFixed(2)} ~ ${maxR.toFixed(2)} RHEA`,
          apy: null
        });
      }
    }
    if (orheaAmountsRes.status === 'fulfilled' && orheaAmountsRes.value && orheaAmountsRes.value['otoken.rhealab.near']) {
      try {
        const amtOrhea = Number(BigInt(String(orheaAmountsRes.value['otoken.rhealab.near'])) / 10n ** 12n) / 1e6;
        const tvlText = formatTvlToken(amtOrhea, 'oRHEA');
        if (tvlText) setPool('rhea_orhea_convert', { tvlText, tvlTokenAmount: amtOrhea });
      } catch (_) {}
    }
    if (orheaAccountsRes.status === 'fulfilled' && Number(orheaAccountsRes.value) > 0) {
      setPool('rhea_orhea_convert', { stakersCount: Number(orheaAccountsRes.value) });
    }

    // 4 & 5. Meta Pool (stNEAR) & LiNEAR
    if (narRes.status === 'fulfilled' && narRes.value) {
      const m = narRes.value;
      const apy = Number(m.st_near_30_day_apy || m.st_near_7_day_apy);
      const price = Number(m.st_near_price);
      if (Number.isFinite(apy) && apy > 0) setPool('metapool_stnear', { apy: Number(apy.toFixed(2)) });
      if (Number.isFinite(price) && price > 0) setPool('metapool_stnear', { rate: 1 / price });
      const linApy = Number(m.linear_30_day_apy || m.linear_3_day_apy);
      if (Number.isFinite(linApy) && linApy > 0) setPool('linear_near', { apy: Number(linApy.toFixed(2)) });
    }
    if (metapoolStateRes.status === 'fulfilled' && metapoolStateRes.value) {
      const ms = metapoolStateRes.value;
      if (ms.total_for_staking) {
        try {
          const staked = Number(BigInt(String(ms.total_for_staking)) / 10n ** 18n) / 1e6;
          const tvlText = formatTvlToken(staked, 'NEAR');
          if (tvlText) setPool('metapool_stnear', { tvlText, tvlTokenAmount: staked });
        } catch (_) {}
      }
      if (Number(ms.accounts_count) > 0) {
        setPool('metapool_stnear', { stakersCount: Number(ms.accounts_count) });
      }
    }
    if (linearSummaryRes.status === 'fulfilled' && linearSummaryRes.value) {
      const ls = linearSummaryRes.value;
      if (ls.ft_price) {
        try {
          const p = Number(BigInt(String(ls.ft_price)) / 10n ** 12n) / 1e12;
          if (Number.isFinite(p) && p > 0) setPool('linear_near', { rate: 1 / p });
        } catch (_) {}
      }
      if (ls.total_staked_near_amount) {
        try {
          const staked = Number(BigInt(String(ls.total_staked_near_amount)) / 10n ** 18n) / 1e6;
          const tvlText = formatTvlToken(staked, 'NEAR');
          if (tvlText) setPool('linear_near', { tvlText, tvlTokenAmount: staked });
        } catch (_) {}
      }
    }
    if (linearAccountsRes.status === 'fulfilled' && Number(linearAccountsRes.value) > 0) {
      setPool('linear_near', { stakersCount: Number(linearAccountsRes.value) });
    }

    // 6. Stader NearX
    if (staderPriceRes.status === 'fulfilled' && staderPriceRes.value) {
      try {
        const p = Number(BigInt(String(staderPriceRes.value)) / 10n ** 12n) / 1e12;
        if (Number.isFinite(p) && p > 0) setPool('stader_nearx', { rate: 1 / p });
      } catch (_) {}
    }
    if (staderTotalRes.status === 'fulfilled' && staderTotalRes.value) {
      try {
        const staked = Number(BigInt(String(staderTotalRes.value)) / 10n ** 18n) / 1e6;
        const tvlText = formatTvlToken(staked, 'NEAR');
        if (tvlText) setPool('stader_nearx', { tvlText, tvlTokenAmount: staked });
      } catch (_) {}
    }
    if (staderAccountsRes.status === 'fulfilled' && Number(staderAccountsRes.value) > 0) {
      setPool('stader_nearx', { stakersCount: Number(staderAccountsRes.value) });
    }
    const nearxApy = findLlamaApy((p) => String(p.chain || '').toLowerCase() === 'near' && /nearx/i.test(String(p.symbol || '')));
    if (nearxApy !== null) setPool('stader_nearx', { apy: nearxApy });

    // 7-11. Solana LSTs & Jupiter DAO Staking
    const sanctumVals = sanctumValRes.status === 'fulfilled' && sanctumValRes.value && sanctumValRes.value.solValues
      ? sanctumValRes.value.solValues
      : {};
    const setRateFromSanctum = (poolId, symKey) => {
      if (sanctumVals[symKey]) {
        const solPerLst = Number(sanctumVals[symKey]) / 1e9;
        if (Number.isFinite(solPerLst) && solPerLst > 0) setPool(poolId, { rate: 1 / solPerLst });
      }
    };
    setRateFromSanctum('jito_sol', 'JitoSOL');
    setRateFromSanctum('jupiter_sol', 'jupSOL');
    setRateFromSanctum('marinade_msol', 'mSOL');
    setRateFromSanctum('sanctum_inf', 'INF');

    if (jitoApyRes.status === 'fulfilled' && jitoApyRes.value && Array.isArray(jitoApyRes.value.apy) && jitoApyRes.value.apy.length > 0) {
      const latestApy = Number(jitoApyRes.value.apy[jitoApyRes.value.apy.length - 1].data) * 100;
      if (Number.isFinite(latestApy) && latestApy > 0 && latestApy < 50) {
        setPool('jito_sol', { apy: Number(latestApy.toFixed(2)) });
      }
    }
    if (!findStakingPool('jito_sol')?.apy) {
      const jitoLlama = findLlamaApy((p) => p.project === 'jito-liquid-staking' && String(p.symbol || '').toUpperCase() === 'JITOSOL');
      if (jitoLlama !== null) setPool('jito_sol', { apy: jitoLlama });
    }
    if (!findStakingPool('jito_sol')?.rate && jitoRateRes.status === 'fulfilled' && jitoRateRes.value && jitoRateRes.value.outAmount) {
      const r = Number(fromBaseUnits(String(jitoRateRes.value.outAmount), 9));
      if (Number.isFinite(r) && r > 0) setPool('jito_sol', { rate: r });
    }

    // Jupiter DAO Staking (JUP -> Staked JUP) from Solana Locker CVMdMd... offset 73
    // Active Staking Rewards (ASR) official pool: 50M JUP/quarter (200M JUP/yr) allocated by locked JUP share
    if (jupLockerRes.status === 'fulfilled' && jupLockerRes.value && jupLockerRes.value.value?.data?.[0]) {
      try {
        const buf = base64ToBytes(String(jupLockerRes.value.value.data[0]));
        if (buf.length >= 81) {
          const lockedRaw = decodeU64LE(buf, 73);
          const lockedJup = Number(lockedRaw) / 1e6;
          if (Number.isFinite(lockedJup) && lockedJup > 0) {
            const tvlText = formatTvlToken(lockedJup, 'JUP');
            setPool('jupiter_jup', { rate: 1.0, apy: null, isAsrEstimated: false, tvlText, tvlTokenAmount: lockedJup });
          }
        }
      } catch (_) {}
    } else {
      setPool('jupiter_jup', { rate: 1.0, apy: null, isAsrEstimated: false });
    }

    // Solana LST holderCount & TVL (converted to staked SOL quantity via live exchange rate)
    const jupAssets = jupAssetsRes.status === 'fulfilled' && jupAssetsRes.value && Array.isArray(jupAssetsRes.value)
      ? jupAssetsRes.value
      : [];
    const jupAssetPoolMap = {
      JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { id: 'jupiter_jup', sym: 'JUP', stakersOnly: true },
      J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { id: 'jito_sol', sym: 'JitoSOL', solConverted: true },
      jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v: { id: 'jupiter_sol', sym: 'jupSOL', solConverted: true },
      mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { id: 'marinade_msol', sym: 'mSOL', solConverted: true },
      '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': { id: 'sanctum_inf', sym: 'INF', solConverted: true }
    };
    for (const asset of jupAssets) {
      if (!asset) continue;
      const cfg = jupAssetPoolMap[String(asset.id || '')] ||
        Object.values(jupAssetPoolMap).find((c) => c.sym.toLowerCase() === String(asset.symbol || '').toLowerCase());
      if (!cfg) continue;
      const patch = {};
      if (Number(asset.holderCount) > 0) patch.stakersCount = Number(asset.holderCount);
      if (!cfg.stakersOnly && Number(asset.totalSupply) > 0) {
        const poolObj = findStakingPool(cfg.id);
        const solPerLst = sanctumVals[cfg.sym]
          ? Number(sanctumVals[cfg.sym]) / 1e9
          : (poolObj && poolObj.rate > 0 ? 1 / poolObj.rate : 1);
        const stakedAmount = cfg.solConverted && Number.isFinite(solPerLst) && solPerLst > 0
          ? Number(asset.totalSupply) * solPerLst
          : Number(asset.totalSupply);
        const unitLabel = cfg.solConverted ? 'SOL' : cfg.sym;
        const tvlText = formatTvlToken(stakedAmount, unitLabel, Number(asset.mcap || 0));
        if (tvlText) patch.tvlText = tvlText;
      }
      if (Object.keys(patch).length > 0) setPool(cfg.id, patch);
    }

    const jupsolApy = findLlamaApy((p) => p.project === 'jupiter-staked-sol' && String(p.symbol || '').toUpperCase() === 'JUPSOL');
    if (jupsolApy !== null) setPool('jupiter_sol', { apy: jupsolApy });

    let msolApy = null;
    if (marinadeApyRes.status === 'fulfilled' && marinadeApyRes.value) {
      const v = Number(marinadeApyRes.value.value) * 100;
      if (Number.isFinite(v) && v > 0 && v < 50) msolApy = Number(v.toFixed(2));
      const endP = Number(marinadeApyRes.value.end_price);
      if (!findStakingPool('marinade_msol')?.rate && Number.isFinite(endP) && endP > 0) {
        setPool('marinade_msol', { rate: 1 / endP });
      }
    }
    if (msolApy === null) {
      msolApy = findLlamaApy((p) => p.project === 'marinade-liquid-staking' && String(p.symbol || '').toUpperCase() === 'MSOL');
    }
    if (msolApy !== null) setPool('marinade_msol', { apy: msolApy });

    const infApy = findLlamaApy((p) => p.project === 'sanctum-infinity' && String(p.symbol || '').toUpperCase() === 'INF');
    if (infApy !== null) setPool('sanctum_inf', { apy: infApy });

    // 12. Lido Liquid Staking (ETH -> stETH)
    if (lidoRes.status === 'fulfilled' && lidoRes.value && lidoRes.value.data) {
      const data = lidoRes.value.data;
      const aprs = Array.isArray(data.aprs) ? data.aprs : [];
      const latest = Number(data.smaApr !== undefined ? data.smaApr : (aprs.length > 0 ? aprs[aprs.length - 1].apr : NaN));
      if (Number.isFinite(latest) && latest > 0) {
        setPool('lido_steth', { apy: Number(latest.toFixed(2)), rate: 1.0 });
      }
    }
    const lidoUsd = findLlamaTvlUsd((p) => p.project === 'lido' && String(p.symbol || '').toUpperCase() === 'STETH');
    let lidoTvlSet = false;
    if (lidoBlockscoutRes.status === 'fulfilled' && lidoBlockscoutRes.value) {
      const hCount = Number(lidoBlockscoutRes.value?.holders_count || lidoBlockscoutRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('lido_steth', { stakersCount: hCount });
      try {
        const supRaw = lidoBlockscoutRes.value?.total_supply;
        const ethStaked = supRaw ? Number(BigInt(String(supRaw)) / 10n ** 12n) / 1e6 : null;
        if (Number.isFinite(ethStaked) && ethStaked > 0) {
          const tvlText = formatTvlToken(ethStaked, 'ETH', lidoUsd);
          if (tvlText) {
            setPool('lido_steth', { tvlText });
            lidoTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!lidoTvlSet) {
      const lidoTvl = findLlamaTvlText((p) => p.project === 'lido' && String(p.symbol || '').toUpperCase() === 'STETH');
      if (lidoTvl) setPool('lido_steth', { tvlText: lidoTvl });
    }

    // 13. Arc Mainnet Steakhouse Prime USDC (ERC-4626)
    const arcSteakApy = findLlamaApy((p) => String(p.chain || '').toLowerCase() === 'arc' && String(p.symbol || '').toUpperCase() === 'STEAKUSDC');
    if (arcSteakApy !== null) setPool('arc_steak_usdc', { apy: arcSteakApy });
    if (arcSteakInfoRes.status === 'fulfilled' && arcSteakInfoRes.value) {
      const hCount = Number(arcSteakInfoRes.value?.holders_count || arcSteakInfoRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('arc_steak_usdc', { stakersCount: hCount });
    }
    const arcUsd = findLlamaTvlUsd((p) => String(p.chain || '').toLowerCase() === 'arc' && String(p.symbol || '').toUpperCase() === 'STEAKUSDC');
    let arcTvlSet = false;
    if (arcSteakAssetsRes.status === 'fulfilled' && arcSteakAssetsRes.value) {
      try {
        const usdcStaked = Number(BigInt(arcSteakAssetsRes.value)) / 1e6;
        if (Number.isFinite(usdcStaked) && usdcStaked > 0) {
          const tvlText = formatTvlToken(usdcStaked, 'USDC', arcUsd || usdcStaked);
          if (tvlText) {
            setPool('arc_steak_usdc', { tvlText });
            arcTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!arcTvlSet && arcUsd > 0) {
      const tvlText = formatTvlToken(arcUsd, 'USDC', arcUsd);
      if (tvlText) setPool('arc_steak_usdc', { tvlText });
    }
    if (arcSteakPreviewRes.status === 'fulfilled' && arcSteakPreviewRes.value) {
      try {
        const shares = BigInt(arcSteakPreviewRes.value);
        const r = Number(shares / 10n ** 12n) / 1e6;
        if (Number.isFinite(r) && r > 0) setPool('arc_steak_usdc', { rate: r });
      } catch (_) {}
    }

    // 14. Aave V3 Base USDC
    const baseAaveApy = findLlamaApy((p) => String(p.chain || '').toLowerCase() === 'base' && p.project === 'aave-v3' && String(p.symbol || '').toUpperCase() === 'USDC');
    if (baseAaveApy !== null) setPool('aave_base_usdc', { apy: baseAaveApy, rate: 1.0 });
    const baseUsd = findLlamaTvlUsd((p) => String(p.chain || '').toLowerCase() === 'base' && p.project === 'aave-v3' && String(p.symbol || '').toUpperCase() === 'USDC');
    if (aaveBaseInfoRes.status === 'fulfilled' && aaveBaseInfoRes.value) {
      const hCount = Number(aaveBaseInfoRes.value?.data?.attributes?.holders?.count);
      if (Number.isFinite(hCount) && hCount > 0) setPool('aave_base_usdc', { stakersCount: hCount });
    }
    if (baseUsd > 0) {
      const tvlText = formatTvlToken(baseUsd, 'USDC', baseUsd);
      if (tvlText) setPool('aave_base_usdc', { tvlText });
    } else if (aaveBaseSupplyRes.status === 'fulfilled' && aaveBaseSupplyRes.value) {
      try {
        const usdcSupply = Number(BigInt(aaveBaseSupplyRes.value)) / 1e6;
        if (Number.isFinite(usdcSupply) && usdcSupply > 0) {
          const tvlText = formatTvlToken(usdcSupply, 'USDC', usdcSupply);
          if (tvlText) setPool('aave_base_usdc', { tvlText });
        }
      } catch (_) {}
    }

    // 14b. Aave V3 Ethereum USDC
    const ethAaveApy = findLlamaApy((p) => p.chain === 'Ethereum' && p.project === 'aave-v3' && p.symbol === 'USDC');
    if (ethAaveApy !== null) setPool('aave_eth_usdc', { apy: ethAaveApy, rate: 1.0 });
    const ethAaveUsd = findLlamaTvlUsd((p) => p.chain === 'Ethereum' && p.project === 'aave-v3' && p.symbol === 'USDC');
    if (ethAaveUsd > 0) {
      const tvlText = formatTvlToken(ethAaveUsd, 'USDC', ethAaveUsd);
      if (tvlText) setPool('aave_eth_usdc', { tvlText });
    }
    if (aaveEthUsdcInfoRes.status === 'fulfilled' && aaveEthUsdcInfoRes.value) {
      const hCount = Number(aaveEthUsdcInfoRes.value?.holders_count || aaveEthUsdcInfoRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('aave_eth_usdc', { stakersCount: hCount });
    }

    // 14c. Aave V3 Arbitrum USDC
    const arbAaveApy = findLlamaApy((p) => p.chain === 'Arbitrum' && p.project === 'aave-v3' && p.symbol === 'USDC');
    if (arbAaveApy !== null) setPool('aave_arb_usdc', { apy: arbAaveApy, rate: 1.0 });
    const arbAaveUsd = findLlamaTvlUsd((p) => p.chain === 'Arbitrum' && p.project === 'aave-v3' && p.symbol === 'USDC');
    if (arbAaveUsd > 0) {
      const tvlText = formatTvlToken(arbAaveUsd, 'USDC', arbAaveUsd);
      if (tvlText) setPool('aave_arb_usdc', { tvlText });
    }
    if (aaveArbUsdcInfoRes.status === 'fulfilled' && aaveArbUsdcInfoRes.value) {
      const hCount = Number(aaveArbUsdcInfoRes.value?.data?.attributes?.holders?.count || aaveArbUsdcInfoRes.value?.holders_count);
      if (Number.isFinite(hCount) && hCount > 0) setPool('aave_arb_usdc', { stakersCount: hCount });
    }

    // 14d. Aave V3 Ethereum ETH (WETH)
    const ethWethApy = findLlamaApy((p) => p.chain === 'Ethereum' && p.project === 'aave-v3' && String(p.symbol || '').toUpperCase() === 'WETH');
    if (ethWethApy !== null) setPool('aave_eth_weth', { apy: ethWethApy, rate: 1.0 });
    const ethWethUsd = findLlamaTvlUsd((p) => p.chain === 'Ethereum' && p.project === 'aave-v3' && String(p.symbol || '').toUpperCase() === 'WETH');
    let ethWethTvlSet = false;
    if (aaveEthWethInfoRes.status === 'fulfilled' && aaveEthWethInfoRes.value) {
      const hCount = Number(aaveEthWethInfoRes.value?.holders_count || aaveEthWethInfoRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('aave_eth_weth', { stakersCount: hCount });
      try {
        const supRaw = aaveEthWethInfoRes.value?.total_supply;
        const ethSupplied = supRaw ? Number(BigInt(String(supRaw)) / 10n ** 12n) / 1e6 : null;
        if (Number.isFinite(ethSupplied) && ethSupplied > 0) {
          const tvlText = formatTvlToken(ethSupplied, 'ETH', ethWethUsd);
          if (tvlText) {
            setPool('aave_eth_weth', { tvlText });
            ethWethTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!ethWethTvlSet && ethWethUsd > 0) {
      const tvlText = formatLlamaTvlTextOrUsd(ethWethUsd);
      if (tvlText) setPool('aave_eth_weth', { tvlText });
    }
    function formatLlamaTvlTextOrUsd(usdVal) {
      const c = formatCompactNum(usdVal);
      return c ? `$${c}` : null;
    }

    // 14e. Burrow Finance (Rhea Lend) NEAR & USDT
    const burrowAccountsCount = burrowAccountsRes.status === 'fulfilled' && Number(burrowAccountsRes.value) > 0
      ? Number(burrowAccountsRes.value)
      : null;
    const resolveNearPriceFromRegistry = () => {
      try {
        const reg = getTokenRegistry();
        const st = (typeof globalThis !== 'undefined' && (globalThis.NearCAState || globalThis.state)) || null;
        const lists = [
          (st && Array.isArray(st.liveTokens)) ? st.liveTokens : [],
          (reg && Array.isArray(reg.LIVE_DEFUSE_TOKENS)) ? reg.LIVE_DEFUSE_TOKENS : []
        ];
        for (const list of lists) {
          const hit = list.find((t) => t && (String(t.symbol || '').toUpperCase() === 'NEAR' || t.contractAddress === 'wrap.near') && typeof t.price === 'number' && t.price > 0);
          if (hit) return hit.price;
        }
      } catch (_) {}
      return null;
    };
    const nearPriceUsd = resolveNearPriceFromRegistry();
    const applyBurrowAsset = (poolId, rpcRes, baseDec, sym, llamaSyms) => {
      const isBurrowProj = (p) => String(p.chain || '').toLowerCase() === 'near' && /burrow|rhea-lend/i.test(String(p.project || ''));
      const symMatch = (p) => llamaSyms.includes(String(p.symbol || '').toUpperCase());
      let apy = findLlamaApy((p) => isBurrowProj(p) && symMatch(p));
      const llamaUsd = findLlamaTvlUsd((p) => isBurrowProj(p) && symMatch(p));
      const patch = {};
      if (rpcRes.status === 'fulfilled' && rpcRes.value && typeof rpcRes.value === 'object') {
        const asset = rpcRes.value;
        patch.rate = 1.0;
        const rpcApr = Number(asset.supply_apr) * 100;
        if (apy === null && Number.isFinite(rpcApr) && rpcApr > 0) {
          apy = Number(rpcApr.toFixed(2));
        }
        const supBal = asset.supplied && asset.supplied.balance;
        if (supBal) {
          try {
            const totalDec = baseDec + Number(asset.config?.extra_decimals || 0);
            const shift = Math.max(0, totalDec - 6);
            const suppliedAmt = Number(BigInt(String(supBal)) / (10n ** BigInt(shift))) / 1e6;
            if (Number.isFinite(suppliedAmt) && suppliedAmt > 0) {
              patch.tvlTokenAmount = suppliedAmt;
              const isUsdStable = sym === 'USDT' || sym === 'USDC';
              const unitPx = isUsdStable ? 1.0 : (sym === 'NEAR' ? nearPriceUsd : null);
              const computedUsd = (typeof unitPx === 'number' && unitPx > 0) ? suppliedAmt * unitPx : null;
              patch.tvlUsd = computedUsd;
              const tvlText = formatTvlToken(suppliedAmt, sym, computedUsd);
              if (tvlText) patch.tvlText = tvlText;
            }
          } catch (_) {}
        }
      }
      if (!patch.tvlText && llamaUsd > 0) {
        if (sym === 'USDT' || sym === 'USDC') {
          patch.tvlTokenAmount = llamaUsd;
          patch.tvlUsd = llamaUsd;
          const tvlText = formatTvlToken(llamaUsd, sym, llamaUsd);
          if (tvlText) patch.tvlText = tvlText;
        } else {
          patch.tvlUsd = llamaUsd;
          const c = formatCompactNum(llamaUsd);
          if (c) patch.tvlText = `$${c}`;
        }
      }
      if (apy !== null) {
        patch.apy = apy;
        if (!patch.rate) patch.rate = 1.0;
      }
      if (burrowAccountsCount) patch.stakersCount = burrowAccountsCount;
      if (Object.keys(patch).length > 0) setPool(poolId, patch);
    };
    applyBurrowAsset('burrow_near_wnear', burrowWnearRes, 24, 'NEAR', ['WNEAR', 'NEAR']);
    applyBurrowAsset('burrow_near_usdt', burrowUsdtRes, 6, 'USDT', ['USDT']);

    // 15. Ethena sUSDe (ETH ERC-4626)
    const susdeApy = findLlamaApy((p) => p.project === 'ethena-usde' && String(p.symbol || '').toUpperCase() === 'SUSDE');
    if (susdeApy !== null) setPool('ethena_susde', { apy: susdeApy });
    const susdeUsd = findLlamaTvlUsd((p) => p.project === 'ethena-usde' && String(p.symbol || '').toUpperCase() === 'SUSDE');
    if (susdeBlockscoutRes.status === 'fulfilled' && susdeBlockscoutRes.value) {
      const hCount = Number(susdeBlockscoutRes.value?.holders_count || susdeBlockscoutRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('ethena_susde', { stakersCount: hCount });
    }
    let susdeTvlSet = false;
    if (susdeTotalAssetsRes.status === 'fulfilled' && susdeTotalAssetsRes.value) {
      try {
        const usdeStaked = Number(BigInt(susdeTotalAssetsRes.value) / 10n ** 12n) / 1e6;
        if (Number.isFinite(usdeStaked) && usdeStaked > 0) {
          const tvlText = formatTvlToken(usdeStaked, 'USDe', susdeUsd || usdeStaked);
          if (tvlText) {
            setPool('ethena_susde', { tvlText });
            susdeTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!susdeTvlSet && susdeUsd > 0) {
      const tvlText = formatTvlToken(susdeUsd, 'USDe', susdeUsd);
      if (tvlText) setPool('ethena_susde', { tvlText });
    }
    if (ethSusdeAssetsRes.status === 'fulfilled' && ethSusdeAssetsRes.value) {
      try {
        const assetsPerShare = BigInt(ethSusdeAssetsRes.value);
        const num = Number(assetsPerShare / 10n ** 12n) / 1e6;
        if (Number.isFinite(num) && num > 0) setPool('ethena_susde', { rate: 1 / num });
      } catch (_) {}
    }

    // 16. Kinetiq kHYPE (HyperEVM)
    const khypeApy = findLlamaApy((p) => p.project === 'kinetiq-khype' && String(p.symbol || '').toUpperCase() === 'KHYPE');
    if (khypeApy !== null) setPool('hyper_khype', { apy: khypeApy });
    if (khypeInfoRes.status === 'fulfilled' && khypeInfoRes.value) {
      const hCount = Number(khypeInfoRes.value?.data?.attributes?.holders?.count || khypeInfoRes.value?.holders_count);
      if (Number.isFinite(hCount) && hCount > 0) setPool('hyper_khype', { stakersCount: hCount });
    }
    if (hyperKhypeRes.status === 'fulfilled' && hyperKhypeRes.value && hyperKhypeRes.value.data?.routeSummary?.amountOut) {
      const r = Number(fromBaseUnits(String(hyperKhypeRes.value.data.routeSummary.amountOut), 18));
      if (Number.isFinite(r) && r > 0) setPool('hyper_khype', { rate: r });
    }
    const khypeUsd = findLlamaTvlUsd((p) => p.project === 'kinetiq-khype' && String(p.symbol || '').toUpperCase() === 'KHYPE');
    let khypeTvlSet = false;
    if (khypeSupplyRes.status === 'fulfilled' && khypeSupplyRes.value) {
      try {
        const khypeSupply = Number(BigInt(khypeSupplyRes.value) / 10n ** 12n) / 1e6;
        const poolR = findStakingPool('hyper_khype')?.rate;
        const hypeStaked = poolR && poolR > 0 ? (khypeSupply / poolR) : khypeSupply;
        if (Number.isFinite(hypeStaked) && hypeStaked > 0) {
          const tvlText = formatTvlToken(hypeStaked, 'HYPE', khypeUsd);
          if (tvlText) {
            setPool('hyper_khype', { tvlText });
            khypeTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!khypeTvlSet) {
      const khypeTvl = findLlamaTvlText((p) => p.project === 'kinetiq-khype' && String(p.symbol || '').toUpperCase() === 'KHYPE');
      if (khypeTvl) setPool('hyper_khype', { tvlText: khypeTvl });
    }

    _stakingMetricsCache = { ts: Date.now(), pools: STAKING_POOLS };
    return STAKING_POOLS;
  }

