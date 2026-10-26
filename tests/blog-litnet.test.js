import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blogList, blogPosts } from '../writer/js/views/blog.js';
import { todoistTasks } from '../writer/js/todoist.js';

const source = name => readFileSync(new URL(name,import.meta.url),'utf8');
const data = {
  today:'2026-10-26',
  wbooks:[{id:'book1',title:'Развод для черной вдовы'}],
  wbooksById:{book1:{id:'book1',title:'Развод для черной вдовы'}},
  data:{w_blog:[
    {id:'draft',title:'Почему герои уходят',status:'draft',bookId:'book1',planDate:'2026-10-28',createdAt:'2026-10-25T00:00:00Z'},
    {id:'published',title:'Первый пост',status:'published',publishedAt:'2026-10-24',bookId:'book1',createdAt:'2026-10-20T00:00:00Z'},
    {id:'other',title:'Пост не о книге',status:'draft',planDate:'',bookId:'',createdAt:'2026-10-26T00:00:00Z'},
  ]},
};
test('Литнет блог первым делом показывает даты, черновики и факт публикации без таймера',()=>{
  const html=blogList(data);
  assert.match(html,/Блог Литнет/);
  assert.match(html,/В Планере/);
  assert.match(html,/Опубликовано/);
  assert.match(html,/Черновик/);
  assert.match(html,/data-act="blog\.new"/);
  assert.doesNotMatch(html,/Поставить на таймер|автопубликация/);
});
test('В книге отображаются только ее посты, без посторонних',()=>{
  assert.equal(blogPosts(data,'book1').length,2);
  const html=blogList(data,{bookId:'book1'});
  assert.match(html,/Почему герои уходят/);
  assert.match(html,/Первый пост/);
  assert.doesNotMatch(html,/Пост не о книге/);
});
test('До публикации появляется дело в Планере, после отметки пропадает',()=>{
  const plan=source('../writer/js/views/plan.js');
  assert.match(plan,/for \(const p of \(d\.w_blog \|\| \[\]\)\)/);
  assert.match(plan,/p\.status === 'published' \|\| !p\.planDate/);
  assert.match(plan,/kind === 'blog'/);
  assert.match(plan,/data-act="blog\.published"/);
  assert.match(plan,/p\.planDate < t \? t : p\.planDate/);
});
test('Todoist относит публикацию без книги в маркетинг, с книгой в раздел книги',()=>{
  const tasks=[
    {kind:'blog',title:'Выложить в блог: Анонс',date:'2026-10-28',id:'draft',dueRaw:'2026-10-28',to:'/blog/draft',section:'Маркетинг'},
    {kind:'blog',title:'Выложить в блог: Книга',date:'2026-10-28',id:'bookblog',bookId:'book1',to:'/blog/bookblog'},
  ];
  const mapped=todoistTasks(tasks,data.wbooksById);
  assert.deepEqual(mapped.map(x=>[x.project,x.section]),[['Мастерская','Маркетинг'],['Книги','Развод для черной вдовы']]);
});
test('Редактор сохраняет черновик отдельно, публикует только по подтверждению, не запускает Литнет автоматически',()=>{
  const blog=source('../writer/js/views/blog.js');
  assert.match(blog,/contenteditable="true"/);
  assert.match(blog,/editorToolbar\('blog'/);
  assert.match(source('../writer/js/editor-ui.js'),/data-act="\$\{prefix\}\.fmt"/);
  assert.match(blog,/localStorage\.setItem\(draftKey/);
  assert.match(blog,/store\.patch\('w_blog'/);
  assert.match(blog,/Запись уже опубликована на Литнете/);
  assert.doesNotMatch(blog, /Ты уже опубликовала эту запись на Литнете/);
  assert.doesNotMatch(blog,/setTimeout\([^)]*blog\.published/);
  assert.doesNotMatch(blog,/fetch\(['"]https:\/\/litnet\.com/);
});
test('Связи — отдельная типографика, блог — первая секция; карточка книги показывает блог',()=>{
  const links=source('../writer/js/views/links.js');
  const books=source('../writer/js/views/books.js');
  const css=source('../css/style.css');
  assert.ok(links.indexOf('${blogList(c)}') < links.indexOf('Запросы без ответа'));
  assert.match(links,/class="links-page"/);
  assert.match(books,/blogBookCard\(c, b\.id\)/);
  assert.match(css,/\.links-page \.links-title > h2/);
  assert.match(css,/\.links-page \.psec-h h2/);
});
