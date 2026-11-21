  const UNIFIED_CORE_TOKENS = [
    {
      symbol: 'NEAR',
      name: 'NEAR Protocol',
      blockchain: 'near',
      assetId: 'nep141:wrap.near',
      contractAddress: 'wrap.near',
      decimals: 24,
      networkName: 'NEAR Protocol',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'near',
      assetId: 'nep141:usdt.tether-token.near',
      contractAddress: 'usdt.tether-token.near',
      decimals: 6,
      networkName: 'NEAR Protocol',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'near',
      assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
      decimals: 6,
      networkName: 'NEAR Protocol',
      price: null
    },
    {
      symbol: 'PRL',
      name: 'Pearl Network',
      blockchain: 'prl',
      assetId: 'nep141:prl.omft.near',
      contractAddress: 'prl.omft.near',
      decimals: 8,
      networkName: 'Pearl Network',
      price: null
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      blockchain: 'eth',
      assetId: 'nep141:eth.omft.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      blockchain: 'eth',
      assetId: 'nep141:eth-0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.omft.near',
      contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      decimals: 18,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'eth',
      assetId: 'nep141:eth-0xdac17f958d2ee523a2206206994597c13d831ec7.omft.near',
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      decimals: 6,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'eth',
      assetId: 'nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near',
      contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      decimals: 6,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'DAI',
      name: 'Dai Stablecoin',
      blockchain: 'eth',
      assetId: 'nep141:eth-0x6b175474e89094c44da98b954eedeac495271d0f.omft.near',
      contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
      decimals: 18,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'cbBTC',
      name: 'Coinbase Wrapped BTC',
      blockchain: 'eth',
      assetId: 'nep141:eth-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near',
      contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
      decimals: 8,
      networkName: 'Ethereum',
      price: null
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      blockchain: 'sol',
      assetId: 'nep141:sol.omft.near',
      contractAddress: 'So11111111111111111111111111111111111111112',
      decimals: 9,
      networkName: 'Solana',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'sol',
      assetId: 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near',
      contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      networkName: 'Solana',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'sol',
      assetId: 'nep141:sol-c800a4bd850783ccb82c2b2c7e84175443606352.omft.near',
      contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      decimals: 6,
      networkName: 'Solana',
      price: null
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      blockchain: 'btc',
      assetId: 'nep141:btc.omft.near',
      contractAddress: '',
      decimals: 8,
      networkName: 'Bitcoin',
      price: null
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      blockchain: 'base',
      assetId: 'nep141:base.omft.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'Base',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'base',
      assetId: 'nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near',
      contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      networkName: 'Base',
      price: null
    },
    {
      symbol: 'cbBTC',
      name: 'Coinbase Wrapped BTC',
      blockchain: 'base',
      assetId: 'nep141:base-0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.omft.near',
      contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
      decimals: 8,
      networkName: 'Base',
      price: null
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      blockchain: 'arb',
      assetId: 'nep141:arb.omft.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'Arbitrum',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'arb',
      assetId: 'nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near',
      contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      decimals: 6,
      networkName: 'Arbitrum',
      price: null
    },
    {
      symbol: 'ARB',
      name: 'Arbitrum',
      blockchain: 'arb',
      assetId: 'nep141:arb-0x912ce59144191c1204e64559fe8253a0e49e6548.omft.near',
      contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
      decimals: 18,
      networkName: 'Arbitrum',
      price: null
    },
    {
      symbol: 'BNB',
      name: 'BNB',
      blockchain: 'bsc',
      assetId: 'nep141:bnb.omdep.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'BNB Smart Chain',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'bsc',
      assetId: 'nep141:bnb-0x55d398326f99059ff775485246999027b3197955.omdep.near',
      contractAddress: '0x55d398326f99059fF775485246999027B3197955',
      decimals: 18,
      networkName: 'BNB Smart Chain',
      price: null
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      blockchain: 'bsc',
      assetId: 'nep141:bnb-0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d.omdep.near',
      contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      decimals: 18,
      networkName: 'BNB Smart Chain',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'tron',
      assetId: 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near',
      contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      decimals: 6,
      networkName: 'TRON (TRC20)',
      price: null
    },
    {
      symbol: 'TRX',
      name: 'TRON',
      blockchain: 'tron',
      assetId: 'nep141:tron.omft.near',
      contractAddress: '',
      decimals: 6,
      networkName: 'TRON',
      price: null
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      blockchain: 'hood',
      assetId: 'nep141:hood.omft.near',
      contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
      decimals: 18,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'PONS',
      name: 'Pons',
      blockchain: 'hood',
      assetId: 'nep141:hood-0x39dbed3a2bd333467115de45665cc57f813c4571.omft.near',
      contractAddress: '0x39dBED3a2bd333467115dE45665cC57F813C4571',
      decimals: 18,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'USDG',
      name: 'Global Dollar',
      blockchain: 'hood',
      assetId: 'nep141:hood-0x5fc5360d0400a0fd4f2af552add042d716f1d168.omft.near',
      contractAddress: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
      decimals: 6,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'CASHCAT',
      name: 'Cash Cat',
      blockchain: 'hood',
      assetId: 'nep141:hood-0x020bfc650a365f8bb26819deaabf3e21291018b4.omft.near',
      contractAddress: '0x020bfc650a365f8bb26819deaabf3e21291018b4',
      decimals: 18,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'USDe',
      name: 'Ethena USDe',
      blockchain: 'hood',
      assetId: 'nep141:hood-0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34.omft.near',
      contractAddress: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
      decimals: 18,
      networkName: 'Robinhood Chain',
      price: null
    },
    {
      symbol: 'XRP',
      name: 'XRP',
      blockchain: 'xrp',
      assetId: 'nep141:xrp.omft.near',
      contractAddress: '',
      decimals: 6,
      networkName: 'XRP Ledger',
      price: null
    },
    {
      symbol: 'DOGE',
      name: 'Dogecoin',
      blockchain: 'doge',
      assetId: 'nep141:doge.omft.near',
      contractAddress: '',
      decimals: 8,
      networkName: 'Dogecoin',
      price: null
    },
    {
      symbol: 'SUI',
      name: 'Sui',
      blockchain: 'sui',
      assetId: 'nep141:sui.omft.near',
      contractAddress: '',
      decimals: 9,
      networkName: 'Sui',
      price: null
    },
    {
      symbol: 'APT',
      name: 'Aptos',
      blockchain: 'aptos',
      assetId: 'nep141:aptos.omft.near',
      contractAddress: '',
      decimals: 8,
      networkName: 'Aptos',
      price: null
    },
    {
      symbol: 'USDT',
      name: 'Tether USD',
      blockchain: 'ton',
      assetId: 'nep245:v2_1.omni.hot.tg:1117_3tsdfyziyc7EJbP2aULWSKU4toBaAcN4FdTgfm5W1mC4ouR',
      contractAddress: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
      decimals: 6,
      networkName: 'TON',
      price: null
    }
  ];

