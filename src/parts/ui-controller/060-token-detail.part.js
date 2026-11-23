  // ==================== OKX-Style Token Detail Sheet & Activity ====================

  let _tokenDetailState = {
    symbolKey: '',
    chainFilter: 'all',
    historyLoading: false,
    historyItems: [],
    fetchSeq: 0
  };

  function recordWalletActivity(wallet, activity = {}) {
    if (!wallet || typeof wallet !== 'object') return null;
    const st = getState();
    if (!Array.isArray(wallet.activityHistory)) wallet.activityHistory = [];
    const entry = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: String(activity.type || 'tx').toLowerCase(),
      symbol: String(activity.symbol || '').toUpperCase(),
      toSymbol: activity.toSymbol ? String(activity.toSymbol).toUpperCase() : '',
      chain: String(activity.chain || '').toLowerCase(),
      amount: activity.amount !== undefined && activity.amount !== null && Number.isFinite(Number(activity.amount))
        ? Number(activity.amount)
        : null,
      fee: activity.fee !== undefined && activity.fee !== null && Number.isFinite(Number(activity.fee))
        ? Number(activity.fee)
        : null,
      netAmount: activity.netAmount !== undefined && activity.netAmount !== null && Number.isFinite(Number(activity.netAmount))
        ? Number(activity.netAmount)
        : null,
      txHash: String(activity.txHash || '').trim(),
      title: String(activity.title || '').trim(),
      timestamp: Number.isFinite(Number(activity.timestamp)) ? Number(activity.timestamp) : Math.floor(Date.now() / 1000)
    };
    if (entry.txHash) {
      wallet.activityHistory = wallet.activityHistory.filter((x) => !(x && x.txHash === entry.txHash && x.type === entry.type));
    }
    wallet.activityHistory.unshift(entry);
    if (wallet.activityHistory.length > 100) {
      wallet.activityHistory = wallet.activityHistory.slice(0, 100);
    }
    if (st && typeof st.saveWallets === 'function') {
      st.saveWallets();
    }
    return entry;
  }

  function getExplorerAddressUrl(chainKey, addr) {
    const a = String(addr || '').trim();
    if (!a) return '';
    const enc = encodeURIComponent(a);
    const bc = String(chainKey || '').toLowerCase();
    if (bc === 'near') return `https://nearblocks.io/address/${enc}`;
    if (bc === 'prl') return `https://prlscan.com/address/${enc}`;
    if (bc === 'sol') return `https://solscan.io/account/${enc}`;
    if (bc === 'eth') return `https://etherscan.io/address/${enc}`;
    if (bc === 'base') return `https://basescan.org/address/${enc}`;
    if (bc === 'arb') return `https://arbiscan.io/address/${enc}`;
    if (bc === 'op') return `https://optimistic.etherscan.io/address/${enc}`;
    if (bc === 'pol') return `https://polygonscan.com/address/${enc}`;
    if (bc === 'avax') return `https://snowtrace.io/address/${enc}`;
    if (bc === 'bsc') return `https://bscscan.com/address/${enc}`;
    if (bc === 'arc') return `https://explorer.arc.io/address/${enc}`;
    if (bc === 'hood') return `https://robinhoodchain.blockscout.com/address/${enc}`;
    if (bc === 'hype') return `https://purrsec.com/address/${enc}`;
    if (bc === 'btc') return `https://mempool.space/address/${enc}`;
    return '';
  }

  function getExplorerTxUrl(chainKey, txHash) {
    const h = String(txHash || '').trim();
    if (!h) return '';
    const enc = encodeURIComponent(h);
    const bc = String(chainKey || '').toLowerCase();
    if (bc === 'near') return `https://nearblocks.io/txns/${enc}`;
    if (bc === 'prl') return `https://prlscan.com/tx/${enc}`;
    if (bc === 'sol') return `https://solscan.io/tx/${enc}`;
    if (bc === 'eth') return `https://etherscan.io/tx/${enc}`;
    if (bc === 'base') return `https://basescan.org/tx/${enc}`;
    if (bc === 'arb') return `https://arbiscan.io/tx/${enc}`;
    if (bc === 'op') return `https://optimistic.etherscan.io/tx/${enc}`;
    if (bc === 'pol') return `https://polygonscan.com/tx/${enc}`;
    if (bc === 'avax') return `https://snowtrace.io/tx/${enc}`;
    if (bc === 'bsc') return `https://bscscan.com/tx/${enc}`;
    if (bc === 'arc') return `https://explorer.arc.io/tx/${enc}`;
    if (bc === 'hood') return `https://robinhoodchain.blockscout.com/tx/${enc}`;
    if (bc === 'hype') return `https://purrsec.com/tx/${enc}`;
    if (bc === 'btc') return `https://mempool.space/tx/${enc}`;
    return '';
  }

  function resolveTokenDetailGroup(wallet, symbolKey) {
    if (!wallet || !symbolKey) return null;
    const symUpper = String(symbolKey).toUpperCase();
    const groups = buildAllOnChainAssetGroups(wallet);
    return groups.find((g) => g.symbolKey === symUpper) || null;
  }

  function resolveTokenDetailActiveEntry(group, chainFilter) {
    if (!group || !Array.isArray(group.entries) || group.entries.length === 0) return null;
    const cf = String(chainFilter || 'all').toLowerCase();
    if (cf !== 'all') {
      const exact = group.entries.find((e) => e.blockchain === cf && typeof e.balance === 'number' && e.balance > 0);
      if (exact) return exact;
      const anyOnChain = group.entries.find((e) => e.blockchain === cf);
      if (anyOnChain) return anyOnChain;
    }
    const pos = group.entries.find((e) => typeof e.balance === 'number' && e.balance > 0);
    if (pos) return pos;
    const primaryChain = PRIMARY_CHAIN_BY_DEFAULT_SYMBOL[group.symbolKey];
    if (primaryChain) {
      const prim = group.entries.find((e) => e.blockchain === primaryChain);
      if (prim) return prim;
    }
    return group.entries[0];
  }

  function openTokenDetailSheet(symbolKey, chainFilter = 'all') {
    const st = getState();
    _tokenDetailState.symbolKey = String(symbolKey || '').toUpperCase();
    _tokenDetailState.chainFilter = String(chainFilter || 'all').toLowerCase();
    _tokenDetailState.historyLoading = true;
    _tokenDetailState.historyItems = [];
    renderTokenDetailSheet();
    openSheet('sheet-token-detail');
    fetchTokenDetailHistoryAsync();

    // Ensure staking/lending APYs are hydrated even if user hasn't opened Earn tab yet
    ensureStakingMetricsFresh(300_000);
  }

  function setTokenDetailChain(chainKey) {
    _tokenDetailState.chainFilter = String(chainKey || 'all').toLowerCase();
    _tokenDetailState.historyLoading = true;
    _tokenDetailState.historyItems = [];
    renderTokenDetailSheet();
    fetchTokenDetailHistoryAsync();
  }

  function openTokenDetailPool(poolId) {
    closeAllSheets();
    switchTab('earn');
    selectStakingPool(poolId);
  }

  function formatActivityTime(tsSec) {
    if (!tsSec || !Number.isFinite(Number(tsSec))) return '';
    try {
      const d = new Date(Number(tsSec) * 1000);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '';
    }
  }

  function formatFullActivityTime(tsSec) {
    if (!tsSec || !Number.isFinite(Number(tsSec))) return '--';
    try {
      const d = new Date(Number(tsSec) * 1000);
      if (Number.isNaN(d.getTime())) return '--';
      return d.toLocaleString([], { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_) {
      return '--';
    }
  }

  function formatRelativeActivityTime(tsSec) {
    if (!tsSec || !Number.isFinite(Number(tsSec))) return '';
    const diffSec = Math.floor(Date.now() / 1000) - Number(tsSec);
    if (diffSec < 0 || diffSec >= 86400) return formatActivityTime(tsSec);
    if (diffSec < 60) return t('刚刚', 'Just now');
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}${t('分钟前', 'm ago')}`;
    return `${Math.floor(diffSec / 3600)}${t('小时前', 'h ago')}`;
  }

  function formatTxConfirmBadgeText(it) {
    if (!it) return '';
    const conf = Number(it.confirmations);
    if (Number.isFinite(conf) && conf > 0) {
      return `${conf} ${t('确认', 'Conf')}`;
    }
    const statusLow = String(it.status || '').toLowerCase();
    if (statusLow === 'pending' || statusLow === 'unconfirmed') return t('待确认', 'Pending');
    if (statusLow === 'failed') return t('失败', 'Failed');
    if (statusLow === 'confirmed' || (it.blockHeight && Number(it.blockHeight) > 0)) return t('已确认', 'Confirmed');
    return '';
  }

  function resolveTxDisplayParts(it, fallbackSym = '') {
    const symKey = String(fallbackSym || it.symbol || '').toUpperCase();
    const fromSymUpper = String(it.symbol || symKey).toUpperCase();
    const toSymUpper = String(it.toSymbol || '').toUpperCase();
    const isSwapIn = it.type === 'swap' && symKey && toSymUpper === symKey && fromSymUpper !== symKey;
    const isSwapOut = it.type === 'swap' && !isSwapIn;
    const sign = (it.type === 'send' || it.type === 'stake' || isSwapOut)
      ? '-'
      : ((it.type === 'receive' || it.type === 'mine' || it.type === 'unstake' || isSwapIn) ? '+' : '');
    const amtColor = sign === '+'
      ? 'var(--near-emerald)'
      : (sign === '-' ? '#f8fafc' : 'var(--text-secondary)');
    const dirClass = it.type === 'failed'
      ? 'failed'
      : (sign === '-' ? (it.type === 'swap' ? 'swap' : 'send') : (sign === '+' ? 'receive' : 'swap'));
    const dirGlyph = it.type === 'failed' ? '✕' : (sign === '-' ? '↑' : (sign === '+' ? '↓' : '⇄'));
    const labelMap = {
      receive: t('收到', 'Receive'),
      send: t('发出', 'Send'),
      swap: t('闪兑', 'Swap'),
      stake: t('质押', 'Stake'),
      unstake: t('解质押', 'Unstake'),
      mine: t('挖矿收款', 'Mining Payout'),
      tx: t('链上交易', 'On-Chain'),
      failed: t('失败', 'Failed')
    };
    const label = labelMap[it.type] || labelMap.tx;
    const displayAmt = isSwapIn && typeof it.toAmount === 'number' && Number.isFinite(it.toAmount)
      ? it.toAmount
      : it.amount;
    const displaySym = isSwapIn && !(typeof it.toAmount === 'number' && Number.isFinite(it.toAmount))
      ? fromSymUpper
      : (symKey || fromSymUpper);
    const amtText = (typeof displayAmt === 'number' && Number.isFinite(displayAmt) && displayAmt > 0)
      ? (isSwapIn && displaySym !== symKey && symKey
          ? `${formatBal(displayAmt, 6)} ${displaySym} ➔ ${symKey}`
          : `${sign}${formatBal(displayAmt, 8)} ${displaySym}`)
      : '--';
    const pairLabel = it.type === 'swap' && toSymUpper ? `${fromSymUpper} ➔ ${toSymUpper}` : '';
    return { label, sign, amtColor, dirClass, dirGlyph, amtText, pairLabel };
  }

  function renderCompactTxPreviewHtml(items, sourceTag, fallbackSym = '') {
    return items.slice(0, 3).map((it, idx) => {
      const parts = resolveTxDisplayParts(it, fallbackSym);
      const confBadge = formatTxConfirmBadgeText(it);
      const relTime = formatRelativeActivityTime(it.timestamp);
      const tokens = getTokens();
      const chainMeta = it.chain && tokens ? tokens.getChainMeta(it.chain) : null;
      const netTag = chainMeta ? chainMeta.shortName : (it.chain ? it.chain.toUpperCase() : '');
      const titleLine = parts.pairLabel || it.title || parts.label;
      const subMeta = [netTag, titleLine !== parts.label ? titleLine : ''].filter(Boolean).join(' · ');
      return `
        <button type="button" class="tx-compact-row" data-action="open-tx-detail" data-tx-source="${escapeHtml(sourceTag)}" data-tx-idx="${idx}" data-tx-hash="${escapeHtml(it.txHash || '')}" data-chain="${escapeHtml(it.chain || '')}">
          <div class="flex items-center gap-2" style="min-width:0;flex:1;">
            <span class="tx-dir-circle ${parts.dirClass}">${parts.dirGlyph}</span>
            <div class="flex flex-col" style="min-width:0;flex:1;gap:2px;">
              <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                <span class="mono" style="font-size:12.5px;font-weight:700;color:${parts.amtColor};">${escapeHtml(parts.amtText)}</span>
                ${confBadge ? `<span class="tx-conf-pill">${escapeHtml(confBadge)}</span>` : ''}
              </div>
              <span class="mono" style="font-size:10.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(subMeta || parts.label)}</span>
            </div>
          </div>
          <div class="flex items-center gap-1" style="flex-shrink:0;">
            ${relTime ? `<span style="font-size:11px;color:var(--text-muted);">${escapeHtml(relTime)}</span>` : ''}
            <span style="font-size:13px;color:var(--text-muted);">›</span>
          </div>
        </button>
      `;
    }).join('');
  }

  function getMergedTokenHistoryItems(wallet, symKey, chainFilter, remoteOverride = null) {
    const localList = Array.isArray(wallet && wallet.activityHistory) ? wallet.activityHistory : [];
    const matchedLocal = localList
      .filter((item) => {
        if (!item) return false;
        const matchSym = String(item.symbol || '').toUpperCase() === symKey || String(item.toSymbol || '').toUpperCase() === symKey;
        if (!matchSym) return false;
        if (chainFilter !== 'all' && String(item.chain || '').toLowerCase() !== chainFilter) return false;
        return true;
      })
      .map((item) => ({ ...item, source: 'local' }));

    const remoteList = Array.isArray(remoteOverride)
      ? remoteOverride
      : (Array.isArray(_tokenDetailState.historyItems) ? _tokenDetailState.historyItems : []);
    const byKey = new Map();
    for (const item of matchedLocal) {
      const key = item.txHash ? `${item.txHash.toLowerCase()}_${item.chain || ''}` : item.id;
      if (!byKey.has(key)) byKey.set(key, item);
    }
    for (const remoteItem of remoteList) {
      const key = remoteItem.txHash ? `${remoteItem.txHash.toLowerCase()}_${remoteItem.chain || ''}` : remoteItem.id;
      const existing = byKey.get(key);
      if (existing) {
        // Remote on-chain fields override unconfirmed local drafts while keeping Swap metadata
        byKey.set(key, {
          ...existing,
          ...remoteItem,
          toSymbol: existing.toSymbol || remoteItem.toSymbol || '',
          toAmount: existing.toAmount ?? remoteItem.toAmount ?? null,
          source: remoteItem.source || 'onchain'
        });
      } else {
        byKey.set(key, remoteItem);
      }
    }
    return Array.from(byKey.values()).sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  }

  let _lastTokenDetailMergedItems = [];
  let _lastMiningNormalizedPayouts = [];
  let _txDetailFetchSeq = 0;

  function renderTokenDetailHistoryList() {
    const listEl = $('token-detail-history-list');
    const allBtn = $('token-detail-history-all-btn');
    if (!listEl) return;
    const st = getState();
    const wallet = st.getActiveWallet();
    const symKey = _tokenDetailState.symbolKey;
    const chainFilter = _tokenDetailState.chainFilter || 'all';
    if (!wallet || !symKey) {
      _lastTokenDetailMergedItems = [];
      if (allBtn) allBtn.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }

    const items = getMergedTokenHistoryItems(wallet, symKey, chainFilter);
    _lastTokenDetailMergedItems = items;
    if (allBtn) allBtn.classList.toggle('hidden', items.length === 0);

    if (_tokenDetailState.historyLoading && items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:8px 0;">${escapeHtml(t('正在加载链上交易记录...', 'Loading on-chain activity...'))}</div>`;
      return;
    }
    if (items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:8px 0;">${escapeHtml(t('暂无该代币链上变动记录，可点击右上方前往区块浏览器查看', 'No recent token activity found; click Explorer above to view on-chain'))}</div>`;
      return;
    }

    listEl.innerHTML = renderCompactTxPreviewHtml(items, 'token', symKey);
  }

  function openAllTokenHistorySheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const symKey = _tokenDetailState.symbolKey;
    const items = wallet && symKey
      ? getMergedTokenHistoryItems(wallet, symKey, _tokenDetailState.chainFilter || 'all')
      : _lastTokenDetailMergedItems;
    st.txModal.listTitle = symKey ? `${symKey} ${t('交易记录', 'Transactions')}` : t('交易记录', 'Transactions');
    st.txModal.items = Array.isArray(items) ? items : [];
    st.txModal.sourceSheetId = 'sheet-token-detail';
    renderTxHistorySheet();
    openSheet('sheet-tx-history');
  }

  function openAllMiningPayoutHistorySheet() {
    const st = getState();
    st.txModal.listTitle = t('挖矿打款记录', 'Mining Payouts');
    st.txModal.items = Array.isArray(_lastMiningNormalizedPayouts) ? _lastMiningNormalizedPayouts : [];
    st.txModal.sourceSheetId = 'sheet-mining-pro';
    renderTxHistorySheet();
    openSheet('sheet-tx-history');
  }

  function navigateBackFromTxHistory() {
    const target = getState().txModal?.sourceSheetId || 'sheet-token-detail';
    if (target) openSheet(target);
    else closeAllSheets();
  }

  function navigateBackFromTxDetail() {
    const target = getState().txModal?.detailBackSheetId || 'sheet-token-detail';
    if (target) openSheet(target);
    else closeAllSheets();
  }

  function renderTxHistorySheet() {
    const st = getState();
    const modal = st.txModal || {};
    const titleEl = $('tx-history-sheet-title');
    if (titleEl) titleEl.textContent = modal.listTitle || t('交易记录', 'Transactions');
    const listEl = $('tx-history-full-list');
    if (!listEl) return;

    const items = Array.isArray(modal.items) ? modal.items : [];
    if (items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:24px 0;">${escapeHtml(t('暂无交易记录', 'No transactions found'))}</div>`;
      return;
    }

    listEl.innerHTML = items.slice(0, 40).map((it, idx) => {
      const parts = resolveTxDisplayParts(it, it.symbol || _tokenDetailState.symbolKey || '');
      const confBadge = formatTxConfirmBadgeText(it);
      const timeStr = formatActivityTime(it.timestamp);
      const counterpartyAddr = String(it.counterparty || '').trim();
      const cpLabel = it.type === 'send' ? t('发送至', 'To') : t('收款地址', 'Address');
      const cpShort = counterpartyAddr ? shortenAddr(counterpartyAddr, 12, 12) : '';
      const txShort = it.txHash ? shortenAddr(it.txHash, 14, 12) : '';
      return `
        <div class="tx-card-full">
          <button type="button" class="tx-card-full-top" data-action="open-tx-detail" data-tx-source="modal" data-tx-idx="${idx}" data-tx-hash="${escapeHtml(it.txHash || '')}">
            <div class="flex items-center gap-2" style="min-width:0;flex:1;">
              <span class="tx-dir-circle ${parts.dirClass}">${parts.dirGlyph}</span>
              <div class="flex flex-col" style="min-width:0;">
                <span style="font-weight:700;font-size:13.5px;color:#fff;">${escapeHtml(parts.label)}</span>
                <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(timeStr || '--')}</span>
              </div>
            </div>
            <div class="flex items-center gap-2" style="flex-shrink:0;">
              <div class="flex flex-col" style="text-align:right;gap:2px;">
                <span class="mono" style="font-size:13px;font-weight:700;color:${parts.amtColor};">${escapeHtml(parts.amtText)}</span>
                ${confBadge ? `<span style="font-size:10.5px;color:var(--text-muted);">${escapeHtml(confBadge)}</span>` : ''}
              </div>
              <span style="font-size:14px;color:var(--text-muted);">›</span>
            </div>
          </button>
          ${counterpartyAddr ? `
            <div class="tx-meta-inline">
              <span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(cpLabel)}: ${escapeHtml(cpShort)}</span>
              <button type="button" class="tx-copy-icon-btn" data-action="copy-text" data-val="${escapeHtml(counterpartyAddr)}" data-label="${escapeHtml(cpLabel)}">${escapeHtml(t('复制', 'Copy'))}</button>
            </div>
          ` : ''}
          ${it.txHash ? `
            <div class="tx-meta-inline">
              <span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t('交易 ID', 'Tx ID'))}: ${escapeHtml(txShort)}</span>
              <button type="button" class="tx-copy-icon-btn" data-action="copy-text" data-val="${escapeHtml(it.txHash)}" data-label="Tx ID">${escapeHtml(t('复制', 'Copy'))}</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  async function fetchChainTransactionDetailAsync(chainKey, txHash, wallet, fallbackItem = {}) {
    const cleanChain = String(chainKey || fallbackItem.chain || '').toLowerCase();
    const cleanHash = String(txHash || fallbackItem.txHash || '').trim();
    if (!cleanHash) return null;

    if (cleanChain === 'prl') {
      const myAddr = wallet && wallet.address ? wallet.address : '';
      let data = await fetchJsonWithTimeout(`https://api.prlscan.com/v1/txs/${encodeURIComponent(cleanHash)}`, {}, 6500);
      if (data && data.transaction) {
        const tx = data.transaction;
        const rawInputs = Array.isArray(data.inputs) ? data.inputs : [];
        const rawOutputs = Array.isArray(data.outputs) ? data.outputs : [];
        const inputs = rawInputs.map((inp) => ({
          address: inp.prev_address || '',
          amount: Number.isFinite(Number(inp.prev_value_grains)) ? Number(inp.prev_value_grains) / 1e8 : null,
          isMine: Boolean(myAddr && inp.prev_address === myAddr)
        }));
        const outputs = rawOutputs.map((out) => {
          const addr = out.address || (Array.isArray(out.addresses) && out.addresses[0]) || '';
          return {
            address: addr,
            amount: Number.isFinite(Number(out.value_grains)) ? Number(out.value_grains) / 1e8 : null,
            isMine: Boolean(myAddr && addr === myAddr)
          };
        });
        let mineIn = 0;
        let mineOut = 0;
        for (const inp of inputs) if (inp.isMine && inp.amount !== null) mineIn += inp.amount;
        for (const out of outputs) if (out.isMine && out.amount !== null) mineOut += out.amount;
        const netDelta = myAddr && (mineIn > 0 || mineOut > 0) ? (mineOut - mineIn) : (fallbackItem.netAmount ?? null);
        const tsNum = tx.confirmed_at ? Math.floor(Date.parse(tx.confirmed_at) / 1000) : (fallbackItem.timestamp || null);
        return {
          status: tx.status || (Number(tx.confirmations) > 0 ? 'confirmed' : 'pending'),
          confirmations: tx.confirmations ?? fallbackItem.confirmations ?? null,
          blockHeight: tx.block_height ?? fallbackItem.blockHeight ?? null,
          timestamp: Number.isFinite(tsNum) ? tsNum : null,
          outputTotal: Number.isFinite(Number(tx.output_grains)) ? Number(tx.output_grains) / 1e8 : null,
          fee: Number.isFinite(Number(tx.fee_grains)) ? Number(tx.fee_grains) / 1e8 : (fallbackItem.fee ?? null),
          netDelta,
          symbol: 'PRL',
          inputs,
          outputs
        };
      }
      // Fallback to Blockbook v2 tx lookup if prlscan v1 tx endpoint fails
      const contracts = getContracts();
      if (contracts && typeof contracts.pearlBlockbookRequest === 'function') {
        const bb = await contracts.pearlBlockbookRequest(`/api/v2/tx/${encodeURIComponent(cleanHash)}`).catch(() => null);
        if (bb && bb.txid) {
          const inputs = (bb.vin || []).map((v) => {
            const addr = (v.addresses && v.addresses[0]) || '';
            const amt = Number.isFinite(Number(v.value)) ? Number(v.value) / 1e8 : null;
            return { address: addr, amount: amt, isMine: Boolean(myAddr && addr === myAddr) };
          });
          const outputs = (bb.vout || []).map((o) => {
            const addr = (o.addresses && o.addresses[0]) || '';
            const amt = Number.isFinite(Number(o.value)) ? Number(o.value) / 1e8 : null;
            return { address: addr, amount: amt, isMine: Boolean(myAddr && addr === myAddr) };
          });
          let mineIn = 0;
          let mineOut = 0;
          for (const inp of inputs) if (inp.isMine && inp.amount !== null) mineIn += inp.amount;
          for (const out of outputs) if (out.isMine && out.amount !== null) mineOut += out.amount;
          const netDelta = myAddr && (mineIn > 0 || mineOut > 0) ? (mineOut - mineIn) : (fallbackItem.netAmount ?? null);
          return {
            status: Number(bb.confirmations) > 0 ? 'confirmed' : 'pending',
            confirmations: Number.isFinite(Number(bb.confirmations)) ? Number(bb.confirmations) : null,
            blockHeight: bb.blockHeight > 0 ? bb.blockHeight : null,
            timestamp: bb.blockTime || fallbackItem.timestamp || null,
            outputTotal: Number.isFinite(Number(bb.value)) ? Number(bb.value) / 1e8 : null,
            fee: Number.isFinite(Number(bb.fees)) ? Number(bb.fees) / 1e8 : (fallbackItem.fee ?? null),
            netDelta,
            symbol: 'PRL',
            inputs,
            outputs
          };
        }
      }
      return null;
    }

    if (cleanChain === 'btc') {
      const myBtc = wallet && wallet.btcAddress ? wallet.btcAddress : '';
      const tx = await fetchJsonWithTimeout(`https://mempool.space/api/tx/${encodeURIComponent(cleanHash)}`, {}, 6500);
      if (!tx || !tx.txid) return null;
      const inputs = (tx.vin || []).map((v) => {
        const addr = v?.prevout?.scriptpubkey_address || '';
        const amt = Number.isFinite(Number(v?.prevout?.value)) ? Number(v.prevout.value) / 1e8 : null;
        return { address: addr, amount: amt, isMine: Boolean(myBtc && addr === myBtc) };
      });
      const outputs = (tx.vout || []).map((o) => {
        const addr = o?.scriptpubkey_address || '';
        const amt = Number.isFinite(Number(o?.value)) ? Number(o.value) / 1e8 : null;
        return { address: addr, amount: amt, isMine: Boolean(myBtc && addr === myBtc) };
      });
      let mineIn = 0;
      let mineOut = 0;
      let totalOut = 0;
      for (const inp of inputs) if (inp.isMine && inp.amount !== null) mineIn += inp.amount;
      for (const out of outputs) {
        if (out.amount !== null) totalOut += out.amount;
        if (out.isMine && out.amount !== null) mineOut += out.amount;
      }
      return {
        status: tx.status && tx.status.confirmed ? 'confirmed' : 'pending',
        confirmations: tx.status && tx.status.confirmed ? 1 : 0,
        blockHeight: tx.status && tx.status.block_height ? tx.status.block_height : null,
        timestamp: tx.status && tx.status.block_time ? tx.status.block_time : (fallbackItem.timestamp || null),
        outputTotal: totalOut > 0 ? totalOut : null,
        fee: Number.isFinite(Number(tx.fee)) ? Number(tx.fee) / 1e8 : (fallbackItem.fee ?? null),
        netDelta: myBtc && (mineIn > 0 || mineOut > 0) ? (mineOut - mineIn) : (fallbackItem.netAmount ?? null),
        symbol: 'BTC',
        inputs,
        outputs
      };
    }

    return null;
  }

  function renderTxDetailSheet() {
    const body = $('tx-detail-body');
    if (!body) return;
    const st = getState();
    const modal = st.txModal || {};
    const it = modal.currentItem;
    if (!it) {
      body.innerHTML = '';
      return;
    }
    const detail = modal.detailData;
    const sym = String((detail && detail.symbol) || it.symbol || _tokenDetailState.symbolKey || '').toUpperCase();
    const statusRaw = String((detail && detail.status) || it.status || 'confirmed').toLowerCase();
    const isFailed = it.type === 'failed' || statusRaw === 'failed';
    const isPending = !isFailed && (statusRaw === 'pending' || statusRaw === 'unconfirmed');
    const statusCls = isFailed ? 'failed' : (isPending ? 'pending' : 'confirmed');
    const statusIcon = isFailed ? '✕' : (isPending ? '⏳' : '✓');
    const statusText = isFailed ? t('交易失败', 'Failed') : (isPending ? t('确认中', 'Pending') : t('已确认', 'Confirmed'));

    const confVal = detail && detail.confirmations !== null && detail.confirmations !== undefined
      ? String(detail.confirmations)
      : (it.confirmations !== null && it.confirmations !== undefined ? String(it.confirmations) : '--');
    const blockVal = detail && detail.blockHeight
      ? String(detail.blockHeight)
      : (it.blockHeight ? String(it.blockHeight) : '--');
    const timeVal = formatFullActivityTime((detail && detail.timestamp) || it.timestamp);
    const outTotalVal = detail && typeof detail.outputTotal === 'number' && Number.isFinite(detail.outputTotal)
      ? `${formatBal(detail.outputTotal, 8)} ${sym}`
      : null;
    const feeNum = detail && typeof detail.fee === 'number' && Number.isFinite(detail.fee)
      ? detail.fee
      : (typeof it.fee === 'number' && Number.isFinite(it.fee) ? it.fee : null);
    const feeVal = feeNum !== null ? `${formatBal(feeNum, 8)} ${sym}` : '--';

    let netDeltaNum = detail && typeof detail.netDelta === 'number' && Number.isFinite(detail.netDelta)
      ? detail.netDelta
      : (typeof it.netAmount === 'number' && Number.isFinite(it.netAmount) ? it.netAmount : null);
    if (netDeltaNum === null && typeof it.amount === 'number' && Number.isFinite(it.amount)) {
      if (it.type === 'send' || it.type === 'stake') netDeltaNum = -(it.amount + (feeNum || 0));
      else if (it.type === 'receive' || it.type === 'mine' || it.type === 'unstake') netDeltaNum = it.amount;
    }
    const netDeltaStr = netDeltaNum !== null
      ? `${netDeltaNum > 0 ? '+' : (netDeltaNum < 0 ? '-' : '')}${formatBal(Math.abs(netDeltaNum), 8)} ${sym}`
      : '--';
    const netCls = netDeltaNum !== null ? (netDeltaNum >= 0 ? 'text-emerald' : 'text-rose') : '';

    const rawUrl = it.txHash ? getExplorerTxUrl(it.chain, it.txHash) : '';
    const explorerUrl = isValidHttpsUrl(rawUrl) ? rawUrl : '';
    const loadingHint = modal.detailLoading
      ? `<div style="font-size:11px;color:var(--text-muted);text-align:center;">${escapeHtml(t('正在同步链上确认明细...', 'Syncing on-chain confirmation details...'))}</div>`
      : '';

    const renderIoSection = (titleText, rows) => {
      if (!Array.isArray(rows) || rows.length === 0) return '';
      const rowHtml = rows.slice(0, 12).map((r) => `
        <div class="tx-io-row">
          <span class="mono" style="color:${r.isMine ? 'var(--near-emerald)' : 'var(--text-secondary)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">
            ${escapeHtml(shortenAddr(r.address || '--', 10, 8))}${r.isMine ? ` (${escapeHtml(t('本人', 'You'))})` : ''}
          </span>
          <span class="mono" style="font-weight:700;color:#fff;flex-shrink:0;">${r.amount !== null ? `${formatBal(r.amount, 8)} ${escapeHtml(sym)}` : '--'}</span>
        </div>
      `).join('');
      return `
        <div class="ios-glass-card flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span style="font-size:12.5px;font-weight:700;">${escapeHtml(titleText)}</span>
            <span class="mono" style="font-size:11.5px;color:var(--text-muted);">${rows.length}</span>
          </div>
          <div>${rowHtml}</div>
        </div>
      `;
    };

    body.innerHTML = `
      <div class="ios-glass-card flex flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <span class="tx-status-pill ${statusCls}">
            <span class="tx-dir-circle ${isFailed ? 'failed' : (isPending ? 'send' : 'receive')}" style="width:22px;height:22px;font-size:11px;">${statusIcon}</span>
            <span>${escapeHtml(statusText)}</span>
          </span>
          ${explorerUrl ? `<a id="tx-detail-explorer-link" href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener noreferrer" class="btn-ghost-sm" style="color:var(--cyan-glow);text-decoration:none;">${escapeHtml(t('↗ 区块浏览器', '↗ Explorer'))}</a>` : ''}
        </div>
        ${it.txHash ? `
          <div class="flex flex-col gap-1">
            <span style="font-size:11.5px;color:var(--text-muted);">${escapeHtml(t('交易 ID', 'Transaction ID'))}</span>
            <div class="mono" style="font-size:12px;word-break:break-all;color:#f8fafc;line-height:1.45;">${escapeHtml(it.txHash)}</div>
            <div>
              <button type="button" class="btn-ghost-sm" style="margin-top:4px;padding-left:0;color:var(--cyan-glow);" data-action="copy-text" data-val="${escapeHtml(it.txHash)}" data-label="Tx ID">${escapeHtml(t('复制交易 ID', 'Copy Tx ID'))}</button>
            </div>
          </div>
        ` : ''}
      </div>
      ${loadingHint}
      <div class="ios-glass-card meta-list">
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('确认数', 'Confirmations'))}</span><span class="meta-val mono">${escapeHtml(confVal)}</span></div>
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('区块', 'Block'))}</span><span class="meta-val mono">${escapeHtml(blockVal)}</span></div>
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('时间', 'Time'))}</span><span class="meta-val mono">${escapeHtml(timeVal)}</span></div>
        ${outTotalVal ? `<div class="meta-row"><span class="meta-key">${escapeHtml(t('输出总额', 'Total Output'))}</span><span class="meta-val mono">${escapeHtml(outTotalVal)}</span></div>` : ''}
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('网络手续费', 'Network Fee'))}</span><span class="meta-val mono">${escapeHtml(feeVal)}</span></div>
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('你的地址净收支', 'Your Net Change'))}</span><span class="meta-val mono ${netCls}" style="font-weight:800;">${escapeHtml(netDeltaStr)}</span></div>
      </div>
      ${detail ? renderIoSection(t('输入', 'Inputs'), detail.inputs) : ''}
      ${detail ? renderIoSection(t('输出', 'Outputs'), detail.outputs) : ''}
    `;
  }

  function openTxDetailSheet(txItem, backSheetId = 'sheet-token-detail') {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!txItem) return;
    st.txModal.currentItem = txItem;
    st.txModal.detailBackSheetId = backSheetId || 'sheet-token-detail';
    st.txModal.detailData = null;
    st.txModal.detailLoading = Boolean(txItem.txHash && (txItem.chain === 'prl' || txItem.chain === 'btc'));
    renderTxDetailSheet();
    openSheet('sheet-tx-detail');

    const seq = ++_txDetailFetchSeq;
    if (st.txModal.detailLoading) {
      fetchChainTransactionDetailAsync(txItem.chain, txItem.txHash, wallet, txItem)
        .then((res) => {
          if (seq !== _txDetailFetchSeq) return;
          st.txModal.detailLoading = false;
          if (res) st.txModal.detailData = res;
          renderTxDetailSheet();
        })
        .catch(() => {
          if (seq !== _txDetailFetchSeq) return;
          st.txModal.detailLoading = false;
          renderTxDetailSheet();
        });
    }
  }

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

