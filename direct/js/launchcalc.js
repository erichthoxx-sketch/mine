// Первый самостоятельный рекламный тест: план и расчёты. Никаких действий в Директе.
import { goalTotals } from './dcalc.js';

export const FIRST_LAUNCH = {
  book: 'Развод для черной вдовы',
  prepDate: '2026-11-01',
  publicationDate: '2026-11-09',
  subscriptionDate: '',
  subscriptionOpen: false,
  bookUrl: '',
  budget: 10000,
  royalty: '',
  hypothesis: '',
  creativeReady: false,
  goalVerified: false,
  limitVerified: false,
  campaignId: '',
  actualStart: '',
};

export const firstLaunchOf = (settings = {}) => ({ ...FIRST_LAUNCH, ...(settings.direct?.firstLaunch || {}) });
const paidName = (name = '') =>
  /покуп|оплат|купил|purchase|payment|paid/i.test(name)
  && !/начал|начат|start|begin|корзин/i.test(name);

// Главная цель должна быть одной покупкой, а не суммой «начала покупки» + «покупки».
export function purchaseGoal(m = null) {
  const main = (m?.main || []).map(String);
  if (main.length !== 1) return null;
  const goal = (m?.goals || []).find((g) => String(g.id) === main[0]);
  return goal && paidName(goal.name) ? goal : null;
}

export function launchReadiness(cfg, { today, campaigns = [], metrika = null } = {}) {
  const goal = purchaseGoal(metrika);
  const picked = campaigns.find((x) => String(x.id) === String(cfg.campaignId));
  const checks = [
    { id: 'subscription', ok: !!cfg.subscriptionOpen && !!cfg.subscriptionDate && cfg.subscriptionDate <= today, label: 'Открыта платная подписка (4–5 глав)' },
    { id: 'goal', ok: !!goal && !!cfg.goalVerified, label: 'Подтверждена цель настоящей оплаты в Метрике' },
    { id: 'creative', ok: !!String(cfg.hypothesis || '').trim() && !!cfg.creativeReady, label: 'Составлена гипотеза и подготовлено объявление' },
    { id: 'limit', ok: !!cfg.limitVerified && Number(cfg.budget) > 0, label: 'Проверен лимит расходов в кабинете Директа' },
    { id: 'campaign', ok: !!picked && picked.state === 'ON', label: 'Выбрана действующая собственная кампания' },
  ];
  return { ready: checks.every((x) => x.ok), checks, goal, picked };
}

// Статистика теста строго по выбранной кампании с фактической даты ее старта.
// Не использует старые кампании, всю Метрику сайта или продажи от сторонних таргетологов.
export function launchMetrics(cfg, { daily = [], conv = [], today, goalId = null } = {}) {
  const budget = Number(cfg.budget) > 0 ? Number(cfg.budget) : 10000;
  const start = cfg.actualStart;
  if (!start || !cfg.campaignId || !today || today < start) {
    return { budget, spent: 0, balance: budget, clicks: 0, conversions: null, cpa: null, estimate: null, estimatedProfit: null, dataReady: false };
  }
  const from = start;
  const cid = Number(cfg.campaignId);
  const totals = goalTotals(daily, goalId ? conv : [], from, today, { cid, goals: goalId ? [goalId] : [] });
  const royalty = Number(cfg.royalty);
  const estimate = goalId && royalty > 0 ? totals.conv * royalty : null;
  return {
    budget, spent: totals.cost, balance: Math.max(0, budget - totals.cost),
    clicks: totals.clicks, conversions: goalId ? totals.conv : null, cpa: goalId ? totals.cpa : null,
    estimate, estimatedProfit: estimate == null ? null : Math.round((estimate - totals.cost) * 100) / 100,
    dataReady: true,
  };
}
