import { esc, acts, forms, openSheet, opt, toast, N, uid, ask } from '../ui.js';
import { rub, pct, num, fmtDate, fmtShort, fmtMonth, fmtMonthIn } from '../format.js';
import { campaignMetrics, litnetPace, ctr, cpc, addDays, monthKey, bookIdFor, monthsBetween } from '../calc.js';
import { rocketCard } from './money.js';
import { targetAlert, campaignProgress, adGroupSummary } from '../calc.js';
import { buildTargetPrompt } from '../report.js';
import { resizeImage } from '../img.js';
import { parseTargetReport, reportId } from '../parse.js';
import { dailyChart, lineChart } from '../charts.js';
import { chartInputs, chartLegend } from './home.js';

const app = () => window.__app;
export const CHANNELS = { litnet: 'Литнет платит', own: 'Мой таргет', other: 'Другое' };

export function metricsFor(c, k) {
  return campaignMetrics(k, { sales: c.sales, legacyDays: c.legacyDays, reports: c.data.reports, campaigns: c.campaigns, dataEnd: c.dataEnd, baseDays: c.settings.baseDays, today: c.today });
}

// Сводка «как идёт таргет»: по каждой идущей кампании — окупаемость, бюджет, сколько реклама вернула, сигналы
// ---------- вкладка «Реклама»: вся платная реклама → таргет Литнета → мой таргет → Rocket → другие расходы ----------
const bar = (label, right, share, good) => `<div class="bar-row"><div class="row between small"><span>${label}</span><span>${right}</span></div><div class="progress ${good ? 'ok' : ''}"><i style="width:${Math.min(100, Math.max(0, share || 0) * 100).toFixed(1)}%"></i></div></div>`;
const payTxt = (v) => (v == null ? '<span class="muted">нет базы</span>' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲ +' : '▼ '}${rub(v, 0)}</span>`);

function summaryBody(c, s, { showBudget = true } = {}) {
  return `<div class="tiles">
      <div><div class="k">Окупаемость в день сейчас</div><div class="v">${s.live ? (s.perDayPayback == null ? '<span class="muted">ждём данные</span>' : payTxt(s.perDayPayback)) : '<span class="muted">не идёт</span>'}</div><div class="s">${s.live ? `расход ≈ ${rub(s.perDaySpend, 0)}/день${s.perDayUplift != null ? `, доход сверх обычного ${rub(s.perDayUplift, 0)}/день` : ''}` : 'сейчас кампаний нет'}</div></div>
      <div><div class="k">Реклама вернула доходом</div><div class="v">${s.returnShare == null ? '—' : pct(Math.max(0, s.returnShare), 0)}</div><div class="s">${s.returned == null ? 'появится, когда будут данные' : `${rub(Math.max(0, s.returned), 0)} сверх обычного дохода`}</div></div>
    </div>
    ${s.returnShare != null ? bar('Вернула от потраченного', `<b>${rub(Math.max(0, s.returned), 0)}</b> из ${rub(s.spent, 0)}`, s.returnShare, s.returnShare >= 1) : ''}
    ${showBudget && s.paid ? bar('Бюджет идущих кампаний израсходован <span class="muted">≈ по плану</span>', `<b>${rub(s.plannedSpent, 0)}</b> из ${rub(s.paid, 0)}`, s.budgetShare) : ''}`;
}

function miniCampaign(c, k, alerts) {
  const m = metricsFor(c, k), p = campaignProgress(k, m, c.today);
  const al = alerts.find((x) => x.campaignId === k.id && !x.snoozed);
  const started = k.start <= c.today;
  const st = m.status === 'planned' ? (started ? `<span class="badge good">идёт · ждём данные</span>` : `<span class="badge">с ${fmtShort(k.start)}</span>`) : m.status === 'active' ? `<span class="badge good">день ${p.day}${p.total ? ' из ' + p.total : ''}</span>` : '<span class="badge">завершена</span>';
  return `<a class="item" href="#" data-act="go" data-to="/ad/${k.id}"><div class="row between"><b>${esc(k.name)}</b>${al ? '<span class="badge bad">⚠︎ проверить</span>' : st}</div>
    <div class="small muted">${esc(k.bookId ? c.titleOf(k.bookId, '') : 'все книги')}${k.budget ? ` · ${rub(k.budget, 0)}` : ''} · ${fmtDate(k.start)}–${fmtDate(k.end) || '…'}</div>
    ${m.status === 'planned' ? (started ? '<div class="small muted">окупаемость появится, когда загрузите выгрузку Литнета за эти дни</div>' : '') : `<div class="small">окупаемость в день ${payTxt(m.payback)}${m.costPerSale != null ? ` · продажа ≈ ${rub(m.costPerSale, 0)}` : ''}</div>`}
    ${m.overlaps?.length ? `<div class="small warnc">⚠︎ пересекается: ${m.overlaps.map((o) => `${esc(o.name)} (${fmtShort(o.from)}–${fmtShort(o.to)})`).join(', ')}</div>` : ''}
    ${al ? `<div class="small down">${esc(alertText(al))}</div>` : ''}</a>`;
}
function campaignList(c, camps, alerts) {
  const cur = camps.filter((k) => !k.end || k.end >= c.today).sort((a, b) => a.start.localeCompare(b.start));
  const past = camps.filter((k) => k.end && k.end < c.today).sort((a, b) => b.start.localeCompare(a.start));
  return `${cur.length ? `<div class="list">${cur.map((k) => miniCampaign(c, k, alerts)).join('')}</div>` : ''}
    ${past.length ? `<details style="margin-top:6px"><summary>Завершённые (${past.length})</summary><div class="list">${past.map((k) => miniCampaign(c, k, alerts)).join('')}</div></details>` : ''}`;
}
function discountTable(c) {
  const dm = Object.keys(c.discounts).filter((k) => c.discounts[k].spend > 0).sort().reverse().slice(0, 6);
  if (!dm.length) return '';
  return `<h3>Скидка «Литнет платит»</h3><div class="scroll"><table><tr><th>Месяц</th><th>Оплачено</th><th>Скидка</th><th></th></tr>${dm.map((k) => { const d = c.discounts[k]; return `<tr><td>${fmtMonth(k)}</td><td>${rub(d.spend, 0)}</td><td>${d.qualified || d.status === 'confirmed' ? `${rub(d.discount, 0)}<br>${d.status === 'confirmed' ? '<span class="badge good">подтверждена</span>' : '<span class="badge">ожидается</span>'}` : '<span class="muted">нет</span>'}</td><td>${d.qualified || d.status === 'confirmed' ? `<button class="link" data-act="disc.confirm" data-m="${k}">${d.status === 'confirmed' ? 'изм.' : 'подтвердить'}</button>` : ''}</td></tr>`; }).join('')}</table></div>
    <div class="hint">Скидка = (оплата таргетологам за месяц − скидка прошлого месяца) × ${c.settings.litnetPct} %. В чистый доход идёт после подтверждения.</div>`;
}

export function ads(a) {
  const c = a.ctx();
  const ctx = actx(c);
  const real = c.campaigns.filter((k) => !k.oneOff);
  const alerts = real.map((k) => targetAlert(k, ctx, c.data.adnotes || [])).filter(Boolean);
  const open = alerts.filter((x) => !x.snoozed);
  const litnet = real.filter((k) => k.channel === 'litnet'), own = real.filter((k) => k.channel === 'own');
  const extras = c.campaigns.filter((k) => k.oneOff || (k.channel !== 'litnet' && k.channel !== 'own'));
  const all = adGroupSummary(c.campaigns, ctx), sL = adGroupSummary(litnet, ctx), sO = adGroupSummary(own, ctx);
  const mk = monthKey(c.today), sp = c.spend[mk] || { litnet: 0, own: 0, other: 0 }, monthNow = sp.litnet + sp.own + sp.other;
  const disc = c.discounts[mk];
  const html = `
  <div class="card"><div class="row between"><h2 style="margin:0">Платная реклама</h2><a href="#" class="small" data-act="go" data-to="/data">отчёт для нейросети →</a></div>
    ${summaryBody(c, all)}
    <p class="small" style="margin:10px 0 0">В ${fmtMonthIn(mk)}: ≈ ${rub(monthNow, 0)} по сегодня${c.forecast?.total ? ` · до конца месяца по плану ≈ ${rub(c.forecast.total, 0)}` : ''}${disc && disc.status === 'expected' ? ` · скидка Литнета ожидается ${rub(disc.expected, 0)}` : ''}</p>
    ${open.map((x) => `<div class="alert" style="margin-top:10px">⚠︎ «${esc(x.name)}»: ${esc(alertText(x))}. Запросите отчёт у таргетологов.<div class="row" style="margin-top:8px"><button class="primary" data-act="note.new" data-id="${x.campaignId}">Добавить отчёт</button><button data-act="ai.prompt" data-id="${x.campaignId}">Запрос для нейросети</button></div></div>`).join('')}
    <div class="hint">Расход по дням — бюджет ÷ дни кампании (оценка). «Доход сверх обычного» — сколько книга зарабатывает больше, чем в дни без рекламы.</div>
  </div>
  <div class="card"><div class="row between"><h2 style="margin:0">Таргет «Литнет платит»</h2><button class="primary" data-act="ad.new" data-ch="litnet">+ Кампания</button></div>
    ${litnet.length ? summaryBody(c, sL) + campaignList(c, litnet, alerts) : '<p class="muted">Кампаний пока нет. Добавьте оплату таргетологам как кампанию: книга, даты, сумма.</p>'}
    ${discountTable(c)}
  </div>
  <div class="card"><div class="row between"><h2 style="margin:0">Мой таргет</h2><button data-act="ad.new" data-ch="own">+ Кампания</button></div>
    ${own.length ? summaryBody(c, sO) + campaignList(c, own, alerts) : '<p class="muted">Здесь будут кампании, которые вы ведёте сами. Добавьте кампанию с бюджетом и датами — окупаемость посчитается так же.</p>'}
  </div>
  ${c.hasData ? rocketCard(c, monthsBetween(monthKey(c.firstDate), monthKey(c.today)).reverse()) : ''}
  <div class="card"><div class="row between"><h2 style="margin:0">Другие расходы на рекламу</h2><button data-act="extra.new">+ Расход</button></div>
    ${extras.length ? `<div class="list">${extras.sort((x, y) => (y.start || '').localeCompare(x.start || '')).slice(0, 12).map((k) => `<div class="item row between"><span><b>${esc(k.name)}</b><br><span class="small muted">${fmtDate(k.start)}${k.end && k.end !== k.start ? '–' + fmtDate(k.end) : ''}</span></span><span class="row"><b>${rub(k.budget || 0, 0)}</b><button class="link danger" data-act="extra.del" data-id="${k.id}">убрать</button></span></div>`).join('')}</div>` : '<p class="muted">Баннеры, услуги, рассылки — всё, что не кампания. Учитывается в расходах месяца и в чистом доходе.</p>'}
  </div>`;
  return { html };
}

acts['extra.new'] = () => {
  const c = app().ctx();
  openSheet('Другой расход на рекламу', `<label for="en">На что</label><input id="en" name="name" required placeholder="например, платный баннер">
    <div class="f2"><div><label for="ed">Дата</label><input id="ed" type="date" name="date" value="${c.today}" required></div><div><label for="ea">Сумма, ₽</label><input id="ea" name="amount" inputmode="decimal" required></div></div>`, async (fd) => {
    const v = N(fd.get('amount'));
    if (v == null || Number.isNaN(v)) { toast('Сумма — числом'); return false; }
    await app().store.put('campaigns', { id: 'x' + uid(), name: fd.get('name').trim(), channel: 'other', oneOff: true, start: fd.get('date'), end: fd.get('date'), budget: v });
    toast('Расход добавлен');
  });
};
acts['extra.del'] = async (d) => { if (await ask('Убрать этот расход?', 'Убрать')) await app().store.remove('campaigns', d.id); };

export function adPage(a, id) {
  const c = a.ctx();
  const k = c.campaigns.find((x) => x.id === id);
  if (!k) return { html: '<div class="card"><p>Кампания не найдена.</p><a href="#" data-act="go" data-to="/ads">← К рекламе</a></div>' };
  const wi = a.ui.baseTry?.id === k.id ? a.ui.baseTry : null; // «примерка» своей базы — только на экране
  const m = metricsFor(c, wi ? { ...k, baseMode: wi.mode, baseFrom: wi.from, baseTo: wi.to, baseValue: wi.value } : k);
  const reps = c.data.reports.filter((r) => r.campaignId === k.id).sort((x, y) => y.start.localeCompare(x.start));
  const chronological = [...reps].reverse();
  const bm = k.baseMode || 'auto';
  const metricsHtml = m.status === 'planned' ? '<p class="muted">Кампания ещё не началась (или нет данных продаж за её период).</p>' : `
    <dl class="dl">
      ${m.overlaps?.length ? `<dd class="alert">⚠︎ Пересекается с ${m.overlaps.map((o) => `«${esc(o.name)}» ${fmtDate(o.from)}–${fmtDate(o.to)}`).join(', ')}. В эти дни прирост дохода делится между кампаниями пропорционально расходу в день — доход не считается дважды.</dd>` : ''}
      <dt>Расход в день ${m.spendSource === 'reports' ? '(факт из отчётов)' : m.spendSource === 'mixed' ? '(факт из отчётов + бюджет ÷ дни)' : '(бюджет ÷ дни)'}</dt><dd>${rub(m.spendPerDay)}</dd>
      <dt>База: средний доход в день ${m.baseSource === 'manual' ? '(вручную)' : m.baseFrom ? `(${m.baseDaysUsed} дн. с данными, ${fmtDate(m.baseFrom)}–${fmtDate(m.baseTo)}${m.baseSource === 'auto' ? ', без дней другой рекламы' : m.baseSource === 'range' ? ', свой период' : ''})` : ''}</dt><dd>${m.baseline == null ? '<span class="muted">нет данных до старта — загрузите выгрузку за прошлые дни</span>' : rub(m.baseline)}</dd>
      ${wi ? `<dd class="alert">Вы примеряете свою базу — это только на экране. <button class="link" data-act="base.reset">Вернуть автоматическую</button></dd>` : ''}
      ${m.baseNotes?.includes('overlap') ? '<dd class="alert">⚠︎ В выбранном периоде базы шла другая реклама — база может быть завышена, а окупаемость занижена.</dd>' : ''}
      ${m.baseNotes?.includes('few') ? `<dd class="alert">⚠︎ Чистых дней для базы ${m.baseDaysUsed} (меньше 5): до старта мало дней без другой рекламы или нет данных. Можно примерить свою базу ниже.</dd>` : ''}
      <dt>Средний доход в день во время кампании (${m.days} дн.)</dt><dd>${rub(m.avgDuring)}</dd>
      <dt>Прирост к базе</dt><dd class="${m.uplift == null ? '' : m.uplift >= 0 ? 'up' : 'down'}">${m.uplift == null ? '—' : rub(m.uplift)}</dd>
      <dt>Окупаемость в день (прирост − расход)</dt><dd class="${m.payback == null ? '' : m.payback >= 0 ? 'up' : 'down'}">${m.payback == null ? '—' : (m.payback >= 0 ? '▲ ' : '▼ ') + rub(m.payback)}</dd>
      <dt>Порог окупаемости: доход в день должен быть не ниже</dt><dd>${m.threshold == null ? '—' : rub(m.threshold)}</dd>
      <dt>Итог за период ${fmtDate(m.from)}–${fmtDate(m.to)}</dt><dd class="${m.paybackTotal == null ? '' : m.paybackTotal >= 0 ? 'up' : 'down'}">${m.paybackTotal == null ? '—' : rub(m.paybackTotal)} <span class="muted small">(расход ${rub(m.spendTotal)})</span></dd>
      <dt>Стоимость одной продажи</dt><dd>${m.costPerSale == null ? '—' : rub(m.costPerSale)} <span class="muted small">(расход ÷ все ${m.qtyDuring} шт. за период)</span></dd>
      <dt>Стоимость одной «лишней» продажи</dt><dd>${m.costPerExtraSale == null ? '<span class="muted">продаж не больше, чем в базе</span>' : rub(m.costPerExtraSale)}</dd>
    </dl>`;
  const html = `<p><a href="#" data-act="go" data-to="/ads">← Вся реклама</a></p>
  <div class="card"><h2>${esc(k.name)}</h2>${metricsHtml}</div>
  <div class="card"><h2>Доход вокруг кампании</h2><div class="chart" id="chart"></div><div id="legend"></div></div>
  ${notesSection(c, k)}
  <details class="card"><summary>Фактический расход по неделям — если таргетологи его присылают</summary>
    <p class="small muted">Не обязательно. Без этих цифр расход считается как бюджет ÷ дни кампании. Если таргетологи пришлют, сколько реально потрачено за неделю, впишите — оценка заменится фактом.</p>
    ${reps.length ? `<div class="scroll"><table><tr><th>Неделя</th><th>Расход</th><th>Показы</th><th>Клики</th><th>CPC</th><th>CTR</th><th></th></tr>${reps.map((r) => `<tr><td>${fmtShort(r.start)}–${fmtDate(r.end)}</td><td>${rub(r.spend)}</td><td>${r.impressions == null ? '—' : num(r.impressions)}</td><td>${r.clicks == null ? '—' : num(r.clicks)}</td><td>${r.clicks ? rub(cpc(r)) : '—'}</td><td>${r.impressions ? pct(ctr(r), 2) : '—'}</td><td><button class="link danger" data-act="rep.del" data-id="${r.id}">убрать</button></td></tr>`).join('')}</table></div>` : '<p class="muted">Отчётов пока нет.</p>'}
    <div class="row" style="margin-top:10px"><button class="primary" data-act="rep.new" data-id="${k.id}">+ Отчёт</button><button data-act="rep.paste" data-id="${k.id}">Вставить таблицу</button></div>
    ${chronological.length ? `<h3>Цена клика (CPC), ₽</h3><div class="chart" id="cpc"></div><h3>CTR, %</h3><div class="chart" id="ctr"></div>` : ''}
  </details>
  <details class="card"${wi ? ' open' : ''}><summary>Примерить свою базу</summary>
    <p class="small muted">База считается автоматически: ${c.settings.baseDays} последних дней до старта, когда не шла никакая реклама. Здесь можно посмотреть, как изменятся цифры с другой базой — это не сохраняется.</p>
    <form data-form="base.try" data-id="${k.id}"><div class="f2"><div><label>С</label><input type="date" name="from" value="${wi?.from || ''}"></div><div><label>По</label><input type="date" name="to" value="${wi?.to || ''}"></div></div>
    <label>или сразу сумма, ₽ в день</label><input name="value" inputmode="decimal" value="${wi?.value ?? ''}">
    <div class="row" style="margin-top:10px"><button class="primary" type="submit">Посмотреть</button>${wi ? '<button type="button" data-act="base.reset">Вернуть автоматическую</button>' : ''}</div></form></details>
  <div class="card"><h2>Настройки кампании</h2>
  <form data-form="ad.save" data-id="${k.id}">
    <label style="margin-top:0">Название</label><input name="name" value="${esc(k.name)}" required>
    <div class="f2"><div><label>Книга</label><select name="bookId"><option value="">Все книги</option>${c.books.filter((b) => b.status !== 'removed' || b.id === k.bookId).map((b) => opt(b.id, b.title, k.bookId)).join('')}</select></div>
    <div><label>Канал</label><select name="channel">${Object.entries(CHANNELS).map(([v, t]) => opt(v, t, k.channel)).join('')}</select></div></div>
    <div class="f2"><div><label>Начало</label><input type="date" name="start" value="${k.start || ''}" required></div><div><label>Конец</label><input type="date" name="end" value="${k.end || ''}"></div></div>
    <div class="f2"><div><label>Бюджет (оплата), ₽</label><input name="budget" inputmode="decimal" value="${k.budget ?? ''}"></div><div><label>Дата оплаты</label><input type="date" name="paidAt" value="${k.paidAt || ''}"></div></div>
    <div class="f2">
    <div><label>Сравнивать доход</label><select name="scope">${opt('book', 'только этой книги', k.scope || 'book')}${opt('all', 'всех книг', k.scope)}</select></div></div>

    <div class="row between" style="margin-top:14px"><button class="primary" type="submit">Сохранить</button><button type="button" class="danger" data-act="ad.del" data-id="${k.id}">Удалить</button></div>
  </form></div>`;
  return {
    html,
    after: () => {
      const from = addDays(k.start, -14), to = addDays(k.end && k.end < c.dataEnd ? k.end : c.dataEnd, 7);
      const inp = chartInputs(c, from < c.firstDate ? c.firstDate : from, to > c.dataEnd ? c.dataEnd : to);
      inp.bands = [{ from: k.start, to: k.end || c.dataEnd, label: k.name }];
      dailyChart(document.getElementById('chart'), inp);
      document.getElementById('legend').innerHTML = chartLegend(inp);
      const pts = (f) => chronological.map((r) => ({ label: `${fmtShort(r.start)}–${fmtShort(r.end)}`, short: fmtShort(r.start), value: f(r) })).filter((p) => p.value != null);
      if (document.getElementById('cpc')) {
        lineChart(document.getElementById('cpc'), { points: pts(cpc), fmtVal: (v) => num(v, 2) });
        lineChart(document.getElementById('ctr'), { points: pts((r) => (r.impressions ? ctr(r) * 100 : null)), fmtVal: (v) => num(v, 2) });
      }
    },
  };
}

// ---------- действия ----------
acts['ad.new'] = (d) => {
  const c = app().ctx(), ch = d?.ch || 'litnet';
  openSheet('Новая кампания', `<label>Название</label><input name="name" required>
    <div class="f2"><div><label>Книга</label><select name="bookId"><option value="">Все книги</option>${c.activeBooks.map((b) => opt(b.id, b.title)).join('')}</select></div><div><label>Канал</label><select name="channel">${Object.entries(CHANNELS).map(([v, t]) => opt(v, t, ch)).join('')}</select></div></div>
    <div class="f2"><div><label>Начало</label><input type="date" name="start" value="${c.today}" required></div><div><label>Конец</label><input type="date" name="end"></div></div>
    <div class="f2"><div><label>Бюджет (оплата таргетологам), ₽</label><input name="budget" inputmode="decimal"></div><div><label>Дата оплаты</label><input type="date" name="paidAt"></div></div>
    <div class="hint">Дата оплаты — для скидки «Литнет платит». Пусто — считается датой старта.</div>`, async (fd) => {
    const id = 'k' + uid();
    await app().store.put('campaigns', { id, name: fd.get('name').trim(), bookId: fd.get('bookId') || '', scope: fd.get('bookId') ? 'book' : 'all', channel: fd.get('channel'), start: fd.get('start'), end: fd.get('end') || '', budget: N(fd.get('budget')), paidAt: fd.get('paidAt') || '', baseMode: 'auto' });
    app().go('/ad/' + id);
  });
};
forms['ad.save'] = async (fd, f) => {
  const k = app().ctx().campaigns.find((x) => x.id === f.dataset.id);
  const bookId = fd.get('bookId') || '';
  await app().store.put('campaigns', { ...k, name: fd.get('name').trim(), bookId, channel: fd.get('channel'), start: fd.get('start'), end: fd.get('end') || '', budget: N(fd.get('budget')), paidAt: fd.get('paidAt') || '', scope: bookId ? fd.get('scope') : 'all', baseMode: 'auto', baseFrom: '', baseTo: '', baseValue: null });
  toast('Сохранено');
};
acts['ad.del'] = async (d) => {
  if (!(await ask('Удалить кампанию и все её недельные отчёты?'))) return;
  const c = app().ctx();
  await app().store.removeMany('reports', c.data.reports.filter((r) => r.campaignId === d.id).map((r) => r.id));
  await app().store.remove('campaigns', d.id);
  app().go('/ads');
};
acts['rep.del'] = (d) => app().store.remove('reports', d.id);
acts['rep.new'] = (d) => {
  const c = app().ctx();
  const last = c.data.reports.filter((r) => r.campaignId === d.id).sort((x, y) => y.end.localeCompare(x.end))[0];
  const start = last ? addDays(last.end, 1) : (c.campaigns.find((k) => k.id === d.id)?.start || c.today);
  openSheet('Отчёт за неделю или день', `<div class="hint">Для результата за один день поставьте одинаковые даты «с» и «по».</div><div class="f2"><div><label>С</label><input type="date" name="start" value="${start}" required></div><div><label>по</label><input type="date" name="end" value="${addDays(start, 6)}" required></div></div>
    <label>Фактический расход, ₽</label><input name="spend" inputmode="decimal" required><div class="f2"><div><label>Показы (необязательно)</label><input name="impressions" inputmode="numeric"></div><div><label>Клики (необязательно)</label><input name="clicks" inputmode="numeric"></div></div>
    <div class="hint">Расход делится по дням поровну и заменяет «бюджет ÷ дни» в эти дни. CTR и цена клика посчитаются, если указать показы и клики.</div>`, async (fd) => {
    const [spend, impressions, clicks] = ['spend', 'impressions', 'clicks'].map((n) => N(fd.get(n)));
    if (spend == null || Number.isNaN(spend)) { toast('Впишите расход числом'); return false; }
    if ([impressions, clicks].some((x) => x != null && Number.isNaN(x))) { toast('Показы и клики — числами или оставьте пустыми'); return false; }
    await app().store.put('reports', { id: reportId(d.id, fd.get('start')), campaignId: d.id, start: fd.get('start'), end: fd.get('end'), spend, impressions, clicks });
  });
};
acts['rep.paste'] = (d) => {
  openSheet('Вставить таблицу отчёта', `<p class="small muted">Выделите строки таблицы в отчёте таргетологов (можно с заголовком и «Итого»), скопируйте и вставьте сюда. Строки «Итого» пропускаются, неделя, которая уже есть, обновится.</p><textarea name="t" style="min-height:160px" required></textarea>`, async (fd) => {
    const r = parseTargetReport(fd.get('t') || '');
    if (!r.rows.length) { toast('Не нашла строк с неделями. Вставьте таблицу целиком или внесите неделю кнопкой «+ Неделя».'); return false; }
    await app().store.putMany('reports', r.rows.map((x) => ({ id: reportId(d.id, x.start), campaignId: d.id, start: x.start, end: x.end, spend: x.spend, impressions: x.impressions, clicks: x.clicks })));
    toast(`Добавлено недель: ${r.rows.length}`);
  });
};

// ---------- сигналы по таргету, отчёты-скриншоты, запрос для нейросети ----------
const actx = (c) => ({ sales: c.sales, legacyDays: c.legacyDays, reports: c.data.reports, campaigns: c.campaigns, dataEnd: c.dataEnd, baseDays: c.settings.baseDays, today: c.today });
export const activeAlerts = (c) => c.campaigns.filter((k) => !k.oneOff).map((k) => targetAlert(k, actx(c), c.data.adnotes || [])).filter((a) => a && !a.snoozed);
function alertText(a) {
  const t = [];
  if (a.reasons.includes('drop')) t.push(`продажи книги за последние 7 дней упали на ${pct(a.drop, 0)} (${rub(a.last7, 0)} в день против ${rub(a.prev, 0)})`);
  if (a.reasons.includes('below')) t.push(`доход ${rub(a.last7, 0)} в день — ниже порога окупаемости ${rub(a.threshold, 0)}`);
  return t.join('; ');
}
function alertsBlock(c, alerts) {
  const open = alerts.filter((a) => !a.snoozed);
  if (!open.length) return '';
  return open.map((a) => `<div class="card alert-card"><div class="row between"><b>⚠︎ ${esc(a.name)}</b><span class="badge bad">таргет просел</span></div>
    <p class="small" style="margin:8px 0">${esc(alertText(a))}. Запросите отчёт у таргетологов: скриншот с показами, кликами и ценой клика.</p>
    <div class="row"><button class="primary" data-act="note.new" data-id="${a.campaignId}">Добавить отчёт</button><button data-act="ai.prompt" data-id="${a.campaignId}">Запрос для нейросети</button></div></div>`).join('');
}
function notesSection(c, k) {
  const notes = (c.data.adnotes || []).filter((n) => n.campaignId === k.id).sort((a, b) => b.date.localeCompare(a.date));
  const a = targetAlert(k, actx(c), c.data.adnotes || []);
  return `<div class="card"><h2>Отчёты таргетологов и примечания</h2>
    ${a ? `<div class="alert${a.snoozed ? ' ok' : ''}">${a.snoozed ? 'Отчёт уже добавлен — сигнал отложен на неделю. ' : '⚠︎ '}${esc(alertText(a))}.</div>` : '<p class="small muted">Сейчас всё в порядке. Если продажи по книге просядут, здесь появится подсказка запросить отчёт.</p>'}
    ${notes.map((n) => `<div class="item"><div class="row between"><b>${fmtDate(n.date)}</b><button class="link danger" data-act="note.del" data-id="${n.id}">убрать</button></div>
      ${n.note ? `<div class="idea-text">${esc(n.note)}</div>` : ''}
      ${(n.images || []).length ? `<div class="shots">${n.images.map((src, i) => `<button class="shot" data-act="note.img" data-id="${n.id}" data-i="${i}"><img src="${src}" alt="скриншот отчёта"></button>`).join('')}</div>` : ''}</div>`).join('')}
    <div class="row" style="margin-top:10px"><button class="primary" data-act="note.new" data-id="${k.id}">Добавить отчёт</button><button data-act="ai.prompt" data-id="${k.id}">Запрос для нейросети</button></div>
    <div class="hint">«Запрос для нейросети» копирует текст с цифрами кампании, продажами по дням и вашими примечаниями. Скриншоты приложите к сообщению сами (нажмите на скриншот — откроется крупно, его можно сохранить).</div></div>`;
}
acts['note.new'] = (d) => {
  const c = app().ctx();
  openSheet('Отчёт таргетологов', `<label for="nd">Дата</label><input id="nd" type="date" name="date" value="${c.today}" required>
    <label for="ni">Скриншоты отчёта (до 3)</label><input id="ni" type="file" name="img" accept="image/*" multiple>
    <label for="nn">Примечания</label><textarea id="nn" name="note" placeholder="что сказали таргетологи, что поменяли, ваши наблюдения"></textarea>`, async (fd) => {
    const files = fd.getAll('img').filter((f) => f && f.size).slice(0, 3);
    const note = (fd.get('note') || '').trim();
    if (!files.length && !note) { toast('Добавьте скриншот или примечание'); return false; }
    toast('Сохраняю…');
    const images = [];
    for (const f of files) images.push(await resizeImage(f, 1200, 0.8));
    await app().store.put('adnotes', { id: 'n' + uid(), campaignId: d.id, date: fd.get('date'), note, images });
    toast('Отчёт сохранён');
  });
};
acts['note.del'] = async (d) => { if (await ask('Убрать этот отчёт?', 'Убрать')) await app().store.remove('adnotes', d.id); };
acts['note.img'] = (d) => {
  const n = (app().ctx().data.adnotes || []).find((x) => x.id === d.id);
  openSheet(`Отчёт от ${fmtDate(n.date)}`, `<img src="${n.images[Number(d.i)]}" alt="скриншот отчёта" style="width:100%;border-radius:12px"><p class="hint">Чтобы сохранить: на телефоне — долгое нажатие на картинку, на компьютере — правая кнопка мыши.</p>`, null);
};
acts['ai.prompt'] = async (d) => {
  const c = app().ctx(), k = c.campaigns.find((x) => x.id === d.id);
  const text = buildTargetPrompt({ sales: c.sales, legacyDays: c.legacyDays, books: c.books, campaigns: c.campaigns, reports: c.data.reports, settings: c.settings, dataEnd: c.dataEnd }, k, targetAlert(k, actx(c), []), c.data.adnotes || []);
  try { await navigator.clipboard.writeText(text); toast('Запрос скопирован — вставьте его в чат с нейросетью и приложите скриншоты'); }
  catch { openSheet('Запрос для нейросети', `<p class="small muted">Выделите текст и скопируйте:</p><textarea style="min-height:300px" readonly>${esc(text)}</textarea>`, null); }
};

acts['disc.confirm'] = (d) => {
  const c = app().ctx(), m = c.monthsMap[d.m] || {}, x = c.discounts[d.m];
  openSheet(`Скидка «Литнет платит» — ${fmtMonth(d.m)}`, `<p class="small muted">Приложение посчитало скидку ${rub(x.expected)}. Когда Литнет её начислит, отметьте здесь — тогда она войдёт в чистый доход.</p>
    <label class="check"><input type="checkbox" name="ok" checked>Скидка подтверждена</label>
    <label for="da">Фактическая сумма скидки, ₽ (если отличается)</label><input id="da" name="amount" inputmode="decimal" value="${m.litnetDiscountAmount ?? ''}" placeholder="${num(x.expected, 2)}">`, async (fd) => {
    const v = N(fd.get('amount'));
    await app().store.put('months', { ...m, id: d.m, month: d.m, litnetDiscountConfirmed: !!fd.get('ok'), litnetDiscountAmount: v == null || Number.isNaN(v) ? null : v });
    toast(fd.get('ok') ? 'Скидка подтверждена' : 'Скидка снова «ожидается»');
  });
};

forms['base.try'] = (fd, f) => {
  const v = N(fd.get('value'));
  const from = fd.get('from'), to = fd.get('to');
  if (v != null && !Number.isNaN(v)) app().ui.baseTry = { id: f.dataset.id, mode: 'value', value: v };
  else if (from && to && from <= to) app().ui.baseTry = { id: f.dataset.id, mode: 'range', from, to };
  else { toast('Укажите период (с — по) или сумму в день'); return; }
  app().rerender(); window.scrollTo(0, 0);
};
acts['base.reset'] = () => { app().ui.baseTry = null; };
