  function setInputValIfIdle(el, val) {
    if (!el) return;
    if (typeof document !== 'undefined' && document.activeElement === el) return;
    if (el.value !== val) el.value = val;
  }

  function updateOrderbookSidePool(containerEl, rows, side, maxSz, fmtObSz) {
    if (!containerEl) return false;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function' || typeof containerEl.appendChild !== 'function') {
      return false;
    }
    let pool = containerEl._obPool;
    if (!Array.isArray(pool) || pool.length !== 8 || pool[0].parentNode !== containerEl) {
      containerEl.textContent = '';
      pool = [];
      for (let i = 0; i < 8; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `perp-ob-row ${side}`;
        btn.setAttribute('data-action', 'fill-perp-ob-px');
        const depth = document.createElement('div');
        depth.className = 'perp-ob-row-depth';
        const pxSpan = document.createElement('span');
        pxSpan.className = 'perp-ob-px';
        const szSpan = document.createElement('span');
        szSpan.className = 'perp-ob-sz';
        btn.appendChild(depth);
        btn.appendChild(pxSpan);
        btn.appendChild(szSpan);
        containerEl.appendChild(btn);
        pool.push(btn);
      }
      containerEl._obPool = pool;
    }
    for (let i = 0; i < 8; i++) {
      const btn = pool[i];
      const r = rows[i];
      if (!r) {
        if (btn.style.display !== 'none') btn.style.display = 'none';
        continue;
      }
      if (btn.style.display !== '') btn.style.display = '';
      const pxRaw = String(r.px);
      if (btn.getAttribute('data-px') !== pxRaw) btn.setAttribute('data-px', pxRaw);
      const pct = maxSz > 0 ? Math.max(6, (r.sz / maxSz) * 100) : 0;
      const scaleStr = `scaleX(${(pct / 100).toFixed(3)})`;
      const depthEl = btn.firstChild;
      if (depthEl && depthEl.style.transform !== scaleStr) depthEl.style.transform = scaleStr;
      const pxText = formatPerpPx(r.px);
      const pxEl = btn.childNodes[1];
      if (pxEl && pxEl.textContent !== pxText) pxEl.textContent = pxText;
      const szText = fmtObSz(r.sz);
      const szEl = btn.childNodes[2];
      if (szEl && szEl.textContent !== szText) szEl.textContent = szText;
    }
    return true;
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
    const midSubEl = $('perp-ob-mid-sub');
    if (midSubEl) {
      if (market && typeof market.change24hPct === 'number') {
        const pos = market.change24hPct >= 0;
        midSubEl.textContent = `${pos ? '+' : ''}${market.change24hPct.toFixed(2)}%`;
        midSubEl.style.color = pos ? '#34d399' : '#fb7185';
      } else {
        midSubEl.textContent = '--';
        midSubEl.style.color = 'var(--text-muted)';
      }
    }

    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (!ob || (!ob.bids.length && !ob.asks.length)) {
      if (!updateOrderbookSidePool(bidsEl, [], 'bid', 0, () => '--')) {
        if (fw && typeof fw.mountPerpOrderbookSide === 'function') fw.mountPerpOrderbookSide(bidsEl, { rows: [], side: 'bid', maxSz: 0, fmtObSz: () => '--', formatPerpPx });
        else bidsEl.innerHTML = `<div class="perp-ob-row"><span>--</span><span>--</span></div>`;
      }
      if (!updateOrderbookSidePool(asksEl, [], 'ask', 0, () => '--')) {
        if (fw && typeof fw.mountPerpOrderbookSide === 'function') fw.mountPerpOrderbookSide(asksEl, { rows: [], side: 'ask', maxSz: 0, fmtObSz: () => '--', formatPerpPx });
        else asksEl.innerHTML = `<div class="perp-ob-row"><span>--</span><span>--</span></div>`;
      }
      if (bidSumEl) bidSumEl.textContent = '--';
      if (askSumEl) askSumEl.textContent = '--';
      if (bidBarEl) bidBarEl.style.transform = 'scaleX(0.5)';
      if (askBarEl) askBarEl.style.transform = 'scaleX(0.5)';
      return;
    }

    const ratio = Number.isFinite(ob.bidRatioPct) ? ob.bidRatioPct : 50;
    const bidPct = Math.max(0, Math.min(100, Math.round(ratio)));
    const askPct = 100 - bidPct;
    if (bidSumEl) {
      bidSumEl.textContent = `B ${bidPct}%`;
    }
    if (askSumEl) {
      askSumEl.textContent = `${askPct}% S`;
    }
    const bidFrac = Math.max(0.05, Math.min(0.95, ratio / 100));
    const askFrac = Math.max(0.05, Math.min(0.95, 1 - bidFrac));
    if (bidBarEl) bidBarEl.style.transform = `scaleX(${bidFrac.toFixed(3)})`;
    if (askBarEl) askBarEl.style.transform = `scaleX(${askFrac.toFixed(3)})`;

    const bidRows = ob.bids.slice(0, 8);
    const askRows = [...ob.asks.slice(0, 8)].reverse();
    let maxBidSz = 0;
    let maxAskSz = 0;
    for (const r of bidRows) if (r.sz > maxBidSz) maxBidSz = r.sz;
    for (const r of askRows) if (r.sz > maxAskSz) maxAskSz = r.sz;

    const szDec = Number(getSelectedPerpMarket()?.szDecimals);
    const fmtObSz = (v) => {
      const dec = Number.isFinite(szDec) ? Math.max(0, Math.min(5, szDec)) : 3;
      return Number(v || 0).toFixed(v >= 1000 ? Math.min(2, dec) : dec);
    };
    const canMountFw = fw && typeof fw.mountPerpOrderbookSide === 'function' && typeof document !== 'undefined' && typeof document.createElement === 'function';
    const bidsUpdated = updateOrderbookSidePool(bidsEl, bidRows, 'bid', maxBidSz, fmtObSz);
    const asksUpdated = updateOrderbookSidePool(asksEl, askRows, 'ask', maxAskSz, fmtObSz);
    if (!bidsUpdated) {
      if (canMountFw) fw.mountPerpOrderbookSide(bidsEl, { rows: bidRows, side: 'bid', maxSz: maxBidSz, fmtObSz, formatPerpPx });
      else bidsEl.innerHTML = bidRows.map((r) => {
        const pct = maxBidSz > 0 ? Math.max(6, (r.sz / maxBidSz) * 100) : 0;
        return `<button type="button" class="perp-ob-row bid" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="transform:scaleX(${(pct / 100).toFixed(3)})"></div><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span><span>${escapeHtml(fmtObSz(r.sz))}</span></button>`;
      }).join('');
    }
    if (!asksUpdated) {
      if (canMountFw) fw.mountPerpOrderbookSide(asksEl, { rows: askRows, side: 'ask', maxSz: maxAskSz, fmtObSz, formatPerpPx });
      else asksEl.innerHTML = askRows.map((r) => {
        const pct = maxAskSz > 0 ? Math.max(6, (r.sz / maxAskSz) * 100) : 0;
        return `<button type="button" class="perp-ob-row ask" data-action="fill-perp-ob-px" data-px="${escapeHtml(String(r.px))}"><div class="perp-ob-row-depth" style="transform:scaleX(${(pct / 100).toFixed(3)})"></div><span class="perp-ob-px">${escapeHtml(formatPerpPx(r.px))}</span><span>${escapeHtml(fmtObSz(r.sz))}</span></button>`;
      }).join('');
    }
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

    const busyKey = (st.perp && st.perp.actionBusyKey) || '';
    const batchBtn = $('btn-perp-batch-action');
    if (batchBtn) {
      if (tab === 'positions' && posCount > 0) {
        batchBtn.classList.remove('hidden');
        batchBtn.disabled = busyKey === 'batch';
        batchBtn.textContent = busyKey === 'batch' ? t('平仓中...', 'Closing...') : t('一键全平', 'Close All');
      } else if (tab === 'orders' && ordCount > 0) {
        batchBtn.classList.remove('hidden');
        batchBtn.disabled = busyKey === 'batch';
        batchBtn.textContent = busyKey === 'batch' ? t('撤单中...', 'Cancelling...') : t('全部撤单', 'Cancel All');
      } else {
        batchBtn.classList.add('hidden');
        batchBtn.disabled = false;
      }
    }

    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (!fw || typeof fw.mountPerpBottomList !== 'function') return;
    if (!acct) {
      fw.mountPerpBottomList(listEl, { items: [], tab, emptyText: '--', isEn: st.lang === 'en', formatPerpPx, busyKey });
      return;
    }
    if (tab === 'positions') {
      const mktByName = new Map((st.perp.markets || []).map((m) => [m.name, m]));
      const items = (acct.positions || []).map((p) => {
        const mkt = mktByName.get(p.coin);
        return {
          ...p,
          pair: formatPerpDisplayPair(p.coin || ''),
          markPx: (mkt && mkt.markPx) ? mkt.markPx : p.markPx
        };
      });
      fw.mountPerpBottomList(listEl, { items, tab, emptyText: t('暂无持仓', 'No open positions'), isEn: st.lang === 'en', formatPerpPx, busyKey });
      return;
    }
    if (tab === 'orders') {
      const items = (acct.openOrders || []).slice(0, 25).map((o) => ({ ...o, pair: formatPerpDisplayPair(o.coin || '') }));
      fw.mountPerpBottomList(listEl, { items, tab, emptyText: t('暂无委托', 'No open orders'), isEn: st.lang === 'en', formatPerpPx, busyKey });
      return;
    }
    const items = (acct.fills || []).slice(0, 20).map((f) => ({ ...f, pair: formatPerpDisplayPair(f.coin || '') }));
    fw.mountPerpBottomList(listEl, { items, tab, emptyText: t('暂无成交记录', 'No recent fills'), isEn: st.lang === 'en', formatPerpPx, busyKey });
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
    const isCoinMode = (st.perp && st.perp.inputUnit === 'coin');
    const ntlEl = $('perp-meta-notional');
    const szLblEl = $('perp-meta-size-label');
    const szEl = $('perp-meta-size');
    const liqEl = $('perp-meta-liq');
    const feeEl = $('perp-meta-fee');
    if (ntlEl) ntlEl.textContent = evalRes.notional ? `$${evalRes.notional.toFixed(2)} USDC` : '--';
    if (szLblEl) {
      szLblEl.textContent = isCoinMode ? t('所需保证金', 'Req. Margin') : t('委托数量', 'Size');
    }
    if (szEl) {
      if (isCoinMode) {
        szEl.textContent = evalRes.marginNeeded > 0 ? `$${evalRes.marginNeeded.toFixed(2)} USDC` : '--';
      } else {
        szEl.textContent = evalRes.sizeNum > 0 ? `${evalRes.sizeStr} ${formatPerpDisplayPair(market ? market.name : st.perp.selectedCoin).split('-')[0]}` : '--';
      }
    }
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
    const lev = Math.max(1, Number(st.perp.leverage) || 5);
    const btnLong = $('btn-perp-submit-long');
    if (btnLong) {
      btnLong.disabled = Boolean(evalRes.disabled);
      btnLong.textContent = st.perp.submitting
        ? t('提交签名中...', 'Submitting...')
        : t(`买入 (做多) ${lev}x`, `Buy Long ${lev}x`);
    }
    const btnShort = $('btn-perp-submit-short');
    if (btnShort) {
      btnShort.disabled = Boolean(evalRes.disabled);
      btnShort.textContent = st.perp.submitting
        ? t('提交签名中...', 'Submitting...')
        : t(`卖出 (做空) ${lev}x`, `Sell Short ${lev}x`);
    }
    if (typeof updatePerpTpSlEstimateTooltip === 'function') {
      updatePerpTpSlEstimateTooltip(null, true);
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
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
      if (fw && typeof fw.mountPerpOverviewPositionsPanel === 'function') {
        const mappedPositions = positions.map((p) => {
          const upnl = Number(p.unrealizedPnl || 0);
          const szi = Math.abs(Number(p.szi || 0));
          const entryPx = Number(p.entryPx || 0);
          const liqPx = Number(p.liquidationPx || 0);
          return {
            coin: p.coin,
            isLong: Boolean(p.isLong),
            leverage: String(p.leverageValue || '--'),
            sizeDisplay: `${szi} ${formatPerpBaseSymbol(p.coin)}`,
            pnlDisplay: `${upnl >= 0 ? '+' : ''}$${upnl.toFixed(2)}`,
            pnlColor: upnl >= 0 ? '#34d399' : '#fb7185',
            entryDisplay: entryPx > 0 ? `$${formatPerpPx(entryPx)}` : '--',
            liqDisplay: liqPx > 0 ? `$${formatPerpPx(liqPx)}` : '--'
          };
        });
        fw.mountPerpOverviewPositionsPanel(posWrap, {
          positions: mappedPositions,
          onSelectCoin: (coin) => {
            if (typeof openPerpTrade === 'function') openPerpTrade(coin);
          }
        });
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
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (mkts.length === 0) {
      const loadingTxt = t('正在加载 Hyperliquid 实时合约...', 'Loading Hyperliquid markets...');
      if (fw && typeof fw.mountPerpOverview === 'function') {
        fw.mountPerpOverview(listEl, { rows: [], emptyText: loadingTxt, formatPerpPx });
      }
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
      const emptyTxt = t('暂无匹配合约', 'No matching contracts');
      if (fw && typeof fw.mountPerpOverview === 'function') {
        fw.mountPerpOverview(listEl, { rows: [], emptyText: emptyTxt, formatPerpPx });
      }
      return;
    }

    if (!fw || typeof fw.mountPerpOverview !== 'function') return;
    const visibleRows = filtered.slice(0, 120);
    const favList = getPerpFavoriteCoins();
    const favsExact = new Set(favList);
    const favsUpper = new Set(favList.map((x) => String(x || '').toUpperCase()));
    const vmRows = visibleRows.map((m) => {
      const vol = Number(m.dayNtlVlm || 0);
      const volText = vol >= 1e9 ? `$${(vol / 1e9).toFixed(2)}B` : (vol >= 1e6 ? `$${(vol / 1e6).toFixed(2)}M` : (vol >= 1e3 ? `$${(vol / 1e3).toFixed(1)}K` : `$${vol.toFixed(0)}`));
      const dexTag = m.dex ? String(m.dex).toUpperCase() : (typeof extractPerpDexBadge === 'function' ? extractPerpDexBadge(m.name) : '');
      const coinKey = String(m.name || '');
      return {
        ...m,
        pair: formatPerpDisplayPair(m.name),
        dexTag,
        volText: `${t('24h量', '24h Vol')} ${volText}`,
        isFav: favsExact.has(coinKey) || favsUpper.has(coinKey.toUpperCase())
      };
    });
    fw.mountPerpOverview(listEl, {
      rows: vmRows,
      emptyText: t('暂无匹配合约', 'No matching contracts'),
      formatPerpPx
    });
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
    updatePerpFundingCountdown();

    const curIv = st.perp.chartInterval || '15m';
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#perp-interval-pills [data-iv]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-iv') === curIv);
      });
    }
    const chartWrap = $('perp-chart-wrap');
    const chartSvgEl = $('perp-chart-svg');
    const chartHlEl = $('perp-chart-hl');
    if (chartWrap) chartWrap.classList.remove('hidden');
    if (chartSvgEl) {
      const selIdx = Number.isInteger(st.perp.inspectedCandleIdx) ? st.perp.inspectedCandleIdx : null;
      chartSvgEl.innerHTML = renderPerpCandleSvg(st.perp.candles, market, selIdx);
      bindPerpChartGestures();
      renderPerpCandleDetailBar(st.perp.candles, selIdx);
      if (chartHlEl) chartHlEl.textContent = '';
    }

    renderPerpOrderbook();

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
    const isMarket = oType !== 'limit' && oType !== 'post_only';
    const priceRow = $('perp-limit-price-row');
    if (priceRow) {
      priceRow.classList.remove('hidden');
      priceRow.classList.toggle('is-market-locked', isMarket);
    }
    const priceInp = $('perp-limit-price-input');
    if (priceInp) {
      priceInp.disabled = isMarket;
      if (isMarket) setInputValIfIdle(priceInp, '');
      const phKey = isMarket ? 'perp.marketPricePlaceholder' : 'perp.limitPriceLabel';
      if (typeof priceInp.setAttribute === 'function') priceInp.setAttribute('data-i18n-placeholder', phKey);
      priceInp.placeholder = isMarket
        ? t('以最优市价成交', 'Best Market Price')
        : t('委托价格', 'Limit Price');
    }
    if ($('perp-reduce-only-chk')) $('perp-reduce-only-chk').checked = Boolean(st.perp.reduceOnly);

    const slider = $('perp-leverage-slider');
    if (slider) {
      slider.max = String(maxLev);
      setInputValIfIdle(slider, String(st.perp.leverage));
    }
    const levValEl = $('perp-lev-val');
    if (levValEl) levValEl.textContent = `${st.perp.leverage}x`;

    if (typeof syncPerpInputUnitUI === 'function') syncPerpInputUnitUI();
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

  function updatePerpFundingCountdown() {
    const el = $('perp-ob-funding-countdown');
    if (!el) return;
    const market = getSelectedPerpMarket();
    const frText = (market && typeof market.fundingRate === 'number' && Number.isFinite(market.fundingRate))
      ? `${(market.fundingRate * 100).toFixed(4)}%`
      : '--';
    const now = Date.now();
    const nextHourMs = (Math.floor(now / 3_600_000) + 1) * 3_600_000;
    const remSec = Math.max(0, Math.floor((nextHourMs - now) / 1000));
    const mm = String(Math.floor(remSec / 60)).padStart(2, '0');
    const ss = String(remSec % 60).padStart(2, '0');
    el.textContent = `${frText} / ${mm}:${ss}`;
  }

  let _perpRefreshInFlight = null;
  let _lastHip3SyncAt = 0;

  async function refreshPerpDataAsync(force = false) {
    if (!force && _perpRefreshInFlight) {
      return _perpRefreshInFlight;
    }
    const refreshBtns = force
      ? ['btn-perp-overview-refresh', 'btn-perp-trade-refresh'].map((id) => $(id)).filter(Boolean)
      : [];
    const prevBtnTexts = refreshBtns.map((b) => b.textContent);
    if (force) {
      refreshBtns.forEach((b) => {
        b.disabled = true;
        b.textContent = t('刷新中...', 'Refreshing...');
      });
    }
    const run = (async () => {
      try {
        const st = getState();
        const hl = getHyperliquid();
        const contracts = getContracts();
        const wallet = st.getActiveWallet();
        if (!hl || !contracts || !wallet) return;
        await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
        const hlAddr = contracts.resolveWalletEvmSender(wallet);
        const refreshWalletId = wallet.id;
        const refreshStale = () => {
          const cur = st.getActiveWallet();
          return !cur || cur.id !== refreshWalletId;
        };
        if ((!st.perp.markets.length || !st.perp.account) && typeof st.loadCachedPerpSnapshot === 'function') {
          st.loadCachedPerpSnapshot(hlAddr);
          renderPerpView();
        }
        const now = Date.now();
        const needMarkets = force || !st.perp.markets.length || (now - st.perp.lastMarketSyncTs > 30_000);
        const [mkts, acct] = await Promise.all([
          needMarkets ? hl.fetchHlMarkets().catch(() => null) : Promise.resolve(null),
          hlAddr ? hl.fetchHlAccountState(hlAddr).catch(() => null) : Promise.resolve(null)
        ]);
        if (refreshStale()) return;
        if (Array.isArray(mkts) && mkts.length > 0) {
          st.perp.markets = mkts;
          st.perp.lastMarketSyncTs = Date.now();
        }
        if (acct) {
          st.perp.account = acct;
          st.perp.lastAccountSyncTs = Date.now();
          _lastHip3SyncAt = Date.now();
        }
        if (typeof st.saveCachedPerpSnapshot === 'function') {
          st.saveCachedPerpSnapshot({
            markets: Array.isArray(mkts) && mkts.length > 0 ? mkts : undefined,
            account: acct || undefined,
            accountAddr: hlAddr
          });
        }
        await refreshPerpOrderbookAndCandlesAsync();
        if (force) {
          showToast(t('合约数据已刷新', 'Perps synced'));
        }
      } catch (err) {
        if (force) {
          showToast(formatPerpError(err, '刷新合约数据失败，请稍后重试', 'Failed to refresh Perps. Please try again.'));
        }
      } finally {
        if (force) {
          refreshBtns.forEach((b, idx) => {
            b.disabled = false;
            b.textContent = prevBtnTexts[idx] || t('刷新', 'Refresh');
          });
        }
      }
    })();

    if (!force) {
      _perpRefreshInFlight = run.finally(() => {
        if (_perpRefreshInFlight === wrapped) _perpRefreshInFlight = null;
      });
      var wrapped = _perpRefreshInFlight;
      return wrapped;
    }
    return run;
  }

  function setPerpSide(side) {
    const st = getState();
    st.perp.side = side === 'short' ? 'short' : 'long';
    st.perp.errorMsg = '';
    if (typeof resetFormFields === 'function') {
      resetFormFields(['perp-tp-input', 'perp-sl-input'], st.perp, { tpInput: '', slInput: '' });
    } else {
      st.perp.tpInput = '';
      st.perp.slInput = '';
    }
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
    if (oType === 'market') {
      st.perp.limitPriceInput = '';
      setInputValIfIdle($('perp-limit-price-input'), '');
    } else if ((oType === 'limit' || oType === 'post_only') && !st.perp.limitPriceInput && market && market.markPx) {
      st.perp.limitPriceInput = String(market.markPx);
      setInputValIfIdle($('perp-limit-price-input'), st.perp.limitPriceInput);
    }
    renderPerpView();
  }

  function resetPerpOrderForm({ clearPrice = true, clearMargin = true, clearTpSl = true } = {}) {
    const st = getState();
    const domIds = [];
    const defaults = { errorMsg: '' };
    if (clearPrice) {
      domIds.push('perp-limit-price-input');
      defaults.limitPriceInput = '';
    }
    if (clearMargin) {
      domIds.push('perp-margin-input');
      defaults.marginInput = '';
      clearPerpPctDots();
    }
    if (clearTpSl) {
      domIds.push('perp-tp-input', 'perp-sl-input', 'perp-reduce-only-chk');
      defaults.tpInput = '';
      defaults.slInput = '';
      defaults.reduceOnly = false;
    }
    resetFormFields(domIds, st.perp, defaults);
    if (typeof updatePerpTpSlEstimateTooltip === 'function') updatePerpTpSlEstimateTooltip(null, false);
    if (typeof syncPerpInputUnitUI === 'function') syncPerpInputUnitUI();
  }

  let _perpOverviewScrollY = 0;

  function readPerpViewportScrollY() {
    if (typeof window === 'undefined') return 0;
    const winY = Number(window.scrollY ?? window.pageYOffset ?? 0);
    if (Number.isFinite(winY) && winY > 0) return winY;
    const docEl = typeof document !== 'undefined' ? document.documentElement : null;
    const bodyEl = typeof document !== 'undefined' ? document.body : null;
    return Number((docEl && docEl.scrollTop) || (bodyEl && bodyEl.scrollTop) || 0) || 0;
  }

  function scrollPerpViewportTo(y) {
    const targetY = Math.max(0, Number(y) || 0);
    const applyScroll = () => {
      if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
        try { window.scrollTo(0, targetY); } catch (_) {}
      }
      if (typeof document !== 'undefined') {
        if (document.documentElement) document.documentElement.scrollTop = targetY;
        if (document.body) document.body.scrollTop = targetY;
        const viewEl = $('view-perps');
        if (viewEl && typeof viewEl.scrollTop === 'number') viewEl.scrollTop = targetY;
        const mainEl = typeof document.querySelector === 'function' ? document.querySelector('.app-main') : null;
        if (mainEl && typeof mainEl.scrollTop === 'number') mainEl.scrollTop = targetY;
      }
    };
    applyScroll();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(applyScroll);
    }
  }

  function backToPerpOverview() {
    const st = getState();
    st.perp.subView = 'overview';
    stopPerpLiveFeed();
    renderPerpView();
    if (_perpOverviewScrollY > 0) {
      scrollPerpViewportTo(_perpOverviewScrollY);
    }
  }

  function openPerpTradeScreen(coin) {
    const st = getState();
    if (st.perp.subView !== 'trade') {
      _perpOverviewScrollY = readPerpViewportScrollY();
    }
    const nextCoin = coin ? String(coin) : (st.perp.selectedCoin || 'BTC');
    const changedCoin = nextCoin !== st.perp.selectedCoin;
    st.perp.selectedCoin = nextCoin;
    st.perp.subView = 'trade';
    resetPerpOrderForm({ clearPrice: true, clearMargin: true, clearTpSl: true });
    const existingPos = st.perp.account && (st.perp.account.positions || []).find((p) => p.coin === nextCoin);
    const mkt = (st.perp.markets || []).find((m) => m.name === nextCoin);
    if (existingPos) {
      if (existingPos.leverageValue) st.perp.leverage = Number(existingPos.leverageValue);
      st.perp.marginMode = existingPos.leverageType === 'cross' && !(mkt && mkt.onlyIsolated) ? 'cross' : 'isolated';
    } else if (mkt && mkt.onlyIsolated) {
      st.perp.marginMode = 'isolated';
    }
    st.perp.inspectedCandleIdx = null;
    st.perp.chartOffsetFromEnd = 0;
    st.perp.chartVisibleCount = 48;
    st.perp.overviewSearch = '';
    if ($('perp-overview-search')) $('perp-overview-search').value = '';
    if ($('perp-overview-search-clear')) $('perp-overview-search-clear').classList.add('hidden');
    if (changedCoin) st.perp.orderbook = null;
    if (typeof st.getCachedPerpCandles === 'function') {
      st.perp.candles = st.getCachedPerpCandles(nextCoin, st.perp.chartInterval || '15m') || [];
    } else if (changedCoin) {
      st.perp.candles = [];
    }
    if (typeof st.loadCachedPerpSnapshot === 'function') {
      st.loadCachedPerpSnapshot();
    }
    renderPerpView();
    scrollPerpViewportTo(0);
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
    startPerpLiveFeed();
  }

  function handlePerpOverviewSearch(val) {
    const st = getState();
    st.perp.overviewSearch = String(val || '');
    renderPerpOverviewPanel();
  }

  function clearPerpOverviewSearch() {
    const st = getState();
    st.perp.overviewSearch = '';
    const inp = $('perp-overview-search');
    if (inp) {
      inp.value = '';
      if (typeof inp.focus === 'function') inp.focus();
    }
    const clr = $('perp-overview-search-clear');
    if (clr) clr.classList.add('hidden');
    renderPerpOverviewPanel();
  }

  function clearPerpMarketSearch() {
    const st = getState();
    st.perp.marketSearch = '';
    const inp = $('perp-market-search');
    if (inp) {
      inp.value = '';
      if (typeof inp.focus === 'function') inp.focus();
    }
    const clr = $('perp-market-search-clear');
    if (clr) clr.classList.add('hidden');
    renderPerpMarketsSheet();
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
    setInputValIfIdle($('perp-limit-price-input'), st.perp.limitPriceInput);
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

  function clearPerpPctDots() {
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('.perp-okx-pct-dots [data-pct]').forEach((dot) => {
        dot.classList.remove('active');
      });
    }
  }

  function handlePerpMarginInput() {
    getState().perp.errorMsg = '';
    clearPerpPctDots();
    evaluatePerpOrderUI();
  }

  function handlePerpLimitPriceInput() {
    getState().perp.errorMsg = '';
    evaluatePerpOrderUI();
  }

  function setPerpMarginPercent(pct) {
    const st = getState();
    const targetPct = Number(pct);
    const updatePctDots = () => {
      if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
        document.querySelectorAll('.perp-okx-pct-dots [data-pct]').forEach((dot) => {
          const dVal = Number(dot.getAttribute('data-pct'));
          dot.classList.toggle('active', Number.isFinite(dVal) && Math.abs(dVal - targetPct) < 0.02);
        });
      }
    };
    if (!Number.isFinite(targetPct) || targetPct <= 0) {
      st.perp.marginInput = '';
      const inp = $('perp-margin-input');
      if (inp) inp.value = '';
      st.perp.errorMsg = '';
      updatePctDots();
      evaluatePerpOrderUI();
      return;
    }
    const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : 0;
    if (avail <= 0) {
      showToast(t('可用保证金为 0，请先充值或从 Spot 划转', 'Available margin is 0; deposit or transfer first'));
      return;
    }
    const lev = Math.max(1, Number(st.perp.leverage) || 5);
    const feeRate = Number(st.perp.account?.takerFeeRate) || 0.00045;
    const maxSafeRatio = targetPct >= 0.99 ? Math.max(0.5, 1 / (1 + lev * feeRate) - 0.005) : targetPct;
    const isCoinMode = (st.perp && st.perp.inputUnit === 'coin');
    let amt = '';
    if (isCoinMode) {
      const market = getSelectedPerpMarket();
      const oType = st.perp.orderType || 'market';
      const isLimitLike = oType === 'limit' || oType === 'post_only';
      const refPx = isLimitLike
        ? (Number(st.perp.limitPriceInput) || Number(market && market.markPx) || 0)
        : Number((market && market.markPx) || 0);
      if (!refPx || refPx <= 0) {
        showToast(t('正在同步市场价格，请稍候', 'Market price loading, please wait'));
        return;
      }
      const rawCoin = Math.max(0, (avail * maxSafeRatio * lev) / refPx);
      const hl = getHyperliquid();
      const szDec = market && Number.isFinite(Number(market.szDecimals)) ? Number(market.szDecimals) : 4;
      const formatted = hl ? hl.formatHlSize(rawCoin, szDec) : (Math.floor(rawCoin * Math.pow(10, szDec)) / Math.pow(10, szDec)).toFixed(szDec);
      amt = Number(formatted) > 0 ? formatted : '';
    } else {
      amt = Math.max(0, avail * maxSafeRatio).toFixed(2);
    }
    st.perp.marginInput = amt;
    setInputValIfIdle($('perp-margin-input'), amt);
    st.perp.errorMsg = '';
    updatePctDots();
    evaluatePerpOrderUI();
  }

  function fillPerpLimitPrice(px) {
    const st = getState();
    if (st.perp.orderType !== 'post_only') {
      st.perp.orderType = 'limit';
      st.perp.tif = 'Gtc';
    }
    st.perp.limitPriceInput = String(px || '');
    setInputValIfIdle($('perp-limit-price-input'), st.perp.limitPriceInput);
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

