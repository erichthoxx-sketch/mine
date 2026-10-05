// Запуск приложения: вход, маршруты, общий контекст расчётов.
import { createStore, authErrorText, firebaseConfigured } from './store.js';
import { installHandlers, esc, toast, acts, forms, watchForUpdates } from './ui.js';
import {
  todayISO, incomeSeries, firstKnownDate, lastSaleDate, movingAverage, spendByMonthChannel, litnetDiscounts, monthFinance, monthSpendForecast, litnetPaymentsByMonth,
} from './calc.js';
import { fmtDate } from './format.js';
import { ic } from './icons.js';
import { home } from './views/home.js';
import { day } from './views/day.js';
import { books, bookPage } from './views/books.js';
import { ads, adPage } from './views/ads.js';
import { money } from './views/money.js';
import { data } from './views/data.js';

const store = createStore();
const ui = { route: '/', range: 90, table: 'weeks', day: null, month: null };
let theme = 'auto';
try { theme = localStorage.getItem('theme') || 'auto'; } catch { /* нет доступа к памяти браузера */ }

const app = {
  store, ui,
  get theme() { return theme; },
  setTheme(t) {
    theme = t;
    try { localStorage.setItem('theme', t); } catch { /* ок */ }
    applyTheme(); render();
  },
  rerender: () => render(),
  go(path) { ui.route = path; render(); window.scrollTo(0, 0); },
  ctx: () => getCtx(),
  fin: (m) => { const c = getCtx(); return monthFinance(m, { sales: c.sales, legacyDays: c.legacyDays, spend: c.spend, discounts: c.discounts, months: c.monthsMap, settings: c.settings }); },
};
window.__app = app;

function applyTheme() {
  const r = document.documentElement;
  if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme);
}

// ---------- общий контекст расчётов (пересчитывается при изменении данных) ----------
let cache = null, cacheKey = '';
function getCtx() {
  const d = store.data;
  const today = todayISO();
  const key = [d.sales.length, d.books.length, d.days.length, d.campaigns.length, d.reports.length, d.months.length, JSON.stringify(d.settings), today, store.version || 0].join('|');
  if (cache && key === cacheKey) return cache;
  const legacyDays = d.days.filter((x) => x.income != null);
  const first = firstKnownDate(d.sales, legacyDays);
  // «данные по» — по продажам Литнета (ручные продажи других площадок не сдвигают дату)
  const litnetSales = d.sales.filter((s) => !s.platform || s.platform.toLowerCase() === 'литнет');
  const lastS = lastSaleDate(litnetSales.length ? litnetSales : d.sales);
  const dataEnd = lastS && lastS < today ? lastS : today;
  const hasData = !!first;
  const series = hasData ? incomeSeries(d.sales, legacyDays, first, dataEnd) : [];
  const monthsMap = Object.fromEntries(d.months.map((m) => [m.id, m]));
  const spend = spendByMonthChannel(d.campaigns, d.reports, monthsMap, today);
  const litnet = litnetPaymentsByMonth(d.campaigns); // скидка — от оплат таргетологам за месяц
  const confirmed = Object.fromEntries(d.months.filter((m) => m.litnetDiscountConfirmed).map((m) => [m.id, { amount: m.litnetDiscountAmount }]));
  const discounts = litnetDiscounts(litnet, { threshold: Number(d.settings.litnetThreshold), pct: Number(d.settings.litnetPct) / 100 }, confirmed);
  const forecast = monthSpendForecast(d.campaigns, d.reports, today);
  const booksById = Object.fromEntries(d.books.map((b) => [b.id, b]));
  cache = {
    data: d, settings: d.settings, today, sales: d.sales, legacyDays, books: d.books, booksById, campaigns: d.campaigns,
    // для выбора в формах — без снятых с продажи; сначала книги в процессе
    activeBooks: d.books.filter((b) => b.status !== 'removed').sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.title.localeCompare(b.title)),
    firstDate: first, dataEnd, hasData, series, ma: movingAverage(series.map((x) => x.royalty), 7),
    monthsMap, spend, discounts, forecast,
    titleOf: (id, fallback) => booksById[id]?.title || fallback,
  };
  cacheKey = key;
  return cache;
}

// ---------- маршруты ----------
const TABS = [['#/', 'home', 'Главная'], ['#/day', 'day', 'День'], ['#/books', 'books', 'Книги'], ['#/ads', 'ads', 'Реклама'], ['#/money', 'money', 'Финансы'], ['#/data', 'data', 'Данные']];
function route() {
  const h = '#' + (ui.route || '/');
  const [, a, b] = h.split('/');
  if (b && a === 'book') return { tab: '#/books', view: (x) => bookPage(x, decodeURIComponent(b)) };
  if (b && a === 'ad') return { tab: '#/ads', view: (x) => adPage(x, decodeURIComponent(b)) };
  const map = { '': home, day, books, ads, money, data };
  const v = map[a ?? ''] || home;
  return { tab: '#/' + (a || ''), view: v };
}

