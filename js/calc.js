// Все расчёты приложения. Чистые функции: без интерфейса и без базы данных.
// Даты везде — строки ISO «ГГГГ-ММ-ДД», месяцы — «ГГГГ-ММ».

export const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const DAY = 86400000;

// ---------- даты ----------
const toMs = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso, n) => toISO(toMs(iso) + n * DAY);
export const diffDays = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY); // b − a
export const countDays = (a, b) => diffDays(a, b) + 1; // включительно
export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export const monthKey = (iso) => iso.slice(0, 7);
export function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
export const monthStart = (key) => key + '-01';
export const monthEnd = (key) => `${key}-${String(daysInMonth(key)).padStart(2, '0')}`;
export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}
export function monthsBetween(a, b) { const out = []; for (let k = a; k <= b; k = addMonths(k, 1)) out.push(k); return out; }
export function weekStart(iso) { // понедельник
  const dow = (new Date(toMs(iso)).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}
export function todayISO(now = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return p; // ГГГГ-ММ-ДД
}

// ---------- ключ строки продаж (против дублей при повторном импорте) ----------
export function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
export const bookIdFor = (title) => 'b' + hashStr(title.trim().toLowerCase());
export function saleId(s) {
  return `${s.date}_${hashStr(s.book.trim().toLowerCase())}_${s.kind === 'sub' ? 'p' : 's'}_${Math.round(s.price * 100)}`;
}

// ---------- ряды по дням ----------
export function firstKnownDate(sales, legacyDays = []) {
  let min = null;
  for (const s of sales) if (!min || s.date < min) min = s.date;
  for (const d of legacyDays) if (d.income != null && (!min || d.date < min)) min = d.date;
  return min;
}
export function lastSaleDate(sales) {
  let max = null;
  for (const s of sales) if (!max || s.date > max) max = s.date;
  return max;
}

// Доход по каждому дню периода. Если bookId задан — только по этой книге.
// До первой даты выгрузки Литнета берём старый трекер (dohody), только для «всех книг».
export function incomeSeries(sales, legacyDays, from, to, bookId = null) {
  const sMap = {};
  for (const s of sales) {
    if (s.date < from || s.date > to) continue;
    if (bookId && s.bookId !== bookId) continue;
    const e = (sMap[s.date] ||= { royalty: 0, gross: 0, qty: 0, saleQty: 0, subQty: 0, saleRoyalty: 0, subRoyalty: 0 });
    e.royalty += s.royalty;
    e.gross += s.price * s.qty;
    e.qty += s.qty;
    if (s.kind === 'sub') { e.subQty += s.qty; e.subRoyalty += s.royalty; } else { e.saleQty += s.qty; e.saleRoyalty += s.royalty; }
  }
  const firstSale = sales.length ? firstKnownDate(sales, []) : null;
  const legacy = {};
  if (!bookId) for (const d of legacyDays) if (d.income != null) legacy[d.date] = d.income;
  const firstKnown = bookId ? firstSale : firstKnownDate(sales, legacyDays);
  return eachDay(from, to).map((date) => {
    const e = sMap[date];
    const useLegacy = !e && legacy[date] != null && (!firstSale || date < firstSale);
    return {
      date,
      royalty: r2(e ? e.royalty : useLegacy ? legacy[date] : 0),
      gross: r2(e ? e.gross : useLegacy ? legacy[date] / 0.7 : 0),
      qty: e ? e.qty : 0,
      saleQty: e ? e.saleQty : 0,
      subQty: e ? e.subQty : 0,
      saleRoyalty: r2(e ? e.saleRoyalty : 0),
      subRoyalty: r2(e ? e.subRoyalty : 0),
      known: firstKnown != null && date >= firstKnown,
    };
  });
}

export function sumSeries(series, field = 'royalty') {
  return r2(series.reduce((a, x) => a + x[field], 0));
}
export function avgSeries(series, field = 'royalty', knownOnly = true) {
  const arr = knownOnly ? series.filter((x) => x.known) : series;
  if (!arr.length) return null;
  return r2(arr.reduce((a, x) => a + x[field], 0) / arr.length);
}
// Скользящее среднее за w дней (в начале ряда — по доступным дням)
export function movingAverage(values, w = 7) {
  return values.map((_, i) => {
    const s = Math.max(0, i - w + 1);
    const slice = values.slice(s, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export function groupSeries(series, keyFn) {
  const map = new Map();
  for (const x of series) {
    const k = keyFn(x.date);
    const g = map.get(k) || { key: k, from: x.date, to: x.date, royalty: 0, gross: 0, qty: 0, saleQty: 0, subQty: 0, days: 0 };
    g.to = x.date; g.royalty += x.royalty; g.gross += x.gross; g.qty += x.qty;
    g.saleQty += x.saleQty; g.subQty += x.subQty; g.days += 1;
    map.set(k, g);
  }
  return [...map.values()].map((g) => ({ ...g, royalty: r2(g.royalty), gross: r2(g.gross), avgPerDay: r2(g.royalty / g.days) }));
}
export const byWeek = (series) => groupSeries(series, weekStart);
export const byMonth = (series) => groupSeries(series, monthKey);

// Разбивка по книгам за период
export function booksBreakdown(sales, from, to) {
  const m = new Map();
  for (const s of sales) {
    if (s.date < from || s.date > to) continue;
    const e = m.get(s.bookId) || { bookId: s.bookId, title: s.book, royalty: 0, qty: 0, saleRoyalty: 0, subRoyalty: 0, saleQty: 0, subQty: 0 };
    e.royalty += s.royalty; e.qty += s.qty;
    if (s.kind === 'sub') { e.subRoyalty += s.royalty; e.subQty += s.qty; } else { e.saleRoyalty += s.royalty; e.saleQty += s.qty; }
    m.set(s.bookId, e);
  }
  const arr = [...m.values()].map((e) => ({ ...e, royalty: r2(e.royalty), saleRoyalty: r2(e.saleRoyalty), subRoyalty: r2(e.subRoyalty) }));
  const total = arr.reduce((a, e) => a + e.royalty, 0);
  return arr.map((e) => ({ ...e, share: total ? e.royalty / total : 0 })).sort((a, b) => b.royalty - a.royalty);
}

// ---------- главный экран ----------
export function dashboardStats(sales, legacyDays, today) {
  const last = lastSaleDate(sales);
  const dataEnd = last && last < today ? last : today;
  const dayOf = (d) => incomeSeries(sales, legacyDays, d, d)[0];
  const avg7 = avgSeries(incomeSeries(sales, legacyDays, addDays(dataEnd, -6), dataEnd), 'royalty', false);
  const mk = monthKey(dataEnd);
  const dom = Number(dataEnd.slice(8, 10));
  const mtd = sumSeries(incomeSeries(sales, legacyDays, monthStart(mk), dataEnd));
  const prevKey = addMonths(mk, -1);
  const prevSame = sumSeries(incomeSeries(sales, legacyDays, monthStart(prevKey), addDays(monthStart(prevKey), Math.min(dom, daysInMonth(prevKey)) - 1)));
  const prevTotal = sumSeries(incomeSeries(sales, legacyDays, monthStart(prevKey), monthEnd(prevKey)));
  return {
    today: dayOf(today).royalty,
    todayHasData: today <= dataEnd,
    dataEnd, avg7, mtd, prevSame, prevTotal,
    vsPrev: prevSame ? mtd / prevSame - 1 : null,
    forecast: dom ? r2((mtd / dom) * daysInMonth(mk)) : null,
  };
}

// ---------- цены книг ----------
export function priceAt(book, date) {
  const h = [...(book.priceHistory || [])].sort((a, b) => a.from.localeCompare(b.from));
  let p = null;
  for (const x of h) if (x.from <= date) p = x.price;
  return p;
}
// Предложение истории цен из продаж: цена «продажи» за день = максимальная цена в строках дня.
// Изменением считается цена, продержавшаяся ≥2 наблюдаемых дней подряд (или последняя).
export function inferPriceChanges(sales, bookId) {
  const perDay = {};
  for (const s of sales) {
    if (s.bookId !== bookId || s.kind === 'sub') continue;
    perDay[s.date] = Math.max(perDay[s.date] || 0, s.price);
  }
  const days = Object.keys(perDay).sort();
  const out = [];
  let cur = null;
  days.forEach((d, i) => {
    const p = perDay[d];
    if (p === cur) return;
    const stable = i === days.length - 1 || perDay[days[i + 1]] === p;
    if (!stable && cur !== null) return;
    out.push({ from: d, price: p });
    cur = p;
  });
  return out;
}

// ---------- расходы на рекламу ----------
// Расход кампании по дням. Где есть фактический расход из отчётов таргетологов — он (неделя делится по дням поровну),
// иначе бюджет ÷ число дней кампании. Только дни не позже cap («сегодня»): будущие дни ещё не потрачены.
export const budgetPerDay = (c) => (c.budget && c.start && c.end && c.end >= c.start ? Number(c.budget) / countDays(c.start, c.end) : 0);
export function campaignDailySpend(c, reports, cap = null) {
  const out = {};
  const covered = new Set();
  for (const r of reports) {
    if (r.campaignId !== c.id || !r.start || !r.end || r.spend == null || r.spend === '') continue;
    if (cap && r.start > cap) continue;
    // отчёт, конец которого ещё в будущем, — его сумма за уже прошедшие дни
    const e = cap && r.end > cap ? cap : r.end;
    const n = countDays(r.start, e);
    if (n <= 0) continue;
    for (const d of eachDay(r.start, e)) { out[d] = (out[d] || 0) + Number(r.spend) / n; covered.add(d); }
  }
  const per = budgetPerDay(c);
  if (per) {
    const last = cap && cap < c.end ? cap : c.end;
    if (last >= c.start) for (const d of eachDay(c.start, last)) if (!covered.has(d)) out[d] = (out[d] || 0) + per;
  }
  return out;
}

// Расход одной кампании по календарным месяцам (сумма расходов по дням)
export function campaignSpendByMonth(c, reports, cap = null) {
  const out = {};
  for (const [d, v] of Object.entries(campaignDailySpend(c, reports, cap))) { const k = monthKey(d); out[k] = (out[k] || 0) + v; }
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}
const chOf = (c) => (c.channel === 'litnet' ? 'litnet' : c.channel === 'own' ? 'own' : 'other');

// Расход по месяцам и каналам: {месяц: {litnet, own, other}}.
// Для «Литнет платит» ручной ввод в months[месяц].litnetSpend перекрывает расчёт.
export function spendByMonthChannel(campaigns, reports, months = {}, cap = null) {
  const out = {};
  for (const c of campaigns) {
    const sp = campaignSpendByMonth(c, reports, cap);
    for (const [k, v] of Object.entries(sp)) { const e = (out[k] ||= { litnet: 0, own: 0, other: 0 }); e[chOf(c)] += v; }
  }
  for (const [k, m] of Object.entries(months)) {
    if (m && m.litnetSpend !== undefined && m.litnetSpend !== null && m.litnetSpend !== '') {
      (out[k] ||= { litnet: 0, own: 0, other: 0 }).litnet = Number(m.litnetSpend);
    }
  }
  for (const e of Object.values(out)) { e.litnet = r2(e.litnet); e.own = r2(e.own); e.other = r2(e.other); }
  return out;
}

// Прогноз расхода текущего месяца: уже потрачено (по сегодня) + оставшиеся дни кампаний в этом месяце по плану
export function monthSpendForecast(campaigns, reports, today) {
  const mk = monthKey(today), end = monthEnd(mk);
  const out = { month: mk, litnet: 0, own: 0, other: 0 };
  for (const c of campaigns) {
    let v = campaignSpendByMonth(c, reports, today)[mk] || 0;
    const per = budgetPerDay(c);
    if (per && c.end > today) {
      const from = addDays(today, 1) > c.start ? addDays(today, 1) : c.start;
      const to = c.end < end ? c.end : end;
      if (to >= from) v += per * countDays(from, to);
    }
    out[chOf(c)] += v;
  }
  out.litnet = r2(out.litnet); out.own = r2(out.own); out.other = r2(out.other);
  out.total = r2(out.litnet + out.own + out.other);
  return out;
}

// ---------- скидка «Литнет платит» (по оферте) ----------
export const DISCOUNT_NOTE = 'Скидка «Литнет платит» не уменьшает оплату рекламы — она уменьшает комиссию Литнета с продаж этого месяца и приходит в следующей выплате.';
// used: {месяц: использованный бюджет} — сколько рекламы открутилось за месяц (текущий месяц — прогноз).
// Скидка(м) = (использовано(м) − скидка(м−1)) × pct, только если использовано(м) ≥ порога;
// не больше комиссии Литнета за месяц минус 1 ₽ (caps: {месяц: комиссия} — по закрытым месяцам).
// Скидка предыдущего месяца — подтверждённая сумма, если введена, иначе рассчитанная.
// Скидка уменьшает комиссию Литнета с продаж этого месяца и приходит в выплате следующего месяца.
// Статус: «ожидается» (посчитана приложением) или «подтверждена» (сумма из отчёта Литнета).
// Скидка считается автоматически и сразу идёт в чистый доход (applied); сумма из отчёта Литнета, если её когда-то ввели, заменяет расчёт.
// payments — оплаты таргетологам, для справки.
// confirmed: {месяц: {amount?}}
export function litnetDiscounts(used, { threshold = 10000, pct = 0.2, forecastMonth = null, payments = {}, caps = {} } = {}, confirmed = {}) {
  const keys = [...new Set([...Object.keys(used), ...Object.keys(confirmed), ...Object.keys(payments)])].sort();
  const out = {};
  if (!keys.length) return out;
  for (const k of monthsBetween(keys[0], keys[keys.length - 1])) {
    const spend = used[k] || 0;
    const prev = out[addMonths(k, -1)]?.discount || 0;
    const ok = spend >= threshold;
    const raw = ok ? r2(Math.max(0, (spend - prev) * pct)) : 0;
    const fee = caps[k] != null ? r2(caps[k]) : null;
    const cap = fee != null ? Math.max(0, r2(fee - 1)) : null;
    const expected = cap != null && raw > cap ? cap : raw;
    const conf = confirmed[k];
    const isConf = !!conf;
    const confirmedAmount = isConf && conf.amount != null && conf.amount !== '' ? r2(Number(conf.amount)) : null;
    const discount = confirmedAmount != null ? confirmedAmount : expected;
    out[k] = {
      month: k, spend, paid: payments[k] || 0, forecast: k === forecastMonth, prevDiscount: prev,
      qualified: ok, fee, capped: expected < raw, expected, confirmedAmount, discount,
      status: isConf ? 'confirmed' : 'expected',
      applied: discount, // считается автоматически и сразу идёт в чистый доход
      payoutMonth: addMonths(k, 1),
    };
  }
  return out;
}

// Продажи Литнета по месяцам: полная цена, роялти и комиссия Литнета (основное агентское вознаграждение, «основное АВ»)
// = полная цена − роялти. Продажи других площадок не входят. По оферте скидка не больше этой комиссии минус 1 ₽.
export function litnetMoneyByMonth(sales) {
  const out = {};
  for (const x of sales) {
    if (x.platform && x.platform.toLowerCase() !== 'литнет') continue;
    if (!x.date) continue;
    const e = (out[monthKey(x.date)] ||= { gross: 0, royalty: 0, fee: 0 });
    e.gross += x.gross != null ? Number(x.gross) || 0 : (Number(x.price) || 0) * (Number(x.qty) || 0);
    e.royalty += Number(x.royalty) || 0;
  }
  for (const e of Object.values(out)) { e.gross = r2(e.gross); e.royalty = r2(e.royalty); e.fee = r2(e.gross - e.royalty); }
  return out;
}
export const litnetFeeByMonth = (sales) => Object.fromEntries(Object.entries(litnetMoneyByMonth(sales)).map(([k, v]) => [k, v.fee]));

// Использованный бюджет «Литнет платит» для порога и скидки: сколько рекламы открутилось в календарном месяце
// (расход в день × прошедшие дни кампаний; где есть отчёты таргетологов — их факт). Текущий месяц — прогноз на весь месяц.
export function litnetDiscountBase(spend, forecast, today) {
  const cur = monthKey(today), out = {};
  for (const [k, v] of Object.entries(spend)) if (k < cur && v.litnet) out[k] = v.litnet;
  const f = forecast?.month === cur ? forecast.litnet : 0;
  const now = f || spend[cur]?.litnet || 0;
  if (now) out[cur] = r2(now);
  return out;
}

// Предупреждение: расход в текущем месяце идёт ниже порога
export function litnetPace(spendSoFar, today, { threshold = 10000 } = {}, forecast = null) {
  const mk = monthKey(today);
  const dom = Number(today.slice(8, 10));
  const total = daysInMonth(mk);
  const left = total - dom;
  // прогноз: по плану кампаний (если известен), иначе по нынешнему темпу
  const projected = forecast != null ? r2(forecast) : r2((spendSoFar / dom) * total);
  const remaining = Math.max(0, r2(threshold - spendSoFar));
  return {
    month: mk, spendSoFar, threshold, projected, daysLeft: left,
    reached: spendSoFar >= threshold,
    onTrack: spendSoFar >= threshold || projected >= threshold,
    remaining,
    perDayNeeded: left > 0 ? r2(remaining / left) : remaining,
  };
}

// ---------- окупаемость кампании ----------
// Пересечения кампаний: [{id, name, from, to}] для каждой кампании
export function campaignOverlaps(c, campaigns) {
  if (!c.start) return [];
  const cEnd = c.end || '9999-12-31';
  return campaigns.filter((o) => o.id !== c.id && !o.oneOff && o.start && o.start <= cEnd && (o.end || '9999-12-31') >= c.start)
    .map((o) => ({ id: o.id, name: o.name, from: o.start > c.start ? o.start : c.start, to: (o.end || '9999-12-31') < cEnd ? (o.end || cEnd) : cEnd }));
}

// ctx: { sales, legacyDays, reports, campaigns, dataEnd, baseDays, today? }
export function campaignMetrics(c, ctx) {
  const dataEnd = ctx.dataEnd;
  if (!c.start || c.start > dataEnd) return { status: 'planned', overlaps: campaignOverlaps(c, ctx.campaigns || []) };
  const end = c.end && c.end < dataEnd ? c.end : dataEnd;
  const bookId = c.scope === 'all' ? null : c.bookId || null;
  // ctx.period {from, to} — считать только дни этого периода (например, календарного месяца); база — та же
  const pFrom = ctx.period && ctx.period.from > c.start ? ctx.period.from : c.start;
  const pTo = ctx.period && ctx.period.to < end ? ctx.period.to : end;
  if (pTo < pFrom) return { status: 'planned', overlaps: campaignOverlaps(c, ctx.campaigns || []) };
  const days = countDays(pFrom, pTo);
  const during = incomeSeries(ctx.sales, ctx.legacyDays, pFrom, pTo, bookId);
  const avgDuring = avgSeries(during, 'royalty', false);
  const qtyDuring = during.reduce((a, x) => a + x.qty, 0);
  const others = (ctx.campaigns || []).filter((o) => o.id !== c.id && o.start && !o.oneOff); // разовые расходы — не кампании
  const adOn = (d) => others.some((o) => d >= o.start && d <= (o.end || '9999-12-31'));

  // база для сравнения
  // Ручная (сумма или свой период) — только для «примерки» на экране. Авто: N последних чистых дней до старта
  // (по умолчанию 14, без дней любой другой рекламы, поиск до 60 дней назад); меньше 5 — предупреждение.
  let baseline = null, baseQty = null, baseFrom = null, baseTo = null, baseSource = 'auto', baseDaysUsed = 0;
  const baseNotes = [];
  const mode = c.baseMode || 'auto';
  let picked = [];
  if (mode === 'value' && c.baseValue != null && c.baseValue !== '') {
    baseline = Number(c.baseValue); baseSource = 'manual';
  } else if (mode === 'range' && c.baseFrom && c.baseTo) {
    baseSource = 'range';
    picked = incomeSeries(ctx.sales, ctx.legacyDays, c.baseFrom, c.baseTo, bookId).filter((x) => x.known);
    if (picked.some((x) => adOn(x.date))) baseNotes.push('overlap');
  } else {
    // N последних дней до старта, когда не шла никакая реклама; если рядом таких мало — ищем раньше (до 60 дней назад)
    const n = c.baseDays || ctx.baseDays || 14;
    picked = incomeSeries(ctx.sales, ctx.legacyDays, addDays(c.start, -60), addDays(c.start, -1), bookId)
      .filter((x) => x.known && !adOn(x.date)).slice(-n);
    if (picked.length < 5) baseNotes.push('few');
  }
  if (picked.length) {
    baseDaysUsed = picked.length;
    baseline = r2(picked.reduce((a, x) => a + x.royalty, 0) / picked.length);
    baseQty = picked.reduce((a, x) => a + x.qty, 0) / picked.length;
    baseFrom = picked.reduce((a, x) => (x.date < a ? x.date : a), picked[0].date);
    baseTo = picked.reduce((a, x) => (x.date > a ? x.date : a), picked[0].date);
  }

  // расход по дням (факт из отчётов, иначе бюджет ÷ дни)
  const cap = ctx.today || null; // отчёт с будущим концом обрезаем только по «сегодня»
  const mySpend = campaignDailySpend(c, ctx.reports, cap);
  const spendTotal = during.reduce((a, x) => a + (mySpend[x.date] || 0), 0);
  const spendPerDay = days ? spendTotal / days : 0;
  const myReps = ctx.reports.filter((r) => r.campaignId === c.id && r.start && r.end);
  const coveredDays = during.filter((x) => myReps.some((r) => x.date >= r.start && x.date <= r.end)).length;
  const spendSource = !coveredDays ? 'budget' : coveredDays === days ? 'reports' : 'mixed';

  // Прирост по дням. В дни пересечения с другими кампаниями прирост делится между ними
  // пропорционально расходу в день (поровну, если расход неизвестен) — доход дня не считается дважды.
  const overlaps = campaignOverlaps(c, others);
  const otherSpend = overlaps.length ? others.filter((o) => overlaps.some((x) => x.id === o.id)).map((o) => ({ o, sp: campaignDailySpend(o, ctx.reports, cap) })) : [];
  let upliftSum = 0, extraQtySum = 0, overlapDays = 0;
  for (const x of during) {
    let share = 1;
    const act = otherSpend.filter(({ o }) => x.date >= o.start && x.date <= (o.end || '9999-12-31'));
    if (act.length) {
      overlapDays++;
      const mine = mySpend[x.date] || 0;
      const tot = mine + act.reduce((a, { sp }) => a + (sp[x.date] || 0), 0);
      share = tot > 0 ? mine / tot : 1 / (act.length + 1);
    }
    if (baseline != null) upliftSum += (x.royalty - baseline) * share;
    if (baseQty != null) extraQtySum += (x.qty - baseQty) * share;
  }
  const uplift = baseline == null ? null : upliftSum / days;
  const payback = uplift == null ? null : uplift - spendPerDay;
  const extraQtyPerDay = baseQty == null ? null : extraQtySum / days;
  return {
    status: c.end && c.end < dataEnd ? 'finished' : 'active',
    from: pFrom, to: pTo, days, bookId,
    spendPerDay: r2(spendPerDay), spendTotal: r2(spendTotal), spendSource,
    avgDuring, baseline, baseFrom, baseTo, baseSource, baseDaysUsed, baseNotes,
    overlaps, overlapDays,
    uplift: uplift == null ? null : r2(uplift),
    payback: payback == null ? null : r2(payback),
    paybackTotal: payback == null ? null : r2(payback * days),
    threshold: baseline == null ? null : r2(baseline + spendPerDay), // доход/день, при котором реклама окупается
    qtyDuring,
    costPerSale: qtyDuring ? r2(spendTotal / qtyDuring) : null,
    costPerExtraSale: extraQtyPerDay && extraQtyPerDay > 0 ? r2(spendPerDay / extraQtyPerDay) : null,
    paysOff: payback == null ? null : payback >= 0,
  };
}

// CTR и CPC из недельных строк отчёта
export const ctr = (r) => (r.impressions ? r.clicks / r.impressions : null);
export const cpc = (r) => (r.clicks ? r.spend / r.clicks : null);

// ---------- Rocket, налоги, чистый доход ----------
// months[месяц] = { rocketIndex, rocketFee, litnetSpend?, extraAdSpend? }
// Финансы месяца продаж.
// Чистый = роялти + скидка «Литнет платит» − Rocket − использованный рекламный бюджет − налог. Ожидаемая выплата Литнета за месяц продаж = роялти Литнета − Rocket + скидка
// (подтверждённая, иначе ожидаемая). litnet: {месяц: {gross, royalty, fee}} — продажи Литнета (litnetMoneyByMonth).
export function monthFinance(key, { sales, legacyDays, spend, discounts, months = {}, settings = {}, litnet = null }) {
  const ser = incomeSeries(sales, legacyDays, monthStart(key), monthEnd(key));
  const royalty = sumSeries(ser);
  const gross = sumSeries(ser, 'gross');
  const m = months[key] || {};
  const rocketFee = Number(m.rocketFee) || 0;
  const sp = spend[key] || { litnet: 0, own: 0, other: 0 };
  const dsc = discounts[key];
  const discount = dsc?.applied || 0; // скидка «Литнет платит» — автоматически, по оферте
  const expectedDiscount = 0;
  const extra = Number(m.extraAdSpend) || 0;
  const ownSpend = r2(sp.own + sp.other + extra);
  const adSpend = r2(sp.litnet + ownSpend); // использованный рекламный бюджет за месяц
  const taxRate = (Number(settings.taxRate) || 0) / 100;
  const base = settings.taxBase === 'royalty' ? royalty : gross; // по умолчанию — от полной цены книг
  const tax = r2(base * taxRate);
  const net = r2(royalty + discount - rocketFee - adSpend - tax);
  const lm = litnet ? litnet[key] || { gross: 0, royalty: 0, fee: 0 } : { gross, royalty, fee: r2(gross - royalty) };
  const payDisc = dsc ? dsc.discount : 0;
  const payoutExpected = r2(lm.royalty - rocketFee + payDisc);
  const payoutActual = m.payoutActual != null && m.payoutActual !== '' ? Number(m.payoutActual) : null;
  return {
    month: key, royalty, gross, rocketIndex: m.rocketIndex ?? null, rocketFee,
    afterRocket: r2(royalty - rocketFee),
    litnetFee: lm.fee, litnetRoyalty: lm.royalty,
    litnetSpend: sp.litnet, litnetDiscount: discount, expectedDiscount, ownSpend,
    adSpend, adCost: r2(adSpend - discount), taxBase: r2(base), tax,
    net, netExpected: r2(net + expectedDiscount),
    payoutExpected, payoutDiscountExpected: !!dsc && dsc.status !== 'confirmed' && payDisc > 0,
    payoutActual, payoutDiff: payoutActual == null ? null : r2(payoutActual - payoutExpected),
  };
}

// «Деньги на руках» за календарный месяц (кассовый взгляд): выплата Литнета, пришедшая в этом месяце
// (за продажи прошлого месяца: фактическая, если введена, иначе ожидаемая) − оплачено за рекламу в этом месяце
// (оплаты «Литнет платит» + своя реклама и другие расходы) − налог, уплаченный в этом месяце (за прошлый месяц).
// firstMonth — первый месяц с данными продаж: раньше него выплата неизвестна (received = null), если не введена вручную.
export function monthCash(key, finOf, { payments = {}, spend = {}, months = {}, firstMonth = null } = {}) {
  const pk = addMonths(key, -1);
  const prev = finOf(pk);
  const unknown = prev.payoutActual == null && firstMonth && pk < firstMonth;
  const received = unknown ? null : prev.payoutActual != null ? prev.payoutActual : prev.payoutExpected;
  const sp = spend[key] || { litnet: 0, own: 0, other: 0 };
  const paidAds = r2((payments[key] || 0) + sp.own + sp.other + (Number(months[key]?.extraAdSpend) || 0));
  const taxPaid = prev.tax;
  return { month: key, received: received == null ? null : r2(received), receivedEstimated: prev.payoutActual == null, paidAds, taxPaid, cash: received == null ? null : r2(received - paidAds - taxPaid) };
}

// ---------- цели ----------
export function buildPlan({ startMonth = '2026-10', startAmount = 50000, growth = 0.12, count = 13, overrides = {} } = {}) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const key = addMonths(startMonth, i);
    const auto = Math.round(startAmount * (1 + growth) ** i);
    out.push({ month: key, auto, plan: overrides[key] != null && overrides[key] !== '' ? Number(overrides[key]) : auto });
  }
  return out;
}
export function rollingAverage(values, n = 3) {
  return values.map((v, i) => {
    if (v == null) return null;
    const win = values.slice(Math.max(0, i - n + 1), i + 1).filter((x) => x != null);
    return win.length < n ? null : win.reduce((a, b) => a + b, 0) / n;
  });
}
// planRows: план + факт по месяцам (royalty из incomeSeries), скользящее среднее за 3 месяца
export function goalRows(plan, factByMonth, currentMonth) {
  const facts = plan.map((p) => (p.month <= currentMonth ? factByMonth[p.month] ?? 0 : null));
  const ra = rollingAverage(facts, 3);
  return plan.map((p, i) => ({
    ...p, fact: facts[i], ma3: ra[i],
    diff: facts[i] == null ? null : r2(facts[i] - p.plan),
    done: facts[i] == null ? null : p.plan ? facts[i] / p.plan : null,
    partial: p.month === currentMonth,
  }));
}

// ---------- сравнение импорта с тем, что уже есть ----------
export function diffSales(existing, incoming, replacePeriod = true) {
  const ex = new Map(existing.map((s) => [s.id, s]));
  const inIds = new Set(incoming.map((s) => s.id));
  let added = 0, changed = 0, same = 0;
  for (const s of incoming) {
    const e = ex.get(s.id);
    if (!e) added++;
    else if (e.qty !== s.qty || Math.abs(e.royalty - s.royalty) > 0.004) changed++;
    else same++;
  }
  let removeIds = [];
  if (replacePeriod && incoming.length) {
    const from = incoming.reduce((a, s) => (s.date < a ? s.date : a), incoming[0].date);
    const to = incoming.reduce((a, s) => (s.date > a ? s.date : a), incoming[0].date);
    // выгрузка Литнета заменяет только строки Литнета; продажи с других площадок не трогаем
    removeIds = existing.filter((s) => s.date >= from && s.date <= to && !inIds.has(s.id) && (!s.platform || s.platform.toLowerCase() === 'литнет')).map((s) => s.id);
  }
  return { added, changed, same, removeIds };
}

// Ручной результат дня (пока нет выгрузки Литнета). Полная цена восстанавливается из роялти 70 %.
// Когда загрузите выгрузку за этот период, ручные строки заменятся точными (галочка «убрать старые строки»).
// platform — площадка (Литнет, Литмаркет…); gross — сколько заплатили читатели (если не указано — роялти ÷ 70 %)
export function manualSaleRow({ date, book, bookId, kind, qty, royalty, gross = null, platform = 'Литнет' }) {
  const q = Math.max(1, Number(qty) || 1);
  const pl = (platform || 'Литнет').trim();
  const other = pl.toLowerCase() !== 'литнет';
  return {
    id: `${date}_${hashStr(book.trim().toLowerCase())}_m${kind === 'sub' ? 'p' : 's'}${other ? '_' + hashStr(pl.toLowerCase()) : ''}`,
    date, book, bookId: bookId || bookIdFor(book), kind: kind === 'sub' ? 'sub' : 'sale',
    price: r2((gross != null && gross !== '' ? Number(gross) : royalty / 0.7) / q), qty: Number(qty) || 0, royalty: r2(royalty), manual: true, platform: pl,
  };
}

// Цель текущего месяца: сколько сделано, прогноз, сколько нужно в день до конца месяца
export function monthGoalStatus(planAmount, fact, dataEnd) {
  const mk = monthKey(dataEnd), dim = daysInMonth(mk), dom = Number(dataEnd.slice(8, 10));
  const left = dim - dom;
  const forecast = dom ? r2((fact / dom) * dim) : 0;
  return {
    month: mk, plan: planAmount, fact, share: planAmount ? fact / planAmount : null,
    forecast, daysLeft: left, reached: fact >= planAmount, onTrack: forecast >= planAmount,
    needPerDay: left > 0 ? r2(Math.max(0, planAmount - fact) / left) : Math.max(0, r2(planAmount - fact)),
  };
}

// Налог по месяцам: сколько, с какой суммы, оплачен ли. unpaid — сумма неоплаченного за закончившиеся месяцы.
export function taxRows(keys, finOf, monthsMap, dataEnd) {
  const rows = keys.map((k) => {
    const f = finOf(k), m = monthsMap[k] || {};
    return { month: k, base: f.taxBase, tax: f.tax, paid: !!m.taxPaid, paidAt: m.taxPaidAt || '', closed: monthEnd(k) <= dataEnd };
  });
  return { rows, unpaid: r2(rows.filter((x) => x.closed && !x.paid).reduce((a, x) => a + x.tax, 0)), unpaidMonths: rows.filter((x) => x.closed && !x.paid && x.tax > 0).map((x) => x.month) };
}

// НПД (самозанятые): налог за месяц надо оплатить до 28-го числа следующего месяца
export const npdDeadline = (key) => `${addMonths(key, 1)}-28`;

// Rocket по месяцам. Комиссию списывают до 20-го числа следующего месяца, поэтому вносим за закончившиеся месяцы.
// ≈ продаж через Rocket = комиссия ÷ индекс; доля — сколько роялти съела комиссия.
export function rocketRows(keys, finOf, monthsMap, today) {
  const rows = keys.map((k) => {
    const f = finOf(k), m = monthsMap[k] || {};
    const fee = m.rocketFee != null && m.rocketFee !== '' ? Number(m.rocketFee) : null;
    const index = m.rocketIndex != null && m.rocketIndex !== '' ? Number(m.rocketIndex) : null;
    return {
      month: k, royalty: f.royalty, qty: f.qty ?? null, fee, index,
      sales: fee != null && index ? Math.round(fee / index) : null,
      share: fee != null && f.royalty ? fee / f.royalty : null,
      closed: monthEnd(k) < today, chargeBy: `${addMonths(k, 1)}-20`,
    };
  });
  return { rows, missing: rows.filter((x) => x.closed && x.fee == null && x.royalty > 0).map((x) => x.month) };
}

// Сигнал «таргет ухудшился»: по книге кампании за последние 7 дней доход упал на 25 %+ к предыдущим дням кампании
// или опустился ниже порога окупаемости. Если отчёт таргетологов добавлен за последние 7 дней — сигнал «отложен».
export function targetAlert(c, ctx, notes = []) {
  const m = campaignMetrics(c, ctx);
  if (m.status !== 'active' || m.days < 10) return null;
  const end = m.to;
  const lastFrom = addDays(end, -6);
  const prevFrom = addDays(end, -13) > c.start ? addDays(end, -13) : c.start;
  const prevTo = addDays(end, -7);
  const avg = (from, to) => { const s = incomeSeries(ctx.sales, ctx.legacyDays, from, to, m.bookId); return s.length ? s.reduce((a, x) => a + x.royalty, 0) / s.length : null; };
  const last7 = avg(lastFrom, end);
  const prev = countDays(prevFrom, prevTo) >= 3 ? avg(prevFrom, prevTo) : null;
  const drop = prev ? 1 - last7 / prev : null;
  const reasons = [];
  if (drop != null && drop >= 0.25) reasons.push('drop');
  if (m.threshold != null && last7 < m.threshold) reasons.push('below');
  if (!reasons.length) return null;
  const recent = notes.filter((n) => n.campaignId === c.id && n.date >= lastFrom).length > 0;
  return { campaignId: c.id, name: c.name, last7: r2(last7), prev: prev == null ? null : r2(prev), drop, threshold: m.threshold, spendPerDay: m.spendPerDay, reasons, snoozed: recent, from: lastFrom, to: end };
}

// Подписки в дни выкладки глав и в остальные дни — по каждой книге (только дни с данными)
export function chapterEffect(sales, days, books, from, to) {
  return books.map((b) => {
    const ser = incomeSeries(sales, [], from, to, b.id).filter((x) => x.known);
    const ch = new Set(days.filter((d) => d.date >= from && d.date <= to && (d.events || []).some((e) => e.type === 'chapter' && e.bookId === b.id)).map((d) => d.date));
    const on = ser.filter((x) => ch.has(x.date)), off = ser.filter((x) => !ch.has(x.date));
    const avg = (a) => (a.length ? a.reduce((s, x) => s + x.subQty, 0) / a.length : null);
    return { bookId: b.id, title: b.title, chapterDays: on.length, otherDays: off.length, subsOn: avg(on), subsOff: avg(off) };
  });
}

// «Литнет платит»: оплата таргетологам — бюджет кампании, вносится разом (дата оплаты, по умолчанию — старт).
// Скидка считается от оплат календарного месяца; меньше 10 000 ₽ программа не берёт, так что порог выполняется оплатой.
export function litnetPaymentsByMonth(campaigns) {
  const out = {};
  for (const c of campaigns) {
    if (c.channel !== 'litnet' || !c.budget) continue;
    const d = c.paidAt || c.start;
    if (!d) continue;
    const k = monthKey(d);
    out[k] = r2((out[k] || 0) + Number(c.budget));
  }
  return out;
}

// Сводка по кампании «как идёт таргет»: бюджет израсходован на X %, реклама вернула Y % потраченного
export function campaignProgress(c, m, today) {
  const total = c.start && c.end ? countDays(c.start, c.end) : null;
  const elapsedEnd = c.end && c.end < today ? c.end : today;
  const elapsed = c.start && c.start <= today ? countDays(c.start, elapsedEnd) : 0;
  const budget = Number(c.budget) || null;
  const spentToDate = budget && total ? r2(budget / total * elapsed) : (m.spendTotal ?? null);
  const returned = m.uplift == null ? null : r2(m.uplift * m.days); // доход сверх базы, приписанный кампании
  return {
    day: elapsed, total, daysLeft: total ? Math.max(0, total - elapsed) : null,
    budget, spentToDate, left: budget && spentToDate != null ? r2(budget - spentToDate) : null,
    spentShare: budget && spentToDate != null ? spentToDate / budget : null,
    returned, returnShare: returned != null && m.spendTotal ? returned / m.spendTotal : null,
  };
}

// Сводка по группе рекламы (вся платная / таргет Литнета / мой таргет)
// ctx — как для campaignMetrics, плюс today. Разовые расходы (oneOff) входят только в «потрачено».
export function adGroupSummary(camps, ctx) {
  const today = ctx.today || ctx.dataEnd;
  const r = { live: 0, perDaySpend: 0, perDayUplift: null, perDayPayback: null, returned: null, spent: 0, returnShare: null, paid: 0, plannedSpent: 0, budgetShare: null };
  let up = 0, hasUp = false, ret = 0, hasRet = false, spentWithData = 0;
  for (const k of camps) {
    if (!k.start || k.start > today) continue;
    const per = ctx.period;
    if (per && (k.start > per.to || (k.end && k.end < per.from))) continue;
    if (k.oneOff) { r.spent += Number(k.budget) || 0; continue; }
    const m = campaignMetrics(k, ctx);
    const noData = m.status === 'planned'; // уже идёт по датам, но выгрузки за эти дни ещё нет
    if (!noData) {
      r.spent += m.spendTotal;
      if (m.uplift != null) { ret += m.uplift * m.days; hasRet = true; spentWithData += m.spendTotal; }
    }
    const live = (!k.end || k.end >= today) && (!per || per.to >= today);
    if (live) {
      r.live++;
      r.perDaySpend += noData ? budgetPerDay(k) : m.spendPerDay;
      if (!noData && m.uplift != null) { up += m.uplift; hasUp = true; }
      const p = campaignProgress(k, noData ? { uplift: null, days: 0, spendTotal: 0 } : m, today);
      if (p.budget) { r.paid += p.budget; r.plannedSpent += p.spentToDate; }
    }
  }
  if (hasUp) { r.perDayUplift = r2(up); r.perDayPayback = r2(up - r.perDaySpend); }
  if (hasRet) { r.returned = r2(ret); r.returnShare = spentWithData ? ret / spentWithData : null; }
  r.perDaySpend = r2(r.perDaySpend); r.spent = r2(r.spent); r.paid = r2(r.paid); r.plannedSpent = r2(r.plannedSpent);
  r.budgetShare = r.paid ? r.plannedSpent / r.paid : null;
  return r;
}

// Аналитика дня: доход против среднего за 7 предыдущих дней и против того же дня неделю назад
export function dayStats(sales, legacyDays, date) {
  const day = incomeSeries(sales, legacyDays, date, date)[0];
  const prev7 = incomeSeries(sales, legacyDays, addDays(date, -7), addDays(date, -1)).filter((x) => x.known);
  const avg7 = prev7.length ? r2(prev7.reduce((a, x) => a + x.royalty, 0) / prev7.length) : null;
  const wk = incomeSeries(sales, legacyDays, addDays(date, -7), addDays(date, -7))[0];
  return {
    ...day, avg7, weekAgo: wk.known ? wk.royalty : null,
    vsAvg: avg7 ? day.royalty / avg7 - 1 : null,
    vsWeek: wk.known && wk.royalty ? day.royalty / wk.royalty - 1 : null,
  };
}
