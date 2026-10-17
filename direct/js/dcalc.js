// Расчёты приложения «Директ»: итоги по дням, подсказки «что сделать», пакет для ИИ и разбор его ответа.
// Здесь только чистые функции — без сети и без страницы (их проверяют тесты).

export const MICRO = 1_000_000; // деньги в API Директа: 1 ₽ = 1 000 000
export const DEFAULT_MAX_BID = 50; // ₽ — дороже приложение ставку не поставит
export const DEFAULT_TEST_BUDGET = 10000;

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

// ---------- отчёты Директа (TSV с заголовком колонок) ----------
const NUMERIC = new Set(['Impressions', 'Clicks', 'Cost', 'CampaignId', 'AdGroupId', 'CriterionId', 'AdId', 'Conversions']);
// поля по целям Метрики: Conversions_<цель>_LSC и т. п.
const GOAL_COL = /^(Conversions|CostPerConversion|ConversionRate|Revenue|GoalsRoi)_\d+_/;
export function parseTsv(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split('\t');
  return lines.slice(1).filter((l) => !/^Total rows/i.test(l)).map((l) => {
    const cells = l.split('\t'), o = {};
    head.forEach((h, i) => {
      const v = cells[i] ?? '';
      o[h] = NUMERIC.has(h) || GOAL_COL.test(h) ? (v === '--' || v === '' ? 0 : Number(v)) : v;
    });
    return o;
  });
}

// ---------- итоги ----------
export const ctr = (x) => (x.impr ? x.clicks / x.impr : null);
export const cpc = (x) => (x.clicks ? x.cost / x.clicks : null);

// Строки отчёта «по дням» → [{date, cid, name, impr, clicks, cost}]
export function dailyRows(rows) {
  return rows.map((r) => ({ date: r.Date, cid: r.CampaignId, name: r.CampaignName || '', impr: r.Impressions, clicks: r.Clicks, cost: r2(r.Cost) }));
}
// Склеить новые дни со старыми (свежие заменяют) и обрезать историю до keep дней
export function mergeDaily(old = [], fresh = [], keep = 400, today = null) {
  const m = new Map(old.map((x) => [`${x.date}_${x.cid}`, x]));
  for (const x of fresh) m.set(`${x.date}_${x.cid}`, x);
  const from = today ? addDays(today, -keep) : '';
  return [...m.values()].filter((x) => x.date >= from).sort((a, b) => a.date.localeCompare(b.date) || a.cid - b.cid);
}
export function totals(daily, from, to, cid = null) {
  const t = { impr: 0, clicks: 0, cost: 0, days: new Set() };
  for (const x of daily) {
    if (x.date < from || x.date > to || (cid != null && x.cid !== cid)) continue;
    t.impr += x.impr; t.clicks += x.clicks; t.cost += x.cost;
    if (x.cost > 0 || x.impr > 0) t.days.add(x.date);
  }
  return { impr: t.impr, clicks: t.clicks, cost: r2(t.cost), activeDays: t.days.size, ctr: ctr(t), cpc: cpc(t) };
}
// Расход по дням за n дней до to включительно — для графика
export function spendSeries(daily, to, n = 30, cid = null) {
  const by = {};
  for (const x of daily) if (cid == null || x.cid === cid) by[x.date] = (by[x.date] || 0) + x.cost;
  return Array.from({ length: n }, (_, i) => { const d = addDays(to, i - n + 1); return { date: d, value: r2(by[d] || 0) }; });
}
// Тестовый бюджет: сколько потрачено с даты старта и на сколько дней хватит при текущем темпе
export function budgetPace(daily, { budget, from, today }) {
  const spent = totals(daily, from || '0000', today).cost;
  const last7 = totals(daily, addDays(today, -6), today);
  const perDay = last7.activeDays ? last7.cost / 7 : 0;
  const left = Math.max(0, budget - spent);
  return { budget, spent, left, share: budget ? spent / budget : 0, perDay: r2(perDay), daysLeft: perDay > 0 ? Math.floor(left / perDay) : null };
}

