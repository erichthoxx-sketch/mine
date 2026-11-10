import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../proxy/books-mcp-worker.js';

function kv(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    async get(key, opts) { const raw = items.get(key); return raw == null ? null : opts?.type === 'json' ? JSON.parse(raw) : raw; },
    async put(key, value) { items.set(key, value); },
    async delete(key) { items.delete(key); }
  };
}
const URL = 'https://author-books.example.workers.dev';
const KEY = 'abcdefghijklmnopqrstuvwxyz0123456789';
const env = () => ({
  BOOKS: kv({
    index: JSON.stringify([{ id: 'b1', title: 'Тестовая книга', updatedAt: '2026-11-03', chapters: 1 }]),
    'book:b1': JSON.stringify({
      id: 'b1', title: 'Тестовая книга', context: '# Канон книги',
      updatedAt: '2026-11-03', chapters: [{ title: 'Глава 1', text: 'Марта встретила Глеба у дома.' }]
    })
  }),
  OWNER_UID: 'owner_uid',
  MCP_READ_KEY: KEY
});
const call = (method, params = {}, key = KEY) =>
  new Request(URL + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Master-Key': key }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });

test('health shows only configuration state, no credentials or data', async () => {
  const res = await worker.fetch(new Request(URL + '/health'), env());
  const j = await res.json();
  assert.equal(j.configured, true);
  assert.equal(JSON.stringify(j).includes(KEY), false);
});
test('MCP rejects missing or incorrect access key', async () => {
  assert.equal((await worker.fetch(new Request(URL + '/mcp', { method: 'POST' }), env())).status, 401);
  assert.equal((await worker.fetch(call('tools/list', {}, 'wrong'), env())).status, 401);
});
test('MCP initialization, discovery, chapter paging and search', async () => {
  let j = await (await worker.fetch(call('initialize'), env())).json();
  assert.equal(j.result.protocolVersion, '2025-03-26');
  j = await (await worker.fetch(call('tools/list'), env())).json();
  assert.ok(j.result.tools.some((t) => t.name === 'read_chapter'));
  j = await (await worker.fetch(call('tools/call', { name: 'list_books', arguments: {} }), env())).json();
  assert.equal(JSON.parse(j.result.content[0].text)[0].id, 'b1');
  j = await (await worker.fetch(call('tools/call', { name: 'read_chapter', arguments: { book_id: 'b1', chapter: 1 } }), env())).json();
  assert.match(j.result.content[0].text, /Марта встретила/);
  j = await (await worker.fetch(call('tools/call', { name: 'search_book', arguments: { book_id: 'b1', query: 'Глеба' } }), env())).json();
  assert.equal(JSON.parse(j.result.content[0].text).matches.length, 1);
});
test('write endpoints never accept MCP reader key or arbitrary origin', async () => {
  const a = env();
  const forbidden = await worker.fetch(new Request(URL + '/sync/b1', { method: 'PUT', headers: { Origin: 'https://example.org', Authorization: 'Bearer abc' }, body: '{}' }), a);
  assert.equal(forbidden.status, 403);
  const unauth = await worker.fetch(new Request(URL + '/sync/b1', { method: 'DELETE', headers: { 'X-Master-Key': KEY } }), a);
  assert.equal(unauth.status, 401);
  const list = await a.BOOKS.get('index', { type: 'json' });
  assert.equal(list.length, 1);
});

test('MCP marketing, income and Direct sources are read-only and separately queryable', async () => {
  const a = env();
  await a.BOOKS.put('section:marketing', JSON.stringify({
    updatedAt: '2026-11-03', data: { books: [{ id: 'b1', title: 'Тестовая книга', promo: { annotation: 'История' } }], ideas: [], contests: [] }
  }));
  await a.BOOKS.put('section:income', JSON.stringify({
    updatedAt: '2026-11-03', data: { lastSaleDate: '2026-11-03', months: [{ month: '2026-11', royalty: 190 }],
      totals: { royalty: 190 }, sales: [{ book: 'Тестовая книга', bookId: 'b1', date: '2026-11-03', qty: 1, royalty: 190 }], reports: [] }
  }));
  await a.BOOKS.put('section:direct', JSON.stringify({
    updatedAt: '2026-11-03', data: { campaigns: [{ id: 7, name: 'Тестовая реклама' }], daily: [{ cid: 7, date: '2026-11-03', cost: 10 }] }
  }));
  const toolList = await (await worker.fetch(call('tools/list'), a)).json();
  assert.ok(toolList.result.tools.some((t) => t.name === 'get_system_status'));
  assert.ok(toolList.result.tools.some((t) => t.name === 'get_income_overview'));
  assert.equal(toolList.result.tools.some((t) => t.name.startsWith('change_')), false);
  const status = await (await worker.fetch(call('tools/call', { name: 'get_system_status', arguments: {} }), a)).json();
  assert.equal(JSON.parse(status.result.content[0].text).sections.filter((s) => s.available).length, 3);
  const sales = await (await worker.fetch(call('tools/call', { name: 'get_book_sales', arguments: { book: 'b1' } }), a)).json();
  assert.equal(JSON.parse(sales.result.content[0].text).rows[0].royalty, 190);
  await a.BOOKS.put('section:income', JSON.stringify({ updatedAt: '2026-11-03', data: { sales: [
    { book: 'Альпийский развод. Он оставил меня умирать', bookId: 'b9', date: '2026-11-03', qty: 1, royalty: 120 },
    { book: 'Альпийская сказка', bookId: 'b8', date: '2026-11-03', qty: 1, royalty: 5 }] } }));
  const short = await (await worker.fetch(call('tools/call', { name: 'get_book_sales', arguments: { book: 'Альпийский развод' } }), a)).json();
  assert.deepEqual(JSON.parse(short.result.content[0].text).rows.map((r) => r.royalty), [120]);
  const ads = await (await worker.fetch(call('tools/call', { name: 'get_direct_campaign', arguments: { campaign_id: '7' } }), a)).json();
  assert.equal(JSON.parse(ads.result.content[0].text).daily[0].cost, 10);
});
test('MCP cannot overwrite connected finance or advertising via reader key', async () => {
  const a = env();
  const req = new Request(URL + '/sync/section/income', {
    method: 'PUT',
    headers: { 'X-Master-Key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ section: 'income', generatedAt: '2026-11-03' })
  });
  assert.equal((await worker.fetch(req, a)).status, 401);
  assert.equal(await a.BOOKS.get('section:income'), null);
});

test('Direct live: key from owner only, never shown, only get methods, drafts visible', async () => {
  const a = env();
  // без входа владелицы ключ не принимается (и не по ключу нейросети)
  const noAuth = await worker.fetch(new Request(URL + '/sync/direct-access', { method: 'PUT', headers: { 'X-Master-Key': KEY }, body: '{"token":"y0_aaaaaaaaaaaaaaaaaaaaaaaa"}' }), a);
  assert.equal(noAuth.status, 401);
  let j = await (await worker.fetch(call('tools/call', { name: 'get_direct_live', arguments: {} }), a)).json();
  assert.equal(j.result.isError, true);
  assert.match(j.result.content[0].text, /не включён/);
  await a.BOOKS.put('secret:direct-access', JSON.stringify({ token: 'y0_SECRET_TOKEN_1234567890', clientLogin: '', sandbox: false }));
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url: String(url), method: body.method, auth: init.headers.Authorization });
    const svc = String(url).split('/').pop();
    if (svc === 'reports') return new Response('Date\tCampaignId\tCampaignName\tImpressions\tClicks\tCost\n2026-11-07\t715936525\tЕПК\t0\t0\t0\n', { status: 200 });
    const result = {
      campaigns: { Campaigns: [{ Id: 715936525, Name: 'Единая перфоманс-кампания №18', State: 'OFF', Status: 'DRAFT', Type: 'UNIFIED_CAMPAIGN',
        UnifiedCampaign: { TrackingParams: 'utm_litref=PZSWjdD9ctDTys9A' } }] },
      adgroups: { AdGroups: [{ Id: 5821756438, Name: 'Новая группа', CampaignId: 715936525, RegionIds: [225] }] },
      ads: { Ads: [] },
      keywords: { Keywords: [{ Id: 1, Keyword: 'остросюжетные любовные романы', AdGroupId: 5821756438, CampaignId: 715936525, State: 'OFF', Status: 'DRAFT' }] }
    }[svc];
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
  let camp;
  try {
    j = await (await worker.fetch(call('tools/call', { name: 'get_direct_live', arguments: {} }), a)).json();
    // прежние инструменты тоже отвечают живыми данными (клиенты, запомнившие старый список инструментов)
    camp = await (await worker.fetch(call('tools/call', { name: 'get_direct_campaign', arguments: { campaign_id: '715936525' } }), a)).json();
  } finally { globalThis.fetch = realFetch; }
  assert.equal(JSON.parse(camp.result.content[0].text).campaigns[0].status, 'DRAFT');
  assert.equal(camp.result.content[0].text.includes('SECRET_TOKEN'), false);
  const text = j.result.content[0].text, out = JSON.parse(text);
  assert.equal(out.campaigns[0].status, 'DRAFT');
  assert.equal(out.campaigns[0].trackingParams, 'utm_litref=PZSWjdD9ctDTys9A');
  assert.deepEqual(out.groups[0].regions, [225]);
  assert.equal(out.keywords[0].phrase, 'остросюжетные любовные романы');
  assert.equal(out.daily.length, 1);
  assert.equal(text.includes('SECRET_TOKEN'), false);
  assert.ok(seen.every((x) => x.method === 'get' || x.url.endsWith('/reports')));
  assert.ok(seen.every((x) => x.url.startsWith('https://api.direct.yandex.com/')));
  // «Отключить всё» удаляет и доступ к Директу (здесь проверяем хранилище напрямую)
  const status = JSON.parse((await (await worker.fetch(call('tools/call', { name: 'get_system_status', arguments: {} }), a)).json()).result.content[0].text);
  assert.equal(status.directLive.on, true);
  assert.equal(JSON.stringify(status).includes('SECRET_TOKEN'), false);
});

