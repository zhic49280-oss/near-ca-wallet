  function createTransferIntent({ receiverId, tokens }) {
    return {
      intent: 'transfer',
      receiver_id: receiverId,
      tokens
    };
  }

  function createTokenDiffIntent({ diff }) {
    return {
      intent: 'token_diff',
      diff
    };
  }

  function createFtWithdrawIntent({ token, receiverId, amount, memo = null }) {
    const action = {
      intent: 'ft_withdraw',
      token,
      receiver_id: receiverId,
      amount: String(amount)
    };
    if (memo) action.memo = memo;
    return action;
  }

  function createNativeWithdrawIntent({ receiverId, amount }) {
    return {
      intent: 'native_withdraw',
      receiver_id: receiverId,
      amount: String(amount)
    };
  }

  const NearCAIntents = {
    NEAR_RPC_URL,
    ONECLICK_API_URL,
    SOLVER_RELAY_URL,
    REF_SMART_ROUTER_URL,
    DCL_CONTRACT_ID,
    NEAR_DCL_POOLS,
    INTENTS_CONTRACT_ID,
    DEFAULT_REFERRAL_ACCOUNT,
    DEFAULT_NEAR_NEP141_CONTRACTS,
    PRL_PEARL_ASSET_ID,
    PRL_NEAR_ASSET_ID,
    PRL_NEAR_CONTRACT,
    QTC_ORIGIN_ASSET_ID,
    QTC_NEAR_ASSET_ID,
    QTC_NEAR_CONTRACT,
    NEAR_USDC_ASSET_ID,
    NEAR_USDC_CONTRACT,
    ARC_USDC_CONTRACT,
    BASE_USDC_1CLICK_ID,
    BASE_USDC_EVM,
    fetchNearNativeBalance,
    fetchNearNep141Balances,
    fetchIntentsUnifiedBalances,
    fetchLiveDefuseTokenPrices,
    seedLivePricesCache,
    searchJupiterTokensV2,
    quoteNearDclPoolSwap,
    requestCrossChainDepositAddress,
    quoteRelayBridge,
    quoteLifiBridge,
    quoteBestNearPairSwap,
    quoteCompositePrlSwap,
    quoteCrossChainWithDexRelay,
  quoteSmartHubRoute,
    quoteIntentSwapOrWithdraw,
    authenticateNearcomConfidentialSession,
    fetchNearcomConfidentialBalances,
    quoteNearcomConfidentialSwap,
    requestNearcomConfidentialDeposit,
    fetchNearcomConfidentialDepositStatus,
    executeNearcomConfidentialSwapAndWithdraw,
    resolveOneClickAssetId,
    signAndPublishNep413Intent,
    fetchSwapOrderStatus,
    submitExternalDepositTxHash,
    createTransferIntent,
    createTokenDiffIntent,
    createFtWithdrawIntent,
    createNativeWithdrawIntent,
    getCachedDefuseTokens: () => _cachedDefuseTokens.slice(),
    toBaseUnits,
    fromBaseUnits
  };

  if (root) {
    root.NearCAIntents = NearCAIntents;
    root.NearCA = root.NearCA || {};
    root.NearCA.intents = NearCAIntents;
  }
  if (typeof window !== 'undefined') {
    window.NearCAIntents = NearCAIntents;
    window.NearCA = window.NearCA || {};
    window.NearCA.intents = NearCAIntents;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NearCAIntents;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
