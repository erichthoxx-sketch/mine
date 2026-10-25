// Конкуренты: только публичные карточки и заметки. Метрики чужой рекламы недоступны.
import { acts, forms, esc, opt, toast, openSheet, uid, ask } from '../../../js/ui.js';
import { competitorPublicPreview, competitorInsights, safePublicBookUrl, tropeRadar } from '../competition.js';

const app=()=>window.__app;
const books=a=>a.ctx().data.w_books||[];
const selectedBook=a=>a.ui?.kwBook||books(a)[0]?.id||'';
const list=a=>(a.ctx().data.d_competitors||[]).filter(x=>x.status!=='archived' && String(x.bookId||'')===String(selectedBook(a)));
const my=a=>(a.ctx().data.d_keywords||[]).filter(x=>x.status==='keep'&&String(x.bookId||'')===String(selectedBook(a))).map(x=>x.phrase).join(' ');
export function competitorsView(a){
  const rows=list(a),insight=competitorInsights(my(a),rows),radar=tropeRadar(rows);
  return {html:`
    <div class="card">
      <div class="row between"><h2 style="margin:0">Конкурентная разведка</h2><button class="primary" data-act="cmp.new">+ Книга</button></div>
      <label>Моя книга для сравнения</label>
      <select data-chg="kw.book">
        ${books(a).map(x=>opt(x.id,x.title,selectedBook(a))).join('')}
      </select>
      <p class="small muted">Анализ открытых карточек конкурентов: позиционирование, тропы, обещания в аннотациях. Данные о чужих расходах, покупках и конверсиях недоступны — приложение их не выдумывает.</p>
    </div>
    ${rows.length?`
      <div class="card"><div class="row between"><h2 style="margin:0">Повторяющиеся темы</h2><span class="small muted">${rows.length} книг</span></div>
      ${radar.length?`<p class="small"><b>Заявленные тропы:</b> ${radar.map(x=>`<span class="tag">${esc(x.trope)} · ${x.books}</span>`).join(" ")}</p>`:""}
      ${insight.repeated.length?`<div class="kw-terms">
        ${insight.repeated.map(v=>`<span class="tag">${esc(v.term)} · ${v.books}</span>`).join('')}
      </div>`:'<p class="small muted">Чтобы увидеть общие мотивы, добавь описания хотя бы двух конкурентных книг.</p>'}
      ${insight.gap.length?`<p class="small muted">Темы, которые встречаются у конкурентов, но пока отсутствуют в твоих выбранных ключах: <b>${esc(insight.gap.join(', '))}</b>. Это идеи для проверки, не автоматически подходящие ключевые фразы.</p>`:''}
      </div>`:''}
    ${rows.map(x=>`
    <div class="card cmp-card">
      <div class="row between"><div><h3>${esc(x.title||'Книга конкурента')}</h3>${x.author?`<span class="small muted">${esc(x.author)}</span>`:''}</div>
        <div class="row"><button data-act="cmp.refresh" data-id="${esc(x.id)}" ${!x.url?'disabled':''}>Обновить описание</button><button data-act="cmp.edit" data-id="${esc(x.id)}">Изменить</button></div></div>
      ${x.url?`<a class="small" target="_blank" rel="noopener" href="${esc(x.url)}">Открытая карточка ↗</a>`:''}
      ${x.description?`<details class="cmp-description"><summary>Открытая аннотация</summary><p>${esc(x.description)}</p></details>`:''}
      ${x.adText?`<p class="small"><b>Рекламное сообщение (публичное наблюдение):</b> ${esc(x.adText)}</p>`:''}
      ${x.note?`<p class="small muted">${esc(x.note)}</p>`:''}
      <p class="small muted">${x.checkedAt?'Проверено '+esc(new Date(x.checkedAt).toLocaleDateString('ru-RU')):'Введено вручную'} · Никаких выводов о чужой окупаемости</p>
    </div>`).join('')}
    ${!rows.length?'<div class="card"><p class="muted">Добавь ссылки на 2–3 публичные книги из соседнего жанра. Приложение попробует прочитать открытое описание через переходник, а затем найдет общие темы.</p></div>':''}
  `};
}
function fields(x={}){
 const a=app();
 return `
  <label>Моя книга для сравнения</label>
  <select name="bookId">${books(a).map(v=>opt(v.id,v.title,x.bookId||selectedBook(a))).join('')}</select>
  <label>Название книги</label><input name="title" maxlength="180" value="${esc(x.title||'')}" placeholder="Название конкурента" required>
  <label>Автор (необязательно)</label><input name="author" maxlength="180" value="${esc(x.author||'')}">
  <label>Ссылка на публичную книгу</label><input type="url" name="url" value="${esc(x.url||'')}" placeholder="https://litnet.com/ru/book/..." required>
  <label>Аннотация — можно вставить самостоятельно</label><textarea name="description" rows="4" maxlength="5000" placeholder="Если страница открыта для всех, приложение попробует подтянуть описание само">${esc(x.description||'')}</textarea>
  <label>Текст рекламного объявления (если видела сама)</label><textarea name="adText" rows="2" maxlength="2000">${esc(x.adText||'')}</textarea>
  <label>Что заметила: крючок, троп, оформление</label><textarea name="note" rows="2" maxlength="2000">${esc(x.note||'')}</textarea>
 `;
}
async function save(x,fd){
  const a=app(),url=safePublicBookUrl(fd.get('url'));
  if(!url){toast('Нужна публичная ссылка Литнета, Литмаркета, Литгорода, Литреса или Author.Today');return false;}
  let title=String(fd.get('title')||'').trim(),description=String(fd.get('description')||'').trim(),checkedAt=x.checkedAt||'';
  if(!description&&a.ctx().settings.direct?.proxy){
    try{
      const fetched=await competitorPublicPreview(url,a.ctx().settings.direct.proxy);
      description=fetched.description;checkedAt=new Date().toISOString();
      if(!title)title=fetched.title;
    }catch(e){toast('Публичное описание не загрузилось: '+(e.message||e));}
  }
  if(!title){toast('Укажи название');return false;}
  await a.store.put('d_competitors',{...x,id:x.id||'cmp_'+uid(),bookId:String(fd.get('bookId')||selectedBook(a)),title,author:String(fd.get('author')||'').trim(),url,description,
    adText:String(fd.get('adText')||'').trim(),note:String(fd.get('note')||'').trim(),checkedAt,updatedAt:new Date().toISOString()});
  toast('Конкурентная карточка сохранена');return true;
}
acts['cmp.new']=()=>{
  openSheet('Конкурентная книга',fields(),fd=>save({},fd),{submitText:'Сохранить'});return false;
};
acts['cmp.edit']=d=>{
  const x=list(app()).find(v=>v.id===d.id);if(!x)return false;
  openSheet('Конкурентная книга',fields(x)+`<p><button type="button" class="link danger" data-act="cmp.archive" data-id="${esc(x.id)}">В архив</button></p>`,fd=>save(x,fd));return false;
};
acts['cmp.refresh']=async d=>{
  const a=app(),x=list(a).find(v=>v.id===d.id);if(!x||!x.url)return false;
  try{
    const fetched=await competitorPublicPreview(x.url,a.ctx().settings.direct?.proxy);
    if(!fetched.description){toast('На странице не нашлось публичной аннотации');return false;}
    await a.store.put('d_competitors',{...x,description:fetched.description,checkedAt:new Date().toISOString()});
    toast('Описание обновлено из открытой карточки');
  }catch(e){toast(e.message||String(e));}
  return false;
};
acts['cmp.archive']=async d=>{
  const a=app(),x=list(a).find(v=>v.id===d.id);
  if(!x||!(await ask('Убрать книгу из сравнения?','В архив')))return false;
  await a.store.put('d_competitors',{...x,status:'archived'});
  document.getElementById('sheet')?.close();return false;
};
