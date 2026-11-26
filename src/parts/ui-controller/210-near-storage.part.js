  // ==================== NEAR NEP-145 Storage Deposit Reclaim ====================

  let _nearStorageScanAccounts = [];
  let _nearStorageSelectedContracts = new Set();
  let _nearStorageScanSeq = 0;
  let _nearStorageReclaimInFlight = false;

  function openNearStorageReclaimSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const nearAcct = wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : '';
    if (!wallet || !nearAcct) {
      showToast(t('当前账户暂不支持 NEAR 存储押金回收', 'NEAR storage reclaim is not available for this account'));
      return;
    }
    _nearStorageScanAccounts = [];
    _nearStorageSelectedContracts = new Set();
    openSheet('sheet-near-storage');
    scanNearStorageReclaimUI();
  }

  async function scanNearStorageReclaimUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const nearAcct = wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : '';
    const listEl = $('near-storage-list');
    const sumEl = $('near-storage-summary');
    if (!wallet || !nearAcct || !contracts || typeof contracts.scanNearReclaimableStorageAsync !== 'function') return;

    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const refreshBtn = $('btn-refresh-near-storage');
    const prevRefreshTxt = refreshBtn ? refreshBtn.textContent : '';
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = t('扫描中...', 'Scanning...');
    }
    if (sumEl) sumEl.textContent = t('扫描中...', 'Scanning...');
    if (listEl) {
      if (fw && typeof fw.mountNearStoragePanel === 'function') {
        fw.mountNearStoragePanel(listEl, { accounts: [], selectedContracts: [], loading: true, isEn: st.lang === 'en', formatBal });
      } else {
        listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:12px;text-align:center;">${t('正在扫描 NEAR 代币合约存储押金...', 'Scanning NEAR token storage deposits...')}</div>`;
      }
    }

    const scanSeq = ++_nearStorageScanSeq;
    const activeWalletId = wallet.id;
    const isStaleScan = () => {
      const cur = st.getActiveWallet();
      const curAcct = cur ? (cur.nearNamedAccount || cur.nearAddress) : '';
      return scanSeq !== _nearStorageScanSeq || !cur || cur.id !== activeWalletId || curAcct !== nearAcct;
    };

    try {
      const scanPromise = contracts.scanNearReclaimableStorageAsync(nearAcct);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(t('NEAR 网络响应超时，请点击刷新重试', 'NEAR network timed out, please tap Refresh'))), 8000)
      );
      const res = await Promise.race([scanPromise, timeoutPromise]);
      if (isStaleScan()) return;
      _nearStorageScanAccounts = Array.isArray(res && res.accounts) ? res.accounts : [];
      _nearStorageSelectedContracts = new Set(
        _nearStorageScanAccounts
          .filter((acc) => acc.isEmpty)
          .map((acc) => acc.contractId)
      );
      renderNearStorageList();
    } catch (err) {
      if (isStaleScan()) return;
      if (sumEl) sumEl.textContent = '--';
      if (listEl) {
        const errText = toUserFriendlyError(err, '扫描失败', 'Scan failed');
        if (fw && typeof fw.mountNearStoragePanel === 'function') {
          fw.mountNearStoragePanel(listEl, { accounts: [], selectedContracts: [], loading: false, errorMsg: errText, isEn: st.lang === 'en', formatBal });
        } else {
          listEl.innerHTML = `<div style="font-size:12px;color:var(--rose-alert);padding:12px;text-align:center;">${escapeHtml(errText)}</div>`;
        }
      }
    } finally {
      if (refreshBtn && scanSeq === _nearStorageScanSeq) {
        refreshBtn.disabled = false;
        if (prevRefreshTxt) refreshBtn.textContent = prevRefreshTxt;
      }
    }
  }

  function renderNearStorageList() {
    const listEl = $('near-storage-list');
    const sumEl = $('near-storage-summary');
    const execBtn = $('btn-execute-near-storage');
    if (!listEl) return;

    const emptyCount = _nearStorageScanAccounts.filter((a) => a.isEmpty).length;
    const lockedCount = _nearStorageScanAccounts.filter((a) => !a.isEmpty).length;
    const selectedList = _nearStorageScanAccounts.filter((a) => a.isEmpty && _nearStorageSelectedContracts.has(a.contractId));
    const selectedNear = selectedList.reduce((s, a) => s + Number(a.depositNear || 0), 0);

    if (sumEl) {
      sumEl.textContent = `${t('可回收', 'Reclaimable')}: ${emptyCount} · ${t('持仓占用', 'In Use')}: ${lockedCount}`;
    }
    if (execBtn) {
      execBtn.disabled = selectedList.length === 0;
      execBtn.textContent = selectedList.length > 0
        ? `${t('一键回收存储押金', 'Reclaim Storage Deposits')} (+${selectedNear.toFixed(5)} NEAR)`
        : t('无可回收合约', 'Nothing Selected');
    }

    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountNearStoragePanel === 'function') {
      const st = getState();
      fw.mountNearStoragePanel(listEl, {
        accounts: _nearStorageScanAccounts,
        selectedContracts: Array.from(_nearStorageSelectedContracts),
        loading: false,
        isEn: st.lang === 'en',
        formatBal
      });
      return;
    }

    if (_nearStorageScanAccounts.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:16px;text-align:center;">${t('当前 NEAR 账户暂无检测到存储押金记录', 'No NEAR token storage deposits found')}</div>`;
      return;
    }

    listEl.innerHTML = _nearStorageScanAccounts.map((acc) => {
      const checked = acc.isEmpty && _nearStorageSelectedContracts.has(acc.contractId) ? 'checked' : '';
      const disabledAttr = acc.isEmpty ? '' : 'disabled';
      const badgeHtml = acc.isEmpty
        ? `<span class="ca-badge" style="font-size:10px;">${t('空账本可回收', 'Empty · Reclaimable')}</span>`
        : `<span class="ca-badge" style="font-size:10px;border-color:rgba(251,191,36,0.4);color:#fbbf24;">${t('持仓中', 'In Use')}</span>`;
      const balInfo = acc.isEmpty
        ? `${t('余额: 0', 'Bal: 0')} · ${acc.contractId}`
        : `${t('余额', 'Bal')}: ${formatBal(acc.uiAmount, 5)} · ${acc.contractId}`;
      return `
        <label class="ios-glass-card flex items-center justify-between gap-2" style="padding:10px 12px;cursor:${acc.isEmpty ? 'pointer' : 'default'};${acc.isEmpty ? '' : 'opacity:0.75;'}">
          <div class="flex items-center gap-2" style="min-width:0;flex:1;">
            <input type="checkbox" ${checked} ${disabledAttr} data-action="toggle-near-storage" data-contract="${escapeHtml(acc.contractId)}" />
            <div class="flex flex-col" style="min-width:0;flex:1;">
              <div class="flex items-center gap-1">
                <span style="font-weight:700;font-size:12.5px;">${escapeHtml(acc.symbol)}</span>
                ${badgeHtml}
              </div>
              <span class="mono" style="font-size:10.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(balInfo)}</span>
            </div>
          </div>
          <span class="mono" style="font-size:12px;font-weight:700;color:${acc.isEmpty ? 'var(--mint-accent)' : 'var(--text-secondary)'};white-space:nowrap;">+${Number(acc.depositNear || 0).toFixed(5)} NEAR</span>
        </label>
      `;
    }).join('');
  }

  function toggleNearStorageItem(contractId, isChecked) {
    if (isChecked) _nearStorageSelectedContracts.add(contractId);
    else _nearStorageSelectedContracts.delete(contractId);
    renderNearStorageList();
  }

  async function executeNearStorageReclaimUI() {
    if (_nearStorageReclaimInFlight) return;
    const st = getState();
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const selected = _nearStorageScanAccounts.filter((a) => a.isEmpty && _nearStorageSelectedContracts.has(a.contractId));
    if (!wallet || selected.length === 0 || !contracts || typeof contracts.executeNearStorageReclaim !== 'function') return;

    const totalNear = selected.reduce((s, a) => s + Number(a.depositNear || 0), 0);
    const promptText = `${t('回收 NEAR 存储押金', 'Reclaim NEAR Storage')} (${selected.length} · +${totalNear.toFixed(5)} NEAR)`;
    _nearStorageReclaimInFlight = true;
    const btn = $('btn-execute-near-storage');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('回收中...', 'Reclaiming...');
    }
    try {
      if (!(await verifySecurityAuthAsync(wallet, promptText))) return;
      const res = await contracts.executeNearStorageReclaim({ wallet, contracts: selected });
      const firstHash = res.txHashes && res.txHashes[0] ? `: ${shortenAddr(res.txHashes[0])}` : '';
      showToast(`✅ ${t('已回收', 'Reclaimed')} +${totalNear.toFixed(5)} NEAR (${res.reclaimedCount} ${t('个合约', 'contracts')})${firstHash}`);
      await scanNearStorageReclaimUI();
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(toUserFriendlyError(err, '存储押金回收失败', 'Storage reclaim failed'));
      await scanNearStorageReclaimUI().catch(() => {});
    } finally {
      _nearStorageReclaimInFlight = false;
      if (btn && _nearStorageSelectedContracts.size > 0) {
        btn.disabled = false;
      }
      if (btn && btn.textContent === t('回收中...', 'Reclaiming...')) {
        btn.textContent = prevTxt;
      }
    }
  }

