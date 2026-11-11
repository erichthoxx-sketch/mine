// Приложение «Директ»: контроль рекламы книг в Яндекс Директе — состояние кампаний, деньги и окупаемость,
// запросы, минус-фразы, площадки, сайт. Вход и база — общие с «Доходами» и «Мастерской».
import { createStore, authErrorText } from '../../js/store.js';
import { syncDirectAccessQuiet, autoDirectAccess } from '../../js/aidirect.js';
import { autoCohorts } from '../../js/cohorts.js';
import { initAccent } from '../../js/accent.js';
import { keepNavDown } from '../../js/vvfix.js';
import { installHandlers, esc, toast, acts, forms, watchForUpdates, keepPlace, tidyNums, ecoSwitch } from '../../js/ui.js';
import { todayISO } from '../../js/calc.js';
import { ic } from '../../js/icons.js';
import { takeTokenFromUrl, OUTAGE_TEXT } from './api.js';
import { refresh, refreshMetrika, refreshSite } from './sync.js';
import { demo, snap, demoLog } from './demo.js';
import { navSide } from './views/navside.js';
import { booksAdsView, bookAdView } from './views/bookads.js';
import { launchView } from './views/launch.js';
import { qualityView } from './views/quality.js';
import { litnetView } from './views/litnet.js';
import { keywordsView } from './views/keywords.js';
import { competitorsView } from './views/competitors.js';
import { autoSyncKeywordLibrary } from './key-sync.js';
import { campaignView } from './views/campaign.js';
import './views/learn.js'; // «Разбор» кампании (auditItemsHtml) — сам раздел «Учёба» убран
import { runAutoRules } from './sync.js';
import { resolvedLaunches, goalSwitch } from './views/launchctx.js';
import { syncWatch } from './watch.js';
import { pultView, pultModel } from './views/pult.js';
import { weekView } from './views/week.js';
import { hooksView } from './views/hooks.js';
import { rub } from '../../js/format.js';
import { moneyView } from './views/money.js';
import { siteView } from './views/siteads.js';
import { analyticsView } from './views/analytics.js';
import { aiView } from './views/ai.js';
import { logView } from './views/log.js';
import { settingsView } from './views/settings.js';

const store = createStore({ colls: ['d_snap', 'd_log', 'd_tests', 'd_keywords', 'd_kw_bindings', 'd_competitors', 'w_promolinks', 'w_books', 'w_links', 'campaigns', 'reports', 'books', 'days', 'sales'], localKey: 'authorDirect.v1' });
initAccent(store);
keepNavDown(); // iPhone: нижнее меню не «повисает» посреди экрана // цвет акцентов — общий для всех приложений (выбирается в Мастерской)
const ui = { route: '/', cTab: 'queries', lTab: '', lesson: '', demo: false, busy: '', kwBook: '', kwFilter: 'all' };
keepPlace(ui, ['cTab', 'lTab', 'bTab', 'demo', 'kwBook', 'kwFilter']);
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
    // идут ли кампании — чтобы Планер Мастерской по понедельникам звал на «Разбор недели»
    const liveNow = (app.snap('main')?.campaigns || []).some((x) => x.state === 'ON' && x.status === 'ACCEPTED'), t0 = todayISO();
    if (!demo.on && liveNow && d().liveOn !== t0) await store.saveSettings({ direct: { ...d(), liveOn: t0 } });
    // автоправила (включённые галочками на Пульте): минус-слова, площадки, выгоревшие объявления, смена цели
    try { const acts0 = resolvedLaunches(app).map((L) => goalSwitch(L.plan)).filter(Boolean); const did = await runAutoRules(app, acts0); if (did.length) toast(`Автоправила: сделано ${(d().autoLast || []).length} — см. «Что меняли»`); } catch (e) { console.warn('Автоправила:', e); }
    syncWatch(app).catch(() => {}); // задание круглосуточному сторожу (если включён)
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
  // сайт автора — свой счётчик; ошибка здесь не мешает остальному
  try { await refreshSite(app); } catch (e) { console.warn('Сайт:', e); }
  finally { try { await autoSyncKeywordLibrary(app); } catch(e){console.warn('Keyword library sync:',e);} ui.busy = ''; render(); }
}
app.reload = reload;
acts['d.reload'] = () => { reload(); return false; };

