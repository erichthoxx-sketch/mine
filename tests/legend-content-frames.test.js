import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../css/style.css', import.meta.url),'utf8');
const legend=readFileSync(new URL('../writer/js/views/legend.js', import.meta.url),'utf8');
const a=css.indexOf('/* Легенда: внешние карточки остаются штатного светлого цвета.');
const b=css.indexOf('/* Маркетинг → книга:',a);
const section=css.slice(a,b);

test('Сохраняется тонкая серая рамка именно у содержимого, внешний фон стандартный',()=>{
  assert.ok(a>0&&b>a);
  assert.match(section,/--lg-content-border:\s*color-mix/);
  assert.match(section,/border:\s*1px solid var\(--lg-content-border\)\s*!important/);
  assert.match(section,/:is\(\.lg-f, \.lg-ch, \.lg-qs, \.lg-syn, \.lg-cards \.lg-card:not\(\.lg-new\)\)\s*\{\s*background:\s*var\(--ivory\)/);
  assert.doesNotMatch(section,/--lg-outer-fill/);
});
test('При наведении появляется пастельно-розовая ЗАЛИВКА ТЕКСТОВОГО ПОЛЯ, не внешней рамки',()=>{
  assert.match(section,/textarea\.lg-ta:hover/);
  assert.match(section,/background:\s*var\(--accent-soft\)\s*!important/);
  assert.match(section,/textarea\.lg-ta:focus/);
  assert.match(section,/background:\s*var\(--surface-2\)\s*!important/);
  assert.match(section,/border-color:\s*var\(--accent-2\)\s*!important/);
  assert.match(section,/\.lg-syn-text:hover\s*\{[^}]*background:\s*var\(--accent-soft\)/);
  assert.match(section,/\.lg-char-details:hover\s*\{[^}]*background:\s*var\(--accent-soft\)/);
});
test('Персонажи и синопсис в тонкой рамке без изменения содержимого',()=>{
  assert.match(legend,/class="lg-char-details"/);
  assert.match(legend,/class="lg-sn"/);
  assert.match(legend,/class="lg-in"/);
  assert.match(legend,/class="card lg-syn"/);
  assert.match(legend,/class="card lg-ch/);
});
