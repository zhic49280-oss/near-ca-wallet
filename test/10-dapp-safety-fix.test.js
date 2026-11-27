'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  dappBrowser,
  chainContracts
} = require('./helpers.js');

function createTestWallet() {
  return {
    evmAddress: '0x1111111111111111111111111111111111111111',
    evmPrivateKey: '0x0123456789012345678901234567890123456789012345678901234567890123'
  };
}

function buildErc20ApproveData(spenderHex40, amountBig) {
  const cleanSpender = spenderHex40.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  const amountHex = BigInt(amountBig).toString(16).padStart(64, '0');
  return `0x095ea7b3${cleanSpender}${amountHex}`;
}

function buildSetApprovalForAllData(operatorHex40, approved) {
  const cleanOperator = operatorHex40.replace(/^0x/i, '').toLowerCase().padStart(64, '0');
  const flagHex = (approved ? 1n : 0n).toString(16).padStart(64, '0');
  return `0xa22cb465${cleanOperator}${flagHex}`;
}

test('P1-2: eth_sendTransaction decodes ERC-20 unlimited approve and passes isHighRisk + riskWarning', async () => {
  const spender = '0x2222222222222222222222222222222222222222';
  const maxUint256 = (1n << 256n) - 1n;
  const data = buildErc20ApproveData(spender, maxUint256);

  let capturedApproval = null;
  let executedSteps = false;

  const mockContracts = {
    EVM_CHAINS: chainContracts.EVM_CHAINS,
    fromBaseUnits: chainContracts.fromBaseUnits,
    resolveWalletEvmSender: (w) => w.evmAddress,
    validateSufficientChainBalance: () => {},
    executeEvmRawSteps: async () => {
      executedSteps = true;
      return { txHash: '0xabc123' };
    }
  };

  const txHash = await dappBrowser.handleDAppRpcRequest(
    {
      namespace: 'evm',
      method: 'eth_sendTransaction',
      origin: 'https://app.uniswap.org',
      params: [{
        from: '0x1111111111111111111111111111111111111111',
        to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        value: '0x0',
        data
      }]
    },
    {
      wallet: createTestWallet(),
      contracts: mockContracts,
      chainKey: 'ethereum',
      requestApprovalAsync: async (detail) => {
        capturedApproval = detail;
        return true;
      },
      verifyAuthAsync: async () => true
    }
  );

  assert.equal(txHash, '0xabc123');
  assert.equal(executedSteps, true);
  assert.ok(capturedApproval, 'requestApprovalAsync must receive approval detail');
  assert.equal(capturedApproval.isHighRisk, true);
  assert.ok(capturedApproval.riskWarning && capturedApproval.riskWarning.length > 0, 'must include riskWarning');
  assert.ok(capturedApproval.summary.includes(spender), 'summary must show decoded spender');
  assert.ok(
    capturedApproval.summary.includes('Unlimited Approval') || capturedApproval.summary.includes('无限授权'),
    'summary must mark Unlimited Approval'
  );
});

