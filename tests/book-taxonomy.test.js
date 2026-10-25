import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { bookGenres, bookTags, marketingTopics, uniqueWords } from '../writer/js/bookmeta.js';
import { discoverySources } from '../direct/js/competitor-discovery.js';
import { competitorsView } from '../direct/js/views/competitors.js';

test('Жанры и теги книги не подменяются данными из Легенды', () => {
  const b = {
    title: 'Развод для черной вдовы',
    genres: ['Остросюжетный любовный роман', 'Криминальный любовный роман'],
    tags: ['одержимый герой', 'похищение'],
    legend: { idea: { genre: 'магическая академия' } },
    promo: { annotation: 'вампиры' },
  };
  assert.deepEqual(bookGenres(b), b.genres);
  assert.deepEqual(bookTags(b), b.tags);
  assert.equal(marketingTopics(b), [...b.genres, ...b.tags].join(', '));
  assert.ok(!marketingTopics(b).includes('академия'));
});

test('Теги приводятся к единому виду, убираются дубли и лишние пробелы', () => {
  assert.deepEqual(uniqueWords(' #Похищение, похищение, одержимый   герой; второй шанс'),
    ['Похищение', 'одержимый герой', 'второй шанс']);
});

test('Для поиска конкурентов используются жанры и теги карточки книги', () => {
  const sources = discoverySources({
    title: 'История',
    genres: ['Криминальный любовный роман'],
    tags: ['похищение', 'одержимый герой'],
    legend: { idea: { genre: 'фэнтези' } },
  });
  assert.ok(sources.some(x => x.name === 'Одержимые любовью' && x.match > 0));
  const view = competitorsView({
    ctx: () => ({ data: { w_books: [{ id: 'b', title: 'История', genres: ['Криминальный любовный роман'], tags: ['похищение'] }], d_competitors: [], d_keywords: [] } }),
    ui: { kwBook: 'b' },
  }).html;
  assert.match(view, /«О книге»/);
  assert.match(view, /похищение/);
  assert.doesNotMatch(view, /«Легенда»/);
});

test('Редактор жанров и тегов расположен в секции «О книге» и JavaScript корректен', () => {
  const src = readFileSync(new URL('../writer/js/views/books.js', import.meta.url), 'utf8');
  const about = src.slice(src.indexOf('<div class="card"><h2>О книге</h2>'));
  assert.match(about, /id="bmGenre1" name="genres"/);
  assert.match(about, /id="bmGenre2" name="genres"/);
  assert.match(about, /id="bookTags" name="tags"/);
  assert.match(about, /id="bmTagPreview"/);
  for (const path of [
    'writer/js/views/books.js',
    'writer/js/bookmeta.js',
    'direct/js/views/keywords.js',
    'direct/js/views/competitors.js',
    'direct/js/competitor-discovery.js',
  ]) {
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, path + ': ' + result.stderr);
  }
});

test('В верхней карточке жанры и теги отображаются всегда, даже если поля пусты', () => {
  const src = readFileSync(new URL('../writer/js/views/books.js', import.meta.url), 'utf8');
  const header = src.slice(src.indexOf('function headCard(c, b, p) {'), src.indexOf('const grp = (n)'));
  assert.match(header, /const taxonomy =/);
  assert.match(header, /\$\{taxonomy\}/);
  assert.match(header, /bh-tax-label">Жанры/);
  assert.match(header, /bh-tax-label">Теги/);
  assert.match(header, /Не указаны/);
  assert.match(header, /data-act="wbook\.editMeta"/);
  assert.doesNotMatch(header, /genreTags\s*\?/);
  assert.match(src, /id="bookTaxonomyEdit"/);
});

test('Жанры и теги можно сохранить прямо в своем блоке, без прокрутки к концу карточки', () => {
  const src = readFileSync(new URL('../writer/js/views/books.js', import.meta.url), 'utf8');
  const details = src.slice(src.indexOf('<div class="card"><h2>О книге</h2>'), src.indexOf('// ---------- обновление знаков ----------'));
  assert.match(details, /<button type="submit" class="primary">Сохранить жанры и теги<\/button>/);
  assert.match(src, /app\(\)\.store\.patch\('w_books', b\.id, patch\)/);
});
test('Обновление рукописи с Google Диска не перезаписывает поля жанров и тегов', () => {
  const src = readFileSync(new URL('../writer/js/views/books.js', import.meta.url), 'utf8');
  const refresh = src.slice(src.indexOf('export async function refreshOne('), src.indexOf('export const refreshing'));
  assert.doesNotMatch(refresh, /store\.put\('w_books'/);
  assert.match(refresh, /store\.patch\('w_books'/);
  const store = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  assert.match(store, /async patch\(coll, id, fields\)/);
  assert.match(store, /updateDoc\(doc\(this\.db/);
});
