import { esc, acts, forms, changes, openSheet, opt, toast, N, ask } from '../ui.js';
import { rub, pct, fmtDate, fmtMonth, fmtMonthShort } from '../format.js';
import { priceAt, bookIdFor, inferPriceChanges, incomeSeries, bookMonthStats, monthKey, monthEnd, monthsBetween, byMonth, movingAverage } from '../calc.js';
import { dailyChart } from '../charts.js';

const app = () => window.__app;
const STATUS = { progress: 'В процессе', done: 'Завершена', removed: 'Снята с продажи' };

// маленький график дохода книги по дням месяца (наведите — сумма за день)
function spark(daily, max) {
  if (!daily.length) return '';
  const W = 100 / daily.length;
  return `<svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" role="img" aria-label="доход по дням">${daily.map((d, i) => {
    const h = max ? Math.max(d.royalty > 0 ? 1.5 : 0, (d.royalty / max) * 26) : 0;
    return `<rect x="${(i * W + W * 0.15).toFixed(2)}" y="${(28 - h).toFixed(2)}" width="${(W * 0.7).toFixed(2)}" height="${h.toFixed(2)}" rx="0.6"><title>${fmtDate(d.date)}: ${rub(d.royalty)}</title></rect>`;
  }).join('')}</svg>`;
}
const vsTxt = (v) => (v == null ? '' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '▲' : '▼'} ${pct(Math.abs(v), 0)}</span> к тому же сроку прошлого месяца`);

// месяцы, за которые можно посмотреть книги: от первой продажи до текущего
function bookMonths(c) {
  const cur = monthKey(c.today);
  return c.firstDate ? monthsBetween(monthKey(c.firstDate), cur).reverse() : [cur];
}

export function books(a) {
  const c = a.ctx();
  const months = bookMonths(c), cur = months[0];
  const mk = months.includes(a.ui.booksMonth) ? a.ui.booksMonth : cur, past = mk !== cur;
  const rank = (b) => (b.status === 'removed' ? 2 : b.status === 'done' ? 1 : 0);
  const stats = c.books.map((b) => ({ b, m: bookMonthStats(c.sales, b.id, mk, c.dataEnd) }));
  // снятые с продажи без продаж в этом месяце — не показываем
  const list = stats.filter(({ b, m }) => b.status !== 'removed' || (m && m.royalty > 0))
    .sort((x, y) => (y.m?.royalty || 0) - (x.m?.royalty || 0) || rank(x.b) - rank(y.b) || x.b.title.localeCompare(y.b.title));
  const total = list.reduce((s, x) => s + (x.m?.royalty || 0), 0);
  const max = Math.max(1, ...list.flatMap((x) => (x.m ? x.m.daily.map((d) => d.royalty) : [])));
  const noData = !list.some((x) => x.m && x.m.qty);
  const html = `<div class="row between" style="margin-bottom:6px"><h2 style="margin:0">Книги · ${fmtMonth(mk)}</h2><button class="primary" data-act="book.new">+ Книга</button></div>
  ${past ? `<div class="small" style="margin:0 0 8px">Показан ${fmtMonth(mk)} · <button class="link" style="padding:0" data-act="books.month" data-v="${cur}">вернуться к текущему</button></div>` : ''}
  ${noData && c.books.length ? `<div class="card"><p class="muted" style="margin:0">За ${fmtMonth(mk)} продаж пока нет${mk > monthKey(c.dataEnd) ? ' — загрузите свежую выгрузку Литнета на вкладке «Данные»' : ''}.</p></div>` : ''}
  <div class="card list">${list.length ? list.map(({ b, m }) => `<a class="item" href="#" data-act="go" data-to="/book/${b.id}">
      <div class="row between"><b>${esc(b.title)}</b><b>${m ? rub(m.royalty, 0) : '—'}</b></div>
      ${m && m.qty ? `<div class="small">продажи ${m.saleQty} · подписки ${m.subQty} · в день ${rub(m.avgPerDay, 0)}${total ? ` · ${pct(m.royalty / total, 0)} дохода` : ''}</div>
      <div class="small muted">${vsTxt(m.vsPrev) || (m.prevSame === null ? 'в прошлом месяце продаж не было' : '')}</div>
      ${spark(m.daily, max)}` : '<div class="small muted">в этом месяце продаж нет</div>'}
      <div class="small muted">${STATUS[b.status] || STATUS.progress} · цена сейчас: ${priceAt(b, c.today) != null ? rub(priceAt(b, c.today)) : 'не задана'}</div></a>`).join('') : '<p class="muted">Книги появятся сами после импорта выгрузки. Можно добавить и вручную.</p>'}</div>
  ${c.hasData ? `<div class="archive">
      <label for="bkm">Месяц</label>
      <select id="bkm" data-chg="books.month">${months.map((k) => opt(k, fmtMonth(k) + (k === cur ? ' (текущий)' : ''), mk)).join('')}</select>
      <button class="link" data-act="report.dl" data-from="${mk}-01" data-to="${monthEnd(mk)}">Скачать отчёт за ${fmtMonth(mk)}</button>
    </div>` : ''}`;
  return { html };
}
acts['books.month'] = (d) => { if (d.v) app().ui.booksMonth = d.v; window.scrollTo(0, 0); };
changes['books.month'] = (v) => { app().ui.booksMonth = v; app().rerender(); window.scrollTo(0, 0); };

export function bookPage(a, id) {
  const c = a.ctx();
  const b = c.booksById[id];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p><a href="#" data-act="go" data-to="/books">← К списку</a></div>' };
  const hist = [...(b.priceHistory || [])].sort((x, y) => y.from.localeCompare(x.from));
  // аналитика: месяц (как на списке книг) + история продаж по месяцам
  const mk = a.ui.booksMonth || monthKey(c.today);
  const m = bookMonthStats(c.sales, b.id, mk, c.dataEnd);
  const ser = c.firstDate ? incomeSeries(c.sales, [], c.firstDate, c.dataEnd, b.id) : [];
  const salesHist = byMonth(ser).reverse().filter((g) => g.qty > 0);
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/books">← Все книги</a></p>
  <div class="card"><h2>${esc(b.title)} · ${fmtMonth(mk)}</h2>
    ${m && m.qty ? `<div class="tiles">
      <div><div class="k">Доход за ${m.partial ? `1–${Number(m.to.slice(8))} число` : 'месяц'}</div><div class="v">${rub(m.royalty, 0)}</div><div class="s">${vsTxt(m.vsPrev) || 'сравнить не с чем'}</div></div>
      <div><div class="k">Продано</div><div class="v">${m.qty} шт.</div><div class="s">продажи ${m.saleQty} · подписки ${m.subQty} · в день ${rub(m.avgPerDay, 0)}</div></div>
    </div><div class="chart" id="bookChart"></div>` : `<p class="muted">За ${fmtMonth(mk)} продаж этой книги нет.</p>`}
  </div>
  ${salesHist.length ? `<div class="card"><h2>История продаж</h2><div class="scroll"><table><tr><th>Месяц</th><th>Доход</th><th>Продажи</th><th>Подписки</th><th>В день</th></tr>
    ${salesHist.map((g) => `<tr${g.key === mk ? ' class="sel"' : ''}><td>${fmtMonthShort(g.key)}</td><td>${rub(g.royalty, 0)}</td><td>${g.saleQty}</td><td>${g.subQty}</td><td>${rub(g.avgPerDay, 0)}</td></tr>`).join('')}</table></div>
    <div class="hint">Месяц, который ещё идёт, — по последний день с данными.</div></div>` : ''}
  <div class="card"><h2>О книге</h2><form data-form="book.save" data-id="${b.id}">
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
  const after = () => {
    const el = document.getElementById('bookChart');
    if (!el || !m) return;
    const days = m.daily.map((d) => ({ date: d.date, value: d.royalty, known: true }));
    dailyChart(el, { days, ma: movingAverage(days.map((d) => d.value), 7), height: 200 });
  };
  return { html, after };
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
