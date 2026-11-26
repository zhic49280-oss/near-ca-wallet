  // ==================== Unified Send Sheet (100% Real On-Chain Balances) ====================

  const EVM_CHAIN_KEYS = ['eth', 'base', 'arb', 'bsc', 'op', 'pol', 'avax', 'hype', 'hood', 'arc'];
  let _sendTargetEvmChain = 'eth';

  function renderSendEvmChainPills() {
    const row = $('send-evm-chain-row');
    const pills = $('send-evm-chain-pills');
    if (!row || !pills) return;
    const tokens = getTokens();
    const choices = EVM_CHAIN_KEYS;
    pills.innerHTML = choices.map((ck) => {
      const meta = tokens.getChainMeta(ck);
      return `<button type="button" class="filter-pill ${_sendTargetEvmChain === ck ? 'active' : ''}" data-action="set-send-evm-chain" data-chain="${ck}">${escapeHtml(meta.shortName)}</button>`;
    }).join('');
  }

  function setSendTargetEvmChain(chainKey) {
    const ck = String(chainKey || '').toLowerCase();
    if (!EVM_CHAIN_KEYS.includes(ck)) return;
    _sendTargetEvmChain = ck;
    renderSendEvmChainPills();
    handleSendRecipientInput();
  }

  function getSendSourceEntriesForWallet(wallet) {
    const tokens = getTokens();
    const groups = buildAllOnChainAssetGroups(wallet || getState().getActiveWallet());
    const entries = [];
    const seenKey = new Set();
    for (const g of groups) {
      for (const e of g.entries) {
        const key = `${String(g.symbolKey)}|${String(e.blockchain)}|${String(e.contractAddress || '')}`;
        if (seenKey.has(key)) continue;
        seenKey.add(key);
        const chainMeta = tokens.getChainMeta(e.blockchain);
        entries.push({
          key: `${e.blockchain}|${e.assetId}|${e.contractAddress || ''}`,
          symbolKey: g.symbolKey,
          symbol: g.symbol,
          blockchain: e.blockchain,
          chainLabel: e.kind === 'nep141'
            ? `${chainMeta.name} (${shortenAddr(e.contractAddress, 6, 4)})`
            : `${chainMeta.name}`,
          networkName: e.networkName,
          assetId: e.assetId,
          contractAddress: e.contractAddress || null,
          decimals: e.decimals,
          kind: e.kind,
          balance: e.balance
        });
      }
    }
    return entries;
  }

  function getWalletNativeBalanceForToken(wallet, blockchain, symbol, contractAddress = null) {
    if (!wallet) return null;
    const st = getState();
    const bc = String(blockchain || '').toLowerCase();
    const sym = String(symbol || '').toUpperCase();
    const isNativeContract = !contractAddress ||
      contractAddress === 'So11111111111111111111111111111111111111112' ||
      contractAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      contractAddress === 'wrap.near' ||
      (bc === 'arc' && contractAddress.toLowerCase() === '0x3600000000000000000000000000000000000000');

    if (bc === 'near' && sym === 'NEAR' && isNativeContract) return wallet.nativeBalances.near;
    if (bc === 'near' && contractAddress && (!isNativeContract || contractAddress === 'wrap.near')) {
      const nep = wallet.nearNep141Balances && wallet.nearNep141Balances[contractAddress];
      return nep && typeof nep.formatted === 'number' && Number.isFinite(nep.formatted) ? nep.formatted : null;
    }
    if (bc === 'sol' && (sym === 'SOL' || isNativeContract)) return wallet.nativeBalances.sol;
    if (bc === 'prl' && sym === 'PRL') return wallet.nativeBalances.prl;
    if (bc === 'btc' && sym === 'BTC') return wallet.nativeBalances.btc;
    if (isNativeContract && EVM_CHAIN_KEYS.includes(bc)) {
      return wallet.nativeBalances[bc];
    }
    if (bc === 'sol' && contractAddress && wallet.splBalances) {
      const v = wallet.splBalances[contractAddress];
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    if (contractAddress && EVM_CHAIN_KEYS.includes(bc)) {
      return st.getWalletErc20Balance(wallet, bc, contractAddress);
    }
    return null;
  }

  function populateSendSourceSelect(symbolKey, preferredChainKey = '', preferredAssetId = '') {
    const wallet = getState().getActiveWallet();
    const srcSel = $('send-source-select');
    if (!srcSel || !wallet) return;

    const allEntries = getSendSourceEntriesForWallet(wallet);
    const matching = allEntries.filter((e) => e.symbolKey === String(symbolKey || '').toUpperCase());

    srcSel.innerHTML = matching.map((e) => {
      const balStr = e.balance !== null ? ` (${formatBal(e.balance, 4)} ${e.symbol})` : '';
      return `<option value="${escapeHtml(e.key)}">${escapeHtml(e.chainLabel + balStr)}</option>`;
    }).join('');

    let chosen = null;
    if (preferredAssetId) {
      chosen = matching.find((e) => e.assetId.toLowerCase() === String(preferredAssetId).toLowerCase());
    }
    if (!chosen && preferredChainKey) {
      chosen = matching.find((e) => e.blockchain === String(preferredChainKey).toLowerCase());
    }
    if (!chosen) {
      chosen = matching.find((e) => typeof e.balance === 'number' && e.balance > 0) || matching[0];
    }
    if (chosen) srcSel.value = chosen.key;
  }

  function openSendSheet(opts = {}) {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const allEntries = getSendSourceEntriesForWallet(wallet);
    const symbolsSeen = new Set();
    const uniqueSymbols = [];
    for (const sym of DEFAULT_VISIBLE_SYMBOLS) {
      if (allEntries.some((e) => e.symbolKey === sym)) {
        symbolsSeen.add(sym);
        uniqueSymbols.push(sym);
      }
    }
    for (const e of allEntries) {
      if (!symbolsSeen.has(e.symbolKey)) {
        symbolsSeen.add(e.symbolKey);
        uniqueSymbols.push(e.symbolKey);
      }
    }

    let initialSymbol = String(opts.symbol || '').toUpperCase();
    if (!initialSymbol && opts.assetId) {
      const hit = allEntries.find((e) => e.assetId.toLowerCase() === String(opts.assetId).toLowerCase());
      if (hit) initialSymbol = hit.symbolKey;
    }
    if (!initialSymbol || !symbolsSeen.has(initialSymbol)) {
      initialSymbol = uniqueSymbols.includes('NEAR') ? 'NEAR' : (uniqueSymbols[0] || '');
    }

    const sel = $('send-asset-select');
    if (sel) {
      sel.innerHTML = uniqueSymbols.map((sym) => `<option value="${escapeHtml(sym)}">${escapeHtml(sym)}</option>`).join('');
      sel.value = initialSymbol;
    }

    populateSendSourceSelect(initialSymbol, opts.chainKey || '', opts.assetId || '');
    const selectedSendAsset = getSelectedSendAsset();
    const initialChain = String(opts.chainKey || selectedSendAsset?.blockchain || 'eth').toLowerCase();
    _sendTargetEvmChain = EVM_CHAIN_KEYS.includes(initialChain) ? initialChain : 'eth';
    $('send-evm-chain-row')?.classList.add('hidden');

    if ($('send-recipient-input')) $('send-recipient-input').value = opts.recipient || '';
    if ($('send-amount-input')) $('send-amount-input').value = '';
    if ($('send-detected-net')) $('send-detected-net').textContent = '';
    $('send-route-preview')?.classList.add('hidden');
    if (typeof resetSendTxReceipt === 'function') resetSendTxReceipt();
    $('send-gas-fix-banner')?.classList.add('hidden');
    if (_sendCrossQuoteTimer) {
      clearTimeout(_sendCrossQuoteTimer);
      _sendCrossQuoteTimer = null;
    }
    ++_sendCrossQuoteSeq;
    _sendCrossQuoteWarn = null;
    _sendCachedCrossQuote = null;
    const confirmBtn = $('btn-confirm-send');
    if (confirmBtn) confirmBtn.disabled = false;

    updateSendAvailabilityUI();
    if (opts.recipient) handleSendRecipientInput();
    openSheet('sheet-send');
  }

  function isNativeSendAsset(asset) {
    if (!asset) return false;
    if (asset.kind === 'native' || asset.isNative === true) return true;
    const contract = String(asset.contractAddress || '');
    const bc = String(asset.blockchain || '').toLowerCase();
    return !contract ||
      bc === 'prl' ||
      bc === 'btc' ||
      contract === 'So11111111111111111111111111111111111111112' ||
      contract.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' ||
      contract === 'wrap.near' ||
      (bc === 'arc' && contract.toLowerCase() === '0x3600000000000000000000000000000000000000');
  }

  const sendDec = (a, fb = 8) => (a && isNativeSendAsset(a) && a.blockchain === 'arc') ? 18 : (a?.decimals ?? fb);

  function resolveEffectiveSendGasPlan(wallet, asset) {
    const st = getState();
    const contracts = getContracts();
    const isNative = isNativeSendAsset(asset);
    if (!isNative || !asset) {
      return { isNative: false, gasBuffer: null, exactFeeBaseUnits: null, liveGas: null };
    }
    const chain = String(asset.blockchain || '').toLowerCase();
    const buffers = (contracts && contracts.DEFAULT_GAS_BUFFERS) || {};
    const walletKey = wallet ? (wallet.id || wallet.nearNamedAccount || wallet.nearAddress || 'default') : 'none';
    const cacheKey = `${walletKey}:${chain}:transfer`;
    const cached = st.send && st.send._liveGas;
    const isFresh = Boolean(cached && cached.key === cacheKey && (Date.now() - cached.ts) < 60_000 && cached.data);
    const liveGas = isFresh ? cached.data : null;

    let gasBuffer = null;
    let exactFeeBaseUnits = null;
    if (liveGas && Number.isFinite(Number(liveGas.gasReserve)) && Number(liveGas.gasReserve) >= 0) {
      gasBuffer = Number(liveGas.gasReserve);
      exactFeeBaseUnits = liveGas.exactFeeBaseUnits || null;
    } else if (chain === 'sol') {
      gasBuffer = 0.000005;
      exactFeeBaseUnits = '5000';
    } else {
      gasBuffer = Number(buffers[chain] || 0);
    }
    return { isNative: true, gasBuffer, exactFeeBaseUnits, liveGas };
  }

  async function prefetchSendLiveGasAsync(force = false) {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    const asset = getSelectedSendAsset();
    if (!wallet || !asset || !contracts || typeof contracts.estimateLiveNativeGasAsync !== 'function') return null;
    if (!isNativeSendAsset(asset)) return null;

    const chain = String(asset.blockchain || '').toLowerCase();
    const walletKey = wallet.id || wallet.nearNamedAccount || wallet.nearAddress || 'default';
    const cacheKey = `${walletKey}:${chain}:transfer`;
    const cached = st.send && st.send._liveGas;
    if (!force && cached && cached.key === cacheKey && (Date.now() - cached.ts) < 60_000 && cached.data) {
      return cached.data;
    }

    const res = await contracts.estimateLiveNativeGasAsync({ wallet, chain, kind: 'transfer' }).catch(() => null);
    if (res) {
      if (!st.send) st.send = {};
      st.send._liveGas = { key: cacheKey, ts: Date.now(), data: res };
      handleSendAmountInput();
    }
    return res;
  }

  function checkChainAddressValid(crypto, net, addr) {
    if (!net) return { valid: false, error: t('无法识别地址格式，请核对', 'Unrecognized address format') };
    if (!crypto || typeof crypto.validateChainAddress !== 'function') return { valid: true, error: '' };
    const res = crypto.validateChainAddress(net, addr);
    if (res && typeof res === 'object') {
      return { valid: Boolean(res.valid), error: res.error || '' };
    }
    return { valid: Boolean(res), error: '' };
  }

  function handleSendAssetChange() {
    if (_sendCrossQuoteTimer) {
      clearTimeout(_sendCrossQuoteTimer);
      _sendCrossQuoteTimer = null;
    }
    ++_sendCrossQuoteSeq;
    _sendCrossQuoteWarn = null;
    _sendCachedCrossQuote = null;
    const sym = ($('send-asset-select')?.value || '').toUpperCase();
    populateSendSourceSelect(sym);
    const amtInput = $('send-amount-input');
    if (amtInput) amtInput.value = '';
    if (typeof resetSendTxReceipt === 'function') resetSendTxReceipt();
    updateSendAvailabilityUI();
    const asset = getSelectedSendAsset();
    if (asset && EVM_CHAIN_KEYS.includes(asset.blockchain)) {
      _sendTargetEvmChain = asset.blockchain;
    }
    handleSendRecipientInput();
    handleSendAmountInput();
  }

  function getSelectedSendAsset() {
    const wallet = getState().getActiveWallet();
    const sym = ($('send-asset-select')?.value || '').toUpperCase();
    const srcKey = $('send-source-select')?.value || '';
    const allEntries = getSendSourceEntriesForWallet(wallet);
    return allEntries.find((e) => e.key === srcKey)
      || allEntries.find((e) => e.symbolKey === sym)
      || allEntries[0]
      || null;
  }

  function getSendSourceAvailable() {
    const wallet = getState().getActiveWallet();
    const asset = getSelectedSendAsset();
    if (!wallet || !asset) return null;
    return getWalletNativeBalanceForToken(wallet, asset.blockchain, asset.symbol, asset.contractAddress);
  }

  function updateSendAvailabilityUI() {
    if (typeof resetFormFields === 'function') {
      resetFormFields(['send-amount-input']);
    } else if ($('send-amount-input')) {
      $('send-amount-input').value = '';
    }
    const asset = getSelectedSendAsset();
    const bal = getSendSourceAvailable();
    const el = $('send-available-bal');
    if (el && asset) {
      el.textContent = `${formatBal(bal, 6)} ${asset.symbol}`;
    }
    if (asset && isNativeSendAsset(asset)) {
      prefetchSendLiveGasAsync(false).catch(() => {});
    }
    handleSendAmountInput();
  }

  function handleSendAmountInput() {
    updateSendRoutePreview();
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    const asset = getSelectedSendAsset();
    const fixBanner = $('send-gas-fix-banner');
    const fixText = $('send-gas-fix-text');
    if (!fixBanner || !wallet || !asset) {
      if (fixBanner) fixBanner.classList.add('hidden');
      return null;
    }
    const amt = Number($('send-amount-input')?.value || 0);
    if (!Number.isFinite(amt) || amt <= 0 || !isNativeSendAsset(asset)) {
      fixBanner.classList.add('hidden');
      if (fixText) fixText.textContent = '';
      return null;
    }
    const avail = getSendSourceAvailable();
    const gasPlan = resolveEffectiveSendGasPlan(wallet, asset);
    let effectiveAvail = avail !== null ? avail : 0;
    let rawUnits = gasPlan.liveGas && gasPlan.liveGas.liveBalanceBaseUnits ? gasPlan.liveGas.liveBalanceBaseUnits : null;
    if (rawUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
      const liveNum = Number(contracts.fromBaseUnits(rawUnits, sendDec(asset, 18)));
      if (Number.isFinite(liveNum) && liveNum > 0) {
        effectiveAvail = liveNum;
      } else {
        rawUnits = null;
      }
    }
    const feePlan = resolveNativeFeeDeductPlan({
      wallet,
      chain: asset.blockchain,
      amount: amt,
      avail: effectiveAvail,
      isNative: true,
      gasBuffer: gasPlan.gasBuffer,
      decimals: sendDec(asset, 6),
      rawBaseUnits: rawUnits,
      exactFeeBaseUnits: gasPlan.exactFeeBaseUnits
    });
    const canFix = Boolean(
      feePlan.mode === 'insufficient_gas' &&
      feePlan.maxSpendable > 0 &&
      feePlan.maxSpendableStr &&
      feePlan.maxSpendableStr !== '0'
    );
    fixBanner.classList.toggle('hidden', !canFix);
    if (canFix && fixText) {
      const gasMap = { sol: 'SOL', near: 'NEAR', prl: 'PRL', btc: 'BTC', bsc: 'BNB', pol: 'POL', avax: 'AVAX', hype: 'HYPE', arc: 'USDC' };
      const gasSym = gasMap[String(asset.blockchain || '').toLowerCase()] || 'ETH';
      fixText.textContent = t(
        `需预留约 ${formatBal(feePlan.gasReserve, 6)} ${gasSym} Gas，最大可转 ${feePlan.maxSpendableStr} ${asset.symbol}`,
        `Reserve ~${formatBal(feePlan.gasReserve, 6)} ${gasSym} for gas. Max: ${feePlan.maxSpendableStr} ${asset.symbol}`
      );
    } else if (fixText) {
      fixText.textContent = '';
    }
    return feePlan;
  }

  function applySendMaxSpendableFix() {
    const feePlan = handleSendAmountInput();
    const inp = $('send-amount-input');
    if (inp && feePlan && feePlan.maxSpendableStr && feePlan.maxSpendableStr !== '0') {
      inp.value = feePlan.maxSpendableStr;
      $('send-gas-fix-banner')?.classList.add('hidden');
      handleSendAmountInput();
    }
  }

  async function setSendMaxAmount() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    const asset = getSelectedSendAsset();
    const bal = getSendSourceAvailable();
    const inp = $('send-amount-input');
    if (!inp || !asset) return;
    if (bal === null || bal === undefined) {
      showToast(t('余额同步中，请稍候', 'Balance syncing, please wait'));
      return;
    }
    if (bal <= 0) return;

    if (!isNativeSendAsset(asset)) {
      const rawUnits = getWalletTokenRawBaseUnits(wallet, asset.blockchain, asset.contractAddress);
      inp.value = formatMaxDecimalString(bal, asset.decimals ?? 6, rawUnits);
      handleSendAmountInput();
      return;
    }

    const maxBtn = $('btn-send-max');
    if (maxBtn) maxBtn.disabled = true;
    const startKey = asset.key;
    try {
      const liveGas = await prefetchSendLiveGasAsync(false).catch(() => null);
      const curAsset = getSelectedSendAsset();
      if (!curAsset || curAsset.key !== startKey) return;

      const gasPlan = resolveEffectiveSendGasPlan(wallet, curAsset);
      let effectiveBal = bal;
      let rawUnits = null;
      if (liveGas && liveGas.liveBalanceBaseUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
        const liveNum = Number(contracts.fromBaseUnits(liveGas.liveBalanceBaseUnits, sendDec(curAsset, 18)));
        if (Number.isFinite(liveNum) && liveNum > 0) {
          effectiveBal = liveNum;
          rawUnits = liveGas.liveBalanceBaseUnits;
        }
      }
      const maxInfo = computeExactMaxSpendable({
        balance: effectiveBal,
        rawBaseUnits: rawUnits,
        decimals: sendDec(curAsset, 6),
        isNative: true,
        gasReserve: gasPlan.gasBuffer || 0,
        exactFeeBaseUnits: gasPlan.exactFeeBaseUnits
      });
      inp.value = maxInfo.maxAmountStr || '0';
      handleSendAmountInput();
    } finally {
      if (maxBtn) maxBtn.disabled = false;
    }
  }

  async function pasteToSendAddress() {
    try {
      const text = await navigator.clipboard.readText();
      const inp = $('send-recipient-input');
      if (inp && text) {
        inp.value = text.trim();
        handleSendRecipientInput();
      }
    } catch (_) {
      showToast(t('请手动粘贴地址', 'Please paste address manually'));
    }
  }

  function handleSendRecipientInput() {
    const crypto = getCrypto();
    const tokens = getTokens();
    const addr = ($('send-recipient-input')?.value || '').trim();
    const labelEl = $('send-detected-net');
    const evmRow = $('send-evm-chain-row');
    if (!labelEl) return;
    if (!addr) {
      labelEl.textContent = '';
      if (evmRow) evmRow.classList.add('hidden');
      updateSendRoutePreview();
      return;
    }
    const net = crypto.detectAddressNetwork(addr);
    const addrCheck = checkChainAddressValid(crypto, net, addr);
    if (net && !addrCheck.valid) {
      if (evmRow) evmRow.classList.add('hidden');
      labelEl.style.color = 'var(--rose-alert)';
      labelEl.textContent = addrCheck.error || t('地址校验和无效，请仔细核对大小写或字符', 'Address checksum invalid, please verify');
      updateSendRoutePreview();
      return;
    }
    if (net === 'evm') {
      if (evmRow) evmRow.classList.remove('hidden');
      renderSendEvmChainPills();
      const evmMeta = tokens.getChainMeta(_sendTargetEvmChain);
      labelEl.style.color = 'var(--cyan-glow)';
      labelEl.textContent = `${t('已识别目标网络', 'Detected Network')}: ${evmMeta.name} (EVM)`;
    } else if (net) {
      if (evmRow) evmRow.classList.add('hidden');
      const meta = tokens.getChainMeta(net);
      labelEl.style.color = 'var(--cyan-glow)';
      labelEl.textContent = `${t('已识别目标网络', 'Detected Network')}: ${meta.name}`;
    } else {
      if (evmRow) evmRow.classList.add('hidden');
      labelEl.style.color = 'var(--rose-alert)';
      labelEl.textContent = t('无法识别地址格式，请核对', 'Unrecognized address format');
    }
    updateSendRoutePreview();
  }

  let _sendExecuting = false;

  async function executeUnifiedSend() {
    if (_sendExecuting) return;
    const st = getState();
    const crypto = getCrypto();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const asset = getSelectedSendAsset();
    const recipient = ($('send-recipient-input')?.value || '').trim();
    const rawAmtStr = String($('send-amount-input')?.value || '').trim();
    const amountNum = Number(rawAmtStr || 0);

    if (!asset) return;
    if (!recipient) {
      showToast(t('请输入收款地址', 'Enter recipient address'));
      return;
    }
    const detectedNet = crypto.detectAddressNetwork(recipient);
    const recCheck = checkChainAddressValid(crypto, detectedNet, recipient);
    if (!detectedNet || !recCheck.valid) {
      showToast(recCheck.error || t('收款地址格式或校验和无效', 'Invalid recipient address or checksum'));
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      showToast(t('请输入大于 0 的转账数量', 'Enter a positive amount'));
      return;
    }

    const avail = getSendSourceAvailable();
    if (avail === null || avail === undefined) {
      showToast(t('余额同步中，请稍候重试', 'Balance syncing, please wait'));
      return;
    }
    const gasPlan = resolveEffectiveSendGasPlan(wallet, asset);
    const isNativeGas = gasPlan.isNative;
    const gasBuf = isNativeGas ? gasPlan.gasBuffer : null;
    const gasMeta = (gasPlan.liveGas && gasPlan.liveGas.meta) || {};
    let effectiveAvail = avail !== null ? avail : 0;
    let rawUnits = isNativeGas && gasPlan.liveGas && gasPlan.liveGas.liveBalanceBaseUnits ? gasPlan.liveGas.liveBalanceBaseUnits : null;
    if (isNativeGas && rawUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
      const liveNum = Number(contracts.fromBaseUnits(rawUnits, sendDec(asset, 18)));
      if (Number.isFinite(liveNum) && liveNum > 0) {
        effectiveAvail = liveNum;
      } else {
        rawUnits = null;
      }
    }

    const feePlan = resolveNativeFeeDeductPlan({
      wallet,
      chain: asset.blockchain,
      amount: amountNum,
      avail: effectiveAvail,
      isNative: isNativeGas,
      gasBuffer: gasBuf,
      decimals: sendDec(asset, 6),
      rawBaseUnits: rawUnits,
      exactFeeBaseUnits: gasPlan.exactFeeBaseUnits
    });
    if (feePlan.mode === 'insufficient_balance') {
      showToast(`${asset.symbol} ${t('余额不足', 'balance insufficient')}`);
      return;
    }
    if (feePlan.mode === 'insufficient_gas') {
      handleSendAmountInput();
      const gasSym = { sol: 'SOL', near: 'NEAR', prl: 'PRL', btc: 'BTC', bsc: 'BNB', pol: 'POL', avax: 'AVAX', hype: 'HYPE', arc: 'USDC' }[String(asset.blockchain || '').toLowerCase()] || 'ETH';
      showToast(`${gasSym} ${t('网络手续费余额不足', 'network fee insufficient')}`);
      return;
    }

    try {
      contracts.validateSufficientChainBalance({
        wallet,
        chain: asset.blockchain,
        tokenSymbol: asset.symbol,
        amount: amountNum,
        isNative: isNativeGas,
        tokenBalance: effectiveAvail,
        gasBuffer: gasBuf
      });
      if (!isNativeGas && typeof contracts.getNativeGasReserve === 'function') {
        const minNative = contracts.getNativeGasReserve(asset.blockchain);
        const nativeBal = typeof contracts.resolveWalletChainBalance === 'function'
          ? contracts.resolveWalletChainBalance(wallet, asset.blockchain)
          : Number((wallet.nativeBalances && wallet.nativeBalances[asset.blockchain]) ?? 0);
        if (minNative > 0 && nativeBal + 1e-12 < minNative) {
          const gasSym = { sol: 'SOL', near: 'NEAR', prl: 'PRL', btc: 'BTC', bsc: 'BNB', pol: 'POL', avax: 'AVAX', hype: 'HYPE', arc: 'USDC' }[String(asset.blockchain || '').toLowerCase()] || 'ETH';
          throw new Error(`${gasSym} ${t('网络手续费余额不足', 'network fee balance insufficient')} (${nativeBal.toFixed(5)} < ${minNative})`);
        }
      }
      if (asset.blockchain === 'sol' && isNativeGas) {
        const feeSol = typeof gasBuf === 'number' ? gasBuf : 0.00001;
        const remainingSol = effectiveAvail - amountNum - feeSol;
        if (remainingSol > 1e-9 && remainingSol < 0.00089088) {
          throw new Error(t('Solana 账户剩余 SOL 低于免租阈值 (0.000891 SOL)，请点击「全部」或减少发送金额', 'Remaining SOL would fall below rent-exempt minimum (0.000891 SOL). Tap Max or send less.'));
        }
      }
    } catch (err) {
      showToast(toUserFriendlyError(err, '余额或参数校验未通过', 'Balance or validation check failed'));
      return;
    }

    _sendExecuting = true;
    let sendStepper = null;
    const btn = $('btn-confirm-send');
    const prevBtnText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('发送中...', 'Sending...');
    }

    try {
      const isEvmOrigin = EVM_CHAIN_KEYS.includes(asset.blockchain);
      const targetEvmChain = detectedNet === 'evm'
        ? (_sendTargetEvmChain || (isEvmOrigin ? asset.blockchain : 'eth'))
        : detectedNet;
      const isSameChain =
        (asset.blockchain === 'near' && detectedNet === 'near') ||
        (asset.blockchain === 'sol' && detectedNet === 'sol') ||
        (isEvmOrigin && detectedNet === 'evm' && asset.blockchain === targetEvmChain) ||
        (asset.blockchain === 'prl' && detectedNet === 'prl') ||
        (asset.blockchain === 'btc' && detectedNet === 'btc');

      const exactAmt = rawAmtStr || amountNum;
      let preQuotedCross = null;
      let preDestAsset = null;
      let authReason = `${t('确认发送', 'Confirm send')} ${exactAmt} ${asset.symbol}`;

      if (!isSameChain) {
        const existingOrder = st.swap && st.swap.activeOrder;
        const hasPendingMultiStage = existingOrder && existingOrder.walletId === wallet.id &&
          hasPendingSwapFollowUp(existingOrder) && !existingOrder.followUpExecuted && (
          existingOrder.followUpFailed ||
          !['SUCCESS', 'COMPLETED', 'FAILED', 'REFUNDED'].includes(String(existingOrder.status || '').toUpperCase())
        );
        if (hasPendingMultiStage) {
          throw new Error(t('当前有一笔多段闪兑正在执行，请等待完成后再发起跨链发送', 'A multi-step swap is in progress. Please wait for it to finish before sending cross-chain.'));
        }
        const canBroadcastOrigin =
          asset.blockchain === 'near' ||
          asset.blockchain === 'sol' ||
          asset.blockchain === 'prl' ||
          asset.blockchain === 'btc' ||
          (isEvmOrigin && asset.blockchain !== 'arc' && asset.blockchain !== 'hype');
        if (!canBroadcastOrigin || !isOneClickAsset(asset, asset.blockchain)) {
          throw new Error(t('所选源链或代币暂不支持跨链直转，请使用闪兑', 'Cross-chain send is unavailable for this source chain/token; please use Swap'));
        }
        preDestAsset = resolveDestinationAssetForNetwork(asset.symbol, detectedNet, asset.assetId, targetEvmChain);
        if (!preDestAsset) {
          throw new Error(t('该代币暂不支持跨链直转到目标网络，请使用闪兑', 'This token cannot be sent directly to the target network; please use Swap'));
        }
        await contracts.ensureWalletSigningKeysAsync(wallet);
        const originAssetId = resolve1ClickId(asset, asset.blockchain) || asset.assetId;
        const amountRaw = intents.toBaseUnits(exactAmt, sendDec(asset, 8));
        const refundTo = getWalletDefaultRecipientForChain(wallet, asset.blockchain) || (wallet.nearNamedAccount || wallet.nearAddress);
        const cacheKey = `${wallet.id || ''}|${originAssetId}|${preDestAsset.assetId}|${amountRaw}|${recipient}`;
        if (_sendCachedCrossQuote && _sendCachedCrossQuote.key === cacheKey && (Date.now() - _sendCachedCrossQuote.ts < 15_000) && _sendCachedCrossQuote.quote && _sendCachedCrossQuote.quote.ok) {
          preQuotedCross = _sendCachedCrossQuote.quote;
        } else {
          preQuotedCross = await intents.quoteIntentSwapOrWithdraw({
            originAsset: originAssetId,
            destinationAsset: preDestAsset.assetId,
            amountRaw,
            slippageBps: 100,
            recipient,
            refundTo,
            depositType: 'ORIGIN_CHAIN',
            recipientType: 'DESTINATION_CHAIN',
            appFeeBps: (intents.APP_FEE_CONFIG && intents.APP_FEE_CONFIG.SEND_CROSS_CHAIN_BPS) ?? 25,
            dry: true
          });
        }
        if (!preQuotedCross.ok) {
          throw new Error(toUserFriendlyError(preQuotedCross.error, '获取跨链转账路由失败，请重试', 'Failed to obtain cross-chain route'));
        }
        const outHuman = preQuotedCross.amountOutFormatted || intents.fromBaseUnits(String(preQuotedCross.amountOut || '0'), preDestAsset.decimals ?? 8);
        authReason = `${t('确认跨链发送', 'Confirm cross-chain send')} ${exactAmt} ${asset.symbol} → ~${formatBal(Number(outHuman), 6)} ${preDestAsset.symbol || asset.symbol}`;
      }

      const sendPlan = typeof buildSendTxFlowPlan === 'function'
        ? buildSendTxFlowPlan({ asset, exactAmt, amountNum, recipient, isSameChain, detectedNet, targetEvmChain, preDestAsset, preQuotedCross, gasPlan })
        : null;
      if (sendPlan && typeof openTxPreviewModalAsync === 'function' && !(await openTxPreviewModalAsync(sendPlan.previewConfig))) return;

      if (!(await verifySecurityAuthAsync(wallet, authReason))) {
        if (typeof closeTxFlowModal === 'function') closeTxFlowModal();
        return;
      }
      sendStepper = sendPlan && typeof createTxStepperController === 'function'
        ? createTxStepperController(t('正在发送转账', 'Sending Transfer'), sendPlan.steps)
        : null;
      if (sendStepper) sendStepper.setStep(0, 'active');
      if (isEvmOrigin) await ensureEthersLoaded();
      await contracts.ensureWalletSigningKeysAsync(wallet);

      if (!isSameChain) {
        const originAssetId = resolve1ClickId(asset, asset.blockchain) || asset.assetId;
        const amountRaw = intents.toBaseUnits(exactAmt, sendDec(asset, 8));
        const refundTo = getWalletDefaultRecipientForChain(wallet, asset.blockchain) || (wallet.nearNamedAccount || wallet.nearAddress);
        preQuotedCross = await intents.quoteIntentSwapOrWithdraw({
          originAsset: originAssetId,
          destinationAsset: preDestAsset.assetId,
          amountRaw,
          slippageBps: 100,
          recipient,
          refundTo,
          depositType: 'ORIGIN_CHAIN',
          recipientType: 'DESTINATION_CHAIN',
          appFeeBps: (intents.APP_FEE_CONFIG && intents.APP_FEE_CONFIG.SEND_CROSS_CHAIN_BPS) ?? 25,
          dry: false
        });
        if (!preQuotedCross.ok || !preQuotedCross.depositAddress) {
          throw new Error(toUserFriendlyError(preQuotedCross.error, '获取跨链转账路由失败，请重试', 'Failed to obtain cross-chain route'));
        }
      }

      // Case 1: Same-chain direct on-chain transfer
      if (isSameChain) {
        const sent = await dispatchOnChainSend({ contracts, wallet, asset, isEvmOrigin, isNativeGas, toAddress: recipient, exactAmt, avail, gasBuf, gasMeta });
        if (!sent || !sent.txHash) {
          throw new Error(t('暂不支持该代币的同链转账', 'Direct transfer is not supported for this token yet'));
        }
        const isUtxo = asset.blockchain === 'prl' || asset.blockchain === 'btc';
        const feeVal = isUtxo ? (sent.fee || 0) : null;
        const netSent = isUtxo ? (sent.netSent || amountNum) : amountNum;
        if (isUtxo) applyOptimisticChainSpend(wallet, asset.blockchain, netSent, feeVal, sent.txHash);
        const activityItem = {
          type: 'send',
          symbol: asset.symbol,
          chain: asset.blockchain,
          amount: netSent,
          fee: feeVal && feeVal > 0 ? feeVal : null,
          netAmount: isUtxo ? -(netSent + feeVal) : null,
          counterparty: isUtxo ? recipient : undefined,
          txHash: sent.txHash,
          title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}`
        };
        recordWalletActivity(wallet, activityItem);
        const sentMsg = t('转账已发出', 'Transfer sent');
        if (sendStepper) {
          sendStepper.setStep(0, 'done', { txHash: sent.txHash, chain: asset.blockchain });
          sendStepper.finish(true, { text: sentMsg, doneTitle: t('转账已发出', 'Transfer Sent') });
        }
        if (typeof renderSendTxReceipt === 'function') {
          renderSendTxReceipt({ chain: asset.blockchain, symbol: asset.symbol, amount: netSent, recipient, txHash: sent.txHash, statusText: sentMsg, activityItem });
        } else {
          closeAllSheets();
        }
        if ($('send-amount-input')) $('send-amount-input').value = '';
        if ($('send-recipient-input')) $('send-recipient-input').value = '';
        _sendCachedCrossQuote = null;
        _sendCrossQuoteWarn = null;
        ++_sendCrossQuoteSeq;
        if (st.send && typeof st.send === 'object') {
          st.send.recipient = '';
          st.send.amount = '';
          st.send.quote = null;
        }
        showToast(`✅ ${sentMsg}: ${shortenAddr(sent.txHash)}`);
        refreshAllBalancesAsync(false);
        return;
      }

      // Case 2: Cross-chain L1 -> L1 transfer via pre-quoted 1Click ORIGIN_CHAIN -> DESTINATION_CHAIN
      const destAsset = preDestAsset;
      const quote = preQuotedCross;
      const crossSent = await dispatchOnChainSend({ contracts, wallet, asset, isEvmOrigin, isNativeGas, toAddress: quote.depositAddress, exactAmt, avail, gasBuf, gasMeta });
      const depositTxHash = (crossSent && crossSent.txHash) || '';
      const depositFeeNum = (crossSent && crossSent.fee !== null && crossSent.fee !== undefined && Number.isFinite(Number(crossSent.fee))) ? Number(crossSent.fee) : null;
      if (depositTxHash && (asset.blockchain === 'prl' || asset.blockchain === 'btc')) {
        applyOptimisticChainSpend(wallet, asset.blockchain, amountNum, depositFeeNum || 0, depositTxHash);
      }

      if (!depositTxHash) {
        throw new Error(t(`暂不支持从 ${String(asset.blockchain || '').toUpperCase()} 发起跨链发送`, `Cross-chain send from ${String(asset.blockchain || '').toUpperCase()} is unavailable`));
      }

      if (sendStepper) {
        sendStepper.setStep(0, 'done', { txHash: depositTxHash, chain: asset.blockchain });
        sendStepper.setStep(1, 'active');
      }
      const nearSenderAccount = wallet.nearNamedAccount || wallet.nearAddress;
      await intents.submitExternalDepositTxHash({
        depositAddress: quote.depositAddress,
        txHash: depositTxHash,
        nearSenderAccount
      }).catch(() => {});

      st.swap.activeOrder = {
        walletId: wallet.id,
        depositAddress: quote.depositAddress,
        memo: quote.memo || null,
        status: 'PENDING_DEPOSIT',
        fromSymbol: asset.symbol,
        toSymbol: destAsset.symbol || asset.symbol,
        originTxHash: depositTxHash,
        autoBroadcasted: true,
        createdAt: Date.now()
      };
      if (typeof st.saveActiveSwapOrder === 'function') st.saveActiveSwapOrder(st.swap.activeOrder);
      renderSwapOrderCard();
      startOrderStatusPolling();

      const crossActivityItem = {
        type: 'send',
        symbol: asset.symbol,
        chain: asset.blockchain,
        amount: amountNum,
        fee: depositFeeNum,
        netAmount: depositFeeNum !== null ? -(amountNum + depositFeeNum) : null,
        counterparty: recipient,
        txHash: depositTxHash,
        title: `${t('跨链转账至', 'Cross-chain to')} ${shortenAddr(recipient)}`
      };
      recordWalletActivity(wallet, crossActivityItem);
      const crossMsg = t('已从源链转出，目标链预计 1–3 分钟到账', 'Sent from origin chain. Arriving in ~1–3 min');
      if (sendStepper) {
        sendStepper.setStep(1, 'active');
        sendStepper.finish(true, { text: crossMsg, inTransit: true, doneTitle: t('已转出，等待到账', 'Sent · Waiting for Arrival') });
      }
      if (typeof renderSendTxReceipt === 'function') {
        renderSendTxReceipt({ chain: asset.blockchain, symbol: asset.symbol, amount: amountNum, recipient, txHash: depositTxHash, statusText: crossMsg, activityItem: crossActivityItem });
      } else {
        closeAllSheets();
      }
      if ($('send-amount-input')) $('send-amount-input').value = '';
      if ($('send-recipient-input')) $('send-recipient-input').value = '';
      _sendCachedCrossQuote = null;
      _sendCrossQuoteWarn = null;
      ++_sendCrossQuoteSeq;
      if (st.send && typeof st.send === 'object') {
        st.send.recipient = '';
        st.send.amount = '';
        st.send.quote = null;
      }
      showToast(`✅ ${crossMsg}: ${shortenAddr(depositTxHash)}`);
      refreshAllBalancesAsync(false);
    } catch (err) {
      const errMsg = toUserFriendlyError(err, '转账失败，请重试', 'Transfer failed. Please try again.');
      if (sendStepper) {
        sendStepper.setStep(0, 'error', { error: errMsg });
        sendStepper.finish(false, errMsg);
      } else if (typeof closeTxFlowModal === 'function' && $('sheet-tx-flow')?.classList.contains('open')) {
        closeTxFlowModal();
      }
      showToast(errMsg);
    } finally {
      _sendExecuting = false;
      if (btn) {
        btn.disabled = false;
        if (prevBtnText) btn.textContent = prevBtnText;
      }
    }
  }


  function renderSendRouteSummary(previewEl, props, fallbackText) {
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountSendFeeSummaryPanel === 'function') {
      fw.mountSendFeeSummaryPanel(previewEl, props);
      return;
    }
    previewEl.textContent = fallbackText || '';
  }

