// Приложение «Директ»: реклама книг в Яндекс Директе — кампании, расход, запросы, минус-фразы, ставки,
// учебник и ИИ-помощник. Вход и база — общие с «Доходами» и «Мастерской».
import { createStore, authErrorText } from '../../js/store.js';
import { initAccent } from '../../js/accent.js';
import { installHandlers, esc, toast, acts, forms, watchForUpdates, keepPlace, tidyNums } from '../../js/ui.js';
import { todayISO } from '../../js/calc.js';
import { ic } from '../../js/icons.js';
import { takeTokenFromUrl, OUTAGE_TEXT } from './api.js';
import { refresh, refreshMetrika } from './sync.js';
import { demo, snap, demoLog } from './demo.js';
import { homeView } from './views/home.js';
import { launchView } from './views/launch.js';
import { qualityView } from './views/quality.js';
import { campaignView } from './views/campaign.js';
import { learnView } from './views/learn.js';
import { analyticsView } from './views/analytics.js';
import { aiView } from './views/ai.js';
import { logView } from './views/log.js';
import { settingsView } from './views/settings.js';

const store = createStore({ colls: ['d_snap', 'd_log', 'campaigns', 'reports', 'books', 'days', 'sales'], localKey: 'authorDirect.v1' });
initAccent(store); // цвет акцентов — общий для всех приложений (выбирается в Мастерской)
const ui = { route: '/', cTab: 'queries', lTab: '', lesson: '', demo: false, busy: '' };
keepPlace(ui, ['cTab', 'lTab', 'demo']);
let theme = 'auto';
try { theme = localStorage.getItem('theme') || 'auto'; } catch { /* ок */ }

const app = {
  store, ui,
  get theme() { return theme; },
  setTheme(t) { theme = t; try { localStorage.setItem('theme', t); } catch { /* ок */ } applyTheme(); render(); },
  rerender: () => render(),
  go(path) { ui.route = path; render(); window.scrollTo(0, 0); },
  ctx: () => ({ data: store.data, settings: store.data.settings, today: todayISO() }),
  snap: (id) => snap(app, id),
};
window.__app = app;
function applyTheme() { const r = document.documentElement; if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme); }

// Пример включён, пока Директ не подключён (и всегда в пробном режиме на компьютере разработчика)
async function syncDemo() {
  const on = !store.data.settings.directToken && (store.mode === 'local' || ui.demo);
  if (on && !demo.on) { demo.on = true; demo.log = demoLog(todayISO()); await refresh(app); } else if (!on && demo.on) { demo.on = false; demo.docs = {}; }
}

// Загрузить свежие данные из Директа (кнопка «Обновить» и раз в 30 минут при открытии)
let retryT = null;
export async function reload({ quiet = false } = {}) {
  if (ui.busy) return;
  ui.busy = 'Загружаю…'; render();
  // последняя ошибка загрузки хранится в настройках — по ней «Настройка шаг за шагом» подсказывает, что не так
  const d = () => store.data.settings.direct || {};
  try {
    await refresh(app, { onStep: (t) => { ui.busy = t; render(); } });
    if (d().lastError && !demo.on) await store.saveSettings({ direct: { ...d(), lastError: null } });
    if (!quiet) toast('Данные обновлены');
  } catch (e) {
    console.error(e);
    // при ограничении по частоте повторяем позже, не заставляя владелицу вручную обновлять страницу
    toast(e.rateLimited ? 'Яндекс ограничил частоту запросов. Приложение попробует снова само.' : e.transient ? OUTAGE_TEXT : e.message || String(e));
    if (e.transient) { clearTimeout(retryT); retryT = setTimeout(() => reload({ quiet: true }), 15 * 60000); }
    if (!demo.on) await store.saveSettings({ direct: { ...d(), lastError: { code: e.code || null, text: e.message || String(e), transient: !!e.transient, at: new Date().toISOString() } } }).catch(() => {});
  }
  // Метрика — отдельно: работает, даже если Директ ещё не одобрил заявку или отказал
  try { ui.busy = 'Метрика…'; render(); await refreshMetrika(app); } catch (e) { console.warn(e); if (!quiet) toast(e.transient ? OUTAGE_TEXT : e.message || String(e)); }
  finally { ui.busy = ''; render(); }
}
app.reload = reload;
acts['d.reload'] = () => { reload(); return false; };

const TABS = [['/', 'ads', 'Обзор'], ['/an', 'data', 'Аналитика'], ['/learn', 'books', 'Учёба'], ['/ai', 'sparkle', 'ИИ'], ['/log', 'receipt', 'История']];
function route() {
  const [, a, b] = ('#' + (ui.route || '/')).split('/');
  if (a === 'c' && b) return { tab: '/', view: (x) => campaignView(x, Number(decodeURIComponent(b))) };
  const map = { '': homeView, launch: launchView, quality: qualityView, an: analyticsView, learn: learnView, ai: aiView, log: logView, settings: settingsView };
  return { tab: ['launch', 'quality'].includes(a) ? '/' : '/' + (a || ''), view: map[a || ''] || homeView };
}

