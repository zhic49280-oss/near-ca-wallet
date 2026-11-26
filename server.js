const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3334;
const MAX_PROXY_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 10_000;
const keepAliveHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32, keepAliveMsecs: 15_000 });
const COMPRESSIBLE_EXTS = new Set(['.html', '.css', '.js', '.json', '.svg']);
const _gzipCache = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function safeParseReqUrl(reqUrl) {
  try {
    return new URL(String(reqUrl || '/'), 'http://localhost');
  } catch (_) {
    return null;
  }
}

function sendJsonError(res, status, message) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: message }));
}

function isSafeProxyPath(pathParam, requiredPrefixes, upstreamHost) {
  if (!pathParam || typeof pathParam !== 'string') return null;
  if (/[\r\n\t\s@\\]/.test(pathParam) || pathParam.includes('..') || pathParam.startsWith('//')) {
    return null;
  }
  if (!requiredPrefixes.some((p) => pathParam.startsWith(p))) return null;
  try {
    const targetUrl = new URL(pathParam, `https://${upstreamHost}`);
    if (targetUrl.protocol !== 'https:' || targetUrl.hostname !== upstreamHost) return null;
    if (targetUrl.username || targetUrl.password) return null;
    return targetUrl;
  } catch (_) {
    return null;
  }
}

function isRetryableSocketError(err) {
  if (!err) return false;
  const code = err.code || (err.cause && err.cause.code) || '';
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return true;
  }
  const msg = `${String(err.message || '')} ${String((err.cause && err.cause.message) || '')}`;
  return /socket hang up|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg);
}

function forwardHttpsRequestLegacy(req, res, buildOpts, bodyBuf, retriesLeft = 1) {
  let clientAborted = false;
  let activeProxyReq = null;
  const onClose = () => {
    if (res.writableEnded) return;
    clientAborted = true;
    if (activeProxyReq && !activeProxyReq.destroyed) activeProxyReq.destroy();
  };
  res.once('close', onClose);

  const attempt = (remaining) => {
    if (clientAborted || res.writableEnded) {
      res.removeListener('close', onClose);
      return;
    }
    const opts = Object.assign({ agent: false, timeout: UPSTREAM_TIMEOUT_MS }, buildOpts());
    const proxyReq = https.request(opts, (proxyRes) => {
      res.removeListener('close', onClose);
      if (!res.headersSent) {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
      }
      proxyRes.on('error', () => { if (!res.writableEnded) res.end(); });
      proxyRes.pipe(res);
    });
    activeProxyReq = proxyReq;
    proxyReq.on('timeout', () => proxyReq.destroy(new Error('Upstream timeout')));
    proxyReq.on('error', (err) => {
      if (!clientAborted && !res.headersSent && remaining > 0 && isRetryableSocketError(err)) {
        attempt(remaining - 1);
        return;
      }
      res.removeListener('close', onClose);
      sendJsonError(res, 502, err.message);
    });
    if (bodyBuf && bodyBuf.length > 0) proxyReq.write(bodyBuf);
    proxyReq.end();
  };

  attempt(retriesLeft);
}

