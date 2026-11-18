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

  const NATIVE_BALANCE_KEYS = ['near', 'sol', 'eth', 'base', 'arb', 'bsc', 'hype', 'hood', 'arc', 'prl', 'btc'];

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

  function safeStorageSet(key, val) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
        localStorage.setItem(key, val);
      }
    } catch (_) {}
  }

  function createEmptyNativeBalances() {
    return {
      near: null,
      sol: null,
      eth: null,
      base: null,
      arb: null,
      bsc: null,
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
    let btcAddress = String(raw.btcAddress || raw.mpcBtcAddress || '').trim();

    const cryptoEngine = getCryptoEngine();
    const mnemonicClean = String(raw.mnemonic || '').trim();
    if (mnemonicClean && cryptoEngine && typeof cryptoEngine.derivePearlFromSeed === 'function') {
      try {
        const pearlDerived = cryptoEngine.derivePearlFromSeed(mnemonicClean, "m/86'/808276'/0'/0/0", true);
        if (pearlDerived && pearlDerived.address) {
          pearlAddress = pearlDerived.address;
          privateKeyHex = pearlDerived.privateKeyHex || privateKeyHex;
          tweakedPrivateKeyHex = pearlDerived.tweakedPrivateKeyHex || tweakedPrivateKeyHex;
        }
      } catch (_) {}
    }

    if (activeNearId && cryptoEngine) {
      if (typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
        try {
          const mpcAll = cryptoEngine.deriveNearMpcAllAddresses(activeNearId);
          mpcEvmAddress = mpcAll.evmAddress;
          evmAddress = mpcAll.evmAddress;
          solAddress = mpcAll.solAddress;
          btcAddress = mpcAll.btcAddress;
        } catch (_) {}
      } else if (!mpcEvmAddress && typeof cryptoEngine.deriveNearMpcEvmAddress === 'function') {
        try {
          const derived = cryptoEngine.deriveNearMpcEvmAddress(activeNearId, 'ethereum-1');
          if (derived && derived.mpcEvmAddress) {
            mpcEvmAddress = derived.mpcEvmAddress;
            evmAddress = derived.mpcEvmAddress;
          }
        } catch (_) {}
      }
    }

    const wallet = {
      id: String(raw.id || `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      name: String(raw.name || 'NEAR Account'),
      mnemonic: mnemonicClean,
      pin: String(raw.pin || ''),
      biometricEnabled: raw.biometricEnabled !== undefined ? Boolean(raw.biometricEnabled) : true,
      biometricLocked: Boolean(raw.biometricLocked),
      webauthnCredentialId: String(raw.webauthnCredentialId || '').trim(),
      // Primary NEAR CA Identity
      nearNamedAccount,
      nearAddress,
      nearPublicKey: String(raw.nearPublicKey || '').trim(),
      nearPrivateKey: String(raw.nearPrivateKey || '').trim(),
      nearPrivateSeedHex: String(raw.nearPrivateSeedHex || '').trim(),
      // External Chain Addresses Controlled by NEAR MPC (v1.signer) + Native BIP-86 Pearl Address
      mpcEvmAddress,
      evmAddress,
      solAddress,
      solPublicKey: solAddress,
      address: pearlAddress,
      privateKeyHex,
      tweakedPrivateKeyHex,
      btcAddress,
      qtcDepositAddress: String(raw.qtcDepositAddress || '').trim(),
      // Balances
      nearNep141Balances: (raw.nearNep141Balances && typeof raw.nearNep141Balances === 'object') ? { ...raw.nearNep141Balances } : {},
      intentsBalances: (raw.intentsBalances && typeof raw.intentsBalances === 'object') ? { ...raw.intentsBalances } : {},
      nativeBalances,
      splBalances: (raw.splBalances && typeof raw.splBalances === 'object') ? { ...raw.splBalances } : {},
      erc20Balances: normalizeErc20Map(raw.erc20Balances),
      nearStakingPositions: Array.isArray(raw.nearStakingPositions) ? raw.nearStakingPositions.slice() : [],
      solStakingPositions: Array.isArray(raw.solStakingPositions) ? raw.solStakingPositions.slice() : [],
      activityHistory: Array.isArray(raw.activityHistory) ? raw.activityHistory.slice(0, 100) : []
    };

    return syncWalletCompatBalances(wallet);
  }

  function recomputeWalletMpcAddresses(wallet) {
    if (!wallet || typeof wallet !== 'object') return wallet;
    const cryptoEngine = getCryptoEngine();
    if (wallet.mnemonic && cryptoEngine && typeof cryptoEngine.derivePearlFromSeed === 'function') {
      try {
        const pearlDerived = cryptoEngine.derivePearlFromSeed(wallet.mnemonic, "m/86'/808276'/0'/0/0", true);
        if (pearlDerived && pearlDerived.address) {
          wallet.address = pearlDerived.address;
          wallet.privateKeyHex = pearlDerived.privateKeyHex || wallet.privateKeyHex;
          wallet.tweakedPrivateKeyHex = pearlDerived.tweakedPrivateKeyHex || wallet.tweakedPrivateKeyHex;
        }
      } catch (_) {}
    }
    const activeNearId = String(wallet.nearNamedAccount || wallet.nearAddress || '').trim().toLowerCase();
    if (!activeNearId) return wallet;
    if (cryptoEngine && typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
      const mpcAll = cryptoEngine.deriveNearMpcAllAddresses(activeNearId);
      wallet.mpcEvmAddress = mpcAll.evmAddress;
      wallet.evmAddress = mpcAll.evmAddress;
      wallet.solAddress = mpcAll.solAddress;
      wallet.solPublicKey = mpcAll.solAddress;
      wallet.btcAddress = mpcAll.btcAddress;
    }
    return wallet;
  }

  // ======================== Bilingual i18n Dictionary ========================

  const i18nDict = {
    zh: {
      // Header
      'header.caBadge': 'NEAR CA',
      'header.mpcTitle': 'MPC 链签名',
      'header.wcBtn': 'WC',
      'header.langToggle': 'EN',
      // Onboarding
      'onboard.badge': 'NEAR 链抽象自托管账户',
      'onboard.title': '一个 NEAR 账户，畅通全链资产',
      'onboard.subtitle': '支持 NEAR Intents 0-Gas 跨链闪兑、MPC v1.signer 与多链合约直连',
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
      'home.syncIdle': '点击刷新链上余额',
      // Token Detail Sheet
      'detail.bridgeBtn': '跨链桥',
      'detail.receiveAddrLabel': '当前网络收款地址',
      'detail.chainBreakdownTitle': '分链余额明细',
      'detail.earnSectionTitle': '赚币 · 质押 · 存款',
      'detail.historyTitle': '代币变动与交易历史',
      'detail.openExplorerBtn': '前往浏览器 ↗',
      // Swap
      'swap.title': '全链统一闪兑',
      'swap.autoRouteLabel': '智能路由',
      'swap.fromLabel': '支付',
      'swap.toLabel': '获得',
      'swap.balanceLabel': '可用',
      'swap.maxBtn': '全部',
      'swap.recipientLabel': '目标链收款地址',
      'swap.recipientPlaceholder': '自动匹配当前主账户对应链地址',
      'swap.rateLabel': '参考汇率',
      'swap.routeLabel': '执行路由',
      'swap.slippageLabel': '滑点容差',
      'swap.executeBtn': '确认闪兑',
      'swap.orderTitle': '跨链订单跟踪',
      'swap.orderDepositAddr': '充值地址',
      'swap.orderStatus': '订单状态',
      'swap.orderRefresh': '刷新状态',
      'swap.orderSubmitHashPlaceholder': '粘贴外部转账 TxHash 加速确认',
      'swap.orderSubmitHashBtn': '提交凭证',
      'swap.orderDoneBtn': '完成',
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
      'hub.nearDomainRegisterBtn': '链上注册 (0.1 NEAR)',
      'hub.nearDomainBindBtn': '绑定已有账号',
      'hub.mpcTitle': 'NEAR MPC 链签名 (v1.signer)',
      'hub.mpcPathLabel': '派生路径',
      'hub.mpcDerivedAddr': 'MPC 派生 EVM 地址',
      'hub.mpcPayloadPlaceholder': '输入消息或 32 字节 Hex 哈希进行 MPC 签名',
      'hub.mpcSignBtn': '调用 v1.signer 签名',
      'hub.miningTitle': '⛏️ Pearl 矿工深度遥测与归集',
      'hub.miningSubtitle': '多矿池算力追踪、单机状态监控与 PRL 一键桥接至 .near',
      'hub.miningOpenBtn': '打开专业矿工面板',
      'hub.keysTitle': 'NEAR 主账户与 MPC 全链地址',
      'hub.manageWalletsBtn': '切换 / 新增钱包',
      'hub.backupKeysBtn': '导出助记词与 NEAR 主密钥',
      'hub.contactsTitle': '常用地址簿',
      'hub.contactsOpenBtn': '管理联系人',
      'hub.wcTitle': 'WalletConnect v2 授权',
      'hub.wcOpenBtn': '管理 DApp 连接',
      'hub.securityTitle': '安全与偏好设置',
      'hub.pinBtn': '设置 / 修改 PIN 密码',
      'hub.langBtn': '切换语言 (中/EN)',
      'hub.bioCardTitle': '安全验证',
      'hub.bioSetPinBtn': '设置安全 PIN',
      // Sheets
      'sheet.sendTitle': '跨链转账',
      'sheet.sendAssetLabel': '选择资产',
      'sheet.sendSourceLabel': '扣款网络',
      'sheet.sendToLabel': '收款地址（自动识别链类型）',
      'sheet.sendToPlaceholder': '输入 .near / 0x / Solana / prl1p 地址',
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
      'sheet.miningHash30m': '30m 算力',
      'sheet.miningHash3h': '3h 均值',
      'sheet.miningHash24h': '24h 均值',
      'sheet.miningUnpaid': '待结算 PRL',
      'sheet.miningShareRate': '份额接受率',
      'sheet.miningWorkersTitle': '矿机在线状态',
      'sheet.miningPayoutsTitle': '近期打款记录',
      'sheet.miningSweepTitle': '⚡ 一键归集挖矿 PRL 至 .near 主账户',
      'sheet.miningSweepAmountPlaceholder': '输入归集 PRL 数量',
      'sheet.miningSweepBtn': '生成归集订单',
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
      'sheet.contactsAddrPlaceholder': '钱包地址 (.near / 0x / Solana / prl1p)',
      'sheet.contactsAddBtn': '添加联系人',
      'sheet.walletsTitle': '多钱包管理',
      'sheet.walletsCreateBtn': '新建钱包',
      'sheet.walletsImportBtn': '导入助记词',
      'sheet.backupTitle': '助记词与 NEAR 主密钥备份',
      'sheet.pinTitle': '安全密码设置',
      'sheet.pinPlaceholder': '输入 4-6 位数字密码',
      'sheet.pinSaveBtn': '保存密码',
      'sheet.authTitle': '安全验证',
      'sheet.authBiometricBtn': '👤 生物识别',
      'sheet.authPinHint': '输入 PIN',
      'sheet.authCancelBtn': '取消验证',
      'common.copy': '复制',
      'common.close': '关闭',
      'common.paste': '粘贴',
      'common.contacts': '地址簿'
    },
    en: {
      // Header
      'header.caBadge': 'NEAR CA',
      'header.mpcTitle': 'MPC Chain Signatures',
      'header.wcBtn': 'WC',
      'header.langToggle': '中',
      // Onboarding
      'onboard.badge': 'NEAR Chain Abstraction Self-Custody',
      'onboard.title': 'One NEAR Account. Every Chain.',
      'onboard.subtitle': '0-Gas Cross-Chain Intents, MPC v1.signer & Direct On-Chain Contracts',
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
      'home.syncIdle': 'Tap refresh to sync balances',
      // Token Detail Sheet
      'detail.bridgeBtn': 'Bridge',
      'detail.receiveAddrLabel': 'Current Network Receive Address',
      'detail.chainBreakdownTitle': 'Balance by Network',
      'detail.earnSectionTitle': 'Earn · Staking · Lending',
      'detail.historyTitle': 'Token Activity & History',
      'detail.openExplorerBtn': 'Explorer ↗',
      // Swap
      'swap.title': 'Cross-Chain & DEX Swap',
      'swap.autoRouteLabel': 'Auto Route',
      'swap.fromLabel': 'Pay',
      'swap.toLabel': 'Receive',
      'swap.balanceLabel': 'Available',
      'swap.maxBtn': 'Max',
      'swap.recipientLabel': 'Destination Address',
      'swap.recipientPlaceholder': 'Auto-filled for destination chain',
      'swap.rateLabel': 'Rate',
      'swap.routeLabel': 'Route',
      'swap.slippageLabel': 'Slippage',
      'swap.executeBtn': 'Execute Swap',
      'swap.orderTitle': 'Cross-Chain Order Status',
      'swap.orderDepositAddr': 'Deposit Address',
      'swap.orderStatus': 'Status',
      'swap.orderRefresh': 'Refresh',
      'swap.orderSubmitHashPlaceholder': 'Paste deposit TxHash to speed up',
      'swap.orderSubmitHashBtn': 'Submit Hash',
      'swap.orderDoneBtn': 'Done',
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
      'hub.nearDomainRegisterBtn': 'Register On-Chain (0.1 NEAR)',
      'hub.nearDomainBindBtn': 'Bind Existing',
      'hub.mpcTitle': 'NEAR MPC Chain Signatures (v1.signer)',
      'hub.mpcPathLabel': 'Derivation Path',
      'hub.mpcDerivedAddr': 'MPC Derived EVM Address',
      'hub.mpcPayloadPlaceholder': 'Enter message or 32-byte hex digest to sign via MPC',
      'hub.mpcSignBtn': 'Sign via v1.signer',
      'hub.miningTitle': '⛏️ Deep Mining Telemetry & Bridge',
      'hub.miningSubtitle': 'Multi-pool hashrate, rig status & 1-click PRL sweep to .near',
      'hub.miningOpenBtn': 'Open Mining Pro',
      'hub.keysTitle': 'NEAR Master & MPC Chain Addresses',
      'hub.manageWalletsBtn': 'Switch / Add Wallet',
      'hub.backupKeysBtn': 'Backup Phrase & NEAR Key',
      'hub.contactsTitle': 'Address Book',
      'hub.contactsOpenBtn': 'Manage Contacts',
      'hub.wcTitle': 'WalletConnect v2',
      'hub.wcOpenBtn': 'Manage DApp Sessions',
      'hub.securityTitle': 'Security & Preferences',
      'hub.pinBtn': 'Set / Change PIN',
      'hub.langBtn': 'Language (中/EN)',
      'hub.bioCardTitle': 'Security',
      'hub.bioSetPinBtn': 'Set PIN',
      // Sheets
      'sheet.sendTitle': 'Send',
      'sheet.sendAssetLabel': 'Asset',
      'sheet.sendSourceLabel': 'Source Network',
      'sheet.sendToLabel': 'Recipient Address (Auto-Detect)',
      'sheet.sendToPlaceholder': 'Enter .near / 0x / Solana / prl1p address',
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
      'sheet.miningHash30m': '30m Hashrate',
      'sheet.miningHash3h': '3h Avg',
      'sheet.miningHash24h': '24h Avg',
      'sheet.miningUnpaid': 'Unpaid PRL',
      'sheet.miningShareRate': 'Share Accept',
      'sheet.miningWorkersTitle': 'Per-Worker Rig Status',
      'sheet.miningPayoutsTitle': 'Payout History',
      'sheet.miningSweepTitle': '⚡ Bridge Mined PRL to .near Master Account',
      'sheet.miningSweepAmountPlaceholder': 'PRL amount to bridge',
      'sheet.miningSweepBtn': 'Prepare Bridge Intent',
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
      'sheet.contactsAddrPlaceholder': 'Address (.near / 0x / Solana / prl1p)',
      'sheet.contactsAddBtn': 'Save Contact',
      'sheet.walletsTitle': 'Wallets',
      'sheet.walletsCreateBtn': 'New Wallet',
      'sheet.walletsImportBtn': 'Import Phrase',
      'sheet.backupTitle': 'Seed Phrase & NEAR Master Key',
      'sheet.pinTitle': 'Security PIN',
      'sheet.pinPlaceholder': 'Enter 4-6 digit PIN',
      'sheet.pinSaveBtn': 'Save PIN',
      'sheet.authTitle': 'Verification',
      'sheet.authBiometricBtn': '👤 Biometrics',
      'sheet.authPinHint': 'Enter PIN',
      'sheet.authCancelBtn': 'Cancel',
      'common.copy': 'Copy',
      'common.close': 'Close',
      'common.paste': 'Paste',
      'common.contacts': 'Contacts'
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
      routeType: 'auto', // 'same_chain_dex' | 'cross_chain' | 'auto'
      fromAssetId: 'nep141:wrap.near',
      toAssetId: 'nep141:sol.omft.near',
      amountIn: '',
      amountOut: '',
      slippageBps: 100,
      recipientAddress: '',
      quoteData: null,
      quoteSource: null,
      activeOrder: null,
      pickerSide: 'from',
      pickerChainFilter: 'all',
      pickerSearch: ''
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

    mining: {
      minerAddress: '',
      poolKey: 'auto', // 'auto' | 'kryptex' | 'herominers' | 'onchain'
      telemetry: null,
      networkStats: null,
      sweepDestAsset: 'PRL',
      sweepQuote: null,
      loading: false
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

  function saveWallets() {
    safeStorageSet(
      WALLETS_STORAGE_KEY,
      JSON.stringify({
        wallets: state.wallets,
        activeWalletId: state.activeWalletId
      })
    );
  }

  function loadWallets() {
    let rawJson = safeStorageGet(WALLETS_STORAGE_KEY);
    let migratedFromLegacy = false;

    if (!rawJson) {
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

    if ((!parsed || !Array.isArray(parsed.wallets) || parsed.wallets.length === 0) && !migratedFromLegacy) {
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

    for (const item of rawList) {
      const norm = normalizeWalletRecord(item);
      if (!norm) continue;
      const dedupeKey = (norm.nearAddress || norm.address || norm.evmAddress || norm.id).toLowerCase();
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      unique.push(norm);
    }

    state.wallets = unique;
    const requestedActive = parsed && parsed.activeWalletId ? String(parsed.activeWalletId) : '';
    const activeExists = unique.some((w) => w.id === requestedActive);
    state.activeWalletId = activeExists ? requestedActive : (unique[0] ? unique[0].id : null);

    if (migratedFromLegacy && unique.length > 0) {
      saveWallets();
    }
    return state.wallets;
  }

  function loadContacts() {
    let raw = safeStorageGet(CONTACTS_STORAGE_KEY);
    let migrated = false;
    if (!raw) {
      raw = safeStorageGet(LEGACY_CONTACTS_STORAGE_KEY);
      if (raw) migrated = true;
    }
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      state.contacts = Array.isArray(parsed)
        ? parsed.filter((c) => c && typeof c.address === 'string' && c.address.trim()).map((c) => ({
            id: String(c.id || `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`),
            name: String(c.name || '').trim() || 'Contact',
            address: String(c.address).trim(),
            network: String(c.network || '').toLowerCase() || null,
            createdAt: c.createdAt || new Date().toISOString()
          }))
        : [];
      if (migrated && state.contacts.length > 0) {
        saveContacts();
      }
    } catch (_) {
      state.contacts = [];
    }
    return state.contacts;
  }

  function saveContacts() {
    safeStorageSet(CONTACTS_STORAGE_KEY, JSON.stringify(state.contacts || []));
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

  function loadCachedLiveTokens() {
    const raw = safeStorageGet(LIVE_TOKENS_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.tokens) ? parsed.tokens : null);
      if (Array.isArray(list) && list.length > 0) {
        if (!Array.isArray(state.liveTokens) || state.liveTokens.length === 0) {
          state.liveTokens = list;
        }
        if (parsed && typeof parsed.updatedAt === 'number' && !state.pricesUpdatedAt) {
          state.pricesUpdatedAt = parsed.updatedAt;
        }
        const reg = (typeof globalThis !== 'undefined' && globalThis.NearCATokens) || (typeof window !== 'undefined' && window.NearCATokens);
        if (reg && typeof reg.setLiveDefuseTokens === 'function') {
          reg.setLiveDefuseTokens(list);
        }
        return list;
      }
    } catch (_) {}
    return null;
  }

  function saveCachedLiveTokens(tokensList) {
    if (!Array.isArray(tokensList) || tokensList.length === 0) return;
    try {
      const payload = {
        updatedAt: Date.now(),
        tokens: tokensList.map((t) => ({
          assetId: t.assetId,
          symbol: t.symbol,
          name: t.name,
          blockchain: t.blockchain,
          contractAddress: t.contractAddress || null,
          decimals: t.decimals,
          price: typeof t.price === 'number' ? t.price : null,
          priceUpdatedAt: t.priceUpdatedAt || null,
          logoURI: t.logoURI || ''
        }))
      };
      safeStorageSet(LIVE_TOKENS_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function loadCachedStakingMetrics() {
    const raw = safeStorageGet(STAKING_METRICS_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
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
          if (p.tvlTokenAmount === undefined && typeof cached.tvlTokenAmount === 'number' && Number.isFinite(cached.tvlTokenAmount)) p.tvlTokenAmount = cached.tvlTokenAmount;
          if (p.tvlUsd === undefined && typeof cached.tvlUsd === 'number' && Number.isFinite(cached.tvlUsd)) p.tvlUsd = cached.tvlUsd;
          if (p.stakersCount === null && typeof cached.stakersCount === 'number' && Number.isFinite(cached.stakersCount)) p.stakersCount = cached.stakersCount;
          if (!p.lockTiers && Array.isArray(cached.lockTiers)) p.lockTiers = cached.lockTiers;
          if (!p.rateRangeText && typeof cached.rateRangeText === 'string') p.rateRangeText = cached.rateRangeText;
        }
        if (!state.staking.pools) state.staking.pools = pools;
      }
      if (typeof parsed.updatedAt === 'number' && !state.staking.updatedAt) {
        state.staking.updatedAt = parsed.updatedAt;
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

  function initState() {
    loadWallets();
    loadContacts();
    loadFavoriteTokens();
    loadCachedLiveTokens();
    loadCachedStakingMetrics();
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
  state.loadWallets = loadWallets;
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
