import { esc } from '../ui.js';
import { rub, pct, fmtDate, fmtShort, fmtMonth, num } from '../format.js';
import { addDays, dashboardStats, booksBreakdown, byWeek, byMonth, movingAverage, incomeSeries, buildPlan, monthGoalStatus, monthKey, monthsBetween, taxRows, monthFinance } from '../calc.js';
import { dailyChart, EVENT_TYPES } from '../charts.js';
import { acts, openSheet, toast } from '../ui.js';
import { activeAlerts } from './ads.js';

export function chartInputs(c, from, to) {
  const i0 = c.series.findIndex((d) => d.date >= from);
  const i1 = c.series.length - 1 - [...c.series].reverse().findIndex((d) => d.date <= to);
  const slice = c.series.slice(i0, i1 + 1);
  const events = [];
  for (const d of c.data.days) for (const e of d.events || []) if (d.date >= from && d.date <= to) events.push({ date: d.date, ...e });
  const bands = c.campaigns.filter((k) => !k.oneOff && k.start && k.start <= to && (k.end || to) >= from).map((k) => ({ from: k.start, to: k.end || to, label: k.name }));
  const priceLines = [];
  for (const b of c.books) [...(b.priceHistory || [])].sort((x, y) => x.from.localeCompare(y.from)).slice(1).forEach((p) => { if (p.from >= from && p.from <= to) priceLines.push({ date: p.from, label: `${b.title}: ${rub(p.price)}` }); });
  return { days: slice.map((d) => ({ date: d.date, value: d.royalty, known: d.known })), ma: c.ma.slice(i0, i1 + 1), events, bands, priceLines };
}
export function chartLegend(inp) {
  const types = [...new Set(inp.events.map((e) => e.type))];
  return `<div class="legend"><span><i style="background:var(--bar)"></i>доход за день</span><span><i class="ln"></i>среднее за 7 дней</span>`
    + (inp.bands.length ? '<span><i style="background:var(--band);border:1px solid var(--muted)"></i>реклама</span>' : '')
    + (inp.priceLines.length ? '<span><i class="pr"></i>смена цены</span>' : '')
    + types.map((t) => `<span><i class="dot" style="background:${EVENT_TYPES[t]?.color}"></i>${EVENT_TYPES[t]?.label}</span>`).join('') + '</div>';
}

