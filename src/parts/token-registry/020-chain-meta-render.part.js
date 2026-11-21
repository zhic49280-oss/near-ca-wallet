  const CHAIN_META = {
    near: {
      key: 'near',
      name: 'NEAR Protocol',
      shortName: 'NEAR',
      color: '#00EC97',
      textColor: '#000000',
      logoUrl: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/near/info/logo.png',
      fallbackLogoUrl: makeLocalIcon('near'),
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
      fallbackLogoUrl: makeLocalIcon('eth'),
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
      fallbackLogoUrl: makeLocalIcon('sol'),
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
      fallbackLogoUrl: makeLocalIcon('base'),
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
      fallbackLogoUrl: makeLocalIcon('arb'),
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
      fallbackLogoUrl: makeLocalIcon('bnb'),
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
      fallbackLogoUrl: makeLocalIcon('btc'),
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
      fallbackLogoUrl: makeLocalIcon('trx'),
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
      fallbackLogoUrl: makeLocalIcon('hype'),
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
      logoUrl: makeLocalIcon('hood'),
      fallbackLogoUrl: makeLocalIcon('hood'),
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
      fallbackLogoUrl: makeLocalIcon('arc'),
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
      fallbackLogoUrl: makeLocalIcon('op'),
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
      fallbackLogoUrl: makeLocalIcon('pol'),
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
      fallbackLogoUrl: makeLocalIcon('sui'),
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
      fallbackLogoUrl: makeLocalIcon('ton'),
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
      fallbackLogoUrl: makeLocalIcon('apt'),
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
      fallbackLogoUrl: makeLocalIcon('doge'),
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
      fallbackLogoUrl: makeLocalIcon('xrp'),
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
      fallbackLogoUrl: makeLocalIcon('avax'),
      badgeSvg: makeChainBadgeSvg(
        '#E84142',
        '#FFF',
        '<path d="M8 4l3.8 7.2H4.2L8 4z" fill="#FFF"/>'
      )
    },
    gnosis: {
      key: 'gnosis',
      name: 'Gnosis Chain',
      shortName: 'GNO',
      color: '#04795B',
      textColor: '#FFFFFF',
      logoUrl: 'https://coin-images.coingecko.com/coins/images/662/large/logo_square_simple_300px.png?1696501854',
      fallbackLogoUrl: makeLocalIcon('gnosis'),
      badgeSvg: makeChainBadgeSvg(
        '#04795B',
        '#FFF',
        '<circle cx="8" cy="8" r="4" stroke="#FFF" stroke-width="1.3"/><circle cx="6.5" cy="7.5" r="0.8" fill="#FFF"/><circle cx="9.5" cy="7.5" r="0.8" fill="#FFF"/>'
      )
    },
    qtc: {
      key: 'qtc',
      name: 'Quantus Network',
      shortName: 'QTC',
      color: '#F97316',
      textColor: '#FFFFFF',
      logoUrl: QTC_OFFICIAL_ICON_URL,
      fallbackLogoUrl: makeLocalIcon('qtc'),
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

    const localFallback = getLocalFallbackIconUrl(symClean) || getLocalFallbackIconUrl(symUpper);
    const isStaleGeneratedSvg = Boolean(
      explicitUrl &&
      explicitUrl.startsWith('data:image/svg+xml') &&
      mappedUrl &&
      /^https?:\/\//i.test(mappedUrl) &&
      (explicitUrl === localFallback || explicitUrl.includes('dmlld0JveD0iMCAwIDMyIDMyIg') || explicitUrl.includes('viewBox="0 0 32 32"'))
    );
    const preferredOrder = isStaleGeneratedSvg
      ? [mappedUrl, explicitUrl]
      : [explicitUrl, mappedUrl];

    const unique = [];
    for (const u of preferredOrder) {
      if (u && !unique.includes(u)) unique.push(u);
    }

    if (unique.length < 2) {
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
      for (const u of [contractTwUrl, ccIconsUrl, localFallback]) {
        if (u && !unique.includes(u)) unique.push(u);
      }
    }

    const primaryUrl = unique[0] || '';
    let fallbackUrl = unique[1] || '';
    if (primaryUrl && !primaryUrl.startsWith('data:image/') && localFallback && (!fallbackUrl || !fallbackUrl.startsWith('data:image/'))) {
      fallbackUrl = localFallback;
    }

    return {
      primaryUrl,
      fallbackUrl,
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
      iconInner = `<img src="${escapeHtml(primaryUrl)}" alt="${safeAlt}" data-fb="${safeFb}" width="${s}" height="${s}" style="width:${s}px;height:${s}px" class="rounded-full object-cover flex-shrink-0 bg-white/[0.06] token-img-fb" />${hiddenFallbackSvg}`;
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

