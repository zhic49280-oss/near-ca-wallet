#!/usr/bin/env node
'use strict';

/**
 * Real-Browser Headless Chrome/Edge E2E Test (375x812 Mobile Viewport, CDP)
 * Usage: node scripts/e2e-browser.mjs
 * Requires `npm run build` (`dist/` must exist). Zero external network calls.
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No headless Chrome/Edge binary found on this machine.');
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

  return {
    proc,
    userDataDir,
    pageWsUrl: pageTarget.webSocketDebuggerUrl
  };
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

async function run() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    throw new Error('dist/index.html missing — run `npm run build` first.');
  }

  const binPath = findBrowserBin();
  const { server, baseUrl } = await startDistServer();
  const browser = await launchBrowser(binPath);
  const cdp = createCdpClient(browser.pageWsUrl);

  const pageErrors = [];
  const consoleErrors = [];

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true
    });

    // Intercept external network requests deterministically
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
        else if (parsed.type === 'openOrders') bodyObj = [];
        else if (parsed.type === 'userFills') bodyObj = [];
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

    // Load page & seed wallet into localStorage
    await cdp.send('Page.navigate', { url: baseUrl });
    await new Promise((r) => setTimeout(r, 800));

    const mounted = await cdp.evalJs(`Boolean(document.querySelector('#app-root') && document.querySelector('#app-root').children.length > 0)`);
    assert.equal(mounted, true, 'Preact #app-root must mount');

    const overflowInit = await cdp.evalJs(`document.documentElement.scrollWidth <= 375`);
    assert.equal(overflowInit, true, '375px initial viewport must not overflow horizontally');

    // Inject seeded wallet and reload to test SWR boot
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
    await new Promise((r) => setTimeout(r, 900));

    // Verify no in-app PIN modal exists
    const hasPinModal = await cdp.evalJs(`Boolean(document.getElementById('nexus-pin-modal'))`);
    assert.equal(hasPinModal, false, 'In-app PIN modal must NOT exist');

    // Verify Perps overview scroll -> trade detail starts at top -> back restores scroll
    await cdp.evalJs(`(() => {
      window.switchTab('perp');
      return true;
    })()`);

    let marketCount = 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      marketCount = await cdp.evalJs(`document.querySelectorAll('#perp-overview-list .perp-overview-row').length`);
      if (marketCount >= 30) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    if (marketCount < 30) {
      const dbg = await cdp.evalJs(`JSON.stringify({
        activeTab: window.NearCAState?.activeTab,
        hasWallet: Boolean(window.NearCAState?.getActiveWallet?.()),
        marketsLen: window.NearCAState?.perp?.markets?.length,
        listText: document.getElementById('perp-overview-list')?.textContent?.slice(0, 120)
      })`);
      throw new Error(`Expected >= 30 perp markets rendered, got ${marketCount}. Debug: ${dbg}`);
    }

    const scrolledY = await cdp.evalJs(`(() => {
      const items = document.querySelectorAll('#perp-overview-list .perp-overview-row');
      const target = items[items.length - 1];
      target.scrollIntoView({ block: 'center' });
      return window.scrollY;
    })()`);
    assert.ok(scrolledY > 200, `Expected scrolledY > 200 after scrolling to bottom market, got ${scrolledY}`);

    // Click bottom market item to open trade detail
    await cdp.evalJs(`(() => {
      const items = document.querySelectorAll('#perp-overview-list .perp-overview-row');
      items[items.length - 1].click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 250));

    const detailScrollY = await cdp.evalJs(`window.scrollY`);
    assert.equal(detailScrollY, 0, `Perp trade detail MUST start at top (scrollY === 0), got ${detailScrollY}`);

    // Verify declarative active classes on PerpsView (click 1h pill and Cross margin)
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

    // Go back to overview and verify scroll position restored
    await cdp.evalJs(`(() => {
      const backBtn = document.getElementById('btn-perp-back');
      if (backBtn) backBtn.click();
      return true;
    })()`);
    await new Promise((r) => setTimeout(r, 200));

    const restoredScrollY = await cdp.evalJs(`window.scrollY`);
    assert.ok(restoredScrollY > 150, `Expected overview scrollY > 150 restored on back, got ${restoredScrollY}`);

    // Verify bilingual toggle & 375px horizontal fit across tabs
    for (const tab of ['wallet', 'swap', 'hub']) {
      await cdp.evalJs(`window.switchTab('${tab}')`);
      await new Promise((r) => setTimeout(r, 150));
      const fits = await cdp.evalJs(`document.documentElement.scrollWidth <= 375`);
      assert.equal(fits, true, `Tab ${tab} must fit 375px width without horizontal overflow`);
    }

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join('; ')}`);
    assert.equal(consoleErrors.length, 0, `Unexpected console errors: ${consoleErrors.join('; ')}`);

    console.log('PASS: Real-Browser 375px CDP E2E (SWR boot, Perps scroll-to-top & restore, Preact active state, zero PIN modal, zero overflow, zero errors)');
  } finally {
    cdp.close();
    try { browser.proc.kill('SIGKILL'); } catch (_) {}
    server.close();
    try { fs.rmSync(browser.userDataDir, { recursive: true, force: true }); } catch (_) {}
  }
}

run().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