function authScreen() {
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Директ</h1><p class="muted">Вход тот же, что в «Доходах»: ваша почта и пароль.</p>
  <form data-form="auth"><label for="em">Электронная почта</label><input id="em" name="email" type="email" autocomplete="email" required>
  <label for="pw">Пароль</label><input id="pw" name="pw" type="password" autocomplete="current-password" required minlength="6">
  <p id="authErr" class="down small" role="alert"></p>
  <div class="row"><button class="primary" type="submit">Войти</button></div></form></div>`;
}
forms.auth = async (fd) => {
  const err = document.getElementById('authErr'); err.textContent = '';
  try { await store.signIn(fd.get('email').trim(), fd.get('pw')); } catch (x) { err.textContent = authErrorText(x); }
};

let afterFn = null;
function render() {
  if (!store.user) { authScreen(); return; }
  const { tab, view } = route();
  const c = app.ctx();
  let r;
  try { r = view(app) || { html: '' }; } catch (e) { console.error(e); r = { html: `<div class="card"><p>Ошибка экрана: ${esc(e.message)}</p></div>` }; }
  const main = app.snap('main');
  const sub = demo.on ? 'пример данных' : ui.busy ? ui.busy : main?.at ? 'обновлено ' + new Date(main.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'не подключён';
  document.getElementById('app').innerHTML = `${store.mode === 'local' ? '<div class="demo">Пробный режим: данные только в этом браузере.</div>' : ''}
  <div class="top"><div><h1>Директ</h1><small>${esc(c.settings.pseudonym)} · ${esc(sub)}${c.settings.direct?.sandbox && !demo.on ? ' · песочница' : ''}</small></div>
  <div class="row">${!demo.on && c.settings.directToken ? `<button data-act="d.reload" aria-label="Обновить" title="Обновить данные"${ui.busy ? ' disabled' : ''}>${ic('refresh')}</button>` : ''}<button data-act="go" data-to="/settings" aria-label="Настройки" title="Настройки">${ic('settings')}</button><button data-act="theme.toggle" aria-label="Тема" title="Тема">${ic(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto')}</button></div></div>
  <main>${tidyNums(r.html)}</main>
  <nav class="tabs">${TABS.map(([h, i, t]) => `<a href="#" data-act="go" data-to="${h}" class="${tab === h ? 'on' : ''}" title="${t}"><b>${ic(i)}</b><span class="nl">${t}</span></a>`).join('')}<button class="nav-toggle" data-act="nav.mini" aria-label="Свернуть или развернуть меню" title="Свернуть меню">${ic('chevron')}</button></nav>`;
  afterFn = r.after || null;
  afterFn?.();
}
acts.go = (d) => { ui.route = d.to; window.scrollTo(0, 0); };
acts['theme.toggle'] = () => app.setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[theme]);
let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => afterFn?.(), 150); });

let pending = false;
function safeRender() {
  const ae = document.activeElement;
  if (ae && ae.closest?.('main') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) { pending = true; return; }
  render();
}
document.addEventListener('focusout', () => { if (pending) setTimeout(() => { const a = document.activeElement; if (!a?.closest?.('main') || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { pending = false; render(); } }, 150); });

installHandlers(() => render());
watchForUpdates();
try { sessionStorage.removeItem('staleReload'); } catch { /* ок */ }
applyTheme();
try { document.documentElement.classList.toggle('nav-mini', localStorage.getItem('navMini') === '1'); } catch { /* ок */ }
acts['nav.mini'] = () => { const on = document.documentElement.classList.toggle('nav-mini'); try { localStorage.setItem('navMini', on ? '1' : '0'); } catch { /* ок */ } };

// Вернулись со страницы входа Яндекса: ключ — в адресе страницы, сохраняем после входа в базу
// (если вход в приложение ещё не выполнен — ключ ждёт в памяти вкладки)
const fromYandex = takeTokenFromUrl();
if (fromYandex) {
  ui.route = '/settings';
  if (fromYandex.error) setTimeout(() => toast('Яндекс не дал доступ: ' + fromYandex.error), 500);
  else try { sessionStorage.setItem('dTok', JSON.stringify(fromYandex)); } catch { /* ок */ }
}
let saving = false;
async function savePendingToken() {
  let t = null;
  try { t = JSON.parse(sessionStorage.getItem('dTok') || 'null'); } catch { /* ок */ }
  if (!t?.token || !store.user || saving) return;
  saving = true;
  try {
    await store.saveSettings({ directToken: t.token, directTokenExp: t.exp });
    try { sessionStorage.removeItem('dTok'); } catch { /* ок */ }
    ui.demo = false; toast('Директ подключён'); reload({ quiet: true });
  } finally { saving = false; }
}

store.subscribe(() => { safeRender(); syncDemo().catch(console.error); savePendingToken().catch(console.error); });
store.init().then(async () => {
  await savePendingToken();
  await syncDemo();
  render();
  // при открытии подтягиваем свежие данные, если они старше 30 минут
  const at = app.snap('main')?.at;
  if (store.data.settings.directToken && (!at || Date.now() - Date.parse(at) > 30 * 60000)) reload({ quiet: true });
}).catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Не удалось запустить</h1><p>${esc(e.message || e)}</p></div>`;
});
