// Писательское приложение: книги (Google Диск), идеи, планер, маркетинг. Вход и база — общие с приложением доходов.
import { createStore, authErrorText } from '../../js/store.js';
import { installHandlers, esc, toast, acts, forms, watchForUpdates } from '../../js/ui.js';
import { todayISO, lastSaleDate, bookIdFor } from '../../js/calc.js';
import { written } from './wcalc.js';
import * as drive from './drive.js';
import { ic } from '../../js/icons.js';
import { booksView, bookPage, refreshAll } from './views/books.js';
import { ideasView } from './views/ideas.js';
import { planView } from './views/plan.js';
import { marketingView } from './views/marketing.js';
import { settingsView } from './views/settings.js';

export const WCOLLS = ['w_books', 'w_ideas', 'w_contests', 'w_queue', 'w_waiting', 'w_media'];
const store = createStore({ colls: [...WCOLLS, 'sales', 'books', 'campaigns', 'reports', 'days'], localKey: 'authorWriter.v1' });
const ui = { route: '/', planTab: 'books', ideaQ: '', ideaBook: '', ideaSt: 'active', openIdea: null, mBook: '' };
let theme = 'auto';
try { theme = localStorage.getItem('theme') || 'auto'; } catch { /* ок */ }

const app = {
  store, ui, drive,
  get theme() { return theme; },
  setTheme(t) { theme = t; try { localStorage.setItem('theme', t); } catch { /* ок */ } applyTheme(); render(); },
  rerender: () => render(),
  go(path) { ui.route = path; render(); window.scrollTo(0, 0); },
  ctx: () => getCtx(),
};
window.__app = app;
function applyTheme() { const r = document.documentElement; if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme); }

let cache = null, cacheKey = '';
function getCtx() {
  const d = store.data, today = todayISO();
  const key = [store.version || 0, today].join('|');
  if (cache && key === cacheKey) return cache;
  const rank = (x) => (x.status === 'done' ? 2 : x.status === 'idea' ? 1 : 0); // в процессе → идеи → завершённые
  const wbooks = [...d.w_books].sort((a, b) => rank(a) - rank(b) || (a.title || '').localeCompare(b.title || '', 'ru'));
  const incomeById = Object.fromEntries(d.books.map((b) => [b.id, b]));
  cache = {
    data: d, settings: d.settings, today, wbooks,
    wbooksById: Object.fromEntries(wbooks.map((b) => [b.id, b])),
    incomeBooks: d.books, incomeById,
    // книга доходов для книги-рукописи: выбранная вручную или совпадающая по названию
    incomeIdOf: (b) => b.incomeBookId || (incomeById[bookIdFor(b.title || '')] ? bookIdFor(b.title) : ''),
    writtenToday: wbooks.reduce((a, b) => a + written(b.history, today, 1), 0),
    writtenWeek: wbooks.reduce((a, b) => a + written(b.history, today, 7), 0),
    dataEnd: (() => { const l = lastSaleDate(d.sales); return l && l < today ? l : today; })(),
  };
  cacheKey = key;
  return cache;
}

const TABS = [['/', 'books', 'Книги'], ['/ideas', 'ideas', 'Идеи'], ['/plan', 'plan', 'Планер'], ['/marketing', 'marketing', 'Маркетинг']];
function route() {
  const [, a, b] = ('#' + (ui.route || '/')).split('/');
  if (a === 'book' && b) return { tab: '/', view: (x) => bookPage(x, decodeURIComponent(b)) };
  const map = { '': booksView, ideas: ideasView, plan: planView, marketing: marketingView, settings: settingsView };
  return { tab: '/' + (a || ''), view: map[a || ''] || booksView };
}

function authScreen() {
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Мастерская</h1><p class="muted">Вход тот же, что в приложении доходов: ваша почта и пароль.</p>
  <form data-form="auth"><label for="em">Электронная почта</label><input id="em" name="email" type="email" autocomplete="email" required>
  <label for="pw">Пароль</label><input id="pw" name="pw" type="password" autocomplete="current-password" required minlength="6">
  <p id="authErr" class="down small" role="alert"></p>
  <div class="row"><button class="primary" type="submit" name="mode" value="in">Войти</button></div>
  <p><button type="button" class="link" data-act="auth.reset">Забыли пароль?</button></p></form></div>`;
}
forms.auth = async (fd) => {
  const err = document.getElementById('authErr'); err.textContent = '';
  try { await store.signIn(fd.get('email').trim(), fd.get('pw')); } catch (x) { err.textContent = authErrorText(x); }
};
acts['auth.reset'] = async () => {
  const email = (document.getElementById('em').value || '').trim();
  if (!email) { toast('Впишите адрес почты и нажмите ещё раз'); return; }
  try { await store.reset(email); toast('Письмо для смены пароля отправлено'); } catch (x) { toast(authErrorText(x)); }
};

let afterFn = null;
function render() {
  if (!store.user) { authScreen(); return; }
  const { tab, view } = route();
  const c = getCtx();
  let r;
  try { r = view(app) || { html: '' }; } catch (e) { console.error(e); r = { html: `<div class="card"><p>Ошибка экрана: ${esc(e.message)}</p></div>` }; }
  const sync = store.mode === 'local' ? '' : store.sync === 'pending' ? 'сохраняется…' : store.sync === 'error' ? 'ошибка синхронизации' : navigator.onLine ? 'синхронизировано' : 'нет сети';
  document.getElementById('app').innerHTML = `${store.mode === 'local' ? '<div class="demo">Пробный режим: данные только в этом браузере.</div>' : ''}
  <div class="top"><div><h1>Мастерская</h1><small>${esc(c.settings.pseudonym)}${sync ? ' · ' + sync : ''}</small></div>
  <div class="row"><a class="btn" href="../">${ic('ruble')} Доходы</a><button data-act="go" data-to="/settings" aria-label="Настройки" title="Настройки">${ic('settings')}</button><button data-act="theme.toggle" aria-label="Тема" title="Тема">${ic(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto')}</button></div></div>
  <main>${r.html}</main>
  <nav class="tabs">${TABS.map(([h, i, t]) => `<a href="#" data-act="go" data-to="${h}" class="${tab === h ? 'on' : ''}"><b>${ic(i)}</b>${t}</a>`).join('')}</nav>`;
  afterFn = r.after || null;
  afterFn?.();
}
acts.go = (d) => { ui.route = d.to; window.scrollTo(0, 0); };
acts['theme.toggle'] = () => app.setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[theme]);

let pending = false;
function safeRender() {
  const ae = document.activeElement;
  if (ae && ae.closest?.('main') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) { pending = true; return; }
  render();
}
document.addEventListener('focusout', () => { if (pending) setTimeout(() => { const a = document.activeElement; if (!a?.closest?.('main') || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { pending = false; render(); } }, 150); });
window.addEventListener('online', render); window.addEventListener('offline', render);

installHandlers(() => render());
watchForUpdates();
try { sessionStorage.removeItem('staleReload'); } catch { /* нет доступа к памяти браузера */ }
applyTheme();
store.subscribe(() => safeRender());
drive.preload().catch(() => {});
let autoRefreshed = false;
store.init().then(() => {
  render();
  // при открытии один раз обновляем знаки книг, если Диск подключён
  const tryRefresh = () => {
    if (autoRefreshed || !store.user || !drive.hasFreshToken() || !store.data.w_books.length) return;
    autoRefreshed = true;
    refreshAll(app, { quiet: true }).catch(() => {});
  };
  store.subscribe(tryRefresh); tryRefresh();
  // вернулись в приложение — подтягиваем знаки, если доступ к Диску ещё действует
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && drive.hasFreshToken()) refreshAll(app, { quiet: true }).catch(() => {}); });
}).catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Не удалось запустить</h1><p>${esc(e.message || e)}</p></div>`;
});
