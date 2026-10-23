import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCharacterAge } from '../writer/js/legend.js';

test('Возраст персонажа склоняется по числу', () => {
  const examples = new Map([
    [1, '1 год'], [2, '2 года'], [4, '4 года'], [5, '5 лет'],
    [11, '11 лет'], [14, '14 лет'], [21, '21 год'], [22, '22 года'],
    [25, '25 лет'], [31, '31 год'], [32, '32 года'], [35, '35 лет'],
    [101, '101 год'], [112, '112 лет'],
  ]);
  for (const [age, expected] of examples) assert.equal(formatCharacterAge(age), expected);
});
test('Не добавляем второй суффикс к уже заполненному возрасту', () => {
  assert.equal(formatCharacterAge('31 год'), '31 год');
  assert.equal(formatCharacterAge('31 год лет'), '31 год');
  assert.equal(formatCharacterAge('32 лет'), '32 года');
  assert.equal(formatCharacterAge('35 лет'), '35 лет');
  assert.equal(formatCharacterAge(' 21   год '), '21 год');
  assert.equal(formatCharacterAge('около 30'), 'около 30');
  assert.equal(formatCharacterAge('30–35'), '30–35');
  assert.equal(formatCharacterAge(''), '');
  assert.equal(formatCharacterAge(null), '');
});
