  // ==================== Unified Receive Sheet ====================

  const QTC_DEPOSIT_TTL_MS = 20 * 60 * 1000;

  function isQtcDepositExpired(wallet) {
    if (!wallet || !wallet.qtcDepositAddress) return true;
    const ts = Number(wallet.qtcDepositAddressAt || 0);
    return !ts || (Date.now() - ts) > QTC_DEPOSIT_TTL_MS;
  }

  function openReceiveSheet(networkKey = 'near') {
    const st = getState();
    const rawKey = String(networkKey || 'near').toLowerCase();
    st.receive.selectedNetwork = ['arc', 'eth', 'base', 'arb', 'op', 'pol', 'bsc', 'hype', 'hood', 'avax'].includes(rawKey)
      ? 'evm'
      : rawKey;
    const wallet = st.getActiveWallet();
    if (st.receive.selectedNetwork === 'qtc' && wallet && isQtcDepositExpired(wallet)) {
      ensureQtcReceiveDepositAddressAsync(wallet);
    }
    renderReceiveSheet();
    openSheet('sheet-receive');
  }

  let _qtcDepositPromiseKey = '';

  async function ensureQtcReceiveDepositAddressAsync(wallet) {
    const st = getState();
    const intents = getIntents();
    const nearId = wallet ? (wallet.nearNamedAccount || wallet.nearAddress) : '';
    if (!wallet || !nearId || typeof intents.requestCrossChainDepositAddress !== 'function') return;
    const reqKey = `${wallet.id}:${nearId}`;
    if (_qtcDepositPromiseKey === reqKey) return;
    _qtcDepositPromiseKey = reqKey;

    const valEl = $('receive-addr-value');
    if (valEl && st.receive.selectedNetwork === 'qtc' && !wallet.qtcDepositAddress) {
      valEl.textContent = t('正在获取 QTC 收款地址...', 'Fetching QTC deposit address...');
    }

    try {
      const res = await intents.requestCrossChainDepositAddress({
        originAsset: intents.QTC_ORIGIN_ASSET_ID || 'nep141:qtc.omft.near',
        destinationAsset: intents.QTC_NEAR_ASSET_ID || '1cs_v1:near:nep141:qtc.omft.near',
        amountRaw: '1000000000000',
        nearAccountId: nearId
      });
      if (res && res.ok && res.depositAddress) {
        wallet.qtcDepositAddress = res.depositAddress;
        wallet.qtcDepositAddressAt = Date.now();
        st.saveWallets();
      } else if (st.receive.selectedNetwork === 'qtc') {
        showToast(toUserFriendlyError(res && res.error, '获取 QTC 收款地址失败，请重试', 'Failed to obtain QTC deposit address'));
      }
    } catch (err) {
      if (st.receive.selectedNetwork === 'qtc') {
        showToast(toUserFriendlyError(err, '获取 QTC 收款地址失败，请重试', 'Failed to obtain QTC deposit address'));
      }
    } finally {
      if (_qtcDepositPromiseKey === reqKey) _qtcDepositPromiseKey = '';
      const active = st.getActiveWallet();
      if (active && active.id === wallet.id && st.receive.selectedNetwork === 'qtc') {
        renderReceiveSheet();
      }
    }
  }

  function renderReceiveSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (typeof st.recomputeWalletMpcAddresses === 'function') {
      st.recomputeWalletMpcAddresses(wallet);
    }

    const evmAddr = wallet.evmPrivateKey
      ? (wallet.evmAddress || wallet.mpcEvmAddress)
      : (wallet.mpcEvmAddress || wallet.evmAddress);
    const options = [
      { key: 'near', label: 'NEAR (.near)', addr: wallet.nearNamedAccount || wallet.nearAddress },
      { key: 'evm', label: 'EVM (ETH / Base / ARB / OP / POL / BSC / Arc)', addr: evmAddr },
      { key: 'sol', label: 'Solana (SOL)', addr: wallet.solAddress },
      { key: 'btc', label: t('Bitcoin (BTC 主网)', 'Bitcoin (BTC Mainnet)'), addr: wallet.btcAddress },
      { key: 'prl', label: t('Pearl (PRL 主网)', 'Pearl (PRL Mainnet)'), addr: wallet.address },
      { key: 'qtc', label: t('QTC (Quantus 跨链收款)', 'QTC (Quantus Deposit)'), addr: isQtcDepositExpired(wallet) ? '' : (wallet.qtcDepositAddress || '') }
    ];

    const pillsEl = $('receive-network-pills');
    if (pillsEl) {
      pillsEl.innerHTML = options.map((o) => `
        <button type="button" class="filter-pill ${st.receive.selectedNetwork === o.key ? 'active' : ''}" data-action="select-receive-network" data-net="${escapeHtml(o.key)}">${escapeHtml(o.label)}</button>
      `).join('');
    }

    const active = options.find((o) => o.key === st.receive.selectedNetwork) || options[0];
    const lblEl = $('receive-addr-label');
    const valEl = $('receive-addr-value');
    if (lblEl) lblEl.textContent = active.label;

    if (active.key === 'qtc' && !active.addr) {
      const nearId = wallet.nearNamedAccount || wallet.nearAddress;
      const isFetching = Boolean(nearId && _qtcDepositPromiseKey === `${wallet.id}:${nearId}`);
      if (valEl) {
        if (valEl.dataset) {
          valEl.dataset.loading = isFetching ? '1' : '';
          valEl.dataset.error = isFetching ? '' : '1';
        }
        if (isFetching) {
          valEl.textContent = t('正在获取 QTC 收款地址...', 'Fetching QTC deposit address...');
        } else {
          valEl.innerHTML = `<span>${escapeHtml(t('获取 QTC 收款地址失败', 'Failed to fetch QTC deposit address'))}</span> <button type="button" class="mini-action-btn primary" style="margin-left:6px;" data-action="select-receive-network" data-net="qtc">${escapeHtml(t('重试', 'Retry'))}</button>`;
        }
      }
      renderQrInto('receive-qr-container', '', 172);
      return;
    }

    if (valEl) {
      if (valEl.dataset) {
        valEl.dataset.loading = '';
        valEl.dataset.error = '';
      }
      valEl.textContent = active.addr || '--';
    }
    renderQrInto('receive-qr-container', active.addr || '', 172);
  }

  function selectReceiveNetwork(key) {
    const st = getState();
    st.receive.selectedNetwork = key;
    const wallet = st.getActiveWallet();
    if (key === 'qtc' && wallet && isQtcDepositExpired(wallet)) {
      ensureQtcReceiveDepositAddressAsync(wallet);
    }
    renderReceiveSheet();
  }

  function copyReceiveAddress() {
    const valEl = $('receive-addr-value');
    const addr = (valEl?.textContent || '').trim();
    if (!addr || addr === '--' || valEl?.dataset?.loading === '1' || valEl?.dataset?.error === '1') return;
    copyText(addr, $('receive-addr-label')?.textContent || '');
  }

