  // ==================== Token Picker Modal ====================

  const PICKER_CHAIN_STORAGE_KEY = 'near_ca_swap_picker_chain';

  function loadSavedPickerChain() {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem(PICKER_CHAIN_STORAGE_KEY) : null;
      return v ? String(v) : 'all';
    } catch (_) {
      return 'all';
    }
  }

  function openTokenPicker(side) {
    const st = getState();
    st.limit.pickerSide = null;
    st.swap.pickerSide = side === 'to' ? 'to' : 'from';
    st.swap.pickerChainFilter = loadSavedPickerChain();
    st.swap.pickerShowMoreChains = false;
    st.swap.pickerSearch = '';
    if ($('token-picker-search')) $('token-picker-search').value = '';
    renderTokenPickerList();
    openSheet('sheet-token-picker');
  }

  function openLimitTokenPicker(side) {
    const st = getState();
    st.limit.pickerSide = side === 'to' ? 'to' : 'from';
    st.swap.pickerSide = st.limit.pickerSide;
    st.swap.pickerShowMoreChains = false;
    st.swap.pickerSearch = '';
    if ($('token-picker-search')) $('token-picker-search').value = '';
    renderTokenPickerList();
    openSheet('sheet-token-picker');
  }

  function setTokenPickerChain(chainKey) {
    const st = getState();
    st.swap.pickerChainFilter = chainKey;
    st.swap.pickerShowMoreChains = false;
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(PICKER_CHAIN_STORAGE_KEY, String(chainKey)); } catch (_) {}
    renderTokenPickerList();
  }

  function toggleTokenPickerMoreChains() {
    const st = getState();
    st.swap.pickerShowMoreChains = !Boolean(st.swap.pickerShowMoreChains);
    renderTokenPickerList();
  }

  function toggleFavoriteSwapToken(assetId) {
    const st = getState();
    if (typeof st.toggleFavoriteTokenId === 'function') {
      st.toggleFavoriteTokenId(assetId);
    }
    renderTokenPickerList();
  }

  let _jupSearchTimer = null;
  let _lastJupSearchQuery = '';
  const PINNED_PICKER_CHAINS = ['near', 'sol', 'eth', 'hood', 'arc'];
  const PREFERRED_PICKER_CHAINS = ['near', 'sol', 'eth', 'hood', 'arc', 'hype', 'prl', 'qtc', 'base', 'arb', 'bsc', 'btc', 'op', 'pol', 'avax'];

  function renderTokenPickerList() {
    const st = getState();
    const tokens = getTokens();
    const intents = getIntents();
    const wallet = st.getActiveWallet();
    const limitPickerSide = st.limit && st.limit.pickerSide;
    if (limitPickerSide) {
      const limitCatalog = getLimitPickerCatalog(limitPickerSide);
      const search = ($('token-picker-search')?.value || '').trim().toLowerCase();
      const favBar = $('token-picker-favorites');
      if (favBar) {
        favBar.classList.add('hidden');
        favBar.innerHTML = '';
      }
      const moreEl = $('token-picker-more-chains');
      if (moreEl) {
        moreEl.classList.add('hidden');
        moreEl.innerHTML = '';
      }
      const chainBar = $('token-picker-chains');
      if (chainBar) {
        const meta = tokens.getChainMeta(st.limit.chain);
        chainBar.innerHTML = `<button type="button" class="filter-pill active">${escapeHtml(meta.shortName)}</button>`;
      }
      const rows = limitCatalog
        .filter((tok) => {
          if (!search) return true;
          const hay = `${tok.symbol} ${tok.name} ${tok.contractAddress || ''}`.toLowerCase();
          return hay.includes(search);
        })
        .map((tok) => ({
          tok,
          bal: wallet ? getLimitTokenBalance(wallet, tok) : null
        }))
        .sort((a, b) => {
          const posA = typeof a.bal === 'number' && a.bal > 0;
          const posB = typeof b.bal === 'number' && b.bal > 0;
          if (posA !== posB) return posA ? -1 : 1;
          return (b.bal || 0) - (a.bal || 0);
        });
      const listEl = $('token-picker-list');
      if (!listEl) return;
      listEl.innerHTML = rows.map(({ tok, bal }) => {
        const liveP = (typeof tok.price === 'number' && tok.price > 0) ? tok.price : getSymbolPrice(tok.symbol);
        return `
          <div class="asset-sub-row" role="button" tabindex="0" style="width:100%;cursor:pointer;text-align:left;" data-action="select-swap-token" data-asset-id="${escapeHtml(tok.contractAddress || tok.assetId)}">
            <div class="asset-sub-info">
              ${tokens.renderTokenIconWithBadge(tok, 32, true)}
              <div class="asset-sub-meta">
                <span class="asset-sub-name">${escapeHtml(tok.symbol)} · ${escapeHtml(tok.networkName || tok.blockchain)}</span>
                <span class="asset-sub-tag">${escapeHtml(tok.name || '')}</span>
              </div>
            </div>
            <div class="asset-sub-right">
              <span class="asset-sub-bal">${escapeHtml(formatBal(bal, 5))}</span>
              <span class="asset-sub-tag">${escapeHtml(formatTokenPrice(liveP))}</span>
            </div>
          </div>
        `;
      }).join('');
      return;
    }

    const catalog = getSwapTokenCatalog();
    const isFromPicker = st.swap.pickerSide === 'from';
    const pickerCatalog = isFromPicker ? catalog.filter(isSwapOriginSupported) : catalog;

    const search = ($('token-picker-search')?.value || '').trim().toLowerCase();
    const uniqueChains = Array.from(new Set(pickerCatalog.map((x) => x.blockchain).filter(Boolean)));
    const orderedChains = [
      ...PREFERRED_PICKER_CHAINS.filter((ck) => (!isFromPicker || isSwapOriginSupported({ blockchain: ck })) && (ck === 'arc' || uniqueChains.includes(ck))),
      ...uniqueChains.filter((ck) => !PREFERRED_PICKER_CHAINS.includes(ck))
    ];

    const favIds = Array.isArray(st.favoriteTokenIds) ? st.favoriteTokenIds : [];
    const favSet = new Set(favIds.map((id) => String(id || '').toLowerCase()));
    const catalogById = new Map();
    for (const item of pickerCatalog) {
      if (item && item.assetId) catalogById.set(String(item.assetId).toLowerCase(), item);
    }

    const favBar = $('token-picker-favorites');
    if (favBar) {
      const favTokens = favIds
        .map((id) => catalogById.get(String(id || '').toLowerCase()))
        .filter(Boolean);
      if (favTokens.length > 0) {
        favBar.classList.remove('hidden');
        favBar.innerHTML = favTokens.map((tok) => `
          <button type="button" class="filter-pill flex items-center gap-1" style="display:inline-flex;align-items:center;gap:5px;" data-action="select-swap-token" data-asset-id="${escapeHtml(tok.assetId)}">
            ${tokens.renderTokenIconWithBadge(tok, 18, true)}
            <span>${escapeHtml(tok.symbol)}</span>
          </button>
        `).join('');
      } else {
        favBar.classList.add('hidden');
        favBar.innerHTML = '';
      }
    }

    const availableChainSet = new Set(orderedChains);
    if (st.swap.pickerChainFilter && st.swap.pickerChainFilter !== 'all') {
      const cf = st.swap.pickerChainFilter;
      const validForSide = availableChainSet.has(cf) && (!isFromPicker || isSwapOriginSupported({ blockchain: cf }));
      if (!validForSide) st.swap.pickerChainFilter = 'all';
    }
    const activeChain = st.swap.pickerChainFilter || 'all';
    const pinnedVisible = PINNED_PICKER_CHAINS.filter((ck) => (!isFromPicker || isSwapOriginSupported({ blockchain: ck })) && (ck === 'arc' || availableChainSet.has(ck)));
    const tempExtraChain = (activeChain !== 'all' && !PINNED_PICKER_CHAINS.includes(activeChain) && availableChainSet.has(activeChain))
      ? activeChain
      : '';
    const showMoreChains = Boolean(st.swap.pickerShowMoreChains);

    const chainBar = $('token-picker-chains');
    if (chainBar) {
      const nextChainSig = `${activeChain}|${isFromPicker ? '1' : '0'}|${showMoreChains ? '1' : '0'}|${pinnedVisible.join(',')}|${tempExtraChain}|${st.lang}`;
      if (!chainBar.dataset || chainBar.dataset.renderedSig !== nextChainSig) {
        if (chainBar.dataset) chainBar.dataset.renderedSig = nextChainSig;
        chainBar.innerHTML = [
          `<button type="button" class="filter-pill ${activeChain === 'all' ? 'active' : ''}" data-action="set-picker-chain" data-chain="all">${t('全部网络', 'All')}</button>`,
          ...pinnedVisible.map((ck) => {
            const meta = tokens.getChainMeta(ck);
            return `<button type="button" class="filter-pill ${activeChain === ck ? 'active' : ''}" data-action="set-picker-chain" data-chain="${escapeHtml(ck)}">${escapeHtml(meta.shortName)}</button>`;
          }),
          ...(tempExtraChain ? [(() => {
            const meta = tokens.getChainMeta(tempExtraChain);
            return `<button type="button" class="filter-pill active" data-action="set-picker-chain" data-chain="${escapeHtml(tempExtraChain)}">${escapeHtml(meta.shortName)}</button>`;
          })()] : []),
          `<button type="button" class="filter-pill ${showMoreChains ? 'active' : ''}" data-action="toggle-picker-more-chains">${escapeHtml(showMoreChains ? t('收起网络 ▲', 'Less ▲') : t('更多网络 ▾', 'More ▾'))}</button>`
        ].join('');
      }
    }

    const moreChainsEl = $('token-picker-more-chains');
    if (moreChainsEl) {
      if (showMoreChains) {
        moreChainsEl.classList.remove('hidden');
        const allMoreOrder = Array.from(new Set([
          ...PREFERRED_PICKER_CHAINS.filter((ck) => !isFromPicker || isSwapOriginSupported({ blockchain: ck })),
          ...orderedChains
        ])).filter((ck) => availableChainSet.has(ck) || ck === 'arc');
        moreChainsEl.innerHTML = allMoreOrder.map((ck) => {
          const meta = tokens.getChainMeta(ck);
          return `<button type="button" class="filter-pill ${activeChain === ck ? 'active' : ''}" data-action="set-picker-chain" data-chain="${escapeHtml(ck)}">${escapeHtml(meta.shortName)}</button>`;
        }).join('');
      } else {
        moreChainsEl.classList.add('hidden');
        moreChainsEl.innerHTML = '';
      }
    }

    if ((activeChain === 'all' || activeChain === 'sol') && search.length >= 2 && search !== _lastJupSearchQuery && intents && typeof intents.searchJupiterTokensV2 === 'function') {
      if (_jupSearchTimer) clearTimeout(_jupSearchTimer);
      const querySnapshot = search;
      _jupSearchTimer = setTimeout(async () => {
        _lastJupSearchQuery = querySnapshot;
        const hits = await intents.searchJupiterTokensV2(querySnapshot).catch(() => []);
        if (!Array.isArray(hits) || hits.length === 0) return;
        const existing = new Set((st.dynamicSolTokens || []).map((x) => String(x.assetId || '').toLowerCase()));
        const merged = [...(st.dynamicSolTokens || [])];
        for (const h of hits) {
          if (h && h.assetId && !existing.has(String(h.assetId).toLowerCase())) {
            existing.add(String(h.assetId).toLowerCase());
            merged.push(h);
          }
        }
        st.dynamicSolTokens = merged.slice(-120);
        const currentSearch = ($('token-picker-search')?.value || '').trim().toLowerCase();
        if (currentSearch === querySnapshot) renderTokenPickerList();
      }, 250);
    }

    const filteredWithMeta = pickerCatalog
      .map((tok, catalogIdx) => ({ tok, catalogIdx }))
      .filter(({ tok }) => {
        if (st.swap.pickerChainFilter !== 'all' && tok.blockchain !== st.swap.pickerChainFilter) {
          return false;
        }
        if (search) {
          const hay = `${tok.symbol} ${tok.name} ${tok.networkName} ${tok.contractAddress || ''}`.toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .map(({ tok, catalogIdx }) => ({
        tok,
        catalogIdx,
        bal: wallet ? getSwapTokenAvailableBalance(tok, st.swap.pickerSide === 'from') : null
      }))
      .sort((a, b) => {
        const posA = typeof a.bal === 'number' && a.bal > 0;
        const posB = typeof b.bal === 'number' && b.bal > 0;
        if (posA !== posB) return posA ? -1 : 1;
        if (posA && posB) {
          const usdA = a.bal * (typeof a.tok.price === 'number' && a.tok.price > 0 ? a.tok.price : 0);
          const usdB = b.bal * (typeof b.tok.price === 'number' && b.tok.price > 0 ? b.tok.price : 0);
          if (usdB !== usdA) return usdB - usdA;
          if (b.bal !== a.bal) return b.bal - a.bal;
        }
        return a.catalogIdx - b.catalogIdx;
      })
      .slice(0, 80);

    const listEl = $('token-picker-list');
    if (!listEl) return;
    if (filteredWithMeta.length === 0) {
      listEl.innerHTML = `<div class="text-muted" style="text-align:center;padding:24px 12px;">${escapeHtml(t('未找到匹配的代币', 'No matching tokens found'))}</div>`;
      return;
    }
    const renderPickerRowHtml = ({ tok, bal }) => {
      const liveP = (typeof tok.price === 'number' && tok.price > 0) ? tok.price : getSymbolPrice(tok.symbol);
      const priceText = formatTokenPrice(liveP);
      const isFav = favSet.has(String(tok.assetId || '').toLowerCase());
      const starStyle = isFav
        ? 'color:#F59E0B;font-size:16px;padding:4px 6px;background:transparent;border:none;cursor:pointer;line-height:1;'
        : 'color:var(--text-muted);font-size:16px;padding:4px 6px;background:transparent;border:none;cursor:pointer;line-height:1;';
      return `
        <div class="asset-sub-row" role="button" tabindex="0" style="width:100%;cursor:pointer;text-align:left;" data-action="select-swap-token" data-asset-id="${escapeHtml(tok.assetId)}">
          <div class="asset-sub-info">
            ${tokens.renderTokenIconWithBadge(tok, 32, true)}
            <div class="asset-sub-meta">
              <span class="asset-sub-name">${escapeHtml(tok.symbol)} · ${escapeHtml(tok.networkName || tok.blockchain)}</span>
              <span class="asset-sub-tag">${escapeHtml(tok.name || '')}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <div class="asset-sub-right">
              <span class="asset-sub-bal">${escapeHtml(formatBal(bal, 5))}</span>
              <span class="asset-sub-tag">${escapeHtml(priceText)}</span>
            </div>
            <button type="button" style="${starStyle}" data-action="toggle-fav-token" data-stop="1" data-asset-id="${escapeHtml(tok.assetId)}" aria-label="Favorite">${isFav ? '★' : '☆'}</button>
          </div>
        </div>
      `;
    };
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountTokenPicker === 'function') {
      fw.mountTokenPicker(listEl, {
        rows: filteredWithMeta,
        renderRowHtml: renderPickerRowHtml,
        emptyText: t('未找到匹配的代币', 'No matching tokens found')
      });
      return;
    }
    listEl.innerHTML = filteredWithMeta.map(renderPickerRowHtml).join('');
  }

  function selectSwapToken(assetId) {
    const st = getState();
    if (st.limit && st.limit.pickerSide) {
      const side = st.limit.pickerSide;
      st.limit.pickerSide = null;
      if (side === 'from') {
        if (assetId === st.limit.buyContract) st.limit.buyContract = st.limit.sellContract;
        st.limit.sellContract = assetId;
        resetFormFields(['limit-amount-in', 'limit-target-rate'], st.limit, { amountIn: '', targetRate: '' });
      } else {
        if (assetId === st.limit.sellContract) {
          st.limit.sellContract = st.limit.buyContract;
          resetFormFields(['limit-amount-in', 'limit-target-rate'], st.limit, { amountIn: '', targetRate: '' });
        } else {
          resetFormFields(['limit-target-rate'], st.limit, { targetRate: '' });
        }
        st.limit.buyContract = assetId;
      }
      st.limit.priceInverted = null;
      st.limit.snappedPoint = null;
      st.limit.liveMarketRate = null;
      st.limit.poolInfo = null;
      st.limit.evmAllowanceRaw = null;
      closeAllSheets();
      renderLimitOrderView();
      refreshLimitMarketContextAsync().catch(() => {});
      return;
    }
    if (st.swap.pickerSide === 'from') {
      if (assetId === st.swap.toAssetId) st.swap.toAssetId = st.swap.fromAssetId;
      st.swap.fromAssetId = assetId;
      resetFormFields(['swap-amount-in'], st.swap, { amountIn: '' });
    } else {
      if (assetId === st.swap.fromAssetId) {
        st.swap.fromAssetId = st.swap.toAssetId;
        resetFormFields(['swap-amount-in'], st.swap, { amountIn: '' });
      }
      st.swap.toAssetId = assetId;
      st.swap.recipientAddress = '';
    }
    st.swap.rateInverted = false;
    resetSwapQuoteDisplay();
    if (typeof st.saveSwapPair === 'function') st.saveSwapPair();
    setSwapError('');
    closeAllSheets();
    renderSwapView();
    if (st.swap.amountIn) scheduleSwapQuote();
  }

