import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todoistTasks, todoistPlan, shortTitle } from '../writer/js/todoist.js';

const books = { b1: { id: 'b1', title: 'Альпийский развод. Он оставил меня умирать' } };
const items = [
  { date: '2026-10-10', kind: 'pub', title: 'Выложить «Глава 5»', sub: 'Альпийский развод · Литнет', book: 'b1', ch: 'Глава 5' },
  { date: '2026-10-11', kind: 'wait', title: '⏱ Глава 6 — выйдет сама', sub: '', to: '/book/b1' },
  { date: '2026-10-28', kind: 'money', title: 'Заплатить налог за сентябрь', sub: '≈ 1 454 ₽ · до 28-го' },
  { date: '2026-10-12', kind: 'waitans', title: 'Позвонить &quot;Эксмо&quot;', sub: 'Издательство', linkId: 'l1', todoK: 'k1' },
  { date: '2026-10-09', kind: 'mk', title: 'Маркетинг к старту', sub: '', to: '/mk/b1' },
];

test('пункты планера раскладываются по полочкам', () => {
  const w = todoistTasks(items, books);
  assert.equal(w.length, 4); // «выйдет сама» не отправляем
  assert.deepEqual([w[0].project, w[0].section], ['Книги', 'Альпийский развод']);
  assert.deepEqual([w[1].project, w[1].section], ['Мастерская', 'Деньги и реклама']);
  assert.equal(w[2].content, 'Позвонить "Эксмо"');
  assert.deepEqual([w[2].project, w[2].section], ['Мастерская', 'Связи']);
  assert.deepEqual([w[3].project, w[3].section], ['Книги', 'Альпийский развод']);
  assert.ok(w.every((x) => /^[a-z]+_[0-9a-z]+$/.test(x.key)));
  assert.equal(shortTitle('Звериная тропа для двоих'), 'Звериная тропа для двоих');
});

test('план синхронизации: создать, обновить, закрыть, не дублировать', () => {
  const w = todoistTasks(items, books);
  const [pub, tax, call, mk] = w;
  const map = { [pub.key]: { id: '1' }, [tax.key]: { id: '2' }, gone_x: { id: '9' } };
  const active = [
    { id: '1', content: pub.content, description: pub.description, due: { date: '2026-10-10' } }, // без изменений
    { id: '9', content: 'Старое', due: { date: '2026-10-09' } }, // в планере больше нет → закрыть
    { id: '5', content: mk.content, due: { date: mk.date } }, // такая уже есть (другое устройство) → взять
  ];
  const ops = todoistPlan(w, map, {}, active);
  assert.deepEqual(ops.doneInTodoist.map((x) => x.key), [tax.key]); // id 2 нет среди открытых — закрыла в Todoist
  assert.deepEqual(ops.close, [{ key: 'gone_x', id: '9' }]);
  assert.deepEqual(ops.create.map((x) => x.key), [call.key]);
  assert.deepEqual(ops.update.map((x) => [x.id, !!x.adopt]), [['5', true]]);
  // закрытое в Todoist заново не создаём
  assert.equal(todoistPlan(w, {}, { [call.key]: '2026-10-12' }, []).create.some((x) => x.key === call.key), false);
  // дата сдвинулась — обновить
  const moved = todoistPlan([{ ...pub, date: '2026-10-13' }], { [pub.key]: { id: '1' } }, {}, active);
  assert.equal(moved.update.length, 1);
});
