'use strict';

const {
  test,
  assert,
  fs,
  path,
  ROOT_DIR
} = require('./helpers.js');

test('FW-2.1: LimitOrdersPanel.jsx exists, exports LimitOrdersPanel, uses TokenIconBadge, and has zero jargon/dangerouslySetInnerHTML', () => {
  const filePath = path.join(ROOT_DIR, 'src/app/components/LimitOrdersPanel.jsx');
  const src = fs.readFileSync(filePath, 'utf8');

  assert.ok(src.includes('export function LimitOrdersPanel'), 'LimitOrdersPanel must be exported');
  assert.ok(src.includes("useWalletState(['limit', 'lang'])"), 'LimitOrdersPanel must subscribe to limit & lang topics');
  assert.ok(src.includes('<TokenIconBadge'), 'LimitOrdersPanel must render TokenIconBadge');
  assert.equal(src.includes('dangerouslySetInnerHTML'), false, 'LimitOrdersPanel must not use dangerouslySetInnerHTML');

  // Preserve CSS classes and data-action attributes
  assert.ok(src.includes('limit-order-card-item'));
  assert.ok(src.includes('limit-progress-track'));
  assert.ok(src.includes('limit-progress-fill'));
  assert.ok(src.includes('data-action="cancel-limit-order"'));
  assert.ok(src.includes('data-action="claim-limit-order"'));

  // Zero developer jargon in UI
  for (const jargon of ['DCL', 'CoW API', 'VaultRelayer', 'HTTP']) {
    assert.equal(src.includes(jargon), false, `LimitOrdersPanel must not expose developer jargon: ${jargon}`);
  }
});

test('FW-2.2: EarnPoolsPanel.jsx exists, exports EarnPoolsPanel, enforces zero fake APY, and supports lockup notice badges', () => {
  const filePath = path.join(ROOT_DIR, 'src/app/components/EarnPoolsPanel.jsx');
  const src = fs.readFileSync(filePath, 'utf8');

  assert.ok(src.includes('export function EarnPoolsPanel'), 'EarnPoolsPanel must be exported');
  assert.ok(src.includes("useWalletState(['staking', 'lang'])"), 'EarnPoolsPanel must subscribe to staking & lang topics');
  assert.ok(src.includes('<TokenIconBadge'), 'EarnPoolsPanel must render TokenIconBadge');
  assert.equal(src.includes('dangerouslySetInnerHTML'), false, 'EarnPoolsPanel must not use dangerouslySetInnerHTML');

  // Zero fake APY: unavailable APY falls back to '--'
  assert.ok(src.includes("return '--'"), 'Unavailable APY must fall back to --');
  // Lockup notice badges (15~181 天 / 15–181 days)
  assert.ok(src.includes('15~181 天') && src.includes('15–181 days'), 'EarnPoolsPanel must include bilingual lockup notice badge');
  // Preserve CSS classes and data-action attributes
  assert.ok(src.includes('staking-pool-card'));
  assert.ok(src.includes('data-action="select-staking-pool"'));
});

test('FW-2.3: 151-limit-orders-ui and 170-earn wire mountLimitOrdersPanel and mountEarnPoolsPanel with fallback intact', () => {
  const limitSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/151-limit-orders-ui.part.js'), 'utf8');
  const earnSrc = fs.readFileSync(path.join(ROOT_DIR, 'src/parts/ui-controller/170-earn.part.js'), 'utf8');

  assert.ok(limitSrc.includes('fw.mountLimitOrdersPanel(listEl,'), '151-limit-orders-ui must wire fw.mountLimitOrdersPanel');
  assert.ok(limitSrc.includes('setHtmlIfChanged(listEl,'), '151-limit-orders-ui must preserve innerHTML fallback for Node tests');

  assert.ok(earnSrc.includes('fw.mountEarnPoolsPanel(listEl,'), '170-earn must wire fw.mountEarnPoolsPanel');
  assert.ok(earnSrc.includes('setHtmlIfChanged(listEl,'), '170-earn must preserve innerHTML fallback for Node tests');
});
