// Предложения по одной кампании. Расчёт не отправляет запросов в Директ.
import { addDays } from '../../js/calc.js';
import { hasNegative, junkOf } from './dcalc.js';
import { adDuel } from './diagnose.js';
import { autoPlacementCandidates, placementRows } from './qualitycalc.js';
import { conversionEvidence } from './evidence.js';

const words = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').trim().split(/\s+/);
const active = (a) => a.state === 'ON' && a.status === 'ACCEPTED';

export function campaignRecommendations({ row, main, stats, today, log = [], now = Date.now() }) {
  const camp = row?.camp;
  if (!camp || camp.state !== 'ON') return { items: [], note: 'Предложения появятся после запуска кампании.' };
  const paid = !!row.subStart && row.subStart <= today || row.goals.buy.includes(String(camp.goal));
  const goal = paid ? row.goals.buy[0] : row.goals.lib;
  if (!goal || !row.convReady || !conversionEvidence(stats, today, { now }).ready ||
      (stats.goalIds && !stats.goalIds.map(String).includes(String(goal)))) {
    return { items: [], note: 'Для предложений нужен свежий отчёт по целям кампании.' };
  }
  const since = paid && row.subStart > (camp.start || '') ? row.subStart : camp.start;
  if (since && addDays(since, 7) > today) {
    return { items: [], note: 'Идёт первая неделя после запуска или открытия подписки.', next: addDays(since, 7) };
  }

  const { id: cid } = camp;
  const items = [];
  const queries = stats.queryGoalsReady ? (stats.queries || []).filter((q) => q.cid === cid) : [];
  const converted = queries.filter((q) => Object.values(q.conv || {}).some((v) => v > 0)).map((q) => words(q.query));
  const negativeKeys = new Set();
  for (const q of [...queries].sort((a, b) => b.cost - a.cost)) {
    const raw = String(q.query || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const tokens = words(raw), junk = junkOf(raw);
    if (!junk || junk[1] === 'бесплатно' || q.clicks < 15 || q.cost <= 0 ||
        !/^[а-яёa-z0-9]+(?: [а-яёa-z0-9]+){1,6}$/iu.test(raw)) continue;
    if (converted.some((xs) => tokens.every((word) => xs.includes(word))) ||
        Object.values(q.conv || {}).some((v) => v > 0)) continue;
    const phrase = '"' + raw + '"';
    if (negativeKeys.has(raw) || hasNegative(camp.negatives || [], phrase)) continue;
    negativeKeys.add(raw);
    items.push({ key: 'minus:' + raw, type: 'minus', target: phrase, title: 'Добавить минус-фразу ' + phrase,
      effect: 'Фраза добавится к минус-фразам этой кампании. Кавычки фиксируют число слов в запросе.',
      cost: q.cost, clicks: q.clicks, count: 0, reason: junk[2][0].toUpperCase() + junk[2].slice(1) + '.' });
  }

  const at = Date.parse(stats.placementAt || '');
  if (!stats.placementErr && at <= now && now - at <= 36 * 3600000) {
    const placements = placementRows(stats.placements || [], [camp]);
    for (const p of autoPlacementCandidates(placements, { reportAt: stats.placementAt, today })) {
      items.push({ key: 'place:' + p.place, type: 'place', target: p.place, title: 'Исключить площадку ' + p.place,
        effect: 'Площадка добавится к исключениям этой кампании.',
        cost: p.cost, clicks: p.clicks, count: 0, reason: 'Отказы — ' + Math.round(p.bounce) + ' %.' });
    }
  }

  // Сравниваем объявления внутри одной группы и одного типа размещения.
  const ads = (main.ads || []).filter((a) => a.cid === cid && active(a));
  const adFrom = addDays(today, -29), adTo = addDays(today, -3);
  const adAt = Date.parse(stats.adGoalsAt || '');
  const adRows = adAt <= now && now - adAt <= 36 * 3600000 ? stats.adDaily || [] : [];
  const daily = adRows.filter((x) => x.cid === cid && x.date >= adFrom && x.date <= adTo);
  for (const gid of new Set(ads.map((a) => a.gid).filter(Boolean))) {
    const group = ads.filter((a) => a.gid === gid), candidates = [];
    for (const net of ['s', 'n']) {
      const measured = group.map((a) => {
        const rows = daily.filter((x) => x.aid === a.id && x.net === net);
        if (!rows.length || !rows.every((x) => x.goalMeasured && Object.hasOwn(x.goals || {}, goal))) return null;
        return rows.reduce((r, x) => ({ ...r, clicks: r.clicks + x.clicks, impr: r.impr + x.impr,
          cost: r.cost + x.cost, lib: r.lib + x.goals[goal] }), { k: a.id, clicks: 0, impr: 0, cost: 0, lib: 0 });
      }).filter(Boolean);
      const duel = adDuel({ measured }, group);
      if (duel?.by !== 'lib' || !duel.canStop || duel.loser.lib !== 0) continue;
      const history = daily.filter((x) => x.aid === duel.loser.k);
      if (history.some((x) => !x.goalMeasured || !Object.hasOwn(x.goals || {}, goal) || Object.values(x.goals).some((v) => v > 0))) continue;
      candidates.push({ key: 'pause:' + duel.loser.k, type: 'pause', target: duel.loser.k,
        title: 'Приостановить «' + duel.loser.title + '»', effect: 'Объявление встанет на паузу. В группе останутся работающие варианты.',
        cost: duel.loser.cost, clicks: duel.loser.clicks, count: 0, from: adFrom, to: adTo,
        reason: 'В той же группе «' + duel.best.title + '» получило ' + duel.best.lib + ' целевых визитов за ' + duel.best.clicks + ' кликов.' });
    }
    candidates.sort((a, b) => b.cost - a.cost);
    if (candidates.length) items.push(candidates[0]);
  }

  const applied = new Set(log.filter((x) => x.ok && x.cid === cid && x.recommendationKey &&
    (x.reviewDate || '') >= today).map((x) => x.recommendationKey));
  const metric = paid ? 'Покупка' : 'Добавление в библиотеку';
  return {
    items: items.filter((p) => !applied.has(p.key)).sort((a, b) => b.cost - a.cost).slice(0, 8).map((p) => ({
        from: addDays(today, -29), to: today, ...p, cid, goal, metric, reviewDate: addDays(today, 8),
      })),
    note: 'По свежим отчётам нет изменений, которые стоит применить.',
  };
}