import { moneyDeep, cohortStats, mskToday } from '../proxy/books-mcp-worker.js';
import { buildCohortData, stageGoals } from '../js/cohorts.js';

const GOALS = [{ id: 548467198, name: 'Начало чтения' }, { id: 548467215, name: 'Добавление книги в библиотеку' }, { id: 548467217, name: 'Начало покупки книги' }, { id: 548467220, name: 'Покупка книги' }];

test('деньги стратегии — в рублях', () => {
  const s = moneyDeep({ Search: { PayForConversion: { Cpa: 8000000, GoalId: 548467215, WeeklySpendLimit: 1700000000 } } });
  assert.equal(s.Search.PayForConversion.Cpa, 8);
  assert.equal(s.Search.PayForConversion.WeeklySpendLimit, 1700);
  assert.equal(s.Search.PayForConversion.GoalId, 548467215);
});

test('get_direct_report: конверсии по каждой цели, модель атрибуции, пометка о неполном дне; только чтение', async () => {
  const a = env();
  await a.BOOKS.put('secret:direct-access', JSON.stringify({ token: 'y0_SECRET_TOKEN_1234567890' }));
  const seen = [], real = globalThis.fetch, today = mskToday();
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); seen.push({ u, method: init.method || 'GET', body: init.body });
    if (u.includes('/goals')) return new Response(JSON.stringify({ goals: GOALS }), { status: 200 });
    if (u.endsWith('/campaigns')) return new Response(JSON.stringify({ result: { Campaigns: [{ Id: 715936525, Name: 'ЕПК', State: 'ON', UnifiedCampaign: { CounterIds: { Items: [108714441] } } }] } }), { status: 200 });
    if (u.endsWith('/reports')) {
      const b = JSON.parse(init.body).params;
      assert.deepEqual(b.AttributionModels, ['LSCCD']); assert.equal(b.Goals.length, 4);
      const head = ['Date', 'CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Cost', 'Ctr', 'AvgCpc', ...b.Goals.flatMap((g) => [`Conversions_${g}_LSCCD`, `CostPerConversion_${g}_LSCCD`, `ConversionRate_${g}_LSCCD`])];
      const row = [today, '715936525', 'ЕПК', '1000', '50', '400', '5', '8', ...b.Goals.flatMap((g) => g === '548467215' ? ['40', '10', '80'] : ['0', '--', '0'])];
      return new Response(head.join('\t') + '\n' + row.join('\t') + '\n', { status: 200 });
    }
    return new Response('{}', { status: 404 });
  };
  let j;
  try { j = await (await worker.fetch(call('tools/call', { name: 'get_direct_report', arguments: { campaign_id: '715936525', attribution: 'LSCCD' } }), a)).json(); }
  finally { globalThis.fetch = real; }
  const text = j.result.content[0].text, out = JSON.parse(text);
  assert.equal(out.total.cost, 400);
  assert.equal(out.total.goals['548467215'].conversions, 40);
  assert.equal(out.total.goals['548467215'].costPerConversion, 10);
  assert.match(out.attribution, /LSCCD/);
  assert.ok(out.todayNote);
  assert.equal(text.includes('SECRET_TOKEN'), false);
  assert.ok(seen.filter((x) => x.u.includes('direct.yandex.com') && !x.u.endsWith('/reports')).every((x) => JSON.parse(x.body).method === 'get'));
  // устаревшая модель — понятный отказ
  globalThis.fetch = async () => new Response('{}');
  try { j = await (await worker.fetch(call('tools/call', { name: 'get_direct_report', arguments: { attribution: 'LSC' } }), a)).json(); } finally { globalThis.fetch = real; }
  assert.equal(j.result.isError, true);
});

