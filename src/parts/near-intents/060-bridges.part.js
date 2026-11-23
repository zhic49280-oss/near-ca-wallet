  const RELAY_API_URL = 'https://api.relay.link/quote';
  const LIFI_API_URL = 'https://li.quest/v1';
  const ARC_USDC_CONTRACT = '0x3600000000000000000000000000000000000000';
  const BASE_USDC_1CLICK_ID = 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near';
  const BASE_USDC_EVM = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  const ARC_BRIDGE_EVM_CHAINS = { eth: 1, base: 8453, arb: 42161, bsc: 56, arc: 5042 };

  async function quoteRelayBridge({
    user,
    recipient,
    originChainId,
    destinationChainId,
    originCurrency,
    destinationCurrency,
    amount,
    slippageBps = 100,
    signal = null
  } = {}) {
    try {
      const validU = /^0x[0-9a-fA-F]{40}$/.test(String(user || '')) ? user : '';
      const validR = /^0x[0-9a-fA-F]{40}$/.test(String(recipient || '')) ? recipient : validU;
      const u = validU || validR;
      const r = validR || validU;
      if (!u) {
        return { ok: false, error: t('缺少有效的 EVM 地址', 'Valid EVM address required for Relay bridge quote') };
      }
      const reqBody = {
        user: u,
        recipient: r,
        originChainId: Number(originChainId),
        destinationChainId: Number(destinationChainId),
        originCurrency,
        destinationCurrency,
        amount: String(amount),
        tradeType: 'EXACT_INPUT'
      };
      if (Number.isFinite(Number(slippageBps)) && Number(slippageBps) > 0) {
        reqBody.slippageTolerance = String(Math.round(Number(slippageBps)));
      }
      const resp = await fetchJsonWithTimeout(
        RELAY_API_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
          signal
        },
        DEFAULT_TIMEOUT_MS
      );
      const outObj = resp.data?.details?.currencyOut;
      const inObj = resp.data?.details?.currencyIn;
      if (!resp.ok || !outObj || !outObj.amount || !/^\d+$/.test(String(outObj.amount)) || BigInt(outObj.amount) <= 0n) {
        return { ok: false, error: resp.data?.message || `Relay HTTP ${resp.status}` };
      }
      return {
        ok: true,
        provider: 'Relay',
        amountOut: String(outObj.amount),
        amountOutFormatted: outObj.amountFormatted ? String(outObj.amountFormatted) : null,
        amountInUsd: inObj?.amountUsd ? String(inObj.amountUsd) : null,
        amountOutUsd: outObj.amountUsd ? String(outObj.amountUsd) : null,
        steps: Array.isArray(resp.data?.steps) ? resp.data.steps : [],
        details: resp.data.details
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'Relay quote failed' };
    }
  }

  async function quoteLifiBridge({
    fromChain,
    toChain,
    fromToken,
    toToken,
    fromAmount,
    fromAddress,
    toAddress,
    slippageBps = 100,
    signal = null
  } = {}) {
    try {
      const validFrom = /^0x[0-9a-fA-F]{40}$/.test(String(fromAddress || '')) ? fromAddress : '';
      const validTo = /^0x[0-9a-fA-F]{40}$/.test(String(toAddress || '')) ? toAddress : validFrom;
      const fAddr = validFrom || validTo;
      const tAddr = validTo || validFrom;
      if (!fAddr) {
        return { ok: false, error: t('缺少有效的 EVM 地址', 'Valid EVM address required for LI.FI bridge quote') };
      }
      const slip = ((Number(slippageBps) || 100) / 10000).toFixed(4);
      const url = `${LIFI_API_URL}/quote?fromChain=${encodeURIComponent(fromChain)}&toChain=${encodeURIComponent(toChain)}&fromToken=${encodeURIComponent(fromToken)}&toToken=${encodeURIComponent(toToken)}&fromAmount=${encodeURIComponent(fromAmount)}&fromAddress=${encodeURIComponent(fAddr)}&toAddress=${encodeURIComponent(tAddr)}&slippage=${slip}`;
      const resp = await fetchJsonWithTimeout(url, { signal }, DEFAULT_TIMEOUT_MS);
      const est = resp.data?.estimate;
      if (!resp.ok || !est || !est.toAmount || !/^\d+$/.test(String(est.toAmount)) || BigInt(est.toAmount) <= 0n) {
        return { ok: false, error: resp.data?.message || `LI.FI HTTP ${resp.status}` };
      }
      return {
        ok: true,
        provider: 'LI.FI',
        amountOut: String(est.toAmount),
        amountInUsd: est.fromAmountUSD ? String(est.fromAmountUSD) : null,
        amountOutUsd: est.toAmountUSD ? String(est.toAmountUSD) : null,
        transactionRequest: resp.data.transactionRequest || null,
        estimate: est
      };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : 'LI.FI quote failed' };
    }
  }

