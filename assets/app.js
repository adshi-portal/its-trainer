/* =========================================================================
   Тренажер ІТС — інтерфейс здобувача і викладача (vanilla JS, без сервера)
   ========================================================================= */
(function () {
  'use strict';
  const C = window.ITS.CONFIG, WORKS = window.ITS.WORKS, E = window.ITSEngine, Ch = window.ITSCharts;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  const wc = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
  const W = (id) => WORKS.find(w => w.id === +id);
  const LS = 'its-trainer-state-v1', LT = 'its-teacher-v1', LTH = 'its-theme';
  const APP = 'ITS-trainer';
  const app = () => $('#app');

  /* ------------------------------------------------------------ сховище */
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Не вдалося зберегти у браузері', 'bad'); return false; } };
  let S = load(LS) || { student: null, works: {} };
  let T = load(LT) || { subs: {}, grades: {} };
  let tSave;
  function save() { clearTimeout(tSave); tSave = setTimeout(() => { if (store(LS, S)) flashSaved(); }, 300); }
  function saveT() { store(LT, T); }
  const emptyWork = () => ({ fields: {}, tables: {}, calc: {}, calcAttempts: 0, calcChecked: null, quiz: { answers: {}, checked: false, last: null, best: null, attempts: 0 }, log: [], startedAt: null, updatedAt: null, submittedAt: null });
  function ws(id) { S.works[id] = S.works[id] || emptyWork(); return S.works[id]; }
  const wsOf = (sub, id) => (sub.works && sub.works[id]) || emptyWork();
  function touch(id) { const w = ws(id), now = new Date().toISOString(); if (!w.startedAt) w.startedAt = now; w.updatedAt = now; }
  const variantOf = (num) => ((Math.max(1, num | 0) - 1) % C.variantsCount) + 1;
  const saltOf = (st) => st.salt || C.salt;

  /* ------------------------------------------------------------ метрики */
  function rowFilled(it, r) {
    if (!r) return false;
    return it.columns.filter(c => c.type !== 'computed').every(c => {
      const v = r[c.key]; if (v === undefined || String(v).trim() === '') return false;
      return c.type === 'num' ? !Number.isNaN(E.parseNum(v)) : true;
    });
  }
  const int15 = (v) => { const x = E.parseNum(v); return Number.isInteger(x) && x >= 1 && x <= 5 ? x : NaN; };
  const riskValid = (r) => r && String(r.name || '').trim() && !Number.isNaN(int15(r.p)) && !Number.isNaN(int15(r.i));
  const riskLevel = (s) => s >= 15 ? ['high', 'високий'] : s >= 8 ? ['mid', 'середній'] : ['low', 'низький'];
  const QN = { S: 'Сильні сторони (S)', W: 'Слабкі сторони (W)', O: 'Можливості (O)', T: 'Загрози (T)' };
  function swotCalc(sw) {
    sw = sw || { S: [], W: [], O: [], T: [] };
    const q = {}; let fr = 0;
    ['S', 'W', 'O', 'T'].forEach(k => {
      const rows = (sw[k] || []).filter(r => r && String(r.f || '').trim() && E.parseNum(r.w) > 0 && !Number.isNaN(int15(r.s)));
      const sumW = rows.reduce((s, r) => s + E.parseNum(r.w), 0);
      const score = rows.reduce((s, r) => s + E.parseNum(r.w) * int15(r.s), 0);
      const wOk = Math.abs(sumW - 1) <= 0.011;
      q[k] = { n: rows.length, sumW, score, wOk };
      fr += Math.min(1, rows.length / 3) * (wOk ? 1 : 0.5);
    });
    const X = q.S.score - q.W.score, Y = q.O.score - q.T.score;
    const strat = X >= 0 && Y >= 0 ? 'SO — наступальна: використання сильних сторін для реалізації можливостей'
      : X >= 0 ? 'ST — диверсифікації: використання сильних сторін для протидії загрозам'
        : Y >= 0 ? 'WO — переорієнтації: усунення слабкостей за рахунок можливостей'
          : 'WT — оборонна: мінімізація слабкостей і уникнення загроз';
    return { q, X, Y, strat, frac: fr / 4, info: ['S', 'W', 'O', 'T'].map(k => k + ':' + q[k].n).join(' ') };
  }
  function sheetParts(work, w) {
    return work.sheet.map(it => {
      if (it.type === 'text') { const n = wc(w.fields[it.id]); return { it, frac: Math.min(1, n / it.minWords), info: `${n} / ${it.minWords} слів` }; }
      if (it.type === 'table') { const n = (w.tables[it.id] || []).filter(r => rowFilled(it, r)).length; return { it, frac: Math.min(1, n / it.minRows), info: `${n} / ${it.minRows} рядків` }; }
      if (it.type === 'swot') { const s = swotCalc(w.tables.swot); return { it, frac: s.frac, info: `факторів ${s.info}` }; }
      if (it.type === 'risks') { const n = (w.tables[it.id] || []).filter(riskValid).length; return { it, frac: Math.min(1, n / it.minRows), info: `${n} / ${it.minRows} ризиків` }; }
      return { it, frac: 1, info: '' };
    });
  }
  function metrics(work, w, variant, salt) {
    const parts = sheetParts(work, w);
    const sheet = parts.reduce((s, p) => s + p.frac, 0) / parts.length;
    const chk = E.check(work.id, variant, salt, w.calc);
    const q = w.quiz || {};
    const A = C.autoWeights;
    const sc = { calc: A.calc * chk.correct / chk.total, sheet: A.sheet * sheet, quiz: A.quiz * ((q.best || 0) / 100) };
    const auto = Math.round((sc.calc + sc.sheet + sc.quiz) * 10) / 10;
    const progress = (sheet + chk.filled / chk.total + ((q.attempts || 0) > 0 ? 1 : 0)) / 3;
    return { parts, sheet, chk, best: q.best, attempts: q.attempts || 0, sc, auto, progress };
  }
  function ects100(p) { return p >= 90 ? 'A' : p >= 82 ? 'B' : p >= 75 ? 'C' : p >= 64 ? 'D' : p >= 60 ? 'E' : p >= 35 ? 'FX' : 'F'; }
  const ects20 = (s) => ects100(s / C.grading.perWork * 100);
  const pct = (x) => Math.round(x * 100) + '%';

  /* ------------------------------------------------------------ UI-утиліти */
  function toast(msg, kind = '') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
  }
  function flashSaved() { const el = $('#saved'); if (!el) return; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1400); }
  function ring(p, size = 54, label) {
    const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, p)));
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${off}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle">${label ?? Math.round(p * 100) + '%'}</text></svg>`;
  }
  const bar = (p, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, p)) * 100)}%"></i></div>`;
  function download(name, text, type = 'application/json') {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function printHTML(html) {
    const fr = document.createElement('iframe'); fr.className = 'print-frame';
    document.body.appendChild(fr);
    const d = fr.contentWindow.document; d.open(); d.write(html); d.close();
    setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 2000); }, 400);
  }
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const safeName = (s) => String(s || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);

  /* ------------------------------------------------------------ шапка */
  function renderTop(mode) {
    const st = S.student;
    $('#top').innerHTML = `
      <a class="brand" href="${mode === 'teacher' ? '#/teacher' : '#/'}"><span class="logo">ІТС</span><span class="brand-t"><b>Тренажер</b><small>${esc(C.discipline)}</small></span></a>
      <div class="top-sp"></div>
      ${mode === 'teacher' ? `<nav class="top-nav"><a href="#/teacher">Роботи</a><a href="#/teacher/keys">Ключі варіантів</a><a href="#/teacher/sim">Схожість</a><a href="#/teacher/settings">Налаштування</a></nav>` : ''}
      <span id="saved" class="saved">✓ збережено</span>
      <button class="icon-btn" data-a="theme" title="Світла / темна тема">◐</button>
      ${mode === 'teacher' ? `<a class="chip" href="#/">← до режиму здобувача</a>` : st ? `<span class="chip"><span class="dot"></span>${esc(st.name.split(' ')[0])} · В${variantOf(st.num)}</span>` : `<a class="chip" href="#/teacher">Викладач</a>`}`;
  }

  /* ------------------------------------------------------------ маршрутизація */
  const route = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  function render() {
    const r = route();
    window.scrollTo(0, 0);
    if (r[0] === 'teacher') return renderTeacher(r.slice(1));
    if (!S.student) return renderLogin();
    if (r[0] === 'work' && W(r[1])) return renderWork(+r[1], r[2] || 'task');
    return renderDash();
  }
  function rerender() { const y = window.scrollY; const r = route(); if (r[0] === 'teacher') renderTeacher(r.slice(1)); else if (!S.student) renderLogin(); else if (r[0] === 'work') renderWork(+r[1], r[2] || 'task'); else renderDash(); window.scrollTo(0, y); }

  /* ======================================================== ВХІД */
  function renderLogin() {
    renderTop('student');
    app().innerHTML = `
    <section class="hero">
      <div class="hero-text">
        <div class="eyebrow">ВНТУ · ${esc(C.department)}</div>
        <h1>Тренажер практичних робіт<br><span class="grad">«${esc(C.discipline)}»</span></h1>
        <p class="lead">${esc(C.level)}. Сім практичних робіт, по 30 варіантів у кожній. Кожен варіант має власні числові дані.</p>
        <div class="feat">
          <div><b>Індивідуальні дані</b><span>Номер у списку групи визначає варіант і всі вихідні дані.</span></div>
          <div><b>Самоперевірка</b><span>Розрахунки перевіряються автоматично, правильних відповідей тренажер не показує.</span></div>
          <div><b>Автозбереження</b><span>Робота зберігається в браузері, її можна перенести файлом на інший комп’ютер.</span></div>
          <div><b>Здача викладачу</b><span>Файл .json і звіт PDF для друку чи архіву.</span></div>
        </div>
      </div>
      <form class="card login" id="loginForm" autocomplete="on">
        <h2>Вхід здобувача</h2>
        <label>Прізвище, ім’я, по батькові<input name="name" required minlength="5" placeholder="Іваненко Іван Іванович"></label>
        <div class="row2">
          <label>Група<input name="group" required placeholder="напр. 1АСП-26"></label>
          <label>№ у списку групи<input name="num" type="number" min="1" max="99" required></label>
        </div>
        <label>E-mail <span class="muted">(необов’язково)</span><input name="email" type="email"></label>
        <div class="vprev" id="vprev">Варіант визначиться за номером у списку</div>
        <button class="btn primary block" type="submit">Розпочати роботу</button>
        <div class="sep"><span>або</span></div>
        <label class="btn ghost block filebtn">Відновити роботу з файлу .json<input type="file" accept=".json,application/json" id="restoreFile"></label>
        <a class="link-muted" href="#/teacher">Режим викладача →</a>
      </form>
    </section>`;
    const f = $('#loginForm');
    f.num.addEventListener('input', () => { const n = +f.num.value; $('#vprev').innerHTML = n > 0 ? `Ваш варіант: <b>${variantOf(n)}</b>` : 'Варіант визначиться за номером у списку'; });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      S = { student: { name: f.name.value.trim().replace(/\s+/g, ' '), group: f.group.value.trim().toUpperCase(), num: +f.num.value, email: f.email.value.trim() }, salt: C.salt, works: {}, createdAt: new Date().toISOString() };
      store(LS, S); toast('Ласкаво просимо! Ваш варіант — ' + variantOf(S.student.num), 'ok'); location.hash = '#/'; render();
    });
    $('#restoreFile').addEventListener('change', (e) => restoreFromFile(e.target.files[0]));
  }
  function restoreFromFile(file) {
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (d.app !== APP || !d.student) throw new Error('format');
        if (S.student && !confirm('Замінити поточні дані в браузері даними з файлу?')) return;
        S = { student: d.student, salt: d.salt, works: d.works || {}, createdAt: d.createdAt };
        store(LS, S); toast('Роботу відновлено з файлу', 'ok'); location.hash = '#/'; render();
      } catch (err) { toast('Файл не розпізнано як файл тренажера', 'bad'); }
    };
    rd.readAsText(file);
  }

  /* ======================================================== КАБІНЕТ */
  function renderDash() {
    renderTop('student');
    const st = S.student, v = variantOf(st.num), salt = saltOf(S);
    const ms = WORKS.map(work => ({ work, w: ws(work.id), m: metrics(work, ws(work.id), v, salt) }));
    const done = ms.filter(x => x.w.submittedAt).length;
    const avgProg = ms.reduce((s, x) => s + x.m.progress, 0) / ms.length;
    const quizzes = ms.filter(x => x.m.best !== null && x.m.best !== undefined);
    app().innerHTML = `
    <section class="page">
      <div class="page-head">
        <div>
          <div class="eyebrow">Особистий кабінет · ${esc(C.academicYear)}</div>
          <h1>${esc(st.name)}</h1>
          <div class="meta"><span>Група <b>${esc(st.group)}</b></span><span>№ у списку <b>${st.num}</b></span><span class="badge big">Варіант ${v}</span></div>
        </div>
        <div class="head-actions">
          <button class="btn primary" data-a="export">⬇ Файл для викладача</button>
          <button class="btn" data-a="printall">🖶 Звіт з усіх робіт</button>
          <button class="btn ghost" data-a="logout">Вийти</button>
        </div>
      </div>
      <div class="kpis">
        <div class="kpi">${ring(avgProg, 64)}<div><b>Загальний прогрес</b><span>за всіма роботами</span></div></div>
        <div class="kpi"><div class="kpi-n">${done}<small>/7</small></div><div><b>Роботи позначено завершеними</b><span>кнопкою на вкладці «Здача»</span></div></div>
        <div class="kpi"><div class="kpi-n">${quizzes.length ? Math.round(quizzes.reduce((s, x) => s + x.m.best, 0) / quizzes.length) : '—'}<small>${quizzes.length ? '%' : ''}</small></div><div><b>Середній результат тестів</b><span>найкращі спроби</span></div></div>
      </div>
      <div class="grid-works">
        ${ms.map(({ work, w, m }) => {
          const status = w.submittedAt ? ['done', 'Завершено'] : w.startedAt ? ['prog', 'У роботі'] : ['new', 'Не розпочато'];
          const cc = w.calcChecked;
          return `<a class="wcard" href="#/work/${work.id}/task">
            <div class="wcard-top"><span class="wnum">${work.short}</span><span class="status ${status[0]}">${status[1]}</span></div>
            <h3>${esc(work.title)}</h3>
            <p class="wvar"><b>В${v}:</b> ${esc(work.variants[v - 1])}</p>
            <div class="wmeters">
              <div><span>Робочий аркуш</span>${bar(m.sheet)}<em>${pct(m.sheet)}</em></div>
              <div><span>Розрахунок</span>${bar(cc ? cc.correct / cc.total : 0, cc && cc.correct === cc.total ? 'ok' : '')}<em>${cc ? cc.correct + '/' + cc.total : '—'}</em></div>
              <div><span>Тест</span>${bar((m.best || 0) / 100)}<em>${m.best !== null && m.best !== undefined ? m.best + '%' : '—'}</em></div>
            </div>
          </a>`;
        }).join('')}
      </div>
      <div class="card howto">
        <h3>Як працювати з тренажером</h3>
        <ol>
          <li>Відкрийте роботу і прочитайте вкладку <b>«Завдання»</b>: мета, теорія, формули, контрольні питання.</li>
          <li>Заповніть <b>«Робочий аркуш»</b>. Під кожним полем видно мінімальний обсяг відповіді.</li>
          <li>На вкладці <b>«Розрахунок»</b> виконайте обчислення за даними свого варіанта (Excel, MATLAB, Python) і перевірте результат. Викладач бачить кількість спроб.</li>
          <li>Пройдіть тест на вкладці <b>«Самоконтроль»</b>. Зараховується найкраща спроба.</li>
          <li>На вкладці <b>«Здача»</b> позначте роботу завершеною, завантажте <b>файл для викладача (.json)</b> і за потреби збережіть звіт у PDF.</li>
        </ol>
        <p class="muted">Дані зберігаються лише у цьому браузері. Щоб продовжити на іншому комп’ютері, завантажте файл .json і відкрийте його там кнопкою «Відновити роботу з файлу».</p>
      </div>
    </section>`;
  }

  /* ======================================================== РОБОТА */
  const TABS = [['task', 'Завдання'], ['sheet', 'Робочий аркуш'], ['calc', 'Розрахунок'], ['quiz', 'Самоконтроль'], ['submit', 'Здача']];
  function renderWork(id, tab) {
    renderTop('student');
    const work = W(id), st = S.student, v = variantOf(st.num), w = ws(id), salt = saltOf(S);
    const m = metrics(work, w, v, salt);
    const ti = TABS.findIndex(t => t[0] === tab);
    const prevT = TABS[ti - 1], nextT = TABS[ti + 1];
    app().innerHTML = `
    <div class="layout">
      <aside class="side">
        <a class="side-back" href="#/">← Кабінет</a>
        ${WORKS.map(x => { const mm = metrics(x, ws(x.id), v, salt); return `<a class="side-item ${x.id === id ? 'on' : ''}" href="#/work/${x.id}/${tab}" id="side-${x.id}">${ring(mm.progress, 34, '')}<span><b>${x.short}</b><small>${esc(x.title)}</small></span></a>`; }).join('')}
      </aside>
      <section class="page work">
        <div class="work-head">
          <div class="wh-text">
            <div class="eyebrow">Практична робота №${id}</div>
            <h1>${esc(work.title)}</h1>
            <div class="variant-box"><span class="badge">Варіант ${v}</span><span>${esc(work.variants[v - 1])}</span></div>
          </div>
          <div class="wh-ring" id="wprog" title="Прогрес роботи">${ring(m.progress, 76)}</div>
        </div>
        <nav class="tabs">${TABS.map(([k, n], i) => `<a href="#/work/${id}/${k}" class="${k === tab ? 'on' : ''}"><i>${i + 1}</i>${n}</a>`).join('')}</nav>
        <div class="tab-body">${tabBody(work, tab, w, v, salt, m)}</div>
        <div class="pager">
          ${prevT ? `<a class="btn ghost" href="#/work/${id}/${prevT[0]}">← ${prevT[1]}</a>` : '<span></span>'}
          ${nextT ? `<a class="btn" href="#/work/${id}/${nextT[0]}">${nextT[1]} →</a>` : (id < 7 ? `<a class="btn" href="#/work/${id + 1}/task">ПР${id + 1} →</a>` : '<span></span>')}
        </div>
      </section>
    </div>`;
    afterWork(work, tab, w, v, salt);
  }
  function tabBody(work, tab, w, v, salt, m) {
    if (tab === 'task') return taskTab(work, v);
    if (tab === 'sheet') return work.sheet.map(it => sheetItem(work, it, w, false)).join('') + `<p class="muted center">Дані зберігаються автоматично.</p>`;
    if (tab === 'calc') return calcTab(work, w, v, salt);
    if (tab === 'quiz') return quizTab(work, w);
    if (tab === 'submit') return submitTab(work, w, m);
    return '';
  }
  function afterWork(work, tab, w, v, salt) {
    if (tab === 'calc' && work.id === 6) initSurface(work, w, v, salt);
    $$('textarea.auto').forEach(autoGrow);
  }
  function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.max(110, t.scrollHeight + 4) + 'px'; }
  function updWorkProgress(id) {
    const work = W(id), v = variantOf(S.student.num), m = metrics(work, ws(id), v, saltOf(S));
    const el = $('#wprog'); if (el) el.innerHTML = ring(m.progress, 76);
    const sd = $('#side-' + id + ' svg'); if (sd) sd.outerHTML = ring(m.progress, 34, '');
  }

  /* ---------- вкладка «Завдання» ---------- */
  function taskTab(work, v) {
    return `
    <div class="grid2">
      <div class="card"><h3>Мета роботи</h3><p>${esc(work.goal)}</p>
        <h3>Завдання роботи</h3><ol>${work.tasks.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>
      <div class="card accent"><h3>Ваш варіант ${v}</h3><p class="big-var">${esc(work.variants[v - 1])}</p>
        <h4>Що потрібно виконати</h4><ol>${work.doFor.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
        <div class="formula"><span>Розрахункові формули</span><code>${esc(work.formulas)}</code></div></div>
    </div>
    <div class="card"><h3>Теоретичні відомості</h3>
      ${work.theory.map((t, i) => `<details ${i === 0 ? 'open' : ''}><summary>${esc(t.h)}</summary><ul>${t.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('')}
    </div>
    <div class="card"><h3>Контрольні питання</h3><ol class="cq">${work.control.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
      <p class="muted">Підготуйте усні відповіді до захисту. Тест самоконтролю на вкладці «Самоконтроль» побудований за цими питаннями.</p></div>
    <details class="card"><summary><b>Усі 30 варіантів роботи</b></summary><ol class="vlist">${work.variants.map((t, i) => `<li class="${i + 1 === v ? 'me' : ''}">${esc(t)}</li>`).join('')}</ol></details>`;
  }

  /* ---------- робочий аркуш ---------- */
  function sheetItem(work, it, w, ro) {
    const id = work.id;
    if (it.type === 'text') {
      const val = w.fields[it.id] || '', n = wc(val);
      if (ro) return `<div class="ro-item"><h4>${esc(it.label)} <small class="${n >= it.minWords ? 'okc' : 'badc'}">${n}/${it.minWords} сл.</small></h4><div class="ro-text">${val ? nl2br(val) : '<i class="muted">не заповнено</i>'}</div></div>`;
      return `<div class="card field"><label for="f-${it.id}">${esc(it.label)}</label>${it.hint ? `<div class="hint">${esc(it.hint)}</div>` : ''}
        <textarea id="f-${it.id}" class="auto" data-b="f:${id}:${it.id}" placeholder="Ваша відповідь…">${esc(val)}</textarea>
        <div class="meter" id="m-${it.id}">${meterHTML(n, it.minWords)}</div></div>`;
    }
    if (it.type === 'table') return tableBlock(id, it, w, ro);
    if (it.type === 'swot') return swotBlock(id, it, w, ro);
    if (it.type === 'risks') return risksBlock(id, it, w, ro);
    return '';
  }
  const meterHTML = (n, min) => `${bar(n / min, n >= min ? 'ok' : '')}<span>${n} / ${min} слів ${n >= min ? '✓' : ''}</span>`;
  function computedCell(fn, r) {
    if (fn === 'change') { const a = E.parseNum(r && r.before), b = E.parseNum(r && r.after); if (!isFinite(a) || !isFinite(b) || a === 0) return '—'; const c = (b - a) / Math.abs(a) * 100; return (c > 0 ? '+' : '') + E.fmt(c, 1); }
    return '';
  }
  function tableBlock(id, it, w, ro) {
    const rows = w.tables[it.id] && w.tables[it.id].length ? w.tables[it.id] : (ro ? [] : Array.from({ length: it.minRows }, () => ({})));
    if (!ro && !w.tables[it.id]) w.tables[it.id] = rows;
    const n = rows.filter(r => rowFilled(it, r)).length;
    const head = `<tr>${ro ? '' : '<th class="num">#</th>'}${it.columns.map(c => `<th class="${c.small ? 'sm' : ''}">${esc(c.label)}</th>`).join('')}${ro ? '' : '<th></th>'}</tr>`;
    const body = rows.map((r, ri) => `<tr>${ro ? '' : `<td class="num">${ri + 1}</td>`}${it.columns.map(c => {
      if (c.type === 'computed') return `<td class="comp" id="tc-${it.id}-${ri}">${computedCell(c.fn, r)}</td>`;
      if (ro) return `<td>${esc(r[c.key] || '')}</td>`;
      return `<td><input class="${c.type === 'num' ? 'numin' : ''}" data-b="t:${id}:${it.id}:${ri}:${c.key}" value="${esc(r[c.key] || '')}" ${c.type === 'num' ? 'inputmode="decimal"' : ''}></td>`;
    }).join('')}${ro ? '' : `<td><button class="x" data-a="delrow" data-t="${it.id}" data-r="${ri}" title="Видалити рядок">×</button></td>`}</tr>`).join('');
    if (ro) return `<div class="ro-item"><h4>${esc(it.label)} <small class="${n >= it.minRows ? 'okc' : 'badc'}">${n}/${it.minRows} рядк.</small></h4>${rows.length ? `<table class="tbl">${head}${body}</table>` : '<i class="muted">не заповнено</i>'}</div>`;
    return `<div class="card field"><label>${esc(it.label)}</label>${it.hint ? `<div class="hint">${esc(it.hint)}</div>` : ''}
      <div class="tbl-wrap"><table class="tbl edit">${head}${body}</table></div>
      <div class="tbl-foot"><button class="btn sm" data-a="addrow" data-t="${it.id}">+ рядок</button><span class="meter-s" id="tm-${it.id}">${n} / ${it.minRows} рядків заповнено ${n >= it.minRows ? '✓' : ''}</span></div></div>`;
  }
  function swotBlock(id, it, w, ro) {
    if (!w.tables.swot) w.tables.swot = { S: [{}, {}, {}], W: [{}, {}, {}], O: [{}, {}, {}], T: [{}, {}, {}] };
    const sw = w.tables.swot;
    const quad = (k) => `<div class="sq sq-${k}"><div class="sq-h"><b>${QN[k]}</b>${ro ? '' : `<button class="btn sm ghost" data-a="swadd" data-q="${k}">+ фактор</button>`}</div>
      <table class="tbl swt"><tr><th>Фактор</th><th class="sm">Вага</th><th class="sm">Оцінка 1–5</th>${ro ? '' : '<th></th>'}</tr>
      ${(sw[k] || []).map((r, ri) => ro ? `<tr><td>${esc(r.f || '')}</td><td>${esc(r.w || '')}</td><td>${esc(r.s || '')}</td></tr>`
        : `<tr><td><input data-b="s:${id}:${k}:${ri}:f" value="${esc(r.f || '')}" placeholder="фактор"></td><td><input class="numin" inputmode="decimal" data-b="s:${id}:${k}:${ri}:w" value="${esc(r.w || '')}" placeholder="0,30"></td><td><input class="numin" inputmode="numeric" data-b="s:${id}:${k}:${ri}:s" value="${esc(r.s || '')}" placeholder="1–5"></td><td><button class="x" data-a="swdel" data-q="${k}" data-r="${ri}">×</button></td></tr>`).join('')}
      </table><div class="sq-f" id="sqf-${k}"></div></div>`;
    const inner = `<div class="swot-grid">${['S', 'W', 'O', 'T'].map(quad).join('')}</div><div class="swot-sum" id="swot-sum">${swotSummary(sw)}</div>`;
    if (ro) return `<div class="ro-item"><h4>${esc(it.label)}</h4>${inner}</div>`;
    return `<div class="card field"><label>${esc(it.label)}</label><div class="hint">${esc(it.hint)}</div>${inner}</div>`;
  }
  function swotSummary(sw) {
    const s = swotCalc(sw);
    setTimeout(() => ['S', 'W', 'O', 'T'].forEach(k => { const el = $('#sqf-' + k); if (el) el.innerHTML = `Σ ваг = <b class="${s.q[k].wOk ? 'okc' : 'badc'}">${E.fmt(s.q[k].sumW, 2)}</b> · зважена оцінка <b>${E.fmt(s.q[k].score, 2)}</b>`; }), 0);
    const ready = ['S', 'W', 'O', 'T'].every(k => s.q[k].n > 0);
    return `<div class="swot-res"><div><div class="kv"><span>S − W</span><b>${ready ? E.fmt(s.X, 2) : '—'}</b></div><div class="kv"><span>O − T</span><b>${ready ? E.fmt(s.Y, 2) : '—'}</b></div>
      <div class="strat">${ready ? 'Рекомендована стратегія: <b>' + esc(s.strat) + '</b>' : 'Заповніть усі квадранти, щоб визначити стратегію'}</div></div>
      ${Ch.swot(ready ? s.X : NaN, ready ? s.Y : NaN)}</div>`;
  }
  const RTYPES = ['технічний', 'фінансовий', 'організаційний', 'ринковий', 'кадровий', 'екологічний'];
  function risksBlock(id, it, w, ro) {
    if (!ro && !w.tables[it.id]) w.tables[it.id] = Array.from({ length: it.minRows }, () => ({}));
    const rows = w.tables[it.id] || [];
    const n = rows.filter(riskValid).length;
    const body = rows.map((r, ri) => {
      const sc = riskValid(r) ? int15(r.p) * int15(r.i) : NaN, lv = isFinite(sc) ? riskLevel(sc) : null;
      const lvl = `<td class="comp" id="rl-${ri}">${lv ? `<span class="lvl ${lv[0]}">${sc} · ${lv[1]}</span>` : '—'}</td>`;
      if (ro) return `<tr><td>${esc(r.name || '')}</td><td>${esc(r.type || '')}</td><td>${esc(r.p || '')}</td><td>${esc(r.i || '')}</td>${lvl}<td>${esc(r.m || '')}</td></tr>`;
      return `<tr><td class="num">${ri + 1}</td><td><input data-b="r:${id}:${it.id}:${ri}:name" value="${esc(r.name || '')}" placeholder="Опис ризику"></td>
        <td><select data-b="r:${id}:${it.id}:${ri}:type"><option value=""></option>${RTYPES.map(t => `<option ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input class="numin" inputmode="numeric" data-b="r:${id}:${it.id}:${ri}:p" value="${esc(r.p || '')}" placeholder="1–5"></td>
        <td><input class="numin" inputmode="numeric" data-b="r:${id}:${it.id}:${ri}:i" value="${esc(r.i || '')}" placeholder="1–5"></td>${lvl}
        <td><input data-b="r:${id}:${it.id}:${ri}:m" value="${esc(r.m || '')}" placeholder="Захід зниження"></td>
        <td><button class="x" data-a="delrow" data-t="${it.id}" data-r="${ri}">×</button></td></tr>`;
    }).join('');
    const head = `<tr>${ro ? '' : '<th class="num">#</th>'}<th>Ризик</th><th class="sm">Тип</th><th class="sm">P</th><th class="sm">I</th><th class="sm">Рівень</th><th>Захід</th>${ro ? '' : '<th></th>'}</tr>`;
    const inner = `<div class="tbl-wrap"><table class="tbl edit">${head}${body}</table></div><div class="risk-flex">${ro ? '' : `<div class="tbl-foot"><button class="btn sm" data-a="addrow" data-t="${it.id}">+ ризик</button><span class="meter-s" id="tm-${it.id}">${n} / ${it.minRows} ризиків ${n >= it.minRows ? '✓' : ''}</span></div>`}<div id="rmatrix">${riskMatrix(rows)}</div></div>`;
    if (ro) return `<div class="ro-item"><h4>${esc(it.label)} <small class="${n >= it.minRows ? 'okc' : 'badc'}">${n}/${it.minRows}</small></h4>${inner}</div>`;
    return `<div class="card field"><label>${esc(it.label)}</label><div class="hint">${esc(it.hint)}</div>${inner}</div>`;
  }
  function riskMatrix(rows) {
    const cnt = {}; rows.filter(riskValid).forEach(r => { const k = int15(r.p) + '-' + int15(r.i); cnt[k] = (cnt[k] || 0) + 1; });
    let h = '<table class="rmx"><tr><th>P \\ I</th>' + [1, 2, 3, 4, 5].map(i => `<th>${i}</th>`).join('') + '</tr>';
    for (let p = 5; p >= 1; p--) { h += `<tr><th>${p}</th>`; for (let i = 1; i <= 5; i++) { const lv = riskLevel(p * i)[0], c = cnt[p + '-' + i]; h += `<td class="${lv}">${c ? '<b>' + c + '</b>' : ''}</td>`; } h += '</tr>'; }
    return h + '</table>';
  }

  /* ---------- вкладка «Розрахунок» ---------- */
  function calcData(work, g, v) {
    const d = g.data;
    switch (work.id) {
      case 1: return `<p>Матриця впливів aᵢⱼ (0 — немає, 1 — слабкий, 2 — середній, 3 — сильний вплив елемента рядка на елемент стовпця):</p>
        <div class="tbl-wrap"><table class="tbl mtx"><tr><th></th>${d.els.map((_, j) => `<th>${j + 1}</th>`).join('')}</tr>${d.M.map((r, i) => `<tr><th class="lft">${i + 1}. ${esc(d.els[i])}</th>${r.map((x, j) => `<td class="${i === j ? 'diag' : 'v' + x}">${i === j ? '—' : x}</td>`).join('')}</tr>`).join('')}</table></div>`;
      case 2: return `<table class="tbl kvt">${d.table.map(r => `<tr><td>${esc(r[0])}</td><td class="r"><b>${esc(typeof r[1] === 'number' ? E.fmt(r[1], r[1] % 1 ? 2 : 0) : String(r[1]).replace(/\./g, ','))}</b> ${esc(r[2])}</td></tr>`).join('')}</table>`;
      case 3: return `<p>Результати експерименту для процесу. Фактор: <b>${esc(d.fam.x)}</b>, ${esc(d.fam.xu)}; відгук: <b>${esc(d.fam.y)}</b>, ${esc(d.fam.yu)}.</p>
        <div class="tbl-wrap"><table class="tbl dat"><tr><th>i</th>${d.xs.map((_, i) => `<th>${i + 1}</th>`).join('')}</tr><tr><th>x, ${esc(d.fam.xu)}</th>${d.xs.map(x => `<td>${E.fmt(x, d.fam.xd)}</td>`).join('')}</tr><tr><th>y, ${esc(d.fam.yu)}</th>${d.ys.map(y => `<td>${String(y).replace('.', ',')}</td>`).join('')}</tr></table></div>
        <p>Модель: <b>y = a·xᵇ</b>. Прогнозне значення фактора x* = <b>${E.fmt(d.xstar, d.fam.xd + 1)}</b> ${esc(d.fam.xu)}.</p>`;
      case 4: return `<table class="tbl kvt"><tr><td>Інвестиції I₀</td><td class="r"><b>${E.fmt(d.I0, 0)}</b> тис. грн</td></tr><tr><td>Ставка дисконтування r</td><td class="r"><b>${E.fmt(d.r * 100, 0)}</b> %</td></tr></table>
        <div class="tbl-wrap"><table class="tbl dat"><tr><th>Рік t</th>${d.cfs.map((_, i) => `<th>${i + 1}</th>`).join('')}</tr><tr><th>CFₜ, тис. грн</th>${d.cfs.map(c => `<td>${E.fmt(c, 0)}</td>`).join('')}</tr></table></div>`;
      case 5: return `<table class="tbl kvt"><tr><td>Капітальні вкладення K</td><td class="r"><b>${E.fmt(d.K, 0)}</b> тис. грн</td></tr><tr><td>Горизонт n</td><td class="r"><b>${d.n}</b> років</td></tr><tr><td>Ставка дисконтування r</td><td class="r"><b>${E.fmt(d.r * 100, 0)}</b> %</td></tr><tr><td>Річна економія (базова) S</td><td class="r"><b>${E.fmt(d.S, 0)}</b> тис. грн/рік</td></tr><tr><td>Додаткові експлуатаційні витрати OPEX</td><td class="r"><b>${E.fmt(d.OPEX, 0)}</b> тис. грн/рік</td></tr></table>
        <table class="tbl dat"><tr><th>Сценарій</th>${d.sc.map(s => `<th>${s.n}</th>`).join('')}</tr><tr><th>Коефіцієнт до S, kᵢ</th>${d.sc.map(s => `<td>${E.fmt(s.k, 2)}</td>`).join('')}</tr><tr><th>Ймовірність pᵢ</th>${d.sc.map(s => `<td>${E.fmt(s.p, 2)}</td>`).join('')}</tr></table>`;
      case 6: { const f = d.fam, c = d.c, sg = (x) => (x < 0 ? ' − ' : ' + ') + E.fmt(Math.abs(x), 4);
        return `<p>Система моделювання за варіантом: <b>${esc(d.tool)}</b>. Критерій оптимізації: <b>мінімум «${esc(f.y)}»</b>${f.yu ? ', ' + esc(f.yu) : ''}.</p>
        <table class="tbl dat"><tr><th>Фактор</th><th>Од.</th><th>Основний рівень X₀</th><th>Інтервал ΔX</th><th>−1</th><th>+1</th></tr>
        <tr><td class="lft">x₁: ${esc(f.x1)}</td><td>${esc(f.u1)}</td><td>${E.fmt(f.c1, 3).replace(/,?0+$/, '')}</td><td>${E.fmt(f.h1, 3).replace(/,?0+$/, '')}</td><td>${E.fmt(f.c1 - f.h1, 3).replace(/,?0+$/, '')}</td><td>${E.fmt(f.c1 + f.h1, 3).replace(/,?0+$/, '')}</td></tr>
        <tr><td class="lft">x₂: ${esc(f.x2)}</td><td>${esc(f.u2)}</td><td>${E.fmt(f.c2, 3).replace(/,?0+$/, '')}</td><td>${E.fmt(f.h2, 3).replace(/,?0+$/, '')}</td><td>${E.fmt(f.c2 - f.h2, 3).replace(/,?0+$/, '')}</td><td>${E.fmt(f.c2 + f.h2, 3).replace(/,?0+$/, '')}</td></tr></table>
        <div class="formula"><span>Модель (кодовані змінні), отримана за результатами комп’ютерного експерименту</span><code>y = ${E.fmt(c.b0, 4)}${sg(c.b1)}·x₁${sg(c.b2)}·x₂${sg(c.b12)}·x₁x₂${sg(c.b11)}·x₁²${sg(c.b22)}·x₂²</code></div>`; }
      case 7: { const b = d.budget;
        return `<div class="tbl-wrap"><table class="tbl dat"><tr><th>Код</th><th>Робота</th><th>Попередні</th><th>Тривалість, тижн.</th></tr>${E.P7_TASKS.map(t => `<tr><td><b>${t.id}</b></td><td class="lft">${esc(t.n)}</td><td>${t.pre.join(', ') || '—'}</td><td>${d.d[t.id]}</td></tr>`).join('')}</table></div>
        <h4>Вихідні дані кошторису</h4><table class="tbl kvt"><tr><td>Вартість обладнання</td><td class="r"><b>${E.fmt(b.eq, 0)}</b> тис. грн</td></tr><tr><td>Монтаж і пусконалагодження</td><td class="r"><b>${b.mont}</b> % від вартості обладнання</td></tr><tr><td>Проєктні роботи</td><td class="r"><b>${b.proj}</b> % від вартості обладнання</td></tr><tr><td>Програмне забезпечення</td><td class="r"><b>${E.fmt(b.sw, 0)}</b> тис. грн</td></tr><tr><td>Навчання персоналу</td><td class="r"><b>${E.fmt(b.tr, 0)}</b> тис. грн</td></tr><tr><td>Резерв на непередбачені витрати</td><td class="r"><b>${b.res}</b> % від суми</td></tr></table>`; }
    }
    return '';
  }
  function calcInputs(work, g, w, ro, chk) {
    const st = (k) => { if (!chk) return ''; const it = chk.items.find(i => i.f.key === k); return it ? (it.ok ? 'ok' : it.filled ? 'bad' : '') : ''; };
    const inp = (f) => {
      const val = w.calc[f.key] ?? '';
      if (f.kind === 'select') return `<select data-b="c:${work.id}:${f.key}" class="${st(f.key)}" ${ro ? 'disabled' : ''}><option value="">— оберіть —</option>${f.options.map(o => `<option value="${o.v}" ${String(val) === o.v ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
      return `<input data-b="c:${work.id}:${f.key}" class="${st(f.key)} ${f.kind === 'path' ? '' : 'numin'}" value="${esc(val)}" ${f.kind === 'path' ? '' : 'inputmode="decimal"'} placeholder="${f.kind === 'path' ? 'ABC…' : '0,00'}" ${ro ? 'readonly' : ''}>`;
    };
    if (work.id === 1) {
      const els = g.data.els;
      return `<div class="tbl-wrap"><table class="tbl calc1"><tr><th>Елемент</th><th>Активна сума A</th><th>Пасивна сума P</th></tr>
        ${els.map((n, i) => `<tr><td class="lft">${i + 1}. ${esc(n)}</td><td>${inp(g.fields[i])}</td><td>${inp(g.fields[6 + i])}</td></tr>`).join('')}</table></div>
        <div class="cgrid">${g.fields.slice(12).map(f => `<div class="cf"><label>${esc(f.label)}</label>${inp(f)}</div>`).join('')}</div>`;
    }
    return `<div class="cgrid">${g.fields.map(f => `<div class="cf"><label>${esc(f.label)}${f.unit ? `, <span class="u">${esc(f.unit)}</span>` : ''}</label>${inp(f)}</div>`).join('')}</div>`;
  }
  function calcVisual(work, g, w, v, ro) {
    const d = g.data;
    if (work.id === 1) {
      const A = g.fields.slice(0, 6).map(f => E.parseNum(w.calc[f.key])), P = g.fields.slice(6, 12).map(f => E.parseNum(w.calc[f.key]));
      if (A.every(isFinite) && P.every(isFinite)) return `<h4>Діаграма Вестера (за вашими значеннями)</h4>${Ch.vester(A, P, d.els)}<p class="muted">Вище діагоналі Q = 1 розташовані активні елементи, нижче — пасивні. Чим далі від початку координат, тим вищий добуток A·P.</p>`;
      return `<p class="muted">Після введення всіх A і P тут з’явиться діаграма Вестера.</p>`;
    }
    if (work.id === 3) {
      const b = E.parseNum(w.calc.b), la = E.parseNum(w.calc.lna);
      const fit = isFinite(b) && isFinite(la) ? (x) => Math.exp(la) * Math.pow(x, b) : null;
      return `<h4>Експериментальні точки${fit ? ' та ваша модель' : ''}</h4>${Ch.scatterFit(d.xs, d.ys, fit, d.xstar, d.fam.x + ', ' + d.fam.xu, d.fam.y + ', ' + d.fam.yu)}${fit ? '<p class="muted">Лінія — модель за вашими b та ln a; зірочка — прогноз у точці x*.</p>' : '<p class="muted">Введіть b та ln a, щоб побачити криву моделі.</p>'}`;
    }
    if (work.id === 4) return `<h4>Грошові потоки проєкту</h4>${Ch.bars([-d.I0, ...d.cfs], ['0', '1', '2', '3', '4', '5'], 'тис. грн')}`;
    if (work.id === 6) return `<h4>Віртуальний експеримент на поверхні відгуку</h4>
      <div class="sim"><div class="sim-canvas"><canvas id="surf" width="360" height="360"></canvas><div class="sim-ax x">x₁ →</div><div class="sim-ax y">x₂ →</div></div>
      <div class="sim-side"><div id="probe" class="probe">Наведіть курсор на поле, щоб прочитати відгук моделі. Клік заносить точку в журнал експериментів.</div>
      <div class="legend"><span>менше</span><i></i><span>більше</span></div>
      <h4>Журнал експериментів <small class="muted">(${(w.log || []).length})</small></h4><div id="simlog">${simLog(work, g, w)}</div>
      ${ro ? '' : `<button class="btn sm ghost" data-a="clearlog">Очистити журнал</button>`}</div></div>`;
    if (work.id === 7) {
      const cc = w.calcChecked, chk = E.check(7, v, saltOf(S), w.calc);
      const okT = chk.items.find(i => i.f.key === 'T').ok && chk.items.find(i => i.f.key === 'cp').ok;
      if (ro || (cc && okT)) return `<h4>Діаграма Ганта</h4>${Ch.gantt(E.P7_TASKS, d.d, g.extra)}`;
      return `<p class="muted">Діаграма Ганта з’явиться, коли перевірка підтвердить тривалість проєкту і критичний шлях.</p>`;
    }
    return '';
  }
  function simLog(work, g, w) {
    const L = w.log || []; if (!L.length) return '<p class="muted">Журнал порожній.</p>';
    const f = g.data.fam;
    return `<table class="tbl dat sm"><tr><th>#</th><th>x₁</th><th>x₂</th><th>X₁, ${esc(f.u1)}</th><th>X₂, ${esc(f.u2)}</th><th>y</th></tr>${L.map((p, i) => `<tr><td>${i + 1}</td><td>${E.fmt(p[0], 2)}</td><td>${E.fmt(p[1], 2)}</td><td>${E.fmt(f.c1 + p[0] * f.h1, 3)}</td><td>${E.fmt(f.c2 + p[1] * f.h2, 4)}</td><td>${E.fmt(E.yModel(g.data.c, p[0], p[1]), 4)}</td></tr>`).join('')}</table>`;
  }
  function initSurface(work, w, v, salt) {
    const cv = $('#surf'); if (!cv) return;
    const g = E.gen(6, v, salt), c = g.data.c, f = g.data.fam;
    const ctx = cv.getContext('2d'), N = 120, Wd = cv.width, Hd = cv.height;
    let mn = Infinity, mx = -Infinity; const vals = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x1 = -1 + 2 * (i + .5) / N, x2 = 1 - 2 * (j + .5) / N, y = E.yModel(c, x1, x2); vals.push(y); mn = Math.min(mn, y); mx = Math.max(mx, y); }
    const img = ctx.createImageData(N, N);
    vals.forEach((y, k) => { const col = Ch.color((y - mn) / (mx - mn)); img.data.set([col[0], col[1], col[2], 255], k * 4); });
    const off = document.createElement('canvas'); off.width = N; off.height = N; off.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, Wd, Hd);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(k * Wd / 4, 0); ctx.lineTo(k * Wd / 4, Hd); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, k * Hd / 4); ctx.lineTo(Wd, k * Hd / 4); ctx.stroke(); }
    (w.log || []).forEach(p => { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc((p[0] + 1) / 2 * Wd, (1 - p[1]) / 2 * Hd, 4, 0, 7); ctx.fill(); ctx.strokeStyle = '#111'; ctx.stroke(); });
    const pos = (e) => { const r = cv.getBoundingClientRect(); const x1 = ((e.clientX - r.left) / r.width) * 2 - 1, x2 = 1 - ((e.clientY - r.top) / r.height) * 2; return [Math.max(-1, Math.min(1, x1)), Math.max(-1, Math.min(1, x2))]; };
    cv.onmousemove = (e) => { const [x1, x2] = pos(e); $('#probe').innerHTML = `x₁ = <b>${E.fmt(x1, 2)}</b> (${esc(f.x1)} = ${E.fmt(f.c1 + x1 * f.h1, 3)} ${esc(f.u1)})<br>x₂ = <b>${E.fmt(x2, 2)}</b> (${esc(f.x2)} = ${E.fmt(f.c2 + x2 * f.h2, 4)} ${esc(f.u2)})<br>${esc(f.y)}: <b>${E.fmt(E.yModel(c, x1, x2), 4)}</b> ${esc(f.yu)}`; };
    cv.onclick = (e) => { const p = pos(e); w.log = w.log || []; if (w.log.length >= 30) { toast('Журнал містить максимум 30 точок', 'bad'); return; } w.log.push([E.round(p[0], 2), E.round(p[1], 2)]); touch(6); save(); rerender(); };
  }
  function calcTab(work, w, v, salt) {
    const g = E.gen(work.id, v, salt);
    const cc = w.calcChecked;
    const chk = cc ? E.check(work.id, v, salt, w.calc) : null;
    return `
    <div class="grid2 calc-grid">
      <div class="card"><h3>Вихідні дані варіанта ${v}</h3>${calcData(work, g, v)}
        <details class="hintbox"><summary>Формули та порядок розрахунку</summary><code class="fblock">${esc(work.formulas)}</code>
        <p class="muted">Розрахунок виконуйте в Excel, MATLAB, Python тощо. Десятковий роздільник — кома або крапка. Вводьте результат з точністю, не меншою за показану в полі.</p></details>
      </div>
      <div class="card"><h3>Ваші результати</h3>${calcInputs(work, g, w, false, chk)}
        <div class="check-row"><button class="btn primary" data-a="calccheck">Перевірити розрахунок</button>
        <span class="check-info" id="checkinfo">${cc ? `Остання перевірка: <b class="${cc.correct === cc.total ? 'okc' : ''}">${cc.correct} з ${cc.total}</b> правильно · спроб: ${w.calcAttempts}` : 'Перевірок ще не було'}</span></div>
      </div>
    </div>
    <div class="card visual" id="cvis">${calcVisual(work, g, w, v, false)}</div>`;
  }

  /* ---------- самоконтроль ---------- */
  function quizTab(work, w) {
    const q = w.quiz, chk = q.checked;
    return `<div class="card quiz">
      <div class="quiz-head"><div><h3>Тест самоконтролю</h3><p class="muted">${work.quiz.length} питань за контрольними питаннями роботи. Зараховується найкраща спроба.</p></div>
      <div class="quiz-stat"><div><span>Спроб</span><b>${q.attempts}</b></div><div><span>Остання</span><b>${q.last ?? '—'}${q.last !== null && q.last !== undefined ? '%' : ''}</b></div><div><span>Найкраща</span><b>${q.best ?? '—'}${q.best !== null && q.best !== undefined ? '%' : ''}</b></div></div></div>
      ${work.quiz.map((it, qi) => {
        const a = q.answers[qi];
        return `<div class="qitem ${chk ? (a === it.a ? 'right' : 'wrong') : ''}"><div class="qq"><span class="qn">${qi + 1}</span>${esc(it.q)}</div>
        <div class="qopts">${it.o.map((o, oi) => `<label class="qopt ${chk && oi === it.a ? 'correct' : ''} ${chk && a === oi && oi !== it.a ? 'chosen-wrong' : ''}"><input type="radio" name="q${qi}" data-q="${work.id}:${qi}:${oi}" ${a === oi ? 'checked' : ''} ${chk ? 'disabled' : ''}><span>${esc(o)}</span></label>`).join('')}</div>
        ${chk ? `<div class="qexp">${a === it.a ? '✓ Правильно.' : '✗ Неправильно.'} ${esc(it.e)}</div>` : ''}</div>`;
      }).join('')}
      <div class="check-row">${chk ? `<button class="btn primary" data-a="quizreset">Пройти ще раз</button><span class="check-info">Результат спроби: <b>${q.last}%</b></span>` : `<button class="btn primary" data-a="quizcheck">Завершити тест</button><span class="check-info">Відповідей: ${Object.keys(q.answers).length} / ${work.quiz.length}</span>`}</div>
    </div>`;
  }

  /* ---------- здача ---------- */
  function submitTab(work, w, m) {
    const cc = w.calcChecked;
    const items = [
      ...m.parts.map(p => [p.it.label, p.frac >= 1, p.info]),
      ['Розрахунок перевірено, усі значення правильні', cc && cc.correct === cc.total, cc ? `${cc.correct} / ${cc.total}, спроб ${w.calcAttempts}` : 'не перевірено'],
      ['Тест самоконтролю пройдено (рекомендовано ≥ 75 %)', (m.best || 0) >= 75, m.best !== null && m.best !== undefined ? 'найкраща ' + m.best + '%' : 'не пройдено']
    ];
    return `<div class="grid2">
      <div class="card"><h3>Контрольний перелік</h3><ul class="checklist">${items.map(([l, ok, info]) => `<li class="${ok ? 'ok' : ''}"><span class="ck">${ok ? '✓' : '○'}</span><span>${esc(l)}</span><em>${esc(info)}</em></li>`).join('')}</ul></div>
      <div class="card accent"><h3>Орієнтовна автоматична оцінка</h3>
        <div class="score-big">${E.fmt(m.auto, 1)}<small> / ${C.grading.perWork}</small></div>
        <div class="score-parts"><span>Розрахунок ${E.fmt(m.sc.calc, 1)}/${C.autoWeights.calc}</span><span>Аркуш ${E.fmt(m.sc.sheet, 1)}/${C.autoWeights.sheet}</span><span>Тест ${E.fmt(m.sc.quiz, 1)}/${C.autoWeights.quiz}</span></div>
        <p class="muted">Це лише орієнтир. Остаточну оцінку виставляє викладач після захисту, з урахуванням змісту відповідей.</p>
        <div class="btn-col">
          ${w.submittedAt ? `<div class="done-note">✓ Позначено завершеною ${fmtDate(w.submittedAt)}</div><button class="btn ghost" data-a="unfinish">Повернути в роботу</button>` : `<button class="btn primary" data-a="finish">Позначити роботу завершеною</button>`}
          <button class="btn" data-a="export">⬇ Завантажити файл для викладача (.json)</button>
          <button class="btn" data-a="print1">🖶 Звіт з роботи (друк / PDF)</button>
        </div>
        <p class="muted small">Один файл .json містить усі ваші роботи. Надсилайте його викладачу (Moodle / e-mail) після кожної завершеної роботи, щоразу найновішу версію.</p>
      </div></div>`;
  }

  /* ---------- експорт / звіт ---------- */
  function sigOf(sub) { return E.cyrb53(JSON.stringify({ student: sub.student, variant: sub.variant, salt: sub.salt, works: sub.works }) + C.sigKey); }
  function exportJSON() {
    const sub = { app: APP, version: 1, exportedAt: new Date().toISOString(), salt: saltOf(S), student: S.student, variant: variantOf(S.student.num), works: S.works, createdAt: S.createdAt };
    sub.sig = sigOf(sub);
    const sur = (S.student.name.split(' ')[0] || 'student');
    download(`ITS_${safeName(S.student.group)}_${safeName(sur)}_V${sub.variant}_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(sub, null, 1));
    toast('Файл збережено. Надішліть його викладачу.', 'ok');
  }
  function reportHTML(sub, ids, withKey) {
    const v = sub.variant || variantOf(sub.student.num), salt = sub.salt || C.salt;
    const css = `body{font:12pt/1.45 "Times New Roman",serif;color:#000;margin:18mm 16mm}h1{font-size:15pt;text-align:center;margin:0 0 4mm}h2{font-size:13pt;margin:7mm 0 2mm;border-bottom:1px solid #000}h4{font-size:12pt;margin:4mm 0 1mm}
      .c{text-align:center}.tp{page-break-after:always;text-align:center;display:flex;flex-direction:column;min-height:250mm;justify-content:space-between}table{border-collapse:collapse;width:100%;margin:2mm 0;font-size:10.5pt}td,th{border:1px solid #444;padding:2px 5px;vertical-align:top}
      .ro-text{white-space:normal;text-align:justify}.ok{color:#0a7a2a}.bad{color:#b00}small{color:#555}.muted{color:#555}svg{max-width:100%;height:auto}.lvl{font-weight:bold}.okc{color:#0a7a2a}.badc{color:#b00}
      .ch-grid{stroke:#ddd}.ch-axis{stroke:#333}.ch-tick,.ch-label,.ch-val{font:10px sans-serif;fill:#333}.ch-pt{fill:#1d4ed8}.ch-line{fill:none;stroke:#dc2626;stroke-width:2}.ch-star{fill:#f59e0b}.ch-bar{fill:#4f46e5}.ch-neg{fill:#dc2626}.ch-crit{fill:#dc2626}.ch-float{fill:#bbb}.ch-in{font:10px sans-serif;fill:#fff}.ch-node{fill:#4f46e5}.ch-node-t{fill:#fff;font:bold 11px sans-serif}.ch-diag{stroke:#999;stroke-dasharray:4}
      .swot-grid{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.sq-h button,.x{display:none}.swot-res{display:flex;gap:4mm;align-items:center}.swot-res svg{width:60mm}.q-so,.q-wo,.q-wt,.q-st{fill:#f4f4f4;stroke:#ccc}.rmx td{width:7mm;height:5mm;text-align:center}.rmx .high{background:#f8b4b4}.rmx .mid{background:#fde68a}.rmx .low{background:#bbf7d0}.kv{display:inline-block;margin-right:6mm}
      .sign{margin-top:12mm;display:grid;grid-template-columns:1fr 1fr;gap:10mm}.sign div{border-top:1px solid #000;padding-top:1mm;font-size:10pt}@page{size:A4;margin:0}`;
    let h = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Звіт ${esc(sub.student.name)}</title><style>${css}</style></head><body>`;
    ids.forEach((id, n) => {
      const work = W(id), w = wsOf(sub, id), g = E.gen(id, v, salt), m = metrics(work, w, v, salt), chk = E.check(id, v, salt, w.calc);
      h += `<div class="tp"><div>${esc(C.university)}<br>${esc(C.faculty)}<br>${esc(C.department)}</div>
        <div><h1>ЗВІТ<br>з практичної роботи №${id}</h1><p>«${esc(work.title)}»</p><p>з дисципліни «${esc(C.discipline)}»</p><p><b>Варіант ${v}:</b> ${esc(work.variants[v - 1])}</p></div>
        <div style="text-align:right">Виконав(ла): здобувач(ка) гр. ${esc(sub.student.group)}<br><b>${esc(sub.student.name)}</b> (№ ${sub.student.num})<br><br>Перевірив: ${esc(C.teacher)}</div>
        <div>Вінниця · ${new Date().getFullYear()}</div></div>`;
      h += `<h2>1. Мета роботи</h2><p>${esc(work.goal)}</p><h2>2. Виконання роботи</h2>`;
      work.sheet.forEach(it => { h += sheetItem(work, it, w, true); });
      h += `<h2>3. Розрахункова частина</h2>${calcData(work, g, v)}<table><tr><th>Показник</th><th>Результат здобувача</th>${withKey ? '<th>Еталон</th>' : ''}<th>Перевірка</th></tr>
        ${chk.items.map(i => `<tr><td>${esc(i.f.label)}${i.f.unit ? ', ' + esc(i.f.unit) : ''}</td><td>${esc(i.f.kind === 'select' ? ((i.f.options.find(o => o.v === String(i.val)) || {}).t || '') : (i.val ?? ''))}</td>${withKey ? `<td>${esc(E.refText(i.f))}</td>` : ''}<td class="${i.ok ? 'ok' : 'bad'}">${i.ok ? '✓' : i.filled ? '✗' : '—'}</td></tr>`).join('')}</table>
        <p class="muted">Правильно: ${chk.correct} з ${chk.total}; спроб перевірки: ${w.calcAttempts || 0}.</p>`;
      if (id === 3 || id === 7 || id === 1) h += calcVisual(work, g, w, v, withKey);
      h += `<h2>4. Самоконтроль</h2><p>Найкращий результат тесту: <b>${m.best ?? '—'}${m.best !== null && m.best !== undefined ? '%' : ''}</b>; спроб: ${m.attempts}.</p>`;
      h += `<div class="sign"><div>Підпис здобувача</div><div>Оцінка / підпис викладача</div></div>`;
      if (n < ids.length - 1) h += '<div style="page-break-after:always"></div>';
    });
    return h + '</body></html>';
  }

  /* ======================================================== ВИКЛАДАЧ */
  const tKey = (sub) => (sub.student.group + '|' + sub.student.name).toLowerCase();
  const subsList = () => Object.entries(T.subs).sort((a, b) => (a[1].student.group + a[1].student.name).localeCompare(b[1].student.group + b[1].student.name, 'uk'));
  function finalScore(key, id) {
    const sub = T.subs[key], gr = (T.grades[key] || {})[id];
    const m = metrics(W(id), wsOf(sub, id), sub.variant, sub.salt || C.salt);
    const manual = gr && gr.score !== undefined && gr.score !== null && gr.score !== '' ? +gr.score : null;
    return { m, manual, final: manual ?? m.auto };
  }
  function modulePts(key) {
    return C.grading.modules.map(md => { const s = md.works.reduce((acc, id) => acc + finalScore(key, id).final, 0); return Math.round(s / (md.works.length * C.grading.perWork) * md.points * 10) / 10; });
  }
  function renderTeacher(r) {
    renderTop('teacher');
    if (!sessionStorage.getItem('its-t')) return teacherLock();
    if (r[0] === 'keys') return teacherKeys(+r[1] || 1, r[2] || 'all');
    if (r[0] === 'settings') return teacherSettings();
    if (r[0] === 'sim') return teacherSim();
    if (r[0] === 's' && T.subs[r[1]]) return teacherDetail(r[1], +r[2] || 1);
    return teacherList();
  }
  function teacherLock() {
    app().innerHTML = `<section class="center-page"><form class="card lock" id="lockF"><div class="logo big">ІТС</div><h2>Режим викладача</h2><p class="muted">Введіть PIN-код. За замовчуванням: ITS-2026, змініть його в «Налаштуваннях».</p>
      <input type="password" name="pin" placeholder="PIN-код" autofocus><button class="btn primary block">Увійти</button><a class="link-muted" href="#/">← Режим здобувача</a></form></section>`;
    $('#lockF').addEventListener('submit', (e) => { e.preventDefault(); if (E.cyrb53(e.target.pin.value) === C.teacherPinHash) { sessionStorage.setItem('its-t', '1'); render(); } else toast('Невірний PIN', 'bad'); });
  }
  function teacherList() {
    const list = subsList();
    const groups = [...new Set(list.map(([, s]) => s.student.group))];
    const gf = sessionStorage.getItem('its-gf') || '';
    const rows = list.filter(([, s]) => !gf || s.student.group === gf);
    app().innerHTML = `<section class="page wide">
      <div class="page-head"><div><div class="eyebrow">Режим викладача</div><h1>Роботи здобувачів</h1><div class="meta"><span>Завантажено: <b>${list.length}</b></span><span>Сіль генератора: <b>${C.salt}</b></span></div></div>
        <div class="head-actions">
          <label class="btn primary filebtn">⬆ Імпорт файлів .json<input type="file" id="impF" accept=".json,application/json" multiple></label>
          <button class="btn" data-a="csv" ${list.length ? '' : 'disabled'}>⬇ Відомість CSV</button>
          <button class="btn" data-a="printlist" ${list.length ? '' : 'disabled'}>🖶 Відомість</button>
          <button class="btn ghost" data-a="tclear" ${list.length ? '' : 'disabled'}>Очистити</button></div></div>
      <div class="drop" id="drop"><b>Перетягніть сюди файли здобувачів (.json)</b><span>Можна кілька файлів одночасно. Новіші версії замінюють старі.</span></div>
      ${list.length ? `<div class="filters"><label>Група <select id="gsel"><option value="">усі</option>${groups.map(g => `<option ${g === gf ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
        <span class="legend-s"><span class="sc A">A</span>90–100 <span class="sc B">B</span>82–89 <span class="sc C">C</span>75–81 <span class="sc D">D</span>64–74 <span class="sc E">E</span>60–63 <span class="sc FX">FX/F</span>&lt;60 · <i>курсив</i> — авто-оцінка, ще не затверджена</span></div>
      <div class="tbl-wrap"><table class="tbl roster"><tr><th>#</th><th>Здобувач</th><th>Група</th><th>№ / Вар.</th>${WORKS.map(w => `<th title="${esc(w.title)}">${w.short}</th>`).join('')}${C.grading.modules.map(m => `<th>${esc(m.name)}<br><small>/${m.points}</small></th>`).join('')}<th>Разом<br><small>/${C.grading.modules.reduce((s, m) => s + m.points, 0)}</small></th><th>Контроль</th></tr>
      ${rows.map(([key, s], i) => {
        const mp = modulePts(key), tot = Math.round(mp.reduce((a, b) => a + b, 0) * 10) / 10;
        const sigOk = sigOf(s) === s.sig, varOk = s.variant === variantOf(s.student.num);
        return `<tr><td>${i + 1}</td><td class="lft"><a href="#/teacher/s/${encodeURIComponent(key)}/1"><b>${esc(s.student.name)}</b></a><br><small class="muted">файл від ${fmtDate(s.exportedAt)}</small></td><td>${esc(s.student.group)}</td><td>${s.student.num} / <b>${s.variant}</b></td>
          ${WORKS.map(w => { const f = finalScore(key, w.id), ws_ = wsOf(s, w.id); const e = ects20(f.final); const cc = f.m.chk;
            return `<td class="scell"><a href="#/teacher/s/${encodeURIComponent(key)}/${w.id}" class="sc ${e.replace('F', 'FX').replace('FXX', 'FX')} ${f.manual === null ? 'auto' : ''}" title="Розрахунок ${cc.correct}/${cc.total} · аркуш ${pct(f.m.sheet)} · тест ${f.m.best ?? '—'}%">${E.fmt(f.final, 1)}</a><small>${ws_.submittedAt ? '✓' : ws_.startedAt ? '…' : '·'} ${cc.correct}/${cc.total}</small></td>`; }).join('')}
          ${mp.map(x => `<td><b>${E.fmt(x, 1)}</b></td>`).join('')}<td><b>${E.fmt(tot, 1)}</b></td>
          <td>${sigOk ? '<span class="okc" title="Цілісність файлу підтверджено">✓ файл</span>' : '<span class="badc" title="Файл змінювали поза тренажером">⚠ файл</span>'}<br>${varOk ? '<span class="okc">✓ варіант</span>' : '<span class="badc" title="Варіант не відповідає номеру у списку">⚠ варіант</span>'}</td></tr>`;
      }).join('')}</table></div>` : `<div class="empty card"><h3>Ще немає жодного файлу</h3><p>Здобувачі завантажують файл .json на вкладці «Здача» або в особистому кабінеті й надсилають його вам. Імпортуйте файли кнопкою вгорі або перетягніть їх у поле вище.</p></div>`}
    </section>`;
    const imp = $('#impF'); imp.addEventListener('change', e => importFiles(e.target.files));
    const dr = $('#drop');
    ['dragenter', 'dragover'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.add('on'); }));
    ['dragleave', 'drop'].forEach(ev => dr.addEventListener(ev, e => { e.preventDefault(); dr.classList.remove('on'); }));
    dr.addEventListener('drop', e => importFiles(e.dataTransfer.files));
    const gs = $('#gsel'); if (gs) gs.addEventListener('change', () => { sessionStorage.setItem('its-gf', gs.value); render(); });
  }
  function importFiles(files) {
    const arr = Array.from(files || []); let ok = 0, bad = 0, left = arr.length;
    if (!left) return;
    arr.forEach(file => {
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result);
          if (d.app !== APP || !d.student || !d.works) throw 0;
          const k = tKey(d), old = T.subs[k];
          if (!old || (d.exportedAt || '') >= (old.exportedAt || '')) T.subs[k] = d;
          ok++;
        } catch (e) { bad++; }
        if (--left === 0) { saveT(); toast(`Імпортовано: ${ok}${bad ? ', не розпізнано: ' + bad : ''}`, bad ? 'bad' : 'ok'); render(); }
      };
      rd.readAsText(file);
    });
  }
  function teacherDetail(key, id) {
    const sub = T.subs[key], work = W(id), w = wsOf(sub, id), v = sub.variant, salt = sub.salt || C.salt;
    const g = E.gen(id, v, salt), chk = E.check(id, v, salt, w.calc);
    const fs = finalScore(key, id), m = fs.m, gr = (T.grades[key] || {})[id] || {};
    const keys = subsList().map(x => x[0]), ix = keys.indexOf(key);
    const sigOk = sigOf(sub) === sub.sig, varOk = v === variantOf(sub.student.num);
    const q = w.quiz || {};
    app().innerHTML = `<section class="page wide">
      <div class="crumbs"><a href="#/teacher">Роботи здобувачів</a> / ${esc(sub.student.name)}</div>
      <div class="page-head"><div><h1>${esc(sub.student.name)}</h1><div class="meta"><span>Група <b>${esc(sub.student.group)}</b></span><span>№ <b>${sub.student.num}</b></span><span class="badge big">Варіант ${v}</span>
        ${sigOk ? '<span class="okc">✓ цілісність файлу</span>' : '<span class="badc">⚠ файл змінено поза тренажером</span>'} ${varOk ? '' : '<span class="badc">⚠ варіант ≠ номер у списку</span>'}${sub.student.email ? `<span>${esc(sub.student.email)}</span>` : ''}</div></div>
        <div class="head-actions">${ix > 0 ? `<a class="btn ghost" href="#/teacher/s/${encodeURIComponent(keys[ix - 1])}/${id}">← попередній</a>` : ''}${ix < keys.length - 1 ? `<a class="btn ghost" href="#/teacher/s/${encodeURIComponent(keys[ix + 1])}/${id}">наступний →</a>` : ''}<button class="btn" data-a="tprint" data-k="${esc(key)}" data-w="${id}">🖶 Звіт з еталоном</button></div></div>
      <nav class="tabs">${WORKS.map(x => { const f = finalScore(key, x.id); return `<a href="#/teacher/s/${encodeURIComponent(key)}/${x.id}" class="${x.id === id ? 'on' : ''}"><i>${x.id}</i>${x.short} <small class="${f.manual === null ? 'auto' : ''}">${E.fmt(f.final, 1)}</small></a>`; }).join('')}</nav>
      <div class="tgrid">
        <div>
          <div class="card"><h3>${esc(work.title)}</h3><p><b>Варіант ${v}:</b> ${esc(work.variants[v - 1])}</p>
            <div class="meta"><span>Розпочато: ${fmtDate(w.startedAt)}</span><span>Оновлено: ${fmtDate(w.updatedAt)}</span><span>Завершено: ${w.submittedAt ? fmtDate(w.submittedAt) : '—'}</span></div></div>
          <div class="card"><h3>Розрахунок: звірка з еталоном <small class="${chk.correct === chk.total ? 'okc' : 'badc'}">${chk.correct}/${chk.total}</small></h3>
            <table class="tbl"><tr><th>Показник</th><th>Здобувач</th><th>Еталон</th><th></th></tr>${chk.items.map(i => `<tr class="${i.ok ? 'rok' : i.filled ? 'rbad' : ''}"><td class="lft">${esc(i.f.label)}${i.f.unit ? ', ' + esc(i.f.unit) : ''}</td><td>${esc(i.f.kind === 'select' ? ((i.f.options.find(o => o.v === String(i.val)) || {}).t || '') : (i.val ?? ''))}</td><td>${esc(E.refText(i.f))}</td><td>${i.ok ? '✓' : i.filled ? '✗' : '—'}</td></tr>`).join('')}</table>
            <p class="muted">Спроб самоперевірки: <b>${w.calcAttempts || 0}</b>${w.calcChecked ? ' · остання ' + fmtDate(w.calcChecked.at) : ''}</p>
            <details><summary>Вихідні дані варіанта</summary>${calcData(work, g, v)}</details>
            ${[1, 3, 7].includes(id) ? `<details><summary>Графік</summary>${calcVisual(work, g, w, v, true)}</details>` : ''}
            ${id === 6 ? `<details><summary>Журнал віртуальних експериментів (${(w.log || []).length})</summary>${simLog(work, g, w)}</details>` : ''}</div>
          <div class="card ro"><h3>Робочий аркуш <small>${pct(m.sheet)}</small></h3>${work.sheet.map(it => sheetItem(work, it, w, true)).join('')}</div>
          <div class="card"><h3>Самоконтроль</h3><p>Найкраща спроба: <b>${q.best ?? '—'}${q.best !== null && q.best !== undefined ? '%' : ''}</b> · остання: <b>${q.last ?? '—'}${q.last !== null && q.last !== undefined ? '%' : ''}</b> · спроб: <b>${q.attempts || 0}</b></p></div>
        </div>
        <aside class="card rubric sticky">
          <h3>Оцінювання ПР${id}</h3>
          <div class="rb"><span>Розрахунок (${chk.correct}/${chk.total})</span><b>${E.fmt(m.sc.calc, 1)} / ${C.autoWeights.calc}</b></div>
          <div class="rb"><span>Робочий аркуш (${pct(m.sheet)})</span><b>${E.fmt(m.sc.sheet, 1)} / ${C.autoWeights.sheet}</b></div>
          <div class="rb"><span>Тест (${q.best ?? 0}%)</span><b>${E.fmt(m.sc.quiz, 1)} / ${C.autoWeights.quiz}</b></div>
          <div class="rb total"><span>Автоматична оцінка</span><b>${E.fmt(m.auto, 1)} / ${C.grading.perWork}</b></div>
          <label>Оцінка викладача (0–${C.grading.perWork})<input type="number" step="0.1" min="0" max="${C.grading.perWork}" id="gScore" value="${gr.score ?? ''}" placeholder="${E.fmt(m.auto, 1)}"></label>
          <div class="quick">${[20, 18, 17, 16, 15, 13, 12].map(x => `<button class="btn sm ghost" data-a="qs" data-v="${x}">${x}</button>`).join('')}<button class="btn sm" data-a="qs" data-v="${m.auto}">= авто</button></div>
          <div class="ects-l" id="ectsL">${ects20(fs.final)} · ${E.fmt(fs.final / C.grading.perWork * 100, 0)} балів зі 100</div>
          <label>Коментар для здобувача<textarea id="gCom" rows="5" placeholder="Зауваження до захисту…">${esc(gr.comment || '')}</textarea></label>
          <p class="muted small">Зміни зберігаються автоматично в цьому браузері. Критерії РПНД: A 18–20 · B 16,4–17,99 · C 15–16,39 · D 12,8–14,99 · E 12–12,79.</p>
        </aside>
      </div></section>`;
    const sv = () => { T.grades[key] = T.grades[key] || {}; T.grades[key][id] = { score: $('#gScore').value === '' ? null : Math.max(0, Math.min(C.grading.perWork, +$('#gScore').value)), comment: $('#gCom').value, at: new Date().toISOString() }; saveT(); const f = finalScore(key, id); $('#ectsL').textContent = `${ects20(f.final)} · ${E.fmt(f.final / C.grading.perWork * 100, 0)} балів зі 100`; flashSaved(); };
    $('#gScore').addEventListener('input', sv); $('#gCom').addEventListener('input', sv);
    app()._sv = sv;
  }
  function teacherKeys(id, vsel) {
    const work = W(id), vs = vsel === 'all' ? Array.from({ length: C.variantsCount }, (_, i) => i + 1) : [+vsel];
    app().innerHTML = `<section class="page wide"><div class="page-head"><div><div class="eyebrow">Режим викладача</div><h1>Ключі варіантів</h1><p class="muted">Вихідні дані й еталонні відповіді, згенеровані з сіллю ${C.salt}.</p></div>
      <div class="head-actions"><select id="kw">${WORKS.map(w => `<option value="${w.id}" ${w.id === id ? 'selected' : ''}>${w.short}. ${esc(w.title)}</option>`).join('')}</select>
      <select id="kv"><option value="all">усі варіанти</option>${Array.from({ length: C.variantsCount }, (_, i) => `<option ${String(i + 1) === vsel ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
      <button class="btn" data-a="printkeys">🖶 Друк</button></div></div>
      <div id="keysBody">${vs.map(v => { const g = E.gen(id, v, C.salt); return `<div class="card keycard"><h3>${work.short} · Варіант ${v}</h3><p class="muted">${esc(work.variants[v - 1])}</p><div class="grid2"><div>${calcData(work, g, v)}</div><div><table class="tbl"><tr><th>Показник</th><th>Еталон</th><th>Допуск</th></tr>${g.fields.map(f => `<tr><td class="lft">${esc(f.label)}${f.unit ? ', ' + esc(f.unit) : ''}</td><td><b>${esc(E.refText(f))}</b></td><td class="muted">${f.kind ? 'точно' : f.rel ? '±' + E.fmt(f.rel * 100, 1) + '%' : '±' + E.fmt(f.abs, f.abs < 0.01 ? 4 : 3)}</td></tr>`).join('')}</table></div></div></div>`; }).join('')}</div></section>`;
    $('#kw').addEventListener('change', e => { location.hash = `#/teacher/keys/${e.target.value}/${$('#kv').value}`; });
    $('#kv').addEventListener('change', e => { location.hash = `#/teacher/keys/${$('#kw').value}/${e.target.value}`; });
  }
  function tokensOf(sub, id) {
    const w = wsOf(sub, id), work = W(id); let txt = '';
    work.sheet.forEach(it => { if (it.type === 'text') txt += ' ' + (w.fields[it.id] || ''); else if (it.type === 'swot') { const s = w.tables.swot || {}; ['S', 'W', 'O', 'T'].forEach(k => (s[k] || []).forEach(r => txt += ' ' + (r.f || ''))); } else (w.tables[it.id] || []).forEach(r => Object.values(r || {}).forEach(x => txt += ' ' + x)); });
    const words = txt.toLowerCase().replace(/[^a-zа-щьюяґєії0-9’']+/gi, ' ').split(' ').filter(x => x.length > 2);
    const sh = new Set(); for (let i = 0; i < words.length - 2; i++) sh.add(words[i] + ' ' + words[i + 1] + ' ' + words[i + 2]);
    return { sh, n: words.length };
  }
  function teacherSim() {
    const list = subsList(), res = [];
    WORKS.forEach(work => {
      const tk = list.map(([k, s]) => ({ k, s, t: tokensOf(s, work.id) })).filter(x => x.t.n >= 30);
      for (let i = 0; i < tk.length; i++) for (let j = i + 1; j < tk.length; j++) {
        const a = tk[i].t.sh, b = tk[j].t.sh; let inter = 0; a.forEach(x => { if (b.has(x)) inter++; });
        const J = inter / (a.size + b.size - inter || 1);
        if (J >= 0.25) res.push({ w: work, a: tk[i], b: tk[j], J });
      }
    });
    res.sort((x, y) => y.J - x.J);
    app().innerHTML = `<section class="page wide"><div class="page-head"><div><div class="eyebrow">Режим викладача</div><h1>Перевірка текстів на схожість</h1><p class="muted">Текстові відповіді робочих аркушів порівнюються попарно за збігом трислівних фрагментів (коефіцієнт Жаккара). Показано пари зі збігом від 25 %.</p></div></div>
      ${res.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Робота</th><th>Здобувач 1</th><th>Здобувач 2</th><th>Збіг</th></tr>${res.map(r => `<tr><td>${r.w.short}</td><td class="lft"><a href="#/teacher/s/${encodeURIComponent(r.a.k)}/${r.w.id}">${esc(r.a.s.student.name)}</a> <small>(${esc(r.a.s.student.group)})</small></td><td class="lft"><a href="#/teacher/s/${encodeURIComponent(r.b.k)}/${r.w.id}">${esc(r.b.s.student.name)}</a> <small>(${esc(r.b.s.student.group)})</small></td><td><span class="lvl ${r.J >= 0.5 ? 'high' : r.J >= 0.35 ? 'mid' : 'low'}">${Math.round(r.J * 100)}%</span></td></tr>`).join('')}</table></div>` : `<div class="card empty"><h3>Підозрілих збігів не знайдено</h3><p class="muted">Або завантажено замало робіт для порівняння.</p></div>`}</section>`;
  }
  function teacherSettings() {
    app().innerHTML = `<section class="page"><div class="page-head"><div><div class="eyebrow">Режим викладача</div><h1>Налаштування</h1></div><div class="head-actions"><button class="btn ghost" data-a="tlock">Вийти з режиму викладача</button></div></div>
      <div class="grid2"><div class="card"><h3>Змінити PIN-код</h3><p class="muted">Сайт статичний, тому PIN лише обмежує доступ до режиму викладача. Повного захисту він не дає: будь-хто, хто відкриє код сторінки, побачить алгоритм генерації. Не публікуйте сам PIN.</p>
        <label>Новий PIN<input id="npin" type="text" placeholder="новий PIN"></label><div class="formula" id="pinout"><span>Рядок для assets/data.js</span><code>teacherPinHash: "…"</code></div></div>
      <div class="card"><h3>Поточна конфігурація</h3><table class="tbl kvt"><tr><td>Навчальний рік</td><td class="r">${esc(C.academicYear)}</td></tr><tr><td>Сіль генератора (salt)</td><td class="r"><b>${C.salt}</b></td></tr><tr><td>Кількість варіантів</td><td class="r">${C.variantsCount}</td></tr>
        ${C.grading.modules.map(m => `<tr><td>${esc(m.name)}</td><td class="r">ПР ${m.works.join(', ')} → ${m.points} балів</td></tr>`).join('')}<tr><td>Складники авто-оцінки</td><td class="r">розрахунок ${C.autoWeights.calc} · аркуш ${C.autoWeights.sheet} · тест ${C.autoWeights.quiz}</td></tr></table>
        <p class="muted">Щоб отримати нові числові дані на наступний рік, змініть <code>salt</code> в assets/data.js. Здобувачі, які вже почали роботу, залишаться на своїй старій солі, вона зберігається в їхньому файлі.</p>
        <button class="btn" data-a="tbackup">⬇ Резервна копія бази викладача</button> <label class="btn ghost filebtn">⬆ Відновити базу<input type="file" id="tRestore" accept=".json"></label></div></div></section>`;
    $('#npin').addEventListener('input', e => { $('#pinout').innerHTML = `<span>Рядок для assets/data.js</span><code>teacherPinHash: "${E.cyrb53(e.target.value)}",</code>`; });
    $('#tRestore').addEventListener('change', e => { const rd = new FileReader(); rd.onload = () => { try { const d = JSON.parse(rd.result); if (!d.subs) throw 0; T = d; saveT(); toast('Базу відновлено', 'ok'); } catch (x) { toast('Невірний файл', 'bad'); } }; rd.readAsText(e.target.files[0]); });
  }
  function rosterHTML() {
    const list = subsList();
    const css = 'body{font:11pt "Times New Roman",serif;margin:12mm}table{border-collapse:collapse;width:100%}td,th{border:1px solid #000;padding:3px 5px;text-align:center}td.l{text-align:left}h2{text-align:center;margin:0 0 2mm}p{text-align:center;margin:0 0 4mm}@page{size:A4 landscape;margin:0}';
    return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Відомість</title><style>${css}</style></head><body><h2>Відомість оцінювання практичних робіт</h2><p>${esc(C.discipline)} · ${esc(C.academicYear)} · ${esc(C.teacher)}</p>
      <table><tr><th>№</th><th>ПІБ</th><th>Група</th><th>Вар.</th>${WORKS.map(w => `<th>${w.short}</th>`).join('')}${C.grading.modules.map(m => `<th>${esc(m.name)}</th>`).join('')}<th>Разом</th></tr>
      ${list.map(([k, s], i) => { const mp = modulePts(k); return `<tr><td>${i + 1}</td><td class="l">${esc(s.student.name)}</td><td>${esc(s.student.group)}</td><td>${s.variant}</td>${WORKS.map(w => `<td>${E.fmt(finalScore(k, w.id).final, 1)}</td>`).join('')}${mp.map(x => `<td>${E.fmt(x, 1)}</td>`).join('')}<td><b>${E.fmt(mp.reduce((a, b) => a + b, 0), 1)}</b></td></tr>`; }).join('')}</table>
      <p style="text-align:left;margin-top:10mm">Викладач ____________________ ${esc(C.teacher)}</p></body></html>`;
  }
  function exportCSV() {
    const list = subsList(), sep = ';', n = (x) => E.fmt(x, 1).replace(/ /g, '');
    const head = ['№', 'ПІБ', 'Група', '№ у списку', 'Варіант', ...WORKS.map(w => w.short), ...WORKS.map(w => w.short + ' авто'), ...C.grading.modules.map(m => m.name), 'Разом', 'Цілісність файлу'];
    const lines = [head.join(sep)];
    list.forEach(([k, s], i) => { const mp = modulePts(k); lines.push([i + 1, '"' + s.student.name + '"', s.student.group, s.student.num, s.variant, ...WORKS.map(w => n(finalScore(k, w.id).final)), ...WORKS.map(w => n(finalScore(k, w.id).m.auto)), ...mp.map(n), n(mp.reduce((a, b) => a + b, 0)), sigOf(s) === s.sig ? 'так' : 'ні'].join(sep)); });
    download('Vidomist_ITS_' + new Date().toISOString().slice(0, 10) + '.csv', '﻿' + lines.join('\r\n'), 'text/csv');
  }

  /* ======================================================== ПОДІЇ */
  document.addEventListener('input', (e) => {
    const el = e.target, b = el.dataset && el.dataset.b; if (!b || !S.student) return;
    const p = b.split(':'), id = +p[1], w = ws(id); touch(id);
    if (p[0] === 'f') { w.fields[p[2]] = el.value; const it = W(id).sheet.find(x => x.id === p[2]); $('#m-' + p[2]).innerHTML = meterHTML(wc(el.value), it.minWords); if (el.classList.contains('auto')) autoGrow(el); }
    else if (p[0] === 't' || p[0] === 'r') {
      const t = (w.tables[p[2]] = w.tables[p[2]] || []), ri = +p[3]; t[ri] = t[ri] || {}; t[ri][p[4]] = el.value;
      const it = W(id).sheet.find(x => x.id === p[2]);
      if (p[0] === 't') { it.columns.filter(c => c.type === 'computed').forEach(c => { const cell = $(`#tc-${it.id}-${ri}`); if (cell) cell.textContent = computedCell(c.fn, t[ri]); }); const n = t.filter(r => rowFilled(it, r)).length; $('#tm-' + it.id).textContent = `${n} / ${it.minRows} рядків заповнено ${n >= it.minRows ? '✓' : ''}`; }
      else { const r = t[ri], sc = riskValid(r) ? int15(r.p) * int15(r.i) : NaN, lv = isFinite(sc) ? riskLevel(sc) : null; $('#rl-' + ri).innerHTML = lv ? `<span class="lvl ${lv[0]}">${sc} · ${lv[1]}</span>` : '—'; $('#rmatrix').innerHTML = riskMatrix(t); const n = t.filter(riskValid).length; $('#tm-' + it.id).textContent = `${n} / ${it.minRows} ризиків ${n >= it.minRows ? '✓' : ''}`; }
    }
    else if (p[0] === 's') { const sw = w.tables.swot; sw[p[2]][+p[3]][p[4]] = el.value; $('#swot-sum').innerHTML = swotSummary(sw); }
    else if (p[0] === 'c') {
      w.calc[p[2]] = el.value; el.classList.remove('ok', 'bad');
      if (id === 1 || id === 3) { const v = variantOf(S.student.num); $('#cvis').innerHTML = calcVisual(W(id), E.gen(id, v, saltOf(S)), w, v, false); }
    }
    save(); updWorkProgress(id);
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.q) { const [id, qi, oi] = el.dataset.q.split(':').map(Number); const w = ws(id); touch(id); w.quiz.answers[qi] = oi; save(); const ci = $('.quiz .check-info'); if (ci && !w.quiz.checked) ci.textContent = `Відповідей: ${Object.keys(w.quiz.answers).length} / ${W(id).quiz.length}`; }
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    const a = el.dataset.a, r = route(), id = +r[1];
    const act = {
      theme() { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; localStorage.setItem(LTH, t); },
      addrow() { const w = ws(id); w.tables[el.dataset.t] = w.tables[el.dataset.t] || []; w.tables[el.dataset.t].push({}); touch(id); save(); rerender(); },
      delrow() { const w = ws(id), t = w.tables[el.dataset.t]; if (t.length <= 1) return; const row = t[+el.dataset.r]; if (row && Object.values(row).some(x => String(x).trim()) && !confirm('Видалити заповнений рядок?')) return; t.splice(+el.dataset.r, 1); save(); rerender(); },
      swadd() { ws(id).tables.swot[el.dataset.q].push({}); save(); rerender(); },
      swdel() { const q = ws(id).tables.swot[el.dataset.q]; if (q.length <= 1) return; q.splice(+el.dataset.r, 1); save(); rerender(); },
      calccheck() {
        const w = ws(id), v = variantOf(S.student.num), chk = E.check(id, v, saltOf(S), w.calc);
        if (chk.filled === 0) { toast('Спочатку введіть результати', 'bad'); return; }
        w.calcAttempts = (w.calcAttempts || 0) + 1; w.calcChecked = { correct: chk.correct, total: chk.total, at: new Date().toISOString() }; touch(id); save();
        rerender();
        toast(chk.correct === chk.total ? 'Усі результати правильні!' : `Правильно ${chk.correct} з ${chk.total}. Перевірте позначені поля.`, chk.correct === chk.total ? 'ok' : 'bad');
      },
      clearlog() { ws(id).log = []; save(); rerender(); },
      quizcheck() {
        const work = W(id), w = ws(id), q = w.quiz;
        if (Object.keys(q.answers).length < work.quiz.length) { toast('Дайте відповідь на всі питання', 'bad'); return; }
        const sc = Math.round(work.quiz.filter((it, i) => q.answers[i] === it.a).length / work.quiz.length * 100);
        q.checked = true; q.last = sc; q.best = Math.max(q.best ?? 0, sc); q.attempts = (q.attempts || 0) + 1; touch(id); save(); rerender();
        toast(`Результат: ${sc}%`, sc >= 75 ? 'ok' : 'bad');
      },
      quizreset() { const q = ws(id).quiz; q.answers = {}; q.checked = false; save(); rerender(); },
      finish() { ws(id).submittedAt = new Date().toISOString(); save(); rerender(); toast('Роботу позначено завершеною. Завантажте файл для викладача.', 'ok'); },
      unfinish() { ws(id).submittedAt = null; save(); rerender(); },
      export() { exportJSON(); },
      print1() { const sub = { student: S.student, variant: variantOf(S.student.num), salt: saltOf(S), works: S.works }; printHTML(reportHTML(sub, [id], false)); },
      printall() { const sub = { student: S.student, variant: variantOf(S.student.num), salt: saltOf(S), works: S.works }; const ids = WORKS.map(w => w.id).filter(i => S.works[i] && S.works[i].startedAt); if (!ids.length) { toast('Ще немає розпочатих робіт', 'bad'); return; } printHTML(reportHTML(sub, ids, false)); },
      logout() { if (!confirm('Вийти? Дані залишаться в браузері лише до очищення. Рекомендуємо спочатку завантажити файл .json.\n\nВийти і видалити локальні дані?')) return; localStorage.removeItem(LS); S = { student: null, works: {} }; location.hash = '#/'; render(); },
      csv() { exportCSV(); },
      printlist() { printHTML(rosterHTML()); },
      tclear() { if (!confirm('Видалити всі імпортовані роботи та оцінки з цього браузера? Перед цим зробіть резервну копію в «Налаштуваннях».')) return; T = { subs: {}, grades: {} }; saveT(); render(); },
      tprint() { const k = el.dataset.k, sub = T.subs[k]; printHTML(reportHTML(sub, [+el.dataset.w], true)); },
      qs() { $('#gScore').value = (+el.dataset.v).toFixed(1); app()._sv && app()._sv(); },
      printkeys() { printHTML(`<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Ключі</title><style>body{font:10.5pt sans-serif;margin:12mm}table{border-collapse:collapse;width:100%;margin:2mm 0}td,th{border:1px solid #888;padding:2px 4px}.keycard{page-break-inside:avoid;border-bottom:2px solid #000;margin-bottom:5mm;padding-bottom:3mm}.grid2{display:grid;grid-template-columns:1.2fr 1fr;gap:5mm}.muted{color:#555}code{font-size:9pt}@page{size:A4;margin:0}</style></head><body>${$('#keysBody').innerHTML}</body></html>`); },
      tlock() { sessionStorage.removeItem('its-t'); location.hash = '#/'; render(); },
      tbackup() { download('ITS_teacher_backup_' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(T)); }
    }[a];
    if (act) { e.preventDefault(); act(); }
  });

  /* ======================================================== СТАРТ */
  document.documentElement.dataset.theme = localStorage.getItem(LTH) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  window.addEventListener('hashchange', render);
  window.addEventListener('storage', (e) => { if (e.key === LS) { S = load(LS) || { student: null, works: {} }; } });
  render();
})();