// ---------- цели Метрики: покупки и другие конверсии (их считает сам Директ по целям счётчика) ----------
const convCols = (row) => Object.keys(row).filter((k) => /^Conversions_\d+_/.test(k));
const goalIdOf = (k) => k.split('_')[1];
// Строки отчёта «по дням» с Goals → [{date, cid, conv: {цель: число}}] (дни без конверсий не храним)
export function convRows(rows) {
  return rows.map((r) => ({ date: r.Date, cid: r.CampaignId, conv: Object.fromEntries(convCols(r).map((k) => [goalIdOf(k), r[k] || 0]).filter(([, v]) => v > 0)) }))
    .filter((x) => Object.keys(x.conv).length);
}
// Строки отчёта по фразам с Goals → {CriterionId: {цель: число}}
export function kwConvRows(rows) {
  const out = {};
  for (const r of rows) for (const k of convCols(r)) if (r[k] > 0) { const x = (out[r.CriterionId] ||= {}); x[goalIdOf(k)] = (x[goalIdOf(k)] || 0) + r[k]; }
  return out;
}
// Сумма по выбранным целям (goals — список номеров; пусто — все)
export const sumGoals = (obj, goals = null) => Object.entries(obj || {}).reduce((a, [g, n]) => a + (!goals?.length || goals.map(String).includes(String(g)) ? n : 0), 0);
// Конверсии за период; skip — даты, которые не считаем (сбой «не от меня»)
export function convTotal(conv = [], from, to, cid = null, goals = null, skip = null) {
  let n = 0;
  for (const x of conv) if (x.date >= from && x.date <= to && (cid == null || x.cid === cid) && !skip?.has(x.date)) n += sumGoals(x.conv, goals);
  return n;
}
// Итоги с покупками: расход, клики, конверсии, цена конверсии (CPA), доля кликов, ставших конверсией
export function goalTotals(daily, conv, from, to, { cid = null, goals = null, skip = null } = {}) {
  const t = { impr: 0, clicks: 0, cost: 0 };
  for (const x of daily) if (x.date >= from && x.date <= to && (cid == null || x.cid === cid) && !skip?.has(x.date)) { t.impr += x.impr; t.clicks += x.clicks; t.cost += x.cost; }
  const n = convTotal(conv, from, to, cid, goals, skip);
  return { ...t, cost: r2(t.cost), conv: n, cpa: n ? r2(t.cost / n) : null, cr: t.clicks ? n / t.clicks : null };
}
// Ответ Метрики stat/v1/data по кампаниям Директа → [{cid, name, visits, bounce (доля), depth, dur (сек)}]
export function metrikaRows(json) {
  return (json?.data || []).map((r) => {
    const d = r.dimensions?.[0] || {}, [visits = 0, bounce = 0, depth = 0, dur = 0] = r.metrics || [];
    return { cid: Number(String(d.id ?? '').replace(/\D/g, '')) || null, name: d.name || '', visits: Math.round(visits), bounce: bounce / 100, depth: r2(depth), dur: Math.round(dur) };
  });
}
export const metrikaFor = (rows = [], camp) => rows.find((r) => (r.cid && r.cid === camp.id) || (r.name && r.name === camp.name)) || null;

