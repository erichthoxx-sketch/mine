import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/style.css', import.meta.url),'utf8');
const js = readFileSync(new URL('../writer/js/views/legend.js', import.meta.url),'utf8');

const section = css.slice(css.indexOf('/* Легенда: общая типографика'), css.indexOf('/* Маркетинг → книга:'));
test('Все текстовые поля Легенды имеют единую тонкую нейтрально-серую рамку', () => {
  assert.match(section,/--lg-content-bg:\s*color-mix\(in srgb,\s*var\(--surface\) 96%,\s*var\(--text\)\)/);
  assert.match(section,/--lg-content-border:\s*color-mix\(in srgb,\s*var\(--surface\) 81%,\s*var\(--text\)\)/);
  for(const selector of [
    '.app-writer :is(.lg-f, .lg-ch, .lg-q) > textarea.lg-ta',
    '.app-writer .lg-q-h textarea.lg-ta',
    '.app-writer dialog textarea.lg-ta',
    '.app-writer .lg-syn-text',
    '.app-writer .lg-char-details'
  ]) assert.ok(section.includes(selector), 'Нет общего обрамления: ' + selector);
  assert.match(section,/border:\s*1px solid var\(--lg-content-border\) !important;/);
  assert.match(section,/border-radius:\s*12px/);
  assert.match(section,/font-family:\s*var\(--font-body\)/);
});
test('Ввод и автоувеличение поля, а также темная тема не ломаются', () => {
  assert.match(js, /function grow\(el\)/);
  assert.match(js, /document\.querySelectorAll\('\.lg-ta'\)\.forEach\(grow\)/);
  assert.match(section,/textarea\.lg-ta:focus/);
  assert.match(section,/var\(--surface\).*var\(--text\)/);
  assert.doesNotMatch(section,/textarea\.lg-ta\s*\{[^}]*border:\s*0\s*!important/);
  assert.match(section,/@media \(max-width: 480px\)/);
});
test('Описание персонажей находится в общей контентной рамке, а не в заголовке карточки', () => {
  assert.match(js, /class="lg-char-details"/);
  assert.match(js, /class="lg-sn"/);
  assert.match(js, /class="lg-in"/);
});
