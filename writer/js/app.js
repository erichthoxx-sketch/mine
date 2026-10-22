// Писательское приложение: книги (Google Диск), идеи, планер, маркетинг. Вход и база — общие с приложением доходов.
import { initAccent } from '../../js/accent.js';
import { createStore, authErrorText } from '../../js/store.js';
import { installHandlers, esc, toast, acts, forms, watchForUpdates, keepPlace, tidyNums } from '../../js/ui.js';
import { todayISO, lastSaleDate, bookIdFor } from '../../js/calc.js';
import { writtenToday, writtenWeek } from './wcalc.js';
import * as drive from './drive.js';
import { ic } from '../../js/icons.js';
import { booksView, bookPage, refreshAll } from './views/books.js';
import { reviewsPage } from './views/reviews.js';
import { ideasView } from './views/ideas.js';
import { homeView } from './views/home.js';
import { planView, navToday } from './views/plan.js';
import { scheduleTodoist } from './tdsync.js';
import { syncFinish } from './sync.js';
import { CONTEST_NAV, cleanContestText, rawContestText, parseContest } from './wcalc.js';
import { marketingView, bookMarketing } from './views/marketing.js';
import { settingsView } from './views/settings.js';
import { linksView, linkPage } from './views/links.js';
import { editorView, editorDirty } from './views/editor.js';
import { legendPage } from './views/legend.js';
import { cleanText, cleanedMsg } from '../../js/cleantext.js';

export const WCOLLS = ['w_books', 'w_ideas', 'w_contests', 'w_queue', 'w_waiting', 'w_media', 'w_links', 'w_goals', 'w_legver', 'w_reviews'];
const store = createStore({ colls: [...WCOLLS, 'sales', 'books', 'campaigns', 'reports', 'days', 'months'], localKey: 'authorWriter.v1' });
initAccent(store);
const ui = { route: '/', planTab: 'books', ideaQ: '', ideaBook: '', ideaSt: 'open', ideaKind: '', ideaN: 50, openIdea: null, mSt: 'progress', mQ: '', mTab: 'texts', linkQ: '' };
keepPlace(ui, ['planTab', 'ideaBook', 'ideaSt', 'ideaKind', 'mSt', 'mTab', 'legTab']);
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
    writtenToday: wbooks.reduce((a, b) => a + writtenToday(b, today), 0),
    writtenWeek: wbooks.reduce((a, b) => a + writtenWeek(b, today), 0),
    dataEnd: (() => { const l = lastSaleDate(d.sales); return l && l < today ? l : today; })(),
  };
  cacheKey = key;
  return cache;
}

