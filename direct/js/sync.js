// Загрузка данных из Директа в базу (коллекция d_snap) и применение изменений.
// d_snap/main  — кампании, группы, фразы, объявления;  d_snap/stats — расход по дням, фразы и запросы за 30 дней.
// Расход связанных кампаний уходит в «Доходы» недельными отчётами (там считается окупаемость).
import { call, report, metrika } from './api.js';
import { MICRO, dailyRows, mergeDaily, toRequest, resultOf, describe, convRows, kwConvRows, metrikaRows } from './dcalc.js';
import { demoSnapshot, demoMetrikaSnap, isDemo, snap, putSnap, putLog } from './demo.js';
import { todayISO, addDays, weekStart } from '../../js/calc.js';
import { SESSION_METRICS, goalMetric, mkRows } from './mcalc.js';
import { reportId } from '../../js/parse.js';
import { uid } from '../../js/ui.js';

const rub = (micros) => (micros == null ? null : Math.round(micros / MICRO * 100) / 100);

// Запрос с запасным вариантом: если Директ не принял расширенные поля — повторяем с основными
async function getSafe(s, service, full, basic) {
  try { return await call(s, service, 'get', full); } catch (e) { if (e.code === 53 || e.code === 58 || e.code === 513 || !basic) throw e; return call(s, service, 'get', basic); }
}

