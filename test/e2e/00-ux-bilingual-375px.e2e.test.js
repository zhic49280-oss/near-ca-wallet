'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');

const {
  startTestServer,
  loadDistAssets,
  createWalletAppSession,
  assertZeroDevJargon
} = require('./e2e-harness.js');

function createSeededWallet(overrides = {}) {
  return {
    id: 'e2e_wallet_1',
    name: 'E2E Main',
    nearAddress: '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000',
    nearPublicKey: 'ed25519:5J8Wx5fKx8F2o1V9Q3nP7sL6mK9rT2uV4wX6yZ8aB1cD',
    evmAddress: '0x1111111111111111111111111111111111111111',
    mpcEvmAddress: '0x1111111111111111111111111111111111111111',
    solAddress: '11111111111111111111111111111111',
    address: 'prl1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq000000',
    btcAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    nativeBalances: {
      near: 12.5,
      sol: 2.0,
      eth: 0.5,
      base: 0.25,
      arb: 0.5,
      bsc: 0.2,
      op: 0.1,
      pol: 10,
      avax: 1,
      hype: 1,
      hood: 0,
      arc: 5,
      prl: 100,
      btc: 0.01
    },
    ...overrides
  };
}

function mockJsonResponse(payload, status = 200) {
  const raw = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : `Status ${status}`,
    headers: new Headers({ 'content-type': 'application/json' }),
    async json() { return JSON.parse(raw); },
    async text() { return raw; }
  };
}

function createReadOnlyHyperliquidFetchMock() {
  const now = Date.now();
  const candles = Array.from({ length: 48 }, (_, idx) => ({
    t: now - (48 - idx) * 900_000,
    T: now - (47 - idx) * 900_000,
    o: String(95000 + idx * 10),
    h: String(95150 + idx * 10),
    l: String(94900 + idx * 10),
    c: String(95080 + idx * 10),
    v: '125.5'
  }));
  return async (url, init = {}) => {
    if (/api\.hyperliquid\.xyz\/info/i.test(url)) {
      const body = init.body ? JSON.parse(init.body) : {};
      if (body.type === 'metaAndAssetCtxs') {
        return mockJsonResponse([
          { universe: [{ name: 'BTC', szDecimals: 4, maxLeverage: 40 }] },
          [{ markPx: '95500', prevDayPx: '93000', dayNtlVlm: '1250000000', openInterest: '15000', funding: '0.0000125' }]
        ]);
      }
      if (body.type === 'l2Book') {
        return mockJsonResponse({
          levels: [
            [{ px: '95490', sz: '0.5000', n: 2 }, { px: '95480', sz: '1.2000', n: 3 }],
            [{ px: '95510', sz: '0.4000', n: 2 }, { px: '95520', sz: '0.9000', n: 4 }]
          ]
        });
      }
      if (body.type === 'candleSnapshot') {
        return mockJsonResponse(candles);
      }
      if (body.type === 'clearinghouseState' || body.type === 'spotClearinghouseState') {
        return mockJsonResponse({
          marginSummary: { accountValue: '100.0', totalMarginUsed: '20.0' },
          withdrawable: '80.0',
          assetPositions: [],
          balances: []
        });
      }
      if (body.type === 'openOrders' || body.type === 'frontendOpenOrders' || body.type === 'userFills') {
        return mockJsonResponse([]);
      }
    }
    return mockJsonResponse({ error: 'Mock offline endpoint' }, 503);
  };
}

function rawHttpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          rawBody: Buffer.concat(chunks)
        });
      });
    });
    req.on('error', reject);
  });
}

// =====================================================================
// TIER 1 — Isolated Happy-Path E2E Tests
// =====================================================================

