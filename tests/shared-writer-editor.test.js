import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editorToolbar, editorFindBar } from '../writer/js/editor-ui.js';

const read = p => readFileSync(new URL(p,import.meta.url),'utf8');

test('Глава и блог получают абсолютно одинаковые элементы редактора из одного компонента',()=>{
  const chapter = editorToolbar('ed','COPY').replaceAll('ed.','action.');
  const blog = editorToolbar('blog','COPY').replaceAll('blog.','action.');
  assert.equal(chapter,blog);
  for (const action of ['style','fmt','color','align','dash','undo','redo','find','copy','zoom'])
    assert.ok(blog.includes('action.'+action),action);
  const findChapter=editorFindBar('ed').replaceAll('ed.','action.').replace(/id="ed([^"]*)"/g,'id="common$1"');
  const findBlog=editorFindBar('blog').replaceAll('blog.','action.').replace(/id="blog([^"]*)"/g,'id="common$1"');
  assert.equal(findChapter,findBlog);
});
test('Блог использует те же ed-bar, ed-tools, ed-paper, editor и stats, что глава',()=>{
  const book=read('../writer/js/views/editor.js'),blog=read('../writer/js/views/blog.js');
  assert.match(book,/editorToolbar\('ed'\)/);
  assert.match(book,/editorFindBar\('ed'\)/);
  assert.match(blog,/editorToolbar\('blog'/);
  assert.match(blog,/editorFindBar\('blog'\)/);
  assert.match(blog,/class="ed-paper blog-ed-paper"/);
  assert.match(blog,/id="blogBody" class="editor"/);
  assert.match(blog,/class="ed-stats" id="blogCount"/);
  assert.doesNotMatch(blog,/class="blog-toolbar"/);
  assert.doesNotMatch(blog,/store\.put\('w_books'/);
  assert.match(blog,/store\.patch\('w_blog'/);
});
test('Кнопки общей панели блога имеют реальные обработчики, а не декоративные иконки',()=>{
  const source=read('../writer/js/views/blog.js');
  for(const action of ['fmt','align','color','dash','undo','redo','zoom','find','findNext','findPrev','replaceOne','replaceAll','copy'])
    assert.ok(source.includes("acts['blog."+action+"']"),action);
  assert.match(source,/changes\['blog\.style'\]/);
  assert.match(source,/cleanText\(/);
});
