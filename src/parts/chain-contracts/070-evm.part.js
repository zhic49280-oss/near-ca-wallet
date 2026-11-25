  // ==================== EVM RPC & Smart Contract Execution ====================

  function sliceEvmUint256WordHex(hexResult, wordIndex = 0) {
    const clean = String(hexResult || '').replace(/^0x/i, '');
    const start = wordIndex * 64;
    if (clean.length < start + 64) return '0';
    return BigInt('0x' + clean.slice(start, start + 64)).toString();
  }

  function encodeMulticall3Aggregate3(calls = []) {
    const selector = '82ad56cb';
    const count = calls.length;
    const headWords = [
      '0000000000000000000000000000000000000000000000000000000000000020',
      count.toString(16).padStart(64, '0')
    ];
    let elemOffset = count * 32;
    const offsetWords = [];
    const bodyChunks = [];

    for (const c of calls) {
      offsetWords.push(elemOffset.toString(16).padStart(64, '0'));
      const targetHex = String(c.target || '').replace(/^0x/i, '').toLowerCase().padStart(64, '0');
      const allowHex = (c.allowFailure ? 1 : 0).toString(16).padStart(64, '0');
      const dataRelOff = (96).toString(16).padStart(64, '0');
      const dataClean = String(c.callData || '').replace(/^0x/i, '').toLowerCase();
      const dataByteLen = Math.floor(dataClean.length / 2);
      const dataLenHex = dataByteLen.toString(16).padStart(64, '0');
      const paddedLen = Math.ceil(dataClean.length / 64) * 64;
      const dataPadded = dataClean.padEnd(paddedLen, '0');
      const chunk = targetHex + allowHex + dataRelOff + dataLenHex + dataPadded;
      bodyChunks.push(chunk);
      elemOffset += chunk.length / 2;
    }

    return '0x' + selector + headWords.join('') + offsetWords.join('') + bodyChunks.join('');
  }

  function decodeMulticall3Aggregate3Result(hexResult) {
    const clean = String(hexResult || '').replace(/^0x/i, '');
    if (clean.length < 128) return null;
    const readWord = (byteOff) => {
      const start = byteOff * 2;
      if (start + 64 > clean.length) return 0n;
      return BigInt('0x' + clean.slice(start, start + 64));
    };
    const arrOffset = Number(readWord(0));
    const count = Number(readWord(arrOffset));
    if (!Number.isFinite(count) || count < 0 || count > 2000) return null;
    const elemsBase = arrOffset + 32;
    const out = [];
    for (let i = 0; i < count; i++) {
      const rel = Number(readWord(elemsBase + i * 32));
      const elemPos = elemsBase + rel;
      const success = readWord(elemPos) !== 0n;
      const dataRel = Number(readWord(elemPos + 32));
      const dataPos = elemPos + dataRel;
      const dataByteLen = Number(readWord(dataPos));
      const hexStart = (dataPos + 32) * 2;
      const hexEnd = hexStart + dataByteLen * 2;
      const returnData = hexEnd <= clean.length ? ('0x' + clean.slice(hexStart, hexEnd)) : '0x';
      out.push({ success: Boolean(success && dataByteLen > 0), returnData });
    }
    return out;
  }

  async function callEvmRpc(chainKey, payload, timeoutMs = 6000) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) return null;
    const allRpcs = Array.isArray(cfg.rpcs) && cfg.rpcs.length > 0 ? cfg.rpcs : (cfg.rpc ? [cfg.rpc] : []);
    if (allRpcs.length === 0) return null;
    const now = Date.now();
    let active = allRpcs.filter((u) => !(_evmRpcCooldownUntil[u] > now));
    if (active.length === 0) active = allRpcs;

    const effTimeout = Math.min(timeoutMs, 5000);
    const bodyStr = JSON.stringify(payload);
    const isBatch = Array.isArray(payload);
    const methodName = !isBatch && payload && payload.method ? String(payload.method) : '';
    const isReadOnly = isBatch || !/sendRawTransaction|sendTransaction/i.test(methodName);

    const trySingleEndpoint = async (rpcUrl, signal = undefined) => {
      try {
        const res = await fetchJsonWithTimeout(
          rpcUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr,
            signal
          },
          effTimeout
        );
        if (Array.isArray(res)) {
          const allErrors = res.length > 0 && res.every((item) => item && item.error && item.result === undefined);
          if (allErrors) {
            const firstErr = res[0].error;
            if (isDeterministicJsonRpcError(firstErr)) return { deterministicError: true, data: null };
            _evmRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
            return { deterministicError: false, data: null };
          }
          return { deterministicError: false, data: res };
        }
        if (res && res.result !== undefined && !res.error) {
          return { deterministicError: false, data: res };
        }
        if (res && res.error) {
          if (isDeterministicJsonRpcError(res.error)) {
            return { deterministicError: true, data: null };
          }
          _evmRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
        }
      } catch (err) {
        if (!(signal && signal.aborted) && shouldCooldownRpcError(err)) {
          _evmRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
        }
      }
      return { deterministicError: false, data: null };
    };

    // Hedged racing for read-only calls when >= 2 healthy RPCs exist: launch backup after 1500ms if primary is slow
    if (isReadOnly && active.length >= 2) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const sig = ctrl ? ctrl.signal : undefined;
      let hedgeTimer = null;
      try {
        const primary = trySingleEndpoint(active[0], sig).then((r) => {
          if (r && (r.data !== null || r.deterministicError)) return r;
          throw new Error('primary_failed');
        });
        const backup = new Promise((resolve, reject) => {
          let settled = false;
          const runBackup = () => {
            if (settled || (sig && sig.aborted)) { reject(new Error('aborted')); return; }
            trySingleEndpoint(active[1], sig).then((r) => {
              if (r && (r.data !== null || r.deterministicError)) resolve(r);
              else reject(new Error('backup_failed'));
            }).catch(reject);
          };
          hedgeTimer = setTimeout(runBackup, 1500);
          primary.catch(() => {
            if (hedgeTimer) { clearTimeout(hedgeTimer); hedgeTimer = null; }
            runBackup();
          });
        });
        const winner = await Promise.any([primary, backup]);
        if (hedgeTimer) clearTimeout(hedgeTimer);
        if (ctrl && !ctrl.signal.aborted) ctrl.abort();
        if (winner && winner.deterministicError) return null;
        if (winner && winner.data !== null) return winner.data;
      } catch (_) {
        if (hedgeTimer) clearTimeout(hedgeTimer);
        if (ctrl && !ctrl.signal.aborted) ctrl.abort();
      }
      // Try any remaining endpoints beyond the first two
      for (let i = 2; i < active.length; i++) {
        const r = await trySingleEndpoint(active[i]);
        if (r.deterministicError) return null;
        if (r.data !== null) return r.data;
      }
      return null;
    }

    for (const rpcUrl of active) {
      const r = await trySingleEndpoint(rpcUrl);
      if (r.deterministicError) return null;
      if (r.data !== null) return r.data;
    }
    return null;
  }

  async function waitForEvmTxConfirmation(chainKey, txHash, timeoutMs = 45000) {
    if (!txHash) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await callEvmRpc(
        chainKey,
        { jsonrpc: '2.0', id: 'receipt', method: 'eth_getTransactionReceipt', params: [txHash] },
        5000
      ).catch(() => null);
      const receipt = res && res.result ? res.result : null;
      if (receipt && receipt.blockNumber) {
        if (receipt.status === '0x0') {
          throw new Error(t(`链上交易执行失败 (tx: ${txHash})`, `On-chain transaction reverted (tx: ${txHash})`));
        }
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
    return null;
  }

  async function fetchEvmNativeAndErc20Balance(chainKey, evmAddress, tokenContract = null, decimals = 18) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    const addr = String(evmAddress || '').trim();
    if (!cfg || !addr) return null;

    try {
      const nativeRes = await callEvmRpc(
        key,
        { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] },
        6500
      );
      if (!nativeRes || typeof nativeRes.result !== 'string' || !nativeRes.result.startsWith('0x')) {
        return null;
      }
      const nativeRaw = BigInt(nativeRes.result === '0x' ? '0x0' : nativeRes.result).toString();
      const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));

      let tokenRaw = null;
      let tokenFormatted = null;
      const contract = tokenContract ? String(tokenContract).trim() : '';
      if (contract && contract.toLowerCase() !== NATIVE_EVM_SENTINEL) {
        const paddedAddr = addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
        const tokenRes = await callEvmRpc(
          key,
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_call',
            params: [{ to: contract, data: '0x70a08231' + paddedAddr }, 'latest']
          },
          6500
        );
        if (tokenRes && typeof tokenRes.result === 'string' && tokenRes.result.startsWith('0x')) {
          tokenRaw = sliceEvmUint256WordHex(tokenRes.result, 0);
          tokenFormatted = Number(fromBaseUnits(tokenRaw, decimals));
        }
      }

      return {
        chainKey: key,
        chainId: cfg.chainId,
        nativeRaw,
        nativeFormatted,
        tokenRaw,
        tokenFormatted
      };
    } catch (_) {
      return null;
    }
  }

  /**
   * 批量查询单条 EVM 链的原生余额与多个 ERC20 balanceOf：
   * 优先通过 Multicall3.aggregate3 单次 eth_call 查询（无节点 Batch 限制，最快）；
   * 不支持 Multicall3 或失败时自动降级为 JSON-RPC Batch / 多 RPC 故障转移并发查询。
   */
  async function fetchEvmChainBalancesBatch(chainKey, evmAddress, tokenQueries = []) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    const addr = String(evmAddress || '').trim();
    if (!cfg || !addr) return null;

    const validTokens = (Array.isArray(tokenQueries) ? tokenQueries : [])
      .filter((q) => q && q.contract && String(q.contract).trim().toLowerCase() !== NATIVE_EVM_SENTINEL)
      .map((q) => ({
        contract: String(q.contract).trim(),
        decimals: Number.isFinite(Number(q.decimals)) ? Number(q.decimals) : 18
      }));

    const paddedAddr = addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const tokens = Object.create(null);
    const allRpcList = Array.isArray(cfg.rpcs) && cfg.rpcs.length > 0 ? cfg.rpcs : (cfg.rpc ? [cfg.rpc] : []);
    const allInCooldown = () => allRpcList.length > 0 && allRpcList.every((u) => (_evmRpcCooldownUntil[u] || 0) > Date.now());

    try {
      if (validTokens.length === 0) {
        const natOnlyRes = await callEvmRpc(
          key,
          { jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [addr, 'latest'] },
          5500
        );
        if (!natOnlyRes || typeof natOnlyRes.result !== 'string' || !natOnlyRes.result.startsWith('0x')) {
          return null;
        }
        const nativeRaw = BigInt(natOnlyRes.result === '0x' ? '0x0' : natOnlyRes.result).toString();
        const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));
        return { chainKey: key, chainId: cfg.chainId, nativeRaw, nativeFormatted, tokens };
      }

      // 1. Multicall3 aggregate3 (1 eth_call for native ETH + all ERC20 tokens)
      if (cfg.supportsMulticall3 !== false) {
        const allCalls = [
          { target: MULTICALL3_ADDRESS, allowFailure: true, callData: '0x4d2301cc' + paddedAddr },
          ...validTokens.map((q) => ({
            target: q.contract,
            allowFailure: true,
            callData: '0x70a08231' + paddedAddr
          }))
        ];
        const CHUNK_SIZE = 100;
        const decodedAll = [];
        let mcOk = true;
        for (let off = 0; off < allCalls.length; off += CHUNK_SIZE) {
          const chunk = allCalls.slice(off, off + CHUNK_SIZE);
          const calldata = encodeMulticall3Aggregate3(chunk);
          const mcRes = await callEvmRpc(
            key,
            {
              jsonrpc: '2.0',
              id: `mc3_${off}`,
              method: 'eth_call',
              params: [{ to: MULTICALL3_ADDRESS, data: calldata }, 'latest']
            },
            5500
          );
          const decoded = mcRes && typeof mcRes.result === 'string'
            ? decodeMulticall3Aggregate3Result(mcRes.result)
            : null;
          if (!decoded || decoded.length !== chunk.length) {
            mcOk = false;
            break;
          }
          decodedAll.push(...decoded);
        }
        if (mcOk && decodedAll.length === allCalls.length && decodedAll[0].success) {
          const nativeRaw = sliceEvmUint256WordHex(decodedAll[0].returnData, 0);
          const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));
          validTokens.forEach((q, idx) => {
            const item = decodedAll[idx + 1];
            if (item && item.success && item.returnData && item.returnData !== '0x') {
              const raw = sliceEvmUint256WordHex(item.returnData, 0);
              tokens[q.contract.toLowerCase()] = {
                contract: q.contract,
                raw,
                formatted: Number(fromBaseUnits(raw, q.decimals))
              };
            }
          });
          return { chainKey: key, chainId: cfg.chainId, nativeRaw, nativeFormatted, tokens };
        }
        if (allInCooldown()) return null;
      }

      // 2. JSON-RPC Batch fallback
      const batchPayload = [
        { jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [addr, 'latest'] },
        ...validTokens.map((q, idx) => ({
          jsonrpc: '2.0',
          id: idx + 1,
          method: 'eth_call',
          params: [{ to: q.contract, data: '0x70a08231' + paddedAddr }, 'latest']
        }))
      ];

      const batchRes = await callEvmRpc(key, batchPayload, 5500);
      if (Array.isArray(batchRes) && batchRes.length > 0) {
        const byId = new Map();
        for (const item of batchRes) {
          if (item && item.id !== undefined) byId.set(item.id, item);
        }
        const natItem = byId.get(0);
        if (natItem && typeof natItem.result === 'string' && natItem.result.startsWith('0x')) {
          const nativeRaw = BigInt(natItem.result === '0x' ? '0x0' : natItem.result).toString();
          const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));
          validTokens.forEach((q, idx) => {
            const item = byId.get(idx + 1);
            if (item && typeof item.result === 'string' && item.result.startsWith('0x')) {
              const raw = sliceEvmUint256WordHex(item.result, 0);
              tokens[q.contract.toLowerCase()] = {
                contract: q.contract,
                raw,
                formatted: Number(fromBaseUnits(raw, q.decimals))
              };
            }
          });
          return { chainKey: key, chainId: cfg.chainId, nativeRaw, nativeFormatted, tokens };
        }
      }
      if (allInCooldown()) return null;

      // 3. Concurrent individual calls fallback
      const [natRes, ...ercResults] = await Promise.all([
        callEvmRpc(key, batchPayload[0], 5500),
        ...validTokens.map((_, idx) => callEvmRpc(key, batchPayload[idx + 1], 5500))
      ]);
      if (!natRes || typeof natRes.result !== 'string' || !natRes.result.startsWith('0x')) {
        return null;
      }
      const nativeRaw = BigInt(natRes.result === '0x' ? '0x0' : natRes.result).toString();
      const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));
      validTokens.forEach((q, idx) => {
        const res = ercResults[idx];
        if (res && typeof res.result === 'string' && res.result.startsWith('0x')) {
          const raw = sliceEvmUint256WordHex(res.result, 0);
          tokens[q.contract.toLowerCase()] = {
            contract: q.contract,
            raw,
            formatted: Number(fromBaseUnits(raw, q.decimals))
          };
        }
      });

      return { chainKey: key, chainId: cfg.chainId, nativeRaw, nativeFormatted, tokens };
    } catch (_) {
      return null;
    }
  }

  const ARC_USDC_PRECOMPILE = '0x3600000000000000000000000000000000000000';
  const LIFI_API_URL = 'https://li.quest/v1';

  /**
   * Unifies Arc Mainnet (5042) native USDC (18 decimals) vs precompile ERC-20 USDC (6 decimals).
   */
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
        return fetchJsonWithTimeout(url, { signal: mergedSig }, timeout).catch((err) => {
          if (!(localCtrl && localCtrl.signal.aborted) && err && (err.status === 403 || err.status === 429 || err.name === 'AbortError' || err.status >= 500)) {
            markAggCooldown(prov, err.status === 403 ? 10 * 60_000 : 120_000);
          }
          return null;
        });
      };

      try {
        const [kRes, pRes, oRes, lRes] = await raceWithGraceWindow(
          [
            fetchAgg(kyberUrl, `kyber:${key}`, 4500),
            fetchAgg(paraUrl, `paraswap:${key}`, 4500),
            fetchAgg(ooUrl, 'openocean', 4000),
            fetchAgg(lifiUrl, `lifi:${key}`, 4500)
          ],
          (v) => Boolean(
            v && (
              (v.code === 0 && v.data && v.data.routeSummary && v.data.routeSummary.amountOut) ||
              (v.priceRoute && v.priceRoute.destAmount) ||
              (Number(v.code) === 200 && v.data && v.data.outAmount) ||
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

        const ooRoute =
          oRes && oRes.status === 'fulfilled' && oRes.value && Number(oRes.value.code) === 200 && oRes.value.data && oRes.value.data.outAmount
            ? oRes.value.data
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

  function getOrderedHealthyEvmRpcs(chainKey) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) return [];
    const all = Array.isArray(cfg.rpcs) && cfg.rpcs.length > 0 ? cfg.rpcs : (cfg.rpc ? [cfg.rpc] : []);
    const now = Date.now();
    const healthy = all.filter((u) => !(_evmRpcCooldownUntil[u] > now));
    return healthy.length > 0 ? healthy : all;
  }

  function createEvmStaticProvider(cfg, rpcUrl, ethersLib) {
    const net = (ethersLib.Network && typeof ethersLib.Network.from === 'function')
      ? ethersLib.Network.from({ name: String(cfg.name || 'evm').toLowerCase(), chainId: cfg.chainId })
      : cfg.chainId;
    return new ethersLib.JsonRpcProvider(rpcUrl, net, { staticNetwork: true });
  }

  async function withEvmProviderFailover(chainKey, ethersLib, taskFn) {
    const cfg = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));
    const rpcs = getOrderedHealthyEvmRpcs(chainKey);
    let lastErr = null;
    for (const rpcUrl of rpcs) {
      const provider = createEvmStaticProvider(cfg, rpcUrl, ethersLib);
      try {
        return await taskFn(provider, cfg, rpcUrl);
      } catch (err) {
        lastErr = err;
        const msg = String((err && (err.shortMessage || err.message)) || '').toLowerCase();
        const isRevert = err && (err.code === 'CALL_EXCEPTION' || err.code === 'INSUFFICIENT_FUNDS' || err.code === 'NONCE_EXPIRED' || /reverted|insufficient funds|already known/i.test(msg));
        if (isRevert) throw err;
        _evmRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
      }
    }
    throw lastErr || new Error(t('EVM RPC 执行失败', 'EVM RPC execution failed'));
  }

  async function sendEvmMpcSignedTransaction({
    wallet,
    chainKey,
    to,
    data = '0x',
    value = '0',
    approvalToken = null,
    spender = null,
    amountRaw = null,
    path = 'ethereum-1',
    gasPriceWei = null,
    gasLimit = null
  }) {
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const cfg = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));
    const fromAddr = wallet && (wallet.mpcEvmAddress || wallet.evmAddress);
    if (!fromAddr) throw new Error(t('MPC EVM 地址不可用', 'MPC EVM address unavailable'));

    const signAndBroadcastOne = async (txTo, txData, txVal, useOverrideFee = false) => {
      const valBig = BigInt(txVal || '0');
      const normalizedTxTo = txTo ? String(txTo).trim() : null;
      const txFields = await withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
        const nonce = await provider.getTransactionCount(fromAddr, 'pending');
        if (useOverrideFee && gasPriceWei !== null && gasPriceWei !== undefined) {
          const estOverride = await provider.estimateGas({ from: fromAddr, to: normalizedTxTo, data: txData || '0x', value: valBig }).catch(() => null);
          const safeGasLimit = estOverride !== null ? ((estOverride * 120n) / 100n) : BigInt(gasLimit || 21000);
          return {
            type: 0,
            chainId: cfg.chainId,
            nonce,
            to: normalizedTxTo,
            data: txData || '0x',
            value: valBig,
            gasLimit: safeGasLimit > BigInt(gasLimit || 21000) ? safeGasLimit : BigInt(gasLimit || 21000),
            gasPrice: BigInt(gasPriceWei)
          };
        }
        const [feeData, est] = await Promise.all([
          provider.getFeeData(),
          provider.estimateGas({ from: fromAddr, to: normalizedTxTo, data: txData, value: valBig }).catch(() => null)
        ]);
        const resolvedGasLimit = est !== null ? ((est * 125n) / 100n) : (txData && txData !== '0x' ? 350000n : 21000n);
        const useEip1559 = Boolean(feeData.maxFeePerGas);
        const maxFee = feeData.maxFeePerGas || 1000000000n;
        const prioFeeRaw = feeData.maxPriorityFeePerGas || (maxFee / 4n) || 1000000n;
        const prioFee = prioFeeRaw > maxFee ? maxFee : prioFeeRaw;
        return useEip1559
          ? {
              type: 2,
              chainId: cfg.chainId,
              nonce,
              to: normalizedTxTo,
              data: txData || '0x',
              value: valBig,
              gasLimit: resolvedGasLimit,
              maxFeePerGas: maxFee,
              maxPriorityFeePerGas: prioFee
            }
          : {
              type: 0,
              chainId: cfg.chainId,
              nonce,
              to: normalizedTxTo,
              data: txData || '0x',
              value: valBig,
              gasLimit: resolvedGasLimit,
              gasPrice: feeData.gasPrice || 1000000000n
            };
      });

      const uTx = ethersLib.Transaction.from(txFields);
      const digestBytes = hexToBytes(uTx.unsignedHash.replace(/^0x/i, ''));
      const mpcRes = await api.requestNearMpcChainSignature({
        wallet,
        payloadHash32Bytes: digestBytes,
        path,
        domainId: 0
      });
      const sigObj = mpcRes && mpcRes.mpcSignature;
      if (!sigObj || !sigObj.big_r || !sigObj.big_r.affine_point || !sigObj.s || !sigObj.s.scalar) {
        throw new Error(t('NEAR MPC 未返回有效的 Secp256k1 签名', 'NEAR MPC did not return a valid Secp256k1 signature'));
      }
      const rHex = sigObj.big_r.affine_point.slice(2, 66);
      const sHex = sigObj.s.scalar.padStart(64, '0');
      const baseParity = Number(sigObj.recovery_id || 0) & 1;
      let matched = false;
      for (const yParity of [baseParity, baseParity ^ 1]) {
        uTx.signature = ethersLib.Signature.from({ r: `0x${rHex}`, s: `0x${sHex}`, yParity });
        if (!uTx.from || uTx.from.toLowerCase() === fromAddr.toLowerCase()) {
          matched = true;
          break;
        }
      }
      if (!matched) {
        throw new Error(t('MPC 签名恢复地址与发送地址不匹配', 'MPC signature recovered address mismatch'));
      }
      const serialized = uTx.serialized;
      return withEvmProviderFailover(chainKey, ethersLib, (provider) => provider.broadcastTransaction(serialized));
    };

    const ZERO_RESET_APPROVE_TOKENS = new Set(['0xdac17f958d2ee523a2206206994597c13d831ec7']);

    if (approvalToken && approvalToken.toLowerCase() !== NATIVE_EVM_SENTINEL && spender && amountRaw) {
      const curAllow = await withEvmProviderFailover(chainKey, ethersLib, (provider) => {
        const erc20 = new ethersLib.Contract(
          approvalToken,
          ['function allowance(address owner, address spender) view returns (uint256)'],
          provider
        );
        return erc20.allowance(fromAddr, spender);
      });
      if (curAllow < BigInt(amountRaw)) {
        const approveIface = new ethersLib.Interface(['function approve(address spender, uint256 amount) returns (bool)']);
        if (curAllow > 0n && ZERO_RESET_APPROVE_TOKENS.has(approvalToken.toLowerCase())) {
          const resetData = approveIface.encodeFunctionData('approve', [spender, '0']);
          const resetResp = await signAndBroadcastOne(approvalToken, resetData, '0');
          await resetResp.wait(1).catch(() => waitForEvmTxConfirmation(chainKey, resetResp.hash, 45000));
        }
        const approveData = approveIface.encodeFunctionData('approve', [spender, amountRaw]);
        const appResp = await signAndBroadcastOne(approvalToken, approveData, '0');
        await appResp.wait(1).catch(() => waitForEvmTxConfirmation(chainKey, appResp.hash, 45000));
      }
    }

    const txResp = await signAndBroadcastOne(to, data, value, !approvalToken);
    return {
      txHash: txResp.hash,
      explorerUrl: `${cfg.explorer}${txResp.hash}`
    };
  }

  async function signEvmTypedDataUnified({ wallet, domain, types, value, path = 'ethereum-1' } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const resolvedWallet = await ensureWalletSigningKeysAsync(wallet);
    const cleanTypes = {};
    for (const [k, v] of Object.entries(types || {})) {
      if (k !== 'EIP712Domain') cleanTypes[k] = v;
    }
    if (resolvedWallet.evmPrivateKey) {
      const signer = new ethersLib.Wallet(resolvedWallet.evmPrivateKey);
      const rawSig = await signer.signTypedData(domain, cleanTypes, value);
      const sig = ethersLib.Signature.from(rawSig);
      return {
        signature: sig.serialized,
        r: sig.r,
        s: sig.s,
        v: sig.v,
        yParity: sig.yParity,
        signerAddress: signer.address,
        mode: 'local'
      };
    }
    const fromAddr = resolvedWallet.mpcEvmAddress || resolvedWallet.evmAddress;
    if (!fromAddr) throw new Error(t('MPC EVM 地址不可用', 'MPC EVM address unavailable'));
    const digestHex = ethersLib.TypedDataEncoder.hash(domain, cleanTypes, value);
    const digestBytes = hexToBytes(digestHex.replace(/^0x/i, ''));
    const mpcRes = await api.requestNearMpcChainSignature({
      wallet: resolvedWallet,
      payloadHash32Bytes: digestBytes,
      path,
      domainId: 0
    });
    const sigObj = mpcRes && mpcRes.mpcSignature;
    if (!sigObj || !sigObj.big_r || !sigObj.big_r.affine_point || !sigObj.s || !sigObj.s.scalar) {
      throw new Error(t('NEAR MPC 未返回有效的 Secp256k1 签名', 'NEAR MPC did not return a valid Secp256k1 signature'));
    }
    const rHex = sigObj.big_r.affine_point.slice(2, 66);
    const sHex = sigObj.s.scalar.padStart(64, '0');
    const yParityRaw = Number(sigObj.recovery_id || 0) & 1;
    let sig = ethersLib.Signature.from({ r: `0x${rHex}`, s: `0x${sHex}`, yParity: yParityRaw });
    let recovered = ethersLib.verifyTypedData(domain, cleanTypes, value, sig.serialized);
    if (recovered.toLowerCase() !== fromAddr.toLowerCase()) {
      const altSig = ethersLib.Signature.from({ r: `0x${rHex}`, s: `0x${sHex}`, yParity: yParityRaw ^ 1 });
      const altRecovered = ethersLib.verifyTypedData(domain, cleanTypes, value, altSig.serialized);
      if (altRecovered.toLowerCase() === fromAddr.toLowerCase()) {
        sig = altSig;
        recovered = altRecovered;
      } else {
        throw new Error(t('MPC 签名恢复地址与发送地址不匹配', 'MPC signature recovered address mismatch'));
      }
    }
    return {
      signature: sig.serialized,
      r: sig.r,
      s: sig.s,
      v: sig.v,
      yParity: sig.yParity,
      signerAddress: recovered,
      mode: 'mpc'
    };
  }

  async function sendEvmSignedTransaction({ chainKey, privateKey, to, data = '0x', value = '0', approvalToken = null, spender = null, amountRaw = null, gasPriceWei = null, gasLimit = null }) {
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const cfg = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));

    const ZERO_RESET_APPROVE_TOKENS = new Set(['0xdac17f958d2ee523a2206206994597c13d831ec7']);

    if (approvalToken && approvalToken.toLowerCase() !== NATIVE_EVM_SENTINEL && spender && amountRaw) {
      const signerAddr = new ethersLib.Wallet(privateKey).address;
      const curAllow = await withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
        const erc20 = new ethersLib.Contract(
          approvalToken,
          ['function allowance(address owner, address spender) view returns (uint256)'],
          provider
        );
        return erc20.allowance(signerAddr, spender);
      });
      if (curAllow < BigInt(amountRaw)) {
        if (curAllow > 0n && ZERO_RESET_APPROVE_TOKENS.has(approvalToken.toLowerCase())) {
          const resetTx = await withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
            const signer = new ethersLib.Wallet(privateKey, provider);
            const erc20 = new ethersLib.Contract(approvalToken, ['function approve(address spender, uint256 amount) returns (bool)'], signer);
            return erc20.approve(spender, '0');
          });
          await resetTx.wait(1).catch(() => waitForEvmTxConfirmation(chainKey, resetTx.hash, 45000));
        }
        const approveTx = await withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
          const signer = new ethersLib.Wallet(privateKey, provider);
          const erc20 = new ethersLib.Contract(approvalToken, ['function approve(address spender, uint256 amount) returns (bool)'], signer);
          return erc20.approve(spender, amountRaw);
        });
        await approveTx.wait(1).catch(() => waitForEvmTxConfirmation(chainKey, approveTx.hash, 45000));
      }
    }

    const signedRaw = await withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
      const signer = new ethersLib.Wallet(privateKey, provider);
      const valBig = BigInt(value || '0');
      const normTo = to ? String(to).trim() : null;
      const [nonce, feeData, est] = await Promise.all([
        provider.getTransactionCount(signer.address, 'pending'),
        provider.getFeeData(),
        provider.estimateGas({ from: signer.address, to: normTo, data, value: valBig }).catch(() => null)
      ]);
      const baseGasLimit = (!approvalToken && gasLimit) ? BigInt(gasLimit) : (data && data !== '0x' ? 350000n : 21000n);
      const estLimit = est !== null ? ((est * 120n) / 100n) : baseGasLimit;
      const resolvedGasLimit = estLimit > baseGasLimit ? estLimit : baseGasLimit;

      const txReq = {
        chainId: cfg.chainId,
        nonce,
        to: normTo,
        data,
        value: valBig,
        gasLimit: resolvedGasLimit
      };
      if (!approvalToken && gasPriceWei !== null && gasPriceWei !== undefined) {
        txReq.type = 0;
        txReq.gasPrice = BigInt(gasPriceWei);
      } else if (feeData.maxFeePerGas) {
        const maxFee = feeData.maxFeePerGas;
        const prioRaw = feeData.maxPriorityFeePerGas || (maxFee / 4n) || 1000000n;
        txReq.type = 2;
        txReq.maxFeePerGas = maxFee;
        txReq.maxPriorityFeePerGas = prioRaw > maxFee ? maxFee : prioRaw;
      } else {
        txReq.type = 0;
        txReq.gasPrice = feeData.gasPrice || 1000000000n;
      }
      return signer.signTransaction(txReq);
    });

    const txResp = await withEvmProviderFailover(chainKey, ethersLib, (provider) => provider.broadcastTransaction(signedRaw));
    return {
      txHash: txResp.hash,
      explorerUrl: `${cfg.explorer}${txResp.hash}`
    };
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
      const cachedErc20 =
        tokenBalance !== null && tokenBalance !== undefined
          ? tokenBalance
          : (wallet.erc20Balances && wallet.erc20Balances[key] && wallet.erc20Balances[key][String(srcToken).toLowerCase()] !== undefined
              ? wallet.erc20Balances[key][String(srcToken).toLowerCase()]
              : null);
      if (cachedErc20 !== null) {
        validateSufficientChainBalance({
          wallet,
          chain: key,
          tokenSymbol: 'TOKEN',
          amount: humanAmt,
          isNative: false,
          tokenBalance: cachedErc20
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
        throw new Error(toUserFriendlyError(lData && lData.message, t('兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.')));
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paraPayload)
        },
        12000
      ).catch((err) => {
        throw new Error(toUserFriendlyError(err, t('兑换交易构建失败，请稍后重试', 'Swap transaction build failed. Please try again.')));
      });
      if (!pBuild || !pBuild.to || !pBuild.data) {
        throw new Error(toUserFriendlyError(pBuild && pBuild.error, t('兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.')));
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
        throw new Error(toUserFriendlyError(err, t('兑换路由暂时不可用，请刷新报价后重试', 'Swap route temporarily unavailable. Please refresh quote and retry.')));
      });
      const ooData = ooBuild && Number(ooBuild.code) === 200 ? ooBuild.data : null;
      if (!ooData || !ooData.to || !ooData.data) {
        throw new Error(toUserFriendlyError(ooBuild && ooBuild.message, t('兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.')));
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routeSummary: cleanSummary,
            sender: wallet.evmAddress,
            recipient: wallet.evmAddress,
            slippageTolerance: Number(slippageBps) || 100
          })
        },
        12000
      ).catch((err) => {
        throw new Error(toUserFriendlyError(err, t('兑换交易构建失败，请稍后重试', 'Swap transaction build failed. Please try again.')));
      });
      const buildData = buildRes && buildRes.code === 0 ? buildRes.data : null;
      if (!buildData || !buildData.routerAddress || !buildData.data) {
        throw new Error(toUserFriendlyError(buildRes && buildRes.message, t('兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.')));
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

  async function executeEvmTransfer({
    wallet,
    chainKey,
    toAddress,
    amount,
    tokenContract = null,
    decimals = 18,
    tokenBalance = null,
    gasBuffer = null,
    gasPriceWei = null,
    gasLimit = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));

    const dest = String(toAddress || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) {
      throw new Error(t('EVM 收款地址无效', 'Invalid EVM recipient address'));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const isNative = !tokenContract ||
      String(tokenContract).toLowerCase() === NATIVE_EVM_SENTINEL ||
      String(tokenContract).toLowerCase() === ARC_USDC_PRECOMPILE;
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);

    if (isNative) {
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: cfg.symbol,
        amount,
        isNative: true,
        gasBuffer
      });
      if (!wallet.evmAddress || (!wallet.evmPrivateKey && !hasNearMpc)) {
        throw new Error(t('NEAR 主账户或 MPC EVM 地址不可用', 'NEAR Master Account or MPC EVM address unavailable'));
      }
      const weiStr = toBaseUnits(amount, 18);
      if (wallet.evmPrivateKey) {
        return sendEvmSignedTransaction({
          chainKey: key,
          privateKey: wallet.evmPrivateKey,
          to: dest,
          data: '0x',
          value: weiStr,
          gasPriceWei,
          gasLimit
        });
      }
      return sendEvmMpcSignedTransaction({
        wallet,
        chainKey: key,
        to: dest,
        data: '0x',
        value: weiStr,
        path: 'ethereum-1',
        gasPriceWei,
        gasLimit
      });
    }

    const cachedErc20 =
      tokenBalance !== null && tokenBalance !== undefined
        ? tokenBalance
        : (wallet.erc20Balances && wallet.erc20Balances[key] && wallet.erc20Balances[key][String(tokenContract).toLowerCase()] !== undefined
            ? wallet.erc20Balances[key][String(tokenContract).toLowerCase()]
            : null);
    if (cachedErc20 !== null) {
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: 'TOKEN',
        amount,
        isNative: false,
        tokenBalance: cachedErc20
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

    if (!wallet.evmAddress || (!wallet.evmPrivateKey && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC EVM 地址不可用', 'NEAR Master Account or MPC EVM address unavailable'));
    }

    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const iface = new ethersLib.Interface(['function transfer(address to, uint256 value) returns (bool)']);
    const rawUnits = toBaseUnits(amount, decimals);
    const data = iface.encodeFunctionData('transfer', [dest, rawUnits]);

    if (wallet.evmPrivateKey) {
      return sendEvmSignedTransaction({
        chainKey: key,
        privateKey: wallet.evmPrivateKey,
        to: tokenContract,
        data,
        value: '0'
      });
    }
    return sendEvmMpcSignedTransaction({
      wallet,
      chainKey: key,
      to: tokenContract,
      data,
      value: '0',
      path: 'ethereum-1'
    });
  }

