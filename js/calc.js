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
function spread(map, start, end, amount, cap) {
  let e = end;
  if (cap && e > cap && cap >= start) e = cap;
  const n = countDays(start, e);
  if (n <= 0 || !amount) return;
  const per = amount / n;
  for (const d of eachDay(start, e)) { const k = monthKey(d); map[k] = (map[k] || 0) + per; }
}

// Расход одной кампании по календарным месяцам. Недельный отчёт, конец которого ещё в будущем,
// растягивается только до cap (обычно «сегодня»): выгрузка не может содержать будущих дней.
export function campaignSpendByMonth(c, reports, cap = null) {
  const out = {};
  const rs = reports.filter((r) => r.campaignId === c.id);
  if (rs.length) for (const r of rs) spread(out, r.start, r.end, r.spend, cap);
  else if (c.budget && c.start && c.end) spread(out, c.start, c.end, c.budget, null);
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}

// Расход по месяцам и каналам: {месяц: {litnet, own, other}}.
// Для «Литнет платит» ручной ввод в months[месяц].litnetSpend перекрывает расчёт по отчётам.
export function spendByMonthChannel(campaigns, reports, months = {}, cap = null) {
  const out = {};
  for (const c of campaigns) {
    const ch = c.channel === 'litnet' ? 'litnet' : c.channel === 'own' ? 'own' : 'other';
    const sp = campaignSpendByMonth(c, reports, cap);
    for (const [k, v] of Object.entries(sp)) { const e = (out[k] ||= { litnet: 0, own: 0, other: 0 }); e[ch] += v; }
  }
  for (const [k, m] of Object.entries(months)) {
    if (m && m.litnetSpend !== undefined && m.litnetSpend !== null && m.litnetSpend !== '') {
      (out[k] ||= { litnet: 0, own: 0, other: 0 }).litnet = Number(m.litnetSpend);
    }
  }
  for (const e of Object.values(out)) { e.litnet = r2(e.litnet); e.own = r2(e.own); e.other = r2(e.other); }
  return out;
}

// ---------- скидка «Литнет платит» ----------
// скидка(м) = (расход(м) − скидка(м−1)) × pct, только если расход(м) ≥ порога
export function litnetDiscounts(litnetSpend, { threshold = 10000, pct = 0.2 } = {}) {
  const keys = Object.keys(litnetSpend).sort();
  const out = {};
  if (!keys.length) return out;
  for (const k of monthsBetween(keys[0], keys[keys.length - 1])) {
    const spend = litnetSpend[k] || 0;
    const prev = out[addMonths(k, -1)]?.discount || 0;
    const ok = spend >= threshold;
    const discount = ok ? r2(Math.max(0, (spend - prev) * pct)) : 0;
    out[k] = { month: k, spend, prevDiscount: prev, qualified: ok, discount, effective: r2(spend - discount) };
  }
  return out;
}