export function home(app) {
  const c = app.ctx(), ui = app.ui;
  if (!c.hasData) {
    return { html: `<div class="card"><h2>Пока нет данных</h2><p>Начните с импорта выгрузки продаж из кабинета Литнета.</p><a class="btn primary" href="#" data-act="go" data-to="/data">Загрузить Statistic.csv</a></div>` };
  }
  const st = dashboardStats(c.sales, c.legacyDays, c.today);
  const last = c.series[c.series.length - 1];
  const dayLabel = c.dataEnd === c.today ? 'Сегодня' : `Последний день · ${fmtShort(c.dataEnd)}`;
  const from = ui.range ? (addDays(c.dataEnd, -(ui.range - 1)) < c.firstDate ? c.firstDate : addDays(c.dataEnd, -(ui.range - 1))) : c.firstDate;
  const inp = chartInputs(c, from, c.dataEnd);
  // «По книгам» — только текущий месяц
  const bkFrom = monthKey(c.today) + '-01';
  const bb = booksBreakdown(c.sales, bkFrom, c.today).map((b) => ({ ...b, title: c.titleOf(b.bookId, b.title) }));
  const rangeBtn = (v, t) => `<button class="chip${ui.range === v ? ' on' : ''}" data-act="home.range" data-v="${v}">${t}</button>`;
  const rows = ui.table === 'months' ? byMonth(c.series).reverse() : byWeek(c.series).reverse().slice(0, 26);
  const label = (g) => (ui.table === 'months' ? fmtMonth(g.key) : `${fmtShort(g.from)}–${fmtDate(g.to)}`);
  const vs = st.vsPrev;
  const html = `
  <div class="grid4">
    <div class="stat"><div class="k">${dayLabel}</div><div class="v">${rub(last.royalty)}</div><div class="s">${last.qty} шт.: продажи ${last.saleQty}, подписки ${last.subQty}</div></div>
    <div class="stat"><div class="k">Среднее за 7 дней</div><div class="v">${rub(st.avg7)}</div><div class="s">по ${fmtShort(addDays(st.dataEnd, -6))}–${fmtShort(st.dataEnd)}</div></div>
    <div class="stat"><div class="k">Этот месяц</div><div class="v">${rub(st.mtd)}</div><div class="s ${vs == null ? '' : vs >= 0 ? 'up' : 'down'}">${vs == null ? 'нет прошлого месяца' : (vs >= 0 ? '▲ ' : '▼ ') + pct(Math.abs(vs)) + ' к тому же сроку прошлого'}</div></div>
    <div class="stat"><div class="k">Прошлый месяц</div><div class="v">${rub(st.prevTotal)}</div><div class="s">за тот же срок: ${rub(st.prevSame)}</div></div>
  </div>
  ${activeAlerts(c).map((a) => `<div class="card row between"><span>⚠︎ Таргет «${esc(a.name)}» просел — запросите отчёт у таргетологов</span><button class="link" data-act="go" data-to="/ads">открыть</button></div>`).join('')}
  ${taxReminder(c)}
  ${goalCard(c, st)}
  <div class="card">
    <div class="chips">${rangeBtn(30, '30 дней')}${rangeBtn(90, '90 дней')}${rangeBtn(180, '180 дней')}${rangeBtn(0, 'Всё время')}</div>
    <div class="chart" id="chart"></div>${chartLegend(inp)}
    <div class="hint">Данные до ${fmtDate(c.dataEnd)}. Светлые столбцы — дни до начала данных выгрузки.</div>
  </div>
  <div class="card"><h2>По книгам · ${fmtMonth(monthKey(c.today))}</h2>
    ${bb.length ? '' : `<p class="muted">За ${fmtMonth(monthKey(c.today))} продаж пока нет — загрузите свежую выгрузку на вкладке «Данные».</p>`}
    ${bb.map((b) => `<a class="item book-link" href="#" data-act="book.open" data-id="${esc(b.bookId)}" style="padding:8px 0"><div class="row between"><span>${esc(b.title)}</span><b>${rub(b.royalty)}</b></div><div class="small muted">${[b.saleQty ? `продажи ${b.saleQty} шт. · ${rub(b.saleRoyalty, 0)}` : '', b.subQty ? `подписки ${b.subQty} шт. · ${rub(b.subRoyalty, 0)}` : ''].filter(Boolean).join(' · ')}</div><div class="bar-share"><i style="width:${(b.share * 100).toFixed(1)}%"></i></div></a>`).join('')}
    <div class="card-foot"><button class="link" data-act="go" data-to="/books">Все книги и аналитика</button></div>
  </div>
  <div class="card"><div class="row between"><h2>Таблица</h2><div class="chips"><button class="chip${ui.table !== 'months' ? ' on' : ''}" data-act="home.table" data-v="weeks">Недели</button><button class="chip${ui.table === 'months' ? ' on' : ''}" data-act="home.table" data-v="months">Месяцы</button></div></div>
    <div class="scroll"><table><tr><th>Период</th><th>Доход</th><th>Прод./подп.</th><th>В день</th></tr>
    ${rows.map((g) => `<tr><td>${label(g)}</td><td>${rub(g.royalty)}</td><td>${g.saleQty}/${g.subQty}</td><td>${rub(g.avgPerDay, 0)}</td></tr>`).join('')}</table></div>
    <div class="hint">Доход = ваш гонорар (роялти). Неделя — с понедельника.</div>
  </div>`;
  return { html, after: () => dailyChart(document.getElementById('chart'), inp) };
}
acts['home.range'] = (d, el, e) => { window.__app.ui.range = Number(d.v); };
acts['home.table'] = (d) => { window.__app.ui.table = d.v; };
// книга с главной — сразу в её аналитику за текущий месяц
acts['book.open'] = (d) => { const a = window.__app; a.ui.booksMonth = null; a.go('/book/' + d.id); };

