'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  state
} = require('./helpers.js');

test('M5.1: 6-file cache version parity', () => {
  const swText = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
  const headText = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/index-html/000-head-shell.part.html'), 'utf8');
  const onboardText = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/index-html/010-view-onboarding-wallet.part.html'), 'utf8');
  const footerText = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/index-html/090-scripts-footer.part.html'), 'utf8');
  const coreText = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/000-core.part.js'), 'utf8');
  const wcText = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/230-walletconnect.part.js'), 'utf8');

  const swCacheMatch = swText.match(/const\s+CACHE_NAME\s*=\s*'nexus-wallet-v([^']+)'/);
  assert.ok(swCacheMatch, 'sw.js should define CACHE_NAME');
  const ver = swCacheMatch[1];

  const extractVersions = (txt, label) => {
    const matches = [...txt.matchAll(/\?v=([0-9.]+)/g)].map((m) => m[1]);
    assert.ok(matches.length > 0, `${label} should contain ?v= params`);
    for (const m of matches) {
      assert.equal(m, ver, `${label} ?v=${m} should match sw.js CACHE_NAME v${ver}`);
    }
  };

  extractVersions(swText, 'sw.js');
  extractVersions(headText, '000-head-shell.part.html');
  extractVersions(onboardText, '010-view-onboarding-wallet.part.html');
  extractVersions(footerText, '090-scripts-footer.part.html');
  extractVersions(coreText, '000-core.part.js');
  extractVersions(wcText, '230-walletconnect.part.js');
});

test('M5.2: style.css has pan-y chart touch-action, badge-rose & 375px narrow-screen rules', () => {
  const css = fs.readFileSync(path.join(ROOT_DIR, 'style.css'), 'utf8');
  assert.match(css, /\.perp-chart-svg\s*\{[^}]*touch-action:\s*pan-y;/s);
  assert.match(css, /\.badge-rose\s*\{[^}]*color:\s*#fb7185;/s);
  assert.match(css, /\.perp-ob-hcol\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
});

test('M5.3: i18nDict has TP/SL modal keys in zh and en and zero raw developer jargon', () => {
  const dict = state.i18nDict;
  assert.ok(dict && dict.zh && dict.en, 'i18nDict should have zh and en');

  const requiredKeys = ['perp.tpslPairLabel', 'perp.tpInputPlaceholder', 'perp.slInputPlaceholder'];
  for (const k of requiredKeys) {
    assert.ok(typeof dict.zh[k] === 'string' && dict.zh[k].length > 0, `zh missing ${k}`);
    assert.ok(typeof dict.en[k] === 'string' && dict.en[k].length > 0, `en missing ${k}`);
  }

  const jargonRegex = /\b(HTTP|RPC|WebView|CORS|NEP-141|AddKey|DeleteKey|Implicit|VaultRelayer|Bridge2|1Click|DCL|CoW API|Ref Finance|Telemetry|HRP|Borsh|EIP-712)\b|系统内核/i;
  for (const lang of ['zh', 'en']) {
    for (const [k, val] of Object.entries(dict[lang])) {
      assert.ok(!jargonRegex.test(String(val)), `i18nDict.${lang}['${k}'] contains developer jargon: ${val}`);
    }
  }
});

test('M5.4: 240-lifecycle.part.js has no zombie hub-mpc references', () => {
  const lifecycleText = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/240-lifecycle.part.js'), 'utf8');
  assert.ok(!/recomputeHubMpcAddress|copyHubMpcAddress|executeHubMpcSign|hub-mpc-/i.test(lifecycleText));
});
