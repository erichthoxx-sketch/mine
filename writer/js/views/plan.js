import { ic } from '../../../js/icons.js';
import { esc, acts, forms, openSheet, opt, toast, N, uid, ask } from '../../../js/ui.js';
import { num, fmtDate, pct } from '../../../js/format.js';
import { contestStatus, waitingStatus, forecastDate, bookSchedule, DOW, pubMap } from '../wcalc.js';
import { reminders } from './home.js';
import { widgetReminder } from './widgets.js';
import { linkTodos } from './links.js';
import { mkSummary } from './marketing.js';
import { goalsSection, goalTitle, goalToday, activeGoals } from './goals.js';
import { goalStatus, al, alNum, fromAl, contestVol, contestIn, contestOut } from '../wcalc.js';
import { addDays, addMonths, monthKey, npdDeadline, incomeSeries, sumSeries } from '../../../js/calc.js';
import { rub, fmtMonth } from '../../../js/format.js';
import { EVENT_TYPES } from '../../../js/charts.js';
import { PLATFORMS, progressBlock, daysTxt } from './books.js';
import { startEvent, finishEvent, chapterEvent, removeEvent } from '../sync.js';

const app = () => window.__app;
const zn = (n) => al(n);
const CSTATUS = { plan: 'Собираюсь', in: 'Участвую', sent: 'Подала', done: 'Итоги' };

// ---------- Планер: неделя → дела на выбранный день → ближайшие две недели → разделы ----------
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DOWF = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const dowI = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;
const dayName = (d, today) => {
  const n = dleft(d, today), base = `${DOWF[dowI(d)]}, ${Number(d.slice(8, 10))} ${MONG[Number(d.slice(5, 7)) - 1]}`;
  return n === 0 ? `Сегодня · ${base}` : n === 1 ? `Завтра · ${base}` : n === -1 ? `Вчера · ${base}` : base[0].toUpperCase() + base.slice(1);
};
const monday = (d) => addDays(d, -dowI(d));

