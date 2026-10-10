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
  assert.deepEqual(ops.verify.map((x) => x.w.key), [tax.key]); // id 2 нет среди открытых — проверим отдельно, закрыта ли
  assert.deepEqual(ops.close, [{ key: 'gone_x', id: '9' }]);
  assert.deepEqual(ops.create.map((x) => x.key), [call.key]);
  assert.deepEqual(ops.update.map((x) => [x.id, !!x.adopt]), [['5', true]]);
  // связь потерялась (ошибочно считалось «закрыто»), а задача на месте — подхватываем, а не забываем
  const healed = todoistPlan([mk], {}, { [mk.key]: '2026-10-09' }, [{ id: '5', content: mk.content, due: { date: mk.date } }, { id: '7', content: 'Устаревшее', due: { date: '2026-10-01' } }]);
  assert.deepEqual(healed.unclose, [mk.key]);
  assert.deepEqual(healed.close, [{ key: null, id: '7' }]); // наша задача, которой в планере нет, — закрыть
  // закрытое в Todoist заново не создаём
  assert.equal(todoistPlan(w, {}, { [call.key]: '2026-10-12' }, []).create.some((x) => x.key === call.key), false);
  // дата сдвинулась — обновить
  const moved = todoistPlan([{ ...pub, date: '2026-10-13' }], { [pub.key]: { id: '1' } }, {}, active);
  assert.equal(moved.update.length, 1);
});

test('идеи ⇄ Todoist: новые, правки с обеих сторон, удалённые, закрытые', async () => {
  const { ideasPlan } = await import('../writer/js/todoist.js');
  const ideas = [
    { id: 'a', title: 'Сцена в горах', text: '', tdId: '1', tdT: 'Сцена в горах', tdD: '' }, // без изменений
    { id: 'b', title: 'Старое', text: '', tdId: '2', tdT: 'Старое', tdD: '' }, // поменяли в Todoist
    { id: 'c', title: 'Новое здесь', text: 'текст', tdId: '3', tdT: 'Было', tdD: '' }, // поменяли в приложении
    { id: 'd', title: 'Удалила', tdId: '4', tdT: 'Удалила', tdD: '', deletedAt: '2026-10-10' },
    { id: 'e', title: 'Только в приложении' }, // отправить в Todoist
    { id: 'f', title: 'Закрыла в Todoist', tdId: '9', tdT: 'Закрыла в Todoist', tdD: '' },
  ];
  const tasks = [{ id: '1', t: 'Сцена в горах', d: '' }, { id: '2', t: 'Новое из Todoist', d: '' }, { id: '3', t: 'Было', d: '' }, { id: '4', t: 'Удалила', d: '' }, { id: '7', t: 'Сцена с санитарами', d: '' }];
  const ops = ideasPlan(ideas, tasks);
  assert.deepEqual(ops.create.map((t) => t.id), ['7']);
  assert.deepEqual(ops.pull.map((p) => p.x.id), ['b']);
  assert.deepEqual(ops.update.map((x) => x.id), ['c']);
  assert.deepEqual(ops.close.map((x) => x.id), ['d']);
  assert.deepEqual(ops.push.map((x) => x.id), ['e']);
  assert.deepEqual(ops.gone.map((x) => x.id), ['f']);
});
