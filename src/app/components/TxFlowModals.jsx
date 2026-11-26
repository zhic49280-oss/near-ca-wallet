import { h } from 'preact';
import { useLang } from '../store/useWalletStore.js';
import { StatusBadge } from './ui/StatusBadge.jsx';

function shortenHash(hash) {
  const s = String(hash || '').trim();
  if (!s) return '';
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}...${s.slice(-6)}`;
}

function getStepTone(status) {
  if (status === 'done') return 'emerald';
  if (status === 'error') return 'rose';
  if (status === 'active' || status === 'auth') return 'amber';
  return 'slate';
}

function getStepStatusLabel(status, isEn) {
  if (status === 'done') return isEn ? 'Completed ✓' : '已完成 ✓';
  if (status === 'error') return isEn ? 'Failed ✗' : '失败 ✗';
  if (status === 'auth') return isEn ? 'Verify Identity' : '请验证身份';
  if (status === 'active') return isEn ? 'Broadcasting...' : '广播上链中...';
  return isEn ? 'Waiting' : '等待中';
}

export function TxPreviewModal({
  preview = {},
  onCancel,
  onConfirm,
  isEn: isEnProp
}) {
  const { isEn: storeIsEn, t } = useLang();
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : storeIsEn;
  const steps = Array.isArray(preview.steps) ? preview.steps : [];

  return (
    <div class="tx-flow-container" data-testid="tx-preview-modal">
      <div class="tx-flow-header">
        <div>
          <h3 class="sheet-title">{preview.title || t('确认兑换', 'Confirm Swap')}</h3>
          {preview.subtitle ? (
            <div class="tx-flow-subtitle">{preview.subtitle}</div>
          ) : null}
        </div>
        <button
          type="button"
          class="btn-ghost-sm"
          onClick={onCancel}
          aria-label={t('取消', 'Cancel')}
        >
          ✕
        </button>
      </div>

      <div class="tx-flow-body">
        <div class="tx-flow-rate-card">
          {(preview.rateText || preview.summaryText) ? (
            <div class="tx-flow-rate-row">
              <span class="tx-flow-meta-key">{preview.rateLabel || t('兑换比例', 'Rate')}</span>
              <span class="tx-flow-rate-val mono">{preview.rateText || preview.summaryText}</span>
            </div>
          ) : null}

          {(preview.payAmountText || preview.receiveAmountText) ? (
            <div class="tx-flow-net-grid">
              <div class="tx-flow-net-box tx-flow-net-pay">
                <div class="tx-flow-net-label">{preview.payLabel || t('你将支付', 'You Pay')}</div>
                <div class="tx-flow-net-amt mono">
                  {preview.payAmountText ? `- ${preview.payAmountText}` : '--'}
                </div>
                {preview.payUsdText ? (
                  <div class="tx-flow-net-usd mono">{preview.payUsdText}</div>
                ) : null}
              </div>

              <div class="tx-flow-net-box tx-flow-net-receive">
                <div class="tx-flow-net-label">{preview.receiveLabel || t('预计至少获得', 'Est. Min Received')}</div>
                <div class="tx-flow-net-amt mono">
                  {preview.receiveAmountText ? `+ ${preview.receiveAmountText}` : '--'}
                </div>
                {preview.receiveUsdText ? (
                  <div class="tx-flow-net-usd mono">{preview.receiveUsdText}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div class="tx-flow-details-card">
          {Array.isArray(preview.detailRows) ? preview.detailRows.map((row, idx) => (
            <div key={`detail-row-${idx}`} class="tx-flow-detail-row">
              <span class="tx-flow-meta-key">{row.label}</span>
              <span class={`tx-flow-meta-val${row.mono ? ' mono' : ''}${row.tone === 'amber' ? ' text-amber' : ''}${row.tone === 'rose' ? ' text-rose' : ''}${row.tone === 'emerald' ? ' text-emerald' : ''}`}>
                {row.value}
              </span>
            </div>
          )) : null}
          {preview.accountText ? (
            <div class="tx-flow-detail-row">
              <span class="tx-flow-meta-key">{t('当前账户', 'Account')}</span>
              <span class="tx-flow-meta-val mono">{preview.accountText}</span>
            </div>
          ) : null}
          {preview.networkPath ? (
            <div class="tx-flow-detail-row">
              <span class="tx-flow-meta-key">{t('网络路径', 'Network Path')}</span>
              <span class="tx-flow-meta-val">{preview.networkPath}</span>
            </div>
          ) : null}
          {preview.feeText ? (
            <div class="tx-flow-detail-row">
              <span class="tx-flow-meta-key">{t('预估网络费', 'Est. Network Fee')}</span>
              <span class="tx-flow-meta-val mono">{preview.feeText}</span>
            </div>
          ) : null}
          {preview.slippageText ? (
            <div class="tx-flow-detail-row">
              <span class="tx-flow-meta-key">{t('滑点容差', 'Slippage')}</span>
              <span class="tx-flow-meta-val mono">{preview.slippageText}</span>
            </div>
          ) : null}
          {preview.recipientText ? (
            <div class="tx-flow-detail-row">
              <span class="tx-flow-meta-key">{t('收款地址', 'Recipient')}</span>
              <span class="tx-flow-meta-val mono text-amber">{preview.recipientText}</span>
            </div>
          ) : null}
          {preview.impactText ? (
            <div class="tx-flow-detail-row">
              <span class="tx-flow-meta-key">{t('价格影响', 'Price Impact')}</span>
              <span class="tx-flow-meta-val text-rose mono">{preview.impactText}</span>
            </div>
          ) : null}
        </div>

        {steps.length > 0 ? (
          <div class="tx-flow-steps-preview">
            <div class="tx-flow-steps-preview-head">
              <span>{t('即将执行的步骤', 'Execution Steps')}</span>
              <span class="tx-flow-steps-count">
                {isEn ? `${steps.length} step${steps.length > 1 ? 's' : ''}` : `共 ${steps.length} 步`}
              </span>
            </div>
            <div class="tx-flow-steps-preview-list">
              {steps.map((step, idx) => (
                <div key={`prev-step-${idx}`} class="tx-flow-preview-step-item">
                  <span class="tx-flow-preview-step-num">{idx + 1}</span>
                  <div class="tx-flow-preview-step-text">
                    <div class="tx-flow-preview-step-title">{step.title}</div>
                    {step.desc ? (
                      <div class="tx-flow-preview-step-desc">{step.desc}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div class="tx-flow-footer">
        <button type="button" class="btn-secondary flex-1" onClick={onCancel}>
          {t('取消', 'Cancel')}
        </button>
        <button type="button" class="btn-primary flex-1" onClick={onConfirm}>
          {preview.confirmLabel || t('确认兑换', 'Confirm Swap')}
        </button>
      </div>
    </div>
  );
}

export function TxStepperModal({
  stepper = {},
  onClose,
  isEn: isEnProp
}) {
  const { isEn: storeIsEn, t } = useLang();
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : storeIsEn;
  const steps = Array.isArray(stepper.steps) ? stepper.steps : [];
  const total = steps.length || 1;
  const completedCount = steps.filter((s) => s.status === 'done').length;
  const progressPct = Math.min(100, Math.round((completedCount / total) * 100));
  const finished = Boolean(stepper.finished);
  const ok = Boolean(stepper.ok);
  const resumable = Boolean(stepper.resumable);

  return (
    <div class="tx-flow-container" data-testid="tx-stepper-modal">
      <div class="tx-flow-header">
        <div>
          <h3 class="sheet-title">{stepper.title || t('正在执行交易', 'Executing Transaction')}</h3>
          <div class="tx-flow-subtitle">
            {isEn
              ? `Completed ${completedCount} / ${steps.length} steps`
              : `已完成 ${completedCount} / ${steps.length} 步`}
          </div>
        </div>
        {finished ? (
          <button
            type="button"
            class="btn-ghost-sm"
            onClick={onClose}
            aria-label={t('关闭', 'Close')}
          >
            ✕
          </button>
        ) : null}
      </div>

      <div class="tx-flow-progress-track">
        <div
          class={`tx-flow-progress-fill ${finished && !ok ? 'is-error' : ''}`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div class="tx-flow-body">
        <div class="tx-flow-stepper-list">
          {steps.map((step, idx) => {
            const stStatus = step.status || 'pending';
            const tone = getStepTone(stStatus);
            const statusText = getStepStatusLabel(stStatus, isEn);
            return (
              <div
                key={`exec-step-${idx}`}
                class={`tx-flow-step-card is-${stStatus}`}
              >
                <div class="tx-flow-step-card-top">
                  <span class="tx-flow-step-pill">
                    {isEn ? `Step ${idx + 1} / ${steps.length}` : `步骤 ${idx + 1} / ${steps.length}`}
                  </span>
                  <StatusBadge tone={tone}>{statusText}</StatusBadge>
                </div>
                <div class="tx-flow-step-title">{step.title}</div>
                {step.desc ? (
                  <div class="tx-flow-step-desc">{step.desc}</div>
                ) : null}
                {step.txHash ? (
                  <div class="tx-flow-step-hash-row">
                    <span class="tx-flow-step-hash mono">{shortenHash(step.txHash)}</span>
                    {step.explorerUrl ? (
                      <a
                        href={step.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="tx-flow-explorer-btn"
                      >
                        {t('在区块浏览器查看 ↗', 'View on Explorer ↗')}
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {stStatus === 'error' && step.error ? (
                  <div class="tx-flow-step-error">{step.error}</div>
                ) : null}
              </div>
            );
          })}
        </div>

        {finished && stepper.summary ? (
          <div class={`tx-flow-summary-banner ${ok ? 'is-ok' : 'is-error'}`}>
            <div>{stepper.summary}</div>
            {!ok && resumable ? (
              <div class="tx-flow-resumable-hint">
                {t('可在下方兑换订单卡片中继续执行剩余步骤', 'You can resume the remaining steps in the order card below')}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div class="tx-flow-footer">
        {!finished ? (
          <div class="tx-flow-wait-hint">
            <span class="tx-flow-pulse-dot" />
            <span>{t('交易执行中，请勿关闭页面', 'Transaction in progress, please do not close this page')}</span>
          </div>
        ) : (
          <button type="button" class="btn-primary flex-1" onClick={onClose}>
            {ok ? t('完成', 'Done') : t('关闭', 'Close')}
          </button>
        )}
      </div>
    </div>
  );
}

export function TxFlowModal({
  open = false,
  mode = 'preview',
  preview = {},
  stepper = {},
  onCancel,
  onConfirm,
  onClose,
  isEn
}) {
  if (!open) return null;
  if (mode === 'stepper') {
    return <TxStepperModal stepper={stepper} onClose={onClose} isEn={isEn} />;
  }
  return <TxPreviewModal preview={preview} onCancel={onCancel} onConfirm={onConfirm} isEn={isEn} />;
}
