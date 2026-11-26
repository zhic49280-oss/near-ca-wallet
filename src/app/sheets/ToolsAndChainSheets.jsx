import { h, Fragment } from 'preact';
import { PanelSlot } from '../components/PanelSlot.jsx';
import { useLang } from '../store/useWalletStore.js';
import { MiningTelemetryPanel, MiningWorkersPanel } from '../components/MiningProPanel.jsx';
import { TxHistorySheetPanel, TxDetailPanel } from '../components/TokenDetailPanels.jsx';
import { WcProposalPanel, WcSessionsPanel } from '../components/WalletConnectPanel.jsx';
import { ContactsPanel } from '../components/ContactsPanel.jsx';
import { WalletListPanel, BackupSecretsPanel, WalletAddressesPanel } from '../components/WalletManagerPanels.jsx';
import { NearKeysPanel, SolRentPanel, NearStoragePanel } from '../components/HubToolsPanels.jsx';
import { PerpMarketsSheetPanel, PerpFundingInfoPanel } from '../components/PerpDetailPanels.jsx';
import { EarnStakeSheetPanel } from '../components/EarnStakeSheetPanel.jsx';
import { DAppBookmarksPanel, DAppApprovePanel } from '../components/DAppBrowserPanels.jsx';

const callWin = (fn, ...args) => {
  const f = typeof window !== 'undefined' ? window[fn] : null;
  if (typeof f === 'function') return f(...args);
  return undefined;
};

