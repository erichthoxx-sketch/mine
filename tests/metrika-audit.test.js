import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalMetric, mkRows, reach, sumDays, goalTotals30 } from '../direct/js/mcalc.js';

test('Процент конверсии в Метрике считается по целевым визитам, не срабатываниям', () => {
  assert.equal(goalMetric(9001), 'ym:s:goal9001visits');
  // Метрика может зафиксировать 8 достижений цели в 5 целевых визитах.
  // Сырые достижения не должны завышать конверсию.
  const rows = mkRows({ data: [{ dimensions: [{ id: '2026-10-21', name: '2026-10-21' }], metrics: [100, 70, 20, 1.5, 32, 5] }] }, [9001]);
  const total = sumDays(rows, '2026-10-21', '2026-10-21', [9001]);
  assert.equal(total.visits, 100);
  assert.equal(total.conv, 5);
  assert.equal(total.cr, 0.05);
});

test('Фактическая статистика включает дни сбоя, корректировка темпа — отдельная операция', () => {
  const days = [
    { key: '2026-10-20', visits: 80, users: 70, goals: { 9001: 4 }, bounce: 0.2, dur: 20, depth: 2 },
    { key: '2026-10-21', visits: 10, users: 10, goals: { 9001: 1 }, bounce: 0.5, dur: 5, depth: 1 },
  ];
  const all = sumDays(days, '2026-10-20', '2026-10-21', [9001]);
  assert.equal(all.visits, 90);
  assert.equal(all.conv, 5);
  assert.equal(reach(days[1], [9001]), 1);
  const adjusted = sumDays(days, '2026-10-20', '2026-10-21', [9001], new Set(['2026-10-21']));
  assert.equal(adjusted.visits, 80);
  assert.equal(goalTotals30(days, '2026-10-20', '2026-10-21').visits, 90);
});
