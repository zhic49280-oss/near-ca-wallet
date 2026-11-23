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
            ? `${chainMeta.name} (NEP-141 ${shortenAddr(e.contractAddress, 6, 4)})`
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
    if (bc === 'near' && contractAddress && !isNativeContract) {
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
    $('send-gas-fix-banner')?.classList.add('hidden');

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

  function handleSendAssetChange() {
    const sym = ($('send-asset-select')?.value || '').toUpperCase();
    populateSendSourceSelect(sym);
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
      const liveNum = Number(contracts.fromBaseUnits(rawUnits, asset.decimals || 18));
      if (Number.isFinite(liveNum) && liveNum > 0 && liveNum <= effectiveAvail + 1e-12) {
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
      decimals: asset.decimals || 6,
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
    if (!inp || !asset || bal === null || bal <= 0) return;

    if (!isNativeSendAsset(asset)) {
      const rawUnits = getWalletTokenRawBaseUnits(wallet, asset.blockchain, asset.contractAddress);
      inp.value = formatMaxDecimalString(bal, asset.decimals || 6, rawUnits);
      handleSendAmountInput();
      return;
    }

    const startKey = asset.key;
    const liveGas = await prefetchSendLiveGasAsync(false).catch(() => null);
    const curAsset = getSelectedSendAsset();
    if (!curAsset || curAsset.key !== startKey) return;

    const gasPlan = resolveEffectiveSendGasPlan(wallet, curAsset);
    let effectiveBal = bal;
    let rawUnits = null;
    if (liveGas && liveGas.liveBalanceBaseUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
      const liveNum = Number(contracts.fromBaseUnits(liveGas.liveBalanceBaseUnits, curAsset.decimals || 18));
      if (Number.isFinite(liveNum) && liveNum > 0 && liveNum <= bal + 1e-12) {
        effectiveBal = liveNum;
        rawUnits = liveGas.liveBalanceBaseUnits;
      }
    }
    const maxInfo = computeExactMaxSpendable({
      balance: effectiveBal,
      rawBaseUnits: rawUnits,
      decimals: curAsset.decimals || 6,
      isNative: true,
      gasReserve: gasPlan.gasBuffer || 0,
      exactFeeBaseUnits: gasPlan.exactFeeBaseUnits
    });
    inp.value = maxInfo.maxAmountStr || '0';
    handleSendAmountInput();
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
      return;
    }
    const net = crypto.detectAddressNetwork(addr);
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
  }

  function resolveDestinationAssetForNetwork(symbol, detectedNet, fallbackAssetId, preferredEvmChain = 'eth') {
    const tokens = getTokens();
    const symUpper = String(symbol || '').toUpperCase();
    const core = tokens.UNIFIED_CORE_TOKENS || [];
    const prefEvm = String(preferredEvmChain || '').toLowerCase();
    const targetChain = detectedNet === 'evm'
      ? (EVM_CHAIN_KEYS.includes(prefEvm) ? prefEvm : 'eth')
      : detectedNet;
    if (targetChain === 'near' && symUpper === 'PRL') {
      return { assetId: '1cs_v1:near:nep141:prl.omft.near', blockchain: 'near', symbol: 'PRL', decimals: 8 };
    }
    if (targetChain === 'qtc' && symUpper === 'QTC') {
      return { assetId: 'nep141:qtc.omft.near', blockchain: 'qtc', symbol: 'QTC', decimals: 12 };
    }
    if (targetChain === 'near' && symUpper === 'QTC') {
      return { assetId: '1cs_v1:near:nep141:qtc.omft.near', blockchain: 'near', symbol: 'QTC', decimals: 12 };
    }
    const exact = core.find((c) => c.blockchain === targetChain && String(c.symbol).toUpperCase() === symUpper);
    if (exact) return exact;
    const catalog = getSwapTokenCatalog();
    const exactCat = catalog.find((c) => c.blockchain === targetChain && String(c.symbol).toUpperCase() === symUpper);
    if (exactCat) return exactCat;
    if (detectedNet === 'evm') {
      const anyEvm = core.find((c) => EVM_CHAIN_KEYS.includes(c.blockchain) && String(c.symbol).toUpperCase() === symUpper)
        || catalog.find((c) => EVM_CHAIN_KEYS.includes(c.blockchain) && String(c.symbol).toUpperCase() === symUpper);
      if (anyEvm) return anyEvm;
    }
    return core.find((c) => c.assetId === fallbackAssetId)
      || catalog.find((c) => c.assetId === fallbackAssetId)
      || { assetId: fallbackAssetId, blockchain: targetChain, symbol };
  }

  async function executeUnifiedSend() {
    const st = getState();
    const crypto = getCrypto();
    const intents = getIntents();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const asset = getSelectedSendAsset();
    const recipient = ($('send-recipient-input')?.value || '').trim();
    const amountNum = Number($('send-amount-input')?.value || 0);

    if (!asset) return;
    if (!recipient) {
      showToast(t('请输入收款地址', 'Enter recipient address'));
      return;
    }
    const detectedNet = crypto.detectAddressNetwork(recipient);
    if (!detectedNet) {
      showToast(t('收款地址格式无效', 'Invalid recipient address'));
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      showToast(t('请输入大于 0 的转账数量', 'Enter a positive amount'));
      return;
    }

    const avail = getSendSourceAvailable();
    const gasPlan = resolveEffectiveSendGasPlan(wallet, asset);
    const isNativeGas = gasPlan.isNative;
    const gasBuf = isNativeGas ? gasPlan.gasBuffer : null;
    const gasMeta = (gasPlan.liveGas && gasPlan.liveGas.meta) || {};
    let effectiveAvail = avail !== null ? avail : 0;
    let rawUnits = isNativeGas && gasPlan.liveGas && gasPlan.liveGas.liveBalanceBaseUnits ? gasPlan.liveGas.liveBalanceBaseUnits : null;
    if (isNativeGas && rawUnits && contracts && typeof contracts.fromBaseUnits === 'function') {
      const liveNum = Number(contracts.fromBaseUnits(rawUnits, asset.decimals || 18));
      if (Number.isFinite(liveNum) && liveNum > 0 && liveNum <= effectiveAvail + 1e-12) {
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
      decimals: asset.decimals || 6,
      rawBaseUnits: rawUnits,
      exactFeeBaseUnits: gasPlan.exactFeeBaseUnits
    });
    if (feePlan.mode === 'insufficient_balance') {
      showToast(`${asset.symbol} ${t('余额不足', 'balance insufficient')}`);
      return;
    }
    if (feePlan.mode === 'insufficient_gas') {
      handleSendAmountInput();
      showToast(`${String(asset.blockchain || '').toUpperCase()} ${t('Gas 余额不足', 'Gas insufficient')}`);
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
    } catch (err) {
      showToast(err.message);
      return;
    }

    if (!(await verifySecurityAuthAsync(wallet, `${t('确认发送', 'Confirm send')} ${amountNum} ${asset.symbol}`))) return;

    const btn = $('btn-confirm-send');
    if (btn) btn.disabled = true;

    try {
      const isEvmOrigin = EVM_CHAIN_KEYS.includes(asset.blockchain);
      if (isEvmOrigin) await ensureEthersLoaded();
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const targetEvmChain = detectedNet === 'evm'
        ? (_sendTargetEvmChain || (isEvmOrigin ? asset.blockchain : 'eth'))
        : detectedNet;
      const isSameChain =
        (asset.blockchain === 'near' && detectedNet === 'near') ||
        (asset.blockchain === 'sol' && detectedNet === 'sol') ||
        (isEvmOrigin && detectedNet === 'evm' && asset.blockchain === targetEvmChain) ||
        (asset.blockchain === 'prl' && detectedNet === 'prl') ||
        (asset.blockchain === 'btc' && detectedNet === 'btc');

      // Case 1: Same-chain direct on-chain transfer
      if (isSameChain) {
        if (asset.blockchain === 'near' && asset.kind !== 'nep141' && asset.symbol === 'NEAR') {
          const res = await contracts.signAndSendNearTransfer({
            wallet,
            receiverId: recipient.toLowerCase(),
            amountNear: amountNum,
            gasBuffer: gasBuf
          });
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ NEAR ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }

        if (asset.blockchain === 'near' && asset.contractAddress && typeof contracts.executeNearNep141Transfer === 'function') {
          const res = await contracts.executeNearNep141Transfer({
            wallet,
            tokenContract: asset.contractAddress,
            receiverId: recipient.toLowerCase(),
            amount: amountNum,
            decimals: asset.decimals || 8,
            tokenSymbol: asset.symbol,
            tokenBalance: avail
          });
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ ${asset.symbol} (NEAR) ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }

        if (asset.blockchain === 'sol') {
          if (!asset.contractAddress || asset.contractAddress === 'So11111111111111111111111111111111111111112') {
            const res = await contracts.executeSolanaNativeTransfer({ wallet, toAddress: recipient, amountSol: amountNum, gasBuffer: gasBuf });
            recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
            showToast(`✅ SOL ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
            closeAllSheets();
            refreshAllBalancesAsync(false);
            return;
          }
          const res = await contracts.executeSolanaSplTransfer({
            wallet,
            mintAddress: asset.contractAddress,
            toAddress: recipient,
            amount: amountNum,
            decimals: asset.decimals || 6,
            tokenBalance: avail
          });
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ ${asset.symbol} (Solana) ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }

        if (isEvmOrigin) {
          const res = await contracts.executeEvmTransfer({
            wallet,
            chainKey: asset.blockchain,
            toAddress: recipient,
            amount: amountNum,
            tokenContract: asset.contractAddress,
            decimals: asset.decimals,
            tokenBalance: avail,
            gasBuffer: isNativeGas ? gasBuf : null,
            gasPriceWei: isNativeGas ? (gasMeta.gasPriceWei ?? null) : null,
            gasLimit: isNativeGas ? (gasMeta.gasLimit ?? null) : null
          });
          recordWalletActivity(wallet, { type: 'send', symbol: asset.symbol, chain: asset.blockchain, amount: amountNum, txHash: res.txHash, title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}` });
          showToast(`✅ EVM ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }

        if (asset.blockchain === 'prl') {
          const res = await contracts.executePearlTransfer({
            wallet,
            toAddress: recipient,
            amountPrl: amountNum,
            feeDeductMode: 'extra',
            feePerKbPrl: gasMeta.feePerKbPrl ?? null,
            gasBuffer: gasBuf
          });
          const feePrl = Number(res.feePrl) || 0;
          const netSent = Number(res.sentPrl) || amountNum;
          applyOptimisticChainSpend(wallet, 'prl', netSent, feePrl, res.txHash);
          recordWalletActivity(wallet, {
            type: 'send',
            symbol: asset.symbol,
            chain: asset.blockchain,
            amount: netSent,
            fee: feePrl > 0 ? feePrl : null,
            netAmount: -(netSent + feePrl),
            counterparty: recipient,
            txHash: res.txHash,
            title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}`
          });
          showToast(`✅ PRL ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }
        if (asset.blockchain === 'btc') {
          const res = await contracts.executeBitcoinTransfer({
            wallet,
            toAddress: recipient,
            amountBtc: amountNum,
            feeDeductMode: 'extra',
            feeRateSatVb: gasMeta.feeRateSatVb ?? null,
            gasBuffer: gasBuf
          });
          const feeBtc = Number(res.feeBtc) || 0;
          const netSent = Number(res.sentBtc) || amountNum;
          applyOptimisticChainSpend(wallet, 'btc', netSent, feeBtc, res.txHash);
          recordWalletActivity(wallet, {
            type: 'send',
            symbol: asset.symbol,
            chain: 'btc',
            amount: netSent,
            fee: feeBtc > 0 ? feeBtc : null,
            netAmount: -(netSent + feeBtc),
            counterparty: recipient,
            txHash: res.txHash,
            title: `${t('转账至', 'Sent to')} ${shortenAddr(recipient)}`
          });
          showToast(`✅ BTC ${t('广播成功', 'Sent')}: ${shortenAddr(res.txHash)}`);
          closeAllSheets();
          refreshAllBalancesAsync(false);
          return;
        }
        throw new Error(t('该同链代币转账暂未接通签名广播', 'Direct transfer unsupported for this token'));
      }

      // Case 2: Cross-chain L1 -> L1 transfer via 1Click ORIGIN_CHAIN -> DESTINATION_CHAIN
      const canBroadcastOrigin =
        asset.blockchain === 'near' ||
        asset.blockchain === 'sol' ||
        asset.blockchain === 'prl' ||
        asset.blockchain === 'btc' ||
        (isEvmOrigin && asset.blockchain !== 'arc');

      if (!canBroadcastOrigin) {
        throw new Error(t('所选源链暂不支持自动签名跨链，请在收款网络切换或使用支持的源链', 'Origin chain does not support automated cross-chain broadcast'));
      }

      const destAsset = resolveDestinationAssetForNetwork(asset.symbol, detectedNet, asset.assetId, targetEvmChain);
      const amountRaw = intents.toBaseUnits(amountNum, asset.decimals || 8);
      const refundTo = getWalletDefaultRecipientForChain(wallet, asset.blockchain) || (wallet.nearNamedAccount || wallet.nearAddress);

      const quote = await intents.quoteIntentSwapOrWithdraw({
        originAsset: asset.assetId,
        destinationAsset: destAsset.assetId,
        amountRaw,
        slippageBps: 100,
        recipient,
        refundTo,
        depositType: 'ORIGIN_CHAIN',
        recipientType: 'DESTINATION_CHAIN',
        dry: false
      });

      if (!quote.ok || !quote.depositAddress) {
        throw new Error(quote.error || t('获取跨链转账路由失败', 'Failed to obtain cross-chain route'));
      }

      let depositTxHash = '';
      let depositFeeNum = null;
      if (asset.blockchain === 'near' && asset.kind !== 'nep141' && asset.symbol === 'NEAR') {
        const res = await contracts.signAndSendNearTransfer({ wallet, receiverId: quote.depositAddress, amountNear: amountNum, gasBuffer: gasBuf });
        depositTxHash = res.txHash;
      } else if (asset.blockchain === 'near' && asset.contractAddress && typeof contracts.executeNearNep141Transfer === 'function') {
        const res = await contracts.executeNearNep141Transfer({
          wallet,
          tokenContract: asset.contractAddress,
          receiverId: quote.depositAddress,
          amount: amountNum,
          decimals: asset.decimals || 8,
          tokenSymbol: asset.symbol,
          tokenBalance: avail
        });
        depositTxHash = res.txHash;
      } else if (asset.blockchain === 'sol') {
        if (!asset.contractAddress || asset.contractAddress === 'So11111111111111111111111111111111111111112') {
          const res = await contracts.executeSolanaNativeTransfer({ wallet, toAddress: quote.depositAddress, amountSol: amountNum, gasBuffer: gasBuf });
          depositTxHash = res.txHash;
        } else {
          const res = await contracts.executeSolanaSplTransfer({
            wallet,
            mintAddress: asset.contractAddress,
            toAddress: quote.depositAddress,
            amount: amountNum,
            decimals: asset.decimals || 6,
            tokenBalance: avail
          });
          depositTxHash = res.txHash;
        }
      } else if (asset.blockchain === 'prl') {
        const res = await contracts.executePearlTransfer({
          wallet,
          toAddress: quote.depositAddress,
          amountPrl: amountNum,
          feeDeductMode: 'extra',
          feePerKbPrl: gasMeta.feePerKbPrl ?? null,
          gasBuffer: gasBuf
        });
        depositTxHash = res.txHash;
        depositFeeNum = Number(res.feePrl) || 0;
        applyOptimisticChainSpend(wallet, 'prl', amountNum, depositFeeNum, depositTxHash);
      } else if (asset.blockchain === 'btc') {
        const res = await contracts.executeBitcoinTransfer({
          wallet,
          toAddress: quote.depositAddress,
          amountBtc: amountNum,
          feeDeductMode: 'extra',
          feeRateSatVb: gasMeta.feeRateSatVb ?? null,
          gasBuffer: gasBuf
        });
        depositTxHash = res.txHash;
        depositFeeNum = Number(res.feeBtc) || 0;
        applyOptimisticChainSpend(wallet, 'btc', amountNum, depositFeeNum, depositTxHash);
      } else if (isEvmOrigin) {
        const res = await contracts.executeEvmTransfer({
          wallet,
          chainKey: asset.blockchain,
          toAddress: quote.depositAddress,
          amount: amountNum,
          tokenContract: asset.contractAddress,
          decimals: asset.decimals,
          tokenBalance: avail,
          gasBuffer: isNativeGas ? gasBuf : null,
          gasPriceWei: isNativeGas ? (gasMeta.gasPriceWei ?? null) : null,
          gasLimit: isNativeGas ? (gasMeta.gasLimit ?? null) : null
        });
        depositTxHash = res.txHash;
      }

      if (!depositTxHash) {
        throw new Error(t(`暂不支持从 ${String(asset.blockchain || '').toUpperCase()} 发起跨链发送`, `Cross-chain send from ${String(asset.blockchain || '').toUpperCase()} is unavailable`));
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

      recordWalletActivity(wallet, {
        type: 'send',
        symbol: asset.symbol,
        chain: asset.blockchain,
        amount: amountNum,
        fee: depositFeeNum,
        netAmount: depositFeeNum !== null ? -(amountNum + depositFeeNum) : null,
        counterparty: recipient,
        txHash: depositTxHash,
        title: `${t('跨链转账至', 'Cross-chain to')} ${shortenAddr(recipient)}`
      });
      showToast(`✅ ${t('跨链转账已广播', 'Cross-chain transfer sent')}: ${shortenAddr(depositTxHash)}`);
      closeAllSheets();
      refreshAllBalancesAsync(false);
    } catch (err) {
      showToast(err && err.message ? err.message : t('转账失败', 'Transfer failed'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

