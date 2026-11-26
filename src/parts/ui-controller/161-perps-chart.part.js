  function getPerpChartWindow(candles) {
    const fullList = Array.isArray(candles) ? candles : [];
    const st = getState();
    const rawCount = Number(st.perp && st.perp.chartVisibleCount);
    const maxVisible = Number.isFinite(rawCount) ? Math.max(20, Math.min(120, Math.round(rawCount))) : 48;
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

  function renderPerpCandleDetailBar(candles, selectedIdx = null) {
    const el = $('perp-candle-detail');
    if (!el) return;
    el.classList.remove('hidden');
    const list = getVisiblePerpCandles(candles);
    const isInspecting = Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < list.length;
    el.classList.toggle('is-inspecting', isInspecting);
    const fw = (typeof window !== 'undefined' && window.NearCAFramework) || (typeof globalThis !== 'undefined' && globalThis.NearCAFramework);
    if (fw && typeof fw.mountPerpChartHudPanel === 'function') {
      fw.mountPerpChartHudPanel(el, {
        candles: list,
        selectedIdx: isInspecting ? selectedIdx : null,
        isEn: getState().lang === 'en',
        formatPerpPx,
        formatBal,
        formatCompactUsd,
        formatPerpCandleTime
      });
      return;
    }
    if (isInspecting) {
      const c = list[selectedIdx];
      const open = Number(c.o || 0);
      const close = Number(c.c || 0);
      const pct = open > 0 ? ((close - open) / open) * 100 : 0;
      const cls = close >= open ? 'text-emerald' : 'text-rose';
      const timeStr = formatPerpCandleTime(c.t) || `#${selectedIdx + 1}`;
      const volUsd = Number.isFinite(c.v) && c.v > 0 ? formatCompactUsd(c.v * (close || 1)) : '--';
      const volQty = Number.isFinite(c.v) && c.v > 0 ? formatBal(c.v, 2) : '--';
      el.classList.add('is-inspecting');
      el.innerHTML =
        `<span style="color:#fff;font-weight:700;">${escapeHtml(timeStr)}</span>` +
        `<span>O:${escapeHtml(formatPerpPx(c.o))} H:${escapeHtml(formatPerpPx(c.h))} L:${escapeHtml(formatPerpPx(c.l))} C:${escapeHtml(formatPerpPx(c.c))}</span>` +
        `<span class="${cls}" style="font-weight:700;">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>` +
        `<span>${escapeHtml(t('量', 'Vol'))}:${escapeHtml(volQty)} (${escapeHtml(volUsd)})</span>`;
      return;
    }
    el.classList.remove('is-inspecting');
    if (list.length === 0) {
      el.innerHTML = `<span>${escapeHtml(t('滑动或点按 K 线查看详情', 'Drag or tap chart to inspect'))}</span>`;
      return;
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
    el.innerHTML =
      `<span>${escapeHtml(t('区间高', 'High'))}: <strong style="color:#f8fafc;">$${escapeHtml(formatPerpPx(hi))}</strong></span>` +
      `<span>${escapeHtml(t('区间低', 'Low'))}: <strong style="color:#f8fafc;">$${escapeHtml(formatPerpPx(lo))}</strong></span>` +
      `<span>${escapeHtml(t('最新', 'Last'))}: <strong style="color:#f8fafc;">$${escapeHtml(formatPerpPx(lastClose))}</strong> <span class="${cls}" style="font-weight:700;">(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</span></span>` +
      `<span>${escapeHtml(t('总量', 'Vol'))}: ${escapeHtml(totalVol > 0 ? formatBal(totalVol, 1) : '--')}</span>`;
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
    const candleTop = 22;
    const candleBottom = 186;
    const volBottom = 244;
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
    const cx = (plotL + selectedIdx * step + step / 2).toFixed(1);
    const cy = yOf(selC.c).toFixed(1);

    const vLine = chGroup.querySelector('[data-ch="v"]');
    const hLine = chGroup.querySelector('[data-ch="h"]');
    const dot = chGroup.querySelector('[data-ch="dot"]');
    if (!vLine || !hLine || !dot) return false;

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
    if (chGroup.style) chGroup.style.display = '';
    if (typeof chGroup.setAttribute === 'function') chGroup.setAttribute('display', 'inline');
    return true;
  }

  function inspectPerpCandle(idx) {
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

  function renderPerpCandleSvg(candles, market = null, selectedIdx = null) {
    const { fullList, start, end, list } = getPerpChartWindow(candles);
    if (fullList.length < 2 || list.length < 2) {
      return `<div style="text-align:center; padding: 64px 0; font-size: 11.5px; color: var(--text-muted);">--</div>`;
    }
    const cachedMa = getCachedPerpMa(fullList);
    const ma5All = cachedMa.ma5;
    const ma10All = cachedMa.ma10;
    const ma20All = cachedMa.ma20;

    const ma5Vis = ma5All.slice(start, end);
    const ma10Vis = ma10All.slice(start, end);
    const ma20Vis = ma20All.slice(start, end);

    const W = 360;
    const H = 268;
    const plotL = 6;
    const plotR = 354;
    const plotW = plotR - plotL;
    const candleTop = 22;
    const candleBottom = 186;
    const volTop = 198;
    const volBottom = 244;

    let minLow = Infinity;
    let maxHigh = -Infinity;
    let minLowIdx = 0;
    let maxHighIdx = 0;
    let maxVol = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.l < minLow) { minLow = c.l; minLowIdx = i; }
      if (c.h > maxHigh) { maxHigh = c.h; maxHighIdx = i; }
      if (Number.isFinite(c.v) && c.v > 0) {
        if (c.v > maxVol) maxVol = c.v;
      }
    }
    const span = maxHigh - minLow || 1;
    const step = plotW / list.length;
    const bw = Math.max(2.2, step * 0.62);
    const yOf = (p) => Math.max(candleTop, Math.min(candleBottom, candleBottom - ((p - minLow) / span) * (candleBottom - candleTop)));

    // OKX MA Legend Header
    const lastMa5 = ma5Vis[ma5Vis.length - 1];
    const lastMa10 = ma10Vis[ma10Vis.length - 1];
    const lastMa20 = ma20Vis[ma20Vis.length - 1];
    const legendSvg =
      `<text x="6" y="12" fill="#f59e0b" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">MA5:${escapeHtml(formatPerpPx(lastMa5))}</text>` +
      `<text x="118" y="12" fill="#38bdf8" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">MA10:${escapeHtml(formatPerpPx(lastMa10))}</text>` +
      `<text x="232" y="12" fill="#c084fc" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">MA20:${escapeHtml(formatPerpPx(lastMa20))}</text>`;

    // 4 Horizontal Price Grid Lines (full width, no right price axis)
    const gridSvg = [0, 1 / 3, 2 / 3, 1].map((frac) => {
      const y = candleTop + frac * (candleBottom - candleTop);
      return `<line x1="${plotL}" y1="${y.toFixed(1)}" x2="${plotR}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 3" stroke-width="0.7" />`;
    }).join('');

    // 3 Vertical Dashed Time Grid Lines + Bottom Time Labels
    const timeIndices = [Math.floor(list.length * 0.16), Math.floor(list.length * 0.5), Math.max(0, list.length - 1)];
    const seenT = new Set();
    const timeGridSvg = timeIndices.map((idx) => {
      if (seenT.has(idx) || !list[idx]) return '';
      seenT.add(idx);
      const x = plotL + idx * step + step / 2;
      const lbl = formatPerpCandleTime(list[idx].t);
      const anchor = idx >= list.length - 2 ? 'end' : (idx <= 2 ? 'start' : 'middle');
      const labelEl = lbl
        ? `<text x="${x.toFixed(1)}" y="260" text-anchor="${anchor}" fill="rgba(148,163,184,0.75)" font-size="8.2" font-family="ui-monospace, monospace">${escapeHtml(lbl)}</text>`
        : '';
      return `<line x1="${x.toFixed(1)}" y1="${candleTop}" x2="${x.toFixed(1)}" y2="${volBottom}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2 3" stroke-width="0.7" />` + labelEl;
    }).join('');

    // Candlesticks + Volume Histogram
    const candleSvg = list.map((c, idx) => {
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
    const hiRight = maxHighIdx > list.length * 0.55;
    const hiPin = hiRight
      ? `<text x="${(hiX - 4).toFixed(1)}" y="${Math.max(candleTop + 8, hiY + 2).toFixed(1)}" text-anchor="end" fill="#e2e8f0" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(maxHigh))} →</text>`
      : `<text x="${(hiX + 4).toFixed(1)}" y="${Math.max(candleTop + 8, hiY + 2).toFixed(1)}" text-anchor="start" fill="#e2e8f0" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">← ${escapeHtml(formatPerpPx(maxHigh))}</text>`;
    const loX = plotL + minLowIdx * step + step / 2;
    const loY = yOf(minLow);
    const loRight = minLowIdx > list.length * 0.55;
    const loPin = loRight
      ? `<text x="${(loX - 4).toFixed(1)}" y="${Math.min(candleBottom - 2, loY + 3).toFixed(1)}" text-anchor="end" fill="#e2e8f0" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(minLow))} →</text>`
      : `<text x="${(loX + 4).toFixed(1)}" y="${Math.min(candleBottom - 2, loY + 3).toFixed(1)}" text-anchor="start" fill="#e2e8f0" font-size="8.5" font-weight="600" font-family="ui-monospace, monospace">← ${escapeHtml(formatPerpPx(minLow))}</text>`;

    // Separator between candle and volume zones + Live Mark Price indicator overlay
    let markSvg = `<line x1="${plotL}" y1="${volTop - 5}" x2="${plotR}" y2="${volTop - 5}" stroke="rgba(255,255,255,0.06)" stroke-width="0.8" />`;
    const livePx = (market && Number(market.markPx)) || list[list.length - 1].c;
    if (Number.isFinite(livePx) && livePx > 0) {
      const ym = yOf(livePx);
      const pillY = Math.max(candleTop, Math.min(candleBottom - 14, ym - 7));
      markSvg += `<line x1="${plotL}" y1="${ym.toFixed(1)}" x2="${plotR}" y2="${ym.toFixed(1)}" stroke="#00ec97" stroke-dasharray="3 2" stroke-width="0.95" stroke-opacity="0.85" />` +
        `<rect x="292" y="${pillY.toFixed(1)}" width="60" height="14" rx="3" fill="rgba(6,10,20,0.88)" stroke="rgba(0,236,151,0.75)" stroke-width="0.75" />` +
        `<text x="322" y="${(pillY + 10).toFixed(1)}" text-anchor="middle" fill="#00ec97" font-size="8.2" font-weight="700" font-family="ui-monospace, monospace">${escapeHtml(formatPerpPx(livePx))}</text>`;
    }

    // Active Crosshair Overlay (always present so scrub updates coordinates without rebuilding SVG)
    const hasSel = Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < list.length;
    const chIdx = hasSel ? selectedIdx : 0;
    const selC = list[chIdx];
    const cx = plotL + chIdx * step + step / 2;
    const cy = yOf(selC.c);
    const chDisplay = hasSel ? 'inline' : 'none';
    const crosshairSvg =
      `<g id="perp-chart-crosshair" class="perp-chart-crosshair" display="${chDisplay}" style="display:${chDisplay};">` +
      `<line data-ch="v" x1="${cx.toFixed(1)}" y1="${candleTop}" x2="${cx.toFixed(1)}" y2="${volBottom}" stroke="#38bdf8" stroke-dasharray="2.5 2.5" stroke-width="1" stroke-opacity="0.9" />` +
      `<line data-ch="h" x1="${plotL}" y1="${cy.toFixed(1)}" x2="${plotR}" y2="${cy.toFixed(1)}" stroke="#38bdf8" stroke-dasharray="2.5 2.5" stroke-width="0.85" stroke-opacity="0.75" />` +
      `<circle data-ch="dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3" fill="#38bdf8" stroke="#06080f" stroke-width="1" />` +
      `</g>`;

    // Transparent Interactive Hit Targets per Candle
    const hitTargetsSvg = list.map((_, idx) => {
      const hx = plotL + idx * step;
      return `<rect x="${hx.toFixed(1)}" y="${candleTop}" width="${step.toFixed(1)}" height="${(volBottom - candleTop).toFixed(1)}" fill="transparent" class="perp-candle-hit" data-action="inspect-perp-candle" data-candle-idx="${idx}" />`;
    }).join('');

    return `<svg viewBox="0 0 ${W} ${H}" class="perp-chart-svg">${legendSvg}${gridSvg}${timeGridSvg}${candleSvg}${maSvg}${hiPin}${loPin}${markSvg}${crosshairSvg}${hitTargetsSvg}</svg>`;
  }

  function bindPerpChartGestures() {
    if (typeof document === 'undefined') return;
    const host = $('perp-chart-svg');
    if (!host || (host.dataset && host.dataset.gesturesBound === '1') || typeof host.addEventListener !== 'function') return;
    if (host.dataset) host.dataset.gesturesBound = '1';

    let mode = null; // 'pan' | 'scrub' | 'pinch' | 'scroll'
    let startX = 0;
    let startY = 0;
    let startOffset = 0;
    let startPinchDist = 0;
    let startVisibleCount = 48;
    let longPressTimer = null;
    let rafId = 0;
    let scrubRafId = 0;

    const clientXToCandleIdx = (clientX) => {
      const rect = typeof host.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : null;
      const list = getVisiblePerpCandles(getState().perp && getState().perp.candles);
      if (!rect || !rect.width || list.length === 0) return null;
      const rel = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.max(0, Math.min(list.length - 1, Math.floor(rel * list.length)));
    };

    const scheduleCrosshairUpdate = () => {
      const applyOverlay = () => {
        const st = getState();
        if (!updatePerpCrosshairOverlay(host, st.perp.candles, st.perp.inspectedCandleIdx)) {
          const market = getSelectedPerpMarket();
          host.innerHTML = renderPerpCandleSvg(st.perp.candles, market, st.perp.inspectedCandleIdx);
        }
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

    const scheduleChartRedraw = () => {
      if (typeof requestAnimationFrame !== 'function') {
        const st = getState();
        const market = getSelectedPerpMarket();
        host.innerHTML = renderPerpCandleSvg(st.perp.candles, market, st.perp.inspectedCandleIdx);
        renderPerpCandleDetailBar(st.perp.candles, st.perp.inspectedCandleIdx);
        return;
      }
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const st = getState();
        const market = getSelectedPerpMarket();
        host.innerHTML = renderPerpCandleSvg(st.perp.candles, market, st.perp.inspectedCandleIdx);
        renderPerpCandleDetailBar(st.perp.candles, st.perp.inspectedCandleIdx);
      });
    };

    host.addEventListener('touchstart', (e) => {
      if (!e.touches) return;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      const st = getState();
      if (e.touches.length === 2) {
        mode = 'pinch';
        startPinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        startVisibleCount = Number(st.perp.chartVisibleCount || 48);
        return;
      }
      if (e.touches.length === 1) {
        mode = null;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startOffset = Number(st.perp.chartOffsetFromEnd || 0);
        const touchX = e.touches[0].clientX;
        longPressTimer = setTimeout(() => {
          mode = 'scrub';
          const idx = clientXToCandleIdx(touchX);
          if (idx !== null) {
            st.perp.inspectedCandleIdx = idx;
            scheduleCrosshairUpdate();
          }
        }, 180);
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
        st.perp.chartVisibleCount = Math.max(20, Math.min(120, Math.round(startVisibleCount * scale)));
        scheduleChartRedraw();
        return;
      }
      if (e.touches.length === 1) {
        const curX = e.touches[0].clientX;
        const curY = e.touches[0].clientY;
        const dx = curX - startX;
        const dy = curY - startY;
        if (!mode) {
          if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            mode = 'scroll';
            return;
          }
          if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            mode = 'pan';
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
          const rect = typeof host.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : null;
          const width = (rect && rect.width) || 320;
          const visCount = Number(st.perp.chartVisibleCount || 48);
          const candleDelta = Math.round((dx / width) * visCount);
          const total = Array.isArray(st.perp.candles) ? st.perp.candles.length : 0;
          const maxOff = Math.max(0, total - Math.min(total, visCount));
          const nextOff = Math.max(0, Math.min(maxOff, startOffset + candleDelta));
          if (nextOff !== st.perp.chartOffsetFromEnd) {
            st.perp.chartOffsetFromEnd = nextOff;
            st.perp.inspectedCandleIdx = null;
            scheduleChartRedraw();
          }
        }
      }
    }, { passive: false });

    const endTouch = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      mode = null;
    };
    host.addEventListener('touchend', endTouch, { passive: true });
    host.addEventListener('touchcancel', endTouch, { passive: true });

    host.addEventListener('wheel', (e) => {
      if (!e || typeof e.deltaY !== 'number') return;
      const st = getState();
      const cur = Number(st.perp.chartVisibleCount || 48);
      const step = e.deltaY > 0 ? 6 : -6;
      const next = Math.max(20, Math.min(120, cur + step));
      if (next !== cur) {
        e.preventDefault();
        st.perp.chartVisibleCount = next;
        scheduleChartRedraw();
      }
    }, { passive: false });
  }

