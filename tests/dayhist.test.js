import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overdueToMove, linkTodosToMove, trimMoved, dayHistory, movedFrom } from '../writer/js/dayhist.js';

test('Планер: несделанное переезжает на сегодня, в прошедшем дне — сделано / перенесено', () => {
  const own = [{ id: '1', t: 'Написать план', d: '2026-10-29' }, { id: '2', t: 'Йога', d: '2026-10-29', r: true }, { id: '3', t: 'Завтра', d: '2026-10-31' }, { id: '4', t: 'Без даты', d: '' }];
  assert.deepEqual(overdueToMove(own, '2026-10-30').map((x) => x.id), ['1']); // повторяющиеся и будущие — не трогаем
  const links = [{ id: 'l', todos: [{ k: 'a', text: 'Отчёт', date: '2026-10-28', done: false }, { k: 'b', text: 'Готово', date: '2026-10-28', done: true }] }];
  assert.deepEqual(linkTodosToMove(links, '2026-10-30'), [{ linkId: 'l', k: 'a', t: 'Отчёт', from: '2026-10-28' }]);
  assert.deepEqual(trimMoved([{ from: '2026-07-01', to: '2026-07-02' }, { from: '2026-10-29', to: '2026-10-30' }], '2026-10-30').length, 1);
  const moved = [{ id: '1', t: 'Написать план', from: '2026-10-29', to: '2026-10-30' }];
  const h = dayHistory({ done: [{ t: 'Составить блог' }, { t: 'составить  блог' }], linksDone: [{ t: 'Письмо таргетологу' }], moved }, '2026-10-29');
  assert.deepEqual(h, [{ kind: 'done', t: 'Составить блог' }, { kind: 'done', t: 'Письмо таргетологу' }, { kind: 'moved', t: 'Написать план', to: '2026-10-30' }]);
  assert.equal(movedFrom(moved, '1', '2026-10-30'), '2026-10-29');
  assert.equal(movedFrom(moved, '1', '2026-10-31'), '');
});

test('Todoist: сделанное за день — правильный запрос и разбор ответа; перенос — новая дата', async () => {
  const { fetchDone, moveDue } = await import('../writer/js/todoist.js');
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => { calls.push([String(url), opts.method || 'GET', opts.body || '']); return { ok: true, status: 200, json: async () => (String(url).includes('/completed/') ? { items: [{ id: '7', content: 'Составить блог', completed_at: '2026-10-29T10:00:00Z' }, { id: '8', content: 'подзадача', parent_id: '7' }], next_cursor: null } : { id: '9' }) }; };
  const done = await fetchDone('tok', '2026-10-29');
  assert.match(calls[0][0], /\/api\/v1\/tasks\/completed\/by_completion_date\?since=.+&until=.+&limit=200$/);
  assert.deepEqual(done, [{ id: '7', t: 'Составить блог', at: '2026-10-29T10:00:00Z' }]);
  await moveDue('tok', '9', '2026-10-30');
  assert.deepEqual([calls[1][0].replace(/^.*\/api\/v1/, ''), calls[1][1], JSON.parse(calls[1][2])], ['/tasks/9', 'POST', { due_date: '2026-10-30' }]);
});
