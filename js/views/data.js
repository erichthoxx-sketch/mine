import { esc, acts, forms, changes, openSheet, opt, toast, N, download, readFile, closeSheet } from '../ui.js';
import { rub, fmtDate, fmtMonth, num, parseNum } from '../format.js';
import { decodeBuffer, parseStatistic, parseLegacy, makeBackup, readBackup, toCsv, csvDec } from '../parse.js';
import { diffSales, inferPriceChanges, monthKey, r2 } from '../calc.js';

const app = () => window.__app;
const stamp = () => new Date().toISOString().slice(0, 10);

export function data(a) {
  const c = a.ctx(), s = c.settings, st = a.store;
  const html = `
  <div class="card"><h2>Импорт продаж из Литнета</h2>
    <p class="small muted">Кабинет Литнета → «Статистика продаж» → выгрузить файл Statistic.csv. Можно загружать снова и снова: пересекающиеся дни обновятся, дублей не будет.</p>
    <label class="btn primary" style="cursor:pointer">Выбрать файл Statistic.csv<input type="file" accept=".csv,.txt" data-chg="imp.stat" hidden></label>
    <p class="small muted" style="margin-top:12px">Данные из старого трекера (dohody.csv) — для дней до начала выгрузки, плюс события и заметки:</p>
    <label class="btn" style="cursor:pointer">Выбрать dohody.csv<input type="file" accept=".csv,.txt" data-chg="imp.legacy" hidden></label>
    <div class="hint">Сейчас в базе: ${c.sales.length} строк продаж${c.hasData ? ` за ${fmtDate(c.firstDate)} – ${fmtDate(c.dataEnd)}` : ''}.</div></div>
  <div class="card"><h2>Резервная копия</h2>
    <div class="row"><button class="primary" data-act="backup.save">Скачать копию (JSON)</button><label class="btn" style="cursor:pointer">Восстановить из копии<input type="file" accept=".json,application/json" data-chg="backup.restore" hidden></label></div>
    <h3>Экспорт в CSV (для Excel)</h3>
    <div class="row">${[['sales', 'Продажи'], ['daily', 'Доход по дням'], ['monthly', 'Итоги по месяцам'], ['campaigns', 'Кампании'], ['reports', 'Отчёты таргетологов'], ['days', 'События и заметки']].map(([k, t]) => `<button data-act="export.csv" data-k="${k}">${t}</button>`).join('')}</div>
    <div class="hint">Совет: раз в месяц скачивайте резервную копию и кладите в надёжное место.</div></div>
  <div class="card"><h2>Настройки</h2>
  <form data-form="settings">
    <div class="f2"><div><label style="margin-top:0">Налог, % ставка</label><input name="taxRate" inputmode="decimal" value="${s.taxRate}"></div>
    <div><label style="margin-top:0">Налог считать от</label><select name="taxBase">${opt('gross', 'полной цены книг', s.taxBase)}${opt('royalty', 'роялти', s.taxBase)}</select></div></div>
    <div class="f2"><div><label>«Литнет платит»: порог, ₽ в месяц</label><input name="litnetThreshold" inputmode="decimal" value="${s.litnetThreshold}"></div><div><label>Скидка, %</label><input name="litnetPct" inputmode="decimal" value="${s.litnetPct}"></div></div>
    <div class="f2"><div><label>База кампании по умолчанию, дней до старта</label><input name="baseDays" inputmode="numeric" value="${s.baseDays}"></div><div><label>Потолок индекса Rocket, ₽</label><input name="rocketCap" inputmode="decimal" value="${s.rocketCap}"></div></div>
    <h3>Цели</h3>
    <div class="f2"><div><label>Первый месяц плана</label><input type="month" name="goalStart" value="${s.goalStart}"></div><div><label>План на него, ₽</label><input name="goalAmount" inputmode="decimal" value="${s.goalAmount}"></div></div>
    <label>Рост в месяц, %</label><input name="goalGrowth" inputmode="decimal" value="${s.goalGrowth}">
    <label>Псевдоним (в шапке)</label><input name="pseudonym" value="${esc(s.pseudonym)}">
    <div style="margin-top:12px"><button class="primary" type="submit">Сохранить настройки</button></div>
  </form></div>
  <div class="card"><h2>Оформление и аккаунт</h2>
    <label style="margin-top:0">Тема</label><select data-chg="theme">${opt('auto', 'как в телефоне', a.theme)}${opt('light', 'светлая', a.theme)}${opt('dark', 'тёмная', a.theme)}</select>
    <p class="small muted" style="margin-top:12px">${st.mode === 'firebase' ? `Вы вошли как <b>${esc(st.user.email)}</b>. Данные синхронизируются между устройствами.` : 'Пробный режим: данные хранятся только в этом браузере. Чтобы работать с телефона и компьютера, настройте Firebase по инструкции (docs/SETUP.md).'}</p>
    ${st.mode === 'firebase' ? '<button data-act="auth.out">Выйти</button>' : ''}</div>`;
  return { html };
}

