// «Пульт» Директа: по каждой кампании — состояние, деньги, цена цели против заданной, окупаемость и вывод;
// сверху — что требует внимания. Только чистые функции (тесты — tests/pult.test.js). Бюджеты приложение не меняет.
import { addDays } from '../../js/calc.js';
import { totals, goalTotals, convTotal } from './dcalc.js';
import { litnetPage, matchBook, reach } from './mcalc.js';

const r0 = (v) => Math.round(v);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const weekStartOf = (d) => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7)); // понедельник

// Цели: «добавление в библиотеку» и «покупка» — по названиям целей Метрики; цель стратегии кампании главнее
export function goalsOf(metrika = {}, camp = null) {
  const gs = metrika?.goals || [];
  const lib = gs.find((g) => /библиотек/i.test(g.name))?.id;
  const buy = (metrika?.main || []).length ? metrika.main.map(String) : gs.filter((g) => /^(?!.*начал).*(покупк|купил|оплат)/i.test(g.name)).map((g) => String(g.id));
  const own = camp?.goal ? String(camp.goal) : null;
  return { lib: own && !buy.includes(own) ? own : lib ? String(lib) : null, buy, own };
}

// Книга кампании: по ссылке объявления на Литнете (номер книги или адрес), иначе по названию кампании
export function bookOfCampaign(camp, ads = [], wbooks = []) {
  const hrefs = ads.filter((x) => x.cid === camp.id).map((x) => x.href).filter(Boolean);
  for (const h of hrefs) {
    const p = litnetPage(h);
    if (p.type !== 'book') continue;
    const byLink = wbooks.find((b) => [b.direct?.link, b.litnetUrl].some((u) => u && litnetPage(u).bookId === p.bookId));
    if (byLink) return { id: byLink.id, title: byLink.title, href: h };
    const t = matchBook(p.slug, wbooks.map((b) => b.title));
    if (t) { const b = wbooks.find((x) => x.title === t); return { id: b.id, title: b.title, href: h }; }
    return { id: null, title: null, href: h };
  }
  const t = wbooks.find((b) => b.title && String(camp.name || '').toLowerCase().includes(b.title.toLowerCase()));
  return t ? { id: t.id, title: t.title, href: hrefs[0] || null } : hrefs[0] ? { id: null, title: null, href: hrefs[0] } : null;
}

// Состояние кампании простыми словами: key — для цвета и порядка
export function campaignState(camp, { daily = [], ads = [], today }) {
  const mine = ads.filter((x) => x.cid === camp.id && x.state !== 'ARCHIVED');
  if (camp.state === 'ARCHIVED') return { key: 'archived', text: 'в архиве', tone: 'muted' };
  if (camp.status === 'DRAFT') return { key: 'draft', text: 'черновик', tone: 'muted' };
  if (camp.status === 'MODERATION' || (mine.length && mine.every((x) => x.status === 'MODERATION'))) return { key: 'moderation', text: 'на модерации', tone: 'muted' };
  if (mine.length && mine.every((x) => x.status === 'REJECTED')) return { key: 'rejected', text: 'объявления отклонены', tone: 'bad' };
  if (camp.state === 'SUSPENDED' || camp.state === 'OFF') return { key: 'stopped', text: 'остановлена', tone: 'muted' };
  if (camp.end && camp.end < today) return { key: 'ended', text: 'закончилась', tone: 'muted' };
  if (camp.start && camp.start > today) return { key: 'soon', text: `стартует ${camp.start.slice(8, 10)}.${camp.start.slice(5, 7)}`, tone: 'muted' };
  const ran = camp.start ? daysBetween(camp.start, today) : 99;
  const last2 = totals(daily, addDays(today, -1), today, camp.id);
  if (ran >= 1 && !last2.impr) return { key: 'idle', text: 'нет показов', tone: 'bad' };
  const wk = weekBudget(camp, daily, today);
  if (wk && wk.share >= 0.95) return { key: 'capped', text: 'упёрлась в недельный бюджет', tone: 'warn' };
  return { key: 'on', text: 'идёт', tone: 'good' };
}

// Недельный бюджет: потрачено с понедельника (так считает Директ) против лимита стратегии
export function weekBudget(camp, daily, today) {
  if (camp.budget?.kind !== 'week' || !(camp.budget.amount > 0)) return null;
  const spent = totals(daily, weekStartOf(today), today, camp.id).cost;
  return { limit: camp.budget.amount, spent, share: spent / camp.budget.amount };
}

