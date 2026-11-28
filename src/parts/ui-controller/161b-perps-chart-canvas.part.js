  let _canvasCheckDoc = null;
  let _canvasSupported = false;
  const _perpCanvasStateMap = typeof WeakMap === 'function' ? new WeakMap() : null;

  function canUsePerpChartCanvas() {
    if (typeof document === 'undefined' || !document || typeof document.createElement !== 'function') return false;
    if (_canvasCheckDoc === document) return _canvasSupported;
    _canvasCheckDoc = document;
    try {
      const probe = document.createElement('canvas');
      const ctx = probe && typeof probe.getContext === 'function' ? probe.getContext('2d') : null;
      _canvasSupported = Boolean(ctx && typeof ctx.fillRect === 'function' && typeof ctx.stroke === 'function');
    } catch (_) {
      _canvasSupported = false;
    }
    return _canvasSupported;
  }

  function ensurePerpChartCanvasState(host, cachedRect = null, skipResize = false) {
    if (!host || !canUsePerpChartCanvas()) return null;
    let cState = _perpCanvasStateMap ? _perpCanvasStateMap.get(host) : host._perpCanvasState;
    let canvas = cState && cState.canvas;
    const isAttached = Boolean(canvas && canvas.parentNode === host);
    if (!isAttached) {
      host.innerHTML = '';
      canvas = document.createElement('canvas');
      canvas.className = 'perp-chart-canvas';
      if (canvas.style) {
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
      }
      host.appendChild(canvas);
      const baseCanvas = document.createElement('canvas');
      cState = {
        canvas,
        ctx: canvas.getContext('2d'),
        baseCanvas,
        baseCtx: baseCanvas.getContext('2d'),
        baseKey: '',
        bmpW: 0,
        bmpH: 0
      };
      if (_perpCanvasStateMap) _perpCanvasStateMap.set(host, cState);
      else host._perpCanvasState = cState;
    }
    if (!cState || !cState.ctx || !cState.baseCtx) return null;

    if (!skipResize || !cState.bmpW || !cState.bmpH) {
      let cssW = cachedRect && cachedRect.width > 0 ? cachedRect.width : 0;
      let cssH = cachedRect && cachedRect.height > 0 ? cachedRect.height : 0;
      if ((!cssW || !cssH) && typeof host.getBoundingClientRect === 'function') {
        const r = host.getBoundingClientRect();
        if (r && r.width > 0) cssW = r.width;
        if (r && r.height > 0) cssH = r.height;
      }
      if (!cssW) cssW = 360;
      if (!cssH) cssH = Math.round(cssW * (216 / 360));
      const dpr = Math.min(
        (typeof window !== 'undefined' && Number(window.devicePixelRatio)) || 1,
        2
      );
      const nextW = Math.max(240, Math.round(cssW * dpr));
      const nextH = Math.max(120, Math.round(cssH * dpr));
      if (cState.bmpW !== nextW || cState.bmpH !== nextH) {
        cState.bmpW = nextW;
        cState.bmpH = nextH;
        cState.canvas.width = nextW;
        cState.canvas.height = nextH;
        cState.baseCanvas.width = nextW;
        cState.baseCanvas.height = nextH;
        cState.baseKey = '';
      }
    }
    return cState;
  }

  function drawCanvasRoundedRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
  }

  function drawPerpCandleCanvas(host, candles, market = null, selectedIdx = null, opts = null) {
    const cState = ensurePerpChartCanvasState(host, opts && opts.cachedRect, Boolean(opts && opts.skipResize));
    if (!cState) return false;
    const { ctx, baseCtx, baseCanvas, bmpW, bmpH } = cState;
    const fullList = Array.isArray(candles) ? candles : [];
    const st = getState();
    const rawVis = (opts && Number.isFinite(Number(opts.floatVisibleCount)))
      ? Number(opts.floatVisibleCount)
      : Number((st && st.perp && st.perp.chartVisibleCount) || 48);
    const visCount = Math.max(20, Math.min(140, rawVis));
    const maxOff = Math.max(0, fullList.length - Math.min(fullList.length, visCount));
    const rawOff = (opts && Number.isFinite(Number(opts.floatOffset)))
      ? Number(opts.floatOffset)
      : Number((st && st.perp && st.perp.chartOffsetFromEnd) || 0);
    const floatOff = Math.max(0, Math.min(maxOff, rawOff));

    const W = 360;
    const H = 216;
    const sx = bmpW / W;
    const sy = bmpH / H;

    if (fullList.length < 2) {
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(148,163,184,0.8)';
      ctx.font = '600 11.5px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('--', W / 2, H / 2);
      cState.baseKey = '';
      if (host.dataset) {
        host.dataset.candleCount = '0';
        host.dataset.selectedIdx = '';
      }
      return true;
    }

    const plotL = 6;
    const plotR = 354;
    const plotW = plotR - plotL;
    const candleTop = 18;
    const candleBottom = 152;
    const volTop = 160;
    const volBottom = 196;

    const isShort = fullList.length <= visCount;
    const endFloat = isShort ? fullList.length : (fullList.length - floatOff);
    const startFloat = isShort ? 0 : (endFloat - visCount);
    const step = isShort ? (plotW / fullList.length) : (plotW / visCount);
    const bw = Math.max(2.2, step * 0.62);

    const visStart = Math.max(0, Math.floor(startFloat));
    const visEnd = Math.min(fullList.length, Math.ceil(endFloat));
    const drawStart = Math.max(0, visStart - 1);
    const drawEnd = Math.min(fullList.length, visEnd + 1);

    const intVisCount = Math.round(visCount);
    const intEnd = Math.max(0, fullList.length - Math.round(floatOff));
    const intStart = Math.max(0, intEnd - intVisCount);
    const intList = fullList.slice(intStart, intEnd);

    let minLow = Infinity;
    let maxHigh = -Infinity;
    let minLowIdx = visStart;
    let maxHighIdx = visStart;
    let maxVol = 0;
    for (let i = visStart; i < visEnd; i++) {
      const c = fullList[i];
      if (!c) continue;
      if (c.l < minLow) { minLow = c.l; minLowIdx = i; }
      if (c.h > maxHigh) { maxHigh = c.h; maxHighIdx = i; }
      if (Number.isFinite(c.v) && c.v > maxVol) maxVol = c.v;
    }
    if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh)) {
      minLow = 0;
      maxHigh = 1;
    }
    const span = maxHigh - minLow || 1;
    const yOf = (p) => Math.max(candleTop, Math.min(candleBottom, candleBottom - ((p - minLow) / span) * (candleBottom - candleTop)));
    const xOf = (idx) => plotL + (idx - startFloat) * step + step / 2;

    const lastC = fullList[fullList.length - 1];
    const livePx = (market && Number(market.markPx)) || (lastC ? lastC.c : 0);
    const baseKey = [
      fullList.length,
      fullList[0] && fullList[0].t,
      lastC && lastC.t,
      lastC && lastC.o,
      lastC && lastC.h,
      lastC && lastC.l,
      lastC && lastC.c,
      lastC && lastC.v,
      startFloat.toFixed(3),
      visCount.toFixed(3),
      Number.isFinite(livePx) ? livePx : '',
      bmpW,
      bmpH
    ].join('|');

    if (cState.baseKey !== baseKey) {
      cState.baseKey = baseKey;
      const cachedMa = getCachedPerpMa(fullList);
      baseCtx.setTransform(sx, 0, 0, sy, 0, 0);
      baseCtx.clearRect(0, 0, W, H);

      // 4 Horizontal dashed price grid lines
      baseCtx.save();
      baseCtx.strokeStyle = 'rgba(255,255,255,0.06)';
      baseCtx.lineWidth = 0.7;
      baseCtx.setLineDash([2, 3]);
      for (const frac of [0, 1 / 3, 2 / 3, 1]) {
        const gy = candleTop + frac * (candleBottom - candleTop);
        baseCtx.beginPath();
        baseCtx.moveTo(plotL, gy);
        baseCtx.lineTo(plotR, gy);
        baseCtx.stroke();
      }

      // Vertical dashed time grid lines + bottom time labels
      const tickFracs = [0.16, 0.5, 0.96];
      const seenIdx = new Set();
      baseCtx.font = '500 8px ui-monospace, monospace';
      baseCtx.textBaseline = 'alphabetic';
      for (let k = 0; k < tickFracs.length; k++) {
        const idx = Math.max(visStart, Math.min(visEnd - 1, Math.floor(visStart + (visEnd - visStart) * tickFracs[k])));
        if (seenIdx.has(idx) || !fullList[idx]) continue;
        seenIdx.add(idx);
        const tx = Math.max(plotL + 4, Math.min(plotR - 4, xOf(idx)));
        baseCtx.strokeStyle = 'rgba(255,255,255,0.05)';
        baseCtx.beginPath();
        baseCtx.moveTo(tx, candleTop);
        baseCtx.lineTo(tx, volBottom);
        baseCtx.stroke();
        const lbl = formatPerpCandleTime(fullList[idx].t);
        if (lbl) {
          baseCtx.fillStyle = 'rgba(148,163,184,0.75)';
          baseCtx.textAlign = k === 0 ? 'left' : (k === 2 ? 'right' : 'center');
          baseCtx.fillText(lbl, tx, 209);
        }
      }
      baseCtx.restore();

      // Clip plot area for smooth fractional horizontal panning
      baseCtx.save();
      baseCtx.beginPath();
      baseCtx.rect(plotL, candleTop - 2, plotW, volBottom - candleTop + 4);
      baseCtx.clip();

      // Candlesticks & volume bars
      for (let i = drawStart; i < drawEnd; i++) {
        const c = fullList[i];
        if (!c) continue;
        const xc = xOf(i);
        const color = c.c >= c.o ? '#00ec97' : '#fb7185';
        const yH = yOf(c.h);
        const yL = yOf(c.l);
        const yO = yOf(c.o);
        const yC = yOf(c.c);
        const bodyTop = Math.min(yO, yC);
        const bodyH = Math.max(1.5, Math.abs(yO - yC));
        const xLeft = xc - bw / 2;

        baseCtx.strokeStyle = color;
        baseCtx.lineWidth = 1;
        baseCtx.beginPath();
        baseCtx.moveTo(xc, yH);
        baseCtx.lineTo(xc, yL);
        baseCtx.stroke();

        baseCtx.fillStyle = color;
        baseCtx.fillRect(xLeft, bodyTop, bw, bodyH);

        if (maxVol > 0 && Number.isFinite(c.v) && c.v > 0) {
          const vh = Math.max(1.5, (c.v / maxVol) * (volBottom - volTop));
          baseCtx.save();
          baseCtx.globalAlpha = 0.45;
          baseCtx.fillRect(xLeft, volBottom - vh, bw, vh);
          baseCtx.restore();
        }
      }

      // MA5 / MA10 / MA20 polylines
      const drawMa = (vals, color) => {
        if (drawEnd - drawStart < 2) return;
        baseCtx.strokeStyle = color;
        baseCtx.lineWidth = 1.15;
        baseCtx.lineJoin = 'round';
        baseCtx.lineCap = 'round';
        baseCtx.beginPath();
        for (let i = drawStart; i < drawEnd; i++) {
          const x = xOf(i);
          const y = yOf(vals[i]);
          if (i === drawStart) baseCtx.moveTo(x, y);
          else baseCtx.lineTo(x, y);
        }
        baseCtx.stroke();
      };
      drawMa(cachedMa.ma5, '#f59e0b');
      drawMa(cachedMa.ma10, '#38bdf8');
      drawMa(cachedMa.ma20, '#c084fc');
      baseCtx.restore();

      // MA legend header (pinned at top)
      const refIdx = Math.max(0, Math.min(fullList.length - 1, visEnd - 1));
      baseCtx.font = '600 8.2px ui-monospace, monospace';
      baseCtx.textAlign = 'left';
      baseCtx.textBaseline = 'alphabetic';
      baseCtx.fillStyle = '#f59e0b';
      baseCtx.fillText(`MA5:${formatPerpPx(cachedMa.ma5[refIdx])}`, 6, 11);
      baseCtx.fillStyle = '#38bdf8';
      baseCtx.fillText(`MA10:${formatPerpPx(cachedMa.ma10[refIdx])}`, 118, 11);
      baseCtx.fillStyle = '#c084fc';
      baseCtx.fillText(`MA20:${formatPerpPx(cachedMa.ma20[refIdx])}`, 232, 11);

      // In-chart High / Low callout pins
      baseCtx.font = '600 8.5px ui-monospace, monospace';
      baseCtx.fillStyle = '#e2e8f0';
      const hiX = Math.max(plotL + 4, Math.min(plotR - 4, xOf(maxHighIdx)));
      const hiY = Math.max(candleTop + 8, yOf(maxHigh) + 2);
      const hiRight = (hiX - plotL) > plotW * 0.55;
      baseCtx.textAlign = hiRight ? 'right' : 'left';
      baseCtx.fillText(hiRight ? `${formatPerpPx(maxHigh)} →` : `← ${formatPerpPx(maxHigh)}`, hiRight ? hiX - 4 : hiX + 4, hiY);

      const loX = Math.max(plotL + 4, Math.min(plotR - 4, xOf(minLowIdx)));
      const loY = Math.min(candleBottom - 2, yOf(minLow) + 3);
      const loRight = (loX - plotL) > plotW * 0.55;
      baseCtx.textAlign = loRight ? 'right' : 'left';
      baseCtx.fillText(loRight ? `${formatPerpPx(minLow)} →` : `← ${formatPerpPx(minLow)}`, loRight ? loX - 4 : loX + 4, loY);

      // Zone separator + lightweight live mark price dashed line (no obscuring right-side box)
      baseCtx.strokeStyle = 'rgba(255,255,255,0.06)';
      baseCtx.lineWidth = 0.8;
      baseCtx.beginPath();
      baseCtx.moveTo(plotL, volTop - 4);
      baseCtx.lineTo(plotR, volTop - 4);
      baseCtx.stroke();

      if (Number.isFinite(livePx) && livePx > 0) {
        const ym = yOf(livePx);
        baseCtx.save();
        baseCtx.strokeStyle = 'rgba(0,236,151,0.85)';
        baseCtx.lineWidth = 0.95;
        baseCtx.setLineDash([3, 2]);
        baseCtx.beginPath();
        baseCtx.moveTo(plotL, ym);
        baseCtx.lineTo(plotR, ym);
        baseCtx.stroke();
        baseCtx.restore();
      }
    }

    // Blit cached base layer in <0.2ms, then draw dynamic crosshair overlay if selected
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bmpW, bmpH);
    ctx.drawImage(baseCanvas, 0, 0);

    const hasSel = Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < intList.length;
    if (hasSel) {
      const selC = intList[selectedIdx];
      const cx = plotL + selectedIdx * (plotW / intList.length) + (plotW / intList.length) / 2;
      const cy = yOf(selC.c);
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.save();
      ctx.strokeStyle = 'rgba(56,189,248,0.88)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2.5, 2.5]);
      ctx.beginPath();
      ctx.moveTo(cx, candleTop);
      ctx.lineTo(cx, volBottom);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(56,189,248,0.75)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.moveTo(plotL, cy);
      ctx.lineTo(plotR, cy);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#06080f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const xPillW = 58;
      const xPillX = Math.max(plotL, Math.min(plotR - xPillW, cx - xPillW / 2));
      drawCanvasRoundedRect(ctx, xPillX, volBottom + 2, xPillW, 14, 3);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '600 7.8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(formatPerpCandleTime(selC.t) || `#${selectedIdx + 1}`, xPillX + xPillW / 2, volBottom + 12);

      const yPillY = Math.max(candleTop, Math.min(candleBottom - 14, cy - 7));
      drawCanvasRoundedRect(ctx, 292, yPillY, 62, 14, 3);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 8px ui-monospace, monospace';
      ctx.fillText(formatPerpPx(selC.c), 323, yPillY + 10);
      ctx.restore();
    }

    if (host.dataset) {
      host.dataset.candleCount = String(intList.length);
      host.dataset.selectedIdx = hasSel ? String(selectedIdx) : '';
    }
    return true;
  }

  function renderPerpChartHost(host, candles, market = null, selectedIdx = null, forceRedraw = false) {
    if (!host) return;
    const st = getState();
    const list = Array.isArray(candles) ? candles : [];
    const lastC = list.length ? list[list.length - 1] : null;
    const coin = (st && st.perp && st.perp.selectedCoin) || '';
    const iv = (st && st.perp && st.perp.chartInterval) || '15m';
    const off = (st && st.perp && st.perp.chartOffsetFromEnd) || 0;
    const vis = (st && st.perp && st.perp.chartVisibleCount) || 48;
    const markPx = (market && market.markPx) || '';
    const lang = (st && st.lang) || 'zh';
    const useCanvas = canUsePerpChartCanvas();
    const sig = [
      coin, iv, list.length,
      lastC ? lastC.t : 0, lastC ? lastC.o : 0, lastC ? lastC.h : 0, lastC ? lastC.l : 0, lastC ? lastC.c : 0, lastC ? lastC.v : 0,
      markPx, off, vis, selectedIdx ?? '', lang, useCanvas ? 'c' : 's'
    ].join('|');

    if (useCanvas) {
      const hasCanvas = typeof host.querySelector === 'function' && Boolean(host.querySelector('canvas.perp-chart-canvas'));
      if (!forceRedraw && hasCanvas && host.dataset && host.dataset.chartSig === sig) return;
      drawPerpCandleCanvas(host, list, market, selectedIdx);
      if (host.dataset) host.dataset.chartSig = sig;
      return;
    }

    if (!forceRedraw && host.innerHTML && host.dataset && host.dataset.chartSig === sig) return;
    host.innerHTML = renderPerpCandleSvg(list, market, selectedIdx);
    if (host.dataset) {
      host.dataset.chartSig = sig;
      host.dataset.candleCount = String(getVisiblePerpCandles(list).length);
      host.dataset.selectedIdx = Number.isInteger(selectedIdx) ? String(selectedIdx) : '';
    }
  }