// Все дела с датами в диапазоне [from, to]: выкладка глав по графику, отложенные главы, конкурсы, сроки книг, очередь, «жду ответа», «Доходы»
export function planItems(c, from, to) {
  const out = [], t = c.today, d = c.data;
  const add = (date, kind, title, sub, extra = {}) => { if (date && date >= from && date <= to) out.push({ date, kind, title, sub, ...extra }); };
  for (const b of c.wbooks) {
    if ((b.status || 'progress') !== 'progress') continue;
    const s = bookSchedule(b, t), pm = pubMap(b), bt = esc(b.title);
    // отложенные главы (на всех площадках)
    for (const [ch, pfs] of Object.entries(pm)) for (const [pf, v] of Object.entries(pfs)) {
      if (!v?.date || v.past) continue;
      if (v.date > t) add(v.date, 'wait', `⏱ ${esc(ch)} — выйдет сама`, `${bt} · ${esc(pf)}`, { to: '/book/' + b.id });
      else if (v.date >= from) add(v.date, 'done', `✓ ${esc(ch)} — выложена`, `${bt} · ${esc(pf)}`, { to: '/book/' + b.id });
    }
    // свободные дни графика: какую главу выкладывать
    s.free.forEach((date, i) => {
      const ch = s.queue[i];
      add(date, 'pub', `Выложить ${ch ? `«${esc(ch)}»` : 'новую главу'}`, `${bt} · ${esc(s.pf)}${ch ? '' : ' · глава ещё не написана'}`, { book: b.id, ch, pf: s.pf });
    });
    if (b.finishBy && !s.doneWriting) add(b.finishBy, 'book', `Дописать «${bt}»`, s.planCh ? `глав ${s.written} из ≈${s.planCh}` : '', { to: '/book/' + b.id });
    if (s.until && s.remaining !== 0) add(s.until, 'book', `Последняя глава «${bt}»`, b.publishUntil ? 'срок выкладки' : 'по графику', { to: '/book/' + b.id });
  }
  for (const x of d.w_contests) {
    if (x.status === 'done') continue;
    const b = x.bookId ? c.wbooksById[x.bookId] : null, st = contestStatus(x, b, t);
    add(x.end, 'contest', `Конкурс «${esc(x.name)}» — окончание`, [b ? esc(b.title) : '', st.need ? `не хватает ${contestVol(x)(st.need)}` : st.need === 0 ? 'объём ✓' : ''].filter(Boolean).join(' · '), { act: 'contest.edit', id: x.id });
    if (x.start && x.start >= t) add(x.start, 'contest', `Конкурс «${esc(x.name)}» — старт`, b ? esc(b.title) : '', { act: 'contest.edit', id: x.id });
  }
  for (const x of d.w_queue) if (!x.done && x.due) add(x.due < t ? t : x.due, 'queue', esc(x.title), `${x.due < t ? 'просрочено · ' : ''}${x.bookId && c.wbooksById[x.bookId] ? esc(c.wbooksById[x.bookId].title) : 'из очереди'}`, { act: 'queue.edit', id: x.id });
  for (const x of d.w_waiting) {
    if (x.done) continue;
    const remind = addDays(x.since, Number(x.remindDays) || 14), s = waitingStatus(x, t);
    add(remind < t ? t : remind, 'waitans', `Напомнить о себе: ${esc(x.who)}`, `${s.days} дн. без ответа${x.what ? ' · ' + esc(x.what.slice(0, 50)) : ''}`, { to: x.contactId ? '/link/' + x.contactId : '/links' });
  }
  for (const g of activeGoals(c)) if (g.deadline) add(g.deadline, 'goal', `Срок цели: ${esc(g.bookId && c.wbooksById[g.bookId] ? '«' + c.wbooksById[g.bookId].title + '»' : goalTitle(c, g))}`, '', { act: 'goal.edit', id: g.id });
  // заявка на приоритетные показы — на сегодня, пока актуально, и в день срока
  const wr = widgetReminder(c);
  if (wr) { add(t, 'money', esc(wr.title), esc(wr.sub), { to: wr.to }); if (wr.date !== t) add(wr.date, 'money', `Срок заявки на показы`, '19:00 МСК', { to: wr.to }); }
  for (const x of incomeItems(c, from, to)) add(x.date, 'money', x.title, x.sub, { href: '../' });
  // Связи: напоминания по контактам (просроченные — на сегодня)
  for (const x of linkTodos(c)) add(x.date < t ? t : x.date, 'waitans', `${esc(x.text)}`, `${esc(x.name)}${x.date < t ? ' · просрочено' : ''}`, { to: '/link/' + x.linkId });
  // Маркетинг: подготовить материалы к старту выкладки и к рекламе
  for (const m of marketingNeeds(c)) add(m.date, 'mk', esc(m.title), esc(m.sub), { to: m.to });
  const ord = { goal: -1, mk: 5.5, pub: 0, wait: 1, done: 2, contest: 3, book: 4, queue: 5, waitans: 6, money: 7 };
  return out.sort((x, y) => x.date.localeCompare(y.date) || ord[x.kind] - ord[y.kind]);
}
// Важное из «Доходов» по датам: налог (до 28-го), цифры Rocket (с 20-го), старт и конец рекламы, события дней
function incomeItems(c, from, to) {
  const d = c.data, t = c.today, out = [];
  const add = (date, title, sub = '') => { if (date >= from && date <= to) out.push({ date, title: esc(title), sub: esc(sub) }); };
  const mOf = (k) => (d.months || []).find((m) => m.id === k) || {};
  const rate = (Number(c.settings.taxRate) || 4) / 100;
  // налог: за каждый месяц с продажами — до 28-го следующего; неоплаченный просроченный — на сегодня
  for (let k = addMonths(monthKey(from), -3); k <= monthKey(to); k = addMonths(k, 1)) {
    if (mOf(k).taxPaid) continue;
    const end = addDays(addMonths(k, 1) + '-01', -1);
    const gross = sumSeries(incomeSeries(d.sales || [], [], k + '-01', end < t ? end : t), 'gross');
    if (!(gross > 0)) continue;
    const due = npdDeadline(k);
    if (k >= monthKey(t)) continue; // налог за текущий месяц — когда месяц закончится
    if (due < t) add(t, `Налог за ${fmtMonth(k)} — просрочен (был до ${fmtDate(due).slice(0, 5)})`, `≈ ${rub(gross * rate, 0)} · отметить «Оплачен» в «Доходах»`);
    else add(due, `Заплатить налог за ${fmtMonth(k)}`, `≈ ${rub(gross * rate, 0)} · до 28-го`);
  }
  // Rocket: с 20-го записать цифры за прошлый месяц
  for (let k = monthKey(from); k <= monthKey(to); k = addMonths(k, 1)) {
    const prev = addMonths(k, -1);
    if (mOf(prev).rocketFee != null) continue;
    const had = (d.sales || []).some((x) => x.date.startsWith(prev));
    if (had) add(k + '-20' < t ? (k === monthKey(t) ? t : k + '-20') : k + '-20', `Записать цифры Rocket за ${fmtMonth(prev)}`, 'из кабинета Rocket');
  }
  // реклама: старт и конец кампаний
  for (const k of d.campaigns || []) {
    if (k.oneOff) continue;
    if (k.start) add(k.start, `Старт рекламы «${k.name}»`);
    if (k.end) add(k.end, `Конец рекламы «${k.name}»`, 'решить, продлевать ли');
  }
  // события дней из «Доходов» (что вносила там сама, без выкладки глав из Мастерской)
  for (const day of d.days || []) {
    if (day.date < from || day.date > to) continue;
    for (const e of day.events || []) {
      if (e.src && String(e.src).startsWith('w:')) continue;
      const ty = EVENT_TYPES[e.type] || EVENT_TYPES.note;
      add(day.date, `${ty.label}${e.text ? ': ' + e.text : ''}`, e.bookId ? (d.books || []).find((b) => b.id === e.bookId)?.title || '' : '');
    }
  }
  return out;
}

