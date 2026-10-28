import test from 'node:test';
import assert from 'node:assert/strict';
import { startInfo, readerPath, normalize } from '../site/content.js';

test('кабинет: старт подписки — только с датой из админки и пока не прошёл; цены числами', () => {
  assert.equal(startInfo({ startDate: '' }, '2026-10-28'), null);
  assert.equal(startInfo({ startDate: '2026-10-01' }, '2026-10-28'), null);
  assert.deepEqual(startInfo({ startDate: '2026-11-15', startPrice: '99', price: '149 ₽' }, '2026-10-28'), { date: '2026-11-15', days: 18, price: 99, old: 149 });
  assert.equal(startInfo({ startDate: '2026-10-28' }, '2026-10-28').days, 0);
});

test('кабинет: путь читателя — пять шагов и статус', () => {
  assert.deepEqual(readerPath({}).done, [true, false, false, false, false]);
  assert.equal(readerPath({}).level, 0);
  assert.equal(readerPath({}).next, 1);
  const all = readerPath({ gift: true, remind: { a: true }, shelf: { a: 'reading', b: 'done' } });
  assert.equal(all.n, 5); assert.equal(all.level, 3); assert.equal(all.next, -1);
});

test('кабинет: тексты прототипа, которые не меняли, сами меняются на новые; свои — остаются', () => {
  const old = 'Создать кабинет\nОткрыть подарок\nДочитать подарок\nВключить напоминание о старте\nОтметить прочитанную книгу';
  assert.match(normalize({ v: 4, blocks: [], cabSteps: old }).cabSteps, /Скачать подарок/);
  assert.equal(normalize({ v: 4, blocks: [], cabSteps: 'Мои шаги' }).cabSteps, 'Мои шаги');
  assert.equal(normalize({ v: 4, blocks: [] }).cabLevels.split('\n')[0], 'Новенькая');
});
