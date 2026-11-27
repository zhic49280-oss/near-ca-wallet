  let _perpFundingBusy = false;

  function getEligiblePerpOneClickEntries(wallet) {
    const hl = getHyperliquid();
    if (!wallet || !hl) return [];
    return getSendSourceEntriesForWallet(wallet).filter(
      (e) => Number(e.balance || 0) > 0 && hl.isDirectOneClickOriginForHl(e)
    );
  }

  function evaluatePerpOneClickState({ entry = null, amount = 0, quote = null, quoteError = '', quoting = false } = {}) {
    if (!entry) {
      return { disabled: true, error: '', text: t('暂无可用跨链资产', 'No eligible asset') };
    }
    const amt = Number(amount);
    const avail = Number(entry.balance || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', text: t('请输入充值数量', 'Enter amount') };
    }
    if (amt > avail + 1e-12) {
      const msg = t(`${entry.symbol} 余额不足 (可用: ${formatBal(avail, 4)})`, `Insufficient ${entry.symbol} (avail: ${formatBal(avail, 4)})`);
      return { disabled: true, error: msg, text: t(`${entry.symbol} 余额不足`, `Insufficient ${entry.symbol}`) };
    }
    if (quoting) {
      return { disabled: true, error: '', text: t('正在获取跨链报价...', 'Fetching route...') };
    }
    if (quoteError) {
      return { disabled: true, error: quoteError, text: t('当前路由暂不可用', 'Route unavailable') };
    }
    if (!quote || !quote.ok || !quote.amountOutFormatted) {
      return { disabled: true, error: '', text: t('等待跨链报价', 'Waiting for quote') };
    }
    return { disabled: false, error: '', text: t('确认跨链充值', 'Confirm Cross-Chain Deposit') };
  }

  function evaluatePerpArbDepositState({ amount = 0, arbUsdc = 0, arbEth = 0 } = {}) {
    const hl = getHyperliquid();
    const minUsdc = hl ? hl.HL_ARB_BRIDGE_MIN_USDC : 5;
    const minEth = hl ? hl.HL_ARB_MIN_ETH_GAS : 0.0002;
    const amt = Number(amount);
    const usdc = Number(arbUsdc || 0);
    const eth = Number(arbEth || 0);

    if (usdc < minUsdc) {
      const msg = t(`Arbitrum USDC 余额不足 (可用 ${usdc.toFixed(2)}，最低需 ${minUsdc} USDC)`, `Insufficient Arbitrum USDC (${usdc.toFixed(2)} avail, need >= ${minUsdc})`);
      return { disabled: true, error: msg, text: t('Arbitrum USDC 不足', 'Insufficient Arbitrum USDC') };
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', text: t('请输入充值数量 (>= 5 USDC)', 'Enter amount (>= 5 USDC)') };
    }
    if (amt < minUsdc) {
      const msg = t(`最低充值 ${minUsdc} USDC（低于 ${minUsdc} 将无法上账）`, `Minimum deposit is ${minUsdc} USDC`);
      return { disabled: true, error: msg, text: t(`最低充值 ${minUsdc} USDC`, `Min ${minUsdc} USDC`) };
    }
    if (amt > usdc + 1e-9) {
      const msg = t(`Arbitrum USDC 余额不足 (当前可用: ${usdc.toFixed(2)} USDC)`, `Insufficient Arbitrum USDC (avail: ${usdc.toFixed(2)})`);
      return { disabled: true, error: msg, text: t('Arbitrum USDC 不足', 'Insufficient Arbitrum USDC') };
    }
    if (eth < minEth) {
      const msg = t(`Arbitrum ETH Gas 不足 (需 >= ${minEth} ETH，当前 ${eth.toFixed(5)} ETH)`, `Need >= ${minEth} Arbitrum ETH for gas (${eth.toFixed(5)} avail)`);
      return { disabled: true, error: msg, text: t('Arbitrum ETH Gas 不足', 'Insufficient ETH Gas') };
    }
    return { disabled: false, error: '', text: t('确认 Arbitrum 充值', 'Confirm Arbitrum Deposit') };
  }

  function evaluatePerpWithdrawState({ amount = 0, withdrawable = null } = {}) {
    const hl = getHyperliquid();
    const minW = hl ? hl.HL_WITHDRAW_MIN_USDC : 2;
    const fee = hl ? hl.HL_WITHDRAW_FEE_USDC : 1;
    const amt = Number(amount);
    const avail = withdrawable === null || withdrawable === undefined ? 0 : Number(withdrawable);
    const netReceive = Number.isFinite(amt) && amt >= minW ? Math.max(0, amt - fee) : null;

    if (avail < minW) {
      const msg = t(`可提现余额不足 (当前 $${avail.toFixed(2)}，最低提现 ${minW} USDC)`, `Insufficient withdrawable ($${avail.toFixed(2)} avail, min ${minW} USDC)`);
      return { disabled: true, error: msg, netReceive: null, text: t('可提现余额不足', 'Insufficient Balance') };
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      return { disabled: true, error: '', netReceive: null, text: t('请输入提现数量', 'Enter withdraw amount') };
    }
    if (amt < minW) {
      const msg = t(`最低提现 ${minW} USDC（含 ${fee} USDC 协议手续费）`, `Minimum withdrawal is ${minW} USDC (incl. ${fee} USDC fee)`);
      return { disabled: true, error: msg, netReceive: null, text: t(`最低提现 ${minW} USDC`, `Min ${minW} USDC`) };
    }
    if (amt > avail + 1e-9) {
      const msg = t(`超出可提现余额 (可用: ${avail.toFixed(2)} USDC)`, `Exceeds withdrawable (${avail.toFixed(2)} USDC)`);
      return { disabled: true, error: msg, netReceive: null, text: t('超出可提现余额', 'Exceeds Withdrawable') };
    }
    return { disabled: false, error: '', netReceive, text: t('安全验证并提现', 'Verify & Withdraw') };
  }

  function evaluatePerpOneClickUI() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const entries = wallet ? getEligiblePerpOneClickEntries(wallet) : [];
    const selKey = $('perp-oc-origin-select')?.value || st.perp.fundingOriginAssetId || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0] || null;
    const amt = Number($('perp-oc-amount')?.value || 0);
    const res = evaluatePerpOneClickState({
      entry,
      amount: amt,
      quote: st.perp.fundingQuote,
      quoteError: st.perp.fundingQuoteError,
      quoting: st.perp.fundingQuoting
    });
    const outEl = $('perp-oc-quote-out');
    if (outEl) {
      if (st.perp.fundingQuoting) {
        outEl.className = 'meta-val';
        outEl.textContent = t('询价中...', 'Quoting...');
      } else if (st.perp.fundingQuote && st.perp.fundingQuote.ok && st.perp.fundingQuote.amountOutFormatted) {
        outEl.className = 'meta-val text-emerald';
        outEl.textContent = `${st.perp.fundingQuote.amountOutFormatted} USDC`;
      } else {
        outEl.className = 'meta-val';
        outEl.textContent = '--';
      }
    }
    const errEl = $('perp-oc-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const warnEl = $('perp-oc-fee-warn');
    if (warnEl) {
      let warnMsg = '';
      if (!st.perp.fundingQuoting && st.perp.fundingQuote && st.perp.fundingQuote.ok) {
        const q = st.perp.fundingQuote;
        const inUsd = Number(q.amountInUsd);
        const outUsd = Number(q.amountOutUsd);
        const outNum = Number(q.amountOutFormatted);
        let lossPct = NaN;
        if (Number.isFinite(inUsd) && inUsd > 0 && Number.isFinite(outUsd) && outUsd >= 0) {
          lossPct = ((inUsd - outUsd) / inUsd) * 100;
        } else if (entry && /^(USDC|USDT|USD)/i.test(String(entry.symbol || '')) && Number.isFinite(amt) && amt > 0 && Number.isFinite(outNum) && outNum >= 0) {
          lossPct = ((amt - outNum) / amt) * 100;
        }
        if ((Number.isFinite(lossPct) && lossPct > 3) || (Number.isFinite(outNum) && outNum > 0 && outNum < 5)) {
          const pctText = Number.isFinite(lossPct) && lossPct > 0 ? ` (~${lossPct.toFixed(1)}%)` : '';
          warnMsg = t(
            `小额跨链充值固定网络/跨链费用占比较高${pctText}，建议单笔 >= $10–$20 或使用 Arbitrum 直接充值。`,
            `Small cross-chain deposits incur a fixed network/bridge fee${pctText}. Consider >= $10–$20 or Arbitrum direct deposit.`
          );
        }
      }
      warnEl.textContent = warnMsg;
      warnEl.classList.toggle('hidden', !warnMsg);
    }
    const btn = $('btn-perp-oc-deposit');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  function evaluatePerpArbDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !contracts) return null;
    const arbUsdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    const arbEth = contracts.resolveWalletChainBalance(wallet, 'arb');
    const amt = Number($('perp-arb-amount')?.value || 0);
    const res = evaluatePerpArbDepositState({ amount: amt, arbUsdc, arbEth });
    const errEl = $('perp-arb-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const btn = $('btn-perp-arb-deposit');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  function evaluatePerpWithdrawUI() {
    const st = getState();
    const withdrawable = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    const amt = Number($('perp-withdraw-amount')?.value || 0);
    const res = evaluatePerpWithdrawState({ amount: amt, withdrawable });
    const netEl = $('perp-wd-net-val');
    if (netEl) netEl.textContent = res.netReceive !== null ? `${res.netReceive.toFixed(2)} USDC` : '--';
    const errEl = $('perp-wd-error');
    if (errEl) {
      errEl.textContent = res.error || '';
      errEl.classList.toggle('hidden', !res.error);
    }
    const btn = $('btn-perp-withdraw');
    if (btn) {
      btn.disabled = Boolean(res.disabled);
      btn.textContent = res.text;
    }
    return res;
  }

  async function setPerpOneClickMax() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    const entries = wallet ? getEligiblePerpOneClickEntries(wallet) : [];
    const selKey = $('perp-oc-origin-select')?.value || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0];
    if (!entry || !$('perp-oc-amount') || !(Number(entry.balance) > 0)) return;

    const isNative = isNativeSendAsset(entry);
    if (!isNative) {
      const rawUnits = getWalletTokenRawBaseUnits(wallet, entry.blockchain, entry.contractAddress);
      $('perp-oc-amount').value = formatMaxDecimalString(entry.balance, entry.decimals || 6, rawUnits);
      schedulePerpOneClickQuote();
      return;
    }

    const bc = String(entry.blockchain || '').toLowerCase();
    const liveGas = contracts && typeof contracts.estimateLiveNativeGasAsync === 'function'
      ? await contracts.estimateLiveNativeGasAsync({ wallet, chain: bc, kind: 'transfer' }).catch(() => null)
      : null;
    if (liveGas) {
      const walletKey = wallet.id || wallet.nearNamedAccount || wallet.nearAddress || 'default';
      st.perp._ocLiveGas = { key: `${walletKey}:${bc}:transfer`, ts: Date.now(), data: liveGas };
    }
    const buffers = (contracts && contracts.DEFAULT_GAS_BUFFERS) || {};
    const gasReserve = (liveGas && Number.isFinite(Number(liveGas.gasReserve)) && Number(liveGas.gasReserve) >= 0)
      ? Number(liveGas.gasReserve)
      : (bc === 'sol' ? 0.000005 : Number(buffers[bc] || 0));
    let effectiveBal = Number(entry.balance || 0);
    let rawUnits = null;
    if (liveGas && liveGas.liveBalanceBaseUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
      const liveNum = Number(contracts.fromBaseUnits(liveGas.liveBalanceBaseUnits, entry.decimals || 18));
      if (Number.isFinite(liveNum) && liveNum > 0 && liveNum <= effectiveBal + 1e-12) {
        effectiveBal = liveNum;
        rawUnits = liveGas.liveBalanceBaseUnits;
      }
    }
    const maxInfo = computeExactMaxSpendable({
      balance: effectiveBal,
      rawBaseUnits: rawUnits,
      decimals: entry.decimals || 6,
      isNative: true,
      gasReserve,
      exactFeeBaseUnits: (liveGas && liveGas.exactFeeBaseUnits) || (bc === 'sol' ? '5000' : null)
    });
    $('perp-oc-amount').value = maxInfo.maxAmountStr || '0';
    schedulePerpOneClickQuote();
  }

  function setPerpArbMax() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !$('perp-arb-amount')) return;
    const usdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    const floored = usdc > 0 ? (Math.floor(usdc * 100) / 100) : 0;
    $('perp-arb-amount').value = floored > 0 ? floored.toFixed(2) : '';
    evaluatePerpArbDepositUI();
  }

  function setPerpWithdrawMax() {
    const st = getState();
    const avail = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    const floored = avail > 0 ? (Math.floor(avail * 100) / 100) : 0;
    if ($('perp-withdraw-amount')) $('perp-withdraw-amount').value = floored > 0 ? floored.toFixed(2) : '';
    evaluatePerpWithdrawUI();
  }

  function jumpFromPerpToSwap() {
    closeAllSheets();
    setSwapPanelMode('market');
    switchTab('swap');
  }

  function renderPerpFundingSheet() {
    const st = getState();
    const hl = getHyperliquid();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !hl || !contracts) return;

    const mode = st.perp.fundingMode === 'withdraw' ? 'withdraw' : 'deposit';
    const titleEl = $('perp-funding-sheet-title');
    if (titleEl) {
      titleEl.textContent = mode === 'withdraw' ? t('提现到钱包', 'Withdraw to Wallet') : t('合约充值', 'Deposit Funds');
    }
    $('perp-mode-deposit')?.classList.toggle('hidden', mode !== 'deposit');
    $('perp-mode-withdraw')?.classList.toggle('hidden', mode !== 'withdraw');

    const tab = st.perp.fundingTab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    $('perp-ftab-oneclick')?.classList.toggle('active', tab === 'oneclick');
    $('perp-ftab-arbitrum')?.classList.toggle('active', tab === 'arbitrum');
    $('perp-funding-panel-oneclick')?.classList.toggle('hidden', tab !== 'oneclick');
    $('perp-funding-panel-arbitrum')?.classList.toggle('hidden', tab !== 'arbitrum');

    const entries = getEligiblePerpOneClickEntries(wallet);
    $('perp-oc-empty-state')?.classList.toggle('hidden', entries.length > 0);
    $('perp-oc-form')?.classList.toggle('hidden', entries.length === 0);

    const sel = $('perp-oc-origin-select');
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (sel && entries.length > 0) {
      const prevVal = st.perp.fundingOriginAssetId || sel.value;
      const chosen = entries.find((e) => e.key === prevVal) || entries[0] || null;
      const selectedVal = chosen ? chosen.key : '';
      const optSig = `${entries.map((e) => `${e.key}:${formatBal(e.balance, 4)}`).join('|')}::${selectedVal}`;
      if (!sel.dataset || sel.dataset.optSig !== optSig) {
        if (sel.dataset) sel.dataset.optSig = optSig;
        if (fw && typeof fw.mountPerpFundingInfoPanel === 'function') {
          fw.mountPerpFundingInfoPanel(sel, { entries, formatBal, selectedValue: selectedVal });
        }
      }
      st.perp.fundingOriginAssetId = selectedVal;
      const availEl = $('perp-oc-origin-avail');
      if (availEl) availEl.textContent = chosen ? `${formatBal(chosen.balance, 4)} ${chosen.symbol}` : '--';
    } else if (sel) {
      if (fw && typeof fw.mountPerpFundingInfoPanel === 'function') {
        fw.mountPerpFundingInfoPanel(sel, { entries: [], formatBal, selectedValue: '' });
      }
    }

    const hlAddr = contracts.resolveWalletEvmSender(wallet);
    if ($('perp-oc-target-addr')) $('perp-oc-target-addr').textContent = hlAddr ? shortenAddr(hlAddr, 8, 6) : '--';
    if ($('perp-wd-dest-addr')) $('perp-wd-dest-addr').textContent = hlAddr ? shortenAddr(hlAddr, 8, 6) : '--';

    const arbUsdc = Number((st.getWalletErc20Balance && st.getWalletErc20Balance(wallet, 'arb', hl.HL_ARB_USDC_ADDRESS)) || 0);
    const arbEth = contracts.resolveWalletChainBalance(wallet, 'arb');
    if ($('perp-arb-usdc-avail')) $('perp-arb-usdc-avail').textContent = `${arbUsdc.toFixed(2)} USDC`;
    if ($('perp-arb-eth-avail')) $('perp-arb-eth-avail').textContent = `${arbEth.toFixed(5)} ETH`;

    const acct = st.perp.account;
    const spotUsd = acct ? Number(acct.spotUsdc || 0) : 0;
    const wdAvail = acct ? Number(acct.withdrawable || 0) : 0;
    if ($('perp-wd-avail')) $('perp-wd-avail').textContent = acct ? `${wdAvail.toFixed(2)} USDC` : '--';
    $('perp-wd-spot-banner')?.classList.toggle('hidden', spotUsd < 0.01);
    if ($('perp-wd-spot-amt')) $('perp-wd-spot-amt').textContent = `${spotUsd.toFixed(2)} USDC`;

    evaluatePerpOneClickUI();
    evaluatePerpArbDepositUI();
    evaluatePerpWithdrawUI();
  }

  let _perpOneClickPollTimer = null;
  let _perpOneClickPollSeq = 0;
  let _perpQuoteSeq = 0;

  function openPerpFundingSheet(modeOrTab = 'deposit') {
    const st = getState();
    if (_perpQuoteTimer) {
      clearTimeout(_perpQuoteTimer);
      _perpQuoteTimer = null;
    }
    _perpQuoteSeq += 1;
    if (modeOrTab === 'withdraw' || modeOrTab === 'transfer') {
      st.perp.fundingMode = 'withdraw';
    } else {
      st.perp.fundingMode = 'deposit';
      st.perp.fundingTab = modeOrTab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    }
    resetFormFields(['perp-oc-amount', 'perp-arb-amount', 'perp-withdraw-amount']);
    st.perp.fundingQuote = null;
    st.perp.fundingQuoteError = '';
    st.perp.fundingQuoting = false;
    renderPerpFundingSheet();
    openSheet('sheet-perp-funding');
  }

  function stopPerpOneClickDepositPolling() {
    _perpOneClickPollSeq += 1;
    if (_perpOneClickPollTimer) {
      clearTimeout(_perpOneClickPollTimer);
      _perpOneClickPollTimer = null;
    }
  }

  function startPerpOneClickDepositPolling(depositAddress, { intervalMs = 5000, maxAttempts = 24 } = {}) {
    const addr = String(depositAddress || '').trim();
    if (!addr) return;
    stopPerpOneClickDepositPolling();
    const seq = ++_perpOneClickPollSeq;
    const st = getState();
    const startWallet = st && typeof st.getActiveWallet === 'function' ? st.getActiveWallet() : null;
    const startWalletId = startWallet ? startWallet.id : (st ? st.activeWalletId : null);
    st.perp.oneClickDepositStatus = { depositAddress: addr, status: 'PENDING_DEPOSIT', updatedAt: Date.now() };
    let attempts = 0;
    let lastNotifiedStatus = '';

    const isPollInvalid = () => {
      if (seq !== _perpOneClickPollSeq) return true;
      const curWallet = st && typeof st.getActiveWallet === 'function' ? st.getActiveWallet() : null;
      const curWalletId = curWallet ? curWallet.id : (st ? st.activeWalletId : null);
      return Boolean(startWalletId && curWalletId !== startWalletId);
    };

    const tick = async () => {
      if (isPollInvalid()) {
        stopPerpOneClickDepositPolling();
        return;
      }
      attempts += 1;
      try {
        const intents = getIntents();
        if (!intents || typeof intents.fetchSwapOrderStatus !== 'function') return;
        const res = await intents.fetchSwapOrderStatus(addr).catch(() => null);
        if (isPollInvalid()) {
          stopPerpOneClickDepositPolling();
          return;
        }
        if (res && res.ok && res.status) {
          const status = String(res.status).toUpperCase();
          st.perp.oneClickDepositStatus = { depositAddress: addr, status, updatedAt: Date.now() };
          if (status === 'SUCCESS') {
            showToast(`✅ ${t('跨链充值已到账，请点击「一键转入合约」', 'Cross-chain deposit arrived; click Move to Trading')}`);
            refreshPerpDataAsync(false).catch(() => {});
            refreshAllBalancesAsync(false);
            stopPerpOneClickDepositPolling();
            return;
          }
          if (status === 'FAILED' || status === 'REFUNDED' || status === 'INCOMPLETE_DEPOSIT') {
            showToast(`⚠️ ${t('跨链充值未完成或已退回，请查看交易记录', 'Cross-chain deposit failed or refunded; check activity')}`);
            stopPerpOneClickDepositPolling();
            return;
          }
          if ((status === 'KNOWN_DEPOSIT_TX' || status === 'PROCESSING') && lastNotifiedStatus !== status) {
            lastNotifiedStatus = status;
            showToast(`⏳ ${t('跨链充值处理中，正在等待到账...', 'Cross-chain deposit processing...')}`);
          }
        }
      } catch (_) {}
      if (!isPollInvalid() && attempts < maxAttempts) {
        _perpOneClickPollTimer = setTimeout(tick, intervalMs);
        if (_perpOneClickPollTimer && typeof _perpOneClickPollTimer.unref === 'function') {
          _perpOneClickPollTimer.unref();
        }
      }
    };

    _perpOneClickPollTimer = setTimeout(tick, Math.min(intervalMs, 150));
    if (_perpOneClickPollTimer && typeof _perpOneClickPollTimer.unref === 'function') {
      _perpOneClickPollTimer.unref();
    }
  }

  function setPerpFundingTab(tab) {
    const st = getState();
    if (_perpQuoteTimer) {
      clearTimeout(_perpQuoteTimer);
      _perpQuoteTimer = null;
    }
    _perpQuoteSeq += 1;
    st.perp.fundingTab = tab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    resetFormFields(['perp-oc-amount', 'perp-arb-amount']);
    st.perp.fundingQuote = null;
    st.perp.fundingQuoteError = '';
    st.perp.fundingQuoting = false;
    renderPerpFundingSheet();
  }

  function schedulePerpOneClickQuote(isOriginChange = false) {
    const st = getState();
    const sel = $('perp-oc-origin-select');
    if (sel && sel.value && st.perp.fundingOriginAssetId !== sel.value) {
      st.perp.fundingOriginAssetId = sel.value;
    }
    if (isOriginChange === true) {
      resetFormFields(['perp-oc-amount']);
    }
    st.perp.fundingQuote = null;
    st.perp.fundingQuoteError = '';
    if (_perpQuoteTimer) clearTimeout(_perpQuoteTimer);
    const seq = ++_perpQuoteSeq;
    const amt = Number($('perp-oc-amount')?.value || 0);
    const entries = getEligiblePerpOneClickEntries(st.getActiveWallet());
    const selKey = sel?.value || st.perp.fundingOriginAssetId || '';
    const entry = entries.find((e) => e.key === selKey) || entries[0] || null;
    if (!entry || !Number.isFinite(amt) || amt <= 0 || amt > Number(entry.balance || 0)) {
      st.perp.fundingQuoting = false;
      renderPerpFundingSheet();
      return;
    }
    st.perp.fundingQuoting = true;
    renderPerpFundingSheet();
    _perpQuoteTimer = setTimeout(async () => {
      try {
        if (seq !== _perpQuoteSeq) return;
        const hl = getHyperliquid();
        const wallet = st.getActiveWallet();
        const curEntries = getEligiblePerpOneClickEntries(wallet);
        const curKey = $('perp-oc-origin-select')?.value || st.perp.fundingOriginAssetId || '';
        const curEntry = curEntries.find((e) => e.key === curKey) || curEntries[0];
        if (!hl || !wallet || !curEntry) {
          if (seq === _perpQuoteSeq) st.perp.fundingQuoting = false;
          return;
        }
        const q = await hl.quoteOneClickDepositToHlSpot({ wallet, originToken: curEntry, amount: amt, dry: true });
        if (seq !== _perpQuoteSeq) return;
        st.perp.fundingQuoting = false;
        if (q && q.ok) {
          st.perp.fundingQuote = q;
          st.perp.fundingQuoteError = '';
        } else {
          st.perp.fundingQuote = null;
          st.perp.fundingQuoteError = q && q.error
            ? formatPerpError(q.error, '暂无跨链报价', 'Quote unavailable')
            : t('暂无跨链报价', 'Quote unavailable');
        }
      } catch (err) {
        if (seq !== _perpQuoteSeq) return;
        st.perp.fundingQuoting = false;
        st.perp.fundingQuote = null;
        st.perp.fundingQuoteError = formatPerpError(err, '询价失败，请稍后重试', 'Quote failed. Please try again.');
      } finally {
        if (seq === _perpQuoteSeq) {
          st.perp.fundingQuoting = false;
          evaluatePerpOneClickUI();
        }
      }
    }, 360);
  }

  async function executePerpOneClickDepositUI() {
    if (_perpFundingBusy) return;
    const st = getState();
    const hl = getHyperliquid();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!hl || !intents || !contracts || !wallet) return;

    const rawAmtStr = String($('perp-oc-amount')?.value || '').trim();
    const amt = Number(rawAmtStr || 0);
    const amtExact = /^\d+(\.\d+)?$/.test(rawAmtStr) ? rawAmtStr : amt;
    const key = $('perp-oc-origin-select')?.value || '';
    const entry = getEligiblePerpOneClickEntries(wallet).find((e) => e.key === key);
    const check = evaluatePerpOneClickState({
      entry,
      amount: amt,
      quote: st.perp.fundingQuote,
      quoteError: st.perp.fundingQuoteError,
      quoting: false
    });
    if (check.disabled) {
      if (check.error) showToast(check.error);
      evaluatePerpOneClickUI();
      return;
    }
    const avail = Number(entry.balance || 0);
    const originChainName = typeof getTxFlowChainName === 'function' ? getTxFlowChainName(entry.blockchain) : String(entry.blockchain || '').toUpperCase();
    const fq = st.perp.fundingQuote;
    const estOutStr = fq && fq.amountOutFormatted
      ? `${typeof formatTxFlowNum === 'function' ? formatTxFlowNum(fq.amountOutFormatted, 4) : fq.amountOutFormatted} USDC`
      : '-- USDC';
    const ocSteps = [
      { title: t(`从 ${originChainName} 发送 ${entry.symbol}`, `Send ${entry.symbol} from ${originChainName}`), chain: entry.blockchain },
      { title: t('跨链结算至 Hyperliquid 账户', 'Settle to Hyperliquid account'), chain: 'hype' }
    ];
    const ocPreview = {
      title: t('确认合约跨链充值', 'Confirm Perp Cross-Chain Deposit'),
      subtitle: `${entry.symbol} → Hyperliquid USDC`,
      payLabel: t('充值支付', 'Deposit Pay'),
      payAmountText: `${rawAmtStr || amt} ${entry.symbol}`,
      receiveLabel: t('预计到账', 'Est. Arrival'),
      receiveAmountText: estOutStr,
      networkPath: `${originChainName} → Hyperliquid`,
      feeText: t('由网络自动扣除', 'Network auto-calculated'),
      confirmLabel: t('确认充值', 'Confirm Deposit'),
      steps: ocSteps
    };
    _perpFundingBusy = true;
    const btn = $('btn-perp-oc-deposit');
    const prevBtnTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('充值提交中...', 'Depositing...');
    }
    let stepper = null;
    let activeStepIdx = 0;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(ocPreview))) return;
      const authed = await verifySecurityAuthAsync(wallet, `${t('跨链充值至 Hyperliquid', 'Cross-chain deposit to Hyperliquid')} (${rawAmtStr || amt} ${entry.symbol})`);
      if (!authed) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在跨链充值至合约', 'Depositing to Perp'), ocSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      await ensureEthersLoaded();
      const q = await hl.quoteOneClickDepositToHlSpot({ wallet, originToken: entry, amount: amtExact, dry: false });
      if (!q || !q.ok || !q.depositAddress) throw new Error((q && q.error) || t('获取跨链充值路由失败', 'Failed to get deposit route'));

      const walletKey = wallet.id || wallet.nearNamedAccount || wallet.nearAddress || 'default';
      const ocBc = String(entry.blockchain || '').toLowerCase();
      const ocCacheKey = `${walletKey}:${ocBc}:transfer`;
      const ocCached = st.perp && st.perp._ocLiveGas;
      const ocLive = (ocCached && ocCached.key === ocCacheKey && (Date.now() - ocCached.ts) < 60_000) ? ocCached.data : null;
      const ocIsNative = isNativeSendAsset(entry);
      const ocGasBuf = ocIsNative
        ? (ocLive && Number.isFinite(Number(ocLive.gasReserve)) ? Number(ocLive.gasReserve) : (ocBc === 'sol' ? 0.000005 : null))
        : null;
      const ocMeta = (ocLive && ocLive.meta) || {};

      let txHash = '';
      if (entry.blockchain === 'near' && entry.kind !== 'nep141' && entry.symbol === 'NEAR') {
        txHash = (await contracts.signAndSendNearTransfer({ wallet, receiverId: q.depositAddress, amountNear: amtExact, gasBuffer: ocGasBuf })).txHash;
      } else if (entry.blockchain === 'near' && entry.contractAddress) {
        txHash = (await contracts.executeNearNep141Transfer({ wallet, tokenContract: entry.contractAddress, receiverId: q.depositAddress, amount: amtExact, decimals: entry.decimals || 8, tokenSymbol: entry.symbol, tokenBalance: avail })).txHash;
      } else if (entry.blockchain === 'sol') {
        txHash = !entry.contractAddress || entry.contractAddress === 'So11111111111111111111111111111111111111112'
          ? (await contracts.executeSolanaNativeTransfer({ wallet, toAddress: q.depositAddress, amountSol: amtExact, gasBuffer: ocGasBuf })).txHash
          : (await contracts.executeSolanaSplTransfer({ wallet, mintAddress: entry.contractAddress, toAddress: q.depositAddress, amount: amtExact, decimals: entry.decimals || 6, tokenBalance: avail })).txHash;
      } else if (entry.blockchain === 'btc') {
        const res = await contracts.executeBitcoinTransfer({ wallet, toAddress: q.depositAddress, amountBtc: amtExact, feeDeductMode: 'extra', feeRateSatVb: ocMeta.feeRateSatVb ?? null, gasBuffer: ocGasBuf });
        txHash = res.txHash;
        applyOptimisticChainSpend(wallet, 'btc', amt, Number(res.feeBtc) || 0, txHash);
      } else {
        txHash = (await contracts.executeEvmTransfer({
          wallet,
          chainKey: entry.blockchain,
          toAddress: q.depositAddress,
          amount: amtExact,
          tokenContract: entry.contractAddress,
          decimals: entry.decimals || 18,
          tokenBalance: avail,
          gasBuffer: ocGasBuf,
          gasPriceWei: ocIsNative ? (ocMeta.gasPriceWei ?? null) : null,
          gasLimit: ocIsNative ? (ocMeta.gasLimit ?? null) : null
        })).txHash;
      }

      if (stepper) {
        stepper.setStep(0, 'done', { txHash, chain: entry.blockchain });
        activeStepIdx = 1;
        stepper.setStep(1, 'active');
      }

      if (txHash) {
        recordWalletActivity(wallet, {
          type: 'send',
          symbol: entry.symbol,
          chain: entry.blockchain,
          amount: amt,
          to: q.depositAddress,
          txHash,
          title: t('Hyperliquid 跨链充值', 'Hyperliquid Cross-Chain Deposit')
        });
        await intents.submitExternalDepositTxHash({ depositAddress: q.depositAddress, txHash, nearSenderAccount: wallet.nearNamedAccount || wallet.nearAddress }).catch(() => {});
      }
      if (stepper) {
        stepper.setStep(1, 'done');
        stepper.finish(true, t('跨链充值已发送，正在后台追踪到账状态', 'Deposit sent; tracking arrival in background'));
      }
      startPerpOneClickDepositPolling(q.depositAddress);
      resetFormFields(['perp-oc-amount', 'perp-arb-amount', 'perp-withdraw-amount']);
      st.perp.fundingQuote = null;
      st.perp.fundingQuoteError = '';
      showToast(`✅ ${t('跨链充值已发送，正在后台追踪到账状态', 'Deposit sent; tracking arrival in background')}`);
      closeAllSheets();
      refreshAllBalancesAsync(false);
    } catch (err) {
      st.perp.fundingQuoteError = formatPerpError(err, '跨链充值失败，请稍后重试', 'Deposit failed. Please try again.');
      if (stepper) {
        stepper.setStep(activeStepIdx, 'error', { error: st.perp.fundingQuoteError });
        stepper.finish(false, st.perp.fundingQuoteError);
      }
      evaluatePerpOneClickUI();
      showToast(st.perp.fundingQuoteError);
    } finally {
      _perpFundingBusy = false;
      if (btn) {
        btn.disabled = false;
        if (prevBtnTxt) btn.textContent = prevBtnTxt;
      }
      evaluatePerpOneClickUI();
    }
  }

  async function executePerpArbBridgeDepositUI() {
    if (_perpFundingBusy) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const pre = evaluatePerpArbDepositUI();
    if (pre && pre.disabled) {
      if (pre.error) showToast(pre.error);
      return;
    }
    const rawAmtStr = String($('perp-arb-amount')?.value || '').trim();
    const amt = Number(rawAmtStr || 0);
    const amtExact = /^\d+(\.\d+)?$/.test(rawAmtStr) ? rawAmtStr : amt;
    const arbSteps = [{ title: t('向 Hyperliquid 桥接合约转入 USDC', 'Deposit USDC to Hyperliquid bridge'), chain: 'arb' }];
    const arbPreview = {
      title: t('确认 Arbitrum 充值', 'Confirm Arbitrum Deposit'),
      subtitle: `${rawAmtStr || amt} USDC → Hyperliquid`,
      payLabel: t('充值数量', 'Deposit Amount'),
      payAmountText: `${rawAmtStr || amt} USDC`,
      receiveLabel: t('预计到账', 'Est. Arrival'),
      receiveAmountText: `${rawAmtStr || amt} USDC`,
      networkPath: 'Arbitrum → Hyperliquid',
      feeText: t('由 Arbitrum 网络扣除 ETH Gas', 'Arbitrum ETH gas'),
      confirmLabel: t('确认充值', 'Confirm Deposit'),
      steps: arbSteps
    };
    _perpFundingBusy = true;
    const btn = $('btn-perp-arb-deposit');
    const prevBtnTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('提交充值中...', 'Depositing...');
    }
    let stepper = null;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(arbPreview))) return;
      const authed = await verifySecurityAuthAsync(wallet, `${t('Arbitrum 充值 USDC 至 Hyperliquid', 'Deposit Arbitrum USDC to Hyperliquid')} (${rawAmtStr || amt} USDC)`);
      if (!authed) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在提交 Arbitrum 充值', 'Depositing via Arbitrum'), arbSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      await ensureEthersLoaded();
      const res = await hl.depositArbUsdcToHlBridge({ wallet, amount: amtExact });
      if (stepper) {
        stepper.setStep(0, 'done', { txHash: (res && res.txHash) || '', chain: 'arb' });
        stepper.finish(true, t('Arbitrum 充值已提交 (约 1~2 分钟到账)', 'Arbitrum deposit sent (~1-2 min arrival)'));
      }
      if (res && res.txHash) {
        recordWalletActivity(wallet, {
          type: 'send',
          symbol: 'USDC',
          chain: 'arb',
          amount: amt,
          txHash: res.txHash,
          title: t('Hyperliquid Arbitrum 充值', 'Hyperliquid Arbitrum Deposit')
        });
      }
      showToast(`✅ ${t('Arbitrum 充值已提交 (约 1~2 分钟到账)', 'Arbitrum deposit sent (~1-2 min arrival)')}: ${shortenAddr(res.txHash)}`);
      resetFormFields(['perp-oc-amount', 'perp-arb-amount', 'perp-withdraw-amount']);
      closeAllSheets();
      refreshAllBalancesAsync(false);
      refreshPerpDataAsync(false).catch(() => {});
      setTimeout(() => refreshPerpDataAsync(false).catch(() => {}), 20000).unref?.();
      setTimeout(() => refreshPerpDataAsync(false).catch(() => {}), 60000).unref?.();
    } catch (err) {
      const msg = formatPerpError(err, 'Arbitrum 充值失败，请稍后重试', 'Arbitrum deposit failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: msg });
        stepper.finish(false, msg);
      }
      showToast(msg);
    } finally {
      _perpFundingBusy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevBtnTxt || t('确认 Arbitrum 充值', 'Confirm Arbitrum Deposit');
      }
      evaluatePerpArbDepositUI();
    }
  }

  async function executePerpWithdrawUI() {
    if (_perpFundingBusy) return;
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const pre = evaluatePerpWithdrawUI();
    if (pre && pre.disabled) {
      if (pre.error) showToast(pre.error);
      return;
    }
    const amt = Number($('perp-withdraw-amount')?.value || 0);
    const withdrawable = st.perp.account ? Number(st.perp.account.withdrawable || 0) : 0;
    const wdSteps = [{ title: t('签名提交 Hyperliquid 提现至 Arbitrum', 'Sign & submit withdrawal to Arbitrum'), chain: 'hype' }];
    const wdPreview = {
      title: t('确认合约提现', 'Confirm Perp Withdrawal'),
      subtitle: `${amt} USDC → Arbitrum`,
      payLabel: t('提现金额', 'Withdraw Amount'),
      payAmountText: `${amt} USDC`,
      networkPath: 'Hyperliquid → Arbitrum',
      feeText: t('由 Hyperliquid 扣除标准跨链费', 'Hyperliquid standard bridge fee'),
      confirmLabel: t('确认提现', 'Confirm Withdraw'),
      steps: wdSteps
    };
    _perpFundingBusy = true;
    const btn = $('btn-perp-withdraw');
    const prevBtnTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('提现提交中...', 'Withdrawing...');
    }
    let stepper = null;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(wdPreview))) return;
      const authed = await verifySecurityAuthAsync(wallet, t('提现 USDC 至 Arbitrum 钱包', 'Withdraw USDC to Arbitrum wallet'));
      if (!authed) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在提交合约提现', 'Submitting Withdrawal'), wdSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      await ensureEthersLoaded();
      const wdRes = await hl.withdrawHlToArbitrum({ wallet, amount: amt, withdrawable });
      if (stepper) {
        stepper.setStep(0, 'done', { txHash: (wdRes && wdRes.txHash) || '', chain: 'hype' });
        stepper.finish(true, t('提现请求已提交至 Arbitrum (约几分钟到账)', 'Withdrawal submitted to Arbitrum'));
      }
      showToast(`✅ ${t('提现请求已提交至 Arbitrum (约几分钟到账)', 'Withdrawal submitted to Arbitrum')}`);
      resetFormFields(['perp-oc-amount', 'perp-arb-amount', 'perp-withdraw-amount']);
      closeAllSheets();
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      const msg = formatPerpError(err, '提现失败，请稍后重试', 'Withdrawal failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: msg });
        stepper.finish(false, msg);
      }
      showToast(msg);
    } finally {
      _perpFundingBusy = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevBtnTxt || t('确认提现到 Arbitrum', 'Confirm Withdraw to Arbitrum');
      }
      evaluatePerpWithdrawUI();
    }
  }

