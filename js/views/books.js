import { esc, acts, forms, openSheet, opt, toast, N, ask } from '../ui.js';
import { rub, fmtDate } from '../format.js';
import { priceAt, bookIdFor, inferPriceChanges, addDays, incomeSeries, sumSeries } from '../calc.js';

const app = () => window.__app;
const STATUS = { progress: 'В процессе', done: 'Завершена', removed: 'Снята с продажи' };

export function books(a) {
  const c = a.ctx();
  const rank = (b) => (b.status === 'removed' ? 2 : b.status === 'done' ? 1 : 0);
  const list = [...c.books].sort((x, y) => rank(x) - rank(y) || x.title.localeCompare(y.title));
  const html = `<div class="row between" style="margin-bottom:10px"><h2 style="margin:0">Книги</h2><button class="primary" data-act="book.new">+ Книга</button></div>
  <div class="card list">${list.length ? list.map((b) => {
    const m30 = sumSeries(incomeSeries(c.sales, [], addDays(c.dataEnd, -29), c.dataEnd, b.id));
    return `<a class="item" href="#" data-act="go" data-to="/book/${b.id}"><div class="row between"><b>${esc(b.title)}</b><span class="badge ${b.status === 'progress' || !b.status ? 'good' : ''}">${STATUS[b.status] || STATUS.progress}</span></div>
      <div class="small muted">цена сейчас: ${priceAt(b, c.today) != null ? rub(priceAt(b, c.today)) : 'не задана'} · за 30 дней: ${rub(m30)}</div>
      <div class="small muted">старт: ${fmtDate(b.startDate) || '—'} · последняя глава: ${fmtDate(b.lastChapterDate) || '—'}</div></a>`;
  }).join('') : '<p class="muted">Книги появятся сами после импорта выгрузки. Можно добавить и вручную.</p>'}</div>`;
  return { html };
}

export function bookPage(a, id) {
  const c = a.ctx();
  const b = c.booksById[id];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p><a href="#" data-act="go" data-to="/books">← К списку</a></div>' };
  const hist = [...(b.priceHistory || [])].sort((x, y) => y.from.localeCompare(x.from));
  const html = `<p><a href="#" data-act="go" data-to="/books">← Все книги</a></p>
  <div class="card"><form data-form="book.save" data-id="${b.id}">
    <label style="margin-top:0">Название</label><input name="title" value="${esc(b.title)}" required>
    <div class="f2"><div><label>Статус</label><select name="status">${Object.entries(STATUS).map(([k, v]) => opt(k, v, b.status || 'progress')).join('')}</select></div>
    <div><label>Дата старта</label><input type="date" name="startDate" value="${b.startDate || ''}"></div></div>
    <label>Дата последней главы</label><input type="date" name="lastChapterDate" value="${b.lastChapterDate || ''}">
    <div class="row between" style="margin-top:14px"><button class="primary" type="submit">Сохранить</button><button type="button" class="danger" data-act="book.del" data-id="${b.id}">Удалить книгу</button></div>
  </form></div>
  <div class="card"><h2>История цен</h2>
    <p class="small muted">Дата — с какого дня действует цена. Смены цены отмечены на графиках пунктирными линиями.</p>
    ${hist.length ? `<table><tr><th>С даты</th><th>Цена</th><th></th></tr>${hist.map((p) => `<tr><td>${fmtDate(p.from)}</td><td>${rub(p.price)}</td><td><button class="link danger" data-act="book.delPrice" data-id="${b.id}" data-from="${p.from}">убрать</button></td></tr>`).join('')}</table>` : '<p class="muted">История пока пуста.</p>'}
    <form data-form="book.addPrice" data-id="${b.id}"><div class="f2"><div><label>С даты</label><input type="date" name="from" value="${c.today}" required></div><div><label>Цена, ₽</label><input name="price" inputmode="decimal" required></div></div>
    <div class="row" style="margin-top:12px"><button class="primary" type="submit">Добавить цену</button><button type="button" data-act="book.infer" data-id="${b.id}">Подтянуть из продаж</button></div></form>
  </div>`;
  return { html };
}

const upd = (b, patch) => app().store.put('books', { ...b, ...patch });

acts['book.new'] = () => {
  openSheet('Новая книга', `<label>Название</label><input name="title" required><label>Статус</label><select name="status">${Object.entries(STATUS).map(([k, v]) => opt(k, v)).join('')}</select><div class="f2"><div><label>Дата старта</label><input type="date" name="startDate"></div><div><label>Цена, ₽</label><input name="price" inputmode="decimal"></div></div>`, async (fd) => {
    const title = (fd.get('title') || '').trim();
    if (!title) return false;
    const id = bookIdFor(title);
    const price = N(fd.get('price'));
    await app().store.put('books', { id, title, status: fd.get('status'), startDate: fd.get('startDate') || '', lastChapterDate: '', priceHistory: price ? [{ from: fd.get('startDate') || app().ctx().today, price }] : [] });
    toast('Книга добавлена');
  });
};
forms['book.save'] = async (fd, f) => {
  const b = app().ctx().booksById[f.dataset.id];
  await upd(b, { title: fd.get('title').trim(), status: fd.get('status'), startDate: fd.get('startDate') || '', lastChapterDate: fd.get('lastChapterDate') || '' });
  toast('Сохранено');
};
forms['book.addPrice'] = async (fd, f) => {
  const b = app().ctx().booksById[f.dataset.id];
  const price = N(fd.get('price'));
  if (!price || Number.isNaN(price)) { toast('Введите цену числом'); return; }
  const h = (b.priceHistory || []).filter((p) => p.from !== fd.get('from'));
  await upd(b, { priceHistory: [...h, { from: fd.get('from'), price }] });
  toast('Цена добавлена');
};
acts['book.delPrice'] = async (d) => {
  const b = app().ctx().booksById[d.id];
  await upd(b, { priceHistory: (b.priceHistory || []).filter((p) => p.from !== d.from) });
};
acts['book.infer'] = async (d) => {
  const c = app().ctx(), b = c.booksById[d.id];
  const sug = inferPriceChanges(c.sales, b.id);
  if (!sug.length) { toast('В продажах не нашлось цен этой книги'); return; }
  openSheet('Цены из продаж', `<p class="small muted">По выгрузке цена менялась так. Если всё верно — добавьте в историю (существующие записи с теми же датами заменятся).</p><table><tr><th>С даты</th><th>Цена</th></tr>${sug.map((p) => `<tr><td>${fmtDate(p.from)}</td><td>${rub(p.price)}</td></tr>`).join('')}</table>`, async () => {
    const map = new Map((b.priceHistory || []).map((p) => [p.from, p]));
    sug.forEach((p) => map.set(p.from, p));
    await upd(b, { priceHistory: [...map.values()] });
    toast('История цен обновлена');
  }, { submitText: 'Добавить' });
};
acts['book.del'] = async (d) => {
  const c = app().ctx();
  if (c.sales.some((s) => s.bookId === d.id)) { toast('У книги есть продажи — удалить нельзя. Можно отметить как «Завершена».'); return; }
  if (!(await ask('Удалить книгу?'))) return;
  await app().store.remove('books', d.id);
  app().go('/books');
};
