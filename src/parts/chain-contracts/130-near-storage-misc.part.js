  const DEFAULT_NEAR_STORAGE_SCAN_CONTRACTS = [
    'wrap.near',
    'token.rhealab.near',
    'xtoken.rhealab.near',
    'otoken.rhealab.near',
    'lst.rhealab.near',
    'prl.omft.near',
    'qtc.omft.near',
    'usdt.tether-token.near',
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    'eth.omft.near',
    'sol.omft.near',
    'btc.omft.near',
    'meta-pool.near',
    'linear-protocol.near',
    'v2-nearx.stader-labs.near'
  ];

  const KNOWN_NEAR_STORAGE_META = {
    'wrap.near': { symbol: 'wNEAR', decimals: 24 },
    'token.rhealab.near': { symbol: 'RHEA', decimals: 18 },
    'xtoken.rhealab.near': { symbol: 'xRHEA', decimals: 18 },
    'otoken.rhealab.near': { symbol: 'oRHEA', decimals: 18 },
    'lst.rhealab.near': { symbol: 'rNEAR', decimals: 24 },
    'prl.omft.near': { symbol: 'PRL', decimals: 8 },
    'qtc.omft.near': { symbol: 'QTC', decimals: 12 },
    'usdt.tether-token.near': { symbol: 'USDT', decimals: 6 },
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { symbol: 'USDC', decimals: 6 },
    'eth.omft.near': { symbol: 'ETH', decimals: 18 },
    'sol.omft.near': { symbol: 'SOL', decimals: 9 },
    'btc.omft.near': { symbol: 'BTC', decimals: 8 },
    'meta-pool.near': { symbol: 'stNEAR', decimals: 24 },
    'linear-protocol.near': { symbol: 'LiNEAR', decimals: 24 },
    'v2-nearx.stader-labs.near': { symbol: 'NearX', decimals: 24 }
  };

  /**
   * Scans NEP-141 token contracts on NEAR Mainnet for locked NEP-145 storage deposits (`storage_balance_of`)
   * and distinguishes empty accounts (`ft_balance_of === 0`, safe to unregister and reclaim) from held positions.
   */
  async function scanNearReclaimableStorageAsync(nearAccountId) {
    const acct = String(nearAccountId || '').trim().toLowerCase();
    if (!acct) throw new Error(t('NEAR 账户地址不可用', 'NEAR account address unavailable'));

    const candidateSet = new Set(DEFAULT_NEAR_STORAGE_SCAN_CONTRACTS);
    const fnResp = await fetchJsonWithTimeout(`https://api.fastnear.com/v1/account/${encodeURIComponent(acct)}/ft`, {}, 4000).catch(() => null);
    const fnList = (fnResp && Array.isArray(fnResp.tokens))
      ? fnResp.tokens
      : (fnResp && fnResp.data && Array.isArray(fnResp.data.tokens) ? fnResp.data.tokens : null);
    if (fnList) {
      for (const tok of fnList) {
        if (tok && tok.contract_id) {
          const cid = String(tok.contract_id).trim().toLowerCase();
          if (cid && cid !== 'near') candidateSet.add(cid);
        }
      }
    }

    const candidates = Array.from(candidateSet).slice(0, 25);
    const registry = (typeof globalThis !== 'undefined' && globalThis.NearCATokens) || (typeof window !== 'undefined' && window.NearCATokens) || null;
    const nearDexTokens = (registry && registry.DEX_CHAIN_TOKENS && Array.isArray(registry.DEX_CHAIN_TOKENS.near))
      ? registry.DEX_CHAIN_TOKENS.near
      : [];

    const resolveMeta = (cid) => {
      if (KNOWN_NEAR_STORAGE_META[cid]) return KNOWN_NEAR_STORAGE_META[cid];
      const dexMatch = nearDexTokens.find((tk) => tk && String(tk.contractAddress || '').toLowerCase() === cid);
      if (dexMatch) return { symbol: dexMatch.symbol, decimals: typeof dexMatch.decimals === 'number' ? dexMatch.decimals : 18 };
      if (registry && typeof registry.findTokenByAssetId === 'function') {
        const regMatch = registry.findTokenByAssetId(`nep141:${cid}`, 'near');
        if (regMatch) return { symbol: regMatch.symbol, decimals: typeof regMatch.decimals === 'number' ? regMatch.decimals : 18 };
      }
      return { symbol: (cid.split('.')[0] || cid).toUpperCase(), decimals: 18 };
    };

    const accounts = [];
    const concurrency = 6;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const idx = cursor++;
        const cid = candidates[idx];
        const [storageBal, ftBal] = await Promise.all([
          viewNearContractCall(cid, 'storage_balance_of', { account_id: acct }).catch(() => null),
          viewNearContractCall(cid, 'ft_balance_of', { account_id: acct }).catch(() => null)
        ]);
        if (!storageBal || typeof storageBal !== 'object') continue;
        const totalYoctoStr = String(storageBal.total || '0').trim();
        if (!/^\d+$/.test(totalYoctoStr) || BigInt(totalYoctoStr) <= 0n) continue;

        const depositNear = Number(fromBaseUnits(totalYoctoStr, 24));
        const rawBalStr = ftBal !== null && ftBal !== undefined && /^\d+$/.test(String(ftBal).trim())
          ? String(ftBal).trim()
          : '0';
        const isEmpty = BigInt(rawBalStr) === 0n;
        const meta = resolveMeta(cid);
        const uiAmount = Number(fromBaseUnits(rawBalStr, meta.decimals));

        accounts.push({
          contractId: cid,
          symbol: meta.symbol,
          decimals: meta.decimals,
          totalYocto: totalYoctoStr,
          depositNear: Number.isFinite(depositNear) ? depositNear : 0,
          rawAmount: rawBalStr,
          uiAmount: Number.isFinite(uiAmount) ? uiAmount : 0,
          isEmpty,
          canReclaim: isEmpty
        });
      }
    });
    await Promise.all(workers);

    accounts.sort((a, b) => {
      if (a.isEmpty !== b.isEmpty) return a.isEmpty ? -1 : 1;
      return b.depositNear - a.depositNear;
    });

    const emptyAccounts = accounts.filter((a) => a.isEmpty);
    const lockedCount = accounts.length - emptyAccounts.length;
    const totalReclaimableNear = emptyAccounts.reduce((sum, a) => sum + Number(a.depositNear || 0), 0);

    return {
      ok: true,
      accounts,
      emptyCount: emptyAccounts.length,
      lockedCount,
      totalReclaimableNear
    };
  }

  /**
   * Unregisters selected zero-balance NEP-141 token contracts (`storage_unregister`) to reclaim NEAR storage deposits.
   */
  async function executeNearStorageReclaim({ wallet, contracts = [] } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const list = (Array.isArray(contracts) ? contracts : [])
      .map((item) => (typeof item === 'string' ? { contractId: item } : item))
      .filter((item) => item && item.contractId);
    if (list.length === 0) {
      throw new Error(t('请选择至少一个可回收合约', 'Select at least one contract to reclaim'));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }

    validateSufficientChainBalance({
      wallet,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: Math.max(0.002, 0.0005 * list.length),
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, 'near')
    });

    const txHashes = [];
    for (const item of list) {
      const cid = String(item.contractId).trim();
      const liveBal = await viewNearContractCall(cid, 'ft_balance_of', { account_id: accountId }).catch(() => null);
      if (liveBal !== null && liveBal !== undefined && /^\d+$/.test(String(liveBal).trim()) && BigInt(String(liveBal).trim()) > 0n) {
        throw new Error(t(`${cid} 仍有代币余额，禁止强制注销`, `${cid} still has token balance; cannot unregister safely`));
      }
      const txHash = await api.signAndSendNearFunctionCall({
        accountId,
        publicKeyStr: wallet.nearPublicKey,
        privateKeyStr: wallet.nearPrivateKey,
        receiverId: cid,
        methodName: 'storage_unregister',
        argsJson: JSON.stringify({ force: false }),
        gas: '30000000000000',
        depositYocto: '1'
      });
      if (txHash) txHashes.push(txHash);
    }

    return {
      ok: true,
      txHashes,
      reclaimedCount: txHashes.length
    };
  }

  /**
   * Executes a Rhea / Ref CLMM swap on NEAR Mainnet via `ft_transfer_call` to `dclv2.ref-labs.near`.
   */
  async function executeNearDclPoolSwap({
    wallet,
    poolIds = null,
    tokenIn,
    tokenOut,
    amountRaw,
    minAmountOut = '0',
    slippageBps = 100,
    tokenBalance = null,
    inputDecimals = 6,
    tokenSymbol = 'TOKEN'
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'Swap amount must be positive'));
    }

    const humanAmount = Number(fromBaseUnits(amtStr, inputDecimals));
    if (tokenBalance !== null && tokenBalance !== undefined) {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol,
        amount: humanAmount,
        isNative: inId === WRAP_NEAR_CONTRACT,
        gasBuffer: 0.01,
        tokenBalance
      });
    } else {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: inId === WRAP_NEAR_CONTRACT ? humanAmount + 0.01 : 0.01,
        isNative: false,
        tokenBalance: resolveWalletChainBalance(wallet, 'near')
      });
    }

    const resolvedWallet = await ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    if (!sender || !resolvedWallet.nearPublicKey || !resolvedWallet.nearPrivateKey) {
      throw new Error(t('缺少 NEAR 签名凭据', 'Missing NEAR signing credentials'));
    }

    let targetPoolIds = Array.isArray(poolIds) && poolIds.length > 0 ? poolIds : null;
    let resolvedMinOut = minAmountOut && String(minAmountOut) !== '0' ? String(minAmountOut) : '';
    let expectedOut = null;
    if (!targetPoolIds || !resolvedMinOut) {
      const q = await quoteNearDclPoolSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps });
      if (!q.ok || !q.poolIds.length) {
        throw new Error(q.error || t('DCL 池路由不可用', 'DCL pool route unavailable'));
      }
      targetPoolIds = targetPoolIds || q.poolIds;
      resolvedMinOut = resolvedMinOut || q.minAmountOut || '0';
      expectedOut = q.amountOut;
    }

    let preWrapBal = null;
    if (outId === WRAP_NEAR_CONTRACT) {
      const preStr = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'ft_balance_of', { account_id: sender }).catch(() => null);
      if (preStr !== null && preStr !== undefined && /^\d+$/.test(String(preStr).trim())) {
        preWrapBal = BigInt(String(preStr).trim());
      }
    }

    const prep = await prepareNearSwapFundingAndStorage({ resolvedWallet, sender, inId, outId, amtStr });

    let txHash;
    try {
      txHash = await api.signAndSendNearFunctionCall({
        accountId: sender,
        publicKeyStr: resolvedWallet.nearPublicKey,
        privateKeyStr: resolvedWallet.nearPrivateKey,
        receiverId: inId,
        methodName: 'ft_transfer_call',
        argsJson: JSON.stringify({
          receiver_id: DCL_CONTRACT_ID,
          amount: amtStr,
          msg: JSON.stringify({
            Swap: {
              pool_ids: targetPoolIds,
              output_token: outId,
              min_output_amount: String(resolvedMinOut || '0')
            }
          })
        }),
        gas: '180000000000000',
        depositYocto: '1'
      });
    } catch (swapErr) {
      if (prep && prep.wrappedShortfallYocto && BigInt(prep.wrappedShortfallYocto) > 0n) {
        const curWrapStr = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'ft_balance_of', { account_id: sender }).catch(() => null);
        const curWrapBig = curWrapStr && /^\d+$/.test(String(curWrapStr).trim()) ? BigInt(String(curWrapStr).trim()) : 0n;
        const rollbackAmt = curWrapBig >= BigInt(prep.wrappedShortfallYocto) ? BigInt(prep.wrappedShortfallYocto) : curWrapBig;
        if (rollbackAmt > 0n) {
          await unwrapNearToNativeAsync({ resolvedWallet, accountId: sender, amountYocto: rollbackAmt.toString() }).catch(() => {});
        }
      }
      throw swapErr;
    }

    if (outId === WRAP_NEAR_CONTRACT && preWrapBal !== null) {
      const postStr = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'ft_balance_of', { account_id: sender }).catch(() => null);
      if (postStr !== null && postStr !== undefined && /^\d+$/.test(String(postStr).trim())) {
        const postWrapBal = BigInt(String(postStr).trim());
        const gained = postWrapBal > preWrapBal ? (postWrapBal - preWrapBal) : 0n;
        if (gained > 0n) {
          await unwrapNearToNativeAsync({ resolvedWallet, accountId: sender, amountYocto: gained.toString() }).catch(() => {});
        }
      }
    }

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
      isDcl: true,
      routeSource: 'Ref DCL',
      label: 'Rhea CLMM (dclv2.ref-labs.near)',
      tokenIn: inId,
      tokenOut: outId,
      amountIn: amtStr,
      amountOut: expectedOut
    };
  }

  /**
   * Executes a Ref Finance swap on NEAR Mainnet via `ft_transfer_call` to `v2.ref-finance.near`
   * (or delegates to `dclv2.ref-labs.near` for DCL pools).
   */
  async function executeNearRefFinanceSwap({
    wallet,
    routeData = null,
    actions = null,
    poolIds = null,
    minAmountOut = '0',
    tokenIn,
    tokenOut,
    amountRaw,
    slippageBps = 100,
    tokenBalance = null,
    inputDecimals = 8,
    tokenSymbol = 'TOKEN'
  } = {}) {
    if ((routeData && routeData.isDcl) || (Array.isArray(poolIds) && poolIds.length > 0)) {
      return executeNearDclPoolSwap({
        wallet,
        poolIds: (poolIds && poolIds.length ? poolIds : routeData?.poolIds),
        tokenIn,
        tokenOut,
        amountRaw,
        minAmountOut: (minAmountOut && minAmountOut !== '0' ? minAmountOut : routeData?.min_amount_out) || '0',
        slippageBps,
        tokenBalance,
        inputDecimals,
        tokenSymbol
      });
    }

    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'Swap amount must be positive'));
    }

    const humanAmount = Number(fromBaseUnits(amtStr, inputDecimals));
    if (tokenBalance !== null && tokenBalance !== undefined) {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol,
        amount: humanAmount,
        isNative: inId === WRAP_NEAR_CONTRACT,
        gasBuffer: 0.01,
        tokenBalance
      });
    } else {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: inId === WRAP_NEAR_CONTRACT ? humanAmount + 0.01 : 0.01,
        isNative: false,
        tokenBalance: resolveWalletChainBalance(wallet, 'near')
      });
    }

    const resolvedWallet = await ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    if (!sender || !resolvedWallet.nearPublicKey || !resolvedWallet.nearPrivateKey) {
      throw new Error(t('缺少 NEAR 签名凭据', 'Missing NEAR signing credentials'));
    }

    let swapActions = Array.isArray(actions) && actions.length > 0 ? actions : null;
    let expectedOut = null;
    if (!swapActions && routeData && Array.isArray(routeData.routes)) {
      swapActions = [];
      for (const route of routeData.routes) {
        for (const p of (route.pools || [])) {
          const act = {
            pool_id: Number(p.pool_id),
            token_in: String(p.token_in),
            token_out: String(p.token_out),
            min_amount_out: String(p.min_amount_out || '0')
          };
          if (p.amount_in && String(p.amount_in) !== '0') act.amount_in = String(p.amount_in);
          swapActions.push(act);
        }
      }
      expectedOut = routeData.amount_out ? String(routeData.amount_out) : null;
    }

    if (!swapActions || swapActions.length === 0) {
      const q = await quoteNearRefFinanceSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps });
      if (q.ok && q.isDcl) {
        return executeNearDclPoolSwap({
          wallet,
          poolIds: q.poolIds,
          tokenIn: inId,
          tokenOut: outId,
          amountRaw: amtStr,
          minAmountOut: q.minAmountOut,
          slippageBps,
          tokenBalance,
          inputDecimals,
          tokenSymbol
        });
      }
      if (!q.ok || !q.actions.length) {
        throw new Error(q.error || t('Ref Finance 路由不可用', 'Ref Finance route unavailable'));
      }
      swapActions = q.actions;
      expectedOut = q.amountOut;
    }

    let preWrapBal = null;
    if (outId === WRAP_NEAR_CONTRACT) {
      const preStr = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'ft_balance_of', { account_id: sender }).catch(() => null);
      if (preStr !== null && preStr !== undefined && /^\d+$/.test(String(preStr).trim())) {
        preWrapBal = BigInt(String(preStr).trim());
      }
    }

    const prep = await prepareNearSwapFundingAndStorage({ resolvedWallet, sender, inId, outId, amtStr });

    let txHash;
    try {
      txHash = await api.signAndSendNearFunctionCall({
        accountId: sender,
        publicKeyStr: resolvedWallet.nearPublicKey,
        privateKeyStr: resolvedWallet.nearPrivateKey,
        receiverId: inId,
        methodName: 'ft_transfer_call',
        argsJson: JSON.stringify({
          receiver_id: REF_FINANCE_CONTRACT,
          amount: amtStr,
          msg: JSON.stringify({
            force: 0,
            actions: swapActions
          })
        }),
        gas: '180000000000000',
        depositYocto: '1'
      });
    } catch (swapErr) {
      if (prep && prep.wrappedShortfallYocto && BigInt(prep.wrappedShortfallYocto) > 0n) {
        const curWrapStr = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'ft_balance_of', { account_id: sender }).catch(() => null);
        const curWrapBig = curWrapStr && /^\d+$/.test(String(curWrapStr).trim()) ? BigInt(String(curWrapStr).trim()) : 0n;
        const rollbackAmt = curWrapBig >= BigInt(prep.wrappedShortfallYocto) ? BigInt(prep.wrappedShortfallYocto) : curWrapBig;
        if (rollbackAmt > 0n) {
          await unwrapNearToNativeAsync({ resolvedWallet, accountId: sender, amountYocto: rollbackAmt.toString() }).catch(() => {});
        }
      }
      throw swapErr;
    }

    if (outId === WRAP_NEAR_CONTRACT && preWrapBal !== null) {
      const postStr = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'ft_balance_of', { account_id: sender }).catch(() => null);
      if (postStr !== null && postStr !== undefined && /^\d+$/.test(String(postStr).trim())) {
        const postWrapBal = BigInt(String(postStr).trim());
        const gained = postWrapBal > preWrapBal ? (postWrapBal - preWrapBal) : 0n;
        if (gained > 0n) {
          await unwrapNearToNativeAsync({ resolvedWallet, accountId: sender, amountYocto: gained.toString() }).catch(() => {});
        }
      }
    }

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
      routeSource: 'Ref Finance',
      label: 'Ref Finance (v2.ref-finance.near)',
      tokenIn: inId,
      tokenOut: outId,
      amountIn: amtStr,
      amountOut: expectedOut
    };
  }

  /**
   * NEAR 验证节点全额解质押 (unstake_all)
   */
  async function unstakeFromNearValidator({ wallet, validatorId } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const vid = String(validatorId || '').trim();
    if (!vid) throw new Error(t('缺少验证节点合约地址', 'Missing validator contract ID'));
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.02) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: vid,
      methodName: 'unstake_all',
      argsJson: '{}',
      gas: '80000000000000',
      depositYocto: '0'
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, validatorId: vid };
  }

  /**
   * NEAR 验证节点提取已冷却余额 (withdraw_all)
   */
  async function withdrawFromNearValidator({ wallet, validatorId } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const vid = String(validatorId || '').trim();
    if (!vid) throw new Error(t('缺少验证节点合约地址', 'Missing validator contract ID'));
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.02) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: vid,
      methodName: 'withdraw_all',
      argsJson: '{}',
      gas: '80000000000000',
      depositYocto: '0'
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, validatorId: vid };
  }

  /**
   * Aave V3 借贷池提取本息 (withdraw(address asset, uint256 amount, address to))
   */
  async function withdrawFromAaveV3({ wallet, poolId, amount = 'max' } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const pool = findStakingPool(poolId);
    if (!pool || !pool.isAaveV3) {
      throw new Error(t('未找到对应的 Aave V3 借贷池', 'Aave V3 pool not found'));
    }
    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.evmPrivateKey && !hasNearMpc) {
      throw new Error(t('EVM 签名凭据不可用', 'EVM signing credentials unavailable'));
    }
    const gasBal = resolveWalletChainBalance(wallet, pool.chain);
    const minGas = DEFAULT_GAS_BUFFERS[pool.chain] || 0.001;
    if (gasBal < minGas) {
      throw new Error(t(`${pool.chainLabel} 原生 Gas 不足 (当前: ${gasBal.toFixed(5)})`, `Insufficient native gas on ${pool.chainLabel} (Available: ${gasBal.toFixed(5)})`));
    }
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库不可用', 'EVM signer library unavailable'));
    const evmSender = resolveWalletEvmSender(wallet, ethersLib);
    const rawAmt = String(amount).toLowerCase() === 'max'
      ? ethersLib.MaxUint256
      : toBaseUnits(amount, pool.decimals || 6);
    const iface = new ethersLib.Interface(['function withdraw(address asset, uint256 amount, address to) returns (uint256)']);
    const data = iface.encodeFunctionData('withdraw', [pool.tokenContract, rawAmt, evmSender]);
    const res = wallet.evmPrivateKey
      ? await sendEvmSignedTransaction({ chainKey: pool.chain, privateKey: wallet.evmPrivateKey, to: pool.contract, data, value: '0' })
      : await sendEvmMpcSignedTransaction({ wallet, chainKey: pool.chain, to: pool.contract, data, value: '0', path: 'ethereum-1' });
    return { ...res, poolId: pool.id };
  }

  /**
   * Burrow (contract.main.burrow.near) 借贷池提取 (execute Withdraw)
   */
  async function withdrawFromBurrow({ wallet, tokenContract, amount, decimals = 24 } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const tokenId = String(tokenContract || '').trim();
    if (!tokenId) throw new Error(t('缺少 Burrow 代币合约地址', 'Missing Burrow token contract'));
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.05) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }
    const isMax = typeof amount === 'string' && amount.trim().toLowerCase() === 'max';
    let withdrawAction = { token_id: tokenId };
    if (!isMax) {
      const baseDec = Number(decimals) || (tokenId === 'wrap.near' ? 24 : 6);
      const assetInfo = await viewNearContractCall('contract.main.burrow.near', 'get_asset', { token_id: tokenId }).catch(() => null);
      const extraDec = assetInfo && assetInfo.config && assetInfo.config.extra_decimals !== undefined
        ? Number(assetInfo.config.extra_decimals)
        : null;
      const internalDec = extraDec !== null && Number.isFinite(extraDec)
        ? (baseDec + extraDec)
        : (tokenId === 'wrap.near' || baseDec === 24 ? 24 : 18);
      const rawBurrowAmt = toBaseUnits(amount, internalDec);
      if (!/^\d+$/.test(rawBurrowAmt) || BigInt(rawBurrowAmt) <= 0n) {
        throw new Error(t('提取数量必须大于 0', 'Withdraw amount must be positive'));
      }
      withdrawAction = { token_id: tokenId, max_amount: rawBurrowAmt };
    }
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: 'contract.main.burrow.near',
      methodName: 'execute',
      argsJson: JSON.stringify({
        actions: [{
          Withdraw: withdrawAction
        }]
      }),
      gas: '120000000000000',
      depositYocto: '1'
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, tokenContract: tokenId };
  }

  /**
   * 批量读取用户在 EVM / Arc / HyperEVM 上的活跃理财与质押持仓（Aave V3、Ethena sUSDe 含冷却、Steakhouse ERC-4626、stETH、kHYPE）
   */
  async function fetchEvmAccountStakingPositionsAsync(wallet) {
    const evmAddr = wallet && (wallet.evmPrivateKey ? (wallet.evmAddress || wallet.mpcEvmAddress) : (wallet.mpcEvmAddress || wallet.evmAddress));
    if (!evmAddr || !/^0x[0-9a-fA-F]{40}$/.test(String(evmAddr))) return [];
    const addrLower = String(evmAddr).toLowerCase();
    const paddedAddr = addrLower.replace(/^0x/, '').padStart(64, '0');
    const balCallData = '0x70a08231' + paddedAddr;
    const positions = [];

    const ethCalls = [
      { target: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', allowFailure: true, callData: balCallData }, // 0: Lido stETH
      { target: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', allowFailure: true, callData: balCallData }, // 1: aEthUSDC
      { target: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', allowFailure: true, callData: balCallData }, // 2: aEthWETH
      { target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', allowFailure: true, callData: balCallData }, // 3: sUSDe shares
      { target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', allowFailure: true, callData: '0x01320fe2' + paddedAddr }, // 4: cooldowns(address)
      { target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', allowFailure: true, callData: '0x35269315' } // 5: cooldownDuration()
    ];

    const [ethMcRes, baseRes, arbRes, arcRes, hypeRes] = await Promise.all([
      callEvmRpc(
        'eth',
        {
          jsonrpc: '2.0',
          id: 'evm_pos_eth',
          method: 'eth_call',
          params: [{ to: MULTICALL3_ADDRESS, data: encodeMulticall3Aggregate3(ethCalls) }, 'latest']
        },
        6000
      ).catch(() => null),
      ethReadCall('base', '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', balCallData, 5500).catch(() => null),
      ethReadCall('arb', '0x724dc807b04555b71Ed48a6896b6F41593b8C637', balCallData, 5500).catch(() => null),
      ethReadCall('arc', '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', balCallData, 5500).catch(() => null),
      ethReadCall('hype', '0xfD739d4e423301CE9385c1fb8850539D657C296D', balCallData, 5500).catch(() => null)
    ]);

    const decodedEth = ethMcRes && typeof ethMcRes.result === 'string'
      ? decodeMulticall3Aggregate3Result(ethMcRes.result)
      : null;

    if (decodedEth && decodedEth.length >= 4) {
      if (decodedEth[0].success) {
        const raw = sliceEvmUint256WordHex(decodedEth[0].returnData, 0);
        const amt = Number(fromBaseUnits(raw, 18));
        if (amt > 0.00001) {
          positions.push({
            type: 'liquid_lst',
            poolId: 'lido_steth',
            chain: 'eth',
            symbol: 'stETH',
            outSymbol: 'ETH',
            amount: amt,
            rawAmount: raw,
            decimals: 18,
            canExit: true,
            title: 'Lido Staked ETH',
            subtitle: t('可随时在链上兑换回 ETH', 'Exit stETH to ETH anytime')
          });
        }
      }
      if (decodedEth[1].success) {
        const raw = sliceEvmUint256WordHex(decodedEth[1].returnData, 0);
        const amt = Number(fromBaseUnits(raw, 6));
        if (amt > 0.0001) {
          positions.push({
            type: 'aave_v3',
            poolId: 'aave_eth_usdc',
            chain: 'eth',
            symbol: 'USDC',
            outSymbol: 'aEthUSDC',
            amount: amt,
            rawAmount: raw,
            decimals: 6,
            canWithdraw: true,
            title: 'Aave V3 Ethereum USDC',
            subtitle: t('计息存款，随时可提取', 'Earning yield — withdraw anytime')
          });
        }
      }
      if (decodedEth[2].success) {
        const raw = sliceEvmUint256WordHex(decodedEth[2].returnData, 0);
        const amt = Number(fromBaseUnits(raw, 18));
        if (amt > 0.00001) {
          positions.push({
            type: 'aave_v3',
            poolId: 'aave_eth_weth',
            chain: 'eth',
            symbol: 'WETH',
            outSymbol: 'aEthWETH',
            amount: amt,
            rawAmount: raw,
            decimals: 18,
            canWithdraw: true,
            title: 'Aave V3 Ethereum ETH',
            subtitle: t('计息存款，随时可提取', 'Earning yield — withdraw anytime')
          });
        }
      }
      const susdeSharesRaw = decodedEth[3].success ? sliceEvmUint256WordHex(decodedEth[3].returnData, 0) : '0';
      const susdeAmt = Number(fromBaseUnits(susdeSharesRaw, 18));
      const cooldownEnd = decodedEth[4] && decodedEth[4].success ? Number(sliceEvmUint256WordHex(decodedEth[4].returnData, 0)) : 0;
      const underlyingCooldownRaw = decodedEth[4] && decodedEth[4].success ? sliceEvmUint256WordHex(decodedEth[4].returnData, 1) : '0';
      const underlyingCooldownAmt = Number(fromBaseUnits(underlyingCooldownRaw, 18));
      const cooldownDuration = decodedEth[5] && decodedEth[5].success ? Number(sliceEvmUint256WordHex(decodedEth[5].returnData, 0)) : 604800;
      const nowSec = Math.floor(Date.now() / 1000);
      if (susdeAmt > 0.0001 || underlyingCooldownAmt > 0.0001) {
        const canUnstakeCooldown = underlyingCooldownAmt > 0.0001 && nowSec >= cooldownEnd;
        const waitingCooldown = underlyingCooldownAmt > 0.0001 && nowSec < cooldownEnd;
        const needsCooldown = cooldownDuration > 0 && susdeAmt > 0.0001 && !canUnstakeCooldown;
        positions.push({
          type: 'erc4626',
          poolId: 'ethena_susde',
          chain: 'eth',
          symbol: canUnstakeCooldown || waitingCooldown ? 'USDe' : 'sUSDe',
          outSymbol: 'USDe',
          amount: susdeAmt > 0.0001 ? susdeAmt : underlyingCooldownAmt,
          sharesRaw: susdeSharesRaw,
          cooldownEnd,
          cooldownDuration,
          underlyingCooldownAmount: underlyingCooldownAmt,
          canRedeem: cooldownDuration === 0 && susdeAmt > 0.0001,
          canUnstakeCooldown,
          needsCooldown,
          title: 'Ethena Staked USDe',
          subtitle: canUnstakeCooldown
            ? t(`冷却已完成 (${underlyingCooldownAmt.toFixed(2)} USDe 可领取)`, `Cooldown ready (${underlyingCooldownAmt.toFixed(2)} USDe claimable)`)
            : waitingCooldown
              ? t(`冷却解锁中 (${underlyingCooldownAmt.toFixed(2)} USDe)`, `Cooldown in progress (${underlyingCooldownAmt.toFixed(2)} USDe)`)
              : (cooldownDuration > 0 ? t('点击发起解质押冷却', 'Initiate unstake cooldown') : t('随时可赎回 USDe', 'Redeem anytime'))
        });
      }
    }

    const pushAave = (rawHex, poolId, decimals, symbol, title) => {
      if (!rawHex) return;
      const raw = sliceEvmUint256WordHex(rawHex, 0);
      const amt = Number(fromBaseUnits(raw, decimals));
      if (amt > 0.0001) {
        positions.push({
          type: 'aave_v3',
          poolId,
          chain: findStakingPool(poolId)?.chain || 'base',
          symbol,
          outSymbol: findStakingPool(poolId)?.outSymbol || symbol,
          amount: amt,
          rawAmount: raw,
          decimals,
          canWithdraw: true,
          title,
          subtitle: t('计息存款，随时可提取', 'Earning yield — withdraw anytime')
        });
      }
    };

    pushAave(baseRes, 'aave_base_usdc', 6, 'USDC', 'Aave V3 Base USDC');
    pushAave(arbRes, 'aave_arb_usdc', 6, 'USDC', 'Aave V3 Arbitrum USDC');

    if (arcRes) {
      const sharesRaw = sliceEvmUint256WordHex(arcRes, 0);
      const sharesAmt = Number(fromBaseUnits(sharesRaw, 18));
      if (sharesAmt > 0.0001) {
        const pool = findStakingPool('arc_steak_usdc');
        const rate = pool && pool.rate > 0 ? (1 / pool.rate) : 1;
        positions.push({
          type: 'erc4626',
          poolId: 'arc_steak_usdc',
          chain: 'arc',
          symbol: 'USDC',
          outSymbol: 'steakUSDC',
          amount: sharesAmt * rate,
          sharesAmount: sharesAmt,
          sharesRaw,
          canRedeem: true,
          title: 'Steakhouse Prime (Arc)',
          subtitle: t('ERC-4626 凭证，可随时赎回 USDC', 'ERC-4626 vault — redeem USDC anytime')
        });
      }
    }

    if (hypeRes) {
      const raw = sliceEvmUint256WordHex(hypeRes, 0);
      const amt = Number(fromBaseUnits(raw, 18));
      if (amt > 0.00001) {
        positions.push({
          type: 'liquid_lst',
          poolId: 'hyper_khype',
          chain: 'hype',
          symbol: 'kHYPE',
          outSymbol: 'HYPE',
          amount: amt,
          rawAmount: raw,
          decimals: 18,
          canExit: true,
          title: 'Kinetiq kHYPE',
          subtitle: t('可随时兑换回 HYPE', 'Exit kHYPE to HYPE anytime')
        });
      }
    }

    return positions;
  }

  /**
   * NEAR 流动性质押合约解质押/提取 (lst.rhealab.near, meta-pool.near, linear-protocol.near, v2-nearx.stader-labs.near, xtoken.rhealab.near)
   */
  async function unstakeFromNearLst({
    wallet,
    contractId,
    amount = null,
    action = 'unstake_all',
    requestId = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const cid = String(contractId || '').trim();
    const allowedContracts = new Set([
      'lst.rhealab.near',
      'meta-pool.near',
      'linear-protocol.near',
      'v2-nearx.stader-labs.near',
      'xtoken.rhealab.near'
    ]);
    if (!allowedContracts.has(cid)) {
      throw new Error(t(`不支持的 NEAR 质押合约: ${cid}`, `Unsupported NEAR LST contract: ${cid}`));
    }
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.03) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }

    let methodName = String(action || 'unstake_all');
    let argsObj = {};
    let depositYocto = '0';
    let gas = '80000000000000';

    if (cid === 'xtoken.rhealab.near') {
      depositYocto = '1'; // xtoken.rhealab.near methods are #[payable]
      gas = '100000000000000';
      if (methodName === 'claim_unstake') {
        if (!requestId) throw new Error(t('缺少 xRHEA 解质押请求 ID', 'Missing xRHEA unstake request ID'));
        argsObj = { request_id: String(requestId) };
      } else {
        methodName = 'unstake';
        const rawAmt = toBaseUnits(amount, 18);
        if (!/^\d+$/.test(rawAmt) || BigInt(rawAmt) <= 0n) {
          throw new Error(t('解质押数量必须大于 0', 'Unstake amount must be positive'));
        }
        argsObj = { amount: rawAmt, client_echo: null };
      }
    } else if (methodName === 'liquid_unstake') {
      if (cid !== 'meta-pool.near') {
        throw new Error(t('仅 Meta Pool 支持 liquid_unstake', 'Only Meta Pool supports liquid_unstake'));
      }
      const rawAmt = toBaseUnits(amount, 24);
      if (!/^\d+$/.test(rawAmt) || BigInt(rawAmt) <= 0n) {
        throw new Error(t('解质押数量必须大于 0', 'Unstake amount must be positive'));
      }
      const est = await viewNearContractCall('meta-pool.near', 'get_near_amount_sell_st_near', { st_near_amount: rawAmt }).catch(() => null);
      const minExpected = est && /^\d+$/.test(String(est))
        ? computeSlippageMinAmount(String(est), 200)
        : '1';
      argsObj = { st_near_to_burn: rawAmt, min_expected_near: minExpected };
    } else if (methodName === 'unstake') {
      const rawAmt = toBaseUnits(amount, 24);
      if (!/^\d+$/.test(rawAmt) || BigInt(rawAmt) <= 0n) {
        throw new Error(t('解质押数量必须大于 0', 'Unstake amount must be positive'));
      }
      argsObj = { amount: rawAmt };
    } else if (methodName === 'withdraw_all' || methodName === 'unstake_all') {
      argsObj = {};
    } else {
      throw new Error(t(`不支持的操作类型: ${methodName}`, `Unsupported action: ${methodName}`));
    }

    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: cid,
      methodName,
      argsJson: JSON.stringify(argsObj),
      gas,
      depositYocto
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, contractId: cid, action: methodName };
  }

  /**
   * Rhea oRHEA 锁仓到期领取 (orhea-conv.rhealab.near claim / batch_claim, depositYocto: '0')
   */
  async function claimRheaOrheaConversion({ wallet, conversionIds = [] } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.03) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }

    let ids = Array.isArray(conversionIds) ? conversionIds.filter(Boolean).map((x) => String(x)) : [];
    if (ids.length === 0) {
      const convs = await viewNearContractCall('orhea-conv.rhealab.near', 'get_account_conversions', { account_id: accountId }).catch(() => null);
      const nowNs = BigInt(Date.now()) * 1000000n;
      if (Array.isArray(convs)) {
        for (const c of convs) {
          if (!c) continue;
          const cid = c.conversion_id ?? c.id;
          const relTime = BigInt(String(c.release_timestamp ?? c.unlock_time ?? c.end_timestamp ?? '0'));
          if (cid !== undefined && cid !== null && relTime > 0n && relTime <= nowNs) {
            ids.push(String(cid));
          }
        }
      }
    }
    if (ids.length === 0) {
      throw new Error(t('暂无已到期可领取的 oRHEA 兑换记录', 'No matured oRHEA conversions ready to claim'));
    }

    const useBatch = ids.length > 1;
    const methodName = useBatch ? 'batch_claim' : 'claim';
    const argsJson = useBatch
      ? JSON.stringify({ account_id: accountId, conversion_ids: ids })
      : JSON.stringify({ account_id: accountId, conversion_id: ids[0] });
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: 'orhea-conv.rhealab.near',
      methodName,
      argsJson,
      gas: useBatch ? '150000000000000' : '100000000000000',
      depositYocto: '0'
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, claimedCount: ids.length, conversionIds: ids };
  }

  /**
   * EVM / Arc ERC-4626 金库赎回（支持 Steakhouse Prime USDC redeem 以及 Ethena sUSDe 冷却 cooldownShares -> unstake）
   */
  async function redeemErc4626Vault({ wallet, poolId, shares = 'max', mode = 'auto' } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const pool = findStakingPool(poolId);
    if (!pool || !pool.isErc4626) {
      throw new Error(t('未找到对应的 ERC-4626 理财金库', 'ERC-4626 vault pool not found'));
    }
    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.evmPrivateKey && !hasNearMpc) {
      throw new Error(t('EVM 签名凭据不可用', 'EVM signing credentials unavailable'));
    }
    const gasBal = resolveWalletChainBalance(wallet, pool.chain);
    const minGas = DEFAULT_GAS_BUFFERS[pool.chain] || 0.001;
    if (gasBal < minGas) {
      throw new Error(t(`${pool.chainLabel} 原生 Gas 不足 (当前: ${gasBal.toFixed(5)})`, `Insufficient native gas on ${pool.chainLabel} (Available: ${gasBal.toFixed(5)})`));
    }
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library unavailable'));
    const evmSender = resolveWalletEvmSender(wallet, ethersLib);
    const sendCall = (data) => (wallet.evmPrivateKey
      ? sendEvmSignedTransaction({ chainKey: pool.chain, privateKey: wallet.evmPrivateKey, to: pool.contract, data, value: '0' })
      : sendEvmMpcSignedTransaction({ wallet, chainKey: pool.chain, to: pool.contract, data, value: '0', path: 'ethereum-1' }));

    const paddedSender = evmSender.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const balHex = await ethReadCall(pool.chain, pool.contract, '0x70a08231' + paddedSender, 6000);
    const currentSharesBig = balHex ? BigInt(sliceEvmUint256WordHex(balHex, 0)) : 0n;
    const requestedSharesBig = String(shares).toLowerCase() === 'max'
      ? currentSharesBig
      : BigInt(toBaseUnits(shares, pool.outDecimals || 18));

    if (pool.id === 'ethena_susde') {
      const ethenaIface = new ethersLib.Interface([
        'function cooldownDuration() view returns (uint24)',
        'function cooldowns(address) view returns (uint104 cooldownEnd, uint152 underlyingAmount)',
        'function cooldownShares(uint256 shares) returns (uint256 assets)',
        'function unstake(address receiver)',
        'function redeem(uint256 shares, address receiver, address _owner) returns (uint256 assets)'
      ]);
      const [cdDurHex, cdStateHex] = await Promise.all([
        ethReadCall(pool.chain, pool.contract, ethenaIface.encodeFunctionData('cooldownDuration', []), 5500),
        ethReadCall(pool.chain, pool.contract, ethenaIface.encodeFunctionData('cooldowns', [evmSender]), 5500)
      ]);
      const cdDur = cdDurHex ? Number(sliceEvmUint256WordHex(cdDurHex, 0)) : 604800;
      const cooldownEnd = cdStateHex ? Number(sliceEvmUint256WordHex(cdStateHex, 0)) : 0;
      const underlyingAmt = cdStateHex ? BigInt(sliceEvmUint256WordHex(cdStateHex, 1)) : 0n;
      const nowSec = Math.floor(Date.now() / 1000);

      if (cdDur > 0) {
        if (mode === 'unstake' || (underlyingAmt > 0n && nowSec >= cooldownEnd)) {
          const data = ethenaIface.encodeFunctionData('unstake', [evmSender]);
          const res = await sendCall(data);
          return { ...res, poolId: pool.id, step: 'unstaked' };
        }
        if (requestedSharesBig > 0n) {
          const data = ethenaIface.encodeFunctionData('cooldownShares', [requestedSharesBig.toString()]);
          const res = await sendCall(data);
          return { ...res, poolId: pool.id, step: 'cooldown_started' };
        }
        if (underlyingAmt > 0n && nowSec < cooldownEnd) {
          const remainHours = Math.max(1, Math.ceil((cooldownEnd - nowSec) / 3600));
          throw new Error(t(`sUSDe 仍在冷却期中，预计约 ${remainHours} 小时后可领取 USDe`, `sUSDe cooldown active (~${remainHours}h remaining)`));
        }
        throw new Error(t('无可赎回或待领取的 sUSDe 持仓', 'No sUSDe balance or matured cooldown to claim'));
      }
    }

    if (requestedSharesBig <= 0n) {
      throw new Error(t('金库可赎回份额为 0', 'No vault shares available to redeem'));
    }
    const erc4626Iface = new ethersLib.Interface([
      'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)'
    ]);
    const data = erc4626Iface.encodeFunctionData('redeem', [requestedSharesBig.toString(), evmSender, evmSender]);
    const res = await sendCall(data);
    return { ...res, poolId: pool.id, step: 'redeemed' };
  }

  /**
   * Jupiter DAO (voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj) 解锁与提取 JUP
   * 支持 toggleMaxLock(false) 开启 30 天解锁倒计时，以及到期后执行 withdraw 提取 JUP
   */
  async function unstakeJupiterDao({ wallet, action = 'auto' } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
      throw new Error(t('Solana 签名凭据不可用', 'Solana signing credentials unavailable'));
    }
    const solGas = resolveWalletChainBalance(wallet, 'sol');
    if (solGas < DEFAULT_GAS_BUFFERS.sol) {
      throw new Error(t(`SOL 余额不足以支付交易费 (当前: ${solGas.toFixed(4)} SOL)`, `Insufficient SOL for gas (Available: ${solGas.toFixed(4)} SOL)`));
    }

    const ownerStr = wallet.solAddress;
    const voterProgId = 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj';
    const lockerStr = 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN';
    const jupMintStr = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
    const tokProg = SPL_TOKEN_PROGRAM_ID;
    const ataProg = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
    const sysProg = '11111111111111111111111111111111';

    const escrowPda = await findSolanaPdaAsync(
      [new TextEncoder().encode('Escrow'), base58Decode(lockerStr), base58Decode(ownerStr)],
      base58Decode(voterProgId)
    );
    const escrowInfo = await callSolanaRpc('getAccountInfo', [escrowPda.address, { encoding: 'base64' }], 6000);
    if (!escrowInfo || !escrowInfo.value || !escrowInfo.value.data || !escrowInfo.value.data[0]) {
      throw new Error(t('未找到您的 Jupiter DAO 锁仓账户', 'Jupiter DAO escrow account not found'));
    }
    const buf = base64ToBytes(String(escrowInfo.value.data[0]));
    if (buf.length < 162) {
      throw new Error(t('Jupiter DAO Escrow 账户数据长度异常', 'Invalid Jupiter DAO escrow account data'));
    }
    const amountRaw = decodeU64LE(buf, 105);
    const escrowEndsAtRaw = decodeU64LE(buf, 121);
    const escrowEndsAtSec = Number(BigInt.asIntN(64, escrowEndsAtRaw));
    const isMaxLock = buf[161] === 1;
    const nowSec = Math.floor(Date.now() / 1000);
    if (amountRaw <= 0n) {
      throw new Error(t('Jupiter DAO 当前可提取 JUP 数量为 0', 'No locked JUP in Jupiter DAO escrow'));
    }

    const instructions = [];
    let performedStep = '';
    if (action === 'toggle_max_lock' || (action === 'auto' && isMaxLock)) {
      if (!isMaxLock) {
        throw new Error(t('当前已处于解锁倒计时状态，无需重复关闭永久锁仓', 'Max lock is already disabled'));
      }
      instructions.push({
        programId: voterProgId,
        keys: [
          { pubkey: lockerStr, isSigner: false, isWritable: false },
          { pubkey: escrowPda.address, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: true, isWritable: false }
        ],
        data: hexToBytes('a39da184b36b7f8f00') // toggle_max_lock(is_max_lock: false)
      });
      performedStep = 'cooldown_started';
    } else if (!isMaxLock && nowSec >= escrowEndsAtSec) {
      const [escrowTokensPda, destTokensPda] = await Promise.all([
        findSolanaPdaAsync([escrowPda.bytes, base58Decode(tokProg), base58Decode(jupMintStr)], base58Decode(ataProg)),
        findSolanaPdaAsync([base58Decode(ownerStr), base58Decode(tokProg), base58Decode(jupMintStr)], base58Decode(ataProg))
      ]);
      // Ensure user's destination JUP ATA exists (CreateIdempotent instruction = 1)
      instructions.push({
        programId: ataProg,
        keys: [
          { pubkey: ownerStr, isSigner: true, isWritable: true },
          { pubkey: destTokensPda.address, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: false, isWritable: false },
          { pubkey: jupMintStr, isSigner: false, isWritable: false },
          { pubkey: sysProg, isSigner: false, isWritable: false },
          { pubkey: tokProg, isSigner: false, isWritable: false }
        ],
        data: new Uint8Array([1])
      });
      instructions.push({
        programId: voterProgId,
        keys: [
          { pubkey: lockerStr, isSigner: false, isWritable: true },
          { pubkey: escrowPda.address, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: true, isWritable: false },
          { pubkey: escrowTokensPda.address, isSigner: false, isWritable: true },
          { pubkey: destTokensPda.address, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: true, isWritable: true },
          { pubkey: tokProg, isSigner: false, isWritable: false }
        ],
        data: hexToBytes('b712469c946da122') // withdraw()
      });
      performedStep = 'withdrawn';
    } else {
      const remainDays = Math.max(1, Math.ceil((escrowEndsAtSec - nowSec) / 86400));
      throw new Error(t(`JUP 正在 30 天解锁冷却期中，还剩约 ${remainDays} 天可提取`, `JUP unstaking cooldown active (~${remainDays} days remaining)`));
    }

    const res = await buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions });
    return {
      ...res,
      poolId: 'jupiter_jup',
      step: performedStep
    };
  }

  /**
   * 流动性质押代币极速退出 (rNEAR->NEAR / JitoSOL,jupSOL,mSOL,INF->SOL / kHYPE->HYPE / stETH->ETH)
   */
  async function exitLiquidStakingToken({ wallet, poolId, amount, slippageBps = 100 } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const pool = findStakingPool(poolId);
    if (!pool) throw new Error(t(`未找到质押池: ${poolId}`, `Staking pool not found: ${poolId}`));
    const amtNum = Number(amount);
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      throw new Error(t('请输入有效的退出数量', 'Enter a valid positive exit amount'));
    }
    await ensureWalletSigningKeysAsync(wallet);

    if (pool.chain === 'near') {
      const lstContractMap = {
        rhea_rnear: 'lst.rhealab.near',
        metapool_stnear: 'meta-pool.near',
        linear_near: 'linear-protocol.near',
        stader_nearx: 'v2-nearx.stader-labs.near'
      };
      const lstContract = lstContractMap[pool.id];
      if (!lstContract) throw new Error(t('该 NEAR 池暂不支持一键兑换退出', 'Instant swap exit unsupported for this NEAR pool'));
      const rawAmt = toBaseUnits(amtNum, pool.decimals || 24);
      const q = await quoteNearRefFinanceSwap({ tokenIn: lstContract, tokenOut: WRAP_NEAR_CONTRACT, amountRaw: rawAmt, slippageBps });
      if (!q || !q.ok) throw new Error((q && q.error) || t('Ref Finance 退出报价失败', 'Ref Finance exit quote failed'));
      const res = await executeNearRefFinanceSwap({
        wallet,
        routeData: q.routeData,
        actions: q.actions,
        poolIds: q.poolIds,
        minAmountOut: q.minAmountOut,
        tokenIn: lstContract,
        tokenOut: WRAP_NEAR_CONTRACT,
        amountRaw: rawAmt,
        slippageBps,
        inputDecimals: pool.decimals || 24,
        tokenSymbol: pool.outSymbol || 'LST'
      });
      return { ...res, poolId: pool.id };
    }

    if (pool.chain === 'sol' && pool.mintOut) {
      const rawAmt = toBaseUnits(amtNum, pool.decimals || 9);
      const quote = await quoteSolanaJupiterSwap({
        inputMint: pool.mintOut,
        outputMint: WSOL_MINT,
        amountRaw: rawAmt,
        slippageBps,
        platformFeeBps: 0
      });
      const res = await executeSolanaJupiterSwap({
        wallet,
        quoteResponse: quote,
        wrapAndUnwrapSol: true,
        inputDecimals: pool.decimals || 9
      });
      return { ...res, poolId: pool.id };
    }

    if (pool.chain === 'eth' || pool.chain === 'hype') {
      const evmSender = resolveWalletEvmSender(wallet);
      const rawAmt = toBaseUnits(amtNum, pool.decimals || 18);
      const q = await quoteEvmDexSwap({
        chainKey: pool.chain,
        srcToken: pool.contract,
        destToken: NATIVE_EVM_SENTINEL,
        amountRaw: rawAmt,
        srcDecimals: pool.decimals || 18,
        destDecimals: 18,
        slippageBps,
        feeBps: 0,
        fromAddress: evmSender
      });
      if (!q || !q.ok) throw new Error((q && q.error) || t('EVM 退出报价失败', 'EVM exit quote failed'));
      const res = await executeEvmDexSwap({
        wallet,
        chainKey: pool.chain,
        routeSource: q.routeSource,
        routeData: q.routeData,
        srcToken: pool.contract,
        destToken: NATIVE_EVM_SENTINEL,
        amountRaw: rawAmt,
        srcDecimals: pool.decimals || 18,
        slippageBps,
        feeBps: 0
      });
      return { ...res, poolId: pool.id };
    }

    throw new Error(t('该质押池不支持此退出方式', 'Exit not supported for this pool'));
  }

