import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../writer/index.html', import.meta.url), 'utf8');
const block = selector => {
  const needle = selector + ' {';
  const index = css.indexOf(needle);
  assert.notEqual(index, -1, 'Missing style for '+selector);
  const end = css.indexOf('}', index);
  return css.slice(index + needle.length, end);
};
test('Marketing uses the actual typography (Nunito / Unbounded)', () => {
  assert.match(html, /family=Nunito/);
  assert.match(html, /family=Unbounded/);
  assert.match(block('.app-writer .mk-book-card .mk-info > b'), /font-family:\s*var\(--font-body\)/);
  assert.match(block('.app-writer .mk-book-card .mk-info > b'), /font-size:\s*15px/);
  assert.match(block('.app-writer .mk-book-card .mk-info > b'), /font-weight:\s*700/);
  assert.match(block('.app-writer .mk-book-card .mk-info > .sub'), /font-family:\s*var\(--font-body\)/);
  assert.match(block('.app-writer .mk-book-card .mk-info > .sub'), /font-size:\s*13px/);
  assert.match(block('.app-writer .mk-book-card .mk-utm-action'), /font-size:\s*13px/);
  assert.match(block('.app-writer .mk-book-card .mk-utm-action'), /font-weight:\s*700/);
  assert.match(block('.app-writer .utm-panel > .row.between h2'), /font-family:\s*var\(--font-display\)/);
  assert.match(block('.app-writer .utm-panel > .row.between h2'), /font-size:\s*16px/);
  assert.match(block('.app-writer .utm-item .utm-main > b'), /font-size:\s*15px/);
});
test('Mobile does not shrink title and supporting text below the project standard', () => {
  const last = css.slice(css.indexOf('/* Маркетинг: компактные карточки')).split('/* Директ: «Мой Литнет»')[0];
  assert.ok(last.includes('@media (max-width: 600px)'));
  assert.doesNotMatch(last, /font-size:\s*(11px|12px|14px)/);
  assert.doesNotMatch(last, /font-weight:\s*(650|450|800)/);
  assert.ok(css.indexOf('.app-writer .mk-book-card') > 0);
});
