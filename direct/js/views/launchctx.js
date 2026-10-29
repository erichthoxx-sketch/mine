// Запуски из всех источников сразу — по каждой книге «в процессе»: план (direct.launches[id книги]), Мастерская (даты выкладки),
// сайт (старт подписки, ссылка на Литнет), Директ (кампания и её бюджет), Метрика автора (цели и доля «библиотека → покупка»),
// «Доходы» (доход с покупки). Общий для Рекламы, плана, конструктора и файла для нейросети.
import { loadSite } from '../../../js/sitepub.js';
import { addDays } from '../../../js/calc.js';
import { launchPlan, libraryGoal, buyGoal, launchesOf } from '../launchcalc.js';
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

export function resolvedLaunches(a) {
  const c = a.ctx(), m = metrikaOf(c), t = c.today, mk = a.snap('mk'), lib = libraryGoal(m), buy = buyGoal(m);
  const tot = mk?.daily ? goalTotals30(mk.daily, addDays(t, -29), t) : null;
  const common = {
    today: t, wbooks: c.data.w_books || [], siteBooks: siteBooks(a), metrika: m,
    campaigns: demo.on ? [] : (a.snap('main')?.campaigns || []),
    royalty: royaltyPerSale(c.data.sales || [], t)?.perSale || null,
    mkTotals: tot ? { lib: lib ? tot.goals[lib.id] || 0 : 0, buy: buy ? tot.goals[buy.id] || 0 : 0 } : null,
  };
  return launchesOf(c.settings, c.data.w_books || []).map(({ id, cfg }) => ({ id, fl: cfg, m, plan: launchPlan(cfg, common) }));
}
// Один запуск: по id книги, по открытому плану (ui.launchId) или первый
export function resolvedLaunch(a, id = null) {
  const all = resolvedLaunches(a), want = String(id || a.ui.launchId || '');
  return all.find((x) => x.id === want) || all[0] || null;
}
export async function saveLaunch(a, id, patch) {
  const d = a.ctx().settings.direct || {}, cur = resolvedLaunch(a, id);
  if (!cur) return;
  await a.store.saveSettings({ direct: { ...d, launches: { ...(d.launches || {}), [cur.id]: { ...cur.fl, ...patch } } } });
}
// Цель для стратегии «на конверсии»: до подписки — библиотека, с подпиской — покупка
export const launchGoal = (plan) => (plan.phase === 'paid' ? plan.buy : plan.lib || plan.buy) || null;
