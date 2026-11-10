// Сайт автора: главная или страница книги (?kniga=адрес). Сначала — сохранённое в браузере (мгновенно), потом свежее.
import { renderSite, renderBook, renderPrivacy, renderReader, DEFAULT_CONTENT, normalize, safeUrl, esc } from './content.js';
import { loadPublic, subscribe, LOCAL } from './data.js';

const CACHE = 'lanaSite.cache';
const $ = (id) => document.getElementById(id);
const preview = new URLSearchParams(location.search).has('preview');
// страница книги: ./?kniga=адрес или «настоящий» адрес /kniga/адрес/ (его видят поисковики — scripts/site-seo.mjs)
let bookKey = new URLSearchParams(location.search).get('kniga') || decodeURIComponent((/^\/kniga\/([^/]+)/.exec(location.pathname) || [])[1] || '');
const privacyPage = new URLSearchParams(location.search).has('privacy');
const seoPage = !!document.querySelector('script[type="application/ld+json"]');
const readKey = new URLSearchParams(location.search).get('chitat') || '';
// окно подписки: переменные — здесь, в самом начале (иначе show() из памяти браузера падал, и свежие тексты не загружались)
const POP = 'lanaSite.pop', POP_T = 'lanaSite.popT', POP_DAYS = 14;
let popT = 0, popStart = Date.now(), popEl = null, popExit = null, popIO = null;
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* без памяти */ } } };
const popSpent = () => Number(ss.get(POP_T) || 0) + (Date.now() - popStart);
addEventListener('pagehide', () => ss.set(POP_T, String(popSpent())));
let current = null; // что сейчас на экране — нужно форме подписки (подарок, текст «готово»)
let shownImgs = {};
// Личный кабинет читателя (вход в шапке, ./?kabinet) — подгружается отдельно, основной сайт его не ждёт
const qs = new URLSearchParams(location.search);
let cab = null;
// кабинет грузится, только если он включён в админке («Кабинет» → «Показывать личный кабинет на сайте»)
let cabLoading = false;
const loadCab = () => { if (cab || cabLoading || preview) return; cabLoading = true; import('./cabinet.js' + ((/\?v=[^&]+/.exec(import.meta.url) || [''])[0])).then((m) => { cab = m; if (current) show(current, shownImgs); }).catch(() => {}); };
const cabPage = qs.has('kabinet') ? 'kabinet' : '';

// Яндекс Метрика: счётчик из «Общее»; не в предпросмотре админки и не при проверке на своём компьютере
let ymId = '';
function metrika(c) {
  const id = String(normalize(c).metrika || '').replace(/\D/g, '');
  if (!id || ymId || preview || LOCAL) return;
  ymId = id;
  window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
  window.ym.l = 1 * new Date();
  const s = document.createElement('script');
  s.async = true; s.src = 'https://mc.yandex.ru/metrika/tag.js?id=' + id;
  document.head.appendChild(s);
  window.ym(Number(id), 'init', { ssr: true, webvisor: true, clickmap: true, trackLinks: true, accurateTrackBounce: true });
}
// Цели: «Читать» (переход на площадку), подписка, подарок, Telegram — видны в «Директе» → Аналитика → Сайт
const goal = (name, params) => { if (ymId && window.ym) window.ym(Number(ymId), 'reachGoal', name, params); };