// Деньги и цели кампании за 7 и 30 дней + вывод.
// perSale — роялти с одной покупки (из «Доходов»), libShare — доля «библиотека → покупка» по Метрике автора.
export function campaignEcon(camp, { daily = [], conv = [], today, goals, perSale = null, libShare = null, skip = null }) {
  const from7 = addDays(today, -6), from30 = addDays(today, -29), cid = camp.id;
  const d7 = totals(daily, from7, today, cid), d30 = totals(daily, from30, today, cid), dToday = totals(daily, today, today, cid);
  const lib7 = goals.lib ? convTotal(conv, from7, today, cid, [goals.lib], skip) : null;
  const lib30 = goals.lib ? convTotal(conv, from30, today, cid, [goals.lib], skip) : null;
  const buy30 = goals.buy?.length ? convTotal(conv, from30, today, cid, goals.buy, skip) : null;
  const cpaLib = lib30 ? d30.cost / lib30 : null, cpaBuy = buy30 ? d30.cost / buy30 : null;
  const revenue = perSale != null && buy30 != null ? buy30 * perSale : null;
  // ценность добавления: часть читательниц из библиотеки потом покупает
  const libValue = perSale != null && libShare != null ? perSale * libShare : null;
  const target = camp.cpa || null; // цена цели в стратегии
  const ran = camp.start ? daysBetween(camp.start, today) + 1 : 30;
  let verdict;
  if (!d30.cost) verdict = { kind: 'wait', text: 'расхода пока нет' };
  else if (buy30 >= 3 && revenue != null) {
    const ret = revenue / d30.cost;
    verdict = ret >= 1.2 ? { kind: 'good', text: `окупается: на 1 ₽ — ${ret.toFixed(2).replace('.', ',')} ₽ роялти с покупок`, ret }
      : ret >= 0.9 ? { kind: 'even', text: `в ноль: на 1 ₽ — ${ret.toFixed(2).replace('.', ',')} ₽ роялти`, ret }
        : { kind: 'bad', text: `не окупается покупками: на 1 ₽ — ${ret.toFixed(2).replace('.', ',')} ₽ роялти`, ret };
  } else if (lib30 >= 5 && cpaLib != null) {
    const over = target ? cpaLib / target : null;
    const worth = libValue != null ? cpaLib <= libValue : null;
    verdict = over != null && over > 1.5 ? { kind: 'bad', text: `добавление по ${r0(cpaLib)} ₽ — дороже вашей цены ${r0(target)} ₽ в ${over.toFixed(1).replace('.', ',')} раза` }
      : worth === false ? { kind: 'warn', text: `добавление по ${r0(cpaLib)} ₽, а приносит в среднем ≈ ${r0(libValue)} ₽ — пока дороже, чем окупается` }
        : { kind: 'good', text: `добавление по ${r0(cpaLib)} ₽${target ? ` при цели ${r0(target)} ₽` : ''}${libValue != null ? `, приносит ≈ ${r0(libValue)} ₽` : ''}` };
  } else verdict = { kind: 'wait', text: ran < 7 ? `учится (день ${ran}) — выводы после 7 дней и 5 добавлений` : 'мало добавлений для выводов — нужно хотя бы 5 за 30 дней' };
  return { today: dToday, d7, d30, lib7, lib30, buy30, cpaLib, cpaBuy, revenue, libValue, target, ran, verdict };
}

// Что требует внимания по одной кампании (кроме общих подсказок «Что сделать сейчас»)
export function campaignAlerts(camp, st, econ, { daily = [], conv = [], today, goals }) {
  const out = [];
  if (st.key === 'idle') out.push({ tone: 'bad', title: `«${camp.name}»: нет показов со вчерашнего дня`, how: 'Частые причины — кончились деньги на счёте, недельный бюджет исчерпан, ставка/цена цели слишком низкие для аукциона. Проверьте баланс в кабинете Директа.' });
  if (st.key === 'capped') out.push({ tone: 'warn', title: `«${camp.name}»: недельный бюджет почти потрачен`, how: 'До понедельника показов почти не будет. Если добавление дешевле его ценности — бюджет стоит поднять в кабинете.' });
  // цена добавления за 3 последних дня — против цели
  if (econ.target && goals.lib) {
    const from = addDays(today, -2), g = goalTotals(daily, conv, from, today, { cid: camp.id, goals: [goals.lib] });
    if (g.conv >= 3 && g.cpa > econ.target * 1.5) out.push({ tone: 'warn', title: `«${camp.name}»: добавление подорожало до ${r0(g.cpa)} ₽`, how: `За 3 дня — ${g.conv} добавл. при цели ${r0(econ.target)} ₽. Посмотрите запросы и площадки: обычно дорожает из-за мусорного трафика.` });
    if (econ.ran >= 4 && econ.d7.impr > 300 && !econ.lib7) out.push({ tone: 'warn', title: `«${camp.name}»: показы есть, добавлений нет`, how: 'Проверьте, что ссылка ведёт на книгу и счётчик в кампании — ваш (108714441). При оплате за конверсии деньги не тратятся, но и читательниц нет: возможно, цена цели слишком низкая.' });
  }
  return out;
}

