  // ==================== Live Native Gas & Exact MAX Sweep Estimator ====================

  const SOL_TRANSFER_FEE_LAMPORTS = 5000n;
  const SOL_DEX_SWAP_GAS_RESERVE = 0.0015;
  const NEAR_TRANSFER_DEFAULT_RESERVE = 0.002;
  const NEAR_DEX_SWAP_GAS_RESERVE = 0.005;
  const OP_STACK_CHAINS = new Set(['base', 'op', 'hood']);
  const OP_STACK_L1_PAD_WEI = 5000000000000n; // 0.000005 ETH L1 data fee safety margin

  async function estimateLiveNativeGasAsync({ wallet = null, chain, kind = 'transfer' } = {}) {
    const chainKey = String(chain || '').toLowerCase();
    const mode = kind === 'dex_swap' ? 'dex_swap' : 'transfer';
    const fallback = Number(DEFAULT_GAS_BUFFERS[chainKey] || 0);
    const makeFallback = () => ({
      chain: chainKey,
      kind: mode,
      gasReserve: fallback,
      exactFeeBaseUnits: null,
      liveBalanceBaseUnits: null,
      isLive: false,
      meta: {}
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
        return {
          chain: 'sol',
          kind: 'dex_swap',
          gasReserve: SOL_DEX_SWAP_GAS_RESERVE,
          exactFeeBaseUnits: '1500000',
          liveBalanceBaseUnits: null,
          isLive: true,
          meta: { feeLamports: '1500000' }
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
        if (mode === 'dex_swap') {
          return {
            chain: 'near',
            kind: 'dex_swap',
            gasReserve: NEAR_DEX_SWAP_GAS_RESERVE,
            exactFeeBaseUnits: null,
            liveBalanceBaseUnits: null,
            isLive: true,
            meta: {}
          };
        }
        const nearAcct = wallet ? String(wallet.nearNamedAccount || wallet.nearAddress || '').trim() : '';
        if (nearAcct) {
          const acctRes = await nearRpcPostAsync(
            {
              jsonrpc: '2.0',
              id: 'gas',
              method: 'query',
              params: { request_type: 'view_account', finality: 'final', account_id: nearAcct }
            },
            3500
          ).catch(() => null);
          if (acctRes && acctRes.result && acctRes.result.storage_usage !== undefined) {
            const storageBytes = BigInt(String(acctRes.result.storage_usage || '0'));
            const minReserveYocto = storageBytes * 10n ** 19n + 2n * 10n ** 20n;
            const minReserveNum = Number(fromBaseUnits(minReserveYocto.toString(), 24));
            const roundedReserve = Number.isFinite(minReserveNum) && minReserveNum > 0
              ? Math.max(NEAR_TRANSFER_DEFAULT_RESERVE, Math.ceil(minReserveNum * 1e6) / 1e6)
              : NEAR_TRANSFER_DEFAULT_RESERVE;
            return {
              chain: 'near',
              kind: 'transfer',
              gasReserve: roundedReserve,
              exactFeeBaseUnits: null,
              liveBalanceBaseUnits: acctRes.result.amount ? String(acctRes.result.amount) : null,
              isLive: true,
              meta: { storageUsage: String(acctRes.result.storage_usage) }
            };
          }
        }
        return {
          chain: 'near',
          kind: 'transfer',
          gasReserve: NEAR_TRANSFER_DEFAULT_RESERVE,
          exactFeeBaseUnits: null,
          liveBalanceBaseUnits: null,
          isLive: false,
          meta: {}
        };
      }
    } catch (_) {
      return makeFallback();
    }

    return makeFallback();
  }
