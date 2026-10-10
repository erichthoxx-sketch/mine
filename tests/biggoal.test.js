import test from 'node:test';
import assert from 'node:assert/strict';

// модуль подключает ui.js — для Node хватает пустых заглушек браузера
globalThis.document ??= { getElementById: () => null, addEventListener() {} };
globalThis.window ??= {};

test('большая цель: старт 50 000 ₽ роялти, налог НПД → УСН 6% с года, где превышен лимит', async () => {
  const { bigGoalStatus } = await import('../js/biggoal.js');
  const fin = () => ({ royalty: 80000, net: 70000, tax: 4800, taxBase: 120000 }); // до налога остаётся 93,5 %, база налога = 1,5 × роялти
  const c = { settings: { taxRate: 4, bigGoal: { amount: 500000, by: '2030-01', kind: 'net', startMonth: '2026-10', startRoy: 50000 } }, today: '2026-10-11', dataEnd: '2026-10-11', firstDate: '2026-01-01' };
  const st = bigGoalStatus(c, fin);
  assert.equal(st.roy['2026-10'], 50000); // октябрь — ровно стартовая цель
  assert.equal(st.usnFrom, '2028');
  assert.equal(st.targetRoy, Math.round(500000 / (0.935 - 1.5 * 0.06)));
  // скачок на налоге: январь 2028 к декабрю 2027 — рост месяца × (0,875 / 0,845)
  const jump = st.roy['2028-01'] / st.roy['2027-12'];
  assert.ok(Math.abs(jump - (1 + st.plan.growth) * (0.875 / 0.845)) < 0.002);
});
