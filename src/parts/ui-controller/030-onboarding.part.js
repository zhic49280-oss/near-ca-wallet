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
    st.pendingMnemonic = '';
    const grid = $('onboard-seed-grid');
    if (grid) unmountPreactContainer(grid);
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
    let rawGenerated;
    try {
      rawGenerated = crypto.generateMnemonic(12);
    } catch (e) {
      showToast(toUserFriendlyError(e, '生成助记词失败，请重试', 'Failed to generate recovery phrase'));
      return;
    }
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

  async function buildWalletFromMnemonic(mnemonic, name = '') {
    const crypto = getCrypto();
    const contracts = getContracts();
    const st = getState();
    const derived = await crypto.deriveAllChainKeysAsync(mnemonic);
    const idx = st.wallets.length + 1;
    const wallet = st.normalizeWalletRecord({
      id: `near_ca_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '').trim() || `Account ${idx}`,
      mnemonic: String(mnemonic).trim(),
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
    _onboardingBusy = true;
    const btn = $('btn-confirm-create-wallet');
    const prevBtnText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('正在创建钱包...', 'Creating wallet...');
    }
    try {
      const wallet = await buildWalletFromMnemonic(phrase, name);
      st.wallets.push(wallet);
      st.activeWalletId = wallet.id;
      st.pendingMnemonic = '';
      const grid = $('onboard-seed-grid');
      if (grid) unmountPreactContainer(grid);
      if ($('onboard-create-name')) $('onboard-create-name').value = '';
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
      const contracts = getContracts();
      if (!wallet.nearNamedAccount && wallet.nearPublicKey && contracts && typeof contracts.discoverNearAccountsByPublicKeyAsync === 'function') {
        const discovered = await Promise.race([
          contracts.discoverNearAccountsByPublicKeyAsync(wallet.nearPublicKey).catch(() => []),
          new Promise((resolve) => setTimeout(() => resolve(null), 1500))
        ]);
        if (Array.isArray(discovered) && discovered.length > 0) {
          wallet.nearNamedAccount = discovered[0];
          wallet.discoveredNearAccounts = discovered;
          if (!String(name || '').trim()) wallet.name = discovered[0];
          await contracts.ensureWalletSigningKeysAsync(wallet).catch(() => {});
        }
      }
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
    }
  }

  function resetPerWalletTransientState(nextWallet) {
    const st = getState();
    st.expandedSymbol = null;
    if (typeof stopPerpLiveFeed === 'function') stopPerpLiveFeed();
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
    const crypto = getCrypto();
    if (crypto && typeof crypto.clearPbkdf2Cache === 'function') crypto.clearPbkdf2Cache();
    else if (typeof globalThis !== 'undefined' && typeof globalThis.__clearPbkdf2Cache === 'function') globalThis.__clearPbkdf2Cache();
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

  let _deletingWalletBusy = false;

  async function deleteWalletById(walletId) {
    if (_deletingWalletBusy) return;
    const st = getState();
    if (st.wallets.length <= 1) {
      showToast(t('至少保留一个钱包', 'Keep at least one wallet'));
      return;
    }
    const target = st.wallets.find((w) => w.id === walletId);
    if (!target) return;
    _deletingWalletBusy = true;
    try {
      const delMsg = t(
        `确认永久移除钱包「${target?.name || walletId}」？请确保已备份助记词。`,
        `Permanently remove wallet "${target?.name || walletId}"? Ensure you backed up its recovery phrase.`
      );
      const confirmed = await showConfirmDialogAsync(delMsg, {
        danger: true,
        title: t('移除钱包', 'Remove Wallet'),
        confirmText: t('确认移除', 'Remove')
      });
      if (!confirmed) return;
      if (target && !(await verifySecurityAuthAsync(target, t('删除钱包账户', 'Delete wallet account')))) return;
      if (st.wallets.length <= 1 || !st.wallets.some((w) => w.id === walletId)) return;
      const crypto = getCrypto();
      if (crypto && typeof crypto.clearPbkdf2Cache === 'function') crypto.clearPbkdf2Cache();
      else if (typeof globalThis !== 'undefined' && typeof globalThis.__clearPbkdf2Cache === 'function') globalThis.__clearPbkdf2Cache();
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
    } finally {
      _deletingWalletBusy = false;
    }
  }

  let _backupRevealActive = false;
  let _backupAutoHideTimer = null;
  let _lastBackupRows = null;

  function clearBackupAutoHideTimer() {
    if (_backupAutoHideTimer) {
      clearTimeout(_backupAutoHideTimer);
      _backupAutoHideTimer = null;
    }
  }

  function setBackupRevealState(revealed) {
    _backupRevealActive = Boolean(revealed);
    clearBackupAutoHideTimer();
    if (_backupRevealActive && typeof setTimeout === 'function') {
      _backupAutoHideTimer = setTimeout(() => {
        setBackupRevealState(false);
      }, 30000);
    }
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const container = $('backup-keys-content');
    if (container && _lastBackupRows && fw && typeof fw.mountBackupSecretsPanel === 'function') {
      fw.mountBackupSecretsPanel(container, {
        rows: _lastBackupRows,
        revealed: _backupRevealActive,
        isEn: getState().lang === 'en',
        onToggleReveal: toggleBackupKeysReveal
      });
    }
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

  let _backupSheetOpening = false;

  async function openBackupKeysSheet() {
    if (_backupSheetOpening) return;
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    _backupSheetOpening = true;
    try {
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

      clearBackupAutoHideTimer();
      _backupRevealActive = false;
      _lastBackupRows = rows;
      openSheet('sheet-backup');
      const container = $('backup-keys-content');
      if (container) {
        const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
        if (fw && typeof fw.mountBackupSecretsPanel === 'function') {
          fw.mountBackupSecretsPanel(container, {
            rows,
            revealed: false,
            isEn: st.lang === 'en',
            onToggleReveal: toggleBackupKeysReveal
          });
        }
      }
    } finally {
      _backupSheetOpening = false;
    }
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

