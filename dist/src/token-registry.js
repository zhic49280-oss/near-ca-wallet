/**
 * NEAR Chain Abstraction Wallet - Authoritative Token & Chain Icon Registry
 * Multi-CDN icon resolution (TrustWallet Assets, CoinGecko, Solana/Jupiter, cryptocurrency-icons)
 * with iridescent Pearl SVG, 14px chain corner badges, and zero hardcoded fake prices.
 * Attaches to globalThis.NearCATokens, window.NearCATokens, and module.exports.
 */
(function (root) {
  'use strict';

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const QTC_OFFICIAL_ICON_URL =
    'https://static.datapi.jup.ag/token-icons/0d58709eb553999608b6d798b17018d4974eb86a3eaa68a4f05614056fb9e9bd.webp';

  function sanitizeImageUrl(url) {
    const clean = String(url || '').trim();
    if (!clean) return '';
    if (/^https?:\/\/[^\s"'<>]+$/i.test(clean)) return clean;

    if (/^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,/i.test(clean)) {
      const compact = clean.replace(/\s+/g, '');
      if (compact.includes('R0lGODlhAQABAIAAAAAAAP')) return '';
      if (/^data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=_-]+$/i.test(compact)) {
        if (/^data:image\/svg\+xml;base64,/i.test(compact)) {
          try {
            const b64 = compact.slice(compact.indexOf(',') + 1);
            const decoded = typeof atob === 'function'
              ? atob(b64)
              : (typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : '');
            if (/<script|\bon\w+\s*=|javascript:|<iframe|<object/i.test(decoded)) return '';
          } catch (_) {
            return '';
          }
        }
        return compact;
      }
      return '';
    }

    if (/^data:image\/svg\+xml[;,]/i.test(clean)) {
      let decoded = clean;
      try {
        decoded = decodeURIComponent(clean);
      } catch (_) {}
      const xssRe = /<script|\bon\w+\s*=|javascript:|<iframe|<object|<foreignObject/i;
      if (xssRe.test(clean) || xssRe.test(decoded)) return '';
      const commaIdx = clean.indexOf(',');
      if (commaIdx < 0) return '';
      const body = clean.slice(commaIdx + 1).trim();
      if (!body) return '';
      if (/[<>"'#\r\n]/.test(body)) {
        const safeBody = body
          .replace(/[\r\n]+/g, ' ')
          .replace(/"/g, '%22')
          .replace(/'/g, '%27')
          .replace(/</g, '%3C')
          .replace(/>/g, '%3E')
          .replace(/#/g, '%23');
        return `data:image/svg+xml;utf8,${safeBody}`;
      }
      return `data:image/svg+xml;utf8,${body}`;
    }

    return '';
  }

  // ======================== Authoritative Multi-CDN Token Logo Map ========================

  const TOKEN_ICON_MAP = {
    NEAR: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/near/info/logo.png',
    WNEAR: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/near/info/logo.png',
    ETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    WETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    STETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84/logo.png',
    WSTETH: 'https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png?1696518295',
    BTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
    WBTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
    CBBTC: 'https://assets.coingecko.com/coins/images/40143/standard/cbbtc.webp',
    SOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    WSOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    JITOSOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn/logo.png',
    JUP: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/logo.png',
    BONK: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
    WIF: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm/logo.png',
    USDT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    USDC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    USDG: 'https://assets.coingecko.com/coins/images/51281/standard/GDN_USDG_Token_200x200.png',
    USDE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x4c9EDD5852cd905f086C759E8383e09bff1E68B3/logo.png',
    DAI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    BNB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    WBNB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    CAKE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82/logo.png',
    ARB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x912CE59144191C1204E64559FE8253a0e49E6548/logo.png',
    OP: 'https://coin-images.coingecko.com/coins/images/25244/large/Token.png?1774456081',
    UNI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
    AERO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x940181a94A35A4569E4529A3CDfB74e38FD98631/logo.png',
    HYPE: 'https://assets.coingecko.com/coins/images/50882/standard/hyperliquid.jpg',
    PONS: 'https://storage.googleapis.com/ks-setting-1d682dca/99cb6fd9-ad94-4b7c-a722-d445a9b9ceef1784090007449.jpg',
    TRX: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
    XRP: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ripple/info/logo.png',
    DOGE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/doge/info/logo.png',
    SUI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sui/info/logo.png',
    TON: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',
    APT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/aptos/info/logo.png',
    CASHCAT: 'https://coin-images.coingecko.com/coins/images/102174280/large/cashcat-logo.jpg?1782922765',
    QTC: QTC_OFFICIAL_ICON_URL,
    XAUT: 'https://coin-images.coingecko.com/coins/images/10481/large/logo.png?1774627372',
    BOME: 'https://image.mitte.gg/token-images/jWnhrsw1ncGBEAMBoBptZE',
    GNO: 'https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png?1696501854',
    COW: 'https://coin-images.coingecko.com/coins/images/24384/large/CoW-token_logo.png?1719524382',
    SAFE: 'https://coin-images.coingecko.com/coins/images/27032/large/Artboard_1_copy_8circle-1.png?1696526084',
    AAVE: 'https://coin-images.coingecko.com/coins/images/12645/large/aave-token-round.png?1720472354',
    LINK: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
    STRK: 'https://coin-images.coingecko.com/coins/images/26433/large/starknet.png?1696525507',
    BERA: 'https://coin-images.coingecko.com/coins/images/25235/large/BERA.png?1738822008',
    OKB: 'https://coin-images.coingecko.com/coins/images/4463/large/WeChat_Image_20220118095654.png?1696505053',
    POL: 'https://coin-images.coingecko.com/coins/images/32440/large/pol.png?1759114181',
    KAITO: 'https://coin-images.coingecko.com/coins/images/54411/large/Qm4DW488_400x400.jpg?1739552780',
    GRAM: 'https://coin-images.coingecko.com/coins/images/17980/large/Gram_Circular_Badge.png?1781524778',
    AVAX: 'https://coin-images.coingecko.com/coins/images/12559/large/Avalanche_Circle_RedWhite_Trans.png?1696512369',
    XLM: 'https://coin-images.coingecko.com/coins/images/100/large/fmpFRHHQ_400x400.jpg?1735231350',
    ADA: 'https://coin-images.coingecko.com/coins/images/975/large/cardano.png?1696502090',
    LTC: 'https://coin-images.coingecko.com/coins/images/2/large/litecoin.png?1696501400',
    SPX: 'https://coin-images.coingecko.com/coins/images/31401/large/centeredcoin_%281%29.png?1737048493',
    BCH: 'https://coin-images.coingecko.com/coins/images/780/large/bitcoin-cash-circle.png?1696501932',
    SHIB: 'https://image.mitte.gg/token-images/szPtDFsUVMihEtLwGKtwae',
    PEPE: 'https://image.mitte.gg/token-images/pjzfcHhthXNngpR5XpKvNa',
    PENGU: 'https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png?1733809110',
    ALEO: 'https://coin-images.coingecko.com/coins/images/27916/large/secondary-icon-dark.png?1726770428',
    DASH: 'https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png?1696501423',
    BRETT: 'https://image.mitte.gg/token-images/cjZccuMVzVvWfZ3GKw58yx',
    GMX: 'https://coin-images.coingecko.com/coins/images/18323/large/arbit.png?1696517814',
    MOG: 'https://coin-images.coingecko.com/coins/images/31059/large/MOG_LOGO_200x200.png?1696529893',
    MOVE: 'https://coin-images.coingecko.com/coins/images/39345/large/movement-testnet-token.png?1721878759',
    EURC: 'https://raw.githubusercontent.com/ulyanas/frontend-configs/add-usdc-eurc-latest-token-icons/configs/token-icons/EURC_latest.svg',
    WUSDC: 'https://raw.githubusercontent.com/ulyanas/frontend-configs/add-usdc-eurc-latest-token-icons/configs/token-icons/USDC_latest.svg',
    XYUSDC: 'https://raw.githubusercontent.com/ulyanas/frontend-configs/add-usdc-eurc-latest-token-icons/configs/token-icons/USDC_latest.svg',
    USYC: 'https://assets.coingecko.com/coins/images/31057/standard/usyc.png',
    CIRBTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
    RAY: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
    ORCA: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png',
    PYTH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3/logo.png',
    JTO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL/logo.png',
    TRUMP: 'https://assets.coingecko.com/coins/images/53746/standard/trump.png',
    FARTCOIN: 'https://assets.coingecko.com/coins/images/50891/standard/fart.jpg',
    POPCAT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr/logo.png',
    MEW: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5/logo.png',
    RENDER: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof/logo.png',
    HNT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux/logo.png',
    MSOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png',
    KMNO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS/logo.png',
    DRIFT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7/logo.png',
    GRASS: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/Grass7B4RdKfBCjTKgSqnXkqjwiGvQyFbuSCUJr3XXjs/logo.png',
    W: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ/logo.png',
    VIRTUAL: 'https://assets.coingecko.com/coins/images/34057/standard/LOGOMARK.png',
    DEGEN: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed/logo.png',
    PENDLE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x808507121B80c02388fAd14726482e061B8da827/logo.png',
    FDUSD: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0xc5f0f7b66764F6ec8C8Dff7BA683102295E16409/logo.png',
    BTCB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c/logo.png',
    LDO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32/logo.png',
    CRV: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png',
    MKR: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2/logo.png',
    ENS: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72/logo.png',
    MORPHO: 'https://assets.coingecko.com/coins/images/29837/standard/Morpho-token-icon.png',
    NVDAX: 'https://static.datapi.jup.ag/token-icons/5550a81a36c9cce2af5d8b738bcf665c7b4da250a4652dd025107a5d6f0b9458.webp',
    TSLAX: 'https://static.datapi.jup.ag/token-icons/e1d90902b191d70826c331e81dee1c19bf7d8884e436626153ff09397c36d278.webp',
    AAPLX: 'https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png',
    MSFTX: 'https://static.datapi.jup.ag/token-icons/01cc89d2a92ce9845c11e410e1b21614cc211f65239934b3c54d95cf06a84910.webp',
    GOOGLX: 'https://static.datapi.jup.ag/token-icons/12d3b57880ed15dda32a5f89564aa9adf6e30f5dd8a44d1a645b3dc00f7e45be.webp',
    AMZNX: 'https://xstocks-metadata.backed.fi/logos/tokens/AMZNx.png',
    METAX: 'https://static.datapi.jup.ag/token-icons/a636a567e1cfdaa487635e36e24467d111a7bdd6f072b41eb41bea784088e9ab.webp',
    SPYX: 'https://static.datapi.jup.ag/token-icons/4d04cfdd8396f0c9274d49f135a458b7d4726cc098e3fc69bb3b4124eb24a2f2.webp',
    QQQX: 'https://xstocks-metadata.backed.fi/logos/tokens/QQQx.png',
    MSTRX: 'https://static.datapi.jup.ag/token-icons/80e0f9b2b1a97b8aee2ce90f161e9c9557f9afdb81abc86e2d543197e996d470.webp',
    COINX: 'https://xstocks-metadata.backed.fi/logos/tokens/COINx.png',
    PLTRX: 'https://xstocks-metadata.backed.fi/logos/tokens/PLTRx.png',
    HOODX: 'https://static.datapi.jup.ag/token-icons/35dabd90c89a9488aa7ba2f75c9d674e30c54f6c3934e4ac1c593070c3bcda1b.webp',
    CRCLX: 'https://static.datapi.jup.ag/token-icons/9dd17a6ce597b2622a41682672f1db6b9bd78c462405d5d19f2ecf7ca821e9cc.webp',
    GLDX: 'https://static.datapi.jup.ag/token-icons/4b57f2ddf52a0b96ed41fa9678f5540a6f08ca0aa81e735a884c8106e7ea8add.webp',
    SPCXX: 'https://static.datapi.jup.ag/token-icons/408050c7fcb89ee19487cf7b549476b645151a6bb777dc925bba09fb49eb69e1.webp',
    JITOSOL: 'https://static.datapi.jup.ag/token-icons/86932ec91f48cf380c8b694112b68ec9c18528deecfb82b11a88dadd927c2c6e.webp',
    JUPSOL: 'https://static.datapi.jup.ag/token-icons/f65f73e25b3eadcdd65ac25be847bf9d2766822164fb118b37bb3824ee3cb69b.webp',
    INF: 'https://arweave.net/CtPUchyfybiHymdCNAA_cDkPZ7p0xZDLmBYvHWOsAkE',
    STETH: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84/logo.png',
    SUSDE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9D39A5DE30e57443BfF2A8307A4256c8797A3497/logo.png',
    KHYPE: 'https://assets.coingecko.com/coins/images/50882/standard/hyperliquid.jpg',
    STEAKUSDC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    ABASUSDC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png'
  };

  const DYNAMIC_ICON_BY_SYMBOL = Object.create(null);
  const DYNAMIC_ICON_BY_CONTRACT = Object.create(null);

  function registerDynamicTokenIcons(symbolMap = {}, contractMap = {}) {
    if (symbolMap && typeof symbolMap === 'object') {
      for (const [sym, url] of Object.entries(symbolMap)) {
        const cleanSym = String(sym || '').trim().replace(/^\$/, '').toUpperCase();
        const safe = sanitizeImageUrl(url);
        if (cleanSym && safe && !DYNAMIC_ICON_BY_SYMBOL[cleanSym]) {
          DYNAMIC_ICON_BY_SYMBOL[cleanSym] = safe;
        }
      }
    }
    if (contractMap && typeof contractMap === 'object') {
      for (const [cid, url] of Object.entries(contractMap)) {
        const cleanCid = String(cid || '').trim().toLowerCase();
        const safe = sanitizeImageUrl(url);
        if (cleanCid && safe && !DYNAMIC_ICON_BY_CONTRACT[cleanCid]) {
          DYNAMIC_ICON_BY_CONTRACT[cleanCid] = safe;
        }
      }
    }
  }

  const TRUSTWALLET_CHAIN_SLUGS = {
    eth: 'ethereum',
    ethereum: 'ethereum',
    bsc: 'smartchain',
    smartchain: 'smartchain',
    base: 'base',
    arb: 'arbitrum',
    arbitrum: 'arbitrum',
    sol: 'solana',
    solana: 'solana',
    op: 'optimism',
    optimism: 'optimism',
    pol: 'polygon',
    polygon: 'polygon'
  };

  // ======================== Chain Badge & Network Metadata System ========================

  const CHAIN_ALIAS_MAP = {
    near: 'near',
    eth: 'eth',
    ethereum: 'eth',
    sol: 'sol',
    solana: 'sol',
    base: 'base',
    arb: 'arb',
    arbitrum: 'arb',
    bsc: 'bsc',
    bnb: 'bsc',
    smartchain: 'bsc',
    btc: 'btc',
    bitcoin: 'btc',
    tron: 'tron',
    trx: 'tron',
    hype: 'hype',
    hyperevm: 'hype',
    hypercore: 'hype',
    hood: 'hood',
    robinhood: 'hood',
    arc: 'arc',
    arcnetwork: 'arc',
    'arc network': 'arc',
    prl: 'prl',
    pearl: 'prl',
    qtc: 'qtc',
    quantus: 'qtc',
    op: 'op',
    optimism: 'op',
    pol: 'pol',
    polygon: 'pol',
    matic: 'pol',
    sui: 'sui',
    ton: 'ton',
    aptos: 'apt',
    apt: 'apt',
    doge: 'doge',
    xrp: 'xrp',
    avax: 'avax',
    gnosis: 'gnosis'
  };

  function makeChainBadgeSvg(bg, fg, glyphHtml) {
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="${bg}"/>${glyphHtml}</svg>`;
  }

  const CHAIN_META = {
    near: {
      key: 'near',
      name: 'NEAR Protocol',
      shortName: 'NEAR',
      color: '#00EC97',
      textColor: '#000000',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/near/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#00EC97',
        '#000',
        '<path d="M10.7 4.6L8.8 7.4c-.15.2.15.45.35.3l1.8-1.5v3.6c0 .1-.15.15-.2.05L6 4.1A1 1 0 005.2 3.8H5a1 1 0 00-1 1v6.4a1 1 0 001 1c.35 0 .7-.2.9-.5l1.9-2.8c.15-.2-.15-.45-.35-.3l-1.8 1.5V6.5c0-.1.15-.15.2-.05L10.6 12.2c.2.25.5.4.8.4h.2a1 1 0 001-1V5.2a1 1 0 00-1-1c-.35 0-.7.2-.9.4z" fill="#000"/>'
      )
    },
    eth: {
      key: 'eth',
      name: 'Ethereum',
      shortName: 'ETH',
      color: '#627EEA',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#627EEA',
        '#FFF',
        '<path d="M8 2.4L4.7 8l3.3 2 3.3-2L8 2.4zm0 8.5L4.7 8.9 8 13.6l3.3-4.7-3.3 2z" fill="#FFF"/>'
      )
    },
    sol: {
      key: 'sol',
      name: 'Solana',
      shortName: 'SOL',
      color: '#9945FF',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#141726',
        '#FFF',
        '<path d="M4.6 10.2h6.6l-.9 1H3.7l.9-1zm0-5.4h6.6l-.9 1H3.7l.9-1zm5.7 2.7H3.7l.9 1h6.6l-.9-1z" fill="#14F195"/>'
      )
    },
    base: {
      key: 'base',
      name: 'Base',
      shortName: 'BASE',
      color: '#0052FF',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#0052FF',
        '#FFF',
        '<circle cx="8" cy="8" r="4.3" fill="#FFF"/><rect x="3.5" y="7.2" width="4.8" height="1.6" fill="#0052FF"/>'
      )
    },
    arb: {
      key: 'arb',
      name: 'Arbitrum',
      shortName: 'ARB',
      color: '#12AAFF',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#213147',
        '#FFF',
        '<path d="M8 3l4.2 2.5v5L8 13l-4.2-2.5v-5L8 3z" stroke="#12AAFF" stroke-width="1.3"/><path d="M6.4 10.4L8 5.6l1.6 4.8" stroke="#FFF" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>'
      )
    },
    bsc: {
      key: 'bsc',
      name: 'BNB Smart Chain',
      shortName: 'BSC',
      color: '#F3BA2F',
      textColor: '#000000',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#F3BA2F',
        '#FFF',
        '<path d="M8 3.6l1.8 1.8L8 7.2 6.2 5.4 8 3.6zm-3.2 4.4l1.2-1.2L7.2 8 6 9.2 4.8 8zm6.4 0L10 6.8 8.8 8 10 9.2 11.2 8zM8 8.8l1.8 1.8L8 12.4l-1.8-1.8L8 8.8z" fill="#FFF"/>'
      )
    },
    btc: {
      key: 'btc',
      name: 'Bitcoin',
      shortName: 'BTC',
      color: '#F7931A',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#F7931A',
        '#FFF',
        '<text x="8" y="11.2" text-anchor="middle" fill="#FFF" font-size="9.5" font-weight="800" font-family="system-ui,sans-serif">₿</text>'
      )
    },
    tron: {
      key: 'tron',
      name: 'TRON',
      shortName: 'TRX',
      color: '#EB0029',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#EB0029',
        '#FFF',
        '<path d="M4.5 4.6l7.2 1.3-3.3 5.9-3.9-7.2z" stroke="#FFF" stroke-width="1.2" stroke-linejoin="round"/>'
      )
    },
    hype: {
      key: 'hype',
      name: 'HyperEVM',
      shortName: 'HYPE',
      color: '#97FCE4',
      textColor: '#072723',
      logoUrl: 'https://assets.coingecko.com/coins/images/50882/standard/hyperliquid.jpg',
      badgeSvg: makeChainBadgeSvg(
        '#072723',
        '#97FCE4',
        '<path d="M5.7 5.3c-1.5 0-2.6 1.2-2.6 2.7s1.1 2.7 2.6 2.7c1.1 0 1.8-.7 2.3-1.4.4.6.9 1.1 1.8 1.1 1.2 0 2.1-1 2.1-2.4s-.9-2.4-2.1-2.4c-.9 0-1.4.5-1.8 1.1-.5-.7-1.2-1.4-2.3-1.4z" fill="#97FCE4"/>'
      )
    },
    hood: {
      key: 'hood',
      name: 'Robinhood Chain',
      shortName: 'HOOD',
      color: '#00C805',
      textColor: '#000000',
      logoUrl: '',
      badgeSvg: makeChainBadgeSvg(
        '#00C805',
        '#041304',
        '<path d="M5 11.2c2.8-1 4.6-3.3 5.7-6.6-2.4.9-4.4 2.5-5.7 5.2v1.4z" fill="#041304"/>'
      )
    },
    arc: {
      key: 'arc',
      name: 'Arc Network',
      shortName: 'ARC',
      color: '#F8FAFC',
      textColor: '#0F172A',
      logoUrl: 'https://raw.githubusercontent.com/ulyanas/frontend-configs/add-usdc-eurc-latest-token-icons/configs/network-icons/arc-dark.svg',
      badgeSvg: makeChainBadgeSvg(
        '#F8FAFC',
        '#0F172A',
        '<g transform="translate(2.5, 2) scale(0.38)"><path fill="#0F172A" d="M1 30c.243-7.345 1.489-14.199 3.57-19.53C7.206 3.72 11.023 0 15.314 0c4.292 0 8.109 3.719 10.745 10.472 1.371 3.512 2.38 7.685 2.978 12.225.054.405.1.817.146 1.229.015.025.024.049.02.068 0 0 .352 2.194.427 6.007h-.04c-.52-.428-6.666-5.256-16.854-3.858a63.94 63.94 0 0 1 .639-5.009l.044-.243c3.995-.12 7.493.343 10.175.952-.01-.064-.018-.13-.03-.193-.55-3.432-1.364-6.575-2.413-9.26-1.714-4.392-3.952-7.12-5.838-7.12-1.885 0-4.123 2.728-5.837 7.12a37.113 37.113 0 0 0-1.132 3.389 50.654 50.654 0 0 0-1.196 5.355c-.474 2.786-.769 5.773-.877 8.868H1V30Z"/></g>'
      )
    },
    prl: {
      key: 'prl',
      name: 'Pearl Network',
      shortName: 'PRL',
      color: '#38BDF8',
      textColor: '#0B0F19',
      logoUrl: '',
      badgeSvg: makeChainBadgeSvg(
        '#0F172A',
        '#E0F2FE',
        '<circle cx="8" cy="8" r="4.5" fill="#E0F2FE"/><circle cx="6.6" cy="6.6" r="1.4" fill="#FFFFFF"/>'
      )
    },
    op: {
      key: 'op',
      name: 'Optimism',
      shortName: 'OP',
      color: '#FF0420',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#FF0420',
        '#FFF',
        '<text x="8" y="10.4" text-anchor="middle" fill="#FFF" font-size="6.5" font-weight="900" font-family="system-ui,sans-serif">OP</text>'
      )
    },
    pol: {
      key: 'pol',
      name: 'Polygon',
      shortName: 'POL',
      color: '#8247E5',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#8247E5',
        '#FFF',
        '<path d="M10.2 6.2L8 5 5.8 6.2v2.4L8 9.8l2.2-1.2V6.2z" stroke="#FFF" stroke-width="1.3"/>'
      )
    },
    sui: {
      key: 'sui',
      name: 'Sui',
      shortName: 'SUI',
      color: '#4DA2FF',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/sui/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#4DA2FF',
        '#FFF',
        '<path d="M8 3.4C6.3 5.8 5.3 7.4 5.3 9.1a2.7 2.7 0 005.4 0c0-1.7-1-3.3-2.7-5.7z" fill="#FFF"/>'
      )
    },
    ton: {
      key: 'ton',
      name: 'TON',
      shortName: 'TON',
      color: '#0098EA',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#0098EA',
        '#FFF',
        '<path d="M4.5 5.2h7L8 11.4 4.5 5.2z" stroke="#FFF" stroke-width="1.2" stroke-linejoin="round"/>'
      )
    },
    apt: {
      key: 'apt',
      name: 'Aptos',
      shortName: 'APT',
      color: '#111827',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/aptos/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#111827',
        '#FFF',
        '<path d="M4 6h8M5 8h6M6 10h4" stroke="#FFF" stroke-width="1.2" stroke-linecap="round"/>'
      )
    },
    doge: {
      key: 'doge',
      name: 'Dogecoin',
      shortName: 'DOGE',
      color: '#C2A633',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/doge/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#C2A633',
        '#FFF',
        '<text x="8" y="10.8" text-anchor="middle" fill="#FFF" font-size="8.5" font-weight="800" font-family="system-ui,sans-serif">Ð</text>'
      )
    },
    xrp: {
      key: 'xrp',
      name: 'XRP Ledger',
      shortName: 'XRP',
      color: '#23292F',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ripple/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#23292F',
        '#FFF',
        '<path d="M4.5 4.8L8 8.2l3.5-3.4M4.5 11.2L8 7.8l3.5 3.4" stroke="#FFF" stroke-width="1.3" stroke-linecap="round"/>'
      )
    },
    avax: {
      key: 'avax',
      name: 'Avalanche',
      shortName: 'AVAX',
      color: '#E84142',
      textColor: '#FFFFFF',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
      badgeSvg: makeChainBadgeSvg(
        '#E84142',
        '#FFF',
        '<path d="M8 4l3.8 7.2H4.2L8 4z" fill="#FFF"/>'
      )
    },
    qtc: {
      key: 'qtc',
      name: 'Quantus Mainnet (需填 qz... 地址)',
      shortName: 'QTC',
      color: '#F97316',
      textColor: '#FFFFFF',
      logoUrl: QTC_OFFICIAL_ICON_URL,
      badgeSvg: makeChainBadgeSvg(
        '#0A0A0A',
        '#F97316',
        '<circle cx="8" cy="7.8" r="4.2" stroke="#F97316" stroke-width="1.8"/><path d="M10.2 10l2.2 2.2" stroke="#F97316" stroke-width="1.8" stroke-linecap="round"/>'
      )
    }
  };

  function getChainMeta(chainKey) {
    const raw = String(chainKey || '').trim().toLowerCase();
    const canonical = CHAIN_ALIAS_MAP[raw] || raw;
    if (CHAIN_META[canonical]) {
      return CHAIN_META[canonical];
    }
    const label = (canonical || 'NET').toUpperCase().slice(0, 4);
    return {
      key: canonical || 'unknown',
      name: label,
      shortName: label,
      color: '#334155',
      textColor: '#FFFFFF',
      logoUrl: '',
      badgeSvg: makeChainBadgeSvg(
        '#334155',
        '#FFF',
        `<text x="8" y="10.2" text-anchor="middle" fill="#FFF" font-size="5.5" font-weight="800" font-family="system-ui,sans-serif">${escapeHtml(label.slice(0, 3))}</text>`
      )
    };
  }

  // ======================== Iridescent Pearl SVG & Token SVG Fallbacks ========================

  let _svgUid = 0;

  function getPearlIconSvg(size = 36) {
    const uid = ++_svgUid;
    const s = Number(size) || 36;
    return `<svg width="${s}" height="${s}" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="rounded-full flex-shrink-0">
      <defs>
        <radialGradient id="prlShell_${uid}" cx="35%" cy="28%" r="72%" fx="30%" fy="24%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="32%" stop-color="#E0F7FA"/>
          <stop offset="65%" stop-color="#C7D2FE"/>
          <stop offset="88%" stop-color="#67E8F9"/>
          <stop offset="100%" stop-color="#0E7490"/>
        </radialGradient>
        <linearGradient id="prlRim_${uid}" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#A5F3FC" stop-opacity="0.9"/>
          <stop offset="50%" stop-color="#E9D5FF" stop-opacity="0.7"/>
          <stop offset="100%" stop-color="#22D3EE" stop-opacity="0.9"/>
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="17.2" fill="url(#prlShell_${uid})" stroke="url(#prlRim_${uid})" stroke-width="1.5"/>
      <ellipse cx="12.5" cy="10.8" rx="5.2" ry="2.7" transform="rotate(-24 12.5 10.8)" fill="#FFFFFF" fill-opacity="0.72"/>
      <circle cx="9.2" cy="14.5" r="1.3" fill="#FFFFFF" fill-opacity="0.65"/>
      <path d="M13.6 10.8C10.5 10.8 8.4 13.1 8.4 16C8.4 18.9 10.5 21.2 13.6 21.2V10.8Z" fill="#0F172A" fill-opacity="0.88"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M15.4 10.8H20.6C24 10.8 26.2 12.9 26.2 16C26.2 19.1 24 21.2 20.6 21.2H18.4V24.6H20.6V26.2H13.6V24.6H15.4V10.8ZM18.4 12.8V19.2H20.4C22.3 19.2 23.4 18 23.4 16C23.4 14 22.3 12.8 20.4 12.8H18.4Z" fill="#0F172A" fill-opacity="0.88"/>
    </svg>`;
  }

  function getFallbackTokenIconSvg(symbol, blockchain = '', size = 36) {
    const sym = String(symbol || '?').toUpperCase();
    const s = Number(size) || 36;
    if (sym === 'PRL') return getPearlIconSvg(s);
    const meta = getChainMeta(blockchain);
    const bgMap = {
      USDT: '#26A17B',
      USDC: '#2775CA',
      BTC: '#F7931A',
      CBBTC: '#0052FF',
      ETH: '#627EEA',
      WETH: '#627EEA',
      SOL: '#141726',
      NEAR: '#00EC97',
      WNEAR: '#00EC97',
      BNB: '#F3BA2F',
      DAI: '#F5AC37',
      TRX: '#EB0029',
      ARB: '#12AAFF',
      HYPE: '#072723',
      PONS: '#10B981',
      USDG: '#16A34A',
      USDE: '#1E293B'
    };
    const bg = bgMap[sym] || meta.color || '#334155';
    const textColor = (sym === 'NEAR' || sym === 'WNEAR' || sym === 'BNB')
      ? '#000000'
      : (sym === 'HYPE' ? '#97FCE4' : '#FFFFFF');
    const label = escapeHtml(sym.slice(0, 4));
    const fontSize = label.length >= 4 ? 8.5 : (label.length === 3 ? 10 : 12);
    return `<svg width="${s}" height="${s}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" class="rounded-full flex-shrink-0"><circle cx="16" cy="16" r="16" fill="${bg}"/><text x="16" y="19.5" text-anchor="middle" fill="${textColor}" font-size="${fontSize}" font-weight="800" font-family="system-ui,-apple-system,sans-serif">${label}</text></svg>`;
  }

  function formatContractForTrustWallet(twChain, contractAddress) {
    const addr = String(contractAddress || '').trim();
    if (!addr) return '';
    if (twChain === 'solana') return addr;
    if (/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      const cryptoMod = (typeof globalThis !== 'undefined' && globalThis.NearCACrypto)
        ? globalThis.NearCACrypto
        : (typeof root !== 'undefined' && root.NearCACrypto ? root.NearCACrypto : null);
      if (cryptoMod && typeof cryptoMod.eip55ChecksumAddress === 'function') {
        try {
          return cryptoMod.eip55ChecksumAddress(addr);
        } catch (_) {}
      }
      return addr;
    }
    return '';
  }

  function resolveTokenIcon({ symbol, blockchain, logoURI, contractAddress } = {}) {
    const symUpper = String(symbol || '').trim().toUpperCase();
    const symClean = symUpper.replace(/^\$/, '');
    const symLower = symClean.toLowerCase();
    const contractLower = String(contractAddress || '').trim().toLowerCase();
    const chainKey = getChainMeta(blockchain).key;

    if (symClean === 'PRL') {
      return { primaryUrl: '', fallbackUrl: '', isPearlSvg: true };
    }

    const explicitUrl = sanitizeImageUrl(logoURI);
    const mappedUrl = TOKEN_ICON_MAP[symUpper]
      || TOKEN_ICON_MAP[symClean]
      || (contractLower ? DYNAMIC_ICON_BY_CONTRACT[contractLower] : '')
      || DYNAMIC_ICON_BY_SYMBOL[symUpper]
      || DYNAMIC_ICON_BY_SYMBOL[symClean]
      || '';

    let contractTwUrl = '';
    const twChain = TRUSTWALLET_CHAIN_SLUGS[chainKey] || TRUSTWALLET_CHAIN_SLUGS[String(blockchain || '').toLowerCase()];
    if (twChain && contractAddress) {
      const formattedAddr = formatContractForTrustWallet(twChain, contractAddress);
      if (formattedAddr) {
        contractTwUrl = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${twChain}/assets/${formattedAddr}/logo.png`;
      }
    }

    const ccIconsUrl = symLower && /^[a-z0-9]+$/.test(symLower)
      ? `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${symLower}.png`
      : '';

    const candidates = [explicitUrl, mappedUrl, contractTwUrl, ccIconsUrl].filter(Boolean);
    const unique = [];
    for (const u of candidates) {
      if (!unique.includes(u)) unique.push(u);
    }

    return {
      primaryUrl: unique[0] || '',
      fallbackUrl: unique[1] || '',
      isPearlSvg: false
    };
  }

  function renderTokenIconWithBadge(token = {}, size = 36, showChainBadge = true) {
    const opts = typeof token === 'string' ? { symbol: token } : (token || {});
    const symbol = opts.symbol || '?';
    const blockchain = opts.blockchain || opts.chain || '';
    const s = Number(size) || 36;
    const { primaryUrl, fallbackUrl, isPearlSvg } = resolveTokenIcon({
      symbol,
      blockchain,
      logoURI: opts.logoURI || opts.iconUrl || '',
      contractAddress: opts.contractAddress || ''
    });

    const fallbackSvg = getFallbackTokenIconSvg(symbol, blockchain, s);
    let iconInner;
    if (isPearlSvg) {
      iconInner = getPearlIconSvg(s);
    } else if (primaryUrl) {
      const safeAlt = escapeHtml(String(symbol).toUpperCase());
      const safeFb = escapeHtml(fallbackUrl);
      const hiddenFallbackSvg = fallbackSvg.replace('<svg ', '<svg style="display:none" ');
      iconInner = `<img src="${escapeHtml(primaryUrl)}" alt="${safeAlt}" data-fb="${safeFb}" width="${s}" height="${s}" style="width:${s}px;height:${s}px" class="rounded-full object-cover flex-shrink-0 bg-white/[0.06]" onerror="if(this.dataset.fb&&this.src!==this.dataset.fb){var n=this.dataset.fb;this.dataset.fb='';this.src=n;}else{this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline-flex';}" />${hiddenFallbackSvg}`;
    } else {
      iconInner = fallbackSvg;
    }

    const meta = blockchain ? getChainMeta(blockchain) : null;
    const badgeHtml = (showChainBadge && meta && meta.key !== 'unknown')
      ? `<span title="${escapeHtml(meta.name)}" class="absolute -bottom-0.5 -right-0.5 w-[14px] h-[14px] rounded-full overflow-hidden ring-2 ring-[#0B0F19] bg-[#0B0F19] flex items-center justify-center shadow-sm">${meta.badgeSvg}</span>`
      : '';

    return `<span class="relative inline-flex items-center justify-center flex-shrink-0" style="width:${s}px;height:${s}px"><span class="w-full h-full rounded-full overflow-hidden inline-flex items-center justify-center">${iconInner}</span>${badgeHtml}</span>`;
  }

  // ======================== Unified Token Catalog (Zero Fake Prices: price: null) ========================

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
      { symbol: 'ETH', name: 'Ethereum', blockchain: 'base', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'base', assetId: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'EURC', name: 'Euro Coin', blockchain: 'base', assetId: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', contractAddress: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'base', assetId: '0x4200000000000000000000000000000000000006', contractAddress: '0x4200000000000000000000000000000000000006', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', blockchain: 'base', assetId: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', contractAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8, networkName: 'Base', price: null },
      { symbol: 'AERO', name: 'Aerodrome', blockchain: 'base', assetId: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', contractAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'VIRTUAL', name: 'Virtuals Protocol', blockchain: 'base', assetId: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', contractAddress: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'DEGEN', name: 'Degen', blockchain: 'base', assetId: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', contractAddress: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'BRETT', name: 'Brett', blockchain: 'base', assetId: '0x532f27101965dd16442E59d40670FaF5eBB142E4', contractAddress: '0x532f27101965dd16442E59d40670FaF5eBB142E4', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'MORPHO', name: 'Morpho', blockchain: 'base', assetId: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', contractAddress: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', decimals: 18, networkName: 'Base', price: null },
      { symbol: 'USDbC', name: 'USD Base Coin', blockchain: 'base', assetId: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', contractAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6, networkName: 'Base', price: null },
      { symbol: 'DAI', name: 'Dai Stablecoin', blockchain: 'base', assetId: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', contractAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, networkName: 'Base', price: null }
    ],
    arb: [
      { symbol: 'ETH', name: 'Ethereum', blockchain: 'arb', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Arbitrum', price: null },
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
      { symbol: 'BNB', name: 'BNB', blockchain: 'bsc', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'BNB Smart Chain', price: null },
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
      { symbol: 'LINK', name: 'Chainlink (BSC)', blockchain: 'bsc', assetId: '0xF8A0BF9cF54Bb92F17374d9e9A326e6a511a1D2b', contractAddress: '0xF8A0BF9cF54Bb92F17374d9e9A326e6a511a1D2b', decimals: 18, networkName: 'BNB Smart Chain', price: null }
    ],
    hype: [
      { symbol: 'HYPE', name: 'HYPE (HyperEVM)', blockchain: 'hype', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'WHYPE', name: 'Wrapped HYPE', blockchain: 'hype', assetId: '0x5555555555555555555555555555555555555555', contractAddress: '0x5555555555555555555555555555555555555555', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'USDC', name: 'USD Coin', blockchain: 'hype', assetId: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', contractAddress: '0xb88339CB7199b77E23DB6E890353E22632Ba630f', decimals: 6, networkName: 'HyperEVM', price: null },
      { symbol: 'USDe', name: 'Ethena USDe', blockchain: 'hype', assetId: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', contractAddress: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'kHYPE', name: 'Kinetiq Staked HYPE', blockchain: 'hype', assetId: '0xfD739d4e423301CE9385c1fb8850539D657C296D', contractAddress: '0xfD739d4e423301CE9385c1fb8850539D657C296D', decimals: 18, networkName: 'HyperEVM', price: null },
      { symbol: 'PURR', name: 'Purr', blockchain: 'hype', assetId: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E', contractAddress: '0x9b498C3c8A0b8CD8BA1D9851d40D186F1872b44E', decimals: 18, networkName: 'HyperEVM', price: null }
    ],
    hood: [
      { symbol: 'ETH', name: 'ETH (Robinhood)', blockchain: 'hood', assetId: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', contractAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'PONS', name: 'Pons', blockchain: 'hood', assetId: '0x39dBED3a2bd333467115dE45665cC57F813C4571', contractAddress: '0x39dBED3a2bd333467115dE45665cC57F813C4571', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'USDG', name: 'Global Dollar', blockchain: 'hood', assetId: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', contractAddress: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', decimals: 6, networkName: 'Robinhood Chain', price: null },
      { symbol: 'CASHCAT', name: 'Cash Cat', blockchain: 'hood', assetId: '0x020bfc650a365f8bb26819deaabf3e21291018b4', contractAddress: '0x020bfc650a365f8bb26819deaabf3e21291018b4', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'WETH', name: 'Wrapped Ether', blockchain: 'hood', assetId: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', contractAddress: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', decimals: 18, networkName: 'Robinhood Chain', price: null },
      { symbol: 'USDe', name: 'Ethena USDe', blockchain: 'hood', assetId: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', contractAddress: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', decimals: 18, networkName: 'Robinhood Chain', price: null },
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

  function getAllCoreTokens() {
    return UNIFIED_CORE_TOKENS.map(t => ({ ...t }));
  }

  function getDexTokensForChain(chainKey = 'sol') {
    const meta = getChainMeta(chainKey);
    const list = DEX_CHAIN_TOKENS[meta.key] || DEX_CHAIN_TOKENS[String(chainKey || '').toLowerCase()] || [];
    return list.map(t => ({ ...t }));
  }

  function findTokenByAssetId(assetId, extraTokens = []) {
    const id = String(assetId || '').trim();
    if (!id) return null;
    const lower = id.toLowerCase();
    for (const list of [extraTokens, UNIFIED_CORE_TOKENS, ...Object.values(DEX_CHAIN_TOKENS)]) {
      if (!Array.isArray(list)) continue;
      const found = list.find(t => t && String(t.assetId || '').toLowerCase() === lower);
      if (found) return found;
    }
    return null;
  }

  function getSupportedChains() {
    return ['near', 'eth', 'sol', 'base', 'arb', 'bsc', 'btc', 'tron', 'hype', 'hood', 'arc', 'prl']
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
