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
    tokenSymbol = 'TOKEN',
    gasBuffer = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'Swap amount must be positive'));
    }

    const resolvedGasBuf = (gasBuffer !== null && gasBuffer !== undefined && Number.isFinite(Number(gasBuffer)) && Number(gasBuffer) >= 0)
      ? Number(gasBuffer)
      : 0.01;
    const humanAmount = Number(fromBaseUnits(amtStr, inputDecimals));
    if (tokenBalance !== null && tokenBalance !== undefined) {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol,
        amount: humanAmount,
        isNative: inId === WRAP_NEAR_CONTRACT,
        gasBuffer: resolvedGasBuf,
        tokenBalance
      });
    } else {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: inId === WRAP_NEAR_CONTRACT ? humanAmount + resolvedGasBuf : resolvedGasBuf,
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
    tokenSymbol = 'TOKEN',
    gasBuffer = null
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
        tokenSymbol,
        gasBuffer
      });
    }

    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'Swap amount must be positive'));
    }

    const resolvedGasBuf = (gasBuffer !== null && gasBuffer !== undefined && Number.isFinite(Number(gasBuffer)) && Number(gasBuffer) >= 0)
      ? Number(gasBuffer)
      : 0.01;
    const humanAmount = Number(fromBaseUnits(amtStr, inputDecimals));
    if (tokenBalance !== null && tokenBalance !== undefined) {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol,
        amount: humanAmount,
        isNative: inId === WRAP_NEAR_CONTRACT,
        gasBuffer: resolvedGasBuf,
        tokenBalance
      });
    } else {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: inId === WRAP_NEAR_CONTRACT ? humanAmount + resolvedGasBuf : resolvedGasBuf,
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
          tokenSymbol,
          gasBuffer
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

