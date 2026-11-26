  // ==================== Earn / Liquid Staking Controller ====================

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
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
      if (posItems.length > 0) {
        myPosCard.classList.remove('hidden');
        if (myPosCount) {
          const nextCount = String(posItems.length);
          if (myPosCount.textContent !== nextCount) myPosCount.textContent = nextCount;
        }
        if (fw && typeof fw.mountEarnValidatorsPanel === 'function') {
          fw.mountEarnValidatorsPanel(myPosList, { items: posItems, isEn: st.lang === 'en' });
        } else {
          setHtmlIfChanged(myPosList, posItems.map((it) => `
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
        `).join(''));
        }
      } else {
        myPosCard.classList.add('hidden');
        if (fw && typeof fw.mountEarnValidatorsPanel === 'function') {
          fw.mountEarnValidatorsPanel(myPosList, { items: [], isEn: st.lang === 'en' });
        } else {
          setHtmlIfChanged(myPosList, '');
        }
      }
    }

    const listEl = $('staking-pools-list');
    if (listEl) {
      const fw = typeof window !== 'undefined' ? window.NearCAFramework : null;
      if (fw && typeof fw.mountEarnPoolsPanel === 'function') {
        fw.mountEarnPoolsPanel(listEl, {
          pools: filteredPools,
          selectedPoolId: st.staking.selectedPoolId || '',
          loading: Boolean(st.staking.loading),
          isEn: st.lang === 'en',
          getPoolData: (p) => ({
            apyText: formatPoolApyText(p),
            availBalance: getEarnPoolAvailableBalance(wallet, p),
            tvlText: formatPoolTvlDisplay(p),
            stakersText: (typeof p.stakersCount === 'number' && Number.isFinite(p.stakersCount) && p.stakersCount > 0)
              ? p.stakersCount.toLocaleString('en-US')
              : '--',
            catMeta: getPoolCategoryMeta(p),
            iconUrl: getPoolIconUrl(p)
          }),
          formatBal
        });
      } else if (filteredPools.length === 0) {
        setHtmlIfChanged(listEl, `<div class="ios-glass-card text-center" style="font-size:12.5px;color:var(--text-secondary);">${escapeHtml(t('未找到匹配的质押池或合约', 'No matching staking pools found'))}</div>`);
      } else {
        setHtmlIfChanged(listEl, filteredPools.map((p) => {
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
        }).join(''));
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
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
      if (activePool.isLockConvert) {
        lockRow.classList.remove('hidden');
        const tiers = Array.isArray(activePool.lockTiers) ? activePool.lockTiers : [];
        const curDays = Number(st.staking.lockDays || 181);
        if (fw && typeof fw.mountEarnStakeSheetPanel === 'function') {
          fw.mountEarnStakeSheetPanel(lockTiersEl, {
            mode: 'lock-tiers',
            tiers,
            selectedDays: curDays,
            isEn: st.lang === 'en',
            formatLockTierLabel
          });
        } else if (tiers.length > 0) {
          lockTiersEl.innerHTML = tiers.map((tier) => `
            <button type="button" class="filter-pill ${Number(tier.days) === curDays ? 'active' : ''}" data-action="select-earn-lock" data-days="${Number(tier.days)}">${escapeHtml(formatLockTierLabel(tier))}</button>
          `).join('');
        } else {
          lockTiersEl.innerHTML = `<span style="font-size:11.5px;color:var(--text-muted);">--</span>`;
        }
      } else {
        lockRow.classList.add('hidden');
        if (fw && typeof fw.mountEarnStakeSheetPanel === 'function') {
          fw.mountEarnStakeSheetPanel(lockTiersEl, { mode: 'lock-tiers', tiers: [], isEn: st.lang === 'en' });
        } else {
          if (fw && typeof fw.render === 'function') {
            try { fw.render(null, lockTiersEl); } catch (_) {}
          }
          lockTiersEl.innerHTML = '';
        }
      }
    }

    const effectiveRate = getEffectivePoolRate(activePool);
    if ($('earn-live-rate')) {
      $('earn-live-rate').textContent = typeof effectiveRate === 'number' && Number.isFinite(effectiveRate)
        ? `1 ${activePool.inSymbol} = ${effectiveRate.toFixed(4)} ${activePool.outSymbol}`
        : '--';
    }
    const noticeEl = $('earn-lockup-notice');
    if (noticeEl) {
      const msg = getEarnPoolLockupNotice(activePool);
      if (msg) {
        noticeEl.textContent = msg;
        noticeEl.classList.remove('hidden');
      } else {
        noticeEl.textContent = '';
        noticeEl.classList.add('hidden');
      }
    }
    updateEarnEstimatedOut();
  }

  let _earnSearchTimer = null;

  function setEarnPoolFilter(filterKey) {
    if (_earnSearchTimer) {
      clearTimeout(_earnSearchTimer);
      _earnSearchTimer = null;
    }
    const st = getState();
    st.staking.filter = String(filterKey || 'featured').toLowerCase();
    st.staking.search = '';
    if ($('earn-pool-search')) $('earn-pool-search').value = '';
    renderEarnView();
  }

  function handleEarnPoolSearch(query, useDebounce = false) {
    getState().staking.search = String(query || '');
    if (_earnSearchTimer) {
      clearTimeout(_earnSearchTimer);
      _earnSearchTimer = null;
    }
    if (useDebounce && typeof setTimeout === 'function') {
      _earnSearchTimer = setTimeout(() => {
        _earnSearchTimer = null;
        renderEarnView();
      }, 150);
      if (_earnSearchTimer && typeof _earnSearchTimer.unref === 'function') _earnSearchTimer.unref();
      return;
    }
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
      return t('⚠️ 注意：oRHEA 转换按所选锁仓天数（15~181 天）到期后方可领取。', '⚠️ Note: oRHEA conversion is locked for the selected period (15–181 days) until maturity.');
    }
    return '';
  }

  function getEarnPoolMinStake(pool) {
    if (!pool) return 0;
    if (pool.chain === 'near' && (pool.inSymbol === 'NEAR' || pool.id === 'rhea_rnear' || pool.id === 'metapool_stnear' || pool.id === 'linear_near' || pool.id === 'stader_nearx')) {
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
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
      if (fw && typeof fw.mountEarnStakeSheetPanel === 'function') {
        fw.mountEarnStakeSheetPanel(rec, { mode: 'receipt', receipt: null, isEn: st.lang === 'en' });
      } else {
        if (fw && typeof fw.render === 'function') {
          try { fw.render(null, rec); } catch (_) {}
        }
        rec.innerHTML = '';
      }
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
      ? (activePool.isBurrowSupply ? 0.12 : (activePool.chain === 'near' ? 0.05 : activePool.chain === 'sol' ? 0.002 : activePool.chain === 'arc' ? 0.02 : (activePool.chain === 'eth' ? 0.005 : 0.002)))
      : 0;
    const maxAmt = Math.max(0, avail - reserve);
    const floored = maxAmt > 0 ? Math.floor(maxAmt * 1e6) / 1e6 : 0;
    if ($('earn-amount-in')) $('earn-amount-in').value = floored > 0 ? String(floored) : '0';
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

  let _earnStakeInFlight = false;

  async function executeSelectedStake() {
    if (_earnStakeInFlight) return;
    _earnStakeInFlight = true;
    const lockBtn = $('btn-execute-stake');
    const lockPrevTxt = lockBtn ? lockBtn.textContent : '';
    if (lockBtn) {
      lockBtn.disabled = true;
      lockBtn.textContent = t('处理中...', 'Processing...');
    }
    try {
      await executeSelectedStakeInner();
    } finally {
      _earnStakeInFlight = false;
      if (lockBtn) {
        lockBtn.disabled = false;
        lockBtn.textContent = lockPrevTxt || t('确认链上质押', 'Confirm On-Chain Stake');
      }
    }
  }


  let _earnActionInFlight = false;

  async function executeEarnPositionAction(actionType, actionTarget, customAmount = null, triggerEl = null) {
    if (_earnActionInFlight) return;
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const parsedCustom = customAmount !== null && customAmount !== undefined && Number.isFinite(Number(customAmount)) && Number(customAmount) > 0
      ? Number(customAmount)
      : null;
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
    const baseAuthLabel = actionLabelMap[actionType] || t('确认质押赎回操作', 'Confirm Stake Redemption');
    const authLabel = parsedCustom ? `${baseAuthLabel} · ${formatBal(parsedCustom, 4)}` : baseAuthLabel;
    const btn = (triggerEl && typeof triggerEl.closest === 'function' ? triggerEl.closest('button') : triggerEl)
      || (typeof document !== 'undefined'
        ? Array.from(document.querySelectorAll('button[data-action="earn-pos-action"]')).find(
            (el) => el.getAttribute('data-type') === String(actionType) && el.getAttribute('data-target') === String(actionTarget)
          ) || null
        : null);
    const actionChain = (() => {
      if (actionType === 'sol_validator_deactivate' || actionType === 'sol_validator_withdraw' || actionType === 'jup_dao_toggle' || actionType === 'jup_dao_withdraw') return 'sol';
      if (actionType === 'lst_exit') {
        const [pid] = String(actionTarget || '').split('|');
        const cfg = contracts.findStakingPool ? contracts.findStakingPool(pid) : null;
        return (cfg && cfg.chain) || 'sol';
      }
      if (actionType === 'aave_withdraw' || actionType === 'erc4626_redeem' || actionType === 'erc4626_cooldown' || actionType === 'erc4626_unstake') {
        const cfg = contracts.findStakingPool ? contracts.findStakingPool(actionTarget) : null;
        return (cfg && cfg.chain) || 'eth';
      }
      return 'near';
    })();
    const actionChainName = typeof getTxFlowChainName === 'function' ? getTxFlowChainName(actionChain) : String(actionChain).toUpperCase();
    const actionSteps = [{ title: authLabel, chain: actionChain }];
    const actionPreview = {
      title: t('确认赎回 / 领取', 'Confirm Redeem / Claim'),
      subtitle: authLabel,
      networkPath: actionChainName,
      feeText: actionChain === 'near' ? '< 0.01 NEAR' : (actionChain === 'sol' ? '≈ 0.0005 SOL' : t('由网络自动扣除', 'Network auto-calculated')),
      detailRows: parsedCustom ? [{ label: t('操作数量', 'Amount'), value: formatBal(parsedCustom, 6), mono: true }] : [],
      confirmLabel: t('确认执行', 'Confirm'),
      steps: actionSteps
    };
    _earnActionInFlight = true;
    const prevTxt = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('处理中...', 'Processing...');
    }
    let stepper = null;
    try {
      if (typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(actionPreview))) return;
      if (!(await verifySecurityAuthAsync(wallet, authLabel))) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      stepper = typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在执行赎回操作', 'Executing Redemption'), actionSteps)
        : null;
      if (stepper) stepper.setStep(0, 'active');
      showToast(t('正在提交赎回请求...', 'Submitting redemption...'));
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
        const posAmt = parsedCustom || (poolCfg ? Number(contracts.resolveWalletPoolTokenBalance?.(wallet, poolCfg) || 0) : 0);
        res = await contracts.withdrawFromAaveV3({ wallet, poolId: actionTarget, amount: parsedCustom ? String(parsedCustom) : 'max' });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.inSymbol || 'USDC',
          chain: poolCfg?.chain || 'eth',
          amount: posAmt,
          txHash: res.txHash,
          title: `${t('Aave V3 提取', 'Aave V3 Withdraw')} · ${actionTarget}`
        });
        showToast(`✅ ${t('Aave 本息提取已提交', 'Aave V3 withdraw submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'burrow_withdraw') {
        const [tokContract, decStr] = String(actionTarget || '').split('|');
        res = await contracts.withdrawFromBurrow({ wallet, tokenContract: tokContract, amount: parsedCustom ? String(parsedCustom) : 'max', decimals: Number(decStr) || 24 });
        const sym = tokContract === 'wrap.near'
          ? 'NEAR'
          : (tokContract.includes('usdt') ? 'USDT' : (tokContract.includes('17208628') ? 'USDC' : 'NEAR'));
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: sym,
          chain: 'near',
          amount: parsedCustom || Number(res?.amount || 0),
          txHash: res.txHash,
          title: `${t('Burrow 提取', 'Burrow Withdraw')} · ${sym}`
        });
        showToast(`✅ ${t('Burrow 存款提取已提交', 'Burrow withdraw submitted')}: ${shortenAddr(res.txHash)}`);
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
        showToast(`✅ ${t('RHEA 领取已提交', 'RHEA claim submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'xrhea_unstake') {
        const [cid, amtStr] = String(actionTarget || '').split('|');
        const unstakeAmt = parsedCustom || Number(amtStr);
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: cid || 'xtoken.rhealab.near',
          amount: unstakeAmt,
          action: 'unstake'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'RHEA',
          chain: 'near',
          amount: unstakeAmt || 0,
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
        showToast(`✅ ${t('RHEA 领取已提交', 'RHEA claim submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'near_lst_unstake') {
        const [cid, amtStr] = String(actionTarget || '').split('|');
        const unstakeAmt = parsedCustom || Number(amtStr);
        res = await contracts.unstakeFromNearLst({
          wallet,
          contractId: cid,
          amount: unstakeAmt,
          action: 'unstake'
        });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: 'NEAR',
          chain: 'near',
          amount: unstakeAmt || 0,
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
        showToast(`✅ ${t('NEAR 提取已提交', 'NEAR withdraw submitted')}: ${shortenAddr(res.txHash)}`);
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
            : `✅ ${t('JUP 提取已提交', 'JUP withdraw submitted')}: ${shortenAddr(res.txHash)}`
        );
      } else if (actionType === 'lst_exit') {
        const [poolId, amtStr] = String(actionTarget || '').split('|');
        const exitAmt = parsedCustom || Number(amtStr);
        const poolCfg = contracts.findStakingPool ? contracts.findStakingPool(poolId) : null;
        if (poolCfg && poolCfg.chain !== 'near' && poolCfg.chain !== 'sol') {
          await ensureEthersLoaded();
        }
        res = await contracts.exitLiquidStakingToken({ wallet, poolId, amount: exitAmt });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.outSymbol || 'LST',
          toSymbol: poolCfg?.inSymbol || '',
          chain: poolCfg?.chain || 'sol',
          amount: exitAmt || 0,
          txHash: res.txHash,
          title: `${t('流动性质押换回', 'Exit LST')} · ${poolCfg?.name || poolId}`
        });
        showToast(`✅ ${t('LST 换回已提交', 'LST exit swap submitted')}: ${shortenAddr(res.txHash)}`);
      } else if (actionType === 'erc4626_redeem' || actionType === 'erc4626_cooldown' || actionType === 'erc4626_unstake') {
        await ensureEthersLoaded();
        const poolCfg = contracts.findStakingPool ? contracts.findStakingPool(actionTarget) : null;
        const mode = actionType === 'erc4626_cooldown' ? 'cooldown' : (actionType === 'erc4626_unstake' ? 'unstake' : 'auto');
        res = await contracts.redeemErc4626Vault({ wallet, poolId: actionTarget, shares: parsedCustom ? String(parsedCustom) : 'max', mode });
        recordWalletActivity(wallet, {
          type: 'unstake',
          symbol: poolCfg?.inSymbol || 'USDC',
          chain: poolCfg?.chain || 'eth',
          amount: parsedCustom || Number(res?.amount || 0),
          txHash: res.txHash,
          title: `${poolCfg?.name || actionTarget} (${mode})`
        });
        showToast(
          actionType === 'erc4626_cooldown'
            ? `✅ ${t('已发起 sUSDe 冷却解锁期', 'sUSDe cooldown initiated')}: ${shortenAddr(res.txHash)}`
            : `✅ ${t('金库赎回已提交', 'Vault redeem submitted')}: ${shortenAddr(res.txHash)}`
        );
      }
      if (stepper) {
        stepper.setStep(0, 'done', { txHash: (res && res.txHash) || '', chain: actionChain });
        stepper.finish(true, { text: t('交易已提交', 'Transaction submitted'), doneTitle: t('操作已完成', 'Completed') });
      }
      refreshAllBalancesAsync(false);
      setTimeout(() => refreshAllBalancesAsync(false).catch(() => {}), 5000).unref?.();
    } catch (err) {
      const msg = contracts && typeof contracts.toUserFriendlyError === 'function'
        ? contracts.toUserFriendlyError(err, '赎回失败，请稍后重试', 'Redemption failed. Please try again.')
        : t('赎回失败，请稍后重试', 'Redemption failed. Please try again.');
      if (stepper) {
        stepper.setStep(0, 'error', { error: msg });
        stepper.finish(false, msg);
      }
      showToast(msg);
    } finally {
      _earnActionInFlight = false;
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevTxt;
      }
    }
  }

