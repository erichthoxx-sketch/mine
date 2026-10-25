// Общие жанры и теги книги редактируются здесь и сохраняются в w_books Мастерской.
import { forms, esc, opt, toast } from '../../../js/ui.js';
import { BOOK_GENRES, bookGenres, bookTags, uniqueWords } from '../../../writer/js/bookmeta.js';

export function taxonomyPanel(book) {
  if (!book?.id) return '<p class="small muted">Выбери книгу из «Мастерской», чтобы указать ее жанры и теги.</p>';
  const genres=bookGenres(book),tags=bookTags(book);
  const chips=values=>values.length?values.map(x=>`<span class="d-meta-chip">${esc(x)}</span>`).join(''):'<span class="d-meta-none">Не указаны</span>';
  return `<section class="d-book-meta" aria-label="Жанры и теги выбранной книги">
    <div class="d-meta-top"><strong>Жанры и теги книги</strong><span>Общие с «Мастерской»</span></div>
    <div class="d-meta-label">Жанры</div>
    <div class="d-meta-values">${chips(genres)}</div>
    <details class="d-meta-genres">
      <summary>Изменить жанры</summary>
      <form data-form="dbook.genres" data-id="${esc(book.id)}">
        <div class="d-meta-selects">
          <div><label>Основной жанр</label><select name="genre1"><option value="">Не выбран</option>${BOOK_GENRES.map(x=>opt(x,x,genres[0]||'')).join('')}</select></div>
          <div><label>Дополнительный жанр</label><select name="genre2"><option value="">Не выбран</option>${BOOK_GENRES.map(x=>opt(x,x,genres[1]||'')).join('')}</select></div>
        </div>
        <div class="row d-actions"><button type="submit">Сохранить жанры</button></div>
      </form>
    </details>
    <form class="d-meta-tag-form" data-form="dbook.tags" data-id="${esc(book.id)}">
      <label for="dBookTags">Теги и тропы <span class="d-meta-count">${tags.length}/20</span></label>
      <input id="dBookTags" name="tags" value="${esc(tags.join(', '))}" placeholder="одержимый герой, похищение, второй шанс" maxlength="1500" autocomplete="off">
      <div class="row d-actions d-meta-actions"><button type="submit">Сохранить теги</button><span class="small muted">Через запятую · синхронизация с «Мастерской»</span></div>
    </form>
  </section>`;
}
function selected(form) {
  return (window.__app?.ctx()?.data?.w_books||[]).find(x=>String(x.id)===String(form.dataset.id));
}
forms['dbook.tags']=async (data,form)=>{
  const b=selected(form);
  if(!b){toast('Книга не найдена');return false;}
  const tags=uniqueWords(data.get('tags')||'',100);
  if(tags.length>20){toast('Можно сохранить не больше 20 тегов');return false;}
  await window.__app.store.put('w_books',{...b,tags});
  toast('Теги сохранены для обоих приложений');
};
forms['dbook.genres']=async (data,form)=>{
  const b=selected(form);
  if(!b){toast('Книга не найдена');return false;}
  const genres=[data.get('genre1'),data.get('genre2')].map(x=>String(x||'').trim()).filter(Boolean);
  if(new Set(genres).size!==genres.length){toast('Жанры должны отличаться');return false;}
  if(genres.some(x=>!BOOK_GENRES.includes(x))){toast('Выбери жанр из списка');return false;}
  await window.__app.store.put('w_books',{...b,genres});
  toast('Жанры сохранены для обоих приложений');
};
