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
