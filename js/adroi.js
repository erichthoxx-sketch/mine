// Окупаемость рекламы из «Доходов» для всех трёх приложений: вывод «продлевать или нет»,
// ссылка Литнета с меткой, которая принадлежит кампании, и когда пора попросить у таргетолога отчёт о расходе.
// Чистые функции: расчёт дохода — тот же campaignMetrics, что в «Доходах», здесь только сведение и выводы.
import { campaignMetrics, campaignProgress, outageSet, lastSaleDate, addDays, countDays } from './calc.js';
import { financialLedger } from './sales-integrity.js';
import { promoChannel, linkCode } from '../writer/js/promolinks.js';

// Контекст расчёта как в «Доходах» (js/app.js getCtx), из сырых данных Firebase
export function adCtx(data = {}, settings = {}, today) {
  const sales = financialLedger(data.sales || []).sales;
  const litnet = sales.filter((s) => !s.platform || String(s.platform).toLowerCase() === 'литнет');
  const last = lastSaleDate(litnet.length ? litnet : sales);
  return {
    sales, legacyDays: (data.days || []).filter((x) => x.income != null), days: data.days || [],
    reports: data.reports || [], campaigns: data.campaigns || [], outages: outageSet(data.days || []),
    dataEnd: last && last < today ? last : today, baseDays: settings.baseDays, today,
  };
}

// Название без звёздочек и знаков — для сравнения «Альпийский развод» и «Альпийский развод. Он оставил меня умирать»
const norm = (s) => String(s || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
export const titleMatch = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 8 && (x.startsWith(y + ' ') || y.startsWith(x + ' ')))); };

// Книга кампании: выбранная в «Доходах», а если не выбрана — по названию кампании («Альпийский развод. Он…» → книга)
export function campaignBook(c, books = []) {
  if (c.bookId) return { book: books.find((b) => b.id === c.bookId) || null, guessed: false };
  const name = norm(c.name);
  const hit = books.filter((b) => { const t = norm(b.title); return t && (name === t || name.startsWith(t + ' ') || t.startsWith(name + ' ') || (t.length >= 8 && name.includes(t))); });
  return { book: hit.length === 1 ? hit[0] : null, guessed: hit.length === 1 };
}

// Ссылка Литнета (w_promolinks) этой кампании: выбранная вручную (c.promoId), иначе своя книга + «Литнет платит» + даты
export function campaignLink(c, links = [], wbooks = [], books = []) {
  if (c.promoId) return links.find((x) => x.id === c.promoId) || null;
  const { book } = campaignBook(c, books);
  if (!book) return null;
  const wb = wbooks.filter((w) => titleMatch(w.title, book.title)).map((w) => w.id);
  const end = c.end || '9999-12-31';
  const cand = links.filter((x) => x.status !== 'archived' && linkCode(x) && wb.includes(x.bookId)
    && (c.channel === 'litnet' ? promoChannel(x) === 'litnet' : promoChannel(x) !== 'litnet')
    && (!x.createdAt || x.createdAt.slice(0, 10) <= end) && (!x.expires || x.expires >= c.start));
  if (cand.length < 2) return cand[0] || null;
  // несколько: созданная ближе всего к старту кампании
  return cand.slice().sort((a, b) => Math.abs(countDays((a.createdAt || c.start).slice(0, 10), c.start)) - Math.abs(countDays((b.createdAt || c.start).slice(0, 10), c.start)))[0];
}

// Вывод по кампании. m — campaignMetrics, p — campaignProgress. Только по данным; мало данных — честно «ждём»
export const MIN_DAYS = 7;
export function campaignVerdict(m, p) {
  if (!m || m.status === 'planned') return { kind: 'wait', text: 'ещё не началась или нет выгрузки за эти дни' };
  const est = m.spendSource !== 'reports';
  if (m.days < MIN_DAYS) return { kind: 'wait', est, text: `идёт ${m.days} дн. — выводы после ${MIN_DAYS}-го дня` };
  if (m.baseline == null) return { kind: 'wait', est, text: 'не с чем сравнить: нет дней без рекламы до старта' };
  const share = p?.returnShare;
  if (share == null) return { kind: 'wait', est, text: 'расход пока нулевой' };
  const per = `на 1 ₽ рекламы — ${share.toFixed(2).replace('.', ',')} ₽ дохода`;
  if (share >= 1.2) return { kind: 'good', est, share, text: `окупается: ${per}`, todo: m.status === 'finished' ? 'стоит повторить' : 'можно продлить или добавить бюджет' };
  if (share >= 0.9) return { kind: 'even', est, share, text: `примерно в ноль: ${per}`, todo: 'продлевать — только с новой ссылкой, текстом или аудиторией' };
  return { kind: 'bad', est, share, text: `не окупается: ${per}`, todo: m.status === 'finished' ? 'в таком виде не повторять' : 'урезать бюджет или сменить подход' };
}

