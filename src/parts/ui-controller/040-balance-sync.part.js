  // ==================== Multi-Chain Balance & Price Sync ====================

  let _priceIndexMap = new Map();
  let _priceIndexLiveRef = null;
  let _priceIndexLiveLen = -1;
  let _priceIndexSolLen = -1;
  let _priceIndexUpdatedAt = -1;

  function rebuildPriceIndex() {
    const tokens = getTokens();
    const st = getState();
    const map = new Map();
    const dexLists = tokens && tokens.DEX_CHAIN_TOKENS && typeof tokens.DEX_CHAIN_TOKENS === 'object'
      ? Object.values(tokens.DEX_CHAIN_TOKENS)
      : [];
    const lists = [st.liveTokens || [], (tokens && tokens.UNIFIED_CORE_TOKENS) || [], st.dynamicSolTokens || [], ...dexLists];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item) continue;
        const symU = String(item.symbol || '').toUpperCase();
        if (!symU || map.has(symU)) continue;
        if (typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0) {
          map.set(symU, item.price);
        }
      }
    }
    if (!map.has('WNEAR') && map.has('NEAR')) map.set('WNEAR', map.get('NEAR'));
    if (!map.has('WETH') && map.has('ETH')) map.set('WETH', map.get('ETH'));
    _priceIndexMap = map;
    _priceIndexLiveRef = st.liveTokens || null;
    _priceIndexLiveLen = Array.isArray(st.liveTokens) ? st.liveTokens.length : 0;
    _priceIndexSolLen = Array.isArray(st.dynamicSolTokens) ? st.dynamicSolTokens.length : 0;
    _priceIndexUpdatedAt = Number(st.pricesUpdatedAt || 0);
    return map;
  }

  function getSymbolPrice(symbol) {
    const st = getState();
    const curLiveLen = Array.isArray(st.liveTokens) ? st.liveTokens.length : 0;
    const curSolLen = Array.isArray(st.dynamicSolTokens) ? st.dynamicSolTokens.length : 0;
    const curUpdatedAt = Number(st.pricesUpdatedAt || 0);
    if (
      st.liveTokens !== _priceIndexLiveRef ||
      curLiveLen !== _priceIndexLiveLen ||
      curSolLen !== _priceIndexSolLen ||
      curUpdatedAt !== _priceIndexUpdatedAt
    ) {
      rebuildPriceIndex();
    }
    const symUpper = String(symbol || '').toUpperCase();
    const hit = _priceIndexMap.get(symUpper);
    if (typeof hit === 'number' && hit > 0) return hit;
    if (symUpper === 'WNEAR') return _priceIndexMap.get('NEAR') ?? null;
    if (symUpper === 'WETH') return _priceIndexMap.get('ETH') ?? null;
    return null;
  }

  function getTokenUnitPrice(tok) {
    if (!tok) return null;
    if (typeof tok.price === 'number' && Number.isFinite(tok.price) && tok.price > 0) {
      return tok.price;
    }
    const tokens = getTokens();
    if (tokens && typeof tokens.findTokenByAssetId === 'function' && tok.assetId) {
      const fresh = tokens.findTokenByAssetId(tok.assetId, tok.blockchain || '');
      if (fresh && typeof fresh.price === 'number' && Number.isFinite(fresh.price) && fresh.price > 0) {
        return fresh.price;
      }
    }
    return getSymbolPrice(tok.symbol);
  }

  function getSymbolIcon(symbol) {
    const tokens = getTokens();
    const st = getState();
    const symUpper = String(symbol || '').trim().replace(/^\$/, '').toUpperCase();
    if (!symUpper) return '';
    if (tokens && tokens.TOKEN_ICON_MAP && tokens.TOKEN_ICON_MAP[symUpper]) {
      return tokens.TOKEN_ICON_MAP[symUpper];
    }
    const liveHit = Array.isArray(st.liveTokens)
      ? st.liveTokens.find((item) => item && String(item.symbol || '').trim().toUpperCase() === symUpper && item.logoURI)
      : null;
    return (liveHit && liveHit.logoURI) || '';
  }

  function getPoolIconUrl(pool) {
    if (!pool) return '';
    return pool.icon || getSymbolIcon(pool.outSymbol) || getSymbolIcon(pool.inSymbol) || '';
  }

  function formatCompactTvlNum(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return null;
    const lang = getState().lang;
    if (String(lang).toLowerCase().startsWith('en')) {
      if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
      if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
      return Math.round(n).toLocaleString('en-US');
    }
    if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
    if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('en-US')}万`;
    return Math.round(n).toLocaleString('en-US');
  }

  function formatPoolTvlDisplay(pool) {
    if (!pool) return '--';
    if (typeof pool.tvlTokenAmount === 'number' && Number.isFinite(pool.tvlTokenAmount) && pool.tvlTokenAmount > 0) {
      let usdVal = (typeof pool.tvlUsd === 'number' && Number.isFinite(pool.tvlUsd) && pool.tvlUsd > 0) ? pool.tvlUsd : null;
      if (usdVal === null) {
        const symU = String(pool.inSymbol || '').toUpperCase();
        const px = (symU === 'USDC' || symU === 'USDT' || symU === 'USDE') ? 1.0 : getSymbolPrice(pool.inSymbol);
        if (typeof px === 'number' && Number.isFinite(px) && px > 0) {
          usdVal = pool.tvlTokenAmount * px;
        }
      }
      const cTok = formatCompactTvlNum(pool.tvlTokenAmount);
      if (cTok) {
        const cUsd = usdVal !== null ? formatCompactTvlNum(usdVal) : null;
        return cUsd ? `${cTok} ${pool.inSymbol} ($${cUsd})` : `${cTok} ${pool.inSymbol}`;
      }
    }
    return pool.tvlText || '--';
  }

  let _isRefreshing = false;
  let _refreshGen = 0;
  let _lastStakingPositionsSyncAt = 0;

  function ensureStakingMetricsFresh(maxAgeMs = 300_000) {
    const st = getState();
    const stale = !st.staking.pools || !st.staking.updatedAt || (Date.now() - st.staking.updatedAt > maxAgeMs);
    if (stale && !st.staking.loading) {
      refreshStakingMetrics(false);
    }
  }

  let _pendingPostRefresh = false;

  async function refreshAllBalancesAsync(showFeedback = false) {
    const st = getState();
    const intents = getIntents();
    const contracts = getContracts();
    const tokens = getTokens();
    const wallet = st.getActiveWallet();
    if (!wallet || (_isRefreshing && !showFeedback)) return;

    _isRefreshing = true;
    const gen = ++_refreshGen;
    const targetWalletId = wallet.id;
    const isStaleRefresh = () => gen !== _refreshGen || st.activeWalletId !== targetWalletId;

    const ptrInd = $('home-ptr-indicator');
    const ptrTxt = $('home-ptr-text');
    if (showFeedback && ptrInd) {
      const spinnerEl = ptrInd.querySelector ? ptrInd.querySelector('.ptr-spinner') : null;
      if (spinnerEl) spinnerEl.style.transform = '';
      ptrInd.classList.remove('pulling');
      ptrInd.classList.add('refreshing');
      if (ptrTxt) ptrTxt.textContent = t('正在同步多链资产...', 'Syncing multi-chain balances...');
    }

    try {
      await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
      if (isStaleRefresh()) return;
      const nearAccountId = wallet.nearNamedAccount || wallet.nearAddress;
      const initialSolAddr = String(wallet.solAddress || '');
      const initialEvmAddr = String(wallet.evmAddress || '');

      // Non-blocking .near named-account discovery in parallel
      let discoveredNamedAccount = null;
      if (!wallet.nearNamedAccount && wallet.nearPublicKey && !wallet._nearAccountChecked && typeof contracts.discoverNearAccountsByPublicKeyAsync === 'function') {
        wallet._nearAccountChecked = true;
        contracts.discoverNearAccountsByPublicKeyAsync(wallet.nearPublicKey).then((discovered) => {
          if (isStaleRefresh() || !Array.isArray(discovered) || discovered.length === 0) return;
          discoveredNamedAccount = discovered[0];
          wallet.nearNamedAccount = discovered[0];
          wallet.discoveredNearAccounts = discovered;
          contracts.ensureWalletSigningKeysAsync(wallet).then(() => {
            if (!isStaleRefresh() && (String(wallet.solAddress || '') !== initialSolAddr || String(wallet.evmAddress || '') !== initialEvmAddr)) {
              if (_isRefreshing) {
                _pendingPostRefresh = true;
              } else {
                refreshAllBalancesAsync(false).catch(() => {});
              }
            }
          }).catch(() => {});
          if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
          renderHeaderAndHero();
          intents.fetchNearNativeBalance(wallet.nearNamedAccount).then((v) => {
            if (!isStaleRefresh() && typeof v === 'number' && Number.isFinite(v)) {
              wallet.nativeBalances.near = v;
              scheduleProgressiveWalletRender();
            }
          }).catch(() => {});
          if (typeof intents.fetchNearNep141Balances === 'function') {
            intents.fetchNearNep141Balances(wallet.nearNamedAccount).then((map) => {
              if (!isStaleRefresh() && map && typeof map === 'object') {
                wallet.nearNep141Balances = { ...map };
                scheduleProgressiveWalletRender();
              }
            }).catch(() => {});
          }
          if (typeof contracts.fetchNearAccountStakingPositionsAsync === 'function') {
            contracts.fetchNearAccountStakingPositionsAsync(wallet.nearNamedAccount).then((list) => {
              if (!isStaleRefresh() && Array.isArray(list)) {
                wallet.nearStakingPositions = list;
                if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
                if (st.activeTab === 'earn') renderEarnView();
              }
            }).catch(() => {});
          }
        }).catch(() => {});
      }

      const solTokens = (tokens.DEX_CHAIN_TOKENS && tokens.DEX_CHAIN_TOKENS.sol) || [];
      const solMints = solTokens.map((x) => x.contractAddress).filter((m) => m && m !== 'So11111111111111111111111111111111111111112');

      const evmAllChainKeys = ['eth', 'base', 'arb', 'bsc', 'op', 'pol', 'avax', 'hype', 'hood', 'arc'];
      const evmBatchQueriesByChain = {
        eth: [
          { contract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6 },
          { contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6 },
          { contract: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', decimals: 18 },
          { contract: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', decimals: 18 },
          { contract: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', decimals: 18 },
          { contract: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', decimals: 6 },
          { contract: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', decimals: 18 }
        ],
        base: [
          { contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
          { contract: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', decimals: 6 }
        ],
        arb: [
          { contract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6 },
          { contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6 },
          { contract: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18 },
          { contract: '0x724dc807b04555b71ed48a6896b6F41593b8C637', decimals: 6 }
        ],
        bsc: [
          { contract: '0x55d398326f99059fF775485246999027B3197955', decimals: 18 },
          { contract: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18 }
        ],
        op: [
          { contract: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6 },
          { contract: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', decimals: 6 }
        ],
        pol: [
          { contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', decimals: 6 },
          { contract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', decimals: 6 }
        ],
        avax: [
          { contract: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', decimals: 6 },
          { contract: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', decimals: 6 }
        ],
        hype: [
          { contract: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', decimals: 6 },
          { contract: '0xfD739d4e423301CE9385c1fb8850539D657C296D', decimals: 18 }
        ],
        hood: [
          { contract: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6 }
        ],
        arc: [
          { contract: '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', decimals: 18 }
        ]
      };

      let _progRenderTimer = null;
      const scheduleProgressiveWalletRender = () => {
        if (isStaleRefresh() || _progRenderTimer || typeof setTimeout !== 'function') return;
        _progRenderTimer = setTimeout(() => {
          _progRenderTimer = null;
          if (isStaleRefresh()) return;
          st.syncWalletCompatBalances(wallet);
          if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
          if (st.activeTab === 'wallet') {
            renderHeaderAndHero();
            renderUnifiedAssetList();
          } else if (st.activeTab === 'swap') {
            const ft = resolveSwapToken(st.swap.fromAssetId, 0);
            const tt = resolveSwapToken(st.swap.toAssetId, 1);
            if ($('swap-from-balance')) $('swap-from-balance').textContent = `${formatBal(getSwapTokenAvailableBalance(ft), 6)} ${ft ? ft.symbol : ''}`;
            if ($('swap-to-balance')) $('swap-to-balance').textContent = `${formatBal(getSwapTokenAvailableBalance(tt), 6)} ${tt ? tt.symbol : ''}`;
            if (ft && tt) renderSwapGasReserveRow(wallet, ft, tt);
            updateSwapUsdEstimates();
            updateSwapPrimaryButtonState();
          }
          const ds = $('sheet-token-detail');
          if (ds && ds.classList && ds.classList.contains('open')) {
            renderTokenDetailSheet();
          }
        }, 80);
      };

      const shouldSyncPositions = showFeedback || st.activeTab === 'earn' || (Date.now() - _lastStakingPositionsSyncAt > 120_000);
      if (shouldSyncPositions) {
        _lastStakingPositionsSyncAt = Date.now();
        if (nearAccountId && typeof contracts.fetchNearAccountStakingPositionsAsync === 'function') {
          contracts.fetchNearAccountStakingPositionsAsync(nearAccountId).then((list) => {
            if (!isStaleRefresh() && Array.isArray(list)) {
              wallet.nearStakingPositions = list;
              if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
              if (st.activeTab === 'earn') renderEarnView();
            }
          }).catch(() => {});
        }
        if (wallet.solAddress && typeof contracts.fetchSolanaAccountStakingPositionsAsync === 'function') {
          contracts.fetchSolanaAccountStakingPositionsAsync(wallet.solAddress).then((list) => {
            if (!isStaleRefresh() && Array.isArray(list)) {
              wallet.solStakingPositions = list;
              if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
              if (st.activeTab === 'earn') renderEarnView();
            }
          }).catch(() => {});
        }
        if (wallet.evmAddress && typeof contracts.fetchEvmAccountStakingPositionsAsync === 'function') {
          contracts.fetchEvmAccountStakingPositionsAsync(wallet).then((list) => {
            if (!isStaleRefresh() && Array.isArray(list)) {
              wallet.evmStakingPositions = list;
              if (typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
              if (st.activeTab === 'earn') renderEarnView();
            }
          }).catch(() => {});
        }
      }
      if (wallet.address && typeof contracts.fetchPearlNativeBalance === 'function') {
        contracts.fetchPearlNativeBalance(wallet.address).then((res) => {
          if (!isStaleRefresh() && res && typeof res.formatted === 'number' && Number.isFinite(res.formatted)) {
            wallet.nativeBalances.prl = reconcileFetchedChainBalance(wallet, 'prl', res.formatted);
            scheduleProgressiveWalletRender();
          }
        }).catch(() => {});
      }
      if (wallet.btcAddress && typeof contracts.fetchBitcoinNativeBalance === 'function') {
        contracts.fetchBitcoinNativeBalance(wallet.btcAddress).then((res) => {
          const bal = res && typeof res.formatted === 'number' ? res.formatted : (typeof res === 'number' ? res : null);
          if (!isStaleRefresh() && typeof bal === 'number' && Number.isFinite(bal)) {
            wallet.nativeBalances.btc = reconcileFetchedChainBalance(wallet, 'btc', bal);
            scheduleProgressiveWalletRender();
          }
        }).catch(() => {});
      }

      const softCapPromise = (promise, ms) => {
        if (!showFeedback || typeof setTimeout !== 'function') return promise;
        return new Promise((resolve) => {
          let settled = false;
          const tmr = setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve(null);
            }
          }, ms);
          if (tmr && typeof tmr.unref === 'function') tmr.unref();
          Promise.resolve(promise).then(
            (val) => {
              if (!settled) {
                settled = true;
                clearTimeout(tmr);
                resolve(val);
              }
            },
            () => {
              if (!settled) {
                settled = true;
                clearTimeout(tmr);
                resolve(null);
              }
            }
          );
        });
      };

      const [
        pricesRes,
        nearBalRes,
        nep141BalRes,
        solBalRes,
        ...evmBatchResults
      ] = await Promise.all([
        softCapPromise(intents.fetchLiveDefuseTokenPrices({
          useCache: !showFeedback,
          onFastUpdate: (partialRes) => {
            if (!isStaleRefresh() && Array.isArray(partialRes) && partialRes.length > 0) {
              st.liveTokens = partialRes;
              st.pricesUpdatedAt = Date.now();
              rebuildPriceIndex();
              if (typeof st.saveCachedLiveTokens === 'function') st.saveCachedLiveTokens(partialRes);
              scheduleProgressiveWalletRender();
            }
          }
        }).then((res) => {
          if (!isStaleRefresh() && Array.isArray(res)) {
            st.liveTokens = res;
            st.pricesUpdatedAt = Date.now();
            rebuildPriceIndex();
            if (typeof st.saveCachedLiveTokens === 'function') st.saveCachedLiveTokens(res);
            scheduleProgressiveWalletRender();
          }
          return res;
        }).catch(() => null), 2200),
        nearAccountId ? softCapPromise(intents.fetchNearNativeBalance(nearAccountId).then((v) => {
          if (!isStaleRefresh() && (!discoveredNamedAccount || nearAccountId === discoveredNamedAccount) && typeof v === 'number' && Number.isFinite(v)) {
            wallet.nativeBalances.near = v;
            scheduleProgressiveWalletRender();
          }
          return v;
        }).catch(() => null), 3000) : Promise.resolve(null),
        (nearAccountId && typeof intents.fetchNearNep141Balances === 'function')
          ? softCapPromise(intents.fetchNearNep141Balances(nearAccountId).then((map) => {
              if (!isStaleRefresh() && (!discoveredNamedAccount || nearAccountId === discoveredNamedAccount) && map && typeof map === 'object') {
                wallet.nearNep141Balances = { ...map };
                scheduleProgressiveWalletRender();
              }
              return map;
            }).catch(() => null), 3000)
          : Promise.resolve(null),
        wallet.solAddress ? softCapPromise(contracts.fetchSolanaNativeAndSplBalances(wallet.solAddress, solMints).then((res) => {
          if (!isStaleRefresh() && String(wallet.solAddress || '') === initialSolAddr && res && typeof res === 'object') {
            if (typeof res.nativeSol === 'number') wallet.nativeBalances.sol = res.nativeSol;
            if (!res.splFetchFailed) {
              const nextAtaMints = {};
              if (res.ataMints && typeof res.ataMints === 'object') {
                for (const [m, exists] of Object.entries(res.ataMints)) {
                  if (exists) nextAtaMints[m] = true;
                }
              }
              const nextSpl = {};
              if (res.tokens && typeof res.tokens === 'object') {
                for (const [mint, info] of Object.entries(res.tokens)) {
                  if (info && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
                    nextSpl[mint] = info.formatted;
                    if (info.hasAta === true || (info.hasAta !== false && info.formatted > 0)) {
                      nextAtaMints[mint] = true;
                    }
                  }
                }
              }
              wallet.splBalances = nextSpl;
              wallet.solAtaMints = nextAtaMints;
            }
            scheduleProgressiveWalletRender();
          }
          return res;
        }).catch(() => null), 3000) : Promise.resolve(null),
        ...evmAllChainKeys.map((ck) => {
          if (!wallet.evmAddress) return Promise.resolve(null);
          const qList = evmBatchQueriesByChain[ck] || [];
          const p = typeof contracts.fetchEvmChainBalancesBatch === 'function'
            ? contracts.fetchEvmChainBalancesBatch(ck, wallet.evmAddress, qList)
            : contracts.fetchEvmNativeAndErc20Balance(ck, wallet.evmAddress, qList[0]?.contract || null, qList[0]?.decimals || 18);
          return softCapPromise(p.then((res) => {
            if (!isStaleRefresh() && String(wallet.evmAddress || '') === initialEvmAddr && res) {
              if (typeof res.nativeFormatted === 'number' && Number.isFinite(res.nativeFormatted)) {
                wallet.nativeBalances[ck] = res.nativeFormatted;
              }
              if (res.tokens && typeof res.tokens === 'object') {
                for (const info of Object.values(res.tokens)) {
                  if (info && info.contract && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
                    st.setWalletErc20Balance(wallet, ck, info.contract, info.formatted);
                  }
                }
              } else if (typeof res.tokenFormatted === 'number' && Number.isFinite(res.tokenFormatted) && qList[0]) {
                st.setWalletErc20Balance(wallet, ck, qList[0].contract, res.tokenFormatted);
              }
              scheduleProgressiveWalletRender();
            }
            return res;
          }).catch(() => null), 3000);
        })
      ]);

      if (_progRenderTimer) {
        clearTimeout(_progRenderTimer);
        _progRenderTimer = null;
      }
      if (isStaleRefresh()) return;

      if (Array.isArray(pricesRes)) {
        st.liveTokens = pricesRes;
        st.pricesUpdatedAt = Date.now();
        rebuildPriceIndex();
        if (typeof st.saveCachedLiveTokens === 'function') st.saveCachedLiveTokens(pricesRes);
      }

      if ((!discoveredNamedAccount || nearAccountId === discoveredNamedAccount) && typeof nearBalRes === 'number' && Number.isFinite(nearBalRes)) {
        wallet.nativeBalances.near = nearBalRes;
      }

      if ((!discoveredNamedAccount || nearAccountId === discoveredNamedAccount) && nep141BalRes && typeof nep141BalRes === 'object') {
        wallet.nearNep141Balances = { ...nep141BalRes };
      }

      if (String(wallet.solAddress || '') === initialSolAddr && solBalRes && typeof solBalRes === 'object') {
        if (typeof solBalRes.nativeSol === 'number') {
          wallet.nativeBalances.sol = solBalRes.nativeSol;
        }
        if (!solBalRes.splFetchFailed) {
          const nextAtaMints = {};
          if (solBalRes.ataMints && typeof solBalRes.ataMints === 'object') {
            for (const [m, exists] of Object.entries(solBalRes.ataMints)) {
              if (exists) nextAtaMints[m] = true;
            }
          }
          const nextSpl = {};
          if (solBalRes.tokens && typeof solBalRes.tokens === 'object') {
            for (const [mint, info] of Object.entries(solBalRes.tokens)) {
              if (info && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
                nextSpl[mint] = info.formatted;
                if (info.hasAta === true || (info.hasAta !== false && info.formatted > 0)) {
                  nextAtaMints[mint] = true;
                }
              }
            }
          }
          wallet.splBalances = nextSpl;
          wallet.solAtaMints = nextAtaMints;
        }
      }

      if (String(wallet.evmAddress || '') === initialEvmAddr) {
        evmAllChainKeys.forEach((ck, i) => {
          const res = evmBatchResults[i];
          if (!res) return;
          if (typeof res.nativeFormatted === 'number' && Number.isFinite(res.nativeFormatted)) {
            wallet.nativeBalances[ck] = res.nativeFormatted;
          }
          if (res.tokens && typeof res.tokens === 'object') {
            for (const info of Object.values(res.tokens)) {
              if (info && info.contract && typeof info.formatted === 'number' && Number.isFinite(info.formatted)) {
                st.setWalletErc20Balance(wallet, ck, info.contract, info.formatted);
              }
            }
          }
        });
      }

      st.syncWalletCompatBalances(wallet);
      st.saveWallets();
      renderAll();
      const detailSheet = $('sheet-token-detail');
      if (detailSheet && detailSheet.classList && detailSheet.classList.contains('open')) {
        renderTokenDetailSheet();
      }

      const anyTimedOut = (nearAccountId && nearBalRes === null) || (wallet.solAddress && solBalRes === null) || (wallet.evmAddress && evmBatchResults.some((r) => r === null));
      if (showFeedback) {
        showToast(anyTimedOut ? t('部分链仍在后台同步中...', 'Syncing remaining chains...') : t('多链资产已同步', 'Balances synced'));
      }
    } catch (e) {
      if (showFeedback) showToast(e && e.message ? e.message : t('余额同步失败', 'Sync failed'));
    } finally {
      if (gen === _refreshGen) {
        _isRefreshing = false;
        const viewWallet = $('view-wallet');
        if (ptrInd) {
          ptrInd.classList.remove('pulling', 'refreshing');
        }
        if (viewWallet) {
          viewWallet.classList.add('ptr-spring');
          viewWallet.style.transform = 'translate3d(0, 0, 0)';
          setTimeout(() => {
            if (viewWallet.style.transform === 'translate3d(0, 0, 0)') {
              viewWallet.style.transform = '';
              viewWallet.classList.remove('ptr-spring');
            }
          }, 300).unref?.();
        }
        const spinnerEl = ptrInd && ptrInd.querySelector ? ptrInd.querySelector('.ptr-spinner') : null;
        if (spinnerEl) spinnerEl.style.transform = '';
        if (ptrTxt) ptrTxt.textContent = t('下拉刷新链上余额', 'Pull down to refresh');
        if (_pendingPostRefresh) {
          _pendingPostRefresh = false;
          refreshAllBalancesAsync(false).catch(() => {});
        }
      }
    }
  }

  const _pendingChainSpends = new Map();

  function applyOptimisticChainSpend(wallet, chainKey, transferAmount, feeAmount = 0, txHash = '') {
    if (!wallet || !wallet.id || !chainKey) return null;
    const st = getState();
    const contracts = getContracts();
    const ck = String(chainKey).toLowerCase();
    const amtNum = Number(transferAmount);
    const feeNum = Number(feeAmount);
    const spentTotal = (Number.isFinite(amtNum) && amtNum > 0 ? amtNum : 0) + (Number.isFinite(feeNum) && feeNum > 0 ? feeNum : 0);
    if (spentTotal <= 0) return null;

    if (!wallet.nativeBalances || typeof wallet.nativeBalances !== 'object') wallet.nativeBalances = {};
    const prevBal = Number(wallet.nativeBalances[ck] ?? 0);
    const nextBal = Math.max(0, Number((prevBal - spentTotal).toFixed(8)));
    wallet.nativeBalances[ck] = nextBal;
    if (st && typeof st.syncWalletCompatBalances === 'function') {
      st.syncWalletCompatBalances(wallet);
    }

    _pendingChainSpends.set(`${wallet.id}:${ck}`, {
      txHash: String(txHash || ''),
      prevBal,
      spentTotal,
      expiresAt: Date.now() + 90_000
    });

    if (st && typeof st.saveWalletsDebounced === 'function') st.saveWalletsDebounced();
    else if (st && typeof st.saveWallets === 'function') st.saveWallets();

    renderWalletView();
    if (st && st.activeTab === 'swap') renderSwapView();
    const detailSheet = $('sheet-token-detail');
    if (detailSheet && detailSheet.classList && detailSheet.classList.contains('open')) {
      renderTokenDetailSheet();
    }

    const fetcher = typeof window !== 'undefined' && typeof document !== 'undefined'
      ? (ck === 'prl'
          ? (wallet.address && contracts?.fetchPearlNativeBalance ? () => contracts.fetchPearlNativeBalance(wallet.address) : null)
          : (ck === 'btc' && wallet.btcAddress && contracts?.fetchBitcoinNativeBalance ? () => contracts.fetchBitcoinNativeBalance(wallet.btcAddress) : null))
      : null;
    if (fetcher) {
      for (const delayMs of [4000, 16000]) {
        const tm = setTimeout(async () => {
          if (typeof window === 'undefined' || typeof document === 'undefined' || st.activeWalletId !== wallet.id) return;
          const res = await fetcher().catch(() => null);
          const liveBal = res && typeof res.formatted === 'number' ? res.formatted : null;
          if (liveBal !== null && Number.isFinite(liveBal)) {
            wallet.nativeBalances[ck] = reconcileFetchedChainBalance(wallet, ck, liveBal);
            if (st && typeof st.syncWalletCompatBalances === 'function') st.syncWalletCompatBalances(wallet);
            renderWalletView();
            if (st.activeTab === 'swap') renderSwapView();
            const curDetailSheet = $('sheet-token-detail');
            if (curDetailSheet && curDetailSheet.classList && curDetailSheet.classList.contains('open')) {
              renderTokenDetailSheet();
            }
          }
        }, delayMs);
        tm?.unref?.();
      }
    }
    return { prevBal, spentTotal, nextBal };
  }

  function reconcileFetchedChainBalance(wallet, chainKey, liveBal) {
    const cleanLive = Number(liveBal);
    if (!Number.isFinite(cleanLive) || !wallet || !wallet.id) return liveBal;
    const key = `${wallet.id}:${String(chainKey || '').toLowerCase()}`;
    const pending = _pendingChainSpends.get(key);
    if (!pending) return cleanLive;
    if (Date.now() > pending.expiresAt) {
      _pendingChainSpends.delete(key);
      return cleanLive;
    }
    const optimisticBal = Math.max(0, Number((pending.prevBal - pending.spentTotal).toFixed(8)));
    if (cleanLive <= pending.prevBal - pending.spentTotal * 0.5 + 1e-6) {
      _pendingChainSpends.delete(key);
      return cleanLive;
    }
    if (Math.abs(cleanLive - pending.prevBal) <= 1e-6) {
      return optimisticBal;
    }
    _pendingChainSpends.delete(key);
    return cleanLive;
  }

  function computePtrPullDistance(dy, maxPull = 68) {
    const cleanDy = Number(dy);
    if (!Number.isFinite(cleanDy) || cleanDy <= 0) return 0;
    return maxPull * (1 - Math.exp(-cleanDy / 72));
  }

  let _ptrInitialized = false;
  function initHomePullToRefresh() {
    if (_ptrInitialized || typeof document === 'undefined') return;
    const viewWallet = $('view-wallet');
    const ind = $('home-ptr-indicator');
    const txt = $('home-ptr-text');
    if (!viewWallet || !ind || typeof viewWallet.addEventListener !== 'function') return;
    _ptrInitialized = true;

    const spinner = ind.querySelector ? ind.querySelector('.ptr-spinner') : null;
    let startX = null;
    let startY = null;
    let pulling = false;
    let latestDy = 0;
    const MAX_PULL = 68;
    const THRESHOLD = 46;

    const getScrollTop = () => {
      if (typeof window !== 'undefined' && typeof window.scrollY === 'number' && window.scrollY > 0) {
        return window.scrollY;
      }
      return (document.documentElement && document.documentElement.scrollTop) || viewWallet.scrollTop || 0;
    };

    const setPullVisual = (pullPx, spring = false) => {
      if (spring) viewWallet.classList.add('ptr-spring');
      else viewWallet.classList.remove('ptr-spring');
      viewWallet.style.transform = pullPx > 0 ? `translate3d(0, ${pullPx.toFixed(1)}px, 0)` : (spring ? 'translate3d(0, 0, 0)' : '');
      if (spinner) {
        spinner.style.transform = pullPx > 0 ? `rotate(${Math.round((pullPx / THRESHOLD) * 260)}deg)` : '';
      }
    };

    viewWallet.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      if (getScrollTop() > 2) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      latestDy = 0;
      pulling = false;
      viewWallet.classList.remove('ptr-spring');
    }, { passive: true });

    viewWallet.addEventListener('touchmove', (e) => {
      if (startY === null || !e.touches || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - (startX ?? e.touches[0].clientX);
      const dy = e.touches[0].clientY - startY;
      const dist = Math.hypot(dx, dy);
      // 8px deadzone so micro-jitter on initial touch does not cancel vertical pull
      if (!pulling && dist > 8 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        startY = null;
        startX = null;
        return;
      }
      if (dy <= 2 || getScrollTop() > 2) {
        if (pulling) {
          ind.classList.remove('pulling');
          setPullVisual(0, true);
          pulling = false;
        }
        return;
      }
      if (dist <= 4 && !pulling) return;
      pulling = true;
      latestDy = dy;
      if (e.cancelable && typeof e.preventDefault === 'function') {
        e.preventDefault();
      }
      const pullPx = computePtrPullDistance(dy, MAX_PULL);
      ind.classList.add('pulling');
      setPullVisual(pullPx, false);
      if (txt) {
        txt.textContent = _isRefreshing
          ? t('正在同步多链资产...', 'Syncing multi-chain balances...')
          : (pullPx >= THRESHOLD
              ? t('释放立即刷新', 'Release to refresh')
              : t('下拉刷新链上余额', 'Pull down to refresh'));
      }
    }, { passive: false });

    const endPull = () => {
      if (startY === null) return;
      const pullPx = computePtrPullDistance(latestDy, MAX_PULL);
      const triggered = pulling && pullPx >= THRESHOLD;
      startX = null;
      startY = null;
      pulling = false;
      latestDy = 0;
      if (triggered) {
        setPullVisual(42, true);
        refreshAllBalancesAsync(true);
      } else {
        ind.classList.remove('pulling');
        setPullVisual(0, true);
        setTimeout(() => {
          if (!pulling && !_isRefreshing) {
            viewWallet.style.transform = '';
            viewWallet.classList.remove('ptr-spring');
          }
        }, 300).unref?.();
      }
    };

    viewWallet.addEventListener('touchend', endPull, { passive: true });

    viewWallet.addEventListener('touchcancel', () => {
      startX = null;
      startY = null;
      pulling = false;
      latestDy = 0;
      ind.classList.remove('pulling');
      setPullVisual(0, true);
    }, { passive: true });
  }

