import { ic } from '../../../js/icons.js';
import { esc, acts, forms, openSheet, opt, toast, N, uid, ask } from '../../../js/ui.js';
import { num, fmtDate, pct } from '../../../js/format.js';
import { contestStatus, waitingStatus, forecastDate } from '../wcalc.js';
import { PLATFORMS } from './books.js';

const app = () => window.__app;
const zn = (n) => num(n || 0) + ' зн.';
const CSTATUS = { plan: 'Собираюсь', in: 'Участвую', sent: 'Подала', done: 'Итоги' };

export function planView(a) {
  const c = a.ctx(), t = a.ui.planTab;
  const d = c.data;
  const live = d.w_contests.filter((x) => !(x.end && x.end < c.today) && x.status !== 'done').length;
  const overdue = d.w_waiting.filter((x) => waitingStatus(x, c.today).overdue).length;
  const tab = (k, label, n) => `<button class="chip${t === k ? ' on' : ''}" data-act="plan.tab" data-v="${k}">${label}${n ? ` · ${n}` : ''}</button>`;
  const body = t === 'queue' ? queue(c) : t === 'waiting' ? waiting(c) : contests(c);
  return { html: `<div class="chips">${tab('contests', 'Конкурсы', live)}${tab('queue', 'Что пишу дальше', d.w_queue.filter((x) => !x.done).length)}${tab('waiting', 'Жду ответа', overdue ? overdue + ' ⚠︎' : '')}</div>${body}` };
}

