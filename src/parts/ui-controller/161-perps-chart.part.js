  function getPerpChartWindow(candles) {
    const fullList = Array.isArray(candles) ? candles : [];
    const st = getState();
    const rawCount = Number(st.perp && st.perp.chartVisibleCount);
    const maxVisible = Number.isFinite(rawCount) ? Math.max(20, Math.min(140, Math.round(rawCount))) : 48;
    const rawOffset = Number(st.perp && st.perp.chartOffsetFromEnd);
    const maxOffset = Math.max(0, fullList.length - Math.min(fullList.length, maxVisible));
    const offsetFromEnd = Number.isFinite(rawOffset) ? Math.max(0, Math.min(maxOffset, Math.round(rawOffset))) : 0;
    const end = Math.max(0, fullList.length - offsetFromEnd);
    const start = Math.max(0, end - maxVisible);
    return { fullList, start, end, maxVisible, offsetFromEnd, list: fullList.slice(start, end) };
  }

  function getVisiblePerpCandles(candles) {
    return getPerpChartWindow(candles).list;
  }

  function formatPerpCandleTime(ts) {
    if (!Number.isFinite(ts) || ts <= 1e9) return '';
    const d = new Date(ts);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
  }

  function formatPerpCandleCountdown(interval, nowMs = Date.now()) {
    const map = {
      '1m': 60000,
      '5m': 300000,
      '15m': 900000,
      '30m': 1800000,
      '1h': 3600000,
      '4h': 14400000,
      '1d': 86400000
    };
    const ivMs = map[String(interval || '15m')] || 900000;
    const remSec = Math.max(0, Math.floor((ivMs - (nowMs % ivMs)) / 1000));
    const hh = Math.floor(remSec / 3600);
    const mm = Math.floor((remSec % 3600) / 60);
    const ss = remSec % 60;
    if (hh > 0) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    }
    return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }

  function renderPerpCandleDetailBar(candles, selectedIdx = null) {
    const el = $('perp-candle-detail');
    if (!el) return;
    const list = getVisiblePerpCandles(candles);
    const isInspecting = Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < list.length;
    const dockSide = isInspecting && selectedIdx < list.length / 2 ? 'right' : 'left';
    el.classList.toggle('hidden', !isInspecting);
    el.classList.toggle('is-inspecting', isInspecting);
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountPerpChartHudPanel === 'function') {
      fw.mountPerpChartHudPanel(el, {
        candles: list,
        selectedIdx: isInspecting ? selectedIdx : null,
        dockSide,
        isEn: getState().lang === 'en',
        formatPerpPx,
        formatBal,
        formatCompactUsd,
        formatPerpCandleTime
      });
      return;
    }
    if (!isInspecting) {
      el.innerHTML = '';
      return;
    }
    const c = list[selectedIdx];
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
    const cls = diff !== null ? (diff >= 0 ? 'text-emerald' : 'text-rose') : '';
    const diffStr = diff === null ? '--' : (diff === 0 ? '0.00' : `${diff > 0 ? '+' : '-'}${formatPerpPx(Math.abs(diff))}`);
    const pctStr = pct === null ? '--' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
    const ampStr = amp === null ? '--' : `${amp.toFixed(2)}%`;
    const volQty = Number.isFinite(Number(c.v)) && Number(c.v) > 0 ? formatBal(c.v, 2) : '--';
    const turnover = Number.isFinite(Number(c.v)) && Number(c.v) > 0 && Number.isFinite(close) && close > 0 ? formatCompactUsd(Number(c.v) * close) : '--';
    const rows = [
      [t('时间', 'Time'), formatPerpCandleTime(c.t) || `#${selectedIdx + 1}`, ''],
      [t('开盘', 'Open'), formatPerpPx(c.o), ''],
      [t('最高', 'High'), formatPerpPx(c.h), ''],
      [t('最低', 'Low'), formatPerpPx(c.l), ''],
      [t('收盘', 'Close'), formatPerpPx(c.c), ''],
      [t('涨跌额', 'Change'), diffStr, cls],
      [t('涨跌幅', 'Change %'), pctStr, cls],
      [t('振幅', 'Amplitude'), ampStr, ''],
      [t('成交量', 'Volume'), volQty, ''],
      [t('成交额', 'Turnover'), turnover, '']
    ];
    el.innerHTML = `<div class="perp-okx-hud-float is-dock-${dockSide}">` +
      rows.map(([lbl, val, rCls]) =>
        `<div class="perp-okx-hud-row" style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><span class="perp-okx-hud-lbl">${escapeHtml(lbl)}</span><span class="perp-okx-hud-val tabular-nums ${rCls}" style="font-variant-numeric:tabular-nums;text-align:right;">${escapeHtml(val)}</span></div>`
      ).join('') + `</div>`;
  }

  let _perpMaCache = {
    ref: null,
    len: 0,
    firstT: 0,
    lastT: 0,
    lastC: 0,
    ma5: [],
    ma10: [],
    ma20: []
  };

  function computeMaSeriesFast(fullList, period) {
    const out = new Array(fullList.length);
    let sum = 0;
    for (let i = 0; i < fullList.length; i++) {
      sum += Number(fullList[i].c || 0);
      if (i >= period) sum -= Number(fullList[i - period].c || 0);
      const count = i < period ? i + 1 : period;
      out[i] = sum / count;
    }
    return out;
  }

  function getCachedPerpMa(fullList) {
    const len = fullList.length;
    const firstT = len > 0 ? Number(fullList[0].t || 0) : 0;
    const lastT = len > 0 ? Number(fullList[len - 1].t || 0) : 0;
    const lastC = len > 0 ? Number(fullList[len - 1].c || 0) : 0;
    if (
      _perpMaCache.ref === fullList
      && _perpMaCache.len === len
      && _perpMaCache.firstT === firstT
      && _perpMaCache.lastT === lastT
      && _perpMaCache.lastC === lastC
    ) {
      return _perpMaCache;
    }
    _perpMaCache = {
      ref: fullList,
      len,
      firstT,
      lastT,
      lastC,
      ma5: computeMaSeriesFast(fullList, 5),
      ma10: computeMaSeriesFast(fullList, 10),
      ma20: computeMaSeriesFast(fullList, 20)
    };
    return _perpMaCache;
  }

  function updatePerpCrosshairOverlay(host, candles, selectedIdx) {
    if (!host || typeof host.querySelector !== 'function') return false;
    const chGroup = host.querySelector('#perp-chart-crosshair');
    if (!chGroup) return false;
    const { fullList, list } = getPerpChartWindow(candles);
    if (
      fullList.length < 2
      || list.length < 2
      || !Number.isInteger(selectedIdx)
      || selectedIdx < 0
      || selectedIdx >= list.length
    ) {
      if (chGroup.style) chGroup.style.display = 'none';
      if (typeof chGroup.setAttribute === 'function') chGroup.setAttribute('display', 'none');
      return true;
    }
    const plotL = 6;
    const plotR = 354;
    const plotW = plotR - plotL;
    const candleTop = 18;
    const candleBottom = 152;
    const volBottom = 196;
    let minLow = Infinity;
    let maxHigh = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.l < minLow) minLow = c.l;
      if (c.h > maxHigh) maxHigh = c.h;
    }
    const span = maxHigh - minLow || 1;
    const step = plotW / list.length;
    const yOf = (p) => Math.max(candleTop, Math.min(candleBottom, candleBottom - ((p - minLow) / span) * (candleBottom - candleTop)));
    const selC = list[selectedIdx];
    const cxNum = plotL + selectedIdx * step + step / 2;
    const cyNum = yOf(selC.c);
    const cx = cxNum.toFixed(1);
    const cy = cyNum.toFixed(1);

    const vLine = chGroup.querySelector('[data-ch="v"]');
    const hLine = chGroup.querySelector('[data-ch="h"]');
    const dot = chGroup.querySelector('[data-ch="dot"]');
    const xPillBg = chGroup.querySelector('[data-ch="xpill-bg"]');
    const xPillTxt = chGroup.querySelector('[data-ch="xpill-txt"]');
    const yPillBg = chGroup.querySelector('[data-ch="ypill-bg"]');
    const yPillTxt = chGroup.querySelector('[data-ch="ypill-txt"]');
    if (!vLine || !hLine || !dot || !xPillBg || !xPillTxt || !yPillBg || !yPillTxt) return false;

    vLine.setAttribute('x1', cx);
    vLine.setAttribute('x2', cx);
    vLine.setAttribute('y1', String(candleTop));
    vLine.setAttribute('y2', String(volBottom));
    hLine.setAttribute('x1', String(plotL));
    hLine.setAttribute('x2', String(plotR));
    hLine.setAttribute('y1', cy);
    hLine.setAttribute('y2', cy);
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);

    const xPillW = 58;
    const xPillX = Math.max(plotL, Math.min(plotR - xPillW, cxNum - xPillW / 2));
    xPillBg.setAttribute('x', xPillX.toFixed(1));
    xPillBg.setAttribute('y', String(volBottom + 2));
    xPillTxt.setAttribute('x', (xPillX + xPillW / 2).toFixed(1));
    xPillTxt.setAttribute('y', String(volBottom + 12));
    xPillTxt.textContent = formatPerpCandleTime(selC.t) || `#${selectedIdx + 1}`;

    const yPillY = Math.max(candleTop, Math.min(candleBottom - 14, cyNum - 7));
    yPillBg.setAttribute('y', yPillY.toFixed(1));
    yPillTxt.setAttribute('y', (yPillY + 10).toFixed(1));
    yPillTxt.textContent = formatPerpPx(selC.c);

    if (chGroup.style) chGroup.style.display = '';
    if (typeof chGroup.setAttribute === 'function') chGroup.setAttribute('display', 'inline');
    return true;
  }

  let _lastLongPressAt = 0;
  let _lastTapHandledAt = 0;

  function inspectPerpCandle(idx, fromTouch = false) {
    if (_lastLongPressAt && (Date.now() - _lastLongPressAt) < 350) {
      return;
    }
    if (!fromTouch && _lastTapHandledAt && (Date.now() - _lastTapHandledAt) < 450) {
      return;
    }
    if (fromTouch) {
      _lastTapHandledAt = Date.now();
    }
    const st = getState();
    const list = getVisiblePerpCandles(st.perp && st.perp.candles);
    const n = Number(idx);
    if (!Number.isInteger(n) || n < 0 || n >= list.length) {
      st.perp.inspectedCandleIdx = null;
    } else {
      st.perp.inspectedCandleIdx = st.perp.inspectedCandleIdx === n ? null : n;
    }
    const market = getSelectedPerpMarket();
    const chartSvgEl = $('perp-chart-svg');
    if (chartSvgEl) {
      if (!updatePerpCrosshairOverlay(chartSvgEl, st.perp.candles, st.perp.inspectedCandleIdx)) {
        chartSvgEl.innerHTML = renderPerpCandleSvg(st.perp.candles, market, st.perp.inspectedCandleIdx);
      }
    }
    renderPerpCandleDetailBar(st.perp.candles, st.perp.inspectedCandleIdx);
  }

  function renderPerpCandleSvg(candles, market = null, selectedIdx = null, renderOpts = null) {
    const isInteractivePan = Boolean(renderOpts && renderOpts.interactive);
    const reqOverscan = (renderOpts && Number(renderOpts.overscan) > 0)
      ? Math.min(32, Math.round(Number(renderOpts.overscan)))
      : 0;
    const { fullList, start, end, list } = getPerpChartWindow(candles);
    if (fullList.length < 2 || list.length < 2) {
      return `<div style="text-align:center; padding: 64px 0; font-size: 11.5px; color: var(--text-muted);">--</div>`;
    }
    const bufStart = reqOverscan > 0 ? Math.max(0, start - reqOverscan) : start;
    const bufEnd = reqOverscan > 0 ? Math.min(fullList.length, end + reqOverscan) : end;
    const leftPad = start - bufStart;
    const bufList = (bufStart === start && bufEnd === end) ? list : fullList.slice(bufStart, bufEnd);

    const cachedMa = getCachedPerpMa(fullList);
    const ma5All = cachedMa.ma5;
    const ma10All = cachedMa.ma10;
    const ma20All = cachedMa.ma20;

    const ma5Vis = ma5All.slice(bufStart, bufEnd);
    const ma10Vis = ma10All.slice(bufStart, bufEnd);
    const ma20Vis = ma20All.slice(bufStart, bufEnd);

    const W = 360;
    const H = 216;
    const plotL = 6;
    const plotR = 354;
    const plotW = plotR - plotL;
    const candleTop = 18;
    const candleBottom = 152;
    const volTop = 160;
    const volBottom = 196;

    let minLow = Infinity;
    let maxHigh = -Infinity;
    let minLowIdx = 0;
    let maxHighIdx = 0;
    let maxVol = 0;
    for (let i = 0; i < bufList.length; i++) {
      const c = bufList[i];
      if (c.l < minLow) { minLow = c.l; minLowIdx = i; }
      if (c.h > maxHigh) { maxHigh = c.h; maxHighIdx = i; }
      if (Number.isFinite(c.v) && c.v > 0) {
        if (c.v > maxVol) maxVol = c.v;
      }
    }
    const span = maxHigh - minLow || 1;
    const step = plotW / list.length;
    const bw = Math.max(2.2, step * 0.62);
    const bufW = reqOverscan > 0 ? W + (bufList.length - list.length) * step : W;
    const bufPlotR = plotL + bufList.length * step;
    const yOf = (p) => Math.max(candleTop, Math.min(candleBottom, candleBottom - ((p - minLow) / span) * (candleBottom - candleTop)));

    // OKX MA Legend Header (hidden in overscan pan mode so text doesn't slide off-screen)
    const lastMa5 = ma5Vis[ma5Vis.length - 1];
    const lastMa10 = ma10Vis[ma10Vis.length - 1];
    const lastMa20 = ma20Vis[ma20Vis.length - 1];
    const legendSvg = reqOverscan > 0
      ? ''
      : `<text x="6" y="11" fill="#f59e0b" font-size="8.2" font-weight="600" font-family="ui-monospace, monospace">MA5:${escapeHtml(formatPerpPx(lastMa5))}</text>` +
        `<text x="118" y="11" fill="#38bdf8" font-size="8.2" font-weight="600" font-family="ui-monospace, monospace">MA10:${escapeHtml(formatPerpPx(lastMa10))}</text>` +
        `<text x="232" y="11" fill="#c084fc" font-size="8.2" font-weight="600" font-family="ui-monospace, monospace">MA20:${escapeHtml(formatPerpPx(lastMa20))}</text>`;

    // 4 Horizontal Price Grid Lines (full width, no right price axis)
    const gridSvg = [0, 1 / 3, 2 / 3, 1].map((frac) => {
      const y = candleTop + frac * (candleBottom - candleTop);
      return `<line x1="${plotL}" y1="${y.toFixed(1)}" x2="${bufPlotR.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 3" stroke-width="0.7" />`;
    }).join('');

    // Vertical Dashed Time Grid Lines + Bottom Time Labels
    let timeGridSvg = '';
    if (reqOverscan > 0) {
      const tickStep = Math.max(8, Math.round(list.length / 3));
      for (let idx = tickStep; idx < bufList.length; idx += tickStep) {
        const x = plotL + idx * step + step / 2;
        const lbl = formatPerpCandleTime(bufList[idx].t);
        const labelEl = lbl
          ? `<text x="${x.toFixed(1)}" y="209" text-anchor="middle" fill="rgba(148,163,184,0.75)" font-size="8.0" font-family="ui-monospace, monospace">${escapeHtml(lbl)}</text>`
          : '';
        timeGridSvg += `<line x1="${x.toFixed(1)}" y1="${candleTop}" x2="${x.toFixed(1)}" y2="${volBottom}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2 3" stroke-width="0.7" />` + labelEl;
      }
    } else {
      const timeIndices = [Math.floor(list.length * 0.16), Math.floor(list.length * 0.5), Math.max(0, list.length - 1)];
      const seenT = new Set();
      timeGridSvg = timeIndices.map((idx) => {
        if (seenT.has(idx) || !list[idx]) return '';
        seenT.add(idx);
        const x = plotL + idx * step + step / 2;
        const lbl = formatPerpCandleTime(list[idx].t);
        const anchor = idx >= list.length - 2 ? 'end' : (idx <= 2 ? 'start' : 'middle');
        const labelEl = lbl
          ? `<text x="${x.toFixed(1)}" y="209" text-anchor="${anchor}" fill="rgba(148,163,184,0.75)" font-size="8.0" font-family="ui-monospace, monospace">${escapeHtml(lbl)}</text>`
          : '';
        return `<line x1="${x.toFixed(1)}" y1="${candleTop}" x2="${x.toFixed(1)}" y2="${volBottom}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2 3" stroke-width="0.7" />` + labelEl;
      }).join('');
    }

    // Candlesticks + Volume Histogram
    const candleSvg = bufList.map((c, idx) => {
      const xCenter = plotL + idx * step + step / 2;
      const isUp = c.c >= c.o;
      const color = isUp ? '#00ec97' : '#fb7185';
      const yH = yOf(c.h);
      const yL = yOf(c.l);
      const yO = yOf(c.o);
      const yC = yOf(c.c);
      const bodyTop = Math.min(yO, yC);
      const bodyH = Math.max(1.5, Math.abs(yO - yC));
      const xLeft = xCenter - bw / 2;
      let volRect = '';
      if (maxVol > 0 && Number.isFinite(c.v) && c.v > 0) {
        const vh = Math.max(1.5, (c.v / maxVol) * (volBottom - volTop));
        volRect = `<rect x="${xLeft.toFixed(1)}" y="${(volBottom - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${vh.toFixed(1)}" fill="${color}" fill-opacity="0.45" rx="0.6" />`;
      }
      return `<line x1="${xCenter.toFixed(1)}" y1="${yH.toFixed(1)}" x2="${xCenter.toFixed(1)}" y2="${yL.toFixed(1)}" stroke="${color}" stroke-width="1" />` +
        `<rect x="${xLeft.toFixed(1)}" y="${bodyTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${bodyH.toFixed(1)}" fill="${color}" rx="0.8" />` +
        volRect;
    }).join('');

    // MA5 / MA10 / MA20 Polylines
    const buildMaPolyline = (vals, color) => {
      const pts = vals.map((v, idx) => {
        const x = plotL + idx * step + step / 2;
        return `${x.toFixed(1)},${yOf(v).toFixed(1)}`;
      }).join(' ');
      return `<polyline fill="none" stroke="${color}" stroke-width="1.15" stroke-linejoin="round" stroke-linecap="round" points="${pts}" />`;
    };
    const maSvg = buildMaPolyline(ma5Vis, '#f59e0b') + buildMaPolyline(ma10Vis, '#38bdf8') + buildMaPolyline(ma20Vis, '#c084fc');

    // In-Chart High / Low Callout Pins
    const hiX = plotL + maxHighIdx * step + step / 2;
    const hiY = yOf(maxHigh);
    const hiRight = maxHighIdx > bufList.length * 0.55;
    const hiPin = hiRight
      ? `<text x="${(hiX - 4).toFixed(1)}" y="${Math.max(candleTop + 8, hiY + 2).toFixed(1)}" text-anchor="end" fill="#e2e8f0" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(maxHigh))} →</text>`
      : `<text x="${(hiX + 4).toFixed(1)}" y="${Math.max(candleTop + 8, hiY + 2).toFixed(1)}" text-anchor="start" fill="#e2e8f0" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">← ${escapeHtml(formatPerpPx(maxHigh))}</text>`;
    const loX = plotL + minLowIdx * step + step / 2;
    const loY = yOf(minLow);
    const loRight = minLowIdx > bufList.length * 0.55;
    const loPin = loRight
      ? `<text x="${(loX - 4).toFixed(1)}" y="${Math.min(candleBottom - 2, loY + 3).toFixed(1)}" text-anchor="end" fill="#e2e8f0" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(minLow))} →</text>`
      : `<text x="${(loX + 4).toFixed(1)}" y="${Math.min(candleBottom - 2, loY + 3).toFixed(1)}" text-anchor="start" fill="#e2e8f0" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">← ${escapeHtml(formatPerpPx(minLow))}</text>`;

    // Separator between candle and volume zones + Live Mark Price & Countdown Pill
    let markSvg = `<line x1="${plotL}" y1="${volTop - 4}" x2="${bufPlotR.toFixed(1)}" y2="${volTop - 4}" stroke="rgba(255,255,255,0.06)" stroke-width="0.8" />`;
    const livePx = (market && Number(market.markPx)) || bufList[bufList.length - 1].c;
    if (Number.isFinite(livePx) && livePx > 0) {
      const ym = yOf(livePx);
      markSvg += `<line x1="${plotL}" y1="${ym.toFixed(1)}" x2="${bufPlotR.toFixed(1)}" y2="${ym.toFixed(1)}" stroke="#00ec97" stroke-dasharray="3 2" stroke-width="0.95" stroke-opacity="0.85" />`;
      if (reqOverscan === 0) {
        const pillH = 22;
        const pillY = Math.max(candleTop, Math.min(candleBottom - pillH, ym - pillH / 2));
        const stChart = getState();
        const countdownStr = formatPerpCandleCountdown(stChart && stChart.perp && stChart.perp.chartInterval, Date.now());
        markSvg += `<rect x="290" y="${pillY.toFixed(1)}" width="64" height="${pillH}" rx="3" fill="rgba(6,10,20,0.92)" stroke="rgba(0,236,151,0.78)" stroke-width="0.75" />` +
          `<text x="322" y="${(pillY + 9.5).toFixed(1)}" text-anchor="middle" fill="#00ec97" font-size="8.0" font-weight="700" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(livePx))}</text>` +
          `<text x="322" y="${(pillY + 18.5).toFixed(1)}" text-anchor="middle" fill="rgba(226,232,240,0.85)" font-size="7.1" font-weight="600" font-family="ui-monospace, monospace">${escapeHtml(countdownStr)}</text>`;
      }
    }

    // Active Crosshair Overlay (always present so scrub updates coordinates without rebuilding SVG)
    const hasSel = reqOverscan === 0 && Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < list.length;
    const chIdx = hasSel ? selectedIdx : 0;
    const selC = list[chIdx];
    const cx = plotL + chIdx * step + step / 2;
    const cy = yOf(selC.c);
    const chDisplay = hasSel ? 'inline' : 'none';
    const xPillW = 58;
    const xPillX = Math.max(plotL, Math.min(plotR - xPillW, cx - xPillW / 2));
    const yPillY = Math.max(candleTop, Math.min(candleBottom - 14, cy - 7));
    const chTimeStr = formatPerpCandleTime(selC.t) || `#${chIdx + 1}`;
    const chPxStr = formatPerpPx(selC.c);
    const crosshairSvg = reqOverscan > 0
      ? ''
      : `<g id="perp-chart-crosshair" class="perp-chart-crosshair" display="${chDisplay}" style="display:${chDisplay};">` +
        `<line data-ch="v" x1="${cx.toFixed(1)}" y1="${candleTop}" x2="${cx.toFixed(1)}" y2="${volBottom}" stroke="#38bdf8" stroke-dasharray="2.5 2.5" stroke-width="1" stroke-opacity="0.9" />` +
        `<line data-ch="h" x1="${plotL}" y1="${cy.toFixed(1)}" x2="${plotR}" y2="${cy.toFixed(1)}" stroke="#38bdf8" stroke-dasharray="2.5 2.5" stroke-width="0.85" stroke-opacity="0.75" />` +
        `<circle data-ch="dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="#38bdf8" stroke="#06080f" stroke-width="1" />` +
        `<rect data-ch="xpill-bg" x="${xPillX.toFixed(1)}" y="${volBottom + 2}" width="${xPillW}" height="14" rx="3" fill="#0f172a" stroke="#38bdf8" stroke-width="0.75" />` +
        `<text data-ch="xpill-txt" x="${(xPillX + xPillW / 2).toFixed(1)}" y="${volBottom + 12}" text-anchor="middle" fill="#f8fafc" font-size="7.8" font-weight="600" font-family="ui-monospace, monospace">${escapeHtml(chTimeStr)}</text>` +
        `<rect data-ch="ypill-bg" x="292" y="${yPillY.toFixed(1)}" width="62" height="14" rx="3" fill="#0f172a" stroke="#38bdf8" stroke-width="0.75" />` +
        `<text data-ch="ypill-txt" x="323" y="${(yPillY + 10).toFixed(1)}" text-anchor="middle" fill="#f8fafc" font-size="8.0" font-weight="700" font-family="ui-monospace, monospace">${escapeHtml(chPxStr)}</text>` +
        `</g>`;

    // Transparent Interactive Hit Targets per Candle (omitted during active pan/inertia to reduce SVG DOM parse cost)
    const hitTargetsSvg = (isInteractivePan || reqOverscan > 0)
      ? ''
      : list.map((_, idx) => {
        const hx = plotL + idx * step;
        return `<rect x="${hx.toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent" pointer-events="all" class="perp-candle-hit" data-action="inspect-perp-candle" data-candle-idx="${idx}" />`;
      }).join('');

    const svgStyleAttr = reqOverscan > 0
      ? ` style="width:${((bufW / W) * 100).toFixed(4)}%;max-width:none;height:100%;margin-left:-${((leftPad * step / W) * 100).toFixed(4)}%;"`
      : '';

    const vbW = reqOverscan > 0 ? bufW.toFixed(1) : W;
    return `<svg viewBox="0 0 ${vbW} ${H}" preserveAspectRatio="xMidYMin meet" class="perp-chart-svg"${svgStyleAttr}>${legendSvg}${gridSvg}${timeGridSvg}${candleSvg}${maSvg}${hiPin}${loPin}${markSvg}${crosshairSvg}${hitTargetsSvg}</svg>`;
  }

  function bindPerpChartGestures() {
    if (typeof document === 'undefined') return;
    const host = $('perp-chart-svg');
    if (!host || (host.dataset && host.dataset.gesturesBound === '1') || typeof host.addEventListener !== 'function') return;
    if (host.dataset) host.dataset.gesturesBound = '1';
    if (host.style) {
      host.style.cursor = 'grab';
      if (!host.style.overflow) host.style.overflow = 'hidden';
      if (!host.style.touchAction) host.style.touchAction = 'pan-y';
    }

    const nowMs = () => (
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
    );

    let cachedRect = { width: 320, left: 0 };
    const refreshHostRect = () => {
      if (typeof host.getBoundingClientRect !== 'function') return cachedRect;
      const r = host.getBoundingClientRect();
      if (r && r.width > 0) {
        cachedRect = { width: r.width, left: Number(r.left) || 0 };
      }
      return cachedRect;
    };
    refreshHostRect();
    if (typeof ResizeObserver === 'function') {
      try {
        const ro = new ResizeObserver(() => { refreshHostRect(); });
        ro.observe(host);
      } catch (_) {}
    }

    const PAN_OVERSCAN_CANDLES = 24;
    const PAN_REDRAW_THROTTLE_MS = 90;
    const INERTIA_MIN_START_V = 0.12; // px/ms
    const INERTIA_STOP_V = 0.02;      // px/ms
    const INERTIA_MAX_V = 3.2;        // px/ms
    const INERTIA_FRICTION = 0.935;   // per 16.67ms frame

    let mode = null; // 'pan' | 'scrub' | 'pinch' | 'pinch-end' | 'scroll'
    let startX = 0;
    let startY = 0;
    let panOriginX = 0;
    let startOffset = 0;
    let startPinchDist = 0;
    let startVisibleCount = 48;
    let activeTouchId = null;
    let touchStartTime = 0;
    let maxTouchMoveDist = 0;
    let longPressTimer = null;
    let rafId = 0;
    let pendingRedrawInteractive = false;
    let redrawThrottleTimer = null;
    let scrubRafId = 0;
    let panTransformRafId = 0;
    let inertiaRafId = 0;
    let pendingPanPx = 0;
    let panBoundaryCrossed = false;
    let renderedOffset = Number((getState().perp && getState().perp.chartOffsetFromEnd) || 0);
    let floatOffset = renderedOffset;
    let renderedOverscanLeft = 0;
    let renderedOverscanRight = 0;
    let renderedIsOverscan = false;
    let lastRedrawAt = 0;
    let lastDetailIdx = (getState().perp && getState().perp.inspectedCandleIdx) ?? null;

    // Velocity tracker for flick momentum
    let lastMoveX = 0;
    let lastMoveAt = 0;
    let panVelocityPxPerMs = 0;

    let mouseDown = false;
    let mouseDragged = false;
    let mouseStartX = 0;
    let mouseStartOffset = 0;

    const getPxPerCandle = (st) => {
      const width = cachedRect.width || 320;
      const plotPx = Math.max(60, width * (348 / 360));
      const visCount = Math.max(20, Math.min(140, Math.round(Number((st && st.perp && st.perp.chartVisibleCount) || 48))));
      return plotPx / visCount;
    };

    const setChartPanTransform = (px) => {
      const target = (host.firstElementChild && host.firstElementChild.style) ? host.firstElementChild : host;
      if (!target || !target.style) return;
      if (!px || Math.abs(px) < 0.05) {
        target.style.transform = '';
        target.style.willChange = '';
      } else {
        target.style.willChange = 'transform';
        target.style.transform = `translate3d(${px.toFixed(1)}px, 0, 0)`;
      }
    };

    const schedulePanTransform = (px) => {
      pendingPanPx = px;
      if (typeof requestAnimationFrame !== 'function') {
        setChartPanTransform(pendingPanPx);
        return;
      }
      if (panTransformRafId) return;
      panTransformRafId = requestAnimationFrame(() => {
        panTransformRafId = 0;
        setChartPanTransform(pendingPanPx);
      });
    };

    const resetPanTransform = () => {
      if (panTransformRafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(panTransformRafId);
        panTransformRafId = 0;
      }
      pendingPanPx = 0;
      setChartPanTransform(0);
    };

    const clearRedrawThrottle = () => {
      if (redrawThrottleTimer) {
        clearTimeout(redrawThrottleTimer);
        redrawThrottleTimer = null;
      }
    };

    const stopPanInertia = () => {
      if (inertiaRafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(inertiaRafId);
      }
      inertiaRafId = 0;
    };

    const commitChartRedraw = (interactive = false) => {
      clearRedrawThrottle();
      const st = getState();
      if (!st || !st.perp) return;
      const market = getSelectedPerpMarket();
      const selIdx = st.perp.inspectedCandleIdx;
      const win = getPerpChartWindow(st.perp.candles);
      const useOverscan = interactive && win.fullList.length > win.list.length;
      host.innerHTML = renderPerpCandleSvg(
        st.perp.candles,
        market,
        selIdx,
        useOverscan ? { interactive: true, overscan: PAN_OVERSCAN_CANDLES } : (interactive ? { interactive: true } : null)
      );
      renderedOffset = Number(st.perp.chartOffsetFromEnd || 0);
      renderedIsOverscan = Boolean(useOverscan);
      if (useOverscan) {
        const bufStart = Math.max(0, win.start - PAN_OVERSCAN_CANDLES);
        const bufEnd = Math.min(win.fullList.length, win.end + PAN_OVERSCAN_CANDLES);
        renderedOverscanLeft = win.start - bufStart;
        renderedOverscanRight = bufEnd - win.end;
      } else {
        renderedOverscanLeft = 0;
        renderedOverscanRight = 0;
      }
      lastRedrawAt = nowMs();
      if (interactive) {
        const pxPerCandle = getPxPerCandle(st);
        const residualPx = (floatOffset - renderedOffset) * pxPerCandle;
        pendingPanPx = residualPx;
        setChartPanTransform(residualPx);
      } else {
        floatOffset = renderedOffset;
        resetPanTransform();
      }
      if (lastDetailIdx !== selIdx) {
        lastDetailIdx = selIdx;
        renderPerpCandleDetailBar(st.perp.candles, selIdx);
      }
    };

    const scheduleChartRedraw = (interactive = false) => {
      if (!interactive) pendingRedrawInteractive = false;
      else if (!rafId) pendingRedrawInteractive = true;

      if (typeof requestAnimationFrame !== 'function') {
        commitChartRedraw(interactive);
        return;
      }
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const useInteractive = pendingRedrawInteractive;
        pendingRedrawInteractive = false;
        commitChartRedraw(useInteractive);
      });
    };

    const applyContinuousOffset = (nextFloatOffset, interactive = true) => {
      const st = getState();
      const total = Array.isArray(st.perp && st.perp.candles) ? st.perp.candles.length : 0;
      const visCount = Math.max(20, Math.min(140, Math.round(Number((st.perp && st.perp.chartVisibleCount) || 48))));
      const maxOff = Math.max(0, total - Math.min(total, visCount));
      const clamped = Math.max(0, Math.min(maxOff, nextFloatOffset));
      floatOffset = clamped;
      const targetInt = Math.round(clamped);
      const pxPerCandle = getPxPerCandle(st);

      if (st.perp.inspectedCandleIdx !== null && st.perp.inspectedCandleIdx !== undefined) {
        st.perp.inspectedCandleIdx = null;
        lastDetailIdx = null;
        renderPerpCandleDetailBar(st.perp.candles, null);
      }

      const visualShiftPx = (floatOffset - renderedOffset) * pxPerCandle;
      schedulePanTransform(visualShiftPx);

      if (targetInt !== st.perp.chartOffsetFromEnd) {
        st.perp.chartOffsetFromEnd = targetInt;
        panBoundaryCrossed = true;
      }

      if (targetInt !== renderedOffset) {
        const deltaFromRendered = floatOffset - renderedOffset;
        const needLeftRedraw = deltaFromRendered > Math.max(0, renderedOverscanLeft - 2);
        const needRightRedraw = -deltaFromRendered > Math.max(0, renderedOverscanRight - 2);
        const needsBufferRedraw = !interactive || !renderedIsOverscan || needLeftRedraw || needRightRedraw;
        if (needsBufferRedraw) {
          const elapsed = nowMs() - lastRedrawAt;
          if (!interactive || !renderedIsOverscan || elapsed >= PAN_REDRAW_THROTTLE_MS) {
            scheduleChartRedraw(interactive);
          } else if (!redrawThrottleTimer) {
            redrawThrottleTimer = setTimeout(() => {
              redrawThrottleTimer = null;
              if (mode === 'pan' || mouseDragged || inertiaRafId) {
                scheduleChartRedraw(true);
              }
            }, Math.max(16, PAN_REDRAW_THROTTLE_MS - elapsed));
          }
        }
      }
      return { clamped, hitBound: clamped !== nextFloatOffset, maxOff };
    };

    const applyPanDelta = (dx, baseOffset) => {
      const st = getState();
      const pxPerCandle = getPxPerCandle(st);
      return applyContinuousOffset(baseOffset + dx / pxPerCandle, true);
    };

    const recordPanVelocity = (clientX) => {
      const tNow = nowMs();
      if (lastMoveAt > 0) {
        const dt = tNow - lastMoveAt;
        if (dt >= 4 && dt <= 120) {
          const instV = (clientX - lastMoveX) / dt;
          panVelocityPxPerMs = panVelocityPxPerMs * 0.45 + instV * 0.55;
        } else if (dt > 120) {
          panVelocityPxPerMs = 0;
        }
      }
      lastMoveX = clientX;
      lastMoveAt = tNow;
    };

    const settlePanToInteger = () => {
      stopPanInertia();
      clearRedrawThrottle();
      const st = getState();
      const total = Array.isArray(st.perp && st.perp.candles) ? st.perp.candles.length : 0;
      const visCount = Math.max(20, Math.min(140, Math.round(Number((st.perp && st.perp.chartVisibleCount) || 48))));
      const maxOff = Math.max(0, total - Math.min(total, visCount));
      const finalOff = Math.max(0, Math.min(maxOff, Math.round(floatOffset)));
      st.perp.chartOffsetFromEnd = finalOff;
      floatOffset = finalOff;
      scheduleChartRedraw(false);
    };

    const startPanInertia = (initialV) => {
      stopPanInertia();
      if (typeof requestAnimationFrame !== 'function') {
        settlePanToInteger();
        return;
      }
      let vx = Math.max(-INERTIA_MAX_V, Math.min(INERTIA_MAX_V, initialV));
      let prevTs = nowMs();
      const step = () => {
        inertiaRafId = 0;
        const tNow = nowMs();
        const dt = Math.min(34, Math.max(4, tNow - prevTs));
        prevTs = tNow;
        const st = getState();
        const pxPerCandle = getPxPerCandle(st);
        const nextFloat = floatOffset + (vx * dt) / pxPerCandle;
        const { hitBound } = applyContinuousOffset(nextFloat, true);
        vx *= Math.pow(INERTIA_FRICTION, dt / 16.67);
        if (hitBound || Math.abs(vx) < INERTIA_STOP_V) {
          settlePanToInteger();
          return;
        }
        inertiaRafId = requestAnimationFrame(step);
      };
      inertiaRafId = requestAnimationFrame(step);
    };

    const clientXToCandleIdx = (clientX) => {
      const rect = cachedRect.width > 0 ? cachedRect : refreshHostRect();
      const list = getVisiblePerpCandles(getState().perp && getState().perp.candles);
      if (!rect || !rect.width || list.length === 0) return null;
      const plotLeftPx = rect.left + rect.width * (6 / 360);
      const plotWidthPx = Math.max(1, rect.width * (348 / 360));
      const rel = Math.max(0, Math.min(0.9999, (clientX - plotLeftPx) / plotWidthPx));
      return Math.max(0, Math.min(list.length - 1, Math.floor(rel * list.length)));
    };

    const scheduleCrosshairUpdate = () => {
      const applyOverlay = () => {
        const st = getState();
        if (!updatePerpCrosshairOverlay(host, st.perp.candles, st.perp.inspectedCandleIdx)) {
          const market = getSelectedPerpMarket();
          host.innerHTML = renderPerpCandleSvg(st.perp.candles, market, st.perp.inspectedCandleIdx);
          renderedOffset = Number(st.perp.chartOffsetFromEnd || 0);
          floatOffset = renderedOffset;
        }
        lastDetailIdx = st.perp.inspectedCandleIdx;
        renderPerpCandleDetailBar(st.perp.candles, st.perp.inspectedCandleIdx);
      };
      if (typeof requestAnimationFrame !== 'function') {
        applyOverlay();
        return;
      }
      if (scrubRafId) return;
      scrubRafId = requestAnimationFrame(() => {
        scrubRafId = 0;
        applyOverlay();
      });
    };

    const cancelScheduledRedraw = () => {
      if (rafId && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
      rafId = 0;
      pendingRedrawInteractive = false;
    };

    const syncOffsetFromState = (wasCoasting) => {
      const st = getState();
      const curStateOff = Number((st.perp && st.perp.chartOffsetFromEnd) || 0);
      if (!wasCoasting || Math.abs(Math.round(floatOffset) - curStateOff) > 1) {
        renderedOffset = curStateOff;
        floatOffset = curStateOff;
      }
    };

    const findActiveTouch = (touches) => {
      if (!touches || !touches.length) return null;
      if (activeTouchId !== null && activeTouchId !== undefined) {
        for (let i = 0; i < touches.length; i++) {
          if (touches[i].identifier === activeTouchId) return touches[i];
        }
      }
      activeTouchId = touches[0].identifier;
      return touches[0];
    };

    host.addEventListener('touchstart', (e) => {
      if (!e.touches) return;
      if (host.dataset) host.dataset.interacting = '1';
      const wasCoasting = Boolean(inertiaRafId);
      stopPanInertia();
      clearRedrawThrottle();
      cancelScheduledRedraw();
      refreshHostRect();
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      const st = getState();
      syncOffsetFromState(wasCoasting);
      if (e.touches.length === 2) {
        mode = 'pinch';
        activeTouchId = null;
        startPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        startVisibleCount = Number(st.perp.chartVisibleCount || 48);
        return;
      }
      if (e.touches.length === 1) {
        mode = null;
        panBoundaryCrossed = false;
        const touch = e.touches[0];
        activeTouchId = touch.identifier;
        touchStartTime = nowMs();
        maxTouchMoveDist = 0;
        startX = touch.clientX;
        startY = touch.clientY;
        panOriginX = startX;
        startOffset = floatOffset;
        lastMoveX = startX;
        lastMoveAt = touchStartTime;
        panVelocityPxPerMs = 0;
        const touchX = touch.clientX;
        longPressTimer = setTimeout(() => {
          mode = 'scrub';
          _lastLongPressAt = Date.now();
          const idx = clientXToCandleIdx(touchX);
          if (idx !== null) {
            st.perp.inspectedCandleIdx = idx;
            scheduleCrosshairUpdate();
          }
        }, 260);
      }
    }, { passive: true });

    host.addEventListener('touchmove', (e) => {
      if (!e.touches) return;
      const st = getState();
      if (mode === 'pinch' && e.touches.length === 2 && startPinchDist > 0) {
        if (e.cancelable) e.preventDefault();
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const scale = startPinchDist / Math.max(10, dist);
        st.perp.chartVisibleCount = Math.max(20, Math.min(140, Math.round(startVisibleCount * scale)));
        scheduleChartRedraw(false);
        return;
      }
      if (mode === 'pinch-end') return;
      if (e.touches.length === 1) {
        const touch = findActiveTouch(e.touches);
        if (!touch) return;
        const curX = touch.clientX;
        const curY = touch.clientY;
        const dx = curX - startX;
        const dy = curY - startY;
        const moveDist = Math.hypot(dx, dy);
        if (moveDist > maxTouchMoveDist) maxTouchMoveDist = moveDist;
        if (!mode) {
          if (longPressTimer && (Math.abs(dx) > 6 || Math.abs(dy) > 7)) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
          }
          if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.1) {
            mode = 'pan';
            panOriginX = curX;
            startOffset = floatOffset;
            lastMoveX = curX;
            lastMoveAt = nowMs();
            panVelocityPxPerMs = 0;
            if (!renderedIsOverscan) {
              scheduleChartRedraw(true);
            }
          } else if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            mode = 'scroll';
            return;
          }
        }
        if (mode === 'scroll') return;
        if (mode === 'scrub') {
          if (e.cancelable) e.preventDefault();
          const idx = clientXToCandleIdx(curX);
          if (idx !== null && idx !== st.perp.inspectedCandleIdx) {
            st.perp.inspectedCandleIdx = idx;
            scheduleCrosshairUpdate();
          }
        } else if (mode === 'pan') {
          if (e.cancelable) e.preventDefault();
          recordPanVelocity(curX);
          applyPanDelta(curX - panOriginX, startOffset);
        }
      }
    }, { passive: false });

    const onTouchEnd = (e) => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (e && e.touches && e.touches.length > 0) {
        if (mode === 'pinch') mode = 'pinch-end';
        return;
      }
      if (host.dataset) host.dataset.interacting = '';
      activeTouchId = null;
      if (mode === 'scrub') {
        _lastLongPressAt = Date.now();
        mode = null;
        panBoundaryCrossed = false;
        return;
      }
      if (mode === 'pan') {
        const age = nowMs() - lastMoveAt;
        const releaseV = age <= 90 ? panVelocityPxPerMs : 0;
        mode = null;
        panBoundaryCrossed = false;
        if (Math.abs(releaseV) >= INERTIA_MIN_START_V) {
          startPanInertia(releaseV);
        } else {
          settlePanToInteger();
        }
        return;
      }
      if (mode === null && maxTouchMoveDist <= 8 && (nowMs() - touchStartTime) < 260) {
        const tapTouch = (e && e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
        const tapX = tapTouch ? tapTouch.clientX : startX;
        const idx = clientXToCandleIdx(tapX);
        if (idx !== null) {
          inspectPerpCandle(idx, true);
        }
      }
      panBoundaryCrossed = false;
      mode = null;
    };

    const onTouchCancel = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (host.dataset) host.dataset.interacting = '';
      activeTouchId = null;
      const wasPan = mode === 'pan';
      mode = null;
      panBoundaryCrossed = false;
      if (wasPan) {
        settlePanToInteger();
      }
    };

    host.addEventListener('touchend', onTouchEnd, { passive: true });
    host.addEventListener('touchcancel', onTouchCancel, { passive: true });

    host.addEventListener('mousedown', (e) => {
      if (!e || (e.button !== undefined && e.button !== 0)) return;
      const wasCoasting = Boolean(inertiaRafId);
      stopPanInertia();
      clearRedrawThrottle();
      cancelScheduledRedraw();
      refreshHostRect();
      syncOffsetFromState(wasCoasting);
      mouseDown = true;
      mouseDragged = false;
      panBoundaryCrossed = false;
      mouseStartX = e.clientX;
      mouseStartOffset = floatOffset;
      lastMoveX = e.clientX;
      lastMoveAt = nowMs();
      panVelocityPxPerMs = 0;
      if (host.style) host.style.cursor = 'grabbing';
    });

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('mousemove', (e) => {
        if (!mouseDown || !e) return;
        const dx = e.clientX - mouseStartX;
        if (!mouseDragged && Math.abs(dx) >= 5) {
          mouseDragged = true;
          mouseStartX = e.clientX;
          mouseStartOffset = floatOffset;
          lastMoveX = e.clientX;
          lastMoveAt = nowMs();
          panVelocityPxPerMs = 0;
        }
        if (mouseDragged) {
          recordPanVelocity(e.clientX);
          applyPanDelta(e.clientX - mouseStartX, mouseStartOffset);
        }
      });
      window.addEventListener('mouseup', () => {
        if (!mouseDown) return;
        mouseDown = false;
        if (host.style) host.style.cursor = 'grab';
        if (mouseDragged) {
          _lastLongPressAt = Date.now();
          const age = nowMs() - lastMoveAt;
          const releaseV = age <= 90 ? panVelocityPxPerMs : 0;
          mouseDragged = false;
          panBoundaryCrossed = false;
          if (Math.abs(releaseV) >= INERTIA_MIN_START_V) {
            startPanInertia(releaseV);
          } else {
            settlePanToInteger();
          }
        }
      });
    }

    host.addEventListener('wheel', (e) => {
      if (!e || typeof e.deltaY !== 'number') return;
      stopPanInertia();
      clearRedrawThrottle();
      const st = getState();
      const cur = Number(st.perp.chartVisibleCount || 48);
      const step = e.deltaY > 0 ? 6 : -6;
      const next = Math.max(20, Math.min(140, cur + step));
      if (next !== cur) {
        e.preventDefault();
        st.perp.chartVisibleCount = next;
        scheduleChartRedraw(false);
      }
    }, { passive: false });
  }

