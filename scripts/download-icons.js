#!/usr/bin/env node
'use strict';

/**
 * Downloads verified token & Hyperliquid HIP-3 stock/commodity icons into assets/icons/
 * and generates src/parts/token-registry/015-local-icons-map.part.js.
 * Safe to re-run at any time (`node scripts/download-icons.js`).
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ICONS_DIR = path.join(ROOT_DIR, 'assets', 'icons');
const OUTPUT_PART = path.join(ROOT_DIR, 'src', 'parts', 'token-registry', '015-local-icons-map.part.js');

const MIN_BYTES = 60;
const MAX_BYTES = 200 * 1024;
const CONCURRENCY = 16;
const TIMEOUT_MS = 10_000;

function detectValidImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < MIN_BYTES || buf.length > MAX_BYTES) return null;

  // PNG magic
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return '.png';
  }
  // WebP magic (RIFF....WEBP)
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return '.webp';
  }
  // JPEG magic
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return '.jpg';
  }
  // AVIF / ISO BMFF image magic (....ftyp)
  if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'heic') {
      return '.avif';
    }
  }

  // SVG check (strict anti-HTML & anti-XSS check)
  const text = buf.toString('utf8').trim();
  const lower = text.slice(0, 512).toLowerCase();
  if (lower.includes('<!doctype html') || lower.includes('<html')) return null;
  if (!(lower.startsWith('<svg') || lower.startsWith('<?xml'))) return null;
  if (!/<svg[\s>]/i.test(text) || !/<\/svg>/i.test(text)) return null;
  if (/<script|\bon\w+\s*=|javascript:|<iframe|<foreignObject/i.test(text)) return null;
  return '.svg';
}

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'NexusWalletIconBundler/1.0',
        ...(options.headers || {})
      },
      ...options
    });
  } finally {
    clearTimeout(tm);
  }
}

async function postHlInfo(body) {
  const res = await fetchWithTimeout('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function tryDownloadCandidates(candidateUrls) {
  for (const url of candidateUrls) {
    if (!url || !/^https?:\/\//i.test(url)) continue;
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      const ext = detectValidImage(buf);
      if (ext) {
        return { url, buf, ext };
      }
    } catch (_) {}
  }
  return null;
}

function toSafeFileBase(key) {
  const cleaned = String(key || '')
    .trim()
    .toUpperCase()
    .replace(/:/g, '_')
    .replace(/[^A-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'TOKEN';
}

async function runPool(items, worker, concurrency = CONCURRENCY) {
  let nextIdx = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const tokenRegistry = require(path.join(ROOT_DIR, 'src', 'token-registry.js'));
  const iconMap = tokenRegistry.TOKEN_ICON_MAP || {};

  // key -> array of candidate URLs in priority order
  const targetCandidates = new Map();
  const addCandidates = (key, urls) => {
    const cleanKey = String(key || '').trim().toUpperCase();
    if (!cleanKey) return;
    const list = targetCandidates.get(cleanKey) || [];
    for (const u of urls) {
      if (typeof u === 'string' && /^https?:\/\//i.test(u) && !list.includes(u)) {
        list.push(u);
      }
    }
    if (list.length > 0) targetCandidates.set(cleanKey, list);
  };

  // 1. Collect all remote HTTPS icons from TOKEN_ICON_MAP (skip inline data:image/* entries)
  for (const [sym, url] of Object.entries(iconMap)) {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      addCandidates(sym, [url]);
    }
  }

  // 2. Collect top 80 Hyperliquid main perps & all live HIP-3 markets not yet in TOKEN_ICON_MAP
  try {
    const [mainRaw, dexsRaw] = await Promise.all([
      postHlInfo({ type: 'metaAndAssetCtxs' }),
      postHlInfo({ type: 'perpDexs' }).catch(() => null)
    ]);

    if (Array.isArray(mainRaw) && mainRaw[0] && Array.isArray(mainRaw[0].universe)) {
      const uni = mainRaw[0].universe;
      const ctxs = Array.isArray(mainRaw[1]) ? mainRaw[1] : [];
      const rows = uni
        .map((m, i) => ({
          name: m && m.name ? String(m.name) : '',
          isDelisted: Boolean(m && m.isDelisted),
          vol: ctxs[i] && Number.isFinite(Number(ctxs[i].dayNtlVlm)) ? Number(ctxs[i].dayNtlVlm) : 0
        }))
        .filter((r) => r.name && !r.isDelisted)
        .sort((a, b) => b.vol - a.vol)
        .slice(0, 80);

      for (const r of rows) {
        const upper = r.name.toUpperCase();
        if (iconMap[upper]) continue; // inline data URI or already mapped
        const strippedK = /^K[A-Z0-9]{3,}$/.test(upper) ? upper.slice(1) : upper;
        if (iconMap[strippedK]) continue;
        addCandidates(upper, [
          `https://app.hyperliquid.xyz/coins/${r.name}.svg`,
          ...(strippedK !== upper ? [`https://app.hyperliquid.xyz/coins/${strippedK}.svg`] : [])
        ]);
      }
    }

    if (Array.isArray(dexsRaw) && dexsRaw.length > 1) {
      const dexTargets = dexsRaw
        .map((d, idx) => ({ idx, name: d && d.name ? String(d.name) : '' }))
        .filter((d) => d.idx > 0 && d.name);

      const dexMetas = await Promise.allSettled(
        dexTargets.map((d) => postHlInfo({ type: 'metaAndAssetCtxs', dex: d.name }))
      );

      for (let i = 0; i < dexTargets.length; i++) {
        const res = dexMetas[i];
        if (res.status !== 'fulfilled' || !Array.isArray(res.value) || !res.value[0]) continue;
        const uni = res.value[0].universe || [];
        for (const m of uni) {
          if (!m || !m.name || m.isDelisted) continue;
          const rawName = String(m.name);
          const upper = rawName.toUpperCase();
          const colon = rawName.indexOf(':');
          const base = colon >= 0 ? rawName.slice(colon + 1) : rawName;
          const baseUpper = base.toUpperCase();
          if (baseUpper === 'PRL' || baseUpper === 'PEARL') continue; // keeps built-in Pearl SVG
          if (iconMap[baseUpper] && /^data:/i.test(String(iconMap[baseUpper]))) continue;

          // If bare ticker is already in TOKEN_ICON_MAP, let bare key carry it without duplicating
          if (iconMap[baseUpper] || iconMap[upper]) continue;

          addCandidates(upper, [
            `https://app.hyperliquid.xyz/coins/${rawName}.svg`,
            `https://app.hyperliquid.xyz/coins/xyz:${baseUpper}.svg`,
            ...( /^[A-Z0-9.-]+$/.test(baseUpper)
              ? [`https://assets.parqet.com/logos/symbol/${baseUpper}?format=png`]
              : [])
          ]);
        }
      }
    }
  } catch (err) {
    console.warn(`[warn] Live Hyperliquid market discovery partial/skipped: ${err.message}`);
  }

  fs.mkdirSync(ICONS_DIR, { recursive: true });
  const existing = fs.readdirSync(ICONS_DIR);
  for (const f of existing) {
    if (/\.(?:svg|png|webp|jpe?g)$/i.test(f)) {
      fs.unlinkSync(path.join(ICONS_DIR, f));
    }
  }

  // Group keys by first-preferred URL first so identical URL aliases download once,
  // while still allowing per-key fallback resolution if a primary URL fails.
  const keys = Array.from(targetCandidates.keys()).sort();
  const urlCache = new Map(); // canonicalUrl -> { relPath, buf }
  const usedFileNames = new Set();
  const localMap = Object.create(null);

  const allocateFileName = (symKey, ext) => {
    const base = toSafeFileBase(symKey);
    let candidate = `${base}${ext}`;
    let n = 2;
    while (usedFileNames.has(candidate.toLowerCase())) {
      candidate = `${base}_${n}${ext}`;
      n += 1;
    }
    usedFileNames.add(candidate.toLowerCase());
    return candidate;
  };

  // Deduplicate exact URL batches first
  const uniqueFirstUrls = new Set();
  const multiStageKeys = [];
  for (const k of keys) {
    const urls = targetCandidates.get(k);
    if (urls.length === 1) uniqueFirstUrls.add(urls[0]);
    else multiStageKeys.push(k);
  }

  // Download single-URL entries deduped by URL
  const urlToResult = new Map();
  await runPool(Array.from(uniqueFirstUrls), async (url) => {
    const res = await tryDownloadCandidates([url]);
    if (res) urlToResult.set(url, res);
  });

  for (const k of keys) {
    const urls = targetCandidates.get(k);
    if (urls.length === 1) {
      const hit = urlToResult.get(urls[0]);
      if (!hit) continue;
      let cached = urlCache.get(hit.url);
      if (!cached) {
        const fileName = allocateFileName(k, hit.ext);
        fs.writeFileSync(path.join(ICONS_DIR, fileName), hit.buf);
        cached = { relPath: `assets/icons/${fileName}`, buf: hit.buf };
        urlCache.set(hit.url, cached);
      }
      localMap[k] = cached.relPath;
    }
  }

  // Download multi-candidate fallback entries (live Hyperliquid / HIP-3 coins)
  await runPool(multiStageKeys, async (k) => {
    const urls = targetCandidates.get(k);
    const hit = await tryDownloadCandidates(urls);
    if (!hit) return;
    let cached = urlCache.get(hit.url);
    if (!cached) {
      const fileName = allocateFileName(k, hit.ext);
      fs.writeFileSync(path.join(ICONS_DIR, fileName), hit.buf);
      cached = { relPath: `assets/icons/${fileName}`, buf: hit.buf };
      urlCache.set(hit.url, cached);
    }
    localMap[k] = cached.relPath;
  });

  const sortedEntries = Object.entries(localMap).sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    '  // Auto-generated by scripts/download-icons.js — do not edit manually.',
    '  const LOCAL_TOKEN_ICON_MAP = {'
  ];
  for (let i = 0; i < sortedEntries.length; i++) {
    const [sym, rel] = sortedEntries[i];
    const comma = i < sortedEntries.length - 1 ? ',' : '';
    lines.push(`    ${JSON.stringify(sym)}: ${JSON.stringify(rel)}${comma}`);
  }
  lines.push('  };', '');

  fs.writeFileSync(OUTPUT_PART, lines.join('\n'), 'utf8');

  let totalBytes = 0;
  for (const f of fs.readdirSync(ICONS_DIR)) {
    const st = fs.statSync(path.join(ICONS_DIR, f));
    if (st.isFile()) totalBytes += st.size;
  }
  console.log(
    `Downloaded ${urlCache.size} unique icon files (${sortedEntries.length} mapped keys, ${(totalBytes / (1024 * 1024)).toFixed(2)} MB) into assets/icons/`
  );
  console.log(`Generated ${path.relative(ROOT_DIR, OUTPUT_PART)} (${(fs.statSync(OUTPUT_PART).size / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
