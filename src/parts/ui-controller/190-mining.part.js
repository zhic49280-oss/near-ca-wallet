  // ==================== Deep Mining Pro Sheet ====================

  async function openMiningProSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const inp = $('mining-address-input');
    const activeId = wallet ? wallet.id : null;
    const walletChanged = Boolean(wallet && st.mining._boundWalletId !== activeId);
    if (walletChanged) {
      st.mining.telemetry = null;
      st.mining._boundWalletId = activeId;
    }
    if (inp && wallet && wallet.address && (!inp.value || walletChanged)) {
      inp.value = wallet.address;
      st.mining.minerAddress = wallet.address;
    }
    openSheet('sheet-mining-pro');
    await ensureMiningProLoaded();
    renderMiningWatchlist();
    renderMiningPoolSelector();
    renderMiningTelemetry();
    refreshMiningNetworkBar();
    if (inp && inp.value && !st.mining.telemetry) {
      runMiningDeepQuery();
    }
  }

  async function refreshMiningNetworkBar() {
    const st = getState();
    const mining = getMining() || await ensureMiningProLoaded();
    if (!mining) return;
    try {
      const net = await mining.fetchNetworkAndPoolTelemetry();
      st.mining.networkStats = net;
      renderMiningNetworkBar();
    } catch (_) {}
  }

  function renderMiningNetworkBar() {
    const st = getState();
    const el = $('mining-network-bar');
    if (!el) return;
    const net = st.mining.networkStats && st.mining.networkStats.network;
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountMiningTelemetryPanel === 'function') {
      fw.mountMiningTelemetryPanel(el, {
        mode: 'network',
        network: net || null,
        isEn: st.lang === 'en'
      });
      return;
    }
    if (!net) {
      el.innerHTML = `<div class="meta-row"><span class="meta-key">Pearl Mainnet</span><span class="meta-val">--</span></div>`;
      return;
    }
    el.innerHTML = `
      <div class="meta-row"><span class="meta-key">${t('区块高度', 'Height')}</span><span class="meta-val mono">${net.height !== null ? net.height.toLocaleString() : '--'}</span></div>
      <div class="meta-row"><span class="meta-key">${t('全网算力', 'Net Hashrate')}</span><span class="meta-val mono">${escapeHtml(net.networkHashrateFormatted || '--')}</span></div>
      <div class="meta-row"><span class="meta-key">${t('全网难度 / 块奖励', 'Diff / Reward')}</span><span class="meta-val mono">${net.difficultyM !== null ? net.difficultyM + 'M' : '--'} · ${net.blockRewardPrl !== null ? net.blockRewardPrl + ' PRL' : '--'}</span></div>
    `;
  }

  function renderMiningPoolSelector() {
    const poolKey = getState().mining.poolKey || 'auto';
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#sheet-mining-pro [data-pool]').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-pool') === poolKey);
      });
    }
  }

  function setMiningPoolKey(poolKey) {
    getState().mining.poolKey = poolKey;
    renderMiningPoolSelector();
    runMiningDeepQuery();
  }

  function renderMiningWatchlist() {
    const mining = getMining();
    const wrap = $('mining-watchlist');
    if (!wrap || !mining) return;
    const list = mining.getSavedMinerAddresses();
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountMiningTelemetryPanel === 'function') {
      fw.mountMiningTelemetryPanel(wrap, {
        mode: 'watchlist',
        watchlist: list,
        isEn: getState().lang === 'en',
        shortenAddr
      });
      return;
    }
    if (list.length === 0) {
      if (fw && typeof fw.render === 'function') {
        try { fw.render(null, wrap); } catch (_) {}
      }
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = list.map((item) => `
      <span class="filter-pill" style="display:inline-flex;align-items:center;gap:6px;">
        <span style="cursor:pointer;" data-action="select-miner" data-addr="${escapeHtml(item.address)}">${escapeHtml(item.label || shortenAddr(item.address, 6, 5))}</span>
        <span style="cursor:pointer;opacity:0.65;" data-action="remove-miner" data-addr="${escapeHtml(item.address)}">×</span>
      </span>
    `).join('');
  }

  function selectSavedMiner(addr) {
    if ($('mining-address-input')) $('mining-address-input').value = addr;
    runMiningDeepQuery();
  }

  async function saveCurrentMinerAddress() {
    const mining = getMining() || await ensureMiningProLoaded();
    const addr = ($('mining-address-input')?.value || '').trim();
    if (!addr || !mining) return;
    try {
      mining.addSavedMinerAddress(addr, '', getState().mining.poolKey);
      renderMiningWatchlist();
      showToast(t('已加入矿工收藏列表', 'Saved to watchlist'));
    } catch (err) {
      showToast(toUserFriendlyError(err, '无效 Pearl 地址', 'Invalid Pearl address'));
    }
  }

  async function removeSavedMiner(addr) {
    const mining = getMining() || await ensureMiningProLoaded();
    if (!mining) return;
    mining.removeSavedMinerAddress(addr);
    renderMiningWatchlist();
  }

  let _miningQueryGen = 0;

  async function runMiningDeepQuery() {
    const st = getState();
    const mining = getMining() || await ensureMiningProLoaded();
    const addr = ($('mining-address-input')?.value || '').trim();
    if (!addr) {
      showToast(t('请输入 prl1p... 矿工地址', 'Enter prl1p... miner address'));
      return;
    }
    if (!mining) return;
    const myGen = ++_miningQueryGen;
    st.mining.minerAddress = addr;
    st.mining.loading = true;
    st.mining.telemetry = null;
    renderMiningTelemetry();
    const queryBtn = $('btn-mining-query') || (typeof event !== 'undefined' && event?.target?.closest ? event.target.closest('button') : null);
    if (queryBtn) {
      queryBtn.disabled = true;
      queryBtn.textContent = t('查询中...', 'Querying...');
    }
    try {
      const tel = await mining.queryMinerDeepStats(addr, st.mining.poolKey);
      if (myGen !== _miningQueryGen) return;
      st.mining.loading = false;
      st.mining.telemetry = tel;
      renderMiningTelemetry();
      if (tel && tel.hashrateCurrent === null && tel.unpaidBalancePrl === null && (tel.workersOnlineCount === null || tel.workersOnlineCount === 0)) {
        const isStaticWeb = typeof window !== 'undefined' && window.location && !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || '') && !window.Capacitor?.Plugins?.CapacitorHttp;
        if (isStaticWeb) {
          showToast(t('网页版暂无法直接连接矿池，请使用原生 App 查看矿机状态', 'Pool status is unavailable in web view; please use the native App'));
        }
      }
    } catch (err) {
      if (myGen === _miningQueryGen) {
        st.mining.loading = false;
        renderMiningTelemetry();
        const errMsg = toUserFriendlyError(err, '矿工数据查询失败', 'Miner query failed');
        const isStaticWeb = typeof window !== 'undefined' && window.location && !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || '') && !window.Capacitor?.Plugins?.CapacitorHttp;
        showToast(isStaticWeb ? t('网页版暂无法直接连接矿池，请使用原生 App 查看矿机状态', 'Pool status is unavailable in web view; please use the native App') : errMsg);
      }
    } finally {
      if (myGen === _miningQueryGen && st.mining.loading) {
        st.mining.loading = false;
        renderMiningTelemetry();
      }
      if (myGen === _miningQueryGen && queryBtn) {
        queryBtn.disabled = false;
        queryBtn.textContent = t('查询', 'Query');
      }
    }
  }

  function renderMiningTelemetry() {
    const tel = getState().mining.telemetry;
    if ($('mining-kpi-30m')) $('mining-kpi-30m').textContent = tel ? (tel.hashrateCurrentFormatted || '--') : '--';
    if ($('mining-kpi-3h')) $('mining-kpi-3h').textContent = tel ? (tel.hashrateAvg3hFormatted || '--') : '--';
    const st = getState();
    const isOnChainMode = (st && st.mining && st.mining.poolKey === 'onchain') || Boolean(tel && tel.poolSource === 'onchain');

    if ($('mining-kpi-24h')) $('mining-kpi-24h').textContent = tel ? (tel.hashrateAvg24hFormatted || '--') : '--';
    if ($('mining-kpi-unpaid')) $('mining-kpi-unpaid').textContent = tel && tel.unpaidBalancePrl !== null ? `${formatBal(tel.unpaidBalancePrl, 4)} PRL` : '--';
    if ($('mining-payout-progress')) $('mining-payout-progress').style.width = `${tel && tel.payoutProgressPct !== null ? tel.payoutProgressPct : 0}%`;
    if ($('mining-threshold-label')) {
      $('mining-threshold-label').textContent = tel && tel.payoutThresholdPrl !== null
        ? `${t('阈值', 'Threshold')}: ${tel.payoutThresholdPrl} PRL (${tel.payoutProgressPct ?? '--'}%)`
        : (isOnChainMode
          ? `${t('链上累计转入', 'On-Chain In')}: ${tel && tel.totalPaidPrl !== null ? tel.totalPaidPrl + ' PRL' : '--'}`
          : `${t('已支付', 'Paid')}: ${tel && tel.totalPaidPrl !== null ? tel.totalPaidPrl + ' PRL' : '--'}`);
    }
    if ($('mining-kpi-share-rate')) $('mining-kpi-share-rate').textContent = tel && tel.shareAcceptRatePct !== null ? `${tel.shareAcceptRatePct}%` : '--';
    if ($('mining-kpi-share-counts')) {
      $('mining-kpi-share-counts').textContent = tel && tel.sharesValid !== null
        ? `${t('有效', 'Valid')}: ${tel.sharesValid} / ${t('无效', 'Invalid')}: ${tel.sharesInvalid ?? 0}`
        : '--';
    }

    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const tbody = $('mining-workers-tbody');
    if (tbody) {
      const workers = tel && Array.isArray(tel.workers) ? tel.workers : [];
      if (fw && typeof fw.mountMiningWorkersPanel === 'function') {
        fw.mountMiningWorkersPanel(tbody, {
          workers,
          loading: Boolean(st && st.mining && st.mining.loading),
          isEn: st.lang === 'en'
        });
      } else if (workers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">${t('暂无矿机记录', 'No active rigs')}</td></tr>`;
      } else {
        tbody.innerHTML = workers.map((w) => `
          <tr>
            <td style="font-weight:700;color:#fff;">${escapeHtml(w.name)}</td>
            <td><span class="status-pill ${w.status === 'online' ? 'online' : 'offline'}">${w.status === 'online' ? t('在线', 'Online') : t('离线', 'Offline')}</span></td>
            <td class="mono">${escapeHtml(w.hashrate30mFormatted || '--')}</td>
            <td class="mono">${escapeHtml(w.hashrate24hFormatted || '--')}</td>
            <td class="mono">${w.validShares !== null ? w.validShares : '--'} / ${w.rejectedShares !== null ? w.rejectedShares : '--'}</td>
          </tr>
        `).join('');
      }
    }

    const payoutsTitleEl = $('mining-payouts-title');
    if (payoutsTitleEl) {
      payoutsTitleEl.textContent = isOnChainMode ? t('链上转入记录', 'On-Chain Transfers') : t('近期打款记录', 'Recent Payouts');
    }

    const payoutsEl = $('mining-payouts-list');
    const payoutsAllBtn = $('mining-payouts-all-btn');
    if (payoutsEl) {
      const payouts = tel && Array.isArray(tel.payoutHistory) ? tel.payoutHistory : [];
      _lastMiningNormalizedPayouts = payouts.map((p, idx) => {
        const tsSec = p.timestamp ? Math.floor(new Date(p.timestamp).getTime() / 1000) : null;
        return {
          id: `mine_${p.txid || idx}`,
          type: isOnChainMode ? 'receive' : 'mine',
          symbol: 'PRL',
          chain: 'prl',
          amount: p.amountPrl !== null && Number.isFinite(Number(p.amountPrl)) ? Number(p.amountPrl) : null,
          netAmount: p.amountPrl !== null && Number.isFinite(Number(p.amountPrl)) ? Number(p.amountPrl) : null,
          txHash: p.txid || '',
          status: p.status || 'confirmed',
          counterparty: (tel && tel.address) || getState().mining.minerAddress || '',
          title: isOnChainMode ? t('链上转入', 'On-Chain Transfer') : t('矿池打款', 'Pool Payout'),
          timestamp: Number.isFinite(tsSec) ? tsSec : null
        };
      });
      if (payoutsAllBtn) payoutsAllBtn.classList.toggle('hidden', _lastMiningNormalizedPayouts.length === 0);
      if (fw && typeof fw.mountMiningTelemetryPanel === 'function') {
        fw.mountMiningTelemetryPanel(payoutsEl, {
          mode: 'payouts',
          payouts: _lastMiningNormalizedPayouts,
          isOnChainMode,
          isEn: st.lang === 'en'
        });
      } else if (_lastMiningNormalizedPayouts.length === 0) {
        payoutsEl.innerHTML = `<div class="text-muted" style="font-size:11.5px;text-align:center;padding:8px;">${isOnChainMode ? t('暂无链上转入记录', 'No incoming transfers') : t('暂无打款记录', 'No payout history')}</div>`;
      } else {
        payoutsEl.innerHTML = renderCompactTxPreviewHtml(_lastMiningNormalizedPayouts, 'mining', 'PRL');
      }
    }
  }

