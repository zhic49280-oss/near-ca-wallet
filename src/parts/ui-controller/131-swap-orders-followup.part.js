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
          feeRecipient: conf.feeRecipient || intents.DEFAULT_REFERRAL_ACCOUNT,
          swapDepositAddress: conf.swapDepositAddress || '',
          swapIntentHash: conf.swapIntentHash || '',
          settledOutRaw: conf.settledOutRaw || '',
          onStepASettled: ({ swapDepositAddress, swapIntentHash, settledOutRaw }) => {
            conf.swapDepositAddress = swapDepositAddress;
            conf.swapIntentHash = swapIntentHash;
            conf.settledOutRaw = settledOutRaw;
            if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(order);
          }
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
            const preOutRaw = preBridgeBal?.[follow.tokenOut]?.raw != null ? BigInt(preBridgeBal[follow.tokenOut].raw) : null;
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
              const expectedUsdc = BigInt(swapRes.amountOut || '0');
              const hasPreOut = preOutRaw !== null;
              let deltaUsdc = (hasPreOut && postUsdcBal?.[dclFollow.tokenIn]?.raw != null)
                ? (BigInt(postUsdcBal[dclFollow.tokenIn].raw) > preOutRaw ? (BigInt(postUsdcBal[dclFollow.tokenIn].raw) - preOutRaw) : 0n)
                : (hasPreOut ? 0n : expectedUsdc);
              if (hasPreOut && deltaUsdc <= 0n) {
                throw new Error(t(
                  `第一阶段兑换后余额未增加，已暂停第二阶段以保护既有余额${swapRes?.txHash ? ` (Tx: ${swapRes.txHash})` : ''}`,
                  `Balance did not increase after Stage 1 swap; Stage 2 paused to protect existing balance${swapRes?.txHash ? ` (Tx: ${swapRes.txHash})` : ''}`
                ));
              }
              if (expectedUsdc > 0n && deltaUsdc > expectedUsdc) deltaUsdc = expectedUsdc;
              const dclInRaw = (hasPreOut ? deltaUsdc : (deltaUsdc > 0n ? deltaUsdc : expectedUsdc)).toString();
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
                throw new Error((dclQ && dclQ.error) || t('第二阶段兑换询价失败', 'Stage 2 swap quote failed'));
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
              const expectedOut = BigInt(swapRes.amountOut || outFollow.expectedInRaw || '0');
              const hasPreOut = preOutRaw !== null;
              let deltaOut = (hasPreOut && postOutBal?.[follow.tokenOut]?.raw != null)
                ? (BigInt(postOutBal[follow.tokenOut].raw) > preOutRaw ? (BigInt(postOutBal[follow.tokenOut].raw) - preOutRaw) : 0n)
                : (hasPreOut ? 0n : expectedOut);
              if (hasPreOut && deltaOut <= 0n) {
                throw new Error(t(
                  `第一阶段兑换后余额未增加，已暂停第二阶段以保护既有余额${swapRes?.txHash ? ` (Tx: ${swapRes.txHash})` : ''}`,
                  `Balance did not increase after Stage 1 swap; Stage 2 paused to protect existing balance${swapRes?.txHash ? ` (Tx: ${swapRes.txHash})` : ''}`
                ));
              }
              if (expectedOut > 0n && deltaOut > expectedOut) deltaOut = expectedOut;
              const bridgeInRaw = (hasPreOut ? deltaOut : (deltaOut > 0n ? deltaOut : BigInt(outFollow.expectedInRaw || '0'))).toString();
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
          throw new Error((dclQ && dclQ.error) || t('第二阶段兑换询价失败', 'Stage 2 swap quote failed'));
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
          const hasPreLamports = follow.preSolLamports !== undefined && follow.preSolLamports !== null && follow.preSolLamports !== '';
          if (hasPreLamports && deltaLamports <= 0n) {
            throw new Error(t('第一阶段 SOL 资金尚未到账，请稍后重试', 'Stage 1 SOL funds not yet arrived; please retry shortly'));
          }
          if (deltaLamports <= 0n && expectedLamports <= 0n) {
            throw new Error(t('未检测到第二阶段到账余额且缺少预期金额，已停止自动兑换以保护账户资金', 'Stage 2 arrival not detected and expected amount missing; aborted to protect funds'));
          }
          let swapInLamports = deltaLamports > 0n ? deltaLamports : expectedLamports;
          if (expectedLamports > 0n && swapInLamports > expectedLamports) swapInLamports = expectedLamports;
          if (swapInLamports > maxSpendable) swapInLamports = maxSpendable;
          if (swapInLamports <= 0n) throw new Error(t('Solana 账户 SOL 余额不足以保留手续费', 'Insufficient SOL after fee reserve'));
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances.sol = Number(contracts.fromBaseUnits(availLamports.toString(), 9));
          if (typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
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
          const hasPreWei = follow.preNativeWei !== undefined && follow.preNativeWei !== null && follow.preNativeWei !== '';
          if (hasPreWei && deltaWei <= 0n) {
            throw new Error(t('第一阶段资金尚未到账，请稍后重试', 'Stage 1 funds not yet arrived; please retry shortly'));
          }
          if (deltaWei <= 0n && expectedWei <= 0n) {
            throw new Error(t('未检测到第二阶段到账余额且缺少预期金额，已停止自动兑换以保护账户资金', 'Stage 2 arrival not detected and expected amount missing; aborted to protect funds'));
          }
          let swapInWei = deltaWei > 0n ? deltaWei : expectedWei;
          if (expectedWei > 0n && swapInWei > expectedWei) swapInWei = expectedWei;
          if (swapInWei > maxSpendable) swapInWei = maxSpendable;
          if (swapInWei <= 0n) throw new Error(t('目标链原生 Gas 余额不足', 'Insufficient native balance after gas reserve'));
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances[follow.chainKey] = Number(contracts.fromBaseUnits(availWei.toString(), 18));
          if (typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
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
          showToast(`✅ ${t('第二阶段已自动兑换为', 'Stage 2 swapped to')} ${follow.toSymbol}: ${shortenAddr(evmRes.txHash)}`);
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
            const destLower = String(follow.destinationAsset || '').toLowerCase();
            const isBaseUsdcDest = Boolean(
              (intents.BASE_USDC_1CLICK_ID && destLower === String(intents.BASE_USDC_1CLICK_ID).toLowerCase()) ||
              (intents.BASE_USDC_EVM && destLower === String(intents.BASE_USDC_EVM).toLowerCase())
            );
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
          const hasPreBase = follow.preBaseRaw !== undefined && follow.preBaseRaw !== null && follow.preBaseRaw !== '';
          if (hasPreBase && deltaRaw <= 0n) {
            throw new Error(t('第一阶段 Base USDC 资金尚未到账，请稍后重试', 'Stage 1 Base USDC funds not yet arrived; please retry shortly'));
          }
          let bridgeInRaw = deltaRaw > 0n ? deltaRaw : expectedRaw;
          if (expectedRaw > 0n && bridgeInRaw > expectedRaw) bridgeInRaw = expectedRaw;
          if (bridgeInRaw > availRaw && availRaw > 0n) bridgeInRaw = availRaw;
          if (bridgeInRaw <= 0n) throw new Error(t('Base USDC 余额不足以发起 Relay 跨链至 Arc', 'Insufficient Base USDC for Relay to Arc'));

          const destLower = String(follow.destContract || intents.ARC_USDC_CONTRACT).toLowerCase();
          const needsArcSwap = Boolean(follow.destContract && destLower !== intents.ARC_USDC_CONTRACT.toLowerCase() && destLower !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
          const relayRecipient = (!needsArcSwap && follow.recipient && /^0x[0-9a-fA-F]{40}$/.test(follow.recipient))
            ? follow.recipient
            : evmAddr;
          const preArcRes = needsArcSwap
            ? await contracts.fetchEvmNativeAndErc20Balance('arc', evmAddr).catch(() => null)
            : null;
          if (needsArcSwap && (!preArcRes || preArcRes.nativeRaw == null)) {
            throw new Error(t('无法读取 Arc 主网余额，请稍后重试', 'Failed to read Arc Mainnet balance, please retry'));
          }
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
              preArcUsdcRaw: String(preArcRes.nativeRaw),
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
          const hasPreArc = follow.preArcUsdcRaw !== undefined && follow.preArcUsdcRaw !== null && follow.preArcUsdcRaw !== '';
          if (hasPreArc && deltaWei <= 0n) {
            throw new Error(t('Arc 主网 USDC 尚未到账，请稍后重试', 'Arc Mainnet USDC has not arrived yet, please retry shortly'));
          }
          let swapInWei = hasPreArc ? deltaWei : (deltaWei > 0n ? deltaWei : expectedWei);
          if (expectedWei > 0n && swapInWei > expectedWei) swapInWei = expectedWei;
          if (swapInWei > maxSpendableWei) swapInWei = maxSpendableWei;
          const swapIn6 = swapInWei / 1000000000000n;
          if (swapIn6 <= 0n) {
            throw new Error(t('Arc 主网 USDC 尚未到账或不足预留 Gas', 'Arc Mainnet USDC not yet arrived or below gas reserve'));
          }
          wallet.nativeBalances = wallet.nativeBalances || {};
          wallet.nativeBalances.arc = Number(contracts.fromBaseUnits(availWei.toString(), 18));
          if (typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
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
          const hasPreBase = follow.preBaseRaw !== undefined && follow.preBaseRaw !== null && follow.preBaseRaw !== '';
          if (hasPreBase && deltaRaw <= 0n) {
            throw new Error(t('第一阶段 Base USDC 资金尚未到账，请稍后重试', 'Stage 1 Base USDC funds not yet arrived; please retry shortly'));
          }
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
      if (err && err.code === 'CONFIDENTIAL_SWAP_PENDING' && order.followUpConfidentialSwap) {
        if (err.swapDepositAddress) order.followUpConfidentialSwap.swapDepositAddress = err.swapDepositAddress;
        if (err.swapIntentHash) order.followUpConfidentialSwap.swapIntentHash = err.swapIntentHash;
      }
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

