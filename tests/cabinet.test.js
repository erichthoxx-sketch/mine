import test from 'node:test';
import assert from 'node:assert/strict';
import { startInfo, readerPath, normalize, bonusItems } from '../site/content.js';

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

test('кабинет: пустые разделы не предлагаются', () => {
  // без подарка и без даты старта следующий шаг — «Читаю»
  assert.equal(readerPath({}, { gift: false, start: false }).next, 3);
  assert.equal(readerPath({}, { gift: true }).next, 1);
  assert.deepEqual(bonusItems('Бонусная сцена — https://a.ru/x\n\nОбложка | https://b.ru\nСкоро отрывок'), [
    { title: 'Бонусная сцена', url: 'https://a.ru/x' }, { title: 'Обложка', url: 'https://b.ru' }, { title: 'Скоро отрывок', url: '' }]);
  assert.deepEqual(bonusItems(''), []);
});

test('розыгрыш: пятница недели и выбор победительницы', async () => {
  const { raffleFriday, drawRaffle } = await import('../site/content.js');
  assert.equal(raffleFriday('2026-10-29'), '2026-10-30'); // чт → эта пятница
  assert.equal(raffleFriday('2026-11-01'), '2026-10-30'); // вс → прошедшая пятница той же недели
  assert.equal(raffleFriday('2026-11-02'), '2026-11-06'); // пн → новая неделя
  const entries = [{ uid: 'a', book: 'b1' }, { uid: 'b', book: 'b2' }, { uid: 'c', book: '' }];
  assert.equal(drawRaffle([], {}, [], '2026-10-30').why, 'empty');
  assert.equal(drawRaffle(entries, {}, [], '2026-10-30').why, 'nocodes');
  const r = drawRaffle(entries, { b2: ['X1', 'X2'] }, [], '2026-10-30', () => 0.99);
  assert.equal(r.entry.uid, 'b'); assert.equal(r.code, 'X1');
  // выигрывала 2 недели назад — пропускает
  assert.equal(drawRaffle(entries, { b2: ['X1'] }, [{ uid: 'b', week: '2026-10-16' }], '2026-10-30').why, 'recent');
  assert.equal(drawRaffle(entries, { b2: ['X1'] }, [{ uid: 'b', week: '2026-09-25' }], '2026-10-30').entry.uid, 'b');
});
