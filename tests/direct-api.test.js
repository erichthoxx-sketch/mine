import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, report } from '../direct/js/api.js';

const settings = { direct: { proxy: 'https://example.workers.dev' }, directToken: 'fake-token-for-tests' };
const limited = () => new Response(JSON.stringify({ error: { error_code: 56, error_string: 'Метод можно запрашивать не чаще 1 раза в 10 секунд' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });

test('Директ: код 56 повторяет безопасный запрос с паузой 11 секунд', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return requests === 1 ? limited() : new Response(JSON.stringify({ result: { Campaigns: [{ Id: 7 }] } }), { status: 200 });
  });
  const pauses = [];
  const result = await call(settings, 'campaigns', 'get', { SelectionCriteria: {} }, 2, async (ms) => { pauses.push(ms); });
  assert.equal(requests, 2);
  assert.deepEqual(pauses, [11000]);
  assert.equal(result.Campaigns[0].Id, 7);
});

test('Директ: запись не повторяется автоматически при ограничении', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return limited(); });
  await assert.rejects(call(settings, 'campaigns', 'update', {}, 2, async () => { throw Error('Запись нельзя повторять'); }),
    (e) => e.code === 56 && e.rateLimited && e.transient);
  assert.equal(requests, 1);
});

test('Отчёт Директа: код 56 повторяет чтение после паузы', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return requests === 1 ? limited() : new Response('Date\tClicks\n2026-10-22\t3\n', { status: 200 });
  });
  const pauses = [];
  const rows = await report(settings, { name: 'test', fields: ['Date', 'Clicks'] }, { wait: async (ms) => { pauses.push(ms); } });
  assert.equal(requests, 2);
  assert.deepEqual(pauses, [11000]);
  assert.equal(rows[0].Clicks, 3);
});

test('Директ: после ограниченного числа повторов код 56 возвращает понятную ошибку', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return limited(); });
  const pauses = [];
  await assert.rejects(call(settings, 'campaigns', 'get', {}, 2, async (ms) => { pauses.push(ms); }), (e) => e.code === 56 && e.rateLimited && e.transient);
  assert.equal(requests, 3);
  assert.deepEqual(pauses, [11000, 11000]);
});