// Аналитик: что видно только с целями Метрики. m — {counterId, main: [цели «покупка»]}.
// Выводы осторожные: на малых числах не советуем (мало кликов — рано).
export function goalHints({ campaigns = [], keywords = [], kw = {}, kwConv = {}, daily = [], conv = [], mrows = [], m = {}, today, skip = null }) {
  const out = [], goals = m.main?.length ? m.main : null, from = addDays(today, -29);
  for (const c of campaigns) {
    if (c.state !== 'ON') continue;
    if (m.counterId && /TEXT_CAMPAIGN|UNIFIED_CAMPAIGN/.test(c.type || '') && Array.isArray(c.counters) && !c.counters.map(Number).includes(Number(m.counterId))) {
      out.push({ kind: 'counter', cid: c.id, name: c.name, why: 'к кампании не привязан ваш счётчик Метрики — Директ не видит покупки и не может учиться на них', lesson: 'goals' });
      continue;
    }
    const g = goalTotals(daily, conv, from, today, { cid: c.id, goals, skip });
    if (!g.conv && g.clicks >= 50) out.push({ kind: 'zero', cid: c.id, name: c.name, ...g, why: `за 30 дней ${g.clicks} кликов и ни одной конверсии по выбранной цели — проверьте, та ли цель выбрана, и что страница книги убеждает`, lesson: 'goals' });
    const mr = metrikaFor(mrows, c);
    if (mr && mr.visits >= 30 && mr.bounce >= 0.6) out.push({ kind: 'bounce', cid: c.id, name: c.name, ...mr, why: `${Math.round(mr.bounce * 100)} % посетителей уходят сразу: объявление обещает не то, что они видят на странице книги, или приходят не те люди`, lesson: 'goals' });
    if (g.conv < 3) continue; // средняя цена покупки ещё ненадёжна
    for (const k of keywords) {
      if (k.cid !== c.id || k.state === 'SUSPENDED' || k.state === 'OFF') continue;
      const s = kw[k.id], n = sumGoals(kwConv[k.id], goals);
      if (!s) continue;
      if (!n && s.clicks >= 15 && s.cost >= 2 * g.cpa) out.push({ kind: 'noconv', cid: c.id, id: k.id, phrase: k.phrase, ...s, cpa: g.cpa, why: `потратила ${Math.round(s.cost)} ₽ (больше двух средних покупок по ${Math.round(g.cpa)} ₽) и ни одной покупки`, lesson: 'goals' });
      else if (n >= 2 && s.cost / n <= 0.6 * g.cpa) out.push({ kind: 'winner', cid: c.id, id: k.id, phrase: k.phrase, ...s, conv: n, cpa: r2(s.cost / n), avg: g.cpa, why: `покупка по ${Math.round(s.cost / n)} ₽ — заметно дешевле средней (${Math.round(g.cpa)} ₽): эта фраза приводит ваших читателей`, lesson: 'goals' });
    }
  }
  const order = { counter: 0, noconv: 1, zero: 2, bounce: 3, winner: 4 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || (b.cost || 0) - (a.cost || 0));
}

// ---------- подсказки ----------
// Слова, с которыми к книге обычно приходят не покупатели. Это КАНДИДАТЫ в минус-фразы — решает владелица.
export const JUNK = [
  ['бесплатн', 'бесплатно', 'ищут бесплатно — чаще всего не покупают'],
  ['скачать', 'скачать', 'хотят скачать файл, а не читать на площадке'],
  ['fb2', 'fb2', 'ищут файл для скачивания'],
  ['epub', 'epub', 'ищут файл для скачивания'],
  ['txt', 'txt', 'ищут файл для скачивания'],
  ['pdf', 'pdf', 'ищут файл для скачивания'],
  ['торрент', 'торрент', 'ищут пиратскую копию'],
  ['флибуст', 'флибуста', 'ищут пиратскую библиотеку'],
  ['краткое содержание', 'краткое содержание', 'школьники ищут пересказ'],
  ['фильм', 'фильм', 'ищут кино, а не книгу'],
  ['сериал', 'сериал', 'ищут сериал, а не книгу'],
];
export function junkOf(query) {
  const q = String(query || '').toLowerCase();
  return JUNK.find(([stem]) => q.includes(stem)) || null;
}
const norm = (s) => String(s || '').toLowerCase().replace(/^[-!+"\s]+|["\s]+$/g, '').replace(/\s+/g, ' ');
export function hasNegative(negatives = [], word) {
  const w = norm(word);
  return negatives.some((n) => norm(n) === w);
}

