const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function syncAll() {
  for (const rel of FILES_TO_SYNC) {
    const src = path.join(ROOT_DIR, rel);
    if (!fs.existsSync(src)) {
      console.error(`Missing required file: ${rel}`);
      process.exit(1);
    }
  }
  for (const targetRoot of TARGET_DIRS) {
    for (const rel of FILES_TO_SYNC) {
      const src = path.join(ROOT_DIR, rel);
      const dst = path.join(targetRoot, rel);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      if (sha256(src) !== sha256(dst)) {
        console.error(`Checksum mismatch for ${rel}`);
        process.exit(1);
      }
    }
  }
  let dirFileTotal = 0;
  for (const relDir of DIRS_TO_SYNC) {
    dirFileTotal += syncDirectory(relDir, TARGET_DIRS);
  }
  console.log(`Successfully synchronized ${FILES_TO_SYNC.length} modular assets and ${dirFileTotal} bundled icons to dist/, android/, and ios/.`);
}

syncAll();