// Сводка по всем кампаниям «Доходов»: идут сейчас и закончившиеся за последние days дней
export function adBoard(data = {}, settings = {}, today, { days = 30 } = {}) {
  const ctx = adCtx(data, settings, today), books = data.books || [];
  const from = addDays(today, -days);
  return (data.campaigns || []).filter((k) => !k.oneOff && k.start && k.start <= today && (!k.end || k.end >= from))
    .map((k) => {
      const m = campaignMetrics(k, ctx), p = campaignProgress(k, m.status === 'planned' ? { uplift: null, days: 0, spendTotal: 0 } : m, today);
      const { book, guessed } = campaignBook(k, books);
      return { c: k, m, p, v: campaignVerdict(m, p), book, guessed, link: campaignLink(k, data.w_promolinks || [], data.w_books || [], books),
        live: !k.end || k.end >= today, reportDue: reportDue(k, ctx.reports, today) };
    }).sort((a, b) => (b.live - a.live) || String(b.c.start).localeCompare(String(a.c.start)));
}

// Пора попросить отчёт: кампания идёт 7+ дней, а последние 7 дней не закрыты отчётом о расходе
export function reportDue(c, reports = [], today) {
  if (c.oneOff || !c.start || c.start > addDays(today, -7)) return false;
  const lastDay = c.end && c.end < today ? c.end : addDays(today, -1);
  if (lastDay < c.start) return false;
  const covered = reports.filter((r) => r.campaignId === c.id && r.end).reduce((a, r) => (r.end > a ? r.end : a), '');
  if (c.end && c.end < addDays(today, -14)) return false; // давно закончилась — не напоминаем
  return !covered || covered < addDays(lastDay, -6);
}

// Расход на ссылку за последние 90 дней — сумма расходов кампаний, у которых эта ссылка (факт из отчётов или оценка)
export function linkSpend(linkId, data = {}, settings = {}, today) {
  const ctx = adCtx(data, settings, today), books = data.books || [];
  const period = { from: addDays(today, -89), to: today };
  let cost = 0, est = false;
  const names = [];
  for (const k of data.campaigns || []) {
    if (k.oneOff || !k.start) continue;
    const l = campaignLink(k, data.w_promolinks || [], data.w_books || [], books);
    if (!l || l.id !== linkId) continue;
    const m = campaignMetrics(k, { ...ctx, period });
    if (m.status === 'planned') continue;
    cost += m.spendTotal; est = est || m.spendSource !== 'reports'; names.push(k.name);
  }
  return { cost: Math.round(cost), est, names };
}

