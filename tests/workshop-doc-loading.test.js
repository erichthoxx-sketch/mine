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