const TABS = [['/', 'house', 'Главная'], ['/books', 'books', 'Книги'], ['/ideas', 'ideas', 'Идеи'], ['/plan', 'plan', 'Планер'], ['/marketing', 'marketing', 'Маркетинг'], ['/links', 'links', 'Связи']];
function route() {
  const [, a, b] = ('#' + (ui.route || '/')).split('/');
  if (a === 'book' && b) return { tab: '/books', view: (x) => bookPage(x, decodeURIComponent(b)) };
  if (a === 'reviews' && b) return { tab: '/books', view: (x) => reviewsPage(x, decodeURIComponent(b)) };
  if (a === 'legend' && b) return { tab: '/books', view: (x) => legendPage(x, decodeURIComponent(b)) };
  if (a === 'ed' && b) { const [, , bid, ...rest] = ('#' + ui.route).split('/'); return { tab: '/books', view: (x) => editorView(x, decodeURIComponent(bid), decodeURIComponent(rest.join('/'))) }; }
  if (a === 'link' && b) return { tab: '/links', view: (x) => linkPage(x, decodeURIComponent(b)) };
  if (a === 'mk' && b) return { tab: '/marketing', view: (x) => bookMarketing(x, decodeURIComponent(b)) };
  const map = { '': homeView, books: booksView, ideas: ideasView, plan: planView, marketing: marketingView, links: linksView, settings: settingsView };
  return { tab: '/' + (a || ''), view: map[a || ''] || homeView };
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
  document.documentElement.classList.toggle('on-ed', ui.route.startsWith('/ed/')); // в редакторе нижнее меню прячем
  try { r = view(app) || { html: '' }; } catch (e) { console.error(e); r = { html: `<div class="card"><p>Ошибка экрана: ${esc(e.message)}</p></div>` }; }
  const sync = store.mode === 'local' ? '' : store.sync === 'pending' ? 'сохраняется…' : store.sync === 'error' ? 'ошибка синхронизации' : navigator.onLine ? 'всё сохранено' : 'нет сети';
  document.getElementById('app').innerHTML = `${store.mode === 'local' ? '<div class="demo">Пробный режим: данные только в этом браузере.</div>' : ''}
  <div class="top"><div><h1>Мастерская</h1><small>${esc(c.settings.pseudonym)}${sync ? ' · ' + sync : ''}</small></div>
  <div class="row"><a class="btn" href="../">${ic('ruble')} Доходы</a><button data-act="go" data-to="/settings" aria-label="Настройки" title="Настройки">${ic('settings')}</button><button data-act="theme.toggle" aria-label="Тема" title="Тема">${ic(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto')}</button></div></div>
  <main>${ui.route.startsWith('/ed/') ? r.html : tidyNums(r.html)}</main>
  <nav class="tabs">${TABS.map(([h, i, t]) => `<a href="#" data-act="go" data-to="${h}" class="${tab === h ? 'on' : ''}" title="${t}"><b>${ic(i)}</b><span class="nl">${t}</span></a>`).join('')}${wide() ? (() => { try { return tidyNums(navToday(c)); } catch (e) { console.error(e); return ''; } })() : ''}<button class="nav-toggle" data-act="nav.mini" aria-label="Свернуть или развернуть меню" title="Свернуть меню">${ic('chevron')}</button></nav>`;
  afterFn = r.after || null;
  afterFn?.();
}
acts.go = (d) => { ui.route = d.to; window.scrollTo(0, 0); };
// широкий экран: меню слева, колонка «Сегодня» справа
const wide = () => window.matchMedia('(min-width: 1180px)').matches;
let rt, wasWide = wide(); window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (wide() !== wasWide) { wasWide = wide(); render(); } else afterFn?.(); }, 150); });
acts['theme.toggle'] = () => app.setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[theme]);

