/* =========================================================================
   Генератор індивідуальних даних варіантів + еталонні розв’язки
   Дані детерміновані: (номер роботи, варіант, сіль) → однакові числа
   у здобувача і викладача.
   ========================================================================= */
(function () {
  const E = {};

  /* ---------- утиліти ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(work, variant, salt) {
    const seed = (Math.imul(salt | 0, 2654435761) ^ Math.imul(work * 7919 + variant * 104729, 2246822507)) >>> 0;
    const r = mulberry32(seed);
    for (let i = 0; i < 5; i++) r();
    const o = {
      f: () => r(),
      R: (a, b) => a + (b - a) * r(),
      I: (a, b) => Math.floor(a + (b - a + 1) * r()),
      pick: (arr) => arr[Math.floor(r() * arr.length)],
      norm: () => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    };
    return o;
  }
  const round = (x, d = 0) => { const p = Math.pow(10, d); return Math.round(x * p) / p; };
  const roundSig = (x, s = 3) => { if (x === 0) return 0; const d = s - 1 - Math.floor(Math.log10(Math.abs(x))); return round(x, Math.max(-6, d)); };
  const decOf = (x) => { const s = String(x); const i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  E.round = round; E.roundSig = roundSig;

  E.cyrb53 = function (str, seed = 0) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507); h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507); h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };

  E.fmt = function (x, d) {
    if (x === null || x === undefined || x === '' || Number.isNaN(x)) return '—';
    if (typeof x !== 'number') return String(x);
    if (d === undefined) d = Math.abs(x) >= 1000 ? 0 : Math.abs(x) >= 10 ? 2 : Math.abs(x) >= 1 ? 3 : 4;
    const s = x.toFixed(d);
    const [i, f] = s.split('.');
    const ii = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return f ? ii + ',' + f : ii;
  };
  E.parseNum = function (v) {
    if (v === null || v === undefined) return NaN;
    const s = String(v).trim().replace(/\s| | /g, '').replace(',', '.');
    if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
    return parseFloat(s);
  };

  /* =========================== ПР1: матриця Вестера =========================== */
  const P1_EL = ["Проєктування (НДДКР)", "Виробництво", "Моніторинг і контроль", "Зворотний зв’язок", "Ресурсне забезпечення", "Персонал і компетенції"];
  function gen1(v, salt) {
    const g = makeRng(1, v, salt);
    let M, A, P, Q, K, iA, iP, iK;
    for (let t = 0; t < 500; t++) {
      M = P1_EL.map((_, i) => P1_EL.map((_, j) => (i === j ? 0 : g.I(0, 3))));
      A = M.map(r => sum(r));
      P = P1_EL.map((_, j) => sum(M.map(r => r[j])));
      if (A.some(x => x < 2) || P.some(x => x < 2)) continue;
      Q = A.map((a, i) => a / P[i]); K = A.map((a, i) => a * P[i]);
      const sq = [...Q].sort((a, b) => b - a), sk = [...K].sort((a, b) => b - a);
      if (sq[0] - sq[1] < 0.06 || sq[4] - sq[5] < 0.06 || sk[0] - sk[1] < 4) continue;
      iA = Q.indexOf(sq[0]); iP = Q.indexOf(sq[5]); iK = K.indexOf(sk[0]);
      if (iA === iK || iP === iK) continue;
      break;
    }
    const opts = P1_EL.map((n, i) => ({ v: String(i), t: n }));
    const fields = [];
    P1_EL.forEach((n, i) => fields.push({ key: 'A' + (i + 1), label: 'A' + (i + 1), unit: '', ref: A[i], abs: 0, dec: 0, group: 'A' }));
    P1_EL.forEach((n, i) => fields.push({ key: 'P' + (i + 1), label: 'P' + (i + 1), unit: '', ref: P[i], abs: 0, dec: 0, group: 'P' }));
    fields.push({ key: 'act', label: 'Активний елемент (max Q = A/P)', kind: 'select', options: opts, ref: String(iA) });
    fields.push({ key: 'crit', label: 'Критичний елемент (max A·P)', kind: 'select', options: opts, ref: String(iK) });
    fields.push({ key: 'pas', label: 'Пасивний елемент (min Q = A/P)', kind: 'select', options: opts, ref: String(iP) });
    return { data: { M, els: P1_EL }, fields, extra: { A, P, Q, K } };
  }

  /* =========================== ПР2: переозброєння =========================== */
  function gen2(v, salt) {
    const g = makeRng(2, v, salt);
    const shifts = g.pick([1, 2]);
    const F = shifts === 1 ? 1980 : 3960;
    const t0 = round(g.R(6, 18), 1);
    const t1 = round(t0 * g.R(0.45, 0.75), 1);
    const oee0 = round(g.R(0.52, 0.68), 2), oee1 = round(g.R(0.76, 0.88), 2);
    const d0 = round(g.R(3, 7), 1), d1 = round(g.R(0.5, 2), 1);
    const C0 = g.I(18, 60) * 10, C1 = round(C0 * g.R(0.74, 0.9), 0);
    const m = g.I(4, 15) * 10;
    const Q0 = F * 60 * oee0 / t0 * (1 - d0 / 100);
    const Q1 = F * 60 * oee1 / t1 * (1 - d1 / 100);
    const dQ = (Q1 / Q0 - 1) * 100;
    const Eff = ((C0 - C1) * Q1 + m * (Q1 - Q0)) / 1000; // тис. грн
    const K = Math.max(500, Math.round(Eff * g.R(1.6, 4.2) / 100) * 100);
    const T = K / Eff;
    const data = [
      ['Річний фонд часу обладнання F', F, 'год (' + shifts + ' зм.)'],
      ['Штучний час до переозброєння t₀', t0, 'хв'], ['Штучний час після t₁', t1, 'хв'],
      ['OEE до / після', oee0 + ' / ' + oee1, ''],
      ['Частка браку до δ₀ / після δ₁', d0 + ' / ' + d1, '%'],
      ['Собівартість деталі до C₀ / після C₁', C0 + ' / ' + C1, 'грн'],
      ['Маржинальний прибуток з додаткової деталі m', m, 'грн'],
      ['Капітальні вкладення K', K, 'тис. грн']
    ];
    const fields = [
      { key: 'Q0', label: 'Річний випуск придатних деталей до, Q₀', unit: 'шт/рік', ref: Q0, rel: 0.005, dec: 0 },
      { key: 'Q1', label: 'Річний випуск придатних деталей після, Q₁', unit: 'шт/рік', ref: Q1, rel: 0.005, dec: 0 },
      { key: 'dQ', label: 'Приріст продуктивності ΔQ', unit: '%', ref: dQ, abs: 0.5, dec: 1 },
      { key: 'E', label: 'Річний економічний ефект E', unit: 'тис. грн/рік', ref: Eff, rel: 0.01, dec: 1 },
      { key: 'T', label: 'Простий термін окупності T', unit: 'років', ref: T, abs: 0.05, dec: 2 }
    ];
    return { data: { table: data }, fields };
  }

  /* =========================== ПР3: регресія =========================== */
  const P3_FAM = {
    cut: { x: 'Швидкість різання v', xu: 'м/хв', xr: [80, 240], xd: 0, y: 'Стійкість інструменту T', yu: 'хв', b: [-3.0, -2.0], ym: [20, 60] },
    rough: { x: 'Подача s', xu: 'мм/об', xr: [0.05, 0.40], xd: 2, y: 'Шорсткість Ra', yu: 'мкм', b: [0.55, 0.95], ym: [1.2, 3.2] },
    heat: { x: 'Потужність нагріву P', xu: 'кВт', xr: [20, 80], xd: 0, y: 'Глибина зміцненого шару h', yu: 'мм', b: [0.5, 0.8], ym: [1.5, 3.0] },
    cool: { x: 'Час охолодження τ', xu: 'с', xr: [5, 75], xd: 0, y: 'Температура поверхні θ', yu: '°C', b: [-0.6, -0.3], ym: [250, 450] },
    weld: { x: 'Зварювальний струм I', xu: 'А', xr: [120, 330], xd: 0, y: 'Глибина проплавлення h', yu: 'мм', b: [1.1, 1.5], ym: [4, 7] },
    lweld: { x: 'Потужність лазера P', xu: 'кВт', xr: [0.6, 3.0], xd: 1, y: 'Глибина проплавлення h', yu: 'мм', b: [0.8, 1.2], ym: [1.0, 2.5] },
    cast: { x: 'Швидкість охолодження виливка w', xu: '°C/с', xr: [1, 22], xd: 0, y: 'Середній розмір зерна d', yu: 'мкм', b: [-0.5, -0.3], ym: [40, 80] },
    powder: { x: 'Тиск пресування / лиття p', xu: 'МПа', xr: [100, 800], xd: 0, y: 'Пористість П', yu: '%', b: [-0.9, -0.5], ym: [4, 9] },
    stamp: { x: 'Товщина листа s', xu: 'мм', xr: [0.5, 4.0], xd: 1, y: 'Зусилля штампування F', yu: 'кН', b: [0.9, 1.2], ym: [80, 200] },
    coat: { x: 'Час осадження τ', xu: 'хв', xr: [5, 75], xd: 0, y: 'Товщина покриття δ', yu: 'мкм', b: [0.5, 0.9], ym: [20, 60] },
    add: { x: 'Товщина шару h', xu: 'мкм', xr: [20, 90], xd: 0, y: 'Шорсткість Ra', yu: 'мкм', b: [0.7, 1.1], ym: [6, 14] },
    wear: { x: 'Шлях тертя L', xu: 'км', xr: [1, 15], xd: 0, y: 'Лінійний знос I', yu: 'мкм', b: [0.5, 0.9], ym: [15, 40] },
    comp: { x: 'Об’ємна частка волокна φ', xu: '%', xr: [30, 65], xd: 0, y: 'Міцність при розтягу σ', yu: 'МПа', b: [0.7, 1.0], ym: [400, 900] },
    drill: { x: 'Подача s', xu: 'мм/об', xr: [0.03, 0.17], xd: 2, y: 'Осьова сила P₀', yu: 'Н', b: [0.65, 0.85], ym: [1200, 3000] },
    laser: { x: 'Швидкість різання v', xu: 'м/хв', xr: [1.0, 6.0], xd: 1, y: 'Шорсткість кромки Rz', yu: 'мкм', b: [0.4, 0.7], ym: [15, 30] }
  };
  const P3_MAP = ['cut', 'heat', 'weld', 'cast', 'rough', 'wear', 'cool', 'add', 'cut', 'rough', 'weld', 'heat', 'stamp', 'coat', 'powder',
    'laser', 'cut', 'drill', 'powder', 'stamp', 'heat', 'rough', 'cut', 'coat', 'add', 'comp', 'stamp', 'lweld', 'powder', 'stamp'];
  function regress(xs, ys) {
    const X = xs.map(Math.log), Y = ys.map(Math.log), n = xs.length;
    const sX = sum(X), sY = sum(Y), sXY = sum(X.map((x, i) => x * Y[i])), sXX = sum(X.map(x => x * x));
    const b = (n * sXY - sX * sY) / (n * sXX - sX * sX);
    const la = (sY - b * sX) / n;
    const Ym = sY / n;
    const ssr = sum(X.map((x, i) => Math.pow(Y[i] - (la + b * x), 2)));
    const sst = sum(Y.map(y => Math.pow(y - Ym, 2)));
    return { a: Math.exp(la), b, R2: 1 - ssr / sst };
  }
  E.regress = regress;
  function gen3(v, salt) {
    const g = makeRng(3, v, salt);
    const f = P3_FAM[P3_MAP[(v - 1) % 30]];
    const n = 8;
    const b = g.R(f.b[0], f.b[1]);
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(round(f.xr[0] + (f.xr[1] - f.xr[0]) * i / (n - 1), f.xd));
    const xm = Math.sqrt(xs[0] * xs[n - 1]);
    const a = g.R(f.ym[0], f.ym[1]) / Math.pow(xm, b);
    const ys = xs.map(x => roundSig(a * Math.pow(x, b) * Math.exp(0.035 * g.norm()), 3));
    let xstar = round(f.xr[0] + (f.xr[1] - f.xr[0]) * g.R(0.28, 0.72), f.xd + 1);
    if (xs.includes(xstar)) xstar = round(xstar + Math.pow(10, -(f.xd + 1)) * 3, f.xd + 1);
    const r = regress(xs, ys);
    const yp = r.a * Math.pow(xstar, r.b);
    const fields = [
      { key: 'b', label: 'Показник степеня b', unit: '', ref: r.b, abs: Math.max(0.01, Math.abs(r.b) * 0.01), dec: 4 },
      { key: 'lna', label: 'Вільний член ln a', unit: '', ref: Math.log(r.a), abs: 0.03, dec: 4 },
      { key: 'R2', label: 'Коефіцієнт детермінації R²', unit: '', ref: r.R2, abs: 0.005, dec: 4 },
      { key: 'yp', label: 'Прогноз ŷ(x*) при x* = ' + E.fmt(xstar, f.xd + 1) + ' ' + f.xu, unit: f.yu, ref: yp, rel: 0.02, dec: 3 }
    ];
    return { data: { fam: f, xs, ys, xstar }, fields, extra: r };
  }

  /* =========================== ПР4: NPV/IRR =========================== */
  function npv(r, I0, cfs) { return -I0 + sum(cfs.map((c, t) => c / Math.pow(1 + r, t + 1))); }
  function irr(I0, cfs) {
    let lo = -0.99, hi = 5;
    if (npv(hi, I0, cfs) > 0) return NaN;
    for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (npv(m, I0, cfs) > 0) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  function dpp(r, I0, cfs) {
    let acc = -I0;
    for (let t = 0; t < cfs.length; t++) {
      const d = cfs[t] / Math.pow(1 + r, t + 1);
      if (acc + d >= 0) return t + (-acc) / d;
      acc += d;
    }
    return NaN;
  }
  E.npv = npv; E.irr = irr; E.dpp = dpp;
  function gen4(v, salt) {
    const g = makeRng(4, v, salt);
    let I0, r, cfs, N, IRR, D;
    for (let t = 0; t < 300; t++) {
      I0 = g.I(20, 180) * 100;
      r = g.pick([0.12, 0.14, 0.15, 0.16, 0.18, 0.20]);
      const k = g.R(0.24, 0.40), gr = g.R(-0.06, 0.08);
      cfs = [];
      for (let y = 0; y < 5; y++) cfs.push(Math.round(I0 * k * Math.pow(1 + gr, y) * g.R(0.92, 1.08) / 10) * 10);
      N = npv(r, I0, cfs); IRR = irr(I0, cfs); D = dpp(r, I0, cfs);
      if (N > 0.04 * I0 && D > 2 && D < 4.9) break;
    }
    const PIx = (N + I0) / I0;
    const ROI = (sum(cfs) - I0) / I0 * 100;
    const fields = [
      { key: 'NPV', label: 'Чиста теперішня вартість NPV', unit: 'тис. грн', ref: N, rel: 0.01, abs: 5, dec: 1 },
      { key: 'PI', label: 'Індекс прибутковості PI', unit: '', ref: PIx, abs: 0.01, dec: 3 },
      { key: 'IRR', label: 'Внутрішня норма дохідності IRR', unit: '%', ref: IRR * 100, abs: 0.3, dec: 2 },
      { key: 'DPP', label: 'Дисконтований термін окупності DPP', unit: 'років', ref: D, abs: 0.05, dec: 2 },
      { key: 'ROI', label: 'Рентабельність інвестицій ROI', unit: '%', ref: ROI, abs: 0.5, dec: 1 }
    ];
    return { data: { I0, r, cfs }, fields };
  }

  /* =========================== ПР5: сценарії =========================== */
  function gen5(v, salt) {
    const g = makeRng(5, v, salt);
    const K = g.I(30, 150) * 100;
    const n = g.I(5, 7);
    const r = g.pick([0.12, 0.14, 0.15, 0.16, 0.18, 0.20]);
    const OPEX = g.I(20, 90) * 10;
    const AF = (1 - Math.pow(1 + r, -n)) / r;
    const S = Math.round((OPEX + K / AF * g.R(1.12, 1.45)) / 10) * 10;
    const sc = [{ n: 'Песимістичний', k: 0.8, p: 0.25 }, { n: 'Базовий', k: 1.0, p: 0.5 }, { n: 'Оптимістичний', k: 1.15, p: 0.25 }];
    const NPVs = sc.map(s => -K + (s.k * S - OPEX) * AF);
    const EN = sum(NPVs.map((x, i) => x * sc[i].p));
    const Sb = K / AF + OPEX;
    const fields = [
      { key: 'AF', label: 'Коефіцієнт ануїтету AF', unit: '', ref: AF, abs: 0.002, dec: 4 },
      { key: 'Np', label: 'NPV песимістичного сценарію', unit: 'тис. грн', ref: NPVs[0], rel: 0.01, abs: 10, dec: 1 },
      { key: 'Nb', label: 'NPV базового сценарію', unit: 'тис. грн', ref: NPVs[1], rel: 0.01, abs: 10, dec: 1 },
      { key: 'No', label: 'NPV оптимістичного сценарію', unit: 'тис. грн', ref: NPVs[2], rel: 0.01, abs: 10, dec: 1 },
      { key: 'EN', label: 'Очікуване значення E[NPV]', unit: 'тис. грн', ref: EN, rel: 0.01, abs: 10, dec: 1 },
      { key: 'Sb', label: 'Точка беззбитковості за річною економією S*', unit: 'тис. грн/рік', ref: Sb, rel: 0.01, dec: 1 }
    ];
    return { data: { K, n, r, OPEX, S, sc }, fields };
  }

  /* =========================== ПР6: поверхня відгуку =========================== */
  const P6_FAM = {
    mill: ['Швидкість різання v', 'м/хв', 200, 80, 'Подача на зуб s_z', 'мм/зуб', 0.10, 0.05, 'Шорсткість Ra', 'мкм', [0.6, 1.4]],
    cast: ['Температура заливки T', '°C', 720, 40, 'Швидкість охолодження w', '°C/с', 10, 5, 'Пористість П', '%', [1.0, 3.0]],
    diecast: ['Температура розплаву T', '°C', 680, 30, 'Тиск підпресування p', 'МПа', 60, 20, 'Пористість П', '%', [0.5, 1.8]],
    weld: ['Зварювальний струм I', 'А', 220, 40, 'Швидкість зварювання v_зв', 'м/год', 25, 8, 'Залишкова деформація Δ', 'мм', [0.4, 1.0]],
    grind: ['Швидкість круга v_к', 'м/с', 35, 10, 'Поперечна подача s_п', 'мм/хід', 0.02, 0.01, 'Шорсткість Ra', 'мкм', [0.2, 0.5]],
    heat: ['Температура нагріву T', '°C', 850, 30, 'Час витримки τ', 'хв', 40, 15, 'Відхилення твердості ΔHRC', 'од.', [0.5, 1.5]],
    cool: ['Витрата охолоджувача Q', 'л/хв', 40, 15, 'Температура середовища T_с', '°C', 40, 20, 'Залишкові напруження σ', 'МПа', [60, 120]],
    lasercut: ['Потужність лазера P', 'кВт', 3, 1, 'Швидкість різання v', 'м/хв', 3, 1.5, 'Шорсткість кромки Rz', 'мкм', [8, 16]],
    plasma: ['Сила струму I', 'А', 130, 30, 'Швидкість різання v', 'м/хв', 2.5, 1, 'Конусність різу', '°', [0.8, 1.6]],
    stamp: ['Швидкість повзуна v', 'мм/с', 60, 30, 'Зазор між пуансоном і матрицею z', '% s', 8, 3, 'Похибка форми δ', 'мм', [0.05, 0.15]],
    hotstamp: ['Температура заготовки T', '°C', 1150, 50, 'Швидкість деформування v', 'мм/с', 80, 30, 'Похибка форми δ', 'мм', [0.1, 0.3]],
    add: ['Потужність лазера P', 'Вт', 250, 60, 'Швидкість сканування v_ск', 'мм/с', 900, 300, 'Пористість П', '%', [0.2, 0.8]],
    coat: ['Густина струму j', 'А/дм²', 3, 1.5, 'Час осадження τ', 'хв', 40, 15, 'Нерівномірність товщини', '%', [4, 9]],
    spray: ['Потужність плазмотрона N', 'кВт', 40, 10, 'Дистанція напилення L', 'мм', 120, 30, 'Пористість покриття П', '%', [2, 5]],
    wear: ['Навантаження F', 'Н', 300, 150, 'Швидкість ковзання v', 'м/с', 1.5, 0.8, 'Інтенсивність зношування I·10⁹', '', [2, 5]],
    line: ['Такт лінії t', 'с', 40, 10, 'Ємність міжопераційного буфера B', 'шт', 20, 10, 'Собівартість одиниці C', 'грн', [60, 110]],
    drill: ['Швидкість різання v', 'м/хв', 40, 15, 'Подача s', 'мм/об', 0.06, 0.03, 'Відведення осі отвору', 'мм/100 мм', [0.05, 0.15]],
    comp: ['Швидкість різання v', 'м/хв', 300, 100, 'Подача s_z', 'мм/зуб', 0.06, 0.03, 'Ширина зони розшарування', 'мм', [0.2, 0.6]],
    edm: ['Сила струму імпульсу I', 'А', 12, 6, 'Тривалість імпульсу t_і', 'мкс', 100, 50, 'Шорсткість Ra', 'мкм', [1.5, 3.5]],
    turn: ['Швидкість різання v', 'м/хв', 180, 60, 'Подача s', 'мм/об', 0.2, 0.1, 'Шорсткість Ra', 'мкм', [0.8, 2.0]],
    lweld: ['Потужність лазера P', 'кВт', 2, 0.8, 'Швидкість зварювання v', 'м/хв', 3, 1.5, 'Ширина ЗТВ', 'мм', [0.5, 1.2]]
  };
  const P6_MAP = ['mill', 'cast', 'weld', 'grind', 'heat', 'lasercut', 'stamp', 'mill', 'add', 'lasercut', 'add', 'cool', 'plasma', 'mill', 'coat',
    'line', 'stamp', 'spray', 'wear', 'add', 'hotstamp', 'drill', 'diecast', 'lweld', 'stamp', 'comp', 'edm', 'diecast', 'turn', 'hotstamp'];
  function solveStat(c) {
    const a11 = 2 * c.b11, a12 = c.b12, a22 = 2 * c.b22;
    const det = a11 * a22 - a12 * a12;
    const x1 = (-c.b1 * a22 + c.b2 * a12) / det;
    const x2 = (-c.b2 * a11 + c.b1 * a12) / det;
    return [x1, x2];
  }
  function yModel(c, x1, x2) { return c.b0 + c.b1 * x1 + c.b2 * x2 + c.b12 * x1 * x2 + c.b11 * x1 * x1 + c.b22 * x2 * x2; }
  E.yModel = yModel;
  function gen6(v, salt) {
    const g = makeRng(6, v, salt);
    const F = P6_FAM[P6_MAP[(v - 1) % 30]];
    const fam = { x1: F[0], u1: F[1], c1: F[2], h1: F[3], x2: F[4], u2: F[5], c2: F[6], h2: F[7], y: F[8], yu: F[9] };
    const ymin = g.R(F[10][0], F[10][1]);
    const s1 = g.R(-0.7, 0.7), s2 = g.R(-0.7, 0.7);
    const B11 = ymin * g.R(0.25, 0.6), B22 = ymin * g.R(0.25, 0.6), B12 = ymin * g.R(-0.15, 0.15);
    const raw = {
      b0: ymin + B11 * s1 * s1 + B22 * s2 * s2 + B12 * s1 * s2,
      b1: -2 * B11 * s1 - B12 * s2, b2: -2 * B22 * s2 - B12 * s1,
      b12: B12, b11: B11, b22: B22
    };
    const c = {}; Object.keys(raw).forEach(k => (c[k] = roundSig(raw[k], 4)));
    const [x1, x2] = solveStat(c);
    const ys = yModel(c, x1, x2);
    const X1 = fam.c1 + x1 * fam.h1, X2 = fam.c2 + x2 * fam.h2;
    const dY = (c.b0 - ys) / c.b0 * 100;
    const m = (vv) => Math.max(0.01, Math.abs(vv) * 0.01);
    const tool = (/\(([^)]+)\)\s*\.?\s*$/.exec(window.ITS.WORKS[5].variants[v - 1]) || [])[1] || '';
    const fields = [
      { key: 'x1', label: 'Оптимум у кодованих змінних x₁*', unit: '', ref: x1, abs: 0.01, dec: 3 },
      { key: 'x2', label: 'Оптимум у кодованих змінних x₂*', unit: '', ref: x2, abs: 0.01, dec: 3 },
      { key: 'X1', label: fam.x1 + ' (натуральне) X₁*', unit: fam.u1, ref: X1, abs: Math.max(0.01 * fam.h1, 1e-4), dec: decOf(fam.h1) + 2 },
      { key: 'X2', label: fam.x2 + ' (натуральне) X₂*', unit: fam.u2, ref: X2, abs: Math.max(0.01 * fam.h2, 1e-4), dec: decOf(fam.h2) + 3 },
      { key: 'ys', label: fam.y + ' в оптимумі y*', unit: fam.yu, ref: ys, abs: m(ys), dec: 4 },
      { key: 'dY', label: 'Покращення відносно центру плану Δ', unit: '%', ref: dY, abs: 0.5, dec: 2 }
    ];
    return { data: { fam, c, tool }, fields };
  }

  /* =========================== ПР7: CPM + кошторис =========================== */
  const P7_TASKS = [
    { id: 'A', n: 'Розроблення ТЗ', pre: [] },
    { id: 'B', n: 'Кошторис і техніко-економічне обґрунтування', pre: ['A'] },
    { id: 'C', n: 'Закупівля та поставка обладнання', pre: ['B'] },
    { id: 'D', n: 'Підготовка виробничої ділянки', pre: ['A'] },
    { id: 'E', n: 'Навчання персоналу', pre: ['B'] },
    { id: 'F', n: 'Монтаж обладнання', pre: ['C', 'D'] },
    { id: 'G', n: 'Пусконалагоджувальні роботи', pre: ['F'] },
    { id: 'H', n: 'Дослідна експлуатація та приймання', pre: ['G', 'E'] }
  ];
  function cpm(d) {
    const es = {}, ef = {};
    P7_TASKS.forEach(t => { es[t.id] = t.pre.length ? Math.max(...t.pre.map(p => ef[p])) : 0; ef[t.id] = es[t.id] + d[t.id]; });
    const T = Math.max(...Object.values(ef));
    const lf = {}, ls = {};
    [...P7_TASKS].reverse().forEach(t => {
      const succ = P7_TASKS.filter(s => s.pre.includes(t.id));
      lf[t.id] = succ.length ? Math.min(...succ.map(s => ls[s.id])) : T;
      ls[t.id] = lf[t.id] - d[t.id];
    });
    const tf = {}; P7_TASKS.forEach(t => (tf[t.id] = ls[t.id] - es[t.id]));
    const cp = P7_TASKS.filter(t => tf[t.id] === 0).map(t => t.id).join('');
    return { es, ef, ls, lf, tf, T, cp };
  }
  E.P7_TASKS = P7_TASKS; E.cpm = cpm;
  function gen7(v, salt) {
    const g = makeRng(7, v, salt);
    let d, res;
    const target = g.pick(['ABCFGH', 'ADFGH', 'ABEH', 'ABCFGH', 'ADFGH']);
    for (let t = 0; t < 2000; t++) {
      d = { A: g.I(2, 4), B: g.I(1, 3), C: g.I(3, 10), D: g.I(3, 12), E: g.I(2, 14), F: g.I(2, 5), G: g.I(1, 3), H: g.I(2, 4) };
      res = cpm(d);
      const paths = [d.A + d.B + d.C + d.F + d.G + d.H, d.A + d.D + d.F + d.G + d.H, d.A + d.B + d.E + d.H].sort((a, b) => b - a);
      if (paths[0] - paths[1] >= 1 && res.cp === target) break;
    }
    const eq = g.I(20, 120) * 100;
    const mont = g.I(8, 15), proj = g.I(3, 6);
    const sw = g.I(10, 90) * 10, tr = g.I(5, 30) * 10;
    const res_p = g.pick([8, 10, 12, 15]);
    const base = eq + eq * mont / 100 + eq * proj / 100 + sw + tr;
    const total = base * (1 + res_p / 100);
    const fields = [
      { key: 'T', label: 'Тривалість проєкту T', unit: 'тижн.', ref: res.T, abs: 0, dec: 0 },
      { key: 'cp', label: 'Критичний шлях (літери робіт, напр. ABCFGH)', kind: 'path', ref: res.cp },
      { key: 'tfC', label: 'Повний резерв роботи C', unit: 'тижн.', ref: res.tf.C, abs: 0, dec: 0 },
      { key: 'tfD', label: 'Повний резерв роботи D', unit: 'тижн.', ref: res.tf.D, abs: 0, dec: 0 },
      { key: 'tfE', label: 'Повний резерв роботи E', unit: 'тижн.', ref: res.tf.E, abs: 0, dec: 0 },
      { key: 'esF', label: 'Ранній початок монтажу ES(F)', unit: 'тижн.', ref: res.es.F, abs: 0, dec: 0 },
      { key: 'bud', label: 'Кошторисна вартість з резервом', unit: 'тис. грн', ref: total, rel: 0.005, dec: 1 }
    ];
    return { data: { d, budget: { eq, mont, proj, sw, tr, res: res_p } }, fields, extra: res };
  }

  const GENS = { 1: gen1, 2: gen2, 3: gen3, 4: gen4, 5: gen5, 6: gen6, 7: gen7 };
  const cache = {};
  E.gen = function (work, variant, salt) {
    const k = work + ':' + variant + ':' + salt;
    if (!cache[k]) cache[k] = GENS[work](variant, salt);
    return cache[k];
  };

  /* ---------- перевірка відповідей ---------- */
  const LAT = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'а': 'A', 'в': 'B', 'с': 'C', 'е': 'E', 'н': 'H', 'Д': 'D', 'Г': 'G', 'Ф': 'F' };
  E.normPath = (s) => String(s || '').split('').map(ch => LAT[ch] || ch).join('').toUpperCase().replace(/[^A-H]/g, '');
  E.checkField = function (f, val) {
    if (val === undefined || val === null || String(val).trim() === '') return { filled: false, ok: false };
    if (f.kind === 'select') return { filled: true, ok: String(val) === String(f.ref) };
    if (f.kind === 'path') return { filled: true, ok: E.normPath(val) === f.ref };
    const x = E.parseNum(val);
    if (Number.isNaN(x)) return { filled: true, ok: false, bad: true };
    const tol = Math.max(f.abs || 0, (f.rel || 0) * Math.abs(f.ref), 1e-9);
    return { filled: true, ok: Math.abs(x - f.ref) <= tol + 1e-12 };
  };
  E.check = function (work, variant, salt, answers) {
    const g = E.gen(work, variant, salt);
    const items = g.fields.map(f => ({ f, val: (answers || {})[f.key], ...E.checkField(f, (answers || {})[f.key]) }));
    return { items, correct: items.filter(i => i.ok).length, filled: items.filter(i => i.filled).length, total: items.length };
  };
  E.refText = function (f) {
    if (f.kind === 'select') return (f.options.find(o => o.v === f.ref) || {}).t;
    if (f.kind === 'path') return f.ref;
    return E.fmt(f.ref, f.dec);
  };

  window.ITSEngine = E;
})();
