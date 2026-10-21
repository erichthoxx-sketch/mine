import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorshipParas, revMonths, sha256Hex } from '../writer/js/authorship.js';

test('справка об авторстве: версии по месяцам, главы с отпечатками', async () => {
  assert.equal(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.deepEqual(revMonths(['2026-09-29T20:12:00Z', '2026-10-01T10:00:00Z', '2026-10-01T18:00:00Z', '2026-10-05T09:00:00Z']), [{ month: '2026-09', days: 1 }, { month: '2026-10', days: 2 }]);
  const paras = authorshipParas({ title: 'Вдова', author: 'Лана Фрейтаг', now: '2026-10-21T12:30:00Z', file: { name: 'Вдова', created: '2026-09-29T20:12:00Z', modified: '2026-10-20T19:00:00Z' },
    revs: ['2026-09-29T20:12:00Z', '2026-10-01T10:00:00Z'], archive: { lastRun: '2026-10-21T03:00:00Z' }, chapters: [{ title: 'Глава 1', chars: 12345, hash: 'ab'.repeat(32) }] });
  const text = paras.map((p) => p.runs.map((r) => r.t).join('')).join('\n');
  assert.match(text, /Произведение: «Вдова»/);
  assert.match(text, /2 версии с 29\.09\.2026 по 01\.10\.2026/);
  assert.match(text, /Октябрь 2026 — правки в 1 день/);
  assert.match(text, /Глава 1 — 12 345 зн\.\nотпечаток: (ab){32}/);
  assert.match(text, /Всего: 1 глава, 12 345 знаков/);
});
