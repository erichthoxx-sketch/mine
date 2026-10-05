// Маркетинговый отчёт для нейросети: Markdown с контекстом, таблицами и готовым вопросом.
// Чистая функция: на вход — данные приложения, на выход — текст.
import {
  addDays, countDays, incomeSeries, sumSeries, byWeek, byMonth, booksBreakdown, priceAt, monthKey,
  monthsBetween, monthFinance, campaignMetrics, ctr, cpc, buildPlan, r2, monthEnd,
} from './calc.js';
import { fmtDate, fmtMonth } from './format.js';

// Числа в отчёте — без неразрывных пробелов, чтобы нейросеть их уверенно читала
const n0 = (x) => (x == null || Number.isNaN(x) ? '—' : Math.round(x).toLocaleString('ru-RU').replace(/\s/g, ' '));
const n2 = (x) => (x == null || Number.isNaN(x) ? '—' : r2(x).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ' '));
const rub = (x) => (x == null ? '—' : n0(x) + ' ₽');
const pct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '—' : (x * 100).toFixed(d).replace('.', ',') + ' %');
const cell = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n+/g, ' ');
const table = (head, rows) => rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n') : '_нет данных_';
const CH = { litnet: '«Литнет платит» (таргет таргетологов Литнета)', own: 'свой таргет', other: 'другое' };
const EV = { chapter: 'выкладка главы', discount: 'скидка', start: 'старт книги', promo: 'акция Литнета', contest: 'итоги конкурса', note: 'заметка' };

