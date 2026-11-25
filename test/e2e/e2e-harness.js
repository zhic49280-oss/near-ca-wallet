'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const { spawn } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PARTS_HTML_DIR = path.join(ROOT_DIR, 'src', 'parts', 'index-html');

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const SVG_TAGS = new Set([
  'svg', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline',
  'ellipse', 'g', 'defs', 'lineargradient', 'radialgradient', 'stop',
  'text', 'tspan', 'clippath', 'mask', 'use'
]);

const DEFAULT_SCRIPT_PATHS = [
  'bip39-wordlist.js',
  'src/crypto-engine.js',
  'src/token-registry.js',
  'src/near-intents.js',
  'src/chain-contracts.js',
  'src/limit-orders.js',
  'src/hyperliquid-perps.js',
  'src/state.js',
  'src/dapp-browser.js',
  'src/framework-ui.js',
  'src/ui-controller.js',
  'src/mining-pro.js'
];

// ==================== Entity & HTML Utilities ====================

function decodeHtmlEntities(str) {
  return String(str || '').replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos|#39|nbsp);/g, (m, ent) => {
    switch (ent) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos':
      case '#39': return "'";
      case 'nbsp': return '\u00a0';
      default: {
        if (ent.startsWith('#x') || ent.startsWith('#X')) {
          const cp = parseInt(ent.slice(2), 16);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
        }
        if (ent.startsWith('#')) {
          const cp = parseInt(ent.slice(1), 10);
          return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
        }
        return m;
      }
    }
  });
}

function escapeHtmlAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function toCamelCaseAttr(attrSuffix) {
  return String(attrSuffix || '').replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

function toKebabCaseAttr(prop) {
  return String(prop || '').replace(/([A-Z])/g, '-$1').toLowerCase();
}

// ==================== Zero Developer Jargon Guard ====================

const DEV_JARGON_RULES = [
  { id: 'http-status', re: /\bHTTP\s*[45]\d{2}\b|\bHTTP(?:\s*[:=]\s*|\s+)\d{3}\b/i },
  { id: 'status-code', re: /\bstatus\s*(?:code)?\s*[:=]?\s*[45]\d{2}\b/i },
  { id: 'net-err-code', re: /\b(?:ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET|ERR_NETWORK|FetchError|AbortError)\b/i },
  { id: 'runtime-internal', re: /\b(?:CORS|WebView|CapacitorHttp|localStorage|sessionStorage|IndexedDB|Service\s*Worker)\b/i },
  { id: 'zh-system-kernel', re: /系统内核/ },
  { id: 'js-error-type', re: /\b(?:TypeError|ReferenceError|SyntaxError|RangeError):/ },
  { id: 'stack-trace', re: /\bat\s+[A-Za-z0-9_$.<>]+\s*\([^)]*:\d+:\d+\)/ },
  { id: 'json-parse-err', re: /\bJSON\.parse\b|\bUnexpected token\b/i },
  { id: 'internal-module', re: /\b(?:NearCACrypto|NearCATokens|NearCAIntents|NearCAContracts|NearCAState|NearCAUI|NearCAFramework|NearCALimitOrders|NearCAHyperliquid|NearCAMining|NearCADAppBrowser)\b/ },
  { id: 'ethers-lib', re: /\bethers(?:\.umd)?\b/i },
  { id: 'blockbook-telemetry', re: /\b(?:Blockbook|Telemetry)\b/i },
  { id: 'zh-telemetry', re: /遥测/ },
  { id: 'crypto-protocol-jargon', re: /\b(?:Borsh|NEP-413|NEP-141|EIP-712|Ed25519|SLIP-10|BIP-?39|BIP-?32|BIP-?340|HRP|AddKey|DeleteKey|VaultRelayer|Bridge2)\b/i },
  { id: 'rpc-jargon', re: /\bJSON-RPC\b|\bRPCError\b|\bRPC\b|-32\d{3}\b/ },
  { id: 'aggregator-jargon', re: /\b(?:1Click|CoW\s*API|Ref\s*Finance|DCL)\b/i },
  { id: 'zero-gas', re: /\b0-Gas\b/i },
  { id: 'implicit-en', re: /\bImplicit(?:\s+Account)?\b/i },
  { id: 'implicit-zh', re: /隐式/ },
  { id: 'broadcast-zh', re: /广播/ },
  { id: 'broadcast-en', re: /\bBroadcast(?:ing|ed)?\b/i },
  { id: 'raw-undefined-nan', re: /\b(?:undefined|NaN)\b/ }
];

function findDevJargonMatches(text) {
  const str = String(text ?? '');
  if (!str) return [];
  const hits = [];
  for (const rule of DEV_JARGON_RULES) {
    const m = rule.re.exec(str);
    if (m) {
      const idx = m.index;
      const start = Math.max(0, idx - 24);
      const end = Math.min(str.length, idx + m[0].length + 24);
      hits.push({
        id: rule.id,
        match: m[0],
        snippet: str.slice(start, end).replace(/\s+/g, ' ').trim()
      });
    }
  }
  return hits;
}

function assertZeroDevJargon(text, contextLabel = '') {
  const hits = findDevJargonMatches(text);
  if (hits.length > 0) {
    const label = contextLabel ? `[${contextLabel}] ` : '';
    const details = hits.map((h) => `${h.id} ("${h.match}" in "...${h.snippet}...")`).join('; ');
    assert.fail(`${label}Developer jargon detected in user-facing text: ${details}`);
  }
}

// ==================== Visible HTML Text Extractor ====================

function extractVisibleHtmlSegments(html) {
  const src = String(html || '');
  const withoutBlocks = src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, ' ');

  const segments = [];
  const attrRe = /\b(?:placeholder|title|aria-label)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  const len = withoutBlocks.length;
  let pos = 0;
  while (pos < len) {
    const lt = withoutBlocks.indexOf('<', pos);
    if (lt === -1) {
      const tail = decodeHtmlEntities(withoutBlocks.slice(pos)).replace(/\s+/g, ' ').trim();
      if (tail) segments.push(tail);
      break;
    }
    if (lt > pos) {
      const textChunk = decodeHtmlEntities(withoutBlocks.slice(pos, lt)).replace(/\s+/g, ' ').trim();
      if (textChunk) segments.push(textChunk);
    }
    let i = lt + 1;
    let quote = '';
    while (i < len) {
      const c = withoutBlocks[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      i++;
    }
    if (i >= len) {
      const tail = decodeHtmlEntities(withoutBlocks.slice(lt)).replace(/\s+/g, ' ').trim();
      if (tail) segments.push(tail);
      break;
    }
    const tagStr = withoutBlocks.slice(lt, i + 1);
    attrRe.lastIndex = 0;
    let am;
    while ((am = attrRe.exec(tagStr)) !== null) {
      const val = decodeHtmlEntities(am[1] ?? am[2] ?? '').replace(/\s+/g, ' ').trim();
      if (val) segments.push(val);
    }
    pos = i + 1;
  }
  return segments;
}

function extractVisibleHtmlText(html) {
  return extractVisibleHtmlSegments(html).join('\n');
}

// ==================== Dist & Source Asset Loader ====================

function resolveAssetRoot(preferDist = true) {
  const distIndex = path.join(DIST_DIR, 'index.html');
  if (preferDist && fs.existsSync(distIndex)) {
    return { assetRoot: DIST_DIR, isDist: true };
  }
  return { assetRoot: ROOT_DIR, isDist: false };
}

function extractI18nDictFromStateSource(stateJsCode) {
  const storageMap = new Map();
  const sandbox = {
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(String(k), String(v)),
      removeItem: (k) => storageMap.delete(String(k)),
      clear: () => storageMap.clear(),
      key: (i) => Array.from(storageMap.keys())[i] ?? null,
      get length() { return storageMap.size; }
    },
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Error,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(stateJsCode, sandbox, { filename: 'state.js' });
  const dict = sandbox.NearCAState && sandbox.NearCAState.i18nDict;
  return dict ? JSON.parse(JSON.stringify(dict)) : { zh: {}, en: {} };
}

function loadDistAssets(options = {}) {
  const preferDist = options.preferDist !== false;
  const { assetRoot, isDist } = resolveAssetRoot(preferDist);

  const htmlPath = path.join(assetRoot, 'index.html');
  const cssPath = path.join(assetRoot, 'style.css');
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

  const jsFiles = {};
  const scriptSrcs = new Set(DEFAULT_SCRIPT_PATHS);
  const scriptTagRe = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = scriptTagRe.exec(html)) !== null) {
    scriptSrcs.add(m[1].split('?')[0]);
  }
  for (const rel of scriptSrcs) {
    const cleanRel = rel.replace(/^\.?\//, '');
    const p = path.join(assetRoot, cleanRel);
    if (fs.existsSync(p)) {
      jsFiles[cleanRel] = fs.readFileSync(p, 'utf8');
    } else if (fs.existsSync(path.join(ROOT_DIR, cleanRel))) {
      jsFiles[cleanRel] = fs.readFileSync(path.join(ROOT_DIR, cleanRel), 'utf8');
    }
  }

  const partsHtml = {};
  if (fs.existsSync(PARTS_HTML_DIR)) {
    const partNames = fs.readdirSync(PARTS_HTML_DIR)
      .filter((f) => f.endsWith('.part.html'))
      .sort();
    for (const f of partNames) {
      partsHtml[f] = fs.readFileSync(path.join(PARTS_HTML_DIR, f), 'utf8');
    }
  }
  const partsHtmlText = Object.values(partsHtml).join('\n');

  const stateCode = jsFiles['src/state.js'] || '';
  const i18nDict = stateCode ? extractI18nDictFromStateSource(stateCode) : { zh: {}, en: {} };
  const visibleHtmlSegments = extractVisibleHtmlSegments(html);
  const visibleHtmlText = visibleHtmlSegments.join('\n');

  return {
    assetRoot,
    isDist,
    html,
    css,
    jsFiles,
    partsHtml,
    partsHtmlText,
    i18nDict,
    visibleHtmlSegments,
    visibleHtmlText
  };
}

