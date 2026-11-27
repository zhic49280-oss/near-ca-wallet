'use strict';

/**
 * Real-Browser Headless Chrome/Edge E2E Suite (375x812 Mobile Viewport, CDP)
 * Included in `npm test` (`node --test test/*.test.js`).
 * Exercises real UI clicks, real DOM input events, real Preact rendering,
 * real scrolling/layout, and upstream 429/500 fault injection.
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
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

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

  async function clickReal(selector) {
    const ok = await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'MISSING';
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return 'HIDDEN';
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      el.click();
      return 'OK';
    })()`);
    assert.equal(ok, 'OK', `clickReal(${selector}) failed: ${ok}`);
  }

  async function typeReal(selector, value) {
    const ok = await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return 'MISSING';
      el.focus();
      el.value = ${JSON.stringify(String(value))};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'OK';
    })()`);
    assert.equal(ok, 'OK', `typeReal(${selector}) failed: ${ok}`);
  }

  async function waitFor(predicateJs, timeoutMs = 4000, label = 'condition') {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await evalJs(predicateJs)) return;
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(`Timed out waiting for ${label} (${timeoutMs}ms)`);
  }

  function close() {
    try { ws.close(); } catch (_) {}
  }

  return { send, on, evalJs, clickReal, typeReal, waitFor, close };
}

const browserBin = findBrowserBin();
const hasDist = fs.existsSync(path.join(DIST_DIR, 'index.html'));
const hasWebSocket = typeof WebSocket !== 'undefined';

test.describe('Real-Browser 375px Preact E2E Suite (10 Real-Click Journeys)', { skip: !browserBin || !hasDist || !hasWebSocket }, () => {
  let server;
  let baseUrl;
  let browser;
  let cdp;
  let injectFaults = false;
  let perpOrderAttempts = 0;
  let sendRpcAttempts = 0;
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
      if (injectFaults) {
        const status = url.includes('1click') ? 429 : 500;
        const b64Err = Buffer.from(JSON.stringify({ error: 'Upstream overloaded' })).toString('base64');
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: status,
          responseHeaders: [
            { name: 'content-type', value: 'application/json' },
            { name: 'access-control-allow-origin', value: '*' }
          ],
          body: b64Err
        }).catch(() => {});
        return;
      }

      let bodyObj = {};
      if (url.includes('api.hyperliquid.xyz/exchange')) {
        perpOrderAttempts += 1;
        bodyObj = { status: 'err', response: 'Blocked by E2E guard' };
      } else if (/broadcast_tx|send_tx|eth_sendRawTransaction|sendTransaction/i.test(request.postData || '')) {
        sendRpcAttempts += 1;
        bodyObj = { error: 'Blocked by E2E send guard' };
      } else if (url.includes('api.hyperliquid.xyz/info')) {
        let parsed = {};
        try { parsed = JSON.parse(request.postData || '{}'); } catch (_) {}
        if (parsed.type === 'metaAndAssetCtxs') bodyObj = mockMeta;
        else if (parsed.type === 'perpDexs') bodyObj = [null];
        else if (parsed.type === 'l2Book') bodyObj = buildMockL2Book(parsed.coin || 'BTC');
        else if (parsed.type === 'candleSnapshot') bodyObj = [];
        else if (parsed.type === 'clearinghouseState') bodyObj = { marginSummary: { accountValue: '100', totalMarginUsed: '0' }, withdrawable: '100', assetPositions: [] };
        else if (parsed.type === 'openOrders' || parsed.type === 'userFills') bodyObj = [];
      } else if (url.includes('1click.chaindefuser.com/v0/quote')) {
        bodyObj = {
          quote: {
            amountIn: '1000000000000000000000000',
            amountInFormatted: '1',
            amountInUsd: '5.20',
            amountOut: '5180000',
            amountOutFormatted: '5.18',
            amountOutUsd: '5.18',
            depositAddress: 'e2e-deposit.near'
          },
          depositAddress: 'e2e-deposit.near'
        };
      } else if (url.includes('1click.chaindefuser.com/v0/tokens')) {
        bodyObj = [
          { assetId: 'nep141:wrap.near', symbol: 'NEAR', decimals: 24, price: 5.2, blockchain: 'near' },
          { assetId: '1cs_v1:eth:erc20:0x85f17cf997934a597031b2e18a9ab6ebd4b9f6a4', symbol: 'NEAR', decimals: 24, price: 5.2, blockchain: 'eth' },
          { assetId: 'nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1', symbol: 'USDC', decimals: 6, price: 1.0, blockchain: 'near' }
        ];
      } else if (request.postData && request.postData.includes('"jsonrpc"')) {
        let rpcReq = {};
        try { rpcReq = JSON.parse(request.postData || '{}'); } catch (_) {}
        if (rpcReq.method === 'query' && rpcReq.params?.request_type === 'view_account') {
          bodyObj = { jsonrpc: '2.0', id: rpcReq.id || 1, result: { amount: '0', locked: '0', storage_usage: 0 } };
        } else if (rpcReq.method === 'query' && rpcReq.params?.request_type === 'view_access_key_list') {
          bodyObj = { jsonrpc: '2.0', id: rpcReq.id || 1, result: { keys: [] } };
        } else {
          bodyObj = { jsonrpc: '2.0', id: rpcReq.id || 1, result: {} };
        }
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
        if (!txt.includes('WebSocket') && !txt.includes('429') && !txt.includes('500')) {
          consoleErrors.push(txt);
        }
      }
    });

    await cdp.send('Page.navigate', { url: baseUrl });
    await cdp.waitFor(`Boolean(document.querySelector('#app-root') && document.querySelector('#app-root').children.length > 0)`, 5000, '#app-root mount');
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

  test('E2E 1: Real onboarding Create & Import mnemonic flows persist derived multi-chain addresses without PIN modal', async () => {
    // 1a. Verify Create Wallet onboarding path
    await cdp.clickReal('#onboard-choice-panel [data-i18n="onboard.createBtn"]');
    await cdp.waitFor(`!document.getElementById('onboard-create-panel')?.classList.contains('hidden')`, 2000, 'create panel visible');
    const seedCount = await cdp.evalJs(`document.querySelectorAll('#onboard-seed-grid .seed-word').length`);
    assert.equal(seedCount, 12, 'Create Wallet must render 12 backup seed words');
    await cdp.typeReal('#onboard-create-name', 'Created E2E Wallet');
    await cdp.clickReal('#btn-confirm-create-wallet');
    await cdp.waitFor(`!document.getElementById('view-wallet')?.classList.contains('hidden')`, 5000, 'home view visible after create');

    const createdPersisted = await cdp.evalJs(`(() => {
      const raw = localStorage.getItem('near_ca_wallets_v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed?.wallets) ? parsed.wallets : (Array.isArray(parsed) ? parsed : []);
      const w = arr[0] || null;
      return w ? {
        count: arr.length,
        name: w.name,
        near: w.nearAddress || '',
        evm: w.evmAddress || '',
        sol: w.solAddress || '',
        btc: w.btcAddress || ''
      } : null;
    })()`);
    assert.ok(createdPersisted && createdPersisted.count === 1, 'Created wallet must persist in localStorage');
    assert.match(createdPersisted.near, /^[0-9a-f]{64}$/i, 'Created wallet must have valid derived NEAR address');
    assert.match(createdPersisted.evm, /^0x[0-9a-f]{40}$/i, 'Created wallet must have valid derived EVM address');
    assert.ok(createdPersisted.sol.length >= 32, 'Created wallet must have valid derived Solana address');
    assert.match(createdPersisted.btc, /^bc1/i, 'Created wallet must have valid derived BTC address');

    // 1b. Reset storage and verify Import Mnemonic onboarding path with deterministic TEST_MNEMONIC
    await cdp.evalJs(`localStorage.clear();`);
    await cdp.send('Page.reload');
    await cdp.waitFor(`Boolean(document.querySelector('#onboard-choice-panel [data-i18n="onboard.importBtn"]'))`, 5000, 'onboarding reloaded');

    await cdp.clickReal('#onboard-choice-panel [data-i18n="onboard.importBtn"]');
    await cdp.waitFor(`!document.getElementById('onboard-import-panel')?.classList.contains('hidden')`, 2000, 'import panel visible');
    await cdp.typeReal('#onboard-import-phrase', TEST_MNEMONIC);
    await cdp.typeReal('#onboard-import-name', 'Real E2E Wallet');
    await cdp.clickReal('#btn-confirm-import-wallet');

    await cdp.waitFor(`!document.getElementById('view-wallet')?.classList.contains('hidden')`, 5000, 'home view visible after import');
    const importedPersisted = await cdp.evalJs(`(() => {
      const raw = localStorage.getItem('near_ca_wallets_v1');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed?.wallets) ? parsed.wallets : (Array.isArray(parsed) ? parsed : []);
      const w = arr[0] || null;
      return w ? {
        count: arr.length,
        name: w.name,
        near: w.nearAddress || '',
        evm: w.evmAddress || '',
        sol: w.solAddress || '',
        btc: w.btcAddress || ''
      } : null;
    })()`);
    assert.ok(importedPersisted && importedPersisted.count === 1 && importedPersisted.name === 'Real E2E Wallet', 'Imported wallet must persist in localStorage');
    assert.match(importedPersisted.near, /^[0-9a-f]{64}$/i, 'Imported wallet must have valid NEAR address');
    assert.match(importedPersisted.evm, /^0x[0-9a-f]{40}$/i, 'Imported wallet must have valid EVM address');
    assert.ok(importedPersisted.sol.length >= 32, 'Imported wallet must have valid Solana address');
    assert.match(importedPersisted.btc, /^bc1/i, 'Imported wallet must have valid BTC address');

    const hasPinModal = await cdp.evalJs(`Boolean(document.getElementById('nexus-pin-modal'))`);
    assert.equal(hasPinModal, false, 'In-app PIN modal must NOT exist');
    const fits = await cdp.evalJs(`document.documentElement.scrollWidth <= 375`);
    assert.equal(fits, true, '375px initial Home must not overflow');
    await cdp.waitFor(`document.getElementById('btn-home-refresh')?.disabled === false`, 6000, 'initial balance sync settled after import');
  });

  test('E2E 2: Home asset click opens Token Detail with symbol/balance, Receive sheet shows valid address', async () => {
    await cdp.waitFor(`document.querySelectorAll('#home-unified-asset-list [data-action="open-token-detail"]').length > 0`, 3000, 'home assets rendered');
    await cdp.clickReal('#home-unified-asset-list [data-action="open-token-detail"]');
    await cdp.waitFor(`document.getElementById('sheet-token-detail')?.classList.contains('open')`, 2000, 'token detail sheet open');
    const detailContent = await cdp.evalJs(`({
      title: (document.getElementById('token-detail-title')?.textContent || '').trim(),
      balance: (document.getElementById('token-detail-balance')?.textContent || '').trim()
    })`);
    assert.ok(detailContent.title.length > 0 && detailContent.title !== '--', `Token detail must show symbol/title, got "${detailContent.title}"`);
    assert.ok(detailContent.balance.length > 0, 'Token detail must show balance');

    await cdp.clickReal('#sheet-backdrop');
    await cdp.waitFor(`!document.getElementById('sheet-token-detail')?.classList.contains('open')`, 2000, 'token detail sheet closed');

    await cdp.clickReal('#view-wallet .quick-action-btn:nth-child(2)');
    await cdp.waitFor(`document.getElementById('sheet-receive')?.classList.contains('open')`, 2000, 'receive sheet open');
    const receiveAddr = await cdp.evalJs(`(document.getElementById('receive-addr-value')?.textContent || '').trim()`);
    assert.ok(receiveAddr.length > 10 && receiveAddr !== '--', `Receive sheet must show valid address, got "${receiveAddr}"`);
    assert.match(receiveAddr, /^[0-9a-f]{64}$|\.near$|^0x[0-9a-f]{40}$|^bc1/i, `Receive address must be valid chain address, got "${receiveAddr}"`);

    await cdp.clickReal('#sheet-backdrop');
    await cdp.waitFor(`!document.getElementById('sheet-receive')?.classList.contains('open')`, 2000, 'receive sheet closed');
  });

  test('E2E 3: Send sheet blocks insufficient balance with positive toast copy and dual-clears form on close', async () => {
    const rpcBefore = sendRpcAttempts;
    await cdp.clickReal('#view-wallet .quick-action-btn:nth-child(1)');
    await cdp.waitFor(`document.getElementById('sheet-send')?.classList.contains('open')`, 2000, 'send sheet open');
    await cdp.typeReal('#send-recipient-input', 'alice.near');
    await cdp.typeReal('#send-amount-input', '999999');
    await cdp.clickReal('#btn-confirm-send');
    await cdp.waitFor(`(document.getElementById('toast')?.textContent || '').trim().length > 0`, 2000, 'send insufficient balance toast');

    const toastCheck = await cdp.evalJs(`(() => {
      const txt = (document.getElementById('toast')?.textContent || '').trim();
      return { txt, hasJargon: /\\b(RPC|HTTP 4|WebView|CORS)\\b/i.test(txt) };
    })()`);
    assert.match(toastCheck.txt, /余额不足|balance insufficient/i, `Send toast must positively report insufficient balance, got "${toastCheck.txt}"`);
    assert.equal(toastCheck.hasJargon, false, `Send error toast must not leak jargon: ${toastCheck.txt}`);
    assert.equal(sendRpcAttempts, rpcBefore, 'Insufficient-balance send must be blocked before any RPC broadcast');

    await cdp.clickReal('#sheet-backdrop');
    await cdp.waitFor(`!document.getElementById('sheet-send')?.classList.contains('open')`, 2000, 'send sheet closed');

    await cdp.clickReal('#view-wallet .quick-action-btn:nth-child(1)');
    await cdp.waitFor(`document.getElementById('sheet-send')?.classList.contains('open')`, 2000, 'send sheet reopened');
    const cleared = await cdp.evalJs(`(() => {
      const rec = document.getElementById('send-recipient-input');
      const amt = document.getElementById('send-amount-input');
      return Boolean(rec && amt && rec.value === '' && amt.value === '' && window.NearCAState.send.recipient === '' && window.NearCAState.send.amount === '');
    })()`);
    assert.equal(cleared, true, 'Closing Send sheet must dual-clear State and DOM inputs');
    await cdp.clickReal('#sheet-backdrop');
    await cdp.waitFor(`!document.getElementById('sheet-send')?.classList.contains('open')`, 2000, 'send sheet closed again');
  });

  test('E2E 4: Swap quotes via mocked 1Click, guards insufficient balance, flip clears input, Limit/Market toggle cleanly', async () => {
    await cdp.clickReal('.bottom-nav .nav-item[data-tab="swap"]');
    await cdp.waitFor(`!document.getElementById('view-swap')?.classList.contains('hidden')`, 2000, 'swap tab visible');

    await cdp.clickReal('#swap-from-token-btn');
    await cdp.waitFor(`document.getElementById('sheet-token-picker')?.classList.contains('open')`, 2000, 'token picker open');
    await cdp.clickReal('#sheet-backdrop');
    await cdp.waitFor(`!document.getElementById('sheet-token-picker')?.classList.contains('open')`, 2000, 'token picker closed');

    await cdp.typeReal('#swap-amount-in', '1');
    await cdp.waitFor(`(() => {
      const v = parseFloat(document.getElementById('swap-amount-out')?.value || '');
      return Number.isFinite(v) && v > 0;
    })()`, 4000, '#swap-amount-out populated with mocked 1Click quote');
    const quotedOut = await cdp.evalJs(`parseFloat(document.getElementById('swap-amount-out')?.value || '0')`);
    assert.ok(quotedOut > 0, `Expected positive mocked swap quote in #swap-amount-out, got ${quotedOut}`);

    const swapBtnState = await cdp.evalJs(`({
      disabled: Boolean(document.getElementById('btn-execute-swap')?.disabled),
      text: (document.getElementById('btn-execute-swap')?.textContent || '').trim()
    })`);
    assert.equal(swapBtnState.disabled, true, 'Swap execute button must be disabled when balance is 0');
    assert.match(swapBtnState.text, /余额不足|insufficient/i, `Swap execute button must guard insufficient balance, got "${swapBtnState.text}"`);

    await cdp.clickReal('#swap-market-panel .swap-flip-btn');
    const flipCleared = await cdp.evalJs(`document.getElementById('swap-amount-in').value === '' && document.getElementById('swap-amount-out').value === '' && window.NearCAState.swap.amountIn === ''`);
    assert.equal(flipCleared, true, 'Swap flip must clear amountIn, amountOut, and state');

    await cdp.clickReal('#swap-mode-limit-btn');
    await cdp.waitFor(`!document.getElementById('swap-limit-panel')?.classList.contains('hidden')`, 2000, 'limit panel visible');
    await cdp.clickReal('#swap-mode-market-btn');
    await cdp.waitFor(`!document.getElementById('swap-market-panel')?.classList.contains('hidden')`, 2000, 'market panel visible');
  });

  test('E2E 5: Perps list scroll -> click bottom market -> trade detail starts at top (y=0) -> back restores scroll', async () => {
    await cdp.clickReal('.bottom-nav .nav-item[data-tab="perp"]');
    await cdp.waitFor(`document.querySelectorAll('#perp-overview-list .perp-overview-row').length >= 30`, 4000, 'perp overview rows >= 30');

    await cdp.evalJs(`(() => {
      const items = document.querySelectorAll('#perp-overview-list .perp-overview-row');
      items[items.length - 1].scrollIntoView({ block: 'center' });
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
    await cdp.waitFor(`!document.getElementById('perp-trade-panel')?.classList.contains('hidden')`, 2000, 'perp trade panel visible');
    await new Promise((r) => setTimeout(r, 80));

    const detailScrollY = await cdp.evalJs(`window.scrollY || document.documentElement.scrollTop || 0`);
    assert.equal(detailScrollY, 0, `Perp trade detail MUST start at top (scrollY === 0), got ${detailScrollY}`);

    await cdp.clickReal('#btn-perp-back');
    await cdp.waitFor(`!document.getElementById('perp-overview-panel')?.classList.contains('hidden')`, 2000, 'perp overview panel restored');
    await new Promise((r) => setTimeout(r, 120));

    const restoredScrollY = await cdp.evalJs(`window.scrollY || document.documentElement.scrollTop || 0`);
    assert.ok(restoredScrollY > 150, `Expected overview scrollY > 150 restored on back, got ${restoredScrollY}`);
  });

  test('E2E 6: Perps trade declarative active classes, dual unit toggle, and negative TP guard', async () => {
    await cdp.clickReal('#perp-overview-list .perp-overview-row');
    await cdp.waitFor(`!document.getElementById('perp-trade-panel')?.classList.contains('hidden')`, 2000, 'perp trade panel visible');

    await cdp.clickReal('#perp-interval-pills [data-iv="1h"]');
    await cdp.clickReal('#perp-mode-cross');
    await new Promise((r) => setTimeout(r, 80));
    const activeOk = await cdp.evalJs(`Boolean(document.querySelector('#perp-interval-pills [data-iv="1h"]')?.classList.contains('active') && document.getElementById('perp-mode-cross')?.classList.contains('active'))`);
    assert.equal(activeOk, true, 'PerpsView declarative active classes must update on interval/margin click');

    const unitBefore = await cdp.evalJs(`document.getElementById('btn-perp-input-unit')?.textContent?.trim()`);
    await cdp.clickReal('#btn-perp-input-unit');
    const unitAfter = await cdp.evalJs(`document.getElementById('btn-perp-input-unit')?.textContent?.trim()`);
    assert.notEqual(unitBefore, unitAfter, 'Clicking input unit toggle must switch between USDC and Coin');
    // Toggle back to USDC margin mode so '10' means 10 USDC (within $100 mock withdrawable)
    await cdp.clickReal('#btn-perp-input-unit');

    const attemptsBefore = perpOrderAttempts;
    await cdp.typeReal('#perp-margin-input', '10');
    await cdp.typeReal('#perp-tp-input', '-5');
    await cdp.waitFor(`document.getElementById('btn-perp-submit-long')?.disabled === false`, 2000, '#btn-perp-submit-long enabled after margin input');
    const submitEnabled = await cdp.evalJs(`document.getElementById('btn-perp-submit-long')?.disabled === false`);
    assert.equal(submitEnabled, true, '#btn-perp-submit-long must be enabled before submitting negative TP');
    await cdp.clickReal('#btn-perp-submit-long');
    await cdp.waitFor(`(document.getElementById('toast')?.textContent || '').trim().length > 0`, 2000, 'negative TP rejection toast');
    const tpToast = await cdp.evalJs(`(document.getElementById('toast')?.textContent || '').trim()`);
    assert.match(tpToast, /止盈价必须为大于 0|Take profit price must be.*greater than 0/i, `Negative TP must show rejection toast, got "${tpToast}"`);
    assert.equal(perpOrderAttempts, attemptsBefore, 'Negative TP must be blocked locally before any exchange API call');

    await cdp.clickReal('#btn-perp-back');
  });

  test('E2E 6b: Earn tab opens staking pools and clicking pool card opens #sheet-earn-stake cleanly', async () => {
    await cdp.clickReal('.bottom-nav .nav-item[data-tab="wallet"]');
    await cdp.waitFor(`!document.getElementById('view-wallet')?.classList.contains('hidden')`, 2000, 'home view visible');

    await cdp.clickReal('#view-wallet .quick-action-btn:nth-child(4)');
    await cdp.waitFor(`!document.getElementById('view-earn')?.classList.contains('hidden')`, 2000, 'earn view visible');
    await cdp.waitFor(`document.querySelectorAll('#staking-pools-list .staking-pool-card[data-action="select-staking-pool"]').length > 0`, 3000, 'staking pool cards rendered');

    await cdp.clickReal('#staking-pools-list .staking-pool-card[data-action="select-staking-pool"]');
    await cdp.waitFor(`document.getElementById('sheet-earn-stake')?.classList.contains('open')`, 2000, 'earn stake sheet open');
    const stakeTitle = await cdp.evalJs(`(document.querySelector('#sheet-earn-stake .sheet-title')?.textContent || '').trim()`);
    assert.ok(stakeTitle.length > 0, 'Earn stake sheet must display a non-empty title');

    await cdp.clickReal('#sheet-backdrop');
    await cdp.waitFor(`!document.getElementById('sheet-earn-stake')?.classList.contains('open')`, 2000, 'earn stake sheet closed');
    const lockLeaked = await cdp.evalJs(`document.body.classList.contains('sheet-open') || document.documentElement.classList.contains('sheet-open')`);
    assert.equal(lockLeaked, false, 'Closing Earn stake sheet must clear scroll lock');
  });

  test('E2E 7: Hub tool sheets (DApp browser, WalletConnect, Contacts) open & close without scroll lock leak', async () => {
    await cdp.clickReal('.bottom-nav .nav-item[data-tab="hub"]');
    await cdp.waitFor(`!document.getElementById('view-hub')?.classList.contains('hidden')`, 2000, 'hub view visible');

    for (const [triggerSel, sheetId] of [
      ['#hub-dapp-browser-btn', 'sheet-dapp-browser'],
      ['#view-hub [data-i18n="hub.wcTitle"]', 'sheet-walletconnect'],
      ['#view-hub [data-i18n="hub.contactsTitle"]', 'sheet-contacts']
    ]) {
      await cdp.evalJs(`document.querySelector(${JSON.stringify(triggerSel)})?.closest('button')?.click()`);
      await cdp.waitFor(`document.getElementById(${JSON.stringify(sheetId)})?.classList.contains('open')`, 2000, `${sheetId} open`);
      await cdp.clickReal('#sheet-backdrop');
      await cdp.waitFor(`!document.getElementById(${JSON.stringify(sheetId)})?.classList.contains('open')`, 2000, `${sheetId} closed`);
    }
    const lockLeaked = await cdp.evalJs(`document.body.classList.contains('sheet-open') || document.documentElement.classList.contains('sheet-open')`);
    assert.equal(lockLeaked, false, 'Closing all sheets must clear scroll lock');
  });

  test('E2E 8: Real header language button toggles zh <-> en with zero developer jargon', async () => {
    await cdp.clickReal('#header-lang-btn');
    await new Promise((r) => setTimeout(r, 100));
    const enCheck = await cdp.evalJs(`(() => {
      const navTexts = Array.from(document.querySelectorAll('.bottom-nav .nav-item')).map(el => el.textContent.trim()).join('|');
      const bodyText = document.body.innerText || '';
      return { navTexts, hasJargon: /\\b(WebView|CORS|HTTP 403|HTTP 429|RPC Error)\\b/i.test(bodyText) };
    })()`);
    assert.ok(/Swap|Wallet/i.test(enCheck.navTexts), `Expected English nav labels, got ${enCheck.navTexts}`);
    assert.equal(enCheck.hasJargon, false, 'Rendered English UI must contain zero developer jargon');

    await cdp.clickReal('#header-lang-btn');
    await new Promise((r) => setTimeout(r, 100));
    const zhNav = await cdp.evalJs(`Array.from(document.querySelectorAll('.bottom-nav .nav-item')).map(el => el.textContent.trim()).join('|')`);
    assert.ok(/闪兑|资产/.test(zhNav), `Expected Chinese nav labels, got ${zhNav}`);
  });

  test('E2E 9: Upstream HTTP 429/500 fault injection recovers cleanly without stuck loading button', async () => {
    await cdp.clickReal('.bottom-nav .nav-item[data-tab="wallet"]');
    await cdp.waitFor(`!document.getElementById('view-wallet')?.classList.contains('hidden')`, 2000, 'home view visible');

    injectFaults = true;
    try {
      await cdp.clickReal('#btn-home-refresh');
      await cdp.waitFor(`document.getElementById('btn-home-refresh')?.disabled === false`, 6000, 'refresh button re-enabled after 429/500');
    } finally {
      injectFaults = false;
    }
    const recovery = await cdp.evalJs(`({
      btnDisabled: Boolean(document.getElementById('btn-home-refresh')?.disabled),
      btnText: (document.getElementById('btn-home-refresh')?.textContent || '').trim(),
      homeVisible: !document.getElementById('view-wallet')?.classList.contains('hidden'),
      toastTxt: (document.getElementById('toast')?.textContent || '').trim()
    })`);
    assert.equal(recovery.btnDisabled, false, 'Refresh button must be re-enabled after 429/500');
    assert.match(recovery.btnText, /刷新|Refresh/i, `Refresh button text must recover, got "${recovery.btnText}"`);
    assert.equal(recovery.homeVisible, true, 'Home view must remain visible after 429/500 fault');
    assert.equal(/\b(HTTP 500|HTTP 429|TypeError|ECONNREFUSED)\b/i.test(recovery.toastTxt), false, `Fault toast must be sanitized: ${recovery.toastTxt}`);
  });

  test('E2E 10: SendFeeSummaryPanel VDOM survives closeAllSheets() and re-renders fee preview on reopen', async () => {
    await cdp.clickReal('.bottom-nav .nav-item[data-tab="wallet"]');
    await cdp.waitFor(`!document.getElementById('view-wallet')?.classList.contains('hidden')`, 2000, 'home view visible for P1-4');

    const crossAddr = '0x2222222222222222222222222222222222222222';
    await cdp.clickReal('#view-wallet .quick-action-btn:nth-child(1)');
    await cdp.waitFor(`document.getElementById('sheet-send')?.classList.contains('open')`, 2000, 'send sheet open 1st time');
    await cdp.typeReal('#send-recipient-input', crossAddr);
    await cdp.typeReal('#send-amount-input', '1');
    await cdp.waitFor(`(() => {
      const el = document.getElementById('send-route-preview');
      return Boolean(el && !el.classList.contains('hidden') && (el.textContent || '').trim().length > 0);
    })()`, 3000, '#send-route-preview rendered 1st time');
    const firstPreview = await cdp.evalJs(`(document.getElementById('send-route-preview')?.textContent || '').trim()`);
    assert.match(firstPreview, /NEAR.*➔/i, `1st preview must render route label, got "${firstPreview}"`);
    assert.match(firstPreview, /0\.25%/, `1st preview must render fee %, got "${firstPreview}"`);

    await cdp.clickReal('#sheet-backdrop');
    await cdp.waitFor(`!document.getElementById('sheet-send')?.classList.contains('open')`, 2000, 'send sheet closed after 1st preview');

    await cdp.clickReal('#view-wallet .quick-action-btn:nth-child(1)');
    await cdp.waitFor(`document.getElementById('sheet-send')?.classList.contains('open')`, 2000, 'send sheet reopened');
    // Populate both recipient and amount before dispatching a single input event so
    // SendFeeSummaryPanel diffs directly with visible=true instead of resetting via visible=false.
    await cdp.evalJs(`(() => {
      const recipientEl = document.getElementById('send-recipient-input');
      const amountEl = document.getElementById('send-amount-input');
      if (!recipientEl || !amountEl) throw new Error('Missing send inputs on reopen');
      recipientEl.focus();
      recipientEl.value = ${JSON.stringify(crossAddr)};
      amountEl.value = '1';
      recipientEl.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await cdp.waitFor(`(() => {
      const el = document.getElementById('send-route-preview');
      return Boolean(el && !el.classList.contains('hidden') && (el.textContent || '').trim().length > 0);
    })()`, 3000, '#send-route-preview rendered after closeAllSheets');
    const secondPreview = await cdp.evalJs(`(document.getElementById('send-route-preview')?.textContent || '').trim()`);
    assert.match(secondPreview, /NEAR.*➔/i, `Reopened preview must still render route label, got "${secondPreview}"`);
    assert.match(secondPreview, /0\.25%/, `Reopened preview must still render fee %, got "${secondPreview}"`);

    await cdp.clickReal('#sheet-backdrop');
    await cdp.waitFor(`!document.getElementById('sheet-send')?.classList.contains('open')`, 2000, 'send sheet closed after P1-4');
  });

  test('E2E 11: DApp browser ERC-20 unlimited approval risk banner & eth_sign blind-sign second confirm', async () => {
    await cdp.clickReal('.bottom-nav .nav-item[data-tab="hub"]');
    await cdp.waitFor(`!document.getElementById('view-hub')?.classList.contains('hidden')`, 2000, 'hub view visible for DApp test');

    await cdp.evalJs(`(() => {
      const listeners = {};
      window.__e2eDAppResponses = [];
      window.__e2eEmitDAppBridge = (ev) => {
        (listeners.bridgeMessage || []).forEach((fn) => fn(ev));
      };
      window.Capacitor = window.Capacitor || {};
      window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.Capacitor.Plugins.NativeDAppBrowser = {
        addListener: (name, fn) => {
          listeners[name] = listeners[name] || [];
          listeners[name].push(fn);
          return { remove: () => {} };
        },
        openUrl: async () => {},
        setOverlayVisible: async () => {},
        emitProviderEvent: async () => {},
        sendResponse: async (res) => { window.__e2eDAppResponses.push(res); }
      };
    })()`);

    await cdp.evalJs(`document.querySelector('#hub-dapp-browser-btn')?.closest('button')?.click()`);
    await cdp.waitFor(`document.getElementById('sheet-dapp-browser')?.classList.contains('open')`, 2000, 'dapp browser sheet open');
    await cdp.typeReal('#dapp-url-input', 'https://near.com');
    await cdp.clickReal('#btn-dapp-open');
    await cdp.waitFor(`!document.getElementById('sheet-dapp-browser')?.classList.contains('open')`, 2000, 'dapp browser sheet closed on launch');

    const spender = '0x2222222222222222222222222222222222222222';
    const approveCalldata = '0x095ea7b3' + '2222222222222222222222222222222222222222'.padStart(64, '0') + 'f'.repeat(64);
    await cdp.evalJs(`(() => {
      const w = window.NearCAState.getActiveWallet();
      w.nativeBalances = w.nativeBalances || {};
      window.__e2ePrevEthBal = w.nativeBalances.eth;
      w.nativeBalances.eth = 1.0;
      window.__e2eEmitDAppBridge({
        id: 'e2e-approve-1',
        namespace: 'evm',
        method: 'eth_sendTransaction',
        origin: 'https://near.com',
        params: [{
          from: w.mpcEvmAddress || w.evmAddress,
          to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
          value: '0x0',
          data: ${JSON.stringify(approveCalldata)}
        }]
      });
    })()`);

    await cdp.waitFor(`document.getElementById('sheet-dapp-approve')?.classList.contains('open')`, 3000, 'dapp approve sheet open for ERC-20 approve');
    const approveUi = await cdp.evalJs(`(() => {
      const banner = document.getElementById('dapp-approve-risk-banner');
      const detail = document.getElementById('dapp-approve-detail');
      const rect = banner ? banner.getBoundingClientRect() : null;
      return {
        bannerVisible: Boolean(banner && rect && rect.width > 0 && rect.height > 0),
        bannerText: (banner?.textContent || '').trim(),
        detailText: (detail?.textContent || '').trim()
      };
    })()`);
    assert.equal(approveUi.bannerVisible, true, '#dapp-approve-risk-banner must be visible for unlimited ERC-20 approve');
    assert.ok(approveUi.bannerText.length > 0, 'Risk banner must have non-empty warning text');
    assert.ok(approveUi.detailText.includes(spender), `Detail must include decoded spender ${spender}, got "${approveUi.detailText}"`);
    assert.match(approveUi.detailText, /Unlimited Approval|无限授权/i, `Detail must indicate unlimited approval, got "${approveUi.detailText}"`);

    await cdp.clickReal('#btn-dapp-reject');
    await cdp.waitFor(`!document.getElementById('sheet-dapp-approve')?.classList.contains('open')`, 2000, 'dapp approve sheet closed after reject');
    await cdp.waitFor(`window.__e2eDAppResponses.some((r) => r.id === 'e2e-approve-1')`, 2000, 'approve reject response sent');
    const approveResp = await cdp.evalJs(`window.__e2eDAppResponses.find((r) => r.id === 'e2e-approve-1')`);
    assert.ok(approveResp && approveResp.errorJson && !approveResp.resultJson, 'Rejected ERC-20 approve must return errorJson and no resultJson');

    const digest = '0x' + 'ab'.repeat(32);
    await cdp.evalJs(`(() => {
      const w = window.NearCAState.getActiveWallet();
      window.__e2eEmitDAppBridge({
        id: 'e2e-eth-sign-1',
        namespace: 'evm',
        method: 'eth_sign',
        origin: 'https://near.com',
        params: [w.mpcEvmAddress || w.evmAddress, ${JSON.stringify(digest)}]
      });
    })()`);

    await cdp.waitFor(`document.getElementById('sheet-dapp-approve')?.classList.contains('open')`, 3000, 'dapp approve sheet open for eth_sign');
    const blindBannerVisible = await cdp.evalJs(`(() => {
      const banner = document.getElementById('dapp-approve-risk-banner');
      const rect = banner ? banner.getBoundingClientRect() : null;
      return Boolean(banner && rect && rect.width > 0 && rect.height > 0 && (banner.textContent || '').trim().length > 0);
    })()`);
    assert.equal(blindBannerVisible, true, '#dapp-approve-risk-banner must be visible for eth_sign');

    await cdp.clickReal('#btn-dapp-confirm');
    await cdp.waitFor(`document.getElementById('sheet-confirm-dialog')?.classList.contains('open')`, 2000, 'second confirm danger dialog open for eth_sign');
    await cdp.clickReal('#btn-confirm-dialog-cancel');
    await cdp.waitFor(`!document.getElementById('sheet-confirm-dialog')?.classList.contains('open')`, 2000, 'second confirm dialog closed after cancel');
    await cdp.waitFor(`!document.getElementById('sheet-dapp-approve')?.classList.contains('open')`, 2000, 'dapp approve sheet closed after blind sign cancel');
    await cdp.waitFor(`window.__e2eDAppResponses.some((r) => r.id === 'e2e-eth-sign-1')`, 2000, 'eth_sign reject response sent');
    const blindResp = await cdp.evalJs(`window.__e2eDAppResponses.find((r) => r.id === 'e2e-eth-sign-1')`);
    assert.ok(blindResp && blindResp.errorJson && !blindResp.resultJson, 'Cancelled eth_sign must reject with errorJson and never sign');
    await cdp.evalJs(`(() => {
      const w = window.NearCAState.getActiveWallet();
      if (w && w.nativeBalances) w.nativeBalances.eth = window.__e2ePrevEthBal;
    })()`);
  });

  test('E2E 12: All tabs (wallet, swap, perp, earn, hub) fit 375px viewport with zero uncaught page or console errors', async () => {
    for (const tab of ['wallet', 'swap', 'perp', 'hub']) {
      await cdp.clickReal(`.bottom-nav .nav-item[data-tab="${tab}"]`);
      await new Promise((r) => setTimeout(r, 100));
      const fits = await cdp.evalJs(`document.documentElement.scrollWidth <= 375`);
      assert.equal(fits, true, `Tab ${tab} must fit 375px width without horizontal overflow`);
    }
    await cdp.clickReal('.bottom-nav .nav-item[data-tab="wallet"]');
    await cdp.clickReal('#view-wallet .quick-action-btn:nth-child(4)');
    await cdp.waitFor(`!document.getElementById('view-earn')?.classList.contains('hidden')`, 2000, 'earn view visible in width check');
    const earnFits = await cdp.evalJs(`document.documentElement.scrollWidth <= 375`);
    assert.equal(earnFits, true, 'Tab earn must fit 375px width without horizontal overflow');

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join('; ')}`);
    assert.equal(consoleErrors.length, 0, `Unexpected console errors: ${consoleErrors.join('; ')}`);
  });
});
