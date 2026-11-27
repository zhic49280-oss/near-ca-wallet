  // ==================== NEAR Native & MPC v1.signer Execution ====================

  function extractNearEd25519SeedHex(privateKeyStr) {
    const raw = String(privateKeyStr || '').trim();
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return raw.toLowerCase();
    const secretBytes = base58Decode(raw.replace(/^ed25519:/, ''));
    if (secretBytes.length < 32) {
      throw new Error(t('NEAR 私钥格式无效', 'Invalid NEAR private key'));
    }
    return bytesToHex(secretBytes.slice(0, 32));
  }

  function getWalletNearSignerCredentials(wallet) {
    if (!wallet) {
      return { accountId: '', publicKeyStr: '', privateKeyStr: '' };
    }
    const discoveredNamed = Array.isArray(wallet.discoveredNearAccounts)
      ? wallet.discoveredNearAccounts.find((a) => a && !/^[0-9a-f]{64}$/i.test(String(a).trim()))
      : '';
    const accountId = String(wallet.nearNamedAccount || discoveredNamed || wallet.nearAddress || '').trim();
    return {
      accountId,
      publicKeyStr: String(wallet.nearPublicKey || '').trim(),
      privateKeyStr: String(wallet.nearPrivateKey || '').trim()
    };
  }

  async function nearRpcPostAsync(payload, timeoutMs = 8000, signal = null) {
    const now = Date.now();
    const activeUrls = NEAR_RPC_ENDPOINTS.filter((u) => !(_nearRpc429Until[u] > now));
    const ordered = activeUrls.length > 0 ? activeUrls : NEAR_RPC_ENDPOINTS;
    let lastErr = null;
    for (const url of ordered) {
      if (signal && signal.aborted) break;
      try {
        const res = await fetchJsonWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
          },
          timeoutMs
        );
        if (res && typeof res === 'object') {
          if (res.result !== undefined) return res;
          if (res.error !== undefined) {
            const errStr = JSON.stringify(res.error);
            if (/UNKNOWN_ACCOUNT|MethodNotFound|ExecutionError|ContractExecutionError|AccountDoesNotExist|HostError/i.test(errStr)) {
              return res;
            }
            if (/rate|limit|429|timeout|unavailable/i.test(errStr)) {
              _nearRpc429Until[url] = Date.now() + 90_000;
              lastErr = new Error(res.error.message || errStr);
              continue;
            }
            return res;
          }
        }
        _nearRpc429Until[url] = Date.now() + 30_000;
      } catch (err) {
        if (signal && signal.aborted) throw err;
        if (shouldCooldownRpcError(err)) {
          _nearRpc429Until[url] = Date.now() + 90_000;
        }
        lastErr = err;
      }
    }
    throw lastErr || new Error(t('NEAR 网络节点请求失败，请稍后重试', 'NEAR network request failed. Please try again.'));
  }

  function encodeNearPublicKeyBorsh(publicKeyStr) {
    const raw = String(publicKeyStr || '').trim();
    if (raw.startsWith('secp256k1:')) {
      const pubBytes = base58Decode(raw.slice('secp256k1:'.length));
      if (pubBytes.length !== 64) {
        throw new Error(t('公钥格式无效', 'Invalid public key length'));
      }
      return concatUint8Arrays([new Uint8Array([1]), pubBytes]); // KeyType::SECP256K1 = 1
    }
    const pubBytes = base58Decode(raw.replace(/^ed25519:/, ''));
    if (pubBytes.length !== 32) {
      throw new Error(t('公钥格式无效', 'Invalid public key length'));
    }
    return concatUint8Arrays([new Uint8Array([0]), pubBytes]); // KeyType::ED25519 = 0
  }

  function extractNearOutcomeFailure(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.status && result.status.Failure) return JSON.stringify(result.status.Failure);
    const receipts = Array.isArray(result.receipts_outcome) ? result.receipts_outcome : [];
    for (const r of receipts) {
      if (r && r.outcome && r.outcome.status && r.outcome.status.Failure) {
        return JSON.stringify(r.outcome.status.Failure);
      }
    }
    return null;
  }

  async function buildSignAndBroadcastNearActionsWithOutcome({ accountId, publicKeyStr, privateKeyStr, receiverId, actionsBytes, actionCount = 1 }) {
    if (!accountId || !publicKeyStr || !privateKeyStr || !receiverId) {
      throw new Error(t('缺少 NEAR 交易签名参数', 'Missing NEAR transaction signing parameters'));
    }
    const cryptoEngine = getCryptoEngine();
    if (!cryptoEngine || typeof cryptoEngine.ed25519SignAsync !== 'function') {
      throw new Error(t('钱包签名引擎不可用', 'Wallet signing engine unavailable'));
    }

    const akRes = await nearRpcPostAsync(
      {
        jsonrpc: '2.0',
        id: 'ak',
        method: 'query',
        params: {
          request_type: 'view_access_key',
          finality: 'final',
          account_id: accountId,
          public_key: publicKeyStr
        }
      },
      8000
    );

    const formatNearRpcErr = (errObj, fallbackMsg) => {
      if (!errObj) return fallbackMsg;
      const raw = errObj.data !== undefined ? errObj.data : (errObj.message !== undefined ? errObj.message : errObj);
      if (typeof raw === 'string') return raw;
      if (raw && typeof raw === 'object') {
        if (typeof raw.Failure === 'string') return raw.Failure;
        if (raw.TxExecutionError) return JSON.stringify(raw.TxExecutionError);
        try { return JSON.stringify(raw); } catch (_) { return fallbackMsg; }
      }
      return fallbackMsg;
    };

    if (!akRes || akRes.error || !akRes.result || typeof akRes.result.nonce !== 'number') {
      throw new Error(
        formatNearRpcErr(akRes && akRes.error, t('NEAR 账户未激活或访问密钥不存在', 'NEAR account not activated or access key missing'))
      );
    }

    const nonce = BigInt(akRes.result.nonce) + 1n;
    const blockHashBytes = base58Decode(akRes.result.block_hash);
    const pubBorshBytes = encodeNearPublicKeyBorsh(publicKeyStr);

    const txBytes = concatUint8Arrays([
      encodeBorshString(accountId),
      pubBorshBytes,
      encodeU64LE(nonce),
      encodeBorshString(receiverId),
      blockHashBytes,
      encodeU32LE(actionCount),
      actionsBytes
    ]);

    const txHashBytes = await sha256BytesAsync(txBytes);
    const seedHex = extractNearEd25519SeedHex(privateKeyStr);
    const sig = await cryptoEngine.ed25519SignAsync(txHashBytes, seedHex);
    const signedTxBytes = concatUint8Arrays([txBytes, new Uint8Array([0]), sig]);
    const signedB64 = bytesToBase64(signedTxBytes);
    const expectedTxHash = base58Encode(txHashBytes);

    let txRes = null;
    try {
      txRes = await nearRpcPostAsync(
        {
          jsonrpc: '2.0',
          id: 'tx',
          method: 'broadcast_tx_commit',
          params: [signedB64]
        },
        18000
      );
    } catch (broadcastErr) {
      const bMsg = String((broadcastErr && broadcastErr.message) || '');
      const isTimeoutLike =
        (broadcastErr && (broadcastErr.name === 'AbortError' || broadcastErr.status === 408 || broadcastErr.status === 504)) ||
        /timeout|timed out|abort|504|408|network/i.test(bMsg);
      if (isTimeoutLike && expectedTxHash) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const checkRes = await nearRpcPostAsync(
            {
              jsonrpc: '2.0',
              id: `tx-status-${attempt}`,
              method: 'EXPERIMENTAL_tx_status',
              params: [expectedTxHash, accountId]
            },
            6000
          ).catch(() => null);
          const st = checkRes && checkRes.result && checkRes.result.status;
          const isFinal = Boolean(st && (st.SuccessValue !== undefined || st.SuccessReceiptId !== undefined || st.Failure !== undefined));
          if (isFinal) {
            txRes = checkRes;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
      if (!txRes) throw broadcastErr;
    }

    if (!txRes || txRes.error) {
      throw new Error(
        formatNearRpcErr(txRes && txRes.error, t('NEAR 交易广播失败', 'NEAR transaction broadcast failed'))
      );
    }
    const receiptFailure = extractNearOutcomeFailure(txRes.result);
    if (receiptFailure) {
      throw new Error(receiptFailure);
    }
    const status = txRes.result && txRes.result.status;
    const txHash = (txRes.result && txRes.result.transaction && txRes.result.transaction.hash) || expectedTxHash || '';
    const outcome = {
      txHash,
      successValueB64: status && typeof status.SuccessValue === 'string' ? status.SuccessValue : null,
      result: txRes.result
    };
    api._lastNearOutcome = outcome;
    return outcome;
  }

  async function buildSignAndBroadcastNearActions(params = {}) {
    const out = await buildSignAndBroadcastNearActionsWithOutcome(params);
    return out.txHash;
  }

  async function _signAndSendNearFunctionCallWithOutcome({
    accountId,
    publicKeyStr,
    privateKeyStr,
    receiverId,
    methodName,
    argsJson = '{}',
    gas = '50000000000000',
    depositYocto = '0'
  } = {}) {
    if (!methodName) {
      throw new Error(t('缺少合约调用方法名', 'Missing contract method name'));
    }
    const argsBytes = new TextEncoder().encode(typeof argsJson === 'string' ? argsJson : JSON.stringify(argsJson || {}));
    const actionBytes = concatUint8Arrays([
      new Uint8Array([2]), // Action::FunctionCall
      encodeBorshString(methodName),
      encodeU32LE(argsBytes.length),
      argsBytes,
      encodeU64LE(gas),
      encodeU128LE(depositYocto)
    ]);

    return buildSignAndBroadcastNearActionsWithOutcome({
      accountId,
      publicKeyStr,
      privateKeyStr,
      receiverId,
      actionsBytes: actionBytes
    });
  }

  async function signAndSendNearFunctionCall(params = {}) {
    const out = await _signAndSendNearFunctionCallWithOutcome(params);
    return out.txHash;
  }

  async function signAndSendNearActionsBatch({
    accountId,
    publicKeyStr,
    privateKeyStr,
    receiverId,
    actions = [],
    wallet = null
  } = {}) {
    const resolvedWallet = wallet ? await ensureWalletSigningKeysAsync(wallet) : null;
    const creds = getWalletNearSignerCredentials(resolvedWallet);
    const sender = accountId || creds.accountId;
    const pub = publicKeyStr || creds.publicKeyStr;
    const priv = privateKeyStr || creds.privateKeyStr;
    if (!sender || !pub || !priv || !receiverId) {
      throw new Error(t('缺少 NEAR 交易签名参数', 'Missing NEAR transaction signing parameters'));
    }
    const list = Array.isArray(actions) ? actions : [];
    if (!list.length) {
      throw new Error(t('NEAR 交易至少需要一个操作', 'NEAR transaction requires at least one operation'));
    }
    const encodedList = [];
    for (const act of list) {
      const kind = String((act && (act.type || (act.functionCall ? 'FunctionCall' : (act.transfer ? 'Transfer' : (act.addKey ? 'AddKey' : (act.deleteKey ? 'DeleteKey' : (act.deleteAccount ? 'DeleteAccount' : (act.stake ? 'Stake' : '')))))))) || '').toLowerCase();
      const body = (act && (act.params || act.functionCall || act.transfer || act.addKey || act.deleteKey || act.deleteAccount || act.stake || act)) || {};
      if (kind === 'transfer') {
        const yocto = body.deposit !== undefined || body.amountYocto !== undefined
          ? String(body.deposit ?? body.amountYocto ?? '0')
          : toBaseUnits(String(body.amountNear || '0'), 24);
        encodedList.push(concatUint8Arrays([
          new Uint8Array([3]), // Action::Transfer
          encodeU128LE(yocto)
        ]));
      } else if (kind === 'addkey') {
        const newPub = String(body.publicKey || body.newPublicKeyStr || '');
        const accessKey = body.accessKey || {};
        const perm = accessKey.permission;
        if (!perm || perm === 'FullAccess' || perm.fullAccess !== undefined) {
          encodedList.push(buildAddKeyActionBytes({ newPublicKeyStr: newPub, permission: 'FullAccess' }));
        } else {
          const fnPerm = perm.FunctionCall || perm.functionCall || perm;
          const allowanceStr = fnPerm.allowance !== undefined && fnPerm.allowance !== null ? String(fnPerm.allowance) : null;
          const allowanceBytes = allowanceStr !== null && BigInt(allowanceStr) > 0n
            ? concatUint8Arrays([new Uint8Array([1]), encodeU128LE(allowanceStr)])
            : new Uint8Array([0]);
          const recvBytes = encodeBorshString(String(fnPerm.receiverId || fnPerm.receiver_id || receiverId));
          const mNames = Array.isArray(fnPerm.methodNames || fnPerm.method_names) ? (fnPerm.methodNames || fnPerm.method_names) : [];
          const mChunks = [encodeU32LE(mNames.length)];
          for (const m of mNames) mChunks.push(encodeBorshString(String(m)));
          encodedList.push(concatUint8Arrays([
            new Uint8Array([5]), // Action::AddKey
            encodeNearPublicKeyBorsh(newPub),
            encodeU64LE(0n),
            new Uint8Array([0]), // AccessKeyPermission::FunctionCall
            allowanceBytes,
            recvBytes,
            concatUint8Arrays(mChunks)
          ]));
        }
      } else if (kind === 'deletekey') {
        const targetPub = String(body.publicKey || body.targetPublicKeyStr || '');
        encodedList.push(buildDeleteKeyActionBytes({ targetPublicKeyStr: targetPub }));
      } else if (kind === 'deleteaccount') {
        encodedList.push(buildDeleteAccountActionBytes({ beneficiaryId: body.beneficiaryId || body.beneficiary_id }));
      } else if (kind === 'stake') {
        const stakeYocto = String(body.stake || body.deposit || '0');
        const stakePub = String(body.publicKey || pub);
        encodedList.push(concatUint8Arrays([
          new Uint8Array([4]), // Action::Stake
          encodeU128LE(stakeYocto),
          encodeNearPublicKeyBorsh(stakePub)
        ]));
      } else if (kind === 'createaccount') {
        encodedList.push(new Uint8Array([0])); // Action::CreateAccount
      } else {
        const methodName = String(body.methodName || '');
        if (!methodName) {
          throw new Error(t('不支持的交易操作类型', 'Unsupported transaction operation'));
        }
        const argsVal = body.args !== undefined ? body.args : (body.argsJson || '{}');
        const argsBytes = argsVal instanceof Uint8Array
          ? argsVal
          : new TextEncoder().encode(typeof argsVal === 'string' ? argsVal : JSON.stringify(argsVal || {}));
        encodedList.push(concatUint8Arrays([
          new Uint8Array([2]), // Action::FunctionCall
          encodeBorshString(methodName),
          encodeU32LE(argsBytes.length),
          argsBytes,
          encodeU64LE(String(body.gas || '50000000000000')),
          encodeU128LE(String(body.deposit || '0'))
        ]));
      }
    }
    const out = await buildSignAndBroadcastNearActionsWithOutcome({
      accountId: sender,
      publicKeyStr: pub,
      privateKeyStr: priv,
      receiverId,
      actionsBytes: concatUint8Arrays(encodedList),
      actionCount: encodedList.length
    });
    const rawRes = out && out.result && typeof out.result === 'object' ? out.result : {};
    const txObj = rawRes.transaction && typeof rawRes.transaction === 'object' ? rawRes.transaction : {};
    const finalOutcome = {
      ...rawRes,
      status: rawRes.status || { SuccessValue: out.successValueB64 || '' },
      transaction: {
        signer_id: sender,
        receiver_id: receiverId,
        ...txObj,
        hash: txObj.hash || out.txHash || ''
      },
      receipts_outcome: Array.isArray(rawRes.receipts_outcome) ? rawRes.receipts_outcome : []
    };
    return {
      txHash: out.txHash,
      explorerUrl: out.txHash ? `${NEAR_EXPLORER_TX}${out.txHash}` : '',
      successValueB64: out.successValueB64,
      outcome: finalOutcome,
      result: finalOutcome
    };
  }

  async function signAndSendNearTransfer({
    accountId,
    publicKeyStr,
    privateKeyStr,
    receiverId,
    amountNear,
    wallet = null,
    availableBalanceNear = null,
    gasBuffer = null
  } = {}) {
    if (!receiverId) {
      throw new Error(t('缺少 NEAR 收款账户参数', 'Missing NEAR recipient account'));
    }

    if (wallet || (availableBalanceNear !== null && availableBalanceNear !== undefined)) {
      validateSufficientChainBalance({
        wallet: wallet || { nearBalance: availableBalanceNear },
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: amountNear,
        isNative: true,
        gasBuffer
      });
    } else {
      const amt = Number(amountNear);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error(t('请输入有效的 NEAR 转账金额', 'Enter a valid positive NEAR amount'));
      }
    }

    const resolvedWallet = wallet ? await ensureWalletSigningKeysAsync(wallet) : null;
    const creds = getWalletNearSignerCredentials(resolvedWallet);
    const sender = accountId || creds.accountId;
    const pub = publicKeyStr || creds.publicKeyStr;
    const priv = privateKeyStr || creds.privateKeyStr;

    if (!sender || !pub || !priv) {
      throw new Error(t('缺少 NEAR 账户签名凭据', 'Missing NEAR account signing credentials'));
    }

    const yoctoAmount = toBaseUnits(amountNear, 24);
    if (BigInt(yoctoAmount) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    const actionBytes = concatUint8Arrays([
      new Uint8Array([3]), // Action::Transfer
      encodeU128LE(yoctoAmount)
    ]);

    const txHash = await buildSignAndBroadcastNearActions({
      accountId: sender,
      publicKeyStr: pub,
      privateKeyStr: priv,
      receiverId,
      actionsBytes: actionBytes
    });

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`
    };
  }

  async function executeNearNep141Transfer({
    wallet,
    tokenContract,
    receiverId,
    amount,
    decimals = 8,
    tokenSymbol = 'TOKEN',
    tokenBalance = null,
    skipStorageCheck = false
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const contract = String(tokenContract || '').trim();
    const dest = String(receiverId || '').trim().toLowerCase();
    if (!contract) throw new Error(t('缺少 NEAR 代币合约地址', 'Missing NEAR token contract'));
    if (!dest) throw new Error(t('缺少 NEAR 收款账户', 'Missing NEAR recipient account'));

    const cachedBal =
      tokenBalance !== null && tokenBalance !== undefined
        ? tokenBalance
        : (wallet.nearNep141Balances && wallet.nearNep141Balances[contract]
            ? wallet.nearNep141Balances[contract].formatted
            : null);

    if (cachedBal !== null) {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol,
        amount,
        isNative: false,
        tokenBalance: cachedBal
      });
    }

    validateSufficientChainBalance({
      wallet,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: 0.005,
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, 'near')
    });

    const resolvedWallet = await ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    if (!sender || !resolvedWallet.nearPublicKey || !resolvedWallet.nearPrivateKey) {
      throw new Error(t('缺少 NEAR 转账账户签名凭据', 'Missing NEAR signing credentials'));
    }

    if (cachedBal === null) {
      const rawFt = await viewNearContractCall(contract, 'ft_balance_of', { account_id: sender }).catch(() => null);
      if (rawFt === null || rawFt === undefined || !/^\d+$/.test(String(rawFt))) {
        throw new Error(t('暂时无法确认代币余额，请刷新后重试', 'Unable to verify token balance; please refresh and retry'));
      }
      const liveBal = Number(fromBaseUnits(String(rawFt), decimals));
      validateSufficientChainBalance({
        wallet: resolvedWallet,
        chain: 'near',
        tokenSymbol,
        amount,
        isNative: false,
        tokenBalance: liveBal
      });
    }

    const rawAmount = toBaseUnits(amount, decimals);
    if (BigInt(rawAmount) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    if (!skipStorageCheck) {
      let storageDepositAttempted = false;
      try {
        const sbArgs = bytesToBase64(new TextEncoder().encode(JSON.stringify({ account_id: dest })));
        const sbRes = await nearRpcPostAsync(
          {
            jsonrpc: '2.0',
            id: 'storage-check',
            method: 'query',
            params: {
              request_type: 'call_function',
              finality: 'final',
              account_id: contract,
              method_name: 'storage_balance_of',
              args_base64: sbArgs
            }
          },
          6000
        );
        const rawBytes = sbRes && sbRes.result && sbRes.result.result;
        if (Array.isArray(rawBytes)) {
          const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(rawBytes)));
          if (decoded === null) {
            let minStorageYocto = '1250000000000000000000';
            try {
              const bounds = await viewNearContractCall(contract, 'storage_balance_bounds', {}).catch(() => null);
              if (bounds && bounds.min && /^\d+$/.test(String(bounds.min)) && BigInt(String(bounds.min)) > 0n) {
                minStorageYocto = String(bounds.min);
              }
            } catch (_) {}
            const minNearNeeded = Number(fromBaseUnits(minStorageYocto, 24)) + 0.003;
            const curNearBal = resolveWalletChainBalance(wallet, 'near');
            if (curNearBal !== null && curNearBal < minNearNeeded) {
              throw new Error(t(`NEAR 余额不足以支付收款方代币存储押金 (需约 ${minNearNeeded.toFixed(4)} NEAR)`, `Insufficient NEAR for recipient token storage deposit (~${minNearNeeded.toFixed(4)} NEAR)`));
            }
            const creds = getWalletNearSignerCredentials(resolvedWallet);
            storageDepositAttempted = true;
            await api.signAndSendNearFunctionCall({
              accountId: sender,
              publicKeyStr: creds.publicKeyStr,
              privateKeyStr: creds.privateKeyStr,
              receiverId: contract,
              methodName: 'storage_deposit',
              argsJson: JSON.stringify({ account_id: dest, registration_only: true }),
              gas: '30000000000000',
              depositYocto: minStorageYocto
            });
          }
        }
      } catch (storageErr) {
        if (storageDepositAttempted || (storageErr && /Insufficient NEAR|storage/i.test(String(storageErr.message || '')))) {
          throw storageErr;
        }
      }
    }

    const creds = getWalletNearSignerCredentials(resolvedWallet);
    const txHash = await api.signAndSendNearFunctionCall({
      accountId: sender,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: contract,
      methodName: 'ft_transfer',
      argsJson: JSON.stringify({ receiver_id: dest, amount: rawAmount }),
      gas: '30000000000000',
      depositYocto: '1'
    });

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`
    };
  }

