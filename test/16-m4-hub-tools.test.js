'use strict';

const http = require('http');
const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  miningPro,
  dappBrowser,
  state,
  withMockedStorage
} = require('./helpers.js');

function readPart(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

test('M4.1: 180-near-keys reorders confirmWithUserIfSupported BEFORE verifySecurityAuthAsync & removes zombie hub-mpc-*', () => {
  const src180 = readPart('src/parts/ui-controller/180-near-keys.part.js');

  // Verify zombie hub-mpc-* handlers are removed
  assert.equal(/hub-mpc-evm-address|recomputeHubMpcAddress|copyHubMpcAddress|executeHubMpcSign/.test(src180), false);

  // Verify confirmWithUserIfSupported appears before verifySecurityAuthAsync in bindOrReplacePrlMnemonicUI
  const bindFnStart = src180.indexOf('async function bindOrReplacePrlMnemonicUI()');
  const restoreFnStart = src180.indexOf('async function restoreDefaultPrlAccountUI()');
  const rotateFnStart = src180.indexOf('async function confirmRotateNearAccountKey()');
  assert.ok(bindFnStart !== -1 && restoreFnStart !== -1 && rotateFnStart !== -1);

  const bindBody = src180.slice(bindFnStart, restoreFnStart);
  assert.ok(bindBody.indexOf('showConfirmDialogAsync(') < bindBody.indexOf('verifySecurityAuthAsync('),
    'bindOrReplacePrlMnemonicUI must confirm with user before biometric auth');

  const restoreBody = src180.slice(restoreFnStart, rotateFnStart);
  assert.ok(restoreBody.indexOf('showConfirmDialogAsync(') < restoreBody.indexOf('verifySecurityAuthAsync('),
    'restoreDefaultPrlAccountUI must confirm with user before biometric auth');

  const rotateEnd = src180.indexOf('function openWalletAddressesSheet()', rotateFnStart);
  const rotateBody = src180.slice(rotateFnStart, rotateEnd);
  assert.ok(rotateBody.indexOf('showConfirmDialogAsync(') < rotateBody.indexOf('verifySecurityAuthAsync('),
    'confirmRotateNearAccountKey must confirm with user before biometric auth');
});

test('M4.2: Developer jargon sanitized across NEAR Keys, SOL Rent, NEAR Storage, Mining & WalletConnect parts', () => {
  const filesToCheck = [
    'src/parts/ui-controller/180-near-keys.part.js',
    'src/parts/ui-controller/190-mining.part.js',
    'src/parts/ui-controller/200-solana-rent.part.js',
    'src/parts/ui-controller/210-near-storage.part.js',
    'src/parts/ui-controller/230-walletconnect.part.js',
    'src/parts/chain-contracts/090-near-keys.part.js',
    'src/app/sheets/ToolsAndChainSheets.jsx'
  ];

  for (const rel of filesToCheck) {
    const content = readPart(rel);
    // Check JS user-facing strings (t(...), showToast(...), throw new Error(...)) and HTML/JSX content
    const noComments = content.replace(/\/\/.*$/gm, '');
    if (rel.endsWith('.part.html') || rel.endsWith('.jsx')) {
      assert.equal(/AddKey|DeleteKey|DeleteAccount|NEP-141|WebView|系统内核|CORS/.test(noComments), false, `${rel} must not contain developer jargon`);
    } else {
      assert.equal(/t\([^)]*(AddKey|DeleteKey|DeleteAccount|NEP-141|WebView|系统内核|CORS)/.test(noComments), false, `${rel} t() must not contain developer jargon`);
      assert.equal(/showToast\([^)]*(AddKey|DeleteKey|DeleteAccount|NEP-141|WebView|系统内核|CORS)/.test(noComments), false, `${rel} showToast() must not contain developer jargon`);
    }
  }

  // Verify mining-pro.js validatePearlAddress does not expose HRP or witness jargon
  const invalidRes = miningPro.validatePearlAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
  assert.equal(invalidRes.valid, false);
  assert.equal(/HRP|witness/i.test(invalidRes.error || ''), false, 'validatePearlAddress error must not expose HRP or witness jargon');
});

test('M4.3: ToolsAndChainSheets fixes TP/SL colContractVol & placeholders and adds refresh button IDs', () => {
  const html080 = readPart('src/app/sheets/ToolsAndChainSheets.jsx');

  // TP/SL modal fixes
  assert.equal(html080.includes('data-i18n="perp.colContractVol"'), false, 'TP/SL modal must not reuse perp.colContractVol');
  assert.ok(html080.includes('data-i18n="perp.tpslPairLabel"'), 'TP/SL modal must use perp.tpslPairLabel');
  assert.ok(html080.includes('data-i18n-placeholder="perp.tpInputPlaceholder"'), 'TP input must use perp.tpInputPlaceholder');
  assert.ok(html080.includes('data-i18n-placeholder="perp.slInputPlaceholder"'), 'SL input must use perp.slInputPlaceholder');

  // Refresh / action button IDs for loading states
  assert.ok(html080.includes('id="btn-check-near-domain"'));
  assert.ok(html080.includes('id="btn-refresh-near-keys"'));
  assert.ok(html080.includes('id="btn-refresh-sol-rent"'));
  assert.ok(html080.includes('id="btn-refresh-near-storage"'));

  // Corresponding loading state handlers in 180, 200, 210
  assert.ok(readPart('src/parts/ui-controller/180-near-keys.part.js').includes("$('btn-refresh-near-keys')"));
  assert.ok(readPart('src/parts/ui-controller/180-near-keys.part.js').includes("$('btn-check-near-domain')"));
  assert.ok(readPart('src/parts/ui-controller/200-solana-rent.part.js').includes("$('btn-refresh-sol-rent')"));
  assert.ok(readPart('src/parts/ui-controller/210-near-storage.part.js').includes("$('btn-refresh-near-storage')"));
});

test('M4.4: 190-mining & ToolsAndChainSheets fix #btn-mining-query binding and telemetry field names', () => {
  const html070 = readPart('src/app/sheets/ToolsAndChainSheets.jsx');
  const src190 = readPart('src/parts/ui-controller/190-mining.part.js');

  assert.ok(html070.includes('id="btn-mining-query"'), '070-sheets-tools must have id="btn-mining-query"');
  assert.ok(src190.includes("$('btn-mining-query')"), '190-mining must bind #btn-mining-query for loading/disabled state');
  assert.ok(src190.includes('tel.hashrateCurrent === null && tel.unpaidBalancePrl === null && (tel.workersOnlineCount === null || tel.workersOnlineCount === 0)'),
    '190-mining must check hashrateCurrent, workersOnlineCount, unpaidBalancePrl');
  assert.equal(/tel\.hashrate ===|tel\.workersOnline ===|tel\.unpaidBalance ===/.test(src190), false,
    '190-mining must not reference old mismatched telemetry field names');
});

test('M4.5: 230-walletconnect adds approveWcProposal loading guard & uses toUserFriendlyError', () => {
  const src230 = readPart('src/parts/ui-controller/230-walletconnect.part.js');
  assert.ok(src230.includes('_wcApprovingProposal'), '230-walletconnect must guard approveWcProposal against double submit');
  assert.ok(src230.includes("document.querySelector('#wc-proposal-card .btn-primary')"));
  assert.ok(src230.includes('toUserFriendlyError('), '230-walletconnect must use toUserFriendlyError');
});

test('M4.6: dapp-browser sanitizeDAppUrl & handleDAppRpcRequest basic validation', async () => {
  assert.equal(dappBrowser.sanitizeDAppUrl('https://app.uniswap.org/swap'), 'https://app.uniswap.org/swap');
  assert.equal(dappBrowser.sanitizeDAppUrl('javascript:alert(1)'), null);
  assert.equal(dappBrowser.sanitizeDAppUrl('http://evil.com'), null);
  assert.equal(dappBrowser.sanitizeDAppUrl('http://localhost:3334/test'), 'http://localhost:3334/test');

  await assert.rejects(
    () => dappBrowser.handleDAppRpcRequest({ method: 'eth_chainId', params: [] }, {}),
    (err) => err && err.code === 4900
  );
});

test('M4.7: server.js exact proxy path matching & SSRF path rejection', async () => {
  const server = require('../server.js');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const httpGet = (reqPath) => new Promise((resolve, reject) => {
    http.get(`${baseUrl}${reqPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', reject);
  });

  try {
    // Prefix collision must NOT route to proxy
    const prefixRes = await httpGet('/pearl-proxy-other');
    assert.equal(prefixRes.status, 404);

    // Invalid proxy path must return 400
    const badPearl = await httpGet('/pearl-proxy?path=//evil.com/api/v2/test');
    assert.equal(badPearl.status, 400);

    const badKryptex = await httpGet('/kryptex-proxy?path=/etc/passwd');
    assert.equal(badKryptex.status, 400);

    const badNearcom = await httpGet('/nearcom-proxy?path=/api/unknown/test');
    assert.equal(badNearcom.status, 400);

    // Blocked sensitive file must return 403
    const blockedServer = await httpGet('/server.js');
    assert.equal(blockedServer.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
