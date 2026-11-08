import test from 'node:test';
import assert from 'node:assert/strict';

test('Когда показывать рекламу: ночью покупают реже — совет снизить ставки', async () => {
  const { timePlan } = await import('../direct/js/mcalc.js');
  const hours = [];
  for (let h = 0; h < 24; h++) hours.push({ key: String(h), name: `${h}:00`, visits: 100, goals: { 9: h <= 6 ? 0 : 6 } });
  const tp = timePlan(hours, ['9']);
  assert.equal(tp.rows.find((x) => x.id === 'night').conv, 0);
  assert.ok(tp.tips.some((t) => t.part === 'night' && t.pct === 50));
  const flat = timePlan(hours.map((h) => ({ ...h, goals: { 9: 4 } })), ['9']);
  assert.equal(flat.tips.length, 0);
});
