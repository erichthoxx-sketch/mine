// Цели: «главы к сроку», «N а.л. в день», «своя цель» — с напоминанием в дни цели
import { esc, acts, openSheet, closeSheet, opt, toast, N, uid, ask } from '../../../js/ui.js';
import { num, fmtDate, plural } from '../../../js/format.js';
import { GOAL_TYPES, goalStatus, goalSchedText, isChGoal, DOW, pubMap, pubPlatforms, al, alNum, fromAl } from '../wcalc.js';
const markedCount = (b) => { const pf = pubPlatforms(b)[0]; return Object.values(pubMap(b)).filter((x) => x[pf]?.date).length; };

const app = () => window.__app;
const zn = (n) => al(n);
// норма глав словами: «по главе в день», «1 глава в 2 дня», «≈ 1,5 главы в день»
const chTxt = (x) => (x >= 0.95 && x <= 1.05 ? 'по главе в день' : x < 1 ? `1 глава в ${Math.max(2, Math.round(1 / x))} ${plural(Math.max(2, Math.round(1 / x)), ['день', 'дня', 'дней'])}` : `≈ ${num(Math.ceil(x * 10) / 10)} главы в день`);

export function goalTitle(c, g) {
  const b = g.bookId ? c.wbooksById[g.bookId] : null;
  if (g.title) return g.title;
  const sch = goalSchedText(g), bt = b ? ` — «${b.title}»` : '';
  if (isChGoal(g)) { const n = Number(g.perDay) || 1; const st = g.type === 'write' && g.start && g.start > c.today ? `С ${fmtDate(g.start).slice(0, 5)}: ` : ''; return `${st}${n} ${plural(n, ['глава', 'главы', 'глав'])} ${sch}${bt}${g.deadline ? ' до ' + fmtDate(g.deadline).slice(0, 5) : ''}`; }
  if (g.type === 'daily') return `${zn(g.perDay)} ${sch}${bt}`;
  return 'Цель';
}
// строка «что сегодня» для цели
export function goalToday(c, g, s) {
  if (g.type === 'custom') return s.doneToday ? 'сегодня сделано' : s.todayDay ? 'сегодня — отметьте, когда сделаете' : 'сегодня не день цели';
  if (s.finished) return '✓ все главы отмечены';
  if (g.type === 'write' && g.start && g.start > c.today) return `начнёте ${fmtDate(g.start)} — напомню в первый день`;
  if (isChGoal(g)) {
    const glAcc = (n) => (n === 1 ? 'главу' : `${num(n)} ${plural(n, ['главу', 'главы', 'глав'])}`);
    const today = s.doneToday ? `сегодня ${s.todayCh === 1 ? 'отмечена глава' : `отмечено ${s.todayCh} ${plural(s.todayCh, ['глава', 'главы', 'глав'])}`}` : s.todayDay ? `сегодня нужно отметить ${s.needToday === 1 ? 'ещё одну главу' : `ещё ${glAcc(s.needToday)}`}` : 'сегодня не день цели';
    const warn = s.needPerDay && s.needPerDay > s.perDayCh * 1.05 ? ` · чтобы успеть к сроку, нужно ≈ ${num(Math.ceil(s.needPerDay * 10) / 10)} за день цели` : '';
    return today + warn;
  }
  if (!s.perDay) return isChGoal(g) ? 'укажите, сколько глав в книге, — посчитаю норму' : '';
  const per = isChGoal(g) ? `${chTxt(s.perDayCh)} (≈ ${zn(s.perDay)} в день)` : `${zn(s.perDay)} ${goalSchedText(g)}`;
  return s.doneToday ? `норма на сегодня выполнена · ${per}` : s.todayDay ? `сегодня ещё ${zn(s.needToday)} · ${per}` : `сегодня выходной · ${per}`;
}
export const activeGoals = (c) => c.data.w_goals.filter((g) => !g.done);

