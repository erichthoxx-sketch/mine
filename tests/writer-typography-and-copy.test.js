import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name,import.meta.url),'utf8');
const informal = /(?:^|[^А-Яа-яЁё])(?:ты|тебе|тебя|твой|твоя|твое|твоей|нажми|выбери|сохрани|создай|открой|проверь|выложи|укажи|добавь|начни|перейди|скопируй|заполни)(?=$|[^А-Яа-яЁё])/iu;

test('Мастерская использует одну читаемую иерархию заголовков',()=>{
  const css=read('../css/style.css');
  const last=css.slice(css.lastIndexOf('/* ТИПОГРАФИКА МАСТЕРСКОЙ'));
  for(const [name,size] of [
    ['--w-top-heading','26px'],['--w-page-heading','24px'],['--w-section-heading','17px'],
    ['--w-card-heading','15px'],['--w-item-heading','14px'],['--w-meta','12px'],
  ]) assert.ok(last.includes(name+': '+size+';'),name);
  assert.match(last,/\.app-writer main \.links-page \.links-title > h2/);
  assert.match(last,/\.app-writer main \.psec-h > h2/);
  assert.match(last,/\.app-writer main \.card > h2/);
});

test('Новые подсказки и подтверждения блога не обращаются к пользователю на ты',()=>{
  const blog=read('../writer/js/views/blog.js');
  assert.doesNotMatch(blog,informal);
  assert.match(blog,/Запись уже опубликована на Литнете/);
  assert.match(blog,/Создайте текст и укажите дату/);
});

test('Подсказки писательских форм: нейтральный или вежливый тон',()=>{
  for(const path of [
    '../writer/js/views/books.js','../writer/js/views/links.js',
    '../writer/js/views/plan.js','../writer/js/views/legend.js',
    '../writer/js/views/goals.js','../writer/js/views/promolinks.js',
  ]) assert.doesNotMatch(read(path),informal,path);
});
