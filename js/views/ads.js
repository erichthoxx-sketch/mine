import { esc, acts, forms, openSheet, opt, toast, N, uid } from '../ui.js';
import { rub, pct, num, fmtDate, fmtShort, fmtMonth } from '../format.js';
import { campaignMetrics, litnetPace, ctr, cpc, addDays, monthKey, bookIdFor } from '../calc.js';
import { parseTargetReport, reportId } from '../parse.js';
import { dailyChart, lineChart } from '../charts.js';
import { chartInputs, chartLegend } from './home.js';

const app = () => window.__app;
export const CHANNELS = { litnet: 'Литнет платит', own: 'Свой таргет', other: 'Другое' };

export function metricsFor(c, k) {
  return campaignMetrics(k, { sales: c.sales, legacyDays: c.legacyDays, reports: c.data.reports, dataEnd: c.dataEnd, baseDays: c.settings.baseDays });
}

function litnetCard(c) {
  const s = c.settings, mk = monthKey(c.today);
  const spendNow = c.spend[mk]?.litnet || 0;
  const pace = litnetPace(spendNow, c.today, { threshold: s.litnetThreshold });
  const hasAny = Object.values(c.spend).some((x) => x.litnet > 0);
  let msg = '';
  if (pace.reached) msg = `<div class="alert ok">✔ Порог ${rub(s.litnetThreshold, 0)} за ${fmtMonth(mk)} достигнут — скидка будет начислена.</div>`;
  else if (hasAny && !pace.onTrack) msg = `<div class="alert bad">⚠ Расход в ${fmtMonth(mk)} идёт ниже порога: сейчас ${rub(spendNow)}, при таком темпе к концу месяца выйдет ≈ ${rub(pace.projected, 0)} из ${rub(s.litnetThreshold, 0)}. Чтобы получить скидку, нужно ещё ${rub(pace.remaining, 0)}${pace.daysLeft > 0 ? ` (≈ ${rub(pace.perDayNeeded, 0)} в день, осталось ${pace.daysLeft} дн.)` : ''}. Без достижения порога скидка за месяц не начисляется.</div>`;
  else if (hasAny) msg = `<div class="alert ok">Темп расхода достаточный: к концу месяца ≈ ${rub(pace.projected, 0)}.</div>`;
  else msg = '<p class="muted">Пока нет расхода по «Литнет платит». Добавьте кампанию с этим каналом и недельные отчёты таргетологов.</p>';
  const months = Object.keys(c.spend).filter((k) => c.spend[k].litnet > 0).sort().reverse().slice(0, 8);
  return `<div class="card"><h2>Скидка «Литнет платит»</h2>
    <div class="row between small"><span>${fmtMonth(mk)}: расход ${rub(spendNow)}</span><span class="muted">порог ${rub(s.litnetThreshold, 0)}</span></div>
    <div class="progress"><i style="width:${Math.min(100, (spendNow / s.litnetThreshold) * 100).toFixed(1)}%"></i></div>${msg}
    ${months.length ? `<div class="scroll"><table><tr><th>Месяц</th><th>Расход</th><th>Скидка</th><th>После скидки</th><th></th></tr>${months.map((k) => { const d = c.discounts[k]; return `<tr><td>${fmtMonth(k)}</td><td>${rub(d.spend)}</td><td>${d.qualified ? rub(d.discount) : '<span class="muted" title="расход ниже порога">нет</span>'}</td><td>${rub(d.effective)}</td><td><button class="link" data-act="month.edit" data-m="${k}">изм.</button></td></tr>`; }).join('')}</table></div>
    <div class="hint">Скидка = (расход за месяц − скидка за прошлый месяц) × ${s.litnetPct}%, если расход за календарный месяц ≥ ${rub(s.litnetThreshold, 0)}. Расход считается по недельным отчётам (неделя делится по дням между месяцами). Фактическую цифру месяца можно вписать вручную — кнопка «изм.».</div>` : ''}
  </div>`;
}

export function ads(a) {
  const c = a.ctx();
  const list = [...c.campaigns].sort((x, y) => (y.start || '').localeCompare(x.start || ''));
  const html = `${litnetCard(c)}
  <div class="row between" style="margin:14px 0 10px"><h2 style="margin:0">Кампании</h2><button class="primary" data-act="ad.new">+ Кампания</button></div>
  <div class="card list">${list.length ? list.map((k) => {
    const m = metricsFor(c, k);
    const badge = m.status === 'planned' ? '<span class="badge">запланирована</span>' : m.status === 'active' ? '<span class="badge good">идёт</span>' : '<span class="badge">завершена</span>';
    const pay = m.payback == null ? '<span class="muted">нет базы для сравнения</span>' : `<span class="${m.payback >= 0 ? 'up' : 'down'}">${m.payback >= 0 ? '▲ окупается' : '▼ не окупается'}: ${rub(m.payback, 0)}/день</span>`;
    return `<a class="item" href="#/ad/${k.id}"><div class="row between"><b>${esc(k.name)}</b>${badge}</div>
      <div class="small muted">${esc(CHANNELS[k.channel] || '')} · ${esc(k.bookId ? c.titleOf(k.bookId, '') : 'все книги')} · ${fmtDate(k.start)}–${fmtDate(k.end) || '…'}</div>
      ${m.status === 'planned' ? '' : `<div class="small">расход ${rub(m.spendPerDay, 0)}/день · ${pay}</div>`}</a>`;
  }).join('') : '<p class="muted">Кампаний пока нет.</p>'}</div>`;
  return { html };
}