function show(content, imgs) {
  current = content || DEFAULT_CONTENT;
  metrika(current);
  let r = readKey ? renderReader(current, imgs || {}, readKey) : bookKey ? renderBook(current, imgs || {}, bookKey) : privacyPage ? renderPrivacy(current, imgs || {}) : null;
  if (!r && readKey) r = renderBook(current, imgs || {}, readKey); // фрагмента нет — страница книги
  const isBook = !!r && !!bookKey;
  if (!r) r = renderSite(content || DEFAULT_CONTENT, imgs || {}); // книги нет (скрыли, сменили адрес) — главная
  shownImgs = imgs || {};
  const cabOn = normalize(current).cabOn !== false;
  if (cabOn) loadCab();
  const cp = cabOn && cab && cabPage ? cab.page(normalize(current), shownImgs, cabPage) : null;
  if (cp) r = { ...r, main: cp.main, title: cp.title };
  else if (cabPage && cabOn) r = { ...r, main: '' }; // кабинет ещё грузится — не мелькаем главной
  document.documentElement.style.setProperty('--a1', r.colors.a1);
  document.documentElement.style.setProperty('--a2', r.colors.a2);
  document.body.classList.toggle('is-book', isBook);
  $('head').innerHTML = r.head;
  $('top').innerHTML = r.main;
  $('foot').innerHTML = r.foot;
  // заголовок вкладки, собранный для поисковиков (scripts/site-seo.mjs), не перебиваем — он полнее
  if (!(seoPage && !readKey && !privacyPage && !cabPage)) document.title = r.title;
  canonical(isBook ? '/kniga/' + encodeURIComponent(bookKey) + '/' : readKey || privacyPage || cabPage ? '' : '/');
  try { sessionStorage.removeItem('siteReload'); } catch { /* без хранилища */ }
  watchCta();
  if (cabOn) cab?.after(normalize(current), shownImgs, bookKey, () => show(current, shownImgs));
  let done = false;
  try { done = localStorage.getItem('lanaSite.subscribed') || ''; } catch { /* без памяти */ }
  const f = document.querySelector('[data-sub]');
  if (done && f && !preview) {
    f.querySelector('.sub-row').hidden = true;
    f.querySelector('.consent').hidden = true;
    const m = f.querySelector('.sub-msg'); m.hidden = false; m.innerHTML = done === 'wait' ? waitHtml(normalize(current)) : giftHtml(normalize(current));
  }
  pismoNote(normalize(current));
  reader();
  setTimeout(popArm, 0);
  const d = document.querySelector('meta[name="description"]');
  if (d && r.description) d.setAttribute('content', r.description);
}

// Читалка фрагмента: размер шрифта, ночь, полоска прогресса, место чтения — запоминаются в этом браузере
const RD = 'lanaSite.rd';
const rdGet = () => { try { return JSON.parse(localStorage.getItem(RD) || '{}'); } catch { return {}; } };
const rdSet = (p) => { try { localStorage.setItem(RD, JSON.stringify({ ...rdGet(), ...p })); } catch { /* без памяти */ } };
let rdScroll = null;
function reader() {
  const art = document.querySelector('.rd-txt');
  document.body.classList.toggle('is-reader', !!art);
  if (rdScroll) { removeEventListener('scroll', rdScroll); rdScroll = null; }
  if (!art) { document.body.classList.remove('rd-night'); return; }
  const st = rdGet();
  const apply = () => { const s = rdGet(); if (s.fs) art.style.setProperty('--rd-fs', s.fs + 'px'); else art.style.removeProperty('--rd-fs'); document.body.classList.toggle('rd-night', !!s.night); };
  apply();
  const bar = document.querySelector('.rd-prog i');
  let saveT = 0;
  rdScroll = () => {
    const r = art.getBoundingClientRect(), total = r.height - innerHeight * 0.6;
    const k = Math.max(0, Math.min(1, -r.top / Math.max(1, total)));
    if (bar) bar.style.width = (k * 100).toFixed(1) + '%';
    clearTimeout(saveT); saveT = setTimeout(() => rdSet({ pos: { ...(rdGet().pos || {}), [readKey]: k } }), 400);
  };
  addEventListener('scroll', rdScroll, { passive: true });
  const k = st.pos?.[readKey] || 0;
  if (k > 0.02 && k < 0.98) requestAnimationFrame(() => { const r = art.getBoundingClientRect(); scrollTo(0, scrollY + r.top + k * (r.height - innerHeight * 0.6)); });
  rdScroll();
  document.querySelector('.rd-tools').onclick = (e) => {
    const b = e.target.closest('[data-rd]'); if (!b) return;
    const s = rdGet();
    if (b.dataset.rd === 'night') rdSet({ night: !s.night });
    else rdSet({ fs: Math.max(15, Math.min(26, (s.fs || parseFloat(getComputedStyle(art).fontSize) || 19) + (b.dataset.rd === 'plus' ? 1 : -1))) });
    apply();
  };
}

// Кнопка «Читать» внизу экрана на телефоне — только когда главная кнопка книги ушла из виду
let ctaObs = null;
function watchCta() {
  ctaObs?.disconnect();
  document.body.classList.remove('cta-off');
  const main = document.querySelector('.bk-top .btn-dark');
  if (!main || !('IntersectionObserver' in window)) return;
  ctaObs = new IntersectionObserver(([e]) => document.body.classList.toggle('cta-off', !e.isIntersecting && e.boundingClientRect.top < 0));
  ctaObs.observe(main);
}

