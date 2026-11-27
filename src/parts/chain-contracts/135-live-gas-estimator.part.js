  // ==================== Live Native Gas & Exact MAX Sweep Estimator ====================

  const SOL_TRANSFER_FEE_LAMPORTS = 5000n;
  const SOL_DEX_SWAP_GAS_RESERVE = 0.0015;
  const SOL_ATA_RENT_LAMPORTS = 2039280n; // 0.00203928 SOL exact 165-byte SPL ATA rent-exempt min
  const SOL_SWAP_COMPUTE_UNITS = 300000n;
  const SOL_SWAP_FEE_MIN_LAMPORTS = 100000n; // 0.0001 SOL lower bound
  const SOL_SWAP_FEE_MAX_LAMPORTS = 3000000n; // 0.003 SOL upper bound against extreme spikes
  const NEAR_TRANSFER_DEFAULT_RESERVE = 0.002;
  const NEAR_DEX_SWAP_GAS_RESERVE = 0.005;
  const NEAR_DEFAULT_STORAGE_DEPOSIT_YOCTO = 1250000000000000000000n; // 0.00125 NEAR
  const NEAR_MAX_STORAGE_DEPOSIT_YOCTO = 50000000000000000000000n; // 0.05 NEAR safety cap
  const NEAR_EXEC_TRANSFER_YOCTO = 200000000000000000000n; // 0.0002 NEAR
  const NEAR_EXEC_DEX_SWAP_YOCTO = 5000000000000000000000n; // 0.005 NEAR
  const NEAR_EXEC_HUB_YOCTO = 10000000000000000000000n; // 0.01 NEAR for cross-chain hub bridge-out
  const NEAR_MPC_EXTRA_YOCTO = 10000000000000000000000n; // 0.01 NEAR when v1.signer MPC is needed
  const NEAR_USDC_CONTRACT_GAS = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
  const OP_STACK_CHAINS = new Set(['base', 'op', 'hood']);
  const OP_STACK_L1_PAD_WEI = 5000000000000n; // 0.000005 ETH L1 data fee safety margin
  const DEST_DEX_EVM_FALLBACKS = {
    eth: 0.0015, base: 0.0003, arb: 0.0003, op: 0.0003, hood: 0.0003,
    bsc: 0.0005, pol: 0.05, avax: 0.005, hype: 0.0005, arc: 0.02
  };

  async function fetchSolanaDexFeeLamportsAsync({ timeoutMs = 3500, fallbackLamports = 1500000n } = {}) {
    const feesRes = await callSolanaRpc('getRecentPrioritizationFees', [], timeoutMs).catch(() => null);
    if (!Array.isArray(feesRes)) {
      return { isLive: false, execLamports: fallbackLamports, medianPriorityFee: null };
    }
    const vals = feesRes
      .map((item) => (item && item.prioritizationFee !== undefined ? Number(item.prioritizationFee) : NaN))
      .filter((n) => Number.isFinite(n) && n >= 0)
      .sort((a, b) => a - b);
    let medianMicro = 0;
    if (vals.length > 0) {
      const mid = Math.floor(vals.length / 2);
      medianMicro = vals.length % 2 === 1 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
    }
    const bufferedMicro = BigInt(Math.max(0, Math.round(medianMicro * 1.25)));
    const priorityLamports = (bufferedMicro * SOL_SWAP_COMPUTE_UNITS) / 1000000n;
    let execLamports = SOL_TRANSFER_FEE_LAMPORTS + priorityLamports + 50000n;
    if (execLamports < SOL_SWAP_FEE_MIN_LAMPORTS) execLamports = SOL_SWAP_FEE_MIN_LAMPORTS;
    if (execLamports > SOL_SWAP_FEE_MAX_LAMPORTS) execLamports = SOL_SWAP_FEE_MAX_LAMPORTS;
    return { isLive: true, execLamports, medianPriorityFee: medianMicro };
  }

  async function checkSolanaAtaMissingAsync({ wallet = null, mintAddress = null, isNewSolAta = null } = {}) {
    if (typeof isNewSolAta === 'boolean') return isNewSolAta;
    const mint = String(mintAddress || '').trim();
    if (!mint || mint === WSOL_MINT) return false;
    if (wallet && wallet.solAtaMints && wallet.solAtaMints[mint]) return false;
    if (wallet && wallet.solAddress) {
      const ataRes = await callSolanaRpc('getTokenAccountsByOwner', [wallet.solAddress, { mint }, { encoding: 'jsonParsed' }], 3000).catch(() => null);
      if (ataRes && Array.isArray(ataRes.value)) {
        return ataRes.value.length === 0;
      }
    }
    if (wallet && wallet.solAtaMints && typeof wallet.solAtaMints === 'object') {
      return !wallet.solAtaMints[mint];
    }
    if (wallet && wallet.splBalances && typeof wallet.splBalances === 'object') {
      return !Object.prototype.hasOwnProperty.call(wallet.splBalances, mint);
    }
    return false;
  }

  async function queryNearContractStorageDepositYoctoAsync(contractId, nearAcct, wallet = null) {
    const cid = String(contractId || '').trim();
    const acct = String(nearAcct || '').trim();
    if (!cid || !acct || cid.toLowerCase() === 'near') {
      return { known: true, registered: true, minYocto: 0n };
    }
    const checkCachedHoldings = () => {
      const entry = wallet && wallet.nearNep141Balances && wallet.nearNep141Balances[cid];
      if (!entry) return false;
      try {
        return /^\d+$/.test(String(entry.raw || '')) && BigInt(String(entry.raw)) > 0n;
      } catch (_) {
        return Number(entry.formatted || 0) > 0;
      }
    };
    try {
      const sbRes = await nearRpcPostAsync(
        {
          jsonrpc: '2.0',
          id: `${cid}-storage_balance_of`,
          method: 'query',
          params: {
            request_type: 'call_function',
            finality: 'final',
            account_id: cid,
            method_name: 'storage_balance_of',
            args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ account_id: acct })))
          }
        },
        3500
      );
      if (sbRes && sbRes.error) {
        if (/MethodNotFound|AccountDoesNotExist/i.test(JSON.stringify(sbRes.error))) {
          return { known: true, registered: true, minYocto: 0n };
        }
        return checkCachedHoldings()
          ? { known: false, registered: true, minYocto: 0n }
          : { known: false, registered: false, minYocto: NEAR_DEFAULT_STORAGE_DEPOSIT_YOCTO };
      }
      const bytes = sbRes && sbRes.result && sbRes.result.result;
      if (!Array.isArray(bytes)) {
        return checkCachedHoldings()
          ? { known: false, registered: true, minYocto: 0n }
          : { known: false, registered: false, minYocto: NEAR_DEFAULT_STORAGE_DEPOSIT_YOCTO };
      }
      const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
      if (decoded && typeof decoded === 'object' && BigInt(String(decoded.total || '0')) > 0n) {
        return { known: true, registered: true, minYocto: 0n };
      }
      if (decoded === null) {
        let minYocto = NEAR_DEFAULT_STORAGE_DEPOSIT_YOCTO;
        const bounds = await viewNearContractCall(cid, 'storage_balance_bounds', {}).catch(() => null);
        const minStr = bounds && typeof bounds === 'object' ? (bounds.min ?? bounds.minimum ?? null) : null;
        if (minStr !== null && minStr !== undefined && /^\d+$/.test(String(minStr)) && BigInt(String(minStr)) > 0n) {
          const parsedMin = BigInt(String(minStr));
          minYocto = parsedMin <= NEAR_MAX_STORAGE_DEPOSIT_YOCTO ? parsedMin : NEAR_MAX_STORAGE_DEPOSIT_YOCTO;
        } else {
          const legacyMin = await viewNearContractCall(cid, 'storage_minimum_balance', {}).catch(() => null);
          const legStr = legacyMin && typeof legacyMin === 'object' ? (legacyMin.min ?? legacyMin.minimum ?? null) : legacyMin;
          if (legStr !== null && legStr !== undefined && /^\d+$/.test(String(legStr)) && BigInt(String(legStr)) > 0n) {
            const parsedLeg = BigInt(String(legStr));
            minYocto = parsedLeg <= NEAR_MAX_STORAGE_DEPOSIT_YOCTO ? parsedLeg : NEAR_MAX_STORAGE_DEPOSIT_YOCTO;
          }
        }
        return { known: true, registered: false, minYocto };
      }
      return { known: true, registered: true, minYocto: 0n };
    } catch (_) {
      return checkCachedHoldings()
        ? { known: false, registered: true, minYocto: 0n }
        : { known: false, registered: false, minYocto: NEAR_DEFAULT_STORAGE_DEPOSIT_YOCTO };
    }
  }

  function analyzeNearEstimatorRoute({ wallet = null, mode = 'transfer', fromToken = null, toToken = null, quoteData = null } = {}) {
    const fromBc = String((fromToken && fromToken.blockchain) || '').toLowerCase();
    const toBc = String((toToken && toToken.blockchain) || '').toLowerCase();
    const isSameChainNear = Boolean(fromToken && toToken && fromBc === 'near' && toBc === 'near');
    const compType = quoteData && quoteData.compositeType ? String(quoteData.compositeType) : '';
    const stages = quoteData && Array.isArray(quoteData.stages) ? quoteData.stages : [];
    const isConfidential = compType === 'NEARCOM_CONFIDENTIAL_SWAP';
    const isDirect1Click = Boolean(quoteData && !compType && (quoteData.routeSource === 'NEAR_INTENTS_1CLICK' || quoteData.bestSource === '1Click Solver'));

    const fromSym = String((fromToken && fromToken.symbol) || '').toUpperCase();
    const toSym = String((toToken && toToken.symbol) || '').toUpperCase();
    const needsNearHub = !isConfidential && !isSameChainNear && Boolean(
      quoteData && (
        (compType === 'SMART_HUB_ROUTE' && stages.some((s) => s && (s.type === 'NEAR_SWAP' || s.type === 'BRIDGE_OUT'))) ||
        (((fromSym === 'PRL') !== (toSym === 'PRL')) && !isDirect1Click) ||
        ['PRL_TO_EXTERNAL', 'EXTERNAL_TO_PRL'].includes(compType)
      )
    );

    const originNeedsMpc = Boolean(wallet && (
      (fromBc === 'sol' && !wallet.solPrivateSeedHex) ||
      (EVM_CHAINS[fromBc] && !wallet.evmPrivateKey)
    ));
    const destNeedsMpc = Boolean(wallet && (
      (compType === 'SMART_HUB_ROUTE' && stages.some((s) => s && s.type === 'DEST_DEX' && ((s.chain === 'sol' && !wallet.solPrivateSeedHex) || (s.chain !== 'sol' && !wallet.evmPrivateKey)))) ||
      (compType === 'CROSS_CHAIN_TO_SOL_DEX' && !wallet.solPrivateSeedHex) ||
      (['CROSS_CHAIN_TO_EVM_DEX', 'CROSS_CHAIN_TO_ARC_MAINNET', 'EVM_TO_ARC_MAINNET', 'ARC_MAINNET_TO_CROSS_CHAIN'].includes(compType) && !wallet.evmPrivateKey)
    ));
    const needsMpcSign = Boolean(originNeedsMpc || destNeedsMpc);

    const contractsToCheck = [];
    const seen = new Set();
    const addContract = (cid) => {
      const c = String(cid || '').trim();
      if (!c || c.toLowerCase() === 'near' || seen.has(c)) return;
      seen.add(c);
      contractsToCheck.push(c);
    };
    const isDexOnNear = mode === 'dex_swap' || isSameChainNear || needsNearHub;
    const isNativeNearInput = !fromToken || (fromBc === 'near' && (!fromToken.contractAddress || fromToken.contractAddress === 'wrap.near' || fromSym === 'NEAR'));
    if (isDexOnNear && !isDirect1Click && isNativeNearInput) {
      addContract('wrap.near');
    }
    if (toToken && toBc === 'near' && toToken.contractAddress && toToken.contractAddress !== 'near') {
      addContract(toToken.contractAddress);
    }
    if (compType === 'PRL_TO_NEAR_DCL') {
      addContract(NEAR_USDC_CONTRACT_GAS);
    }

    return { isSameChainNear, isDirect1Click, needsNearHub, needsMpcSign, contractsToCheck };
  }

  /**
   * Estimates live target-chain gas for Stage 2 DEST_DEX swaps (near-zero residual dust in Auto mode).
   */
  async function estimateDestDexGasAsync({ chainKey, wallet = null, isNewSolAta = false } = {}) {
    const ck = String(chainKey || '').trim().toLowerCase();
    if (!ck) {
      return { chain: '', chainKey: '', kind: 'dest_dex', gasReserve: 0, exactFeeBaseUnits: null, isLive: false, isNewSolAta: false, meta: {} };
    }
    if (ck === 'sol') {
      const needAta = Boolean(isNewSolAta);
      const rentLamports = needAta ? SOL_ATA_RENT_LAMPORTS : 0n;
      const solFee = await fetchSolanaDexFeeLamportsAsync({ timeoutMs: 3500, fallbackLamports: 1000000n });
      const totalLamports = solFee.execLamports + rentLamports;
      const gasReserve = Number(fromBaseUnits(totalLamports.toString(), 9));
      return {
        chain: 'sol',
        chainKey: 'sol',
        kind: 'dest_dex',
        gasReserve,
        exactFeeBaseUnits: totalLamports.toString(),
        isLive: solFee.isLive,
        isNewSolAta: needAta,
        meta: {
          medianPriorityFee: solFee.medianPriorityFee,
          execLamports: solFee.execLamports.toString(),
          rentLamports: rentLamports.toString()
        }
      };
    }

    const fallbackEvm = DEST_DEX_EVM_FALLBACKS[ck] || Number(DEFAULT_GAS_BUFFERS[ck] || 0.0005);
    if (EVM_CHAINS[ck]) {
      try {
        const gasPriceRes = await callEvmRpc(ck, { jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }, 3500);
        if (gasPriceRes && gasPriceRes.result) {
          const rawGasPriceWei = BigInt(gasPriceRes.result);
          if (rawGasPriceWei > 0n) {
            const dexGasLimit = ck === 'arb' ? 600000n : 280000n;
            const l1PadWei = OP_STACK_CHAINS.has(ck) ? OP_STACK_L1_PAD_WEI : 0n;
            const totalWei = ((rawGasPriceWei * dexGasLimit * 115n) / 100n) + l1PadWei + 1n;
            const gasReserve = Number(fromBaseUnits(totalWei.toString(), 18));
            if (Number.isFinite(gasReserve) && gasReserve > 0) {
              return {
                chain: ck,
                chainKey: ck,
                kind: 'dest_dex',
                gasReserve,
                exactFeeBaseUnits: totalWei.toString(),
                isLive: true,
                isNewSolAta: false,
                meta: {
                  gasPriceWei: rawGasPriceWei.toString(),
                  gasLimit: dexGasLimit.toString(),
                  l1PadWei: l1PadWei.toString()
                }
              };
            }
          }
        }
      } catch (_) {}
      return { chain: ck, chainKey: ck, kind: 'dest_dex', gasReserve: fallbackEvm, exactFeeBaseUnits: null, isLive: false, isNewSolAta: false, meta: {} };
    }

    return {
      chain: ck,
      chainKey: ck,
      kind: 'dest_dex',
      gasReserve: Number(DEFAULT_GAS_BUFFERS[ck] || 0),
      exactFeeBaseUnits: null,
      isLive: false,
      isNewSolAta: false,
      meta: {}
    };
  }

  async function estimateLiveNativeGasAsync({
    wallet = null,
    chain,
    kind = 'transfer',
    fromToken = null,
    toToken = null,
    quoteData = null,
    isNewSolAta = null
  } = {}) {
    const chainKey = String(chain || '').toLowerCase();
    const mode = kind === 'dex_swap' ? 'dex_swap' : 'transfer';
    const fallback = Number(DEFAULT_GAS_BUFFERS[chainKey] || 0);
    const makeFallback = (customReserve = fallback, extraMeta = {}) => ({
      chain: chainKey,
      kind: mode,
      gasReserve: customReserve,
      exactFeeBaseUnits: null,
      liveBalanceBaseUnits: null,
      isLive: false,
      meta: extraMeta
    });

    try {
      if (chainKey === 'sol') {
        if (mode === 'transfer') {
          return {
            chain: 'sol',
            kind: 'transfer',
            gasReserve: 0.000005,
            exactFeeBaseUnits: SOL_TRANSFER_FEE_LAMPORTS.toString(),
            liveBalanceBaseUnits: null,
            isLive: true,
            meta: { feeLamports: SOL_TRANSFER_FEE_LAMPORTS.toString() }
          };
        }
        const mintAddr = toToken && toToken.contractAddress ? String(toToken.contractAddress).trim() : null;
        const [solFee, needAta] = await Promise.all([
          fetchSolanaDexFeeLamportsAsync({ timeoutMs: 3500, fallbackLamports: 1500000n }),
          checkSolanaAtaMissingAsync({ wallet, mintAddress: mintAddr, isNewSolAta })
        ]);
        const rentLamports = needAta ? SOL_ATA_RENT_LAMPORTS : 0n;
        const totalLamports = solFee.execLamports + rentLamports;
        const gasReserve = Number(fromBaseUnits(totalLamports.toString(), 9));
        return {
          chain: 'sol',
          kind: 'dex_swap',
          gasReserve,
          exactFeeBaseUnits: totalLamports.toString(),
          liveBalanceBaseUnits: null,
          isLive: solFee.isLive,
          meta: {
            feeLamports: totalLamports.toString(),
            execLamports: solFee.execLamports.toString(),
            rentLamports: rentLamports.toString(),
            medianPriorityFee: solFee.medianPriorityFee,
            isNewSolAta: needAta
          }
        };
      }

      if (EVM_CHAINS[chainKey]) {
        const fromAddr = wallet ? resolveWalletEvmSender(wallet) : null;
        const canQueryAddr = Boolean(fromAddr && /^0x[0-9a-fA-F]{40}$/.test(fromAddr));
        const gasPriceReq = callEvmRpc(chainKey, { jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }, 3500);
        const balReq = (mode === 'transfer' && canQueryAddr)
          ? callEvmRpc(chainKey, { jsonrpc: '2.0', id: 2, method: 'eth_getBalance', params: [fromAddr, 'latest'] }, 3500).catch(() => null)
          : Promise.resolve(null);
        const estReq = (mode === 'transfer' && canQueryAddr)
          ? callEvmRpc(chainKey, { jsonrpc: '2.0', id: 3, method: 'eth_estimateGas', params: [{ from: fromAddr, to: fromAddr, value: '0x0' }] }, 3500).catch(() => null)
          : Promise.resolve(null);

        const [gasPriceRes, balRes, estRes] = await Promise.all([gasPriceReq, balReq, estReq]);
        if (!gasPriceRes || !gasPriceRes.result) return makeFallback();

        let rawGasPriceWei = 0n;
        try {
          rawGasPriceWei = BigInt(gasPriceRes.result);
        } catch (_) {
          rawGasPriceWei = 0n;
        }
        if (rawGasPriceWei <= 0n) return makeFallback();

        const l1PadWei = OP_STACK_CHAINS.has(chainKey) ? OP_STACK_L1_PAD_WEI : 0n;
        if (mode === 'transfer') {
          let estGasLimit = 21000n;
          if (estRes && estRes.result) {
            try {
              const parsedEst = BigInt(estRes.result);
              if (parsedEst > 21000n) estGasLimit = parsedEst;
            } catch (_) {}
          }
          const gasLimit = estGasLimit > 21000n ? ((estGasLimit * 115n) / 100n) : 21000n;
          const lockedGasPriceWei = (rawGasPriceWei * 115n) / 100n + 1n;
          const exactFeeWei = gasLimit * lockedGasPriceWei + l1PadWei;
          const gasReserve = Number(fromBaseUnits(exactFeeWei.toString(), 18));
          if (!Number.isFinite(gasReserve) || gasReserve <= 0) return makeFallback();

          let liveBalanceBaseUnits = null;
          if (balRes && balRes.result) {
            try {
              liveBalanceBaseUnits = BigInt(balRes.result).toString();
            } catch (_) {
              liveBalanceBaseUnits = null;
            }
          }
          return {
            chain: chainKey,
            kind: 'transfer',
            gasReserve,
            exactFeeBaseUnits: exactFeeWei.toString(),
            liveBalanceBaseUnits,
            isLive: true,
            meta: {
              gasPriceWei: lockedGasPriceWei.toString(),
              gasLimit: gasLimit.toString(),
              l1PadWei: l1PadWei.toString()
            }
          };
        }

        const swapGasLimit = chainKey === 'arb' ? 600000n : 280000n;
        const bufferedPriceWei = (rawGasPriceWei * 125n) / 100n + 1n;
        const reserveWei = swapGasLimit * bufferedPriceWei + l1PadWei;
        const gasReserve = Number(fromBaseUnits(reserveWei.toString(), 18));
        if (!Number.isFinite(gasReserve) || gasReserve <= 0) return makeFallback();

        return {
          chain: chainKey,
          kind: 'dex_swap',
          gasReserve,
          exactFeeBaseUnits: reserveWei.toString(),
          liveBalanceBaseUnits: null,
          isLive: true,
          meta: {
            gasPriceWei: bufferedPriceWei.toString(),
            gasLimit: swapGasLimit.toString()
          }
        };
      }

      if (chainKey === 'btc') {
        const btcAddr = wallet && wallet.btcAddress ? String(wallet.btcAddress).trim() : '';
        const [utxos, sharedFeeRate] = await Promise.all([
          btcAddr ? btcApiRequestJson(`/address/${encodeURIComponent(btcAddr)}/utxo`, {}, 5000).catch(() => null) : Promise.resolve(null),
          fetchBtcFeeRateSatVb(4500).catch(() => 0)
        ]);

        let satPerVbyte = Number(sharedFeeRate) > 0 ? Number(sharedFeeRate) : 0;
        if (!Number.isFinite(satPerVbyte) || satPerVbyte <= 0) return makeFallback();
        satPerVbyte = Math.max(1, satPerVbyte);

        const spendable = Array.isArray(utxos)
          ? utxos.filter((u) => {
              if (!u || !u.txid || u.vout === undefined) return false;
              if (u.coinbase || (u.status && u.status.coinbase)) {
                const confs = Number(u.confirmations);
                if (!Number.isFinite(confs) || confs < 100) return false;
              }
              try {
                return BigInt(String(u.value || '0')) > 0n;
              } catch (_) {
                return false;
              }
            })
          : [];
        let totalSats = 0n;
        for (const u of spendable) {
          totalSats += BigInt(String(u.value));
        }
        const utxoCount = Math.max(1, spendable.length);
        const vbytes = 12 + utxoCount * 58 + 43; // 1-output zero-change sweep
        const exactFeeSats = BigInt(Math.max(150, Math.ceil(vbytes * satPerVbyte)));
        return {
          chain: 'btc',
          kind: mode,
          gasReserve: Number(exactFeeSats) / 1e8,
          exactFeeBaseUnits: exactFeeSats.toString(),
          liveBalanceBaseUnits: spendable.length > 0 ? totalSats.toString() : null,
          isLive: true,
          meta: { feeRateSatVb: satPerVbyte, utxoCount }
        };
      }

      if (chainKey === 'prl') {
        const prlAddr = wallet && wallet.address ? String(wallet.address).trim() : '';
        const [utxos, feeEst] = await Promise.all([
          prlAddr ? pearlBlockbookRequest(`/api/v2/utxo/${encodeURIComponent(prlAddr)}?confirmed=false`).catch(() => null) : Promise.resolve(null),
          pearlBlockbookRequest('/api/v2/estimatefee/2').catch(() => null)
        ]);
        const hasUtxoResp = Array.isArray(utxos);
        const hasFeeResp = Boolean(feeEst && feeEst.result !== undefined && Number(feeEst.result) > 0);
        if (!hasUtxoResp && !hasFeeResp) return makeFallback();

        const feePerKbPrl = hasFeeResp ? Number(feeEst.result) : 0.0066;
        const spendable = hasUtxoResp
          ? utxos.filter((u) => {
              if (!u || !u.txid || u.vout === undefined) return false;
              try {
                if (BigInt(String(u.value || '0')) <= 0n) return false;
              } catch (_) {
                return false;
              }
              const conf = Number(u.confirmations ?? 0);
              if (u.coinbase && (!Number.isFinite(conf) || conf < 100)) return false;
              return true;
            })
          : [];
        let totalGrains = 0n;
        for (const u of spendable) {
          totalGrains += BigInt(String(u.value));
        }
        const utxoCount = Math.max(1, spendable.length);
        const vbytes = 12 + utxoCount * 58 + 43;
        const exactFeeGrains = BigInt(Math.max(10000, Math.ceil((feePerKbPrl * 1e8 * vbytes) / 1000)));
        return {
          chain: 'prl',
          kind: mode,
          gasReserve: Number(exactFeeGrains) / 1e8,
          exactFeeBaseUnits: exactFeeGrains.toString(),
          liveBalanceBaseUnits: spendable.length > 0 ? totalGrains.toString() : null,
          isLive: true,
          meta: { feePerKbPrl, utxoCount }
        };
      }

      if (chainKey === 'near') {
        const routeInfo = analyzeNearEstimatorRoute({ wallet, mode, fromToken, toToken, quoteData });
        const nearAcct = wallet ? String(wallet.nearNamedAccount || wallet.nearAddress || '').trim() : '';
        const nearFallback = Number((
          (routeInfo.needsNearHub ? 0.02 : (mode === 'dex_swap' || routeInfo.isSameChainNear ? NEAR_DEX_SWAP_GAS_RESERVE : NEAR_TRANSFER_DEFAULT_RESERVE)) +
          (routeInfo.needsMpcSign ? 0.01 : 0)
        ).toFixed(6));

        if (nearAcct) {
          const [acctRes, ...storageChecks] = await Promise.all([
            nearRpcPostAsync(
              {
                jsonrpc: '2.0',
                id: 'gas',
                method: 'query',
                params: { request_type: 'view_account', finality: 'final', account_id: nearAcct }
              },
              3500
            ).catch(() => null),
            ...routeInfo.contractsToCheck.map((cid) => queryNearContractStorageDepositYoctoAsync(cid, nearAcct, wallet))
          ]);
          if (acctRes && acctRes.result && acctRes.result.storage_usage !== undefined) {
            const storageBytes = BigInt(String(acctRes.result.storage_usage || '0'));
            const storageLockYocto = storageBytes * 10n ** 19n;
            let missingDepositsYocto = 0n;
            for (const chk of storageChecks) {
              if (chk && !chk.registered) missingDepositsYocto += BigInt(chk.minYocto || 0n);
            }
            const execGasYocto = routeInfo.needsNearHub
              ? NEAR_EXEC_HUB_YOCTO
              : ((mode === 'dex_swap' || (routeInfo.isSameChainNear && !routeInfo.isDirect1Click)) ? NEAR_EXEC_DEX_SWAP_YOCTO : NEAR_EXEC_TRANSFER_YOCTO);
            const mpcGasYocto = routeInfo.needsMpcSign ? NEAR_MPC_EXTRA_YOCTO : 0n;
            let rawTotalYocto = storageLockYocto + missingDepositsYocto + execGasYocto + mpcGasYocto;
            if (mode === 'transfer' && !routeInfo.needsNearHub && !routeInfo.needsMpcSign && !routeInfo.isSameChainNear) {
              const minTransferYocto = 2000000000000000000000n; // 0.002 NEAR
              if (rawTotalYocto < minTransferYocto) rawTotalYocto = minTransferYocto;
            }
            const unitYocto = 10n ** 18n;
            const roundedYocto = ((rawTotalYocto + unitYocto - 1n) / unitYocto) * unitYocto;
            const gasReserve = Number(fromBaseUnits(roundedYocto.toString(), 24));
            if (Number.isFinite(gasReserve) && gasReserve > 0) {
              return {
                chain: 'near',
                kind: mode,
                gasReserve,
                exactFeeBaseUnits: roundedYocto.toString(),
                liveBalanceBaseUnits: acctRes.result.amount ? String(acctRes.result.amount) : null,
                isLive: true,
                meta: {
                  storageUsage: String(acctRes.result.storage_usage),
                  storageLockNear: Number(fromBaseUnits(storageLockYocto.toString(), 24)),
                  missingStorageDepositNear: Number(fromBaseUnits(missingDepositsYocto.toString(), 24)),
                  execGasNear: Number(fromBaseUnits(execGasYocto.toString(), 24)),
                  mpcGasNear: Number(fromBaseUnits(mpcGasYocto.toString(), 24)),
                  needsNearHub: routeInfo.needsNearHub,
                  needsMpcSign: routeInfo.needsMpcSign,
                  checkedContracts: routeInfo.contractsToCheck
                }
              };
            }
          }
        }
        return makeFallback(nearFallback, { needsNearHub: routeInfo.needsNearHub, needsMpcSign: routeInfo.needsMpcSign });
      }
    } catch (_) {
      return makeFallback();
    }

    return makeFallback();
  }