forms.settings = async (fd) => {
  const n = (k) => { const v = N(fd.get(k)); return Number.isNaN(v) || v == null ? undefined : v; };
  const patch = { taxRate: n('taxRate'), taxBase: fd.get('taxBase'), litnetThreshold: n('litnetThreshold'), litnetPct: n('litnetPct'), baseDays: n('baseDays'), rocketCap: n('rocketCap'), goalStart: fd.get('goalStart'), goalAmount: n('goalAmount'), goalGrowth: n('goalGrowth'), pseudonym: (fd.get('pseudonym') || '').trim() };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  await app().store.saveSettings(patch);
  toast('Настройки сохранены');
};
changes.theme = (v) => app().setTheme(v);
acts['auth.out'] = () => app().store.signOut();

// ---------- импорт продаж ----------
changes['imp.stat'] = async (v, el) => {
  const file = el.files[0];
  el.value = '';
  if (!file) return;
  const text = decodeBuffer(await readFile(file));
  const r = parseStatistic(text);
  if (!r.rows.length) { toast('В файле не нашлось строк продаж. Это точно Statistic.csv из кабинета Литнета?'); return; }
  const c = app().ctx();
  const d = diffSales(c.sales, r.rows, true);
  const fm = /(\d[\d  ]*[.,]\d{2})[  ]*RUB/i.exec(text);
  const fileTotal = fm ? parseNum(fm[1]) : null;
  const from = r.rows.reduce((x, s) => (s.date < x ? s.date : x), r.rows[0].date), to = r.rows.reduce((x, s) => (s.date > x ? s.date : x), r.rows[0].date);
  const perMonth = {};
  for (const s of r.rows) perMonth[monthKey(s.date)] = r2((perMonth[monthKey(s.date)] || 0) + s.royalty);
  const newBooks = [...new Map(r.rows.filter((s) => !c.booksById[s.bookId]).map((s) => [s.bookId, s.book])).entries()];
  const check = fileTotal == null ? '' : Math.abs(fileTotal - r.total) < 0.01 ? `<div class="alert ok">✔ Сумма строк ${rub(r.total)} совпадает с «Итого» в файле.</div>` : `<div class="alert bad">⚠ Сумма строк ${rub(r.total)} не совпадает с «Итого» в файле (${rub(fileTotal)}).</div>`;
  openSheet('Импорт выгрузки', `<p>Период <b>${fmtDate(from)} – ${fmtDate(to)}</b>, строк: ${r.rows.length}, гонорар <b>${rub(r.total)}</b>.</p>${check}
    <table><tr><th>Месяц</th><th>Гонорар</th></tr>${Object.keys(perMonth).sort().map((k) => `<tr><td>${fmtMonth(k)}</td><td>${rub(perMonth[k])}</td></tr>`).join('')}</table>
    <h3>Что изменится</h3><ul><li>новых строк: <b>${d.added}</b></li><li>обновится: <b>${d.changed}</b></li><li>без изменений: ${d.same}</li>${newBooks.length ? `<li>новые книги: ${newBooks.map(([, t]) => esc(t)).join(', ')}</li>` : ''}</ul>
    ${d.removeIds.length ? `<label><input type="checkbox" name="rm" checked>Убрать ${d.removeIds.length} старых строк за этот период, которых нет в файле</label>` : ''}`, async (fd) => {
    const have = new Map(c.sales.map((s) => [s.id, s]));
    const write = r.rows.filter((s) => { const e = have.get(s.id); return !e || e.qty !== s.qty || Math.abs(e.royalty - s.royalty) > 0.004; });
    await app().store.putMany('sales', write);
    if (d.removeIds.length && fd.get('rm')) await app().store.removeMany('sales', d.removeIds);
    for (const [bookId, title] of newBooks) {
      await app().store.put('books', { id: bookId, title, status: 'progress', startDate: '', lastChapterDate: '', priceHistory: inferPriceChanges(r.rows, bookId) });
    }
    toast(`Импорт готов: добавлено ${d.added}, обновлено ${d.changed}`);
    app().go('/');
  }, { submitText: 'Загрузить' });
};

