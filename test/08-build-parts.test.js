'use strict';

const { test, assert, fs, path, ROOT_DIR } = require('./helpers.js');
const buildParts = require('../scripts/build-parts.js');

test('Refactor guard: generated src/*.js files are byte-identical to their src/parts/* sources', () => {
  const targets = buildParts.listTargets();
  assert.ok(targets.includes('ui-controller'), 'src/parts/ui-controller must exist');
  for (const name of targets) {
    const generated = fs.readFileSync(path.join(ROOT_DIR, 'src', `${name}.js`), 'utf8');
    assert.equal(generated, buildParts.assemble(name),
      `src/${name}.js is out of date or was edited directly; edit src/parts/${name}/*.part.js and run npm run build`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.build, /build-parts\.js/);
});
