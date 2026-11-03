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
