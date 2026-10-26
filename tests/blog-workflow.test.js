import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blogPosts, blogBookCard } from '../writer/js/views/blog.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const ctx = {
  today: '2026-10-26',
  wbooksById: { a: { id:'a',title:'Развод для черной вдовы' }, b:{ id:'b',title:'Альпийский развод' } },
  data: { w_blog: [
    { id:'p1', title:'Анонс романа', bookId:'a', planDate:'2026-10-28', status:'draft', createdAt:'2026-10-24' },
    { id:'p2', title:'Без привязки', bookId:'', status:'draft', createdAt:'2026-10-25' },
    { id:'p3', title:'Уже выложено', bookId:'a',status:'published',publishedAt:'2026-10-20', createdAt:'2026-10-19' },
  ] }
};

test('Блог Литнет первым в Связях', () => {
  const source = read('../writer/js/views/links.js');
  const page = source.slice(source.indexOf('export function linksView('), source.indexOf('function linkRow('));
  assert.ok(page.indexOf('${blogList(c)}') >= 0);
  assert.ok(page.indexOf('${blogList(c)}') < page.indexOf('Запросы без ответа'));
});
test('Карточка книги показывает только записи связанного с ней блога', () => {
  assert.deepEqual(blogPosts(ctx,'a').map(p => p.id).sort(), ['p1','p3']);
  assert.match(blogBookCard(ctx,'a'),/Анонс романа/);
  assert.doesNotMatch(blogBookCard(ctx,'a'),/Без привязки/);
  assert.equal(blogBookCard(ctx,'b'),'');
});
test('Редактор предоставляет форматирование, черновик и только ручную публикацию', () => {
  const file=read('../writer/js/views/blog.js');
  assert.match(file,/contenteditable="true"/);
  assert.match(file,/editorToolbar\('blog'/);
  assert.match(source('../writer/js/editor-ui.js'),/data-act="\$\{prefix\}\.fmt"/);
  assert.match(file,/editorToolbar\('blog'/);
  assert.match(source('../writer/js/editor-ui.js'),/data-act="\$\{prefix\}\.fmt"/);
  assert.match(file,/store\.patch\('w_blog'/);
  assert.match(file,/localStorage\.setItem/);
  assert.match(file,/status:'published'/);
  assert.doesNotMatch(file,/fetch\([^\n]*litnet\.com/);
});
test('Запланированная запись блога находится в Планере и Todoist', () => {
  const plan=read('../writer/js/views/plan.js');
  const td=read('../writer/js/todoist.js');
  assert.match(plan,/for \(const p of \(d\.w_blog \|\| \[\]\)\)/);
  assert.match(plan,/kind === 'blog'/);
  assert.match(plan,/blog\.published/);
  assert.match(td,/todoistTasks\(items, booksById\)/);
  assert.doesNotMatch(td,/SKIP = new Set\(\[[^\]]*'blog'/);
});
test('В Связях и карточках соблюдается единый шрифтовой масштаб', () => {
  const css=read('../css/style.css');
  const value = name => Number(css.split('--w-' + name + ':')[1]?.match(/[0-9]+(?=px)/)?.[0] || 0);
  const [top,page,section,card,item] = ['top-heading','page-heading','section-heading','card-heading','item-heading'].map(value);
  assert.ok(top >= page && page > section && section > card && card >= item,
    'Шапка > страница > секция > карточка > запись: ' + [top,page,section,card,item].join(' > '));
  assert.match(css,/\.app-writer main \.links-page \.links-title > h2/);
  assert.match(css,/\.app-writer main \.psec-h > h2/);
});
test('Интерфейсные подсказки не обращаются к пользователю на ты', () => {
  for (const name of ['blog.js','books.js','links.js','goals.js','legend.js','plan.js','promolinks.js']) {
    const text=read('../writer/js/views/'+name);
    const informal=/(^|[^А-Яа-яЁё])(ты|тебе|твой|твоя|твои|выбери|укажи|разделяй|нажми|создай|добавь|напиши|сохрани)([^А-Яа-яЁё]|$)/i;
    assert.doesNotMatch(text,informal,name);
  }
});
