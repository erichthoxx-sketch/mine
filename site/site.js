// Сайт автора: показывает содержимое из админки. Сначала — сохранённое в браузере (мгновенно), потом свежее.
import { renderSite, DEFAULT_CONTENT } from './content.js';
import { loadPublic, LOCAL } from './data.js';

const CACHE = 'lanaSite.cache';
const $ = (id) => document.getElementById(id);

function show(content, imgs) {
  const r = renderSite(content || DEFAULT_CONTENT, imgs || {});
  document.documentElement.style.setProperty('--a1', r.colors.a1);
  document.documentElement.style.setProperty('--a2', r.colors.a2);
  $('head').innerHTML = r.head;
  $('top').innerHTML = r.main;
  $('foot').innerHTML = r.foot;
  document.title = r.title;
}

// Меню на телефоне: открыть/закрыть; нажали пункт — закрылось
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.menu-btn');
  const nav = $('mnav');
  if (!nav) return;
  if (btn) { nav.hidden = !nav.hidden; btn.setAttribute('aria-expanded', String(!nav.hidden)); return; }
  if (e.target.closest('.mnav a')) { nav.hidden = true; document.querySelector('.menu-btn')?.setAttribute('aria-expanded', 'false'); }
});

// Предпросмотр в админке: содержимое приходит из окна админки, ничего не грузим
if (new URLSearchParams(location.search).has('preview')) {
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.kind !== 'site') return;
    const y = scrollY;
    show(e.data.content, e.data.imgs);
    scrollTo(0, y);
    if (e.data.goto) document.getElementById(e.data.goto)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  parent.postMessage({ kind: 'ready' }, location.origin);
} else {
  let cached = null;
  if (!LOCAL) try { cached = JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { /* нет кэша */ }
  if (cached) show(cached.content, cached.imgs);
  loadPublic().then((d) => {
    show(d.content, d.imgs);
    if (!LOCAL) try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* места мало — без кэша */ }
  }).catch(() => { if (!cached) show(null, {}); });
}