test('Tier 1.1: server.js serves static SPA shell, MIME types, Cache-Control & gzip compression', async () => {
  const srv = await startTestServer();
  try {
    const rootRes = await fetch(`${srv.baseUrl}/`);
    assert.equal(rootRes.status, 200);
    assert.match(rootRes.headers.get('content-type') || '', /^text\/html/);
    assert.match(rootRes.headers.get('cache-control') || '', /no-store/);
    assert.equal(rootRes.headers.get('access-control-allow-origin'), '*');
    const rootHtml = await rootRes.text();
    assert.ok(rootHtml.includes('id="view-onboarding"'), 'SPA shell must include #view-onboarding');
    assert.ok(rootHtml.includes('id="toast"'), 'SPA shell must include #toast');

    const cssRes = await fetch(`${srv.baseUrl}/style.css?v=6.68`);
    assert.equal(cssRes.status, 200);
    assert.match(cssRes.headers.get('content-type') || '', /^text\/css/);
    assert.match(cssRes.headers.get('cache-control') || '', /immutable/);
    await cssRes.text();

    const jsRes = await fetch(`${srv.baseUrl}/src/state.js?v=6.68`);
    assert.equal(jsRes.status, 200);
    assert.match(jsRes.headers.get('content-type') || '', /^application\/javascript/);
    assert.match(jsRes.headers.get('cache-control') || '', /immutable/);
    await jsRes.text();

    const swRes = await fetch(`${srv.baseUrl}/sw.js`);
    assert.equal(swRes.status, 200);
    assert.match(swRes.headers.get('cache-control') || '', /no-store/);
    await swRes.text();

    const manifestRes = await fetch(`${srv.baseUrl}/manifest.json`);
    assert.equal(manifestRes.status, 200);
    assert.match(manifestRes.headers.get('content-type') || '', /^application\/json/);
    await manifestRes.text();

    const gzipped = await rawHttpGet(`${srv.baseUrl}/style.css?v=6.68`, { 'Accept-Encoding': 'gzip' });
    assert.equal(gzipped.status, 200);
    assert.equal(gzipped.headers['content-encoding'], 'gzip');
    assert.match(String(gzipped.headers['vary'] || ''), /Accept-Encoding/i);
    const inflatedCss = zlib.gunzipSync(gzipped.rawBody).toString('utf8');
    assert.ok(inflatedCss.includes('.app-shell'), 'Decompressed CSS must contain .app-shell');
  } finally {
    await srv.close();
  }
});

