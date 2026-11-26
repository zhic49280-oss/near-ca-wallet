  // ==================== Solana RPC & Contract Execution ====================

  async function callSolanaRpc(method, params, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const now = Date.now();
    let active = SOLANA_RPC_ENDPOINTS.filter((u) => !(_solRpcCooldownUntil[u] > now));
    if (active.length === 0) active = SOLANA_RPC_ENDPOINTS.slice();
    const isReadOnly = method !== 'sendTransaction' && method !== 'simulateTransaction';
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

    if (isReadOnly && active.length > 1) {
      // 延迟 hedged 请求：主节点先发，约 800ms 未返回再并发备用节点，避免每次读操作双倍消耗配额
      const raceCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const runOne = async (rpcUrl) => {
        try {
          const res = await fetchJsonWithTimeout(
            rpcUrl,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
              signal: raceCtrl ? raceCtrl.signal : undefined
            },
            timeoutMs
          );
          if (res && !res.error && res.result !== undefined) {
            if (raceCtrl && !raceCtrl.signal.aborted) raceCtrl.abort();
            return res.result;
          }
          const msg = (res && res.error && res.error.message) || JSON.stringify(res?.error || 'RPC error');
          if (res && res.error && !isDeterministicJsonRpcError(res.error)) {
            _solRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
          }
          throw new Error(msg);
        } catch (err) {
          if (!(raceCtrl && raceCtrl.signal.aborted) && shouldCooldownRpcError(err)) {
            _solRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
          }
          throw err;
        }
      };
      let hedgeTimer = null;
      try {
        const primaryUrl = active[0];
        const backupUrl = active[1];
        const primaryPromise = runOne(primaryUrl);
        let backupTriggered = false;
        const backupPromise = new Promise((resolve, reject) => {
          const trigger = () => {
            if (backupTriggered) return;
            backupTriggered = true;
            if (hedgeTimer) {
              clearTimeout(hedgeTimer);
              hedgeTimer = null;
            }
            if (raceCtrl && raceCtrl.signal.aborted) {
              reject(new Error('Aborted'));
              return;
            }
            runOne(backupUrl).then(resolve, reject);
          };
          hedgeTimer = setTimeout(trigger, 800);
          primaryPromise.catch(() => trigger());
        });
        return await Promise.any([primaryPromise, backupPromise]);
      } catch (aggErr) {
        const errs = aggErr && Array.isArray(aggErr.errors) ? aggErr.errors : [aggErr];
        throw errs[0] || new Error('Solana RPC call failed');
      } finally {
        if (hedgeTimer) clearTimeout(hedgeTimer);
        if (raceCtrl && !raceCtrl.signal.aborted) raceCtrl.abort();
      }
    }

    let lastErr = null;
    for (const rpcUrl of active) {
      try {
        const res = await fetchJsonWithTimeout(
          rpcUrl,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
          timeoutMs
        );
        if (res && !res.error && res.result !== undefined) {
          return res.result;
        }
        if (res && res.error) {
          if (!isDeterministicJsonRpcError(res.error)) {
            _solRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
          }
          lastErr = new Error(res.error.message || JSON.stringify(res.error));
          if (isDeterministicJsonRpcError(res.error)) throw lastErr;
        }
      } catch (err) {
        if (shouldCooldownRpcError(err)) {
          _solRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
        }
        lastErr = err;
        if (err && !err.status && err.name !== 'AbortError' && /simulation|blockhash|insufficient/i.test(String(err.message || ''))) {
          throw err;
        }
      }
    }
    throw lastErr || new Error('Solana RPC call failed');
  }

  /**
   * 通用竞速聚合器：并发发起多个异步请求，一旦首个有效结果到达，
   * 仅再等待 graceMs 毫秒让其余更快候选参与比价，超时立即返回当前已到达的结果数组，
   * 并在结束时主动 abort 未完成分支。
   */
  async function raceWithGraceWindow(promises, isValidFn = (v) => Boolean(v), graceMs = 600, maxWaitMs = 8000, abortCtrl = null) {
    const list = Array.isArray(promises) ? promises : [];
    if (list.length === 0) return [];
    return new Promise((resolve) => {
      const results = new Array(list.length).fill(null);
      let remaining = list.length;
      let done = false;
      let graceTimer = null;
      let globalTimer = null;

      const finish = () => {
        if (done) return;
        done = true;
        if (graceTimer) clearTimeout(graceTimer);
        if (globalTimer) clearTimeout(globalTimer);
        if (abortCtrl && abortCtrl.signal && !abortCtrl.signal.aborted) {
          try { abortCtrl.abort(); } catch (_) {}
        }
        resolve(results);
      };

      if (maxWaitMs > 0) {
        globalTimer = setTimeout(finish, maxWaitMs);
      }

      list.forEach((p, idx) => {
        Promise.resolve(p)
          .then((val) => {
            results[idx] = { status: 'fulfilled', value: val };
            if (!done && isValidFn(val) && !graceTimer && remaining > 1) {
              graceTimer = setTimeout(finish, graceMs);
            }
          })
          .catch((err) => {
            results[idx] = { status: 'rejected', reason: err };
          })
          .finally(() => {
            remaining -= 1;
            if (remaining <= 0) finish();
          });
      });
    });
  }

  async function fetchSolanaNativeAndSplBalances(solAddress, mintAddresses = []) {
    const addr = String(solAddress || '').trim();
    if (!addr) return null;

    try {
      const [balRes, splRes, t22Res] = await Promise.all([
        callSolanaRpc('getBalance', [addr], 5000),
        callSolanaRpc('getTokenAccountsByOwner', [addr, { programId: SPL_TOKEN_PROGRAM_ID }, { encoding: 'jsonParsed' }], 5000).catch(() => null),
        callSolanaRpc('getTokenAccountsByOwner', [addr, { programId: SPL_TOKEN_2022_PROGRAM_ID }, { encoding: 'jsonParsed' }], 5000).catch(() => null)
      ]);

      const lamports = balRes && typeof balRes.value === 'number' ? balRes.value : 0;
      const nativeSol = Number(fromBaseUnits(String(lamports), 9));

      const tokens = {};
      const ataMints = {};
      const parseSplAccounts = (res) => {
        const list = res && Array.isArray(res.value) ? res.value : [];
        for (const item of list) {
          const info = item && item.account && item.account.data && item.account.data.parsed && item.account.data.parsed.info;
          if (!info || !info.mint || !info.tokenAmount) continue;
          const mint = info.mint;
          const decimals = Number(info.tokenAmount.decimals) || 0;
          const rawAmt = BigInt(info.tokenAmount.amount || '0');
          ataMints[mint] = true;
          if (!tokens[mint]) {
            tokens[mint] = { raw: rawAmt.toString(), decimals, formatted: Number(fromBaseUnits(rawAmt.toString(), decimals)), hasAta: true };
          } else {
            const sumRaw = BigInt(tokens[mint].raw) + rawAmt;
            tokens[mint] = { raw: sumRaw.toString(), decimals, formatted: Number(fromBaseUnits(sumRaw.toString(), decimals)), hasAta: true };
          }
        }
      };

      const splFetchOk = splRes !== null || t22Res !== null;
      parseSplAccounts(splRes);
      parseSplAccounts(t22Res);

      if (splFetchOk && Array.isArray(mintAddresses)) {
        for (const m of mintAddresses) {
          if (m && !tokens[m]) {
            tokens[m] = { raw: '0', decimals: 0, formatted: 0, hasAta: false };
          }
        }
      }

      return {
        solAddress: addr,
        nativeLamports: String(lamports),
        nativeSol,
        tokens,
        ataMints,
        splFetchFailed: !splFetchOk
      };
    } catch (_) {
      return null;
    }
  }

  async function resolveSolanaFeeAta(outputMint, owner = DEFAULT_SOL_FEE_RECIPIENT) {
    if (!owner || !outputMint) return null;
    const cacheKey = `${owner}:${outputMint}`;
    if (cacheKey in _solFeeAtaCache) return _solFeeAtaCache[cacheKey];
    try {
      const res = await callSolanaRpc(
        'getTokenAccountsByOwner',
        [owner, { mint: outputMint }, { encoding: 'jsonParsed' }],
        6000
      );
      const list = res && Array.isArray(res.value) ? res.value : [];
      const ata = list[0] && list[0].pubkey ? list[0].pubkey : null;
      _solFeeAtaCache[cacheKey] = ata;
      return ata;
    } catch (_) {
      return null;
    }
  }

  async function quoteSolanaJupiterSwap({
    inputMint,
    outputMint,
    amountRaw,
    slippageBps = 100,
    platformFeeBps = 0,
    signal = null
  } = {}) {
    if (!inputMint || !outputMint) {
      throw new Error(t('缺少 Solana 代币 Mint 地址', 'Missing Solana inputMint or outputMint'));
    }
    const amtStr = String(amountRaw === undefined || amountRaw === null ? '' : amountRaw).trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'amountRaw must be a positive integer string'));
    }
    const slip = Number(slippageBps) || 100;
    const solFeeBps = Number.isFinite(Number(platformFeeBps)) ? Math.max(0, Math.round(Number(platformFeeBps))) : 0;
    const cacheKey = `sol:${inputMint}:${outputMint}:${amtStr}:${slip}:${solFeeBps}`;

    return withQuoteCacheAndDedup(cacheKey, 10_000, async () => {
      const feeParam = solFeeBps > 0 ? `&platformFeeBps=${solFeeBps}` : '';
      const jupPath = `/quote?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(amtStr)}&slippageBps=${slip}${feeParam}`;
      const fetchJupWithFallback = async (sig) => {
        const bases = Array.isArray(JUPITER_API_FALLBACK_URLS) && JUPITER_API_FALLBACK_URLS.length > 0 ? JUPITER_API_FALLBACK_URLS : [JUPITER_API_URL];
        let lastErr = null;
        for (const base of bases) {
          try {
            const res = await fetchJsonWithTimeout(`${base}${jupPath}`, { signal: sig }, 4500);
            if (res && res.outAmount) return res;
          } catch (e) {
            lastErr = e;
            if (sig && sig.aborted) throw e;
          }
        }
        if (lastErr) throw lastErr;
        return null;
      };
      const rayUrl = `${RAYDIUM_API_URL}/compute/swap-base-in?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(amtStr)}&slippageBps=${slip}&txVersion=V0`;

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

      try {
        const [jRes, rRes] = await raceWithGraceWindow(
          [
            fetchJupWithFallback(mergedSig),
            fetchJsonWithTimeout(rayUrl, { signal: mergedSig }, 4500).catch(() => null)
          ],
          (v) => Boolean(v && (v.outAmount || (v.success && v.data && v.data.outputAmount))),
          1000,
          5000,
          localCtrl
        );

        const jQuote = jRes && jRes.status === 'fulfilled' && jRes.value && jRes.value.outAmount ? jRes.value : null;
        const rResp = rRes && rRes.status === 'fulfilled' && rRes.value && rRes.value.success && rRes.value.data && rRes.value.data.outputAmount
          ? rRes.value
          : null;

        const candidates = [];
        if (jQuote && /^\d+$/.test(String(jQuote.outAmount)) && BigInt(jQuote.outAmount) > 0n) {
          candidates.push({ source: 'Jupiter V1', outBig: BigInt(jQuote.outAmount), data: jQuote });
        }
        if (rResp && /^\d+$/.test(String(rResp.data.outputAmount)) && BigInt(rResp.data.outputAmount) > 0n) {
          candidates.push({ source: 'Raydium V1', outBig: BigInt(rResp.data.outputAmount), data: rResp });
        }

        if (candidates.length === 0) {
          const jErr = jRes && jRes.status === 'rejected'
            ? jRes.reason?.message
            : (jRes && jRes.status === 'fulfilled' && jRes.value && jRes.value.error);
          throw new Error(jErr || t('Jupiter / Raydium 暂无报价', 'Solana DEX quote unavailable'));
        }

        candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
        const best = candidates[0];
        const comparedPools = candidates.length;
        const routeLabel = comparedPools > 1
          ? `⚡ ${t('最优', 'Best')}: ${best.source} (${t(`比价 ${comparedPools} 池`, `${comparedPools} pools`)})`
          : best.source;

        if (best.source === 'Jupiter V1') {
          return {
            ...jQuote,
            bestSource: 'Jupiter V1',
            comparedPools,
            routeLabel,
            serviceFeeBps: solFeeBps,
            _jupiterQuote: jQuote,
            _raydiumRawResponse: rResp
          };
        }

        return {
          ...(jQuote || {}),
          inputMint,
          outputMint,
          inAmount: amtStr,
          outAmount: best.outBig.toString(),
          slippageBps: slip,
          bestSource: 'Raydium V1',
          comparedPools,
          routeLabel,
          serviceFeeBps: 0,
          _jupiterQuote: jQuote,
          _raydiumRawResponse: rResp
        };
      } finally {
        if (signal && onExtAbort) {
          try { signal.removeEventListener('abort', onExtAbort); } catch (_) {}
        }
      }
    });
  }

  function extractSolanaMpcSignatureBytes(mpcRes) {
    const sigObj = mpcRes && mpcRes.mpcSignature;
    if (!sigObj || !Array.isArray(sigObj.signature) || sigObj.signature.length !== 64) {
      throw new Error(t('NEAR MPC 未返回有效的 64 字节 Ed25519 签名', 'NEAR MPC did not return a valid 64-byte Ed25519 signature'));
    }
    return Uint8Array.from(sigObj.signature, (b) => Number(b) & 0xff);
  }

  async function signSolanaBase64Tx(base64Tx, solSeedHex, mpcWallet = null, mpcPath = 'solana-1') {
    const txBytes = base64ToBytes(base64Tx);
    const { value: numSigs, length: lenBytes } = decodeCompactU16(txBytes, 0);
    const msgOffset = lenBytes + numSigs * 64;
    const msgBytes = txBytes.slice(msgOffset);

    let sig;
    if (solSeedHex) {
      const cryptoEngine = getCryptoEngine();
      if (!cryptoEngine || typeof cryptoEngine.ed25519SignAsync !== 'function') {
        throw new Error(t('Ed25519 签名引擎不可用', 'NearCACrypto.ed25519SignAsync unavailable'));
      }
      sig = await cryptoEngine.ed25519SignAsync(msgBytes, solSeedHex);
    } else if (mpcWallet) {
      const mpcRes = await api.requestNearMpcChainSignature({
        wallet: mpcWallet,
        payloadBytes: msgBytes,
        path: mpcPath || 'solana-1',
        domainId: 1
      });
      sig = extractSolanaMpcSignatureBytes(mpcRes);
    } else {
      throw new Error(t('缺少 Solana 签名凭据', 'Solana signing credentials unavailable'));
    }

    txBytes.set(sig, lenBytes);
    return {
      txBytes,
      signedBase64: bytesToBase64(txBytes)
    };
  }

  async function signAndBroadcastSolanaBase64Tx(base64Tx, solSeedHex, mpcWallet = null, mpcPath = 'solana-1') {
    const { signedBase64 } = await signSolanaBase64Tx(base64Tx, solSeedHex, mpcWallet, mpcPath);

    const txHash = await callSolanaRpc(
      'sendTransaction',
      [signedBase64, { encoding: 'base64', skipPreflight: false, maxRetries: 3 }],
      15000
    );
    return {
      txHash,
      explorerUrl: `${SOLSCAN_TX}${txHash}`
    };
  }

  const SOL_ED25519_P = (1n << 255n) - 19n;
  function solModPow(base, exp, mod) {
    let res = 1n;
    let b = ((base % mod) + mod) % mod;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) res = (res * b) % mod;
      b = (b * b) % mod;
      e >>= 1n;
    }
    return res;
  }
  const SOL_ED25519_D = (((-121665n * solModPow(121666n, SOL_ED25519_P - 2n, SOL_ED25519_P)) % SOL_ED25519_P) + SOL_ED25519_P) % SOL_ED25519_P;

  function isEd25519OnCurve(bytes) {
    if (!bytes || bytes.length !== 32) return false;
    let y = 0n;
    for (let i = 0; i < 32; i++) {
      y |= BigInt(i === 31 ? (bytes[i] & 0x7f) : bytes[i]) << BigInt(i * 8);
    }
    if (y >= SOL_ED25519_P) return false;
    const y2 = (y * y) % SOL_ED25519_P;
    const u = (y2 - 1n + SOL_ED25519_P) % SOL_ED25519_P;
    const v = (SOL_ED25519_D * y2 + 1n) % SOL_ED25519_P;
    const v3 = (((v * v) % SOL_ED25519_P) * v) % SOL_ED25519_P;
    const v7 = (((v3 * v3) % SOL_ED25519_P) * v) % SOL_ED25519_P;
    const x = (((u * v3) % SOL_ED25519_P) * solModPow((u * v7) % SOL_ED25519_P, (SOL_ED25519_P - 5n) >> 3n, SOL_ED25519_P)) % SOL_ED25519_P;
    const check = (((v * x) % SOL_ED25519_P) * x) % SOL_ED25519_P;
    return check === u || check === (SOL_ED25519_P - u) % SOL_ED25519_P;
  }

  async function findSolanaPdaAsync(seeds, programIdBytes) {
    const marker = new TextEncoder().encode('ProgramDerivedAddress');
    for (let bump = 255; bump >= 0; bump--) {
      const parts = [...seeds.map((s) => (s instanceof Uint8Array ? s : new TextEncoder().encode(String(s)))), new Uint8Array([bump]), programIdBytes, marker];
      const digest = await sha256BytesAsync(concatUint8Arrays(parts));
      if (!isEd25519OnCurve(digest)) {
        return { bytes: digest, address: base58Encode(digest), bump };
      }
    }
    throw new Error(t('无法派生 Solana PDA', 'Unable to find Solana PDA'));
  }

  function decodeU64LE(bytes, offset = 0) {
    let val = 0n;
    for (let i = 0; i < 8; i++) {
      val |= BigInt(bytes[offset + i] || 0) << BigInt(i * 8);
    }
    return val;
  }

  async function buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions }) {
    const bhRes = await callSolanaRpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
    const blockhashStr = bhRes && bhRes.value && bhRes.value.blockhash;
    if (!blockhashStr) {
      throw new Error(t('获取 Solana 最新区块哈希失败', 'Failed to fetch Solana latest blockhash'));
    }
    const recentBlockhash = base58Decode(blockhashStr);
    const feePayerStr = wallet.solAddress;

    const metaMap = new Map();
    const recordAccount = (pubkeyStr, isSigner, isWritable) => {
      const prev = metaMap.get(pubkeyStr);
      if (prev) {
        prev.isSigner = prev.isSigner || Boolean(isSigner);
        prev.isWritable = prev.isWritable || Boolean(isWritable);
      } else {
        metaMap.set(pubkeyStr, { pubkeyStr, pubkeyBytes: base58Decode(pubkeyStr), isSigner: Boolean(isSigner), isWritable: Boolean(isWritable) });
      }
    };
    recordAccount(feePayerStr, true, true);
    for (const ix of instructions) {
      for (const acc of ix.keys) recordAccount(acc.pubkey, acc.isSigner, acc.isWritable);
      recordAccount(ix.programId, false, false);
    }

    const entries = Array.from(metaMap.values()).filter((e) => e.pubkeyStr !== feePayerStr);
    const wSigners = [metaMap.get(feePayerStr), ...entries.filter((e) => e.isSigner && e.isWritable)];
    const rSigners = entries.filter((e) => e.isSigner && !e.isWritable);
    const wNonSigners = entries.filter((e) => !e.isSigner && e.isWritable);
    const rNonSigners = entries.filter((e) => !e.isSigner && !e.isWritable);
    const ordered = [...wSigners, ...rSigners, ...wNonSigners, ...rNonSigners];
    const indexByKey = new Map(ordered.map((e, idx) => [e.pubkeyStr, idx]));

    const numReqSigs = wSigners.length + rSigners.length;
    const numRoSigned = rSigners.length;
    const numRoUnsigned = rNonSigners.length;

    const compiledIxs = instructions.map((ix) => {
      const progIdx = indexByKey.get(ix.programId);
      const keyIndices = Uint8Array.from(ix.keys.map((k) => indexByKey.get(k.pubkey)));
      const dataBytes = ix.data instanceof Uint8Array ? ix.data : Uint8Array.from(ix.data || []);
      return concatUint8Arrays([
        new Uint8Array([progIdx]),
        encodeCompactU16(keyIndices.length),
        keyIndices,
        encodeCompactU16(dataBytes.length),
        dataBytes
      ]);
    });

    const messageBytes = concatUint8Arrays([
      new Uint8Array([numReqSigs, numRoSigned, numRoUnsigned]),
      encodeCompactU16(ordered.length),
      ...ordered.map((e) => e.pubkeyBytes),
      recentBlockhash,
      encodeCompactU16(compiledIxs.length),
      ...compiledIxs
    ]);
    const unsignedTxBytes = concatUint8Arrays([
      encodeCompactU16(numReqSigs),
      new Uint8Array(numReqSigs * 64),
      messageBytes
    ]);
    return signAndBroadcastSolanaBase64Tx(bytesToBase64(unsignedTxBytes), wallet.solPrivateSeedHex || null, wallet, 'solana-1');
  }

  function resolveSolanaTokenDecimals(mint, fallback = 6) {
    if (mint === WSOL_MINT) return 9;
    if (mint === 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn') return 9;
    const registry = getTokenRegistry();
    if (registry) {
      const lists = [
        registry.UNIFIED_CORE_TOKENS,
        registry.DEX_CHAIN_TOKENS && registry.DEX_CHAIN_TOKENS.sol,
        registry.DEX_SWAP_TOKENS && registry.DEX_SWAP_TOKENS.sol
      ];
      for (const list of lists) {
        if (Array.isArray(list)) {
          const hit = list.find((item) => item && item.assetId === mint);
          if (hit && typeof hit.decimals === 'number') return hit.decimals;
        }
      }
    }
    return fallback;
  }

  async function executeSolanaJupiterSwap({
    wallet,
    quoteResponse,
    wrapAndUnwrapSol = true,
    feeAccount = null,
    tokenBalance = null,
    inputDecimals = null,
    gasBuffer = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    if (!quoteResponse || !quoteResponse.inputMint || !quoteResponse.inAmount) {
      throw new Error(t('缺少有效的 Jupiter 报价数据', 'Valid quoteResponse is required'));
    }

    const inputMint = quoteResponse.inputMint;
    if (inputMint === WSOL_MINT) {
      const amtSol = Number(fromBaseUnits(String(quoteResponse.inAmount), 9));
      validateSufficientChainBalance({
        wallet,
        chain: 'sol',
        tokenSymbol: 'SOL',
        amount: amtSol,
        isNative: true,
        gasBuffer
      });
    } else {
      const dec = typeof inputDecimals === 'number' ? inputDecimals : resolveSolanaTokenDecimals(inputMint, 6);
      const amtToken = Number(fromBaseUnits(String(quoteResponse.inAmount), dec));
      const cachedSplBal =
        tokenBalance !== null && tokenBalance !== undefined
          ? tokenBalance
          : (wallet.splBalances && wallet.splBalances[inputMint] !== undefined ? wallet.splBalances[inputMint] : null);
      if (cachedSplBal !== null) {
        validateSufficientChainBalance({
          wallet,
          chain: 'sol',
          tokenSymbol: 'SPL',
          amount: amtToken,
          isNative: false,
          tokenBalance: cachedSplBal
        });
      }
      validateSufficientChainBalance({
        wallet,
        chain: 'sol',
        tokenSymbol: 'SOL',
        amount: 0.002,
        isNative: false,
        tokenBalance: resolveWalletChainBalance(wallet, 'sol')
      });
    }

    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC Solana 地址不可用', 'NEAR Master Account or MPC Solana address unavailable'));
    }

    let activeQuote = quoteResponse;
    if (activeQuote.bestSource === 'Raydium V1' && activeQuote._raydiumRawResponse) {
      try {
        const ataProg = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
        const deriveAtaForMint = async (mintAddr) => {
          if (!mintAddr || mintAddr === WSOL_MINT) return undefined;
          const mInfo = await callSolanaRpc('getAccountInfo', [mintAddr, { encoding: 'jsonParsed' }], 4000).catch(() => null);
          const progId = mInfo?.value?.owner === SPL_TOKEN_2022_PROGRAM_ID ? SPL_TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID;
          const pda = await findSolanaPdaAsync(
            [base58Decode(wallet.solAddress), base58Decode(progId), base58Decode(mintAddr)],
            base58Decode(ataProg)
          );
          return pda.address;
        };
        const [inputAccount, outputAccount] = await Promise.all([
          deriveAtaForMint(inputMint),
          deriveAtaForMint(activeQuote.outputMint)
        ]);
        const rayBody = {
          computeUnitPriceMicroLamports: '100000',
          swapResponse: activeQuote._raydiumRawResponse,
          txVersion: 'V0',
          wallet: wallet.solAddress,
          wrapSol: inputMint === WSOL_MINT,
          unwrapSol: activeQuote.outputMint === WSOL_MINT
        };
        if (inputAccount) rayBody.inputAccount = inputAccount;
        if (outputAccount) rayBody.outputAccount = outputAccount;
        const rayBuild = await fetchJsonWithTimeout(
          `${RAYDIUM_API_URL}/transaction/swap-base-in`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rayBody)
          },
          12000
        );
        const rayTx = rayBuild && rayBuild.success && Array.isArray(rayBuild.data) && rayBuild.data[0]?.transaction;
        if (rayTx) {
          return signAndBroadcastSolanaBase64Tx(rayTx, wallet.solPrivateSeedHex || null, wallet, 'solana-1');
        }
      } catch (_) {}
      if (activeQuote._jupiterQuote) {
        activeQuote = activeQuote._jupiterQuote;
      } else {
        throw new Error(t('兑换交易构建失败，请刷新报价后重试', 'Swap transaction build failed. Please refresh quote and retry.'));
      }
    } else if (activeQuote._jupiterQuote) {
      activeQuote = activeQuote._jupiterQuote;
    }

    let resolvedFeeAccount = feeAccount;
    if (activeQuote.platformFee && !resolvedFeeAccount) {
      resolvedFeeAccount = await resolveSolanaFeeAta(activeQuote.outputMint);
      if (!resolvedFeeAccount) {
        const requoted = await api.quoteSolanaJupiterSwap({
          inputMint: activeQuote.inputMint,
          outputMint: activeQuote.outputMint,
          amountRaw: activeQuote.inAmount,
          slippageBps: activeQuote.slippageBps || 100,
          platformFeeBps: 0
        });
        activeQuote = requoted._jupiterQuote || requoted;
      }
    }

    const swapBody = {
      quoteResponse: activeQuote,
      userPublicKey: wallet.solAddress,
      wrapAndUnwrapSol: Boolean(wrapAndUnwrapSol)
    };
    if (resolvedFeeAccount) {
      swapBody.feeAccount = resolvedFeeAccount;
    }

    const swapRes = await fetchJsonWithTimeout(
      `${JUPITER_API_URL}/swap`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapBody)
      },
      12000
    );

    if (!swapRes || !swapRes.swapTransaction) {
      throw new Error(toUserFriendlyError(swapRes && swapRes.error, t('兑换交易构建失败，请稍后重试', 'Swap transaction build failed. Please try again.')));
    }

    return signAndBroadcastSolanaBase64Tx(swapRes.swapTransaction, wallet.solPrivateSeedHex || null, wallet, 'solana-1');
  }

  async function executeSolanaNativeTransfer({ wallet, toAddress, amountSol, gasBuffer = null } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const dest = String(toAddress || '').trim();
    const toPubkey = base58Decode(dest);
    if (toPubkey.length !== 32) {
      throw new Error(t('Solana 收款地址无效', 'Invalid Solana recipient address'));
    }

    validateSufficientChainBalance({
      wallet,
      chain: 'sol',
      tokenSymbol: 'SOL',
      amount: amountSol,
      isNative: true,
      gasBuffer
    });

    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC Solana 地址不可用', 'NEAR Master Account or MPC Solana address unavailable'));
    }

    const lamportsStr = toBaseUnits(amountSol, 9);
    if (BigInt(lamportsStr) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    const bhRes = await callSolanaRpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
    const blockhashStr = bhRes && bhRes.value && bhRes.value.blockhash;
    if (!blockhashStr) {
      throw new Error(t('获取 Solana 最新区块哈希失败', 'Failed to fetch Solana latest blockhash'));
    }
    const recentBlockhash = base58Decode(blockhashStr);
    const fromPubkey = base58Decode(wallet.solAddress);
    const systemProgramId = new Uint8Array(32); // 11111111111111111111111111111111

    const isSelf = bytesToHex(fromPubkey) === bytesToHex(toPubkey);
    const accountKeys = isSelf
      ? concatUint8Arrays([fromPubkey, systemProgramId])
      : concatUint8Arrays([fromPubkey, toPubkey, systemProgramId]);
    const accountCount = isSelf ? 2 : 3;
    const programIdIndex = isSelf ? 1 : 2;
    const ixAccountIndices = isSelf ? new Uint8Array([0, 0]) : new Uint8Array([0, 1]);
    const ixData = concatUint8Arrays([encodeU32LE(2), encodeU64LE(lamportsStr)]); // SystemInstruction::Transfer = 2

    const messageBytes = concatUint8Arrays([
      new Uint8Array([1, 0, 1]), // Header: 1 req sig, 0 ro signed, 1 ro unsigned
      encodeCompactU16(accountCount),
      accountKeys,
      recentBlockhash,
      encodeCompactU16(1), // 1 instruction
      new Uint8Array([programIdIndex]),
      encodeCompactU16(2),
      ixAccountIndices,
      encodeCompactU16(ixData.length),
      ixData
    ]);

    let sig;
    if (wallet.solPrivateSeedHex) {
      const cryptoEngine = getCryptoEngine();
      if (!cryptoEngine || typeof cryptoEngine.ed25519SignAsync !== 'function') {
        throw new Error(t('Ed25519 签名引擎不可用', 'NearCACrypto.ed25519SignAsync unavailable'));
      }
      sig = await cryptoEngine.ed25519SignAsync(messageBytes, wallet.solPrivateSeedHex);
    } else {
      const mpcRes = await api.requestNearMpcChainSignature({
        wallet,
        payloadBytes: messageBytes,
        path: 'solana-1',
        domainId: 1
      });
      sig = extractSolanaMpcSignatureBytes(mpcRes);
    }
    const signedTxBytes = concatUint8Arrays([encodeCompactU16(1), sig, messageBytes]);
    const signedBase64 = bytesToBase64(signedTxBytes);

    const txHash = await callSolanaRpc(
      'sendTransaction',
      [signedBase64, { encoding: 'base64', skipPreflight: false, maxRetries: 3 }],
      15000
    );
    return {
      txHash,
      explorerUrl: `${SOLSCAN_TX}${txHash}`
    };
  }

  /**
   * Solana SPL / Token-2022 代币同链/存款转账：
   * 自动识别 Mint 所属 Token Program，幂等创建接收方 ATA，构建 TransferChecked 指令并签名广播。
   */
  async function executeSolanaSplTransfer({
    wallet,
    mintAddress,
    toAddress,
    amount,
    decimals = null,
    programId = null,
    tokenBalance = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const mintStr = String(mintAddress || '').trim();
    const destStr = String(toAddress || '').trim();
    if (!mintStr) throw new Error(t('缺少 Solana 代币 Mint 地址', 'Missing Solana token mint address'));
    const mintPubkey = base58Decode(mintStr);
    const toPubkey = base58Decode(destStr);
    if (mintPubkey.length !== 32) throw new Error(t('Solana Mint 地址无效', 'Invalid Solana mint address'));
    if (toPubkey.length !== 32) throw new Error(t('Solana 收款地址无效', 'Invalid Solana recipient address'));

    const cachedSplBal =
      tokenBalance !== null && tokenBalance !== undefined
        ? Number(tokenBalance)
        : (wallet.splBalances && wallet.splBalances[mintStr] !== undefined && wallet.splBalances[mintStr] !== null
            ? Number(wallet.splBalances[mintStr])
            : null);
    validateSufficientChainBalance({
      wallet,
      chain: 'sol',
      tokenSymbol: 'SPL',
      amount,
      isNative: false,
      tokenBalance: Number.isFinite(cachedSplBal) ? cachedSplBal : 0
    });
    const solGasAvailPre = resolveWalletChainBalance(wallet, 'sol');
    if (solGasAvailPre < 0.00002) {
      throw new Error(t(`SOL 余额不足以支付交易费与 ATA 租金 (需至少 0.00002, 当前 ${solGasAvailPre.toFixed(5)} SOL)`, `Insufficient SOL for gas/ATA rent (Available: ${solGasAvailPre.toFixed(5)} SOL)`));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC Solana 地址不可用', 'NEAR Master Account or MPC Solana address unavailable'));
    }

    let dec = (decimals !== null && decimals !== undefined && Number.isFinite(Number(decimals))) ? Number(decimals) : null;
    let tokProg = programId ? String(programId).trim() : '';
    let mintAccInfo = null;
    if (!tokProg || dec === null) {
      mintAccInfo = await callSolanaRpc('getAccountInfo', [mintStr, { encoding: 'jsonParsed' }], 5000).catch(() => null);
      if (!tokProg) {
        const ownerProg = mintAccInfo && mintAccInfo.value && mintAccInfo.value.owner ? String(mintAccInfo.value.owner) : '';
        tokProg = ownerProg === SPL_TOKEN_2022_PROGRAM_ID ? SPL_TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID;
      }
      if (dec === null) {
        const parsedDec = mintAccInfo?.value?.data?.parsed?.info?.decimals;
        dec = Number.isFinite(Number(parsedDec)) ? Number(parsedDec) : resolveSolanaTokenDecimals(mintStr, 6);
      }
    }

    const rawAmtStr = toBaseUnits(amount, dec);
    if (!/^\d+$/.test(rawAmtStr) || BigInt(rawAmtStr) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    const ownerStr = wallet.solAddress;
    const ataProg = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
    const sysProg = '11111111111111111111111111111111';

    const sourceAta = await findSolanaPdaAsync(
      [base58Decode(ownerStr), base58Decode(tokProg), mintPubkey],
      base58Decode(ataProg)
    );
    const destAta = await findSolanaPdaAsync(
      [toPubkey, base58Decode(tokProg), mintPubkey],
      base58Decode(ataProg)
    );

    const destAtaInfo = await callSolanaRpc('getAccountInfo', [destAta.address, { encoding: 'base64' }], 4000).catch(() => null);
    const needAtaRent = !destAtaInfo || !destAtaInfo.value;
    const requiredSolGas = needAtaRent ? 0.00205 : 0.00002;
    const solGasAvail = resolveWalletChainBalance(wallet, 'sol');
    if (solGasAvail < requiredSolGas) {
      throw new Error(t(`SOL 余额不足以支付交易费与 ATA 租金 (需 ${requiredSolGas.toFixed(5)}, 当前 ${solGasAvail.toFixed(5)} SOL)`, `Insufficient SOL for gas/ATA rent (Need ${requiredSolGas.toFixed(5)}, Available: ${solGasAvail.toFixed(5)} SOL)`));
    }

    const instructions = [];
    // 幂等创建接收方 ATA（若已存在则合约无操作且不报错）
    instructions.push({
      programId: ataProg,
      keys: [
        { pubkey: ownerStr, isSigner: true, isWritable: true },
        { pubkey: destAta.address, isSigner: false, isWritable: true },
        { pubkey: destStr, isSigner: false, isWritable: false },
        { pubkey: mintStr, isSigner: false, isWritable: false },
        { pubkey: sysProg, isSigner: false, isWritable: false },
        { pubkey: tokProg, isSigner: false, isWritable: false }
      ],
      data: new Uint8Array([1]) // AssociatedTokenAccount::CreateIdempotent
    });

    // SPL Token Instruction::TransferChecked (opcode 12, u64 amount, u8 decimals)
    const ixData = concatUint8Arrays([
      new Uint8Array([12]),
      encodeU64LE(rawAmtStr),
      new Uint8Array([dec & 0xff])
    ]);
    instructions.push({
      programId: tokProg,
      keys: [
        { pubkey: sourceAta.address, isSigner: false, isWritable: true },
        { pubkey: mintStr, isSigner: false, isWritable: false },
        { pubkey: destAta.address, isSigner: false, isWritable: true },
        { pubkey: ownerStr, isSigner: true, isWritable: false }
      ],
      data: ixData
    });

    return buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions });
  }

  /**
   * Build SPL Token / Token-2022 Burn (opcode 8) + CloseAccount (opcode 9) instructions
   * to reclaim ATA rent lamports.
   */
  function buildSolanaCloseOrBurnInstructions({ ownerAddress, accounts = [] } = {}) {
    const ownerStr = String(ownerAddress || '').trim();
    if (!ownerStr) throw new Error(t('缺少 Solana 地址', 'Missing Solana address'));
    const instructions = [];
    for (const acc of accounts) {
      if (!acc || !acc.ataAddress || !acc.mint) continue;
      if (acc.hasWithheldFee) continue;
      const tokProg = acc.programId === SPL_TOKEN_2022_PROGRAM_ID ? SPL_TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID;
      const rawAmt = BigInt(String(acc.rawAmount || '0'));
      const isWsol = acc.mint === WSOL_MINT;
      if (rawAmt > 0n && !isWsol) {
        instructions.push({
          programId: tokProg,
          keys: [
            { pubkey: acc.ataAddress, isSigner: false, isWritable: true },
            { pubkey: acc.mint, isSigner: false, isWritable: true },
            { pubkey: ownerStr, isSigner: true, isWritable: false }
          ],
          data: concatUint8Arrays([new Uint8Array([8]), encodeU64LE(rawAmt.toString())])
        });
      }
      instructions.push({
        programId: tokProg,
        keys: [
          { pubkey: acc.ataAddress, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: true, isWritable: false }
        ],
        data: new Uint8Array([9])
      });
    }
    return instructions;
  }

  /**
   * Scan all SPL & Token-2022 accounts for an address to identify empty ATAs and dust (< $0.01) accounts.
   */
  async function scanSolanaReclaimableAccounts(solAddress, options = {}) {
    const addr = String(solAddress || '').trim();
    if (!addr) throw new Error(t('当前钱包未绑定 Solana 地址', 'Solana address unavailable'));
    const priceResolver = typeof options.priceResolver === 'function' ? options.priceResolver : null;

    const raceSolanaTokenRpc = (progId) =>
      Promise.any(
        SOLANA_RPC_ENDPOINTS.map(async (rpcUrl) => {
          const res = await fetchJsonWithTimeout(
            rpcUrl,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [addr, { programId: progId }, { encoding: 'jsonParsed' }]
              })
            },
            6500
          );
          if (res && !res.error && res.result !== undefined) return res.result;
          throw new Error((res && res.error && res.error.message) || 'Solana RPC error');
        })
      ).catch(() => null);

    const [splRes, t22Res] = await Promise.all([
      raceSolanaTokenRpc(SPL_TOKEN_PROGRAM_ID),
      raceSolanaTokenRpc(SPL_TOKEN_2022_PROGRAM_ID)
    ]);

    if (!splRes && !t22Res) {
      throw new Error(t('Solana 网络扫描失败，请稍后重试', 'Solana network scan failed, please retry'));
    }

    const accounts = [];
    const collect = (res, fallbackProg) => {
      const list = res && Array.isArray(res.value) ? res.value : [];
      for (const item of list) {
        const parsed = item?.account?.data?.parsed;
        const info = parsed && parsed.info;
        if (!info || !info.mint || !info.tokenAmount) continue;
        if (info.state === 'frozen') continue;
        const exts = Array.isArray(info.extensions) ? info.extensions : [];
        const hasWithheld = exts.some((ext) => ext && ext.extension === 'transferFeeAmount' && Number(ext.state?.withheldAmount || 0) > 0);
        if (hasWithheld) continue;
        const lamports = Number(item?.account?.lamports || 0);
        const rentSol = lamports / 1e9;
        const decimals = Number(info.tokenAmount.decimals || 0);
        const rawAmount = String(info.tokenAmount.amount || '0');
        const uiAmount = Number(fromBaseUnits(rawAmount, decimals));
        const isEmpty = BigInt(rawAmount) === 0n;
        const priceUsd = !isEmpty && priceResolver ? priceResolver(info.mint) : null;
        const usdValue = priceUsd !== null && Number.isFinite(Number(priceUsd)) ? uiAmount * Number(priceUsd) : null;
        const isDust = !isEmpty && usdValue !== null && usdValue < 0.01;
        accounts.push({
          ataAddress: item.pubkey,
          programId: item?.account?.owner || fallbackProg,
          mint: info.mint,
          lamports,
          rentSol,
          decimals,
          rawAmount,
          uiAmount,
          isEmpty,
          usdValue,
          isDust
        });
      }
    };

    collect(splRes, SPL_TOKEN_PROGRAM_ID);
    collect(t22Res, SPL_TOKEN_2022_PROGRAM_ID);

    accounts.sort((a, b) => {
      const rank = (x) => (x.isEmpty ? 0 : x.isDust ? 1 : 2);
      return rank(a) - rank(b) || b.lamports - a.lamports;
    });

    const emptyCount = accounts.filter((a) => a.isEmpty).length;
    const dustCount = accounts.filter((a) => a.isDust).length;
    const totalReclaimableSol = accounts
      .filter((a) => a.isEmpty || a.isDust)
      .reduce((sum, a) => sum + a.rentSol, 0);

    return { ok: true, accounts, emptyCount, dustCount, totalReclaimableSol };
  }

  /**
   * Reclaim SOL rent by closing empty ATAs and optionally burning dust tokens first.
   */
  async function executeSolanaRentReclaim({ wallet, accounts = [] } = {}) {
    if (!wallet || !wallet.solAddress) {
      throw new Error(t('Solana 地址不可用', 'Solana address unavailable'));
    }
    const list = Array.isArray(accounts) ? accounts.filter((a) => a && a.ataAddress && a.mint) : [];
    if (list.length === 0) {
      throw new Error(t('请选择至少一个可回收账户', 'Select at least one account to reclaim'));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const batchSize = 8;
    const batchCount = Math.max(1, Math.ceil(list.length / batchSize));
    validateSufficientChainBalance({
      wallet,
      chain: 'sol',
      tokenSymbol: 'SOL',
      amount: 0.00001 * batchCount,
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, 'sol')
    });

    const txHashes = [];
    for (let i = 0; i < list.length; i += batchSize) {
      const chunk = list.slice(i, i + batchSize);
      const instructions = buildSolanaCloseOrBurnInstructions({
        ownerAddress: wallet.solAddress,
        accounts: chunk
      });
      if (instructions.length === 0) continue;
      const res = await buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions });
      if (res && res.txHash) txHashes.push(res.txHash);
    }

    const closedCount = list.length;
    const burnedCount = list.filter((a) => BigInt(String(a.rawAmount || '0')) > 0n).length;
    const reclaimedSol = list.reduce((s, a) => s + Number(a.rentSol || 0), 0);
    return { ok: true, txHashes, closedCount, burnedCount, reclaimedSol };
  }

  const SOLANA_STAKE_PROGRAM_ID = 'Stake11111111111111111111111111111111111111';
  const SOLANA_SYSVAR_CLOCK = 'SysvarC1ock11111111111111111111111111111111';
  const SOLANA_SYSVAR_STAKE_HISTORY = 'SysvarStakeHistory1111111111111111111111111';

  function buildSolanaStakeDeactivateInstruction({ stakeAccount, authority } = {}) {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setUint32(0, 5, true); // StakeInstruction::Deactivate
    return {
      programId: SOLANA_STAKE_PROGRAM_ID,
      keys: [
        { pubkey: stakeAccount, isSigner: false, isWritable: true },
        { pubkey: SOLANA_SYSVAR_CLOCK, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: true, isWritable: false }
      ],
      data
    };
  }

  function buildSolanaStakeWithdrawInstruction({ stakeAccount, recipient, authority, lamports } = {}) {
    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    view.setUint32(0, 4, true); // StakeInstruction::Withdraw
    view.setBigUint64(4, BigInt(lamports || 0), true);
    return {
      programId: SOLANA_STAKE_PROGRAM_ID,
      keys: [
        { pubkey: stakeAccount, isSigner: false, isWritable: true },
        { pubkey: recipient, isSigner: false, isWritable: true },
        { pubkey: SOLANA_SYSVAR_CLOCK, isSigner: false, isWritable: false },
        { pubkey: SOLANA_SYSVAR_STAKE_HISTORY, isSigner: false, isWritable: false },
        { pubkey: authority, isSigner: true, isWritable: false }
      ],
      data
    };
  }

  async function deactivateSolanaStakeAccount({ wallet, stakeAccount } = {}) {
    if (!wallet || !wallet.solAddress || !stakeAccount) {
      throw new Error(t('缺少 Solana 质押账户地址', 'Missing Solana stake account address'));
    }
    await ensureWalletSigningKeysAsync(wallet);
    validateSufficientChainBalance({
      wallet,
      chain: 'sol',
      tokenSymbol: 'SOL',
      amount: 0.00001,
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, 'sol')
    });
    const ix = buildSolanaStakeDeactivateInstruction({ stakeAccount, authority: wallet.solAddress });
    const res = await buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions: [ix] });
    return { ok: true, txHash: res.txHash, explorerUrl: `${SOLSCAN_TX}${res.txHash}` };
  }

  async function withdrawSolanaStakeAccount({ wallet, stakeAccount, lamports } = {}) {
    if (!wallet || !wallet.solAddress || !stakeAccount) {
      throw new Error(t('缺少 Solana 质押账户地址', 'Missing Solana stake account address'));
    }
    await ensureWalletSigningKeysAsync(wallet);
    let withdrawLamports = lamports ? BigInt(lamports) : 0n;
    if (withdrawLamports <= 0n) {
      const info = await callSolanaRpc('getAccountInfo', [stakeAccount, { encoding: 'base64' }], 5000).catch(() => null);
      withdrawLamports = BigInt(info?.value?.lamports || 0);
    }
    if (withdrawLamports <= 0n) {
      throw new Error(t('该质押账户可提取 SOL 为 0', 'Stake account has 0 withdrawable lamports'));
    }
    validateSufficientChainBalance({
      wallet,
      chain: 'sol',
      tokenSymbol: 'SOL',
      amount: 0.00001,
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, 'sol')
    });
    const ix = buildSolanaStakeWithdrawInstruction({
      stakeAccount,
      recipient: wallet.solAddress,
      authority: wallet.solAddress,
      lamports: withdrawLamports.toString()
    });
    const res = await buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions: [ix] });
    return { ok: true, txHash: res.txHash, explorerUrl: `${SOLSCAN_TX}${res.txHash}` };
  }

