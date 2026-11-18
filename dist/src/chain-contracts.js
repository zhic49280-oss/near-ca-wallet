(function (root) {
  'use strict';

  const NEAR_RPC_URL = 'https://rpc.mainnet.near.org';
  const NEAR_EXPLORER_TX = 'https://nearblocks.io/txns/';
  const SOLANA_RPC_ENDPOINTS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
  const SOLSCAN_TX = 'https://solscan.io/tx/';
  const JUPITER_API_URL = 'https://lite-api.jup.ag/swap/v1';
  const RAYDIUM_API_URL = 'https://transaction-v1.raydium.io';
  const OPENOCEAN_API_URL = 'https://open-api.openocean.finance/v4';
  const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const SPL_TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
  const WSOL_MINT = 'So11111111111111111111111111111111111111112';
  const DEFAULT_SOL_FEE_RECIPIENT = 'ANB4P6mVYUMVuznmt6zkkctB6kjzrQydXG34ZqJqSYGD';
  const DEFAULT_EVM_FEE_RECEIVER = '0x00dCBFDe63933Dc710Dd804dE58602d267BCCE34';
  const NATIVE_EVM_SENTINEL = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
  const V1_SIGNER_CONTRACT = 'v1.signer';
  const V1_SIGNER_ROOT_PK_BASE58 = '3tFRbMqmoa6AAALMrEFAYCEoHcqKxeW38YptwowBVBtXK1vo36HDbUWuR6EZmoK4JcH6HDkNMGGqP1ouV7VZUWya';
  const DEFAULT_TIMEOUT_MS = 10000;

  const EVM_CHAINS = {
    eth: {
      chainId: 1,
      name: 'Ethereum',
      symbol: 'ETH',
      rpc: 'https://ethereum-rpc.publicnode.com',
      kyber: 'ethereum',
      openOcean: 'eth',
      explorer: 'https://etherscan.io/tx/',
      gasReserve: 0.0015
    },
    base: {
      chainId: 8453,
      name: 'Base',
      symbol: 'ETH',
      rpc: 'https://mainnet.base.org',
      kyber: 'base',
      openOcean: 'base',
      explorer: 'https://basescan.org/tx/',
      gasReserve: 0.0002
    },
    arb: {
      chainId: 42161,
      name: 'Arbitrum',
      symbol: 'ETH',
      rpc: 'https://arb1.arbitrum.io/rpc',
      kyber: 'arbitrum',
      openOcean: 'arbitrum',
      explorer: 'https://arbiscan.io/tx/',
      gasReserve: 0.0002
    },
    bsc: {
      chainId: 56,
      name: 'BSC',
      symbol: 'BNB',
      rpc: 'https://bsc-dataseed.bnbchain.org',
      kyber: 'bsc',
      openOcean: 'bsc',
      explorer: 'https://bscscan.com/tx/',
      gasReserve: 0.0005
    },
    hype: {
      chainId: 999,
      name: 'HyperEVM',
      symbol: 'HYPE',
      rpc: 'https://rpc.hyperliquid.xyz/evm',
      kyber: 'hyperevm',
      explorer: 'https://purrsec.com/tx/',
      gasReserve: 0.0005
    },
    hood: {
      chainId: 4663,
      name: 'Robinhood',
      symbol: 'ETH',
      rpc: 'https://rpc.mainnet.chain.robinhood.com',
      kyber: 'robinhood',
      explorer: 'https://robinhoodchain.blockscout.com/tx/',
      gasReserve: 0.0002
    },
    arc: {
      chainId: 5042,
      name: 'Arc',
      symbol: 'USDC',
      rpc: 'https://rpc.mainnet.arc.io',
      kyber: 'arc',
      openOcean: null,
      explorer: 'https://explorer.arc.io/tx/',
      gasReserve: 0.02
    }
  };

  const DEFAULT_GAS_BUFFERS = {
    near: 0.002,
    sol: 0.002,
    eth: 0.0015,
    base: 0.0002,
    arb: 0.0002,
    bsc: 0.0005,
    hype: 0.0005,
    hood: 0.0002,
    arc: 0.02,
    prl: 0.001
  };

  const POOL_ICON_NEAR =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2300EC97'/%3E%3Cpath d='M21.4 9.2l-3.9 5.8c-.3.4.2.9.6.5l3.8-3.1c.1-.1.3 0 .3.2v7.2c0 .2-.2.3-.3.1l-9.9-11.8c-.5-.6-1.2-.9-2-.9h-.6c-1.4 0-2.5 1.1-2.5 2.5v12.8c0 1.4 1.1 2.5 2.5 2.5.9 0 1.7-.5 2.2-1.2l3.9-5.8c.3-.4-.2-.9-.6-.5l-3.8 3.1c-.1.1-.3 0-.3-.2v-7.2c0-.2.2-.3.3-.1l9.9 11.8c.5.6 1.2.9 2 .9h.6c1.4 0 2.5-1.1 2.5-2.5V10.5c0-1.4-1.1-2.5-2.5-2.5-.9 0-1.7.5-2.2 1.2z' fill='%23000'/%3E%3C/svg%3E";
  const POOL_ICON_RNEAR =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAzMiAzMiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzIwMjE2XzIyNzQpIj4KPGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTUuNSIgZmlsbD0iYmxhY2siIHN0cm9rZT0iIzRDNEM0QyIvPgo8cGF0aCBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTEwLjY1NTEgMTEuOTg3MlYyMC4wOTY4TDE0LjY3MTcgMTYuOTk4NEwxNS4wNzMzIDE3LjM2MjFMMTEuNzA1MiAyMi4yNTk5QzEwLjQ1MzcgMjMuNDQ1MiA4LjI0NTEyIDIyLjY0MzIgOC4yNDUxMiAyMS4wMDM1VjEwLjk5MDhDOC4yNDUxMiA5LjI5NDg4IDEwLjU4MyA4LjUyMjM3IDExLjc4OTYgOS44MTk2M0wyMS4wOTgzIDE5LjgyNzdWMTIuMDUwOUwxNy40ODMzIDE0LjgxNjVMMTcuMDgxNyAxNC40NTI5TDE5Ljk0NjUgOS44ODA5MkMyMS4xNDIyIDguNTU5NjMgMjMuNTA4MiA5LjMyNTE0IDIzLjUwODIgMTEuMDMzM1YyMC44MjQxQzIzLjUwODIgMjIuNTIwMSAyMS4xNzA0IDIzLjI5MjYgMTkuOTYzNyAyMS45OTUzTDEwLjY1NTEgMTEuOTg3MloiIGZpbGw9IiMwMEY3QTUiLz4KPC9nPgo8ZGVmcz4KPGNsaXBQYXRoIGlkPSJjbGlwMF8yMDIxNl8yMjc0Ij4KPHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiBmaWxsPSJ3aGl0ZSIvPgo8L2NsaXBQYXRoPgo8L2RlZnM+Cjwvc3ZnPgo=';
  const POOL_ICON_XRHEA =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAABZ9SURBVHgB7VwLXFRV/v/dQd21UnDL0lJm/K+vzITdLPPF0IqZmqCilaUDibU+YlR62OaCCvXf7YHouG1pooCuloImpZaCOqjlM8EyMnBnUB4KKg8FZO4wZ3+/c+eOiHBnePnY9evneO/cxzn3fO/39zjn3gvAHdzBHdzGEOAWQwzL1Ag2t9kAbCwwpuEbBSEdGKQzN9uiucLDZriFcMsQuJqZPMptYoyNsWDGmP3KpMuj/xn+ozVBEOJaq6oXzbhFiLzpBBJxFTbrbCRuDtLkQdsqSi7BwYRNkJeRyY/p4vUw9Avwg9+pH7LTSP+pFrZStYqfIXQzw03ETSOwJnECYx6CSuDE7V66GnYbEqCypOy6c0ZFhMKAoPFwLxJJmkQ5mqHatvS1Nr2XwE3CTSHwY8uvwYIbLEBL1dAFEHG7DHGwxxCP62WK596reQhGI5FP6gLBTiIumBnXFs1q1TMObjBuKIGfiFm+ArAY7Ky3vePwPZrq1qhlcMGc16C6SIXPciLHSyRyMDOAatGMVt3j4AbhhhD4GRLHBFQcgC/5MBJOVtoh+CrSAL8aD0JTIBGph4G6cRRg+Db8fw/Y2NxX2/RMhxZGixK4wmLyFgRrDBMEX3nbSSSsOYirjZ7aARAc+z7cp+ni2IZuNc5N5bbo5RYMNC1CIAYITXW1DRXHgoFJfuqCORdWh8zjBLYkBgUFgn+4Xgo0AkiqZCzOza1liGxWAimygg0wstowJQEPslUKEMmRS2EnBokbicF2Iu/TUMRGz4s30k0lLAGVamlzEtksBMrEARLHOHHAo+lOw2pOnLPI2pIIQP84GCO2w7QFMAs2VdzLrbstgmZAkwlcbckOFlSqGLzDnLhKVNyOZathB5J3M4mrCSJvLKpxSNCEGluZWQVska6JEbvRBK4RTb42FVuNVqqRKhIgLT4RvoxaCufR392KkIn0QSKZY0iDigRbo4lsMIFEHJ61AK/AV87lMtMOwmb0c5nGA3A7gIgcHz4bhlIyLueQAqSjG5o7pXW3PQ2oynUC1/PICqtx1ZcP7vEOZqYdgE23EXG18bD2SXg19kPoSP6RObiMU7nBokkuBhqXCFzHcoJYNVsC5OfwjCI00eUhb962xNUGmXRgxBzoqKZAw6TMi6nmvthG3fQx9jqraex60cyoxBYdZyP1UxlvpZHFw8ODhYdHNKmOuopOp2tyHVrdBGbI3od9NbH1VjP7AvsOTcH6SpPm82qz6XOsbBlWjFJvcKcCAsY6fms0GpaVlc2Kis43O4FUZ3b2Kd7G1faDmFarbVA91Efq6xcoGCzFmylFayw2WE8Hb7DmMCoNJY8KkRUbu4qvq9USeaJoxW2xzU4gtUN11yQxMTGJt9nQuqivced/YhvEHCTRtBAai0Tr6d0bkbxZsdENvgi6+9ShlJRU/puWFovIt9VUSXMVUhrVTSU19Wqb9LuhKqTy8uIFbCMSSBwocaRS2ikw8FVh1Pg5reHBQqv14cMnApKJv7V8XBoZGQlmsxmaG0ajEQwGA2/Tx0fL21Or1XxfQEAANBSm9BM4GUHZLU69KUCZQGh8po0my5clJSUQHh7O19PS0iAqKhJaCq+/HsbbIGCgguPHM/h6v35e0FAQeSQeFJGiD1S5VEkjaKS7T4orLS0FNFlISIiHwMDxTs/z8qq7s6RiVzBhQiBvixRoNwCHEhsEbsiMc6AEZyYsFXAdVwmQzjIa99g7lQDR0dGwePHies8lU4uOrns/Bh5OihL0ej1vIyoqCqZNC4GMDEmB8kQr3UiXgee4CSplgpzhK2su+0rMZX5Bz7nsfOUoePToUUcAiYiI4M6cIqJSAMnKOsWPo1yx9j75/Lr2yYX2FRYWMau12pFr0jVQoX3y9bhShumeY3L/lThqpbSTzFd6HusaSH1kLrSUnTr5Iiqkgnffjao3gJC6NBp1vXUvW2bg/lQJtP+VV6YBpi+AN41vI5+LuSi/JqkNjUtBjERb49F047BNzGNUlBQYGqp3qApNkCuFUhi646GhoY7UhVQICnecjldSl3yMKymQrHgqdH1gT6voWmhJv5FQFqrX11vHcOzzVuq/NU9RQco+UHAeib29veHw4SP8zrq7SwGLlEDrev0crjyKjpS+KIEUQgVJum4f+UY0b0DzxGW2U19GbcnRnpQo1ckcnSEr+SZlJzzqpRSdBSmNcWKAylGYCXIuVC9KS0v4BSYmJvJ1eVtQkA5ycszg5zeMm7IzkNmhjwIcksGRI0evCRj+/v7cvOVgsHJlrNP6iMTuPbpDOgaSWfpQvrQgiSY0369TdsBdHu3hQmlxvecLvP/OLdi5Ap3cgfR06cmhl5c3eHqquX+R/R8tnfktApFVU3n9+vXjybAMqpsgJ+aUpPvUINgdz/3/6A+uq9cTlZZq3A3vRUbBcSSwqOQiPOL1KHTWeEIVTv7txetTAidRaIITTLEWsBSxgI1Q8IHkl2ggLw/bZB8lD+XqGkbRJENNf0djY9lnyUWecKDj6LdFFNkVLOWihV0Sq9g/Yz9znD9I68PyxXIWFvHONe2MChjDzouVuPTnv/t69WObUr5hBXjsoexM1l7B544Iep73nYoSR85HIoKyFySFUYQkkA8jBZKPoshbH8LDF1yTMOfk5DjWJZUxaO/u7vB1VVANlTVKBRajfcRBOI1tro1PAGutjIEyCBGVFr3yU2jv4Q4/ZRyH/tohaMo2WJewBsqUrIPViMSNxS5kf5d4lt8NgPoH8RTR5JkWqKE+KrSv5vFypKaZEqiZvxUVsSsYJStRYZexlKLKPDVqvt+wcjk7K1awPFTOafESM2Pp4/Wo02jcBxWXYz9+qn4W33ZKLGN7sn9E9bmzJ7RD6leg7nm2y3qW7caixJFyELEP4pTuApojJCVt4pm/nF/RNgIpSx4NyCC/SIGFjpdBKo5BFV8RqqHcrrJfzf/G7aV8/7o1a6FCIOVZsdggO8cEP2f8yPetSNkCz+om1XltP6PiLpQUo+Kqwdd/JN9mwsD2VsgM2Hg4Df4UMArqA/d/0EQFGsVzLM16jo0MekExD5RHCbLaZPXVNUtMahuCPutv0R+xjKyTLDl1B9/ujorYlPoN+/bId+zHolzWxa4+uYzTvciWJq1lG46msV529YWEv8X24zXuxbI++zC7x6P9de3NinibnRCL2XdFJv67l1dftjXrGDsmXmBjdJPq7ddIVCD13SgqK1ARe7GCvdZCRQLlIGJBwnampHASq9DZn8zKqvP46frXWBE6djJJcvy5WKbqZzo1x9rFWzuI7bI7+W/FfLYdk95HtQOvO64d3pht2ensByTsQY0nS84+xg6JReyg9Tz/XS+B2Ge6MdR/JY6cTiY4kzGZ39JlS9FIbDDIxwcGY4qRjWby9PDhdR5P6QSZ4tWAYIXp4fMAO3PNcZ3VnjAnOgqwI4DKumbfA5quMDt2MVQKNh5QKgWpPBbw9HXtXUI3MDtwMs/5UFX8nRnKB9cZPoF882lQ6rsATU2kBZVLPmCZYRmcQtJEgUgcCiP9/CCnnvEmRcJKsEn+zN7xVh73wIdJCY5jiLCY1CQI0L8Cr6+MgU1FJ+H91ET4P69H+P4n/J8Gd82Ddp9ohXImla2GuhPsrIyfYOawsdBPO4hH5TPom2MjPwRnUAE0dTqLOe5EXZgX/ld4L/ojTGTd4YXACZioFgP6GGiHKcgbEfPrPKcMFfFWyHSunApGxcrXU7dsdRyzIHE1eKgflNTFibZCD+0AeD1pBdyN5O5K2MhTFzpfVvKuhET+uLUudFJ35SMPz359oBgtZq7feG6nL0WEQVhsTN19l/8xZQk6yQMFRySuCxRlp+pnwMHsTBgRMAbG+o3A7gJ0QXMMCp3Bc6+6kJywHsImTIHzaFZEEv1eZVdESPQCJOsJh2lWkJkSyVjaoeqmxn4A5SVlEB043b5fyguTo5ZCfQhbFQP348Pz0rISeMMvEJ6aMgFWZh2A5yLmQrrxO1Aix5kNKhLoJgiKEv4ck1EaDllQCaHhb0OwfiZM9HsG7kYF/tajHfgFjK733L1btoMezeqwcR98EDKbbwuOjoARs6dKqrKnLdK6TfJzuN7b/ynw1QfBmYyfYX3Yu5zY/WuS6n1F+H58WN7bZwC0dW8Psx4bDqP0ITABiWvtcTc3bVJzXbg6kaJMoOJ8oJzYK1UxbcIkSD68jwcBf90LcBHNeHPCOiTVBj1x3KmEUxkn4G2/idwsJ0eH89fQiBAbNliN51fjMdU0nkA/YkVTsuE6/X4qYiZkJKeA0RDPixI6YsChkcfZnDMwKnQqDME2yA8W4u/3A18Bpb5z8TQpiHATVgb5tDGPD4GNCWt5dJs0ezqS2ZUHlGpnrSPuQ4W8kfov6K8bZ4+mNh4QKmTVUXKNCr9SI+Iyj7vAPzYKXMF9GHWJsLZoEQERszmZB5K/hbf7j67XZxKkiRShibMxAC49UqJUYX7ILCwzefb/XOircABNMzP9ON//11gDnwGpC1Ni/w4dvXpJJsuumi0p0TH+tZszkVhpDxwdtX+AProxddZJ77iEJS3n62Y09XxUWw+fJ+CntO/hPb8XYEngn52+uyg/CxKa4gNdcaIytDgsGuw/AjbFr4MVUR/C4bR9cDRtv6NDi1OSoBMqsyYe8uoNXX37OyYIJLVZHcqTI7SDVJB/SyQOWDwX2qCyaoJeXZuXus6xPQcJTEtI4uXQlh0wQDcevAL8nPZHsD+RdGtKGsMfa7o4I2Hcsg06dvOEWdGRsDh1E/TVDkQHLhFmTN6OCWwXeH9nIk+CZeRl/AIXii9KpNlV5zBVB1FWe95o3yZcJbLaoy10DfBx1EfkvYnuoL26M3/Zk0DpTzef/jA7JQHGRf8F88fOkLElxXmH6JEmQNMSae4DmOvPhfXDxiFZ27jPeQQJfD91I8+z9m/5ho9Yfqd5CN5JXMmDhoxDazZLuZ6cWNcgTyr2NMZO2tV9VjgQFgOn4q/mj3NS1kA7zB/Pnc6F0xmZMC3xY3gtNQG6+T4OFkH6qOezwNdc6ovgwkQKoZVyJQ3DZfSFEYEvw1j9NBgTGsJzL61uAvTWPgmblq2AieFz+IeDozGV2BApJbA7wz6EtMhP0Q/2hAe1j0EHrx5wt6YTeHj35EGIR2SQAlJxxq9wzpgOJbjM37IPxJJLjrZHRrwG7TFPpJQqc88BCE76B3RAMulm0nd3OyI/hr2GhAb1R3oqqQwnjzUJzkN5bXxpWAnfoeooUfUNmshHFb3QlLIx7+rq1QeGhwbzYVe53ZFXIRG5xqO8yGiNPqyDV3e4S90JynPOImlZSNjl69pqi2omgv6oG8sj7MXTeXC/dy9Mujvz4LbPsIaXKw194V1wLYA6UaD90ykXpUimSQGDXpklzilJ/RqJ8kTSfIIC4WDyTlRJF2jboR0qsQ8EhIdCUU4efIcOvvYHOKSuQuOxetv6PY5WhofPgrzjv8C/8dx71BJhxqXx0E37OByK3wyZyangjmlML0y+S3Ly+Xnn0O9eqaFcpb670m3nChRcU2B/nAkJS1yOGgCHaG2YDDM8PwcT5h2GOE7SCeP38HrKWvDGSBg7bR68c3gL5oAB3D9tj/qH048OO6AfnbDyPU5SMZK/b9o7MFA/meedG0Lmg8l4mE9O9J/9Egxb/CZPvq/OUzGu1s2BYXDaeESxHYEHEecvFjgdCwvMtSdTRzBF0PcYCtuWrYJT6Se4OYl4GvmkTv16gw7zPXLyv0HTXBUyD9q438M//4pHEkVs5LGgcTAjNZ4rqz48HDAMZh5JhK7oKy+XlsLaQD0UI+GkvqSp87mvnJW9DQaG/5mbfhW2TSMiKvTpBfna5d1HOyXvav8Zfz9G+RgFZIulnP5502ZCUvy/oCGg2Q8KGBR57+VfmtPdvwy5mJddyJFUdtGutr5IzMTY9zi5NmwxEZX0Q8KX19TnHRQA/iujUNEAV4rLYI1fCJzNOHnNMZ7a/nA/JuW/QQXShZfmFHD/egYJq3LBbGtivO4l+CD2E77evXX7enly5gPpsVWj3hGmTJ9/kWmUHP2Q0CngrfOHkV5vcTLJtMmcsvccgl1R/4QljwXCpKSl8AAGgIBVUfxz/3N2gtRorqNjI0FEJeUgGVtDIqAv1qVd/AbP+YisK6WXoMScD6eS98ARQ8Nudt19h+bwgQI9NffFJ2CQBI3Hb93b8au5XFoGWWkHscMCqi+XK6gAnToVwiq/qfCE/kXoGfAnCEyKgVX9n+eqfGbVQgwUh+F4/BY4kfAVP/bH+GR+kx5Cc6ZRB7NPNJA50zkNVVxtPKkdKo3CVKD4zbEiyaaq0oWCSrWAJgxGPT4Ycs050Jx4AM2tB0ZIMj1ab42mR0GLyCCz2x6ygEfMyUfWwz2azo5gQMotQvLzMO05mbAVLpnzoTnRRa2G/dk/Se1V2+Z2+617vd+LKBPIij1U1lYmXPWgx4iv4tTVmWYgkQgbHDGdBwM5OkpRm0Fu2lE4ELkCCpEgUheBiOoWoIVeumehk/aP/DiZaFrPT/sB9oVEwWVzATQV7T084IuUbUBWh+Nhc7Wb+FQ3oYO5vuOdmvlpS1mwIKhW03ouzkDHRP0NNsSvhcaCzIv8VxcyPcwHS015UIX+qyj9V+6/yPTaoRk+tWoB7A6hN6wYaGMjwIgEkdIoQSYSO+DI5W6MtKTaS0gcJdqZhi+gKZiomwxh4X/BGXU1/82Y7WXPNu3joKk4I15aSG8F5PHHkJfZgeyf2TMBYxr8KNKVcq9XD/b8qS9x2dOxDQlj409tZmjGLdLmQO1QtjFlO+9bnlXqY67l8hxoThRUVmryxcu76VmuXBLxQXjXWg/Am1K660azIOv3zDti2nX7+kaEsOet+9n92j80W3uDkLjElG94XwqsFfZ+VexG8ryhpVBgrQwusJSbzmKD9JYTPSBfEru82Yj8fdDoevepg0Y1Sxtd1WoWl/QFv/azRB71w1qxu0C85As3CgWWy8HnrJWmc3gRcjHErnC8EHQrFncPDxYV/YHjes9ZeTEVWCqD4WaBiCxEIgvFSlZoqWBZRQXszYj5txSRRNyb4fNZdmE+f62kCMnDUnxOLF9osv+pgpuKYlapwQtbSBd33l6OZf/CXtBNuenkvYXEncKbevXaKorpWm8J4mqDiDxvqYy7gBfKi0UictJNIJLaPJb1i3Qd4hW+RPKWFN+KxNVGMUZsJC+uGC/8or1kZJ9ko+2v2rZkoVfnvkr5llHbxdYqaSle2Uw3F243EJEl4pXdWBiVUuzQ1yk7WsQ/DkXiqG7elkVqj9ouFit94XYHKmFsqeWKiV7bLcNCy09iVzJ1MxDpiSnJusSNvE5sg9dfZrX8dxBXG2WYLpRZqkz0lr1cPm0kkfRi59+jP8I6LPZCxFWZkLxg+G8HEXkZiaSXyemzhfyiQvZORDgSqXGJuPl4bB6eU24/H+spRgIXwv8SKtE/lldVLazAzmNhVDKzs9hkhb++MT88nOUXFuKxIj8eySsuF8WF7CZG1ia9hN4cICJtbqqFbipVkPwu42mc9VlmMPDXgekLpn5e/WDyFJ304bT9+QxOZS1t26r1Qpxycv4p1P8CiMhKiyWOXlCvsoj8mxFayr/5UiqbK+W/L30H14OIrEIiLRariT5PpU+8LFa+vqRSFH3hDu7gDu6g+fAfuyBhHSn/0D0AAAAASUVORK5CYII=';
  const POOL_ICON_ORHEA =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGcgY2xpcC1wYXRoPSJ1cmwoI2NsaXAwXzIxNDcyXzc0MjIpIj4KPHBhdGggZD0iTTEwIDAuMzQ5NjA5QzE1LjMyOTYgMC4zNDk2MDkgMTkuNjUwNCA0LjY3MDQ1IDE5LjY1MDQgMTBDMTkuNjUwNCAxNS4zMjk1IDE1LjMyOTYgMTkuNjUwNCAxMCAxOS42NTA0QzQuNjcwNDUgMTkuNjUwNCAwLjM0OTYwOSAxNS4zMjk1IDAuMzQ5NjA5IDEwQzAuMzQ5NjA5IDQuNjcwNDYgNC42NzA0NSAwLjM0OTYyMiAxMCAwLjM0OTYwOVoiIGZpbGw9IiMwOTEyMUEiIHN0cm9rZT0iIzRDNEM0QyIgc3Ryb2tlLXdpZHRoPSIwLjciLz4KPHBhdGggZD0iTTEwLjEwNjQgMTUuNDYwOUwxMS4zODY3IDE2LjUyNjRMMTEuMDUzNyAxNi44MTI1TDEwLjA3ODEgMTUuNDk5TDkuMTAzNTIgMTYuODEyNUw4Ljc3MDUxIDE2LjUyNjRMMTAuMDQ5OCAxNS40NjA5TDkuOTU3MDMgMTUuMzM1OUwxMC4wNzgxIDE1LjQzNjVMMTAuMjAwMiAxNS4zMzU5TDEwLjEwNjQgMTUuNDYwOVpNNy41MzIyMyAxMy40MzE2QzguOTQzMjMgMTMuODEyNiA5LjcwOTM5IDE0LjgyODYgOS45MTYwMiAxNS4yODkxQzkuODkxNDUgMTUuMjg0MyA5Ljg2NzIzIDE1LjI3NjkgOS44NDI3NyAxNS4yNzE1QzguODg4NTEgMTUuOTkyNyA3LjQxMTc0IDE2LjA4NDQgNi44OTE2IDE1LjgxNTRDNy45MDg3NCAxNS4xNDM1IDguOTYwNjcgMTUuMTAyMyA5LjU2MTUyIDE1LjE5MzRDOC41MjkwMSAxNC44NDkxIDcuNjYwNzQgMTMuOTQ1MiA3LjUzMjIzIDEzLjQzMTZaTTEyLjYyODkgMTMuNDMxNkMxMi41MDAxIDEzLjk0NjQgMTEuNjI3NSAxNC44NTI4IDEwLjU5MTggMTUuMTk1M0MxMS4xOTAxIDE1LjEwMTQgMTIuMjUwOSAxNS4xMzggMTMuMjc2NCAxNS44MTU0QzEyLjc1NTkgMTYuMDg0NiAxMS4yNzc0IDE1Ljk5MjkgMTAuMzIzMiAxNS4yNzA1QzEwLjI5NzEgMTUuMjc2NCAxMC4yNzE0IDE1LjI4NCAxMC4yNDUxIDE1LjI4OTFDMTAuNDUxOSAxNC44Mjg2IDExLjIxOCAxMy44MTI2IDEyLjYyODkgMTMuNDMxNlpNMTEuNzE2OCAxNC44NDQ3QzEyLjAzNDkgMTQuNjgwNSAxMy4wODE4IDE0LjQyMTYgMTMuODkyNiAxNC45Mjc3QzEzLjU2MDkgMTUuMTgxNiAxMi40NzM0IDE1LjIzOSAxMS43MTY4IDE0Ljg0NDdaTTUuOTQxNDEgMTQuOTA3MkM2LjgwOTk0IDE0LjM2NDkgNy45MzE5MiAxNC42NDE1IDguMjcyNDYgMTQuODE3NEM3LjQ2MjE3IDE1LjIzOTggNi4yOTY5MyAxNS4xNzkxIDUuOTQxNDEgMTQuOTA3MlpNMy45MDYyNSAxMy44MzVDNC4zMzQzOCAxMy42NjE3IDUuODM2NDMgMTMuMzc1NiA2Ljk0NTMxIDE0LjM1MTZDNi42NTIyOCAxNC41Mzg2IDQuNzA3MjcgMTQuNTQgMy45MDYyNSAxMy44MzVaTTEzLjIxNDggMTQuMzUxNkMxNC4zMjM3IDEzLjM3NTYgMTUuODI1NyAxMy42NjE3IDE2LjI1MzkgMTMuODM1QzE1LjQ1MjUgMTQuNTQgMTMuNTA2OSAxNC41Mzg3IDEzLjIxNDggMTQuMzUxNlpNNS44MTkzNCAxMS43Njc2QzYuMjMyOTEgMTEuOTc0NCA3LjQzOTM4IDEyLjkxMDkgNy40Mzk0NSAxNC4zODY3QzcuMTA1MyAxNC4yOTA3IDUuODE5NDggMTIuODM0MSA1LjgxOTM0IDExLjc2NzZaTTE0LjM1MTYgMTEuNzY3NkMxNC4zNTE0IDEyLjgzNDQgMTMuMDY0MiAxNC4yOTE1IDEyLjczMDUgMTQuMzg2N0MxMi43MzA1IDEyLjkxMDUgMTMuOTM4MyAxMS45NzQxIDE0LjM1MTYgMTEuNzY3NlpNMy45MDYyNSAxMi4xMjIxQzQuMzY4MTMgMTIuMTE3NCA1Ljg3MDcgMTIuNDAwMiA2LjU0NDkyIDEzLjcxMzlDNi4yMDQwOCAxMy43ODA5IDQuMzkzNDIgMTMuMDcxMiAzLjkwNjI1IDEyLjEyMjFaTTE2LjI1MzkgMTIuMTIyMUMxNS43NjY1IDEzLjA3MTMgMTMuOTU1NiAxMy43ODEyIDEzLjYxNTIgMTMuNzEzOUMxNC4yODkzIDEyLjQwMDEgMTUuNzkxOCAxMi4xMTc1IDE2LjI1MzkgMTIuMTIyMVpNNC45NjI4OSAxMC4yODcxQzUuMzAyOTkgMTAuNzAyNiA1LjYwOTY1IDExLjQzMjMgNS4yMTA5NCAxMi4zNDY3QzUuMDI5OTUgMTIuMTk3NyA0LjY3NDg0IDEwLjk0ODEgNC45NjI4OSAxMC4yODcxWk0xNS4yNDggMTAuMzk0NUMxNS41MTY2IDExLjAxMTUgMTUuMTg0NSAxMi4xNzc0IDE1LjAxNTYgMTIuMzE2NEMxNC42NDM2IDExLjQ2MjkgMTQuOTMwNSAxMC43ODIyIDE1LjI0OCAxMC4zOTQ1Wk0yLjk2ODc1IDEwLjM3MTFDMy42MzgwNyAxMC40NzYzIDQuNTQwNjcgMTAuOTA1NiA0LjkzNDU3IDEyLjEwMDZDNC42Mzg5NSAxMi4xMTIzIDMuMzAyMjEgMTEuNTI4NSAyLjk2ODc1IDEwLjM3MTFaTTE3LjIwNyAxMC4zNzExQzE2Ljg3MzYgMTEuNTI4NSAxNS41MzY3IDEyLjExMjQgMTUuMjQxMiAxMi4xMDA2QzE1LjYzNTEgMTAuOTA1NiAxNi41Mzc3IDEwLjQ3NjMgMTcuMjA3IDEwLjM3MTFaTTMuMzMzMDEgOC43Mjc1NEMzLjkzNzYyIDkuMDMzMDYgNC42NjQ0NiA5LjcxODQyIDQuNjcxODggMTAuOTc2NkM0LjM4NzAzIDEwLjg5NzEgMy4yOTQ0OSA5LjkzMTM1IDMuMzMzMDEgOC43Mjc1NFpNMTYuODI0MiA4LjcyNzU0QzE2Ljg2MjcgOS45MzA3NiAxNS43NzE4IDEwLjg5NjIgMTUuNDg2MyAxMC45NzY2QzE1LjQ5MzcgOS43MTg1MyAxNi4yMTk2IDkuMDMzMSAxNi44MjQyIDguNzI3NTRaTTUuNTQ5OCA3Ljc2MzY3QzUuNjk1MzcgOC40MjQ3NiA1LjYyMzk0IDkuNDIwMTEgNC42NTMzMiAxMC4yMjE3QzQuNTM0OTQgOS45NTAzIDQuNTkyNTkgOC40OTUxNCA1LjU0OTggNy43NjM2N1pNMTQuNjA3NCA3Ljc2MzY3QzE1LjU2NDQgOC40OTUxIDE1LjYyMjIgOS45NTAxMyAxNS41MDM5IDEwLjIyMTdDMTQuNTMzMiA5LjQyMDEgMTQuNDYxOSA4LjQyNDc4IDE0LjYwNzQgNy43NjM2N1pNMy4zODM3OSA2LjkwOTE4QzMuOTE3MzYgNy4zMjYzNyA0LjU3NjU4IDguMDU0NSA0LjMzODg3IDkuMjkwMDRDNC4wNzQ2MSA5LjE1NjE2IDMuMTExOTMgOC4wODIwMSAzLjM4Mzc5IDYuOTA5MThaTTE2Ljc3NzMgNi45MDkxOEMxNy4wNDk0IDguMDgyNDUgMTYuMDg2MiA5LjE1NjcgMTUuODIyMyA5LjI5MDA0QzE1LjU4NDcgOC4wNTQ3OSAxNi4yNDM4IDcuMzI2NDEgMTYuNzc3MyA2LjkwOTE4Wk0xNS41NTc2IDYuMTg5NDVDMTYuMTQ5MyA2Ljk0MzE4IDE1LjgxNzEgOC4wNDE2NyAxNS42NzE5IDguMjI2NTZDMTUuMjI3NSA3LjQ0NjY5IDE1LjQxNzYgNi42NTA4OSAxNS41NTc2IDYuMTg5NDVaTTQuNjEyMyA2LjE3NDhDNC43NTI4MiA2LjYzODEgNC45NDIwMiA3LjQzNjEyIDQuNDk2MDkgOC4yMTg3NUM0LjM1MDE3IDguMDMxODEgNC4wMTg3NyA2LjkzMDgyIDQuNjEyMyA2LjE3NDhaTTYuODkyNTggNi4wNTU2NkM2LjYyNDk1IDYuNTk5ODMgNi4xMTU0NSA3LjQ5MzIxIDUuMDM3MTEgNy44MjkxQzUuMDYyOTQgNy41MzQwMSA1LjcwMTg4IDYuMjQxMTYgNi44OTI1OCA2LjA1NTY2Wk0xMy4yNzY0IDYuMDU1NjZDMTQuNDY2OCA2LjI0MTQyIDE1LjEwNSA3LjUzNCAxNS4xMzA5IDcuODI5MUMxNC4wNTI2IDcuNDkzMjEgMTMuNTQ0IDYuNTk5ODQgMTMuMjc2NCA2LjA1NTY2Wk01LjU0Njg4IDQuMzM4ODdDNS44NTg5OCA0Ljg2MTgyIDUuODU5MzIgNi4wNTIxNyA1LjE0NDUzIDYuOTU3MDNDNC45NzQwNyA2LjcxNTQ2IDQuNzU1NzkgNS4yNDc0OCA1LjU0Njg4IDQuMzM4ODdaTTE0LjYxMTMgNC4zMzg4N0MxNS40MDI0IDUuMjQ3NDYgMTUuMTg0MSA2LjcxNTM3IDE1LjAxMzcgNi45NTcwM0MxNC4yOTg5IDYuMDUyMTYgMTQuMjk5MiA0Ljg2MTgyIDE0LjYxMTMgNC4zMzg4N1pNNy4yNDQxNCA0LjEzOTY1QzcuMjg0MDcgNC43NDcyOSA2Ljc0MjAzIDUuODA3OSA1LjY5MzM2IDYuMjg5MDZDNS42NTE0IDUuOTk2NTggNi4xMjU4MiA0LjU4OTU1IDcuMjQ0MTQgNC4xMzk2NVpNMTIuOTIxOSA0LjEzOTY1QzE0LjA0IDQuNTg5NjcgMTQuNTE0NiA1Ljk5NjYgMTQuNDcyNyA2LjI4OTA2QzEzLjQyNCA1LjgwNzg5IDEyLjg4MTkgNC43NDcyOSAxMi45MjE5IDQuMTM5NjVaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNOC42NjM5MSA2LjQ5MDUyTDguNTI3MjkgNi45Mzg2N0w5LjIxMjEyIDYuOTEwNjRMOS4yNzQzIDYuNjk3OUM5LjI3MTU2IDYuNTgzMzYgOS4xMjMzMSA2LjAyNTEyIDkuMDk4OTEgNS45MzM5NkM5LjA5ODU4IDUuOTMwNTYgOS4wOTc1NSA1LjkyNjE0IDkuMDk1NTMgNS45MjA1MkM4Ljk3NDg3IDYuMDA5NjcgOC42NjM5MSA2LjQ5MDUyIDguNjYzOTEgNi40OTA1MloiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik04LjQ2MDY1IDcuMzY2MDdMOC4xNTQ0MiA4LjM1NTk4TDguNjg1MzIgOS4zOTQ4N0w5LjQ3ODE3IDkuNDYwMTVMOS44NDc0NCA4Ljk2MTk5TDkuODQwMTMgOC4zODg5NUw5LjU0MTEzIDcuNTQwNTlMOC40NjA2NSA3LjM2NjA3WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTcuMDg0OTUgOC4yMTYxN0w3LjIwNzUxIDguMDc4MjhMNy4zMDg0NCA4LjQyNDUxTDcuNDQyNTEgOC43OTk2M0w3LjM4MDUxIDguODk1MTNMNi45NTIyNiA5LjAzODUzTDYuODIzNTggOC44NTUwM0w3LjA4NDk1IDguMjE2MTdaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNi45NzA1NyAxMC4zMTUzTDYuNzg4MDkgOS40NzM4Nkw3Ljg5NzAzIDkuMTcxOTNMOC42OTM1OCAxMC4zMDc5TDcuODk3MDMgMTEuMTc5Mkw2Ljk3MDU3IDEwLjMxNTNaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTAuNjQwNiA2LjA4MzQzTDEwLjc1MTIgNS44MzQ5NkwxMS4zMjEyIDYuNjQ3ODJMMTEuMjY4OCA2LjcwMjYxTDEwLjc4MjIgNi44NTM5N0wxMC42NjIzIDYuNTgxNDdMMTAuNjQwNiA2LjA4MzQzWiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTEwLjMxMDkgOC4zOTU1NUwxMC41Njg1IDcuMjYwMDlMMTEuNDI5OCA3LjEyNzc0TDEyLjAwMzkgOC4xMDg4NEwxMS43NDE0IDkuMTc2NDJMMTEuMzQwMiA5LjQ1NzIyTDEwLjcwNzkgOS4yODY2OEwxMC4zMTA5IDguMzk1NTVaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNNy45MjkxIDExLjc3N0w4Ljg5NDIgMTAuOTQ1Nkw5Ljg1OTI2IDkuODMwNTZMMTEuMDIyNyAxMC4xOTM0TDExLjc2OTggMTEuMjU4OUwxMi41NDg3IDEyLjQ1ODZMMTEuOTU2NyAxMi45NDMzTDEwLjIwMTcgMTMuMzExM0w3Ljk3MDIgMTIuODY4Nkw3LjcyOTA3IDEyLjIwMDdMNy45MjkxIDExLjc3N1oiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0xMi45MjYzIDcuODA1NjRMMTIuODcxMyA4LjEyOTMyTDEyLjgzMzIgOC40MDA0NkwxMy4zMzk5IDguNjIxNDJMMTMuNDAyNSA4LjE5NTA4TDEzLjEwMzIgNy44ODU1NEwxMi45MjYzIDcuODA1NjRaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMTIuNDg5MyA4LjkzMTMyTDExLjYxNTYgMTAuMTkzM0wxMi4zMzQ3IDExLjE3OTJMMTIuNzI2NiAxMS4yMDVMMTMuNDAyNCA5Ljg3ODA5TDEzLjE4ODIgOS4yNjA2MkwxMi40ODkzIDguOTMxMzJaIiBmaWxsPSJ3aGl0ZSIvPgo8L2c+CjxkZWZzPgo8Y2xpcFBhdGggaWQ9ImNsaXAwXzIxNDcyXzc0MjIiPgo8cmVjdCB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIGZpbGw9IndoaXRlIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg==';
  const POOL_ICON_STNEAR =
    "data:image/svg+xml;utf8,%3csvg width='96' height='96' viewBox='0 0 96 96' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='96' height='96' rx='48' fill='white'/%3e%3cpath fill-rule='evenodd' clip-rule='evenodd' d='M48.0006 20L41.2575 26.7431L48.0006 33.4862L54.7437 26.7431L48.0006 20ZM37.281 30.7188L30.7144 37.2853L47.9998 54.5707L65.2851 37.2853L58.7186 30.7188L47.9998 41.4376L37.281 30.7188ZM26.7384 41.261L19.9953 48.0041L47.9995 76.0083L76.0037 48.0041L69.2606 41.2611L47.9995 62.5221L26.7384 41.261Z' fill='%23231B51'/%3e%3c/svg%3e";
  const POOL_ICON_LINEAR =
    "data:image/svg+xml;utf8,%3Csvg width='40' height='40' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M30.74 28.78c.21-.36.32-.78.32-1.21v-6.33c0-.24-.06-.46-.17-.66-.12-.21-.28-.38-.48-.49l-16.86-9.77c-.35-.2-.73-.31-1.13-.32-.64 0-1.24.26-1.69.72-.45.45-.7 1.07-.71 1.71v6.39c0 .24.06.47.18.67.11.21.28.37.48.48l16.82 9.71c.36.22.77.32 1.19.32.41 0 .82-.12 1.19-.33.36-.21.66-.52.86-.89zm.32-16.27c0-.42-.1-.84-.29-1.21-.2-.38-.49-.7-.85-.93-.36-.22-.78-.34-1.21-.34-.42 0-.84.12-1.21.34l-4.97 2.81c-.04.02-.08.07-.1.12-.03.04-.04.1-.04.14 0 .06.01.11.04.16.02.04.06.08.1.1l8.05 4.62c.05.02.1.04.15.04.05 0 .1-.02.15-.05.04-.02.08-.06.11-.11.02-.04.04-.1.03-.15l.04-5.54zM10.05 27.5c-.01.43.08.86.28 1.23.2.38.49.7.85.93.36.22.78.34 1.2.34.42 0 .83-.12 1.2-.34l4.92-2.85c.04-.02.08-.06.1-.11.03-.04.05-.1.05-.15 0-.05-.02-.11-.05-.15-.02-.05-.06-.09-.1-.12l-8.05-4.6c-.05-.03-.09-.04-.15-.04-.05 0-.1.01-.15.04-.05.02-.08.07-.11.12-.02.04-.04.09-.04.14l.05 5.56z' fill='url(%23paint0_linear_186_370)'/%3E%3Cdefs%3E%3ClinearGradient id='paint0_linear_186_370' x1='11.135' y1='11.152' x2='30.145' y2='30.457' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%231BB3CC'/%3E%3Cstop offset='1' stop-color='%23824ACC'/%3E%3C/linearGradient%3E%3C/defs%3E%3C/svg%3E";
  const POOL_ICON_NEARX =
    "data:image/svg+xml;utf8,%3Csvg width='24' height='24' viewBox='0 0 24 24' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M24 12C24 18.6274 18.6274 24 12 24C5.37258 24 0 18.6274 0 12C0 5.37258 5.37258 0 12 0C18.6274 0 24 5.37258 24 12ZM17.1421 21.3847L21.3848 17.1421L19.3669 15.1243C18.5576 17.0302 17.0303 18.5576 15.1243 19.3669L17.1421 21.3847ZM9.4329 19.5792C7.45318 18.9089 5.82112 17.4847 4.87847 15.6484L3.24263 17.2842L7.48527 21.5269L9.4329 19.5792ZM4.63307 8.87568C5.4424 6.96973 6.96977 5.44237 8.87573 4.63305L7.24263 2.99995L2.99999 7.24259L4.63307 8.87568ZM15.6484 4.87847L17.3848 3.14209L21.6274 7.38473L19.5792 9.4329C18.9089 7.45318 17.4847 5.82112 15.6484 4.87847Z' fill='%232FA8AF'/%3E%3Cpath d='M8.00119 11.9921C8.00119 11.0268 8.00119 10.0615 8.00119 9.09612C8.00119 8.50505 8.16497 8.1743 8.56285 8.05781C8.97778 7.93628 9.40619 7.97917 9.79565 8.45228C11.3533 10.3447 12.9343 12.218 14.5092 14.0959C14.5692 14.1676 14.6117 14.3122 14.734 14.2626C14.8496 14.2157 14.7858 14.0805 14.786 13.9878C14.7904 12.6326 14.7898 11.2774 14.7868 9.92226C14.7868 9.83668 14.838 9.7162 14.7271 9.67372C14.6401 9.64029 14.5824 9.74185 14.522 9.79358C14.0492 10.1981 13.5804 10.6073 13.1088 11.0133C13.0208 11.089 12.9332 11.2118 12.8002 11.1012C12.6657 10.9894 12.7696 10.8872 12.8364 10.7881C13.3547 10.0186 13.8728 9.24898 14.3909 8.47919C14.6656 8.07085 15.0079 7.92282 15.4056 8.04141C15.786 8.15475 15.9986 8.48592 15.9992 8.97668C16.0007 10.0905 15.9996 11.2045 15.9996 12.3183C15.9996 13.2094 16.0003 14.1005 15.9994 14.9916C15.999 15.4826 15.8137 15.798 15.4512 15.9324C15.0256 16.0901 14.5767 15.9683 14.2734 15.6058C12.6823 13.705 11.0924 11.8029 9.50198 9.90144C9.46029 9.85161 9.42303 9.7961 9.37377 9.75489C9.28998 9.68487 9.21967 9.68108 9.21314 9.81797C9.20999 9.88273 9.21188 9.94791 9.21188 10.0129C9.21188 11.3496 9.21062 12.6862 9.2142 14.0227C9.21441 14.1186 9.15609 14.2557 9.26114 14.3038C9.38093 14.3587 9.45061 14.2178 9.52998 14.1503C9.98259 13.7651 10.4291 13.3728 10.8805 12.9859C10.9729 12.9066 11.0626 12.7651 11.208 12.8973C11.3402 13.0176 11.2213 13.1196 11.159 13.2127C10.6323 13.9989 10.1032 14.7837 9.57145 15.5663C9.32788 15.9248 8.9881 16.056 8.61085 15.9488C8.23739 15.8428 8.00498 15.5246 8.00287 15.0827C7.99761 14.0523 8.00119 13.022 8.00119 11.9917V11.9921Z' fill='white'/%3E%3C/svg%3E";
  const POOL_ICON_USDT =
    "data:image/svg+xml;utf8,%3Csvg width='111' height='90' viewBox='0 0 111 90' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M24.4825 0.862305H88.0496C89.5663 0.862305 90.9675 1.64827 91.7239 2.92338L110.244 34.1419C111.204 35.7609 110.919 37.8043 109.549 39.1171L58.5729 87.9703C56.9216 89.5528 54.2652 89.5528 52.6139 87.9703L1.70699 39.1831C0.305262 37.8398 0.0427812 35.7367 1.07354 34.1077L20.8696 2.82322C21.6406 1.60483 23.0087 0.862305 24.4825 0.862305ZM79.8419 14.8003V23.5597H61.7343V29.6329C74.4518 30.2819 83.9934 32.9475 84.0642 36.1425L84.0638 42.803C83.993 45.998 74.4518 48.6635 61.7343 49.3125V64.2168H49.7105V49.3125C36.9929 48.6635 27.4513 45.998 27.3805 42.803L27.381 36.1425C27.4517 32.9475 36.9929 30.2819 49.7105 29.6329V23.5597H31.6028V14.8003H79.8419ZM55.7224 44.7367C69.2943 44.7367 80.6382 42.4827 83.4143 39.4727C81.0601 36.9202 72.5448 34.9114 61.7343 34.3597V40.7183C59.7966 40.8172 57.7852 40.8693 55.7224 40.8693C53.6595 40.8693 51.6481 40.8172 49.7105 40.7183V34.3597C38.8999 34.9114 30.3846 36.9202 28.0304 39.4727C30.8066 42.4827 42.1504 44.7367 55.7224 44.7367Z' fill='%23009393'/%3E%3C/svg%3E";
  const POOL_ICON_USDC =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256'%3E%3Ccircle cx='128' cy='128' r='128' fill='%232775CA'/%3E%3Cpath fill='%23FFFFFF' d='M104,217c0,3-2.4,4.7-5.2,3.8C60,208.4,32,172.2,32,129.3c0-42.8,28-79.1,66.8-91.5c2.9-0.9,5.2,0.8,5.2,3.8v7.5c0,2-1.5,4.3-3.4,5C69.9,65.4,48,94.9,48,129.3c0,34.5,21.9,63.9,52.6,75.1c1.9,0.7,3.4,3,3.4,5V217z'/%3E%3Cpath fill='%23FFFFFF' d='M136,189.3c0,2.2-1.8,4-4,4h-8c-2.2,0-4-1.8-4-4v-12.6c-17.5-2.4-26-12.1-28.3-25.5c-0.4-2.3,1.4-4.3,3.7-4.3h9.1c1.9,0,3.5,1.4,3.9,3.2c1.7,7.9,6.3,14,20.3,14c10.3,0,17.7-5.8,17.7-14.4c0-8.6-4.3-11.9-19.5-14.4c-22.4-3-33-9.8-33-27.3c0-13.5,10.3-24.1,26.1-26.3V69.3c0-2.2,1.8-4,4-4h8c2.2,0,4,1.8,4,4v12.7c12.9,2.3,21.1,9.6,23.8,21.8c0.5,2.3-1.3,4.4-3.7,4.4h-8.4c-1.8,0-3.3-1.2-3.8-2.9c-2.3-7.7-7.8-11.1-17.4-11.1c-10.6,0-16.1,5.1-16.1,12.3c0,7.6,3.1,11.4,19.4,13.7c22,3,33.4,9.3,33.4,28c0,14.2-10.6,25.7-27.1,28.3V189.3z'/%3E%3Cpath fill='%23FFFFFF' d='M157.2,220.8c-2.9,0.9-5.2-0.8-5.2-3.8v-7.5c0-2.2,1.3-4.3,3.4-5c30.6-11.2,52.6-40.7,52.6-75.1c0-34.5-21.9-63.9-52.6-75.1c-1.9-0.7-3.4-3-3.4-5v-7.5c0-3,2.4-4.7,5.2-3.8C196,50.2,224,86.5,224,129.3C224,172.2,196,208.4,157.2,220.8z'/%3E%3C/svg%3E";
  const POOL_ICON_ETH =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23627EEA'/%3E%3Cpath d='M16.4 5v8.2l6.9 3.1L16.4 5z' fill='%23fff' fill-opacity='.6'/%3E%3Cpath d='M16.4 5L9.5 16.3l6.9-3.1V5z' fill='%23fff'/%3E%3Cpath d='M16.4 21.5V27l6.9-9.6-6.9 4.1z' fill='%23fff' fill-opacity='.6'/%3E%3Cpath d='M16.4 27v-5.5l-6.9-4.1L16.4 27z' fill='%23fff'/%3E%3Cpath d='M16.4 20.2l6.9-4-6.9-3v7z' fill='%23fff' fill-opacity='.2'/%3E%3Cpath d='M9.5 16.2l6.9 4v-7l-6.9 3z' fill='%23fff' fill-opacity='.6'/%3E%3C/svg%3E";
  const POOL_ICON_STETH =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%2300A3FF'/%3E%3Cpath d='M16 6l-5.5 8.5L16 17.8l5.5-3.3L16 6z' fill='%23fff'/%3E%3Cpath d='M16 19.3l-6.2-3.7c-1 2.2-.3 5.2 1.7 7.1 2.5 2.3 6.5 2.3 9 0 2-1.9 2.7-4.9 1.7-7.1L16 19.3z' fill='%23fff' fill-opacity='.85'/%3E%3C/svg%3E";
  const POOL_ICON_SUSDE =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23111827'/%3E%3Ccircle cx='16' cy='16' r='14.5' fill='none' stroke='%2338BDF8' stroke-width='1.5'/%3E%3Cpath d='M10 11h12v2.4H12.8v1.8h7.4v2.2h-7.4v1.8H22V21.5H10V11z' fill='%23fff'/%3E%3C/svg%3E";
  const POOL_ICON_KHYPE =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23072723'/%3E%3Cpath d='M22 16c0 3.3-1.8 5.2-3.8 5.2-1.7 0-2.5-1.3-3.2-2.7-.5-1-.9-1.7-1.6-1.7-.9 0-1.4 1.1-1.4 2.6 0 1.4.4 2.4.4 2.4H9.6s-.6-1.1-.6-3c0-3.1 1.6-5.6 4.1-5.6 1.8 0 2.6 1.3 3.2 2.6.5 1 .9 1.8 1.7 1.8.9 0 1.4-1 1.4-2.4 0-1.3-.4-2.2-.4-2.2h2.7s.3 1.1.3 3z' fill='%2397FCE4'/%3E%3C/svg%3E";
  const POOL_ICON_JUP =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='jg' x1='0' y1='0' x2='32' y2='32' gradientUnits='userSpaceOnUse'%3E%3Cstop stop-color='%23C7F284'/%3E%3Cstop offset='1' stop-color='%2300BEF0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='16' fill='%230D1B2A'/%3E%3Cpath d='M8.5 12.5c4.5-3.2 10.5-3.2 15 0M7.2 16.5c5.4-3.3 12.2-3.3 17.6 0M9.2 20.5c4-2.4 9.6-2.4 13.6 0' stroke='url(%23jg)' stroke-width='2.4' stroke-linecap='round' fill='none'/%3E%3C/svg%3E";
  const POOL_ICON_MSOL =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%23183B37'/%3E%3Cpath d='M9 21V11l7 6.5L23 11v10' stroke='%2343D9A3' stroke-width='2.8' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E";
  const POOL_ICON_INF =
    "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%231E1B4B'/%3E%3Cpath d='M11.5 19.5c-2 0-3.5-1.5-3.5-3.5s1.5-3.5 3.5-3.5c2.2 0 4.5 3.5 4.5 3.5s2.3-3.5 4.5-3.5c2 0 3.5 1.5 3.5 3.5s-1.5 3.5-3.5 3.5c-2.2 0-4.5-3.5-4.5-3.5s-2.3 3.5-4.5 3.5z' stroke='%23A78BFA' stroke-width='2.4' fill='none'/%3E%3C/svg%3E";

  const STAKING_POOLS = [
    {
      id: 'rhea_rnear',
      name: 'Rhea Liquid Staking',
      protocol: 'Rhea Liquid Staking',
      category: 'staking',
      chain: 'near',
      chainLabel: 'NEAR',
      inSymbol: 'NEAR',
      outSymbol: 'rNEAR',
      icon: POOL_ICON_RNEAR,
      decimals: 24,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'lst.rhealab.near',
      method: 'deposit_and_stake',
      featured: true
    },
    {
      id: 'rhea_xrhea',
      name: 'Rhea xRHEA Staking',
      protocol: 'Rhea xRHEA Staking',
      category: 'staking',
      chain: 'near',
      chainLabel: 'NEAR',
      inSymbol: 'RHEA',
      outSymbol: 'xRHEA',
      icon: POOL_ICON_XRHEA,
      decimals: 18,
      isTokenStake: true,
      tokenContract: 'token.rhealab.near',
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'xtoken.rhealab.near',
      method: 'ft_transfer_call',
      featured: true
    },
    {
      id: 'rhea_orhea_convert',
      name: 'Rhea oRHEA Convert',
      protocol: 'Rhea oRHEA Convert',
      category: 'lending',
      chain: 'near',
      chainLabel: 'NEAR',
      inSymbol: 'oRHEA',
      outSymbol: 'RHEA',
      icon: POOL_ICON_ORHEA,
      decimals: 18,
      isTokenStake: true,
      isLockConvert: true,
      tokenContract: 'otoken.rhealab.near',
      lockTiers: null,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'orhea-conv.rhealab.near',
      method: 'ft_transfer_call',
      featured: true
    },
    {
      id: 'metapool_stnear',
      legacyIds: ['near'],
      name: 'Meta Pool',
      protocol: 'Meta Pool',
      category: 'staking',
      chain: 'near',
      chainLabel: 'NEAR',
      inSymbol: 'NEAR',
      outSymbol: 'stNEAR',
      icon: POOL_ICON_STNEAR,
      decimals: 24,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'meta-pool.near',
      method: 'deposit_and_stake',
      featured: true
    },
    {
      id: 'linear_near',
      name: 'LiNEAR Protocol',
      protocol: 'LiNEAR Protocol',
      category: 'staking',
      chain: 'near',
      chainLabel: 'NEAR',
      inSymbol: 'NEAR',
      outSymbol: 'LiNEAR',
      icon: POOL_ICON_LINEAR,
      decimals: 24,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'linear-protocol.near',
      method: 'deposit_and_stake',
      featured: false
    },
    {
      id: 'stader_nearx',
      name: 'Stader NearX',
      protocol: 'Stader NearX',
      category: 'staking',
      chain: 'near',
      chainLabel: 'NEAR',
      inSymbol: 'NEAR',
      outSymbol: 'NearX',
      icon: POOL_ICON_NEARX,
      decimals: 24,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'v2-nearx.stader-labs.near',
      method: 'deposit_and_stake',
      featured: false
    },
    {
      id: 'burrow_near_wnear',
      name: 'Burrow Finance NEAR',
      protocol: 'Burrow (Rhea Lend)',
      category: 'lending',
      chain: 'near',
      chainLabel: 'NEAR',
      inSymbol: 'NEAR',
      outSymbol: 'bNEAR',
      icon: POOL_ICON_NEAR,
      decimals: 24,
      isBurrowSupply: true,
      isNativeWrapSupply: true,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'contract.main.burrow.near',
      tokenContract: 'wrap.near',
      method: 'ft_transfer_call',
      featured: false
    },
    {
      id: 'burrow_near_usdt',
      name: 'Burrow Finance USDT',
      protocol: 'Burrow (Rhea Lend)',
      category: 'lending',
      chain: 'near',
      chainLabel: 'NEAR',
      inSymbol: 'USDT',
      outSymbol: 'bUSDT',
      icon: POOL_ICON_USDT,
      decimals: 6,
      isTokenStake: true,
      isBurrowSupply: true,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'contract.main.burrow.near',
      tokenContract: 'usdt.tether-token.near',
      method: 'ft_transfer_call',
      featured: false
    },
    {
      id: 'jito_sol',
      legacyIds: ['jito'],
      name: 'Jito Liquid Staking',
      protocol: 'Jito',
      category: 'staking',
      chain: 'sol',
      chainLabel: 'Solana',
      inSymbol: 'SOL',
      outSymbol: 'JitoSOL',
      icon: 'https://static.datapi.jup.ag/token-icons/86932ec91f48cf380c8b694112b68ec9c18528deecfb82b11a88dadd927c2c6e.webp',
      decimals: 9,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      mintOut: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
      contract: 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn',
      featured: true
    },
    {
      id: 'jupiter_jup',
      name: 'Jupiter DAO Staking',
      protocol: 'Jupiter DAO (ASR)',
      category: 'staking',
      chain: 'sol',
      chainLabel: 'Solana',
      inSymbol: 'JUP',
      outSymbol: 'Staked JUP',
      icon: POOL_ICON_JUP,
      decimals: 6,
      isTokenStake: true,
      isJupiterDao: true,
      tokenContract: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      inputMint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      lockerAddress: 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN',
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj',
      featured: true
    },
    {
      id: 'jupiter_sol',
      name: 'Jupiter Staked SOL',
      protocol: 'Jupiter Liquid Staking',
      category: 'staking',
      chain: 'sol',
      chainLabel: 'Solana',
      inSymbol: 'SOL',
      outSymbol: 'jupSOL',
      icon: 'https://static.datapi.jup.ag/token-icons/f65f73e25b3eadcdd65ac25be847bf9d2766822164fb118b37bb3824ee3cb69b.webp',
      decimals: 9,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      mintOut: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v',
      contract: 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v',
      featured: true
    },
    {
      id: 'marinade_msol',
      name: 'Marinade Finance',
      protocol: 'Marinade',
      category: 'staking',
      chain: 'sol',
      chainLabel: 'Solana',
      inSymbol: 'SOL',
      outSymbol: 'mSOL',
      icon: POOL_ICON_MSOL,
      decimals: 9,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      mintOut: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
      contract: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
      featured: false
    },
    {
      id: 'sanctum_inf',
      name: 'Sanctum Infinity',
      protocol: 'Sanctum',
      category: 'staking',
      chain: 'sol',
      chainLabel: 'Solana',
      inSymbol: 'SOL',
      outSymbol: 'INF',
      icon: POOL_ICON_INF,
      decimals: 9,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      mintOut: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm',
      contract: '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm',
      featured: false
    },
    {
      id: 'lido_steth',
      legacyIds: ['lido'],
      name: 'Lido Liquid Staking',
      protocol: 'Lido',
      category: 'staking',
      chain: 'eth',
      chainLabel: 'Ethereum',
      inSymbol: 'ETH',
      outSymbol: 'stETH',
      icon: POOL_ICON_STETH,
      decimals: 18,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
      method: 'submit(address)',
      featured: true
    },
    {
      id: 'arc_steak_usdc',
      name: 'Steakhouse Prime (Arc)',
      protocol: 'Steakhouse Morpho',
      category: 'lending',
      chain: 'arc',
      chainLabel: 'Arc Mainnet',
      inSymbol: 'USDC',
      outSymbol: 'steakUSDC',
      icon: POOL_ICON_USDC,
      decimals: 6,
      outDecimals: 18,
      tokenContract: '0x3600000000000000000000000000000000000000',
      useNativeOrPrecompile: true,
      isErc4626: true,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298',
      method: 'deposit(uint256,address)',
      featured: true
    },
    {
      id: 'aave_base_usdc',
      name: 'Aave V3 Base USDC',
      protocol: 'Aave V3',
      category: 'lending',
      chain: 'base',
      chainLabel: 'Base',
      inSymbol: 'USDC',
      outSymbol: 'aBasUSDC',
      icon: POOL_ICON_USDC,
      decimals: 6,
      outDecimals: 6,
      isTokenStake: true,
      isAaveV3: true,
      tokenContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
      method: 'supply(address,uint256,address,uint16)',
      featured: false
    },
    {
      id: 'aave_eth_usdc',
      name: 'Aave V3 Ethereum USDC',
      protocol: 'Aave V3',
      category: 'lending',
      chain: 'eth',
      chainLabel: 'Ethereum',
      inSymbol: 'USDC',
      outSymbol: 'aEthUSDC',
      icon: POOL_ICON_USDC,
      decimals: 6,
      outDecimals: 6,
      isTokenStake: true,
      isAaveV3: true,
      tokenContract: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      method: 'supply(address,uint256,address,uint16)',
      featured: false
    },
    {
      id: 'aave_arb_usdc',
      name: 'Aave V3 Arbitrum USDC',
      protocol: 'Aave V3',
      category: 'lending',
      chain: 'arb',
      chainLabel: 'Arbitrum',
      inSymbol: 'USDC',
      outSymbol: 'aArbUSDCn',
      icon: POOL_ICON_USDC,
      decimals: 6,
      outDecimals: 6,
      isTokenStake: true,
      isAaveV3: true,
      tokenContract: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      method: 'supply(address,uint256,address,uint16)',
      featured: false
    },
    {
      id: 'aave_eth_weth',
      name: 'Aave V3 Ethereum ETH',
      protocol: 'Aave V3',
      category: 'lending',
      chain: 'eth',
      chainLabel: 'Ethereum',
      inSymbol: 'ETH',
      outSymbol: 'aEthWETH',
      icon: POOL_ICON_ETH,
      decimals: 18,
      outDecimals: 18,
      isTokenStake: true,
      isAaveV3: true,
      isNativeWrapSupply: true,
      useNativeOrPrecompile: true,
      tokenContract: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      aTokenAddress: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      method: 'supply(address,uint256,address,uint16)',
      featured: false
    },
    {
      id: 'ethena_susde',
      name: 'Ethena Staked USDe',
      protocol: 'Ethena',
      category: 'lending',
      chain: 'eth',
      chainLabel: 'Ethereum',
      inSymbol: 'USDe',
      outSymbol: 'sUSDe',
      icon: POOL_ICON_SUSDE,
      decimals: 18,
      outDecimals: 18,
      isTokenStake: true,
      isErc4626: true,
      tokenContract: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
      method: 'deposit(uint256,address)',
      featured: false
    },
    {
      id: 'hyper_khype',
      name: 'Kinetiq kHYPE',
      protocol: 'Kinetiq',
      category: 'staking',
      chain: 'hype',
      chainLabel: 'HyperEVM',
      inSymbol: 'HYPE',
      outSymbol: 'kHYPE',
      icon: POOL_ICON_KHYPE,
      decimals: 18,
      isKyberSwapStake: true,
      apy: null,
      rate: null,
      tvlText: null,
      stakersCount: null,
      contract: '0xfD739d4e423301CE9385c1fb8850539D657C296D',
      featured: false
    }
  ];

  const _solFeeAtaCache = {};

  function safeRequire(relPath) {
    if (typeof require !== 'function') return null;
    try {
      return require(relPath);
    } catch (_) {
      return null;
    }
  }

  function getCryptoEngine() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCACrypto) ||
      (typeof window !== 'undefined' && window.NearCACrypto) ||
      (typeof globalThis !== 'undefined' && globalThis.NearCA && globalThis.NearCA.crypto) ||
      safeRequire('./crypto-engine.js')
    );
  }

  function getTokenRegistry() {
    return (
      (typeof globalThis !== 'undefined' && globalThis.NearCATokens) ||
      (typeof window !== 'undefined' && window.NearCATokens) ||
      (typeof globalThis !== 'undefined' && globalThis.NearCA && globalThis.NearCA.tokens) ||
      safeRequire('./token-registry.js')
    );
  }

  function getEthersLib() {
    return (
      (typeof window !== 'undefined' && window.ethers) ||
      (typeof globalThis !== 'undefined' && globalThis.ethers) ||
      safeRequire('../ethers.umd.min.js')
    );
  }

  function getConfiguredLang() {
    const lang =
      (typeof globalThis !== 'undefined' && globalThis.NearCAState && globalThis.NearCAState.lang) ||
      (typeof globalThis !== 'undefined' && globalThis.state && globalThis.state.currentLang) ||
      null;
    if (!lang) return null;
    return String(lang).toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }

  function t(zh, en) {
    const lang = getConfiguredLang();
    if (lang === 'zh') return zh;
    if (lang === 'en') return en;
    return `${zh} | ${en}`;
  }

  function normalizeDecimalInput(value) {
    const str = String(value === undefined || value === null ? '' : value).trim();
    if (!str) return '';
    if (!/[eE]/.test(str)) return str;
    const match = str.match(/^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
    if (!match) return str;
    const sign = match[1] === '-' ? '-' : '';
    const intPart = match[2];
    const fracPart = match[3] || '';
    const exp = parseInt(match[4], 10);
    const digits = intPart + fracPart;
    const pointPos = intPart.length + exp;
    if (pointPos <= 0) return sign + '0.' + '0'.repeat(-pointPos) + digits;
    if (pointPos >= digits.length) return sign + digits + '0'.repeat(pointPos - digits.length);
    return sign + digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
  }

  function toBaseUnits(amountInput, decimals) {
    const dec = Number.isInteger(decimals) && decimals >= 0 ? decimals : (Number(decimals) || 0);
    const normalized = normalizeDecimalInput(amountInput);
    if (!normalized || normalized.startsWith('-')) return '0';
    const num = Number(normalized);
    if (!Number.isFinite(num) || num <= 0) return '0';
    const parts = normalized.replace(/^\+/, '').split('.');
    const whole = (parts[0] || '0').replace(/\D/g, '') || '0';
    const fracRaw = (parts[1] || '').replace(/\D/g, '');
    const frac = fracRaw.slice(0, dec).padEnd(dec, '0');
    const combined = (whole + frac).replace(/^0+/, '');
    return combined || '0';
  }

  function fromBaseUnits(baseStr, decimals) {
    const dec = Number.isInteger(decimals) && decimals >= 0 ? decimals : (Number(decimals) || 0);
    const raw = String(baseStr === undefined || baseStr === null ? '0' : baseStr).trim();
    if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) return '0';
    if (dec === 0) return raw.replace(/^0+/, '') || '0';
    const padded = raw.padStart(dec + 1, '0');
    const splitIdx = padded.length - dec;
    const whole = padded.slice(0, splitIdx).replace(/^0+/, '') || '0';
    const frac = padded.slice(splitIdx).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
  }

  const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function base58Encode(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (arr.length === 0) return '';
    let zeros = 0;
    while (zeros < arr.length && arr[zeros] === 0) zeros++;
    let num = 0n;
    for (let i = zeros; i < arr.length; i++) {
      num = (num << 8n) | BigInt(arr[i]);
    }
    let out = '';
    while (num > 0n) {
      out = BASE58_ALPHABET[Number(num % 58n)] + out;
      num /= 58n;
    }
    return '1'.repeat(zeros) + out;
  }

  function base58Decode(str) {
    const clean = String(str || '').trim();
    if (!clean) return new Uint8Array(0);
    let zeros = 0;
    while (zeros < clean.length && clean[zeros] === '1') zeros++;
    let num = 0n;
    for (let i = zeros; i < clean.length; i++) {
      const idx = BASE58_ALPHABET.indexOf(clean[i]);
      if (idx < 0) throw new Error(`Invalid Base58 character: ${clean[i]}`);
      num = num * 58n + BigInt(idx);
    }
    const bytes = [];
    while (num > 0n) {
      bytes.unshift(Number(num & 0xffn));
      num >>= 8n;
    }
    const out = new Uint8Array(zeros + bytes.length);
    out.set(bytes, zeros);
    return out;
  }

  function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (typeof Buffer !== 'undefined') return Buffer.from(arr).toString('base64');
    let bin = '';
    for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  function base64ToBytes(b64) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(b64), 'base64'));
    const bin = atob(String(b64));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function hexToBytes(hexStr) {
    const clean = String(hexStr || '').replace(/^0x/i, '');
    if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
      throw new Error('Invalid hex string');
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function concatUint8Arrays(arrs) {
    const total = arrs.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const a of arrs) {
      out.set(a, offset);
      offset += a.length;
    }
    return out;
  }

  function decodeCompactU16(bytes, offset = 0) {
    let val = 0;
    let shift = 0;
    let pos = offset;
    while (pos < bytes.length) {
      const elem = bytes[pos++];
      val |= (elem & 0x7f) << shift;
      if ((elem & 0x80) === 0) break;
      shift += 7;
    }
    return { value: val, length: pos - offset };
  }

  function encodeCompactU16(n) {
    const out = [];
    let val = Number(n);
    while (true) {
      let elem = val & 0x7f;
      val >>>= 7;
      if (val === 0) {
        out.push(elem);
        break;
      }
      out.push(elem | 0x80);
    }
    return new Uint8Array(out);
  }

  function encodeU32LE(n) {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, Number(n) >>> 0, true);
    return out;
  }

  function encodeU64LE(n) {
    const out = new Uint8Array(8);
    let v = BigInt(n);
    for (let i = 0; i < 8; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  function encodeU128LE(n) {
    const out = new Uint8Array(16);
    let v = BigInt(n);
    for (let i = 0; i < 16; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  function encodeBorshString(str) {
    const bytes = new TextEncoder().encode(String(str));
    return concatUint8Arrays([encodeU32LE(bytes.length), bytes]);
  }

  async function sha256BytesAsync(data) {
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
      return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', buf));
    }
    const nodeCrypto = safeRequire('crypto');
    if (nodeCrypto && nodeCrypto.createHash) {
      return new Uint8Array(nodeCrypto.createHash('sha256').update(buf).digest());
    }
    throw new Error('SHA-256 unavailable');
  }

  // Keccak-f[1600] supporting both NIST SHA3-256 (domain 0x06) and Keccak-256 (domain 0x01) for MPC KDF fallback
  const KECCAK_RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
    0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
    0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
    0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
    0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];
  const KECCAK_ROTC = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44];
  const KECCAK_PILN = [10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1];
  const MASK64 = 0xffffffffffffffffn;

  function rotl64(x, n) {
    const k = BigInt(n);
    return ((x << k) | (x >> (64n - k))) & MASK64;
  }

  function keccakSponge256(input, domainByte) {
    const data = input instanceof Uint8Array ? input : new TextEncoder().encode(String(input));
    const rate = 136;
    const blockCount = Math.floor(data.length / rate) + 1;
    const padded = new Uint8Array(blockCount * rate);
    padded.set(data);
    padded[data.length] ^= domainByte;
    padded[padded.length - 1] ^= 0x80;

    const st = new Array(25).fill(0n);
    for (let off = 0; off < padded.length; off += rate) {
      for (let i = 0; i < 17; i++) {
        let lane = 0n;
        for (let b = 0; b < 8; b++) {
          lane |= BigInt(padded[off + i * 8 + b]) << BigInt(b * 8);
        }
        st[i] ^= lane;
      }
      for (let r = 0; r < 24; r++) {
        const bc = new Array(5);
        for (let i = 0; i < 5; i++) bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20];
        for (let i = 0; i < 5; i++) {
          const tVal = bc[(i + 4) % 5] ^ rotl64(bc[(i + 1) % 5], 1);
          for (let j = 0; j < 25; j += 5) st[j + i] ^= tVal;
        }
        let temp = st[1];
        for (let i = 0; i < 24; i++) {
          const j = KECCAK_PILN[i];
          const next = st[j];
          st[j] = rotl64(temp, KECCAK_ROTC[i]);
          temp = next;
        }
        for (let j = 0; j < 25; j += 5) {
          const s0 = st[j], s1 = st[j + 1], s2 = st[j + 2], s3 = st[j + 3], s4 = st[j + 4];
          st[j] = s0 ^ ((~s1 & MASK64) & s2);
          st[j + 1] = s1 ^ ((~s2 & MASK64) & s3);
          st[j + 2] = s2 ^ ((~s3 & MASK64) & s4);
          st[j + 3] = s3 ^ ((~s4 & MASK64) & s0);
          st[j + 4] = s4 ^ ((~s0 & MASK64) & s1);
        }
        st[0] ^= KECCAK_RC[r];
      }
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 4; i++) {
      const lane = st[i];
      for (let b = 0; b < 8; b++) {
        out[i * 8 + b] = Number((lane >> BigInt(b * 8)) & 0xffn);
      }
    }
    return out;
  }

  function sha3_256Bytes(input) {
    return keccakSponge256(input, 0x06);
  }

  function keccak256Bytes(input) {
    return keccakSponge256(input, 0x01);
  }

  const SECP256K1_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const SECP256K1_GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
  const SECP256K1_GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

  function secpMod(a, m = SECP256K1_P) {
    const r = a % m;
    return r >= 0n ? r : r + m;
  }

  function secpInv(a, m = SECP256K1_P) {
    let lm = 1n, hm = 0n;
    let low = secpMod(a, m), high = m;
    while (low > 1n) {
      const ratio = high / low;
      const nm = hm - lm * ratio;
      const nw = high - low * ratio;
      hm = lm;
      lm = nm;
      high = low;
      low = nw;
    }
    return secpMod(lm, m);
  }

  function secpPointAdd(p1, p2) {
    if (!p1) return p2;
    if (!p2) return p1;
    if (p1.x === p2.x) {
      if (p1.y !== p2.y) return null;
      const lam = secpMod(3n * p1.x * p1.x * secpInv(2n * p1.y));
      const x3 = secpMod(lam * lam - 2n * p1.x);
      const y3 = secpMod(lam * (p1.x - x3) - p1.y);
      return { x: x3, y: y3 };
    }
    const lam = secpMod((p2.y - p1.y) * secpInv(secpMod(p2.x - p1.x)));
    const x3 = secpMod(lam * lam - p1.x - p2.x);
    const y3 = secpMod(lam * (p1.x - x3) - p1.y);
    return { x: x3, y: y3 };
  }

  function secpPointMultiply(k, point = { x: SECP256K1_GX, y: SECP256K1_GY }) {
    let scalar = secpMod(k, SECP256K1_N);
    let result = null;
    let addend = point;
    while (scalar > 0n) {
      if (scalar & 1n) result = secpPointAdd(result, addend);
      addend = secpPointAdd(addend, addend);
      scalar >>= 1n;
    }
    return result;
  }

  function eip55ChecksumAddress(rawHex20) {
    const clean = rawHex20.toLowerCase().replace(/^0x/, '');
    const hashHex = bytesToHex(keccak256Bytes(clean));
    let out = '0x';
    for (let i = 0; i < 40; i++) {
      out += parseInt(hashHex[i], 16) >= 8 ? clean[i].toUpperCase() : clean[i];
    }
    return out;
  }

  /**
   * Derives the NEAR MPC (v1.signer) controlled EVM address for a NEAR account and path
   * using official Additive Key Derivation: tweak = sha3_256("near-mpc-recovery v0.1.0 epsilon derivation:" + accountId + "," + path).
   */
  async function deriveMpcEvmAddressAsync(nearAccountId, path = 'ethereum-1') {
    const acct = String(nearAccountId || '').trim();
    if (!acct) return '';

    const cryptoEngine = getCryptoEngine();
    if (cryptoEngine) {
      const delegated =
        cryptoEngine.deriveNearMpcEvmAddress ||
        cryptoEngine.deriveMpcEvmAddressAsync ||
        cryptoEngine.deriveMpcAddressAsync ||
        cryptoEngine.deriveChainSignatureEvmAddressAsync;
      if (typeof delegated === 'function') {
        const res = await delegated(acct, path);
        const addr = typeof res === 'string' ? res : (res && (res.mpcEvmAddress || res.address || res.evmAddress));
        if (addr) return addr;
      }
    }

    const rootBytes = base58Decode(V1_SIGNER_ROOT_PK_BASE58);
    if (rootBytes.length !== 64) {
      throw new Error('Invalid v1.signer root public key length');
    }
    const rootX = BigInt('0x' + bytesToHex(rootBytes.slice(0, 32)));
    const rootY = BigInt('0x' + bytesToHex(rootBytes.slice(32, 64)));
    const rootPoint = { x: rootX, y: rootY };

    const preimage = `near-mpc-recovery v0.1.0 epsilon derivation:${acct},${path}`;
    const tweakBytes = sha3_256Bytes(preimage);
    const epsilon = BigInt('0x' + bytesToHex(tweakBytes)) % SECP256K1_N;
    const tweakPoint = secpPointMultiply(epsilon);
    const childPoint = secpPointAdd(rootPoint, tweakPoint);
    if (!childPoint) throw new Error('MPC child public key at infinity');

    const childXyBytes = hexToBytes(
      childPoint.x.toString(16).padStart(64, '0') +
      childPoint.y.toString(16).padStart(64, '0')
    );
    const addrHash = keccak256Bytes(childXyBytes);
    return eip55ChecksumAddress(bytesToHex(addrHash.slice(12)));
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw new Error('fetch API unavailable');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchFn(url, {
        ...options,
        signal: options.signal || (controller ? controller.signal : undefined),
        headers: {
          Accept: 'application/json',
          ...(options.headers || {})
        }
      });
      const text = typeof res.text === 'function' ? await res.text() : '';
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (_) {
          data = null;
        }
      } else if (typeof res.json === 'function') {
        data = await res.json().catch(() => null);
      }
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    } catch (err) {
      if (err && (err.name === 'AbortError' || String(err.message || '').includes('abort'))) {
        const timeoutErr = new Error(t('网络请求超时', 'Request timeout'));
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Auto-discovers any existing `.near` named account controlled by `nearPublicKey` on NEAR Mainnet
   * via FastNear (`api.fastnear.com/v1/public_key/<pk>/all`) + KitWallet fallback.
   */
  async function discoverNearAccountsByPublicKeyAsync(publicKeyStr) {
    const pk = String(publicKeyStr || '').trim();
    if (!pk || !pk.startsWith('ed25519:')) return [];
    const filterNamed = (arr) =>
      Array.isArray(arr)
        ? arr
            .map((a) => String(a || '').trim().toLowerCase())
            .filter((a) => a && !/^[0-9a-f]{64}$/.test(a) && (a.endsWith('.near') || a.endsWith('.tg') || a.includes('.')))
        : [];
    try {
      const fRes = await fetchJsonWithTimeout(`https://api.fastnear.com/v1/public_key/${encodeURIComponent(pk)}/all`, {}, 4500).catch(() => null);
      const hits = filterNamed(fRes && fRes.account_ids);
      if (hits.length > 0) return hits;
    } catch (_) {}
    try {
      const kRes = await fetchJsonWithTimeout(`https://api.kitwallet.app/publicKey/${encodeURIComponent(pk)}/accounts`, {}, 4500).catch(() => null);
      const hits = filterNamed(kRes);
      if (hits.length > 0) return hits;
    } catch (_) {}
    return [];
  }

  /**
   * Queries real on-chain validator staking positions (`*.poolv1.near` / `*.pool.near`) and
   * Rhea oRHEA lock-convert positions for a NEAR account via FastNear + direct contract view calls.
   */
  async function fetchNearAccountStakingPositionsAsync(nearAccountId) {
    const acct = String(nearAccountId || '').trim().toLowerCase();
    if (!acct) return [];
    const positions = [];
    try {
      const [full, orheaConvs] = await Promise.all([
        fetchJsonWithTimeout(`https://api.fastnear.com/v1/account/${encodeURIComponent(acct)}/full`, {}, 5000).catch(() => null),
        viewNearContractCall('orhea-conv.rhealab.near', 'get_account_conversions', { account_id: acct }).catch(() => null)
      ]);
      const pools = full && Array.isArray(full.pools) ? full.pools : [];
      const validatorResults = await Promise.all(
        pools.slice(0, 12).map(async (p) => {
          const poolId = String(p && p.pool_id || '').trim();
          if (!poolId) return null;
          const accInfo = await viewNearContractCall(poolId, 'get_account', { account_id: acct }).catch(() => null);
          if (!accInfo) return null;
          const stakedRaw = BigInt(String(accInfo.staked_balance || '0'));
          const unstakedRaw = BigInt(String(accInfo.unstaked_balance || '0'));
          const totalRaw = stakedRaw + unstakedRaw;
          if (totalRaw <= 10n ** 19n) return null; // ignore < 0.00001 NEAR dust
          const stakedNear = Number(stakedRaw / 10n ** 18n) / 1e6;
          const unstakedNear = Number(unstakedRaw / 10n ** 18n) / 1e6;
          const totalNear = stakedNear + unstakedNear;
          return {
            type: 'validator',
            poolId,
            stakedNear,
            unstakedNear,
            totalNear,
            canWithdraw: Boolean(accInfo.can_withdraw)
          };
        })
      );
      validatorResults.filter(Boolean).forEach((pos) => positions.push(pos));

      if (Array.isArray(orheaConvs) && orheaConvs.length > 0) {
        let totalRaw = 0n;
        let activeCount = 0;
        for (const conv of orheaConvs) {
          if (!conv || typeof conv !== 'object') continue;
          const statusLower = String(conv.status || '').toLowerCase();
          if (conv.is_withdrawn === true || conv.withdrawn === true || statusLower === 'withdrawn' || statusLower === 'claimed') {
            continue;
          }
          const rawVal = conv.source_amount ?? conv.amount ?? conv.locked_amount ?? conv.source_token_amount ?? '0';
          try {
            const rawBig = BigInt(String(rawVal));
            if (rawBig > 0n) {
              totalRaw += rawBig;
              activeCount += 1;
            }
          } catch (_) {}
        }
        const totalAmount = Number(totalRaw / 10n ** 12n) / 1e6;
        if (Number.isFinite(totalAmount) && totalAmount > 0.00001) {
          positions.push({
            type: 'lock_convert',
            poolId: 'orhea-conv.rhealab.near',
            symbol: 'oRHEA',
            totalAmount,
            chain: 'near',
            title: 'Rhea oRHEA Convert',
            subtitle: t(`锁仓兑换中 (${activeCount} 笔)`, `Locked Converting (${activeCount})`)
          });
        }
      }
    } catch (_) {}
    return positions;
  }

  /**
   * Queries real on-chain Solana staking positions:
   * - Jupiter DAO Staked JUP (`voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj`)
   * - Solana Native Validator Stake Accounts (`Stake11111111111111111111111111111111111111`)
   */
  async function fetchSolanaAccountStakingPositionsAsync(solAddress) {
    const addr = String(solAddress || '').trim();
    if (!addr) return [];
    let ownerBytes;
    try {
      ownerBytes = base58Decode(addr);
      if (!ownerBytes || ownerBytes.length !== 32) return [];
    } catch (_) {
      return [];
    }

    const positions = [];
    try {
      const voterProgId = 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj';
      const lockerAddr = 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN';
      const escrowPda = await findSolanaPdaAsync(
        [new TextEncoder().encode('Escrow'), base58Decode(lockerAddr), ownerBytes],
        base58Decode(voterProgId)
      );

      const [escrowRes, stakeAccountsRes] = await Promise.all([
        callSolanaRpc('getAccountInfo', [escrowPda.address, { encoding: 'base64' }]).catch(() => null),
        fetchJsonWithTimeout(
          'https://api.mainnet-beta.solana.com',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'sol_native_stake',
              method: 'getProgramAccounts',
              params: [
                'Stake11111111111111111111111111111111111111',
                { encoding: 'jsonParsed', filters: [{ memcmp: { offset: 12, bytes: addr } }] }
              ]
            })
          },
          6000
        ).catch(() => null)
      ]);

      if (escrowRes && escrowRes.value && escrowRes.value.data && escrowRes.value.data[0]) {
        try {
          const buf = base64ToBytes(String(escrowRes.value.data[0]));
          if (buf.length >= 129) {
            const amountRaw = decodeU64LE(buf, 105);
            if (amountRaw > 0n) {
              const stakedJup = Number(amountRaw) / 1e6;
              if (Number.isFinite(stakedJup) && stakedJup > 0.00001) {
                positions.push({
                  type: 'jupiter_dao',
                  chain: 'sol',
                  symbol: 'JUP',
                  title: 'Jupiter DAO (ASR)',
                  subtitle: escrowPda.address,
                  amount: stakedJup,
                  amountText: `${stakedJup.toFixed(4)} JUP`
                });
              }
            }
          }
        } catch (_) {}
      }

      const stakeList = stakeAccountsRes && Array.isArray(stakeAccountsRes.result) ? stakeAccountsRes.result : [];
      for (const item of stakeList) {
        if (!item || !item.account) continue;
        try {
          const lamports = BigInt(item.account.lamports || 0);
          if (lamports > 1000000n) {
            const voter = item.account?.data?.parsed?.info?.stake?.delegation?.voter || 'Solana Validator';
            const solAmt = Number(lamports) / 1e9;
            positions.push({
              type: 'sol_validator',
              chain: 'sol',
              symbol: 'SOL',
              title: voter,
              subtitle: item.pubkey || '',
              amount: solAmt
            });
          }
        } catch (_) {}
      }
    } catch (_) {}
    return positions;
  }

  /**
   * Self-heals NEAR Master Account credentials from mnemonic and derives all
   * external chain addresses (EVM, Solana, Pearl, Bitcoin) via NEAR MPC (v1.signer).
   */
  async function ensureWalletSigningKeysAsync(wallet) {
    if (!wallet) return wallet;
    const cryptoEngine = getCryptoEngine();

    if (wallet.accountType === 'post_quantum') {
      if (wallet.mnemonic && (!wallet.nearMlDsa65PublicKey || !wallet.nearMlDsa65PrivateKey || !wallet.nearUniversalAddress)) {
        if (!cryptoEngine || typeof cryptoEngine.deriveNearMlDsa65FromMnemonicAsync !== 'function') {
          throw new Error(t('ML-DSA-65 后量子引擎不可用', 'NearCACrypto ML-DSA-65 unavailable'));
        }
        const pq = await cryptoEngine.deriveNearMlDsa65FromMnemonicAsync(wallet.mnemonic, 0);
        wallet.nearMlDsa65PublicKey = wallet.nearMlDsa65PublicKey || pq.publicKey;
        wallet.nearMlDsa65PublicKeyHandle = wallet.nearMlDsa65PublicKeyHandle || pq.publicKeyHandle;
        wallet.nearMlDsa65PrivateKey = wallet.nearMlDsa65PrivateKey || pq.secretKey;
        wallet.nearUniversalAddress = wallet.nearUniversalAddress || pq.universalAccountId;
        wallet.nearAddress = wallet.nearAddress || pq.universalAccountId;
      } else if (wallet.nearMlDsa65PrivateKey && (!wallet.nearMlDsa65PublicKey || !wallet.nearUniversalAddress)) {
        if (cryptoEngine && typeof cryptoEngine.importNearMlDsa65FromSecretKey === 'function') {
          const pq = cryptoEngine.importNearMlDsa65FromSecretKey(wallet.nearMlDsa65PrivateKey);
          wallet.nearMlDsa65PublicKey = wallet.nearMlDsa65PublicKey || pq.publicKey;
          wallet.nearMlDsa65PublicKeyHandle = wallet.nearMlDsa65PublicKeyHandle || pq.publicKeyHandle;
          wallet.nearUniversalAddress = wallet.nearUniversalAddress || pq.universalAccountId;
          wallet.nearAddress = wallet.nearAddress || pq.universalAccountId;
        }
      }
      return wallet;
    }

    if (wallet.mnemonic) {
      const needsNear = !wallet.nearAddress || !wallet.nearPrivateKey || !wallet.nearPublicKey || !wallet.nearPrivateSeedHex;
      if (needsNear) {
        if (!cryptoEngine || typeof cryptoEngine.deriveNearFromSeedAsync !== 'function') {
          throw new Error(t('加密派生引擎 NearCACrypto 不可用', 'NearCACrypto unavailable'));
        }
        const near = await cryptoEngine.deriveNearFromSeedAsync(wallet.mnemonic, 0);
        if (near && near.nearAddress) {
          wallet.nearAddress = wallet.nearAddress || near.nearAddress;
          wallet.nearPrivateSeedHex = wallet.nearPrivateSeedHex || near.nearPrivateSeedHex;
          wallet.nearPublicKey = wallet.nearPublicKey || near.nearPublicKey;
          wallet.nearPrivateKey = wallet.nearPrivateKey || near.nearPrivateKey;
        }
      }
      if (cryptoEngine && typeof cryptoEngine.derivePearlFromSeedAsync === 'function') {
        const pearl = await cryptoEngine.derivePearlFromSeedAsync(wallet.mnemonic, "m/86'/808276'/0'/0/0", true);
        if (pearl && pearl.address) {
          wallet.address = pearl.address;
          wallet.privateKeyHex = pearl.privateKeyHex || wallet.privateKeyHex;
          wallet.tweakedPrivateKeyHex = pearl.tweakedPrivateKeyHex || wallet.tweakedPrivateKeyHex;
        }
      }
    }

    const nearId = wallet.nearNamedAccount || wallet.nearAddress;
    if (nearId) {
      if (cryptoEngine && typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
        const mpc = cryptoEngine.deriveNearMpcAllAddresses(nearId);
        wallet.mpcEvmAddress = mpc.evmAddress;
        wallet.evmAddress = mpc.evmAddress;
        wallet.solAddress = mpc.solAddress;
        wallet.solPublicKey = mpc.solAddress;
        wallet.btcAddress = mpc.btcAddress;
      } else if (!wallet.mpcEvmAddress) {
        const mpcEvm = await deriveMpcEvmAddressAsync(nearId, 'ethereum-1');
        wallet.mpcEvmAddress = mpcEvm;
        wallet.evmAddress = wallet.evmAddress || mpcEvm;
      }
    }

    return wallet;
  }

  function resolveWalletChainBalance(wallet, chain) {
    if (!wallet) return 0;
    const c = String(chain || '').toLowerCase();
    if (c === 'near') {
      const val = Number(wallet.nearBalance);
      return Number.isFinite(val) ? val : 0;
    }
    if (c === 'prl') {
      const val = Number(wallet.balance);
      return Number.isFinite(val) ? val : 0;
    }
    const mb = wallet.multiBalances || {};
    const nb = wallet.nativeBalances || {};
    if (c === 'bsc') {
      const rawBsc = mb.bnb !== undefined && mb.bnb !== null ? mb.bnb : (mb.bsc !== undefined && mb.bsc !== null ? mb.bsc : nb.bsc);
      const val = Number(rawBsc);
      return Number.isFinite(val) ? val : 0;
    }
    const rawVal = mb[c] !== undefined && mb[c] !== null ? mb[c] : nb[c];
    const val = Number(rawVal);
    return Number.isFinite(val) ? val : 0;
  }

  /**
   * Strict local balance pre-validation executed BEFORE firing RPC/aggregator requests.
   * Throws an Error with bilingual Insufficient balance details if funds (including gasBuffer) are insufficient.
   */
  function validateSufficientChainBalance({
    wallet,
    chain,
    tokenSymbol,
    amount,
    isNative = false,
    tokenBalance = null,
    gasBuffer = null
  } = {}) {
    const reqAmt = Number(amount);
    if (!Number.isFinite(reqAmt) || reqAmt <= 0) {
      throw new Error(t('请输入有效金额', 'Enter a valid positive amount'));
    }

    const chainKey = String(chain || '').toLowerCase();
    const sym = tokenSymbol || chainKey.toUpperCase() || 'TOKEN';
    const available =
      tokenBalance !== null && tokenBalance !== undefined
        ? (Number.isFinite(Number(tokenBalance)) ? Number(tokenBalance) : 0)
        : resolveWalletChainBalance(wallet, chainKey);

    let effectiveBuffer = 0;
    if (isNative) {
      if (gasBuffer !== null && gasBuffer !== undefined && Number.isFinite(Number(gasBuffer))) {
        effectiveBuffer = Math.max(0, Number(gasBuffer));
      } else {
        effectiveBuffer = DEFAULT_GAS_BUFFERS[chainKey] !== undefined ? DEFAULT_GAS_BUFFERS[chainKey] : 0;
      }
    }

    const requiredTotal = reqAmt + effectiveBuffer;
    if (available < reqAmt || available < requiredTotal) {
      const availFormatted = available.toFixed(4);
      const zhMsg = `${sym} 余额不足 (当前可用: ${availFormatted} ${sym})`;
      const enMsg = `Insufficient ${sym} (Available: ${availFormatted} ${sym})`;
      const lang = getConfiguredLang();
      const message = lang === 'zh' ? zhMsg : lang === 'en' ? enMsg : `${zhMsg} / ${enMsg}`;
      const err = new Error(message);
      err.code = 'INSUFFICIENT_BALANCE';
      err.zhMessage = zhMsg;
      err.enMessage = enMsg;
      err.available = available;
      err.required = requiredTotal;
      throw err;
    }

    return {
      ok: true,
      available,
      required: requiredTotal,
      gasBuffer: effectiveBuffer
    };
  }

  // ==================== Solana RPC & Contract Execution ====================

  async function callSolanaRpc(method, params, timeoutMs = DEFAULT_TIMEOUT_MS) {
    let lastErr = null;
    for (const rpcUrl of SOLANA_RPC_ENDPOINTS) {
      try {
        const res = await fetchJsonWithTimeout(
          rpcUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
          },
          timeoutMs
        );
        if (res && !res.error && res.result !== undefined) {
          return res.result;
        }
        if (res && res.error) {
          lastErr = new Error(res.error.message || JSON.stringify(res.error));
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Solana RPC call failed');
  }

  async function fetchSolanaNativeAndSplBalances(solAddress, mintAddresses = []) {
    const addr = String(solAddress || '').trim();
    if (!addr) return null;

    try {
      const requests = [
        callSolanaRpc('getBalance', [addr]),
        callSolanaRpc('getTokenAccountsByOwner', [addr, { programId: SPL_TOKEN_PROGRAM_ID }, { encoding: 'jsonParsed' }]).catch(() => null)
      ];
      const [balRes, splRes] = await Promise.all(requests);

      const lamports = balRes && typeof balRes.value === 'number' ? balRes.value : 0;
      const nativeSol = Number(fromBaseUnits(String(lamports), 9));

      const tokens = {};
      const list = splRes && Array.isArray(splRes.value) ? splRes.value : [];
      for (const item of list) {
        const info = item && item.account && item.account.data && item.account.data.parsed && item.account.data.parsed.info;
        if (!info || !info.mint || !info.tokenAmount) continue;
        const mint = info.mint;
        const decimals = Number(info.tokenAmount.decimals) || 0;
        const rawAmt = BigInt(info.tokenAmount.amount || '0');
        if (!tokens[mint]) {
          tokens[mint] = { raw: rawAmt.toString(), decimals, formatted: Number(fromBaseUnits(rawAmt.toString(), decimals)) };
        } else {
          const sumRaw = BigInt(tokens[mint].raw) + rawAmt;
          tokens[mint] = { raw: sumRaw.toString(), decimals, formatted: Number(fromBaseUnits(sumRaw.toString(), decimals)) };
        }
      }

      if (Array.isArray(mintAddresses)) {
        const missingMints = mintAddresses.filter((m) => m && !tokens[m]);
        if (missingMints.length > 0) {
          // Best-effort check Token-2022 program accounts if requested mints were not in standard SPL program
          const t22Res = await callSolanaRpc('getTokenAccountsByOwner', [
            addr,
            { programId: SPL_TOKEN_2022_PROGRAM_ID },
            { encoding: 'jsonParsed' }
          ]).catch(() => null);
          const t22List = t22Res && Array.isArray(t22Res.value) ? t22Res.value : [];
          for (const item of t22List) {
            const info = item && item.account && item.account.data && item.account.data.parsed && item.account.data.parsed.info;
            if (!info || !info.mint || !info.tokenAmount) continue;
            const mint = info.mint;
            const decimals = Number(info.tokenAmount.decimals) || 0;
            const rawAmt = BigInt(info.tokenAmount.amount || '0');
            tokens[mint] = { raw: rawAmt.toString(), decimals, formatted: Number(fromBaseUnits(rawAmt.toString(), decimals)) };
          }
          for (const m of mintAddresses) {
            if (m && !tokens[m]) {
              tokens[m] = { raw: '0', decimals: 0, formatted: 0 };
            }
          }
        }
      }

      return {
        solAddress: addr,
        nativeLamports: String(lamports),
        nativeSol,
        tokens
      };
    } catch (_) {
      return null;
    }
  }

  async function resolveSolanaFeeAta(outputMint, owner = DEFAULT_SOL_FEE_RECIPIENT) {
    if (!owner || !outputMint) return null;
    const cacheKey = `${owner}:${outputMint}`;
    if (cacheKey in _solFeeAtaCache) return _solFeeAtaCache[cacheKey];
    try {
      const res = await callSolanaRpc(
        'getTokenAccountsByOwner',
        [owner, { mint: outputMint }, { encoding: 'jsonParsed' }],
        6000
      );
      const list = res && Array.isArray(res.value) ? res.value : [];
      const ata = list[0] && list[0].pubkey ? list[0].pubkey : null;
      _solFeeAtaCache[cacheKey] = ata;
      return ata;
    } catch (_) {
      return null;
    }
  }

  async function quoteSolanaJupiterSwap({
    inputMint,
    outputMint,
    amountRaw,
    slippageBps = 100,
    platformFeeBps = 25
  } = {}) {
    if (!inputMint || !outputMint) {
      throw new Error(t('缺少 Solana 代币 Mint 地址', 'Missing Solana inputMint or outputMint'));
    }
    const amtStr = String(amountRaw === undefined || amountRaw === null ? '' : amountRaw).trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'amountRaw must be a positive integer string'));
    }
    const slip = Number(slippageBps) || 100;
    const feeParam = Number(platformFeeBps) > 0 ? `&platformFeeBps=${Math.round(Number(platformFeeBps))}` : '';
    const jupUrl = `${JUPITER_API_URL}/quote?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(amtStr)}&slippageBps=${slip}${feeParam}`;
    const rayUrl = `${RAYDIUM_API_URL}/compute/swap-base-in?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(amtStr)}&slippageBps=${slip}&txVersion=V0`;

    const [jRes, rRes] = await Promise.allSettled([
      fetchJsonWithTimeout(jupUrl, {}, 12000),
      fetchJsonWithTimeout(rayUrl, {}, 8000).catch(() => null)
    ]);

    const jQuote = jRes.status === 'fulfilled' && jRes.value && jRes.value.outAmount ? jRes.value : null;
    const rResp = rRes.status === 'fulfilled' && rRes.value && rRes.value.success && rRes.value.data && rRes.value.data.outputAmount
      ? rRes.value
      : null;

    const candidates = [];
    if (jQuote && /^\d+$/.test(String(jQuote.outAmount)) && BigInt(jQuote.outAmount) > 0n) {
      candidates.push({ source: 'Jupiter V1', outBig: BigInt(jQuote.outAmount), data: jQuote });
    }
    if (rResp && /^\d+$/.test(String(rResp.data.outputAmount)) && BigInt(rResp.data.outputAmount) > 0n) {
      candidates.push({ source: 'Raydium V1', outBig: BigInt(rResp.data.outputAmount), data: rResp });
    }

    if (candidates.length === 0) {
      const jErr = jRes.status === 'rejected'
        ? jRes.reason?.message
        : (jRes.status === 'fulfilled' && jRes.value && jRes.value.error);
      throw new Error(jErr || t('Jupiter / Raydium 暂无报价', 'Solana DEX quote unavailable'));
    }

    candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
    const best = candidates[0];
    const comparedPools = candidates.length;
    const routeLabel = comparedPools > 1
      ? `⚡ ${t('最优', 'Best')}: ${best.source} (${t(`比价 ${comparedPools} 池`, `${comparedPools} pools`)})`
      : best.source;

    if (best.source === 'Jupiter V1') {
      return {
        ...jQuote,
        bestSource: 'Jupiter V1',
        comparedPools,
        routeLabel,
        _jupiterQuote: jQuote,
        _raydiumRawResponse: rResp
      };
    }

    return {
      ...(jQuote || {}),
      inputMint,
      outputMint,
      inAmount: amtStr,
      outAmount: best.outBig.toString(),
      slippageBps: slip,
      bestSource: 'Raydium V1',
      comparedPools,
      routeLabel,
      _jupiterQuote: jQuote,
      _raydiumRawResponse: rResp
    };
  }

  function extractSolanaMpcSignatureBytes(mpcRes) {
    const sigObj = mpcRes && mpcRes.mpcSignature;
    if (!sigObj || !Array.isArray(sigObj.signature) || sigObj.signature.length !== 64) {
      throw new Error(t('NEAR MPC 未返回有效的 64 字节 Ed25519 签名', 'NEAR MPC did not return a valid 64-byte Ed25519 signature'));
    }
    return Uint8Array.from(sigObj.signature, (b) => Number(b) & 0xff);
  }

  async function signAndBroadcastSolanaBase64Tx(base64Tx, solSeedHex, mpcWallet = null, mpcPath = 'solana-1') {
    const txBytes = base64ToBytes(base64Tx);
    const { value: numSigs, length: lenBytes } = decodeCompactU16(txBytes, 0);
    const msgOffset = lenBytes + numSigs * 64;
    const msgBytes = txBytes.slice(msgOffset);

    let sig;
    if (solSeedHex) {
      const cryptoEngine = getCryptoEngine();
      if (!cryptoEngine || typeof cryptoEngine.ed25519SignAsync !== 'function') {
        throw new Error(t('Ed25519 签名引擎不可用', 'NearCACrypto.ed25519SignAsync unavailable'));
      }
      sig = await cryptoEngine.ed25519SignAsync(msgBytes, solSeedHex);
    } else if (mpcWallet) {
      const mpcRes = await api.requestNearMpcChainSignature({
        wallet: mpcWallet,
        payloadBytes: msgBytes,
        path: mpcPath || 'solana-1',
        domainId: 1
      });
      sig = extractSolanaMpcSignatureBytes(mpcRes);
    } else {
      throw new Error(t('缺少 Solana 签名凭据', 'Solana signing credentials unavailable'));
    }

    txBytes.set(sig, lenBytes);
    const signedBase64 = bytesToBase64(txBytes);

    const txHash = await callSolanaRpc(
      'sendTransaction',
      [signedBase64, { encoding: 'base64', skipPreflight: false, maxRetries: 3 }],
      15000
    );
    return {
      txHash,
      explorerUrl: `${SOLSCAN_TX}${txHash}`
    };
  }

  const SOL_ED25519_P = (1n << 255n) - 19n;
  function solModPow(base, exp, mod) {
    let res = 1n;
    let b = ((base % mod) + mod) % mod;
    let e = exp;
    while (e > 0n) {
      if (e & 1n) res = (res * b) % mod;
      b = (b * b) % mod;
      e >>= 1n;
    }
    return res;
  }
  const SOL_ED25519_D = (((-121665n * solModPow(121666n, SOL_ED25519_P - 2n, SOL_ED25519_P)) % SOL_ED25519_P) + SOL_ED25519_P) % SOL_ED25519_P;

  function isEd25519OnCurve(bytes) {
    if (!bytes || bytes.length !== 32) return false;
    let y = 0n;
    for (let i = 0; i < 32; i++) {
      y |= BigInt(i === 31 ? (bytes[i] & 0x7f) : bytes[i]) << BigInt(i * 8);
    }
    if (y >= SOL_ED25519_P) return false;
    const y2 = (y * y) % SOL_ED25519_P;
    const u = (y2 - 1n + SOL_ED25519_P) % SOL_ED25519_P;
    const v = (SOL_ED25519_D * y2 + 1n) % SOL_ED25519_P;
    const v3 = (((v * v) % SOL_ED25519_P) * v) % SOL_ED25519_P;
    const v7 = (((v3 * v3) % SOL_ED25519_P) * v) % SOL_ED25519_P;
    const x = (((u * v3) % SOL_ED25519_P) * solModPow((u * v7) % SOL_ED25519_P, (SOL_ED25519_P - 5n) >> 3n, SOL_ED25519_P)) % SOL_ED25519_P;
    const check = (((v * x) % SOL_ED25519_P) * x) % SOL_ED25519_P;
    return check === u || check === (SOL_ED25519_P - u) % SOL_ED25519_P;
  }

  async function findSolanaPdaAsync(seeds, programIdBytes) {
    const marker = new TextEncoder().encode('ProgramDerivedAddress');
    for (let bump = 255; bump >= 0; bump--) {
      const parts = [...seeds.map((s) => (s instanceof Uint8Array ? s : new TextEncoder().encode(String(s)))), new Uint8Array([bump]), programIdBytes, marker];
      const digest = await sha256BytesAsync(concatUint8Arrays(parts));
      if (!isEd25519OnCurve(digest)) {
        return { bytes: digest, address: base58Encode(digest), bump };
      }
    }
    throw new Error(t('无法派生 Solana PDA', 'Unable to find Solana PDA'));
  }

  function decodeU64LE(bytes, offset = 0) {
    let val = 0n;
    for (let i = 0; i < 8; i++) {
      val |= BigInt(bytes[offset + i] || 0) << BigInt(i * 8);
    }
    return val;
  }

  async function buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions }) {
    const bhRes = await callSolanaRpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
    const blockhashStr = bhRes && bhRes.value && bhRes.value.blockhash;
    if (!blockhashStr) {
      throw new Error(t('获取 Solana 最新区块哈希失败', 'Failed to fetch Solana latest blockhash'));
    }
    const recentBlockhash = base58Decode(blockhashStr);
    const feePayerStr = wallet.solAddress;

    const metaMap = new Map();
    const recordAccount = (pubkeyStr, isSigner, isWritable) => {
      const prev = metaMap.get(pubkeyStr);
      if (prev) {
        prev.isSigner = prev.isSigner || Boolean(isSigner);
        prev.isWritable = prev.isWritable || Boolean(isWritable);
      } else {
        metaMap.set(pubkeyStr, { pubkeyStr, pubkeyBytes: base58Decode(pubkeyStr), isSigner: Boolean(isSigner), isWritable: Boolean(isWritable) });
      }
    };
    recordAccount(feePayerStr, true, true);
    for (const ix of instructions) {
      for (const acc of ix.keys) recordAccount(acc.pubkey, acc.isSigner, acc.isWritable);
      recordAccount(ix.programId, false, false);
    }

    const entries = Array.from(metaMap.values()).filter((e) => e.pubkeyStr !== feePayerStr);
    const wSigners = [metaMap.get(feePayerStr), ...entries.filter((e) => e.isSigner && e.isWritable)];
    const rSigners = entries.filter((e) => e.isSigner && !e.isWritable);
    const wNonSigners = entries.filter((e) => !e.isSigner && e.isWritable);
    const rNonSigners = entries.filter((e) => !e.isSigner && !e.isWritable);
    const ordered = [...wSigners, ...rSigners, ...wNonSigners, ...rNonSigners];
    const indexByKey = new Map(ordered.map((e, idx) => [e.pubkeyStr, idx]));

    const numReqSigs = wSigners.length + rSigners.length;
    const numRoSigned = rSigners.length;
    const numRoUnsigned = rNonSigners.length;

    const compiledIxs = instructions.map((ix) => {
      const progIdx = indexByKey.get(ix.programId);
      const keyIndices = Uint8Array.from(ix.keys.map((k) => indexByKey.get(k.pubkey)));
      const dataBytes = ix.data instanceof Uint8Array ? ix.data : Uint8Array.from(ix.data || []);
      return concatUint8Arrays([
        new Uint8Array([progIdx]),
        encodeCompactU16(keyIndices.length),
        keyIndices,
        encodeCompactU16(dataBytes.length),
        dataBytes
      ]);
    });

    const messageBytes = concatUint8Arrays([
      new Uint8Array([numReqSigs, numRoSigned, numRoUnsigned]),
      encodeCompactU16(ordered.length),
      ...ordered.map((e) => e.pubkeyBytes),
      recentBlockhash,
      encodeCompactU16(compiledIxs.length),
      ...compiledIxs
    ]);
    const unsignedTxBytes = concatUint8Arrays([
      encodeCompactU16(numReqSigs),
      new Uint8Array(numReqSigs * 64),
      messageBytes
    ]);
    return signAndBroadcastSolanaBase64Tx(bytesToBase64(unsignedTxBytes), wallet.solPrivateSeedHex || null, wallet, 'solana-1');
  }

  function resolveSolanaTokenDecimals(mint, fallback = 6) {
    if (mint === WSOL_MINT) return 9;
    if (mint === 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn') return 9;
    const registry = getTokenRegistry();
    if (registry) {
      const lists = [
        registry.UNIFIED_CORE_TOKENS,
        registry.DEX_CHAIN_TOKENS && registry.DEX_CHAIN_TOKENS.sol,
        registry.DEX_SWAP_TOKENS && registry.DEX_SWAP_TOKENS.sol
      ];
      for (const list of lists) {
        if (Array.isArray(list)) {
          const hit = list.find((item) => item && item.assetId === mint);
          if (hit && typeof hit.decimals === 'number') return hit.decimals;
        }
      }
    }
    return fallback;
  }

  async function executeSolanaJupiterSwap({
    wallet,
    quoteResponse,
    wrapAndUnwrapSol = true,
    feeAccount = null,
    tokenBalance = null,
    inputDecimals = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    if (!quoteResponse || !quoteResponse.inputMint || !quoteResponse.inAmount) {
      throw new Error(t('缺少有效的 Jupiter 报价数据', 'Valid quoteResponse is required'));
    }

    const inputMint = quoteResponse.inputMint;
    if (inputMint === WSOL_MINT) {
      const amtSol = Number(fromBaseUnits(String(quoteResponse.inAmount), 9));
      validateSufficientChainBalance({
        wallet,
        chain: 'sol',
        tokenSymbol: 'SOL',
        amount: amtSol,
        isNative: true
      });
    } else {
      const dec = typeof inputDecimals === 'number' ? inputDecimals : resolveSolanaTokenDecimals(inputMint, 6);
      const amtToken = Number(fromBaseUnits(String(quoteResponse.inAmount), dec));
      const cachedSplBal =
        tokenBalance !== null && tokenBalance !== undefined
          ? tokenBalance
          : (wallet.splBalances && wallet.splBalances[inputMint] !== undefined ? wallet.splBalances[inputMint] : null);
      if (cachedSplBal !== null) {
        validateSufficientChainBalance({
          wallet,
          chain: 'sol',
          tokenSymbol: 'SPL',
          amount: amtToken,
          isNative: false,
          tokenBalance: cachedSplBal
        });
      }
      validateSufficientChainBalance({
        wallet,
        chain: 'sol',
        tokenSymbol: 'SOL',
        amount: 0.002,
        isNative: false,
        tokenBalance: resolveWalletChainBalance(wallet, 'sol')
      });
    }

    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC Solana 地址不可用', 'NEAR Master Account or MPC Solana address unavailable'));
    }

    let activeQuote = quoteResponse;
    if (activeQuote.bestSource === 'Raydium V1' && activeQuote._raydiumRawResponse) {
      try {
        const rayBuild = await fetchJsonWithTimeout(
          `${RAYDIUM_API_URL}/transaction/swap-base-in`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              computeUnitPriceMicroLamports: '100000',
              swapResponse: activeQuote._raydiumRawResponse,
              txVersion: 'V0',
              wallet: wallet.solAddress,
              wrapSol: inputMint === WSOL_MINT,
              unwrapSol: activeQuote.outputMint === WSOL_MINT
            })
          },
          12000
        );
        const rayTx = rayBuild && rayBuild.success && Array.isArray(rayBuild.data) && rayBuild.data[0]?.transaction;
        if (rayTx) {
          return signAndBroadcastSolanaBase64Tx(rayTx, wallet.solPrivateSeedHex || null, wallet, 'solana-1');
        }
      } catch (_) {}
      if (activeQuote._jupiterQuote) {
        activeQuote = activeQuote._jupiterQuote;
      }
    } else if (activeQuote._jupiterQuote) {
      activeQuote = activeQuote._jupiterQuote;
    }

    let resolvedFeeAccount = feeAccount;
    if (activeQuote.platformFee && !resolvedFeeAccount) {
      resolvedFeeAccount = await resolveSolanaFeeAta(activeQuote.outputMint);
      if (!resolvedFeeAccount) {
        const requoted = await api.quoteSolanaJupiterSwap({
          inputMint: activeQuote.inputMint,
          outputMint: activeQuote.outputMint,
          amountRaw: activeQuote.inAmount,
          slippageBps: activeQuote.slippageBps || 100,
          platformFeeBps: 0
        });
        activeQuote = requoted._jupiterQuote || requoted;
      }
    }

    const swapBody = {
      quoteResponse: activeQuote,
      userPublicKey: wallet.solAddress,
      wrapAndUnwrapSol: Boolean(wrapAndUnwrapSol)
    };
    if (resolvedFeeAccount) {
      swapBody.feeAccount = resolvedFeeAccount;
    }

    const swapRes = await fetchJsonWithTimeout(
      `${JUPITER_API_URL}/swap`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapBody)
      },
      12000
    );

    if (!swapRes || !swapRes.swapTransaction) {
      throw new Error((swapRes && swapRes.error) || t('Jupiter 交易构建失败', 'Jupiter swap build failed'));
    }

    return signAndBroadcastSolanaBase64Tx(swapRes.swapTransaction, wallet.solPrivateSeedHex || null, wallet, 'solana-1');
  }

  async function executeSolanaNativeTransfer({ wallet, toAddress, amountSol } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const dest = String(toAddress || '').trim();
    const toPubkey = base58Decode(dest);
    if (toPubkey.length !== 32) {
      throw new Error(t('Solana 收款地址无效', 'Invalid Solana recipient address'));
    }

    validateSufficientChainBalance({
      wallet,
      chain: 'sol',
      tokenSymbol: 'SOL',
      amount: amountSol,
      isNative: true
    });

    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC Solana 地址不可用', 'NEAR Master Account or MPC Solana address unavailable'));
    }

    const lamportsStr = toBaseUnits(amountSol, 9);
    if (BigInt(lamportsStr) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    const bhRes = await callSolanaRpc('getLatestBlockhash', [{ commitment: 'finalized' }]);
    const blockhashStr = bhRes && bhRes.value && bhRes.value.blockhash;
    if (!blockhashStr) {
      throw new Error(t('获取 Solana 最新区块哈希失败', 'Failed to fetch Solana latest blockhash'));
    }
    const recentBlockhash = base58Decode(blockhashStr);
    const fromPubkey = base58Decode(wallet.solAddress);
    const systemProgramId = new Uint8Array(32); // 11111111111111111111111111111111

    const isSelf = bytesToHex(fromPubkey) === bytesToHex(toPubkey);
    const accountKeys = isSelf
      ? concatUint8Arrays([fromPubkey, systemProgramId])
      : concatUint8Arrays([fromPubkey, toPubkey, systemProgramId]);
    const accountCount = isSelf ? 2 : 3;
    const programIdIndex = isSelf ? 1 : 2;
    const ixAccountIndices = isSelf ? new Uint8Array([0, 0]) : new Uint8Array([0, 1]);
    const ixData = concatUint8Arrays([encodeU32LE(2), encodeU64LE(lamportsStr)]); // SystemInstruction::Transfer = 2

    const messageBytes = concatUint8Arrays([
      new Uint8Array([1, 0, 1]), // Header: 1 req sig, 0 ro signed, 1 ro unsigned
      encodeCompactU16(accountCount),
      accountKeys,
      recentBlockhash,
      encodeCompactU16(1), // 1 instruction
      new Uint8Array([programIdIndex]),
      encodeCompactU16(2),
      ixAccountIndices,
      encodeCompactU16(ixData.length),
      ixData
    ]);

    let sig;
    if (wallet.solPrivateSeedHex) {
      const cryptoEngine = getCryptoEngine();
      if (!cryptoEngine || typeof cryptoEngine.ed25519SignAsync !== 'function') {
        throw new Error(t('Ed25519 签名引擎不可用', 'NearCACrypto.ed25519SignAsync unavailable'));
      }
      sig = await cryptoEngine.ed25519SignAsync(messageBytes, wallet.solPrivateSeedHex);
    } else {
      const mpcRes = await api.requestNearMpcChainSignature({
        wallet,
        payloadBytes: messageBytes,
        path: 'solana-1',
        domainId: 1
      });
      sig = extractSolanaMpcSignatureBytes(mpcRes);
    }
    const signedTxBytes = concatUint8Arrays([encodeCompactU16(1), sig, messageBytes]);
    const signedBase64 = bytesToBase64(signedTxBytes);

    const txHash = await callSolanaRpc(
      'sendTransaction',
      [signedBase64, { encoding: 'base64', skipPreflight: false, maxRetries: 3 }],
      15000
    );
    return {
      txHash,
      explorerUrl: `${SOLSCAN_TX}${txHash}`
    };
  }

  // ==================== EVM RPC & Smart Contract Execution ====================

  async function fetchEvmNativeAndErc20Balance(chainKey, evmAddress, tokenContract = null, decimals = 18) {
    const cfg = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    const addr = String(evmAddress || '').trim();
    if (!cfg || !addr) return null;

    try {
      const nativeRes = await fetchJsonWithTimeout(
        cfg.rpc,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] })
        },
        8000
      );
      if (!nativeRes || typeof nativeRes.result !== 'string' || !nativeRes.result.startsWith('0x')) {
        return null;
      }
      const nativeRaw = BigInt(nativeRes.result === '0x' ? '0x0' : nativeRes.result).toString();
      const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));

      let tokenRaw = null;
      let tokenFormatted = null;
      const contract = tokenContract ? String(tokenContract).trim() : '';
      if (contract && contract.toLowerCase() !== NATIVE_EVM_SENTINEL) {
        const paddedAddr = addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
        const tokenRes = await fetchJsonWithTimeout(
          cfg.rpc,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'eth_call',
              params: [{ to: contract, data: '0x70a08231' + paddedAddr }, 'latest']
            })
          },
          8000
        );
        if (tokenRes && typeof tokenRes.result === 'string' && tokenRes.result.startsWith('0x')) {
          tokenRaw = BigInt(tokenRes.result === '0x' ? '0x0' : tokenRes.result).toString();
          tokenFormatted = Number(fromBaseUnits(tokenRaw, decimals));
        }
      }

      return {
        chainKey: String(chainKey).toLowerCase(),
        chainId: cfg.chainId,
        nativeRaw,
        nativeFormatted,
        tokenRaw,
        tokenFormatted
      };
    } catch (_) {
      return null;
    }
  }

  const ARC_USDC_PRECOMPILE = '0x3600000000000000000000000000000000000000';
  const ARC_QUOTE_PLACEHOLDER_ADDR = '0x1111111111111111111111111111111111111111';
  const LIFI_API_URL = 'https://li.quest/v1';

  async function quoteArcNetworkDexSwap(params = {}) {
    return quoteEvmDexSwap({ ...params, chainKey: 'arc' });
  }

  async function quoteEvmDexSwap({
    chainKey,
    srcToken,
    destToken,
    amountRaw,
    srcDecimals = 18,
    destDecimals = 18,
    slippageBps = 100,
    feeBps = 25,
    feeReceiver = DEFAULT_EVM_FEE_RECEIVER
  } = {}) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));
    if (!srcToken || !destToken) throw new Error(t('缺少代币地址', 'Missing srcToken or destToken'));

    const amtStr = String(amountRaw === undefined || amountRaw === null ? '' : amountRaw).trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'amountRaw must be positive'));
    }

    const isArcMainnet = key === 'arc' || cfg.chainId === 5042;
    const srcLower = String(srcToken).trim().toLowerCase();
    const destLower = String(destToken).trim().toLowerCase();
    const arcSrcNative = isArcMainnet && (srcLower === NATIVE_EVM_SENTINEL || srcLower === ARC_USDC_PRECOMPILE);
    const arcDestNative = isArcMainnet && (destLower === NATIVE_EVM_SENTINEL || destLower === ARC_USDC_PRECOMPILE);

    const effSrc = arcSrcNative ? ARC_USDC_PRECOMPILE : String(srcToken).trim();
    const effDest = arcDestNative ? ARC_USDC_PRECOMPILE : String(destToken).trim();
    const effSrcDec = arcSrcNative ? 6 : Number(srcDecimals);
    const effDestDec = arcDestNative ? 6 : Number(destDecimals);
    const effAmtStr = arcSrcNative && Number(srcDecimals) === 18
      ? (BigInt(amtStr) / 1000000000000n).toString()
      : amtStr;
    if (!/^\d+$/.test(effAmtStr) || BigInt(effAmtStr) <= 0n) {
      return {
        ok: false,
        routeSource: null,
        label: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        routeData: null,
        comparedPools: 0,
        error: t('兑换数量过小', 'Amount too small')
      };
    }

    const bps = Number.isFinite(Number(feeBps)) ? Math.max(0, Math.round(Number(feeBps))) : 25;
    const feeQueryKyber = bps > 0 && feeReceiver
      ? `&feeAmount=${bps}&isInBps=true&chargeFeeBy=currency_in&feeReceiver=${encodeURIComponent(feeReceiver)}`
      : '';
    const kyberUrl = cfg.kyber
      ? `https://aggregator-api.kyberswap.com/${cfg.kyber}/api/v1/routes?tokenIn=${encodeURIComponent(effSrc)}&tokenOut=${encodeURIComponent(effDest)}&amountIn=${encodeURIComponent(effAmtStr)}${feeQueryKyber}`
      : null;

    const feeQueryPara = bps > 0 && feeReceiver
      ? `&partner=pearlwallet&partnerAddress=${encodeURIComponent(feeReceiver)}&partnerFeeBps=${bps}`
      : '';
    const paraUrl = `https://api.paraswap.io/prices?srcToken=${encodeURIComponent(effSrc)}&destToken=${encodeURIComponent(effDest)}&amount=${encodeURIComponent(effAmtStr)}&srcDecimals=${effSrcDec}&destDecimals=${effDestDec}&network=${cfg.chainId}&side=SELL${feeQueryPara}`;

    const ooAmountHuman = fromBaseUnits(effAmtStr, effSrcDec);
    const ooSlippagePct = ((Number(slippageBps) || 100) / 100).toFixed(2);
    const ooUrl = cfg.openOcean
      ? `${OPENOCEAN_API_URL}/${cfg.openOcean}/quote?inTokenAddress=${encodeURIComponent(effSrc)}&outTokenAddress=${encodeURIComponent(effDest)}&amount=${encodeURIComponent(ooAmountHuman)}&gasPrice=5&slippage=${ooSlippagePct}`
      : null;

    const lifiSlip = ((Number(slippageBps) || 100) / 10000).toFixed(4);
    const lifiUrl = isArcMainnet
      ? `${LIFI_API_URL}/quote?fromChain=${cfg.chainId}&toChain=${cfg.chainId}&fromToken=${encodeURIComponent(effSrc)}&toToken=${encodeURIComponent(effDest)}&fromAmount=${encodeURIComponent(effAmtStr)}&fromAddress=${ARC_QUOTE_PLACEHOLDER_ADDR}&slippage=${lifiSlip}`
      : null;

    const [kRes, pRes, oRes, lRes] = await Promise.allSettled([
      kyberUrl ? fetchJsonWithTimeout(kyberUrl, {}, 12000) : Promise.resolve(null),
      cfg.chainId === 999 || cfg.chainId === 4663 || cfg.chainId === 5042
        ? Promise.resolve(null)
        : fetchJsonWithTimeout(paraUrl, {}, 10000),
      ooUrl ? fetchJsonWithTimeout(ooUrl, {}, 8000).catch(() => null) : Promise.resolve(null),
      lifiUrl ? fetchJsonWithTimeout(lifiUrl, {}, 10000).catch(() => null) : Promise.resolve(null)
    ]);

    const scaleArcOut = (rawOutStr) => {
      const b = BigInt(rawOutStr);
      if (arcDestNative && Number(destDecimals) === 18) return b * 1000000000000n;
      return b;
    };

    const candidates = [];
    const kRoute =
      kRes.status === 'fulfilled' && kRes.value && kRes.value.code === 0 && kRes.value.data && kRes.value.data.routeSummary
        ? kRes.value.data.routeSummary
        : null;
    if (kRoute && kRoute.amountOut) {
      const scaledOut = scaleArcOut(kRoute.amountOut);
      candidates.push({
        routeSource: 'kyber',
        label: 'KyberSwap',
        outBig: scaledOut,
        amountOut: scaledOut.toString(),
        amountInUsd: kRoute.amountInUsd || null,
        amountOutUsd: kRoute.amountOutUsd || null,
        routeData: { ...kRoute, _arcNormSrc: effSrc, _arcNormDest: effDest, _arcNormAmtIn: effAmtStr }
      });
    }

    const pRoute =
      pRes.status === 'fulfilled' && pRes.value && pRes.value.priceRoute && pRes.value.priceRoute.destAmount
        ? pRes.value.priceRoute
        : null;
    if (pRoute && pRoute.destAmount) {
      candidates.push({
        routeSource: 'paraswap',
        label: 'ParaSwap',
        outBig: BigInt(pRoute.destAmount),
        amountOut: String(pRoute.destAmount),
        amountInUsd: pRoute.srcUSD || null,
        amountOutUsd: pRoute.destUSD || null,
        routeData: pRoute
      });
    }

    const ooRoute =
      oRes.status === 'fulfilled' && oRes.value && Number(oRes.value.code) === 200 && oRes.value.data && oRes.value.data.outAmount
        ? oRes.value.data
        : null;
    if (ooRoute && /^\d+$/.test(String(ooRoute.outAmount)) && BigInt(ooRoute.outAmount) > 0n) {
      candidates.push({
        routeSource: 'openocean',
        label: 'OpenOcean',
        outBig: BigInt(ooRoute.outAmount),
        amountOut: String(ooRoute.outAmount),
        amountInUsd: null,
        amountOutUsd: null,
        routeData: ooRoute
      });
    }

    const lRoute =
      lRes.status === 'fulfilled' && lRes.value && lRes.value.estimate && lRes.value.estimate.toAmount
        ? lRes.value
        : null;
    if (lRoute && /^\d+$/.test(String(lRoute.estimate.toAmount)) && BigInt(lRoute.estimate.toAmount) > 0n) {
      const scaledOut = scaleArcOut(lRoute.estimate.toAmount);
      candidates.push({
        routeSource: 'lifi',
        label: 'LI.FI',
        outBig: scaledOut,
        amountOut: scaledOut.toString(),
        amountInUsd: lRoute.estimate.fromAmountUSD || null,
        amountOutUsd: lRoute.estimate.toAmountUSD || null,
        routeData: { ...lRoute, _arcNormSrc: effSrc, _arcNormDest: effDest, _arcNormAmtIn: effAmtStr }
      });
    }

    if (candidates.length === 0) {
      return {
        ok: false,
        routeSource: null,
        label: null,
        amountOut: null,
        amountOutFormatted: null,
        amountInUsd: null,
        amountOutUsd: null,
        routeData: null,
        comparedPools: 0,
        error: t('暂无链上聚合报价', 'No DEX quote available')
      };
    }

    candidates.sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
    const best = candidates[0];
    const comparedPools = candidates.length;
    const routeLabel = comparedPools > 1
      ? `⚡ ${t('最优', 'Best')}: ${best.label} (${t(`比价 ${comparedPools} 池`, `${comparedPools} pools`)})`
      : best.label;
    return {
      ok: true,
      routeSource: best.routeSource,
      label: best.label,
      bestSource: best.label,
      comparedPools,
      routeLabel,
      amountOut: best.amountOut,
      amountOutFormatted: fromBaseUnits(best.amountOut, destDecimals),
      amountInUsd: best.amountInUsd,
      amountOutUsd: best.amountOutUsd,
      routeData: best.routeData,
      slippageBps,
      error: null
    };
  }

  async function sendEvmMpcSignedTransaction({
    wallet,
    chainKey,
    to,
    data = '0x',
    value = '0',
    approvalToken = null,
    spender = null,
    amountRaw = null,
    path = 'ethereum-1'
  }) {
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const cfg = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));
    const fromAddr = wallet && (wallet.mpcEvmAddress || wallet.evmAddress);
    if (!fromAddr) throw new Error(t('MPC EVM 地址不可用', 'MPC EVM address unavailable'));

    const provider = new ethersLib.JsonRpcProvider(cfg.rpc, cfg.chainId);

    const signAndBroadcastOne = async (txTo, txData, txVal) => {
      const nonce = await provider.getTransactionCount(fromAddr, 'pending');
      const feeData = await provider.getFeeData();
      const valBig = BigInt(txVal || '0');
      let gasLimit = 21000n;
      try {
        const est = await provider.estimateGas({ from: fromAddr, to: txTo, data: txData, value: valBig });
        gasLimit = (est * 125n) / 100n;
      } catch (_) {
        gasLimit = txData && txData !== '0x' ? 350000n : 21000n;
      }
      const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || 1000000000n;
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || (maxFeePerGas / 4n) || 1000000n;
      const unsignedTx = ethersLib.Transaction.from({
        type: 2,
        chainId: cfg.chainId,
        nonce,
        to: txTo,
        data: txData || '0x',
        value: valBig,
        gasLimit,
        maxFeePerGas,
        maxPriorityFeePerGas
      });
      const digestBytes = hexToBytes(unsignedTx.unsignedHash.replace(/^0x/i, ''));
      const mpcRes = await api.requestNearMpcChainSignature({
        wallet,
        payloadHash32Bytes: digestBytes,
        path,
        domainId: 0
      });
      const sigObj = mpcRes && mpcRes.mpcSignature;
      if (!sigObj || !sigObj.big_r || !sigObj.big_r.affine_point || !sigObj.s || !sigObj.s.scalar) {
        throw new Error(t('NEAR MPC 未返回有效的 Secp256k1 签名', 'NEAR MPC did not return a valid Secp256k1 signature'));
      }
      const rHex = sigObj.big_r.affine_point.slice(2, 66);
      const sHex = sigObj.s.scalar.padStart(64, '0');
      const yParity = Number(sigObj.recovery_id || 0) & 1;
      unsignedTx.signature = ethersLib.Signature.from({ r: `0x${rHex}`, s: `0x${sHex}`, yParity });
      const txResp = await provider.broadcastTransaction(unsignedTx.serialized);
      return txResp;
    };

    if (approvalToken && approvalToken.toLowerCase() !== NATIVE_EVM_SENTINEL && spender && amountRaw) {
      const erc20 = new ethersLib.Contract(
        approvalToken,
        ['function allowance(address owner, address spender) view returns (uint256)'],
        provider
      );
      const curAllow = await erc20.allowance(fromAddr, spender);
      if (curAllow < BigInt(amountRaw)) {
        const approveIface = new ethersLib.Interface(['function approve(address spender, uint256 amount) returns (bool)']);
        const approveData = approveIface.encodeFunctionData('approve', [spender, amountRaw]);
        const appResp = await signAndBroadcastOne(approvalToken, approveData, '0');
        await appResp.wait(1);
      }
    }

    const txResp = await signAndBroadcastOne(to, data, value);
    return {
      txHash: txResp.hash,
      explorerUrl: `${cfg.explorer}${txResp.hash}`
    };
  }

  async function sendEvmSignedTransaction({ chainKey, privateKey, to, data = '0x', value = '0', approvalToken = null, spender = null, amountRaw = null }) {
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const cfg = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));

    const provider = new ethersLib.JsonRpcProvider(cfg.rpc, cfg.chainId);
    const signer = new ethersLib.Wallet(privateKey, provider);

    if (approvalToken && approvalToken.toLowerCase() !== NATIVE_EVM_SENTINEL && spender && amountRaw) {
      const erc20 = new ethersLib.Contract(
        approvalToken,
        [
          'function allowance(address owner, address spender) view returns (uint256)',
          'function approve(address spender, uint256 amount) returns (bool)'
        ],
        signer
      );
      const curAllow = await erc20.allowance(signer.address, spender);
      if (curAllow < BigInt(amountRaw)) {
        const approveTx = await erc20.approve(spender, amountRaw);
        await approveTx.wait(1);
      }
    }

    const txResp = await signer.sendTransaction({
      to,
      data,
      value: BigInt(value || '0')
    });
    return {
      txHash: txResp.hash,
      explorerUrl: `${cfg.explorer}${txResp.hash}`
    };
  }

  async function executeEvmDexSwap({
    wallet,
    chainKey,
    routeSource,
    routeData,
    srcToken,
    destToken,
    amountRaw,
    srcDecimals = 18,
    slippageBps = 100,
    tokenBalance = null,
    feeBps = 25,
    feeReceiver = DEFAULT_EVM_FEE_RECEIVER
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));

    const isArcMainnet = key === 'arc' || cfg.chainId === 5042;
    const srcLower = String(srcToken || '').toLowerCase();
    const isArcPrecompileUsdc = isArcMainnet && srcLower === ARC_USDC_PRECOMPILE;
    const isNative = !srcToken || srcLower === NATIVE_EVM_SENTINEL || isArcPrecompileUsdc;
    const effSrc = (routeData && routeData._arcNormSrc) || (isArcPrecompileUsdc ? ARC_USDC_PRECOMPILE : (srcToken || NATIVE_EVM_SENTINEL));
    const effDest = (routeData && routeData._arcNormDest) || (isArcMainnet && String(destToken || '').toLowerCase() === NATIVE_EVM_SENTINEL ? ARC_USDC_PRECOMPILE : destToken);
    const effAmt = (routeData && routeData._arcNormAmtIn) || ((isArcMainnet && srcLower === NATIVE_EVM_SENTINEL && Number(srcDecimals) === 18) ? (BigInt(amountRaw) / 1000000000000n).toString() : String(amountRaw));

    const humanAmt = Number(fromBaseUnits(String(amountRaw), srcDecimals));
    if (isNative) {
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: cfg.symbol,
        amount: humanAmt,
        isNative: true
      });
    } else {
      const cachedErc20 =
        tokenBalance !== null && tokenBalance !== undefined
          ? tokenBalance
          : (wallet.erc20Balances && wallet.erc20Balances[key] && wallet.erc20Balances[key][String(srcToken).toLowerCase()] !== undefined
              ? wallet.erc20Balances[key][String(srcToken).toLowerCase()]
              : null);
      if (cachedErc20 !== null) {
        validateSufficientChainBalance({
          wallet,
          chain: key,
          tokenSymbol: 'TOKEN',
          amount: humanAmt,
          isNative: false,
          tokenBalance: cachedErc20
        });
      }
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: cfg.symbol,
        amount: cfg.gasReserve,
        isNative: false,
        tokenBalance: resolveWalletChainBalance(wallet, key)
      });
    }

    if (!routeData) {
      throw new Error(t('缺少链上路由数据', 'Missing routeData'));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.evmAddress || (!wallet.evmPrivateKey && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC EVM 地址不可用', 'NEAR Master Account or MPC EVM address unavailable'));
    }

    let toAddr = '';
    let txData = '';
    let txVal = '0';
    let approvalAddr = isNative && !isArcMainnet ? null : effSrc;
    let spenderAddr = null;
    let approvalAmt = effAmt;

    if (routeSource === 'lifi') {
      const lifiSlip = ((Number(slippageBps) || 100) / 10000).toFixed(4);
      let lData = routeData;
      if (!lData.transactionRequest || String(lData.transactionRequest.from || '').toLowerCase() !== wallet.evmAddress.toLowerCase()) {
        lData = await fetchJsonWithTimeout(
          `${LIFI_API_URL}/quote?fromChain=${cfg.chainId}&toChain=${cfg.chainId}&fromToken=${encodeURIComponent(effSrc)}&toToken=${encodeURIComponent(effDest)}&fromAmount=${encodeURIComponent(effAmt)}&fromAddress=${encodeURIComponent(wallet.evmAddress)}&slippage=${lifiSlip}`,
          {},
          12000
        );
      }
      const txReq = lData && lData.transactionRequest;
      if (!txReq || !txReq.to || !txReq.data) {
        throw new Error((lData && lData.message) || t('LI.FI 交易构建失败', 'LI.FI transaction build failed'));
      }
      toAddr = txReq.to;
      txData = txReq.data;
      txVal = txReq.value || '0';
      spenderAddr = (lData.estimate && lData.estimate.approvalAddress) || toAddr;
      if (isArcMainnet && isNative) approvalAddr = ARC_USDC_PRECOMPILE;
    } else if (routeSource === 'paraswap') {
      const bps = Number.isFinite(Number(feeBps)) ? Math.max(0, Math.round(Number(feeBps))) : 25;
      const pBuild = await fetchJsonWithTimeout(
        `https://api.paraswap.io/transactions/${cfg.chainId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            srcToken,
            destToken,
            srcAmount: String(amountRaw),
            priceRoute: routeData,
            userAddress: wallet.evmAddress,
            slippage: Number(slippageBps) || 100,
            partner: 'pearlwallet',
            partnerAddress: feeReceiver,
            partnerFeeBps: bps
          })
        },
        12000
      );
      if (!pBuild || !pBuild.to || !pBuild.data) {
        throw new Error((pBuild && pBuild.error) || t('ParaSwap 交易构建失败', 'ParaSwap build failed'));
      }
      toAddr = pBuild.to;
      txData = pBuild.data;
      txVal = pBuild.value || '0';
      spenderAddr = toAddr;
    } else if (routeSource === 'openocean' && cfg.openOcean) {
      const ooHuman = fromBaseUnits(String(amountRaw), srcDecimals);
      const ooSlip = ((Number(slippageBps) || 100) / 100).toFixed(2);
      const ooBuild = await fetchJsonWithTimeout(
        `${OPENOCEAN_API_URL}/${cfg.openOcean}/swap?inTokenAddress=${encodeURIComponent(srcToken)}&outTokenAddress=${encodeURIComponent(destToken)}&amount=${encodeURIComponent(ooHuman)}&gasPrice=5&slippage=${ooSlip}&account=${encodeURIComponent(wallet.evmAddress)}`,
        {},
        12000
      );
      const ooData = ooBuild && Number(ooBuild.code) === 200 ? ooBuild.data : null;
      if (!ooData || !ooData.to || !ooData.data) {
        throw new Error((ooBuild && ooBuild.message) || t('OpenOcean 交易构建失败', 'OpenOcean build failed'));
      }
      toAddr = ooData.to;
      txData = ooData.data;
      txVal = ooData.value || (isNative ? String(amountRaw) : '0');
      spenderAddr = toAddr;
    } else {
      const cleanSummary = { ...routeData };
      delete cleanSummary._arcNormSrc;
      delete cleanSummary._arcNormDest;
      delete cleanSummary._arcNormAmtIn;
      const buildRes = await fetchJsonWithTimeout(
        `https://aggregator-api.kyberswap.com/${cfg.kyber}/api/v1/route/build`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routeSummary: cleanSummary,
            sender: wallet.evmAddress,
            recipient: wallet.evmAddress,
            slippageTolerance: Number(slippageBps) || 100
          })
        },
        12000
      );
      const buildData = buildRes && buildRes.code === 0 ? buildRes.data : null;
      if (!buildData || !buildData.routerAddress || !buildData.data) {
        throw new Error((buildRes && buildRes.message) || t('KyberSwap 交易构建失败', 'KyberSwap build failed'));
      }
      toAddr = buildData.routerAddress;
      txData = buildData.data;
      txVal = isArcMainnet ? String(buildData.transactionValue || '0') : (isNative ? String(amountRaw) : '0');
      spenderAddr = toAddr;
      if (isArcMainnet && isNative) {
        approvalAddr = ARC_USDC_PRECOMPILE;
        approvalAmt = effAmt;
      }
    }

    if (wallet.evmPrivateKey) {
      return sendEvmSignedTransaction({
        chainKey: key,
        privateKey: wallet.evmPrivateKey,
        to: toAddr,
        data: txData,
        value: txVal,
        approvalToken: approvalAddr,
        spender: spenderAddr || toAddr,
        amountRaw: String(approvalAmt)
      });
    }
    return sendEvmMpcSignedTransaction({
      wallet,
      chainKey: key,
      to: toAddr,
      data: txData,
      value: txVal,
      approvalToken: approvalAddr,
      spender: spenderAddr || toAddr,
      amountRaw: String(approvalAmt),
      path: 'ethereum-1'
    });
  }

  async function executeEvmRawSteps({ wallet, chainKey, steps = [] } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));
    if (!Array.isArray(steps) || steps.length === 0) throw new Error(t('缺少链上交易步骤', 'Missing EVM execution steps'));
    await ensureWalletSigningKeysAsync(wallet);

    const ethersLib = getEthersLib();
    const provider = ethersLib ? new ethersLib.JsonRpcProvider(cfg.rpc, cfg.chainId) : null;
    let lastRes = null;

    for (let i = 0; i < steps.length; i++) {
      const itemData = steps[i] && steps[i].items && steps[i].items[0] ? steps[i].items[0].data : steps[i];
      if (!itemData || !itemData.to || !itemData.data) continue;
      const stepChain = Number(itemData.chainId || cfg.chainId);
      const targetKey = Object.keys(EVM_CHAINS).find((k) => EVM_CHAINS[k].chainId === stepChain) || key;
      const stepParams = {
        chainKey: targetKey,
        to: itemData.to,
        data: itemData.data,
        value: itemData.value !== undefined ? String(itemData.value) : '0'
      };
      if (wallet.evmPrivateKey) {
        lastRes = await sendEvmSignedTransaction({ privateKey: wallet.evmPrivateKey, ...stepParams });
      } else {
        lastRes = await sendEvmMpcSignedTransaction({ wallet, path: 'ethereum-1', ...stepParams });
      }
      if (i + 1 < steps.length && provider && lastRes && lastRes.txHash) {
        await provider.waitForTransaction(lastRes.txHash, 1).catch(() => null);
      }
    }
    if (!lastRes) throw new Error(t('未执行任何链上交易步骤', 'No executable EVM step found'));
    return lastRes;
  }

  async function executeEvmTransfer({
    wallet,
    chainKey,
    toAddress,
    amount,
    tokenContract = null,
    decimals = 18,
    tokenBalance = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));

    const dest = String(toAddress || '').trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(dest)) {
      throw new Error(t('EVM 收款地址无效', 'Invalid EVM recipient address'));
    }

    const isNative = !tokenContract || String(tokenContract).toLowerCase() === NATIVE_EVM_SENTINEL;
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);

    if (isNative) {
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: cfg.symbol,
        amount,
        isNative: true
      });
      await ensureWalletSigningKeysAsync(wallet);
      if (!wallet.evmAddress || (!wallet.evmPrivateKey && !hasNearMpc)) {
        throw new Error(t('NEAR 主账户或 MPC EVM 地址不可用', 'NEAR Master Account or MPC EVM address unavailable'));
      }
      const weiStr = toBaseUnits(amount, 18);
      if (wallet.evmPrivateKey) {
        return sendEvmSignedTransaction({
          chainKey: key,
          privateKey: wallet.evmPrivateKey,
          to: dest,
          data: '0x',
          value: weiStr
        });
      }
      return sendEvmMpcSignedTransaction({
        wallet,
        chainKey: key,
        to: dest,
        data: '0x',
        value: weiStr,
        path: 'ethereum-1'
      });
    }

    const cachedErc20 =
      tokenBalance !== null && tokenBalance !== undefined
        ? tokenBalance
        : (wallet.erc20Balances && wallet.erc20Balances[key] && wallet.erc20Balances[key][String(tokenContract).toLowerCase()] !== undefined
            ? wallet.erc20Balances[key][String(tokenContract).toLowerCase()]
            : null);
    if (cachedErc20 !== null) {
      validateSufficientChainBalance({
        wallet,
        chain: key,
        tokenSymbol: 'TOKEN',
        amount,
        isNative: false,
        tokenBalance: cachedErc20
      });
    }
    validateSufficientChainBalance({
      wallet,
      chain: key,
      tokenSymbol: cfg.symbol,
      amount: cfg.gasReserve,
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, key)
    });

    await ensureWalletSigningKeysAsync(wallet);
    if (!wallet.evmAddress || (!wallet.evmPrivateKey && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC EVM 地址不可用', 'NEAR Master Account or MPC EVM address unavailable'));
    }

    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const iface = new ethersLib.Interface(['function transfer(address to, uint256 value) returns (bool)']);
    const rawUnits = toBaseUnits(amount, decimals);
    const data = iface.encodeFunctionData('transfer', [dest, rawUnits]);

    if (wallet.evmPrivateKey) {
      return sendEvmSignedTransaction({
        chainKey: key,
        privateKey: wallet.evmPrivateKey,
        to: tokenContract,
        data,
        value: '0'
      });
    }
    return sendEvmMpcSignedTransaction({
      wallet,
      chainKey: key,
      to: tokenContract,
      data,
      value: '0',
      path: 'ethereum-1'
    });
  }

  // ==================== NEAR Native & MPC v1.signer Execution ====================

  function extractNearEd25519SeedHex(privateKeyStr) {
    const raw = String(privateKeyStr || '').trim();
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return raw.toLowerCase();
    const secretBytes = base58Decode(raw.replace(/^ed25519:/, ''));
    if (secretBytes.length < 32) {
      throw new Error(t('NEAR 私钥格式无效', 'Invalid NEAR private key'));
    }
    return bytesToHex(secretBytes.slice(0, 32));
  }

  function getWalletNearSignerCredentials(wallet) {
    if (!wallet) {
      return { accountId: '', publicKeyStr: '', privateKeyStr: '', isPostQuantum: false };
    }
    const accountId = String(wallet.nearNamedAccount || wallet.nearAddress || wallet.nearUniversalAddress || '').trim();
    const isPq = wallet.accountType === 'post_quantum' || (!wallet.nearPrivateKey && Boolean(wallet.nearMlDsa65PrivateKey));
    if (isPq) {
      return {
        accountId,
        publicKeyStr: String(wallet.nearMlDsa65PublicKey || '').trim(),
        publicKeyHandleStr: String(wallet.nearMlDsa65PublicKeyHandle || '').trim(),
        privateKeyStr: String(wallet.nearMlDsa65PrivateKey || '').trim(),
        isPostQuantum: true
      };
    }
    return {
      accountId,
      publicKeyStr: String(wallet.nearPublicKey || '').trim(),
      publicKeyHandleStr: '',
      privateKeyStr: String(wallet.nearPrivateKey || '').trim(),
      isPostQuantum: false
    };
  }

  function encodeNearPublicKeyBorsh(publicKeyStr) {
    const raw = String(publicKeyStr || '').trim();
    const cryptoEngine = getCryptoEngine();
    if (raw.startsWith('ml-dsa-65:')) {
      if (!cryptoEngine || typeof cryptoEngine.decodeNearMlDsa65PublicKey !== 'function') {
        throw new Error(t('ML-DSA-65 后量子引擎不可用', 'NearCACrypto ML-DSA-65 unavailable'));
      }
      const pubBytes = cryptoEngine.decodeNearMlDsa65PublicKey(raw);
      return concatUint8Arrays([new Uint8Array([2]), pubBytes]); // KeyType::MLDSA65 = 2
    }
    if (raw.startsWith('secp256k1:')) {
      const pubBytes = base58Decode(raw.slice('secp256k1:'.length));
      if (pubBytes.length !== 64) {
        throw new Error(t('secp256k1 公钥长度无效', 'Invalid secp256k1 public key length'));
      }
      return concatUint8Arrays([new Uint8Array([1]), pubBytes]); // KeyType::SECP256K1 = 1
    }
    const pubBytes = base58Decode(raw.replace(/^ed25519:/, ''));
    if (pubBytes.length !== 32) {
      throw new Error(t('Ed25519 公钥长度无效', 'Invalid Ed25519 public key length'));
    }
    return concatUint8Arrays([new Uint8Array([0]), pubBytes]); // KeyType::ED25519 = 0
  }

  async function buildSignAndBroadcastNearActions({ accountId, publicKeyStr, privateKeyStr, receiverId, actionsBytes, actionCount = 1 }) {
    if (!accountId || !publicKeyStr || !privateKeyStr || !receiverId) {
      throw new Error(t('缺少 NEAR 交易签名参数', 'Missing NEAR transaction signing parameters'));
    }
    const cryptoEngine = getCryptoEngine();
    const isMlDsa65 = String(publicKeyStr).startsWith('ml-dsa-65:') || String(privateKeyStr).startsWith('ml-dsa-65:');
    if (isMlDsa65) {
      if (!cryptoEngine || typeof cryptoEngine.signNearHashMlDsa65 !== 'function') {
        throw new Error(t('ML-DSA-65 签名引擎不可用', 'NearCACrypto.signNearHashMlDsa65 unavailable'));
      }
    } else if (!cryptoEngine || typeof cryptoEngine.ed25519SignAsync !== 'function') {
      throw new Error(t('Ed25519 签名引擎不可用', 'NearCACrypto.ed25519SignAsync unavailable'));
    }

    async function queryAccessKey(pkQuery) {
      return fetchJsonWithTimeout(
        NEAR_RPC_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'ak',
            method: 'query',
            params: {
              request_type: 'view_access_key',
              finality: 'final',
              account_id: accountId,
              public_key: pkQuery
            }
          })
        },
        8000
      );
    }

    let akRes = await queryAccessKey(publicKeyStr);
    if (isMlDsa65 && (!akRes || akRes.error) && cryptoEngine && typeof cryptoEngine.buildUniversalStateInitFromMlDsa65PublicKey === 'function') {
      try {
        const { publicKeyHandle } = cryptoEngine.buildUniversalStateInitFromMlDsa65PublicKey(publicKeyStr);
        if (publicKeyHandle) {
          const handleRes = await queryAccessKey(publicKeyHandle);
          if (handleRes && !handleRes.error && handleRes.result) {
            akRes = handleRes;
          }
        }
      } catch (_) {}
    }

    if (!akRes || akRes.error || !akRes.result || typeof akRes.result.nonce !== 'number') {
      throw new Error(
        (akRes && akRes.error && (akRes.error.data || akRes.error.message)) ||
          t('NEAR 账户未激活或 AccessKey 不存在', 'NEAR account not activated or AccessKey missing')
      );
    }

    const nonce = BigInt(akRes.result.nonce) + 1n;
    const blockHashBytes = base58Decode(akRes.result.block_hash);
    const pubBorshBytes = encodeNearPublicKeyBorsh(publicKeyStr);

    const txBytes = concatUint8Arrays([
      encodeBorshString(accountId),
      pubBorshBytes,
      encodeU64LE(nonce),
      encodeBorshString(receiverId),
      blockHashBytes,
      encodeU32LE(actionCount),
      actionsBytes
    ]);

    const txHashBytes = await sha256BytesAsync(txBytes);
    let signedTxBytes;
    if (isMlDsa65) {
      const sig = cryptoEngine.signNearHashMlDsa65(txHashBytes, privateKeyStr);
      signedTxBytes = concatUint8Arrays([txBytes, new Uint8Array([2]), sig]); // Signature::MLDSA65 = 2
    } else {
      const seedHex = extractNearEd25519SeedHex(privateKeyStr);
      const sig = await cryptoEngine.ed25519SignAsync(txHashBytes, seedHex);
      signedTxBytes = concatUint8Arrays([txBytes, new Uint8Array([0]), sig]); // Signature::ED25519 = 0
    }
    const signedB64 = bytesToBase64(signedTxBytes);

    const txRes = await fetchJsonWithTimeout(
      NEAR_RPC_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'tx',
          method: 'broadcast_tx_commit',
          params: [signedB64]
        })
      },
      15000
    );

    if (!txRes || txRes.error) {
      throw new Error(
        (txRes && txRes.error && (txRes.error.data || txRes.error.message)) ||
          t('NEAR 交易广播失败', 'NEAR transaction broadcast failed')
      );
    }
    const status = txRes.result && txRes.result.status;
    if (status && status.Failure) {
      throw new Error(JSON.stringify(status.Failure));
    }
    const txHash = txRes.result && txRes.result.transaction ? txRes.result.transaction.hash : '';
    api._lastNearOutcome = {
      txHash,
      successValueB64: status && typeof status.SuccessValue === 'string' ? status.SuccessValue : null
    };
    return txHash;
  }

  async function signAndSendNearFunctionCall({
    accountId,
    publicKeyStr,
    privateKeyStr,
    receiverId,
    methodName,
    argsJson = '{}',
    gas = '50000000000000',
    depositYocto = '0'
  } = {}) {
    if (!methodName) {
      throw new Error(t('缺少合约方法名', 'Missing NEAR contract methodName'));
    }
    const argsBytes = new TextEncoder().encode(typeof argsJson === 'string' ? argsJson : JSON.stringify(argsJson || {}));
    const actionBytes = concatUint8Arrays([
      new Uint8Array([2]), // Action::FunctionCall
      encodeBorshString(methodName),
      encodeU32LE(argsBytes.length),
      argsBytes,
      encodeU64LE(gas),
      encodeU128LE(depositYocto)
    ]);

    return buildSignAndBroadcastNearActions({
      accountId,
      publicKeyStr,
      privateKeyStr,
      receiverId,
      actionsBytes: actionBytes
    });
  }

  async function signAndSendNearTransfer({
    accountId,
    publicKeyStr,
    privateKeyStr,
    receiverId,
    amountNear,
    wallet = null,
    availableBalanceNear = null
  } = {}) {
    if (!receiverId) {
      throw new Error(t('缺少 NEAR 转账账户或收款方参数', 'Missing NEAR transfer account or receiverId'));
    }

    if (wallet || (availableBalanceNear !== null && availableBalanceNear !== undefined)) {
      validateSufficientChainBalance({
        wallet: wallet || { nearBalance: availableBalanceNear },
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: amountNear,
        isNative: true
      });
    } else {
      const amt = Number(amountNear);
      if (!Number.isFinite(amt) || amt <= 0) {
        throw new Error(t('请输入有效的 NEAR 转账金额', 'Enter a valid positive NEAR amount'));
      }
    }

    const resolvedWallet = wallet ? await ensureWalletSigningKeysAsync(wallet) : null;
    const creds = getWalletNearSignerCredentials(resolvedWallet);
    const sender = accountId || creds.accountId;
    const pub = publicKeyStr || creds.publicKeyStr;
    const priv = privateKeyStr || creds.privateKeyStr;

    if (!sender || !pub || !priv) {
      throw new Error(t('缺少 NEAR 转账账户或收款方参数', 'Missing NEAR transfer account or receiverId'));
    }

    const yoctoAmount = toBaseUnits(amountNear, 24);
    if (BigInt(yoctoAmount) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    const actionBytes = concatUint8Arrays([
      new Uint8Array([3]), // Action::Transfer
      encodeU128LE(yoctoAmount)
    ]);

    const txHash = await buildSignAndBroadcastNearActions({
      accountId: sender,
      publicKeyStr: pub,
      privateKeyStr: priv,
      receiverId,
      actionsBytes: actionBytes
    });

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`
    };
  }

  async function executeNearNep141Transfer({
    wallet,
    tokenContract,
    receiverId,
    amount,
    decimals = 8,
    tokenSymbol = 'TOKEN',
    tokenBalance = null,
    skipStorageCheck = false
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const contract = String(tokenContract || '').trim();
    const dest = String(receiverId || '').trim().toLowerCase();
    if (!contract) throw new Error(t('缺少 NEAR NEP-141 合约地址', 'Missing NEP-141 token contract'));
    if (!dest) throw new Error(t('缺少 NEAR 收款账户', 'Missing NEAR receiverId'));

    const cachedBal =
      tokenBalance !== null && tokenBalance !== undefined
        ? tokenBalance
        : (wallet.nearNep141Balances && wallet.nearNep141Balances[contract]
            ? wallet.nearNep141Balances[contract].formatted
            : null);

    if (cachedBal !== null) {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol,
        amount,
        isNative: false,
        tokenBalance: cachedBal
      });
    }

    validateSufficientChainBalance({
      wallet,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: 0.005,
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, 'near')
    });

    const resolvedWallet = await ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    if (!sender || !resolvedWallet.nearPublicKey || !resolvedWallet.nearPrivateKey) {
      throw new Error(t('缺少 NEAR 转账账户签名凭据', 'Missing NEAR signing credentials'));
    }

    const rawAmount = toBaseUnits(amount, decimals);
    if (BigInt(rawAmount) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    if (!skipStorageCheck) {
      try {
        const sbArgs = bytesToBase64(new TextEncoder().encode(JSON.stringify({ account_id: dest })));
        const sbRes = await fetchJsonWithTimeout(
          NEAR_RPC_URL,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'storage-check',
              method: 'query',
              params: {
                request_type: 'call_function',
                finality: 'final',
                account_id: contract,
                method_name: 'storage_balance_of',
                args_base64: sbArgs
              }
            })
          },
          6000
        );
        const rawBytes = sbRes && sbRes.result && sbRes.result.result;
        if (Array.isArray(rawBytes)) {
          const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(rawBytes)));
          if (decoded === null) {
            const creds = getWalletNearSignerCredentials(resolvedWallet);
            await api.signAndSendNearFunctionCall({
              accountId: sender,
              publicKeyStr: creds.publicKeyStr,
              privateKeyStr: creds.privateKeyStr,
              receiverId: contract,
              methodName: 'storage_deposit',
              argsJson: JSON.stringify({ account_id: dest, registration_only: true }),
              gas: '30000000000000',
              depositYocto: '1250000000000000000000'
            });
          }
        }
      } catch (_) {}
    }

    const creds = getWalletNearSignerCredentials(resolvedWallet);
    const txHash = await api.signAndSendNearFunctionCall({
      accountId: sender,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: contract,
      methodName: 'ft_transfer',
      argsJson: JSON.stringify({ receiver_id: dest, amount: rawAmount }),
      gas: '30000000000000',
      depositYocto: '1'
    });

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`
    };
  }

  // ======================== NEAR Access Keys Management & Key Rotation ========================

  async function fetchNearAccessKeysAsync(accountId) {
    const cleanId = String(accountId || '').trim().toLowerCase();
    if (!cleanId) {
      throw new Error(t('缺少 NEAR 账户 ID', 'Missing NEAR account ID'));
    }
    const res = await fetchJsonWithTimeout(
      NEAR_RPC_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'ak-list',
          method: 'query',
          params: {
            request_type: 'view_access_key_list',
            finality: 'final',
            account_id: cleanId
          }
        })
      },
      8000
    );
    if (!res || res.error || !res.result) {
      const msg = (res && res.error && (res.error.data || res.error.message)) || '';
      if (/does not exist|unknown account/i.test(String(msg))) {
        return { accountId: cleanId, exists: false, keys: [] };
      }
      throw new Error(msg || t('查询 NEAR Access Keys 失败', 'Failed to query NEAR Access Keys'));
    }
    const keys = Array.isArray(res.result.keys) ? res.result.keys : [];
    return {
      accountId: cleanId,
      exists: true,
      keys
    };
  }

  function buildAddKeyActionBytes({ newPublicKeyStr, permission = 'FullAccess' } = {}) {
    const pubBorsh = encodeNearPublicKeyBorsh(newPublicKeyStr);
    // AccessKey { nonce: u64(0), permission: AccessKeyPermission::FullAccess (tag 1) }
    if (permission !== 'FullAccess') {
      throw new Error(t('暂仅支持添加 FullAccess 密钥', 'Only FullAccess permission is supported'));
    }
    return concatUint8Arrays([
      new Uint8Array([5]), // Action::AddKey
      pubBorsh,
      encodeU64LE(0n),
      new Uint8Array([1]) // AccessKeyPermission::FullAccess
    ]);
  }

  function buildDeleteKeyActionBytes({ targetPublicKeyStr } = {}) {
    const pubBorsh = encodeNearPublicKeyBorsh(targetPublicKeyStr);
    return concatUint8Arrays([
      new Uint8Array([6]), // Action::DeleteKey
      pubBorsh
    ]);
  }

  async function addNearAccessKeyAsync({ wallet, newPublicKeyStr } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const resolved = await ensureWalletSigningKeysAsync(wallet);
    const creds = getWalletNearSignerCredentials(resolved);
    if (!creds.accountId || !creds.publicKeyStr || !creds.privateKeyStr) {
      throw new Error(t('当前 NEAR 账户缺少签名密钥', 'Missing NEAR signing credentials'));
    }
    validateSufficientChainBalance({
      wallet: resolved,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: 0.002,
      isNative: true
    });
    const actionBytes = buildAddKeyActionBytes({ newPublicKeyStr, permission: 'FullAccess' });
    const txHash = await buildSignAndBroadcastNearActions({
      accountId: creds.accountId,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: creds.accountId,
      actionsBytes: actionBytes
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}` };
  }

  async function deleteNearAccessKeyAsync({ wallet, targetPublicKeyStr, skipSafetyCheck = false } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const resolved = await ensureWalletSigningKeysAsync(wallet);
    const creds = getWalletNearSignerCredentials(resolved);
    if (!creds.accountId || !creds.publicKeyStr || !creds.privateKeyStr) {
      throw new Error(t('当前 NEAR 账户缺少签名密钥', 'Missing NEAR signing credentials'));
    }
    let resolvedTarget = String(targetPublicKeyStr || '').trim();
    if (resolvedTarget.startsWith('ml-dsa-65-hash:') && creds.publicKeyHandleStr === resolvedTarget && creds.publicKeyStr) {
      resolvedTarget = creds.publicKeyStr;
    }
    if (!skipSafetyCheck) {
      const list = await fetchNearAccessKeysAsync(creds.accountId);
      const fullKeys = (list.keys || []).filter((k) => k && k.access_key && k.access_key.permission === 'FullAccess');
      const cryptoEngine = getCryptoEngine();
      let targetHandle = '';
      if (resolvedTarget.startsWith('ml-dsa-65:') && cryptoEngine && typeof cryptoEngine.buildUniversalStateInitFromMlDsa65PublicKey === 'function') {
        try {
          targetHandle = cryptoEngine.buildUniversalStateInitFromMlDsa65PublicKey(resolvedTarget).publicKeyHandle;
        } catch (_) {}
      }
      const remainingFull = fullKeys.filter((k) => k.public_key !== resolvedTarget && (!targetHandle || k.public_key !== targetHandle));
      if (fullKeys.length > 0 && remainingFull.length === 0) {
        throw new Error(
          t(
            '安全拦截：不能删除账户上最后一把 FullAccess 密钥，否则账户将永久锁死',
            'Safety block: Cannot delete the last FullAccess key on this account'
          )
        );
      }
    }
    validateSufficientChainBalance({
      wallet: resolved,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: 0.002,
      isNative: true
    });
    const actionBytes = buildDeleteKeyActionBytes({ targetPublicKeyStr: resolvedTarget });
    const txHash = await buildSignAndBroadcastNearActions({
      accountId: creds.accountId,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: creds.accountId,
      actionsBytes: actionBytes
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}` };
  }

  async function rotateNearAccountKeyAsync({ wallet, newMnemonic, upgradeToMlDsa65 = false, deleteOldKey = true } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const cryptoEngine = getCryptoEngine();
    const resolved = await ensureWalletSigningKeysAsync(wallet);
    const creds = getWalletNearSignerCredentials(resolved);
    if (!creds.accountId || !creds.publicKeyStr || !creds.privateKeyStr) {
      throw new Error(t('当前 NEAR 账户缺少签名密钥', 'Missing NEAR signing credentials'));
    }

    validateSufficientChainBalance({
      wallet: resolved,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: 0.005,
      isNative: true
    });

    let newDerived;
    if (upgradeToMlDsa65) {
      newDerived = await cryptoEngine.deriveNearMlDsa65FromMnemonicAsync(newMnemonic, 0);
    } else {
      newDerived = await cryptoEngine.deriveNearFromSeedAsync(newMnemonic, 0);
    }
    const newPubKey = upgradeToMlDsa65 ? newDerived.publicKey : newDerived.nearPublicKey;

    const addAction = buildAddKeyActionBytes({ newPublicKeyStr: newPubKey, permission: 'FullAccess' });
    const addTxHash = await buildSignAndBroadcastNearActions({
      accountId: creds.accountId,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: creds.accountId,
      actionsBytes: addAction
    });

    let deleteTxHash = '';
    if (deleteOldKey && creds.publicKeyStr !== newPubKey) {
      const newSignerPriv = upgradeToMlDsa65 ? newDerived.secretKey : newDerived.nearPrivateKey;
      const delAction = buildDeleteKeyActionBytes({ targetPublicKeyStr: creds.publicKeyStr });
      deleteTxHash = await buildSignAndBroadcastNearActions({
        accountId: creds.accountId,
        publicKeyStr: newPubKey,
        privateKeyStr: newSignerPriv,
        receiverId: creds.accountId,
        actionsBytes: delAction
      });
    }

    return {
      addTxHash,
      deleteTxHash,
      upgradeToMlDsa65,
      newDerived,
      explorerUrl: `${NEAR_EXPLORER_TX}${deleteTxHash || addTxHash}`
    };
  }

  async function activateUniversalAccountAsync({ fundingWallet, targetUniversalAccountId, rawStateInitHex, depositNear = '0.05' } = {}) {
    if (!fundingWallet) throw new Error(t('缺少出资账户', 'Funding wallet is required'));
    const resolved = await ensureWalletSigningKeysAsync(fundingWallet);
    const creds = getWalletNearSignerCredentials(resolved);
    const targetId = String(targetUniversalAccountId || '').trim().toLowerCase();
    if (!creds.accountId || !creds.publicKeyStr || !creds.privateKeyStr) {
      throw new Error(t('出资账户缺少 NEAR 签名密钥', 'Funding wallet missing NEAR signing credentials'));
    }
    if (!/^0u[0-9a-hjkmnp-tv-z]{52}$/.test(targetId)) {
      throw new Error(t('目标不是有效的 0u 通用账户地址', 'Invalid 0u universal account ID'));
    }
    validateSufficientChainBalance({
      wallet: resolved,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: Number(depositNear) + 0.01,
      isNative: true
    });
    const cryptoEngine = getCryptoEngine();
    const stateInitBytes = cryptoEngine.hexToBytes(rawStateInitHex);
    const yoctoDeposit = toBaseUnits(depositNear, 24);
    const actionBytes = concatUint8Arrays([
      new Uint8Array([15]), // Action::UniversalStateInit (tag 15)
      encodeU32LE(stateInitBytes.length),
      stateInitBytes,
      encodeU128LE(yoctoDeposit)
    ]);
    const txHash = await buildSignAndBroadcastNearActions({
      accountId: creds.accountId,
      publicKeyStr: creds.publicKeyStr,
      privateKeyStr: creds.privateKeyStr,
      receiverId: targetId,
      actionsBytes: actionBytes
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}` };
  }

  async function registerNearNamedAccountOnChain({
    implicitAccountId,
    publicKeyStr,
    privateKeyStr,
    newAccountId,
    availableBalanceNear = null,
    wallet = null
  } = {}) {
    const resolvedWallet = wallet ? await ensureWalletSigningKeysAsync(wallet) : null;
    const sender = implicitAccountId || (resolvedWallet && resolvedWallet.nearAddress);
    const pub = publicKeyStr || (resolvedWallet && resolvedWallet.nearPublicKey);
    const priv = privateKeyStr || (resolvedWallet && resolvedWallet.nearPrivateKey);
    const domain = String(newAccountId || '').trim().toLowerCase();

    if (!/^[a-z0-9_-]{2,59}\.near$/.test(domain)) {
      throw new Error(t('请输入有效的 .near 域名（如 alice.near）', 'Enter a valid .near account ID (e.g. alice.near)'));
    }
    if (!sender || !pub || !priv) {
      throw new Error(t('缺少 NEAR 隐式账户签名凭据', 'Missing NEAR implicit account signing credentials'));
    }

    let knownBal = availableBalanceNear;
    if (knownBal === null || knownBal === undefined) {
      if (resolvedWallet && typeof resolvedWallet.nearBalance === 'number') {
        knownBal = resolvedWallet.nearBalance;
      }
    }

    if (knownBal !== null && knownBal !== undefined) {
      validateSufficientChainBalance({
        wallet: { nearBalance: knownBal },
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: 0.1,
        isNative: true,
        gasBuffer: 0.005
      });
    } else {
      const balRes = await fetchJsonWithTimeout(
        NEAR_RPC_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'reg-bal',
            method: 'query',
            params: { request_type: 'view_account', finality: 'final', account_id: sender }
          })
        },
        8000
      );
      const liveNearBal =
        balRes && balRes.result && balRes.result.amount !== undefined
          ? Number(fromBaseUnits(String(balRes.result.amount), 24))
          : 0;
      validateSufficientChainBalance({
        wallet: { nearBalance: liveNearBal },
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: 0.1,
        isNative: true,
        gasBuffer: 0.005
      });
    }

    const txHash = await api.signAndSendNearFunctionCall({
      accountId: sender,
      publicKeyStr: pub,
      privateKeyStr: priv,
      receiverId: 'near',
      methodName: 'create_account',
      argsJson: JSON.stringify({
        new_account_id: domain,
        new_public_key: pub
      }),
      gas: '30000000000000',
      depositYocto: '100000000000000000000000' // 0.1 NEAR
    });

    return {
      txHash,
      accountId: domain,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`
    };
  }

  function normalizePayload32Bytes(payloadHash32Bytes) {
    if (typeof payloadHash32Bytes === 'string') {
      const bytes = hexToBytes(payloadHash32Bytes);
      if (bytes.length !== 32) {
        throw new Error(t('MPC 签名载荷必须是 32 字节哈希', 'payloadHash32Bytes must be exactly 32 bytes'));
      }
      return Array.from(bytes);
    }
    if (payloadHash32Bytes instanceof Uint8Array || Array.isArray(payloadHash32Bytes)) {
      if (payloadHash32Bytes.length !== 32) {
        throw new Error(t('MPC 签名载荷必须是 32 字节', 'payloadHash32Bytes must be exactly 32 bytes'));
      }
      return Array.from(payloadHash32Bytes, (b) => Number(b) & 0xff);
    }
    throw new Error(t('无效的 MPC 32 字节载荷格式', 'Invalid payloadHash32Bytes format'));
  }

  function normalizeMpcEddsaBytes(payloadInput) {
    if (typeof payloadInput === 'string') {
      const bytes = hexToBytes(payloadInput);
      if (bytes.length > 1232) {
        throw new Error(t('EdDSA MPC 签名载荷不能超过 1232 字节', 'EdDSA payload must not exceed 1232 bytes'));
      }
      return bytesToHex(bytes);
    }
    if (payloadInput instanceof Uint8Array || Array.isArray(payloadInput)) {
      const bytes = payloadInput instanceof Uint8Array
        ? payloadInput
        : Uint8Array.from(payloadInput, (b) => Number(b) & 0xff);
      if (bytes.length > 1232) {
        throw new Error(t('EdDSA MPC 签名载荷不能超过 1232 字节', 'EdDSA payload must not exceed 1232 bytes'));
      }
      return bytesToHex(bytes);
    }
    throw new Error(t('无效的 EdDSA MPC 载荷格式', 'Invalid EdDSA payload format'));
  }

  function decodeSuccessValueJson(b64) {
    if (!b64 || typeof b64 !== 'string') return null;
    try {
      const bytes = base64ToBytes(b64);
      const txt = new TextDecoder().decode(bytes);
      return JSON.parse(txt);
    } catch (_) {
      return null;
    }
  }

  /**
   * Calls v1.signer on NEAR Mainnet (`sign`) so the user's NEAR master account can authorize
   * cross-chain MPC signatures across both domain_id: 0 (Secp256k1 EVM/BTC/Pearl) and domain_id: 1 (Ed25519 Solana).
   */
  async function requestNearMpcChainSignature({
    wallet,
    payloadHash32Bytes,
    payloadBytes = null,
    path = 'ethereum-1',
    domainId = null,
    keyVersion = 0,
    depositYocto = '1'
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const isEddsa = Number(domainId) === 1;
    let requestBody;

    if (isEddsa) {
      const rawInput = payloadBytes !== null && payloadBytes !== undefined ? payloadBytes : payloadHash32Bytes;
      const eddsaHex = normalizeMpcEddsaBytes(rawInput);
      requestBody = {
        request: {
          path: path || 'solana-1',
          domain_id: 1,
          payload_v2: { Eddsa: eddsaHex }
        }
      };
    } else if (domainId !== null && domainId !== undefined && Number(domainId) === 0) {
      const payloadArray = normalizePayload32Bytes(payloadHash32Bytes);
      requestBody = {
        request: {
          path: path || 'ethereum-1',
          domain_id: 0,
          payload_v2: { Ecdsa: bytesToHex(Uint8Array.from(payloadArray)) }
        }
      };
    } else {
      const payloadArray = normalizePayload32Bytes(payloadHash32Bytes);
      requestBody = {
        request: {
          payload: payloadArray,
          path,
          key_version: keyVersion
        }
      };
    }

    const depositNear = Number(fromBaseUnits(String(depositYocto || '1'), 24));
    validateSufficientChainBalance({
      wallet,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: depositNear > 0 ? depositNear : 0.000001,
      isNative: true,
      gasBuffer: 0.005
    });

    await ensureWalletSigningKeysAsync(wallet);

    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }

    api._lastNearOutcome = null;
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: V1_SIGNER_CONTRACT,
      methodName: 'sign',
      argsJson: JSON.stringify(requestBody),
      gas: '250000000000000',
      depositYocto: String(depositYocto)
    });

    let mpcSignature = null;
    if (api._lastNearOutcome && api._lastNearOutcome.txHash === txHash && api._lastNearOutcome.successValueB64) {
      mpcSignature = decodeSuccessValueJson(api._lastNearOutcome.successValueB64);
    }

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
      signerContract: V1_SIGNER_CONTRACT,
      accountId,
      path: requestBody.request.path,
      domainId: isEddsa ? 1 : 0,
      keyVersion,
      mpcSignature
    };
  }

  // ==================== On-Chain Staking (Meta Pool / Jito / Lido) ====================

  function findStakingPool(poolId) {
    const key = String(poolId || '').toLowerCase().trim();
    if (!key) return null;
    if (key === 'near' || key === 'metapool' || key === 'meta-pool' || key === 'stnear') {
      return STAKING_POOLS.find((p) => p.id === 'metapool_stnear') || STAKING_POOLS[0];
    }
    if (key === 'jito' || key === 'sol' || key === 'jitosol') {
      return STAKING_POOLS.find((p) => p.id === 'jito_sol') || null;
    }
    if (key === 'lido' || key === 'eth' || key === 'steth') {
      return STAKING_POOLS.find((p) => p.id === 'lido_steth') || null;
    }
    return STAKING_POOLS.find((p) => p.id === key || (Array.isArray(p.legacyIds) && p.legacyIds.includes(key))) || null;
  }

  async function ethReadCall(chainKey, to, data, timeoutMs = 6000) {
    const chain = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    if (!chain || !chain.rpc || !to || !data) return null;
    const res = await fetchJsonWithTimeout(
      chain.rpc,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `eth_call_${chain.chainId}`,
          method: 'eth_call',
          params: [{ to, data }, 'latest']
        })
      },
      timeoutMs
    ).catch(() => null);
    const hex = res && typeof res.result === 'string' ? res.result : null;
    return hex && hex !== '0x' ? hex : null;
  }

  let _llamaPoolsCache = { ts: 0, data: null };
  let _stakingMetricsCache = { ts: 0, pools: null };

  /**
   * Fetches live APY and conversion rates across all 21 staking/lending pools from real RPCs and protocol APIs.
   * Never populates fake values: keeps apy/rate as null when an upstream feed is unreachable.
   */
  async function fetchLiveStakingMetrics(opts = {}) {
    if (opts && opts.useCache === true && _stakingMetricsCache.pools && (Date.now() - _stakingMetricsCache.ts < 60_000)) {
      return _stakingMetricsCache.pools;
    }
    const setPool = (id, patch) => {
      const target = findStakingPool(id);
      if (target && patch && typeof patch === 'object') {
        Object.assign(target, patch);
      }
    };

    const formatCompactNum = (val) => {
      const n = Number(val);
      if (!Number.isFinite(n) || n <= 0) return null;
      const lang = getConfiguredLang();
      if (lang === 'en') {
        if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
        if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
        if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
        return Math.round(n).toLocaleString('en-US');
      }
      if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
      if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('en-US')}万`;
      return Math.round(n).toLocaleString('en-US');
    };
    const formatTvlToken = (tokenAmt, sym, usdAmt = null) => {
      const cTok = formatCompactNum(tokenAmt);
      if (!cTok) return null;
      const cUsd = usdAmt > 0 ? formatCompactNum(usdAmt) : null;
      return cUsd ? `${cTok} ${sym} ($${cUsd})` : `${cTok} ${sym}`;
    };

    const useCachedLlama = Boolean(opts && opts.useCache === true && Array.isArray(_llamaPoolsCache.data) && (Date.now() - _llamaPoolsCache.ts < 60_000));

    const [
      narRes,
      rnearSummaryRes,
      rnearAccountsRes,
      rnearApyRes,
      xrheaVpRes,
      xrheaMetaRes,
      orheaStratRes,
      orheaAmountsRes,
      orheaAccountsRes,
      metapoolStateRes,
      linearSummaryRes,
      linearAccountsRes,
      staderPriceRes,
      staderTotalRes,
      staderAccountsRes,
      llamaRes,
      sanctumValRes,
      jitoApyRes,
      jitoRateRes,
      jupLockerRes,
      jupAssetsRes,
      marinadeApyRes,
      lidoRes,
      arcSteakPreviewRes,
      ethSusdeAssetsRes,
      hyperKhypeRes,
      lidoBlockscoutRes,
      susdeBlockscoutRes,
      susdeTotalAssetsRes,
      aaveBaseInfoRes,
      aaveBaseSupplyRes,
      arcSteakAssetsRes,
      khypeSupplyRes,
      burrowWnearRes,
      burrowUsdtRes,
      burrowAccountsRes,
      aaveEthUsdcInfoRes,
      aaveEthWethInfoRes,
      aaveArbUsdcInfoRes,
      khypeInfoRes,
      arcSteakInfoRes
    ] = await Promise.allSettled([
      fetchJsonWithTimeout('https://validators.narwallets.com/metrics_json', {}, 6000),
      viewNearContractCall('lst.rhealab.near', 'get_summary', {}),
      viewNearContractCall('lst.rhealab.near', 'get_number_of_accounts', {}),
      fetchJsonWithTimeout('https://api.ref.finance/get-rnear-apy', {}, 6000),
      viewNearContractCall('xtoken.rhealab.near', 'get_virtual_price', {}),
      viewNearContractCall('xtoken.rhealab.near', 'contract_metadata', {}),
      viewNearContractCall('orhea-conv.rhealab.near', 'get_conversion_strategy_infos', {}),
      viewNearContractCall('orhea-conv.rhealab.near', 'get_converted_source_token_amounts', {}),
      viewNearContractCall('orhea-conv.rhealab.near', 'get_accounts_count', {}),
      viewNearContractCall('meta-pool.near', 'get_contract_state', {}),
      viewNearContractCall('linear-protocol.near', 'get_summary', {}),
      viewNearContractCall('linear-protocol.near', 'get_number_of_accounts', {}),
      viewNearContractCall('v2-nearx.stader-labs.near', 'get_nearx_price', {}),
      viewNearContractCall('v2-nearx.stader-labs.near', 'get_total_staked_balance', {}),
      viewNearContractCall('v2-nearx.stader-labs.near', 'get_number_of_accounts', {}),
      useCachedLlama ? Promise.resolve({ data: _llamaPoolsCache.data }) : fetchJsonWithTimeout('https://yields.llama.fi/pools', {}, 7000),
      fetchJsonWithTimeout('https://extra-api.sanctum.so/v1/sol-value/current?lst=INF&lst=jupSOL&lst=mSOL&lst=JitoSOL', {}, 6000),
      fetchJsonWithTimeout('https://kobe.mainnet.jito.network/api/v1/stake_pool_stats', {}, 6000),
      fetchJsonWithTimeout(
        `${JUPITER_API_URL}/quote?inputMint=${WSOL_MINT}&outputMint=J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn&amount=1000000000&slippageBps=50`,
        {},
        6000
      ),
      callSolanaRpc('getAccountInfo', ['CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN', { encoding: 'base64' }]),
      fetchJsonWithTimeout(
        'https://datapi.jup.ag/v1/assets/search?query=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN,jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v,J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn,mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So,5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm',
        {},
        6000
      ),
      fetchJsonWithTimeout('https://api.marinade.finance/msol/apy/30d', {}, 6000),
      fetchJsonWithTimeout('https://eth-api.lido.fi/v1/protocol/steth/apr/sma', {}, 6000),
      ethReadCall('arc', '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', '0xef8b30f700000000000000000000000000000000000000000000000000000000000f4240'),
      ethReadCall('eth', '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', '0x07a2d13a0000000000000000000000000000000000000000000000000de0b6b3a7640000'),
      fetchJsonWithTimeout(
        'https://aggregator-api.kyberswap.com/hyperevm/api/v1/routes?tokenIn=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&tokenOut=0xfD739d4e423301CE9385c1fb8850539D657C296D&amountIn=1000000000000000000',
        {},
        6000
      ),
      fetchJsonWithTimeout('https://eth.blockscout.com/api/v2/tokens/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', {}, 6000),
      fetchJsonWithTimeout('https://eth.blockscout.com/api/v2/tokens/0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', {}, 6000),
      ethReadCall('eth', '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', '0x01e1d114'),
      fetchJsonWithTimeout('https://api.geckoterminal.com/api/v2/networks/base/tokens/0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB/info', {}, 6000),
      ethReadCall('base', '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', '0x18160ddd'),
      ethReadCall('arc', '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', '0x01e1d114'),
      ethReadCall('hype', '0xfD739d4e423301CE9385c1fb8850539D657C296D', '0x18160ddd'),
      viewNearContractCall('contract.main.burrow.near', 'get_asset', { token_id: 'wrap.near' }),
      viewNearContractCall('contract.main.burrow.near', 'get_asset', { token_id: 'usdt.tether-token.near' }),
      viewNearContractCall('contract.main.burrow.near', 'get_num_accounts', {}),
      fetchJsonWithTimeout('https://eth.blockscout.com/api/v2/tokens/0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', {}, 6000),
      fetchJsonWithTimeout('https://eth.blockscout.com/api/v2/tokens/0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', {}, 6000),
      fetchJsonWithTimeout('https://api.geckoterminal.com/api/v2/networks/arbitrum/tokens/0x724dc807b04555b71ed48a6896b6f41593b8c637/info', {}, 6000),
      fetchJsonWithTimeout('https://api.geckoterminal.com/api/v2/networks/hyperevm/tokens/0xfd739d4e423301ce9385c1fb8850539d657c296d/info', {}, 6000),
      fetchJsonWithTimeout('https://explorer.arc.io/api/v2/tokens/0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', {}, 5000)
    ]);

    const llamaPools = llamaRes.status === 'fulfilled' && llamaRes.value && Array.isArray(llamaRes.value.data)
      ? llamaRes.value.data
      : [];
    if (!useCachedLlama && llamaPools.length > 0) {
      _llamaPoolsCache = { ts: Date.now(), data: llamaPools };
    }
    const findLlamaPool = (predicate) => {
      const matches = llamaPools.filter((p) => p && predicate(p));
      if (matches.length === 0) return null;
      matches.sort((a, b) => Number(b.tvlUsd || 0) - Number(a.tvlUsd || 0));
      return matches[0];
    };
    const findLlamaApy = (predicate) => {
      const top = findLlamaPool((p) => typeof p.apy === 'number' && Number.isFinite(p.apy) && p.apy > 0 && predicate(p));
      return top ? Number(Number(top.apy).toFixed(2)) : null;
    };
    const findLlamaTvlUsd = (predicate) => {
      const top = findLlamaPool((p) => typeof p.tvlUsd === 'number' && Number.isFinite(p.tvlUsd) && p.tvlUsd > 0 && predicate(p));
      return top ? Number(top.tvlUsd) : null;
    };
    const findLlamaTvlText = (predicate) => {
      const top = findLlamaPool((p) => typeof p.tvlUsd === 'number' && Number.isFinite(p.tvlUsd) && p.tvlUsd > 0 && predicate(p));
      if (!top) return null;
      const c = formatCompactNum(top.tvlUsd);
      return c ? `$${c}` : null;
    };

    // 1. Rhea Liquid Staking (NEAR -> rNEAR, lst.rhealab.near)
    if (rnearSummaryRes.status === 'fulfilled' && rnearSummaryRes.value) {
      const sum = rnearSummaryRes.value;
      if (sum.ft_price) {
        try {
          const ftPrice = Number(BigInt(String(sum.ft_price)) / 10n ** 12n) / 1e12;
          if (Number.isFinite(ftPrice) && ftPrice > 0) setPool('rhea_rnear', { rate: 1 / ftPrice });
        } catch (_) {}
      }
      if (sum.total_staked_near_amount) {
        try {
          const stakedNear = Number(BigInt(String(sum.total_staked_near_amount)) / 10n ** 18n) / 1e6;
          const tvlText = formatTvlToken(stakedNear, 'NEAR');
          if (tvlText) setPool('rhea_rnear', { tvlText, tvlTokenAmount: stakedNear });
        } catch (_) {}
      }
    }
    if (rnearAccountsRes.status === 'fulfilled' && Number(rnearAccountsRes.value) > 0) {
      setPool('rhea_rnear', { stakersCount: Number(rnearAccountsRes.value) });
    }
    let rnearApy = null;
    if (rnearApyRes.status === 'fulfilled' && rnearApyRes.value && rnearApyRes.value.data !== undefined) {
      const num = Number(rnearApyRes.value.data);
      if (Number.isFinite(num) && num > 0) rnearApy = Number(num.toFixed(2));
    }
    if (rnearApy === null) {
      rnearApy = findLlamaApy((p) => p.project === 'rhea-lst' && String(p.symbol || '').toUpperCase() === 'RNEAR');
    }
    if (rnearApy !== null) setPool('rhea_rnear', { apy: rnearApy });

    // 2. Rhea xRHEA Staking (RHEA -> xRHEA, xtoken.rhealab.near)
    if (xrheaVpRes.status === 'fulfilled' && xrheaVpRes.value !== null && xrheaVpRes.value !== undefined) {
      const vpNum = Number(xrheaVpRes.value);
      if (Number.isFinite(vpNum) && vpNum > 0) {
        const priceRheaPerXrhea = vpNum / 1e8;
        setPool('rhea_xrhea', { rate: 1 / priceRheaPerXrhea });
      }
    }
    let xrheaApy = null;
    if (xrheaMetaRes.status === 'fulfilled' && xrheaMetaRes.value) {
      const cm = xrheaMetaRes.value;
      const rps = Number(cm.reward_per_sec);
      const locked = Number(cm.cur_locked_token_amount || cm.locked_token_amount);
      if (Number.isFinite(rps) && rps > 0 && Number.isFinite(locked) && locked > 0) {
        const calc = ((rps * 31536000) / locked) * 100;
        if (Number.isFinite(calc) && calc > 0 && calc < 500) xrheaApy = Number(calc.toFixed(2));
      }
      if (cm.cur_locked_token_amount || cm.locked_token_amount) {
        try {
          const lockedRhea = Number(BigInt(String(cm.cur_locked_token_amount || cm.locked_token_amount)) / 10n ** 12n) / 1e6;
          const tvlText = formatTvlToken(lockedRhea, 'RHEA');
          if (tvlText) setPool('rhea_xrhea', { tvlText, tvlTokenAmount: lockedRhea });
        } catch (_) {}
      }
      if (Number(cm.current_account_num) > 0) {
        setPool('rhea_xrhea', { stakersCount: Number(cm.current_account_num) });
      }
    }
    if (xrheaApy === null) {
      xrheaApy = findLlamaApy((p) => p.project === 'rhea-lst' && String(p.symbol || '').toUpperCase() === 'XRHEA');
    }
    if (xrheaApy !== null) setPool('rhea_xrhea', { apy: xrheaApy });

    // 3. Rhea oRHEA Convert (orhea-conv.rhealab.near)
    if (orheaStratRes.status === 'fulfilled' && orheaStratRes.value && typeof orheaStratRes.value === 'object') {
      const tiers = [];
      for (const [kStr, v] of Object.entries(orheaStratRes.value)) {
        try {
          const parsedKey = JSON.parse(kStr);
          const days = Number(parsedKey?.Oneshot?.lock_period_days);
          const rateBig = v && v.conversion_rate ? BigInt(String(v.conversion_rate)) : 0n;
          const rateVal = Number(rateBig / 10n ** 26n) / 10000;
          if (Number.isFinite(days) && days > 0 && Number.isFinite(rateVal) && rateVal > 0) {
            tiers.push({ days, rate: rateVal });
          }
        } catch (_) {}
      }
      if (tiers.length > 0) {
        tiers.sort((a, b) => a.days - b.days);
        const minR = tiers[0].rate;
        const maxR = tiers[tiers.length - 1].rate;
        setPool('rhea_orhea_convert', {
          lockTiers: tiers,
          rate: maxR,
          rateRangeText: `${minR.toFixed(2)} ~ ${maxR.toFixed(2)} RHEA`,
          apy: Math.round(maxR * 100)
        });
      }
    }
    if (orheaAmountsRes.status === 'fulfilled' && orheaAmountsRes.value && orheaAmountsRes.value['otoken.rhealab.near']) {
      try {
        const amtOrhea = Number(BigInt(String(orheaAmountsRes.value['otoken.rhealab.near'])) / 10n ** 12n) / 1e6;
        const tvlText = formatTvlToken(amtOrhea, 'oRHEA');
        if (tvlText) setPool('rhea_orhea_convert', { tvlText, tvlTokenAmount: amtOrhea });
      } catch (_) {}
    }
    if (orheaAccountsRes.status === 'fulfilled' && Number(orheaAccountsRes.value) > 0) {
      setPool('rhea_orhea_convert', { stakersCount: Number(orheaAccountsRes.value) });
    }

    // 4 & 5. Meta Pool (stNEAR) & LiNEAR
    if (narRes.status === 'fulfilled' && narRes.value) {
      const m = narRes.value;
      const apy = Number(m.st_near_30_day_apy || m.st_near_7_day_apy);
      const price = Number(m.st_near_price);
      if (Number.isFinite(apy) && apy > 0) setPool('metapool_stnear', { apy: Number(apy.toFixed(2)) });
      if (Number.isFinite(price) && price > 0) setPool('metapool_stnear', { rate: 1 / price });
      const linApy = Number(m.linear_30_day_apy || m.linear_3_day_apy);
      if (Number.isFinite(linApy) && linApy > 0) setPool('linear_near', { apy: Number(linApy.toFixed(2)) });
    }
    if (metapoolStateRes.status === 'fulfilled' && metapoolStateRes.value) {
      const ms = metapoolStateRes.value;
      if (ms.total_for_staking) {
        try {
          const staked = Number(BigInt(String(ms.total_for_staking)) / 10n ** 18n) / 1e6;
          const tvlText = formatTvlToken(staked, 'NEAR');
          if (tvlText) setPool('metapool_stnear', { tvlText, tvlTokenAmount: staked });
        } catch (_) {}
      }
      if (Number(ms.accounts_count) > 0) {
        setPool('metapool_stnear', { stakersCount: Number(ms.accounts_count) });
      }
    }
    if (linearSummaryRes.status === 'fulfilled' && linearSummaryRes.value) {
      const ls = linearSummaryRes.value;
      if (ls.ft_price) {
        try {
          const p = Number(BigInt(String(ls.ft_price)) / 10n ** 12n) / 1e12;
          if (Number.isFinite(p) && p > 0) setPool('linear_near', { rate: 1 / p });
        } catch (_) {}
      }
      if (ls.total_staked_near_amount) {
        try {
          const staked = Number(BigInt(String(ls.total_staked_near_amount)) / 10n ** 18n) / 1e6;
          const tvlText = formatTvlToken(staked, 'NEAR');
          if (tvlText) setPool('linear_near', { tvlText, tvlTokenAmount: staked });
        } catch (_) {}
      }
    }
    if (linearAccountsRes.status === 'fulfilled' && Number(linearAccountsRes.value) > 0) {
      setPool('linear_near', { stakersCount: Number(linearAccountsRes.value) });
    }

    // 6. Stader NearX
    if (staderPriceRes.status === 'fulfilled' && staderPriceRes.value) {
      try {
        const p = Number(BigInt(String(staderPriceRes.value)) / 10n ** 12n) / 1e12;
        if (Number.isFinite(p) && p > 0) setPool('stader_nearx', { rate: 1 / p });
      } catch (_) {}
    }
    if (staderTotalRes.status === 'fulfilled' && staderTotalRes.value) {
      try {
        const staked = Number(BigInt(String(staderTotalRes.value)) / 10n ** 18n) / 1e6;
        const tvlText = formatTvlToken(staked, 'NEAR');
        if (tvlText) setPool('stader_nearx', { tvlText, tvlTokenAmount: staked });
      } catch (_) {}
    }
    if (staderAccountsRes.status === 'fulfilled' && Number(staderAccountsRes.value) > 0) {
      setPool('stader_nearx', { stakersCount: Number(staderAccountsRes.value) });
    }
    let nearxApy = findLlamaApy((p) => String(p.chain || '').toLowerCase() === 'near' && /nearx/i.test(String(p.symbol || '')));
    if (nearxApy === null && narRes.status === 'fulfilled' && narRes.value) {
      const m = narRes.value;
      const baseEpochApy = Number(m.linear_30_day_apy || m.st_near_30_day_apy || m.mp01_staking_apy);
      if (Number.isFinite(baseEpochApy) && baseEpochApy > 0) {
        nearxApy = Number(baseEpochApy.toFixed(2));
      }
    }
    if (nearxApy !== null) setPool('stader_nearx', { apy: nearxApy });

    // 7-11. Solana LSTs & Jupiter DAO Staking
    const sanctumVals = sanctumValRes.status === 'fulfilled' && sanctumValRes.value && sanctumValRes.value.solValues
      ? sanctumValRes.value.solValues
      : {};
    const setRateFromSanctum = (poolId, symKey) => {
      if (sanctumVals[symKey]) {
        const solPerLst = Number(sanctumVals[symKey]) / 1e9;
        if (Number.isFinite(solPerLst) && solPerLst > 0) setPool(poolId, { rate: 1 / solPerLst });
      }
    };
    setRateFromSanctum('jito_sol', 'JitoSOL');
    setRateFromSanctum('jupiter_sol', 'jupSOL');
    setRateFromSanctum('marinade_msol', 'mSOL');
    setRateFromSanctum('sanctum_inf', 'INF');

    if (jitoApyRes.status === 'fulfilled' && jitoApyRes.value && Array.isArray(jitoApyRes.value.apy) && jitoApyRes.value.apy.length > 0) {
      const latestApy = Number(jitoApyRes.value.apy[jitoApyRes.value.apy.length - 1].data) * 100;
      if (Number.isFinite(latestApy) && latestApy > 0 && latestApy < 50) {
        setPool('jito_sol', { apy: Number(latestApy.toFixed(2)) });
      }
    }
    if (!findStakingPool('jito_sol')?.apy) {
      const jitoLlama = findLlamaApy((p) => p.project === 'jito-liquid-staking' && String(p.symbol || '').toUpperCase() === 'JITOSOL');
      if (jitoLlama !== null) setPool('jito_sol', { apy: jitoLlama });
    }
    if (!findStakingPool('jito_sol')?.rate && jitoRateRes.status === 'fulfilled' && jitoRateRes.value && jitoRateRes.value.outAmount) {
      const r = Number(fromBaseUnits(String(jitoRateRes.value.outAmount), 9));
      if (Number.isFinite(r) && r > 0) setPool('jito_sol', { rate: r });
    }

    // Jupiter DAO Staking (JUP -> Staked JUP) from Solana Locker CVMdMd... offset 73
    if (jupLockerRes.status === 'fulfilled' && jupLockerRes.value && jupLockerRes.value.value?.data?.[0]) {
      try {
        const buf = base64ToBytes(String(jupLockerRes.value.value.data[0]));
        if (buf.length >= 81) {
          const lockedRaw = decodeU64LE(buf, 73);
          const lockedJup = Number(lockedRaw) / 1e6;
          if (Number.isFinite(lockedJup) && lockedJup > 0) {
            const asrApy = Number(((200_000_000 / lockedJup) * 100).toFixed(2));
            const tvlText = formatTvlToken(lockedJup, 'JUP');
            setPool('jupiter_jup', { rate: 1.0, apy: asrApy, tvlText, tvlTokenAmount: lockedJup });
          }
        }
      } catch (_) {}
    } else {
      setPool('jupiter_jup', { rate: 1.0 });
    }

    // Solana LST holderCount & TVL (converted to staked SOL quantity via live exchange rate)
    const jupAssets = jupAssetsRes.status === 'fulfilled' && jupAssetsRes.value && Array.isArray(jupAssetsRes.value)
      ? jupAssetsRes.value
      : [];
    const jupAssetPoolMap = {
      JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { id: 'jupiter_jup', sym: 'JUP', stakersOnly: true },
      J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: { id: 'jito_sol', sym: 'JitoSOL', solConverted: true },
      jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v: { id: 'jupiter_sol', sym: 'jupSOL', solConverted: true },
      mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: { id: 'marinade_msol', sym: 'mSOL', solConverted: true },
      '5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm': { id: 'sanctum_inf', sym: 'INF', solConverted: true }
    };
    for (const asset of jupAssets) {
      if (!asset) continue;
      const cfg = jupAssetPoolMap[String(asset.id || '')] ||
        Object.values(jupAssetPoolMap).find((c) => c.sym.toLowerCase() === String(asset.symbol || '').toLowerCase());
      if (!cfg) continue;
      const patch = {};
      if (Number(asset.holderCount) > 0) patch.stakersCount = Number(asset.holderCount);
      if (!cfg.stakersOnly && Number(asset.totalSupply) > 0) {
        const poolObj = findStakingPool(cfg.id);
        const solPerLst = sanctumVals[cfg.sym]
          ? Number(sanctumVals[cfg.sym]) / 1e9
          : (poolObj && poolObj.rate > 0 ? 1 / poolObj.rate : 1);
        const stakedAmount = cfg.solConverted && Number.isFinite(solPerLst) && solPerLst > 0
          ? Number(asset.totalSupply) * solPerLst
          : Number(asset.totalSupply);
        const unitLabel = cfg.solConverted ? 'SOL' : cfg.sym;
        const tvlText = formatTvlToken(stakedAmount, unitLabel, Number(asset.mcap || 0));
        if (tvlText) patch.tvlText = tvlText;
      }
      if (Object.keys(patch).length > 0) setPool(cfg.id, patch);
    }

    const jupsolApy = findLlamaApy((p) => p.project === 'jupiter-staked-sol' && String(p.symbol || '').toUpperCase() === 'JUPSOL');
    if (jupsolApy !== null) setPool('jupiter_sol', { apy: jupsolApy });

    let msolApy = null;
    if (marinadeApyRes.status === 'fulfilled' && marinadeApyRes.value) {
      const v = Number(marinadeApyRes.value.value) * 100;
      if (Number.isFinite(v) && v > 0 && v < 50) msolApy = Number(v.toFixed(2));
      const endP = Number(marinadeApyRes.value.end_price);
      if (!findStakingPool('marinade_msol')?.rate && Number.isFinite(endP) && endP > 0) {
        setPool('marinade_msol', { rate: 1 / endP });
      }
    }
    if (msolApy === null) {
      msolApy = findLlamaApy((p) => p.project === 'marinade-liquid-staking' && String(p.symbol || '').toUpperCase() === 'MSOL');
    }
    if (msolApy !== null) setPool('marinade_msol', { apy: msolApy });

    const infApy = findLlamaApy((p) => p.project === 'sanctum-infinity' && String(p.symbol || '').toUpperCase() === 'INF');
    if (infApy !== null) setPool('sanctum_inf', { apy: infApy });

    // 12. Lido Liquid Staking (ETH -> stETH)
    if (lidoRes.status === 'fulfilled' && lidoRes.value && lidoRes.value.data) {
      const data = lidoRes.value.data;
      const aprs = Array.isArray(data.aprs) ? data.aprs : [];
      const latest = Number(data.smaApr !== undefined ? data.smaApr : (aprs.length > 0 ? aprs[aprs.length - 1].apr : NaN));
      if (Number.isFinite(latest) && latest > 0) {
        setPool('lido_steth', { apy: Number(latest.toFixed(2)), rate: 1.0 });
      }
    }
    const lidoUsd = findLlamaTvlUsd((p) => p.project === 'lido' && String(p.symbol || '').toUpperCase() === 'STETH');
    let lidoTvlSet = false;
    if (lidoBlockscoutRes.status === 'fulfilled' && lidoBlockscoutRes.value) {
      const hCount = Number(lidoBlockscoutRes.value?.holders_count || lidoBlockscoutRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('lido_steth', { stakersCount: hCount });
      try {
        const supRaw = lidoBlockscoutRes.value?.total_supply;
        const ethStaked = supRaw ? Number(BigInt(String(supRaw)) / 10n ** 12n) / 1e6 : null;
        if (Number.isFinite(ethStaked) && ethStaked > 0) {
          const tvlText = formatTvlToken(ethStaked, 'ETH', lidoUsd);
          if (tvlText) {
            setPool('lido_steth', { tvlText });
            lidoTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!lidoTvlSet) {
      const lidoTvl = findLlamaTvlText((p) => p.project === 'lido' && String(p.symbol || '').toUpperCase() === 'STETH');
      if (lidoTvl) setPool('lido_steth', { tvlText: lidoTvl });
    }

    // 13. Arc Mainnet Steakhouse Prime USDC (ERC-4626)
    const arcSteakApy = findLlamaApy((p) => String(p.chain || '').toLowerCase() === 'arc' && String(p.symbol || '').toUpperCase() === 'STEAKUSDC');
    if (arcSteakApy !== null) setPool('arc_steak_usdc', { apy: arcSteakApy });
    if (arcSteakInfoRes.status === 'fulfilled' && arcSteakInfoRes.value) {
      const hCount = Number(arcSteakInfoRes.value?.holders_count || arcSteakInfoRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('arc_steak_usdc', { stakersCount: hCount });
    }
    const arcUsd = findLlamaTvlUsd((p) => String(p.chain || '').toLowerCase() === 'arc' && String(p.symbol || '').toUpperCase() === 'STEAKUSDC');
    let arcTvlSet = false;
    if (arcSteakAssetsRes.status === 'fulfilled' && arcSteakAssetsRes.value) {
      try {
        const usdcStaked = Number(BigInt(arcSteakAssetsRes.value)) / 1e6;
        if (Number.isFinite(usdcStaked) && usdcStaked > 0) {
          const tvlText = formatTvlToken(usdcStaked, 'USDC', arcUsd || usdcStaked);
          if (tvlText) {
            setPool('arc_steak_usdc', { tvlText });
            arcTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!arcTvlSet && arcUsd > 0) {
      const tvlText = formatTvlToken(arcUsd, 'USDC', arcUsd);
      if (tvlText) setPool('arc_steak_usdc', { tvlText });
    }
    if (arcSteakPreviewRes.status === 'fulfilled' && arcSteakPreviewRes.value) {
      try {
        const shares = BigInt(arcSteakPreviewRes.value);
        const r = Number(shares / 10n ** 12n) / 1e6;
        if (Number.isFinite(r) && r > 0) setPool('arc_steak_usdc', { rate: r });
      } catch (_) {}
    }

    // 14. Aave V3 Base USDC
    const baseAaveApy = findLlamaApy((p) => String(p.chain || '').toLowerCase() === 'base' && p.project === 'aave-v3' && String(p.symbol || '').toUpperCase() === 'USDC');
    if (baseAaveApy !== null) setPool('aave_base_usdc', { apy: baseAaveApy, rate: 1.0 });
    const baseUsd = findLlamaTvlUsd((p) => String(p.chain || '').toLowerCase() === 'base' && p.project === 'aave-v3' && String(p.symbol || '').toUpperCase() === 'USDC');
    if (aaveBaseInfoRes.status === 'fulfilled' && aaveBaseInfoRes.value) {
      const hCount = Number(aaveBaseInfoRes.value?.data?.attributes?.holders?.count);
      if (Number.isFinite(hCount) && hCount > 0) setPool('aave_base_usdc', { stakersCount: hCount });
    }
    if (baseUsd > 0) {
      const tvlText = formatTvlToken(baseUsd, 'USDC', baseUsd);
      if (tvlText) setPool('aave_base_usdc', { tvlText });
    } else if (aaveBaseSupplyRes.status === 'fulfilled' && aaveBaseSupplyRes.value) {
      try {
        const usdcSupply = Number(BigInt(aaveBaseSupplyRes.value)) / 1e6;
        if (Number.isFinite(usdcSupply) && usdcSupply > 0) {
          const tvlText = formatTvlToken(usdcSupply, 'USDC', usdcSupply);
          if (tvlText) setPool('aave_base_usdc', { tvlText });
        }
      } catch (_) {}
    }

    // 14b. Aave V3 Ethereum USDC
    const ethAaveApy = findLlamaApy((p) => p.chain === 'Ethereum' && p.project === 'aave-v3' && p.symbol === 'USDC');
    if (ethAaveApy !== null) setPool('aave_eth_usdc', { apy: ethAaveApy, rate: 1.0 });
    const ethAaveUsd = findLlamaTvlUsd((p) => p.chain === 'Ethereum' && p.project === 'aave-v3' && p.symbol === 'USDC');
    if (ethAaveUsd > 0) {
      const tvlText = formatTvlToken(ethAaveUsd, 'USDC', ethAaveUsd);
      if (tvlText) setPool('aave_eth_usdc', { tvlText });
    }
    if (aaveEthUsdcInfoRes.status === 'fulfilled' && aaveEthUsdcInfoRes.value) {
      const hCount = Number(aaveEthUsdcInfoRes.value?.holders_count || aaveEthUsdcInfoRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('aave_eth_usdc', { stakersCount: hCount });
    }

    // 14c. Aave V3 Arbitrum USDC
    const arbAaveApy = findLlamaApy((p) => p.chain === 'Arbitrum' && p.project === 'aave-v3' && p.symbol === 'USDC');
    if (arbAaveApy !== null) setPool('aave_arb_usdc', { apy: arbAaveApy, rate: 1.0 });
    const arbAaveUsd = findLlamaTvlUsd((p) => p.chain === 'Arbitrum' && p.project === 'aave-v3' && p.symbol === 'USDC');
    if (arbAaveUsd > 0) {
      const tvlText = formatTvlToken(arbAaveUsd, 'USDC', arbAaveUsd);
      if (tvlText) setPool('aave_arb_usdc', { tvlText });
    }
    if (aaveArbUsdcInfoRes.status === 'fulfilled' && aaveArbUsdcInfoRes.value) {
      const hCount = Number(aaveArbUsdcInfoRes.value?.data?.attributes?.holders?.count || aaveArbUsdcInfoRes.value?.holders_count);
      if (Number.isFinite(hCount) && hCount > 0) setPool('aave_arb_usdc', { stakersCount: hCount });
    }

    // 14d. Aave V3 Ethereum ETH (WETH)
    const ethWethApy = findLlamaApy((p) => p.chain === 'Ethereum' && p.project === 'aave-v3' && String(p.symbol || '').toUpperCase() === 'WETH');
    if (ethWethApy !== null) setPool('aave_eth_weth', { apy: ethWethApy, rate: 1.0 });
    const ethWethUsd = findLlamaTvlUsd((p) => p.chain === 'Ethereum' && p.project === 'aave-v3' && String(p.symbol || '').toUpperCase() === 'WETH');
    let ethWethTvlSet = false;
    if (aaveEthWethInfoRes.status === 'fulfilled' && aaveEthWethInfoRes.value) {
      const hCount = Number(aaveEthWethInfoRes.value?.holders_count || aaveEthWethInfoRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('aave_eth_weth', { stakersCount: hCount });
      try {
        const supRaw = aaveEthWethInfoRes.value?.total_supply;
        const ethSupplied = supRaw ? Number(BigInt(String(supRaw)) / 10n ** 12n) / 1e6 : null;
        if (Number.isFinite(ethSupplied) && ethSupplied > 0) {
          const tvlText = formatTvlToken(ethSupplied, 'ETH', ethWethUsd);
          if (tvlText) {
            setPool('aave_eth_weth', { tvlText });
            ethWethTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!ethWethTvlSet && ethWethUsd > 0) {
      const tvlText = formatLlamaTvlTextOrUsd(ethWethUsd);
      if (tvlText) setPool('aave_eth_weth', { tvlText });
    }
    function formatLlamaTvlTextOrUsd(usdVal) {
      const c = formatCompactNum(usdVal);
      return c ? `$${c}` : null;
    }

    // 14e. Burrow Finance (Rhea Lend) NEAR & USDT
    const burrowAccountsCount = burrowAccountsRes.status === 'fulfilled' && Number(burrowAccountsRes.value) > 0
      ? Number(burrowAccountsRes.value)
      : null;
    const resolveNearPriceFromRegistry = () => {
      try {
        const reg = getTokenRegistry();
        const st = (typeof globalThis !== 'undefined' && (globalThis.NearCAState || globalThis.state)) || null;
        const lists = [
          (st && Array.isArray(st.liveTokens)) ? st.liveTokens : [],
          (reg && Array.isArray(reg.LIVE_DEFUSE_TOKENS)) ? reg.LIVE_DEFUSE_TOKENS : []
        ];
        for (const list of lists) {
          const hit = list.find((t) => t && (String(t.symbol || '').toUpperCase() === 'NEAR' || t.contractAddress === 'wrap.near') && typeof t.price === 'number' && t.price > 0);
          if (hit) return hit.price;
        }
      } catch (_) {}
      return null;
    };
    const nearPriceUsd = resolveNearPriceFromRegistry();
    const applyBurrowAsset = (poolId, rpcRes, baseDec, sym, llamaSyms) => {
      const isBurrowProj = (p) => String(p.chain || '').toLowerCase() === 'near' && /burrow|rhea-lend/i.test(String(p.project || ''));
      const symMatch = (p) => llamaSyms.includes(String(p.symbol || '').toUpperCase());
      let apy = findLlamaApy((p) => isBurrowProj(p) && symMatch(p));
      const llamaUsd = findLlamaTvlUsd((p) => isBurrowProj(p) && symMatch(p));
      const patch = {};
      if (rpcRes.status === 'fulfilled' && rpcRes.value && typeof rpcRes.value === 'object') {
        const asset = rpcRes.value;
        patch.rate = 1.0;
        const rpcApr = Number(asset.supply_apr) * 100;
        if (apy === null && Number.isFinite(rpcApr) && rpcApr > 0) {
          apy = Number(rpcApr.toFixed(2));
        }
        const supBal = asset.supplied && asset.supplied.balance;
        if (supBal) {
          try {
            const totalDec = baseDec + Number(asset.config?.extra_decimals || 0);
            const shift = Math.max(0, totalDec - 6);
            const suppliedAmt = Number(BigInt(String(supBal)) / (10n ** BigInt(shift))) / 1e6;
            if (Number.isFinite(suppliedAmt) && suppliedAmt > 0) {
              patch.tvlTokenAmount = suppliedAmt;
              const isUsdStable = sym === 'USDT' || sym === 'USDC';
              const unitPx = isUsdStable ? 1.0 : (sym === 'NEAR' ? nearPriceUsd : null);
              const computedUsd = (typeof unitPx === 'number' && unitPx > 0) ? suppliedAmt * unitPx : null;
              patch.tvlUsd = computedUsd;
              const tvlText = formatTvlToken(suppliedAmt, sym, computedUsd);
              if (tvlText) patch.tvlText = tvlText;
            }
          } catch (_) {}
        }
      }
      if (!patch.tvlText && llamaUsd > 0) {
        if (sym === 'USDT' || sym === 'USDC') {
          patch.tvlTokenAmount = llamaUsd;
          patch.tvlUsd = llamaUsd;
          const tvlText = formatTvlToken(llamaUsd, sym, llamaUsd);
          if (tvlText) patch.tvlText = tvlText;
        } else {
          patch.tvlUsd = llamaUsd;
          const c = formatCompactNum(llamaUsd);
          if (c) patch.tvlText = `$${c}`;
        }
      }
      if (apy !== null) {
        patch.apy = apy;
        if (!patch.rate) patch.rate = 1.0;
      }
      if (burrowAccountsCount) patch.stakersCount = burrowAccountsCount;
      if (Object.keys(patch).length > 0) setPool(poolId, patch);
    };
    applyBurrowAsset('burrow_near_wnear', burrowWnearRes, 24, 'NEAR', ['WNEAR', 'NEAR']);
    applyBurrowAsset('burrow_near_usdt', burrowUsdtRes, 6, 'USDT', ['USDT']);

    // 15. Ethena sUSDe (ETH ERC-4626)
    const susdeApy = findLlamaApy((p) => p.project === 'ethena-usde' && String(p.symbol || '').toUpperCase() === 'SUSDE');
    if (susdeApy !== null) setPool('ethena_susde', { apy: susdeApy });
    const susdeUsd = findLlamaTvlUsd((p) => p.project === 'ethena-usde' && String(p.symbol || '').toUpperCase() === 'SUSDE');
    if (susdeBlockscoutRes.status === 'fulfilled' && susdeBlockscoutRes.value) {
      const hCount = Number(susdeBlockscoutRes.value?.holders_count || susdeBlockscoutRes.value?.holders);
      if (Number.isFinite(hCount) && hCount > 0) setPool('ethena_susde', { stakersCount: hCount });
    }
    let susdeTvlSet = false;
    if (susdeTotalAssetsRes.status === 'fulfilled' && susdeTotalAssetsRes.value) {
      try {
        const usdeStaked = Number(BigInt(susdeTotalAssetsRes.value) / 10n ** 12n) / 1e6;
        if (Number.isFinite(usdeStaked) && usdeStaked > 0) {
          const tvlText = formatTvlToken(usdeStaked, 'USDe', susdeUsd || usdeStaked);
          if (tvlText) {
            setPool('ethena_susde', { tvlText });
            susdeTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!susdeTvlSet && susdeUsd > 0) {
      const tvlText = formatTvlToken(susdeUsd, 'USDe', susdeUsd);
      if (tvlText) setPool('ethena_susde', { tvlText });
    }
    if (ethSusdeAssetsRes.status === 'fulfilled' && ethSusdeAssetsRes.value) {
      try {
        const assetsPerShare = BigInt(ethSusdeAssetsRes.value);
        const num = Number(assetsPerShare / 10n ** 12n) / 1e6;
        if (Number.isFinite(num) && num > 0) setPool('ethena_susde', { rate: 1 / num });
      } catch (_) {}
    }

    // 16. Kinetiq kHYPE (HyperEVM)
    const khypeApy = findLlamaApy((p) => p.project === 'kinetiq-khype' && String(p.symbol || '').toUpperCase() === 'KHYPE');
    if (khypeApy !== null) setPool('hyper_khype', { apy: khypeApy });
    if (khypeInfoRes.status === 'fulfilled' && khypeInfoRes.value) {
      const hCount = Number(khypeInfoRes.value?.data?.attributes?.holders?.count || khypeInfoRes.value?.holders_count);
      if (Number.isFinite(hCount) && hCount > 0) setPool('hyper_khype', { stakersCount: hCount });
    }
    if (hyperKhypeRes.status === 'fulfilled' && hyperKhypeRes.value && hyperKhypeRes.value.data?.routeSummary?.amountOut) {
      const r = Number(fromBaseUnits(String(hyperKhypeRes.value.data.routeSummary.amountOut), 18));
      if (Number.isFinite(r) && r > 0) setPool('hyper_khype', { rate: r });
    }
    const khypeUsd = findLlamaTvlUsd((p) => p.project === 'kinetiq-khype' && String(p.symbol || '').toUpperCase() === 'KHYPE');
    let khypeTvlSet = false;
    if (khypeSupplyRes.status === 'fulfilled' && khypeSupplyRes.value) {
      try {
        const khypeSupply = Number(BigInt(khypeSupplyRes.value) / 10n ** 12n) / 1e6;
        const poolR = findStakingPool('hyper_khype')?.rate;
        const hypeStaked = poolR && poolR > 0 ? (khypeSupply / poolR) : khypeSupply;
        if (Number.isFinite(hypeStaked) && hypeStaked > 0) {
          const tvlText = formatTvlToken(hypeStaked, 'HYPE', khypeUsd);
          if (tvlText) {
            setPool('hyper_khype', { tvlText });
            khypeTvlSet = true;
          }
        }
      } catch (_) {}
    }
    if (!khypeTvlSet) {
      const khypeTvl = findLlamaTvlText((p) => p.project === 'kinetiq-khype' && String(p.symbol || '').toUpperCase() === 'KHYPE');
      if (khypeTvl) setPool('hyper_khype', { tvlText: khypeTvl });
    }

    _stakingMetricsCache = { ts: Date.now(), pools: STAKING_POOLS };
    return STAKING_POOLS;
  }

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
        const body = JSON.stringify({
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
        });
        const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
        let res = await fetchJsonWithTimeout(NEAR_RPC_URL, opts, 4000).catch(() => null);
        let bytes = res && res.result && res.result.result;
        if (!Array.isArray(bytes)) {
          res = await fetchJsonWithTimeout('https://free.rpc.fastnear.com', opts, 4000).catch(() => null);
          bytes = res && res.result && res.result.result;
        }
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
        if (nearGasAvail < 0.05) {
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
    const evmSender = wallet.mpcEvmAddress || wallet.evmAddress;
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));

    const sendEvmContractCall = async ({ chainKey, to, data, value = '0', approvalToken = null, spender = null, approvalAmount = null }) => {
      return wallet.evmPrivateKey
        ? sendEvmSignedTransaction({ chainKey, privateKey: wallet.evmPrivateKey, to, data, value, approvalToken, spender, approvalAmount })
        : sendEvmMpcSignedTransaction({ wallet, chainKey, to, data, value, approvalToken, spender, approvalAmount, path: 'ethereum-1' });
    };

    let res;
    if (pool.isKyberSwapStake) {
      const amountRaw = toBaseUnits(amount, pool.decimals || 18);
      const q = await quoteEvmDexSwap({
        chainKey: pool.chain,
        srcToken: NATIVE_EVM_TOKEN,
        destToken: pool.contract,
        amountRaw,
        srcDecimals: 18,
        destDecimals: 18,
        slippageBps
      });
      if (!q || !q.ok) throw new Error((q && q.error) || t('HyperEVM 质押报价失败', 'HyperEVM staking quote failed'));
      res = await executeEvmDexSwap({
        wallet,
        chainKey: pool.chain,
        routeSource: q.routeSource,
        routeData: q.routeData,
        srcToken: NATIVE_EVM_TOKEN,
        srcDecimals: 18,
        amount,
        slippageBps
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
            await sendEvmContractCall({
              chainKey: pool.chain,
              to: pool.tokenContract,
              data: '0xd0e30db0', // WETH9.deposit()
              value: shortfallWei
            });
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
      const valueWei = ethersLib.parseEther(String(amount)).toString();
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

  const REF_FINANCE_CONTRACT = 'v2.ref-finance.near';
  const REF_SMART_ROUTER_URL = 'https://smartrouter.ref.finance/findPath';
  const DCL_CONTRACT_ID = 'dclv2.ref-labs.near';
  const WRAP_NEAR_CONTRACT = 'wrap.near';
  const NEAR_USDC_CONTRACT_REF = '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1';
  const KNOWN_REF_V2_POOLS = {
    'otoken.rhealab.near|token.rhealab.near': 6573,
    'token.rhealab.near|xtoken.rhealab.near': 6472,
    'lst.rhealab.near|wrap.near': 6494,
    'otoken.rhealab.near|wrap.near': 6574,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|token.rhealab.near': 6484,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|prl.omft.near': 9010,
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|wrap.near': 4512,
    'meta-pool.near|wrap.near': 3514,
    'linear-protocol.near|wrap.near': 3515
  };
  const NEAR_DCL_POOLS = {
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|qtc.omft.near|2000'
    ],
    'qtc.omft.near|wrap.near': ['qtc.omft.near|wrap.near|10000'],
    'otoken.rhealab.near|token.rhealab.near': ['otoken.rhealab.near|token.rhealab.near|10000'],
    'token.rhealab.near|xtoken.rhealab.near': ['token.rhealab.near|xtoken.rhealab.near|400'],
    'lst.rhealab.near|token.rhealab.near': ['lst.rhealab.near|token.rhealab.near|2000'],
    'token.rhealab.near|wrap.near': [
      'token.rhealab.near|wrap.near|2000',
      'token.rhealab.near|wrap.near|100',
      'token.rhealab.near|wrap.near|10000'
    ],
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|token.rhealab.near': [
      '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1|token.rhealab.near|100'
    ],
    'qtc.omft.near|token.rhealab.near': ['qtc.omft.near|token.rhealab.near|2000'],
    'otoken.rhealab.near|wrap.near': ['otoken.rhealab.near|wrap.near|100'],
    'lst.rhealab.near|wrap.near': ['lst.rhealab.near|wrap.near|100']
  };

  function resolveNearDclPoolIds(inId, outId) {
    if (!inId || !outId || inId === outId) return [];
    const hit = NEAR_DCL_POOLS[`${inId}|${outId}`] || NEAR_DCL_POOLS[`${outId}|${inId}`];
    if (!hit) return [];
    return Array.isArray(hit) ? hit : [hit];
  }

  function resolveNearDclPoolId(inId, outId) {
    return resolveNearDclPoolIds(inId, outId)[0] || null;
  }

  async function viewNearContractCall(contractId, methodName, argsObj) {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: `${contractId}-${methodName}`,
      method: 'query',
      params: {
        request_type: 'call_function',
        finality: 'final',
        account_id: contractId,
        method_name: methodName,
        args_base64: bytesToBase64(new TextEncoder().encode(JSON.stringify(argsObj)))
      }
    });
    const opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
    let res = await fetchJsonWithTimeout(NEAR_RPC_URL, opts, 5000).catch(() => null);
    let bytes = res && res.result && res.result.result;
    if (!Array.isArray(bytes)) {
      res = await fetchJsonWithTimeout('https://free.rpc.fastnear.com', opts, 5000).catch(() => null);
      bytes = res && res.result && res.result.result;
    }
    return Array.isArray(bytes) ? JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) : null;
  }

  function computeSlippageMinAmount(amountOutStr, slippageBps = 100) {
    const out = BigInt(String(amountOutStr || '0'));
    if (out <= 0n) return '0';
    const clampedBps = Math.max(1, Math.min(5000, Number(slippageBps) || 100));
    return ((out * BigInt(10000 - clampedBps)) / 10000n).toString();
  }

  /**
   * Quotes a swap on Rhea / Ref CLMM (`dclv2.ref-labs.near`) via view call `quote`.
   */
  async function quoteNearDclPoolSwap({
    tokenIn,
    tokenOut,
    amountRaw,
    slippageBps = 100
  } = {}) {
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!inId || !outId || inId === outId || !/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      return { ok: false, isDcl: true, dclContract: DCL_CONTRACT_ID, poolIds: [], amountOut: null, minAmountOut: '0', error: t('DCL 询价参数无效', 'Invalid DCL quote parameters') };
    }
    const poolIdsList = resolveNearDclPoolIds(inId, outId);
    if (poolIdsList.length === 0) {
      return { ok: false, isDcl: true, dclContract: DCL_CONTRACT_ID, poolIds: [], amountOut: null, minAmountOut: '0', error: t('未配置该交易对 DCL 池', 'No DCL pool configured for this pair') };
    }

    try {
      const results = await Promise.all(
        poolIdsList.map(async (poolId) => {
          const qRes = await viewNearContractCall(DCL_CONTRACT_ID, 'quote', {
            pool_ids: [poolId],
            input_token: inId,
            output_token: outId,
            input_amount: amtStr
          }).catch(() => null);
          const outAmt = qRes && qRes.amount !== undefined ? String(qRes.amount) : '0';
          if (!/^\d+$/.test(outAmt) || BigInt(outAmt) <= 0n) return null;
          return { poolId, outAmt, outBig: BigInt(outAmt) };
        })
      );
      const valid = results.filter(Boolean).sort((a, b) => (b.outBig > a.outBig ? 1 : b.outBig < a.outBig ? -1 : 0));
      if (valid.length === 0) {
        return { ok: false, isDcl: true, dclContract: DCL_CONTRACT_ID, poolIds: [poolIdsList[0]], amountOut: null, minAmountOut: '0', error: t('DCL 流动池暂无可用报价', 'DCL pool returned zero quote') };
      }
      const best = valid[0];
      const outAmt = best.outAmt;
      const minAmountOut = computeSlippageMinAmount(outAmt, slippageBps);
      return {
        ok: true,
        isDcl: true,
        dclContract: DCL_CONTRACT_ID,
        contractId: DCL_CONTRACT_ID,
        label: 'Rhea CLMM (dclv2.ref-labs.near)',
        routeSource: 'Ref DCL',
        poolIds: [best.poolId],
        tokenIn: inId,
        tokenOut: outId,
        amountIn: amtStr,
        amountOut: outAmt,
        minAmountOut,
        actions: [],
        routeData: { isDcl: true, poolIds: [best.poolId], amount_out: outAmt, min_amount_out: minAmountOut },
        error: null
      };
    } catch (err) {
      return {
        ok: false,
        isDcl: true,
        dclContract: DCL_CONTRACT_ID,
        poolIds: [poolIdsList[0]],
        amountOut: null,
        minAmountOut: '0',
        error: err && err.message ? err.message : t('DCL 询价失败', 'DCL quote failed')
      };
    }
  }

  function normalizeNearRefTokenContract(tokenId) {
    const s = String(tokenId || '').trim();
    if (!s || s.toLowerCase() === 'near' || s === 'nep141:wrap.near') return WRAP_NEAR_CONTRACT;
    if (s.startsWith('1cs_v1:near:nep141:')) return s.slice('1cs_v1:near:nep141:'.length);
    if (s.startsWith('nep141:')) return s.slice('nep141:'.length);
    return s;
  }

  async function resolveKnownOrApiRefV2PoolId(tA, tB, allowApiLookup = true) {
    if (!tA || !tB || tA === tB) return null;
    const sortedKey = [tA, tB].sort().join('|');
    if (KNOWN_REF_V2_POOLS[sortedKey] !== undefined) return KNOWN_REF_V2_POOLS[sortedKey];
    if (!allowApiLookup) return null;
    try {
      const url = `https://api.ref.finance/list-pools-by-tokens?token0=${encodeURIComponent(tA)}&token1=${encodeURIComponent(tB)}`;
      const res = await fetchJsonWithTimeout(url, {}, 5000).catch(() => null);
      if (!Array.isArray(res) || res.length === 0) return null;
      const sorted = [...res].sort((a, b) => Number(b.tvl || 0) - Number(a.tvl || 0));
      const topId = Number(sorted[0]?.id);
      return Number.isFinite(topId) && topId >= 0 ? topId : null;
    } catch (_) {
      return null;
    }
  }

  async function quoteDirectRefV2SingleHop(poolId, inId, outId, amtStr, slippageBps) {
    if (poolId === null || poolId === undefined) return null;
    const retStr = await viewNearContractCall(REF_FINANCE_CONTRACT, 'get_return', {
      pool_id: Number(poolId),
      token_in: inId,
      amount_in: String(amtStr),
      token_out: outId
    }).catch(() => null);
    const outAmt = retStr !== null && retStr !== undefined ? String(retStr).trim() : '';
    if (!/^\d+$/.test(outAmt) || BigInt(outAmt) <= 0n) return null;
    const minOut = computeSlippageMinAmount(outAmt, slippageBps);
    const actions = [{
      pool_id: Number(poolId),
      token_in: inId,
      token_out: outId,
      amount_in: String(amtStr),
      min_amount_out: minOut
    }];
    return {
      ok: true,
      label: `Ref Finance V2 (#${poolId})`,
      routeSource: 'Ref Finance',
      contractId: REF_FINANCE_CONTRACT,
      tokenIn: inId,
      tokenOut: outId,
      amountIn: String(amtStr),
      amountOut: outAmt,
      minAmountOut: minOut,
      actions,
      routeData: { directPoolId: Number(poolId), actions, amount_out: outAmt },
      error: null
    };
  }

  /**
   * Quotes an on-chain NEAR NEP-141 swap via Ref Finance SmartRouter + direct v2.ref-finance.near pools + 2-hop + Rhea DCL.
   */
  async function quoteNearRefFinanceSwap({
    tokenIn,
    tokenOut,
    amountRaw,
    slippageBps = 100
  } = {}) {
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!inId || !outId || inId === outId) {
      return { ok: false, label: 'Ref Finance', amountOut: null, actions: [], routeData: null, error: t('请选择不同的 NEAR 代币', 'Select distinct NEAR tokens') };
    }
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      return { ok: false, label: 'Ref Finance', amountOut: null, actions: [], routeData: null, error: t('兑换数量必须大于 0', 'Amount must be positive') };
    }

    const slippageDec = (Math.max(1, Number(slippageBps) || 100) / 10000).toFixed(4);
    const url = `${REF_SMART_ROUTER_URL}?amountIn=${encodeURIComponent(amtStr)}&tokenIn=${encodeURIComponent(inId)}&tokenOut=${encodeURIComponent(outId)}&pathDeep=3&slippage=${slippageDec}`;

    const knownPoolId = await resolveKnownOrApiRefV2PoolId(inId, outId, false);
    const smartRouterPromise = fetchJsonWithTimeout(url, {}, 7000).catch(() => null);
    const directKnownPromise = knownPoolId !== null
      ? quoteDirectRefV2SingleHop(knownPoolId, inId, outId, amtStr, slippageBps).catch(() => null)
      : Promise.resolve(null);

    const [srData, directKnownRes] = await Promise.all([smartRouterPromise, directKnownPromise]);

    let smartRouterBest = null;
    if (srData && Number(srData.result_code) === 0 && srData.result_data) {
      const rData = srData.result_data;
      const routes = Array.isArray(rData.routes) ? rData.routes : [];
      const amountOut = rData.amount_out ? String(rData.amount_out) : '0';
      const actions = [];
      for (const route of routes) {
        const pools = Array.isArray(route.pools) ? route.pools : [];
        for (const p of pools) {
          if (p.pool_id === undefined || !p.token_in || !p.token_out) continue;
          const act = {
            pool_id: Number(p.pool_id),
            token_in: String(p.token_in),
            token_out: String(p.token_out),
            min_amount_out: String(p.min_amount_out || '0')
          };
          if (p.amount_in && String(p.amount_in) !== '0') {
            act.amount_in = String(p.amount_in);
          }
          actions.push(act);
        }
      }
      if (actions.length > 0 && /^\d+$/.test(amountOut) && BigInt(amountOut) > 0n) {
        smartRouterBest = {
          ok: true,
          label: 'Ref Finance (v2.ref-finance.near)',
          routeSource: 'Ref Finance',
          contractId: REF_FINANCE_CONTRACT,
          tokenIn: inId,
          tokenOut: outId,
          amountIn: amtStr,
          amountOut,
          minAmountOut: String(routes[0]?.min_amount_out || '0'),
          actions,
          routeData: rData,
          error: null
        };
      }
    }

    // Always compare every route (smart router, direct pool, dynamic pool, 2-hop via hubs) and pick the best output.
    // A thin direct pool must never beat a deeper 2-hop route (e.g. NEAR -> RHEA -> oRHEA).
    const refCandidates = [smartRouterBest, directKnownRes].filter(Boolean);

    if (knownPoolId === null) {
      const apiPoolId = await resolveKnownOrApiRefV2PoolId(inId, outId, true);
      if (apiPoolId !== null) {
        const dynRes = await quoteDirectRefV2SingleHop(apiPoolId, inId, outId, amtStr, slippageBps).catch(() => null);
        if (dynRes) refCandidates.push(dynRes);
      }
    }

    const hubs = ['token.rhealab.near', WRAP_NEAR_CONTRACT, NEAR_USDC_CONTRACT_REF];
    const twoHopResults = await Promise.all(hubs.map(async (mid) => {
      if (mid === inId || mid === outId) return null;
      try {
        const [pid1, pid2] = await Promise.all([
          resolveKnownOrApiRefV2PoolId(inId, mid, true),
          resolveKnownOrApiRefV2PoolId(mid, outId, true)
        ]);
        if (pid1 === null || pid2 === null) return null;
        const hop1 = await quoteDirectRefV2SingleHop(pid1, inId, mid, amtStr, slippageBps);
        if (!hop1) return null;
        const hop2 = await quoteDirectRefV2SingleHop(pid2, mid, outId, hop1.amountOut, slippageBps);
        if (!hop2) return null;
        const actions = [
          { pool_id: Number(pid1), token_in: inId, token_out: mid, amount_in: amtStr, min_amount_out: hop1.minAmountOut },
          { pool_id: Number(pid2), token_in: mid, token_out: outId, min_amount_out: hop2.minAmountOut }
        ];
        return {
          ok: true,
          label: `Ref Finance V2 (#${pid1}➔#${pid2})`,
          routeSource: 'Ref Finance',
          contractId: REF_FINANCE_CONTRACT,
          tokenIn: inId,
          tokenOut: outId,
          amountIn: amtStr,
          amountOut: hop2.amountOut,
          minAmountOut: hop2.minAmountOut,
          actions,
          routeData: { direct2Hop: [pid1, pid2], actions, amount_out: hop2.amountOut },
          error: null
        };
      } catch (_) {
        return null;
      }
    }));
    twoHopResults.forEach((r) => { if (r) refCandidates.push(r); });
    // 3-hop via two hubs using known pools only (e.g. PRL -> USDC -> RHEA -> oRHEA), executed atomically by Ref actions.
    const threeHopJobs = [];
    for (const h1 of hubs) {
      for (const h2 of hubs) {
        if (h1 === h2 || h1 === inId || h1 === outId || h2 === inId || h2 === outId) continue;
        threeHopJobs.push((async () => {
          try {
            const [p1, p2, p3] = await Promise.all([
              resolveKnownOrApiRefV2PoolId(inId, h1, false),
              resolveKnownOrApiRefV2PoolId(h1, h2, false),
              resolveKnownOrApiRefV2PoolId(h2, outId, false)
            ]);
            if (p1 === null || p2 === null || p3 === null) return null;
            const q1 = await quoteDirectRefV2SingleHop(p1, inId, h1, amtStr, slippageBps);
            if (!q1) return null;
            const q2 = await quoteDirectRefV2SingleHop(p2, h1, h2, q1.amountOut, slippageBps);
            if (!q2) return null;
            const q3 = await quoteDirectRefV2SingleHop(p3, h2, outId, q2.amountOut, slippageBps);
            if (!q3) return null;
            const actions = [
              { pool_id: Number(p1), token_in: inId, token_out: h1, amount_in: amtStr, min_amount_out: q1.minAmountOut },
              { pool_id: Number(p2), token_in: h1, token_out: h2, min_amount_out: q2.minAmountOut },
              { pool_id: Number(p3), token_in: h2, token_out: outId, min_amount_out: q3.minAmountOut }
            ];
            return {
              ok: true,
              label: `Ref Finance V2 (#${p1}➔#${p2}➔#${p3})`,
              routeSource: 'Ref Finance',
              contractId: REF_FINANCE_CONTRACT,
              tokenIn: inId,
              tokenOut: outId,
              amountIn: amtStr,
              amountOut: q3.amountOut,
              minAmountOut: q3.minAmountOut,
              actions,
              routeData: { direct3Hop: [p1, p2, p3], actions, amount_out: q3.amountOut },
              error: null
            };
          } catch (_) {
            return null;
          }
        })());
      }
    }
    (await Promise.all(threeHopJobs)).forEach((r) => { if (r) refCandidates.push(r); });

    if (refCandidates.length > 0) {
      refCandidates.sort((a, b) => {
        const x = BigInt(a.amountOut);
        const y = BigInt(b.amountOut);
        return y > x ? 1 : (y < x ? -1 : 0);
      });
      return refCandidates[0];
    }
    // Fallback 3: Rhea / Ref DCL CLMM (dclv2.ref-labs.near)
    const dclFallback = await quoteNearDclPoolSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps }).catch(() => null);
    if (dclFallback && dclFallback.ok) return dclFallback;

    return {
      ok: false,
      label: 'Ref Finance',
      amountOut: null,
      actions: [],
      routeData: null,
      error: (srData && srData.result_message) || t('Ref Finance 暂无可用流动性路径', 'No Ref Finance liquidity route found')
    };
  }

  async function prepareNearSwapFundingAndStorage({ resolvedWallet, sender, inId, outId, amtStr }) {
    if (inId === WRAP_NEAR_CONTRACT) {
      let wrappedBal = 0n;
      try {
        const wStr = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'ft_balance_of', { account_id: sender });
        if (wStr) wrappedBal = BigInt(String(wStr));
      } catch (_) {}
      const needed = BigInt(amtStr);
      if (wrappedBal < needed) {
        const shortfall = needed - wrappedBal;
        try {
          const sBal = await viewNearContractCall(WRAP_NEAR_CONTRACT, 'storage_balance_of', { account_id: sender });
          if (sBal === null) {
            await api.signAndSendNearFunctionCall({
              accountId: sender,
              publicKeyStr: resolvedWallet.nearPublicKey,
              privateKeyStr: resolvedWallet.nearPrivateKey,
              receiverId: WRAP_NEAR_CONTRACT,
              methodName: 'storage_deposit',
              argsJson: JSON.stringify({ account_id: sender, registration_only: true }),
              gas: '30000000000000',
              depositYocto: '1250000000000000000000'
            });
          }
        } catch (_) {}
        await api.signAndSendNearFunctionCall({
          accountId: sender,
          publicKeyStr: resolvedWallet.nearPublicKey,
          privateKeyStr: resolvedWallet.nearPrivateKey,
          receiverId: WRAP_NEAR_CONTRACT,
          methodName: 'near_deposit',
          argsJson: '{}',
          gas: '30000000000000',
          depositYocto: shortfall.toString()
        });
      }
    }

    try {
      const outStorage = await viewNearContractCall(outId, 'storage_balance_of', { account_id: sender });
      if (outStorage === null) {
        await api.signAndSendNearFunctionCall({
          accountId: sender,
          publicKeyStr: resolvedWallet.nearPublicKey,
          privateKeyStr: resolvedWallet.nearPrivateKey,
          receiverId: outId,
          methodName: 'storage_deposit',
          argsJson: JSON.stringify({ account_id: sender, registration_only: true }),
          gas: '30000000000000',
          depositYocto: '1250000000000000000000'
        });
      }
    } catch (_) {}
  }

  /**
   * Executes a Rhea / Ref CLMM swap on NEAR Mainnet via `ft_transfer_call` to `dclv2.ref-labs.near`.
   */
  async function executeNearDclPoolSwap({
    wallet,
    poolIds = null,
    tokenIn,
    tokenOut,
    amountRaw,
    minAmountOut = '0',
    slippageBps = 100,
    tokenBalance = null,
    inputDecimals = 6,
    tokenSymbol = 'TOKEN'
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'Swap amount must be positive'));
    }

    const humanAmount = Number(fromBaseUnits(amtStr, inputDecimals));
    if (tokenBalance !== null && tokenBalance !== undefined) {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol,
        amount: humanAmount,
        isNative: inId === WRAP_NEAR_CONTRACT,
        gasBuffer: 0.01,
        tokenBalance
      });
    } else {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: inId === WRAP_NEAR_CONTRACT ? humanAmount + 0.01 : 0.01,
        isNative: false,
        tokenBalance: resolveWalletChainBalance(wallet, 'near')
      });
    }

    const resolvedWallet = await ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    if (!sender || !resolvedWallet.nearPublicKey || !resolvedWallet.nearPrivateKey) {
      throw new Error(t('缺少 NEAR 签名凭据', 'Missing NEAR signing credentials'));
    }

    let targetPoolIds = Array.isArray(poolIds) && poolIds.length > 0 ? poolIds : null;
    let resolvedMinOut = minAmountOut && String(minAmountOut) !== '0' ? String(minAmountOut) : '';
    let expectedOut = null;
    if (!targetPoolIds || !resolvedMinOut) {
      const q = await quoteNearDclPoolSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps });
      if (!q.ok || !q.poolIds.length) {
        throw new Error(q.error || t('DCL 池路由不可用', 'DCL pool route unavailable'));
      }
      targetPoolIds = targetPoolIds || q.poolIds;
      resolvedMinOut = resolvedMinOut || q.minAmountOut || '0';
      expectedOut = q.amountOut;
    }

    await prepareNearSwapFundingAndStorage({ resolvedWallet, sender, inId, outId, amtStr });

    const txHash = await api.signAndSendNearFunctionCall({
      accountId: sender,
      publicKeyStr: resolvedWallet.nearPublicKey,
      privateKeyStr: resolvedWallet.nearPrivateKey,
      receiverId: inId,
      methodName: 'ft_transfer_call',
      argsJson: JSON.stringify({
        receiver_id: DCL_CONTRACT_ID,
        amount: amtStr,
        msg: JSON.stringify({
          Swap: {
            pool_ids: targetPoolIds,
            output_token: outId,
            min_output_amount: String(resolvedMinOut || '0')
          }
        })
      }),
      gas: '180000000000000',
      depositYocto: '1'
    });

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
      isDcl: true,
      routeSource: 'Ref DCL',
      label: 'Rhea CLMM (dclv2.ref-labs.near)',
      tokenIn: inId,
      tokenOut: outId,
      amountIn: amtStr,
      amountOut: expectedOut
    };
  }

  /**
   * Executes a Ref Finance swap on NEAR Mainnet via `ft_transfer_call` to `v2.ref-finance.near`
   * (or delegates to `dclv2.ref-labs.near` for DCL pools).
   */
  async function executeNearRefFinanceSwap({
    wallet,
    routeData = null,
    actions = null,
    poolIds = null,
    minAmountOut = '0',
    tokenIn,
    tokenOut,
    amountRaw,
    slippageBps = 100,
    tokenBalance = null,
    inputDecimals = 8,
    tokenSymbol = 'TOKEN'
  } = {}) {
    if ((routeData && routeData.isDcl) || (Array.isArray(poolIds) && poolIds.length > 0)) {
      return executeNearDclPoolSwap({
        wallet,
        poolIds: (poolIds && poolIds.length ? poolIds : routeData?.poolIds),
        tokenIn,
        tokenOut,
        amountRaw,
        minAmountOut: (minAmountOut && minAmountOut !== '0' ? minAmountOut : routeData?.min_amount_out) || '0',
        slippageBps,
        tokenBalance,
        inputDecimals,
        tokenSymbol
      });
    }

    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const inId = normalizeNearRefTokenContract(tokenIn);
    const outId = normalizeNearRefTokenContract(tokenOut);
    const amtStr = String(amountRaw || '0').trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'Swap amount must be positive'));
    }

    const humanAmount = Number(fromBaseUnits(amtStr, inputDecimals));
    if (tokenBalance !== null && tokenBalance !== undefined) {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol,
        amount: humanAmount,
        isNative: inId === WRAP_NEAR_CONTRACT,
        gasBuffer: 0.01,
        tokenBalance
      });
    } else {
      validateSufficientChainBalance({
        wallet,
        chain: 'near',
        tokenSymbol: 'NEAR',
        amount: inId === WRAP_NEAR_CONTRACT ? humanAmount + 0.01 : 0.01,
        isNative: false,
        tokenBalance: resolveWalletChainBalance(wallet, 'near')
      });
    }

    const resolvedWallet = await ensureWalletSigningKeysAsync(wallet);
    const sender = resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress;
    if (!sender || !resolvedWallet.nearPublicKey || !resolvedWallet.nearPrivateKey) {
      throw new Error(t('缺少 NEAR 签名凭据', 'Missing NEAR signing credentials'));
    }

    let swapActions = Array.isArray(actions) && actions.length > 0 ? actions : null;
    let expectedOut = null;
    if (!swapActions && routeData && Array.isArray(routeData.routes)) {
      swapActions = [];
      for (const route of routeData.routes) {
        for (const p of (route.pools || [])) {
          const act = {
            pool_id: Number(p.pool_id),
            token_in: String(p.token_in),
            token_out: String(p.token_out),
            min_amount_out: String(p.min_amount_out || '0')
          };
          if (p.amount_in && String(p.amount_in) !== '0') act.amount_in = String(p.amount_in);
          swapActions.push(act);
        }
      }
      expectedOut = routeData.amount_out ? String(routeData.amount_out) : null;
    }

    if (!swapActions || swapActions.length === 0) {
      const q = await quoteNearRefFinanceSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps });
      if (q.ok && q.isDcl) {
        return executeNearDclPoolSwap({
          wallet,
          poolIds: q.poolIds,
          tokenIn: inId,
          tokenOut: outId,
          amountRaw: amtStr,
          minAmountOut: q.minAmountOut,
          slippageBps,
          tokenBalance,
          inputDecimals,
          tokenSymbol
        });
      }
      if (!q.ok || !q.actions.length) {
        throw new Error(q.error || t('Ref Finance 路由不可用', 'Ref Finance route unavailable'));
      }
      swapActions = q.actions;
      expectedOut = q.amountOut;
    }

    await prepareNearSwapFundingAndStorage({ resolvedWallet, sender, inId, outId, amtStr });

    const txHash = await api.signAndSendNearFunctionCall({
      accountId: sender,
      publicKeyStr: resolvedWallet.nearPublicKey,
      privateKeyStr: resolvedWallet.nearPrivateKey,
      receiverId: inId,
      methodName: 'ft_transfer_call',
      argsJson: JSON.stringify({
        receiver_id: REF_FINANCE_CONTRACT,
        amount: amtStr,
        msg: JSON.stringify({
          force: 0,
          actions: swapActions
        })
      }),
      gas: '180000000000000',
      depositYocto: '1'
    });

    return {
      txHash,
      explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`,
      routeSource: 'Ref Finance',
      label: 'Ref Finance (v2.ref-finance.near)',
      tokenIn: inId,
      tokenOut: outId,
      amountIn: amtStr,
      amountOut: expectedOut
    };
  }

  const api = {
    NEAR_RPC_URL,
    SOLANA_RPC_ENDPOINTS,
    EVM_CHAINS,
    STAKING_POOLS,
    V1_SIGNER_CONTRACT,
    REF_FINANCE_CONTRACT,
    KNOWN_REF_V2_POOLS,
    DCL_CONTRACT_ID,
    NEAR_DCL_POOLS,
    findSolanaPdaAsync,
    discoverNearAccountsByPublicKeyAsync,
    fetchNearAccountStakingPositionsAsync,
    fetchSolanaAccountStakingPositionsAsync,
    ensureWalletSigningKeysAsync,
    deriveMpcEvmAddressAsync,
    validateSufficientChainBalance,
    fetchSolanaNativeAndSplBalances,
    quoteSolanaJupiterSwap,
    executeSolanaJupiterSwap,
    executeSolanaNativeTransfer,
    fetchEvmNativeAndErc20Balance,
    quoteArcNetworkDexSwap,
    quoteEvmDexSwap,
    executeEvmDexSwap,
    executeEvmRawSteps,
    executeEvmTransfer,
    sendEvmMpcSignedTransaction,
    signAndSendNearFunctionCall,
    signAndSendNearTransfer,
    executeNearNep141Transfer,
    getWalletNearSignerCredentials,
    encodeNearPublicKeyBorsh,
    fetchNearAccessKeysAsync,
    buildAddKeyActionBytes,
    buildDeleteKeyActionBytes,
    addNearAccessKeyAsync,
    deleteNearAccessKeyAsync,
    rotateNearAccountKeyAsync,
    activateUniversalAccountAsync,
    quoteNearRefFinanceSwap,
    executeNearRefFinanceSwap,
    quoteNearDclPoolSwap,
    executeNearDclPoolSwap,
    registerNearNamedAccountOnChain,
    requestNearMpcChainSignature,
    findStakingPool,
    resolveWalletPoolTokenBalance,
    fetchLiveStakingMetrics,
    fetchAllStakingRates,
    executeOnChainStaking,
    executePoolStake,
    toBaseUnits,
    fromBaseUnits
  };

  if (root) {
    root.NearCAContracts = api;
    root.NearCA = root.NearCA || {};
    root.NearCA.contracts = api;
  }
  if (typeof window !== 'undefined') {
    window.NearCAContracts = api;
    window.NearCA = window.NearCA || {};
    window.NearCA.contracts = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
