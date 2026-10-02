import { esc, acts, forms, changes, opt, toast } from '../ui.js';
import { rub, fmtDate } from '../format.js';
import { incomeSeries, booksBreakdown } from '../calc.js';
import { EVENT_TYPES } from '../charts.js';

const app = () => window.__app;
const dayDoc = (c, date) => c.data.days.find((d) => d.id === date) || { id: date, date, events: [], note: '' };

export function day(a) {
  const c = a.ctx(), ui = a.ui;
  const date = ui.day || c.today;
  const doc = dayDoc(c, date);
  const inc = incomeSeries(c.sales, c.legacyDays, date, date)[0];
  const bb = booksBreakdown(c.sales, date, date);
  const recent = c.data.days.filter((d) => (d.events?.length || d.note)).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 30);
  const html = `
  <div class="card">
    <label for="dd" style="margin-top:0">Дата</label>
    <div class="row"><input id="dd" type="date" value="${date}" data-chg="day.date" style="flex:1"><button data-act="day.today">Сегодня</button></div>
    <h3>Доход за день</h3>
    <div class="stat" style="border:0;padding:0"><div class="v">${rub(inc.royalty)}</div><div class="s">${inc.qty} шт.: продажи ${inc.saleQty}, подписки ${inc.subQty}${c.legacyDays.some((d) => d.date === date && d.income != null && !c.sales.some((s) => s.date === date)) ? ' · из старого трекера' : ''}</div></div>
    ${bb.map((b) => `<div class="row between small"><span>${esc(c.titleOf(b.bookId, b.title))}</span><span>${rub(b.royalty)}</span></div>`).join('')}
  </div>
  <div class="card"><h2>События дня</h2>
    ${(doc.events || []).length ? (doc.events).map((e, i) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="pill-ev"><i style="background:${(EVENT_TYPES[e.type] || EVENT_TYPES.note).color}"></i><span>${esc((EVENT_TYPES[e.type] || EVENT_TYPES.note).label)}${e.bookId ? ' · ' + esc(c.titleOf(e.bookId, '')) : ''}${e.text ? ': ' + esc(e.text) : ''}</span></span><button class="link danger" data-act="day.delEv" data-i="${i}">убрать</button></div>`).join('') : '<p class="muted">Событий нет.</p>'}
    <form data-form="day.addEv"><div class="f2"><div><label>Что произошло</label><select name="type">${Object.entries(EVENT_TYPES).map(([k, v]) => opt(k, v.label)).join('')}</select></div>
      <div><label>Книга (необязательно)</label><select name="bookId"><option value="">—</option>${c.books.map((b) => opt(b.id, b.title)).join('')}</select></div></div>
      <label>Пояснение (необязательно)</label><input name="text" placeholder="например, глава 25 или скидка 30%">
      <div style="margin-top:12px"><button class="primary" type="submit">Добавить событие</button></div></form>
  </div>
  <div class="card"><h2>Заметка</h2><form data-form="day.note"><textarea name="note" placeholder="Что важно запомнить об этом дне">${esc(doc.note || '')}</textarea><div style="margin-top:10px"><button class="primary" type="submit">Сохранить заметку</button></div></form></div>
  ${recent.length ? `<div class="card"><h2>Последние записи</h2><div class="list">${recent.map((d) => `<a class="item" href="#" data-act="day.open" data-date="${d.date}"><b>${fmtDate(d.date)}</b> ${(d.events || []).map((e) => esc((EVENT_TYPES[e.type] || EVENT_TYPES.note).label)).join(', ')} <span class="muted">${esc(d.note || '').slice(0, 80)}</span></a>`).join('')}</div></div>` : ''}`;
  return { html };
}

async function save(doc) {
  if (!(doc.events || []).length && !doc.note) await app().store.remove('days', doc.id);
  else await app().store.put('days', doc);
}
changes['day.date'] = (v) => { if (v) app().ui.day = v; app().rerender(); };
acts['day.today'] = () => { app().ui.day = null; };
acts['day.open'] = (d) => { app().ui.day = d.date; window.scrollTo(0, 0); };
acts['day.delEv'] = async (d) => {
  const c = app().ctx(), date = app().ui.day || c.today, doc = dayDoc(c, date);
  const events = (doc.events || []).filter((_, i) => i !== Number(d.i));
  await save({ ...doc, events });
};
forms['day.addEv'] = async (fd) => {
  const c = app().ctx(), date = app().ui.day || c.today, doc = dayDoc(c, date);
  const ev = { type: fd.get('type'), text: (fd.get('text') || '').trim() };
  if (fd.get('bookId')) ev.bookId = fd.get('bookId');
  await save({ ...doc, id: date, date, events: [...(doc.events || []), ev] });
  toast('Событие добавлено');
};
forms['day.note'] = async (fd) => {
  const c = app().ctx(), date = app().ui.day || c.today, doc = dayDoc(c, date);
  await save({ ...doc, id: date, date, note: (fd.get('note') || '').trim() });
  toast('Заметка сохранена');
};
