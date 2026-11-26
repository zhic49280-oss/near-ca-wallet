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
    if (st.perp.showChart) tasks.push(hl.fetchHlCandles(coin, iv, 200).catch(() => []));
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
  let _perpPollTimer = null;
  let _perpTradeActionBusy = false;
  let _perpMidsRenderTimer = null;
  let _perpMidsRenderTs = 0;
  let _perpMidsRafId = 0;

  function stopPerpLiveFeed() {
    if (_perpPollTimer) {
      clearInterval(_perpPollTimer);
      _perpPollTimer = null;
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
    if (elapsed >= 200) {
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
    }, Math.max(20, 200 - elapsed));
    if (_perpMidsRenderTimer && typeof _perpMidsRenderTimer.unref === 'function') {
      _perpMidsRenderTimer.unref();
    }
  }

  function scheduleThrottledOrderbookRender() {
    const now = Date.now();
    if (now - _perpObRenderTs >= 300) {
      _perpObRenderTs = now;
      renderPerpOrderbook();
      return;
    }
    if (_perpObRenderTimer) return;
    _perpObRenderTimer = setTimeout(() => {
      _perpObRenderTimer = null;
      _perpObRenderTs = Date.now();
      renderPerpOrderbook();
    }, Math.max(20, 300 - (now - _perpObRenderTs)));
  }

  function startPerpLiveFeed() {
    stopPerpLiveFeed();
    const st = getState();
    if (st.activeTab !== 'perp' || st.perp.subView !== 'trade') return;
    if (typeof document !== 'undefined' && document.hidden) return;
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
            if (s.activeTab === 'perp' && s.perp.subView === 'trade' && !(typeof document !== 'undefined' && document.hidden)) {
              const delay = Math.min(15_000, 1500 * Math.pow(2, Math.min(3, _perpWsAttempt++)));
              _perpWsReconnectTimer = setTimeout(connectWs, delay);
              if (_perpWsReconnectTimer && typeof _perpWsReconnectTimer.unref === 'function') _perpWsReconnectTimer.unref();
            }
          }
        };
      } catch (_) {}
    };

    connectWs();

    _perpPollTimer = setInterval(() => {
      const curSt = getState();
      if (curSt.activeTab !== 'perp' || curSt.perp.subView !== 'trade') {
        stopPerpLiveFeed();
        return;
      }
      if (typeof document !== 'undefined' && document.hidden) return;
      if (!_perpWs || _perpWs.readyState !== 1) {
        refreshPerpOrderbookAndCandlesAsync().catch(() => {});
        refreshPerpDataAsync(false).catch(() => {});
      }
    }, 4500);
    if (_perpPollTimer && typeof _perpPollTimer.unref === 'function') _perpPollTimer.unref();
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
          refreshPerpLongShortAsync(st.perp.selectedCoin || 'BTC', true).catch(() => {});
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
      if ($('perp-limit-price-input')) $('perp-limit-price-input').value = '';
    } else if ((oType === 'limit' || oType === 'post_only') && !st.perp.limitPriceInput && market && market.markPx) {
      st.perp.limitPriceInput = String(market.markPx);
      const inp = $('perp-limit-price-input');
      if (inp) inp.value = st.perp.limitPriceInput;
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
    }
    if (clearTpSl) {
      domIds.push('perp-tp-input', 'perp-sl-input', 'perp-reduce-only-chk');
      defaults.tpInput = '';
      defaults.slInput = '';
      defaults.reduceOnly = false;
      const drawer = $('perp-tpsl-drawer');
      if (drawer) drawer.classList.add('hidden');
      const btn = $('btn-perp-tpsl-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    resetFormFields(domIds, st.perp, defaults);
  }

  function backToPerpOverview() {
    const st = getState();
    st.perp.subView = 'overview';
    stopPerpLiveFeed();
    renderPerpView();
  }

  function openPerpTradeScreen(coin) {
    const st = getState();
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
    st.perp.lsRatio = null;
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
    refreshPerpOrderbookAndCandlesAsync().catch(() => {});
    refreshPerpLongShortAsync(st.perp.selectedCoin, false).catch(() => {});
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
    const lev = Math.max(1, Number(st.perp.leverage) || 5);
    const feeRate = Number(st.perp.account?.takerFeeRate) || 0.00045;
    const maxSafeRatio = Number(pct) >= 0.99 ? Math.max(0.5, 1 / (1 + lev * feeRate) - 0.005) : Number(pct);
    const amt = Math.max(0, avail * maxSafeRatio).toFixed(2);
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
      return;
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
      const isFav = favsExact.has(String(m.name || '')) || favsUpper.has(String(m.name || '').toUpperCase());
      const iconHtml = tokens && typeof tokens.renderTokenIconWithBadge === 'function'
        ? tokens.renderTokenIconWithBadge({ symbol: m.name, blockchain: 'hype' }, 28, false)
        : '';
      const volText = typeof m.dayNtlVlm === 'number' && m.dayNtlVlm > 0 ? `${t('量', 'Vol')} ${formatCompactUsd(m.dayNtlVlm)}` : '';
      return `
        <div role="button" tabindex="0" class="perp-market-item ${m.name === selCoin ? 'active' : ''}" data-action="select-perp-market" data-coin="${escapeHtml(m.name)}">
          <div class="flex items-center gap-2">
            <button type="button" class="btn-ghost-sm" data-action="toggle-perp-fav" data-stop="1" data-coin="${escapeHtml(m.name)}" style="padding:2px 4px;font-size:13px;color:${isFav ? '#fbbf24' : 'var(--text-muted)'};">${isFav ? '★' : '☆'}</button>
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
        </div>
      `;
    }).join('');
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
    st.perp.lsRatio = null;
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
    refreshPerpLongShortAsync(st.perp.selectedCoin, false).catch(() => {});
  }

  async function executePerpOrderUI() {
    const st = getState();
    if (st.perp.submitting) return;
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
        ...(tpNum ? [{ label: t('止盈价', 'Take Profit'), value: `$${formatPerpPx(tpNum)}`, mono: true, tone: 'emerald' }] : []),
        ...(slNum ? [{ label: t('止损价', 'Stop Loss'), value: `$${formatPerpPx(slNum)}`, mono: true, tone: 'rose' }] : [])
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
        const warnMsg = t(
          `主单已成交/挂单，但止盈止损设置失败 (${orderRes.partialTpslError})，请在下方持仓卡片重设 TP/SL`,
          `Main order submitted, but TP/SL failed (${orderRes.partialTpslError}). Please reset TP/SL on the position card below.`
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
    if (_perpTradeActionBusy) return;
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
    _perpTradeActionBusy = true;
    st.perp.actionBusyKey = `close:${coin}`;
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
      st.perp.actionBusyKey = '';
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
    if (_perpTradeActionBusy) return;
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
    if (_perpTradeActionBusy) return;
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
    _perpTradeActionBusy = true;
    st.perp.actionBusyKey = `reverse:${coin}`;
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
      st.perp.actionBusyKey = '';
      renderPerpBottomList();
    }
  }

  let _perpBatchBusy = false;

  async function executePerpBatchAction() {
    if (_perpBatchBusy) return;
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
    _perpBatchBusy = true;
    st.perp.actionBusyKey = 'batch';
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
        let closedCount = 0;
        let lastErr = null;
        for (const pos of positions) {
          const market = (st.perp.markets || []).find((m) => m.name === pos.coin);
          if (market) {
            try {
              await hl.closeHlPositionMarket({ wallet, market, position: pos });
              closedCount += 1;
            } catch (e) {
              lastErr = e;
            }
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
      st.perp.actionBusyKey = '';
      renderPerpBottomList();
    }
  }

  async function cancelPerpOrderUI(coin, oid) {
    if (_perpTradeActionBusy) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !coin || !oid) return;
    _perpTradeActionBusy = true;
    st.perp.actionBusyKey = `cancel:${coin}:${oid}`;
    renderPerpBottomList();
    let market = (st.perp.markets || []).find((m) => m.name === coin);
    try {
      if (!(await verifySecurityAuthAsync(wallet, `${t('撤销合约挂单', 'Cancel perp order')} ${coin} #${oid}`))) return;
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
      showToast(formatPerpError(err, '撤单失败，请稍后重试', 'Cancel failed. Please try again.'));
    } finally {
      _perpTradeActionBusy = false;
      st.perp.actionBusyKey = '';
      renderPerpBottomList();
    }
  }

  async function quickTransferSpotToPerpUI(triggerEl = null) {
    if (_perpTradeActionBusy) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet || !st.perp.account) return;
    const amt = Number(st.perp.account.spotUsdc || 0);
    if (amt <= 0) return;
    _perpTradeActionBusy = true;
    const btns = triggerEl && typeof triggerEl.closest === 'function'
      ? [triggerEl.closest('button') || triggerEl]
      : (typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll('#perp-spot-banner button, #perp-wd-spot-banner button'))
        : []);
    const prevStates = btns.map((b) => ({ el: b, text: b.textContent }));
    btns.forEach((b) => { b.disabled = true; b.textContent = t('划转中...', 'Moving...'); });
    try {
      if (!(await verifySecurityAuthAsync(wallet, `${t('现货划转至合约账户', 'Transfer Spot to Perp')} ${formatBal(amt, 4)} USDC`))) return;
      await ensureEthersLoaded();
      await hl.transferHlUsdClass({ wallet, amount: amt, toPerp: true });
      showToast(`✅ ${t('已划转至合约账户', 'Moved to Perp account')}`);
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast(formatPerpError(err, '划转失败，请稍后重试', 'Transfer failed. Please try again.'));
    } finally {
      _perpTradeActionBusy = false;
      prevStates.forEach(({ el, text }) => { el.disabled = false; el.textContent = text; });
    }
  }