test('P1-2: eth_sendTransaction decodes NFT setApprovalForAll(true) with operator and isHighRisk + riskWarning', async () => {
  const operator = '0x3333333333333333333333333333333333333333';
  const data = buildSetApprovalForAllData(operator, true);

  let capturedApproval = null;
  const mockContracts = {
    EVM_CHAINS: chainContracts.EVM_CHAINS,
    fromBaseUnits: chainContracts.fromBaseUnits,
    resolveWalletEvmSender: (w) => w.evmAddress,
    validateSufficientChainBalance: () => {},
    executeEvmRawSteps: async () => ({ txHash: '0xnft456' })
  };

  const txHash = await dappBrowser.handleDAppRpcRequest(
    {
      namespace: 'evm',
      method: 'eth_sendTransaction',
      origin: 'https://opensea.io',
      params: [{
        to: '0x4444444444444444444444444444444444444444',
        value: '0x0',
        data
      }]
    },
    {
      wallet: createTestWallet(),
      contracts: mockContracts,
      chainKey: 'ethereum',
      requestApprovalAsync: async (detail) => {
        capturedApproval = detail;
        return true;
      },
      verifyAuthAsync: async () => true
    }
  );

  assert.equal(txHash, '0xnft456');
  assert.ok(capturedApproval);
  assert.equal(capturedApproval.isHighRisk, true);
  assert.ok(capturedApproval.riskWarning && capturedApproval.riskWarning.length > 0);
  assert.ok(capturedApproval.summary.includes(operator), 'summary must show operator');
  assert.ok(capturedApproval.summary.includes('Enabled (All)'), 'summary must show Enabled (All)');

  // Also verify revoked setApprovalForAll(false) is not marked high risk
  const revokedDecoded = dappBrowser.decodeEvmApprovalCalldata(buildSetApprovalForAllData(operator, false));
  assert.equal(revokedDecoded.approved, false);
  assert.equal(revokedDecoded.isHighRisk, false);
  assert.equal(revokedDecoded.riskWarning, '');
  assert.ok(revokedDecoded.summaryLines.join('\n').includes('Revoked'));
});

test('P1-3: eth_sign triggers kind=blindSign, isHighRisk=true, requireSecondConfirm=true, riskWarning and does not sign when rejected', async () => {
  const wallet = createTestWallet();
  const digest = '0x' + 'ab'.repeat(32);
  let capturedApproval = null;
  let verifyAuthCalled = false;

  const mockContracts = {
    EVM_CHAINS: chainContracts.EVM_CHAINS,
    resolveWalletEvmSender: (w) => w.evmAddress
  };

  // Test [msg, addr] order as well as rejection
  await assert.rejects(
    async () => {
      await dappBrowser.handleDAppRpcRequest(
        {
          namespace: 'evm',
          method: 'eth_sign',
          origin: 'https://evil-dapp.example',
          params: [digest, wallet.evmAddress]
        },
        {
          wallet,
          contracts: mockContracts,
          chainKey: 'ethereum',
          requestApprovalAsync: async (detail) => {
            capturedApproval = detail;
            return false;
          },
          verifyAuthAsync: async () => {
            verifyAuthCalled = true;
            return true;
          }
        }
      );
    },
    (err) => err && err.code === 4001
  );

  assert.ok(capturedApproval, 'requestApprovalAsync must be called for eth_sign');
  assert.equal(capturedApproval.kind, 'blindSign');
  assert.equal(capturedApproval.isHighRisk, true);
  assert.equal(capturedApproval.requireSecondConfirm, true);
  assert.ok(capturedApproval.riskWarning && capturedApproval.riskWarning.length > 0, 'must include riskWarning');
  assert.ok(capturedApproval.summary.includes(digest), 'must parse [msg, addr] param order');
  assert.equal(verifyAuthCalled, false, 'must not proceed to biometric/signing when user rejects');
});

test('P1-3: UI controller and DAppApprovePanel wire risk banner and second-confirm guard', () => {
  const uiPart = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'parts', 'ui-controller', '235-dapp-browser.part.js'),
    'utf8'
  );
  const panelJsx = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'app', 'components', 'DAppBrowserPanels.jsx'),
    'utf8'
  );

  assert.ok(uiPart.includes('isHighRisk: Boolean(details.isHighRisk)'));
  assert.ok(uiPart.includes("riskWarning: details.riskWarning || ''"));
  assert.ok(uiPart.includes("details.requireSecondConfirm || details.method === 'eth_sign'"));
  assert.ok(uiPart.includes('showConfirmDialogAsync('));
  assert.ok(panelJsx.includes('id="dapp-approve-risk-banner"'));
  assert.ok(panelJsx.includes('isHighRisk = false'));
  assert.ok(panelJsx.includes("riskWarning = ''"));
});
