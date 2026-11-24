'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR,
  state,
  uiController,
  TEST_MNEMONIC,
  withMockedStorage
} = require('./helpers.js');

test('P2.1: Zero dangerouslySetInnerHTML in Preact components & SwapHistoryPanel uses scoped topics', () => {
  const compDir = path.join(ROOT_DIR, 'src/app/components');
  const files = fs.readdirSync(compDir).filter((f) => f.endsWith('.jsx'));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const src = fs.readFileSync(path.join(compDir, f), 'utf8');
    assert.equal(src.includes('dangerouslySetInnerHTML'), false, `${f} must not use dangerouslySetInnerHTML`);
  }
  const histSrc = fs.readFileSync(path.join(compDir, 'SwapHistoryPanel.jsx'), 'utf8');
  assert.ok(histSrc.includes("useWalletState(['swap', 'lang'])"), 'SwapHistoryPanel must subscribe only to swap & lang topics');
});

test('P2.2: switchTab resets window scroll & boot prefetch does not eagerly load DeFiLlama', async () => {
  await withMockedStorage({}, async () => {
    state.initState();
    const w = state.normalizeWalletRecord({ id: 'w_p2', name: 'P2', mnemonic: TEST_MNEMONIC });
    state.wallets = [w];
    state.activeWalletId = w.id;

    const prevWindow = globalThis.window;
    let scrolledTo = null;
    globalThis.window = {
      scrollTo(x, y) {
        scrolledTo = [x, y];
      }
    };
    try {
      uiController.switchTab('swap');
      assert.deepEqual(scrolledTo, [0, 0], 'switchTab must reset scroll position to top');
    } finally {
      if (prevWindow === undefined) delete globalThis.window;
      else globalThis.window = prevWindow;
    }

    const lifeSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/240-lifecycle.part.js'), 'utf8');
    const bootIdx = lifeSrc.indexOf('const prefetchTm = setTimeout');
    assert.ok(bootIdx !== -1);
    const bootSlice = lifeSrc.slice(bootIdx, bootIdx + 220);
    assert.equal(bootSlice.includes('ensureStakingMetricsFresh'), false, 'Boot prefetch must not eagerly fetch 20MB DeFiLlama');
  });
});

test('P2.3: Perp chart removes preserveAspectRatio=none and locks Y-axis scroll gestures', () => {
  const chartSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/161-perps-chart.part.js'), 'utf8');
  assert.equal(chartSrc.includes('preserveAspectRatio="none"'), false);
  assert.ok(chartSrc.includes("mode = 'scroll'"));
  assert.ok(chartSrc.includes('Math.abs(dy) > Math.abs(dx)'));
});
