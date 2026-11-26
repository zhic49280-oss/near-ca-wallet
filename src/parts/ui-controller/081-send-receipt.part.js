  function resetSendTxReceipt() {
    const recEl = $('send-tx-receipt');
    if (recEl) {
      recEl.classList.add('hidden');
      recEl.innerHTML = '';
    }
    $('btn-confirm-send')?.classList.remove('hidden');
  }

  function renderSendTxReceipt({ chain, symbol, amount, recipient, txHash, statusText, activityItem }) {
    const recEl = $('send-tx-receipt');
    if (!recEl) {
      closeAllSheets();
      return;
    }
    const rawUrl = typeof getExplorerTxUrl === 'function' ? getExplorerTxUrl(chain, txHash) : '';
    const explorerUrl = rawUrl && typeof isValidHttpsUrl === 'function' && isValidHttpsUrl(rawUrl) ? rawUrl : '';
    recEl.innerHTML = `
      <div class="meta-row"><span class="meta-key">${t('状态', 'Status')}</span><span class="meta-val text-emerald">✅ ${escapeHtml(statusText)}</span></div>
      <div class="meta-row"><span class="meta-key">${t('数量', 'Amount')}</span><span class="meta-val mono">${escapeHtml(formatBal(amount, 6))} ${escapeHtml(symbol)}</span></div>
      <div class="meta-row"><span class="meta-key">${t('收款地址', 'Recipient')}</span><span class="meta-val mono">${escapeHtml(shortenAddr(recipient))}</span></div>
      <div class="meta-row"><span class="meta-key">${t('交易哈希', 'Transaction ID')}</span><span class="meta-val mono text-emerald">${escapeHtml(shortenAddr(txHash, 10, 8))}</span></div>
      <div class="flex items-center gap-2" style="margin-top:6px;flex-wrap:wrap;">
        <button type="button" id="btn-send-receipt-detail" class="btn-ghost-sm" style="flex:1;">${t('查看详情', 'View Details')}</button>
        ${explorerUrl ? `<a href="${escapeHtml(explorerUrl)}" target="_blank" rel="noopener noreferrer" class="btn-ghost-sm" style="flex:1;text-align:center;text-decoration:none;color:var(--cyan-glow);">${t('区块浏览器 ↗', 'Explorer ↗')}</a>` : ''}
        <button type="button" id="btn-send-receipt-done" class="btn-primary" style="flex:1;padding:6px 12px;font-size:12px;">${t('完成', 'Done')}</button>
      </div>
    `;
    recEl.classList.remove('hidden');
    $('btn-confirm-send')?.classList.add('hidden');
    const detailBtn = $('btn-send-receipt-detail');
    if (detailBtn) detailBtn.onclick = () => { if (typeof openTxDetailSheet === 'function') openTxDetailSheet(activityItem, 'sheet-send'); };
    const doneBtn = $('btn-send-receipt-done');
    if (doneBtn) doneBtn.onclick = () => closeAllSheets();
  }

  function buildSendTxFlowPlan({
    asset,
    exactAmt,
    amountNum,
    recipient,
    isSameChain,
    detectedNet,
    targetEvmChain,
    preDestAsset,
    preQuotedCross,
    gasPlan
  }) {
    const fromChain = String((asset && asset.blockchain) || '').toLowerCase();
    const toChain = isSameChain ? fromChain : String(targetEvmChain || detectedNet || fromChain).toLowerCase();
    const fromName = typeof getTxFlowChainName === 'function' ? getTxFlowChainName(fromChain) : fromChain.toUpperCase();
    const toName = typeof getTxFlowChainName === 'function' ? getTxFlowChainName(toChain) : toChain.toUpperCase();
    const networkPath = isSameChain ? fromName : `${fromName} → ${toName}`;

    const price = (asset && typeof asset.price === 'number' && asset.price > 0)
      ? asset.price
      : (typeof getSymbolPrice === 'function' ? getSymbolPrice(asset && asset.symbol) : 0);
    const usdVal = price > 0 ? Number(amountNum) * price : 0;

    const feeText = (gasPlan && gasPlan.liveGas && gasPlan.liveGas.feeDisplay)
      ? gasPlan.liveGas.feeDisplay
      : t('由网络自动扣除', 'Network auto-calculated');

    const steps = isSameChain
      ? [{ title: t(`从 ${fromName} 转出`, `Send on ${fromName}`), chain: fromChain }]
      : [
          { title: t(`从 ${fromName} 发送 ${asset.symbol}`, `Send ${asset.symbol} from ${fromName}`), chain: fromChain },
          { title: t(`跨链结算至 ${toName}`, `Cross-chain settle to ${toName}`), chain: toChain }
        ];

    const outSym = (preDestAsset && preDestAsset.symbol) || asset.symbol;
    const outAmt = isSameChain
      ? `${exactAmt} ${asset.symbol}`
      : `${typeof formatTxFlowNum === 'function' ? formatTxFlowNum((preQuotedCross && preQuotedCross.amountOutFormatted) || amountNum, 6) : amountNum} ${outSym}`;

    return {
      previewConfig: {
        title: isSameChain ? t('确认转账', 'Confirm Transfer') : t('确认跨链转账', 'Confirm Cross-Chain Transfer'),
        subtitle: `${exactAmt} ${asset.symbol}`,
        payLabel: t('发送数量', 'Send Amount'),
        payAmountText: `${exactAmt} ${asset.symbol}`,
        payUsdText: typeof formatTxFlowUsd === 'function' ? formatTxFlowUsd(usdVal) : '',
        receiveLabel: isSameChain ? t('预计到账', 'Est. Arrival') : t('预计跨链到账', 'Est. Cross-Chain Arrival'),
        receiveAmountText: outAmt,
        recipientText: shortenAddr(recipient),
        networkPath,
        feeText,
        confirmLabel: t('确认发送', 'Confirm Send'),
        steps
      },
      steps
    };
  }