test('когорты: первый визит из кампании, библиотека → покупка, покупки в поздних визитах', () => {
  const head = 'ym:s:visitID\tym:s:clientID\tym:s:dateTime\tym:s:lastTrafficSource\tym:s:lastAdvEngine\tym:s:lastDirectClickOrder\tym:s:lastUTMSource\tym:s:lastUTMCampaign\tym:s:lastUTMContent\tym:s:goalsID\tym:s:goalsDateTime';
  const L = (v, c, t, src, d, g = [], gt = []) => [v, c, t, src, src === 'ad' ? 'ya_direct' : '', d, '', '', '', `[${g.join(',')}]`, `[${gt.map((x) => `'${x}'`).join(',')}]`].join('\t');
  const tsvText = [head,
    L(1, 'A', '2026-11-10 10:00:00', 'ad', '715936525', [548467198, 548467215], ['2026-11-10 10:05:00', '2026-11-10 10:06:00']),
    L(2, 'A', '2026-11-14 20:00:00', 'internal', '0', [548467220], ['2026-11-14 20:10:00']),        // купила позже, в другом визите
    L(3, 'B', '2026-11-11 09:00:00', 'ad', '715936525', [548467215], ['2026-11-11 09:03:00']),     // только библиотека
    L(4, 'C', '2026-11-11 09:00:00', 'direct', '0', [548467220], ['2026-11-11 09:30:00']),         // не из кампании
  ].join('\n');
  const data = buildCohortData([tsvText], { from: '2026-10-20', to: '2026-11-17', goals: GOALS });
  assert.equal(JSON.stringify(data).includes('"A"'), false); // без ClientID
  assert.equal(stageGoals(GOALS).buy, 548467220);
  const r = cohortStats({ ...data, at: 'x' }, { source_filter: 'direct:715936525', window_days: 30 });
  assert.equal(r.size, 2);
  assert.equal(r.addedToLibrary, 2);
  assert.equal(r.purchased, 1);
  assert.equal(r.purchasesInLaterVisits, 1);
  assert.equal(r.medianDaysToPurchase, 4);
  assert.deepEqual(r.libraryToPurchase, { added: 2, thenPurchased: 1, rate: 50 });
  assert.equal(r.laterVisitSources.internal, 1);
});

