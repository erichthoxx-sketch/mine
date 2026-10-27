import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSite, normalize, safeUrl, fmt, colors, DEFAULT_CONTENT, newBlock, BLOCKS } from '../site/content.js';
import { RULES } from '../site/admin/rules.js';

test('сайт: пример собирается из всех блоков, меню — из блоков с пунктом меню', () => {
  const r = renderSite(null);
  for (const b of DEFAULT_CONTENT.blocks) assert.ok(r.main.includes(`id="${b.id}"`), b.type);
  assert.match(r.head, /href="#k4">Книги</);
  assert.match(r.main, /<span class="it">о которой<\/span>/);
  assert.equal(r.colors.a1, '#f5c6d3');
});

test('сайт: скрытый блок и скрытая книга не показываются', () => {
  const c = structuredClone(DEFAULT_CONTENT);
  c.blocks.find((b) => b.type === 'quote').hidden = true;
  c.books.find((b) => b.id === 'b4').hidden = true;
  c.blocks.push({ ...newBlock('books'), id: 'all', title: 'Все книги' });
  const r = renderSite(c);
  assert.ok(!r.main.includes('class="quote'));
  const all = r.main.slice(r.main.indexOf('id="all"'));
  assert.ok(!all.includes('Север'));
});

test('сайт: текст владелицы экранируется, опасные ссылки не проходят', () => {
  assert.equal(fmt('<b>*a*</b>'), '&lt;b&gt;<span class="it">a</span>&lt;/b&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('t.me/lana'), 'https://t.me/lana');
  assert.equal(safeUrl('https://litnet.com/ru/book/x'), 'https://litnet.com/ru/book/x');
  const c = structuredClone(DEFAULT_CONTENT);
  c.books[0].title = '<img src=x onerror=alert(1)>';
  c.books[0].litnet = 'javascript:alert(1)';
  const r = renderSite(c);
  assert.ok(!r.main.includes('<img src=x'));
  assert.ok(!r.main.includes('javascript:'));
});

test('сайт: кнопка книги ведёт на первую площадку, остальные — тихими ссылками', () => {
  const c = structuredClone(DEFAULT_CONTENT);
  Object.assign(c.books[0], { litnet: 'https://litnet.com/a', litres: 'https://litres.ru/b' });
  const r = renderSite(c);
  assert.match(r.main, /href="https:\/\/litnet.com\/a" target="_blank" rel="noopener">Читать на Литнете/);
  assert.match(r.main, /<a class="lnk" href="https:\/\/litres.ru\/b"[^>]*>Литрес/);
});

test('сайт: старые и неполные данные не ломают страницу', () => {
  const c = normalize({ name: 'Лана', blocks: [{ id: 'x', type: 'нет такого' }, { id: 'y', type: 'text', title: 'Привет' }] });
  assert.equal(c.blocks.length, 1);
  assert.equal(c.books.length, DEFAULT_CONTENT.books.length);
  assert.match(renderSite(c).main, /Привет/);
  assert.deepEqual(colors({ palette: 'custom', a1: '#000000', a2: 'плохой' }), { a1: '#000000', a2: '#b9dbf3' });
  for (const t of Object.keys(BLOCKS)) assert.equal(typeof renderSite({ blocks: [newBlock(t)] }).main, 'string');
});

test('сайт: правила Firebase в админке совпадают с firestore.rules', () => {
  assert.equal(readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), RULES);
});

test('сайт: в подборке у каждой книги — настроение и пара строк', () => {
  const r = renderSite(null);
  const start = r.main.slice(r.main.indexOf('id="k4"'), r.main.indexOf('id="k5"'));
  assert.equal((start.match(/class="mood"/g) || []).length, 3);
});
