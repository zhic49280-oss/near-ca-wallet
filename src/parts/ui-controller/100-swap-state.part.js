  // ==================== Unified Any-Chain Swap Controller ====================

  let _swapQuoteTimer = null;
  let _orderPollTimer = null;
  let _orderPollCount = 0;

  let _swapCatalogCache = null;
  let _swapCatalogLiveRef = null;
  let _swapCatalogDynRef = null;
  let _swapCatalogPrlPrice = null;
  let _swapCatalogCoreLen = -1;

  function getSwapTokenCatalog() {
    const st = getState();
    const tokens = getTokens();
    const prlPrice = getSymbolPrice('PRL');
    const coreList = tokens.UNIFIED_CORE_TOKENS || [];
    if (
      _swapCatalogCache &&
      st.liveTokens === _swapCatalogLiveRef &&
      st.dynamicSolTokens === _swapCatalogDynRef &&
      prlPrice === _swapCatalogPrlPrice &&
      coreList.length === _swapCatalogCoreLen
    ) {
      return _swapCatalogCache;
    }

    const list = [];
    const seenIds = new Set();
    const seenChainContract = new Set();

    const addToken = (raw) => {
      if (!raw || !raw.assetId) return;
      const bc = String(raw.blockchain || '').toLowerCase();
      const sym = String(raw.symbol || '').toUpperCase();
      const contract = String(raw.contractAddress || '').trim().toLowerCase();
      const idKey = String(raw.assetId).toLowerCase();
      if (seenIds.has(idKey)) return;
      const chainKey = contract ? `${bc}_${sym}_${contract}` : `${bc}_${sym}_native`;
      if (seenChainContract.has(chainKey)) return;
      seenIds.add(idKey);
      seenChainContract.add(chainKey);
      list.push(raw);
    };

    const dexTokens = Object.values(tokens.DEX_CHAIN_TOKENS || {}).flat();

    // 1. Core cross-chain tokens + NEAR NEP-141 PRL
    for (const item of coreList) addToken(item);
    addToken({
      symbol: 'PRL',
      name: 'Pearl Network (NEAR NEP-141)',
      blockchain: 'near',
      assetId: '1cs_v1:near:nep141:prl.omft.near',
      contractAddress: 'prl.omft.near',
      decimals: 8,
      networkName: 'NEAR Protocol (NEP-141)',
      price: prlPrice
    });

    // 2. Direct On-Chain DEX Tokens (Solana Jupiter/Raydium/xStocks, EVM Kyber/Para/OpenOcean)
    for (const item of dexTokens) addToken(item);
    for (const item of (st.dynamicSolTokens || [])) addToken(item);

    // 3. Live 1Click catalog additions
    for (const item of (st.liveTokens || [])) addToken(item);

    _swapCatalogLiveRef = st.liveTokens;
    _swapCatalogDynRef = st.dynamicSolTokens;
    _swapCatalogPrlPrice = prlPrice;
    _swapCatalogCoreLen = coreList.length;
    _swapCatalogCache = list;
    return list;
  }

  function resolveSwapToken(assetId, fallbackIdx = 0) {
    const catalog = getSwapTokenCatalog();
    const found = catalog.find((x) => String(x.assetId).toLowerCase() === String(assetId || '').toLowerCase());
    return found || catalog[fallbackIdx] || null;
  }

  function getSwapTokenAvailableBalance(token) {
    const wallet = getState().getActiveWallet();
    if (!wallet || !token) return null;
    return getWalletNativeBalanceForToken(wallet, token.blockchain, token.symbol, token.contractAddress);
  }

  function isSameChainContractSwap(fromToken, toToken) {
    if (!fromToken || !toToken) return false;
    const fromBc = String(fromToken.blockchain || '').toLowerCase();
    const toBc = String(toToken.blockchain || '').toLowerCase();
    if (fromBc !== toBc) return false;
    if (fromBc === 'near' || fromBc === 'sol' || EVM_CHAIN_KEYS.includes(fromBc)) {
      return Boolean(fromToken.contractAddress && toToken.contractAddress);
    }
    return false;
  }

  function isPrlSwapToken(tok) {
    return Boolean(tok && String(tok.symbol || '').toUpperCase() === 'PRL');
  }

  function isSwapOriginSupported(token) {
    if (!token) return false;
    const bc = String(token.blockchain || '').toLowerCase();
    if (bc === 'near' || bc === 'prl' || bc === 'sol' || bc === 'btc') return true;
    const contracts = getContracts();
    return Boolean(contracts && contracts.EVM_CHAINS && contracts.EVM_CHAINS[bc]);
  }

  function validateSwapNearGasRequirement({ wallet, fromToken, toToken, quoteData = null, amountIn = 0 } = {}) {
    if (!wallet || !fromToken || !toToken) {
      return { ok: true, requiredNear: 0, availNearForGas: 0, needsNearHub: false, needsMpcSign: false };
    }
    const fromBc = String(fromToken.blockchain || '').toLowerCase();
    const contracts = getContracts();
    const isEvmChain = (bc) => Boolean(contracts && contracts.EVM_CHAINS && contracts.EVM_CHAINS[bc]);

    const rawNear = wallet.nativeBalances && wallet.nativeBalances.near !== undefined && wallet.nativeBalances.near !== null
      ? wallet.nativeBalances.near
      : wallet.nearBalance;
    const nearBal = Number.isFinite(Number(rawNear)) ? Number(rawNear) : 0;
    const isNativeNearInput = fromBc === 'near' && String(fromToken.symbol || '').toUpperCase() === 'NEAR';
    const availNearForGas = isNativeNearInput ? Math.max(0, nearBal - (Number(amountIn) || 0)) : nearBal;

    const compType = quoteData && quoteData.compositeType ? String(quoteData.compositeType) : '';
    const stages = quoteData && Array.isArray(quoteData.stages) ? quoteData.stages : [];
    const isConfidential = compType === 'NEARCOM_CONFIDENTIAL_SWAP';

    const needsNearHub = !isConfidential && Boolean(
      quoteData && (
        (compType === 'SMART_HUB_ROUTE' && stages.some((s) => s && (s.type === 'NEAR_SWAP' || s.type === 'BRIDGE_OUT'))) ||
        ((isPrlSwapToken(fromToken) !== isPrlSwapToken(toToken)) && !isDirectOneClickQuote(quoteData)) ||
        ['PRL_TO_EXTERNAL', 'EXTERNAL_TO_PRL', 'PRL_TO_NEAR_DCL', 'PRL_TO_NEAR_REF', 'NEAR_TO_PRL_REF'].includes(compType)
      )
    );

    const originNeedsMpc =
      (fromBc === 'sol' && !wallet.solPrivateSeedHex) ||
      (isEvmChain(fromBc) && !wallet.evmPrivateKey);
    const destNeedsMpc = Boolean(
      (compType === 'SMART_HUB_ROUTE' && stages.some((s) => s && s.type === 'DEST_DEX' && ((s.chain === 'sol' && !wallet.solPrivateSeedHex) || (s.chain !== 'sol' && !wallet.evmPrivateKey)))) ||
      (compType === 'CROSS_CHAIN_TO_SOL_DEX' && !wallet.solPrivateSeedHex) ||
      (['CROSS_CHAIN_TO_EVM_DEX', 'CROSS_CHAIN_TO_ARC_MAINNET', 'EVM_TO_ARC_MAINNET', 'ARC_MAINNET_TO_CROSS_CHAIN'].includes(compType) && !wallet.evmPrivateKey)
    );
    const needsMpcSign = Boolean(originNeedsMpc || destNeedsMpc);

    const requiredNear = Number(((needsNearHub ? 0.02 : 0) + (needsMpcSign ? 0.01 : 0)).toFixed(4));
    if (requiredNear > 0 && availNearForGas < requiredNear) {
      throw new Error(
        t(
          `NEAR 余额不足以支付中转/MPC Gas (需至少 ${requiredNear} NEAR，当前可用: ${availNearForGas.toFixed(4)} NEAR)`,
          `Insufficient NEAR for hub/MPC gas (Need >= ${requiredNear} NEAR, available: ${availNearForGas.toFixed(4)} NEAR)`
        )
      );
    }

    return { ok: true, requiredNear, availNearForGas, needsNearHub, needsMpcSign };
  }

  function resolveWalletEvmAddress(wallet) {
    if (!wallet) return '';
    const contracts = getContracts();
    if (contracts && typeof contracts.resolveWalletEvmSender === 'function') {
      return contracts.resolveWalletEvmSender(wallet) || '';
    }
    if (wallet.evmPrivateKey) {
      return wallet.evmAddress || wallet.mpcEvmAddress || '';
    }
    return wallet.mpcEvmAddress || wallet.evmAddress || '';
  }

  function getWalletDefaultRecipientForChain(wallet, blockchain) {
    if (!wallet) return '';
    const bc = String(blockchain || '').toLowerCase();
    if (bc === 'near') return wallet.nearNamedAccount || wallet.nearAddress || '';
    if (bc === 'sol') return wallet.solAddress || '';
    if (bc === 'btc' || bc === 'bitcoin') return wallet.btcAddress || '';
    if (bc === 'prl') return wallet.address || '';
    if (['eth', 'base', 'arb', 'bsc', 'hype', 'hood', 'arc', 'op', 'pol', 'avax'].includes(bc)) return resolveWalletEvmAddress(wallet);
    return '';
  }

  function getTargetChainGasReserveInfo(wallet, fromToken, toToken, mode = 'auto', quoteData = null) {
    const empty = {
      showSelector: false,
      chainKey: '',
      gasSymbol: '',
      isNewSolAta: false,
      currentGasBal: 0,
      recommendedReserve: 0,
      extraReserve: 0,
      selectedReserve: 0
    };
    if (!wallet || !fromToken || !toToken) return empty;

    const toChain = String(toToken.blockchain || '').toLowerCase();
    const fromChain = String(fromToken.blockchain || '').toLowerCase();
    const sameChain = fromChain === toChain;
    const solNativeMint = 'So11111111111111111111111111111111111111112';
    const toContractLower = String(toToken.contractAddress || '').toLowerCase();
    const isBuyingSolToken = toChain === 'sol' && toToken.contractAddress && toToken.contractAddress !== solNativeMint;
    const isSolNative = toChain === 'sol' && (!toToken.contractAddress || toToken.contractAddress === solNativeMint);
    const isEvmNative = toChain !== 'sol' && (
      !toContractLower ||
      toContractLower === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      toContractLower === '0x0000000000000000000000000000000000000000' ||
      toContractLower === 'native' ||
      (toChain === 'arc' && toContractLower === '0x3600000000000000000000000000000000000000')
    );
    if (isSolNative || isEvmNative) return empty;
    const hasTrackedSolAtas = Boolean(wallet.solAtaMints && typeof wallet.solAtaMints === 'object');
    const isNewSolAta = Boolean(
      isBuyingSolToken && (
        hasTrackedSolAtas
          ? !wallet.solAtaMints[toToken.contractAddress]
          : !(wallet.splBalances && Object.prototype.hasOwnProperty.call(wallet.splBalances, toToken.contractAddress))
      )
    );

    // Cross-chain target gas reserve ONLY applies when a resolved route actually contains a DEST_DEX stage
    if (!(sameChain && toChain === 'sol' && isNewSolAta)) {
      const hasDestDex = Boolean(
        (quoteData && Array.isArray(quoteData.stages) && quoteData.stages.some((s) => s && s.type === 'DEST_DEX')) ||
        quoteData?.compositeType === 'CROSS_CHAIN_TO_SOL_DEX' ||
        quoteData?.compositeType === 'CROSS_CHAIN_TO_EVM_DEX'
      );
      if (!hasDestDex) return empty;
    }

    const nb = (wallet && wallet.nativeBalances) || {};
    const currentGasBal = Number(nb[toChain] || 0);
    const gasSymbolMap = { sol: 'SOL', eth: 'ETH', base: 'ETH', arb: 'ETH', op: 'ETH', hood: 'ETH', bsc: 'BNB', pol: 'POL', avax: 'AVAX', hype: 'HYPE', arc: 'USDC', near: 'NEAR' };
    const gasSymbol = gasSymbolMap[toChain] || toChain.toUpperCase();

    let minReq = 0;
    let extraReserve = 0;
    if (toChain === 'sol' && !isSolNative) {
      minReq = isNewSolAta ? 0.0035 : 0.001;
      extraReserve = 0.01;
    } else if (EVM_CHAIN_KEYS.includes(toChain) && !sameChain) {
      const defaults = { eth: 0.0015, base: 0.0003, arb: 0.0003, op: 0.0003, hood: 0.0003, bsc: 0.0005, pol: 0.05, avax: 0.005, hype: 0.0005, arc: 0.02 };
      const extras = { eth: 0.005, base: 0.002, arb: 0.002, op: 0.002, hood: 0.002, bsc: 0.002, pol: 0.2, avax: 0.02, hype: 0.005, arc: 0.05 };
      minReq = defaults[toChain] || 0.0005;
      extraReserve = extras[toChain] || 0.002;
    } else {
      return empty;
    }

    // Show selector when cross-chain to a non-native token (likely 2-stage DEX) or same-chain SOL -> new SPL token
    const isCrossToDexToken = !sameChain && (isBuyingSolToken || !isEvmNative);
    const showSelector = isCrossToDexToken || (sameChain && toChain === 'sol' && isNewSolAta);
    if (!showSelector) return empty;

    const missingGas = currentGasBal >= minReq ? 0 : minReq;
    const normalizedMode = mode === 'extra' ? 'extra' : 'auto';
    const selectedReserve = normalizedMode === 'extra' ? extraReserve : missingGas;

    return {
      showSelector: true,
      chainKey: toChain,
      gasSymbol,
      isNewSolAta,
      currentGasBal,
      recommendedReserve: missingGas,
      extraReserve,
      selectedReserve
    };
  }

  function computeNetSwapOutput(quoteData, toToken, gasReserveInfo, grossOutNumOverride = null) {
    const intents = getIntents();
    const toDec = toToken && typeof toToken.decimals === 'number' ? toToken.decimals : 18;
    const grossNum = grossOutNumOverride !== null && Number.isFinite(Number(grossOutNumOverride))
      ? Number(grossOutNumOverride)
      : Number((quoteData && (quoteData.amountOutFormatted || intents.fromBaseUnits(String(quoteData.amountOut || '0'), toDec))) || 0);
    if (!Number.isFinite(grossNum) || grossNum <= 0) return { netOutNum: 0, ratio: 1 };
    if (!quoteData || !gasReserveInfo || !gasReserveInfo.showSelector || !(gasReserveInfo.selectedReserve > 0)) {
      return { netOutNum: grossNum, ratio: 1 };
    }
    const stages = Array.isArray(quoteData.stages) ? quoteData.stages : [];
    const destIdx = stages.findIndex((s) => s && s.type === 'DEST_DEX');
    const stageIntermRaw = (destIdx > 0 && stages[destIdx - 1] && stages[destIdx - 1].expectedOut)
      ? stages[destIdx - 1].expectedOut
      : (quoteData.intermediaryRaw || null);
    if (stageIntermRaw) {
      const nativeDecimals = gasReserveInfo.chainKey === 'sol' ? 9 : 18;
      const bridgeNativeHuman = Number(intents.fromBaseUnits(String(stageIntermRaw), nativeDecimals));
      if (Number.isFinite(bridgeNativeHuman) && bridgeNativeHuman > 0) {
        if (gasReserveInfo.selectedReserve >= bridgeNativeHuman) {
          return { netOutNum: 0, ratio: 0 };
        }
        const ratio = (bridgeNativeHuman - gasReserveInfo.selectedReserve) / bridgeNativeHuman;
        return { netOutNum: grossNum * ratio, ratio };
      }
    }
    return { netOutNum: grossNum, ratio: 1 };
  }

  function updateSwapDetailsSummary() {
    const st = getState();
    const sumEl = $('swap-details-summary');
    if (!sumEl) return;
    const bps = Number(st.swap.slippageBps || 100);
    sumEl.textContent = `${t('滑点', 'Slippage')} ${(bps / 100).toString()}%`;
  }

  function toggleSwapDetails() {
    const body = $('swap-details-body');
    const btn = $('swap-details-toggle');
    if (!body || !btn) return;
    const isHidden = body.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
  }

  function renderSwapGasReserveRow(wallet, fromToken, toToken) {
    const st = getState();
    const row = $('swap-gas-reserve-row');
    const info = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', st.swap.quoteData || null);
    updateSwapDetailsSummary(wallet, fromToken, toToken, info);
    if (!row) return;
    if (!info.showSelector) {
      row.classList.add('hidden');
      return;
    }
    row.classList.remove('hidden');
    const lbl = $('swap-gas-reserve-label');
    if (lbl) {
      const tag = info.isNewSolAta ? t(' (含开户租金)', ' (+ATA rent)') : '';
      lbl.textContent = `${t('目标链 Gas 预留', 'Target Gas Reserve')}${tag}`;
    }
    const autoBtn = row.querySelector('[data-gas-mode="auto"]');
    const extraBtn = row.querySelector('[data-gas-mode="extra"]');
    if (autoBtn) autoBtn.textContent = `${t('默认', 'Auto')} (${info.recommendedReserve} ${info.gasSymbol})`;
    if (extraBtn) extraBtn.textContent = `${t('多留', 'Extra')} (${info.extraReserve} ${info.gasSymbol})`;
    row.querySelectorAll('[data-gas-mode]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-gas-mode') === (st.swap.gasReserveMode === 'extra' ? 'extra' : 'auto'));
    });
  }

  function setSwapGasReserveMode(mode) {
    const st = getState();
    st.swap.gasReserveMode = mode === 'extra' ? 'extra' : 'auto';
    const wallet = st.getActiveWallet();
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    renderSwapGasReserveRow(wallet, fromToken, toToken);
    if (st.swap.quoteData && fromToken && toToken) {
      const info = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode, st.swap.quoteData);
      const { netOutNum, ratio } = computeNetSwapOutput(st.swap.quoteData, toToken, info);
      const amtOutText = formatBal(netOutNum, 6);
      st.swap.amountOut = amtOutText;
      if ($('swap-amount-out')) $('swap-amount-out').value = amtOutText;
      const outPrice = getTokenUnitPrice(toToken);
      const numUsdOut = st.swap.quoteData.amountOutUsd && Number(st.swap.quoteData.amountOutUsd) > 0
        ? Number(st.swap.quoteData.amountOutUsd) * ratio
        : (outPrice !== null && Number.isFinite(netOutNum) ? netOutNum * outPrice : null);
      st.swap._usdOutVal = numUsdOut;
      const usdOut = numUsdOut !== null ? formatUsd(numUsdOut) : '--';
      if ($('swap-usd-out')) $('swap-usd-out').textContent = usdOut;
    }
    updateSwapPrimaryButtonState();
  }

  function isSwapTokenNative(tok) {
    if (!tok) return false;
    const c = String(tok.contractAddress || '').toLowerCase();
    const sym = String(tok.symbol || '').toUpperCase();
    return !tok.contractAddress ||
      tok.blockchain === 'prl' ||
      tok.blockchain === 'btc' ||
      tok.contractAddress === 'So11111111111111111111111111111111111111112' ||
      c === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      (c === 'wrap.near' && sym === 'NEAR') ||
      (tok.blockchain === 'arc' && c === '0x3600000000000000000000000000000000000000');
  }

  function isDirectOneClickQuote(quoteData) {
    if (!quoteData || quoteData.compositeType) return false;
    return quoteData.routeSource === 'NEAR_INTENTS_1CLICK' || quoteData.bestSource === '1Click Solver';
  }

  function isCustomThirdPartySwapRecipient(wallet, toToken) {
    const st = getState();
    if (!wallet || !toToken) return false;
    const custom = String(st.swap.recipientAddress || '').trim();
    if (!custom) return false;
    const selfAddr = String(getWalletDefaultRecipientForChain(wallet, toToken.blockchain) || '').trim();
    if (!selfAddr) return false;
    return custom.toLowerCase() !== selfAddr.toLowerCase();
  }

  function doesSwapRouteRequireSelfRecipient(fromToken, toToken, quoteData = null) {
    if (!fromToken || !toToken) return false;
    if (isSameChainContractSwap(fromToken, toToken)) {
      if (quoteData && (isDirectOneClickQuote(quoteData) || quoteData.compositeType === 'NEARCOM_CONFIDENTIAL_SWAP')) return false;
      return true;
    }

    const toBc = String(toToken.blockchain || '').toLowerCase();
    const arcUsdcLower = '0x3600000000000000000000000000000000000000';
    const evmNativeSentinel = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const solNativeMint = 'So11111111111111111111111111111111111111112';

    if (quoteData) {
      const compType = String(quoteData.compositeType || '');
      if (compType === 'NEARCOM_CONFIDENTIAL_SWAP') return false;
      const stages = Array.isArray(quoteData.stages) ? quoteData.stages : [];
      if (compType === 'SMART_HUB_ROUTE' && stages.length > 0) {
        const lastType = stages[stages.length - 1]?.type;
        return lastType === 'DEST_DEX' || lastType === 'NEAR_SWAP';
      }
      if (['CROSS_CHAIN_TO_SOL_DEX', 'CROSS_CHAIN_TO_EVM_DEX', 'PRL_TO_NEAR_REF', 'PRL_TO_NEAR_DCL', 'NEAR_TO_PRL_REF'].includes(compType)) {
        return true;
      }
      if (['EVM_TO_ARC_MAINNET', 'CROSS_CHAIN_TO_ARC_MAINNET'].includes(compType)) {
        const arcDestLower = String(toToken.contractAddress || arcUsdcLower).toLowerCase();
        return Boolean(toToken.contractAddress && arcDestLower !== arcUsdcLower && arcDestLower !== evmNativeSentinel);
      }
      return false;
    }

    if (toBc === 'arc') {
      const arcDestLower = String(toToken.contractAddress || arcUsdcLower).toLowerCase();
      return Boolean(toToken.contractAddress && arcDestLower !== arcUsdcLower && arcDestLower !== evmNativeSentinel);
    }

    const intents = getIntents();
    const resolvedDest = (intents && typeof intents.resolveOneClickAssetId === 'function')
      ? intents.resolveOneClickAssetId(toToken, toBc)
      : String(toToken.assetId || '');
    const isOneClickDirect = /^(nep141:|nep245:|1cs_v1:)/i.test(String(resolvedDest || ''));

    if (toBc === 'sol' && toToken.contractAddress && toToken.contractAddress !== solNativeMint && !isOneClickDirect) {
      return true;
    }
    if (['eth', 'base', 'arb', 'op', 'pol', 'avax', 'bsc', 'hood'].includes(toBc)
      && toToken.contractAddress
      && toToken.contractAddress.toLowerCase() !== evmNativeSentinel
      && !isOneClickDirect) {
      return true;
    }
    return false;
  }

  function syncSwapRecipientInputState(wallet, fromToken, toToken, quoteData = null, opts = {}) {
    const st = getState();
    const recInput = $('swap-recipient-input');
    const contactsBtn = $('swap-recipient-contacts-btn');
    if (!recInput) return false;
    const keepNearThirdPartyEditable = Boolean(
      !quoteData &&
      fromToken && toToken &&
      String(fromToken.blockchain || '').toLowerCase() === 'near' &&
      String(toToken.blockchain || '').toLowerCase() === 'near' &&
      isCustomThirdPartySwapRecipient(wallet, toToken)
    );
    const locked = doesSwapRouteRequireSelfRecipient(fromToken, toToken, quoteData) && !keepNearThirdPartyEditable;
    if (locked) {
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      if (activeEl !== recInput) {
        recInput.value = getWalletDefaultRecipientForChain(wallet, toToken?.blockchain);
      }
      recInput.disabled = true;
      if (contactsBtn) contactsBtn.disabled = true;
    } else {
      recInput.disabled = false;
      if (contactsBtn) contactsBtn.disabled = false;
      if (opts && opts.autoFillDefault && !st.swap.recipientAddress && toToken) {
        st.swap.recipientAddress = getWalletDefaultRecipientForChain(wallet, toToken.blockchain);
      }
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
      if (activeEl !== recInput) {
        recInput.value = st.swap.recipientAddress || '';
      }
    }
    return locked;
  }

  function computeSwapPriceImpact(usdIn, usdOut) {
    const inVal = Number(usdIn);
    const outVal = Number(usdOut);
    if (!Number.isFinite(inVal) || inVal <= 0 || !Number.isFinite(outVal) || outVal < 0) {
      return { pct: null, level: 'none', usdIn: null, usdOut: null };
    }
    const rawPct = ((inVal - outVal) / inVal) * 100;
    const pct = Number(Math.max(0, rawPct).toFixed(2));
    const level = pct >= 15 ? 'critical' : (pct >= 5 ? 'high' : 'none');
    return { pct, level, usdIn: inVal, usdOut: outVal };
  }

  function updateSwapPriceImpactUI() {
    const st = getState();
    const banner = $('swap-price-impact-banner');
    if (!banner) return null;
    const hasQuote = Boolean(st.swap.quoteData && Number(st.swap.amountOut) > 0);
    const impact = hasQuote
      ? computeSwapPriceImpact(st.swap._usdInVal, st.swap._usdOutVal)
      : { pct: null, level: 'none', usdIn: null, usdOut: null };
    if (!hasQuote || impact.level === 'none') {
      banner.classList.add('hidden');
      banner.classList.remove('is-high', 'is-critical');
      banner.textContent = '';
      return impact;
    }
    banner.classList.remove('hidden');
    if (impact.level === 'critical') {
      banner.classList.remove('is-high');
      banner.classList.add('is-critical');
      banner.textContent = t(
        `🚨 价格影响极大 (-${impact.pct.toFixed(1)}%)：支付 ${formatUsd(impact.usdIn)}，仅得约 ${formatUsd(impact.usdOut)}，请谨慎确认`,
        `🚨 Severe price impact (-${impact.pct.toFixed(1)}%): Paying ${formatUsd(impact.usdIn)} for ~${formatUsd(impact.usdOut)}. Proceed with caution`
      );
    } else {
      banner.classList.remove('is-critical');
      banner.classList.add('is-high');
      banner.textContent = t(
        `⚠️ 价差偏大 (-${impact.pct.toFixed(1)}%)：支付 ${formatUsd(impact.usdIn)}，预计约得 ${formatUsd(impact.usdOut)}`,
        `⚠️ High price impact (-${impact.pct.toFixed(1)}%): Paying ${formatUsd(impact.usdIn)} for ~${formatUsd(impact.usdOut)}`
      );
    }
    return impact;
  }

  function updateSwapUsdEstimates() {
    const st = getState();
    const amt = Number(st.swap.amountIn);
    const fromToken = resolveSwapToken(st.swap.fromAssetId, 0);
    const toToken = resolveSwapToken(st.swap.toAssetId, 1);
    const q = st.swap.quoteData || null;
    const inEl = $('swap-usd-in');
    const outEl = $('swap-usd-out');
    let numIn = null;
    if (Number.isFinite(amt) && amt > 0 && fromToken) {
      const qUsdIn = q && Number(q.amountInUsd) > 0 ? Number(q.amountInUsd) : null;
      const unitIn = getTokenUnitPrice(fromToken);
      numIn = qUsdIn !== null ? qUsdIn : (unitIn !== null ? amt * unitIn : null);
    }
    st.swap._usdInVal = numIn;
    if (inEl) {
      inEl.textContent = numIn !== null ? formatUsd(numIn) : '--';
    }
    const outAmt = Number(st.swap.amountOut);
    let numOut = null;
    if (Number.isFinite(outAmt) && outAmt > 0 && toToken && q) {
      const wallet = st.getActiveWallet();
      const gInfo = getTargetChainGasReserveInfo(wallet, fromToken, toToken, st.swap.gasReserveMode || 'auto', q);
      const { ratio } = computeNetSwapOutput(q, toToken, gInfo);
      const qUsdOut = Number(q.amountOutUsd) > 0 ? Number(q.amountOutUsd) * ratio : null;
      const unitOut = getTokenUnitPrice(toToken);
      numOut = qUsdOut !== null ? qUsdOut : (unitOut !== null ? outAmt * unitOut : null);
    }
    if (q && Number.isFinite(outAmt) && outAmt > 0) {
      st.swap._usdOutVal = numOut;
      if (outEl) outEl.textContent = numOut !== null ? formatUsd(numOut) : '--';
    } else if (!Number.isFinite(outAmt) || outAmt <= 0) {
      st.swap._usdOutVal = null;
      if (outEl) outEl.textContent = '--';
    }
  }

