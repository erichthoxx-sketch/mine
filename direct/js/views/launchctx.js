// План запуска из всех источников сразу: настройки плана, Мастерская (даты выкладки), сайт (старт подписки, ссылка на Литнет),
// Метрика автора (цели и доля «библиотека → покупка»), «Доходы» (доход с покупки). Общий для Обзора, плана и конструктора.
import { loadSite } from '../../../js/sitepub.js';
import { addDays } from '../../../js/calc.js';
import { firstLaunchOf, launchPlan, libraryGoal, buyGoal, freshLaunch, sameBook, currentLaunch } from '../launchcalc.js';
import { goalTotals30, royaltyPerSale } from '../mcalc.js';
import { metrikaOf } from './metrika.js';
import { demo } from '../demo.js';

const site = { info: null, loading: false, at: 0 };
function siteBooks(a) {
  if (!site.loading && (!site.info || Date.now() - site.at > 30 * 60000)) {
    site.loading = true;
    loadSite().then((x) => { site.info = x; site.at = Date.now(); a.rerender(); }).catch(() => {}).finally(() => { site.loading = false; });
  }
  return site.info?.books || [];
}

// Переключить запуск на другую книгу: прошлый план — в архив (один раз, без повторов при перерисовке)
let switching = '';
export async function switchLaunch(a, book, { manual = false } = {}) {
  const c = a.ctx(), d = c.settings.direct || {}, fl = firstLaunchOf(c.settings);
  if (sameBook(fl.book, book) && !!fl.bookManual === manual) return;
  const past = [...(d.pastLaunches || []), ...(fl.book && !sameBook(fl.book, book) ? [{ ...fl, endedAt: c.today }] : [])].slice(-20);
  const keep = sameBook(fl.book, book) ? fl : (past.find((x) => sameBook(x.book, book)) || freshLaunch(fl, book)); // вернулась к прежней книге — её план
  await a.store.saveSettings({ direct: { ...d, pastLaunches: past.filter((x) => !sameBook(x.book, book)), firstLaunch: { ...keep, book, bookManual: manual } } });
}

export function resolvedLaunch(a) {
  const c = a.ctx(), m = metrikaOf(c), t = c.today;
  const cur = demo.on ? { cfg: firstLaunchOf(c.settings), switched: null } : currentLaunch(c.settings, c.data.w_books || [], t), fl = cur.cfg;
  // книга — сама актуальная из Мастерской (новая книга подходит к старту), пока владелица не выбрала свою
  if (cur.switched && switching !== cur.switched) { switching = cur.switched; switchLaunch(a, cur.switched).catch(() => {}).finally(() => { switching = ''; }); }
  const mk = a.snap('mk'), lib = libraryGoal(m), buy = buyGoal(m);
  const tot = mk?.daily ? goalTotals30(mk.daily, addDays(t, -29), t) : null;
  const plan = launchPlan(fl, {
    today: t, wbooks: c.data.w_books || [], siteBooks: siteBooks(a), metrika: m,
    campaigns: demo.on ? [] : (a.snap('main')?.campaigns || []),
    royalty: royaltyPerSale(c.data.sales || [], t)?.perSale || null,
    mkTotals: tot ? { lib: lib ? tot.goals[lib.id] || 0 : 0, buy: buy ? tot.goals[buy.id] || 0 : 0 } : null,
  });
  return { fl, m, plan };
}
// Цель для стратегии «на конверсии»: до подписки — библиотека, с подпиской — покупка
export const launchGoal = (plan) => (plan.phase === 'paid' ? plan.buy : plan.lib || plan.buy) || null;