// Поисковые запросы → подсказки «в минус»: кандидаты по словам из JUNK
export function queryHints(queries = [], negativesByCampaign = {}) {
  const out = [];
  for (const q of queries) {
    const neg = negativesByCampaign[q.cid] || [];
    const low = String(q.query || '').toLowerCase();
    // первое лишнее слово, которого ещё нет в минус-фразах кампании
    const j = JUNK.find(([stem, word]) => low.includes(stem) && !hasNegative(neg, word));
    if (j) out.push({ kind: 'minus', cid: q.cid, word: j[1], query: q.query, cost: q.cost, clicks: q.clicks, why: j[2] });
  }
  // одно слово-кандидат на кампанию — одна подсказка (с суммой по всем запросам)
  const m = new Map();
  for (const h of out) {
    const k = `${h.cid}|${h.word}`, x = m.get(k);
    if (x) { x.cost = r2(x.cost + h.cost); x.clicks += h.clicks; x.queries.push(h.query); } else m.set(k, { ...h, queries: [h.query] });
  }
  return [...m.values()].sort((a, b) => b.cost - a.cost);
}

// Ключевые фразы: на что посмотреть. stats — {criterionId: {impr, clicks, cost}} за 30 дней.
export function keywordHints(keywords = [], stats = {}) {
  const out = [];
  for (const k of keywords) {
    if (k.state === 'SUSPENDED' || k.state === 'OFF') continue;
    const s = stats[k.id];
    if (!s) continue;
    const c = ctr(s);
    if (s.impr >= 300 && c != null && c < 0.005) out.push({ kind: 'lowctr', cid: k.cid, id: k.id, phrase: k.phrase, ...s, why: 'много показов, но почти не нажимают: фраза не про вашу книгу или объявление не цепляет' });
    else if (s.clicks >= 10 && s.cost >= 300 && cpc(s) > 2 * (k.avgCpc || Infinity)) out.push({ kind: 'expensive', cid: k.cid, id: k.id, phrase: k.phrase, ...s, why: 'клик заметно дороже, чем в среднем по кампании' });
  }
  return out;
}

// Средняя цена клика по кампании — для сравнения фраз между собой
export function withAvgCpc(keywords, stats) {
  const by = {};
  for (const k of keywords) { const s = stats[k.id]; if (!s) continue; (by[k.cid] ||= { clicks: 0, cost: 0 }); by[k.cid].clicks += s.clicks; by[k.cid].cost += s.cost; }
  return keywords.map((k) => ({ ...k, avgCpc: by[k.cid]?.clicks ? by[k.cid].cost / by[k.cid].clicks : null }));
}

// ---------- ИИ: пакет со всеми данными и разбор ответа ----------
export const PLAN_TAG = 'direct-plan';
export const ACTIONS = {
  minus: 'Добавить минус-фразы',
  unminus: 'Убрать минус-фразы',
  pause: 'Остановить',
  resume: 'Запустить',
  bid: 'Поменять ставку',
  keywords: 'Добавить ключевые фразы',
};

