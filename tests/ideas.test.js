import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ideaKind, bookGuess, chapterRef, isDone, isOpen, ideaTitle, expired } from '../writer/js/ideacalc.js';

const books = [{ id: 'z', title: 'Звериная тропа для двоих' }, { id: 'r', title: 'Развод для черной вдовы. Роман' }, { id: 'a', title: 'Альпийский развод. Он оставил меня умирать' }];

test('идеи: книга по тексту', () => {
  assert.equal(bookGuess('Где коньяк Ефимыча в звериной тропе — проверить', books)?.id, 'z');
  assert.equal(bookGuess('В звериной тропе нужно добавить описание', books)?.id, 'z');
  assert.equal(bookGuess('черной вдовы пролог переписать', books)?.id, 'r');
  assert.equal(bookGuess('Поросяче розовый костюм', books), null);
  assert.equal(bookGuess('альпийский развод — сцена в горах', books)?.id, 'a'); // «развод» есть в двух названиях — побеждает точное
});

test('идеи: вид записи и глава', () => {
  assert.equal(ideaKind({ text: 'Где коньяк Ефимыча — проверить сцену на правдоподобность' }), 'fix');
  assert.equal(ideaKind({ text: 'Поросяче розовый костюм' }), 'idea');
  assert.equal(ideaKind({ title: 'Название для третьей книги' }), 'name');
  assert.equal(ideaKind({ text: 'сцена в горах, он возвращается' }), 'scene');
  assert.equal(ideaKind({ text: 'что угодно', kind: 'char' }), 'char'); // выбрала сама — так и остаётся
  assert.deepEqual(chapterRef('в 5 главе добавить'), { label: 'Гл. 5', title: 'Глава 5', n: 5 });
  assert.equal(chapterRef('Глава 12: убрать повтор').title, 'Глава 12');
  assert.equal(chapterRef('в прологе').label, 'Пролог');
  assert.equal(chapterRef('просто мысль'), null);
});

test('идеи: два статуса и корзина', () => {
  assert.ok(isOpen({ status: 'new' }) && isOpen({ status: 'work' }) && isOpen({}));
  assert.ok(isDone({ status: 'used' }) && isDone({ status: 'archive' }));
  assert.ok(!isOpen({ status: 'new', deletedAt: '2026-10-01' }));
  assert.equal(ideaTitle({ text: 'Первая строка\nвторая' }), 'Первая строка');
  const now = Date.parse('2026-10-19T00:00:00Z');
  assert.ok(expired({ deletedAt: '2026-09-01T00:00:00Z' }, now)); assert.ok(!expired({ deletedAt: '2026-10-10T00:00:00Z' }, now));
});

test('Todoist: «Готово» закрывает задачу, готовые не отправляются', async () => {
  const { ideasPlan } = await import('../writer/js/todoist.js');
  const ideas = [
    { id: 'a', title: 'Сцена', text: '', status: 'used', tdId: '1', tdT: 'Сцена', tdD: '' },
    { id: 'b', title: 'Новая мысль', text: '', status: 'new' },
    { id: 'c', title: 'Старая', text: '', status: 'used' },
  ];
  const ops = ideasPlan(ideas, [{ id: '1', t: 'Сцена', d: '' }]);
  assert.deepEqual(ops.close.map((x) => x.id), ['a']);
  assert.deepEqual(ops.push.map((x) => x.id), ['b']);
});
