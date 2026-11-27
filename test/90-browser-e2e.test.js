'use strict';

/**
 * Real-Browser Headless Chrome/Edge E2E Suite (375x812 Mobile Viewport, CDP)
 * Included in `npm test` (`node --test test/*.test.js`).
 * Loads real `dist/` bundle (Preact single-root App + style.css) with deterministic network mocks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function findBrowserBin() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function startDistServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
      const full = path.resolve(DIST_DIR, rel);
      if (!full.startsWith(DIST_DIR) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(full).toLowerCase();
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

function buildMockPerpMetaAndAssetCtxs() {
  const names = [
    'BTC', 'ETH', 'SOL', 'HYPE', 'DOGE', 'PEPE', 'WIF', 'SUI', 'NEAR', 'AVAX',
    'LINK', 'ARB', 'OP', 'APT', 'SEI', 'TIA', 'INJ', 'RNDR', 'FET', 'TAO',
    'TON', 'XRP', 'ADA', 'DOT', 'ATOM', 'LTC', 'BCH', 'UNI', 'AAVE', 'MKR',
    'CRV', 'LDO', 'ENA', 'PENDLE', 'JUP', 'PYTH', 'BONK', 'ORDI', 'RUNE', 'STX',
    'FIL', 'ICP', 'KAS', 'TRX'
  ];
  const universe = names.map((name, i) => ({
    name,
    szDecimals: i < 2 ? 4 : 2,
    maxLeverage: i < 3 ? 50 : 20,
    onlyIsolated: false
  }));
  const ctxs = names.map((_, i) => {
    const px = i === 0 ? 95000 : i === 1 ? 3400 : Math.max(0.5, 120 - i * 2.1);
    return {
      funding: '0.0000125',
      openInterest: String(100000 + i * 1000),
      prevDayPx: String((px * 0.98).toFixed(4)),
      dayNtlVlm: String(50000000 - i * 800000),
      premium: '0.0001',
      oraclePx: String(px),
      markPx: String(px),
      midPx: String(px)
    };
  });
  return [{ universe }, ctxs];
}

function buildMockL2Book(coin) {
  const base = coin === 'BTC' ? 95000 : 10;
  return {
    coin,
    time: Date.now(),
    levels: [
      Array.from({ length: 8 }, (_, i) => ({ px: String((base - (i + 1) * 0.1).toFixed(2)), sz: '10.5', n: 2 })),
      Array.from({ length: 8 }, (_, i) => ({ px: String((base + (i + 1) * 0.1).toFixed(2)), sz: '9.8', n: 2 }))
    ]
  };
}

async function launchBrowser(binPath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-e2e-'));
  const proc = spawn(binPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for browser DevTools WS URL')), 10000);
    const onData = (chunk) => {
      const m = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    };
    proc.stderr.on('data', onData);
    proc.stdout.on('data', onData);
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Browser exited early with code ${code}`));
    });
  });

  const baseHttp = wsUrl.replace(/^ws:/, 'http:').replace(/\/devtools\/browser\/.*$/, '');
  const targets = await (await fetch(`${baseHttp}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  if (!pageTarget || !pageTarget.webSocketDebuggerUrl) {
    throw new Error('No page target found in DevTools');
  }

  return { proc, userDataDir, pageWsUrl: pageTarget.webSocketDebuggerUrl };
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method && listeners.has(msg.method)) {
      for (const fn of listeners.get(msg.method)) fn(msg.params || {});
    }
  });

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', (e) => reject(new Error(e.message || 'CDP WebSocket error')), { once: true });
  });

  async function send(method, params = {}) {
    await ready;
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  function on(method, fn) {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(fn);
  }

  async function evalJs(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Page JS Exception: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result ? res.result.value : undefined;
  }

  function close() {
    try { ws.close(); } catch (_) {}
  }

  return { send, on, evalJs, close };
}

const browserBin = findBrowserBin();
const hasDist = fs.existsSync(path.join(DIST_DIR, 'index.html'));

test.describe('Real-Browser 375px Preact E2E Suite', { skip: !browserBin || !hasDist }, () => {
  let server;
  let baseUrl;
  let browser;
  let cdp;
  const pageErrors = [];
  const consoleErrors = [];

  test.before(async () => {
    const srv = await startDistServer();
    server = srv.server;
    baseUrl = srv.baseUrl;
    browser = await launchBrowser(browserBin);
    cdp = createCdpClient(browser.pageWsUrl);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });

    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    const mockMeta = buildMockPerpMetaAndAssetCtxs();
    cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
      const url = request.url || '';
      if (url.startsWith(baseUrl)) {
        await cdp.send('Fetch.continueRequest', { requestId }).catch(() => {});
        return;
      }
      if (request.method === 'OPTIONS') {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 204,
          responseHeaders: [
            { name: 'access-control-allow-origin', value: '*' },
            { name: 'access-control-allow-methods', value: 'GET, POST, OPTIONS' },
            { name: 'access-control-allow-headers', value: '*' }
          ],
          body: ''
        }).catch(() => {});
        return;
      }
      let bodyObj = {};
      if (url.includes('api.hyperliquid.xyz/info')) {
        let parsed = {};
        try { parsed = JSON.parse(request.postData || '{}'); } catch (_) {}
        if (parsed.type === 'metaAndAssetCtxs') bodyObj = mockMeta;
        else if (parsed.type === 'perpDexs') bodyObj = [null];
        else if (parsed.type === 'l2Book') bodyObj = buildMockL2Book(parsed.coin || 'BTC');
        else if (parsed.type === 'candleSnapshot') bodyObj = [];
        else if (parsed.type === 'clearinghouseState') bodyObj = { marginSummary: { accountValue: '100', totalMarginUsed: '0' }, withdrawable: '100', assetPositions: [] };
        else if (parsed.type === 'openOrders' || parsed.type === 'userFills') bodyObj = [];
      } else if (url.includes('1click.chaindefuser.com/v0/tokens')) {
        bodyObj = [{ assetId: 'nep141:wrap.near', symbol: 'NEAR', decimals: 24, price: 5.2, blockchain: 'near' }];
      }
      const b64 = Buffer.from(JSON.stringify(bodyObj)).toString('base64');
      await cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'content-type', value: 'application/json' },
          { name: 'access-control-allow-origin', value: '*' }
        ],
        body: b64
      }).catch(() => {});
    });

    cdp.on('Runtime.exceptionThrown', (ev) => {
      pageErrors.push(ev.exceptionDetails?.text || 'Uncaught exception');
    });
    cdp.on('Runtime.consoleAPICalled', (ev) => {
      if (ev.type === 'error') {
        const txt = (ev.args || []).map((a) => a.value || a.description || '').join(' ');
        if (!txt.includes('WebSocket')) consoleErrors.push(txt);
      }
    });

    await cdp.send('Page.navigate', { url: baseUrl });
    await new Promise((r) => setTimeout(r, 700));
  });

  test.after(() => {
    if (cdp) cdp.close();
    if (browser && browser.proc) {
      try { browser.proc.kill('SIGKILL'); } catch (_) {}
    }
    if (server) {
      try { server.close(); } catch (_) {}
    }
    if (browser && browser.userDataDir) {
      try { fs.rmSync(browser.userDataDir, { recursive: true, force: true }); } catch (_) {}
    }
  });

  test('E2E 1: Preact #app-root mounts, 375px zero overflow, and zero in-app PIN modal', async () => {
    const mounted = await cdp.evalJs(`Boolean(document.querySelector('#app-root') && document.querySelector('#app-root').children.length > 0)`);
    assert.equal(mounted, true, 'Preact #app-root must mount');

    const overflowInit = await cdp.evalJs(`document.documentElement.scrollWidth <= 375`);
    assert.equal(overflowInit, true, '375px initial viewport must not overflow horizontally');

    const hasPinModal = await cdp.evalJs(`Boolean(document.getElementById('nexus-pin-modal'))`);
    assert.equal(hasPinModal, false, 'In-app PIN modal must NOT exist');
  });

  test('E2E 2: Seeded wallet SWR boot renders Home assets immediately', async () => {
    await cdp.evalJs(`(() => {
      const w = {
        id: 'e2e_browser_w1',
        name: 'Browser E2E',
        accountType: 'standard',
        nearAddress: '111122223333444455556666777788889999aaaabbbbccccddddeeeeffff0000',
        nearPublicKey: 'ed25519:5J8Wx5fKx8F2o1V9Q3nP7sL6mK9rT2uV4wX6yZ8aB1cD',
        evmAddress: '0x1111111111111111111111111111111111111111',
        mpcEvmAddress: '0x1111111111111111111111111111111111111111',
        solAddress: '11111111111111111111111111111111',
        address: 'prl1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq000000',
        btcAddress: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        nativeBalances: { near: 10, sol: 1, eth: 0.5, prl: 50, btc: 0.01 }
      };
      localStorage.setItem('near_ca_wallets_v1', JSON.stringify({ wallets: [w], activeWalletId: w.id }));
      localStorage.setItem('near_ca_lang_v1', 'zh');
      return true;
    })()`);

    await cdp.send('Page.reload', { ignoreCache: false });
    await new Promise((r) => setTimeout(r, 800));

    const walletRendered = await cdp.evalJs(`(() => {
      const w = window.NearCAState && window.NearCAState.getActiveWallet && window.NearCAState.getActiveWallet();
      return Boolean(w && w.name === 'Browser E2E' && !document.getElementById('view-wallet')?.classList.contains('hidden'));
    })()`);
    assert.equal(walletRendered, true, 'Seeded wallet must boot straight into Home view');
  });

  test('E2E 3: Live bilingual zh <-> en toggle updates DOM and contains zero developer jargon', async () => {
    await cdp.evalJs(`document.getElementById('header-lang-btn').click()`);
    await new Promise((r) => setTimeout(r, 80));
    const enCheck = await cdp.evalJs(`(() => {
      const navTexts = Array.from(document.querySelectorAll('.bottom-nav .nav-item')).map(el => el.textContent.trim()).join('|');
      const bodyText = document.body.innerText || '';
      return { navTexts, hasJargon: /\\b(WebView|CORS|HTTP 403|HTTP 429|RPC Error)\\b/i.test(bodyText) };
    })()`);
    assert.ok(/Swap|Wallet/i.test(enCheck.navTexts), `Expected English nav labels, got ${enCheck.navTexts}`);
    assert.equal(enCheck.hasJargon, false, 'Rendered English UI must contain zero developer jargon');

    await cdp.evalJs(`document.getElementById('header-lang-btn').click()`);
    await new Promise((r) => setTimeout(r, 80));
    const zhNav = await cdp.evalJs(`Array.from(document.querySelectorAll('.bottom-nav .nav-item')).map(el => el.textContent.trim()).join('|')`);
    assert.ok(/闪兑|资产/.test(zhNav), `Expected Chinese nav labels, got ${zhNav}`);
  });

  test('E2E 4: Send sheet form lifecycle dual-clear on close', async () => {
    const cleared = await cdp.evalJs(`(() => {
      window.openSendSheet();
      const rec = document.getElementById('send-recipient-input');
      const amt = document.getElementById('send-amount-input');
      if (!rec || !amt) return false;
      rec.value = 'alice.near';
      amt.value = '1.25';
      window.closeAllSheets();
      window.openSendSheet();
      const ok = rec.value === '' && amt.value === '' && window.NearCAState.send.recipient === '' && window.NearCAState.send.amount === '';
      window.closeAllSheets();
      return ok;
    })()`);
    assert.equal(cleared, true, 'Closing Send sheet must clear both State and DOM inputs');
  });

  test('E2E 5: Swap & Limit mode switch + flip clears amount input and fits 375px', async () => {
    await cdp.evalJs(`window.switchTab('swap')`);
    await new Promise((r) => setTimeout(r, 150));

    const swapOk = await cdp.evalJs(`(() => {
      const inp = document.getElementById('swap-amount-in');
      const flipBtn = document.querySelector('#swap-market-panel .swap-flip-btn');
      if (!inp || !flipBtn) return false;
      inp.value = '12.34';
      window.NearCAState.swap.amountIn = '12.34';
      flipBtn.click();
      const flippedCleared = inp.value === '' && window.NearCAState.swap.amountIn === '';
      const limitBtn = document.getElementById('swap-mode-limit-btn');
      if (limitBtn) limitBtn.click();
      const marketBtn = document.getElementById('swap-mode-market-btn');
      if (marketBtn) marketBtn.click();
      return flippedCleared && document.documentElement.scrollWidth <= 375;
    })()`);
    assert.equal(swapOk, true, 'Swap flip must clear amount and Swap/Limit must fit 375px');
  });

  test('E2E 6: Perps overview scroll -> trade detail starts at top (y=0) -> declarative active -> back restores scroll', async () => {
    await cdp.evalJs(`window.switchTab('perp')`);

    let marketCount = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      marketCount = await cdp.evalJs(`document.querySelectorAll('#perp-overview-list .perp-overview-row').length`);
      if (marketCount >= 30) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(marketCount >= 30, `Expected >= 30 perp markets rendered, got ${marketCount}`);

    await new Promise((r) => setTimeout(r, 100));
    await cdp.evalJs(`(() => {
      const items = document.querySelectorAll('#perp-overview-list .perp-overview-row');
      const last = items[items.length - 1];
      if (last) last.scrollIntoView({ block: 'center' });
      if ((window.scrollY || 0) === 0) window.scrollTo(0, 1200);
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 80));
    const scrolledY = await cdp.evalJs(`window.scrollY || document.documentElement.scrollTop || 0`);
    assert.ok(scrolledY > 200, `Expected scrolledY > 200 after scrolling to bottom market, got ${scrolledY}`);

    await cdp.evalJs(`(() => {
      const items = document.querySelectorAll('#perp-overview-list .perp-overview-row');
      items[items.length - 1].click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const detailScrollY = await cdp.evalJs(`window.scrollY`);
    assert.equal(detailScrollY, 0, `Perp trade detail MUST start at top (scrollY === 0), got ${detailScrollY}`);

    await cdp.evalJs(`(() => {
      const p1h = document.querySelector('#perp-interval-pills [data-iv="1h"]');
      if (p1h) p1h.click();
      const crossBtn = document.getElementById('perp-mode-cross');
      if (crossBtn) crossBtn.click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 80));

    const perpActiveOk = await cdp.evalJs(`(() => {
      const p1h = document.querySelector('#perp-interval-pills [data-iv="1h"]');
      const crossBtn = document.getElementById('perp-mode-cross');
      return Boolean(p1h && p1h.classList.contains('active') && crossBtn && crossBtn.classList.contains('active'));
    })()`);
    assert.equal(perpActiveOk, true, 'PerpsView declarative active classes must update on interval/margin click');

    await cdp.evalJs(`(() => {
      const backBtn = document.getElementById('btn-perp-back');
      if (backBtn) backBtn.click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 180));

    const restoredScrollY = await cdp.evalJs(`window.scrollY`);
    assert.ok(restoredScrollY > 150, `Expected overview scrollY > 150 restored on back, got ${restoredScrollY}`);
  });

  test('E2E 7: All main tabs fit 375px width with zero console/page errors', async () => {
    for (const tab of ['wallet', 'swap', 'perp', 'earn', 'hub']) {
      await cdp.evalJs(`window.switchTab('${tab}')`);
      await new Promise((r) => setTimeout(r, 100));
      const fits = await cdp.evalJs(`document.documentElement.scrollWidth <= 375`);
      assert.equal(fits, true, `Tab ${tab} must fit 375px width without horizontal overflow`);
    }
    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join('; ')}`);
    assert.equal(consoleErrors.length, 0, `Unexpected console errors: ${consoleErrors.join('; ')}`);
  });
});