// ---------- Сравнение каналов за 90 дней: где читатель и покупка дешевле ----------
// refs — {код ссылки Литнета: {visits, conv}} (Метрика), direct — {cost, clicks, conv} Яндекс Директа за те же дни,
// perSale — доход с одной покупки (для Директа: окупаемость = покупки × доход ÷ расход).
export const CHANNEL_NAMES = { litnet: 'Литнет платит', own: 'Мой таргет', other: 'Другое', direct: 'Яндекс Директ', social: 'Соцсети' };
export function channelCompare(data = {}, settings = {}, today, { refs = {}, direct = null, perSale = null, days = 90 } = {}) {
  const ctx = adCtx(data, settings, today), books = data.books || [], links = data.w_promolinks || [];
  const period = { from: addDays(today, -(days - 1)), to: today };
  const rows = {};
  const row = (key) => (rows[key] ||= { key, name: CHANNEL_NAMES[key] || key, spend: 0, est: false, returned: 0, hasRet: false, readers: 0, buys: 0, hasReaders: false, camps: 0, codes: new Set() });
  const addLink = (r, l) => { const code = l && linkCode(l); if (!code || r.codes.has(code.toLowerCase())) return; r.codes.add(code.toLowerCase()); const x = refs[code.toLowerCase()]; if (x) { r.readers += x.visits; r.buys += x.conv; r.hasReaders = true; } };
  for (const k of data.campaigns || []) {
    if (k.oneOff || !k.start || k.start > today || (k.end && k.end < period.from)) continue;
    const m = campaignMetrics(k, { ...ctx, period });
    if (m.status === 'planned') continue;
    const r = row(k.channel || 'other');
    r.camps++; r.spend += m.spendTotal; r.est = r.est || m.spendSource !== 'reports';
    if (m.uplift != null) { r.returned += m.uplift * m.days; r.hasRet = true; }
    addLink(r, campaignLink(k, links, data.w_books || [], books));
  }
  // соцсети без оплаченных кампаний: только читатели по ссылкам
  for (const l of links) if (l.status !== 'archived' && promoChannel(l) === 'social') addLink(row('social'), l);
  if (direct && (direct.cost > 0 || direct.clicks > 0)) {
    const r = row('direct');
    r.spend = direct.cost; r.readers = direct.clicks; r.buys = direct.conv || 0; r.hasReaders = true; r.clicksAsReaders = true;
    if (perSale != null && direct.conv != null) { r.returned = direct.conv * perSale; r.hasRet = true; r.retByBuys = true; }
  }
  return Object.values(rows).filter((r) => r.spend > 0 || r.readers > 0).map((r) => ({
    key: r.key, name: r.name, spend: Math.round(r.spend), est: r.est, camps: r.camps,
    readers: r.hasReaders ? r.readers : null, buys: r.hasReaders ? r.buys : null, clicksAsReaders: !!r.clicksAsReaders,
    perReader: r.hasReaders && r.readers && r.spend ? r.spend / r.readers : null,
    perBuy: r.hasReaders && r.buys && r.spend ? r.spend / r.buys : null,
    ret: r.hasRet && r.spend ? r.returned / r.spend : null, retByBuys: !!r.retByBuys,
  })).sort((a, b) => b.spend - a.spend);
}
// Вывод по сравнению — только когда у двух каналов достаточно данных (30+ читателей и расход)
export function channelVerdict(rows = []) {
  // главное — сколько возвращает рубль; где этого нет — цена читателя
  const fmt = (x) => x.toFixed(2).replace('.', ',');
  const wr = rows.filter((r) => r.spend > 0 && r.ret != null).sort((a, b) => b.ret - a.ret);
  if (wr.length >= 2) {
    const best = wr[0], worst = wr[wr.length - 1];
    if (best.ret < worst.ret * 1.3 && best.ret - worst.ret < 0.3) return { best: best.key, text: `Каналы возвращают рубль примерно одинаково (${fmt(worst.ret)}–${fmt(best.ret)} ₽).` };
    return { best: best.key, text: `Рубль лучше всего работает в «${best.name}»: на 1 ₽ — ${fmt(best.ret)} ₽, в «${worst.name}» — ${fmt(worst.ret)} ₽. ${best.ret >= 1.2 ? 'Туда и стоит переносить бюджет.' : 'Но окупается пока ни один — сначала менять подход, а не добавлять деньги.'}` };
  }
  const ok = rows.filter((r) => r.spend > 0 && r.readers >= 30 && r.perReader != null);
  if (ok.length < 2) return null;
  const s = ok.slice().sort((a, b) => a.perReader - b.perReader), best = s[0], worst = s[s.length - 1];
  if (worst.perReader < best.perReader * 1.3) return { text: 'Читатель обходится примерно одинаково во всех каналах — решает окупаемость, а не цена читателя.' };
  return { best: best.key, text: `Читатель дешевле всего в «${best.name}»: ${Math.round(best.perReader)} ₽ против ${Math.round(worst.perReader)} ₽ в «${worst.name}». Если окупаемость там не хуже — часть бюджета стоит перенести туда.` };
}
