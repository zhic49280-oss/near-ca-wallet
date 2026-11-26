import { h, Fragment } from 'preact';
import { PanelSlot } from '../components/PanelSlot.jsx';
import { useLang } from '../store/useWalletStore.js';
import { SendFeeSummaryPanel, ReceiveAddressListPanel } from '../components/SendReceivePanels.jsx';
import { TokenBreakdownPanel } from '../components/TokenDetailPanels.jsx';
import { TokenHistoryPanel } from '../components/TokenHistoryPanel.jsx';
import { TokenPickerPanel } from '../components/TokenPickerPanel.jsx';
import { TxFlowModal } from '../components/TxFlowModals.jsx';

const callWin = (fn, ...args) => {
  const f = typeof window !== 'undefined' ? window[fn] : null;
  if (typeof f === 'function') return f(...args);
  return undefined;
};

export function CoreSheets() {
  useLang();
  return (
    <Fragment>
      {/* ==================== Sheet Backdrop ==================== */}
      <div id="sheet-backdrop" class="sheet-backdrop" onClick={() => callWin('closeAllSheets')} />

      {/* ==================== Sheet: Unified Send ==================== */}
      <div id="sheet-send" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.sendTitle">统一跨链转账</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <div class="flex flex-col gap-1">
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="sheet.sendAssetLabel">选择资产</span>
            <select id="send-asset-select" class="input-field" onChange={() => callWin('handleSendAssetChange')} />
          </div>

          <div class="flex flex-col gap-1">
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="sheet.sendSourceLabel">扣除来源</span>
            <select id="send-source-select" class="input-field" onChange={() => callWin('updateSendAvailabilityUI')} />
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="sheet.sendToLabel">收款地址（自动识别链类型）</span>
              <div class="flex gap-1">
                <button type="button" class="btn-ghost-sm" onClick={() => callWin('openQrScannerSheet', 'send')} data-i18n="common.scan">扫码</button>
                <button type="button" class="btn-ghost-sm" onClick={() => callWin('pasteToSendAddress')} data-i18n="common.paste">粘贴</button>
                <button type="button" class="btn-ghost-sm" onClick={() => callWin('openContactsPicker', 'send')} data-i18n="common.contacts">地址簿</button>
              </div>
            </div>
            <input
              id="send-recipient-input"
              type="text"
              class="input-field mono"
              data-i18n-placeholder="sheet.sendToPlaceholder"
              placeholder="输入 .near / 0x / Solana / prl1p / bc1 地址"
              onInput={() => callWin('handleSendRecipientInput')}
            />
            <div id="send-detected-net" style={{ fontSize: '11px', color: 'var(--cyan-glow)' }} />
            <div id="send-evm-chain-row" class="flex flex-col gap-1 hidden" style={{ marginTop: '4px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }} data-i18n="sheet.sendEvmChainLabel">目标 EVM 网络</span>
              <div id="send-evm-chain-pills" class="pill-scroll" />
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <div class="flex items-center justify-between">
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-i18n="sheet.sendAmountLabel">转账数量</span>
              <div class="flex items-center gap-2">
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  <span data-i18n="swap.balanceLabel">可用</span>: <span id="send-available-bal" class="mono">--</span>
                </span>
                <button type="button" id="btn-send-max" class="mini-action-btn primary" onClick={() => callWin('setSendMaxAmount')} data-i18n="swap.maxBtn">全部</button>
              </div>
            </div>
            <input
              id="send-amount-input"
              type="number"
              step="any"
              min="0"
              class="input-field mono"
              placeholder="0.00"
              onInput={() => callWin('handleSendAmountInput')}
            />
            <div id="send-gas-fix-banner" class="gas-fix-banner hidden">
              <span id="send-gas-fix-text" class="gas-fix-text" />
              <button type="button" id="btn-send-gas-fix" class="mini-action-btn primary" onClick={() => callWin('applySendMaxSpendableFix')} data-i18n="swap.useMaxBtn">设为最大可用</button>
            </div>
          </div>

          <div id="send-route-preview" class="meta-list hidden"><PanelSlot slotId="send-route-preview" component={SendFeeSummaryPanel} /></div>
          <div id="send-tx-receipt" class="meta-list hidden" />
          <button type="button" id="btn-confirm-send" class="btn-primary" onClick={() => callWin('executeUnifiedSend')} data-i18n="sheet.sendConfirmBtn">确认发送</button>
        </div>
      </div>

      {/* ==================== Sheet: Unified Receive ==================== */}
      <div id="sheet-receive" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.receiveTitle">多链统一收款</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body" style={{ textAlign: 'center' }}>
          <div id="receive-network-pills" class="pill-scroll"><PanelSlot slotId="receive-network-pills" component={ReceiveAddressListPanel} /></div>
          <div id="receive-qr-container" class="qr-frame" />
          <div id="receive-addr-label" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>--</div>
          <div id="receive-addr-value" class="input-field mono" style={{ wordBreak: 'break-all', fontSize: '11.5px', textAlign: 'center' }}><PanelSlot slotId="receive-addr-value" component={ReceiveAddressListPanel} renderEmpty="--" /></div>
          <button type="button" class="btn-primary" onClick={() => callWin('copyReceiveAddress')} data-i18n="sheet.receiveCopyBtn">复制收款地址</button>
        </div>
      </div>

      {/* ==================== Sheet: OKX-Style Token Detail & Activity ==================== */}
      <div id="sheet-token-detail" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <div class="flex items-center gap-2">
            <div id="token-detail-icon" />
            <h3 id="token-detail-title" class="sheet-title">--</h3>
          </div>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body flex flex-col gap-3" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
          <div id="token-detail-chains" class="pill-scroll" />
          <div class="ios-glass-card flex flex-col gap-3">
            <div class="flex items-baseline justify-between">
              <span id="token-detail-balance" class="mono" style={{ fontSize: '26px', fontWeight: 800, color: '#fff' }}>0</span>
              <span id="token-detail-usd" class="mono" style={{ fontSize: '13.5px', color: 'var(--text-secondary)' }}>--</span>
            </div>
            <div class="quick-actions-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              <button type="button" class="action-pill" onClick={() => callWin('tokenDetailAction', 'send')}>
                <span class="action-icon">↑</span>
                <span data-i18n="home.sendBtn">转账</span>
              </button>
              <button type="button" class="action-pill" onClick={() => callWin('tokenDetailAction', 'receive')}>
                <span class="action-icon">↓</span>
                <span data-i18n="home.receiveBtn">收款</span>
              </button>
              <button type="button" class="action-pill" onClick={() => callWin('tokenDetailAction', 'swap')}>
                <span class="action-icon">⇄</span>
                <span data-i18n="home.swapBtn">闪兑</span>
              </button>
              <button type="button" class="action-pill" onClick={() => callWin('tokenDetailAction', 'bridge')}>
                <span class="action-icon">⛓</span>
                <span data-i18n="detail.bridgeBtn">跨链桥</span>
              </button>
            </div>
            <div id="token-detail-addr-row" class="meta-row hidden" style={{ paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div class="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
                <span class="meta-key" data-i18n="detail.receiveAddrLabel">当前网络收款地址</span>
                <span id="token-detail-addr" class="mono" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>--</span>
              </div>
              <button type="button" class="mini-action-btn" onClick={() => callWin('copyTokenDetailAddress')} data-i18n="common.copy">复制</button>
            </div>
          </div>

          {/* Per-Chain Breakdown when 'all' is selected */}
          <div id="token-detail-breakdown-card" class="ios-glass-card flex flex-col gap-2">
            <span style={{ fontWeight: 700, fontSize: '13px' }} data-i18n="detail.chainBreakdownTitle">分链余额明细</span>
            <div id="token-detail-breakdown-list" class="flex flex-col gap-2"><PanelSlot slotId="token-detail-breakdown-list" component={TokenBreakdownPanel} /></div>
          </div>

          {/* Earn / Staking / Lending Section for this token */}
          <div id="token-detail-earn-card" class="hidden flex flex-col gap-3">
            <div id="token-detail-earn-list" class="flex flex-col gap-3" />
          </div>

          {/* On-Chain Activity & Transaction History */}
          <div class="ios-glass-card flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <span style={{ fontWeight: 700, fontSize: '13px' }} data-i18n="detail.historyTitle">最近交易</span>
              <div class="flex items-center gap-2">
                <button type="button" id="token-detail-history-all-btn" class="btn-ghost-sm hidden" onClick={() => callWin('openAllTokenHistorySheet')} data-i18n="detail.allBtn">全部 ›</button>
                <a id="token-detail-explorer-link" href="#" target="_blank" rel="noopener noreferrer" class="mono" style={{ fontSize: '11.5px', color: 'var(--near-emerald)', textDecoration: 'none' }} data-i18n="detail.openExplorerBtn">前往浏览器 ↗</a>
              </div>
            </div>
            <div id="token-detail-history-list" class="flex flex-col gap-2" style={{ fontSize: '12px' }}><PanelSlot slotId="token-detail-history-list" component={TokenHistoryPanel} /></div>
          </div>

          {/* Bottom Live Price Bar */}
          <div class="ios-glass-card flex items-center justify-between" style={{ padding: '10px 14px' }}>
            <span id="token-detail-price-label" style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>--</span>
            <span id="token-detail-price-val" class="mono text-emerald" style={{ fontWeight: 700, fontSize: '14px' }}>--</span>
          </div>
        </div>
      </div>

      {/* ==================== Sheet: Token Picker ==================== */}
      <div id="sheet-token-picker" class="bottom-sheet" aria-hidden="true">
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 class="sheet-title" data-i18n="sheet.tokenPickerTitle">选择代币</h3>
          <button type="button" class="btn-ghost-sm" onClick={() => callWin('closeAllSheets')} data-i18n="common.close">关闭</button>
        </div>
        <div class="sheet-body">
          <input
            id="token-picker-search"
            type="text"
            class="input-field"
            data-i18n-placeholder="sheet.tokenPickerSearch"
            placeholder="搜索币种名称或合约"
            onInput={() => callWin('renderTokenPickerList')}
          />
          <div id="token-picker-favorites" class="pill-scroll" />
          <div id="token-picker-chains" class="pill-scroll" />
          <div id="token-picker-more-chains" class="picker-more-chains-grid hidden" />
          <div id="token-picker-list" class="flex flex-col gap-2" style={{ maxHeight: '46vh', overflowY: 'auto' }}><PanelSlot slotId="token-picker-list" component={TokenPickerPanel} /></div>
        </div>
      </div>

      {/* ==================== Sheet: Unified Confirm Dialog ==================== */}
      <div id="confirm-dialog-backdrop" class="sheet-backdrop" style={{ zIndex: 1190 }} />
      <div id="sheet-confirm-dialog" class="bottom-sheet" aria-hidden="true" style={{ zIndex: 1200 }}>
        <div class="sheet-handle" />
        <div class="sheet-header">
          <h3 id="confirm-dialog-title" class="sheet-title" data-i18n="sheet.confirmTitle">确认操作</h3>
          <button type="button" id="btn-confirm-dialog-close" class="btn-ghost-sm" data-i18n="common.cancel">取消</button>
        </div>
        <div class="sheet-body flex flex-col gap-3">
          <div id="confirm-dialog-message" style={{ fontSize: '13px', lineHeight: 1.55, color: 'var(--text-primary)', wordBreak: 'break-word' }} />
          <div class="flex gap-2" style={{ marginTop: '4px' }}>
            <button type="button" id="btn-confirm-dialog-cancel" class="btn-ghost" style={{ flex: 1 }} data-i18n="common.cancel">取消</button>
            <button type="button" id="btn-confirm-dialog-ok" class="btn-primary" style={{ flex: 1 }} data-i18n="common.confirm">确认</button>
          </div>
        </div>
      </div>

      {/* ==================== Sheet: Transaction Preview & Stepper Flow ==================== */}
      <div id="tx-flow-backdrop" class="tx-flow-backdrop hidden" aria-hidden="true" />
      <div id="sheet-tx-flow" class="tx-flow-sheet" aria-hidden="true"><PanelSlot slotId="sheet-tx-flow" component={TxFlowModal} /></div>
    </Fragment>
  );
}

export default CoreSheets;