function forwardHttpsRequest(req, res, buildOpts, bodyBuf, retriesLeft = 1) {
  if (typeof fetch !== 'function') {
    return forwardHttpsRequestLegacy(req, res, buildOpts, bodyBuf, retriesLeft);
  }

  let clientAborted = false;
  let activeAbortCtrl = null;
  const onClose = () => {
    if (res.writableEnded) return;
    clientAborted = true;
    if (activeAbortCtrl && !activeAbortCtrl.signal.aborted) {
      activeAbortCtrl.abort(new Error('Client aborted'));
    }
  };
  res.once('close', onClose);

  const attempt = async (remaining) => {
    if (clientAborted || res.writableEnded) {
      res.removeListener('close', onClose);
      return;
    }
    const opts = buildOpts() || {};
    const method = String(opts.method || 'GET').toUpperCase();
    const targetUrl = `https://${opts.hostname}${opts.path || '/'}`;
    const safeHeaders = {};
    if (opts.headers && typeof opts.headers === 'object') {
      for (const [k, v] of Object.entries(opts.headers)) {
        const lower = String(k).toLowerCase();
        if (lower === 'origin' || lower === 'host' || lower === 'content-length') continue;
        if (v !== undefined && v !== null) safeHeaders[k] = String(v);
      }
    }

    const ac = new AbortController();
    activeAbortCtrl = ac;
    const timeoutId = setTimeout(() => {
      if (!ac.signal.aborted) ac.abort(new Error('Upstream timeout'));
    }, UPSTREAM_TIMEOUT_MS);

    try {
      const fetchInit = {
        method,
        headers: safeHeaders,
        signal: ac.signal
      };
      if (bodyBuf && bodyBuf.length > 0 && method !== 'GET' && method !== 'HEAD') {
        fetchInit.body = bodyBuf;
      }
      const upstreamRes = await fetch(targetUrl, fetchInit);
      const respBuf = Buffer.from(await upstreamRes.arrayBuffer());
      clearTimeout(timeoutId);
      res.removeListener('close', onClose);
      if (clientAborted || res.writableEnded) return;
      if (!res.headersSent) {
        res.writeHead(upstreamRes.status || 200, {
          'Content-Type': upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
      }
      res.end(respBuf);
    } catch (err) {
      clearTimeout(timeoutId);
      if (!clientAborted && !res.headersSent && remaining > 0 && isRetryableSocketError(err)) {
        return attempt(remaining - 1);
      }
      res.removeListener('close', onClose);
      if (!clientAborted) {
        sendJsonError(res, 502, (err && err.message) || 'Upstream fetch error');
      }
    }
  };

  attempt(retriesLeft);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-nearcom-cli-version',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const reqUrlStr = String(req.url || '/');
  const parsedRouteUrl = safeParseReqUrl(reqUrlStr);
  const reqPathname = parsedRouteUrl ? parsedRouteUrl.pathname : '';
  if (reqPathname === '/solana-rpc') {
    if (req.method !== 'POST') {
      sendJsonError(res, 405, 'Method Not Allowed');
      return;
    }
    const chunks = [];
    let totalLen = 0;
    let bodyTooLarge = false;
    req.on('data', (c) => {
      if (bodyTooLarge) return;
      totalLen += c.length;
      if (totalLen > MAX_PROXY_BODY_BYTES) {
        bodyTooLarge = true;
        sendJsonError(res, 413, 'Payload Too Large');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('error', () => {
      sendJsonError(res, 400, 'Request stream error');
    });
    req.on('end', () => {
      if (bodyTooLarge) return;
      const bodyBuf = Buffer.concat(chunks);
      forwardHttpsRequest(req, res, () => ({
        method: 'POST',
        hostname: 'api.mainnet-beta.solana.com',
        path: '/',
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'NearCAWallet/1.0',
          'Content-Length': bodyBuf.length
        }
      }), bodyBuf, 1);
    });
    return;
  }

  if (reqPathname === '/pearl-proxy') {
    const pathParam = parsedRouteUrl.searchParams.get('path');
    const targetUrl = isSafeProxyPath(pathParam, ['/api/v2/'], 'blockbook.pearlresearch.ai');
    if (!targetUrl) {
      sendJsonError(res, 400, 'Invalid path parameter');
      return;
    }
    const chunks = [];
    let totalLen = 0;
    let bodyTooLarge = false;
    req.on('data', (c) => {
      if (bodyTooLarge) return;
      totalLen += c.length;
      if (totalLen > MAX_PROXY_BODY_BYTES) {
        bodyTooLarge = true;
        sendJsonError(res, 413, 'Payload Too Large');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('error', () => {
      sendJsonError(res, 400, 'Request stream error');
    });
    req.on('end', () => {
      if (bodyTooLarge) return;
      const bodyBuf = Buffer.concat(chunks);
      forwardHttpsRequest(req, res, () => {
        const headers = {
          'User-Agent': 'NearCAWallet/1.0',
          'Accept': 'application/json,text/plain,*/*'
        };
        if (bodyBuf.length > 0) {
          headers['Content-Type'] = req.headers['content-type'] || 'text/plain';
          headers['Content-Length'] = bodyBuf.length;
        }
        return {
          method: req.method || 'GET',
          hostname: 'blockbook.pearlresearch.ai',
          path: `${targetUrl.pathname}${targetUrl.search}`,
          headers
        };
      }, bodyBuf, 1);
    });
    return;
  }

  if (reqPathname === '/kryptex-proxy') {
    const pathParam = parsedRouteUrl.searchParams.get('path');
    const targetUrl = isSafeProxyPath(pathParam, ['/prl/', '/api/'], 'pool.kryptex.com');
    if (!targetUrl) {
      sendJsonError(res, 400, 'Invalid path parameter');
      return;
    }
    forwardHttpsRequest(req, res, () => ({
      method: 'GET',
      hostname: 'pool.kryptex.com',
      path: `${targetUrl.pathname}${targetUrl.search}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html,*/*;q=0.8'
      }
    }), null, 1);
    return;
  }

  if (reqPathname === '/nearcom-proxy' && reqUrlStr.startsWith('/nearcom-proxy')) {
    const pathParam = parsedRouteUrl.searchParams.get('path');
    const targetUrl = isSafeProxyPath(
      pathParam,
      ['/api/auth/', '/api/deposit/', '/api/swap/', '/api/withdraw/', '/api/account/', '/api/earn/', '/api/perps/'],
      'near.com'
    );
    if (!targetUrl) {
      sendJsonError(res, 400, 'Invalid path parameter');
      return;
    }
    const chunks = [];
    let totalLen = 0;
    let bodyTooLarge = false;
    let activeProxyReq = null;
    res.once('close', () => {
      if (!res.writableEnded && activeProxyReq && !activeProxyReq.destroyed) activeProxyReq.destroy();
    });
    req.on('data', (c) => {
      if (bodyTooLarge) return;
      totalLen += c.length;
      if (totalLen > MAX_PROXY_BODY_BYTES) {
        bodyTooLarge = true;
        sendJsonError(res, 413, 'Payload Too Large');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('error', () => {
      sendJsonError(res, 400, 'Request stream error');
    });
    req.on('end', () => {
      if (bodyTooLarge) return;
      const bodyBuf = Buffer.concat(chunks);
      const headers = {
        'Accept': 'application/json',
        'x-nearcom-cli-version': req.headers['x-nearcom-cli-version'] || '0.4.0'
      };
      if (req.headers['authorization']) {
        headers['Authorization'] = req.headers['authorization'];
      }
      if (bodyBuf.length > 0) {
        headers['Content-Type'] = req.headers['content-type'] || 'application/json';
        headers['Content-Length'] = bodyBuf.length;
      }
      const opts = {
        method: req.method || 'GET',
        hostname: 'near.com',
        path: `${targetUrl.pathname}${targetUrl.search}`,
        agent: keepAliveHttpsAgent,
        timeout: UPSTREAM_TIMEOUT_MS,
        headers
      };
      const proxyReq = https.request(opts, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.on('error', () => { if (!res.writableEnded) res.end(); });
        proxyRes.pipe(res);
      });
      activeProxyReq = proxyReq;
      proxyReq.on('timeout', () => proxyReq.destroy(new Error('Upstream timeout')));
      proxyReq.on('error', (err) => sendJsonError(res, 502, err.message));
      if (bodyBuf.length > 0) proxyReq.write(bodyBuf);
      proxyReq.end();
    });
    return;
  }

  const rawStaticPath = reqUrlStr.split('?')[0];
  let decodedStaticPath = rawStaticPath;
  try {
    decodedStaticPath = decodeURIComponent(rawStaticPath);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }
  if (/(^|[\\/])\.\.([\\/]|$)/.test(rawStaticPath) || /(^|[\\/])\.\.([\\/]|$)/.test(decodedStaticPath)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  const parsedStatic = safeParseReqUrl(reqUrlStr);
  if (!parsedStatic) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }
  let reqPath;
  try {
    reqPath = decodeURIComponent(parsedStatic.pathname === '/' ? '/index.html' : parsedStatic.pathname);
  } catch (_) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('400 Bad Request');
    return;
  }
  const normalizedRel = reqPath.replace(/^\/+/, '');
  const rootDir = path.resolve(__dirname);
  const filePath = path.resolve(rootDir, normalizedRel || 'index.html');
  const relSegments = path.relative(rootDir, filePath).split(path.sep);
  const blockedTop = new Set(['server.js', 'package.json', 'package-lock.json', 'capacitor.config.json', 'scripts', 'test', 'android', 'ios', 'node_modules']);
  if (
    !filePath.startsWith(rootDir + path.sep) ||
    relSegments.some((seg) => seg.startsWith('.')) ||
    blockedTop.has(relSegments[0])
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const hasVersionQuery = parsedStatic.searchParams.has('v');
    const isBundledIcon = normalizedRel.startsWith('assets/icons/');
    const isEntryHtmlOrSw = ext === '.html' || path.basename(filePath) === 'sw.js';
    const cacheControl = !isEntryHtmlOrSw && hasVersionQuery
      ? 'public, max-age=31536000, immutable'
      : (isBundledIcon ? 'public, max-age=604800' : 'no-store, no-cache, must-revalidate');
    const baseHeaders = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*'
    };
    const acceptsGzip = COMPRESSIBLE_EXTS.has(ext) && /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
    if (acceptsGzip) {
      const cachedEntry = _gzipCache.get(filePath);
      if (cachedEntry && cachedEntry.mtimeMs === stats.mtimeMs && cachedEntry.buf) {
        res.writeHead(200, { ...baseHeaders, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
        res.end(cachedEntry.buf);
        return;
      }
      fs.readFile(filePath, (readErr, rawBuf) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('500 Internal Server Error');
          return;
        }
        zlib.gzip(rawBuf, (gzErr, gzBuf) => {
          if (gzErr || !gzBuf) {
            res.writeHead(200, { ...baseHeaders, 'Vary': 'Accept-Encoding' });
            res.end(rawBuf);
            return;
          }
          if (_gzipCache.size > 64) _gzipCache.clear();
          _gzipCache.set(filePath, { mtimeMs: stats.mtimeMs, buf: gzBuf });
          res.writeHead(200, { ...baseHeaders, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
          res.end(gzBuf);
        });
      });
      return;
    }
    if (COMPRESSIBLE_EXTS.has(ext)) {
      baseHeaders['Vary'] = 'Accept-Encoding';
    }
    res.writeHead(200, baseHeaders);
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
  });
});

if (require.main === module) {
  const HOST = process.env.HOST || '127.0.0.1';
  server.listen(PORT, HOST, () => {
    console.log(`NEAR Chain Abstraction Wallet Server running at http://${HOST}:${PORT}`);
  });
}

module.exports = server;
