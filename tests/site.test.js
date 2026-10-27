import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSite, renderBook, normalize, safeUrl, fmt, colors, slugify, seriesBooks, bookLinks, DEFAULT_CONTENT, newBlock, newBook, BLOCKS } from '../site/content.js';
import { RULES } from '../site/admin/rules.js';

const ex = () => structuredClone(DEFAULT_CONTENT);

test('сайт: пример собирается из всех видимых блоков, меню — из блоков с пунктом меню', () => {
  const r = renderSite(null);
  for (const b of DEFAULT_CONTENT.blocks) assert.equal(r.main.includes(`id="${b.id}"`), !b.hidden && b.type !== 'books', b.type);
  assert.match(r.head, /href="\.\/#k8">Книги</);
  assert.ok(!r.head.includes('Все книги'), 'все книги уже в цикле — блока и пункта меню нет');
  assert.match(r.main, /<span class="it">с риском<\/span>/);
  assert.equal(r.colors.a1, '#8a9aa6');
});

test('сайт: первый экран без обложек — справа оглавление (новинка, цикл, подписка) или фото; карточки ведут на страницы книг', () => {
  const c = ex();
  const r = renderSite(c);
  const hero = r.main.slice(0, r.main.indexOf('id="k3"'));
  assert.ok(!hero.includes('class="cover'), 'обложек на первом экране нет');
  assert.deepEqual([...hero.matchAll(/<span class="hi-k">([^<]+)</g)].map((m) => m[1]), ['Новинка', 'Цикл', 'Telegram']);
  assert.match(hero, /href="\.\/\?kniga=razvod-dlya-chernoy-vdovy"/);
  assert.match(hero, /3 книги/);
  c.blocks[0].photo = 'p1';
  const withPh = renderSite(c, { p1: 'data:image/jpeg;base64,AA' }).main;
  assert.match(withPh, /class="hero-ph"/);
  assert.ok(!withPh.includes('hero-idx'));
  assert.match(r.main, /class="card[^"]*" href="\.\/\?kniga=alpiyskiy-razvod"/);
});

test('сайт: скрытый блок и скрытая книга не показываются', () => {
  const c = ex();
  c.blocks.find((b) => b.type === 'about').hidden = true;
  c.books.find((b) => b.id === 'b3').hidden = true;
  const r = renderSite(c);
  assert.ok(!r.main.includes('id="k6"'));
  assert.ok(!r.main.includes('Звериная'));
  assert.equal(renderBook(c, {}, 'zverinaya-tropa-dlya-dvoih'), null);
});

