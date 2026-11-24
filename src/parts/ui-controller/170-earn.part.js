  // ==================== Earn / Liquid Staking Controller ====================

  async function refreshStakingMetrics(showFeedback = false) {
    const st = getState();
    const contracts = getContracts();
    if (st.staking.loading && !showFeedback) return;
    st.staking.loading = true;
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
    } catch (_) {
      if (showFeedback) showToast(t('获取质押利率失败', 'Failed to fetch APY'));
    } finally {
      st.staking.loading = false;
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

  function renderEarnView() {
    const st = getState();
    const tokens = getTokens();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const allPools = st.staking.pools || contracts.STAKING_POOLS;
    const activeFilter = st.staking.filter || 'featured';
    const searchQuery = st.staking.search || '';
    const filteredPools = getFilteredStakingPools(allPools, activeFilter, searchQuery);

    if (typeof document !== 'undefined') {
      document.querySelectorAll('#earn-pool-filters .filter-pill').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === activeFilter && !searchQuery);
      });
    }
    if ($('earn-pool-search') && $('earn-pool-search').value !== searchQuery) {
      $('earn-pool-search').value = searchQuery;
    }

    const myPosCard = $('earn-my-positions-card');
    const myPosList = $('earn-my-positions-list');
    const myPosCount = $('earn-my-positions-count');
    if (myPosCard && myPosList) {
      const posItems = [];
      const valList = Array.isArray(wallet.nearStakingPositions) ? wallet.nearStakingPositions : [];
      for (const vp of valList) {
        if (!vp) continue;
        if (vp.type === 'lock_convert') {
          if (!(vp.totalAmount > 0.00001)) continue;
          const sym = vp.symbol || 'oRHEA';
          posItems.push({
            symbol: sym,
            chain: vp.chain || 'near',
            title: vp.title || vp.poolId || 'Rhea oRHEA Convert',
            subtitle: vp.subtitle || t('锁仓兑换中', 'Locked Converting'),
            amountText: `${formatBal(vp.totalAmount, 4)} ${sym}`,
            actionType: (vp.canClaim && Array.isArray(vp.claimableIds) && vp.claimableIds.length > 0) ? 'orhea_claim' : '',
            actionTarget: (vp.canClaim && Array.isArray(vp.claimableIds) && vp.claimableIds.length > 0) ? vp.claimableIds.join(',') : '',
            actionLabel: (vp.canClaim && Array.isArray(vp.claimableIds) && vp.claimableIds.length > 0) ? t('领取 RHEA', 'Claim') : ''
          });
          continue;
        }
        if (vp.type === 'xrhea_unstake') {
          if (!(vp.totalAmount > 0.00001)) continue;
          const sym = vp.symbol || 'RHEA';
          posItems.push({
            symbol: sym,
            chain: 'near',
            title: vp.title || 'Rhea xRHEA Unstake',
            subtitle: vp.subtitle || t('xRHEA 解质押解锁中', 'xRHEA unstaking cooldown'),
            amountText: `${formatBal(vp.totalAmount, 4)} ${sym}`,
            actionType: vp.canWithdraw && vp.requestId ? 'xrhea_claim' : '',
            actionTarget: vp.canWithdraw && vp.requestId ? String(vp.requestId) : '',
            actionLabel: vp.canWithdraw && vp.requestId ? t('领取 RHEA', 'Claim') : ''
          });
          continue;
        }
        if (vp.type === 'near_lst_unstaked') {
          if (!(vp.totalAmount > 0.0001)) continue;
          posItems.push({
            symbol: vp.symbol || 'NEAR',
            chain: 'near',
            title: vp.title || vp.contractId || 'NEAR LST',
            subtitle: vp.subtitle || t('解质押冷却中', 'Unbonding'),
            amountText: `${formatBal(vp.totalAmount, 4)} NEAR`,
            actionType: vp.canWithdraw && vp.contractId ? 'near_lst_withdraw' : '',
            actionTarget: vp.canWithdraw && vp.contractId ? vp.contractId : '',
            actionLabel: vp.canWithdraw && vp.contractId ? t('提取', 'Withdraw') : ''
          });
          continue;
        }
        if (vp.type === 'burrow_supply') {
          if (!(vp.totalAmount > 0.00001)) continue;
          const sym = vp.symbol || 'NEAR';
          posItems.push({
            symbol: sym,
            chain: 'near',
            title: vp.title || `Burrow ${sym}`,
            subtitle: vp.subtitle || t('Burrow 活期存款', 'Burrow Supply Position'),
            amountText: `${formatBal(vp.totalAmount, 4)} ${sym}`,
            actionType: 'burrow_withdraw',
            actionTarget: `${vp.tokenContract || 'wrap.near'}|${vp.decimals || 24}`,
            actionLabel: t('提取', 'Withdraw')
          });
          continue;
        }
        if (!(vp.totalNear > 0)) continue;
        const canWithdrawReady = Boolean(vp.canWithdraw && vp.unstakedNear > 0);
        const statusText = vp.stakedNear > 0 && vp.unstakedNear > 0
          ? `${t('质押中', 'Staked')}: ${formatBal(vp.stakedNear, 4)} · ${canWithdrawReady ? t('可提现', 'Withdrawable') : t('解质押冷却中', 'Unstaking')}: ${formatBal(vp.unstakedNear, 4)}`
          : (vp.stakedNear > 0
              ? `${t('验证节点质押中', 'Validator Staked')}`
              : (canWithdrawReady ? t('已解质押 · 可提取', 'Unstaked · Ready') : t('解质押冷却中 (4 Epochs)', 'Unstaking (Cooldown)')));
        posItems.push({
          symbol: 'NEAR',
          chain: 'near',
          title: vp.poolId,
          subtitle: statusText,
          amountText: `${formatBal(vp.totalNear, 4)} NEAR`,
          actionType: canWithdrawReady ? 'near_withdraw' : (vp.stakedNear > 0 ? 'near_unstake' : ''),
          actionTarget: vp.poolId,
          actionLabel: canWithdrawReady ? t('提取', 'Withdraw') : (vp.stakedNear > 0 ? t('解质押', 'Unstake') : '')
        });
      }
      const nepMap = wallet.nearNep141Balances || {};
      const nearLstContracts = [
        { cid: 'lst.rhealab.near', sym: 'rNEAR', name: 'Rhea Staked NEAR', actionType: 'near_lst_unstake' },
        { cid: 'xtoken.rhealab.near', sym: 'xRHEA', name: 'Staked RHEA', actionType: 'xrhea_unstake' },
        { cid: 'meta-pool.near', sym: 'stNEAR', name: 'Meta Pool stNEAR', actionType: 'near_lst_unstake' },
        { cid: 'linear-protocol.near', sym: 'LiNEAR', name: 'LiNEAR Protocol', actionType: 'near_lst_unstake' },
        { cid: 'v2-nearx.stader-labs.near', sym: 'NearX', name: 'Stader NearX', actionType: 'near_lst_unstake' }
      ];
      for (const lst of nearLstContracts) {
        const b = nepMap[lst.cid]?.formatted;
        if (typeof b === 'number' && b > 0.00001) {
          posItems.push({
            symbol: lst.sym,
            chain: 'near',
            title: lst.name,
            subtitle: lst.cid,
            amountText: `${formatBal(b, 4)} ${lst.sym}`,
            actionType: lst.actionType,
            actionTarget: `${lst.cid}|${b}`,
            actionLabel: t('解质押', 'Unstake')
          });
        }
      }
      const solPosList = Array.isArray(wallet.solStakingPositions) ? wallet.solStakingPositions : [];
      for (const sp of solPosList) {
        if (!sp || !(sp.amount > 0.00001)) continue;
        const isJup = sp.type === 'jupiter_dao';
        const subAddr = String(sp.subtitle || '');
        const shortAddr = subAddr.length > 12 ? `${subAddr.slice(0, 6)}...${subAddr.slice(-4)}` : subAddr;
        let jupActionType = '';
        let jupActionTarget = '';
        let jupActionLabel = '';
        if (isJup) {
          if (sp.canWithdraw) {
            jupActionType = 'jup_dao_withdraw';
            jupActionTarget = 'withdraw';
            jupActionLabel = t('提取', 'Withdraw');
          } else if (sp.isMaxLock) {
            jupActionType = 'jup_dao_toggle';
            jupActionTarget = 'toggle_max_lock';
            jupActionLabel = t('开启解锁', 'Unstake');
          }
        } else if (sp.type === 'sol_validator' && sp.subtitle) {
          if (sp.isDeactivating && sp.isReadyToWithdraw) {
            jupActionType = 'sol_validator_withdraw';
            jupActionTarget = `${sp.subtitle}|${sp.lamports || 0}|${sp.amount || 0}`;
            jupActionLabel = t('提取', 'Withdraw');
          } else if (sp.isDeactivating) {
            jupActionType = '';
            jupActionTarget = '';
            jupActionLabel = t('冷却中', 'Cooling');
          } else {
            jupActionType = 'sol_validator_deactivate';
            jupActionTarget = `${sp.subtitle}|${sp.amount || 0}`;
            jupActionLabel = t('解质押', 'Unstake');
          }
        }
        posItems.push({
          symbol: sp.symbol || (isJup ? 'JUP' : 'SOL'),
          chain: sp.chain || 'sol',
          title: sp.title || (isJup ? 'Jupiter DAO (ASR)' : 'Solana Validator'),
          subtitle: isJup
            ? t('Jupiter DAO 锁仓质押', 'Jupiter DAO Locked Stake')
            : (shortAddr ? `${t('验证节点质押', 'Validator Stake')} · ${shortAddr}` : t('Solana 原生质押', 'Solana Native Stake')),
          amountText: `${formatBal(sp.amount, 4)} ${sp.symbol || (isJup ? 'JUP' : 'SOL')}`,
          actionType: jupActionType,
          actionTarget: jupActionTarget,
          actionLabel: jupActionLabel
        });
      }
      const solSpl = wallet.splBalances || {};
      const solLstMints = [
        { poolId: 'jito_sol', mint: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', sym: 'JitoSOL', name: 'Jito Liquid Staking' },
        { poolId: 'jupiter_sol', mint: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', sym: 'jupSOL', name: 'Jupiter Staked SOL' },
        { poolId: 'marinade_msol', mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', sym: 'mSOL', name: 'Marinade Staked SOL' },
        { poolId: 'sanctum_inf', mint: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', sym: 'INF', name: 'Sanctum Infinity' }
      ];
      for (const sl of solLstMints) {
        const b = solSpl[sl.mint];
        if (typeof b === 'number' && b > 0.00001) {
          posItems.push({
            symbol: sl.sym,
            chain: 'sol',
            title: sl.name,
            subtitle: 'Solana LST',
            amountText: `${formatBal(b, 4)} ${sl.sym}`,
            actionType: 'lst_exit',
            actionTarget: `${sl.poolId}|${b}`,
            actionLabel: t('换回 SOL', 'Exit')
          });
        }
      }
      const readErc20PosBal = (chainKey, contractAddr) => {
        const eb = wallet.erc20Balances;
        if (!eb || !chainKey || !contractAddr) return 0;
        const cKey = String(chainKey).toLowerCase();
        const addrLower = String(contractAddr).toLowerCase();
        const nested = eb[cKey]?.[addrLower];
        if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
        const flat = eb[`${cKey}_${addrLower}`];
        if (typeof flat === 'number' && Number.isFinite(flat)) return flat;
        return 0;
      };
      const seenEvmPoolIds = new Set();
      const liveEvmPositions = Array.isArray(wallet.evmStakingPositions) ? wallet.evmStakingPositions : [];
      for (const ep of liveEvmPositions) {
        if (!ep || !(ep.amount > 0.00001)) continue;
        if (ep.poolId) seenEvmPoolIds.add(ep.poolId);
        let actionType = '';
        let actionTarget = '';
        let actionLabel = '';
        if (ep.type === 'aave_v3' && ep.canWithdraw !== false && ep.poolId) {
          actionType = 'aave_withdraw';
          actionTarget = ep.poolId;
          actionLabel = t('提取', 'Withdraw');
        } else if (ep.type === 'erc4626' && ep.poolId) {
          if (ep.canUnstakeCooldown) {
            actionType = 'erc4626_unstake';
            actionTarget = ep.poolId;
            actionLabel = t('领取', 'Claim');
          } else if (ep.needsCooldown) {
            actionType = 'erc4626_cooldown';
            actionTarget = ep.poolId;
            actionLabel = t('发起冷却', 'Cooldown');
          } else if (ep.canRedeem) {
            actionType = 'erc4626_redeem';
            actionTarget = ep.poolId;
            actionLabel = t('赎回', 'Redeem');
          }
        } else if (ep.type === 'liquid_lst' && ep.canExit && ep.poolId) {
          actionType = 'lst_exit';
          actionTarget = `${ep.poolId}|${ep.amount}`;
          actionLabel = t('换回', 'Exit');
        }
        posItems.push({
          symbol: ep.outSymbol || ep.symbol,
          chain: ep.chain || 'eth',
          title: ep.title || ep.poolId,
          subtitle: ep.subtitle || `${String(ep.chain || 'eth').toUpperCase()} Earn`,
          amountText: `${formatBal(ep.amount, 4)} ${ep.symbol || ep.outSymbol}`,
          actionType,
          actionTarget,
          actionLabel
        });
      }
      const evmStakingPositions = [
        { chain: 'eth', contract: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', sym: 'stETH', title: 'Lido Staked ETH', subtitle: 'Ethereum · Lido', poolId: 'lido_steth', actionType: 'lst_exit' },
        { chain: 'eth', contract: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', sym: 'sUSDe', title: 'Ethena Staked USDe', subtitle: 'Ethereum · Ethena', poolId: 'ethena_susde', actionType: 'erc4626_cooldown' },
        { chain: 'eth', contract: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', sym: 'aEthUSDC', title: 'Aave V3 Ethereum USDC', subtitle: 'Ethereum · Aave V3', poolId: 'aave_eth_usdc', actionType: 'aave_withdraw' },
        { chain: 'eth', contract: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', sym: 'aEthWETH', title: 'Aave V3 Ethereum ETH', subtitle: 'Ethereum · Aave V3', poolId: 'aave_eth_weth', actionType: 'aave_withdraw' },
        { chain: 'base', contract: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', sym: 'aBasUSDC', title: 'Aave V3 Base USDC', subtitle: 'Base · Aave V3', poolId: 'aave_base_usdc', actionType: 'aave_withdraw' },
        { chain: 'arb', contract: '0x724dc807b04555b71ed48a6896b6F41593b8C637', sym: 'aArbUSDCn', title: 'Aave V3 Arbitrum USDC', subtitle: 'Arbitrum · Aave V3', poolId: 'aave_arb_usdc', actionType: 'aave_withdraw' },
        { chain: 'arc', contract: '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', sym: 'steakUSDC', title: 'Steakhouse Prime USDC', subtitle: 'Arc · Morpho', poolId: 'arc_steak_usdc', actionType: 'erc4626_redeem' },
        { chain: 'hype', contract: '0xfD739d4e423301CE9385c1fb8850539D657C296D', sym: 'kHYPE', title: 'Kinetiq Staked HYPE', subtitle: 'HyperEVM · Kinetiq', poolId: 'hyper_khype', actionType: 'lst_exit' }
      ];
      for (const ep of evmStakingPositions) {
        if (ep.poolId && seenEvmPoolIds.has(ep.poolId)) continue;
        const b = readErc20PosBal(ep.chain, ep.contract);
        if (typeof b === 'number' && b > 0.00001) {
          const isExit = ep.actionType === 'lst_exit';
          posItems.push({
            symbol: ep.sym,
            chain: ep.chain,
            title: ep.title,
            subtitle: ep.subtitle,
            amountText: `${formatBal(b, 4)} ${ep.sym}`,
            actionType: ep.actionType || '',
            actionTarget: isExit ? `${ep.poolId}|${b}` : (ep.poolId || ''),
            actionLabel: isExit
              ? t('换回', 'Exit')
              : (ep.actionType === 'erc4626_cooldown'
                  ? t('发起冷却', 'Cooldown')
                  : (ep.actionType === 'erc4626_redeem' ? t('赎回', 'Redeem') : t('提取', 'Withdraw')))
          });
        }
      }
      if (posItems.length > 0) {
        myPosCard.classList.remove('hidden');
        if (myPosCount) myPosCount.textContent = String(posItems.length);
        myPosList.innerHTML = posItems.map((it) => `
          <div class="flex items-center justify-between gap-2" style="padding:6px 8px;border-radius:10px;background:rgba(255,255,255,0.03);">
            <div class="flex items-center gap-2">
              ${tokens.renderTokenIconWithBadge({ symbol: it.symbol, blockchain: it.chain }, 28, true)}
              <div class="flex flex-col">
                <span class="mono" style="font-weight:700;font-size:12.5px;color:#fff;">${escapeHtml(it.title)}</span>
                <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(it.subtitle)}</span>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="mono text-emerald" style="font-weight:700;font-size:12.5px;">${escapeHtml(it.amountText)}</span>
              ${it.actionType && it.actionTarget ? `<button type="button" class="mini-action-btn" style="padding:4px 8px;font-size:11px;" data-action="earn-pos-action" data-type="${escapeHtml(it.actionType)}" data-target="${escapeHtml(it.actionTarget)}">${escapeHtml(it.actionLabel)}</button>` : ''}
            </div>
          </div>
        `).join('');
      } else {
        myPosCard.classList.add('hidden');
        myPosList.innerHTML = '';
      }
    }

    const listEl = $('staking-pools-list');
    if (listEl) {
      if (filteredPools.length === 0) {
        listEl.innerHTML = `<div class="ios-glass-card text-center" style="font-size:12.5px;color:var(--text-secondary);">${escapeHtml(t('未找到匹配的质押池或合约', 'No matching staking pools found'))}</div>`;
      } else {
        listEl.innerHTML = filteredPools.map((p) => {
          const selected = st.staking.selectedPoolId === p.id;
          const apyStr = formatPoolApyText(p);
          const avail = getEarnPoolAvailableBalance(wallet, p);
          const tvlStr = formatPoolTvlDisplay(p);
          const stakersStr = typeof p.stakersCount === 'number' && Number.isFinite(p.stakersCount) && p.stakersCount > 0
            ? p.stakersCount.toLocaleString('en-US')
            : '--';
          const catMeta = getPoolCategoryMeta(p);
          return `
            <div class="staking-pool-card ${selected ? 'selected' : ''}" data-action="select-staking-pool" data-pool-id="${escapeHtml(p.id)}">
              <div class="flex items-center gap-3">
                ${tokens.renderTokenIconWithBadge({ symbol: p.outSymbol, blockchain: p.chain, logoURI: getPoolIconUrl(p) }, 36, true)}
                <div class="flex flex-col">
                  <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                    <span style="font-weight:700;color:#fff;">${escapeHtml(p.name)}</span>
                    <span class="pool-cat-badge ${catMeta.cls}">${escapeHtml(catMeta.label)}</span>
                  </div>
                  <span style="font-size:11.5px;color:var(--text-secondary);">${escapeHtml(p.inSymbol)} ➔ ${escapeHtml(p.outSymbol)} · ${escapeHtml(p.chainLabel)}</span>
                  <span style="font-size:10.5px;color:var(--text-muted);margin-top:2px;">🔒 ${escapeHtml(t('总质押', 'TVL'))}: ${escapeHtml(tvlStr)} · 👥 ${escapeHtml(t('人数', 'Stakers'))}: ${escapeHtml(stakersStr)}</span>
                </div>
              </div>
              <div class="flex flex-col" style="text-align:right;flex-shrink:0;">
                <span class="text-emerald" style="font-weight:800;font-size:14px;">${escapeHtml(apyStr)}</span>
                <span style="font-size:11px;color:var(--text-muted);">${escapeHtml(formatBal(avail, 4))} ${escapeHtml(p.inSymbol)}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const activePool = allPools.find((p) => p.id === st.staking.selectedPoolId)
      || (contracts.findStakingPool && contracts.findStakingPool(st.staking.selectedPoolId))
      || filteredPools[0]
      || allPools[0];
    if (!activePool) return;
    if (st.staking.selectedPoolId !== activePool.id) st.staking.selectedPoolId = activePool.id;

    const avail = getEarnPoolAvailableBalance(wallet, activePool);
    if ($('earn-selected-title')) $('earn-selected-title').textContent = `${activePool.name} (${activePool.inSymbol} ➔ ${activePool.outSymbol})`;
    if ($('earn-avail-balance')) $('earn-avail-balance').textContent = `${formatBal(avail, 5)} ${activePool.inSymbol}`;
    if ($('earn-in-symbol')) $('earn-in-symbol').textContent = activePool.inSymbol;
    if ($('earn-live-apy')) $('earn-live-apy').textContent = formatPoolApyText(activePool);
    if ($('earn-tvl-val')) $('earn-tvl-val').textContent = formatPoolTvlDisplay(activePool);
    if ($('earn-stakers-val')) {
      $('earn-stakers-val').textContent = typeof activePool.stakersCount === 'number' && Number.isFinite(activePool.stakersCount) && activePool.stakersCount > 0
        ? activePool.stakersCount.toLocaleString('en-US')
        : '--';
    }

    const lockRow = $('earn-lock-row');
    const lockTiersEl = $('earn-lock-tiers');
    if (lockRow && lockTiersEl) {
      if (activePool.isLockConvert) {
        lockRow.classList.remove('hidden');
        const tiers = Array.isArray(activePool.lockTiers) ? activePool.lockTiers : [];
        if (tiers.length > 0) {
          const curDays = Number(st.staking.lockDays || 181);
          lockTiersEl.innerHTML = tiers.map((tier) => `
            <button type="button" class="filter-pill ${Number(tier.days) === curDays ? 'active' : ''}" data-action="select-earn-lock" data-days="${Number(tier.days)}">${escapeHtml(formatLockTierLabel(tier))}</button>
          `).join('');
        } else {
          lockTiersEl.innerHTML = `<span style="font-size:11.5px;color:var(--text-muted);">--</span>`;
        }
      } else {
        lockRow.classList.add('hidden');
        lockTiersEl.innerHTML = '';
      }
    }

    const effectiveRate = getEffectivePoolRate(activePool);
    if ($('earn-live-rate')) {
      $('earn-live-rate').textContent = typeof effectiveRate === 'number' && Number.isFinite(effectiveRate)
        ? `1 ${activePool.inSymbol} = ${effectiveRate.toFixed(4)} ${activePool.outSymbol}`
        : '--';
    }
    updateEarnEstimatedOut();
  }

  function setEarnPoolFilter(filterKey) {
    const st = getState();
    st.staking.filter = String(filterKey || 'featured').toLowerCase();
    st.staking.search = '';
    if ($('earn-pool-search')) $('earn-pool-search').value = '';
    renderEarnView();
  }

  function handleEarnPoolSearch(query) {
    getState().staking.search = String(query || '');
    renderEarnView();
  }

  function selectEarnLockTier(days) {
    getState().staking.lockDays = Number(days) || 181;
    renderEarnView();
  }

  function getEarnPoolLockupNotice(pool) {
    if (!pool) return '';
    if (pool.id === 'jupiter_jup') {
      return t('⚠️ 注意：Jupiter DAO 质押将开启永久锁仓，解锁需 30 天冷却期，且需参与治理投票才有 ASR 奖励。', '⚠️ Note: Jupiter DAO staking enables max lock (30-day unlock cooldown) and requires governance voting for ASR rewards.');
    }
    if (pool.id === 'ethena_susde') {
      return t('⚠️ 注意：sUSDe 赎回需 7 天冷却期，期间资金不可提前提取。', '⚠️ Note: sUSDe unstaking requires a 7-day cooldown before withdrawal.');
    }
    if (pool.chain === 'near' && !pool.isBurrowSupply && pool.id !== 'rhea_orhea_convert') {
      return t('⚠️ 注意：NEAR 流动性质押常规解押需 2~3 天（4 Epochs）冷却期。', '⚠️ Note: NEAR liquid staking unstake requires ~2-3 days (4 epochs) cooldown.');
    }
    if (pool.id === 'rhea_orhea_convert') {
      return t('⚠️ 注意：oRHEA 转换按所选锁仓天数（30~180 天）到期后方可领取。', '⚠️ Note: oRHEA conversion is locked until the selected lock tier expires.');
    }
    return '';
  }

  function getEarnPoolMinStake(pool) {
    if (!pool) return 0;
    if (pool.chain === 'near' && (pool.inSymbol === 'NEAR' || pool.id === 'rhea_rnear' || pool.id === 'meta_pool' || pool.id === 'linear_protocol' || pool.id === 'stader_nearx')) {
      return pool.isBurrowSupply ? 0.05 : 1;
    }
    return 0;
  }

  function selectStakingPool(poolId) {
    const st = getState();
    st.staking.selectedPoolId = poolId;
    st.staking.amountIn = '';
    if ($('earn-amount-in')) $('earn-amount-in').value = '';
    if ($('earn-est-out')) $('earn-est-out').textContent = '--';
    const rec = $('earn-tx-receipt');
    if (rec) {
      rec.classList.add('hidden');
      rec.innerHTML = '';
    }
    const contracts = getContracts();
    const pool = contracts?.findStakingPool?.(poolId) || (st.staking.pools || []).find((p) => p.id === poolId);
    const noticeEl = $('earn-lockup-notice');
    if (noticeEl) {
      const msg = getEarnPoolLockupNotice(pool);
      if (msg) {
        noticeEl.textContent = msg;
        noticeEl.classList.remove('hidden');
      } else {
        noticeEl.textContent = '';
        noticeEl.classList.add('hidden');
      }
    }
    renderEarnView();
    openSheet('sheet-earn-stake');
  }

  function setEarnMaxAmount() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const pools = st.staking.pools || contracts.STAKING_POOLS;
    const activePool = (contracts.findStakingPool && contracts.findStakingPool(st.staking.selectedPoolId))
      || pools.find((p) => p.id === st.staking.selectedPoolId)
      || pools[0];
    if (!activePool) return;
    const avail = getEarnPoolAvailableBalance(wallet, activePool);
    if (avail === null || avail <= 0) return;
    const needsGasReserve = !activePool.isTokenStake || Boolean(activePool.isNativeWrapSupply);
    const reserve = needsGasReserve
      ? (activePool.isBurrowSupply ? 0.12 : (activePool.chain === 'near' ? 0.05 : activePool.chain === 'sol' ? 0.002 : activePool.chain === 'arc' ? 0.02 : 0.002))
      : 0;
    const maxAmt = Math.max(0, avail - reserve);
    if ($('earn-amount-in')) $('earn-amount-in').value = maxAmt > 0 ? Number(maxAmt.toFixed(6)).toString() : '0';
    updateEarnEstimatedOut();
  }

  function updateEarnEstimatedOut() {
    const st = getState();
    const contracts = getContracts();
    const pools = st.staking.pools || contracts.STAKING_POOLS;
    const activePool = (contracts.findStakingPool && contracts.findStakingPool(st.staking.selectedPoolId))
      || pools.find((p) => p.id === st.staking.selectedPoolId)
      || pools[0];
    const amt = Number($('earn-amount-in')?.value || 0);
    st.staking.amountIn = $('earn-amount-in')?.value || '';
    const outEl = $('earn-est-out');
    if (!outEl || !activePool) return;
    const effectiveRate = getEffectivePoolRate(activePool);
    if (Number.isFinite(amt) && amt > 0 && typeof effectiveRate === 'number' && Number.isFinite(effectiveRate)) {
      outEl.textContent = `${formatBal(amt * effectiveRate, 5)} ${activePool.outSymbol}`;
    } else {
      outEl.textContent = '--';
    }
  }

  async function executeSelectedStake() {
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
          ? (contracts.resolveWalletPoolTokenBalance(wallet, { ...pool, useNativeOrPrecompile: false }) || 0)
          : 0;
        const nativeShortfall = Math.max(0, amt - Math.max(0, Number(wrappedBal) || 0));
        const gasReserve = pool.chain === 'near' ? 0.12 : 0.002;
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
      showToast(err.message);
      return;
    }

    if (!(await verifySecurityAuthAsync(wallet, `${t('确认质押', 'Confirm stake')} ${amt} ${pool.inSymbol}`))) return;

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
      st.staking.amountIn = '';
      if ($('earn-amount-in')) $('earn-amount-in').value = '';
      if ($('earn-est-out')) $('earn-est-out').textContent = '--';
      const rec = $('earn-tx-receipt');
      if (rec) {
        rec.classList.remove('hidden');
        rec.innerHTML = `
          <div class="meta-row"><span class="meta-key">TxHash</span><span class="mono text-emerald">${escapeHtml(shortenAddr(res.txHash, 10, 8))}</span></div>
          ${res.explorerUrl && isValidHttpsUrl(res.explorerUrl) ? `<a href="${escapeHtml(res.explorerUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan" style="font-size:11.5px;">${t('在区块浏览器查看 ↗', 'View on Explorer ↗')}</a>` : ''}
        `;
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
      showToast(err && err.message ? err.message : t('质押失败', 'Staking failed'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevBtnTxt || t('确认链上质押', 'Confirm On-Chain Stake');
      }
    }
  }

  let _earnActionInFlight = false;

  async function executeEarnPositionAction(actionType, actionTarget) {
    if (_earnActionInFlight) return;
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const actionLabelMap = {
      near_unstake: `${t('解质押 NEAR', 'Unstake NEAR')} (${actionTarget})`,
      near_withdraw: `${t('提取 NEAR', 'Withdraw NEAR')} (${actionTarget})`,
      sol_validator_deactivate: `${t('解质押 SOL 验证节点', 'Deactivate SOL Stake')} (${String(actionTarget).split('|')[0]?.slice(0, 8) || ''})`,
      sol_validator_withdraw: `${t('提取 SOL 验证节点', 'Withdraw SOL Stake')} (${String(actionTarget).split('|')[0]?.slice(0, 8) || ''})`,
      aave_withdraw: `${t('提取 Aave V3 存款', 'Withdraw Aave V3')} (${actionTarget})`,
      burrow_withdraw: `${t('提取 Burrow 存款', 'Withdraw Burrow')}`,
      orhea_claim: t('领取 RHEA 到期兑换', 'Claim Matured RHEA'),
      xrhea_unstake: t('解质押 xRHEA', 'Unstake xRHEA'),
      xrhea_claim: t('领取已解锁 RHEA', 'Claim Unlocked RHEA'),
      near_lst_unstake: `${t('解质押 NEAR LST', 'Unstake NEAR LST')} (${String(actionTarget).split('|')[0] || ''})`,
      near_lst_withdraw: `${t('提取 NEAR LST', 'Withdraw NEAR LST')} (${actionTarget})`,
      jup_dao_toggle: t('开启 JUP 30天解锁', 'Start JUP 30d Unlock'),
      jup_dao_withdraw: t('提取已解锁 JUP', 'Withdraw JUP'),
      lst_exit: `${t('换回流动性质押', 'Exit LST')} (${String(actionTarget).split('|')[0] || ''})`,
      erc4626_cooldown: `${t('发起 sUSDe 冷却解锁', 'Cooldown sUSDe')}`,
      erc4626_unstake: `${t('提取已冷却 sUSDe', 'Unstake sUSDe')}`,
      erc4626_redeem: `${t('赎回金库资产', 'Redeem Vault')}`
    };
    const authLabel = actionLabelMap[actionType] || t('确认质押赎回操作', 'Confirm Stake Redemption');
    const btn = typeof event !== 'undefined' && event?.target?.closest ? event.target.closest('button') : null;
    if (!(await verifySecurityAuthAsync(wallet, authLabel))) return;

    _earnActionInFlight = true;
    const prevTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('处理中...', 'Processing...');
    }
    try {
      showToast(t('正在签名并广播赎回交易...', 'Signing & broadcasting redemption...'));
      let res = null;
      if (actionType === 'sol_validator_deactivate') {
        const [stakeAcct, amtStr] = String(actionTarget || '').split('|');
        res = await contracts.deactivateSolanaStakeAccount({ wallet, stakeAccount: stakeAcct });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'SOL',
          chain: 'sol',
          amount: Number(amtStr) || 0,
          txHash: res.txHash,
          title: `${t('SOL 验证节点解押', 'Deactivate SOL Stake')} · ${shortenAddr(stakeAcct)}`
        });
        showToast(`✅ ${t('已提交 SOL 质押解押 (冷却约 1 Epoch)', 'SOL stake deactivation submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'sol_validator_withdraw') {
        const [stakeAcct, lamportsStr, amtStr] = String(actionTarget || '').split('|');
        res = await contracts.withdrawSolanaStakeAccount({ wallet, stakeAccount: stakeAcct, lamports: lamportsStr });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'SOL',
          chain: 'sol',
          amount: Number(amtStr) || 0,
          txHash: res.txHash,
          title: `${t('SOL 验证节点提取', 'Withdraw SOL Stake')} · ${shortenAddr(stakeAcct)}`
        });
        showToast(`✅ ${t('SOL 已提取至钱包余额', 'SOL withdrawn to wallet')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'near_unstake') {
        res = await contracts.unstakeFromNearValidator({ wallet, validatorId: actionTarget });
        const pos = (wallet.nearStakingPositions || []).find((x) => x && x.poolId === actionTarget);
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: Number(pos?.stakedNear || pos?.totalNear || 0),
          txHash: res.txHash,
          title: `${t('解质押', 'Unstake')} · ${actionTarget}`
        });
        showToast(`✅ ${t('已提交解质押 (冷却约 4 Epochs)', 'Unstake submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'near_withdraw') {
        res = await contracts.withdrawFromNearValidator({ wallet, validatorId: actionTarget });
        const pos = (wallet.nearStakingPositions || []).find((x) => x && x.poolId === actionTarget);
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: Number(pos?.unstakedNear || pos?.totalNear || 0),
          txHash: res.txHash,
          title: `${t('提取质押', 'Withdraw')} · ${actionTarget}`
        });
        showToast(`✅ ${t('已提取至 NEAR 余额', 'Withdrawn to NEAR balance')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'aave_withdraw') {
        await ensureEthersLoaded();
        const poolCfg = contracts.findStakingPool ? contracts.findStakingPool(actionTarget) : null;
        const posAmt = poolCfg ? Number(contracts.resolveWalletPoolTokenBalance?.(wallet, poolCfg) || 0) : 0;
        res = await contracts.withdrawFromAaveV3({ wallet, poolId: actionTarget, amount: 'max' });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.inSymbol || 'USDC',
          chain: poolCfg?.chain || 'eth',
          amount: posAmt,
          txHash: res.txHash,
          title: `${t('Aave V3 全额提取', 'Aave V3 Withdraw')} · ${actionTarget}`
        });
        showToast(`✅ ${t('Aave 本息提取已广播', 'Aave V3 withdraw broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'burrow_withdraw') {
        const [tokContract, decStr] = String(actionTarget || '').split('|');
        res = await contracts.withdrawFromBurrow({ wallet, tokenContract: tokContract, amount: 'max', decimals: Number(decStr) || 24 });
        const sym = tokContract === 'wrap.near'
          ? 'NEAR'
          : (tokContract.includes('usdt') ? 'USDT' : (tokContract.includes('17208628') ? 'USDC' : 'NEAR'));
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: sym,
          chain: 'near',
          amount: Number(res?.amount || 0),
          txHash: res.txHash,
          title: `${t('Burrow 全额提取', 'Burrow Withdraw')} · ${sym}`
        });
        showToast(`✅ ${t('Burrow 存款提取已广播', 'Burrow withdraw broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'orhea_claim') {
        const ids = String(actionTarget || '').split(',').map((s) => s.trim()).filter(Boolean);
        res = await contracts.claimRheaOrheaConversion({ wallet, conversionIds: ids });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'RHEA',
          chain: 'near',
          amount: Number(res?.amount || 0),
          txHash: res.txHash,
          title: t('领取 oRHEA 到期兑换', 'Claim Matured RHEA')
        });
        showToast(`✅ ${t('RHEA 领取交易已广播', 'RHEA claim broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'xrhea_unstake') {
        const [cid, amtStr] = String(actionTarget || '').split('|');
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: cid || 'xtoken.rhealab.near',
          amount: Number(amtStr),
          action: 'unstake'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'RHEA',
          chain: 'near',
          amount: Number(amtStr) || 0,
          txHash: res.txHash,
          title: t('xRHEA 解质押', 'xRHEA Unstake')
        });
        showToast(`✅ ${t('已提交 xRHEA 解质押请求', 'xRHEA unstake requested')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'xrhea_claim') {
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: 'xtoken.rhealab.near',
          action: 'claim_unstake',
          requestId: actionTarget
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'RHEA',
          chain: 'near',
          amount: Number(res?.amount || 0),
          txHash: res.txHash,
          title: t('领取已解锁 RHEA', 'Claim xRHEA Unstake')
        });
        showToast(`✅ ${t('RHEA 领取交易已广播', 'RHEA claim broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'near_lst_unstake') {
        const [cid, amtStr] = String(actionTarget || '').split('|');
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: cid,
          amount: Number(amtStr),
          action: 'unstake'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: Number(amtStr) || 0,
          txHash: res.txHash,
          title: `${t('解质押', 'Unstake')} · ${cid}`
        });
        showToast(`✅ ${t('已提交 NEAR LST 解质押 (冷却约 2-3 天)', 'NEAR LST unstake submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'near_lst_withdraw') {
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: actionTarget,
          action: 'withdraw_all'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: Number(res?.amount || 0),
          txHash: res.txHash,
          title: `${t('提取已解质押 NEAR', 'Withdraw NEAR LST')} · ${actionTarget}`
        });
        showToast(`✅ ${t('NEAR 提取交易已广播', 'NEAR withdraw broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'jup_dao_toggle' || actionType === 'jup_dao_withdraw') {
        const jupPos = (wallet.solStakingPositions || []).find((x) => x && x.type === 'jupiter_dao');
        res = await contracts.unstakeJupiterDao({
          wallet,
          action: actionType === 'jup_dao_toggle' ? 'toggle_max_lock' : 'withdraw'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'JUP',
          chain: 'sol',
          amount: Number(jupPos?.amount || 0),
          txHash: res.txHash,
          title: actionType === 'jup_dao_toggle' ? t('开启 JUP 30天解锁', 'Start JUP 30d Unlock') : t('提取已解锁 JUP', 'Withdraw JUP')
        });
        showToast(
          actionType === 'jup_dao_toggle'
            ? `✅ ${t('已关闭永久锁仓，30天解锁倒计时开始', 'JUP 30d unlock started')}: ${shortenAddr(res.txHash)}`
            : `✅ ${t('JUP 提取交易已广播', 'JUP withdraw broadcast')}: ${shortenAddr(res.txHash)}`
        );
      } else if (actionType === 'lst_exit') {
        const [poolId, amtStr] = String(actionTarget || '').split('|');
        const poolCfg = contracts.findStakingPool ? contracts.findStakingPool(poolId) : null;
        if (poolCfg && poolCfg.chain !== 'near' && poolCfg.chain !== 'sol') {
          await ensureEthersLoaded();
        }
        res = await contracts.exitLiquidStakingToken({ wallet, poolId, amount: Number(amtStr) });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.outSymbol || 'LST',
          toSymbol: poolCfg?.inSymbol || '',
          chain: poolCfg?.chain || 'sol',
          amount: Number(amtStr) || 0,
          txHash: res.txHash,
          title: `${t('流动性质押换回', 'Exit LST')} · ${poolCfg?.name || poolId}`
        });
        showToast(`✅ ${t('LST 换回交易已广播', 'LST exit swap broadcast')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'erc4626_redeem' || actionType === 'erc4626_cooldown' || actionType === 'erc4626_unstake') {
        await ensureEthersLoaded();
        const poolCfg = contracts.findStakingPool ? contracts.findStakingPool(actionTarget) : null;
        const mode = actionType === 'erc4626_cooldown' ? 'cooldown' : (actionType === 'erc4626_unstake' ? 'unstake' : 'auto');
        res = await contracts.redeemErc4626Vault({ wallet, poolId: actionTarget, shares: 'max', mode });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.inSymbol || 'USDC',
          chain: poolCfg?.chain || 'eth',
          amount: Number(res?.amount || 0),
          txHash: res.txHash,
          title: `${poolCfg?.name || actionTarget} (${mode})`
        });
        showToast(
          actionType === 'erc4626_cooldown'
            ? `✅ ${t('已发起 sUSDe 冷却解锁期', 'sUSDe cooldown initiated')}: ${shortenAddr(res.txHash)}`
            : `✅ ${t('金库赎回交易已广播', 'Vault redeem broadcast')}: ${shortenAddr(res.txHash)}`
        );
      }
      refreshAllBalancesAsync(false);
      setTimeout(() => refreshAllBalancesAsync(false).catch(() => {}), 5000).unref?.();
    } catch (err) {
      showToast(err && err.message ? err.message : t('赎回失败', 'Redemption failed'));
    } finally {
      _earnActionInFlight = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevTxt;
      }
    }
  }

