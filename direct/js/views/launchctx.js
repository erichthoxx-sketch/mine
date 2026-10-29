// План запуска из всех источников сразу: настройки плана, Мастерская (даты выкладки), сайт (старт подписки, ссылка на Литнет),
// Метрика автора (цели и доля «библиотека → покупка»), «Доходы» (доход с покупки). Общий для Обзора, плана и конструктора.
import { loadSite } from '../../../js/sitepub.js';
import { addDays } from '../../../js/calc.js';
import { firstLaunchOf, launchPlan, libraryGoal, buyGoal } from '../launchcalc.js';
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

export function resolvedLaunch(a) {
  const c = a.ctx(), fl = firstLaunchOf(c.settings), m = metrikaOf(c), t = c.today;
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
