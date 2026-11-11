// «Разбор недели» (11.11.2026, владелица: «мощный инструмент, чтобы мне больше не нужен был таргетолог»): то, что таргетолог
// присылает раз в неделю, — итог против прошлой недели, воронка, поиск и сети, объявления, запросы, площадки — и выводы простыми словами.
// Только чистые функции (тест — tests/weekreview.test.js). Советы не меняют кабинет: цену цели и бюджет меняет владелица.
import { addDays } from '../../js/calc.js';
import { totals, convTotal, queryHints } from './dcalc.js';
import { VAT } from './pult.js';
import { twoProp, sampleSize } from './mcalc.js';

const pct = (a, b) => (b ? a / b : null);
const chg = (now, prev) => (prev ? (now - prev) / prev : null);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const weekKeyOf = (today) => addDays(today, -((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7)); // понедельник этой недели

// Период: до 7 полных дней по вчера (молодая кампания — со старта); прошлый — столько же дней перед ним, если кампания уже шла
export function reviewPeriod(camp, today) {
  const to = addDays(today, -1), start = camp?.start && camp.start > addDays(to, -6) ? camp.start : addDays(to, -6);
  const days = daysBetween(start, to) + 1;
  if (days < 1) return null;
  const prevTo = addDays(start, -1), prevFrom = addDays(prevTo, -(days - 1));
  return { from: start, to, days, prevFrom, prevTo, hasPrev: !camp?.start || camp.start <= prevFrom };
}

export function weekReview({ camp, daily = [], conv = [], adDaily = [], ads = [], queries = [], places = [], goals = {}, today, libValue = null, perSale = null, skip = null }) {
  const p = reviewPeriod(camp, today);
  if (!p) return null;
  const cid = camp.id;
  const part = (from, to) => {
    const t = totals(daily, from, to, cid);
    const lib = goals.lib ? convTotal(conv, from, to, cid, [goals.lib], skip) : null, buy = goals.buy?.length ? convTotal(conv, from, to, cid, goals.buy, skip) : null;
    return { impr: t.impr, clicks: t.clicks, cost: t.cost, ctr: pct(t.clicks, t.impr), lib, buy, cpaLib: lib ? t.cost / lib : null, cpaBuy: buy ? t.cost / buy : null, toLib: lib != null ? pct(lib, t.clicks) : null, toBuy: buy != null && lib ? buy / lib : null };
  };
  const now = part(p.from, p.to), prev = p.hasPrev ? part(p.prevFrom, p.prevTo) : null;
  const delta = prev ? { cost: chg(now.cost, prev.cost), clicks: chg(now.clicks, prev.clicks), lib: chg(now.lib || 0, prev.lib || 0), cpaLib: now.cpaLib != null && prev.cpaLib != null ? chg(now.cpaLib, prev.cpaLib) : null, ctr: now.ctr != null && prev.ctr != null ? chg(now.ctr, prev.ctr) : null } : null;
  // поиск и сети, объявления — из отчёта по объявлениям и площадкам
  const mine = adDaily.filter((x) => x.cid === cid && x.date >= p.from && x.date <= p.to);
  const sumBy = (key) => { const by = {}; for (const x of mine) { const k = key(x), v = (by[k] ||= { impr: 0, clicks: 0, cost: 0 }); v.impr += x.impr; v.clicks += x.clicks; v.cost += x.cost; } return by; };
  const nb = sumBy((x) => x.net);
  const nets = [['n', 'Сети (сайты и приложения)'], ['s', 'Поиск']].filter(([k]) => nb[k]?.impr).map(([k, name]) => ({ k, name, ...nb[k], ctr: pct(nb[k].clicks, nb[k].impr), share: pct(nb[k].clicks, now.clicks || nb.n?.clicks + (nb.s?.clicks || 0)) }));
  const ab = sumBy((x) => x.aid);
  const adRows = Object.entries(ab).map(([aid, v]) => { const a = ads.find((x) => String(x.id) === String(aid)); return { aid, title: a?.title || 'Объявление ' + aid, state: a?.state || '', ...v, ctr: pct(v.clicks, v.impr) }; }).sort((x, y) => y.impr - x.impr);
  const fair = adRows.filter((x) => x.impr >= 500);
  const best = fair.length >= 2 ? [...fair].sort((x, y) => y.ctr - x.ctr)[0] : null, worst = fair.length >= 2 ? [...fair].sort((x, y) => x.ctr - y.ctr)[0] : null;
  // честный тест объявлений (её «да» на п. 19): победитель — только когда разница в CTR не случайна (z-тест 95 %) и у обоих 1000+ показов
  let adTest = null;
  { const on = adRows.filter((x) => x.state === 'ON' || !x.state);
    if (on.length >= 2) {
      const top = [...on].sort((x, y) => (y.ctr || 0) - (x.ctr || 0)), a = top[0], b = top[top.length - 1], t = twoProp(a.clicks, a.impr, b.clicks, b.impr);
      if (a.impr >= 1000 && b.impr >= 1000 && t.level !== 'low' && a.ctr > b.ctr) adTest = { status: 'win', best: a, loser: b, sure: t.level };
      else { const need = sampleSize(Math.max(a.ctr || 0, 0.005), Math.abs((a.ctr || 0) - (b.ctr || 0))); adTest = { status: 'wait', best: a, loser: b, need: need ? Math.max(0, need - Math.min(a.impr, b.impr)) : null }; }
    } }
  const liveAds = ads.filter((x) => x.cid === cid && x.state === 'ON' && x.status !== 'REJECTED').length;
  // запросы (отчёт за 30 дней) и площадки
  const q = queries.filter((x) => x.cid === cid), junk = queryHints(q, { [cid]: camp.negatives || [] });
  const topQ = [...q].sort((x, y) => y.clicks - x.clicks).slice(0, 8);
  const pl = places.filter((x) => x.cid === cid), topP = [...pl].sort((x, y) => y.clicks - x.clicks).slice(0, 8);
  const badP = pl.filter((x) => x.clicks >= 20 && x.bounce != null && x.bounce >= 50);

  // ---- выводы простыми словами ----
  const notes = [], todo = [], r0 = Math.round, p1 = (v) => (v * 100).toFixed(1).replace('.', ',');
  const payConv = /PAY_FOR_CONVERSION/.test(`${camp.strategy?.search || ''} ${camp.strategy?.network || ''}`);
  if (!now.cost && !now.clicks) notes.push({ tone: 'wait', text: 'За этот период показов и расхода не было.' });
  if (now.lib != null && now.clicks >= 50) {
    notes.push({ tone: now.lib ? 'good' : 'warn', text: now.lib ? `Из 100 кликов в библиотеку добавляют ${p1(now.toLib)}. ${payConv ? 'Вы платите только за добавления, поэтому клики без добавления бесплатны.' : ''}` : 'Клики есть, добавлений в библиотеку нет — проверьте цель и счётчик в кампании.' });
    if (now.cpaLib != null && libValue != null) notes.push({ tone: now.cpaLib <= libValue ? 'good' : 'bad', text: now.cpaLib <= libValue ? `Добавление стоит ${r0(now.cpaLib)} ₽, а приносит в среднем ≈ ${r0(libValue)} ₽ роялти — реклама в плюсе.` : `Добавление стоит ${r0(now.cpaLib)} ₽, а приносит в среднем ≈ ${r0(libValue)} ₽ роялти — пока в минус.` });
  }
  if (now.buy && perSale != null) { const ret = now.buy * perSale / (now.cost || 1); notes.push({ tone: ret >= 1 ? 'good' : 'warn', text: `Покупок ${now.buy}: на 1 ₽ рекламы — ${ret.toFixed(2).replace('.', ',')} ₽ роялти с покупок за эти же дни (часть покупок придёт позже).` }); }
  if (delta?.cpaLib != null && Math.abs(delta.cpaLib) >= 0.2 && (now.lib || 0) >= 5 && (prev.lib || 0) >= 5) notes.push({ tone: delta.cpaLib > 0 ? 'warn' : 'good', text: `Добавление ${delta.cpaLib > 0 ? 'подорожало' : 'подешевело'} на ${r0(Math.abs(delta.cpaLib) * 100)} % к прошлому периоду.` });
  if (delta?.ctr != null && delta.ctr <= -0.25 && now.impr >= 3000) { notes.push({ tone: 'warn', text: `На объявление кликают реже: CTR упал на ${r0(-delta.ctr * 100)} %. Так бывает, когда объявление приелось.` }); todo.push({ k: 'fresh', text: 'Добавить новое объявление: другая картинка или другой крючок' }); }
  if (nets.length === 2) { const n = nets[0], s = nets[1]; notes.push({ tone: 'info', text: `${r0((n.share || 0) * 100)} % кликов дают сети, поиск — ${r0((s.share || 0) * 100)} %. В сетях реклама догоняет читательниц на сайтах, на поиске — отвечает на запрос; на поиске людей меньше, но они «теплее».` }); }
  if (liveAds && liveAds < 3) todo.push({ k: 'ads', text: liveAds === 1 ? 'Добавить ещё 2–3 объявления — Директу не из чего выбирать' : 'Добавить ещё одно-два объявления' });
  if (best && worst && best.aid !== worst.aid && worst.ctr < best.ctr * 0.6) { notes.push({ tone: 'info', text: `Лучше кликают на «${best.title}» (CTR ${p1(best.ctr)} %), хуже — на «${worst.title}» (${p1(worst.ctr)} %).` }); todo.push({ k: 'weak-' + worst.aid, text: `Заменить слабое объявление «${worst.title}» новым вариантом` }); }
  if (junk.length) todo.push({ k: 'minus', text: `Добавить минус-слова: ${junk.length} мусорных ${junk.length === 1 ? 'запрос' : 'запросов'}`, to: `/c/${cid}`, tab: 'queries' });
  if (badP.length) todo.push({ k: 'places', text: `Исключить площадки, с которых сразу уходят: ${badP.slice(0, 3).map((x) => x.place).join(', ')}`, to: '/quality' });
  if (libValue != null && camp.cpa && camp.cpa * VAT > libValue * 1.05) todo.push({ k: 'cpaDown', text: `Снизить цену цели до ${Math.max(1, Math.floor(libValue / VAT))} ₽ — добавление приносит меньше, чем стоит` });
  if (!todo.length && now.cost) notes.push({ tone: 'good', text: 'Менять на этой неделе ничего не нужно — пусть работает.' });
  return { period: p, now, prev, delta, nets, adRows, adTest, best, worst, topQ, junk: junk.length, topP, badP, notes, todo, liveAds, payConv };
}

// «Что если» (её «да» на п. 23): цена цели и число добавлений в неделю → расход, ожидаемое роялти, прибыль.
// Сколько добавлений даст Директ при другой цене, заранее не знает никто — калькулятор показывает, при каком объёме это выгодно.
export function whatIf({ cpa, perWeek, libValue = null, weekLimit = null }) {
  const cost = cpa * VAT * perWeek, royalty = libValue != null ? perWeek * libValue : null;
  return { cost, royalty, profit: royalty != null ? royalty - cost : null, ret: royalty != null && cost ? royalty / cost : null, maxCpa: libValue != null ? Math.floor(libValue / VAT) : null, over: weekLimit != null && cost > weekLimit, fits: weekLimit ? Math.floor(weekLimit / (cpa * VAT)) : null };
}