export function ToolsAndChainSheets() {
  useLang();
  return (
    <Fragment>
      {/* ==================== Sheet: Deep Mining Pro ==================== */}
      <div id="sheet-mining-pro" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.miningTitle">Pearl 矿机状态</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          {/* Address Input & Watchlist */}
          <div class="flex gap-2">
            <input id="mining-address-input" type="text" class="input-field mono flex-1" data-i18n-placeholder="sheet.miningAddrPlaceholder" placeholder="输入 prl1p... 矿工地址" />
            <button type="button" id="btn-mining-query" class="btn-secondary" onClick={() => callWin('runMiningDeepQuery')} data-i18n="sheet.miningQueryBtn">查询</button>
            <button type="button" class="btn-ghost-sm" onClick={() => callWin('saveCurrentMinerAddress')} data-i18n="sheet.miningSaveBtn">收藏</button>
          </div>
          <div id="mining-watchlist" class="pill-scroll"><PanelSlot slotId="mining-watchlist" component={MiningTelemetryPanel} /></div>

          {/* Pool Selector */}
          <div class="segmented-control">
            <button type="button" class="segmented-btn active" data-pool="auto" onClick={() => callWin('setMiningPoolKey', 'auto')} data-i18n="sheet.miningPoolAuto">自动</button>
            <button type="button" class="segmented-btn" data-pool="kryptex" onClick={() => callWin('setMiningPoolKey', 'kryptex')}>Kryptex</button>
            <button type="button" class="segmented-btn" data-pool="herominers" onClick={() => callWin('setMiningPoolKey', 'herominers')}>HeroMiners</button>
            <button type="button" class="segmented-btn" data-pool="onchain" onClick={() => callWin('setMiningPoolKey', 'onchain')} data-i18n="sheet.miningPoolOnchain">链上</button>
          </div>

          {/* Network Telemetry Bar */}
          <div id="mining-network-bar" class="meta-list"><PanelSlot slotId="mining-network-bar" component={MiningTelemetryPanel} /></div>

          {/* 30m / 3h / 24h Hashrate KPIs */}
          <div class="kpi-grid-3">
            <div class="kpi-box">
              <span class="kpi-label" data-i18n="sheet.miningHash30m">30m 算力</span>
              <span id="mining-kpi-30m" class="kpi-value">--</span>
            </div>
            <div class="kpi-box">
              <span class="kpi-label" data-i18n="sheet.miningHash3h">3h 均值</span>
              <span id="mining-kpi-3h" class="kpi-value">--</span>
            </div>
            <div class="kpi-box">
              <span class="kpi-label" data-i18n="sheet.miningHash24h">24h 均值</span>
              <span id="mining-kpi-24h" class="kpi-value">--</span>
            </div>
          </div>

          {/* Unpaid Balance & Payout Progress + Share Rate */}
          <div class="kpi-grid-2">
            <div class="kpi-box">
              <span class="kpi-label" data-i18n="sheet.miningUnpaid">待结算 PRL</span>
              <span id="mining-kpi-unpaid" class="kpi-value text-emerald">--</span>
              <div class="progress-track" style={{ marginTop: '4px' }}>
                <div id="mining-payout-progress" class="progress-fill" style={{ width: '0%' }} />
              </div>
              <span id="mining-threshold-label" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>--</span>
            </div>
            <div class="kpi-box">
              <span class="kpi-label" data-i18n="sheet.miningShareRate">份额接受率</span>
              <span id="mining-kpi-share-rate" class="kpi-value text-cyan">--</span>
              <span id="mining-kpi-share-counts" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>--</span>
            </div>
          </div>

          {/* Per-Worker Rig Status Table */}
          <div class="flex flex-col gap-1">
            <span style={{ fontSize: '12px', fontWeight: 700 }} data-i18n="sheet.miningWorkersTitle">矿机在线状态</span>
            <div class="rig-table-wrap">
              <table class="rig-table">
                <thead>
                  <tr>
                    <th data-i18n="sheet.miningColRig">矿机</th>
                    <th data-i18n="sheet.miningColStatus">状态</th>
                    <th>30m</th>
                    <th>24h</th>
                    <th data-i18n="sheet.miningColShares">份额</th>
                  </tr>
                </thead>
                <tbody id="mining-workers-tbody"><PanelSlot slotId="mining-workers-tbody" component={MiningWorkersPanel} /></tbody>
              </table>
            </div>
          </div>

          {/* Payout History List */}
          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
              <span id="mining-payouts-title" style={{ fontSize: '12px', fontWeight: 700 }} data-i18n="sheet.miningPayoutsTitle">近期打款记录</span>
              <button type="button" id="mining-payouts-all-btn" class="btn-ghost-sm hidden" onClick={() => callWin('openAllMiningPayoutHistorySheet')} data-i18n="detail.allBtn">全部 ›</button>
            </div>
            <div id="mining-payouts-list" class="flex flex-col gap-1"><PanelSlot slotId="mining-payouts-list" component={MiningTelemetryPanel} /></div>
          </div>
        </div>
      </div>

      {/* ==================== Sheet: Expandable Full Transaction History ==================== */}
      <div id="sheet-tx-history" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <div class="flex items-center gap-2">
            <button type="button" class="btn-ghost-sm" onClick={() => callWin('navigateBackFromTxHistory')} data-i18n="common.back">‹ 返回</button>
            <h3 id="tx-history-sheet-title" class="sheet-title" data-i18n="sheet.txHistoryTitle">交易记录</h3>
          </div>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body" style={{ maxHeight: '76vh', overflowY: 'auto' }}>
          <div id="tx-history-full-list" class="flex flex-col gap-2"><PanelSlot slotId="tx-history-full-list" component={TxHistorySheetPanel} /></div>
        </div>
      </div>

      {/* ==================== Sheet: In-App Transaction Details ==================== */}
      <div id="sheet-tx-detail" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <div class="flex items-center gap-2">
            <button type="button" class="btn-ghost-sm" onClick={() => callWin('navigateBackFromTxDetail')} data-i18n="common.back">‹ 返回</button>
            <h3 class="sheet-title" data-i18n="sheet.txDetailTitle">交易详情</h3>
          </div>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div id="tx-detail-body" class="sheet-body flex flex-col gap-3" style={{ maxHeight: '76vh', overflowY: 'auto' }}><PanelSlot slotId="tx-detail-body" component={TxDetailPanel} /></div>
      </div>

      {/* ==================== Sheet: WalletConnect v2 ==================== */}
      <div id="sheet-walletconnect" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <div class="flex items-center gap-2">
            <h3 class="sheet-title" data-i18n="sheet.wcTitle">WalletConnect v2</h3>
            <span id="wc-status-pill" class="filter-pill">--</span>
          </div>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div class="flex gap-2">
            <input id="wc-uri-input" type="text" class="input-field mono flex-1" data-i18n-placeholder="sheet.wcUriPlaceholder" placeholder="粘贴 wc: 配对链接" />
            <button type="button" class="btn-ghost-sm" onClick={() => callWin('openQrScannerSheet', 'wc')} data-i18n="common.scan">扫码</button>
            <button type="button" class="btn-ghost-sm" onClick={() => callWin('pasteToWcUri')} data-i18n="common.paste">粘贴</button>
            <button type="button" id="btn-wc-pair" class="btn-primary" style={{ width: 'auto', padding: '10px 14px' }} onClick={() => callWin('pairWalletConnectUri')} data-i18n="sheet.wcPairBtn">配对连接</button>
          </div>

          <button type="button" id="wc-advanced-toggle-btn" class="btn-ghost-sm" style={{ alignSelf: 'flex-start' }} onClick={() => callWin('toggleWcAdvancedSettings')} data-i18n="wc.advancedToggle">高级配置: Project ID ▾</button>
          <div id="wc-advanced-drawer" class="hidden flex gap-2">
            <input id="wc-project-id-input" type="text" class="input-field mono flex-1" data-i18n-placeholder="sheet.wcProjectIdPlaceholder" placeholder="输入 Reown / WalletConnect Project ID" />
            <button type="button" class="btn-secondary" onClick={() => callWin('saveWalletConnectProjectId')} data-i18n="sheet.wcSaveIdBtn">保存 ID</button>
          </div>

          {/* Pending Proposal */}
          <div id="wc-proposal-card" class="hidden ios-glass-card flex flex-col gap-2" style={{ padding: '12px', borderColor: 'rgba(56,189,248,0.4)' }}><PanelSlot slotId="wc-proposal-card" component={WcProposalPanel} /></div>

          {/* Pending Request */}
          <div id="wc-request-card" class="hidden ios-glass-card flex flex-col gap-2" style={{ padding: '12px', borderColor: 'rgba(0,236,151,0.4)' }}>
            <div id="wc-request-method" class="mono text-emerald" style={{ fontWeight: 700 }}>--</div>
            <div id="wc-request-dapp" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>--</div>
            <pre id="wc-request-payload" class="mono" style={{ margin: 0, fontSize: '10.5px', maxHeight: '120px', overflow: 'auto', background: 'rgba(0,0,0,0.35)', padding: '8px', borderRadius: '8px' }} />
            <div class="flex gap-2">
              <button type="button" class="btn-secondary flex-1" onClick={() => callWin('rejectWcRequest')} data-i18n="sheet.wcRejectBtn">拒绝</button>
              <button type="button" class="btn-primary flex-1" onClick={() => callWin('approveWcRequest')} data-i18n="sheet.wcApproveBtn">批准</button>
            </div>
          </div>

          <div style={{ fontSize: '12px', fontWeight: 700 }} data-i18n="sheet.wcSessionsTitle">已连接应用</div>
          <div id="wc-sessions-list" class="flex flex-col gap-2"><PanelSlot slotId="wc-sessions-list" component={WcSessionsPanel} /></div>
        </div>
      </div>

      {/* ==================== Sheet: Address Book (Contacts) ==================== */}
      <div id="sheet-contacts" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.contactsTitle">地址簿管理</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <input id="contact-name-input" type="text" class="input-field" data-i18n-placeholder="sheet.contactsNamePlaceholder" placeholder="备注名称" />
          <input id="contact-addr-input" type="text" class="input-field mono" data-i18n-placeholder="sheet.contactsAddrPlaceholder" placeholder="钱包地址 (.near / 0x / Solana / prl1p)" />
          <button type="button" class="btn-primary" onClick={() => callWin('addContactFromSheet')} data-i18n="sheet.contactsAddBtn">添加联系人</button>
          <div id="contacts-list" class="flex flex-col gap-2"><PanelSlot slotId="contacts-list" component={ContactsPanel} /></div>
        </div>
      </div>

      {/* ==================== Sheet: Multi-Wallet Switcher ==================== */}
      <div id="sheet-wallets" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.walletsTitle">多钱包管理</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div id="wallets-switcher-list" class="flex flex-col gap-2"><PanelSlot slotId="wallets-switcher-list" component={WalletListPanel} /></div>
          <div class="flex gap-2">
            <button type="button" class="btn-primary flex-1" onClick={() => callWin('startAdditionalWalletCreate')} data-i18n="sheet.walletsCreateBtn">新建钱包</button>
            <button type="button" class="btn-secondary flex-1" onClick={() => callWin('startAdditionalWalletImport')} data-i18n="sheet.walletsImportBtn">导入助记词</button>
          </div>
        </div>
      </div>

      {/* ==================== Sheet: Backup Seed & NEAR Master Key ==================== */}
      <div id="sheet-backup" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.backupTitle">助记词与 NEAR 主密钥备份</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div id="backup-keys-content" class="flex flex-col gap-2"><PanelSlot slotId="backup-keys-content" component={BackupSecretsPanel} /></div>
        </div>
      </div>

      {/* ==================== Sheet: Multi-Chain Receive Addresses ==================== */}
      <div id="sheet-wallet-addresses" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.addressesTitle">多链收款地址</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body" style={{ maxHeight: '76vh', overflowY: 'auto' }}>
          <div id="hub-addresses-list" class="flex flex-col gap-2"><PanelSlot slotId="hub-addresses-list" component={WalletAddressesPanel} /></div>
          <div class="ios-glass-card flex flex-col gap-2" style={{ padding: '12px', marginTop: '4px' }}>
            <div class="flex items-center justify-between gap-2">
              <span style={{ fontSize: '12.5px', fontWeight: 700 }} data-i18n="sheet.prlBindTitle">PRL 专用助记词绑定 / 更换</span>
              <span id="prl-bind-mode-badge" class="badge badge-cyan">--</span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.45 }} data-i18n="sheet.prlBindNote">可单独绑定或随时更换您的 PRL 挖矿助记词以替换默认推演的 PRL 账户，不影响当前 .near 主账户与 EVM / Solana 资产。</div>
            <textarea id="prl-bind-mnemonic-input" class="input-field mono" style={{ minHeight: '58px' }} data-i18n-placeholder="sheet.prlBindPlaceholder" placeholder="输入 PRL 挖矿账户的 12 或 24 词助记词" />
            <div class="flex gap-2">
              <button type="button" class="btn-primary flex-1" onClick={() => callWin('bindOrReplacePrlMnemonicUI')} data-i18n="sheet.prlBindConfirmBtn">绑定 / 更换 PRL 账户</button>
              <button type="button" id="btn-prl-restore-default" class="btn-secondary hidden" onClick={() => callWin('restoreDefaultPrlAccountUI')} data-i18n="sheet.prlRestoreDefaultBtn">恢复默认派生</button>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== Sheet: QR Code Scanner ==================== */}
      <div id="sheet-qr-scanner" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.qrScanTitle">扫描二维码</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeQrScannerSheet')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body flex flex-col gap-3" style={{ textAlign: 'center' }}>
          <div class="ios-glass-card" style={{ position: 'relative', width: '100%', maxWidth: '320px', aspectRatio: '1 / 1', margin: '0 auto', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', borderColor: 'rgba(0,236,151,0.4)' }}>
            <video id="qr-scanner-video" playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: '18%', border: '2px solid rgba(0,236,151,0.75)', borderRadius: '16px', pointerEvents: 'none', boxShadow: '0 0 0 9999px rgba(0,0,0,0.32)' }} />
          </div>
          <div id="qr-scanner-status" style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="sheet.qrScanHint">将二维码对准取景框，或从相册选择二维码截图</div>
          <input id="qr-scanner-file-input" type="file" accept="image/*" class="hidden" onChange={(e) => callWin('handleQrScannerFileSelect', e)} />
          <div class="flex gap-2">
            <button type="button" class="btn-secondary flex-1" onClick={() => callWin('triggerQrScannerFileInput')} data-i18n="sheet.qrScanAlbumBtn">从相册选图</button>
            <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeQrScannerSheet')} data-i18n="common.cancel">取消</button>
          </div>
        </div>
      </div>

      {/* ==================== Sheet: Merged NEAR Account (.near Domain) & On-Chain Access Keys ==================== */}
      <div id="sheet-near-account" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.nearAcctTitle">NEAR 账户与密钥</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body flex flex-col gap-3" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
          {/* Current Account & Balance Summary */}
          <div class="ios-glass-card flex flex-col gap-2" style={{ padding: '12px' }}>
            <div class="meta-row" style={{ fontSize: '12px' }}>
              <span class="meta-key" data-i18n="hub.nearDomainCurrent">当前主账户</span>
              <div class="flex items-center gap-2">
                <span id="near-keys-account-id" class="mono text-emerald">--</span>
                <button type="button" class="btn-ghost-sm hub-addr-copy-btn" onClick={() => callWin('copyActiveNearId')} data-i18n="common.copy">复制</button>
              </div>
            </div>
            <div class="meta-row" style={{ fontSize: '12px' }}>
              <span class="meta-key" data-i18n="near.balanceLabel">当前余额</span>
              <div class="flex items-center gap-2">
                <span id="near-acct-balance-val" class="mono">--</span>
                <span id="near-acct-status-badge" class="badge badge-cyan">--</span>
              </div>
            </div>
            <div id="near-acct-unactivated-guide" class="hidden" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.45, paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)' }} data-i18n="near.unactivatedGuide">向当前 NEAR 地址转入 ≥ 0.055 NEAR 后即可一键注册 .near，系统将自动清理旧账户并将 100% 余额与存储押金无损归集至新域名。</div>
          </div>

          {/* .near Registration & Collapsible Binding */}
          <div id="hub-near-domain-card" class="ios-glass-card flex flex-col gap-2" style={{ padding: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }} data-i18n="hub.nearDomainTitle">NEAR .near 账户注册与绑定</div>
            <div class="flex gap-2">
              <input id="hub-near-domain-input" type="text" class="input-field mono flex-1" data-i18n-placeholder="hub.nearDomainPlaceholder" placeholder="输入期望域名，如 alice.near" />
              <button type="button" id="btn-check-near-domain" class="btn-secondary" style={{ width: 'auto', padding: '0 12px', whiteSpace: 'nowrap' }} onClick={() => callWin('checkNearDomainAvailabilityUI')} data-i18n="near.checkAvailBtn">检测</button>
            </div>
            <div id="near-domain-avail-status" class="hidden" style={{ fontSize: '11.5px' }} />
            <button type="button" id="btn-register-near-domain" class="btn-primary" onClick={() => callWin('registerNearDomainFromHub')} data-i18n="hub.nearDomainRegisterBtn">无损注册 .near (0.05 NEAR)</button>
            <button type="button" class="btn-ghost-sm" style={{ alignSelf: 'flex-start' }} onClick={() => callWin('toggleNearBindDrawer')} data-i18n="near.bindToggleBtn">绑定已有 .near 账号 ▾</button>
            <div id="near-bind-drawer" class="hidden flex flex-col gap-2" style={{ paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <input id="hub-near-bind-auth-input" type="password" class="input-field mono" data-i18n-placeholder="hub.nearDomainAuthPlaceholder" placeholder="绑定其他钱包的 .near 时，可填原助记词/私钥自动授权（可选）" />
              <button type="button" id="btn-bind-near-domain" class="btn-secondary" onClick={() => callWin('bindNearDomainFromHub')} data-i18n="hub.nearDomainBindBtn">确认绑定</button>
            </div>
          </div>

          {/* On-Chain Access Keys List */}
          <div class="ios-glass-card flex flex-col gap-2" style={{ padding: '12px' }}>
            <div class="flex items-center justify-between">
              <span style={{ fontSize: '12.5px', fontWeight: 700 }} data-i18n="sheet.keysListTitle">链上访问密钥</span>
              <button type="button" id="btn-refresh-near-keys" class="btn-ghost-sm" onClick={() => callWin('refreshNearAccessKeysSheet')} data-i18n="common.refresh">刷新</button>
            </div>
            <div id="near-keys-list" class="flex flex-col gap-2"><PanelSlot slotId="near-keys-list" component={NearKeysPanel} /></div>
          </div>

          {/* Rotate Seed / Upgrade Key (Strictly hidden when account is unactivated) */}
          <div id="near-keys-rotate-card" class="ios-glass-card hidden flex flex-col gap-2" style={{ padding: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700 }} data-i18n="sheet.keysRotateTitle">更换助记词 / 升级密钥</div>
            <textarea id="near-keys-rotate-mnemonic" class="input-field mono" style={{ minHeight: '64px' }} data-i18n-placeholder="sheet.keysRotatePlaceholder" placeholder="点击下方生成新助记词，或粘贴已有助记词" />
            <div class="flex gap-2">
              <button type="button" class="btn-secondary flex-1" onClick={() => callWin('generateRotateMnemonicInSheet')} data-i18n="sheet.keysGenSeedBtn">生成新助记词</button>
              <button type="button" id="btn-near-keys-add-only" class="btn-secondary flex-1" onClick={() => callWin('addNearMnemonicKeyOnlyFromSheet')} data-i18n="sheet.keysAddOnlyBtn">仅添加密钥 (保留旧密钥)</button>
            </div>
            <button type="button" id="btn-near-keys-rotate-confirm" class="btn-primary" onClick={() => callWin('confirmRotateNearAccountKey')} data-i18n="sheet.keysRotateConfirmBtn">确认更换并删除旧密钥</button>
          </div>
        </div>
      </div>

      {/* Sheet: Solana Rent Reclaim & Dust Burn */}
      <div id="sheet-sol-rent" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.solRentTitle">Solana 租金回收与粉碎</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div class="meta-row" style={{ fontSize: '12px' }}>
            <span class="meta-key" data-i18n="sheet.solRentSummaryLabel">扫描结果</span>
            <div class="flex items-center gap-2">
              <span id="sol-rent-summary" class="meta-val">--</span>
              <button type="button" id="btn-refresh-sol-rent" class="btn-ghost-sm" onClick={() => callWin('scanSolRentReclaimUI')} data-i18n="common.refresh">刷新</button>
            </div>
          </div>
          <div id="sol-rent-list" class="flex flex-col gap-2" style={{ maxHeight: '290px', overflowY: 'auto' }}><PanelSlot slotId="sol-rent-list" component={SolRentPanel} /></div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }} data-i18n="sheet.solRentNote">仅关闭空账户或销毁勾选的微额粉尘代币以退回 SOL 租金，销毁后代币不可恢复。</div>
          <button type="button" id="btn-execute-sol-rent" class="btn-primary" onClick={() => callWin('executeSolRentReclaimUI')} data-i18n="sheet.solRentExecuteBtn">一键回收并领取</button>
        </div>
      </div>

      {/* Sheet: NEAR Storage Deposit Reclaim */}
      <div id="sheet-near-storage" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.nearStorageTitle">NEAR 存储押金回收</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div class="meta-row" style={{ fontSize: '12px' }}>
            <span class="meta-key" data-i18n="sheet.nearStorageSummaryLabel">扫描结果</span>
            <div class="flex items-center gap-2">
              <span id="near-storage-summary" class="meta-val">--</span>
              <button type="button" id="btn-refresh-near-storage" class="btn-ghost-sm" onClick={() => callWin('scanNearStorageReclaimUI')} data-i18n="common.refresh">刷新</button>
            </div>
          </div>
          <div id="near-storage-list" class="flex flex-col gap-2" style={{ maxHeight: '290px', overflowY: 'auto' }}><PanelSlot slotId="near-storage-list" component={NearStoragePanel} /></div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }} data-i18n="sheet.nearStorageNote">仅对当前代币余额为 0 的合约注销空账本并退回 NEAR 存储押金（每笔约消耗 0.00018 NEAR 手续费）。</div>
          <button type="button" id="btn-execute-near-storage" class="btn-primary" onClick={() => callWin('executeNearStorageReclaimUI')} data-i18n="sheet.nearStorageExecuteBtn">一键回收存储押金</button>
        </div>
      </div>

      {/* ==================== Sheet: Perp Markets Picker ==================== */}
      <div id="sheet-perp-markets" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="perp.marketsSheetTitle">选择合约市场</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div class="search-input-wrap">
            <input id="perp-market-search" type="text" class="input-field" data-i18n-placeholder="perp.marketSearchPlaceholder" placeholder="搜索币种，如 BTC, ETH, SOL, HYPE..." onInput={() => callWin('renderPerpMarketsSheet')} />
            <button type="button" id="perp-market-search-clear" class="search-clear-btn hidden" onClick={() => callWin('clearPerpMarketSearch')} aria-label="Clear">✕</button>
          </div>
          <div id="perp-market-filters" class="pill-scroll">
            <button type="button" class="filter-pill active" data-mkt-filter="hot" onClick={() => callWin('setPerpMarketFilter', 'hot')} data-i18n="perp.mktFilterHot">热门</button>
            <button type="button" class="filter-pill" data-mkt-filter="all" onClick={() => callWin('setPerpMarketFilter', 'all')} data-i18n="perp.mktFilterAll">全部</button>
            <button type="button" class="filter-pill" data-mkt-filter="stocks" onClick={() => callWin('setPerpMarketFilter', 'stocks')} data-i18n="perp.mktFilterStocks">股票</button>
            <button type="button" class="filter-pill" data-mkt-filter="gainers" onClick={() => callWin('setPerpMarketFilter', 'gainers')} data-i18n="perp.mktFilterGainers">涨幅榜</button>
            <button type="button" class="filter-pill" data-mkt-filter="vol" onClick={() => callWin('setPerpMarketFilter', 'vol')} data-i18n="perp.mktFilterVol">成交额</button>
          </div>
          <div id="perp-market-list" class="flex flex-col gap-2" style={{ maxHeight: '55vh', overflowY: 'auto' }}><PanelSlot slotId="perp-market-list" component={PerpMarketsSheetPanel} /></div>
        </div>
      </div>

      {/* ==================== Sheet: Perp Deposit / Withdraw ==================== */}
      <div id="sheet-perp-funding" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 id="perp-funding-sheet-title" class="sheet-title" data-i18n="perp.depositSheetTitle">合约充值</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          {/* Mode A: Deposit (1Click Cross-Chain | Arbitrum USDC) */}
          <div id="perp-mode-deposit" class="flex flex-col gap-3">
            <div class="flex gap-1">
              <button type="button" id="perp-ftab-oneclick" class="filter-pill active flex-1" onClick={() => callWin('setPerpFundingTab', 'oneclick')} data-i18n="perp.fundingTabOneClick">跨链充值</button>
              <button type="button" id="perp-ftab-arbitrum" class="filter-pill flex-1" onClick={() => callWin('setPerpFundingTab', 'arbitrum')} data-i18n="perp.fundingTabArb">Arbitrum 充值</button>
            </div>

            {/* 1Click Deposit */}
            <div id="perp-funding-panel-oneclick" class="flex flex-col gap-3">
              <div id="perp-oc-empty-state" class="ios-glass-card hidden flex flex-col gap-2" style={{ padding: '14px', textAlign: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }} data-i18n="perp.ocEmptyTitle">当前暂无可直充合约的资产</span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="perp.ocEmptyDesc">支持从 NEAR、SOL、USDC、USDT、ETH、BTC 等跨链直充合约。若仅持有 PRL，请先在「闪兑」中兑换。</span>
                <button type="button" class="btn-secondary" onClick={() => callWin('jumpFromPerpToSwap')} data-i18n="perp.goSwapBtn">去闪兑换成 USDC / NEAR</button>
              </div>
              <div id="perp-oc-form" class="flex flex-col gap-3">
                <div class="flex flex-col gap-1">
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="perp.ocOriginLabel">支付资产</span>
                  <select id="perp-oc-origin-select" class="input-field" onChange={() => callWin('schedulePerpOneClickQuote')}><PanelSlot slotId="perp-oc-origin-select" component={PerpFundingInfoPanel} /></select>
                </div>
                <div class="swap-box">
                  <div class="swap-box-top">
                    <span data-i18n="perp.ocAmountLabel">充值数量</span>
                    <div class="flex items-center gap-2">
                      <span style={{ fontSize: '11px' }}><span data-i18n="swap.balanceLabel">可用</span>: <span id="perp-oc-origin-avail" class="mono">--</span></span>
                      <button type="button" class="mini-action-btn primary" onClick={() => callWin('setPerpOneClickMax')} data-i18n="swap.maxBtn">全部</button>
                    </div>
                  </div>
                  <input id="perp-oc-amount" type="number" step="any" min="0" class="amount-input-lg" placeholder="0.00" onInput={() => callWin('schedulePerpOneClickQuote')} />
                </div>
                <div class="meta-list">
                  <div class="meta-row">
                    <span class="meta-key" data-i18n="perp.ocEstReceiveLabel">预计到账 (USDC)</span>
                    <span id="perp-oc-quote-out" class="meta-val">--</span>
                  </div>
                  <div class="meta-row">
                    <span class="meta-key" data-i18n="perp.ocTargetAddrLabel">收款合约账户</span>
                    <span id="perp-oc-target-addr" class="meta-val mono">--</span>
                  </div>
                </div>
                <div id="perp-oc-error" class="swap-error-banner hidden" />
                <button type="button" id="btn-perp-oc-deposit" class="btn-primary" onClick={() => callWin('executePerpOneClickDepositUI')} data-i18n="perp.ocDepositBtn">确认跨链充值</button>
              </div>
            </div>

            {/* Arbitrum Direct Deposit */}
            <div id="perp-funding-panel-arbitrum" class="flex flex-col gap-3 hidden">
              <div class="meta-list">
                <div class="meta-row">
                  <span class="meta-key" data-i18n="perp.arbUsdcBalLabel">Arbitrum USDC 可用</span>
                  <span id="perp-arb-usdc-avail" class="meta-val text-emerald">--</span>
                </div>
                <div class="meta-row">
                  <span class="meta-key" data-i18n="perp.arbEthBalLabel">Arbitrum ETH (Gas)</span>
                  <span id="perp-arb-eth-avail" class="meta-val">--</span>
                </div>
                <div class="meta-row">
                  <span class="meta-key" data-i18n="perp.arbMinLabel">最低充值</span>
                  <span class="meta-val" data-i18n="perp.arbMinVal">5 USDC</span>
                </div>
              </div>
              <div class="swap-box">
                <div class="swap-box-top">
                  <span data-i18n="perp.arbAmountLabel">充值数量 (USDC)</span>
                  <button type="button" class="mini-action-btn primary" onClick={() => callWin('setPerpArbMax')} data-i18n="swap.maxBtn">全部</button>
                </div>
                <input id="perp-arb-amount" type="number" step="any" min="5" class="amount-input-lg" placeholder="5.00" onInput={() => callWin('evaluatePerpArbDepositUI')} />
              </div>
              <div id="perp-arb-error" class="swap-error-banner hidden" />
              <div style={{ fontSize: '11px', color: '#fbbf24', lineHeight: 1.45, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)', borderRadius: '8px', padding: '6px 8px' }} data-i18n="perp.arbBridgeNotice">Arbitrum 跨链充值最低 5 USDC（低于 5 USDC 将无法找回），链上确认约需 1~2 分钟。</div>
              <button type="button" id="btn-perp-arb-deposit" class="btn-primary" onClick={() => callWin('executePerpArbBridgeDepositUI')} data-i18n="perp.arbDepositBtn">确认 Arbitrum 充值</button>
            </div>
          </div>

          {/* Mode B: Clean Single-Purpose Withdraw to Arbitrum */}
          <div id="perp-mode-withdraw" class="flex flex-col gap-3 hidden">
            <div id="perp-wd-spot-banner" class="perp-spot-banner hidden">
              <span style={{ fontSize: '11.5px' }}>
                <span data-i18n="perp.spotPendingPrefix">跨链资金已到账</span>
                <strong id="perp-wd-spot-amt" class="mono text-emerald">--</strong>
              </span>
              <button type="button" class="mini-action-btn primary" onClick={() => callWin('quickTransferSpotToPerpUI')} data-i18n="perp.transferToPerpBtn">一键转入合约 (免费)</button>
            </div>

            <div class="meta-list">
              <div class="meta-row">
                <span class="meta-key" data-i18n="perp.perpWithdrawLabel">可提现余额</span>
                <span id="perp-wd-avail" class="meta-val text-emerald">--</span>
              </div>
              <div class="meta-row">
                <span class="meta-key" data-i18n="perp.withdrawDestLabel">收款地址 (Arbitrum)</span>
                <span id="perp-wd-dest-addr" class="meta-val mono">--</span>
              </div>
              <div class="meta-row">
                <span class="meta-key" data-i18n="perp.withdrawFeeLabel">协议手续费</span>
                <span class="meta-val" data-i18n="perp.withdrawFeeVal">1 USDC (最低提现 2 USDC)</span>
              </div>
            </div>

            <div class="swap-box">
              <div class="swap-box-top">
                <span data-i18n="perp.withdrawAmountLabel">提现数量 (USDC)</span>
                <button type="button" class="mini-action-btn primary" onClick={() => callWin('setPerpWithdrawMax')} data-i18n="swap.maxBtn">全部</button>
              </div>
              <input id="perp-withdraw-amount" type="number" step="any" min="2" class="amount-input-lg" placeholder="2.00" onInput={() => callWin('evaluatePerpWithdrawUI')} />
              <div class="flex items-center justify-between" style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                <span data-i18n="perp.withdrawNetLabel">预计实际到账</span>
                <span id="perp-wd-net-val" class="mono text-emerald">--</span>
              </div>
            </div>

            <div id="perp-wd-error" class="swap-error-banner hidden" />
            <button type="button" id="btn-perp-withdraw" class="btn-primary" onClick={() => callWin('executePerpWithdrawUI')} data-i18n="perp.withdrawConfirmBtn">安全验证并提现</button>
          </div>
        </div>
      </div>

      {/* ==================== Sheet: Earn Liquid Staking Execute ==================== */}
      <div id="sheet-earn-stake" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 id="earn-selected-title" class="sheet-title">--</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div class="flex items-center justify-between">
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="earn.amountLabel">质押数量</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              <span data-i18n="swap.balanceLabel">可用</span>: <span id="earn-avail-balance" class="mono">--</span>
            </span>
          </div>

          <div class="swap-box">
            <div class="swap-box-top">
              <span data-i18n="earn.amountLabel">质押数量</span>
              <button type="button" class="mini-action-btn primary" onClick={() => callWin('setEarnMaxAmount')} data-i18n="swap.maxBtn">全部</button>
            </div>
            <div class="swap-box-main">
              <span id="earn-in-symbol" style={{ fontWeight: 700, fontSize: '15px' }}>NEAR</span>
              <input id="earn-amount-in" type="number" step="any" min="0" class="amount-input-lg" placeholder="0.00" onInput={() => callWin('updateEarnEstimatedOut')} />
            </div>
          </div>

          <div id="earn-lock-row" class="hidden flex flex-col gap-2">
            <span class="meta-key" style={{ fontSize: '12px' }} data-i18n="earn.lockLabel">锁仓周期</span>
            <div id="earn-lock-tiers" class="pill-scroll"><PanelSlot slotId="earn-lock-tiers" component={EarnStakeSheetPanel} /></div>
          </div>

          <div class="meta-list">
            <div class="meta-row">
              <span class="meta-key" data-i18n="earn.apyLabel">实时年化</span>
              <span id="earn-live-apy" class="meta-val text-emerald">--</span>
            </div>
            <div class="meta-row">
              <span class="meta-key" data-i18n="earn.tvlLabel">总质押量 (TVL)</span>
              <span id="earn-tvl-val" class="meta-val">--</span>
            </div>
            <div class="meta-row">
              <span class="meta-key" data-i18n="earn.stakersLabel">质押人数</span>
              <span id="earn-stakers-val" class="meta-val">--</span>
            </div>
            <div class="meta-row">
              <span class="meta-key" data-i18n="earn.rateLabel">兑换比例</span>
              <span id="earn-live-rate" class="meta-val">--</span>
            </div>
            <div class="meta-row">
              <span class="meta-key" data-i18n="earn.estReceive">预计获得</span>
              <span id="earn-est-out" class="meta-val">--</span>
            </div>
          </div>

          <div id="earn-lockup-notice" class="hidden" style={{ fontSize: '11.5px', lineHeight: 1.45, color: '#fbbf24', background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.25)', borderRadius: '10px', padding: '8px 10px' }} />

          <button type="button" id="btn-execute-stake" class="btn-primary" onClick={() => callWin('executeSelectedStake')} data-i18n="earn.stakeBtn">确认链上质押</button>

          <div id="earn-tx-receipt" class="hidden meta-list" style={{ borderColor: 'rgba(0,236,151,0.3)' }}><PanelSlot slotId="earn-tx-receipt" component={EarnStakeSheetPanel} /></div>
        </div>
      </div>

      {/* ==================== Sheet: In-App DApp Browser ==================== */}
      <div id="sheet-dapp-browser" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.dappBrowserTitle">DApp 浏览器</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div class="flex gap-2">
            <input id="dapp-url-input" type="url" class="input-field flex-1" data-i18n-placeholder="dapp.urlPlaceholder" placeholder="输入 DApp 网址 (https://...)" />
            <button type="button" id="btn-dapp-open" class="mini-action-btn primary" onClick={() => callWin('openDAppFromInput')} data-i18n="dapp.openBtn">访问</button>
          </div>
          <div id="dapp-connected-section" class="dapp-connected-section hidden"><PanelSlot slotId="dapp-connected-section" component={DAppBookmarksPanel} /></div>
          <div id="dapp-filter-bar" class="pill-scroll"><PanelSlot slotId="dapp-filter-bar" component={DAppBookmarksPanel} /></div>
          <div id="dapp-catalog-list" class="dapp-catalog-grid"><PanelSlot slotId="dapp-catalog-list" component={DAppBookmarksPanel} /></div>
        </div>
      </div>

      {/* ==================== Sheet: DApp Sign / Connect Approval ==================== */}
      <div id="sheet-dapp-approve" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="dapp.approveTitle">DApp 请求授权</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('rejectDAppApproval')} data-i18n="common.close">关闭</button>
        </div>
        <div id="dapp-approve-body" class="sheet-body"><PanelSlot slotId="dapp-approve-body" component={DAppApprovePanel} /></div>
      </div>

      {/* ==================== Sheet: Perp Position TP / SL Editor ==================== */}
      <div id="sheet-perp-tpsl" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="perp.tpslSheetTitle">设置 / 修改止盈止损</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div class="meta-list">
            <div class="meta-row">
              <span class="meta-key" data-i18n="perp.tpslPairLabel">合约</span>
              <span id="perp-tpsl-sheet-pair" class="meta-val mono">--</span>
            </div>
            <div class="meta-row">
              <span class="meta-key" data-i18n="perp.liqEstLabel">预估强平价</span>
              <span id="perp-tpsl-sheet-liq" class="meta-val text-rose mono">--</span>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <span class="meta-key" style={{ fontSize: '11.5px' }} data-i18n="perp.tpPlaceholder">止盈触发价</span>
            <input id="perp-pos-tp-input" type="number" step="any" min="0" class="input-field mono" data-i18n-placeholder="perp.tpInputPlaceholder" placeholder="留空即不设或清除" />
          </div>
          <div class="flex flex-col gap-1">
            <span class="meta-key" style={{ fontSize: '11.5px' }} data-i18n="perp.slPlaceholder">止损触发价</span>
            <input id="perp-pos-sl-input" type="number" step="any" min="0" class="input-field mono" data-i18n-placeholder="perp.slInputPlaceholder" placeholder="留空即不设或清除" />
          </div>
          <div class="flex gap-2">
            <button type="button" class="btn-secondary flex-1" onClick={() => callWin('submitPerpPositionTpSlUI', true)} data-i18n="perp.tpslClearBtn">清除止盈止损</button>
            <button type="button" id="btn-perp-tpsl-save" class="btn-primary flex-1" onClick={() => callWin('submitPerpPositionTpSlUI', false)} data-i18n="perp.tpslSaveBtn">确认提交止盈止损</button>
          </div>
        </div>
      </div>
    </Fragment>
  );
}

export default ToolsAndChainSheets;
