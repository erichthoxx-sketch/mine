import test from 'node:test';
import assert from 'node:assert/strict';
import { watermarkControlAvailable } from '../writer/js/watermark-highlight.js';

test('Кнопка скрыта, если обученный анализатор отсутствует', () => {
  assert.equal(watermarkControlAvailable({ models: [] }), false);
  assert.equal(watermarkControlAvailable(null), false);
  assert.equal(watermarkControlAvailable({ availableCount: 2, models: [] }), false);
});

test('Кнопка появляется только после загрузки анализатора', () => {
  const validCatalog = { models: [{ label: 'Русский текст', data: { scorer: {} } }] };
  assert.equal(watermarkControlAvailable(validCatalog), true);
  assert.equal(watermarkControlAvailable(validCatalog, false), false);
});
