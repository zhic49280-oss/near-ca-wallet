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
      counterparty: activity.counterparty ? String(activity.counterparty).trim() : '',
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
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.notifyFrameworkState === 'function') {
      fw.notifyFrameworkState('swap');
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
    const statusLow = String(it.status || '').toLowerCase();
    if (statusLow === 'pending' || statusLow === 'unconfirmed') return t('确认中', 'Pending');
    if (statusLow === 'failed' || it.type === 'failed') return t('失败', 'Failed');
    return t('已确认', 'Confirmed');
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
    const dirGlyph = it.type === 'failed' ? '✕' : (it.type === 'swap' ? '⇄' : (sign === '-' ? '↑' : (sign === '+' ? '↓' : '⇄')));
    const labelMap = {
      receive: t('接收', 'Receive'),
      send: t('发送', 'Send'),
      swap: t('闪兑', 'Swap'),
      stake: t('质押', 'Stake'),
      unstake: t('解质押', 'Unstake'),
      mine: t('挖矿收款', 'Mining Payout'),
      tx: t('合约交互', 'Contract Interaction'),
      failed: t('交易失败', 'Failed')
    };
    const label = labelMap[it.type] || labelMap.tx;
    const pairLabel = it.type === 'swap' && toSymUpper ? `${fromSymUpper} ➔ ${toSymUpper}` : '';
    const actionTitle = pairLabel
      ? `${label} ${pairLabel}`
      : (symKey ? `${label} ${symKey}` : label);
    const displayAmt = isSwapIn && typeof it.toAmount === 'number' && Number.isFinite(it.toAmount)
      ? it.toAmount
      : it.amount;
    const displaySym = isSwapIn && !(typeof it.toAmount === 'number' && Number.isFinite(it.toAmount))
      ? fromSymUpper
      : (symKey || fromSymUpper);
    const amtText = (typeof displayAmt === 'number' && Number.isFinite(displayAmt) && displayAmt > 0)
      ? (isSwapIn && displaySym !== symKey && symKey
          ? `${formatBal(displayAmt, 6)} ${displaySym} ➔ ${symKey}`
          : `${sign}${formatBal(displayAmt, 6)} ${displaySym}`)
      : '--';
    return { label, actionTitle, sign, amtColor, dirClass, dirGlyph, amtText, pairLabel };
  }

  function renderCompactTxPreviewHtml(items, sourceTag, fallbackSym = '') {
    return items.slice(0, 3).map((it, idx) => {
      const parts = resolveTxDisplayParts(it, fallbackSym);
      const relTime = formatRelativeActivityTime(it.timestamp) || formatActivityTime(it.timestamp) || '--';
      const tokens = getTokens();
      const chainMeta = it.chain && tokens ? tokens.getChainMeta(it.chain) : null;
      const netTag = chainMeta ? chainMeta.shortName : (it.chain ? it.chain.toUpperCase() : '');
      const subLine = [relTime, netTag].filter(Boolean).join(' · ');
      return `
        <button type="button" class="tx-compact-row" data-action="open-tx-detail" data-tx-source="${escapeHtml(sourceTag)}" data-tx-idx="${idx}" data-tx-hash="${escapeHtml(it.txHash || '')}" data-chain="${escapeHtml(it.chain || '')}">
          <div class="flex items-center gap-2" style="min-width:0;flex:1;">
            <span class="tx-dir-circle ${parts.dirClass}">${parts.dirGlyph}</span>
            <div class="flex flex-col" style="min-width:0;flex:1;gap:2px;">
              <span style="font-size:13px;font-weight:700;color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(parts.actionTitle)}</span>
              <span class="mono" style="font-size:11px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(subLine)}</span>
            </div>
          </div>
          <div class="flex items-center gap-2" style="flex-shrink:0;">
            <div class="flex flex-col" style="text-align:right;gap:2px;">
              <span class="mono" style="font-size:13px;font-weight:700;color:${parts.amtColor};">${escapeHtml(parts.amtText)}</span>
              <span style="font-size:10.5px;color:var(--text-muted);">${escapeHtml(formatTxConfirmBadgeText(it))}</span>
            </div>
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
          type: existing.type === 'swap' ? 'swap' : (remoteItem.type || existing.type),
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
  let _lastDetailHistorySig = '';

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
      _lastDetailHistorySig = '';
      if (allBtn) allBtn.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }

    const items = getMergedTokenHistoryItems(wallet, symKey, chainFilter);
    _lastTokenDetailMergedItems = items;
    if (allBtn) allBtn.classList.toggle('hidden', items.length === 0);

    const nextSig = `${wallet.id}|${symKey}|${chainFilter}|${_tokenDetailState.historyLoading ? 1 : 0}|${_tokenDetailState.historyPartialUnavailable ? 1 : 0}|${st.lang}|${items.slice(0, 6).map((x) => `${x.id || x.txHash || ''}:${x.status || ''}:${x.timestamp || ''}`).join(',')}`;
    if (nextSig === _lastDetailHistorySig && listEl.innerHTML) return;
    _lastDetailHistorySig = nextSig;

    if (_tokenDetailState.historyLoading && items.length === 0) {
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:8px 0;">${escapeHtml(t('正在加载链上交易记录...', 'Loading on-chain activity...'))}</div>`;
      return;
    }
    if (items.length === 0) {
      const emptyMsg = _tokenDetailState.historyPartialUnavailable
        ? t('部分网络暂无法拉取历史记录，可点击右上方前往区块浏览器查看', 'History on some networks is temporarily unavailable; tap Explorer above to view on-chain')
        : t('暂无该代币链上变动记录，可点击右上方前往区块浏览器查看', 'No recent token activity found; click Explorer above to view on-chain');
      listEl.innerHTML = `<div style="color:var(--text-muted);text-align:center;padding:8px 0;">${escapeHtml(emptyMsg)}</div>`;
      return;
    }

    const partialHint = _tokenDetailState.historyPartialUnavailable
      ? `<div style="color:var(--text-muted);font-size:11px;text-align:center;padding-top:4px;">${escapeHtml(t('部分网络暂无法拉取历史记录，可点击右上方前往区块浏览器查看', 'History on some networks is temporarily unavailable; tap Explorer above to view on-chain'))}</div>`
      : '';
    listEl.innerHTML = renderCompactTxPreviewHtml(items, 'token', symKey) + partialHint;
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

    const tokens = getTokens();
    listEl.innerHTML = items.slice(0, 40).map((it, idx) => {
      const parts = resolveTxDisplayParts(it, it.symbol || _tokenDetailState.symbolKey || '');
      const confBadge = formatTxConfirmBadgeText(it);
      const timeStr = formatActivityTime(it.timestamp) || '--';
      const chainMeta = it.chain && tokens ? tokens.getChainMeta(it.chain) : null;
      const netTag = chainMeta ? chainMeta.shortName : (it.chain ? it.chain.toUpperCase() : '');
      const rawUrl = it.txHash ? getExplorerTxUrl(it.chain, it.txHash) : '';
      const explorerUrl = isValidHttpsUrl(rawUrl) ? rawUrl : '';
      return `
        <div class="tx-card-full">
          <button type="button" class="tx-card-full-top" data-action="open-tx-detail" data-tx-source="modal" data-tx-idx="${idx}" data-tx-hash="${escapeHtml(it.txHash || '')}">
            <div class="flex items-center gap-2" style="min-width:0;flex:1;">
              <span class="tx-dir-circle ${parts.dirClass}">${parts.dirGlyph}</span>
              <div class="flex flex-col" style="min-width:0;gap:2px;">
                <span style="font-weight:700;font-size:13.5px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(parts.actionTitle)}</span>
                <span class="mono" style="font-size:11px;color:var(--text-muted);">${escapeHtml([timeStr, netTag].filter(Boolean).join(' · '))}</span>
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
          ${explorerUrl ? `
            <div class="tx-meta-inline">
              <span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(shortenAddr(it.txHash, 10, 8))}</span>
              <a href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener noreferrer" class="tx-copy-icon-btn" style="text-decoration:none;color:var(--cyan-glow);">${escapeHtml(t('区块浏览器 ↗', 'Explorer ↗'))}</a>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function renderTxDetailSheet() {
    const body = $('tx-detail-body');
    if (!body) return;
    const st = getState();
    const tokens = getTokens();
    const modal = st.txModal || {};
    const it = modal.currentItem;
    if (!it) {
      body.innerHTML = '';
      return;
    }
    const sym = String(it.symbol || _tokenDetailState.symbolKey || '').toUpperCase();
    const parts = resolveTxDisplayParts(it, sym);
    const statusRaw = String(it.status || 'confirmed').toLowerCase();
    const isFailed = it.type === 'failed' || statusRaw === 'failed';
    const isPending = !isFailed && (statusRaw === 'pending' || statusRaw === 'unconfirmed');
    const statusCls = isFailed ? 'failed' : (isPending ? 'pending' : 'confirmed');
    const statusIcon = isFailed ? '✕' : (isPending ? '⏳' : '✓');
    const statusText = isFailed ? t('交易失败', 'Failed') : (isPending ? t('确认中', 'Pending') : t('已确认', 'Confirmed'));

    const timeVal = formatFullActivityTime(it.timestamp);
    const chainMeta = it.chain && tokens ? tokens.getChainMeta(it.chain) : null;
    const netName = chainMeta ? chainMeta.name : (it.chain ? String(it.chain).toUpperCase() : '--');
    const rawUrl = it.txHash ? getExplorerTxUrl(it.chain, it.txHash) : '';
    const explorerUrl = isValidHttpsUrl(rawUrl) ? rawUrl : '';
    const noteText = it.title && it.title !== parts.actionTitle ? it.title : '';

    body.innerHTML = `
      <div class="ios-glass-card flex flex-col items-center gap-2" style="padding:18px 14px;text-align:center;">
        <span class="tx-dir-circle ${parts.dirClass}" style="width:42px;height:42px;font-size:18px;">${parts.dirGlyph}</span>
        <span style="font-size:13px;font-weight:700;color:var(--text-secondary);">${escapeHtml(parts.actionTitle)}</span>
        <strong class="mono" style="font-size:22px;font-weight:800;color:${parts.amtColor};">${escapeHtml(parts.amtText)}</strong>
        <span class="tx-status-pill ${statusCls}" style="margin-top:2px;">
          <span>${statusIcon}</span>
          <span>${escapeHtml(statusText)}</span>
        </span>
      </div>
      <div class="ios-glass-card meta-list">
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('交易动作', 'Action'))}</span><span class="meta-val" style="font-weight:700;">${escapeHtml(parts.actionTitle)}</span></div>
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('网络', 'Network'))}</span><span class="meta-val">${escapeHtml(netName)}</span></div>
        <div class="meta-row"><span class="meta-key">${escapeHtml(t('时间', 'Time'))}</span><span class="meta-val mono">${escapeHtml(timeVal)}</span></div>
        ${noteText ? `<div class="meta-row"><span class="meta-key">${escapeHtml(t('详情', 'Details'))}</span><span class="meta-val mono">${escapeHtml(noteText)}</span></div>` : ''}
        ${it.txHash ? `
          <div class="meta-row">
            <span class="meta-key">${escapeHtml(t('交易哈希', 'Tx Hash'))}</span>
            <span class="meta-val flex items-center gap-2">
              <span class="mono">${escapeHtml(shortenAddr(it.txHash, 10, 8))}</span>
              <button type="button" class="btn-ghost-sm" style="padding:2px 6px;color:var(--cyan-glow);" data-action="copy-text" data-val="${escapeHtml(it.txHash)}" data-label="${escapeHtml(t('交易哈希', 'Tx Hash'))}">${escapeHtml(t('复制', 'Copy'))}</button>
            </span>
          </div>
        ` : ''}
      </div>
      ${explorerUrl ? `
        <a id="tx-detail-explorer-link" href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="display:flex;align-items:center;justify-content:center;gap:6px;text-decoration:none;text-align:center;">
          <span>${escapeHtml(t('在区块浏览器中查看 ↗', 'View on Block Explorer ↗'))}</span>
        </a>
      ` : ''}
    `;
  }

  function openTxDetailSheet(txItem, backSheetId = 'sheet-token-detail') {
    const st = getState();
    if (!txItem) return;
    st.txModal.currentItem = txItem;
    st.txModal.detailBackSheetId = backSheetId || 'sheet-token-detail';
    st.txModal.detailData = null;
    st.txModal.detailLoading = false;
    renderTxDetailSheet();
    openSheet('sheet-tx-detail');
  }

