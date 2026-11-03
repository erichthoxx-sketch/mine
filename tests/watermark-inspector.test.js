import test from 'node:test';
import assert from 'node:assert/strict';
import { scanTechnicalMarks } from '../writer/js/watermark-inspector.js';

test('identifies a zero-width character and unusual Unicode space by offset', () => {
  const matches = scanTechnicalMarks('Она\u200B пришла\u202Fсюда.');
  assert.equal(matches.length, 2);
  assert.deepEqual(matches.map((m) => m.code), ['U+200B', 'U+202F']);
  assert.deepEqual(matches.map((m) => m.offset), [3, 11]);
});

test('does not flag ordinary punctuation, Cyrillic or nonbreaking U+00A0', () => {
  assert.deepEqual(scanTechnicalMarks('Тихая ночь, — она сказала.\u00A0Да!'), []);
});

test('does not claim to recognize a statistical Claude watermark', () => {
  assert.deepEqual(scanTechnicalMarks('Обычная проза без необычных Unicode-символов.'), []);
});