export function aiPackage(state, { today, maxBid = DEFAULT_MAX_BID, budget, question = '' } = {}) {
  const lines = [];
  lines.push('# Яндекс Директ: данные для разбора');
  lines.push('');
  lines.push('Ты — опытный специалист по Яндекс Директу, который рекламирует книги (любовные романы на Литнете).');
  lines.push('Владелица не программист и учится: объясняй просто, по-русски, коротко. Не выдумывай данных, которых нет.');
  lines.push('Реклама ведёт на страницу книги на Литнете. На Литнете у владелицы стоит счётчик Яндекс Метрики автора: если в данных есть goals/conversions — это конверсии по его целям (атрибуция LSC). Окупаемость по настоящим деньгам считается в приложении «Доходы» по выгрузке Литнета.');
  lines.push('Если в данных есть outageDays — это дни сбоя у Яндекса или площадки: не делай по ним выводов.');
  lines.push('');
  lines.push('Сделай: 1) короткий разбор — что работает, что сливает деньги; 2) план изменений в формате ниже.');
  lines.push(`Ограничения: бюджет не меняй (его меняет только владелица); ставка не выше ${maxBid} ₽; у каждого действия — короткое «почему».`);
  if (question) { lines.push(''); lines.push('Вопрос владелицы: ' + question); }
  lines.push('');
  lines.push('## Формат плана (приложение само покажет каждое действие и применит только то, что она отметит)');
  lines.push('```' + PLAN_TAG);
  lines.push(JSON.stringify({ actions: [
    { do: 'minus', campaign: 123, phrases: ['бесплатно'], why: 'запросы «читать бесплатно» съели 240 ₽' },
    { do: 'unminus', campaign: 123, phrases: ['слово'], why: '…' },
    { do: 'pause', target: 'keyword', ids: [456], why: '…' },
    { do: 'resume', target: 'campaign', ids: [123], why: '…' },
    { do: 'bid', keyword: 456, rub: 12.5, why: '…' },
    { do: 'keywords', group: 789, phrases: ['роман про истинную пару'], why: '…' },
  ] }, null, 1));
  lines.push('```');
  lines.push('target для pause/resume: campaign | keyword | ad. ID бери только из данных ниже.');
  lines.push('');
  lines.push(`## Данные (на ${today}, деньги в рублях с НДС)`);
  lines.push('```json');
  lines.push(JSON.stringify({ budget, ...state }, null, 1));
  lines.push('```');
  return lines.join('\n');
}

