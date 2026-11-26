  // ==================== Hub: .near Domain, MPC v1.signer, Contacts, WC ====================

  // ==================== NEAR Access Keys & Key Rotation Sheet ====================

  function generateRotateMnemonicInSheet() {
    const crypto = getCrypto();
    if (!crypto || typeof crypto.generateMnemonic !== 'function') return;
    const words = crypto.generateMnemonic(12);
    const phrase = Array.isArray(words) ? words.join(' ') : String(words || '').trim();
    if ($('near-keys-rotate-mnemonic')) {
      $('near-keys-rotate-mnemonic').value = phrase;
    }
  }

  function renderNearAccountSummary(wallet) {
    if (!wallet) return;
    const accountId = wallet.nearNamedAccount || wallet.nearAddress || '';
    if ($('near-keys-account-id')) {
      $('near-keys-account-id').textContent = wallet.nearNamedAccount || shortenAddr(accountId, 12, 8) || '--';
    }
    const nearBal = wallet.nativeBalances && typeof wallet.nativeBalances.near === 'number'
      ? wallet.nativeBalances.near
      : (typeof wallet.nearBalance === 'number' ? wallet.nearBalance : null);
    if ($('near-acct-balance-val')) {
      $('near-acct-balance-val').textContent = nearBal !== null ? `${formatBal(nearBal, 5)} NEAR` : '--';
    }
    const guideEl = $('near-acct-unactivated-guide');
    if (guideEl) {
      guideEl.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
    }
    const registerCard = $('hub-near-domain-card');
    if (registerCard) {
      registerCard.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
    }
  }

  async function openNearAccountSheet() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    renderNearAccountSummary(wallet);
    if ($('hub-near-domain-input')) $('hub-near-domain-input').value = '';
    if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
    if ($('hub-near-bind-auth-input')) $('hub-near-bind-auth-input').value = '';
    $('near-bind-drawer')?.classList.add('hidden');
    $('near-keys-rotate-card')?.classList.add('hidden');
    const availEl = $('near-domain-avail-status');
    if (availEl) {
      availEl.textContent = '';
      availEl.classList.add('hidden');
    }
    openSheet('sheet-near-account');
    await refreshNearAccessKeysSheet();
  }

  async function openNearAccessKeysSheet() {
    return openNearAccountSheet();
  }

  async function refreshNearAccessKeysSheet() {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts) return;
    const creds = contracts.getWalletNearSignerCredentials(wallet);
    const accountId = creds.accountId;
    renderNearAccountSummary(wallet);

    const rotateCard = $('near-keys-rotate-card');
    if (rotateCard) rotateCard.classList.add('hidden');
    const statusBadge = $('near-acct-status-badge');
    const guideEl = $('near-acct-unactivated-guide');
    const listEl = $('near-keys-list');
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (listEl) {
      if (fw && typeof fw.mountNearKeysPanel === 'function') {
        fw.mountNearKeysPanel(listEl, { keys: [], loading: true, isEn: st.lang === 'en', shortenAddr });
      } else {
        listEl.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px;">${t('正在查询链上密钥...', 'Loading on-chain keys...')}</div>`;
      }
    }

    const refreshBtn = $('btn-refresh-near-keys');
    const prevRefreshTxt = refreshBtn ? refreshBtn.textContent : '';
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = t('刷新中...', 'Refreshing...');
    }

    try {
      const res = await contracts.fetchNearAccessKeysAsync(accountId);
      if (!res.exists || res.keys.length === 0) {
        if (rotateCard) rotateCard.classList.add('hidden');
        if (guideEl) guideEl.classList.remove('hidden');
        if (statusBadge) {
          statusBadge.textContent = t('未激活', 'Unactivated');
          statusBadge.className = 'badge badge-cyan';
        }
        if (listEl) {
          if (fw && typeof fw.mountNearKeysPanel === 'function') {
            fw.mountNearKeysPanel(listEl, { keys: [], loading: false, unactivated: true, isEn: st.lang === 'en', shortenAddr });
          } else {
            listEl.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px;">${t('账户尚未在链上激活（首次收款或激活后可见密钥）', 'Account not yet active on-chain')}</div>`;
          }
        }
        return;
      }

      if (rotateCard) rotateCard.classList.remove('hidden');
      if (guideEl) guideEl.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
      const registerCard = $('hub-near-domain-card');
      if (registerCard) registerCard.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
      if (statusBadge) {
        statusBadge.textContent = wallet.nearNamedAccount ? t('已激活 .near', 'Active .near') : t('已激活标准账户', 'Active Account');
        statusBadge.className = 'badge badge-emerald';
      }
      if (!listEl) return;

      const fullCount = res.keys.filter((k) => k.access_key && k.access_key.permission === 'FullAccess').length;
      if (fw && typeof fw.mountNearKeysPanel === 'function') {
        const normalizedKeys = res.keys.map((k) => {
          const pk = String(k.public_key || '');
          const isFull = Boolean(k.access_key && k.access_key.permission === 'FullAccess');
          const isCurrent = pk === creds.publicKeyStr || (creds.publicKeyHandleStr && pk === creds.publicKeyHandleStr);
          const canDelete = !isCurrent && (!isFull || fullCount > 1);
          return { publicKey: pk, isFull, isCurrent, canDelete };
        });
        fw.mountNearKeysPanel(listEl, {
          keys: normalizedKeys,
          loading: false,
          unactivated: false,
          isEn: st.lang === 'en',
          shortenAddr
        });
      } else {
        listEl.innerHTML = res.keys.map((k) => {
          const pk = String(k.public_key || '');
          const isFull = Boolean(k.access_key && k.access_key.permission === 'FullAccess');
          const isCurrent = pk === creds.publicKeyStr || (creds.publicKeyHandleStr && pk === creds.publicKeyHandleStr);
          const canDelete = !isCurrent && (!isFull || fullCount > 1);
          return `
            <div class="ios-glass-card flex items-center justify-between gap-2" style="padding:10px 12px;">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                  <span class="badge ${isFull ? 'badge-emerald' : 'badge-cyan'}">${isFull ? t('完全权限密钥', 'Full Key') : t('应用授权密钥', 'App Key')}</span>
                  ${isCurrent ? `<span class="ca-badge">${t('当前使用', 'In Use')}</span>` : ''}
                </div>
                <div class="mono" style="font-size:11px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;margin-top:4px;">${escapeHtml(shortenAddr(pk, 14, 8))}</div>
              </div>
              ${canDelete
                ? `<button type="button" class="btn-danger" data-action="delete-near-key" data-pk="${escapeHtml(pk)}">${t('删除', 'Delete')}</button>`
                : ''}
            </div>
          `;
        }).join('');
      }
    } catch (e) {
      if (rotateCard) rotateCard.classList.add('hidden');
      if (listEl) {
        const errText = toUserFriendlyError(e, '查询失败', 'Query failed');
        if (fw && typeof fw.mountNearKeysPanel === 'function') {
          fw.mountNearKeysPanel(listEl, { keys: [], loading: false, errorMsg: errText, isEn: st.lang === 'en', shortenAddr });
        } else {
          listEl.innerHTML = `<div style="font-size:12px;color:var(--rose-alert);padding:8px;">${escapeHtml(errText)}</div>`;
        }
      }
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        if (prevRefreshTxt) refreshBtn.textContent = prevRefreshTxt;
      }
    }
  }

  let _nearKeyActionBusy = false;
  let _pendingConfirmSig = '';
  let _pendingConfirmTs = 0;

  async function deleteNearAccessKeyFromSheet(targetPublicKeyStr) {
    if (_nearKeyActionBusy) return;
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts) return;
    _nearKeyActionBusy = true;
    const delBtn = typeof event !== 'undefined' && event?.target?.closest ? event.target.closest('button') : null;
    const prevDelText = delBtn ? delBtn.textContent : '';
    if (delBtn) {
      delBtn.disabled = true;
      delBtn.textContent = t('删除中...', 'Deleting...');
    }
    try {
      if (!(await verifySecurityAuthAsync(wallet, t('删除 NEAR 访问密钥', 'Delete NEAR Access Key')))) return;
      showToast(t('正在提交删除密钥请求...', 'Removing key on-chain...'));
      const res = await contracts.deleteNearAccessKeyAsync({ wallet, targetPublicKeyStr });
      showToast(`✅ ${t('密钥已删除', 'Key deleted')}: ${shortenAddr(res.txHash, 8, 6)}`);
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(toUserFriendlyError(e, '删除密钥失败', 'Failed to delete key'));
    } finally {
      _nearKeyActionBusy = false;
      if (delBtn) {
        delBtn.disabled = false;
        delBtn.textContent = prevDelText;
      }
    }
  }

  async function addNearMnemonicKeyOnlyFromSheet() {
    if (_nearKeyActionBusy) return;
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts || !crypto) return;
    const rawPhrase = ($('near-keys-rotate-mnemonic')?.value || '').trim();
    const check = crypto.validateMnemonic(rawPhrase);
    if (!check.valid) {
      showToast(check.error || t('请先生成或输入有效助记词', 'Generate or enter a valid mnemonic'));
      return;
    }
    _nearKeyActionBusy = true;
    const addBtn = $('btn-near-keys-add-only');
    const prevAddText = addBtn ? addBtn.textContent : '';
    if (addBtn) {
      addBtn.disabled = true;
      addBtn.textContent = t('添加中...', 'Adding...');
    }
    try {
      if (!(await verifySecurityAuthAsync(wallet, t('为 NEAR 账户添加新密钥', 'Add New Key to NEAR Account')))) return;
      showToast(t('正在添加新密钥...', 'Adding new key on-chain...'));
      const res = await contracts.rotateNearAccountKeyAsync({
        wallet,
        newMnemonic: check.words.join(' '),
        upgradeToMlDsa65: false,
        deleteOldKey: false
      });
      showToast(`✅ ${t('已添加新密钥（旧密钥保留有效）', 'New key added (old key kept)')}: ${shortenAddr(res.addTxHash, 8, 6)}`);
      if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(toUserFriendlyError(e, '添加密钥失败', 'Failed to add key'));
    } finally {
      _nearKeyActionBusy = false;
      if (addBtn) {
        addBtn.disabled = false;
        if (prevAddText) addBtn.textContent = prevAddText;
      }
    }
  }

  async function checkWalletPrlBalanceBeforeOverwriteAsync(wallet) {
    if (!wallet) return null;
    const contracts = getContracts();
    const cached = wallet.nativeBalances && typeof wallet.nativeBalances.prl === 'number'
      ? wallet.nativeBalances.prl
      : (typeof wallet.balance === 'number' ? wallet.balance : null);
    if (cached !== null && Number.isFinite(cached)) return Math.max(0, cached);
    if (wallet.address && contracts && typeof contracts.fetchPearlNativeBalance === 'function') {
      const live = await contracts.fetchPearlNativeBalance(wallet.address).catch(() => null);
      if (live && Number.isFinite(Number(live.formatted))) return Math.max(0, Number(live.formatted));
      return null;
    }
    return null;
  }

  async function checkWalletBtcBalanceBeforeOverwriteAsync(wallet) {
    if (!wallet) return null;
    const contracts = getContracts();
    const cached = wallet.nativeBalances && typeof wallet.nativeBalances.btc === 'number'
      ? wallet.nativeBalances.btc
      : (typeof wallet.btcBalance === 'number' ? wallet.btcBalance : null);
    if (cached !== null && Number.isFinite(cached)) return Math.max(0, cached);
    if (wallet.btcAddress && contracts && typeof contracts.fetchBitcoinNativeBalance === 'function') {
      const live = await contracts.fetchBitcoinNativeBalance(wallet.btcAddress).catch(() => null);
      if (live && Number.isFinite(Number(live.formatted))) return Math.max(0, Number(live.formatted));
      return null;
    }
    return null;
  }

  async function bindOrReplacePrlMnemonicUI() {
    const st = getState();
    const crypto = getCrypto();
    const wallet = st.getActiveWallet();
    if (!wallet || !crypto) return;
    const rawPhrase = ($('prl-bind-mnemonic-input')?.value || '').trim();
    const check = crypto.validateMnemonic(rawPhrase);
    if (!check.valid) {
      showToast(check.error || t('请输入有效的 12 或 24 词助记词', 'Enter a valid 12 or 24-word mnemonic'));
      return;
    }
    const cleanPhrase = check.words.join(' ');
    try {
      const derivedPrl = await crypto.derivePearlFromSeedAsync(cleanPhrase, "m/86'/808276'/0'/0/0", true);
      if (!derivedPrl || !derivedPrl.address) {
        throw new Error(t('PRL 地址派生失败', 'Failed to derive PRL address'));
      }
      if (derivedPrl.address === wallet.address) {
        showToast(t('当前已是该 PRL 账户', 'Already using this PRL account'));
        return;
      }
      const oldPrlBal = await checkWalletPrlBalanceBeforeOverwriteAsync(wallet);
      if (oldPrlBal > 0) {
        const msg = t(
          `当前 PRL 账户 (${shortenAddr(wallet.address)}) 仍有 ${formatBal(oldPrlBal, 4)} PRL 余额，更换前请确认已备份原助记词。是否继续更换？`,
          `Current PRL account (${shortenAddr(wallet.address)}) holds ${formatBal(oldPrlBal, 4)} PRL. Ensure you have backed up its recovery phrase before switching. Continue?`
        );
        if (!(await showConfirmDialogAsync(msg, { danger: true, title: t('更换 PRL 账户', 'Switch PRL Account') }))) return;
      }
      if (!(await verifySecurityAuthAsync(wallet, t('绑定 / 更换 PRL 挖矿账户', 'Bind / Switch PRL Mining Account')))) return;

      const mainMnemonic = String(wallet.mnemonic || '').trim();
      wallet.prlMnemonic = cleanPhrase === mainMnemonic ? '' : cleanPhrase;
      wallet.address = derivedPrl.address;
      wallet.privateKeyHex = derivedPrl.privateKeyHex;
      wallet.tweakedPrivateKeyHex = derivedPrl.tweakedPrivateKeyHex;
      if (wallet.nativeBalances && typeof wallet.nativeBalances === 'object') {
        wallet.nativeBalances.prl = null;
      }
      wallet.balance = null;
      if (st.mining) {
        st.mining.minerAddress = derivedPrl.address;
        st.mining.telemetry = null;
        st.mining._boundWalletId = wallet.id;
      }
      if ($('mining-address-input')) $('mining-address-input').value = derivedPrl.address;
      if ($('prl-bind-mnemonic-input')) $('prl-bind-mnemonic-input').value = '';
      st.saveWallets();
      renderAll();
      showToast(`✅ ${t('已绑定 PRL 账户', 'PRL account bound')}: ${shortenAddr(derivedPrl.address, 8, 6)}`);
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(toUserFriendlyError(e, 'PRL 账户绑定失败', 'Failed to bind PRL account'));
    }
  }

  async function restoreDefaultPrlAccountUI() {
    const st = getState();
    const crypto = getCrypto();
    const wallet = st.getActiveWallet();
    if (!wallet || !crypto) return;
    const mainMnemonic = String(wallet.mnemonic || '').trim();
    if (!mainMnemonic) {
      showToast(t('当前钱包缺少主助记词，无法恢复默认派生', 'Master phrase unavailable to restore default PRL account'));
      return;
    }
    if (!wallet.prlMnemonic) {
      showToast(t('当前已是默认派生 PRL 账户', 'Already using default derived PRL account'));
      return;
    }
    try {
      const oldPrlBal = await checkWalletPrlBalanceBeforeOverwriteAsync(wallet);
      if (oldPrlBal > 0) {
        const msg = t(
          `当前独立绑定的 PRL 账户 (${shortenAddr(wallet.address)}) 仍有 ${formatBal(oldPrlBal, 4)} PRL 余额，恢复默认前请确认已备份该 PRL 助记词。是否继续？`,
          `Current custom PRL account (${shortenAddr(wallet.address)}) holds ${formatBal(oldPrlBal, 4)} PRL. Ensure you have backed up its phrase before restoring default. Continue?`
        );
        if (!(await showConfirmDialogAsync(msg, { danger: true, title: t('更换 PRL 账户', 'Switch PRL Account') }))) return;
      }
      if (!(await verifySecurityAuthAsync(wallet, t('恢复默认派生 PRL 账户', 'Restore Default PRL Account')))) return;
      const derivedPrl = await crypto.derivePearlFromSeedAsync(mainMnemonic, "m/86'/808276'/0'/0/0", true);
      wallet.prlMnemonic = '';
      wallet.address = derivedPrl.address;
      wallet.privateKeyHex = derivedPrl.privateKeyHex;
      wallet.tweakedPrivateKeyHex = derivedPrl.tweakedPrivateKeyHex;
      if (wallet.nativeBalances && typeof wallet.nativeBalances === 'object') {
        wallet.nativeBalances.prl = null;
      }
      wallet.balance = null;
      if (st.mining) {
        st.mining.minerAddress = derivedPrl.address;
        st.mining.telemetry = null;
        st.mining._boundWalletId = wallet.id;
      }
      if ($('mining-address-input')) $('mining-address-input').value = derivedPrl.address;
      st.saveWallets();
      renderAll();
      showToast(`✅ ${t('已恢复默认派生 PRL 账户', 'Restored default PRL account')}: ${shortenAddr(derivedPrl.address, 8, 6)}`);
      refreshAllBalancesAsync(true);
    } catch (e) {
      showToast(toUserFriendlyError(e, '恢复默认 PRL 账户失败', 'Failed to restore default PRL account'));
    }
  }

  async function confirmRotateNearAccountKey() {
    if (_nearKeyActionBusy) return;
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts || !crypto) return;
    const rawPhrase = ($('near-keys-rotate-mnemonic')?.value || '').trim();
    const check = crypto.validateMnemonic(rawPhrase);
    if (!check.valid) {
      showToast(check.error || t('请先生成或输入有效助记词', 'Generate or enter a valid mnemonic'));
      return;
    }

    _nearKeyActionBusy = true;
    const rotBtn = $('btn-near-keys-rotate-confirm');
    const prevRotText = rotBtn ? rotBtn.textContent : '';
    if (rotBtn) {
      rotBtn.disabled = true;
      rotBtn.textContent = t('检查中...', 'Checking...');
    }
    try {
      const oldMnemonic = String(wallet.mnemonic || '').trim();
      const hasCustomPrl = Boolean(wallet.prlMnemonic && wallet.prlMnemonic !== oldMnemonic);
      const hasCustomBtc = Boolean(wallet.btcMnemonic && wallet.btcMnemonic !== oldMnemonic);
      const [prlBal, btcBal] = await Promise.all([
        hasCustomPrl ? Promise.resolve(0) : checkWalletPrlBalanceBeforeOverwriteAsync(wallet),
        hasCustomBtc ? Promise.resolve(0) : checkWalletBtcBalanceBeforeOverwriteAsync(wallet)
      ]);
      const hasLegacyEvmOrSol = Boolean(oldMnemonic && (
        (wallet.nativeBalances && (Number(wallet.nativeBalances.eth) > 0 || Number(wallet.nativeBalances.sol) > 0 || Number(wallet.nativeBalances.base) > 0 || Number(wallet.nativeBalances.arb) > 0 || Number(wallet.nativeBalances.bsc) > 0)) ||
        (wallet.erc20Balances && Object.keys(wallet.erc20Balances).length > 0) ||
        (wallet.splBalances && Object.keys(wallet.splBalances).length > 0)
      ));
      if ((prlBal === null || prlBal > 0 || btcBal === null || btcBal > 0 || hasLegacyEvmOrSol) && oldMnemonic) {
        const assetNotes = [];
        if (prlBal === null) assetNotes.push(t('PRL (未知/弱网)', 'PRL (unknown/offline)'));
        else if (prlBal > 0) assetNotes.push(`PRL (${formatBal(prlBal, 4)})`);
        if (btcBal === null) assetNotes.push(t('BTC (未知/弱网)', 'BTC (unknown/offline)'));
        else if (btcBal > 0) assetNotes.push(`BTC (${formatBal(btcBal, 6)})`);
        if (hasLegacyEvmOrSol) assetNotes.push('EVM / Solana');
        const warnMsg = t(
          `检测到原助记词下的 ${assetNotes.join('、')} 账户仍有资产或记录。更换 NEAR 助记词后，系统将自动保留原助记词/私钥用于继续管理这些资产，请务必备份原助记词。是否继续更换？`,
          `Detected assets/history in ${assetNotes.join(', ')} under your current phrase. Your old phrase/keys will be preserved for those assets; please ensure it is backed up. Continue?`
        );
        if (!(await showConfirmDialogAsync(warnMsg, { danger: true, title: t('更换 NEAR 助记词', 'Rotate NEAR Phrase') }))) return;
      }

      if (!(await verifySecurityAuthAsync(wallet, t('更换 NEAR 控制助记词', 'Rotate NEAR Control Mnemonic')))) return;
      if (rotBtn) rotBtn.textContent = t('更换中...', 'Rotating...');

      // Pre-check local storage writability and pre-derive new keys before irreversible on-chain key deletion
      const newPhrase = check.words.join(' ');
      if (typeof st.saveWallets === 'function' && !st.saveWallets()) {
        throw new Error(t('本地存储空间不足，无法安全保存新助记词，已取消更换', 'Local storage write failed; aborted key rotation for safety'));
      }

      showToast(t('正在更换链上密钥...', 'Rotating key on-chain...'));
      const res = await contracts.rotateNearAccountKeyAsync({
        wallet,
        newMnemonic: newPhrase,
        upgradeToMlDsa65: false,
        deleteOldKey: true
      });
      if (oldMnemonic && oldMnemonic !== newPhrase) {
        if (!wallet.legacyEvmMnemonic && wallet.evmPrivateKey) wallet.legacyEvmMnemonic = oldMnemonic;
        if (!wallet.legacySolMnemonic && wallet.solPrivateSeedHex) wallet.legacySolMnemonic = oldMnemonic;
      }
      wallet.mnemonic = res.newDerived.mnemonic || newPhrase;
      wallet.accountType = 'standard';
      wallet.nearPublicKey = res.newDerived.nearPublicKey;
      wallet.nearPrivateKey = res.newDerived.nearPrivateKey;
      wallet.nearPrivateSeedHex = res.newDerived.nearPrivateSeedHex;

      if (!hasCustomPrl) {
        if ((prlBal === null || prlBal > 0) && oldMnemonic && oldMnemonic !== wallet.mnemonic) {
          wallet.prlMnemonic = oldMnemonic;
        } else {
          const newPrl = await crypto.derivePearlFromSeedAsync(wallet.mnemonic, "m/86'/808276'/0'/0/0", true);
          wallet.address = newPrl.address;
          wallet.privateKeyHex = newPrl.privateKeyHex;
          wallet.tweakedPrivateKeyHex = newPrl.tweakedPrivateKeyHex;
          if (wallet.nativeBalances && typeof wallet.nativeBalances === 'object') wallet.nativeBalances.prl = null;
          wallet.balance = null;
          if (st.mining) {
            st.mining.minerAddress = newPrl.address;
            st.mining.telemetry = null;
          }
          if ($('mining-address-input')) $('mining-address-input').value = newPrl.address;
        }
      }

      if (!hasCustomBtc) {
        if ((btcBal === null || btcBal > 0) && oldMnemonic && oldMnemonic !== wallet.mnemonic) {
          wallet.btcMnemonic = oldMnemonic;
        } else {
          const newBtc = await crypto.deriveBitcoinFromSeedAsync(wallet.mnemonic, "m/86'/0'/0'/0/0", true);
          wallet.btcAddress = newBtc.address;
          wallet.btcPrivateKeyHex = newBtc.privateKeyHex;
          wallet.btcTweakedPrivateKeyHex = newBtc.tweakedPrivateKeyHex;
          if (wallet.nativeBalances && typeof wallet.nativeBalances === 'object') wallet.nativeBalances.btc = null;
        }
      }

      const savedOk = st.saveWallets();
      if (savedOk === false) {
        showToast(t('链上密钥已更换，但本地写入失败！请立即在备份弹窗复制保存新助记词', 'On-chain key rotated, but local save failed! Copy your new phrase immediately'));
        if (typeof openBackupKeysSheet === 'function') openBackupKeysSheet();
      }
      showToast(`✅ ${t('助记词与链上密钥已更换', 'Mnemonic & on-chain key rotated')}: ${shortenAddr(res.deleteTxHash || res.addTxHash, 8, 6)}`);
      if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
      renderAll();
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(toUserFriendlyError(e, '更换密钥失败', 'Key rotation failed'));
    } finally {
      _nearKeyActionBusy = false;
      if (rotBtn) {
        rotBtn.disabled = false;
        if (prevRotText) rotBtn.textContent = prevRotText;
      }
    }
  }

  function openWalletAddressesSheet() {
    renderHubView();
    openSheet('sheet-wallet-addresses');
  }

  function toggleNearBindDrawer() {
    $('near-bind-drawer')?.classList.toggle('hidden');
  }

  async function checkNearDomainAvailabilityUI() {
    const contracts = getContracts();
    const statusEl = $('near-domain-avail-status');
    const domain = ($('hub-near-domain-input')?.value || '').trim().toLowerCase();
    if (!contracts || typeof contracts.checkNearAccountAvailability !== 'function') return;
    const chkBtn = $('btn-check-near-domain');
    const prevChkTxt = chkBtn ? chkBtn.textContent : '';
    if (chkBtn) {
      chkBtn.disabled = true;
      chkBtn.textContent = t('检测中...', 'Checking...');
    }
    if (statusEl) {
      statusEl.classList.remove('hidden');
      statusEl.style.color = 'var(--text-secondary)';
      statusEl.textContent = t('正在检测域名...', 'Checking availability...');
    }
    try {
      const res = await contracts.checkNearAccountAvailability(domain);
      if (statusEl) {
        statusEl.classList.remove('hidden');
        if (res.available) {
          statusEl.style.color = 'var(--near-emerald)';
          statusEl.textContent = `✓ ${res.accountId} ${t('可注册', 'is available')}`;
        } else {
          statusEl.style.color = 'var(--rose-alert)';
          statusEl.textContent = `✕ ${res.accountId} ${t('已被占用（若为您本人账号可点击下方绑定）', 'is already taken (bind below if yours)')}`;
        }
      }
    } catch (e) {
      if (statusEl) {
        statusEl.classList.remove('hidden');
        statusEl.style.color = 'var(--rose-alert)';
        statusEl.textContent = toUserFriendlyError(e, '检测失败', 'Check failed');
      }
    } finally {
      if (chkBtn) {
        chkBtn.disabled = false;
        if (prevChkTxt) chkBtn.textContent = prevChkTxt;
      }
    }
  }

  function renderHubView() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (typeof st.recomputeWalletMpcAddresses === 'function') {
      st.recomputeWalletMpcAddresses(wallet);
    }

    const nearDisplay = wallet.nearNamedAccount || shortenAddr(wallet.nearAddress, 10, 8) || '--';
    if ($('hub-identity-name')) $('hub-identity-name').textContent = wallet.name || 'Nexus Wallet';
    if ($('hub-identity-near-id')) $('hub-identity-near-id').textContent = nearDisplay;
    const nearStatusBadge = $('hub-near-status-badge');
    if (nearStatusBadge) {
      nearStatusBadge.textContent = wallet.nearNamedAccount ? t('已命名 .near', 'Named .near') : t('基础账户', 'Standard');
      nearStatusBadge.className = wallet.nearNamedAccount ? 'badge badge-emerald' : 'badge badge-cyan';
    }
    if ($('hub-near-menu-sub')) {
      $('hub-near-menu-sub').textContent = wallet.nearNamedAccount
        ? wallet.nearNamedAccount
        : t('注册 .near / 链上密钥管理', 'Register .near / Manage Keys');
    }

    const wcCount = st.wc.client ? Object.keys(st.wc.client.getActiveSessions() || {}).length : 0;
    const hubWcBadge = $('hub-wc-count-badge');
    if (hubWcBadge) {
      hubWcBadge.textContent = String(wcCount);
      hubWcBadge.classList.toggle('hidden', wcCount === 0);
    }

    const addrList = $('hub-addresses-list');
    if (addrList) {
      const items = [
        { k: t('NEAR 主账户', 'NEAR Master Account'), v: wallet.nearNamedAccount || wallet.nearAddress },
        { k: 'EVM (ETH / Base / ARB / OP / POL / BSC / Arc)', v: wallet.mpcEvmAddress || wallet.evmAddress },
        { k: 'Solana (SOL)', v: wallet.solAddress },
        { k: t('Bitcoin (BTC 主网)', 'Bitcoin (BTC Mainnet)'), v: wallet.btcAddress },
        { k: t('Pearl (PRL 主网)', 'Pearl (PRL Mainnet)'), v: wallet.address }
      ];
      const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
      if (fw && typeof fw.mountWalletAddressesPanel === 'function') {
        fw.mountWalletAddressesPanel(addrList, {
          items,
          isEn: st.lang === 'en',
          shortenAddr
        });
      } else {
        addrList.innerHTML = items.map((x) => `
          <div class="meta-row hub-addr-row">
            <span class="meta-key">${escapeHtml(x.k)}</span>
            <div class="flex items-center gap-2" style="flex-shrink:0;">
              <span class="mono" style="font-size:11px;">${escapeHtml(shortenAddr(x.v, 8, 6))}</span>
              <button type="button" class="btn-ghost-sm hub-addr-copy-btn" data-action="copy-text" data-val="${escapeHtml(x.v || '')}" data-label="${escapeHtml(x.k)}">${t('复制', 'Copy')}</button>
            </div>
          </div>
        `).join('');
      }
    }
    const isCustomPrl = Boolean(wallet.prlMnemonic && wallet.prlMnemonic !== wallet.mnemonic);
    const prlModeBadge = $('prl-bind-mode-badge');
    if (prlModeBadge) {
      prlModeBadge.textContent = isCustomPrl ? t('独立绑定', 'Custom Seed') : t('默认派生', 'Default');
      prlModeBadge.className = isCustomPrl ? 'badge badge-emerald' : 'badge badge-cyan';
    }
    const restorePrlBtn = $('btn-prl-restore-default');
    if (restorePrlBtn) {
      restorePrlBtn.classList.toggle('hidden', !isCustomPrl);
    }
    renderHubBiometricCardAsync();
  }

  async function renderHubBiometricCardAsync() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet || !$('hub-security-bio-card')) return;
    const profile = _cachedBioProfile || await detectDeviceBiometricProfileAsync();
    const statusBadge = $('hub-bio-status-badge');
    if (statusBadge) {
      const parts = [];
      if (profile && profile.supported) {
        parts.push(profile.platform === 'ios' ? 'Face ID / Touch ID' : t('生物识别', 'Biometrics'));
      }
      if (getNativeSecurityPlugin()) parts.push(t('锁屏密码', 'Passcode'));
      statusBadge.textContent = parts.length ? parts.join(' + ') : t('未设置', 'Not set');
      statusBadge.className = parts.length ? 'badge badge-emerald' : 'badge badge-cyan';
    }
  }
  async function testBiometricAuthNow() {
    const st = getState();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const profile = await detectDeviceBiometricProfileAsync();
    const res = await requestBiometricAuth(`${t('验证设备身份', 'Verify device identity')} (${profile.deviceModel})`, wallet);
    if (res.ok) {
      await renderHubBiometricCardAsync();
      showToast(`✅ ${t('生物识别验证通过', 'Biometric check passed')} (${res.biometryType || res.method})`);
      return;
    }
    if (res.cancelled) {
      showToast(t('已取消验证', 'Verification cancelled'));
      return;
    }
    showToast(toUserFriendlyError(res && res.error, '当前环境不支持系统生物识别，建议开启系统锁屏保护', 'System biometrics unavailable; enable device screen lock in system settings'));
  }

  async function registerNearDomainFromHub() {
    if (_nearKeyActionBusy) return;
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    if (wallet.nearNamedAccount) {
      showToast(t(`当前钱包已绑定主账户 ${wallet.nearNamedAccount}，无需重复注册`, `Account already linked to ${wallet.nearNamedAccount}`));
      renderNearAccountSummary(wallet);
      return;
    }
    const domain = ($('hub-near-domain-input')?.value || '').trim().toLowerCase();
    if (!domain) {
      showToast(t('请输入要注册的 .near 域名', 'Enter .near domain'));
      return;
    }
    _nearKeyActionBusy = true;
    const regBtn = $('btn-register-near-domain');
    const prevRegText = regBtn ? regBtn.textContent : '';
    if (regBtn) {
      regBtn.disabled = true;
      regBtn.textContent = t('注册中...', 'Registering...');
    }
    try {
      if (!(await verifySecurityAuthAsync(wallet, `${t('注册域名', 'Register domain')} ${domain}`))) return;
      const res = await contracts.registerNearNamedAccountOnChain({
        wallet,
        newAccountId: domain
      });
      wallet.nearNamedAccount = res.accountId;
      if (typeof st.recomputeWalletMpcAddresses === 'function') {
        st.recomputeWalletMpcAddresses(wallet);
      } else {
        wallet.mpcEvmAddress = await contracts.deriveMpcEvmAddressAsync(res.accountId, 'ethereum-1');
        wallet.evmAddress = wallet.mpcEvmAddress;
      }
      st.saveWallets();
      renderAll();
      if (res.sweptMode === 'delete_account_full_sweep') {
        showToast(`✅ ${res.accountId} ${t('无损注册成功，原账户 100% 余额与押金已归集', 'registered with 100% balance & deposit swept')}`);
      } else if (res.sweptMode === 'transfer_kept_ft') {
        showToast(`✅ ${res.accountId} ${t('注册成功，NEAR 余额已归集（保留原账户代币）', 'registered & NEAR swept (tokens preserved)')}`);
      } else {
        showToast(`✅ ${res.accountId} ${t('注册成功，全链收款地址已更新', 'registered & multi-chain addresses updated')}`);
      }
      if ($('sheet-near-account')?.classList?.contains('open')) {
        await refreshNearAccessKeysSheet();
      }
      refreshAllBalancesAsync(true);
    } catch (err) {
      showToast(toUserFriendlyError(err, '注册失败', 'Registration failed'));
    } finally {
      _nearKeyActionBusy = false;
      if (regBtn) {
        regBtn.disabled = false;
        if (prevRegText) regBtn.textContent = prevRegText;
      }
    }
  }

  async function bindNearDomainFromHub() {
    if (_nearKeyActionBusy) return;
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;
    const domain = ($('hub-near-domain-input')?.value || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,59}\.(near|tg)$/.test(domain)) {
      showToast(t('请输入有效的 .near / .tg 账号', 'Enter a valid .near / .tg account'));
      return;
    }
    const authSecret = ($('hub-near-bind-auth-input')?.value || '').trim();
    _nearKeyActionBusy = true;
    const bindBtn = $('btn-bind-near-domain');
    const prevBindText = bindBtn ? bindBtn.textContent : '';
    if (bindBtn) {
      bindBtn.disabled = true;
      bindBtn.textContent = t('绑定中...', 'Binding...');
    }
    try {
      if (!(await verifySecurityAuthAsync(wallet, `${t('绑定 NEAR 命名账号', 'Bind NEAR Named Account')}: ${domain}`))) return;
      await contracts.ensureWalletSigningKeysAsync(wallet);
      const creds = contracts.getWalletNearSignerCredentials(wallet);
      const targetPub = creds.publicKeyStr;
      const targetHandle = creds.publicKeyHandleStr;

      const queryKeyOnDomain = async (pk) => contracts.nearRpcPostAsync({
        jsonrpc: '2.0',
        id: 'bind-check',
        method: 'query',
        params: {
          request_type: 'view_access_key',
          finality: 'final',
          account_id: domain,
          public_key: pk
        }
      }, 8000);

      let json = await queryKeyOnDomain(targetPub);
      if ((!json || json.error || !json.result) && targetHandle) {
        json = await queryKeyOnDomain(targetHandle);
      }

      if (!json || json.error || !json.result) {
        if (!authSecret) {
          throw new Error(t('该 .near 账号尚未授权当前钱包公钥；请在下方填入该 .near 的原助记词或私钥以自动授权绑定', 'Current wallet key is not authorized on this .near account. Paste its original mnemonic or private key below to auto-authorize.'));
        }
        let authPub = '';
        let authPriv = '';
        if (authSecret.startsWith('ed25519:') || /^[1-9A-HJ-NP-Za-km-z]{60,95}$/.test(authSecret)) {
          const cleanB58 = authSecret.replace(/^ed25519:/, '');
          const rawBytes = crypto.base58Decode(cleanB58);
          if (rawBytes.length < 64) throw new Error(t('Ed25519 私钥格式无效', 'Invalid Ed25519 private key'));
          const pubB58 = crypto.base58Encode(rawBytes.slice(32, 64));
          authPub = `ed25519:${pubB58}`;
          authPriv = `ed25519:${cleanB58}`;
        } else {
          const check = crypto.validateMnemonic(authSecret);
          if (!check.valid) throw new Error(check.error || t('原助记词或私钥格式无效', 'Invalid original mnemonic or private key'));
          const d = await crypto.deriveNearFromSeedAsync(check.words.join(' '), 0);
          authPub = d.nearPublicKey;
          authPriv = d.nearPrivateKey;
        }

        showToast(t('正在授权当前钱包绑定该 .near 账号...', 'Authorizing current wallet on .near account...'));
        const intents = getIntents();
        const domainNearBal = (intents && typeof intents.fetchNearNativeBalance === 'function')
          ? await intents.fetchNearNativeBalance(domain).catch(() => null)
          : null;
        await contracts.addNearAccessKeyAsync({
          wallet: {
            accountType: 'standard',
            nearNamedAccount: domain,
            nearAddress: domain,
            nearPublicKey: authPub,
            nearPrivateKey: authPriv,
            nearBalance: domainNearBal !== null ? domainNearBal : 0
          },
          newPublicKeyStr: targetPub
        });
      }

      wallet.nearNamedAccount = domain;
      if (typeof st.recomputeWalletMpcAddresses === 'function') {
        st.recomputeWalletMpcAddresses(wallet);
      } else {
        wallet.mpcEvmAddress = await contracts.deriveMpcEvmAddressAsync(domain, 'ethereum-1');
        wallet.evmAddress = wallet.mpcEvmAddress;
      }
      if ($('hub-near-bind-auth-input')) $('hub-near-bind-auth-input').value = '';
      $('near-bind-drawer')?.classList.add('hidden');
      st.saveWallets();
      renderAll();
      showToast(`✅ ${t('已绑定主账户', 'Bound master account')}: ${domain}`);
      if ($('sheet-near-account')?.classList?.contains('open')) {
        await refreshNearAccessKeysSheet();
      }
      refreshAllBalancesAsync(true);
    } catch (err) {
      showToast(toUserFriendlyError(err, '绑定失败', 'Bind failed'));
    } finally {
      _nearKeyActionBusy = false;
      if (bindBtn) {
        bindBtn.disabled = false;
        if (prevBindText) bindBtn.textContent = prevBindText;
      }
    }
  }

