  // ==================== Perpetual Futures (Hyperliquid) Controller ====================

  let _perpQuoteTimer = null;
  const PERP_FAV_STORAGE_KEY = 'near_ca_perp_favorites_v1';

  function getPerpFavoriteCoins() {
    const st = getState();
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') {
        const raw = localStorage.getItem(PERP_FAV_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            st.perp.favoriteCoins = parsed.map((x) => String(x));
          }
        }
      }
    } catch (_) {}
    if (!Array.isArray(st.perp.favoriteCoins)) {
      st.perp.favoriteCoins = ['BTC', 'ETH', 'SOL', 'HYPE', 'xyz:CRCL'];
    }
    return st.perp.favoriteCoins;
  }

  function savePerpFavoriteCoins(list) {
    const clean = Array.from(new Set((Array.isArray(list) ? list : []).map((x) => String(x)).filter(Boolean)));
    getState().perp.favoriteCoins = clean;
    try {
      if (typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function') {
        localStorage.setItem(PERP_FAV_STORAGE_KEY, JSON.stringify(clean));
      }
    } catch (_) {}
    return clean;
  }

  function togglePerpFavorite(coin) {
    const c = String(coin || '').trim();
    if (!c) return;
    const list = [...getPerpFavoriteCoins()];
    const idx = list.indexOf(c);
    if (idx >= 0) list.splice(idx, 1);
    else list.unshift(c);
    savePerpFavoriteCoins(list);
    renderPerpView();
    if ($('sheet-perp-markets')?.classList?.contains('open') && typeof renderPerpMarketsSheet === 'function') {
      renderPerpMarketsSheet();
    }
  }

  function toggleCurrentPerpFavorite() {
    const coin = (getState().perp && getState().perp.selectedCoin) || 'BTC';
    togglePerpFavorite(coin);
  }

  function formatPerpDisplayPair(coin) {
    const hl = getHyperliquid();
    if (hl && typeof hl.formatPerpPairName === 'function') return hl.formatPerpPairName(coin);
    const s = String(coin || '').trim();
    const base = s.includes(':') ? s.split(':').slice(1).join(':') : s;
    return base ? `${base}-USDC` : '--';
  }

  function extractPerpDexBadge(coin) {
    const hl = getHyperliquid();
    if (hl && typeof hl.extractPerpDexTag === 'function') return hl.extractPerpDexTag(coin);
    const s = String(coin || '').trim();
    const idx = s.indexOf(':');
    return idx > 0 ? s.slice(0, idx) : '';
  }

  function getSelectedPerpMarket() {
    const st = getState();
    const list = Array.isArray(st.perp && st.perp.markets) ? st.perp.markets : [];
    const coin = String((st.perp && st.perp.selectedCoin) || 'BTC');
    return list.find((m) => m.name === coin) || list[0] || null;
  }

  function resolvePerpMarginBounds(market) {
    const st = getState();
    const maxLev = market ? (Number(market.maxLeverage) || 20) : 50;
    const onlyIso = Boolean(market && market.onlyIsolated);
    if (onlyIso) st.perp.marginMode = 'isolated';
    if (st.perp.leverage > maxLev) st.perp.leverage = maxLev;
    if (st.perp.leverage < 1) st.perp.leverage = 1;
    return { maxLev, onlyIso };
  }

  function formatPerpPx(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '--';
    if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
    if (n >= 100) return n.toFixed(2);
    if (n >= 1) return n.toFixed(4);
    return n.toPrecision(4);
  }

  function evaluatePerpOrderState(override = {}) {
    const st = getState();
    const hl = getHyperliquid();
    const market = override.market !== undefined ? override.market : getSelectedPerpMarket();
    const acct = override.account !== undefined ? override.account : st.perp.account;
    const side = override.side || st.perp.side || 'long';
    const isBuy = side === 'long';
    const orderType = override.orderType || st.perp.orderType || 'market';
    const reduceOnly = Boolean(override.reduceOnly !== undefined ? override.reduceOnly : st.perp.reduceOnly);
    const isPostOnly = String(orderType).toLowerCase() === 'post_only';
    const isLimitLike = String(orderType).toLowerCase() === 'limit' || isPostOnly;
    const lev = Math.max(1, Number(override.leverage ?? st.perp.leverage) || 5);
    const margin = Number(override.marginInput ?? st.perp.marginInput);
    const limitPx = Number(override.limitPriceInput ?? st.perp.limitPriceInput);
    const availMargin = acct ? Number(acct.availableMargin || 0) : null;
    const markPx = market ? Number(market.markPx || 0) : null;
    const rawExecPx = isLimitLike ? limitPx : markPx;
    const execPx = (hl && market && Number.isFinite(rawExecPx) && rawExecPx > 0)
      ? Number(hl.formatHlPrice(rawExecPx, market.szDecimals))
      : rawExecPx;
    const feeRate = isLimitLike
      ? (acct && Number.isFinite(Number(acct.makerFeeRate)) ? Number(acct.makerFeeRate) : 0.00015)
      : (acct && Number.isFinite(Number(acct.takerFeeRate)) ? Number(acct.takerFeeRate) : 0.00045);

    let notional = null;
    let sizeNum = null;
    let sizeStr = '--';
    let estLiqPx = null;
    let estFeeUsd = null;
    if (Number.isFinite(margin) && margin > 0 && execPx && Number.isFinite(execPx) && execPx > 0) {
      notional = margin * lev;
      estFeeUsd = notional * feeRate;
      const rawSize = notional / execPx;
      sizeStr = hl ? hl.formatHlSize(rawSize, market ? market.szDecimals : 4) : rawSize.toFixed(4);
      sizeNum = Number(sizeStr);
      if (hl) {
        estLiqPx = hl.computeEstimatedLiqPrice({ markPx: execPx, leverage: lev, isLong: isBuy, maxLeverage: market ? market.maxLeverage : 100 });
      }
    }

    const coinLabel = market ? formatPerpDisplayPair(market.name) : formatPerpDisplayPair(st.perp.selectedCoin || 'BTC');
    const actionLabel = isBuy ? `${t('开多', 'Long')} ${coinLabel}` : `${t('开空', 'Short')} ${coinLabel}`;
    const marginNeeded = Number.isFinite(margin) && margin > 0 ? margin : null;

    if (st.perp.submitting) {
      return { disabled: true, error: '', text: t('提交签名中...', 'Submitting...'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded };
    }
    if (!market || !markPx) {
      return { disabled: true, error: '', text: t('同步市场行情...', 'Loading market...'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded };
    }
    if (isLimitLike && (!Number.isFinite(limitPx) || limitPx <= 0)) {
      return { disabled: true, error: '', text: t('请输入限价价格', 'Enter limit price'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded };
    }
    if (!Number.isFinite(margin) || margin <= 0) {
      return { disabled: true, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded };
    }
    if (!reduceOnly && availMargin !== null && margin > availMargin + 1e-6) {
      const msg = t(`可用保证金不足 (当前: $${availMargin.toFixed(2)} USDC)`, `Insufficient margin (avail: $${availMargin.toFixed(2)} USDC)`);
      return { disabled: true, error: msg, text: t('保证金不足', 'Insufficient Margin'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded };
    }
    const minNotional = hl ? hl.HL_MIN_ORDER_USD : 10;
    const flooredNotional = (sizeNum > 0 && execPx > 0) ? (sizeNum * execPx) : 0;
    if (!reduceOnly && (!flooredNotional || flooredNotional < minNotional)) {
      const msg = t(`名义价值需 >= $${minNotional} USDC (按精度取整后 $${flooredNotional.toFixed(2)})`, `Notional must be >= $${minNotional} USDC ($${flooredNotional.toFixed(2)} after size step)`);
      return { disabled: true, error: msg, text: t(`最低名义 $${minNotional}`, `Min $${minNotional} Notional`), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded };
    }
    if (!sizeNum || sizeNum <= 0) {
      return { disabled: true, error: t('数量低于最小精度', 'Size below tick step'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded };
    }
    return { disabled: false, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded };
  }

  function formatCompactUsd(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '--';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }

  function togglePerpLeverageDrawer() {
    const drawer = $('perp-lev-drawer');
    if (!drawer) return;
    const willOpen = drawer.classList.contains('hidden');
    drawer.classList.toggle('hidden', !willOpen);
    const btn = $('btn-perp-lev-toggle');
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

