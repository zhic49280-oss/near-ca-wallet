  // ==================== Earn / Liquid Staking Controller ====================

  async function refreshStakingMetrics(showFeedback = false) {
    const st = getState();
    const contracts = getContracts();
    if (st.staking.loading && !showFeedback) return;
    st.staking.loading = true;
    const refreshBtn = $('btn-earn-refresh');
    const prevBtnTxt = refreshBtn ? refreshBtn.textContent : '';
    if (refreshBtn && showFeedback) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = t('刷新中...', 'Refreshing...');
    }
    try {
      const pools = await contracts.fetchLiveStakingMetrics({
        useCache: !showFeedback && Boolean(st.staking.pools),
        onFastUpdate: (fastPools) => {
          if (Array.isArray(fastPools) && fastPools.length > 0) {
            st.staking.pools = fastPools;
            renderEarnView();
          }
        }
      });
      st.staking.pools = pools;
      if (typeof st.saveCachedStakingMetrics === 'function') st.saveCachedStakingMetrics(pools);
      renderEarnView();
      const detailSheet = $('sheet-token-detail');
      if (detailSheet && detailSheet.classList && detailSheet.classList.contains('open')) {
        renderTokenDetailSheet();
      }
      if (showFeedback) showToast(t('已同步实时质押年化', 'Staking APY synced'));
    } catch (err) {
      if (showFeedback) {
        const msg = contracts && typeof contracts.toUserFriendlyError === 'function'
          ? contracts.toUserFriendlyError(err, '获取质押利率失败，请稍后重试', 'Failed to refresh APY. Please try again.')
          : t('获取质押利率失败', 'Failed to fetch APY');
        showToast(msg);
      }
    } finally {
      st.staking.loading = false;
      if (refreshBtn && showFeedback) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = prevBtnTxt || t('刷新利率', 'Refresh APY');
      }
    }
  }
  const refreshEarnMetricsAsync = refreshStakingMetrics;

  function getEarnPoolAvailableBalance(wallet, pool) {
    if (!wallet || !pool) return null;
    const contracts = getContracts();
    if (pool.isBurrowSupply && pool.isNativeWrapSupply) {
      const nativeNear = wallet.nativeBalances ? wallet.nativeBalances.near : null;
      const wnear = wallet.nearNep141Balances?.[pool.tokenContract]?.formatted;
      if (typeof nativeNear !== 'number' && typeof wnear !== 'number') return null;
      return (typeof nativeNear === 'number' && Number.isFinite(nativeNear) ? nativeNear : 0) +
        (typeof wnear === 'number' && Number.isFinite(wnear) ? wnear : 0);
    }
    if (pool.isAaveV3 && pool.isNativeWrapSupply) {
      const nativeEth = wallet.nativeBalances ? wallet.nativeBalances[pool.chain] : null;
      const weth = contracts && typeof contracts.resolveWalletPoolTokenBalance === 'function'
        ? contracts.resolveWalletPoolTokenBalance(wallet, { ...pool, useNativeOrPrecompile: false })
        : 0;
      if (typeof nativeEth !== 'number' && !(weth > 0)) return null;
      return (typeof nativeEth === 'number' && Number.isFinite(nativeEth) ? nativeEth : 0) +
        (typeof weth === 'number' && Number.isFinite(weth) ? weth : 0);
    }
    if (contracts && typeof contracts.resolveWalletPoolTokenBalance === 'function' && (pool.isTokenStake && !pool.useNativeOrPrecompile)) {
      return contracts.resolveWalletPoolTokenBalance(wallet, pool);
    }
    if (!pool.isTokenStake || pool.useNativeOrPrecompile) {
      return wallet.nativeBalances ? wallet.nativeBalances[pool.chain] : null;
    }
    return 0;
  }

  function getFilteredStakingPools(pools, filterKey, searchQuery) {
    const list = Array.isArray(pools) ? pools : [];
    const q = String(searchQuery || '').trim().toLowerCase();
    if (q) {
      return list.filter((p) => {
        const haystack = [
          p.id, p.name, p.protocol, p.inSymbol, p.outSymbol,
          p.chainLabel, p.chain, p.contract, p.tokenContract, p.inputMint
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    const f = String(filterKey || 'featured').toLowerCase();
    if (f === 'all') return list;
    if (f === 'lending') return list.filter((p) => p.category === 'lending' || p.isAaveV3 || p.isBurrowSupply || p.isErc4626 || p.isLockConvert);
    if (f === 'staking') return list.filter((p) => p.category === 'staking' || (!p.isAaveV3 && !p.isBurrowSupply && !p.isErc4626 && !p.isLockConvert));
    if (f === 'near') return list.filter((p) => p.chain === 'near');
    if (f === 'sol') return list.filter((p) => p.chain === 'sol');
    if (f === 'evm') return list.filter((p) => p.chain !== 'near' && p.chain !== 'sol');
    return list.filter((p) => Boolean(p.featured));
  }

  function getPoolCategoryMeta(pool) {
    if (!pool) return { label: '', cls: 'cat-staking' };
    if (pool.isAaveV3 || pool.isBurrowSupply) {
      return { label: t('借贷 Lending', 'Lending'), cls: 'cat-lending' };
    }
    if (pool.isErc4626 || pool.isLockConvert || pool.category === 'lending') {
      return { label: t('金库 Vault', 'Vault'), cls: 'cat-vault' };
    }
    return { label: t('质押 Staking', 'Staking'), cls: 'cat-staking' };
  }

  function getEffectivePoolRate(pool) {
    if (!pool) return null;
    if (pool.isLockConvert && Array.isArray(pool.lockTiers) && pool.lockTiers.length > 0) {
      const lockDays = Number(getState().staking.lockDays || 181);
      const hit = pool.lockTiers.find((tier) => Number(tier.days) === lockDays) || pool.lockTiers[pool.lockTiers.length - 1];
      return hit ? Number(hit.rate) : pool.rate;
    }
    return pool.rate;
  }

  function formatLockTierLabel(tier) {
    const days = Number(tier.days);
    const pct = `${Math.round(Number(tier.rate) * 100)}%`;
    if (days === 15) return t(`2周 (15天 · ${pct})`, `2W (15d · ${pct})`);
    if (days === 45) return t(`1.5个月 (45天 · ${pct})`, `1.5M (45d · ${pct})`);
    if (days === 91) return t(`3个月 (91天 · ${pct})`, `3M (91d · ${pct})`);
    if (days === 181) return t(`6个月 (181天 · ${pct})`, `6M (181d · ${pct})`);
    return t(`${days}天 · ${pct}`, `${days}d · ${pct}`);
  }

  function formatPoolApyText(p) {
    if (p.isLockConvert) {
      if (Array.isArray(p.lockTiers) && p.lockTiers.length > 0) {
        const minPct = Math.round(p.lockTiers[0].rate * 100);
        const maxPct = Math.round(p.lockTiers[p.lockTiers.length - 1].rate * 100);
        return t(`${minPct}%~${maxPct}% 兑换`, `${minPct}%~${maxPct}%`);
      }
      return '--';
    }
    if (typeof p.apy === 'number' && Number.isFinite(p.apy)) {
      if (p.isJupiterDao || p.isAsrEstimated) {
        return t(`ASR 估算 ~${p.apy.toFixed(2)}%`, `ASR Est. ~${p.apy.toFixed(2)}%`);
      }
      return `${p.apy.toFixed(2)}%`;
    }
    return '--';
  }


  async function executeSelectedStakeInner() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const pools = st.staking.pools || contracts.STAKING_POOLS;
    const pool = (contracts.findStakingPool && contracts.findStakingPool(st.staking.selectedPoolId))
      || pools.find((p) => p.id === st.staking.selectedPoolId)
      || pools[0];
    const amt = Number($('earn-amount-in')?.value || 0);
    const avail = getEarnPoolAvailableBalance(wallet, pool);

    try {
      const minStake = getEarnPoolMinStake(pool);
      if (minStake > 0 && (!Number.isFinite(amt) || amt < minStake)) {
        throw new Error(t(`该质押池最低质押数量为 ${minStake} ${pool.inSymbol}`, `Minimum stake for this pool is ${minStake} ${pool.inSymbol}`));
      }
      if (pool.isNativeWrapSupply) {
        contracts.validateSufficientChainBalance({
          wallet,
          chain: pool.chain,
          tokenSymbol: pool.inSymbol,
          amount: amt,
          isNative: false,
          tokenBalance: avail
        });
        const wrappedBal = contracts.resolveWalletPoolTokenBalance
          ? (contracts.resolveWalletPoolTokenBalance(wallet, { ...pool, isTokenStake: true, useNativeOrPrecompile: false }) || 0)
          : 0;
        const nativeShortfall = Math.max(0, amt - Math.max(0, Number(wrappedBal) || 0));
        const gasReserve = pool.chain === 'near' ? 0.12 : (pool.chain === 'eth' ? 0.005 : 0.002);
        const nativeAvail = Number(wallet.nativeBalances?.[pool.chain] ?? (pool.chain === 'near' ? wallet.nearBalance : 0) ?? 0);
        if (nativeAvail < nativeShortfall + gasReserve) {
          throw new Error(
            t(
              `${pool.chainLabel} 原生 Gas 余额不足 (可用: ${nativeAvail.toFixed(4)}，需预留 ${gasReserve})`,
              `Insufficient native gas on ${pool.chainLabel} (Available: ${nativeAvail.toFixed(4)}, reserve ${gasReserve})`
            )
          );
        }
      } else {
        contracts.validateSufficientChainBalance({
          wallet,
          chain: pool.chain,
          tokenSymbol: pool.inSymbol,
          amount: amt,
          isNative: !pool.isTokenStake,
          tokenBalance: pool.isTokenStake ? avail : null
        });
        if (pool.isTokenStake && contracts.DEFAULT_GAS_BUFFERS) {
          const ck = String(pool.chain || '').toLowerCase();
          const minNative = Number(contracts.DEFAULT_GAS_BUFFERS[ck] || 0);
          const nativeAvail = Number(wallet.nativeBalances?.[ck] ?? (ck === 'near' ? wallet.nearBalance : 0) ?? 0);
          if (minNative > 0 && nativeAvail + 1e-12 < minNative) {
            throw new Error(
              t(
                `${pool.chainLabel} 原生 Gas 余额不足 (可用: ${nativeAvail.toFixed(5)}，需 >= ${minNative})`,
                `Insufficient native gas on ${pool.chainLabel} (${nativeAvail.toFixed(5)} < ${minNative})`
              )
            );
          }
        }
      }
    } catch (err) {
      const msg = contracts && typeof contracts.toUserFriendlyError === 'function'
        ? contracts.toUserFriendlyError(err, '无法发起质押，请检查余额后重试', 'Unable to stake. Please check your balance and try again.')
        : t('无法发起质押，请检查余额后重试', 'Unable to stake. Please check your balance and try again.');
      showToast(msg);
      return;
    }

    const earnChainName = typeof getTxFlowChainName === 'function' ? getTxFlowChainName(pool.chain) : String(pool.chain || '').toUpperCase();
    const apyVal = Number((st.staking.apyMap && st.staking.apyMap[pool.id]) ?? pool.apy);
    const apyText = Number.isFinite(apyVal) && apyVal > 0 ? `${apyVal.toFixed(2)}%` : '--';
    const lockText = pool.lockDays
      ? `${pool.lockDays} ${t('天', 'days')}`
      : (pool.isLockConvert || pool.id === 'rhea_orhea_convert'
          ? `${st.staking.lockDays || 181} ${t('天', 'days')}`
          : t('随存随取 / 按协议冷却', 'Flexible / Protocol cooldown'));
    const stakeFeeText = pool.chain === 'near'
      ? '< 0.02 NEAR'
      : (pool.chain === 'sol' ? '≈ 0.0005 SOL' : t('由网络自动扣除', 'Network auto-calculated'));
    const stakeSteps = [{ title: t(`确认 ${pool.name} 质押`, `Confirm ${pool.name} stake`), chain: pool.chain }];
    const stakePreview = {
      title: t('确认链上质押', 'Confirm On-Chain Stake'),
      subtitle: `${pool.name} (${pool.inSymbol} → ${pool.outSymbol})`,
      payLabel: t('质押数量', 'Stake Amount'),
      payAmountText: `${amt} ${pool.inSymbol}`,
      receiveLabel: t('质押协议', 'Protocol'),
      receiveAmountText: pool.name,
      networkPath: earnChainName,
      feeText: stakeFeeText,
      detailRows: [
        { label: t('预计年化 (APY)', 'Est. APY'), value: apyText, tone: 'emerald', mono: true },
        { label: t('锁定期说明', 'Lockup'), value: lockText }
      ],
      confirmLabel: t('确认质押', 'Confirm Stake'),
      steps: stakeSteps
    };

    if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(stakePreview))) return;
    if (!(await verifySecurityAuthAsync(wallet, `${t('确认质押', 'Confirm stake')} ${amt} ${pool.inSymbol}`))) {
      if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
      return;
    }

    const stepper = typeof createTxStepperController === 'function'
      ? createTxStepperController(t('正在执行质押', 'Executing Stake'), stakeSteps)
      : null;
    if (stepper) stepper.setStep(0, 'active');

    const btn = $('btn-execute-stake');
    const prevBtnTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('质押提交中...', 'Staking...');
    }
    try {
      if (pool.chain !== 'near' && pool.chain !== 'sol') {
        await ensureEthersLoaded();
      }
      const res = await contracts.executeOnChainStaking({
        wallet,
        poolId: pool.id,
        amount: amt,
        lockDays: st.staking.lockDays || 181,
        tokenBalance: pool.isTokenStake ? avail : null
      });
      if (stepper) {
        stepper.setStep(0, 'done', { txHash: (res && res.txHash) || '', explorerUrl: (res && res.explorerUrl) || '', chain: pool.chain });
        stepper.finish(true, {
          text: `${pool.name} ${t('质押成功', 'Staked')}`,
          doneTitle: t('质押成功', 'Stake Completed')
        });
      }
      st.staking.amountIn = '';
      if ($('earn-amount-in')) $('earn-amount-in').value = '';
      if ($('earn-est-out')) $('earn-est-out').textContent = '--';
      const rec = $('earn-tx-receipt');
      if (rec) {
        rec.classList.remove('hidden');
        const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
        if (fw && typeof fw.mountEarnStakeSheetPanel === 'function') {
          fw.mountEarnStakeSheetPanel(rec, {
            mode: 'receipt',
            receipt: { txHash: res.txHash, explorerUrl: res.explorerUrl || '' },
            isEn: st.lang === 'en',
            shortenAddr
          });
        } else {
          rec.innerHTML = `
          <div class="meta-row"><span class="meta-key">${t('交易哈希', 'Transaction ID')}</span><span class="mono text-emerald">${escapeHtml(shortenAddr(res.txHash, 10, 8))}</span></div>
          ${res.explorerUrl && isValidHttpsUrl(res.explorerUrl) ? `<a href="${escapeHtml(res.explorerUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan" style="font-size:11.5px;">${t('在区块浏览器查看 ↗', 'View on Explorer ↗')}</a>` : ''}
        `;
        }
      }
      recordWalletActivity(wallet, {
        type: 'stake',
        symbol: pool.inSymbol,
        toSymbol: pool.outSymbol,
        chain: pool.chain,
        amount: amt,
        txHash: res.txHash,
        title: `${pool.name} (${pool.inSymbol} ➔ ${pool.outSymbol})`
      });
      showToast(`✅ ${pool.name} ${t('质押成功', 'Staked')}`);
      refreshAllBalancesAsync(false);
      setTimeout(() => refreshAllBalancesAsync(false).catch(() => {}), 5000).unref?.();
      setTimeout(() => refreshAllBalancesAsync(false).catch(() => {}), 15000).unref?.();
    } catch (err) {
      const msg = contracts && typeof contracts.toUserFriendlyError === 'function'
        ? contracts.toUserFriendlyError(err, '质押失败，请稍后重试', 'Staking failed. Please try again.')
        : t('质押失败，请稍后重试', 'Staking failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: msg });
        stepper.finish(false, msg);
      }
      showToast(msg);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevBtnTxt || t('确认链上质押', 'Confirm On-Chain Stake');
      }
    }
  }
