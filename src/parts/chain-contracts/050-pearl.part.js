  // ==================== Pearl Network (Taproot UTXO) Execution ====================

  async function pearlBlockbookRequest(apiPath, options = {}) {
    const isNativeCap = Boolean(
      typeof window !== 'undefined' &&
      window.Capacitor &&
      typeof window.Capacitor.isNativePlatform === 'function' &&
      window.Capacitor.isNativePlatform()
    );
    const directUrl = `https://blockbook.pearlresearch.ai${apiPath}`;
    if (isNativeCap && window.Capacitor?.Plugins?.CapacitorHttp?.request) {
      const res = await window.Capacitor.Plugins.CapacitorHttp.request({
        url: directUrl,
        method: options.method || 'GET',
        headers: options.headers || {},
        data: options.body || undefined,
        connectTimeout: 10000,
        readTimeout: 10000
      });
      if (res && res.status >= 200 && res.status < 300) {
        return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      }
      throw new Error((res && res.data && res.data.error) || `Blockbook HTTP ${res ? res.status : 'error'}`);
    }
    const isDevServer =
      !isNativeCap &&
      typeof window !== 'undefined' &&
      window.location &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      Boolean(window.location.port);
    const url = isDevServer ? `/pearl-proxy?path=${encodeURIComponent(apiPath)}` : directUrl;
    try {
      return await fetchJsonWithTimeout(url, options, 10000);
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (!isNativeCap && !isDevServer && ((err && err.name === 'TypeError') || /failed to fetch|networkerror|cors/i.test(msg))) {
        throw new Error(t('浏览器跨域限制无法直连 Pearl 节点，请在原生 App 或本地服务中使用', 'Browser CORS blocked direct Pearl node access; use the native App or local server'));
      }
      throw err;
    }
  }

  function encodeVarInt(n) {
    const v = Number(n);
    if (v < 0xfd) return new Uint8Array([v]);
    if (v <= 0xffff) return new Uint8Array([0xfd, v & 0xff, (v >> 8) & 0xff]);
    return new Uint8Array([0xfe, v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff]);
  }

  function reverseHexBytes(hexStr) {
    const clean = String(hexStr || '').replace(/^0x/i, '');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[out.length - 1 - i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  const PEARL_BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

  function pearlBech32Polymod(values) {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >>> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) {
        if ((b >> i) & 1) chk ^= GEN[i];
      }
    }
    return chk;
  }

  function pearlDecodeBech32V0(address) {
    const lower = String(address || '').trim().toLowerCase();
    const sep = lower.lastIndexOf('1');
    if (sep <= 0 || sep + 7 > lower.length) return null;
    const hrp = lower.slice(0, sep);
    const data = [];
    for (const ch of lower.slice(sep + 1)) {
      const idx = PEARL_BECH32_CHARSET.indexOf(ch);
      if (idx === -1) return null;
      data.push(idx);
    }
    const exp = [];
    for (let i = 0; i < hrp.length; i++) exp.push(hrp.charCodeAt(i) >> 5);
    exp.push(0);
    for (let i = 0; i < hrp.length; i++) exp.push(hrp.charCodeAt(i) & 31);
    if (pearlBech32Polymod(exp.concat(data)) !== 1) return null;
    const vals = data.slice(0, -6);
    if (vals.length < 1 || vals[0] !== 0) return null;
    let acc = 0;
    let bits = 0;
    const out = [];
    for (const v of vals.slice(1)) {
      acc = (acc << 5) | v;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        out.push((acc >> bits) & 0xff);
      }
    }
    if (bits >= 5 || ((acc << (8 - bits)) & 0xff)) return null;
    return { valid: true, hrp, witnessVersion: 0, programBytes: out };
  }

  function pearlOutputScriptPubKey(cryptoEngine, prlAddress) {
    const addr = String(prlAddress || '').trim();
    const decoded = cryptoEngine.decodeBech32m(addr);
    if (decoded && decoded.valid && decoded.hrp === 'prl' && decoded.witnessVersion === 1 && decoded.programBytes && decoded.programBytes.length === 32) {
      const spk = new Uint8Array(34);
      spk[0] = 0x51; // OP_1 (SegWit v1 P2TR)
      spk[1] = 0x20;
      spk.set(Uint8Array.from(decoded.programBytes), 2);
      return spk;
    }
    const v0 = pearlDecodeBech32V0(addr);
    if (v0 && v0.valid && v0.hrp === 'prl' && v0.witnessVersion === 0 && (v0.programBytes.length === 20 || v0.programBytes.length === 32)) {
      const spk = new Uint8Array(2 + v0.programBytes.length);
      spk[0] = 0x00; // OP_0 (SegWit v0 P2WPKH / P2WSH)
      spk[1] = v0.programBytes.length;
      spk.set(Uint8Array.from(v0.programBytes), 2);
      return spk;
    }
    throw new Error(t('Pearl Taproot 地址无效', 'Invalid Pearl Taproot address'));
  }

  function pearlTaprootScriptPubKey(cryptoEngine, prlAddress) {
    const decoded = cryptoEngine.decodeBech32m(String(prlAddress || '').trim());
    if (!decoded || !decoded.valid || decoded.hrp !== 'prl' || decoded.witnessVersion !== 1 || !decoded.programBytes || decoded.programBytes.length !== 32) {
      throw new Error(t('Pearl Taproot 地址无效', 'Invalid Pearl Taproot address'));
    }
    const spk = new Uint8Array(34);
    spk[0] = 0x51; // OP_1 (SegWit v1)
    spk[1] = 0x20; // push 32 bytes
    spk.set(Uint8Array.from(decoded.programBytes), 2);
    return spk;
  }

  function buildSignedPearlTaprootTx({
    fromAddress,
    toAddress,
    amountGrains,
    feeGrains,
    utxos = [],
    tweakedPrivateKeyHex
  }) {
    const cryptoEngine = getCryptoEngine();
    if (!cryptoEngine || typeof cryptoEngine.signSchnorrBip340 !== 'function') {
      throw new Error(t('BIP-340 Schnorr 签名引擎不可用', 'BIP-340 Schnorr signer unavailable'));
    }
    const sendAmt = BigInt(String(amountGrains || '0'));
    const feeAmt = BigInt(String(feeGrains || '0'));
    if (sendAmt <= 0n) throw new Error(t('转账金额必须大于 0', 'Transfer amount must be positive'));

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
      const availPrl = Number(fromBaseUnits(totalIn.toString(), 8));
      const needPrl = Number(fromBaseUnits(needed.toString(), 8));
      throw new Error(`${t('PRL UTXO 可用余额不足', 'Insufficient PRL UTXO balance')} (${availPrl.toFixed(6)} < ${needPrl.toFixed(6)} PRL)`);
    }

    const fromSpk = pearlTaprootScriptPubKey(cryptoEngine, fromAddress);
    const toSpk = pearlOutputScriptPubKey(cryptoEngine, toAddress);
    const changeAmt = totalIn - sendAmt - feeAmt;
    const outputs = [{ value: sendAmt, spk: toSpk }];
    if (changeAmt >= 546n) {
      outputs.push({ value: changeAmt, spk: fromSpk });
    }

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
    const hasChange = changeAmt >= 546n;
    const actualFee = hasChange ? feeAmt : (totalIn - sendAmt);
    return { rawHex, feeGrains: actualFee.toString(), changeGrains: hasChange ? changeAmt.toString() : '0', inputCount: selected.length, outputCount: outputs.length };
  }

  async function executePearlTransfer({ wallet, toAddress, amountPrl, feeDeductMode = 'extra', feePerKbPrl = null, gasBuffer = null } = {}) {
    if (!wallet || !wallet.address) {
      throw new Error(t('Pearl 地址不可用', 'Pearl address unavailable'));
    }
    const destAddr = String(toAddress || '').trim();
    const cryptoEngine = getCryptoEngine();
    if (cryptoEngine) {
      pearlOutputScriptPubKey(cryptoEngine, destAddr);
    }

    const reqAmt = Number(amountPrl);
    if (!Number.isFinite(reqAmt) || reqAmt <= 0) {
      throw new Error(t('请输入有效 PRL 数量', 'Enter a valid PRL amount'));
    }

    const cachedPrl = wallet.nativeBalances && typeof wallet.nativeBalances.prl === 'number'
      ? wallet.nativeBalances.prl
      : (typeof wallet.balance === 'number' ? wallet.balance : null);
    if (cachedPrl !== null) {
      validateSufficientChainBalance({
        wallet,
        chain: 'prl',
        tokenSymbol: 'PRL',
        amount: reqAmt,
        isNative: feeDeductMode !== 'internal',
        tokenBalance: cachedPrl,
        gasBuffer
      });
    }

    await ensureWalletSigningKeysAsync(wallet);
    if (!wallet.tweakedPrivateKeyHex) {
      throw new Error(t('缺少 Pearl Taproot 签名私钥', 'Pearl Taproot signing key unavailable'));
    }

    const overrideFeePerKb = Number(feePerKbPrl);
    const hasFeeOverride = Number.isFinite(overrideFeePerKb) && overrideFeePerKb > 0;
    const [utxos, feeEst] = await Promise.all([
      pearlBlockbookRequest(`/api/v2/utxo/${encodeURIComponent(wallet.address)}?confirmed=false`),
      hasFeeOverride
        ? Promise.resolve({ result: overrideFeePerKb })
        : pearlBlockbookRequest('/api/v2/estimatefee/2').catch(() => null)
    ]);

    if (!Array.isArray(utxos) || utxos.length === 0) {
      throw new Error(t('Pearl 钱包暂无可用 UTXO', 'No spendable PRL UTXOs found'));
    }

    const spendableUtxos = utxos.filter((u) => {
      if (!u || !u.txid || u.vout === undefined) return false;
      try {
        if (BigInt(String(u.value || '0')) <= 0n) return false;
      } catch (_) {
        return false;
      }
      const conf = Number(u.confirmations ?? 0);
      if (u.coinbase && (!Number.isFinite(conf) || conf < 100)) return false;
      return true;
    });

    if (spendableUtxos.length === 0) {
      throw new Error(t('Pearl 钱包暂无可用 UTXO（可能仍在成熟确认中）', 'No spendable PRL UTXOs found (coinbase outputs may still be maturing)'));
    }

    const sortedUtxos = [...spendableUtxos]
      .sort((a, b) => (BigInt(String(b.value)) > BigInt(String(a.value)) ? 1 : -1));

    const resolvedFeePerKb = feeEst && feeEst.result && Number(feeEst.result) > 0 ? Number(feeEst.result) : 0.0066;
    const reqGrainsBig = BigInt(toBaseUnits(String(reqAmt), 8));
    let feeGrainsBig = BigInt(Math.max(10000, Math.ceil((resolvedFeePerKb * 1e8 * (12 + 58 + 2 * 43)) / 1000)));
    for (let pass = 0; pass < 3; pass++) {
      const targetSend = feeDeductMode === 'internal'
        ? (reqGrainsBig > feeGrainsBig ? reqGrainsBig - feeGrainsBig : 0n)
        : reqGrainsBig;
      let acc = 0n;
      let count = 0;
      for (const u of sortedUtxos) {
        acc += BigInt(String(u.value));
        count += 1;
        if (acc >= targetSend + feeGrainsBig) break;
      }
      const hasChange = acc > targetSend + feeGrainsBig && (acc - targetSend - feeGrainsBig) >= 546n;
      const vbytes = 12 + Math.max(1, count) * 58 + (hasChange ? 2 : 1) * 43;
      const nextFee = BigInt(Math.max(10000, Math.ceil((resolvedFeePerKb * 1e8 * vbytes) / 1000)));
      if (nextFee === feeGrainsBig) break;
      feeGrainsBig = nextFee;
    }

    const sendGrainsBig = feeDeductMode === 'internal'
      ? (reqGrainsBig > feeGrainsBig ? reqGrainsBig - feeGrainsBig : 0n)
      : reqGrainsBig;

    if (sendGrainsBig <= 0n) {
      throw new Error(t('转账金额不足以支付矿工费', 'Amount too small to cover miner fee'));
    }

    const built = buildSignedPearlTaprootTx({
      fromAddress: wallet.address,
      toAddress: String(toAddress || '').trim(),
      amountGrains: sendGrainsBig.toString(),
      feeGrains: feeGrainsBig.toString(),
      utxos: spendableUtxos,
      tweakedPrivateKeyHex: wallet.tweakedPrivateKeyHex
    });

    const broadcastRes = await pearlBlockbookRequest('/api/v2/sendtx/', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: built.rawHex
    });

    if (!broadcastRes || !broadcastRes.result) {
      throw new Error((broadcastRes && broadcastRes.error) || t('Pearl 交易广播失败', 'Pearl transaction broadcast failed'));
    }

    return {
      ok: true,
      txHash: broadcastRes.result,
      amountPrl: Number(fromBaseUnits(sendGrainsBig.toString(), 8)),
      feePrl: Number(fromBaseUnits(built.feeGrains, 8))
    };
  }

  async function fetchPearlNativeBalance(prlAddress) {
    const addr = String(prlAddress || '').trim();
    if (!addr) return null;
    try {
      const data = await pearlBlockbookRequest(`/api/v2/address/${encodeURIComponent(addr)}`);
      if (!data || (data.balance === undefined && data.unconfirmedBalance === undefined)) return null;
      const confBig = BigInt(String(data.balance || '0'));
      const unconfBig = BigInt(String(data.unconfirmedBalance || '0'));
      const totalBig = confBig + unconfBig > 0n ? confBig + unconfBig : 0n;
      const absUnconf = unconfBig < 0n ? -unconfBig : unconfBig;
      return {
        raw: totalBig.toString(),
        formatted: Number(fromBaseUnits(totalBig.toString(), 8)),
        confirmedRaw: confBig.toString(),
        confirmedFormatted: Number(fromBaseUnits(confBig.toString(), 8)),
        unconfirmedRaw: unconfBig.toString(),
        unconfirmedFormatted: Number(fromBaseUnits(absUnconf.toString(), 8)) * (unconfBig < 0n ? -1 : 1)
      };
    } catch (_) {
      return null;
    }
  }

