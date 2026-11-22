'use strict';

const { test, assert, fs, path, ROOT_DIR } = require('./helpers.js');
const buildParts = require('../scripts/build-parts.js');

test('Refactor guard: generated HTML/JS files are byte-identical to their src/parts/* sources & gitignored', () => {
  const targets = buildParts.listTargets();
  assert.ok(targets.includes('ui-controller'), 'src/parts/ui-controller must exist');
  assert.ok(targets.includes('crypto-engine'), 'src/parts/crypto-engine must exist');
  assert.ok(targets.includes('index-html'), 'src/parts/index-html must exist');
  for (const name of targets) {
    const target = buildParts.resolveTarget(name);
    const generated = fs.readFileSync(target.outPath, 'utf8');
    assert.equal(generated, buildParts.assemble(name),
      `${target.outRel} is out of date or was edited directly; edit src/parts/${name}/* and run npm run build`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /build-parts\.js/);

  const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
  for (const entry of [
    '/index.html',
    '/src/ui-controller.js',
    '/src/crypto-engine.js',
    '/dist/',
    '/android/app/src/main/assets/public/',
    '/ios/App/App/public/'
  ]) {
    assert.ok(gitignore.includes(entry), `.gitignore must exclude generated artifact ${entry}`);
  }
});
