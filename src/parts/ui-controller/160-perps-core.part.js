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

  function getPerpBaseCoinSymbol(coin) {
    const base = formatPerpDisplayPair(coin || 'BTC').split('-')[0];
    return base || 'BTC';
  }

  function syncPerpInputUnitUI() {
    const st = getState();
    const unit = (st.perp && st.perp.inputUnit === 'coin') ? 'coin' : 'margin';
    const market = getSelectedPerpMarket();
    const baseCoin = getPerpBaseCoinSymbol(market ? market.name : (st.perp && st.perp.selectedCoin));
    const unitBtn = $('btn-perp-input-unit');
    if (unitBtn) {
      unitBtn.textContent = unit === 'coin' ? `${baseCoin} ▾` : 'USDC ▾';
    }
    const inp = $('perp-margin-input');
    if (inp) {
      if (unit === 'coin') {
        inp.removeAttribute('data-i18n-placeholder');
        inp.placeholder = t(`数量 (${baseCoin})`, `Size (${baseCoin})`);
      } else {
        inp.setAttribute('data-i18n-placeholder', 'perp.marginInputLabel');
        inp.placeholder = t('保证金 (USDC)', 'Margin (USDC)');
      }
    }
  }

  function togglePerpInputUnit() {
    const st = getState();
    const nextUnit = (st.perp && st.perp.inputUnit === 'coin') ? 'margin' : 'coin';
    st.perp.inputUnit = nextUnit;
    st.perp.marginInput = '';
    st.perp.errorMsg = '';
    const inp = $('perp-margin-input');
    if (inp) inp.value = '';
    if (typeof clearPerpPctDots === 'function') clearPerpPctDots();
    syncPerpInputUnitUI();
    if (typeof evaluatePerpOrderUI === 'function') evaluatePerpOrderUI(false);
    if (typeof st.emitStateTopic === 'function') st.emitStateTopic('perp');
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
    const inputUnit = ((override.inputUnit || (st.perp && st.perp.inputUnit) || 'margin') === 'coin') ? 'coin' : 'margin';
    const rawInputVal = Number(override.marginInput ?? st.perp.marginInput);
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

    let margin = inputUnit === 'margin' ? rawInputVal : NaN;
    let notional = null;
    let sizeNum = null;
    let sizeStr = '--';
    let estLiqPx = null;
    let estFeeUsd = null;
    if (Number.isFinite(rawInputVal) && rawInputVal > 0 && execPx && Number.isFinite(execPx) && execPx > 0) {
      if (inputUnit === 'coin') {
        sizeStr = hl ? hl.formatHlSize(rawInputVal, market ? market.szDecimals : 4) : rawInputVal.toFixed(4);
        sizeNum = Number(sizeStr);
        notional = (sizeNum > 0 ? sizeNum : rawInputVal) * execPx;
        margin = lev > 0 ? notional / lev : notional;
        estFeeUsd = notional * feeRate;
      } else {
        notional = margin * lev;
        estFeeUsd = notional * feeRate;
        const rawSize = notional / execPx;
        sizeStr = hl ? hl.formatHlSize(rawSize, market ? market.szDecimals : 4) : rawSize.toFixed(4);
        sizeNum = Number(sizeStr);
      }
      if (hl) {
        estLiqPx = hl.computeEstimatedLiqPrice({ markPx: execPx, leverage: lev, isLong: isBuy, maxLeverage: market ? market.maxLeverage : 100 });
      }
    }

    const coinLabel = market ? formatPerpDisplayPair(market.name) : formatPerpDisplayPair(st.perp.selectedCoin || 'BTC');
    const actionLabel = isBuy ? `${t('开多', 'Long')} ${coinLabel}` : `${t('开空', 'Short')} ${coinLabel}`;
    const marginNeeded = Number.isFinite(margin) && margin > 0 ? margin : null;

    if (st.perp.submitting) {
      return { disabled: true, error: '', text: t('提交签名中...', 'Submitting...'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded, margin: marginNeeded, inputUnit };
    }
    if (!market || !markPx) {
      return { disabled: true, error: '', text: t('同步市场行情...', 'Loading market...'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded, margin: marginNeeded, inputUnit };
    }
    if (isLimitLike && (!Number.isFinite(limitPx) || limitPx <= 0)) {
      return { disabled: true, error: '', text: t('请输入限价价格', 'Enter limit price'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded, margin: marginNeeded, inputUnit };
    }
    if (!Number.isFinite(rawInputVal) || rawInputVal <= 0) {
      return { disabled: true, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded, margin: marginNeeded, inputUnit };
    }
    if (!reduceOnly && availMargin !== null && margin > availMargin + 1e-6) {
      const msg = t(`可用保证金不足 (当前: $${availMargin.toFixed(2)} USDC)`, `Insufficient margin (avail: $${availMargin.toFixed(2)} USDC)`);
      return { disabled: true, error: msg, text: t('保证金不足', 'Insufficient Margin'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded, margin: marginNeeded, inputUnit };
    }
    const minNotional = hl ? hl.HL_MIN_ORDER_USD : 10;
    const flooredNotional = (sizeNum > 0 && execPx > 0) ? (sizeNum * execPx) : 0;
    if (!reduceOnly && (!flooredNotional || flooredNotional < minNotional)) {
      const msg = t(`名义价值需 >= $${minNotional} USDC (按精度取整后 $${flooredNotional.toFixed(2)})`, `Notional must be >= $${minNotional} USDC ($${flooredNotional.toFixed(2)} after size step)`);
      return { disabled: true, error: msg, text: t(`最低名义 $${minNotional}`, `Min $${minNotional} Notional`), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded, margin: marginNeeded, inputUnit };
    }
    if (!sizeNum || sizeNum <= 0) {
      return { disabled: true, error: t('数量低于最小精度', 'Size below tick step'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded, margin: marginNeeded, inputUnit };
    }
    return { disabled: false, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike, marginNeeded, margin: marginNeeded, inputUnit };
  }

  let _activeTpSlFocusKind = null;

  function computePerpTpSlSideEstimate(kind, side, triggerPx, entryPx, size, margin) {
    if (!(triggerPx > 0) || !Number.isFinite(entryPx) || entryPx <= 0 || !Number.isFinite(size) || size <= 0) {
      return null;
    }
    const isLong = side === 'long';
    const isTp = kind === 'tp';
    const valid = isTp
      ? (isLong ? triggerPx > entryPx : triggerPx < entryPx)
      : (isLong ? triggerPx < entryPx : triggerPx > entryPx);
    if (!valid) return { valid: false, pnl: null, roe: null };
    const pnl = isLong ? (triggerPx - entryPx) * size : (entryPx - triggerPx) * size;
    const roe = (Number.isFinite(margin) && margin > 0) ? (pnl / margin) * 100 : null;
    return { valid: true, pnl, roe };
  }

  function updatePerpTpSlEstimateTooltip(kind, visible) {
    const tipEl = $('perp-tpsl-est-tooltip');
    if (visible === false) {
      if (!kind || _activeTpSlFocusKind === kind) _activeTpSlFocusKind = null;
      if (tipEl) tipEl.classList.add('hidden');
      return;
    }
    if (kind === 'tp' || kind === 'sl') _activeTpSlFocusKind = kind;
    if (!tipEl || !_activeTpSlFocusKind) {
      if (tipEl) tipEl.classList.add('hidden');
      return;
    }
    const st = getState();
    const isTp = _activeTpSlFocusKind === 'tp';
    const inpEl = $(isTp ? 'perp-tp-input' : 'perp-sl-input');
    const triggerPx = Number(inpEl && inpEl.value !== '' ? inpEl.value : (isTp ? st.perp.tpInput : st.perp.slInput));
    const evalRes = evaluatePerpOrderState();
    const entryPx = Number(evalRes && evalRes.execPx);
    const size = Number(evalRes && evalRes.sizeNum);
    const margin = Number(evalRes && evalRes.marginNeeded);
    if (!(triggerPx > 0) || !Number.isFinite(entryPx) || entryPx <= 0 || !Number.isFinite(size) || size <= 0) {
      tipEl.classList.add('hidden');
      return;
    }
    const fmtRow = (side, est) => {
      const sideLabel = side === 'long' ? t('开多', 'Long') : t('开空', 'Short');
      const pnlLabel = t('盈亏', 'PnL');
      if (!est || !est.valid || !Number.isFinite(est.pnl)) {
        return `<div class="perp-tpsl-est-row"><span>${escapeHtml(sideLabel)} ${escapeHtml(pnlLabel)}</span><span class="mono muted">--</span></div>`;
      }
      const sign = est.pnl >= 0 ? '+' : '-';
      const roeTxt = Number.isFinite(est.roe) ? ` (${est.roe >= 0 ? '+' : '-'}${Math.abs(est.roe).toFixed(2)}%)` : '';
      const cls = est.pnl >= 0 ? 'is-profit' : 'is-loss';
      return `<div class="perp-tpsl-est-row"><span>${escapeHtml(sideLabel)} ${escapeHtml(pnlLabel)}</span><span class="mono ${cls}">${sign}$${Math.abs(est.pnl).toFixed(2)}${roeTxt}</span></div>`;
    };
    const longEst = computePerpTpSlSideEstimate(_activeTpSlFocusKind, 'long', triggerPx, entryPx, size, margin);
    const shortEst = computePerpTpSlSideEstimate(_activeTpSlFocusKind, 'short', triggerPx, entryPx, size, margin);
    tipEl.innerHTML = fmtRow('long', longEst) + fmtRow('short', shortEst);
    tipEl.classList.remove('hidden');
  }

  function formatCompactUsd(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '--';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }

