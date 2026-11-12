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
  const day = { ...(snap.days[today] || {}) };
  let got = 0;
  try {
    for (const s of srcsOf(c.settings)) {
      try {
        const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000);
        const r = await fetch('https://r.jina.ai/' + s.url, { signal: ctl.signal }); clearTimeout(t);
        if (!r.ok) throw new Error('страница не открылась (' + r.status + ')');
        const rows = parseLitnetList(await r.text());
        if (rows.length < 5) throw new Error('не вижу списка книг');
        day[s.url] = packDay(rows); got++;
        for (const x of rows) snap.books[x.id] = bookCard(x);
      } catch (e) { marketState.err = `${s.name}: ${e.name === 'AbortError' ? 'нет ответа' : e.message}`; }
      await sleep(3500);
    }
    if (got) { snap.days = { ...snap.days, [today]: day }; await app.store.put('d_snap', { ...trimSnap(snap), id: 'market', at: new Date().toISOString(), err: marketState.err }); }
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
