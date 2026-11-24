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
      bidSumEl.textContent = `${t('买', 'Bid')} ${formatBal(bidTot, 2)} ${coin}`;
    }
    if (askSumEl) {
      askSumEl.textContent = `${t('卖', 'Ask')} ${formatBal(askTot, 2)} ${coin}`;
    }
    if (bidBarEl) bidBarEl.style.width = `${Math.max(5, Math.min(95, ratio)).toFixed(1)}%`;
    if (askBarEl) askBarEl.style.width = `${Math.max(5, Math.min(95, 100 - ratio)).toFixed(1)}%`;

    const bidRows = ob.bids.slice(0, 10);
    const askRows = [...ob.asks.slice(0, 10)].reverse();
    let maxBidSz = 0;
    let maxAskSz = 0;
    for (const r of bidRows) if (r.sz > maxBidSz) maxBidSz = r.sz;
    for (const r of askRows) if (r.sz > maxAskSz) maxAskSz = r.sz;

    const szDec = Number(getSelectedPerpMarket()?.szDecimals);
    const fmtObSz = (v) => {
      const dec = Number.isFinite(szDec) ? Math.max(0, Math.min(5, szDec)) : 3;
      return Number(v || 0).toFixed(v >= 1000 ? Math.min(2, dec) : dec);
    };
    bidsEl.innerHTML = bidRows.map((r) => {
      const pct = maxBidSz > 0 ? Math.max(6, (r.sz / maxBidSz) * 100) : 0;
      return `<button type="button" class="perp-ob-row bid" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="width:${pct.toFixed(0)}%"></div><span>${escapeHtml(fmtObSz(r.sz))}</span><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span></button>`;
    }).join('');
    asksEl.innerHTML = askRows.map((r) => {
      const pct = maxAskSz > 0 ? Math.max(6, (r.sz / maxAskSz) * 100) : 0;
      return `<button type="button" class="perp-ob-row ask" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="width:${pct.toFixed(0)}%"></div><span>${escapeHtml(fmtObSz(r.sz))}</span><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span></button>`;
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

  function evaluatePerpOrderUI(syncFromDom = true) {
    const st = getState();
    const market = getSelectedPerpMarket();
    if (syncFromDom) {
      const marginEl = $('perp-margin-input');
      const limitEl = $('perp-limit-price-input');
      if (marginEl && marginEl.value !== undefined) st.perp.marginInput = marginEl.value;
      if (limitEl && limitEl.value !== undefined) st.perp.limitPriceInput = limitEl.value;
      st.perp.tpInput = ($('perp-tp-input')?.value || '').trim();
      st.perp.slInput = ($('perp-sl-input')?.value || '').trim();
    }

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
    const clearBtn = $('perp-overview-search-clear');
    if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);

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

    const visibleRows = filtered.slice(0, 120);
    const renderMarketRowHtml = (m) => {
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
        ? tokens.renderTokenIconWithBadge({ symbol: m.name, blockchain: 'hype' }, 30, false)
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
    };
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountPerpOverview === 'function') {
      fw.mountPerpOverview(listEl, {
        rows: visibleRows,
        renderMarketRowHtml,
        emptyText: t('暂无匹配合约', 'No matching contracts')
      });
      return;
    }
    listEl.innerHTML = visibleRows.map(renderMarketRowHtml).join('');
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

    const isTradeView = st.perp.subView === 'trade';
    if ($('perp-overview-panel')) $('perp-overview-panel').classList.toggle('hidden', isTradeView);
    if ($('perp-trade-panel')) $('perp-trade-panel').classList.toggle('hidden', !isTradeView);
    if (!isTradeView) {
      renderPerpOverviewPanel();
    }

    const coinRaw = market ? market.name : (st.perp.selectedCoin || 'BTC');
    const pairLabel = market && market.pairLabel ? market.pairLabel : formatPerpDisplayPair(coinRaw);
    const dexTag = (market && market.dex) || extractPerpDexBadge(coinRaw);
    const coinIconEl = $('perp-coin-icon');
    if (coinIconEl && tokens && typeof tokens.renderTokenIconWithBadge === 'function') {
      coinIconEl.innerHTML = tokens.renderTokenIconWithBadge({ symbol: coinRaw, blockchain: 'hype' }, 20, false);
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
    $('btn-perp-chart-toggle')?.classList.toggle('active', Boolean(st.perp.showChart));
    if (chartSvgEl && st.perp.showChart) {
      const selIdx = Number.isInteger(st.perp.inspectedCandleIdx) ? st.perp.inspectedCandleIdx : null;
      chartSvgEl.innerHTML = renderPerpCandleSvg(st.perp.candles, market, selIdx);
      bindPerpChartGestures();
      renderPerpCandleDetailBar(st.perp.candles, selIdx);
      if (chartHlEl) chartHlEl.textContent = '';
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

    evaluatePerpOrderUI(false);
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

