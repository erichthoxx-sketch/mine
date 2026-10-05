import { esc, acts, forms, changes, opt, toast, openSheet } from '../ui.js';
import { rub, fmtDate, fmtShort, fmtMonth, pct } from '../format.js';
import { incomeSeries, booksBreakdown, manualSaleRow, dayStats, sumSeries, buildPlan, monthKey, daysInMonth, campaignDailySpend, countDays, addDays } from '../calc.js';
import { N } from '../ui.js';
import { EVENT_TYPES } from '../charts.js';

const app = () => window.__app;
const dayDoc = (c, date) => c.data.days.find((d) => d.id === date) || { id: date, date, events: [], note: '' };

const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WD_ACC = ['прошлому воскресенью', 'прошлому понедельнику', 'прошлому вторнику', 'прошлой среде', 'прошлому четвергу', 'прошлой пятнице', 'прошлой субботе'];
const chg = (v, label) => (v == null ? '' : `<span class="chip-stat ${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v), 0)} к ${label}</span>`);

export function day(a) {
  const c = a.ctx(), ui = a.ui;
  const date = ui.day || c.today; // по умолчанию — сегодня
  const doc = dayDoc(c, date);
  const st = dayStats(c.sales, c.legacyDays, date);
  const bb = booksBreakdown(c.sales, date, date);
  const manual = c.sales.filter((s) => s.date === date && s.manual);
  const noData = date > c.dataEnd;
  const wd = new Date(date + 'T00:00:00Z').getUTCDay();
  // цель месяца: сколько к этому дню и вклад дня
  const s = c.settings, mk = monthKey(date);
  const plan = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: s.planOverrides || {} }).find((p) => p.month === mk);
  const mtd = sumSeries(incomeSeries(c.sales, c.legacyDays, mk + '-01', date));
  const perDayPlan = plan ? plan.plan / daysInMonth(mk) : null;
  // реклама в этот день
  const adsOn = c.campaigns.filter((k) => k.start && k.start <= date && (k.end || k.start) >= date);
  const maxBook = Math.max(1, ...bb.map((b) => b.royalty));
  const recent = c.data.days.filter((d) => (d.events?.length || d.note)).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 20);
  const html = `
  <div class="day-nav card">
    <button data-act="day.shift" data-n="-1" aria-label="Предыдущий день">←</button>
    <div class="day-title"><input id="dd" type="date" value="${date}" data-chg="day.date" aria-label="Дата"><div class="small muted">${WD[wd]}${date === c.today ? ' · сегодня' : ''}${date === c.dataEnd ? ' · последний день с данными' : ''}</div></div>
    <button data-act="day.shift" data-n="1" aria-label="Следующий день">→</button>
  </div>
  <div class="row" style="margin-bottom:12px"><button class="primary" data-act="event.quick" data-date="${date}">+ Событие</button><button data-act="sale.manual" data-date="${date}">Добавить продажи вручную</button>${date !== c.today ? '<button class="link" data-act="day.today">к сегодня</button>' : ''}${date !== c.dataEnd ? `<button class="link" data-act="day.open" data-date="${c.dataEnd}">к последнему дню с данными</button>` : ''}</div>
  <div class="card">
    ${noData && !st.royalty ? `<p class="muted" style="margin:0">Выгрузки Литнета за ${fmtDate(date)} ещё нет. Загрузите её на вкладке «Данные» или добавьте продажи вручную.</p>` : `
    <div class="k small muted">Доход за день</div>
    <div class="day-sum">${rub(st.royalty)}</div>
    <div class="chips" style="margin:6px 0">${chg(st.vsAvg, `среднему за 7 дн. (${rub(st.avg7, 0)})`)}${chg(st.vsWeek, `${WD_ACC[wd]} (${rub(st.weekAgo, 0)})`)}</div>
    <div class="small">${st.qty} шт.: продажи ${st.saleQty} (${rub(st.saleRoyalty, 0)}) · подписки ${st.subQty} (${rub(st.subRoyalty, 0)})</div>`}
  </div>
  ${plan ? `<div class="card"><h2>Цель ${fmtMonth(mk)}</h2>
    <div class="row between small"><span>К ${fmtShort(date)}: <b>${rub(mtd, 0)}</b> из ${rub(plan.plan, 0)}</span><span class="muted">${pct(mtd / plan.plan, 0)}</span></div>
    <div class="progress"><i style="width:${Math.min(100, (mtd / plan.plan) * 100).toFixed(1)}%"></i></div>
    <div class="small">Чтобы идти в ногу с целью, нужно ≈ ${rub(perDayPlan, 0)} в день — этот день ${st.royalty >= perDayPlan ? '<span class="up">выше нормы ✔︎</span>' : `<span class="down">ниже на ${rub(perDayPlan - st.royalty, 0)}</span>`}.</div></div>` : ''}
  ${bb.length ? `<div class="card"><h2>По книгам</h2>${bb.map((b) => `<div class="item" style="padding:8px 0"><div class="row between"><span>${esc(c.titleOf(b.bookId, b.title))}</span><b>${rub(b.royalty)}</b></div>
    <div class="small muted">продажи ${b.saleQty} · подписки ${b.subQty}</div><div class="bar-share"><i style="width:${((b.royalty / maxBook) * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>` : ''}
  ${adsOn.length ? `<div class="card"><h2>Реклама в этот день</h2>${adsOn.map((k) => { const sp = campaignDailySpend(k, c.data.reports, null)[date]; const dn = k.oneOff ? null : countDays(k.start, date); return `<div class="item row between"><span><b>${esc(k.name)}</b><br><span class="small muted">${k.oneOff ? 'разовый расход' : `день ${dn}${k.end ? ' из ' + countDays(k.start, k.end) : ''}`}${k.bookId ? ' · ' + esc(c.titleOf(k.bookId, '')) : ''}</span></span><span class="small">${sp ? '≈ ' + rub(sp, 0) : ''}</span></div>`; }).join('')}</div>` : ''}
  ${manual.length ? `<div class="card"><h2>Добавлено вручную</h2>${manual.map((x) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(c.titleOf(x.bookId, x.book))}${x.platform && x.platform !== 'Литнет' ? ' · ' + esc(x.platform) : ''} · ${x.kind === 'sub' ? 'подписки' : 'продажи'} ${x.qty} шт. · ${rub(x.royalty)}</span><button class="link danger" data-act="day.delManual" data-id="${esc(x.id)}">убрать</button></div>`).join('')}</div>` : ''}
  <div class="card"><h2>События дня</h2>
    ${(doc.events || []).length ? (doc.events).map((e, i) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="pill-ev"><i style="background:${(EVENT_TYPES[e.type] || EVENT_TYPES.note).color}"></i><span>${esc((EVENT_TYPES[e.type] || EVENT_TYPES.note).label)}${e.bookId ? ' · ' + esc(c.titleOf(e.bookId, '')) : ''}${e.text ? ': ' + esc(e.text) : ''}</span></span><button class="link danger" data-act="day.delEv" data-i="${i}">убрать</button></div>`).join('') : '<p class="muted">Событий нет.</p>'}
    <div style="margin-top:8px"><button data-act="event.quick" data-date="${date}">+ Событие</button></div>
  </div>
  <div class="card"><h2>Заметка</h2><form data-form="day.note"><textarea name="note" placeholder="Что важно запомнить об этом дне">${esc(doc.note || '')}</textarea><div style="margin-top:10px"><button class="primary" type="submit">Сохранить заметку</button></div></form></div>
  ${recent.length ? `<details class="card"><summary>Последние записи</summary><div class="list">${recent.map((d) => `<a class="item" href="#" data-act="day.open" data-date="${d.date}"><b>${fmtDate(d.date)}</b> ${(d.events || []).map((e) => esc((EVENT_TYPES[e.type] || EVENT_TYPES.note).label)).join(', ')} <span class="muted">${esc(d.note || '').slice(0, 80)}</span></a>`).join('')}</div></details>` : ''}`;
  return { html };
}

async function save(doc) {
  if (!(doc.events || []).length && !doc.note) await app().store.remove('days', doc.id);
  else await app().store.put('days', doc);
}
changes['day.date'] = (v) => { if (v) app().ui.day = v; app().rerender(); };
acts['day.today'] = () => { app().ui.day = null; };
acts['day.shift'] = (d) => { const c = app().ctx(); app().ui.day = addDays(app().ui.day || c.today, Number(d.n)); };
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

forms['day.manual'] = async (fd) => {
  const c = app().ctx(), date = app().ui.day || c.today;
  const b = c.booksById[fd.get('bookId')];
  const qty = N(fd.get('qty')), royalty = N(fd.get('royalty'));
  if (!b || qty == null || royalty == null || Number.isNaN(qty) || Number.isNaN(royalty)) { toast('Заполните количество и гонорар числами'); return; }
  await app().store.put('sales', manualSaleRow({ date, book: b.title, bookId: b.id, kind: fd.get('kind'), qty, royalty }));
  toast('Результат сохранён');
};
acts['day.delManual'] = (d) => app().store.remove('sales', d.id);

// Событие на выбранный день: можно добавлять сколько угодно, по одному нажатию
acts['event.quick'] = (d) => {
  const c = app().ctx(), date = d.date || app().ui.day || c.today;
  const books = c.activeBooks, def = books.find((b) => b.status !== 'done');
  openSheet(`Событие — ${fmtDate(date)}`, `<label for="et">Что произошло</label><select id="et" name="type">${Object.entries(EVENT_TYPES).map(([k, v]) => opt(k, v.label, 'chapter')).join('')}</select>
    <label for="eb">Книга (необязательно)</label><select id="eb" name="bookId"><option value="">—</option>${books.map((b) => opt(b.id, b.title, def?.id)).join('')}</select>
    <label for="ex">Пояснение</label><input id="ex" name="text" placeholder="например, глава 25, скидка 30 % или своё событие">
    <div class="hint">Для «Другое» напишите, что произошло, в пояснении.</div>`, async (fd) => {
    const type = fd.get('type'), text = (fd.get('text') || '').trim();
    if (type === 'other' && !text) { toast('Для «Другое» напишите, что произошло'); return false; }
    const doc = dayDoc(app().ctx(), date);
    const ev = { type, text };
    if (fd.get('bookId')) ev.bookId = fd.get('bookId');
    await save({ ...doc, id: date, date, events: [...(doc.events || []), ev] });
    toast('Событие добавлено');
  }, { submitText: 'Добавить' });
};
