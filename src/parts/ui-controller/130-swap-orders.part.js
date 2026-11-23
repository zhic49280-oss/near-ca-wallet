  function renderSwapOrderCard() {
    const st = getState();
    const order = st.swap.activeOrder;
    const activeWallet = st.getActiveWallet();
    const card = $('swap-order-card');
    if (!card) return;
    if (!order || !order.depositAddress || (order.walletId && activeWallet && order.walletId !== activeWallet.id)) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    if ($('swap-order-deposit-addr')) $('swap-order-deposit-addr').textContent = order.depositAddress;
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
    const rawStatus = String(order.status || 'PENDING').toUpperCase();
    const friendlyStatus = statusMap[rawStatus] || order.status || 'PENDING';
    if ($('swap-order-status')) {
      $('swap-order-status').textContent = order.followUpFailed && order.followUpError
        ? `${friendlyStatus} · ⚠️ ${order.followUpError}`
        : friendlyStatus;
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
      resumeBtn.classList.toggle('hidden', !order.followUpFailed);
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
    const sendB = await contracts.executeNearNep141Transfer({
      wallet,
      tokenContract: outFollow.hubContract || fallbackContract,
      receiverId: liveOut.depositAddress,
      amount: bHuman,
      decimals: bDec,
      tokenSymbol: bSym,
      tokenBalance: Number(bHuman)
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

  async function runActiveSwapFollowUp(order) {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    if (!order || order._followUpInFlight || order.followUpExecuted) return;
    const hasFollowUp = Boolean(
      order.followUpConfidentialSwap ||
      order.followUpRefSwap ||
      order.followUpBridgeOut ||
      order.followUpSolDexSwap ||
      order.followUpEvmDexSwap ||
      order.followUpArcRelay ||
      order.followUpArcDexSwap ||
      order.followUpBaseOneClick
    );
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
        showToast(`✅ ${t('near.com 机密意图兑换与提现已自动完成', 'near.com confidential swap & withdraw completed')}`);
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
          const amtInRaw = (liveRaw && BigInt(liveRaw) > 0n)
            ? (follow.amountUsdcRaw && BigInt(liveRaw) > BigInt(follow.amountUsdcRaw)
                ? String(follow.amountUsdcRaw)
                : String(liveRaw))
            : String(follow.amountUsdcRaw || '0');
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
                  inputDecimals: follow.inputDecimals || 6,
                  tokenSymbol: follow.tokenSymbol || 'USDC'
                })
              : await contracts.executeNearRefFinanceSwap({
                  wallet,
                  tokenIn: follow.tokenIn,
                  tokenOut: follow.tokenOut,
                  amountRaw: amtInRaw,
                  slippageBps: follow.slippageBps || 100,
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
          const isPrlDest = String(follow.destinationAsset || '').toLowerCase() === String(intents.PRL_PEARL_ASSET_ID || '').toLowerCase()
            || String(follow.destinationAsset || '').toLowerCase() === String(intents.PRL_NEAR_ASSET_ID || '').toLowerCase();
          const s3Quote = isPrlDest && typeof intents.quoteCompositePrlSwap === 'function'
            ? await intents.quoteCompositePrlSwap({
                fromToken: { assetId: intents.BASE_USDC_1CLICK_ID, blockchain: 'base', symbol: 'USDC', decimals: 6, contractAddress: intents.BASE_USDC_EVM },
                toToken: { assetId: follow.destinationAsset, blockchain: follow.destBlockchain || 'prl', symbol: follow.toSymbol || 'PRL', decimals: 8 },
                amountRaw: bridgeInRaw.toString(),
                slippageBps: follow.slippageBps || 100,
                recipient: follow.recipient,
                refundTo: nearId || evmAddr,
                nearAccountId: nearId,
                dry: false
              })
            : await intents.quoteIntentSwapOrWithdraw({
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
            throw new Error(s3Quote.error || t('获取第三阶段跨链路由失败', 'Failed to get stage 3 1Click route'));
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
      order.followUpError = (err && err.message) || t('后续自动兑换执行失败', 'Follow-up swap execution failed');
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

  async function refreshActiveSwapOrderStatus() {
    const st = getState();
    const order = st.swap.activeOrder;
    const intents = getIntents();
    const contracts = getContracts();
    if (!order || !order.depositAddress) return;
    if (order.followUpBaseOneClick && !order.followUpExecuted && !order.followUpFailed && order.status === 'PENDING_BASE_BRIDGE') {
      const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
      const evmAddr = wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '';
      if (evmAddr && contracts) {
        const baseBalRes = await contracts.fetchEvmNativeAndErc20Balance('base', evmAddr, intents.BASE_USDC_EVM, 6).catch(() => null);
        const availRaw = BigInt(baseBalRes?.tokenRaw || '0');
        const preRaw = BigInt(order.followUpBaseOneClick.preBaseRaw || '0');
        if (availRaw > preRaw) {
          if (_orderPollTimer) { clearInterval(_orderPollTimer); _orderPollTimer = null; }
          order.status = 'SUCCESS';
          if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          renderSwapOrderCard();
          await runActiveSwapFollowUp(order);
          refreshAllBalancesAsync(false);
        }
      }
      return;
    }
    if (order.followUpArcDexSwap && !order.followUpExecuted && !order.followUpFailed && order.status === 'PENDING_ARC_BRIDGE') {
      const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
      const evmAddr = wallet ? (wallet.mpcEvmAddress || wallet.evmAddress) : '';
      if (evmAddr && contracts) {
        const arcBalRes = await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null);
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
        }
      }
      return;
    }
    if (order.followUpConfidentialSwap && order.followUpConfidentialSwap.depositProof && !order.followUpExecuted && !order.followUpFailed && typeof intents.fetchNearcomConfidentialDepositStatus === 'function') {
      const wallet = (order.walletId && Array.isArray(st.wallets) ? st.wallets.find((w) => w.id === order.walletId) : null) || st.getActiveWallet();
      if (wallet) {
        const depRes = await intents.fetchNearcomConfidentialDepositStatus({ wallet, proof: order.followUpConfidentialSwap.depositProof }).catch(() => null);
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
          return;
        }
      }
    }
    const res = await intents.fetchSwapOrderStatus(order.depositAddress);
    if (res.ok && res.status) {
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
    }
  }

  function startOrderStatusPolling() {
    if (_orderPollTimer) clearInterval(_orderPollTimer);
    _orderPollCount = 0;
    refreshActiveSwapOrderStatus();
    _orderPollTimer = setInterval(() => {
      _orderPollCount += 1;
      if (_orderPollCount > 240) {
        clearInterval(_orderPollTimer);
        _orderPollTimer = null;
        if ($('swap-order-status')) {
          $('swap-order-status').textContent = t('仍在确认中 · 点击刷新', 'Still confirming · Tap Refresh');
        }
        return;
      }
      refreshActiveSwapOrderStatus();
    }, 6000);
  }

  async function submitSwapOrderTxHash() {
    const st = getState();
    const intents = getIntents();
    const wallet = st.getActiveWallet();
    const order = st.swap.activeOrder;
    const hash = ($('swap-order-txhash-input')?.value || '').trim();
    if (!order || !order.depositAddress || !hash) {
      showToast(t('请输入有效的 TxHash', 'Enter a valid TxHash'));
      return;
    }
    const res = await intents.submitExternalDepositTxHash({
      depositAddress: order.depositAddress,
      txHash: hash,
      nearSenderAccount: wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : undefined
    });
    if (res.ok) {
      showToast(t('已提交充值凭证，加速确认中', 'Deposit hash submitted'));
      refreshActiveSwapOrderStatus();
    } else {
      showToast(res.error || t('提交失败', 'Submit failed'));
    }
  }

  function clearActiveSwapOrder(force = false) {
    const st = getState();
    const order = st.swap.activeOrder;
    if (!force && order && !order.followUpExecuted && (order.followUpFailed || order.followUpRefSwap || order.followUpDclSwap || order.followUpBridgeOut || order.followUpBaseOneClick || order.followUpArcDexSwap || order.followUpConfidentialSwap)) {
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

