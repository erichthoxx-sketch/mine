// «Рынок»: раз в сутки читаем открытые топы (по одной странице на подборку) через «читалку» r.jina.ai и кладём срез в d_snap/market.
// Подборки — settings.direct.market.srcs [{name, url}] (по умолчанию MARKET_DEFAULT). Расчёты — js/market.js.
import { parseLitnetList, packDay, bookCard, trimSnap } from '../../js/market.js';

export const MARKET_DEFAULT = [
  { name: 'Литнет · любовные романы', url: 'https://litnet.com/ru/top/lyubovnye-romany' },
  { name: 'Литнет · современный любовный роман', url: 'https://litnet.com/ru/top/sovremennyy-lyubovnyy-roman' },
  { name: 'Литнет · остросюжетный любовный роман', url: 'https://litnet.com/ru/top/ostrosugetnyj-lyubovnyj-roman' },
  { name: 'Литнет · все жанры', url: 'https://litnet.com/ru/top/all' },
];
export const srcsOf = (settings) => (settings.direct?.market?.srcs?.length ? settings.direct.market.srcs : MARKET_DEFAULT);
export const okSrc = (url) => /^https:\/\/litnet\.com\/ru\/top\/[a-z0-9-]+\/?$/i.test(String(url || '').trim().split('?')[0]);
// срез рынка — всегда из её данных (не из примера Директа)
export const marketSnap = (app) => (app.ctx().data.d_snap || []).find((x) => x.id === 'market') || null;
export const marketState = { busy: false, err: '' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scanMarket(app) {
  if (marketState.busy) return null;
  marketState.busy = true; marketState.err = '';
  const c = app.ctx(), today = c.today, snap = { days: {}, books: {}, ...(marketSnap(app) || {}) };
  const day = { ...(snap.days[today] || {}) }, myDay = {};
  const me = String(c.settings.pseudonym || '').toLowerCase().trim(), isMe = (r) => me && String(r.author || '').toLowerCase().trim() === me;
  let got = 0;
  try {
    const list = srcsOf(c.settings);
    for (let i = 0; i < list.length; i++) {
      const s = list[i], pages = i < 2 ? 3 : 1, rows = [], seen = new Set(); // у двух первых подборок берём 3 страницы (≈ 50 книг): на 16 книгах аналитики не построить
      try {
        for (let pg = 1; pg <= pages; pg++) {
          const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000);
          const r = await fetch('https://r.jina.ai/' + s.url + (pg > 1 ? '?page=' + pg : ''), { signal: ctl.signal }); clearTimeout(t);
          if (!r.ok) { if (pg === 1) throw new Error('страница не открылась (' + r.status + ')'); break; }
          const part = parseLitnetList(await r.text()).filter((x) => !seen.has(x.id) && seen.add(x.id));
          if (pg === 1 && part.length < 5) throw new Error('не вижу списка книг');
          if (!part.length) break;
          rows.push(...part);
          await sleep(3500);
        }
        // её книги: у двух первых подборок листаем глубже (до 12 страниц), пока не найдём — чтобы видеть её место и когда она не в первой полусотне
        if (me && i < 2 && !rows.some(isMe)) {
          for (let pg = pages + 1; pg <= 12; pg++) {
            const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000);
            const r = await fetch('https://r.jina.ai/' + s.url + '?page=' + pg, { signal: ctl.signal }).catch(() => null); clearTimeout(t);
            if (!r?.ok) break;
            const part = parseLitnetList(await r.text()).filter((x) => !seen.has(x.id) && seen.add(x.id)); if (!part.length) break;
            const base = rows.length + (myDay.__n?.[s.url] || 0);
            const hits = part.map((x, j) => ({ x, n: base + j + 1 })).filter((h) => isMe(h.x));
            (myDay.__n ||= {})[s.url] = (myDay.__n[s.url] || 0) + part.length;
            await sleep(3500);
            if (hits.length) { myDay[s.url] = hits.map((h) => ({ id: h.x.id, n: h.n, l: h.x.lib, v: h.x.views })); for (const h of hits) snap.books[h.x.id] = bookCard(h.x); break; }
          }
        }
        if (me && rows.some(isMe)) myDay[s.url] = rows.map((x, j) => ({ x, n: j + 1 })).filter((h) => isMe(h.x)).map((h) => ({ id: h.x.id, n: h.n, l: h.x.lib, v: h.x.views }));
        day[s.url] = packDay(rows); got++;
        for (const x of rows) snap.books[x.id] = bookCard(x);
      } catch (e) { marketState.err = `${s.name}: ${e.name === 'AbortError' ? 'нет ответа' : e.message}`; if (rows.length) { day[s.url] = packDay(rows); got++; for (const x of rows) snap.books[x.id] = bookCard(x); } }
    }
    delete myDay.__n;
    if (got) { snap.days = { ...snap.days, [today]: day }; snap.my = { ...(snap.my || {}), [today]: myDay }; await app.store.put('d_snap', { ...trimSnap(snap), id: 'market', at: new Date().toISOString(), err: marketState.err }); }
  } finally { marketState.busy = false; }
  return { got, err: marketState.err };
}
// сама, раз в сутки (не в примере и не на localhost)
let armed = false;
export function autoMarket(app) {
  if (armed || typeof window === 'undefined' || /^(localhost|127\.)/.test(location.hostname) || app.store.mode !== 'firebase') return;
  if (!app.snap('main')) return; // Директ ещё не подключён или данные не пришли
  armed = true;
  setTimeout(() => { const at = marketSnap(app)?.at; if (!at || at.slice(0, 10) !== app.ctx().today) scanMarket(app).then(() => app.rerender?.()).catch((e) => console.warn('Рынок:', e)); }, 20000);
}