const ids = (v) => (Array.isArray(v) ? v : [v]).map(Number).filter((x) => Number.isInteger(x) && x > 0);
const phrases = (v) => [...new Set((Array.isArray(v) ? v : [v]).map((x) => String(x ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean))];

// Ответ ИИ → проверенный список действий. Берётся блок ```direct-plan (или любой JSON с "actions").
export function parsePlan(text, { maxBid = DEFAULT_MAX_BID } = {}) {
  const src = String(text || '');
  const block = new RegExp('```\\s*' + PLAN_TAG + '\\s*([\\s\\S]*?)```').exec(src)?.[1]
    ?? /```(?:json)?\s*(\{[\s\S]*?"actions"[\s\S]*?\})\s*```/.exec(src)?.[1]
    ?? (/^\s*\{[\s\S]*\}\s*$/.test(src) ? src : null);
  if (!block) return { actions: [], errors: ['В ответе нет плана. Попросите ИИ прислать план в блоке ```' + PLAN_TAG + '.'] };
  let data;
  try { data = JSON.parse(block); } catch { return { actions: [], errors: ['План написан с ошибкой — попросите ИИ прислать его заново, без изменений формата.'] }; }
  const list = Array.isArray(data) ? data : data.actions;
  if (!Array.isArray(list)) return { actions: [], errors: ['В плане нет списка actions.'] };
  const actions = [], errors = [];
  list.forEach((a, i) => {
    const n = `Пункт ${i + 1}`, why = String(a?.why || '').trim();
    const t = a?.do;
    if (t === 'minus' || t === 'unminus') {
      const cid = ids(a.campaign)[0], ph = phrases(a.phrases);
      if (!cid || !ph.length) return errors.push(`${n}: нужны campaign и phrases.`);
      actions.push({ do: t, campaign: cid, phrases: ph, why });
    } else if (t === 'pause' || t === 'resume') {
      const target = a.target || 'campaign', list2 = ids(a.ids);
      if (!['campaign', 'keyword', 'ad'].includes(target) || !list2.length) return errors.push(`${n}: нужны target (campaign, keyword, ad) и ids.`);
      actions.push({ do: t, target, ids: list2, why });
    } else if (t === 'bid') {
      const kw = ids(a.keyword)[0], rub = Number(String(a.rub).replace(',', '.'));
      if (!kw || !(rub > 0)) return errors.push(`${n}: нужны keyword и rub больше нуля.`);
      if (rub > maxBid) return errors.push(`${n}: ставка ${rub} ₽ выше предела ${maxBid} ₽ — пропущено.`);
      actions.push({ do: 'bid', keyword: kw, rub: r2(rub), why });
    } else if (t === 'keywords') {
      const g = ids(a.group)[0], ph = phrases(a.phrases);
      if (!g || !ph.length) return errors.push(`${n}: нужны group и phrases.`);
      actions.push({ do: 'keywords', group: g, phrases: ph, why });
    } else if (/budget|бюджет/i.test(JSON.stringify(a || {}))) {
      errors.push(`${n}: бюджет приложение не меняет — это только вручную в кабинете.`);
    } else errors.push(`${n}: неизвестное действие «${t ?? ''}».`);
  });
  return { actions, errors };
}

// Понятное описание действия. names — {campaigns: {id: имя}, keywords: {id: фраза}, groups: {id: имя}, ads: {id: заголовок}}
export function describe(a, names = {}) {
  const nm = (kind, id) => names[kind]?.[id] ? `«${names[kind][id]}»` : `№${id}`;
  const TGT = { campaign: ['кампанию', 'кампании', 'campaigns'], keyword: ['фразу', 'фразы', 'keywords'], ad: ['объявление', 'объявления', 'ads'] };
  switch (a.do) {
    case 'minus': return `Кампания ${nm('campaigns', a.campaign)}: добавить минус-фразы — ${a.phrases.join(', ')}`;
    case 'unminus': return `Кампания ${nm('campaigns', a.campaign)}: убрать минус-фразы — ${a.phrases.join(', ')}`;
    case 'pause': case 'resume': {
      const [one, many, kind] = TGT[a.target];
      return `${a.do === 'pause' ? 'Остановить' : 'Запустить'} ${a.ids.length > 1 ? many : one}: ${a.ids.map((id) => nm(kind, id)).join(', ')}`;
    }
    case 'bid': return `Фраза ${nm('keywords', a.keyword)}: ставка на поиске ${String(a.rub).replace('.', ',')} ₽`;
    case 'keywords': return `Группа ${nm('groups', a.group)}: добавить фразы — ${a.phrases.join(', ')}`;
    case 'counter': return `Кампания ${nm('campaigns', a.campaign)}: привязать счётчик Метрики №${a.counter}`;
    default: return 'Неизвестное действие';
  }
}

// Действие → запрос к API Директа. negatives — текущие минус-фразы кампании (update заменяет список целиком).
export function toRequest(a, { negatives = [], counters = [], campType = '' } = {}) {
  const SVC = { campaign: 'campaigns', keyword: 'keywords', ad: 'ads' };
  switch (a.do) {
    case 'minus': {
      const add = a.phrases.filter((p) => !hasNegative(negatives, p));
      return { service: 'campaigns', method: 'update', key: 'UpdateResults', items: [...negatives, ...add], params: { Campaigns: [{ Id: a.campaign, NegativeKeywords: { Items: [...negatives, ...add] } }] } };
    }
    case 'unminus': {
      const left = negatives.filter((n) => !a.phrases.some((p) => norm(p) === norm(n)));
      // пустой список минус-фраз Директ принимает как «убрать все» (null)
      return { service: 'campaigns', method: 'update', key: 'UpdateResults', items: left, params: { Campaigns: [{ Id: a.campaign, NegativeKeywords: left.length ? { Items: left } : null }] } };
    }
    case 'pause': case 'resume':
      return { service: SVC[a.target], method: a.do === 'pause' ? 'suspend' : 'resume', key: a.do === 'pause' ? 'SuspendResults' : 'ResumeResults', params: { SelectionCriteria: { Ids: a.ids } } };
    case 'bid':
      return { service: 'keywordbids', method: 'set', key: 'SetResults', params: { KeywordBids: [{ KeywordId: a.keyword, SearchBid: Math.round(a.rub * MICRO) }] } };
    case 'keywords':
      return { service: 'keywords', method: 'add', key: 'AddResults', params: { Keywords: a.phrases.map((p) => ({ Keyword: p, AdGroupId: a.group })) } };
    case 'counter': {
      // счётчики кампании заменяются списком целиком — добавляем свой к уже привязанным
      const items = [...new Set([...counters.map(Number), Number(a.counter)])];
      const key = campType === 'UNIFIED_CAMPAIGN' ? 'UnifiedCampaign' : 'TextCampaign';
      return { service: 'campaigns', method: 'update', key: 'UpdateResults', items, params: { Campaigns: [{ Id: a.campaign, [key]: { CounterIds: { Items: items } } }] } };
    }
    default: throw new Error('неизвестное действие');
  }
}

// Ответ Директа на запись → {ok, errors[], warnings[]}
export function resultOf(result, key) {
  const items = result?.[key] || [], errors = [], warnings = [];
  let ok = 0;
  for (const it of items) {
    if (it.Errors?.length) errors.push(...it.Errors.map((e) => `${e.Message}${e.Details ? ': ' + e.Details : ''}`));
    else ok++;
    if (it.Warnings?.length) warnings.push(...it.Warnings.map((e) => `${e.Message}${e.Details ? ': ' + e.Details : ''}`));
  }
  return { ok, errors, warnings };
}

// ---------- наставник: этап теста и разбор динамики ----------
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
export const MIN_CLICKS = 20; // меньше кликов — выводы делать рано

// Этап теста: по дню с начала и потраченному
export function testStage({ from, today, spent, budget }) {
  const day = from ? daysBetween(from, today) + 1 : null;
  if (!day || day < 1) return { key: 'prep', day: 0 };
  if (budget && spent >= budget) return { key: 'results', day };
  if (day <= 3) return { key: 'start', day };
  if (day <= 7) return { key: 'clean', day };
  if (day <= 14) return { key: 'optimize', day };
  return { key: 'results', day };
}

// Сравнить два отрезка: цена клика и CTR, с осторожностью к малым числам
export function compare(daily, cid, a, b) {
  const x = totals(daily, a[0], a[1], cid), y = totals(daily, b[0], b[1], cid);
  const enough = x.clicks >= MIN_CLICKS && y.clicks >= MIN_CLICKS;
  const ch = (p, q) => (p != null && q != null && p > 0 ? (q - p) / p : null);
  return { before: x, after: y, enough, cpc: ch(x.cpc, y.cpc), ctr: ch(x.ctr, y.ctr), perDay: ch(x.cost / Math.max(1, daysBetween(a[0], a[1]) + 1), y.cost / Math.max(1, daysBetween(b[0], b[1]) + 1)) };
}

// Что изменилось после правок из «Истории»: 7 дней до и дни после (не меньше 3)
export function changeEffects(daily, log, today, cidOf = (x) => x.cid) {
  const out = [];
  for (const x of log || []) {
    if (!x.ok) continue;
    const d = x.at.slice(0, 10), after = daysBetween(d, today);
    if (after < 3 || after > 30) continue;
    const cid = cidOf(x);
    const r = compare(daily, cid, [addDays(d, -7), addDays(d, -1)], [addDays(d, 1), addDays(d, Math.min(after, 7))]);
    out.push({ log: x, days: Math.min(after, 7), ...r });
  }
  return out;
}

// Покупки неделя к неделе (по главной цели): осторожно, только когда покупок достаточно
export function goalWeekInsight(daily, conv, today, goals = null, skip = null) {
  const a = goalTotals(daily, conv, addDays(today, -13), addDays(today, -7), { goals, skip }), b = goalTotals(daily, conv, addDays(today, -6), today, { goals, skip });
  if (!a.clicks && !b.clicks) return null;
  if (a.conv < 3 || b.conv < 3) return { kind: 'few', text: `Покупок по главной цели: ${b.conv} за неделю (неделей раньше — ${a.conv}).`, why: 'Пока покупок мало, их цена скачет случайно — смотрите на месяц, а не на неделю.', lesson: 'goals' };
  const ch = (b.cpa - a.cpa) / a.cpa;
  if (Math.abs(ch) < 0.15) return { kind: 'calm', text: `Покупка обходится примерно так же: ${Math.round(b.cpa)} ₽ (было ${Math.round(a.cpa)} ₽), покупок ${b.conv}.`, why: 'Стабильно — можно спокойно пробовать по одной правке за раз.', lesson: 'goals' };
  return ch < 0
    ? { kind: 'good', text: `Покупка подешевела на ${Math.round(-ch * 100)} %: ${Math.round(b.cpa)} ₽ вместо ${Math.round(a.cpa)} ₽.`, why: 'Реклама стала приводить больше покупателей на те же деньги — посмотрите, какая правка это сделала («Что изменилось после ваших правок»).', lesson: 'goals' }
    : { kind: 'bad', text: `Покупка подорожала на ${Math.round(ch * 100)} %: ${Math.round(b.cpa)} ₽ вместо ${Math.round(a.cpa)} ₽.`, why: 'Проверьте фразы без покупок (Обзор → «Что сделать сейчас») и не было ли сбоя площадки — дни сбоя отметьте в «Доходах».', lesson: 'goals' };
}

// Неделя к неделе: короткие выводы простыми словами (что случилось → почему это важно)
export function weekInsights(daily, today, cid = null) {
  const r = compare(daily, cid, [addDays(today, -13), addDays(today, -7)], [addDays(today, -6), today]);
  const out = [];
  if (!r.after.clicks && !r.before.clicks) return out;
  if (!r.enough) { out.push({ kind: 'few', text: `За неделю ${r.after.clicks} клик(ов) — пока мало, чтобы судить о цене клика и CTR. Нужно хотя бы ${MIN_CLICKS} кликов за неделю.`, lesson: 'numbers' }); return out; }
  if (r.cpc != null && Math.abs(r.cpc) >= 0.1) out.push({ kind: r.cpc < 0 ? 'good' : 'bad', text: `Клик ${r.cpc < 0 ? 'подешевел' : 'подорожал'} на ${Math.round(Math.abs(r.cpc) * 100)} %: было ${r2(r.before.cpc)} ₽, стало ${r2(r.after.cpc)} ₽.`, why: r.cpc < 0 ? 'Обычно это значит, что убрали лишние дорогие запросы или объявление стало кликабельнее — Директ за это даёт скидку в аукционе.' : 'Бывает из-за конкурентов (другие авторы подняли ставки), из-за новых широких фраз или потому, что у объявления упал CTR.', lesson: 'bids' });
  if (r.ctr != null && Math.abs(r.ctr) >= 0.15) out.push({ kind: r.ctr > 0 ? 'good' : 'bad', text: `CTR ${r.ctr > 0 ? 'вырос' : 'упал'} на ${Math.round(Math.abs(r.ctr) * 100)} %: было ${r2(r.before.ctr * 100)} %, стало ${r2(r.after.ctr * 100)} %.`, why: r.ctr > 0 ? 'Объявление чаще попадает в то, что ищут, — минус-фразы и точные фразы работают.' : 'Объявление стали показывать менее подходящим людям или оно «приелось». Проверьте запросы и попробуйте второй вариант текста.', lesson: r.ctr > 0 ? 'minus' : 'ad' });
  if (r.perDay != null && r.perDay >= 0.3) out.push({ kind: 'warn', text: `Тратится в день на ${Math.round(r.perDay * 100)} % больше, чем неделей раньше.`, why: 'Проверьте, что дневной лимит в кабинете стоит так, как вы задумали.', lesson: 'budget' });
  if (!out.length) out.push({ kind: 'calm', text: 'Неделя прошла ровно: цена клика и CTR почти не изменились.', why: 'Это хорошо для теста — можно спокойно смотреть, как реклама отражается на продажах в «Доходах».', lesson: 'payback' });
  return out;
}
