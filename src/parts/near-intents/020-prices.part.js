  const CANONICAL_PRICE_SYMBOLS = new Set([
    'NEAR', 'WNEAR', 'ETH', 'WETH', 'BTC', 'WBTC', 'BTCB', 'CBBTC', 'CIRBTC',
    'SOL', 'WSOL', 'BNB', 'WBNB', 'USDC', 'USDT', 'USDBC', 'WUSDC', 'EURC',
    'DAI', 'USYC', 'PRL', 'HYPE', 'WHYPE', 'TRX', 'XRP', 'DOGE', 'SUI',
    'TON', 'APT', 'AVAX', 'POL', 'ARB', 'OP'
  ]);

  function resolveLocalBundledLogo(tok, registry) {
    const localMap = registry && registry.LOCAL_TOKEN_ICON_MAP;
    if (!tok || !localMap) return '';
    const rawTrim = String(tok.symbol || '').trim().replace(/^\$/, '');
    const symUpper = rawTrim.toUpperCase();
    if (!symUpper) return '';
    const colonIdx = rawTrim.indexOf(':');
    const dexPrefix = colonIdx > 0 ? rawTrim.slice(0, colonIdx).toUpperCase() : '';
    let symBase = colonIdx >= 0 ? rawTrim.slice(colonIdx + 1).toUpperCase() : symUpper;
    symBase = symBase.replace(/-(USDC|PERP|USD)$/, '');
    if (symBase === 'PEARL') symBase = 'PRL';
    else if (/^1000000[A-Z0-9]{2,}$/.test(symBase)) symBase = symBase.slice(7);
    else if (/^1000[A-Z0-9]{2,}$/.test(symBase)) symBase = symBase.slice(4);
    else if (/^K[A-Z0-9]{3,}$/.test(symBase)) symBase = symBase.slice(1);
    const exactMap = registry.TOKEN_ICON_MAP && registry.TOKEN_ICON_MAP[symUpper];
    const hasExactInline = Boolean(typeof exactMap === 'string' && exactMap.startsWith('data:image/'));
    if (hasExactInline) return exactMap;
    const dexSymKey = dexPrefix && symBase ? `${dexPrefix}:${symBase}` : '';
    return (
      localMap[symUpper]
      || (dexSymKey ? localMap[dexSymKey] : '')
      || (symBase ? (localMap[symBase] || localMap[`${symBase}X`]) : '')
      || localMap[`${symUpper}X`]
      || ''
    );
  }

  function seedLivePricesCache(cachedData, maybeTs = null) {
    if (!cachedData) return;
    const list = Array.isArray(cachedData) ? cachedData : (Array.isArray(cachedData.list) ? cachedData.list : null);
    if (!Array.isArray(list) || list.length === 0) return;
    const ts = (maybeTs !== null && Number(maybeTs) > 0)
      ? Number(maybeTs)
      : ((!Array.isArray(cachedData) && Number(cachedData.ts) > 0) ? Number(cachedData.ts) : Date.now());
    const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
    const registry = getTokenRegistry();
    if (registry && registry.LOCAL_TOKEN_ICON_MAP) {
      for (const item of list) {
        if (!item) continue;
        const curLogo = typeof item.logoURI === 'string' ? item.logoURI.trim() : '';
        if (!curLogo || !/^https?:\/\//i.test(curLogo)) continue;
        const localLogo = resolveLocalBundledLogo(item, registry);
        if (localLogo) item.logoURI = localLogo;
      }
    }
    _livePricesCache = { ts, list, fetchRef: curFetch };
    _cachedDefuseTokens = list;
    if (registry) {
      if (typeof registry.setLiveDefuseTokens === 'function') {
        try { registry.setLiveDefuseTokens(list); } catch (_) {}
      } else {
        registry.LIVE_DEFUSE_TOKENS = list;
      }
    }
  }

  /**
   * Fetches live token catalog & prices from 1Click Defuse API plus DexScreener, Prlscan, Hyperliquid,
   * Ref Finance, CoinGecko & Jupiter V2 xStocks. Never uses hardcoded fake fallback prices.
   */
  async function fetchLiveDefuseTokenPrices(opts = {}) {
    const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
    if (
      opts &&
      opts.useCache === true &&
      Array.isArray(_livePricesCache.list) &&
      _livePricesCache.fetchRef === curFetch &&
      (Date.now() - _livePricesCache.ts < 90_000)
    ) {
      return _livePricesCache.list;
    }
    if (_livePricesInFlight && _livePricesInFlight.fetchRef === curFetch) {
      return _livePricesInFlight.promise;
    }
    const promise = _execFetchLiveDefuseTokenPrices(opts).finally(() => {
      if (_livePricesInFlight && _livePricesInFlight.promise === promise) _livePricesInFlight = null;
    });
    _livePricesInFlight = { fetchRef: curFetch, promise };
    return promise;
  }

  async function _execFetchLiveDefuseTokenPrices(opts = {}) {
    try {
      const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
      const registryEarly = getTokenRegistry();
      const arcAddrsForDex = ((registryEarly && registryEarly.DEX_CHAIN_TOKENS && registryEarly.DEX_CHAIN_TOKENS.arc) || [])
        .map((t) => String(t && t.contractAddress || '').trim())
        .filter((a) => a && a.toLowerCase() !== ARC_USDC_CONTRACT && a.toLowerCase() !== EVM_NATIVE_SENTINEL_LOWER);
      const arcDexUrl = arcAddrsForDex.length > 0
        ? `https://api.dexscreener.com/latest/dex/tokens/${arcAddrsForDex.join(',')}`
        : null;

      const isSourceCooling = (name) => {
        const c = _auxSourceCooldown[name];
        return Boolean(c && c.fetchRef === curFetch && c.until > Date.now());
      };
      const markSourceCool = (name, ms = 180_000) => {
        _auxSourceCooldown[name] = { until: Date.now() + ms, fetchRef: curFetch };
      };

      const settleWithSoftCap = (factories, capMs = 4500) => {
        const capCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const capSig = capCtrl ? capCtrl.signal : undefined;
        let timer = null;
        const capPromise = new Promise((resolve) => {
          timer = setTimeout(() => {
            if (capCtrl && !capCtrl.signal.aborted) {
              try { capCtrl.abort(); } catch (_) {}
            }
            resolve('CAP_TIMEOUT');
          }, capMs);
        });
        const wrapped = factories.map((makeP) =>
          Promise.race([
            Promise.resolve()
              .then(() => makeP(capSig))
              .then((v) => ({ status: 'fulfilled', value: v }))
              .catch((e) => ({ status: 'rejected', reason: e })),
            capPromise.then(() => ({ status: 'fulfilled', value: null }))
          ])
        );
        return Promise.all(wrapped).finally(() => {
          if (timer) clearTimeout(timer);
          if (capCtrl && !capCtrl.signal.aborted) {
            try { capCtrl.abort(); } catch (_) {}
          }
        });
      };

      const fetchAux = (name, url, reqOpts = {}, timeoutMs = 4200, coolFailMs = 45_000, coolErrMs = 60_000) => (sig) => {
        if (!url || isSourceCooling(name)) return Promise.resolve(null);
        return fetchJsonWithTimeout(url, { ...reqOpts, signal: sig }, timeoutMs)
          .then((res) => {
            if ((!res || !res.ok) && !(sig && sig.aborted)) markSourceCool(name, coolFailMs);
            return res;
          })
          .catch(() => {
            if (!(sig && sig.aborted)) markSourceCool(name, coolErrMs);
            return null;
          });
      };

      const oneClickPromise = fetchJsonWithTimeout(`${ONECLICK_API_URL}/tokens`, {}, 5000).catch(() => null);
      const auxFactories = [
        fetchAux('dex_sol', `https://api.dexscreener.com/latest/dex/tokens/${SOL_DEXSCREENER_MINTS.join(',')}`, {}, 4200),
        fetchAux('prlscan', 'https://api.prlscan.com/v1/market/prl', {}, 4200),
        fetchAux('hyperliquid', 'https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'allMids' }) }, 4200),
        fetchAux('ref_list', 'https://indexer.ref.finance/list-token', {}, 4200),
        fetchAux('coingecko', 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=1', {}, 4200),
        fetchAux('jup_xstock', `${JUPITER_BASE_URL}/tokens/v2/search?query=xStock`, {}, 4200),
        fetchAux('kyber_tokens', 'https://ks-setting.kyberswap.com/api/v1/tokens?chainIds=5042,1,8453,42161,56,999&page=1&pageSize=100&isWhitelisted=true', {}, 4200),
        fetchAux('lifi_arc', 'https://li.quest/v1/tokens?chains=5042', {}, 4200),
        async (sig) => {
          if (!isSourceCooling('ref_price_idx')) {
            const a = await fetchJsonWithTimeout('https://indexer.ref.finance/list-token-price', { signal: sig }, 4200).catch(() => null);
            if (a && a.ok && a.data) return a;
            if (!(sig && sig.aborted)) markSourceCool('ref_price_idx', 20_000);
          }
          if (sig && sig.aborted) return null;
          if (!isSourceCooling('ref_price_api')) {
            const b = await fetchJsonWithTimeout('https://api.ref.finance/list-token-price', { signal: sig }, 4200).catch(() => null);
            if (b && b.ok && b.data) return b;
            if (!(sig && sig.aborted)) markSourceCool('ref_price_api', 20_000);
          }
          return null;
        },
        arcDexUrl ? fetchAux('dex_arc', arcDexUrl, {}, 4200) : () => Promise.resolve(null)
      ];

      const auxPromise = settleWithSoftCap(auxFactories, 4500);
      const resp = await oneClickPromise;
      const oneClickOk = Boolean(resp && resp.ok && Array.isArray(resp.data));

      if (oneClickOk && opts && typeof opts.onFastUpdate === 'function') {
        const fastList = [];
        const fastByAssetId = new Map();
        const fastByChainContract = new Map();
        const fastByCanonicalSymbol = new Map();
        for (const rawItem of resp.data) {
          if (!rawItem || !rawItem.assetId) continue;
          const rawSym = String(rawItem.symbol || '').trim();
          if (/DEPRECATED|TESTNEBULA/i.test(`${rawSym} ${rawItem.assetId || ''} ${rawItem.name || ''}`)) continue;
          if (DEAD_ONECLICK_SYMBOL_REGEX.test(rawSym)) continue;
          const norm = normalizeDefuseToken(rawItem);
          fastList.push(norm);
          fastByAssetId.set(String(norm.assetId).toLowerCase(), norm);
          const bcLow = String(norm.blockchain || '').trim().toLowerCase();
          const contractLower = String(norm.contractAddress || '').trim().toLowerCase();
          if (bcLow && contractLower && contractLower !== EVM_NATIVE_SENTINEL_LOWER) {
            const ccKey = `${bcLow}:${contractLower}`;
            if (!fastByChainContract.has(ccKey)) fastByChainContract.set(ccKey, norm);
          }
          const symUpper = String(norm.symbol || '').trim().replace(/^\$/, '').toUpperCase();
          if (CANONICAL_PRICE_SYMBOLS.has(symUpper) && norm.price !== null && norm.price > 0 && !fastByCanonicalSymbol.has(symUpper)) {
            fastByCanonicalSymbol.set(symUpper, norm);
          }
        }
        if (registryEarly) {
          const coreTokens = Array.isArray(registryEarly.UNIFIED_CORE_TOKENS) ? registryEarly.UNIFIED_CORE_TOKENS : [];
          for (const token of coreTokens) {
            if (!token || !token.assetId) continue;
            const assetLower = String(token.assetId).toLowerCase();
            const tokenBc = String(token.blockchain || '').trim().toLowerCase();
            const contractLower = String(token.contractAddress || '').trim().toLowerCase();
            const ccKey = tokenBc && contractLower && contractLower !== EVM_NATIVE_SENTINEL_LOWER ? `${tokenBc}:${contractLower}` : '';
            const symUpper = String(token.symbol || '').trim().replace(/^\$/, '').toUpperCase();
            const symLookup = tokenBc === 'arc' && symUpper === 'WUSDC' ? 'USDC' : (tokenBc === 'arc' && symUpper === 'CIRBTC' ? 'BTC' : symUpper);
            const live = fastByAssetId.get(assetLower)
              || (ccKey ? fastByChainContract.get(ccKey) : null)
              || (CANONICAL_PRICE_SYMBOLS.has(symLookup) ? fastByCanonicalSymbol.get(symLookup) : null)
              || null;
            if (live && live.price !== null && live.price > 0) {
              token.price = live.price;
              token.priceUpdatedAt = live.priceUpdatedAt || null;
            }
          }
          if (typeof registryEarly.setLiveDefuseTokens === 'function') {
            registryEarly.setLiveDefuseTokens(fastList);
          } else {
            registryEarly.LIVE_DEFUSE_TOKENS = fastList;
          }
        }
        _cachedDefuseTokens = fastList;
        _livePricesCache = { ts: Date.now(), list: fastList, fetchRef: curFetch };
        try { opts.onFastUpdate(fastList); } catch (_) {}
      }

      const auxResults = await auxPromise;
      const [dexRes, prlRes, hlRes, refListRes, cgRes, xStockRes, kyberTokRes, arcscanTokRes, refPriceRes, arcDexRes] = auxResults;

      const anyAuxOk = auxResults.some((r) => r && r.status === 'fulfilled' && r.value && r.value.ok);
      if (!oneClickOk && !anyAuxOk && _cachedDefuseTokens.length === 0) {
        return null;
      }

      const rawBaseList = oneClickOk
        ? resp.data
        : (_cachedDefuseTokens.length > 0
            ? _cachedDefuseTokens
            : (registryEarly && Array.isArray(registryEarly.UNIFIED_CORE_TOKENS) ? registryEarly.UNIFIED_CORE_TOKENS : []));

      const normalizedList = [];
      const byAssetId = new Map();
      const byChainContract = new Map();
      const byCanonicalSymbol = new Map();

      for (const rawItem of rawBaseList) {
        if (!rawItem || !rawItem.assetId) continue;
        const rawSym = String(rawItem.symbol || '').trim();
        if (/DEPRECATED|TESTNEBULA/i.test(`${rawSym} ${rawItem.assetId || ''} ${rawItem.name || ''}`)) {
          continue;
        }
        if (DEAD_ONECLICK_SYMBOL_REGEX.test(rawSym)) continue;
        const norm = oneClickOk ? normalizeDefuseToken(rawItem) : { ...rawItem };
        normalizedList.push(norm);
        byAssetId.set(String(norm.assetId).toLowerCase(), norm);

        const bcLow = String(norm.blockchain || '').trim().toLowerCase();
        const contractLower = String(norm.contractAddress || '').trim().toLowerCase();
        if (bcLow && contractLower && contractLower !== EVM_NATIVE_SENTINEL_LOWER) {
          const ccKey = `${bcLow}:${contractLower}`;
          if (!byChainContract.has(ccKey)) byChainContract.set(ccKey, norm);
        }

        const symUpper = String(norm.symbol || '').trim().replace(/^\$/, '').toUpperCase();
        if (CANONICAL_PRICE_SYMBOLS.has(symUpper) && norm.price !== null && norm.price > 0 && !byCanonicalSymbol.has(symUpper)) {
          byCanonicalSymbol.set(symUpper, norm);
        }
      }

      // Build Jupiter V2 xStock live prices & icons
      const jupXStockByMint = Object.create(null);
      const jupXStockBySym = Object.create(null);
      const jupXStockIcons = Object.create(null);
      const xStockData = xStockRes.status === 'fulfilled' && xStockRes.value?.ok ? xStockRes.value.data : null;
      if (Array.isArray(xStockData)) {
        for (const xs of xStockData) {
          if (!xs || !xs.id) continue;
          const mintLower = String(xs.id).trim().toLowerCase();
          const symClean = String(xs.symbol || '').trim().toUpperCase();
          const usdPrice = Number(xs.usdPrice);
          if (Number.isFinite(usdPrice) && usdPrice > 0) {
            jupXStockByMint[mintLower] = usdPrice;
            if (symClean) jupXStockBySym[symClean] = usdPrice;
          }
          if (xs.icon && symClean) {
            jupXStockIcons[symClean] = String(xs.icon).trim();
          }
        }
      }

      // Build Ref Finance & CoinGecko icon catalogs (safe URLs only)
      const registry = getTokenRegistry();
      const sanitizeImg = (registry && typeof registry.sanitizeImageUrl === 'function')
        ? registry.sanitizeImageUrl
        : (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');

      const refIconByContract = Object.create(null);
      const refIconBySymbol = Object.create(null);
      const refData = refListRes.status === 'fulfilled' && refListRes.value?.ok ? refListRes.value.data : null;
      if (refData && typeof refData === 'object' && !Array.isArray(refData)) {
        for (const [cid, info] of Object.entries(refData)) {
          if (!info || typeof info !== 'object') continue;
          const safeIcon = sanitizeImg(info.icon);
          if (!safeIcon || /ref-new-1\.s3\.amazonaws\.com/i.test(safeIcon)) continue;
          const cidLower = String(cid).trim().toLowerCase();
          if (cidLower && !refIconByContract[cidLower]) refIconByContract[cidLower] = safeIcon;
          const symClean = String(info.symbol || '').trim().replace(/^\$/, '').toUpperCase();
          if (symClean && !refIconBySymbol[symClean]) refIconBySymbol[symClean] = safeIcon;
        }
      }

      const cgImageById = Object.create(null);
      const cgImageBySymbol = Object.create(null);
      const cgPriceBySymbol = Object.create(null);
      const cgData = cgRes.status === 'fulfilled' && cgRes.value?.ok ? cgRes.value.data : null;
      if (Array.isArray(cgData)) {
        for (const coin of cgData) {
          if (!coin || typeof coin !== 'object') continue;
          const symClean = String(coin.symbol || '').trim().replace(/^\$/, '').toUpperCase();
          const cp = Number(coin.current_price);
          if (symClean && Number.isFinite(cp) && cp > 0 && !cgPriceBySymbol[symClean]) {
            cgPriceBySymbol[symClean] = cp;
          }
          const safeImg = sanitizeImg(coin.image);
          if (!safeImg) continue;
          const cgId = String(coin.id || '').trim().toLowerCase();
          if (cgId && !cgImageById[cgId]) cgImageById[cgId] = safeImg;
          if (symClean && !cgImageBySymbol[symClean]) cgImageBySymbol[symClean] = safeImg;
        }
      }

      const nearCuratedList = (registry && registry.DEX_CHAIN_TOKENS && Array.isArray(registry.DEX_CHAIN_TOKENS.near))
        ? registry.DEX_CHAIN_TOKENS.near
        : [];
      let nearFtMetaIcons = { byContract: Object.create(null), bySymbol: Object.create(null) };
      const ftIconCacheKey = 'near_ca_near_ft_icons_v1';
      let hasFreshFtIconCache = false;
      try {
        if (typeof localStorage !== 'undefined') {
          const rawCache = localStorage.getItem(ftIconCacheKey);
          if (rawCache) {
            const parsed = JSON.parse(rawCache);
            if (parsed && parsed.ts && (Date.now() - parsed.ts < 6 * 3600 * 1000) && parsed.data) {
              nearFtMetaIcons = parsed.data;
              hasFreshFtIconCache = true;
            }
          }
        }
      } catch (_) {}

      if (!hasFreshFtIconCache && !_ftIconBgStarted) {
        _ftIconBgStarted = true;
        const ftPromise = fetchNearFtMetadataIcons(
          [
            ...nearCuratedList.filter((item) => item && item.blockchain === 'near' && item.contractAddress),
            ...normalizedList.filter((item) => item && item.blockchain === 'near' && item.contractAddress)
          ],
          sanitizeImg
        ).then((icons) => {
          const hasAny = icons && (Object.keys(icons.byContract || {}).length > 0 || Object.keys(icons.bySymbol || {}).length > 0);
          if (hasAny) {
            if (registry && typeof registry.registerDynamicTokenIcons === 'function') {
              registry.registerDynamicTokenIcons(icons.bySymbol || {}, icons.byContract || {});
            }
            for (const tok of normalizedList) {
              if (!tok || tok.logoURI) continue;
              const bcLow = String(tok.blockchain || '').toLowerCase();
              const cidLow = String(tok.contractAddress || '').toLowerCase();
              const symUp = String(tok.symbol || '').trim().replace(/^\$/, '').toUpperCase();
              const hit = (bcLow === 'near' && cidLow && icons.byContract?.[cidLow]) || (symUp && icons.bySymbol?.[symUp]);
              if (hit) tok.logoURI = hit;
            }
            try {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem(ftIconCacheKey, JSON.stringify({ ts: Date.now(), data: icons }));
              }
            } catch (_) {}
          }
          return icons;
        }).catch(() => null).finally(() => {
          _ftIconBgStarted = false;
        });

        let ftTimer = null;
        const ftFast = await Promise.race([
          ftPromise,
          new Promise((r) => {
            ftTimer = setTimeout(() => r(null), 500);
          })
        ]).finally(() => {
          if (ftTimer) clearTimeout(ftTimer);
        });
        if (ftFast) {
          nearFtMetaIcons = ftFast;
        }
      }

      const refPriceByContract = Object.create(null);
      const refPriceData = refPriceRes.status === 'fulfilled' && refPriceRes.value?.ok ? refPriceRes.value.data : null;
      if (refPriceData && typeof refPriceData === 'object') {
        for (const [cid, info] of Object.entries(refPriceData)) {
          const pNum = Number(info && info.price);
          if (cid && Number.isFinite(pNum) && pNum > 0) {
            refPriceByContract[String(cid).trim().toLowerCase()] = pNum;
          }
        }
      }

      const resolveTokenLogo = (tok) => {
        if (!tok) return '';
        const symRaw = String(tok.symbol || '').trim().toUpperCase();
        const symClean = symRaw.replace(/^\$/, '');
        const iconMapUrl = registry && registry.TOKEN_ICON_MAP
          ? sanitizeImg(registry.TOKEN_ICON_MAP[symClean] || registry.TOKEN_ICON_MAP[symRaw])
          : '';
        if (iconMapUrl && iconMapUrl.startsWith('data:image/')) return iconMapUrl;
        const localBundled = resolveLocalBundledLogo(tok, registry);
        if (localBundled) return localBundled;
        const existing = sanitizeImg(tok.logoURI);
        if (existing) return existing;
        const contractLower = String(tok.contractAddress || '').trim().toLowerCase();
        const cgIdLower = String(tok.coingeckoId || '').trim().toLowerCase();
        return (
          iconMapUrl ||
          (contractLower ? nearFtMetaIcons.byContract[contractLower] : '') ||
          nearFtMetaIcons.bySymbol[symClean] ||
          (contractLower ? refIconByContract[contractLower] : '') ||
          refIconBySymbol[symClean] ||
          (cgIdLower ? cgImageById[cgIdLower] : '') ||
          cgImageBySymbol[symClean] ||
          ''
        );
      };

      // Supplemental live DEX prices for Solana tokens (JUP, JitoSOL, BONK, WIF) not on 1Click
      const dexPriceByMint = new Map();
      const dexData = dexRes.status === 'fulfilled' && dexRes.value?.ok ? dexRes.value.data : null;
      if (dexData && Array.isArray(dexData.pairs)) {
        const bestLiqByMint = new Map();
        for (const pair of dexData.pairs) {
          const mintLower = String(pair?.baseToken?.address || '').trim().toLowerCase();
          const priceUsd = Number(pair?.priceUsd);
          const liqUsd = Number(pair?.liquidity?.usd || 0);
          if (!mintLower || !Number.isFinite(priceUsd) || priceUsd <= 0) continue;
          const prevLiq = bestLiqByMint.get(mintLower) || -1;
          if (liqUsd >= prevLiq) {
            bestLiqByMint.set(mintLower, liqUsd);
            dexPriceByMint.set(mintLower, priceUsd);
          }
        }
      }

      // Supplemental live PRL price from Prlscan
      let prlLivePrice = null;
      const prlData = prlRes.status === 'fulfilled' && prlRes.value?.ok ? prlRes.value.data : null;
      if (prlData && prlData.price_usd !== undefined) {
        const parsedPrl = Number(prlData.price_usd);
        if (Number.isFinite(parsedPrl) && parsedPrl > 0) {
          prlLivePrice = parsedPrl;
        }
      }

      // Supplemental live HyperEVM HYPE price from Hyperliquid allMids
      let hypeLivePrice = null;
      const hlData = hlRes.status === 'fulfilled' && hlRes.value?.ok ? hlRes.value.data : null;
      if (hlData && hlData.HYPE !== undefined) {
        const parsedHype = Number(hlData.HYPE);
        if (Number.isFinite(parsedHype) && parsedHype > 0) {
          hypeLivePrice = parsedHype;
        }
      }

      const kyberIconBySymbol = Object.create(null);
      const kyberIconByContract = Object.create(null);
      const kyberChainMap = { 5042: 'arc', 1: 'eth', 8453: 'base', 42161: 'arb', 56: 'bsc', 999: 'hype' };
      const kyberTokensRaw = kyberTokRes.status === 'fulfilled' && kyberTokRes.value?.ok
        ? kyberTokRes.value.data?.data?.tokens
        : null;
      const extraDiscoveryTokens = [];
      const seenDiscoveryKeys = new Set(
        normalizedList.map((n) => `${n.blockchain}:${String(n.contractAddress || n.assetId).toLowerCase()}`)
      );
      const arcLivePriceByContract = Object.create(null);
      const arcLiveLogoByContract = Object.create(null);

      if (Array.isArray(kyberTokensRaw)) {
        for (const kt of kyberTokensRaw) {
          if (!kt || !kt.address || !kt.symbol) continue;
          const bc = kyberChainMap[Number(kt.chainId)];
          if (!bc) continue;
          const rawSym = String(kt.symbol).trim();
          if (!rawSym || (bc === 'arc' && /^ARC$/i.test(rawSym))) continue;
          if (/DEPRECATED|TESTNEBULA/i.test(`${rawSym} ${kt.name || ''}`) || DEAD_ONECLICK_SYMBOL_REGEX.test(rawSym)) continue;
          const addrLower = String(kt.address).trim().toLowerCase();
          const symUpper = rawSym.replace(/^\$/, '').toUpperCase();
          const safeLogo = sanitizeImg(kt.logoURI);
          if (safeLogo) {
            if (!kyberIconByContract[addrLower] && addrLower !== EVM_NATIVE_SENTINEL_LOWER) kyberIconByContract[addrLower] = safeLogo;
            if (symUpper && !kyberIconBySymbol[symUpper]) kyberIconBySymbol[symUpper] = safeLogo;
            if (bc === 'arc' && !arcLiveLogoByContract[addrLower]) arcLiveLogoByContract[addrLower] = safeLogo;
          }
          const dKey = `${bc}:${addrLower}`;
          if (!seenDiscoveryKeys.has(dKey)) {
            seenDiscoveryKeys.add(dKey);
            const liveRef = byChainContract.get(dKey) || (CANONICAL_PRICE_SYMBOLS.has(symUpper) ? byCanonicalSymbol.get(symUpper) : null);
            extraDiscoveryTokens.push({
              symbol: rawSym,
              name: String(kt.name || rawSym).trim(),
              blockchain: bc,
              assetId: `${bc}:${addrLower}`,
              decimals: typeof kt.decimals === 'number' ? kt.decimals : 18,
              contractAddress: String(kt.address).trim(),
              coingeckoId: null,
              price: liveRef && liveRef.price > 0 ? liveRef.price : null,
              priceUpdatedAt: liveRef ? liveRef.priceUpdatedAt : null,
              networkName: bc === 'arc' ? 'Arc Network' : (NETWORK_LABELS[bc] || bc.toUpperCase()),
              logoURI: resolveLocalBundledLogo({ symbol: rawSym }, registry) || safeLogo || ''
            });
          }
        }
      }

      const lifiArcList = arcscanTokRes.status === 'fulfilled' && arcscanTokRes.value?.ok
        ? arcscanTokRes.value.data?.tokens?.['5042']
        : null;
      if (Array.isArray(lifiArcList)) {
        for (const lt of lifiArcList) {
          if (!lt || !lt.address || !lt.symbol) continue;
          const addr = String(lt.address).trim();
          const addrLower = addr.toLowerCase();
          const rawSym = String(lt.symbol).trim();
          const rawName = String(lt.name || rawSym).trim();
          if (/^ARC$/i.test(rawSym) || addrLower === EVM_NATIVE_SENTINEL_LOWER) continue;
          const usdNum = Number(lt.priceUSD);
          if (Number.isFinite(usdNum) && usdNum > 0) arcLivePriceByContract[addrLower] = usdNum;
          const safeLogo = sanitizeImg(lt.logoURI);
          if (safeLogo && !arcLiveLogoByContract[addrLower]) {
            arcLiveLogoByContract[addrLower] = safeLogo;
            if (!kyberIconByContract[addrLower]) kyberIconByContract[addrLower] = safeLogo;
          }
          const dKey = `arc:${addrLower}`;
          if (seenDiscoveryKeys.has(dKey)) continue;
          seenDiscoveryKeys.add(dKey);
          const decParsed = Number(lt.decimals);
          extraDiscoveryTokens.push({
            symbol: rawSym,
            name: rawName,
            blockchain: 'arc',
            assetId: `arc:${addrLower}`,
            decimals: Number.isFinite(decParsed) && decParsed >= 0 ? decParsed : 18,
            contractAddress: addr,
            coingeckoId: null,
            price: Number.isFinite(usdNum) && usdNum > 0 ? usdNum : null,
            priceUpdatedAt: null,
            networkName: 'Arc Network',
            logoURI: resolveLocalBundledLogo({ symbol: rawSym }, registry) || safeLogo || ''
          });
        }
      }

      // Merge Arc Mainnet DexScreener prices (highest-liquidity pair per Arc contract)
      const arcDexData = arcDexRes && arcDexRes.status === 'fulfilled' && arcDexRes.value?.ok ? arcDexRes.value.data : null;
      if (arcDexData && Array.isArray(arcDexData.pairs)) {
        const bestArcLiq = Object.create(null);
        for (const pair of arcDexData.pairs) {
          const baseAddr = String(pair?.baseToken?.address || '').trim().toLowerCase();
          const pUsd = Number(pair?.priceUsd);
          const liqUsd = Number(pair?.liquidity?.usd || 0);
          if (!baseAddr || !Number.isFinite(pUsd) || pUsd <= 0) continue;
          if (liqUsd >= (bestArcLiq[baseAddr] ?? -1)) {
            bestArcLiq[baseAddr] = liqUsd;
            if (!arcLivePriceByContract[baseAddr] || liqUsd > 0) {
              arcLivePriceByContract[baseAddr] = pUsd;
            }
          }
        }
      }

      for (const extraTok of extraDiscoveryTokens) {
        if (extraTok.blockchain === 'arc' && !(extraTok.price > 0)) {
          const lp = arcLivePriceByContract[String(extraTok.contractAddress || '').toLowerCase()];
          if (lp > 0) extraTok.price = lp;
        }
        normalizedList.push(extraTok);
      }

      for (const norm of normalizedList) {
        const logo = resolveTokenLogo(norm);
        if (logo) norm.logoURI = logo;
      }

      _cachedDefuseTokens = normalizedList;

      if (registry) {
        if (typeof registry.registerDynamicTokenIcons === 'function') {
          registry.registerDynamicTokenIcons(
            { ...cgImageBySymbol, ...refIconBySymbol, ...kyberIconBySymbol, ...nearFtMetaIcons.bySymbol, ...jupXStockIcons },
            { ...refIconByContract, ...kyberIconByContract, ...nearFtMetaIcons.byContract }
          );
        }

        const coreTokens = Array.isArray(registry.UNIFIED_CORE_TOKENS) ? registry.UNIFIED_CORE_TOKENS : [];
        const dexGroups = registry.DEX_CHAIN_TOKENS && typeof registry.DEX_CHAIN_TOKENS === 'object'
          ? Object.values(registry.DEX_CHAIN_TOKENS)
          : [];
        const allTargetTokens = [...coreTokens];
        for (const groupList of dexGroups) {
          if (Array.isArray(groupList)) allTargetTokens.push(...groupList);
        }

        const updatedInRun = new Set();
        for (const token of allTargetTokens) {
          if (!token || !token.assetId) continue;
          const assetLower = String(token.assetId).toLowerCase();
          const tokenBc = String(token.blockchain || '').trim().toLowerCase();
          const contractLower = String(token.contractAddress || '').trim().toLowerCase();
          const ccKey = tokenBc && contractLower && contractLower !== EVM_NATIVE_SENTINEL_LOWER
            ? `${tokenBc}:${contractLower}`
            : '';
          const symUpper = String(token.symbol || '').trim().replace(/^\$/, '').toUpperCase();
          const symPriceLookup = tokenBc === 'arc' && symUpper === 'WUSDC'
            ? 'USDC'
            : (tokenBc === 'arc' && symUpper === 'CIRBTC' ? 'BTC' : symUpper);

          let live = byAssetId.get(assetLower)
            || (ccKey ? byChainContract.get(ccKey) : null)
            || (CANONICAL_PRICE_SYMBOLS.has(symPriceLookup) ? byCanonicalSymbol.get(symPriceLookup) : null)
            || null;
          if (live && (live.price === null || !(live.price > 0)) && CANONICAL_PRICE_SYMBOLS.has(symPriceLookup)) {
            const symFallback = byCanonicalSymbol.get(symPriceLookup);
            if (symFallback && symFallback.price > 0) live = symFallback;
          }

          if (live) {
            if (live.price !== null && live.price > 0) {
              token.price = live.price;
              token.priceUpdatedAt = live.priceUpdatedAt || null;
              updatedInRun.add(token);
            }
            if (live.contractAddress && !token.contractAddress) {
              token.contractAddress = live.contractAddress;
            }
            if (live.coingeckoId && !token.coingeckoId) {
              token.coingeckoId = live.coingeckoId;
            }
            if (typeof live.decimals === 'number' && typeof token.decimals !== 'number') {
              token.decimals = live.decimals;
            }
            if (live.logoURI && !token.logoURI) {
              token.logoURI = live.logoURI;
            }
          }
          if (tokenBc === 'near' && !updatedInRun.has(token) && contractLower && refPriceByContract[contractLower] > 0) {
            token.price = refPriceByContract[contractLower];
            updatedInRun.add(token);
          }

          const resolvedLogo = resolveTokenLogo(token);
          if (resolvedLogo) token.logoURI = resolvedLogo;

          // Fallback to DexScreener for Solana DEX mints if price not updated in this run
          if (tokenBc === 'sol') {
            const dsPrice = dexPriceByMint.get(contractLower) || dexPriceByMint.get(assetLower);
            if (dsPrice > 0 && !updatedInRun.has(token)) {
              token.price = dsPrice;
              updatedInRun.add(token);
            }
          }

          // Fallback to Jupiter V2 live prices for Solana xStocks
          if (tokenBc === 'sol') {
            const xsPrice = jupXStockByMint[contractLower] || jupXStockByMint[assetLower] || jupXStockBySym[symUpper];
            if (xsPrice > 0 && !updatedInRun.has(token)) {
              token.price = xsPrice;
              updatedInRun.add(token);
            }
          }
          if (!token.logoURI && jupXStockIcons[symUpper]) {
            token.logoURI = sanitizeImg(jupXStockIcons[symUpper]);
          }

          // Ensure PRL gets live market price even if 1Click omits it
          if (symUpper === 'PRL' && prlLivePrice > 0 && !updatedInRun.has(token)) {
            token.price = prlLivePrice;
            updatedInRun.add(token);
          }

          // Ensure HYPE / WHYPE get live market price from Hyperliquid if absent in 1Click
          if ((symUpper === 'HYPE' || symUpper === 'WHYPE') && hypeLivePrice > 0 && !updatedInRun.has(token)) {
            token.price = hypeLivePrice;
            updatedInRun.add(token);
          }

          // Fallback to CoinGecko top-250 live price or canonical base symbol price (WBNB->BNB, BTCB->BTC, USDbC->USDC)
          if (!updatedInRun.has(token) && CANONICAL_PRICE_SYMBOLS.has(symPriceLookup)) {
            const aliasSym = symUpper === 'WBNB' ? 'BNB'
              : (symUpper === 'BTCB' || symUpper === 'CBBTC' || symUpper === 'CIRBTC' ? 'BTC'
              : (symUpper === 'USDBC' || symUpper === 'WUSDC' ? 'USDC'
              : (symUpper === 'WETH' ? 'ETH' : symPriceLookup)));
            const aliasLive = byCanonicalSymbol.get(aliasSym);
            const cgHit = cgPriceBySymbol[symUpper] || cgPriceBySymbol[aliasSym];
            if (aliasLive && aliasLive.price > 0) {
              token.price = aliasLive.price;
              updatedInRun.add(token);
            } else if (cgHit > 0) {
              token.price = cgHit;
              updatedInRun.add(token);
            }
          }

          // Hydrate Arc Mainnet token live price & icon from Li.Fi / KyberSwap / DexScreener when present
          if (tokenBc === 'arc') {
            const arcP = arcLivePriceByContract[contractLower];
            if (arcP > 0 && !updatedInRun.has(token)) {
              token.price = arcP;
              updatedInRun.add(token);
            }
            if (!token.logoURI && arcLiveLogoByContract[contractLower]) {
              token.logoURI = arcLiveLogoByContract[contractLower];
            }
          }

          if (token.price === undefined) {
            token.price = null;
          }
        }

        if (registry.PEARL_DEFUSE_TOKEN && registry.PEARL_DEFUSE_TOKEN.assetId) {
          const livePrl = byAssetId.get(String(registry.PEARL_DEFUSE_TOKEN.assetId).toLowerCase()) || byCanonicalSymbol.get('PRL');
          if (livePrl && livePrl.price > 0) {
            registry.PEARL_DEFUSE_TOKEN.price = livePrl.price;
            registry.PEARL_DEFUSE_TOKEN.priceUpdatedAt = livePrl.priceUpdatedAt;
          } else if (prlLivePrice > 0) {
            registry.PEARL_DEFUSE_TOKEN.price = prlLivePrice;
          }
        }

        if (typeof registry.setLiveDefuseTokens === 'function') {
          registry.setLiveDefuseTokens(normalizedList);
        } else {
          registry.LIVE_DEFUSE_TOKENS = normalizedList;
        }

        // Batch DexScreener for non-Arc EVM/Solana DEX tokens + Arc KyberSwap background pricing
        const remainingDexTokens = allTargetTokens.filter(
          (t) => t && t.blockchain !== 'arc' && t.contractAddress
            && t.contractAddress.toLowerCase() !== EVM_NATIVE_SENTINEL_LOWER
            && !updatedInRun.has(t)
        );
        const fallbackFactories = [];
        if (remainingDexTokens.length > 0) {
          const uniqueAddrs = Array.from(new Set(remainingDexTokens.map((t) => String(t.contractAddress).trim())));
          const extraPriceMap = Object.create(null);
          const extraLiqMap = Object.create(null);
          const chunks = [];
          for (let i = 0; i < uniqueAddrs.length; i += 25) {
            chunks.push(uniqueAddrs.slice(i, i + 25));
          }
          for (const chunk of chunks) {
            fallbackFactories.push((sig) =>
              fetchJsonWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`, { signal: sig }, 3200)
                .then((dsResp) => {
                  const pairs = dsResp && dsResp.ok && dsResp.data && Array.isArray(dsResp.data.pairs) ? dsResp.data.pairs : [];
                  for (const pair of pairs) {
                    const bAddr = String(pair?.baseToken?.address || '').trim().toLowerCase();
                    const pUsd = Number(pair?.priceUsd);
                    const liqUsd = Number(pair?.liquidity?.usd || 0);
                    if (!bAddr || !Number.isFinite(pUsd) || pUsd <= 0) continue;
                    if (liqUsd >= (extraLiqMap[bAddr] ?? -1)) {
                      extraLiqMap[bAddr] = liqUsd;
                      extraPriceMap[bAddr] = pUsd;
                    }
                  }
                  for (const tok of remainingDexTokens) {
                    const addrLow = String(tok.contractAddress || '').trim().toLowerCase();
                    const foundP = extraPriceMap[addrLow];
                    if (foundP > 0 && !updatedInRun.has(tok)) {
                      tok.price = foundP;
                      updatedInRun.add(tok);
                    }
                  }
                })
                .catch(() => null)
            );
          }
        }
        const remainingArcTokens = allTargetTokens.filter(
          (t) => t && t.blockchain === 'arc' && t.contractAddress
            && t.contractAddress.toLowerCase() !== ARC_USDC_CONTRACT
            && t.contractAddress.toLowerCase() !== EVM_NATIVE_SENTINEL_LOWER
            && !updatedInRun.has(t)
        );
        if (remainingArcTokens.length > 0) {
          const arcByAddr = new Map();
          const nowMs = Date.now();
          for (const tok of remainingArcTokens) {
            const addrLow = String(tok.contractAddress || '').trim().toLowerCase();
            if (!addrLow) continue;
            const cachedArc = _arcKyberPriceCache.get(addrLow);
            if (cachedArc && cachedArc.fetchRef === curFetch && nowMs - cachedArc.ts < 600_000) {
              if (cachedArc.price > 0 && !updatedInRun.has(tok)) {
                tok.price = cachedArc.price;
                updatedInRun.add(tok);
              }
              continue;
            }
            if (!arcByAddr.has(addrLow)) arcByAddr.set(addrLow, []);
            arcByAddr.get(addrLow).push(tok);
          }
          const arcEntries = Array.from(arcByAddr.entries());
          if (arcEntries.length > 0) {
            fallbackFactories.push(async (sig) => {
              let idx = 0;
              const workerCount = Math.min(4, arcEntries.length);
              const runWorker = async () => {
                while (idx < arcEntries.length && !(sig && sig.aborted)) {
                  const [addrLow, tokGroup] = arcEntries[idx++];
                  const sample = tokGroup[0];
                  try {
                    const kResp = await fetchJsonWithTimeout(
                      `https://aggregator-api.kyberswap.com/arc/api/v1/routes?tokenIn=${ARC_USDC_CONTRACT}&tokenOut=${encodeURIComponent(sample.contractAddress)}&amountIn=10000000`,
                      { signal: sig, headers: { 'x-client-id': 'nexus-wallet' } },
                      1600
                    );
                    const rs = kResp && kResp.ok && kResp.data && kResp.data.code === 0 && kResp.data.data && kResp.data.data.routeSummary
                      ? kResp.data.data.routeSummary
                      : null;
                    if (!rs || !rs.amountOut) continue;
                    const dec = typeof sample.decimals === 'number' ? sample.decimals : 18;
                    const outHuman = Number(fromBaseUnits(String(rs.amountOut), dec));
                    const inUsd = Number(rs.amountInUsd || 10);
                    if (Number.isFinite(outHuman) && outHuman > 0 && Number.isFinite(inUsd) && inUsd > 0) {
                      const unitPrice = inUsd / outHuman;
                      _arcKyberPriceCache.set(addrLow, { price: unitPrice, ts: Date.now(), fetchRef: curFetch });
                      for (const t of tokGroup) {
                        if (!updatedInRun.has(t)) {
                          t.price = unitPrice;
                          updatedInRun.add(t);
                        }
                      }
                    }
                  } catch (_) {}
                }
              };
              await Promise.all(Array.from({ length: workerCount }, runWorker));
            });
          }
        }
        if (fallbackFactories.length > 0) {
          await settleWithSoftCap(fallbackFactories, 3500);
        }
      }

      if (Array.isArray(normalizedList) && normalizedList.length > 0) {
        _livePricesCache = { ts: Date.now(), list: normalizedList, fetchRef: curFetch };
      }

      return normalizedList;
    } catch (_) {
      return null;
    }
  }

