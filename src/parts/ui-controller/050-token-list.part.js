  // ==================== Aggregated Parent-Token List (100% Real On-Chain L1/L2 Balances) ====================

  const DEFAULT_VISIBLE_SYMBOLS = ['NEAR', 'PRL', 'QTC', 'SOL', 'ETH', 'BNB', 'BTC'];
  const DEFAULT_VISIBLE_SET = new Set(DEFAULT_VISIBLE_SYMBOLS);
  const PRIMARY_CHAIN_BY_DEFAULT_SYMBOL = {
    NEAR: 'near',
    PRL: 'prl',
    QTC: 'near',
    SOL: 'sol',
    ETH: 'eth',
    BNB: 'bsc',
    BTC: 'btc'
  };

  function buildAllOnChainAssetGroups(wallet) {
    const tokens = getTokens();
    const st = getState();
    if (!wallet) return [];

    const groupsMap = new Map();
    const ensureGroup = (sym) => {
      const key = String(sym || '').toUpperCase();
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          symbolKey: key,
          symbol: sym,
          primaryToken: null,
          price: getSymbolPrice(sym),
          entries: [],
          items: [],
          totalBalance: null,
          totalUsd: null
        });
      }
      return groupsMap.get(key);
    };

    // 1. Native L1/L2 Chain Balances
    const nativeDefs = [
      { sym: 'NEAR', chain: 'near', name: 'NEAR Protocol', balKey: 'near', assetId: 'nep141:wrap.near', decimals: 24 },
      { sym: 'PRL', chain: 'prl', name: 'Pearl Network', balKey: 'prl', assetId: 'nep141:prl.omft.near', decimals: 8 },
      { sym: 'SOL', chain: 'sol', name: 'Solana', balKey: 'sol', assetId: 'nep141:sol.omft.near', decimals: 9 },
      { sym: 'ETH', chain: 'eth', name: 'Ethereum', balKey: 'eth', assetId: 'nep141:eth.omft.near', decimals: 18 },
      { sym: 'ETH', chain: 'base', name: 'Base', balKey: 'base', assetId: 'nep141:base.omft.near', decimals: 18 },
      { sym: 'ETH', chain: 'arb', name: 'Arbitrum', balKey: 'arb', assetId: 'nep141:arb.omft.near', decimals: 18 },
      { sym: 'ETH', chain: 'op', name: 'OP Mainnet', balKey: 'op', assetId: 'op:native:eth', decimals: 18 },
      { sym: 'ETH', chain: 'hood', name: 'Robinhood Chain', balKey: 'hood', assetId: 'nep141:hood.omft.near', decimals: 18 },
      { sym: 'USDC', chain: 'arc', name: 'Arc Network', balKey: 'arc', assetId: 'arc:native:usdc', decimals: 18 },
      { sym: 'BNB', chain: 'bsc', name: 'BNB Smart Chain', balKey: 'bsc', assetId: 'nep141:bnb.omdep.near', decimals: 18 },
      { sym: 'POL', chain: 'pol', name: 'Polygon', balKey: 'pol', assetId: 'pol:native:pol', decimals: 18 },
      { sym: 'AVAX', chain: 'avax', name: 'Avalanche', balKey: 'avax', assetId: 'avax:native:avax', decimals: 18 },
      { sym: 'HYPE', chain: 'hype', name: 'HyperEVM', balKey: 'hype', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
      { sym: 'BTC', chain: 'btc', name: 'Bitcoin', balKey: 'btc', assetId: 'nep141:btc.omft.near', decimals: 8 }
    ];

    for (const nd of nativeDefs) {
      const grp = ensureGroup(nd.sym);
      const tokenObj = {
        symbol: nd.sym,
        blockchain: nd.chain,
        assetId: nd.assetId,
        decimals: nd.decimals,
        networkName: nd.name,
        isNative: true
      };
      if (!grp.primaryToken) grp.primaryToken = tokenObj;
      const rawBal = wallet.nativeBalances ? wallet.nativeBalances[nd.balKey] : null;
      const bal = (rawBal !== null && rawBal !== undefined && typeof rawBal === 'number' && Number.isFinite(rawBal))
        ? rawBal
        : null;
      grp.entries.push({
        id: `native_${nd.chain}_${nd.sym}`,
        kind: 'native',
        isNative: true,
        blockchain: nd.chain,
        networkName: nd.name,
        assetId: nd.assetId,
        contractAddress: null,
        decimals: nd.decimals,
        balance: bal,
        token: tokenObj
      });
    }

    // 2. Direct NEAR Chain NEP-141 Tokens (ft_balance_of on NEAR blockchain, e.g. prl.omft.near)
    const nearNep141Defs = [
      {
        sym: 'PRL',
        contract: 'prl.omft.near',
        assetId: '1cs_v1:near:nep141:prl.omft.near',
        name: 'NEAR Protocol',
        decimals: 8
      },
      {
        sym: 'QTC',
        contract: 'qtc.omft.near',
        assetId: '1cs_v1:near:nep141:qtc.omft.near',
        name: 'NEAR Protocol',
        decimals: 12
      },
      {
        sym: 'USDT',
        contract: 'usdt.tether-token.near',
        assetId: 'nep141:usdt.tether-token.near',
        name: 'NEAR Protocol',
        decimals: 6
      },
      {
        sym: 'USDC',
        contract: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
        name: 'NEAR Protocol',
        decimals: 6
      },
      {
        sym: 'ETH',
        contract: 'eth.omft.near',
        assetId: '1cs_v1:near:nep141:eth.omft.near',
        name: 'NEAR Protocol',
        decimals: 18
      },
      {
        sym: 'SOL',
        contract: 'sol.omft.near',
        assetId: '1cs_v1:near:nep141:sol.omft.near',
        name: 'NEAR Protocol',
        decimals: 9
      },
      {
        sym: 'BTC',
        contract: 'btc.omft.near',
        assetId: '1cs_v1:near:nep141:btc.omft.near',
        name: 'NEAR Protocol',
        decimals: 8
      }
    ];

    for (const nd of nearNep141Defs) {
      const grp = ensureGroup(nd.sym);
      const tokenObj = {
        symbol: nd.sym,
        blockchain: 'near',
        assetId: nd.assetId,
        contractAddress: nd.contract,
        decimals: nd.decimals,
        networkName: nd.name
      };
      if (!grp.primaryToken) grp.primaryToken = tokenObj;
      const nepEntry = wallet.nearNep141Balances && wallet.nearNep141Balances[nd.contract];
      const bal = nepEntry && typeof nepEntry.formatted === 'number' && Number.isFinite(nepEntry.formatted)
        ? nepEntry.formatted
        : null;
      grp.entries.push({
        id: `nep141_${nd.contract}`,
        kind: 'nep141',
        isNative: false,
        blockchain: 'near',
        networkName: nd.name,
        assetId: nd.assetId,
        contractAddress: nd.contract,
        decimals: nd.decimals,
        balance: bal,
        token: tokenObj
      });
    }

    // 2b. Additional held NEAR NEP-141 ecosystem/LST tokens (e.g. RHEA, xRHEA, oRHEA, rNEAR, stNEAR, LiNEAR, NearX)
    const seenNearContracts = new Set(nearNep141Defs.map((x) => x.contract));
    const nearMetaLookup = {
      'token.rhealab.near': { sym: 'RHEA', decimals: 18 },
      'xtoken.rhealab.near': { sym: 'xRHEA', decimals: 18 },
      'otoken.rhealab.near': { sym: 'oRHEA', decimals: 18 },
      'lst.rhealab.near': { sym: 'rNEAR', decimals: 24 },
      'meta-pool.near': { sym: 'stNEAR', decimals: 24 },
      'linear-protocol.near': { sym: 'LiNEAR', decimals: 24 },
      'v2-nearx.stader-labs.near': { sym: 'NearX', decimals: 24 }
    };
    const allNearDexList = (tokens.DEX_CHAIN_TOKENS && tokens.DEX_CHAIN_TOKENS.near) || [];
    for (const dt of allNearDexList) {
      if (dt && dt.contractAddress && !nearMetaLookup[dt.contractAddress]) {
        nearMetaLookup[dt.contractAddress] = { sym: dt.symbol, decimals: dt.decimals || 18, token: dt };
      }
    }
    const allLiveNearList = Array.isArray(st.liveTokens) ? st.liveTokens : [];
    for (const lt of allLiveNearList) {
      if (lt && String(lt.blockchain || '').toLowerCase() === 'near' && lt.contractAddress && !nearMetaLookup[lt.contractAddress]) {
        nearMetaLookup[lt.contractAddress] = { sym: lt.symbol, decimals: typeof lt.decimals === 'number' ? lt.decimals : 18, token: lt };
      }
    }
    if (wallet.nearNep141Balances && typeof wallet.nearNep141Balances === 'object') {
      for (const [cid, nepEntry] of Object.entries(wallet.nearNep141Balances)) {
        if (!cid || seenNearContracts.has(cid) || cid === 'wrap.near') continue;
        const fmt = nepEntry && typeof nepEntry.formatted === 'number' && Number.isFinite(nepEntry.formatted)
          ? nepEntry.formatted
          : null;
        if (!(fmt > 0)) continue;
        seenNearContracts.add(cid);
        const info = nearMetaLookup[cid] || {};
        const sym = nepEntry.symbol || info.sym || (cid.split('.')[0] || 'NEAR').toUpperCase();
        const dec = typeof nepEntry.decimals === 'number' ? nepEntry.decimals : (info.decimals || 18);
        const grp = ensureGroup(sym);
        const tokenObj = info.token || {
          symbol: sym,
          blockchain: 'near',
          assetId: `nep141:${cid}`,
          contractAddress: cid,
          decimals: dec,
          logoURI: nepEntry.icon || undefined,
          networkName: 'NEAR Protocol'
        };
        if (!grp.primaryToken) grp.primaryToken = tokenObj;
        grp.entries.push({
          id: `nep141_${cid}`,
          kind: 'nep141',
          isNative: false,
          blockchain: 'near',
          networkName: 'NEAR Protocol',
          assetId: tokenObj.assetId || `nep141:${cid}`,
          contractAddress: cid,
          decimals: dec,
          balance: fmt,
          token: tokenObj
        });
      }
    }

    // 3. Solana SPL & EVM ERC-20 DEX Tokens
    const dexByChain = tokens.DEX_CHAIN_TOKENS || {};
    const nativeL1Symbols = new Set(['SOL', 'BTC', 'NEAR', 'PRL']);
    for (const [chainKey, list] of Object.entries(dexByChain)) {
      if (chainKey === 'near') continue;
      const chainNativeLoaded = Boolean(
        wallet.nativeBalances &&
        typeof wallet.nativeBalances[chainKey] === 'number' &&
        Number.isFinite(wallet.nativeBalances[chainKey])
      );
      for (const dt of list) {
        const isNativeSentinel = !dt.contractAddress ||
          dt.contractAddress === 'So11111111111111111111111111111111111111112' ||
          dt.contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
        if (isNativeSentinel) continue;

        let bal = null;
        if (chainKey === 'sol') {
          const splVal = wallet.splBalances && wallet.splBalances[dt.contractAddress];
          if (typeof splVal === 'number' && Number.isFinite(splVal)) bal = splVal;
        } else {
          const ercVal = st.getWalletErc20Balance(wallet, chainKey, dt.contractAddress);
          if (typeof ercVal === 'number' && Number.isFinite(ercVal)) {
            bal = ercVal;
          } else if (chainNativeLoaded) {
            bal = 0;
          }
        }

        // Do not merge wrapped/bridged ERC-20/SPL tokens for native L1 symbols (SOL/BTC/NEAR/PRL) unless holding > 0
        const symUpper = String(dt.symbol || '').toUpperCase();
        if (nativeL1Symbols.has(symUpper) && !(typeof bal === 'number' && bal > 0)) {
          continue;
        }

        const grp = ensureGroup(dt.symbol);
        if (!grp.primaryToken) grp.primaryToken = dt;

        const matchedCore = (tokens.UNIFIED_CORE_TOKENS || []).find(
          (c) => c.blockchain === chainKey && String(c.symbol).toUpperCase() === String(dt.symbol).toUpperCase()
        );

        grp.entries.push({
          id: `token_${chainKey}_${dt.contractAddress}`,
          kind: 'token',
          isNative: false,
          blockchain: chainKey,
          networkName: dt.networkName || tokens.getChainMeta(chainKey).name,
          assetId: matchedCore ? matchedCore.assetId : dt.assetId,
          dexAssetId: dt.assetId,
          contractAddress: dt.contractAddress,
          decimals: dt.decimals,
          balance: bal,
          token: dt
        });
      }
    }

    return Array.from(groupsMap.values()).map((g) => {
      let hasAnyLoaded = false;
      let sum = 0;
      for (const e of g.entries) {
        if (typeof e.balance === 'number' && Number.isFinite(e.balance)) {
          hasAnyLoaded = true;
          sum += e.balance;
        }
      }
      g.totalBalance = hasAnyLoaded ? sum : null;
      g.totalUsd = (g.totalBalance !== null && g.price !== null) ? g.totalBalance * g.price : null;
      g.items = g.entries;
      return g;
    });
  }

  function buildAggregatedAssetGroups(wallet) {
    if (!wallet) return [];
    const allGroups = buildAllOnChainAssetGroups(wallet);
    const visibleGroups = [];

    for (const g of allGroups) {
      const hasPosBalance = typeof g.totalBalance === 'number' && g.totalBalance > 0;
      const isDefaultCore = DEFAULT_VISIBLE_SET.has(g.symbolKey);

      // Hide non-core tokens when total balance is 0 or unloaded
      if (!isDefaultCore && !hasPosBalance) {
        continue;
      }

      const positiveEntries = g.entries.filter((e) => typeof e.balance === 'number' && Number.isFinite(e.balance) && e.balance > 0);
      let visibleEntries;
      if (positiveEntries.length > 0) {
        visibleEntries = positiveEntries;
      } else if (isDefaultCore) {
        const primaryChain = PRIMARY_CHAIN_BY_DEFAULT_SYMBOL[g.symbolKey];
        const primaryEntry = g.entries.find((e) => e.isNative && e.blockchain === primaryChain)
          || g.entries.find((e) => e.blockchain === primaryChain)
          || g.entries[0];
        visibleEntries = primaryEntry ? [primaryEntry] : [];
      } else {
        visibleEntries = [];
      }

      if (visibleEntries.length === 0) continue;

      g.entries = visibleEntries;
      g.items = visibleEntries;
      g.primaryToken = visibleEntries[0].token || g.primaryToken;
      visibleGroups.push(g);
    }

    // Sort: positive-balance tokens first (USD desc, then balance desc), then default core order
    visibleGroups.sort((a, b) => {
      const posA = typeof a.totalBalance === 'number' && a.totalBalance > 0;
      const posB = typeof b.totalBalance === 'number' && b.totalBalance > 0;
      if (posA !== posB) return posA ? -1 : 1;
      if (posA && posB) {
        const usdA = a.totalUsd || 0;
        const usdB = b.totalUsd || 0;
        if (usdB !== usdA) return usdB - usdA;
        if (b.totalBalance !== a.totalBalance) return b.totalBalance - a.totalBalance;
      }
      const idxA = DEFAULT_VISIBLE_SYMBOLS.indexOf(a.symbolKey);
      const idxB = DEFAULT_VISIBLE_SYMBOLS.indexOf(b.symbolKey);
      if (idxA !== -1 || idxB !== -1) {
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      }
      return a.symbol.localeCompare(b.symbol);
    });

    return visibleGroups;
  }

  const HOME_DUST_USD_THRESHOLD = 0.05;

  function partitionDustAssetGroups(groups, threshold = HOME_DUST_USD_THRESHOLD) {
    const list = Array.isArray(groups) ? groups : [];
    const mainGroups = [];
    const dustGroups = [];
    let dustTotalUsd = 0;
    for (const g of list) {
      if (!g) continue;
      const isDust = Boolean(
        !DEFAULT_VISIBLE_SET.has(g.symbolKey) &&
        typeof g.totalBalance === 'number' &&
        Number.isFinite(g.totalBalance) &&
        g.totalBalance > 0 &&
        typeof g.totalUsd === 'number' &&
        Number.isFinite(g.totalUsd) &&
        g.totalUsd < threshold
      );
      if (isDust) {
        dustGroups.push(g);
        dustTotalUsd += g.totalUsd;
      } else {
        mainGroups.push(g);
      }
    }
    return { mainGroups, dustGroups, dustTotalUsd };
  }

  function renderAssetGroupCard(g) {
    const st = getState();
    const tokens = getTokens();
    const isExpanded = st.expandedSymbol === g.symbolKey;
    const parentIconHtml = tokens.renderTokenIconWithBadge(
      { symbol: g.symbol, blockchain: g.primaryToken ? g.primaryToken.blockchain : '' },
      38,
      false
    );

    const pillsHtml = '';
    const priceText = g.price !== null ? formatTokenPrice(g.price) : '--';
    const totalAmtText = formatBal(g.totalBalance, 5);
    const totalUsdText = g.totalUsd !== null ? formatUsd(g.totalUsd) : '--';

    let drawerHtml = '';
    if (isExpanded) {
      drawerHtml = `
        <div class="asset-drawer">
          ${g.entries.map((e) => {
            const iconHtml = tokens.renderTokenIconWithBadge(e.token, 28, true);
            const cleanNetName = e.blockchain ? (tokens.getChainMeta(e.blockchain)?.name || e.networkName) : e.networkName;
            const balStr = formatBal(e.balance, 6);
            return `
              <div class="asset-sub-row">
                <div class="asset-sub-info">
                  ${iconHtml}
                  <div class="asset-sub-meta">
                    <span class="asset-sub-name">${escapeHtml(cleanNetName)}</span>
                  </div>
                </div>
                <div class="asset-sub-right">
                  <span class="asset-sub-bal">${escapeHtml(balStr)} ${escapeHtml(g.symbol)}</span>
                  <div class="asset-sub-actions">
                    <button type="button" class="mini-action-btn primary" data-action="quick-swap" data-stop="1" data-asset-id="${escapeHtml(e.assetId)}" data-chain="${escapeHtml(e.blockchain)}" data-contract="${escapeHtml(e.contractAddress || '')}">${t('闪兑', 'Swap')}</button>
                    <button type="button" class="mini-action-btn" data-action="quick-send" data-stop="1" data-symbol="${escapeHtml(g.symbol)}" data-chain="${escapeHtml(e.blockchain)}" data-asset-id="${escapeHtml(e.assetId)}" data-contract="${escapeHtml(e.contractAddress || '')}">${t('转账', 'Send')}</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    return `
      <div class="asset-group-card ${isExpanded ? 'expanded' : ''}">
        <button type="button" class="asset-parent-row" data-action="open-token-detail" data-symbol="${escapeHtml(g.symbolKey)}">
          <div class="asset-left">
            ${parentIconHtml}
            <div class="asset-title-block">
              <div class="asset-sym-row">
                <span class="asset-symbol">${escapeHtml(g.symbol)}</span>
                <span class="asset-price">${escapeHtml(priceText)}</span>
              </div>
              <div class="network-pills-row">${pillsHtml}</div>
            </div>
          </div>
          <div class="asset-right">
            <span class="asset-total-amt">${escapeHtml(totalAmtText)}</span>
            <span class="asset-total-usd">${escapeHtml(totalUsdText)}</span>
          </div>
        </button>
        ${drawerHtml}
      </div>
    `;
  }

  function renderUnifiedAssetList() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const listEl = $('home-unified-asset-list');
    const heroUsdEl = $('hero-total-usd');
    if (!listEl || !wallet) return;

    const groups = buildAggregatedAssetGroups(wallet);

    // Compute Total Portfolio USD over ALL groups (including dust)
    let anyUsd = false;
    let totalPortfolioUsd = 0;
    for (const g of groups) {
      if (typeof g.totalUsd === 'number' && Number.isFinite(g.totalUsd)) {
        anyUsd = true;
        totalPortfolioUsd += g.totalUsd;
      }
    }
    if (heroUsdEl) {
      heroUsdEl.textContent = anyUsd ? formatUsd(totalPortfolioUsd) : '--';
    }

    const { mainGroups, dustGroups, dustTotalUsd } = partitionDustAssetGroups(groups, HOME_DUST_USD_THRESHOLD);
    let html = mainGroups.map(renderAssetGroupCard).join('');

    if (dustGroups.length > 0) {
      const dustOpen = Boolean(st.showDustAssets);
      const toggleLabel = t(
        `小额资产 (${dustGroups.length} · < $0.05)`,
        `Small Balances (${dustGroups.length} · < $0.05)`
      );
      html += `
        <div class="dust-drawer-wrap">
          <button type="button" class="dust-drawer-toggle" data-action="toggle-home-dust" aria-expanded="${dustOpen ? 'true' : 'false'}">
            <span>${escapeHtml(toggleLabel)}</span>
            <span class="flex items-center gap-2 mono">
              <span>${escapeHtml(formatUsd(dustTotalUsd))}</span>
              <span>${dustOpen ? '▴' : '▾'}</span>
            </span>
          </button>
          ${dustOpen ? `<div class="dust-drawer-list">${dustGroups.map(renderAssetGroupCard).join('')}</div>` : ''}
        </div>
      `;
    }

    listEl.innerHTML = html;
  }

  function toggleHomeDustAssets() {
    const st = getState();
    st.showDustAssets = !Boolean(st.showDustAssets);
    renderUnifiedAssetList();
  }

  function toggleAssetExpand(symbolKey) {
    const st = getState();
    st.expandedSymbol = st.expandedSymbol === symbolKey ? null : symbolKey;
    renderUnifiedAssetList();
  }

  function quickActionSwapFromEntry(assetId, blockchain, contractAddress) {
    const st = getState();
    const catalog = getSwapTokenCatalog();
    const idLower = String(assetId || '').toLowerCase();
    const contractLower = String(contractAddress || '').toLowerCase();
    const matched = catalog.find((x) =>
      String(x.assetId || '').toLowerCase() === idLower ||
      (x.blockchain === blockchain && contractLower && String(x.contractAddress || '').toLowerCase() === contractLower)
    );

    st.swap.fromAssetId = matched ? matched.assetId : assetId;
    if (st.swap.toAssetId === st.swap.fromAssetId) {
      st.swap.toAssetId = st.swap.fromAssetId === 'nep141:wrap.near'
        ? 'nep141:sol.omft.near'
        : 'nep141:wrap.near';
    }
    st.swap.recipientAddress = '';
    st.swap.quoteData = null;
    st.swap.amountOut = '';
    switchTab('swap');
  }

  function quickActionSendFromEntry(symbol, blockchain, assetId, contractAddress) {
    openSendSheet({ symbol, chainKey: blockchain, assetId, contractAddress });
  }