test('get_metrika_sources: разрез до кампании Директа, атрибуция по документации, цели — достижения и посетители', async () => {
  const a = env();
  await a.BOOKS.put('secret:direct-access', JSON.stringify({ token: 'y0_SECRET_TOKEN_1234567890' }));
  const real = globalThis.fetch; let q = null;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/goals')) return new Response(JSON.stringify({ goals: GOALS.slice(1, 2) }), { status: 200 });
    if (u.includes('stat/v1/data')) { q = new globalThis.URL(u).searchParams; const day = q.get('dimensions').startsWith('ym:s:date');
      return new Response(JSON.stringify({ data: [{ dimensions: day ? [{ name: '2026-11-10' }, { id: '715936525', name: 'ЕПК' }] : [{ id: '715936525', name: 'ЕПК' }], metrics: [100, 90, 12.5, 7, 6] }] }), { status: 200 }); }
    return new Response('{}', { status: 404 });
  };
  let j;
  try { j = await (await worker.fetch(call('tools/call', { name: 'get_metrika_sources', arguments: { group_by: 'direct', counter_id: '108714441', attribution: 'LSCCD' } }), a)).json(); }
  finally { globalThis.fetch = real; }
  const out = JSON.parse(j.result.content[0].text);
  assert.equal(q.get('attribution'), 'cross_device_last_significant');
  assert.ok(q.get('metrics').includes('ym:s:goal548467215users'));
  assert.equal(out.total[0].goals['548467215'].reaches, 7);
  assert.equal(out.byDay[0].date, '2026-11-10');
});