// после загрузки главной по ссылке «./#блок» — доскроллить до блока
function toHash() {
  if (bookKey || !location.hash || location.hash.length < 2) return;
  document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

const SHOPS = /litnet|litres|litmarket|litgorod|author\.today|bookmate|ozon|wildberries/i;
document.addEventListener('click', (e) => {
  const out = e.target.closest('a[href^="http"]');
  if (out && !preview) {
    const h = out.hostname || '';
    if (out.closest('.sub-msg')) goal('gift');
    else if (/t\.me|telegram/i.test(h)) goal('telegram');
    else if (SHOPS.test(h)) goal('read', { book: bookKey || 'glavnaya', shop: h.replace(/^www\./, '') });
  }
  // меню на телефоне: открыть/закрыть; нажали пункт — закрылось
  const btn = e.target.closest('.menu-btn');
  const nav = $('mnav');
  if (btn && nav) { nav.hidden = !nav.hidden; btn.setAttribute('aria-expanded', String(!nav.hidden)); return; }
  if (nav && e.target.closest('.mnav a')) { nav.hidden = true; document.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false'); }
  // «Все книги»: фильтр по циклам
  const chip = e.target.closest('.chip');
  if (chip) {
    const box = chip.closest('section');
    box.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === chip)));
    box.querySelectorAll('.grid .card').forEach((x) => { x.hidden = !!chip.dataset.g && x.dataset.g !== chip.dataset.g; });
    return;
  }
  // в предпросмотре админки ссылки не уводят со страницы
  if (preview) {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    const h = a.getAttribute('href') || '';
    if (h.includes('#')) document.getElementById(h.split('#')[1])?.scrollIntoView({ behavior: 'smooth' });
  }
});

// Подписка: почта → база; сразу показываем подарок. Уже подписанным — тоже подарок, без повторной формы
const SUBD = 'lanaSite.subscribed';
// свой сервис писем: сначала письмо «Подтвердите подписку»
const waitHtml = (c) => esc(c.subWait || 'Проверьте почту: в письме — кнопка «Подтвердить».');
// пришли по ссылке из письма: ?pismo=ok (подтвердила) | unsub (отписалась) | net (ссылка устарела)
const pismo = qs.get('pismo') || '';
if (pismo && !preview) {
  try { if (pismo === 'ok') localStorage.setItem(SUBD, '1'); if (pismo === 'unsub') localStorage.removeItem(SUBD); } catch { /* без памяти */ }
  history.replaceState(null, '', location.pathname + location.search.replace(/[?&]pismo=[^&]*/, '').replace(/^&/, '?') + location.hash);
}
function pismoNote(c) {
  if (!pismo || preview || document.querySelector('.pismo')) return;
  const t = { ok: c.pismoOk || c.subDone || 'Подписка подтверждена.', unsub: c.pismoUnsub || 'Вы отписались — писем больше не будет.', net: c.pismoNet || 'Ссылка устарела. Оставьте почту на сайте ещё раз.' }[pismo];
  if (!t) return;
  const n = document.createElement('div');
  n.className = 'pismo'; n.setAttribute('role', 'status'); n.textContent = t;
  document.body.appendChild(n);
  setTimeout(() => n.classList.add('out'), 7000);
  setTimeout(() => n.remove(), 8000);
}
function giftHtml(c) {
  const u = safeUrl(c.giftUrl);
  return `${esc(c.subDone || 'Готово, спасибо!')}${u ? ` <a class="btn btn-dark" href="${esc(u)}" target="_blank" rel="noopener">Скачать «${esc(c.giftName || 'книгу')}»</a>` : ''}`;
}
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-sub]');
  if (!f) return;
  e.preventDefault();
  const msg = f.querySelector('.sub-msg');
  const email = f.email.value.trim();
  const say = (html, bad) => { msg.hidden = false; msg.classList.toggle('bad', !!bad); msg.innerHTML = html; };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say('Проверьте почту — в адресе ошибка.', true);
  if (!f.ok.checked) return say('Поставьте галочку согласия — без неё не могу присылать письма.', true);
  if (preview) return say(giftHtml(normalize(current)));
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    const from = f.dataset.from === 'popup' ? 'okno' : '';
    const res = await subscribe(normalize(current), email, (from ? from + ':' : '') + (bookKey ? 'kniga:' + bookKey : 'glavnaya'));
    try { localStorage.setItem(SUBD, res.confirm ? 'wait' : '1'); } catch { /* без памяти */ }
    goal('subscribe', { from: from || bookKey || 'glavnaya' });
    if (from) setTimeout(() => popClose(false), 6000);
    f.querySelector('.sub-row').hidden = true;
    f.querySelector('.consent').hidden = true;
    say(res.confirm ? waitHtml(normalize(current)) : giftHtml(normalize(current)));
  } catch {
    say('Не получилось отправить — проверьте интернет и нажмите ещё раз.', true);
  } finally { btn.disabled = false; }
});

