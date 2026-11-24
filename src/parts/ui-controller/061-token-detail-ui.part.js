  function renderTokenDetailSheet() {
    const st = getState();
    const tokens = getTokens();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !_tokenDetailState.symbolKey) return;

    const group = resolveTokenDetailGroup(wallet, _tokenDetailState.symbolKey);
    if (!group) return;

    const symKey = group.symbolKey;
    const validChains = new Set(group.entries.map((e) => e.blockchain));
    let chainFilter = _tokenDetailState.chainFilter || 'all';
    if (chainFilter !== 'all' && !validChains.has(chainFilter)) {
      chainFilter = 'all';
      _tokenDetailState.chainFilter = 'all';
    }

    const activeEntry = resolveTokenDetailActiveEntry(group, chainFilter);
    const activeChain = chainFilter !== 'all'
      ? chainFilter
      : (activeEntry ? activeEntry.blockchain : 'near');

    const iconEl = $('token-detail-icon');
    if (iconEl) {
      iconEl.innerHTML = tokens.renderTokenIconWithBadge(
        { symbol: group.symbol, blockchain: activeChain },
        30,
        chainFilter !== 'all'
      );
    }
    const titleEl = $('token-detail-title');
    if (titleEl) {
      titleEl.textContent = group.symbol;
    }

    // Build per-chain summary pills
    const chainTotals = new Map();
    for (const e of group.entries) {
      const bc = e.blockchain;
      if (!chainTotals.has(bc)) {
        chainTotals.set(bc, { blockchain: bc, balance: null });
      }
      if (typeof e.balance === 'number' && Number.isFinite(e.balance)) {
        const cur = chainTotals.get(bc);
        cur.balance = (cur.balance === null ? 0 : cur.balance) + e.balance;
      }
    }

    const chainsEl = $('token-detail-chains');
    if (chainsEl) {
      const allPill = `<button type="button" class="filter-pill ${chainFilter === 'all' ? 'active' : ''}" data-action="set-token-detail-chain" data-chain="all">${escapeHtml(t('全部网络', 'All Networks'))}</button>`;
      const netPills = Array.from(chainTotals.values()).map((ct) => {
        const meta = tokens.getChainMeta(ct.blockchain);
        const balSuffix = typeof ct.balance === 'number' && ct.balance > 0 ? ` · ${formatBal(ct.balance, 4)}` : '';
        return `<button type="button" class="filter-pill ${chainFilter === ct.blockchain ? 'active' : ''}" data-action="set-token-detail-chain" data-chain="${escapeHtml(ct.blockchain)}">${escapeHtml((meta.shortName || meta.name) + balSuffix)}</button>`;
      }).join('');
      chainsEl.innerHTML = allPill + netPills;
    }

    // Compute balance & USD for active scope
    const scopedEntries = chainFilter === 'all'
      ? group.entries
      : group.entries.filter((e) => e.blockchain === chainFilter);
    let anyLoaded = false;
    let balSum = 0;
    for (const e of scopedEntries) {
      if (typeof e.balance === 'number' && Number.isFinite(e.balance)) {
        anyLoaded = true;
        balSum += e.balance;
      }
    }
    const displayBal = anyLoaded ? balSum : null;
    const displayUsd = (displayBal !== null && group.price !== null) ? displayBal * group.price : null;

    if ($('token-detail-balance')) $('token-detail-balance').textContent = displayBal !== null ? formatBal(displayBal, 6) : '--';
    if ($('token-detail-usd')) $('token-detail-usd').textContent = displayUsd !== null ? formatUsd(displayUsd) : '--';

    const recvAddr = getWalletDefaultRecipientForChain(wallet, activeChain) || '';
    const addrRowEl = $('token-detail-addr-row');
    if (addrRowEl) {
      if (chainFilter === 'all') {
        addrRowEl.classList.add('hidden');
      } else {
        addrRowEl.classList.remove('hidden');
      }
    }
    if ($('token-detail-addr')) $('token-detail-addr').textContent = recvAddr || '--';

    const explorerEl = $('token-detail-explorer-link');
    if (explorerEl) {
      const url = getExplorerAddressUrl(activeChain, recvAddr);
      const valid = isValidHttpsUrl(url);
      explorerEl.href = valid ? url : 'javascript:void(0)';
      explorerEl.classList.toggle('hidden', !valid);
    }

    // Per-chain breakdown card
    const breakdownCard = $('token-detail-breakdown-card');
    const breakdownList = $('token-detail-breakdown-list');
    if (breakdownCard && breakdownList) {
      if (chainFilter === 'all') {
        breakdownCard.classList.remove('hidden');
        const sortedEntries = [...group.entries].sort((a, b) => {
          const ba = typeof a.balance === 'number' ? a.balance : -1;
          const bb = typeof b.balance === 'number' ? b.balance : -1;
          return bb - ba;
        });
        breakdownList.innerHTML = sortedEntries.map((e) => {
          const meta = tokens.getChainMeta(e.blockchain);
          const cleanNetName = meta.name || e.networkName;
          const balStr = formatBal(e.balance, 6);
          return `
            <div class="detail-row-item">
              <div class="flex items-center gap-2" style="min-width:0;flex:1;">
                ${tokens.renderTokenIconWithBadge(e.token, 28, true)}
                <div class="flex flex-col" style="min-width:0;">
                  <span style="font-weight:700;font-size:12.5px;color:#fff;">${escapeHtml(cleanNetName)}</span>
                  <span class="mono" style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(balStr)} ${escapeHtml(group.symbol)}</span>
                </div>
              </div>
              <div class="flex gap-1" style="flex-shrink:0;">
                <button type="button" class="mini-action-btn primary" data-action="detail-swap" data-asset-id="${escapeHtml(e.assetId)}" data-chain="${escapeHtml(e.blockchain)}" data-contract="${escapeHtml(e.contractAddress || '')}">${escapeHtml(t('闪兑', 'Swap'))}</button>
                <button type="button" class="mini-action-btn" data-action="detail-send" data-symbol="${escapeHtml(group.symbol)}" data-chain="${escapeHtml(e.blockchain)}" data-asset-id="${escapeHtml(e.assetId)}" data-contract="${escapeHtml(e.contractAddress || '')}">${escapeHtml(t('转账', 'Send'))}</button>
              </div>
            </div>
          `;
        }).join('');
      } else {
        breakdownCard.classList.add('hidden');
        breakdownList.innerHTML = '';
      }
    }

    // Earn / Staking / Lending section matching this token
    const earnCard = $('token-detail-earn-card');
    const earnList = $('token-detail-earn-list');
    if (earnCard && earnList) {
      const allPools = (st.staking && st.staking.pools) || (contracts && contracts.STAKING_POOLS) || [];
      const matchedPools = allPools.filter((p) => {
        if (!p) return false;
        const symMatch = String(p.inSymbol || '').toUpperCase() === symKey || String(p.outSymbol || '').toUpperCase() === symKey;
        if (!symMatch) return false;
        if (chainFilter !== 'all' && String(p.chain || '').toLowerCase() !== chainFilter) return false;
        return true;
      });

      if (matchedPools.length > 0) {
        earnCard.classList.remove('hidden');
        const stakingPools = matchedPools.filter((p) => !p.isErc4626 && !p.isAaveV3 && !p.isLockConvert && !p.isBurrowSupply);
        const earnLendingPools = matchedPools.filter((p) => p.isErc4626 || p.isAaveV3 || p.isLockConvert || p.isBurrowSupply);

        const renderPoolRows = (poolList) => poolList.map((p) => {
          const catMeta = getPoolCategoryMeta(p);
          return `
            <button type="button" class="detail-row-item detail-row-clickable" data-action="open-token-detail-pool" data-pool-id="${escapeHtml(p.id)}">
              <div class="flex items-center gap-2" style="min-width:0;flex:1;">
                ${tokens.renderTokenIconWithBadge({ symbol: p.outSymbol, blockchain: p.chain, logoURI: getPoolIconUrl(p) }, 26, true)}
                <div class="flex flex-col" style="min-width:0;">
                  <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                    <span style="font-weight:700;font-size:12.5px;color:#fff;">${escapeHtml(p.name)}</span>
                    <span class="pool-cat-badge ${catMeta.cls}">${escapeHtml(catMeta.label)}</span>
                  </div>
                  <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(p.protocol || p.chainLabel || '')} · ${escapeHtml(p.inSymbol)} ➔ ${escapeHtml(p.outSymbol)}</span>
                </div>
              </div>
              <span class="mono text-emerald" style="font-weight:800;font-size:13px;flex-shrink:0;">${escapeHtml(formatPoolApyText(p))}</span>
            </button>
          `;
        }).join('');

        const cards = [];
        if (stakingPools.length > 0) {
          cards.push(`
            <div class="ios-glass-card flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span style="font-weight:700;font-size:13px;color:#fff;">⚡ ${escapeHtml(t('链上质押 (Staking)', 'Staking'))}</span>
                <span class="pool-cat-badge cat-staking">${escapeHtml(t('质押', 'Staking'))}</span>
              </div>
              <div class="flex flex-col gap-2">${renderPoolRows(stakingPools)}</div>
            </div>
          `);
        }
        if (earnLendingPools.length > 0) {
          cards.push(`
            <div class="ios-glass-card flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <span style="font-weight:700;font-size:13px;color:#fff;">🏦 ${escapeHtml(t('借贷与存款生息 (Lending & Earn)', 'Lending & Earn'))}</span>
                <span class="pool-cat-badge cat-lending">${escapeHtml(t('借贷', 'Lending'))}</span>
              </div>
              <div class="flex flex-col gap-2">${renderPoolRows(earnLendingPools)}</div>
            </div>
          `);
        }
        earnList.innerHTML = cards.join('');
      } else {
        earnCard.classList.add('hidden');
        earnList.innerHTML = '';
      }
    }

    // Bottom live price bar
    if ($('token-detail-price-label')) {
      $('token-detail-price-label').textContent = `${group.symbol} ${t('实时参考价', 'Live Price')}`;
    }
    if ($('token-detail-price-val')) {
      $('token-detail-price-val').textContent = group.price !== null ? formatTokenPrice(group.price) : '--';
    }

    renderTokenDetailHistoryList();
  }

  function tokenDetailAction(actionType) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet || !_tokenDetailState.symbolKey) return;
    const group = resolveTokenDetailGroup(wallet, _tokenDetailState.symbolKey);
    if (!group) return;
    const entry = resolveTokenDetailActiveEntry(group, _tokenDetailState.chainFilter);
    if (!entry) return;

    const act = String(actionType || '').toLowerCase();
    if (act === 'send') {
      quickActionSendFromEntry(group.symbol, entry.blockchain, entry.assetId, entry.contractAddress || '');
      return;
    }
    if (act === 'receive') {
      const bc = String(entry.blockchain || 'near').toLowerCase();
      const receiveNet = ['eth', 'base', 'arb', 'bsc', 'op', 'pol', 'avax', 'hype', 'hood'].includes(bc) ? 'evm' : bc;
      closeAllSheets();
      openReceiveSheet(receiveNet);
      return;
    }
    if (act === 'swap' || act === 'bridge') {
      closeAllSheets();
      quickActionSwapFromEntry(entry.assetId, entry.blockchain, entry.contractAddress || '');
      if (act === 'bridge') {
        const catalog = getSwapTokenCatalog();
        const alt = catalog.find((c) =>
          c &&
          String(c.symbol || '').toUpperCase() === group.symbolKey &&
          String(c.blockchain || '').toLowerCase() !== String(entry.blockchain || '').toLowerCase()
        ) || catalog.find((c) => c && String(c.blockchain || '').toLowerCase() !== String(entry.blockchain || '').toLowerCase());
        if (alt) {
          st.swap.toAssetId = alt.assetId;
          st.swap.recipientAddress = '';
          renderSwapView();
        }
      }
    }
  }

  function copyTokenDetailAddress() {
    const st = getState();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet || !_tokenDetailState.symbolKey) return;
    const group = resolveTokenDetailGroup(wallet, _tokenDetailState.symbolKey);
    const entry = group ? resolveTokenDetailActiveEntry(group, _tokenDetailState.chainFilter) : null;
    const activeChain = _tokenDetailState.chainFilter !== 'all'
      ? _tokenDetailState.chainFilter
      : (entry ? entry.blockchain : 'near');
    const addr = getWalletDefaultRecipientForChain(wallet, activeChain);
    if (addr) {
      const meta = tokens.getChainMeta(activeChain);
      copyText(addr, `${meta.shortName || activeChain.toUpperCase()} ${t('收款地址', 'Address')}`);
    }
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 6000) {
    if (typeof fetch !== 'function') return null;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const resp = await fetch(url, controller ? { ...options, signal: controller.signal } : options);
      if (!resp || !resp.ok) return null;
      return await resp.json();
    } catch (_) {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchTokenDetailHistoryAsync() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const symKey = _tokenDetailState.symbolKey;
    const chainFilter = _tokenDetailState.chainFilter || 'all';
    if (!wallet || !symKey) return;

    const group = resolveTokenDetailGroup(wallet, symKey);
    if (!group) return;

    const seq = ++_tokenDetailState.fetchSeq;
    _tokenDetailState.historyLoading = true;
    renderTokenDetailHistoryList();

    const targetChains = chainFilter !== 'all'
      ? [chainFilter]
      : Array.from(new Set(group.entries.map((e) => e.blockchain)));

    const nearId = wallet.nearNamedAccount || wallet.nearAddress || '';
    const nearContracts = new Set(
      group.entries
        .filter((e) => e.blockchain === 'near' && e.contractAddress)
        .map((e) => String(e.contractAddress).toLowerCase())
    );
    const nearDecByContract = new Map(
      group.entries
        .filter((e) => e.blockchain === 'near' && e.contractAddress)
        .map((e) => [String(e.contractAddress).toLowerCase(), e.decimals || 8])
    );

    const tasks = [];

    if (targetChains.includes('near') && nearId) {
      if (symKey !== 'NEAR') {
        tasks.push((async () => {
          const data = await fetchJsonWithTimeout(`https://api.nearblocks.io/v1/account/${encodeURIComponent(nearId)}/ft-txns?per_page=12`);
          const txns = Array.isArray(data && data.txns) ? data.txns : [];
          const out = [];
          for (const tx of txns) {
            const ftSym = String((tx.ft && tx.ft.symbol) || (tx.ft_meta && tx.ft_meta.symbol) || '').toUpperCase();
            const contractId = String(tx.contract || tx.affected_account_id || '').toLowerCase();
            if (ftSym !== symKey && !nearContracts.has(contractId)) continue;
            const dec = Number((tx.ft && tx.ft.decimals) || nearDecByContract.get(contractId) || 8);
            const deltaNum = Number(tx.delta_amount || 0);
            const isIn = deltaNum >= 0;
            const amtVal = Number.isFinite(deltaNum) ? Math.abs(deltaNum) / (10 ** dec) : null;
            const ts = tx.block_timestamp ? Math.floor(Number(tx.block_timestamp) / 1e9) : null;
            out.push({
              id: `nb_ft_${tx.transaction_hash}`,
              type: isIn ? 'receive' : 'send',
              symbol: symKey,
              chain: 'near',
              amount: amtVal,
              txHash: tx.transaction_hash || '',
              title: tx.involved_account_id ? `${isIn ? t('来自', 'From') : t('发送至', 'To')} ${shortenAddr(tx.involved_account_id)}` : 'NEAR NEP-141',
              timestamp: ts
            });
          }
          return out;
        })());
      }

      tasks.push((async () => {
        const data = await fetchJsonWithTimeout(`https://api.nearblocks.io/v1/account/${encodeURIComponent(nearId)}/txns?per_page=12`);
        const txns = Array.isArray(data && data.txns) ? data.txns : [];
        const out = [];
        for (const tx of txns) {
          const actions = Array.isArray(tx.actions) ? tx.actions : [];
          const methods = actions.map((a) => String(a && a.method || '').toLowerCase()).filter(Boolean);
          let type = '';
          let title = '';
          if (methods.includes('deposit_and_stake') || methods.includes('stake')) {
            if (symKey !== 'NEAR') continue;
            type = 'stake';
            title = tx.receiver_account_id || 'NEAR Stake';
          } else if (methods.includes('unstake') || methods.includes('unstake_all') || methods.includes('withdraw_all')) {
            if (symKey !== 'NEAR') continue;
            type = 'unstake';
            title = tx.receiver_account_id || 'NEAR Unstake';
          } else if (methods.includes('ft_transfer_call') || methods.includes('swap')) {
            if (symKey !== 'NEAR' && !nearContracts.has(String(tx.receiver_account_id || '').toLowerCase())) continue;
            type = 'swap';
            title = tx.receiver_account_id || 'NEAR Swap';
          } else if (symKey === 'NEAR') {
            const isOut = String(tx.signer_account_id || '').toLowerCase() === nearId.toLowerCase();
            type = isOut ? 'send' : 'receive';
            title = isOut
              ? `${t('至', 'To')} ${shortenAddr(tx.receiver_account_id)}`
              : `${t('来自', 'From')} ${shortenAddr(tx.signer_account_id)}`;
          } else {
            continue;
          }
          const depRaw = tx.actions_agg && tx.actions_agg.deposit ? Number(tx.actions_agg.deposit) : 0;
          const amtVal = symKey === 'NEAR' && Number.isFinite(depRaw) && depRaw > 0 ? depRaw / 1e24 : null;
          const ts = tx.block_timestamp ? Math.floor(Number(tx.block_timestamp) / 1e9) : null;
          out.push({
            id: `nb_tx_${tx.transaction_hash}`,
            type,
            symbol: symKey,
            chain: 'near',
            amount: amtVal,
            txHash: tx.transaction_hash || '',
            title,
            timestamp: ts
          });
        }
        return out;
      })());
    }

    if (targetChains.includes('prl') && wallet.address) {
      tasks.push((async () => {
        const data = await fetchJsonWithTimeout(`https://api.prlscan.com/v1/addresses/${encodeURIComponent(wallet.address)}/txs?limit=25`);
        const txs = Array.isArray(data) ? data : (Array.isArray(data && data.txs) ? data.txs : (Array.isArray(data && data.items) ? data.items : []));
        return txs.map((tx) => {
          const deltaGrains = Number(tx.delta_grains || 0);
          const feeGrains = Number(tx.fee_grains || 0);
          const delta = deltaGrains / 1e8;
          const feePrl = Number.isFinite(feeGrains) && feeGrains > 0 ? feeGrains / 1e8 : null;
          const isCoinbase = Boolean(tx.is_coinbase);
          const type = delta >= 0 ? 'receive' : 'send';
          const displayAmt = type === 'send' && feePrl !== null && Math.abs(delta) > feePrl
            ? (Math.abs(delta) - feePrl)
            : Math.abs(delta);
          const rawTime = tx.time !== undefined ? tx.time : (tx.timestamp !== undefined ? tx.timestamp : tx.block_time);
          const tsNum = typeof rawTime === 'number'
            ? (rawTime > 1e12 ? Math.floor(rawTime / 1000) : rawTime)
            : (rawTime ? Math.floor(Date.parse(rawTime) / 1000) : null);
          return {
            id: `prl_${tx.txid || tx.hash}`,
            type,
            symbol: 'PRL',
            chain: 'prl',
            amount: Number.isFinite(displayAmt) ? displayAmt : null,
            netAmount: Number.isFinite(delta) ? delta : null,
            fee: feePrl,
            blockHeight: tx.block_height ?? null,
            confirmations: tx.confirmations ?? null,
            status: tx.status || 'confirmed',
            txHash: tx.txid || tx.hash || '',
            title: tx.type_label || (isCoinbase ? t('区块挖矿奖励', 'Mining Reward') : t('Pearl L1 转账', 'Pearl L1 Transfer')),
            timestamp: Number.isFinite(tsNum) ? tsNum : null
          };
        });
      })());
    }

    if (targetChains.includes('sol') && wallet.solAddress && symKey === 'SOL') {
      tasks.push((async () => {
        const data = await fetchJsonWithTimeout('https://solana-rpc.publicnode.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [wallet.solAddress, { limit: 10 }]
          })
        });
        const sigs = Array.isArray(data && data.result) ? data.result : [];
        return sigs.map((s) => ({
          id: `sol_${s.signature}`,
          type: s.err ? 'failed' : 'tx',
          symbol: 'SOL',
          chain: 'sol',
          amount: null,
          txHash: s.signature || '',
          title: s.err ? t('Solana 交易失败', 'Solana Tx Failed') : t('Solana 链上交易', 'Solana Transaction'),
          timestamp: s.blockTime || null
        }));
      })());
    }

    const BLOCKSCOUT_BASES = {
      eth: 'https://eth.blockscout.com',
      base: 'https://base.blockscout.com',
      arb: 'https://arbitrum.blockscout.com',
      op: 'https://optimism.blockscout.com',
      pol: 'https://polygon.blockscout.com',
      arc: 'https://explorer.arc.io'
    };
    const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
    if (evmAddr) {
      for (const [evmChain, baseUrl] of Object.entries(BLOCKSCOUT_BASES)) {
        if (!targetChains.includes(evmChain)) continue;
        tasks.push((async () => {
          const isNativeOnChain = (evmChain === 'arc' && symKey === 'USDC') || (['eth', 'base', 'arb', 'op'].includes(evmChain) && symKey === 'ETH') || (evmChain === 'pol' && symKey === 'POL');
          const endpoint = isNativeOnChain
            ? `${baseUrl}/api/v2/addresses/${encodeURIComponent(evmAddr)}/transactions`
            : `${baseUrl}/api/v2/addresses/${encodeURIComponent(evmAddr)}/token-transfers`;
          const data = await fetchJsonWithTimeout(endpoint);
          const items = Array.isArray(data && data.items) ? data.items : [];
          const addrLower = evmAddr.toLowerCase();
          const out = [];
          for (const it of items) {
            if (!isNativeOnChain) {
              const tokSym = String(it.token && it.token.symbol || '').toUpperCase();
              if (tokSym !== symKey) continue;
              const dec = Number((it.token && it.token.decimals) || (it.total && it.total.decimals) || 18);
              const rawVal = Number((it.total && it.total.value) || 0);
              const fromHash = String(it.from && it.from.hash || '').toLowerCase();
              const isIn = fromHash !== addrLower;
              out.push({
                id: `${evmChain}_tok_${it.tx_hash || it.transaction_hash}_${out.length}`,
                type: isIn ? 'receive' : 'send',
                symbol: symKey,
                chain: evmChain,
                amount: Number.isFinite(rawVal) ? rawVal / (10 ** dec) : null,
                txHash: it.tx_hash || it.transaction_hash || '',
                title: isIn ? `${t('来自', 'From')} ${shortenAddr(it.from && it.from.hash)}` : `${t('至', 'To')} ${shortenAddr(it.to && it.to.hash)}`,
                timestamp: it.timestamp ? Math.floor(Date.parse(it.timestamp) / 1000) : null
              });
            } else {
              const fromHash = String(it.from && it.from.hash || '').toLowerCase();
              const isIn = fromHash !== addrLower;
              const valNative = Number(it.value || 0) / 1e18;
              out.push({
                id: `${evmChain}_tx_${it.hash}`,
                type: isIn ? 'receive' : 'send',
                symbol: symKey,
                chain: evmChain,
                amount: Number.isFinite(valNative) ? valNative : null,
                txHash: it.hash || '',
                title: isIn ? `${t('来自', 'From')} ${shortenAddr(it.from && it.from.hash)}` : `${t('至', 'To')} ${shortenAddr(it.to && it.to.hash)}`,
                timestamp: it.timestamp ? Math.floor(Date.parse(it.timestamp) / 1000) : null
              });
            }
          }
          return out;
        })());
      }
    }

    if (targetChains.includes('btc') && wallet.btcAddress) {
      tasks.push((async () => {
        const txs = await fetchJsonWithTimeout(`https://mempool.space/api/address/${encodeURIComponent(wallet.btcAddress)}/txs`);
        if (!Array.isArray(txs)) return [];
        const addr = wallet.btcAddress;
        return txs.slice(0, 12).map((tx) => {
          let receivedSats = 0;
          let spentSats = 0;
          for (const vout of (tx.vout || [])) {
            if (vout && vout.scriptpubkey_address === addr) receivedSats += Number(vout.value || 0);
          }
          for (const vin of (tx.vin || [])) {
            if (vin && vin.prevout && vin.prevout.scriptpubkey_address === addr) spentSats += Number(vin.prevout.value || 0);
          }
          const netSats = receivedSats - spentSats;
          const isIn = netSats >= 0;
          return {
            id: `btc_${tx.txid}`,
            type: isIn ? 'receive' : 'send',
            symbol: 'BTC',
            chain: 'btc',
            amount: Math.abs(netSats) / 1e8,
            txHash: tx.txid || '',
            title: tx.status && tx.status.confirmed ? t('已确认', 'Confirmed') : t('内存池待确认', 'Unconfirmed'),
            timestamp: tx.status && tx.status.block_time ? tx.status.block_time : null
          };
        });
      })());
    }

    const chunks = await Promise.all(tasks.map((p) => p.catch(() => [])));
    if (seq !== _tokenDetailState.fetchSeq) return;

    _tokenDetailState.historyItems = chunks.flat().filter(Boolean);
    _tokenDetailState.historyLoading = false;
    renderTokenDetailHistoryList();
  }

  let _autoSyncTimer = null;

  function startAutoPriceAndBalanceSync() {
    if (_autoSyncTimer) {
      clearInterval(_autoSyncTimer);
      _autoSyncTimer = null;
    }
    _autoSyncTimer = setInterval(() => {
      if (typeof document !== 'undefined') {
        if (document.hidden) return;
        if (typeof document.querySelector === 'function' && document.querySelector('.bottom-sheet.open')) return;
      }
      const st = getState();
      if (st && st.getActiveWallet() && !_isRefreshing) {
        refreshAllBalancesAsync(false);
      }
    }, 30000);
    return _autoSyncTimer;
  }

