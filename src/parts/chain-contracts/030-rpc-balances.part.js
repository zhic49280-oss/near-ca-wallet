  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw new Error('fetch API unavailable');
    const extSignal = options && options.signal ? options.signal : null;
    if (extSignal && extSignal.aborted) {
      const abortErr = new Error(t('请求已取消', 'Request aborted'));
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = controller
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;
    let onExtAbort = null;
    if (extSignal && controller) {
      onExtAbort = () => controller.abort();
      extSignal.addEventListener('abort', onExtAbort, { once: true });
    }
    try {
      const { signal: _ignoredSignal, ...restOptions } = options || {};
      const res = await fetchFn(url, {
        ...restOptions,
        signal: controller ? controller.signal : undefined,
        headers: {
          Accept: 'application/json',
          ...(options.headers || {})
        }
      });
      const text = typeof res.text === 'function' ? await res.text() : '';
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_) {
          data = null;
        }
      } else if (typeof res.json === 'function') {
        data = await res.json().catch(() => null);
      }
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err && (err.name === 'AbortError' || String(err.message || '').includes('abort'))) {
        const timeoutErr = new Error(timedOut ? t('网络请求超时', 'Request timeout') : t('请求已取消', 'Request aborted'));
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      if (extSignal && onExtAbort) {
        try { extSignal.removeEventListener('abort', onExtAbort); } catch (_) {}
      }
    }
  }

  /**
   * Auto-discovers any existing `.near` named account controlled by `nearPublicKey` on NEAR Mainnet
   * via FastNear (`api.fastnear.com/v1/public_key/<pk>/all`) + KitWallet fallback.
   */
  async function discoverNearAccountsByPublicKeyAsync(publicKeyStr) {
    const pk = String(publicKeyStr || '').trim();
    if (!pk || !pk.startsWith('ed25519:')) return [];
    const filterNamed = (arr) =>
      Array.isArray(arr)
        ? arr
            .map((a) => String(a || '').trim().toLowerCase())
            .filter((a) => a && !/^[0-9a-f]{64}$/.test(a) && (a.endsWith('.near') || a.endsWith('.tg') || a.includes('.')))
        : [];
    const [fastRes, kitRes] = await Promise.allSettled([
      fetchJsonWithTimeout(`https://api.fastnear.com/v1/public_key/${encodeURIComponent(pk)}/all`, {}, 4000),
      fetchJsonWithTimeout(`https://api.kitwallet.app/publicKey/${encodeURIComponent(pk)}/accounts`, {}, 4000)
    ]);
    const hits = new Set();
    if (fastRes.status === 'fulfilled' && fastRes.value) {
      filterNamed(fastRes.value.account_ids).forEach((a) => hits.add(a));
    }
    if (kitRes.status === 'fulfilled' && kitRes.value) {
      filterNamed(kitRes.value).forEach((a) => hits.add(a));
    }
    return Array.from(hits);
  }

  /**
   * Queries real on-chain validator staking positions (`*.poolv1.near` / `*.pool.near`) and
   * Rhea oRHEA lock-convert positions for a NEAR account via FastNear + direct contract view calls.
   */
  async function fetchNearAccountStakingPositionsAsync(nearAccountId) {
    const acct = String(nearAccountId || '').trim().toLowerCase();
    if (!acct) return [];
    const positions = [];
    try {
      const [full, orheaConvs, burrowAcc] = await Promise.all([
        fetchJsonWithTimeout(`https://api.fastnear.com/v1/account/${encodeURIComponent(acct)}/full`, {}, 5000).catch(() => null),
        viewNearContractCall('orhea-conv.rhealab.near', 'get_account_conversions', { account_id: acct }).catch(() => null),
        viewNearContractCall('contract.main.burrow.near', 'get_account', { account_id: acct }).catch(() => null)
      ]);
      const pools = full && Array.isArray(full.pools) ? full.pools : [];
      const validatorResults = await Promise.all(
        pools.slice(0, 12).map(async (p) => {
          const poolId = String(p && p.pool_id || '').trim();
          if (!poolId) return null;
          const accInfo = await viewNearContractCall(poolId, 'get_account', { account_id: acct }).catch(() => null);
          if (!accInfo) return null;
          const stakedRaw = BigInt(String(accInfo.staked_balance || '0'));
          const unstakedRaw = BigInt(String(accInfo.unstaked_balance || '0'));
          const totalRaw = stakedRaw + unstakedRaw;
          if (totalRaw <= 5n * 10n ** 20n) return null; // ignore < 0.0005 NEAR residual interest dust
          const stakedNear = Number(stakedRaw / 10n ** 18n) / 1e6;
          const unstakedNear = Number(unstakedRaw / 10n ** 18n) / 1e6;
          const totalNear = stakedNear + unstakedNear;
          return {
            type: 'validator',
            poolId,
            stakedNear,
            unstakedNear,
            totalNear,
            canWithdraw: Boolean(accInfo.can_withdraw) && unstakedRaw > 10n ** 18n
          };
        })
      );
      validatorResults.filter(Boolean).forEach((pos) => positions.push(pos));

      if (Array.isArray(orheaConvs) && orheaConvs.length > 0) {
        let totalRaw = 0n;
        let activeCount = 0;
        const claimableIds = [];
        const activeIds = [];
        const nowNs = BigInt(Date.now()) * 1000000n;
        for (const conv of orheaConvs) {
          if (!conv || typeof conv !== 'object') continue;
          const statusLower = String(conv.status || '').toLowerCase();
          if (conv.is_withdrawn === true || conv.withdrawn === true || statusLower === 'withdrawn' || statusLower === 'claimed') {
            continue;
          }
          const convId = conv.conversion_id ?? conv.id ?? null;
          const rawVal = conv.source_amount ?? conv.amount ?? conv.locked_amount ?? conv.source_token_amount ?? '0';
          try {
            const rawBig = BigInt(String(rawVal));
            if (rawBig > 0n) {
              totalRaw += rawBig;
              activeCount += 1;
              if (convId !== null && convId !== undefined) {
                activeIds.push(String(convId));
                const releaseTime = conv.release_timestamp ?? conv.unlock_time ?? conv.end_timestamp ?? 0;
                const relBig = BigInt(String(releaseTime || '0'));
                if (relBig > 0n && relBig <= nowNs) claimableIds.push(String(convId));
              }
            }
          } catch (_) {}
        }
        const totalAmount = Number(totalRaw / 10n ** 12n) / 1e6;
        if (Number.isFinite(totalAmount) && totalAmount > 0.00001) {
          positions.push({
            type: 'lock_convert',
            poolId: 'rhea_orhea_convert',
            contractId: 'orhea-conv.rhealab.near',
            symbol: 'oRHEA',
            totalAmount,
            activeIds,
            claimableIds,
            canClaim: claimableIds.length > 0,
            chain: 'near',
            title: 'Rhea oRHEA Convert',
            subtitle: t(`锁仓兑换中 (${activeCount} 笔)`, `Locked Converting (${activeCount})`)
          });
        }
      }

      // Check xRHEA unstake requests + Meta Pool / LiNEAR / Rhea LST pending unstaked NEAR
      const [xrheaReqs, ...lstUnstakeStates] = await Promise.all([
        viewNearContractCall('xtoken.rhealab.near', 'get_account_unstake_requests', { account_id: acct }).catch(() => null),
        ...['lst.rhealab.near', 'meta-pool.near', 'linear-protocol.near', 'v2-nearx.stader-labs.near'].map(async (cid) => {
          const [amtStr, availFlag] = await Promise.all([
            viewNearContractCall(cid, 'get_account_unstaked_balance', { account_id: acct }).catch(() => null),
            viewNearContractCall(cid, 'is_account_unstaked_balance_available', { account_id: acct }).catch(() => null)
          ]);
          return { cid, amtStr, availFlag: Boolean(availFlag) };
        })
      ]);

      if (Array.isArray(xrheaReqs) && xrheaReqs.length > 0) {
        const nowNs = BigInt(Date.now()) * 1000000n;
        for (const req of xrheaReqs) {
          if (!req || !req.request_id) continue;
          const rawAmt = String(req.amount || '0');
          const amt = Number(fromBaseUnits(rawAmt, 18));
          if (!(amt > 0.00001)) continue;
          const unlockTs = BigInt(String(req.unlock_timestamp || req.release_timestamp || '0'));
          positions.push({
            type: 'xrhea_unstake',
            poolId: 'rhea_xrhea',
            contractId: 'xtoken.rhealab.near',
            requestId: String(req.request_id),
            symbol: 'RHEA',
            totalAmount: amt,
            canWithdraw: unlockTs > 0n && unlockTs <= nowNs,
            chain: 'near',
            title: 'Rhea xRHEA Unstake',
            subtitle: unlockTs > 0n && unlockTs <= nowNs
              ? t('已解锁可领取 RHEA', 'Unlocked — ready to claim')
              : t('xRHEA 解质押解锁中', 'xRHEA unstaking cooldown')
          });
        }
      }

      const lstPoolIdMap = {
        'lst.rhealab.near': 'rhea_rnear',
        'meta-pool.near': 'metapool_stnear',
        'linear-protocol.near': 'linear_near',
        'v2-nearx.stader-labs.near': 'stader_nearx'
      };
      for (const st of lstUnstakeStates) {
        if (!st || !st.amtStr || !/^\d+$/.test(String(st.amtStr))) continue;
        const nearAmt = Number(fromBaseUnits(String(st.amtStr), 24));
        if (!(nearAmt > 0.0001)) continue;
        const pid = lstPoolIdMap[st.cid] || st.cid;
        positions.push({
          type: 'near_lst_unstaked',
          poolId: pid,
          contractId: st.cid,
          symbol: 'NEAR',
          totalAmount: nearAmt,
          canWithdraw: st.availFlag,
          chain: 'near',
          title: `${findStakingPool(pid)?.name || st.cid}`,
          subtitle: st.availFlag
            ? t('解质押已完成，可提取 NEAR', 'Unstake ready to withdraw')
            : t('解质押冷却中 (约 2-3 天)', 'Unbonding (~2-3 days)')
        });
      }

      const burrowSupplied = burrowAcc && Array.isArray(burrowAcc.supplied) ? burrowAcc.supplied : [];
      if (burrowSupplied.length > 0) {
        const metaMap = {
          'wrap.near': { poolId: 'burrow_near_wnear', symbol: 'NEAR', baseDec: 24, defaultInternalDec: 24 },
          'usdt.tether-token.near': { poolId: 'burrow_near_usdt', symbol: 'USDT', baseDec: 6, defaultInternalDec: 18 },
          '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { poolId: 'burrow_near_usdc', symbol: 'USDC', baseDec: 6, defaultInternalDec: 18 }
        };
        const assetInfos = await Promise.all(
          burrowSupplied.map((item) => {
            const tokId = item && item.token_id ? String(item.token_id) : '';
            if (!tokId) return Promise.resolve(null);
            return viewNearContractCall('contract.main.burrow.near', 'get_asset', { token_id: tokId }).catch(() => null);
          })
        );
        burrowSupplied.forEach((item, idx) => {
          const tokId = String((item && item.token_id) || '').trim();
          const rawBal = String((item && item.balance) || '0');
          if (!tokId || !/^\d+$/.test(rawBal) || BigInt(rawBal) <= 0n) return;
          const poolCfg = STAKING_POOLS.find((p) => p && p.isBurrowSupply && p.tokenContract === tokId);
          const m = metaMap[tokId] || {
            poolId: poolCfg ? poolCfg.id : `burrow_${tokId}`,
            symbol: poolCfg ? poolCfg.inSymbol : (tokId.split('.')[0] || 'TOKEN').toUpperCase(),
            baseDec: poolCfg ? Number(poolCfg.decimals || 24) : 24,
            defaultInternalDec: poolCfg && Number(poolCfg.decimals) === 24 ? 24 : 18
          };
          const aInfo = assetInfos[idx];
          const extraDec = aInfo && aInfo.config && aInfo.config.extra_decimals !== undefined
            ? Number(aInfo.config.extra_decimals)
            : null;
          const totalDec = extraDec !== null && Number.isFinite(extraDec)
            ? (m.baseDec + extraDec)
            : m.defaultInternalDec;
          const totalAmount = Number(fromBaseUnits(rawBal, totalDec));
          if (Number.isFinite(totalAmount) && totalAmount > 0.00001) {
            positions.push({
              type: 'burrow_supply',
              poolId: m.poolId,
              tokenContract: tokId,
              symbol: m.symbol,
              totalAmount,
              decimals: poolCfg ? Number(poolCfg.decimals || m.baseDec) : m.baseDec,
              internalDecimals: totalDec,
              rawInternalBalance: rawBal,
              chain: 'near',
              title: `Burrow ${m.symbol}`,
              subtitle: t('Burrow 活期存款', 'Burrow Supply Position')
            });
          }
        });
      }
    } catch (_) {}
    return positions;
  }

  /**
   * Queries real on-chain Solana staking positions:
   * - Jupiter DAO Staked JUP (`voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj`)
   * - Solana Native Validator Stake Accounts (`Stake11111111111111111111111111111111111111`)
   */
  async function fetchSolanaAccountStakingPositionsAsync(solAddress) {
    const addr = String(solAddress || '').trim();
    if (!addr) return [];
    let ownerBytes;
    try {
      ownerBytes = base58Decode(addr);
      if (!ownerBytes || ownerBytes.length !== 32) return [];
    } catch (_) {
      return [];
    }

    const positions = [];
    try {
      const voterProgId = 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj';
      const lockerAddr = 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN';
      const escrowPda = await findSolanaPdaAsync(
        [new TextEncoder().encode('Escrow'), base58Decode(lockerAddr), ownerBytes],
        base58Decode(voterProgId)
      );

      const [escrowRes, stakeAccountsRes] = await Promise.all([
        callSolanaRpc('getAccountInfo', [escrowPda.address, { encoding: 'base64' }]).catch(() => null),
        fetchJsonWithTimeout(
          'https://api.mainnet-beta.solana.com',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'sol_native_stake',
              method: 'getProgramAccounts',
              params: [
                'Stake11111111111111111111111111111111111111',
                { encoding: 'jsonParsed', filters: [{ memcmp: { offset: 12, bytes: addr } }] }
              ]
            })
          },
          6000
        ).catch(() => null)
      ]);

      if (escrowRes && escrowRes.value && escrowRes.value.data && escrowRes.value.data[0]) {
        try {
          const buf = base64ToBytes(String(escrowRes.value.data[0]));
          if (buf.length >= 129) {
            const amountRaw = decodeU64LE(buf, 105);
            const escrowEndsAtRaw = decodeU64LE(buf, 121);
            const escrowEndsAtSec = Number(BigInt.asIntN(64, escrowEndsAtRaw));
            const isMaxLock = buf.length >= 162 ? buf[161] === 1 : false;
            if (amountRaw > 0n) {
              const stakedJup = Number(amountRaw) / 1e6;
              if (Number.isFinite(stakedJup) && stakedJup > 0.00001) {
                positions.push({
                  type: 'jupiter_dao',
                  poolId: 'jupiter_jup',
                  chain: 'sol',
                  symbol: 'JUP',
                  title: 'Jupiter DAO (ASR)',
                  subtitle: escrowPda.address,
                  amount: stakedJup,
                  totalAmount: stakedJup,
                  isMaxLock,
                  escrowEndsAtSec,
                  canWithdraw: !isMaxLock && Math.floor(Date.now() / 1000) >= escrowEndsAtSec,
                  amountText: `${stakedJup.toFixed(4)} JUP`
                });
              }
            }
          }
        } catch (_) {}
      }

      const stakeList = stakeAccountsRes && Array.isArray(stakeAccountsRes.result) ? stakeAccountsRes.result : [];
      for (const item of stakeList) {
        if (!item || !item.account) continue;
        try {
          const lamports = BigInt(item.account.lamports || 0);
          if (lamports > 1000000n) {
            const voter = item.account?.data?.parsed?.info?.stake?.delegation?.voter || 'Solana Validator';
            const solAmt = Number(lamports) / 1e9;
            positions.push({
              type: 'sol_validator',
              chain: 'sol',
              symbol: 'SOL',
              title: voter,
              subtitle: item.pubkey || '',
              amount: solAmt
            });
          }
        } catch (_) {}
      }
    } catch (_) {}
    return positions;
  }

  /**
   * Self-heals NEAR Master Account credentials from mnemonic and derives all
   * external chain addresses (EVM, Solana, Pearl, Bitcoin) via NEAR MPC (v1.signer).
   */
  async function ensureWalletSigningKeysAsync(wallet) {
    if (!wallet) return wallet;
    const cryptoEngine = getCryptoEngine();

    if (wallet.mnemonic) {
      const needsNear = !wallet.nearAddress || !wallet.nearPrivateKey || !wallet.nearPublicKey || !wallet.nearPrivateSeedHex;
      if (needsNear) {
        if (!cryptoEngine || typeof cryptoEngine.deriveNearFromSeedAsync !== 'function') {
          throw new Error(t('加密派生引擎 NearCACrypto 不可用', 'NearCACrypto unavailable'));
        }
        const near = await cryptoEngine.deriveNearFromSeedAsync(wallet.mnemonic, 0);
        if (near && near.nearAddress) {
          wallet.nearAddress = wallet.nearAddress || near.nearAddress;
          wallet.nearPrivateSeedHex = wallet.nearPrivateSeedHex || near.nearPrivateSeedHex;
          wallet.nearPublicKey = wallet.nearPublicKey || near.nearPublicKey;
          wallet.nearPrivateKey = wallet.nearPrivateKey || near.nearPrivateKey;
        }
      }
    }
    const prlSeed = String(wallet.prlMnemonic || wallet.mnemonic || '').trim();
    if (prlSeed) {
      const needsPearl = !wallet.address || !wallet.privateKeyHex || !wallet.tweakedPrivateKeyHex;
      if (needsPearl && cryptoEngine && typeof cryptoEngine.derivePearlFromSeedAsync === 'function') {
        const pearl = await cryptoEngine.derivePearlFromSeedAsync(prlSeed, "m/86'/808276'/0'/0/0", true);
        if (pearl && pearl.address) {
          wallet.address = pearl.address;
          wallet.privateKeyHex = pearl.privateKeyHex || wallet.privateKeyHex;
          wallet.tweakedPrivateKeyHex = pearl.tweakedPrivateKeyHex || wallet.tweakedPrivateKeyHex;
        }
      }
    }
    const btcSeed = String(wallet.btcMnemonic || wallet.mnemonic || '').trim();
    if (btcSeed) {
      const needsBtc = !wallet.btcAddress || !wallet.btcPrivateKeyHex || !wallet.btcTweakedPrivateKeyHex;
      if (needsBtc && cryptoEngine && typeof cryptoEngine.deriveBitcoinFromSeedAsync === 'function') {
        const btc = await cryptoEngine.deriveBitcoinFromSeedAsync(btcSeed, "m/86'/0'/0'/0/0", true);
        if (btc && btc.address) {
          wallet.btcAddress = btc.address;
          wallet.btcPrivateKeyHex = btc.privateKeyHex || wallet.btcPrivateKeyHex;
          wallet.btcTweakedPrivateKeyHex = btc.tweakedPrivateKeyHex || wallet.btcTweakedPrivateKeyHex;
        }
      }
    }

    const nearId = wallet.nearNamedAccount || wallet.nearAddress;
    if (nearId) {
      const hasCachedMpc = Boolean(
        wallet._mpcDerivedForNearId === nearId &&
        wallet.mpcEvmAddress &&
        wallet.evmAddress &&
        wallet.solAddress &&
        wallet.solPublicKey
      );
      if (!hasCachedMpc) {
        if (cryptoEngine && typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
          const mpc = cryptoEngine.deriveNearMpcAllAddresses(nearId);
          wallet.mpcEvmAddress = mpc.evmAddress;
          if (!wallet.evmPrivateKey) wallet.evmAddress = mpc.evmAddress;
          else wallet.evmAddress = wallet.evmAddress || mpc.evmAddress;
          if (!wallet.solPrivateSeedHex) {
            wallet.solAddress = mpc.solAddress;
            wallet.solPublicKey = mpc.solAddress;
          } else {
            wallet.solAddress = wallet.solAddress || mpc.solAddress;
            wallet.solPublicKey = wallet.solPublicKey || wallet.solAddress;
          }
          wallet._mpcDerivedForNearId = nearId;
        } else if (!wallet.mpcEvmAddress) {
          const mpcEvm = await deriveMpcEvmAddressAsync(nearId, 'ethereum-1');
          wallet.mpcEvmAddress = mpcEvm;
          if (!wallet.evmPrivateKey) wallet.evmAddress = wallet.evmAddress || mpcEvm;
          wallet._mpcDerivedForNearId = nearId;
        }
      }
    }

    return wallet;
  }

  function resolveWalletChainBalance(wallet, chain) {
    if (!wallet) return 0;
    const c = String(chain || '').toLowerCase();
    const nb = wallet.nativeBalances || {};
    if (c === 'near') {
      const rawNear = wallet.nearBalance !== undefined && wallet.nearBalance !== null ? wallet.nearBalance : nb.near;
      const val = Number(rawNear);
      return Number.isFinite(val) ? val : 0;
    }
    if (c === 'prl') {
      const rawPrl = wallet.balance !== undefined && wallet.balance !== null ? wallet.balance : nb.prl;
      const val = Number(rawPrl);
      return Number.isFinite(val) ? val : 0;
    }
    const mb = wallet.multiBalances || {};
    if (c === 'bsc') {
      const rawBsc = mb.bnb !== undefined && mb.bnb !== null ? mb.bnb : (mb.bsc !== undefined && mb.bsc !== null ? mb.bsc : nb.bsc);
      const val = Number(rawBsc);
      return Number.isFinite(val) ? val : 0;
    }
    const rawVal = mb[c] !== undefined && mb[c] !== null ? mb[c] : nb[c];
    const val = Number(rawVal);
    return Number.isFinite(val) ? val : 0;
  }

  /**
   * Strict local balance pre-validation executed BEFORE firing RPC/aggregator requests.
   * Throws an Error with bilingual Insufficient balance details if funds (including gasBuffer) are insufficient.
   */
  function validateSufficientChainBalance({
    wallet,
    chain,
    tokenSymbol,
    amount,
    isNative = false,
    tokenBalance = null,
    gasBuffer = null
  } = {}) {
    const reqAmt = Number(amount);
    if (!Number.isFinite(reqAmt) || reqAmt <= 0) {
      throw new Error(t('请输入有效金额', 'Enter a valid positive amount'));
    }

    const chainKey = String(chain || '').toLowerCase();
    const sym = tokenSymbol || chainKey.toUpperCase() || 'TOKEN';
    const available =
      tokenBalance !== null && tokenBalance !== undefined
        ? (Number.isFinite(Number(tokenBalance)) ? Number(tokenBalance) : 0)
        : resolveWalletChainBalance(wallet, chainKey);

    let effectiveBuffer = 0;
    if (isNative) {
      if (gasBuffer !== null && gasBuffer !== undefined && Number.isFinite(Number(gasBuffer))) {
        effectiveBuffer = Math.max(0, Number(gasBuffer));
      } else {
        effectiveBuffer = DEFAULT_GAS_BUFFERS[chainKey] !== undefined ? DEFAULT_GAS_BUFFERS[chainKey] : 0;
      }
    }

    const requiredTotal = reqAmt + effectiveBuffer;
    if (available + 1e-12 < reqAmt || available + 1e-12 < requiredTotal) {
      const availFormatted = available.toFixed(4);
      const zhMsg = `${sym} 余额不足 (当前可用: ${availFormatted} ${sym})`;
      const enMsg = `Insufficient ${sym} (Available: ${availFormatted} ${sym})`;
      const lang = getConfiguredLang();
      const message = lang === 'zh' ? zhMsg : lang === 'en' ? enMsg : `${zhMsg} / ${enMsg}`;
      const err = new Error(message);
      err.code = 'INSUFFICIENT_BALANCE';
      err.zhMessage = zhMsg;
      err.enMessage = enMsg;
      err.available = available;
      err.required = requiredTotal;
      throw err;
    }

    return {
      ok: true,
      available,
      required: requiredTotal,
      gasBuffer: effectiveBuffer
    };
  }

