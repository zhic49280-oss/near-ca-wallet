// GENERATED FILE: assembled by scripts/build-parts.js from src/parts/state/*.part.js. Edit the parts, then run npm run build.
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
  const PERP_SNAPSHOT_STORAGE_KEY = 'near_ca_perp_snapshot_v1';
  // Dedicated K-line history cache (compact rows, not in STORAGE_TOPIC_MAP so writes never re-render PerpView)
  const PERP_CANDLES_STORAGE_KEY = 'near_ca_perp_candles_v1';
  const SWAP_PAIR_STORAGE_KEY = 'near_ca_swap_pair_v1';
  const ACTIVE_SWAP_ORDER_STORAGE_KEY = 'near_ca_active_swap_order_v1';
  const WC_PROJECT_ID_STORAGE_KEY = 'near_ca_wc_project_id';
  const LEGACY_WC_PROJECT_ID_KEY = 'pearl_wc_project_id';
  const DEFAULT_WC_PROJECT_ID = 'a1e691683a26f67375ef31ee654a1f49';

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

  function emitStateTopic(topic = '*') {
    try {
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) ||
        (typeof globalThis !== 'undefined' && globalThis.NearCAFramework) ||
        null;
      if (fw && typeof fw.notifyFrameworkState === 'function') {
        fw.notifyFrameworkState(topic);
      }
    } catch (_) {}
  }

  const STORAGE_TOPIC_MAP = {
    [WALLETS_STORAGE_KEY]: 'wallet',
    [CONTACTS_STORAGE_KEY]: 'contacts',
    [FAV_TOKENS_STORAGE_KEY]: 'balances',
    [LIVE_TOKENS_STORAGE_KEY]: 'balances',
    [STAKING_METRICS_STORAGE_KEY]: 'earn',
    [PERP_SNAPSHOT_STORAGE_KEY]: 'perp',
    [SWAP_PAIR_STORAGE_KEY]: 'swap',
    [ACTIVE_SWAP_ORDER_STORAGE_KEY]: 'swap'
  };

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
        const topic = STORAGE_TOPIC_MAP[key];
        if (topic) emitStateTopic(topic);
      }
    } catch (_) {}
  }

  function safeStorageSet(key, val) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.setItem === 'function') {
        localStorage.setItem(key, val);
        const topic = STORAGE_TOPIC_MAP[key];
        if (topic) emitStateTopic(topic);
        return true;
      }
    } catch (err) {
      const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22 || /quota/i.test(String(err.message || '')));
      if (isQuota && key !== LIVE_TOKENS_STORAGE_KEY && key !== PERP_SNAPSHOT_STORAGE_KEY && key !== PERP_CANDLES_STORAGE_KEY) {
        try {
          safeStorageRemove(LIVE_TOKENS_STORAGE_KEY);
          safeStorageRemove(STAKING_METRICS_STORAGE_KEY);
          safeStorageRemove(PERP_SNAPSHOT_STORAGE_KEY);
          safeStorageRemove(PERP_CANDLES_STORAGE_KEY);
          safeStorageRemove('near_ca_near_ft_icons_v1');
          localStorage.setItem(key, val);
          const topic = STORAGE_TOPIC_MAP[key];
          if (topic) emitStateTopic(topic);
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
    emitStateTopic('balances');
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

    const cryptoEngine = getCryptoEngine();
    const mnemonicClean = String(raw.mnemonic || '').trim();
    const nearNamedAccount = String(raw.nearNamedAccount || '').trim().toLowerCase();
    let healedNearAddr = String(raw.nearAddress || '').trim().toLowerCase();
    let healedNearPub = String(raw.nearPublicKey || '').trim();
    let healedNearPriv = String(raw.nearPrivateKey || '').trim();
    let healedNearSeedHex = String(raw.nearPrivateSeedHex || '').trim();
    let didSelfHeal = false;

    const needsNear = Boolean(mnemonicClean) && (!healedNearAddr || !healedNearPub || !healedNearPriv || !healedNearSeedHex);
    if (needsNear && cryptoEngine && typeof cryptoEngine.deriveNearFromSeed === 'function') {
      try {
        const nearDerived = cryptoEngine.deriveNearFromSeed(mnemonicClean, 0);
        if (nearDerived && nearDerived.nearAddress) {
          healedNearAddr = healedNearAddr || String(nearDerived.nearAddress).trim().toLowerCase();
          healedNearPub = healedNearPub || String(nearDerived.nearPublicKey || '').trim();
          healedNearPriv = healedNearPriv || String(nearDerived.nearPrivateKey || '').trim();
          healedNearSeedHex = healedNearSeedHex || String(nearDerived.nearPrivateSeedHex || '').trim();
          didSelfHeal = true;
        }
      } catch (_) {}
    }

    const activeNearId = nearNamedAccount || healedNearAddr;

    let mpcEvmAddress = String(raw.mpcEvmAddress || '').trim();
    let evmAddress = String(raw.evmAddress || '').trim();
    const evmPrivateKey = String(raw.evmPrivateKey || '').trim();
    let solAddress = String(raw.solAddress || '').trim();
    let solPublicKey = String(raw.solPublicKey || '').trim();
    const solPrivateSeedHex = String(raw.solPrivateSeedHex || '').trim();
    let pearlAddress = String(raw.address || raw.pearlAddress || '').trim();
    let privateKeyHex = String(raw.privateKeyHex || '').trim();
    let tweakedPrivateKeyHex = String(raw.tweakedPrivateKeyHex || '').trim();
    let btcAddress = String(raw.btcAddress || '').trim();
    let btcPrivateKeyHex = String(raw.btcPrivateKeyHex || '').trim();
    let btcTweakedPrivateKeyHex = String(raw.btcTweakedPrivateKeyHex || '').trim();

    let mpcDerivedForNearId = String(raw._mpcDerivedForNearId || '').trim().toLowerCase();

    const prlMnemonic = String(raw.prlMnemonic || '').trim();
    const btcMnemonic = String(raw.btcMnemonic || '').trim();
    const effectivePrlMnemonic = prlMnemonic || mnemonicClean;
    const effectiveBtcMnemonic = btcMnemonic || mnemonicClean;
    const needsPearl = Boolean(effectivePrlMnemonic) && (!pearlAddress || !privateKeyHex || !tweakedPrivateKeyHex);
    if (needsPearl && cryptoEngine && typeof cryptoEngine.derivePearlFromSeed === 'function') {
      try {
        const pearlDerived = cryptoEngine.derivePearlFromSeed(effectivePrlMnemonic, "m/86'/808276'/0'/0/0", true);
        if (pearlDerived && pearlDerived.address) {
          pearlAddress = pearlDerived.address;
          privateKeyHex = pearlDerived.privateKeyHex || privateKeyHex;
          tweakedPrivateKeyHex = pearlDerived.tweakedPrivateKeyHex || tweakedPrivateKeyHex;
          didSelfHeal = true;
        }
      } catch (_) {}
    }

    const needsBtc = Boolean(effectiveBtcMnemonic) && (!btcAddress || !btcPrivateKeyHex || !btcTweakedPrivateKeyHex);
    if (needsBtc && cryptoEngine && typeof cryptoEngine.deriveBitcoinFromSeed === 'function') {
      try {
        const btcDerived = cryptoEngine.deriveBitcoinFromSeed(effectiveBtcMnemonic, "m/86'/0'/0'/0/0", true);
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
      solAddress &&
      solPublicKey
    );
    if (activeNearId && !hasCachedMpc && cryptoEngine) {
      if (typeof cryptoEngine.deriveNearMpcEvmAddress === 'function' && typeof cryptoEngine.deriveNearMpcSolanaAddress === 'function') {
        try {
          const evmMpc = cryptoEngine.deriveNearMpcEvmAddress(activeNearId, 'ethereum-1');
          const solMpc = cryptoEngine.deriveNearMpcSolanaAddress(activeNearId, 'solana-1');
          mpcEvmAddress = evmMpc.mpcEvmAddress;
          if (!evmPrivateKey) evmAddress = evmMpc.mpcEvmAddress;
          else evmAddress = evmAddress || evmMpc.mpcEvmAddress;
          if (!solPrivateSeedHex) {
            solAddress = solMpc.mpcSolAddress;
            solPublicKey = solMpc.mpcSolAddress;
          } else {
            solAddress = solAddress || solMpc.mpcSolAddress;
            solPublicKey = solPublicKey || solAddress;
          }
          mpcDerivedForNearId = activeNearId;
          didSelfHeal = true;
        } catch (_) {}
      } else if (typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
        try {
          const mpcAll = cryptoEngine.deriveNearMpcAllAddresses(activeNearId);
          mpcEvmAddress = mpcAll.evmAddress;
          if (!evmPrivateKey) evmAddress = mpcAll.evmAddress;
          else evmAddress = evmAddress || mpcAll.evmAddress;
          if (!solPrivateSeedHex) {
            solAddress = mpcAll.solAddress;
            solPublicKey = mpcAll.solAddress;
          } else {
            solAddress = solAddress || mpcAll.solAddress;
            solPublicKey = solPublicKey || solAddress;
          }
          mpcDerivedForNearId = activeNearId;
          didSelfHeal = true;
        } catch (_) {}
      }
    }
    if (!solPublicKey && solAddress) solPublicKey = solAddress;

    const wallet = {
      id: String(raw.id || `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      accountType: acctType,
      name: String(raw.name || 'NEAR Account'),
      mnemonic: mnemonicClean,
      prlMnemonic,
      btcMnemonic,
      biometricEnabled: raw.biometricEnabled !== undefined ? Boolean(raw.biometricEnabled) : true,
      biometricLocked: Boolean(raw.biometricLocked),
      webauthnCredentialId: String(raw.webauthnCredentialId || '').trim(),
      // Primary NEAR CA Identity
      nearNamedAccount,
      nearAddress: healedNearAddr,
      nearPublicKey: healedNearPub,
      nearPrivateKey: healedNearPriv,
      nearPrivateSeedHex: healedNearSeedHex,
      _nearAccountChecked: Boolean(raw._nearAccountChecked || nearNamedAccount),
      // External Chain Addresses Controlled by NEAR MPC (v1.signer) + Native BIP-86 Pearl & Bitcoin Addresses
      mpcEvmAddress,
      evmAddress,
      evmPrivateKey,
      solAddress,
      solPublicKey,
      solPrivateSeedHex,
      address: pearlAddress,
      privateKeyHex,
      tweakedPrivateKeyHex,
      btcAddress,
      btcPrivateKeyHex,
      btcTweakedPrivateKeyHex,
      _mpcDerivedForNearId: mpcDerivedForNearId,
      qtcDepositAddress: String(raw.qtcDepositAddress || '').trim(),
      qtcDepositAddressAt: Number(raw.qtcDepositAddressAt || 0) || 0,
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
      activityHistory: Array.isArray(raw.activityHistory) ? raw.activityHistory.slice(0, 100) : [],
      legacyEvmMnemonic: String(raw.legacyEvmMnemonic || '').trim(),
      legacySolMnemonic: String(raw.legacySolMnemonic || '').trim()
    };
    if (didSelfHeal) wallet._needsSelfHealSave = true;

    return syncWalletCompatBalances(wallet);
  }

  function recomputeWalletMpcAddresses(wallet) {
    if (!wallet || typeof wallet !== 'object') return wallet;
    const cryptoEngine = getCryptoEngine();
    const mnemonicClean = String(wallet.mnemonic || '').trim();
    const needsNear = Boolean(mnemonicClean) && (!wallet.nearAddress || !wallet.nearPublicKey || !wallet.nearPrivateKey || !wallet.nearPrivateSeedHex);
    if (needsNear && cryptoEngine && typeof cryptoEngine.deriveNearFromSeed === 'function') {
      try {
        const nearDerived = cryptoEngine.deriveNearFromSeed(mnemonicClean, 0);
        if (nearDerived && nearDerived.nearAddress) {
          wallet.nearAddress = wallet.nearAddress || String(nearDerived.nearAddress).trim().toLowerCase();
          wallet.nearPublicKey = wallet.nearPublicKey || nearDerived.nearPublicKey;
          wallet.nearPrivateKey = wallet.nearPrivateKey || nearDerived.nearPrivateKey;
          wallet.nearPrivateSeedHex = wallet.nearPrivateSeedHex || nearDerived.nearPrivateSeedHex;
        }
      } catch (_) {}
    }
    const effectivePrlMnemonic = String(wallet.prlMnemonic || wallet.mnemonic || '').trim();
    const needsPearl = Boolean(effectivePrlMnemonic) && (!wallet.address || !wallet.privateKeyHex || !wallet.tweakedPrivateKeyHex);
    if (needsPearl && cryptoEngine && typeof cryptoEngine.derivePearlFromSeed === 'function') {
      try {
        const pearlDerived = cryptoEngine.derivePearlFromSeed(effectivePrlMnemonic, "m/86'/808276'/0'/0/0", true);
        if (pearlDerived && pearlDerived.address) {
          wallet.address = pearlDerived.address;
          wallet.privateKeyHex = pearlDerived.privateKeyHex || wallet.privateKeyHex;
          wallet.tweakedPrivateKeyHex = pearlDerived.tweakedPrivateKeyHex || wallet.tweakedPrivateKeyHex;
        }
      } catch (_) {}
    }
    const effectiveBtcMnemonic = String(wallet.btcMnemonic || wallet.mnemonic || '').trim();
    const needsBtc = Boolean(effectiveBtcMnemonic) && (!wallet.btcAddress || !wallet.btcPrivateKeyHex || !wallet.btcTweakedPrivateKeyHex);
    if (needsBtc && cryptoEngine && typeof cryptoEngine.deriveBitcoinFromSeed === 'function') {
      try {
        const btcDerived = cryptoEngine.deriveBitcoinFromSeed(effectiveBtcMnemonic, "m/86'/0'/0'/0/0", true);
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
        try {
          const evmMpc = cryptoEngine.deriveNearMpcEvmAddress(activeNearId, 'ethereum-1');
          const solMpc = cryptoEngine.deriveNearMpcSolanaAddress(activeNearId, 'solana-1');
          wallet.mpcEvmAddress = evmMpc.mpcEvmAddress;
          if (!wallet.evmPrivateKey) wallet.evmAddress = evmMpc.mpcEvmAddress;
          else wallet.evmAddress = wallet.evmAddress || evmMpc.mpcEvmAddress;
          if (!wallet.solPrivateSeedHex) {
            wallet.solAddress = solMpc.mpcSolAddress;
            wallet.solPublicKey = solMpc.mpcSolAddress;
          } else {
            wallet.solAddress = wallet.solAddress || solMpc.mpcSolAddress;
            wallet.solPublicKey = wallet.solPublicKey || wallet.solAddress;
          }
          wallet._mpcDerivedForNearId = activeNearId;
        } catch (_) {}
      } else if (typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
        try {
          const mpcAll = cryptoEngine.deriveNearMpcAllAddresses(activeNearId);
          wallet.mpcEvmAddress = mpcAll.evmAddress;
          if (!wallet.evmPrivateKey) wallet.evmAddress = mpcAll.evmAddress;
          else wallet.evmAddress = wallet.evmAddress || mpcAll.evmAddress;
          if (!wallet.solPrivateSeedHex) {
            wallet.solAddress = mpcAll.solAddress;
            wallet.solPublicKey = mpcAll.solAddress;
          } else {
            wallet.solAddress = wallet.solAddress || mpcAll.solAddress;
            wallet.solPublicKey = wallet.solPublicKey || wallet.solAddress;
          }
          wallet._mpcDerivedForNearId = activeNearId;
        } catch (_) {}
      }
    }
    return wallet;
  }

