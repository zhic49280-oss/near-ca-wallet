// GENERATED FILE: assembled by scripts/build-parts.js from src/parts/chain-contracts/*.part.js. Edit the parts, then run npm run build.
(function (root) {
  'use strict';

  const NEAR_RPC_URL = 'https://rpc.mainnet.near.org';
  const NEAR_RPC_ENDPOINTS = [
    'https://free.rpc.fastnear.com',
    NEAR_RPC_URL,
    'https://1rpc.io/near'
  ];
  const _nearRpc429Until = {};
  const _solRpcCooldownUntil = {};
  const _aggCooldownUntil = {};
  const _evmRpcCooldownUntil = {};
  const _quoteCacheMap = new Map();
  const _quoteInFlightMap = new Map();

  function shouldCooldownRpcError(err) {
    if (!err) return true;
    if (err.name === 'AbortError') return true;
    const status = Number(err.status || 0);
    if (!status) return true; // Network / CORS TypeError
    return status === 401 || status === 403 || status === 408 || status === 410 || status === 429 || status >= 500;
  }

  function isDeterministicJsonRpcError(rpcErr) {
    if (!rpcErr) return false;
    const code = Number(rpcErr.code);
    const msg = String(rpcErr.message || rpcErr.data || '').toLowerCase();
    if (/rate|limit|429|403|timeout|unavailable|too many|header not found|missing trie/i.test(msg)) {
      return false;
    }
    return (
      code === -32000 ||
      code === -32602 ||
      code === 3 ||
      /revert|invalid|insufficient|out of gas|unknown_account|methodnotfound|contractexecutionerror/i.test(msg)
    );
  }

  async function withQuoteCacheAndDedup(cacheKey, ttlMs, fn) {
    const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
    const hit = _quoteCacheMap.get(cacheKey);
    if (hit && hit.fetchRef === curFetch && Date.now() - hit.ts < ttlMs) {
      return { ...hit.val };
    }
    const inflight = _quoteInFlightMap.get(cacheKey);
    if (inflight && inflight.fetchRef === curFetch) {
      return inflight.promise.then((res) => (res && typeof res === 'object' ? { ...res } : res));
    }
    const promise = Promise.resolve().then(fn);
    _quoteInFlightMap.set(cacheKey, { fetchRef: curFetch, promise });
    try {
      const val = await promise;
      if (val && (val.ok || val.outAmount)) {
        _quoteCacheMap.set(cacheKey, { ts: Date.now(), fetchRef: curFetch, val });
        if (_quoteCacheMap.size > 80) _quoteCacheMap.delete(_quoteCacheMap.keys().next().value);
      }
      return val;
    } finally {
      const cur = _quoteInFlightMap.get(cacheKey);
      if (cur && cur.promise === promise) _quoteInFlightMap.delete(cacheKey);
    }
  }

  function resolveWalletEvmSender(wallet, ethersLib = null) {
    if (!wallet) return '';
    if (wallet.evmPrivateKey) {
      const lib = ethersLib || getEthersLib();
      if (lib && typeof lib.Wallet === 'function') {
        try {
          return new lib.Wallet(wallet.evmPrivateKey).address;
        } catch (_) {}
      }
      if (wallet.evmAddress) return wallet.evmAddress;
    }
    return wallet.mpcEvmAddress || wallet.evmAddress || '';
  }
  const NEAR_EXPLORER_TX = 'https://nearblocks.io/txns/';
  const SOLANA_RPC_ENDPOINTS = ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'];
  const SOLSCAN_TX = 'https://solscan.io/tx/';
  const JUPITER_API_URL = 'https://lite-api.jup.ag/swap/v1';
  const RAYDIUM_API_URL = 'https://transaction-v1.raydium.io';
  const OPENOCEAN_API_URL = 'https://open-api.openocean.finance/v4';
  const SPL_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const SPL_TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
  const WSOL_MINT = 'So11111111111111111111111111111111111111112';
  const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';
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
      rpcs: ['https://ethereum-rpc.publicnode.com', 'https://1rpc.io/eth'],
      supportsMulticall3: true,
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
      rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'],
      supportsMulticall3: true,
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
      rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com', 'https://1rpc.io/arb'],
      supportsMulticall3: true,
      kyber: 'arbitrum',
      openOcean: 'arbitrum',
      explorer: 'https://arbiscan.io/tx/',
      gasReserve: 0.0002
    },
    bsc: {
      chainId: 56,
      name: 'BSC',
      symbol: 'BNB',
      rpc: 'https://bsc-rpc.publicnode.com',
      rpcs: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.bnbchain.org', 'https://1rpc.io/bnb'],
      supportsMulticall3: true,
      kyber: 'bsc',
      openOcean: 'bsc',
      explorer: 'https://bscscan.com/tx/',
      gasReserve: 0.0005
    },
    op: {
      chainId: 10,
      name: 'Optimism',
      symbol: 'ETH',
      rpc: 'https://mainnet.optimism.io',
      rpcs: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com', 'https://1rpc.io/op'],
      supportsMulticall3: true,
      kyber: 'optimism',
      openOcean: 'optimism',
      explorer: 'https://optimistic.etherscan.io/tx/',
      gasReserve: 0.0002
    },
    pol: {
      chainId: 137,
      name: 'Polygon',
      symbol: 'POL',
      rpc: 'https://polygon-bor-rpc.publicnode.com',
      rpcs: ['https://polygon-bor-rpc.publicnode.com', 'https://1rpc.io/matic'],
      supportsMulticall3: true,
      kyber: 'polygon',
      openOcean: 'polygon',
      explorer: 'https://polygonscan.com/tx/',
      gasReserve: 0.05
    },
    avax: {
      chainId: 43114,
      name: 'Avalanche',
      symbol: 'AVAX',
      rpc: 'https://api.avax.network/ext/bc/C/rpc',
      rpcs: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'],
      supportsMulticall3: true,
      kyber: 'avalanche',
      openOcean: 'avax',
      explorer: 'https://snowtrace.io/tx/',
      gasReserve: 0.005
    },
    hype: {
      chainId: 999,
      name: 'HyperEVM',
      symbol: 'HYPE',
      rpc: 'https://rpc.hyperliquid.xyz/evm',
      rpcs: ['https://rpc.hyperliquid.xyz/evm'],
      supportsMulticall3: true,
      kyber: 'hyperevm',
      explorer: 'https://purrsec.com/tx/',
      gasReserve: 0.0005
    },
    hood: {
      chainId: 4663,
      name: 'Robinhood',
      symbol: 'ETH',
      rpc: 'https://rpc.mainnet.chain.robinhood.com',
      rpcs: ['https://rpc.mainnet.chain.robinhood.com'],
      supportsMulticall3: false,
      kyber: 'robinhood',
      explorer: 'https://robinhoodchain.blockscout.com/tx/',
      gasReserve: 0.0002
    },
    arc: {
      chainId: 5042,
      name: 'Arc',
      symbol: 'USDC',
      rpc: 'https://rpc.mainnet.arc.io',
      rpcs: ['https://rpc.mainnet.arc.io'],
      supportsMulticall3: false,
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
    op: 0.0002,
    pol: 0.05,
    avax: 0.005,
    hype: 0.0005,
    hood: 0.0002,
    arc: 0.02,
    btc: 0.00005,
    prl: 0.003
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
      aTokenAddress: '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB',
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
      aTokenAddress: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c',
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
      aTokenAddress: '0x724dc807b04555b71ed48a6896b6f41593b8c637',
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
    const extSignal = options && options.signal ? options.signal : null;
    if (extSignal && extSignal.aborted) {
      const abortErr = new Error(t('请求已取消', 'Request aborted'));
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timer = controller
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs)
      : null;
    let onExtAbort = null;
    if (extSignal && controller) {
      onExtAbort = () => controller.abort();
      extSignal.addEventListener('abort', onExtAbort, { once: true });
    }
    try {
      const { signal: _ignoredSignal, ...restOptions } = options || {};
      const res = await fetchFn(url, {
        ...restOptions,
        signal: controller ? controller.signal : undefined,
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
        const timeoutErr = new Error(timedOut ? t('网络请求超时', 'Request timeout') : t('请求已取消', 'Request aborted'));
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      if (extSignal && onExtAbort) {
        try { extSignal.removeEventListener('abort', onExtAbort); } catch (_) {}
      }
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
    const [fastRes, kitRes] = await Promise.allSettled([
      fetchJsonWithTimeout(`https://api.fastnear.com/v1/public_key/${encodeURIComponent(pk)}/all`, {}, 4000),
      fetchJsonWithTimeout(`https://api.kitwallet.app/publicKey/${encodeURIComponent(pk)}/accounts`, {}, 4000)
    ]);
    const hits = new Set();
    if (fastRes.status === 'fulfilled' && fastRes.value) {
      filterNamed(fastRes.value.account_ids).forEach((a) => hits.add(a));
    }
    if (kitRes.status === 'fulfilled' && kitRes.value) {
      filterNamed(kitRes.value).forEach((a) => hits.add(a));
    }
    return Array.from(hits);
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
      const [full, orheaConvs, burrowAcc] = await Promise.all([
        fetchJsonWithTimeout(`https://api.fastnear.com/v1/account/${encodeURIComponent(acct)}/full`, {}, 5000).catch(() => null),
        viewNearContractCall('orhea-conv.rhealab.near', 'get_account_conversions', { account_id: acct }).catch(() => null),
        viewNearContractCall('contract.main.burrow.near', 'get_account', { account_id: acct }).catch(() => null)
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
          if (totalRaw <= 5n * 10n ** 20n) return null; // ignore < 0.0005 NEAR residual interest dust
          const stakedNear = Number(stakedRaw / 10n ** 18n) / 1e6;
          const unstakedNear = Number(unstakedRaw / 10n ** 18n) / 1e6;
          const totalNear = stakedNear + unstakedNear;
          return {
            type: 'validator',
            poolId,
            stakedNear,
            unstakedNear,
            totalNear,
            canWithdraw: Boolean(accInfo.can_withdraw) && unstakedRaw > 10n ** 18n
          };
        })
      );
      validatorResults.filter(Boolean).forEach((pos) => positions.push(pos));

      if (Array.isArray(orheaConvs) && orheaConvs.length > 0) {
        let totalRaw = 0n;
        let activeCount = 0;
        const claimableIds = [];
        const activeIds = [];
        const nowNs = BigInt(Date.now()) * 1000000n;
        for (const conv of orheaConvs) {
          if (!conv || typeof conv !== 'object') continue;
          const statusLower = String(conv.status || '').toLowerCase();
          if (conv.is_withdrawn === true || conv.withdrawn === true || statusLower === 'withdrawn' || statusLower === 'claimed') {
            continue;
          }
          const convId = conv.conversion_id ?? conv.id ?? null;
          const rawVal = conv.source_amount ?? conv.amount ?? conv.locked_amount ?? conv.source_token_amount ?? '0';
          try {
            const rawBig = BigInt(String(rawVal));
            if (rawBig > 0n) {
              totalRaw += rawBig;
              activeCount += 1;
              if (convId !== null && convId !== undefined) {
                activeIds.push(String(convId));
                const releaseTime = conv.release_timestamp ?? conv.unlock_time ?? conv.end_timestamp ?? 0;
                const relBig = BigInt(String(releaseTime || '0'));
                if (relBig > 0n && relBig <= nowNs) claimableIds.push(String(convId));
              }
            }
          } catch (_) {}
        }
        const totalAmount = Number(totalRaw / 10n ** 12n) / 1e6;
        if (Number.isFinite(totalAmount) && totalAmount > 0.00001) {
          positions.push({
            type: 'lock_convert',
            poolId: 'rhea_orhea_convert',
            contractId: 'orhea-conv.rhealab.near',
            symbol: 'oRHEA',
            totalAmount,
            activeIds,
            claimableIds,
            canClaim: claimableIds.length > 0,
            chain: 'near',
            title: 'Rhea oRHEA Convert',
            subtitle: t(`锁仓兑换中 (${activeCount} 笔)`, `Locked Converting (${activeCount})`)
          });
        }
      }

      // Check xRHEA unstake requests + Meta Pool / LiNEAR / Rhea LST pending unstaked NEAR
      const [xrheaReqs, ...lstUnstakeStates] = await Promise.all([
        viewNearContractCall('xtoken.rhealab.near', 'get_account_unstake_requests', { account_id: acct }).catch(() => null),
        ...['lst.rhealab.near', 'meta-pool.near', 'linear-protocol.near', 'v2-nearx.stader-labs.near'].map(async (cid) => {
          const [amtStr, availFlag] = await Promise.all([
            viewNearContractCall(cid, 'get_account_unstaked_balance', { account_id: acct }).catch(() => null),
            viewNearContractCall(cid, 'is_account_unstaked_balance_available', { account_id: acct }).catch(() => null)
          ]);
          return { cid, amtStr, availFlag: Boolean(availFlag) };
        })
      ]);

      if (Array.isArray(xrheaReqs) && xrheaReqs.length > 0) {
        const nowNs = BigInt(Date.now()) * 1000000n;
        for (const req of xrheaReqs) {
          if (!req || !req.request_id) continue;
          const rawAmt = String(req.amount || '0');
          const amt = Number(fromBaseUnits(rawAmt, 18));
          if (!(amt > 0.00001)) continue;
          const unlockTs = BigInt(String(req.unlock_timestamp || req.release_timestamp || '0'));
          positions.push({
            type: 'xrhea_unstake',
            poolId: 'rhea_xrhea',
            contractId: 'xtoken.rhealab.near',
            requestId: String(req.request_id),
            symbol: 'RHEA',
            totalAmount: amt,
            canWithdraw: unlockTs > 0n && unlockTs <= nowNs,
            chain: 'near',
            title: 'Rhea xRHEA Unstake',
            subtitle: unlockTs > 0n && unlockTs <= nowNs
              ? t('已解锁可领取 RHEA', 'Unlocked — ready to claim')
              : t('xRHEA 解质押解锁中', 'xRHEA unstaking cooldown')
          });
        }
      }

      const lstPoolIdMap = {
        'lst.rhealab.near': 'rhea_rnear',
        'meta-pool.near': 'metapool_stnear',
        'linear-protocol.near': 'linear_near',
        'v2-nearx.stader-labs.near': 'stader_nearx'
      };
      for (const st of lstUnstakeStates) {
        if (!st || !st.amtStr || !/^\d+$/.test(String(st.amtStr))) continue;
        const nearAmt = Number(fromBaseUnits(String(st.amtStr), 24));
        if (!(nearAmt > 0.0001)) continue;
        const pid = lstPoolIdMap[st.cid] || st.cid;
        positions.push({
          type: 'near_lst_unstaked',
          poolId: pid,
          contractId: st.cid,
          symbol: 'NEAR',
          totalAmount: nearAmt,
          canWithdraw: st.availFlag,
          chain: 'near',
          title: `${findStakingPool(pid)?.name || st.cid}`,
          subtitle: st.availFlag
            ? t('解质押已完成，可提取 NEAR', 'Unstake ready to withdraw')
            : t('解质押冷却中 (约 2-3 天)', 'Unbonding (~2-3 days)')
        });
      }

      const burrowSupplied = burrowAcc && Array.isArray(burrowAcc.supplied) ? burrowAcc.supplied : [];
      if (burrowSupplied.length > 0) {
        const metaMap = {
          'wrap.near': { poolId: 'burrow_near_wnear', symbol: 'NEAR', baseDec: 24, defaultInternalDec: 24 },
          'usdt.tether-token.near': { poolId: 'burrow_near_usdt', symbol: 'USDT', baseDec: 6, defaultInternalDec: 18 },
          '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { poolId: 'burrow_near_usdc', symbol: 'USDC', baseDec: 6, defaultInternalDec: 18 }
        };
        const assetInfos = await Promise.all(
          burrowSupplied.map((item) => {
            const tokId = item && item.token_id ? String(item.token_id) : '';
            if (!tokId) return Promise.resolve(null);
            return viewNearContractCall('contract.main.burrow.near', 'get_asset', { token_id: tokId }).catch(() => null);
          })
        );
        burrowSupplied.forEach((item, idx) => {
          const tokId = String((item && item.token_id) || '').trim();
          const rawBal = String((item && item.balance) || '0');
          if (!tokId || !/^\d+$/.test(rawBal) || BigInt(rawBal) <= 0n) return;
          const poolCfg = STAKING_POOLS.find((p) => p && p.isBurrowSupply && p.tokenContract === tokId);
          const m = metaMap[tokId] || {
            poolId: poolCfg ? poolCfg.id : `burrow_${tokId}`,
            symbol: poolCfg ? poolCfg.inSymbol : (tokId.split('.')[0] || 'TOKEN').toUpperCase(),
            baseDec: poolCfg ? Number(poolCfg.decimals || 24) : 24,
            defaultInternalDec: poolCfg && Number(poolCfg.decimals) === 24 ? 24 : 18
          };
          const aInfo = assetInfos[idx];
          const extraDec = aInfo && aInfo.config && aInfo.config.extra_decimals !== undefined
            ? Number(aInfo.config.extra_decimals)
            : null;
          const totalDec = extraDec !== null && Number.isFinite(extraDec)
            ? (m.baseDec + extraDec)
            : m.defaultInternalDec;
          const totalAmount = Number(fromBaseUnits(rawBal, totalDec));
          if (Number.isFinite(totalAmount) && totalAmount > 0.00001) {
            positions.push({
              type: 'burrow_supply',
              poolId: m.poolId,
              tokenContract: tokId,
              symbol: m.symbol,
              totalAmount,
              decimals: poolCfg ? Number(poolCfg.decimals || m.baseDec) : m.baseDec,
              internalDecimals: totalDec,
              rawInternalBalance: rawBal,
              chain: 'near',
              title: `Burrow ${m.symbol}`,
              subtitle: t('Burrow 活期存款', 'Burrow Supply Position')
            });
          }
        });
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
            const escrowEndsAtRaw = decodeU64LE(buf, 121);
            const escrowEndsAtSec = Number(BigInt.asIntN(64, escrowEndsAtRaw));
            const isMaxLock = buf.length >= 162 ? buf[161] === 1 : false;
            if (amountRaw > 0n) {
              const stakedJup = Number(amountRaw) / 1e6;
              if (Number.isFinite(stakedJup) && stakedJup > 0.00001) {
                positions.push({
                  type: 'jupiter_dao',
                  poolId: 'jupiter_jup',
                  chain: 'sol',
                  symbol: 'JUP',
                  title: 'Jupiter DAO (ASR)',
                  subtitle: escrowPda.address,
                  amount: stakedJup,
                  totalAmount: stakedJup,
                  isMaxLock,
                  escrowEndsAtSec,
                  canWithdraw: !isMaxLock && Math.floor(Date.now() / 1000) >= escrowEndsAtSec,
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
      const needsPearl = !wallet.address || !wallet.privateKeyHex || !wallet.tweakedPrivateKeyHex;
      if (needsPearl && cryptoEngine && typeof cryptoEngine.derivePearlFromSeedAsync === 'function') {
        const pearl = await cryptoEngine.derivePearlFromSeedAsync(wallet.mnemonic, "m/86'/808276'/0'/0/0", true);
        if (pearl && pearl.address) {
          wallet.address = pearl.address;
          wallet.privateKeyHex = pearl.privateKeyHex || wallet.privateKeyHex;
          wallet.tweakedPrivateKeyHex = pearl.tweakedPrivateKeyHex || wallet.tweakedPrivateKeyHex;
        }
      }
      const needsBtc = !wallet.btcAddress || !wallet.btcPrivateKeyHex || !wallet.btcTweakedPrivateKeyHex;
      if (needsBtc && cryptoEngine && typeof cryptoEngine.deriveBitcoinFromSeedAsync === 'function') {
        const btc = await cryptoEngine.deriveBitcoinFromSeedAsync(wallet.mnemonic, "m/86'/0'/0'/0/0", true);
        if (btc && btc.address) {
          wallet.btcAddress = btc.address;
          wallet.btcPrivateKeyHex = btc.privateKeyHex || wallet.btcPrivateKeyHex;
          wallet.btcTweakedPrivateKeyHex = btc.tweakedPrivateKeyHex || wallet.btcTweakedPrivateKeyHex;
        }
      }
    }

    const nearId = wallet.nearNamedAccount || wallet.nearAddress;
    if (nearId) {
      const hasCachedMpc = Boolean(
        wallet._mpcDerivedForNearId === nearId &&
        wallet.mpcEvmAddress &&
        wallet.evmAddress &&
        wallet.solAddress &&
        wallet.solPublicKey
      );
      if (!hasCachedMpc) {
        if (cryptoEngine && typeof cryptoEngine.deriveNearMpcAllAddresses === 'function') {
          const mpc = cryptoEngine.deriveNearMpcAllAddresses(nearId);
          wallet.mpcEvmAddress = mpc.evmAddress;
          if (!wallet.evmPrivateKey) wallet.evmAddress = mpc.evmAddress;
          else wallet.evmAddress = wallet.evmAddress || mpc.evmAddress;
          if (!wallet.solPrivateSeedHex) {
            wallet.solAddress = mpc.solAddress;
            wallet.solPublicKey = mpc.solAddress;
          } else {
            wallet.solAddress = wallet.solAddress || mpc.solAddress;
            wallet.solPublicKey = wallet.solPublicKey || wallet.solAddress;
          }
          wallet._mpcDerivedForNearId = nearId;
        } else if (!wallet.mpcEvmAddress) {
          const mpcEvm = await deriveMpcEvmAddressAsync(nearId, 'ethereum-1');
          wallet.mpcEvmAddress = mpcEvm;
          if (!wallet.evmPrivateKey) wallet.evmAddress = wallet.evmAddress || mpcEvm;
          wallet._mpcDerivedForNearId = nearId;
        }
      }
    }

    return wallet;
  }

  function resolveWalletChainBalance(wallet, chain) {
    if (!wallet) return 0;
    const c = String(chain || '').toLowerCase();
    const nb = wallet.nativeBalances || {};
    if (c === 'near') {
      const rawNear = wallet.nearBalance !== undefined && wallet.nearBalance !== null ? wallet.nearBalance : nb.near;
      const val = Number(rawNear);
      return Number.isFinite(val) ? val : 0;
    }
    if (c === 'prl') {
      const rawPrl = wallet.balance !== undefined && wallet.balance !== null ? wallet.balance : nb.prl;
      const val = Number(rawPrl);
      return Number.isFinite(val) ? val : 0;
    }
    const mb = wallet.multiBalances || {};
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
    if (available + 1e-12 < reqAmt || available + 1e-12 < requiredTotal) {
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
    const now = Date.now();
    let active = SOLANA_RPC_ENDPOINTS.filter((u) => !(_solRpcCooldownUntil[u] > now));
    if (active.length === 0) active = SOLANA_RPC_ENDPOINTS.slice();
    const isReadOnly = method !== 'sendTransaction' && method !== 'simulateTransaction';
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

    if (isReadOnly && active.length > 1) {
      const raceCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      try {
        return await Promise.any(
          active.slice(0, 2).map(async (rpcUrl) => {
            try {
              const res = await fetchJsonWithTimeout(
                rpcUrl,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body,
                  signal: raceCtrl ? raceCtrl.signal : undefined
                },
                timeoutMs
              );
              if (res && !res.error && res.result !== undefined) {
                if (raceCtrl && !raceCtrl.signal.aborted) raceCtrl.abort();
                return res.result;
              }
              const msg = (res && res.error && res.error.message) || JSON.stringify(res?.error || 'RPC error');
              if (res && res.error && !isDeterministicJsonRpcError(res.error)) {
                _solRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
              }
              throw new Error(msg);
            } catch (err) {
              if (!(raceCtrl && raceCtrl.signal.aborted) && shouldCooldownRpcError(err)) {
                _solRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
              }
              throw err;
            }
          })
        );
      } catch (aggErr) {
        const errs = aggErr && Array.isArray(aggErr.errors) ? aggErr.errors : [aggErr];
        throw errs[0] || new Error('Solana RPC call failed');
      } finally {
        if (raceCtrl && !raceCtrl.signal.aborted) raceCtrl.abort();
      }
    }

    let lastErr = null;
    for (const rpcUrl of active) {
      try {
        const res = await fetchJsonWithTimeout(
          rpcUrl,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
          timeoutMs
        );
        if (res && !res.error && res.result !== undefined) {
          return res.result;
        }
        if (res && res.error) {
          if (!isDeterministicJsonRpcError(res.error)) {
            _solRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
          }
          lastErr = new Error(res.error.message || JSON.stringify(res.error));
          if (isDeterministicJsonRpcError(res.error)) throw lastErr;
        }
      } catch (err) {
        if (shouldCooldownRpcError(err)) {
          _solRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
        }
        lastErr = err;
        if (err && !err.status && err.name !== 'AbortError' && /simulation|blockhash|insufficient/i.test(String(err.message || ''))) {
          throw err;
        }
      }
    }
    throw lastErr || new Error('Solana RPC call failed');
  }

  /**
   * 通用竞速聚合器：并发发起多个异步请求，一旦首个有效结果到达，
   * 仅再等待 graceMs 毫秒让其余更快候选参与比价，超时立即返回当前已到达的结果数组，
   * 并在结束时主动 abort 未完成分支。
   */
  async function raceWithGraceWindow(promises, isValidFn = (v) => Boolean(v), graceMs = 600, maxWaitMs = 8000, abortCtrl = null) {
    const list = Array.isArray(promises) ? promises : [];
    if (list.length === 0) return [];
    return new Promise((resolve) => {
      const results = new Array(list.length).fill(null);
      let remaining = list.length;
      let done = false;
      let graceTimer = null;
      let globalTimer = null;

      const finish = () => {
        if (done) return;
        done = true;
        if (graceTimer) clearTimeout(graceTimer);
        if (globalTimer) clearTimeout(globalTimer);
        if (abortCtrl && abortCtrl.signal && !abortCtrl.signal.aborted) {
          try { abortCtrl.abort(); } catch (_) {}
        }
        resolve(results);
      };

      if (maxWaitMs > 0) {
        globalTimer = setTimeout(finish, maxWaitMs);
      }

      list.forEach((p, idx) => {
        Promise.resolve(p)
          .then((val) => {
            results[idx] = { status: 'fulfilled', value: val };
            if (!done && isValidFn(val) && !graceTimer && remaining > 1) {
              graceTimer = setTimeout(finish, graceMs);
            }
          })
          .catch((err) => {
            results[idx] = { status: 'rejected', reason: err };
          })
          .finally(() => {
            remaining -= 1;
            if (remaining <= 0) finish();
          });
      });
    });
  }

  async function fetchSolanaNativeAndSplBalances(solAddress, mintAddresses = []) {
    const addr = String(solAddress || '').trim();
    if (!addr) return null;

    try {
      const [balRes, splRes, t22Res] = await Promise.all([
        callSolanaRpc('getBalance', [addr], 5000),
        callSolanaRpc('getTokenAccountsByOwner', [addr, { programId: SPL_TOKEN_PROGRAM_ID }, { encoding: 'jsonParsed' }], 5000).catch(() => null),
        callSolanaRpc('getTokenAccountsByOwner', [addr, { programId: SPL_TOKEN_2022_PROGRAM_ID }, { encoding: 'jsonParsed' }], 5000).catch(() => null)
      ]);

      const lamports = balRes && typeof balRes.value === 'number' ? balRes.value : 0;
      const nativeSol = Number(fromBaseUnits(String(lamports), 9));

      const tokens = {};
      const ataMints = {};
      const parseSplAccounts = (res) => {
        const list = res && Array.isArray(res.value) ? res.value : [];
        for (const item of list) {
          const info = item && item.account && item.account.data && item.account.data.parsed && item.account.data.parsed.info;
          if (!info || !info.mint || !info.tokenAmount) continue;
          const mint = info.mint;
          const decimals = Number(info.tokenAmount.decimals) || 0;
          const rawAmt = BigInt(info.tokenAmount.amount || '0');
          ataMints[mint] = true;
          if (!tokens[mint]) {
            tokens[mint] = { raw: rawAmt.toString(), decimals, formatted: Number(fromBaseUnits(rawAmt.toString(), decimals)), hasAta: true };
          } else {
            const sumRaw = BigInt(tokens[mint].raw) + rawAmt;
            tokens[mint] = { raw: sumRaw.toString(), decimals, formatted: Number(fromBaseUnits(sumRaw.toString(), decimals)), hasAta: true };
          }
        }
      };

      parseSplAccounts(splRes);
      parseSplAccounts(t22Res);

      if (Array.isArray(mintAddresses)) {
        for (const m of mintAddresses) {
          if (m && !tokens[m]) {
            tokens[m] = { raw: '0', decimals: 0, formatted: 0, hasAta: false };
          }
        }
      }

      return {
        solAddress: addr,
        nativeLamports: String(lamports),
        nativeSol,
        tokens,
        ataMints
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
    platformFeeBps = 0,
    signal = null
  } = {}) {
    if (!inputMint || !outputMint) {
      throw new Error(t('缺少 Solana 代币 Mint 地址', 'Missing Solana inputMint or outputMint'));
    }
    const amtStr = String(amountRaw === undefined || amountRaw === null ? '' : amountRaw).trim();
    if (!/^\d+$/.test(amtStr) || BigInt(amtStr) <= 0n) {
      throw new Error(t('兑换数量必须大于 0', 'amountRaw must be a positive integer string'));
    }
    const slip = Number(slippageBps) || 100;
    const solFeeBps = Number.isFinite(Number(platformFeeBps)) ? Math.max(0, Math.round(Number(platformFeeBps))) : 0;
    const cacheKey = `sol:${inputMint}:${outputMint}:${amtStr}:${slip}:${solFeeBps}`;

    return withQuoteCacheAndDedup(cacheKey, 10_000, async () => {
      const feeParam = solFeeBps > 0 ? `&platformFeeBps=${solFeeBps}` : '';
      const jupUrl = `${JUPITER_API_URL}/quote?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(amtStr)}&slippageBps=${slip}${feeParam}`;
      const rayUrl = `${RAYDIUM_API_URL}/compute/swap-base-in?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(amtStr)}&slippageBps=${slip}&txVersion=V0`;

      const localCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const mergedSig = (localCtrl && signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function')
        ? AbortSignal.any([signal, localCtrl.signal])
        : (localCtrl ? localCtrl.signal : signal);
      let onExtAbort = null;
      if (localCtrl && signal && (!mergedSig || mergedSig === localCtrl.signal)) {
        if (signal.aborted) localCtrl.abort();
        else {
          onExtAbort = () => localCtrl.abort();
          signal.addEventListener('abort', onExtAbort, { once: true });
        }
      }

      try {
        const [jRes, rRes] = await raceWithGraceWindow(
          [
            fetchJsonWithTimeout(jupUrl, { signal: mergedSig }, 4500),
            fetchJsonWithTimeout(rayUrl, { signal: mergedSig }, 4500).catch(() => null)
          ],
          (v) => Boolean(v && (v.outAmount || (v.success && v.data && v.data.outputAmount))),
          1000,
          5000,
          localCtrl
        );

        const jQuote = jRes && jRes.status === 'fulfilled' && jRes.value && jRes.value.outAmount ? jRes.value : null;
        const rResp = rRes && rRes.status === 'fulfilled' && rRes.value && rRes.value.success && rRes.value.data && rRes.value.data.outputAmount
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
          const jErr = jRes && jRes.status === 'rejected'
            ? jRes.reason?.message
            : (jRes && jRes.status === 'fulfilled' && jRes.value && jRes.value.error);
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
            serviceFeeBps: solFeeBps,
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
          serviceFeeBps: 0,
          _jupiterQuote: jQuote,
          _raydiumRawResponse: rResp
        };
      } finally {
        if (signal && onExtAbort) {
          try { signal.removeEventListener('abort', onExtAbort); } catch (_) {}
        }
      }
    });
  }

  function extractSolanaMpcSignatureBytes(mpcRes) {
    const sigObj = mpcRes && mpcRes.mpcSignature;
    if (!sigObj || !Array.isArray(sigObj.signature) || sigObj.signature.length !== 64) {
      throw new Error(t('NEAR MPC 未返回有效的 64 字节 Ed25519 签名', 'NEAR MPC did not return a valid 64-byte Ed25519 signature'));
    }
    return Uint8Array.from(sigObj.signature, (b) => Number(b) & 0xff);
  }

  async function signSolanaBase64Tx(base64Tx, solSeedHex, mpcWallet = null, mpcPath = 'solana-1') {
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
    return {
      txBytes,
      signedBase64: bytesToBase64(txBytes)
    };
  }

  async function signAndBroadcastSolanaBase64Tx(base64Tx, solSeedHex, mpcWallet = null, mpcPath = 'solana-1') {
    const { signedBase64 } = await signSolanaBase64Tx(base64Tx, solSeedHex, mpcWallet, mpcPath);

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
        const ataProg = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
        const deriveAtaForMint = async (mintAddr) => {
          if (!mintAddr || mintAddr === WSOL_MINT) return undefined;
          const mInfo = await callSolanaRpc('getAccountInfo', [mintAddr, { encoding: 'jsonParsed' }], 4000).catch(() => null);
          const progId = mInfo?.value?.owner === SPL_TOKEN_2022_PROGRAM_ID ? SPL_TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID;
          const pda = await findSolanaPdaAsync(
            [base58Decode(wallet.solAddress), base58Decode(progId), base58Decode(mintAddr)],
            base58Decode(ataProg)
          );
          return pda.address;
        };
        const [inputAccount, outputAccount] = await Promise.all([
          deriveAtaForMint(inputMint),
          deriveAtaForMint(activeQuote.outputMint)
        ]);
        const rayBody = {
          computeUnitPriceMicroLamports: '100000',
          swapResponse: activeQuote._raydiumRawResponse,
          txVersion: 'V0',
          wallet: wallet.solAddress,
          wrapSol: inputMint === WSOL_MINT,
          unwrapSol: activeQuote.outputMint === WSOL_MINT
        };
        if (inputAccount) rayBody.inputAccount = inputAccount;
        if (outputAccount) rayBody.outputAccount = outputAccount;
        const rayBuild = await fetchJsonWithTimeout(
          `${RAYDIUM_API_URL}/transaction/swap-base-in`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(rayBody)
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
      } else {
        throw new Error(t('Raydium 交易构建失败且无 Jupiter 备选报价', 'Raydium swap build failed and no Jupiter quote available'));
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

  /**
   * Solana SPL / Token-2022 代币同链/存款转账：
   * 自动识别 Mint 所属 Token Program，幂等创建接收方 ATA，构建 TransferChecked 指令并签名广播。
   */
  async function executeSolanaSplTransfer({
    wallet,
    mintAddress,
    toAddress,
    amount,
    decimals = null,
    programId = null,
    tokenBalance = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const mintStr = String(mintAddress || '').trim();
    const destStr = String(toAddress || '').trim();
    if (!mintStr) throw new Error(t('缺少 Solana 代币 Mint 地址', 'Missing Solana token mint address'));
    const mintPubkey = base58Decode(mintStr);
    const toPubkey = base58Decode(destStr);
    if (mintPubkey.length !== 32) throw new Error(t('Solana Mint 地址无效', 'Invalid Solana mint address'));
    if (toPubkey.length !== 32) throw new Error(t('Solana 收款地址无效', 'Invalid Solana recipient address'));

    const cachedSplBal =
      tokenBalance !== null && tokenBalance !== undefined
        ? Number(tokenBalance)
        : (wallet.splBalances && wallet.splBalances[mintStr] !== undefined && wallet.splBalances[mintStr] !== null
            ? Number(wallet.splBalances[mintStr])
            : null);
    validateSufficientChainBalance({
      wallet,
      chain: 'sol',
      tokenSymbol: 'SPL',
      amount,
      isNative: false,
      tokenBalance: Number.isFinite(cachedSplBal) ? cachedSplBal : 0
    });
    const solGasAvailPre = resolveWalletChainBalance(wallet, 'sol');
    if (solGasAvailPre < 0.00002) {
      throw new Error(t(`SOL 余额不足以支付交易费与 ATA 租金 (需至少 0.00002, 当前 ${solGasAvailPre.toFixed(5)} SOL)`, `Insufficient SOL for gas/ATA rent (Available: ${solGasAvailPre.toFixed(5)} SOL)`));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
      throw new Error(t('NEAR 主账户或 MPC Solana 地址不可用', 'NEAR Master Account or MPC Solana address unavailable'));
    }

    let dec = (decimals !== null && decimals !== undefined && Number.isFinite(Number(decimals))) ? Number(decimals) : null;
    let tokProg = programId ? String(programId).trim() : '';
    let mintAccInfo = null;
    if (!tokProg || dec === null) {
      mintAccInfo = await callSolanaRpc('getAccountInfo', [mintStr, { encoding: 'jsonParsed' }], 5000).catch(() => null);
      if (!tokProg) {
        const ownerProg = mintAccInfo && mintAccInfo.value && mintAccInfo.value.owner ? String(mintAccInfo.value.owner) : '';
        tokProg = ownerProg === SPL_TOKEN_2022_PROGRAM_ID ? SPL_TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID;
      }
      if (dec === null) {
        const parsedDec = mintAccInfo?.value?.data?.parsed?.info?.decimals;
        dec = Number.isFinite(Number(parsedDec)) ? Number(parsedDec) : resolveSolanaTokenDecimals(mintStr, 6);
      }
    }

    const rawAmtStr = toBaseUnits(amount, dec);
    if (!/^\d+$/.test(rawAmtStr) || BigInt(rawAmtStr) <= 0n) {
      throw new Error(t('转账数量过小', 'Transfer amount too small'));
    }

    const ownerStr = wallet.solAddress;
    const ataProg = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
    const sysProg = '11111111111111111111111111111111';

    const sourceAta = await findSolanaPdaAsync(
      [base58Decode(ownerStr), base58Decode(tokProg), mintPubkey],
      base58Decode(ataProg)
    );
    const destAta = await findSolanaPdaAsync(
      [toPubkey, base58Decode(tokProg), mintPubkey],
      base58Decode(ataProg)
    );

    const destAtaInfo = await callSolanaRpc('getAccountInfo', [destAta.address, { encoding: 'base64' }], 4000).catch(() => null);
    const needAtaRent = !destAtaInfo || !destAtaInfo.value;
    const requiredSolGas = needAtaRent ? 0.00205 : 0.00002;
    const solGasAvail = resolveWalletChainBalance(wallet, 'sol');
    if (solGasAvail < requiredSolGas) {
      throw new Error(t(`SOL 余额不足以支付交易费与 ATA 租金 (需 ${requiredSolGas.toFixed(5)}, 当前 ${solGasAvail.toFixed(5)} SOL)`, `Insufficient SOL for gas/ATA rent (Need ${requiredSolGas.toFixed(5)}, Available: ${solGasAvail.toFixed(5)} SOL)`));
    }

    const instructions = [];
    // 幂等创建接收方 ATA（若已存在则合约无操作且不报错）
    instructions.push({
      programId: ataProg,
      keys: [
        { pubkey: ownerStr, isSigner: true, isWritable: true },
        { pubkey: destAta.address, isSigner: false, isWritable: true },
        { pubkey: destStr, isSigner: false, isWritable: false },
        { pubkey: mintStr, isSigner: false, isWritable: false },
        { pubkey: sysProg, isSigner: false, isWritable: false },
        { pubkey: tokProg, isSigner: false, isWritable: false }
      ],
      data: new Uint8Array([1]) // AssociatedTokenAccount::CreateIdempotent
    });

    // SPL Token Instruction::TransferChecked (opcode 12, u64 amount, u8 decimals)
    const ixData = concatUint8Arrays([
      new Uint8Array([12]),
      encodeU64LE(rawAmtStr),
      new Uint8Array([dec & 0xff])
    ]);
    instructions.push({
      programId: tokProg,
      keys: [
        { pubkey: sourceAta.address, isSigner: false, isWritable: true },
        { pubkey: mintStr, isSigner: false, isWritable: false },
        { pubkey: destAta.address, isSigner: false, isWritable: true },
        { pubkey: ownerStr, isSigner: true, isWritable: false }
      ],
      data: ixData
    });

    return buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions });
  }

  /**
   * Build SPL Token / Token-2022 Burn (opcode 8) + CloseAccount (opcode 9) instructions
   * to reclaim ATA rent lamports.
   */
  function buildSolanaCloseOrBurnInstructions({ ownerAddress, accounts = [] } = {}) {
    const ownerStr = String(ownerAddress || '').trim();
    if (!ownerStr) throw new Error(t('缺少 Solana 地址', 'Missing Solana address'));
    const instructions = [];
    for (const acc of accounts) {
      if (!acc || !acc.ataAddress || !acc.mint) continue;
      if (acc.hasWithheldFee) continue;
      const tokProg = acc.programId === SPL_TOKEN_2022_PROGRAM_ID ? SPL_TOKEN_2022_PROGRAM_ID : SPL_TOKEN_PROGRAM_ID;
      const rawAmt = BigInt(String(acc.rawAmount || '0'));
      const isWsol = acc.mint === WSOL_MINT;
      if (rawAmt > 0n && !isWsol) {
        instructions.push({
          programId: tokProg,
          keys: [
            { pubkey: acc.ataAddress, isSigner: false, isWritable: true },
            { pubkey: acc.mint, isSigner: false, isWritable: true },
            { pubkey: ownerStr, isSigner: true, isWritable: false }
          ],
          data: concatUint8Arrays([new Uint8Array([8]), encodeU64LE(rawAmt.toString())])
        });
      }
      instructions.push({
        programId: tokProg,
        keys: [
          { pubkey: acc.ataAddress, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: true, isWritable: false }
        ],
        data: new Uint8Array([9])
      });
    }
    return instructions;
  }

  /**
   * Scan all SPL & Token-2022 accounts for an address to identify empty ATAs and dust (< $0.01) accounts.
   */
  async function scanSolanaReclaimableAccounts(solAddress, options = {}) {
    const addr = String(solAddress || '').trim();
    if (!addr) throw new Error(t('当前钱包未绑定 Solana 地址', 'Solana address unavailable'));
    const priceResolver = typeof options.priceResolver === 'function' ? options.priceResolver : null;

    const raceSolanaTokenRpc = (progId) =>
      Promise.any(
        SOLANA_RPC_ENDPOINTS.map(async (rpcUrl) => {
          const res = await fetchJsonWithTimeout(
            rpcUrl,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getTokenAccountsByOwner',
                params: [addr, { programId: progId }, { encoding: 'jsonParsed' }]
              })
            },
            4500
          );
          if (res && !res.error && res.result !== undefined) return res.result;
          throw new Error((res && res.error && res.error.message) || 'Solana RPC error');
        })
      ).catch(() => null);

    const [splRes, t22Res] = await Promise.all([
      raceSolanaTokenRpc(SPL_TOKEN_PROGRAM_ID),
      raceSolanaTokenRpc(SPL_TOKEN_2022_PROGRAM_ID)
    ]);

    if (!splRes && !t22Res) {
      throw new Error(t('Solana RPC 扫描失败，请稍后重试', 'Solana RPC scan failed, please retry'));
    }

    const accounts = [];
    const collect = (res, fallbackProg) => {
      const list = res && Array.isArray(res.value) ? res.value : [];
      for (const item of list) {
        const parsed = item?.account?.data?.parsed;
        const info = parsed && parsed.info;
        if (!info || !info.mint || !info.tokenAmount) continue;
        if (info.state === 'frozen') continue;
        const exts = Array.isArray(info.extensions) ? info.extensions : [];
        const hasWithheld = exts.some((ext) => ext && ext.extension === 'transferFeeAmount' && Number(ext.state?.withheldAmount || 0) > 0);
        if (hasWithheld) continue;
        const lamports = Number(item?.account?.lamports || 0);
        const rentSol = lamports / 1e9;
        const decimals = Number(info.tokenAmount.decimals || 0);
        const rawAmount = String(info.tokenAmount.amount || '0');
        const uiAmount = Number(fromBaseUnits(rawAmount, decimals));
        const isEmpty = BigInt(rawAmount) === 0n;
        const priceUsd = !isEmpty && priceResolver ? priceResolver(info.mint) : null;
        const usdValue = priceUsd !== null && Number.isFinite(Number(priceUsd)) ? uiAmount * Number(priceUsd) : null;
        const isDust = !isEmpty && usdValue !== null && usdValue < 0.01;
        accounts.push({
          ataAddress: item.pubkey,
          programId: item?.account?.owner || fallbackProg,
          mint: info.mint,
          lamports,
          rentSol,
          decimals,
          rawAmount,
          uiAmount,
          isEmpty,
          usdValue,
          isDust
        });
      }
    };

    collect(splRes, SPL_TOKEN_PROGRAM_ID);
    collect(t22Res, SPL_TOKEN_2022_PROGRAM_ID);

    accounts.sort((a, b) => {
      const rank = (x) => (x.isEmpty ? 0 : x.isDust ? 1 : 2);
      return rank(a) - rank(b) || b.lamports - a.lamports;
    });

    const emptyCount = accounts.filter((a) => a.isEmpty).length;
    const dustCount = accounts.filter((a) => a.isDust).length;
    const totalReclaimableSol = accounts
      .filter((a) => a.isEmpty || a.isDust)
      .reduce((sum, a) => sum + a.rentSol, 0);

    return { ok: true, accounts, emptyCount, dustCount, totalReclaimableSol };
  }

  /**
   * Reclaim SOL rent by closing empty ATAs and optionally burning dust tokens first.
   */
  async function executeSolanaRentReclaim({ wallet, accounts = [] } = {}) {
    if (!wallet || !wallet.solAddress) {
      throw new Error(t('Solana 地址不可用', 'Solana address unavailable'));
    }
    const list = Array.isArray(accounts) ? accounts.filter((a) => a && a.ataAddress && a.mint) : [];
    if (list.length === 0) {
      throw new Error(t('请选择至少一个可回收账户', 'Select at least one account to reclaim'));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const batchSize = 8;
    const batchCount = Math.max(1, Math.ceil(list.length / batchSize));
    validateSufficientChainBalance({
      wallet,
      chain: 'sol',
      tokenSymbol: 'SOL',
      amount: 0.00001 * batchCount,
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, 'sol')
    });

    const txHashes = [];
    for (let i = 0; i < list.length; i += batchSize) {
      const chunk = list.slice(i, i + batchSize);
      const instructions = buildSolanaCloseOrBurnInstructions({
        ownerAddress: wallet.solAddress,
        accounts: chunk
      });
      if (instructions.length === 0) continue;
      const res = await buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions });
      if (res && res.txHash) txHashes.push(res.txHash);
    }

    const closedCount = list.length;
    const burnedCount = list.filter((a) => BigInt(String(a.rawAmount || '0')) > 0n).length;
    const reclaimedSol = list.reduce((s, a) => s + Number(a.rentSol || 0), 0);
    return { ok: true, txHashes, closedCount, burnedCount, reclaimedSol };
  }

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

  async function executePearlTransfer({ wallet, toAddress, amountPrl, feeDeductMode = 'extra' } = {}) {
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
        tokenBalance: cachedPrl
      });
    }

    await ensureWalletSigningKeysAsync(wallet);
    if (!wallet.tweakedPrivateKeyHex) {
      throw new Error(t('缺少 Pearl Taproot 签名私钥', 'Pearl Taproot signing key unavailable'));
    }

    const [utxos, feeEst] = await Promise.all([
      pearlBlockbookRequest(`/api/v2/utxo/${encodeURIComponent(wallet.address)}?confirmed=false`),
      pearlBlockbookRequest('/api/v2/estimatefee/2').catch(() => null)
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

    const feePerKbPrl = feeEst && feeEst.result && Number(feeEst.result) > 0 ? Number(feeEst.result) : 0.0066;
    const reqGrainsBig = BigInt(toBaseUnits(String(reqAmt), 8));
    let feeGrainsBig = BigInt(Math.max(10000, Math.ceil((feePerKbPrl * 1e8 * (12 + 58 + 2 * 43)) / 1000)));
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
      const nextFee = BigInt(Math.max(10000, Math.ceil((feePerKbPrl * 1e8 * vbytes) / 1000)));
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

  async function executeBitcoinTransfer({ wallet, toAddress, amountBtc, feeDeductMode = 'extra', feeRateSatVb = null } = {}) {
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
        tokenBalance: cachedBtc
      });
    }

    await ensureWalletSigningKeysAsync(wallet);
    if (!wallet.btcAddress || !wallet.btcTweakedPrivateKeyHex) {
      throw new Error(t('Bitcoin Taproot 自托管密钥不可用', 'Bitcoin Taproot self-custody key unavailable'));
    }

    const [utxos, mempoolFees, blockstreamFees] = await Promise.all([
      btcApiRequestJson(`/address/${encodeURIComponent(wallet.btcAddress)}/utxo`, {}, 8000),
      feeRateSatVb ? Promise.resolve(null) : fetchJsonWithTimeout('https://mempool.space/api/v1/fees/recommended', {}, 5000).catch(() => null),
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

  // ==================== EVM RPC & Smart Contract Execution ====================

  function sliceEvmUint256WordHex(hexResult, wordIndex = 0) {
    const clean = String(hexResult || '').replace(/^0x/i, '');
    const start = wordIndex * 64;
    if (clean.length < start + 64) return '0';
    return BigInt('0x' + clean.slice(start, start + 64)).toString();
  }

  function encodeMulticall3Aggregate3(calls = []) {
    const selector = '82ad56cb';
    const count = calls.length;
    const headWords = [
      '0000000000000000000000000000000000000000000000000000000000000020',
      count.toString(16).padStart(64, '0')
    ];
    let elemOffset = count * 32;
    const offsetWords = [];
    const bodyChunks = [];

    for (const c of calls) {
      offsetWords.push(elemOffset.toString(16).padStart(64, '0'));
      const targetHex = String(c.target || '').replace(/^0x/i, '').toLowerCase().padStart(64, '0');
      const allowHex = (c.allowFailure ? 1 : 0).toString(16).padStart(64, '0');
      const dataRelOff = (96).toString(16).padStart(64, '0');
      const dataClean = String(c.callData || '').replace(/^0x/i, '').toLowerCase();
      const dataByteLen = Math.floor(dataClean.length / 2);
      const dataLenHex = dataByteLen.toString(16).padStart(64, '0');
      const paddedLen = Math.ceil(dataClean.length / 64) * 64;
      const dataPadded = dataClean.padEnd(paddedLen, '0');
      const chunk = targetHex + allowHex + dataRelOff + dataLenHex + dataPadded;
      bodyChunks.push(chunk);
      elemOffset += chunk.length / 2;
    }

    return '0x' + selector + headWords.join('') + offsetWords.join('') + bodyChunks.join('');
  }

  function decodeMulticall3Aggregate3Result(hexResult) {
    const clean = String(hexResult || '').replace(/^0x/i, '');
    if (clean.length < 128) return null;
    const readWord = (byteOff) => {
      const start = byteOff * 2;
      if (start + 64 > clean.length) return 0n;
      return BigInt('0x' + clean.slice(start, start + 64));
    };
    const arrOffset = Number(readWord(0));
    const count = Number(readWord(arrOffset));
    if (!Number.isFinite(count) || count < 0 || count > 2000) return null;
    const elemsBase = arrOffset + 32;
    const out = [];
    for (let i = 0; i < count; i++) {
      const rel = Number(readWord(elemsBase + i * 32));
      const elemPos = elemsBase + rel;
      const success = readWord(elemPos) !== 0n;
      const dataRel = Number(readWord(elemPos + 32));
      const dataPos = elemPos + dataRel;
      const dataByteLen = Number(readWord(dataPos));
      const hexStart = (dataPos + 32) * 2;
      const hexEnd = hexStart + dataByteLen * 2;
      const returnData = hexEnd <= clean.length ? ('0x' + clean.slice(hexStart, hexEnd)) : '0x';
      out.push({ success: Boolean(success && dataByteLen > 0), returnData });
    }
    return out;
  }

  async function callEvmRpc(chainKey, payload, timeoutMs = 6000) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) return null;
    const allRpcs = Array.isArray(cfg.rpcs) && cfg.rpcs.length > 0 ? cfg.rpcs : (cfg.rpc ? [cfg.rpc] : []);
    if (allRpcs.length === 0) return null;
    const now = Date.now();
    let active = allRpcs.filter((u) => !(_evmRpcCooldownUntil[u] > now));
    if (active.length === 0) active = allRpcs;

    const effTimeout = Math.min(timeoutMs, 5000);
    const bodyStr = JSON.stringify(payload);
    const isBatch = Array.isArray(payload);
    const methodName = !isBatch && payload && payload.method ? String(payload.method) : '';
    const isReadOnly = isBatch || !/sendRawTransaction|sendTransaction/i.test(methodName);

    const trySingleEndpoint = async (rpcUrl, signal = undefined) => {
      try {
        const res = await fetchJsonWithTimeout(
          rpcUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: bodyStr,
            signal
          },
          effTimeout
        );
        if (Array.isArray(res)) {
          const allErrors = res.length > 0 && res.every((item) => item && item.error && item.result === undefined);
          if (allErrors) {
            const firstErr = res[0].error;
            if (isDeterministicJsonRpcError(firstErr)) return { deterministicError: true, data: null };
            _evmRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
            return { deterministicError: false, data: null };
          }
          return { deterministicError: false, data: res };
        }
        if (res && res.result !== undefined && !res.error) {
          return { deterministicError: false, data: res };
        }
        if (res && res.error) {
          if (isDeterministicJsonRpcError(res.error)) {
            return { deterministicError: true, data: null };
          }
          _evmRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
        }
      } catch (err) {
        if (!(signal && signal.aborted) && shouldCooldownRpcError(err)) {
          _evmRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
        }
      }
      return { deterministicError: false, data: null };
    };

    // Hedged racing for read-only calls when >= 2 healthy RPCs exist: launch backup after 1500ms if primary is slow
    if (isReadOnly && active.length >= 2) {
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const sig = ctrl ? ctrl.signal : undefined;
      let hedgeTimer = null;
      try {
        const primary = trySingleEndpoint(active[0], sig).then((r) => {
          if (r && (r.data !== null || r.deterministicError)) return r;
          throw new Error('primary_failed');
        });
        const backup = new Promise((resolve, reject) => {
          let settled = false;
          const runBackup = () => {
            if (settled || (sig && sig.aborted)) { reject(new Error('aborted')); return; }
            trySingleEndpoint(active[1], sig).then((r) => {
              if (r && (r.data !== null || r.deterministicError)) resolve(r);
              else reject(new Error('backup_failed'));
            }).catch(reject);
          };
          hedgeTimer = setTimeout(runBackup, 1500);
          primary.catch(() => {
            if (hedgeTimer) { clearTimeout(hedgeTimer); hedgeTimer = null; }
            runBackup();
          });
        });
        const winner = await Promise.any([primary, backup]);
        if (hedgeTimer) clearTimeout(hedgeTimer);
        if (ctrl && !ctrl.signal.aborted) ctrl.abort();
        if (winner && winner.deterministicError) return null;
        if (winner && winner.data !== null) return winner.data;
      } catch (_) {
        if (hedgeTimer) clearTimeout(hedgeTimer);
        if (ctrl && !ctrl.signal.aborted) ctrl.abort();
      }
      // Try any remaining endpoints beyond the first two
      for (let i = 2; i < active.length; i++) {
        const r = await trySingleEndpoint(active[i]);
        if (r.deterministicError) return null;
        if (r.data !== null) return r.data;
      }
      return null;
    }

    for (const rpcUrl of active) {
      const r = await trySingleEndpoint(rpcUrl);
      if (r.deterministicError) return null;
      if (r.data !== null) return r.data;
    }
    return null;
  }

  async function waitForEvmTxConfirmation(chainKey, txHash, timeoutMs = 45000) {
    if (!txHash) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const res = await callEvmRpc(
        chainKey,
        { jsonrpc: '2.0', id: 'receipt', method: 'eth_getTransactionReceipt', params: [txHash] },
        5000
      ).catch(() => null);
      const receipt = res && res.result ? res.result : null;
      if (receipt && receipt.blockNumber) {
        if (receipt.status === '0x0') {
          throw new Error(t(`链上交易执行失败 (tx: ${txHash})`, `On-chain transaction reverted (tx: ${txHash})`));
        }
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, 1800));
    }
    return null;
  }

  async function fetchEvmNativeAndErc20Balance(chainKey, evmAddress, tokenContract = null, decimals = 18) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    const addr = String(evmAddress || '').trim();
    if (!cfg || !addr) return null;

    try {
      const nativeRes = await callEvmRpc(
        key,
        { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [addr, 'latest'] },
        6500
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
        const tokenRes = await callEvmRpc(
          key,
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_call',
            params: [{ to: contract, data: '0x70a08231' + paddedAddr }, 'latest']
          },
          6500
        );
        if (tokenRes && typeof tokenRes.result === 'string' && tokenRes.result.startsWith('0x')) {
          tokenRaw = sliceEvmUint256WordHex(tokenRes.result, 0);
          tokenFormatted = Number(fromBaseUnits(tokenRaw, decimals));
        }
      }

      return {
        chainKey: key,
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

  /**
   * 批量查询单条 EVM 链的原生余额与多个 ERC20 balanceOf：
   * 优先通过 Multicall3.aggregate3 单次 eth_call 查询（无节点 Batch 限制，最快）；
   * 不支持 Multicall3 或失败时自动降级为 JSON-RPC Batch / 多 RPC 故障转移并发查询。
   */
  async function fetchEvmChainBalancesBatch(chainKey, evmAddress, tokenQueries = []) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    const addr = String(evmAddress || '').trim();
    if (!cfg || !addr) return null;

    const validTokens = (Array.isArray(tokenQueries) ? tokenQueries : [])
      .filter((q) => q && q.contract && String(q.contract).trim().toLowerCase() !== NATIVE_EVM_SENTINEL)
      .map((q) => ({
        contract: String(q.contract).trim(),
        decimals: Number.isFinite(Number(q.decimals)) ? Number(q.decimals) : 18
      }));

    const paddedAddr = addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const tokens = Object.create(null);
    const allRpcList = Array.isArray(cfg.rpcs) && cfg.rpcs.length > 0 ? cfg.rpcs : (cfg.rpc ? [cfg.rpc] : []);
    const allInCooldown = () => allRpcList.length > 0 && allRpcList.every((u) => (_evmRpcCooldownUntil[u] || 0) > Date.now());

    try {
      if (validTokens.length === 0) {
        const natOnlyRes = await callEvmRpc(
          key,
          { jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [addr, 'latest'] },
          5500
        );
        if (!natOnlyRes || typeof natOnlyRes.result !== 'string' || !natOnlyRes.result.startsWith('0x')) {
          return null;
        }
        const nativeRaw = BigInt(natOnlyRes.result === '0x' ? '0x0' : natOnlyRes.result).toString();
        const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));
        return { chainKey: key, chainId: cfg.chainId, nativeRaw, nativeFormatted, tokens };
      }

      // 1. Multicall3 aggregate3 (1 eth_call for native ETH + all ERC20 tokens)
      if (cfg.supportsMulticall3 !== false) {
        const allCalls = [
          { target: MULTICALL3_ADDRESS, allowFailure: true, callData: '0x4d2301cc' + paddedAddr },
          ...validTokens.map((q) => ({
            target: q.contract,
            allowFailure: true,
            callData: '0x70a08231' + paddedAddr
          }))
        ];
        const CHUNK_SIZE = 100;
        const decodedAll = [];
        let mcOk = true;
        for (let off = 0; off < allCalls.length; off += CHUNK_SIZE) {
          const chunk = allCalls.slice(off, off + CHUNK_SIZE);
          const calldata = encodeMulticall3Aggregate3(chunk);
          const mcRes = await callEvmRpc(
            key,
            {
              jsonrpc: '2.0',
              id: `mc3_${off}`,
              method: 'eth_call',
              params: [{ to: MULTICALL3_ADDRESS, data: calldata }, 'latest']
            },
            5500
          );
          const decoded = mcRes && typeof mcRes.result === 'string'
            ? decodeMulticall3Aggregate3Result(mcRes.result)
            : null;
          if (!decoded || decoded.length !== chunk.length) {
            mcOk = false;
            break;
          }
          decodedAll.push(...decoded);
        }
        if (mcOk && decodedAll.length === allCalls.length && decodedAll[0].success) {
          const nativeRaw = sliceEvmUint256WordHex(decodedAll[0].returnData, 0);
          const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));
          validTokens.forEach((q, idx) => {
            const item = decodedAll[idx + 1];
            if (item && item.success && item.returnData && item.returnData !== '0x') {
              const raw = sliceEvmUint256WordHex(item.returnData, 0);
              tokens[q.contract.toLowerCase()] = {
                contract: q.contract,
                raw,
                formatted: Number(fromBaseUnits(raw, q.decimals))
              };
            }
          });
          return { chainKey: key, chainId: cfg.chainId, nativeRaw, nativeFormatted, tokens };
        }
        if (allInCooldown()) return null;
      }

      // 2. JSON-RPC Batch fallback
      const batchPayload = [
        { jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [addr, 'latest'] },
        ...validTokens.map((q, idx) => ({
          jsonrpc: '2.0',
          id: idx + 1,
          method: 'eth_call',
          params: [{ to: q.contract, data: '0x70a08231' + paddedAddr }, 'latest']
        }))
      ];

      const batchRes = await callEvmRpc(key, batchPayload, 5500);
      if (Array.isArray(batchRes) && batchRes.length > 0) {
        const byId = new Map();
        for (const item of batchRes) {
          if (item && item.id !== undefined) byId.set(item.id, item);
        }
        const natItem = byId.get(0);
        if (natItem && typeof natItem.result === 'string' && natItem.result.startsWith('0x')) {
          const nativeRaw = BigInt(natItem.result === '0x' ? '0x0' : natItem.result).toString();
          const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));
          validTokens.forEach((q, idx) => {
            const item = byId.get(idx + 1);
            if (item && typeof item.result === 'string' && item.result.startsWith('0x')) {
              const raw = sliceEvmUint256WordHex(item.result, 0);
              tokens[q.contract.toLowerCase()] = {
                contract: q.contract,
                raw,
                formatted: Number(fromBaseUnits(raw, q.decimals))
              };
            }
          });
          return { chainKey: key, chainId: cfg.chainId, nativeRaw, nativeFormatted, tokens };
        }
      }
      if (allInCooldown()) return null;

      // 3. Concurrent individual calls fallback
      const [natRes, ...ercResults] = await Promise.all([
        callEvmRpc(key, batchPayload[0], 5500),
        ...validTokens.map((_, idx) => callEvmRpc(key, batchPayload[idx + 1], 5500))
      ]);
      if (!natRes || typeof natRes.result !== 'string' || !natRes.result.startsWith('0x')) {
        return null;
      }
      const nativeRaw = BigInt(natRes.result === '0x' ? '0x0' : natRes.result).toString();
      const nativeFormatted = Number(fromBaseUnits(nativeRaw, 18));
      validTokens.forEach((q, idx) => {
        const res = ercResults[idx];
        if (res && typeof res.result === 'string' && res.result.startsWith('0x')) {
          const raw = sliceEvmUint256WordHex(res.result, 0);
          tokens[q.contract.toLowerCase()] = {
            contract: q.contract,
            raw,
            formatted: Number(fromBaseUnits(raw, q.decimals))
          };
        }
      });

      return { chainKey: key, chainId: cfg.chainId, nativeRaw, nativeFormatted, tokens };
    } catch (_) {
      return null;
    }
  }

  const ARC_USDC_PRECOMPILE = '0x3600000000000000000000000000000000000000';
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
    feeBps = 0,
    feeReceiver = DEFAULT_EVM_FEE_RECEIVER,
    fromAddress = '',
    signal = null
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

    const bps = feeBps !== undefined && feeBps !== null && Number.isFinite(Number(feeBps)) ? Math.max(0, Math.round(Number(feeBps))) : 0;
    const validFromAddr = /^0x[0-9a-fA-F]{40}$/.test(String(fromAddress || '')) ? String(fromAddress).trim() : '';
    const slipNum = Number(slippageBps) || 100;
    const evmCacheKey = `evm:${key}:${effSrc.toLowerCase()}:${effDest.toLowerCase()}:${effAmtStr}:${slipNum}:${bps}:${validFromAddr.toLowerCase()}`;

    return withQuoteCacheAndDedup(evmCacheKey, 10_000, async () => {
      const curFetch = (typeof globalThis !== 'undefined' && globalThis.fetch) || null;
      const isAggCoolingDown = (prov) => {
        const entry = _aggCooldownUntil[prov];
        if (!entry) return false;
        if (typeof entry === 'number') return entry > Date.now();
        return entry.fetchRef === curFetch && entry.until > Date.now();
      };
      const markAggCooldown = (prov, ms = 120_000) => {
        _aggCooldownUntil[prov] = { until: Date.now() + ms, fetchRef: curFetch };
      };

      const feeQueryKyber = bps > 0 && feeReceiver
        ? `&feeAmount=${bps}&isInBps=true&chargeFeeBy=currency_in&feeReceiver=${encodeURIComponent(feeReceiver)}`
        : '';
      const kyberUrl = cfg.kyber && !isAggCoolingDown(`kyber:${key}`)
        ? `https://aggregator-api.kyberswap.com/${cfg.kyber}/api/v1/routes?tokenIn=${encodeURIComponent(effSrc)}&tokenOut=${encodeURIComponent(effDest)}&amountIn=${encodeURIComponent(effAmtStr)}${feeQueryKyber}`
        : null;

      const feeQueryPara = bps > 0 && feeReceiver
        ? `&partner=pearlwallet&partnerAddress=${encodeURIComponent(feeReceiver)}&partnerFeeBps=${bps}`
        : '';
      const skipPara = cfg.chainId === 999 || cfg.chainId === 4663 || cfg.chainId === 5042 || isAggCoolingDown(`paraswap:${key}`);
      const paraUrl = !skipPara
        ? `https://api.paraswap.io/prices?srcToken=${encodeURIComponent(effSrc)}&destToken=${encodeURIComponent(effDest)}&amount=${encodeURIComponent(effAmtStr)}&srcDecimals=${effSrcDec}&destDecimals=${effDestDec}&network=${cfg.chainId}&side=SELL${feeQueryPara}`
        : null;

      const ooAmountHuman = fromBaseUnits(effAmtStr, effSrcDec);
      const ooSlippagePct = (slipNum / 100).toFixed(2);
      const ooUrl = cfg.openOcean && !isAggCoolingDown('openocean')
        ? `${OPENOCEAN_API_URL}/${cfg.openOcean}/quote?inTokenAddress=${encodeURIComponent(effSrc)}&outTokenAddress=${encodeURIComponent(effDest)}&amount=${encodeURIComponent(ooAmountHuman)}&slippage=${ooSlippagePct}`
        : null;

      const lifiSlip = (slipNum / 10000).toFixed(4);
      const lifiUrl = isArcMainnet && validFromAddr && !isAggCoolingDown(`lifi:${key}`)
        ? `${LIFI_API_URL}/quote?fromChain=${cfg.chainId}&toChain=${cfg.chainId}&fromToken=${encodeURIComponent(effSrc)}&toToken=${encodeURIComponent(effDest)}&fromAmount=${encodeURIComponent(effAmtStr)}&fromAddress=${encodeURIComponent(validFromAddr)}&slippage=${lifiSlip}`
        : null;

      const localCtrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const mergedSig = (localCtrl && signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function')
        ? AbortSignal.any([signal, localCtrl.signal])
        : (localCtrl ? localCtrl.signal : signal);
      let onExtAbort = null;
      if (localCtrl && signal && (!mergedSig || mergedSig === localCtrl.signal)) {
        if (signal.aborted) localCtrl.abort();
        else {
          onExtAbort = () => localCtrl.abort();
          signal.addEventListener('abort', onExtAbort, { once: true });
        }
      }

      const fetchAgg = (url, prov, timeout = 4500) => {
        if (!url) return Promise.resolve(null);
        return fetchJsonWithTimeout(url, { signal: mergedSig }, timeout).catch((err) => {
          if (!(localCtrl && localCtrl.signal.aborted) && err && (err.status === 403 || err.status === 429 || err.name === 'AbortError' || err.status >= 500)) {
            markAggCooldown(prov, err.status === 403 ? 10 * 60_000 : 120_000);
          }
          return null;
        });
      };

      try {
        const [kRes, pRes, oRes, lRes] = await raceWithGraceWindow(
          [
            fetchAgg(kyberUrl, `kyber:${key}`, 4500),
            fetchAgg(paraUrl, `paraswap:${key}`, 4500),
            fetchAgg(ooUrl, 'openocean', 4000),
            fetchAgg(lifiUrl, `lifi:${key}`, 4500)
          ],
          (v) => Boolean(
            v && (
              (v.code === 0 && v.data && v.data.routeSummary && v.data.routeSummary.amountOut) ||
              (v.priceRoute && v.priceRoute.destAmount) ||
              (Number(v.code) === 200 && v.data && v.data.outAmount) ||
              (v.estimate && v.estimate.toAmount)
            )
          ),
          1200,
          5000,
          localCtrl
        );

        const scaleArcOut = (rawOutStr) => {
          const b = BigInt(rawOutStr);
          if (arcDestNative && Number(destDecimals) === 18) return b * 1000000000000n;
          return b;
        };

        const candidates = [];
        const kRoute =
          kRes && kRes.status === 'fulfilled' && kRes.value && kRes.value.code === 0 && kRes.value.data && kRes.value.data.routeSummary
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
          pRes && pRes.status === 'fulfilled' && pRes.value && pRes.value.priceRoute && pRes.value.priceRoute.destAmount
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
          oRes && oRes.status === 'fulfilled' && oRes.value && Number(oRes.value.code) === 200 && oRes.value.data && oRes.value.data.outAmount
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
          lRes && lRes.status === 'fulfilled' && lRes.value && lRes.value.estimate && lRes.value.estimate.toAmount
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
          serviceFeeBps: bps,
          error: null
        };
      } finally {
        if (signal && onExtAbort) {
          try { signal.removeEventListener('abort', onExtAbort); } catch (_) {}
        }
      }
    });
  }

  function getOrderedHealthyEvmRpcs(chainKey) {
    const key = String(chainKey || '').toLowerCase();
    const cfg = EVM_CHAINS[key];
    if (!cfg) return [];
    const all = Array.isArray(cfg.rpcs) && cfg.rpcs.length > 0 ? cfg.rpcs : (cfg.rpc ? [cfg.rpc] : []);
    const now = Date.now();
    const healthy = all.filter((u) => !(_evmRpcCooldownUntil[u] > now));
    return healthy.length > 0 ? healthy : all;
  }

  function createEvmStaticProvider(cfg, rpcUrl, ethersLib) {
    const net = (ethersLib.Network && typeof ethersLib.Network.from === 'function')
      ? ethersLib.Network.from({ name: String(cfg.name || 'evm').toLowerCase(), chainId: cfg.chainId })
      : cfg.chainId;
    return new ethersLib.JsonRpcProvider(rpcUrl, net, { staticNetwork: true });
  }

  async function withEvmProviderFailover(chainKey, ethersLib, taskFn) {
    const cfg = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));
    const rpcs = getOrderedHealthyEvmRpcs(chainKey);
    let lastErr = null;
    for (const rpcUrl of rpcs) {
      const provider = createEvmStaticProvider(cfg, rpcUrl, ethersLib);
      try {
        return await taskFn(provider, cfg, rpcUrl);
      } catch (err) {
        lastErr = err;
        const msg = String((err && (err.shortMessage || err.message)) || '').toLowerCase();
        const isRevert = err && (err.code === 'CALL_EXCEPTION' || err.code === 'INSUFFICIENT_FUNDS' || err.code === 'NONCE_EXPIRED' || /reverted|insufficient funds|already known/i.test(msg));
        if (isRevert) throw err;
        _evmRpcCooldownUntil[rpcUrl] = Date.now() + 90_000;
      }
    }
    throw lastErr || new Error(t('EVM RPC 执行失败', 'EVM RPC execution failed'));
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

    const signAndBroadcastOne = async (txTo, txData, txVal) => {
      const valBig = BigInt(txVal || '0');
      const { unsignedTx, serialized } = await withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
        const [nonce, feeData, est] = await Promise.all([
          provider.getTransactionCount(fromAddr, 'pending'),
          provider.getFeeData(),
          provider.estimateGas({ from: fromAddr, to: txTo, data: txData, value: valBig }).catch(() => null)
        ]);
        const gasLimit = est !== null ? ((est * 125n) / 100n) : (txData && txData !== '0x' ? 350000n : 21000n);
        const useEip1559 = Boolean(feeData.maxFeePerGas);
        const maxFee = feeData.maxFeePerGas || 1000000000n;
        const prioFeeRaw = feeData.maxPriorityFeePerGas || (maxFee / 4n) || 1000000n;
        const prioFee = prioFeeRaw > maxFee ? maxFee : prioFeeRaw;
        const txFields = useEip1559
          ? {
              type: 2,
              chainId: cfg.chainId,
              nonce,
              to: txTo,
              data: txData || '0x',
              value: valBig,
              gasLimit,
              maxFeePerGas: maxFee,
              maxPriorityFeePerGas: prioFee
            }
          : {
              type: 0,
              chainId: cfg.chainId,
              nonce,
              to: txTo,
              data: txData || '0x',
              value: valBig,
              gasLimit,
              gasPrice: feeData.gasPrice || 1000000000n
            };
        const uTx = ethersLib.Transaction.from(txFields);
        const digestBytes = hexToBytes(uTx.unsignedHash.replace(/^0x/i, ''));
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
        uTx.signature = ethersLib.Signature.from({ r: `0x${rHex}`, s: `0x${sHex}`, yParity });
        if (uTx.from && uTx.from.toLowerCase() !== fromAddr.toLowerCase()) {
          throw new Error(t('MPC 签名恢复地址与发送地址不匹配', 'MPC signature recovered address mismatch'));
        }
        return { unsignedTx: uTx, serialized: uTx.serialized };
      });
      return withEvmProviderFailover(chainKey, ethersLib, (provider) => provider.broadcastTransaction(serialized));
    };

    if (approvalToken && approvalToken.toLowerCase() !== NATIVE_EVM_SENTINEL && spender && amountRaw) {
      const curAllow = await withEvmProviderFailover(chainKey, ethersLib, (provider) => {
        const erc20 = new ethersLib.Contract(
          approvalToken,
          ['function allowance(address owner, address spender) view returns (uint256)'],
          provider
        );
        return erc20.allowance(fromAddr, spender);
      });
      if (curAllow < BigInt(amountRaw)) {
        const approveIface = new ethersLib.Interface(['function approve(address spender, uint256 amount) returns (bool)']);
        if (curAllow > 0n) {
          const resetData = approveIface.encodeFunctionData('approve', [spender, '0']);
          const resetResp = await signAndBroadcastOne(approvalToken, resetData, '0');
          await resetResp.wait(1).catch(() => waitForEvmTxConfirmation(chainKey, resetResp.hash, 45000));
        }
        const approveData = approveIface.encodeFunctionData('approve', [spender, amountRaw]);
        const appResp = await signAndBroadcastOne(approvalToken, approveData, '0');
        await appResp.wait(1).catch(() => waitForEvmTxConfirmation(chainKey, appResp.hash, 45000));
      }
    }

    const txResp = await signAndBroadcastOne(to, data, value);
    return {
      txHash: txResp.hash,
      explorerUrl: `${cfg.explorer}${txResp.hash}`
    };
  }

  async function signEvmTypedDataUnified({ wallet, domain, types, value, path = 'ethereum-1' } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const resolvedWallet = await ensureWalletSigningKeysAsync(wallet);
    const cleanTypes = {};
    for (const [k, v] of Object.entries(types || {})) {
      if (k !== 'EIP712Domain') cleanTypes[k] = v;
    }
    if (resolvedWallet.evmPrivateKey) {
      const signer = new ethersLib.Wallet(resolvedWallet.evmPrivateKey);
      const rawSig = await signer.signTypedData(domain, cleanTypes, value);
      const sig = ethersLib.Signature.from(rawSig);
      return {
        signature: sig.serialized,
        r: sig.r,
        s: sig.s,
        v: sig.v,
        yParity: sig.yParity,
        signerAddress: signer.address,
        mode: 'local'
      };
    }
    const fromAddr = resolvedWallet.mpcEvmAddress || resolvedWallet.evmAddress;
    if (!fromAddr) throw new Error(t('MPC EVM 地址不可用', 'MPC EVM address unavailable'));
    const digestHex = ethersLib.TypedDataEncoder.hash(domain, cleanTypes, value);
    const digestBytes = hexToBytes(digestHex.replace(/^0x/i, ''));
    const mpcRes = await api.requestNearMpcChainSignature({
      wallet: resolvedWallet,
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
    const yParityRaw = Number(sigObj.recovery_id || 0) & 1;
    let sig = ethersLib.Signature.from({ r: `0x${rHex}`, s: `0x${sHex}`, yParity: yParityRaw });
    let recovered = ethersLib.verifyTypedData(domain, cleanTypes, value, sig.serialized);
    if (recovered.toLowerCase() !== fromAddr.toLowerCase()) {
      const altSig = ethersLib.Signature.from({ r: `0x${rHex}`, s: `0x${sHex}`, yParity: yParityRaw ^ 1 });
      const altRecovered = ethersLib.verifyTypedData(domain, cleanTypes, value, altSig.serialized);
      if (altRecovered.toLowerCase() === fromAddr.toLowerCase()) {
        sig = altSig;
        recovered = altRecovered;
      } else {
        throw new Error(t('MPC 签名恢复地址与发送地址不匹配', 'MPC signature recovered address mismatch'));
      }
    }
    return {
      signature: sig.serialized,
      r: sig.r,
      s: sig.s,
      v: sig.v,
      yParity: sig.yParity,
      signerAddress: recovered,
      mode: 'mpc'
    };
  }

  async function sendEvmSignedTransaction({ chainKey, privateKey, to, data = '0x', value = '0', approvalToken = null, spender = null, amountRaw = null }) {
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const cfg = EVM_CHAINS[String(chainKey || '').toLowerCase()];
    if (!cfg) throw new Error(t(`不支持的 EVM 链: ${chainKey}`, `Unsupported EVM chain: ${chainKey}`));

    return withEvmProviderFailover(chainKey, ethersLib, async (provider) => {
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
          if (curAllow > 0n) {
            const resetTx = await erc20.approve(spender, '0');
            await resetTx.wait(1).catch(() => waitForEvmTxConfirmation(chainKey, resetTx.hash, 45000));
          }
          const approveTx = await erc20.approve(spender, amountRaw);
          await approveTx.wait(1).catch(() => waitForEvmTxConfirmation(chainKey, approveTx.hash, 45000));
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
    });
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
    feeBps = 0,
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
      const bps = feeBps !== undefined && feeBps !== null && Number.isFinite(Number(feeBps)) ? Math.max(0, Math.round(Number(feeBps))) : 0;
      const paraPayload = {
        srcToken,
        destToken,
        srcAmount: String(amountRaw),
        priceRoute: routeData,
        userAddress: wallet.evmAddress,
        slippage: Number(slippageBps) || 100
      };
      if (bps > 0 && feeReceiver) {
        paraPayload.partner = 'pearlwallet';
        paraPayload.partnerAddress = feeReceiver;
        paraPayload.partnerFeeBps = bps;
      }
      const pBuild = await fetchJsonWithTimeout(
        `https://api.paraswap.io/transactions/${cfg.chainId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paraPayload)
        },
        12000
      );
      if (!pBuild || !pBuild.to || !pBuild.data) {
        throw new Error((pBuild && pBuild.error) || t('ParaSwap 交易构建失败', 'ParaSwap build failed'));
      }
      toAddr = pBuild.to;
      txData = pBuild.data;
      txVal = pBuild.value || '0';
      spenderAddr = (routeData && routeData.tokenTransferProxy) || toAddr;
    } else if (routeSource === 'openocean' && cfg.openOcean) {
      const ooHuman = fromBaseUnits(String(amountRaw), srcDecimals);
      const ooSlip = ((Number(slippageBps) || 100) / 100).toFixed(2);
      const ooBuild = await fetchJsonWithTimeout(
        `${OPENOCEAN_API_URL}/${cfg.openOcean}/swap?inTokenAddress=${encodeURIComponent(srcToken)}&outTokenAddress=${encodeURIComponent(destToken)}&amount=${encodeURIComponent(ooHuman)}&slippage=${ooSlip}&account=${encodeURIComponent(wallet.evmAddress)}`,
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

    const execQueue = [];
    for (const step of steps) {
      if (step && Array.isArray(step.items) && step.items.length > 0) {
        for (const item of step.items) {
          const itemData = item && item.data ? item.data : item;
          if (itemData && itemData.to && itemData.data) execQueue.push(itemData);
        }
      } else if (step && step.to && step.data) {
        execQueue.push(step);
      }
    }
    if (execQueue.length === 0) throw new Error(t('未执行任何链上交易步骤', 'No executable EVM step found'));

    let lastRes = null;
    for (let i = 0; i < execQueue.length; i++) {
      const itemData = execQueue[i];
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
      if (i + 1 < execQueue.length && lastRes && lastRes.txHash) {
        await waitForEvmTxConfirmation(targetKey, lastRes.txHash, 45000).catch(() => null);
      }
    }
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

    await ensureWalletSigningKeysAsync(wallet);
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
      return { accountId: '', publicKeyStr: '', privateKeyStr: '' };
    }
    const accountId = String(wallet.nearNamedAccount || wallet.nearAddress || '').trim();
    return {
      accountId,
      publicKeyStr: String(wallet.nearPublicKey || '').trim(),
      privateKeyStr: String(wallet.nearPrivateKey || '').trim()
    };
  }

  async function nearRpcPostAsync(payload, timeoutMs = 8000, signal = null) {
    const now = Date.now();
    const activeUrls = NEAR_RPC_ENDPOINTS.filter((u) => !(_nearRpc429Until[u] > now));
    const ordered = activeUrls.length > 0 ? activeUrls : NEAR_RPC_ENDPOINTS;
    let lastErr = null;
    for (const url of ordered) {
      if (signal && signal.aborted) break;
      try {
        const res = await fetchJsonWithTimeout(
          url,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal
          },
          timeoutMs
        );
        if (res && typeof res === 'object') {
          if (res.result !== undefined) return res;
          if (res.error !== undefined) {
            const errStr = JSON.stringify(res.error);
            if (/UNKNOWN_ACCOUNT|MethodNotFound|ExecutionError|ContractExecutionError|AccountDoesNotExist|HostError/i.test(errStr)) {
              return res;
            }
            if (/rate|limit|429|timeout|unavailable/i.test(errStr)) {
              _nearRpc429Until[url] = Date.now() + 90_000;
              lastErr = new Error(res.error.message || errStr);
              continue;
            }
            return res;
          }
        }
        _nearRpc429Until[url] = Date.now() + 30_000;
      } catch (err) {
        if (signal && signal.aborted) throw err;
        if (shouldCooldownRpcError(err)) {
          _nearRpc429Until[url] = Date.now() + 90_000;
        }
        lastErr = err;
      }
    }
    throw lastErr || new Error(t('NEAR RPC 网络请求失败', 'NEAR RPC request failed'));
  }

  function encodeNearPublicKeyBorsh(publicKeyStr) {
    const raw = String(publicKeyStr || '').trim();
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

  function extractNearOutcomeFailure(result) {
    if (!result || typeof result !== 'object') return null;
    if (result.status && result.status.Failure) return JSON.stringify(result.status.Failure);
    const receipts = Array.isArray(result.receipts_outcome) ? result.receipts_outcome : [];
    for (const r of receipts) {
      if (r && r.outcome && r.outcome.status && r.outcome.status.Failure) {
        return JSON.stringify(r.outcome.status.Failure);
      }
    }
    return null;
  }

  async function buildSignAndBroadcastNearActionsWithOutcome({ accountId, publicKeyStr, privateKeyStr, receiverId, actionsBytes, actionCount = 1 }) {
    if (!accountId || !publicKeyStr || !privateKeyStr || !receiverId) {
      throw new Error(t('缺少 NEAR 交易签名参数', 'Missing NEAR transaction signing parameters'));
    }
    const cryptoEngine = getCryptoEngine();
    if (!cryptoEngine || typeof cryptoEngine.ed25519SignAsync !== 'function') {
      throw new Error(t('Ed25519 签名引擎不可用', 'NearCACrypto.ed25519SignAsync unavailable'));
    }

    const akRes = await nearRpcPostAsync(
      {
        jsonrpc: '2.0',
        id: 'ak',
        method: 'query',
        params: {
          request_type: 'view_access_key',
          finality: 'final',
          account_id: accountId,
          public_key: publicKeyStr
        }
      },
      8000
    );

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
    const seedHex = extractNearEd25519SeedHex(privateKeyStr);
    const sig = await cryptoEngine.ed25519SignAsync(txHashBytes, seedHex);
    const signedTxBytes = concatUint8Arrays([txBytes, new Uint8Array([0]), sig]);
    const signedB64 = bytesToBase64(signedTxBytes);
    const expectedTxHash = base58Encode(txHashBytes);

    let txRes = null;
    try {
      txRes = await nearRpcPostAsync(
        {
          jsonrpc: '2.0',
          id: 'tx',
          method: 'broadcast_tx_commit',
          params: [signedB64]
        },
        18000
      );
    } catch (broadcastErr) {
      const bMsg = String((broadcastErr && broadcastErr.message) || '');
      const isTimeoutLike =
        (broadcastErr && (broadcastErr.name === 'AbortError' || broadcastErr.status === 408 || broadcastErr.status === 504)) ||
        /timeout|timed out|abort|504|408|network/i.test(bMsg);
      if (isTimeoutLike && expectedTxHash) {
        for (let attempt = 0; attempt < 6; attempt++) {
          const checkRes = await nearRpcPostAsync(
            {
              jsonrpc: '2.0',
              id: `tx-status-${attempt}`,
              method: 'EXPERIMENTAL_tx_status',
              params: [expectedTxHash, accountId]
            },
            6000
          ).catch(() => null);
          const st = checkRes && checkRes.result && checkRes.result.status;
          const isFinal = Boolean(st && (st.SuccessValue !== undefined || st.SuccessReceiptId !== undefined || st.Failure !== undefined));
          if (isFinal) {
            txRes = checkRes;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }
      }
      if (!txRes) throw broadcastErr;
    }

    if (!txRes || txRes.error) {
      throw new Error(
        (txRes && txRes.error && (txRes.error.data || txRes.error.message)) ||
          t('NEAR 交易广播失败', 'NEAR transaction broadcast failed')
      );
    }
    const receiptFailure = extractNearOutcomeFailure(txRes.result);
    if (receiptFailure) {
      throw new Error(receiptFailure);
    }
    const status = txRes.result && txRes.result.status;
    const txHash = (txRes.result && txRes.result.transaction && txRes.result.transaction.hash) || expectedTxHash || '';
    const outcome = {
      txHash,
      successValueB64: status && typeof status.SuccessValue === 'string' ? status.SuccessValue : null,
      result: txRes.result
    };
    api._lastNearOutcome = outcome;
    return outcome;
  }

  async function buildSignAndBroadcastNearActions(params = {}) {
    const out = await buildSignAndBroadcastNearActionsWithOutcome(params);
    return out.txHash;
  }

  async function _signAndSendNearFunctionCallWithOutcome({
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

    return buildSignAndBroadcastNearActionsWithOutcome({
      accountId,
      publicKeyStr,
      privateKeyStr,
      receiverId,
      actionsBytes: actionBytes
    });
  }

  async function signAndSendNearFunctionCall(params = {}) {
    const out = await _signAndSendNearFunctionCallWithOutcome(params);
    return out.txHash;
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
        const sbRes = await nearRpcPostAsync(
          {
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
          },
          6000
        );
        const rawBytes = sbRes && sbRes.result && sbRes.result.result;
        if (Array.isArray(rawBytes)) {
          const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(rawBytes)));
          if (decoded === null) {
            let minStorageYocto = '1250000000000000000000';
            try {
              const bounds = await viewNearContractCall(contract, 'storage_balance_bounds', {}).catch(() => null);
              if (bounds && bounds.min && /^\d+$/.test(String(bounds.min)) && BigInt(String(bounds.min)) > 0n) {
                minStorageYocto = String(bounds.min);
              }
            } catch (_) {}
            const creds = getWalletNearSignerCredentials(resolvedWallet);
            await api.signAndSendNearFunctionCall({
              accountId: sender,
              publicKeyStr: creds.publicKeyStr,
              privateKeyStr: creds.privateKeyStr,
              receiverId: contract,
              methodName: 'storage_deposit',
              argsJson: JSON.stringify({ account_id: dest, registration_only: true }),
              gas: '30000000000000',
              depositYocto: minStorageYocto
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
    const res = await nearRpcPostAsync(
      {
        jsonrpc: '2.0',
        id: 'ak-list',
        method: 'query',
        params: {
          request_type: 'view_access_key_list',
          finality: 'final',
          account_id: cleanId
        }
      },
      8000
    );
    if (!res || res.error || !res.result) {
      const errCause = res && res.error && res.error.cause ? String(res.error.cause.name || '') : '';
      const msg = (res && res.error && (res.error.data || res.error.message)) || '';
      if (errCause === 'UNKNOWN_ACCOUNT' || /does not exist|unknown account/i.test(String(msg))) {
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

  function buildDeleteAccountActionBytes({ beneficiaryId } = {}) {
    const beneficiary = String(beneficiaryId || '').trim().toLowerCase();
    if (!beneficiary) {
      throw new Error(t('缺少 DeleteAccount 受益账户', 'Missing DeleteAccount beneficiaryId'));
    }
    return concatUint8Arrays([
      new Uint8Array([7]), // Action::DeleteAccount
      encodeBorshString(beneficiary)
    ]);
  }

  async function checkNearAccountAvailability(accountId) {
    const domain = String(accountId || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,59}\.near$/.test(domain)) {
      throw new Error(t('请输入有效的 .near 域名（如 alice.near）', 'Enter a valid .near account ID (e.g. alice.near)'));
    }
    const res = await nearRpcPostAsync({
      jsonrpc: '2.0',
      id: 'avail-check',
      method: 'query',
      params: { request_type: 'view_account', finality: 'final', account_id: domain }
    }, 8000);
    if (res && res.result && res.result.amount !== undefined) {
      return { ok: true, available: false, exists: true, accountId: domain };
    }
    const errText = JSON.stringify(res?.error || '');
    if (/UNKNOWN_ACCOUNT|does not exist/i.test(errText)) {
      return { ok: true, available: true, exists: false, accountId: domain };
    }
    throw new Error(res?.error?.message || t('无法查询该账户状态', 'Failed to query account availability'));
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
    const resolvedTarget = String(targetPublicKeyStr || '').trim();
    if (!skipSafetyCheck) {
      const list = await fetchNearAccessKeysAsync(creds.accountId);
      const fullKeys = (list.keys || []).filter((k) => k && k.access_key && k.access_key.permission === 'FullAccess');
      const remainingFull = fullKeys.filter((k) => k.public_key !== resolvedTarget);
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

  async function rotateNearAccountKeyAsync({ wallet, newMnemonic, deleteOldKey = true } = {}) {
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

    const newDerived = await cryptoEngine.deriveNearFromSeedAsync(newMnemonic, 0);
    const newPubKey = newDerived.nearPublicKey;

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
      const delAction = buildDeleteKeyActionBytes({ targetPublicKeyStr: creds.publicKeyStr });
      deleteTxHash = await buildSignAndBroadcastNearActions({
        accountId: creds.accountId,
        publicKeyStr: newPubKey,
        privateKeyStr: newDerived.nearPrivateKey,
        receiverId: creds.accountId,
        actionsBytes: delAction
      });
    }

    return {
      addTxHash,
      deleteTxHash,
      newDerived,
      explorerUrl: `${NEAR_EXPLORER_TX}${deleteTxHash || addTxHash}`
    };
  }

  async function registerNearNamedAccountOnChain({
    implicitAccountId,
    publicKeyStr,
    privateKeyStr,
    newAccountId,
    availableBalanceNear = null,
    wallet = null,
    sweepImplicitToNamed = true
  } = {}) {
    const resolvedWallet = wallet ? await ensureWalletSigningKeysAsync(wallet) : null;
    const sender = implicitAccountId || (resolvedWallet && (resolvedWallet.nearNamedAccount || resolvedWallet.nearAddress));
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
        amount: 0.05,
        isNative: true,
        gasBuffer: 0.005
      });
    } else {
      const balRes = await nearRpcPostAsync(
        {
          jsonrpc: '2.0',
          id: 'reg-bal',
          method: 'query',
          params: { request_type: 'view_account', finality: 'final', account_id: sender }
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
        amount: 0.05,
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
      depositYocto: '50000000000000000000000' // 0.05 NEAR
    });

    let sweepTxHash = null;
    let sweptMode = 'create_only';
    let sweepError = '';
    const isImplicitSender = /^[0-9a-f]{64}$/i.test(String(sender || '').trim()) && sender.toLowerCase() !== domain;

    if (sweepImplicitToNamed !== false && isImplicitSender) {
      try {
        let domainExists = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const chk = await nearRpcPostAsync({
            jsonrpc: '2.0',
            id: `verify-dom-${attempt}`,
            method: 'query',
            params: { request_type: 'view_account', finality: 'final', account_id: domain }
          }, 5000).catch(() => null);
          if (chk && chk.result && chk.result.amount !== undefined) {
            domainExists = true;
            break;
          }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 50));
        }

        if (domainExists) {
          const localFtMap = (resolvedWallet && resolvedWallet.nearNep141Balances) || {};
          const hasLocalFt = Object.values(localFtMap).some((entry) => {
            if (!entry) return false;
            try {
              if (entry.raw && BigInt(String(entry.raw)) > 0n) return true;
            } catch (_) {}
            return Number(entry.formatted || 0) > 0;
          });

          let fastNearConfirmedZero = false;
          if (!hasLocalFt) {
            let fnTokens = null;
            let fnStatus = 0;
            try {
              const fnResp = await fetchJsonWithTimeout(
                `https://api.fastnear.com/v1/account/${encodeURIComponent(sender)}/ft`,
                {},
                4000
              );
              if (fnResp && Array.isArray(fnResp.tokens)) {
                fnTokens = fnResp.tokens;
              } else if (fnResp && fnResp.data && Array.isArray(fnResp.data.tokens)) {
                fnTokens = fnResp.data.tokens;
              } else if (fnResp && fnResp.status === 404) {
                fnStatus = 404;
              }
            } catch (fnErr) {
              fnStatus = Number((fnErr && fnErr.status) || 0);
            }
            if (Array.isArray(fnTokens)) {
              const anyFt = fnTokens.some((tok) => {
                if (!tok) return false;
                try { return BigInt(String(tok.balance || '0')) > 0n; } catch (_) { return true; }
              });
              fastNearConfirmedZero = !anyFt;
            } else if (fnStatus === 404) {
              fastNearConfirmedZero = true;
            }
          }

          if (!hasLocalFt && fastNearConfirmedZero) {
            const delAction = buildDeleteAccountActionBytes({ beneficiaryId: domain });
            sweepTxHash = await buildSignAndBroadcastNearActions({
              accountId: sender,
              publicKeyStr: pub,
              privateKeyStr: priv,
              receiverId: sender,
              actionsBytes: delAction
            });
            sweptMode = 'delete_account_full_sweep';
          } else {
            const remRes = await nearRpcPostAsync({
              jsonrpc: '2.0',
              id: 'sweep-rem',
              method: 'query',
              params: { request_type: 'view_account', finality: 'final', account_id: sender }
            }, 6000).catch(() => null);
            const remNear = remRes && remRes.result && remRes.result.amount !== undefined
              ? Number(fromBaseUnits(String(remRes.result.amount), 24))
              : 0;
            const sendable = Number((remNear - 0.005).toFixed(5));
            if (remNear > 0.015 && sendable > 0) {
              const txRes = await api.signAndSendNearTransfer({
                accountId: sender,
                publicKeyStr: pub,
                privateKeyStr: priv,
                receiverId: domain,
                amountNear: sendable,
                availableBalanceNear: remNear
              });
              sweepTxHash = txRes.txHash;
              sweptMode = 'transfer_kept_ft';
            } else {
              sweptMode = 'kept_ft_low_near';
            }
          }
        }
      } catch (err) {
        sweptMode = 'sweep_skipped';
        sweepError = err && err.message ? err.message : String(err || 'sweep failed');
      }
    }

    return {
      txHash,
      sweepTxHash,
      sweptMode,
      sweepError,
      accountId: domain,
      explorerUrl: `${NEAR_EXPLORER_TX}${sweepTxHash || txHash}`
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

    const useDirectOutcome = api.signAndSendNearFunctionCall === signAndSendNearFunctionCall;
    let txHash;
    let outcomeObj = null;
    if (useDirectOutcome) {
      outcomeObj = await _signAndSendNearFunctionCallWithOutcome({
        accountId,
        publicKeyStr: wallet.nearPublicKey,
        privateKeyStr: wallet.nearPrivateKey,
        receiverId: V1_SIGNER_CONTRACT,
        methodName: 'sign',
        argsJson: JSON.stringify(requestBody),
        gas: '250000000000000',
        depositYocto: String(depositYocto)
      });
      txHash = outcomeObj.txHash;
    } else {
      api._lastNearOutcome = null;
      txHash = await api.signAndSendNearFunctionCall({
        accountId,
        publicKeyStr: wallet.nearPublicKey,
        privateKeyStr: wallet.nearPrivateKey,
        receiverId: V1_SIGNER_CONTRACT,
        methodName: 'sign',
        argsJson: JSON.stringify(requestBody),
        gas: '250000000000000',
        depositYocto: String(depositYocto)
      });
      outcomeObj = api._lastNearOutcome && api._lastNearOutcome.txHash === txHash ? api._lastNearOutcome : null;
    }

    let mpcSignature = null;
    if (outcomeObj && outcomeObj.successValueB64) {
      mpcSignature = decodeSuccessValueJson(outcomeObj.successValueB64);
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
    const key = String(chainKey || '').toLowerCase();
    const chain = EVM_CHAINS[key];
    if (!chain || !to || !data) return null;
    const res = await callEvmRpc(
      key,
      {
        jsonrpc: '2.0',
        id: `eth_call_${chain.chainId}`,
        method: 'eth_call',
        params: [{ to, data }, 'latest']
      },
      timeoutMs
    ).catch(() => null);
    const hex = res && typeof res.result === 'string' ? res.result : null;
    return hex && hex !== '0x' ? hex : null;
  }

  let _llamaPoolsCache = { ts: 0, data: null };
  let _stakingMetricsCache = { ts: 0, pools: null };
  let _stakingMetricsInFlight = null;

  const RELEVANT_LLAMA_PROJECTS = new Set([
    'rhea-lst',
    'jito-liquid-staking',
    'jupiter-staked-sol',
    'marinade-liquid-staking',
    'sanctum-infinity',
    'lido',
    'aave-v3',
    'ethena-usde',
    'kinetiq-khype'
  ]);

  function filterAndSortLlamaPools(rawPools) {
    if (!Array.isArray(rawPools)) return [];
    const filtered = [];
    for (let i = 0; i < rawPools.length; i++) {
      const p = rawPools[i];
      if (!p) continue;
      const proj = String(p.project || '').toLowerCase();
      const ch = String(p.chain || '').toLowerCase();
      if (
        RELEVANT_LLAMA_PROJECTS.has(proj) ||
        ch === 'near' ||
        ch === 'arc' ||
        proj.includes('burrow') ||
        proj.includes('rhea-lend')
      ) {
        filtered.push(p);
      }
    }
    filtered.sort((a, b) => Number(b.tvlUsd || 0) - Number(a.tvlUsd || 0));
    return filtered;
  }

  /**
   * Fetches live APY and conversion rates across all staking/lending pools from real RPCs and protocol APIs.
   * Never populates fake values: keeps apy/rate as null when an upstream feed is unreachable.
   */
  async function fetchLiveStakingMetrics(opts = {}) {
    if (opts && opts.useCache === true && _stakingMetricsCache.pools && (Date.now() - _stakingMetricsCache.ts < 300_000)) {
      return _stakingMetricsCache.pools;
    }
    if (_stakingMetricsInFlight) {
      return _stakingMetricsInFlight;
    }
    _stakingMetricsInFlight = _runFetchLiveStakingMetrics(opts).finally(() => {
      _stakingMetricsInFlight = null;
    });
    return _stakingMetricsInFlight;
  }

  async function _runFetchLiveStakingMetrics(opts = {}) {
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

    const useCachedLlama = Boolean(opts && opts.useCache === true && Array.isArray(_llamaPoolsCache.data) && (Date.now() - _llamaPoolsCache.ts < 900_000));
    const llamaPromise = useCachedLlama
      ? Promise.resolve({ data: _llamaPoolsCache.data })
      : fetchJsonWithTimeout('https://yields.llama.fi/pools', {}, 7000);
    const fastSettledPromise = Promise.allSettled([
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
      fetchJsonWithTimeout('https://extra-api.sanctum.so/v1/sol-value/current?lst=INF&lst=jupSOL&lst=mSOL&lst=JitoSOL', {}, 6000),
      fetchJsonWithTimeout('https://kobe.mainnet.jito.network/api/v1/stake_pool_stats', {}, 6000),
      fetchJsonWithTimeout(
        `${JUPITER_API_URL}/quote?inputMint=${WSOL_MINT}&outputMint=J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn&amount=1000000000&slippageBps=50`,
        {},
        6000
      ),
      Promise.race([
        callSolanaRpc('getAccountInfo', ['CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN', { encoding: 'base64' }], 4000),
        new Promise((resolve) => setTimeout(() => resolve(null), 4000))
      ]),
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

    const fastResults = await fastSettledPromise;
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
    ] = fastResults;

    // If caller wants early render, notify once NEAR/Jito/Marinade/Blockscout RPCs are in while DeFiLlama finishes in parallel
    let earlyLlama = null;
    if (opts && typeof opts.onFastUpdate === 'function') {
      const probe = await Promise.race([
        llamaPromise.then((v) => ({ done: true, value: v })).catch(() => ({ done: true, value: null })),
        new Promise((resolve) => setTimeout(() => resolve({ done: false, value: null }), 120))
      ]);
      if (probe && probe.done) {
        earlyLlama = probe.value;
      } else {
        // Apply fast NEAR/Solana/Lido metrics first so UI shows numbers without waiting 4s for DeFiLlama JSON
        try {
          if (narRes.status === 'fulfilled' && narRes.value) {
            const m = narRes.value;
            const apy = Number(m.st_near_30_day_apy || m.st_near_7_day_apy);
            const price = Number(m.st_near_price);
            if (Number.isFinite(apy) && apy > 0) setPool('metapool_stnear', { apy: Number(apy.toFixed(2)) });
            if (Number.isFinite(price) && price > 0) setPool('metapool_stnear', { rate: 1 / price });
            const linApy = Number(m.linear_30_day_apy || m.linear_3_day_apy);
            if (Number.isFinite(linApy) && linApy > 0) setPool('linear_near', { apy: Number(linApy.toFixed(2)) });
          }
          if (rnearApyRes.status === 'fulfilled' && rnearApyRes.value && rnearApyRes.value.data !== undefined) {
            const num = Number(rnearApyRes.value.data);
            if (Number.isFinite(num) && num > 0) setPool('rhea_rnear', { apy: Number(num.toFixed(2)) });
          }
          if (jitoApyRes.status === 'fulfilled' && jitoApyRes.value && Array.isArray(jitoApyRes.value.apy) && jitoApyRes.value.apy.length > 0) {
            const latestApy = Number(jitoApyRes.value.apy[jitoApyRes.value.apy.length - 1].data) * 100;
            if (Number.isFinite(latestApy) && latestApy > 0 && latestApy < 50) {
              setPool('jito_sol', { apy: Number(latestApy.toFixed(2)) });
            }
          }
          opts.onFastUpdate(STAKING_POOLS);
        } catch (_) {}
      }
    }

    let llamaPools = [];
    try {
      const llamaRaw = earlyLlama || (await llamaPromise);
      if (llamaRaw && Array.isArray(llamaRaw.data)) {
        llamaPools = useCachedLlama ? llamaRaw.data : filterAndSortLlamaPools(llamaRaw.data);
      }
    } catch (_) {
      llamaPools = [];
    }
    if (!useCachedLlama && llamaPools.length > 0) {
      _llamaPoolsCache = { ts: Date.now(), data: llamaPools };
    }
    const findLlamaPool = (predicate) => {
      for (let i = 0; i < llamaPools.length; i++) {
        const p = llamaPools[i];
        if (p && predicate(p)) return p; // already sorted descending by tvlUsd
      }
      return null;
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
          apy: null
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
    const nearxApy = findLlamaApy((p) => String(p.chain || '').toLowerCase() === 'near' && /nearx/i.test(String(p.symbol || '')));
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
    // Active Staking Rewards (ASR) official pool: 50M JUP/quarter (200M JUP/yr) allocated by locked JUP share
    if (jupLockerRes.status === 'fulfilled' && jupLockerRes.value && jupLockerRes.value.value?.data?.[0]) {
      try {
        const buf = base64ToBytes(String(jupLockerRes.value.value.data[0]));
        if (buf.length >= 81) {
          const lockedRaw = decodeU64LE(buf, 73);
          const lockedJup = Number(lockedRaw) / 1e6;
          if (Number.isFinite(lockedJup) && lockedJup > 0) {
            const tvlText = formatTvlToken(lockedJup, 'JUP');
            const rawAsrApy = (200_000_000 / lockedJup) * 100;
            const asrApy = Number.isFinite(rawAsrApy) && rawAsrApy > 0
              ? Number(rawAsrApy.toFixed(2))
              : null;
            setPool('jupiter_jup', { rate: 1.0, apy: asrApy, isAsrEstimated: true, tvlText, tvlTokenAmount: lockedJup });
          }
        }
      } catch (_) {}
    } else {
      setPool('jupiter_jup', { rate: 1.0, apy: null, isAsrEstimated: false });
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
        const res = await nearRpcPostAsync(
          {
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
          },
          4000
        ).catch(() => null);
        const bytes = res && res.result && res.result.result;
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
        const minNearGas = (pool.isBurrowSupply || pool.id === 'rhea_xrhea') ? 0.12 : 0.05;
        if (nearGasAvail < minNearGas) {
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
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library ethers unavailable'));
    const evmSender = resolveWalletEvmSender(wallet, ethersLib);

    const sendEvmContractCall = async ({ chainKey, to, data, value = '0', approvalToken = null, spender = null, approvalAmount = null }) => {
      return wallet.evmPrivateKey
        ? sendEvmSignedTransaction({ chainKey, privateKey: wallet.evmPrivateKey, to, data, value, approvalToken, spender, amountRaw: approvalAmount })
        : sendEvmMpcSignedTransaction({ wallet, chainKey, to, data, value, approvalToken, spender, amountRaw: approvalAmount, path: 'ethereum-1' });
    };

    let res;
    if (pool.isKyberSwapStake) {
      const amountRaw = toBaseUnits(amount, pool.decimals || 18);
      const q = await quoteEvmDexSwap({
        chainKey: pool.chain,
        srcToken: NATIVE_EVM_SENTINEL,
        destToken: pool.contract,
        amountRaw,
        srcDecimals: 18,
        destDecimals: 18,
        slippageBps,
        feeBps: 0
      });
      if (!q || !q.ok) throw new Error((q && q.error) || t('HyperEVM 质押报价失败', 'HyperEVM staking quote failed'));
      res = await executeEvmDexSwap({
        wallet,
        chainKey: pool.chain,
        routeSource: q.routeSource,
        routeData: q.routeData,
        srcToken: NATIVE_EVM_SENTINEL,
        destToken: pool.contract,
        amountRaw,
        srcDecimals: 18,
        slippageBps,
        feeBps: 0
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
            const wrapRes = await sendEvmContractCall({
              chainKey: pool.chain,
              to: pool.tokenContract,
              data: '0xd0e30db0', // WETH9.deposit()
              value: shortfallWei
            });
            if (wrapRes && wrapRes.txHash) {
              await waitForEvmTxConfirmation(pool.chain, wrapRes.txHash, 45000);
            }
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
      const valueWei = toBaseUnits(amount, pool.decimals || 18);
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

  async function viewNearContractCall(contractId, methodName, argsObj, signal = null) {
    const res = await nearRpcPostAsync(
      {
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
      },
      5000,
      signal
    ).catch(() => null);
    const bytes = res && res.result && res.result.result;
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
    slippageBps = 100,
    signal = null
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
          }, signal).catch(() => null);
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
        serviceFeeBps: 0,
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

  const _refV2PoolIdCache = new Map();

  async function resolveKnownOrApiRefV2PoolId(tA, tB, allowApiLookup = true, signal = null) {
    if (!tA || !tB || tA === tB) return null;
    const sortedKey = [tA, tB].sort().join('|');
    if (KNOWN_REF_V2_POOLS[sortedKey] !== undefined) return KNOWN_REF_V2_POOLS[sortedKey];
    if (!allowApiLookup) return null;
    const cached = _refV2PoolIdCache.get(sortedKey);
    if (cached && (Date.now() - cached.ts < 300_000)) {
      return cached.id;
    }
    try {
      const url = `https://api.ref.finance/list-pools-by-tokens?token0=${encodeURIComponent(tA)}&token1=${encodeURIComponent(tB)}`;
      const res = await fetchJsonWithTimeout(url, signal ? { signal } : {}, 5000).catch(() => null);
      if (!Array.isArray(res) || res.length === 0) return null;
      const sorted = [...res].sort((a, b) => Number(b.tvl || 0) - Number(a.tvl || 0));
      const topId = Number(sorted[0]?.id);
      const validId = Number.isFinite(topId) && topId >= 0 ? topId : null;
      if (validId !== null) _refV2PoolIdCache.set(sortedKey, { id: validId, ts: Date.now() });
      return validId;
    } catch (_) {
      return null;
    }
  }

  async function quoteDirectRefV2SingleHop(poolId, inId, outId, amtStr, slippageBps, signal = null) {
    if (poolId === null || poolId === undefined) return null;
    const retStr = await viewNearContractCall(REF_FINANCE_CONTRACT, 'get_return', {
      pool_id: Number(poolId),
      token_in: inId,
      amount_in: String(amtStr),
      token_out: outId
    }, signal).catch(() => null);
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
      serviceFeeBps: 0,
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
    slippageBps = 100,
    signal = null
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

    const slipVal = Number(slippageBps) || 100;
    const refCacheKey = `nearRef:${inId}:${outId}:${amtStr}:${slipVal}`;
    return withQuoteCacheAndDedup(refCacheKey, 10_000, async () => {
      const slippageDec = (Math.max(1, slipVal) / 10000).toFixed(4);
      const url = `${REF_SMART_ROUTER_URL}?amountIn=${encodeURIComponent(amtStr)}&tokenIn=${encodeURIComponent(inId)}&tokenOut=${encodeURIComponent(outId)}&pathDeep=3&slippage=${slippageDec}`;

      const knownPoolId = await resolveKnownOrApiRefV2PoolId(inId, outId, false, signal);
      const hasDclPool = resolveNearDclPoolIds(inId, outId).length > 0;
      const stage1Ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const mergedSig = (stage1Ctrl && signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function')
        ? AbortSignal.any([signal, stage1Ctrl.signal])
        : (stage1Ctrl ? stage1Ctrl.signal : signal);
      let onExtAbort = null;
      if (stage1Ctrl && signal && (!mergedSig || mergedSig === stage1Ctrl.signal)) {
        if (signal.aborted) stage1Ctrl.abort();
        else {
          onExtAbort = () => stage1Ctrl.abort();
          signal.addEventListener('abort', onExtAbort, { once: true });
        }
      }

      try {
        const smartRouterPromise = fetchJsonWithTimeout(url, { signal: mergedSig }, 5000).catch(() => null);
        const directKnownPromise = knownPoolId !== null
          ? quoteDirectRefV2SingleHop(knownPoolId, inId, outId, amtStr, slipVal, mergedSig).catch(() => null)
          : Promise.resolve(null);
        const dclStage1Promise = hasDclPool
          ? quoteNearDclPoolSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps: slipVal, signal: mergedSig }).catch(() => null)
          : Promise.resolve(null);

        const parseSmartRouter = (data) => {
          if (!data || Number(data.result_code) !== 0 || !data.result_data) return null;
          const rData = data.result_data;
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
            return {
              ok: true,
              label: 'Ref Finance (v2.ref-finance.near)',
              routeSource: 'Ref Finance',
              contractId: REF_FINANCE_CONTRACT,
              tokenIn: inId,
              tokenOut: outId,
              amountIn: amtStr,
              amountOut,
              minAmountOut: String(routes[0]?.min_amount_out || '0'),
              serviceFeeBps: 0,
              actions,
              routeData: rData,
              error: null
            };
          }
          return null;
        };

        const [srRace, dirRace, dclRace] = await raceWithGraceWindow(
          [smartRouterPromise, directKnownPromise, dclStage1Promise],
          (v) => Boolean(v && ((v.ok && v.amountOut) || parseSmartRouter(v))),
          1500,
          5500,
          stage1Ctrl
        );

        const srData = srRace && srRace.status === 'fulfilled' ? srRace.value : null;
        const smartRouterBest = parseSmartRouter(srData);
        const directKnownRes = dirRace && dirRace.status === 'fulfilled' ? dirRace.value : null;
        const dclStage1Res = dclRace && dclRace.status === 'fulfilled' ? dclRace.value : null;

        // Stage 1 fast-path: if SmartRouter OR direct known/DCL returned a valid route, pick highest and skip waterfalls.
        const stage1Candidates = [smartRouterBest, directKnownRes, dclStage1Res].filter((c) => c && c.ok && c.amountOut);
        if (stage1Candidates.length > 0) {
          stage1Candidates.sort((a, b) => {
            const x = BigInt(a.amountOut);
            const y = BigInt(b.amountOut);
            return y > x ? 1 : (y < x ? -1 : 0);
          });
          return { serviceFeeBps: 0, ...stage1Candidates[0] };
        }

        // Fallback when SmartRouter failed: explore dynamic pool + 2-hop + 3-hop + DCL.
        const refCandidates = [...stage1Candidates];

        if (knownPoolId === null && !(signal && signal.aborted)) {
          const apiPoolId = await resolveKnownOrApiRefV2PoolId(inId, outId, true, signal);
          if (apiPoolId !== null) {
            const dynRes = await quoteDirectRefV2SingleHop(apiPoolId, inId, outId, amtStr, slipVal, signal).catch(() => null);
            if (dynRes) refCandidates.push(dynRes);
          }
        }

        const hubs = ['token.rhealab.near', WRAP_NEAR_CONTRACT, NEAR_USDC_CONTRACT_REF];
        const twoHopResults = (signal && signal.aborted)
          ? []
          : await Promise.all(hubs.map(async (mid) => {
              if (mid === inId || mid === outId) return null;
              try {
                const [pid1, pid2] = await Promise.all([
                  resolveKnownOrApiRefV2PoolId(inId, mid, true, signal),
                  resolveKnownOrApiRefV2PoolId(mid, outId, true, signal)
                ]);
                if (pid1 === null || pid2 === null) return null;
                const hop1 = await quoteDirectRefV2SingleHop(pid1, inId, mid, amtStr, slipVal, signal);
                if (!hop1) return null;
                const hop2 = await quoteDirectRefV2SingleHop(pid2, mid, outId, hop1.amountOut, slipVal, signal);
                if (!hop2) return null;
                const actions = [
                  { pool_id: Number(pid1), token_in: inId, token_out: mid, amount_in: amtStr, min_amount_out: '0' },
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
        if (!(signal && signal.aborted)) {
          for (const h1 of hubs) {
            for (const h2 of hubs) {
              if (h1 === h2 || h1 === inId || h1 === outId || h2 === inId || h2 === outId) continue;
              threeHopJobs.push((async () => {
                try {
                  const [p1, p2, p3] = await Promise.all([
                    resolveKnownOrApiRefV2PoolId(inId, h1, false, signal),
                    resolveKnownOrApiRefV2PoolId(h1, h2, false, signal),
                    resolveKnownOrApiRefV2PoolId(h2, outId, false, signal)
                  ]);
                  if (p1 === null || p2 === null || p3 === null) return null;
                  const q1 = await quoteDirectRefV2SingleHop(p1, inId, h1, amtStr, slipVal, signal);
                  if (!q1) return null;
                  const q2 = await quoteDirectRefV2SingleHop(p2, h1, h2, q1.amountOut, slipVal, signal);
                  if (!q2) return null;
                  const q3 = await quoteDirectRefV2SingleHop(p3, h2, outId, q2.amountOut, slipVal, signal);
                  if (!q3) return null;
                  const actions = [
                    { pool_id: Number(p1), token_in: inId, token_out: h1, amount_in: amtStr, min_amount_out: '0' },
                    { pool_id: Number(p2), token_in: h1, token_out: h2, min_amount_out: '0' },
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
        }
        (await Promise.all(threeHopJobs)).forEach((r) => { if (r) refCandidates.push(r); });

        if (refCandidates.length > 0) {
          refCandidates.sort((a, b) => {
            const x = BigInt(a.amountOut);
            const y = BigInt(b.amountOut);
            return y > x ? 1 : (y < x ? -1 : 0);
          });
          return { serviceFeeBps: 0, ...refCandidates[0] };
        }
        if (hasDclPool) {
          const dclFallback = await quoteNearDclPoolSwap({ tokenIn: inId, tokenOut: outId, amountRaw: amtStr, slippageBps: slipVal, signal }).catch(() => null);
          if (dclFallback && dclFallback.ok) return dclFallback;
        }

        return {
          ok: false,
          label: 'Ref Finance',
          amountOut: null,
          actions: [],
          routeData: null,
          error: (srData && srData.result_message) || t('Ref Finance 暂无可用流动性路径', 'No Ref Finance liquidity route found')
        };
      } finally {
        if (signal && onExtAbort) {
          try { signal.removeEventListener('abort', onExtAbort); } catch (_) {}
        }
      }
    });
  }

  async function ensureNearNep141StorageRegistered({ resolvedWallet, accountId, tokenContract } = {}) {
    const acct = String(accountId || '').trim();
    const cid = String(tokenContract || '').trim();
    if (!resolvedWallet || !acct || !cid || cid.toLowerCase() === 'near') return false;
    try {
      const sBal = await viewNearContractCall(cid, 'storage_balance_of', { account_id: acct });
      if (sBal && typeof sBal === 'object' && BigInt(String(sBal.total || '0')) > 0n) {
        return true;
      }
    } catch (_) {}

    let depositYocto = '1250000000000000000000';
    try {
      const minBal = await viewNearContractCall(cid, 'storage_minimum_balance', {});
      const minStr = minBal && typeof minBal === 'object' ? (minBal.min ?? minBal.minimum ?? null) : minBal;
      if (minStr !== null && minStr !== undefined && /^\d+$/.test(String(minStr))) {
        const minBig = BigInt(String(minStr));
        const maxCap = 50_000_000_000_000_000_000_000n; // 0.05 NEAR safety cap
        if (minBig > 0n) {
          depositYocto = (minBig <= maxCap ? minBig : maxCap).toString();
        }
      }
    } catch (_) {}

    await api.signAndSendNearFunctionCall({
      accountId: acct,
      publicKeyStr: resolvedWallet.nearPublicKey,
      privateKeyStr: resolvedWallet.nearPrivateKey,
      receiverId: cid,
      methodName: 'storage_deposit',
      argsJson: JSON.stringify({ account_id: acct, registration_only: true }),
      gas: '30000000000000',
      depositYocto
    });
    return true;
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
        await ensureNearNep141StorageRegistered({
          resolvedWallet,
          accountId: sender,
          tokenContract: WRAP_NEAR_CONTRACT
        }).catch(() => {});
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

    await ensureNearNep141StorageRegistered({
      resolvedWallet,
      accountId: sender,
      tokenContract: outId
    }).catch(() => {});
  }

  const DEFAULT_NEAR_STORAGE_SCAN_CONTRACTS = [
    'wrap.near',
    'token.rhealab.near',
    'xtoken.rhealab.near',
    'otoken.rhealab.near',
    'lst.rhealab.near',
    'prl.omft.near',
    'qtc.omft.near',
    'usdt.tether-token.near',
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1',
    'eth.omft.near',
    'sol.omft.near',
    'btc.omft.near',
    'meta-pool.near',
    'linear-protocol.near',
    'v2-nearx.stader-labs.near'
  ];

  const KNOWN_NEAR_STORAGE_META = {
    'wrap.near': { symbol: 'wNEAR', decimals: 24 },
    'token.rhealab.near': { symbol: 'RHEA', decimals: 18 },
    'xtoken.rhealab.near': { symbol: 'xRHEA', decimals: 18 },
    'otoken.rhealab.near': { symbol: 'oRHEA', decimals: 18 },
    'lst.rhealab.near': { symbol: 'rNEAR', decimals: 24 },
    'prl.omft.near': { symbol: 'PRL', decimals: 8 },
    'qtc.omft.near': { symbol: 'QTC', decimals: 12 },
    'usdt.tether-token.near': { symbol: 'USDT', decimals: 6 },
    '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1': { symbol: 'USDC', decimals: 6 },
    'eth.omft.near': { symbol: 'ETH', decimals: 18 },
    'sol.omft.near': { symbol: 'SOL', decimals: 9 },
    'btc.omft.near': { symbol: 'BTC', decimals: 8 },
    'meta-pool.near': { symbol: 'stNEAR', decimals: 24 },
    'linear-protocol.near': { symbol: 'LiNEAR', decimals: 24 },
    'v2-nearx.stader-labs.near': { symbol: 'NearX', decimals: 24 }
  };

  /**
   * Scans NEP-141 token contracts on NEAR Mainnet for locked NEP-145 storage deposits (`storage_balance_of`)
   * and distinguishes empty accounts (`ft_balance_of === 0`, safe to unregister and reclaim) from held positions.
   */
  async function scanNearReclaimableStorageAsync(nearAccountId) {
    const acct = String(nearAccountId || '').trim().toLowerCase();
    if (!acct) throw new Error(t('NEAR 账户地址不可用', 'NEAR account address unavailable'));

    const candidateSet = new Set(DEFAULT_NEAR_STORAGE_SCAN_CONTRACTS);
    const fnResp = await fetchJsonWithTimeout(`https://api.fastnear.com/v1/account/${encodeURIComponent(acct)}/ft`, {}, 4000).catch(() => null);
    const fnList = (fnResp && Array.isArray(fnResp.tokens))
      ? fnResp.tokens
      : (fnResp && fnResp.data && Array.isArray(fnResp.data.tokens) ? fnResp.data.tokens : null);
    if (fnList) {
      for (const tok of fnList) {
        if (tok && tok.contract_id) {
          const cid = String(tok.contract_id).trim().toLowerCase();
          if (cid && cid !== 'near') candidateSet.add(cid);
        }
      }
    }

    const candidates = Array.from(candidateSet).slice(0, 25);
    const registry = (typeof globalThis !== 'undefined' && globalThis.NearCATokens) || (typeof window !== 'undefined' && window.NearCATokens) || null;
    const nearDexTokens = (registry && registry.DEX_CHAIN_TOKENS && Array.isArray(registry.DEX_CHAIN_TOKENS.near))
      ? registry.DEX_CHAIN_TOKENS.near
      : [];

    const resolveMeta = (cid) => {
      if (KNOWN_NEAR_STORAGE_META[cid]) return KNOWN_NEAR_STORAGE_META[cid];
      const dexMatch = nearDexTokens.find((tk) => tk && String(tk.contractAddress || '').toLowerCase() === cid);
      if (dexMatch) return { symbol: dexMatch.symbol, decimals: typeof dexMatch.decimals === 'number' ? dexMatch.decimals : 18 };
      if (registry && typeof registry.findTokenByAssetId === 'function') {
        const regMatch = registry.findTokenByAssetId(`nep141:${cid}`, 'near');
        if (regMatch) return { symbol: regMatch.symbol, decimals: typeof regMatch.decimals === 'number' ? regMatch.decimals : 18 };
      }
      return { symbol: (cid.split('.')[0] || cid).toUpperCase(), decimals: 18 };
    };

    const accounts = [];
    const concurrency = 6;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const idx = cursor++;
        const cid = candidates[idx];
        const [storageBal, ftBal] = await Promise.all([
          viewNearContractCall(cid, 'storage_balance_of', { account_id: acct }).catch(() => null),
          viewNearContractCall(cid, 'ft_balance_of', { account_id: acct }).catch(() => null)
        ]);
        if (!storageBal || typeof storageBal !== 'object') continue;
        const totalYoctoStr = String(storageBal.total || '0').trim();
        if (!/^\d+$/.test(totalYoctoStr) || BigInt(totalYoctoStr) <= 0n) continue;

        const depositNear = Number(fromBaseUnits(totalYoctoStr, 24));
        const rawBalStr = ftBal !== null && ftBal !== undefined && /^\d+$/.test(String(ftBal).trim())
          ? String(ftBal).trim()
          : '0';
        const isEmpty = BigInt(rawBalStr) === 0n;
        const meta = resolveMeta(cid);
        const uiAmount = Number(fromBaseUnits(rawBalStr, meta.decimals));

        accounts.push({
          contractId: cid,
          symbol: meta.symbol,
          decimals: meta.decimals,
          totalYocto: totalYoctoStr,
          depositNear: Number.isFinite(depositNear) ? depositNear : 0,
          rawAmount: rawBalStr,
          uiAmount: Number.isFinite(uiAmount) ? uiAmount : 0,
          isEmpty,
          canReclaim: isEmpty
        });
      }
    });
    await Promise.all(workers);

    accounts.sort((a, b) => {
      if (a.isEmpty !== b.isEmpty) return a.isEmpty ? -1 : 1;
      return b.depositNear - a.depositNear;
    });

    const emptyAccounts = accounts.filter((a) => a.isEmpty);
    const lockedCount = accounts.length - emptyAccounts.length;
    const totalReclaimableNear = emptyAccounts.reduce((sum, a) => sum + Number(a.depositNear || 0), 0);

    return {
      ok: true,
      accounts,
      emptyCount: emptyAccounts.length,
      lockedCount,
      totalReclaimableNear
    };
  }

  /**
   * Unregisters selected zero-balance NEP-141 token contracts (`storage_unregister`) to reclaim NEAR storage deposits.
   */
  async function executeNearStorageReclaim({ wallet, contracts = [] } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const list = (Array.isArray(contracts) ? contracts : [])
      .map((item) => (typeof item === 'string' ? { contractId: item } : item))
      .filter((item) => item && item.contractId);
    if (list.length === 0) {
      throw new Error(t('请选择至少一个可回收合约', 'Select at least one contract to reclaim'));
    }

    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }

    validateSufficientChainBalance({
      wallet,
      chain: 'near',
      tokenSymbol: 'NEAR',
      amount: Math.max(0.002, 0.0005 * list.length),
      isNative: false,
      tokenBalance: resolveWalletChainBalance(wallet, 'near')
    });

    const txHashes = [];
    for (const item of list) {
      const cid = String(item.contractId).trim();
      const liveBal = await viewNearContractCall(cid, 'ft_balance_of', { account_id: accountId }).catch(() => null);
      if (liveBal !== null && liveBal !== undefined && /^\d+$/.test(String(liveBal).trim()) && BigInt(String(liveBal).trim()) > 0n) {
        throw new Error(t(`${cid} 仍有代币余额，禁止强制注销`, `${cid} still has token balance; cannot unregister safely`));
      }
      const txHash = await api.signAndSendNearFunctionCall({
        accountId,
        publicKeyStr: wallet.nearPublicKey,
        privateKeyStr: wallet.nearPrivateKey,
        receiverId: cid,
        methodName: 'storage_unregister',
        argsJson: JSON.stringify({ force: false }),
        gas: '30000000000000',
        depositYocto: '1'
      });
      if (txHash) txHashes.push(txHash);
    }

    return {
      ok: true,
      txHashes,
      reclaimedCount: txHashes.length
    };
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

  /**
   * NEAR 验证节点全额解质押 (unstake_all)
   */
  async function unstakeFromNearValidator({ wallet, validatorId } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const vid = String(validatorId || '').trim();
    if (!vid) throw new Error(t('缺少验证节点合约地址', 'Missing validator contract ID'));
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.02) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: vid,
      methodName: 'unstake_all',
      argsJson: '{}',
      gas: '80000000000000',
      depositYocto: '0'
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, validatorId: vid };
  }

  /**
   * NEAR 验证节点提取已冷却余额 (withdraw_all)
   */
  async function withdrawFromNearValidator({ wallet, validatorId } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const vid = String(validatorId || '').trim();
    if (!vid) throw new Error(t('缺少验证节点合约地址', 'Missing validator contract ID'));
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.02) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: vid,
      methodName: 'withdraw_all',
      argsJson: '{}',
      gas: '80000000000000',
      depositYocto: '0'
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, validatorId: vid };
  }

  /**
   * Aave V3 借贷池提取本息 (withdraw(address asset, uint256 amount, address to))
   */
  async function withdrawFromAaveV3({ wallet, poolId, amount = 'max' } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const pool = findStakingPool(poolId);
    if (!pool || !pool.isAaveV3) {
      throw new Error(t('未找到对应的 Aave V3 借贷池', 'Aave V3 pool not found'));
    }
    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.evmPrivateKey && !hasNearMpc) {
      throw new Error(t('EVM 签名凭据不可用', 'EVM signing credentials unavailable'));
    }
    const gasBal = resolveWalletChainBalance(wallet, pool.chain);
    const minGas = DEFAULT_GAS_BUFFERS[pool.chain] || 0.001;
    if (gasBal < minGas) {
      throw new Error(t(`${pool.chainLabel} 原生 Gas 不足 (当前: ${gasBal.toFixed(5)})`, `Insufficient native gas on ${pool.chainLabel} (Available: ${gasBal.toFixed(5)})`));
    }
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库不可用', 'EVM signer library unavailable'));
    const evmSender = resolveWalletEvmSender(wallet, ethersLib);
    const rawAmt = String(amount).toLowerCase() === 'max'
      ? ethersLib.MaxUint256
      : toBaseUnits(amount, pool.decimals || 6);
    const iface = new ethersLib.Interface(['function withdraw(address asset, uint256 amount, address to) returns (uint256)']);
    const data = iface.encodeFunctionData('withdraw', [pool.tokenContract, rawAmt, evmSender]);
    const res = wallet.evmPrivateKey
      ? await sendEvmSignedTransaction({ chainKey: pool.chain, privateKey: wallet.evmPrivateKey, to: pool.contract, data, value: '0' })
      : await sendEvmMpcSignedTransaction({ wallet, chainKey: pool.chain, to: pool.contract, data, value: '0', path: 'ethereum-1' });
    return { ...res, poolId: pool.id };
  }

  /**
   * Burrow (contract.main.burrow.near) 借贷池提取 (execute Withdraw)
   */
  async function withdrawFromBurrow({ wallet, tokenContract, amount, decimals = 24 } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const tokenId = String(tokenContract || '').trim();
    if (!tokenId) throw new Error(t('缺少 Burrow 代币合约地址', 'Missing Burrow token contract'));
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.05) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }
    const isMax = typeof amount === 'string' && amount.trim().toLowerCase() === 'max';
    let withdrawAction = { token_id: tokenId };
    if (!isMax) {
      const baseDec = Number(decimals) || (tokenId === 'wrap.near' ? 24 : 6);
      const assetInfo = await viewNearContractCall('contract.main.burrow.near', 'get_asset', { token_id: tokenId }).catch(() => null);
      const extraDec = assetInfo && assetInfo.config && assetInfo.config.extra_decimals !== undefined
        ? Number(assetInfo.config.extra_decimals)
        : null;
      const internalDec = extraDec !== null && Number.isFinite(extraDec)
        ? (baseDec + extraDec)
        : (tokenId === 'wrap.near' || baseDec === 24 ? 24 : 18);
      const rawBurrowAmt = toBaseUnits(amount, internalDec);
      if (!/^\d+$/.test(rawBurrowAmt) || BigInt(rawBurrowAmt) <= 0n) {
        throw new Error(t('提取数量必须大于 0', 'Withdraw amount must be positive'));
      }
      withdrawAction = { token_id: tokenId, max_amount: rawBurrowAmt };
    }
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: 'contract.main.burrow.near',
      methodName: 'execute',
      argsJson: JSON.stringify({
        actions: [{
          Withdraw: withdrawAction
        }]
      }),
      gas: '120000000000000',
      depositYocto: '1'
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, tokenContract: tokenId };
  }

  /**
   * 批量读取用户在 EVM / Arc / HyperEVM 上的活跃理财与质押持仓（Aave V3、Ethena sUSDe 含冷却、Steakhouse ERC-4626、stETH、kHYPE）
   */
  async function fetchEvmAccountStakingPositionsAsync(wallet) {
    const evmAddr = wallet && (wallet.mpcEvmAddress || wallet.evmAddress);
    if (!evmAddr || !/^0x[0-9a-fA-F]{40}$/.test(String(evmAddr))) return [];
    const addrLower = String(evmAddr).toLowerCase();
    const paddedAddr = addrLower.replace(/^0x/, '').padStart(64, '0');
    const balCallData = '0x70a08231' + paddedAddr;
    const positions = [];

    const ethCalls = [
      { target: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', allowFailure: true, callData: balCallData }, // 0: Lido stETH
      { target: '0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c', allowFailure: true, callData: balCallData }, // 1: aEthUSDC
      { target: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8', allowFailure: true, callData: balCallData }, // 2: aEthWETH
      { target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', allowFailure: true, callData: balCallData }, // 3: sUSDe shares
      { target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', allowFailure: true, callData: '0x01320fe2' + paddedAddr }, // 4: cooldowns(address)
      { target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497', allowFailure: true, callData: '0x35269315' } // 5: cooldownDuration()
    ];

    const [ethMcRes, baseRes, arbRes, arcRes, hypeRes] = await Promise.all([
      callEvmRpc(
        'eth',
        {
          jsonrpc: '2.0',
          id: 'evm_pos_eth',
          method: 'eth_call',
          params: [{ to: MULTICALL3_ADDRESS, data: encodeMulticall3Aggregate3(ethCalls) }, 'latest']
        },
        6000
      ).catch(() => null),
      ethReadCall('base', '0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB', balCallData, 5500).catch(() => null),
      ethReadCall('arb', '0x724dc807b04555b71Ed48a6896b6F41593b8C637', balCallData, 5500).catch(() => null),
      ethReadCall('arc', '0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298', balCallData, 5500).catch(() => null),
      ethReadCall('hype', '0xfD739d4e423301CE9385c1fb8850539D657C296D', balCallData, 5500).catch(() => null)
    ]);

    const decodedEth = ethMcRes && typeof ethMcRes.result === 'string'
      ? decodeMulticall3Aggregate3Result(ethMcRes.result)
      : null;

    if (decodedEth && decodedEth.length >= 4) {
      if (decodedEth[0].success) {
        const raw = sliceEvmUint256WordHex(decodedEth[0].returnData, 0);
        const amt = Number(fromBaseUnits(raw, 18));
        if (amt > 0.00001) {
          positions.push({
            type: 'liquid_lst',
            poolId: 'lido_steth',
            chain: 'eth',
            symbol: 'stETH',
            outSymbol: 'ETH',
            amount: amt,
            rawAmount: raw,
            decimals: 18,
            canExit: true,
            title: 'Lido Staked ETH',
            subtitle: t('可随时在链上兑换回 ETH', 'Exit stETH to ETH anytime')
          });
        }
      }
      if (decodedEth[1].success) {
        const raw = sliceEvmUint256WordHex(decodedEth[1].returnData, 0);
        const amt = Number(fromBaseUnits(raw, 6));
        if (amt > 0.0001) {
          positions.push({
            type: 'aave_v3',
            poolId: 'aave_eth_usdc',
            chain: 'eth',
            symbol: 'USDC',
            outSymbol: 'aEthUSDC',
            amount: amt,
            rawAmount: raw,
            decimals: 6,
            canWithdraw: true,
            title: 'Aave V3 Ethereum USDC',
            subtitle: t('计息存款，随时可提取', 'Earning yield — withdraw anytime')
          });
        }
      }
      if (decodedEth[2].success) {
        const raw = sliceEvmUint256WordHex(decodedEth[2].returnData, 0);
        const amt = Number(fromBaseUnits(raw, 18));
        if (amt > 0.00001) {
          positions.push({
            type: 'aave_v3',
            poolId: 'aave_eth_weth',
            chain: 'eth',
            symbol: 'WETH',
            outSymbol: 'aEthWETH',
            amount: amt,
            rawAmount: raw,
            decimals: 18,
            canWithdraw: true,
            title: 'Aave V3 Ethereum ETH',
            subtitle: t('计息存款，随时可提取', 'Earning yield — withdraw anytime')
          });
        }
      }
      const susdeSharesRaw = decodedEth[3].success ? sliceEvmUint256WordHex(decodedEth[3].returnData, 0) : '0';
      const susdeAmt = Number(fromBaseUnits(susdeSharesRaw, 18));
      const cooldownEnd = decodedEth[4] && decodedEth[4].success ? Number(sliceEvmUint256WordHex(decodedEth[4].returnData, 0)) : 0;
      const underlyingCooldownRaw = decodedEth[4] && decodedEth[4].success ? sliceEvmUint256WordHex(decodedEth[4].returnData, 1) : '0';
      const underlyingCooldownAmt = Number(fromBaseUnits(underlyingCooldownRaw, 18));
      const cooldownDuration = decodedEth[5] && decodedEth[5].success ? Number(sliceEvmUint256WordHex(decodedEth[5].returnData, 0)) : 604800;
      const nowSec = Math.floor(Date.now() / 1000);
      if (susdeAmt > 0.0001 || underlyingCooldownAmt > 0.0001) {
        const canUnstakeCooldown = underlyingCooldownAmt > 0.0001 && nowSec >= cooldownEnd;
        const waitingCooldown = underlyingCooldownAmt > 0.0001 && nowSec < cooldownEnd;
        const needsCooldown = cooldownDuration > 0 && susdeAmt > 0.0001 && !canUnstakeCooldown;
        positions.push({
          type: 'erc4626',
          poolId: 'ethena_susde',
          chain: 'eth',
          symbol: canUnstakeCooldown || waitingCooldown ? 'USDe' : 'sUSDe',
          outSymbol: 'USDe',
          amount: susdeAmt > 0.0001 ? susdeAmt : underlyingCooldownAmt,
          sharesRaw: susdeSharesRaw,
          cooldownEnd,
          cooldownDuration,
          underlyingCooldownAmount: underlyingCooldownAmt,
          canRedeem: cooldownDuration === 0 && susdeAmt > 0.0001,
          canUnstakeCooldown,
          needsCooldown,
          title: 'Ethena Staked USDe',
          subtitle: canUnstakeCooldown
            ? t(`冷却已完成 (${underlyingCooldownAmt.toFixed(2)} USDe 可领取)`, `Cooldown ready (${underlyingCooldownAmt.toFixed(2)} USDe claimable)`)
            : waitingCooldown
              ? t(`冷却解锁中 (${underlyingCooldownAmt.toFixed(2)} USDe)`, `Cooldown in progress (${underlyingCooldownAmt.toFixed(2)} USDe)`)
              : (cooldownDuration > 0 ? t('点击发起解质押冷却', 'Initiate unstake cooldown') : t('随时可赎回 USDe', 'Redeem anytime'))
        });
      }
    }

    const pushAave = (rawHex, poolId, decimals, symbol, title) => {
      if (!rawHex) return;
      const raw = sliceEvmUint256WordHex(rawHex, 0);
      const amt = Number(fromBaseUnits(raw, decimals));
      if (amt > 0.0001) {
        positions.push({
          type: 'aave_v3',
          poolId,
          chain: findStakingPool(poolId)?.chain || 'base',
          symbol,
          outSymbol: findStakingPool(poolId)?.outSymbol || symbol,
          amount: amt,
          rawAmount: raw,
          decimals,
          canWithdraw: true,
          title,
          subtitle: t('计息存款，随时可提取', 'Earning yield — withdraw anytime')
        });
      }
    };

    pushAave(baseRes, 'aave_base_usdc', 6, 'USDC', 'Aave V3 Base USDC');
    pushAave(arbRes, 'aave_arb_usdc', 6, 'USDC', 'Aave V3 Arbitrum USDC');

    if (arcRes) {
      const sharesRaw = sliceEvmUint256WordHex(arcRes, 0);
      const sharesAmt = Number(fromBaseUnits(sharesRaw, 18));
      if (sharesAmt > 0.0001) {
        const pool = findStakingPool('arc_steak_usdc');
        const rate = pool && pool.rate > 0 ? (1 / pool.rate) : 1;
        positions.push({
          type: 'erc4626',
          poolId: 'arc_steak_usdc',
          chain: 'arc',
          symbol: 'USDC',
          outSymbol: 'steakUSDC',
          amount: sharesAmt * rate,
          sharesAmount: sharesAmt,
          sharesRaw,
          canRedeem: true,
          title: 'Steakhouse Prime (Arc)',
          subtitle: t('ERC-4626 凭证，可随时赎回 USDC', 'ERC-4626 vault — redeem USDC anytime')
        });
      }
    }

    if (hypeRes) {
      const raw = sliceEvmUint256WordHex(hypeRes, 0);
      const amt = Number(fromBaseUnits(raw, 18));
      if (amt > 0.00001) {
        positions.push({
          type: 'liquid_lst',
          poolId: 'hyper_khype',
          chain: 'hype',
          symbol: 'kHYPE',
          outSymbol: 'HYPE',
          amount: amt,
          rawAmount: raw,
          decimals: 18,
          canExit: true,
          title: 'Kinetiq kHYPE',
          subtitle: t('可随时兑换回 HYPE', 'Exit kHYPE to HYPE anytime')
        });
      }
    }

    return positions;
  }

  /**
   * NEAR 流动性质押合约解质押/提取 (lst.rhealab.near, meta-pool.near, linear-protocol.near, v2-nearx.stader-labs.near, xtoken.rhealab.near)
   */
  async function unstakeFromNearLst({
    wallet,
    contractId,
    amount = null,
    action = 'unstake_all',
    requestId = null
  } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const cid = String(contractId || '').trim();
    const allowedContracts = new Set([
      'lst.rhealab.near',
      'meta-pool.near',
      'linear-protocol.near',
      'v2-nearx.stader-labs.near',
      'xtoken.rhealab.near'
    ]);
    if (!allowedContracts.has(cid)) {
      throw new Error(t(`不支持的 NEAR 质押合约: ${cid}`, `Unsupported NEAR LST contract: ${cid}`));
    }
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.03) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }

    let methodName = String(action || 'unstake_all');
    let argsObj = {};
    let depositYocto = '0';
    let gas = '80000000000000';

    if (cid === 'xtoken.rhealab.near') {
      depositYocto = '1'; // xtoken.rhealab.near methods are #[payable]
      gas = '100000000000000';
      if (methodName === 'claim_unstake') {
        if (!requestId) throw new Error(t('缺少 xRHEA 解质押请求 ID', 'Missing xRHEA unstake request ID'));
        argsObj = { request_id: String(requestId) };
      } else {
        methodName = 'unstake';
        const rawAmt = toBaseUnits(amount, 18);
        if (!/^\d+$/.test(rawAmt) || BigInt(rawAmt) <= 0n) {
          throw new Error(t('解质押数量必须大于 0', 'Unstake amount must be positive'));
        }
        argsObj = { amount: rawAmt, client_echo: null };
      }
    } else if (methodName === 'liquid_unstake') {
      if (cid !== 'meta-pool.near') {
        throw new Error(t('仅 Meta Pool 支持 liquid_unstake', 'Only Meta Pool supports liquid_unstake'));
      }
      const rawAmt = toBaseUnits(amount, 24);
      if (!/^\d+$/.test(rawAmt) || BigInt(rawAmt) <= 0n) {
        throw new Error(t('解质押数量必须大于 0', 'Unstake amount must be positive'));
      }
      const est = await viewNearContractCall('meta-pool.near', 'get_near_amount_sell_st_near', { st_near_amount: rawAmt }).catch(() => null);
      const minExpected = est && /^\d+$/.test(String(est))
        ? computeSlippageMinAmount(String(est), 200)
        : '1';
      argsObj = { st_near_to_burn: rawAmt, min_expected_near: minExpected };
    } else if (methodName === 'unstake') {
      const rawAmt = toBaseUnits(amount, 24);
      if (!/^\d+$/.test(rawAmt) || BigInt(rawAmt) <= 0n) {
        throw new Error(t('解质押数量必须大于 0', 'Unstake amount must be positive'));
      }
      argsObj = { amount: rawAmt };
    } else if (methodName === 'withdraw_all' || methodName === 'unstake_all') {
      argsObj = {};
    } else {
      throw new Error(t(`不支持的操作类型: ${methodName}`, `Unsupported action: ${methodName}`));
    }

    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: cid,
      methodName,
      argsJson: JSON.stringify(argsObj),
      gas,
      depositYocto
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, contractId: cid, action: methodName };
  }

  /**
   * Rhea oRHEA 锁仓到期领取 (orhea-conv.rhealab.near claim / batch_claim, depositYocto: '0')
   */
  async function claimRheaOrheaConversion({ wallet, conversionIds = [] } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    await ensureWalletSigningKeysAsync(wallet);
    const accountId = wallet.nearNamedAccount || wallet.nearAddress;
    if (!accountId || !wallet.nearPublicKey || !wallet.nearPrivateKey) {
      throw new Error(t('NEAR 签名凭据不可用', 'NEAR signing credentials unavailable'));
    }
    const nearGas = resolveWalletChainBalance(wallet, 'near');
    if (nearGas < 0.03) {
      throw new Error(t(`NEAR 余额不足以支付 Gas (当前: ${nearGas.toFixed(4)} NEAR)`, `Insufficient NEAR for gas (Available: ${nearGas.toFixed(4)} NEAR)`));
    }

    let ids = Array.isArray(conversionIds) ? conversionIds.filter(Boolean).map((x) => String(x)) : [];
    if (ids.length === 0) {
      const convs = await viewNearContractCall('orhea-conv.rhealab.near', 'get_account_conversions', { account_id: accountId }).catch(() => null);
      const nowNs = BigInt(Date.now()) * 1000000n;
      if (Array.isArray(convs)) {
        for (const c of convs) {
          if (!c) continue;
          const cid = c.conversion_id ?? c.id;
          const relTime = BigInt(String(c.release_timestamp ?? c.unlock_time ?? c.end_timestamp ?? '0'));
          if (cid !== undefined && cid !== null && relTime > 0n && relTime <= nowNs) {
            ids.push(String(cid));
          }
        }
      }
    }
    if (ids.length === 0) {
      throw new Error(t('暂无已到期可领取的 oRHEA 兑换记录', 'No matured oRHEA conversions ready to claim'));
    }

    const useBatch = ids.length > 1;
    const methodName = useBatch ? 'batch_claim' : 'claim';
    const argsJson = useBatch
      ? JSON.stringify({ account_id: accountId, conversion_ids: ids })
      : JSON.stringify({ account_id: accountId, conversion_id: ids[0] });
    const txHash = await api.signAndSendNearFunctionCall({
      accountId,
      publicKeyStr: wallet.nearPublicKey,
      privateKeyStr: wallet.nearPrivateKey,
      receiverId: 'orhea-conv.rhealab.near',
      methodName,
      argsJson,
      gas: useBatch ? '150000000000000' : '100000000000000',
      depositYocto: '0'
    });
    return { txHash, explorerUrl: `${NEAR_EXPLORER_TX}${txHash}`, claimedCount: ids.length, conversionIds: ids };
  }

  /**
   * EVM / Arc ERC-4626 金库赎回（支持 Steakhouse Prime USDC redeem 以及 Ethena sUSDe 冷却 cooldownShares -> unstake）
   */
  async function redeemErc4626Vault({ wallet, poolId, shares = 'max', mode = 'auto' } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const pool = findStakingPool(poolId);
    if (!pool || !pool.isErc4626) {
      throw new Error(t('未找到对应的 ERC-4626 理财金库', 'ERC-4626 vault pool not found'));
    }
    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.evmPrivateKey && !hasNearMpc) {
      throw new Error(t('EVM 签名凭据不可用', 'EVM signing credentials unavailable'));
    }
    const gasBal = resolveWalletChainBalance(wallet, pool.chain);
    const minGas = DEFAULT_GAS_BUFFERS[pool.chain] || 0.001;
    if (gasBal < minGas) {
      throw new Error(t(`${pool.chainLabel} 原生 Gas 不足 (当前: ${gasBal.toFixed(5)})`, `Insufficient native gas on ${pool.chainLabel} (Available: ${gasBal.toFixed(5)})`));
    }
    const ethersLib = getEthersLib();
    if (!ethersLib) throw new Error(t('EVM 签名库 ethers 不可用', 'EVM signer library unavailable'));
    const evmSender = resolveWalletEvmSender(wallet, ethersLib);
    const sendCall = (data) => (wallet.evmPrivateKey
      ? sendEvmSignedTransaction({ chainKey: pool.chain, privateKey: wallet.evmPrivateKey, to: pool.contract, data, value: '0' })
      : sendEvmMpcSignedTransaction({ wallet, chainKey: pool.chain, to: pool.contract, data, value: '0', path: 'ethereum-1' }));

    const paddedSender = evmSender.toLowerCase().replace(/^0x/, '').padStart(64, '0');
    const balHex = await ethReadCall(pool.chain, pool.contract, '0x70a08231' + paddedSender, 6000);
    const currentSharesBig = balHex ? BigInt(sliceEvmUint256WordHex(balHex, 0)) : 0n;
    const requestedSharesBig = String(shares).toLowerCase() === 'max'
      ? currentSharesBig
      : BigInt(toBaseUnits(shares, pool.outDecimals || 18));

    if (pool.id === 'ethena_susde') {
      const ethenaIface = new ethersLib.Interface([
        'function cooldownDuration() view returns (uint24)',
        'function cooldowns(address) view returns (uint104 cooldownEnd, uint152 underlyingAmount)',
        'function cooldownShares(uint256 shares) returns (uint256 assets)',
        'function unstake(address receiver)',
        'function redeem(uint256 shares, address receiver, address _owner) returns (uint256 assets)'
      ]);
      const [cdDurHex, cdStateHex] = await Promise.all([
        ethReadCall(pool.chain, pool.contract, ethenaIface.encodeFunctionData('cooldownDuration', []), 5500),
        ethReadCall(pool.chain, pool.contract, ethenaIface.encodeFunctionData('cooldowns', [evmSender]), 5500)
      ]);
      const cdDur = cdDurHex ? Number(sliceEvmUint256WordHex(cdDurHex, 0)) : 604800;
      const cooldownEnd = cdStateHex ? Number(sliceEvmUint256WordHex(cdStateHex, 0)) : 0;
      const underlyingAmt = cdStateHex ? BigInt(sliceEvmUint256WordHex(cdStateHex, 1)) : 0n;
      const nowSec = Math.floor(Date.now() / 1000);

      if (cdDur > 0) {
        if (mode === 'unstake' || (underlyingAmt > 0n && nowSec >= cooldownEnd)) {
          const data = ethenaIface.encodeFunctionData('unstake', [evmSender]);
          const res = await sendCall(data);
          return { ...res, poolId: pool.id, step: 'unstaked' };
        }
        if (requestedSharesBig > 0n) {
          const data = ethenaIface.encodeFunctionData('cooldownShares', [requestedSharesBig.toString()]);
          const res = await sendCall(data);
          return { ...res, poolId: pool.id, step: 'cooldown_started' };
        }
        if (underlyingAmt > 0n && nowSec < cooldownEnd) {
          const remainHours = Math.max(1, Math.ceil((cooldownEnd - nowSec) / 3600));
          throw new Error(t(`sUSDe 仍在冷却期中，预计约 ${remainHours} 小时后可领取 USDe`, `sUSDe cooldown active (~${remainHours}h remaining)`));
        }
        throw new Error(t('无可赎回或待领取的 sUSDe 持仓', 'No sUSDe balance or matured cooldown to claim'));
      }
    }

    if (requestedSharesBig <= 0n) {
      throw new Error(t('金库可赎回份额为 0', 'No vault shares available to redeem'));
    }
    const erc4626Iface = new ethersLib.Interface([
      'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)'
    ]);
    const data = erc4626Iface.encodeFunctionData('redeem', [requestedSharesBig.toString(), evmSender, evmSender]);
    const res = await sendCall(data);
    return { ...res, poolId: pool.id, step: 'redeemed' };
  }

  /**
   * Jupiter DAO (voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj) 解锁与提取 JUP
   * 支持 toggleMaxLock(false) 开启 30 天解锁倒计时，以及到期后执行 withdraw 提取 JUP
   */
  async function unstakeJupiterDao({ wallet, action = 'auto' } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    await ensureWalletSigningKeysAsync(wallet);
    const hasNearMpc = Boolean((wallet.nearNamedAccount || wallet.nearAddress) && wallet.nearPublicKey && wallet.nearPrivateKey);
    if (!wallet.solAddress || (!wallet.solPrivateSeedHex && !hasNearMpc)) {
      throw new Error(t('Solana 签名凭据不可用', 'Solana signing credentials unavailable'));
    }
    const solGas = resolveWalletChainBalance(wallet, 'sol');
    if (solGas < DEFAULT_GAS_BUFFERS.sol) {
      throw new Error(t(`SOL 余额不足以支付交易费 (当前: ${solGas.toFixed(4)} SOL)`, `Insufficient SOL for gas (Available: ${solGas.toFixed(4)} SOL)`));
    }

    const ownerStr = wallet.solAddress;
    const voterProgId = 'voTpe3tHQ7AjQHMapgSue2HJFAh2cGsdokqN3XqmVSj';
    const lockerStr = 'CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN';
    const jupMintStr = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
    const tokProg = SPL_TOKEN_PROGRAM_ID;
    const ataProg = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
    const sysProg = '11111111111111111111111111111111';

    const escrowPda = await findSolanaPdaAsync(
      [new TextEncoder().encode('Escrow'), base58Decode(lockerStr), base58Decode(ownerStr)],
      base58Decode(voterProgId)
    );
    const escrowInfo = await callSolanaRpc('getAccountInfo', [escrowPda.address, { encoding: 'base64' }], 6000);
    if (!escrowInfo || !escrowInfo.value || !escrowInfo.value.data || !escrowInfo.value.data[0]) {
      throw new Error(t('未找到您的 Jupiter DAO 锁仓账户', 'Jupiter DAO escrow account not found'));
    }
    const buf = base64ToBytes(String(escrowInfo.value.data[0]));
    if (buf.length < 162) {
      throw new Error(t('Jupiter DAO Escrow 账户数据长度异常', 'Invalid Jupiter DAO escrow account data'));
    }
    const amountRaw = decodeU64LE(buf, 105);
    const escrowEndsAtRaw = decodeU64LE(buf, 121);
    const escrowEndsAtSec = Number(BigInt.asIntN(64, escrowEndsAtRaw));
    const isMaxLock = buf[161] === 1;
    const nowSec = Math.floor(Date.now() / 1000);
    if (amountRaw <= 0n) {
      throw new Error(t('Jupiter DAO 当前可提取 JUP 数量为 0', 'No locked JUP in Jupiter DAO escrow'));
    }

    const instructions = [];
    let performedStep = '';
    if (action === 'toggle_max_lock' || (action === 'auto' && isMaxLock)) {
      if (!isMaxLock) {
        throw new Error(t('当前已处于解锁倒计时状态，无需重复关闭永久锁仓', 'Max lock is already disabled'));
      }
      instructions.push({
        programId: voterProgId,
        keys: [
          { pubkey: lockerStr, isSigner: false, isWritable: false },
          { pubkey: escrowPda.address, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: true, isWritable: false }
        ],
        data: hexToBytes('a39da184b36b7f8f00') // toggle_max_lock(is_max_lock: false)
      });
      performedStep = 'cooldown_started';
    } else if (!isMaxLock && nowSec >= escrowEndsAtSec) {
      const [escrowTokensPda, destTokensPda] = await Promise.all([
        findSolanaPdaAsync([escrowPda.bytes, base58Decode(tokProg), base58Decode(jupMintStr)], base58Decode(ataProg)),
        findSolanaPdaAsync([base58Decode(ownerStr), base58Decode(tokProg), base58Decode(jupMintStr)], base58Decode(ataProg))
      ]);
      // Ensure user's destination JUP ATA exists (CreateIdempotent instruction = 1)
      instructions.push({
        programId: ataProg,
        keys: [
          { pubkey: ownerStr, isSigner: true, isWritable: true },
          { pubkey: destTokensPda.address, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: false, isWritable: false },
          { pubkey: jupMintStr, isSigner: false, isWritable: false },
          { pubkey: sysProg, isSigner: false, isWritable: false },
          { pubkey: tokProg, isSigner: false, isWritable: false }
        ],
        data: new Uint8Array([1])
      });
      instructions.push({
        programId: voterProgId,
        keys: [
          { pubkey: lockerStr, isSigner: false, isWritable: true },
          { pubkey: escrowPda.address, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: true, isWritable: false },
          { pubkey: escrowTokensPda.address, isSigner: false, isWritable: true },
          { pubkey: destTokensPda.address, isSigner: false, isWritable: true },
          { pubkey: ownerStr, isSigner: true, isWritable: true },
          { pubkey: tokProg, isSigner: false, isWritable: false }
        ],
        data: hexToBytes('b712469c946da122') // withdraw()
      });
      performedStep = 'withdrawn';
    } else {
      const remainDays = Math.max(1, Math.ceil((escrowEndsAtSec - nowSec) / 86400));
      throw new Error(t(`JUP 正在 30 天解锁冷却期中，还剩约 ${remainDays} 天可提取`, `JUP unstaking cooldown active (~${remainDays} days remaining)`));
    }

    const res = await buildAndBroadcastSolanaInstructionsAsync({ wallet, instructions });
    return {
      ...res,
      poolId: 'jupiter_jup',
      step: performedStep
    };
  }

  /**
   * 流动性质押代币极速退出 (rNEAR->NEAR / JitoSOL,jupSOL,mSOL,INF->SOL / kHYPE->HYPE / stETH->ETH)
   */
  async function exitLiquidStakingToken({ wallet, poolId, amount, slippageBps = 100 } = {}) {
    if (!wallet) throw new Error(t('钱包对象不可用', 'Wallet is required'));
    const pool = findStakingPool(poolId);
    if (!pool) throw new Error(t(`未找到质押池: ${poolId}`, `Staking pool not found: ${poolId}`));
    const amtNum = Number(amount);
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      throw new Error(t('请输入有效的退出数量', 'Enter a valid positive exit amount'));
    }
    await ensureWalletSigningKeysAsync(wallet);

    if (pool.chain === 'near') {
      const lstContractMap = {
        rhea_rnear: 'lst.rhealab.near',
        metapool_stnear: 'meta-pool.near',
        linear_near: 'linear-protocol.near',
        stader_nearx: 'v2-nearx.stader-labs.near'
      };
      const lstContract = lstContractMap[pool.id];
      if (!lstContract) throw new Error(t('该 NEAR 池暂不支持一键兑换退出', 'Instant swap exit unsupported for this NEAR pool'));
      const rawAmt = toBaseUnits(amtNum, pool.decimals || 24);
      const q = await quoteNearRefFinanceSwap({ tokenIn: lstContract, tokenOut: WRAP_NEAR_CONTRACT, amountRaw: rawAmt, slippageBps });
      if (!q || !q.ok) throw new Error((q && q.error) || t('Ref Finance 退出报价失败', 'Ref Finance exit quote failed'));
      const res = await executeNearRefFinanceSwap({
        wallet,
        routeData: q.routeData,
        actions: q.actions,
        poolIds: q.poolIds,
        minAmountOut: q.minAmountOut,
        tokenIn: lstContract,
        tokenOut: WRAP_NEAR_CONTRACT,
        amountRaw: rawAmt,
        slippageBps,
        inputDecimals: pool.decimals || 24,
        tokenSymbol: pool.outSymbol || 'LST'
      });
      return { ...res, poolId: pool.id };
    }

    if (pool.chain === 'sol' && pool.mintOut) {
      const rawAmt = toBaseUnits(amtNum, pool.decimals || 9);
      const quote = await quoteSolanaJupiterSwap({
        inputMint: pool.mintOut,
        outputMint: WSOL_MINT,
        amountRaw: rawAmt,
        slippageBps,
        platformFeeBps: 0
      });
      const res = await executeSolanaJupiterSwap({
        wallet,
        quoteResponse: quote,
        wrapAndUnwrapSol: true,
        inputDecimals: pool.decimals || 9
      });
      return { ...res, poolId: pool.id };
    }

    if (pool.chain === 'eth' || pool.chain === 'hype') {
      const evmSender = resolveWalletEvmSender(wallet);
      const rawAmt = toBaseUnits(amtNum, pool.decimals || 18);
      const q = await quoteEvmDexSwap({
        chainKey: pool.chain,
        srcToken: pool.contract,
        destToken: NATIVE_EVM_SENTINEL,
        amountRaw: rawAmt,
        srcDecimals: pool.decimals || 18,
        destDecimals: 18,
        slippageBps,
        feeBps: 0,
        fromAddress: evmSender
      });
      if (!q || !q.ok) throw new Error((q && q.error) || t('EVM 退出报价失败', 'EVM exit quote failed'));
      const res = await executeEvmDexSwap({
        wallet,
        chainKey: pool.chain,
        routeSource: q.routeSource,
        routeData: q.routeData,
        srcToken: pool.contract,
        destToken: NATIVE_EVM_SENTINEL,
        amountRaw: rawAmt,
        srcDecimals: pool.decimals || 18,
        slippageBps,
        feeBps: 0
      });
      return { ...res, poolId: pool.id };
    }

    throw new Error(t('该质押池不支持此退出方式', 'Exit not supported for this pool'));
  }

  const api = {
    NEAR_RPC_URL,
    nearRpcPostAsync,
    SOLANA_RPC_ENDPOINTS,
    EVM_CHAINS,
    MULTICALL3_ADDRESS,
    STAKING_POOLS,
    V1_SIGNER_CONTRACT,
    REF_FINANCE_CONTRACT,
    KNOWN_REF_V2_POOLS,
    DCL_CONTRACT_ID,
    NEAR_DCL_POOLS,
    resolveWalletEvmSender,
    findSolanaPdaAsync,
    discoverNearAccountsByPublicKeyAsync,
    fetchNearAccountStakingPositionsAsync,
    fetchSolanaAccountStakingPositionsAsync,
    fetchEvmAccountStakingPositionsAsync,
    ensureWalletSigningKeysAsync,
    deriveMpcEvmAddressAsync,
    resolveWalletChainBalance,
    validateSufficientChainBalance,
    raceWithGraceWindow,
    callSolanaRpc,
    signSolanaBase64Tx,
    signAndBroadcastSolanaBase64Tx,
    fetchSolanaNativeAndSplBalances,
    quoteSolanaJupiterSwap,
    executeSolanaJupiterSwap,
    executeSolanaNativeTransfer,
    executeSolanaSplTransfer,
    buildSolanaCloseOrBurnInstructions,
    scanSolanaReclaimableAccounts,
    executeSolanaRentReclaim,
    fetchPearlNativeBalance,
    buildSignedPearlTaprootTx,
    pearlOutputScriptPubKey,
    executePearlTransfer,
    bitcoinOutputScriptPubKey,
    buildSignedBitcoinTaprootTx,
    fetchBitcoinNativeBalance,
    executeBitcoinTransfer,
    encodeMulticall3Aggregate3,
    decodeMulticall3Aggregate3Result,
    callEvmRpc,
    fetchEvmNativeAndErc20Balance,
    fetchEvmChainBalancesBatch,
    quoteArcNetworkDexSwap,
    quoteEvmDexSwap,
    executeEvmDexSwap,
    executeEvmRawSteps,
    executeEvmTransfer,
    sendEvmMpcSignedTransaction,
    signEvmTypedDataUnified,
    viewNearContractCall,
    signAndSendNearFunctionCall,
    signAndSendNearTransfer,
    executeNearNep141Transfer,
    getWalletNearSignerCredentials,
    encodeNearPublicKeyBorsh,
    fetchNearAccessKeysAsync,
    buildAddKeyActionBytes,
    buildDeleteKeyActionBytes,
    buildDeleteAccountActionBytes,
    checkNearAccountAvailability,
    addNearAccessKeyAsync,
    deleteNearAccessKeyAsync,
    rotateNearAccountKeyAsync,
    quoteNearRefFinanceSwap,
    executeNearRefFinanceSwap,
    quoteNearDclPoolSwap,
    executeNearDclPoolSwap,
    ensureNearNep141StorageRegistered,
    scanNearReclaimableStorageAsync,
    executeNearStorageReclaim,
    registerNearNamedAccountOnChain,
    requestNearMpcChainSignature,
    findStakingPool,
    resolveWalletPoolTokenBalance,
    fetchLiveStakingMetrics,
    fetchAllStakingRates,
    executeOnChainStaking,
    executePoolStake,
    unstakeFromNearValidator,
    withdrawFromNearValidator,
    unstakeFromNearLst,
    claimRheaOrheaConversion,
    redeemErc4626Vault,
    unstakeJupiterDao,
    exitLiquidStakingToken,
    withdrawFromAaveV3,
    withdrawFromBurrow,
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