export function buildMarketingReport(d, from, to) {
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
  const mctx = { sales: d.sales, legacyDays: d.legacyDays, reports: d.reports, campaigns: d.campaigns, dataEnd: d.dataEnd, baseDays: s.baseDays };
  const months = monthsBetween(monthKey(from), monthKey(to));
  const plan = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: s.planOverrides || {} });
  const planOf = (k) => plan.find((p) => p.month === k)?.plan ?? null;
  const camps = d.campaigns.filter((k) => k.start && k.start <= to && (!k.end || k.end >= from)).sort((a, b) => a.start.localeCompare(b.start));
  const adOn = (date) => camps.filter((k) => date >= k.start && date <= (k.end || '9999')).map((k) => k.name);
  const evBy = {};
  for (const x of d.days) for (const e of x.events || []) if (x.date >= from && x.date <= to) (evBy[x.date] ||= []).push(`${EV[e.type] || e.type}${e.bookId ? ' (' + title(e.bookId) + ')' : ''}${e.text ? ': ' + e.text : ''}`);
  const notes = d.days.filter((x) => x.note && x.date >= from && x.date <= to);
  const L = [];

  L.push(`# Маркетинговый отчёт автора — ${s.pseudonym}`);
  L.push(`Период: ${fmtDate(from)} – ${fmtDate(to)} (${days} дн.). Отчёт сформирован ${fmtDate(d.today)}. Данные о продажах есть по ${fmtDate(d.dataEnd)}.`);
  L.push('');
  L.push('## Контекст (прочитай перед анализом)');
  L.push('- Я автор любовных романов на платформе Литнет (litnet.com). Доход — роялти: 70 % от цены продажи или подписки.');
  L.push('- «Продажа» — покупка книги целиком, «подписка» — оплата доступа к книге в процессе написания (выкладка по главам).');
  L.push(`- Продвижение: (1) «Литнет платит» — таргетированную рекламу ведут таргетологи Литнета, я оплачиваю бюджет; если расход за календарный месяц ≥ ${n0(s.litnetThreshold)} ₽, начисляется скидка ${s.litnetPct} % (скидка = (расход месяца − скидка прошлого месяца) × ${s.litnetPct} %). (2) Литнет Rocket — за каждую продажу, которую привела реклама Литнета, из роялти списывается комиссия = индекс Rocket (не выше ${s.rocketCap} ₽). (3) Бесплатные баннеры и приоритетные показы в рекомендациях.`);
  L.push(`- Налог: ${s.taxRate} % от ${s.taxBase === 'royalty' ? 'роялти' : 'полной цены проданных книг'}. Чистый доход = роялти − Rocket − реклама (с учётом скидки) − налог.`);
  L.push('- Окупаемость кампании: база = средний доход в день до старта кампании (дни, когда не шла другая реклама этой книги); прирост = доход в день во время кампании − база; окупаемость в день = прирост − расход в день. Порог окупаемости — доход в день, при котором реклама выходит в ноль.');
  L.push('');

  L.push('## Итоги периода');
  L.push(table(['Показатель', 'Значение'], [
    ['Роялти (доход до вычетов)', rub(roy)],
    ['Сумма продаж по полной цене', rub(sumSeries(ser, 'gross'))],
    ['Продано, шт.', `${qty} (продажи ${saleQty}, подписки ${subQty})`],
    ['Средний доход в день', rub(roy / days)],
    ['Средний гонорар за 1 шт.', qty ? n2(roy / qty) + ' ₽' : '—'],
    [`Предыдущие ${days} дн. (${fmtDate(addDays(from, -days))} – ${fmtDate(addDays(from, -1))})`, prevKnown ? `${rub(prevRoy)} (изменение ${prevRoy ? pct(roy / prevRoy - 1) : '—'})` : 'нет данных'],
  ]));
  L.push('');

  L.push('## По месяцам');
  L.push(table(['Месяц', 'Роялти', 'Полная цена', 'Продажи, шт', 'Подписки, шт', 'Rocket', 'Реклама (после скидки)', 'Налог', 'Чистый', 'Цель', '% цели'],
    months.map((k) => {
      const f = finOf(k), g = byMonth(incomeSeries(d.sales, d.legacyDays, k + '-01', addDays(k + '-01', 40) > to ? to : addDays(k + '-01', 40))).find((x) => x.key === k) || { saleQty: 0, subQty: 0 };
      const p = planOf(k);
      return [fmtMonth(k) + (k === monthKey(d.dataEnd) && d.dataEnd < monthEnd(k) ? ' (месяц идёт)' : ''), rub(f.royalty), rub(f.gross), g.saleQty, g.subQty, f.rocketFee ? `${rub(f.rocketFee)}${f.rocketIndex != null ? ' (индекс ' + n2(f.rocketIndex) + ')' : ''}` : 'не внесено', rub(f.adCost), rub(f.tax), rub(f.net), p == null ? '—' : rub(p), p ? pct(f.royalty / p, 0) : '—'];
    })));
  L.push('');

  L.push('## По неделям (с понедельника)');
  L.push(table(['Неделя', 'Роялти', 'Продажи/подписки, шт', 'В день', 'Реклама шла'],
    byWeek(ser).map((w) => [`${fmtDate(w.from)} – ${fmtDate(w.to)}`, rub(w.royalty), `${w.saleQty}/${w.subQty}`, rub(w.avgPerDay), [...new Set(incomeSeries([], [], w.from, w.to).flatMap((x) => adOn(x.date)))].join(', ') || 'нет'])));
  L.push('');

  L.push('## Книги');
  const bb = booksBreakdown(d.sales, from, to);
  L.push(table(['Книга', 'Статус', 'Цена сейчас', 'Роялти', 'Доля', 'Продажи, шт (₽)', 'Подписки, шт (₽)'],
    bb.map((b) => { const bk = d.books.find((x) => x.id === b.bookId) || {}; const p = priceAt(bk, d.today); return [title(b.bookId, b.title), bk.status === 'done' ? 'завершена' : 'в процессе', p == null ? '—' : n2(p) + ' ₽', rub(b.royalty), pct(b.share, 0), `${b.saleQty} (${rub(b.saleRoyalty)})`, `${b.subQty} (${rub(b.subRoyalty)})`]; })));
  const priceCh = d.books.flatMap((b) => (b.priceHistory || []).filter((p) => p.from >= from && p.from <= to).map((p) => ({ from: p.from, t: `- ${fmtDate(p.from)}: «${b.title}» — цена ${n2(p.price)} ₽` }))).sort((a, b) => a.from.localeCompare(b.from)).map((x) => x.t);
  if (priceCh.length) { L.push(''); L.push('Изменения цен в периоде:'); L.push(...priceCh); }
  L.push('');

  L.push('## Рекламные кампании');
  if (!camps.length) L.push('_В периоде кампаний не было._');
  for (const k of camps) {
    const m = campaignMetrics(k, mctx);
    L.push(`### ${k.name}`);
    L.push(`Канал: ${CH[k.channel] || k.channel}. Книга: ${k.bookId ? title(k.bookId) : 'все книги'}. Период: ${fmtDate(k.start)} – ${k.end ? fmtDate(k.end) : 'без даты окончания'}. Бюджет: ${k.budget ? rub(k.budget) : 'не указан'}.`);
    if (m.status === 'planned') { L.push('Кампания ещё не началась.'); L.push(''); continue; }
    L.push('');
    L.push(table(['Показатель', 'Значение'], [
      ['Дней с данными', m.days],
      ['Расход в день', `${rub(m.spendPerDay)} (${m.spendSource === 'reports' ? 'по отчётам' : 'бюджет ÷ дни'})`],
      ['Расход за период', rub(m.spendTotal)],
      ['База: доход в день до старта', m.baseline == null ? 'нет данных' : `${rub(m.baseline)} (${m.baseDaysUsed || 0} дн.${m.baseFrom ? ', ' + fmtDate(m.baseFrom) + ' – ' + fmtDate(m.baseTo) : ''})`],
      ['Доход в день во время кампании', rub(m.avgDuring)],
      ['Прирост к базе в день', rub(m.uplift)],
      ['Окупаемость в день', m.payback == null ? '—' : `${rub(m.payback)} (${m.payback >= 0 ? 'окупается' : 'не окупается'})`],
      ['Итог за период', rub(m.paybackTotal)],
      ['Порог окупаемости (доход в день)', rub(m.threshold)],
      ['Стоимость одной продажи (все продажи)', m.costPerSale == null ? '—' : n2(m.costPerSale) + ' ₽'],
      ['Стоимость дополнительной продажи', m.costPerExtraSale == null ? '—' : n2(m.costPerExtraSale) + ' ₽'],
    ]));
    if (m.baseNotes?.includes('overlap')) L.push('⚠ В базе есть дни другой рекламы — база может быть завышена.');
    if (m.baseNotes?.includes('few')) L.push('⚠ База посчитана по малому числу дней — оценка неточная.');
    const reps = d.reports.filter((r) => r.campaignId === k.id).sort((a, b) => a.start.localeCompare(b.start));
    if (reps.length) {
      L.push('');
      L.push('Отчёты таргетологов:');
      L.push('');
      L.push(table(['Период', 'Расход', 'Показы', 'Клики', 'CTR', 'CPC'], reps.map((r) => [`${fmtDate(r.start)} – ${fmtDate(r.end)}`, n2(r.spend) + ' ₽', n0(r.impressions), n0(r.clicks), pct(ctr(r), 2), cpc(r) == null ? '—' : n2(cpc(r)) + ' ₽'])));
    }
    L.push('');
  }

  const lmonths = months.filter((k) => d.discounts[k]);
  if (lmonths.length) {
    L.push('## «Литнет платит»: расход и скидка');
    L.push(table(['Месяц', 'Расход', 'Порог достигнут', 'Скидка', 'Расход после скидки'], lmonths.map((k) => { const x = d.discounts[k]; return [fmtMonth(k), rub(x.spend), x.qualified ? 'да' : 'нет', rub(x.discount), rub(x.effective)]; })));
    L.push('');
  }

  const evDates = Object.keys(evBy).sort();
  if (evDates.length || notes.length) {
    L.push('## События и заметки');
    for (const dt of evDates) L.push(`- ${fmtDate(dt)}: ${evBy[dt].join('; ')}`);
    for (const x of notes) L.push(`- ${fmtDate(x.date)} (заметка): ${x.note}`);
    L.push('');
  }

  L.push('## Доход по дням');
  L.push(table(['Дата', 'День', 'Роялти', 'Шт (прод/подп)', 'Среднее 7 дн.', 'Реклама', 'События'],
    ser.map((x, i) => [fmtDate(x.date), ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][new Date(x.date + 'T00:00:00Z').getUTCDay()], x.known ? n2(x.royalty) : 'нет данных', `${x.qty} (${x.saleQty}/${x.subQty})`, n0(ma[i]), adOn(x.date).join(', '), (evBy[x.date] || []).join('; ')])));
  L.push('');

  L.push('## Что я прошу');
  L.push('Ты — опытный маркетолог в сфере самиздата и платформ электронных книг. Проанализируй данные выше и ответь:');
  L.push('1. Какие кампании и каналы окупаются, какие нет, и почему (с цифрами из отчёта)? Что изменить: бюджет, сроки, книгу для продвижения, креативы (смотри CTR и цену клика)?');
  L.push('2. Как события (выкладка глав, скидки, акции, смена цен) влияют на продажи и подписки? Какой ритм выкладки и какие цены выглядят выгоднее?');
  L.push('3. Какие книги тянут доход, а какие стоит продвигать или перезапускать?');
  L.push('4. Успеваю ли я к целям по доходу и что конкретно сделать в ближайшие 2–4 недели, чтобы их выполнить? Учитывай порог «Литнет платит» и комиссию Rocket.');
  L.push('5. Каких данных не хватает для более точных выводов?');
  L.push('Дай конкретный план действий по приоритету, без общих советов.');
  return L.join('\n') + '\n';
}
