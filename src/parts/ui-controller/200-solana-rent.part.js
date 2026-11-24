  // ==================== Solana Rent Reclaim & Dust Burn ====================

  let _solRentScanAccounts = [];
  let _solRentSelectedAtas = new Set();

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

    if (sumEl) sumEl.textContent = t('扫描中...', 'Scanning...');
    if (listEl) listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:12px;text-align:center;">${t('正在扫描 Solana 代币账户...', 'Scanning Solana token accounts...')}</div>`;

    const solTokens = getSwapTokenCatalog().filter((tk) => String(tk.blockchain || '').toLowerCase() === 'sol' && tk.contractAddress);
    const tokenByMint = new Map();
    for (const tk of solTokens) tokenByMint.set(tk.contractAddress, tk);

    try {
      const scanPromise = contracts.scanSolanaReclaimableAccounts(wallet.solAddress, {
        priceResolver: (mint) => {
          const tk = tokenByMint.get(mint);
          if (!tk) return null;
          const p = getSymbolPrice(tk.symbol);
          return p !== null && Number.isFinite(Number(p)) ? Number(p) : null;
        }
      });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(t('Solana 节点响应超时，请点击刷新重试', 'Solana RPC timed out, please tap Refresh'))), 7000)
      );
      const res = await Promise.race([scanPromise, timeoutPromise]);
      _solRentScanAccounts = (res.accounts || []).map((acc) => {
        const tk = tokenByMint.get(acc.mint);
        return {
          ...acc,
          symbol: tk ? tk.symbol : shortenAddr(acc.mint)
        };
      });
      _solRentSelectedAtas = new Set(
        _solRentScanAccounts
          .filter((acc) => acc.isEmpty || acc.isDust)
          .map((acc) => acc.ataAddress)
      );
      renderSolRentList();
    } catch (err) {
      if (sumEl) sumEl.textContent = '--';
      if (listEl) listEl.innerHTML = `<div style="font-size:12px;color:var(--rose-alert);padding:12px;text-align:center;">${escapeHtml(err && err.message ? err.message : t('扫描失败', 'Scan failed'))}</div>`;
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

    if (_solRentScanAccounts.length === 0) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text-secondary);padding:16px;text-align:center;">${t('当前钱包没有可回收的 Solana 代币账户', 'No reclaimable Solana token accounts found')}</div>`;
      return;
    }

    listEl.innerHTML = _solRentScanAccounts.map((acc) => {
      const checked = _solRentSelectedAtas.has(acc.ataAddress) ? 'checked' : '';
      const badgeHtml = acc.isEmpty
        ? `<span class="ca-badge" style="font-size:10px;">${t('空账户', 'Empty')}</span>`
        : (acc.isDust
            ? `<span class="ca-badge" style="font-size:10px;border-color:rgba(251,113,133,0.4);color:var(--rose-alert);">${t('粉尘粉碎', 'Burn Dust')}</span>`
            : `<span class="ca-badge" style="font-size:10px;border-color:rgba(251,191,36,0.4);color:#fbbf24;">${t('有余额 (慎选)', 'Has Balance')}</span>`);
      const balInfo = acc.isEmpty
        ? t('余额: 0', 'Bal: 0')
        : `${t('余额', 'Bal')}: ${formatBal(acc.uiAmount, 6)}${acc.usdValue !== null ? ` (~$${acc.usdValue.toFixed(4)})` : ''}`;
      return `
        <label class="ios-glass-card flex items-center justify-between gap-2" style="padding:10px 12px;cursor:pointer;">
          <div class="flex items-center gap-2" style="min-width:0;">
            <input type="checkbox" ${checked} data-action="toggle-sol-rent" data-ata="${escapeHtml(acc.ataAddress)}" />
            <div class="flex flex-col" style="min-width:0;">
              <div class="flex items-center gap-1">
                <span style="font-weight:700;font-size:12.5px;">${escapeHtml(acc.symbol)}</span>
                ${badgeHtml}
              </div>
              <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(balInfo)}</span>
            </div>
          </div>
          <span class="mono" style="font-size:12px;font-weight:700;color:var(--mint-accent);white-space:nowrap;">+${acc.rentSol.toFixed(4)} SOL</span>
        </label>
      `;
    }).join('');
  }

  function toggleSolRentItem(ataAddress, isChecked) {
    if (isChecked) _solRentSelectedAtas.add(ataAddress);
    else _solRentSelectedAtas.delete(ataAddress);
    renderSolRentList();
  }

  async function executeSolRentReclaimUI() {
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

    if (!(await verifySecurityAuthAsync(wallet, promptText))) return;

    const btn = $('btn-execute-sol-rent');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('回收中...', 'Reclaiming...');
    }
    try {
      const res = await contracts.executeSolanaRentReclaim({ wallet, accounts: selected });
      const firstHash = res.txHashes && res.txHashes[0] ? `: ${shortenAddr(res.txHashes[0])}` : '';
      showToast(`✅ ${t('已回收', 'Reclaimed')} +${res.reclaimedSol.toFixed(4)} SOL (${res.closedCount} ${t('个账户', 'accounts')})${firstHash}`);
      await scanSolRentReclaimUI();
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(err && err.message ? err.message : t('租金回收失败', 'Rent reclaim failed'));
      await scanSolRentReclaimUI().catch(() => {});
    } finally {
      if (btn && _solRentSelectedAtas.size > 0) {
        btn.disabled = false;
      }
      if (btn && btn.textContent === t('回收中...', 'Reclaiming...')) {
        btn.textContent = prevTxt;
      }
    }
  }