// раздел «Цели» в Планере
export function goalsSection(c) {
  const t = c.today, list = [...c.data.w_goals].sort((x, y) => (x.done - y.done) || (x.deadline || '9999').localeCompare(y.deadline || '9999'));
  const open = list.filter((g) => !g.done), done = list.filter((g) => g.done);
  const card = (g) => {
    const b = g.bookId ? c.wbooksById[g.bookId] : null, s = goalStatus(g, b, t);
    const late = g.deadline && g.deadline < t;
    return `<div class="goal${s.doneToday ? ' ok' : ''}">
      <div class="row between" style="flex-wrap:nowrap;gap:8px"><a href="#" class="goal-t tap" data-act="goal.edit" data-id="${g.id}"><b>${esc(goalTitle(c, g))}</b></a>
        ${g.type === 'custom' && s.todayDay ? `<button class="small-btn${s.doneToday ? '' : ' primary'}" data-act="goal.check" data-id="${g.id}">${s.doneToday ? '✓ Сделала' : 'Сделала'}</button>` : ''}</div>
      ${s.progress != null ? `<div class="progress"><i style="width:${(s.progress * 100).toFixed(1)}%"></i></div>` : ''}
      <div class="small">${goalToday(c, g, s)}</div>
      <div class="small muted">${[isChGoal(g) && s.left != null ? `осталось отметить ${s.left} ${plural(s.left, ['главу', 'главы', 'глав'])}` : '', g.deadline ? (late ? `срок ${fmtDate(g.deadline)} прошёл` : `до ${fmtDate(g.deadline)} · ${s.daysLeft} ${plural(s.daysLeft, ['день', 'дня', 'дней'])}${goalSchedText(g) === 'каждый день' ? '' : ' цели'}`) : '', s.streak > 1 ? `серия ${s.streak} ${plural(s.streak, ['день', 'дня', 'дней'])} подряд` : '', ''].filter(Boolean).join(' · ')}</div>
    </div>`;
  };
  return `${open.length ? `<div class="card goals">${open.map(card).join('')}</div>` : '<div class="card"><p class="small muted" style="margin:0">Поставьте цель — например, «1 глава по будням до 15 ноября» или «2 главы через день». В дни цели, пока норма не выполнена, будет напоминание.</p></div>'}
  ${done.length ? `<details class="card"><summary>Завершённые цели (${done.length})</summary>${done.map((g) => `<div class="item small row between"><span>✓ ${esc(goalTitle(c, g))}</span><button class="link" data-act="goal.edit" data-id="${g.id}">открыть</button></div>`).join('')}</details>` : ''}`;
}

