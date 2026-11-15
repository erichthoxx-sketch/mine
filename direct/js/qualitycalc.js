// Аудит качества собственного трафика по Директу. Не определяет ботов и не меняет кампании.
// Площадки: отчет Reports по последним 30 дням. BounceRate поступает в процентах (0–100).
import { goalTotals } from './dcalc.js';

export const QUALITY_WINDOW_DAYS = 30;
export const MIN_PLACEMENT_CLICKS = 30; // осторожный ориентир для ручной проверки, не порог «ботов»
export const HIGH_BOUNCE_PCT = 75;
// Автоисключение требует более надёжных данных, чем информационный сигнал.
export const AUTO_PLACEMENT_MIN_CLICKS = 150;
export const AUTO_PLACEMENT_BOUNCE = 85; // только сигнал при достаточном количестве кликов, не доказательство фрода

const round = n => Math.round(n * 100) / 100;
const CONVERSION_COL = /^Conversions_\d+_/;
const numeric = value => {
  if (value === '' || value == null || value === '--' || value === '—') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Совпадающие строки агрегируются; процент отказов взвешивается по кликам (приближение).
// Не представляем эту сводную величину точным показателем визитов.
export function placementRows(raw = [], campaigns = []) {
  const known = new Set(campaigns.map(x => String(x.id)));
  const by = new Map();
  for (const row of raw) {
    const cid = Number(row.CampaignId);
    if (!Number.isFinite(cid) || !known.has(String(cid))) continue;
    const place = String(row.Placement || '').trim() || 'Площадка не определена';
    const network = row.AdNetworkType === 'AD_NETWORK' ? 'network' : row.AdNetworkType === 'SEARCH' ? 'search' : 'other';
    const key = cid + '|' + network + '|' + place;
    const v = by.get(key) || { cid, place, network, impr: 0, clicks: 0, cost: 0, bounceWeighted: 0, bounceClicks: 0, conv: 0, goalsMeasured: true };
    const clicks = Math.max(0, numeric(row.Clicks) ?? 0);
    v.impr += Math.max(0, numeric(row.Impressions) ?? 0);
    v.clicks += clicks;
    v.cost += Math.max(0, numeric(row.Cost) ?? 0);
    const goalKeys = Object.keys(row).filter((k) => CONVERSION_COL.test(k));
    // При отсутствии колонок нельзя считать 0 конверсий доказанным нулём.
    v.goalsMeasured = v.goalsMeasured && goalKeys.length > 0;
    for (const k of goalKeys) v.conv += Math.max(0, numeric(row[k]) ?? 0);
    const bounce = numeric(row.BounceRate);
    if (bounce != null && bounce >= 0 && bounce <= 100 && clicks > 0) {
      v.bounceWeighted += bounce * clicks;
      v.bounceClicks += clicks;
    }
    by.set(key, v);
  }
  return [...by.values()].map(({ bounceWeighted, bounceClicks, ...x }) => ({
    ...x, cost: round(x.cost), cpc: x.clicks ? round(x.cost / x.clicks) : null,
    ctr: x.impr ? x.clicks / x.impr : null,
    bounce: bounceClicks ? round(bounceWeighted / bounceClicks) : null,
  })).sort((a,b) => b.cost - a.cost);
}

// Защита рабочих площадок: автоисключение только при достаточных кликах,
 // свежем полном отчёте по целям, отсутствии любых зарегистрированных конверсий.
 // Площадки с хотя бы одной конверсией не исключаются независимо от отказов.
export function autoPlacementCandidates(rows = [], { reportAt = '', today = '' } = {}) {
  const fresh = reportAt && today && Date.parse(reportAt) >= Date.parse(today + 'T00:00:00Z') - 36 * 3600000;
  if (!fresh) return [];
  return rows.filter((p) => p.network === 'network' && p.clicks >= AUTO_PLACEMENT_MIN_CLICKS &&
    p.bounce != null && p.bounce >= AUTO_PLACEMENT_BOUNCE && p.goalsMeasured === true &&
    p.conv === 0 && p.place.includes('.') && !/^(unknown|не определена)/i.test(p.place));
}

export function qualityAlerts(rows, { maxItems = 5 } = {}) {
  const matches = rows.filter(x => x.network === 'network' && x.clicks >= MIN_PLACEMENT_CLICKS && x.bounce != null && x.bounce >= HIGH_BOUNCE_PCT)
    .map(x => ({ ...x, kind: 'check', text: x.conv > 0 ? 'Высокие отказы, но есть конверсии: площадку не исключать автоматически.' : 'Высокие отказы: проверь конверсии и качество; это не доказательство ботов.' }));
  return matches.sort((a,b) => b.cost - a.cost).slice(0,maxItems);
}

export function qualitySummary({ campaigns = [], daily = [], conv = [], placeRows = [], goalId = null, from, to, qualityAt = null } = {}) {
  const ids = new Set(campaigns.filter(x => x.state !== 'ARCHIVED').map(x => Number(x.id)));
  const own = daily.filter(x => ids.has(Number(x.cid)));
  const total = goalTotals(own, goalId ? conv.filter(x => ids.has(Number(x.cid))) : [], from, to, { goals: goalId ? [goalId] : [] });
  const placements = placementRows(placeRows, campaigns);
  const byNetwork = {};
  for (const type of ['search','network']) {
    const subset = placements.filter(x => x.network === type);
    const clicks = subset.reduce((n,x)=>n+x.clicks,0), cost = round(subset.reduce((n,x)=>n+x.cost,0));
    byNetwork[type] = { clicks, cost, impr: subset.reduce((n,x)=>n+x.impr,0),
      cpc: clicks ? round(cost/clicks) : null, count: subset.length };
  }
  return { ...total, purchases: goalId ? total.conv : null,
    paidActionCost: goalId ? total.cpa : null,
    byNetwork, placements, flags: qualityAlerts(placements),
    qualityAt,
  };
}
