import { esc } from '../ui.js';
import { rub, pct, fmtDate, fmtShort, fmtMonth, num } from '../format.js';
import { addDays, dashboardStats, booksBreakdown, byWeek, byMonth, movingAverage, incomeSeries } from '../calc.js';
import { dailyChart, EVENT_TYPES } from '../charts.js';
import { acts } from '../ui.js';

export function chartInputs(c, from, to) {
  const i0 = c.series.findIndex((d) => d.date >= from);
  const i1 = c.series.length - 1 - [...c.series].reverse().findIndex((d) => d.date <= to);
  const slice = c.series.slice(i0, i1 + 1);
  const events = [];
  for (const d of c.data.days) for (const e of d.events || []) if (d.date >= from && d.date <= to) events.push({ date: d.date, ...e });
  const bands = c.campaigns.filter((k) => k.start && k.start <= to && (k.end || to) >= from).map((k) => ({ from: k.start, to: k.end || to, label: k.name }));
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
  const bb = booksBreakdown(c.sales, from, c.dataEnd).map((b) => ({ ...b, title: c.titleOf(b.bookId, b.title) }));
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
  <div class="card">
    <div class="chips">${rangeBtn(30, '30 дней')}${rangeBtn(90, '90 дней')}${rangeBtn(180, '180 дней')}${rangeBtn(0, 'Всё время')}</div>
    <div class="chart" id="chart"></div>${chartLegend(inp)}
    <div class="hint">Данные до ${fmtDate(c.dataEnd)}. Светлые столбцы — дни до начала данных выгрузки.</div>
  </div>
  <div class="card"><h2>По книгам</h2><div class="hint" style="margin:-6px 0 8px">${fmtDate(from)} – ${fmtDate(c.dataEnd)}</div>
    ${bb.map((b) => `<div class="item" style="padding:8px 0"><div class="row between"><span>${esc(b.title)}</span><b>${rub(b.royalty)}</b></div><div class="small muted">продажи ${rub(b.saleRoyalty)} (${b.saleQty} шт.) · подписки ${rub(b.subRoyalty)} (${b.subQty} шт.)</div><div class="bar-share"><i style="width:${(b.share * 100).toFixed(1)}%"></i></div></div>`).join('')}
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
