// Маркетинговый отчёт для нейросети. Сначала собираем модель (разделы, абзацы, таблицы с «сырыми» числами),
// потом выводим её в нужный формат: Markdown, HTML, Excel, JSON. Чистые функции — проверены тестами.
import {
  addDays, countDays, incomeSeries, sumSeries, byWeek, byMonth, booksBreakdown, priceAt, monthKey,
  monthsBetween, monthFinance, campaignMetrics, ctr, cpc, buildPlan, r2, monthEnd, chapterEffect,
} from './calc.js';
import { fmtDate, fmtMonth } from './format.js';

// ---------- ячейки: значение + тип, чтобы Excel получил числа, а текст — красивое форматирование ----------
const cellOf = (t) => (v) => (v == null || Number.isNaN(v) ? null : { v: r2(v), t });
export const RUB = cellOf('rub'), RUB2 = cellOf('rub2'), N0 = cellOf('n0'), N2 = cellOf('n2');
export const PCT = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : { v: Math.round(v * 10 ** (d + 2)) / 10 ** (d + 2), t: 'pct' + d });
const grp = (x, d) => x.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\s/g, ' ');
export function cellText(c) {
  if (c == null) return '—';
  if (typeof c !== 'object') return String(c);
  const { v, t } = c;
  if (t === 'rub') return grp(Math.round(v), 0) + ' ₽';
  if (t === 'rub2') return grp(v, 2) + ' ₽';
  if (t === 'n0') return grp(Math.round(v), 0);
  if (t === 'n2') return grp(v, 2);
  if (t.startsWith('pct')) return (v * 100).toFixed(Number(t.slice(3))).replace('.', ',') + ' %';
  return String(v);
}
const T = (s) => cellText(s);
const CH = { litnet: '«Литнет платит» (таргет таргетологов Литнета)', own: 'свой таргет', other: 'другое' };
const EV = { chapter: 'выкладка главы', discount: 'скидка', start: 'старт книги', promo: 'акция Литнета', contest: 'итоги конкурса', note: 'заметка' };

