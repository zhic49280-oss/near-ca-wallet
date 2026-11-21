  const DEX_CHAIN_TOKENS = {
    near: [
      { symbol: 'PRL', name: 'Pearl Network (NEAR)', blockchain: 'near', assetId: '1cs_v1:near:nep141:prl.omft.near', contractAddress: 'prl.omft.near', decimals: 8, networkName: 'NEAR Protocol', price: null },
      { symbol: 'QTC', name: 'Quantus (NEAR)', blockchain: 'near', assetId: '1cs_v1:near:nep141:qtc.omft.near', contractAddress: 'qtc.omft.near', decimals: 12, networkName: 'NEAR Protocol', price: null },
      { symbol: 'NEAR', name: 'NEAR Protocol', blockchain: 'near', assetId: 'nep141:wrap.near', contractAddress: 'wrap.near', decimals: 24, networkName: 'NEAR Protocol', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'near', assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', contractAddress: '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', decimals: 6, networkName: 'NEAR Protocol', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'near', assetId: 'nep141:usdt.tether-token.near', contractAddress: 'usdt.tether-token.near', decimals: 6, networkName: 'NEAR Protocol', price: null },
      { symbol: 'RHEA', name: 'Rhea Finance', blockchain: 'near', assetId: '1cs_v1:near:nep141:token.rhealab.near', contractAddress: 'token.rhealab.near', decimals: 18, networkName: 'NEAR Protocol', price: null },
      { symbol: 'rNEAR', name: 'Rhea Staked NEAR', blockchain: 'near', assetId: '1cs_v1:near:nep141:lst.rhealab.near', contractAddress: 'lst.rhealab.near', decimals: 24, networkName: 'NEAR Protocol', price: null },
      { symbol: 'xRHEA', name: 'Staked RHEA (xRHEA)', blockchain: 'near', assetId: '1cs_v1:near:nep141:xtoken.rhealab.near', contractAddress: 'xtoken.rhealab.near', decimals: 18, networkName: 'NEAR Protocol', price: null },
      { symbol: 'oRHEA', name: 'Option RHEA (oRHEA)', blockchain: 'near', assetId: '1cs_v1:near:nep141:otoken.rhealab.near', contractAddress: 'otoken.rhealab.near', decimals: 18, networkName: 'NEAR Protocol', price: null },
      { symbol: 'stNEAR', name: 'Meta Pool Staked NEAR', blockchain: 'near', assetId: 'nep141:meta-pool.near', contractAddress: 'meta-pool.near', decimals: 24, networkName: 'NEAR Protocol', price: null },
      { symbol: 'LiNEAR', name: 'LiNEAR Staked NEAR', blockchain: 'near', assetId: 'nep141:linear-protocol.near', contractAddress: 'linear-protocol.near', decimals: 24, networkName: 'NEAR Protocol', price: null },
      { symbol: 'NearX', name: 'Stader NearX', blockchain: 'near', assetId: 'nep141:v2-nearx.stader-labs.near', contractAddress: 'v2-nearx.stader-labs.near', decimals: 24, networkName: 'NEAR Protocol', price: null }
    ],
    sol: [
      { symbol: 'SOL', name: 'Solana', blockchain: 'sol', assetId: 'So11111111111111111111111111111111111111112', contractAddress: 'So11111111111111111111111111111111111111112', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'sol', assetId: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'sol', assetId: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', contractAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'JUP', name: 'Jupiter', blockchain: 'sol', assetId: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', contractAddress: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'JitoSOL', name: 'Jito Staked SOL', blockchain: 'sol', assetId: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', contractAddress: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'jupSOL', name: 'Jupiter Staked SOL', blockchain: 'sol', assetId: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', contractAddress: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'INF', name: 'Sanctum Infinity', blockchain: 'sol', assetId: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', contractAddress: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'mSOL', name: 'Marinade Staked SOL', blockchain: 'sol', assetId: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', contractAddress: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'RAY', name: 'Raydium', blockchain: 'sol', assetId: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', contractAddress: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'ORCA', name: 'Orca', blockchain: 'sol', assetId: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', contractAddress: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'PYTH', name: 'Pyth Network', blockchain: 'sol', assetId: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', contractAddress: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'JTO', name: 'Jito', blockchain: 'sol', assetId: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', contractAddress: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'BONK', name: 'Bonk', blockchain: 'sol', assetId: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', contractAddress: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5, networkName: 'Solana', price: null },
      { symbol: 'WIF', name: 'dogwifhat', blockchain: 'sol', assetId: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', contractAddress: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'POPCAT', name: 'Popcat', blockchain: 'sol', assetId: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', contractAddress: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'MEW', name: 'cat in a dogs world', blockchain: 'sol', assetId: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', contractAddress: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', decimals: 5, networkName: 'Solana', price: null },
      { symbol: 'FARTCOIN', name: 'Fartcoin', blockchain: 'sol', assetId: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', contractAddress: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'TRUMP', name: 'OFFICIAL TRUMP', blockchain: 'sol', assetId: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', contractAddress: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'RENDER', name: 'Render Token', blockchain: 'sol', assetId: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', contractAddress: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', decimals: 8, networkName: 'Solana', price: null },
      { symbol: 'HNT', name: 'Helium', blockchain: 'sol', assetId: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', contractAddress: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', decimals: 8, networkName: 'Solana', price: null },
      { symbol: 'KMNO', name: 'Kamino', blockchain: 'sol', assetId: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS', contractAddress: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'DRIFT', name: 'Drift', blockchain: 'sol', assetId: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7', contractAddress: 'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'GRASS', name: 'Grass', blockchain: 'sol', assetId: 'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs', contractAddress: 'Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs', decimals: 9, networkName: 'Solana', price: null },
      { symbol: 'W', name: 'Wormhole', blockchain: 'sol', assetId: '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ', contractAddress: '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ', decimals: 6, networkName: 'Solana', price: null },
      { symbol: 'NVDAx', name: 'NVIDIA xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', contractAddress: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.NVDAX, price: null },
      { symbol: 'TSLAx', name: 'Tesla xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', contractAddress: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.TSLAX, price: null },
      { symbol: 'AAPLx', name: 'Apple xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', contractAddress: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.AAPLX, price: null },
      { symbol: 'MSFTx', name: 'Microsoft xStock', blockchain: 'sol', category: 'xstock', assetId: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', contractAddress: 'XspzcW1PRtgf6Wj92HCiZdjzKCyFekVD8P5Ueh3dRMX', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.MSFTX, price: null },
      { symbol: 'GOOGLx', name: 'Alphabet xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', contractAddress: 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.GOOGLX, price: null },
      { symbol: 'AMZNx', name: 'Amazon xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', contractAddress: 'Xs3eBt7uRfJX8QUs4suhyU8p2M6DoUDrJyWBa8LLZsg', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.AMZNX, price: null },
      { symbol: 'METAx', name: 'Meta xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', contractAddress: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.METAX, price: null },
      { symbol: 'SPYx', name: 'S&P 500 xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', contractAddress: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.SPYX, price: null },
      { symbol: 'QQQx', name: 'Nasdaq xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', contractAddress: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.QQQX, price: null },
      { symbol: 'MSTRx', name: 'MicroStrategy xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', contractAddress: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.MSTRX, price: null },
      { symbol: 'COINx', name: 'Coinbase xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', contractAddress: 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.COINX, price: null },
      { symbol: 'PLTRx', name: 'Palantir xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4', contractAddress: 'XsoBhf2ufR8fTyNSjqfU71DYGaE6Z3SUGAidpzriAA4', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.PLTRX, price: null },
      { symbol: 'HOODx', name: 'Robinhood xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg', contractAddress: 'XsvNBAYkrDRNhA7wPHQfX3ZUXZyZLdnCQDfHZ56bzpg', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.HOODX, price: null },
      { symbol: 'CRCLx', name: 'Circle xStock', blockchain: 'sol', category: 'xstock', assetId: 'XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1', contractAddress: 'XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.CRCLX, price: null },
      { symbol: 'GLDx', name: 'Gold xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re', contractAddress: 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.GLDX, price: null },
      { symbol: 'SPCXx', name: 'SpaceX xStock', blockchain: 'sol', category: 'xstock', assetId: 'Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8', contractAddress: 'Xs3oZwbHvqis4NYcf4YKWmEia2eC84wSiVrcYcTqpH8', decimals: 8, networkName: 'Solana (xStocks)', logoURI: TOKEN_ICON_MAP.SPCXX, price: null }
    ],
    eth: [
      { symbol: 'ETH', name: 'Ethereum', blockchain: 'eth', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'eth', assetId: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, networkName: 'Ethereum', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'eth', assetId: '0xdAC17F958D2ee523a2206206994597C13D831ec7', contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7', decimals: 6, networkName: 'Ethereum', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'eth', assetId: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', contractAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'WBTC', name: 'Wrapped BTC', blockchain: 'eth', assetId: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', contractAddress: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8, networkName: 'Ethereum', price: null },
      { symbol: 'stETH', name: 'Lido Staked ETH', blockchain: 'eth', assetId: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', contractAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'UNI', name: 'Uniswap', blockchain: 'eth', assetId: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', contractAddress: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'LINK', name: 'Chainlink', blockchain: 'eth', assetId: '0x514910771AF9Ca656af840dff83E8264EcF986CA', contractAddress: '0x514910771AF9Ca656af840dff83E8264EcF986CA', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'AAVE', name: 'Aave', blockchain: 'eth', assetId: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', contractAddress: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'PEPE', name: 'Pepe', blockchain: 'eth', assetId: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', contractAddress: '0x6982508145454Ce325dDbE47a25d4ec3d2311933', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'LDO', name: 'Lido DAO', blockchain: 'eth', assetId: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', contractAddress: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'PENDLE', name: 'Pendle', blockchain: 'eth', assetId: '0x808507121B80c02388fAd14726482e061B8da827', contractAddress: '0x808507121B80c02388fAd14726482e061B8da827', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'CRV', name: 'Curve DAO', blockchain: 'eth', assetId: '0xD533a949740bb3306d119CC777fa900bA034cd52', contractAddress: '0xD533a949740bb3306d119CC777fa900bA034cd52', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'MKR', name: 'Maker', blockchain: 'eth', assetId: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', contractAddress: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'ENS', name: 'Ethereum Name Service', blockchain: 'eth', assetId: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', contractAddress: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'DAI', name: 'Dai Stablecoin', blockchain: 'eth', assetId: '0x6B175474E89094C44Da98b954EedeAC495271d0F', contractAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', blockchain: 'eth', assetId: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, networkName: 'Ethereum', price: null },
      { symbol: 'USDe', name: 'Ethena USDe', blockchain: 'eth', assetId: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', contractAddress: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', decimals: 18, networkName: 'Ethereum', price: null },
      { symbol: 'sUSDe', name: 'Staked USDe', blockchain: 'eth', assetId: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', contractAddress: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', decimals: 18, networkName: 'Ethereum', price: null }
    ],
    base: [
      { symbol: 'ETH', name: 'Ethereum', blockchain: 'base', assetId: 'base:native:eth', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'base', assetId: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'EURC', name: 'Euro Coin', blockchain: 'base', assetId: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', contractAddress: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'base', assetId: '0x4200000000000000000000000000000000000006', contractAddress: '0x4200000000000000000000000000000000000006', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', blockchain: 'base', assetId: 'base:cbBTC', contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, networkName: 'Base', price: null },
      { symbol: 'AERO', name: 'Aerodrome', blockchain: 'base', assetId: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', contractAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'VIRTUAL', name: 'Virtuals Protocol', blockchain: 'base', assetId: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', contractAddress: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'DEGEN', name: 'Degen', blockchain: 'base', assetId: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', contractAddress: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'BRETT', name: 'Brett', blockchain: 'base', assetId: '0x532f27101965dd16442E59d40670FaF5eBB142E4', contractAddress: '0x532f27101965dd16442E59d40670FaF5eBB142E4', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'MORPHO', name: 'Morpho', blockchain: 'base', assetId: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', contractAddress: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'USDbC', name: 'USD Base Coin', blockchain: 'base', assetId: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', contractAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'DAI', name: 'Dai Stablecoin', blockchain: 'base', assetId: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', contractAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, networkName: 'Base', price: null }
    ],
    arb: [
      { symbol: 'ETH', name: 'Ethereum', blockchain: 'arb', assetId: 'arb:native:eth', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'arb', assetId: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, networkName: 'Arbitrum', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'arb', assetId: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', decimals: 6, networkName: 'Arbitrum', price: null },
      { symbol: 'ARB', name: 'Arbitrum', blockchain: 'arb', assetId: '0x912CE59144191C1204E64559FE8253a0e49E6548', contractAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'arb', assetId: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', contractAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'WBTC', name: 'Wrapped BTC', blockchain: 'arb', assetId: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', contractAddress: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', decimals: 8, networkName: 'Arbitrum', price: null },
      { symbol: 'GMX', name: 'GMX', blockchain: 'arb', assetId: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', contractAddress: '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'PENDLE', name: 'Pendle', blockchain: 'arb', assetId: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8', contractAddress: '0x0c880f6761F1af8d9Aa9C466984b80DAb9a8c9e8', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'LINK', name: 'Chainlink', blockchain: 'arb', assetId: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', contractAddress: '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'UNI', name: 'Uniswap', blockchain: 'arb', assetId: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', contractAddress: '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'DAI', name: 'Dai Stablecoin', blockchain: 'arb', assetId: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', contractAddress: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', decimals: 18, networkName: 'Arbitrum', price: null },
      { symbol: 'wstETH', name: 'Wrapped stETH', blockchain: 'arb', assetId: '0x5979D7b546E38E414F7E9822514be443A4800529', contractAddress: '0x5979D7b546E38E414F7E9822514be443A4800529', decimals: 18, networkName: 'Arbitrum', price: null }
    ],
    bsc: [
      { symbol: 'BNB', name: 'BNB', blockchain: 'bsc', assetId: 'bsc:native:bnb', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'USDT', name: 'Tether USD', blockchain: 'bsc', assetId: '0x55d398326f99059fF775485246999027B3197955', contractAddress: '0x55d398326f99059fF775485246999027B3197955', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'bsc', assetId: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', contractAddress: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'FDUSD', name: 'First Digital USD', blockchain: 'bsc', assetId: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', contractAddress: '0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'CAKE', name: 'PancakeSwap', blockchain: 'bsc', assetId: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', contractAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'BTCB', name: 'Bitcoin BEP20', blockchain: 'bsc', assetId: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', contractAddress: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'ETH', name: 'Ethereum Token', blockchain: 'bsc', assetId: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', contractAddress: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'WBNB', name: 'Wrapped BNB', blockchain: 'bsc', assetId: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', contractAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'SOL', name: 'Wrapped SOL (BSC)', blockchain: 'bsc', assetId: '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF', contractAddress: '0x570A5D26f7765Ecb712C0924E4De545B89fD43dF', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'XRP', name: 'XRP Token (BSC)', blockchain: 'bsc', assetId: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', contractAddress: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', decimals: 18, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'DOGE', name: 'Dogecoin (BSC)', blockchain: 'bsc', assetId: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', contractAddress: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43', decimals: 8, networkName: 'BNB Smart Chain', price: null },
      { symbol: 'LINK', name: 'Chainlink (BSC)', blockchain: 'bsc', assetId: '0xf8a0bf9Cf54bb92f17374D9e9a326e6a511a1D2B', contractAddress: '0xf8a0bf9Cf54bb92f17374D9e9a326e6a511a1D2B', decimals: 18, networkName: 'BNB Smart Chain', price: null }
    ],
    hype: [
      { symbol: 'HYPE', name: 'HYPE (HyperEVM)', blockchain: 'hype', assetId: 'hype:native:hype', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'WHYPE', name: 'Wrapped HYPE', blockchain: 'hype', assetId: '0x5555555555555555555555555555555555555555', contractAddress: '0x5555555555555555555555555555555555555555', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'hype', assetId: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', contractAddress: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', decimals: 6, networkName: 'HyperEVM', price: null },
      { symbol: 'USDe', name: 'Ethena USDe', blockchain: 'hype', assetId: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', contractAddress: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'kHYPE', name: 'Kinetiq Staked HYPE', blockchain: 'hype', assetId: '0xfD739d4e423301CE9385c1fb8850539D657C296D', contractAddress: '0xfD739d4e423301CE9385c1fb8850539D657C296D', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'PURR', name: 'Purr', blockchain: 'hype', assetId: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E', contractAddress: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E', decimals: 18, networkName: 'HyperEVM', price: null }
    ],
    hood: [
      { symbol: 'ETH', name: 'ETH (Robinhood)', blockchain: 'hood', assetId: 'hood:native:eth', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'PONS', name: 'Pons', blockchain: 'hood', assetId: '0x39dBED3a2bd333467115dE45665cC57F813C4571', contractAddress: '0x39dBED3a2bd333467115dE45665cC57F813C4571', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'USDG', name: 'Global Dollar', blockchain: 'hood', assetId: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', contractAddress: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6, networkName: 'Robinhood Chain', price: null },
      { symbol: 'CASHCAT', name: 'Cash Cat', blockchain: 'hood', assetId: '0x020bfc650a365f8bb26819deaabf3e21291018b4', contractAddress: '0x020bfc650a365f8bb26819deaabf3e21291018b4', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'hood', assetId: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', contractAddress: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'USDe', name: 'Ethena USDe', blockchain: 'hood', assetId: 'hood:USDe', contractAddress: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', contractAddressChecksum: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', blockchain: 'hood', assetId: '0xcec185eb182c47d1ba1efc84e6959e18cd620be4', contractAddress: '0xcec185eb182c47d1ba1efc84e6959e18cd620be4', decimals: 8, networkName: 'Robinhood Chain', price: null }
    ],
    arc: [
      { symbol: 'USDC', name: 'USD Coin (Arc Native Gas)', blockchain: 'arc', assetId: 'arc:0x3600000000000000000000000000000000000000', contractAddress: '0x3600000000000000000000000000000000000000', decimals: 6, networkName: 'Arc Network', price: null },
      { symbol: 'EURC', name: 'Euro Coin (Circle)', blockchain: 'arc', assetId: 'arc:0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1', contractAddress: '0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1', decimals: 6, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/3cb13e14-b165-4305-a272-d4fa03ca58051789468881141.png', price: null },
      { symbol: 'cirBTC', name: 'Circle Wrapped Bitcoin', blockchain: 'arc', assetId: 'arc:0x171a4217b86a807a64eb94757db6849fb4bdbaa0', contractAddress: '0x171a4217b86a807a64eb94757db6849fb4bdbaa0', decimals: 8, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/0ec4d0f8-8eee-4c73-a496-9582ee163b4f1789469942218.png', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether (Arc)', blockchain: 'arc', assetId: 'arc:0x128cc466b61f542da60c70e3aa11c10e19b84edb', contractAddress: '0x128cC466B61f542da60c70e3aA11c10e19B84EDB', decimals: 18, networkName: 'Arc Network', price: null },
      { symbol: 'CRCL', name: 'Circle Internet Group • Arc', blockchain: 'arc', assetId: 'arc:0x2ba0f44bdfc17fba30eda9cdbecb908ca45b043b', contractAddress: '0x2ba0f44bdfc17fba30eda9cdbecb908ca45b043b', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/247b9047-7b4b-4d49-a76b-222cca81da221789554277062.jpg', price: null },
      { symbol: 'steakUSDC', name: 'Steakhouse Prime USDC', blockchain: 'arc', assetId: 'arc:0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', contractAddress: '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', decimals: 18, networkName: 'Arc Network', price: null },
      { symbol: 'AF', name: 'Arcflow', blockchain: 'arc', assetId: 'arc:0x75d658f8101fbe6dc217fbba7e20a0312af5fa2e', contractAddress: '0x75d658f8101fbe6dc217fbba7e20a0312af5fa2e', decimals: 18, networkName: 'Arc Network', logoURI: 'https://coin-images.coingecko.com/coins/images/102178819/large/flow.jpg?1790407099', price: null },
      { symbol: 'ARCMAN', name: 'Arc-man', blockchain: 'arc', assetId: 'arc:0x5849fd68a097b3ee7d87ce88a0fcbb76857648ff', contractAddress: '0x5849fd68a097b3ee7d87ce88a0fcbb76857648ff', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/ac551882-4fce-4fbf-a029-a834f988175d1790237560158.jpg', price: null },
      { symbol: 'ARCOON', name: 'Arcoon', blockchain: 'arc', assetId: 'arc:0x4621a0baa0b5d97aae77704cf2a84dabe78a4fed', contractAddress: '0x4621a0baa0b5d97aae77704cf2a84dabe78a4fed', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/97b87e78-ba43-4a0b-b4af-f9becc43cb921793085332110.jpg', price: null },
      { symbol: 'ARGUS', name: 'Argus', blockchain: 'arc', assetId: 'arc:0xece5ca8bf9220718e5727754026757512212cb3c', contractAddress: '0xece5ca8bf9220718e5727754026757512212cb3c', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/40fa2d83-404f-41a0-bdaf-0d76a4929ff41789532423899.jpg', price: null },
      { symbol: 'ASTOCK', name: 'ArcStocks', blockchain: 'arc', assetId: 'arc:0x4c9b47dbd5933aa4574b2c27f82419e4dbbd0222', contractAddress: '0x4c9b47dbd5933aa4574b2c27f82419e4dbbd0222', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/39fe8e2d-5219-4a95-828b-702f8bfe938a1790137134871.jpg', price: null },
      { symbol: 'TOLLY', name: 'Tolly', blockchain: 'arc', assetId: 'arc:0xbc43ce8dec648ea298c4275559b81d6261c90b67', contractAddress: '0xbc43ce8dec648ea298c4275559b81d6261c90b67', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/2c3fc4ac-ffc0-481d-8f22-6cbf03f3093a1789532377125.jpg', price: null },
      { symbol: 'FAZE', name: 'Faze', blockchain: 'arc', assetId: 'arc:0x394d38f807ee0027a182216f5e67a15ae441fa2e', contractAddress: '0x394d38f807ee0027a182216f5e67a15ae441fa2e', decimals: 18, networkName: 'Arc Network', logoURI: 'https://s2.coinmarketcap.com/static/img/coins/64x64/42345.png', price: null },
      { symbol: 'KAIRO', name: 'Kairo', blockchain: 'arc', assetId: 'arc:0x3ead4e80e9e5bc0e01682d7ee74c4881b040d3ea', contractAddress: '0x3ead4e80e9e5bc0e01682d7ee74c4881b040d3ea', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/68e325d5-cd4f-460e-ac86-e7b8d7f948741789554613087.jpg', price: null },
      { symbol: 'LONG', name: 'LONG', blockchain: 'arc', assetId: 'arc:0x2164bb17a2d38c1b5170e987b2c0416df1efc752', contractAddress: '0x2164bb17a2d38c1b5170e987b2c0416df1efc752', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/2b139c52-f887-4e96-b351-82062e3cbaac1789532445302.jpg', price: null },
      { symbol: 'oBrain', name: 'oBrain', blockchain: 'arc', assetId: 'arc:0x28f986a61e078795639f239675582a12b4cf7f01', contractAddress: '0x28f986a61e078795639f239675582a12b4cf7f01', decimals: 18, networkName: 'Arc Network', logoURI: 'https://coin-images.coingecko.com/coins/images/102178559/large/1000020833.jpg?1789978080', price: null },
      { symbol: 'MALA', name: 'Malachite', blockchain: 'arc', assetId: 'arc:0x4f7dc89dc44ad08c20d9680d2ee9cfad69bfda55', contractAddress: '0x4f7dc89dc44ad08c20d9680d2ee9cfad69bfda55', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/73e47fb4-0c87-45c7-a7d0-649d08e3c5131789704863682.jpg', price: null },
      { symbol: 'DUKE', name: 'The Duke of Arc', blockchain: 'arc', assetId: 'arc:0x41358defd0dedc90528b3f1835715e907b686e6a', contractAddress: '0x41358defd0dedc90528b3f1835715e907b686e6a', decimals: 18, networkName: 'Arc Network', logoURI: 'https://storage.googleapis.com/ks-setting-1d682dca/6d05fda0-71c8-46ee-b74f-f0c1256188d81789704701735.jpg', price: null },
      { symbol: 'ARCUS', name: 'Arcus Network', blockchain: 'arc', assetId: 'arc:0xb7c934ff18730c24e6113bb4bc5a68feef16fd29', contractAddress: '0xb7c934ff18730c24e6113bb4bc5a68feef16fd29', decimals: 18, networkName: 'Arc Network', logoURI: 'https://coin-images.coingecko.com/coins/images/102178538/large/8zcl45cyifee1l43r937gdp2gf1d.?1789888138', price: null }
    ]
  };

  let _liveDefuseTokens = [];
  const _byAssetId = new Map();
  const _byChainAssetId = new Map();
  const _byChainContract = new Map();
  const _bySymbol = new Map();

  function _indexToken(tok) {
    if (!tok || !tok.assetId) return;
    const chain = getChainMeta(tok.blockchain || '').key;
    const aid = String(tok.assetId).trim().toLowerCase();
    const contract = tok.contractAddress ? String(tok.contractAddress).trim().toLowerCase() : '';
    const sym = tok.symbol ? String(tok.symbol).trim().toLowerCase() : '';
    if (!_byAssetId.has(aid)) _byAssetId.set(aid, tok);
    if (chain) {
      const caKey = `${chain}|${aid}`;
      if (!_byChainAssetId.has(caKey)) _byChainAssetId.set(caKey, tok);
      if (contract) {
        const ccKey = `${chain}|${contract}`;
        if (!_byChainContract.has(ccKey)) _byChainContract.set(ccKey, tok);
      }
    }
    if (sym && !_bySymbol.has(sym)) _bySymbol.set(sym, tok);
  }

  function rebuildTokenIndexes() {
    _byAssetId.clear();
    _byChainAssetId.clear();
    _byChainContract.clear();
    _bySymbol.clear();
    for (const t of _liveDefuseTokens) _indexToken(t);
    for (const t of UNIFIED_CORE_TOKENS) _indexToken(t);
    for (const list of Object.values(DEX_CHAIN_TOKENS)) {
      if (Array.isArray(list)) {
        for (const t of list) _indexToken(t);
      }
    }
  }

  const _CANON_PRICE_SYM_MAP = {
    WNEAR: 'NEAR',
    WETH: 'ETH',
    WBTC: 'BTC',
    BTCB: 'BTC',
    CBBTC: 'BTC',
    CIRBTC: 'BTC',
    WSOL: 'SOL',
    WBNB: 'BNB',
    WHYPE: 'HYPE',
    USDBC: 'USDC',
    WUSDC: 'USDC',
    WMATIC: 'POL',
    MATIC: 'POL',
    WAVAX: 'AVAX'
  };

  function syncPricesToStaticCatalogs(liveList) {
    if (!Array.isArray(liveList) || liveList.length === 0) return;
    const byAsset = new Map();
    const byChainContract = new Map();
    const byExactSym = new Map();
    const byCanonSym = new Map();

    for (const item of liveList) {
      if (!item || typeof item !== 'object') continue;
      const aid = String(item.assetId || '').trim().toLowerCase();
      const chainKey = getChainMeta(item.blockchain || '').key;
      const contract = String(item.contractAddress || '').trim().toLowerCase();
      const sym = String(item.symbol || '').trim().toUpperCase().replace(/^\$/, '');
      const hasPrice = typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0;
      if (aid && !byAsset.has(aid)) byAsset.set(aid, item);
      if (chainKey && contract && !byChainContract.has(`${chainKey}|${contract}`)) {
        byChainContract.set(`${chainKey}|${contract}`, item);
      }
      if (hasPrice && sym) {
        if (!byExactSym.has(sym)) byExactSym.set(sym, item);
        const canon = _CANON_PRICE_SYM_MAP[sym] || sym;
        if (!byCanonSym.has(canon)) byCanonSym.set(canon, item);
      }
    }

    const applyToToken = (tok) => {
      if (!tok || typeof tok !== 'object') return;
      const aid = String(tok.assetId || '').trim().toLowerCase();
      const chainKey = getChainMeta(tok.blockchain || '').key;
      const contract = String(tok.contractAddress || '').trim().toLowerCase();
      const sym = String(tok.symbol || '').trim().toUpperCase().replace(/^\$/, '');
      const canon = _CANON_PRICE_SYM_MAP[sym] || sym;
      const exactMatch = (aid && byAsset.get(aid))
        || (chainKey && contract && byChainContract.get(`${chainKey}|${contract}`))
        || null;
      const symMatch = (sym && byExactSym.get(sym)) || (canon && byCanonSym.get(canon)) || null;
      const match = (exactMatch && typeof exactMatch.price === 'number' && exactMatch.price > 0)
        ? exactMatch
        : (symMatch || exactMatch);
      if (!match) return;
      if (typeof match.price === 'number' && Number.isFinite(match.price) && match.price > 0) {
        tok.price = match.price;
        if (match.priceUpdatedAt) tok.priceUpdatedAt = match.priceUpdatedAt;
      }
      if (!tok.logoURI && match.logoURI) {
        const safeLogo = sanitizeImageUrl(match.logoURI);
        const isMappedRemote = Boolean(sym && TOKEN_ICON_MAP[sym] && /^https?:\/\//i.test(TOKEN_ICON_MAP[sym]));
        const isGeneratedSvg = Boolean(
          safeLogo &&
          safeLogo.startsWith('data:image/svg+xml') &&
          (isMappedRemote || safeLogo.includes('dmlld0JveD0iMCAwIDMyIDMyIg') || safeLogo.includes('viewBox="0 0 32 32"'))
        );
        if (safeLogo && !isGeneratedSvg) tok.logoURI = safeLogo;
      }
    };

    for (const t of UNIFIED_CORE_TOKENS) applyToToken(t);
    for (const list of Object.values(DEX_CHAIN_TOKENS)) {
      if (Array.isArray(list)) {
        for (const t of list) applyToToken(t);
      }
    }
  }

  function setLiveDefuseTokens(list) {
    _liveDefuseTokens = Array.isArray(list) ? list.filter(t => t && t.assetId) : [];
    syncPricesToStaticCatalogs(_liveDefuseTokens);
    rebuildTokenIndexes();
  }

  function getAllCoreTokens() {
    return UNIFIED_CORE_TOKENS.map(t => ({ ...t }));
  }

  function getDexTokensForChain(chainKey = 'sol') {
    const meta = getChainMeta(chainKey);
    const list = DEX_CHAIN_TOKENS[meta.key] || DEX_CHAIN_TOKENS[String(chainKey || '').toLowerCase()] || [];
    return list.map(t => ({ ...t }));
  }

  function findTokenByAssetId(assetId, blockchainOrExtraTokens = [], maybeExtraTokens = []) {
    const id = String(assetId || '').trim();
    if (!id) return null;
    if (!_byAssetId.size) rebuildTokenIndexes();
    const blockchain = typeof blockchainOrExtraTokens === 'string'
      ? getChainMeta(blockchainOrExtraTokens).key
      : '';
    const extraTokens = Array.isArray(blockchainOrExtraTokens)
      ? blockchainOrExtraTokens
      : (Array.isArray(maybeExtraTokens) ? maybeExtraTokens : []);
    const lower = id.toLowerCase();
    if (extraTokens.length) {
      if (blockchain) {
        const exactExtra = extraTokens.find(
          t => t && String(t.assetId || '').toLowerCase() === lower && getChainMeta(t.blockchain || '').key === blockchain
        );
        if (exactExtra) return exactExtra;
      }
      const foundExtra = extraTokens.find(t => t && String(t.assetId || '').toLowerCase() === lower);
      if (foundExtra) return foundExtra;
    }
    if (blockchain) {
      const byChainAid = _byChainAssetId.get(`${blockchain}|${lower}`);
      if (byChainAid) return byChainAid;
      const byChainContract = _byChainContract.get(`${blockchain}|${lower}`);
      if (byChainContract) return byChainContract;
    }
    return _byAssetId.get(lower) || null;
  }

  function getSupportedChains() {
    return ['near', 'eth', 'sol', 'base', 'arb', 'bsc', 'btc', 'tron', 'hype', 'hood', 'arc', 'prl', 'qtc']
      .map(k => CHAIN_META[k]);
  }

  const NearCATokens = {
    TOKEN_ICON_MAP,
    CHAIN_META,
    UNIFIED_CORE_TOKENS,
    DEX_CHAIN_TOKENS,
    getChainMeta,
    getPearlIconSvg,
    getFallbackTokenIconSvg,
    sanitizeImageUrl,
    registerDynamicTokenIcons,
    setLiveDefuseTokens,
    resolveTokenIcon,
    renderTokenIconWithBadge,
    getAllCoreTokens,
    getDexTokensForChain,
    findTokenByAssetId,
    getSupportedChains
  };

  if (root) {
    root.NearCATokens = NearCATokens;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.NearCATokens = NearCATokens;
  }
  if (typeof window !== 'undefined') {
    window.NearCATokens = NearCATokens;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = NearCATokens;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
