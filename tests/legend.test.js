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

test('легенда: рабочий контекст — только утверждённое; полный — с пометками, вопросами и отвергнутым', async () => {
  const { legendContext } = await import('../writer/js/legend.js');
  const L2 = {
    idea: { logline: 'Вдова и мошенник' }, chars: [],
    plan: [{ id: '1', title: 'Похороны', what: 'Анна хоронит мужа' }, { id: '2', title: 'Долг', what: 'денежный долг', st: 'no' }, { id: '3', title: 'Убийство мошенника', what: 'кто-то убил', st: 'talk' }],
    questions: [{ id: 'q1', q: 'Как супруги раскрыли мошенника?', a: 'по выписке', st: 'ok' }, { id: 'q2', q: 'Финальная конфронтация?', a: '', st: 'open' }],
  };
  const w = legendContext(L2, { title: 'Вдова' });
  assert.match(w, /1\. Похороны — Анна хоронит мужа/);
  assert.ok(!/Долг|Убийство|Финальная/.test(w), w);
  assert.match(w, /## Решения \(утверждено\)\n- Как супруги раскрыли мошенника\? — по выписке/);
  const f = legendContext(L2, { title: 'Вдова', mode: 'full' });
  assert.match(f, /1\. Похороны \[утверждено\]/);
  assert.match(f, /2\. Убийство мошенника \[обсуждается\]/);
  assert.match(f, /## Открытые вопросы \(ещё не решено\)\n- Финальная конфронтация\?/);
  assert.match(f, /## Отвергнуто — не использовать\n- Долг — денежный долг/);
});
