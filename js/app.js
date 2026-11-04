/* Мез — приложение для изучения даргинского языка: тропа уроков, задания, алфавит, словарь, профиль,
   режим проверки для носителя. Прогресс хранится в localStorage этого браузера. */
(function () {
  'use strict';
  const D = window.DAR;

  // ---------- помощники ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const $ = s => document.querySelector(s);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sample = (a, n) => shuffle(a).slice(0, n);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };

  // Палочка: латинская I/i, цифра 1 и строчная ӏ считаются одной буквой
  const fixStick = s => s.replace(/[Ii1ӏ|]/g, 'Ӏ');
  const norm = s => fixStick(String(s)).toLowerCase().replace(/ё/g, 'е').replace(/[.,!?;:«»"“”—–\-()]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = s => s.split(/\s+/).map(w => w.replace(/^[«(]+|[.,!?;:»)]+$/g, '')).filter(Boolean);
  function lev(a, b) {
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i]);
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  // ---------- хранилище ----------
  const KEY = 'mez.v1';
  const LEVELS = [
    { id: 'easy', name: 'Начинающий', min: 5, goal: 10 },
    { id: 'mid', name: 'Средний', min: 10, goal: 20 },
    { id: 'pro', name: 'Продвинутый', min: 15, goal: 30 },
    { id: 'hard', name: 'Тяжёлый', min: 20, goal: 50 }
  ];
  const MAX_HEARTS = 5, HEART_MS = 20 * 60 * 1000;
  const fresh = () => ({ level: null, xp: 0, days: {}, done: {}, str: {}, hearts: MAX_HEARTS, heartsAt: Date.now(), sound: true, quests: null, review: {}, combo: 0 });
  let S;
  try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const goal = () => (LEVELS.find(l => l.id === S.level) || LEVELS[0]).goal;

  function regenHearts() {
    if (S.hearts >= MAX_HEARTS) { S.heartsAt = Date.now(); return; }
    const gained = Math.floor((Date.now() - S.heartsAt) / HEART_MS);
    if (gained > 0) { S.hearts = Math.min(MAX_HEARTS, S.hearts + gained); S.heartsAt += gained * HEART_MS; }
  }
  function streak() {
    let day = dayKey(), n = 0;
    if ((S.days[day] || 0) < goal()) day = addDays(day, -1);
    while ((S.days[day] || 0) >= goal()) { n++; day = addDays(day, -1); }
    return n;
  }
  function addXp(n) {
    S.xp += n; const k = dayKey(); S.days[k] = (S.days[k] || 0) + n;
    questProgress('xp', n); save();
  }
  const rankOf = xp => D.ranks.filter(r => r.xp <= xp).pop();
  const nextRank = xp => D.ranks.find(r => r.xp > xp);

  // Сила запоминания слова: 0…5, со временем слабеет
  function strength(id) {
    const r = S.str[id]; if (!r) return 0;
    const days = (Date.now() - r.t) / 864e5;
    return Math.max(0, Math.min(5, r.s - days / 3));
  }
  function mark(id, ok) {
    const r = S.str[id] || { s: 0, t: Date.now() };
    r.s = ok ? Math.min(5, strength(id) + 1) : Math.max(0, strength(id) - 1);
    r.t = Date.now(); S.str[id] = r;
  }

  // Задания дня
  function quests() {
    const today = dayKey();
    if (!S.quests || S.quests.day !== today) {
      S.quests = { day: today, list: [
        { id: 'xp', text: `Набери ${goal()} XP`, need: goal(), have: 0 },
        { id: 'lessons', text: 'Пройди 2 урока', need: 2, have: 0 },
        { id: 'combo', text: 'Ответь верно 8 раз подряд', need: 8, have: 0 }
      ] };
      save();
    }
    return S.quests.list;
  }
  function questProgress(id, n, absolute) {
    for (const q of quests()) {
      if (q.id !== id || q.have >= q.need) continue;
      q.have = absolute ? Math.max(q.have, n) : q.have + n;
      if (q.have >= q.need) { q.have = q.need; S.xp += 5; S.days[dayKey()] = (S.days[dayKey()] || 0) + 5; toast(`Задание выполнено: ${q.text}. +5 XP`); }
    }
  }

  // Правки носителя сразу видны в приложении
  const reviewKey = (kind, id) => `${kind}:${id}`;
  function applyFixes() {
    const fx = (kind, item, field = 'd') => {
      if (item.orig == null) item.orig = item[field];
      const r = S.review[reviewKey(kind, item.id)];
      item[field] = r && r.fix ? r.fix : item.orig;
    };
    D.words.forEach(w => fx('w', w));
    D.phrases.forEach(p => fx('p', p));
    D.dialogues.forEach(dl => dl.lines.forEach((l, i) => { l.id = `${dl.id}.${i}`; fx('d', l); }));
    D.proverbs.forEach((p, i) => { p.id = String(i); fx('v', p); });
  }
  applyFixes();

  // ---------- звук ----------
  let actx = null;
  function beep(kind) {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = { ok: [660, 880], bad: [220, 180], done: [523, 659, 784, 1047] }[kind];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
        o.type = kind === 'bad' ? 'square' : 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.2);
      });
    } catch (e) {}
  }

  // ---------- курс ----------
  const W = Object.fromEntries(D.words.map(w => [w.id, w]));
  const PH = Object.fromEntries(D.phrases.map(p => [p.id, p]));
  const DLG = Object.fromEntries(D.dialogues.map(d => [d.id, d]));
  const NODES = [];
  D.units.forEach(u => {
    u.lessons.forEach((ws, i) => NODES.push({ key: `${u.id}:${i}`, unit: u, type: 'words', words: ws, icon: '⭐', label: `Урок ${i + 1}` }));
    if (u.phrases.length) NODES.push({ key: `${u.id}:p`, unit: u, type: 'phrases', phrases: u.phrases, icon: '💬', label: 'Фразы' });
    if (u.story) NODES.push({ key: `${u.id}:s`, unit: u, type: 'story', story: u.story, icon: '📜', label: 'История' });
  });
  const isOpen = i => i === 0 || NODES.slice(0, i).every(n => S.done[n.key]);
  const currentIndex = () => { const i = NODES.findIndex(n => !S.done[n.key]); return i < 0 ? NODES.length - 1 : i; };
  const learnedWords = () => D.words.filter(w => S.str[w.id]);

  function example(w) {
    const d = w.d.replace(/\?$/, '');
    if (w.g === 'n') return { d: `Иш ${d} саби.`, r: `Это ${w.r.split(',')[0]}.` };
    if (w.g === 'm') return { d: `Ит ${d} сай.`, r: `Он — ${w.r.split(',')[0]}.` };
    if (w.g === 'f') return { d: `Ит ${d} сари.`, r: `Она — ${w.r.split(',')[0]}.` };
    return null;
  }

  // ---------- генератор заданий ----------
  function distractors(item, pool, n, key) {
    const seen = new Set([key(item)]);
    const out = [];
    for (const x of shuffle(pool)) {
      if (out.length >= n) break;
      const k = key(x); if (seen.has(k)) continue;
      seen.add(k); out.push(x);
    }
    return out;
  }
  const sameTheme = w => D.words.filter(x => x.t === w.t && x.id !== w.id);
  const wordPool = w => { const t = sameTheme(w); return t.length >= 3 ? t : D.words.filter(x => x.id !== w.id); };

  const T = {
    intro: w => ({ type: 'intro', w }),
    introP: p => ({ type: 'introP', p }),
    pick: w => ({ type: 'pick', w, opts: shuffle([w, ...distractors(w, wordPool(w), 3, x => x.e)]) }),
    d2r: w => ({ type: 'choice', key: w.id, prompt: 'Что это значит?', show: w.d, answer: w.r, opts: shuffle([w.r, ...distractors(w, wordPool(w), 3, x => x.r).map(x => x.r)]), dar: false }),
    r2d: w => ({ type: 'choice', key: w.id, prompt: 'Как сказать по-даргински?', show: w.r, pic: w.e, answer: w.d, opts: shuffle([w.d, ...distractors(w, wordPool(w), 3, x => x.d).map(x => x.d)]), dar: true }),
    type: w => ({ type: 'type', key: w.id, w }),
    match: ws => ({ type: 'match', pairs: ws.slice(0, 5) }),
    pd2r: p => ({ type: 'choice', key: 'p:' + p.id, prompt: 'Что значит эта фраза?', show: p.d, answer: p.r, opts: shuffle([p.r, ...distractors(p, D.phrases, 3, x => x.r).map(x => x.r)]), dar: false }),
    pr2d: p => ({ type: 'choice', key: 'p:' + p.id, prompt: 'Как сказать по-даргински?', show: p.r, answer: p.d, opts: shuffle([p.d, ...distractors(p, D.phrases, 3, x => x.d).map(x => x.d)]), dar: true }),
    buildRu: p => {
      const target = words(p.r.replace(/[.,!?—]/g, ' '));
      const extra = sample(D.phrases.filter(x => x.id !== p.id).flatMap(x => words(x.r.replace(/[.,!?—]/g, ' '))).filter(x => !target.includes(x)), 3);
      return { type: 'build', key: 'p:' + p.id, prompt: 'Переведи на русский', show: p.d, answers: [p.r, ...(p.alt || [])], bank: shuffle([...target, ...new Set(extra)]), dar: false };
    },
    buildDar: p => {
      const target = words(p.d);
      const extra = sample(D.phrases.filter(x => x.id !== p.id).flatMap(x => words(x.d)).filter(x => !target.map(norm).includes(norm(x))), 3);
      return { type: 'build', key: 'p:' + p.id, prompt: 'Составь по-даргински', show: p.r, answers: [p.d], bank: shuffle([...target, ...new Set(extra)]), dar: true };
    }
  };
  const exAsPhrase = (w) => { const e = example(w); return e && { id: 'ex-' + w.id, d: e.d, r: e.r, alt: [] }; };

  function buildLesson(node) {
    if (node.type === 'words') {
      const ws = node.words.map(id => W[id]);
      const old = shuffle(learnedWords().filter(w => !node.words.includes(w.id))).slice(0, 2);
      const tasks = [];
      ws.forEach(w => { tasks.push(T.intro(w), T.pick(w)); });
      tasks.push(T.d2r(ws[0]), T.r2d(ws[1] || ws[0]));
      tasks.push(T.match(shuffle([...ws, ...old])));
      const ex = ws.map(exAsPhrase).filter(Boolean);
      if (ex.length) tasks.push(T.buildDar(pick(ex)));
      tasks.push(T.type(pick(ws)));
      if (ws[2]) tasks.push(T.d2r(ws[2]));
      old.forEach(w => tasks.push(pick([T.d2r, T.r2d])(w)));
      return tasks;
    }
    if (node.type === 'phrases') {
      const ps = node.phrases.map(id => PH[id]).slice(0, 6);
      const tasks = [];
      ps.forEach((p, i) => {
        tasks.push(T.introP(p));
        tasks.push([T.pd2r, T.buildRu, T.pr2d, T.buildDar][i % 4](p));
      });
      shuffle(ps).slice(0, 3).forEach((p, i) => tasks.push([T.buildDar, T.pr2d, T.buildRu][i](p)));
      return tasks;
    }
    return [];
  }
  function buildPractice() {
    const ws = learnedWords().sort((a, b) => strength(a.id) - strength(b.id)).slice(0, 8);
    if (ws.length < 3) return null;
    const tasks = [];
    ws.forEach((w, i) => tasks.push([T.d2r, T.r2d, T.type, T.pick][i % 4](w)));
    tasks.splice(3, 0, T.match(ws.slice(0, 5)));
    const ps = D.phrases.filter(p => S.str['p:' + p.id]).slice(0, 2);
    ps.forEach(p => tasks.push(T.pd2r(p)));
    return tasks;
  }

  // ---------- общий вид ----------
  const app = () => $('#app');
  let tab = 'path';
  function toast(text) {
    const t = h('div', { class: 'toast' }, text);
    document.body.append(t); setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  }
  function modal(content) {
    const close = () => m.remove();
    const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) close(); } },
      h('div', { class: 'sheet' }, h('button', { class: 'x', 'aria-label': 'Закрыть', onclick: close }, '✕'), content));
    document.body.append(m);
    return close;
  }
  const mascot = (cls = '') => h('div', { class: 'mascot ' + cls, html: MASCOT });

  function render() {
    regenHearts(); save();
    if (!S.level) return renderWelcome();
    const root = app(); root.innerHTML = '';
    root.append(topbar());
    const main = h('main', { class: 'screen' });
    ({ path: renderPath, practice: renderPracticeTab, abc: renderAlphabet, dict: renderDict, me: renderProfile, review: renderReview })[tab](main);
    root.append(main, bottomNav());
  }
  function topbar() {
    return h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'logo' }, 'Мез'), h('small', {}, 'дарган мез')),
      h('div', { class: 'stats' },
        h('span', { class: 'stat', title: 'Серия дней' }, '🔥 ', streak()),
        h('span', { class: 'stat', title: 'Опыт' }, '⭐ ', S.xp),
        h('span', { class: 'stat', title: 'Сердца' }, '❤️ ', S.hearts)));
  }
  function bottomNav() {
    const items = [['path', '🗺️', 'Уроки'], ['practice', '🔁', 'Повторить'], ['abc', '🔤', 'Алфавит'], ['dict', '📚', 'Словарь'], ['me', '👤', 'Профиль']];
    return h('nav', { class: 'nav' }, items.map(([id, icon, label]) =>
      h('button', { class: tab === id || (id === 'me' && tab === 'review') ? 'on' : '', onclick: () => { tab = id; render(); scrollTo(0, 0); } },
        h('span', { class: 'ni' }, icon), h('span', {}, label))));
  }

  // ---------- приветствие ----------
  function renderWelcome() {
    let chosen = 'easy';
    const root = app(); root.innerHTML = '';
    const list = h('div', { class: 'levels' });
    const draw = () => { list.innerHTML = ''; LEVELS.forEach(l => list.append(
      h('button', { class: 'level' + (l.id === chosen ? ' on' : ''), onclick: () => { chosen = l.id; draw(); } },
        h('b', {}, l.name), h('span', {}, `${l.min} минут · ${l.goal} XP`)))); };
    draw();
    root.append(h('main', { class: 'welcome' },
      h('div', { class: 'logo big' }, 'Мез'),
      mascot('hello'),
      h('h1', {}, 'Салам!'),
      h('h2', {}, 'Учим даргинский язык'),
      h('p', {}, 'Пять минут в день — и ', h('b', {}, 'дарган мез'), ' станет ближе: новые слова, живые фразы, маленькие сценки из жизни.'),
      h('h3', {}, 'Выбери свой уровень'),
      list,
      h('button', { class: 'btn primary wide', onclick: () => { S.level = chosen; save(); render(); } }, 'Начать'),
      h('p', { class: 'fine' }, D.meta.note)));
  }

  // ---------- тропа ----------
  function renderPath(main) {
    const cur = currentIndex();
    let unitId = null, k = 0;
    const path = h('div', { class: 'path' });
    NODES.forEach((n, i) => {
      if (n.unit.id !== unitId) {
        unitId = n.unit.id; k = 0;
        const u = n.unit, num = D.units.indexOf(u) + 1;
        path.append(h('section', { class: 'unit', id: 'unit-' + u.id },
          h('div', {}, h('small', {}, `Раздел ${num}`), h('h2', {}, u.title), h('p', {}, u.desc)),
          u.tip ? h('button', { class: 'tipbtn', onclick: () => showTip(u.tip) }, '💡 Подсказка') : null));
      }
      const open = isOpen(i), done = !!S.done[n.key];
      const offset = Math.round(Math.sin(k++ * 1.1) * 70);
      path.append(h('div', { class: 'node-row', style: `transform:translateX(${offset}px)` },
        h('button', {
          class: 'node' + (done ? ' done' : '') + (i === cur ? ' cur' : '') + (!open ? ' locked' : ''),
          'aria-label': `${n.unit.title}: ${n.label}`,
          onclick: () => open ? startNode(n) : toast('Сначала пройди предыдущие уроки')
        }, h('span', {}, !open ? '🔒' : done ? '✓' : n.icon)),
        i === cur ? h('div', { class: 'start-tag' }, 'Начать') : h('div', { class: 'node-label' }, n.label)));
    });
    main.append(dailyCard(), path);
    setTimeout(() => { const el = document.querySelector('.node.cur'); el && el.scrollIntoView({ block: 'center' }); }, 30);
  }
  function dailyCard() {
    const today = S.days[dayKey()] || 0, g = goal();
    return h('div', { class: 'card daily' },
      h('div', { class: 'row' }, h('b', {}, 'Цель на сегодня'), h('span', {}, `${Math.min(today, g)} / ${g} XP`)),
      h('div', { class: 'bar' }, h('i', { style: `width:${Math.min(100, today / g * 100)}%` })));
  }
  function showTip(id) {
    const t = D.tips[id];
    modal(h('div', { class: 'tip' },
      h('h2', {}, '💡 ' + t.title),
      t.text.map(p => h('p', {}, p)),
      h('div', { class: 'examples' }, t.ex.map(([d, r]) => h('div', { class: 'ex' }, h('b', { class: 'dar' }, d), h('span', {}, r))))));
  }

  // ---------- повторение ----------
  function renderPracticeTab(main) {
    const ws = learnedWords();
    main.append(h('div', { class: 'card center' },
      mascot('small'),
      h('h2', {}, 'Повторение'),
      h('p', {}, ws.length >= 3
        ? `Ты знаешь ${ws.length} ${plural(ws.length, 'слово', 'слова', 'слов')}. Повтори самые слабые — так они запомнятся надолго. За повторение вернётся одно сердце.`
        : 'Пройди первый урок, и здесь появятся слова для повторения.'),
      h('button', { class: 'btn primary', disabled: ws.length < 3, onclick: () => { const t = buildPractice(); t && runLesson({ key: 'practice', type: 'practice', label: 'Повторение' }, t); } }, 'Повторить слова')));
    if (ws.length) {
      main.append(h('h3', { class: 'sub' }, 'Сила слов'),
        h('div', { class: 'list' }, ws.sort((a, b) => strength(a.id) - strength(b.id)).map(w => wordRow(w))));
    }
  }
  function strengthBars(id) {
    const s = Math.round(strength(id));
    return h('span', { class: 'sbar', title: 'Сила запоминания' }, [0, 1, 2, 3, 4].map(i => h('i', { class: i < s ? 'on' : '' })));
  }
  function wordRow(w) {
    return h('div', { class: 'wrow' }, h('span', { class: 'pic' }, w.e), h('b', { class: 'dar' }, w.d), h('span', { class: 'ru' }, w.r), S.str[w.id] ? strengthBars(w.id) : null);
  }

  // ---------- алфавит ----------
  function renderAlphabet(main) {
    main.append(h('h2', { class: 'title' }, 'Даргинский алфавит'),
      h('p', { class: 'lead' }, `${D.letters.length} ${plural(D.letters.length, 'буква', 'буквы', 'букв')}. Многие звуки пишутся двумя знаками, но читаются как один. Нажми на букву.`),
      h('div', { class: 'abc' }, D.letters.map(l => h('button', {
        class: 'letter' + (l.l.length > 1 ? ' special' : ''),
        onclick: () => modal(h('div', { class: 'center' },
          h('div', { class: 'big-letter' }, l.l, ' ', l.l.toLowerCase()),
          h('p', {}, l.hint),
          h('div', { class: 'ex' }, h('b', { class: 'dar' }, l.ex), h('span', {}, l.exr))))
      }, l.l, h('small', {}, l.l.toLowerCase())))));
  }

  // ---------- словарь ----------
  const THEMES = { family: 'Семья', animals: 'Звери', numbers: 'Числа', food: 'Еда', nature: 'Природа', weather: 'Погода', body: 'Тело', home: 'Дом и село', colors: 'Цвета', adj: 'Какой?', time: 'Время', questions: 'Вопросы', pronouns: 'Я, ты, мы', phrases: 'Фразы' };
  let dictTheme = 'all', dictQuery = '';
  function renderDict(main) {
    const listEl = h('div', { class: 'list' });
    const draw = () => {
      listEl.innerHTML = '';
      const q = norm(dictQuery);
      const match = (a, b) => !q || norm(a).includes(q) || norm(b).includes(q);
      if (dictTheme !== 'phrases') D.words.filter(w => (dictTheme === 'all' || w.t === dictTheme) && match(w.d, w.r)).forEach(w => listEl.append(wordRow(w)));
      if (dictTheme === 'all' || dictTheme === 'phrases') D.phrases.filter(p => match(p.d, p.r)).forEach(p => listEl.append(
        h('div', { class: 'wrow' }, h('span', { class: 'pic' }, '💬'), h('b', { class: 'dar' }, p.d), h('span', { class: 'ru' }, p.r))));
      if (!listEl.children.length) listEl.append(h('p', { class: 'lead center' }, 'Ничего не нашлось.'));
    };
    const input = h('input', { class: 'search', type: 'search', placeholder: 'Поиск по-даргински или по-русски', value: dictQuery,
      oninput: e => { e.target.value = fixStick(e.target.value); dictQuery = e.target.value; draw(); } });
    const chips = h('div', { class: 'chips' }, [['all', 'Все'], ...Object.entries(THEMES)].map(([id, name]) =>
      h('button', { class: 'chip' + (dictTheme === id ? ' on' : ''), onclick: () => { dictTheme = id; render(); } }, name)));
    main.append(h('h2', { class: 'title' }, 'Словарь'), input, chips, listEl);
    draw();
  }

  // ---------- профиль ----------
  function renderProfile(main) {
    const r = rankOf(S.xp), nr = nextRank(S.xp);
    const week = Array.from({ length: 7 }, (_, i) => addDays(dayKey(), i - 6));
    const maxDay = Math.max(goal(), ...week.map(d => S.days[d] || 0));
    const dn = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    const prov = D.proverbs[Math.floor(Date.now() / 864e5) % D.proverbs.length];
    const reviewed = Object.keys(S.review).length;
    main.append(
      h('div', { class: 'card center rank' },
        h('div', { class: 'rank-pic' }, r.e),
        h('h2', {}, h('span', { class: 'dar' }, r.d), ' — ', r.r),
        nr ? h('p', {}, `До звания «${nr.d}» (${nr.r.toLowerCase()}) осталось ${nr.xp - S.xp} XP`) : h('p', {}, 'Высшее звание!'),
        h('div', { class: 'grid3' },
          h('div', {}, h('b', {}, S.xp), h('small', {}, 'XP всего')),
          h('div', {}, h('b', {}, streak()), h('small', {}, plural(streak(), 'день подряд', 'дня подряд', 'дней подряд'))),
          h('div', {}, h('b', {}, learnedWords().length), h('small', {}, 'слов выучено')))),
      h('div', { class: 'card' }, h('h3', {}, 'Неделя'),
        h('div', { class: 'week' }, week.map(d => {
          const v = S.days[d] || 0, [y, m, dd] = d.split('-').map(Number);
          return h('div', { class: 'wd' }, h('div', { class: 'col' }, h('i', { class: v >= goal() ? 'ok' : '', style: `height:${Math.max(4, v / maxDay * 100)}%` })), h('small', {}, dn[new Date(y, m - 1, dd).getDay()]));
        }))),
      h('div', { class: 'card' }, h('h3', {}, 'Задания дня'),
        quests().map(q => h('div', { class: 'quest' + (q.have >= q.need ? ' ok' : '') },
          h('span', {}, q.have >= q.need ? '✅' : '🎯'), h('span', { class: 'qt' }, q.text), h('small', {}, `${q.have}/${q.need}`)))),
      h('div', { class: 'card proverb' }, h('h3', {}, `${prov.e} Пословица дня`), h('p', { class: 'dar' }, prov.d), h('p', {}, prov.r)),
      h('div', { class: 'card' }, h('h3', {}, 'Цель на день'),
        h('div', { class: 'levels small' }, LEVELS.map(l => h('button', { class: 'level' + (S.level === l.id ? ' on' : ''), onclick: () => { S.level = l.id; S.quests = null; save(); render(); } },
          h('b', {}, l.name), h('span', {}, `${l.goal} XP`)))),
        h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: S.sound, onchange: e => { S.sound = e.target.checked; save(); } }), ' Звуки')),
      h('div', { class: 'card' }, h('h3', {}, '🧐 Проверка для носителя языка'),
        h('p', {}, 'Если вы говорите по-даргински, помогите: отметьте, где слово или фраза написаны верно, а где ошибка, и впишите правильный вариант. Исправления сразу появятся в уроках на этом устройстве.'),
        h('p', { class: 'fine' }, `Проверено: ${reviewed}`),
        h('button', { class: 'btn', onclick: () => { tab = 'review'; render(); scrollTo(0, 0); } }, 'Открыть проверку')),
      h('div', { class: 'card fine' }, h('p', {}, D.meta.note), h('p', {}, 'Источники: ', D.meta.sources.map((s, i) => [i ? ', ' : '', h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.name)]), '.'), h('p', {}, 'Картинки — эмодзи вашего устройства.')),
      h('button', { class: 'btn danger', onclick: () => { if (confirm('Стереть весь прогресс? Отметки проверки останутся.')) { const rv = S.review; S = fresh(); S.review = rv; save(); tab = 'path'; render(); } } }, 'Начать курс заново'));
  }

  // ---------- проверка для носителя ----------
  let reviewKind = 'w';
  function renderReview(main) {
    const kinds = { w: 'Слова', p: 'Фразы', d: 'Диалоги', v: 'Пословицы' };
    const items = {
      w: D.words.map(w => ({ id: w.id, d: w.orig, r: w.r, pic: w.e })),
      p: D.phrases.map(p => ({ id: p.id, d: p.orig, r: p.r })),
      d: D.dialogues.flatMap(dl => dl.lines.map(l => ({ id: l.id, d: l.orig, r: l.r, who: `${dl.title} · ${l.who}` }))),
      v: D.proverbs.map(p => ({ id: p.id, d: p.orig, r: p.r }))
    };
    const total = Object.values(items).reduce((a, x) => a + x.length, 0);
    const list = h('div', { class: 'rv-list' });
    items[reviewKind].forEach(it => list.append(reviewRow(reviewKind, it)));
    main.append(
      h('button', { class: 'back', onclick: () => { tab = 'me'; render(); } }, '← Профиль'),
      h('h2', { class: 'title' }, 'Проверка для носителя'),
      h('p', { class: 'lead' }, `Проверено ${Object.keys(S.review).length} из ${total}. Отметки хранятся только в этом браузере — когда закончите, сохраните файл и отправьте его автору.`),
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: exportReview }, '💾 Сохранить файл'),
        navigator.share ? h('button', { class: 'btn', onclick: shareReview }, '📤 Отправить') : null),
      h('div', { class: 'chips' }, Object.entries(kinds).map(([k, name]) => h('button', { class: 'chip' + (reviewKind === k ? ' on' : ''), onclick: () => { reviewKind = k; render(); } }, `${name} (${items[k].length})`))),
      list);
  }
  function reviewRow(kind, it) {
    const key = reviewKey(kind, it.id);
    const r = S.review[key];
    const row = h('div', { class: 'rv' + (r ? (r.ok ? ' ok' : ' bad') : '') });
    const setR = v => { if (v) S.review[key] = v; else delete S.review[key]; save(); applyFixes(); render(); };
    const fixIn = h('input', { class: 'search', placeholder: 'Как правильно по-даргински', value: r && r.fix || it.d,
      oninput: e => { const p = e.target.selectionStart; e.target.value = fixStick(e.target.value); e.target.setSelectionRange(p, p); } });
    const noteIn = h('input', { class: 'search', placeholder: 'Комментарий (диалект, пояснение)', value: r && r.note || '' });
    row.append(
      h('div', { class: 'rv-text' },
        it.who ? h('small', {}, it.who) : null,
        h('b', { class: 'dar' }, it.pic ? it.pic + ' ' : '', it.d), h('span', {}, it.r),
        r && r.fix ? h('div', { class: 'fix' }, '✏️ ', r.fix) : null,
        r && r.note ? h('div', { class: 'fine' }, '💬 ', r.note) : null),
      h('div', { class: 'rv-btns' },
        h('button', { class: 'mini ok', title: 'Верно', onclick: () => setR(r && r.ok ? null : { ok: true }) }, '✓'),
        h('button', { class: 'mini bad', title: 'Ошибка', onclick: () => { row.querySelector('.rv-edit').hidden = false; fixIn.focus(); } }, '✗')),
      h('div', { class: 'rv-edit', hidden: true }, fixIn, noteIn,
        h('div', { class: 'row gap' },
          h('button', { class: 'btn primary', onclick: () => setR({ ok: false, fix: norm(fixIn.value) === norm(it.d) ? '' : fixIn.value.trim(), note: noteIn.value.trim() }) }, 'Сохранить'),
          r ? h('button', { class: 'btn', onclick: () => setR(null) }, 'Сбросить') : null)));
    return row;
  }
  function reviewData() {
    const find = key => {
      const [kind, id] = key.split(/:(.+)/);
      const src = kind === 'w' ? W[id] : kind === 'p' ? PH[id] : kind === 'v' ? D.proverbs[+id] : D.dialogues.flatMap(d => d.lines).find(l => l.id === id);
      return src ? { text: src.orig, ru: src.r } : {};
    };
    return { app: 'Мез — даргинский', version: D.meta.version, saved: new Date().toISOString(),
      marks: Object.entries(S.review).map(([key, v]) => ({ key, ...find(key), ...v })) };
  }
  function exportReview() {
    const blob = new Blob([JSON.stringify(reviewData(), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `mez-proverka-${dayKey()}.json` });
    document.body.append(a); a.click(); a.remove();
  }
  function shareReview() {
    const d = reviewData();
    const text = 'Проверка курса «Мез»\n' + d.marks.map(m => `${m.ok ? '✓' : '✗'} ${m.text} — ${m.ru}${m.fix ? ' → ' + m.fix : ''}${m.note ? ' (' + m.note + ')' : ''}`).join('\n');
    navigator.share({ title: 'Проверка курса «Мез»', text }).catch(() => {});
  }

  // ---------- запуск урока ----------
  function startNode(node) {
    regenHearts();
    if (S.hearts <= 0) return noHearts();
    if (node.type === 'story') return runStory(node);
    runLesson(node, buildLesson(node));
  }
  function noHearts() {
    const mins = Math.ceil((HEART_MS - (Date.now() - S.heartsAt)) / 60000);
    modal(h('div', { class: 'center' },
      h('div', { class: 'rank-pic' }, '💔'), h('h2', {}, 'Сердца закончились'),
      h('p', {}, `Новое сердце появится через ${mins} ${plural(mins, 'минуту', 'минуты', 'минут')}. А пока можно повторить слова — за это вернётся одно сердце.`),
      h('button', { class: 'btn primary', onclick: () => { document.querySelector('.modal')?.remove(); const t = buildPractice(); if (t) runLesson({ key: 'practice', type: 'practice' }, t); else toast('Пока нечего повторять'); } }, 'Повторить слова')));
  }

  function runLesson(node, tasks) {
    const practice = node.type === 'practice';
    const queue = tasks.slice();
    const total = queue.length;
    let pos = 0, mistakes = 0, answered = 0;
    const t0 = Date.now();
    const root = app(); root.innerHTML = '';
    const bar = h('i'), hearts = h('span', { class: 'stat' });
    const body = h('div', { class: 'task' });
    const foot = h('footer', { class: 'lfoot' });
    root.append(h('div', { class: 'lesson' },
      h('div', { class: 'lhead' },
        h('button', { class: 'x', 'aria-label': 'Выйти', onclick: () => { if (confirm('Выйти из урока? Прогресс урока не сохранится.')) render(); } }, '✕'),
        h('div', { class: 'bar' }, bar), hearts),
      body, foot));

    function next() {
      bar.style.width = `${Math.min(100, (pos / Math.max(total, queue.length)) * 100)}%`;
      hearts.textContent = practice ? '🔁' : `❤️ ${S.hearts}`;
      if (pos >= queue.length) return finish();
      const t = queue[pos++];
      const view = withKeys(renderTask(t));
      body.innerHTML = ''; body.append(view.el);
      foot.className = 'lfoot'; foot.innerHTML = '';
      if (view.auto) { foot.append(h('button', { class: 'btn primary wide', onclick: () => { view.done && view.done(); next(); } }, 'Понятно')); return; }
      const btn = h('button', { class: 'btn primary wide', disabled: true, onclick: () => check() }, 'Проверить');
      foot.append(btn);
      view.onReady = ok => { btn.disabled = !ok; };
      view.onSubmit = () => { if (!btn.disabled) check(); };
      function check() {
        const res = view.check();
        answered++;
        if (t.key) mark(t.key, res.ok);
        if (res.ok) { S.combo = (S.combo || 0) + 1; questProgress('combo', S.combo, true); beep('ok'); }
        else {
          S.combo = 0; mistakes++; beep('bad');
          if (!practice) {
            if (S.hearts === MAX_HEARTS) S.heartsAt = Date.now();
            S.hearts = Math.max(0, S.hearts - 1);
          }
          if (!t.retry && t.type !== 'match') queue.push({ ...t, retry: true, opts: t.opts && shuffle(t.opts), bank: t.bank && shuffle(t.bank) });
        }
        save();
        hearts.textContent = practice ? '🔁' : `❤️ ${S.hearts}`;
        foot.className = 'lfoot ' + (res.ok ? 'good' : 'bad');
        foot.innerHTML = '';
        foot.append(h('div', { class: 'verdict' },
          h('b', {}, res.ok ? pick(['Верно!', 'Отлично!', 'ГӀяхӀна!', 'Молодец!']) : 'Не совсем'),
          res.ok && res.note ? h('span', {}, res.note) : null,
          !res.ok && res.correct ? h('span', {}, 'Правильно: ', h('b', { class: 'dar' }, res.correct)) : null),
          h('button', { class: 'btn ' + (res.ok ? 'primary' : 'danger') + ' wide', onclick: () => {
            if (!practice && S.hearts <= 0) { render(); noHearts(); return; }
            next();
          } }, 'Дальше'));
      }
    }
    function finish() {
      const perfect = mistakes === 0;
      let xp = practice ? 5 : 10 + (perfect ? 5 : 0);
      if (practice) S.hearts = Math.min(MAX_HEARTS, S.hearts + 1);
      else { if (!S.done[node.key]) questProgress('lessons', 1); S.done[node.key] = true; }
      addXp(xp); beep('done');
      const acc = answered ? Math.round((answered - mistakes) / answered * 100) : 100;
      const secs = Math.round((Date.now() - t0) / 1000);
      root.innerHTML = '';
      root.append(h('main', { class: 'finish center' },
        mascot('happy'),
        h('h1', {}, practice ? 'Повторение пройдено!' : perfect ? 'Без единой ошибки!' : 'Урок пройден!'),
        h('div', { class: 'grid3' },
          h('div', { class: 'pill gold' }, h('small', {}, 'Опыт'), h('b', {}, `+${xp} XP`)),
          h('div', { class: 'pill green' }, h('small', {}, 'Точность'), h('b', {}, `${acc}%`)),
          h('div', { class: 'pill blue' }, h('small', {}, 'Время'), h('b', {}, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`))),
        practice ? h('p', {}, '❤️ +1 сердце') : null,
        h('button', { class: 'btn primary wide', onclick: () => { tab = practice ? 'practice' : 'path'; render(); } }, 'Продолжить')));
    }
    next();
  }

  // ---------- виды заданий ----------
  function renderTask(t) {
    const v = { el: null, onReady: () => {}, onSubmit: () => {} };
    const ready = ok => v.onReady(ok);
    if (t.type === 'intro' || t.type === 'introP') {
      const it = t.w || t.p, ex = t.w ? example(t.w) : null;
      v.auto = true;
      v.done = () => { if (!S.str[t.w ? it.id : 'p:' + it.id]) mark(t.w ? it.id : 'p:' + it.id, true); };
      v.el = h('div', { class: 'intro' },
        h('small', { class: 'kicker' }, t.w ? 'Новое слово' : 'Новая фраза'),
        t.w ? h('div', { class: 'pic huge' }, it.e) : mascot('small'),
        h('div', { class: 'dar word' }, it.d),
        h('div', { class: 'ru' }, it.r),
        ex ? h('div', { class: 'ex' }, h('b', { class: 'dar' }, ex.d), h('span', {}, ex.r)) : null);
      return v;
    }
    if (t.type === 'pick') {
      let sel = null;
      const grid = h('div', { class: 'pics' }, t.opts.map(o => {
        const b = h('button', { class: 'pcard', onclick: () => { grid.querySelectorAll('.pcard').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sel = o; ready(true); } }, h('span', {}, o.e));
        return b;
      }));
      v.el = h('div', {}, h('h2', { class: 'q' }, 'Где ', h('span', { class: 'dar hl' }, `«${t.w.d}»`), '?'), grid);
      v.check = () => {
        grid.querySelectorAll('.pcard').forEach((b, i) => { if (t.opts[i] === t.w) b.classList.add('right'); else if (t.opts[i] === sel) b.classList.add('wrong'); b.disabled = true; });
        if (t.w.id) mark(t.w.id, sel === t.w);
        return { ok: sel === t.w, correct: `${t.w.e} ${t.w.d} — ${t.w.r}` };
      };
      return v;
    }
    if (t.type === 'choice') {
      let sel = null;
      const opts = h('div', { class: 'opts' }, t.opts.map((o, i) => {
        const b = h('button', { class: 'opt' + (t.dar ? ' dar' : ''), onclick: () => { opts.querySelectorAll('.opt').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sel = o; ready(true); } }, h('kbd', {}, i + 1), o);
        return b;
      }));
      v.el = h('div', {},
        h('h2', { class: 'q' }, t.prompt),
        h('div', { class: 'bubble' }, t.pic ? h('span', { class: 'pic' }, t.pic) : mascot('tiny'), h('b', { class: t.dar ? '' : 'dar' }, t.show)),
        opts);
      v.check = () => {
        opts.querySelectorAll('.opt').forEach((b, i) => { if (t.opts[i] === t.answer) b.classList.add('right'); else if (t.opts[i] === sel) b.classList.add('wrong'); b.disabled = true; });
        return { ok: sel === t.answer, correct: t.answer };
      };
      v.keys = e => { const n = +e.key; if (n >= 1 && n <= t.opts.length) opts.children[n - 1].click(); };
      return v;
    }
    if (t.type === 'type') {
      const input = h('input', { class: 'answer dar', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Пиши здесь',
        oninput: e => { const p = e.target.selectionStart; e.target.value = fixStick(e.target.value); e.target.setSelectionRange(p, p); ready(norm(e.target.value).length > 0); },
        onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); v.onSubmit(); } } });
      const ins = ch => { const p = input.selectionStart ?? input.value.length; input.value = input.value.slice(0, p) + ch + input.value.slice(p); input.focus(); input.setSelectionRange(p + 1, p + 1); input.dispatchEvent(new Event('input')); };
      v.el = h('div', {},
        h('h2', { class: 'q' }, 'Напиши по-даргински'),
        h('div', { class: 'bubble' }, h('span', { class: 'pic' }, t.w.e), h('b', {}, t.w.r)),
        input,
        h('div', { class: 'keys' }, ['Ӏ', 'ъ', 'ь', 'я'].map(ch => h('button', { class: 'key', type: 'button', onclick: () => ins(ch) }, ch))),
        h('p', { class: 'fine' }, 'Палочку Ӏ можно набрать латинской i или цифрой 1.'));
      setTimeout(() => input.focus(), 50);
      v.check = () => {
        input.disabled = true;
        const a = norm(input.value), b = norm(t.w.d);
        if (a === b) return { ok: true };
        if (b.length >= 5 && lev(a, b) === 1) return { ok: true, note: `Почти! Пишется: ${t.w.d}` };
        return { ok: false, correct: t.w.d };
      };
      return v;
    }
    if (t.type === 'build') {
      const answer = h('div', { class: 'tiles answer-line' }), bank = h('div', { class: 'tiles bank' });
      const tiles = t.bank.map(w => h('button', { class: 'tile' + (t.dar ? ' dar' : ''), onclick: e => move(e.currentTarget) }, w));
      const move = b => { (b.parentNode === bank ? answer : bank).append(b); ready(answer.children.length > 0); };
      tiles.forEach(b => bank.append(b));
      v.el = h('div', {},
        h('h2', { class: 'q' }, t.prompt),
        h('div', { class: 'bubble' }, mascot('tiny'), h('b', { class: t.dar ? '' : 'dar' }, t.show)),
        answer, bank);
      v.check = () => {
        const got = norm([...answer.children].map(b => b.textContent).join(' '));
        tiles.forEach(b => b.disabled = true);
        return { ok: t.answers.some(a => norm(a) === got), correct: t.answers[0] };
      };
      return v;
    }
    if (t.type === 'match') {
      const left = shuffle(t.pairs), right = shuffle(t.pairs);
      let selL = null, selR = null, done = 0, errors = 0;
      const colL = h('div', { class: 'mcol' }), colR = h('div', { class: 'mcol' });
      const tryPair = () => {
        if (!selL || !selR) return;
        const [bl, wl] = selL, [br, wr] = selR;
        if (wl === wr) {
          bl.classList.add('matched'); br.classList.add('matched'); bl.disabled = br.disabled = true; done++; beep('ok'); mark(wl.id, true);
        } else {
          errors++; bl.classList.add('wrong'); br.classList.add('wrong'); beep('bad');
          setTimeout(() => { bl.classList.remove('wrong', 'sel'); br.classList.remove('wrong', 'sel'); }, 450);
        }
        bl.classList.remove('sel'); br.classList.remove('sel'); selL = selR = null;
        if (done === t.pairs.length) ready(true);
      };
      left.forEach(w => { const b = h('button', { class: 'mb dar', onclick: () => { colL.querySelectorAll('.mb').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); selL = [b, w]; tryPair(); } }, w.d); colL.append(b); });
      right.forEach(w => { const b = h('button', { class: 'mb', onclick: () => { colR.querySelectorAll('.mb').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); selR = [b, w]; tryPair(); } }, `${w.e} ${w.r}`); colR.append(b); });
      v.el = h('div', {}, h('h2', { class: 'q' }, 'Найди пары'), h('div', { class: 'match' }, colL, colR));
      v.check = () => ({ ok: errors <= 1, correct: errors > 1 ? 'Было несколько ошибок — повтори эти слова.' : '' });
      return v;
    }
  }
  let keyHandler = null;
  function withKeys(v) {
    if (keyHandler) removeEventListener('keydown', keyHandler);
    keyHandler = e => { if (document.activeElement && document.activeElement.tagName === 'INPUT') return; if (e.key === 'Enter') { const b = $('.lfoot .btn'); b && !b.disabled && b.click(); } else v.keys && v.keys(e); };
    addEventListener('keydown', keyHandler);
    return v;
  }

  // ---------- история ----------
  function runStory(node) {
    const dl = DLG[node.story];
    const root = app(); root.innerHTML = '';
    let i = 0;
    const lines = h('div', { class: 'story' });
    const foot = h('footer', { class: 'lfoot' });
    const bar = h('i');
    root.append(h('div', { class: 'lesson' },
      h('div', { class: 'lhead' }, h('button', { class: 'x', onclick: () => render() }, '✕'), h('div', { class: 'bar' }, bar), h('span', { class: 'stat' }, '📜')),
      h('div', { class: 'task' }, h('h2', { class: 'q' }, dl.title), h('p', { class: 'fine' }, 'Нажми на реплику, чтобы увидеть перевод.'), lines), foot));
    const who = [...new Set(dl.lines.map(l => l.who))];
    const step = () => {
      bar.style.width = `${(i / dl.lines.length) * 60}%`;
      if (i >= dl.lines.length) return quiz();
      const l = dl.lines[i++];
      const ru = h('div', { class: 'ru', hidden: true }, l.r);
      lines.append(h('div', { class: 'line ' + (who.indexOf(l.who) % 2 ? 'r' : 'l'), onclick: () => { ru.hidden = !ru.hidden; } },
        h('small', {}, l.who), h('b', { class: 'dar' }, l.d), ru));
      lines.lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
      foot.innerHTML = ''; foot.append(h('button', { class: 'btn primary wide', onclick: step }, 'Дальше'));
    };
    const quiz = () => {
      const qs = dl.quiz.map(([li, q]) => {
        const right = dl.lines[li].r;
        const pool = D.dialogues.flatMap(d => d.lines.map(x => x.r)).filter(x => x !== right);
        return { type: 'choice', prompt: q, show: dl.lines[li].d, answer: right, opts: shuffle([right, ...sample([...new Set(pool)], 3)]), dar: false };
      });
      runLesson({ ...node, type: 'storyquiz' }, qs);
    };
    step();
  }

  // ---------- талисман ----------
  // Горный тур в папахе — свой рисунок, без чужих картинок
  const MASCOT = `<svg viewBox="0 0 120 120" aria-hidden="true">
    <path d="M46 42C30 22 6 32 12 54c4 13 22 12 21-1-1-8-10-7-9-1" fill="none" stroke="#8a5a2b" stroke-width="8" stroke-linecap="round"/>
    <path d="M74 42c16-20 40-10 34 12-4 13-22 12-21-1 1-8 10-7 9-1" fill="none" stroke="#8a5a2b" stroke-width="8" stroke-linecap="round"/>
    <ellipse cx="33" cy="68" rx="10" ry="5" transform="rotate(-25 33 68)" fill="#b4743d"/>
    <ellipse cx="87" cy="68" rx="10" ry="5" transform="rotate(25 87 68)" fill="#b4743d"/>
    <ellipse cx="60" cy="70" rx="27" ry="34" fill="#c98b52"/>
    <ellipse cx="60" cy="90" rx="17" ry="13" fill="#f3d6b0"/>
    <path d="M37 45c0-20 46-20 46 0-8-6-38-6-46 0z" fill="#3b3b3b"/>
    <path d="M42 36q4 3 8 0t8 0 8 0 8 0" stroke="#5a5a5a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="49" cy="64" r="4.6" fill="#2a1a0e"/><circle cx="71" cy="64" r="4.6" fill="#2a1a0e"/>
    <circle cx="50.4" cy="62.6" r="1.5" fill="#fff"/><circle cx="72.4" cy="62.6" r="1.5" fill="#fff"/>
    <ellipse cx="55" cy="86" rx="2.6" ry="2" fill="#6b3d1e"/><ellipse cx="65" cy="86" rx="2.6" ry="2" fill="#6b3d1e"/>
    <path d="M53 94q7 6 14 0" stroke="#6b3d1e" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M57 103q3 9 6 0" fill="#e8dcc8"/>
    <ellipse cx="40" cy="78" rx="4.5" ry="2.8" fill="#e9a07a" opacity=".6"/><ellipse cx="80" cy="78" rx="4.5" ry="2.8" fill="#e9a07a" opacity=".6"/>
  </svg>`;

  render();
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