test('сайт: текст владелицы экранируется, опасные ссылки не проходят', () => {
  assert.equal(fmt('<b>*a*</b>'), '&lt;b&gt;<span class="it">a</span>&lt;/b&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('t.me/lana'), 'https://t.me/lana');
  const c = ex();
  c.books[1].title = '<img src=x onerror=alert(1)>';
  c.books[1].litnet = 'javascript:alert(1)';
  c.books[1].links = 'Плохой — javascript:alert(2)';
  const all = renderSite(c).main + renderBook(c, {}, c.books[1].id).main;
  assert.ok(!all.includes('<img src=x'));
  assert.ok(!all.includes('javascript:'));
});

test('сайт: адреса страниц книг — латиницей, без повторов', () => {
  assert.equal(slugify('Развод для черной вдовы'), 'razvod-dlya-chernoy-vdovy');
  const c = normalize({ v: 4, books: [{ id: 'a1', title: 'Тише *воды*' }, { id: 'a2', title: 'Тише воды' }, { id: 'a3', title: 'X', slug: 'Моя-книга' }], blocks: [] });
  assert.deepEqual(c.books.map((b) => b.url), ['tishe-vody', 'tishe-vody-a2', 'moya-kniga']);
});

test('страница книги: главная кнопка — первая площадка, остальные сайты — ссылками, пустые разделы скрыты', () => {
  const c = ex();
  Object.assign(c.books[1], { litnet: 'https://litnet.com/a', litres: 'https://litres.ru/b', links: 'Author.Today — https://author.today/c' });
  assert.deepEqual(bookLinks(c.books[1]).map(([n]) => n), ['Литнет', 'Литрес', 'Author.Today']);
  const r = renderBook(c, {}, 'alpiyskiy-razvod');
  assert.match(r.main, /class="btn btn-dark" href="https:\/\/litnet.com\/a"[^>]*>Читать на Литнете/);
  assert.match(r.main, /<a class="btn btn-line" href="https:\/\/author.today\/c"/);
  assert.match(r.main, /Цикл «С кем я, черт возьми, связалась» · книга 1/);
  assert.match(r.main, /class="excerpt"/);
  assert.ok(!r.main.includes('Читатели'), 'отзывов нет — раздела нет');
  assert.ok(!r.main.includes('class="collage'), 'фото нет — коллажа нет');
  assert.match(r.main, /Следующая книга: Звериная тропа для двоих/);
  assert.match(r.main, /class="bk-sticky"/);
  assert.equal(r.title, 'Альпийский развод — Лана Фрейтаг');
});

test('страница книги: коллаж — только с фото и пока не выключен', () => {
  const c = ex();
  c.books[1].collage = ['i1', 'i2', 'i3'];
  const imgs = { i1: 'data:image/jpeg;base64,AA', i2: 'data:image/jpeg;base64,BB', i3: 'data:image/jpeg;base64,CC' };
  assert.match(renderBook(c, imgs, 'alpiyskiy-razvod').main, /class="bk-sec collage n3"/);
  c.books[1].collageOn = false;
  assert.ok(!renderBook(c, imgs, 'alpiyskiy-razvod').main.includes('class="collage'));
});

test('цикл: книги встают сами по номеру, новая книга цикла появляется без правки блока', () => {
  const c = ex();
  assert.deepEqual(seriesBooks(normalize(c), 'С кем я, черт возьми, связалась').map((b) => b.id), ['b2', 'b3', 'b1']);
  c.books.push({ ...newBook(), id: 'b9', title: 'Четвертая', series: 'С кем я, черт возьми, связалась', seriesNo: 4 });
  const r = renderSite(c);
  const ser = r.main.slice(r.main.indexOf('id="k8"'), r.main.indexOf('id="k5"'));
  assert.deepEqual([...ser.matchAll(/<span class="num"><b>(\d+)<\/b>([^<]+)</g)].map((m) => m[1] + ' ' + m[2]),
    ['01 Книга 1', '02 Книга 2', '03 Книга 3 · пишется', '04 Книга 4 · пишется']);
});

test('все книги: фильтр по циклам появляется, когда есть из чего выбирать', () => {
  const c = ex();
  assert.ok(!renderSite(c).main.includes('class="chips"'));
  c.books.push({ ...newBook(), id: 'b8', title: 'Отдельная' });
  const r = renderSite(c);
  assert.match(r.main, /class="chips"/);
  assert.match(r.main, /data-g="Отдельные книги">Отдельные книги/);
  assert.match(r.head, /href="\.\/#k9">Все книги</);
});

test('сайт: старые и неполные данные не ломают страницу', () => {
  const c = normalize({ v: 4, name: 'Лана', blocks: [{ id: 'x', type: 'нет такого' }, { id: 'y', type: 'text', title: 'Привет' }] });
  assert.equal(c.blocks.length, 1);
  assert.match(renderSite(c).main, /Привет/);
  assert.deepEqual(colors({ palette: 'custom', a1: '#000000', a2: 'плохой' }), { a1: '#000000', a2: '#d3dbe0' });
  for (const t of Object.keys(BLOCKS)) assert.equal(typeof renderSite({ v: 4, blocks: [newBlock(t)] }).main, 'string');
  assert.equal(renderBook({ v: 4, books: [], blocks: [] }, {}, 'нет'), null);
});

test('сайт: первый пример обновляется до нового, правки владелицы остаются', () => {
  const her = { v: 1, name: 'Лана Фрейтаг', palette: 'summer', foot: 'Telegram — \nЛитнет — ', headBtn: 'Telegram',
    books: [{ id: 'b1', title: 'Соль *на губах*', mood: 'Если хочется моря', status: 'writing', done: 14, total: 24, al: '7,8' },
      { id: 'b4', title: 'Моя книга', mood: 'Чтобы поплакать', status: 'done' }],
    blocks: [{ id: 'k1', type: 'hero', label: 'Любовные романы · новые главы на Литнете', title: 'Мой заголовок', book: 'b1' },
      { id: 'k5', type: 'quote', label: 'Из книги', text: '«Я не просила тебя остаться. Я просто оставила дверь открытой — на всякий случай, на всю жизнь».', cite: '«Север и август», глава 9' }] };
  const c = normalize(her);
  assert.equal(c.palette, 'fog');
  assert.equal(c.books[0].title, 'Развод *для черной вдовы*');
  assert.equal(c.books.find((b) => b.id === 'b4').title, 'Моя книга');
  assert.equal(c.blocks[0].title, 'Мой заголовок');
  assert.match(c.blocks.find((b) => b.id === 'k5').text, /Собственный муж/);
  assert.ok(c.blocks.some((b) => b.type === 'series'));
  assert.ok(c.blocks.some((b) => b.type === 'books'));
  const again = normalize(c);
  assert.equal(again.blocks.length, c.blocks.length);
});

test('сайт: «В жизни все не так…» владелица попросила заменить — заголовок по книгам', () => {
  const c = normalize({ v: 1, palette: 'fog', blocks: [{ id: 'k1', type: 'hero', title: 'В жизни\n*все не так*\nкак на самом деле', book: 'b1' }] });
  assert.equal(c.blocks[0].title, 'Любовь *с риском* для жизни');
  assert.equal(c.palette, 'fog');
});

test('сайт: правила Firebase в админке совпадают с firestore.rules', () => {
  assert.equal(readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), RULES);
});
