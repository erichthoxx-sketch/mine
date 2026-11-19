// «Рынок»: раз в сутки читаем открытые топы (по одной странице на подборку) через переходник владелицы (запасной путь — «читалка» r.jina.ai) и кладём срез в d_snap/market.
// Подборки — settings.direct.market.srcs [{name, url}] (по умолчанию MARKET_DEFAULT). Расчёты — js/market.js.
import { parseLitnetList, packDay, bookCard, trimSnap, htmlToMd } from '../../js/market.js';

// Страница топа → карточки. Сначала через переходник владелицы (/page — он открывает litnet.com), потом через «читалку» r.jina.ai
// (с её интернета читалка стала отвечать 401 — поэтому она теперь запасная). Возвращает { rows, via } или бросает понятную ошибку.
async function readTop(url, settings) {
  const proxy = String(settings.direct?.proxy || '').replace(/\/+$/, ''), errs = [];
  const get = async (u) => { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000); try { return await fetch(u, { signal: ctl.signal }); } finally { clearTimeout(t); } };
  if (proxy) {
    try { const r = await get(`${proxy}/page?url=${encodeURIComponent(url)}`); if (!r.ok) throw new Error('переходник ответил ' + r.status);
      const rows = parseLitnetList('\n' + htmlToMd(await r.text())); if (rows.length) return { rows, via: 'proxy' }; errs.push('переходник: страница пришла без списка книг'); }
    catch (e) { errs.push(e.name === 'AbortError' ? 'переходник: нет ответа' : /Failed to fetch/i.test(e.message) ? 'переходник не отвечает' : e.message); }
  }
  try { const r = await get('https://r.jina.ai/' + url); if (!r.ok) throw new Error('читалка ответила ' + r.status);
    const rows = parseLitnetList(await r.text()); if (rows.length) return { rows, via: 'reader' }; errs.push('читалка: без списка книг'); }
  catch (e) { errs.push(e.name === 'AbortError' ? 'читалка: нет ответа' : /Failed to fetch/i.test(e.message) ? 'читалка не отвечает' : e.message); }
  throw new Error(errs.join('; '));
}

export const MARKET_DEFAULT = [
  { name: 'Литнет · любовные романы', url: 'https://litnet.com/ru/top/lyubovnye-romany' },
  { name: 'Литнет · современный любовный роман', url: 'https://litnet.com/ru/top/sovremennyy-lyubovnyy-roman' },
  { name: 'Литнет · остросюжетный любовный роман', url: 'https://litnet.com/ru/top/ostrosugetnyj-lyubovnyj-roman' },
  { name: 'Литнет · все жанры', url: 'https://litnet.com/ru/top/all' },
  { name: 'Литнет · бестселлеры', url: 'https://litnet.com/ru/top/best' },
  { name: 'Литнет · молодежная проза', url: 'https://litnet.com/ru/top/sovremennyy-lyubovnyy-roman-i-molodejnaya-proza' },
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
  const coverage = { requested: srcsOf(c.settings).length, collected: 0, pages: 0, bySource: {}, errors: [] };
  try {
    const list = srcsOf(c.settings);
    for (let i = 0; i < list.length; i++) {
      const s = list[i], pages = i < 2 ? 3 : 1, rows = [], seen = new Set();
      let via = '';
      let pagesRead = 0; // у двух первых подборок берём 3 страницы (≈ 50 книг): на 16 книгах аналитики не построить
      try {
        for (let pg = 1; pg <= pages; pg++) {
          let got1;
          try { got1 = await readTop(s.url + (pg > 1 ? '?page=' + pg : ''), c.settings); } catch (e) { if (pg === 1) throw e; break; }
          via = got1.via;
          const part = got1.rows.filter((x) => !seen.has(x.id) && seen.add(x.id));
          if (pg === 1 && part.length < 5) throw new Error('на странице меньше 5 книг — похоже, Литнет поменял вид страницы');
          if (!part.length) break;
          rows.push(...part);
          pagesRead++;
          await sleep(3500);
        }
        // её книги: у двух первых подборок листаем глубже (до 12 страниц), пока не найдём — чтобы видеть её место и когда она не в первой полусотне
        if (me && i < 2 && !rows.some(isMe)) {
          for (let pg = pages + 1; pg <= 12; pg++) {
            const g2 = await readTop(s.url + '?page=' + pg, c.settings).catch(() => null);
            if (!g2) break;
            const part = g2.rows.filter((x) => !seen.has(x.id) && seen.add(x.id)); if (!part.length) break;
            const base = rows.length + (myDay.__n?.[s.url] || 0);
            const hits = part.map((x, j) => ({ x, n: base + j + 1 })).filter((h) => isMe(h.x));
            (myDay.__n ||= {})[s.url] = (myDay.__n[s.url] || 0) + part.length;
            await sleep(3500);
            if (hits.length) { myDay[s.url] = hits.map((h) => ({ id: h.x.id, n: h.n, l: h.x.lib, v: h.x.views })); for (const h of hits) snap.books[h.x.id] = bookCard(h.x); break; }
          }
        }
        if (me && rows.some(isMe)) myDay[s.url] = rows.map((x, j) => ({ x, n: j + 1 })).filter((h) => isMe(h.x)).map((h) => ({ id: h.x.id, n: h.n, l: h.x.lib, v: h.x.views }));
        day[s.url] = packDay(rows); got++;
        coverage.bySource[s.url] = { name: s.name, books: rows.length, pages: pagesRead, ok: true, via };
        coverage.pages += pagesRead;
        for (const x of rows) snap.books[x.id] = bookCard(x);
      } catch (e) {
        const message = `${s.name}: ${e.name === 'AbortError' ? 'нет ответа' : e.message}`;
        coverage.errors.push(message);
        coverage.bySource[s.url] = { name: s.name, books: rows.length, pages: pagesRead, ok: false, error: message };
        if (rows.length) { day[s.url] = packDay(rows); got++; coverage.pages += pagesRead; for (const x of rows) snap.books[x.id] = bookCard(x); }
      }
    }
    delete myDay.__n;
    coverage.collected = got;
    marketState.err = coverage.errors.join(' · ');
    if (got) { snap.coverage = { ...(snap.coverage || {}), [today]: coverage }; snap.days = { ...snap.days, [today]: day }; snap.my = { ...(snap.my || {}), [today]: myDay }; await app.store.put('d_snap', { ...trimSnap(snap), id: 'market', at: new Date().toISOString(), err: marketState.err }); }
    else await app.store.put('d_snap', { ...snap, id: 'market', tryAt: new Date().toISOString(), err: marketState.err || 'топы не открылись' });
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