// ---------- конкурсы ----------
function contests(c) {
  const list = [...c.data.w_contests].sort((x, y) => {
    const ex = (x.end && x.end < c.today) || x.status === 'done', ey = (y.end && y.end < c.today) || y.status === 'done';
    return ex - ey || (x.end || '9999').localeCompare(y.end || '9999');
  });
  return `<div class="row between" style="margin:6px 0 10px"><h2 style="margin:0">Конкурсы</h2><button class="primary" data-act="contest.new">+ Конкурс</button></div>
  ${list.length ? list.map((x) => {
    const b = x.bookId ? c.wbooksById[x.bookId] : null;
    const s = contestStatus(x, b, c.today);
    const over = s.ended || x.status === 'done';
    const badge = s.daysLeft == null ? '' : over ? '<span class="badge">завершён</span>' : `<span class="badge ${s.daysLeft <= 7 ? 'bad' : s.daysLeft <= 14 ? 'warn' : 'good'}">осталось ${s.daysLeft} дн.</span>`;
    return `<div class="card${over ? ' faded' : ''}">
      <div class="row between"><b>${esc(x.name)}</b>${badge}</div>
      <div class="small muted">${x.platform ? esc(x.platform) + ' · ' : ''}${CSTATUS[x.status] || CSTATUS.plan}${x.start ? ' · с ' + fmtDate(x.start) : ''}${x.end ? ' по ' + fmtDate(x.end) : ''}</div>
      ${b ? `<div style="margin-top:8px"><div class="small">${ic('books')} ${esc(b.title)} — ${zn(s.chars)}${x.minChars ? ` из ${zn(x.minChars)}` : ''}${x.maxChars ? ` (не больше ${zn(x.maxChars)})` : ''}</div>
        ${s.progress != null ? `<div class="progress"><i style="width:${(s.progress * 100).toFixed(1)}%"></i></div>
        <div class="small">${s.need ? `нужно ещё ${zn(s.need)} · это ~${zn(s.perDay)} в день` : 'объём набран ✔︎'}${s.need ? (s.onTrack ? ` · <span class="up">успеваю ✔︎ (прогноз ${fmtDate(s.forecast)})</span>` : ` · <span class="down">${s.forecast ? 'при нынешнем темпе — к ' + fmtDate(s.forecast) : 'темпа пока нет'} ⚠︎</span>`) : ''}</div>` : ''}
        ${x.maxChars && s.chars > x.maxChars ? '<div class="small down">⚠︎ объём больше максимума конкурса</div>' : ''}</div>` : ''}
      ${x.conditions ? `<details style="margin-top:8px"><summary>Условия</summary><p class="idea-text">${esc(x.conditions)}</p></details>` : ''}
      <div class="row" style="margin-top:8px">${x.url ? `<a class="btn" href="${esc(x.url)}" target="_blank" rel="noopener">Страница конкурса</a>` : ''}<button class="link" data-act="contest.edit" data-id="${x.id}">Изменить</button></div>
    </div>`;
  }).join('') : '<div class="card"><p class="muted">Добавьте конкурс: даты, условия и книгу — приложение посчитает, сколько осталось дней и успеваете ли вы по объёму.</p></div>'}`;
}
function contestForm(c, x = {}) {
  return `<label for="cn">Название</label><input id="cn" name="name" value="${esc(x.name || '')}" required>
  <div class="f2"><div><label for="cp">Площадка</label><input id="cp" name="platform" list="pl" value="${esc(x.platform || '')}"><datalist id="pl">${PLATFORMS.map((p) => `<option value="${p}">`).join('')}</datalist></div>
  <div><label for="cs">Статус</label><select id="cs" name="status">${Object.entries(CSTATUS).map(([k, v]) => opt(k, v, x.status || 'plan')).join('')}</select></div></div>
  <div class="f2"><div><label for="c1">Начало</label><input id="c1" type="date" name="start" value="${x.start || ''}"></div><div><label for="c2">Окончание</label><input id="c2" type="date" name="end" value="${x.end || ''}" required></div></div>
  <label for="cb">Книга на конкурс</label><select id="cb" name="bookId"><option value="">—</option>${c.wbooks.map((b) => opt(b.id, b.title, x.bookId)).join('')}</select>
  <div class="f2"><div><label for="cmin">Объём от, знаков</label><input id="cmin" name="minChars" inputmode="numeric" value="${x.minChars ?? ''}"></div><div><label for="cmax">до, знаков</label><input id="cmax" name="maxChars" inputmode="numeric" value="${x.maxChars ?? ''}"></div></div>
  <label for="cc">Условия</label><textarea id="cc" name="conditions" style="min-height:120px">${esc(x.conditions || '')}</textarea>
  <label for="cu">Ссылка на страницу конкурса</label><input id="cu" name="url" value="${esc(x.url || '')}">`;
}
const contestFrom = (fd) => ({ name: fd.get('name').trim(), platform: (fd.get('platform') || '').trim(), status: fd.get('status'), start: fd.get('start') || '', end: fd.get('end') || '', bookId: fd.get('bookId') || '', minChars: N(fd.get('minChars')), maxChars: N(fd.get('maxChars')), conditions: fd.get('conditions') || '', url: (fd.get('url') || '').trim() });
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
  return `<div class="row between" style="margin:6px 0 10px"><h2 style="margin:0">Что пишу дальше</h2><button class="primary" data-act="queue.new">+ В очередь</button></div>
  <div class="card list">${todo.length ? todo.map((x, i) => {
    const b = x.bookId ? c.wbooksById[x.bookId] : null;
    const fc = b && b.planChars ? forecastDate(b.history, c.today, Number(b.planChars)) : null;
    return `<div class="item"><div class="row between"><span><b>${i + 1}. ${esc(x.title)}</b></span><span class="row"><button class="link" data-act="queue.move" data-id="${x.id}" data-dir="-1" aria-label="Выше">▲</button><button class="link" data-act="queue.move" data-id="${x.id}" data-dir="1" aria-label="Ниже">▼</button></span></div>
      <div class="small muted">${b ? ic('books') + ' ' + esc(b.title) + ' · ' : ''}${x.due ? 'к ' + fmtDate(x.due) : 'без срока'}${fc ? ' · по темпу допишу к ' + fmtDate(fc) : ''}</div>
      ${x.note ? `<div class="small">${esc(x.note)}</div>` : ''}
      <div class="row"><button class="link" data-act="queue.done" data-id="${x.id}">✓ Готово</button><button class="link" data-act="queue.edit" data-id="${x.id}">Изменить</button></div></div>`;
  }).join('') : '<p class="muted">Очередь пуста.</p>'}</div>
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

// ---------- жду ответа ----------
function waiting(c) {
  const list = [...c.data.w_waiting].sort((a, b) => (a.since || '').localeCompare(b.since || ''));
  const open = list.filter((x) => !x.done), done = list.filter((x) => x.done);
  return `<div class="row between" style="margin:6px 0 10px"><h2 style="margin:0">Жду ответа</h2><button class="primary" data-act="wait.new">+ Жду</button></div>
  ${open.length ? open.map((x) => {
    const s = waitingStatus(x, c.today);
    return `<div class="card${s.overdue ? ' alert-card' : ''}"><div class="row between"><b>${esc(x.who)}</b><span class="badge ${s.overdue ? 'bad' : ''}">жду ${s.days} дн.</span></div>
      <div>${esc(x.what || '')}</div><div class="small muted">с ${fmtDate(x.since)}${s.overdue ? ' · пора напомнить о себе' : ` · напомнить через ${Math.max(0, (Number(x.remindDays) || 14) - s.days)} дн.`}</div>
      <div class="row" style="margin-top:6px"><button class="link" data-act="wait.answer" data-id="${x.id}">Ответ получен</button><button class="link" data-act="wait.nudge" data-id="${x.id}">Напомнила — ждать снова</button><button class="link" data-act="wait.edit" data-id="${x.id}">Изменить</button></div></div>`;
  }).join('') : '<div class="card"><p class="muted">Ни от кого не жду ответа.</p></div>'}
  ${done.length ? `<details class="card"><summary>Ответы получены (${done.length})</summary>${done.map((x) => `<div class="item small"><b>${esc(x.who)}</b>: ${esc(x.what || '')}${x.answer ? `<br>→ ${esc(x.answer)}` : ''}</div>`).join('')}</details>` : ''}`;
}
function waitForm(c, x = {}) {
  return `<label for="ww">От кого</label><input id="ww" name="who" value="${esc(x.who || '')}" required placeholder="редактор, издательство, площадка…">
  <label for="wq">По какому вопросу</label><textarea id="wq" name="what">${esc(x.what || '')}</textarea>
  <div class="f2"><div><label for="wsi">Жду с</label><input id="wsi" type="date" name="since" value="${x.since || c.today}" required></div><div><label for="wr">Напомнить через, дней</label><input id="wr" name="remindDays" inputmode="numeric" value="${x.remindDays ?? 14}"></div></div>`;
}
const waitFrom = (fd) => ({ who: fd.get('who').trim(), what: (fd.get('what') || '').trim(), since: fd.get('since'), remindDays: N(fd.get('remindDays')) || 14 });
acts['wait.new'] = () => openSheet('Жду ответа', waitForm(app().ctx()), async (fd) => { await app().store.put('w_waiting', { id: 'a' + uid(), ...waitFrom(fd), done: false }); });
acts['wait.edit'] = (d) => {
  const x = app().ctx().data.w_waiting.find((i) => i.id === d.id);
  openSheet('Жду ответа', waitForm(app().ctx(), x) + `<p><button type="button" class="link danger" data-act="wait.del" data-id="${x.id}">Удалить</button></p>`, async (fd) => { await app().store.put('w_waiting', { ...x, ...waitFrom(fd) }); });
};
acts['wait.del'] = async (d) => { if (await ask('Удалить?')) await app().store.remove('w_waiting', d.id); };
acts['wait.nudge'] = (d) => { const x = app().ctx().data.w_waiting.find((i) => i.id === d.id); return app().store.put('w_waiting', { ...x, since: app().ctx().today }); };
acts['wait.answer'] = (d) => {
  const x = app().ctx().data.w_waiting.find((i) => i.id === d.id);
  openSheet('Ответ получен', `<label for="wa">Что ответили (необязательно)</label><textarea id="wa" name="answer"></textarea>`, async (fd) => { await app().store.put('w_waiting', { ...x, done: true, answer: (fd.get('answer') || '').trim(), answeredAt: app().ctx().today }); });
};
export { pct };
