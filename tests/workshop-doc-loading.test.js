import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Чтение главы ограничено по времени, включая загрузку тела ответа', async (t) => {
  globalThis.location = { hostname: 'example.invalid' };
  globalThis.localStorage = { getItem: () => JSON.stringify({ access_token: 'test', exp: Date.now() + 30000 }) };
  t.after(() => { delete globalThis.location; delete globalThis.localStorage; });
  const drive = await import('../writer/js/drive.js');
  const fetch = t.mock.method(globalThis, 'fetch', async (_, { signal }) => ({
    ok: true, json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  }));
  await assert.rejects(drive.getDoc('test', { timeout: 15 }), /не ответили вовремя/);
  fetch.mock.mockImplementation(async () => Response.json({ documentId: 'test' }));
  assert.equal((await drive.getDoc('test')).documentId, 'test');
});


test('Редактор запрашивает сокращённый документ, повторяет чтение после тайм-аута и не повторяет 403', async (t) => {
  globalThis.location = { hostname: 'example.invalid' };
  globalThis.localStorage = { getItem: () => JSON.stringify({ access_token: 'test', exp: Date.now() + 30000 }) };
  t.after(() => { delete globalThis.location; delete globalThis.localStorage; });
  const drive = await import('../writer/js/drive.js');
  const doc = { documentId: 'test', tabs: [{ tabProperties: { tabId: '18', title: 'Глава 18' }, documentTab: { body: { content: [] }, namedStyles: {} } }] };
  let calls = 0;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, { signal }) => {
    assert.match(new URL(url).searchParams.get('fields'), /documentTab\(body\(content\),namedStyles\)/);
    if (++calls === 1) return { ok: true, json: () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) };
    return Response.json(doc);
  });
  assert.deepEqual(await drive.getChapterDoc('test', { timeout: 15, retryTimeout: 100 }), doc);
  assert.equal(calls, 2);
  fetch.mock.mockImplementation(async () => { calls++; return Response.json({ error: { message: 'Forbidden' } }, { status: 403 }); });
  await assert.rejects(drive.getChapterDoc('test'), /403/);
  assert.equal(calls, 3);
});
