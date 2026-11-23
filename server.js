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

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  const reqUrlStr = String(req.url || '/');
  if (reqUrlStr.startsWith('/pearl-proxy')) {
    const parsed = safeParseReqUrl(reqUrlStr);
    const pathParam = parsed ? parsed.searchParams.get('path') : null;
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
      const opts = {
        method: req.method || 'GET',
        hostname: 'blockbook.pearlresearch.ai',
        path: `${targetUrl.pathname}${targetUrl.search}`,
        agent: keepAliveHttpsAgent,
        timeout: UPSTREAM_TIMEOUT_MS,
        headers: {
          'User-Agent': 'NearCAWallet/1.0',
          'Accept': 'application/json,text/plain,*/*'
        }
      };
      if (bodyBuf.length > 0) {
        opts.headers['Content-Type'] = req.headers['content-type'] || 'text/plain';
        opts.headers['Content-Length'] = bodyBuf.length;
      }
      const proxyReq = https.request(opts, (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
      });
      proxyReq.on('timeout', () => proxyReq.destroy(new Error('Upstream timeout')));
      proxyReq.on('error', (err) => sendJsonError(res, 502, err.message));
      if (bodyBuf.length > 0) proxyReq.write(bodyBuf);
      proxyReq.end();
    });
    return;
  }

  if (reqUrlStr.startsWith('/kryptex-proxy')) {
    const parsed = safeParseReqUrl(reqUrlStr);
    const pathParam = parsed ? parsed.searchParams.get('path') : null;
    const targetUrl = isSafeProxyPath(pathParam, ['/prl/', '/api/'], 'pool.kryptex.com');
    if (!targetUrl) {
      sendJsonError(res, 400, 'Invalid path parameter');
      return;
    }
    const proxyReq = https.get(targetUrl.toString(), {
      agent: keepAliveHttpsAgent,
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json,text/html,*/*;q=0.8'
      }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res);
    });
    proxyReq.on('timeout', () => proxyReq.destroy(new Error('Upstream timeout')));
    proxyReq.on('error', (err) => sendJsonError(res, 502, err.message));
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
  if (
    !filePath.startsWith(rootDir + path.sep) ||
    relSegments.some((seg) => seg.startsWith('.'))
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
      const cacheKey = `${filePath}:${stats.mtimeMs}`;
      const cachedGz = _gzipCache.get(cacheKey);
      if (cachedGz) {
        res.writeHead(200, { ...baseHeaders, 'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding' });
        res.end(cachedGz);
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
          _gzipCache.set(cacheKey, gzBuf);
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
    fs.createReadStream(filePath).pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`NEAR Chain Abstraction Wallet Server running at http://localhost:${PORT}`);
  });
}

module.exports = server;
