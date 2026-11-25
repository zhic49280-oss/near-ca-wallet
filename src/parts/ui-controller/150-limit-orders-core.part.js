  // ==================== Multi-Chain Limit Orders UI Controller ====================

  function getLimitTokenListForChain(chainKey) {
    const lo = getLimitOrders();
    const tokens = getTokens();
    const catalog = getSwapTokenCatalog();
    const chain = String(chainKey || 'near').toLowerCase();

    if (chain === 'near') {
      const allowed = lo ? lo.getNearLimitSellTokens() : [];
      const metaMap = (lo && lo.NEAR_LIMIT_TOKEN_META) || {};
      const out = [];
      for (const cid of allowed) {
        const meta = metaMap[cid];
        const catHit = catalog.find(
          (item) => item && item.blockchain === 'near' && String(item.contractAddress || '').toLowerCase() === cid.toLowerCase()
        );
        const symbol = (meta && meta.symbol) || (catHit && catHit.symbol) || cid.split('.')[0].toUpperCase();
        const decimals = (meta && typeof meta.decimals === 'number') ? meta.decimals : (catHit && typeof catHit.decimals === 'number' ? catHit.decimals : 18);
        const livePrice = catHit && typeof catHit.price === 'number' ? catHit.price : getSymbolPrice(symbol === 'wNEAR' ? 'NEAR' : symbol);
        out.push({
          symbol,
          name: (meta && meta.name) || (catHit && catHit.name) || symbol,
          blockchain: 'near',
          assetId: (meta && meta.assetId) || (catHit && catHit.assetId) || `nep141:${cid}`,
          contractAddress: cid,
          decimals,
          networkName: 'NEAR DCL',
          logoURI: (catHit && catHit.logoURI) || (tokens && tokens.TOKEN_ICON_MAP ? tokens.TOKEN_ICON_MAP[symbol.toUpperCase()] : ''),
          price: livePrice
        });
      }
      return out;
    }

    if (chain === 'sol') {
      return catalog.filter((item) => lo && lo.isSolanaTokenEligibleForLimit(item));
    }

    const byAddr = new Map();
    for (const item of catalog) {
      if (item && String(item.blockchain || '').toLowerCase() === chain && item.contractAddress) {
        byAddr.set(String(item.contractAddress).toLowerCase(), item);
      }
    }
    const fallbacks = (lo && lo.LIMIT_EVM_FALLBACK_TOKENS && lo.LIMIT_EVM_FALLBACK_TOKENS[chain]) || [];
    for (const fb of fallbacks) {
      const key = String(fb.contractAddress || '').toLowerCase();
      if (key && !byAddr.has(key)) {
        const price = getSymbolPrice(fb.symbol);
        byAddr.set(key, { ...fb, price });
      }
    }
    return Array.from(byAddr.values());
  }

  function getLimitTokenBalance(wallet, token) {
    if (!wallet || !token) return null;
    const bc = String(token.blockchain || '').toLowerCase();
    if (bc === 'near') {
      const cid = String(token.contractAddress || '').trim();
      const entry = wallet.nearNep141Balances && wallet.nearNep141Balances[cid];
      const ftBal = entry && typeof entry.formatted === 'number' && Number.isFinite(entry.formatted) ? entry.formatted : 0;
      if (cid === 'wrap.near') {
        const st = getState();
        const lo = getLimitOrders();
        const gasReserve = Number(lo?.DCL_GAS_RESERVE_NEAR ?? 0.05);
        const storageReserve = st.limit?.dclStorageRegistered === false ? Number(lo?.DCL_STORAGE_DEPOSIT_NEAR ?? 0.5) : 0;
        const nativeNear = Number(getContracts()?.resolveWalletChainBalance(wallet, 'near') || 0);
        return ftBal + Math.max(0, nativeNear - gasReserve - storageReserve);
      }
      return ftBal;
    }
    return getWalletNativeBalanceForToken(wallet, bc, token.symbol, token.contractAddress);
  }

  function getLimitPickerCatalog(side) {
    const st = getState();
    const lo = getLimitOrders();
    const chain = st.limit.chain || 'near';
    const list = getLimitTokenListForChain(chain);
    if (chain === 'near') {
      if (side === 'to') {
        const counters = lo ? lo.getNearLimitCounterTokens(st.limit.sellContract) : [];
        const set = new Set(counters.map((c) => c.toLowerCase()));
        return list.filter((tok) => set.has(String(tok.contractAddress || '').toLowerCase()));
      }
      return list;
    }
    if (chain === 'sol') {
      const exclude = String(side === 'from' ? st.limit.buyContract : st.limit.sellContract || '').toLowerCase();
      return list.filter((tok) => String(tok.contractAddress || '').toLowerCase() !== exclude);
    }
    if (side === 'from') {
      const exclude = String(st.limit.buyContract || '').toLowerCase();
      return list.filter((tok) => !(lo && lo.isEvmNativeSentinel(tok.contractAddress)) && String(tok.contractAddress || '').toLowerCase() !== exclude);
    }
    const exclude = String(st.limit.sellContract || '').toLowerCase();
    return list.filter((tok) => String(tok.contractAddress || '').toLowerCase() !== exclude);
  }

  function resolveLimitSelectedTokens() {
    const st = getState();
    const lo = getLimitOrders();
    const chain = st.limit.chain || 'near';
    const list = getLimitTokenListForChain(chain);
    if (list.length === 0) return { sellToken: null, buyToken: null };

    const findByAddr = (addr) => list.find((item) => String(item.contractAddress || '').toLowerCase() === String(addr || '').toLowerCase()) || null;
    let sellToken = findByAddr(st.limit.sellContract);
    let buyToken = findByAddr(st.limit.buyContract);

    if (chain !== 'near' && chain !== 'sol' && sellToken && lo && lo.isEvmNativeSentinel(sellToken.contractAddress)) {
      sellToken = null;
    }
    if (!sellToken) {
      if (chain === 'near') sellToken = findByAddr('token.rhealab.near') || list[0];
      else if (chain === 'sol') sellToken = findByAddr('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') || list[0];
      else sellToken = list.find((x) => !(lo && lo.isEvmNativeSentinel(x.contractAddress)) && x.symbol === 'USDC') || list.find((x) => !(lo && lo.isEvmNativeSentinel(x.contractAddress))) || list[0];
    }

    if (chain === 'near' && lo) {
      const counters = lo.getNearLimitCounterTokens(sellToken.contractAddress);
      const validCounterSet = new Set(counters.map((c) => c.toLowerCase()));
      if (!buyToken || !validCounterSet.has(String(buyToken.contractAddress || '').toLowerCase())) {
        const preferredCounter = sellToken.contractAddress === 'token.rhealab.near' ? 'otoken.rhealab.near' : counters[0];
        buyToken = findByAddr(preferredCounter) || list.find((x) => validCounterSet.has(String(x.contractAddress || '').toLowerCase())) || null;
      }
    } else if (!buyToken || String(buyToken.contractAddress || '').toLowerCase() === String(sellToken.contractAddress || '').toLowerCase()) {
      const cfg = lo && lo.COW_CHAINS ? lo.COW_CHAINS[chain] : null;
      if (chain === 'sol') {
        buyToken = findByAddr(lo.SOL_NATIVE_MINT) || list.find((x) => x.contractAddress !== sellToken.contractAddress) || null;
      } else {
        buyToken = (cfg && findByAddr(cfg.wrappedNative)) || list.find((x) => x.contractAddress !== sellToken.contractAddress) || null;
      }
    }

    if (sellToken) st.limit.sellContract = sellToken.contractAddress;
    if (buyToken) st.limit.buyContract = buyToken.contractAddress;
    return { sellToken, buyToken };
  }

  function setSwapPanelMode(mode) {
    const st = getState();
    const next = mode === 'limit' ? 'limit' : 'market';
    st.swap.panelMode = next;
    const marketPanel = $('swap-market-panel');
    const limitPanel = $('swap-limit-panel');
    const marketBtn = $('swap-mode-market-btn');
    const limitBtn = $('swap-mode-limit-btn');
    if (marketPanel) marketPanel.classList.toggle('hidden', next !== 'market');
    if (limitPanel) limitPanel.classList.toggle('hidden', next !== 'limit');
    if (marketBtn) marketBtn.classList.toggle('active', next === 'market');
    if (limitBtn) limitBtn.classList.toggle('active', next === 'limit');
    if (next === 'limit') {
      renderLimitOrderView();
      refreshLimitMarketContextAsync().catch(() => {});
      refreshLimitOrdersAsync(false).catch(() => {});
    } else {
      renderSwapView();
    }
  }

  function setLimitChain(chainKey) {
    const st = getState();
    const key = String(chainKey || 'near').toLowerCase();
    st.limit.chain = key;
    st.limit.sellContract = '';
    st.limit.buyContract = '';
    resetFormFields(['limit-amount-in', 'limit-target-rate'], st.limit, { amountIn: '', targetRate: '' });
    st.limit.priceInverted = null;
    st.limit.snappedPoint = null;
    st.limit.liveMarketRate = null;
    st.limit.poolInfo = null;
    st.limit.evmAllowanceRaw = null;
    st.limit.evmAllowanceFailed = false;
    st.limit.solUnavailable = false;
    st.limit.rateLimited = false;
    st.limit.errorMsg = '';
    st.limit.ordersActive = [];
    st.limit.ordersHistory = [];
    renderLimitOrderView();
    refreshLimitMarketContextAsync().catch(() => {});
    refreshLimitOrdersAsync(false).catch(() => {});
  }

  function resolveLimitPriceOrientation(sellToken, buyToken) {
    const st = getState();
    if (!sellToken || !buyToken) {
      return { inverted: false, baseSymbol: sellToken?.symbol || '--', quoteSymbol: buyToken?.symbol || '--' };
    }
    const manual = st.limit.priceInverted;
    const auto = isStablecoinSymbol(sellToken.symbol) && !isStablecoinSymbol(buyToken.symbol);
    const inverted = (manual === true || manual === false) ? manual : auto;
    return {
      inverted,
      baseSymbol: inverted ? buyToken.symbol : sellToken.symbol,
      quoteSymbol: inverted ? sellToken.symbol : buyToken.symbol
    };
  }

  function toLimitDisplayPrice(canonicalRateOutPerIn, inverted) {
    const r = Number(canonicalRateOutPerIn);
    if (!Number.isFinite(r) || r <= 0) return '';
    const disp = inverted ? (1 / r) : r;
    return Number(disp.toPrecision(6)).toString();
  }

  function toggleLimitPriceOrientation() {
    const st = getState();
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    const nextInverted = !inverted;
    st.limit.priceInverted = nextInverted;
    if ($('limit-target-rate')) {
      $('limit-target-rate').value = toLimitDisplayPrice(st.limit.targetRate, nextInverted);
    }
    renderLimitOrderView();
  }

  function handleLimitInput() {
    const st = getState();
    st.limit.amountIn = ($('limit-amount-in')?.value || '').trim();
    st.limit.errorMsg = '';
    renderLimitOrderCalculations();
  }

  function handleLimitRateInput() {
    const st = getState();
    const raw = ($('limit-target-rate')?.value || '').trim();
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    const num = Number(raw);
    if (!raw) {
      st.limit.targetRate = '';
    } else if (inverted) {
      st.limit.targetRate = Number.isFinite(num) && num > 0 ? Number((1 / num).toPrecision(8)).toString() : '';
    } else {
      st.limit.targetRate = raw;
    }
    st.limit.snappedPoint = null;
    st.limit.errorMsg = '';
    renderLimitOrderCalculations();
  }

  function setLimitMaxAmount() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const { sellToken } = resolveLimitSelectedTokens();
    if (!wallet || !sellToken) return;
    const bal = getLimitTokenBalance(wallet, sellToken) || 0;
    let maxAmt = bal;
    const isSolNative = st.limit.chain === 'sol' && sellToken.contractAddress === getLimitOrders()?.SOL_NATIVE_MINT;
    if (isSolNative) {
      maxAmt = Math.max(0, bal - (getLimitOrders()?.SOL_LIMIT_GAS_RESERVE || 0.005));
    }
    const rawUnits = (isSolNative || (st.limit.chain === 'near' && sellToken.contractAddress === 'wrap.near'))
      ? null
      : getWalletTokenRawBaseUnits(wallet, st.limit.chain, sellToken.contractAddress);
    st.limit.amountIn = maxAmt > 0 ? formatMaxDecimalString(maxAmt, sellToken.decimals || 6, rawUnits) : '0';
    if ($('limit-amount-in')) $('limit-amount-in').value = st.limit.amountIn;
    renderLimitOrderCalculations();
  }

  function flipLimitTokens() {
    const st = getState();
    const lo = getLimitOrders();
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    if (!sellToken || !buyToken) return;
    if (st.limit.chain !== 'near' && st.limit.chain !== 'sol' && lo && lo.isEvmNativeSentinel(buyToken.contractAddress)) {
      showToast(t('原生 Gas 币不可直接挂单卖出', 'Native gas coin cannot be sold directly'));
      return;
    }
    st.limit.sellContract = buyToken.contractAddress;
    st.limit.buyContract = sellToken.contractAddress;
    st.limit.amountIn = '';
    st.limit.targetRate = '';
    resetFormFields(['limit-amount-in', 'limit-target-rate'], st.limit, { amountIn: '', targetRate: '' });
    st.limit.priceInverted = null;
    st.limit.snappedPoint = null;
    st.limit.evmAllowanceRaw = null;
    st.limit.evmAllowanceFailed = false;
    st.limit.solUnavailable = false;
    st.limit.rateLimited = false;
    st.limit.errorMsg = '';
    st.limit.liveMarketRate = st.limit.liveMarketRate && st.limit.liveMarketRate > 0 ? (1 / st.limit.liveMarketRate) : null;
    renderLimitOrderView();
    refreshLimitMarketContextAsync().catch(() => {});
  }

  function applyLimitRateOffset(pct) {
    const st = getState();
    const lo = getLimitOrders();
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    const baseCanonical = Number(st.limit.liveMarketRate || st.limit.targetRate);
    if (!Number.isFinite(baseCanonical) || baseCanonical <= 0) {
      showToast(t('暂无实时参考价', 'Live reference price unavailable'));
      return;
    }
    const baseDisplay = inverted ? (1 / baseCanonical) : baseCanonical;
    const nextDisplay = baseDisplay * (1 + Number(pct || 0));
    if (!Number.isFinite(nextDisplay) || nextDisplay <= 0) return;
    let nextRate = inverted ? (1 / nextDisplay) : nextDisplay;
    let nextPt = null;
    if (st.limit.chain === 'near' && lo) {
      const poolId = sellToken && buyToken
        ? ((st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress))
        : null;
      if (poolId) {
        try {
          nextPt = lo.priceToDclPoint({
            rateOutPerIn: nextRate,
            sellToken: sellToken.contractAddress,
            buyToken: buyToken.contractAddress,
            poolId,
            poolInfo: st.limit.poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
          nextRate = lo.dclPointToPrice({
            point: nextPt,
            sellToken: sellToken.contractAddress,
            poolId,
            poolInfo: st.limit.poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
        } catch (_) {}
      }
    }
    st.limit.snappedPoint = nextPt;
    st.limit.targetRate = Number(nextRate.toPrecision(6)).toString();
    if ($('limit-target-rate')) {
      $('limit-target-rate').value = toLimitDisplayPrice(nextRate, inverted);
    }
    renderLimitOrderCalculations();
  }

  function applyLimitRateOffsetByIndex(idx) {
    const mags = [0, 0.02, 0.05, 0.10];
    const mag = mags[Number(idx)] ?? 0;
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    return applyLimitRateOffset(inverted && mag > 0 ? -mag : mag);
  }

  function stepLimitDclPoint(dir) {
    const st = getState();
    const lo = getLimitOrders();
    if (!lo || st.limit.chain !== 'near') return;
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    if (!sellToken || !buyToken) return;
    const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
    const poolId = (st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
    if (!poolId) return;
    const delta = (st.limit.poolInfo && st.limit.poolInfo.pointDelta) || 40;
    const tokenX = (st.limit.poolInfo && st.limit.poolInfo.tokenX) || poolId.split('|')[0];
    const sellIsX = lo.normalizeNearContract(sellToken.contractAddress) === tokenX;
    let curPt = st.limit.snappedPoint;
    if (curPt === null || curPt === undefined) {
      const ref = Number(st.limit.targetRate || st.limit.liveMarketRate);
      if (!Number.isFinite(ref) || ref <= 0) return;
      curPt = lo.priceToDclPoint({
        rateOutPerIn: ref,
        sellToken: sellToken.contractAddress,
        buyToken: buyToken.contractAddress,
        poolId,
        poolInfo: st.limit.poolInfo,
        sellDecimals: sellToken.decimals,
        buyDecimals: buyToken.decimals
      });
    }
    const visualDir = inverted ? -Number(dir) : Number(dir);
    const stepDelta = (visualDir >= 0 ? 1 : -1) * (sellIsX ? delta : -delta);
    const nextPt = curPt + stepDelta;
    const nextRate = lo.dclPointToPrice({
      point: nextPt,
      sellToken: sellToken.contractAddress,
      poolId,
      poolInfo: st.limit.poolInfo,
      sellDecimals: sellToken.decimals,
      buyDecimals: buyToken.decimals
    });
    st.limit.snappedPoint = nextPt;
    st.limit.targetRate = Number(nextRate.toPrecision(6)).toString();
    if ($('limit-target-rate')) {
      $('limit-target-rate').value = toLimitDisplayPrice(nextRate, inverted);
    }
    renderLimitOrderCalculations();
  }

  function toggleLimitSplitTicks(checked) {
    getState().limit.splitTwoTicks = Boolean(checked);
    renderLimitOrderCalculations();
  }

  function setLimitExpiryDays(days) {
    const st = getState();
    st.limit.expiryDays = Number(days) || 7;
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#limit-expiry-pills [data-exp-days]').forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-exp-days')) === st.limit.expiryDays);
      });
    }
  }

  function setLimitOrdersTab(tab) {
    const st = getState();
    st.limit.ordersTab = tab === 'history' ? 'history' : 'active';
    const actBtn = $('limit-tab-active');
    const histBtn = $('limit-tab-history');
    if (actBtn) actBtn.classList.toggle('active', st.limit.ordersTab === 'active');
    if (histBtn) histBtn.classList.toggle('active', st.limit.ordersTab === 'history');
    renderLimitOrdersList();
  }

  function evaluateLimitOrderState() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    const chain = st.limit.chain || 'near';
    const { sellToken, buyToken } = resolveLimitSelectedTokens();

    if (st.limit.submitting) {
      return { disabled: true, action: 'submit', text: t('提交中...', 'Submitting...'), error: '' };
    }
    if (!wallet || !sellToken || !buyToken) {
      return { disabled: true, action: 'submit', text: t('请选择挂单币对', 'Select limit pair'), error: '' };
    }

    const amt = Number(st.limit.amountIn);
    const rate = Number(st.limit.targetRate);
    const sellBal = Number(getLimitTokenBalance(wallet, sellToken) || 0);
    const sellPrice = (typeof sellToken.price === 'number' && sellToken.price > 0) ? sellToken.price : getSymbolPrice(sellToken.symbol === 'wNEAR' ? 'NEAR' : sellToken.symbol);
    const sellUsd = (Number.isFinite(amt) && amt > 0 && sellPrice) ? amt * sellPrice : null;

    if (chain === 'near' && lo) {
      const poolId = lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
      if (!poolId) {
        return { disabled: true, action: 'submit', text: t('该币对暂无流动性池', 'No pool for pair'), error: '' };
      }
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(rate) || rate <= 0) {
        return { disabled: true, action: 'submit', text: t('请输入数量与目标价', 'Enter amount & target price'), error: '' };
      }
      if (sellBal < amt) {
        return { disabled: true, action: 'submit', text: t(`${sellToken.symbol} 余额不足`, `Insufficient ${sellToken.symbol}`), error: '' };
      }
      const nearAvail = Number(contracts?.resolveWalletChainBalance(wallet, 'near') || 0);
      const minNear = st.limit.dclStorageRegistered === false ? (lo.DCL_STORAGE_DEPOSIT_NEAR + lo.DCL_GAS_RESERVE_NEAR) : lo.DCL_GAS_RESERVE_NEAR;
      const wnearEntry = wallet.nearNep141Balances && wallet.nearNep141Balances['wrap.near'];
      const wnearOnly = Number((wnearEntry && typeof wnearEntry === 'object') ? (wnearEntry.formatted ?? 0) : (wnearEntry || 0));
      const needsAutoWrap = sellToken.contractAddress === 'wrap.near' && amt > wnearOnly + 1e-8;
      const wrapShortfall = needsAutoWrap ? (amt - wnearOnly) : 0;
      if (nearAvail + 1e-9 < minNear + wrapShortfall) {
        return { disabled: true, action: 'submit', text: t(`NEAR 余额不足 (需 ${(minNear + wrapShortfall).toFixed(2)} NEAR)`, `Need ${(minNear + wrapShortfall).toFixed(2)} NEAR`), error: '' };
      }
      return {
        disabled: false,
        action: 'submit',
        text: needsAutoWrap
          ? t(`自动封装 ${formatBal(wrapShortfall, 4)} NEAR 并提交限价单`, `Auto-Wrap ${formatBal(wrapShortfall, 4)} NEAR & Place Limit Order`)
          : t('提交限价单', 'Place Limit Order'),
        error: ''
      };
    }

    if (chain === 'sol' && lo) {
      if (st.limit.solUnavailable) {
        return { disabled: true, action: 'submit', text: t('Solana 限价单服务暂不可用', 'Solana limit service unavailable'), error: '' };
      }
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(rate) || rate <= 0) {
        return { disabled: true, action: 'submit', text: t('请输入数量与目标价', 'Enter amount & target price'), error: '' };
      }
      if (sellUsd !== null && sellUsd < lo.SOL_LIMIT_MIN_USD) {
        return { disabled: true, action: 'submit', text: t(`低于最低限额 ($${lo.SOL_LIMIT_MIN_USD})`, `Below $${lo.SOL_LIMIT_MIN_USD} min`), error: '' };
      }
      const isNativeSol = sellToken.contractAddress === lo.SOL_NATIVE_MINT;
      const solAvail = Number(contracts?.resolveWalletChainBalance(wallet, 'sol') || 0);
      if (isNativeSol) {
        if (solAvail < amt + lo.SOL_LIMIT_GAS_RESERVE) {
          return { disabled: true, action: 'submit', text: t('SOL 余额不足 (含可退租金)', 'Insufficient SOL (+ rent)'), error: '' };
        }
      } else {
        if (sellBal < amt) {
          return { disabled: true, action: 'submit', text: t(`${sellToken.symbol} 余额不足`, `Insufficient ${sellToken.symbol}`), error: '' };
        }
        if (solAvail < lo.SOL_LIMIT_GAS_RESERVE) {
          return { disabled: true, action: 'submit', text: t(`SOL 租金不足 (需 ${lo.SOL_LIMIT_GAS_RESERVE} SOL)`, `Need ${lo.SOL_LIMIT_GAS_RESERVE} SOL`), error: '' };
        }
      }
      return { disabled: false, action: 'submit', text: t('提交限价单', 'Place Limit Order'), error: '' };
    }

    if (lo && lo.isEvmChainLimitSupported(chain)) {
      const cfg = lo.COW_CHAINS[chain];
      if (lo.isEvmNativeSentinel(sellToken.contractAddress)) {
        return { disabled: true, action: 'submit', text: t(`请先封装为 ${cfg.wrappedSymbol}`, `Wrap to ${cfg.wrappedSymbol} first`), error: '' };
      }
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(rate) || rate <= 0) {
        return { disabled: true, action: 'submit', text: t('请输入数量与目标价', 'Enter amount & target price'), error: '' };
      }
      if (sellUsd !== null && sellUsd < cfg.minUsd) {
        return { disabled: true, action: 'submit', text: t(`低于最低限额 ($${cfg.minUsd})`, `Below $${cfg.minUsd} min`), error: '' };
      }
      if (sellBal < amt) {
        return { disabled: true, action: 'submit', text: t(`${sellToken.symbol} 余额不足`, `Insufficient ${sellToken.symbol}`), error: '' };
      }
      if (st.limit.evmAllowanceFailed) {
        return { disabled: false, action: 'retry_allowance', text: t('授权检查失败 · 点击重试', 'Allowance check failed · Retry'), error: '' };
      }
      if (st.limit.evmAllowanceRaw === null || st.limit.evmAllowanceRaw === undefined) {
        return { disabled: true, action: 'submit', text: t('正在检查授权...', 'Checking allowance...'), error: '' };
      }
      try {
        const sellBase = BigInt(contracts.toBaseUnits(String(amt), sellToken.decimals));
        if (BigInt(st.limit.evmAllowanceRaw) < sellBase) {
          const nativeBal = Number((wallet.nativeBalances && wallet.nativeBalances[chain]) ?? 0);
          if (nativeBal + 1e-12 < Number(cfg.gasReserve || 0.0015)) {
            return { disabled: true, action: 'approve', text: t(`${String(chain).toUpperCase()} Gas 不足 (需 >= ${cfg.gasReserve})`, `Insufficient ${String(chain).toUpperCase()} gas (>= ${cfg.gasReserve})`), error: '' };
          }
          return { disabled: false, action: 'approve', text: t(`授权 ${sellToken.symbol}`, `Approve ${sellToken.symbol}`), error: '' };
        }
      } catch (_) {}
      return { disabled: false, action: 'submit', text: t('提交限价单', 'Place Limit Order'), error: '' };
    }

    return { disabled: true, action: 'submit', text: t('当前链不支持限价单', 'Unsupported chain'), error: '' };
  }

  function computeNearLimitWorseMarketPct({ sellToken, buyToken, rate, poolId }) {
    const st = getState();
    const lo = getLimitOrders();
    if (!sellToken || !buyToken || !Number.isFinite(rate) || rate <= 0) return 0;
    let dclMktRate = null;
    if (lo && poolId && st.limit.poolInfo && Number.isFinite(Number(st.limit.poolInfo.currentPoint))) {
      try {
        dclMktRate = lo.dclPointToPrice({
          point: Number(st.limit.poolInfo.currentPoint),
          sellToken: sellToken.contractAddress,
          poolId,
          poolInfo: st.limit.poolInfo,
          sellDecimals: sellToken.decimals,
          buyDecimals: buyToken.decimals
        });
      } catch (_) {}
    }
    if (!Number.isFinite(dclMktRate) || dclMktRate <= 0) {
      dclMktRate = Number(st.limit.liveMarketRate);
    }
    if (!Number.isFinite(dclMktRate) || dclMktRate <= 0 || rate >= dclMktRate) return 0;
    return ((dclMktRate - rate) / dclMktRate) * 100;
  }

  function renderLimitOrderCalculations() {
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    const chain = st.limit.chain || 'near';
    const { sellToken, buyToken } = resolveLimitSelectedTokens();

    const amt = Number(st.limit.amountIn);
    let rate = Number(st.limit.targetRate);
    let snappedPt = st.limit.snappedPoint;

    let splitHtml = '';
    if (chain === 'near' && lo && sellToken && buyToken && Number.isFinite(rate) && rate > 0) {
      const poolId = (st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
      if (poolId) {
        try {
          if (snappedPt === null || snappedPt === undefined) {
            snappedPt = lo.priceToDclPoint({
              rateOutPerIn: rate,
              sellToken: sellToken.contractAddress,
              buyToken: buyToken.contractAddress,
              poolId,
              poolInfo: st.limit.poolInfo,
              sellDecimals: sellToken.decimals,
              buyDecimals: buyToken.decimals
            });
            st.limit.snappedPoint = snappedPt;
          }
          const exactRate = lo.dclPointToPrice({
            point: snappedPt,
            sellToken: sellToken.contractAddress,
            poolId,
            poolInfo: st.limit.poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
          if ($('limit-snapped-tick-label')) {
            const { inverted, baseSymbol, quoteSymbol } = resolveLimitPriceOrientation(sellToken, buyToken);
            const dispExact = (inverted && exactRate > 0) ? (1 / exactRate) : exactRate;
            $('limit-snapped-tick-label').textContent = `1 ${baseSymbol} = ${formatBal(dispExact, 4)} ${quoteSymbol}`;
          }
          if (st.limit.splitTwoTicks && typeof lo.resolveSplitTwoTickPoints === 'function') {
            const pts = lo.resolveSplitTwoTickPoints({
              rateOutPerIn: rate,
              sellToken: sellToken.contractAddress,
              buyToken: buyToken.contractAddress,
              poolId,
              poolInfo: st.limit.poolInfo,
              sellDecimals: sellToken.decimals,
              buyDecimals: buyToken.decimals
            });
            const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
            const r0 = lo.dclPointToPrice({ point: pts[0], sellToken: sellToken.contractAddress, poolId, poolInfo: st.limit.poolInfo, sellDecimals: sellToken.decimals, buyDecimals: buyToken.decimals });
            const r1 = lo.dclPointToPrice({ point: pts[1], sellToken: sellToken.contractAddress, poolId, poolInfo: st.limit.poolInfo, sellDecimals: sellToken.decimals, buyDecimals: buyToken.decimals });
            rate = (r0 + r1) / 2;
            const d0 = inverted && r0 > 0 ? (1 / r0) : r0;
            const d1 = inverted && r1 > 0 ? (1 / r1) : r1;
            const priceUnit = inverted ? sellToken.symbol : buyToken.symbol;
            const legText = Number.isFinite(amt) && amt > 0
              ? `${formatBal(amt / 2, 4)} ${sellToken.symbol} @ ${formatBal(d0, 4)} ${priceUnit}  +  ${formatBal(amt / 2, 4)} ${sellToken.symbol} @ ${formatBal(d1, 4)} ${priceUnit}`
              : `50% @ ${formatBal(d0, 4)} ${priceUnit}  +  50% @ ${formatBal(d1, 4)} ${priceUnit}`;
            splitHtml = escapeHtml(`${t('将拆分为', 'Splits into')}: ${legText}`);
          } else {
            rate = exactRate;
          }
        } catch (_) {
          if ($('limit-snapped-tick-label')) $('limit-snapped-tick-label').textContent = '--';
        }
      }
    } else if ($('limit-snapped-tick-label')) {
      $('limit-snapped-tick-label').textContent = '--';
    }
    const splitPreviewEl = $('limit-split-preview');
    if (splitPreviewEl) {
      splitPreviewEl.classList.toggle('hidden', !splitHtml);
      splitPreviewEl.innerHTML = splitHtml;
    }

    const estOut = (Number.isFinite(amt) && amt > 0 && Number.isFinite(rate) && rate > 0) ? (amt * rate) : null;
    if ($('limit-amount-out')) {
      $('limit-amount-out').value = estOut !== null ? formatBal(estOut, 6) : '';
    }
    if ($('limit-meta-est-out')) {
      $('limit-meta-est-out').textContent = estOut !== null && buyToken ? `${formatBal(estOut, 6)} ${buyToken.symbol}` : '--';
    }
    const feeRowEl = $('limit-meta-fee-row');
    const feeValEl = $('limit-meta-pool-fee');
    const activeNearPoolId = (chain === 'near' && lo && sellToken && buyToken)
      ? ((st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress))
      : null;
    if (feeRowEl && feeValEl) {
      const feeRaw = activeNearPoolId
        ? Number((st.limit.poolInfo && st.limit.poolInfo.fee) || String(activeNearPoolId).split('|')[2] || 0)
        : 0;
      if (chain === 'near' && Number.isFinite(feeRaw) && feeRaw > 0) {
        feeRowEl.classList.remove('hidden');
        feeValEl.textContent = `${Number((feeRaw / 10000).toFixed(4))}%`;
      } else {
        feeRowEl.classList.add('hidden');
        feeValEl.textContent = '--';
      }
    }
    const warnBanner = $('limit-price-warning-banner');
    if (warnBanner) {
      let worsePct = 0;
      if (chain === 'near') {
        worsePct = computeNearLimitWorseMarketPct({ sellToken, buyToken, rate, poolId: activeNearPoolId });
      } else if (Number.isFinite(rate) && rate > 0 && Number.isFinite(Number(st.limit.liveMarketRate)) && Number(st.limit.liveMarketRate) > 0) {
        const mkt = Number(st.limit.liveMarketRate);
        if (rate < mkt) worsePct = ((mkt - rate) / mkt) * 100;
      }
      if (worsePct >= 0.5) {
        warnBanner.classList.remove('hidden');
        warnBanner.classList.toggle('is-critical', worsePct >= 5);
        warnBanner.classList.toggle('is-high', worsePct < 5);
        warnBanner.textContent = t(
          `⚠️ 挂单价劣于当前市场价 -${worsePct.toFixed(1)}%，可能按更差价格立即成交，请核对目标价`,
          `⚠️ Target price is -${worsePct.toFixed(1)}% worse than market price and may fill immediately at an unfavorable rate`
        );
      } else {
        warnBanner.classList.add('hidden');
        warnBanner.classList.remove('is-high', 'is-critical');
        warnBanner.textContent = '';
      }
    }

    const sellPrice = sellToken ? ((typeof sellToken.price === 'number' && sellToken.price > 0) ? sellToken.price : getSymbolPrice(sellToken.symbol === 'wNEAR' ? 'NEAR' : sellToken.symbol)) : null;
    const buyPrice = buyToken ? ((typeof buyToken.price === 'number' && buyToken.price > 0) ? buyToken.price : getSymbolPrice(buyToken.symbol === 'wNEAR' ? 'NEAR' : buyToken.symbol)) : null;
    if ($('limit-usd-in')) $('limit-usd-in').textContent = (Number.isFinite(amt) && amt > 0 && sellPrice) ? formatUsd(amt * sellPrice) : '--';
    if ($('limit-usd-out')) $('limit-usd-out').textContent = (estOut !== null && buyPrice) ? formatUsd(estOut * buyPrice) : '--';

    if ($('limit-meta-gas')) {
      if (chain === 'near') $('limit-meta-gas').textContent = '~0.005 NEAR';
      else if (chain === 'sol') $('limit-meta-gas').textContent = '~0.0001 SOL';
      else $('limit-meta-gas').textContent = t('0 Gas (离线签名)', '0 Gas (Off-chain)');
    }
    if ($('limit-meta-deposit')) {
      if (chain === 'near') {
        if (st.limit.dclStorageRegistered === true) $('limit-meta-deposit').textContent = '0 NEAR';
        else if (st.limit.dclStorageRegistered === false) $('limit-meta-deposit').textContent = t('0.5 NEAR (首次可退)', '0.5 NEAR (Refundable)');
        else $('limit-meta-deposit').textContent = t('首次 0.5 NEAR / 已注册 0', '0.5 NEAR once / 0');
      } else if (chain === 'sol') {
        $('limit-meta-deposit').textContent = t('~0.0025 SOL (退回)', '~0.0025 SOL (Refundable)');
      } else {
        $('limit-meta-deposit').textContent = '0';
      }
    }
    if ($('limit-meta-min')) {
      if (chain === 'near') $('limit-meta-min').textContent = t('无限制', 'None');
      else if (chain === 'sol') $('limit-meta-min').textContent = `$${lo ? lo.SOL_LIMIT_MIN_USD : 5}`;
      else {
        const cfg = lo && lo.COW_CHAINS ? lo.COW_CHAINS[chain] : null;
        $('limit-meta-min').textContent = cfg ? `$${cfg.minUsd}` : '--';
      }
    }

    const btnState = evaluateLimitOrderState();
    const btn = $('btn-execute-limit');
    if (btn) {
      btn.disabled = Boolean(btnState.disabled);
      btn.textContent = btnState.text;
    }
    const errBanner = $('limit-error-banner');
    if (errBanner) {
      errBanner.classList.toggle('hidden', !st.limit.errorMsg);
      errBanner.textContent = st.limit.errorMsg || '';
    }

    const { inverted, baseSymbol, quoteSymbol } = resolveLimitPriceOrientation(sellToken, buyToken);
    if ($('limit-market-rate')) {
      const mktCanonical = Number(st.limit.liveMarketRate);
      if (Number.isFinite(mktCanonical) && mktCanonical > 0 && sellToken && buyToken) {
        const dispMkt = inverted ? (1 / mktCanonical) : mktCanonical;
        $('limit-market-rate').textContent = `1 ${baseSymbol} = ${formatBal(dispMkt, 5)} ${quoteSymbol}`;
      } else {
        $('limit-market-rate').textContent = '--';
      }
    }
    const usdHintEl = $('limit-target-usd-hint');
    if (usdHintEl) {
      const dispRate = (inverted && Number(st.limit.targetRate) > 0) ? (1 / Number(st.limit.targetRate)) : Number(st.limit.targetRate);
      const quoteUnitUsd = inverted ? sellPrice : buyPrice;
      if (sellToken && buyToken && Number.isFinite(dispRate) && dispRate > 0 && quoteUnitUsd && quoteUnitUsd > 0) {
        const equivUsd = formatTokenPrice(dispRate * quoteUnitUsd);
        usdHintEl.textContent = equivUsd !== '--' ? `1 ${baseSymbol} ≈ ${equivUsd}` : '';
      } else {
        usdHintEl.textContent = '';
      }
    }
    if ($('btn-limit-wrap')) {
      let showWrap = false;
      if (wallet && sellToken) {
        if (chain === 'near' && sellToken.contractAddress === 'wrap.near' && Number(wallet.nativeBalances?.near || 0) > 0.1) {
          showWrap = true;
        } else if (lo && lo.COW_CHAINS && lo.COW_CHAINS[chain]) {
          const cfg = lo.COW_CHAINS[chain];
          if (String(sellToken.contractAddress || '').toLowerCase() === cfg.wrappedNative.toLowerCase() && Number(wallet.nativeBalances?.[chain] || 0) > cfg.gasReserve) {
            showWrap = true;
          }
        }
      }
      $('btn-limit-wrap').classList.toggle('hidden', !showWrap);
    }
  }

