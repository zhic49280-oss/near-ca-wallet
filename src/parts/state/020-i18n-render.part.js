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

  const VAULT_SECRET_FIELDS = [
    'mnemonic', 'prlMnemonic', 'btcMnemonic', 'legacyEvmMnemonic', 'legacySolMnemonic',
    'nearPrivateKey', 'nearPrivateSeedHex', 'evmPrivateKey', 'solPrivateSeedHex',
    'privateKeyHex', 'tweakedPrivateKeyHex', 'btcPrivateKeyHex', 'btcTweakedPrivateKeyHex'
  ];

  async function encryptWalletSecretsToVaultAsync(wallet, pin) {
    const cryptoLib = (typeof root !== 'undefined' && root.NearCACrypto) || (typeof globalThis !== 'undefined' && globalThis.NearCACrypto);
    const cleanPin = String(pin || '').trim();
    if (!wallet || !cleanPin || !cryptoLib || typeof cryptoLib.encryptVaultJsonAsync !== 'function') return null;
    const secrets = {};
    for (const k of VAULT_SECRET_FIELDS) {
      if (wallet[k]) secrets[k] = wallet[k];
    }
    if (Object.keys(secrets).length === 0 && wallet.encryptedVault && wallet.encryptedVault.ctBase64) {
      return null;
    }
    const envelope = await cryptoLib.encryptVaultJsonAsync(secrets, cleanPin);
    wallet.encryptedVault = envelope;
    return envelope;
  }

  async function unlockWalletVaultSecretsAsync(wallet, pin) {
    const cryptoLib = (typeof root !== 'undefined' && root.NearCACrypto) || (typeof globalThis !== 'undefined' && globalThis.NearCACrypto);
    const cleanPin = String(pin || '').trim();
    if (!wallet || !wallet.encryptedVault || !cleanPin || !cryptoLib || typeof cryptoLib.decryptVaultJsonAsync !== 'function') return false;
    const secrets = await cryptoLib.decryptVaultJsonAsync(wallet.encryptedVault, cleanPin);
    if (secrets && typeof secrets === 'object') {
      for (const k of VAULT_SECRET_FIELDS) {
        if (secrets[k]) wallet[k] = secrets[k];
      }
      return true;
    }
    return false;
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
      if (copy.encryptedVault && typeof copy.encryptedVault === 'object' && copy.encryptedVault.ctBase64) {
        for (const k of VAULT_SECRET_FIELDS) {
          delete copy[k];
        }
      }
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
        if (el.getAttribute('data-i18n-dynamic') === '1') return;
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
        if (parsed.walletId && state.activeWalletId && parsed.walletId !== state.activeWalletId) {
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

  function saveCachedPerpSnapshot({
    markets,
    account,
    accountAddr,
    candles,
    candleCoin,
    candleInterval,
    orderbook,
    orderbookCoin
  } = {}) {
    try {
      let existing = {};
      const raw = safeStorageGet(PERP_SNAPSHOT_STORAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') existing = parsed;
        } catch (_) {}
      }

      if (Array.isArray(markets) && markets.length > 0) {
        existing.marketsUpdatedAt = Date.now();
        existing.markets = markets.slice(0, 350).map((m) => ({
          index: Number(m.index),
          name: String(m.name || ''),
          baseSymbol: String(m.baseSymbol || ''),
          pairLabel: String(m.pairLabel || ''),
          dex: String(m.dex || ''),
          category: String(m.category || 'crypto'),
          szDecimals: Number(m.szDecimals) || 0,
          maxLeverage: Number(m.maxLeverage) || 20,
          onlyIsolated: Boolean(m.onlyIsolated),
          markPx: Number.isFinite(Number(m.markPx)) ? Number(m.markPx) : null,
          midPx: Number.isFinite(Number(m.midPx)) ? Number(m.midPx) : null,
          prevDayPx: Number.isFinite(Number(m.prevDayPx)) ? Number(m.prevDayPx) : null,
          priceChange24h: Number.isFinite(Number(m.priceChange24h)) ? Number(m.priceChange24h) : null,
          change24hPct: Number.isFinite(Number(m.change24hPct)) ? Number(m.change24hPct) : null,
          fundingRate: Number.isFinite(Number(m.fundingRate)) ? Number(m.fundingRate) : null,
          openInterest: Number.isFinite(Number(m.openInterest)) ? Number(m.openInterest) : null,
          dayNtlVlm: Number.isFinite(Number(m.dayNtlVlm)) ? Number(m.dayNtlVlm) : 0
        }));
      }

      const addrKey = String(accountAddr || (account && account.user) || '').trim().toLowerCase();
      if (account && typeof account === 'object' && addrKey) {
        const byAddr = (existing.accountsByAddr && typeof existing.accountsByAddr === 'object') ? { ...existing.accountsByAddr } : {};
        byAddr[addrKey] = {
          updatedAt: Date.now(),
          account: {
            ...account,
            fills: Array.isArray(account.fills) ? account.fills.slice(0, 20) : []
          }
        };
        const sortedAddrs = Object.entries(byAddr)
          .sort((a, b) => Number(b[1] && b[1].updatedAt || 0) - Number(a[1] && a[1].updatedAt || 0))
          .slice(0, 3);
        existing.accountsByAddr = Object.fromEntries(sortedAddrs);
      }

      if (Array.isArray(candles) && candles.length > 0 && candleCoin) {
        const cIv = String(candleInterval || state.perp.chartInterval || '15m');
        const cKey = `${String(candleCoin)}|${cIv}`;
        const cMap = (existing.candlesCache && typeof existing.candlesCache === 'object') ? { ...existing.candlesCache } : {};
        cMap[cKey] = { updatedAt: Date.now(), candles: candles.slice(-64) };
        const sortedCandles = Object.entries(cMap)
          .sort((a, b) => Number(b[1] && b[1].updatedAt || 0) - Number(a[1] && a[1].updatedAt || 0))
          .slice(0, 6);
        existing.candlesCache = Object.fromEntries(sortedCandles);
      }

      if (orderbook && typeof orderbook === 'object' && orderbookCoin) {
        existing.orderbook = {
          updatedAt: Date.now(),
          coin: String(orderbookCoin),
          ob: orderbook
        };
      }

      return safeStorageSet(PERP_SNAPSHOT_STORAGE_KEY, JSON.stringify(existing));
    } catch (_) {
      return false;
    }
  }

  function loadCachedPerpSnapshot(walletAddr = '') {
    try {
      const raw = safeStorageGet(PERP_SNAPSHOT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      const now = Date.now();
      if (
        (!Array.isArray(state.perp.markets) || state.perp.markets.length === 0) &&
        Array.isArray(parsed.markets) &&
        parsed.markets.length > 0 &&
        (!parsed.marketsUpdatedAt || (now - Number(parsed.marketsUpdatedAt) <= 7 * 86400_000))
      ) {
        state.perp.markets = parsed.markets;
      }

      const activeW = getActiveWallet();
      const targetAddr = String(walletAddr || (activeW && (activeW.mpcEvmAddress || activeW.evmAddress)) || '').trim().toLowerCase();
      if (!state.perp.account && targetAddr && parsed.accountsByAddr && typeof parsed.accountsByAddr === 'object') {
        const entry = parsed.accountsByAddr[targetAddr];
        if (entry && entry.account && (!entry.updatedAt || (now - Number(entry.updatedAt) <= 24 * 3600_000))) {
          state.perp.account = entry.account;
        }
      }

      const curCoin = String(state.perp.selectedCoin || 'BTC');
      const curIv = String(state.perp.chartInterval || '15m');
      if ((!Array.isArray(state.perp.candles) || state.perp.candles.length === 0) && parsed.candlesCache && typeof parsed.candlesCache === 'object') {
        const cEntry = parsed.candlesCache[`${curCoin}|${curIv}`];
        if (cEntry && Array.isArray(cEntry.candles) && (!cEntry.updatedAt || (now - Number(cEntry.updatedAt) <= 24 * 3600_000))) {
          state.perp.candles = cEntry.candles;
        }
      }

      if (!state.perp.orderbook && parsed.orderbook && parsed.orderbook.coin === curCoin && parsed.orderbook.ob) {
        if (!parsed.orderbook.updatedAt || (now - Number(parsed.orderbook.updatedAt) <= 24 * 3600_000)) {
          state.perp.orderbook = parsed.orderbook.ob;
        }
      }

      return parsed;
    } catch (_) {
      return null;
    }
  }

  function getCachedPerpCandles(coin, interval = '15m') {
    try {
      const raw = safeStorageGet(PERP_SNAPSHOT_STORAGE_KEY);
      if (!raw || !coin) return null;
      const parsed = JSON.parse(raw);
      const entry = parsed && parsed.candlesCache && parsed.candlesCache[`${String(coin)}|${String(interval || '15m')}`];
      if (!entry || !Array.isArray(entry.candles) || entry.candles.length === 0) return null;
      if (entry.updatedAt && (Date.now() - Number(entry.updatedAt) > 24 * 3600_000)) return null;
      return entry.candles;
    } catch (_) {
      return null;
    }
  }

  function initState() {
    loadWallets();
    loadContacts();
    loadFavoriteTokens();
    loadCachedLiveTokens();
    loadCachedStakingMetrics();
    loadCachedPerpSnapshot();
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
  state.PERP_SNAPSHOT_STORAGE_KEY = PERP_SNAPSHOT_STORAGE_KEY;
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
  state.saveCachedPerpSnapshot = saveCachedPerpSnapshot;
  state.loadCachedPerpSnapshot = loadCachedPerpSnapshot;
  state.getCachedPerpCandles = getCachedPerpCandles;
  state.toggleFavoriteTokenId = toggleFavoriteTokenId;
  state.normalizeWalletRecord = normalizeWalletRecord;
  state.recomputeWalletMpcAddresses = recomputeWalletMpcAddresses;
  state.syncWalletCompatBalances = syncWalletCompatBalances;
  state.setWalletErc20Balance = setWalletErc20Balance;
  state.getWalletErc20Balance = getWalletErc20Balance;
  state.createEmptyNativeBalances = createEmptyNativeBalances;
  state.encryptWalletSecretsToVaultAsync = encryptWalletSecretsToVaultAsync;
  state.unlockWalletVaultSecretsAsync = unlockWalletVaultSecretsAsync;
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