if (preview) {
  // Предпросмотр в админке: содержимое и что показать (главную или книгу) приходят из окна админки
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.kind !== 'site') return;
    const was = bookKey;
    bookKey = e.data.book || '';
    const y = scrollY;
    show(e.data.content, e.data.imgs);
    if (was === bookKey) scrollTo(0, y); else scrollTo(0, 0);
    if (e.data.goto && !bookKey) document.getElementById(e.data.goto)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  parent.postMessage({ kind: 'ready' }, location.origin);
} else {
  let cached = null;
  if (!LOCAL) try { cached = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { /* нет кэша */ }
  if (cached) { show(cached.content, cached.imgs); toHash(); }
  // свежее с сервера; не вышло (сеть мигнула) — ещё две попытки, чтобы не застрять на старом из памяти браузера
  const fresh = (n) => loadPublic(cached?.imgs || {}).then((d) => {
    show(d.content, d.imgs);
    if (!cached) toHash();
    if (!LOCAL) {
      try { localStorage.setItem(CACHE, JSON.stringify(d)); }
      catch { try { localStorage.setItem(CACHE, JSON.stringify({ content: d.content, imgs: {} })); } catch { /* места мало — без кэша */ } }
    }
  }).catch(() => { if (n < 2) setTimeout(() => fresh(n + 1), 2500 * (n + 1)); else if (!cached) { show(null, {}); toHash(); } });
  fresh(0);
  // вернулась во вкладку сайта (например, после правки в админке) — подтягиваем свежее; страница не прыгает
  let freshAt = Date.now();
  // вышла новая версия сайта — открытая давно вкладка перезагрузится сама (иначе так и показывает старое)
  const MY_V = (/[?&]v=([^&]+)/.exec(import.meta.url) || [])[1] || '';
  const checkVersion = async () => {
    if (!MY_V || MY_V === '__V__' || LOCAL || document.activeElement?.matches?.('input,textarea') || popEl) return false;
    try {
      const t = await (await fetch(location.pathname + '?vc=' + Date.now(), { cache: 'no-store' })).text();
      const v = (/site\.js\?v=([^"'&]+)/.exec(t) || [])[1];
      if (v && v !== MY_V) { location.reload(); return true; }
    } catch { /* нет сети — проверим позже */ }
    return false;
  };
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || Date.now() - freshAt < 5000) return;
    freshAt = Date.now();
    if (await checkVersion()) return;
    loadPublic(shownImgs).then((d) => {
      if (JSON.stringify(d.content) === JSON.stringify(current)) return;
      const y = scrollY;
      show(d.content, d.imgs); scrollTo(0, y);
      if (!LOCAL) try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* места мало — без кэша */ }
    }).catch(() => {});
  });
}

