  // ==================== Solana Rent Reclaim & Dust Burn ====================

  let _solRentScanAccounts = [];
  let _solRentSelectedAtas = new Set();
  let _solRentScanSeq = 0;
  let _solRentReclaimInFlight = false;

  function openSolRentReclaimSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet || !wallet.solAddress) {
      showToast(t('当前账户暂不支持 Solana 租金回收', 'Solana rent reclaim is not available for this account'));
      return;
    }
    _solRentScanAccounts = [];
    _solRentSelectedAtas = new Set();
    openSheet('sheet-sol-rent');
    scanSolRentReclaimUI();
  }

  async function scanSolRentReclaimUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const listEl = $('sol-rent-list');
    const sumEl = $('sol-rent-summary');
    if (!wallet || !wallet.solAddress || !contracts || typeof contracts.scanSolanaReclaimableAccounts !== 'function') return;

    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const refreshBtn = $('btn-refresh-sol-rent');
    const execBtn = $('btn-execute-sol-rent');
    const prevRefreshTxt = refreshBtn ? refreshBtn.textContent : '';
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = t('扫描中...', 'Scanning...');
    }
    if (execBtn) {
      execBtn.disabled = true;
      execBtn.textContent = t('扫描中...', 'Scanning...');
    }
    if (sumEl) sumEl.textContent = t('扫描中...', 'Scanning...');
    if (listEl && fw && typeof fw.mountSolRentPanel === 'function') {
      fw.mountSolRentPanel(listEl, { accounts: [], selectedAtas: [], loading: true, isEn: st.lang === 'en', formatBal });
    }

    const solTokens = getSwapTokenCatalog().filter((tk) => String(tk.blockchain || '').toLowerCase() === 'sol' && tk.contractAddress);
    const tokenByMint = new Map();
    for (const tk of solTokens) tokenByMint.set(tk.contractAddress, tk);

    const scanSeq = ++_solRentScanSeq;
    const activeWalletId = wallet.id;
    const activeSolAddr = wallet.solAddress;
    const isStaleScan = () => {
      const cur = st.getActiveWallet();
      return scanSeq !== _solRentScanSeq || !cur || cur.id !== activeWalletId || cur.solAddress !== activeSolAddr;
    };

    try {
      const scanPromise = contracts.scanSolanaReclaimableAccounts(activeSolAddr, {
        priceResolver: (mint) => {
          const tk = tokenByMint.get(mint);
          if (!tk) return null;
          const p = getSymbolPrice(tk.symbol);
          return p !== null && Number.isFinite(Number(p)) ? Number(p) : null;
        }
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(t('Solana 网络响应超时，请点击刷新重试', 'Solana network timed out, please tap Refresh'))), 10000)
      );
      const res = await Promise.race([scanPromise, timeoutPromise]);
      if (isStaleScan()) return;
      _solRentScanAccounts = (res.accounts || []).map((acc) => {
        const tk = tokenByMint.get(acc.mint);
        return {
          ...acc,
          symbol: tk ? tk.symbol : shortenAddr(acc.mint)
        };
      });
      _solRentSelectedAtas = new Set(
        _solRentScanAccounts
          .filter((acc) => acc.isEmpty)
          .map((acc) => acc.ataAddress)
      );
      renderSolRentList();
    } catch (err) {
      if (isStaleScan()) return;
      if (sumEl) sumEl.textContent = '--';
      if (execBtn) {
        execBtn.disabled = true;
        execBtn.textContent = t('暂不可回收', 'Unavailable');
      }
      if (listEl && fw && typeof fw.mountSolRentPanel === 'function') {
        const errText = toUserFriendlyError(err, '扫描失败', 'Scan failed');
        fw.mountSolRentPanel(listEl, { accounts: [], selectedAtas: [], loading: false, errorMsg: errText, isEn: st.lang === 'en', formatBal });
      }
    } finally {
      if (refreshBtn && scanSeq === _solRentScanSeq) {
        refreshBtn.disabled = false;
        if (prevRefreshTxt) refreshBtn.textContent = prevRefreshTxt;
      }
    }
  }

  function renderSolRentList() {
    const listEl = $('sol-rent-list');
    const sumEl = $('sol-rent-summary');
    const execBtn = $('btn-execute-sol-rent');
    if (!listEl) return;

    const emptyCount = _solRentScanAccounts.filter((a) => a.isEmpty).length;
    const dustCount = _solRentScanAccounts.filter((a) => a.isDust).length;
    const selectedList = _solRentScanAccounts.filter((a) => _solRentSelectedAtas.has(a.ataAddress));
    const selectedSol = selectedList.reduce((s, a) => s + Number(a.rentSol || 0), 0);

    if (sumEl) {
      sumEl.textContent = `${t('空账户', 'Empty')}: ${emptyCount} · ${t('粉尘', 'Dust')}: ${dustCount}`;
    }
    if (execBtn) {
      execBtn.disabled = selectedList.length === 0;
      execBtn.textContent = selectedList.length > 0
        ? `${t('一键回收并领取', 'Reclaim Selected')} (+${selectedSol.toFixed(4)} SOL)`
        : t('无可回收账户', 'Nothing Selected');
    }

    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountSolRentPanel === 'function') {
      const st = getState();
      fw.mountSolRentPanel(listEl, {
        accounts: _solRentScanAccounts,
        selectedAtas: Array.from(_solRentSelectedAtas),
        loading: false,
        isEn: st.lang === 'en',
        formatBal
      });
    }
  }

  function toggleSolRentItem(ataAddress, isChecked) {
    if (isChecked) _solRentSelectedAtas.add(ataAddress);
    else _solRentSelectedAtas.delete(ataAddress);
    renderSolRentList();
  }

  async function executeSolRentReclaimUI() {
    if (_solRentReclaimInFlight) return;
    const st = getState();
    const wallet = st.getActiveWallet();
    const contracts = getContracts();
    const selected = _solRentScanAccounts.filter((a) => _solRentSelectedAtas.has(a.ataAddress));
    if (!wallet || selected.length === 0 || !contracts || typeof contracts.executeSolanaRentReclaim !== 'function') return;

    const totalSol = selected.reduce((s, a) => s + Number(a.rentSol || 0), 0);
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    const burnItems = selected.filter((a) => !a.isEmpty && a.mint !== WSOL_MINT);
    const burnSummary = burnItems.slice(0, 3).map((a) => `${a.symbol}(${formatBal(a.uiAmount, 4)})`).join(', ') + (burnItems.length > 3 ? ` +${burnItems.length - 3}` : '');
    const promptText = burnItems.length > 0
      ? `${t('⚠️ 危险：将永久销毁有余额代币', '⚠️ WARNING: Permanently BURN')} [${burnSummary}] ${t('以回收', 'to reclaim')} +${totalSol.toFixed(4)} SOL`
      : `${t('回收', 'Reclaim')} ${selected.length} ${t('个空账户/WSOL 租金', 'empty/WSOL accounts')} (+${totalSol.toFixed(4)} SOL)`;

    _solRentReclaimInFlight = true;
    const btn = $('btn-execute-sol-rent');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('回收中...', 'Reclaiming...');
    }
    try {
      if (burnItems.length > 0) {
        const confirmMsg = t(
          `所选账户包含仍有余额的代币 [${burnSummary}]，销毁后资产将永久丢失且无法找回！是否确认销毁并回收 +${totalSol.toFixed(4)} SOL 租金？`,
          `Selected accounts still hold tokens [${burnSummary}]. Burning them will permanently destroy those assets! Continue to burn and reclaim +${totalSol.toFixed(4)} SOL?`
        );
        if (!(await showConfirmDialogAsync(confirmMsg, {
          danger: true,
          title: t('确认销毁代币并回收租金', 'Confirm Burn & Reclaim')
        }))) return;
      }
      if (!(await verifySecurityAuthAsync(wallet, promptText))) return;
      const res = await contracts.executeSolanaRentReclaim({ wallet, accounts: selected });
      const firstHash = res.txHashes && res.txHashes[0] ? `: ${shortenAddr(res.txHashes[0])}` : '';
      showToast(`✅ ${t('已回收', 'Reclaimed')} +${res.reclaimedSol.toFixed(4)} SOL (${res.closedCount} ${t('个账户', 'accounts')})${firstHash}`);
      await scanSolRentReclaimUI();
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(toUserFriendlyError(err, '租金回收失败', 'Rent reclaim failed'));
      await scanSolRentReclaimUI().catch(() => {});
    } finally {
      _solRentReclaimInFlight = false;
      if (btn && _solRentSelectedAtas.size > 0) {
        btn.disabled = false;
      }
      if (btn && btn.textContent === t('回收中...', 'Reclaiming...')) {
        btn.textContent = prevTxt;
      }
    }
  }

