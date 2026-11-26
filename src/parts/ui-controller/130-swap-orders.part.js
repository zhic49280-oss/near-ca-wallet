  function getSwapOrderStatusLabel(rawStatus) {
    const statusMap = {
      PENDING_DEPOSIT: t('等待源链充值', 'Awaiting Deposit'),
      PENDING_ARC_BRIDGE: t('Arc 跨链桥接中', 'Bridging to Arc'),
      PENDING_BASE_BRIDGE: t('Base 跨链桥接中', 'Bridging to Base'),
      PROCESSING: t('跨链处理中', 'Processing'),
      SUCCESS: t('已完成', 'Completed'),
      COMPLETED: t('已完成', 'Completed'),
      FAILED: t('失败', 'Failed'),
      REFUNDED: t('已退款', 'Refunded')
    };
    const upper = String(rawStatus || 'PENDING').toUpperCase();
    return statusMap[upper] || rawStatus || 'PENDING';
  }

  function getSwapHistoryItems(wallet) {
    if (!wallet || !Array.isArray(wallet.activityHistory)) return [];
    return wallet.activityHistory.filter((x) => x && x.type === 'swap').slice(0, 15);
  }

  function renderSwapHistoryCard() {
    const st = getState();
    const listEl = $('swap-history-list');
    if (!listEl) return;
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || globalThis.NearCAFramework;
    if (fw && typeof fw.mountSwapHistory === 'function') {
      fw.mountSwapHistory(listEl, { getStatusLabel: getSwapOrderStatusLabel });
      return;
    }
    const wallet = st.getActiveWallet();
    const items = getSwapHistoryItems(wallet);
    if (items.length === 0) {
      listEl.innerHTML = `<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 10px 0;">${escapeHtml(t('暂无闪兑记录', 'No swap history yet'))}</div>`;
      return;
    }
    const activeOrder = st.swap && st.swap.activeOrder;
    const tokens = getTokens();
    listEl.innerHTML = items.map((it, idx) => {
      const pairLabel = it.toSymbol ? `${it.symbol || ''} ➔ ${it.toSymbol}` : (it.title || t('闪兑', 'Swap'));
      const amtText = (typeof it.amount === 'number' && Number.isFinite(it.amount))
        ? `${formatBal(it.amount, 6)} ${it.symbol || ''}`
        : '--';
      const chainMeta = it.chain && tokens ? tokens.getChainMeta(it.chain) : null;
      const netTag = chainMeta ? chainMeta.shortName : (it.chain ? String(it.chain).toUpperCase() : '');
      const relTime = typeof formatRelativeActivityTime === 'function' ? formatRelativeActivityTime(it.timestamp) : '';
      let statusText = t('已广播', 'Broadcast');
      if (activeOrder && it.txHash && activeOrder.originTxHash === it.txHash && activeOrder.status) {
        statusText = getSwapOrderStatusLabel(activeOrder.status);
      }
      return `
        <button type="button" class="tx-compact-row" data-action="open-tx-detail" data-tx-source="swap" data-tx-idx="${idx}" data-tx-hash="${escapeHtml(it.txHash || '')}" data-chain="${escapeHtml(it.chain || '')}">
          <div class="flex items-center gap-2" style="min-width:0;flex:1;">
            <span class="tx-dir-circle swap">⇄</span>
            <div class="flex flex-col" style="min-width:0;flex:1;gap:2px;">
              <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                <span class="mono" style="font-size:12.5px;font-weight:700;color:#f8fafc;">${escapeHtml(pairLabel)}</span>
                <span class="tx-conf-pill">${escapeHtml(statusText)}</span>
              </div>
              <span class="mono" style="font-size:10.5px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml([amtText, netTag].filter(Boolean).join(' · '))}</span>
            </div>
          </div>
          <div class="flex flex-col" style="text-align:right;flex-shrink:0;gap:2px;">
            <span style="font-size:10.5px;color:var(--text-muted);">${escapeHtml(relTime)}</span>
            <span style="font-size:10.5px;color:var(--near-emerald);">${it.txHash ? escapeHtml(shortenAddr(it.txHash, 4, 4)) : ''}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  function renderSwapOrderCard() {
    const st = getState();
    const order = st.swap.activeOrder;
    const activeWallet = st.getActiveWallet();
    const card = $('swap-order-card');
    if (typeof renderSwapHistoryCard === 'function') renderSwapHistoryCard();
    if (!card) return;
    if (!order || !order.depositAddress || (order.walletId && activeWallet && order.walletId !== activeWallet.id)) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    if ($('swap-order-deposit-addr')) $('swap-order-deposit-addr').textContent = order.depositAddress;
    const friendlyStatus = getSwapOrderStatusLabel(order.status);
    const pendingFollow = typeof hasPendingSwapFollowUp === 'function' && hasPendingSwapFollowUp(order);
    const upperSt = String(order.status || '').toUpperCase();
    const isStage1Done = ['SUCCESS', 'COMPLETED'].includes(upperSt);
    const statusEl = $('swap-order-status');
    if (statusEl) {
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
      if (fw && typeof fw.mountSwapActiveOrderPanel === 'function') {
        fw.mountSwapActiveOrderPanel(statusEl, {
          status: order.status || '',
          statusLabel: friendlyStatus,
          pendingFollow: Boolean(pendingFollow),
          isStage1Done: Boolean(isStage1Done),
          followUpFailed: Boolean(order.followUpFailed),
          followUpError: order.followUpError || '',
          isEn: st.lang === 'en'
        });
      } else if (order.followUpFailed && order.followUpError) {
        statusEl.textContent = `${friendlyStatus} · ⚠️ ${order.followUpError} (${t('请点击下方按钮继续完成第二阶段兑换', 'Tap Resume below to complete stage 2')})`;
      } else if (pendingFollow && isStage1Done) {
        statusEl.textContent = `${t('阶段 1 已到账 · 正在自动执行阶段 2 兑换...', 'Stage 1 arrived · Executing stage 2 swap...')}`;
      } else if (pendingFollow) {
        statusEl.textContent = `${t('阶段 1/2', 'Stage 1/2')}: ${friendlyStatus} (${t('请保持页面开启，到账后自动执行阶段 2', 'Keep open; stage 2 runs automatically on arrival')})`;
      } else {
        statusEl.textContent = friendlyStatus;
      }
    }

    const txRow = $('swap-order-tx-row');
    const txEl = $('swap-order-origin-tx');
    if (txRow) {
      txRow.classList.toggle('hidden', !order.originTxHash);
      if (txEl && order.originTxHash) {
        txEl.textContent = shortenAddr(order.originTxHash);
      }
    }

    const isAuto = Boolean(order.autoBroadcasted);
    const manualBox = $('swap-order-manual-box');
    if (manualBox) {
      manualBox.classList.toggle('hidden', isAuto);
    }
    const qrWrap = $('swap-order-qr');
    if (qrWrap) {
      if (isAuto) {
        qrWrap.classList.add('hidden');
        const fw = typeof getFramework === 'function' ? getFramework() : null;
        if (fw && typeof fw.render === 'function') {
          try { fw.render(null, qrWrap); } catch (_) {}
        }
        qrWrap.innerHTML = '';
      } else {
        qrWrap.classList.remove('hidden');
        renderQrInto('swap-order-qr', order.depositAddress, 136);
      }
    }

    const resumeBtn = $('btn-resume-swap-stage');
    if (resumeBtn) {
      const showResume = Boolean(order.followUpFailed || (pendingFollow && isStage1Done && !order._followUpInFlight));
      resumeBtn.classList.toggle('hidden', !showResume);
    }
  }

  function copySwapOrderDeposit() {
    const addr = getState().swap.activeOrder?.depositAddress;
    if (addr) copyText(addr, t('充值地址', 'Deposit Address'));
  }

  async function executeFollowUpBridgeOut(wallet, order, outFollow, bridgeInRaw, fallbackContract = '') {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const nearId = wallet.nearNamedAccount || wallet.nearAddress;
    if (BigInt(bridgeInRaw) <= 0n) {
      throw new Error(t('Ref 兑换后余额不足以发起后续跨链', 'Insufficient balance after swap for follow-up bridge'));
    }
    const liveOut = await intents.quoteIntentSwapOrWithdraw({
      originAsset: outFollow.originAsset,
      destinationAsset: outFollow.destinationAsset,
      amountRaw: String(bridgeInRaw),
      slippageBps: outFollow.slippageBps || order.followUpRefSwap?.slippageBps || st.swap?.slippageBps || 100,
      recipient: outFollow.recipient,
      refundTo: nearId,
      depositType: 'ORIGIN_CHAIN',
      recipientType: 'DESTINATION_CHAIN',
      appFeeBps: 25,
      dry: false
    });
    if (!liveOut.ok || !liveOut.depositAddress) {
      throw new Error(liveOut.error || t('获取后续跨链桥路由失败', 'Failed to get follow-up bridge route'));
    }
    const bDec = outFollow.hubDecimals || 8;
    const bSym = outFollow.hubSymbol || 'PRL';
    const bHuman = intents.fromBaseUnits(String(bridgeInRaw), bDec);
    const bContract = outFollow.hubContract || fallbackContract;
    const bBalMap = await intents.fetchNearNep141Balances(nearId, { [bContract]: bDec }).catch(() => null);
    const realBBal = (bBalMap && bBalMap[bContract] && bBalMap[bContract].formatted !== undefined)
      ? Number(bBalMap[bContract].formatted)
      : (wallet.nearNep141Balances && wallet.nearNep141Balances[bContract]
          ? Number(wallet.nearNep141Balances[bContract].formatted)
          : null);
    const sendB = await contracts.executeNearNep141Transfer({
      wallet,
      tokenContract: bContract,
      receiverId: liveOut.depositAddress,
      amount: bHuman,
      decimals: bDec,
      tokenSymbol: bSym,
      tokenBalance: realBBal
    });
    await intents.submitExternalDepositTxHash({
      depositAddress: liveOut.depositAddress,
      txHash: sendB.txHash,
      nearSenderAccount: nearId
    }).catch(() => {});
    st.swap.activeOrder = {
      walletId: wallet.id,
      depositAddress: liveOut.depositAddress,
      memo: liveOut.memo || null,
      status: 'PENDING_DEPOSIT',
      fromSymbol: order.fromSymbol,
      toSymbol: order.toSymbol,
      originTxHash: sendB.txHash,
      autoBroadcasted: true,
      createdAt: Date.now(),
      followUpSolDexSwap: outFollow.followUpSolDexSwap || null,
      followUpEvmDexSwap: outFollow.followUpEvmDexSwap || null
    };
    if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
    renderSwapOrderCard();
    startOrderStatusPolling();
    showToast(`✅ ${t('后续跨链交付已发起', 'Follow-up bridge sent')}`);
  }

  function hasPendingSwapFollowUp(order) {
    if (!order || order.followUpExecuted) return false;
    return Boolean(
      order.followUpConfidentialSwap ||
      order.followUpRefSwap ||
      order.followUpDclSwap ||
      order.followUpBridgeOut ||
      order.followUpSolBridgeOut ||
      order.followUpSolDexSwap ||
      order.followUpEvmDexSwap ||
      order.followUpArcRelay ||
      order.followUpArcDexSwap ||
      order.followUpBaseOneClick
    );
  }

  async function resumeActiveSwapFollowUp() {
    const st = getState();
    const order = st.swap.activeOrder;
    if (!order || order.followUpExecuted) return;
    order.followUpFailed = false;
    renderSwapOrderCard();
    await runActiveSwapFollowUp(order);
    refreshAllBalancesAsync(false);
  }

  let _orderPollInFlight = false;
  let _orderPollSeq = 0;

  async function refreshActiveSwapOrderStatus(manual = false) {
    if (_orderPollInFlight && !manual) return;
    const st = getState();
    const order = st.swap.activeOrder;
    const intents = getIntents();
    const contracts = getContracts();
    if (!order || !order.depositAddress) {
      if (manual) showToast(t('当前没有进行中的跨链订单', 'No active cross-chain order'));
      return;
    }
    const mySeq = ++_orderPollSeq;
    _orderPollInFlight = true;
    const refreshBtn = manual ? $('btn-refresh-swap-order') : null;
    const prevBtnText = refreshBtn ? refreshBtn.textContent : '';
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = t('刷新中...', 'Refreshing...');
    }
    const isStalePoll = () => mySeq !== _orderPollSeq || st.swap.activeOrder !== order;
    try {
      if (order.followUpBaseOneClick && !order.followUpExecuted && !order.followUpFailed && ['PENDING_BASE_BRIDGE', 'SUCCESS'].includes(order.status)) {
        if (order.status === 'SUCCESS') {
          if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
          await runActiveSwapFollowUp(order);
          refreshAllBalancesAsync(false);
          return;
        }
        const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
        const evmAddr = wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '';
        if (evmAddr && contracts) {
          const baseBalRes = await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null);
          if (isStalePoll()) return;
          const availRaw = BigInt(baseBalRes?.tokenRaw || '0');
          const preRaw = BigInt(order.followUpBaseOneClick.preBaseRaw || '0');
          if (availRaw > preRaw) {
            if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
            order.status = 'SUCCESS';
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
            renderSwapOrderCard();
            await runActiveSwapFollowUp(order);
            refreshAllBalancesAsync(false);
            if (manual) showToast(`✅ ${t('Base 跨链已到账', 'Base bridge arrived')}`);
            return;
          }
        }
        if (manual) showToast(`${t('当前状态', 'Status')}: ${getSwapOrderStatusLabel(order.status)}`);
        return;
      }
      if (order.followUpArcDexSwap && !order.followUpExecuted && !order.followUpFailed && ['PENDING_ARC_BRIDGE', 'SUCCESS'].includes(order.status)) {
        if (order.status === 'SUCCESS') {
          if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
          await runActiveSwapFollowUp(order);
          refreshAllBalancesAsync(false);
          return;
        }
        const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
        const evmAddr = wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '';
        if (evmAddr && contracts) {
          const arcBalRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
          if (isStalePoll()) return;
          const availWei = BigInt(arcBalRes?.nativeRaw || '0');
          const preWei = BigInt(order.followUpArcDexSwap.preArcUsdcRaw || '0');
          const reserveWei = BigInt(intents.toBaseUnits('0.02', 18));
          if (availWei > preWei && availWei > reserveWei) {
            if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
            order.status = 'SUCCESS';
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
            renderSwapOrderCard();
            await runActiveSwapFollowUp(order);
            refreshAllBalancesAsync(false);
            if (manual) showToast(`✅ ${t('Arc 跨链已到账', 'Arc bridge arrived')}`);
            return;
          }
        }
        if (manual) showToast(`${t('当前状态', 'Status')}: ${getSwapOrderStatusLabel(order.status)}`);
        return;
      }
      if (order.followUpConfidentialSwap && order.followUpConfidentialSwap.depositProof) {
        if (order.followUpExecuted || order.followUpFailed) {
          if (manual) showToast(`${t('当前状态', 'Status')}: ${getSwapOrderStatusLabel(order.status)}`);
          return;
        }
        if (typeof intents.fetchNearcomConfidentialDepositStatus === 'function') {
          const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
          if (wallet) {
            const depRes = await intents.fetchNearcomConfidentialDepositStatus({ wallet, proof: order.followUpConfidentialSwap.depositProof }).catch((e) => ({ ok: false, error: e }));
            if (isStalePoll()) return;
            if (depRes && depRes.ok && depRes.status) {
              order.status = depRes.status;
              if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
              renderSwapOrderCard();
              const upper = String(depRes.status).toUpperCase();
              if (['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED', 'FAILED_EXECUTION'].includes(upper)) {
                if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
                if (['SUCCESS', 'COMPLETED'].includes(upper)) {
                  await runActiveSwapFollowUp(order);
                }
                refreshAllBalancesAsync(false);
              }
              if (manual) showToast(`${t('当前状态', 'Status')}: ${getSwapOrderStatusLabel(order.status)}`);
              return;
            }
            if (manual) {
              showToast((depRes && depRes.error) ? toUserFriendlyError(depRes.error, '暂未获取到新状态，请稍后重试', 'No update yet. Please try again.') : `${t('当前状态', 'Status')}: ${getSwapOrderStatusLabel(order.status)}`);
            }
            return;
          }
        }
        if (manual) showToast(`${t('当前状态', 'Status')}: ${getSwapOrderStatusLabel(order.status)}`);
        return;
      }
      const res = await intents.fetchSwapOrderStatus(order.depositAddress).catch((e) => ({ ok: false, error: e }));
      if (isStalePoll()) return;
      if (res && res.ok && res.status) {
        order.status = res.status;
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
        renderSwapOrderCard();
        const upper = String(res.status).toUpperCase();
        if (['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED'].includes(upper)) {
          if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
          if (['SUCCESS', 'COMPLETED'].includes(upper) && !order.followUpExecuted && !order.followUpFailed) {
            await runActiveSwapFollowUp(order);
          }
          refreshAllBalancesAsync(false);
        }
        if (manual) showToast(`${t('当前状态', 'Status')}: ${getSwapOrderStatusLabel(order.status)}`);
      } else if (manual) {
        showToast((res && res.error) ? toUserFriendlyError(res.error, '暂未获取到新状态，请稍后重试', 'No update yet. Please try again.') : `${t('暂未获取到新状态，当前', 'No update yet; status')}: ${getSwapOrderStatusLabel(order.status)}`);
      }
    } finally {
      if (mySeq === _orderPollSeq) {
        _orderPollInFlight = false;
      }
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = prevBtnText || t('刷新状态', 'Refresh');
      }
    }
  }

  function stopOrderStatusPolling() {
    if (_orderPollTimer) {
      clearInterval(_orderPollTimer);
      _orderPollTimer = null;
    }
  }

  function startOrderStatusPolling(immediate = true) {
    stopOrderStatusPolling();
    if (typeof isAppInBackground === 'function' ? isAppInBackground() : (typeof document !== 'undefined' && document.hidden)) return;
    _orderPollCount = 0;
    if (immediate) refreshActiveSwapOrderStatus();
    _orderPollTimer = setInterval(() => {
      if (typeof isAppInBackground === 'function' ? isAppInBackground() : (typeof document !== 'undefined' && document.hidden)) {
        stopOrderStatusPolling();
        return;
      }
      _orderPollCount += 1;
      if (_orderPollCount > 240) {
        stopOrderStatusPolling();
        if ($('swap-order-status')) {
          $('swap-order-status').textContent = t('仍在确认中 · 点击刷新', 'Still confirming · Tap Refresh');
        }
        return;
      }
      refreshActiveSwapOrderStatus();
    }, 6000);
    if (_orderPollTimer && typeof _orderPollTimer.unref === 'function') _orderPollTimer.unref();
  }

  async function submitSwapOrderTxHash() {
    const st = getState();
    const intents = getIntents();
    const wallet = st.getActiveWallet();
    const order = st.swap.activeOrder;
    const hash = ($('swap-order-txhash-input')?.value || '').trim();
    if (!order || !order.depositAddress || !hash) {
      showToast(t('请输入有效的交易哈希', 'Enter a valid Transaction ID'));
      return;
    }
    const btn = $('btn-submit-swap-order-txhash');
    const prevTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('提交中...', 'Submitting...');
    }
    try {
      const res = await intents.submitExternalDepositTxHash({
        depositAddress: order.depositAddress,
        txHash: hash,
        nearSenderAccount: wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : undefined
      });
      if (res.ok) {
        showToast(t('已提交充值凭证，加速确认中', 'Deposit hash submitted'));
        refreshActiveSwapOrderStatus();
      } else {
        showToast(toUserFriendlyError(res && res.error, '提交失败，请稍后重试', 'Submit failed. Please try again.'));
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        if (prevTxt) btn.textContent = prevTxt;
      }
    }
  }

  function clearActiveSwapOrder(force = false) {
    const st = getState();
    const order = st.swap.activeOrder;
    if (order && order._followUpInFlight) {
      showToast(t('第二阶段跨链正在执行中，请勿关闭订单', 'Stage 2 execution in progress; please wait'));
      return;
    }
    if (!force && order && !order.followUpExecuted && (order.followUpFailed || hasPendingSwapFollowUp(order))) {
      const upper = String(order.status || '').toUpperCase();
      if (!['FAILED', 'REFUNDED'].includes(upper) && !(upper === 'SUCCESS' && !order.followUpFailed)) {
        if (!_clearOrderWarnedAt || (Date.now() - _clearOrderWarnedAt) > 6000) {
          _clearOrderWarnedAt = Date.now();
          showToast(t('该订单仍有后续步骤未完成，再次点击“完成”将放弃自动跟进', 'Order has pending steps; tap Done again to dismiss'));
          return;
        }
      }
    }
    _clearOrderWarnedAt = 0;
    if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
    st.swap.activeOrder = null;
    if (typeof st.clearSavedSwapOrder === 'function') st.clearSavedSwapOrder();
    renderSwapOrderCard();
  }
  let _clearOrderWarnedAt = 0;

