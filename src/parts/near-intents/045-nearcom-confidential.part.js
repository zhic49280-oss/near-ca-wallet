  // ==================== near.com Confidential Intents (1CS) Client ====================

  const NEARCOM_ORIGIN = 'https://near.com';
  const NEARCOM_CLI_VERSION = '0.4.0';
  const CONFIDENTIAL_VERIFYING_CONTRACT = 'intents.far';

  const _nearcomSessions = new Map();
  const _nearcomAuthInFlight = new Map();

  const NEARCOM_CHAIN_NAME_MAP = {
    near: 'near',
    prl: 'prl',
    qtc: 'qtc',
    sol: 'solana',
    btc: 'bitcoin',
    eth: 'eth',
    base: 'base',
    arb: 'arbitrum',
    bsc: 'bsc',
    op: 'optimism',
    pol: 'polygon',
    avax: 'avalanche',
    hood: 'hood',
    tron: 'tron',
    ton: 'ton',
    sui: 'sui',
    aptos: 'aptos',
    doge: 'dogecoin',
    xrp: 'xrpledger'
  };

  function toNearcomChainName(blockchain) {
    const bc = String(blockchain || '').trim().toLowerCase();
    return NEARCOM_CHAIN_NAME_MAP[bc] || bc;
  }

  function toNearcomConfidentialAssetId(tokenOrAssetId, blockchainHint = '') {
    const raw = typeof tokenOrAssetId === 'object' && tokenOrAssetId
      ? String(tokenOrAssetId.assetId || '')
      : String(tokenOrAssetId || '');
    const low = raw.trim().toLowerCase();
    if (low === PRL_PEARL_ASSET_ID || low === PRL_NEAR_ASSET_ID || low === PRL_NEAR_CONTRACT) {
      return PRL_PEARL_ASSET_ID;
    }
    if (low === QTC_ORIGIN_ASSET_ID || low === QTC_NEAR_ASSET_ID || low === QTC_NEAR_CONTRACT) {
      return QTC_ORIGIN_ASSET_ID;
    }
    const resolved = resolveOneClickAssetId(tokenOrAssetId, blockchainHint);
    if (String(resolved || '').toLowerCase().startsWith('1cs_v1:near:nep141:')) {
      return resolved.slice('1cs_v1:near:'.length);
    }
    return resolved;
  }

  function toNearcomDepositRoutingAsset(confAssetId, chainName) {
    const asset = String(confAssetId || '').trim();
    const chain = String(chainName || '').trim().toLowerCase();
    if (chain === 'near' && asset === QTC_ORIGIN_ASSET_ID) return QTC_NEAR_ASSET_ID;
    if (chain === 'near' && asset === PRL_PEARL_ASSET_ID) return PRL_NEAR_ASSET_ID;
    return asset;
  }

  function toNearcomWithdrawDestinationAsset(confAssetId, chainName) {
    return toNearcomDepositRoutingAsset(confAssetId, chainName);
  }

  function generateNearcomUuidV4() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    const rnd = (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function')
      ? globalThis.crypto.getRandomValues(new Uint8Array(16))
      : Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    rnd[6] = (rnd[6] & 0x0f) | 0x40;
    rnd[8] = (rnd[8] & 0x3f) | 0x80;
    const hex = Array.from(rnd, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  async function nearcomApiRequest(apiPath, { method = 'POST', body = undefined, accessToken = '', signal = null, timeoutMs = 15000 } = {}) {
    const isGet = String(method || 'GET').toUpperCase() === 'GET';
    const headers = {
      'Accept': 'application/json',
      'x-nearcom-cli-version': NEARCOM_CLI_VERSION
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    if (!isGet && body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const isNativeCap = Boolean(
      typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform() &&
      window.Capacitor.Plugins &&
      window.Capacitor.Plugins.CapacitorHttp &&
      typeof window.Capacitor.Plugins.CapacitorHttp.request === 'function'
    );
    const directUrl = `${NEARCOM_ORIGIN}${apiPath}`;
    if (isNativeCap) {
      const capRes = await window.Capacitor.Plugins.CapacitorHttp.request({
        url: directUrl,
        method: isGet ? 'GET' : 'POST',
        headers,
        data: !isGet && body !== undefined ? body : undefined,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs
      });
      const parsed = typeof capRes.data === 'string' ? (() => { try { return JSON.parse(capRes.data); } catch (_) { return null; } })() : capRes.data;
      return {
        ok: capRes.status >= 200 && capRes.status < 300,
        status: capRes.status || 0,
        data: parsed
      };
    }

    const isDevServer = Boolean(
      typeof window !== 'undefined' &&
      window.location &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      window.location.port
    );
    const url = isDevServer ? `/nearcom-proxy?path=${encodeURIComponent(apiPath)}` : directUrl;
    const reqOpts = {
      method: isGet ? 'GET' : 'POST',
      headers,
      signal
    };
    if (!isGet && body !== undefined) {
      reqOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return fetchJsonWithTimeout(url, reqOpts, timeoutMs);
  }

  function resolveNearcomSignerCredentials(walletOrParams = {}) {
    const signerId = String(
      walletOrParams.signerId ||
      walletOrParams.nearImplicitAddress ||
      walletOrParams.nearAddress ||
      walletOrParams.nearAccountId ||
      walletOrParams.nearNamedAccount ||
      ''
    ).trim().toLowerCase();
    const nearPrivateSeedHex = String(walletOrParams.nearPrivateSeedHex || '').trim();
    const nearPublicKey = String(walletOrParams.nearPublicKey || '').trim();
    return { signerId, nearPrivateSeedHex, nearPublicKey };
  }

  async function authenticateNearcomConfidentialSession(walletOrParams = {}, { forceRefresh = false, signal = null } = {}) {
    const { signerId, nearPrivateSeedHex, nearPublicKey } = resolveNearcomSignerCredentials(walletOrParams);
    if (!signerId || !nearPrivateSeedHex || !nearPublicKey) {
      throw new Error(t('缺少 NEAR 签名凭据，无法登录机密意图账户', 'Missing NEAR signing credentials for confidential intents'));
    }

    const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
    const cached = _nearcomSessions.get(signerId);
    if (!forceRefresh && cached && cached.fetchRef === curFetch && cached.accessToken && cached.expiresAt > Date.now() + 60_000) {
      return cached;
    }

    const inflight = _nearcomAuthInFlight.get(signerId);
    if (!forceRefresh && inflight && inflight.fetchRef === curFetch) {
      return inflight.promise;
    }

    const runAuth = (async () => {
      if (cached && cached.fetchRef === curFetch && cached.refreshToken && !forceRefresh) {
        const refRes = await nearcomApiRequest('/api/auth/refresh', {
          method: 'POST',
          body: { address: signerId, authMethod: 'near', refreshToken: cached.refreshToken },
          signal,
          timeoutMs: 8000
        }).catch(() => null);
        if (refRes && refRes.ok && refRes.data && refRes.data.accessToken) {
          const nextSess = {
            signerId,
            accessToken: refRes.data.accessToken,
            refreshToken: refRes.data.refreshToken || cached.refreshToken,
            expiresAt: Number(refRes.data.expiresAt) || (Date.now() + 14 * 60_000),
            fetchRef: curFetch
          };
          _nearcomSessions.set(signerId, nextSess);
          return nextSess;
        }
      }

      const msgRes = await nearcomApiRequest('/api/auth/message', {
        method: 'POST',
        body: { address: signerId, authMethod: 'near' },
        signal,
        timeoutMs: 8000
      });
      const msgObj = msgRes && msgRes.ok && msgRes.data && msgRes.data.message;
      if (!msgObj || typeof msgObj.message !== 'string' || !Array.isArray(msgObj.nonce) || msgObj.nonce.length !== 32) {
        throw new Error((msgRes && msgRes.data && (msgRes.data.error || msgRes.data.message)) || t('获取 near.com 登录挑战失败', 'Failed to obtain near.com auth challenge'));
      }

      const cryptoEngine = getCryptoEngine();
      if (!cryptoEngine || typeof cryptoEngine.signNep413IntentMessageAsync !== 'function') {
        throw new Error(t('NEP-413 签名引擎不可用', 'NEP-413 signer unavailable'));
      }
      const signed = await cryptoEngine.signNep413IntentMessageAsync({
        message: msgObj.message,
        recipient: msgObj.recipient || INTENTS_CONTRACT_ID,
        nonceBytes: Uint8Array.from(msgObj.nonce),
        nearPrivateSeedHex,
        nearPublicKey
      });
      const authRes = await nearcomApiRequest('/api/auth/authenticate', {
        method: 'POST',
        body: {
          address: signerId,
          authMethod: 'near',
          signedData: {
            standard: 'nep413',
            payload: {
              message: msgObj.message,
              nonce: signed.nonceBase64,
              recipient: msgObj.recipient || INTENTS_CONTRACT_ID
            },
            signature: signed.signature,
            public_key: signed.publicKey
          }
        },
        signal,
        timeoutMs: 8000
      });
      if (!authRes || !authRes.ok || !authRes.data || !authRes.data.accessToken) {
        throw new Error((authRes && authRes.data && (authRes.data.error || authRes.data.message)) || t('near.com 机密账户认证失败', 'near.com confidential auth failed'));
      }
      const session = {
        signerId,
        accessToken: authRes.data.accessToken,
        refreshToken: authRes.data.refreshToken || '',
        expiresAt: Number(authRes.data.expiresAt) || (Date.now() + 14 * 60_000),
        fetchRef: curFetch
      };
      _nearcomSessions.set(signerId, session);
      return session;
    })().finally(() => {
      const cur = _nearcomAuthInFlight.get(signerId);
      if (cur && cur.promise === runAuth) _nearcomAuthInFlight.delete(signerId);
    });

    _nearcomAuthInFlight.set(signerId, { fetchRef: curFetch, promise: runAuth });
    return runAuth;
  }

  async function nearcomAuthedRequest(walletOrParams, apiPath, { method = 'POST', body = undefined, signal = null, timeoutMs = 15000 } = {}) {
    let sess = await authenticateNearcomConfidentialSession(walletOrParams, { signal });
    let res = await nearcomApiRequest(apiPath, { method, body, accessToken: sess.accessToken, signal, timeoutMs });
    if (res && res.status === 401) {
      _nearcomSessions.delete(sess.signerId);
      sess = await authenticateNearcomConfidentialSession(walletOrParams, { forceRefresh: true, signal });
      res = await nearcomApiRequest(apiPath, { method, body, accessToken: sess.accessToken, signal, timeoutMs });
    }
    return { res, session: sess };
  }

  async function fetchNearcomConfidentialBalances(wallet) {
    const { res } = await nearcomAuthedRequest(wallet, '/api/account/balances', { method: 'GET', timeoutMs: 8000 });
    if (!res || !res.ok || !res.data || !Array.isArray(res.data.balances)) {
      return { ok: false, balances: [], error: (res && res.data && res.data.error) || 'Failed to fetch confidential balances' };
    }
    return { ok: true, balances: res.data.balances };
  }

  async function quoteNearcomConfidentialSwap({
    fromToken,
    toToken,
    amountRaw,
    slippageBps = 100,
    nearPrivateSeedHex = '',
    nearPublicKey = '',
    nearImplicitAddress = '',
    nearAddress = '',
    nearAccountId = '',
    wallet = null,
    appFeeBps = 25,
    dry = true,
    signal = null
  } = {}) {
    try {
      const creds = resolveNearcomSignerCredentials(wallet || {
        nearPrivateSeedHex,
        nearPublicKey,
        nearImplicitAddress: nearImplicitAddress || nearAddress,
        nearAccountId
      });
      if (!creds.signerId || !creds.nearPrivateSeedHex || !creds.nearPublicKey) {
        return { ok: false, error: t('缺少 NEAR 签名凭据', 'Missing NEAR signing credentials') };
      }
      const amtStr = String(amountRaw || '0').trim();
      if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
        return { ok: false, error: t('兑换数量无效', 'Invalid swap amount') };
      }
      const fromBc = String(fromToken && fromToken.blockchain || '').toLowerCase();
      const toBc = String(toToken && toToken.blockchain || '').toLowerCase();
      const confOriginAsset = toNearcomConfidentialAssetId(fromToken, fromBc);
      const confDestAsset = toNearcomConfidentialAssetId(toToken, toBc);
      if (!/^(nep141:|nep245:)/i.test(confOriginAsset) || !/^(nep141:|nep245:)/i.test(confDestAsset)) {
        return { ok: false, error: t('机密路由不支持该代币', 'Token not supported on confidential route') };
      }
      if (confOriginAsset.toLowerCase() === confDestAsset.toLowerCase() && fromBc === toBc) {
        return { ok: false, error: 'same-asset' };
      }

      const feeBps = Number.isFinite(Number(appFeeBps)) ? Math.max(0, Math.round(Number(appFeeBps))) : 25;
      const body = {
        dry: Boolean(dry),
        swapType: 'EXACT_INPUT',
        originAsset: confOriginAsset,
        destinationAsset: confDestAsset,
        amount: amtStr,
        slippageTolerance: Number(slippageBps) || 100,
        deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        userAddress: creds.signerId,
        authMethod: 'near'
      };
      if (!dry) body.idempotencyKey = generateNearcomUuidV4();

      const { res } = await nearcomAuthedRequest(creds, '/api/swap/quote', {
        method: 'POST',
        body,
        signal,
        timeoutMs: dry ? 7000 : 12000
      });
      if (!res || !res.ok || !res.data || !res.data.ok || !res.data.ok.quote) {
        const errMsg = (res && res.data && (res.data.err || res.data.error || res.data.message)) || `Confidential quote HTTP ${res ? res.status : 'ERR'}`;
        return { ok: false, error: String(errMsg) };
      }
      const quoteObj = res.data.ok;
      const grossOutStr = String(quoteObj.quote.amountOut || '0');
      if (!/^\d+$/.test(grossOutStr) || BigInt(grossOutStr) <= 0n) {
        return { ok: false, error: t('机密路由暂无有效报价', 'No valid confidential quote') };
      }
      const grossOut = BigInt(grossOutStr);
      const feeRaw = feeBps > 0 ? (grossOut * BigInt(feeBps)) / 10000n : 0n;
      const netOut = grossOut > feeRaw ? (grossOut - feeRaw) : grossOut;
      const destDecimals = typeof toToken.decimals === 'number' ? toToken.decimals : resolveTokenDecimals(confDestAsset, toBc);
      const fromChainName = toNearcomChainName(fromBc);
      const toChainName = toNearcomChainName(toBc);

      const grossUsdNum = quoteObj.quote.amountOutUsd ? Number(quoteObj.quote.amountOutUsd) : NaN;
      const netOutUsd = Number.isFinite(grossUsdNum) && grossUsdNum > 0
        ? (grossUsdNum * (1 - feeBps / 10000)).toFixed(4)
        : (quoteObj.quote.amountOutUsd || null);

      return {
        ok: true,
        compositeType: 'NEARCOM_CONFIDENTIAL_SWAP',
        routeSource: 'NEARCOM_CONFIDENTIAL_1CS',
        bestSource: 'near.com 1CS',
        routeLabel: '⚡ Confidential Intents',
        depositAddress: null,
        memo: null,
        amountOut: netOut.toString(),
        grossAmountOut: grossOut.toString(),
        feeAmountOut: feeRaw.toString(),
        feeRecipient: DEFAULT_REFERRAL_ACCOUNT,
        amountOutFormatted: fromBaseUnits(netOut.toString(), destDecimals),
        amountInUsd: quoteObj.quote.amountInUsd || null,
        amountOutUsd: netOutUsd,
        serviceFeeBps: feeBps,
        confidentialQuote: quoteObj,
        originAsset: confOriginAsset,
        destinationAsset: confDestAsset,
        originChain: fromChainName,
        destinationChain: toChainName,
        error: null
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : t('机密路由询价失败', 'Confidential quote failed') };
    }
  }

  async function requestNearcomConfidentialDeposit({ wallet, fromToken, originAsset = '', originChain = '', amountRaw } = {}) {
    const creds = resolveNearcomSignerCredentials(wallet);
    const bc = originChain || toNearcomChainName(fromToken && fromToken.blockchain);
    const confAsset = originAsset || toNearcomConfidentialAssetId(fromToken, fromToken && fromToken.blockchain);
    const routingAsset = toNearcomDepositRoutingAsset(confAsset, bc);
    const deadline = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    const { res } = await nearcomAuthedRequest(creds, '/api/deposit/quote', {
      method: 'POST',
      body: {
        originAsset: routingAsset,
        destinationAsset: routingAsset,
        originChain: bc,
        accountId: creds.signerId,
        amount: String(amountRaw),
        deadline
      },
      timeoutMs: 12000
    });
    if (!res || !res.ok || !res.data || !res.data.quote || !res.data.quote.depositAddress) {
      const errMsg = (res && res.data && (res.data.error || res.data.message)) || t('获取 near.com 机密入金地址失败', 'Failed to obtain confidential deposit address');
      return { ok: false, error: String(errMsg) };
    }
    return {
      ok: true,
      depositAddress: res.data.quote.depositAddress,
      memo: res.data.quote.depositMemo || null,
      amountOut: res.data.quote.amountOut || String(amountRaw),
      proof: res.data
    };
  }

  async function fetchNearcomConfidentialDepositStatus({ wallet, proof } = {}) {
    if (!proof) return { ok: false, status: null, error: 'Missing deposit proof' };
    const { res } = await nearcomAuthedRequest(wallet, '/api/deposit/status', {
      method: 'POST',
      body: { proof },
      timeoutMs: 8000
    });
    if (!res || !res.ok || !res.data || !res.data.status) {
      return { ok: false, status: null, error: (res && res.data && res.data.error) || 'Deposit status check failed' };
    }
    return { ok: true, status: res.data.status };
  }

  async function signConfidentialNep413Intent({ wallet, generatedIntent, expectedRecipient = '', expectedContract = CONFIDENTIAL_VERIFYING_CONTRACT } = {}) {
    const creds = resolveNearcomSignerCredentials(wallet);
    if (!generatedIntent || generatedIntent.standard !== 'nep413' || !generatedIntent.payload) {
      throw new Error(t('无效的 NEP-413 机密意图负载', 'Invalid confidential NEP-413 intent payload'));
    }
    const payload = generatedIntent.payload;
    if (typeof payload.message !== 'string' || !payload.nonce || !payload.recipient) {
      throw new Error(t('机密意图消息字段缺失', 'Confidential intent payload missing required fields'));
    }
    if (expectedContract && payload.recipient !== expectedContract) {
      throw new Error(t(`机密意图校验合约不匹配: ${payload.recipient}`, `Confidential intent recipient mismatch: ${payload.recipient}`));
    }
    if (expectedRecipient) {
      let parsedMsg;
      try { parsedMsg = JSON.parse(payload.message); } catch (_) { parsedMsg = null; }
      const transferAct = parsedMsg && Array.isArray(parsedMsg.intents) ? parsedMsg.intents[0] : null;
      if (!transferAct || transferAct.intent !== 'transfer' || transferAct.receiver_id !== expectedRecipient) {
        throw new Error(t('机密意图收款地址校验失败', 'Confidential intent receiver mismatch'));
      }
    }
    const cryptoEngine = getCryptoEngine();
    const signed = await cryptoEngine.signNep413IntentMessageAsync({
      message: payload.message,
      recipient: payload.recipient,
      nonceBytes: payload.nonce,
      nearPrivateSeedHex: creds.nearPrivateSeedHex,
      nearPublicKey: creds.nearPublicKey
    });
    return {
      standard: 'nep413',
      payload: {
        message: payload.message,
        nonce: payload.nonce,
        recipient: payload.recipient
      },
      public_key: signed.publicKey,
      signature: signed.signature
    };
  }

  async function executeNearcomConfidentialSwapAndWithdraw({
    wallet,
    originAsset,
    destinationAsset,
    destinationChain,
    amountInRaw,
    slippageBps = 100,
    recipient,
    feeBps = 25,
    feeRecipient = DEFAULT_REFERRAL_ACCOUNT,
    swapDepositAddress: existingSwapDepositAddress = '',
    swapIntentHash: existingSwapIntentHash = '',
    settledOutRaw: existingSettledOutRaw = '',
    onStepASettled = null
  } = {}) {
    const creds = resolveNearcomSignerCredentials(wallet);
    if (!creds.signerId || !creds.nearPrivateSeedHex || !creds.nearPublicKey) {
      throw new Error(t('缺少 NEAR 签名凭据', 'Missing NEAR signing credentials'));
    }

    let swapQuoteOk = null;
    let swapDepositAddr = String(existingSwapDepositAddress || '').trim();
    let swapIntentHash = String(existingSwapIntentHash || '').trim();
    let settledOutStr = (existingSettledOutRaw && /^\d+$/.test(String(existingSettledOutRaw)) && BigInt(String(existingSettledOutRaw)) > 0n)
      ? String(existingSettledOutRaw)
      : '0';
    let swapSettled = BigInt(settledOutStr) > 0n;

    if (!swapSettled) {
      if (!swapDepositAddr) {
        // Check confidential balance for originAsset so slight deposit variance never causes insufficient balance
        let swapInBig = BigInt(String(amountInRaw || '0'));
        const balRes = await fetchNearcomConfidentialBalances(wallet).catch(() => null);
        if (balRes && balRes.ok && Array.isArray(balRes.balances)) {
          const hit = balRes.balances.find((b) => String(b.tokenId || '').toLowerCase() === String(originAsset || '').toLowerCase());
          if (hit && /^\d+$/.test(String(hit.available))) {
            const availBig = BigInt(String(hit.available));
            if (availBig > 0n && availBig < swapInBig) swapInBig = availBig;
          }
        }
        if (swapInBig <= 0n) {
          throw new Error(t('机密账户余额不足以发起兑换', 'Insufficient confidential balance for swap'));
        }

        // Step A: Confidential Swap (/api/swap/quote -> /intent -> NEP-413 sign -> /submit -> /status)
        const { res: swapQRes } = await nearcomAuthedRequest(creds, '/api/swap/quote', {
          method: 'POST',
          body: {
            dry: false,
            swapType: 'EXACT_INPUT',
            originAsset,
            destinationAsset,
            amount: swapInBig.toString(),
            slippageTolerance: Number(slippageBps) || 100,
            deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            userAddress: creds.signerId,
            authMethod: 'near',
            idempotencyKey: generateNearcomUuidV4()
          },
          timeoutMs: 12000
        });
        if (!swapQRes || !swapQRes.ok || !swapQRes.data || !swapQRes.data.ok || !swapQRes.data.ok.quote) {
          throw new Error((swapQRes && swapQRes.data && (swapQRes.data.err || swapQRes.data.error)) || t('创建机密兑换订单失败', 'Failed to create confidential swap quote'));
        }
        swapQuoteOk = swapQRes.data.ok;
        swapDepositAddr = swapQuoteOk.quote.depositAddress;
        const { appFee: _ignoredFee, ...quoteWithoutFee } = swapQuoteOk;

        const { res: swapIntentRes } = await nearcomAuthedRequest(creds, '/api/swap/intent', {
          method: 'POST',
          body: {
            depositAddress: swapDepositAddr,
            signerId: creds.signerId,
            standard: 'nep413',
            quote: quoteWithoutFee
          },
          timeoutMs: 12000
        });
        if (!swapIntentRes || !swapIntentRes.ok || !swapIntentRes.data || !swapIntentRes.data.ok || !swapIntentRes.data.ok.intent) {
          throw new Error((swapIntentRes && swapIntentRes.data && swapIntentRes.data.err) || t('生成机密兑换签名失败', 'Failed to generate confidential swap intent'));
        }

        const signedSwap = await signConfidentialNep413Intent({
          wallet,
          generatedIntent: swapIntentRes.data.ok.intent,
          expectedRecipient: swapDepositAddr
        });
        const { res: swapSubmitRes } = await nearcomAuthedRequest(creds, '/api/swap/submit', {
          method: 'POST',
          body: { depositAddress: swapDepositAddr, signedIntent: signedSwap },
          timeoutMs: 15000
        });
        if (!swapSubmitRes || !swapSubmitRes.ok || !swapSubmitRes.data || !swapSubmitRes.data.ok || !swapSubmitRes.data.ok.intentHash) {
          throw new Error((swapSubmitRes && swapSubmitRes.data && swapSubmitRes.data.err) || t('提交机密兑换签名失败', 'Failed to submit confidential swap'));
        }
        swapIntentHash = swapSubmitRes.data.ok.intentHash;
        settledOutStr = String(swapQuoteOk.quote.amountOut || '0');
      }

      // Poll /api/swap/status until SUCCESS
      const pollDeadline = Date.now() + 45_000;
      while (Date.now() < pollDeadline) {
        const { res: stRes } = await nearcomAuthedRequest(creds, '/api/swap/status', {
          method: 'POST',
          body: { depositAddress: swapDepositAddr },
          timeoutMs: 8000
        }).catch(() => ({ res: null }));
        const stOk = stRes && stRes.ok && stRes.data && stRes.data.ok;
        if (stOk) {
          const statusUpper = String(stOk.status || '').toUpperCase();
          if (statusUpper === 'SUCCESS') {
            if (stOk.amountOut && /^\d+$/.test(String(stOk.amountOut))) {
              settledOutStr = String(stOk.amountOut);
            }
            swapSettled = true;
            break;
          }
          if (statusUpper === 'FAILED' || statusUpper === 'REFUNDED') {
            throw new Error(t(`机密兑换未成交 (${statusUpper})`, `Confidential swap ${statusUpper}`));
          }
        }
        await new Promise((r) => setTimeout(r, 1500));
      }

      if (!swapSettled) {
        const pendingErr = new Error(
          t('机密兑换仍在处理中，请稍后刷新查看状态', 'Confidential swap is still processing. Please refresh status shortly.')
        );
        pendingErr.code = 'CONFIDENTIAL_SWAP_PENDING';
        pendingErr.swapIntentHash = swapIntentHash;
        pendingErr.swapDepositAddress = swapDepositAddr;
        throw pendingErr;
      }

      if (typeof onStepASettled === 'function') {
        try {
          onStepASettled({
            swapDepositAddress: swapDepositAddr,
            swapIntentHash,
            settledOutRaw: settledOutStr
          });
        } catch (_) {}
      }
    }

    const settledOutBig = BigInt(settledOutStr);
    if (settledOutBig <= 0n) {
      throw new Error(t('机密兑换输出金额无效', 'Invalid confidential swap settled output'));
    }

    // Step B: 0.25% Fee Collection via Confidential Internal Send (best-effort; skip micro-dust < $0.01)
    let actualFeeSentBig = 0n;
    const effFeeBps = Number.isFinite(Number(feeBps)) ? Math.max(0, Math.round(Number(feeBps))) : 0;
    const quoteOutUsd = swapQuoteOk?.quote?.amountOutUsd ? Number(swapQuoteOk.quote.amountOutUsd) : null;
    const estFeeUsd = (quoteOutUsd && effFeeBps > 0) ? (quoteOutUsd * effFeeBps) / 10000 : null;
    const minFeeUsd = (typeof APP_FEE_CONFIG !== 'undefined' && APP_FEE_CONFIG.CONFIDENTIAL_MIN_FEE_USD) || 0.01;
    const feeAboveMin = estFeeUsd === null || estFeeUsd >= minFeeUsd;
    if (effFeeBps > 0 && feeAboveMin && feeRecipient && String(feeRecipient).toLowerCase() !== creds.signerId) {
      const targetFeeBig = (settledOutBig * BigInt(effFeeBps)) / 10000n;
      if (targetFeeBig > 0n) {
        try {
          const { res: feeQRes } = await nearcomAuthedRequest(creds, '/api/withdraw/quote', {
            method: 'POST',
            body: {
              dry: false,
              slippageTolerance: 0,
              originAsset: destinationAsset,
              destinationAsset,
              amount: targetFeeBig.toString(),
              deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              userAddress: creds.signerId,
              authMethod: 'near',
              swapType: 'EXACT_INPUT',
              displayRecipient: `nearcom:${feeRecipient}`,
              recipient: feeRecipient,
              recipientType: 'CONFIDENTIAL_INTENTS',
              isConfidential: true
            },
            timeoutMs: 8000
          });
          const feeQuoteOk = feeQRes && feeQRes.ok && feeQRes.data && feeQRes.data.ok;
          if (feeQuoteOk && feeQuoteOk.quote && feeQuoteOk.quote.depositAddress) {
            const { res: feeIntentRes } = await nearcomAuthedRequest(creds, '/api/withdraw/intent', {
              method: 'POST',
              body: {
                depositAddress: feeQuoteOk.quote.depositAddress,
                signerId: creds.signerId,
                standard: 'nep413'
              },
              timeoutMs: 8000
            });
            if (feeIntentRes && feeIntentRes.ok && feeIntentRes.data && feeIntentRes.data.ok && feeIntentRes.data.ok.intent) {
              const signedFee = await signConfidentialNep413Intent({
                wallet,
                generatedIntent: feeIntentRes.data.ok.intent,
                expectedRecipient: feeQuoteOk.quote.depositAddress
              });
              const { res: feeSubRes } = await nearcomAuthedRequest(creds, '/api/withdraw/submit', {
                method: 'POST',
                body: { signedIntent: signedFee },
                timeoutMs: 10000
              });
              if (feeSubRes && feeSubRes.ok && feeSubRes.data && feeSubRes.data.ok && feeSubRes.data.ok.intentHash) {
                actualFeeSentBig = targetFeeBig;
              }
            }
          }
        } catch (_) {}
      }
    }

    // Step C: Confidential Withdraw to Destination Chain
    const withdrawAmtBig = settledOutBig - actualFeeSentBig;
    const withdrawDestAsset = toNearcomWithdrawDestinationAsset(destinationAsset, destinationChain);
    const { res: wdQRes } = await nearcomAuthedRequest(creds, '/api/withdraw/quote', {
      method: 'POST',
      body: {
        dry: false,
        slippageTolerance: Number(slippageBps) || 100,
        originAsset: destinationAsset,
        destinationAsset: withdrawDestAsset,
        amount: withdrawAmtBig.toString(),
        deadline: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        userAddress: creds.signerId,
        authMethod: 'near',
        swapType: 'EXACT_INPUT',
        displayRecipient: recipient,
        recipient,
        recipientType: 'DESTINATION_CHAIN',
        destinationChainName: destinationChain,
        isConfidential: true
      },
      timeoutMs: 12000
    });
    if (!wdQRes || !wdQRes.ok || !wdQRes.data || !wdQRes.data.ok || !wdQRes.data.ok.quote || !wdQRes.data.ok.quote.depositAddress) {
      throw new Error((wdQRes && wdQRes.data && (wdQRes.data.err || wdQRes.data.error)) || t('创建机密提现订单失败', 'Failed to create confidential withdrawal quote'));
    }
    const wdQuoteOk = wdQRes.data.ok;
    const wdDepositAddr = wdQuoteOk.quote.depositAddress;

    const { res: wdIntentRes } = await nearcomAuthedRequest(creds, '/api/withdraw/intent', {
      method: 'POST',
      body: {
        depositAddress: wdDepositAddr,
        signerId: creds.signerId,
        standard: 'nep413'
      },
      timeoutMs: 12000
    });
    if (!wdIntentRes || !wdIntentRes.ok || !wdIntentRes.data || !wdIntentRes.data.ok || !wdIntentRes.data.ok.intent) {
      throw new Error((wdIntentRes && wdIntentRes.data && wdIntentRes.data.err) || t('生成机密提现签名失败', 'Failed to generate confidential withdrawal intent'));
    }

    const signedWd = await signConfidentialNep413Intent({
      wallet,
      generatedIntent: wdIntentRes.data.ok.intent,
      expectedRecipient: wdDepositAddr
    });
    const { res: wdSubmitRes } = await nearcomAuthedRequest(creds, '/api/withdraw/submit', {
      method: 'POST',
      body: { signedIntent: signedWd },
      timeoutMs: 15000
    });
    if (!wdSubmitRes || !wdSubmitRes.ok || !wdSubmitRes.data || !wdSubmitRes.data.ok || !wdSubmitRes.data.ok.intentHash) {
      throw new Error((wdSubmitRes && wdSubmitRes.data && wdSubmitRes.data.err) || t('提交机密提现失败', 'Failed to submit confidential withdrawal'));
    }

    return {
      ok: true,
      swapIntentHash,
      withdrawIntentHash: wdSubmitRes.data.ok.intentHash,
      withdrawDepositAddress: wdDepositAddr,
      amountOut: wdQuoteOk.quote.amountOut,
      feeAmountRaw: actualFeeSentBig.toString()
    };
  }
