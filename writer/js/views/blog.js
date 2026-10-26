// Блог Литнет: редактор и ручной учет публикаций. НИКАКИХ автоматических отправок на Литнет.
import { esc, acts, toast, uid, opt, ask } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { fmtDate } from '../../../js/format.js';
import { editorToolbar, editorFindBar } from '../editor-ui.js';
import { changes } from '../../../js/ui.js';
import { cleanText, cleanedMsg } from '../../../js/cleantext.js';

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
      </div>`).join('')}</div>` : `<p class="small muted blog-empty">Записей пока нет. Создайте текст и укажите дату публикации — она появится в Планере.</p>`}
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
  const keep = new Set(['P','DIV','BR','B','STRONG','I','EM','U','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','SPAN']);
  const drop = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','VIDEO','AUDIO','IMG']);
  function children(from,to) {
    for(const n of [...from.childNodes]) {
      if(n.nodeType === 3){to.append(document.createTextNode(n.textContent));continue;}
      if(n.nodeType !== 1 || drop.has(n.tagName))continue;
      if(keep.has(n.tagName)){
        const element=document.createElement(n.tagName.toLowerCase());
        if(['P','DIV','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','LI'].includes(n.tagName) &&
           ['center','right','justify'].includes(n.style.textAlign)) element.style.textAlign=n.style.textAlign;
        // Не переносим произвольный CSS и внешние ссылки: только цвет пометки,
        // который использует редактор главы.
        if(n.tagName==='SPAN' && /^(rgb\(11,\s*107,\s*79\)|#0b6b4f)$/i.test(n.style.color.trim()))
          element.style.color='#0b6b4f';
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
    <div class="blog-head">
      <textarea id="blogTitle" class="blog-title-in" rows="1" placeholder="Заголовок записи" maxlength="200" aria-label="Заголовок">${esc(p.title||'')}</textarea>
      <div class="blog-meta-line">
        <label class="blog-pick"><span>Книга</span><select id="blogBook"><option value="">без книги</option>${bookOptions}</select></label>
        <label class="blog-pick"><span>Выложить</span><input id="blogDate" type="date" value="${esc(p.planDate||'')}" aria-label="Когда выложить (вручную)"></label>
      </div>
    </div>
    <div class="blog-writer-surface">
      <div class="ed-bar blog-ed-bar">
        ${editorToolbar('blog', 'Скопировать публикацию')}
        ${editorFindBar('blog')}
      </div>
      <div class="ed-paper blog-ed-paper">
        <div class="ed-stats" id="blogCount" aria-live="off"></div>
        <div id="blogBody" class="editor" contenteditable="true" spellcheck="true" lang="ru" role="textbox" aria-label="Текст записи" aria-multiline="true" data-placeholder="Текст публикации…">${sanitized(p.html||'')}</div>
      </div>
    </div>
    <div class="blog-bottom">
      <span class="small muted">Текст сохраняется в «Мастерской». На Литнет его необходимо выложить вручную.</span>
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
  </div>`;
  return {html,after:()=>wire(p.id)};
}
let currentBlogId = '';
function wire(id) {
  const root=document.querySelector('.blog-editor');
  if(!root || currentBlogId===id && root.dataset.wired==='yes')return;
  currentBlogId=id;root.dataset.wired='yes';
  const editor=root.querySelector('#blogBody'),count=root.querySelector('#blogCount');
  // заголовок переносится на новую строку по ширине экрана; Enter не добавляет перенос
  const title=root.querySelector('#blogTitle');
  const growTitle=()=>{if(!title)return;title.style.height='auto';title.style.height=title.scrollHeight+'px';};
  title?.addEventListener('input',growTitle);
  title?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();editor.focus();}});
  growTitle();
  const updateCount=()=>{
    const text=(editor.innerText||'').trim(),chars=text.length,words=text?text.split(/\s+/).length:0;
    count.innerHTML=`<span><b>${words.toLocaleString('ru')}</b> <i>слов</i></span><span><b>${chars.toLocaleString('ru')}</b> <i>зн.</i></span>`;
  };
  const changed=()=>{
    const p=fields();
    setDraft(id,p);
    const state=root.querySelector('#blogSaveState');
    if(state)state.textContent='Есть несохраненные изменения';
    updateCount();
  };
  // Поиск, замена и выбор стиля не изменяют содержание черновика.
  for(const el of [editor,...root.querySelectorAll('#blogTitle,#blogBook,#blogDate,#blogUrl')])
    el.addEventListener('input',changed);
  for(const el of root.querySelectorAll('#blogBook,#blogDate'))
    el.addEventListener('change',changed);
  root.querySelector('.ed-tools')?.addEventListener('mousedown',event=>{
    if(!event.target.closest('select')) event.preventDefault();
  });
  root.querySelector('#blogq')?.addEventListener('input',()=>highlightBlogMatches(true));
  root.querySelector('#blogq')?.addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();stepBlogMatch(event.shiftKey?-1:1);}
    if(event.key==='Escape') acts['blog.find']();
  });
  // Те же типографские замены, что в редакторе главы.
  editor.addEventListener('beforeinput',e=>{
    if(e.inputType!=='insertText'||!e.data)return;
    const sel=window.getSelection(),node=sel?.anchorNode,off=sel?.anchorOffset;
    const preceding=node?.nodeType===3?node.nodeValue.slice(0,off):'';
    if(e.data==='"'){
      e.preventDefault();document.execCommand('insertText',false,/(^|[\s(«—–-])$/.test(preceding)?'«':'»');
    }else if(e.data==='-'&&preceding.endsWith('-')){
      e.preventDefault();document.execCommand('delete');document.execCommand('insertText',false,'—');
    }else if(e.data===' '&&/^\s*-$/.test(preceding)){
      e.preventDefault();document.execCommand('delete');document.execCommand('insertText',false,'— ');
    }
  });
  editor.addEventListener('paste',e=>{
    e.preventDefault();
    const cleaned=cleanText(e.clipboardData?.getData('text/plain')||'');
    document.execCommand('insertText',false,cleaned.text);
    if(cleaned.n) toast(cleanedMsg(cleaned.n));
  });
  root.addEventListener('keydown',e=>{
    const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
    if(mod&&key==='s'){
      e.preventDefault();acts['blog.save']({id});
    }else if(mod&&key==='f'&&e.target.closest('#blogBody,.ed-tools,.ed-find')){
      e.preventDefault();
      if(document.getElementById('blogfind')?.hidden)acts['blog.find']();
      else document.getElementById('blogq')?.focus();
    }else if(mod&&e.shiftKey&&(key==='e'||key==='у')&&e.target.id==='blogBody'){
      e.preventDefault();acts['blog.color']();
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
// Глава и блог используют один набор кнопок из editor-ui.js. Команды работают
// с разными текстовыми узлами и никогда не отправляют блог в Google Документ.
const body = () => document.getElementById('blogBody');
const touch = () => body()?.dispatchEvent(new Event('input',{bubbles:true}));
const focus = () => {const el=body();el?.focus();return el;};
const selectedBlock = () => {
  const el=body(),sel=window.getSelection();
  let n=sel?.anchorNode;
  while(n && n!==el){
    if(n.nodeType===1 && /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(n.tagName)&&el.contains(n))return n;
    n=n.parentNode;
  }
  return null;
};
const BLOG_STYLES={NORMAL_TEXT:'p',TITLE:'h1',SUBTITLE:'h6',HEADING_1:'h2',HEADING_2:'h3',HEADING_3:'h4'};
const blogFind={ranges:[],at:-1};
function findBlogRanges(q) {
  const el=body(),list=[];
  if(!el || !q)return list;
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode()){
    const value=node.nodeValue.toLocaleLowerCase('ru'),needle=q.toLocaleLowerCase('ru');
    for(let at=value.indexOf(needle);at>=0;at=value.indexOf(needle,at+needle.length)){
      const range=document.createRange();range.setStart(node,at);range.setEnd(node,at+q.length);list.push(range);
    }
  }
  return list;
}
function highlightBlogMatches(reset=false) {
  const q=document.getElementById('blogq')?.value||'';
  blogFind.ranges=findBlogRanges(q);
  if(reset)blogFind.at=blogFind.ranges.length?0:-1;
  if(blogFind.at>=blogFind.ranges.length)blogFind.at=blogFind.ranges.length-1;
  const found=document.getElementById('blogfound');
  if(found)found.textContent=!q?'':blogFind.ranges.length?`${blogFind.at+1} из ${blogFind.ranges.length}`:'не найдено';
  const range=blogFind.ranges[blogFind.at];
  if(range){
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    const rect=range.getBoundingClientRect();
    if(rect.top<100||rect.bottom>window.innerHeight-90)range.startContainer.parentElement?.scrollIntoView({block:'center'});
  }
}
function stepBlogMatch(direction){
  const len=blogFind.ranges.length;
  if(len)blogFind.at=(blogFind.at+direction+len)%len;
  highlightBlogMatches();
  return false;
}
acts['blog.fmt']=(d)=>{
  const el=focus();if(!el)return false;
  document.execCommand(d.v,false,null);touch();return false;
};
changes['blog.style']=(value)=>{
  const el=body();if(!el)return false;
  const tag=BLOG_STYLES[value]||'p',current=selectedBlock();
  if(current && current.tagName.toLowerCase()!==tag){
    const replacement=document.createElement(tag);
    if(current.style.textAlign)replacement.style.textAlign=current.style.textAlign;
    replacement.innerHTML=current.innerHTML;
    current.replaceWith(replacement);
    el.focus();
    const selection=window.getSelection(),range=document.createRange();
    range.selectNodeContents(replacement);range.collapse(false);
    selection?.removeAllRanges();selection?.addRange(range);
  }else if(!current){
    el.focus();document.execCommand('formatBlock',false,tag);
  }
  touch();return false;
};
acts['blog.align']=(d)=>{
  const el=body();if(!el)return false;
  const block=selectedBlock();
  if(block)block.style.textAlign=d.v==='left'?'':d.v;
  else {el.focus();document.execCommand(({left:'justifyLeft',center:'justifyCenter',right:'justifyRight',justify:'justifyFull'})[d.v]||'justifyLeft');}
  touch();return false;
};
acts['blog.color']=()=>{
  const el=body(),sel=window.getSelection();
  if(!el||!sel?.rangeCount||sel.isCollapsed||!el.contains(sel.anchorNode)){toast('Выделите текст для цветовой пометки');return false;}
  const node=sel.anchorNode?.nodeType===3?sel.anchorNode.parentElement:sel.anchorNode;
  const marked=node?.closest?.('span[style*="color"]');
  const current=(marked?.style.color||'').replace(/\s/g,'').toLowerCase();
  const on=current==='#0b6b4f'||current==='rgb(11,107,79)';
  el.focus();document.execCommand('styleWithCSS',false,true);
  document.execCommand('foreColor',false,on?'#3a3532':'#0b6b4f');
  touch();return false;
};
acts['blog.dash']=()=>{focus();document.execCommand('insertText',false,'— ');touch();return false;};
acts['blog.undo']=()=>{focus();document.execCommand('undo');touch();return false;};
acts['blog.redo']=()=>{focus();document.execCommand('redo');touch();return false;};
acts['blog.zoom']=(d)=>{
  const el=body();if(!el)return false;
  const current=Number(el.style.getPropertyValue('--ed-zoom')||1);
  el.style.setProperty('--ed-zoom',String(Math.max(.8,Math.min(1.6,Math.round((current+Number(d.v)*.1)*10)/10))));
  return false;
};
acts['blog.find']=()=>{
  const panel=document.getElementById('blogfind');if(!panel)return false;
  panel.hidden=!panel.hidden;
  if(!panel.hidden){document.getElementById('blogq')?.focus();highlightBlogMatches(true);}
  else {blogFind.ranges=[];blogFind.at=-1;}
  return false;
};
acts['blog.findNext']=()=>stepBlogMatch(1);
acts['blog.findPrev']=()=>stepBlogMatch(-1);
acts['blog.replaceOne']=()=>{
  const r=blogFind.ranges[blogFind.at];
  if(!r)return stepBlogMatch(1);
  const rep=document.getElementById('blogr')?.value??'';
  r.deleteContents();r.insertNode(document.createTextNode(rep));
  body()?.normalize();touch();highlightBlogMatches(true);return false;
};
acts['blog.replaceAll']=()=>{
  const q=document.getElementById('blogq')?.value||'';
  if(!q)return false;
  const rep=document.getElementById('blogr')?.value??'',list=findBlogRanges(q).reverse();
  for(const range of list){range.deleteContents();range.insertNode(document.createTextNode(rep));}
  body()?.normalize();if(list.length)touch();highlightBlogMatches(true);
  toast(list.length?`Заменено: ${list.length}`:'Совпадений не найдено');
  return false;
};

acts['blog.save']=async d=>{
  const a=app(),p=(a.ctx().data.w_blog||[]).find(x=>x.id===d.id);
  if(!p)return false;
  const changes=fields(p);
  if(!changes.title){toast('Укажите заголовок записи');return false;}
  if(!dateValid(changes.planDate)){toast('Проверьте дату публикации');return false;}
  if(changes.url && !/^https:\/\/(www\.)?litnet\.com\//i.test(changes.url)){
    toast('Укажите ссылку на публикацию на litnet.com');return false;
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
  if(!p.title?.trim() || !bodyPlain(p.html||'')){toast('Сначала сохраните заголовок и текст');return false;}
  if(!(await ask('Запись уже опубликована на Литнете? Отметить публикацию в Мастерской?','Да, выложила')))return false;
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
  body?.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('.blog-restore')?.remove();
  toast('Черновик восстановлен. Нажмите «Сохранить»');
  return false;
};
acts['blog.discard']=()=>{document.querySelector('.blog-restore')?.remove();return false;};