// ---------- модель отчёта ----------
export function buildReportModel(d, from, to) {
  const s = d.settings;
  const title = (id, fb) => d.books.find((b) => b.id === id)?.title || fb || '';
  const days = countDays(from, to);
  const ser = incomeSeries(d.sales, d.legacyDays, from, to);
  const prevSer = incomeSeries(d.sales, d.legacyDays, addDays(from, -days), addDays(from, -1));
  const full = incomeSeries(d.sales, d.legacyDays, addDays(from, -6), to);
  // среднее за 7 дней — только по дням, за которые есть данные
  const ma = full.slice(6).map((_, i) => { const w = full.slice(i, i + 7).filter((x) => x.known); return w.length ? w.reduce((a, x) => a + x.royalty, 0) / w.length : null; });
  const roy = sumSeries(ser), prevRoy = sumSeries(prevSer);
  const prevKnown = prevSer.some((x) => x.known);
  const qty = ser.reduce((a, x) => a + x.qty, 0), saleQty = ser.reduce((a, x) => a + x.saleQty, 0), subQty = ser.reduce((a, x) => a + x.subQty, 0);
  const finOf = (k) => monthFinance(k, { sales: d.sales, legacyDays: d.legacyDays, spend: d.spend, discounts: d.discounts, months: d.monthsMap, settings: s });
  const mctx = { sales: d.sales, legacyDays: d.legacyDays, reports: d.reports, campaigns: d.campaigns, dataEnd: d.dataEnd, baseDays: s.baseDays, today: d.today };
  const months = monthsBetween(monthKey(from), monthKey(to));
  const plan = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: s.planOverrides || {} });
  const planOf = (k) => plan.find((p) => p.month === k)?.plan ?? null;
  const camps = d.campaigns.filter((k) => k.start && k.start <= to && (!k.end || k.end >= from)).sort((a, b) => a.start.localeCompare(b.start));
  const adOn = (date) => camps.filter((k) => date >= k.start && date <= (k.end || '9999')).map((k) => k.name);
  const evBy = {};
  for (const x of d.days) for (const e of x.events || []) if (x.date >= from && x.date <= to) (evBy[x.date] ||= []).push(`${EV[e.type] || e.type}${e.bookId ? ' (' + title(e.bookId) + ')' : ''}${e.text ? ': ' + e.text : ''}`);
  const notes = d.days.filter((x) => x.note && x.date >= from && x.date <= to);

  const B = [];
  const h2 = (text) => B.push({ type: 'h2', text });
  const h3 = (text) => B.push({ type: 'h3', text });
  const p = (text) => B.push({ type: 'p', text });
  const list = (items) => items.length && B.push({ type: 'list', items });
  const table = (name, head, rows) => B.push({ type: 'table', name, head, rows });

  h2('Контекст (прочитай перед анализом)');
  list([
    'Я автор любовных романов на платформе Литнет (litnet.com). Доход — роялти: 70 % от цены продажи или подписки.',
    '«Продажа» — покупка книги целиком, «подписка» — оплата доступа к книге в процессе написания (выкладка по главам).',
    `Продвижение: (1) «Литнет платит» — таргетированную рекламу ведут таргетологи Литнета, я оплачиваю бюджет; если расход за календарный месяц ≥ ${T(N0(s.litnetThreshold))} ₽, начисляется скидка ${s.litnetPct} % (скидка = (расход месяца − скидка прошлого месяца) × ${s.litnetPct} %). (2) Литнет Rocket — за каждую продажу, которую привела реклама Литнета, из роялти списывается комиссия = индекс Rocket (не выше ${s.rocketCap} ₽). (3) Бесплатные баннеры и приоритетные показы в рекомендациях.`,
    `Налог: ${s.taxRate} % от ${s.taxBase === 'royalty' ? 'роялти' : 'полной цены проданных книг'}. Чистый доход = роялти − Rocket − реклама (с учётом скидки) − налог.`,
    'Окупаемость кампании: база = средний доход в день до старта кампании (дни, когда не шла другая реклама этой книги); прирост = доход в день во время кампании − база; окупаемость в день = прирост − расход в день. Порог окупаемости — доход в день, при котором реклама выходит в ноль.',
  ]);

  h2('Итоги периода');
  table('Итоги', ['Показатель', 'Значение'], [
    ['Роялти (доход до вычетов)', RUB(roy)],
    ['Сумма продаж по полной цене', RUB(sumSeries(ser, 'gross'))],
    ['Продано, шт.', N0(qty)],
    ['— из них продаж', N0(saleQty)],
    ['— из них подписок', N0(subQty)],
    ['Средний доход в день', RUB(roy / days)],
    ['Средний гонорар за 1 шт.', qty ? RUB2(roy / qty) : null],
    [`Роялти за предыдущие ${days} дн. (${fmtDate(addDays(from, -days))} – ${fmtDate(addDays(from, -1))})`, prevKnown ? RUB(prevRoy) : 'нет данных'],
    ['Изменение к предыдущему периоду', prevKnown && prevRoy ? PCT(roy / prevRoy - 1) : null],
  ]);

  h2('По месяцам');
  table('Месяцы', ['Месяц', 'Роялти', 'Полная цена', 'Продажи, шт', 'Подписки, шт', 'Rocket, ₽', 'Индекс Rocket', 'Реклама после скидки', 'Скидка ожидается (не учтена)', 'Реклама: прогноз на весь месяц', 'Налог', 'Чистый', 'Цель', '% цели'],
    months.map((k) => {
      const f = finOf(k);
      const g = byMonth(incomeSeries(d.sales, d.legacyDays, k + '-01', monthEnd(k) > to ? to : monthEnd(k)))[0] || { saleQty: 0, subQty: 0 };
      const pl = planOf(k);
      return [fmtMonth(k) + (k === monthKey(d.dataEnd) && d.dataEnd < monthEnd(k) ? ' (месяц идёт)' : ''), RUB(f.royalty), RUB(f.gross), N0(g.saleQty), N0(g.subQty), f.rocketFee ? RUB(f.rocketFee) : 'не внесено', f.rocketIndex != null ? N2(f.rocketIndex) : null, RUB(f.adCost), f.expectedDiscount ? RUB(f.expectedDiscount) : null, d.forecast && d.forecast.month === k ? RUB(d.forecast.total) : null, RUB(f.tax), RUB(f.net), pl == null ? null : RUB(pl), pl ? PCT(f.royalty / pl, 0) : null];
    }));

  h2('По неделям (с понедельника)');
  table('Недели', ['Неделя', 'Роялти', 'Продажи, шт', 'Подписки, шт', 'В день', 'Реклама шла'],
    byWeek(ser).map((w) => [`${fmtDate(w.from)} – ${fmtDate(w.to)}`, RUB(w.royalty), N0(w.saleQty), N0(w.subQty), RUB(w.avgPerDay), [...new Set(incomeSeries([], [], w.from, w.to).flatMap((x) => adOn(x.date)))].join(', ') || 'нет']));

  h2('Книги');
  table('Книги', ['Книга', 'Статус', 'Цена сейчас', 'Роялти', 'Доля', 'Продажи, шт', 'Продажи, ₽', 'Подписки, шт', 'Подписки, ₽'],
    booksBreakdown(d.sales, from, to).map((b) => { const bk = d.books.find((x) => x.id === b.bookId) || {}; return [title(b.bookId, b.title), bk.status === 'done' ? 'завершена' : 'в процессе', RUB2(priceAt(bk, d.today)), RUB(b.royalty), PCT(b.share, 0), N0(b.saleQty), RUB(b.saleRoyalty), N0(b.subQty), RUB(b.subRoyalty)]; }));
  const priceCh = d.books.flatMap((b) => (b.priceHistory || []).filter((x) => x.from >= from && x.from <= to).map((x) => [x.from, b.title, x.price])).sort((a, b) => a[0].localeCompare(b[0]));
  if (priceCh.length) table('Цены', ['С даты', 'Книга', 'Цена'], priceCh.map(([dt, t, pr]) => [fmtDate(dt), t, RUB2(pr)]));

  const inProgress = d.books.filter((b) => b.status !== 'done' && b.status !== 'removed');
  if (inProgress.length) {
    h2('Выкладка глав и подписки');
    p('Среднее число подписок в день: в дни, когда я выкладывала главу этой книги, и в остальные дни (по книгам в процессе).');
    table('Выкладка глав', ['Книга', 'Дней с выкладкой', 'Подписок в день — с выкладкой', 'Подписок в день — без выкладки'],
      chapterEffect(d.sales, d.days, inProgress, from, to).map((x) => [x.title, N0(x.chapterDays), x.subsOn == null ? 'выкладок не отмечено' : N2(x.subsOn), N2(x.subsOff)]));
  }

  h2('Рекламные кампании');
  if (!camps.length) p('В периоде кампаний не было.');
  camps.forEach((k, i) => {
    const m = campaignMetrics(k, mctx);
    h3(k.name);
    p(`Канал: ${CH[k.channel] || k.channel}. Книга: ${k.bookId ? title(k.bookId) : 'все книги'}. Период: ${fmtDate(k.start)} – ${k.end ? fmtDate(k.end) : 'без даты окончания'}. Бюджет: ${k.budget ? T(RUB(k.budget)) : 'не указан'}.`);
    if (m.status === 'planned') { p('Кампания ещё не началась.'); return; }
    table(`Кампания ${i + 1}`, ['Показатель', 'Значение'], [
      ['Дней с данными', N0(m.days)],
      [`Расход в день (${m.spendSource === 'reports' ? 'по отчётам' : 'бюджет ÷ дни'})`, RUB(m.spendPerDay)],
      ['Расход за период', RUB(m.spendTotal)],
      [`База: доход в день до старта${m.baseFrom ? ` (${m.baseDaysUsed} дн., ${fmtDate(m.baseFrom)} – ${fmtDate(m.baseTo)})` : ''}`, m.baseline == null ? 'нет данных' : RUB(m.baseline)],
      ['Доход в день во время кампании', RUB(m.avgDuring)],
      ['Прирост к базе в день', RUB(m.uplift)],
      [`Окупаемость в день${m.payback == null ? '' : m.payback >= 0 ? ' (окупается)' : ' (не окупается)'}`, RUB(m.payback)],
      ['Итог за период', RUB(m.paybackTotal)],
      ['Порог окупаемости (доход в день)', RUB(m.threshold)],
      ['Стоимость одной продажи (все продажи)', RUB2(m.costPerSale)],
      ['Стоимость дополнительной продажи', RUB2(m.costPerExtraSale)],
    ]);
    if (m.baseNotes?.includes('overlap')) p('⚠︎ В базе есть дни другой рекламы — база может быть завышена.');
    if (m.baseNotes?.includes('few')) p('⚠︎ База посчитана по малому числу дней — оценка неточная.');
    const reps = d.reports.filter((r) => r.campaignId === k.id).sort((a, b) => a.start.localeCompare(b.start));
    if (reps.length) table(`Таргет ${i + 1}`, ['Период', 'Расход', 'Показы', 'Клики', 'CTR', 'CPC'], reps.map((r) => [`${fmtDate(r.start)} – ${fmtDate(r.end)}`, RUB2(r.spend), N0(r.impressions), N0(r.clicks), PCT(ctr(r), 2), RUB2(cpc(r))]));
  });

  const lmonths = months.filter((k) => d.discounts[k]);
  if (lmonths.length) {
    h2('«Литнет платит»: расход и скидка');
    table('Литнет платит', ['Месяц', 'Оплачено таргетологам', 'Порог достигнут', 'Скидка', 'Статус скидки', 'Оплата после скидки'], lmonths.map((k) => { const x = d.discounts[k]; return [fmtMonth(k), RUB(x.spend), x.qualified ? 'да' : 'нет', RUB(x.discount), x.status === 'confirmed' ? 'подтверждена' : x.status === 'expected' ? 'ожидается' : '—', RUB(x.effective)]; }));
    if (d.forecast && d.forecast.litnet) p(`Прогноз расхода «Литнет платит» за ${fmtMonth(d.forecast.month)} по плану кампаний: ${cellText(RUB(d.forecast.litnet))}.`);
  }

  const evDates = Object.keys(evBy).sort();
  if (evDates.length || notes.length) {
    h2('События и заметки');
    list([...evDates.map((dt) => `${fmtDate(dt)}: ${evBy[dt].join('; ')}`), ...notes.map((x) => `${fmtDate(x.date)} (заметка): ${x.note}`)]);
  }

  h2('Доход по дням');
  table('По дням', ['Дата', 'День', 'Роялти', 'Шт', 'Продажи, шт', 'Подписки, шт', 'Среднее 7 дн.', 'Реклама', 'События'],
    ser.map((x, i) => [fmtDate(x.date), ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][new Date(x.date + 'T00:00:00Z').getUTCDay()], x.known ? RUB2(x.royalty) : 'нет данных', N0(x.qty), N0(x.saleQty), N0(x.subQty), RUB(ma[i]), adOn(x.date).join(', '), (evBy[x.date] || []).join('; ')]));

  h2('Что я прошу');
  p('Ты — опытный маркетолог в сфере самиздата и платформ электронных книг. Проанализируй данные выше и ответь:');
  B.push({ type: 'olist', items: [
    'Какие кампании и каналы окупаются, какие нет, и почему (с цифрами из отчёта)? Что изменить: бюджет, сроки, книгу для продвижения, креативы (смотри CTR и цену клика)?',
    'Как события (выкладка глав, скидки, акции, смена цен) влияют на продажи и подписки? Какой ритм выкладки и какие цены выглядят выгоднее?',
    'Какие книги тянут доход, а какие стоит продвигать или перезапускать?',
    'Успеваю ли я к целям по доходу и что конкретно сделать в ближайшие 2–4 недели, чтобы их выполнить? Учитывай порог «Литнет платит» и комиссию Rocket.',
    'Каких данных не хватает для более точных выводов?',
  ] });
  p('Дай конкретный план действий по приоритету, без общих советов.');

  return {
    title: `Маркетинговый отчёт автора — ${s.pseudonym}`,
    subtitle: `Период: ${fmtDate(from)} – ${fmtDate(to)} (${days} дн.). Отчёт сформирован ${fmtDate(d.today)}. Данные о продажах есть по ${fmtDate(d.dataEnd)}.`,
    from, to, blocks: B,
  };
}

