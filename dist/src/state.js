/**
 * NEAR Chain Abstraction Wallet - Unified State Store & Bilingual i18n
 * Persists multi-chain wallets under 'near_ca_wallets_v1' (auto-migrating 'pearl_user_wallets_v4'),
 * contacts under 'near_ca_contacts_v1', and language under 'near_ca_lang_v1'.
 * Attaches to globalThis.NearCAState, window.NearCAState, globalThis.state, window.state, and module.exports.
 */
(function (root) {
  'use strict';

  const WALLETS_STORAGE_KEY = 'near_ca_wallets_v1';
  const LEGACY_WALLETS_STORAGE_KEY = 'pearl_user_wallets_v4';
  const CONTACTS_STORAGE_KEY = 'near_ca_contacts_v1';
  const LEGACY_CONTACTS_STORAGE_KEY = 'pearl_contacts_v1';
  const LANG_STORAGE_KEY = 'near_ca_lang_v1';
  const FAV_TOKENS_STORAGE_KEY = 'near_ca_fav_tokens_v1';
  const LIVE_TOKENS_STORAGE_KEY = 'near_ca_live_tokens_v1';
  const STAKING_METRICS_STORAGE_KEY = 'near_ca_staking_metrics_v3';
  const SWAP_PAIR_STORAGE_KEY = 'near_ca_swap_pair_v1';
  const ACTIVE_SWAP_ORDER_STORAGE_KEY = 'near_ca_active_swap_order_v1';
  const WC_PROJECT_ID_STORAGE_KEY = 'near_ca_wc_project_id';
  const LEGACY_WC_PROJECT_ID_KEY = 'pearl_wc_project_id';

  const DEFAULT_FAVORITE_TOKEN_IDS = [
    'nep141:wrap.near',
    '1cs_v1:near:nep141:prl.omft.near',
    '1cs_v1:near:nep141:qtc.omft.near',
    'nep141:sol.omft.near',
    'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    'nep141:hood-0x39dbed3a2bd333467115de45665cc57f813c4571.omft.near'
  ];

  const NATIVE_BALANCE_KEYS = ['near', 'sol', 'eth', 'base', 'arb', 'bsc', 'op', 'pol', 'avax', 'hype', 'hood', 'arc', 'prl', 'btc'];

  function getCryptoEngine() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCACrypto) ||
      (typeof window !== 'undefined' && window.NearCACrypto) ||
      (typeof require === 'function' ? (function () { try { return require('./crypto-engine.js'); } catch (_) { return null; } })() : null)
    );
  }

  function safeStorageGet(key) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
        return localStorage.getItem(key);
      }
    } catch (_) {}
    return null;
  }

  function safeStorageRemove(key) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.removeItem === 'function') {
        localStorage.removeItem(key);
      }
    } catch (_) {}
  }

  function safeStorageSet(key, val) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
        localStorage.setItem(key, val);
        return true;
      }
    } catch (err) {
      const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22 || /quota/i.test(String(err.message || '')));
      if (isQuota && key !== LIVE_TOKENS_STORAGE_KEY) {
        try {
          safeStorageRemove(LIVE_TOKENS_STORAGE_KEY);
          safeStorageRemove(STAKING_METRICS_STORAGE_KEY);
          safeStorageRemove('near_ca_near_ft_icons_v1');
          localStorage.setItem(key, val);
          return true;
        } catch (_) {}
      }
    }
    return false;
  }

  function createEmptyNativeBalances() {
    return {
      near: null,
      sol: null,
      eth: null,
      base: null,
      arb: null,
      bsc: null,
      op: null,
      pol: null,
      avax: null,
      hype: null,
      hood: null,
      arc: null,
      prl: null,
      btc: null
    };
  }

  function syncWalletCompatBalances(wallet) {
    if (!wallet || typeof wallet !== 'object') return wallet;
    const nb = wallet.nativeBalances || createEmptyNativeBalances();
    wallet.nativeBalances = nb;
    wallet.nearBalance = typeof nb.near === 'number' && Number.isFinite(nb.near) ? nb.near : null;
    wallet.balance = typeof nb.prl === 'number' && Number.isFinite(nb.prl) ? nb.prl : null;
    wallet.multiBalances = {
      sol: nb.sol,
      eth: nb.eth,
      base: nb.base,
      arb: nb.arb,
      bsc: nb.bsc,
      bnb: nb.bsc,
      op: nb.op,
      pol: nb.pol,
      avax: nb.avax,
      hype: nb.hype,
      hood: nb.hood,
      arc: nb.arc
    };
    return wallet;
  }

  function normalizeErc20Map(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== 'object') return out;
    for (const [k, v] of Object.entries(rawMap)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        out[k] = v;
        const sep = k.indexOf('_');
        if (sep > 0) {
          const chainKey = k.slice(0, sep).toLowerCase();
          const contract = k.slice(sep + 1).toLowerCase();
          if (!out[chainKey] || typeof out[chainKey] !== 'object') out[chainKey] = {};
          out[chainKey][contract] = v;
        }
      } else if (v && typeof v === 'object') {
        const chainKey = k.toLowerCase();
        if (!out[chainKey] || typeof out[chainKey] !== 'object') out[chainKey] = {};
        for (const [contract, bal] of Object.entries(v)) {
          if (typeof bal === 'number' && Number.isFinite(bal)) {
            const cLower = contract.toLowerCase();
            out[chainKey][cLower] = bal;
            out[`${chainKey}_${cLower}`] = bal;
          }
        }
      }
    }
    return out;
  }

  function setWalletErc20Balance(wallet, chainKey, contractAddress, amount) {
    if (!wallet || !chainKey || !contractAddress) return;
    if (!wallet.erc20Balances || typeof wallet.erc20Balances !== 'object') {
      wallet.erc20Balances = {};
    }
    const cKey = String(chainKey).toLowerCase();
    const addrLower = String(contractAddress).toLowerCase();
    const val = typeof amount === 'number' && Number.isFinite(amount) ? amount : null;
    if (val === null) return;
    wallet.erc20Balances[`${cKey}_${addrLower}`] = val;
    if (!wallet.erc20Balances[cKey] || typeof wallet.erc20Balances[cKey] !== 'object') {
      wallet.erc20Balances[cKey] = {};
    }
    wallet.erc20Balances[cKey][addrLower] = val;
  }

  function getWalletErc20Balance(wallet, chainKey, contractAddress) {
    if (!wallet || !wallet.erc20Balances || !chainKey || !contractAddress) return null;
    const cKey = String(chainKey).toLowerCase();
    const addrLower = String(contractAddress).toLowerCase();
    const flatVal = wallet.erc20Balances[`${cKey}_${addrLower}`];
    if (typeof flatVal === 'number' && Number.isFinite(flatVal)) return flatVal;
    const nested = wallet.erc20Balances[cKey];
    if (nested && typeof nested[addrLower] === 'number' && Number.isFinite(nested[addrLower])) {
      return nested[addrLower];
    }
    return null;
  }

  function normalizeWalletRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const acctType = String(raw.accountType || 'standard').trim();
    if (acctType !== 'standard') {
      if (!String(raw.mnemonic || '').trim() && (!String(raw.nearPrivateKey || '').trim() || !String(raw.nearPublicKey || '').trim())) {
        return null;
      }
    }

    const nativeBalances = createEmptyNativeBalances();
    const rawNb = raw.nativeBalances && typeof raw.nativeBalances === 'object' ? raw.nativeBalances : {};
    const rawMb = raw.multiBalances && typeof raw.multiBalances === 'object' ? raw.multiBalances : {};

    for (const k of NATIVE_BALANCE_KEYS) {
      let val = rawNb[k];
      if (val === undefined) {
        if (k === 'near') val = raw.nearBalance;
        else if (k === 'prl') val = raw.balance;
        else if (k === 'bsc') val = rawMb.bnb !== undefined ? rawMb.bnb : rawMb.bsc;
        else val = rawMb[k];
      }
      nativeBalances[k] = (val !== null && val !== undefined && Number.isFinite(Number(val)))
        ? Number(val)
        : null;
    }

    const nearNamedAccount = String(raw.nearNamedAccount || '').trim().toLowerCase();
    const nearAddress = String(raw.nearAddress || '').trim().toLowerCase();
    const activeNearId = nearNamedAccount || nearAddress;

    let mpcEvmAddress = String(raw.mpcEvmAddress || '').trim();
    let evmAddress = String(raw.evmAddress || '').trim();
    let solAddress = String(raw.solAddress || '').trim();
    let pearlAddress = String(raw.address || raw.pearlAddress || '').trim();
    let privateKeyHex = String(raw.privateKeyHex || '').trim();
    let tweakedPrivateKeyHex = String(raw.tweakedPrivateKeyHex || '').trim();
    let btcAddress = String(raw.btcAddress || '').trim();
    let btcPrivateKeyHex = String(raw.btcPrivateKeyHex || '').trim();
    let btcTweakedPrivateKeyHex = String(raw.btcTweakedPrivateKeyHex || '').trim();

    let mpcDerivedForNearId = String(raw._mpcDerivedForNearId || '').trim().toLowerCase();
    let didSelfHeal = false;

    const cryptoEngine = getCryptoEngine();
    const mnemonicClean = String(raw.mnemonic || '').trim();
    const needsPearl = Boolean(mnemonicClean) && (!pearlAddress || !privateKeyHex || !tweakedPrivateKeyHex);
    if (needsPearl && cryptoEngine && typeof cryptoEngine.derivePearlFromSeed === 'function') {
      try {
        const pearlDerived = cryptoEngine.derivePearlFromSeed(mnemonicClean, "m/86'/808276'/0'/0/0", true);
        if (pearlDerived && pearlDerived.address) {
          pearlAddress = pearlDerived.address;
          privateKeyHex = pearlDerived.privateKeyHex || privateKeyHex;
          tweakedPrivateKeyHex = pearlDerived.tweakedPrivateKeyHex || tweakedPrivateKeyHex;
          didSelfHeal = true;
        }
      } catch (_) {}
    }

    const needsBtc = Boolean(mnemonicClean) && (!btcAddress || !btcPrivateKeyHex || !btcTweakedPrivateKeyHex);
    if (needsBtc && cryptoEngine && typeof cryptoEngine.deriveBitcoinFromSeed === 'function') {
      try {
        const btcDerived = cryptoEngine.deriveBitcoinFromSeed(mnemonicClean, "m/86'/0'/0'/0/0", true);
        if (btcDerived && btcDerived.address) {
          btcAddress = btcDerived.address;
          btcPrivateKeyHex = btcDerived.privateKeyHex || btcPrivateKeyHex;
          btcTweakedPrivateKeyHex = btcDerived.tweakedPrivateKeyHex || btcTweakedPrivateKeyHex;
          didSelfHeal = true;
        }
      } catch (_) {}
    }

    const hasCachedMpc = Boolean(
      mpcDerivedForNearId &&
      mpcDerivedForNearId === activeNearId &&
      mpcEvmAddress &&
      evmAddress &&
      solAddress
    );
    if (activeNearId && !hasCachedMpc && cryptoEngine) {
      if (typeof cryptoEngine.deriveNearMpcEvmAddress === 'function' && typeof cryptoEngine.deriveNearMpcSolanaAddress === 'function') {
        try {
          const evmMpc = cryptoEngine.deriveNearMpcEvmAddress(activeNearId, 'ethereum-1');
          const solMpc = cryptoEngine.deriveNearMpcSolanaAddress(activeNearId, 'solana-1');
          mpcEvmAddress = evmMpc.mpcEvmAddress;
          evmAddress = evmMpc.mpcEvmAddress;
          solAddress = solMpc.mpcSolAddress;
          mpcDerivedForNearId = activeNearId;
          didSelfHeal = true;
        } catch (_) {}
      } else if (typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
        try {
          const mpcAll = cryptoEngine.deriveNearMpcAllAddresses(activeNearId);
          mpcEvmAddress = mpcAll.evmAddress;
          evmAddress = mpcAll.evmAddress;
          solAddress = mpcAll.solAddress;
          mpcDerivedForNearId = activeNearId;
          didSelfHeal = true;
        } catch (_) {}
      }
    }

    const rawIter = Number(raw.pinIterations) || 100_000;
    const pinIterations = Math.min(250_000, Math.max(1000, rawIter));
    let healedNearAddr = nearAddress;
    let healedNearPub = String(raw.nearPublicKey || '').trim();
    let healedNearPriv = String(raw.nearPrivateKey || '').trim();
    if (mnemonicClean && (!healedNearAddr || !healedNearPub || !healedNearPriv) && cryptoEngine && typeof cryptoEngine.deriveNearFromSeed === 'function') {
      try {
        const nearDerived = cryptoEngine.deriveNearFromSeed(mnemonicClean);
        if (nearDerived && nearDerived.nearAddress) {
          healedNearAddr = healedNearAddr || nearDerived.nearAddress;
          healedNearPub = healedNearPub || nearDerived.nearPublicKey || '';
          healedNearPriv = healedNearPriv || nearDerived.nearPrivateKey || '';
          didSelfHeal = true;
        }
      } catch (_) {}
    }

    const wallet = {
      id: String(raw.id || `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      accountType: acctType,
      name: String(raw.name || 'NEAR Account'),
      mnemonic: mnemonicClean,
      pin: String(raw.pin || ''),
      pinHash: String(raw.pinHash || ''),
      pinSalt: String(raw.pinSalt || ''),
      pinIterations,
      biometricEnabled: raw.biometricEnabled !== undefined ? Boolean(raw.biometricEnabled) : true,
      biometricLocked: Boolean(raw.biometricLocked),
      webauthnCredentialId: String(raw.webauthnCredentialId || '').trim(),
      // Primary NEAR CA Identity
      nearNamedAccount,
      nearAddress: healedNearAddr,
      nearPublicKey: healedNearPub,
      nearPrivateKey: healedNearPriv,
      nearPrivateSeedHex: String(raw.nearPrivateSeedHex || '').trim(),
      _nearAccountChecked: Boolean(raw._nearAccountChecked || nearNamedAccount),
      // External Chain Addresses Controlled by NEAR MPC (v1.signer) + Native BIP-86 Pearl & Bitcoin Addresses
      mpcEvmAddress,
      evmAddress,
      solAddress,
      solPublicKey: solAddress,
      address: pearlAddress,
      privateKeyHex,
      tweakedPrivateKeyHex,
      btcAddress,
      btcPrivateKeyHex,
      btcTweakedPrivateKeyHex,
      _mpcDerivedForNearId: mpcDerivedForNearId,
      qtcDepositAddress: String(raw.qtcDepositAddress || '').trim(),
      // Balances
      nearNep141Balances: (raw.nearNep141Balances && typeof raw.nearNep141Balances === 'object') ? { ...raw.nearNep141Balances } : {},
      intentsBalances: (raw.intentsBalances && typeof raw.intentsBalances === 'object') ? { ...raw.intentsBalances } : {},
      nativeBalances,
      splBalances: (raw.splBalances && typeof raw.splBalances === 'object') ? { ...raw.splBalances } : {},
      solAtaMints: (raw.solAtaMints && typeof raw.solAtaMints === 'object') ? { ...raw.solAtaMints } : null,
      erc20Balances: normalizeErc20Map(raw.erc20Balances),
      nearStakingPositions: Array.isArray(raw.nearStakingPositions) ? raw.nearStakingPositions.slice() : [],
      solStakingPositions: Array.isArray(raw.solStakingPositions) ? raw.solStakingPositions.slice() : [],
      evmStakingPositions: Array.isArray(raw.evmStakingPositions) ? raw.evmStakingPositions.slice() : [],
      activityHistory: Array.isArray(raw.activityHistory) ? raw.activityHistory.slice(0, 100) : []
    };
    if (didSelfHeal) wallet._needsSelfHealSave = true;

    return syncWalletCompatBalances(wallet);
  }

  function recomputeWalletMpcAddresses(wallet) {
    if (!wallet || typeof wallet !== 'object') return wallet;
    const cryptoEngine = getCryptoEngine();
    const needsPearl = Boolean(wallet.mnemonic) && (!wallet.address || !wallet.privateKeyHex || !wallet.tweakedPrivateKeyHex);
    if (needsPearl && cryptoEngine && typeof cryptoEngine.derivePearlFromSeed === 'function') {
      try {
        const pearlDerived = cryptoEngine.derivePearlFromSeed(wallet.mnemonic, "m/86'/808276'/0'/0/0", true);
        if (pearlDerived && pearlDerived.address) {
          wallet.address = pearlDerived.address;
          wallet.privateKeyHex = pearlDerived.privateKeyHex || wallet.privateKeyHex;
          wallet.tweakedPrivateKeyHex = pearlDerived.tweakedPrivateKeyHex || wallet.tweakedPrivateKeyHex;
        }
      } catch (_) {}
    }
    const needsBtc = Boolean(wallet.mnemonic) && (!wallet.btcAddress || !wallet.btcPrivateKeyHex || !wallet.btcTweakedPrivateKeyHex);
    if (needsBtc && cryptoEngine && typeof cryptoEngine.deriveBitcoinFromSeed === 'function') {
      try {
        const btcDerived = cryptoEngine.deriveBitcoinFromSeed(wallet.mnemonic, "m/86'/0'/0'/0/0", true);
        if (btcDerived && btcDerived.address) {
          wallet.btcAddress = btcDerived.address;
          wallet.btcPrivateKeyHex = btcDerived.privateKeyHex || wallet.btcPrivateKeyHex;
          wallet.btcTweakedPrivateKeyHex = btcDerived.tweakedPrivateKeyHex || wallet.btcTweakedPrivateKeyHex;
        }
      } catch (_) {}
    }
    const activeNearId = String(wallet.nearNamedAccount || wallet.nearAddress || '').trim().toLowerCase();
    if (!activeNearId) return wallet;
    const hasCachedMpc = Boolean(
      wallet._mpcDerivedForNearId === activeNearId &&
      wallet.mpcEvmAddress &&
      wallet.evmAddress &&
      wallet.solAddress &&
      wallet.solPublicKey
    );
    if (!hasCachedMpc && cryptoEngine) {
      if (typeof cryptoEngine.deriveNearMpcEvmAddress === 'function' && typeof cryptoEngine.deriveNearMpcSolanaAddress === 'function') {
        const evmMpc = cryptoEngine.deriveNearMpcEvmAddress(activeNearId, 'ethereum-1');
        const solMpc = cryptoEngine.deriveNearMpcSolanaAddress(activeNearId, 'solana-1');
        wallet.mpcEvmAddress = evmMpc.mpcEvmAddress;
        wallet.evmAddress = evmMpc.mpcEvmAddress;
        wallet.solAddress = solMpc.mpcSolAddress;
        wallet.solPublicKey = solMpc.mpcSolAddress;
        wallet._mpcDerivedForNearId = activeNearId;
      } else if (typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
        const mpcAll = cryptoEngine.deriveNearMpcAllAddresses(activeNearId);
        wallet.mpcEvmAddress = mpcAll.evmAddress;
        wallet.evmAddress = mpcAll.evmAddress;
        wallet.solAddress = mpcAll.solAddress;
        wallet.solPublicKey = mpcAll.solAddress;
        wallet._mpcDerivedForNearId = activeNearId;
      }
    }
    return wallet;
  }

  function hasWalletPin(wallet) {
    return Boolean(wallet && ((wallet.pinHash && wallet.pinSalt) || (wallet.pin && String(wallet.pin).trim())));
  }

  async function setWalletPinAsync(wallet, rawPin) {
    if (!wallet || typeof wallet !== 'object') return false;
    const clean = String(rawPin || '').trim();
    if (!clean) {
      wallet.pin = '';
      wallet.pinHash = '';
      wallet.pinSalt = '';
      return true;
    }
    const cryptoEngine = getCryptoEngine();
    if (cryptoEngine && typeof cryptoEngine.hashPinAsync === 'function') {
      const h = await cryptoEngine.hashPinAsync(clean);
      wallet.pinHash = h.hashHex;
      wallet.pinSalt = h.saltHex;
      wallet.pinIterations = h.iterations;
      wallet.pin = '';
      return true;
    }
    wallet.pin = clean;
    return true;
  }

  async function verifyWalletPinAsync(wallet, enteredPin) {
    if (!wallet) return false;
    const clean = String(enteredPin || '').trim();
    if (!clean) return false;
    const cryptoEngine = getCryptoEngine();
    if (wallet.pinHash && wallet.pinSalt && cryptoEngine && typeof cryptoEngine.verifyPinHashAsync === 'function') {
      return cryptoEngine.verifyPinHashAsync(clean, wallet.pinHash, wallet.pinSalt, wallet.pinIterations || 100_000);
    }
    if (wallet.pin && wallet.pin === clean) {
      await setWalletPinAsync(wallet, clean).catch(() => {});
      saveWallets();
      return true;
    }
    return false;
  }

  // ======================== Bilingual i18n Dictionary ========================

  const i18nDict = {
    zh: {
      // Header
      'header.caBadge': 'NEAR CA',
      'header.wcBtn': 'WC',
      'header.langToggle': 'EN',
      // Onboarding
      'onboard.badge': 'NEAR 链抽象自托管账户',
      'onboard.title': '一个 NEAR 账户，畅通全链资产',
      'onboard.subtitle': '支持 NEAR Intents 0-Gas 跨链闪兑、多链智能路由与链上直连',
      'onboard.createBtn': '创建 NEAR 链抽象钱包',
      'onboard.importBtn': '导入 12 / 24 词助记词',
      'onboard.createTitle': '备份您的助记词',
      'onboard.createHint': '请妥善离线保存以下 12 个单词，它是恢复所有链上资产的唯一凭证',
      'onboard.walletNamePlaceholder': '钱包名称（可选）',
      'onboard.pinPlaceholder': '设置 6 位交易密码（可选）',
      'onboard.confirmCreateBtn': '已备份，进入钱包',
      'onboard.importTitle': '导入恢复助记词',
      'onboard.importPlaceholder': '输入 12 或 24 个英文助记词，使用空格分隔',
      'onboard.confirmImportBtn': '派生全链账户并导入',
      'onboard.cancelBtn': '返回',
      'onboard.copySeedBtn': '复制助记词',
      // Navigation Tabs
      'nav.wallet': '资产',
      'nav.swap': '闪兑',
      'nav.perp': '合约',
      'nav.earn': '质押',
      'nav.hub': '枢纽',
      // Home / Assets
      'home.totalBalance': '统一资产总览 (USD)',
      'home.masterAccount': 'NEAR 主账户',
      'home.registerNear': '注册 .near',
      'home.send': '转账',
      'home.receive': '收款',
      'home.swap': '闪兑',
      'home.earn': '质押',
      'home.sendBtn': '转账',
      'home.receiveBtn': '收款',
      'home.swapBtn': '闪兑',
      'home.assetsTitle': '聚合资产列表',
      'home.ptrPull': '下拉刷新链上余额',
      'home.ptrRelease': '释放立即刷新',
      'home.ptrSyncing': '正在同步多链资产...',
      // Token Detail Sheet
      'detail.bridgeBtn': '跨链桥',
      'detail.receiveAddrLabel': '当前网络收款地址',
      'detail.chainBreakdownTitle': '分链余额明细',
      'detail.historyTitle': '最近交易',
      'detail.allBtn': '全部 ›',
      'detail.openExplorerBtn': '前往浏览器 ↗',
      'sheet.txHistoryTitle': '交易记录',
      'sheet.txDetailTitle': '交易详情',
      'tx.explorerBtn': '↗ 区块浏览器',
      'tx.txIdLabel': '交易 ID',
      'tx.copyTxIdBtn': '复制交易 ID',
      'tx.confirmationsLabel': '确认数',
      'tx.blockLabel': '区块',
      'tx.timeLabel': '时间',
      'tx.outputTotalLabel': '输出总额',
      'tx.feeLabel': '网络手续费',
      'tx.netDeltaLabel': '你的地址净收支',
      'tx.inputsLabel': '输入',
      'tx.outputsLabel': '输出',
      'common.back': '‹ 返回',
      // Swap
      'swap.title': '全链统一闪兑',
      'swap.modeMarket': '闪兑',
      'swap.modeLimit': '限价',
      'swap.autoRouteLabel': '智能路由',
      'swap.fromLabel': '支付',
      'swap.toLabel': '获得',
      'swap.balanceLabel': '可用',
      'swap.maxBtn': '全部',
      'swap.recipientLabel': '目标链收款地址',
      'swap.recipientPlaceholder': '自动匹配当前主账户对应链地址',
      'swap.rateLabel': '参考汇率',
      'swap.detailsLabel': '更多设置',
      'swap.detailsDefaultSummary': '滑点 1%',
      'swap.routeLabel': '执行路由',
      'swap.slippageLabel': '滑点容差',
      'swap.gasReserveLabel': '目标链 Gas 预留',
      'swap.gasModeAuto': '默认',
      'swap.gasModeExtra': '多留',
      'swap.feeLabel': '服务费',
      'swap.executeBtn': '确认闪兑',
      'swap.orderTitle': '跨链订单跟踪',
      'swap.orderTxHash': '交易哈希',
      'swap.orderDepositAddr': '充值地址',
      'swap.orderStatus': '订单状态',
      'swap.orderRefresh': '刷新状态',
      'swap.orderSubmitHashPlaceholder': '粘贴外部转账 TxHash 加速确认',
      'swap.orderSubmitHashBtn': '提交凭证',
      'swap.orderResumeBtn': '继续执行下一步',
      'swap.orderDoneBtn': '完成',
      // Limit Orders
      'limit.sellLabel': '卖出',
      'limit.buyLabel': '买入',
      'limit.wrapBtn': '封装',
      'limit.priceLabel': '目标价格',
      'limit.marketRefLabel': '当前参考',
      'limit.rateOffsetNow': '现价',
      'limit.activeTickLabel': '链上生效档位',
      'limit.stepDown': '− 低一档',
      'limit.stepUp': '高一档 +',
      'limit.splitTicksLabel': '拆成相邻两档 (更易吃单)',
      'limit.expiryLabel': '有效期',
      'limit.exp1d': '1天',
      'limit.exp7d': '7天',
      'limit.exp30d': '30天',
      'limit.estReceive': '预计获得',
      'limit.gasLabel': '网络费 (Gas)',
      'limit.depositLabel': '押金 (可退)',
      'limit.minOrderLabel': '最低限额',
      'limit.submitBtn': '提交限价单',
      'limit.ordersTitle': '限价挂单',
      'limit.tabActive': '当前挂单',
      'limit.tabHistory': '历史挂单',
      // Perps / Hyperliquid
      'perp.equityLabel': '合约净值',
      'perp.availMarginLabel': '可用保证金',
      'perp.upnlLabel': '未实现盈亏',
      'perp.depositBtn': '充值',
      'perp.withdrawBtn': '提现',
      'perp.spotPendingPrefix': '跨链资金已到账',
      'perp.transferToPerpBtn': '一键转入合约 (免费)',
      'perp.vol24hLabel': '24h 成交额',
      'perp.oiLabel': '全网持仓 (OI)',
      'perp.highLowLabel': '区间高 / 低',
      'perp.fundingRateLabel': '资金费率(1h)',
      'perp.lsRatioLabel': '全网多空人数比',
      'perp.chartBtn': 'K线',
      'perp.orderbookTitle': '盘口',
      'perp.obBidPx': '买价',
      'perp.obAskPx': '卖价',
      'perp.longBtn': '做多 Long',
      'perp.shortBtn': '做空 Short',
      'perp.isolatedBtn': '逐仓',
      'perp.crossBtn': '全仓',
      'perp.leverageLabel': '杠杆',
      'perp.marketBtn': '市价',
      'perp.limitBtn': '限价',
      'perp.limitPriceLabel': '委托价格',
      'perp.marginInputLabel': '投入保证金 (USDC)',
      'perp.tpslLabel': '止盈 / 止损 (可选)',
      'perp.tpPlaceholder': '止盈触发价',
      'perp.slPlaceholder': '止损触发价',
      'perp.notionalLabel': '名义价值',
      'perp.sizeLabel': '委托数量',
      'perp.liqEstLabel': '预估强平价',
      'perp.minOrderLabel': '最低下单',
      'perp.minOrderVal': '$10 USDC',
      'perp.gasLabel': '网络费',
      'perp.gasZeroVal': '0 Gas',
      'perp.submitLongBtn': '开多',
      'perp.submitShortBtn': '开空',
      'perp.tabPositions': '当前持仓',
      'perp.tabOrders': '当前委托',
      'perp.tabFills': '历史成交',
      'perp.marketsSheetTitle': '选择合约市场',
      'perp.marketSearchPlaceholder': '搜索币种，如 BTC, ETH, SOL, HYPE...',
      'perp.mktFilterHot': '热门',
      'perp.mktFilterAll': '全部',
      'perp.mktFilterGainers': '涨幅榜',
      'perp.mktFilterVol': '成交额',
      'perp.depositSheetTitle': '合约充值',
      'perp.withdrawSheetTitle': '提现到钱包',
      'perp.fundingTabOneClick': '跨链充值',
      'perp.fundingTabArb': 'Arbitrum 充值',
      'perp.ocOriginLabel': '支付资产',
      'perp.ocAmountLabel': '充值数量',
      'perp.ocEstReceiveLabel': '预计到账 (USDC)',
      'perp.ocTargetAddrLabel': '收款合约账户',
      'perp.ocDepositBtn': '确认跨链充值',
      'perp.ocEmptyTitle': '当前暂无可直充合约的资产',
      'perp.ocEmptyDesc': '支持从 NEAR、SOL、USDC、USDT、ETH、BTC 等跨链直充合约。若仅持有 PRL，请先在「闪兑」中兑换。',
      'perp.goSwapBtn': '去闪兑换成 USDC / NEAR',
      'perp.arbUsdcBalLabel': 'Arbitrum USDC 可用',
      'perp.arbEthBalLabel': 'Arbitrum ETH (Gas)',
      'perp.arbMinLabel': '最低充值',
      'perp.arbMinVal': '5 USDC',
      'perp.arbAmountLabel': '充值数量 (USDC)',
      'perp.arbDepositBtn': '确认 Arbitrum 充值',
      'perp.perpWithdrawLabel': '可提现余额',
      'perp.withdrawDestLabel': '收款地址 (Arbitrum)',
      'perp.withdrawFeeLabel': '协议手续费',
      'perp.withdrawFeeVal': '1 USDC (最低提现 2 USDC)',
      'perp.withdrawNetLabel': '预计实际到账',
      'perp.withdrawAmountLabel': '提现数量 (USDC)',
      'perp.withdrawConfirmBtn': '安全验证并提现',
      // Earn / Staking
      'earn.title': '链上流动性质押',
      'earn.refreshBtn': '刷新利率',
      'earnSearchPlaceholder': '搜索质押代币、协议或合约 (如 RHEA, JUP, NEAR, SOL, USDC)...',
      'earn.filterFeatured': '🔥 热门大池',
      'earn.filterAll': '全部质押池 (21)',
      'earn.filterLending': '🏦 借贷与生息',
      'earn.filterNear': 'NEAR & Rhea',
      'earn.filterSol': 'Solana & JUP',
      'earn.filterEvm': 'EVM & Arc',
      'earn.lockLabel': '锁仓周期',
      'earn.tvlLabel': '总质押量 (TVL)',
      'earn.stakersLabel': '质押人数',
      'earn.apyLabel': '实时年化',
      'earn.rateLabel': '兑换比例',
      'earn.amountLabel': '质押数量',
      'earn.estReceive': '预计获得',
      'earn.stakeBtn': '确认链上质押',
      'earn.myPositionsTitle': '我的质押仓位',
      // Hub
      'hub.nearDomainTitle': 'NEAR .near 账户注册与绑定',
      'hub.nearDomainCurrent': '当前主账户',
      'hub.nearDomainPlaceholder': '输入期望域名，如 alice.near',
      'hub.nearDomainAuthPlaceholder': '绑定其他钱包的 .near 时，可填原助记词/私钥自动授权（可选）',
      'hub.nearDomainRegisterBtn': '无损注册 .near (0.05 NEAR)',
      'hub.nearDomainBindBtn': '确认绑定',
      'hub.nearAcctMenuTitle': 'NEAR 账户与密钥',
      'hub.nearAcctMenuSub': '注册 .near / 链上密钥管理',
      'hub.addrMenuTitle': '多链收款地址',
      'hub.addrMenuSub': '查看并复制全链主地址',
      'hub.miningMenuTitle': 'Pearl 矿工监控',
      'hub.langTitle': '语言偏好',
      'hub.mpcTitle': '多链派生与签名授权',
      'hub.mpcPathLabel': '派生路径',
      'hub.mpcDerivedAddr': '派生地址',
      'hub.mpcPayloadPlaceholder': '输入消息或 32 字节 Hex 哈希进行链抽象签名',
      'hub.mpcSignBtn': '发起签名',
      'hub.miningTitle': '⛏️ Pearl 矿工深度遥测',
      'hub.miningSubtitle': '多矿池算力追踪、单机状态监控与链上矿工余额查询',
      'hub.miningOpenBtn': '打开专业矿工面板',
      'hub.keysTitle': 'NEAR 主账户与多链地址',
      'hub.manageWalletsBtn': '切换 / 新增钱包',
      'hub.backupKeysBtn': '导出助记词与主密钥',
      'hub.contactsTitle': '常用地址簿',
      'hub.contactsOpenBtn': '管理联系人',
      'hub.wcTitle': 'WalletConnect v2 授权',
      'hub.wcOpenBtn': '管理 DApp 连接',
      'hub.solRentTitle': 'Solana 租金回收与粉尘粉碎',
      'hub.solRentOpenBtn': '扫描回收',
      'hub.nearStorageTitle': 'NEAR 存储押金回收',
      'hub.nearStorageOpenBtn': '扫描回收',
      'hub.securityTitle': '安全与偏好设置',
      'hub.pinBtn': '设置 / 修改 PIN 密码',
      'hub.langBtn': '切换语言 (中/EN)',
      'hub.accessKeysBtn': 'NEAR 密钥管理与更换助记词',
      'hub.bioCardTitle': '安全验证',
      'hub.bioSetPinBtn': '设置安全 PIN',
      // Sheets
      'sheet.sendTitle': '跨链转账',
      'sheet.sendAssetLabel': '选择资产',
      'sheet.sendSourceLabel': '扣款网络',
      'sheet.sendToLabel': '收款地址（自动识别链类型）',
      'sheet.sendToPlaceholder': '输入 .near / 0x / Solana / prl1p / bc1 地址',
      'sheet.sendEvmChainLabel': '目标 EVM 网络',
      'sheet.sendAmountLabel': '转账数量',
      'sheet.sendConfirmBtn': '签名并广播',
      'sheet.receiveTitle': '多链统一收款',
      'sheet.receiveCopyBtn': '复制收款地址',
      'sheet.tokenPickerTitle': '选择代币',
      'sheet.tokenPickerSearch': '搜索币种名称或合约',
      'sheet.miningTitle': 'Pearl 矿工深度遥测',
      'sheet.miningAddrPlaceholder': '输入 prl1p... 矿工地址',
      'sheet.miningQueryBtn': '查询',
      'sheet.miningSaveBtn': '收藏',
      'sheet.miningPoolAuto': '自动',
      'sheet.miningPoolOnchain': '链上',
      'sheet.miningHash30m': '30m 算力',
      'sheet.miningHash3h': '3h 均值',
      'sheet.miningHash24h': '24h 均值',
      'sheet.miningUnpaid': '待结算 PRL',
      'sheet.miningShareRate': '份额接受率',
      'sheet.miningWorkersTitle': '矿机在线状态',
      'sheet.miningColRig': '矿机',
      'sheet.miningColStatus': '状态',
      'sheet.miningColShares': '份额',
      'sheet.miningPayoutsTitle': '近期打款记录',
      'sheet.wcTitle': 'WalletConnect v2',
      'sheet.wcProjectIdPlaceholder': '输入 Reown / WalletConnect Project ID',
      'sheet.wcSaveIdBtn': '保存 ID',
      'sheet.wcUriPlaceholder': '粘贴 wc: 配对链接',
      'sheet.wcPairBtn': '配对连接',
      'sheet.wcApproveBtn': '批准',
      'sheet.wcRejectBtn': '拒绝',
      'sheet.wcSessionsTitle': '已连接应用',
      'sheet.contactsTitle': '地址簿管理',
      'sheet.contactsNamePlaceholder': '备注名称',
      'sheet.contactsAddrPlaceholder': '钱包地址 (.near / 0x / Solana / prl1p / bc1)',
      'sheet.contactsAddBtn': '添加联系人',
      'sheet.walletsTitle': '多钱包管理',
      'sheet.walletsCreateBtn': '新建钱包',
      'sheet.walletsImportBtn': '导入助记词',
      'sheet.keysTitle': 'NEAR 密钥管理',
      'sheet.keysAccountLabel': '当前账户',
      'sheet.keysListTitle': '链上访问密钥',
      'sheet.keysRotateTitle': '更换助记词 / 升级密钥',
      'sheet.keysRotatePlaceholder': '点击下方生成新助记词，或粘贴已有助记词',
      'sheet.keysGenSeedBtn': '生成新助记词',
      'sheet.keysAddOnlyBtn': '仅添加密钥 (保留旧密钥)',
      'sheet.keysRotateConfirmBtn': '确认更换并删除旧密钥',
      'sheet.addressesTitle': '多链收款地址',
      'sheet.nearAcctTitle': 'NEAR 账户与密钥',
      'near.balanceLabel': '当前余额',
      'near.unactivatedGuide': '向隐式地址转入 ≥ 0.055 NEAR 后即可一键注册 .near，系统将自动销毁空隐式账户并将 100% 余额与存储押金无损归集至新域名。',
      'near.checkAvailBtn': '检测',
      'near.bindToggleBtn': '绑定已有 .near 账号 ▾',
      'wc.advancedToggle': '高级配置: Project ID ▾',
      'sheet.solRentTitle': 'Solana 租金回收与粉碎',
      'sheet.solRentSummaryLabel': '扫描结果',
      'sheet.solRentNote': '仅关闭空账户或销毁勾选的微额粉尘代币以退回 SOL 租金，销毁后代币不可恢复。',
      'sheet.solRentExecuteBtn': '一键回收并领取',
      'sheet.nearStorageTitle': 'NEAR 存储押金回收',
      'sheet.nearStorageSummaryLabel': '扫描结果',
      'sheet.nearStorageNote': '仅对当前代币余额为 0 的 NEP-141 合约注销空账本并退回 NEAR 存储押金（每笔约消耗 0.00018 NEAR Gas）。',
      'sheet.nearStorageExecuteBtn': '一键回收存储押金',
      'sheet.backupTitle': '助记词与主密钥备份',
      'sheet.pinTitle': '安全密码设置',
      'sheet.pinPlaceholder': '输入 4-6 位数字密码',
      'sheet.pinSaveBtn': '保存密码',
      'sheet.authTitle': '安全验证',
      'sheet.authBiometricBtn': '👤 生物识别',
      'sheet.authPinHint': '输入 PIN',
      'sheet.authCancelBtn': '取消验证',
      'lock.title': '安全锁定',
      'lock.hint': '请通过生物识别或锁屏密码解锁',
      'lock.unlockBtn': '生物识别 / 锁屏密码解锁',
      'lock.pinFallbackBtn': '使用交易 PIN 解锁',
      'common.copy': '复制',
      'common.close': '关闭',
      'common.paste': '粘贴',
      'common.contacts': '地址簿',
      'common.refresh': '刷新',
      'common.back': '← 返回'
    },
    en: {
      // Header
      'header.caBadge': 'NEAR CA',
      'header.wcBtn': 'WC',
      'header.langToggle': '中',
      // Onboarding
      'onboard.badge': 'NEAR Chain Abstraction Self-Custody',
      'onboard.title': 'One NEAR Account. Every Chain.',
      'onboard.subtitle': '0-Gas Cross-Chain Intents, Smart Routing & Direct On-Chain Contracts',
      'onboard.createBtn': 'Create New NEAR Chain Abstraction Wallet',
      'onboard.importBtn': 'Import 12/24-Word Recovery Phrase',
      'onboard.createTitle': 'Back Up Recovery Phrase',
      'onboard.createHint': 'Store these 12 words safely offline. They control all derived chain accounts.',
      'onboard.walletNamePlaceholder': 'Wallet Name (optional)',
      'onboard.pinPlaceholder': 'Set 6-digit PIN (optional)',
      'onboard.confirmCreateBtn': 'Saved, Enter Wallet',
      'onboard.importTitle': 'Import Recovery Phrase',
      'onboard.importPlaceholder': 'Enter 12 or 24 BIP-39 words separated by spaces',
      'onboard.confirmImportBtn': 'Derive Accounts & Import',
      'onboard.cancelBtn': 'Back',
      'onboard.copySeedBtn': 'Copy Phrase',
      // Navigation Tabs
      'nav.wallet': 'Assets',
      'nav.swap': 'Swap',
      'nav.perp': 'Perps',
      'nav.earn': 'Earn',
      'nav.hub': 'Hub',
      // Home / Assets
      'home.totalBalance': 'Unified Portfolio (USD)',
      'home.masterAccount': 'NEAR Master Account',
      'home.registerNear': 'Register .near',
      'home.send': 'Send',
      'home.receive': 'Receive',
      'home.swap': 'Swap',
      'home.earn': 'Earn',
      'home.sendBtn': 'Send',
      'home.receiveBtn': 'Receive',
      'home.swapBtn': 'Swap',
      'home.assetsTitle': 'Unified Assets',
      'home.ptrPull': 'Pull down to refresh',
      'home.ptrRelease': 'Release to refresh',
      'home.ptrSyncing': 'Syncing multi-chain balances...',
      // Token Detail Sheet
      'detail.bridgeBtn': 'Bridge',
      'detail.receiveAddrLabel': 'Current Network Receive Address',
      'detail.chainBreakdownTitle': 'Balance by Network',
      'detail.historyTitle': 'Recent Activity',
      'detail.allBtn': 'All ›',
      'detail.openExplorerBtn': 'Explorer ↗',
      'sheet.txHistoryTitle': 'Transactions',
      'sheet.txDetailTitle': 'Transaction Details',
      'tx.explorerBtn': '↗ Explorer',
      'tx.txIdLabel': 'Transaction ID',
      'tx.copyTxIdBtn': 'Copy Tx ID',
      'tx.confirmationsLabel': 'Confirmations',
      'tx.blockLabel': 'Block',
      'tx.timeLabel': 'Time',
      'tx.outputTotalLabel': 'Total Output',
      'tx.feeLabel': 'Network Fee',
      'tx.netDeltaLabel': 'Your Net Change',
      'tx.inputsLabel': 'Inputs',
      'tx.outputsLabel': 'Outputs',
      'common.back': '‹ Back',
      // Swap
      'swap.title': 'Cross-Chain & DEX Swap',
      'swap.modeMarket': 'Swap',
      'swap.modeLimit': 'Limit',
      'swap.autoRouteLabel': 'Auto Route',
      'swap.fromLabel': 'Pay',
      'swap.toLabel': 'Receive',
      'swap.balanceLabel': 'Available',
      'swap.maxBtn': 'Max',
      'swap.recipientLabel': 'Destination Address',
      'swap.recipientPlaceholder': 'Auto-filled for destination chain',
      'swap.rateLabel': 'Rate',
      'swap.detailsLabel': 'Trade Details',
      'swap.detailsDefaultSummary': 'Slippage 1%',
      'swap.routeLabel': 'Route',
      'swap.slippageLabel': 'Slippage',
      'swap.gasReserveLabel': 'Target Gas Reserve',
      'swap.gasModeAuto': 'Default',
      'swap.gasModeExtra': 'Extra',
      'swap.feeLabel': 'Service Fee',
      'swap.executeBtn': 'Execute Swap',
      'swap.orderTitle': 'Cross-Chain Order Status',
      'swap.orderTxHash': 'Tx Hash',
      'swap.orderDepositAddr': 'Deposit Address',
      'swap.orderStatus': 'Status',
      'swap.orderRefresh': 'Refresh',
      'swap.orderSubmitHashPlaceholder': 'Paste deposit TxHash to speed up',
      'swap.orderSubmitHashBtn': 'Submit Hash',
      'swap.orderResumeBtn': 'Resume Next Step',
      'swap.orderDoneBtn': 'Done',
      // Limit Orders
      'limit.sellLabel': 'Sell',
      'limit.buyLabel': 'Buy',
      'limit.wrapBtn': 'Wrap',
      'limit.priceLabel': 'Target Price',
      'limit.marketRefLabel': 'Market',
      'limit.rateOffsetNow': 'Market',
      'limit.activeTickLabel': 'On-Chain Tick',
      'limit.stepDown': '− Tick',
      'limit.stepUp': '+ Tick',
      'limit.splitTicksLabel': 'Split Across 2 Ticks',
      'limit.expiryLabel': 'Expiry',
      'limit.exp1d': '1D',
      'limit.exp7d': '7D',
      'limit.exp30d': '30D',
      'limit.estReceive': 'Est. Receive',
      'limit.gasLabel': 'Network Fee',
      'limit.depositLabel': 'Deposit (Refundable)',
      'limit.minOrderLabel': 'Minimum Order',
      'limit.submitBtn': 'Place Limit Order',
      'limit.ordersTitle': 'Limit Orders',
      'limit.tabActive': 'Active',
      'limit.tabHistory': 'History',
      // Perps / Hyperliquid
      'perp.equityLabel': 'Perp Equity',
      'perp.availMarginLabel': 'Available Margin',
      'perp.upnlLabel': 'Unrealized PnL',
      'perp.depositBtn': 'Deposit',
      'perp.withdrawBtn': 'Withdraw',
      'perp.spotPendingPrefix': 'Deposit Arrived:',
      'perp.transferToPerpBtn': 'Move to Trading (Free)',
      'perp.vol24hLabel': '24h Vol',
      'perp.oiLabel': 'Open Interest',
      'perp.highLowLabel': 'High / Low',
      'perp.fundingRateLabel': 'Funding (1h)',
      'perp.lsRatioLabel': 'Global Account L/S Ratio',
      'perp.chartBtn': 'Chart',
      'perp.orderbookTitle': 'Orderbook',
      'perp.obBidPx': 'Bid',
      'perp.obAskPx': 'Ask',
      'perp.longBtn': 'Long',
      'perp.shortBtn': 'Short',
      'perp.isolatedBtn': 'Isolated',
      'perp.crossBtn': 'Cross',
      'perp.leverageLabel': 'Leverage',
      'perp.marketBtn': 'Market',
      'perp.limitBtn': 'Limit',
      'perp.limitPriceLabel': 'Limit Price',
      'perp.marginInputLabel': 'Margin (USDC)',
      'perp.tpslLabel': 'TP / SL (Optional)',
      'perp.tpPlaceholder': 'Take Profit px',
      'perp.slPlaceholder': 'Stop Loss px',
      'perp.notionalLabel': 'Notional',
      'perp.sizeLabel': 'Size',
      'perp.liqEstLabel': 'Est. Liq. Price',
      'perp.minOrderLabel': 'Min Order',
      'perp.minOrderVal': '$10 USDC',
      'perp.gasLabel': 'Network Fee',
      'perp.gasZeroVal': '0 Gas',
      'perp.submitLongBtn': 'Open Long',
      'perp.submitShortBtn': 'Open Short',
      'perp.tabPositions': 'Positions',
      'perp.tabOrders': 'Open Orders',
      'perp.tabFills': 'Fills',
      'perp.marketsSheetTitle': 'Select Perp Market',
      'perp.marketSearchPlaceholder': 'Search market, e.g. BTC, ETH, SOL, HYPE...',
      'perp.mktFilterHot': 'Hot',
      'perp.mktFilterAll': 'All',
      'perp.mktFilterGainers': 'Gainers',
      'perp.mktFilterVol': 'Volume',
      'perp.depositSheetTitle': 'Deposit Funds',
      'perp.withdrawSheetTitle': 'Withdraw to Wallet',
      'perp.fundingTabOneClick': 'Cross-Chain',
      'perp.fundingTabArb': 'Arbitrum USDC',
      'perp.ocOriginLabel': 'Pay With',
      'perp.ocAmountLabel': 'Amount',
      'perp.ocEstReceiveLabel': 'Est. Receive (USDC)',
      'perp.ocTargetAddrLabel': 'Trading Account',
      'perp.ocDepositBtn': 'Confirm Cross-Chain Deposit',
      'perp.ocEmptyTitle': 'No Direct Cross-Chain Asset Available',
      'perp.ocEmptyDesc': 'Supports direct deposit from NEAR, SOL, USDC, USDT, ETH, BTC, etc. Swap PRL first in Swap.',
      'perp.goSwapBtn': 'Swap to USDC / NEAR',
      'perp.arbUsdcBalLabel': 'Arbitrum USDC Avail',
      'perp.arbEthBalLabel': 'Arbitrum ETH (Gas)',
      'perp.arbMinLabel': 'Min Deposit',
      'perp.arbMinVal': '5 USDC',
      'perp.arbAmountLabel': 'Amount (USDC)',
      'perp.arbDepositBtn': 'Confirm Arbitrum Deposit',
      'perp.perpWithdrawLabel': 'Withdrawable',
      'perp.withdrawDestLabel': 'Recipient (Arbitrum)',
      'perp.withdrawFeeLabel': 'Network Fee',
      'perp.withdrawFeeVal': '1 USDC (Min 2 USDC)',
      'perp.withdrawNetLabel': 'Est. Net Receive',
      'perp.withdrawAmountLabel': 'Withdraw Amount (USDC)',
      'perp.withdrawConfirmBtn': 'Verify & Withdraw',
      // Earn / Staking
      'earn.title': 'On-Chain Liquid Staking',
      'earn.refreshBtn': 'Refresh APY',
      'earnSearchPlaceholder': 'Search token, protocol, or contract (e.g. RHEA, JUP, NEAR, SOL, USDC)...',
      'earn.filterFeatured': 'Featured',
      'earn.filterAll': 'All Pools (21)',
      'earn.filterLending': '🏦 Lending & Earn',
      'earn.filterNear': 'NEAR & Rhea',
      'earn.filterSol': 'Solana & JUP',
      'earn.filterEvm': 'EVM & Arc',
      'earn.lockLabel': 'Lock Period',
      'earn.tvlLabel': 'Total Staked (TVL)',
      'earn.stakersLabel': 'Stakers',
      'earn.apyLabel': 'Live APY',
      'earn.rateLabel': 'Rate',
      'earn.amountLabel': 'Stake Amount',
      'earn.estReceive': 'Est. Receive',
      'earn.stakeBtn': 'Stake On-Chain',
      'earn.myPositionsTitle': 'My Staking Positions',
      // Hub
      'hub.nearDomainTitle': 'NEAR (.near) Account Registration & Binding',
      'hub.nearDomainCurrent': 'Active Master Account',
      'hub.nearDomainPlaceholder': 'Enter desired name, e.g. alice.near',
      'hub.nearDomainAuthPlaceholder': 'Optional: original phrase/key of that .near to auto-authorize',
      'hub.nearDomainRegisterBtn': 'Lossless Register (0.05 NEAR)',
      'hub.nearDomainBindBtn': 'Bind Account',
      'hub.nearAcctMenuTitle': 'NEAR Account & Keys',
      'hub.nearAcctMenuSub': 'Register .near / Manage Keys',
      'hub.addrMenuTitle': 'Multi-Chain Addresses',
      'hub.addrMenuSub': 'View & copy all chain addresses',
      'hub.miningMenuTitle': 'Pearl Mining Pro',
      'hub.langTitle': 'Language',
      'hub.mpcTitle': 'Multi-Chain Derivation & Signing',
      'hub.mpcPathLabel': 'Derivation Path',
      'hub.mpcDerivedAddr': 'Derived Address',
      'hub.mpcPayloadPlaceholder': 'Enter message or 32-byte hex digest to sign',
      'hub.mpcSignBtn': 'Sign Message',
      'hub.miningTitle': '⛏️ Pearl Deep Mining Telemetry',
      'hub.miningSubtitle': 'Multi-pool hashrate tracking, rig status & on-chain balance',
      'hub.miningOpenBtn': 'Open Mining Pro',
      'hub.keysTitle': 'NEAR Master & Multi-Chain Addresses',
      'hub.manageWalletsBtn': 'Switch / Add Wallet',
      'hub.backupKeysBtn': 'Backup Phrase & Master Keys',
      'hub.contactsTitle': 'Address Book',
      'hub.contactsOpenBtn': 'Manage Contacts',
      'hub.wcTitle': 'WalletConnect v2',
      'hub.wcOpenBtn': 'Manage DApp Sessions',
      'hub.solRentTitle': 'Solana Rent & Dust Reclaim',
      'hub.solRentOpenBtn': 'Scan & Reclaim',
      'hub.nearStorageTitle': 'NEAR Storage Deposit Reclaim',
      'hub.nearStorageOpenBtn': 'Scan & Reclaim',
      'hub.securityTitle': 'Security & Preferences',
      'hub.pinBtn': 'Set / Change PIN',
      'hub.langBtn': 'Language (中/EN)',
      'hub.accessKeysBtn': 'NEAR Access Keys & Seed Rotation',
      'hub.bioCardTitle': 'Security',
      'hub.bioSetPinBtn': 'Set PIN',
      // Sheets
      'sheet.sendTitle': 'Send',
      'sheet.sendAssetLabel': 'Asset',
      'sheet.sendSourceLabel': 'Source Network',
      'sheet.sendToLabel': 'Recipient Address (Auto-Detect)',
      'sheet.sendToPlaceholder': 'Enter .near / 0x / Solana / prl1p / bc1 address',
      'sheet.sendEvmChainLabel': 'Destination EVM Network',
      'sheet.sendAmountLabel': 'Amount',
      'sheet.sendConfirmBtn': 'Sign & Broadcast',
      'sheet.receiveTitle': 'Multi-Chain Receive',
      'sheet.receiveCopyBtn': 'Copy Address',
      'sheet.tokenPickerTitle': 'Select Token',
      'sheet.tokenPickerSearch': 'Search symbol or contract',
      'sheet.miningTitle': 'Deep Mining Telemetry',
      'sheet.miningAddrPlaceholder': 'Enter prl1p... miner address',
      'sheet.miningQueryBtn': 'Query',
      'sheet.miningSaveBtn': 'Save',
      'sheet.miningPoolAuto': 'Auto',
      'sheet.miningPoolOnchain': 'On-Chain',
      'sheet.miningHash30m': '30m Hashrate',
      'sheet.miningHash3h': '3h Avg',
      'sheet.miningHash24h': '24h Avg',
      'sheet.miningUnpaid': 'Unpaid PRL',
      'sheet.miningShareRate': 'Share Accept',
      'sheet.miningWorkersTitle': 'Per-Worker Rig Status',
      'sheet.miningColRig': 'Rig',
      'sheet.miningColStatus': 'Status',
      'sheet.miningColShares': 'Shares',
      'sheet.miningPayoutsTitle': 'Payout History',
      'sheet.wcTitle': 'WalletConnect v2',
      'sheet.wcProjectIdPlaceholder': 'Enter Reown / WalletConnect Project ID',
      'sheet.wcSaveIdBtn': 'Save ID',
      'sheet.wcUriPlaceholder': 'Paste wc: pairing URI',
      'sheet.wcPairBtn': 'Pair',
      'sheet.wcApproveBtn': 'Approve',
      'sheet.wcRejectBtn': 'Reject',
      'sheet.wcSessionsTitle': 'Active Sessions',
      'sheet.contactsTitle': 'Address Book',
      'sheet.contactsNamePlaceholder': 'Label',
      'sheet.contactsAddrPlaceholder': 'Address (.near / 0x / Solana / prl1p / bc1)',
      'sheet.contactsAddBtn': 'Save Contact',
      'sheet.walletsTitle': 'Wallets',
      'sheet.walletsCreateBtn': 'New Wallet',
      'sheet.walletsImportBtn': 'Import Phrase',
      'sheet.keysTitle': 'NEAR Access Keys',
      'sheet.keysAccountLabel': 'Active Account',
      'sheet.keysListTitle': 'On-Chain Access Keys',
      'sheet.keysRotateTitle': 'Rotate Seed / Upgrade Key',
      'sheet.keysRotatePlaceholder': 'Generate a new phrase below or paste an existing one',
      'sheet.keysGenSeedBtn': 'Generate Phrase',
      'sheet.keysAddOnlyBtn': 'Add Key Only (Keep Old)',
      'sheet.keysRotateConfirmBtn': 'Rotate Key & Delete Old',
      'sheet.addressesTitle': 'Multi-Chain Addresses',
      'sheet.nearAcctTitle': 'NEAR Account & Keys',
      'near.balanceLabel': 'Balance',
      'near.unactivatedGuide': 'Fund ≥ 0.055 NEAR to your implicit address to register .near. Empty implicit account is deleted to sweep 100% balance + deposit.',
      'near.checkAvailBtn': 'Check',
      'near.bindToggleBtn': 'Bind Existing .near Account ▾',
      'wc.advancedToggle': 'Advanced: Project ID ▾',
      'sheet.solRentTitle': 'Solana Rent & Dust Reclaim',
      'sheet.solRentSummaryLabel': 'Scan Result',
      'sheet.solRentNote': 'Closes empty token accounts or burns checked dust tokens to reclaim SOL rent. Burned tokens cannot be recovered.',
      'sheet.solRentExecuteBtn': 'Reclaim Selected SOL',
      'sheet.nearStorageTitle': 'NEAR Storage Deposit Reclaim',
      'sheet.nearStorageSummaryLabel': 'Scan Result',
      'sheet.nearStorageNote': 'Unregisters zero-balance NEP-141 token contracts to reclaim NEAR storage deposits (~0.00018 NEAR gas each).',
      'sheet.nearStorageExecuteBtn': 'Reclaim Storage Deposits',
      'sheet.backupTitle': 'Seed Phrase & Master Keys',
      'sheet.pinTitle': 'Security PIN',
      'sheet.pinPlaceholder': 'Enter 4-6 digit PIN',
      'sheet.pinSaveBtn': 'Save PIN',
      'sheet.authTitle': 'Verification',
      'sheet.authBiometricBtn': '👤 Biometrics',
      'sheet.authPinHint': 'Enter PIN',
      'sheet.authCancelBtn': 'Cancel',
      'lock.title': 'Wallet Locked',
      'lock.hint': 'Unlock with Biometrics or Device Passcode',
      'lock.unlockBtn': 'Unlock',
      'lock.pinFallbackBtn': 'Use Wallet PIN',
      'common.copy': 'Copy',
      'common.close': 'Close',
      'common.paste': 'Paste',
      'common.contacts': 'Contacts',
      'common.refresh': 'Refresh',
      'common.back': '← Back'
    }
  };

  // ======================== Unified Store Object ========================

  const savedLang = String(safeStorageGet(LANG_STORAGE_KEY) || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
  const _langListeners = [];

  const state = {
    wallets: [],
    activeWalletId: null,
    activeTab: 'wallet',
    expandedSymbol: null,
    lang: savedLang,
    currentLang: savedLang,
    pricesUpdatedAt: null,
    liveTokens: [],
    dynamicSolTokens: [],
    favoriteTokenIds: [...DEFAULT_FAVORITE_TOKEN_IDS],
    contacts: [],
    pendingMnemonic: '',

    swap: {
      panelMode: 'market', // 'market' | 'limit'
      routeType: 'auto', // 'same_chain_dex' | 'cross_chain' | 'auto'
      fromAssetId: 'nep141:wrap.near',
      toAssetId: 'nep141:sol.omft.near',
      amountIn: '',
      amountOut: '',
      slippageBps: 100,
      gasReserveMode: 'auto',
      recipientAddress: '',
      quoteData: null,
      quoteSource: null,
      rateInverted: false,
      activeOrder: null,
      pickerSide: 'from',
      pickerChainFilter: 'all',
      pickerSearch: ''
    },

    limit: {
      chain: 'near',
      sellContract: 'token.rhealab.near',
      buyContract: 'otoken.rhealab.near',
      amountIn: '',
      targetRate: '',
      priceInverted: null,
      snappedPoint: null,
      splitTwoTicks: false,
      expiryDays: 7,
      ordersTab: 'active',
      pickerSide: null,
      liveMarketRate: null,
      poolInfo: null,
      dclStorageRegistered: null,
      evmAllowanceRaw: null,
      ordersActive: [],
      ordersHistory: [],
      ordersLoading: false,
      rateLimited: false,
      submitting: false,
      errorMsg: ''
    },

    staking: {
      selectedPoolId: 'rhea_rnear',
      filter: 'featured', // 'featured' | 'all' | 'lending' | 'near' | 'sol' | 'evm'
      search: '',
      lockDays: 181,
      amountIn: '',
      pools: null,
      updatedAt: null,
      lastTx: null,
      loading: false
    },

    perp: {
      markets: [],
      selectedCoin: 'BTC',
      account: null,
      orderbook: null,
      lsRatio: null,
      candles: [],
      chartInterval: '15m',
      showChart: false,
      marketFilter: 'hot',
      side: 'long',
      marginMode: 'isolated',
      orderType: 'market',
      leverage: 5,
      marginInput: '',
      limitPriceInput: '',
      tpInput: '',
      slInput: '',
      bottomTab: 'positions',
      fundingMode: 'deposit',
      fundingTab: 'oneclick',
      fundingOriginAssetId: '',
      fundingAmount: '',
      fundingQuote: null,
      fundingQuoteError: '',
      fundingQuoting: false,
      fundingSubmitting: false,
      marketSearch: '',
      submitting: false,
      loading: false,
      errorMsg: '',
      lastMarketSyncTs: 0,
      lastAccountSyncTs: 0
    },

    mining: {
      minerAddress: '',
      poolKey: 'auto', // 'auto' | 'kryptex' | 'herominers' | 'onchain'
      telemetry: null,
      networkStats: null,
      sweepDestAsset: 'PRL',
      sweepQuote: null,
      loading: false
    },

    txModal: {
      listTitle: '',
      items: [],
      sourceSheetId: 'sheet-token-detail',
      detailBackSheetId: 'sheet-token-detail',
      currentItem: null,
      detailData: null,
      detailLoading: false
    },

    send: {
      symbol: 'NEAR',
      chainKey: 'near',
      assetId: 'nep141:wrap.near',
      recipient: '',
      amount: '',
      detectedNetwork: null,
      quote: null
    },

    receive: {
      selectedNetwork: 'near'
    },

    wc: {
      projectId: safeStorageGet(WC_PROJECT_ID_STORAGE_KEY) || safeStorageGet(LEGACY_WC_PROJECT_ID_KEY) || '',
      client: null,
      initProjectId: '',
      pendingProposal: null,
      pendingRequest: null
    }
  };

  function t(zh, en) {
    return state.lang === 'en' ? en : zh;
  }

  function getActiveWallet() {
    if (!Array.isArray(state.wallets) || state.wallets.length === 0) return null;
    return state.wallets.find((w) => w && w.id === state.activeWalletId) || state.wallets[0] || null;
  }

  function serializeCompactErc20Map(rawMap) {
    const out = {};
    if (!rawMap || typeof rawMap !== 'object') return out;
    for (const [k, v] of Object.entries(rawMap)) {
      if (v && typeof v === 'object') {
        const ck = String(k).toLowerCase();
        out[ck] = out[ck] || {};
        for (const [c, bal] of Object.entries(v)) {
          if (typeof bal === 'number' && Number.isFinite(bal)) {
            out[ck][String(c).toLowerCase()] = bal;
          }
        }
      } else if (typeof v === 'number' && Number.isFinite(v)) {
        const sep = k.indexOf('_');
        if (sep > 0) {
          const ck = k.slice(0, sep).toLowerCase();
          const c = k.slice(sep + 1).toLowerCase();
          out[ck] = out[ck] || {};
          out[ck][c] = v;
        }
      }
    }
    return out;
  }

  let _saveWalletsTimer = null;

  function saveWallets() {
    if (_saveWalletsTimer && typeof clearTimeout === 'function') {
      clearTimeout(_saveWalletsTimer);
      _saveWalletsTimer = null;
    }
    const compactWallets = (state.wallets || []).map((w) => {
      if (!w || typeof w !== 'object') return w;
      const copy = { ...w };
      delete copy.multiBalances;
      delete copy.nearBalance;
      delete copy.balance;
      delete copy._needsSelfHealSave;
      copy.erc20Balances = serializeCompactErc20Map(w.erc20Balances);
      return copy;
    });
    return safeStorageSet(
      WALLETS_STORAGE_KEY,
      JSON.stringify({
        wallets: compactWallets,
        activeWalletId: state.activeWalletId
      })
    );
  }

  function saveWalletsDebounced(delayMs = 250) {
    if (typeof setTimeout !== 'function') {
      saveWallets();
      return;
    }
    if (_saveWalletsTimer) clearTimeout(_saveWalletsTimer);
    _saveWalletsTimer = setTimeout(() => {
      _saveWalletsTimer = null;
      saveWallets();
    }, delayMs);
  }

  function loadWallets() {
    const primaryRaw = safeStorageGet(WALLETS_STORAGE_KEY);
    let rawJson = primaryRaw;
    let migratedFromLegacy = false;

    if (primaryRaw === null) {
      rawJson = safeStorageGet(LEGACY_WALLETS_STORAGE_KEY);
      if (rawJson) migratedFromLegacy = true;
    }

    let parsed = null;
    if (rawJson) {
      try {
        parsed = JSON.parse(rawJson);
      } catch (_) {
        parsed = null;
      }
    }

    if (primaryRaw === null && (!parsed || !Array.isArray(parsed.wallets) || parsed.wallets.length === 0) && !migratedFromLegacy) {
      const legacyRaw = safeStorageGet(LEGACY_WALLETS_STORAGE_KEY);
      if (legacyRaw) {
        try {
          const legacyParsed = JSON.parse(legacyRaw);
          if (legacyParsed && Array.isArray(legacyParsed.wallets) && legacyParsed.wallets.length > 0) {
            parsed = legacyParsed;
            migratedFromLegacy = true;
          }
        } catch (_) {}
      }
    }

    const rawList = (parsed && Array.isArray(parsed.wallets)) ? parsed.wallets : (Array.isArray(parsed) ? parsed : []);
    const unique = [];
    const seen = new Set();
    let anySelfHealed = false;

    for (const item of rawList) {
      const norm = normalizeWalletRecord(item);
      if (!norm) continue;
      if (norm._needsSelfHealSave) {
        anySelfHealed = true;
        delete norm._needsSelfHealSave;
      }
      const dedupeKey = (norm.nearAddress || norm.address || norm.evmAddress || norm.id).toLowerCase();
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      unique.push(norm);
    }

    state.wallets = unique;
    const requestedActive = parsed && parsed.activeWalletId ? String(parsed.activeWalletId) : '';
    const activeExists = unique.some((w) => w.id === requestedActive);
    state.activeWalletId = activeExists ? requestedActive : (unique[0] ? unique[0].id : null);

    let savedAfterMigration = false;
    if ((migratedFromLegacy || anySelfHealed) && unique.length > 0) {
      savedAfterMigration = Boolean(saveWallets());
    }
    if (migratedFromLegacy && unique.length > 0 && savedAfterMigration) {
      safeStorageRemove(LEGACY_WALLETS_STORAGE_KEY);
    }
    return state.wallets;
  }

  function loadContacts() {
    let raw = safeStorageGet(CONTACTS_STORAGE_KEY);
    let migrated = false;
    if (raw === null) {
      raw = safeStorageGet(LEGACY_CONTACTS_STORAGE_KEY);
      if (raw) migrated = true;
    }
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      state.contacts = Array.isArray(parsed)
        ? parsed.filter((c) => c && typeof c.address === 'string' && c.address.trim()).map((c) => ({
            id: String(c.id || `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
            name: String(c.name || '').trim() || t('联系人', 'Contact'),
            address: String(c.address).trim(),
            network: String(c.network || '').toLowerCase() || null,
            createdAt: c.createdAt || new Date().toISOString()
          }))
        : [];
      if (migrated && state.contacts.length > 0 && saveContacts()) {
        safeStorageRemove(LEGACY_CONTACTS_STORAGE_KEY);
      }
    } catch (_) {
      state.contacts = [];
    }
    return state.contacts;
  }

  function saveContacts() {
    return safeStorageSet(CONTACTS_STORAGE_KEY, JSON.stringify(state.contacts || []));
  }

  function loadFavoriteTokens() {
    const raw = safeStorageGet(FAV_TOKENS_STORAGE_KEY);
    if (!raw) {
      state.favoriteTokenIds = [...DEFAULT_FAVORITE_TOKEN_IDS];
      return state.favoriteTokenIds;
    }
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        state.favoriteTokenIds = parsed
          .map((x) => String(x || '').trim())
          .filter(Boolean);
        return state.favoriteTokenIds;
      }
    } catch (_) {}
    state.favoriteTokenIds = [...DEFAULT_FAVORITE_TOKEN_IDS];
    return state.favoriteTokenIds;
  }

  function saveFavoriteTokens() {
    safeStorageSet(FAV_TOKENS_STORAGE_KEY, JSON.stringify(state.favoriteTokenIds || []));
  }

  function _collectStaticCatalogTokens(reg) {
    const out = [];
    if (!reg) return out;
    if (Array.isArray(reg.UNIFIED_CORE_TOKENS)) out.push(...reg.UNIFIED_CORE_TOKENS);
    if (reg.DEX_CHAIN_TOKENS && typeof reg.DEX_CHAIN_TOKENS === 'object') {
      for (const list of Object.values(reg.DEX_CHAIN_TOKENS)) {
        if (Array.isArray(list)) out.push(...list);
      }
    }
    return out;
  }

  function _isStaleLocalSvgLogo(tok, reg) {
    if (!tok || typeof tok.logoURI !== 'string' || !tok.logoURI.startsWith('data:image/svg+xml')) return false;
    const symU = String(tok.symbol || '').trim().replace(/^\$/, '').toUpperCase();
    const mapped = reg && reg.TOKEN_ICON_MAP && (reg.TOKEN_ICON_MAP[symU] || '');
    if (mapped && /^https?:\/\//i.test(mapped)) return true;
    if (tok.logoURI.includes('dmlld0JveD0iMCAwIDMyIDMyIg') || tok.logoURI.includes('viewBox="0 0 32 32"')) return true;
    return false;
  }

  function loadCachedLiveTokens() {
    const raw = safeStorageGet(LIVE_TOKENS_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const updatedAt = parsed && typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
      if (updatedAt && (Date.now() - updatedAt > 24 * 3600_000)) {
        return null;
      }
      const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.tokens) ? parsed.tokens : null);
      const dexPrices = (parsed && parsed.dexPrices && typeof parsed.dexPrices === 'object') ? parsed.dexPrices : null;
      const dexSymPrices = (parsed && parsed.dexSymPrices && typeof parsed.dexSymPrices === 'object') ? parsed.dexSymPrices : null;
      const reg = (typeof globalThis !== 'undefined' && globalThis.NearCATokens) || (typeof window !== 'undefined' && window.NearCATokens);
      if (reg && (dexPrices || dexSymPrices)) {
        for (const tok of _collectStaticCatalogTokens(reg)) {
          if (!tok || (typeof tok.price === 'number' && Number.isFinite(tok.price) && tok.price > 0)) continue;
          const bc = String(tok.blockchain || '').trim().toLowerCase();
          const ca = String(tok.contractAddress || '').trim().toLowerCase();
          const aid = String(tok.assetId || '').trim().toLowerCase();
          const sym = String(tok.symbol || '').trim().toUpperCase().replace(/^\$/, '');
          const p = (dexPrices && ca && dexPrices[`${bc}|${ca}`])
            || (dexPrices && aid && dexPrices[`${bc}|${aid}`])
            || (dexSymPrices && sym && dexSymPrices[sym])
            || 0;
          if (typeof p === 'number' && Number.isFinite(p) && p > 0) {
            tok.price = p;
          }
        }
      }
      if (Array.isArray(list) && list.length > 0) {
        for (const item of list) {
          if (_isStaleLocalSvgLogo(item, reg)) item.logoURI = '';
        }
        if (!Array.isArray(state.liveTokens) || state.liveTokens.length === 0) {
          state.liveTokens = list;
        }
        if (updatedAt && !state.pricesUpdatedAt) {
          state.pricesUpdatedAt = updatedAt;
        }
        if (reg && typeof reg.setLiveDefuseTokens === 'function') {
          reg.setLiveDefuseTokens(list);
        }
        const intents = (typeof globalThis !== 'undefined' && globalThis.NearCAIntents) || (typeof window !== 'undefined' && window.NearCAIntents);
        if (intents && typeof intents.seedLivePricesCache === 'function') {
          intents.seedLivePricesCache(list, updatedAt || Date.now());
        }
        return list;
      }
    } catch (_) {}
    return null;
  }

  function saveCachedLiveTokens(tokensList) {
    if (!Array.isArray(tokensList) || tokensList.length === 0) return;
    try {
      const reg = (typeof globalThis !== 'undefined' && globalThis.NearCATokens) || (typeof window !== 'undefined' && window.NearCATokens);
      const dexPrices = {};
      const dexSymPrices = {};
      const recordDexPrice = (tok) => {
        if (!tok || typeof tok.price !== 'number' || !Number.isFinite(tok.price) || tok.price <= 0) return;
        const bc = String(tok.blockchain || '').trim().toLowerCase();
        const ca = String(tok.contractAddress || '').trim().toLowerCase();
        const aid = String(tok.assetId || '').trim().toLowerCase();
        const sym = String(tok.symbol || '').trim().toUpperCase().replace(/^\$/, '');
        if (bc && ca) dexPrices[`${bc}|${ca}`] = tok.price;
        if (bc && aid) dexPrices[`${bc}|${aid}`] = tok.price;
        if (sym && !dexSymPrices[sym]) dexSymPrices[sym] = tok.price;
      };
      for (const tok of _collectStaticCatalogTokens(reg)) recordDexPrice(tok);

      const deduped = [];
      const seen = new Set();
      for (const item of tokensList) {
        if (!item || !item.assetId) continue;
        recordDexPrice(item);
        const key = String(item.assetId).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }
      deduped.sort((a, b) => {
        const aPriced = typeof a.price === 'number' && Number.isFinite(a.price) && a.price > 0 ? 1 : 0;
        const bPriced = typeof b.price === 'number' && Number.isFinite(b.price) && b.price > 0 ? 1 : 0;
        return bPriced - aPriced;
      });
      const capped = deduped.slice(0, 500).map((t) => {
        const logo = String(t.logoURI || '');
        return {
          assetId: t.assetId,
          symbol: t.symbol,
          name: t.name,
          blockchain: t.blockchain,
          contractAddress: t.contractAddress || null,
          decimals: t.decimals,
          networkName: t.networkName || undefined,
          category: t.category || undefined,
          coingeckoId: t.coingeckoId || undefined,
          price: typeof t.price === 'number' ? t.price : null,
          priceUpdatedAt: t.priceUpdatedAt || null,
          logoURI: _isStaleLocalSvgLogo(t, reg) ? '' : (logo.length <= 2048 ? logo : '')
        };
      });
      const payload = {
        updatedAt: Date.now(),
        tokens: capped,
        dexPrices,
        dexSymPrices
      };
      safeStorageSet(LIVE_TOKENS_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function loadCachedStakingMetrics() {
    const raw = safeStorageGet(STAKING_METRICS_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const updatedAt = parsed && typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0;
      if (updatedAt && (Date.now() - updatedAt > 24 * 3600_000)) {
        return null;
      }
      const byId = parsed && parsed.pools && typeof parsed.pools === 'object' ? parsed.pools : null;
      if (!byId) return null;
      const contracts = (typeof globalThis !== 'undefined' && globalThis.NearCAContracts) || (typeof window !== 'undefined' && window.NearCAContracts);
      const pools = (contracts && Array.isArray(contracts.STAKING_POOLS)) ? contracts.STAKING_POOLS : null;
      if (pools) {
        for (const p of pools) {
          const cached = p && byId[p.id];
          if (!cached || typeof cached !== 'object') continue;
          if (p.apy === null && typeof cached.apy === 'number' && Number.isFinite(cached.apy)) p.apy = cached.apy;
          if (p.rate === null && typeof cached.rate === 'number' && Number.isFinite(cached.rate)) p.rate = cached.rate;
          if (!p.tvlText && typeof cached.tvlText === 'string' && cached.tvlText) p.tvlText = cached.tvlText;
          if ((p.tvlTokenAmount === undefined || p.tvlTokenAmount === null) && typeof cached.tvlTokenAmount === 'number' && Number.isFinite(cached.tvlTokenAmount)) p.tvlTokenAmount = cached.tvlTokenAmount;
          if ((p.tvlUsd === undefined || p.tvlUsd === null) && typeof cached.tvlUsd === 'number' && Number.isFinite(cached.tvlUsd)) p.tvlUsd = cached.tvlUsd;
          if (p.stakersCount === null && typeof cached.stakersCount === 'number' && Number.isFinite(cached.stakersCount)) p.stakersCount = cached.stakersCount;
          if (!p.lockTiers && Array.isArray(cached.lockTiers)) p.lockTiers = cached.lockTiers;
          if (!p.rateRangeText && typeof cached.rateRangeText === 'string') p.rateRangeText = cached.rateRangeText;
        }
        if (!state.staking.pools) state.staking.pools = pools;
      }
      if (updatedAt && !state.staking.updatedAt) {
        state.staking.updatedAt = updatedAt;
      }
      return byId;
    } catch (_) {}
    return null;
  }

  function saveCachedStakingMetrics(pools) {
    if (!Array.isArray(pools) || pools.length === 0) return;
    try {
      const map = {};
      for (const p of pools) {
        if (!p || !p.id) continue;
        map[p.id] = {
          apy: typeof p.apy === 'number' && Number.isFinite(p.apy) ? p.apy : null,
          rate: typeof p.rate === 'number' && Number.isFinite(p.rate) ? p.rate : null,
          tvlText: p.tvlText || null,
          tvlTokenAmount: typeof p.tvlTokenAmount === 'number' && Number.isFinite(p.tvlTokenAmount) ? p.tvlTokenAmount : null,
          tvlUsd: typeof p.tvlUsd === 'number' && Number.isFinite(p.tvlUsd) ? p.tvlUsd : null,
          stakersCount: typeof p.stakersCount === 'number' && Number.isFinite(p.stakersCount) ? p.stakersCount : null,
          lockTiers: Array.isArray(p.lockTiers) ? p.lockTiers : null,
          rateRangeText: p.rateRangeText || null
        };
      }
      const now = Date.now();
      state.staking.updatedAt = now;
      safeStorageSet(STAKING_METRICS_STORAGE_KEY, JSON.stringify({ updatedAt: now, pools: map }));
    } catch (_) {}
  }

  function toggleFavoriteTokenId(assetId) {
    const id = String(assetId || '').trim();
    if (!id) return false;
    const list = Array.isArray(state.favoriteTokenIds) ? [...state.favoriteTokenIds] : [];
    const lower = id.toLowerCase();
    const idx = list.findIndex((x) => String(x || '').toLowerCase() === lower);
    let nowFav = false;
    if (idx >= 0) {
      list.splice(idx, 1);
      nowFav = false;
    } else {
      list.unshift(id);
      nowFav = true;
    }
    state.favoriteTokenIds = list.slice(0, 32);
    saveFavoriteTokens();
    return nowFav;
  }

  function onLanguageChange(fn) {
    if (typeof fn === 'function' && !_langListeners.includes(fn)) {
      _langListeners.push(fn);
    }
  }

  function applyLanguage(lang) {
    const normalized = String(lang || state.lang || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
    state.lang = normalized;
    state.currentLang = normalized;
    safeStorageSet(LANG_STORAGE_KEY, normalized);

    const dict = i18nDict[normalized] || i18nDict.zh;
    if (typeof document !== 'undefined' && document && typeof document.querySelectorAll === 'function') {
      document.documentElement.lang = normalized === 'en' ? 'en' : 'zh-CN';
      const nodes = document.querySelectorAll('[data-i18n]');
      nodes.forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key && dict[key] !== undefined) {
          el.textContent = dict[key];
        }
      });
      const phNodes = document.querySelectorAll('[data-i18n-placeholder]');
      phNodes.forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key && dict[key] !== undefined) {
          el.setAttribute('placeholder', dict[key]);
        }
      });
    }

    for (const listener of _langListeners) {
      try {
        listener(normalized);
      } catch (_) {}
    }
    return normalized;
  }

  function setLanguage(lang) {
    return applyLanguage(lang);
  }

  function saveSwapPair() {
    safeStorageSet(
      SWAP_PAIR_STORAGE_KEY,
      JSON.stringify({
        fromAssetId: state.swap.fromAssetId || '',
        toAssetId: state.swap.toAssetId || ''
      })
    );
  }

  function loadSwapPair() {
    try {
      const raw = safeStorageGet(SWAP_PAIR_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.fromAssetId) state.swap.fromAssetId = String(parsed.fromAssetId);
        if (parsed.toAssetId) state.swap.toAssetId = String(parsed.toAssetId);
      }
    } catch (_) {}
  }

  function saveActiveSwapOrder(order) {
    try {
      if (!order || typeof order !== 'object') {
        safeStorageSet(ACTIVE_SWAP_ORDER_STORAGE_KEY, '');
        return;
      }
      safeStorageSet(ACTIVE_SWAP_ORDER_STORAGE_KEY, JSON.stringify(order));
    } catch (_) {}
  }

  function loadActiveSwapOrder() {
    try {
      const raw = safeStorageGet(ACTIVE_SWAP_ORDER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.createdAt) {
        if (Date.now() - Number(parsed.createdAt) > 24 * 3600_000) {
          safeStorageSet(ACTIVE_SWAP_ORDER_STORAGE_KEY, '');
          return null;
        }
        state.swap.activeOrder = parsed;
        return parsed;
      }
    } catch (_) {}
    return null;
  }

  function clearSavedSwapOrder() {
    try {
      safeStorageSet(ACTIVE_SWAP_ORDER_STORAGE_KEY, '');
    } catch (_) {}
  }

  function initState() {
    loadWallets();
    loadContacts();
    loadFavoriteTokens();
    loadCachedLiveTokens();
    loadCachedStakingMetrics();
    loadSwapPair();
    loadActiveSwapOrder();
    applyLanguage(state.lang);
    return state;
  }

  // Attach methods cleanly onto state object so both NearCAState.xxx and state.xxx work
  state.WALLETS_STORAGE_KEY = WALLETS_STORAGE_KEY;
  state.LEGACY_WALLETS_STORAGE_KEY = LEGACY_WALLETS_STORAGE_KEY;
  state.CONTACTS_STORAGE_KEY = CONTACTS_STORAGE_KEY;
  state.FAV_TOKENS_STORAGE_KEY = FAV_TOKENS_STORAGE_KEY;
  state.LIVE_TOKENS_STORAGE_KEY = LIVE_TOKENS_STORAGE_KEY;
  state.STAKING_METRICS_STORAGE_KEY = STAKING_METRICS_STORAGE_KEY;
  state.DEFAULT_FAVORITE_TOKEN_IDS = DEFAULT_FAVORITE_TOKEN_IDS;
  state.i18nDict = i18nDict;
  state.t = t;
  state.setLanguage = setLanguage;
  state.applyLanguage = applyLanguage;
  state.onLanguageChange = onLanguageChange;
  state.getActiveWallet = getActiveWallet;
  state.saveWallets = saveWallets;
  state.saveWalletsDebounced = saveWalletsDebounced;
  state.loadWallets = loadWallets;
  state.hasWalletPin = hasWalletPin;
  state.setWalletPinAsync = setWalletPinAsync;
  state.verifyWalletPinAsync = verifyWalletPinAsync;
  state.saveSwapPair = saveSwapPair;
  state.loadSwapPair = loadSwapPair;
  state.saveActiveSwapOrder = saveActiveSwapOrder;
  state.loadActiveSwapOrder = loadActiveSwapOrder;
  state.clearSavedSwapOrder = clearSavedSwapOrder;
  state.loadContacts = loadContacts;
  state.saveContacts = saveContacts;
  state.loadFavoriteTokens = loadFavoriteTokens;
  state.saveFavoriteTokens = saveFavoriteTokens;
  state.loadCachedLiveTokens = loadCachedLiveTokens;
  state.saveCachedLiveTokens = saveCachedLiveTokens;
  state.loadCachedStakingMetrics = loadCachedStakingMetrics;
  state.saveCachedStakingMetrics = saveCachedStakingMetrics;
  state.toggleFavoriteTokenId = toggleFavoriteTokenId;
  state.normalizeWalletRecord = normalizeWalletRecord;
  state.recomputeWalletMpcAddresses = recomputeWalletMpcAddresses;
  state.syncWalletCompatBalances = syncWalletCompatBalances;
  state.setWalletErc20Balance = setWalletErc20Balance;
  state.getWalletErc20Balance = getWalletErc20Balance;
  state.createEmptyNativeBalances = createEmptyNativeBalances;
  state.initState = initState;

  if (root) {
    root.NearCAState = state;
    root.state = state;
    root.NearCA = root.NearCA || {};
    root.NearCA.state = state;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.NearCAState = state;
    globalThis.state = state;
    globalThis.NearCA = globalThis.NearCA || {};
    globalThis.NearCA.state = state;
  }
  if (typeof window !== 'undefined') {
    window.NearCAState = state;
    window.state = state;
    window.NearCA = window.NearCA || {};
    window.NearCA.state = state;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = state;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
