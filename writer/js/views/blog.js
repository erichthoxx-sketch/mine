// Блог Литнет: редактор и ручной учет публикаций. НИКАКИХ автоматических отправок на Литнет.
import { esc, acts, toast, uid, opt, ask } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { fmtDate } from '../../../js/format.js';

const app = () => window.__app;
const draftKey = id => 'writer.blog.draft.' + id;
const dateValid = value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
const sorted = posts => [...posts].sort((a,b) =>
  (a.status==='published')-(b.status==='published') ||
  (a.planDate || a.publishedAt || '').localeCompare(b.planDate || b.publishedAt || '') ||
  (b.createdAt || '').localeCompare(a.createdAt || ''));
export function blogPosts(c, bookId = '') {
  return sorted((c.data.w_blog || []).filter(x => !bookId || x.bookId === bookId));
}
const status = (p, today) => p.status === 'published' ? 'Опубликовано' :
  p.planDate ? p.planDate < today ? 'Просрочено' : 'В Планере · ' + fmtDate(p.planDate) : 'Черновик';
const actions = (p, today) => p.status !== 'published' && p.planDate && p.planDate <= today
  ? `<button class="blog-post-btn" data-act="blog.published" data-id="${esc(p.id)}">Выложено</button>`
  : '';
export function blogList(c, { bookId='', heading=true }={}) {
  const posts=blogPosts(c,bookId), headline=bookId?'Блог Литнет · о книге':'Блог Литнет';
  return `<section class="blog-list-section">
    ${heading ? `<div class="psec-h"><h2>${headline}${posts.length ? ` <span class="muted">${posts.length}</span>` : ''}</h2>
      <button class="small-btn" data-act="blog.new" ${bookId ? `data-book="${esc(bookId)}"` : ''}>+ Запись</button></div>` : ''}
    <div class="card blog-list-card">
      ${posts.length ? `<div class="blog-rows">${posts.map(p=>`<div class="blog-row">
        <a href="#" data-act="go" data-to="/blog/${encodeURIComponent(p.id)}" class="blog-row-main">
          <b>${esc(p.title || 'Без названия')}</b>
          <span>${esc(status(p,c.today))}${!bookId && p.bookId && c.wbooksById[p.bookId] ? ' · '+esc(c.wbooksById[p.bookId].title) : ''}</span>
        </a>${actions(p,c.today)}
      </div>`).join('')}</div>` : `<p class="small muted blog-empty">Записей пока нет. Создай текст, выбери дату — публикация появится в Планере.</p>`}
    </div></section>`;
}
export function blogBookCard(c, bookId) {
  // В карточке книги не создаем пустую секцию: показываем блог, только когда
  // есть хотя бы одна запись, привязанная к этой книге.
  if (!blogPosts(c,bookId).length) return '';
  return `<section class="blog-in-book">${blogList(c,{bookId})}</section>`;
}
function sanitized(html) {
  const doc=new DOMParser().parseFromString(String(html || ''),'text/html');
  const keep = new Set(['P','DIV','BR','B','STRONG','I','EM','U','H2','H3','UL','OL','LI','BLOCKQUOTE']);
  const drop = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','VIDEO','AUDIO','IMG']);
  function children(from,to) {
    for(const n of [...from.childNodes]) {
      if(n.nodeType === 3){to.append(document.createTextNode(n.textContent));continue;}
      if(n.nodeType !== 1 || drop.has(n.tagName))continue;
      if(keep.has(n.tagName)){
        const element=document.createElement(n.tagName.toLowerCase());
        children(n,element);to.append(element);
      } else children(n,to);
    }
  }
  const holder=document.createElement('div');children(doc.body,holder);
  return holder.innerHTML.slice(0,100000);
}
function getDraft(id) {
  try {return JSON.parse(localStorage.getItem(draftKey(id)) || 'null');}
  catch {return null;}
}
function setDraft(id, draft) {
  try {localStorage.setItem(draftKey(id),JSON.stringify({...draft,at:new Date().toISOString()}));}
  catch {/* Local browser storage unavailable. Saving to Firebase still works. */}
}
function clearDraft(id) {try{localStorage.removeItem(draftKey(id));}catch{}}
function bodyPlain(html) {
  const tmp=document.createElement('div');tmp.innerHTML=sanitized(html);
  return (tmp.innerText || tmp.textContent || '').trim();
}
function fields(p) {
  const editor=document.getElementById('blogBody');
  return {
    title:String(document.getElementById('blogTitle')?.value||'').trim(),
    bookId:String(document.getElementById('blogBook')?.value||''),
    planDate:String(document.getElementById('blogDate')?.value||''),
    html:sanitized(editor?.innerHTML||''),
    url:String(document.getElementById('blogUrl')?.value||'').trim(),
  };
}
function warnUnsaved(id) {
  const d=getDraft(id);
  return d?.title || d?.html ? d : null;
}
export function blogEditor(a,id) {
  const c=a.ctx(), p=(c.data.w_blog||[]).find(x=>x.id===id);
  if(!p)return {html:'<div class="card">Запись блога не найдена.</div>'};
  const savedDraft=warnUnsaved(id);
  const hasDraft=savedDraft && savedDraft.at > (p.modifiedAt || p.createdAt || '') &&
    (savedDraft.html !== p.html || savedDraft.title !== p.title);
  const bookOptions=c.wbooks.map(b=>opt(b.id,b.title,p.bookId||'')).join('');
  const html=`<div class="blog-editor">
    <div class="blog-editor-top">
      <button class="btn back" data-act="blog.back">← К блогу</button>
      <span id="blogSaveState" class="small muted">${p.status==='published'?'Опубликовано'+(p.publishedAt?' · '+fmtDate(p.publishedAt):''):'Черновик'}</span>
      <button class="primary" data-act="blog.save" data-id="${esc(p.id)}">Сохранить</button>
    </div>
    ${hasDraft ? `<div class="blog-restore"><span>Есть несохраненный текст на этом устройстве.</span><button data-act="blog.restore" data-id="${esc(p.id)}">Восстановить</button><button class="link" data-act="blog.discard" data-id="${esc(p.id)}">Скрыть</button></div>` : ''}
    <div class="blog-page">
      <label for="blogTitle">Заголовок</label>
      <input id="blogTitle" value="${esc(p.title||'')}" placeholder="Название публикации" maxlength="200">
      <div class="blog-meta">
        <div><label for="blogBook">Книга <span class="muted">необязательно</span></label>
          <select id="blogBook"><option value="">Без книги</option>${bookOptions}</select></div>
        <div><label for="blogDate">Выложить вручную</label><input id="blogDate" type="date" value="${esc(p.planDate||'')}"></div>
      </div>
      <div class="blog-toolbar" role="toolbar" aria-label="Форматирование записи">
        <button type="button" data-act="blog.fmt" data-cmd="bold" title="Жирный (Ctrl+B)"><b>Ж</b></button>
        <button type="button" data-act="blog.fmt" data-cmd="italic" title="Курсив (Ctrl+I)"><i>К</i></button>
        <button type="button" data-act="blog.fmt" data-cmd="insertUnorderedList" title="Список">≡</button>
        <button type="button" data-act="blog.fmt" data-cmd="formatBlock" data-tag="h2" title="Подзаголовок">H2</button>
        <button type="button" data-act="blog.fmt" data-cmd="formatBlock" data-tag="p" title="Обычный абзац">¶</button>
        <button type="button" data-act="blog.fmt" data-cmd="undo" title="Отменить">↶</button>
        <button type="button" data-act="blog.fmt" data-cmd="redo" title="Повторить">↷</button>
        <span class="blog-toolbar-spacer"></span>
        <button type="button" data-act="blog.copy" data-id="${esc(p.id)}" title="Скопировать оформленный текст">${ic('copy')} Скопировать</button>
      </div>
      <div id="blogBody" class="blog-body editor" contenteditable="true" spellcheck="true" role="textbox" aria-label="Текст записи" aria-multiline="true" data-placeholder="Начни писать публикацию…">${sanitized(p.html||'')}</div>
      <div class="blog-bottom">
        <span id="blogCount" class="small muted"></span>
        <span class="small muted">Текст сохраняется в «Мастерской». На Литнет его нужно выложить вручную.</span>
      </div>
      <div class="blog-posting">
        <div>
          <label for="blogUrl">Ссылка на публикацию <span class="muted">после выкладки, необязательно</span></label>
          <input id="blogUrl" type="url" value="${esc(p.url||'')}" placeholder="https://litnet.com/…">
        </div>
        <div class="blog-post-actions"><a class="btn" href="https://litnet.com/" target="_blank" rel="noopener">Открыть Литнет</a>
          ${p.status==='published'?'<span class="small muted">✓ Отмечено как опубликованное</span>':
          `<button data-act="blog.published" data-id="${esc(p.id)}">Выложено</button>`}
        </div>
      </div>
      <div class="blog-danger"><button class="link danger" data-act="blog.delete" data-id="${esc(p.id)}">Удалить черновик</button></div>
    </div>
  </div>`;
  return {html,after:()=>wire(p.id)};
}
let currentBlogId = '';
function wire(id) {
  const root=document.querySelector('.blog-editor');
  if(!root || currentBlogId===id && root.dataset.wired==='yes')return;
  currentBlogId=id;root.dataset.wired='yes';
  const editor=root.querySelector('#blogBody'),count=root.querySelector('#blogCount');
  const updateCount=()=>{count.textContent=(editor.innerText||'').trim().length.toLocaleString('ru')+' знаков';};
  const changed=()=>{
    const p=fields();
    setDraft(id,p);
    const state=root.querySelector('#blogSaveState');
    if(state)state.textContent='Есть несохраненные изменения';
    updateCount();
  };
  for(const el of [editor,...root.querySelectorAll('input,select')])el.addEventListener('input',changed);
  for(const el of root.querySelectorAll('select,input[type="date"]'))el.addEventListener('change',changed);
  for(const btn of root.querySelectorAll('.blog-toolbar button[data-cmd]'))
    btn.addEventListener('mousedown',event=>event.preventDefault());
  editor.addEventListener('paste',e=>{
    e.preventDefault();
    const plain=e.clipboardData?.getData('text/plain')||'';
    document.execCommand('insertText',false,plain);
  });
  root.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){
      e.preventDefault();acts['blog.save']({id});
    }
  });
  updateCount();
}
acts['blog.new']=async(d)=>{
  const a=app(),id=uid(),now=new Date().toISOString();
  await a.store.put('w_blog',{id,title:'',bookId:d.book||'',html:'',planDate:'',url:'',status:'draft',createdAt:now,modifiedAt:now});
  a.go('/blog/'+id);
};
acts['blog.back']=()=>{app().go('/links');return false;};
acts['blog.fmt']=(d)=>{
  const editor=document.getElementById('blogBody');
  if(!editor)return false;
  editor.focus();
  document.execCommand(d.cmd,false,d.tag||null);
  editor.dispatchEvent(new Event('input',{bubbles:true}));
  return false;
};
acts['blog.save']=async d=>{
  const a=app(),p=(a.ctx().data.w_blog||[]).find(x=>x.id===d.id);
  if(!p)return false;
  const changes=fields(p);
  if(!changes.title){toast('Укажи заголовок блога');return false;}
  if(!dateValid(changes.planDate)){toast('Проверь дату публикации');return false;}
  if(changes.url && !/^https:\/\/(www\.)?litnet\.com\//i.test(changes.url)){
    toast('Укажи ссылку публикации на litnet.com');return false;
  }
  if(changes.html.length>95000){toast('Запись слишком длинная для сохранения');return false;}
  const state=document.getElementById('blogSaveState');
  if(state)state.textContent='Сохраняю…';
  try{
    await a.store.patch('w_blog',d.id,{...changes,modifiedAt:new Date().toISOString()});
    clearDraft(d.id);
    if(state)state.textContent='✓ Сохранено';
    toast('Запись сохранена');
    a.scheduleTodoist?.();
  }catch(e){if(state)state.textContent='Ошибка сохранения';toast('Не удалось сохранить: '+(e.message||e));}
  return false;
};
acts['blog.copy']=async()=>{
  const body=document.getElementById('blogBody');
  if(!body)return false;
  const html=sanitized(body.innerHTML), text=bodyPlain(html);
  try{
    if(navigator.clipboard?.write && typeof ClipboardItem!=='undefined') {
      await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([html],{type:'text/html'}),
        'text/plain':new Blob([text],{type:'text/plain'})})]);
    } else if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const sel=window.getSelection(),range=document.createRange();
      range.selectNodeContents(body);sel.removeAllRanges();sel.addRange(range);
      document.execCommand('copy');sel.removeAllRanges();
    }
    toast('Текст скопирован');
  }catch(e){toast('Не удалось скопировать: '+(e.message||e));}
  return false;
};
acts['blog.published']=async d=>{
  const a=app(),p=(a.ctx().data.w_blog||[]).find(x=>x.id===d.id);
  if(!p)return false;
  if(!p.title?.trim() || !bodyPlain(p.html||'')){toast('Сначала сохрани заголовок и текст');return false;}
  if(!(await ask('Ты уже опубликовала эту запись на Литнете? Отметить ее как выложенную?','Да, выложила')))return false;
  await a.store.patch('w_blog',p.id,{status:'published',publishedAt:a.ctx().today,modifiedAt:new Date().toISOString()});
  toast('Отмечено как опубликованное');
  a.scheduleTodoist?.();
};
acts['blog.delete']=async d=>{
  const p=(app().ctx().data.w_blog||[]).find(x=>x.id===d.id);
  if(!p || !(await ask('Удалить запись «'+(p.title||'Без названия')+'» из Мастерской?','Удалить')))return false;
  await app().store.remove('w_blog',d.id);clearDraft(d.id);app().go('/links');
};
acts['blog.restore']=d=>{
  const saved=getDraft(d.id);
  if(!saved)return false;
  for(const [id,val] of [['blogTitle',saved.title],['blogBook',saved.bookId],['blogDate',saved.planDate],['blogUrl',saved.url]]) {
    const element=document.getElementById(id);if(element)element.value=val||'';
  }
  const body=document.getElementById('blogBody');if(body)body.innerHTML=sanitized(saved.html||'');
  document.getElementById('blogCount').textContent=(body?.innerText||'').trim().length.toLocaleString('ru')+' знаков';
  document.querySelector('.blog-restore')?.remove();
  toast('Черновик восстановлен, нажми «Сохранить»');
  return false;
};
acts['blog.discard']=()=>{document.querySelector('.blog-restore')?.remove();return false;};