export async function refresh(app, { onStep = () => {} } = {}) {
  const s = app.ctx().settings;
  if (isDemo()) { await putSnap(app, [...demoSnapshot(todayISO()), demoMetrikaSnap(todayISO())]); return; }
  const today = todayISO();
  onStep('Кампании…');
  const BASE = ['Id', 'Name', 'State', 'Status', 'StartDate', 'DailyBudget', 'NegativeKeywords', 'Type'];
  // счётчики Метрики и приоритетные цели кампании; если Директ не примет — без них, потом совсем просто
  let cr;
  try { cr = await call(s, 'campaigns', 'get', { SelectionCriteria: {}, FieldNames: BASE, TextCampaignFieldNames: ['BiddingStrategy', 'CounterIds', 'PriorityGoals'], UnifiedCampaignFieldNames: ['BiddingStrategy', 'CounterIds', 'PriorityGoals'] }); } catch (e) {
    if (e.transient || [53, 58, 513].includes(e.code)) throw e;
    cr = await getSafe(s, 'campaigns', { SelectionCriteria: {}, FieldNames: BASE, TextCampaignFieldNames: ['BiddingStrategy'], UnifiedCampaignFieldNames: ['BiddingStrategy'] }, { SelectionCriteria: {}, FieldNames: BASE.slice(0, 7) });
  }
  const campaigns = (cr.Campaigns || []).map((c) => {
    const x = c.TextCampaign || c.UnifiedCampaign || {}, st = x.BiddingStrategy || {};
    return {
      id: c.Id, name: c.Name, state: c.State, status: c.Status, type: c.Type || '', start: c.StartDate || '',
      daily: rub(c.DailyBudget?.Amount), negatives: c.NegativeKeywords?.Items || [],
      strategy: { search: st.Search?.BiddingStrategyType || '', network: st.Network?.BiddingStrategyType || '' },
      ...(x.CounterIds !== undefined ? { counters: x.CounterIds?.Items || [] } : {}),
      ...(x.PriorityGoals !== undefined ? { priorityGoals: (x.PriorityGoals?.Items || []).map((g) => g.GoalId) } : {}),
    };
  });
  const cids = campaigns.filter((c) => c.state !== 'ARCHIVED').map((c) => c.id);
  let groups = [], keywords = [], ads = [];
  if (cids.length) {
    onStep('Группы и фразы…');
    groups = ((await call(s, 'adgroups', 'get', { SelectionCriteria: { CampaignIds: cids }, FieldNames: ['Id', 'Name', 'CampaignId'] })).AdGroups || [])
      .map((g) => ({ id: g.Id, name: g.Name, cid: g.CampaignId }));
    const kr = await getSafe(s, 'keywords',
      { SelectionCriteria: { CampaignIds: cids }, FieldNames: ['Id', 'Keyword', 'AdGroupId', 'CampaignId', 'Bid', 'State', 'Status'] },
      { SelectionCriteria: { CampaignIds: cids }, FieldNames: ['Id', 'Keyword', 'AdGroupId', 'CampaignId', 'State', 'Status'] });
    keywords = (kr.Keywords || []).map((k) => ({ id: k.Id, phrase: k.Keyword, gid: k.AdGroupId, cid: k.CampaignId, bid: rub(k.Bid), state: k.State, status: k.Status }));
    onStep('Объявления…');
    const ar = await getSafe(s, 'ads',
      { SelectionCriteria: { CampaignIds: cids }, FieldNames: ['Id', 'AdGroupId', 'CampaignId', 'State', 'Status', 'StatusClarification'], TextAdFieldNames: ['Title', 'Title2', 'Text', 'Href'] },
      { SelectionCriteria: { CampaignIds: cids }, FieldNames: ['Id', 'AdGroupId', 'CampaignId', 'State', 'Status'] });
    ads = (ar.Ads || []).map((a) => ({ id: a.Id, gid: a.AdGroupId, cid: a.CampaignId, state: a.State, status: a.Status, note: a.StatusClarification || '',
      title: a.TextAd?.Title || '', title2: a.TextAd?.Title2 || '', text: a.TextAd?.Text || '', href: a.TextAd?.Href || '' }));
  }
  const old = snap(app, 'stats');
  onStep('Расход по дням…');
  const from = old?.daily?.length ? addDays(today, -14) : addDays(today, -89);
  const day = await report(s, { name: 'days', fields: ['Date', 'CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Cost'], from, to: today });
  const daily = mergeDaily(old?.daily || [], dailyRows(day), 400, today);
  onStep('Фразы и поисковые запросы…');
  const kwRows = await report(s, { name: 'kw', fields: ['CampaignId', 'CriterionId', 'Criterion', 'Impressions', 'Clicks', 'Cost'] });
  const kw = {};
  for (const r of kwRows) { const x = (kw[r.CriterionId] ||= { impr: 0, clicks: 0, cost: 0 }); x.impr += r.Impressions; x.clicks += r.Clicks; x.cost = Math.round((x.cost + r.Cost) * 100) / 100; }
  let queries = [];
  try {
    queries = (await report(s, { name: 'queries', type: 'SEARCH_QUERY_PERFORMANCE_REPORT', fields: ['Query', 'CampaignId', 'AdGroupId', 'Criterion', 'Impressions', 'Clicks', 'Cost'] }))
      .map((r) => ({ query: r.Query, cid: r.CampaignId, gid: r.AdGroupId, kw: r.Criterion, impr: r.Impressions, clicks: r.Clicks, cost: r.Cost }))
      .sort((a, b) => b.cost - a.cost).slice(0, 600);
  } catch (e) { console.warn('запросы', e); } // у кампаний только в сетях отчёта по запросам нет
  // Цели Метрики: конверсии по дням и по фразам (Директ считает их сам) + поведение на странице книги.
  // Любая неудача здесь не ломает загрузку: остаются прошлые данные, причина — в mErr
  const m = s.direct?.metrika || {}, goalIds = (m.goals || []).map((g) => String(g.id)).slice(0, 10);
  let conv = old?.conv || [], kwConv = old?.kwConv || {}, mrows = old?.mrows || [], mErr = '', mAt = old?.mAt || null;
  if (goalIds.length && cids.length) {
    try {
      onStep('Покупки по целям Метрики…');
      const cfrom = old?.conv?.length ? addDays(today, -14) : addDays(today, -89);
      conv = mergeDaily(conv, convRows(await report(s, { name: 'conv', fields: ['Date', 'CampaignId', 'Conversions'], from: cfrom, to: today, goals: goalIds })), 400, today);
      kwConv = kwConvRows(await report(s, { name: 'kwconv', fields: ['CriterionId', 'Conversions'], goals: goalIds }));
      mAt = new Date().toISOString();
    } catch (e) { mErr = e.transient ? 'Директ временно не отдал конверсии (сбой у Яндекса) — показаны прошлые.' : 'Конверсии по целям: ' + (e.message || e); }
  }
  if (m.counterId) {
    try {
      onStep('Метрика: что делают на странице книги…');
      mrows = metrikaRows(await metrika(s, 'stat/v1/data', { ids: m.counterId, metrics: 'ym:s:visits,ym:s:bounceRate,ym:s:pageDepth,ym:s:avgVisitDurationSeconds', dimensions: 'ym:s:lastsignDirectClickOrder', date1: '30daysAgo', date2: 'today', limit: 100 }));
    } catch (e) { mErr = [mErr, e.transient ? 'Метрика временно недоступна (сбой у Яндекса) — показаны прошлые данные.' : e.message].filter(Boolean).join(' '); }
  }
  const at = new Date().toISOString();
  await putSnap(app, [
    { id: 'main', at, sandbox: !!s.direct?.sandbox, campaigns, groups, keywords, ads },
    { id: 'stats', at, daily, kw, queries, conv, kwConv, mrows, mErr, mAt },
  ]);
  await pushToIncome(app, daily);
}

