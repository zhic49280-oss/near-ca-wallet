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

