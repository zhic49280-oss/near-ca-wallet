  // ======================== NEAR Access Keys Management & Key Rotation ========================

  async function fetchNearAccessKeysAsync(accountId) {
    const cleanId = String(accountId || '').trim().toLowerCase();
    if (!cleanId) {
      throw new Error(t('缺少 NEAR 账户 ID', 'Missing NEAR account ID'));
    }
    const res = await nearRpcPostAsync(
      {
        jsonrpc: '2.0',
        id: 'ak-list',
        method: 'query',
        params: {
          request_type: 'view_access_key_list',
          finality: 'final',
          account_id: cleanId
        }
      },
      8000
    );
    if (!res || res.error || !res.result) {
      const errCause = res && res.error && res.error.cause ? String(res.error.cause.name || '') : '';
      const msg = (res && res.error && (res.error.data || res.error.message)) || '';
      if (errCause === 'UNKNOWN_ACCOUNT' || /does not exist|unknown account/i.test(String(msg))) {
        return { accountId: cleanId, exists: false, keys: [] };
      }
      throw new Error(msg || t('查询 NEAR 账户密钥失败', 'Failed to query NEAR account keys'));
    }
    const keys = Array.isArray(res.result.keys) ? res.result.keys : [];
    return {
      accountId: cleanId,
      exists: true,
      keys
    };
  }

  function buildAddKeyActionBytes({ newPublicKeyStr, permission = 'FullAccess' } = {}) {
    const pubBorsh = encodeNearPublicKeyBorsh(newPublicKeyStr);
    // AccessKey { nonce: u64(0), permission: AccessKeyPermission::FullAccess (tag 1) }
    if (permission !== 'FullAccess') {
      throw new Error(t('暂仅支持添加完全权限密钥', 'Only full-permission keys are supported'));
    }
    return concatUint8Arrays([
      new Uint8Array([5]), // Action::AddKey
      pubBorsh,
      encodeU64LE(0n),
      new Uint8Array([1]) // AccessKeyPermission::FullAccess
    ]);
  }

  function buildDeleteKeyActionBytes({ targetPublicKeyStr } = {}) {
    const pubBorsh = encodeNearPublicKeyBorsh(targetPublicKeyStr);
    return concatUint8Arrays([
      new Uint8Array([6]), // Action::DeleteKey
      pubBorsh
    ]);
  }

  function buildDeleteAccountActionBytes({ beneficiaryId } = {}) {
    const beneficiary = String(beneficiaryId || '').trim().toLowerCase();
    if (!beneficiary) {
      throw new Error(t('缺少注销受益账户', 'Missing beneficiary account for account closure'));
    }
    return concatUint8Arrays([
      new Uint8Array([7]), // Action::DeleteAccount
      encodeBorshString(beneficiary)
    ]);
  }

  async function checkNearAccountAvailability(accountId) {
    const domain = String(accountId || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,59}\.near$/.test(domain)) {
      throw new Error(t('请输入有效的 .near 域名（如 alice.near）', 'Enter a valid .near account ID (e.g. alice.near)'));
    }
    const res = await nearRpcPostAsync({
      jsonrpc: '2.0',
      id: 'avail-check',
      method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: domain }
    }, 8000);
    if (res && res.result && res.result.amount !== undefined) {
      return { ok: true, available: false, exists: true, accountId: domain };
    }
    const errText = JSON.stringify(res?.error || '');
    if (/UNKNOWN_ACCOUNT|does not exist/i.test(errText)) {
      return { ok: true, available: true, exists: false, accountId: domain };
    }
    throw new Error(res?.error?.message || t('无法查询该账户状态', 'Failed to query account availability'));
  }

  async function addNearAccessKeyAsync({ wallet, newPublicKeyStr } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const resolved = await ensureWalletSigningKeysAsync(wallet);
    const creds = getWalletNearSignerCredentials(resolved);
    if (!creds.accountId || !creds.publicKeyStr || !creds.privateKeyStr) {
      throw new Error(t('当前 NEAR 账户缺少签名密钥', 'Missing NEAR signing credentials'));
    }
    validateSufficientChainBalance({
      wallet: resolved,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: 0.002,
      isNative: true
    });
    const actionBytes = buildAddKeyActionBytes({ newPublicKeyStr, permission: 'FullAccess' });
    const txHash = await buildSignAndBroadcastNearActions({
      accountId: creds.accountId,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: creds.accountId,
      actionsBytes: actionBytes
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}` };
  }

  async function deleteNearAccessKeyAsync({ wallet, targetPublicKeyStr, skipSafetyCheck = false } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const resolved = await ensureWalletSigningKeysAsync(wallet);
    const creds = getWalletNearSignerCredentials(resolved);
    if (!creds.accountId || !creds.publicKeyStr || !creds.privateKeyStr) {
      throw new Error(t('当前 NEAR 账户缺少签名密钥', 'Missing NEAR signing credentials'));
    }
    const resolvedTarget = String(targetPublicKeyStr || '').trim();
    if (!skipSafetyCheck) {
      if (resolvedTarget === creds.publicKeyStr || (creds.publicKeyHandleStr && resolvedTarget === creds.publicKeyHandleStr)) {
        throw new Error(
          t(
            '安全拦截：不能删除当前钱包正在使用的私钥，否则将立即丧失账户控制权',
            'Safety block: Cannot delete the key currently in use by this wallet'
          )
        );
      }
      const list = await fetchNearAccessKeysAsync(creds.accountId);
      const fullKeys = (list.keys || []).filter((k) => k && k.access_key && k.access_key.permission === 'FullAccess');
      const remainingFull = fullKeys.filter((k) => k.public_key !== resolvedTarget);
      if (fullKeys.length > 0 && remainingFull.length === 0) {
        throw new Error(
          t(
            '安全拦截：不能删除账户上最后一把完全权限密钥，否则账户将永久锁死',
            'Safety block: Cannot delete the last full-permission key on this account'
          )
        );
      }
    }
    validateSufficientChainBalance({
      wallet: resolved,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: 0.002,
      isNative: true
    });
    const actionBytes = buildDeleteKeyActionBytes({ targetPublicKeyStr: resolvedTarget });
    const txHash = await buildSignAndBroadcastNearActions({
      accountId: creds.accountId,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: creds.accountId,
      actionsBytes: actionBytes
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}` };
  }

  async function rotateNearAccountKeyAsync({ wallet, newMnemonic, deleteOldKey = true } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const cryptoEngine = getCryptoEngine();
    const resolved = await ensureWalletSigningKeysAsync(wallet);
    const creds = getWalletNearSignerCredentials(resolved);
    if (!creds.accountId || !creds.publicKeyStr || !creds.privateKeyStr) {
      throw new Error(t('当前 NEAR 账户缺少签名密钥', 'Missing NEAR signing credentials'));
    }

    validateSufficientChainBalance({
      wallet: resolved,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: 0.005,
      isNative: true
    });

    const newDerived = await cryptoEngine.deriveNearFromSeedAsync(newMnemonic, 0);
    const newPubKey = newDerived.nearPublicKey;

    const addAction = buildAddKeyActionBytes({ newPublicKeyStr: newPubKey, permission: 'FullAccess' });
    const addTxHash = await buildSignAndBroadcastNearActions({
      accountId: creds.accountId,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: creds.accountId,
      actionsBytes: addAction
    });

    // Verify new key is visible on-chain before deleting the old key
    let newKeyVerified = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const keyRes = await nearRpcPostAsync({
          jsonrpc: '2.0',
          id: `verify-new-key-${attempt}`,
          method: 'query',
          params: {
            request_type: 'view_access_key',
            finality: 'final',
            account_id: creds.accountId,
            public_key: newPubKey
          }
        }, 6000);
        if (keyRes && keyRes.result && keyRes.result.permission) {
          newKeyVerified = true;
          break;
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 900));
    }
    if (!newKeyVerified) {
      throw new Error(t('新密钥已提交但尚未在链上确认，已中止删除旧密钥以确保安全', 'New key not yet confirmed on-chain; aborted removing old key for safety'));
    }

    let deleteTxHash = '';
    if (deleteOldKey && creds.publicKeyStr !== newPubKey) {
      const delAction = buildDeleteKeyActionBytes({ targetPublicKeyStr: creds.publicKeyStr });
      deleteTxHash = await buildSignAndBroadcastNearActions({
        accountId: creds.accountId,
        publicKeyStr: newPubKey,
        privateKeyStr: newDerived.nearPrivateKey,
        receiverId: creds.accountId,
        actionsBytes: delAction
      });
    }

    return {
      addTxHash,
      deleteTxHash,
      newDerived,
      explorerUrl: `${NEAR_EXPLORER_TX}${deleteTxHash || addTxHash}`
    };
  }

  async function registerNearNamedAccountOnChain({
    implicitAccountId,
    publicKeyStr,
    privateKeyStr,
    newAccountId,
    availableBalanceNear = null,
    wallet = null,
    sweepImplicitToNamed = true
  } = {}) {
    const resolvedWallet = wallet ? await ensureWalletSigningKeysAsync(wallet) : null;
    const sender = implicitAccountId || (resolvedWallet && (resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress));
    const pub = publicKeyStr || (resolvedWallet && resolvedWallet.nearPublicKey);
    const priv = privateKeyStr || (resolvedWallet && resolvedWallet.nearPrivateKey);
    const domain = String(newAccountId || '').trim().toLowerCase();

    if (!/^[a-z0-9_-]{2,59}\.near$/.test(domain)) {
      throw new Error(t('请输入有效的 .near 域名（如 alice.near）', 'Enter a valid .near account ID (e.g. alice.near)'));
    }
    if (!sender || !pub || !priv) {
      throw new Error(t('缺少 NEAR 账户签名凭据', 'Missing NEAR account signing credentials'));
    }

    let knownBal = availableBalanceNear;
    if (knownBal === null || knownBal === undefined) {
      if (resolvedWallet && typeof resolvedWallet.nearBalance === 'number') {
        knownBal = resolvedWallet.nearBalance;
      }
    }

    if (knownBal !== null && knownBal !== undefined) {
      validateSufficientChainBalance({
        wallet: { nearBalance: knownBal },
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: 0.05,
        isNative: true,
        gasBuffer: 0.005
      });
    } else {
      const balRes = await nearRpcPostAsync(
        {
          jsonrpc: '2.0',
          id: 'reg-bal',
          method: 'query',
          params: { request_type: 'view_account', finality: 'final', account_id: sender }
        },
        8000
      );
      const liveNearBal =
        balRes && balRes.result && balRes.result.amount !== undefined
          ? Number(fromBaseUnits(String(balRes.result.amount), 24))
          : 0;
      validateSufficientChainBalance({
        wallet: { nearBalance: liveNearBal },
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: 0.05,
        isNative: true,
        gasBuffer: 0.005
      });
    }

    const txHash = await api.signAndSendNearFunctionCall({
      accountId: sender,
      publicKeyStr: pub,
      privateKeyStr: priv,
      receiverId: 'near',
      methodName: 'create_account',
      argsJson: JSON.stringify({
        new_account_id: domain,
        new_public_key: pub
      }),
      gas: '30000000000000',
      depositYocto: '50000000000000000000000' // 0.05 NEAR
    });

    let sweepTxHash = null;
    let sweptMode = 'create_only';
    let sweepError = '';
    const isImplicitSender = /^[0-9a-f]{64}$/i.test(String(sender || '').trim()) && sender.toLowerCase() !== domain;

    if (sweepImplicitToNamed !== false && isImplicitSender) {
      try {
        let domainExists = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const chk = await nearRpcPostAsync({
            jsonrpc: '2.0',
            id: `verify-dom-${attempt}`,
            method: 'query',
            params: { request_type: 'view_account', finality: 'final', account_id: domain }
          }, 5000).catch(() => null);
          if (chk && chk.result && chk.result.amount !== undefined) {
            domainExists = true;
            break;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 50));
        }

        if (domainExists) {
          const localFtMap = (resolvedWallet && resolvedWallet.nearNep141Balances) || {};
          const hasLocalFt = Object.values(localFtMap).some((entry) => {
            if (!entry) return false;
            try {
              if (entry.raw && BigInt(String(entry.raw)) > 0n) return true;
            } catch (_) {}
            return Number(entry.formatted || 0) > 0;
          });

          let fastNearConfirmedZero = false;
          if (!hasLocalFt) {
            let fnTokens = null;
            let fnStatus = 0;
            try {
              const fnResp = await fetchFastNearAccountFt(sender, 4000);
              if (fnResp && Array.isArray(fnResp.tokens)) {
                fnTokens = fnResp.tokens;
              } else if (fnResp && fnResp.data && Array.isArray(fnResp.data.tokens)) {
                fnTokens = fnResp.data.tokens;
              } else if (fnResp && fnResp.status === 404) {
                fnStatus = 404;
              }
            } catch (fnErr) {
              fnStatus = Number((fnErr && fnErr.status) || 0);
            }
            if (Array.isArray(fnTokens)) {
              const anyFt = fnTokens.some((tok) => {
                if (!tok) return false;
                try { return BigInt(String(tok.balance || '0')) > 0n; } catch (_) { return true; }
              });
              fastNearConfirmedZero = !anyFt;
            }
            // Do not treat HTTP 404 or timeout as confirmed zero assets (prevents accidental DeleteAccount)
          }

          if (!hasLocalFt && fastNearConfirmedZero) {
            const delAction = buildDeleteAccountActionBytes({ beneficiaryId: domain });
            sweepTxHash = await buildSignAndBroadcastNearActions({
              accountId: sender,
              publicKeyStr: pub,
              privateKeyStr: priv,
              receiverId: sender,
              actionsBytes: delAction
            });
            sweptMode = 'delete_account_full_sweep';
          } else {
            const remRes = await nearRpcPostAsync({
              jsonrpc: '2.0',
              id: 'sweep-rem',
              method: 'query',
              params: { request_type: 'view_account', finality: 'final', account_id: sender }
            }, 6000).catch(() => null);
            const remNear = remRes && remRes.result && remRes.result.amount !== undefined
              ? Number(fromBaseUnits(String(remRes.result.amount), 24))
              : 0;
            const sendable = Number((remNear - 0.005).toFixed(5));
            if (remNear > 0.015 && sendable > 0) {
              const txRes = await api.signAndSendNearTransfer({
                accountId: sender,
                publicKeyStr: pub,
                privateKeyStr: priv,
                receiverId: domain,
                amountNear: sendable,
                availableBalanceNear: remNear
              });
              sweepTxHash = txRes.txHash;
              sweptMode = 'transfer_kept_ft';
            } else {
              sweptMode = 'kept_ft_low_near';
            }
          }
        }
      } catch (err) {
        sweptMode = 'sweep_skipped';
        sweepError = err && err.message ? err.message : String(err || 'sweep failed');
      }
    }

    return {
      txHash,
      sweepTxHash,
      sweptMode,
      sweepError,
      accountId: domain,
      explorerUrl: `${NEAR_EXPLORER_TX}${sweepTxHash || txHash}`
    };
  }

  function normalizePayload32Bytes(payloadHash32Bytes) {
    if (typeof payloadHash32Bytes === 'string') {
      const bytes = hexToBytes(payloadHash32Bytes);
      if (bytes.length !== 32) {
        throw new Error(t('MPC 签名载荷必须是 32 字节哈希', 'payloadHash32Bytes must be exactly 32 bytes'));
      }
      return Array.from(bytes);
    }
    if (payloadHash32Bytes instanceof Uint8Array || Array.isArray(payloadHash32Bytes)) {
      if (payloadHash32Bytes.length !== 32) {
        throw new Error(t('MPC 签名载荷必须是 32 字节', 'payloadHash32Bytes must be exactly 32 bytes'));
      }
      return Array.from(payloadHash32Bytes, (b) => Number(b) & 0xff);
    }
    throw new Error(t('无效的 MPC 32 字节载荷格式', 'Invalid payloadHash32Bytes format'));
  }

  function normalizeMpcEddsaBytes(payloadInput) {
    if (typeof payloadInput === 'string') {
      const bytes = hexToBytes(payloadInput);
      if (bytes.length > 1232) {
        throw new Error(t('EdDSA MPC 签名载荷不能超过 1232 字节', 'EdDSA payload must not exceed 1232 bytes'));
      }
      return bytesToHex(bytes);
    }
    if (payloadInput instanceof Uint8Array || Array.isArray(payloadInput)) {
      const bytes = payloadInput instanceof Uint8Array
        ? payloadInput
        : Uint8Array.from(payloadInput, (b) => Number(b) & 0xff);
      if (bytes.length > 1232) {
        throw new Error(t('EdDSA MPC 签名载荷不能超过 1232 字节', 'EdDSA payload must not exceed 1232 bytes'));
      }
      return bytesToHex(bytes);
    }
    throw new Error(t('无效的 EdDSA MPC 载荷格式', 'Invalid EdDSA payload format'));
  }

  function decodeSuccessValueJson(b64) {
    if (!b64 || typeof b64 !== 'string') return null;
    try {
      const bytes = base64ToBytes(b64);
      const txt = new TextDecoder().decode(bytes);
      return JSON.parse(txt);
    } catch (_) {
      return null;
    }
  }

  /**
   * Calls v1.signer on NEAR Mainnet (`sign`) so the user's NEAR master account can authorize
   * cross-chain MPC signatures across both domain_id: 0 (Secp256k1 EVM/BTC/Pearl) and domain_id: 1 (Ed25519 Solana).
   */
  async function requestNearMpcChainSignature({
    wallet,
    payloadHash32Bytes,
    payloadBytes = null,
    path = 'ethereum-1',
    domainId = null,
    keyVersion = 0,
    depositYocto = '1'
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const isEddsa = Number(domainId) === 1;
    let requestBody;

    if (isEddsa) {
      const rawInput = payloadBytes !== null && payloadBytes !== undefined ? payloadBytes : payloadHash32Bytes;
      const eddsaHex = normalizeMpcEddsaBytes(rawInput);
      requestBody = {
        request: {
          path: path || 'solana-1',
          domain_id: 1,
          payload_v2: { Eddsa: eddsaHex }
        }
      };
    } else if (domainId !== null && domainId !== undefined && Number(domainId) === 0) {
      const payloadArray = normalizePayload32Bytes(payloadHash32Bytes);
      requestBody = {
        request: {
          path: path || 'ethereum-1',
          domain_id: 0,
          payload_v2: { Ecdsa: bytesToHex(Uint8Array.from(payloadArray)) }
        }
      };
    } else {
      const payloadArray = normalizePayload32Bytes(payloadHash32Bytes);
      requestBody = {
        request: {
          payload: payloadArray,
          path,
          key_version: keyVersion
        }
      };
    }

    const depositNear = Number(fromBaseUnits(String(depositYocto || '1'), 24));
    validateSufficientChainBalance({
      wallet,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: depositNear > 0 ? depositNear : 0.000001,
      isNative: true,
      gasBuffer: 0.005
    });

    await ensureWalletSigningKeysAsync(wallet);

    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }

    const useDirectOutcome = api.signAndSendNearFunctionCall === signAndSendNearFunctionCall;
    let txHash;
    let outcomeObj = null;
    if (useDirectOutcome) {
      outcomeObj = await _signAndSendNearFunctionCallWithOutcome({
        accountId,
        publicKeyStr: wallet.nearPublicKey,
        privateKeyStr: wallet.nearPrivateKey,
        receiverId: V1_SIGNER_CONTRACT,
        methodName: 'sign',
        argsJson: JSON.stringify(requestBody),
        gas: '250000000000000',
        depositYocto: String(depositYocto)
      });
      txHash = outcomeObj.txHash;
    } else {
      api._lastNearOutcome = null;
      txHash = await api.signAndSendNearFunctionCall({
        accountId,
        publicKeyStr: wallet.nearPublicKey,
        privateKeyStr: wallet.nearPrivateKey,
        receiverId: V1_SIGNER_CONTRACT,
        methodName: 'sign',
        argsJson: JSON.stringify(requestBody),
        gas: '250000000000000',
        depositYocto: String(depositYocto)
      });
      outcomeObj = api._lastNearOutcome && api._lastNearOutcome.txHash === txHash ? api._lastNearOutcome : null;
    }

    let mpcSignature = null;
    if (outcomeObj && outcomeObj.successValueB64) {
      mpcSignature = decodeSuccessValueJson(outcomeObj.successValueB64);
    }

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
      signerContract: V1_SIGNER_CONTRACT,
      accountId,
      path: requestBody.request.path,
      domainId: isEddsa ? 1 : 0,
      keyVersion,
      mpcSignature
    };
  }