// Окно подписки (09.11.2026, владелица: «стильный попап… по времени и по содержанию как топовый маркетолог»).
// Правила: не сразу — после 40 с на сайте (время копится по страницам за визит, админка → Подписка → «Через сколько секунд»);
// на компьютере — раньше, если курсор уходит к вкладкам (хочет уйти), но не раньше 15 с; один раз за визит; закрыли — 14 дней не показываем;
// в читалке — только когда дочитала фрагмент до конца; не показываем подписанным, на политике, в предпросмотре и когда форма подписки уже на экране.
// (переменные окна подписки объявлены в начале файла — show() вызывается раньше, чем код дойдёт сюда)
function popAllowed(c) {
  if (preview || privacyPage || cabPage || popEl || c.subOn === false || c.popOn === false) return false;
  try {
    if (localStorage.getItem(SUBD)) return false;
    const off = Number(localStorage.getItem(POP) || 0);
    if (off && Date.now() - off < POP_DAYS * 864e5) return false;
  } catch { /* без памяти — показываем по обычным правилам */ }
  return !ss.get(POP);
}
function popArm() {
  clearTimeout(popT);
  if (popIO) { popIO.disconnect(); popIO = null; }
  if (popExit) { document.removeEventListener('mouseout', popExit); popExit = null; }
  const c = normalize(current);
  if (!popAllowed(c)) return;
  // читалка: не мешаем читать — окно, когда дочитала до «Конца фрагмента» (самый тёплый момент)
  if (readKey) {
    const end = document.querySelector('.rd-end');
    if (end && 'IntersectionObserver' in window) {
      // форма подписки под фрагментом уступает место окну (не дублируем); закрыла окно — форма вернётся
      const box = document.getElementById('podpiska'); if (box) box.hidden = true;
      // дочитала до конца и не ушла сразу на Литнет (4 с) — тогда предлагаем подписку
      popIO = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { popIO.disconnect(); popIO = null; popT = setTimeout(() => popOpen('read'), 4000); } }, { threshold: 0.4 });
      popIO.observe(end);
    }
    return;
  }
  const need = Math.max(15, Number(c.popDelay) || 40) * 1000;
  popT = setTimeout(() => popOpen('time'), Math.max(1000, need - popSpent()));
  if (matchMedia('(hover:hover) and (pointer:fine)').matches) {
    popExit = (e) => { if (!e.relatedTarget && e.clientY <= 4 && popSpent() > 15000) popOpen('exit'); };
    document.addEventListener('mouseout', popExit);
  }
}
function popOpen(why) {
  const c = normalize(current);
  if (!popAllowed(c)) return;
  // форма подписки уже на экране — не дублируем, попробуем чуть позже
  const inline = document.getElementById('podpiska')?.getBoundingClientRect();
  if (inline && inline.top < innerHeight && inline.bottom > 0) { if (why === 'time') popT = setTimeout(() => popOpen('time'), 20000); return; }
  ss.set(POP, '1');
  const head = c.popHead || (c.giftName ? `«${c.giftName}» *в подарок*` : c.subHead || 'Новые книги *первой*');
  const text = c.popText || c.subText || '';
  const el = document.createElement('div');
  el.className = 'pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-labelledby', 'pop-h');
  const f = (t) => esc(t).replace(/\*([^*\n]+)\*/g, '<span class="it">$1</span>');
  el.innerHTML = `<button class="pop-x" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    <img class="pop-bear" src="hero-bear-round.jpg?6" alt="" aria-hidden="true">
    ${c.subTitle ? `<div class="lbl">${esc(c.subTitle)}</div>` : ''}
    <h2 id="pop-h">${f(head)}</h2>
    ${text ? `<p class="pop-t">${f(text)}</p>` : ''}
    <form class="sub-f" data-sub data-from="popup" novalidate>
      <div class="sub-row"><input type="email" name="email" required autocomplete="email" placeholder="Ваша почта" aria-label="Ваша почта"><button class="btn btn-dark" type="submit">${esc(c.subBtn || 'Подписаться')}</button></div>
      <label class="consent"><input type="checkbox" name="ok" required> <span>${esc(c.consent || 'Соглашаюсь получать письма')}${c.privacy ? ' — <a href="./?privacy">политика конфиденциальности</a>' : ''}</span></label>
      <p class="sub-msg" role="status" hidden></p>
    </form>`;
  document.body.appendChild(el);
  popEl = el;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  el.querySelector('.pop-x').onclick = () => popClose(true);
  goal('popup', { why });
}
function popClose(byHand) {
  if (!popEl) return;
  if (byHand) { try { localStorage.setItem(POP, String(Date.now())); } catch { /* без памяти */ } }
  const el = popEl; popEl = null;
  const box = document.getElementById('podpiska'); if (box && box.hidden) box.hidden = false;
  el.classList.remove('on');
  setTimeout(() => el.remove(), 500);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popEl) popClose(true); });

// Один адрес страницы для поисковиков: ./?kniga=… и /kniga/…/ — одна и та же книга (на предпросмотре и в кабинете — не трогаем)
function canonical(path) {
  if (preview || !/lanafreitag\.ru$/.test(location.hostname)) return;
  let l = document.querySelector('link[rel="canonical"]');
  if (!path) { l?.remove(); return; }
  if (!l) { l = document.createElement('link'); l.rel = 'canonical'; document.head.appendChild(l); }
  l.href = location.origin + path;
}
// На страницах /kniga/…/ стоит <base href="/">: ссылки «#раздел» иначе уводили бы на главную — прокручиваем на месте
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[href^="#"]');
  if (!a || preview || !document.querySelector('base')) return;
  const el = document.getElementById(a.getAttribute('href').slice(1));
  if (!el) return; // раздела на этой странице нет (например, полка книг) — пусть ведёт на главную
  e.preventDefault();
  el.scrollIntoView({ behavior: 'smooth' });
});
