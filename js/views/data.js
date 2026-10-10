import { esc, acts, forms, changes, openSheet, opt, toast, N, download, readFile, closeSheet } from '../ui.js';
import { rub, fmtDate, fmtMonth, num, parseNum } from '../format.js';
import { decodeBuffer, parseStatistic, parseLegacy, parseSalesText, makeBackup, readBackup, toCsv, csvDec } from '../parse.js';
import { diffSales, inferPriceChanges, monthKey, r2, addDays, manualSaleRow } from '../calc.js';
import { buildReportModel, toMarkdown, toHtml, toJson, toXlsxBook } from '../report.js';

const app = () => window.__app;
const stamp = () => new Date().toISOString().slice(0, 10);

export function data(a) {
  const c = a.ctx(), s = c.settings, st = a.store;
  const html = `
  <div class="card"><h2>Продажи</h2>
    <div class="row"><label class="btn primary" style="cursor:pointer">Загрузить отчёт о продажах<input type="file" accept=".csv,.txt" data-chg="imp.any" hidden></label>
    <button data-act="sale.manual">Добавить продажи вручную</button></div>
    <p class="hint">Загрузка: выгрузка Литнета (Statistic.csv) или таблица старого трекера (dohody.csv) — приложение само узнает формат. Повторная загрузка не задваивает. Вручную — например, пара продаж с другой площадки.</p>
    <div class="hint">Сейчас в базе: ${c.sales.length} строк продаж${c.hasData ? ` за ${fmtDate(c.firstDate)} – ${fmtDate(c.dataEnd)}` : ''}.</div></div>
  ${reportCard(a)}
  <div class="card"><h2>Резервная копия</h2>
    <div class="row"><button class="primary" data-act="backup.save">Скачать копию (JSON)</button><label class="btn" style="cursor:pointer">Восстановить из копии<input type="file" accept=".json,application/json" data-chg="backup.restore" hidden></label></div>
    <h3>Экспорт в CSV (для Excel)</h3>
    <div class="row">${[['sales', 'Продажи'], ['daily', 'Доход по дням'], ['monthly', 'Итоги по месяцам'], ['campaigns', 'Кампании'], ['reports', 'Отчёты таргетологов'], ['days', 'События и заметки']].map(([k, t]) => `<button data-act="export.csv" data-k="${k}">${t}</button>`).join('')}</div>
    <div class="hint">Совет: раз в месяц скачивайте резервную копию и кладите в надёжное место.</div></div>
  <div class="card"><h2>Настройки</h2>
  <form data-form="settings" class="settings-form">
    <div class="f2"><div><label class="first">Налог, % (самозанятая: 4 %)</label><input name="taxRate" inputmode="decimal" value="${s.taxRate}"></div>
    <div><label class="first">Налог считать от</label><select name="taxBase">${opt('gross', 'полной цены книг', s.taxBase)}${opt('royalty', 'роялти', s.taxBase)}</select></div></div>
    <div class="hint">Самозанятая с агентским договором Литнета: 4 % со всей цены, которую заплатили читатели (физлица), а не с суммы, пришедшей на карту.</div>
    <div class="f2"><div><label>Лимит НПД в год, ₽</label><input name="npdLimit" inputmode="decimal" value="${s.npdLimit || 2400000}"></div><div><label>Другой доход на НПД в этом году, ₽</label><input name="npdOther" inputmode="decimal" value="${s.npdOther || ''}" placeholder="0"></div></div>
    <div class="hint">Самозанятым можно не больше 2,4 млн ₽ дохода за год — суммарно со всех источников на НПД. Продажи, внесённые в приложение (и Литнет, и другие площадки), уже считаются сами. Сюда — только доход на НПД, которого в приложении нет (например, не от книг). Приложение заранее предупредит, если по темпу превышение ожидается в этом или следующем месяце.</div>
    <div class="f2"><div><label>«Литнет платит»: порог, ₽ в месяц</label><input name="litnetThreshold" inputmode="decimal" value="${s.litnetThreshold}"></div><div><label>Скидка, %</label><input name="litnetPct" inputmode="decimal" value="${s.litnetPct}"></div></div>
    <div class="f2"><div><label>База кампании по умолчанию, дней до старта</label><input name="baseDays" inputmode="numeric" value="${s.baseDays}"></div><div><label>Потолок индекса Rocket, ₽</label><input name="rocketCap" inputmode="decimal" value="${s.rocketCap}"></div></div>
    <div class="f2"><div><label>Показы в виджетах: за каждые, ₽ в месяц</label><input name="widgetStep" inputmode="decimal" value="${s.widgetStep ?? 20000}"></div><div><label>Показов за 1 ₽</label><input name="widgetPerRub" inputmode="decimal" value="${s.widgetPerRub ?? 2}"></div></div>
    <label>Ссылка на форму заявки на приоритетные показы</label><input name="widgetFormUrl" value="${esc(s.widgetFormUrl || '')}" placeholder="из уведомления Литнета">
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
  const patch = { npdLimit: n('npdLimit'), npdOther: n('npdOther'), taxRate: n('taxRate'), taxBase: fd.get('taxBase'), litnetThreshold: n('litnetThreshold'), litnetPct: n('litnetPct'), baseDays: n('baseDays'), rocketCap: n('rocketCap'), widgetStep: n('widgetStep'), widgetPerRub: n('widgetPerRub'), widgetFormUrl: (fd.get('widgetFormUrl') || '').trim(), goalStart: fd.get('goalStart'), goalAmount: n('goalAmount'), goalGrowth: n('goalGrowth'), pseudonym: (fd.get('pseudonym') || '').trim() };
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);
  await app().store.saveSettings(patch);
  toast('Настройки сохранены');
};
changes.theme = (v) => app().setTheme(v);
acts['auth.out'] = () => app().store.signOut();

// ---------- импорт продаж ----------
changes['imp.any'] = async (v, el) => {
  const file = el.files[0];
  el.value = '';
  if (!file) return;
  const text = decodeBuffer(await readFile(file));
  if (parseStatistic(text).rows.length) return importStatistic(text);
  if (parseLegacy(text).days.length) return importLegacy(text);
  toast('Не узнала формат файла. Подходят выгрузка Литнета (Statistic.csv) и таблица dohody.csv (дата, доход, события, заметка).');
};
async function importStatistic(text) {
  const r = parseStatistic(text);
  const c = app().ctx();
  const d = diffSales(c.sales, r.rows, true);
  const fm = /(\d[\d  ]*[.,]\d{2})[  ]*RUB/i.exec(text);
  const fileTotal = fm ? parseNum(fm[1]) : null;
  const from = r.rows.reduce((x, s) => (s.date < x ? s.date : x), r.rows[0].date), to = r.rows.reduce((x, s) => (s.date > x ? s.date : x), r.rows[0].date);
  const perMonth = {};
  for (const s of r.rows) perMonth[monthKey(s.date)] = r2((perMonth[monthKey(s.date)] || 0) + s.royalty);
  const newBooks = [...new Map(r.rows.filter((s) => !c.booksById[s.bookId]).map((s) => [s.bookId, s.book])).entries()];
  const check = fileTotal == null ? '' : Math.abs(fileTotal - r.total) < 0.01 ? `<div class="alert ok">✔︎ Сумма строк ${rub(r.total)} совпадает с «Итого» в файле.</div>` : `<div class="alert bad">⚠︎ Сумма строк ${rub(r.total)} не совпадает с «Итого» в файле (${rub(fileTotal)}).</div>`;
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
async function importLegacy(text) {
  const r = parseLegacy(text);
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

// ---------- отчёт для нейросети ----------
const FORMATS = {
  md: { label: 'Markdown', hint: 'лучше всего для нейросети' },
  xlsx: { label: 'Excel', hint: 'таблицы на листах, числа можно считать' },
  html: { label: 'Веб-страница', hint: 'красиво читать; из браузера можно сохранить в PDF' },
  json: { label: 'Данные JSON', hint: 'сырые цифры для нейросетей, которые анализируют файлы' },
};
export function reportCard(a) {
  const c = a.ctx();
  if (!c.hasData) return '';
  const r = a.ui.reportDays ?? 90, f = a.ui.reportFmt || 'md';
  const chip = (v, t) => `<button class="chip${r === v ? ' on' : ''}" data-act="report.period" data-v="${v}">${t}</button>`;
  return `<div class="card" id="report"><h2>Отчёт</h2>
    <p class="small muted">Все цифры по продажам, книгам, рекламе, целям и событиям в одном файле — с пояснениями и готовым вопросом в конце. Загрузите файл или вставьте текст в чат с нейросетью и попросите советы.</p>
    <label style="margin-top:0">Период</label>
    <div class="chips">${chip(30, '30 дней')}${chip(90, '90 дней')}${chip(180, '180 дней')}${chip(0, 'Всё время')}</div>
    <label>Формат</label>
    <div class="chips">${Object.entries(FORMATS).map(([k, x]) => `<button class="chip${f === k ? ' on' : ''}" data-act="report.fmt" data-v="${k}">${x.label}</button>`).join('')}</div>
    <p class="hint" style="margin:-2px 0 10px">${FORMATS[f].hint}</p>
    <div class="row"><button class="primary" data-act="report.dl">Скачать отчёт</button><button data-act="report.copy">Скопировать текст</button></div></div>`;
}
// period {from, to} — отчёт за конкретный период (например, месяц со вкладки «Реклама»)
function reportModel(period = null) {
  const a = app(), c = a.ctx(), days = a.ui.reportDays ?? 90;
  let from = days ? (addDays(c.dataEnd, -(days - 1)) < c.firstDate ? c.firstDate : addDays(c.dataEnd, -(days - 1))) : c.firstDate;
  let to = c.dataEnd;
  if (period) { from = period.from < c.firstDate ? c.firstDate : period.from; to = period.to < c.dataEnd ? period.to : c.dataEnd; }
  return buildReportModel({ sales: c.sales, legacyDays: c.legacyDays, books: c.books, campaigns: c.campaigns, reports: c.data.reports, days: c.data.days, monthsMap: c.monthsMap, spend: c.spend, discounts: c.discounts, litnetPayments: c.litnetPayments, litnetMoney: c.litnetMoney, forecast: c.forecast, settings: c.settings, today: c.today, dataEnd: c.dataEnd }, from, to);
}
let sheetjs;
// своя копия; если сайт обновился, пока страница открыта, — постоянная копия в корне сайта, затем cdnjs
const SHEETJS_SRC = [new URL('../vendor/xlsx.full.min.js', import.meta.url).href, new URL('../../vendor/xlsx.full.min.js', import.meta.url).href, 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'];
const addScript = (src) => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => { el.remove(); rej(); }; document.head.appendChild(el); });
const loadSheetJs = () => (sheetjs ||= (async () => {
  if (window.XLSX) return window.XLSX;
  for (const src of SHEETJS_SRC) { try { await addScript(src); if (window.XLSX) return window.XLSX; } catch { /* следующий источник */ } }
  sheetjs = null;
  throw new Error('Не загрузился модуль Excel — обновите страницу.');
})());
acts['report.period'] = (d) => { app().ui.reportDays = Number(d.v); };
acts['report.fmt'] = (d) => { app().ui.reportFmt = d.v; };
acts['report.dl'] = async (d) => {
  if (d?.from && d.from > app().ctx().dataEnd) { toast('За этот месяц ещё нет данных продаж'); return; }
  const m = reportModel(d?.from ? { from: d.from, to: d.to } : null), f = app().ui.reportFmt || 'md';
  const name = `otchet-${m.from}_${m.to}`;
  let ok;
  if (f === 'xlsx') {
    toast('Готовлю Excel…');
    const XLSX = await loadSheetJs();
    const buf = XLSX.write(toXlsxBook(m, XLSX), { bookType: 'xlsx', type: 'array' });
    ok = await download(name + '.xlsx', buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else if (f === 'html') ok = await download(name + '.html', toHtml(m), 'text/html');
  else if (f === 'json') ok = await download(name + '.json', toJson(m), 'application/json');
  else ok = await download(name + '.md', toMarkdown(m), 'text/markdown');
  if (ok) toast('Отчёт скачан');
};
acts['report.copy'] = async () => {
  const md = toMarkdown(reportModel());
  try { await navigator.clipboard.writeText(md); toast('Отчёт скопирован — вставьте его в чат'); }
  catch { toast('Не получилось скопировать — скачайте файл кнопкой «Скачать отчёт»'); }
};

// ---------- продажи вручную (например, с другой площадки) ----------
const PLATFORMS = ['Литнет', 'Литмаркет', 'Литгород', 'Литрес'];
acts['sale.manual'] = (d) => {
  const c = app().ctx(), date = d?.date || c.today;
  // площадки: основные + те, что уже встречались в ваших продажах
  const platforms = [...new Set([...PLATFORMS, ...c.sales.map((x) => x.platform).filter(Boolean)])];
  openSheet('Добавить продажи вручную', `
    <div class="f2"><div><label for="md">Дата</label><input id="md" type="date" name="date" value="${date}" required></div>
    <div><label for="mp">Площадка</label><select id="mp" name="platform">${platforms.map((p) => opt(p, p, 'Литнет')).join('')}<option value="">Другая — впишу название</option></select></div></div>
    <input name="platformOther" placeholder="название площадки, если её нет в списке" aria-label="Другая площадка" style="margin-top:6px">
    <label for="mb">Книга</label><select id="mb" name="bookId">${c.activeBooks.map((b) => opt(b.id, b.title)).join('')}<option value="">Другая — впишу название</option></select>
    <input name="bookTitle" placeholder="название, если книги нет в списке" style="margin-top:6px" aria-label="Название книги">
    <div class="row" style="margin-top:10px"><label class="btn">Заполнить по скриншоту<input type="file" accept="image/*" data-chg="sale.ocr" hidden></label><span class="small muted" data-ocr-st></span></div>
    <div data-ocr-extra></div>
    <div class="f2"><div><label for="mk">Тип</label><select id="mk" name="kind">${opt('sale', 'продажи')}${opt('sub', 'подписки')}</select></div>
    <div><label for="mq">Количество, шт.</label><input id="mq" name="qty" inputmode="numeric" required></div></div>
    <div class="f2"><div><label for="mr">Мне начислено, ₽</label><input id="mr" name="royalty" inputmode="decimal" required></div>
    <div><label for="mg">Заплатили читатели, ₽</label><input id="mg" name="gross" inputmode="decimal" placeholder="для налога"></div></div>
    <div class="hint">«Заплатили читатели» — полная цена, с неё считается налог. Если пусто — посчитаю как «начислено ÷ 70 %». Ручные продажи Литнета заменятся точными при загрузке выгрузки; продажи с других площадок сохраняются.</div>`, async (fd) => {
    const b = c.booksById[fd.get('bookId')];
    const title = b ? b.title : String(fd.get('bookTitle') || '').trim();
    const qty = N(fd.get('qty')), royalty = N(fd.get('royalty')), gross = N(fd.get('gross'));
    if (!title) { toast('Выберите книгу или впишите название'); return false; }
    if ([qty, royalty].some((x) => x == null || Number.isNaN(x)) || (gross != null && Number.isNaN(gross))) { toast('Количество и суммы — числами'); return false; }
    const platform = String(fd.get('platform') || fd.get('platformOther') || '').trim();
    if (!platform) { toast('Выберите площадку или впишите название'); return false; }
    const row = manualSaleRow({ date: fd.get('date'), book: title, bookId: b?.id, kind: fd.get('kind'), qty, royalty, gross, platform });
    if (!b) await app().store.put('books', { id: row.bookId, title, status: 'progress', startDate: '', lastChapterDate: '', priceHistory: [] });
    await app().store.put('sales', row);
    // со скриншота пришли и продажи, и подписки — вторую строку добавляем отдельно
    const xq = N(fd.get('xQty')), xr = N(fd.get('xRoyalty')), xg = N(fd.get('xGross'));
    if (fd.get('xAdd') && xq > 0 && xr > 0) await app().store.put('sales', manualSaleRow({ date: fd.get('date'), book: title, bookId: row.bookId, kind: fd.get('xKind'), qty: xq, royalty: xr, gross: xg || null, platform }));
    toast('Продажи добавлены');
  }, { submitText: 'Добавить' });
};

// распознавание скриншота продаж: Tesseract.js грузится только по требованию
let tess;
const loadTesseract = () => tess || (tess = new Promise((ok, fail) => {
  if (window.Tesseract) return ok(window.Tesseract);
  const sc = document.createElement('script');
  sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  sc.onload = () => ok(window.Tesseract); sc.onerror = () => { tess = null; fail(new Error('load')); };
  document.head.appendChild(sc);
}));
changes['sale.ocr'] = async (v, el) => {
  const file = el.files[0]; el.value = '';
  if (!file) return;
  const form = el.closest('form'), st = form.querySelector('[data-ocr-st]'), extra = form.querySelector('[data-ocr-extra]');
  const set = (n, val) => { const f = form.elements[n]; if (f) f.value = val; };
  st.textContent = 'Читаю скриншот…';
  try {
    const T = await loadTesseract();
    const { data } = await T.recognize(file, 'rus+eng', { logger: (m) => { if (m.status === 'recognizing text') st.textContent = `Читаю скриншот… ${Math.round(m.progress * 100)} %`; } });
    const b = app().ctx().booksById[form.elements.bookId.value];
    const r = parseSalesText(data.text, b ? b.title : form.elements.bookTitle.value);
    const kinds = ['sale', 'sub'].filter((k) => r[k].qty > 0 || r[k].royalty > 0);
    if (!kinds.length && r.royalty == null) { st.textContent = 'Не нашла цифр продаж — впишите вручную.'; extra.innerHTML = ''; return; }
    const main = kinds[0] || 'sale', m = r[main];
    set('kind', main);
    if (m.qty) set('qty', m.qty);
    set('royalty', String(m.royalty || r.royalty || '').replace('.', ','));
    if (m.gross) set('gross', String(m.gross).replace('.', ','));
    const x = kinds[1] && r[kinds[1]];
    extra.innerHTML = x ? `<label class="check" style="margin-top:8px"><input type="checkbox" name="xAdd" checked> и ${kinds[1] === 'sub' ? 'подписки' : 'продажи'}: ${x.qty} шт., ${rub(x.royalty)} — тоже добавить</label>
      <input type="hidden" name="xKind" value="${kinds[1]}"><input type="hidden" name="xQty" value="${x.qty}"><input type="hidden" name="xRoyalty" value="${x.royalty}"><input type="hidden" name="xGross" value="${x.gross || ''}">` : '';
    st.textContent = 'Заполнила — проверьте цифры перед сохранением.';
  } catch (e) {
    st.textContent = 'Не получилось распознать (нужен интернет). Впишите вручную.';
  }
};