function goalCard(c, st) {
  const s = c.settings;
  const plan = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: s.planOverrides || {} });
  const p = plan.find((x) => x.month === monthKey(c.dataEnd));
  if (!p) return '';
  const g = monthGoalStatus(p.plan, st.mtd, c.dataEnd);
  return `<div class="card"><div class="row between"><h2 style="margin:0">Цель: ${fmtMonth(g.month)}</h2><button class="link" data-act="goal.all" data-m="${g.month}">изменить</button></div>
    <div class="row between small" style="margin-top:8px"><span><b>${rub(g.fact, 0)}</b> из ${rub(g.plan, 0)}</span><span class="muted">${g.share == null ? '' : pct(g.share, 0)}</span></div>
    <div class="progress"><i style="width:${Math.min(100, (g.share || 0) * 100).toFixed(1)}%"></i></div>
    <div class="small">${g.reached ? '✔︎ Цель месяца достигнута' : g.daysLeft === 0 ? `Месяц закончился: не хватило ${rub(g.plan - g.fact, 0)}` : `прогноз к концу месяца ≈ ${rub(g.forecast, 0)} ${g.onTrack ? '<span class="up">— успеваете</span>' : '<span class="down">— не хватает ' + rub(g.plan - g.forecast, 0) + '</span>'}${g.daysLeft > 0 ? ` · нужно ~${rub(g.needPerDay, 0)} в день` : ''}`}</div></div>`;
}

function taxReminder(c) {
  const keys = monthsBetween(monthKey(c.firstDate), monthKey(c.dataEnd));
  const t = taxRows(keys, (k) => monthFinance(k, { sales: c.sales, legacyDays: c.legacyDays, spend: c.spend, discounts: c.discounts, months: c.monthsMap, settings: c.settings, litnet: c.litnetMoney }), c.monthsMap, c.dataEnd);
  if (!t.unpaid) return '';
  return `<div class="card row between taxline"><span class="tl"><span class="tl-k">Налог к уплате</span><b class="tl-v">${rub(t.unpaid, 0)}</b><span class="tl-s">за ${t.unpaidMonths.map((k) => fmtMonth(k)).join(', ')}</span></span>${t.unpaidMonths.length === 1 ? `<button data-act="tax.check" data-m="${t.unpaidMonths[0]}">Чек</button>` : '<button class="link" data-act="go" data-to="/money">подробнее</button>'}</div>`;
}

// Быстрая отметка: «сегодня выложила главу» — событие на сегодня, книга по умолчанию — в процессе
acts['chapter.quick'] = () => {
  const c = window.__app.ctx();
  const books = c.activeBooks;
  const def = books.find((b) => b.status !== 'done') || books[0];
  openSheet('Выкладка главы', `<label for="cb">Книга</label><select id="cb" name="bookId">${books.map((b) => `<option value="${esc(b.id)}"${b.id === def?.id ? ' selected' : ''}>${esc(b.title)}${b.status === 'done' ? ' (завершена)' : ''}</option>`).join('')}</select>
    <label for="ct">Какая глава (необязательно)</label><input id="ct" name="text" placeholder="например, глава 25">
    <label for="cd">Дата</label><input id="cd" type="date" name="date" value="${window.__app.ui.day || c.today}">`, async (fd) => {
    const date = fd.get('date') || c.today;
    const doc = c.data.days.find((x) => x.id === date) || { id: date, date, events: [], note: '' };
    const ev = { type: 'chapter', bookId: fd.get('bookId'), text: (fd.get('text') || '').trim() };
    await window.__app.store.put('days', { ...doc, id: date, date, events: [...(doc.events || []), ev] });
    toast('Выкладка отмечена');
  }, { submitText: 'Отметить' });
};
