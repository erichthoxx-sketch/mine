import test from 'node:test';
import assert from 'node:assert/strict';
import { spoilerHits, spoilerList } from '../js/spoilers.js';
import { siteChecks } from '../writer/js/sitecheck.js';

test('Не раскрывать: поворот находится и в другой форме слов', () => {
  const L = ['муж жив'];
  assert.deepEqual(spoilerHits('Она похоронила мужа. Живого', L), ['муж жив']);
  assert.deepEqual(spoilerHits('Вдова, у которой муж жив', L), ['муж жив']);
  assert.deepEqual(spoilerHits('Собиралась развестись, а пришлось хоронить', L), []);
  assert.deepEqual(spoilerList({ direct: { spoilers: 'муж жив\n\nГлеб — заказчик' } }), ['муж жив', 'Глеб — заказчик']);
});

test('Сверка сайта видит раскрытие поворота в крючке книги', () => {
  const wbooks = [{ id: 'w', title: 'Развод для черной вдовы', status: 'progress', direct: { spoilers: 'муж жив' } }];
  const site = { books: [{ title: 'Развод *для черной вдовы*', status: 'writing', tagline: 'Она похоронила мужа, который жив.' }] };
  const r = siteChecks({ wbooks, site });
  assert.ok(r.some((x) => x.k === 'spoil:w:tagline'));
});
