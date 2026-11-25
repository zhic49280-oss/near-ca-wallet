  // ==================== Onboarding & Multi-Wallet ====================

  let _isAddingAdditionalWallet = false;

  function renderOnboardingVisibility() {
    const st = getState();
    const wallet = st.getActiveWallet();
    const hasWallet = Boolean(wallet);
    const onboard = $('view-onboarding');
    const nav = $('bottom-nav');

    if (hasWallet && _isAddingAdditionalWallet) {
      if (onboard) onboard.classList.remove('hidden');
      if (nav) nav.classList.add('hidden');
      return;
    }

    if (onboard) onboard.classList.toggle('hidden', hasWallet);
    if (nav) nav.classList.toggle('hidden', !hasWallet);

    if (!hasWallet) {
      ['wallet', 'swap', 'perp', 'earn', 'hub'].forEach((v) => {
        const el = $(`view-${v}`);
        if (el) el.classList.add('hidden');
      });
      cancelOnboardSubPanel();
    } else {
      const active = ['wallet', 'swap', 'perp', 'earn', 'hub'].includes(st.activeTab) ? st.activeTab : 'wallet';
      st.activeTab = active;
      ['wallet', 'swap', 'perp', 'earn', 'hub'].forEach((v) => {
        const el = $(`view-${v}`);
        if (el) el.classList.toggle('hidden', v !== active);
      });
      if (typeof document !== 'undefined') {
        const navTarget = active === 'earn' ? 'wallet' : active;
        document.querySelectorAll('.nav-item').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-tab') === navTarget);
        });
      }
    }
  }

  function cancelOnboardSubPanel() {
    const st = getState();
    if (st.wallets.length > 0 && $('view-onboarding') && !$('view-onboarding').classList.contains('hidden')) {
      const choice = $('onboard-choice-panel');
      const createP = $('onboard-create-panel');
      const importP = $('onboard-import-panel');
      if (choice && choice.classList.contains('hidden')) {
        choice.classList.remove('hidden');
        if (createP) createP.classList.add('hidden');
        if (importP) importP.classList.add('hidden');
        return;
      }
      _isAddingAdditionalWallet = false;
      $('view-onboarding').classList.add('hidden');
      $('bottom-nav')?.classList.remove('hidden');
      switchTab(st.activeTab || 'wallet');
      return;
    }
    _isAddingAdditionalWallet = false;
    $('onboard-choice-panel')?.classList.remove('hidden');
    $('onboard-create-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.add('hidden');
  }

  function openCreateWalletFlow() {
    const crypto = getCrypto();
    const st = getState();
    if (!crypto || typeof crypto.generateMnemonic !== 'function') {
      showToast(t('加密引擎未就绪', 'Crypto engine unavailable'));
      return;
    }
    const rawGenerated = crypto.generateMnemonic(12);
    const words = Array.isArray(rawGenerated)
      ? rawGenerated
      : String(rawGenerated || '').trim().split(/\s+/).filter(Boolean);
    const phrase = words.join(' ');
    st.pendingMnemonic = phrase;
    const grid = $('onboard-seed-grid');
    if (grid) {
      grid.innerHTML = words
        .map((w, i) => `<div class="seed-word"><span class="seed-idx">${i + 1}.</span><span>${escapeHtml(w)}</span></div>`)
        .join('');
    }
    const hintEl = $('onboard-create-hint');
    if (hintEl) hintEl.textContent = t('请妥善离线保存以下 12 个单词，它是恢复所有链上资产的唯一凭证', 'Store these 12 words safely offline. They control all derived chain accounts.');
    $('onboard-choice-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.add('hidden');
    $('onboard-create-panel')?.classList.remove('hidden');
    const createBtn = $('btn-confirm-create-wallet');
    if (createBtn) createBtn.disabled = false;
  }

  function copyPendingMnemonic() {
    const st = getState();
    if (st.pendingMnemonic) copyText(st.pendingMnemonic, t('助记词', 'Seed Phrase'));
  }

  async function buildWalletFromMnemonic(mnemonic, name = '', pin = '') {
    const crypto = getCrypto();
    const contracts = getContracts();
    const st = getState();
    const derived = await crypto.deriveAllChainKeysAsync(mnemonic);
    const idx = st.wallets.length + 1;
    const wallet = st.normalizeWalletRecord({
      id: `near_ca_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '').trim() || `Account ${idx}`,
      mnemonic: String(mnemonic).trim(),
      pin: '',
      nearNamedAccount: '',
      nearAddress: derived.nearAddress,
      nearPublicKey: derived.nearPublicKey,
      nearPrivateKey: derived.nearPrivateKey,
      nearPrivateSeedHex: derived.nearPrivateSeedHex,
      mpcEvmAddress: derived.mpcEvmAddress || derived.evmAddress,
      evmAddress: derived.evmAddress,
      solAddress: derived.solAddress,
      solPublicKey: derived.solAddress,
      address: derived.pearlAddress,
      privateKeyHex: derived.pearlPrivateKeyHex,
      tweakedPrivateKeyHex: derived.pearlTweakedPrivateKeyHex,
      btcAddress: derived.btcAddress,
      btcPrivateKeyHex: derived.btcPrivateKeyHex,
      btcTweakedPrivateKeyHex: derived.btcTweakedPrivateKeyHex
    });
    if (pin && typeof st.setWalletPinAsync === 'function') {
      await st.setWalletPinAsync(wallet, pin);
      wallet.pinLen = String(pin).trim().length;
    } else if (pin) {
      wallet.pin = String(pin).trim();
      wallet.pinLen = wallet.pin.length;
    }
    if (pin && typeof st.encryptWalletSecretsToVaultAsync === 'function') {
      await st.encryptWalletSecretsToVaultAsync(wallet, String(pin).trim());
    }
    // Non-blocking background discovery of linked .near domain
    if (contracts && typeof contracts.discoverNearAccountsByPublicKeyAsync === 'function' && derived.nearPublicKey) {
      contracts.discoverNearAccountsByPublicKeyAsync(derived.nearPublicKey).then((discovered) => {
        if (Array.isArray(discovered) && discovered.length > 0 && !wallet.nearNamedAccount) {
          wallet.nearNamedAccount = discovered[0];
          wallet.discoveredNearAccounts = discovered;
          if (!String(name || '').trim()) wallet.name = discovered[0];
          contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
          st.saveWalletsDebounced();
          if (st.activeWalletId === wallet.id) renderHeaderAndHero();
        }
      }).catch(() => {});
    }
    return wallet;
  }

  let _onboardingBusy = false;

  async function confirmCreateWallet() {
    if (_onboardingBusy) return;
    const st = getState();
    const phrase = st.pendingMnemonic;
    if (!phrase) return;
    const name = $('onboard-create-name')?.value || '';
    const pin = ($('onboard-create-pin')?.value || '').trim();
    if (pin && !/^\d{4,6}$/.test(pin)) {
      showToast(t('PIN 密码需为 4-6 位数字', 'PIN must be 4-6 digits'));
      return;
    }
    _onboardingBusy = true;
    const btn = $('btn-confirm-create-wallet');
    const prevBtnText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('正在创建钱包...', 'Creating wallet...');
    }
    try {
      const wallet = await buildWalletFromMnemonic(phrase, name, pin);
      st.wallets.push(wallet);
      st.activeWalletId = wallet.id;
      st.pendingMnemonic = '';
      if ($('onboard-create-name')) $('onboard-create-name').value = '';
      if ($('onboard-create-pin')) $('onboard-create-pin').value = '';
      resetPerWalletTransientState(wallet);
      _isAddingAdditionalWallet = false;
      st.activeTab = 'wallet';
      st.saveWallets();
      showToast(t('钱包已创建', 'Wallet created'));
      renderAll();
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(toUserFriendlyError(e, '创建钱包失败，请重试', 'Failed to create wallet'));
    } finally {
      _onboardingBusy = false;
      if (btn) {
        btn.disabled = false;
        if (prevBtnText) btn.textContent = prevBtnText;
      }
    }
  }

  function openImportWalletFlow() {
    $('onboard-choice-panel')?.classList.add('hidden');
    $('onboard-create-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.remove('hidden');
    const importBtn = $('btn-confirm-import-wallet');
    if (importBtn) importBtn.disabled = false;
    const ta = $('onboard-import-phrase');
    if (ta) {
      ta.value = '';
      ta.placeholder = t('输入 12 或 24 个英文助记词，使用空格分隔', 'Enter 12 or 24 recovery words separated by spaces');
    }
    const status = $('onboard-import-status');
    if (status) status.textContent = '';
  }

  function validateOnboardImportLive() {
    const crypto = getCrypto();
    const phrase = ($('onboard-import-phrase')?.value || '').trim();
    const statusEl = $('onboard-import-status');
    if (!statusEl) return null;
    if (!phrase) {
      statusEl.textContent = '';
      return null;
    }
    const res = crypto.validateMnemonic(phrase);
    if (res.valid) {
      statusEl.style.color = 'var(--near-emerald)';
      statusEl.textContent = t(`✓ 有效 ${res.words.length} 词助记词`, `✓ Valid ${res.words.length}-word phrase`);
    } else {
      statusEl.style.color = 'var(--rose-alert)';
      statusEl.textContent = res.error || t('助记词格式无效', 'Invalid mnemonic');
    }
    return res;
  }

  async function confirmImportWallet() {
    if (_onboardingBusy) return;
    const crypto = getCrypto();
    const st = getState();
    const raw = ($('onboard-import-phrase')?.value || '').trim();
    const name = $('onboard-import-name')?.value || '';

    const check = crypto.validateMnemonic(raw);
    if (!check.valid) {
      showToast(check.error || t('无效助记词', 'Invalid recovery phrase'));
      return;
    }
    const normalizedPhrase = check.words.join(' ');
    const preExisting = st.wallets.find((w) => w && w.mnemonic && String(w.mnemonic).trim() === normalizedPhrase);
    if (preExisting) {
      if (String(name || '').trim()) preExisting.name = String(name).trim();
      st.activeWalletId = preExisting.id;
      if ($('onboard-import-phrase')) $('onboard-import-phrase').value = '';
      if ($('onboard-import-name')) $('onboard-import-name').value = '';
      resetPerWalletTransientState(preExisting);
      st.saveWallets();
      _isAddingAdditionalWallet = false;
      st.activeTab = 'wallet';
      renderAll();
      refreshAllBalancesAsync(true);
      showToast(t('已切换至该助记词对应钱包', 'Switched to existing wallet'));
      return;
    }
    _onboardingBusy = true;
    const btn = $('btn-confirm-import-wallet');
    const prevBtnText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('正在导入...', 'Importing...');
    }
    try {
      const wallet = await buildWalletFromMnemonic(normalizedPhrase, name, '');
      const existing = st.wallets.find((w) => w.nearAddress && w.nearAddress === wallet.nearAddress);
      let activeTarget = wallet;
      if (existing) {
        if (String(name || '').trim()) existing.name = String(name).trim();
        st.activeWalletId = existing.id;
        activeTarget = existing;
        showToast(t('已切换至该助记词对应钱包', 'Switched to existing wallet'));
      } else {
        st.wallets.push(wallet);
        st.activeWalletId = wallet.id;
        showToast(t('全链钱包导入成功', 'Multi-chain wallet imported'));
      }
      if ($('onboard-import-phrase')) $('onboard-import-phrase').value = '';
      if ($('onboard-import-name')) $('onboard-import-name').value = '';
      resetPerWalletTransientState(activeTarget);
      st.saveWallets();
      _isAddingAdditionalWallet = false;
      st.activeTab = 'wallet';
      renderAll();
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(toUserFriendlyError(e, '导入钱包失败，请重试', 'Failed to import wallet'));
    } finally {
      _onboardingBusy = false;
      if (btn) {
        btn.disabled = false;
        if (prevBtnText) btn.textContent = prevBtnText;
      }
    }
  }

  function startAdditionalWalletCreate() {
    closeAllSheets();
    _isAddingAdditionalWallet = true;
    ['wallet', 'swap', 'perp', 'earn', 'hub'].forEach((v) => $(`view-${v}`)?.classList.add('hidden'));
    $('bottom-nav')?.classList.add('hidden');
    $('view-onboarding')?.classList.remove('hidden');
    openCreateWalletFlow();
  }

  function startAdditionalWalletImport() {
    closeAllSheets();
    _isAddingAdditionalWallet = true;
    ['wallet', 'swap', 'perp', 'earn', 'hub'].forEach((v) => $(`view-${v}`)?.classList.add('hidden'));
    $('bottom-nav')?.classList.add('hidden');
    $('view-onboarding')?.classList.remove('hidden');
    openImportWalletFlow();
  }

  function openWalletSwitcherSheet() {
    renderWalletSwitcherList();
    openSheet('sheet-wallets');
  }

  function renderWalletSwitcherList() {
    const st = getState();
    const listEl = $('wallets-switcher-list');
    if (!listEl) return;
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountWalletListPanel === 'function') {
      fw.mountWalletListPanel(listEl, {
        wallets: st.wallets,
        activeWalletId: st.activeWalletId,
        isEn: st.lang === 'en',
        shortenAddr
      });
      return;
    }
    if (st.wallets.length === 0) {
      listEl.innerHTML = `<div class="text-muted" style="text-align:center;padding:12px;">${t('暂无钱包', 'No wallets')}</div>`;
      return;
    }
    listEl.innerHTML = st.wallets.map((w) => {
      const isActive = w.id === st.activeWalletId;
      const nearId = w.nearNamedAccount || shortenAddr(w.nearAddress, 8, 6);
      return `
        <div class="ios-glass-card flex items-center justify-between gap-2" style="padding:12px;border-color:${isActive ? 'rgba(0,236,151,0.45)' : 'var(--border-glass)'};">
          <div class="min-w-0 flex-1" style="cursor:pointer;" data-action="switch-wallet" data-wallet-id="${escapeHtml(w.id)}">
            <div class="flex items-center gap-2">
              <span style="font-weight:700;color:#fff;">${escapeHtml(w.name)}</span>
              ${isActive ? `<span class="ca-badge">${t('当前', 'Active')}</span>` : ''}
            </div>
            <div class="mono text-emerald" style="font-size:11.5px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(nearId)}</div>
          </div>
          ${st.wallets.length > 1
            ? `<button type="button" class="btn-danger" data-action="delete-wallet" data-wallet-id="${escapeHtml(w.id)}">${t('删除', 'Delete')}</button>`
            : ''}
        </div>
      `;
    }).join('');
  }

  function resetPerWalletTransientState(nextWallet) {
    const st = getState();
    st.expandedSymbol = null;
    if (st.swap) {
      st.swap.quoteData = null;
      st.swap.recipientAddress = '';
      st.swap.amountIn = '';
      if ($('swap-amount-in')) $('swap-amount-in').value = '';
      if (typeof stopOrderStatusPolling === 'function') stopOrderStatusPolling();
      st.swap.activeOrder = null;
      if (nextWallet && typeof st.loadActiveSwapOrder === 'function') {
        const resumedOrder = st.loadActiveSwapOrder();
        if (resumedOrder && resumedOrder.depositAddress) {
          const upper = String(resumedOrder.status || '').toUpperCase();
          const pendingFollow = typeof hasPendingSwapFollowUp === 'function' && hasPendingSwapFollowUp(resumedOrder) && !resumedOrder.followUpFailed;
          if ((!['SUCCESS', 'COMPLETED', 'REFUNDED', 'FAILED'].includes(upper) || pendingFollow) && typeof startOrderStatusPolling === 'function') {
            startOrderStatusPolling();
          }
        }
      }
    }
    if (st.mining) {
      st.mining.minerAddress = (nextWallet && nextWallet.address) || '';
      st.mining.telemetry = null;
      st.mining.sweepQuote = null;
      st.mining._boundWalletId = nextWallet ? nextWallet.id : '';
    }
    if ($('mining-address-input')) {
      $('mining-address-input').value = (nextWallet && nextWallet.address) || '';
    }
    if ($('swap-recipient-input')) {
      $('swap-recipient-input').value = '';
    }
    if (st.limit) {
      st.limit.ordersActive = [];
      st.limit.ordersHistory = [];
      st.limit.evmAllowanceRaw = null;
      st.limit.dclStorageRegistered = null;
      if (typeof resetFormFields === 'function') {
        resetFormFields(['limit-amount-in', 'limit-target-rate'], st.limit, { amountIn: '', targetRate: '', errorMsg: '' });
      } else {
        st.limit.amountIn = '';
        st.limit.targetRate = '';
        st.limit.errorMsg = '';
        if ($('limit-amount-in')) $('limit-amount-in').value = '';
        if ($('limit-target-rate')) $('limit-target-rate').value = '';
      }
    }
    if (st.perp) {
      st.perp.account = null;
      st.perp.lastAccountSyncTs = 0;
      if (typeof resetPerpOrderForm === 'function') {
        resetPerpOrderForm({ clearPrice: true, clearMargin: true, clearTpSl: true });
      }
      if (nextWallet && typeof st.loadCachedPerpSnapshot === 'function') {
        st.loadCachedPerpSnapshot(nextWallet.mpcEvmAddress || nextWallet.evmAddress || '');
      }
    }
    if (st.txModal) st.txModal.currentItem = null;
    if (typeof _tokenDetailState !== 'undefined' && _tokenDetailState) {
      _tokenDetailState.historyItems = [];
      _tokenDetailState.mergedItems = [];
      _tokenDetailState.fetchSeq = (_tokenDetailState.fetchSeq || 0) + 1;
    }
  }

  function switchActiveWallet(walletId) {
    const st = getState();
    const found = st.wallets.find((w) => w.id === walletId);
    if (!found) return;
    st.activeWalletId = found.id;
    resetPerWalletTransientState(found);
    st.saveWallets();
    closeAllSheets();
    renderAll();
    refreshAllBalancesAsync(true);
    if (st.activeTab === 'perp') {
      refreshPerpDataAsync(false).catch(() => {});
    }
    showToast(`${t('已切换账户', 'Switched to')}: ${found.name}`);
  }

  async function deleteWalletById(walletId) {
    const st = getState();
    if (st.wallets.length <= 1) {
      showToast(t('至少保留一个钱包', 'Keep at least one wallet'));
      return;
    }
    const target = st.wallets.find((w) => w.id === walletId);
    const delMsg = t(
      `确认永久移除钱包「${target?.name || walletId}」？请确保已备份助记词。`,
      `Permanently remove wallet "${target?.name || walletId}"? Ensure you backed up its recovery phrase.`
    );
    if (typeof confirmWithUserIfSupported === 'function' && !confirmWithUserIfSupported(delMsg)) return;
    if (target && !(await verifySecurityAuthAsync(target, t('删除钱包账户', 'Delete wallet account')))) return;
    const deletedActive = st.activeWalletId === walletId;
    st.wallets = st.wallets.filter((w) => w.id !== walletId);
    if (deletedActive) {
      st.activeWalletId = st.wallets[0] ? st.wallets[0].id : null;
      resetPerWalletTransientState(st.wallets[0] || null);
    }
    st.saveWallets();
    renderWalletSwitcherList();
    renderAll();
    if (deletedActive) refreshAllBalancesAsync(true);
    showToast(t('已移除钱包', 'Wallet removed'));
  }

  let _backupRevealActive = false;
  let _backupAutoHideTimer = null;
  let _lastBackupRows = null;

  function setBackupRevealState(revealed) {
    _backupRevealActive = Boolean(revealed);
    if (_backupAutoHideTimer) {
      clearTimeout(_backupAutoHideTimer);
      _backupAutoHideTimer = null;
    }
    if (_backupRevealActive && typeof setTimeout === 'function') {
      _backupAutoHideTimer = setTimeout(() => {
        setBackupRevealState(false);
      }, 30000);
    }
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const container = $('backup-keys-content');
    if (fw && typeof fw.mountBackupSecretsPanel === 'function' && container && _lastBackupRows) {
      fw.mountBackupSecretsPanel(container, {
        rows: _lastBackupRows,
        revealed: _backupRevealActive,
        isEn: getState().lang === 'en',
        onToggleReveal: toggleBackupKeysReveal
      });
      return;
    }
    const btn = $('btn-backup-reveal-toggle');
    if (btn) {
      btn.textContent = _backupRevealActive ? t('隐藏助记词与私钥', 'Hide Phrase & Keys') : t('显示助记词与私钥', 'Reveal Phrase & Keys');
    }
    document.querySelectorAll('#backup-keys-content .backup-secret-val').forEach((el) => {
      const realVal = el.dataset.secret || '';
      if (_backupRevealActive) {
        el.textContent = realVal || '--';
        el.style.filter = 'none';
        el.style.userSelect = 'text';
      } else {
        el.textContent = realVal ? '•••• •••• •••• •••• •••• ••••' : '--';
        el.style.filter = 'blur(4px)';
        el.style.userSelect = 'none';
      }
    });
  }

  function toggleBackupKeysReveal() {
    setBackupRevealState(!_backupRevealActive);
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const hideSecretsOnLeave = () => {
      if (_backupRevealActive) setBackupRevealState(false);
    };
    window.addEventListener('blur', hideSecretsOnLeave);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) hideSecretsOnLeave();
      });
    }
  }

  async function openBackupKeysSheet() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (!(await verifySecurityAuthAsync(wallet, t('查看助记词与私钥', 'View recovery phrase & keys')))) return;
    await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
    st.saveWallets();

    const rows = [
      { label: t('助记词 (12/24词)', 'Recovery Phrase'), val: wallet.mnemonic, secret: true },
      ...(wallet.prlMnemonic && wallet.prlMnemonic !== wallet.mnemonic
        ? [{ label: t('Pearl (PRL) 专用助记词 (独立绑定)', 'Pearl (PRL) Custom Seed Phrase'), val: wallet.prlMnemonic, secret: true }]
        : []),
      ...(wallet.btcMnemonic && wallet.btcMnemonic !== wallet.mnemonic && wallet.btcMnemonic !== wallet.prlMnemonic
        ? [{ label: t('Bitcoin (BTC) 专用助记词', 'Bitcoin (BTC) Custom Seed Phrase'), val: wallet.btcMnemonic, secret: true }]
        : []),
      { label: t('NEAR 主账户', 'NEAR Master Account'), val: wallet.nearNamedAccount || wallet.nearAddress, secret: false },
      { label: t('NEAR 主私钥', 'NEAR Master Private Key'), val: wallet.nearPrivateKey, secret: true },
      { label: t('Bitcoin (BTC) 地址', 'Bitcoin (BTC) Address'), val: wallet.btcAddress, secret: false },
      { label: t('Bitcoin (BTC) 私钥', 'Bitcoin (BTC) Private Key'), val: wallet.btcPrivateKeyHex, secret: true },
      { label: t('Pearl (PRL) 地址', 'Pearl (PRL) Address'), val: wallet.address, secret: false },
      { label: t('Pearl (PRL) 私钥', 'Pearl (PRL) Private Key'), val: wallet.privateKeyHex, secret: true }
    ];

    const container = $('backup-keys-content');
    if (container) {
      _backupRevealActive = false;
      _lastBackupRows = rows;
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
      if (fw && typeof fw.mountBackupSecretsPanel === 'function') {
        fw.mountBackupSecretsPanel(container, {
          rows,
          revealed: false,
          isEn: st.lang === 'en',
          onToggleReveal: toggleBackupKeysReveal
        });
      } else {
        const warnBox = `
        <div class="ios-glass-card flex flex-col gap-1" style="padding:10px 12px;border-color:rgba(251,113,133,0.45);background:rgba(251,113,133,0.08);">
          <div style="font-size:12.5px;font-weight:700;color:var(--rose-alert);">⚠️ ${escapeHtml(t('最高安全等级提醒：切勿截图或泄露', 'High Security Warning: Never Screenshot or Share'))}</div>
          <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.5;">
            ${escapeHtml(t('• 请使用纸笔或金属板离线抄写，切勿截图、录屏或存入微信/网盘/备忘录。', '• Write down offline on paper/metal. Never screenshot, record, or save in cloud/chat apps.'))}<br/>
            ${escapeHtml(t('• 任何索要助记词或私钥的人都是骗子，一旦泄露资产将永久被盗且无法追回。', '• Anyone asking for your phrase or key is a scammer. Leaked assets cannot be recovered.'))}
          </div>
          <button type="button" id="btn-backup-reveal-toggle" class="btn-secondary" style="margin-top:6px;padding:7px 12px;font-size:12px;" data-action="toggle-backup-reveal">${escapeHtml(t('显示助记词与私钥', 'Reveal Phrase & Keys'))}</button>
        </div>
      `;
        const hint = `<div style="font-size:11.5px;color:var(--text-secondary);padding:4px 2px;">${escapeHtml(t('EVM、Solana 由当前主账户安全派生管理；Pearl (PRL) 与 Bitcoin (BTC) 由助记词本地独立派生。', 'EVM & Solana are securely managed by this master account; Pearl (PRL) & Bitcoin (BTC) are locally derived from your phrase.'))}</div>`;
        container.innerHTML = warnBox + hint + rows.map((r) => `
        <div class="meta-list">
          <div class="meta-row">
            <span class="meta-key">${escapeHtml(r.label)}</span>
            <button type="button" class="btn-ghost-sm" ${r.secret ? 'data-secret-copy="1"' : ''} data-action="copy-text" data-val="${escapeHtml(r.val || '')}" data-label="${escapeHtml(r.label)}">${t('复制', 'Copy')}</button>
          </div>
          <div class="mono ${r.secret ? 'backup-secret-val' : ''}" data-secret="${escapeHtml(r.val || '')}" style="font-size:11px;word-break:break-all;color:#fff;${r.secret ? 'filter:blur(4px);user-select:none;' : ''}">${escapeHtml(r.secret ? (r.val ? '•••• •••• •••• •••• •••• ••••' : '--') : (r.val || '--'))}</div>
        </div>
      `).join('');
      }
    }
    openSheet('sheet-backup');
  }

  function copyTextValue(val, label, evOrEl = null) {
    const btn = (evOrEl && typeof evOrEl.closest === 'function')
      ? evOrEl.closest('button')
      : ((evOrEl && evOrEl.target && typeof evOrEl.target.closest === 'function')
          ? evOrEl.target.closest('button')
          : ((typeof document !== 'undefined' && document.activeElement && typeof document.activeElement.closest === 'function')
              ? document.activeElement.closest('button')
              : null));
    const isUnrevealedBackupSecret = Boolean(
      !_backupRevealActive &&
      val &&
      $('sheet-backup')?.classList?.contains('open') &&
      typeof document !== 'undefined' &&
      typeof document.querySelectorAll === 'function' &&
      Array.from(document.querySelectorAll('#backup-keys-content .backup-secret-val')).some(
        (el) => (el.dataset?.secret || el.getAttribute?.('data-secret') || '') === String(val)
      )
    );
    if ((btn && btn.getAttribute('data-secret-copy') === '1' && !_backupRevealActive) || isUnrevealedBackupSecret) {
      showToast(t('请先点击「显示助记词与私钥」后再复制', 'Reveal phrase & keys first before copying'));
      return;
    }
    if (val) copyText(val, label);
  }

  function openPinSheet() {
    const inp = $('pin-input');
    if (inp) inp.value = '';
    openSheet('sheet-pin');
  }

  async function saveWalletPin() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const nextPin = ($('pin-input')?.value || '').trim();
    if (nextPin && !/^\d{4,6}$/.test(nextPin)) {
      showToast(t('请输入 4-6 位数字密码', 'Enter a 4-6 digit PIN'));
      return;
    }
    const hadPin = typeof st.hasWalletPin === 'function' ? st.hasWalletPin(wallet) : Boolean(wallet.pin);
    if (!hadPin && !nextPin) {
      showToast(t('请输入 4-6 位数字密码', 'Enter a 4-6 digit PIN'));
      return;
    }
    if (hadPin) {
      const needVaultDecrypt = Boolean(wallet.encryptedVault && wallet.encryptedVault.ctBase64 && !wallet._vaultUnlockedInSession);
      const authOk = needVaultDecrypt
        ? await openPinModalForWalletAsync(wallet, t('请输入旧 PIN 解锁并修改安全密码', 'Enter current PIN to unlock and update'), false)
        : await verifySecurityAuthAsync(wallet, t('修改钱包安全密码', 'Update wallet PIN'));
      if (!authOk) return;
    }
    if (wallet.encryptedVault && wallet.encryptedVault.ctBase64 && !wallet._vaultUnlockedInSession && !wallet.mnemonic && !wallet.nearPrivateKey) {
      showToast(t('请先输入旧 PIN 解锁钱包密钥后再修改密码', 'Unlock wallet secrets with current PIN before updating'));
      return;
    }
    if (typeof st.setWalletPinAsync === 'function') {
      await st.setWalletPinAsync(wallet, nextPin);
      wallet.pinLen = nextPin ? nextPin.length : 0;
    } else {
      wallet.pin = nextPin;
      wallet.pinLen = nextPin ? nextPin.length : 0;
    }
    if (nextPin && typeof st.encryptWalletSecretsToVaultAsync === 'function') {
      await st.encryptWalletSecretsToVaultAsync(wallet, nextPin);
    } else if (!nextPin && wallet.encryptedVault) {
      wallet.encryptedVault = null;
    }
    st.saveWallets();
    const sheetPin = $('sheet-pin');
    if (sheetPin && sheetPin.classList) sheetPin.classList.remove('auth-top');
    if (nextPin && typeof clearAppLock === 'function') clearAppLock();
    closeAllSheets();
    renderHubBiometricCardAsync();
    showToast(nextPin ? t('安全密码已更新', 'PIN updated') : t('已清除安全密码', 'PIN cleared'));
  }