// Маркетинг: за 2 недели до старта выкладки и за неделю до рекламы — чего не хватает из материалов (на сегодня)
export function marketingNeeds(c) {
  const t = c.today, out = [], soon = (d, n) => d && d >= t && d <= addDays(t, n);
  const left = (d) => { const n = Math.round((new Date(d + 'T00:00:00Z') - new Date(t + 'T00:00:00Z')) / 86400000); return n === 0 ? 'сегодня' : n === 1 ? 'завтра' : `через ${n} дн.`; };
  for (const b of c.wbooks) {
    if (b.status === 'done') continue;
    const m = mkSummary(c, b);
    if (soon(b.publishStart, 14)) {
      const miss = [!m.annotation ? 'аннотация' : '', m.texts < m.textsAll ? 'тексты для постов' : '', !m.banners ? 'баннеры' : ''].filter(Boolean);
      if (miss.length) out.push({ date: t, title: `Маркетинг к старту «${b.title}» (${left(b.publishStart)})`, sub: `не хватает: ${miss.join(', ')}`, to: '/mk/' + b.id });
    }
    const incomeId = c.incomeIdOf(b);
    for (const k of c.data.campaigns || []) {
      if (k.oneOff || !incomeId || k.bookId !== incomeId || !soon(k.start, 7)) continue;
      const miss = [!m.creatives ? 'креативы' : '', !m.ads ? 'тексты объявлений' : ''].filter(Boolean);
      if (miss.length) out.push({ date: t, title: `Таргет «${k.name}» стартует ${left(k.start)}`, sub: `для таргетолога нет: ${miss.join(', ')}`, to: '/mk/' + b.id });
    }
  }
  return out;
}

// компактная строка для «Дальше»: только суть, книга — если книг в работе несколько
const strip = (h) => String(h).replace(/<[^>]+>/g, '');
function shortItem(c, x, multi) {
  const book = multi && x.sub ? ` <span class="muted">· ${x.sub.split(' · ')[0]}</span>` : '';
  const t = x.kind === 'pub' ? `Выложить ${x.ch ? `«${esc(x.ch)}»` : 'главу'}` : x.kind === 'wait' ? x.title.replace(' — выйдет сама', '') : x.title;
  const attrs = x.kind === 'pub' ? `data-act="day.pick" data-v="${x.date}"` : x.href ? '' : x.to ? `data-act="go" data-to="${x.to}"` : `data-act="${x.act}" data-id="${x.id}"`;
  return `<a class="aitem tap" href="${x.href || '#'}" ${attrs}><i class="k-${x.kind}"></i>${t}${book}</a>`;
}
function itemHtml(c, x) {
  const body = `<span class="dot k-${x.kind}"></span><span class="pi-body"><span class="pi-t">${x.title}</span>${x.sub ? `<span class="pi-s">${x.sub}</span>` : ''}</span>`;
  if (x.kind === 'pub') {
    const today = x.date <= c.today;
    return `<div class="pitem">${body}<span class="pi-btns">${today ? `<button class="primary" data-act="pub.mark" data-id="${x.book}" data-ch="${esc(x.ch || '')}" data-pf="${esc(x.pf)}" data-mode="done">Выложила</button>` : ''}<button data-act="pub.mark" data-id="${x.book}" data-ch="${esc(x.ch || '')}" data-pf="${esc(x.pf)}" data-mode="plan" data-date="${x.date}" title="Поставить на таймер">⏱</button></span></div>`;
  }
  if (x.href) return `<a class="pitem tap" href="${x.href}">${body}</a>`;
  if (x.to) return `<a class="pitem tap" href="#" data-act="go" data-to="${x.to}">${body}</a>`;
  return `<a class="pitem tap" href="#" data-act="${x.act}" data-id="${x.id}">${body}</a>`;
}

// цели на сегодня — строки как в Планере
function goalRowsHtml(c) {
  const t = c.today;
  return activeGoals(c).map((g) => ({ g, s: goalStatus(g, g.bookId ? c.wbooksById[g.bookId] : null, t) })).filter((x) => x.s.active && x.s.todayDay)
    .map(({ g, s }) => `<div class="pitem"><span class="dot k-goal"${s.doneToday ? ' style="opacity:.4"' : ''}></span><a href="#" class="pi-body tap" data-act="goal.edit" data-id="${g.id}" style="color:inherit;text-decoration:none"><span class="pi-t">${s.doneToday ? '✓ ' : ''}${esc(goalTitle(c, g))}</span><span class="pi-s">${goalToday(c, g, s)}</span></a>${g.type === 'custom' ? `<span class="pi-btns"><button class="${s.doneToday ? '' : 'primary'}" data-act="goal.check" data-id="${g.id}">${s.doneToday ? '✓' : 'Сделала'}</button></span>` : ''}</div>`).join('');
}
// Колонка «Сегодня» на широком экране: что требует внимания сегодня + ближайшая неделя
export function sideToday(c) {
  const t = c.today, items = planItems(c, t, addDays(t, 7)), by = {};
  for (const x of items) (by[x.date] ||= []).push(x);
  const today = (by[t] || []), goals = goalRowsHtml(c);
  const next = Object.keys(by).filter((k) => k > t).sort();
  const multi = c.wbooks.filter((b) => (b.status || 'progress') === 'progress').length > 1;
  return `<div class="side-h"><div class="side-k">Сегодня</div><div class="side-date">${dayName(t, t).replace('Сегодня · ', '')}</div></div>
    <div class="side-stats"><div><span>Написано</span><b>+${alNum(c.writtenToday)} а.л.</b></div><div><span>За 7 дней</span><b>${alNum(c.writtenWeek)} а.л.</b></div></div>
    <div class="side-card">${today.length || goals ? `<div class="plist">${goals}${today.map((x) => itemHtml(c, x)).join('')}</div>` : '<p class="small muted" style="margin:0">На сегодня всё сделано ✓</p>'}</div>
    ${next.length ? `<div class="side-k" style="margin-top:20px">Неделя</div><div class="agenda side-agenda">${next.map((k) => `<div class="arow"><span class="ad">${DOW[dowI(k)]} ${Number(k.slice(8, 10))}</span><span class="ai">${by[k].map((x) => shortItem(c, x, multi)).join('')}</span></div>`).join('')}</div>` : ''}
    <button class="link side-more" data-act="go" data-to="/plan">Открыть Планер →</button>`;
}

