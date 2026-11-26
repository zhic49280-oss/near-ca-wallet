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

  async function runActiveSwapFollowUp(order) {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    if (!order || order._followUpInFlight || order.followUpExecuted) return;
    const hasFollowUp = hasPendingSwapFollowUp(order);
    if (!hasFollowUp) return;

    const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
    if (!wallet) return;

    order._followUpInFlight = true;
    order.followUpFailed = false;
    try {
      if (order.followUpConfidentialSwap && typeof intents.executeNearcomConfidentialSwapAndWithdraw === 'function') {
        const conf = order.followUpConfidentialSwap;
        const confRes = await intents.executeNearcomConfidentialSwapAndWithdraw({
          wallet,
          originAsset: conf.originAsset,
          destinationAsset: conf.destinationAsset,
          destinationChain: conf.destinationChain,
          amountInRaw: conf.amountInRaw,
          slippageBps: conf.slippageBps || 100,
          recipient: conf.recipient,
          feeBps: conf.feeBps !== undefined ? conf.feeBps : 25,
          feeRecipient: conf.feeRecipient || intents.DEFAULT_REFERRAL_ACCOUNT
        });
        order.status = 'COMPLETED';
        order.followUpExecuted = true;
        order.followUpFailed = false;
        order.confidentialSwapIntentHash = confRes.swapIntentHash || null;
        order.confidentialWithdrawIntentHash = confRes.withdrawIntentHash || null;
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
        renderSwapOrderCard();
        showToast(`✅ ${t('机密兑换与提现已自动完成', 'Confidential swap & withdraw completed')}`);
        return;
      }
      if (order.followUpRefSwap) {
        const follow = order.followUpRefSwap;
        const swapFn = (follow.isDcl && Array.isArray(follow.poolIds) && follow.poolIds.length > 0 && contracts?.executeNearDclPoolSwap)
          ? 'dcl'
          : 'ref';
        if (contracts && (swapFn === 'dcl' || typeof contracts.executeNearRefFinanceSwap === 'function')) {
          const nearId = wallet.nearNamedAccount || wallet.nearAddress;
          const balMap = await intents.fetchNearNep141Balances(nearId, { [follow.tokenIn]: follow.inputDecimals || 6 }).catch(() => null);
          const liveRaw = balMap?.[follow.tokenIn]?.raw;
          const realFollowBal = (balMap && balMap[follow.tokenIn] && balMap[follow.tokenIn].formatted !== undefined)
            ? Number(balMap[follow.tokenIn].formatted)
            : (wallet.nearNep141Balances && wallet.nearNep141Balances[follow.tokenIn]
                ? Number(wallet.nearNep141Balances[follow.tokenIn].formatted)
                : null);
          const amtInRaw = (follow.amountUsdcRaw && BigInt(String(follow.amountUsdcRaw)) > 0n)
            ? String(follow.amountUsdcRaw)
            : String(liveRaw || '0');
          if (BigInt(amtInRaw) > 0n) {
            const outFollow = follow.followUpBridgeOut || null;
            const dclFollow = follow.followUpDclSwap || null;
            const preBridgeBal = outFollow
              ? await intents.fetchNearNep141Balances(nearId, { [follow.tokenOut]: outFollow.hubDecimals || 8 }).catch(() => null)
              : (dclFollow ? await intents.fetchNearNep141Balances(nearId, { [dclFollow.tokenIn]: 6 }).catch(() => null) : null);
            const preOutRaw = BigInt(preBridgeBal?.[follow.tokenOut]?.raw || '0');
            const swapRes = swapFn === 'dcl'
              ? await contracts.executeNearDclPoolSwap({
                  wallet,
                  poolIds: follow.poolIds,
                  tokenIn: follow.tokenIn,
                  tokenOut: follow.tokenOut,
                  amountRaw: amtInRaw,
                  slippageBps: follow.slippageBps || 100,
                  tokenBalance: realFollowBal,
                  inputDecimals: follow.inputDecimals || 6,
                  tokenSymbol: follow.tokenSymbol || 'USDC'
                })
              : await contracts.executeNearRefFinanceSwap({
                  wallet,
                  tokenIn: follow.tokenIn,
                  tokenOut: follow.tokenOut,
                  amountRaw: amtInRaw,
                  slippageBps: follow.slippageBps || 100,
                  tokenBalance: realFollowBal,
                  inputDecimals: follow.inputDecimals || 6,
                  tokenSymbol: follow.tokenSymbol || 'USDC'
                });

            if (dclFollow && typeof contracts.executeNearDclPoolSwap === 'function') {
              const postUsdcBal = await intents.fetchNearNep141Balances(nearId, { [dclFollow.tokenIn]: 6 }).catch(() => null);
              const postUsdcRaw = BigInt(postUsdcBal?.[dclFollow.tokenIn]?.raw || '0');
              const deltaUsdc = postUsdcRaw > preOutRaw ? (postUsdcRaw - preOutRaw) : BigInt(swapRes.amountOut || '0');
              const dclInRaw = (deltaUsdc > 0n ? deltaUsdc : BigInt(swapRes.amountOut || '0')).toString();
              // Promote nested DCL step before executing so retries never re-run Ref Finance
              order.followUpRefSwap = null;
              order.followUpDclSwap = { ...dclFollow, amountRaw: dclInRaw };
              if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
              const dclQ = await contracts.quoteNearDclPoolSwap({
                tokenIn: dclFollow.tokenIn,
                tokenOut: dclFollow.tokenOut,
                amountRaw: dclInRaw,
                slippageBps: dclFollow.slippageBps || follow.slippageBps || 100
              });
              if (!dclQ || !dclQ.ok) {
                throw new Error((dclQ && dclQ.error) || t('DCL 第二阶段询价失败', 'DCL stage 2 quote failed'));
              }
              const dclRes = await contracts.executeNearDclPoolSwap({
                wallet,
                poolIds: dclQ.poolIds,
                tokenIn: dclFollow.tokenIn,
                tokenOut: dclFollow.tokenOut,
                amountRaw: dclInRaw,
                minAmountOut: dclQ.minAmountOut,
                slippageBps: dclFollow.slippageBps || follow.slippageBps || 100,
                tokenBalance: Number(intents.fromBaseUnits(dclInRaw, 6)),
                inputDecimals: 6,
                tokenSymbol: 'USDC'
              });
              order.followUpExecuted = true;
              order.followUpFailed = false;
              if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
              renderSwapOrderCard();
              showToast(`✅ ${t('第二阶段已自动完成兑换', 'Stage 2 auto-swap completed')}: ${shortenAddr(dclRes.txHash)}`);
              return;
            }

            if (outFollow && outFollow.destinationAsset) {
              const postOutBal = await intents.fetchNearNep141Balances(nearId, { [follow.tokenOut]: outFollow.hubDecimals || 8 }).catch(() => null);
              const postOutRaw = BigInt(postOutBal?.[follow.tokenOut]?.raw || '0');
              const deltaOut = postOutRaw > preOutRaw ? (postOutRaw - preOutRaw) : BigInt(swapRes.amountOut || outFollow.expectedInRaw || '0');
              const bridgeInRaw = (deltaOut > 0n ? deltaOut : BigInt(outFollow.expectedInRaw || '0')).toString();
              // Promote nested BridgeOut step before executing so retries never re-run Ref Finance
              order.followUpRefSwap = null;
              order.followUpBridgeOut = { ...outFollow, expectedInRaw: bridgeInRaw };
              if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
              await executeFollowUpBridgeOut(wallet, order, outFollow, bridgeInRaw, follow.tokenOut);
              return;
            }
            order.followUpExecuted = true;
            order.followUpFailed = false;
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
            renderSwapOrderCard();
            showToast(`✅ ${t('第二阶段 Ref Finance 已自动兑换', 'Step 2 auto-swapped on Ref')}: ${shortenAddr(swapRes.txHash)}`);
            return;
          }
        }
      }

      if (order.followUpDclSwap && typeof contracts?.executeNearDclPoolSwap === 'function') {
        const dclFollow = order.followUpDclSwap;
        const nearId = wallet.nearNamedAccount || wallet.nearAddress;
        const balMap = await intents.fetchNearNep141Balances(nearId, { [dclFollow.tokenIn]: 6 }).catch(() => null);
        const liveRaw = BigInt(balMap?.[dclFollow.tokenIn]?.raw || '0');
        const expectedRaw = BigInt(dclFollow.amountRaw || '0');
        const dclInRaw = (liveRaw > 0n
          ? (expectedRaw > 0n && liveRaw > expectedRaw ? expectedRaw : liveRaw)
          : expectedRaw).toString();
        const dclQ = await contracts.quoteNearDclPoolSwap({
          tokenIn: dclFollow.tokenIn,
          tokenOut: dclFollow.tokenOut,
          amountRaw: dclInRaw,
          slippageBps: dclFollow.slippageBps || 100
        });
        if (!dclQ || !dclQ.ok) {
          throw new Error((dclQ && dclQ.error) || t('DCL 第二阶段询价失败', 'DCL stage 2 quote failed'));
        }
        const dclRes = await contracts.executeNearDclPoolSwap({
          wallet,
          poolIds: dclQ.poolIds,
          tokenIn: dclFollow.tokenIn,
          tokenOut: dclFollow.tokenOut,
          amountRaw: dclInRaw,
          minAmountOut: dclQ.minAmountOut,
          slippageBps: dclFollow.slippageBps || 100,
          tokenBalance: Number(intents.fromBaseUnits(dclInRaw, 6)),
          inputDecimals: 6,
          tokenSymbol: 'USDC'
        });
        order.followUpExecuted = true;
        order.followUpFailed = false;
        if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
        renderSwapOrderCard();
        showToast(`✅ ${t('第二阶段已自动完成兑换', 'Stage 2 auto-swap completed')}: ${shortenAddr(dclRes.txHash)}`);
        return;
      }

      if (order.followUpSolBridgeOut && order.followUpSolBridgeOut.destinationAsset) {
        const sFollow = order.followUpSolBridgeOut;
        const solAddr = wallet.solAddress;
        const nearId = wallet.nearNamedAccount || wallet.nearAddress;
        if (solAddr && contracts) {
          const s2Live = await intents.quoteIntentSwapOrWithdraw({
            originAsset: 'nep141:sol.omft.near',
            destinationAsset: sFollow.destinationAsset,
            amountRaw: String(sFollow.amountRaw || '0'),
            slippageBps: sFollow.slippageBps || 100,
            recipient: sFollow.recipient,
            refundTo: solAddr,
            nearAccountId: nearId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: false
          });
          if (!s2Live.ok || !s2Live.depositAddress) {
            throw new Error(s2Live.error || t('第二阶段跨链下单失败', 'Stage 2 cross-chain order failed'));
          }
          const sendSolNum = Number(contracts.fromBaseUnits(String(sFollow.amountRaw || '0'), 9));
          const sendSolTx = await contracts.executeSolanaNativeTransfer({
            wallet,
            toAddress: s2Live.depositAddress,
            amountSol: sendSolNum
          });
          await intents.submitExternalDepositTxHash({
            depositAddress: s2Live.depositAddress,
            txHash: sendSolTx.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          order.depositAddress = s2Live.depositAddress;
          order.memo = s2Live.memo || null;
          order.status = 'PENDING_DEPOSIT';
          order.originTxHash = sendSolTx.txHash;
          order.followUpSolBridgeOut = null;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('第二阶段 SOL 跨链已发出', 'Stage 2 SOL bridge sent')}: ${shortenAddr(sendSolTx.txHash)}`);
          return;
        }
      }

      if (order.followUpBridgeOut && order.followUpBridgeOut.destinationAsset) {
        const outFollow = order.followUpBridgeOut;
        const nearId = wallet.nearNamedAccount || wallet.nearAddress;
        if (contracts && nearId) {
          const balMap = await intents.fetchNearNep141Balances(nearId, { [outFollow.hubContract]: outFollow.hubDecimals || 8 }).catch(() => null);
          const liveRaw = BigInt(balMap?.[outFollow.hubContract]?.raw || '0');
          const expectedRaw = BigInt(outFollow.expectedInRaw || '0');
          const bridgeInRaw = liveRaw > 0n
            ? (expectedRaw > 0n && liveRaw > expectedRaw ? expectedRaw : liveRaw)
            : expectedRaw;
          await executeFollowUpBridgeOut(wallet, order, outFollow, bridgeInRaw.toString(), outFollow.hubContract);
          return;
        }
      }

      if (order.followUpSolDexSwap) {
        const follow = order.followUpSolDexSwap;
        if (wallet.solAddress && contracts && typeof contracts.executeSolanaJupiterSwap === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const balRes = await contracts.fetchSolanaNativeAndSplBalances(wallet.solAddress, []).catch(() => null);
          const availLamports = BigInt(balRes?.nativeLamports || '0');
          const preLamports = BigInt(follow.preSolLamports || '0');
          const expectedLamports = BigInt(follow.expectedSolRaw || '0');
          const reserveSolVal = typeof follow.reserveSol === 'number' && Number.isFinite(follow.reserveSol) ? follow.reserveSol : 0.0035;
          const reserveLamports = BigInt(intents.toBaseUnits(String(reserveSolVal), 9));
          const maxSpendable = availLamports > reserveLamports ? availLamports - reserveLamports : 0n;
          const deltaLamports = availLamports > preLamports ? availLamports - preLamports : 0n;
          let swapInLamports = deltaLamports > 0n ? deltaLamports : expectedLamports;
          if (expectedLamports > 0n && swapInLamports > expectedLamports) swapInLamports = expectedLamports;
          if (swapInLamports > maxSpendable) swapInLamports = maxSpendable;
          if (swapInLamports <= 0n) throw new Error(t('Solana 账户 SOL 余额不足以保留手续费', 'Insufficient SOL after fee reserve'));
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances.sol = Number(contracts.fromBaseUnits(availLamports.toString(), 9));
          const jQuote = await contracts.quoteSolanaJupiterSwap({
            inputMint: 'So11111111111111111111111111111111111111112',
            outputMint: follow.outputMint,
            amountRaw: swapInLamports.toString(),
            slippageBps: follow.slippageBps || 100,
            platformFeeBps: 0
          });
          const jRes = await contracts.executeSolanaJupiterSwap({
            wallet,
            quoteResponse: jQuote,
            wrapAndUnwrapSol: true,
            tokenBalance: Number(contracts.fromBaseUnits(availLamports.toString(), 9)),
            inputDecimals: 9
          });
          order.followUpExecuted = true;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          showToast(`✅ ${t('第二阶段已自动买入', 'Stage 2 bought')} ${follow.toSymbol}: ${shortenAddr(jRes.txHash)}`);
          return;
        }
      }

      if (order.followUpEvmDexSwap) {
        const follow = order.followUpEvmDexSwap;
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (evmAddr && contracts && typeof contracts.executeEvmDexSwap === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const balRes = await contracts.fetchEvmNativeAndErc20Balance(follow.chainKey, evmAddr).catch(() => null);
          const availWei = BigInt(balRes?.nativeRaw || '0');
          const preWei = BigInt(follow.preNativeWei || '0');
          const expectedWei = BigInt(follow.expectedInRaw || '0');
          const reserveHuman = typeof follow.reserveNative === 'number' && Number.isFinite(follow.reserveNative)
            ? follow.reserveNative
            : ((contracts.CHAIN_MIN_GAS_RESERVES && contracts.CHAIN_MIN_GAS_RESERVES[follow.chainKey]) || 0.0005);
          const reserveWei = BigInt(intents.toBaseUnits(String(reserveHuman), 18));
          const maxSpendable = availWei > reserveWei ? availWei - reserveWei : 0n;
          const deltaWei = availWei > preWei ? availWei - preWei : 0n;
          let swapInWei = deltaWei > 0n ? deltaWei : expectedWei;
          if (expectedWei > 0n && swapInWei > expectedWei) swapInWei = expectedWei;
          if (swapInWei > maxSpendable) swapInWei = maxSpendable;
          if (swapInWei <= 0n) throw new Error(t('目标链原生 Gas 余额不足', 'Insufficient native balance after gas reserve'));
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances[follow.chainKey] = Number(contracts.fromBaseUnits(availWei.toString(), 18));
          const evmQ = await contracts.quoteEvmDexSwap({
            chainKey: follow.chainKey,
            srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destToken: follow.destToken,
            amountRaw: swapInWei.toString(),
            srcDecimals: 18,
            destDecimals: follow.destDecimals || 18,
            slippageBps: follow.slippageBps || 100,
            feeBps: 0,
            fromAddress: evmAddr
          });
          if (!evmQ.ok || !evmQ.routeData) throw new Error(evmQ.error || t('获取第二阶段 DEX 路由失败', 'Stage 2 EVM DEX quote failed'));
          const evmRes = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: follow.chainKey,
            routeSource: evmQ.routeSource,
            routeData: evmQ.routeData,
            srcToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
            destToken: follow.destToken,
            amountRaw: swapInWei.toString(),
            srcDecimals: 18,
            slippageBps: follow.slippageBps || 100,
            tokenBalance: Number(contracts.fromBaseUnits(availWei.toString(), 18)),
            feeBps: 0
          });
          order.followUpExecuted = true;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          showToast(`✅ ${t('第二阶段 MPC 已自动兑换为', 'Stage 2 swapped to')} ${follow.toSymbol}: ${shortenAddr(evmRes.txHash)}`);
          return;
        }
      }

      if (order.followUpArcRelay) {
        const follow = order.followUpArcRelay;
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (follow.direction === 'arc_to_base') {
          if (evmAddr && contracts && typeof contracts.executeEvmRawSteps === 'function') {
            await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
            const arcBal = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
            const availArcWei = BigInt(arcBal?.nativeRaw || '0');
            const availArc6 = availArcWei / 1000000000000n;
            const reserveArc6 = 20000n;
            const maxSpendableArc6 = availArc6 > reserveArc6 ? (availArc6 - reserveArc6) : 0n;
            const reqRaw = BigInt(follow.amountRaw || '0');
            const bridgeArc6 = reqRaw > 0n
              ? (maxSpendableArc6 > 0n ? (reqRaw < maxSpendableArc6 ? reqRaw : maxSpendableArc6) : 0n)
              : maxSpendableArc6;
            if (bridgeArc6 <= 0n) throw new Error(t('Arc USDC 余额不足或不足预留 Gas 以发起跨链至 Base', 'Insufficient Arc USDC (after gas reserve) to bridge to Base'));
            const preBaseRes = await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null);
            const isBaseUsdcDest = String(follow.destinationAsset || '') === intents.BASE_USDC_ASSET_ID;
            const relayLive = await intents.quoteRelayBridge({
              user: evmAddr,
              recipient: (isBaseUsdcDest && follow.recipient && /^0x[0-9a-fA-F]{40}$/.test(follow.recipient)) ? follow.recipient : evmAddr,
              originChainId: 5042,
              destinationChainId: 8453,
              originCurrency: intents.ARC_USDC_CONTRACT,
              destinationCurrency: intents.BASE_USDC_EVM,
              amount: bridgeArc6.toString()
            });
            if (!relayLive.ok || !relayLive.steps?.length) throw new Error(relayLive.error || t('Relay Arc->Base 构建失败', 'Relay Arc->Base failed'));
            const relayTx = await contracts.executeEvmRawSteps({ wallet, chainKey: 'arc', steps: relayLive.steps });
            delete order.followUpArcRelay;
            if (!isBaseUsdcDest && follow.destinationAsset) {
              order.status = 'PENDING_BASE_BRIDGE';
              order.followUpExecuted = false;
              order.followUpFailed = false;
              order.followUpBaseOneClick = {
                destinationAsset: follow.destinationAsset,
                toSymbol: follow.toSymbol || order.toSymbol,
                recipient: follow.recipient || evmAddr,
                expectedBaseRaw: String(relayLive.amountOut || bridgeArc6.toString()),
                preBaseRaw: String(preBaseRes?.tokenRaw || '0'),
                slippageBps: follow.slippageBps || 100
              };
              if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
              renderSwapOrderCard();
              startOrderStatusPolling();
              showToast(`✅ ${t('Arc -> Base 跨链已发送，到账后自动兑换目标资产', 'Arc -> Base bridge sent; will auto-swap on arrival')}: ${shortenAddr(relayTx.txHash)}`);
              return;
            }
            order.followUpExecuted = true;
            order.followUpFailed = false;
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
            renderSwapOrderCard();
            showToast(`✅ ${t('Arc -> Base 跨链已发送', 'Arc -> Base bridge sent')}: ${shortenAddr(relayTx.txHash)}`);
            return;
          }
        }
        if (evmAddr && contracts && typeof contracts.executeEvmRawSteps === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const baseBal = await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null);
          const availRaw = BigInt(baseBal?.tokenRaw || '0');
          const preRaw = BigInt(follow.preBaseRaw || '0');
          const expectedRaw = BigInt(follow.expectedBaseRaw || '0');
          const deltaRaw = availRaw > preRaw ? availRaw - preRaw : 0n;
          let bridgeInRaw = deltaRaw > 0n ? deltaRaw : expectedRaw;
          if (expectedRaw > 0n && bridgeInRaw > expectedRaw) bridgeInRaw = expectedRaw;
          if (bridgeInRaw > availRaw && availRaw > 0n) bridgeInRaw = availRaw;
          if (bridgeInRaw <= 0n) throw new Error(t('Base USDC 余额不足以发起 Relay 跨链至 Arc', 'Insufficient Base USDC for Relay to Arc'));

          const destLower = String(follow.destContract || intents.ARC_USDC_CONTRACT).toLowerCase();
          const needsArcSwap = Boolean(follow.destContract && destLower !== intents.ARC_USDC_CONTRACT.toLowerCase() && destLower !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
          const relayRecipient = (!needsArcSwap && follow.recipient && /^0x[0-9a-fA-F]{40}$/.test(follow.recipient))
            ? follow.recipient
            : evmAddr;
          const preArcRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
          const relayLive = await intents.quoteRelayBridge({
            user: evmAddr,
            recipient: relayRecipient,
            originChainId: 8453,
            destinationChainId: 5042,
            originCurrency: intents.BASE_USDC_EVM,
            destinationCurrency: intents.ARC_USDC_CONTRACT,
            amount: bridgeInRaw.toString()
          });
          if (!relayLive.ok || !relayLive.steps?.length) throw new Error(relayLive.error || t('Relay Base->Arc 构建失败', 'Relay Base->Arc failed'));
          const relayTx = await contracts.executeEvmRawSteps({ wallet, chainKey: 'base', steps: relayLive.steps });
          if (needsArcSwap) {
            delete order.followUpArcRelay;
            order.status = 'PENDING_ARC_BRIDGE';
            order.followUpExecuted = false;
            order.followUpFailed = false;
            order.followUpArcDexSwap = {
              destContract: follow.destContract,
              destDecimals: follow.destDecimals || 18,
              toSymbol: follow.toSymbol,
              expectedArcUsdcRaw: String(relayLive.amountOut || bridgeInRaw.toString()),
              preArcUsdcRaw: String(preArcRes?.nativeRaw || '0'),
              slippageBps: follow.slippageBps || 100
            };
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
            renderSwapOrderCard();
            startOrderStatusPolling();
            showToast(`✅ ${t('第二阶段 Relay 已发送至 Arc 主网，到账后将自动兑换', 'Stage 2 Relay sent to Arc; will auto-swap on arrival')}: ${shortenAddr(relayTx.txHash)}`);
            return;
          }
          order.followUpExecuted = true;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          showToast(`✅ ${t('第二阶段 Relay 已发送至 Arc 主网', 'Stage 2 Relay sent to Arc Mainnet')}: ${shortenAddr(relayTx.txHash)}`);
          return;
        }
      }

      if (order.followUpArcDexSwap) {
        const follow = order.followUpArcDexSwap;
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        if (evmAddr && contracts && typeof contracts.executeEvmDexSwap === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const arcBalRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
          const availWei = BigInt(arcBalRes?.nativeRaw || '0');
          const preWei = BigInt(follow.preArcUsdcRaw || '0');
          const expected6 = BigInt(follow.expectedArcUsdcRaw || '0');
          const expectedWei = expected6 > 0n ? (expected6 * 1000000000000n) : 0n;
          const reserveWei = BigInt(intents.toBaseUnits('0.02', 18));
          const maxSpendableWei = availWei > reserveWei ? availWei - reserveWei : 0n;
          const deltaWei = availWei > preWei ? availWei - preWei : 0n;
          let swapInWei = deltaWei > 0n ? deltaWei : expectedWei;
          if (expectedWei > 0n && swapInWei > expectedWei) swapInWei = expectedWei;
          if (swapInWei > maxSpendableWei) swapInWei = maxSpendableWei;
          const swapIn6 = swapInWei / 1000000000000n;
          if (swapIn6 <= 0n) {
            throw new Error(t('Arc 主网 USDC 尚未到账或不足预留 Gas', 'Arc Mainnet USDC not yet arrived or below gas reserve'));
          }
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances.arc = Number(contracts.fromBaseUnits(availWei.toString(), 18));
          const arcQ = await contracts.quoteEvmDexSwap({
            chainKey: 'arc',
            srcToken: intents.ARC_USDC_CONTRACT,
            destToken: follow.destContract,
            amountRaw: swapIn6.toString(),
            srcDecimals: 6,
            destDecimals: follow.destDecimals || 18,
            slippageBps: follow.slippageBps || 100,
            feeBps: 0,
            fromAddress: evmAddr
          });
          if (!arcQ.ok || !arcQ.routeData) {
            throw new Error(arcQ.error || t('获取 Arc DEX 路由失败', 'Arc DEX quote failed'));
          }
          const arcRes = await contracts.executeEvmDexSwap({
            wallet,
            chainKey: 'arc',
            routeSource: arcQ.routeSource,
            routeData: arcQ.routeData,
            srcToken: intents.ARC_USDC_CONTRACT,
            destToken: follow.destContract,
            amountRaw: swapIn6.toString(),
            srcDecimals: 6,
            slippageBps: follow.slippageBps || 100,
            tokenBalance: Number(contracts.fromBaseUnits(availWei.toString(), 18)),
            feeBps: 0
          });
          order.status = 'COMPLETED';
          order.followUpExecuted = true;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          showToast(`✅ ${t('Arc 主网已自动兑换为', 'Arc Mainnet swapped to')} ${follow.toSymbol}: ${shortenAddr(arcRes.txHash)}`);
          return;
        }
      }

      if (order.followUpBaseOneClick && order.followUpBaseOneClick.destinationAsset) {
        const follow = order.followUpBaseOneClick;
        await ensureEthersLoaded();
        const evmAddr = wallet.mpcEvmAddress || wallet.evmAddress;
        const nearId = wallet.nearNamedAccount || wallet.nearAddress;
        if (evmAddr && contracts && typeof contracts.executeEvmTransfer === 'function') {
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          const baseBal = await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null);
          const availRaw = BigInt(baseBal?.tokenRaw || '0');
          const preRaw = BigInt(follow.preBaseRaw || '0');
          const expectedRaw = BigInt(follow.expectedBaseRaw || '0');
          const deltaRaw = availRaw > preRaw ? availRaw - preRaw : 0n;
          let bridgeInRaw = deltaRaw > 0n ? deltaRaw : expectedRaw;
          if (expectedRaw > 0n && bridgeInRaw > expectedRaw) bridgeInRaw = expectedRaw;
          if (availRaw > 0n && bridgeInRaw > availRaw) bridgeInRaw = availRaw;
          if (bridgeInRaw <= 0n || availRaw < bridgeInRaw) {
            throw new Error(t('Base USDC 尚未到账，无法发起第三阶段跨链', 'Base USDC not yet arrived for stage 3 swap'));
          }
          const s3Quote = await intents.quoteIntentSwapOrWithdraw({
            originAsset: intents.BASE_USDC_1CLICK_ID,
            destinationAsset: follow.destinationAsset,
            amountRaw: bridgeInRaw.toString(),
            slippageBps: follow.slippageBps || 100,
            recipient: follow.recipient,
            refundTo: nearId || evmAddr,
            nearAccountId: nearId,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            dry: false
          });
          if (!s3Quote.ok || !s3Quote.depositAddress) {
            throw new Error(s3Quote.error || t('获取第三阶段跨链路由失败', 'Failed to get stage 3 cross-chain route'));
          }
          const sendS3 = await contracts.executeEvmTransfer({
            wallet,
            chainKey: 'base',
            toAddress: s3Quote.depositAddress,
            amount: intents.fromBaseUnits(bridgeInRaw.toString(), 6),
            tokenContract: intents.BASE_USDC_EVM,
            decimals: 6,
            tokenBalance: Number(intents.fromBaseUnits(availRaw.toString(), 6))
          });
          await intents.submitExternalDepositTxHash({
            depositAddress: s3Quote.depositAddress,
            txHash: sendS3.txHash,
            nearSenderAccount: nearId
          }).catch(() => {});
          delete order.followUpBaseOneClick;
          order.depositAddress = s3Quote.depositAddress;
          order.memo = s3Quote.memo || null;
          order.status = 'PENDING_DEPOSIT';
          order.originTxHash = sendS3.txHash;
          order.followUpExecuted = false;
          order.followUpFailed = false;
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          startOrderStatusPolling();
          showToast(`✅ ${t('第三阶段 Base USDC -> 目标链跨链已发起', 'Stage 3 Base USDC bridge sent')}: ${shortenAddr(sendS3.txHash)}`);
          return;
        }
      }
    } catch (err) {
      order.followUpExecuted = false;
      order.followUpFailed = true;
      order.followUpError = toUserFriendlyError(err, '后续自动兑换执行失败，请稍后重试', 'Follow-up swap execution failed. Please try again.');
      if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
      renderSwapOrderCard();
      showToast(order.followUpError);
    } finally {
      delete order._followUpInFlight;
    }
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
      if (order.followUpBaseOneClick && !order.followUpExecuted && !order.followUpFailed && order.status === 'PENDING_BASE_BRIDGE') {
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
      if (order.followUpArcDexSwap && !order.followUpExecuted && !order.followUpFailed && order.status === 'PENDING_ARC_BRIDGE') {
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
    if (typeof document !== 'undefined' && document.hidden) return;
    _orderPollCount = 0;
    if (immediate) refreshActiveSwapOrderStatus();
    _orderPollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
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