// Реклама, ведущая на сайт: кампании, у которых объявления ведут на lanafreitag.ru
export function siteCampaigns(campaigns = [], ads = [], host = 'lanafreitag.ru') {
  const ids = new Set(ads.filter((x) => String(x.href || '').includes(host)).map((x) => x.cid));
  return campaigns.filter((c) => ids.has(c.id));
}

// Директ по месяцам: последние 6 месяцев с расходом
export function directMonths({ daily = [], conv = [], goals, perSale = null, n = 6 }) {
  const by = {};
  for (const x of daily) { const k = x.date.slice(0, 7); const m = (by[k] ||= { month: k, cost: 0, clicks: 0 }); m.cost += x.cost; m.clicks += x.clicks; }
  return Object.values(by).filter((m) => m.cost > 0).sort((a, b) => b.month.localeCompare(a.month)).slice(0, n).map((m) => {
    const from = m.month + '-01', to = m.month + '-31';
    const lib = goals.lib ? convTotal(conv, from, to, null, [goals.lib]) : null, buy = goals.buy?.length ? convTotal(conv, from, to, null, goals.buy) : null;
    const rev = perSale != null && buy != null ? buy * perSale : null;
    return { ...m, cost: Math.round(m.cost), lib, buy, rev, ret: rev != null && m.cost ? rev / m.cost : null };
  });
}


const SITE_HOST = 'lanafreitag.ru';
const cidOf = (r) => Number(String(r.key || '').replace(/\D/g, '')) || null;

// Строки «Реклама на сайт»: Директ (по кампаниям из Метрики сайта + расход Директа) и другие метки UTM
export function siteAdRows({ site = {}, daily = [], campaigns = [], today }) {
  const g = site.goalIds || {}, from = addDays(today, -29);
  const out = [];
  for (const r of site.direct || []) {
    if (!r.visits || /не определ/i.test(r.name || '')) continue;
    const cid = cidOf(r), camp = campaigns.find((c) => c.id === cid || c.name === r.name);
    const cost = camp ? totals(daily, from, today, camp.id).cost : null;
    const read = g.read ? r.goals?.[g.read] || 0 : null, sub = g.subscribe ? r.goals?.[g.subscribe] || 0 : null;
    out.push({ kind: 'direct', name: camp?.name || r.name, cid: camp?.id || cid, visits: r.visits, bounce: r.bounce, read, sub, cost, perRead: cost && read ? cost / read : null, perSub: cost && sub ? cost / sub : null });
  }
  for (const r of site.utm || []) {
    const [src, camp] = r.dims || [];
    if (!src || /не определ/i.test(src) || /yandex|direct/i.test(src)) continue; // Директ — выше, по кампаниям
    const read = g.read ? r.goals?.[g.read] || 0 : null, sub = g.subscribe ? r.goals?.[g.subscribe] || 0 : null;
    out.push({ kind: 'utm', name: [src, camp].filter((x) => x && !/не определ/i.test(x)).join(' · '), visits: r.visits, bounce: r.bounce, read, sub, cost: null });
  }
  return out.sort((a, b) => b.visits - a.visits);
}

// Сайт → Литнет: что сделали на Литнете читательницы, пришедшие с сайта (Метрика автора, 90 дней)
export function siteToLitnet(mkUtm = [], goals) {
  const rows = mkUtm.filter((r) => String(r.dims?.[0] || '').toLowerCase().includes(SITE_HOST));
  if (!rows.length) return null;
  const visits = rows.reduce((s, r) => s + r.visits, 0);
  return { visits, lib: goals.lib ? rows.reduce((s, r) => s + reach(r, [goals.lib]), 0) : null, buy: goals.buy?.length ? rows.reduce((s, r) => s + reach(r, goals.buy), 0) : null };
}

