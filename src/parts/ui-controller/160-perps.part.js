  // ==================== Perpetual Futures (Hyperliquid) Controller ====================

  let _perpQuoteTimer = null;

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
    const lev = Math.max(1, Number(override.leverage ?? st.perp.leverage) || 5);
    const margin = Number(override.marginInput ?? st.perp.marginInput);
    const limitPx = Number(override.limitPriceInput ?? st.perp.limitPriceInput);
    const availMargin = acct ? Number(acct.availableMargin || 0) : null;
    const markPx = market ? Number(market.markPx || 0) : null;
    const execPx = orderType === 'limit' ? limitPx : markPx;

    let notional = null;
    let sizeNum = null;
    let sizeStr = '--';
    let estLiqPx = null;
    if (Number.isFinite(margin) && margin > 0 && execPx && Number.isFinite(execPx) && execPx > 0) {
      notional = margin * lev;
      const rawSize = notional / execPx;
      sizeStr = hl ? hl.formatHlSize(rawSize, market ? market.szDecimals : 4) : rawSize.toFixed(4);
      sizeNum = Number(sizeStr);
      if (hl) {
        estLiqPx = hl.computeEstimatedLiqPrice({ markPx: execPx, leverage: lev, isLong: isBuy });
      }
    }

    const coinLabel = market ? market.name : (st.perp.selectedCoin || 'BTC');
    const actionLabel = isBuy ? `${t('开多', 'Open Long')} ${coinLabel}` : `${t('开空', 'Open Short')} ${coinLabel}`;

    if (st.perp.submitting) {
      return { disabled: true, error: '', text: t('提交签名中...', 'Submitting...'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (!market || !markPx) {
      return { disabled: true, error: '', text: t('同步市场行情...', 'Loading market...'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (orderType === 'limit' && (!Number.isFinite(limitPx) || limitPx <= 0)) {
      return { disabled: true, error: '', text: t('请输入限价价格', 'Enter limit price'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (!Number.isFinite(margin) || margin <= 0) {
      return { disabled: true, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (availMargin !== null && margin > availMargin + 1e-6) {
      const msg = t(`可用保证金不足 (当前: $${availMargin.toFixed(2)} USDC)`, `Insufficient margin (avail: $${availMargin.toFixed(2)} USDC)`);
      return { disabled: true, error: msg, text: t('保证金不足', 'Insufficient Margin'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    const minNotional = hl ? hl.HL_MIN_ORDER_USD : 10;
    if (!notional || notional < minNotional) {
      const msg = t(`名义价值需 >= $${minNotional} USDC (当前 $${(notional || 0).toFixed(2)})`, `Notional must be >= $${minNotional} USDC (now $${(notional || 0).toFixed(2)})`);
      return { disabled: true, error: msg, text: t(`最低名义 $${minNotional}`, `Min $${minNotional} Notional`), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    if (!sizeNum || sizeNum <= 0) {
      return { disabled: true, error: t('数量低于最小精度', 'Size below tick step'), notional, sizeNum, sizeStr, estLiqPx, execPx };
    }
    return { disabled: false, error: '', text: actionLabel, notional, sizeNum, sizeStr, estLiqPx, execPx };
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
    const ob = st.perp.orderbook;
    const coin = (st.perp && st.perp.selectedCoin) || 'BTC';
    const bidsEl = $('perp-ob-bids');
    const asksEl = $('perp-ob-asks');
    const bidSumEl = $('perp-ob-bid-summary');
    const askSumEl = $('perp-ob-ask-summary');
    const bidBarEl = $('perp-ob-bid-bar');
    const askBarEl = $('perp-ob-ask-bar');
    const szLabel = `${t('数量', 'Size')} (${coin})`;
    if ($('perp-ob-bid-sz-hdr')) $('perp-ob-bid-sz-hdr').textContent = szLabel;
    if ($('perp-ob-ask-sz-hdr')) $('perp-ob-ask-sz-hdr').textContent = szLabel;
    if (!bidsEl || !asksEl) return;

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
      bidSumEl.textContent = `${t('20档买盘', '20-Lvl Bids')} ${formatBal(bidTot, 2)} ${coin} (${ob.bidOrderCount || 0}${t('单', '')})`;
    }
    if (askSumEl) {
      askSumEl.textContent = `${formatBal(askTot, 2)} ${coin} (${ob.askOrderCount || 0}${t('单', '')}) ${t('20档卖盘', 'Asks')}`;
    }
    if (bidBarEl) bidBarEl.style.width = `${Math.max(5, Math.min(95, ratio)).toFixed(1)}%`;
    if (askBarEl) askBarEl.style.width = `${Math.max(5, Math.min(95, 100 - ratio)).toFixed(1)}%`;

    const bidRows = ob.bids.slice(0, 10);
    const askRows = ob.asks.slice(0, 10);
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
      return `<button type="button" class="perp-ob-row ask" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="width:${pct.toFixed(0)}%"></div><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span><span>${escapeHtml(r.sz.toFixed(3))}</span></button>`;
    }).join('');
  }

  function renderPerpBottomList() {
    const st = getState();
    const listEl = $('perp-bottom-list');
    if (!listEl) return;
    const tab = st.perp.bottomTab || 'positions';
    $('perp-tab-positions')?.classList.toggle('active', tab === 'positions');
    $('perp-tab-orders')?.classList.toggle('active', tab === 'orders');
    $('perp-tab-fills')?.classList.toggle('active', tab === 'fills');

    const acct = st.perp.account;
    if (!acct) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">--</div>`;
      return;
    }

    if (tab === 'positions') {
      if (!acct.positions || acct.positions.length === 0) {
        listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align:center; padding: 14px 0;">${escapeHtml(t('暂无持仓', 'No open positions'))}</div>`;
        return;
      }
      listEl.innerHTML = acct.positions.map((p) => {
        const upnl = Number(p.unrealizedPnl || 0);
        const upnlCls = upnl >= 0 ? 'text-emerald' : 'text-rose';
        const dirText = p.isLong ? t('多', 'Long') : t('空', 'Short');
        const roeStr = p.returnOnEquity !== null ? ` (${(p.returnOnEquity * 100).toFixed(1)}%)` : '';
        return `
          <div class="perp-pos-card">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <strong style="font-size: 13.5px;">${escapeHtml(p.coin)}</strong>
                <span class="ca-badge">${escapeHtml(dirText)} ${escapeHtml(String(p.leverageValue || '--'))}x</span>
                <span style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(p.leverageType || 'isolated')}</span>
              </div>
              <button type="button" class="mini-action-btn primary" data-action="close-perp-pos" data-coin="${escapeHtml(p.coin)}">${escapeHtml(t('市价平仓', 'Close'))}</button>
            </div>
            <div class="flex items-center justify-between" style="font-size: 11.5px; color: var(--text-secondary);">
              <span>${escapeHtml(t('数量', 'Size'))}: <strong class="mono">${escapeHtml(String(p.absSize))}</strong></span>
              <span>${escapeHtml(t('开仓', 'Entry'))}: <span class="mono">${escapeHtml(formatPerpPx(p.entryPx))}</span></span>
              <span>${escapeHtml(t('强平', 'Liq'))}: <span class="mono">${escapeHtml(formatPerpPx(p.liquidationPx))}</span></span>
            </div>
            <div class="flex items-center justify-between" style="font-size: 12px;">
              <span style="color: var(--text-muted);">${escapeHtml(t('未实现盈亏', 'uPnL'))}</span>
              <span class="mono ${upnlCls}" style="font-weight: 700;">${upnl >= 0 ? '+' : ''}$${escapeHtml(upnl.toFixed(2))}${escapeHtml(roeStr)}</span>
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
        return `
          <div class="perp-pos-card">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <strong>${escapeHtml(String(o.coin || ''))}</strong>
                <span class="ca-badge">${escapeHtml(isBuy ? t('买入', 'Buy') : t('卖出', 'Sell'))}</span>
              </div>
              <button type="button" class="mini-action-btn" data-action="cancel-perp-order" data-coin="${escapeHtml(String(o.coin || ''))}" data-oid="${escapeHtml(String(o.oid || ''))}">${escapeHtml(t('撤单', 'Cancel'))}</button>
            </div>
            <div class="flex items-center justify-between" style="font-size: 11.5px; color: var(--text-secondary);">
              <span>${escapeHtml(t('价格', 'Price'))}: <span class="mono">$${escapeHtml(String(o.limitPx || '--'))}</span></span>
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
      return `
        <div class="perp-pos-card" style="padding: 8px 10px;">
          <div class="flex items-center justify-between" style="font-size: 12px;">
            <span><strong>${escapeHtml(String(f.coin || ''))}</strong> · ${escapeHtml(isBuy ? t('买入', 'Buy') : t('卖出', 'Sell'))} ${escapeHtml(String(f.sz || ''))} @ $${escapeHtml(String(f.px || '--'))}</span>
            <span class="mono ${pnl >= 0 ? 'text-emerald' : 'text-rose'}">${pnl !== 0 ? `${pnl > 0 ? '+' : ''}$${pnl.toFixed(2)}` : '--'}</span>
          </div>
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
    if (ntlEl) ntlEl.textContent = evalRes.notional ? `$${evalRes.notional.toFixed(2)} USDC` : '--';
    if (szEl) szEl.textContent = evalRes.sizeNum > 0 ? `${evalRes.sizeStr} ${market ? market.name : st.perp.selectedCoin}` : '--';
    if (liqEl) liqEl.textContent = evalRes.estLiqPx ? `$${formatPerpPx(evalRes.estLiqPx)}` : '--';

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

    const coinSymbol = market ? market.name : (st.perp.selectedCoin || 'BTC');
    const coinIconEl = $('perp-coin-icon');
    if (coinIconEl && tokens && typeof tokens.renderTokenIconWithBadge === 'function') {
      coinIconEl.innerHTML = tokens.renderTokenIconWithBadge({ symbol: coinSymbol, blockchain: 'hype' }, 20, false);
    }
    const coinNameEl = $('perp-coin-name');
    const markPxEl = $('perp-mark-px');
    const chgEl = $('perp-change-24h');
    const frEl = $('perp-funding-rate');
    const volEl = $('perp-vol-24h');
    const oiEl = $('perp-oi-val');
    if (coinNameEl) coinNameEl.textContent = `${coinSymbol}-PERP`;
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
    $('perp-type-market')?.classList.toggle('active', st.perp.orderType !== 'limit');
    $('perp-type-limit')?.classList.toggle('active', st.perp.orderType === 'limit');
    $('perp-limit-price-row')?.classList.toggle('hidden', st.perp.orderType !== 'limit');

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
    st.perp.orderType = orderType === 'limit' ? 'limit' : 'market';
    const market = getSelectedPerpMarket();
    if (st.perp.orderType === 'limit' && !st.perp.limitPriceInput && market && market.markPx) {
      st.perp.limitPriceInput = String(market.markPx);
      const inp = $('perp-limit-price-input');
      if (inp) inp.value = st.perp.limitPriceInput;
    }
    renderPerpView();
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
    st.perp.orderType = 'limit';
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
    st.perp.marketFilter = ['hot', 'all', 'gainers', 'vol'].includes(filter) ? filter : 'hot';
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
    let filtered = q ? mkts.filter((m) => m.name.toUpperCase().includes(q)) : mkts;
    if (!q && activeFilter === 'gainers') {
      filtered.sort((a, b) => (Number(b.change24hPct) || -999) - (Number(a.change24hPct) || -999));
    } else if (!q && activeFilter === 'vol') {
      filtered.sort((a, b) => (Number(b.dayNtlVlm) || 0) - (Number(a.dayNtlVlm) || 0));
    } else if (!q && activeFilter === 'hot') {
      const pinned = new Set((hl && hl.PINNED_COINS) || ['BTC', 'ETH', 'SOL', 'NEAR', 'HYPE']);
      const top = filtered.filter((m) => pinned.has(m.name));
      const rest = filtered.filter((m) => !pinned.has(m.name)).sort((a, b) => (Number(b.dayNtlVlm) || 0) - (Number(a.dayNtlVlm) || 0));
      filtered = [...top, ...rest.slice(0, 35)];
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
      const iconHtml = tokens && typeof tokens.renderTokenIconWithBadge === 'function'
        ? tokens.renderTokenIconWithBadge({ symbol: m.name, blockchain: 'hype' }, 28, false)
        : '';
      const volText = typeof m.dayNtlVlm === 'number' && m.dayNtlVlm > 0 ? `${t('量', 'Vol')} ${formatCompactUsd(m.dayNtlVlm)}` : '';
      return `
        <button type="button" class="perp-market-item ${m.name === selCoin ? 'active' : ''}" data-action="select-perp-market" data-coin="${escapeHtml(m.name)}">
          <div class="flex items-center gap-2">
            ${iconHtml}
            <div class="flex flex-col" style="gap:1px;">
              <div class="flex items-center gap-1">
                <strong>${escapeHtml(m.name)}-PERP</strong>
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
      const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : null;
      await hl.placeHlPerpOrder({
        wallet,
        market,
        isBuy,
        size: evalRes.sizeNum,
        orderType: st.perp.orderType,
        limitPrice: st.perp.orderType === 'limit' ? Number(st.perp.limitPriceInput) : null,
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
      showToast(`✅ ${coin} ${t('已市价平仓', 'position closed')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('平仓失败', 'Close failed'));
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

