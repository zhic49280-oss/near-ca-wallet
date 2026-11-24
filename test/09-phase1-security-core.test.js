'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  cryptoEngine,
  chainContracts,
  nearIntents
} = require('./helpers.js');

test('Phase 1.1: Address checksum helper rejects bad EIP-55 & Pearl addresses and 080-send uses checkChainAddressValid', () => {
  const badEvm = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9b'; // last char flipped from B to b
  const evmCheck = cryptoEngine.validateChainAddress('evm', badEvm);
  assert.equal(evmCheck.valid, false);
  assert.ok(evmCheck.error);

  const badPearl = 'prl1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
  const prlCheck = cryptoEngine.validateChainAddress('prl', badPearl);
  assert.equal(prlCheck.valid, false);

  const sendPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/080-send.part.js'), 'utf8');
  assert.ok(sendPart.includes('function checkChainAddressValid('));
  // Ensure no direct truthy check on validateChainAddress(...) remains
  const directBoolMatches = sendPart.match(/crypto\.validateChainAddress\([^)]*\)\s*[)&|]/g) || [];
  assert.equal(directBoolMatches.length, 0, 'Must not treat validateChainAddress() object return value as boolean');
  assert.ok(sendPart.includes("avail === null || avail === undefined"), 'Must guard null balance while syncing');

  const evmPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/070-evm.part.js'), 'utf8');
  assert.ok(evmPart.includes('ARC_USDC_PRECOMPILE'), 'executeEvmTransfer must recognize Arc native precompile');
});

test('Phase 1.2: Security lock allows PIN fallback on nativeAuth & blocks silent unlock when bioUnavailable without PIN', () => {
  const secPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/010-security.part.js'), 'utf8');
  assert.ok(!secPart.includes('if (!bioUnavailable && (!hasPin || nativeAuth))'), 'Must allow PIN fallback even when nativeAuth is present');
  assert.ok(secPart.includes('if (!bioUnavailable && !hasPin)'));
  // Ensure bioUnavailable && !hasConfiguredWalletPin(wallet) does not clearAppLock() and return true
  const idx = secPart.indexOf('if (bioUnavailable && !hasConfiguredWalletPin(wallet))');
  assert.ok(idx > 0);
  const block = secPart.slice(idx, idx + 650);
  assert.ok(!block.includes('clearAppLock()'), 'Must not silently clearAppLock when bioUnavailable and no PIN');
  assert.ok(block.includes('return false;'));
});

test('Phase 1.3: EVM MPC signing is outside failover loop and supports yParity ^ 1 recovery', async () => {
  const evmPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/070-evm.part.js'), 'utf8');
  const mpcFnStart = evmPart.indexOf('async function sendEvmMpcSignedTransaction');
  const mpcFnEnd = evmPart.indexOf('async function signEvmTypedDataUnified');
  const mpcBody = evmPart.slice(mpcFnStart, mpcFnEnd);

  // requestNearMpcChainSignature must not appear inside a withEvmProviderFailover block
  const firstFailoverEnd = mpcBody.indexOf('const uTx = ethersLib.Transaction.from(txFields);');
  assert.ok(firstFailoverEnd > 0);
  assert.ok(!mpcBody.slice(0, firstFailoverEnd).includes('requestNearMpcChainSignature'));
  assert.ok(mpcBody.includes('[baseParity, baseParity ^ 1]'), 'Must try both yParity and yParity ^ 1');
  assert.ok(mpcBody.includes('ZERO_RESET_APPROVE_TOKENS'), 'Only zero-first tokens should approve(0)');
});

test('Phase 1.4: NEAR key rotation verifies new key on-chain before DeleteKey and preserves legacy EVM/SOL mnemonics', () => {
  const nearKeysContract = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/chain-contracts/090-near-keys.part.js'), 'utf8');
  assert.ok(nearKeysContract.includes("request_type: 'view_access_key'"), 'Must verify new key on-chain before DeleteKey');

  const nearKeysUi = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/180-near-keys.part.js'), 'utf8');
  assert.ok(nearKeysUi.includes('legacyEvmMnemonic'));
  assert.ok(nearKeysUi.includes('legacySolMnemonic'));
  assert.ok(nearKeysUi.includes('if (savedOk === false)'), 'Must alert user if saveWallets fails after rotation');
});

test('Phase 1.5: WalletConnect enforces session wallet match, advances request queue on reject/error, and validates chain switch', () => {
  const wcPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/230-walletconnect.part.js'), 'utf8');
  assert.ok(wcPart.includes('_wcSessionWallets'));
  assert.ok(wcPart.includes('_wcApprovingRequest'));
  assert.ok(wcPart.includes('Active wallet account mismatch'));
  assert.ok(wcPart.includes('err.code = 4902'));
  assert.ok(!wcPart.includes('ETH\\n'), 'Must not hardcode ETH symbol for non-ETH chains');
  // _nexusShiftNextRequest should be called in approve success, approve catch, and rejectWcRequest
  const shiftCalls = wcPart.match(/_nexusShiftNextRequest\(\)/g) || [];
  assert.ok(shiftCalls.length >= 4, `Expected >= 4 _nexusShiftNextRequest calls, found ${shiftCalls.length}`);
});

test('Phase 1.6: Balance sync uses _pendingPostRefresh so .near discovery refresh is not dropped', () => {
  const syncPart = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/040-balance-sync.part.js'), 'utf8');
  assert.ok(syncPart.includes('_pendingPostRefresh = true'));
  assert.ok(syncPart.includes('if (_pendingPostRefresh)'));
});