function authScreen() {
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Учёт доходов автора</h1><p class="muted">Войдите по почте, чтобы видеть данные на телефоне и компьютере.</p>
  <form data-form="auth"><label>Электронная почта</label><input name="email" type="email" autocomplete="email" required>
  <label>Пароль (не короче 6 символов)</label><input name="pw" type="password" autocomplete="current-password" required minlength="6">
  <p id="authErr" class="down small" role="alert"></p>
  <div class="row"><button class="primary" type="submit" name="mode" value="in">Войти</button><button type="submit" name="mode" value="up" formnovalidate>Создать аккаунт</button></div>
  <p><button type="button" class="link" data-act="auth.reset">Забыли пароль?</button></p></form></div>`;
}
forms.auth = async (fd, f, e) => {
  const mode = e.submitter?.value || 'in', email = fd.get('email').trim(), pw = fd.get('pw');
  const err = document.getElementById('authErr');
  err.textContent = '';
  try { await (mode === 'up' ? store.signUp(email, pw) : store.signIn(email, pw)); } catch (x) { err.textContent = authErrorText(x); }
};
acts['auth.reset'] = async () => {
  const email = (document.querySelector('form[data-form=auth] [name=email]').value || '').trim();
  if (!email) { toast('Впишите адрес почты и нажмите ещё раз'); return; }
  try { await store.reset(email); toast('Письмо для смены пароля отправлено'); } catch (x) { toast(authErrorText(x)); }
};

let afterFn = null;
function render() {
  if (!store.user) { authScreen(); return; }
  const { tab, view } = route();
  const c = getCtx();
  const r = view(app) || { html: '' };
  const syncText = store.mode === 'local' ? '' : store.sync === 'pending' ? 'сохраняется…' : store.sync === 'error' ? 'ошибка синхронизации' : navigator.onLine ? 'синхронизировано' : 'нет сети — сохранится позже';
  document.getElementById('app').innerHTML = `${store.mode === 'local' ? '<div class="demo">Пробный режим: данные только в этом браузере. Синхронизация появится после настройки Firebase.</div>' : ''}
  <div class="top"><div><h1>${esc(c.settings.pseudonym)}</h1><small>${c.hasData ? 'данные по ' + fmtDate(c.dataEnd) : 'данных пока нет'}${syncText ? ' · ' + syncText : ''}</small></div>
  <div class="row"><a class="btn" href="pisatel/">${ic('sparkle')} Мастерская</a><button data-act="theme.toggle" aria-label="Тема" title="Тема">${ic(theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'auto')}</button></div></div>
  <main>${r.html}</main>
  <nav class="tabs">${TABS.map(([h, i, t]) => `<a href="#" data-act="go" data-to="${h.slice(1)}" class="${tab === h ? 'on' : ''}"><b>${ic(i)}</b>${t}</a>`).join('')}</nav>`;
  afterFn = r.after || null;
  afterFn?.();
}
acts['theme.toggle'] = () => app.setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[theme]);

// Не перерисовываем, пока человек что-то печатает в форме
let pending = false;
function safeRender() {
  const ae = document.activeElement;
  if (ae && ae.closest?.('main') && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) { pending = true; return; }
  render();
}
document.addEventListener('focusout', () => { if (pending) setTimeout(() => { if (!document.activeElement?.closest?.('main') || !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { pending = false; render(); } }, 150); });
acts.go = (d) => { ui.route = d.to; window.scrollTo(0, 0); };
let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => afterFn?.(), 150); });
window.addEventListener('online', render); window.addEventListener('offline', render);

installHandlers(() => render());
watchForUpdates();
applyTheme();
store.subscribe(() => safeRender());
store.init().then(() => {
  render();
  // Разовое исправление: раньше по умолчанию стояло 6 %, для самозанятой при агентском договоре с Литнетом — 4 % с полной цены
  let fixed = false;
  const fixTax = () => {
    if (fixed || !store.user || !store.settingsLoaded) return; // ждём настоящие настройки из базы, чтобы ничего не затереть
    const s = store.data.settings;
    if (s.taxVersion === 2) { fixed = true; return; }
    fixed = true;
    store.saveSettings({ taxRate: 4, taxBase: 'gross', taxVersion: 2 }).then(() => toast('Ставка налога исправлена на 4 % (самозанятая, доход от физлиц)')).catch(() => { fixed = false; });
  };
  setTimeout(() => { store.subscribe(fixTax); fixTax(); }, 1500);
  // Разовое исправление дат и базы двух кампаний (по просьбе: «тестовый» и «Таргет Альпийский»)
  let campFixed = false;
  const fixCampaigns = async () => {
    if (campFixed || !store.user || !store.settingsLoaded || !store.loaded?.campaigns) return;
    if (store.data.settings.campFix202610) { campFixed = true; return; }
    campFixed = true;
    const base = { baseMode: 'range', baseFrom: '2026-09-01', baseTo: '2026-09-13' };
    const plan = { 'тестовый': { start: '2026-09-14', end: '2026-10-04', ...base }, 'таргет альпийский': { start: '2026-10-05', end: '2026-11-07', ...base } };
    try {
      for (const k of store.data.campaigns) {
        const p = plan[(k.name || '').trim().toLowerCase()];
        if (p) await store.put('campaigns', { ...k, ...p });
      }
      await store.saveSettings({ campFix202610: true });
    } catch { campFixed = false; }
  };
  setTimeout(() => { store.subscribe(fixCampaigns); fixCampaigns(); }, 1500);
}).catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="auth"><h1>Не удалось запустить</h1><p>${esc(e.message || e)}</p><p class="muted">Проверьте интернет и настройки Firebase.</p></div>`;
});