test('Tier 1.2: dist/ i18nDict symmetry and complete HTML data-i18n / data-i18n-placeholder resolution', async () => {
  const { html, i18nDict } = loadDistAssets();
  const zhKeys = Object.keys(i18nDict.zh || {}).sort();
  const enKeys = Object.keys(i18nDict.en || {}).sort();

  assert.ok(zhKeys.length > 300, `Expected > 300 i18n keys, got ${zhKeys.length}`);
  assert.deepEqual(zhKeys, enKeys, 'i18nDict.zh and i18nDict.en must have identical key sets');

  for (const k of zhKeys) {
    assert.equal(typeof i18nDict.zh[k], 'string', `zh.${k} must be a string`);
    assert.equal(typeof i18nDict.en[k], 'string', `en.${k} must be a string`);
    assert.ok(i18nDict.zh[k].trim().length > 0, `zh.${k} must not be empty`);
    assert.ok(i18nDict.en[k].trim().length > 0, `en.${k} must not be empty`);
  }

  const attrKeyRe = /\bdata-i18n(?:-placeholder|-title)?\s*=\s*"([^"]+)"/g;
  const htmlKeys = new Set();
  let match;
  while ((match = attrKeyRe.exec(html)) !== null) {
    htmlKeys.add(match[1]);
  }
  assert.ok(htmlKeys.size >= 250, `Expected >= 250 HTML i18n keys, found ${htmlKeys.size}`);

  for (const key of htmlKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(i18nDict.zh, key), `Missing zh key for HTML attr: ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(i18nDict.en, key), `Missing en key for HTML attr: ${key}`);
  }
});

test('Tier 1.3: Live bilingual zh <-> en toggle updates header, nav, Hub, Send sheet & localStorage', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    assert.equal(session.document.documentElement.lang, 'zh-CN');
    assert.equal(session.getVisibleText('#header-lang-btn'), 'EN');
    assert.ok(session.getVisibleText('.nav-item[data-tab="wallet"]').includes('资产'));

    await session.click('#header-lang-btn');
    assert.equal(session.document.documentElement.lang, 'en');
    assert.equal(session.localStorage.getItem('near_ca_lang_v1'), 'en');
    assert.equal(session.getVisibleText('#header-lang-btn'), '中');
    assert.ok(session.getVisibleText('.nav-item[data-tab="wallet"]').includes('Assets'));
    assert.ok(
      session.getToastHistory().some((t) => t.text === 'Switched to English'),
      'Toast should confirm Switched to English'
    );

    await session.switchTab('hub');
    assert.equal(session.getVisibleText('#hub-lang-current-pill'), 'English');

    await session.switchTab('wallet');
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    assert.equal(session.getVisibleText('#sheet-send .sheet-title'), 'Send');
    await session.closeSheet();

    await session.click('#header-lang-btn');
    assert.equal(session.document.documentElement.lang, 'zh-CN');
    assert.equal(session.localStorage.getItem('near_ca_lang_v1'), 'zh');
    assert.ok(session.getVisibleText('.nav-item[data-tab="wallet"]').includes('资产'));
    assert.ok(
      session.getToastHistory().some((t) => t.text === '已切换为中文'),
      'Toast should confirm 已切换为中文'
    );
    await session.switchTab('hub');
    assert.equal(session.getVisibleText('#hub-lang-current-pill'), '中文');

    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('Tier 1.4: [POST-FIX] 375px narrow viewport CSS, chart touch-action: pan-y, .badge-rose & single-line orderbook header', async () => {
  const { html, css } = loadDistAssets();
  assert.match(html, /<meta\b[^>]*name=["']viewport["'][^>]*width=device-width/i);
  assert.match(css, /\.app-shell\s*\{[^}]*width:\s*100%[^}]*max-width:\s*480px/i);

  assert.match(
    css,
    /@media\s*\([^)]*max-width:\s*(?:37[0-9]|38[0-9]|39[0-9]|400|420)px[^)]*\)/i,
    'dist/style.css must define @media responsive rules for 375px narrow viewports'
  );

  const chartRuleMatch = /\.perp-chart-svg\s*\{([^}]*)\}/i.exec(css);
  assert.ok(chartRuleMatch, 'dist/style.css must define .perp-chart-svg');
  assert.match(
    chartRuleMatch[1],
    /touch-action:\s*pan-y/i,
    '.perp-chart-svg must use touch-action: pan-y so vertical page scrolling is never trapped'
  );
  assert.doesNotMatch(
    chartRuleMatch[1],
    /touch-action:\s*none/i,
    '.perp-chart-svg must NOT use touch-action: none'
  );

  assert.match(
    css,
    /\.badge-rose\s*\{[^}]*\}/i,
    'dist/style.css must define .badge-rose for Perp short position badges'
  );

  assert.match(
    css,
    /\.perp-ob-hcol\s*\{[^}]*white-space:\s*nowrap/i,
    '.perp-ob-hcol must enforce white-space: nowrap so 375px orderbook headers stay single-line'
  );

  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: createReadOnlyHyperliquidFetchMock()
  });
  try {
    await session.click('#header-lang-btn');
    await session.switchTab('perp');
    await session.waitFor(() => session.document.querySelector('[data-action="open-perp-trade"]'), 2000);
    await session.click('[data-action="open-perp-trade"]');
    const obHdrText = session.getVisibleText('#perp-ob-header');
    assert.ok(obHdrText.includes('Price (USDC)'), `Expected unified English price header, got "${obHdrText}"`);
    assert.ok(!obHdrText.includes('数量'), `Orderbook size header must localize in en, got "${obHdrText}"`);
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('Tier 1.5: [POST-FIX] Zero CLS containers (.perp-candle-inspect-bar, .pill-scroll & #perp-ls-ratio-wrap)', async () => {
  const { html, css } = loadDistAssets();
  assert.match(css, /\.perp-candle-inspect-bar\s*\{[^}]*min-height:\s*36px/i);
  assert.match(css, /\.pill-scroll\s*\{[^}]*min-height:\s*34px/i);

  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: createReadOnlyHyperliquidFetchMock()
  });
  try {
    await session.switchTab('perp');
    await session.waitFor(() => session.document.querySelector('[data-action="open-perp-trade"]'), 2000);
    await session.click('[data-action="open-perp-trade"]');

    assert.equal(
      session.hasClass('#perp-candle-detail', 'hidden'),
      false,
      '#perp-candle-detail must remain permanently visible (Zero CLS)'
    );

    const lsWrapMatch = /<div[^>]*id=["']perp-ls-ratio-wrap["'][^>]*class=["']([^"']*)["']/i.exec(html);
    assert.ok(lsWrapMatch, '#perp-ls-ratio-wrap must exist in dist/index.html');
    assert.ok(
      !lsWrapMatch[1].split(/\s+/).includes('hidden'),
      '#perp-ls-ratio-wrap must reserve fixed layout height without toggling .hidden (Zero CLS)'
    );
    assert.equal(
      session.hasClass('#perp-ls-ratio-wrap', 'hidden'),
      false,
      '#perp-ls-ratio-wrap should stay mounted as a fixed-height placeholder when L/S data is absent'
    );
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('Tier 1.6: [POST-FIX] Navigation scroll-reset, copy toast feedback & onboarding confirm button IDs', async () => {
  const { html } = loadDistAssets();
  assert.ok(
    html.includes('id="btn-confirm-create-wallet"'),
    'dist/index.html must expose #btn-confirm-create-wallet so async wallet creation disables the button'
  );
  assert.ok(
    html.includes('id="btn-confirm-import-wallet"'),
    'dist/index.html must expose #btn-confirm-import-wallet so async wallet import disables the button'
  );

  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    session.window.scrollTo(0, 320);
    await session.switchTab('swap');
    assert.equal(session.window.scrollY, 0, 'Switching tab must reset scroll position to (0, 0)');
    assert.equal(session.isVisible('#view-swap'), true);
    assert.equal(session.isVisible('#view-wallet'), false);
    assert.equal(session.hasClass('.nav-item[data-tab="swap"]', 'active'), true);

    await session.switchTab('hub');
    assert.equal(session.isVisible('#view-hub'), true);
    assert.equal(session.hasClass('.nav-item[data-tab="hub"]', 'active'), true);

    await session.switchTab('wallet');
    await session.click('#view-wallet button[onclick*="copyActiveNearId"]');
    assert.equal(session.clipboardLog.at(-1), wallet.nearAddress);
    assert.equal(session.hasClass('#toast', 'show'), true, 'Copying address must show toast feedback');
    assert.ok(session.getToastHistory().length >= 1);
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('Tier 1.7: [POST-FIX] dist/index.html visible text contains zero developer jargon', async () => {
  const { visibleHtmlSegments } = loadDistAssets();
  for (let i = 0; i < visibleHtmlSegments.length; i++) {
    assertZeroDevJargon(visibleHtmlSegments[i], `dist/index.html segment #${i + 1}`);
  }
});

