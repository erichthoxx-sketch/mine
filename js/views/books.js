import { esc, acts, forms, changes, openSheet, opt, toast, N, ask } from '../ui.js';
import { rub, pct, num, fmtDate, fmtShort, fmtMonth, fmtMonthShort } from '../format.js';
import { priceAt, bookIdFor, inferPriceChanges, bookMonthStats, bookInsights, monthKey, monthEnd, monthsBetween, movingAverage, daysInMonth } from '../calc.js';
import { dailyChart } from '../charts.js';

const app = () => window.__app;
const STATUS = { progress: 'В процессе', done: 'Завершена', removed: 'Снята с продажи' };

// маленький график дохода книги по дням месяца (наведите — сумма за день)
function spark(daily, max, key) {
  if (!daily.length) return '';
  // все дни месяца: столбики одной ширины, будущие дни пустые
  const total = key ? daysInMonth(key) : daily.length;
  const W = 100 / total;
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
  ${(() => {
    // книги без продаж в этом месяце — свёрнуты, чтобы не мешали
    const sold = list.filter((x) => x.m && x.m.qty), rest = list.filter((x) => !(x.m && x.m.qty));
    const item = ({ b, m }) => `<a class="item" href="#" data-act="go" data-to="/book/${b.id}">
      <div class="row between"><b>${esc(b.title)}</b><b>${m ? rub(m.royalty, 0) : '—'}</b></div>
      ${m && m.qty ? `<div class="small">продажи ${m.saleQty} · подписки ${m.subQty} · в день ${rub(m.avgPerDay, 0)}${total ? ` · ${pct(m.royalty / total, 0)} дохода` : ''}</div>
      <div class="small muted">${vsTxt(m.vsPrev) || (m.prevSame === null ? 'в прошлом месяце продаж не было' : '')}</div>
      ${spark(m.daily, max, mk)}` : '<div class="small muted">в этом месяце продаж нет</div>'}
      <div class="small muted">${STATUS[b.status] || STATUS.progress} · цена сейчас: ${priceAt(b, c.today) != null ? rub(priceAt(b, c.today)) : 'не задана'}</div></a>`;
    if (!list.length) return '<div class="card"><p class="muted">Книги появятся сами после импорта выгрузки. Можно добавить и вручную.</p></div>';
    return `${sold.length ? `<div class="card list">${sold.map(item).join('')}</div>` : ''}
      ${rest.length ? `<details class="card" ${sold.length ? '' : 'open'}><summary>Без продаж в этом месяце (${rest.length})</summary><div class="list">${rest.map(item).join('')}</div></details>` : ''}`;
  })()}
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
  // подробная аналитика за выбранный месяц (тот же выбор месяца, что на списке книг)
  const months = bookMonths(c), cur = months[0];
  const mk = months.includes(a.ui.booksMonth) ? a.ui.booksMonth : cur, past = mk !== cur;
  const x = bookInsights(b, mk, { sales: c.sales, days: c.data.days, campaigns: c.campaigns, reports: c.data.reports, dataEnd: c.dataEnd, today: c.today, baseDays: c.settings.baseDays, firstDate: c.firstDate });
  const m = x && x.qty ? x : null;
  const wmax = x ? Math.max(1, ...x.weekdays.map((w) => w.avg || 0)) : 1;
  const WDS = { 1: 'пн', 2: 'вт', 3: 'ср', 4: 'чт', 5: 'пт', 6: 'сб', 0: 'вс' };
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/books">← Все книги</a></p>
  ${past ? `<div class="small" style="margin:0 0 8px">Показан ${fmtMonth(mk)} · <button class="link" style="padding:0" data-act="books.month" data-v="${cur}">вернуться к текущему</button></div>` : ''}
  <div class="card"><h2>${esc(b.title)} · ${fmtMonth(mk)}</h2>
    ${m ? `<div class="tiles">
      <div><div class="k">Доход за ${m.partial ? `1–${Number(m.to.slice(8))} число` : 'месяц'}</div><div class="v">${rub(m.royalty, 0)}</div><div class="s">${vsTxt(m.vsPrev) || 'сравнить не с чем'}</div></div>
      <div><div class="k">Продано</div><div class="v">${m.qty} шт.</div><div class="s">продажи ${m.saleQty} · подписки ${m.subQty}</div></div>
    </div>
    <div class="kv">
      <div><span>В день</span><b>${rub(m.avgPerDay, 0)}</b></div>
      <div><span>За 1 шт.</span><b>${rub(m.perUnit, 0)}</b></div>
      <div><span>Дней с продажами</span><b>${m.activeDays} из ${m.days}</b></div>
      <div><span>Лучший день</span><b>${m.best ? `${fmtShort(m.best.date)} · ${rub(m.best.royalty, 0)}` : '—'}</b></div>
    </div>
    <div class="chart" id="bookChart"></div>` : `<p class="muted">За ${fmtMonth(mk)} продаж этой книги нет.</p>`}
  </div>
  ${m ? `<div class="card"><h2>Что влияло</h2>
    <h3 style="margin-top:0">Цена</h3>
    ${m.prices.length ? `<div class="list">${m.prices.map((p) => `<div class="item row between"><span>${rub(p.price)}<span class="sub">${fmtShort(p.from)}–${fmtShort(p.to)} · ${p.days} дн. · продажи ${p.saleQty}, подписки ${p.subQty}</span></span><b>${rub(p.avgPerDay, 0)} в день</b></div>`).join('')}</div>
      ${m.prices.length > 1 ? '<div class="hint">Сравните доход в день при разных ценах — так видно, какая цена выгоднее.</div>' : ''}` : '<p class="small muted">История цен не заполнена — добавьте её ниже, тогда здесь будет сравнение цен.</p>'}
    <h3>Выкладка глав</h3>
    ${m.chapters ? `<p class="small" style="margin:0">Глав выложено: <b>${m.chapters.chapterDays}</b> дн. · подписок в дни выкладки — <b>${num(m.chapters.subsOn ?? 0, 1)}</b> в день, в остальные — <b>${num(m.chapters.subsOff ?? 0, 1)}</b>.</p>` : '<p class="small muted" style="margin:0">В этом месяце выкладка глав не отмечена (вкладка «День» → «+ Событие»).</p>'}
    <h3>Реклама</h3>
    ${m.ads.length ? `<div class="list">${m.ads.map((k) => `<a class="item row between" href="#" data-act="go" data-to="/ad/${k.id}"><span>${esc(k.name)}<span class="sub">${k.allBooks ? 'на все книги · ' : ''}${k.days ? `${k.days} дн. в этом месяце · потрачено ≈ ${rub(k.spend, 0)}` : 'данных за этот месяц пока нет'}</span></span><b>${k.returned == null ? '—' : `<span class="${k.returned - k.spend >= 0 ? 'up' : 'down'}">${k.returned - k.spend >= 0 ? '+' : ''}${rub(k.returned - k.spend, 0)}</span>`}</b></a>`).join('')}</div>
      <div class="hint">Справа — сколько реклама принесла сверх обычного дохода за вычетом расхода в этом месяце. Для рекламы «на все книги» считается по всем книгам.</div>` : '<p class="small muted" style="margin:0">В этом месяце реклама не шла.</p>'}
  </div>
  <div class="card"><h2>По дням недели</h2>
    <div class="wd">${m.weekdays.map((w) => `<div><i style="height:${w.avg ? Math.max(4, (w.avg / wmax) * 60).toFixed(0) : 0}px" title="${WDS[w.day]}: ${w.avg == null ? 'нет данных' : rub(w.avg, 0)}"></i><span>${WDS[w.day]}</span><small>${w.avg == null ? '—' : rub(w.avg, 0)}</small></div>`).join('')}</div>
    <div class="hint">Средний доход книги по дням недели за 8 недель по ${fmtDate(m.to)}.</div></div>` : ''}
  ${x && x.history.length ? `<div class="card"><h2>История продаж</h2>
    <div class="kv"><div><span>За всё время</span><b>${rub(x.allTime.royalty, 0)} · ${x.allTime.qty} шт.</b></div>${x.years.map((y) => `<div><span>${y.year} год</span><b>${rub(y.royalty, 0)}</b></div>`).join('')}</div>
    <div class="scroll"><table><tr><th>Месяц</th><th>Доход</th><th>Продажи</th><th>Подписки</th><th>В день</th></tr>
    ${x.history.map((g) => `<tr${g.key === mk ? ' class="sel"' : ''}><td><button class="link" style="padding:0" data-act="books.month" data-v="${g.key}">${fmtMonthShort(g.key)}</button></td><td>${rub(g.royalty, 0)}</td><td>${g.saleQty}</td><td>${g.subQty}</td><td>${rub(g.avgPerDay, 0)}</td></tr>`).join('')}</table></div>
    <div class="hint">Нажмите на месяц — аналитика выше покажет его. Месяц, который ещё идёт, — по последний день с данными.</div></div>` : ''}
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
  </div>
  <div class="archive">
    <label for="bkm">Месяц</label>
    <select id="bkm" data-chg="books.month">${months.map((k) => opt(k, fmtMonth(k) + (k === cur ? ' (текущий)' : ''), mk)).join('')}</select>
    <button class="link" data-act="report.dl" data-from="${mk}-01" data-to="${monthEnd(mk)}">Скачать отчёт за ${fmtMonth(mk)}</button>
  </div>`;
  const after = () => {
    const el = document.getElementById('bookChart');
    if (!el || !m) return;
    // весь месяц: дни после последних данных — пустые
    const have = new Map(m.daily.map((d) => [d.date, d.royalty]));
    const days = Array.from({ length: daysInMonth(mk) }, (_, i) => { const date = `${mk}-${String(i + 1).padStart(2, '0')}`; return { date, value: have.get(date) || 0, known: have.has(date) }; });
    dailyChart(el, { days, ma: movingAverage(m.daily.map((d) => d.royalty), 7), height: 200 }); // линия среднего — только по дням с данными
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