// Четыре раздела (10.11.2026, владелица: «максимум аналитики, полезных действий и контроля за кампаниями и их прибыльностью»):
// Пульт (что требует внимания + карточка на кампанию), Кампания, Деньги, Сайт. Остальные экраны открываются изнутри.
const TABS = [['/', 'gauge', 'Пульт'], ['/c', 'trend', 'Кампания'], ['/money', 'coins', 'Деньги'], ['/site', 'bear', 'Сайт']];
const TAB_OF = { launch: '/', week: '/', hooks: '/', quality: '/c', ai: '/', log: '/c', settings: '/', litnet: '/', an: '/', book: '/', books: '/', keywords: '/', competitors: '/' };
// «Кампания» без номера: одна идущая — сразу она, несколько — выбор
function campaignsView(x) {
  const camps = (x.snap('main')?.campaigns || []).filter((k) => k.state !== 'ARCHIVED');
  const on = camps.filter((k) => k.state === 'ON');
  if (on.length === 1) return campaignView(x, on[0].id);
  if (!camps.length) return pultView(x);
  const rows = pultModel(x).rows;
  return { html: `<div class="card"><h2>Кампании</h2><div class="list">${rows.map((r) => `<a class="item" href="#" data-act="go" data-to="/c/${r.camp.id}"><div class="row between"><b>${esc(r.book?.title ? `«${r.book.title}»` : r.camp.name)}</b><span class="small muted">${esc(r.st.text)}</span></div>
    <div class="small muted">${[r.book?.title ? r.camp.name : '', r.econ.d30.cost ? `за 30 дней ${rub(r.econ.d30.cost, 0)}` : '', r.econ.lib30 ? `в библиотеку ${r.econ.lib30}` : ''].filter(Boolean).map(esc).join(' · ')}</div></a>`).join('')}</div></div>` };
}
function route() {
  const [, a, b] = ('#' + (ui.route || '/')).split('/');
  if (a === 'c' && b) return { tab: '/c', view: (x) => campaignView(x, Number(decodeURIComponent(b))) };
  if (a === 'book' && b) return { tab: '/', view: (x) => bookAdView(x, decodeURIComponent(b)) };
  if (a === 'launch' && b) return { tab: '/', view: (x) => launchView(x, decodeURIComponent(b)) };
  if (a === 'an' && b === 'site') return { tab: '/site', view: siteView }; // старая ссылка «Статистика» из Мастерской
  const map = { books: booksAdsView, '': pultView, c: campaignsView, money: moneyView, site: siteView, launch: launchView, quality: qualityView, week: weekView, hooks: hooksView, litnet: litnetView, keywords: keywordsView, competitors: competitorsView, an: analyticsView, ai: aiView, log: logView, settings: settingsView };
  return { tab: TAB_OF[a] || '/' + (a || ''), view: map[a || ''] || pultView };
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
  <div class="row">${ecoSwitch('direct')}${!demo.on && c.settings.directToken ? `<button data-act="d.reload" aria-label="Обновить" title="Обновить данные"${ui.busy ? ' disabled' : ''}>${ic('refresh')}</button>` : ''}<button data-act="go" data-to="/settings" aria-label="Настройки" title="Настройки">${ic('settings')}</button><button data-act="theme.toggle" aria-label="Тема" title="Тема">${ic(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto')}</button></div></div>
  <main>${tidyNums(r.html)}</main>
  <nav class="tabs">${TABS.map(([h, i, t]) => `<a href="#" data-act="go" data-to="${h}" class="${tab === h ? 'on' : ''}" title="${t}"><b>${ic(i)}</b><span class="nl">${t}</span></a>`).join('')}${navSide(app)}<button class="nav-toggle" data-act="nav.mini" aria-label="Свернуть или развернуть меню" title="Свернуть меню">${ic('chevron')}</button></nav>`;
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
    syncDirectAccessQuiet(store, { ...app.ctx().settings, directToken: t.token, directTokenExp: t.exp });
    try { sessionStorage.removeItem('dTok'); } catch { /* ок */ }
    ui.demo = false; toast('Директ подключён'); reload({ quiet: true });
  } finally { saving = false; }
}

store.subscribe(() => { safeRender(); syncDemo().catch(console.error); savePendingToken().catch(console.error); autoDirectAccess(store); autoCohorts(store).catch(console.warn); });
store.init().then(async () => {
  await savePendingToken();
  await syncDemo();
  render();
  // свежие данные — сами: при открытии и раз в 15 минут, пока приложение открыто (и при возвращении во вкладку)
  const stale = () => { const at = app.snap('main')?.at; return !at || Date.now() - Date.parse(at) > 15 * 60000; };
  const tick = () => { if (store.data.settings.directToken && !demo.on && document.visibilityState === 'visible' && stale()) reload({ quiet: true }); };
  tick();
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', tick);
}).catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Не удалось запустить</h1><p>${esc(e.message || e)}</p></div>`;
});
