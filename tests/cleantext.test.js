import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, hasHidden, cleanedMsg } from '../js/cleantext.js';

test('чистка: невидимые символы убираются, особые пробелы → обычные, неразрывный пробел остаётся', () => {
  const tag = String.fromCodePoint(0xE0041), sel = String.fromCodePoint(0xE0101);
  const src = `Он​ вошёл в комнату. — Привет,‍ сказала${tag}${sel} она﻿.`;
  const r = cleanText(src);
  assert.equal(r.text, 'Он вошёл в комнату. — Привет, сказала она.');
  assert.equal(r.n, 6);
  assert.equal(hasHidden(src), true);
  assert.equal(hasHidden(r.text), false);
  assert.equal(cleanText('Обычный текст «ёлочки» — тире… 10 000').n, 0);
  assert.equal(cleanText('❤️').text, '❤️'); // эмодзи не ломаем
  assert.equal(cleanedMsg(1), 'Убрала 1 невидимый символ');
  assert.equal(cleanedMsg(3), 'Убрала 3 невидимых символа');
  assert.equal(cleanedMsg(12), 'Убрала 12 невидимых символов');
});
