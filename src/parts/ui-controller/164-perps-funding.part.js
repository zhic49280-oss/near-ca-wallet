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
    if (sel && entries.length > 0) {
      const prevVal = st.perp.fundingOriginAssetId || sel.value;
      const optSig = entries.map((e) => `${e.key}:${formatBal(e.balance, 4)}`).join('|');
      if (!sel.dataset || sel.dataset.optSig !== optSig) {
        if (sel.dataset) sel.dataset.optSig = optSig;
        sel.innerHTML = entries.map((e) =>
          `<option value="${escapeHtml(e.key)}">${escapeHtml(`${e.symbol} · ${e.chainLabel} (${formatBal(e.balance, 4)})`)}</option>`
        ).join('');
      }
      if (entries.some((e) => e.key === prevVal)) sel.value = prevVal;
      const chosen = entries.find((e) => e.key === sel.value) || entries[0] || null;
      st.perp.fundingOriginAssetId = chosen ? chosen.key : '';
      const availEl = $('perp-oc-origin-avail');
      if (availEl) availEl.textContent = chosen ? `${formatBal(chosen.balance, 4)} ${chosen.symbol}` : '--';
    } else if (sel) {
      sel.innerHTML = '';
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

  function openPerpFundingSheet(modeOrTab = 'deposit') {
    const st = getState();
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

  function setPerpFundingTab(tab) {
    const st = getState();
    st.perp.fundingTab = tab === 'arbitrum' ? 'arbitrum' : 'oneclick';
    renderPerpFundingSheet();
  }

  let _perpQuoteSeq = 0;

  function schedulePerpOneClickQuote() {
    const st = getState();
    st.perp.fundingQuote = null;
    st.perp.fundingQuoteError = '';
    if (_perpQuoteTimer) clearTimeout(_perpQuoteTimer);
    const seq = ++_perpQuoteSeq;
    const amt = Number($('perp-oc-amount')?.value || 0);
    const entries = getEligiblePerpOneClickEntries(st.getActiveWallet());
    const selKey = $('perp-oc-origin-select')?.value || '';
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
        const hl = getHyperliquid();
        const wallet = st.getActiveWallet();
        const curEntries = getEligiblePerpOneClickEntries(wallet);
        const curKey = $('perp-oc-origin-select')?.value || '';
        const curEntry = curEntries.find((e) => e.key === curKey) || curEntries[0];
        if (!hl || !wallet || !curEntry) return;
        const q = await hl.quoteOneClickDepositToHlSpot({ wallet, originToken: curEntry, amount: amt, dry: true });
        if (seq !== _perpQuoteSeq) return;
        st.perp.fundingQuoting = false;
        if (q && q.ok) {
          st.perp.fundingQuote = q;
          st.perp.fundingQuoteError = '';
        } else {
          st.perp.fundingQuote = null;
          st.perp.fundingQuoteError = (q && q.error) || t('暂无跨链报价', 'Quote unavailable');
        }
      } catch (err) {
        if (seq !== _perpQuoteSeq) return;
        st.perp.fundingQuoting = false;
        st.perp.fundingQuote = null;
        st.perp.fundingQuoteError = (err && err.message) || t('询价失败', 'Quote failed');
      } finally {
        if (seq === _perpQuoteSeq) evaluatePerpOneClickUI();
      }
    }, 360);
  }

  async function executePerpOneClickDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!hl || !intents || !contracts || !wallet) return;

    const amt = Number($('perp-oc-amount')?.value || 0);
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
    const authed = await verifySecurityAuthAsync(wallet, `${t('跨链充值至 Hyperliquid', 'Cross-chain deposit to Hyperliquid')} (${amt} ${entry.symbol})`);
    if (!authed) return;
    const btn = $('btn-perp-oc-deposit');
    if (btn) btn.disabled = true;
    try {
      await ensureEthersLoaded();
      const q = await hl.quoteOneClickDepositToHlSpot({ wallet, originToken: entry, amount: amt, dry: false });
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
        txHash = (await contracts.signAndSendNearTransfer({ wallet, receiverId: q.depositAddress, amountNear: amt, gasBuffer: ocGasBuf })).txHash;
      } else if (entry.blockchain === 'near' && entry.contractAddress) {
        txHash = (await contracts.executeNearNep141Transfer({ wallet, tokenContract: entry.contractAddress, receiverId: q.depositAddress, amount: amt, decimals: entry.decimals || 8, tokenSymbol: entry.symbol, tokenBalance: avail })).txHash;
      } else if (entry.blockchain === 'sol') {
        txHash = !entry.contractAddress || entry.contractAddress === 'So11111111111111111111111111111111111111112'
          ? (await contracts.executeSolanaNativeTransfer({ wallet, toAddress: q.depositAddress, amountSol: amt, gasBuffer: ocGasBuf })).txHash
          : (await contracts.executeSolanaSplTransfer({ wallet, mintAddress: entry.contractAddress, toAddress: q.depositAddress, amount: amt, decimals: entry.decimals || 6, tokenBalance: avail })).txHash;
      } else if (entry.blockchain === 'btc') {
        const res = await contracts.executeBitcoinTransfer({ wallet, toAddress: q.depositAddress, amountBtc: amt, feeDeductMode: 'extra', feeRateSatVb: ocMeta.feeRateSatVb ?? null, gasBuffer: ocGasBuf });
        txHash = res.txHash;
        applyOptimisticChainSpend(wallet, 'btc', amt, Number(res.feeBtc) || 0, txHash);
      } else {
        txHash = (await contracts.executeEvmTransfer({
          wallet,
          chainKey: entry.blockchain,
          toAddress: q.depositAddress,
          amount: amt,
          tokenContract: entry.contractAddress,
          decimals: entry.decimals || 18,
          tokenBalance: avail,
          gasBuffer: ocGasBuf,
          gasPriceWei: ocIsNative ? (ocMeta.gasPriceWei ?? null) : null,
          gasLimit: ocIsNative ? (ocMeta.gasLimit ?? null) : null
        })).txHash;
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
      showToast(`✅ ${t('跨链充值已发送，到账后点击「一键转入合约」即可下单', 'Deposit sent; click Move to Trading after confirmation')}`);
      closeAllSheets();
      refreshAllBalancesAsync(false);
    } catch (err) {
      st.perp.fundingQuoteError = (err && err.message) || t('跨链充值失败', 'Deposit failed');
      evaluatePerpOneClickUI();
      showToast(st.perp.fundingQuoteError);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function executePerpArbBridgeDepositUI() {
    const st = getState();
    const hl = getHyperliquid();
    const wallet = st.getActiveWallet();
    if (!hl || !wallet) return;
    const pre = evaluatePerpArbDepositUI();
    if (pre && pre.disabled) {
      if (pre.error) showToast(pre.error);
      return;
    }
    const amt = Number($('perp-arb-amount')?.value || 0);
    const authed = await verifySecurityAuthAsync(wallet, `${t('Arbitrum 充值 USDC 至 Hyperliquid', 'Deposit Arbitrum USDC to Hyperliquid')} (${amt} USDC)`);
    if (!authed) return;
    const btn = $('btn-perp-arb-deposit');
    const prevBtnTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('提交充值中...', 'Depositing...');
    }
    try {
      await ensureEthersLoaded();
      const res = await hl.depositArbUsdcToHlBridge({ wallet, amount: amt });
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
      closeAllSheets();
      refreshAllBalancesAsync(false);
      refreshPerpDataAsync(false).catch(() => {});
      setTimeout(() => refreshPerpDataAsync(false).catch(() => {}), 20000).unref?.();
      setTimeout(() => refreshPerpDataAsync(false).catch(() => {}), 60000).unref?.();
    } catch (err) {
      showToast((err && err.message) || t('Arbitrum 充值失败', 'Arbitrum deposit failed'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevBtnTxt || t('确认 Arbitrum 充值', 'Confirm Arbitrum Deposit');
      }
      evaluatePerpArbDepositUI();
    }
  }

  async function executePerpWithdrawUI() {
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
    const authed = await verifySecurityAuthAsync(wallet, t('提现 USDC 至 Arbitrum 钱包', 'Withdraw USDC to Arbitrum wallet'));
    if (!authed) return;

    const btn = $('btn-perp-withdraw');
    const prevBtnTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('提现提交中...', 'Withdrawing...');
    }
    try {
      await ensureEthersLoaded();
      await hl.withdrawHlToArbitrum({ wallet, amount: amt, withdrawable });
      showToast(`✅ ${t('提现请求已提交至 Arbitrum (约几分钟到账)', 'Withdrawal submitted to Arbitrum')}`);
      closeAllSheets();
      await refreshPerpDataAsync(false).catch(() => {});
    } catch (err) {
      showToast((err && err.message) || t('提现失败', 'Withdrawal failed'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevBtnTxt || t('确认提现到 Arbitrum', 'Confirm Withdraw to Arbitrum');
      }
      evaluatePerpWithdrawUI();
    }
  }

