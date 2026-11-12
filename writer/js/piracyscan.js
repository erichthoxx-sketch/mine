// «Защита от пиратов»: работа с сетью. Всё бесплатно и без ключей: выдачу поисковиков и страницы читает общедоступная
// «читалка» r.jina.ai (браузер сам чужой сайт открыть не может), почту хостинга дают открытые сведения RDAP и dns.google.
// Раз в сутки при открытой Мастерской (autoPiracy) или по кнопке. Найденное — коллекция w_piracy, служебное — settings.piracy.
import { searchQueries, ENGINES, parseResults, judge, findId, hostOf, emailsIn, rdapInfo, isCloudflare, CONTACT_PATHS, norm, plainTitle, fullTextBack, skipToRecheck } from './piracy.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP = 3500; // читалка без ключа пускает ~20 запросов в минуту
export const scanState = { busy: false, step: '', err: '' };

async function read(url, { timeout = 30000 } = {}) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch('https://r.jina.ai/' + url, { signal: ctl.signal });
    if (r.status === 429) { const e = new Error('слишком часто'); e.limit = true; throw e; }
    if (!r.ok) throw new Error('страница не открылась (' + r.status + ')');
    return await r.text();
  } finally { clearTimeout(t); }
}
// один запрос → результаты. Startpage (выдача Google) и DuckDuckGo находят разное — берём оба; Brave — если оба молчат
async function search(q) {
  const res = [], names = [];
  let last;
  for (const [name, mk] of ENGINES) {
    if (name === 'Brave' && names.length) break;
    try {
      const r = parseResults(await read(mk(q)));
      if (r.length >= 3) { res.push(...r); names.push(name); }
    } catch (e) { last = e; if (e.limit) throw e; }
    await sleep(GAP);
  }
  if (!names.length && last) throw last;
  return { name: names.join(' + '), res };
}

// Проверить книги: новые находки → w_piracy; заодно — живы ли страницы, которым уже писали
export async function scan(app, { onStep } = {}) {
  if (scanState.busy) return null;
  scanState.busy = true; scanState.err = '';
  const say = (t) => { scanState.step = t; onStep?.(t); };
  const c = app.ctx(), s = c.settings, cfg = s.piracy || {}, author = s.pseudonym || '';
  const books = (c.wbooks || c.data.w_books || []).filter((b) => b.title && b.status !== 'idea');
  const known = new Map((c.data.w_piracy || []).map((f) => [f.id, f]));
  const ignore = []; // прежний список «не пиратов» по сайтам больше не используется — прячутся отдельные страницы (status: 'skip')
  let added = 0, engine = '', done = 0;
  try {
    for (const b of books) {
      say(`Ищу «${plainTitle(b.title)}»… ${++done} из ${books.length}`);
      for (const q of searchQueries(b.title, author)) {
        const { name, res } = await search(q);
        engine = name || engine;
        for (const r of res) {
          const hit = judge(r, b.title, author, ignore);
          if (!hit) continue;
          const id = findId(hit.url);
          // тот же сайт с той же книгой — одна находка (читалка и «скачать» рядом — одно письмо)
          if (known.has(id) || [...known.values()].some((f) => f.status !== 'skip' && f.host === hit.host && f.bookId === b.id)) continue;
          const f = { id, url: hit.url, host: hit.host, bookId: b.id, title: plainTitle(b.title), page: hit.title, why: hit.why, sure: hit.sure, status: 'new', foundAt: new Date().toISOString() };
          known.set(id, f); await app.store.put('w_piracy', f); added++;
        }
      }
    }
    // страницы, по которым идёт работа: исчезли ли
    for (const f of [...known.values()].filter((x) => ['sent', 'host', 'search'].includes(x.status)).slice(0, 8)) {
      say(`Проверяю, удалили ли: ${f.host}…`);
      const gone = await pageGone(f);
      if (gone !== null && !!f.goneMaybe !== gone) await app.store.put('w_piracy', { ...f, goneMaybe: gone, checkedAt: new Date().toISOString() });
      await sleep(GAP);
    }
  } catch (e) { scanState.err = e.limit ? 'Поиск попросил паузу — продолжу при следующей проверке' : (e.name === 'AbortError' ? 'Поиск не ответил' : e.message); }
  scanState.busy = false; say('');
  await app.store.saveSettings({ piracy: { ...(app.ctx().settings.piracy || {}), at: new Date().toISOString(), engine, added, err: scanState.err, books: books.length } });
  return { added, err: scanState.err };
}
// страницы нет (404) или названия книги на ней больше нет → похоже, удалили; null — проверить не вышло
export async function pageGone(f) {
  try {
    const t = await read(f.url, { timeout: 25000 });
    if (/returned error 40[34]|returned error 410|404 not found|страница не найдена/i.test(t.slice(0, 1500))) return true;
    return !norm(t).includes(norm(f.title));
  } catch { return null; }
}

