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
    const accountId = String(wallet.nearNamedAccount || wallet.nearAddress || '').trim();
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
    throw lastErr || new Error(t('NEAR RPC 网络请求失败', 'NEAR RPC request failed'));
  }

  function encodeNearPublicKeyBorsh(publicKeyStr) {
    const raw = String(publicKeyStr || '').trim();
    if (raw.startsWith('secp256k1:')) {
      const pubBytes = base58Decode(raw.slice('secp256k1:'.length));
      if (pubBytes.length !== 64) {
        throw new Error(t('secp256k1 公钥长度无效', 'Invalid secp256k1 public key length'));
      }
      return concatUint8Arrays([new Uint8Array([1]), pubBytes]); // KeyType::SECP256K1 = 1
    }
    const pubBytes = base58Decode(raw.replace(/^ed25519:/, ''));
    if (pubBytes.length !== 32) {
      throw new Error(t('Ed25519 公钥长度无效', 'Invalid Ed25519 public key length'));
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
      throw new Error(t('Ed25519 签名引擎不可用', 'NearCACrypto.ed25519SignAsync unavailable'));
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

    if (!akRes || akRes.error || !akRes.result || typeof akRes.result.nonce !== 'number') {
      throw new Error(
        (akRes && akRes.error && (akRes.error.data || akRes.error.message)) ||
          t('NEAR 账户未激活或 AccessKey 不存在', 'NEAR account not activated or AccessKey missing')
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
        (txRes && txRes.error && (txRes.error.data || txRes.error.message)) ||
          t('NEAR 交易广播失败', 'NEAR transaction broadcast failed')
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
      throw new Error(t('缺少合约方法名', 'Missing NEAR contract methodName'));
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
      throw new Error(t('缺少 NEAR 转账账户或收款方参数', 'Missing NEAR transfer account or receiverId'));
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
      throw new Error(t('缺少 NEAR 转账账户或收款方参数', 'Missing NEAR transfer account or receiverId'));
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
    if (!contract) throw new Error(t('缺少 NEAR NEP-141 合约地址', 'Missing NEP-141 token contract'));
    if (!dest) throw new Error(t('缺少 NEAR 收款账户', 'Missing NEAR receiverId'));

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

    const rawAmount = toBaseUnits(amount, decimals);
    if (BigInt(rawAmount) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    if (!skipStorageCheck) {
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
        if (storageErr && /Insufficient NEAR|storage/i.test(String(storageErr.message || ''))) {
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