// ---------- форматы ----------
export function toMarkdown(m) {
  const cell = (c) => cellText(c).replace(/\|/g, '/').replace(/\n+/g, ' ');
  const out = [`# ${m.title}`, m.subtitle, ''];
  for (const b of m.blocks) {
    if (b.type === 'h2') out.push(`## ${b.text}`);
    else if (b.type === 'h3') out.push(`### ${b.text}`);
    else if (b.type === 'p') out.push(b.text, '');
    else if (b.type === 'list') out.push(...b.items.map((x) => `- ${x}`), '');
    else if (b.type === 'olist') out.push(...b.items.map((x, i) => `${i + 1}. ${x}`), '');
    else if (b.type === 'table') {
      out.push('');
      if (!b.rows.length) out.push('_нет данных_');
      else out.push(`| ${b.head.join(' | ')} |`, `|${b.head.map(() => '---').join('|')}|`, ...b.rows.map((r) => `| ${r.map(cell).join(' | ')} |`));
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

const escH = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function toHtml(m) {
  const body = m.blocks.map((b) => {
    if (b.type === 'h2') return `<h2>${escH(b.text)}</h2>`;
    if (b.type === 'h3') return `<h3>${escH(b.text)}</h3>`;
    if (b.type === 'p') return `<p>${escH(b.text)}</p>`;
    if (b.type === 'list') return `<ul>${b.items.map((x) => `<li>${escH(x)}</li>`).join('')}</ul>`;
    if (b.type === 'olist') return `<ol>${b.items.map((x) => `<li>${escH(x)}</li>`).join('')}</ol>`;
    if (b.type === 'table') return b.rows.length ? `<div class="t"><table><thead><tr>${b.head.map((h) => `<th>${escH(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c) => `<td${c && typeof c === 'object' ? ' class="n"' : ''}>${escH(cellText(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p><i>нет данных</i></p>';
    return '';
  }).join('\n');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escH(m.title)}</title>
<style>
:root{--bg:#f6f4f2;--card:#fff;--line:#ece4e7;--text:#1c1a1b;--muted:#7d7277;--pink:#f3bcd0;--soft:#fbe7ef}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:24px;margin:0 0 4px} .sub{color:var(--muted);margin:0 0 20px}
h2{font-size:18px;margin:28px 0 10px;padding-bottom:6px;border-bottom:3px solid var(--pink)} h3{font-size:16px;margin:18px 0 6px}
.t{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:14px;margin:10px 0}
table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}
th{background:var(--soft);text-align:left;font-weight:700;white-space:nowrap}
th,td{padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top} td.n{text-align:right;white-space:nowrap}
tr:last-child td{border-bottom:0} li{margin:4px 0}
@media print{body{background:#fff} .t{border:0;border-radius:0} h2{break-after:avoid} tr{break-inside:avoid}}
</style></head><body><main><h1>${escH(m.title)}</h1><p class="sub">${escH(m.subtitle)}</p>
${body}
</main></body></html>`;
}

export function toJson(m) {
  const plain = (c) => (c && typeof c === 'object' ? c.v : c);
  return JSON.stringify({
    title: m.title, subtitle: m.subtitle, period: { from: m.from, to: m.to },
    units: 'суммы в рублях; доли и проценты — десятичные дроби (0.25 = 25 %)',
    sections: m.blocks.map((b) => (b.type === 'table' ? { type: 'table', name: b.name, columns: b.head, rows: b.rows.map((r) => r.map(plain)) } : b)),
  }, null, 1);
}

// Excel: лист «Отчёт» с текстом и по листу на каждую таблицу. XLSX — библиотека SheetJS (передаётся снаружи).
const XFMT = { rub: '#,##0" ₽"', rub2: '#,##0.00" ₽"', n0: '#,##0', n2: '#,##0.00', pct0: '0%', pct1: '0.0%', pct2: '0.00%' };
export function toXlsxBook(m, XLSX) {
  const wb = XLSX.utils.book_new();
  const used = new Set();
  const sheetName = (n) => { let base = String(n).replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Лист'; let x = base, i = 2; while (used.has(x.toLowerCase())) x = `${base.slice(0, 26)} ${i++}`; used.add(x.toLowerCase()); return x; };
  const cellX = (c) => (c && typeof c === 'object' ? { t: 'n', v: c.v, z: XFMT[c.t] } : { t: 's', v: c == null ? '—' : String(c) });
  const intro = [[m.title], [m.subtitle], []];
  for (const b of m.blocks) {
    if (b.type === 'h2' || b.type === 'h3') intro.push([], [b.text]);
    else if (b.type === 'p') intro.push([b.text]);
    else if (b.type === 'list' || b.type === 'olist') b.items.forEach((x, i) => intro.push([(b.type === 'olist' ? `${i + 1}. ` : '• ') + x]));
    else if (b.type === 'table') intro.push([`→ таблица на листе «${b.sheet = sheetName(b.name)}»`]);
  }
  const ws0 = XLSX.utils.aoa_to_sheet(intro);
  ws0['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, ws0, sheetName('Отчёт'));
  for (const b of m.blocks) {
    if (b.type !== 'table') continue;
    const ws = XLSX.utils.aoa_to_sheet([b.head.map((h) => ({ t: 's', v: h })), ...b.rows.map((r) => r.map(cellX))]);
    ws['!cols'] = b.head.map((h, j) => ({ wch: Math.min(60, Math.max(h.length, ...b.rows.map((r) => cellText(r[j]).length)) + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, b.sheet);
  }
  return wb;
}

// Совместимость: прежний вызов — сразу Markdown
export const buildMarketingReport = (d, from, to) => toMarkdown(buildReportModel(d, from, to));

// Запрос к нейросети по одной кампании: что насторожило, цифры, продажи по дням, отчёты таргетологов и примечания
export function buildTargetPrompt(d, k, alert, notes = []) {
  const s = d.settings;
  const title = (id) => d.books.find((b) => b.id === id)?.title || '';
  const mctx = { sales: d.sales, legacyDays: d.legacyDays, reports: d.reports, campaigns: d.campaigns, dataEnd: d.dataEnd, baseDays: s.baseDays, today: d.today };
  const m = campaignMetrics(k, mctx);
  const from = m.baseFrom && m.baseFrom < k.start ? m.baseFrom : addDays(k.start, -14);
  const ser = incomeSeries(d.sales, d.legacyDays, from, m.to || d.dataEnd, m.bookId);
  const myNotes = notes.filter((n) => n.campaignId === k.id).sort((a, b) => a.date.localeCompare(b.date));
  const shots = myNotes.reduce((a, n) => a + (n.images || []).length, 0);
  const L = [];
  L.push(`Я автор любовных романов на Литнете (роялти 70 % от цены). Помоги разобраться с рекламной кампанией и подскажи, что делать.`);
  L.push('');
  L.push(`## Кампания «${k.name}»`);
  L.push(`- Канал: ${CH[k.channel] || k.channel}; книга: ${k.bookId ? title(k.bookId) : 'все книги'}; период: ${fmtDate(k.start)} – ${k.end ? fmtDate(k.end) : 'без даты окончания'}; бюджет: ${k.budget ? cellText(RUB(k.budget)) : 'не указан'}.`);
  if (m.status !== 'planned') {
    L.push(`- Расход в день: ${cellText(RUB(m.spendPerDay))}. Доход по книге в день до рекламы (база): ${m.baseline == null ? 'нет данных' : cellText(RUB(m.baseline))}. Во время рекламы: ${cellText(RUB(m.avgDuring))}.`);
    L.push(`- Окупаемость в день (прирост − расход): ${cellText(RUB(m.payback))}. Порог окупаемости: доход ${cellText(RUB(m.threshold))} в день.`);
  }
  if (alert) {
    L.push('');
    L.push('## Что насторожило');
    if (alert.reasons.includes('drop')) L.push(`- За последние 7 дней (${fmtDate(alert.from)} – ${fmtDate(alert.to)}) доход по книге в среднем ${cellText(RUB(alert.last7))} в день — на ${cellText(PCT(alert.drop, 0))} меньше, чем неделей раньше (${cellText(RUB(alert.prev))}).`);
    if (alert.reasons.includes('below')) L.push(`- Доход в день (${cellText(RUB(alert.last7))}) ниже порога окупаемости (${cellText(RUB(alert.threshold))}) — реклама сейчас работает в минус.`);
  }
  const reps = d.reports.filter((r) => r.campaignId === k.id).sort((a, b) => a.start.localeCompare(b.start));
  if (reps.length) {
    L.push('');
    L.push('## Цифры таргетологов');
    L.push('| Период | Расход | Показы | Клики | CTR | CPC |', '|---|---|---|---|---|---|');
    for (const r of reps) L.push(`| ${fmtDate(r.start)} – ${fmtDate(r.end)} | ${cellText(RUB2(r.spend))} | ${cellText(N0(r.impressions))} | ${cellText(N0(r.clicks))} | ${cellText(PCT(ctr(r), 2))} | ${cellText(RUB2(cpc(r)))} |`);
  }
  if (myNotes.length) {
    L.push('');
    L.push('## Отчёты таргетологов и мои примечания');
    for (const n of myNotes) L.push(`- ${fmtDate(n.date)}: ${n.note || '(без примечания)'}${(n.images || []).length ? ` — скриншот${n.images.length > 1 ? 'ы' : ''} отчёта прикладываю` : ''}`);
  }
  L.push('');
  L.push('## Доход по книге по дням');
  L.push('| Дата | Роялти | Шт | Реклама шла |', '|---|---|---|---|');
  for (const x of ser) L.push(`| ${fmtDate(x.date)} | ${x.known ? cellText(RUB2(x.royalty)) : 'нет данных'} | ${x.qty} | ${x.date >= k.start && x.date <= (k.end || '9999') ? 'да' : 'нет'} |`);
  L.push('');
  L.push('## Вопросы');
  L.push(`1. Почему результат кампании ухудшился? Посмотри на динамику продаж${shots ? ' и на скриншоты отчёта таргетологов (показы, клики, CTR, цена клика)' : ''}.`);
  L.push('2. Стоит ли продолжать, поменять бюджет, креативы или аудиторию, или остановить кампанию?');
  L.push('3. Что конкретно спросить и попросить у таргетологов Литнета (какие цифры, какие изменения)?');
  L.push('4. Что я могу сделать сама: цена, скидка, выкладка глав, аннотация, обложка?');
  L.push('Ответь конкретно и по приоритету.');
  if (shots) { L.push(''); L.push(`(К сообщению приложено скриншотов: ${shots}.)`); }
  return L.join('\n') + '\n';
}