// Связанные кампании → недельные отчёты в «Доходах» (расход, показы, клики): там видно, окупается ли реклама
export async function pushToIncome(app, daily) {
  const c = app.ctx(), links = c.settings.direct?.links || {};
  const items = [];
  for (const [dcid, incomeId] of Object.entries(links)) {
    if (!incomeId || !c.data.campaigns.some((k) => k.id === incomeId)) continue;
    const weeks = {};
    for (const x of daily) {
      if (String(x.cid) !== String(dcid)) continue;
      const w = weekStart(x.date), r = (weeks[w] ||= { start: w, end: x.date, spend: 0, impressions: 0, clicks: 0 });
      if (x.date > r.end) r.end = x.date;
      r.spend += x.cost; r.impressions += x.impr; r.clicks += x.clicks;
    }
    for (const r of Object.values(weeks)) {
      if (!r.spend && !r.impressions) continue;
      items.push({ id: reportId(incomeId, r.start), campaignId: incomeId, start: r.start, end: r.end, spend: Math.round(r.spend * 100) / 100, impressions: r.impressions, clicks: r.clicks, src: 'direct' });
    }
  }
  const same = (a, b) => a && a.end === b.end && a.spend === b.spend && a.clicks === b.clicks;
  const changed = items.filter((x) => !same(c.data.reports.find((r) => r.id === x.id), x));
  if (changed.length) await app.store.putMany('reports', changed);
}

// Имена для понятных описаний действий
export function namesOf(main) {
  const by = (arr, f) => Object.fromEntries((arr || []).map((x) => [x.id, f(x)]));
  return { campaigns: by(main?.campaigns, (x) => x.name), keywords: by(main?.keywords, (x) => x.phrase), groups: by(main?.groups, (x) => x.name), ads: by(main?.ads, (x) => x.title) };
}

// Применить одно действие. by — 'app' (нажала в приложении) или 'ai' (из плана ИИ)
export async function apply(app, a, { by = 'app' } = {}) {
  const s = app.ctx().settings, main = snap(app, 'main') || { campaigns: [], keywords: [], ads: [], groups: [] };
  const text = describe(a, namesOf(main));
  let negatives = main.campaigns.find((x) => x.id === a.campaign)?.negatives || [];
  let out = { ok: 1, errors: [], warnings: [] };
  if (!isDemo()) {
    // минус-фразы перечитываем прямо перед записью: вдруг их меняли в кабинете
    if (a.do === 'minus' || a.do === 'unminus') {
      const r = await call(s, 'campaigns', 'get', { SelectionCriteria: { Ids: [a.campaign] }, FieldNames: ['Id', 'NegativeKeywords'] });
      negatives = r.Campaigns?.[0]?.NegativeKeywords?.Items || [];
    }
    const camp = main.campaigns.find((x) => x.id === a.campaign) || {};
    const q = toRequest(a, { negatives, counters: camp.counters || [], campType: camp.type });
    out = resultOf(await call(s, q.service, q.method, q.params), q.key);
  }
  if (!out.errors.length) await putSnap(app, [patchSnap(main, a, negatives)]);
  await putLog(app, { id: 'l' + uid(), at: new Date().toISOString(), by, do: a.do, cid: cidOf(main, a), text, why: a.why || '', ok: !out.errors.length, errors: out.errors, warnings: out.warnings, ...(isDemo() ? { demo: true } : {}) });
  return { ...out, text };
}

