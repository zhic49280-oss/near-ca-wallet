  const TOKEN_ICON_MAP = {
    NEAR: ICON_NEAR_DATA,
    WNEAR: ICON_NEAR_DATA,
    BNEAR: ICON_NEAR_DATA,
    RNEAR: ICON_RNEAR_DATA,
    RHEA: ICON_RHEA_DATA,
    XRHEA: ICON_XRHEA_DATA,
    ORHEA: ICON_ORHEA_DATA,
    STNEAR: ICON_STNEAR_DATA,
    LINEAR: ICON_LINEAR_DATA,
    NEARX: ICON_NEARX_DATA,
    ETH: ICON_ETH_DATA,
    WETH: ICON_ETH_DATA,
    AETHWETH: ICON_ETH_DATA,
    STETH: ICON_STETH_DATA,
    WSTETH: 'https://coin-images.coingecko.com/coins/images/18834/large/wstETH.png?1696518295',
    BTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/bitcoin/info/logo.png',
    WBTC: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
    CBBTC: 'https://assets.coingecko.com/coins/images/40143/standard/cbbtc.webp',
    SOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    WSOL: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
    JITOSOL: 'https://static.datapi.jup.ag/token-icons/86932ec91f48cf380c8b694112b68ec9c18528deecfb82b11a88dadd927c2c6e.webp',
    JUP: ICON_JUP_DATA,
    'STAKED JUP': ICON_JUP_DATA,
    BONK: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
    WIF: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm/logo.png',
    USDT: ICON_USDT_DATA,
    BUSDT: ICON_USDT_DATA,
    USDC: ICON_USDC_DATA,
    BUSDC: ICON_USDC_DATA,
    USDG: 'https://assets.coingecko.com/coins/images/51281/standard/GDN_USDG_Token_200x200.png',
    USDE: ICON_SUSDE_DATA,
    DAI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
    BNB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    WBNB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
    CAKE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82/logo.png',
    ARB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x912CE59144191C1204E64559FE8253a0e49E6548/logo.png',
    OP: 'https://coin-images.coingecko.com/coins/images/25244/large/Token.png?1774456081',
    BASE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png',
    ARC: 'https://raw.githubusercontent.com/ulyanas/frontend-configs/add-usdc-eurc-latest-token-icons/configs/network-icons/arc-dark.svg',
    UNI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
    AERO: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x940181a94A35A4569E4529A3CDfB74e38FD98631/logo.png',
    HYPE: 'https://assets.coingecko.com/coins/images/50882/standard/hyperliquid.jpg',
    WHYPE: 'https://assets.coingecko.com/coins/images/50882/standard/hyperliquid.jpg',
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
    BOME: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82/logo.png',
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
    SHIB: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE/logo.png',
    PEPE: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6982508145454Ce325dDbE47a25d4ec3d2311933/logo.png',
    PENGU: 'https://coin-images.coingecko.com/coins/images/52622/large/PUDGY_PENGUINS_PENGU_PFP.png?1733809110',
    ALEO: 'https://coin-images.coingecko.com/coins/images/27916/large/secondary-icon-dark.png?1726770428',
    DASH: 'https://coin-images.coingecko.com/coins/images/19/large/dash-logo.png?1696501423',
    BRETT: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/0x532f27101965dd16442E59d40670FaF5eBB142E4/logo.png',
    GMX: 'https://coin-images.coingecko.com/coins/images/18323/large/arbit.png?1696517814',
    MOG: 'https://coin-images.coingecko.com/coins/images/31059/large/MOG_LOGO_200x200.png?1696529893',
    MOVE: 'https://coin-images.coingecko.com/coins/images/39345/large/movement-testnet-token.png?1721878759',
    EURC: 'https://storage.googleapis.com/ks-setting-1d682dca/3cb13e14-b165-4305-a272-d4fa03ca58051789468881141.png',
    WUSDC: ICON_USDC_DATA,
    XYUSDC: ICON_USDC_DATA,
    USYC: 'https://assets.coingecko.com/coins/images/31057/standard/usyc.png',
    CIRBTC: 'https://storage.googleapis.com/ks-setting-1d682dca/0ec4d0f8-8eee-4c73-a496-9582ee163b4f1789469942218.png',
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
    MSOL: ICON_MSOL_DATA,
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
    NVDA: 'https://static.datapi.jup.ag/token-icons/5550a81a36c9cce2af5d8b738bcf665c7b4da250a4652dd025107a5d6f0b9458.webp',
    TSLA: 'https://static.datapi.jup.ag/token-icons/e1d90902b191d70826c331e81dee1c19bf7d8884e436626153ff09397c36d278.webp',
    AAPL: 'https://xstocks-metadata.backed.fi/logos/tokens/AAPLx.png',
    MSFT: 'https://static.datapi.jup.ag/token-icons/01cc89d2a92ce9845c11e410e1b21614cc211f65239934b3c54d95cf06a84910.webp',
    GOOGL: 'https://static.datapi.jup.ag/token-icons/12d3b57880ed15dda32a5f89564aa9adf6e30f5dd8a44d1a645b3dc00f7e45be.webp',
    AMZN: 'https://xstocks-metadata.backed.fi/logos/tokens/AMZNx.png',
    META: 'https://static.datapi.jup.ag/token-icons/a636a567e1cfdaa487635e36e24467d111a7bdd6f072b41eb41bea784088e9ab.webp',
    SPY: 'https://static.datapi.jup.ag/token-icons/4d04cfdd8396f0c9274d49f135a458b7d4726cc098e3fc69bb3b4124eb24a2f2.webp',
    USA500: 'https://static.datapi.jup.ag/token-icons/4d04cfdd8396f0c9274d49f135a458b7d4726cc098e3fc69bb3b4124eb24a2f2.webp',
    US500: 'https://static.datapi.jup.ag/token-icons/4d04cfdd8396f0c9274d49f135a458b7d4726cc098e3fc69bb3b4124eb24a2f2.webp',
    QQQ: 'https://xstocks-metadata.backed.fi/logos/tokens/QQQx.png',
    XYZ100: 'https://xstocks-metadata.backed.fi/logos/tokens/QQQx.png',
    MSTR: 'https://static.datapi.jup.ag/token-icons/80e0f9b2b1a97b8aee2ce90f161e9c9557f9afdb81abc86e2d543197e996d470.webp',
    COIN: 'https://xstocks-metadata.backed.fi/logos/tokens/COINx.png',
    PLTR: 'https://xstocks-metadata.backed.fi/logos/tokens/PLTRx.png',
    HOOD: 'https://static.datapi.jup.ag/token-icons/35dabd90c89a9488aa7ba2f75c9d674e30c54f6c3934e4ac1c593070c3bcda1b.webp',
    CRCL: 'https://static.datapi.jup.ag/token-icons/9dd17a6ce597b2622a41682672f1db6b9bd78c462405d5d19f2ecf7ca821e9cc.webp',
    GLD: 'https://static.datapi.jup.ag/token-icons/4b57f2ddf52a0b96ed41fa9678f5540a6f08ca0aa81e735a884c8106e7ea8add.webp',
    GOLD: 'https://static.datapi.jup.ag/token-icons/4b57f2ddf52a0b96ed41fa9678f5540a6f08ca0aa81e735a884c8106e7ea8add.webp',
    SPCX: 'https://static.datapi.jup.ag/token-icons/408050c7fcb89ee19487cf7b549476b645151a6bb777dc925bba09fb49eb69e1.webp',
    SPACEX: 'https://static.datapi.jup.ag/token-icons/408050c7fcb89ee19487cf7b549476b645151a6bb777dc925bba09fb49eb69e1.webp',
    JUPSOL: 'https://static.datapi.jup.ag/token-icons/f65f73e25b3eadcdd65ac25be847bf9d2766822164fb118b37bb3824ee3cb69b.webp',
    INF: ICON_INF_DATA,
    SUSDE: ICON_SUSDE_DATA,
    KHYPE: ICON_KHYPE_DATA,
    STEAKUSDC: ICON_USDC_DATA,
    ABASUSDC: ICON_USDC_DATA,
    AETHUSDC: ICON_USDC_DATA,
    AARBUSDCN: ICON_USDC_DATA
  };

  const DYNAMIC_ICON_STORAGE_KEY = 'near_ca_dynamic_icons_v1';
  const DYNAMIC_ICON_BY_SYMBOL = Object.create(null);
  const DYNAMIC_ICON_BY_CONTRACT = Object.create(null);

  function hydrateDynamicTokenIconsFromStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage || typeof localStorage.getItem !== 'function') return;
      const raw = localStorage.getItem(DYNAMIC_ICON_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.bySymbol === 'object') {
        for (const [sym, url] of Object.entries(parsed.bySymbol)) {
          const cleanSym = String(sym || '').trim().replace(/^\$/, '').toUpperCase();
          const safe = sanitizeImageUrl(url);
          if (cleanSym && safe && safe.length <= 32768) {
            DYNAMIC_ICON_BY_SYMBOL[cleanSym] = safe;
          }
        }
      }
      if (parsed && typeof parsed.byContract === 'object') {
        for (const [cid, url] of Object.entries(parsed.byContract)) {
          const cleanCid = String(cid || '').trim().toLowerCase();
          const safe = sanitizeImageUrl(url);
          if (cleanCid && safe && safe.length <= 32768) {
            DYNAMIC_ICON_BY_CONTRACT[cleanCid] = safe;
          }
        }
      }
    } catch (_) {}
  }

  function persistDynamicTokenIconsToStorage() {
    try {
      if (typeof localStorage === 'undefined' || !localStorage || typeof localStorage.setItem !== 'function') return;
      const pickCapped = (src) => {
        const out = {};
        let count = 0;
        for (const [k, v] of Object.entries(src)) {
          if (count >= 120) break;
          if (typeof v === 'string' && v.length <= 32768) {
            out[k] = v;
            count += 1;
          }
        }
        return out;
      };
      localStorage.setItem(DYNAMIC_ICON_STORAGE_KEY, JSON.stringify({
        bySymbol: pickCapped(DYNAMIC_ICON_BY_SYMBOL),
        byContract: pickCapped(DYNAMIC_ICON_BY_CONTRACT)
      }));
    } catch (_) {}
  }

  hydrateDynamicTokenIconsFromStorage();

  function registerDynamicTokenIcons(symbolMap = {}, contractMap = {}) {
    let changed = false;
    if (symbolMap && typeof symbolMap === 'object') {
      for (const [sym, url] of Object.entries(symbolMap)) {
        const cleanSym = String(sym || '').trim().replace(/^\$/, '').toUpperCase();
        const safe = sanitizeImageUrl(url);
        if (cleanSym && safe && DYNAMIC_ICON_BY_SYMBOL[cleanSym] !== safe) {
          DYNAMIC_ICON_BY_SYMBOL[cleanSym] = safe;
          changed = true;
        }
      }
    }
    if (contractMap && typeof contractMap === 'object') {
      for (const [cid, url] of Object.entries(contractMap)) {
        const cleanCid = String(cid || '').trim().toLowerCase();
        const safe = sanitizeImageUrl(url);
        if (cleanCid && safe && DYNAMIC_ICON_BY_CONTRACT[cleanCid] !== safe) {
          DYNAMIC_ICON_BY_CONTRACT[cleanCid] = safe;
          changed = true;
        }
      }
    }
    if (changed) {
      persistDynamicTokenIconsToStorage();
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

  function encodeUtf8Base64(str) {
    try {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
        return Buffer.from(str, 'utf8').toString('base64');
      }
    } catch (_) {}
    try {
      if (typeof TextEncoder !== 'undefined' && typeof btoa === 'function') {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }
    } catch (_) {}
    if (typeof btoa === 'function') {
      return btoa(unescape(encodeURIComponent(str)));
    }
    return '';
  }

  function makeCircleIconDataUri(bg, contentHtml, ringColor) {
    const ring = ringColor ? `<circle cx="16" cy="16" r="15" stroke="${ringColor}" stroke-width="1.5" fill="none"/>` : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="16" fill="${bg}"/>${ring}${contentHtml}</svg>`;
    const b64 = encodeUtf8Base64(svg);
    return b64 ? `data:image/svg+xml;base64,${b64}` : '';
  }

  const LOCAL_ICON_SPECS = {
    near: ['#00EC97', '<path d="M21.4 9.2l-3.8 5.6c-.3.4.3.9.7.6l3.6-3v7.2c0 .2-.3.3-.4.1L12 8.2a2 2 0 00-1.6-.6H10a2 2 0 00-2 2v12.8a2 2 0 002 2c.7 0 1.4-.4 1.8-1l3.8-5.6c.3-.4-.3-.9-.7-.6l-3.6 3V13c0-.2.3-.3.4-.1l9.5 11.5c.4.5 1 .8 1.6.8h.4a2 2 0 002-2V10.4a2 2 0 00-2-2c-.7 0-1.4.4-1.8.8z" fill="#000"/>'],
    eth: ['#627EEA', '<path d="M16 5.5L9.5 16l6.5 3.9 6.5-3.9L16 5.5zm0 16.4l-6.5-3.9L16 26.5l6.5-8.5-6.5 3.9z" fill="#FFF"/>'],
    weth: ['#1E293B', '<path d="M16 5.5L9.5 16l6.5 3.9 6.5-3.9L16 5.5zm0 16.4l-6.5-3.9L16 26.5l6.5-8.5-6.5 3.9z" fill="#A5B4FC"/>', '#627EEA'],
    btc: ['#F7931A', '<text x="16" y="22.5" text-anchor="middle" fill="#FFF" font-size="18" font-weight="800" font-family="system-ui,sans-serif">₿</text>'],
    wbtc: ['#282828', '<text x="16" y="22.5" text-anchor="middle" fill="#F09242" font-size="18" font-weight="800" font-family="system-ui,sans-serif">₿</text>', '#F09242'],
    sol: ['#141726', '<path d="M9.5 20.5h13l-2 2h-13l2-2zm0-11h13l-2 2h-13l2-2zm11 5.5h-13l2 2h13l-2-2z" fill="#14F195"/>'],
    bnb: ['#F3BA2F', '<path d="M16 7.5l3.5 3.5-3.5 3.5-3.5-3.5L16 7.5zm-6.4 8.5L12 13.6l2.4 2.4L12 18.4 9.6 16zm12.8 0L20 13.6 17.6 16l2.4 2.4L22.4 16zM16 17.5l3.5 3.5-3.5 3.5-3.5-3.5 3.5-3.5z" fill="#FFF"/>'],
    base: ['#0052FF', '<circle cx="16" cy="16" r="8.5" fill="#FFF"/><rect x="7" y="14.5" width="9.5" height="3" fill="#0052FF"/>'],
    arb: ['#213147', '<path d="M16 6l8.4 5v10L16 26l-8.4-5V11L16 6z" stroke="#12AAFF" stroke-width="2.2"/><path d="M12.6 20.8L16 11.2l3.4 9.6" stroke="#FFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'],
    op: ['#FF0420', '<text x="16" y="20.5" text-anchor="middle" fill="#FFF" font-size="12.5" font-weight="900" font-family="system-ui,sans-serif">OP</text>'],
    pol: ['#8247E5', '<path d="M20.4 12.4L16 10l-4.4 2.4v4.8L16 19.6l4.4-2.4v-4.8z" stroke="#FFF" stroke-width="2.4" stroke-linejoin="round"/>'],
    trx: ['#EB0029', '<path d="M9 9.5l14.4 2.5-6.6 11.6L9 9.5z" stroke="#FFF" stroke-width="2" stroke-linejoin="round"/>'],
    sui: ['#4DA2FF', '<path d="M16 6.8c-3.4 4.8-5.4 8-5.4 11.4a5.4 5.4 0 0010.8 0c0-3.4-2-6.6-5.4-11.4z" fill="#FFF"/>'],
    ton: ['#0098EA', '<path d="M9 10.5h14l-7 12.2-7-12.2z" stroke="#FFF" stroke-width="2.2" stroke-linejoin="round"/>'],
    apt: ['#111827', '<path d="M8 12h16M10 16h12M12 20h8" stroke="#FFF" stroke-width="2.2" stroke-linecap="round"/>'],
    doge: ['#C2A633', '<text x="16" y="21.5" text-anchor="middle" fill="#FFF" font-size="16" font-weight="800" font-family="system-ui,sans-serif">Ð</text>'],
    xrp: ['#23292F', '<path d="M9 9.5l7 6.8 7-6.8M9 22.5l7-6.8 7 6.8" stroke="#FFF" stroke-width="2.4" stroke-linecap="round"/>'],
    avax: ['#E84142', '<path d="M16 8l7.6 14.4H8.4L16 8z" fill="#FFF"/>'],
    hype: ['#072723', '<path d="M11.4 10.6c-3 0-5.2 2.4-5.2 5.4s2.2 5.4 5.2 5.4c2.2 0 3.6-1.4 4.6-2.8.8 1.2 1.8 2.2 3.6 2.2 2.4 0 4.2-2 4.2-4.8s-1.8-4.8-4.2-4.8c-1.8 0-2.8 1-3.6 2.2-1-1.4-2.4-2.8-4.6-2.8z" fill="#97FCE4"/>', '#97FCE4'],
    whype: ['#0E1F1D', '<path d="M11.4 10.6c-3 0-5.2 2.4-5.2 5.4s2.2 5.4 5.2 5.4c2.2 0 3.6-1.4 4.6-2.8.8 1.2 1.8 2.2 3.6 2.2 2.4 0 4.2-2 4.2-4.8s-1.8-4.8-4.2-4.8c-1.8 0-2.8 1-3.6 2.2-1-1.4-2.4-2.8-4.6-2.8z" fill="#5EEAD4"/>', '#14B8A6'],
    arc: ['#F8FAFC', '<g transform="translate(6, 5) scale(0.68)"><path fill="#0F172A" d="M1 30c.243-7.345 1.489-14.199 3.57-19.53C7.206 3.72 11.023 0 15.314 0c4.292 0 8.109 3.719 10.745 10.472 1.371 3.512 2.38 7.685 2.978 12.225.054.405.1.817.146 1.229.015.025.024.049.02.068 0 0 .352 2.194.427 6.007h-.04c-.52-.428-6.666-5.256-16.854-3.858a63.94 63.94 0 0 1 .639-5.009l.044-.243c3.995-.12 7.493.343 10.175.952-.01-.064-.018-.13-.03-.193-.55-3.432-1.364-6.575-2.413-9.26-1.714-4.392-3.952-7.12-5.838-7.12-1.885 0-4.123 2.728-5.837 7.12a37.113 37.113 0 0 0-1.132 3.389 50.654 50.654 0 0 0-1.196 5.355c-.474 2.786-.769 5.773-.877 8.868H1V30Z"/></g>', '#CBD5E1'],
    hood: ['#00C805', '<path d="M10 22.4c5.6-2 9.2-6.6 11.4-13.2-4.8 1.8-8.8 5-11.4 10.4v2.8z" fill="#041304"/>'],
    pons: ['#10B981', '<text x="16" y="20.5" text-anchor="middle" fill="#FFF" font-size="10.5" font-weight="800" font-family="system-ui,sans-serif">PONS</text>'],
    gnosis: ['#04795B', '<circle cx="16" cy="16" r="7.5" stroke="#FFF" stroke-width="2"/><circle cx="13" cy="15" r="1.4" fill="#FFF"/><circle cx="19" cy="15" r="1.4" fill="#FFF"/>'],
    qtc: ['#0A0A0A', '<circle cx="15" cy="15" r="7.5" stroke="#F97316" stroke-width="2.6"/><path d="M20.2 20l4.2 4.2" stroke="#F97316" stroke-width="2.6" stroke-linecap="round"/>', '#F97316'],
    usdc: ['#2775CA', '<text x="16" y="22" text-anchor="middle" fill="#FFF" font-size="16" font-weight="800" font-family="system-ui,sans-serif">$</text>'],
    usdt: ['#26A17B', '<text x="16" y="22" text-anchor="middle" fill="#FFF" font-size="16" font-weight="800" font-family="system-ui,sans-serif">₮</text>'],
    usdbc: ['#2775CA', '<text x="16" y="21.5" text-anchor="middle" fill="#FFF" font-size="15" font-weight="800" font-family="system-ui,sans-serif">$</text>', '#93C5FD'],
    eurc: ['#1D6FD8', '<text x="16" y="22" text-anchor="middle" fill="#FFF" font-size="16" font-weight="800" font-family="system-ui,sans-serif">€</text>'],
    dai: ['#F5AC37', '<path d="M11 10.5h5.5a5.5 5.5 0 010 11H11v-11zm-2 4h14M9 17.5h14" stroke="#FFF" stroke-width="2" stroke-linecap="round"/>'],
    link: ['#2A5ADA', '<path d="M16 7.5L23.5 11.8v8.4L16 24.5l-7.5-4.3v-8.4L16 7.5z" stroke="#FFF" stroke-width="2.4" stroke-linejoin="round"/>'],
    jup: ['#131B2E', '<circle cx="16" cy="16" r="6" fill="#22C55E"/><path d="M8.5 19.5c4.5-2 10.5-4 15-7" stroke="#A7F3D0" stroke-width="2" stroke-linecap="round"/>'],
    rhea: ['#0B1F1A', '<path d="M11 22V10h5.5a3.8 3.8 0 010 7.6H11m5.5 0L21 22" stroke="#10B981" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>', '#10B981'],
    purr: ['#0F172A', '<text x="16" y="20" text-anchor="middle" fill="#97FCE4" font-size="9.5" font-weight="800" font-family="system-ui,sans-serif">PURR</text>', '#97FCE4']
  };

  const LOCAL_ICON_ALIASES = {
    wnear: 'near',
    wsol: 'sol',
    wbnb: 'bnb',
    cirbtc: 'btc',
    wusdc: 'usdc',
    xyusdc: 'usdc',
    gno: 'gnosis'
  };

  var _localIconCache;
  function makeLocalIcon(key) {
    _localIconCache = _localIconCache || {};
    const k = String(key || '').toLowerCase();
    if (_localIconCache[k]) return _localIconCache[k];
    const s = LOCAL_ICON_SPECS[k] || ['#334155', `<text x="16" y="20" text-anchor="middle" fill="#FFF" font-size="11" font-weight="800" font-family="system-ui,sans-serif">${k.slice(0, 4).toUpperCase()}</text>`];
    const uri = makeCircleIconDataUri(s[0], s[1], s[2]);
    _localIconCache[k] = uri;
    return uri;
  }

  function getLocalFallbackIconUrl(symOrKey) {
    const raw = String(symOrKey || '').trim().toLowerCase();
    if (!raw) return '';
    const canonical = LOCAL_ICON_ALIASES[raw] || raw;
    return LOCAL_ICON_SPECS[canonical] ? makeLocalIcon(canonical) : '';
  }

  function makeChainBadgeSvg(bg, fg, glyphHtml) {
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="8" fill="${bg}"/>${glyphHtml}</svg>`;
  }

