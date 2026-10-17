import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTsv, dailyRows, mergeDaily, totals, spendSeries, budgetPace, queryHints, keywordHints, withAvgCpc, junkOf, parsePlan, describe, toRequest, resultOf, aiPackage, MICRO } from '../direct/js/dcalc.js';
import worker from '../proxy/direct-worker.js';

test('parseTsv: заголовок колонок, числа, «--» как ноль', () => {
  const rows = parseTsv('Date\tCampaignId\tCampaignName\tImpressions\tClicks\tCost\n2026-10-01\t5\tКнига\t100\t4\t36.5\n2026-10-02\t5\tКнига\t--\t0\t0\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { Date: '2026-10-01', CampaignId: 5, CampaignName: 'Книга', Impressions: 100, Clicks: 4, Cost: 36.5 });
  assert.equal(rows[1].Impressions, 0);
});

test('mergeDaily: свежие дни заменяют старые, история обрезается', () => {
  const old = [{ date: '2025-01-01', cid: 1, impr: 1, clicks: 0, cost: 1 }, { date: '2026-10-01', cid: 1, impr: 10, clicks: 1, cost: 5 }];
  const fresh = dailyRows([{ Date: '2026-10-01', CampaignId: 1, CampaignName: 'К', Impressions: 20, Clicks: 2, Cost: 9 }]);
  const m = mergeDaily(old, fresh, 400, '2026-10-16');
  assert.equal(m.length, 1);
  assert.equal(m[0].cost, 9);
});

test('totals, spendSeries, budgetPace', () => {
  const daily = [
    { date: '2026-10-10', cid: 1, impr: 100, clicks: 5, cost: 50 },
    { date: '2026-10-16', cid: 1, impr: 200, clicks: 5, cost: 20 },
    { date: '2026-10-16', cid: 2, impr: 1000, clicks: 2, cost: 10 },
  ];
  const t = totals(daily, '2026-10-10', '2026-10-16');
  assert.equal(t.cost, 80); assert.equal(t.clicks, 12); assert.equal(t.cpc, 80 / 12);
  assert.equal(totals(daily, '2026-10-10', '2026-10-16', 2).cost, 10);
  const s = spendSeries(daily, '2026-10-16', 7);
  assert.equal(s.length, 7); assert.equal(s[0].date, '2026-10-10'); assert.equal(s[6].value, 30);
  const p = budgetPace(daily, { budget: 1000, from: '2026-10-01', today: '2026-10-16' });
  assert.equal(p.spent, 80); assert.equal(p.left, 920); assert.ok(p.daysLeft > 0);
});

test('queryHints: кандидаты в минус, без уже добавленных, одна подсказка на слово', () => {
  const qs = [
    { query: 'читать бесплатно фэнтези', cid: 1, clicks: 3, cost: 30 },
    { query: 'фэнтези бесплатно полностью', cid: 1, clicks: 2, cost: 20 },
    { query: 'скачать fb2', cid: 1, clicks: 1, cost: 10 },
    { query: 'любовное фэнтези', cid: 1, clicks: 9, cost: 90 },
  ];
  const h = queryHints(qs, { 1: ['скачать'] });
  assert.equal(h.length, 2);
  assert.equal(h[0].word, 'бесплатно'); assert.equal(h[0].cost, 50); assert.equal(h[0].queries.length, 2);
  assert.equal(h[1].word, 'fb2');
  assert.equal(junkOf('любовный роман'), null);
});

test('keywordHints: много показов и почти нет кликов', () => {
  const kws = withAvgCpc([{ id: 1, cid: 1, phrase: 'книги', state: 'ON' }, { id: 2, cid: 1, phrase: 'роман про дракона', state: 'ON' }], { 1: { impr: 1000, clicks: 2, cost: 20 }, 2: { impr: 300, clicks: 20, cost: 200 } });
  const h = keywordHints(kws, { 1: { impr: 1000, clicks: 2, cost: 20 }, 2: { impr: 300, clicks: 20, cost: 200 } });
  assert.equal(h.length, 1); assert.equal(h[0].id, 1); assert.equal(h[0].kind, 'lowctr');
});

test('parsePlan: блок direct-plan, проверки, предел ставки и запрет бюджета', () => {
  const text = 'Вот разбор.\n```direct-plan\n{"actions":[{"do":"minus","campaign":"7","phrases":["бесплатно"," бесплатно ","скачать"],"why":"не покупают"},{"do":"pause","target":"keyword","ids":[1,2]},{"do":"bid","keyword":3,"rub":"12,5"},{"do":"bid","keyword":3,"rub":80},{"do":"budget","amount":5000},{"do":"pause","target":"group","ids":[1]}]}\n```';
  const r = parsePlan(text, { maxBid: 50 });
  assert.equal(r.actions.length, 3);
  assert.deepEqual(r.actions[0], { do: 'minus', campaign: 7, phrases: ['бесплатно', 'скачать'], why: 'не покупают' });
  assert.equal(r.actions[2].rub, 12.5);
  assert.equal(r.errors.length, 3);
  assert.match(r.errors[0], /выше предела/);
  assert.match(r.errors[1], /бюджет/);
  assert.deepEqual(parsePlan('просто текст').actions, []);
  assert.equal(parsePlan('```direct-plan\n{не json}\n```').errors.length, 1);
});

test('describe: понятные слова с названиями', () => {
  const names = { campaigns: { 7: 'Книга — поиск' }, keywords: { 3: 'роман' } };
  assert.equal(describe({ do: 'minus', campaign: 7, phrases: ['бесплатно'] }, names), 'Кампания «Книга — поиск»: добавить минус-фразы — бесплатно');
  assert.equal(describe({ do: 'bid', keyword: 3, rub: 12.5 }, names), 'Фраза «роман»: ставка на поиске 12,5 ₽');
  assert.equal(describe({ do: 'pause', target: 'keyword', ids: [3, 4] }, names), 'Остановить фразы: «роман», №4');
});

test('toRequest: минус-фразы дописываются к текущим, ставка в микроединицах', () => {
  const q = toRequest({ do: 'minus', campaign: 7, phrases: ['Бесплатно', 'скачать'] }, { negatives: ['бесплатно'] });
  assert.deepEqual(q.params.Campaigns[0].NegativeKeywords.Items, ['бесплатно', 'скачать']);
  const u = toRequest({ do: 'unminus', campaign: 7, phrases: ['бесплатно'] }, { negatives: ['бесплатно'] });
  assert.equal(u.params.Campaigns[0].NegativeKeywords, null);
  const b = toRequest({ do: 'bid', keyword: 3, rub: 12.5 });
  assert.deepEqual(b, { service: 'keywordbids', method: 'set', key: 'SetResults', params: { KeywordBids: [{ KeywordId: 3, SearchBid: 12.5 * MICRO }] } });
  assert.equal(toRequest({ do: 'pause', target: 'ad', ids: [1] }).service, 'ads');
});

test('resultOf: ошибки и предупреждения Директа', () => {
  const r = resultOf({ UpdateResults: [{ Id: 1 }, { Errors: [{ Message: 'Нет прав', Details: 'кампания чужая' }] }, { Id: 2, Warnings: [{ Message: 'Дубль' }] }] }, 'UpdateResults');
  assert.equal(r.ok, 2); assert.deepEqual(r.errors, ['Нет прав: кампания чужая']); assert.deepEqual(r.warnings, ['Дубль']);
});

test('aiPackage: правила, формат плана и данные', () => {
  const t = aiPackage({ campaigns: [{ id: 7 }] }, { today: '2026-10-16', maxBid: 40, budget: { test: 10000 }, question: 'что убрать?' });
  assert.match(t, /```direct-plan/); assert.match(t, /не выше 40 ₽/); assert.match(t, /что убрать\?/); assert.match(t, /"id": 7/);
  // пример плана из пакета сам разбирается приложением
  assert.equal(parsePlan(t, { maxBid: 40 }).actions.length, 6);
});

test('переходник: пускает только свой сайт и только в Директ', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response('{"result":{}}', { status: 200, headers: { 'content-type': 'application/json', Units: '1/2/3', 'set-cookie': 'x' } }); };
  const site = 'https://erichthoxx-sketch.github.io';
  const bad = await worker.fetch(new Request('https://p.dev/live/json/v5/campaigns', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' }));
  assert.equal(bad.status, 403);
  const pre = await worker.fetch(new Request('https://p.dev/live/json/v5/campaigns', { method: 'OPTIONS', headers: { Origin: site } }));
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('Access-Control-Allow-Origin'), site);
  const nope = await worker.fetch(new Request('https://p.dev/live/../evil', { method: 'POST', headers: { Origin: site }, body: '{}' }));
  assert.equal(nope.status, 404);
  const ok = await worker.fetch(new Request('https://p.dev/sandbox/json/v5/campaigns', { method: 'POST', headers: { Origin: site, Authorization: 'Bearer T', Cookie: 'c=1' }, body: '{"method":"get"}' }));
  assert.equal(ok.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api-sandbox.direct.yandex.com/json/v5/campaigns');
  assert.equal(calls[0].init.headers.get('authorization'), 'Bearer T');
  assert.equal(calls[0].init.headers.get('cookie'), null);
  assert.equal(ok.headers.get('units'), '1/2/3');
  assert.equal(ok.headers.get('set-cookie'), null);
});

test('загрузка из Директа: поля, отчёты в очереди, расход по неделям уходит в «Доходы»', async () => {
  const { refresh, apply } = await import('../direct/js/sync.js');
  const { report } = await import('../direct/js/api.js');
  const today = new Date().toISOString().slice(0, 10);
  const sent = [];
  let queued = 1;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body), svc = url.split('/').pop();
    sent.push({ svc, body, headers: init.headers });
    const json = (o) => new Response(JSON.stringify(o), { status: 200 });
    if (svc === 'campaigns' && body.method === 'get') return json({ result: { Campaigns: [{ Id: 7, Name: 'Книга', State: 'ON', Status: 'ACCEPTED', StartDate: today, DailyBudget: { Amount: 500 * MICRO }, NegativeKeywords: { Items: ['скачать'] }, TextCampaign: { BiddingStrategy: { Search: { BiddingStrategyType: 'HIGHEST_POSITION' }, Network: { BiddingStrategyType: 'SERVING_OFF' } } } }] } });
    if (svc === 'campaigns' && body.method === 'update') return json({ result: { UpdateResults: [{ Id: 7 }] } });
    if (svc === 'adgroups') return json({ result: { AdGroups: [{ Id: 8, Name: 'Группа', CampaignId: 7 }] } });
    if (svc === 'keywords') return json({ result: { Keywords: [{ Id: 9, Keyword: 'роман', AdGroupId: 8, CampaignId: 7, Bid: 12 * MICRO, State: 'ON', Status: 'ACCEPTED' }] } });
    if (svc === 'ads') return json({ result: { Ads: [{ Id: 10, AdGroupId: 8, CampaignId: 7, State: 'ON', Status: 'ACCEPTED', TextAd: { Title: 'Заголовок', Text: 'Текст', Href: 'https://litnet.com/' } }] } });
    if (svc === 'reports') {
      if (queued-- > 0) return new Response('', { status: 202, headers: { retryIn: '1' } });
      const f = body.params.FieldNames.join('\t');
      if (body.params.ReportType === 'SEARCH_QUERY_PERFORMANCE_REPORT') return new Response(`${f}\nчитать бесплатно\t7\t8\tроман\t50\t2\t20\n`, { status: 200 });
      if (f.startsWith('Date')) return new Response(`${f}\n${today}\t7\tКнига\t100\t5\t45.5\n`, { status: 200 });
      return new Response(`${f}\n7\t9\tроман\t100\t5\t45.5\n`, { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  const data = { settings: { directToken: 'T', direct: { proxy: 'https://p.dev/', links: { 7: 'k1' } } }, d_snap: [], d_log: [], campaigns: [{ id: 'k1', name: 'Директ', channel: 'own' }], reports: [] };
  const store = {
    async putMany(coll, items) { for (const it of items) { const a = data[coll], i = a.findIndex((x) => x.id === it.id); if (i >= 0) a[i] = it; else a.push(it); } },
    async put(coll, it) { return this.putMany(coll, [it]); },
  };
  const app = { store, ctx: () => ({ data, settings: data.settings, today }), rerender() {} };
  const realSet = globalThis.setTimeout; globalThis.setTimeout = (f) => realSet(f, 0); // не ждём retryIn по-настоящему
  try { await refresh(app); } finally { globalThis.setTimeout = realSet; }
  assert.equal(sent[0].headers.Authorization, 'Bearer T');
  assert.ok(sent.every((x) => !x.headers['Client-Login']));
  const main = data.d_snap.find((x) => x.id === 'main'), stats = data.d_snap.find((x) => x.id === 'stats');
  assert.deepEqual(main.campaigns[0], { id: 7, name: 'Книга', state: 'ON', status: 'ACCEPTED', type: '', start: today, daily: 500, negatives: ['скачать'], strategy: { search: 'HIGHEST_POSITION', network: 'SERVING_OFF' } });
  assert.equal(main.keywords[0].bid, 12);
  assert.equal(main.ads[0].title, 'Заголовок');
  assert.deepEqual(stats.daily, [{ date: today, cid: 7, name: 'Книга', impr: 100, clicks: 5, cost: 45.5 }]);
  assert.deepEqual(stats.kw[9], { impr: 100, clicks: 5, cost: 45.5 });
  assert.equal(stats.queries[0].query, 'читать бесплатно');
  const rep = data.reports[0];
  assert.equal(rep.campaignId, 'k1'); assert.equal(rep.spend, 45.5); assert.equal(rep.clicks, 5); assert.equal(rep.end, today);
  // минус-фраза: перечитали текущие и дописали, в историю записали
  const r = await apply(app, { do: 'minus', campaign: 7, phrases: ['бесплатно'], why: 'тест' });
  assert.equal(r.errors.length, 0);
  const upd = sent.find((x) => x.svc === 'campaigns' && x.body.method === 'update');
  assert.deepEqual(upd.body.params.Campaigns[0].NegativeKeywords.Items, ['скачать', 'бесплатно']);
  assert.deepEqual(data.d_snap.find((x) => x.id === 'main').campaigns[0].negatives, ['скачать', 'бесплатно']);
  assert.equal(data.d_log.length, 1); assert.equal(data.d_log[0].ok, true);
  assert.equal(typeof report, 'function');
});

test('ошибка Директа — понятным текстом', async () => {
  const { call } = await import('../direct/js/api.js');
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { error_code: 58, error_string: 'Незавершенная регистрация' } }), { status: 200 });
  await assert.rejects(call({ directToken: 'T', direct: { proxy: 'https://p.dev' } }, 'campaigns', 'get', {}), /не одобрил заявку/);
  await assert.rejects(call({ direct: { proxy: 'https://p.dev' } }, 'campaigns', 'get', {}), /не подключён/);
});

test('наставник: этап теста, неделя к неделе, эффект правки', async () => {
  const { testStage, weekInsights, changeEffects } = await import('../direct/js/dcalc.js');
  assert.equal(testStage({ from: '2026-10-10', today: '2026-10-11', spent: 100, budget: 10000 }).key, 'start');
  assert.equal(testStage({ from: '2026-10-10', today: '2026-10-15', spent: 100, budget: 10000 }).key, 'clean');
  assert.equal(testStage({ from: '2026-10-01', today: '2026-10-12', spent: 100, budget: 10000 }).key, 'optimize');
  assert.equal(testStage({ from: '2026-10-10', today: '2026-10-12', spent: 10000, budget: 10000 }).key, 'results');
  assert.equal(testStage({ from: '', today: '2026-10-12', spent: 0, budget: 10000 }).key, 'prep');
  const day = (date, clicks, cost, impr = 1000) => ({ date, cid: 1, impr, clicks, cost });
  const daily = [];
  for (let i = 0; i < 7; i++) daily.push(day(`2026-10-0${i + 2}`, 10, 100)); // клик 10 ₽
  for (let i = 0; i < 7; i++) daily.push(day(`2026-10-${String(i + 9).padStart(2, '0')}`, 10, 70)); // клик 7 ₽
  const w = weekInsights(daily, '2026-10-15');
  assert.equal(w[0].kind, 'good'); assert.match(w[0].text, /подешевел на 30 %/);
  assert.equal(weekInsights(daily.map((x) => ({ ...x, clicks: 1 })), '2026-10-15')[0].kind, 'few');
  const eff = changeEffects(daily, [{ at: '2026-10-09T10:00:00Z', ok: true, cid: 1 }, { at: '2026-10-14T10:00:00Z', ok: true, cid: 1 }], '2026-10-15');
  assert.equal(eff.length, 1); assert.ok(eff[0].enough); assert.ok(eff[0].cpc < -0.2);
});

import { convRows, kwConvRows, sumGoals, convTotal, goalTotals, metrikaRows, metrikaFor, goalHints, goalWeekInsight } from '../direct/js/dcalc.js';

test('директ: конверсии по целям Метрики из отчётов Директа', () => {
  const rows = parseTsv('Date\tCampaignId\tConversions_9001_LSC\tConversions_9002_LSC\n2026-10-10\t1\t2\t--\n2026-10-11\t1\t0\t0\n2026-10-11\t2\t1\t3\n');
  assert.equal(rows[0].Conversions_9002_LSC, 0); // «--» — ноль
  const conv = convRows(rows);
  assert.deepEqual(conv, [{ date: '2026-10-10', cid: 1, conv: { 9001: 2 } }, { date: '2026-10-11', cid: 2, conv: { 9001: 1, 9002: 3 } }]);
  assert.equal(convTotal(conv, '2026-10-01', '2026-10-31', null, [9001]), 3);
  assert.equal(convTotal(conv, '2026-10-01', '2026-10-31', 2), 4); // без выбора — все цели
  assert.equal(convTotal(conv, '2026-10-01', '2026-10-31', null, [9001], new Set(['2026-10-10'])), 1); // день сбоя не считаем
  assert.deepEqual(kwConvRows(parseTsv('CriterionId\tConversions_9001_LSC\n77\t2\n77\t1\n88\t0\n')), { 77: { 9001: 3 } });
  assert.equal(sumGoals({ 9001: 2, 9002: 5 }, ['9001']), 2);
  const daily = [{ date: '2026-10-10', cid: 1, impr: 100, clicks: 20, cost: 300 }, { date: '2026-10-11', cid: 2, impr: 50, clicks: 10, cost: 100 }];
  const g = goalTotals(daily, conv, '2026-10-01', '2026-10-31', { goals: [9001] });
  assert.equal(g.conv, 3); assert.equal(g.cpa, 133.33); assert.equal(g.cr, 0.1);
});

test('директ: Метрика — поведение на странице по кампаниям Директа', () => {
  const rows = metrikaRows({ data: [{ dimensions: [{ name: 'Книга — поиск', id: '701' }], metrics: [412, 21.5, 3.41, 255.4] }, { dimensions: [{ name: 'Сети' }], metrics: [10, 70, 1, 20] }] });
  assert.deepEqual(rows[0], { cid: 701, name: 'Книга — поиск', visits: 412, bounce: 0.215, depth: 3.41, dur: 255 });
  assert.equal(metrikaFor(rows, { id: 5, name: 'Сети' }).visits, 10); // нет номера — по названию
});

test('директ: аналитик по покупкам — счётчик, фразы без покупок, удачные фразы, отказы', () => {
  const today = '2026-10-17';
  const campaigns = [{ id: 1, name: 'Поиск', state: 'ON', type: 'TEXT_CAMPAIGN', counters: [555] }, { id: 2, name: 'Сети', state: 'ON', type: 'TEXT_CAMPAIGN', counters: [] }];
  const keywords = [{ id: 10, cid: 1, phrase: 'дорогая', state: 'ON' }, { id: 11, cid: 1, phrase: 'удачная', state: 'ON' }, { id: 12, cid: 1, phrase: 'мало данных', state: 'ON' }];
  const daily = [{ date: '2026-10-10', cid: 1, impr: 3000, clicks: 200, cost: 2000 }];
  const conv = [{ date: '2026-10-10', cid: 1, conv: { 9001: 10 } }]; // средняя покупка 200 ₽
  const kw = { 10: { impr: 900, clicks: 40, cost: 600 }, 11: { impr: 900, clicks: 40, cost: 400 }, 12: { impr: 100, clicks: 5, cost: 500 } };
  const kwConv = { 11: { 9001: 4 } };
  const mrows = [{ cid: 1, name: 'Поиск', visits: 100, bounce: 0.7, depth: 1, dur: 20 }];
  const h = goalHints({ campaigns, keywords, kw, kwConv, daily, conv, mrows, m: { counterId: 555, main: [9001] }, today });
  const kinds = h.map((x) => x.kind + (x.id || x.cid));
  assert.deepEqual(kinds, ['counter2', 'noconv10', 'bounce1', 'winner11']); // «мало данных» — 5 кликов, не советуем
  assert.match(h[1].why, /600 ₽/);
  // день сбоя выкидываем — покупок становится мало, по фразам не советуем
  assert.ok(!goalHints({ campaigns, keywords, kw, kwConv, daily, conv, mrows: [], m: { counterId: 555, main: [9001] }, today, skip: new Set(['2026-10-10']) }).some((x) => x.kind === 'noconv'));
});

test('директ: покупки неделя к неделе — осторожно на малых числах', () => {
  const daily = [{ date: '2026-10-05', cid: 1, impr: 1, clicks: 50, cost: 1000 }, { date: '2026-10-14', cid: 1, impr: 1, clicks: 50, cost: 1000 }];
  const few = goalWeekInsight(daily, [{ date: '2026-10-05', cid: 1, conv: { 1: 2 } }, { date: '2026-10-14', cid: 1, conv: { 1: 5 } }], '2026-10-17');
  assert.equal(few.kind, 'few');
  const good = goalWeekInsight(daily, [{ date: '2026-10-05', cid: 1, conv: { 1: 4 } }, { date: '2026-10-14', cid: 1, conv: { 1: 8 } }], '2026-10-17');
  assert.equal(good.kind, 'good'); assert.match(good.text, /подешевела на 50 %/);
});

test('директ: привязать счётчик к кампании — добавляем к уже привязанным', () => {
  const a = { do: 'counter', campaign: 7, counter: 555 };
  assert.match(describe(a, { campaigns: { 7: 'Поиск' } }), /«Поиск»: привязать счётчик Метрики №555/);
  const q = toRequest(a, { counters: [111], campType: 'UNIFIED_CAMPAIGN' });
  assert.deepEqual(q.params, { Campaigns: [{ Id: 7, UnifiedCampaign: { CounterIds: { Items: [111, 555] } } }] });
  assert.ok(toRequest(a, { counters: [555] }).params.Campaigns[0].TextCampaign);
});

test('переходник: Метрика только на чтение и только с сайта владелицы', async () => {
  const origFetch = globalThis.fetch;
  let called = '';
  globalThis.fetch = async (u) => { called = String(u); return new Response('{"counters":[]}', { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    const ok = await worker.fetch(new Request('https://w.dev/metrika/management/v1/counters?per_page=100', { headers: { Origin: 'https://erichthoxx-sketch.github.io', Authorization: 'OAuth x' } }));
    assert.equal(ok.status, 200); assert.equal(called, 'https://api-metrika.yandex.net/management/v1/counters?per_page=100');
    const post = await worker.fetch(new Request('https://w.dev/metrika/management/v1/counters', { method: 'POST', headers: { Origin: 'https://erichthoxx-sketch.github.io' } }));
    assert.equal(post.status, 405);
    const other = await worker.fetch(new Request('https://w.dev/metrika/management/v1/counters', { headers: { Origin: 'https://evil.example' } }));
    assert.equal(other.status, 403);
    const ver = await worker.fetch(new Request('https://w.dev/version', { headers: { Origin: 'https://erichthoxx-sketch.github.io' } }));
    assert.equal(await ver.text(), '2');
  } finally { globalThis.fetch = origFetch; }
});

test('разбор кампании: подождать при малых данных, исправить мусор и структуру, хорошее — отдельно', async () => {
  const { auditCampaign } = await import('../direct/js/dcalc.js');
  const camp = { id: 1, name: 'К', start: '2026-09-01', negatives: [], strategy: { search: 'HIGHEST_POSITION', network: 'MAXIMUM_COVERAGE' } };
  const main = { groups: [{ id: 10, cid: 1, name: 'Г' }], keywords: [{ id: 100, cid: 1, gid: 10, phrase: 'романы', state: 'ON' }], ads: [{ id: 5, cid: 1, gid: 10, state: 'ON', status: 'REJECTED', title: 'Т', note: 'Картинка' }] };
  const stats = { daily: [{ date: '2026-10-16', cid: 1, impr: 100, clicks: 3, cost: 30 }], kw: { 100: { impr: 100, clicks: 3, cost: 30 } }, queries: [{ query: 'романы скачать', cid: 1, clicks: 1, cost: 12 }] };
  const r = auditCampaign({ camp, main, stats, log: [{ ok: true, cid: 1, at: '2026-10-14T10:00:00Z', text: 'правка' }], today: '2026-10-16' });
  const t = (s) => r.items.filter((x) => x.status === s).map((x) => x.area + ': ' + x.title);
  assert.ok(t('wait').some((x) => /клик/.test(x)));
  assert.ok(t('wait').some((x) => /прошло 2 дн/.test(x)));
  assert.ok(t('fix').some((x) => /Поиск и сети/.test(x)));
  assert.ok(t('fix').some((x) => /Одно объявление/.test(x)));
  assert.ok(t('fix').some((x) => /«скачать»/.test(x)));
  assert.ok(t('fix').some((x) => /Отклонено/.test(x)));
  assert.ok(t('fix').some((x) => /Метрика не подключена/.test(x)));
  assert.equal(r.items[0].status, 'fix');
  const minus = r.items.find((x) => x.act?.do === 'minus');
  assert.deepEqual(minus.act.phrases, ['скачать']);
  // фразы не советуем при 3 кликах
  assert.ok(!r.items.some((x) => x.area === 'Фразы'));
});

test('аналитика Метрики: разбор ответа, итоги, шаги с осторожностью к малым числам', async () => {
  const { mkRows, sumDays, byWeekday, mkInsights, reach } = await import('../direct/js/mcalc.js');
  const rows = mkRows({ data: [{ dimensions: [{ id: 'ad', name: 'Переходы по рекламе' }], metrics: [100, 80, 55.5, 2.1, 90, 4] }] }, [9001]);
  assert.deepEqual(rows[0], { key: 'ad', name: 'Переходы по рекламе', visits: 100, users: 80, bounce: 0.555, depth: 2.1, dur: 90, goals: { 9001: 4 } });
  const daily = [];
  for (let i = 0; i < 28; i++) {
    const key = new Date(Date.parse('2026-09-19T00:00:00Z') + i * 86400000).toISOString().slice(0, 10);
    const sat = new Date(key + 'T00:00:00Z').getUTCDay() === 6;
    daily.push({ key, visits: sat ? 200 : (i >= 21 ? 60 : 100), users: 50, bounce: 0.3, depth: 3, dur: 120, goals: { 1: 3 } });
  }
  const today = '2026-10-16';
  const w = sumDays(daily, '2026-10-10', today, ['1']);
  assert.equal(w.days, 7); assert.equal(w.conv, 21);
  assert.equal(byWeekday(daily, ['1'])[6].avg, 200);
  const sources = [
    { key: 'social', name: 'Соцсети', visits: 200, bounce: 0.2, goals: { 1: 30 } },
    { key: 'ad', name: 'Реклама', visits: 300, bounce: 0.7, goals: { 1: 2 } },
  ];
  const ins = mkInsights({ daily, sources, main: ['1'], hasGoals: true, today });
  const t = ins.map((x) => x.level + ': ' + x.title);
  assert.ok(t.some((x) => /^warn: Визитов меньше/.test(x)), t.join('\n'));
  assert.ok(t.some((x) => /^step: «Соцсети»: покупают/.test(x)));
  assert.ok(t.some((x) => /^warn: Из рекламы покупают реже/.test(x)));
  assert.ok(t.some((x) => /^warn: «Реклама»: 70 % уходят сразу/.test(x)));
  assert.ok(t.some((x) => /^step: Больше всего читателей в субботу/.test(x)));
  assert.equal(ins[0].level, 'step');
  // мало визитов — только «подождать»
  const few = mkInsights({ daily: daily.map((x) => ({ ...x, visits: 1 })), main: ['1'], hasGoals: true, today });
  assert.ok(few.every((x) => x.level === 'wait' || x.level === 'step'));
  assert.equal(reach({ goals: { 1: 2, 2: 5 } }, ['1']), 2);
});
