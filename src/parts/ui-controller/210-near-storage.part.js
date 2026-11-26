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
    if (listEl && fw && typeof fw.mountNearStoragePanel === 'function') {
      fw.mountNearStoragePanel(listEl, { accounts: [], selectedContracts: [], loading: true, isEn: st.lang === 'en', formatBal });
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
      if (listEl && fw && typeof fw.mountNearStoragePanel === 'function') {
        const errText = toUserFriendlyError(err, '扫描失败', 'Scan failed');
        fw.mountNearStoragePanel(listEl, { accounts: [], selectedContracts: [], loading: false, errorMsg: errText, isEn: st.lang === 'en', formatBal });
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
    }
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

