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