// ==================== Child HTTP Server Wrapper ====================

async function startTestServer(options = {}) {
  const timeoutMs = Number(options.timeoutMs || 6000);
  const bootstrapCode = [
    "const s = require('./server.js');",
    "s.listen(0, '127.0.0.1', () => {",
    "  const addr = s.address();",
    "  process.stdout.write(JSON.stringify({ port: addr.port }) + '\\n');",
    "});",
    "process.on('SIGTERM', () => {",
    "  try { if (typeof s.closeAllConnections === 'function') s.closeAllConnections(); } catch (_) {}",
    "  try { s.close(() => process.exit(0)); } catch (_) { process.exit(0); }",
    "  setTimeout(() => process.exit(0), 300).unref();",
    "});"
  ].join('\n');

  const child = spawn(process.execPath, ['-e', bootstrapCode], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  });

  const port = await new Promise((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`Test server startup timed out after ${timeoutMs}ms. stderr: ${stderrBuf}`));
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      const nl = stdoutBuf.indexOf('\n');
      if (nl !== -1 && !settled) {
        const line = stdoutBuf.slice(0, nl).trim();
        try {
          const parsed = JSON.parse(line);
          if (parsed && Number.isInteger(parsed.port) && parsed.port > 0) {
            settled = true;
            clearTimeout(timer);
            resolve(parsed.port);
          }
        } catch (err) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(`Invalid server startup output "${line}": ${err.message}`));
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
    });

    child.once('exit', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Test server exited prematurely (code=${code}, signal=${signal}). stderr: ${stderrBuf}`));
      }
    });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let closed = false;

  async function close() {
    if (closed) return;
    closed = true;
    if (child.exitCode !== null || child.signalCode !== null) return;
    await new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) {}
      }, 500);
      if (typeof killTimer.unref === 'function') killTimer.unref();

      child.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });
      try {
        child.kill('SIGTERM');
      } catch (_) {
        clearTimeout(killTimer);
        resolve();
      }
    });
  }

  try {
    const res = await fetch(`${baseUrl}/`);
    const ct = res.headers.get('content-type') || '';
    if (res.status !== 200 || !ct.includes('text/html')) {
      throw new Error(`Unexpected root response from server.js: status=${res.status}, content-type=${ct}`);
    }
    await res.text();
  } catch (err) {
    await close();
    throw err;
  }

  return { baseUrl, port, close };
}

// ==================== Broadcast Safety Guard ====================

function safeDecodeURIComponent(str, passes = 2) {
  let cur = String(str || '');
  for (let i = 0; i < passes; i++) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch (_) {
      break;
    }
  }
  return cur;
}

function buildUrlGuardCandidates(urlStr) {
  const candidates = new Set();
  const raw = String(urlStr || '');
  if (raw) candidates.add(raw);
  const d1 = safeDecodeURIComponent(raw, 1);
  if (d1) candidates.add(d1);
  const d2 = safeDecodeURIComponent(d1, 1);
  if (d2) candidates.add(d2);
  try {
    const parsed = new URL(raw, 'http://127.0.0.1');
    for (const paramName of ['path', 'url', 'target']) {
      const val = parsed.searchParams.get(paramName);
      if (val) {
        candidates.add(val);
        candidates.add(safeDecodeURIComponent(val, 2));
      }
    }
  } catch (_) {}
  return Array.from(candidates);
}

function normalizeBodyText(rawBody) {
  if (rawBody === undefined || rawBody === null) return '';
  if (typeof rawBody === 'string') return rawBody;
  if (typeof rawBody === 'object') {
    if (rawBody instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(rawBody));
    }
    if (ArrayBuffer.isView(rawBody)) {
      return new TextDecoder().decode(new Uint8Array(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength));
    }
    if (typeof URLSearchParams !== 'undefined' && rawBody instanceof URLSearchParams) {
      return rawBody.toString();
    }
    if (typeof rawBody._bodyText === 'string') {
      return rawBody._bodyText;
    }
    if (typeof rawBody.toString === 'function' && rawBody.constructor && rawBody.constructor.name === 'URLSearchParams') {
      return rawBody.toString();
    }
  }
  return String(rawBody);
}

function isBroadcastRequest(urlOrRequest, init = {}) {
  const isReqObj = Boolean(urlOrRequest && typeof urlOrRequest === 'object' && typeof urlOrRequest.url === 'string');
  const urlStr = typeof urlOrRequest === 'string'
    ? urlOrRequest
    : (isReqObj ? urlOrRequest.url : String(urlOrRequest || ''));
  const method = String((init && init.method) || (isReqObj && urlOrRequest.method) || 'GET').toUpperCase();
  const rawBody = (init && init.body !== undefined)
    ? init.body
    : (isReqObj ? (urlOrRequest._bodyText !== undefined ? urlOrRequest._bodyText : urlOrRequest.body) : undefined);
  const bodyStr = normalizeBodyText(rawBody);

  if (bodyStr) {
    try {
      const parsed = JSON.parse(bodyStr);
      const calls = Array.isArray(parsed) ? parsed : [parsed];
      for (const call of calls) {
        const rpcMethod = call && typeof call.method === 'string' ? call.method.trim() : '';
        if (!rpcMethod) continue;
        if (/^(eth_sendRawTransaction|eth_sendTransaction|eth_signTransaction)$/i.test(rpcMethod)) {
          return { blocked: true, reason: `EVM JSON-RPC ${rpcMethod}` };
        }
        if (/^(sendTransaction|simulateTransaction)$/i.test(rpcMethod)) {
          return { blocked: true, reason: `Solana JSON-RPC ${rpcMethod}` };
        }
        if (/^(?:broadcast_tx_(?:commit|async)|send_tx)$/i.test(rpcMethod)) {
          return { blocked: true, reason: `NEAR JSON-RPC ${rpcMethod}` };
        }
        if (/^(?:publish_intent|publish_intents)$/i.test(rpcMethod)) {
          return { blocked: true, reason: `Solver Relay ${rpcMethod}` };
        }
      }
    } catch (_) {
      // Non-JSON body; check URL rules below
    }
  }

  const urlCandidates = buildUrlGuardCandidates(urlStr);
  const anyMatches = (re) => urlCandidates.some((u) => re.test(u));

  if (anyMatches(/\/api\/v2\/sendtx/i)) {
    return { blocked: true, reason: 'Pearl Blockbook sendtx' };
  }
  if (method === 'POST' && urlCandidates.some((u) => /\/tx\/?(?:\?|$)/i.test(u) && !/\/txs\/?(?:\?|$)/i.test(u))) {
    return { blocked: true, reason: 'Bitcoin raw tx broadcast' };
  }
  if (anyMatches(/\/deposit\/submit(?:\?|$)/i)) {
    return { blocked: true, reason: '1Click deposit submit' };
  }
  if (anyMatches(/\/api\/(?:auth\/authenticate|swap\/intent|swap\/submit|withdraw\/intent|withdraw\/submit)/i)) {
    return { blocked: true, reason: 'near.com 1CS auth/swap/withdraw mutation' };
  }
  if (method === 'POST' && anyMatches(/\/(?:createOrder|execute|cancelOrder)(?:\?|$)/i) && anyMatches(/jup\.ag/i)) {
    return { blocked: true, reason: 'Jupiter Trigger order mutation' };
  }
  if ((method === 'POST' || method === 'DELETE') && anyMatches(/(?:api|x402|barn\.api)\.cow\.fi\/(?:.*\/)?api\/v1\/orders/i)) {
    return { blocked: true, reason: 'CoW Protocol order mutation' };
  }
  if (method === 'POST' && anyMatches(/api\.hyperliquid\.xyz\/exchange/i)) {
    return { blocked: true, reason: 'Hyperliquid exchange order/action' };
  }

  return { blocked: false, reason: '' };
}

// ==================== Lightweight DOM & CSS Selector Engine ====================

function parseCssSelectors(selectorStr) {
  const list = [];
  let cur = '';
  let inBracket = 0;
  let inParen = 0;
  let quote = '';
  for (let i = 0; i < selectorStr.length; i++) {
    const ch = selectorStr[i];
    if (quote) {
      cur += ch;
      if (ch === quote && selectorStr[i - 1] !== '\\') quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '[') inBracket++;
    else if (ch === ']' && inBracket > 0) inBracket--;
    else if (ch === '(') inParen++;
    else if (ch === ')' && inParen > 0) inParen--;
    if (ch === ',' && inBracket === 0 && inParen === 0) {
      if (cur.trim()) list.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) list.push(cur.trim());
  return list;
}

function tokenizeComplexSelector(sel) {
  const tokens = [];
  let i = 0;
  const len = sel.length;
  while (i < len) {
    if (/\s/.test(sel[i])) {
      while (i < len && /\s/.test(sel[i])) i++;
      if (tokens.length > 0 && tokens[tokens.length - 1].type !== 'comb') {
        tokens.push({ type: 'comb', op: ' ' });
      }
      continue;
    }
    if (sel[i] === '>' || sel[i] === '+' || sel[i] === '~') {
      if (tokens.length > 0 && tokens[tokens.length - 1].type === 'comb') {
        tokens.pop();
      }
      tokens.push({ type: 'comb', op: sel[i] });
      i++;
      continue;
    }
    let compound = '';
    let inBracket = 0;
    let inParen = 0;
    let quote = '';
    while (i < len) {
      const ch = sel[i];
      if (quote) {
        compound += ch;
        if (ch === quote && sel[i - 1] !== '\\') quote = '';
        i++;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        compound += ch;
        i++;
        continue;
      }
      if (ch === '[') inBracket++;
      else if (ch === ']' && inBracket > 0) inBracket--;
      else if (ch === '(') inParen++;
      else if (ch === ')' && inParen > 0) inParen--;
      else if (inBracket === 0 && inParen === 0 && (/[\s>+~]/.test(ch))) break;
      compound += ch;
      i++;
    }
    if (compound) tokens.push({ type: 'simple', raw: compound });
  }
  if (tokens.length > 0 && tokens[tokens.length - 1].type === 'comb') tokens.pop();
  return tokens;
}

function matchCompound(el, raw) {
  if (!el || el.nodeType !== 1) return false;
  let i = 0;
  const len = raw.length;
  while (i < len) {
    const ch = raw[i];
    if (ch === '*') {
      i++;
    } else if (ch === '#') {
      i++;
      let id = '';
      while (i < len && !/[.#[:\s]/.test(raw[i])) id += raw[i++];
      if (el.getAttribute('id') !== id) return false;
    } else if (ch === '.') {
      i++;
      let cls = '';
      while (i < len && !/[.#[:\s]/.test(raw[i])) cls += raw[i++];
      if (!el.classList.contains(cls)) return false;
    } else if (ch === '[') {
      i++;
      let expr = '';
      let quote = '';
      while (i < len) {
        const c = raw[i++];
        if (quote) {
          if (c === quote && raw[i - 2] !== '\\') quote = '';
          expr += c;
        } else if (c === '"' || c === "'") {
          quote = c;
          expr += c;
        } else if (c === ']') {
          break;
        } else {
          expr += c;
        }
      }
      const attrMatch = /^\s*([^\s=~|^$*]+)\s*(?:(=|\^=|\$=|\*=|~=|\|=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]*)))?\s*$/.exec(expr);
      if (!attrMatch) return false;
      const attrName = attrMatch[1];
      const op = attrMatch[2];
      const expected = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
      if (!el.hasAttribute(attrName)) return false;
      if (op) {
        const actual = String(el.getAttribute(attrName) ?? '');
        if (op === '=' && actual !== expected) return false;
        if (op === '^=' && (!expected || !actual.startsWith(expected))) return false;
        if (op === '$=' && (!expected || !actual.endsWith(expected))) return false;
        if (op === '*=' && (!expected || !actual.includes(expected))) return false;
        if (op === '~=' && !actual.trim().split(/\s+/).includes(expected)) return false;
        if (op === '|=' && actual !== expected && !actual.startsWith(expected + '-')) return false;
      }
    } else if (ch === ':') {
      i++;
      let pseudo = '';
      while (i < len && !/[.#[:(\s]/.test(raw[i])) pseudo += raw[i++];
      let arg = '';
      if (i < len && raw[i] === '(') {
        i++;
        let depth = 1;
        while (i < len && depth > 0) {
          if (raw[i] === '(') depth++;
          else if (raw[i] === ')') depth--;
          if (depth > 0) arg += raw[i];
          i++;
        }
      }
      if (pseudo === 'not') {
        if (matchesSelector(el, arg)) return false;
      } else if (pseudo === 'first-child') {
        if (!el.parentNode || el.parentNode.firstElementChild !== el) return false;
      } else if (pseudo === 'last-child') {
        if (!el.parentNode || el.parentNode.lastElementChild !== el) return false;
      } else if (pseudo === 'disabled') {
        if (!el.disabled) return false;
      } else if (pseudo === 'enabled') {
        if (el.disabled) return false;
      } else if (pseudo === 'checked') {
        if (!el.checked) return false;
      }
    } else {
      let tag = '';
      while (i < len && !/[.#[:\s]/.test(raw[i])) tag += raw[i++];
      if (String(el.localName || el.tagName).toLowerCase() !== tag.toLowerCase()) return false;
    }
  }
  return true;
}

function matchTokensFromRight(el, tokens, idx) {
  if (idx < 0) return true;
  const tok = tokens[idx];
  if (tok.type !== 'simple') return false;
  if (!matchCompound(el, tok.raw)) return false;
  if (idx === 0) return true;
  const comb = tokens[idx - 1];
  if (!comb || comb.type !== 'comb') return false;
  if (comb.op === '>') {
    const parent = el.parentNode;
    return Boolean(parent && parent.nodeType === 1 && matchTokensFromRight(parent, tokens, idx - 2));
  }
  if (comb.op === ' ') {
    let cur = el.parentNode;
    while (cur && cur.nodeType === 1) {
      if (matchTokensFromRight(cur, tokens, idx - 2)) return true;
      cur = cur.parentNode;
    }
    return false;
  }
  if (comb.op === '+') {
    const prev = el.previousElementSibling;
    return Boolean(prev && matchTokensFromRight(prev, tokens, idx - 2));
  }
  if (comb.op === '~') {
    let prev = el.previousElementSibling;
    while (prev) {
      if (matchTokensFromRight(prev, tokens, idx - 2)) return true;
      prev = prev.previousElementSibling;
    }
    return false;
  }
  return false;
}

function matchesSelector(el, selectorStr) {
  if (!el || el.nodeType !== 1) return false;
  const parts = parseCssSelectors(String(selectorStr || ''));
  for (const part of parts) {
    const tokens = tokenizeComplexSelector(part);
    if (tokens.length > 0 && matchTokensFromRight(el, tokens, tokens.length - 1)) {
      return true;
    }
  }
  return false;
}

// ==================== CSS Rule Index (for getComputedStyle) ====================

function stripBalancedAtBlocks(cssText, atPrefixRe = /^@(?:media|supports|keyframes|-webkit-keyframes)\b/i) {
  const src = String(cssText || '');
  let out = '';
  let i = 0;
  const len = src.length;
  while (i < len) {
    if (src[i] === '@') {
      const rest = src.slice(i);
      if (atPrefixRe.test(rest)) {
        const braceStart = src.indexOf('{', i);
        const semiStart = src.indexOf(';', i);
        if (semiStart !== -1 && (braceStart === -1 || semiStart < braceStart)) {
          i = semiStart + 1;
          continue;
        }
        if (braceStart !== -1) {
          let depth = 1;
          let j = braceStart + 1;
          let quote = '';
          while (j < len && depth > 0) {
            const c = src[j];
            if (quote) {
              if (c === quote && src[j - 1] !== '\\') quote = '';
            } else if (c === '"' || c === "'") {
              quote = c;
            } else if (c === '{') {
              depth++;
            } else if (c === '}') {
              depth--;
            }
            j++;
          }
          i = j;
          continue;
        }
      }
    }
    out += src[i++];
  }
  return out;
}

function parseCssRuleMap(cssText) {
  const bySelector = new Map();
  const clean = String(cssText || '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Ignore @media / @supports / @keyframes blocks using balanced brace stripping
  const withoutMedia = stripBalancedAtBlocks(clean);
  const ruleRe = /([^{}@]+)\{([^{}]+)\}/g;
  let m;
  while ((m = ruleRe.exec(withoutMedia)) !== null) {
    const sels = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    const decls = {};
    for (const part of m[2].split(';')) {
      const colon = part.indexOf(':');
      if (colon <= 0) continue;
      const k = part.slice(0, colon).trim().toLowerCase();
      const v = part.slice(colon + 1).trim();
      if (k) decls[k] = v;
    }
    for (const sel of sels) {
      const existing = bySelector.get(sel) || {};
      Object.assign(existing, decls);
      bySelector.set(sel, existing);
    }
  }
  return bySelector;
}

// ==================== DOM Node Classes ====================

class DomEvent {
  constructor(type, init = {}) {
    this.type = String(type);
    this.bubbles = init.bubbles !== undefined ? Boolean(init.bubbles) : true;
    this.cancelable = init.cancelable !== undefined ? Boolean(init.cancelable) : true;
    this.detail = init.detail !== undefined ? init.detail : null;
    this.touches = init.touches || null;
    this.changedTouches = init.changedTouches || null;
    this.targetTouches = init.targetTouches || null;
    this.deltaY = init.deltaY;
    this.clientX = init.clientX;
    this.clientY = init.clientY;
    this.key = init.key;
    this.code = init.code;
    this.defaultPrevented = false;
    this._stopPropagation = false;
    this._stopImmediate = false;
    this.target = null;
    this.currentTarget = null;
  }
  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }
  stopPropagation() {
    this._stopPropagation = true;
  }
  stopImmediatePropagation() {
    this._stopPropagation = true;
    this._stopImmediate = true;
  }
}

function isClickDisabled(node) {
  let cur = node;
  while (cur && cur.nodeType === 1) {
    if (
      (cur === node || cur.localName === 'button' || cur.localName === 'fieldset') &&
      (cur.disabled || (typeof cur.hasAttribute === 'function' && cur.hasAttribute('disabled')))
    ) {
      return true;
    }
    cur = cur.parentNode;
  }
  return false;
}

class DomNode {
  constructor(ownerDocument, nodeType) {
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.parentNode = null;
    this.childNodes = [];
    this._listeners = new Map();
  }

  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.childNodes.length ? this.parentNode.childNodes[idx + 1] : null;
  }
  get previousSibling() {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx > 0 ? this.parentNode.childNodes[idx - 1] : null;
  }
  get nextElementSibling() {
    let cur = this.nextSibling;
    while (cur && cur.nodeType !== 1) cur = cur.nextSibling;
    return cur || null;
  }
  get previousElementSibling() {
    let cur = this.previousSibling;
    while (cur && cur.nodeType !== 1) cur = cur.previousSibling;
    return cur || null;
  }
  get children() {
    return this.childNodes.filter((n) => n.nodeType === 1);
  }
  get firstElementChild() {
    return this.childNodes.find((n) => n.nodeType === 1) || null;
  }
  get lastElementChild() {
    for (let i = this.childNodes.length - 1; i >= 0; i--) {
      if (this.childNodes[i].nodeType === 1) return this.childNodes[i];
    }
    return null;
  }

  contains(other) {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  appendChild(node) {
    return this.insertBefore(node, null);
  }

  insertBefore(node, refNode) {
    if (!node) return node;
    if (node.nodeType === 11) {
      const items = [...node.childNodes];
      for (const item of items) {
        this.insertBefore(item, refNode);
      }
      return node;
    }
    if (node.parentNode) {
      node.parentNode.removeChild(node);
    }
    node.parentNode = this;
    if (refNode && refNode.parentNode === this) {
      const idx = this.childNodes.indexOf(refNode);
      this.childNodes.splice(idx >= 0 ? idx : this.childNodes.length, 0, node);
    } else {
      this.childNodes.push(node);
    }
    this.ownerDocument._notifyChildList(this);
    if (node.nodeType === 1 && this.ownerDocument._onNodeInserted) {
      this.ownerDocument._onNodeInserted(node, this);
    }
    return node;
  }

  removeChild(node) {
    const idx = this.childNodes.indexOf(node);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      node.parentNode = null;
      this.ownerDocument._notifyChildList(this);
    }
    return node;
  }

  replaceChild(newChild, oldChild) {
    if (oldChild && oldChild.parentNode === this) {
      this.insertBefore(newChild, oldChild);
      this.removeChild(oldChild);
    }
    return oldChild;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }

  addEventListener(type, fn, opts) {
    if (typeof fn !== 'function') return;
    const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
    const once = Boolean(opts && typeof opts === 'object' && opts.once);
    const list = this._listeners.get(type) || [];
    if (!list.some((x) => x.fn === fn && x.capture === capture)) {
      list.push({ fn, capture, once });
      this._listeners.set(type, list);
    }
  }

  removeEventListener(type, fn, opts) {
    const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
    const list = this._listeners.get(type);
    if (!list) return;
    const next = list.filter((x) => !(x.fn === fn && x.capture === capture));
    if (next.length) this._listeners.set(type, next);
    else this._listeners.delete(type);
  }

  dispatchEvent(ev) {
    if (!ev || !ev.type) return true;
    if (ev.type === 'click' && isClickDisabled(this)) return false;

    let toggleKind = '';
    let prevChecked = false;
    const prevSiblingRadios = [];
    if (ev.type === 'click' && this.nodeType === 1 && this.localName === 'input') {
      const inputType = String(this.getAttribute('type') || 'text').toLowerCase();
      if (inputType === 'checkbox') {
        toggleKind = 'checkbox';
        prevChecked = Boolean(this.checked);
        this.checked = !prevChecked;
      } else if (inputType === 'radio') {
        toggleKind = 'radio';
        prevChecked = Boolean(this.checked);
        if (!prevChecked) {
          const radioName = this.getAttribute('name');
          const radioScope = (typeof this.closest === 'function' && this.closest('form')) || this.ownerDocument;
          if (radioName && radioScope) {
            for (const sib of radioScope.querySelectorAll('input[type="radio"]')) {
              if (sib !== this && sib.getAttribute('name') === radioName && sib.checked) {
                prevSiblingRadios.push(sib);
                sib.checked = false;
              }
            }
          }
          this.checked = true;
        }
      }
    }

    ev.target = this;
    const path = [];
    let cur = this;
    while (cur) {
      path.push(cur);
      cur = cur.parentNode;
    }
    // Capture phase (top -> target)
    for (let i = path.length - 1; i >= 0; i--) {
      if (ev._stopPropagation) break;
      const node = path[i];
      const list = [...(node._listeners.get(ev.type) || [])];
      ev.currentTarget = node;
      for (const entry of list) {
        if (!entry.capture) continue;
        if (entry.once) node.removeEventListener(ev.type, entry.fn, true);
        entry.fn.call(node, ev);
        if (ev._stopImmediate) break;
      }
    }
    // Bubble phase (target -> top)
    for (let i = 0; i < path.length; i++) {
      if (ev._stopPropagation) break;
      if (i > 0 && !ev.bubbles) break;
      const node = path[i];
      ev.currentTarget = node;
      const list = [...(node._listeners.get(ev.type) || [])];
      for (const entry of list) {
        if (entry.capture) continue;
        if (entry.once) node.removeEventListener(ev.type, entry.fn, false);
        entry.fn.call(node, ev);
        if (ev._stopImmediate) break;
      }
      if (!ev._stopPropagation && node.nodeType === 1) {
        const propFn = node[`on${ev.type}`];
        if (typeof propFn === 'function') {
          propFn.call(node, ev);
        } else {
          const inlineCode = node.getAttribute(`on${ev.type}`);
          if (inlineCode && this.ownerDocument._evalInlineHandler) {
            this.ownerDocument._evalInlineHandler(node, inlineCode, ev);
          }
        }
      }
    }
    if (this.ownerDocument._window && ev.bubbles && !ev._stopPropagation) {
      const winList = [...(this.ownerDocument._window._listeners.get(ev.type) || [])];
      ev.currentTarget = this.ownerDocument._window;
      for (const entry of winList) {
        if (entry.capture) continue;
        if (entry.once) this.ownerDocument._window.removeEventListener(ev.type, entry.fn, false);
        entry.fn.call(this.ownerDocument._window, ev);
        if (ev._stopImmediate) break;
      }
    }

    if (toggleKind === 'checkbox') {
      if (ev.defaultPrevented) {
        this.checked = prevChecked;
      } else {
        this.dispatchEvent(new DomEvent('change', { bubbles: true, cancelable: false }));
      }
    } else if (toggleKind === 'radio') {
      if (ev.defaultPrevented) {
        this.checked = prevChecked;
        for (const sib of prevSiblingRadios) sib.checked = true;
      } else if (!prevChecked) {
        this.dispatchEvent(new DomEvent('change', { bubbles: true, cancelable: false }));
      }
    }

    return !ev.defaultPrevented;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1) {
          if (matchesSelector(ch, sel)) out.push(ch);
          walk(ch);
        }
      }
    };
    walk(this);
    return out;
  }

  getElementById(id) {
    const walk = (node) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1) {
          if (ch.getAttribute('id') === id) return ch;
          const found = walk(ch);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(this);
  }
}

class DomText extends DomNode {
  constructor(ownerDocument, text, nodeType = 3) {
    super(ownerDocument, nodeType);
    this._data = String(text ?? '');
  }
  get data() { return this._data; }
  set data(v) { this._data = String(v ?? ''); }
  get nodeValue() { return this._data; }
  set nodeValue(v) { this._data = String(v ?? ''); }
  get textContent() { return this._data; }
  set textContent(v) { this._data = String(v ?? ''); }
  get nodeName() { return this.nodeType === 8 ? '#comment' : '#text'; }
  cloneNode() { return new DomText(this.ownerDocument, this._data, this.nodeType); }
}

class DomFragment extends DomNode {
  constructor(ownerDocument) {
    super(ownerDocument, 11);
  }
  get nodeName() { return '#document-fragment'; }
  get textContent() {
    return this.childNodes.map((c) => c.textContent || '').join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (v !== '' && v !== null && v !== undefined) {
      this.appendChild(this.ownerDocument.createTextNode(String(v)));
    }
  }
}

class DomElement extends DomNode {
  constructor(ownerDocument, tagName, namespaceURI = null) {
    super(ownerDocument, 1);
    const lower = String(tagName || '').toLowerCase();
    this.localName = lower;
    this.namespaceURI = namespaceURI;
    this.tagName = namespaceURI && namespaceURI.includes('svg') ? lower : lower.toUpperCase();
    this._attrs = new Map();
    this._propValue = undefined;
    this._propChecked = undefined;
    this._propSelected = undefined;
    this._propDisabled = undefined;
    this._styleObj = this._createStyleProxy();
    this.classList = this._createClassList();
    this.dataset = this._createDatasetProxy();
  }

  get nodeName() { return this.tagName; }

  _createClassList() {
    const el = this;
    const getTokens = () => {
      const raw = el._attrs.get('class') || '';
      return raw ? raw.trim().split(/\s+/).filter(Boolean) : [];
    };
    const setTokens = (tokens) => {
      const next = tokens.join(' ');
      el.setAttribute('class', next);
    };
    return {
      contains(cls) { return getTokens().includes(String(cls)); },
      add(...classes) {
        const set = new Set(getTokens());
        for (const c of classes) if (c) set.add(String(c));
        setTokens([...set]);
      },
      remove(...classes) {
        const rm = new Set(classes.map(String));
        setTokens(getTokens().filter((c) => !rm.has(c)));
      },
      toggle(cls, force) {
        const c = String(cls);
        const has = this.contains(c);
        const nextState = force !== undefined ? Boolean(force) : !has;
        if (nextState) this.add(c);
        else this.remove(c);
        return nextState;
      },
      get length() { return getTokens().length; },
      item(idx) { return getTokens()[idx] ?? null; },
      toString() { return getTokens().join(' '); },
      [Symbol.iterator]() { return getTokens()[Symbol.iterator](); }
    };
  }

  _createDatasetProxy() {
    const el = this;
    return new Proxy({}, {
      get(_, prop) {
        if (typeof prop !== 'string') return undefined;
        const attr = 'data-' + toKebabCaseAttr(prop);
        return el._attrs.has(attr) ? el._attrs.get(attr) : undefined;
      },
      set(_, prop, val) {
        if (typeof prop !== 'string') return false;
        el.setAttribute('data-' + toKebabCaseAttr(prop), String(val));
        return true;
      },
      deleteProperty(_, prop) {
        if (typeof prop !== 'string') return false;
        el.removeAttribute('data-' + toKebabCaseAttr(prop));
        return true;
      },
      has(_, prop) {
        if (typeof prop !== 'string') return false;
        return el._attrs.has('data-' + toKebabCaseAttr(prop));
      },
      ownKeys() {
        const keys = [];
        for (const k of el._attrs.keys()) {
          if (k.startsWith('data-')) keys.push(toCamelCaseAttr(k.slice(5)));
        }
        return keys;
      },
      getOwnPropertyDescriptor(_, prop) {
        if (typeof prop !== 'string') return undefined;
        const attr = 'data-' + toKebabCaseAttr(prop);
        if (!el._attrs.has(attr)) return undefined;
        return { enumerable: true, configurable: true, value: el._attrs.get(attr) };
      }
    });
  }

  _parseStyleMap() {
    const raw = this._attrs.get('style') || '';
    const map = new Map();
    for (const part of raw.split(';')) {
      const idx = part.indexOf(':');
      if (idx <= 0) continue;
      const k = part.slice(0, idx).trim().toLowerCase();
      const v = part.slice(idx + 1).trim();
      if (k && v !== '') map.set(k, v);
    }
    return map;
  }

  _writeStyleMap(map) {
    const parts = [];
    for (const [k, v] of map.entries()) {
      if (v !== '' && v !== null && v !== undefined) parts.push(`${k}: ${v}`);
    }
    if (parts.length) this.setAttribute('style', parts.join('; ') + ';');
    else this.removeAttribute('style');
  }

  _createStyleProxy() {
    const el = this;
    const base = {
      setProperty(k, v) {
        const map = el._parseStyleMap();
        const key = String(k).toLowerCase();
        if (v === '' || v === null || v === undefined) map.delete(key);
        else map.set(key, String(v));
        el._writeStyleMap(map);
      },
      getPropertyValue(k) {
        return el._parseStyleMap().get(String(k).toLowerCase()) || '';
      },
      removeProperty(k) {
        const map = el._parseStyleMap();
        const key = String(k).toLowerCase();
        const old = map.get(key) || '';
        map.delete(key);
        el._writeStyleMap(map);
        return old;
      }
    };
    return new Proxy(base, {
      get(target, prop) {
        if (prop === 'cssText') return el._attrs.get('style') || '';
        if (prop in target) return target[prop];
        if (typeof prop !== 'string') return undefined;
        return el._parseStyleMap().get(toKebabCaseAttr(prop)) || '';
      },
      set(_, prop, val) {
        if (prop === 'cssText') {
          if (val) el.setAttribute('style', String(val));
          else el.removeAttribute('style');
          return true;
        }
        if (typeof prop !== 'string') return false;
        const map = el._parseStyleMap();
        const key = toKebabCaseAttr(prop);
        if (val === '' || val === null || val === undefined) map.delete(key);
        else map.set(key, String(val));
        el._writeStyleMap(map);
        return true;
      }
    });
  }

  get style() { return this._styleObj; }
  set style(v) {
    if (typeof v === 'string') this._styleObj.cssText = v;
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', String(v ?? '')); }

  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', String(v ?? '')); }

  get type() { return this.getAttribute('type') || (this.localName === 'button' ? 'submit' : 'text'); }
  set type(v) { this.setAttribute('type', String(v ?? '')); }

  get src() { return this.getAttribute('src') || ''; }
  set src(v) { this.setAttribute('src', String(v ?? '')); }

  get href() { return this.getAttribute('href') || ''; }
  set href(v) { this.setAttribute('href', String(v ?? '')); }

  get title() { return this.getAttribute('title') || ''; }
  set title(v) { this.setAttribute('title', String(v ?? '')); }

  get placeholder() { return this.getAttribute('placeholder') || ''; }
  set placeholder(v) { this.setAttribute('placeholder', String(v ?? '')); }

  get htmlFor() { return this.getAttribute('for') || ''; }
  set htmlFor(v) { this.setAttribute('for', String(v ?? '')); }

  get disabled() {
    if (this._propDisabled !== undefined) return this._propDisabled;
    return this._attrs.has('disabled');
  }
  set disabled(v) {
    this._propDisabled = Boolean(v);
    if (this._propDisabled) this._attrs.set('disabled', '');
    else this._attrs.delete('disabled');
  }

  get checked() {
    if (this._propChecked !== undefined) return this._propChecked;
    return this._attrs.has('checked');
  }
  set checked(v) {
    this._propChecked = Boolean(v);
  }

  get selected() {
    if (this._propSelected !== undefined) return this._propSelected;
    return this._attrs.has('selected');
  }
  set selected(v) {
    this._propSelected = Boolean(v);
  }

  get options() {
    return this.querySelectorAll('option');
  }

  get selectedIndex() {
    if (this.localName !== 'select') return -1;
    const opts = this.options;
    const idx = opts.findIndex((o) => o.selected);
    return idx >= 0 ? idx : (opts.length > 0 ? 0 : -1);
  }
  set selectedIndex(idx) {
    if (this.localName !== 'select') return;
    const opts = this.options;
    opts.forEach((o, i) => { o.selected = (i === idx); });
    if (opts[idx]) this._propValue = opts[idx].value;
  }

  get value() {
    if (this.localName === 'select') {
      if (this._propValue !== undefined) return this._propValue;
      const opts = this.options;
      const sel = opts.find((o) => o.selected) || opts[0];
      return sel ? sel.value : '';
    }
    if (this.localName === 'option') {
      if (this._propValue !== undefined) return this._propValue;
      return this._attrs.has('value') ? this._attrs.get('value') : this.textContent;
    }
    if (this._propValue !== undefined) return this._propValue;
    return this._attrs.get('value') ?? '';
  }
  set value(v) {
    const str = v === null || v === undefined ? '' : String(v);
    this._propValue = str;
    if (this.localName === 'select') {
      const opts = this.options;
      let matched = false;
      for (const o of opts) {
        const isMatch = o.value === str;
        o.selected = isMatch;
        if (isMatch) matched = true;
      }
      if (!matched && opts.length > 0) this._propValue = str;
    }
  }

  setAttribute(name, value) {
    const key = String(name).toLowerCase();
    const val = String(value ?? '');
    const oldVal = this._attrs.has(key) ? this._attrs.get(key) : null;
    this._attrs.set(key, val);
    if (key === 'disabled') this._propDisabled = true;
    if (key === 'checked') this._propChecked = true;
    if (key === 'selected') this._propSelected = true;
    if (key === 'value' && this._propValue === undefined) this._propValue = val;
    this.ownerDocument._notifyAttribute(this, key, oldVal, val);
  }

  getAttribute(name) {
    const key = String(name).toLowerCase();
    return this._attrs.has(key) ? this._attrs.get(key) : null;
  }

  removeAttribute(name) {
    const key = String(name).toLowerCase();
    const had = this._attrs.has(key);
    const oldVal = had ? this._attrs.get(key) : null;
    this._attrs.delete(key);
    if (key === 'disabled') this._propDisabled = false;
    if (key === 'checked') this._propChecked = false;
    if (key === 'selected') this._propSelected = false;
    if (had) this.ownerDocument._notifyAttribute(this, key, oldVal, null);
  }

  hasAttribute(name) {
    return this._attrs.has(String(name).toLowerCase());
  }

  setAttributeNS(_ns, name, value) {
    return this.setAttribute(name, value);
  }

  getAttributeNS(_ns, name) {
    return this.getAttribute(name);
  }

  removeAttributeNS(_ns, name) {
    return this.removeAttribute(name);
  }

  hasAttributeNS(_ns, name) {
    return this.hasAttribute(name);
  }

  get textContent() {
    let out = '';
    for (const c of this.childNodes) {
      if (c.nodeType === 3 || c.nodeType === 1) out += c.textContent;
    }
    return out;
  }
  set textContent(v) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = [];
    if (this.localName === 'select') this._propValue = undefined;
    if (v !== '' && v !== null && v !== undefined) {
      this.appendChild(this.ownerDocument.createTextNode(String(v)));
    } else {
      this.ownerDocument._notifyChildList(this);
    }
  }

  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }

  get innerHTML() {
    return this.childNodes.map((c) => serializeNode(c)).join('');
  }
  set innerHTML(htmlStr) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = [];
    if (this.localName === 'select') this._propValue = undefined;
    const frag = this.ownerDocument._parseFragment(String(htmlStr ?? ''), this.namespaceURI);
    this.appendChild(frag);
  }

  get outerHTML() {
    return serializeNode(this);
  }

  matches(sel) { return matchesSelector(this, sel); }

  closest(sel) {
    let cur = this;
    while (cur && cur.nodeType === 1) {
      if (matchesSelector(cur, sel)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1) {
          if (matchesSelector(ch, sel)) out.push(ch);
          walk(ch);
        }
      }
    };
    walk(this);
    return out;
  }

  getElementById(id) {
    const walk = (node) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1) {
          if (ch.getAttribute('id') === id) return ch;
          const found = walk(ch);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(this);
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, right: 320, bottom: 248, width: 320, height: 248, x: 0, y: 0 };
  }

  focus() {}
  blur() {}
  scrollIntoView() {}
  click() {
    this.dispatchEvent(new DomEvent('click', { bubbles: true, cancelable: true }));
  }

  cloneNode(deep = false) {
    const copy = new DomElement(this.ownerDocument, this.localName, this.namespaceURI);
    for (const [k, v] of this._attrs.entries()) copy._attrs.set(k, v);
    if (deep) {
      for (const ch of this.childNodes) copy.appendChild(ch.cloneNode(true));
    }
    return copy;
  }
}

function serializeNode(node) {
  if (!node) return '';
  if (node.nodeType === 3) return escapeHtmlText(node.data);
  if (node.nodeType === 8) return `<!--${node.data}-->`;
  if (node.nodeType !== 1) return '';
  const tag = node.localName;
  let attrs = '';
  for (const [k, v] of node._attrs.entries()) {
    attrs += v === '' && (k === 'disabled' || k === 'checked' || k === 'selected' || k === 'defer' || k === 'async')
      ? ` ${k}`
      : ` ${k}="${escapeHtmlAttr(v)}"`;
  }
  if (VOID_TAGS.has(tag)) return `<${tag}${attrs} />`;
  const inner = node.childNodes.map(serializeNode).join('');
  return `<${tag}${attrs}>${inner}</${tag}>`;
}

// ==================== HTML Parser ====================

function parseAttributes(rawAttrs) {
  const attrs = [];
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(rawAttrs)) !== null) {
    const name = m[1].toLowerCase();
    const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
    attrs.push([name, decodeHtmlEntities(val)]);
  }
  return attrs;
}

function parseHtmlIntoParent(doc, parent, htmlStr, defaultNs = null) {
  const src = String(htmlStr || '');
  const len = src.length;
  const stack = [{ node: parent, ns: defaultNs }];
  let pos = 0;

  while (pos < len) {
    const lt = src.indexOf('<', pos);
    if (lt === -1) {
      const txt = decodeHtmlEntities(src.slice(pos));
      if (txt) stack[stack.length - 1].node.appendChild(doc.createTextNode(txt));
      break;
    }
    if (lt > pos) {
      const txt = decodeHtmlEntities(src.slice(pos, lt));
      if (txt) stack[stack.length - 1].node.appendChild(doc.createTextNode(txt));
    }
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      const commentText = end === -1 ? src.slice(lt + 4) : src.slice(lt + 4, end);
      stack[stack.length - 1].node.appendChild(doc.createComment(commentText));
      pos = end === -1 ? len : end + 3;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt + 2);
      pos = end === -1 ? len : end + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt + 2);
      if (end === -1) break;
      const closeTag = src.slice(lt + 2, end).trim().toLowerCase();
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].node.localName === closeTag) {
          stack.length = i;
          break;
        }
      }
      pos = end + 1;
      continue;
    }

    // Opening tag: scan for '>' outside quotes
    let i = lt + 1;
    let quote = '';
    while (i < len) {
      const c = src[i];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      i++;
    }
    if (i >= len) break;

    const rawTagBody = src.slice(lt + 1, i);
    const selfClosing = rawTagBody.endsWith('/');
    const cleanBody = selfClosing ? rawTagBody.slice(0, -1).trim() : rawTagBody.trim();
    const spaceIdx = cleanBody.search(/\s/);
    const tagName = (spaceIdx === -1 ? cleanBody : cleanBody.slice(0, spaceIdx)).toLowerCase();
    const attrStr = spaceIdx === -1 ? '' : cleanBody.slice(spaceIdx + 1);

    if (!tagName) {
      pos = i + 1;
      continue;
    }

    const parentEntry = stack[stack.length - 1];
    const ns = (tagName === 'svg' || (parentEntry.ns && SVG_TAGS.has(tagName)))
      ? 'http://www.w3.org/2000/svg'
      : null;

    const el = ns
      ? new DomElement(doc, tagName, ns)
      : new DomElement(doc, tagName, null);

    for (const [k, v] of parseAttributes(attrStr)) {
      el._attrs.set(k, v);
      if (k === 'disabled') el._propDisabled = true;
      if (k === 'checked') el._propChecked = true;
      if (k === 'selected') el._propSelected = true;
    }
    parentEntry.node.appendChild(el);
    pos = i + 1;

    if (tagName === 'script' || tagName === 'style') {
      const closeRe = new RegExp(`</${tagName}\\s*>`, 'i');
      const rest = src.slice(pos);
      const cm = closeRe.exec(rest);
      const rawContent = cm ? rest.slice(0, cm.index) : rest;
      if (rawContent) el.appendChild(doc.createTextNode(rawContent));
      pos = cm ? pos + cm.index + cm[0].length : len;
      continue;
    }

    if (!selfClosing && !VOID_TAGS.has(tagName)) {
      stack.push({ node: el, ns });
    }
  }
}

class DomDocument extends DomNode {
  constructor() {
    super(null, 9);
    this.ownerDocument = this;
    this.documentElement = null;
    this.head = null;
    this.body = null;
    this.hidden = false;
    this.visibilityState = 'visible';
    this._observers = new Set();
    this._window = null;
    this._evalInlineHandler = null;
    this._onNodeInserted = null;
  }

  get nodeName() { return '#document'; }

  createElement(tag) { return new DomElement(this, tag, null); }
  createElementNS(ns, tag) { return new DomElement(this, tag, ns); }
  createTextNode(txt) { return new DomText(this, txt, 3); }
  createComment(txt) { return new DomText(this, txt, 8); }
  createDocumentFragment() { return new DomFragment(this); }

  getElementById(id) {
    return this.documentElement ? this.documentElement.getElementById(id) : null;
  }
  querySelector(sel) {
    return this.documentElement ? this.documentElement.querySelector(sel) : null;
  }
  querySelectorAll(sel) {
    return this.documentElement ? this.documentElement.querySelectorAll(sel) : [];
  }

  _parseFragment(htmlStr, ns = null) {
    const frag = this.createDocumentFragment();
    parseHtmlIntoParent(this, frag, htmlStr, ns);
    return frag;
  }

  _registerObserver(obs) { this._observers.add(obs); }
  _unregisterObserver(obs) { this._observers.delete(obs); }

  _notifyAttribute(target, attrName, oldValue, newValue) {
    if (this._observers.size === 0) return;
    for (const obs of this._observers) {
      obs._enqueueIfMatch(target, 'attributes', { attributeName: attrName, oldValue });
    }
  }

  _notifyChildList(target) {
    if (this._observers.size === 0) return;
    for (const obs of this._observers) {
      obs._enqueueIfMatch(target, 'childList', {});
    }
  }
}

class DomMutationObserver {
  constructor(callback) {
    this._callback = callback;
    this._targets = [];
    this._queue = [];
    this._scheduled = false;
    this._doc = null;
  }
  observe(target, options = {}) {
    if (!target || !target.ownerDocument) return;
    this._doc = target.ownerDocument;
    this._doc._registerObserver(this);
    this._targets.push({ target, options });
  }
  disconnect() {
    this._targets = [];
    this._queue = [];
    if (this._doc) this._doc._unregisterObserver(this);
  }
  takeRecords() {
    const recs = [...this._queue];
    this._queue = [];
    return recs;
  }
  _enqueueIfMatch(node, type, extra) {
    for (const entry of this._targets) {
      const matchTarget = entry.target === node || (entry.options.subtree && entry.target.contains(node));
      if (!matchTarget) continue;
      if (type === 'attributes' && entry.options.attributes) {
        if (Array.isArray(entry.options.attributeFilter) && !entry.options.attributeFilter.includes(extra.attributeName)) {
          continue;
        }
        this._queue.push({ type: 'attributes', target: node, attributeName: extra.attributeName, oldValue: extra.oldValue });
        this._scheduleFlush();
        break;
      }
      if (type === 'childList' && entry.options.childList) {
        this._queue.push({ type: 'childList', target: node });
        this._scheduleFlush();
        break;
      }
    }
  }
  _scheduleFlush() {
    if (this._scheduled) return;
    this._scheduled = true;
    queueMicrotask(() => {
      this._scheduled = false;
      if (this._queue.length > 0) {
        const records = this.takeRecords();
        try { this._callback(records, this); } catch (_) {}
      }
    });
  }
}

// ==================== Isolated Browser Wallet Session ====================

async function createWalletAppSession(options = {}) {
  const preferDist = options.preferDist !== false;
  const { assetRoot, isDist } = resolveAssetRoot(preferDist);
  const htmlPath = path.join(assetRoot, 'index.html');
  const cssPath = path.join(assetRoot, 'style.css');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
  const cssRules = parseCssRuleMap(css);

  // Storage
  const lsMap = new Map();
  if (options.localStorage && typeof options.localStorage === 'object') {
    for (const [k, v] of Object.entries(options.localStorage)) {
      lsMap.set(String(k), typeof v === 'string' ? v : JSON.stringify(v));
    }
  }
  const ssMap = new Map();
  const makeStorage = (map) => ({
    getItem(k) { return map.has(String(k)) ? map.get(String(k)) : null; },
    setItem(k, v) { map.set(String(k), String(v)); },
    removeItem(k) { map.delete(String(k)); },
    clear() { map.clear(); },
    key(idx) { return Array.from(map.keys())[idx] ?? null; },
    get length() { return map.size; }
  });
  const localStorage = makeStorage(lsMap);
  const sessionStorage = makeStorage(ssMap);

  // Document & Window setup
  const document = new DomDocument();
  const docFrag = document.createDocumentFragment();
  parseHtmlIntoParent(document, docFrag, html);
  const htmlEl = docFrag.querySelector('html') || document.createElement('html');
  document.documentElement = htmlEl;
  document.appendChild(htmlEl);
  document.head = htmlEl.querySelector('head') || document.createElement('head');
  document.body = htmlEl.querySelector('body') || document.createElement('body');

  const clipboardLog = [];
  const toastHistory = [];
  const networkLog = [];
  const runtimeErrors = [];
  const activeTimeouts = new Set();
  const activeIntervals = new Set();
  const activeWebSockets = new Set();
  const loadedScriptSrcs = new Set();
  let cleanedUp = false;

  // Track #toast updates via MutationObserver
  const toastEl = document.getElementById('toast');
  let lastRecordedToastKey = '';
  if (toastEl) {
    const origClassAdd = toastEl.classList.add.bind(toastEl.classList);
    toastEl.classList.add = (...classes) => {
      origClassAdd(...classes);
      if (classes.includes('show')) {
        const msg = toastEl.textContent || '';
        const key = `${msg}@@${toastHistory.length}`;
        if (msg && key !== lastRecordedToastKey) {
          lastRecordedToastKey = key;
          toastHistory.push({ text: msg, timestamp: Date.now() });
        }
      }
    };
  }

  // Timers (always tracked for cleanup; .unref() delays >= 50ms so 0ms dynamic script loads stay ref'd)
  const wrappedSetTimeout = (fn, ms, ...args) => {
    if (cleanedUp) return 0;
    const delay = Math.max(0, Number(ms) || 0);
    const handle = setTimeout(() => {
      activeTimeouts.delete(handle);
      if (!cleanedUp && typeof fn === 'function') fn(...args);
    }, delay);
    if (delay >= 50 && typeof handle.unref === 'function') handle.unref();
    activeTimeouts.add(handle);
    return handle;
  };
  const wrappedClearTimeout = (handle) => {
    activeTimeouts.delete(handle);
    clearTimeout(handle);
  };
  const wrappedSetInterval = (fn, ms, ...args) => {
    if (cleanedUp) return 0;
    const handle = setInterval(() => {
      if (!cleanedUp && typeof fn === 'function') fn(...args);
    }, Math.max(10, Number(ms) || 10));
    if (typeof handle.unref === 'function') handle.unref();
    activeIntervals.add(handle);
    return handle;
  };
  const wrappedClearInterval = (handle) => {
    activeIntervals.delete(handle);
    clearInterval(handle);
  };

  // Stub WebSocket
  class StubWebSocket {
    constructor(url) {
      this.url = String(url || '');
      this.readyState = 0; // CONNECTING
      this.sentMessages = [];
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this.onclose = null;
      activeWebSockets.add(this);
    }
    send(data) { this.sentMessages.push(String(data ?? '')); }
    close() {
      this.readyState = 3;
      activeWebSockets.delete(this);
      if (typeof this.onclose === 'function') {
        try { this.onclose({ code: 1000, reason: 'closed' }); } catch (_) {}
      }
    }
  }
  StubWebSocket.CONNECTING = 0;
  StubWebSocket.OPEN = 1;
  StubWebSocket.CLOSING = 2;
  StubWebSocket.CLOSED = 3;

  const HostRequest = typeof globalThis.Request === 'function' ? globalThis.Request : null;
  class SandboxRequest extends (HostRequest || Object) {
    constructor(input, init) {
      let resolvedInput = input;
      if (typeof input === 'string' && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)) {
        resolvedInput = new URL(input, 'http://127.0.0.1:3334').href;
      }
      if (HostRequest) {
        if (init !== undefined) super(resolvedInput, init);
        else super(resolvedInput);
      } else {
        this.url = typeof resolvedInput === 'string' ? resolvedInput : (resolvedInput && resolvedInput.url ? resolvedInput.url : String(resolvedInput || ''));
        this.method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        this.headers = new Headers((init && init.headers) || (input && input.headers) || {});
        this.body = init && init.body !== undefined ? init.body : null;
      }
      if (init && init.body !== undefined) {
        this._bodyText = normalizeBodyText(init.body);
      } else if (input && typeof input === 'object' && typeof input._bodyText === 'string') {
        this._bodyText = input._bodyText;
      } else {
        this._bodyText = undefined;
      }
    }
  }

  // Guarded Fetch
  const guardedFetch = async (input, init = {}) => {
    const isReqObj = Boolean(input && typeof input === 'object' && typeof input.url === 'string');
    const url = typeof input === 'string' ? input : (isReqObj ? input.url : String(input || ''));
    const method = String((init && init.method) || (isReqObj && input.method) || 'GET').toUpperCase();
    let body = '';
    if (init && init.body !== undefined) {
      body = normalizeBodyText(init.body);
    } else if (isReqObj) {
      if (typeof input._bodyText === 'string') {
        body = input._bodyText;
      } else if (typeof input.clone === 'function') {
        try {
          body = await input.clone().text();
        } catch (_) {
          body = '';
        }
      } else if (input.body !== undefined) {
        body = normalizeBodyText(input.body);
      }
    }
    const guard = isBroadcastRequest(url, { method, body });

    if (guard.blocked) {
      networkLog.push({
        url,
        method,
        body,
        blocked: true,
        realNetworkSent: false,
        reason: guard.reason,
        timestamp: Date.now()
      });
      if (typeof options.fetchMock === 'function' && options.allowMockOnBroadcast === true) {
        return await options.fetchMock(url, { ...init, method, body }, guard);
      }
      throw new Error(`E2E_BROADCAST_BLOCKED: ${guard.reason} -> ${url}`);
    }

    const entry = {
      url,
      method,
      body,
      blocked: false,
      realNetworkSent: false,
      reason: '',
      timestamp: Date.now()
    };
    networkLog.push(entry);

    if (typeof options.fetchMock === 'function') {
      const mocked = await options.fetchMock(url, { ...init, method, body });
      if (mocked !== undefined) return mocked;
    }

    if (options.allowLiveReadOnlyFetch === true) {
      entry.realNetworkSent = true;
      return await fetch(input, init);
    }

    return {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable (E2E Offline)',
      headers: new Headers({ 'content-type': 'application/json' }),
      async json() { return { error: 'Offline in E2E harness' }; },
      async text() { return JSON.stringify({ error: 'Offline in E2E harness' }); }
    };
  };

  // Window & Sandbox Context
  const winListeners = new Map();
  const viewportWidth = Number(options.viewportWidth || 375);
  const viewportHeight = Number(options.viewportHeight || 812);

  const sandbox = {
    document,
    localStorage,
    sessionStorage,
    crypto: nodeCrypto.webcrypto,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    Headers,
    Request: SandboxRequest,
    AbortController,
    AbortSignal,
    atob: (b64) => Buffer.from(String(b64), 'base64').toString('binary'),
    btoa: (bin) => Buffer.from(String(bin), 'binary').toString('base64'),
    fetch: guardedFetch,
    WebSocket: StubWebSocket,
    Event: DomEvent,
    CustomEvent: DomEvent,
    MutationObserver: DomMutationObserver,
    HTMLElement: DomElement,
    Element: DomElement,
    Node: DomNode,
    location: {
      protocol: 'http:',
      hostname: '127.0.0.1',
      host: '127.0.0.1:3334',
      port: '3334',
      pathname: '/',
      origin: 'http://127.0.0.1:3334',
      href: 'http://127.0.0.1:3334/',
      reload() {}
    },
    navigator: {
      userAgent: options.userAgent || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile',
      clipboard: {
        async writeText(txt) {
          clipboardLog.push(String(txt ?? ''));
        },
        async readText() {
          return clipboardLog[clipboardLog.length - 1] || '';
        }
      },
      credentials: options.publicKeyCredential || undefined,
      serviceWorker: {
        async getRegistrations() { return []; },
        async register() { return null; },
        addEventListener() {}
      }
    },
    visualViewport: {
      width: viewportWidth,
      height: viewportHeight,
      offsetTop: 0,
      addEventListener() {},
      removeEventListener() {}
    },
    innerWidth: viewportWidth,
    innerHeight: viewportHeight,
    scrollY: 0,
    pageYOffset: 0,
    scrollTo(x, y) {
      sandbox.scrollY = Number(y || 0);
      sandbox.pageYOffset = sandbox.scrollY;
    },
    matchMedia(q) {
      return {
        matches: /\(max-width:\s*(\d+)px\)/.test(q)
          ? viewportWidth <= Number(RegExp.$1)
          : false,
        media: String(q || ''),
        addEventListener() {},
        removeEventListener() {}
      };
    },
    getComputedStyle(el) {
      const merged = {};
      if (el && el.nodeType === 1) {
        const tagKey = el.localName;
        if (cssRules.has(tagKey)) Object.assign(merged, cssRules.get(tagKey));
        for (const cls of el.classList) {
          if (cssRules.has('.' + cls)) Object.assign(merged, cssRules.get('.' + cls));
        }
        const id = el.getAttribute('id');
        if (id && cssRules.has('#' + id)) Object.assign(merged, cssRules.get('#' + id));
        for (const [k, v] of el._parseStyleMap().entries()) merged[k] = v;
        if (el.classList.contains('hidden')) merged.display = 'none';
      }
      return new Proxy(merged, {
        get(target, prop) {
          if (prop === 'getPropertyValue') return (k) => target[String(k).toLowerCase()] || '';
          if (typeof prop !== 'string') return undefined;
          return target[toKebabCaseAttr(prop)] || target[prop] || '';
        }
      });
    },
    requestAnimationFrame(cb) {
      return wrappedSetTimeout(() => cb(Date.now()), 0);
    },
    cancelAnimationFrame(h) {
      wrappedClearTimeout(h);
    },
    setTimeout: wrappedSetTimeout,
    clearTimeout: wrappedClearTimeout,
    setInterval: wrappedSetInterval,
    clearInterval: wrappedClearInterval,
    queueMicrotask,
    performance: { now: () => Date.now() },
    console,
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Promise,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    ReferenceError,
    Uint8Array,
    Int32Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    BigInt,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    alert() {},
    confirm: () => true,
    open: () => null,
    _listeners: winListeners,
    addEventListener(type, fn, opts) {
      if (typeof fn !== 'function') return;
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const once = Boolean(opts && typeof opts === 'object' && opts.once);
      const list = winListeners.get(type) || [];
      if (!list.some((x) => x.fn === fn && x.capture === capture)) {
        list.push({ fn, capture, once });
        winListeners.set(type, list);
      }
    },
    removeEventListener(type, fn, opts) {
      const capture = typeof opts === 'boolean' ? opts : Boolean(opts && opts.capture);
      const list = winListeners.get(type);
      if (!list) return;
      const next = list.filter((x) => !(x.fn === fn && x.capture === capture));
      if (next.length) winListeners.set(type, next);
      else winListeners.delete(type);
    },
    dispatchEvent(ev) {
      if (!ev || !ev.type) return true;
      ev.target = sandbox;
      ev.currentTarget = sandbox;
      const list = [...(winListeners.get(ev.type) || [])];
      for (const entry of list) {
        if (entry.once) sandbox.removeEventListener(ev.type, entry.fn, entry.capture);
        entry.fn.call(sandbox, ev);
        if (ev._stopImmediate) break;
      }
      return !ev.defaultPrevented;
    }
  };

  if (options.capacitor) sandbox.Capacitor = options.capacitor;
  if (options.publicKeyCredential) sandbox.PublicKeyCredential = options.publicKeyCredential;

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const ctx = vm.createContext(sandbox);
  document._window = sandbox;

  document._evalInlineHandler = (el, code, ev) => {
    try {
      const fn = vm.runInContext(`(function(event){ ${code} })`, ctx, { filename: 'inline-handler.js' });
      fn.call(el, ev);
    } catch (err) {
      runtimeErrors.push({
        type: 'inline-handler',
        code: String(code || ''),
        eventType: ev && ev.type ? String(ev.type) : '',
        elementId: el && el.id ? String(el.id) : '',
        message: err && err.message ? err.message : String(err),
        error: err,
        timestamp: Date.now()
      });
      if (options.throwOnInlineError) throw err;
    }
  };

  const resolveAssetFile = (relSrc) => {
    const cleanRel = String(relSrc || '').split('?')[0].replace(/^\.?\//, '');
    const pAsset = path.join(assetRoot, cleanRel);
    if (fs.existsSync(pAsset)) return { path: pAsset, rel: cleanRel };
    const pRoot = path.join(ROOT_DIR, cleanRel);
    if (fs.existsSync(pRoot)) return { path: pRoot, rel: cleanRel };
    return null;
  };

  const runScriptFile = (relSrc) => {
    const cleanRel = String(relSrc || '').split('?')[0].replace(/^\.?\//, '');
    if (loadedScriptSrcs.has(cleanRel)) return true;
    const resolved = resolveAssetFile(cleanRel);
    if (!resolved) return false;
    loadedScriptSrcs.add(cleanRel);
    const code = fs.readFileSync(resolved.path, 'utf8');
    vm.runInContext(code, ctx, { filename: resolved.rel });
    return true;
  };

  // Run inline <head> scripts
  for (const sc of document.head.querySelectorAll('script')) {
    const src = sc.getAttribute('src');
    if (!src && sc.textContent.trim()) {
      vm.runInContext(sc.textContent, ctx, { filename: 'head-inline.js' });
    }
  }

  // Run static <script defer src="..."> in exact order
  for (const sc of document.querySelectorAll('script[src]')) {
    const src = sc.getAttribute('src');
    if (src) {
      runScriptFile(src);
      sc.dataset.loaded = '1';
    }
  }

  // Optional lazy preloads
  if (options.preloadEthers) runScriptFile('ethers.umd.min.js');
  if (options.preloadQrcode) runScriptFile('qrcode.min.js');

  // Hook dynamic <script> insertion (for loadScriptOnce)
  document._onNodeInserted = (node) => {
    if (node.localName !== 'script') return;
    const src = node.getAttribute('src');
    if (!src) return;
    wrappedSetTimeout(() => {
      if (cleanedUp) return;
      try {
        const ok = runScriptFile(src);
        if (ok) {
          node.dataset.loaded = '1';
          if (typeof node.onload === 'function') node.onload();
          node.dispatchEvent(new DomEvent('load', { bubbles: false }));
        } else {
          if (typeof node.onerror === 'function') node.onerror(new Error(`Missing script ${src}`));
          node.dispatchEvent(new DomEvent('error', { bubbles: false }));
        }
      } catch (err) {
        if (typeof node.onerror === 'function') node.onerror(err);
      }
    }, 0);
  };

  async function flushMicrotasks(ticks = 6) {
    for (let i = 0; i < ticks; i++) {
      await Promise.resolve();
    }
  }

  // Boot DOMContentLoaded
  const dclEv = new DomEvent('DOMContentLoaded', { bubbles: true, cancelable: false });
  document.dispatchEvent(dclEv);
  sandbox.dispatchEvent(new DomEvent('DOMContentLoaded', { bubbles: false, cancelable: false }));
  await flushMicrotasks(10);

  // ==================== User-Facing Session Helpers ====================

  function mustElement(selector) {
    const el = document.querySelector(selector);
    assert.ok(el, `Expected DOM element matching selector "${selector}"`);
    return el;
  }

  async function clickSelector(selector) {
    const el = mustElement(selector);
    if (isClickDisabled(el)) return false;
    el.dispatchEvent(new DomEvent('click', { bubbles: true, cancelable: true }));
    await flushMicrotasks(8);
    return true;
  }

  async function setChecked(selector, checked) {
    const el = mustElement(selector);
    if (isClickDisabled(el)) return false;
    const desired = Boolean(checked);
    if (Boolean(el.checked) !== desired) {
      el.dispatchEvent(new DomEvent('click', { bubbles: true, cancelable: true }));
      await flushMicrotasks(8);
    }
    return Boolean(el.checked);
  }

  async function setInputValue(selector, value) {
    const el = mustElement(selector);
    const val = value === null || value === undefined ? '' : String(value);
    el.value = val;
    const evType = el.localName === 'select' ? 'change' : 'input';
    el.dispatchEvent(new DomEvent(evType, { bubbles: true, cancelable: true }));
    if (el.localName !== 'select') {
      el.dispatchEvent(new DomEvent('change', { bubbles: true, cancelable: true }));
    }
    await flushMicrotasks(6);
    return el;
  }

  async function selectOption(selector, value) {
    const el = mustElement(selector);
    el.value = String(value ?? '');
    el.dispatchEvent(new DomEvent('change', { bubbles: true, cancelable: true }));
    await flushMicrotasks(6);
    return el;
  }

  async function switchTab(tabName) {
    const tab = String(tabName || '').trim();
    const navBtn = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (navBtn) {
      await clickSelector(`.nav-item[data-tab="${tab}"]`);
      return;
    }
    if (tab === 'earn') {
      const earnQuickBtn = document.querySelector('#view-wallet button[onclick*="switchTab(\'earn\')"]');
      if (earnQuickBtn) {
        earnQuickBtn.click();
        await flushMicrotasks(8);
        return;
      }
    }
    if (typeof sandbox.switchTab === 'function') {
      sandbox.switchTab(tab);
      await flushMicrotasks(8);
      return;
    }
    assert.fail(`Unable to switch to tab "${tab}" via user controls`);
  }

  async function openSheet(sheetId) {
    const id = String(sheetId || '').replace(/^#/, '');
    if (typeof sandbox.openSheet === 'function') {
      sandbox.openSheet(id);
      await flushMicrotasks(6);
      return mustElement(`#${id}`);
    }
    assert.fail(`openSheet not available for #${id}`);
  }

  async function closeSheet(sheetId = '') {
    const backdrop = document.getElementById('sheet-backdrop');
    if (backdrop && typeof backdrop.click === 'function') {
      backdrop.click();
      await flushMicrotasks(6);
      return;
    }
    if (sheetId) {
      const closeBtn = document.querySelector(`#${String(sheetId).replace(/^#/, '')} button[onclick*="closeAllSheets"]`);
      if (closeBtn) {
        closeBtn.click();
        await flushMicrotasks(6);
        return;
      }
    }
    if (typeof sandbox.closeAllSheets === 'function') {
      sandbox.closeAllSheets();
      await flushMicrotasks(6);
    }
  }

  function getVisibleText(selector) {
    const el = document.querySelector(selector);
    if (!el) return '';
    return String(el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function isVisible(selector) {
    const el = document.querySelector(selector);
    if (!el) return false;
    if (el.classList.contains('hidden')) return false;
    if (el.style.display === 'none') return false;
    if (el.getAttribute('aria-hidden') === 'true' && !el.classList.contains('open')) {
      return false;
    }
    return true;
  }

  function isDisabled(selector) {
    const el = mustElement(selector);
    return Boolean(el.disabled);
  }

  function hasClass(selector, cls) {
    const el = mustElement(selector);
    return el.classList.contains(cls);
  }

  function getToastHistory() {
    return [...toastHistory];
  }

  function getNetworkLog() {
    return [...networkLog];
  }

  function getRuntimeErrors() {
    return [...runtimeErrors];
  }

  function assertNoRuntimeErrors() {
    assert.equal(
      runtimeErrors.length,
      0,
      `Runtime inline handler errors detected: ${JSON.stringify(runtimeErrors.map((e) => ({ elementId: e.elementId, eventType: e.eventType, message: e.message, code: e.code })))}`
    );
  }

  function assertNoRealBroadcasts() {
    const realBroadcasts = networkLog.filter((req) => req.blocked && req.realNetworkSent);
    assert.equal(
      realBroadcasts.length,
      0,
      `Real broadcast leak detected: ${JSON.stringify(realBroadcasts)}`
    );
    const liveReads = options.allowLiveReadOnlyFetch
      ? []
      : networkLog.filter((req) => req.realNetworkSent);
    assert.equal(
      liveReads.length,
      0,
      `Unexpected live network call when allowLiveReadOnlyFetch=false: ${JSON.stringify(liveReads)}`
    );
  }

  async function waitFor(fn, timeoutMs = 2000, intervalMs = 15) {
    const start = Date.now();
    while (true) {
      const res = await fn();
      if (res) return res;
      if (Date.now() - start >= timeoutMs) {
        throw new Error(`waitFor timed out after ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    for (const h of activeTimeouts) clearTimeout(h);
    activeTimeouts.clear();
    for (const h of activeIntervals) clearInterval(h);
    activeIntervals.clear();
    for (const ws of [...activeWebSockets]) {
      try { ws.close(); } catch (_) {}
    }
    activeWebSockets.clear();
    for (const obs of [...document._observers]) {
      try { obs.disconnect(); } catch (_) {}
    }
    document._observers.clear();
  }

  return {
    window: sandbox,
    document,
    localStorage,
    sessionStorage,
    clipboardLog,
    assetRoot,
    isDist,
    // Primary API
    clickSelector,
    setChecked,
    setInputValue,
    selectOption,
    switchTab,
    openSheet,
    closeSheet,
    getVisibleText,
    isVisible,
    isDisabled,
    hasClass,
    getToastHistory,
    getNetworkLog,
    getRuntimeErrors,
    assertNoRuntimeErrors,
    assertNoRealBroadcasts,
    flushMicrotasks,
    waitFor,
    cleanup,
    // SCOPE.md / Explorer aliases
    click: clickSelector,
    input: setInputValue,
    type: setInputValue,
    select: selectOption,
    getToastLog: getToastHistory,
    getNetworkRequests: getNetworkLog,
    assertNoRealBroadcast: assertNoRealBroadcasts
  };
}

module.exports = {
  ROOT_DIR,
  DIST_DIR,
  startTestServer,
  loadDistAssets,
  createWalletAppSession,
  isBroadcastRequest,
  findDevJargonMatches,
  assertZeroDevJargon,
  extractVisibleHtmlText,
  extractVisibleHtmlSegments
};