// Компактный блок дел на сегодня — в левом меню на компьютере: только то, что требует действия
export function navToday(c) {
  const t = c.today;
  const imp = planItems(c, t, addDays(t, 2)).filter((x) => {
    if (x.kind === 'wait' || x.kind === 'done') return false;
    if (x.kind === 'pub' || x.kind === 'waitans' || x.kind === 'mk' || x.kind === 'queue') return x.date === t;
    return true; // сроки, конкурсы, налог, заявки — сегодня и в ближайшие 2 дня
  });
  const goals = activeGoals(c).map((g) => ({ g, s: goalStatus(g, g.bookId ? c.wbooksById[g.bookId] : null, t) })).filter((x) => x.s.active && x.s.todayDay && !x.s.doneToday);
  const when = (d) => (d === t ? '' : d === addDays(t, 1) ? 'завтра' : 'послезавтра');
  const row = (kind, title, sub, attrs, btn = '') => `<div class="nt-item" ${attrs}><i class="k-${kind}"></i><div class="nt-body"><div class="nt-t">${title}</div>${sub ? `<div class="nt-s">${sub}</div>` : ''}${btn}</div></div>`;
  const items = [
    ...goals.map(({ g, s }) => row('goal', esc(goalTitle(c, g)), goalToday(c, g, s), `data-act="goal.edit" data-id="${g.id}" role="button" tabindex="0"`, g.type === 'custom' ? `<button class="nt-btn" data-act="goal.check" data-id="${g.id}">Сделала</button>` : '')),
    ...imp.map((x) => x.kind === 'pub'
      ? row('pub', `Выложить ${x.ch ? `«${esc(x.ch)}»` : 'главу'}`, '', '', `<span class="nt-btns"><button class="nt-btn" data-act="pub.mark" data-id="${x.book}" data-ch="${esc(x.ch || '')}" data-pf="${esc(x.pf)}" data-mode="done">Выложила</button><button class="nt-btn" data-act="pub.mark" data-id="${x.book}" data-ch="${esc(x.ch || '')}" data-pf="${esc(x.pf)}" data-mode="plan" title="На таймер">⏱</button></span>`)
      : row(x.kind, x.title, when(x.date), x.href ? `onclick="location.href='${x.href}'" role="link" tabindex="0"` : x.to ? `data-act="go" data-to="${x.to}" role="button" tabindex="0"` : `data-act="${x.act}" data-id="${x.id}" role="button" tabindex="0"`)),
  ];
  const shown = items.slice(0, 5), more = items.length - shown.length;
  // выполненное сегодня — коротко, с галочкой
  const doneGoals = activeGoals(c).map((g) => ({ g, s: goalStatus(g, g.bookId ? c.wbooksById[g.bookId] : null, t) })).filter((x) => x.s.active && x.s.todayDay && x.s.doneToday);
  const doneHtml = doneGoals.map(({ g }) => `<div class="nt-done" data-act="goal.edit" data-id="${g.id}" role="button" tabindex="0">✓ ${esc(goalTitle(c, g))}</div>`).join('');
  // скоро: ближайшие 7 дней — выкладка, сроки, напоминания (без того, что уже выше)
  const soon = planItems(c, addDays(t, 1), addDays(t, 7)).filter((x) => x.kind !== 'done' && !(x.date <= addDays(t, 2) && x.kind !== 'wait' && x.kind !== 'pub'))
    .sort((x, y) => x.date.localeCompare(y.date)).slice(0, 4);
  const soonHtml = soon.length ? `<div class="nt-k">Скоро</div>${soon.map((x) => `<div class="nt-soon"><span class="nt-d">${DOW[dowI(x.date)]} ${Number(x.date.slice(8, 10))}</span><span>${x.kind === 'pub' ? `Выложить ${x.ch ? `«${esc(x.ch)}»` : 'главу'}` : x.kind === 'wait' ? x.title.replace(' — выйдет сама', '') : x.title}</span></div>`).join('')}` : '';
  return `<div class="nav-today"><div class="nt-date">${dayName(t, t).replace('Сегодня · ', '')}</div>
    ${items.length ? shown.join('') + (more ? `<button class="link nt-more" data-act="go" data-to="/plan">ещё ${more} →</button>` : '') : doneGoals.length ? '' : '<div class="nt-empty">Срочных дел нет ✓</div>'}
    ${doneHtml}
    <div class="nt-stat">написано сегодня <b>+${alNum(c.writtenToday)} а.л.</b></div>
    ${soonHtml}</div>`;
}