// Объём текста страницы (знаков без пробелов, чтобы меню и отступы не мешали); null — страница не открылась
export async function pageLen(url) {
  try { return (await read(url, { timeout: 25000 })).replace(/\s+/g, '').length; } catch { return null; }
}
// Страницы «Это не пират»: раз в 3 дня — не появился ли там полный текст. Появился → снова «Новая» и письмо владелице
export async function recheckSkipped(app, notify) {
  const back = [];
  for (const f of skipToRecheck(app.ctx().data.w_piracy || [])) {
    const len = await pageLen(f.url), at = new Date().toISOString();
    if (len === null) { await app.store.put('w_piracy', { ...f, skipCheckAt: at }); await sleep(GAP); continue; }
    if (!f.skipLen) await app.store.put('w_piracy', { ...f, skipLen: len, skipCheckAt: at });
    else if (fullTextBack(f.skipLen, len)) {
      const g = { ...f, status: 'new', sure: true, back: true, why: `на странице появился полный текст: было ${f.skipLen.toLocaleString('ru-RU')} знаков, стало ${len.toLocaleString('ru-RU')}`, foundAt: at, skipLen: len, skipCheckAt: at };
      await app.store.put('w_piracy', g); back.push(g);
    } else await app.store.put('w_piracy', { ...f, skipLen: Math.min(f.skipLen, len) || len, skipCheckAt: at });
    await sleep(GAP);
  }
  if (back.length) await notify?.(back);
  return back;
}

// Почты сайта, хостинга и регистратора домена (для письма). Сохраняются в находке, чтобы не искать дважды
async function json(url) {
  try { const r = await fetch(url); if (r.ok) return await r.json(); } catch { /* запасной путь ниже */ }
  try { const t = await read(url, { timeout: 20000 }); const i = t.indexOf('{'); return i >= 0 ? JSON.parse(t.slice(i, t.lastIndexOf('}') + 1)) : null; } catch { return null; }
}
export async function findContacts(f) {
  const root = f.host.split('.').slice(-2).join('.'), origin = 'https://' + f.host;
  const out = { site: [], host: [], hostName: '', reg: [], regName: '', cf: false, at: new Date().toISOString() };
  // сайт: главная и страницы «правообладателям / контакты»
  for (const p of CONTACT_PATHS.slice(0, 5)) {
    try { out.site.push(...emailsIn(await read(origin + p, { timeout: 20000 }))); } catch { /* страницы нет */ }
    if (out.site.length >= 2) break;
    await sleep(1500);
  }
  out.site = [...new Set(out.site)].sort((a, b) => rank(b, root) - rank(a, root)).slice(0, 3);
  // хостинг: адрес сервера → чья это сеть и куда жаловаться
  const dns = await json('https://dns.google/resolve?name=' + encodeURIComponent(f.host) + '&type=A');
  const ip = (dns?.Answer || []).map((a) => a.data).find((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d || ''));
  if (ip) { const i = rdapInfo(await json('https://rdap.org/ip/' + ip)); out.hostName = i.name; out.host = (i.abuse.length ? i.abuse : i.emails).slice(0, 2); }
  const d = rdapInfo(await json('https://rdap.org/domain/' + root));
  out.regName = d.name; out.reg = (d.abuse.length ? d.abuse : d.emails).slice(0, 2);
  out.cf = isCloudflare(out.hostName, out.host);
  return out;
}
const rank = (m, root) => (/abuse|dmca|copyright|prav|legal/.test(m) ? 3 : 0) + (m.endsWith('@' + root) ? 2 : 0) + (/admin|support|info|help|contact/.test(m) ? 1 : 0);

// Раз в сутки сама (не на localhost и только когда книги пришли с сервера)
let armed = false;
export function autoPiracy(app, after) {
  if (armed || typeof window === 'undefined' || /^(localhost|127\.)/.test(location.hostname)) return;
  const st = app.store, s = st.settings || app.ctx().settings;
  if (st.mode !== 'firebase' || !(st.data?.w_books || []).length) return;
  if (s.piracy?.off) { armed = true; return; }
  const last = Date.parse(s.piracy?.at || 0) || 0;
  armed = true;
  // спрятанные страницы проверяются браузером всегда — и когда ищет сервис (он чужие страницы не открывает)
  setTimeout(() => recheckSkipped(app, notifyBack).catch((e) => console.warn('Повторная проверка страниц:', e)), 90000);
  if (Date.now() - last < 22 * 3600e3) return;
  // не мешаем открытию приложения; если за это время круглосуточный поиск сервиса отчитался (piracy.at свежий) — сами не ищем
  setTimeout(() => { if (Date.now() - (Date.parse(app.ctx().settings.piracy?.at || 0) || 0) < 22 * 3600e3) return; scan(app).then(() => after?.(app)).catch((e) => console.warn('Поиск пиратских копий:', e)); }, 30000);
}
export { hostOf };
// письмо владелице о вернувшихся находках — через сервис писем (если подключён); в Планере они и так появятся как «новые копии»
let notifyBack = null;
export function onSkipBack(fn) { notifyBack = fn; }
