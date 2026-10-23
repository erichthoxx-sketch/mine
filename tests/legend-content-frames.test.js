import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../css/style.css', import.meta.url),'utf8');
const legend=readFileSync(new URL('../writer/js/views/legend.js', import.meta.url),'utf8');
const a=css.indexOf('/* Легенда — один вид'), b=css.indexOf('/* Маркетинг → книга:',a);
const section=css.slice(a,b);

test('Серая заливка у ВНЕШНИХ карточек всех вкладок, а не у поля текста',()=>{
  assert.ok(a>0&&b>a);
  assert.match(section, /--lg-outer-fill:\s*color-mix\(in srgb,\s*var\(--surface\) 93%,\s*var\(--text\)\)/);
  assert.match(section, /\.app-writer :is\(\.lg-f, \.lg-ch, \.lg-qs, \.lg-syn, \.lg-cards \.lg-card:not\(\.lg-new\)\) \{\s*background:\s*var\(--lg-outer-fill\)/);
  assert.doesNotMatch(section, /--lg-content-bg|--lg-content-border|lg-char-details/);
});

test('Сами текстовые поля БЕЗ рамок и заливки, цветное выделение при наведении и фокусе возвращено',()=>{
  assert.match(section, /textarea\.lg-ta.*border:\s*0\s*!important;\s*border-radius:\s*10px;\s*background:\s*transparent\s*!important;/);
  assert.match(section, /textarea\.lg-ta:hover.*background:\s*color-mix\(in srgb,\s*var\(--surface-2\) 70%,\s*transparent\)\s*!important;/);
  assert.match(section, /textarea\.lg-ta:focus.*background:\s*var\(--surface-2\)\s*!important;/);
  assert.doesNotMatch(section, /border:\s*1px solid var\(--lg-content-border\)/);
  assert.doesNotMatch(section, /\.lg-syn-text\s*\{[^}]*background:/);
});

test('Персонажи и синопсис используют наружную карточку без дополнительных внутренних рамок',()=>{
  assert.doesNotMatch(legend, /lg-char-details/);
  assert.match(legend, /class="lg-sn"/);
  assert.match(legend, /class="lg-in"/);
  assert.match(legend, /class="card lg-syn"/);
  assert.match(legend, /class="card lg-ch/);
});