export function adPage(a, id) {
  const c = a.ctx();
  const k = c.campaigns.find((x) => x.id === id);
  if (!k) return { html: '<div class="card"><p>Кампания не найдена.</p><a href="#/ads">← К рекламе</a></div>' };
  const m = metricsFor(c, k);
  const reps = c.data.reports.filter((r) => r.campaignId === k.id).sort((x, y) => y.start.localeCompare(x.start));
  const chronological = [...reps].reverse();
  const bm = k.baseMode || 'auto';
  const metricsHtml = m.status === 'planned' ? '<p class="muted">Кампания ещё не началась (или нет данных продаж за её период).</p>' : `
    <dl class="dl">
      <dt>Расход в день ${m.spendSource === 'reports' ? '(по отчётам)' : '(бюджет ÷ дни)'}</dt><dd>${rub(m.spendPerDay)}</dd>
      <dt>База: средний доход в день ${m.baseFrom ? `(${fmtDate(m.baseFrom)}–${fmtDate(m.baseTo)})` : '(вручную)'}</dt><dd>${m.baseline == null ? '<span class="muted">нет данных до старта — задайте базу вручную</span>' : rub(m.baseline)}</dd>
      <dt>Средний доход в день во время кампании (${m.days} дн.)</dt><dd>${rub(m.avgDuring)}</dd>
      <dt>Прирост к базе</dt><dd class="${m.uplift == null ? '' : m.uplift >= 0 ? 'up' : 'down'}">${m.uplift == null ? '—' : rub(m.uplift)}</dd>
      <dt>Окупаемость в день (прирост − расход)</dt><dd class="${m.payback == null ? '' : m.payback >= 0 ? 'up' : 'down'}">${m.payback == null ? '—' : (m.payback >= 0 ? '▲ ' : '▼ ') + rub(m.payback)}</dd>
      <dt>Порог окупаемости: доход в день должен быть не ниже</dt><dd>${m.threshold == null ? '—' : rub(m.threshold)}</dd>
      <dt>Итог за период ${fmtDate(m.from)}–${fmtDate(m.to)}</dt><dd class="${m.paybackTotal == null ? '' : m.paybackTotal >= 0 ? 'up' : 'down'}">${m.paybackTotal == null ? '—' : rub(m.paybackTotal)} <span class="muted small">(расход ${rub(m.spendTotal)})</span></dd>
      <dt>Стоимость одной продажи</dt><dd>${m.costPerSale == null ? '—' : rub(m.costPerSale)} <span class="muted small">(расход ÷ все ${m.qtyDuring} шт. за период)</span></dd>
      <dt>Стоимость одной «лишней» продажи</dt><dd>${m.costPerExtraSale == null ? '<span class="muted">продаж не больше, чем в базе</span>' : rub(m.costPerExtraSale)}</dd>
    </dl>`;
  const html = `<p><a href="#/ads">← Вся реклама</a></p>
  <div class="card"><h2>${esc(k.name)}</h2>${metricsHtml}</div>
  <div class="card"><h2>Доход вокруг кампании</h2><div class="chart" id="chart"></div><div id="legend"></div></div>
  <div class="card"><h2>Недельные отчёты таргетологов</h2>
    ${reps.length ? `<div class="scroll"><table><tr><th>Неделя</th><th>Расход</th><th>Показы</th><th>Клики</th><th>CPC</th><th>CTR</th><th></th></tr>${reps.map((r) => `<tr><td>${fmtShort(r.start)}–${fmtDate(r.end)}</td><td>${rub(r.spend)}</td><td>${num(r.impressions)}</td><td>${num(r.clicks)}</td><td>${r.clicks ? rub(cpc(r)) : '—'}</td><td>${r.impressions ? pct(ctr(r), 2) : '—'}</td><td><button class="link danger" data-act="rep.del" data-id="${r.id}">убрать</button></td></tr>`).join('')}</table></div>` : '<p class="muted">Отчётов пока нет.</p>'}
    <div class="row" style="margin-top:10px"><button class="primary" data-act="rep.new" data-id="${k.id}">+ Неделя</button><button data-act="rep.paste" data-id="${k.id}">Вставить таблицу</button></div>
    ${chronological.length ? `<h3>Цена клика (CPC), ₽</h3><div class="chart" id="cpc"></div><h3>CTR, %</h3><div class="chart" id="ctr"></div>` : ''}
  </div>
  <div class="card"><h2>Настройки кампании</h2>
  <form data-form="ad.save" data-id="${k.id}">
    <label style="margin-top:0">Название</label><input name="name" value="${esc(k.name)}" required>
    <div class="f2"><div><label>Книга</label><select name="bookId"><option value="">Все книги</option>${c.books.map((b) => opt(b.id, b.title, k.bookId)).join('')}</select></div>
    <div><label>Канал</label><select name="channel">${Object.entries(CHANNELS).map(([v, t]) => opt(v, t, k.channel)).join('')}</select></div></div>
    <div class="f2"><div><label>Начало</label><input type="date" name="start" value="${k.start || ''}" required></div><div><label>Конец</label><input type="date" name="end" value="${k.end || ''}"></div></div>
    <div class="f2"><div><label>Бюджет, ₽</label><input name="budget" inputmode="decimal" value="${k.budget ?? ''}"></div>
    <div><label>Сравнивать доход</label><select name="scope">${opt('book', 'только этой книги', k.scope || 'book')}${opt('all', 'всех книг', k.scope)}</select></div></div>
    <label>База для сравнения</label><select name="baseMode">${opt('auto', `${c.settings.baseDays} дней до старта (по умолчанию)`, bm)}${opt('range', 'свой период', bm)}${opt('value', 'вручную: ₽ в день', bm)}</select>
    <div class="f2"><div><label>Дней до старта (если авто)</label><input name="baseDays" inputmode="numeric" value="${k.baseDays ?? ''}" placeholder="${c.settings.baseDays}"></div><div><label>База вручную, ₽/день</label><input name="baseValue" inputmode="decimal" value="${k.baseValue ?? ''}"></div></div>
    <div class="f2"><div><label>Свой период: с</label><input type="date" name="baseFrom" value="${k.baseFrom || ''}"></div><div><label>по</label><input type="date" name="baseTo" value="${k.baseTo || ''}"></div></div>
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
acts['ad.new'] = () => {
  const c = app().ctx();
  openSheet('Новая кампания', `<label>Название</label><input name="name" required>
    <div class="f2"><div><label>Книга</label><select name="bookId"><option value="">Все книги</option>${c.books.map((b) => opt(b.id, b.title)).join('')}</select></div><div><label>Канал</label><select name="channel">${Object.entries(CHANNELS).map(([v, t]) => opt(v, t)).join('')}</select></div></div>
    <div class="f2"><div><label>Начало</label><input type="date" name="start" value="${c.today}" required></div><div><label>Конец</label><input type="date" name="end"></div></div>
    <label>Бюджет, ₽ (на весь период)</label><input name="budget" inputmode="decimal">`, async (fd) => {
    const id = 'k' + uid();
    await app().store.put('campaigns', { id, name: fd.get('name').trim(), bookId: fd.get('bookId') || '', scope: fd.get('bookId') ? 'book' : 'all', channel: fd.get('channel'), start: fd.get('start'), end: fd.get('end') || '', budget: N(fd.get('budget')), baseMode: 'auto' });
    location.hash = '#/ad/' + id;
  });
};
forms['ad.save'] = async (fd, f) => {
  const k = app().ctx().campaigns.find((x) => x.id === f.dataset.id);
  const bookId = fd.get('bookId') || '';
  await app().store.put('campaigns', { ...k, name: fd.get('name').trim(), bookId, channel: fd.get('channel'), start: fd.get('start'), end: fd.get('end') || '', budget: N(fd.get('budget')), scope: bookId ? fd.get('scope') : 'all', baseMode: fd.get('baseMode'), baseDays: N(fd.get('baseDays')), baseValue: N(fd.get('baseValue')), baseFrom: fd.get('baseFrom') || '', baseTo: fd.get('baseTo') || '' });
  toast('Сохранено');
};
acts['ad.del'] = async (d) => {
  if (!confirm('Удалить кампанию и её недельные отчёты?')) return;
  const c = app().ctx();
  await app().store.removeMany('reports', c.data.reports.filter((r) => r.campaignId === d.id).map((r) => r.id));
  await app().store.remove('campaigns', d.id);
  location.hash = '#/ads';
};
acts['rep.del'] = (d) => app().store.remove('reports', d.id);
acts['rep.new'] = (d) => {
  const c = app().ctx();
  const last = c.data.reports.filter((r) => r.campaignId === d.id).sort((x, y) => y.end.localeCompare(x.end))[0];
  const start = last ? addDays(last.end, 1) : (c.campaigns.find((k) => k.id === d.id)?.start || c.today);
  openSheet('Недельный отчёт', `<div class="f2"><div><label>Неделя с</label><input type="date" name="start" value="${start}" required></div><div><label>по</label><input type="date" name="end" value="${addDays(start, 6)}" required></div></div>
    <label>Расход, ₽</label><input name="spend" inputmode="decimal" required><div class="f2"><div><label>Показы</label><input name="impressions" inputmode="numeric" required></div><div><label>Клики</label><input name="clicks" inputmode="numeric" required></div></div>
    <div class="hint">CPC и CTR посчитаются сами.</div>`, async (fd) => {
    const [spend, impressions, clicks] = ['spend', 'impressions', 'clicks'].map((n) => N(fd.get(n)));
    if ([spend, impressions, clicks].some((x) => x == null || Number.isNaN(x))) { toast('Заполните расход, показы и клики числами'); return false; }
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
