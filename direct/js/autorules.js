// Автоправила Директа (12.11.2026, её «да» на п. 17): то, что таргетолог делает руками каждую неделю, приложение делает само —
// только включённые галочкой правила (settings.direct.auto), после каждого обновления данных, не больше 6 действий за раз,
// каждое пишется в «Что меняли» (by: 'auto'). Цену цели и бюджет правила не трогают никогда.
import { queryHints, fatigueHints } from './dcalc.js';
import { placementRows, qualityAlerts } from './qualitycalc.js';

export const AUTO_RULES = [
  ['minus', 'Мусорные запросы — в минус-слова', '«скачать», «аудиокнига», «фильм» и подобные: слово добавляется к минус-словам кампании'],
  ['places', 'Площадки, с которых сразу уходят, — исключать', '20+ кликов и больше половины отказов в сетях: площадка уходит в «Запрещённые»'],
  ['fatigue', 'Выгоревшее объявление — на паузу', 'CTR упал на 40 %+ и в группе есть другие объявления: показы перейдут к ним'],
  ['goal', 'В день открытия подписки — цель «покупка»', 'меняется только цель стратегии; цена цели и бюджет остаются вашими'],
];
export const AUTO_MAX = 6;

// Что сделали бы включённые правила прямо сейчас (чистая функция). goalActs — готовые действия смены цели из планов запуска.
export function autoPlan({ main = {}, stats = {}, on = {}, today, goalActs = [], done = [] }) {
  const out = [], live = new Set((main.campaigns || []).filter((c) => c.state === 'ON').map((c) => c.id)), was = new Set(done);
  const push = (x) => { if (!was.has(x.key) && out.length < AUTO_MAX) out.push(x); };
  if (on.goal) for (const g of goalActs) push({ rule: 'goal', key: `goal:${g.campaign}:${g.goal}`, act: g, text: `цель кампании → «${g.goalName}»` });
  if (on.minus) {
    const neg = Object.fromEntries((main.campaigns || []).map((c) => [c.id, [...(c.negatives || []), ...(main.groups || []).filter((g) => g.cid === c.id).flatMap((g) => g.negatives || [])]]));
    for (const h of queryHints((stats.queries || []).filter((q) => live.has(q.cid)), neg)) if (h.clicks >= 2 || h.queries.length >= 2) push({ rule: 'minus', key: `minus:${h.cid}:${h.word}`, act: { do: 'minus', campaign: h.cid, phrases: [h.word], why: `автоправило: запросы вроде «${h.queries[0]}»` }, text: `минус-слово «${h.word}»` });
  }
  if (on.fatigue) for (const h of fatigueHints({ main, stats, today })) if (h.act && live.has(h.cid)) push({ rule: 'fatigue', key: `fatigue:${h.aid}`, act: { ...h.act, why: 'автоправило: ' + h.act.why }, text: h.title });
  if (on.places) {
    const by = {};
    for (const p of qualityAlerts(placementRows(stats.placements || [], main.campaigns || []), { maxItems: 20 })) if (live.has(p.cid) && p.bounce >= 55 && /\./.test(p.place)) (by[p.cid] ||= []).push(p.place);
    for (const [cid, places] of Object.entries(by)) { const fresh = places.filter((x) => !was.has(`place:${cid}:${x}`)).slice(0, 5); if (fresh.length) push({ rule: 'places', key: `places:${cid}:${fresh.join(',')}`, cid: Number(cid), places: fresh, keys: fresh.map((x) => `place:${cid}:${x}`), text: `исключить площадки: ${fresh.join(', ')}` }); }
  }
  return out;
}