// К какой кампании относится действие (для разбора «что изменилось после правки»)
export function cidOf(main, a) {
  if (a.campaign) return a.campaign;
  if (a.do === 'bid') return main.keywords.find((x) => x.id === a.keyword)?.cid ?? null;
  if (a.do === 'keywords') return main.groups.find((x) => x.id === a.group)?.cid ?? null;
  if (a.target === 'campaign') return a.ids[0];
  const list = a.target === 'keyword' ? main.keywords : main.ads;
  return list.find((x) => x.id === a.ids?.[0])?.cid ?? null;
}

// Сразу показать изменение в приложении, не дожидаясь следующей загрузки
function patchSnap(main, a, negatives) {
  const m = JSON.parse(JSON.stringify(main));
  const camp = m.campaigns.find((x) => x.id === a.campaign);
  if (a.do === 'minus' && camp) camp.negatives = toRequest(a, { negatives }).items;
  if (a.do === 'unminus' && camp) camp.negatives = toRequest(a, { negatives }).items;
  if (a.do === 'pause' || a.do === 'resume') {
    const list = { campaign: m.campaigns, keyword: m.keywords, ad: m.ads }[a.target];
    for (const x of list) if (a.ids.includes(x.id)) x.state = a.do === 'pause' ? 'SUSPENDED' : 'ON';
  }
  if (a.do === 'bid') { const k = m.keywords.find((x) => x.id === a.keyword); if (k) k.bid = a.rub; }
  if (a.do === 'counter' && camp) camp.counters = toRequest(a, { counters: camp.counters || [], campType: camp.type }).items;
  if (a.do === 'keywords') {
    const g = m.groups.find((x) => x.id === a.group);
    for (const p of a.phrases) m.keywords.push({ id: -Date.now() - m.keywords.length, phrase: p, gid: a.group, cid: g?.cid, bid: null, state: 'ON', status: 'DRAFT' });
  }
  return m;
}

// ---------- Метрика сама по себе (работает, даже пока Директ не подключён или отказывает) ----------
// d_snap/mk: по дням за 8 недель, источники, детальные источники, устройства, страницы входа — за 30 дней
export async function refreshMetrika(app) {
  const s = app.ctx().settings, m = s.direct?.metrika;
  if (isDemo()) { await putSnap(app, [demoMetrikaSnap(todayISO())]); return; }
  if (!m?.counterId || !s.directToken) return;
  const goals = (m.goals || []).map((g) => g.id).slice(0, 10);
  const metrics = [...SESSION_METRICS, ...goals.map(goalMetric)].join(',');
  const today = todayISO(), errors = [];
  const get = async (dimensions, from, limit = 100, sort = '-ym:s:visits') => {
    try {
      return mkRows(await metrika(s, 'stat/v1/data', { ids: m.counterId, metrics, dimensions, date1: from, date2: today, limit, sort, lang: 'ru', accuracy: 'full' }), goals);
    } catch (e) { errors.push(e.message); if (e.transient) throw e; return null; }
  };
  const d30 = addDays(today, -29);
  const daily = await get('ym:s:date', addDays(today, -55), 100, 'ym:s:date');
  const sources = await get('ym:s:lastTrafficSource', d30, 20);
  const engines = await get('ym:s:lastSourceEngine', d30, 30);
  const devices = await get('ym:s:deviceCategory', d30, 10);
  const pages = await get('ym:s:startURL', d30, 100);
  const utm = await get('ym:s:lastUTMSource,ym:s:lastUTMMedium,ym:s:lastUTMCampaign,ym:s:lastUTMContent', d30, 100);
  // права на счётчик (own — свой, edit — можно менять, view — только смотреть): от них зависит, можно ли включить фильтры
  let perm = null;
  try { perm = (await metrika(s, `management/v1/counter/${m.counterId}`, {})).counter?.permission || null; } catch { /* не важно */ }
  const old = snap(app, 'mk') || {};
  await putSnap(app, [{ id: 'mk', at: new Date().toISOString(), counterId: m.counterId, goals, perm: perm ?? old.perm ?? null, daily: daily ?? old.daily ?? [], sources: sources ?? old.sources ?? [], engines: engines ?? old.engines ?? [], devices: devices ?? old.devices ?? [], pages: pages ?? old.pages ?? [], utm: utm ?? old.utm ?? [], errors }]);
}
