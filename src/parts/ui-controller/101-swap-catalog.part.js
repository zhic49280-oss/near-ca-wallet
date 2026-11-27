  function floorToDecimals(val, decimals = 6) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const dp = Math.max(0, Math.min(12, Math.floor(Number(decimals) || 6)));
    const factor = Math.pow(10, dp);
    return Number((Math.floor(n * factor + 1e-9) / factor).toFixed(dp));
  }

  function plainDecimalFromNumber(num) {
    const s = String(num);
    if (!/[eE]/.test(s)) return s;
    const m = s.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
    if (!m) return s;
    const sign = m[1] === '-' ? '-' : '';
    const intPart = m[2];
    const fracPart = m[3] || '';
    const exp = parseInt(m[4], 10);
    const digits = intPart + fracPart;
    const pointPos = intPart.length + exp;
    if (pointPos <= 0) return sign + '0.' + '0'.repeat(-pointPos) + digits;
    if (pointPos >= digits.length) return sign + digits + '0'.repeat(pointPos - digits.length);
    return sign + digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
  }

  function trimPlainDecimalZeros(str) {
    const s = String(str || '').trim();
    if (!s) return '0';
    const out = s.includes('.') ? s.replace(/\.?0+$/, '') : s;
    return out || '0';
  }

  function formatMaxDecimalString(amountNum, decimals = 6, rawBaseUnits = null) {
    const rawDec = (decimals === 0 || decimals === '0') ? 0 : (Number.isFinite(Number(decimals)) ? Number(decimals) : 6);
    const dec = Math.max(0, Math.min(24, Math.floor(rawDec)));
    const contracts = getContracts();
    if (
      rawBaseUnits !== null &&
      rawBaseUnits !== undefined &&
      /^\d+$/.test(String(rawBaseUnits).trim()) &&
      contracts &&
      typeof contracts.fromBaseUnits === 'function'
    ) {
      const exactStr = trimPlainDecimalZeros(contracts.fromBaseUnits(String(rawBaseUnits).trim(), dec));
      if (Number(exactStr) > 0) return exactStr;
      return '0';
    }
    const n = Number(amountNum);
    if (!Number.isFinite(n) || n <= 0) return '0';
    let dp = Math.min(dec, 12);
    if (n >= 1) {
      const intDigits = Math.floor(Math.log10(n)) + 1;
      dp = Math.min(dp, Math.max(0, 14 - intDigits));
    }
    const plain = plainDecimalFromNumber(n);
    const parts = plain.split('.');
    const intStr = parts[0] || '0';
    const fracStr = parts[1] || '';
    const truncFrac = dp > 0 ? fracStr.slice(0, dp).replace(/0+$/, '') : '';
    const out = truncFrac ? `${intStr}.${truncFrac}` : intStr;
    return out || '0';
  }

  function getWalletTokenRawBaseUnits(wallet, chain, contractAddress) {
    if (!wallet || !chain || !contractAddress) return null;
    if (String(chain).toLowerCase() === 'near' && wallet.nearNep141Balances) {
      const entry = wallet.nearNep141Balances[String(contractAddress)];
      if (entry && entry.raw !== undefined && /^\d+$/.test(String(entry.raw))) {
        return String(entry.raw);
      }
    }
    return null;
  }

  function computeExactMaxSpendable({
    balance,
    rawBaseUnits = null,
    decimals = 6,
    isNative = false,
    gasReserve = 0,
    exactFeeBaseUnits = null
  } = {}) {
    const dec = Math.max(0, Math.min(24, Math.floor(Number(decimals) || 6)));
    const balNum = Number(balance);
    if (!isNative) {
      const maxAmountStr = formatMaxDecimalString(balNum, dec, rawBaseUnits);
      return { maxAmountStr, maxAmountNum: Number(maxAmountStr) || 0, gasReserve: 0 };
    }
    const reserve = Math.max(0, Number(gasReserve) || 0);
    const contracts = getContracts();
    const hasExactRaw = Boolean(rawBaseUnits !== null && rawBaseUnits !== undefined && /^\d+$/.test(String(rawBaseUnits).trim()));
    const hasExactFee = Boolean(exactFeeBaseUnits !== null && exactFeeBaseUnits !== undefined && /^\d+$/.test(String(exactFeeBaseUnits).trim()));

    if (contracts && typeof contracts.toBaseUnits === 'function' && typeof contracts.fromBaseUnits === 'function') {
      try {
        const balStr = hasExactRaw
          ? contracts.fromBaseUnits(String(rawBaseUnits).trim(), dec)
          : formatMaxDecimalString(balNum, dec, null);
        const balBase = hasExactRaw
          ? BigInt(String(rawBaseUnits).trim())
          : BigInt(contracts.toBaseUnits(balStr, dec));
        const feeBase = hasExactFee
          ? BigInt(String(exactFeeBaseUnits).trim())
          : BigInt(contracts.toBaseUnits(plainDecimalFromNumber(reserve), dec));
        if (balBase <= feeBase) {
          return { maxAmountStr: '0', maxAmountNum: 0, gasReserve: reserve };
        }
        const netBase = balBase - feeBase;
        let maxAmountStr = trimPlainDecimalZeros(contracts.fromBaseUnits(netBase.toString(), dec));
        if (!hasExactRaw) {
          maxAmountStr = formatMaxDecimalString(Number(maxAmountStr), dec, null);
        }
        let maxAmountNum = Number(maxAmountStr) || 0;
        if (Number.isFinite(balNum) && balNum > 0 && maxAmountNum + reserve > balNum + 1e-12) {
          const safeFloat = Math.max(0, balNum - reserve);
          maxAmountStr = formatMaxDecimalString(safeFloat, dec, null);
          maxAmountNum = Number(maxAmountStr) || 0;
        }
        return { maxAmountStr, maxAmountNum, gasReserve: reserve };
      } catch (_) {}
    }

    const diff = Number.isFinite(balNum) ? balNum - reserve : 0;
    if (!(diff > 0)) return { maxAmountStr: '0', maxAmountNum: 0, gasReserve: reserve };
    const maxAmountStr = formatMaxDecimalString(diff, dec, null);
    return { maxAmountStr, maxAmountNum: Number(maxAmountStr) || 0, gasReserve: reserve };
  }

  /**
   * Resolve single pure-external ("extra") gas validation & exact max-spendable plan.
   * Entered / quoted / broadcasted amount always match 1:1 (1Click EXACT_INPUT safe).
   */
  function resolveNativeFeeDeductPlan({
    wallet,
    chain,
    amount,
    avail,
    isNative = false,
    gasBuffer = null,
    decimals = 6,
    rawBaseUnits = null,
    exactFeeBaseUnits = null
  } = {}) {
    const amt = Number(amount);
    const bal = avail !== null && avail !== undefined
      ? Number(avail)
      : (wallet && chain ? Number(getWalletChainNativeBalance(wallet, chain) || 0) : 0);
    const contracts = getContracts();
    const buffers = (contracts && contracts.DEFAULT_GAS_BUFFERS) || {};
    const chainLower = String(chain || '').toLowerCase();
    const buf = (gasBuffer !== null && gasBuffer !== undefined && Number.isFinite(Number(gasBuffer)) && Number(gasBuffer) >= 0)
      ? Number(gasBuffer)
      : Number(buffers[chainLower] || 0);
    const maxInfo = computeExactMaxSpendable({
      balance: bal,
      rawBaseUnits,
      decimals,
      isNative,
      gasReserve: buf,
      exactFeeBaseUnits
    });

    if (!Number.isFinite(amt) || amt <= 0) {
      return {
        mode: 'extra',
        effectiveAmount: 0,
        totalInputAmount: 0,
        gasReserve: isNative ? buf : 0,
        maxSpendable: maxInfo.maxAmountNum,
        maxSpendableStr: maxInfo.maxAmountStr,
        avail: bal
      };
    }
    if (!isNative) {
      if (amt > bal + 1e-12) {
        return {
          mode: 'insufficient_balance',
          effectiveAmount: 0,
          totalInputAmount: amt,
          gasReserve: 0,
          maxSpendable: maxInfo.maxAmountNum,
          maxSpendableStr: maxInfo.maxAmountStr,
          avail: bal
        };
      }
      return {
        mode: 'extra',
        effectiveAmount: amt > bal ? bal : amt,
        totalInputAmount: amt,
        gasReserve: 0,
        maxSpendable: maxInfo.maxAmountNum,
        maxSpendableStr: maxInfo.maxAmountStr,
        avail: bal
      };
    }

    if (amt > bal + 1e-12) {
      return {
        mode: 'insufficient_balance',
        effectiveAmount: 0,
        totalInputAmount: amt,
        gasReserve: buf,
        maxSpendable: maxInfo.maxAmountNum,
        maxSpendableStr: maxInfo.maxAmountStr,
        avail: bal
      };
    }

    if (amt + buf > bal + 1e-12) {
      return {
        mode: 'insufficient_gas',
        effectiveAmount: amt,
        totalInputAmount: amt,
        gasReserve: buf,
        maxSpendable: maxInfo.maxAmountNum,
        maxSpendableStr: maxInfo.maxAmountStr,
        avail: bal
      };
    }

    return {
      mode: 'extra',
      effectiveAmount: amt,
      totalInputAmount: amt,
      gasReserve: buf,
      maxSpendable: maxInfo.maxAmountNum,
      maxSpendableStr: maxInfo.maxAmountStr,
      avail: bal
    };
  }

  // Arc native USDC reports 18-dec gas units but the token uses 6 decimals: floor balance, ceil fee.
  function scaleSwapLiveGasUnits(token, liveBalanceRaw, feeRaw) {
    const isArc6Dec = token && String(token.blockchain || '').toLowerCase() === 'arc' &&
      String(token.contractAddress || '').toLowerCase() === '0x3600000000000000000000000000000000000000' &&
      Number(token.decimals) === 6;
    let balanceUnits = liveBalanceRaw ? String(liveBalanceRaw) : null;
    let feeUnits = feeRaw;
    if (isArc6Dec) {
      if (balanceUnits && /^\d+$/.test(balanceUnits)) balanceUnits = (BigInt(balanceUnits) / 1000000000000n).toString();
      if (feeUnits && /^\d+$/.test(String(feeUnits))) feeUnits = ((BigInt(String(feeUnits)) + 999999999999n) / 1000000000000n).toString();
    }
    return { balanceUnits, feeUnits };
  }

  function resolveEffectiveSwapGasPlan(wallet, fromToken, toToken, gasReserveMode = 'auto', quoteData = null) {
    const st = getState();
    const contracts = getContracts();
    const chain = String((fromToken && fromToken.blockchain) || '').toLowerCase();
    const isNative = Boolean(fromToken && isSwapTokenNative(fromToken));
    const kind = isSameChainContractSwap(fromToken, toToken) ? 'dex_swap' : 'transfer';
    const gasReserveInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, gasReserveMode || 'auto', quoteData);
    if (!isNative || !chain) {
      return { kind, gasBuffer: null, exactFeeBaseUnits: null, liveGas: null, gasReserveInfo };
    }

    const buffers = (contracts && contracts.DEFAULT_GAS_BUFFERS) || {};
    const walletKey = wallet ? (wallet.id || wallet.nearNamedAccount || wallet.nearAddress || 'default') : 'none';
    const cacheKey = `${walletKey}:${chain}:${kind}`;
    const cached = st.swap && st.swap._liveGas;
    const isFresh = Boolean(cached && cached.key === cacheKey && (Date.now() - cached.ts) < 60_000 && cached.data);
    const liveGas = isFresh ? cached.data : null;

    let gasBuffer = null;
    let exactFeeBaseUnits = null;
    if (liveGas && Number.isFinite(Number(liveGas.gasReserve)) && Number(liveGas.gasReserve) >= 0) {
      gasBuffer = Number(liveGas.gasReserve);
      exactFeeBaseUnits = liveGas.exactFeeBaseUnits || null;
    } else if (chain === 'sol' && kind === 'transfer') {
      gasBuffer = 0.000005;
      exactFeeBaseUnits = '5000';
    } else if (chain === 'sol' && kind === 'dex_swap') {
      gasBuffer = 0.0015;
      exactFeeBaseUnits = '1500000';
    } else {
      gasBuffer = Number(buffers[chain] || 0);
    }

    if (chain === 'sol' && gasReserveInfo && gasReserveInfo.selectedReserve > 0) {
      if (gasReserveInfo.selectedReserve > gasBuffer) {
        gasBuffer = gasReserveInfo.selectedReserve;
        exactFeeBaseUnits = null;
      }
    }

    return { kind, gasBuffer, exactFeeBaseUnits, liveGas, gasReserveInfo };
  }

  async function prefetchSwapLiveGasAsync(force = false) {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (!wallet || !fromToken || !contracts || typeof contracts.estimateLiveNativeGasAsync !== 'function') return null;
    if (!isSwapTokenNative(fromToken)) return null;

    const chain = String(fromToken.blockchain || '').toLowerCase();
    const kind = isSameChainContractSwap(fromToken, toToken) ? 'dex_swap' : 'transfer';
    const walletKey = wallet.id || wallet.nearNamedAccount || wallet.nearAddress || 'default';
    const cacheKey = `${walletKey}:${chain}:${kind}`;
    const cached = st.swap._liveGas;
    if (!force && cached && cached.key === cacheKey && (Date.now() - cached.ts) < 60_000 && cached.data) {
      return cached.data;
    }

    const res = await contracts.estimateLiveNativeGasAsync({ wallet, chain, kind }).catch(() => null);
    if (res) {
      st.swap._liveGas = { key: cacheKey, ts: Date.now(), data: res };
      updateSwapPrimaryButtonState();
    }
    return res;
  }

  function evaluateSwapButtonState({
    wallet,
    fromToken,
    toToken,
    amountIn,
    quoteData = null,
    quoteError = '',
    isQuoting = false,
    isExecuting = false,
    gasReserveMode = 'auto',
    priceImpact = null
  } = {}) {
    if (isExecuting) {
      return { disabled: true, isError: false, isWarning: false, text: t('执行中...', 'Executing...'), reason: 'executing' };
    }
    if (fromToken && !isSwapOriginSupported(fromToken)) {
      return {
        disabled: true,
        isError: true,
        isWarning: false,
        text: t(
          `暂不支持从 ${String(fromToken.blockchain || '').toUpperCase()} 发起闪兑`,
          `Swaps from ${String(fromToken.blockchain || '').toUpperCase()} are not supported yet`
        ),
        reason: 'unsupported_origin'
      };
    }
    const amt = Number(amountIn);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: false, isError: false, isWarning: false, text: t('确认闪兑', 'Execute Swap'), reason: 'empty' };
    }
    if (wallet && fromToken && toToken) {
      const contracts = getContracts();
      const avail = getWalletNativeBalanceForToken(wallet, fromToken.blockchain, fromToken.symbol, fromToken.contractAddress);
      const isNative = isSwapTokenNative(fromToken);
      const gasPlan = resolveEffectiveSwapGasPlan(wallet, fromToken, toToken, gasReserveMode || 'auto', quoteData);
      const customGasBuf = isNative ? gasPlan.gasBuffer : null;
      const arcScaled = isNative ? scaleSwapLiveGasUnits(fromToken, gasPlan.liveGas && gasPlan.liveGas.liveBalanceBaseUnits, gasPlan.exactFeeBaseUnits) : null;
      const rawUnits = isNative
        ? (arcScaled && arcScaled.balanceUnits ? arcScaled.balanceUnits : null)
        : getWalletTokenRawBaseUnits(wallet, fromToken.blockchain, fromToken.contractAddress);
      let effectiveAvail = avail !== null ? avail : 0;
      let checkedRawUnits = rawUnits;
      if (isNative && rawUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
        const liveNum = Number(contracts.fromBaseUnits(rawUnits, fromToken.decimals || 18));
        if (Number.isFinite(liveNum) && liveNum > 0 && liveNum <= effectiveAvail + 1e-12) {
          effectiveAvail = liveNum;
        } else {
          checkedRawUnits = null;
        }
      }
      const activeFeePlan = resolveNativeFeeDeductPlan({
        wallet,
        chain: fromToken.blockchain,
        amount: amt,
        avail: effectiveAvail,
        isNative,
        gasBuffer: customGasBuf,
        decimals: fromToken.decimals || 6,
        rawBaseUnits: checkedRawUnits,
        exactFeeBaseUnits: isNative ? (arcScaled ? arcScaled.feeUnits : gasPlan.exactFeeBaseUnits) : null
      });
      const gasMap = { sol: 'SOL', near: 'NEAR', prl: 'PRL', btc: 'BTC', bsc: 'BNB', pol: 'POL', avax: 'AVAX', hype: 'HYPE', arc: 'USDC' };
      const gasSym = gasMap[String(fromToken.blockchain || '').toLowerCase()] || 'ETH';
      if (activeFeePlan.mode === 'insufficient_balance') {
        return {
          disabled: true,
          isError: true,
          isWarning: false,
          text: t(`${fromToken.symbol} 余额不足`, `Insufficient ${fromToken.symbol}`),
          reason: 'insufficient_balance'
        };
      }
      if (activeFeePlan.mode === 'insufficient_gas') {
        return {
          disabled: true,
          isError: true,
          isWarning: false,
          text: t(`${gasSym} Gas 余额不足`, `Insufficient ${gasSym} for gas`),
          reason: 'insufficient_gas',
          maxSpendable: activeFeePlan.maxSpendable,
          maxSpendableStr: activeFeePlan.maxSpendableStr,
          gasReserve: activeFeePlan.gasReserve,
          gasSymbol: gasSym,
          tokenSymbol: fromToken.symbol
        };
      }
      if (contracts && typeof contracts.validateSufficientChainBalance === 'function') {
        try {
          contracts.validateSufficientChainBalance({
            wallet,
            chain: fromToken.blockchain,
            tokenSymbol: fromToken.symbol,
            amount: amt,
            isNative,
            tokenBalance: effectiveAvail,
            gasBuffer: customGasBuf
          });
        } catch (_) {
          if (amt > effectiveAvail) {
            return {
              disabled: true,
              isError: true,
              isWarning: false,
              text: t(`${fromToken.symbol} 余额不足`, `Insufficient ${fromToken.symbol}`),
              reason: 'insufficient_balance'
            };
          }
          return {
            disabled: true,
            isError: true,
            isWarning: false,
            text: t(`${gasSym} Gas 余额不足`, `Insufficient ${gasSym} for gas`),
            reason: 'insufficient_gas',
            maxSpendable: activeFeePlan.maxSpendable,
            maxSpendableStr: activeFeePlan.maxSpendableStr,
            gasReserve: activeFeePlan.gasReserve,
            gasSymbol: gasSym,
            tokenSymbol: fromToken.symbol
          };
        }
      }
      if (!isNative && contracts && (typeof contracts.getNativeGasReserve === 'function' || contracts.DEFAULT_GAS_BUFFERS)) {
        const ck = String(fromToken.blockchain || '').toLowerCase();
        const minNative = typeof contracts.getNativeGasReserve === 'function'
          ? contracts.getNativeGasReserve(ck)
          : Number((contracts.DEFAULT_GAS_BUFFERS && contracts.DEFAULT_GAS_BUFFERS[ck]) || 0);
        const nativeBal = Number((wallet.nativeBalances && wallet.nativeBalances[ck]) ?? 0);
        if (minNative > 0 && nativeBal + 1e-12 < minNative) {
          return {
            disabled: true,
            isError: true,
            isWarning: false,
            text: t(`${gasSym} Gas 余额不足`, `Insufficient ${gasSym} for gas`),
            reason: 'insufficient_gas',
            gasSymbol: gasSym,
            tokenSymbol: fromToken.symbol
          };
        }
      }
      if (!isQuoting || quoteData) {
        try {
          validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData, amountIn: amt });
        } catch (_) {
          return {
            disabled: true,
            isError: true,
            isWarning: false,
            text: t('NEAR Gas 余额不足', 'Insufficient NEAR for gas'),
            reason: 'insufficient_near_gas'
          };
        }
      }
      if (quoteData && !isQuoting) {
        const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, gasReserveMode || 'auto', quoteData);
        if (gInfo && gInfo.selectedReserve > 0) {
          const { netOutNum } = computeNetSwapOutput(quoteData, toToken, gInfo, Number(quoteData.amountOutFormatted || 0));
          if (Number.isFinite(netOutNum) && netOutNum <= 0) {
            return {
              disabled: true,
              isError: true,
              isWarning: false,
              text: t('兑换金额过小（扣除目标链 Gas 预留后为 0）', 'Amount too small after target gas reserve'),
              reason: 'net_out_zero'
            };
          }
        }
      }
    }
    if (isQuoting) {
      return { disabled: true, isError: false, isWarning: false, text: t('报价获取中...', 'Fetching quote...'), reason: 'quoting' };
    }
    if (quoteError) {
      return { disabled: true, isError: true, isWarning: false, text: String(quoteError), reason: 'quote_error' };
    }
    if (priceImpact && priceImpact.level === 'critical' && Number.isFinite(priceImpact.pct)) {
      return {
        disabled: false,
        isError: false,
        isWarning: true,
        text: t(`高价差 (-${priceImpact.pct.toFixed(1)}%) · 仍要闪兑`, `High Impact (-${priceImpact.pct.toFixed(1)}%) · Swap Anyway`),
        reason: 'ready_high_impact'
      };
    }
    return { disabled: false, isError: false, isWarning: false, text: t('确认闪兑', 'Execute Swap'), reason: 'ready' };
  }

  function updateSwapPrimaryButtonState() {
    const st = getState();
    const btn = $('btn-execute-swap');
    const impact = updateSwapPriceImpactUI();
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    const view = evaluateSwapButtonState({
      wallet,
      fromToken,
      toToken,
      amountIn: st.swap.amountIn,
      quoteData: st.swap.quoteData || null,
      quoteError: st.swap._lastError || '',
      isQuoting: Boolean(st.swap._quoting || st.swap._quotePending),
      isExecuting: Boolean(st.swap._executing),
      gasReserveMode: st.swap.gasReserveMode || 'auto',
      priceImpact: impact
    });

    const fixBanner = $('swap-gas-fix-banner');
    const fixText = $('swap-gas-fix-text');
    if (fixBanner) {
      const canFix = Boolean(
        view &&
        view.reason === 'insufficient_gas' &&
        view.maxSpendable > 0 &&
        view.maxSpendableStr &&
        view.maxSpendableStr !== '0'
      );
      fixBanner.classList.toggle('hidden', !canFix);
      if (canFix && fixText) {
        fixText.textContent = t(
          `需预留约 ${formatBal(view.gasReserve, 6)} ${view.gasSymbol} Gas，最大可换 ${view.maxSpendableStr} ${view.tokenSymbol}`,
          `Reserve ~${formatBal(view.gasReserve, 6)} ${view.gasSymbol} for gas. Max: ${view.maxSpendableStr} ${view.tokenSymbol}`
        );
      } else if (fixText) {
        fixText.textContent = '';
      }
    }

    if (!btn) return view;
    btn.disabled = Boolean(view.disabled);
    if (btn.classList) {
      btn.classList.toggle('is-error', Boolean(view.isError));
      btn.classList.toggle('is-warning', Boolean(view.isWarning));
    }
    btn.textContent = view.text;
    return view;
  }

  function applySwapMaxSpendableFix() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    if (!wallet || !fromToken) return;
    const view = evaluateSwapButtonState({
      wallet,
      fromToken,
      toToken,
      amountIn: st.swap.amountIn,
      quoteData: st.swap.quoteData || null,
      quoteError: '',
      isQuoting: false,
      isExecuting: false,
      gasReserveMode: st.swap.gasReserveMode || 'auto',
      priceImpact: null
    });
    if (view && view.maxSpendableStr && view.maxSpendableStr !== '0') {
      st.swap.amountIn = view.maxSpendableStr;
      const amtEl = $('swap-amount-in');
      if (amtEl && (typeof document === 'undefined' || document.activeElement !== amtEl)) {
        amtEl.value = view.maxSpendableStr;
      }
      $('swap-gas-fix-banner')?.classList.add('hidden');
      handleSwapAmountInput();
    }
  }

  const STABLECOIN_SYMBOLS = new Set([
    'USDC', 'USDT', 'DAI', 'USDG', 'USDE', 'EURC', 'FDUSD', 'TUSD', 'USDS', 'PYUSD', 'FRAX', 'USD1', 'USDC.E', 'USDT.E'
  ]);

  function isStablecoinSymbol(sym) {
    return STABLECOIN_SYMBOLS.has(String(sym || '').trim().replace(/^\$/, '').toUpperCase());
  }

  function renderSwapRateDisplay(fromToken, toToken, rawOutPerIn = null) {
    const st = getState();
    const rateEl = $('swap-quote-rate');
    if (!rateEl) return '';
    if (!fromToken || !toToken) {
      rateEl.textContent = '--';
      return '--';
    }
    let rateOutPerIn = Number(rawOutPerIn);
    if (!Number.isFinite(rateOutPerIn) || rateOutPerIn <= 0) {
      rateOutPerIn = Number(st.swap._quoteRateOutPerIn);
    }
    if (!Number.isFinite(rateOutPerIn) || rateOutPerIn <= 0) {
      const pIn = getTokenUnitPrice(fromToken);
      const pOut = getTokenUnitPrice(toToken);
      if (pIn > 0 && pOut > 0) rateOutPerIn = pIn / pOut;
    }
    if (!Number.isFinite(rateOutPerIn) || rateOutPerIn <= 0) {
      rateEl.textContent = '--';
      return '--';
    }
    const text = st.swap.rateInverted
      ? `1 ${toToken.symbol} ≈ ${formatBal(1 / rateOutPerIn, 5)} ${fromToken.symbol} ⇄`
      : `1 ${fromToken.symbol} ≈ ${formatBal(rateOutPerIn, 5)} ${toToken.symbol} ⇄`;
    rateEl.textContent = text;
    return text;
  }

  function toggleSwapRateOrientation() {
    const st = getState();
    st.swap.rateInverted = !st.swap.rateInverted;
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    renderSwapRateDisplay(fromToken, toToken);
  }

