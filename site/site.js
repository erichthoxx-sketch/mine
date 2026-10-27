// Сайт автора: главная или страница книги (?kniga=адрес). Сначала — сохранённое в браузере (мгновенно), потом свежее.
import { renderSite, renderBook, DEFAULT_CONTENT } from './content.js';
import { loadPublic, LOCAL } from './data.js';

const CACHE = 'lanaSite.cache';
const $ = (id) => document.getElementById(id);
const preview = new URLSearchParams(location.search).has('preview');
let bookKey = new URLSearchParams(location.search).get('kniga') || '';

function show(content, imgs) {
  let r = bookKey ? renderBook(content || DEFAULT_CONTENT, imgs || {}, bookKey) : null;
  const isBook = !!r;
  if (!r) r = renderSite(content || DEFAULT_CONTENT, imgs || {}); // книги нет (скрыли, сменили адрес) — главная
  document.documentElement.style.setProperty('--a1', r.colors.a1);
  document.documentElement.style.setProperty('--a2', r.colors.a2);
  document.body.classList.toggle('is-book', isBook);
  $('head').innerHTML = r.head;
  $('top').innerHTML = r.main;
  $('foot').innerHTML = r.foot;
  document.title = r.title;
  watchCta();
  const d = document.querySelector('meta[name="description"]');
  if (d && r.description) d.setAttribute('content', r.description);
}

// Кнопка «Читать» внизу экрана на телефоне — только когда главная кнопка книги ушла из виду
let ctaObs = null;
function watchCta() {
  ctaObs?.disconnect();
  document.body.classList.remove('cta-off');
  const main = document.querySelector('.bk-hero .btn-dark');
  if (!main || !('IntersectionObserver' in window)) return;
  ctaObs = new IntersectionObserver(([e]) => document.body.classList.toggle('cta-off', !e.isIntersecting && e.boundingClientRect.top < 0));
  ctaObs.observe(main);
}

// после загрузки главной по ссылке «./#блок» — доскроллить до блока
function toHash() {
  if (bookKey || !location.hash || location.hash.length < 2) return;
  document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

document.addEventListener('click', (e) => {
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
