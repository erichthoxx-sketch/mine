import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLitTag, siteUtmWith, litTagInfo, litTagTodo } from '../js/littag.js';
import { withUtm, normalize } from '../site/content.js';

test('метка Литнета: разбор того, что вставила владелица', () => {
  assert.equal(parseLitTag('https://litnet.com/ru/book/razvod-b1?utm_litref=ab12CD'), 'ab12CD');
  assert.equal(parseLitTag('utm_litref=xyz-99'), 'xyz-99');
  assert.equal(parseLitTag('https://litnet.com/ref/QwErTy'), 'QwErTy');
  assert.equal(parseLitTag('QwErTy12'), 'QwErTy12');
  assert.equal(parseLitTag('просто текст'), null);
});

test('метка сайта: прежние параметры остаются, utm_litref заменяется', () => {
  assert.equal(siteUtmWith('utm_source=lanafreitag.ru&utm_medium=site', 'a1'), 'utm_source=lanafreitag.ru&utm_medium=site&utm_litref=a1');
  assert.equal(siteUtmWith('utm_source=lanafreitag.ru&utm_litref=old&utm_medium=site', 'new'), 'utm_source=lanafreitag.ru&utm_medium=site&utm_litref=new');
});

test('utm_litref уходит только в ссылки на Литнет', () => {
  normalize({});
  const tag = 'utm_source=lanafreitag.ru&utm_medium=site&utm_litref=a1';
  assert.match(withUtm('https://litnet.com/ru/book/x-b1', 'x', tag), /utm_litref=a1/);
  const other = withUtm('https://litmarket.ru/books/x', 'x', tag);
  assert.doesNotMatch(other, /utm_litref/);
  assert.match(other, /utm_source=lanafreitag\.ru/);
});

test('срок метки и дело в Планер за 2 дня', () => {
  const s = { litTag: { code: 'a1', at: '2026-11-10T09:00:00Z', until: '2026-12-10' } };
  assert.equal(litTagInfo(s, '2026-11-10').left, 30);
  assert.equal(litTagTodo(s, '2026-12-01'), null);
  const t = litTagTodo(s, '2026-12-08');
  assert.equal(t.date, '2026-12-08');
  assert.match(t.text, /до 10\.12/);
  assert.equal(litTagTodo(s, '2026-12-12').date, '2026-12-12'); // истекла — висит на сегодня
  assert.match(litTagTodo(s, '2026-12-12').text, /истекла/);
  assert.equal(litTagInfo({}, '2026-11-10'), null);
});