// Предупреждение: расход в текущем месяце идёт ниже порога
export function litnetPace(spendSoFar, today, { threshold = 10000 } = {}) {
  const mk = monthKey(today);
  const dom = Number(today.slice(8, 10));
  const total = daysInMonth(mk);
  const left = total - dom;
  const projected = r2((spendSoFar / dom) * total);
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
// ctx: { sales, legacyDays, reports, dataEnd, baseDays }
export function campaignMetrics(c, ctx) {
  const dataEnd = ctx.dataEnd;
  if (!c.start || c.start > dataEnd) return { status: 'planned' };
  const end = c.end && c.end < dataEnd ? c.end : dataEnd;
  const days = countDays(c.start, end);
  const bookId = c.scope === 'all' ? null : c.bookId || null;
  const during = incomeSeries(ctx.sales, ctx.legacyDays, c.start, end, bookId);
  const avgDuring = avgSeries(during, 'royalty', false);
  const qtyDuring = during.reduce((a, x) => a + x.qty, 0);

  // база для сравнения
  // Авто: последние N дней с данными до старта, в которые НЕ шла другая реклама этой книги
  // (или реклама «всех книг»). Иначе реклама сравнивалась бы с рекламой.
  let baseline = null, baseQty = null, baseFrom = null, baseTo = null, baseSource = 'auto', baseDaysUsed = 0;
  const baseNotes = [];
  const others = (ctx.campaigns || []).filter((o) => o.id !== c.id && o.start && o.start < c.start
    && (!bookId || !o.bookId || o.scope === 'all' || o.bookId === bookId));
  const adOn = (d) => others.some((o) => d >= o.start && d <= (o.end || '9999-12-31'));
  const mode = c.baseMode || 'auto';
  let picked = [];
  if (mode === 'value' && c.baseValue != null && c.baseValue !== '') {
    baseline = Number(c.baseValue); baseSource = 'manual';
  } else if (mode === 'range' && c.baseFrom && c.baseTo) {
    baseSource = 'range';
    picked = incomeSeries(ctx.sales, ctx.legacyDays, c.baseFrom, c.baseTo, bookId).filter((x) => x.known);
    if (picked.some((x) => adOn(x.date))) baseNotes.push('overlap');
  } else {
    const n = c.baseDays || ctx.baseDays || 14;
    const back = incomeSeries(ctx.sales, ctx.legacyDays, addDays(c.start, -120), addDays(c.start, -1), bookId).filter((x) => x.known).reverse();
    picked = back.filter((x) => !adOn(x.date)).slice(0, n);
    if (picked.length < Math.min(n, 3) && back.length) { picked = back.slice(0, n); baseNotes.push('overlap'); }
  }
  if (picked.length) {
    baseDaysUsed = picked.length;
    baseline = r2(picked.reduce((a, x) => a + x.royalty, 0) / picked.length);
    baseQty = picked.reduce((a, x) => a + x.qty, 0) / picked.length;
    baseFrom = picked.reduce((a, x) => (x.date < a ? x.date : a), picked[0].date);
    baseTo = picked.reduce((a, x) => (x.date > a ? x.date : a), picked[0].date);
    if (picked.length < 7) baseNotes.push('few');
  }

  // расход
  const rs = ctx.reports.filter((r) => r.campaignId === c.id);
  let spendTotal = 0, spendPerDay = 0, spendSource = 'budget';
  if (rs.length) {
    let cover = 0;
    for (const r of rs) {
      const a = r.start > c.start ? r.start : c.start;
      const b = r.end < end ? r.end : end;
      const n = countDays(a, b);
      if (n <= 0) continue;
      spendTotal += r.spend * (n / countDays(r.start, r.end));
      cover += n;
    }
    spendPerDay = cover ? spendTotal / cover : 0;
    spendTotal = spendPerDay * days; // период без отчётов оцениваем по среднему
    spendSource = 'reports';
  } else {
    const planned = c.end ? countDays(c.start, c.end) : days;
    spendPerDay = c.budget && planned ? c.budget / planned : 0;
    spendTotal = spendPerDay * days;
  }

  const uplift = baseline == null ? null : avgDuring - baseline;
  const payback = uplift == null ? null : uplift - spendPerDay;
  const extraQtyPerDay = baseQty == null ? null : qtyDuring / days - baseQty;
  return {
    status: c.end && c.end < dataEnd ? 'finished' : 'active',
    from: c.start, to: end, days, bookId,
    spendPerDay: r2(spendPerDay), spendTotal: r2(spendTotal), spendSource,
    avgDuring, baseline, baseFrom, baseTo, baseSource, baseDaysUsed, baseNotes,
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
export function monthFinance(key, { sales, legacyDays, spend, discounts, months = {}, settings = {} }) {
  const ser = incomeSeries(sales, legacyDays, monthStart(key), monthEnd(key));
  const royalty = sumSeries(ser);
  const gross = sumSeries(ser, 'gross');
  const m = months[key] || {};
  const rocketFee = Number(m.rocketFee) || 0;
  const sp = spend[key] || { litnet: 0, own: 0, other: 0 };
  const discount = discounts[key]?.discount || 0;
  const extra = Number(m.extraAdSpend) || 0;
  const adCost = r2(sp.litnet - discount + sp.own + sp.other + extra);
  const taxRate = (Number(settings.taxRate) || 0) / 100;
  const base = settings.taxBase === 'royalty' ? royalty : gross; // по умолчанию — от полной цены книг
  const tax = r2(base * taxRate);
  return {
    month: key, royalty, gross, rocketIndex: m.rocketIndex ?? null, rocketFee,
    afterRocket: r2(royalty - rocketFee),
    litnetSpend: sp.litnet, litnetDiscount: discount, ownSpend: r2(sp.own + sp.other + extra),
    adCost, taxBase: r2(base), tax,
    net: r2(royalty - rocketFee - adCost - tax),
  };
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
    removeIds = existing.filter((s) => s.date >= from && s.date <= to && !inIds.has(s.id)).map((s) => s.id);
  }
  return { added, changed, same, removeIds };
}

// Ручной результат дня (пока нет выгрузки Литнета). Полная цена восстанавливается из роялти 70 %.
// Когда загрузите выгрузку за этот период, ручные строки заменятся точными (галочка «убрать старые строки»).
export function manualSaleRow({ date, book, bookId, kind, qty, royalty }) {
  const q = Math.max(1, Number(qty) || 1);
  return {
    id: `${date}_${hashStr(book.trim().toLowerCase())}_m${kind === 'sub' ? 'p' : 's'}`,
    date, book, bookId: bookId || bookIdFor(book), kind: kind === 'sub' ? 'sub' : 'sale',
    price: r2(royalty / 0.7 / q), qty: Number(qty) || 0, royalty: r2(royalty), manual: true,
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
