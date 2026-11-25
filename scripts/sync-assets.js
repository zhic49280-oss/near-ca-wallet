const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const FILES_TO_SYNC = [
  'index.html',
  'style.css',
  'manifest.json',
  'sw.js',
  'assets/favicon.png',
  'assets/nexus-logo-192.png',
  'assets/nexus-logo-512.png',
  'bip39-wordlist.js',
  'qrcode.min.js',
  'ethers.umd.min.js',
  'walletconnect.umd.min.js',
  'src/crypto-engine.js',
  'src/token-registry.js',
  'src/near-intents.js',
  'src/chain-contracts.js',
  'src/limit-orders.js',
  'src/hyperliquid-perps.js',
  'src/mining-pro.js',
  'src/state.js',
  'src/dapp-browser.js',
  'src/framework-ui.js',
  'src/jsqr-lazy.js',
  'src/ui-controller.js'
];

const DIRS_TO_SYNC = [
  'assets/icons'
];

const TARGET_DIRS = [
  path.join(ROOT_DIR, 'dist'),
  path.join(ROOT_DIR, 'android', 'app', 'src', 'main', 'assets', 'public'),
  path.join(ROOT_DIR, 'ios', 'App', 'App', 'public')
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function syncDirectory(relDir, targetRoots) {
  const srcDir = path.join(ROOT_DIR, relDir);
  if (!fs.existsSync(srcDir)) return 0;
  const srcFiles = fs.readdirSync(srcDir).filter((name) => {
    const full = path.join(srcDir, name);
    return fs.statSync(full).isFile();
  });
  const srcSet = new Set(srcFiles);
  for (const targetRoot of targetRoots) {
    const dstDir = path.join(targetRoot, relDir);
    fs.mkdirSync(dstDir, { recursive: true });
    for (const existing of fs.readdirSync(dstDir)) {
      if (!srcSet.has(existing)) {
        const rmPath = path.join(dstDir, existing);
        if (fs.statSync(rmPath).isFile()) fs.unlinkSync(rmPath);
      }
    }
    for (const name of srcFiles) {
      const src = path.join(srcDir, name);
      const dst = path.join(dstDir, name);
      fs.copyFileSync(src, dst);
      if (sha256(src) !== sha256(dst)) {
        console.error(`Checksum mismatch for ${relDir}/${name}`);
        process.exit(1);
      }
    }
  }
  return srcFiles.length;
}

function buildProdBuffer(rel, src) {
  const raw = fs.readFileSync(src);
  if (rel === 'style.css') {
    const out = esbuild.transformSync(raw.toString('utf8'), { loader: 'css', minify: true });
    return { buf: Buffer.from(out.code, 'utf8'), rawLen: raw.length };
  }
  if (rel.startsWith('src/') && rel.endsWith('.js') && rel !== 'src/framework-ui.js') {
    const out = esbuild.transformSync(raw.toString('utf8'), { loader: 'js', minify: true, legalComments: 'none' });
    return { buf: Buffer.from(out.code, 'utf8'), rawLen: raw.length };
  }
  return { buf: raw, rawLen: raw.length };
}

function syncAll() {
  for (const rel of FILES_TO_SYNC) {
    const src = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(src)) {
      console.error(`Missing required file: ${rel}`);
      process.exit(1);
    }
  }
  const builtMap = new Map();
  let rawTotal = 0;
  let minTotal = 0;
  for (const rel of FILES_TO_SYNC) {
    const src = path.join(ROOT_DIR, rel);
    const { buf, rawLen } = buildProdBuffer(rel, src);
    builtMap.set(rel, { buf, hash: crypto.createHash('sha256').update(buf).digest('hex') });
    rawTotal += rawLen;
    minTotal += buf.length;
  }
  for (const targetRoot of TARGET_DIRS) {
    for (const rel of FILES_TO_SYNC) {
      const dst = path.join(targetRoot, rel);
      const { buf, hash } = builtMap.get(rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, buf);
      if (sha256(dst) !== hash) {
        console.error(`Checksum mismatch for ${rel}`);
        process.exit(1);
      }
    }
  }
  let dirFileTotal = 0;
  for (const relDir of DIRS_TO_SYNC) {
    dirFileTotal += syncDirectory(relDir, TARGET_DIRS);
  }
  const savedKb = Math.round((rawTotal - minTotal) / 1024);
  console.log(`Successfully synchronized ${FILES_TO_SYNC.length} modular assets (minified ${savedKb} KB) and ${dirFileTotal} bundled icons to dist/, android/, and ios/.`);
}

syncAll();
