import { h } from 'preact';
import { useI18n, useWalletState } from '../store/useWalletStore.js';
import { TokenIconBadge } from './TokenIconBadge.jsx';
import { EmptyState } from './ui/EmptyState.jsx';

function defaultFormatPerpPx(px) {
  const n = Number(px);
  if (!Number.isFinite(n) || n <= 0) return '--';
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function defaultFormatBal(val, dp = 4) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '--';
  return Number(n.toFixed(dp)).toString();
}

function defaultFormatCompactUsd(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return '--';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

const PERP_DATE_ONLY_INTERVALS = new Set(['1d', '3d', '1w', '1M']);
const PERP_ALL_INTERVALS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d', '3d', '1w', '1M'];
const PERP_DEFAULT_PINNED = ['5m', '15m', '1h', '4h', '1d'];
const PERP_IV_ZH_MAP = {
  '1m': '1分', '3m': '3分', '5m': '5分', '15m': '15分', '30m': '30分',
  '1h': '1时', '2h': '2时', '4h': '4时', '8h': '8时', '12h': '12时',
  '1d': '1日', '3d': '3日', '1w': '1周', '1M': '1月'
};

function defaultFormatCandleTime(ts, interval = null) {
  if (!Number.isFinite(ts) || ts <= 1e9) return '';
  const d = new Date(ts);
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (interval && PERP_DATE_ONLY_INTERVALS.has(String(interval))) {
    return `${yyyy}/${mm}/${dd}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

export function PerpMarketsSheetPanel({
  markets = [],
  selectedCoin = 'BTC',
  emptyText,
  isEn: isEnProp,
  formatPerpPx = defaultFormatPerpPx
}) {
  const st = useWalletState(['perp', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');
  const list = Array.isArray(markets) ? markets.slice(0, 120) : [];

  if (list.length === 0) {
    return (
      <EmptyState
        title={emptyText || (isEn ? 'No matching market' : '未找到匹配市场')}
      />
    );
  }

  return (
    <div class="flex flex-col gap-1">
      {list.map((m, idx) => {
        const coin = String(m.name || '');
        const isActive = coin === selectedCoin;
        const chg = typeof m.change24hPct === 'number' && Number.isFinite(m.change24hPct) ? m.change24hPct : null;
        const chgStr = chg !== null ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '--';
        const chgCls = chg !== null ? (chg >= 0 ? 'text-emerald' : 'text-rose') : '';
        const pairLabel = m.pair || m.pairLabel || `${coin}-USDC`;
        const dexTag = m.dexTag || m.dex || '';
        const isFav = Boolean(m.isFav);
        const volText = m.volText || (typeof m.dayNtlVlm === 'number' && m.dayNtlVlm > 0
          ? `${isEn ? 'Vol' : '量'} ${defaultFormatCompactUsd(m.dayNtlVlm)}`
          : '');

        return (
          <div
            key={coin || idx}
            role="button"
            tabIndex={0}
            class={`perp-market-item ${isActive ? 'active' : ''}`}
            data-action="select-perp-market"
            data-coin={coin}
          >
            <div class="flex items-center gap-2" style={{ minWidth: 0 }}>
              <button
                type="button"
                class="btn-ghost-sm"
                data-action="toggle-perp-fav"
                data-stop="1"
                data-coin={coin}
                style={{ padding: '2px 4px', fontSize: '13px', color: isFav ? '#fbbf24' : 'var(--text-muted)' }}
              >
                {isFav ? '★' : '☆'}
              </button>
              <TokenIconBadge symbol={coin} blockchain="hype" size={28} showChainBadge={false} />
              <div class="flex flex-col" style={{ gap: '1px', minWidth: 0 }}>
                <div class="flex items-center gap-1" style={{ flexWrap: 'wrap' }}>
                  <strong>{pairLabel}</strong>
                  {dexTag ? <span class="perp-dex-pill">{dexTag}</span> : null}
                  <span class="ca-badge">{String(m.maxLeverage || 20)}x</span>
                </div>
                {volText ? (
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{volText}</span>
                ) : null}
              </div>
            </div>
            <div class="flex flex-col mono" style={{ fontSize: '12.5px', textAlign: 'right', gap: '2px', flexShrink: 0 }}>
              <strong style={{ color: '#fff' }}>{m.markPx ? `$${formatPerpPx(m.markPx)}` : '--'}</strong>
              <span class={chgCls} style={{ fontSize: '11px' }}>{chgStr}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PerpFundingInfoPanel({
  entries = [],
  selectedValue = '',
  formatBal = defaultFormatBal
}) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) return null;
  const cleanLabel = (e) => String(e.chainLabel || e.blockchain || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
  const counts = {};
  for (const e of list) {
    const k = `${e.symbol}::${cleanLabel(e)}`;
    counts[k] = (counts[k] || 0) + 1;
  }
  return list.map((e) => {
    const baseChain = cleanLabel(e);
    const dup = counts[`${e.symbol}::${baseChain}`] > 1;
    const chainDisplay = dup && e.chainLabel ? e.chainLabel : baseChain;
    return (
      <option key={e.key} value={e.key} selected={selectedValue ? e.key === selectedValue : undefined}>
        {`${e.symbol} · ${chainDisplay} (${formatBal(e.balance, 4)})`}
      </option>
    );
  });
}

export function PerpChartHudPanel({
  candles = [],
  selectedIdx = null,
  dockSide: dockSideProp,
  isEn: isEnProp,
  interval: intervalProp,
  formatPerpPx = defaultFormatPerpPx,
  formatBal = defaultFormatBal,
  formatCompactUsd = defaultFormatCompactUsd,
  formatPerpCandleTime = defaultFormatCandleTime
}) {
  const st = useWalletState(['perp', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');
  const interval = intervalProp || (st && st.perp && st.perp.chartInterval) || '15m';
  const list = Array.isArray(candles) ? candles : [];

  if (!Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= list.length) {
    return null;
  }

  const c = list[selectedIdx];
  const dockSide = dockSideProp === 'left' || dockSideProp === 'right'
    ? dockSideProp
    : (selectedIdx < list.length / 2 ? 'right' : 'left');

  const open = Number(c.o);
  const high = Number(c.h);
  const low = Number(c.l);
  const close = Number(c.c);
  const hasOC = Number.isFinite(open) && Number.isFinite(close);
  const diff = hasOC ? close - open : null;
  const pct = hasOC && open > 0 ? (diff / open) * 100 : null;
  const amp = Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(open) && open > 0
    ? ((high - low) / open) * 100
    : null;
  const dirCls = diff !== null ? (diff >= 0 ? 'text-emerald' : 'text-rose') : '';

  const diffStr = diff === null
    ? '--'
    : (diff === 0 ? '0.00' : `${diff > 0 ? '+' : '-'}${formatPerpPx(Math.abs(diff))}`);
  const pctStr = pct === null ? '--' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  const ampStr = amp === null ? '--' : `${amp.toFixed(2)}%`;
  const volQty = Number.isFinite(Number(c.v)) && Number(c.v) > 0 ? formatBal(c.v, 2) : '--';
  const turnover = Number.isFinite(Number(c.v)) && Number(c.v) > 0 && Number.isFinite(close) && close > 0
    ? formatCompactUsd(Number(c.v) * close)
    : '--';

  const rows = [
    { k: 'time', label: isEn ? 'Time' : '时间', val: formatPerpCandleTime(c.t, interval) || `#${selectedIdx + 1}` },
    { k: 'open', label: isEn ? 'Open' : '开盘', val: formatPerpPx(c.o) },
    { k: 'high', label: isEn ? 'High' : '最高', val: formatPerpPx(c.h) },
    { k: 'low', label: isEn ? 'Low' : '最低', val: formatPerpPx(c.l) },
    { k: 'close', label: isEn ? 'Close' : '收盘', val: formatPerpPx(c.c) },
    { k: 'chg', label: isEn ? 'Change' : '涨跌额', val: diffStr, cls: dirCls },
    { k: 'chgPct', label: isEn ? 'Change %' : '涨跌幅', val: pctStr, cls: dirCls },
    { k: 'amp', label: isEn ? 'Amplitude' : '振幅', val: ampStr },
    { k: 'vol', label: isEn ? 'Volume' : '成交量', val: volQty },
    { k: 'turnover', label: isEn ? 'Turnover' : '成交额', val: turnover }
  ];

  return (
    <div class={`perp-okx-hud-float is-dock-${dockSide}`}>
      {rows.map((r) => (
        <div
          key={r.k}
          class="perp-okx-hud-row"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}
        >
          <span class="perp-okx-hud-lbl">{r.label}</span>
          <span
            class={`perp-okx-hud-val tabular-nums ${r.cls || ''}`}
            style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}
          >
            {r.val}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PerpIntervalsSheetPanel() {
  const st = useWalletState(['perp', 'lang']);
  const { tr } = useI18n();
  const activeIv = (st && st.perp && st.perp.chartInterval) || '15m';
  const rawPinned = (st && st.perp && Array.isArray(st.perp.pinnedIntervals)) ? st.perp.pinnedIntervals : PERP_DEFAULT_PINNED;
  const pinned = rawPinned.filter((x) => PERP_ALL_INTERVALS.includes(x)).slice(0, 5);
  const pinnedList = pinned.length ? pinned : PERP_DEFAULT_PINNED;
  const pinnedSet = new Set(pinnedList);
  const editing = Boolean(st && st.perp && st.perp.editingIntervals);
  const labelOf = (iv) => tr(`perp.iv${iv}`, PERP_IV_ZH_MAP[iv] || iv);

  return (
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <span class="meta-key" style={{ fontSize: '12px', fontWeight: 600 }} data-i18n="perp.ivPrefsTitle">
            {tr('perp.ivPrefsTitle', '常用周期')}
          </span>
          <button
            type="button"
            id="btn-perp-iv-edit"
            class={`btn-ghost-sm${editing ? ' text-emerald' : ''}`}
            onClick={() => window.togglePerpIntervalEditMode && window.togglePerpIntervalEditMode()}
            data-i18n={editing ? 'perp.ivDone' : 'perp.ivEdit'}
          >
            {editing ? tr('perp.ivDone', '完成') : tr('perp.ivEdit', '编辑')}
          </button>
        </div>
        <div class="perp-iv-grid">
          {pinnedList.map((iv) => (
            <button
              key={`pin-${iv}`}
              type="button"
              class={`perp-iv-tile${!editing && activeIv === iv ? ' active' : ''}${editing ? ' is-pinned' : ''}`}
              data-iv-pick={iv}
              onClick={() => window.handlePerpIntervalPick && window.handlePerpIntervalPick(iv)}
            >
              <span>{labelOf(iv)}</span>
              {editing ? <span class="perp-iv-badge">×</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <span class="meta-key" style={{ fontSize: '12px', fontWeight: 600 }} data-i18n="perp.ivAllTitle">
          {tr('perp.ivAllTitle', '全部周期')}
        </span>
        <div class="perp-iv-grid">
          {PERP_ALL_INTERVALS.map((iv) => {
            const isPinned = pinnedSet.has(iv);
            return (
              <button
                key={`all-${iv}`}
                type="button"
                class={`perp-iv-tile${!editing && activeIv === iv ? ' active' : ''}${editing && isPinned ? ' is-pinned' : ''}`}
                data-iv-pick={iv}
                onClick={() => window.handlePerpIntervalPick && window.handlePerpIntervalPick(iv)}
              >
                <span>{labelOf(iv)}</span>
                {editing ? <span class="perp-iv-badge">{isPinned ? '✓' : '+'}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
