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
    if (listEl) {
      listEl.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px;">${t('正在查询链上密钥...', 'Loading on-chain keys...')}</div>`;
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
          listEl.innerHTML = `<div class="text-muted" style="font-size:12px;padding:8px;">${t('账户尚未在链上激活（首次收款或激活后可见密钥）', 'Account not yet active on-chain')}</div>`;
        }
        return;
      }

      if (rotateCard) rotateCard.classList.remove('hidden');
      if (guideEl) guideEl.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
      const registerCard = $('hub-near-domain-card');
      if (registerCard) registerCard.classList.toggle('hidden', Boolean(wallet.nearNamedAccount));
      if (statusBadge) {
        statusBadge.textContent = wallet.nearNamedAccount ? t('已激活 .near', 'Active .near') : t('已激活隐式账户', 'Active Implicit');
        statusBadge.className = 'badge badge-emerald';
      }
      if (!listEl) return;

      const fullCount = res.keys.filter((k) => k.access_key && k.access_key.permission === 'FullAccess').length;
      listEl.innerHTML = res.keys.map((k) => {
        const pk = String(k.public_key || '');
        const isFull = Boolean(k.access_key && k.access_key.permission === 'FullAccess');
        const isCurrent = pk === creds.publicKeyStr || (creds.publicKeyHandleStr && pk === creds.publicKeyHandleStr);
        const canDelete = !isFull || fullCount > 1;
        return `
          <div class="ios-glass-card flex items-center justify-between gap-2" style="padding:10px 12px;">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1" style="flex-wrap:wrap;">
                <span class="badge ${isFull ? 'badge-emerald' : 'badge-cyan'}">${isFull ? 'FullAccess' : 'dApp Key'}</span>
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
    } catch (e) {
      if (rotateCard) rotateCard.classList.add('hidden');
      if (listEl) {
        listEl.innerHTML = `<div style="font-size:12px;color:var(--rose-alert);padding:8px;">${escapeHtml(e && e.message ? e.message : t('查询失败', 'Query failed'))}</div>`;
      }
    }
  }

  async function deleteNearAccessKeyFromSheet(targetPublicKeyStr) {
    const st = getState();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet || !contracts) return;
    if (!(await verifySecurityAuthAsync(wallet, t('删除 NEAR 访问密钥', 'Delete NEAR Access Key')))) return;
    try {
      showToast(t('正在广播 DeleteKey 交易...', 'Broadcasting DeleteKey...'));
      const res = await contracts.deleteNearAccessKeyAsync({ wallet, targetPublicKeyStr });
      showToast(`✅ ${t('密钥已删除', 'Access Key deleted')}: ${shortenAddr(res.txHash, 8, 6)}`);
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(e && e.message ? e.message : t('删除失败', 'Delete failed'));
    }
  }

  async function addNearMnemonicKeyOnlyFromSheet() {
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
    if (!(await verifySecurityAuthAsync(wallet, t('为 NEAR 账户添加新密钥', 'Add New Key to NEAR Account')))) return;

    try {
      showToast(t('正在执行 AddKey 添加密钥...', 'Broadcasting AddKey...'));
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
      showToast(e && e.message ? e.message : t('添加密钥失败', 'AddKey failed'));
    }
  }

  async function confirmRotateNearAccountKey() {
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
    if (!(await verifySecurityAuthAsync(wallet, t('更换 NEAR 控制助记词', 'Rotate NEAR Control Mnemonic')))) return;

    try {
      showToast(t('正在执行 AddKey + DeleteKey...', 'Rotating key on-chain...'));
      const res = await contracts.rotateNearAccountKeyAsync({
        wallet,
        newMnemonic: check.words.join(' '),
        upgradeToMlDsa65: false,
        deleteOldKey: true
      });
      wallet.mnemonic = res.newDerived.mnemonic;
      wallet.accountType = 'standard';
      wallet.nearPublicKey = res.newDerived.nearPublicKey;
      wallet.nearPrivateKey = res.newDerived.nearPrivateKey;
      wallet.nearPrivateSeedHex = res.newDerived.nearPrivateSeedHex;
      st.saveWallets();
      showToast(`✅ ${t('助记词与链上密钥已更换', 'Mnemonic & on-chain key rotated')}: ${shortenAddr(res.deleteTxHash || res.addTxHash, 8, 6)}`);
      if ($('near-keys-rotate-mnemonic')) $('near-keys-rotate-mnemonic').value = '';
      renderAll();
      await refreshNearAccessKeysSheet();
    } catch (e) {
      showToast(e && e.message ? e.message : t('更换密钥失败', 'Key rotation failed'));
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
        statusEl.textContent = e && e.message ? e.message : t('检测失败', 'Check failed');
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
      nearStatusBadge.textContent = wallet.nearNamedAccount ? t('已命名 .near', 'Named .near') : t('隐式账户', 'Implicit');
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

    if ($('hub-near-current-id')) {
      $('hub-near-current-id').textContent = wallet.nearNamedAccount || wallet.nearAddress || '--';
    }
    if ($('hub-mpc-evm-address')) {
      $('hub-mpc-evm-address').textContent = wallet.mpcEvmAddress || wallet.evmAddress || '--';
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
      if (typeof st.hasWalletPin === 'function' ? st.hasWalletPin(wallet) : Boolean(wallet.pin || wallet.pinHash)) parts.push('PIN');
      const pinBtn = $('btn-hub-set-pin');
      if (pinBtn) pinBtn.classList.remove('hidden');
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
    showToast(res.error || t('当前环境不支持系统生物识别，请使用交易 PIN', 'System biometrics unavailable; use PIN'));
  }

  function openSetWalletPinPrompt() {
    openPinSheet();
  }

  async function registerNearDomainFromHub() {
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
    if (!(await verifySecurityAuthAsync(wallet, `${t('注册域名', 'Register domain')} ${domain}`))) return;
    try {
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
        showToast(`✅ ${res.accountId} ${t('无损注册成功，原隐式账户 100% 余额与押金已归集', 'registered with 100% implicit balance & deposit swept')}`);
      } else if (res.sweptMode === 'transfer_kept_ft') {
        showToast(`✅ ${res.accountId} ${t('注册成功，NEAR 余额已归集（保留原账户代币）', 'registered & NEAR swept (FT preserved)')}`);
      } else {
        showToast(`✅ ${res.accountId} ${t('注册成功，MPC 全链地址已切换', 'registered & MPC addresses updated')}`);
      }
      if ($('sheet-near-account')?.classList?.contains('open')) {
        await refreshNearAccessKeysSheet();
      }
      refreshAllBalancesAsync(true);
    } catch (err) {
      showToast(err && err.message ? err.message : t('注册失败', 'Registration failed'));
    }
  }

  async function bindNearDomainFromHub() {
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
    try {
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
        await contracts.addNearAccessKeyAsync({
          wallet: {
            accountType: 'standard',
            nearNamedAccount: domain,
            nearAddress: domain,
            nearPublicKey: authPub,
            nearPrivateKey: authPriv,
            nearBalance: 1
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
      showToast(err && err.message ? err.message : t('绑定失败', 'Bind failed'));
    }
  }

  function recomputeHubMpcAddress() {
    const crypto = getCrypto();
    const wallet = getState().getActiveWallet();
    if (!wallet || !crypto) return;
    const path = ($('hub-mpc-path-input')?.value || 'ethereum-1').trim() || 'ethereum-1';
    const nearId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!nearId) return;
    try {
      const lower = path.toLowerCase();
      let addr = '--';
      if (lower.startsWith('solana') && typeof crypto.deriveNearMpcSolanaAddress === 'function') {
        addr = crypto.deriveNearMpcSolanaAddress(nearId, path).mpcSolAddress;
      } else if (lower.startsWith('pearl') && typeof crypto.deriveNearMpcPearlAddress === 'function') {
        addr = crypto.deriveNearMpcPearlAddress(nearId, path).mpcPearlAddress;
      } else if (lower.startsWith('bitcoin') && typeof crypto.deriveNearMpcBitcoinAddress === 'function') {
        addr = crypto.deriveNearMpcBitcoinAddress(nearId, path).mpcBtcAddress;
      } else {
        addr = crypto.deriveNearMpcEvmAddress(nearId, path).mpcEvmAddress;
      }
      if ($('hub-mpc-evm-address')) $('hub-mpc-evm-address').textContent = addr;
    } catch (_) {}
  }

  function copyHubMpcAddress() {
    const addr = $('hub-mpc-evm-address')?.textContent || '';
    if (addr && addr !== '--') copyText(addr, 'MPC EVM Address');
  }

  async function executeHubMpcSign() {
    const st = getState();
    const crypto = getCrypto();
    const contracts = getContracts();
    const wallet = st.getActiveWallet();
    if (!wallet) return;

    const rawInput = ($('hub-mpc-payload-input')?.value || '').trim();
    if (!rawInput) {
      showToast(t('请输入消息或 32 字节 Hex 哈希', 'Enter message or 32-byte hex hash'));
      return;
    }
    const path = ($('hub-mpc-path-input')?.value || 'ethereum-1').trim() || 'ethereum-1';
    const domainId = path.toLowerCase().startsWith('solana') ? 1 : 0;
    const cleanHex = rawInput.replace(/^0x/i, '');
    const payloadBytes = /^[0-9a-fA-F]{64}$/.test(cleanHex)
      ? crypto.hexToBytes(cleanHex)
      : crypto.keccak256Bytes(rawInput);

    if (!(await verifySecurityAuthAsync(wallet, t('确认 MPC 链抽象签名', 'Confirm MPC Chain Signature')))) return;
    try {
      const res = await contracts.requestNearMpcChainSignature({
        wallet,
        payloadHash32Bytes: payloadBytes,
        path,
        domainId
      });
      const rec = $('hub-mpc-receipt');
      if (rec) {
        rec.classList.remove('hidden');
        rec.innerHTML = `
          <div class="meta-row"><span class="meta-key">TxHash</span><span class="mono text-cyan">${escapeHtml(shortenAddr(res.txHash, 10, 8))}</span></div>
          ${res.explorerUrl && isValidHttpsUrl(res.explorerUrl) ? `<a href="${escapeHtml(res.explorerUrl)}" target="_blank" rel="noopener noreferrer" class="text-cyan" style="font-size:11.5px;">${t('查看链上执行结果 ↗', 'View on NearBlocks ↗')}</a>` : ''}
        `;
      }
      showToast(`✅ ${t('MPC 链签名请求已广播', 'MPC sign tx broadcast')}`);
    } catch (err) {
      showToast(err && err.message ? err.message : t('MPC 签名失败', 'MPC sign failed'));
    }
  }

