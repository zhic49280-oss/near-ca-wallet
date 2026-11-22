'use strict';
/**
 * Assembles large browser scripts and HTML from small source parts (pure concatenation, no transpiling).
 *   src/parts/<name>/*.part.js     (sorted by filename)  ->  src/<name>.js
 *   src/parts/index-html/*.part.html (sorted by filename) ->  index.html
 * Edit the parts, never the generated outputs. Run via `npm run build`.
 * `node scripts/build-parts.js --check` exits 1 if any generated file is out of date.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PARTS_DIR = path.join(ROOT_DIR, 'src', 'parts');

function resolveTarget(name) {
  if (name === 'index-html') {
    return {
      name,
      dir: path.join(PARTS_DIR, 'index-html'),
      ext: '.part.html',
      outRel: 'index.html',
      outPath: path.join(ROOT_DIR, 'index.html')
    };
  }
  return {
    name,
    dir: path.join(PARTS_DIR, name),
    ext: '.part.js',
    outRel: `src/${name}.js`,
    outPath: path.join(ROOT_DIR, 'src', `${name}.js`)
  };
}

function listTargets() {
  if (!fs.existsSync(PARTS_DIR)) return [];
  return fs.readdirSync(PARTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function assemble(name) {
  const t = resolveTarget(name);
  const files = fs.readdirSync(t.dir).filter((f) => f.endsWith(t.ext)).sort();
  if (!files.length) throw new Error(`No parts found in src/parts/${name}`);
  return files.map((f) => fs.readFileSync(path.join(t.dir, f), 'utf8')).join('');
}

function main() {
  const checkOnly = process.argv.includes('--check');
  let stale = 0;
  for (const name of listTargets()) {
    const t = resolveTarget(name);
    const content = assemble(name);
    const current = fs.existsSync(t.outPath) ? fs.readFileSync(t.outPath, 'utf8') : null;
    if (current === content) continue;
    if (checkOnly) {
      console.error(`Out of date: ${t.outRel} (run npm run build)`);
      stale++;
    } else {
      fs.writeFileSync(t.outPath, content);
      console.log(`Assembled ${t.outRel} from src/parts/${name}/`);
    }
  }
  if (stale) process.exit(1);
}

if (require.main === module) main();
module.exports = { listTargets, resolveTarget, assemble };
