// Сайт автора: главная или страница книги (?kniga=адрес). Сначала — сохранённое в браузере (мгновенно), потом свежее.
import { renderSite, renderBook, renderPrivacy, DEFAULT_CONTENT, normalize, safeUrl, esc } from './content.js';
import { loadPublic, addSub, LOCAL } from './data.js';

const CACHE = 'lanaSite.cache';
const $ = (id) => document.getElementById(id);
const preview = new URLSearchParams(location.search).has('preview');
let bookKey = new URLSearchParams(location.search).get('kniga') || '';
const privacyPage = new URLSearchParams(location.search).has('privacy');
let current = null; // что сейчас на экране — нужно форме подписки (подарок, текст «готово»)
let shownImgs = {};
// Прототип личного кабинета: только по ссылке ./?proto (дальше помнится в этой вкладке); читатели его не видят
const qs = new URLSearchParams(location.search);
let proto = false;
try { if (qs.has('proto')) sessionStorage.setItem('lanaSite.proto', '1'); proto = sessionStorage.getItem('lanaSite.proto') === '1'; } catch { /* без памяти — без прототипа */ }
let cab = null; // подгружается отдельно — основной сайт его не ждёт
if (proto && !preview) import('./cabinet.js' + ((/\?v=[^&]+/.exec(import.meta.url) || [''])[0])).then((m) => { cab = m; if (current) show(current, shownImgs); }).catch(() => {});
const cabPage = qs.has('kabinet') ? 'kabinet' : qs.get('chitat') ? 'chitat' : '';

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
  let r = bookKey ? renderBook(current, imgs || {}, bookKey) : privacyPage ? renderPrivacy(current, imgs || {}) : null;
  const isBook = !!r && !!bookKey;
  if (!r) r = renderSite(content || DEFAULT_CONTENT, imgs || {}); // книги нет (скрыли, сменили адрес) — главная
  shownImgs = imgs || {};
  const cp = cab && cabPage ? cab.page(normalize(current), shownImgs, cabPage, qs.get('chitat')) : null;
  if (cp) r = { ...r, main: cp.main, title: cp.title };
  document.body.classList.toggle('is-reader', !!cp?.reader);
  document.documentElement.style.setProperty('--a1', r.colors.a1);
  document.documentElement.style.setProperty('--a2', r.colors.a2);
  document.body.classList.toggle('is-book', isBook);
  $('head').innerHTML = r.head;
  $('top').innerHTML = r.main;
  $('foot').innerHTML = r.foot;
  document.title = r.title;
  try { sessionStorage.removeItem('siteReload'); } catch { /* без хранилища */ }
  watchCta();
  cab?.after(normalize(current), shownImgs, bookKey, () => show(current, shownImgs));
  let done = false;
  try { done = localStorage.getItem('lanaSite.subscribed') === '1'; } catch { /* без памяти */ }
  const f = document.querySelector('[data-sub]');
  if (done && f && !preview) {
    f.querySelector('.sub-row').hidden = true;
    f.querySelector('.consent').hidden = true;
    const m = f.querySelector('.sub-msg'); m.hidden = false; m.innerHTML = giftHtml(normalize(current));
  }
  const d = document.querySelector('meta[name="description"]');
  if (d && r.description) d.setAttribute('content', r.description);
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
    await addSub(email, bookKey ? 'kniga:' + bookKey : 'glavnaya');
    try { localStorage.setItem(SUBD, '1'); } catch { /* без памяти */ }
    goal('subscribe', { from: bookKey || 'glavnaya' });
    f.querySelector('.sub-row').hidden = true;
    f.querySelector('.consent').hidden = true;
    say(giftHtml(normalize(current)));
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
  loadPublic().then((d) => {
    show(d.content, d.imgs);
    if (!cached) toHash();
    if (!LOCAL) try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* места мало — без кэша */ }
  }).catch(() => { if (!cached) { show(null, {}); toHash(); } });
}
