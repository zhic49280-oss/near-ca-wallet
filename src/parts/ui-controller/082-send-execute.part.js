  let _sendCrossQuoteTimer = null;
  let _sendCrossQuoteSeq = 0;
  let _sendCachedCrossQuote = null;
  let _sendCrossQuoteWarn = null;

  function scheduleSendCrossQuoteAsync({ wallet, asset, destAsset, recipient, rawAmtStr, feeBps }) {
    if (_sendCrossQuoteTimer) {
      clearTimeout(_sendCrossQuoteTimer);
      _sendCrossQuoteTimer = null;
    }
    const intents = getIntents();
    if (!wallet || !asset || !destAsset || !recipient || !intents || typeof intents.quoteIntentSwapOrWithdraw !== 'function') return;
    const originAssetId = resolve1ClickId(asset, asset.blockchain) || asset.assetId;
    const amountRaw = intents.toBaseUnits(rawAmtStr, sendDec(asset, 8));
    if (!amountRaw || amountRaw === '0') return;
    const cacheKey = `${wallet.id || ''}|${originAssetId}|${destAsset.assetId}|${amountRaw}|${recipient}`;
    if (_sendCachedCrossQuote && _sendCachedCrossQuote.key === cacheKey && (Date.now() - _sendCachedCrossQuote.ts < 15_000)) {
      return;
    }
    const seq = ++_sendCrossQuoteSeq;
    _sendCrossQuoteTimer = setTimeout(async () => {
      _sendCrossQuoteTimer = null;
      const refundTo = getWalletDefaultRecipientForChain(wallet, asset.blockchain) || (wallet.nearNamedAccount || wallet.nearAddress);
      const q = await intents.quoteIntentSwapOrWithdraw({
        originAsset: originAssetId,
        destinationAsset: destAsset.assetId,
        amountRaw,
        slippageBps: 100,
        recipient,
        refundTo,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        appFeeBps: feeBps,
        dry: true
      }).catch((err) => ({ ok: false, error: err && err.message ? err.message : '' }));
      if (seq !== _sendCrossQuoteSeq) return;
      if (q && q.ok) {
        _sendCrossQuoteWarn = null;
        const outHuman = q.amountOutFormatted || intents.fromBaseUnits(String(q.amountOut || '0'), destAsset.decimals ?? 8);
        _sendCachedCrossQuote = {
          key: cacheKey,
          ts: Date.now(),
          quote: q,
          destAsset,
          outHuman: Number(outHuman)
        };
      } else {
        if (_sendCachedCrossQuote && _sendCachedCrossQuote.key === cacheKey) _sendCachedCrossQuote = null;
        _sendCrossQuoteWarn = { key: cacheKey, msg: toUserFriendlyError(q && q.error, '暂无法获取跨链报价，请稍后重试', 'Cross-chain quote unavailable') };
      }
      updateSendRoutePreview(false);
    }, 350);
    if (_sendCrossQuoteTimer && typeof _sendCrossQuoteTimer.unref === 'function') {
      _sendCrossQuoteTimer.unref();
    }
  }

  function updateSendRoutePreview(triggerAsyncQuote = true) {
    const previewEl = $('send-route-preview');
    if (!previewEl) return;
    const st = getState();
    const wallet = st.getActiveWallet();
    const crypto = getCrypto();
    const intents = getIntents();
    const asset = getSelectedSendAsset();
    const addr = ($('send-recipient-input')?.value || '').trim();
    if (!asset || !addr) {
      previewEl.classList.add('hidden');
      renderSendRouteSummary(previewEl, { visible: false }, '');
      return;
    }
    const net = crypto.detectAddressNetwork(addr);
    const addrCheck = checkChainAddressValid(crypto, net, addr);
    if (!net || !addrCheck.valid) {
      previewEl.classList.add('hidden');
      renderSendRouteSummary(previewEl, { visible: false }, '');
      return;
    }
    const isEvmOrigin = EVM_CHAIN_KEYS.includes(asset.blockchain);
    const targetEvmChain = net === 'evm'
      ? (_sendTargetEvmChain || (isEvmOrigin ? asset.blockchain : 'eth'))
      : net;
    const isSameChain =
      (asset.blockchain === 'near' && net === 'near') ||
      (asset.blockchain === 'sol' && net === 'sol') ||
      (isEvmOrigin && net === 'evm' && asset.blockchain === targetEvmChain) ||
      (asset.blockchain === 'prl' && net === 'prl') ||
      (asset.blockchain === 'btc' && net === 'btc');
    if (isSameChain) {
      previewEl.classList.add('hidden');
      renderSendRouteSummary(previewEl, { visible: false }, '');
      return;
    }
    if (asset.blockchain === 'arc' || asset.blockchain === 'hype' || !isOneClickAsset(asset, asset.blockchain)) {
      previewEl.classList.remove('hidden');
      const msg = t('该网络或代币暂不支持跨链直转，请使用闪兑', 'Cross-chain send is unavailable for this network/token; please use Swap');
      renderSendRouteSummary(previewEl, { visible: true, errorText: msg, isEn: st.lang === 'en' }, msg);
      return;
    }
    const destAsset = resolveDestinationAssetForNetwork(asset.symbol, net, asset.assetId, targetEvmChain);
    if (!destAsset) {
      previewEl.classList.remove('hidden');
      const msg = t('该代币暂不支持跨链直转到目标网络，请使用闪兑', 'This token cannot be sent directly to the target network; please use Swap');
      renderSendRouteSummary(previewEl, { visible: true, errorText: msg, isEn: st.lang === 'en' }, msg);
      return;
    }
    const feeBps = (intents && intents.APP_FEE_CONFIG && Number(intents.APP_FEE_CONFIG.SEND_CROSS_CHAIN_BPS)) ?? 25;
    const feePctText = `${(feeBps / 100).toFixed(2)}%`;
    const rawAmtStr = String($('send-amount-input')?.value || '').trim();
    const amt = Number(rawAmtStr || 0);
    const originAssetId = resolve1ClickId(asset, asset.blockchain) || asset.assetId;
    let estOutNum = Number.isFinite(amt) && amt > 0 ? amt * (1 - feeBps / 10000) : null;
    let warnText = '';
    if (Number.isFinite(amt) && amt > 0 && wallet && intents && typeof intents.toBaseUnits === 'function') {
      const amountRaw = intents.toBaseUnits(rawAmtStr, sendDec(asset, 8));
      const cacheKey = `${wallet.id || ''}|${originAssetId}|${destAsset.assetId}|${amountRaw}|${addr}`;
      if (_sendCachedCrossQuote && _sendCachedCrossQuote.key === cacheKey && (Date.now() - _sendCachedCrossQuote.ts < 15_000) && Number.isFinite(_sendCachedCrossQuote.outHuman) && _sendCachedCrossQuote.outHuman > 0) {
        estOutNum = _sendCachedCrossQuote.outHuman;
      } else if (_sendCrossQuoteWarn && _sendCrossQuoteWarn.key === cacheKey) {
        estOutNum = null;
        warnText = ` · ${_sendCrossQuoteWarn.msg}`;
      } else if (triggerAsyncQuote) {
        _sendCrossQuoteWarn = null;
        scheduleSendCrossQuoteAsync({ wallet, asset, destAsset, recipient: addr, rawAmtStr, feeBps });
      }
    }
    const estOutLabel = estOutNum !== null && estOutNum > 0
      ? `${t('预估到账', 'Est. Receive')}: ~${formatBal(estOutNum, 6)} ${destAsset.symbol || asset.symbol}`
      : '';
    const estText = estOutLabel ? ` · ${estOutLabel}` : warnText;
    const fromChain = String(asset.blockchain || '').toUpperCase();
    const toChain = String(destAsset.blockchain || targetEvmChain).toUpperCase();
    previewEl.classList.remove('hidden');
    renderSendRouteSummary(
      previewEl,
      {
        visible: true,
        fromChain,
        toChain,
        feePctText,
        estOutText: estOutLabel,
        warnText: warnText ? warnText.replace(/^ · /, '') : '',
        isEn: st.lang === 'en'
      },
      `${fromChain} ➔ ${toChain} · ${t('跨链服务费', 'Cross-Chain Fee')}: ${feePctText}${estText}`
    );
  }

  function resolve1ClickId(tok, chain) {
    if (!tok) return '';
    const intents = getIntents();
    const raw = String(tok.assetId || '');
    const id = intents && typeof intents.resolveOneClickAssetId === 'function'
      ? String(intents.resolveOneClickAssetId(tok, chain) || raw)
      : raw;
    return /^(nep141:|nep245:|1cs_v1:)/i.test(id) ? id : '';
  }

  function isOneClickAsset(tok, chain) {
    const bc = String(chain || tok?.blockchain || '').toLowerCase();
    if (!tok || bc === 'arc' || bc === 'hype') return false;
    const id = resolve1ClickId(tok, bc);
    if (!id) return false;
    const cached = getIntents()?.getCachedDefuseTokens?.() || [];
    const live1Click = cached.filter((x) => x && /^(nep141:|nep245:|1cs_v1:)/i.test(String(x.assetId || '')));
    if (live1Click.length > 0 && !/(prl|qtc)\.omft\.near/i.test(id)) {
      return live1Click.some((x) => String(x.assetId || '').toLowerCase() === id.toLowerCase());
    }
    return true;
  }

  function resolveDestinationAssetForNetwork(symbol, detectedNet, fallbackAssetId, preferredEvmChain = 'eth') {
    const tokens = getTokens();
    const symUpper = String(symbol || '').toUpperCase();
    const core = tokens.UNIFIED_CORE_TOKENS || [];
    const prefEvm = String(preferredEvmChain || '').toLowerCase();
    const targetChain = detectedNet === 'evm'
      ? (EVM_CHAIN_KEYS.includes(prefEvm) ? prefEvm : 'eth')
      : detectedNet;
    if (targetChain === 'arc' || targetChain === 'hype') return null;
    if (targetChain === 'near' && symUpper === 'PRL') {
      return { assetId: '1cs_v1:near:nep141:prl.omft.near', blockchain: 'near', symbol: 'PRL', decimals: 8 };
    }
    if (targetChain === 'qtc' && symUpper === 'QTC') {
      return { assetId: 'nep141:qtc.omft.near', blockchain: 'qtc', symbol: 'QTC', decimals: 12 };
    }
    if (targetChain === 'near' && symUpper === 'QTC') {
      return { assetId: '1cs_v1:near:nep141:qtc.omft.near', blockchain: 'near', symbol: 'QTC', decimals: 12 };
    }
    const exact = core.find((c) => c.blockchain === targetChain && String(c.symbol).toUpperCase() === symUpper && isOneClickAsset(c, targetChain));
    if (exact) return { ...exact, assetId: resolve1ClickId(exact, targetChain) || exact.assetId };
    const cached1Click = (getIntents()?.getCachedDefuseTokens?.() || []).filter(
      (c) => c && /^(nep141:|nep245:|1cs_v1:)/i.test(String(c.assetId || ''))
    );
    const exactLive = cached1Click.find((c) => String(c.blockchain || '').toLowerCase() === targetChain && String(c.symbol || '').toUpperCase() === symUpper);
    if (exactLive) return exactLive;
    const catalog = getSwapTokenCatalog();
    const exactCat = catalog.find((c) => c.blockchain === targetChain && String(c.symbol).toUpperCase() === symUpper && isOneClickAsset(c, targetChain));
    if (exactCat) return { ...exactCat, assetId: resolve1ClickId(exactCat, targetChain) || exactCat.assetId };
    return null;
  }

  async function dispatchOnChainSend({ contracts, wallet, asset, isEvmOrigin, isNativeGas, toAddress, exactAmt, avail, gasBuf, gasMeta }) {
    const bc = asset.blockchain;
    if (bc === 'near' && asset.kind !== 'nep141' && asset.symbol === 'NEAR') {
      const res = await contracts.signAndSendNearTransfer({ wallet, receiverId: toAddress.toLowerCase(), amountNear: exactAmt, gasBuffer: gasBuf });
      return { txHash: res.txHash, tag: 'NEAR', fee: null, netSent: null };
    }
    if (bc === 'near' && asset.contractAddress && typeof contracts.executeNearNep141Transfer === 'function') {
      const res = await contracts.executeNearNep141Transfer({
        wallet, tokenContract: asset.contractAddress, receiverId: toAddress.toLowerCase(),
        amount: exactAmt, decimals: asset.decimals ?? 8, tokenSymbol: asset.symbol, tokenBalance: avail
      });
      return { txHash: res.txHash, tag: `${asset.symbol} (NEAR)`, fee: null, netSent: null };
    }
    if (bc === 'sol') {
      if (!asset.contractAddress || asset.contractAddress === 'So11111111111111111111111111111111111111112') {
        const res = await contracts.executeSolanaNativeTransfer({ wallet, toAddress, amountSol: exactAmt, gasBuffer: gasBuf });
        return { txHash: res.txHash, tag: 'SOL', fee: null, netSent: null };
      }
      const res = await contracts.executeSolanaSplTransfer({
        wallet, mintAddress: asset.contractAddress, toAddress, amount: exactAmt,
        decimals: asset.decimals ?? 6, tokenBalance: avail
      });
      return { txHash: res.txHash, tag: `${asset.symbol} (Solana)`, fee: null, netSent: null };
    }
    if (isEvmOrigin) {
      const res = await contracts.executeEvmTransfer({
        wallet, chainKey: bc, toAddress, amount: exactAmt, tokenContract: asset.contractAddress,
        decimals: sendDec(asset, 18), tokenBalance: avail, gasBuffer: isNativeGas ? gasBuf : null,
        gasPriceWei: isNativeGas ? (gasMeta.gasPriceWei ?? null) : null, gasLimit: isNativeGas ? (gasMeta.gasLimit ?? null) : null
      });
      return { txHash: res.txHash, tag: 'EVM', fee: null, netSent: null };
    }
    if (bc === 'prl') {
      const res = await contracts.executePearlTransfer({
        wallet, toAddress, amountPrl: exactAmt, feeDeductMode: 'extra',
        feePerKbPrl: gasMeta.feePerKbPrl ?? null, gasBuffer: gasBuf
      });
      return { txHash: res.txHash, tag: 'PRL', fee: Number(res.feePrl) || 0, netSent: Number(res.sentPrl) || null };
    }
    if (bc === 'btc') {
      const res = await contracts.executeBitcoinTransfer({
        wallet, toAddress, amountBtc: exactAmt, feeDeductMode: 'extra',
        feeRateSatVb: gasMeta.feeRateSatVb ?? null, gasBuffer: gasBuf
      });
      return { txHash: res.txHash, tag: 'BTC', fee: Number(res.feeBtc) || 0, netSent: Number(res.amountBtc || res.sentBtc) || null };
    }
    return null;
  }

