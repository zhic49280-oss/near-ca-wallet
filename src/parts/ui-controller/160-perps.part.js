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
    const execPx = isLimitLike ? limitPx : markPx;
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
        estLiqPx = hl.computeEstimatedLiqPrice({ markPx: execPx, leverage: lev, isLong: isBuy });
      }
    }

    const coinLabel = market ? formatPerpDisplayPair(market.name) : formatPerpDisplayPair(st.perp.selectedCoin || 'BTC');
    const actionLabel = isBuy ? `${t('开多', 'Long')} ${coinLabel}` : `${t('开空', 'Short')} ${coinLabel}`;

    if (st.perp.submitting) {
      return { disabled: true, error: '', text: t('提交签名中...', 'Submitting...'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike };
    }
    if (!market || !markPx) {
      return { disabled: true, error: '', text: t('同步市场行情...', 'Loading market...'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike };
    }
    if (isLimitLike && (!Number.isFinite(limitPx) || limitPx <= 0)) {
      return { disabled: true, error: '', text: t('请输入限价价格', 'Enter limit price'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike };
    }
    if (!Number.isFinite(margin) || margin <= 0) {
      return { disabled: true, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike };
    }
    if (!reduceOnly && availMargin !== null && margin > availMargin + 1e-6) {
      const msg = t(`可用保证金不足 (当前: $${availMargin.toFixed(2)} USDC)`, `Insufficient margin (avail: $${availMargin.toFixed(2)} USDC)`);
      return { disabled: true, error: msg, text: t('保证金不足', 'Insufficient Margin'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike };
    }
    const minNotional = hl ? hl.HL_MIN_ORDER_USD : 10;
    if (!reduceOnly && (!notional || notional < minNotional)) {
      const msg = t(`名义价值需 >= $${minNotional} USDC (当前 $${(notional || 0).toFixed(2)})`, `Notional must be >= $${minNotional} USDC (now $${(notional || 0).toFixed(2)})`);
      return { disabled: true, error: msg, text: t(`最低名义 $${minNotional}`, `Min $${minNotional} Notional`), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike };
    }
    if (!sizeNum || sizeNum <= 0) {
      return { disabled: true, error: t('数量低于最小精度', 'Size below tick step'), notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike };
    }
    return { disabled: false, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx, estFeeUsd, feeRate, isLimitLike };
  }

  function formatCompactUsd(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '--';
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
    return `$${n.toFixed(0)}`;
  }

  function renderPerpCandleSvg(candles, market = null) {
    const list = Array.isArray(candles) ? candles : [];
    if (list.length < 2) {
      return `<div style="text-align:center; padding: 36px 0; font-size: 11.5px; color: var(--text-muted);">--</div>`;
    }
    const W = 340;
    const H = 168;
    const plotL = 4;
    const plotR = 276;
    const plotW = plotR - plotL;
    const candleTop = 8;
    const candleBottom = 114;
    const volTop = 126;
    const volBottom = 162;

    let minLow = Infinity;
    let maxHigh = -Infinity;
    let maxVol = 0;
    for (const c of list) {
      if (c.l < minLow) minLow = c.l;
      if (c.h > maxHigh) maxHigh = c.h;
      if (Number.isFinite(c.v) && c.v > maxVol) maxVol = c.v;
    }
    const span = maxHigh - minLow || 1;
    const step = plotW / list.length;
    const bw = Math.max(2, step * 0.58);
    const yOf = (p) => Math.max(candleTop, Math.min(candleBottom, candleBottom - ((p - minLow) / span) * (candleBottom - candleTop)));

    // Grid lines + right price axis (High, Mid, Low)
    const midPx = (maxHigh + minLow) / 2;
    const gridLevels = [
      { y: candleTop + 2, px: maxHigh },
      { y: (candleTop + candleBottom) / 2, px: midPx },
      { y: candleBottom - 2, px: minLow }
    ];
    const gridSvg = gridLevels.map((g) =>
      `<line x1="${plotL}" y1="${g.y.toFixed(1)}" x2="${plotR}" y2="${g.y.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 3" stroke-width="0.8" />` +
      `<text x="280" y="${(g.y + 3).toFixed(1)}" fill="rgba(203,213,225,0.7)" font-size="9" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(g.px))}</text>`
    ).join('');

    // Candlesticks + Volume Histogram
    const candleSvg = list.map((c, idx) => {
      const xCenter = plotL + idx * step + step / 2;
      const isUp = c.c >= c.o;
      const color = isUp ? '#34d399' : '#fb7185';
      const yH = yOf(c.h);
      const yL = yOf(c.l);
      const yO = yOf(c.o);
      const yC = yOf(c.c);
      const bodyTop = Math.min(yO, yC);
      const bodyH = Math.max(1.5, Math.abs(yO - yC));
      const xLeft = xCenter - bw / 2;
      let volRect = '';
      if (maxVol > 0 && Number.isFinite(c.v) && c.v > 0) {
        const vh = Math.max(1.5, (c.v / maxVol) * (volBottom - volTop));
        volRect = `<rect x="${xLeft.toFixed(1)}" y="${(volBottom - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${vh.toFixed(1)}" fill="${color}" fill-opacity="0.45" rx="0.6" />`;
      }
      return `<line x1="${xCenter.toFixed(1)}" y1="${yH.toFixed(1)}" x2="${xCenter.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${color}" stroke-width="1" />` +
        `<rect x="${xLeft.toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${color}" rx="0.8" />` +
        volRect;
    }).join('');

    // Separator between candle and volume zones + Mark Price indicator
    let markSvg = `<line x1="${plotL}" y1="${volTop - 4}" x2="${plotR}" y2="${volTop - 4}" stroke="rgba(255,255,255,0.06)" stroke-width="0.8" />`;
    const livePx = (market && Number(market.markPx)) || list[list.length - 1].c;
    if (Number.isFinite(livePx) && livePx > 0) {
      const ym = yOf(livePx);
      const pillY = Math.max(2, Math.min(candleBottom - 10, ym - 6));
      markSvg += `<line x1="${plotL}" y1="${ym.toFixed(1)}" x2="${plotR}" y2="${ym.toFixed(1)}" stroke="#00ec97" stroke-dasharray="3 2" stroke-width="0.9" stroke-opacity="0.8" />` +
        `<rect x="278" y="${pillY.toFixed(1)}" width="58" height="13" rx="3" fill="rgba(0,236,151,0.22)" stroke="rgba(0,236,151,0.65)" stroke-width="0.7" />` +
        `<text x="282" y="${(pillY + 9.5).toFixed(1)}" fill="#00ec97" font-size="8.5" font-weight="700" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(livePx))}</text>`;
    }

    return `<svg viewBox="0 0 ${W} ${H}" class="perp-chart-svg" preserveAspectRatio="xMidYMid meet">${gridSvg}${candleSvg}${markSvg}</svg>`;
  }

  function renderPerpOrderbook() {
    const st = getState();
    const hl = getHyperliquid();
    const ob = st.perp.orderbook;
    const rawCoin = (st.perp && st.perp.selectedCoin) || 'BTC';
    const coin = (hl && typeof hl.extractPerpBaseSymbol === 'function')
      ? hl.extractPerpBaseSymbol(rawCoin)
      : (rawCoin.includes(':') ? rawCoin.split(':').slice(1).join(':') : rawCoin);
    const bidsEl = $('perp-ob-bids');
    const asksEl = $('perp-ob-asks');
    const midEl = $('perp-ob-mid-badge');
    const bidSumEl = $('perp-ob-bid-summary');
    const askSumEl = $('perp-ob-ask-summary');
    const bidBarEl = $('perp-ob-bid-bar');
    const askBarEl = $('perp-ob-ask-bar');
    const szLabel = `${t('数量', 'Size')} (${coin})`;
    if ($('perp-ob-bid-sz-hdr')) $('perp-ob-bid-sz-hdr').textContent = szLabel;
    if ($('perp-ob-ask-sz-hdr')) $('perp-ob-ask-sz-hdr').textContent = szLabel;
    if (!bidsEl || !asksEl) return;

    const market = getSelectedPerpMarket();
    if (midEl) {
      midEl.textContent = market && market.markPx ? `$${formatPerpPx(market.markPx)}` : '--';
    }

    if (!ob || (!ob.bids.length && !ob.asks.length)) {
      bidsEl.innerHTML = `<div class="perp-ob-row"><span>--</span><span>--</span></div>`;
      asksEl.innerHTML = `<div class="perp-ob-row"><span>--</span><span>--</span></div>`;
      if (bidSumEl) bidSumEl.textContent = '--';
      if (askSumEl) askSumEl.textContent = '--';
      if (bidBarEl) bidBarEl.style.width = '50%';
      if (askBarEl) askBarEl.style.width = '50%';
      return;
    }

    const bidTot = Number(ob.bidTotalSz || 0);
    const askTot = Number(ob.askTotalSz || 0);
    const ratio = Number.isFinite(ob.bidRatioPct) ? ob.bidRatioPct : 50;
    if (bidSumEl) {
      bidSumEl.textContent = `${t('20档买盘', 'Bids')} ${formatBal(bidTot, 2)} ${coin}`;
    }
    if (askSumEl) {
      askSumEl.textContent = `${t('卖盘', 'Asks')} ${formatBal(askTot, 2)} ${coin}`;
    }
    if (bidBarEl) bidBarEl.style.width = `${Math.max(5, Math.min(95, ratio)).toFixed(1)}%`;
    if (askBarEl) askBarEl.style.width = `${Math.max(5, Math.min(95, 100 - ratio)).toFixed(1)}%`;

    const bidRows = ob.bids.slice(0, 10);
    const askRows = [...ob.asks.slice(0, 10)].reverse();
    let maxBidSz = 0;
    let maxAskSz = 0;
    for (const r of bidRows) if (r.sz > maxBidSz) maxBidSz = r.sz;
    for (const r of askRows) if (r.sz > maxAskSz) maxAskSz = r.sz;

    bidsEl.innerHTML = bidRows.map((r) => {
      const pct = maxBidSz > 0 ? Math.max(6, (r.sz / maxBidSz) * 100) : 0;
      return `<button type="button" class="perp-ob-row bid" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="width:${pct.toFixed(0)}%"></div><span>${escapeHtml(r.sz.toFixed(3))}</span><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span></button>`;
    }).join('');
    asksEl.innerHTML = askRows.map((r) => {
      const pct = maxAskSz > 0 ? Math.max(6, (r.sz / maxAskSz) * 100) : 0;
      return `<button type="button" class="perp-ob-row ask" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="width:${pct.toFixed(0)}%"></div><span>${escapeHtml(r.sz.toFixed(3))}</span><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span></button>`;
    }).join('');
  }

  function renderPerpBottomList() {
    const st = getState();
    const listEl = $('perp-bottom-list');
    if (!listEl) return;
    const tab = st.perp.bottomTab || 'positions';
    const acct = st.perp.account;
    const posCount = acct && Array.isArray(acct.positions) ? acct.positions.length : 0;
    const ordCount = acct && Array.isArray(acct.openOrders) ? acct.openOrders.length : 0;

    if ($('perp-tab-positions')) {
      $('perp-tab-positions').classList.toggle('active', tab === 'positions');
      $('perp-tab-positions').textContent = `${t('当前持仓', 'Positions')}${posCount > 0 ? ` (${posCount})` : ''}`;
    }
    if ($('perp-tab-orders')) {
      $('perp-tab-orders').classList.toggle('active', tab === 'orders');
      $('perp-tab-orders').textContent = `${t('当前委托', 'Open Orders')}${ordCount > 0 ? ` (${ordCount})` : ''}`;
    }
    if ($('perp-tab-fills')) {
      $('perp-tab-fills').classList.toggle('active', tab === 'fills');
    }

    const batchBtn = $('btn-perp-batch-action');
    if (batchBtn) {
      if (tab === 'positions' && posCount > 0) {
        batchBtn.classList.remove('hidden');
        batchBtn.textContent = t('一键全平', 'Close All');
      } else if (tab === 'orders' && ordCount > 0) {
        batchBtn.classList.remove('hidden');
        batchBtn.textContent = t('全部撤单', 'Cancel All');
      } else {
        batchBtn.classList.add('hidden');
      }
    }

    if (!acct) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">--</div>`;
      return;
    }

    const mktByName = new Map((st.perp.markets || []).map((m) => [m.name, m]));

    if (tab === 'positions') {
      if (!acct.positions || acct.positions.length === 0) {
        listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">${escapeHtml(t('暂无持仓', 'No open positions'))}</div>`;
        return;
      }
      listEl.innerHTML = acct.positions.map((p) => {
        const upnl = Number(p.unrealizedPnl || 0);
        const upnlCls = upnl >= 0 ? 'text-emerald' : 'text-rose';
        const dirText = p.isLong ? t('做多', 'Long') : t('做空', 'Short');
        const modeText = p.leverageType === 'cross' ? t('全仓', 'Cross') : t('逐仓', 'Isolated');
        const roeStr = p.returnOnEquity !== null ? `${p.returnOnEquity >= 0 ? '+' : ''}${(p.returnOnEquity * 100).toFixed(2)}%` : '--';
        const mkt = mktByName.get(p.coin);
        const markPx = mkt && mkt.markPx ? formatPerpPx(mkt.markPx) : '--';
        const marginText = p.marginUsed !== null ? `$${Number(p.marginUsed).toFixed(2)}` : '--';
        const tpslSummary = (p.tpTriggerPx || p.slTriggerPx)
          ? `${t('止盈', 'TP')}: ${p.tpTriggerPx ? '$' + formatPerpPx(p.tpTriggerPx) : '--'} / ${t('止损', 'SL')}: ${p.slTriggerPx ? '$' + formatPerpPx(p.slTriggerPx) : '--'}`
          : t('止盈/止损: 未设置', 'TP/SL: Not set');
        return `
          <div class="perp-pos-card">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1" style="flex-wrap: wrap;">
                <strong style="font-size: 13.5px;">${escapeHtml(formatPerpDisplayPair(p.coin))}</strong>
                <span class="ca-badge">${escapeHtml(dirText)} ${escapeHtml(String(p.leverageValue || '--'))}x</span>
                <span class="perp-dex-pill">${escapeHtml(modeText)}</span>
              </div>
              <span class="mono ${upnlCls}" style="font-size: 13px; font-weight: 800;">${upnl >= 0 ? '+' : ''}$${escapeHtml(upnl.toFixed(2))} (${escapeHtml(roeStr)})</span>
            </div>
            <div class="perp-pos-metrics-grid" style="font-size: 11px; color: var(--text-secondary);">
              <div><div class="meta-key">${escapeHtml(t('持仓数量', 'Size'))}</div><strong class="mono">${escapeHtml(String(p.absSize))}</strong></div>
              <div><div class="meta-key">${escapeHtml(t('保证金 (USDC)', 'Margin'))}</div><strong class="mono">${escapeHtml(marginText)}</strong></div>
              <div><div class="meta-key">${escapeHtml(t('预估强平价', 'Est. Liq. Price'))}</div><strong class="mono text-rose">${p.liquidationPx ? '$' + escapeHtml(formatPerpPx(p.liquidationPx)) : '--'}</strong></div>
              <div><div class="meta-key">${escapeHtml(t('开仓均价', 'Entry'))}</div><span class="mono">${p.entryPx ? '$' + escapeHtml(formatPerpPx(p.entryPx)) : '--'}</span></div>
              <div><div class="meta-key">${escapeHtml(t('标记价格', 'Mark'))}</div><span class="mono">${markPx !== '--' ? '$' + escapeHtml(markPx) : '--'}</span></div>
              <div><div class="meta-key">${escapeHtml(t('止盈/止损', 'TP / SL'))}</div><span class="mono" style="font-size:10px;">${escapeHtml(tpslSummary)}</span></div>
            </div>
            <div class="flex items-center gap-2" style="margin-top: 2px;">
              <button type="button" class="mini-action-btn flex-1" data-action="reverse-perp-pos" data-coin="${escapeHtml(p.coin)}">${escapeHtml(t('反手', 'Reverse'))}</button>
              <button type="button" class="mini-action-btn flex-1" data-action="open-perp-pos-tpsl" data-coin="${escapeHtml(p.coin)}">${escapeHtml(t('止盈/止损', 'TP / SL'))}</button>
              <button type="button" class="mini-action-btn primary flex-1" data-action="close-perp-pos" data-coin="${escapeHtml(p.coin)}">${escapeHtml(t('市价平仓', 'Close'))}</button>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    if (tab === 'orders') {
      const orders = acct.openOrders || [];
      if (orders.length === 0) {
        listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">${escapeHtml(t('暂无活动委托', 'No open orders'))}</div>`;
        return;
      }
      listEl.innerHTML = orders.map((o) => {
        const isBuy = String(o.side || '').toUpperCase() === 'B';
        const isTrigger = Boolean(o.isTrigger || /Take Profit|Stop/i.test(String(o.orderType || '')));
        const tagText = isTrigger ? (o.orderType || t('条件止盈损', 'TP/SL Trigger')) : t('限价委托', 'Limit');
        const pxLabel = isTrigger ? t('触发价', 'Trigger') : t('委托价', 'Price');
        const pxShow = isTrigger ? (o.triggerPx || o.limitPx || '--') : (o.limitPx || '--');
        return `
          <div class="perp-pos-card">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                <strong>${escapeHtml(formatPerpDisplayPair(o.coin || ''))}</strong>
                <span class="ca-badge">${escapeHtml(isBuy ? t('买入', 'Buy') : t('卖出', 'Sell'))}</span>
                <span class="perp-dex-pill">${escapeHtml(tagText)}</span>
              </div>
              <div class="flex items-center gap-1">
                ${isTrigger ? `<button type="button" class="mini-action-btn" data-action="open-perp-pos-tpsl" data-coin="${escapeHtml(String(o.coin || ''))}">${escapeHtml(t('修改', 'Modify'))}</button>` : ''}
                <button type="button" class="mini-action-btn" data-action="cancel-perp-order" data-coin="${escapeHtml(String(o.coin || ''))}" data-oid="${escapeHtml(String(o.oid || ''))}">${escapeHtml(t('撤单', 'Cancel'))}</button>
              </div>
            </div>
            <div class="flex items-center justify-between" style="font-size: 11.5px; color: var(--text-secondary);">
              <span>${escapeHtml(pxLabel)}: <span class="mono">$${escapeHtml(String(pxShow))}</span></span>
              <span>${escapeHtml(t('数量', 'Size'))}: <span class="mono">${escapeHtml(String(o.sz || '--'))}</span></span>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    const fills = acct.fills || [];
    if (fills.length === 0) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">${escapeHtml(t('暂无成交记录', 'No recent fills'))}</div>`;
      return;
    }
    listEl.innerHTML = fills.slice(0, 20).map((f) => {
      const isBuy = String(f.side || '').toUpperCase() === 'B';
      const pnl = Number(f.closedPnl || 0);
      const feeNum = f.fee !== undefined ? Number(f.fee) : null;
      return `
        <div class="perp-pos-card" style="padding: 8px 10px;">
          <div class="flex items-center justify-between" style="font-size: 12px;">
            <span><strong>${escapeHtml(formatPerpDisplayPair(f.coin || ''))}</strong> · ${escapeHtml(isBuy ? t('买入', 'Buy') : t('卖出', 'Sell'))} ${escapeHtml(String(f.sz || ''))} @ $${escapeHtml(String(f.px || '--'))}</span>
            <span class="mono ${pnl >= 0 ? 'text-emerald' : 'text-rose'}">${pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)}` : '--'}</span>
          </div>
          ${Number.isFinite(feeNum) ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">${escapeHtml(t('手续费', 'Fee'))}: <span class="mono">$${feeNum.toFixed(4)} USDC</span></div>` : ''}
        </div>
      `;
    }).join('');
  }

  function evaluatePerpOrderUI() {
    const st = getState();
    const market = getSelectedPerpMarket();
    const marginEl = $('perp-margin-input');
    const limitEl = $('perp-limit-price-input');
    if (marginEl && marginEl.value !== undefined) st.perp.marginInput = marginEl.value;
    if (limitEl && limitEl.value !== undefined) st.perp.limitPriceInput = limitEl.value;
    st.perp.tpInput = ($('perp-tp-input')?.value || '').trim();
    st.perp.slInput = ($('perp-sl-input')?.value || '').trim();

    const evalRes = evaluatePerpOrderState({ market });
    const ntlEl = $('perp-meta-notional');
    const szEl = $('perp-meta-size');
    const liqEl = $('perp-meta-liq');
    const feeEl = $('perp-meta-fee');
    if (ntlEl) ntlEl.textContent = evalRes.notional ? `$${evalRes.notional.toFixed(2)} USDC` : '--';
    if (szEl) szEl.textContent = evalRes.sizeNum > 0 ? `${evalRes.sizeStr} ${formatPerpDisplayPair(market ? market.name : st.perp.selectedCoin).split('-')[0]}` : '--';
    if (liqEl) liqEl.textContent = evalRes.estLiqPx ? `$${formatPerpPx(evalRes.estLiqPx)}` : '--';
    if (feeEl) {
      const ratePct = `${((evalRes.feeRate || 0.00045) * 100).toFixed(3).replace(/0$/, '')}%`;
      feeEl.textContent = evalRes.estFeeUsd !== null && evalRes.estFeeUsd !== undefined
        ? `$${evalRes.estFeeUsd.toFixed(4)} (${evalRes.isLimitLike ? 'Maker' : 'Taker'} ${ratePct})`
        : `${evalRes.isLimitLike ? 'Maker' : 'Taker'} ${ratePct}`;
    }

    const errEl = $('perp-error-banner');
    const errText = st.perp.errorMsg || evalRes.error || '';
    if (errEl) {
      errEl.textContent = errText;
      errEl.classList.toggle('hidden', !errText);
    }
    const btn = $('btn-perp-submit');
    if (btn) {
      btn.disabled = Boolean(evalRes.disabled);
      btn.textContent = evalRes.text;
    }
    return evalRes;
  }

  function renderPerpOverviewPanel() {
    const st = getState();
    const tokens = getTokens();
    const acct = st.perp.account;

    const overviewPanel = $('perp-overview-panel');
    const tradePanel = $('perp-trade-panel');
    const isTradeView = st.perp.subView === 'trade';
    if (overviewPanel) overviewPanel.classList.toggle('hidden', isTradeView);
    if (tradePanel) tradePanel.classList.toggle('hidden', !isTradeView);

    const posWrap = $('perp-overview-positions-wrap');
    if (posWrap) {
      const positions = acct && Array.isArray(acct.positions) ? acct.positions : [];
      posWrap.classList.toggle('hidden', positions.length === 0);
      if (positions.length > 0) {
        posWrap.innerHTML = positions.map((p) => {
          const upnl = Number(p.unrealizedPnl || 0);
          const upnlCls = upnl >= 0 ? 'text-emerald' : 'text-rose';
          return `
            <button type="button" class="perp-overview-row" data-action="open-perp-trade" data-coin="${escapeHtml(p.coin)}">
              <div class="flex items-center gap-2">
                <strong>${escapeHtml(formatPerpDisplayPair(p.coin))}</strong>
                <span class="ca-badge">${escapeHtml(p.isLong ? t('多', 'Long') : t('空', 'Short'))} ${escapeHtml(String(p.leverageValue || '--'))}x</span>
              </div>
              <div class="flex items-center gap-2 mono" style="font-size: 12px;">
                <span class="${upnlCls}" style="font-weight: 700;">${upnl >= 0 ? '+' : ''}$${upnl.toFixed(2)}</span>
                <span style="color:var(--text-muted);">›</span>
              </div>
            </button>
          `;
        }).join('');
      } else {
        posWrap.innerHTML = '';
      }
    }

    const favCoins = getPerpFavoriteCoins();
    const favSet = new Set(favCoins);
    const activeCat = st.perp.overviewCategory || 'crypto';
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#perp-overview-cats [data-cat]').forEach((btn) => {
        const cat = btn.getAttribute('data-cat');
        btn.classList.toggle('active', cat === activeCat);
        if (cat === 'favorites') {
          btn.textContent = `${t('⭐ 自选', '⭐ Watchlist')} (${favSet.size})`;
        }
      });
    }

    const sortKey = st.perp.overviewSortKey || 'vol';
    const sortDir = st.perp.overviewSortDir || 'desc';
    const indFor = (k) => (sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : '⇅');
    if ($('perp-sort-ind-vol')) $('perp-sort-ind-vol').textContent = indFor('vol');
    if ($('perp-sort-ind-px')) $('perp-sort-ind-px').textContent = indFor('px');
    if ($('perp-sort-ind-chg')) $('perp-sort-ind-chg').textContent = indFor('chg');

    const listEl = $('perp-overview-list');
    if (!listEl) return;

    const mkts = Array.isArray(st.perp.markets) ? [...st.perp.markets] : [];
    if (mkts.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:20px 0;">${escapeHtml(t('正在加载 Hyperliquid 实时合约...', 'Loading Hyperliquid markets...'))}</div>`;
      return;
    }

    const q = String($('perp-overview-search')?.value || st.perp.overviewSearch || '').trim().toUpperCase();
    st.perp.overviewSearch = q;

    let filtered = mkts.filter((m) => {
      if (q) {
        const hay = `${m.name} ${m.baseSymbol || ''} ${m.pairLabel || ''}`.toUpperCase();
        if (!hay.includes(q)) return false;
      }
      if (activeCat === 'favorites') return favSet.has(m.name);
      if (activeCat === 'stocks') return m.category === 'stocks' || Boolean(m.dex);
      if (activeCat === 'crypto' && !q) return m.category !== 'stocks' && !m.dex;
      return true;
    });

    const dirMul = sortDir === 'asc' ? -1 : 1;
    filtered.sort((a, b) => {
      if (sortKey === 'chg') {
        const ac = Number.isFinite(Number(a.change24hPct)) ? Number(a.change24hPct) : -999999;
        const bc = Number.isFinite(Number(b.change24hPct)) ? Number(b.change24hPct) : -999999;
        return (bc - ac) * dirMul;
      }
      if (sortKey === 'px') {
        return ((Number(b.markPx) || 0) - (Number(a.markPx) || 0)) * dirMul;
      }
      return ((Number(b.dayNtlVlm) || 0) - (Number(a.dayNtlVlm) || 0)) * dirMul;
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:20px 0;">${escapeHtml(t('暂无匹配合约', 'No matching contracts'))}</div>`;
      return;
    }

    listEl.innerHTML = filtered.slice(0, 120).map((m) => {
      const pair = m.pairLabel || formatPerpDisplayPair(m.name);
      const dexTag = m.dex || extractPerpDexBadge(m.name);
      const chg = typeof m.change24hPct === 'number' ? m.change24hPct : null;
      const chgStr = chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '--';
      const deltaNum = typeof m.priceChange24h === 'number' ? m.priceChange24h : null;
      const deltaStr = deltaNum !== null ? `${deltaNum >= 0 ? '+$' : '-$'}${formatPerpPx(Math.abs(deltaNum))}` : '--';
      const chgPillCls = chg !== null && chg < 0 ? 'down' : 'up';
      const volText = typeof m.dayNtlVlm === 'number' && m.dayNtlVlm > 0 ? `${t('量', 'Vol')} ${formatCompactUsd(m.dayNtlVlm)}` : '--';
      const isFav = favSet.has(m.name);
      const iconHtml = tokens && typeof tokens.renderTokenIconWithBadge === 'function'
        ? tokens.renderTokenIconWithBadge({ symbol: m.baseSymbol || m.name, blockchain: dexTag ? 'eth' : 'hype' }, 30, false)
        : '';

      return `
        <div class="perp-overview-row" role="button" tabindex="0" data-action="open-perp-trade" data-coin="${escapeHtml(m.name)}">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <button type="button" class="btn-ghost-sm" data-action="toggle-perp-fav" data-stop="1" data-coin="${escapeHtml(m.name)}" style="padding: 2px 4px; font-size: 13px; color: ${isFav ? '#fbbf24' : 'var(--text-muted)'};">${isFav ? '★' : '☆'}</button>
            ${iconHtml}
            <div class="flex flex-col min-w-0" style="gap: 1px;">
              <div class="flex items-center gap-1" style="flex-wrap: wrap;">
                <strong style="font-size: 13px;">${escapeHtml(pair)}</strong>
                <span class="ca-badge">${escapeHtml(String(m.maxLeverage || 20))}x</span>
                ${dexTag ? `<span class="perp-dex-pill">${escapeHtml(dexTag)}</span>` : ''}
              </div>
              <span style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(volText)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2" style="flex-shrink: 0;">
            <div class="flex flex-col mono" style="text-align: right; gap: 1px;">
              <strong style="font-size: 12.5px; color: #fff;">${m.markPx ? `$${escapeHtml(formatPerpPx(m.markPx))}` : '--'}</strong>
              <span style="font-size: 10px; color: var(--text-muted);">${escapeHtml(deltaStr)}</span>
            </div>
            <span class="perp-chg-pill ${chgPillCls} mono">${escapeHtml(chgStr)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderPerpView() {
    const st = getState();
    const tokens = getTokens();
    const acct = st.perp.account;
    const market = getSelectedPerpMarket();
    const { maxLev, onlyIso } = resolvePerpMarginBounds(market);

    const equityEl = $('perp-equity-val');
    const availEl = $('perp-avail-val');
    const tktAvailEl = $('perp-ticket-avail');
    const upnlEl = $('perp-upnl-val');
    const spotBanner = $('perp-spot-banner');
    const spotAmtEl = $('perp-spot-pending-amt');

    if (acct) {
      if (equityEl) equityEl.textContent = `$${Number(acct.accountValue || 0).toFixed(2)}`;
      if (availEl) availEl.textContent = `$${Number(acct.availableMargin || 0).toFixed(2)}`;
      if (tktAvailEl) tktAvailEl.textContent = `$${Number(acct.availableMargin || 0).toFixed(2)}`;
      const totalUpnl = (acct.positions || []).reduce((acc, p) => acc + (Number(p.unrealizedPnl) || 0), 0);
      if (upnlEl) {
        upnlEl.textContent = `${totalUpnl >= 0 ? '+' : ''}$${totalUpnl.toFixed(2)}`;
        upnlEl.classList.toggle('text-emerald', totalUpnl >= 0);
        upnlEl.classList.toggle('text-rose', totalUpnl < 0);
      }
      const spotUsd = Number(acct.spotUsdc || 0);
      if (spotBanner) spotBanner.classList.toggle('hidden', spotUsd < 0.01);
      if (spotAmtEl) spotAmtEl.textContent = `${spotUsd.toFixed(2)} USDC`;
    } else {
      if (equityEl) equityEl.textContent = '--';
      if (availEl) availEl.textContent = '--';
      if (tktAvailEl) tktAvailEl.textContent = '--';
      if (upnlEl) upnlEl.textContent = '--';
      if (spotBanner) spotBanner.classList.add('hidden');
    }

    renderPerpOverviewPanel();

    const coinRaw = market ? market.name : (st.perp.selectedCoin || 'BTC');
    const pairLabel = market && market.pairLabel ? market.pairLabel : formatPerpDisplayPair(coinRaw);
    const dexTag = (market && market.dex) || extractPerpDexBadge(coinRaw);
    const coinIconEl = $('perp-coin-icon');
    if (coinIconEl && tokens && typeof tokens.renderTokenIconWithBadge === 'function') {
      coinIconEl.innerHTML = tokens.renderTokenIconWithBadge({ symbol: (market && market.baseSymbol) || coinRaw, blockchain: dexTag ? 'eth' : 'hype' }, 20, false);
    }
    const coinNameEl = $('perp-coin-name');
    const favCurrentBtn = $('btn-perp-fav-current');
    if (favCurrentBtn) {
      const isFav = getPerpFavoriteCoins().includes(coinRaw);
      favCurrentBtn.textContent = isFav ? '★' : '☆';
      favCurrentBtn.style.color = isFav ? '#fbbf24' : 'var(--text-secondary)';
    }
    const markPxEl = $('perp-mark-px');
    const chgEl = $('perp-change-24h');
    const frEl = $('perp-funding-rate');
    const volEl = $('perp-vol-24h');
    const oiEl = $('perp-oi-val');
    if (coinNameEl) coinNameEl.textContent = dexTag ? `${pairLabel} (${dexTag})` : pairLabel;
    if (markPxEl) markPxEl.textContent = market && market.markPx ? `$${formatPerpPx(market.markPx)}` : '--';
    if (chgEl) {
      if (market && typeof market.change24hPct === 'number') {
        const pos = market.change24hPct >= 0;
        chgEl.textContent = `${pos ? '+' : ''}${market.change24hPct.toFixed(2)}%`;
        chgEl.style.color = pos ? '#34d399' : '#fb7185';
      } else {
        chgEl.textContent = '--';
      }
    }
    if (volEl) {
      volEl.textContent = market && typeof market.dayNtlVlm === 'number' && market.dayNtlVlm > 0
        ? formatCompactUsd(market.dayNtlVlm)
        : '--';
    }
    if (oiEl) {
      const oiUsd = (market && market.openInterest && market.markPx) ? market.openInterest * market.markPx : null;
      oiEl.textContent = oiUsd ? formatCompactUsd(oiUsd) : '--';
    }
    if (frEl) {
      frEl.textContent = market && typeof market.fundingRate === 'number'
        ? `${(market.fundingRate * 100).toFixed(4)}%`
        : '--';
    }

    const curIv = st.perp.chartInterval || '15m';
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#perp-interval-pills [data-iv]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-iv') === curIv);
      });
    }
    const chartWrap = $('perp-chart-wrap');
    const chartSvgEl = $('perp-chart-svg');
    const chartHlEl = $('perp-chart-hl');
    if (chartWrap) chartWrap.classList.toggle('hidden', !st.perp.showChart);
    if (chartSvgEl && st.perp.showChart) {
      chartSvgEl.innerHTML = renderPerpCandleSvg(st.perp.candles, market);
      if (chartHlEl) {
        if (Array.isArray(st.perp.candles) && st.perp.candles.length >= 2) {
          let lo = Infinity;
          let hi = -Infinity;
          for (const c of st.perp.candles) {
            if (c.l < lo) lo = c.l;
            if (c.h > hi) hi = c.h;
          }
          chartHlEl.textContent = `H $${formatPerpPx(hi)} / L $${formatPerpPx(lo)}`;
        } else {
          chartHlEl.textContent = '--';
        }
      }
    }

    renderPerpOrderbook();
    renderPerpLongShortBar();

    $('perp-side-long')?.classList.toggle('active', st.perp.side === 'long');
    $('perp-side-short')?.classList.toggle('active', st.perp.side === 'short');
    $('perp-mode-isolated')?.classList.toggle('active', st.perp.marginMode !== 'cross');
    const crossBtn = $('perp-mode-cross');
    if (crossBtn) {
      crossBtn.classList.toggle('active', st.perp.marginMode === 'cross');
      crossBtn.disabled = onlyIso;
    }
    const oType = st.perp.orderType || 'market';
    $('perp-type-market')?.classList.toggle('active', oType === 'market');
    $('perp-type-limit')?.classList.toggle('active', oType === 'limit');
    $('perp-type-post-only')?.classList.toggle('active', oType === 'post_only');
    $('perp-limit-price-row')?.classList.toggle('hidden', oType !== 'limit' && oType !== 'post_only');
    if ($('perp-reduce-only-chk')) $('perp-reduce-only-chk').checked = Boolean(st.perp.reduceOnly);

    const slider = $('perp-leverage-slider');
    if (slider) {
      slider.max = String(maxLev);
      slider.value = String(st.perp.leverage);
    }
    const levValEl = $('perp-lev-val');
    if (levValEl) levValEl.textContent = `${st.perp.leverage}x`;

    evaluatePerpOrderUI();
    renderPerpBottomList();
  }

  function togglePerpTpSl() {
    const drawer = $('perp-tpsl-drawer');
    const btn = $('btn-perp-tpsl-toggle');
    if (!drawer) return;
    const willOpen = drawer.classList.contains('hidden');
    drawer.classList.toggle('hidden', !willOpen);
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  }

  function renderPerpLongShortBar() {
    const st = getState();
    const wrap = $('perp-ls-ratio-wrap');
    if (!wrap) return;
    const coin = (st.perp && st.perp.selectedCoin) || 'BTC';
    const ls = st.perp && st.perp.lsRatio && st.perp.lsRatio.coin === coin ? st.perp.lsRatio : null;
    if (!ls || !Number.isFinite(ls.longPct) || !Number.isFinite(ls.shortPct)) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    const longPct = Math.max(1, Math.min(99, ls.longPct));
    const shortPct = Math.max(1, Math.min(99, 100 - longPct));
    if ($('perp-ls-long-label')) $('perp-ls-long-label').textContent = `${t('做多', 'Long')} ${ls.longPct.toFixed(1)}%`;
    if ($('perp-ls-short-label')) $('perp-ls-short-label').textContent = `${ls.shortPct.toFixed(1)}% ${t('做空', 'Short')}`;
    if ($('perp-ls-long-bar')) $('perp-ls-long-bar').style.width = `${longPct.toFixed(1)}%`;
    if ($('perp-ls-short-bar')) $('perp-ls-short-bar').style.width = `${shortPct.toFixed(1)}%`;
  }

  async function refreshPerpLongShortAsync(coin, force = false) {
    const st = getState();
    const hl = getHyperliquid();
    if (!hl || typeof hl.fetchGlobalLongShortAccountRatio !== 'function') return null;
    const targetCoin = String(coin || (st.perp && st.perp.selectedCoin) || 'BTC');
    const res = await hl.fetchGlobalLongShortAccountRatio(targetCoin, { timeoutMs: 2500, force }).catch(() => null);
    if (st.perp.selectedCoin !== targetCoin) return null;
    st.perp.lsRatio = res || null;
    renderPerpLongShortBar();
    return res || null;
  }

  async function refreshPerpOrderbookAndCandlesAsync() {
    const st = getState();
    const hl = getHyperliquid();
    if (!hl) return;
    const coin = st.perp.selectedCoin || 'BTC';
    const iv = st.perp.chartInterval || '15m';
    const tasks = [hl.fetchHlOrderbook(coin).catch(() => null)];
    if (st.perp.showChart) tasks.push(hl.fetchHlCandles(coin, iv, 48).catch(() => []));
    const [ob, candles] = await Promise.all(tasks);
    if (st.perp.selectedCoin !== coin) return;
    if (ob) st.perp.orderbook = ob;
    if (Array.isArray(candles)) st.perp.candles = candles;
    renderPerpView();
  }

  function setPerpChartInterval(interval) {
    const st = getState();
    st.perp.chartInterval = ['5m', '15m', '1h', '4h'].includes(String(interval)) ? String(interval) : '15m';
    st.perp.showChart = true;
    renderPerpView();
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
  }

  async function refreshPerpDataAsync(force = false) {
    const st = getState();
    const hl = getHyperliquid();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!hl || !contracts || !wallet) return;
    await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    const hlAddr = contracts.resolveWalletEvmSender(wallet);
    const now = Date.now();
    const needMarkets = force || !st.perp.markets.length || (now - st.perp.lastMarketSyncTs > 30_000);
    const [mkts, acct] = await Promise.all([
      needMarkets ? hl.fetchHlMarkets().catch(() => null) : Promise.resolve(null),
      hlAddr ? hl.fetchHlAccountState(hlAddr).catch(() => null) : Promise.resolve(null)
    ]);
    if (Array.isArray(mkts) && mkts.length > 0) {
      st.perp.markets = mkts;
      st.perp.lastMarketSyncTs = Date.now();
    }
    if (acct) {
      st.perp.account = acct;
      st.perp.lastAccountSyncTs = Date.now();
    }
    await refreshPerpOrderbookAndCandlesAsync();
    if (force) {
      refreshPerpLongShortAsync(st.perp.selectedCoin || 'BTC', true).catch(() => {});
      showToast(t('合约数据已刷新', 'Perps synced'));
    }
  }

  function setPerpSide(side) {
    getState().perp.side = side === 'short' ? 'short' : 'long';
    getState().perp.errorMsg = '';
    renderPerpView();
  }

  function setPerpMarginMode(mode) {
    const st = getState();
    const market = getSelectedPerpMarket();
    if (mode === 'cross' && market && market.onlyIsolated) {
      showToast(t('该市场仅支持逐仓模式', 'This market supports Isolated margin only'));
      return;
    }
    st.perp.marginMode = mode === 'cross' ? 'cross' : 'isolated';
    renderPerpView();
  }

  function setPerpOrderType(orderType) {
    const st = getState();
    const oType = orderType === 'limit' ? 'limit' : (orderType === 'post_only' ? 'post_only' : 'market');
    st.perp.orderType = oType;
    st.perp.tif = oType === 'post_only' ? 'Alo' : (oType === 'limit' ? 'Gtc' : 'Ioc');
    const market = getSelectedPerpMarket();
    if ((oType === 'limit' || oType === 'post_only') && !st.perp.limitPriceInput && market && market.markPx) {
      st.perp.limitPriceInput = String(market.markPx);
      const inp = $('perp-limit-price-input');
      if (inp) inp.value = st.perp.limitPriceInput;
    }
    renderPerpView();
  }

  function backToPerpOverview() {
    const st = getState();
    st.perp.subView = 'overview';
    renderPerpView();
  }

  function openPerpTradeScreen(coin) {
    const st = getState();
    if (coin) st.perp.selectedCoin = String(coin);
    st.perp.subView = 'trade';
    st.perp.limitPriceInput = '';
    st.perp.errorMsg = '';
    st.perp.lsRatio = null;
    renderPerpView();
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
    refreshPerpLongShortAsync(st.perp.selectedCoin, false).catch(() => {});
  }

  function handlePerpOverviewSearch(val) {
    const st = getState();
    st.perp.overviewSearch = String(val || '');
    renderPerpOverviewPanel();
  }

  function setPerpOverviewCategory(cat) {
    const st = getState();
    st.perp.overviewCategory = ['favorites', 'crypto', 'stocks', 'all'].includes(cat) ? cat : 'crypto';
    renderPerpOverviewPanel();
  }

  function togglePerpOverviewSort(key) {
    const st = getState();
    const k = ['vol', 'px', 'chg'].includes(key) ? key : 'vol';
    if (st.perp.overviewSortKey === k) {
      st.perp.overviewSortDir = st.perp.overviewSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      st.perp.overviewSortKey = k;
      st.perp.overviewSortDir = 'desc';
    }
    renderPerpOverviewPanel();
  }

  function fillPerpBboPrice() {
    const st = getState();
    const ob = st.perp && st.perp.orderbook;
    const market = getSelectedPerpMarket();
    const isLong = st.perp.side !== 'short';
    let bboPx = null;
    if (ob && isLong && Array.isArray(ob.bids) && ob.bids.length > 0) {
      bboPx = ob.bids[0].px;
    } else if (ob && !isLong && Array.isArray(ob.asks) && ob.asks.length > 0) {
      bboPx = ob.asks[0].px;
    } else if (market && market.markPx) {
      bboPx = market.markPx;
    }
    if (!bboPx) return;
    if (st.perp.orderType !== 'limit' && st.perp.orderType !== 'post_only') {
      st.perp.orderType = 'limit';
      st.perp.tif = 'Gtc';
    }
    st.perp.limitPriceInput = String(bboPx);
    const inp = $('perp-limit-price-input');
    if (inp) inp.value = st.perp.limitPriceInput;
    renderPerpView();
  }

  function togglePerpReduceOnly(checked) {
    getState().perp.reduceOnly = Boolean(checked);
    evaluatePerpOrderUI();
  }

  function setPerpLeverage(val) {
    const st = getState();
    const market = getSelectedPerpMarket();
    const maxLev = market ? (Number(market.maxLeverage) || 20) : 50;
    const n = Math.max(1, Math.min(maxLev, Math.round(Number(val) || 1)));
    st.perp.leverage = n;
    const levEl = $('perp-lev-val');
    if (levEl) levEl.textContent = `${n}x`;
    evaluatePerpOrderUI();
  }

  function handlePerpMarginInput() {
    getState().perp.errorMsg = '';
    evaluatePerpOrderUI();
  }

  function handlePerpLimitPriceInput() {
    getState().perp.errorMsg = '';
    evaluatePerpOrderUI();
  }

  function setPerpMarginPercent(pct) {
    const st = getState();
    const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : 0;
    if (avail <= 0) {
      showToast(t('可用保证金为 0，请先充值或从 Spot 划转', 'Available margin is 0; deposit or transfer first'));
      return;
    }
    const amt = (avail * Number(pct)).toFixed(2);
    st.perp.marginInput = amt;
    const inp = $('perp-margin-input');
    if (inp) inp.value = amt;
    st.perp.errorMsg = '';
    evaluatePerpOrderUI();
  }

  function togglePerpChart() {
    const st = getState();
    st.perp.showChart = !st.perp.showChart;
    renderPerpView();
    if (st.perp.showChart) refreshPerpOrderbookAndCandlesAsync().catch(() => {});
  }

  function fillPerpLimitPrice(px) {
    const st = getState();
    if (st.perp.orderType !== 'post_only') {
      st.perp.orderType = 'limit';
      st.perp.tif = 'Gtc';
    }
    st.perp.limitPriceInput = String(px || '');
    const inp = $('perp-limit-price-input');
    if (inp) inp.value = st.perp.limitPriceInput;
    renderPerpView();
  }

  function setPerpBottomTab(tab) {
    getState().perp.bottomTab = ['positions', 'orders', 'fills'].includes(tab) ? tab : 'positions';
    renderPerpBottomList();
  }

  function setPerpMarketFilter(filter) {
    const st = getState();
    st.perp.marketFilter = ['hot', 'all', 'stocks', 'gainers', 'vol'].includes(filter) ? filter : 'hot';
    renderPerpMarketsSheet();
  }

  function renderPerpMarketsSheet() {
    const st = getState();
    const tokens = getTokens();
    const hl = getHyperliquid();
    const listEl = $('perp-market-list');
    if (!listEl) return;
    const q = String($('perp-market-search')?.value || st.perp.marketSearch || '').trim().toUpperCase();
    st.perp.marketSearch = q;
    const activeFilter = st.perp.marketFilter || 'hot';
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#perp-market-filters [data-mkt-filter]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-mkt-filter') === activeFilter);
      });
    }

    const mkts = Array.isArray(st.perp.markets) ? [...st.perp.markets] : [];
    let filtered = q
      ? mkts.filter((m) => `${m.name} ${m.baseSymbol || ''} ${m.pairLabel || ''}`.toUpperCase().includes(q))
      : mkts;
    if (activeFilter === 'stocks') {
      filtered = filtered.filter((m) => m.category === 'stocks' || Boolean(m.dex));
      filtered.sort((a, b) => (Number(b.dayNtlVlm) || 0) - (Number(a.dayNtlVlm) || 0));
    } else if (activeFilter === 'gainers') {
      filtered.sort((a, b) => (Number.isFinite(Number(b.change24hPct)) ? Number(b.change24hPct) : -999999) - (Number.isFinite(Number(a.change24hPct)) ? Number(a.change24hPct) : -999999));
    } else if (activeFilter === 'vol') {
      filtered.sort((a, b) => (Number(b.dayNtlVlm) || 0) - (Number(a.dayNtlVlm) || 0));
    } else if (activeFilter === 'hot') {
      const pinned = new Set((hl && hl.PINNED_COINS) || ['BTC', 'ETH', 'SOL', 'NEAR', 'HYPE']);
      const top = filtered.filter((m) => pinned.has(m.name));
      const rest = filtered.filter((m) => !pinned.has(m.name)).sort((a, b) => (Number(b.dayNtlVlm) || 0) - (Number(a.dayNtlVlm) || 0));
      filtered = q ? [...top, ...rest] : [...top, ...rest.slice(0, 45)];
    }

    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 18px 0;">${escapeHtml(t('未找到匹配市场', 'No matching market'))}</div>`;
      return;
    }
    const selCoin = st.perp.selectedCoin || 'BTC';
    listEl.innerHTML = filtered.slice(0, 120).map((m) => {
      const chg = typeof m.change24hPct === 'number' ? m.change24hPct : null;
      const chgStr = chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '--';
      const chgCls = chg !== null ? (chg >= 0 ? 'text-emerald' : 'text-rose') : '';
      const pairLabel = m.pairLabel || formatPerpDisplayPair(m.name);
      const dexTag = m.dex || extractPerpDexBadge(m.name);
      const iconHtml = tokens && typeof tokens.renderTokenIconWithBadge === 'function'
        ? tokens.renderTokenIconWithBadge({ symbol: m.baseSymbol || m.name, blockchain: dexTag ? 'eth' : 'hype' }, 28, false)
        : '';
      const volText = typeof m.dayNtlVlm === 'number' && m.dayNtlVlm > 0 ? `${t('量', 'Vol')} ${formatCompactUsd(m.dayNtlVlm)}` : '';
      return `
        <button type="button" class="perp-market-item ${m.name === selCoin ? 'active' : ''}" data-action="select-perp-market" data-coin="${escapeHtml(m.name)}">
          <div class="flex items-center gap-2">
            ${iconHtml}
            <div class="flex flex-col" style="gap:1px;">
              <div class="flex items-center gap-1">
                <strong>${escapeHtml(pairLabel)}</strong>
                ${dexTag ? `<span class="perp-dex-pill">${escapeHtml(dexTag)}</span>` : ''}
                <span class="ca-badge">${escapeHtml(String(m.maxLeverage || 20))}x</span>
              </div>
              <span style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(volText)}</span>
            </div>
          </div>
          <div class="flex flex-col mono" style="font-size: 12.5px; text-align: right; gap: 2px;">
            <strong style="color: #fff;">${m.markPx ? `$${escapeHtml(formatPerpPx(m.markPx))}` : '--'}</strong>
            <span class="${chgCls}" style="font-size: 11px;">${escapeHtml(chgStr)}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  function openPerpMarketsSheet() {
    renderPerpMarketsSheet();
    openSheet('sheet-perp-markets');
    if (!getState().perp.markets.length) refreshPerpDataAsync(false).then(() => renderPerpMarketsSheet()).catch(() => {});
  }

  function selectPerpMarket(coin) {
    const st = getState();
    st.perp.selectedCoin = String(coin || 'BTC');
    st.perp.subView = 'trade';
    st.perp.limitPriceInput = '';
    st.perp.errorMsg = '';
    st.perp.lsRatio = null;
    closeAllSheets();
    renderPerpView();
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
    refreshPerpLongShortAsync(st.perp.selectedCoin, false).catch(() => {});
  }

  async function executePerpOrderUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const evalRes = evaluatePerpOrderUI();
    if (evalRes.disabled || !evalRes.sizeNum) {
      if (evalRes.error) showToast(evalRes.error);
      return;
    }
    const market = getSelectedPerpMarket();
    if (!market) return;
    st.perp.submitting = true;
    st.perp.errorMsg = '';
    renderPerpView();
    try {
      await ensureEthersLoaded();
      const isBuy = st.perp.side === 'long';
      const oType = st.perp.orderType || 'market';
      const tif = st.perp.tif || (oType === 'post_only' ? 'Alo' : (oType === 'limit' ? 'Gtc' : 'Ioc'));
      const isLimitLike = oType === 'limit' || oType === 'post_only';
      const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : null;
      await hl.placeHlPerpOrder({
        wallet,
        market,
        isBuy,
        size: evalRes.sizeNum,
        orderType: oType,
        tif,
        limitPrice: isLimitLike ? Number(st.perp.limitPriceInput) : null,
        reduceOnly: Boolean(st.perp.reduceOnly),
        leverage: st.perp.leverage,
        isCross: st.perp.marginMode === 'cross',
        tpPrice: st.perp.tpInput ? Number(st.perp.tpInput) : null,
        slPrice: st.perp.slInput ? Number(st.perp.slInput) : null,
        availableMargin: avail
      });
      st.perp.marginInput = '';
      if ($('perp-margin-input')) $('perp-margin-input').value = '';
      showToast(`✅ ${t('合约委托已提交', 'Perp order submitted')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      st.perp.errorMsg = (err && err.message) || t('下单失败', 'Order failed');
      showToast(st.perp.errorMsg);
    } finally {
      st.perp.submitting = false;
      renderPerpView();
    }
  }

  async function closePerpPositionUI(coin) {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin) return;
    const pos = st.perp.account && (st.perp.account.positions || []).find((p) => p.coin === coin);
    let market = (st.perp.markets || []).find((m) => m.name === coin);
    if (!pos) return;
    try {
      await ensureEthersLoaded();
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      await hl.closeHlPositionMarket({ wallet, market, position: pos });
      showToast(`✅ ${formatPerpDisplayPair(coin)} ${t('已市价平仓', 'position closed')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('平仓失败', 'Close failed'));
    }
  }

  function openPerpPositionTpSlSheet(coin) {
    const st = getState();
    const acct = st.perp && st.perp.account;
    const pos = acct && (acct.positions || []).find((p) => p.coin === coin);
    if (!pos) return;
    st.perp.editingTpslCoin = pos.coin;
    if ($('perp-tpsl-sheet-pair')) {
      $('perp-tpsl-sheet-pair').textContent = `${formatPerpDisplayPair(pos.coin)} · ${pos.isLong ? t('多', 'Long') : t('空', 'Short')} ${pos.leverageValue || '--'}x`;
    }
    if ($('perp-tpsl-sheet-liq')) {
      $('perp-tpsl-sheet-liq').textContent = pos.liquidationPx ? `$${formatPerpPx(pos.liquidationPx)}` : '--';
    }
    if ($('perp-pos-tp-input')) $('perp-pos-tp-input').value = pos.tpTriggerPx ? String(pos.tpTriggerPx) : '';
    if ($('perp-pos-sl-input')) $('perp-pos-sl-input').value = pos.slTriggerPx ? String(pos.slTriggerPx) : '';
    openSheet('sheet-perp-tpsl');
  }

  async function submitPerpPositionTpSlUI(clearOnly = false) {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    const coin = st.perp && st.perp.editingTpslCoin;
    if (!hl || !wallet || !coin) return;
    const acct = st.perp.account;
    const pos = acct && (acct.positions || []).find((p) => p.coin === coin);
    if (!pos) return;
    const tpRaw = clearOnly ? NaN : Number($('perp-pos-tp-input')?.value);
    const slRaw = clearOnly ? NaN : Number($('perp-pos-sl-input')?.value);
    const tpPrice = Number.isFinite(tpRaw) && tpRaw > 0 ? tpRaw : null;
    const slPrice = Number.isFinite(slRaw) && slRaw > 0 ? slRaw : null;
    const btn = $('btn-perp-tpsl-save');
    if (btn) btn.disabled = true;
    try {
      await ensureEthersLoaded();
      let market = (st.perp.markets || []).find((m) => m.name === coin);
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      await hl.updateHlPositionTpSl({
        wallet,
        market,
        position: pos,
        tpPrice,
        slPrice,
        openOrders: (acct && acct.openOrders) || []
      });
      closeAllSheets();
      showToast(`✅ ${clearOnly ? t('已清除止盈止损', 'TP/SL cleared') : t('止盈止损已更新', 'TP/SL updated')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('更新止盈止损失败', 'TP/SL update failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function reversePerpPositionUI(coin) {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin) return;
    const pos = st.perp.account && (st.perp.account.positions || []).find((p) => p.coin === coin);
    if (!pos) return;
    try {
      await ensureEthersLoaded();
      let market = (st.perp.markets || []).find((m) => m.name === coin);
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : null;
      await hl.reverseHlPositionMarket({ wallet, market, position: pos, availableMargin: avail });
      showToast(`✅ ${formatPerpDisplayPair(coin)} ${t('已反手开仓', 'position reversed')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('反手开仓失败', 'Reverse failed'));
    }
  }

  async function executePerpBatchAction() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    const acct = st.perp && st.perp.account;
    if (!hl || !wallet || !acct) return;
    const tab = st.perp.bottomTab || 'positions';
    try {
      await ensureEthersLoaded();
      if ((!st.perp.markets || st.perp.markets.length === 0) && typeof hl.fetchHlMarkets === 'function') {
        st.perp.markets = await hl.fetchHlMarkets();
      }
      if (tab === 'orders') {
        if (!acct.openOrders || acct.openOrders.length === 0) return;
        await hl.cancelAllHlOrders({ wallet, openOrders: acct.openOrders, markets: st.perp.markets || [] });
        showToast(`✅ ${t('已撤销全部委托', 'All orders cancelled')}`);
      } else {
        const positions = acct.positions || [];
        if (positions.length === 0) return;
        for (const pos of positions) {
          const market = (st.perp.markets || []).find((m) => m.name === pos.coin);
          if (market) {
            await hl.closeHlPositionMarket({ wallet, market, position: pos });
          }
        }
        showToast(`✅ ${t('已全部市价平仓', 'All positions closed')}`);
      }
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('批量操作失败', 'Batch action failed'));
    }
  }

  async function cancelPerpOrderUI(coin, oid) {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin || !oid) return;
    let market = (st.perp.markets || []).find((m) => m.name === coin);
    try {
      await ensureEthersLoaded();
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      await hl.cancelHlOrder({ wallet, assetIndex: market.index, oid: Number(oid) });
      showToast(t('已撤单', 'Order cancelled'));
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('撤单失败', 'Cancel failed'));
    }
  }

  async function quickTransferSpotToPerpUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !st.perp.account) return;
    const amt = Number(st.perp.account.spotUsdc || 0);
    if (amt <= 0) return;
    try {
      await ensureEthersLoaded();
      await hl.transferHlUsdClass({ wallet, amount: amt, toPerp: true });
      showToast(`✅ ${t('已划转至合约账户', 'Moved to Perp account')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('划转失败', 'Transfer failed'));
    }
  }

  function getEligiblePerpOneClickEntries(wallet) {
    const hl = getHyperliquid();
    if (!wallet || !hl) return [];
    return getSendSourceEntriesForWallet(wallet).filter(
      (e) => Number(e.balance || 0) > 0 && hl.isDirectOneClickOriginForHl(e)
    );
  }

  function evaluatePerpOneClickState({ entry = null, amount = 0, quote = null, quoteError = '', quoting = false } = {}) {
    if (!entry) {
      return { disabled: true, error: '', text: t('暂无可用跨链资产', 'No eligible asset') };
    }
    const amt = Number(amount);
    const avail = Number(entry.balance || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', text: t('请输入充值数量', 'Enter amount') };
    }
    if (amt > avail + 1e-12) {
      const msg = t(`${entry.symbol} 余额不足 (可用: ${formatBal(avail, 4)})`, `Insufficient ${entry.symbol} (avail: ${formatBal(avail, 4)})`);
      return { disabled: true, error: msg, text: t(`${entry.symbol} 余额不足`, `Insufficient ${entry.symbol}`) };
    }
    if (quoting) {
      return { disabled: true, error: '', text: t('正在获取跨链报价...', 'Fetching route...') };
    }
    if (quoteError) {
      return { disabled: true, error: quoteError, text: t('当前路由暂不可用', 'Route unavailable') };
    }
    if (!quote || !quote.ok || !quote.amountOutFormatted) {
      return { disabled: true, error: '', text: t('等待跨链报价', 'Waiting for quote') };
    }
    return { disabled: false, error: '', text: t('确认跨链充值', 'Confirm Cross-Chain Deposit') };
  }

  function evaluatePerpArbDepositState({ amount = 0, arbUsdc = 0, arbEth = 0 } = {}) {
    const hl = getHyperliquid();
    const minUsdc = hl ? hl.HL_ARB_BRIDGE_MIN_USDC : 5;
    const minEth = hl ? hl.HL_ARB_MIN_ETH_GAS : 0.0002;
    const amt = Number(amount);
    const usdc = Number(arbUsdc || 0);
    const eth = Number(arbEth || 0);

    if (usdc < minUsdc) {
      const msg = t(`Arbitrum USDC 余额不足 (可用 ${usdc.toFixed(2)}，最低需 ${minUsdc} USDC)`, `Insufficient Arbitrum USDC (${usdc.toFixed(2)} avail, need >= ${minUsdc})`);
      return { disabled: true, error: msg, text: t('Arbitrum USDC 不足', 'Insufficient Arbitrum USDC') };
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', text: t('请输入充值数量 (>= 5 USDC)', 'Enter amount (>= 5 USDC)') };
    }
    if (amt < minUsdc) {
      const msg = t(`最低充值 ${minUsdc} USDC（低于 ${minUsdc} 将无法上账）`, `Minimum deposit is ${minUsdc} USDC`);
      return { disabled: true, error: msg, text: t(`最低充值 ${minUsdc} USDC`, `Min ${minUsdc} USDC`) };
    }
    if (amt > usdc + 1e-9) {
      const msg = t(`Arbitrum USDC 余额不足 (当前可用: ${usdc.toFixed(2)} USDC)`, `Insufficient Arbitrum USDC (avail: ${usdc.toFixed(2)})`);
      return { disabled: true, error: msg, text: t('Arbitrum USDC 不足', 'Insufficient Arbitrum USDC') };
    }
    if (eth < minEth) {
      const msg = t(`Arbitrum ETH Gas 不足 (需 >= ${minEth} ETH，当前 ${eth.toFixed(5)} ETH)`, `Need >= ${minEth} Arbitrum ETH for gas (${eth.toFixed(5)} avail)`);
      return { disabled: true, error: msg, text: t('Arbitrum ETH Gas 不足', 'Insufficient ETH Gas') };
    }
    return { disabled: false, error: '', text: t('确认 Arbitrum 充值', 'Confirm Arbitrum Deposit') };
  }

  function evaluatePerpWithdrawState({ amount = 0, withdrawable = null } = {}) {
    const hl = getHyperliquid();
    const minW = hl ? hl.HL_WITHDRAW_MIN_USDC : 2;
    const fee = hl ? hl.HL_WITHDRAW_FEE_USDC : 1;
    const amt = Number(amount);
    const avail = withdrawable === null || withdrawable === undefined ? 0 : Number(withdrawable);
    const netReceive = Number.isFinite(amt) && amt >= minW ? Math.max(0, amt - fee) : null;

    if (avail < minW) {
      const msg = t(`可提现余额不足 (当前 $${avail.toFixed(2)}，最低提现 ${minW} USDC)`, `Insufficient withdrawable ($${avail.toFixed(2)} avail, min ${minW} USDC)`);
      return { disabled: true, error: msg, netReceive: null, text: t('可提现余额不足', 'Insufficient Balance') };
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', netReceive: null, text: t('请输入提现数量', 'Enter withdraw amount') };
    }
    if (amt < minW) {
      const msg = t(`最低提现 ${minW} USDC（含 ${fee} USDC 协议手续费）`, `Minimum withdrawal is ${minW} USDC (incl. ${fee} USDC fee)`);
      return { disabled: true, error: msg, netReceive: null, text: t(`最低提现 ${minW} USDC`, `Min ${minW} USDC`) };
    }
    if (amt > avail + 1e-9) {
      const msg = t(`超出可提现余额 (可用: ${avail.toFixed(2)} USDC)`, `Exceeds withdrawable (${avail.toFixed(2)} USDC)`);
      return { disabled: true, error: msg, netReceive: null, text: t('超出可提现余额', 'Exceeds Withdrawable') };
    }
    return { disabled: false, error: '', netReceive, text: t('安全验证并提现', 'Verify & Withdraw') };
  }

  function evaluatePerpOneClickUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const entries = wallet ? getEligiblePerpOneClickEntries(wallet) : [];
    const selKey = $('perp-oc-origin-select')?.value || st.perp.fundingOriginAssetId || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0] || null;
    const amt = Number($('perp-oc-amount')?.value || 0);
    const res = evaluatePerpOneClickState({
      entry,
      amount: amt,
      quote: st.perp.fundingQuote,
      quoteError: st.perp.fundingQuoteError,
      quoting: st.perp.fundingQuoting
    });
    const outEl = $('perp-oc-quote-out');
    if (outEl) {
      if (st.perp.fundingQuoting) {
        outEl.className = 'meta-val';
        outEl.textContent = t('询价中...', 'Quoting...');
      } else if (st.perp.fundingQuote && st.perp.fundingQuote.ok && st.perp.fundingQuote.amountOutFormatted) {
        outEl.className = 'meta-val text-emerald';
        outEl.textContent = `${st.perp.fundingQuote.amountOutFormatted} USDC`;
      } else {
        outEl.className = 'meta-val';
        outEl.textContent = '--';
      }
    }
    const errEl = $('perp-oc-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const btn = $('btn-perp-oc-deposit');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  function evaluatePerpArbDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !contracts) return null;
    const arbUsdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    const arbEth = contracts.resolveWalletChainBalance(wallet, 'arb');
    const amt = Number($('perp-arb-amount')?.value || 0);
    const res = evaluatePerpArbDepositState({ amount: amt, arbUsdc, arbEth });
    const errEl = $('perp-arb-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const btn = $('btn-perp-arb-deposit');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  function evaluatePerpWithdrawUI() {
    const st = getState();
    const withdrawable = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    const amt = Number($('perp-withdraw-amount')?.value || 0);
    const res = evaluatePerpWithdrawState({ amount: amt, withdrawable });
    const netEl = $('perp-wd-net-val');
    if (netEl) netEl.textContent = res.netReceive !== null ? `${res.netReceive.toFixed(2)} USDC` : '--';
    const errEl = $('perp-wd-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const btn = $('btn-perp-withdraw');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  function setPerpOneClickMax() {
    const wallet = getState().getActiveWallet();
    const entries = wallet ? getEligiblePerpOneClickEntries(wallet) : [];
    const selKey = $('perp-oc-origin-select')?.value || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0];
    if (!entry || !$('perp-oc-amount')) return;
    $('perp-oc-amount').value = String(entry.balance || 0);
    schedulePerpOneClickQuote();
  }

  function setPerpArbMax() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !$('perp-arb-amount')) return;
    const usdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    $('perp-arb-amount').value = usdc > 0 ? usdc.toFixed(2) : '';
    evaluatePerpArbDepositUI();
  }

  function setPerpWithdrawMax() {
    const st = getState();
    const avail = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    if ($('perp-withdraw-amount')) $('perp-withdraw-amount').value = avail > 0 ? avail.toFixed(2) : '';
    evaluatePerpWithdrawUI();
  }

  function jumpFromPerpToSwap() {
    closeAllSheets();
    setSwapPanelMode('market');
    switchTab('swap');
  }

  function renderPerpFundingSheet() {
    const st = getState();
    const hl = getHyperliquid();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !contracts) return;

    const mode = st.perp.fundingMode === 'withdraw' ? 'withdraw' : 'deposit';
    const titleEl = $('perp-funding-sheet-title');
    if (titleEl) {
      titleEl.textContent = mode === 'withdraw' ? t('提现到钱包', 'Withdraw to Wallet') : t('合约充值', 'Deposit Funds');
    }
    $('perp-mode-deposit')?.classList.toggle('hidden', mode !== 'deposit');
    $('perp-mode-withdraw')?.classList.toggle('hidden', mode !== 'withdraw');

    const tab = st.perp.fundingTab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    $('perp-ftab-oneclick')?.classList.toggle('active', tab === 'oneclick');
    $('perp-ftab-arbitrum')?.classList.toggle('active', tab === 'arbitrum');
    $('perp-funding-panel-oneclick')?.classList.toggle('hidden', tab !== 'oneclick');
    $('perp-funding-panel-arbitrum')?.classList.toggle('hidden', tab !== 'arbitrum');

    const entries = getEligiblePerpOneClickEntries(wallet);
    $('perp-oc-empty-state')?.classList.toggle('hidden', entries.length > 0);
    $('perp-oc-form')?.classList.toggle('hidden', entries.length === 0);

    const sel = $('perp-oc-origin-select');
    if (sel && entries.length > 0) {
      const prevVal = st.perp.fundingOriginAssetId || sel.value;
      sel.innerHTML = entries.map((e) =>
        `<option value="${escapeHtml(e.key)}">${escapeHtml(`${e.symbol} · ${e.chainLabel} (${formatBal(e.balance, 4)})`)}</option>`
      ).join('');
      if (entries.some((e) => e.key === prevVal)) sel.value = prevVal;
      const chosen = entries.find((e) => e.key === sel.value) || entries[0] || null;
      st.perp.fundingOriginAssetId = chosen ? chosen.key : '';
      const availEl = $('perp-oc-origin-avail');
      if (availEl) availEl.textContent = chosen ? `${formatBal(chosen.balance, 4)} ${chosen.symbol}` : '--';
    } else if (sel) {
      sel.innerHTML = '';
    }

    const hlAddr = contracts.resolveWalletEvmSender(wallet);
    if ($('perp-oc-target-addr')) $('perp-oc-target-addr').textContent = hlAddr ? shortenAddr(hlAddr, 8, 6) : '--';
    if ($('perp-wd-dest-addr')) $('perp-wd-dest-addr').textContent = hlAddr ? shortenAddr(hlAddr, 8, 6) : '--';

    const arbUsdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    const arbEth = contracts.resolveWalletChainBalance(wallet, 'arb');
    if ($('perp-arb-usdc-avail')) $('perp-arb-usdc-avail').textContent = `${arbUsdc.toFixed(2)} USDC`;
    if ($('perp-arb-eth-avail')) $('perp-arb-eth-avail').textContent = `${arbEth.toFixed(5)} ETH`;

    const acct = st.perp.account;
    const spotUsd = acct ? Number(acct.spotUsdc || 0) : 0;
    const wdAvail = acct ? Number(acct.withdrawable || 0) : 0;
    if ($('perp-wd-avail')) $('perp-wd-avail').textContent = acct ? `${wdAvail.toFixed(2)} USDC` : '--';
    $('perp-wd-spot-banner')?.classList.toggle('hidden', spotUsd < 0.01);
    if ($('perp-wd-spot-amt')) $('perp-wd-spot-amt').textContent = `${spotUsd.toFixed(2)} USDC`;

    evaluatePerpOneClickUI();
    evaluatePerpArbDepositUI();
    evaluatePerpWithdrawUI();
  }

  function openPerpFundingSheet(modeOrTab = 'deposit') {
    const st = getState();
    if (modeOrTab === 'withdraw' || modeOrTab === 'transfer') {
      st.perp.fundingMode = 'withdraw';
    } else {
      st.perp.fundingMode = 'deposit';
      st.perp.fundingTab = modeOrTab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    }
    st.perp.fundingQuote = null;
    st.perp.fundingQuoteError = '';
    st.perp.fundingQuoting = false;
    renderPerpFundingSheet();
    openSheet('sheet-perp-funding');
  }

  function setPerpFundingTab(tab) {
    const st = getState();
    st.perp.fundingTab = tab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    renderPerpFundingSheet();
  }

  function schedulePerpOneClickQuote() {
    const st = getState();
    st.perp.fundingQuote = null;
    st.perp.fundingQuoteError = '';
    if (_perpQuoteTimer) clearTimeout(_perpQuoteTimer);
    const amt = Number($('perp-oc-amount')?.value || 0);
    const entries = getEligiblePerpOneClickEntries(st.getActiveWallet());
    const selKey = $('perp-oc-origin-select')?.value || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0] || null;
    if (!entry || !Number.isFinite(amt) || amt <= 0 || amt > Number(entry.balance || 0)) {
      st.perp.fundingQuoting = false;
      renderPerpFundingSheet();
      return;
    }
    st.perp.fundingQuoting = true;
    renderPerpFundingSheet();
    _perpQuoteTimer = setTimeout(async () => {
      try {
        const hl = getHyperliquid();
        const wallet = st.getActiveWallet();
        const curEntries = getEligiblePerpOneClickEntries(wallet);
        const curKey = $('perp-oc-origin-select')?.value || '';
        const curEntry = curEntries.find((e) => e.key === curKey) || curEntries[0];
        if (!hl || !wallet || !curEntry) return;
        const q = await hl.quoteOneClickDepositToHlSpot({ wallet, originToken: curEntry, amount: amt, dry: true });
        st.perp.fundingQuoting = false;
        if (q && q.ok) {
          st.perp.fundingQuote = q;
          st.perp.fundingQuoteError = '';
        } else {
          st.perp.fundingQuote = null;
          st.perp.fundingQuoteError = (q && q.error) || t('暂无跨链报价', 'Quote unavailable');
        }
      } catch (err) {
        st.perp.fundingQuoting = false;
        st.perp.fundingQuote = null;
        st.perp.fundingQuoteError = (err && err.message) || t('询价失败', 'Quote failed');
      } finally {
        evaluatePerpOneClickUI();
      }
    }, 360);
  }

  async function executePerpOneClickDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!hl || !intents || !contracts || !wallet) return;

    const amt = Number($('perp-oc-amount')?.value || 0);
    const key = $('perp-oc-origin-select')?.value || '';
    const entry = getEligiblePerpOneClickEntries(wallet).find((e) => e.key === key);
    const check = evaluatePerpOneClickState({
      entry,
      amount: amt,
      quote: st.perp.fundingQuote,
      quoteError: st.perp.fundingQuoteError,
      quoting: false
    });
    if (check.disabled) {
      if (check.error) showToast(check.error);
      evaluatePerpOneClickUI();
      return;
    }
    const avail = Number(entry.balance || 0);
    const btn = $('btn-perp-oc-deposit');
    if (btn) btn.disabled = true;
    try {
      await ensureEthersLoaded();
      const q = await hl.quoteOneClickDepositToHlSpot({ wallet, originToken: entry, amount: amt, dry: false });
      if (!q || !q.ok || !q.depositAddress) throw new Error((q && q.error) || t('获取跨链充值路由失败', 'Failed to get deposit route'));

      let txHash = '';
      if (entry.blockchain === 'near' && entry.kind !== 'nep141' && entry.symbol === 'NEAR') {
        txHash = (await contracts.signAndSendNearTransfer({ wallet, receiverId: q.depositAddress, amountNear: amt })).txHash;
      } else if (entry.blockchain === 'near' && entry.contractAddress) {
        txHash = (await contracts.executeNearNep141Transfer({ wallet, tokenContract: entry.contractAddress, receiverId: q.depositAddress, amount: amt, decimals: entry.decimals || 8, tokenSymbol: entry.symbol, tokenBalance: avail })).txHash;
      } else if (entry.blockchain === 'sol') {
        txHash = !entry.contractAddress || entry.contractAddress === 'So11111111111111111111111111111111111111112'
          ? (await contracts.executeSolanaNativeTransfer({ wallet, toAddress: q.depositAddress, amountSol: amt })).txHash
          : (await contracts.executeSolanaSplTransfer({ wallet, mintAddress: entry.contractAddress, toAddress: q.depositAddress, amount: amt, decimals: entry.decimals || 6, tokenBalance: avail })).txHash;
      } else if (entry.blockchain === 'btc') {
        const res = await contracts.executeBitcoinTransfer({ wallet, toAddress: q.depositAddress, amountBtc: amt, feeDeductMode: 'extra' });
        txHash = res.txHash;
        applyOptimisticChainSpend(wallet, 'btc', amt, Number(res.feeBtc) || 0, txHash);
      } else {
        txHash = (await contracts.executeEvmTransfer({ wallet, chainKey: entry.blockchain, toAddress: q.depositAddress, amount: amt, tokenContract: entry.contractAddress, decimals: entry.decimals || 18, tokenBalance: avail })).txHash;
      }

      if (txHash) {
        await intents.submitExternalDepositTxHash({ depositAddress: q.depositAddress, txHash, nearSenderAccount: wallet.nearNamedAccount || wallet.nearAddress }).catch(() => {});
      }
      showToast(`✅ ${t('跨链充值已发送，到账后点击「一键转入合约」即可下单', 'Deposit sent; click Move to Trading after confirmation')}`);
      closeAllSheets();
      refreshAllBalancesAsync(false);
    } catch (err) {
      st.perp.fundingQuoteError = (err && err.message) || t('跨链充值失败', 'Deposit failed');
      evaluatePerpOneClickUI();
      showToast(st.perp.fundingQuoteError);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function executePerpArbBridgeDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const pre = evaluatePerpArbDepositUI();
    if (pre && pre.disabled) {
      if (pre.error) showToast(pre.error);
      return;
    }
    const amt = Number($('perp-arb-amount')?.value || 0);
    const btn = $('btn-perp-arb-deposit');
    if (btn) btn.disabled = true;
    try {
      await ensureEthersLoaded();
      const res = await hl.depositArbUsdcToHlBridge({ wallet, amount: amt });
      showToast(`✅ ${t('Arbitrum 充值已提交', 'Arbitrum deposit sent')}: ${shortenAddr(res.txHash)}`);
      closeAllSheets();
      refreshAllBalancesAsync(false);
      refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('Arbitrum 充值失败', 'Arbitrum deposit failed'));
    } finally {
      if (btn) btn.disabled = false;
      evaluatePerpArbDepositUI();
    }
  }

  async function executePerpWithdrawUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const pre = evaluatePerpWithdrawUI();
    if (pre && pre.disabled) {
      if (pre.error) showToast(pre.error);
      return;
    }
    const amt = Number($('perp-withdraw-amount')?.value || 0);
    const withdrawable = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    const authed = await verifySecurityAuthAsync(wallet, t('提现 USDC 至 Arbitrum 钱包', 'Withdraw USDC to Arbitrum wallet'));
    if (!authed) return;

    const btn = $('btn-perp-withdraw');
    if (btn) btn.disabled = true;
    try {
      await ensureEthersLoaded();
      await hl.withdrawHlToArbitrum({ wallet, amount: amt, withdrawable });
      showToast(`✅ ${t('提现请求已提交至 Arbitrum (约几分钟到账)', 'Withdrawal submitted to Arbitrum')}`);
      closeAllSheets();
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('提现失败', 'Withdrawal failed'));
    } finally {
      if (btn) btn.disabled = false;
      evaluatePerpWithdrawUI();
    }
  }

