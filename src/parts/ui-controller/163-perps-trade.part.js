  async function refreshPerpOrderbookAndCandlesAsync() {
    const st = getState();
    const hl = getHyperliquid();
    if (!hl) return;
    const coin = st.perp.selectedCoin || 'BTC';
    const iv = st.perp.chartInterval || '15m';
    const tasks = [hl.fetchHlOrderbook(coin).catch(() => null)];
    if (st.perp.showChart) tasks.push(hl.fetchHlCandles(coin, iv, 180).catch(() => []));
    const [ob, candles] = await Promise.all(tasks);
    if (st.perp.selectedCoin !== coin) return;
    const ivStillCurrent = (st.perp.chartInterval || '15m') === iv;
    if (ob) st.perp.orderbook = ob;
    if (Array.isArray(candles) && ivStillCurrent) st.perp.candles = candles;
    if (typeof st.saveCachedPerpSnapshot === 'function') {
      st.saveCachedPerpSnapshot({
        candles: Array.isArray(candles) && candles.length > 0 ? candles : undefined,
        candleCoin: coin,
        candleInterval: iv,
        orderbook: ob || undefined,
        orderbookCoin: coin
      });
    }
    renderPerpView();
  }

  function setPerpChartInterval(interval) {
    const st = getState();
    const iv = ['5m', '15m', '1h', '4h', '1d'].includes(String(interval)) ? String(interval) : '15m';
    st.perp.chartInterval = iv;
    st.perp.showChart = true;
    st.perp.inspectedCandleIdx = null;
    st.perp.chartOffsetFromEnd = 0;
    const coin = st.perp.selectedCoin || 'BTC';
    if (typeof st.getCachedPerpCandles === 'function') {
      st.perp.candles = st.getCachedPerpCandles(coin, iv) || [];
    }
    renderPerpView();
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
  }

  let _perpWs = null;
  let _perpWsCoin = '';
  let _perpWsPingTimer = null;
  let _perpWsReconnectTimer = null;
  let _perpWsAttempt = 0;
  let _perpObRenderTs = 0;
  let _perpObRenderTimer = null;
  let _perpObRafId = 0;
  let _perpPollTimer = null;
  let _perpObFallbackTimer = null;
  let _perpObFallbackInFlight = false;
  let _perpFundingTickTimer = null;
  let _perpTradeActionBusy = false;
  let _perpMidsRenderTimer = null;
  let _perpMidsRenderTs = 0;
  let _perpMidsRafId = 0;

  function stopPerpLiveFeed() {
    if (_perpPollTimer) {
      clearInterval(_perpPollTimer);
      _perpPollTimer = null;
    }
    if (_perpObFallbackTimer) {
      clearInterval(_perpObFallbackTimer);
      _perpObFallbackTimer = null;
    }
    _perpObFallbackInFlight = false;
    if (_perpFundingTickTimer) {
      clearInterval(_perpFundingTickTimer);
      _perpFundingTickTimer = null;
    }
    if (_perpWsPingTimer) {
      clearInterval(_perpWsPingTimer);
      _perpWsPingTimer = null;
    }
    if (_perpWsReconnectTimer) {
      clearTimeout(_perpWsReconnectTimer);
      _perpWsReconnectTimer = null;
    }
    if (_perpObRenderTimer) {
      clearTimeout(_perpObRenderTimer);
      _perpObRenderTimer = null;
    }
    if (_perpObRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(_perpObRafId);
      _perpObRafId = 0;
    }
    if (_perpMidsRenderTimer) {
      clearTimeout(_perpMidsRenderTimer);
      _perpMidsRenderTimer = null;
    }
    if (_perpMidsRafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(_perpMidsRafId);
      _perpMidsRafId = 0;
    }
    if (_perpWs) {
      const prev = _perpWs;
      _perpWs = null;
      _perpWsCoin = '';
      try { prev.onclose = null; prev.close(); } catch (_) {}
    }
  }

  function flushAllMidsRender() {
    const m = getSelectedPerpMarket();
    const nextPx = m && Number(m.markPx);
    if (Number.isFinite(nextPx) && nextPx > 0) {
      const fmtPxStr = `$${formatPerpPx(nextPx)}`;
      if ($('perp-mark-px')) $('perp-mark-px').textContent = fmtPxStr;
      if ($('perp-ob-mid-badge')) $('perp-ob-mid-badge').textContent = fmtPxStr;
      evaluatePerpOrderUI(false);
    }
  }

  function scheduleThrottledAllMidsRender() {
    const runFrame = () => {
      if (typeof requestAnimationFrame === 'function') {
        if (_perpMidsRafId) return;
        _perpMidsRafId = requestAnimationFrame(() => {
          _perpMidsRafId = 0;
          _perpMidsRenderTs = Date.now();
          flushAllMidsRender();
        });
      } else {
        _perpMidsRenderTs = Date.now();
        flushAllMidsRender();
      }
    };
    const now = Date.now();
    const elapsed = now - _perpMidsRenderTs;
    if (elapsed >= 150) {
      if (_perpMidsRenderTimer) {
        clearTimeout(_perpMidsRenderTimer);
        _perpMidsRenderTimer = null;
      }
      runFrame();
      return;
    }
    if (_perpMidsRenderTimer) return;
    _perpMidsRenderTimer = setTimeout(() => {
      _perpMidsRenderTimer = null;
      runFrame();
    }, Math.max(20, 150 - elapsed));
    if (_perpMidsRenderTimer && typeof _perpMidsRenderTimer.unref === 'function') {
      _perpMidsRenderTimer.unref();
    }
  }

  function flushOrderbookRenderRaf() {
    if (typeof requestAnimationFrame === 'function') {
      if (_perpObRafId) return;
      _perpObRafId = requestAnimationFrame(() => {
        _perpObRafId = 0;
        renderPerpOrderbook();
      });
    } else {
      renderPerpOrderbook();
    }
  }

  function scheduleThrottledOrderbookRender() {
    const now = Date.now();
    if (now - _perpObRenderTs >= 100) {
      _perpObRenderTs = now;
      flushOrderbookRenderRaf();
      return;
    }
    if (_perpObRenderTimer) return;
    _perpObRenderTimer = setTimeout(() => {
      _perpObRenderTimer = null;
      _perpObRenderTs = Date.now();
      flushOrderbookRenderRaf();
    }, Math.max(20, 100 - (now - _perpObRenderTs)));
  }

  function startPerpLiveFeed() {
    stopPerpLiveFeed();
    const st = getState();
    if (st.activeTab !== 'perp' || st.perp.subView !== 'trade') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (typeof isAppInBackground === 'function' && isAppInBackground()) return;
    const coin = st.perp.selectedCoin || 'BTC';
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const hlAddr = wallet && contracts && typeof contracts.resolveWalletEvmSender === 'function'
      ? contracts.resolveWalletEvmSender(wallet)
      : '';

    const connectWs = () => {
      if (typeof WebSocket !== 'function') return;
      const curSt = getState();
      if (curSt.activeTab !== 'perp' || curSt.perp.subView !== 'trade') return;
      try {
        const ws = new WebSocket('wss://api.hyperliquid.xyz/ws');
        _perpWs = ws;
        _perpWsCoin = coin;
        ws.onopen = () => {
          if (_perpWs !== ws) return;
          _perpWsAttempt = 0;
          try {
            ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'l2Book', coin } }));
            ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'allMids' } }));
            if (hlAddr) {
              ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'webData2', user: hlAddr } }));
            }
          } catch (_) {}
          if (_perpWsPingTimer) clearInterval(_perpWsPingTimer);
          _perpWsPingTimer = setInterval(() => {
            if (_perpWs === ws && ws.readyState === 1) {
              try { ws.send(JSON.stringify({ method: 'ping' })); } catch (_) {}
            }
          }, 25_000);
          if (_perpWsPingTimer && typeof _perpWsPingTimer.unref === 'function') _perpWsPingTimer.unref();
        };
        ws.onmessage = (evt) => {
          const s = getState();
          if (s.activeTab !== 'perp' || s.perp.subView !== 'trade') {
            stopPerpLiveFeed();
            return;
          }
          try {
            const msg = JSON.parse(evt.data);
            if (msg && msg.channel === 'l2Book' && msg.data && msg.data.coin === s.perp.selectedCoin && Array.isArray(msg.data.levels)) {
              const mapLvl = (r) => ({ px: Number(r.px), sz: Number(r.sz), n: Number(r.n) || 1 });
              const bids = (msg.data.levels[0] || []).slice(0, 12).map(mapLvl);
              const asks = (msg.data.levels[1] || []).slice(0, 12).map(mapLvl);
              const bidTotalSz = bids.reduce((sum, r) => sum + r.sz, 0);
              const askTotalSz = asks.reduce((sum, r) => sum + r.sz, 0);
              const tot = bidTotalSz + askTotalSz;
              s.perp.orderbook = {
                bids,
                asks,
                bidTotalSz,
                askTotalSz,
                bidRatioPct: tot > 0 ? Math.round((bidTotalSz / tot) * 100) : 50
              };
              scheduleThrottledOrderbookRender();
            } else if (msg && msg.channel === 'allMids' && msg.data && msg.data.mids) {
              const m = getSelectedPerpMarket();
              const nextPx = Number(msg.data.mids[s.perp.selectedCoin]);
              if (m && Number.isFinite(nextPx) && nextPx > 0) {
                m.markPx = nextPx;
                scheduleThrottledAllMidsRender();
              }
            } else if (msg && msg.channel === 'webData2' && msg.data) {
              const curW = s.getActiveWallet();
              const curAddr = curW && contracts && typeof contracts.resolveWalletEvmSender === 'function'
                ? contracts.resolveWalletEvmSender(curW)
                : '';
              const msgUser = String(msg.data.user || '').toLowerCase();
              if (!curAddr || String(curAddr).toLowerCase() !== String(hlAddr || '').toLowerCase()
                || (msgUser && msgUser !== String(hlAddr || '').toLowerCase())) {
                return;
              }
              const hl = getHyperliquid();
              const ch = msg.data.clearinghouseState;
              const prevAcct = s.perp.account || {};
              const prevHip3Orders = Array.isArray(prevAcct.openOrders)
                ? prevAcct.openOrders.filter((o) => o && String(o.coin || '').includes(':'))
                : [];
              const incomingOrders = Array.isArray(msg.data.openOrders) ? msg.data.openOrders : null;
              const mergedOrders = incomingOrders !== null
                ? [...incomingOrders, ...prevHip3Orders]
                : (Array.isArray(prevAcct.openOrders) ? prevAcct.openOrders : []);
              if (ch && hl && typeof hl.parseHlClearinghouseState === 'function') {
                const nextAcct = hl.parseHlClearinghouseState(ch, mergedOrders);
                const mainPositions = Array.isArray(nextAcct.positions) ? nextAcct.positions : [];
                const mainCoins = new Set(mainPositions.map((p) => String(p && p.coin || '')));
                const hip3Positions = Array.isArray(prevAcct.positions)
                  ? prevAcct.positions.filter((p) => p && String(p.coin || '').includes(':') && !mainCoins.has(String(p.coin || '')))
                  : [];
                const mergedPositions = [...mainPositions, ...hip3Positions];
                if (typeof hl.attachTpslOrdersToPositions === 'function') {
                  hl.attachTpslOrdersToPositions(mergedPositions, nextAcct.openOrders || mergedOrders);
                }
                s.perp.account = {
                  ...prevAcct,
                  ...nextAcct,
                  positions: mergedPositions,
                  openOrders: nextAcct.openOrders || mergedOrders
                };
                if (hip3Positions.length > 0 && (Date.now() - _lastHip3SyncAt > 15_000)) {
                  _lastHip3SyncAt = Date.now();
                  refreshPerpDataAsync(false).catch(() => {});
                }
              } else if (incomingOrders !== null) {
                const positions = Array.isArray(prevAcct.positions) ? prevAcct.positions.map((p) => ({ ...p })) : [];
                if (hl && typeof hl.attachTpslOrdersToPositions === 'function') {
                  hl.attachTpslOrdersToPositions(positions, mergedOrders);
                }
                s.perp.account = { ...prevAcct, positions, openOrders: mergedOrders };
              }
              if (typeof renderPerpBottomList === 'function') renderPerpBottomList();
              evaluatePerpOrderUI(false);
            }
          } catch (_) {}
        };
        ws.onerror = () => {};
        ws.onclose = () => {
          if (_perpWsPingTimer) { clearInterval(_perpWsPingTimer); _perpWsPingTimer = null; }
          if (_perpWs === ws) {
            _perpWs = null;
            const s = getState();
            const bg = (typeof document !== 'undefined' && document.hidden) || (typeof isAppInBackground === 'function' && isAppInBackground());
            if (s.activeTab === 'perp' && s.perp.subView === 'trade' && !bg) {
              const delay = Math.min(15_000, 1500 * Math.pow(2, Math.min(3, _perpWsAttempt++)));
              _perpWsReconnectTimer = setTimeout(connectWs, delay);
              if (_perpWsReconnectTimer && typeof _perpWsReconnectTimer.unref === 'function') _perpWsReconnectTimer.unref();
            }
          }
        };
      } catch (_) {}
    };

    connectWs();

    const isPerpTradeActive = () => {
      const curSt = getState();
      if (curSt.activeTab !== 'perp' || curSt.perp.subView !== 'trade') {
        stopPerpLiveFeed();
        return false;
      }
      if (typeof document !== 'undefined' && document.hidden) return false;
      if (typeof isAppInBackground === 'function' && isAppInBackground()) return false;
      return true;
    };

    if (typeof updatePerpFundingCountdown === 'function') updatePerpFundingCountdown();
    _perpFundingTickTimer = setInterval(() => {
      if (!isPerpTradeActive()) return;
      if (typeof updatePerpFundingCountdown === 'function') updatePerpFundingCountdown();
    }, 1000);
    if (_perpFundingTickTimer && typeof _perpFundingTickTimer.unref === 'function') _perpFundingTickTimer.unref();

    _perpObFallbackTimer = setInterval(async () => {
      if (!isPerpTradeActive()) return;
      if (_perpWs && _perpWs.readyState === 1) return;
      if (_perpObFallbackInFlight) return;
      const hl = getHyperliquid();
      if (!hl || typeof hl.fetchHlOrderbook !== 'function') return;
      const targetCoin = getState().perp.selectedCoin || coin;
      _perpObFallbackInFlight = true;
      try {
        const ob = await hl.fetchHlOrderbook(targetCoin).catch(() => null);
        const latestSt = getState();
        if (ob && latestSt.perp && latestSt.perp.selectedCoin === targetCoin) {
          latestSt.perp.orderbook = ob;
          flushOrderbookRenderRaf();
        }
      } finally {
        _perpObFallbackInFlight = false;
      }
    }, 1500);
    if (_perpObFallbackTimer && typeof _perpObFallbackTimer.unref === 'function') _perpObFallbackTimer.unref();

    _perpPollTimer = setInterval(() => {
      if (!isPerpTradeActive()) return;
      if (typeof updatePerpFundingCountdown === 'function') updatePerpFundingCountdown();
      if (!_perpWs || _perpWs.readyState !== 1) {
        refreshPerpOrderbookAndCandlesAsync().catch(() => {});
        refreshPerpDataAsync(false).catch(() => {});
      }
    }, 4500);
    if (_perpPollTimer && typeof _perpPollTimer.unref === 'function') _perpPollTimer.unref();
  }

  function pausePerpRealtime() {
    stopPerpLiveFeed();
  }

  function resumePerpRealtime() {
    const st = getState();
    if (!st || st.activeTab !== 'perp' || st.perp.subView !== 'trade') return;
    if (typeof isAppInBackground === 'function' && isAppInBackground()) return;
    startPerpLiveFeed();
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
    refreshPerpDataAsync(false).catch(() => {});
  }

  function isPerpActionBusy() {
    const st = getState();
    return Boolean((st && st.perp && st.perp.submitting) || _perpTradeActionBusy || _perpBatchBusy);
  }

  function formatPerpError(err, fallbackZh = '操作失败，请稍后重试', fallbackEn = 'Operation failed. Please try again.') {
    const contracts = getContracts();
    let msg = contracts && typeof contracts.toUserFriendlyError === 'function'
      ? contracts.toUserFriendlyError(err, fallbackZh, fallbackEn)
      : t(fallbackZh, fallbackEn);
    msg = String(msg || '')
      .replace(/\bHyperliquid\s*(?:info\s*)?API\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return msg || t(fallbackZh, fallbackEn);
  }

  function renderPerpMarketsSheet() {
    const st = getState();
    const tokens = getTokens();
    const hl = getHyperliquid();
    const listEl = $('perp-market-list');
    if (!listEl) return;
    const q = String($('perp-market-search')?.value || st.perp.marketSearch || '').trim().toUpperCase();
    st.perp.marketSearch = q;
    const mktClr = $('perp-market-search-clear');
    if (mktClr) mktClr.classList.toggle('hidden', q.length === 0);
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

    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const favList = getPerpFavoriteCoins();
    const favsExact = new Set(favList);
    const favsUpper = new Set(favList.map((x) => String(x || '').toUpperCase()));
    if (fw && typeof fw.mountPerpMarketsSheetPanel === 'function') {
      const vmRows = filtered.slice(0, 120).map((m) => {
        const vol = Number(m.dayNtlVlm || 0);
        const volText = vol >= 1e9 ? `$${(vol / 1e9).toFixed(2)}B` : (vol >= 1e6 ? `$${(vol / 1e6).toFixed(2)}M` : (vol >= 1e3 ? `$${(vol / 1e3).toFixed(1)}K` : `$${vol.toFixed(0)}`));
        const dexTag = m.dex ? String(m.dex).toUpperCase() : (typeof extractPerpDexBadge === 'function' ? extractPerpDexBadge(m.name) : '');
        const coinKey = String(m.name || '');
        return {
          ...m,
          pair: m.pairLabel || formatPerpDisplayPair(m.name),
          dexTag,
          volText: `${t('24h量', '24h Vol')} ${volText}`,
          isFav: favsExact.has(coinKey) || favsUpper.has(coinKey.toUpperCase())
        };
      });
      fw.mountPerpMarketsSheetPanel(listEl, {
        markets: vmRows,
        selectedCoin: st.perp.selectedCoin || 'BTC',
        emptyText: t('未找到匹配市场', 'No matching market'),
        isEn: st.lang === 'en',
        formatPerpPx
      });
    } else {
      const html = filtered.slice(0, 120).map((m) => {
        const pair = m.pairLabel || formatPerpDisplayPair(m.name);
        return `<div class="perp-mkt-row" data-perp-coin="${escapeHtml(m.name)}">${escapeHtml(pair)}</div>`;
      }).join('');
      setHtmlIfChanged(listEl, html);
    }
  }

  function openPerpMarketsSheet() {
    const st = getState();
    st.perp.marketSearch = '';
    if ($('perp-market-search')) $('perp-market-search').value = '';
    if ($('perp-market-search-clear')) $('perp-market-search-clear').classList.add('hidden');
    renderPerpMarketsSheet();
    openSheet('sheet-perp-markets');
    if (!getState().perp.markets.length) refreshPerpDataAsync(false).then(() => renderPerpMarketsSheet()).catch(() => {});
  }

  function selectPerpMarket(coin) {
    const st = getState();
    const nextCoin = String(coin || 'BTC');
    const changedCoin = nextCoin !== st.perp.selectedCoin;
    st.perp.selectedCoin = nextCoin;
    st.perp.subView = 'trade';
    resetPerpOrderForm({ clearPrice: true, clearMargin: true, clearTpSl: true });
    st.perp.inspectedCandleIdx = null;
    st.perp.chartOffsetFromEnd = 0;
    st.perp.chartVisibleCount = 48;
    st.perp.marketSearch = '';
    if ($('perp-market-search')) $('perp-market-search').value = '';
    if ($('perp-market-search-clear')) $('perp-market-search-clear').classList.add('hidden');
    if (changedCoin) st.perp.orderbook = null;
    if (typeof st.getCachedPerpCandles === 'function') {
      st.perp.candles = st.getCachedPerpCandles(nextCoin, st.perp.chartInterval || '15m') || [];
    } else if (changedCoin) {
      st.perp.candles = [];
    }
    if (typeof st.loadCachedPerpSnapshot === 'function') {
      st.loadCachedPerpSnapshot();
    }
    const existingPos = st.perp.account && Array.isArray(st.perp.account.positions)
      ? st.perp.account.positions.find((p) => p.coin === nextCoin)
      : null;
    if (existingPos) {
      if (existingPos.leverageType === 'cross' || existingPos.leverageType === 'isolated') {
        st.perp.marginMode = existingPos.leverageType;
      }
      if (Number(existingPos.leverageValue) >= 1) {
        st.perp.leverage = Math.round(Number(existingPos.leverageValue));
      }
    }
    closeAllSheets();
    renderPerpView();
    startPerpLiveFeed();
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
  }

  async function submitPerpOrderWithSide(side) {
    const st = getState();
    st.perp.side = side === 'short' ? 'short' : 'long';
    evaluatePerpOrderUI(true);
    return executePerpOrderUI();
  }

  async function executePerpOrderUI() {
    if (isPerpActionBusy()) return;
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
    const isBuy = st.perp.side === 'long';
    const oTypeVal = st.perp.orderType || 'market';
    const isLimitOrder = oTypeVal === 'limit' || oTypeVal === 'post_only';
    const refPx = isLimitOrder ? (Number(st.perp.limitPriceInput) || Number(market.markPx) || 0) : (Number(market.markPx) || 0);
    const tpNum = st.perp.tpInput ? Number(st.perp.tpInput) : null;
    const slNum = st.perp.slInput ? Number(st.perp.slInput) : null;
    if (!st.perp.reduceOnly && refPx > 0) {
      if (tpNum && ((isBuy && tpNum <= refPx) || (!isBuy && tpNum >= refPx))) {
        showToast(t('止盈价方向有误（多单需高于开仓价，空单需低于开仓价）', 'Invalid TP price direction for position side'));
        return;
      }
      if (slNum && ((isBuy && slNum >= refPx) || (!isBuy && slNum <= refPx))) {
        showToast(t('止损价方向有误（多单需低于开仓价，空单需高于开仓价）', 'Invalid SL price direction for position side'));
        return;
      }
    }
    const sideLabel = isBuy ? t('做多', 'Long') : t('做空', 'Short');
    const confirmLabel = `${t('确认合约下单', 'Confirm Perp Order')}: ${sideLabel} ${formatPerpDisplayPair(market.name)} ${st.perp.leverage}x · ${evalRes.sizeNum}`;
    const orderTypeLabel = isLimitOrder
      ? (oTypeVal === 'post_only' ? t('只做 Maker', 'Post Only') : t('限价', 'Limit'))
      : t('市价', 'Market');
    const orderSteps = [{ title: t('签名并提交合约委托', 'Sign & submit perp order'), chain: 'hype' }];
    const orderPreview = {
      title: t('确认合约下单', 'Confirm Perp Order'),
      subtitle: `${formatPerpDisplayPair(market.name)} · ${sideLabel} ${st.perp.leverage}x`,
      networkPath: 'Hyperliquid',
      detailRows: [
        { label: t('方向', 'Side'), value: sideLabel, tone: isBuy ? 'emerald' : 'rose' },
        { label: t('委托类型', 'Order Type'), value: orderTypeLabel },
        { label: t('委托数量', 'Size'), value: `${evalRes.sizeNum} ${formatPerpBaseSymbol(market.name)}`, mono: true },
        { label: t('参考价格', 'Price'), value: refPx > 0 ? `$${formatPerpPx(refPx)}` : t('市价', 'Market'), mono: true },
        { label: t('杠杆与模式', 'Leverage'), value: `${st.perp.leverage}x (${st.perp.marginMode === 'isolated' ? t('逐仓', 'Isolated') : t('全仓', 'Cross')})` },
        ...(evalRes.marginNeeded > 0 ? [{ label: t('预计保证金', 'Est. Margin'), value: `$${Number(evalRes.marginNeeded).toFixed(2)} USDC`, mono: true }] : []),
        ...(!st.perp.reduceOnly && tpNum ? [{ label: t('止盈价', 'Take Profit'), value: `$${formatPerpPx(tpNum)}`, mono: true, tone: 'emerald' }] : []),
        ...(!st.perp.reduceOnly && slNum ? [{ label: t('止损价', 'Stop Loss'), value: `$${formatPerpPx(slNum)}`, mono: true, tone: 'rose' }] : [])
      ],
      confirmLabel: t('确认下单', 'Confirm Order'),
      steps: orderSteps
    };
    st.perp.submitting = true;
    st.perp.errorMsg = '';
    renderPerpView();
    let stepper = null;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(orderPreview))) return;
      if (!(await verifySecurityAuthAsync(wallet, confirmLabel))) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在提交合约委托', 'Submitting Perp Order'), orderSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      await ensureEthersLoaded();
      const oType = st.perp.orderType || 'market';
      const tif = st.perp.tif || (oType === 'post_only' ? 'Alo' : (oType === 'limit' ? 'Gtc' : 'Ioc'));
      const isLimitLike = oType === 'limit' || oType === 'post_only';
      const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : null;
      const openPos = st.perp.account && (st.perp.account.positions || []).find((p) => p.coin === market.name);
      const levUnchanged = openPos && Number(openPos.leverageValue) === Number(st.perp.leverage) && openPos.leverageType === st.perp.marginMode;
      const orderRes = await hl.placeHlPerpOrder({
        wallet,
        market,
        isBuy,
        size: evalRes.sizeNum,
        orderType: oType,
        tif,
        limitPrice: isLimitLike ? Number(st.perp.limitPriceInput) : null,
        reduceOnly: Boolean(st.perp.reduceOnly),
        leverage: levUnchanged ? null : st.perp.leverage,
        currentLeverage: openPos ? Number(openPos.leverageValue) || null : null,
        isCross: st.perp.marginMode === 'cross',
        tpPrice: tpNum,
        slPrice: slNum,
        availableMargin: avail
      });
      if (orderRes && orderRes.partialTpslError) {
        const safeTpslErr = formatPerpError(orderRes.partialTpslError, '止盈止损设置失败', 'TP/SL setup failed');
        const warnMsg = t(
          `主单已成交/挂单，但止盈止损设置失败 (${safeTpslErr})，请在下方持仓卡片重设 TP/SL`,
          `Main order submitted, but TP/SL failed (${safeTpslErr}). Please reset TP/SL on the position card below.`
        );
        if (stepper) {
          stepper.setStep(0, 'done', { txHash: (orderRes && orderRes.txHash) || '', chain: 'hype' });
          stepper.finish(true, warnMsg);
        }
        resetPerpOrderForm({ clearPrice: true, clearMargin: true, clearTpSl: true });
        showToast(`⚠️ ${warnMsg}`);
        await refreshPerpDataAsync(false).catch(() => {});
      } else {
        if (stepper) {
          stepper.setStep(0, 'done', { txHash: (orderRes && orderRes.txHash) || '', chain: 'hype' });
          stepper.finish(true, t('合约委托已提交', 'Perp order submitted'));
        }
        resetPerpOrderForm({ clearPrice: true, clearMargin: true, clearTpSl: true });
        showToast(`✅ ${t('合约委托已提交', 'Perp order submitted')}`);
        await refreshPerpDataAsync(false).catch(() => {});
      }
    } catch (err) {
      const rawMsg = (err && err.message) || '';
      st.perp.errorMsg = /does not exist/i.test(rawMsg)
        ? t('合约账户尚未激活，请先充值 USDC', 'Perp account not activated; please deposit USDC first')
        : formatPerpError(err, '下单失败，请稍后重试', 'Order failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: st.perp.errorMsg });
        stepper.finish(false, st.perp.errorMsg);
      }
      showToast(st.perp.errorMsg);
    } finally {
      st.perp.submitting = false;
      renderPerpView();
    }
  }

  async function closePerpPositionUI(coin) {
    if (isPerpActionBusy()) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin) return;
    const pos = st.perp.account && (st.perp.account.positions || []).find((p) => p.coin === coin);
    let market = (st.perp.markets || []).find((m) => m.name === coin);
    if (!pos) return;
    const closeSteps = [{ title: t('市价平仓委托', 'Submit market close order'), chain: 'hype' }];
    const pnlVal = Number(pos.unrealizedPnl);
    const closePreview = {
      title: t('确认市价平仓', 'Confirm Market Close'),
      subtitle: `${formatPerpDisplayPair(coin)} · ${pos.isLong ? t('平多', 'Close Long') : t('平空', 'Close Short')}`,
      networkPath: 'Hyperliquid',
      detailRows: [
        { label: t('仓位数量', 'Position Size'), value: `${Math.abs(Number(pos.szi || 0))} ${formatPerpBaseSymbol(coin)}`, mono: true },
        { label: t('开仓均价', 'Entry Price'), value: pos.entryPx ? `$${formatPerpPx(pos.entryPx)}` : '--', mono: true },
        { label: t('未实现盈亏', 'Unrealized PnL'), value: Number.isFinite(pnlVal) ? `${pnlVal >= 0 ? '+' : ''}$${pnlVal.toFixed(2)}` : '--', mono: true, tone: pnlVal >= 0 ? 'emerald' : 'rose' }
      ],
      confirmLabel: t('确认平仓', 'Close Position'),
      steps: closeSteps
    };
    const myBusyKey = `close:${coin}`;
    _perpTradeActionBusy = true;
    st.perp.actionBusyKey = myBusyKey;
    renderPerpBottomList();
    let stepper = null;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(closePreview))) return;
      if (!(await verifySecurityAuthAsync(wallet, `${t('确认市价平仓', 'Confirm Market Close')}: ${formatPerpDisplayPair(coin)}`))) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在市价平仓', 'Closing Position'), closeSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      await ensureEthersLoaded();
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      const closeRes = await hl.closeHlPositionMarket({ wallet, market, position: pos });
      if (stepper) {
        stepper.setStep(0, 'done', { txHash: (closeRes && closeRes.txHash) || '', chain: 'hype' });
        stepper.finish(true, `${formatPerpDisplayPair(coin)} ${t('已市价平仓', 'position closed')}`);
      }
      showToast(`✅ ${formatPerpDisplayPair(coin)} ${t('已市价平仓', 'position closed')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      const msg = formatPerpError(err, '平仓失败，请稍后重试', 'Close failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: msg });
        stepper.finish(false, msg);
      }
      showToast(msg);
    } finally {
      _perpTradeActionBusy = false;
      if (st.perp.actionBusyKey === myBusyKey) st.perp.actionBusyKey = '';
      renderPerpBottomList();
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
    if (isPerpActionBusy()) return;
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
    let market = (st.perp.markets || []).find((m) => m.name === coin);
    const refMark = Number((market && market.markPx) || pos.entryPx || 0);
    if (!clearOnly && refMark > 0) {
      if (tpPrice && ((pos.isLong && tpPrice <= refMark) || (!pos.isLong && tpPrice >= refMark))) {
        showToast(t('止盈价方向有误（多单需高于当前价，空单需低于当前价）', 'Invalid TP price direction'));
        return;
      }
      if (slPrice && ((pos.isLong && slPrice >= refMark) || (!pos.isLong && slPrice <= refMark))) {
        showToast(t('止损价方向有误（多单需低于当前价，空单需高于当前价）', 'Invalid SL price direction'));
        return;
      }
    }
    _perpTradeActionBusy = true;
    const btn = $('btn-perp-tpsl-save');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = t('提交中...', 'Saving...'); }
    try {
      if (!(await verifySecurityAuthAsync(wallet, `${clearOnly ? t('清除止盈止损', 'Clear TP/SL') : t('更新止盈止损', 'Update TP/SL')}: ${formatPerpDisplayPair(coin)}`))) return;
      await ensureEthersLoaded();
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
      showToast(formatPerpError(err, '更新止盈止损失败，请稍后重试', 'TP/SL update failed. Please try again.'));
    } finally {
      _perpTradeActionBusy = false;
      if (btn) { btn.disabled = false; btn.textContent = prevTxt; }
    }
  }

  async function reversePerpPositionUI(coin) {
    if (isPerpActionBusy()) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin) return;
    const pos = st.perp.account && (st.perp.account.positions || []).find((p) => p.coin === coin);
    if (!pos) return;
    const reverseSteps = [{ title: t('市价平仓并反向开仓', 'Close current & open reverse position'), chain: 'hype' }];
    const reversePreview = {
      title: t('确认反手开仓', 'Confirm Reverse Position'),
      subtitle: `${formatPerpDisplayPair(coin)} · ${pos.isLong ? t('多转空', 'Long → Short') : t('空转多', 'Short → Long')}`,
      networkPath: 'Hyperliquid',
      detailRows: [
        { label: t('反手数量', 'Reverse Size'), value: `${Math.abs(Number(pos.szi || 0))} ${formatPerpBaseSymbol(coin)}`, mono: true },
        { label: t('杠杆倍数', 'Leverage'), value: `${pos.leverageValue || '--'}x` }
      ],
      confirmLabel: t('确认反手', 'Reverse Position'),
      steps: reverseSteps
    };
    const myBusyKey = `reverse:${coin}`;
    _perpTradeActionBusy = true;
    st.perp.actionBusyKey = myBusyKey;
    renderPerpBottomList();
    let stepper = null;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(reversePreview))) return;
      if (!(await verifySecurityAuthAsync(wallet, `${t('确认反手开仓', 'Confirm Reverse Position')}: ${formatPerpDisplayPair(coin)}`))) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在反手开仓', 'Reversing Position'), reverseSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      await ensureEthersLoaded();
      let market = (st.perp.markets || []).find((m) => m.name === coin);
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      const avail = st.perp.account ? Number(st.perp.account.availableMargin || 0) : null;
      const revRes = await hl.reverseHlPositionMarket({ wallet, market, position: pos, availableMargin: avail });
      if (stepper) {
        stepper.setStep(0, 'done', { txHash: (revRes && revRes.txHash) || '', chain: 'hype' });
        stepper.finish(true, `${formatPerpDisplayPair(coin)} ${t('已反手开仓', 'position reversed')}`);
      }
      showToast(`✅ ${formatPerpDisplayPair(coin)} ${t('已反手开仓', 'position reversed')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      const msg = formatPerpError(err, '反手开仓失败，请稍后重试', 'Reverse failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: msg });
        stepper.finish(false, msg);
      }
      showToast(msg);
    } finally {
      _perpTradeActionBusy = false;
      if (st.perp.actionBusyKey === myBusyKey) st.perp.actionBusyKey = '';
      renderPerpBottomList();
    }
  }

  let _perpBatchBusy = false;

  async function executePerpBatchAction() {
    if (isPerpActionBusy()) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    const acct = st.perp && st.perp.account;
    if (!hl || !wallet || !acct) return;
    const tab = st.perp.bottomTab || 'positions';
    const positions = acct.positions || [];
    const openOrders = acct.openOrders || [];
    const targetCount = tab === 'orders' ? openOrders.length : positions.length;
    if (targetCount === 0) return;
    const actionLabel = tab === 'orders' ? t('确认撤销全部委托', 'Confirm Cancel All Orders') : t('确认一键全平所有仓位', 'Confirm Close All Positions');
    const confirmMsg = tab === 'orders'
      ? t(`确定要撤销当前全部 ${targetCount} 笔挂单委托吗？此操作不可撤销。`, `Cancel all ${targetCount} open orders? This cannot be undone.`)
      : t(`确定要按市价立即平掉全部 ${targetCount} 个持仓吗？此操作不可撤销。`, `Market close all ${targetCount} open positions? This cannot be undone.`);
    const myBusyKey = 'batch';
    _perpBatchBusy = true;
    st.perp.actionBusyKey = myBusyKey;
    renderPerpBottomList();
    try {
      if (typeof showConfirmDialogAsync === 'function') {
        const confirmed = await showConfirmDialogAsync(confirmMsg, {
          title: actionLabel,
          danger: true,
          confirmText: tab === 'orders' ? t('全部撤单', 'Cancel All') : t('一键全平', 'Close All')
        });
        if (!confirmed) return;
      }
      if (!(await verifySecurityAuthAsync(wallet, actionLabel))) return;
      await ensureEthersLoaded();
      const missingCoin = tab !== 'orders' && positions.some((pos) => !(st.perp.markets || []).some((m) => m.name === pos.coin));
      if ((!st.perp.markets || st.perp.markets.length === 0 || missingCoin) && typeof hl.fetchHlMarkets === 'function') {
        st.perp.markets = await hl.fetchHlMarkets();
      }
      if (tab === 'orders') {
        if (!acct.openOrders || acct.openOrders.length === 0) return;
        await hl.cancelAllHlOrders({ wallet, openOrders: acct.openOrders, markets: st.perp.markets || [] });
        showToast(`✅ ${t('已撤销全部委托', 'All orders cancelled')}`);
      } else {
        const positions = acct.positions || [];
        if (positions.length === 0) return;
        let closedCount = 0;
        let lastErr = null;
        for (const pos of positions) {
          const market = (st.perp.markets || []).find((m) => m.name === pos.coin);
          if (!market) {
            lastErr = new Error(t(`未找到 ${pos.coin} 合约市场`, `Market metadata unavailable for ${pos.coin}`));
            continue;
          }
          try {
            await hl.closeHlPositionMarket({ wallet, market, position: pos });
            closedCount += 1;
          } catch (e) {
            lastErr = e;
          }
        }
        if (closedCount === positions.length) {
          showToast(`✅ ${t('已全部市价平仓', 'All positions closed')}`);
        } else {
          const errHint = lastErr ? `: ${formatPerpError(lastErr, '部分仓位平仓失败', 'Some positions failed to close')}` : '';
          showToast(t(`已平仓 ${closedCount}/${positions.length} 个仓位`, `Closed ${closedCount}/${positions.length} positions`) + errHint);
        }
      }
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast(formatPerpError(err, '批量操作失败，请稍后重试', 'Batch action failed. Please try again.'));
    } finally {
      _perpBatchBusy = false;
      if (st.perp.actionBusyKey === myBusyKey) st.perp.actionBusyKey = '';
      renderPerpBottomList();
    }
  }

  async function cancelPerpOrderUI(coin, oid) {
    if (isPerpActionBusy()) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin || !oid) return;
    const cancelSteps = [{ title: t('提交撤销合约挂单', 'Submit perp order cancellation'), chain: 'hype' }];
    const cancelPreview = {
      title: t('确认撤销合约挂单', 'Confirm Cancel Perp Order'),
      subtitle: `${formatPerpDisplayPair(coin)} · #${oid}`,
      networkPath: 'Hyperliquid',
      detailRows: [
        { label: t('合约币种', 'Contract'), value: formatPerpDisplayPair(coin), mono: true },
        { label: t('委托编号', 'Order ID'), value: `#${oid}`, mono: true }
      ],
      confirmLabel: t('确认撤单', 'Cancel Order'),
      steps: cancelSteps
    };
    const myBusyKey = `cancel:${coin}:${oid}`;
    _perpTradeActionBusy = true;
    st.perp.actionBusyKey = myBusyKey;
    renderPerpBottomList();
    let market = (st.perp.markets || []).find((m) => m.name === coin);
    let stepper = null;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(cancelPreview))) return;
      if (!(await verifySecurityAuthAsync(wallet, `${t('撤销合约挂单', 'Cancel perp order')} ${coin} #${oid}`))) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在撤单', 'Cancelling Order'), cancelSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      await ensureEthersLoaded();
      if (!market) {
        const mkts = await hl.fetchHlMarkets();
        st.perp.markets = mkts;
        market = mkts.find((m) => m.name === coin);
      }
      if (!market) throw new Error(t('未找到对应合约市场', 'Market metadata unavailable'));
      const cancelRes = await hl.cancelHlOrder({ wallet, assetIndex: market.index, oid: Number(oid) });
      if (stepper) {
        stepper.setStep(0, 'done', { txHash: (cancelRes && cancelRes.txHash) || '', chain: 'hype' });
        stepper.finish(true, t('已撤单', 'Order cancelled'));
      }
      showToast(t('已撤单', 'Order cancelled'));
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      const errMsg = formatPerpError(err, '撤单失败，请稍后重试', 'Cancel failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: errMsg });
        stepper.finish(false, errMsg);
      }
      showToast(errMsg);
    } finally {
      _perpTradeActionBusy = false;
      if (st.perp.actionBusyKey === myBusyKey) st.perp.actionBusyKey = '';
      renderPerpBottomList();
    }
  }

  async function quickTransferSpotToPerpUI(triggerEl = null) {
    if (isPerpActionBusy()) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !st.perp.account) return;
    const amt = Number(st.perp.account.spotUsdc || 0);
    if (amt <= 0) return;
    const transferSteps = [{ title: t('划转 Spot USDC 至合约账户', 'Transfer Spot USDC to Perp'), chain: 'hype' }];
    const transferPreview = {
      title: t('确认现货划转至合约', 'Confirm Spot to Perp Transfer'),
      subtitle: `${formatBal(amt, 4)} USDC`,
      networkPath: 'Hyperliquid Spot → Perp',
      detailRows: [
        { label: t('划转数量', 'Amount'), value: `${formatBal(amt, 4)} USDC`, mono: true, tone: 'emerald' },
        { label: t('目标账户', 'Destination'), value: 'Hyperliquid Perps', mono: true }
      ],
      confirmLabel: t('确认划转', 'Transfer to Perp'),
      steps: transferSteps
    };
    _perpTradeActionBusy = true;
    const btns = triggerEl && typeof triggerEl.closest === 'function'
      ? [triggerEl.closest('button') || triggerEl]
      : (typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll('#perp-spot-banner button, #perp-wd-spot-banner button'))
        : []);
    const prevStates = btns.map((b) => ({ el: b, text: b.textContent }));
    btns.forEach((b) => { b.disabled = true; b.textContent = t('划转中...', 'Moving...'); });
    let stepper = null;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(transferPreview))) return;
      if (!(await verifySecurityAuthAsync(wallet, `${t('现货划转至合约账户', 'Transfer Spot to Perp')} ${formatBal(amt, 4)} USDC`))) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在划转至合约账户', 'Transferring to Perp'), transferSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      await ensureEthersLoaded();
      const txRes = await hl.transferHlUsdClass({ wallet, amount: amt, toPerp: true });
      if (stepper) {
        stepper.setStep(0, 'done', { txHash: (txRes && txRes.txHash) || '', chain: 'hype' });
        stepper.finish(true, t('已划转至合约账户', 'Moved to Perp account'));
      }
      showToast(`✅ ${t('已划转至合约账户', 'Moved to Perp account')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      const errMsg = formatPerpError(err, '划转失败，请稍后重试', 'Transfer failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: errMsg });
        stepper.finish(false, errMsg);
      }
      showToast(errMsg);
    } finally {
      _perpTradeActionBusy = false;
      prevStates.forEach(({ el, text }) => { el.disabled = false; el.textContent = text; });
    }
  }

