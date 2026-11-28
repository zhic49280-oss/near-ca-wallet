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

  function isEvmReceiptSuccess(receipt) {
    if (!receipt || typeof receipt !== 'object') return false;
    const st = receipt.status;
    if (st === undefined || st === null) return false;
    if (typeof st === 'number') return st === 1;
    if (typeof st === 'boolean') return st;
    const norm = String(st).trim().toLowerCase();
    return norm === '0x1' || norm === '1' || norm === '0x01';
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
      if (receipt && (receipt.blockNumber || (receipt.status !== undefined && receipt.status !== null))) {
        if (receipt.status !== undefined && receipt.status !== null && !isEvmReceiptSuccess(receipt)) {
          throw new Error(t(`链上交易执行失败 (tx: ${txHash})`, `On-chain transaction reverted (tx: ${txHash})`));
        }
        if (isEvmReceiptSuccess(receipt) || receipt.blockNumber) {
          return receipt;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
    return null;
  }

  async function confirmEvmTxOrThrow(chainKey, txHash, timeoutMs = 45000) {
    if (!txHash) {
      throw new Error(t('EVM 交易广播未返回交易哈希', 'EVM transaction broadcast returned no txHash'));
    }
    const receipt = await waitForEvmTxConfirmation(chainKey, txHash, timeoutMs);
    if (!receipt) {
      throw new Error(t(`链上交易确认超时，请到区块浏览器核对结果 (tx: ${txHash})`, `On-chain transaction confirmation timed out; please check explorer (tx: ${txHash})`));
    }
    if (!isEvmReceiptSuccess(receipt)) {
      throw new Error(t(`链上交易执行失败 (tx: ${txHash})`, `On-chain transaction reverted (tx: ${txHash})`));
    }
    return receipt;
  }

  async function waitForApprovalReceipt(chainKey, txResp) {
    const receipt = await txResp.wait(1).catch((err) => {
      if (err && err.code === 'CALL_EXCEPTION') {
        throw new Error(t(`授权交易执行失败 (tx: ${txResp.hash})`, `Approval transaction reverted (tx: ${txResp.hash})`));
      }
      return waitForEvmTxConfirmation(chainKey, txResp.hash, 45000);
    });
    if (!receipt) {
      throw new Error(t('授权交易确认超时，请稍后重试', 'Approval confirmation timed out; please retry'));
    }
    if (receipt.status !== undefined && receipt.status !== null && !isEvmReceiptSuccess(receipt)) {
      throw new Error(t(`授权交易执行失败 (tx: ${txResp.hash})`, `Approval transaction reverted (tx: ${txResp.hash})`));
    }
    return receipt;
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

  function isEvmDeterministicEstimateError(err) {
    if (!err) return false;
    const msg = String(err.shortMessage || err.message || '').toLowerCase();
    return Boolean(
      err.code === 'CALL_EXCEPTION' ||
      err.code === 'INSUFFICIENT_FUNDS' ||
      err.code === 'NONCE_EXPIRED' ||
      /revert|execution reverted|insufficient funds|invalid opcode|out of gas/i.test(msg)
    );
  }

  function getEvmFallbackGasLimit(chainKey, hasData) {
    if (!hasData) return 21000n;
    return String(chainKey || '').toLowerCase() === 'arb' ? 600000n : 350000n;
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
          const explicitTransferGas = Boolean(gasLimit && (!txData || txData === '0x'));
          let resolvedOverrideGas = BigInt(gasLimit || 21000);
          if (!explicitTransferGas) {
            const estOverride = await provider.estimateGas({ from: fromAddr, to: normalizedTxTo, data: txData || '0x', value: valBig }).catch((err) => {
              if (isEvmDeterministicEstimateError(err)) throw err;
              return null;
            });
            const safeGasLimit = estOverride !== null ? ((estOverride * 120n) / 100n) : resolvedOverrideGas;
            if (safeGasLimit > resolvedOverrideGas) resolvedOverrideGas = safeGasLimit;
          }
          return {
            type: 0,
            chainId: cfg.chainId,
            nonce,
            to: normalizedTxTo,
            data: txData || '0x',
            value: valBig,
            gasLimit: resolvedOverrideGas,
            gasPrice: BigInt(gasPriceWei)
          };
        }
        const [feeData, est] = await Promise.all([
          provider.getFeeData(),
          provider.estimateGas({ from: fromAddr, to: normalizedTxTo, data: txData, value: valBig }).catch((err) => {
            if (isEvmDeterministicEstimateError(err)) throw err;
            return null;
          })
        ]);
        const resolvedGasLimit = est !== null ? ((est * 125n) / 100n) : getEvmFallbackGasLimit(chainKey, Boolean(txData && txData !== '0x'));
        const useEip1559 = Boolean(feeData.maxFeePerGas);
        const maxFee = feeData.maxFeePerGas || 1000000000n;
        const prioFeeRaw = (feeData.maxPriorityFeePerGas !== null && feeData.maxPriorityFeePerGas !== undefined)
          ? BigInt(feeData.maxPriorityFeePerGas)
          : ((maxFee / 4n) || 1000000n);
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

    async function waitAndVerifyApproval(txResp, ownerAddr, checkAllowance) {
      await waitForApprovalReceipt(chainKey, txResp);
      if (checkAllowance) {
        const postAllow = await withEvmProviderFailover(chainKey, ethersLib, (provider) => {
          const erc20 = new ethersLib.Contract(
            approvalToken,
            ['function allowance(address owner, address spender) view returns (uint256)'],
            provider
          );
          return erc20.allowance(ownerAddr, spender);
        });
        if (BigInt(postAllow || 0) < BigInt(amountRaw)) {
          throw new Error(t('授权额度尚未生效，请稍后重试', 'Approval allowance not yet confirmed; please retry'));
        }
      }
    }

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
          await waitAndVerifyApproval(resetResp, fromAddr, false);
        }
        const approveData = approveIface.encodeFunctionData('approve', [spender, amountRaw]);
        const appResp = await signAndBroadcastOne(approvalToken, approveData, '0');
        await waitAndVerifyApproval(appResp, fromAddr, true);
      }
    }

    const txResp = await signAndBroadcastOne(to, data, value, !approvalToken);
    const receipt = await confirmEvmTxOrThrow(chainKey, txResp && txResp.hash, 45000);
    return {
      txHash: txResp.hash,
      explorerUrl: `${cfg.explorer}${txResp.hash}`,
      receipt
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
          await waitForApprovalReceipt(chainKey, resetTx);
        }
        const approveTx = await withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
          const signer = new ethersLib.Wallet(privateKey, provider);
          const erc20 = new ethersLib.Contract(approvalToken, ['function approve(address spender, uint256 amount) returns (bool)'], signer);
          return erc20.approve(spender, amountRaw);
        });
        await waitForApprovalReceipt(chainKey, approveTx);
        const postAllow = await withEvmProviderFailover(chainKey, ethersLib, (provider) => {
          const erc20 = new ethersLib.Contract(
            approvalToken,
            ['function allowance(address owner, address spender) view returns (uint256)'],
            provider
          );
          return erc20.allowance(signerAddr, spender);
        });
        if (BigInt(postAllow || 0) < BigInt(amountRaw)) {
          throw new Error(t('授权额度尚未生效，请稍后重试', 'Approval allowance not yet confirmed; please retry'));
        }
      }
    }

    const signedRaw = await withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
      const signer = new ethersLib.Wallet(privateKey, provider);
      const valBig = BigInt(value || '0');
      const normTo = to ? String(to).trim() : null;
      const explicitTransferGas = Boolean(!approvalToken && gasLimit && (!data || data === '0x'));
      const [nonce, feeData, est] = await Promise.all([
        provider.getTransactionCount(signer.address, 'pending'),
        provider.getFeeData(),
        explicitTransferGas
          ? Promise.resolve(null)
          : provider.estimateGas({ from: signer.address, to: normTo, data, value: valBig }).catch((err) => {
              if (isEvmDeterministicEstimateError(err)) throw err;
              return null;
            })
      ]);
      const baseGasLimit = (!approvalToken && gasLimit) ? BigInt(gasLimit) : getEvmFallbackGasLimit(chainKey, Boolean(data && data !== '0x'));
      // Use the node estimate (+20%) whenever available; the high fallback is only for failed estimates.
      // Never inflate a successful estimate up to the swap fallback (e.g. Arbitrum 600k), which inflates the native-fee pre-check.
      const estLimit = est !== null ? ((est * 120n) / 100n) : baseGasLimit;
      const callerFloor = (!approvalToken && gasLimit) ? BigInt(gasLimit) : 0n;
      const resolvedGasLimit = explicitTransferGas
        ? baseGasLimit
        : (est !== null ? (estLimit > callerFloor ? estLimit : callerFloor) : baseGasLimit);

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
        const prioRaw = (feeData.maxPriorityFeePerGas !== null && feeData.maxPriorityFeePerGas !== undefined)
          ? BigInt(feeData.maxPriorityFeePerGas)
          : ((maxFee / 4n) || 1000000n);
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
    const receipt = await confirmEvmTxOrThrow(chainKey, txResp && txResp.hash, 45000);
    return {
      txHash: txResp.hash,
      explorerUrl: `${cfg.explorer}${txResp.hash}`,
      receipt
    };
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
      if (!weiStr || BigInt(weiStr) <= 0n) {
        throw new Error(t('转账金额过小，无法构建链上交易', 'Transfer amount is too small'));
      }
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

    let effectiveErc20 =
      tokenBalance !== null && tokenBalance !== undefined
        ? tokenBalance
        : (wallet.erc20Balances && wallet.erc20Balances[key] && wallet.erc20Balances[key][String(tokenContract).toLowerCase()] !== undefined
            ? wallet.erc20Balances[key][String(tokenContract).toLowerCase()]
            : null);
    if (effectiveErc20 === null && wallet.evmAddress) {
      const fetched = await fetchEvmNativeAndErc20Balance(key, wallet.evmAddress, tokenContract, decimals).catch(() => null);
      if (fetched && fetched.tokenFormatted !== null && fetched.tokenFormatted !== undefined) {
        effectiveErc20 = fetched.tokenFormatted;
      }
    }
    if (effectiveErc20 !== null) {
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: 'TOKEN',
        amount,
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

    if (!wallet.evmAddress || (!wallet.evmPrivateKey && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC EVM 地址不可用', 'NEAR Master Account or MPC EVM address unavailable'));
    }

    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const iface = new ethersLib.Interface(['function transfer(address to, uint256 value) returns (bool)']);
    const rawUnits = toBaseUnits(amount, decimals);
    if (!rawUnits || BigInt(rawUnits) <= 0n) {
      throw new Error(t('转账金额过小，无法构建链上交易', 'Transfer amount is too small'));
    }
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

