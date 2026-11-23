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
        const nativeNear = Number(getContracts()?.resolveWalletChainBalance(wallet, 'near') || 0);
        return ftBal + Math.max(0, nativeNear - 0.05);
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
    st.limit.amountIn = '';
    st.limit.targetRate = '';
    st.limit.priceInverted = null;
    st.limit.snappedPoint = null;
    st.limit.liveMarketRate = null;
    st.limit.poolInfo = null;
    st.limit.evmAllowanceRaw = null;
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
    const rawUnits = isSolNative ? null : getWalletTokenRawBaseUnits(wallet, st.limit.chain, sellToken.contractAddress);
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
    const prevRate = Number(st.limit.targetRate);
    st.limit.sellContract = buyToken.contractAddress;
    st.limit.buyContract = sellToken.contractAddress;
    st.limit.priceInverted = null;
    st.limit.snappedPoint = null;
    st.limit.evmAllowanceRaw = null;
    st.limit.liveMarketRate = st.limit.liveMarketRate && st.limit.liveMarketRate > 0 ? (1 / st.limit.liveMarketRate) : null;
    st.limit.targetRate = Number.isFinite(prevRate) && prevRate > 0 ? Number((1 / prevRate).toPrecision(6)).toString() : '';
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
        return { disabled: true, action: 'submit', text: t('该币对暂无 DCL 池', 'No DCL pool for pair'), error: '' };
      }
      if (!Number.isFinite(amt) || amt <= 0 || !Number.isFinite(rate) || rate <= 0) {
        return { disabled: true, action: 'submit', text: t('请输入数量与目标价', 'Enter amount & target price'), error: '' };
      }
      if (sellBal < amt) {
        return { disabled: true, action: 'submit', text: t(`${sellToken.symbol} 余额不足`, `Insufficient ${sellToken.symbol}`), error: '' };
      }
      const nearAvail = Number(contracts?.resolveWalletChainBalance(wallet, 'near') || 0);
      const minNear = st.limit.dclStorageRegistered === false ? (lo.DCL_STORAGE_DEPOSIT_NEAR + lo.DCL_GAS_RESERVE_NEAR) : lo.DCL_GAS_RESERVE_NEAR;
      if (nearAvail < minNear) {
        return { disabled: true, action: 'submit', text: t(`NEAR 余额不足 (需 ${minNear.toFixed(2)} NEAR)`, `Need ${minNear.toFixed(2)} NEAR`), error: '' };
      }
      return { disabled: false, action: 'submit', text: t('提交限价单', 'Place Limit Order'), error: '' };
    }

    if (chain === 'sol' && lo) {
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
      if (st.limit.evmAllowanceRaw !== null && st.limit.evmAllowanceRaw !== undefined) {
        try {
          const sellBase = BigInt(contracts.toBaseUnits(String(amt), sellToken.decimals));
          if (BigInt(st.limit.evmAllowanceRaw) < sellBase) {
            return { disabled: false, action: 'approve', text: t(`授权 ${sellToken.symbol}`, `Approve ${sellToken.symbol}`), error: '' };
          }
        } catch (_) {}
      }
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
            const r0 = lo.dclPointToPrice({ point: pts[0], sellToken: sellToken.contractAddress, poolId, poolInfo: st.limit.poolInfo, sellDecimals: sellToken.decimals, buyDecimals: buyToken.decimals });
            const r1 = lo.dclPointToPrice({ point: pts[1], sellToken: sellToken.contractAddress, poolId, poolInfo: st.limit.poolInfo, sellDecimals: sellToken.decimals, buyDecimals: buyToken.decimals });
            rate = (r0 + r1) / 2;
            const legText = Number.isFinite(amt) && amt > 0
              ? `${formatBal(amt / 2, 4)} ${sellToken.symbol} @ ${formatBal(r0, 4)}  +  ${formatBal(amt / 2, 4)} ${sellToken.symbol} @ ${formatBal(r1, 4)}`
              : `50% @ ${formatBal(r0, 4)}  +  50% @ ${formatBal(r1, 4)}`;
            splitHtml = escapeHtml(`${t('将拆分为', 'Splits into')}: ${legText} ${buyToken.symbol}`);
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
      const worsePct = chain === 'near'
        ? computeNearLimitWorseMarketPct({ sellToken, buyToken, rate, poolId: activeNearPoolId })
        : 0;
      if (worsePct >= 0.5) {
        warnBanner.classList.remove('hidden');
        warnBanner.classList.toggle('is-critical', worsePct >= 5);
        warnBanner.classList.toggle('is-high', worsePct < 5);
        warnBanner.textContent = t(
          `⚠️ 挂单价劣于当前 DCL 盘口价 -${worsePct.toFixed(1)}%，可能按更差价格被立即吃单，请核对目标价`,
          `⚠️ Target price is -${worsePct.toFixed(1)}% worse than DCL market price and may fill immediately at an unfavorable rate`
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

  function renderLimitOrderView() {
    const st = getState();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const chain = st.limit.chain || 'near';

    if (typeof document !== 'undefined') {
      document.querySelectorAll('#limit-chain-pills [data-limit-chain]').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-limit-chain') === chain);
      });
    }

    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    const renderTokBtn = (id, tok) => {
      const btn = $(id);
      if (!btn || !tok) return;
      btn.innerHTML = `${tokens.renderTokenIconWithBadge(tok, 24, true)}<span>${escapeHtml(tok.symbol)}</span><span style="opacity:0.55;font-size:10px;">▾</span>`;
    };
    renderTokBtn('limit-sell-token-btn', sellToken);
    renderTokBtn('limit-buy-token-btn', buyToken);

    const sellBal = sellToken ? getLimitTokenBalance(wallet, sellToken) : null;
    const buyBal = buyToken ? getLimitTokenBalance(wallet, buyToken) : null;
    if ($('limit-sell-balance')) $('limit-sell-balance').textContent = sellToken ? `${formatBal(sellBal, 6)} ${sellToken.symbol}` : '--';
    if ($('limit-buy-balance')) $('limit-buy-balance').textContent = buyToken ? `${formatBal(buyBal, 6)} ${buyToken.symbol}` : '--';
    const fmtLimitNet = (tok) => {
      if (!tok) return '--';
      const net = tok.networkName || chain.toUpperCase();
      const px = getTokenUnitPrice(tok);
      const pxStr = formatTokenPrice(px);
      return pxStr !== '--' ? `${net} · ${pxStr}` : net;
    };
    if ($('limit-sell-net-label')) $('limit-sell-net-label').textContent = fmtLimitNet(sellToken);
    if ($('limit-buy-net-label')) $('limit-buy-net-label').textContent = fmtLimitNet(buyToken);
    const { inverted, baseSymbol, quoteSymbol } = resolveLimitPriceOrientation(sellToken, buyToken);
    if ($('limit-rate-prefix')) $('limit-rate-prefix').textContent = sellToken && buyToken ? `1 ${baseSymbol} =` : '1 -- =';
    if ($('limit-rate-suffix')) $('limit-rate-suffix').textContent = sellToken && buyToken ? quoteSymbol : '--';

    if (typeof document !== 'undefined') {
      const signLabels = inverted ? ['-2%', '-5%', '-10%'] : ['+2%', '+5%', '+10%'];
      document.querySelectorAll('#limit-offset-pills [data-offset-idx]').forEach((b) => {
        const idx = Number(b.getAttribute('data-offset-idx'));
        if (idx >= 1 && idx <= 3) b.textContent = signLabels[idx - 1];
      });
    }

    if ($('limit-amount-in') && $('limit-amount-in').value !== String(st.limit.amountIn || '')) {
      $('limit-amount-in').value = st.limit.amountIn || '';
    }
    const rateInputEl = $('limit-target-rate');
    if (rateInputEl && (typeof document === 'undefined' || document.activeElement !== rateInputEl)) {
      const dispTarget = toLimitDisplayPrice(st.limit.targetRate, inverted);
      if (rateInputEl.value !== dispTarget) rateInputEl.value = dispTarget;
    }

    const isNear = chain === 'near';
    if ($('limit-near-tick-controls')) $('limit-near-tick-controls').classList.toggle('hidden', !isNear);
    if ($('limit-split-row')) $('limit-split-row').classList.toggle('hidden', !isNear);
    if ($('limit-split-toggle')) $('limit-split-toggle').checked = Boolean(st.limit.splitTwoTicks);
    if ($('limit-expiry-row')) $('limit-expiry-row').classList.toggle('hidden', isNear);
    setLimitExpiryDays(st.limit.expiryDays || 7);

    renderLimitOrderCalculations();
    renderLimitOrdersList();
  }

  async function refreshLimitMarketContextAsync() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!lo || !contracts || !wallet) return;

    const chain = st.limit.chain || 'near';
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    if (!sellToken || !buyToken) return;

    let liveRate = null;
    if (chain === 'near') {
      const sender = wallet.nearNamedAccount || wallet.nearAddress;
      const poolId = lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
      const [poolInfo, storageState] = await Promise.all([
        poolId ? lo.fetchNearDclPoolInfo(poolId).catch(() => null) : Promise.resolve(null),
        sender ? lo.checkNearDclStorage(sender).catch(() => null) : Promise.resolve(null)
      ]);
      if (poolInfo) st.limit.poolInfo = poolInfo;
      if (storageState) st.limit.dclStorageRegistered = Boolean(storageState.registered);
      if (poolInfo && Number.isFinite(Number(poolInfo.currentPoint))) {
        try {
          const dclRate = lo.dclPointToPrice({
            point: poolInfo.currentPoint,
            sellToken: sellToken.contractAddress,
            poolId,
            poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
          if (Number.isFinite(dclRate) && dclRate > 0) liveRate = dclRate;
        } catch (_) {}
      }
      if (liveRate === null) {
        const oneUnit = contracts.toBaseUnits('1', sellToken.decimals);
        const refQuote = await contracts.quoteNearRefFinanceSwap({
          tokenIn: sellToken.contractAddress,
          tokenOut: buyToken.contractAddress,
          amountRaw: oneUnit,
          slippageBps: 100
        }).catch(() => null);
        if (refQuote && refQuote.ok && refQuote.amountOut) {
          const outNum = Number(contracts.fromBaseUnits(refQuote.amountOut, buyToken.decimals));
          if (Number.isFinite(outNum) && outNum > 0) liveRate = outNum;
        }
      }
    } else if (chain === 'sol') {
      const oneUnit = contracts.toBaseUnits('1', sellToken.decimals);
      const q = await contracts.quoteSolanaJupiterSwap({
        inputMint: sellToken.contractAddress,
        outputMint: buyToken.contractAddress,
        amountRaw: oneUnit,
        slippageBps: 100
      }).catch(() => null);
      if (q && q.outAmount) {
        const outNum = Number(contracts.fromBaseUnits(String(q.outAmount), buyToken.decimals));
        if (Number.isFinite(outNum) && outNum > 0) liveRate = outNum;
      }
    } else if (lo.isEvmChainLimitSupported(chain)) {
      const owner = (contracts.resolveWalletEvmSender && contracts.resolveWalletEvmSender(wallet)) || wallet.mpcEvmAddress || wallet.evmAddress;
      const oneUnit = contracts.toBaseUnits('1', sellToken.decimals);
      const [allowance, q] = await Promise.all([
        owner ? lo.checkEvmCowAllowance({ chainKey: chain, owner, tokenAddress: sellToken.contractAddress }).catch(() => null) : Promise.resolve(null),
        contracts.quoteEvmDexSwap({
          chainKey: chain,
          srcToken: sellToken.contractAddress,
          destToken: buyToken.contractAddress,
          srcDecimals: sellToken.decimals,
          destDecimals: buyToken.decimals,
          amountRaw: oneUnit,
          fromAddress: owner
        }).catch(() => null)
      ]);
      if (allowance !== null) st.limit.evmAllowanceRaw = allowance.toString();
      const evmOutRaw = q && (q.destAmountRaw || q.amountOut);
      if (evmOutRaw) {
        const outNum = Number(contracts.fromBaseUnits(String(evmOutRaw), buyToken.decimals));
        if (Number.isFinite(outNum) && outNum > 0) liveRate = outNum;
      }
    }

    if (liveRate === null) {
      const sp = (typeof sellToken.price === 'number' && sellToken.price > 0) ? sellToken.price : getSymbolPrice(sellToken.symbol === 'wNEAR' ? 'NEAR' : sellToken.symbol);
      const bp = (typeof buyToken.price === 'number' && buyToken.price > 0) ? buyToken.price : getSymbolPrice(buyToken.symbol === 'wNEAR' ? 'NEAR' : buyToken.symbol);
      if (sp && bp && bp > 0) liveRate = sp / bp;
    }

    if (liveRate !== null && Number.isFinite(liveRate) && liveRate > 0) {
      st.limit.liveMarketRate = liveRate;
      if (!st.limit.targetRate) {
        st.limit.targetRate = Number(liveRate.toPrecision(6)).toString();
        st.limit.snappedPoint = null;
        const { inverted } = resolveLimitPriceOrientation(sellToken, buyToken);
        if ($('limit-target-rate')) $('limit-target-rate').value = toLimitDisplayPrice(st.limit.targetRate, inverted);
      }
    }
    renderLimitOrderCalculations();
  }

  async function refreshLimitOrdersAsync(showFeedback = false) {
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    if (!lo || !wallet) return;
    st.limit.ordersLoading = true;
    st.limit.rateLimited = false;
    try {
      const chain = st.limit.chain || 'near';
      if (chain === 'near') {
        const sender = wallet.nearNamedAccount || wallet.nearAddress;
        const res = await lo.fetchNearDclOrders(sender);
        st.limit.ordersActive = res.active;
        st.limit.ordersHistory = res.history;
      } else if (chain === 'sol') {
        const res = await lo.fetchSolanaLimitOrders(wallet.solAddress);
        st.limit.ordersActive = res.active;
        st.limit.ordersHistory = res.history;
      } else if (lo.isEvmChainLimitSupported(chain)) {
        const owner = wallet.evmAddress || wallet.mpcEvmAddress;
        const res = await lo.fetchEvmCowOrders(chain, owner);
        st.limit.ordersActive = res.active;
        st.limit.ordersHistory = res.history;
        st.limit.rateLimited = Boolean(res.rateLimited);
      }
      renderLimitOrdersList();
      if (showFeedback) {
        showToast(st.limit.rateLimited ? t('CoW 订单簿限流，请稍后刷新', 'CoW rate limited; retry shortly') : t('已刷新挂单列表', 'Orders refreshed'));
      }
    } catch (_) {
      if (showFeedback) showToast(t('获取挂单失败', 'Failed to load orders'));
    } finally {
      st.limit.ordersLoading = false;
    }
  }

  function renderLimitOrdersList() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const listEl = $('limit-orders-list');
    if (!listEl || !lo || !contracts) return;

    const chain = st.limit.chain || 'near';
    const isHistory = st.limit.ordersTab === 'history';
    const items = isHistory ? (st.limit.ordersHistory || []) : (st.limit.ordersActive || []);
    const tokenList = getLimitTokenListForChain(chain);
    const findMeta = (addr) => {
      const low = String(addr || '').toLowerCase();
      return tokenList.find((tk) => String(tk.contractAddress || '').toLowerCase() === low) || { symbol: (addr || '').slice(0, 6), decimals: 18 };
    };

    if (st.limit.rateLimited && items.length === 0) {
      listEl.innerHTML = `<div class="text-center" style="padding: 14px; font-size: 12px; color: var(--text-secondary);">${t('CoW API 请求频繁，请稍后刷新', 'CoW API rate limited; refresh shortly')}</div>`;
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      listEl.innerHTML = `<div class="text-center" style="padding: 14px; font-size: 12px; color: var(--text-secondary);">${isHistory ? t('暂无历史挂单', 'No order history') : t('暂无进行中的限价单', 'No active limit orders')}</div>`;
      return;
    }

    if (chain === 'near') {
      listEl.innerHTML = items.slice(0, 20).map((o) => {
        const sellMeta = findMeta(o.sell_token);
        const buyMeta = findMeta(o.buy_token);
        const orig = Number(contracts.fromBaseUnits(o.original_amount || o.original_deposit_amount || '0', sellMeta.decimals));
        const rem = Number(contracts.fromBaseUnits(o.remain_amount || '0', sellMeta.decimals));
        const unclaimed = Number(contracts.fromBaseUnits(o.unclaimed_amount || '0', buyMeta.decimals));
        const bought = Number(contracts.fromBaseUnits(o.bought_amount || '0', buyMeta.decimals));
        const pct = orig > 0 ? Math.min(100, Math.max(0, ((orig - rem) / orig) * 100)) : 0;
        let priceTxt = '--';
        try {
          const px = lo.dclPointToPrice({ point: o.point, sellToken: o.sell_token, poolId: o.pool_id, sellDecimals: sellMeta.decimals, buyDecimals: buyMeta.decimals });
          priceTxt = `1 ${sellMeta.symbol} = ${formatBal(px, 4)} ${buyMeta.symbol}`;
        } catch (_) {}
        return `
          <div class="limit-order-card-item">
            <div class="flex items-center justify-between gap-2">
              <span style="font-weight:700;font-size:13px;">${escapeHtml(sellMeta.symbol)} ➔ ${escapeHtml(buyMeta.symbol)}</span>
              <span class="badge badge-emerald mono">${escapeHtml(priceTxt)}</span>
            </div>
            <div class="limit-progress-track"><div class="limit-progress-fill" style="width:${pct.toFixed(1)}%;"></div></div>
            <div class="flex items-center justify-between" style="font-size:11.5px;color:var(--text-secondary);">
              <span>${t('进度', 'Filled')}: ${pct.toFixed(1)}% (${formatBal(orig - rem, 4)} / ${formatBal(orig, 4)})</span>
              <span>${t('已得', 'Got')}: ${formatBal(unclaimed > 0 ? unclaimed : bought, 4)} ${escapeHtml(buyMeta.symbol)}</span>
            </div>
            ${!isHistory ? `
              <div class="flex gap-2" style="margin-top:2px;">
                ${unclaimed > 0 ? `<button type="button" class="mini-action-btn primary" data-action="claim-limit-order" data-order-id="${escapeHtml(o.order_id)}" data-buy-token="${escapeHtml(o.buy_token)}">${t('领取', 'Claim')} ${formatBal(unclaimed, 4)}</button>` : ''}
                ${BigInt(String(o.remain_amount || '0')) > 0n ? `<button type="button" class="mini-action-btn" data-action="cancel-limit-order" data-chain="near" data-order-id="${escapeHtml(o.order_id)}" data-remain="${escapeHtml(o.remain_amount || '0')}" data-sell-token="${escapeHtml(o.sell_token)}" data-buy-token="${escapeHtml(o.buy_token)}">${t('撤单', 'Cancel')}</button>` : ''}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
      return;
    }

    if (chain === 'sol') {
      listEl.innerHTML = items.slice(0, 20).map((o) => {
        const sellMeta = findMeta(o.inputMint);
        const buyMeta = findMeta(o.outputMint);
        const make = Number(contracts.fromBaseUnits(o.makingAmount || '0', sellMeta.decimals));
        const rem = Number(contracts.fromBaseUnits(o.remainingMakingAmount || '0', sellMeta.decimals));
        const take = Number(contracts.fromBaseUnits(o.takingAmount || '0', buyMeta.decimals));
        const pct = make > 0 ? Math.min(100, Math.max(0, ((make - rem) / make) * 100)) : 0;
        const rateTxt = make > 0 && take > 0 ? `1 ${sellMeta.symbol} = ${formatBal(take / make, 4)} ${buyMeta.symbol}` : '--';
        const orderKey = o.orderKey || o.order || o.publicKey || '';
        return `
          <div class="limit-order-card-item">
            <div class="flex items-center justify-between gap-2">
              <span style="font-weight:700;font-size:13px;">${escapeHtml(sellMeta.symbol)} ➔ ${escapeHtml(buyMeta.symbol)}</span>
              <span class="badge badge-cyan mono">${escapeHtml(rateTxt)}</span>
            </div>
            <div class="limit-progress-track"><div class="limit-progress-fill" style="width:${pct.toFixed(1)}%;"></div></div>
            <div class="flex items-center justify-between" style="font-size:11.5px;color:var(--text-secondary);">
              <span>${formatBal(make, 4)} ${escapeHtml(sellMeta.symbol)} ➔ ${formatBal(take, 4)} ${escapeHtml(buyMeta.symbol)}</span>
              <span>${escapeHtml(String(o.status || (isHistory ? 'Done' : 'Open')))}</span>
            </div>
            ${!isHistory && orderKey ? `
              <div class="flex gap-2" style="margin-top:2px;">
                <button type="button" class="mini-action-btn" data-action="cancel-limit-order" data-chain="sol" data-order-id="${escapeHtml(orderKey)}">${t('撤单并退租金', 'Cancel & Reclaim SOL')}</button>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
      return;
    }

    listEl.innerHTML = items.slice(0, 20).map((o) => {
      const sellMeta = findMeta(o.sellToken);
      const buyMeta = findMeta(o.buyToken);
      const sellAmt = Number(contracts.fromBaseUnits(o.sellAmount || '0', sellMeta.decimals));
      const execSell = Number(contracts.fromBaseUnits(o.executedSellAmount || '0', sellMeta.decimals));
      const buyAmt = Number(contracts.fromBaseUnits(o.buyAmount || '0', buyMeta.decimals));
      const pct = sellAmt > 0 ? Math.min(100, Math.max(0, (execSell / sellAmt) * 100)) : 0;
      const rateTxt = sellAmt > 0 && buyAmt > 0 ? `1 ${sellMeta.symbol} = ${formatBal(buyAmt / sellAmt, 4)} ${buyMeta.symbol}` : '--';
      return `
        <div class="limit-order-card-item">
          <div class="flex items-center justify-between gap-2">
            <span style="font-weight:700;font-size:13px;">${escapeHtml(sellMeta.symbol)} ➔ ${escapeHtml(buyMeta.symbol)}</span>
            <span class="badge badge-emerald mono">${escapeHtml(rateTxt)}</span>
          </div>
          <div class="limit-progress-track"><div class="limit-progress-fill" style="width:${pct.toFixed(1)}%;"></div></div>
          <div class="flex items-center justify-between" style="font-size:11.5px;color:var(--text-secondary);">
            <span>${formatBal(sellAmt, 4)} ${escapeHtml(sellMeta.symbol)} ➔ ${formatBal(buyAmt, 4)} ${escapeHtml(buyMeta.symbol)}</span>
            <span>${escapeHtml(String(o.status || '--'))}</span>
          </div>
          ${!isHistory ? `
            <div class="flex gap-2" style="margin-top:2px;">
              <button type="button" class="mini-action-btn" data-action="cancel-limit-order" data-chain="${escapeHtml(chain)}" data-order-id="${escapeHtml(o.uid)}">${t('免费撤单', 'Cancel (0 Gas)')}</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  async function wrapNativeForLimitUI() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !contracts) return;
    const chain = st.limit.chain || 'near';
    const { sellToken } = resolveLimitSelectedTokens();
    if (!sellToken) return;

    const currentSellBal = Number(getLimitTokenBalance(wallet, sellToken) || 0);
    const entered = Number(st.limit.amountIn);
    const targetAmt = (Number.isFinite(entered) && entered > 0)
      ? Math.max(0.01, entered > currentSellBal ? (entered - currentSellBal) : entered)
      : (chain === 'near' ? 1 : 0.01);

    const authed = await verifySecurityAuthAsync(wallet, t(`封装 ${targetAmt} 原生代币`, `Wrap ${targetAmt} native coin`));
    if (!authed) return;

    st.limit.submitting = true;
    renderLimitOrderCalculations();
    try {
      const amountRaw = contracts.toBaseUnits(String(targetAmt), sellToken.decimals);
      if (chain === 'near') {
        await lo.wrapNearForLimit({ wallet, amountRaw });
      } else {
        await lo.wrapEvmNativeForLimit({ wallet, chainKey: chain, amountRaw });
      }
      showToast(t('封装成功，正在同步余额', 'Wrapped successfully'));
      await refreshAllBalancesAsync(true);
      await refreshLimitMarketContextAsync();
      renderLimitOrderView();
    } catch (err) {
      st.limit.errorMsg = err && err.message ? err.message : t('封装失败', 'Wrap failed');
      showToast(st.limit.errorMsg);
    } finally {
      st.limit.submitting = false;
      renderLimitOrderCalculations();
    }
  }

  async function executeLimitOrderAction() {
    const st = getState();
    const lo = getLimitOrders();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !contracts) return;

    const btnState = evaluateLimitOrderState();
    if (btnState.disabled) {
      showToast(btnState.text);
      return;
    }
    const chain = st.limit.chain || 'near';
    const { sellToken, buyToken } = resolveLimitSelectedTokens();
    if (!sellToken || !buyToken) return;

    let worsePromptSuffix = '';
    if (chain === 'near' && btnState.action !== 'approve') {
      const activePoolId = (st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
      let effRate = Number(st.limit.targetRate);
      if (activePoolId && st.limit.snappedPoint !== null && st.limit.snappedPoint !== undefined) {
        try {
          effRate = lo.dclPointToPrice({
            point: st.limit.snappedPoint,
            sellToken: sellToken.contractAddress,
            poolId: activePoolId,
            poolInfo: st.limit.poolInfo,
            sellDecimals: sellToken.decimals,
            buyDecimals: buyToken.decimals
          });
        } catch (_) {}
      }
      const worsePct = computeNearLimitWorseMarketPct({ sellToken, buyToken, rate: effRate, poolId: activePoolId });
      if (worsePct >= 5) {
        worsePromptSuffix = ` (⚠️ ${t('劣于盘口', 'Worse than market')} -${worsePct.toFixed(1)}%)`;
      }
    }

    const actionTitle = btnState.action === 'approve'
      ? t(`授权 ${sellToken.symbol}`, `Approve ${sellToken.symbol}`)
      : `${t(`提交 ${sellToken.symbol} → ${buyToken.symbol} 限价单`, `Place ${sellToken.symbol} → ${buyToken.symbol} Limit Order`)}${worsePromptSuffix}`;
    const authed = await verifySecurityAuthAsync(wallet, actionTitle);
    if (!authed) return;

    st.limit.submitting = true;
    st.limit.errorMsg = '';
    renderLimitOrderCalculations();
    try {
      if (btnState.action === 'approve') {
        await lo.approveEvmCowToken({ wallet, chainKey: chain, tokenAddress: sellToken.contractAddress });
        showToast(t(`${sellToken.symbol} 授权成功`, `${sellToken.symbol} approved`));
        await refreshLimitMarketContextAsync();
        return;
      }

      const sellAmtNum = Number(st.limit.amountIn);
      const rateNum = Number(st.limit.targetRate);
      const sellRaw = contracts.toBaseUnits(String(st.limit.amountIn), sellToken.decimals);
      const buyAmtFloat = sellAmtNum * rateNum;
      const buyRaw = contracts.toBaseUnits(buyAmtFloat.toFixed(Math.min(12, buyToken.decimals)), buyToken.decimals);
      const sellPrice = (typeof sellToken.price === 'number' && sellToken.price > 0) ? sellToken.price : getSymbolPrice(sellToken.symbol === 'wNEAR' ? 'NEAR' : sellToken.symbol);
      const sellUsd = sellPrice ? sellAmtNum * sellPrice : null;
      const sellBal = getLimitTokenBalance(wallet, sellToken);

      if (chain === 'near') {
        const poolId = (st.limit.poolInfo && st.limit.poolInfo.poolId) || lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
        const point = (st.limit.snappedPoint !== null && st.limit.snappedPoint !== undefined)
          ? st.limit.snappedPoint
          : lo.priceToDclPoint({
              rateOutPerIn: rateNum,
              sellToken: sellToken.contractAddress,
              buyToken: buyToken.contractAddress,
              poolId,
              poolInfo: st.limit.poolInfo,
              sellDecimals: sellToken.decimals,
              buyDecimals: buyToken.decimals
            });
        await lo.placeNearDclLimitOrder({
          wallet,
          poolId,
          sellToken: sellToken.contractAddress,
          buyToken: buyToken.contractAddress,
          amountRaw: sellRaw,
          point,
          splitTwoTicks: Boolean(st.limit.splitTwoTicks),
          rateOutPerIn: rateNum,
          poolInfo: st.limit.poolInfo,
          sellDecimals: sellToken.decimals,
          buyDecimals: buyToken.decimals,
          sellSymbol: sellToken.symbol,
          tokenBalance: sellBal
        });
      } else if (chain === 'sol') {
        const expSec = Math.floor(Date.now() / 1000) + (Number(st.limit.expiryDays) || 7) * 86400;
        await lo.placeSolanaLimitOrder({
          wallet,
          inputMint: sellToken.contractAddress,
          outputMint: buyToken.contractAddress,
          makingAmount: sellRaw,
          takingAmount: buyRaw,
          expiredAt: expSec,
          inputUsdValue: sellUsd,
          sellBalance: sellBal,
          sellDecimals: sellToken.decimals,
          sellSymbol: sellToken.symbol
        });
      } else {
        const validTo = Math.floor(Date.now() / 1000) + (Number(st.limit.expiryDays) || 7) * 86400;
        await lo.placeEvmCowLimitOrder({
          wallet,
          chainKey: chain,
          sellToken: sellToken.contractAddress,
          buyToken: buyToken.contractAddress,
          sellAmount: sellRaw,
          buyAmount: buyRaw,
          validTo,
          sellUsdValue: sellUsd,
          sellBalance: sellBal,
          sellDecimals: sellToken.decimals,
          sellSymbol: sellToken.symbol
        });
      }

      st.limit.amountIn = '';
      if ($('limit-amount-in')) $('limit-amount-in').value = '';
      showToast(t('限价单已提交', 'Limit order placed'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitMarketContextAsync().catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      st.limit.errorMsg = err && err.message ? err.message : t('限价单提交失败', 'Limit order failed');
      showToast(st.limit.errorMsg);
    } finally {
      st.limit.submitting = false;
      renderLimitOrderCalculations();
    }
  }

  async function claimLimitOrderUI(orderId, buyToken) {
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !orderId) return;
    const authed = await verifySecurityAuthAsync(wallet, t('领取已成交限价单资产', 'Claim filled limit order'));
    if (!authed) return;
    try {
      await lo.claimNearDclOrder({ wallet, orderId, buyToken });
      showToast(t('已领取至钱包', 'Claimed to wallet'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('领取失败', 'Claim failed'));
    }
  }

  async function cancelLimitOrderUI(chain, orderId, remainAmount, sellToken, buyToken) {
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !orderId) return;
    const authed = await verifySecurityAuthAsync(wallet, t('撤销限价单', 'Cancel limit order'));
    if (!authed) return;
    try {
      if (chain === 'near') {
        await lo.cancelNearDclOrder({ wallet, orderId, remainAmount, sellToken, buyToken });
      } else if (chain === 'sol') {
        await lo.cancelSolanaLimitOrder({ wallet, orderPubkey: orderId });
      } else {
        await lo.cancelEvmCowOrder({ wallet, chainKey: chain, orderUid: orderId });
      }
      showToast(t('已撤单', 'Order cancelled'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('撤单失败', 'Cancel failed'));
    }
  }

