  // ==================== Transaction Preview & Stepper Flow ====================

  let _txFlowResolve = null;
  let _txFlowBackdropBound = false;
  let _txFlowMode = 'closed';

  function isTxFlowBusy() {
    return _txFlowMode === 'stepper';
  }

  const TX_FLOW_CHAIN_NAMES = {
    near: 'NEAR',
    sol: 'Solana',
    eth: 'Ethereum',
    base: 'Base',
    arb: 'Arbitrum',
    op: 'Optimism',
    pol: 'Polygon',
    avax: 'Avalanche',
    bsc: 'BNB Chain',
    btc: 'Bitcoin',
    prl: 'Pearl',
    arc: 'Arc',
    hood: 'Robinhood Chain',
    hype: 'Hyperliquid'
  };

  function getTxFlowChainName(chainKey) {
    const k = String(chainKey || '').toLowerCase();
    return TX_FLOW_CHAIN_NAMES[k] || String(chainKey || '').toUpperCase() || '--';
  }

  function hasTxFlowMountTarget() {
    if (typeof document === 'undefined') return false;
    const sheet = $('sheet-tx-flow');
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    return Boolean(sheet && fw && typeof fw.mountTxFlowModal === 'function');
  }

  function setTxFlowSheetOpen(isOpen) {
    if (typeof document === 'undefined') return;
    const sheet = $('sheet-tx-flow');
    const backdrop = $('tx-flow-backdrop');
    if (backdrop) {
      backdrop.classList.toggle('hidden', !isOpen);
      backdrop.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }
    if (sheet) {
      sheet.classList.toggle('open', isOpen);
      sheet.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    }
  }

  function closeTxFlowModal() {
    _txFlowMode = 'closed';
    if (_txFlowResolve) {
      const pending = _txFlowResolve;
      _txFlowResolve = null;
      try { pending(false); } catch (_) {}
    }
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const sheet = $('sheet-tx-flow');
    setTxFlowSheetOpen(false);
    if (sheet && fw && typeof fw.mountTxFlowModal === 'function') {
      fw.mountTxFlowModal(sheet, { open: false });
    }
  }

  function formatTxFlowUsd(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '';
    return `≈ $${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;
  }

  function formatTxFlowNum(val, maxDec = 6) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return '--';
    if (n >= 1000) return n.toFixed(2);
    if (n >= 1) return Number(n.toFixed(Math.min(4, maxDec))).toString();
    return Number(n.toFixed(maxDec)).toString();
  }

  function buildSwapTxFlowPlan({
    wallet,
    fromToken,
    toToken,
    amtStr,
    quoteData,
    usdInVal,
    usdOutVal,
    isThirdParty,
    recipient,
    slippageBps
  }) {
    const st = getState();
    const intents = getIntents();
    const fromChain = String(fromToken.blockchain || '').toLowerCase();
    const toChain = String(toToken.blockchain || '').toLowerCase();
    const fromChainName = getTxFlowChainName(fromChain);
    const toChainName = getTxFlowChainName(toChain);
    const isSameChain = fromChain === toChain;
    const networkPath = isSameChain ? fromChainName : `${fromChainName} → ${toChainName}`;

    const amtNum = Number(amtStr || 0);
    const outNum = Number(st.swap.amountOut || (quoteData && quoteData.amountOutFormatted) || 0);
    const slipPct = Number(slippageBps || st.swap.slippageBps || 100) / 10000;
    const minOutNum = outNum > 0 ? outNum * Math.max(0, 1 - slipPct) : 0;

    let rateText = '';
    if (amtNum > 0 && outNum > 0) {
      const rate = outNum / amtNum;
      rateText = `1 ${fromToken.symbol} ≈ ${formatTxFlowNum(rate, 6)} ${toToken.symbol}`;
    }

    const accountName = wallet ? (wallet.name || t('主钱包', 'Main Wallet')) : '';
    const rawAddr = wallet ? (getWalletDefaultRecipientForChain(wallet, fromChain) || wallet.nearNamedAccount || wallet.nearAddress || '') : '';
    const accountText = rawAddr ? `${accountName} (${shortenAddr(rawAddr)})` : accountName;

    const impact = quoteData ? computeSwapPriceImpact(usdInVal, usdOutVal) : null;
    const impactText = impact && (impact.level === 'high' || impact.level === 'critical')
      ? `-${impact.pct.toFixed(1)}%`
      : '';

    let feeText = t('由网络自动扣除', 'Network auto-calculated');
    if (quoteData && Number(quoteData.gasCostUsd) > 0) {
      feeText = `≈ $${Number(quoteData.gasCostUsd).toFixed(3)}`;
    } else if (fromChain === 'near') {
      feeText = '< 0.01 NEAR';
    } else if (fromChain === 'sol') {
      feeText = '≈ 0.0005 SOL';
    }

    const compType = String((quoteData && quoteData.compositeType) || '');
    const originIsPrl = typeof isPrlSwapToken === 'function' ? isPrlSwapToken(fromToken) : false;
    const destIsPrl = typeof isPrlSwapToken === 'function' ? isPrlSwapToken(toToken) : false;
    const isDirectPrl = Boolean((originIsPrl !== destIsPrl) && quoteData && isDirectOneClickQuote(quoteData));
    const steps = [];

    if (isSameChain && (!compType || compType === 'PRL_TO_NEAR_DCL')) {
      if (compType === 'PRL_TO_NEAR_DCL') {
        steps.push({ title: t(`${fromToken.symbol} 兑换为 USDC`, `Swap ${fromToken.symbol} to USDC`), chain: fromChain });
        steps.push({ title: t(`USDC 兑换为 ${toToken.symbol}`, `Swap USDC to ${toToken.symbol}`), chain: toChain });
      } else {
        steps.push({ title: t(`兑换 ${fromToken.symbol} → ${toToken.symbol}`, `Swap ${fromToken.symbol} → ${toToken.symbol}`), chain: fromChain });
      }
    } else if (compType === 'SOL_DEX_TO_CROSS_CHAIN') {
      steps.push({ title: t(`在 Solana 将 ${fromToken.symbol} 兑换为 SOL`, `Swap ${fromToken.symbol} to SOL on Solana`), chain: 'sol' });
      steps.push({ title: t(`跨链汇出至 ${toChainName}`, `Cross-chain transfer to ${toChainName}`), chain: 'sol' });
      steps.push({ title: t(`目标链 ${toToken.symbol} 到账`, `Receive ${toToken.symbol} on ${toChainName}`), chain: toChain });
    } else if (compType === 'CROSS_CHAIN_TO_SOL_DEX' || compType === 'CROSS_CHAIN_TO_EVM_DEX') {
      steps.push({ title: t(`从 ${fromChainName} 发起跨链汇出`, `Send cross-chain transfer from ${fromChainName}`), chain: fromChain });
      steps.push({ title: t(`在 ${toChainName} 自动兑换为 ${toToken.symbol}`, `Auto-swap to ${toToken.symbol} on ${toChainName}`), chain: toChain });
    } else if (compType === 'EVM_TO_ARC_MAINNET') {
      steps.push({ title: t(`从 ${fromChainName} 跨链至 Arc`, `Bridge from ${fromChainName} to Arc`), chain: fromChain });
      steps.push({ title: t(`在 Arc 完成 ${toToken.symbol} 到账`, `Settle ${toToken.symbol} on Arc`), chain: 'arc' });
    } else if (compType === 'CROSS_CHAIN_TO_ARC_MAINNET') {
      steps.push({ title: t(`从 ${fromChainName} 跨链转入中转网络`, `Bridge from ${fromChainName} to transit network`), chain: fromChain });
      steps.push({ title: t(`跨链至 Arc 并结算 ${toToken.symbol}`, `Bridge to Arc and settle ${toToken.symbol}`), chain: 'arc' });
    } else if (compType === 'ARC_MAINNET_TO_CROSS_CHAIN') {
      if (quoteData && quoteData.stage1DexQuote) {
        steps.push({ title: t(`在 Arc 将 ${fromToken.symbol} 兑换为 USDC`, `Swap ${fromToken.symbol} to USDC on Arc`), chain: 'arc' });
      }
      steps.push({ title: t('从 Arc 跨链转出', 'Bridge out from Arc'), chain: 'arc' });
      steps.push({ title: t(`目标链 ${toToken.symbol} 到账`, `Receive ${toToken.symbol} on ${toChainName}`), chain: toChain });
    } else if (!isDirectPrl && originIsPrl !== destIsPrl) {
      if (!originIsPrl && destIsPrl && toChain === 'prl' && fromChain === 'near') {
        steps.push({ title: t(`在 NEAR 将 ${fromToken.symbol} 兑换为 PRL`, `Swap ${fromToken.symbol} to PRL on NEAR`), chain: 'near' });
        steps.push({ title: t('跨链汇出至 Pearl 网络', 'Bridge PRL to Pearl network'), chain: 'near' });
      } else if (originIsPrl && !destIsPrl && fromChain === 'near') {
        steps.push({ title: t('在 NEAR 将 PRL 兑换为 USDC', 'Swap PRL to USDC on NEAR'), chain: 'near' });
        steps.push({ title: t(`跨链汇出至 ${toChainName}`, `Cross-chain transfer to ${toChainName}`), chain: 'near' });
      } else {
        steps.push({ title: t(`从 ${fromChainName} 发起跨链汇出`, `Send cross-chain transfer from ${fromChainName}`), chain: fromChain });
        steps.push({ title: t(`自动完成 ${toToken.symbol} 兑换与到账`, `Complete ${toToken.symbol} swap and delivery`), chain: toChain });
      }
    } else {
      steps.push({ title: t(`从 ${fromChainName} 发送 ${fromToken.symbol}`, `Send ${fromToken.symbol} from ${fromChainName}`), chain: fromChain });
      steps.push({ title: t(`跨链结算并在 ${toChainName} 到账 ${toToken.symbol}`, `Cross-chain settle ${toToken.symbol} on ${toChainName}`), chain: toChain });
    }

    const previewConfig = {
      title: t('确认兑换', 'Confirm Swap'),
      subtitle: `${fromToken.symbol} → ${toToken.symbol}`,
      rateText,
      payAmountText: `${amtStr} ${fromToken.symbol}`,
      payUsdText: formatTxFlowUsd(usdInVal),
      receiveAmountText: minOutNum > 0
        ? `${formatTxFlowNum(minOutNum, 6)} ${toToken.symbol}`
        : `${outNum > 0 ? formatTxFlowNum(outNum, 6) : '--'} ${toToken.symbol}`,
      receiveUsdText: formatTxFlowUsd(usdOutVal),
      accountText,
      networkPath,
      feeText,
      slippageText: `${(Number(slippageBps || st.swap.slippageBps || 100) / 100).toFixed(2)}%`,
      recipientText: isThirdParty && recipient ? recipient : '',
      impactText,
      confirmLabel: t('确认兑换', 'Confirm Swap'),
      steps: steps.map((s) => ({ title: s.title, desc: s.desc || '' }))
    };

    return {
      previewConfig,
      steps: steps.map((s) => ({
        title: s.title,
        desc: s.desc || '',
        chain: s.chain || fromChain,
        status: 'pending',
        txHash: '',
        explorerUrl: '',
        error: ''
      }))
    };
  }

  function openTxPreviewModalAsync(previewConfig) {
    if (!hasTxFlowMountTarget()) {
      return Promise.resolve(true);
    }
    if (_txFlowResolve) {
      const prev = _txFlowResolve;
      _txFlowResolve = null;
      prev(false);
    }
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const sheet = $('sheet-tx-flow');
    const backdrop = $('tx-flow-backdrop');

    return new Promise((resolve) => {
      let settled = false;
      _txFlowMode = 'preview';
      const finish = (confirmed) => {
        if (settled) {
          if (!confirmed && _txFlowMode === 'preview') closeTxFlowModal();
          return;
        }
        settled = true;
        _txFlowResolve = null;
        if (!confirmed) {
          closeTxFlowModal();
        }
        resolve(Boolean(confirmed));
      };
      _txFlowResolve = finish;

      if (backdrop && !_txFlowBackdropBound) {
        _txFlowBackdropBound = true;
        backdrop.addEventListener('click', () => {
          if (_txFlowResolve) _txFlowResolve(false);
          else if (_txFlowMode === 'preview') closeTxFlowModal();
        });
      }

      setTxFlowSheetOpen(true);
      fw.mountTxFlowModal(sheet, {
        open: true,
        mode: 'preview',
        preview: previewConfig || {},
        onCancel: () => finish(false),
        onConfirm: () => finish(true)
      });
    });
  }

  function createTxStepperController(titleOrConfig, initialSteps = []) {
    const cfg = (titleOrConfig && typeof titleOrConfig === 'object' && !Array.isArray(titleOrConfig))
      ? titleOrConfig
      : { title: titleOrConfig, steps: initialSteps };
    const title = cfg.title;
    const stepsInput = Array.isArray(cfg.steps) ? cfg.steps : initialSteps;
    if (!hasTxFlowMountTarget()) {
      return {
        setStep() {},
        finish() {},
        close() {}
      };
    }
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    const sheet = $('sheet-tx-flow');
    const state = {
      title: title || t('正在执行交易', 'Executing Transaction'),
      steps: (Array.isArray(stepsInput) ? stepsInput : []).map((s) => ({
        title: s.title || '',
        desc: s.desc || '',
        chain: s.chain || '',
        status: s.status || 'pending',
        txHash: s.txHash || '',
        explorerUrl: s.explorerUrl || '',
        error: s.error || ''
      })),
      finished: false,
      ok: false,
      summary: '',
      resumable: false,
      inTransit: false,
      doneTitle: ''
    };

    const renderStepper = () => {
      _txFlowMode = state.finished ? 'stepper_finished' : 'stepper';
      setTxFlowSheetOpen(true);
      fw.mountTxFlowModal(sheet, {
        open: true,
        mode: 'stepper',
        stepper: {
          title: state.title,
          steps: state.steps.map((s) => ({ ...s })),
          finished: state.finished,
          ok: state.ok,
          summary: state.summary,
          resumable: state.resumable,
          inTransit: state.inTransit,
          doneTitle: state.doneTitle
        },
        onClose: () => closeTxFlowModal()
      });
    };

    renderStepper();

    return {
      setStep(index, status, opts = {}) {
        const idx = Number(index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= state.steps.length) return;
        const step = state.steps[idx];
        step.status = status || step.status;
        if (opts && opts.desc !== undefined) step.desc = String(opts.desc || '');
        if (opts && opts.txHash) {
          step.txHash = String(opts.txHash);
          const chainKey = opts.chain || step.chain;
          if (opts.explorerUrl) {
            step.explorerUrl = String(opts.explorerUrl);
          } else if (chainKey && typeof getExplorerTxUrl === 'function') {
            step.explorerUrl = getExplorerTxUrl(chainKey, step.txHash);
          }
        }
        if (opts && opts.error) {
          step.error = typeof toUserFriendlyError === 'function'
            ? toUserFriendlyError(opts.error, '该步骤执行失败，请稍后重试', 'Step failed. Please try again.')
            : String(opts.error);
        }
        renderStepper();
      },
      finish(ok, summaryOrOpts = '') {
        state.finished = true;
        state.ok = Boolean(ok);
        if (summaryOrOpts && typeof summaryOrOpts === 'object') {
          state.summary = String(summaryOrOpts.text || '');
          state.resumable = Boolean(summaryOrOpts.resumable);
          state.inTransit = Boolean(summaryOrOpts.inTransit);
          state.doneTitle = summaryOrOpts.doneTitle ? String(summaryOrOpts.doneTitle) : '';
        } else {
          state.summary = String(summaryOrOpts || '');
          state.resumable = false;
          state.inTransit = false;
          state.doneTitle = '';
        }
        renderStepper();
      },
      close() {
        closeTxFlowModal();
      }
    };
  }
