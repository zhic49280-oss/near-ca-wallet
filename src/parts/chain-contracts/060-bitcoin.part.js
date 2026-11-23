  // ==================== Bitcoin Mainnet BIP-86 Self-Custody (bc1p) ====================

  const BTC_API_BASES = [
    'https://mempool.space/api',
    'https://blockstream.info/api'
  ];
  const _btcApiCooldownUntil = {};

  function bitcoinTaprootScriptPubKey(cryptoEngine, btcAddress) {
    const decoded = cryptoEngine.decodeBech32m(String(btcAddress || '').trim());
    if (!decoded || !decoded.valid || decoded.hrp !== 'bc' || decoded.witnessVersion !== 1 || !decoded.programBytes || decoded.programBytes.length !== 32) {
      throw new Error(t('Bitcoin Taproot 地址无效', 'Invalid Bitcoin Taproot address'));
    }
    const spk = new Uint8Array(34);
    spk[0] = 0x51;
    spk[1] = 0x20;
    spk.set(Uint8Array.from(decoded.programBytes), 2);
    return spk;
  }

  function bitcoinOutputScriptPubKey(cryptoEngine, btcAddress) {
    const addr = String(btcAddress || '').trim();
    if (!addr) throw new Error(t('Bitcoin 收款地址不能为空', 'Bitcoin recipient address required'));
    const bech32m = cryptoEngine.decodeBech32m(addr);
    if (bech32m && bech32m.valid && bech32m.hrp === 'bc' && bech32m.witnessVersion === 1 && bech32m.programBytes && bech32m.programBytes.length === 32) {
      const spk = new Uint8Array(34);
      spk[0] = 0x51;
      spk[1] = 0x20;
      spk.set(Uint8Array.from(bech32m.programBytes), 2);
      return spk;
    }
    const bech32v0 = cryptoEngine.decodeBech32(addr);
    if (bech32v0 && bech32v0.valid && bech32v0.hrp === 'bc' && bech32v0.witnessVersion === 0 && (bech32v0.programBytes.length === 20 || bech32v0.programBytes.length === 32)) {
      const spk = new Uint8Array(2 + bech32v0.programBytes.length);
      spk[0] = 0x00;
      spk[1] = bech32v0.programBytes.length;
      spk.set(Uint8Array.from(bech32v0.programBytes), 2);
      return spk;
    }
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(addr) && typeof cryptoEngine.base58CheckDecode === 'function') {
      try {
        const payload = cryptoEngine.base58CheckDecode(addr);
        if (payload && payload.length === 21) {
          if (payload[0] === 0x00) {
            // P2PKH: OP_DUP OP_HASH160 PUSH20 <hash160> OP_EQUALVERIFY OP_CHECKSIG
            return concatUint8Arrays([new Uint8Array([0x76, 0xa9, 0x14]), payload.slice(1), new Uint8Array([0x88, 0xac])]);
          }
          if (payload[0] === 0x05) {
            // P2SH: OP_HASH160 PUSH20 <hash160> OP_EQUAL
            return concatUint8Arrays([new Uint8Array([0xa9, 0x14]), payload.slice(1), new Uint8Array([0x87])]);
          }
        }
      } catch (_) {}
    }
    throw new Error(t('不支持或无效的 Bitcoin 收款地址', 'Invalid or unsupported Bitcoin address'));
  }

  function buildSignedBitcoinTaprootTx({
    fromAddress,
    toAddress,
    amountSats,
    feeSats,
    utxos = [],
    tweakedPrivateKeyHex
  }) {
    const cryptoEngine = getCryptoEngine();
    if (!cryptoEngine || typeof cryptoEngine.signSchnorrBip340 !== 'function') {
      throw new Error(t('BIP-340 Schnorr 签名引擎不可用', 'BIP-340 Schnorr signer unavailable'));
    }
    const sendAmt = BigInt(String(amountSats || '0'));
    const feeAmt = BigInt(String(feeSats || '0'));
    if (sendAmt < 546n) {
      throw new Error(t('BTC 转账金额不能低于粉尘阈值 (546 sats)', 'BTC transfer amount must be at least 546 sats (dust limit)'));
    }
    if (feeAmt <= 0n) {
      throw new Error(t('BTC 矿工费必须大于 0 sats', 'BTC miner fee must be positive'));
    }

    const sortedUtxos = [...utxos]
      .filter((u) => u && u.txid && u.vout !== undefined && BigInt(String(u.value || '0')) > 0n)
      .sort((a, b) => (BigInt(String(b.value)) > BigInt(String(a.value)) ? 1 : -1));

    const selected = [];
    let totalIn = 0n;
    const needed = sendAmt + feeAmt;
    for (const u of sortedUtxos) {
      selected.push(u);
      totalIn += BigInt(String(u.value));
      if (totalIn >= needed) break;
    }
    if (totalIn < needed) {
      const availBtc = Number(fromBaseUnits(totalIn.toString(), 8));
      const needBtc = Number(fromBaseUnits(needed.toString(), 8));
      throw new Error(`${t('BTC UTXO 可用余额不足', 'Insufficient BTC UTXO balance')} (${availBtc.toFixed(8)} < ${needBtc.toFixed(8)} BTC)`);
    }

    const fromSpk = bitcoinTaprootScriptPubKey(cryptoEngine, fromAddress);
    const fromXOnly = fromSpk.slice(2, 34);
    const toSpk = bitcoinOutputScriptPubKey(cryptoEngine, toAddress);
    const changeAmt = totalIn - sendAmt - feeAmt;
    const hasChange = changeAmt >= 546n;
    const outputs = [{ value: sendAmt, spk: toSpk }];
    if (hasChange) {
      outputs.push({ value: changeAmt, spk: fromSpk });
    }
    const actualFee = totalIn - sendAmt - (hasChange ? changeAmt : 0n);

    const versionBytes = encodeU32LE(2);
    const locktimeBytes = encodeU32LE(0);
    const seqBytes = new Uint8Array([0xfd, 0xff, 0xff, 0xff]); // RBF 0xfffffffd

    const prevoutsBuf = concatUint8Arrays(selected.map((u) => concatUint8Arrays([reverseHexBytes(u.txid), encodeU32LE(u.vout)])));
    const amountsBuf = concatUint8Arrays(selected.map((u) => encodeU64LE(String(u.value))));
    const spksBuf = concatUint8Arrays(selected.map(() => concatUint8Arrays([encodeVarInt(fromSpk.length), fromSpk])));
    const seqsBuf = concatUint8Arrays(selected.map(() => seqBytes));
    const outsBuf = concatUint8Arrays(outputs.map((o) => concatUint8Arrays([encodeU64LE(o.value.toString()), encodeVarInt(o.spk.length), o.spk])));

    const shaPrevouts = cryptoEngine.sha256Bytes(prevoutsBuf);
    const shaAmounts = cryptoEngine.sha256Bytes(amountsBuf);
    const shaSpks = cryptoEngine.sha256Bytes(spksBuf);
    const shaSeqs = cryptoEngine.sha256Bytes(seqsBuf);
    const shaOuts = cryptoEngine.sha256Bytes(outsBuf);

    const witnesses = [];
    for (let i = 0; i < selected.length; i++) {
      const sigMsg = concatUint8Arrays([
        new Uint8Array([0x00]), // epoch
        new Uint8Array([0x00]), // SIGHASH_DEFAULT
        versionBytes,
        locktimeBytes,
        shaPrevouts,
        shaAmounts,
        shaSpks,
        shaSeqs,
        shaOuts,
        new Uint8Array([0x00]), // spend_type (key-path, no annex)
        encodeU32LE(i)
      ]);
      const sighash = cryptoEngine.taggedHash('TapSighash', sigMsg);
      const sig64 = cryptoEngine.signSchnorrBip340(sighash, tweakedPrivateKeyHex);
      if (typeof cryptoEngine.verifySchnorrBip340 === 'function') {
        if (!cryptoEngine.verifySchnorrBip340(sig64, sighash, fromXOnly)) {
          throw new Error(t('Bitcoin Taproot 本地签名自检失败', 'Bitcoin Taproot local Schnorr signature verification failed'));
        }
      }
      witnesses.push(concatUint8Arrays([new Uint8Array([0x01, 0x40]), sig64]));
    }

    const rawBytes = concatUint8Arrays([
      versionBytes,
      new Uint8Array([0x00, 0x01]), // SegWit marker & flag
      encodeVarInt(selected.length),
      ...selected.map((u) => concatUint8Arrays([reverseHexBytes(u.txid), encodeU32LE(u.vout), new Uint8Array([0x00]), seqBytes])),
      encodeVarInt(outputs.length),
      ...outputs.map((o) => concatUint8Arrays([encodeU64LE(o.value.toString()), encodeVarInt(o.spk.length), o.spk])),
      ...witnesses,
      locktimeBytes
    ]);

    const rawHex = Array.from(rawBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    return {
      rawHex,
      feeSats: actualFee.toString(),
      changeSats: hasChange ? changeAmt.toString() : '0',
      inputCount: selected.length,
      outputCount: outputs.length
    };
  }

  async function btcApiRequestJson(apiPath, options = {}, timeoutMs = 8000) {
    const isNativeCap = Boolean(
      typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
    const now = Date.now();
    let candidates = BTC_API_BASES.filter((b) => !(_btcApiCooldownUntil[b] > now));
    if (candidates.length === 0) candidates = [...BTC_API_BASES];

    let lastErr = null;
    for (const base of candidates) {
      const fullUrl = `${base}${apiPath}`;
      try {
        if (isNativeCap && window.Capacitor?.Plugins?.CapacitorHttp?.request) {
          const res = await window.Capacitor.Plugins.CapacitorHttp.request({
            url: fullUrl,
            method: options.method || 'GET',
            headers: options.headers || {},
            data: options.body || undefined,
            connectTimeout: timeoutMs,
            readTimeout: timeoutMs
          });
          if (res && res.status >= 200 && res.status < 300) {
            return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
          }
          if (res && (res.status === 429 || res.status >= 500)) {
            _btcApiCooldownUntil[base] = Date.now() + 60_000;
          }
          throw new Error(`BTC API HTTP ${res ? res.status : 'error'}`);
        }
        return await fetchJsonWithTimeout(fullUrl, options, timeoutMs);
      } catch (err) {
        lastErr = err;
        if (shouldCooldownRpcError(err)) {
          _btcApiCooldownUntil[base] = Date.now() + 90_000;
        }
      }
    }
    throw lastErr || new Error(t('Bitcoin 节点请求失败', 'Bitcoin API request failed'));
  }

  async function btcBroadcastRawTx(rawHex, timeoutMs = 10000) {
    const isNativeCap = Boolean(
      typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
    const fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    const now = Date.now();
    let bases = BTC_API_BASES.filter((b) => !(_btcApiCooldownUntil[b] > now));
    if (bases.length === 0) bases = [...BTC_API_BASES];
    let lastErr = null;
    for (const base of bases) {
      const fullUrl = `${base}/tx`;
      try {
        if (isNativeCap && window.Capacitor?.Plugins?.CapacitorHttp?.request) {
          const res = await window.Capacitor.Plugins.CapacitorHttp.request({
            url: fullUrl,
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            data: rawHex,
            connectTimeout: timeoutMs,
            readTimeout: timeoutMs
          });
          const bodyStr = typeof res?.data === 'string' ? res.data.trim() : String(res?.data || '');
          if (res && res.status >= 200 && res.status < 300 && /^[0-9a-fA-F]{64}$/.test(bodyStr)) {
            return bodyStr;
          }
          const err = new Error(bodyStr || `BTC broadcast HTTP ${res ? res.status : 'error'}`);
          err.status = res ? res.status : 0;
          if (err.status === 400) throw Object.assign(err, { isConsensusReject: true });
          throw err;
        }
        if (!fetchFn) throw new Error('fetch unavailable');
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
        try {
          const res = await fetchFn(fullUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: rawHex,
            signal: ctrl ? ctrl.signal : undefined
          });
          const text = typeof res.text === 'function' ? (await res.text()).trim() : '';
          if (res.ok && /^[0-9a-fA-F]{64}$/.test(text)) {
            return text;
          }
          const err = new Error(text || `BTC broadcast HTTP ${res.status}`);
          err.status = res.status;
          if (res.status === 400) err.isConsensusReject = true;
          throw err;
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch (err) {
        if (err && err.isConsensusReject) throw err;
        if (shouldCooldownRpcError(err)) _btcApiCooldownUntil[base] = Date.now() + 90_000;
        lastErr = err;
      }
    }
    throw lastErr || new Error(t('Bitcoin 交易广播失败', 'Bitcoin transaction broadcast failed'));
  }

  async function fetchBitcoinNativeBalance(btcAddress) {
    const addr = String(btcAddress || '').trim();
    if (!addr) return null;
    try {
      const data = await btcApiRequestJson(`/address/${encodeURIComponent(addr)}`, {}, 8000);
      const cs = data && data.chain_stats;
      const ms = data && data.mempool_stats;
      if (!cs) return null;
      const confSats = BigInt(String(cs.funded_txo_sum || 0)) - BigInt(String(cs.spent_txo_sum || 0));
      const mempoolDelta = ms
        ? (BigInt(String(ms.funded_txo_sum || 0)) - BigInt(String(ms.spent_txo_sum || 0)))
        : 0n;
      const totalSats = confSats + mempoolDelta > 0n ? confSats + mempoolDelta : 0n;
      return {
        raw: totalSats.toString(),
        formatted: Number(fromBaseUnits(totalSats.toString(), 8)),
        confirmedRaw: confSats.toString(),
        confirmedFormatted: Number(fromBaseUnits((confSats > 0n ? confSats : 0n).toString(), 8)),
        mempoolDeltaSats: mempoolDelta.toString()
      };
    } catch (_) {
      return null;
    }
  }

  async function executeBitcoinTransfer({ wallet, toAddress, amountBtc, feeDeductMode = 'extra', feeRateSatVb = null, gasBuffer = null } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const destAddr = String(toAddress || '').trim();
    const cryptoEngine = getCryptoEngine();
    if (cryptoEngine && typeof cryptoEngine.validateChainAddress === 'function') {
      const chk = cryptoEngine.validateChainAddress('btc', destAddr);
      if (!chk || !chk.valid) {
        throw new Error(t('Bitcoin 收款地址无效', 'Invalid Bitcoin recipient address'));
      }
    }

    const reqAmt = Number(amountBtc);
    if (!Number.isFinite(reqAmt) || reqAmt <= 0) {
      throw new Error(t('请输入有效 BTC 数量', 'Enter a valid BTC amount'));
    }
    const cachedBtc = wallet.nativeBalances && typeof wallet.nativeBalances.btc === 'number'
      ? wallet.nativeBalances.btc
      : (typeof wallet.btcBalance === 'number' ? wallet.btcBalance : null);
    if (cachedBtc !== null) {
      validateSufficientChainBalance({
        wallet,
        chain: 'btc',
        tokenSymbol: 'BTC',
        amount: reqAmt,
        isNative: feeDeductMode !== 'internal',
        tokenBalance: cachedBtc,
        gasBuffer
      });
    }

    await ensureWalletSigningKeysAsync(wallet);
    if (!wallet.btcAddress || !wallet.btcTweakedPrivateKeyHex) {
      throw new Error(t('Bitcoin Taproot 自托管密钥不可用', 'Bitcoin Taproot self-custody key unavailable'));
    }

    const [utxos, mempoolFees, blockstreamFees] = await Promise.all([
      btcApiRequestJson(`/address/${encodeURIComponent(wallet.btcAddress)}/utxo`, {}, 8000),
      feeRateSatVb ? Promise.resolve(null) : btcApiRequestJson('/v1/fees/recommended', {}, 5000).catch(() => fetchJsonWithTimeout('https://mempool.space/api/v1/fees/recommended', {}, 5000).catch(() => null)),
      feeRateSatVb ? Promise.resolve(null) : fetchJsonWithTimeout('https://blockstream.info/api/fee-estimates', {}, 5000).catch(() => null)
    ]);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      throw new Error(t('Bitcoin 钱包暂无可用 UTXO', 'No spendable BTC UTXOs found'));
    }

    const spendableUtxos = utxos.filter((u) => {
      if (!u || !u.txid || u.vout === undefined) return false;
      if (u.coinbase || (u.status && u.status.coinbase)) {
        const confs = Number(u.confirmations);
        if (!Number.isFinite(confs) || confs < 100) return false;
      }
      try {
        return BigInt(String(u.value || '0')) > 0n;
      } catch (_) {
        return false;
      }
    });
    if (spendableUtxos.length === 0) {
      throw new Error(t('Bitcoin 钱包暂无可用 UTXO', 'No spendable BTC UTXOs found'));
    }

    let satPerVbyte = Number(feeRateSatVb);
    if (!Number.isFinite(satPerVbyte) || satPerVbyte <= 0) {
      if (mempoolFees && Number(mempoolFees.halfHourFee || mempoolFees.fastestFee) > 0) {
        satPerVbyte = Math.ceil(Number(mempoolFees.halfHourFee || mempoolFees.fastestFee));
      } else if (blockstreamFees && Number(blockstreamFees['2'] || blockstreamFees['3'] || blockstreamFees['1']) > 0) {
        satPerVbyte = Math.ceil(Number(blockstreamFees['2'] || blockstreamFees['3'] || blockstreamFees['1']));
      }
    }
    if (!Number.isFinite(satPerVbyte) || satPerVbyte <= 0) {
      throw new Error(t('无法获取实时 Bitcoin 网络费率，请稍后重试', 'Failed to fetch live Bitcoin fee rate'));
    }
    satPerVbyte = Math.max(1, satPerVbyte);

    const sortedUtxos = [...spendableUtxos].sort((a, b) => (BigInt(String(b.value)) > BigInt(String(a.value)) ? 1 : -1));
    const reqSatsBig = BigInt(toBaseUnits(String(reqAmt), 8));
    let feeSatsBig = BigInt(Math.ceil((12 + 58 + 2 * 43) * satPerVbyte));
    for (let pass = 0; pass < 3; pass++) {
      const targetSend = feeDeductMode === 'internal'
        ? (reqSatsBig > feeSatsBig ? reqSatsBig - feeSatsBig : 0n)
        : reqSatsBig;
      let acc = 0n;
      let count = 0;
      for (const u of sortedUtxos) {
        acc += BigInt(String(u.value));
        count += 1;
        if (acc >= targetSend + feeSatsBig) break;
      }
      const hasChange = acc > targetSend + feeSatsBig && (acc - targetSend - feeSatsBig) >= 546n;
      const vbytes = 12 + Math.max(1, count) * 58 + (hasChange ? 2 : 1) * 43;
      const nextFee = BigInt(Math.max(150, Math.ceil(vbytes * satPerVbyte)));
      if (nextFee === feeSatsBig) break;
      feeSatsBig = nextFee;
    }

    const sendSatsBig = feeDeductMode === 'internal'
      ? (reqSatsBig > feeSatsBig ? reqSatsBig - feeSatsBig : 0n)
      : reqSatsBig;
    if (sendSatsBig < 546n) {
      throw new Error(t('转账金额扣除矿工费后低于粉尘阈值 (546 sats)', 'Amount after miner fee is below 546 sats dust limit'));
    }

    const built = buildSignedBitcoinTaprootTx({
      fromAddress: wallet.btcAddress,
      toAddress: String(toAddress || '').trim(),
      amountSats: sendSatsBig.toString(),
      feeSats: feeSatsBig.toString(),
      utxos: spendableUtxos,
      tweakedPrivateKeyHex: wallet.btcTweakedPrivateKeyHex
    });

    const txHash = await btcBroadcastRawTx(built.rawHex, 10000);
    return {
      ok: true,
      txHash,
      explorerUrl: `https://mempool.space/tx/${txHash}`,
      amountBtc: Number(fromBaseUnits(sendSatsBig.toString(), 8)),
      feeBtc: Number(fromBaseUnits(built.feeSats, 8)),
      feeRateSatVb: satPerVbyte
    };
  }

