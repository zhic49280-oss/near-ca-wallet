  const DEFAULT_NEAR_NEP141_CONTRACTS = {
    'prl.omft.near': 8,
    'qtc.omft.near': 12,
    'usdt.tether-token.near': 6,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': 6,
    'eth.omft.near': 18,
    'sol.omft.near': 9,
    'btc.omft.near': 8,
    'token.rhealab.near': 18,
    'lst.rhealab.near': 24,
    'xtoken.rhealab.near': 18,
    'otoken.rhealab.near': 18,
    'meta-pool.near': 24,
    'linear-protocol.near': 24,
    'v2-nearx.stader-labs.near': 24
  };

  function normalizeNep141ContractsInput(contractsMap) {
    if (!contractsMap) return { ...DEFAULT_NEAR_NEP141_CONTRACTS };
    if (Array.isArray(contractsMap)) {
      const out = {};
      for (const item of contractsMap) {
        if (typeof item === 'string' && item.trim()) {
          const cid = item.trim();
          out[cid] = DEFAULT_NEAR_NEP141_CONTRACTS[cid] !== undefined
            ? DEFAULT_NEAR_NEP141_CONTRACTS[cid]
            : resolveTokenDecimals(`nep141:${cid}`);
        } else if (item && item.contractId) {
          out[String(item.contractId).trim()] = typeof item.decimals === 'number' ? item.decimals : 18;
        }
      }
      return out;
    }
    if (typeof contractsMap === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(contractsMap)) {
        if (!k) continue;
        if (typeof v === 'string' && v.trim()) {
          const cid = v.trim();
          const dec = DEFAULT_NEAR_NEP141_CONTRACTS[cid] !== undefined ? DEFAULT_NEAR_NEP141_CONTRACTS[cid] : resolveTokenDecimals(`nep141:${cid}`);
          out[cid] = dec;
        } else {
          out[String(k).trim()] = typeof v === 'number' ? v : (Number(v) || 18);
        }
      }
      return out;
    }
    return { ...DEFAULT_NEAR_NEP141_CONTRACTS };
  }

  const _nearFtMetaCache = new Map();

  async function fetchNearTokenMetadataOnChain(contractId) {
    const cid = String(contractId || '').trim().toLowerCase();
    if (!cid) return null;
    if (_nearFtMetaCache.has(cid)) return _nearFtMetaCache.get(cid);
    const payload = {
      jsonrpc: '2.0',
      id: `ft_meta_info_${cid}`,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: cid,
        method_name: 'ft_metadata',
        args_base64: 'e30='
      }
    };
    const resp = await nearRpcQueryWithFallback(payload, 3500).catch(() => null);
    const rawBytes = resp && resp.ok && resp.data && resp.data.result && Array.isArray(resp.data.result.result)
      ? resp.data.result.result
      : null;
    if (!rawBytes) return null;
    try {
      const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(rawBytes)));
      if (!meta || typeof meta !== 'object') return null;
      const registry = getTokenRegistry();
      const sanitizeImg = (registry && typeof registry.sanitizeImageUrl === 'function')
        ? registry.sanitizeImageUrl
        : (() => '');
      const out = {
        symbol: String(meta.symbol || '').trim().slice(0, 24),
        decimals: Number.isFinite(Number(meta.decimals)) ? Number(meta.decimals) : 18,
        name: String(meta.name || '').trim().slice(0, 48),
        icon: sanitizeImg(meta.icon)
      };
      _nearFtMetaCache.set(cid, out);
      return out;
    } catch (_) {
      return null;
    }
  }

  function isExcludedAutoNearContract(contractId) {
    const cid = String(contractId || '').trim().toLowerCase();
    if (!cid) return true;
    if (cid === 'aa-harvest-moon.near') return true;
    if (/DEPRECATED|TESTNEBULA/i.test(cid)) return true;
    if (/^(shadow|receipt|lp-|farm-|lockup)/i.test(cid)) return true;
    return false;
  }

  /**
   * Queries real NEP-141 token contracts on the NEAR blockchain via FastNear aggregated `/ft` API
   * (1 HTTP request for multi-token queries) with automatic fallback to `ft_balance_of` RPC calls.
   * Returns { [contractId]: { raw: string, formatted: number } } or null if RPC fails across all contracts.
   */
  async function fetchNearNep141Balances(nearAccountId, contractsMap = DEFAULT_NEAR_NEP141_CONTRACTS) {
    const accountId = String(nearAccountId || '').trim();
    const isDefaultQuery = contractsMap === DEFAULT_NEAR_NEP141_CONTRACTS || !contractsMap;
    const map = normalizeNep141ContractsInput(contractsMap);
    const entries = Object.entries(map);
    if (!accountId || entries.length === 0) return {};

    const results = {};
    let anySuccess = false;

    const applyAliases = () => {
      const aliasPairs = (contractsMap && typeof contractsMap === 'object' && !Array.isArray(contractsMap))
        ? Object.entries(contractsMap).filter(([, v]) => typeof v === 'string' && v.trim())
        : [];
      for (const [alias, cid] of aliasPairs) {
        if (results[cid.trim()] && !results[alias]) {
          results[alias] = results[cid.trim()];
        }
      }
    };

    const queryDirectFtBalance = async (contractId, decimals) => {
      const argsBase64 = utf8ToBase64(JSON.stringify({ account_id: accountId }));
      try {
        const resp = await nearRpcQueryWithFallback(
          {
            jsonrpc: '2.0',
            id: `nep141-bal-${contractId}`,
            method: 'query',
            params: {
              request_type: 'call_function',
              finality: 'final',
              account_id: contractId,
              method_name: 'ft_balance_of',
              args_base64: argsBase64
            }
          },
          5000
        );
        if (!resp || !resp.ok || !resp.data) return;
        if (resp.data.error) {
          if (isUnknownNearAccountError(resp.data.error)) {
            anySuccess = true;
            results[contractId] = { raw: '0', formatted: 0 };
          }
          return;
        }
        const rawByteArray = resp.data.result && resp.data.result.result;
        if (!Array.isArray(rawByteArray)) return;
        const decodedText = new TextDecoder().decode(new Uint8Array(rawByteArray));
        const parsedVal = JSON.parse(decodedText);
        const raw = parsedVal !== null && parsedVal !== undefined ? String(parsedVal) : '0';
        const formatted = Number(fromBaseUnits(raw, decimals));
        anySuccess = true;
        results[contractId] = {
          raw,
          formatted: Number.isFinite(formatted) ? formatted : 0
        };
      } catch (_) {}
    };

    if (entries.length > 2) {
      try {
        const fnResp = await fetchJsonWithTimeout(
          `${FASTNEAR_API_URL}/v1/account/${encodeURIComponent(accountId)}/ft`,
          {},
          4000
        );
        if (fnResp && fnResp.ok && fnResp.data && Array.isArray(fnResp.data.tokens)) {
          const balByContract = Object.create(null);
          const missingBalContracts = new Set();
          for (const tok of fnResp.data.tokens) {
            if (tok && tok.contract_id) {
              const cidLow = String(tok.contract_id).trim().toLowerCase();
              if (tok.balance === null || tok.balance === undefined || String(tok.balance).trim() === '') {
                missingBalContracts.add(cidLow);
              } else {
                balByContract[cidLow] = String(tok.balance);
              }
            }
          }
          const directFallbacks = [];
          for (const [contractId, decimals] of entries) {
            const cidLow = String(contractId).trim().toLowerCase();
            if (missingBalContracts.has(cidLow)) {
              directFallbacks.push([contractId, decimals]);
              continue;
            }
            const raw = balByContract[cidLow] || '0';
            const formatted = Number(fromBaseUnits(raw, decimals));
            results[contractId] = {
              raw,
              formatted: Number.isFinite(formatted) ? formatted : 0
            };
          }
          if (directFallbacks.length > 0) {
            await Promise.all(directFallbacks.map(([cid, dec]) => queryDirectFtBalance(cid, dec)));
          }
          if (isDefaultQuery) {
            const seenLower = new Set(Object.keys(results).map((k) => k.toLowerCase()));
            const registry = getTokenRegistry();
            const unknownDynamic = [];
            for (const tok of fnResp.data.tokens) {
              if (!tok || !tok.contract_id) continue;
              const rawCid = String(tok.contract_id).trim();
              const cidLow = rawCid.toLowerCase();
              if (seenLower.has(cidLow) || isExcludedAutoNearContract(cidLow)) continue;
              const rawStr = tok.balance !== null && tok.balance !== undefined ? String(tok.balance).trim() : '';
              if (!/^\d+$/.test(rawStr)) continue;
              let posBal = false;
              try { posBal = BigInt(rawStr) > 0n; } catch (_) {}
              if (!posBal) continue;
              const liveMatch = (Array.isArray(_cachedDefuseTokens) ? _cachedDefuseTokens : []).find(
                (t) => t && String(t.blockchain || '').toLowerCase() === 'near' && String(t.contractAddress || '').toLowerCase() === cidLow
              );
              const regMatch = !liveMatch && registry && typeof registry.findTokenByAssetId === 'function'
                ? registry.findTokenByAssetId(`nep141:${rawCid}`, 'near')
                : null;
              const metaKnown = liveMatch || regMatch;
              if (metaKnown) {
                const dec = typeof metaKnown.decimals === 'number' ? metaKnown.decimals : resolveTokenDecimals(`nep141:${rawCid}`);
                const formatted = Number(fromBaseUnits(rawStr, dec));
                results[rawCid] = {
                  raw: rawStr,
                  formatted: Number.isFinite(formatted) ? formatted : 0,
                  symbol: metaKnown.symbol || undefined,
                  decimals: dec,
                  icon: metaKnown.logoURI || undefined
                };
                seenLower.add(cidLow);
              } else {
                unknownDynamic.push({ cid: rawCid, raw: rawStr });
                seenLower.add(cidLow);
              }
            }
            if (unknownDynamic.length > 0) {
              await Promise.all(unknownDynamic.slice(0, 8).map(async (item) => {
                const meta = await fetchNearTokenMetadataOnChain(item.cid);
                if (!meta || !meta.symbol || /DEPRECATED|TESTNEBULA/i.test(`${meta.symbol} ${meta.name}`)) return;
                const formatted = Number(fromBaseUnits(item.raw, meta.decimals));
                if (!(formatted > 0)) return;
                results[item.cid] = {
                  raw: item.raw,
                  formatted: Number.isFinite(formatted) ? formatted : 0,
                  symbol: meta.symbol,
                  decimals: meta.decimals,
                  icon: meta.icon || undefined
                };
              }));
            }
          }
          applyAliases();
          return results;
        }
      } catch (_) {}
    }

    await Promise.all(entries.map(([contractId, decimals]) => queryDirectFtBalance(contractId, decimals)));

    applyAliases();
    return anySuccess ? results : null;
  }

  /**
   * Queries intents.near mt_batch_balance_of for unified multi-token balances.
   * Returns { [assetId]: { raw: string, formatted: number } } or null on RPC failure.
   */
  async function fetchIntentsUnifiedBalances(nearAccountId, assetIds = []) {
    const accountId = String(nearAccountId || '').trim();
    if (!accountId || !Array.isArray(assetIds) || assetIds.length === 0) {
      return {};
    }

    const argsBase64 = utf8ToBase64(
      JSON.stringify({
        account_id: accountId,
        token_ids: assetIds
      })
    );

    try {
      const resp = await nearRpcQueryWithFallback(
        {
          jsonrpc: '2.0',
          id: 'intents-mt-batch-balance',
          method: 'query',
          params: {
            request_type: 'call_function',
            finality: 'final',
            account_id: INTENTS_CONTRACT_ID,
            method_name: 'mt_batch_balance_of',
            args_base64: argsBase64
          }
        },
        5000
      );

      if (!resp || !resp.ok || !resp.data || resp.data.error) {
        return null;
      }
      const rawByteArray = resp.data.result && resp.data.result.result;
      if (!Array.isArray(rawByteArray)) {
        return null;
      }

      const decodedText = new TextDecoder().decode(new Uint8Array(rawByteArray));
      const balances = JSON.parse(decodedText);
      if (!Array.isArray(balances)) {
        return null;
      }

      const result = {};
      for (let i = 0; i < assetIds.length; i++) {
        const assetId = assetIds[i];
        const raw = balances[i] !== undefined && balances[i] !== null ? String(balances[i]) : '0';
        const decimals = resolveTokenDecimals(assetId);
        const formatted = Number(fromBaseUnits(raw, decimals));
        result[assetId] = {
          raw,
          formatted: Number.isFinite(formatted) ? formatted : 0
        };
      }
      return result;
    } catch (_) {
      return null;
    }
  }

  function normalizeDefuseToken(item) {
    const bc = String(item.blockchain || '').toLowerCase();
    let netLabel = NETWORK_LABELS[bc] || bc.toUpperCase();
    if (bc === 'hypercore') {
      if (String(item.assetId || '').includes(':hip1:')) netLabel = 'Hyperliquid (Spot)';
      else if (String(item.assetId || '').includes(':erc20:')) netLabel = 'Hyperliquid (HyperEVM)';
    }
    const parsedPrice = item.price !== null && item.price !== undefined ? Number(item.price) : NaN;
    const price = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null;

    return {
      symbol: item.symbol || 'TOKEN',
      name: item.name || item.symbol || 'Token',
      blockchain: bc,
      assetId: item.assetId,
      decimals: typeof item.decimals === 'number' ? item.decimals : (Number(item.decimals) || 18),
      contractAddress: item.contractAddress || null,
      coingeckoId: item.coingeckoId || null,
      price,
      priceUpdatedAt: item.priceUpdatedAt || null,
      networkName: netLabel
    };
  }

  const SOL_DEXSCREENER_MINTS = [
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
    'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
    '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
    '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump',
    '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
    'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
    'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux',
    'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS',
    'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7',
    'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs',
    '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ'
  ];
  const EVM_NATIVE_SENTINEL_LOWER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

  const DEAD_ONECLICK_SYMBOL_REGEX = /^(SSC1_PIT|FOGO|TITN|INX|ADI|VVV|TLO|FMS|TMU|NZHIPU|STJACK|STRKBTC|KV-GTSOLB|GTUSDCP|SPARKUSDC|MWUSDC|LAUSDC|SUSDC|STEAKUSDC|USAD|USDCX|HEMIBTC)$/i;
  const _nearFtIconCache = new Map();

  async function fetchNearFtMetadataIcons(nearTokens, sanitizeImg) {
    const byContract = Object.create(null);
    const bySymbol = Object.create(null);
    if (!Array.isArray(nearTokens) || nearTokens.length === 0) return { byContract, bySymbol };

    const skipContracts = new Set([
      'wrap.near',
      'eth.bridge.near',
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      'usdt.tether-token.near',
      'prl.omft.near',
      'qtc.omft.near'
    ]);

    const pending = [];
    const seenCids = new Set();
    for (const tok of nearTokens) {
      if (!tok || !tok.contractAddress) continue;
      const cid = String(tok.contractAddress).trim();
      const cidLower = cid.toLowerCase();
      const symUpper = String(tok.symbol || '').trim().replace(/^\$/, '').toUpperCase();
      if (!cid || skipContracts.has(cidLower) || seenCids.has(cidLower)) continue;
      seenCids.add(cidLower);
      if (_nearFtIconCache.has(cidLower)) {
        const cachedIcon = _nearFtIconCache.get(cidLower);
        if (cachedIcon) {
          byContract[cidLower] = cachedIcon;
          if (symUpper && !bySymbol[symUpper]) bySymbol[symUpper] = cachedIcon;
        }
        continue;
      }
      pending.push({ cid, cidLower, symUpper });
    }

    if (pending.length > 0) {
      await Promise.allSettled(
        pending.slice(0, 24).map(async ({ cid, cidLower, symUpper }) => {
          const payload = {
            jsonrpc: '2.0',
            id: `ft_meta_${cidLower}`,
            method: 'query',
            params: {
              request_type: 'call_function',
              finality: 'final',
              account_id: cid,
              method_name: 'ft_metadata',
              args_base64: 'e30='
            }
          };
          const resp = await nearRpcQueryWithFallback(payload, 3500).catch(() => null);
          const rawBytes = resp && resp.ok && resp.data && resp.data.result && Array.isArray(resp.data.result.result)
            ? resp.data.result.result
            : null;
          if (!rawBytes) return;
          const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(rawBytes)));
          const rawIcon = meta && typeof meta.icon === 'string' ? meta.icon.trim() : '';
          if (!rawIcon || rawIcon.includes('R0lGODlhAQABAIAAAAAAAP') || /ref-new-1\.s3\.amazonaws\.com/i.test(rawIcon)) {
            return;
          }
          const safe = sanitizeImg(rawIcon);
          if (safe) {
            _nearFtIconCache.set(cidLower, safe);
            byContract[cidLower] = safe;
            if (symUpper && !bySymbol[symUpper]) bySymbol[symUpper] = safe;
          }
        })
      );
    }

    return { byContract, bySymbol };
  }

  /**
   * Searches live Solana tokens on Jupiter V2 Search API (`lite-api.jup.ag/tokens/v2/search`).
   */
  async function searchJupiterTokensV2(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    try {
      const resp = await fetchJsonWithTimeout(
        `${JUPITER_BASE_URL}/tokens/v2/search?query=${encodeURIComponent(q)}`,
        {},
        DEFAULT_TIMEOUT_MS
      );
      if (!resp.ok || !Array.isArray(resp.data)) return [];
      const registry = getTokenRegistry();
      const sanitizeImg = (registry && typeof registry.sanitizeImageUrl === 'function')
        ? registry.sanitizeImageUrl
        : (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
      const symIcons = {};
      const out = [];
      for (const item of resp.data) {
        if (!item || !item.id || !item.symbol) continue;
        const symClean = String(item.symbol).trim();
        const safeIcon = sanitizeImg(item.icon);
        if (safeIcon) symIcons[symClean] = safeIcon;
        const parsedPrice = Number(item.usdPrice);
        const isXStock = /xstock/i.test(item.name || '') || /x$/i.test(symClean) && /^Xs|^Xsc|^Xsb|^Xsp|^Xsa|^Xso/i.test(item.id);
        out.push({
          symbol: symClean,
          name: item.name || symClean,
          blockchain: 'sol',
          assetId: item.id,
          contractAddress: item.id,
          decimals: typeof item.decimals === 'number' ? item.decimals : 6,
          networkName: isXStock ? 'Solana (xStocks)' : 'Solana',
          category: isXStock ? 'xstock' : undefined,
          logoURI: safeIcon || '',
          price: Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : null
        });
      }
      if (registry && typeof registry.registerDynamicTokenIcons === 'function') {
        registry.registerDynamicTokenIcons(symIcons, {});
      }
      return out;
    } catch (_) {
      return [];
    }
  }

  let _livePricesCache = { ts: 0, list: null };
  let _livePricesInFlight = null;
  let _ftIconBgStarted = false;

