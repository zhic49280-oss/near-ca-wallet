'use strict';
/**
 * Assembles large browser scripts from small source parts (pure concatenation, no transpiling).
 *   src/parts/<name>/*.part.js  (sorted by filename)  ->  src/<name>.js
 * Edit the parts, never the generated src/<name>.js. Run via `npm run build`.
 * `node scripts/build-parts.js --check` exits 1 if any generated file is out of date.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PARTS_DIR = path.join(ROOT_DIR, 'src', 'parts');

function listTargets() {
  if (!fs.existsSync(PARTS_DIR)) return [];
  return fs.readdirSync(PARTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function assemble(name) {
  const dir = path.join(PARTS_DIR, name);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.part.js')).sort();
  if (!files.length) throw new Error(`No parts found in src/parts/${name}`);
  return files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('');
}

function main() {
  const checkOnly = process.argv.includes('--check');
  let stale = 0;
  for (const name of listTargets()) {
    const out = path.join(ROOT_DIR, 'src', `${name}.js`);
    const content = assemble(name);
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
    if (current === content) continue;
    if (checkOnly) {
      console.error(`Out of date: src/${name}.js (run npm run build)`);
      stale++;
    } else {
      fs.writeFileSync(out, content);
      console.log(`Assembled src/${name}.js from src/parts/${name}/`);
    }
  }
  if (stale) process.exit(1);
}

if (require.main === module) main();
module.exports = { listTargets, assemble };