export function planView(a) {
  const c = a.ctx(), t = c.today, d = c.data, ui = a.ui;
  const sel = ui.planDay && ui.planDay >= addDays(t, -60) ? ui.planDay : t;
  // полоска из 7 дней: сегодня — посередине (три дня до и три после); стрелки листают на неделю
  const wk = addDays(t, 7 * (ui.planWeek || 0) - 3);
  const items = planItems(c, wk < t ? wk : t, addDays(sel > t ? sel : t, 35));
  const by = {};
  for (const x of items) (by[x.date] ||= []).push(x);
  // неделя
  const strip = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(wk, i), list = by[day] || [];
    const kinds = [...new Set(list.map((x) => x.kind))].slice(0, 3);
    return `<button class="wday${day === t ? ' today' : ''}${day === sel ? ' on' : ''}" data-act="plan.day" data-v="${day}"><span class="wk-d">${DOW[dowI(day)]}</span><span class="wk-n">${Number(day.slice(8, 10))}</span><span class="wk-dots">${kinds.map((k) => `<i class="k-${k}"></i>`).join('')}</span></button>`;
  }).join('');
  const dayList = by[sel] || [];
  // цели — только на сегодня: что осталось по норме, своя цель — с кнопкой «Сделала»
  const goalHtml = sel === t ? goalRowsHtml(c) : '';
  // дальше: следующие 14 дней после выбранного
  // «Дальше»: всё на 10 дней, а важное из «Доходов» (налог, Rocket, реклама) — на месяц вперёд
  const far = addDays(sel, 10);
  for (const k of Object.keys(by)) if (k > far) { by[k] = by[k].filter((x) => x.kind === 'money'); if (!by[k].length) delete by[k]; }
  const nextDays = Object.keys(by).filter((k) => k > sel && k <= addDays(sel, 35)).sort();
  const multi = c.wbooks.filter((b) => (b.status || 'progress') === 'progress').length > 1;
  const inWork = c.wbooks.filter((b) => (b.status || 'progress') === 'progress');
  const live = d.w_contests.filter((x) => !(x.end && x.end < t) && x.status !== 'done');
  const qTodo = d.w_queue.filter((x) => !x.done);
  const html = `
  <div class="card week">
    <div class="row between wk-head"><button class="link" data-act="plan.week" data-v="-1" aria-label="Прошлая неделя">‹</button>
      <span class="small muted">${Number(wk.slice(8, 10))} ${MONG[Number(wk.slice(5, 7)) - 1]} – ${Number(addDays(wk, 6).slice(8, 10))} ${MONG[Number(addDays(wk, 6).slice(5, 7)) - 1]}${ui.planWeek ? ' · <button class="link" data-act="plan.week" data-v="0">к сегодня</button>' : ''}</span>
      <button class="link" data-act="plan.week" data-v="1" aria-label="Следующая неделя">›</button></div>
    <div class="wstrip">${strip}</div>
  </div>
  <div class="card"><h2 style="margin:0 0 6px">${dayName(sel, t)}</h2>
    ${dayList.length || goalHtml ? `<div class="plist">${goalHtml}${dayList.map((x) => itemHtml(c, x)).join('')}</div>` : '<p class="small muted" style="margin:0">Дел на этот день нет.</p>'}</div>
  <div class="psec-h"><h2>Цели <span class="muted">${activeGoals(c).length || ''}</span></h2><button class="small-btn" data-act="goal.new">+ Цель</button></div>
  ${goalsSection(c)}
  <div class="psec-h"><h2>Книги в работе <span class="muted">${inWork.length || ''}</span></h2></div>
  ${booksPlan(c, inWork)}
  ${nextDays.length ? `<div class="card"><h2 style="margin:0 0 4px">Дальше</h2><div class="agenda">${nextDays.map((k) => `<div class="arow"><span class="ad">${DOW[dowI(k)]} ${Number(k.slice(8, 10))}</span><span class="ai">${by[k].map((x) => shortItem(c, x, multi)).join('')}</span></div>`).join('')}</div></div>` : ''}
  <div class="psec-h"><h2>Конкурсы <span class="muted">${live.length || ''}</span></h2><button class="small-btn" data-act="contest.new">+ Конкурс</button></div>
  ${contests(c)}
  <div class="psec-h"><h2>Что пишу дальше <span class="muted">${qTodo.length || ''}</span></h2><button class="small-btn" data-act="queue.new">+ В очередь</button></div>
  ${queue(c)}`;
  return { html };
}
acts['plan.day'] = (d) => { app().ui.planDay = d.v; };
acts['day.pick'] = (d) => { app().ui.planDay = d.v; window.scrollTo(0, 0); };
acts['plan.week'] = (d) => { const u = app().ui; u.planWeek = d.v === '0' ? 0 : (u.planWeek || 0) + Number(d.v); u.planDay = d.v === '0' ? null : addDays(app().ctx().today, 7 * u.planWeek); if (u.planWeek === 0) u.planDay = null; };