// =====================================================================
// TIER 2 — Boundary, Invalid Input & Error Sanitization E2E Tests
// =====================================================================

test('Tier 2.1: [POST-FIX] i18nDict (zh/en) and rendered app views/sheets contain zero developer jargon', async () => {
  const { i18nDict } = loadDistAssets();
  for (const lang of ['zh', 'en']) {
    for (const [key, val] of Object.entries(i18nDict[lang])) {
      assertZeroDevJargon(val, `i18nDict.${lang}.${key}`);
    }
  }

  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    for (const langClick of [false, true]) {
      if (langClick) await session.click('#header-lang-btn');
      const langTag = session.document.documentElement.lang;
      for (const tab of ['wallet', 'swap', 'perp', 'earn', 'hub']) {
        await session.switchTab(tab);
        assertZeroDevJargon(session.getVisibleText(`#view-${tab}`), `view-${tab} (${langTag})`);
      }
      for (const sheetTrigger of [
        { tab: 'wallet', sheetId: 'sheet-send', selector: '#view-wallet button[onclick*="openSendSheet"]' },
        { tab: 'wallet', sheetId: 'sheet-receive', selector: '#view-wallet button[onclick*="openReceiveSheet"]' },
        { tab: 'hub', sheetId: 'sheet-mining-pro', selector: '#view-hub button[onclick*="openMiningProSheet"]' },
        { tab: 'hub', sheetId: 'sheet-near-storage', selector: '#view-hub button[onclick*="openNearStorageReclaimSheet"]' },
        { tab: 'hub', sheetId: 'sheet-near-account', selector: '#view-hub button[onclick*="openNearAccountSheet"]' }
      ]) {
        await session.switchTab(sheetTrigger.tab);
        await session.click(sheetTrigger.selector);
        if (sheetTrigger.sheetId === 'sheet-mining-pro') {
          await new Promise((r) => setTimeout(r, 30));
          await session.flushMicrotasks(12);
        }
        assert.equal(
          session.hasClass(`#${sheetTrigger.sheetId}`, 'open'),
          true,
          `UI trigger ${sheetTrigger.selector} must open #${sheetTrigger.sheetId}`
        );
        assertZeroDevJargon(session.getVisibleText(`#${sheetTrigger.sheetId}`), `${sheetTrigger.sheetId} (${langTag})`);
        await session.closeSheet(sheetTrigger.sheetId);
      }
    }
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('Tier 2.2: server.js proxies reject missing/disallowed paths, SSRF tricks & oversized payloads without outbound calls', async () => {
  const srv = await startTestServer();
  try {
    const optRes = await fetch(`${srv.baseUrl}/nearcom-proxy`, { method: 'OPTIONS' });
    assert.equal(optRes.status, 204);
    assert.equal(optRes.headers.get('access-control-allow-origin'), '*');

    const badProxyUrls = [
      '/pearl-proxy',
      '/pearl-proxy?path=/etc/passwd',
      '/pearl-proxy?path=/api/v2/../../secret',
      '/pearl-proxy?path=//evil.com/api/v2/tx',
      '/pearl-proxy?path=/api/v2/@evil.com',
      '/kryptex-proxy?path=/wrong/prefix',
      '/kryptex-proxy?path=' + encodeURIComponent('/api/stats Host:evil.com'),
      '/nearcom-proxy?path=/api/admin/hack'
    ];
    for (const p of badProxyUrls) {
      const res = await fetch(`${srv.baseUrl}${p}`);
      assert.equal(res.status, 400, `Expected 400 for ${p}, got ${res.status}`);
      const json = await res.json();
      assert.equal(json.error, 'Invalid path parameter');
    }

    const oversizedBody = 'x'.repeat(270 * 1024);
    for (const postPath of ['/nearcom-proxy?path=/api/swap/quote', '/pearl-proxy?path=/api/v2/sendtx/']) {
      const res = await fetch(`${srv.baseUrl}${postPath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversizedBody
      });
      assert.equal(res.status, 413, `Expected 413 for oversized POST to ${postPath}, got ${res.status}`);
      const json = await res.json();
      assert.equal(json.error, 'Payload Too Large');
    }
  } finally {
    await srv.close();
  }
});

test('Tier 2.3: server.js blocks path traversal, dotfiles, sensitive files & malformed percent encoding', async () => {
  const srv = await startTestServer();
  try {
    const forbiddenPaths = [
      '/../package.json',
      '/%2e%2e/server.js',
      '/server.js',
      '/package.json',
      '/test/helpers.js',
      '/.git/HEAD'
    ];
    for (const p of forbiddenPaths) {
      const res = await fetch(`${srv.baseUrl}${p}`);
      assert.equal(res.status, 403, `Expected 403 for ${p}, got ${res.status}`);
      await res.text();
    }

    const badReq = await rawHttpGet(`${srv.baseUrl}/%ZZ`);
    assert.equal(badReq.status, 400);

    const missing = await fetch(`${srv.baseUrl}/nonexistent-e2e-probe-99999.js`);
    assert.equal(missing.status, 404);
    await missing.text();
  } finally {
    await srv.close();
  }
});

test('Tier 2.4: [POST-FIX] Live language switch re-renders open sheet-earn-stake, fixes sheet-perp-tpsl Pair label & respects dynamic/title attrs', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    // 1. Open Earn stake sheet from Wallet -> Token Detail (openTokenDetailPool switches activeTab to 'earn'),
    // and verify language toggle re-renders the open sheet-earn-stake lockup notice.
    await session.click('[data-action="open-token-detail"][data-symbol="NEAR"]');
    const poolAction = session.document.querySelector('[data-action="open-token-detail-pool"]');
    assert.ok(poolAction, 'Expected Earn pool card inside NEAR token detail sheet');
    poolAction.click();
    await session.flushMicrotasks(8);
    assert.equal(session.hasClass('#sheet-earn-stake', 'open'), true);

    await session.click('#header-lang-btn'); // zh -> en while sheet-earn-stake is open
    const lockupNoticeEn = session.getVisibleText('#earn-lockup-notice');
    assert.ok(
      lockupNoticeEn.length > 0 && !/[\u4e00-\u9fff]/.test(lockupNoticeEn),
      `Open sheet-earn-stake lockup notice must re-render in English on language switch, got "${lockupNoticeEn}"`
    );
    await session.closeSheet('sheet-earn-stake');

    // 2. Verify sheet-perp-tpsl first row key does NOT render "Pair / Vol"
    await session.openSheet('sheet-perp-tpsl');
    const firstKeyText = session.getVisibleText('#sheet-perp-tpsl .meta-row .meta-key');
    assert.notEqual(
      firstKeyText,
      'Pair / Vol',
      'sheet-perp-tpsl pair label must NOT reuse perp.colContractVol ("Pair / Vol")'
    );
    await session.closeSheet('sheet-perp-tpsl');

    // 3. Verify a real app data-i18n-dynamic="1" element (#qr-scanner-status) and data-i18n-placeholder across language switches
    session.window.navigator.mediaDevices = {
      getUserMedia: async () => { throw new Error('Permission denied'); }
    };
    await session.switchTab('wallet');
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    const recipientPlaceholderEn = session.document.getElementById('send-recipient-input').getAttribute('placeholder');
    await session.click('#sheet-send button[onclick*="openQrScannerSheet"]');
    await session.flushMicrotasks(10);
    const qrStatusEl = session.document.getElementById('qr-scanner-status');
    assert.equal(qrStatusEl.getAttribute('data-i18n-dynamic'), '1');
    const qrDynamicBeforeSwitch = qrStatusEl.textContent;
    assert.ok(qrDynamicBeforeSwitch.length > 0);

    await session.click('#header-lang-btn'); // en -> zh
    assert.equal(
      qrStatusEl.textContent,
      qrDynamicBeforeSwitch,
      'Real app element with data-i18n-dynamic="1" must not be overwritten by static i18nDict on language toggle'
    );
    const recipientPlaceholderZh = session.document.getElementById('send-recipient-input').getAttribute('placeholder');
    assert.notEqual(
      recipientPlaceholderZh,
      recipientPlaceholderEn,
      'data-i18n-placeholder must update when language toggles'
    );
    await session.closeSheet('sheet-qr-scanner');

    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('Tier 2.5: [POST-FIX] Upstream HTTP 403/429/CORS/RPC failures surface sanitized user-friendly toasts & banners', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: async (url) => {
      if (/blockbook|pearl-proxy/i.test(url)) {
        return mockJsonResponse({ error: 'Blockbook HTTP 403 Forbidden via CORS' }, 403);
      }
      if (/1click|swap|quote/i.test(url)) {
        return mockJsonResponse({ message: '1Click HTTP 429 Ref Finance rate limit' }, 429);
      }
      throw new TypeError('Failed to fetch: ECONNREFUSED 127.0.0.1:443');
    }
  });
  try {
    await session.click('#btn-home-refresh');
    await session.flushMicrotasks(12);

    await session.switchTab('swap');
    await session.setInputValue('#swap-amount-in', '1.5');
    await new Promise((r) => setTimeout(r, 450));
    await session.flushMicrotasks(12);

    await session.switchTab('earn');
    await session.click('#view-earn button[onclick*="refreshStakingMetrics"]');
    await session.flushMicrotasks(12);

    await session.openSheet('sheet-mining-pro');
    await session.setInputValue('#mining-address-input', wallet.address);
    await session.click('#sheet-mining-pro button[onclick*="runMiningDeepQuery"]');
    await new Promise((r) => setTimeout(r, 40));
    await session.flushMicrotasks(12);

    for (const toast of session.getToastHistory()) {
      assertZeroDevJargon(toast.text, 'runtime toast');
    }
    for (const bannerSel of ['#swap-error-banner', '#perp-error-banner', '#limit-error-banner', '#mining-error-banner']) {
      const txt = session.getVisibleText(bannerSel);
      if (txt) assertZeroDevJargon(txt, bannerSel);
    }
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});

test('Tier 2.6: Corrupted storage & unsupported language degrade safely; Perp chart vertical swipe preserves page scroll', async () => {
  // Part A: Corrupted wallets + invalid language code
  const brokenSession = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_lang_v1: 'xx-UNSUPPORTED',
      near_ca_wallets_v1: '{broken-json-payload'
    }
  });
  try {
    assert.equal(brokenSession.document.documentElement.lang, 'zh-CN');
    assert.equal(brokenSession.isVisible('#view-onboarding'), true);
    assert.equal(brokenSession.isVisible('#bottom-nav'), false);
    assert.equal(brokenSession.getVisibleText('#hero-total-usd'), '--');
  } finally {
    brokenSession.cleanup();
  }

  // Part B: Perp chart vertical touch gesture escapes to vertical scroll without preventDefault()
  const wallet = createSeededWallet();
  const chartSession = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    },
    fetchMock: createReadOnlyHyperliquidFetchMock()
  });
  try {
    await chartSession.switchTab('perp');
    await chartSession.waitFor(() => chartSession.document.querySelector('[data-action="open-perp-trade"]'), 2000);
    await chartSession.click('[data-action="open-perp-trade"]');
    await chartSession.waitFor(() => chartSession.document.querySelector('#perp-chart-svg svg'), 2000);

    const chartHost = chartSession.document.getElementById('perp-chart-svg');
    const Ev = chartSession.window.Event;

    const tsVert = new Ev('touchstart', { bubbles: true, cancelable: true, touches: [{ clientX: 120, clientY: 100 }] });
    chartHost.dispatchEvent(tsVert);
    const tmVert = new Ev('touchmove', { bubbles: true, cancelable: true, touches: [{ clientX: 122, clientY: 145 }] });
    chartHost.dispatchEvent(tmVert);
    assert.equal(tmVert.defaultPrevented, false, 'Vertical scroll gesture (>6px dy) must NOT call preventDefault()');
    chartHost.dispatchEvent(new Ev('touchend', { bubbles: true, cancelable: true }));

    const tsHoriz = new Ev('touchstart', { bubbles: true, cancelable: true, touches: [{ clientX: 120, clientY: 100 }] });
    chartHost.dispatchEvent(tsHoriz);
    const tmHoriz = new Ev('touchmove', { bubbles: true, cancelable: true, touches: [{ clientX: 170, clientY: 101 }] });
    chartHost.dispatchEvent(tmHoriz);
    assert.equal(tmHoriz.defaultPrevented, true, 'Horizontal candle pan (>8px dx) must handle pan and call preventDefault()');
    chartHost.dispatchEvent(new Ev('touchend', { bubbles: true, cancelable: true }));

    chartSession.assertNoRealBroadcasts();
  } finally {
    chartSession.cleanup();
  }
});

test('Tier 2.7: Form lifecycle dual-reset on sheet close & swap flip; Broadcast Safety Guard blocks all real broadcasts', async () => {
  const wallet = createSeededWallet();
  const session = await createWalletAppSession({
    viewportWidth: 375,
    localStorage: {
      near_ca_wallets_v1: JSON.stringify({ wallets: [wallet], activeWalletId: wallet.id })
    }
  });
  try {
    // 1. Send sheet inputs cleared on backdrop close
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    await session.setInputValue('#send-recipient-input', 'alice.near');
    await session.setInputValue('#send-amount-input', '12.5');
    assert.equal(session.document.getElementById('send-recipient-input').value, 'alice.near');
    assert.equal(session.document.getElementById('send-amount-input').value, '12.5');

    await session.closeSheet('sheet-send');
    await session.click('#view-wallet button[onclick*="openSendSheet"]');
    assert.equal(session.document.getElementById('send-recipient-input').value, '');
    assert.equal(session.document.getElementById('send-amount-input').value, '');
    await session.closeSheet('sheet-send');

    // 2. Swap input cleared on pair flip
    await session.switchTab('swap');
    await session.setInputValue('#swap-amount-in', '99');
    assert.equal(session.document.getElementById('swap-amount-in').value, '99');
    await session.click('.swap-flip-btn');
    assert.equal(session.document.getElementById('swap-amount-in').value, '');

    // 3. Broadcast Safety Guard blocks real EVM / NEAR / Hyperliquid / encoded-proxy / Request+Uint8Array mutations
    await assert.rejects(
      () => session.window.fetch('https://eth.llamarpc.com', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: ['0x01'] })
      }),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch('https://rpc.mainnet.near.org', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'broadcast_tx_commit', params: ['AAAA'] })
      }),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch('https://rpc.mainnet.near.org', {
        method: 'POST',
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'send_tx', params: { signed_tx_base64: 'AAAA' } })
      }),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch('https://api.hyperliquid.xyz/exchange', {
        method: 'POST',
        body: JSON.stringify({ action: { type: 'order' } })
      }),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch('/pearl-proxy?path=%2Fapi%2Fv2%2Fsendtx%2F', {
        method: 'POST',
        body: '02000001deadbeef'
      }),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch('/nearcom-proxy?path=%2Fapi%2Fswap%2Fsubmit', {
        method: 'POST',
        body: JSON.stringify({ intentId: 'e2e_test' })
      }),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch(new session.window.Request('https://eth.llamarpc.com', {
        method: 'POST',
        body: new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_sendRawTransaction', params: ['0x02'] }))
      })),
      /E2E_BROADCAST_BLOCKED/
    );
    await assert.rejects(
      () => session.window.fetch(new Request('https://eth.llamarpc.com', {
        method: 'POST',
        body: new TextEncoder().encode(JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'eth_sendRawTransaction', params: ['0x03'] }))
      })),
      /E2E_BROADCAST_BLOCKED/
    );

    const blocked = session.getNetworkLog().filter((x) => x.blocked);
    assert.equal(blocked.length, 8);
    assert.ok(blocked.every((x) => x.realNetworkSent === false));
    session.assertNoRealBroadcasts();
  } finally {
    session.cleanup();
  }
});