// ---------- форма цели ----------
function goalForm(c, g = {}) {
  const type = g.type || 'finish', days = new Set((g.days && g.days.length ? g.days : [1, 2, 3, 4, 5]).map(Number));
  const ev = Number(g.every) || 1, dj = (g.days || []).map(Number).sort().join();
  const sched = ev === 2 ? 'every2' : ev > 2 ? 'every3' : !g.id ? 'week' : !dj || dj === '1,2,3,4,5,6,7' ? 'daily' : dj === '1,2,3,4,5' ? 'week' : 'dow';
  const b = g.bookId ? c.wbooksById[g.bookId] : c.wbooks.find((x) => (x.status || 'progress') === 'progress');
  return `<label for="gt" style="margin-top:0">Какая цель</label><select id="gt" name="type">${Object.entries(GOAL_TYPES).map(([k, v]) => opt(k, v, type)).join('')}</select>
    <div data-g="finish write daily"><label for="gb">Книга</label><select id="gb" name="bookId"><option value="">— все книги —</option>${c.wbooks.map((x) => opt(x.id, x.title, b?.id || '')).join('')}</select></div>
    <div data-g="custom"><label for="gn">Что сделать</label><input id="gn" name="title" value="${esc(g.type === 'custom' ? g.title || '' : '')}" placeholder="например: пост в Telegram, 30 минут редактуры"></div>
    <div data-g="finish"><label for="gc">Глав в книге, примерно</label><input id="gc" name="chapters" inputmode="numeric" value="${g.chapters || b?.planChapters || ''}" placeholder="например, 25">
      <div class="small muted">Изменится и в книге. Уже отмечено (выложено или на таймере): <span data-wch>${b ? markedCount(b) : '—'}</span></div></div>
    <div data-g="finish write"><label for="gpc">Сколько глав за день цели</label><input id="gpc" name="perDayCh" inputmode="numeric" value="${isChGoal(g) ? g.perDay || 1 : 1}"></div>
    <div data-g="write"><label for="gst">Начать писать с</label><input id="gst" type="date" name="start" value="${g.start || c.today}"></div>
    <div data-g="daily"><label for="gp">Сколько а.л. за день цели</label><input id="gp" name="perDay" inputmode="decimal" value="${g.type === 'daily' && g.perDay ? alNum(g.perDay) : ''}" placeholder="например, 0,4"></div>
    <div data-g="finish daily custom"><label for="gd">Срок</label><input id="gd" type="date" name="deadline" value="${g.deadline || ''}"></div>
    <label for="gev">Как часто</label><select id="gev" name="sched">${opt('daily', 'каждый день', sched)}${opt('week', 'по будням', sched)}${opt('every2', 'через день', sched)}${opt('every3', 'раз в 3 дня', sched)}${opt('dow', 'в выбранные дни недели', sched)}</select>
    <div data-sch="every"><label for="gfrom">Начиная с</label><input id="gfrom" type="date" name="from" value="${g.from || c.today}"></div>
    <div data-sch="dow"><div class="checks dow">${DOW.map((x, i) => `<label class="check"><input type="checkbox" name="dow" value="${i + 1}"${days.has(i + 1) ? ' checked' : ''}>${x}</label>`).join('')}</div></div>
    <div class="hint" data-ghint></div>`;
}
const HINT = {
  finish: 'Глава засчитывается, когда вы отмечаете её выложенной или ставите на таймер. В каждый день цели, пока глава не отмечена, на Главной будет напоминание. Если с таким графиком к сроку не успеть — подскажу, сколько нужно.',
  write: 'С этой даты в дни цели будет напоминание, пока главы не отмечены (выложены или на таймере). Срока окончания нет.',
  daily: 'В дни цели на Главной будет напоминание, пока норма не набрана. Объём берётся из Google Документа (кнопка «Обновить» на Главной).',
  custom: 'В дни цели на Главной будет напоминание, пока не отметите «Сделала».',
};
function wire() {
  const f = document.querySelector('dialog[open] form');
  if (!f) return;
  const c = app().ctx();
  const upd = () => {
    const t = f.elements.type.value;
    f.querySelectorAll('[data-g]').forEach((el) => { el.hidden = !el.dataset.g.split(' ').includes(t); });
    f.querySelector('[data-ghint]').textContent = HINT[t];
    const b = c.wbooksById[f.elements.bookId.value];
    const w = f.querySelector('[data-wch]'); if (w) w.textContent = b ? markedCount(b) : '—';
  };
  const sch = () => { const v = f.elements.sched.value; f.querySelector('[data-sch="every"]').hidden = !v.startsWith('every') || f.elements.type.value === 'write'; f.querySelector('[data-sch="dow"]').hidden = v !== 'dow'; };
  f.elements.sched.addEventListener('change', sch); sch();
  f.elements.type.addEventListener('change', () => { upd(); sch(); });
  f.elements.bookId.addEventListener('change', () => { const b = c.wbooksById[f.elements.bookId.value]; if (b && b.planChapters && !f.elements.chapters.value) f.elements.chapters.value = b.planChapters; upd(); });
  upd();
}
async function saveGoal(c, fd, g = {}) {
  const type = fd.get('type');
  const v = { type, bookId: type === 'custom' ? '' : fd.get('bookId') || '', title: type === 'custom' ? (fd.get('title') || '').trim() : '', deadline: fd.get('deadline') || '', days: fd.getAll('dow').map(Number), every: 1, from: '', perDay: type === 'daily' ? fromAl(fd.get('perDay')) : type === 'finish' || type === 'write' ? N(fd.get('perDayCh')) || 1 : null, start: type === 'write' ? fd.get('start') || c.today : '', chapters: type === 'finish' ? N(fd.get('chapters')) : null };
  if (type === 'custom' && !v.title) { toast('Напишите, что сделать'); return false; }
  if ((type === 'finish' || type === 'write') && !v.bookId) { toast('Выберите книгу'); return false; }
  if (type === 'write') v.deadline = '';
  if (type === 'finish' && !v.deadline) { toast('Укажите срок'); return false; }
  if (type === 'daily' && !(v.perDay > 0)) { toast('Сколько а.л. в день?'); return false; }
  const sc = fd.get('sched');
  if (sc === 'daily') v.days = [];
  else if (sc === 'week') v.days = [1, 2, 3, 4, 5];
  else if (sc.startsWith('every')) { v.days = []; v.every = sc === 'every2' ? 2 : 3; v.from = type === 'write' ? v.start : fd.get('from') || c.today; }
  else if (!v.days.length) { toast('Выберите хотя бы один день'); return false; }
  if (v.days.length === 7) v.days = [];
  await app().store.put('w_goals', { checks: {}, done: false, createdAt: new Date().toISOString(), ...g, ...v, id: g.id || 'g' + uid() });
  // число глав — общее с книгой
  const b = v.bookId ? c.wbooksById[v.bookId] : null;
  if (type === 'finish' && b && v.chapters && v.chapters !== b.planChapters) await app().store.put('w_books', { ...b, planChapters: v.chapters });
  toast(g.id ? 'Цель сохранена' : 'Цель добавлена');
}
acts['goal.new'] = (d) => {
  const c = app().ctx();
  openSheet('Новая цель', goalForm(c, d?.book ? { bookId: d.book } : {}), (fd) => saveGoal(c, fd), { submitText: 'Добавить' });
  wire();
};
acts['goal.edit'] = (d) => {
  const c = app().ctx(), g = c.data.w_goals.find((x) => x.id === d.id);
  if (!g) return;
  openSheet('Цель', goalForm(c, g) + `<div class="row between" style="margin-top:12px"><button type="button" data-act="goal.done" data-id="${g.id}">${g.done ? 'Вернуть в активные' : '✓ Цель достигнута'}</button><button type="button" class="link danger" data-act="goal.del" data-id="${g.id}">Удалить</button></div>`, (fd) => saveGoal(c, fd, g));
  wire();
};
acts['goal.done'] = async (d) => {
  const g = app().ctx().data.w_goals.find((x) => x.id === d.id);
  await app().store.put('w_goals', { ...g, done: !g.done, doneAt: g.done ? '' : app().ctx().today });
  closeSheet();
  toast(g.done ? 'Цель снова активна' : 'Поздравляю! Цель в завершённых');
};
acts['goal.del'] = async (d) => {
  if (!(await ask('Удалить цель?', 'Удалить'))) return;
  await app().store.remove('w_goals', d.id);
  closeSheet();
};
acts['goal.check'] = async (d) => {
  const c = app().ctx(), g = c.data.w_goals.find((x) => x.id === d.id), checks = { ...(g.checks || {}) };
  if (checks[c.today]) delete checks[c.today]; else checks[c.today] = true;
  await app().store.put('w_goals', { ...g, checks });
};