// ---------- книги в работе: коротко — что дальше, сколько выложено, кнопки ----------
const dleft = (date, today) => Math.round((new Date(date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000);
const leftTxt = (n) => (n < 0 ? `просрочено на ${-n} дн.` : n === 0 ? 'сегодня' : `осталось ${n} дн.`);
function booksPlan(c, list) {
  if (!list.length) return '<div class="card"><p class="muted small" style="margin:0">Книг в работе нет. Поставьте книге статус «В процессе» — она появится здесь.</p></div>';
  return `<div class="card plist-card">${list.map((b) => `<div class="pbook">
      <a href="#" class="pbook-t" data-act="go" data-to="/book/${b.id}"><span class="mk-cover">${b.cover ? `<img src="${b.cover}" alt="">` : `<span>${esc(b.title.slice(0, 1))}</span>`}</span><b>${esc(b.title)}</b></a>
      ${progressBlock(c, b)}
      <div class="row pbook-actions"><button class="primary" data-act="ch.publish" data-id="${b.id}">Выложила главу</button><button data-act="wb.dates" data-id="${b.id}">Сроки</button><button data-act="wb.finish" data-id="${b.id}">Книга завершена</button></div>
    </div>`).join('')}</div>`;
}
// Сроки: график выкладки (начало + дни недели) и примерное число глав — даты «выкладка до» и «допишу к» считаются сами;
// поставить свою дату можно, но не обязательно
acts['wb.dates'] = (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  const s = bookSchedule({ ...b, publishUntil: '', finishBy: '' }, c.today), days = new Set((b.pubDays || []).map(Number));
  openSheet(`Сроки — ${b.title}`, `
    <div class="f2"><div><label for="ps" style="margin-top:0">Начало выкладки</label><input id="ps" type="date" name="publishStart" value="${b.publishStart || ''}"></div>
    <div><label for="pc" style="margin-top:0">Глав в книге, примерно</label><input id="pc" name="planChapters" inputmode="numeric" value="${b.planChapters || ''}"></div></div>
    <label>Дни выкладки</label><div class="checks dow">${DOW.map((x, i) => `<label class="check"><input type="checkbox" name="dow" value="${i + 1}"${days.has(i + 1) ? ' checked' : ''}>${x}</label>`).join('')}</div>
    <div class="f2"><div><label for="pu">Выкладка до</label><input id="pu" type="date" name="publishUntil" value="${b.publishUntil || ''}"><div class="small muted">${s.untilAuto ? `сама считаю: ${fmtDate(s.untilAuto)}` : 'посчитаю сама по графику'}</div></div>
    <div><label for="fb">Допишу к</label><input id="fb" type="date" name="finishBy" value="${b.finishBy || ''}"><div class="small muted">${s.finishAuto ? `по темпу: ${fmtDate(s.finishAuto)}` : 'посчитаю по темпу письма'}</div></div></div>
    <div class="hint">Даты можно не заполнять — они считаются сами по графику, числу глав и темпу письма. Своя дата заменит расчёт. В дни выкладки на Главной появится напоминание выложить главу, если она ещё не отмечена и не стоит на таймере. Начало выкладки отметится событием «Старт книги» в «Доходах» (если выкладка началась больше недели назад — событие не ставлю).</div>`, async (fd) => {
    const patch = { publishStart: fd.get('publishStart') || '', pubDays: fd.getAll('dow').map(Number), planChapters: N(fd.get('planChapters')) || null, publishUntil: fd.get('publishUntil') || '', finishBy: fd.get('finishBy') || '' };
    await app().store.put('w_books', { ...b, ...patch });
    // старт давно прошедшей выкладки событием не ставим — оно уже неактуально (если не стояло раньше)
    const had = (app().store.data.days || []).some((x) => (x.events || []).some((e) => e.src === `w:${b.id}:start`));
    if (patch.publishStart && (had || patch.publishStart >= addDays(c.today, -7))) await startEvent(c, { ...b, ...patch }, patch.publishStart);
    else if (!patch.publishStart) await removeEvent(`w:${b.id}:start`);
    toast('Сроки сохранены');
  });
};
acts['wb.finish'] = (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  openSheet(`Книга завершена — ${b.title}`, `<label for="fd">Дата завершения</label><input id="fd" type="date" name="date" value="${c.today}" required>
    <div class="hint">Книга получит статус «Завершена», а в «Доходах» появится событие «Завершение книги».</div>`, async (fd) => {
    const date = fd.get('date') || c.today;
    await app().store.put('w_books', { ...b, status: 'done', finishedAt: date });
    await finishEvent(c, b, date);
    toast('Поздравляю с завершением!');
  }, { submitText: 'Завершена' });
};
// «Выложила главу» — тот же лист, что на странице книги: главы × площадки, сразу или отложенно
acts['ch.publish'] = (d) => acts['pub.mark']({ id: d.id });

// ---------- конкурсы ----------
function contests(c) {
  const list = [...c.data.w_contests].sort((x, y) => {
    const ex = (x.end && x.end < c.today) || x.status === 'done', ey = (y.end && y.end < c.today) || y.status === 'done';
    return ex - ey || (x.end || '9999').localeCompare(y.end || '9999');
  });
  return `${list.length ? list.map((x) => {
    const b = x.bookId ? c.wbooksById[x.bookId] : null;
    const s = contestStatus(x, b, c.today), cv = contestVol(x);
    const over = s.ended || x.status === 'done';
    const badge = s.daysLeft == null ? '' : over ? '<span class="badge">завершён</span>' : `<span class="badge ${s.daysLeft <= 7 ? 'bad' : s.daysLeft <= 14 ? 'warn' : 'good'}">осталось ${s.daysLeft} дн.</span>`;
    return `<div class="card${over ? ' faded' : ''}">
      <div class="row between"><b>${esc(x.name)}</b>${badge}</div>
      <div class="small muted">${x.platform ? esc(x.platform) + ' · ' : ''}${CSTATUS[x.status] || CSTATUS.plan}${x.start ? ' · с ' + fmtDate(x.start) : ''}${x.end ? ' по ' + fmtDate(x.end) : ''}</div>
      ${b ? `<div style="margin-top:8px"><div class="small">${ic('books')} ${esc(b.title)} — ${cv(s.chars)}${x.minChars ? ` из ${cv(x.minChars)}` : ''}${x.maxChars ? ` (не больше ${cv(x.maxChars)})` : ''}</div>
        ${s.progress != null ? `<div class="progress"><i style="width:${(s.progress * 100).toFixed(1)}%"></i></div>
        <div class="small">${s.need ? `нужно ещё ${cv(s.need)} · это ~${cv(s.perDay)} в день` : 'объём набран ✔︎'}${s.need ? (s.onTrack ? ` · <span class="up">успеваю ✔︎ (прогноз ${fmtDate(s.forecast)})</span>` : ` · <span class="down">${s.forecast ? 'при нынешнем темпе — к ' + fmtDate(s.forecast) : 'темпа пока нет'} ⚠︎</span>`) : ''}</div>` : ''}
        ${x.maxChars && s.chars > x.maxChars ? '<div class="small down">⚠︎ объём больше максимума конкурса</div>' : ''}</div>` : ''}
      ${x.conditions ? `<details style="margin-top:8px"><summary>Условия</summary><p class="idea-text">${esc(x.conditions)}</p></details>` : ''}
      <div class="row" style="margin-top:8px">${x.url ? `<a class="btn" href="${esc(x.url)}" target="_blank" rel="noopener">Страница конкурса</a>` : ''}<button class="link" data-act="contest.edit" data-id="${x.id}">Изменить</button></div>
    </div>`;
  }).join('') : '<div class="card"><p class="muted small" style="margin:0">Добавьте конкурс: даты, условия и книгу — приложение посчитает, сколько осталось дней и проходит ли книга по объёму.</p></div>'}`;
}
function contestForm(c, x = {}) {
  return `<label for="cn">Название</label><input id="cn" name="name" value="${esc(x.name || '')}" required>
  <div class="f2"><div><label for="cp">Площадка</label><input id="cp" name="platform" list="pl" value="${esc(x.platform || '')}"><datalist id="pl">${PLATFORMS.map((p) => `<option value="${p}">`).join('')}</datalist></div>
  <div><label for="cs">Статус</label><select id="cs" name="status">${Object.entries(CSTATUS).map(([k, v]) => opt(k, v, x.status || 'plan')).join('')}</select></div></div>
  <div class="f2"><div><label for="c1">Начало</label><input id="c1" type="date" name="start" value="${x.start || ''}"></div><div><label for="c2">Окончание</label><input id="c2" type="date" name="end" value="${x.end || ''}" required></div></div>
  <label for="cb">Книга на конкурс</label><select id="cb" name="bookId"><option value="">—</option>${c.wbooks.map((b) => opt(b.id, b.title, x.bookId)).join('')}</select>
  <div class="f3"><div><label for="cmin">Объём от</label><input id="cmin" name="minChars" inputmode="decimal" value="${contestOut(x.unit, x.minChars)}"></div><div><label for="cmax">до</label><input id="cmax" name="maxChars" inputmode="decimal" value="${contestOut(x.unit, x.maxChars)}"></div>
    <div><label for="cun">в чём</label><select id="cun" name="unit">${opt('al', 'а.л.', x.unit || 'al')}${opt('chars', 'знаках', x.unit || 'al')}</select></div></div>
  <div class="small muted">Как в условиях конкурса: если там знаки — выберите «знаках», и прогресс книги по этому конкурсу тоже будет в знаках.</div>
  <label for="cc">Условия</label><textarea id="cc" name="conditions" style="min-height:120px">${esc(x.conditions || '')}</textarea>
  <label for="cu">Ссылка на страницу конкурса</label><input id="cu" name="url" value="${esc(x.url || '')}">`;
}
const contestFrom = (fd) => ({ name: fd.get('name').trim(), platform: (fd.get('platform') || '').trim(), status: fd.get('status'), start: fd.get('start') || '', end: fd.get('end') || '', bookId: fd.get('bookId') || '', unit: fd.get('unit') || 'al', minChars: contestIn(fd.get('unit'), fd.get('minChars')), maxChars: contestIn(fd.get('unit'), fd.get('maxChars')), conditions: fd.get('conditions') || '', url: (fd.get('url') || '').trim() });
acts['plan.tab'] = (d) => { app().ui.planTab = d.v; };
acts['contest.new'] = () => openSheet('Новый конкурс', contestForm(app().ctx()), async (fd) => { await app().store.put('w_contests', { id: 'c' + uid(), ...contestFrom(fd) }); toast('Конкурс добавлен'); });
acts['contest.edit'] = (d) => {
  const x = app().ctx().data.w_contests.find((i) => i.id === d.id);
  openSheet('Конкурс', contestForm(app().ctx(), x) + `<p><button type="button" class="link danger" data-act="contest.del" data-id="${x.id}">Удалить конкурс</button></p>`, async (fd) => { await app().store.put('w_contests', { ...x, ...contestFrom(fd) }); });
};
acts['contest.del'] = async (d) => { if (await ask('Удалить конкурс?')) await app().store.remove('w_contests', d.id); };

// ---------- очередь ----------
function queue(c) {
  const list = [...c.data.w_queue].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const todo = list.filter((x) => !x.done), done = list.filter((x) => x.done);
  return `<div class="card list">${todo.length ? todo.map((x, i) => {
    const b = x.bookId ? c.wbooksById[x.bookId] : null;
    const fc = b && b.planChars ? forecastDate(b.history, c.today, Number(b.planChars)) : null;
    return `<div class="item"><div class="row between"><span><b>${i + 1}. ${esc(x.title)}</b></span><span class="row"><button class="link" data-act="queue.move" data-id="${x.id}" data-dir="-1" aria-label="Выше">▲</button><button class="link" data-act="queue.move" data-id="${x.id}" data-dir="1" aria-label="Ниже">▼</button></span></div>
      <div class="small muted">${b ? ic('books') + ' ' + esc(b.title) + ' · ' : ''}${x.due ? 'к ' + fmtDate(x.due) : 'без срока'}${fc ? ' · по темпу допишу к ' + fmtDate(fc) : ''}</div>
      ${x.note ? `<div class="small">${esc(x.note)}</div>` : ''}
      <div class="row"><button class="link" data-act="queue.done" data-id="${x.id}">✓ Готово</button><button class="link" data-act="queue.edit" data-id="${x.id}">Изменить</button></div></div>`;
  }).join('') : '<p class="muted small" style="margin:0">Очередь пуста.</p>'}</div>
  ${done.length ? `<details class="card"><summary>Сделано (${done.length})</summary>${done.map((x) => `<div class="item small row between"><span>✓ ${esc(x.title)}</span><button class="link" data-act="queue.undo" data-id="${x.id}">вернуть</button></div>`).join('')}</details>` : ''}`;
}
function queueForm(c, x = {}) {
  return `<label for="qt">Что писать</label><input id="qt" name="title" value="${esc(x.title || '')}" required>
  <label for="qb">Книга</label><select id="qb" name="bookId"><option value="">—</option>${c.wbooks.map((b) => opt(b.id, b.title, x.bookId)).join('')}</select>
  <label for="qd">К какому сроку</label><input id="qd" type="date" name="due" value="${x.due || ''}">
  <label for="qn">Заметка</label><textarea id="qn" name="note">${esc(x.note || '')}</textarea>`;
}
const queueFrom = (fd) => ({ title: fd.get('title').trim(), bookId: fd.get('bookId') || '', due: fd.get('due') || '', note: fd.get('note') || '' });
acts['queue.new'] = () => openSheet('В очередь', queueForm(app().ctx()), async (fd) => {
  const max = Math.max(0, ...app().ctx().data.w_queue.map((x) => x.order ?? 0));
  await app().store.put('w_queue', { id: 'q' + uid(), ...queueFrom(fd), order: max + 1, done: false });
});
acts['queue.edit'] = (d) => {
  const x = app().ctx().data.w_queue.find((i) => i.id === d.id);
  openSheet('Пункт очереди', queueForm(app().ctx(), x) + `<p><button type="button" class="link danger" data-act="queue.del" data-id="${x.id}">Удалить</button></p>`, async (fd) => { await app().store.put('w_queue', { ...x, ...queueFrom(fd) }); });
};
acts['queue.del'] = async (d) => { if (await ask('Удалить пункт?')) await app().store.remove('w_queue', d.id); };
acts['queue.done'] = (d) => { const x = app().ctx().data.w_queue.find((i) => i.id === d.id); return app().store.put('w_queue', { ...x, done: true }); };
acts['queue.undo'] = (d) => { const x = app().ctx().data.w_queue.find((i) => i.id === d.id); return app().store.put('w_queue', { ...x, done: false }); };
acts['queue.move'] = async (d) => {
  const list = [...app().ctx().data.w_queue].filter((x) => !x.done).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const i = list.findIndex((x) => x.id === d.id), j = i + Number(d.dir);
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await app().store.putMany('w_queue', list.map((x, k) => ({ ...x, order: k + 1 })));
};

export { pct };
