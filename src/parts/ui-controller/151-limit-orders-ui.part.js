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

  let _limitCtxSeq = 0;
  let _limitOrdSeq = 0;
  let _limitOrderActionInFlight = false;

  function formatPlainDecimalRate(num) {
    if (!Number.isFinite(num) || num <= 0) return '';
    const sig = Number(num.toPrecision(6));
    if (!Number.isFinite(sig) || sig <= 0) return '';
    const s = sig.toString();
    if (!/e/i.test(s)) return s;
    const absExp = Math.max(0, Math.min(18, Math.ceil(-Math.log10(sig)) + 5));
    return sig.toFixed(absExp).replace(/\.?0+$/, '');
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
    const reqSeq = ++_limitCtxSeq;
    const activeWalletId = wallet.id;
    const sellContract = sellToken.contractAddress;
    const isStaleCtx = () => {
      const curWallet = st.getActiveWallet();
      const curSell = resolveLimitSelectedTokens().sellToken;
      return reqSeq !== _limitCtxSeq
        || (st.limit.chain || 'near') !== chain
        || !curWallet
        || curWallet.id !== activeWalletId
        || !curSell
        || curSell.contractAddress !== sellContract;
    };

    if (lo.isEvmChainLimitSupported(chain)) {
      await ensureEthersLoaded().catch(() => {});
      if (isStaleCtx()) return;
    }

    let liveRate = null;
    if (chain === 'near') {
      const sender = wallet.nearNamedAccount || wallet.nearAddress;
      const poolId = lo.resolveNearLimitPoolId(sellToken.contractAddress, buyToken.contractAddress);
      const [poolInfo, storageState] = await Promise.all([
        poolId ? lo.fetchNearDclPoolInfo(poolId).catch(() => null) : Promise.resolve(null),
        sender ? lo.checkNearDclStorage(sender).catch(() => null) : Promise.resolve(null)
      ]);
      if (isStaleCtx()) return;
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
      if (isStaleCtx()) return;
      if (allowance !== null) {
        st.limit.evmAllowanceRaw = allowance.toString();
        st.limit.evmAllowanceFailed = false;
      } else if (owner) {
        st.limit.evmAllowanceFailed = true;
      }
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

    if (isStaleCtx()) return;
    if (liveRate !== null && Number.isFinite(liveRate) && liveRate > 0) {
      st.limit.liveMarketRate = liveRate;
      if (!st.limit.targetRate) {
        st.limit.targetRate = formatPlainDecimalRate(liveRate);
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
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!lo || !wallet) return;
    const reqSeq = ++_limitOrdSeq;
    const activeWalletId = wallet.id;
    const chain = st.limit.chain || 'near';
    st.limit.ordersLoading = true;
    st.limit.rateLimited = false;
    if ((!Array.isArray(st.limit.ordersActive) || st.limit.ordersActive.length === 0)
      && (!Array.isArray(st.limit.ordersHistory) || st.limit.ordersHistory.length === 0)) {
      renderLimitOrdersList();
    }
    const refreshBtn = $('btn-refresh-limit-orders');
    const prevRefreshText = refreshBtn ? refreshBtn.textContent : '';
    if (refreshBtn && showFeedback) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = t('刷新中...', 'Refreshing...');
    }
    try {
      let res;
      if (chain === 'near') {
        const sender = wallet.nearNamedAccount || wallet.nearAddress;
        res = await lo.fetchNearDclOrders(sender);
      } else if (chain === 'sol') {
        res = await lo.fetchSolanaLimitOrders(wallet.solAddress);
      } else if (lo.isEvmChainLimitSupported(chain)) {
        const owner = (contracts && contracts.resolveWalletEvmSender && contracts.resolveWalletEvmSender(wallet)) || wallet.mpcEvmAddress || wallet.evmAddress;
        res = await lo.fetchEvmCowOrders(chain, owner);
      }
      if (reqSeq !== _limitOrdSeq || (st.limit.chain || 'near') !== chain || st.getActiveWallet()?.id !== activeWalletId) return;
      if (res) {
        st.limit.ordersActive = res.active || [];
        st.limit.ordersHistory = res.history || [];
        st.limit.rateLimited = Boolean(res.rateLimited);
        if (chain === 'sol') st.limit.solUnavailable = Boolean(res.unavailable);
        if (res.unavailable && showFeedback) {
          showToast(res.error || t('当前链限价单接口暂不可用', 'Limit order service unavailable on this chain'));
        }
      }
      if (reqSeq === _limitOrdSeq && st.getActiveWallet()?.id === activeWalletId) st.limit.ordersLoading = false;
      renderLimitOrdersList();
      if (showFeedback && !(res && res.unavailable)) {
        const rateLimitMsg = chain === 'bsc'
          ? t('BSC 限价单服务当前请求频繁，请稍后刷新', 'BSC limit order service rate limited; refresh shortly')
          : t('限价单服务请求频繁，请稍后刷新', 'Limit order service rate limited; refresh shortly');
        showToast(st.limit.rateLimited ? rateLimitMsg : t('已刷新挂单列表', 'Orders refreshed'));
      }
    } catch (_) {
      if (showFeedback) showToast(t('获取挂单失败', 'Failed to load orders'));
    } finally {
      if (reqSeq === _limitOrdSeq) {
        const wasLoading = Boolean(st.limit.ordersLoading);
        st.limit.ordersLoading = false;
        if (wasLoading) renderLimitOrdersList();
      }
      if (refreshBtn && showFeedback) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = prevRefreshText || t('刷新', 'Refresh');
      }
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
    const fw = typeof window !== 'undefined' ? window.NearCAFramework : null;
    if (fw && typeof fw.mountLimitOrdersPanel === 'function') {
      fw.mountLimitOrdersPanel(listEl, {
        chain,
        isHistory,
        items,
        tokenList,
        rateLimited: Boolean(st.limit.rateLimited),
        ordersLoading: Boolean(st.limit.ordersLoading),
        cancellingOrderId: st.limit.cancellingOrderId || '',
        claimingOrderId: st.limit.claimingOrderId || '',
        isEn: st.lang === 'en',
        formatBal,
        fromBaseUnits: contracts.fromBaseUnits,
        dclPointToPrice: lo.dclPointToPrice
      });
      return;
    }

    const findMeta = (addr) => {
      const low = String(addr || '').toLowerCase();
      return tokenList.find((tk) => String(tk.contractAddress || '').toLowerCase() === low) || { symbol: (addr || '').slice(0, 6), decimals: 18 };
    };

    if (st.limit.rateLimited && items.length === 0) {
      const rateLimitText = chain === 'bsc'
        ? t('BSC 限价单服务当前请求频繁，请稍后刷新', 'BSC limit order service rate limited; refresh shortly')
        : t('限价单服务请求频繁，请稍后刷新', 'Limit order service rate limited; refresh shortly');
      setHtmlIfChanged(listEl, `<div class="text-center" style="padding: 14px; font-size: 12px; color: var(--text-secondary);">${rateLimitText}</div>`);
      return;
    }
    if (!Array.isArray(items) || items.length === 0) {
      setHtmlIfChanged(listEl, `<div class="text-center" style="padding: 14px; font-size: 12px; color: var(--text-secondary);">${isHistory ? t('暂无历史挂单', 'No order history') : t('暂无进行中的限价单', 'No active limit orders')}</div>`);
      return;
    }

    if (chain === 'near') {
      setHtmlIfChanged(listEl, items.slice(0, 20).map((o) => {
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
      }).join(''));
      return;
    }

    if (chain === 'sol') {
      setHtmlIfChanged(listEl, items.slice(0, 20).map((o) => {
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
      }).join(''));
      return;
    }

    setHtmlIfChanged(listEl, items.slice(0, 20).map((o) => {
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
    }).join(''));
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
    let targetAmt = (Number.isFinite(entered) && entered > 0)
      ? (entered > currentSellBal ? (entered - currentSellBal) : entered)
      : (chain === 'near' ? 1 : 0.01);
    if (chain === 'near' && sellToken.contractAddress === 'wrap.near') {
      const wnearEntry = wallet.nearNep141Balances && wallet.nearNep141Balances['wrap.near'];
      const wnearOnly = Number((wnearEntry && typeof wnearEntry === 'object') ? (wnearEntry.formatted ?? 0) : (wnearEntry || 0));
      if (Number.isFinite(entered) && entered > 0) {
        targetAmt = entered > wnearOnly ? (entered - wnearOnly) : entered;
      }
    }
    targetAmt = Math.max(0.0001, Number(targetAmt.toFixed(6)));

    if (_limitOrderActionInFlight) return;
    _limitOrderActionInFlight = true;
    const wrapBtn = $('btn-limit-wrap');
    const prevWrapTxt = wrapBtn ? wrapBtn.textContent : '';
    if (wrapBtn) {
      wrapBtn.disabled = true;
      wrapBtn.textContent = t('封装中...', 'Wrapping...');
    }
    st.limit.submitting = true;
    renderLimitOrderCalculations();
    try {
      const authed = await verifySecurityAuthAsync(wallet, t(`封装 ${targetAmt} 原生代币`, `Wrap ${targetAmt} native coin`));
      if (!authed) return;

      if (chain !== 'near' && chain !== 'sol') await ensureEthersLoaded();
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
      _limitOrderActionInFlight = false;
      st.limit.submitting = false;
      if (wrapBtn) {
        wrapBtn.disabled = false;
        if (prevWrapTxt) wrapBtn.textContent = prevWrapTxt;
      }
      renderLimitOrderCalculations();
    }
  }

  async function executeLimitOrderAction() {
    if (_limitOrderActionInFlight) return;
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

    if (chain !== 'near' && btnState.action !== 'approve' && Number.isFinite(Number(st.limit.liveMarketRate)) && Number(st.limit.liveMarketRate) > 0) {
      const r = Number(st.limit.targetRate);
      const m = Number(st.limit.liveMarketRate);
      if (Number.isFinite(r) && r > 0 && r < m) {
        const wPct = ((m - r) / m) * 100;
        if (wPct >= 5) {
          worsePromptSuffix = ` (⚠️ ${t('劣于市价', 'Worse than market')} -${wPct.toFixed(1)}%)`;
        }
      }
    }

    if (btnState.action === 'retry_allowance') {
      st.limit.evmAllowanceFailed = false;
      st.limit.evmAllowanceRaw = null;
      renderLimitOrderCalculations();
      await refreshLimitMarketContextAsync();
      return;
    }

    const actionTitle = btnState.action === 'approve'
      ? t(`授权 ${sellToken.symbol}`, `Approve ${sellToken.symbol}`)
      : `${t(`提交 ${sellToken.symbol} → ${buyToken.symbol} 限价单`, `Place ${sellToken.symbol} → ${buyToken.symbol} Limit Order`)}${worsePromptSuffix}`;
    _limitOrderActionInFlight = true;
    st.limit.submitting = true;
    st.limit.errorMsg = '';
    renderLimitOrderCalculations();
    try {
      const authed = await verifySecurityAuthAsync(wallet, actionTitle);
      if (!authed) return;

      if (lo.isEvmChainLimitSupported(chain)) await ensureEthersLoaded();
      if (btnState.action === 'approve') {
        await lo.approveEvmCowToken({ wallet, chainKey: chain, tokenAddress: sellToken.contractAddress });
        showToast(t(`${sellToken.symbol} 授权已提交，正在确认额度...`, `${sellToken.symbol} approval submitted, confirming...`));
        const owner = (contracts.resolveWalletEvmSender && contracts.resolveWalletEvmSender(wallet)) || wallet.mpcEvmAddress || wallet.evmAddress;
        const sellBaseNeeded = (() => {
          try {
            return BigInt(contracts.toBaseUnits(String(st.limit.amountIn || '0'), sellToken.decimals));
          } catch (_) {
            return 1n;
          }
        })();
        if (owner && typeof lo.checkEvmCowAllowance === 'function') {
          const pollDelays = [250, 350, 1000, 1500, 2000, 2000, 2000, 2000];
          for (let i = 0; i < pollDelays.length; i++) {
            await new Promise((r) => setTimeout(r, pollDelays[i]));
            const nextAllow = await lo.checkEvmCowAllowance({
              chainKey: chain,
              owner,
              tokenAddress: sellToken.contractAddress
            }).catch(() => null);
            if (nextAllow !== null) {
              st.limit.evmAllowanceRaw = nextAllow.toString();
              st.limit.evmAllowanceFailed = false;
              renderLimitOrderCalculations();
              if (BigInt(nextAllow) >= (sellBaseNeeded > 0n ? sellBaseNeeded : 1n)) {
                showToast(t(`${sellToken.symbol} 授权已确认`, `${sellToken.symbol} allowance confirmed`));
                break;
              }
            }
          }
        }
        await refreshLimitMarketContextAsync();
        return;
      }

      const sellAmtNum = Number(st.limit.amountIn);
      const rateNum = Number(st.limit.targetRate);
      const sellRaw = contracts.toBaseUnits(String(st.limit.amountIn), sellToken.decimals);
      const computeExactBuyRaw = (amtStr, rateStr, outDecimals) => {
        const cleanA = String(amtStr || '0').trim();
        const cleanR = String(rateStr || '0').trim();
        if (!/^\d+(\.\d+)?$/.test(cleanA) || !/^\d+(\.\d+)?$/.test(cleanR)) {
          return contracts.toBaseUnits((Number(cleanA) * Number(cleanR)).toFixed(Math.min(18, outDecimals)), outDecimals);
        }
        const [aInt, aFrac = ''] = cleanA.split('.');
        const [rInt, rFrac = ''] = cleanR.split('.');
        const scale = BigInt(aFrac.length + rFrac.length);
        const prod = BigInt((aInt + aFrac).replace(/^0+/, '') || '0') * BigInt((rInt + rFrac).replace(/^0+/, '') || '0');
        const outDec = BigInt(outDecimals);
        if (outDec >= scale) return (prod * (10n ** (outDec - scale))).toString();
        return (prod / (10n ** (scale - outDec))).toString();
      };
      const buyRaw = computeExactBuyRaw(st.limit.amountIn, st.limit.targetRate, buyToken.decimals);
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

      if (typeof resetFormFields === 'function') {
        resetFormFields(['limit-amount-in', 'limit-target-rate'], st.limit, { amountIn: '', targetRate: '' });
      } else {
        st.limit.amountIn = '';
        st.limit.targetRate = '';
        if ($('limit-amount-in')) $('limit-amount-in').value = '';
        if ($('limit-target-rate')) $('limit-target-rate').value = '';
      }
      showToast(t('限价单已提交', 'Limit order placed'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitMarketContextAsync().catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      st.limit.errorMsg = toUserFriendlyError(err, t('限价单提交失败，请稍后重试', 'Limit order failed. Please try again.'));
      showToast(st.limit.errorMsg);
    } finally {
      _limitOrderActionInFlight = false;
      st.limit.submitting = false;
      renderLimitOrderCalculations();
    }
  }

  async function claimLimitOrderUI(orderId, buyToken) {
    if (_limitOrderActionInFlight) return;
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !orderId) return;
    const btn = typeof event !== 'undefined' && event?.target?.closest ? event.target.closest('button') : null;
    _limitOrderActionInFlight = true;
    const prevTxt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = t('领取中...', 'Claiming...'); }
    try {
      const authed = await verifySecurityAuthAsync(wallet, t('领取已成交限价单资产', 'Claim filled limit order'));
      if (!authed) return;
      st.limit.claimingOrderId = String(orderId);
      renderLimitOrdersList();
      await lo.claimNearDclOrder({ wallet, orderId, buyToken });
      showToast(t('已领取至钱包', 'Claimed to wallet'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      showToast(toUserFriendlyError(err, t('领取失败，请稍后重试', 'Claim failed. Please try again.')));
    } finally {
      _limitOrderActionInFlight = false;
      st.limit.claimingOrderId = '';
      if (btn) { btn.disabled = false; btn.textContent = prevTxt; }
      renderLimitOrdersList();
    }
  }

  async function cancelLimitOrderUI(chain, orderId, remainAmount, sellToken, buyToken) {
    if (_limitOrderActionInFlight) return;
    const st = getState();
    const lo = getLimitOrders();
    const wallet = st.getActiveWallet();
    if (!wallet || !lo || !orderId) return;
    const btn = typeof event !== 'undefined' && event?.target?.closest ? event.target.closest('button') : null;
    _limitOrderActionInFlight = true;
    const prevTxt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = t('撤单中...', 'Cancelling...'); }
    try {
      const authed = await verifySecurityAuthAsync(wallet, t('撤销限价单', 'Cancel limit order'));
      if (!authed) return;
      st.limit.cancellingOrderId = String(orderId);
      renderLimitOrdersList();
      if (chain === 'near') {
        await lo.cancelNearDclOrder({ wallet, orderId, remainAmount, sellToken, buyToken });
      } else if (chain === 'sol') {
        await lo.cancelSolanaLimitOrder({ wallet, orderPubkey: orderId });
      } else {
        await ensureEthersLoaded();
        await lo.cancelEvmCowOrder({ wallet, chainKey: chain, orderUid: orderId });
      }
      showToast(t('已撤单', 'Order cancelled'));
      await refreshAllBalancesAsync(true).catch(() => {});
      await refreshLimitOrdersAsync(false).catch(() => {});
    } catch (err) {
      showToast(toUserFriendlyError(err, t('撤单失败，请稍后重试', 'Cancel failed. Please try again.')));
    } finally {
      _limitOrderActionInFlight = false;
      st.limit.cancellingOrderId = '';
      if (btn) { btn.disabled = false; btn.textContent = prevTxt; }
      renderLimitOrdersList();
    }
  }