let pending = false;
function safeRender() {
  // в редакторе главы не перерисовываем страницу из-за изменений в базе — иначе теряются история правок и курсор
  // (блок «сегодня» в меню всё же обновляем — после сохранения там свежее «написано сегодня»)
  if (ui.route.startsWith('/ed/') && document.getElementById('ed')) {
    const nt = document.querySelector('.nav-day');
    if (nt) try { nt.outerHTML = navToday(getCtx()); } catch (e) { console.error(e); }
    return;
  }
  const ae = document.activeElement;
  if (ae && ae.closest?.('main') && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) { pending = true; return; }
  render();
}
document.addEventListener('focusout', () => { if (pending) setTimeout(() => { const a = document.activeElement; if (!a?.closest?.('main') || !(/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) { pending = false; render(); } }, 150); });
window.addEventListener('online', render); window.addEventListener('offline', render);

installHandlers(() => render());
watchForUpdates();
try { sessionStorage.removeItem('staleReload'); } catch { /* нет доступа к памяти браузера */ }
applyTheme();
// меню слева на компьютере: свёрнутое (только иконки) или полное — запоминаем
try { document.documentElement.classList.toggle('nav-mini', localStorage.getItem('navMini') === '1'); } catch { /* ок */ }
acts['nav.mini'] = () => { const on = document.documentElement.classList.toggle('nav-mini'); try { localStorage.setItem('navMini', on ? '1' : '0'); } catch { /* ок */ } setTimeout(() => window.dispatchEvent(new Event('resize')), 300); };
store.subscribe(() => { safeRender(); scheduleTodoist(app); });
// конкурсы, разобранные старой версией: один раз разбираем условия заново (даты, объём, имя файла); название не трогаем, если оно не «Литнет» и т. п.
const CONTEST_PV = 3;
let reparsing = false;
async function reparseContests() {
  if (reparsing) return;
  const old = (store.data.w_contests || []).filter((x) => x.conditions && (x.pv || 0) < CONTEST_PV && !rawContestText(x.conditions));
  // имя с кнопки («Участвовать») или фраза из условий («2 победителя получат: …») — исправляем по условиям и адресу
  const odd = (n) => CONTEST_NAV.test(n) || /:/.test(n) || /^\d/.test(n) || n.length > 70;
  const badName = (store.data.w_contests || []).filter((x) => x.conditions && (x.pv || 0) >= CONTEST_PV && odd(String(x.name || '').trim()));
  const raw = (store.data.w_contests || []).filter((x) => rawContestText(x.conditions));
  if (!old.length && !badName.length && !raw.length) return;
  reparsing = true;
  try {
    // страница была сохранена «сырой» (служебные строки, меню сайта) — чистим; название и пустые поля — из чистого текста
    for (const x of raw) {
      const conditions = cleanContestText(x.conditions), r = parseContest(conditions, x.url || '', todayISO()), patch = { conditions };
      if (r.name && (odd(String(x.name || '').trim()) || !x.name)) patch.name = r.name;
      for (const k of ['start', 'end', 'results', 'genres', 'minChars', 'maxChars', 'unit', 'startChars', 'volNote', 'fileTpl', 'chapters', 'formats']) if (r[k] != null && r[k] !== '' && (x[k] == null || x[k] === '')) patch[k] = r[k];
      await store.put('w_contests', { ...x, ...patch });
    }
    for (const x of badName.filter((y) => !raw.includes(y))) { const nm = parseContest(x.conditions, x.url || '', todayISO()).name; if (nm && !odd(nm) && nm !== x.name) await store.put('w_contests', { ...x, name: nm }); }
    for (const x of old) {
      const r = parseContest(x.conditions, x.url || '', todayISO()), keep = {};
      if (x.name && !CONTEST_NAV.test(x.name.trim()) && !/:/.test(x.name)) keep.name = x.name;
      const clean = { ...x };
      for (const k of ['minChars', 'maxChars', 'startChars', 'unit', 'volNote', 'fileTpl', 'chapters', 'formats']) delete clean[k];
      if (x.newOnly) delete r.newOnly; // отмечено вручную — оставляем
      await store.put('w_contests', { ...clean, ...r, ...keep, pv: CONTEST_PV });
    }
  } finally { reparsing = false; }
}
store.subscribe(() => { reparseContests().catch(() => {}); });
// дописанные книги: событие «Завершение» в «Доходах» — в день выхода последней главы (переносится само, если график сдвинулся)
let finSync = false;
store.subscribe(async () => {
  if (finSync || !store.data.w_books?.length || !store.data.days) return;
  finSync = true;
  try { const c = getCtx(); for (const b of store.data.w_books) if (b.status === 'done') await syncFinish(c, b); } catch { /* в следующий раз */ } finally { finSync = false; }
});
// вернулась в приложение — подтягиваем свежие задачи из Todoist
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleTodoist(app, 800, { pull: true }); });
// вставка в любое поле Мастерской — без невидимых символов из чатов и сайтов (редактор главы чистит сам)
document.addEventListener('paste', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|url|)$/.test(el.type)))) return;
  const x = cleanText(e.clipboardData?.getData('text/plain') || '');
  if (!x.n) return;
  e.preventDefault();
  document.execCommand('insertText', false, x.text);
  toast(cleanedMsg(x.n));
});
setInterval(() => { if (document.visibilityState === 'visible') scheduleTodoist(app, 1000, { pull: true }); }, 3 * 60000); // и раз в 3 минуты, пока приложение открыто
drive.preload().catch(() => {});
let autoRefreshed = false;
store.init().then(() => {
  render();
  scheduleTodoist(app, 2500, { pull: true });
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
