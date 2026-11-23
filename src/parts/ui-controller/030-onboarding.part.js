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
    } else if (pin) {
      wallet.pin = String(pin).trim();
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

  async function confirmCreateWallet() {
    const st = getState();
    const phrase = st.pendingMnemonic;
    if (!phrase) return;
    const name = $('onboard-create-name')?.value || '';
    const pin = ($('onboard-create-pin')?.value || '').trim();
    if (pin && !/^\d{4,6}$/.test(pin)) {
      showToast(t('PIN 密码需为 4-6 位数字', 'PIN must be 4-6 digits'));
      return;
    }
    try {
      const wallet = await buildWalletFromMnemonic(phrase, name, pin);
      st.wallets.push(wallet);
      st.activeWalletId = wallet.id;
      st.pendingMnemonic = '';
      _isAddingAdditionalWallet = false;
      st.activeTab = 'wallet';
      st.saveWallets();
      showToast(t('钱包已创建', 'Wallet created'));
      renderAll();
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(e && e.message ? e.message : t('创建失败', 'Create failed'));
    }
  }

  function openImportWalletFlow() {
    $('onboard-choice-panel')?.classList.add('hidden');
    $('onboard-create-panel')?.classList.add('hidden');
    $('onboard-import-panel')?.classList.remove('hidden');
    const ta = $('onboard-import-phrase');
    if (ta) {
      ta.value = '';
      ta.placeholder = t('输入 12 或 24 个英文助记词，使用空格分隔', 'Enter 12 or 24 BIP-39 words separated by spaces');
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
      statusEl.textContent = res.checksumValid
        ? t(`✓ 有效 ${res.words.length} 词助记词`, `✓ Valid ${res.words.length}-word phrase`)
        : t(`⚠ ${res.words.length} 词有效（校验和提醒）`, `⚠ ${res.words.length} words valid (checksum note)`);
    } else {
      statusEl.style.color = 'var(--rose-alert)';
      statusEl.textContent = res.error || t('助记词格式无效', 'Invalid mnemonic');
    }
    return res;
  }

  async function confirmImportWallet() {
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
    try {
      const wallet = await buildWalletFromMnemonic(normalizedPhrase, name, '');
      const existing = st.wallets.find((w) => w.nearAddress && w.nearAddress === wallet.nearAddress);
      if (existing) {
        st.activeWalletId = existing.id;
        showToast(t('已切换至该助记词对应钱包', 'Switched to existing wallet'));
      } else {
        st.wallets.push(wallet);
        st.activeWalletId = wallet.id;
        showToast(t('全链钱包导入成功', 'Multi-chain wallet imported'));
      }
      st.saveWallets();
      _isAddingAdditionalWallet = false;
      st.activeTab = 'wallet';
      renderAll();
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(e && e.message ? e.message : t('导入失败', 'Import failed'));
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

  function switchActiveWallet(walletId) {
    const st = getState();
    const found = st.wallets.find((w) => w.id === walletId);
    if (!found) return;
    st.activeWalletId = found.id;
    st.expandedSymbol = null;
    st.swap.quoteData = null;
    if (st.perp) {
      st.perp.account = null;
      st.perp.lastAccountSyncTs = 0;
      if (typeof st.loadCachedPerpSnapshot === 'function') {
        st.loadCachedPerpSnapshot(found.mpcEvmAddress || found.evmAddress || '');
      }
    }
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
    if (target && !(await verifySecurityAuthAsync(target, t('删除钱包账户', 'Delete wallet account')))) return;
    st.wallets = st.wallets.filter((w) => w.id !== walletId);
    if (st.activeWalletId === walletId) {
      st.activeWalletId = st.wallets[0] ? st.wallets[0].id : null;
    }
    st.saveWallets();
    renderWalletSwitcherList();
    renderAll();
    showToast(t('已移除钱包', 'Wallet removed'));
  }

  let _backupRevealActive = false;

  function setBackupRevealState(revealed) {
    _backupRevealActive = Boolean(revealed);
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
      { label: t('NEAR 主账户', 'NEAR Master Account'), val: wallet.nearNamedAccount || wallet.nearAddress, secret: false },
      { label: t('NEAR 主私钥', 'NEAR Master Private Key'), val: wallet.nearPrivateKey, secret: true },
      { label: t('Bitcoin (BTC) Taproot 地址', 'Bitcoin (BTC) Taproot Address'), val: wallet.btcAddress, secret: false },
      { label: t('Bitcoin (BTC) 私钥', 'Bitcoin (BTC) Private Key'), val: wallet.btcPrivateKeyHex, secret: true },
      { label: t('Pearl (PRL) 地址', 'Pearl (PRL) Address'), val: wallet.address, secret: false },
      { label: t('Pearl (PRL) 私钥', 'Pearl (PRL) Private Key'), val: wallet.privateKeyHex, secret: true }
    ];

    const container = $('backup-keys-content');
    if (container) {
      _backupRevealActive = false;
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
            <button type="button" class="btn-ghost-sm" data-action="copy-text" data-val="${escapeHtml(r.val || '')}" data-label="${escapeHtml(r.label)}">${t('复制', 'Copy')}</button>
          </div>
          <div class="mono ${r.secret ? 'backup-secret-val' : ''}" data-secret="${escapeHtml(r.val || '')}" style="font-size:11px;word-break:break-all;color:#fff;${r.secret ? 'filter:blur(4px);user-select:none;' : ''}">${escapeHtml(r.secret ? (r.val ? '•••• •••• •••• •••• •••• ••••' : '--') : (r.val || '--'))}</div>
        </div>
      `).join('');
    }
    openSheet('sheet-backup');
  }

  function copyTextValue(val, label) {
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
    if (hadPin && !(await verifySecurityAuthAsync(wallet, t('修改钱包安全密码', 'Update wallet PIN')))) return;
    if (typeof st.setWalletPinAsync === 'function') {
      await st.setWalletPinAsync(wallet, nextPin);
      wallet.pinLen = nextPin ? nextPin.length : 0;
    } else {
      wallet.pin = nextPin;
      wallet.pinLen = nextPin ? nextPin.length : 0;
    }
    st.saveWallets();
    closeAllSheets();
    renderHubBiometricCardAsync();
    showToast(nextPin ? t('安全密码已更新', 'PIN updated') : t('已清除安全密码', 'PIN cleared'));
  }

