import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSite, normalize, safeUrl, fmt, colors, DEFAULT_CONTENT, newBlock, BLOCKS } from '../site/content.js';
import { RULES } from '../site/admin/rules.js';

test('сайт: пример собирается из всех блоков, меню — из блоков с пунктом меню', () => {
  const r = renderSite(null);
  for (const b of DEFAULT_CONTENT.blocks) assert.equal(r.main.includes(`id="${b.id}"`), !b.hidden, b.type);
  assert.match(r.head, /href="#k8">Книги</);
  assert.match(r.main, /<span class="it">черт возьми,<\/span>/);
  assert.equal(r.colors.a1, '#8a9aa6');
});

test('сайт: скрытый блок и скрытая книга не показываются', () => {
  const c = structuredClone(DEFAULT_CONTENT);
  c.blocks.find((b) => b.type === 'quote').hidden = false;
  c.blocks.find((b) => b.type === 'about').hidden = true;
  c.books.find((b) => b.id === 'b3').hidden = true;
  c.blocks.push({ ...newBlock('books'), id: 'all', title: 'Все книги' });
  const r = renderSite(c);
  assert.ok(r.main.includes('class="quote'));
  assert.ok(!r.main.includes('id="k6"'));
  const all = r.main.slice(r.main.indexOf('id="all"'));
  assert.ok(!all.includes('Звериная'));
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
  const c = normalize({ v: 3, name: 'Лана', blocks: [{ id: 'x', type: 'нет такого' }, { id: 'y', type: 'text', title: 'Привет' }] });
  assert.equal(c.blocks.length, 1);
  assert.equal(c.books.length, DEFAULT_CONTENT.books.length);
  assert.match(renderSite(c).main, /Привет/);
  assert.deepEqual(colors({ palette: 'custom', a1: '#000000', a2: 'плохой' }), { a1: '#000000', a2: '#d3dbe0' });
  for (const t of Object.keys(BLOCKS)) assert.equal(typeof renderSite({ blocks: [newBlock(t)] }).main, 'string');
});

test('сайт: правила Firebase в админке совпадают с firestore.rules', () => {
  assert.equal(readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), RULES);
});

test('сайт: цикл — книги с номерами по порядку, у пишущейся — пометка', () => {
  const r = renderSite(null);
  const ser = r.main.slice(r.main.indexOf('id="k8"'), r.main.indexOf('id="k3"'));
  assert.deepEqual([...ser.matchAll(/<span class="num"><b>(\d+)<\/b>([^<]+)</g)].map((m) => m[1] + ' ' + m[2]),
    ['01 Книга 1', '02 Книга 2', '03 Книга 3 · пишется']);
});

test('сайт: первый пример обновляется на новый, а правки владелицы остаются', () => {
  const her = { v: 1, name: 'Лана Фрейтаг', palette: 'summer', foot: 'Telegram — \nЛитнет — ', headBtn: 'Telegram',
    books: [{ id: 'b1', title: 'Соль *на губах*', mood: 'Если хочется моря', status: 'writing', done: 14, total: 24, al: '7,8' },
      { id: 'b4', title: 'Моя книга', mood: 'Чтобы поплакать', status: 'done' }],
    blocks: [{ id: 'k1', type: 'hero', label: 'Любовные романы · новые главы на Литнете', title: 'Мой заголовок', book: 'b1' },
      { id: 'k5', type: 'quote', label: 'Из книги', text: '«Я не просила тебя остаться. Я просто оставила дверь открытой — на всякий случай, на всю жизнь».', cite: '«Север и август», глава 9' }] };
  const c = normalize(her);
  assert.equal(c.palette, 'fog');
  assert.equal(c.books[0].title, 'Развод *для черной вдовы*');
  assert.equal(c.books.find((b) => b.id === 'b4').title, 'Моя книга'); // свою книгу не трогаем
  assert.equal(c.blocks[0].title, 'Мой заголовок');
  assert.equal(c.blocks[0].label, 'Остросюжетные любовные романы');
  assert.match(c.blocks.find((b) => b.id === 'k5').text, /Собственный муж/); // выдуманная цитата заменена настоящей
  assert.ok(!c.blocks.find((b) => b.id === 'k5').hidden);
  assert.ok(c.blocks.some((b) => b.type === 'series'));
  assert.equal(normalize(c).blocks.length, c.blocks.length); // второй раз ничего не меняется
});

test('сайт: свой заголовок «В жизни все не так…» владелица попросила заменить — меняется на текст по книгам', () => {
  const her = { v: 1, palette: 'fog', blocks: [{ id: 'k1', type: 'hero', title: 'В жизни\n*все не так*\nкак на самом деле', book: 'b1' }] };
  const c = normalize(her);
  assert.equal(c.blocks[0].title, 'С кем я, *черт возьми,* связалась');
  assert.deepEqual(c.blocks[0].books, ['b2', 'b1', 'b3']);
  assert.equal(c.palette, 'fog'); // выбранные цвета не трогаем
  const r = renderSite(c);
  assert.equal((r.main.match(/class="shelf-b"/g) || []).length, 3);
});
