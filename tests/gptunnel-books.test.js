import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { GptunnelSseSession } from '../proxy/gptunnel-books-worker.js';

const BASE = 'https://adapter.example.test';
const KEY = 'a'.repeat(64);
const OLD_KEY = 'b'.repeat(64);
const SESSION = 'c'.repeat(64);
const BOOK_ID = 'book-1';
const TOOLS = ['list_books', 'get_book_context', 'list_chapters', 'read_chapter', 'search_book'];
const book = {
  id: BOOK_ID, title: 'Пробная книга', updatedAt: '2026-11-22T00:00:00Z',
  context: 'Вымышленный канон', chapters: [{ title: 'Пролог', text: 'А💡Б. Мира дошла до маяка.' }]
};
const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', method, params, id });
const call = (name, args) => rpc('tools/call', { name, arguments: args });
const unpack = (body) => JSON.parse(body.result.content[0].text);

function fixture(snapshot = book) {
  const reads = [];
  const env = {
    GPTUNNEL_WORKSHOP_KEY: KEY, GPTUNNEL_BOOK_ID: BOOK_ID, MCP_READ_KEY: OLD_KEY,
    BOOKS: { async get(key, options) {
      reads.push(key);
      assert.equal(key, `book:${BOOK_ID}`);
      assert.deepEqual(options, { type: 'json' });
      return snapshot;
    } }
  };
  const id = { toString: () => SESSION };
  const session = new GptunnelSseSession({ id }, env);
  env.MCP_SESSIONS = { get: () => session, newUniqueId: () => id, idFromString: () => id };
  const fetch = (body, { path = '/mcp', method = 'POST', auth = `Bearer ${KEY}`, headers = {} } = {}) =>
    worker.fetch(new Request(BASE + path, { method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
  return { env, reads, fetch, json: async (message) => (await fetch(message)).json() };
}

test('MCP credentials are independent and required on all transport requests', async () => {
  const { fetch, reads, env } = fixture();
  for (const [path, method, body] of [
    ['/mcp', 'POST', call('list_books')], ['/sse', 'GET', undefined],
    [`/sse/message?sessionId=${SESSION}`, 'POST', call('list_books')]
  ]) {
    for (const auth of [null, `Bearer ${OLD_KEY}`, `Bearer ${'d'.repeat(64)}`, `Basic ${KEY}`]) {
      const res = await fetch(body, { path, method, auth });
      assert.equal(res.status, 401);
      assert.match(res.headers.get('WWW-Authenticate'), /^Bearer /);
      assert.equal(res.headers.get('Cache-Control'), 'no-store');
      assert.equal(await res.text(), '');
    }
  }
  const inUrl = await fetch(call('list_books'), { path: `/mcp?access_token=${KEY}`, auth: null,
    headers: { 'X-Master-Key': KEY, 'x-api-key': KEY } });
  assert.equal(inUrl.status, 401);
  delete env.GPTUNNEL_WORKSHOP_KEY;
  assert.equal((await fetch(call('list_books'))).status, 401);
  assert.deepEqual(reads, []);
});

test('Streamable HTTP negotiates, discovers the exact allowlist, and supports SSE replies and notifications', async () => {
  const { fetch, json, reads } = fixture();
  const initialization = await json(rpc('initialize', { protocolVersion: '2025-06-18' }, 0));
  assert.equal(initialization.id, 0);
  assert.equal(initialization.result.protocolVersion, '2025-06-18');
  assert.deepEqual(Object.keys(initialization.result.capabilities), ['tools']);
  const list = await json(rpc('tools/list'));
  assert.deepEqual(list.result.tools.map(({ name }) => name), TOOLS);
  for (const { annotations, inputSchema } of list.result.tools) {
    assert.equal(annotations.readOnlyHint, true);
    assert.equal(inputSchema.additionalProperties, false);
  }
  const sse = await fetch(rpc('ping'), { headers: { Accept: 'text/event-stream' } });
  assert.match(sse.headers.get('Content-Type'), /text\/event-stream/);
  assert.match(await sse.text(), /^event: message\ndata: .*"result":\{\}/);
  assert.equal((await fetch({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  assert.equal((await fetch({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'list_books' } })).status, 202);
  const older = await fetch([rpc('ping'), rpc('ping', {}, 2)], { headers: { 'MCP-Protocol-Version': '2025-03-26' } });
  assert.deepEqual((await older.json()).map(({ id }) => id), [1, 2]);
  assert.equal((await fetch(undefined, { method: 'GET' })).status, 405);
  assert.deepEqual(reads, []);
});

test('Book, canon, chapter and search results come only from the selected snapshot', async () => {
  const { json, reads } = fixture();
  assert.deepEqual(unpack(await json(call('list_books'))), [{ id: BOOK_ID, title: book.title, updatedAt: book.updatedAt, chapters: 1 }]);
  const canon = unpack(await json(call('get_book_context', { book_id: BOOK_ID, offset: 12 })));
  assert.equal(canon.text, 'канон');
  assert.equal(canon.nextOffset, null);
  const chapters = unpack(await json(call('list_chapters', { book_id: BOOK_ID })));
  assert.deepEqual(chapters.chapters, [{ chapter: 1, title: 'Пролог', chars: book.chapters[0].text.length }]);
  const first = unpack(await json(call('read_chapter', { book_id: BOOK_ID, chapter: 1, limit: 2 })));
  assert.equal(first.text, 'А💡');
  const rest = unpack(await json(call('read_chapter', { book_id: BOOK_ID, chapter: 1, offset: first.nextOffset })));
  assert.equal(first.text + rest.text, book.chapters[0].text);
  const at = book.chapters[0].text.indexOf('Мира');
  const hits = unpack(await json(call('search_book', { book_id: BOOK_ID, query: '  мИРа  ' })));
  assert.deepEqual(hits.matches.map((hit) => hit.offset), [at]);
  assert.deepEqual(unpack(await json(call('search_book', { book_id: BOOK_ID, query: '.*' }))).matches, []);
  assert.equal((await json(call('read_chapter', { book_id: BOOK_ID, chapter: 2 }))).result.isError, true);
  assert.equal(reads.length, 8);
});

test('Unknown tools, other books, invalid arguments and owner routes cannot read or mutate KV', async () => {
  const { fetch, json, reads, env } = fixture();
  for (const name of ['get_income_overview', 'get_direct_live', 'get_marketing_overview', 'chapter_update', 'constructor', '__proto__']) {
    const reply = await json(call(name, { book_id: BOOK_ID }));
    assert.equal(reply.result.isError, true);
    assert.doesNotMatch(JSON.stringify(reply), new RegExp(name));
  }
  for (const [name, args] of [
    ['list_chapters', { book_id: 'book-2' }], ['list_chapters', { book_id: 'secret:direct-access' }],
    ['read_chapter', { book_id: BOOK_ID, chapter: '1' }], ['read_chapter', { book_id: BOOK_ID, chapter: 1, limit: 24001 }],
    ['get_book_context', { book_id: BOOK_ID, extra: KEY }], ['search_book', { book_id: BOOK_ID, query: '   ' }],
    ['list_books', ['unexpected']], ['list_books', null], ['list_books', { constructor: 1 }]
  ]) assert.equal((await json(call(name, args))).result.isError, true);
  for (const path of ['/sync/all', '/sync/section/income', '/health']) {
    assert.equal((await fetch(undefined, { path, method: 'DELETE' })).status, 404);
  }
  assert.equal((await fetch(call('list_books'), { headers: { Origin: 'https://elsewhere.example' } })).status, 403);
  assert.equal((await fetch(call('list_books'), { headers: { Origin: 'null' } })).status, 403);
  assert.equal((await fetch('{')).status, 400);
  assert.equal((await fetch('x'.repeat(17000))).status, 413);
  assert.equal((await fetch('{}', { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  env.GPTUNNEL_BOOK_ID = 'section:income';
  assert.equal((await fetch(call('list_books'))).status, 503);
  assert.deepEqual(reads, []);
});

test('Missing or mismatched snapshots reveal no other data and storage errors do not leak', async () => {
  for (const snapshot of [null, { ...book, id: 'book-2' }]) {
    const { json } = fixture(snapshot);
    assert.deepEqual(unpack(await json(call('list_books'))), []);
    assert.equal((await json(call('list_chapters', { book_id: BOOK_ID }))).result.isError, true);
  }
  const { json, env } = fixture();
  env.BOOKS.get = async () => { throw new Error(`${KEY} ${book.context}`); };
  const reply = await json(call('list_books'));
  assert.deepEqual(reply.error, { code: -32603, message: 'Internal error' });
});

test('Legacy SSE announces a protected endpoint and delivers JSON-RPC replies on the stream', async () => {
  const { fetch } = fixture();
  const res = await fetch(undefined, { path: '/sse', method: 'GET' });
  assert.equal(res.headers.get('Content-Type'), 'text/event-stream');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const next = async () => decoder.decode((await reader.read()).value);
  try {
    const endpoint = await next();
    assert.equal(endpoint, `event: endpoint\ndata: /sse/message?sessionId=${SESSION}\n\n`);
    const path = endpoint.split('\n')[1].slice(6);
    assert.equal((await fetch(rpc('initialize', { protocolVersion: '2025-11-25' }), { path })).status, 202);
    assert.match(await next(), /"protocolVersion":"2024-11-05"/);
    assert.equal((await fetch(rpc('tools/list'), { path })).status, 202);
    assert.match(await next(), /"name":"read_chapter"/);
    assert.equal((await fetch(call('list_books'), { path })).status, 202);
    assert.match(await next(), /Пробная книга/);
  } finally {
    await reader.cancel();
  }
  assert.equal((await fetch(rpc('ping'), { path: `/sse/message?sessionId=${SESSION}` })).status, 404);
});
