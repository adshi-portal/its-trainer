/* Легкі SVG-графіки без зовнішніх бібліотек */
(function () {
  const E = window.ITSEngine;
  const Ch = {};
  function nice(min, max, n = 5) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const t = []; for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10));
    return { lo, hi, t, step };
  }
  const f = (v) => E.fmt(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : Math.abs(v) >= 1 ? 2 : 3);
  const fs = (v, step) => { if (Math.abs(v) < 1e-12) return '0'; const d = Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9))); return E.fmt(v, d); };
  function frame(W, H, P, xs, ys, xl, yl) {
    const sx = (v) => P.l + (v - xs.lo) / (xs.hi - xs.lo) * (W - P.l - P.r);
    const sy = (v) => H - P.b - (v - ys.lo) / (ys.hi - ys.lo) * (H - P.t - P.b);
    let g = '';
    ys.t.forEach(v => { g += `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(v)}" y2="${sy(v)}" class="ch-grid"/><text x="${P.l - 8}" y="${sy(v) + 4}" text-anchor="end" class="ch-tick">${fs(v, ys.step)}</text>`; });
    xs.t.forEach(v => { g += `<text x="${sx(v)}" y="${H - P.b + 16}" text-anchor="middle" class="ch-tick">${fs(v, xs.step || 1)}</text>`; });
    g += `<line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" class="ch-axis"/>`;
    if (xl) g += `<text x="${(P.l + W - P.r) / 2}" y="${H - 6}" text-anchor="middle" class="ch-label">${xl}</text>`;
    if (yl) g += `<text x="14" y="${(P.t + H - P.b) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(P.t + H - P.b) / 2})" class="ch-label">${yl}</text>`;
    return { sx, sy, g };
  }

  Ch.scatterFit = function (xs, ys, fit, xstar, xl, yl) {
    const W = 620, H = 320, P = { l: 64, r: 18, t: 16, b: 44 };
    const xr = nice(Math.min(...xs), Math.max(...xs)), yr = nice(Math.min(...ys) * 0.9, Math.max(...ys) * 1.08);
    const F = frame(W, H, P, xr, yr, xl, yl);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${F.g}`;
    if (fit) {
      let pts = [];
      for (let i = 0; i <= 80; i++) { const x = xr.lo + (xr.hi - xr.lo) * i / 80; if (x <= 0) continue; const y = fit(x); if (isFinite(y) && y >= yr.lo && y <= yr.hi) pts.push(F.sx(x).toFixed(1) + ',' + F.sy(y).toFixed(1)); }
      if (pts.length > 1) s += `<polyline points="${pts.join(' ')}" class="ch-line"/>`;
      if (xstar && isFinite(fit(xstar))) s += `<circle cx="${F.sx(xstar)}" cy="${F.sy(fit(xstar))}" r="6" class="ch-star"/>`;
    }
    xs.forEach((x, i) => { s += `<circle cx="${F.sx(x)}" cy="${F.sy(ys[i])}" r="4.5" class="ch-pt"/>`; });
    return s + '</svg>';
  };

  Ch.bars = function (vals, labels, yl) {
    const W = 620, H = 280, P = { l: 70, r: 14, t: 14, b: 40 };
    const yr = nice(Math.min(0, ...vals), Math.max(0, ...vals));
    const xs = { lo: 0, hi: vals.length, t: [] };
    const F = frame(W, H, P, xs, yr, '', yl);
    const bw = (W - P.l - P.r) / vals.length;
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">${F.g}`;
    vals.forEach((v, i) => {
      const y0 = F.sy(0), y1 = F.sy(v), x = P.l + i * bw + bw * 0.18;
      s += `<rect x="${x}" y="${Math.min(y0, y1)}" width="${bw * 0.64}" height="${Math.abs(y1 - y0)}" rx="4" class="${v < 0 ? 'ch-neg' : 'ch-bar'}"/>`;
      s += `<text x="${x + bw * 0.32}" y="${H - P.b + 16}" text-anchor="middle" class="ch-tick">${labels[i]}</text>`;
      s += `<text x="${x + bw * 0.32}" y="${v < 0 ? y1 + 14 : y1 - 5}" text-anchor="middle" class="ch-val">${E.fmt(v, 0)}</text>`;
    });
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${F.sy(0)}" y2="${F.sy(0)}" class="ch-axis"/>`;
    return s + '</svg>';
  };

  Ch.vester = function (A, P_, names) {
    const W = 560, H = 360, P = { l: 56, r: 18, t: 16, b: 44 };
    const mx = Math.max(...A, ...P_) + 1;
    const r = nice(0, mx);
    const F = frame(W, H, P, r, r, 'Пасивна сума P (залежність)', 'Активна сума A (вплив)');
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">${F.g}`;
    s += `<line x1="${F.sx(0)}" y1="${F.sy(0)}" x2="${F.sx(r.hi)}" y2="${F.sy(r.hi)}" class="ch-diag"/>`;
    s += `<text x="${F.sx(r.hi) - 4}" y="${F.sy(r.hi) + 14}" text-anchor="end" class="ch-tick">Q = 1</text>`;
    A.forEach((a, i) => {
      if (!isFinite(a) || !isFinite(P_[i])) return;
      s += `<circle cx="${F.sx(P_[i])}" cy="${F.sy(a)}" r="13" class="ch-node"/><text x="${F.sx(P_[i])}" y="${F.sy(a) + 4}" text-anchor="middle" class="ch-node-t">${i + 1}</text>`;
    });
    return s + '</svg>';
  };

  Ch.swot = function (X, Y) {
    const W = 360, H = 300, c = { x: W / 2, y: H / 2 }, k = 26;
    const cl = (v) => Math.max(-5, Math.min(5, v));
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart swot-plot">
      <rect x="${c.x}" y="20" width="${W / 2 - 20}" height="${H / 2 - 20}" class="q-so"/><rect x="20" y="20" width="${W / 2 - 20}" height="${H / 2 - 20}" class="q-wo"/>
      <rect x="20" y="${c.y}" width="${W / 2 - 20}" height="${H / 2 - 20}" class="q-wt"/><rect x="${c.x}" y="${c.y}" width="${W / 2 - 20}" height="${H / 2 - 20}" class="q-st"/>
      <line x1="20" x2="${W - 20}" y1="${c.y}" y2="${c.y}" class="ch-axis"/><line y1="20" y2="${H - 20}" x1="${c.x}" x2="${c.x}" class="ch-axis"/>
      <text x="${W - 26}" y="38" text-anchor="end" class="ch-label">SO · наступальна</text><text x="26" y="38" class="ch-label">WO · переорієнтації</text>
      <text x="26" y="${H - 28}" class="ch-label">WT · оборонна</text><text x="${W - 26}" y="${H - 28}" text-anchor="end" class="ch-label">ST · диверсифікації</text>
      <text x="${W - 22}" y="${c.y - 6}" text-anchor="end" class="ch-tick">S − W</text><text x="${c.x + 6}" y="30" class="ch-tick">O − T</text>`;
    if (isFinite(X) && isFinite(Y)) s += `<circle cx="${c.x + cl(X) * k}" cy="${c.y - cl(Y) * k}" r="9" class="ch-star"/>`;
    return s + '</svg>';
  };

  Ch.gantt = function (tasks, d, res) {
    const W = 680, rowH = 30, P = { l: 250, r: 16, t: 26, b: 30 };
    const H = P.t + P.b + tasks.length * rowH;
    const sx = (v) => P.l + v / res.T * (W - P.l - P.r);
    let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">`;
    for (let wk = 0; wk <= res.T; wk++) {
      if (res.T > 20 && wk % 2) continue;
      s += `<line x1="${sx(wk)}" x2="${sx(wk)}" y1="${P.t - 6}" y2="${H - P.b}" class="ch-grid"/><text x="${sx(wk)}" y="${P.t - 10}" text-anchor="middle" class="ch-tick">${wk}</text>`;
    }
    tasks.forEach((t, i) => {
      const y = P.t + i * rowH + 6, crit = res.tf[t.id] === 0;
      s += `<text x="8" y="${y + 13}" class="ch-tick"><tspan font-weight="700">${t.id}</tspan> ${t.n.length > 32 ? t.n.slice(0, 31) + '…' : t.n}</text>`;
      if (res.tf[t.id] > 0) s += `<rect x="${sx(res.ef[t.id])}" y="${y + 6}" width="${sx(res.lf[t.id]) - sx(res.ef[t.id])}" height="6" rx="3" class="ch-float"/>`;
      s += `<rect x="${sx(res.es[t.id])}" y="${y}" width="${Math.max(2, sx(res.ef[t.id]) - sx(res.es[t.id]))}" height="18" rx="5" class="${crit ? 'ch-crit' : 'ch-bar'}"/>`;
      s += `<text x="${sx(res.es[t.id]) + 6}" y="${y + 13}" class="ch-in">${d[t.id]}</text>`;
    });
    s += `<text x="${P.l}" y="${H - 8}" class="ch-tick">тижні · червоний — критичний шлях · смуга — резерв часу</text>`;
    return s + '</svg>';
  };

  /* кольорова карта для поверхні відгуку */
  const STOPS = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  Ch.color = function (t) {
    t = Math.max(0, Math.min(1, t)); const p = t * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(p)), u = p - i;
    const c = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * u));
    return c;
  };
  window.ITSCharts = Ch;
})();
