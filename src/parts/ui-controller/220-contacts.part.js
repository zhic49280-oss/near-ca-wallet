  // ==================== Contacts Sheet ====================

  function openContactsSheet() {
    _contactsPickerTarget = null;
    renderContactsList();
    openSheet('sheet-contacts');
  }

  function openContactsPicker(target) {
    if (target === 'swap') {
      const st = getState();
      const ft = resolveSwapToken(st.swap.fromAssetId, 0);
      const tt = resolveSwapToken(st.swap.toAssetId, 1);
      if (doesSwapRouteRequireSelfRecipient(ft, tt, st.swap.quoteData || null)) {
        showToast(t('当前路由仅支持当前钱包自收', 'Self-recipient required for this route'));
        return;
      }
    }
    _contactsPickerTarget = target;
    renderContactsList();
    openSheet('sheet-contacts');
  }

  function renderContactsList() {
    const st = getState();
    const listEl = $('contacts-list');
    if (!listEl) return;
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountContactsPanel === 'function') {
      fw.mountContactsPanel(listEl, {
        contacts: Array.isArray(st.contacts) ? st.contacts : [],
        pickerTarget: _contactsPickerTarget,
        isEn: st.lang === 'en',
        shortenAddr
      });
    }
  }

  function addContactFromSheet() {
    const st = getState();
    const crypto = getCrypto();
    const name = ($('contact-name-input')?.value || '').trim();
    const address = ($('contact-addr-input')?.value || '').trim();
    if (!name || !address) {
      showToast(t('请填写备注名和地址', 'Enter contact name and address'));
      return;
    }
    const net = crypto.detectAddressNetwork(address);
    const addrCheck = (net && typeof crypto.validateChainAddress === 'function')
      ? crypto.validateChainAddress(net, address)
      : { valid: Boolean(net) };
    const isAddrValid = typeof addrCheck === 'boolean' ? addrCheck : Boolean(addrCheck && addrCheck.valid);
    if (!net || !isAddrValid) {
      showToast(t('地址格式或校验和无效', 'Invalid wallet address or checksum'));
      return;
    }
    if (st.contacts.some((c) => String(c.address || '').toLowerCase() === address.toLowerCase())) {
      showToast(t('该地址已在联系人列表中', 'Address already in contacts'));
      return;
    }
    st.contacts.unshift({
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      address,
      network: net,
      createdAt: new Date().toISOString()
    });
    st.saveContacts();
    if ($('contact-name-input')) $('contact-name-input').value = '';
    if ($('contact-addr-input')) $('contact-addr-input').value = '';
    renderContactsList();
    showToast(t('联系人已保存', 'Contact saved'));
  }

  async function deleteContactById(id) {
    const confirmed = await showConfirmDialogAsync(
      t('确认删除该联系人？', 'Delete this contact?'),
      { danger: true, title: t('删除联系人', 'Delete Contact'), confirmText: t('删除', 'Delete') }
    );
    if (!confirmed) return;
    const st = getState();
    st.contacts = st.contacts.filter((c) => c.id !== id);
    st.saveContacts();
    renderContactsList();
  }

  function pickContactAddress(address) {
    const st = getState();
    const target = _contactsPickerTarget;
    if (target === 'send') {
      _contactsPickerTarget = null;
      const contactsSheet = $('sheet-contacts');
      if (contactsSheet) {
        contactsSheet.classList.remove('open');
        contactsSheet.setAttribute('aria-hidden', 'true');
      }
      openSheet('sheet-send');
      if ($('send-recipient-input')) $('send-recipient-input').value = address;
      handleSendRecipientInput();
    } else if (target === 'swap') {
      const crypto = getCrypto();
      const ft = resolveSwapToken(st.swap.fromAssetId, 0);
      const tt = resolveSwapToken(st.swap.toAssetId, 1);
      const addrNet = crypto.detectAddressNetwork(address);
      const destBc = String(tt?.blockchain || '').toLowerCase();
      const isCompatible = addrNet === destBc || (addrNet === 'evm' && EVM_CHAIN_KEYS.includes(destBc));
      if (!isCompatible) {
        showToast(t(`该联系人地址不属于目标网络 (${destBc.toUpperCase()})`, `Contact address does not match destination network (${destBc.toUpperCase()})`));
        return;
      }
      _contactsPickerTarget = null;
      closeAllSheets();
      if (!doesSwapRouteRequireSelfRecipient(ft, tt, st.swap.quoteData || null)) {
        st.swap.recipientAddress = address;
        if ($('swap-recipient-input')) $('swap-recipient-input').value = address;
      }
    } else {
      closeAllSheets();
    }
  }

