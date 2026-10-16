import test from 'node:test';
import assert from 'node:assert/strict';
import { legendContext, parsePlan, legendBlocks, blocksPlain, hashText } from '../writer/js/legend.js';

const L = {
  idea: { logline: 'Вдова мстит бывшему', genre: 'второй шанс' },
  chars: [{ id: 'a', name: 'Анна', role: 'heroine', age: '29', want: 'вернуть дом' }, { id: 'b', name: 'Илья', role: 'hero' }],
  plan: [{ id: '1', title: 'Похороны', what: 'Анна хоронит мужа', pov: 'a', chars: ['a', 'b'] }, { id: '2', title: 'Встреча', what: 'Илья возвращается', chars: [] }, { id: '3', title: 'Ссора', what: '', chars: [] }],
};

test('легенда: текст для нейросети — идея, персонажи, каркас до главы и «пишем дальше»', () => {
  const t = legendContext(L, { title: 'Развод', upTo: 1 });
  assert.match(t, /# Легенда книги «Развод»/);
  assert.match(t, /- О чём книга — одной фразой: Вдова мстит бывшему/);
  assert.match(t, /### Анна \(Героиня, 29 лет\)/);
  assert.match(t, /1\. Похороны — Анна хоронит мужа \(глазами: Анна; в сцене: Анна, Илья\)/);
  assert.ok(!/Ссора/.test(t));
  assert.match(t, /## Пишем дальше: Встреча\nИлья возвращается/);
});

test('легенда: каркас из текста вкладки «Каркас»', () => {
  let n = 0;
  const p = parsePlan('Мой план\nПролог\nОна у могилы\n\nГлава 1. Похороны\nАнна хоронит мужа\nвсе смотрят\n2) Встреча', () => String(++n));
  assert.deepEqual(p.map((x) => [x.title, x.what]), [['Пролог', 'Она у могилы'], ['Похороны', 'Анна хоронит мужа\nвсе смотрят'], ['Встреча', '']]);
  assert.equal(p.intro, 'Мой план');
  assert.equal(parsePlan('Глава 5\nбой')[0].title, 'Глава 5');
  assert.deepEqual(parsePlan('Первая сцена\n\nВторая сцена').map((x) => x.what), ['Первая сцена', 'Вторая сцена']);
});

test('легенда: вкладки Документа и сравнение текста', () => {
  const t = blocksPlain(legendBlocks(L, 'chars'));
  assert.match(t, /Анна — героиня\nВозраст: 29\nЧего хочет: вернуть дом\nИлья — герой/);
  assert.equal(hashText('а\n\n б '), hashText('а\nб'));
});