// ---------- старый трекер ----------
changes['imp.legacy'] = async (v, el) => {
  const file = el.files[0];
  el.value = '';
  if (!file) return;
  const r = parseLegacy(decodeBuffer(await readFile(file)));
  if (!r.days.length) { toast('Не нашла строк с датами. Первая колонка должна быть датой ДД.ММ.ГГГГ.'); return; }
  const sum = r.days.reduce((a, d) => a + (d.income || 0), 0);
  openSheet('Импорт из старого трекера', `<p>Дней: <b>${r.days.length}</b> (${fmtDate(r.days[0].date)} … ${fmtDate(r.days[r.days.length - 1].date)}), сумма дохода ${rub(sum)}, событий: ${r.days.reduce((a, d) => a + d.events.length, 0)}.</p><p class="small muted">Доход из старого трекера используется только за даты до начала выгрузки Литнета. События и заметки добавятся к существующим.</p>`, async () => {
    const c = app().ctx();
    const out = r.days.map((d) => {
      const ex = c.data.days.find((x) => x.id === d.date) || { events: [], note: '' };
      const evs = [...(ex.events || [])];
      for (const e of d.events) if (!evs.some((x) => x.type === e.type && x.text === e.text)) evs.push(e);
      const note = [ex.note, d.note].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' · ');
      return { ...ex, id: d.date, date: d.date, events: evs, note, income: d.income ?? ex.income ?? null };
    });
    await app().store.putMany('days', out);
    toast('Данные старого трекера загружены');
  }, { submitText: 'Загрузить' });
};

// ---------- резервная копия и экспорт ----------
acts['backup.save'] = async () => { if (await download(`backup-${stamp()}.json`, makeBackup(app().store.data), 'application/json')) toast('Копия сохранена'); };
changes['backup.restore'] = async (v, el) => {
  const file = el.files[0];
  el.value = '';
  if (!file) return;
  let b;
  try { b = readBackup(decodeBuffer(await readFile(file))); } catch (e) { toast(e.message); return; }
  openSheet('Восстановление из копии', `<div class="alert bad">Текущие данные будут заменены данными из файла: продаж ${b.sales.length}, книг ${b.books.length}, кампаний ${b.campaigns.length}, отчётов ${b.reports.length}. Сначала лучше скачать свежую копию.</div>`, async () => {
    await app().store.replaceAll(b);
    toast('Данные восстановлены');
  }, { submitText: 'Заменить данные' });
};
acts['export.csv'] = async (d) => {
  const c = app().ctx(), k = d.k;
  const D = (x) => (x ? fmtDate(x) : '');
  const defs = {
    sales: [c.sales.slice().sort((x, y) => x.date.localeCompare(y.date)), [['Дата', (r) => D(r.date)], ['Книга', (r) => c.titleOf(r.bookId, r.book)], ['Подписка/продажа', (r) => (r.kind === 'sub' ? 'Подписка' : 'Продажа')], ['Цена', (r) => csvDec(r.price)], ['Кол-во', (r) => r.qty], ['Гонорар', (r) => csvDec(r.royalty)]]],
    daily: [c.series, [['Дата', (r) => D(r.date)], ['Гонорар', (r) => csvDec(r.royalty)], ['Полная цена', (r) => csvDec(r.gross)], ['Кол-во', (r) => r.qty], ['Продажи, шт', (r) => r.saleQty], ['Подписки, шт', (r) => r.subQty]]],
    monthly: [[...new Set(c.series.map((x) => monthKey(x.date)))].map((m) => ({ m, f: app().fin(m) })), [['Месяц', (r) => r.m], ['Роялти', (r) => csvDec(r.f.royalty)], ['Rocket', (r) => csvDec(r.f.rocketFee)], ['Реклама', (r) => csvDec(r.f.adCost)], ['Налог', (r) => csvDec(r.f.tax)], ['Чистый', (r) => csvDec(r.f.net)]]],
    campaigns: [c.campaigns, [['Название', (r) => r.name], ['Книга', (r) => (r.bookId ? c.titleOf(r.bookId, '') : 'все')], ['Канал', (r) => ({ litnet: 'Литнет платит', own: 'Свой таргет', other: 'Другое' }[r.channel] || '')], ['Начало', (r) => D(r.start)], ['Конец', (r) => D(r.end)], ['Бюджет', (r) => csvDec(r.budget)]]],
    reports: [c.data.reports, [['Кампания', (r) => c.campaigns.find((x) => x.id === r.campaignId)?.name || ''], ['С', (r) => D(r.start)], ['По', (r) => D(r.end)], ['Расход', (r) => csvDec(r.spend)], ['Показы', (r) => r.impressions], ['Клики', (r) => r.clicks]]],
    days: [c.data.days.slice().sort((x, y) => x.date.localeCompare(y.date)), [['Дата', (r) => D(r.date)], ['Доход (старый трекер)', (r) => csvDec(r.income)], ['События', (r) => (r.events || []).map((e) => e.text || e.type).join('; ')], ['Заметка', (r) => r.note || '']]],
  };
  const [rows, cols] = defs[k];
  await download(`${k}-${stamp()}.csv`, toCsv(rows, cols.map(([title, get]) => ({ title, get }))), 'text/csv');
};
