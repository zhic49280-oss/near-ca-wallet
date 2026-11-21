  function resolveWalletPoolTokenBalance(wallet, pool) {
    if (!wallet || !pool) return 0;
    if (pool.useNativeOrPrecompile) {
      return resolveWalletChainBalance(wallet, pool.chain);
    }
    if (!pool.isTokenStake) {
      return resolveWalletChainBalance(wallet, pool.chain);
    }
    if (pool.chain === 'near' && pool.tokenContract) {
      const nepMap = wallet.nearNep141Balances || wallet.nep141Balances || {};
      const entry = nepMap[pool.tokenContract];
      if (entry && typeof entry.formatted === 'number' && Number.isFinite(entry.formatted)) return entry.formatted;
      if (typeof entry === 'number' && Number.isFinite(entry)) return entry;
      return 0;
    }
    if (pool.chain === 'sol' && (pool.inputMint || pool.tokenContract)) {
      const mintKey = pool.tokenContract || pool.inputMint;
      const v = wallet.splBalances ? wallet.splBalances[mintKey] : null;
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    }
    if (pool.tokenContract && wallet.erc20Balances) {
      const cKey = String(pool.chain).toLowerCase();
      const addrLower = String(pool.tokenContract).toLowerCase();
      const flat = wallet.erc20Balances[`${cKey}_${addrLower}`];
      if (typeof flat === 'number' && Number.isFinite(flat)) return flat;
      const nested = wallet.erc20Balances[cKey]?.[addrLower];
      if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
    }
    return 0;
  }

  async function executeOnChainStaking({
    wallet,
    poolId,
    amount,
    lockDays = 181,
    slippageBps = 50,
    referral = ZERO_ADDRESS,
    tokenBalance = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const pool = findStakingPool(poolId);
    if (!pool) throw new Error(t(`不支持的质押池: ${poolId}`, `Unsupported staking pool: ${poolId}`));

    const resolvedTokenBal = tokenBalance !== null && tokenBalance !== undefined
      ? tokenBalance
      : resolveWalletPoolTokenBalance(wallet, pool);

    let effectiveIsNative = !pool.isTokenStake || Boolean(pool.useNativeOrPrecompile);
    let effectiveTokenBal = resolvedTokenBal;
    if (pool.isBurrowSupply && pool.isNativeWrapSupply) {
      const wnearBal = Number(wallet.nearNep141Balances?.[pool.tokenContract]?.formatted || 0);
      if (wnearBal >= Number(amount)) {
        effectiveIsNative = false;
        effectiveTokenBal = wnearBal;
      } else {
        effectiveIsNative = true;
      }
    }

    validateSufficientChainBalance({
      wallet,
      chain: pool.chain,
      tokenSymbol: pool.inSymbol,
      amount,
      isNative: effectiveIsNative,
      tokenBalance: effectiveIsNative ? null : effectiveTokenBal
    });

    await ensureWalletSigningKeysAsync(wallet);

    // Helper: check explicit NEAR storage_balance_of === null (only when RPC succeeded, never on offline failure)
    const ensureNearStorageIfExplicitlyNull = async (acctId, contractId, depositYoctoStr) => {
      try {
        const res = await nearRpcPostAsync(
          {
            jsonrpc: '2.0',
            id: `${contractId}-storage_balance_of`,
            method: 'query',
            params: {
              request_type: 'call_function',
              finality: 'final',
              account_id: contractId,
              method_name: 'storage_balance_of',
              args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify({ account_id: acctId })))
            }
          },
          4000
        ).catch(() => null);
        const bytes = res && res.result && res.result.result;
        if (Array.isArray(bytes)) {
          const parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
          if (parsed === null) {
            await api.signAndSendNearFunctionCall({
              accountId: acctId,
              publicKeyStr: wallet.nearPublicKey,
              privateKeyStr: wallet.nearPrivateKey,
              receiverId: contractId,
              methodName: 'storage_deposit',
              argsJson: JSON.stringify({ account_id: acctId, registration_only: true }),
              gas: '30000000000000',
              depositYocto: depositYoctoStr
            });
          }
        }
      } catch (_) {}
    };

    // A. NEAR Native Staking & Rhea / Burrow Token Staking/Lending
    if (pool.chain === 'near') {
      const accountId = wallet.nearNamedAccount || wallet.nearAddress;
      if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
        throw new Error(t('NEAR 私钥不可用', 'NEAR private key unavailable'));
      }
      if (pool.isBurrowSupply && pool.isNativeWrapSupply) {
        const nearGasAvail = resolveWalletChainBalance(wallet, 'near');
        if (nearGasAvail < 0.05) {
          throw new Error(t(`NEAR 余额不足以支付合约 Gas (当前: ${nearGasAvail.toFixed(4)} NEAR)`, `Insufficient NEAR for contract gas (Available: ${nearGasAvail.toFixed(4)} NEAR)`));
        }
        const rawAmt = toBaseUnits(amount, pool.decimals || 24);
        let wnearRaw = 0n;
        try {
          const cachedRaw = wallet.nearNep141Balances?.[pool.tokenContract]?.raw;
          if (cachedRaw) wnearRaw = BigInt(String(cachedRaw));
          else {
            const wStr = await viewNearContractCall(pool.tokenContract, 'ft_balance_of', { account_id: accountId });
            if (wStr) wnearRaw = BigInt(String(wStr));
          }
        } catch (_) {}
        const neededBig = BigInt(rawAmt);
        if (wnearRaw < neededBig) {
          const shortfall = (neededBig - wnearRaw).toString();
          await ensureNearStorageIfExplicitlyNull(accountId, pool.tokenContract, '1250000000000000000000');
          await api.signAndSendNearFunctionCall({
            accountId,
            publicKeyStr: wallet.nearPublicKey,
            privateKeyStr: wallet.nearPrivateKey,
            receiverId: pool.tokenContract,
            methodName: 'near_deposit',
            argsJson: '{}',
            gas: '30000000000000',
            depositYocto: shortfall
          });
        }
        await ensureNearStorageIfExplicitlyNull(accountId, pool.contract, '100000000000000000000000');
        const txHash = await api.signAndSendNearFunctionCall({
          accountId,
          publicKeyStr: wallet.nearPublicKey,
          privateKeyStr: wallet.nearPrivateKey,
          receiverId: pool.tokenContract,
          methodName: 'ft_transfer_call',
          argsJson: JSON.stringify({ receiver_id: pool.contract, amount: rawAmt, msg: '' }),
          gas: '100000000000000',
          depositYocto: '1'
        });
        return {
          txHash,
          explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
          poolId: pool.id,
          inSymbol: pool.inSymbol,
          outSymbol: pool.outSymbol,
          amount: Number(amount)
        };
      }
      if (pool.isTokenStake && pool.tokenContract) {
        const nearGasAvail = resolveWalletChainBalance(wallet, 'near');
        const minNearGas = (pool.isBurrowSupply || pool.id === 'rhea_xrhea') ? 0.12 : 0.05;
        if (nearGasAvail < minNearGas) {
          throw new Error(t(`NEAR 余额不足以支付合约 Gas (当前: ${nearGasAvail.toFixed(4)} NEAR)`, `Insufficient NEAR for contract gas (Available: ${nearGasAvail.toFixed(4)} NEAR)`));
        }
        if (pool.isBurrowSupply) {
          await ensureNearStorageIfExplicitlyNull(accountId, pool.contract, '100000000000000000000000');
        }
        const rawAmt = toBaseUnits(amount, pool.decimals || 18);
        const msg = pool.isLockConvert
          ? JSON.stringify({
              Oneshot: {
                lock_period_days: Number(lockDays) || 181,
                source_token_id: pool.tokenContract,
                target_token_id: 'token.rhealab.near'
              }
            })
          : '';
        const txHash = await api.signAndSendNearFunctionCall({
          accountId,
          publicKeyStr: wallet.nearPublicKey,
          privateKeyStr: wallet.nearPrivateKey,
          receiverId: pool.tokenContract,
          methodName: 'ft_transfer_call',
          argsJson: JSON.stringify({ receiver_id: pool.contract, amount: rawAmt, msg }),
          gas: (pool.isLockConvert || pool.isBurrowSupply) ? '100000000000000' : '80000000000000',
          depositYocto: '1'
        });
        return {
          txHash,
          explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
          poolId: pool.id,
          inSymbol: pool.inSymbol,
          outSymbol: pool.outSymbol,
          amount: Number(amount)
        };
      }

      const yocto = toBaseUnits(amount, pool.decimals || 24);
      const txHash = await api.signAndSendNearFunctionCall({
        accountId,
        publicKeyStr: wallet.nearPublicKey,
        privateKeyStr: wallet.nearPrivateKey,
        receiverId: pool.contract,
        methodName: pool.method || 'deposit_and_stake',
        argsJson: '{}',
        gas: '80000000000000',
        depositYocto: yocto
      });
      return {
        txHash,
        explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
        poolId: pool.id,
        inSymbol: pool.inSymbol,
        outSymbol: pool.outSymbol,
        amount: Number(amount)
      };
    }

    // B. Solana Staking (Jupiter DAO Governance JUP->Staked JUP + SOL Liquid Staking LSTs)
    if (pool.chain === 'sol') {
      const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
      if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
        throw new Error(t('NEAR 主账户或 MPC Solana 地址不可用', 'NEAR Master Account or MPC Solana address unavailable'));
      }
      if (pool.isTokenStake) {
        const solGas = resolveWalletChainBalance(wallet, 'sol');
        if (solGas < DEFAULT_GAS_BUFFERS.sol) {
          throw new Error(t(`SOL 余额不足以支付交易费 (当前: ${solGas.toFixed(4)} SOL)`, `Insufficient SOL for gas (Available: ${solGas.toFixed(4)} SOL)`));
        }
      }
      if (pool.isJupiterDao) {
        const ownerStr = wallet.solAddress;
        const voterProgId = pool.contract || 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj';
        const lockerStr = pool.lockerAddress || 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN';
        const jupMintStr = pool.tokenContract || pool.inputMint || 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
        const tokProg = SPL_TOKEN_PROGRAM_ID;
        const ataProg = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
        const sysProg = '11111111111111111111111111111111';
        const rawAmt = toBaseUnits(amount, pool.decimals || 6);

        const escrowPda = await findSolanaPdaAsync(
          [new TextEncoder().encode('Escrow'), base58Decode(lockerStr), base58Decode(ownerStr)],
          base58Decode(voterProgId)
        );
        const escrowTokensPda = await findSolanaPdaAsync(
          [escrowPda.bytes, base58Decode(tokProg), base58Decode(jupMintStr)],
          base58Decode(ataProg)
        );
        const sourceTokensPda = await findSolanaPdaAsync(
          [base58Decode(ownerStr), base58Decode(tokProg), base58Decode(jupMintStr)],
          base58Decode(ataProg)
        );

        const escrowInfo = await callSolanaRpc('getAccountInfo', [escrowPda.address, { encoding: 'base64' }]).catch(() => null);
        const instructions = [];
        if (!escrowInfo || !escrowInfo.value) {
          instructions.push({
            programId: voterProgId,
            keys: [
              { pubkey: lockerStr, isSigner: false, isWritable: true },
              { pubkey: escrowPda.address, isSigner: false, isWritable: true },
              { pubkey: ownerStr, isSigner: true, isWritable: true },
              { pubkey: ownerStr, isSigner: true, isWritable: true },
              { pubkey: sysProg, isSigner: false, isWritable: false }
            ],
            data: hexToBytes('d8b68f0bdc2656b9') // Anchor global:new_escrow
          });
          instructions.push({
            programId: voterProgId,
            keys: [
              { pubkey: lockerStr, isSigner: false, isWritable: true },
              { pubkey: escrowPda.address, isSigner: false, isWritable: true },
              { pubkey: ownerStr, isSigner: true, isWritable: false }
            ],
            data: hexToBytes('a39da184b36b7f8f01') // Anchor global:toggle_max_lock(true)
          });
        }
        instructions.push({
          programId: ataProg,
          keys: [
            { pubkey: ownerStr, isSigner: true, isWritable: true },
            { pubkey: escrowTokensPda.address, isSigner: false, isWritable: true },
            { pubkey: escrowPda.address, isSigner: false, isWritable: false },
            { pubkey: jupMintStr, isSigner: false, isWritable: false },
            { pubkey: sysProg, isSigner: false, isWritable: false },
            { pubkey: tokProg, isSigner: false, isWritable: false }
          ],
          data: new Uint8Array([1]) // AssociatedTokenAccount::CreateIdempotent
        });
        instructions.push({
          programId: voterProgId,
          keys: [
            { pubkey: lockerStr, isSigner: false, isWritable: true },
            { pubkey: escrowPda.address, isSigner: false, isWritable: true },
            { pubkey: escrowTokensPda.address, isSigner: false, isWritable: true },
            { pubkey: ownerStr, isSigner: true, isWritable: false },
            { pubkey: sourceTokensPda.address, isSigner: false, isWritable: true },
            { pubkey: tokProg, isSigner: false, isWritable: false }
          ],
          data: concatUint8Arrays([hexToBytes('05a87635482ecb92'), encodeU64LE(rawAmt)]) // Anchor global:increase_locked_amount
        });

        const res = await buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions });
        return {
          ...res,
          poolId: pool.id,
          inSymbol: pool.inSymbol,
          outSymbol: pool.outSymbol,
          amount: Number(amount)
        };
      }

      const inMint = pool.inputMint || pool.tokenContract || WSOL_MINT;
      const rawAmt = toBaseUnits(amount, pool.decimals || 9);
      const quote = await api.quoteSolanaJupiterSwap({
        inputMint: inMint,
        outputMint: pool.mintOut,
        amountRaw: rawAmt,
        slippageBps,
        platformFeeBps: 0
      });
      const res = await api.executeSolanaJupiterSwap({
        wallet,
        quoteResponse: quote,
        wrapAndUnwrapSol: !pool.isTokenStake,
        tokenBalance: pool.isTokenStake ? resolvedTokenBal : null
      });
      return {
        ...res,
        poolId: pool.id,
        inSymbol: pool.inSymbol,
        outSymbol: pool.outSymbol,
        amount: Number(amount)
      };
    }

    // C. EVM / Arc / HyperEVM Staking
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.evmPrivateKey && !hasNearMpc) {
      throw new Error(t('NEAR 主账户或 MPC EVM 地址不可用', 'NEAR Master Account or MPC EVM address unavailable'));
    }
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const evmSender = resolveWalletEvmSender(wallet, ethersLib);

    const sendEvmContractCall = async ({ chainKey, to, data, value = '0', approvalToken = null, spender = null, approvalAmount = null }) => {
      return wallet.evmPrivateKey
        ? sendEvmSignedTransaction({ chainKey, privateKey: wallet.evmPrivateKey, to, data, value, approvalToken, spender, amountRaw: approvalAmount })
        : sendEvmMpcSignedTransaction({ wallet, chainKey, to, data, value, approvalToken, spender, amountRaw: approvalAmount, path: 'ethereum-1' });
    };

    let res;
    if (pool.isKyberSwapStake) {
      const amountRaw = toBaseUnits(amount, pool.decimals || 18);
      const q = await quoteEvmDexSwap({
        chainKey: pool.chain,
        srcToken: NATIVE_EVM_SENTINEL,
        destToken: pool.contract,
        amountRaw,
        srcDecimals: 18,
        destDecimals: 18,
        slippageBps,
        feeBps: 0
      });
      if (!q || !q.ok) throw new Error((q && q.error) || t('HyperEVM 质押报价失败', 'HyperEVM staking quote failed'));
      res = await executeEvmDexSwap({
        wallet,
        chainKey: pool.chain,
        routeSource: q.routeSource,
        routeData: q.routeData,
        srcToken: NATIVE_EVM_SENTINEL,
        destToken: pool.contract,
        amountRaw,
        srcDecimals: 18,
        slippageBps,
        feeBps: 0
      });
    } else if (pool.isErc4626) {
      if (pool.isTokenStake) {
        const gasBal = resolveWalletChainBalance(wallet, pool.chain);
        const minGas = DEFAULT_GAS_BUFFERS[pool.chain] || 0.002;
        if (gasBal < minGas) {
          throw new Error(t(`${pool.chainLabel} 原生 Gas 不足`, `Insufficient native gas on ${pool.chainLabel}`));
        }
      }
      const rawAssets = toBaseUnits(amount, pool.decimals || 6);
      const iface = new ethersLib.Interface(['function deposit(uint256 assets, address receiver) returns (uint256)']);
      const data = iface.encodeFunctionData('deposit', [rawAssets, evmSender]);
      res = await sendEvmContractCall({
        chainKey: pool.chain,
        to: pool.contract,
        data,
        value: '0',
        approvalToken: pool.tokenContract,
        spender: pool.contract,
        approvalAmount: rawAssets
      });
    } else if (pool.isAaveV3) {
      const gasBal = resolveWalletChainBalance(wallet, pool.chain);
      const minGas = DEFAULT_GAS_BUFFERS[pool.chain] || 0.001;
      if (gasBal < minGas) {
        throw new Error(t(`${pool.chainLabel} ETH Gas 余额不足`, `Insufficient ETH gas on ${pool.chainLabel}`));
      }
      const rawAssets = toBaseUnits(amount, pool.decimals || 6);
      if (pool.isNativeWrapSupply) {
        const addrLower = String(pool.tokenContract || '').toLowerCase();
        const wethBal = Number(
          wallet.erc20Balances?.[`${pool.chain}_${addrLower}`] ??
          wallet.erc20Balances?.[pool.chain]?.[addrLower] ??
          0
        );
        if (wethBal < Number(amount)) {
          const shortfallWei = toBaseUnits(Math.max(0, Number(amount) - Math.max(0, wethBal)), 18);
          if (BigInt(shortfallWei) > 0n) {
            const wrapRes = await sendEvmContractCall({
              chainKey: pool.chain,
              to: pool.tokenContract,
              data: '0xd0e30db0', // WETH9.deposit()
              value: shortfallWei
            });
            if (wrapRes && wrapRes.txHash) {
              await waitForEvmTxConfirmation(pool.chain, wrapRes.txHash, 45000);
            }
          }
        }
      }
      const iface = new ethersLib.Interface(['function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)']);
      const data = iface.encodeFunctionData('supply', [pool.tokenContract, rawAssets, evmSender, 0]);
      res = await sendEvmContractCall({
        chainKey: pool.chain,
        to: pool.contract,
        data,
        value: '0',
        approvalToken: pool.tokenContract,
        spender: pool.contract,
        approvalAmount: rawAssets
      });
    } else {
      // Lido submit(address) payable ETH staking
      const iface = new ethersLib.Interface(['function submit(address _referral) payable returns (uint256)']);
      const data = iface.encodeFunctionData('submit', [referral || ZERO_ADDRESS]);
      const valueWei = toBaseUnits(amount, pool.decimals || 18);
      res = await sendEvmContractCall({
        chainKey: pool.chain,
        to: pool.contract,
        data,
        value: valueWei
      });
    }

    return {
      ...res,
      poolId: pool.id,
      inSymbol: pool.inSymbol,
      outSymbol: pool.outSymbol,
      amount: Number(amount)
    };
  }

  const fetchAllStakingRates = fetchLiveStakingMetrics;
  const executePoolStake = executeOnChainStaking;

