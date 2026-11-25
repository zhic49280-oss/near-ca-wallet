import { h } from 'preact';
import { useWalletState } from '../store/useWalletStore.js';
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

function defaultFormatCandleTime(ts) {
  if (!Number.isFinite(ts) || ts <= 1e9) return '';
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
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
  formatBal = defaultFormatBal
}) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) return null;
  return list.map((e) => (
    <option key={e.key} value={e.key}>
      {`${e.symbol} · ${e.chainLabel} (${formatBal(e.balance, 4)})`}
    </option>
  ));
}

export function PerpChartHudPanel({
  candles = [],
  selectedIdx = null,
  isEn: isEnProp,
  formatPerpPx = defaultFormatPerpPx,
  formatBal = defaultFormatBal,
  formatCompactUsd = defaultFormatCompactUsd,
  formatPerpCandleTime = defaultFormatCandleTime
}) {
  const st = useWalletState(['perp', 'lang']);
  const isEn = typeof isEnProp === 'boolean' ? isEnProp : Boolean(st && st.lang === 'en');
  const list = Array.isArray(candles) ? candles : [];

  if (Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < list.length) {
    const c = list[selectedIdx];
    const open = Number(c.o || 0);
    const close = Number(c.c || 0);
    const pct = open > 0 ? ((close - open) / open) * 100 : 0;
    const cls = close >= open ? 'text-emerald' : 'text-rose';
    const timeStr = formatPerpCandleTime(c.t) || `#${selectedIdx + 1}`;
    const volUsd = Number.isFinite(c.v) && c.v > 0 ? formatCompactUsd(c.v * (close || 1)) : '--';
    const volQty = Number.isFinite(c.v) && c.v > 0 ? formatBal(c.v, 2) : '--';

    return [
      <span key="t" style={{ color: '#fff', fontWeight: 700 }}>{timeStr}</span>,
      <span key="ohlc">{`O:${formatPerpPx(c.o)} H:${formatPerpPx(c.h)} L:${formatPerpPx(c.l)} C:${formatPerpPx(c.c)}`}</span>,
      <span key="pct" class={cls} style={{ fontWeight: 700 }}>{`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`}</span>,
      <span key="vol">{`${isEn ? 'Vol' : '量'}:${volQty} (${volUsd})`}</span>
    ];
  }

  if (list.length === 0) {
    return <span>{isEn ? 'Drag or tap chart to inspect' : '滑动或点按 K 线查看详情'}</span>;
  }

  let lo = Infinity;
  let hi = -Infinity;
  let totalVol = 0;
  for (const c of list) {
    if (Number(c.l) < lo) lo = Number(c.l);
    if (Number(c.h) > hi) hi = Number(c.h);
    if (Number.isFinite(c.v) && c.v > 0) totalVol += Number(c.v);
  }
  const firstOpen = Number(list[0].o || 0);
  const lastClose = Number(list[list.length - 1].c || 0);
  const pct = firstOpen > 0 ? ((lastClose - firstOpen) / firstOpen) * 100 : 0;
  const cls = pct >= 0 ? 'text-emerald' : 'text-rose';

  return [
    <span key="hi">{isEn ? 'High' : '区间高'}: <strong style={{ color: '#f8fafc' }}>{`$${formatPerpPx(hi)}`}</strong></span>,
    <span key="lo">{isEn ? 'Low' : '区间低'}: <strong style={{ color: '#f8fafc' }}>{`$${formatPerpPx(lo)}`}</strong></span>,
    <span key="last">
      {isEn ? 'Last' : '最新'}: <strong style={{ color: '#f8fafc' }}>{`$${formatPerpPx(lastClose)}`}</strong>{' '}
      <span class={cls} style={{ fontWeight: 700 }}>{`(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`}</span>
    </span>,
    <span key="vol">{`${isEn ? 'Vol' : '总量'}: ${totalVol > 0 ? formatBal(totalVol, 1) : '--'}`}</span>
  ];
}
