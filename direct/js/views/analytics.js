// «Аналитика»: всё о читателях по Метрике автора на Литнете — с подсвеченными шагами, книгами, воронкой,
// метками UTM, деньгами и формулами. Работает и без Директа: нужна только Метрика.
import { esc, acts, forms, toast, openSheet, opt, N, uid } from '../../../js/ui.js';
import { num, pct, rub, fmtShort } from '../../../js/format.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { lineChart } from '../../../js/charts.js';
import { ic } from '../../../js/icons.js';
import { SITE_COUNTER, SITE_GOALS, sitePages, sumDays, weekPair, byWeekday, mkInsights, reach, MIN_VISITS, byBook, funnel, goalTotals30, twoProp, royaltyPerSale, UTM_PRESETS, buildUtm, utmTable, litnetPage, litrefOf, litrefRows } from '../mcalc.js';
import { metrikaOf } from './metrika.js';
import { packageText, sendToChat } from './ai.js';
import { litnetView } from './litnet.js';
import { demo } from '../demo.js';
import { loadSite, SITE_URL, SITE_ADMIN } from '../../../js/sitepub.js';
import { refreshSite } from '../sync.js';

const app = () => window.__app;
const saveD = (patch) => app().store.saveSettings({ direct: { ...(app().ctx().settings.direct || {}), ...patch } });
const LEVEL = { step: ['Сделать', 'l-step'], warn: ['Внимание', 'warnc'], good: ['Хорошо', 'up'], wait: ['Подождать', 'muted'], info: ['На заметку', ''] };
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const mmss = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const delta = (a, b) => (a != null && b ? `<span class="small ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${pct(Math.abs(a - b) / b, 0)}</span>` : '');
const TABS = [['sum', 'Сводка'], ['books', 'Книги'], ['src', 'Источники'], ['site', 'Сайт'], ['links', 'Ссылки Литнета']];

function connectCard() {
  return `<div class="card"><h2>Аналитика читателей</h2>
    <p>Подключите счётчик Метрики автора с Литнета — и здесь будет всё в одном месте: откуда приходят читатели, кто из них покупает, какие книги и метки работают, сколько стоит покупатель. Самое важное приложение подсветит как следующие шаги.</p>
    <p class="small muted">Работает уже сейчас, даже пока Директ не одобрил заявку: нужна только Метрика.</p>
    <div class="row"><button class="primary" data-act="go" data-to="/settings">Подключить Метрику</button></div></div>`;
}

// Всё, что считается один раз на экран
function model(a) {
  const c = a.ctx(), m = metrikaOf(c), mk = a.snap('mk'), t = c.today;
  const main = (m.main || []).map(String), skip = outageSet(c.data.days || []), hasGoals = main.length > 0;
  const y = addDays(t, -1), w = sumDays(mk.daily, addDays(y, -6), y, main), { w: wc, pw } = weekPair(mk.daily, t, main, skip);
  // Фактические итоги должны совпадать с Метрикой: дни сбоя исключаем только из сравнений обычного темпа.
  const m30 = sumDays(mk.daily, addDays(t, -29), t, main);
  const titles = (c.data.books || []).map((b) => b.title).filter(Boolean);
  const sales = c.data.sales || [];
  const allSale = royaltyPerSale(sales, t);
  const econ = c.settings.direct?.econ || {};
  const perSale = allSale?.perSale ?? (Number(econ.rev) || null);
  return { c, m, mk, t, main, skip, hasGoals, w, wc, pw, m30, titles, sales, allSale, perSale, goalName: (m.goals || []).filter((g) => main.includes(String(g.id))).map((g) => g.name).join(', ') || 'покупки' };
}
const crOf = (x, main) => (x.visits ? reach(x, main) / x.visits : null);
// пометка «чаще/реже среднего» — только если разница не случайна
function vsAvg(k, n, K, N2) {
  if (n < MIN_VISITS || !N2) return '';
  const r = twoProp(k, n, K - k, N2 - n);
  if (r.level === 'low') return '<span class="small muted">как в среднем</span>';
  return `<span class="small ${r.z > 0 ? 'up' : 'down'}">${r.z > 0 ? '▲ чаще среднего' : '▼ реже среднего'}${r.level === 'mid' ? ' (вероятно)' : ''}</span>`;
}

// ---------- Сводка ----------
function summaryTab(a, M) {
  const { mk, t, main, skip, hasGoals, w, wc, pw } = M;
  const ins = mkInsights({ daily: mk.daily, sources: mk.sources, devices: mk.devices, pages: mk.pages, main, hasGoals, today: t, skip });
  const steps = ins.filter((x) => x.level === 'step' || x.level === 'warn').length;
  const wd = byWeekday(mk.daily, main, skip, t), maxWd = Math.max(...wd.map((x) => x.avg), 1);
  return `<div class="card"><div class="row between"><h2 style="margin:0">Читатели за 7 дней</h2><span class="small muted">по вчера · ${esc(M.m.counterName || '')}</span></div>
      <div class="tiles d-tiles">
        <div><div class="k">Визиты</div><div class="v">${num(w.visits)}</div><div class="s">${delta(wc.avg, pw.avg)} в день к прошлой неделе</div></div>
        <div><div class="k">${hasGoals ? esc(M.goalName) : 'Цели'}</div><div class="v">${hasGoals ? num(w.conv) : '—'}</div><div class="s">${hasGoals && w.cr != null ? `${pct(w.cr, 1)} визитов ${delta(wc.cr, pw.cr)}` : 'выберите цель в Настройках'}</div></div>
        <div><div class="k">Отказы</div><div class="v">${w.bounce == null ? '—' : pct(w.bounce, 0)}</div><div class="s">ушли сразу</div></div>
        <div><div class="k">Время на сайте</div><div class="v">${mmss(w.dur)}</div><div class="s">${w.depth ? `${String(Math.round(w.depth * 10) / 10).replace('.', ',')} стр. за визит` : ''}</div></div>
      </div>
      ${M.perSale && hasGoals ? `<p class="small">Одна покупка приносит в среднем <b>${rub(M.perSale, 0)}</b>${M.allSale ? ' (по «Доходам» за 60 дней)' : ' (из «Экономики книги»)'} → один визит стоит <b>${rub((w.cr || 0) * M.perSale, 1)}</b>.</p>` : ''}
      <div class="chart" id="mkChart"></div><div class="chart-cap small muted">Визиты по дням за 8 недель</div></div>
    <div class="card"><div class="row between"><h2 style="margin:0">Главное сейчас</h2>${steps ? `<span class="small warnc">шагов: ${steps}</span>` : ''}</div>
      <div class="list">${ins.map((x) => `<div class="item ${x.level === 'step' ? 'l-hl' : ''}"><span class="small ${LEVEL[x.level][1]}">● ${LEVEL[x.level][0]} · ${esc(x.area)}</span><br><b>${esc(x.title)}</b>
        ${x.why ? `<div class="small">${esc(x.why)}</div>` : ''}${x.step ? `<div class="small"><b>Что сделать:</b> ${esc(x.step)}</div>` : ''}
        ${x.lesson ? `<div class="small"><button class="link l-why" data-act="l.lesson" data-k="${x.lesson}">Почему так →</button></div>` : ''}</div>`).join('') || '<p class="muted">Пока всё ровно.</p>'}</div>
      <div class="row dl-row"><button class="dl" data-act="an.ai">${ic('copy')} Глубокий разбор с Claude</button></div></div>
    <div class="card"><h2>Дни недели</h2><p class="small muted">Средние визиты за полный день (дни сбоя не считаются)${hasGoals ? ' · доля покупок' : ''}</p>${[1, 2, 3, 4, 5, 6, 0].map((i) => `<div class="bar-row"><div class="row between small"><span>${WD[i]}</span><span>${wd[i].days ? Math.round(wd[i].avg) : '—'}${hasGoals && wd[i].cr != null ? ` · ${pct(wd[i].cr, 1)}` : ''}</span></div><div class="progress"><i style="width:${(wd[i].avg / maxWd * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>`;
}

// ---------- Книги и воронка ----------
const FUNNEL_TIP = {
  read: 'Пришли, но не начали читать: страница не зацепила. Проверьте обложку, название, первые строки аннотации и метки жанра — совпадают ли они с тем, откуда пришли люди.',
  lib: 'Читают, но не сохраняют: первые главы не держат. Сильный крючок в конце первой главы и регулярная выкладка обычно поднимают этот шаг.',
  buystart: 'Добавили, но не идут к покупке: часто ждут продолжения или скидки. Анонс даты выхода, понятный объём и цена помогают.',
  buy: 'Начали покупку, но не оплатили: смотрите цену и способ оплаты; иногда помогает временная скидка для новых читателей.',
};
// Свои заходы автора тоже попадают в Метрику, пока в счётчике не включён фильтр «Не учитывать мои визиты»
function selfNote(M) {
  const since = M.c.settings.direct?.selfOff;
  if (since) {
    const clean = addDays(since, 30);
    return `<p class="small muted">Ваши заходы не считаются с ${fmtShort(since)}.${clean > M.t ? ` Цифры за 30 дней станут полностью чистыми с ${fmtShort(clean)} — до этого в них ещё есть ваши прошлые заходы.` : ''} <button class="link" data-act="an.self" data-off="1">Отменить</button></p>`;
  }
  if (M.mk.perm === 'view') return `<div class="item"><b>Ваши заходы тоже здесь</b><div class="small">Метрика считает всех, кто открыл страницу, — и вас. Убрать свои заходы нельзя: у вашего аккаунта Яндекса права на этот счётчик только на просмотр, поэтому фильтры в Метрике серые.</div>
    <div class="small"><b>Как читать цифры:</b> шаги «Начали покупку» и «Купили» ваши заходы почти не задевают — им можно верить. Шаг «Начали читать» немного занижен: сравнивайте его сам с собой по неделям.</div></div>`;
  return `<div class="item"><b>Ваши заходы тоже здесь</b><div class="small">Метрика считает всех, кто открыл страницу, — и вас. Если вы часто заходите на свои книги, первый шаг воронки выглядит хуже, чем на самом деле.</div>
    <div class="small"><b>Что сделать:</b> Метрика → ваш счётчик → «Настройка» → вкладка «Фильтры» → галочка «Не учитывать мои визиты» → «Сохранить». Работает в том браузере, где вы открывали Метрику (на телефоне — откройте Метрику и там). Прошлые данные не меняются.</div>
    <div class="row"><button class="link" data-act="an.self">Я включила фильтр</button></div></div>`;
}
acts['an.self'] = async (d) => { await saveD({ selfOff: d.off ? null : app().ctx().today }); toast(d.off ? 'Отменено' : 'Запомнила: с сегодняшнего дня ваши заходы не считаются'); };
function booksTab(a, M) {
  const { mk, t, main, skip, hasGoals } = M;
  const books = byBook(mk.pages, main, M.titles);
  const totV = books.reduce((s, b) => s + b.book.visits, 0), totC = books.reduce((s, b) => s + b.book.conv, 0);
  const gt = goalTotals30(mk.daily, addDays(t, -29), t), f = funnel(gt, M.m.goals || []);
  const maxN = Math.max(1, ...f.steps.map((x) => x.n));
  return `<div class="card"><h2>Воронка читателя</h2><p class="small muted">За 30 дней по целям Метрики (целевые визиты; один посетитель может совершить несколько визитов).</p>
      ${f.steps.length > 1 ? f.steps.map((x) => `<div class="bar-row"><div class="row between small"><span>${esc(x.name)}${x.goal ? ` <span class="muted">· ${esc(x.goal)}</span>` : ''}</span><span><b>${num(x.n)}</b>${x.rate != null ? ` · ${pct(Math.min(x.rate, 9.99), 0)} от прошлого шага` : ''}</span></div><div class="progress"><i style="width:${(x.n / maxN * 100).toFixed(1)}%"></i></div></div>`).join('')
        + (f.worst ? `<div class="item l-hl"><b>Больше всего теряете на шаге «${esc(f.worst.name)}»: до него доходит ${pct(f.worst.rate, 0)}</b><div class="small">${FUNNEL_TIP[f.worst.id] || ''}</div></div>` : '')
        : '<p class="muted">Отметьте в Настройках цели «Начало чтения», «Добавление в библиотеку», «Начало покупки», «Покупка» — и здесь будет путь читателя по шагам.</p>'}${selfNote(M)}</div>
    <div class="card"><h2>Книги</h2><p class="small muted">По страницам входа за 30 дней. <b>Страница книги</b> — где решают купить; <b>читалка</b> — где продолжают читать: там покупок меньше всегда, это нормально.</p>
      <div class="list">${books.map((b) => {
        const rs = b.title ? royaltyPerSale(M.sales, t, { book: b.title }) : null, ps = rs?.perSale ?? M.perSale;
        return `<div class="item"><div class="row between"><b>${esc(b.title || (b.slug.charAt(0).toUpperCase() + b.slug.slice(1)).replace(/-/g, ' '))}</b><span class="small">${num(b.visits)} входов</span></div>
          <div class="small">Страница книги: ${num(b.book.visits)}${hasGoals && b.book.visits ? ` · покупают ${pct(b.book.cr, 1)} ${vsAvg(b.book.conv, b.book.visits, totC, totV)}` : ''}</div>
          <div class="small muted">Читалка: ${num(b.reader.visits)}${hasGoals && b.reader.visits ? ` · ${pct(b.reader.cr, 1)}` : ''} · отказы: книга ${b.book.bounce != null ? pct(b.book.bounce, 0) : '—'}, читалка ${b.reader.bounce != null ? pct(b.reader.bounce, 0) : '—'}</div>
          ${ps && hasGoals ? `<div class="small muted">Покупка приносит ≈ ${rub(ps, 0)}${rs ? '' : ' (среднее)'} · визит на страницу книги ≈ ${rub((b.book.cr || 0) * ps, 1)}</div>` : ''}
          ${!b.title ? '<div class="small muted">Название не нашлось в «Доходах» — показано по адресу.</div>' : ''}</div>`;
      }).join('') || '<p class="muted">Страниц книг среди страниц входа пока нет.</p>'}</div></div>`;
}

// ---------- Источники и UTM ----------
// Ссылки Литнета и свои метки — одна таблица с деньгами (за 90 дней)
const tableOf = (M) => utmTable(M.mk.utm || [], M.c.settings.direct?.utms || [], M.main, M.perSale, litrefRows(M.mk.litref || [], M.main, M.titles));
function srcTab(a, M) {
  const { mk, main, hasGoals } = M;
  const totV = (mk.sources || []).reduce((s, x) => s + x.visits, 0) || 1, totC = (mk.sources || []).reduce((s, x) => s + reach(x, main), 0);
  const rows = tableOf(M);
  const cards = [...new Set([...(mk.pages || []).map((p) => String(p.key || '')).filter((u) => litnetPage(u).type === 'book').map((u) => u.replace(/[?#].*$/, '')), ...siteBooks().filter((b) => !b.hidden).map((b) => b.page)])];
  const u = a.ui.utm || {};
  return `<div class="card"><h2>Откуда приходят читатели</h2><p class="small muted">За 30 дней. «Чаще/реже среднего» — только если разница не случайна по статистике.</p>
      <div class="list">${(mk.sources || []).map((x) => `<div class="item"><div class="row between"><b>${esc(x.name)}</b><span class="small">${num(x.visits)} · ${pct(x.visits / totV, 0)}</span></div>
        <div class="progress"><i style="width:${(x.visits / totV * 100).toFixed(1)}%"></i></div>
        <div class="small muted">отказы ${pct(x.bounce, 0)} · время ${mmss(x.dur)}${hasGoals ? ` · ${esc(M.goalName)}: ${num(reach(x, main))} (${pct(crOf(x, main) || 0, 1)})` : ''} ${hasGoals ? vsAvg(reach(x, main), x.visits, totC, totV) : ''}</div></div>`).join('') || `<p class="muted">Метрика не отдала источники${(mk.errors || [])[0] ? ': ' + esc(mk.errors[0]) : ''}. Нажмите ↻ вверху.</p>`}</div></div>
    <div class="card"><h2>Ссылки и метки</h2>
      <p class="small">Здесь видно, какая ссылка приводит покупателей и окупилось ли платное продвижение. Визиты и покупки — по Метрике за 90 дней.</p>
      <form data-form="an.ref" class="settings-form">
        <label>Ссылка для продвижения из кабинета Литнета</label><input name="ref" placeholder="https://litnet.com/ref/…" required>
        <div class="f2"><div><label>Название (необязательно)</label><input name="name" placeholder="Реклама на Литнете, октябрь"></div>
          <div><label>Сколько заплатили, ₽</label><input name="cost" inputmode="decimal"></div></div>
        <div class="row d-save"><button class="primary" type="submit">Добавить</button></div></form>
      <p class="small muted">Ссылки Литнета, по которым уже приходили читатели, приложение находит само — их нужно только добавить с расходом. «Новых читателей» в кабинете Литнета и визиты здесь считаются по-разному, цифры не совпадут — это нормально.</p>
      ${rows.length ? `<div class="list">${rows.map((x, i) => `<div class="item"><div class="row between"><b>${esc(x.label)}</b><span class="small">${num(x.visits)} визитов</span></div>
        <div class="small">${hasGoals ? `покупок ${num(x.conv)}${x.cr != null ? ` (${pct(x.cr, 1)})` : ''}` : ''}${x.cost ? ` · расход ${rub(x.cost, 0)}${x.cpa != null ? ` · покупатель ${rub(x.cpa, 0)}` : ''}${x.romi != null ? ` · <span class="${x.romi >= 0 ? 'up' : 'down'}">окупаемость ${x.romi >= 0 ? '+' : ''}${pct(x.romi, 0)}</span>` : ''}` : ''}</div>
        <div class="small muted">${esc([x.source, x.medium, x.campaign].filter(Boolean).join(' / '))}${x.visits && x.visits < MIN_VISITS ? ' · данных пока мало' : ''}</div>
        ${`<div class="row"><button class="link" data-act="an.cost" data-i="${i}">${x.cost ? 'Изменить расход' : 'Указать расход'}</button>${x.saved ? `<button class="link danger" data-act="an.del" data-id="${esc(x.saved.id)}">Убрать</button>` : ''}</div>`}</div>`).join('')}</div>` : '<p class="muted">Пока пусто: Метрика ещё не видела переходов по ссылкам Литнета и своим меткам.</p>'}

      <details class="d-more"${u.link ? ' open' : ''}><summary>Своя метка для соцсетей, рассылки, блога</summary>
      <p class="small">Метка — хвост ссылки, по которому Метрика понимает, откуда пришёл читатель: какой пост, канал или рассылка.</p>
      <form data-form="an.utm" class="settings-form">
        <label>Куда ведёт ссылка</label><input name="url" list="anCards" value="${esc(u.url || cards[0] || '')}" placeholder="https://litnet.com/ru/book/…" required><datalist id="anCards">${cards.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
        <div class="f2"><div><label>Где публикую</label><select name="place">${Object.entries(UTM_PRESETS).map(([k, v]) => opt(k, v[2], u.place || 'telegram')).join('')}</select></div>
          <div><label>Кампания (книга, акция)</label><input name="campaign" value="${esc(u.campaign || '')}" placeholder="Звериная тропа — старт" required></div></div>
        <div class="f2"><div><label>Вариант (необязательно)</label><input name="content" value="${esc(u.content || '')}" placeholder="пост 1, обложка Б"></div>
          <div><label>Сколько заплатили, ₽ (если платно)</label><input name="cost" inputmode="decimal" value="${esc(u.cost || '')}"></div></div>
        <div class="row d-save"><button class="primary" type="submit">Создать ссылку</button></div></form>
      ${u.link ? `<div class="item l-hl"><div class="small" style="word-break:break-all"><b>${esc(u.link)}</b></div><div class="row dl-row"><button class="dl" data-act="an.copy">${ic('copy')} Скопировать ссылку</button><span class="small up">Метка сохранена — появится в таблице, когда по ней придут читатели.</span></div></div>` : ''}
      </details></div>
    <div class="grid2"><div class="card"><h2>Устройства</h2>${(mk.devices || []).map((x) => `<div class="bar-row"><div class="row between small"><span>${esc(x.name)}</span><span>${num(x.visits)}${hasGoals ? ` · ${pct(crOf(x, main) || 0, 1)}` : ''}</span></div><div class="progress"><i style="width:${(x.visits / Math.max(1, ...mk.devices.map((y) => y.visits)) * 100).toFixed(1)}%"></i></div></div>`).join('') || '<p class="muted">Нет данных.</p>'}</div>
      <div class="card"><h2>Поисковики и сайты</h2>${(mk.engines || []).slice(0, 8).map((x) => `<div class="row between small"><span>${esc(x.name)}</span><span>${num(x.visits)}${hasGoals ? ` · ${pct(crOf(x, main) || 0, 1)}` : ''}</span></div>`).join('') || '<p class="muted">Нет данных.</p>'}</div></div>`;
}
forms['an.utm'] = async (fd) => {
  const [source, medium, label] = UTM_PRESETS[fd.get('place')] || UTM_PRESETS.other;
  const v = { url: fd.get('url').trim(), place: fd.get('place'), campaign: fd.get('campaign').trim(), content: fd.get('content').trim(), cost: N(fd.get('cost')) };
  const link = buildUtm(v.url, { source, medium, campaign: v.campaign, content: v.content });
  if (!link) { toast('Ссылка должна начинаться с https://'); return; }
  const utms = app().ctx().settings.direct?.utms || [];
  app().ui.utm = { ...v, link };
  await saveD({ utms: [...utms, { id: uid(), label: `${label}: ${v.campaign}${v.content ? ' · ' + v.content : ''}`, url: link, source, medium, campaign: v.campaign, content: v.content, cost: v.cost || 0, at: app().ctx().today }] });
  try { await navigator.clipboard.writeText(link); toast('Ссылка создана и скопирована'); } catch { toast('Ссылка создана'); }
  app().rerender();
};
forms['an.ref'] = async (fd) => {
  const code = litrefOf(fd.get('ref').trim());
  if (!code) { toast('Нужна ссылка вида https://litnet.com/ref/…'); return; }
  const utms = app().ctx().settings.direct?.utms || [];
  if (utms.some((x) => x.litref?.toLowerCase() === code.toLowerCase())) { toast('Эта ссылка уже добавлена'); return; }
  const found = litrefRows(model(app()).mk.litref || [], [], model(app()).titles).find((r) => r.code.toLowerCase() === code.toLowerCase());
  const label = fd.get('name').trim() || `Ссылка Литнета: ${found?.title || (found?.slug ? found.slug.charAt(0).toUpperCase() + found.slug.slice(1).replace(/-/g, ' ') : code)}`;
  await saveD({ utms: [...utms, { id: uid(), label, litref: code, cost: N(fd.get('cost')) || 0, at: app().ctx().today }] });
  toast('Добавлено — визиты и покупки по ссылке будут в таблице');
};
acts['an.copy'] = async () => { try { await navigator.clipboard.writeText(app().ui.utm.link); toast('Скопировано'); } catch { toast('Не получилось скопировать'); } return false; };
acts['an.del'] = async (d) => { await saveD({ utms: (app().ctx().settings.direct?.utms || []).filter((x) => x.id !== d.id) }); };
acts['an.cost'] = (d) => {
  const row = tableOf(model(app()))[Number(d.i)];
  openSheet('Расход на размещение', `<p class="small">${esc(row.label)}</p><label>Сколько заплатили, ₽</label><input name="v" inputmode="decimal" value="${esc(row.cost || '')}">`, async (fd) => {
    const v = N(fd.get('v')) || 0;
    const utms = app().ctx().settings.direct?.utms || [];
    // найденная сама ссылка (ещё не сохранена) — сохраняем вместе с расходом
    await saveD({ utms: row.saved ? utms.map((x) => (x.id === row.saved.id ? { ...x, cost: v } : x)) : [...utms, { id: uid(), label: row.label, ...(row.litref ? { litref: row.litref } : { source: row.source, medium: row.medium, campaign: row.campaign }), cost: v, at: app().ctx().today }] });
  });
  return false;
};

// ---------- Сайт автора (lanafreitag.ru) ----------
const site = { info: null, loading: false };
function siteBooks() {
  if (!site.info && !site.loading) { site.loading = true; loadSite().then((x) => { site.info = x; app().rerender(); }).catch(() => {}).finally(() => { site.loading = false; }); }
  return site.info?.books || [];
}
// статистика сайта загружается сама, когда открыли вкладку и её ещё нет
// и сама обновляется, если данным больше получаса (раз за открытие приложения; «Обновить» — в любой момент)
const siteLoad = { busy: false, tried: false, err: '' };
function loadSiteStats(force) {
  if (siteLoad.busy || (siteLoad.tried && !force)) return;
  siteLoad.busy = siteLoad.tried = true; siteLoad.err = '';
  app().rerender();
  refreshSite(app()).catch((e) => { siteLoad.err = e.message || String(e); }).finally(() => { siteLoad.busy = false; app().rerender(); });
}
acts['site.refresh'] = () => { loadSiteStats(true); return false; };
function siteTab(a) {
  const st = a.snap('site'), t = a.ctx().today, books = siteBooks();
  const st0 = a.snap('site');
  if (st0 && a.ctx().settings.directToken && Date.now() - new Date(st0.at || 0) > 30 * 60000) loadSiteStats();
  const when = siteLoad.busy ? 'обновляю…' : st0?.at ? 'обновлено ' + new Date(st0.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
  const head = `<div class="row between"><h2 style="margin:0">Сайт lanafreitag.ru</h2><span class="row" style="gap:12px"><a class="small" href="${SITE_URL}" target="_blank" rel="noopener">Открыть сайт</a>${a.ctx().settings.directToken ? `<button class="link small" data-act="site.refresh"${siteLoad.busy ? ' disabled' : ''}>Обновить</button>` : ''}</span></div>`;
  if (!st) {
    if (!a.ctx().settings.directToken) return `<div class="card">${head}<p class="muted">Статистика сайта приходит через вход Яндекса — тот же, что для Метрики автора. Войдите в Яндекс в Настройках.</p></div>`;
    loadSiteStats();
    return `<div class="card">${head}<p class="muted">${siteLoad.err ? `Метрика не отдала статистику сайта: ${esc(siteLoad.err)}. Счётчик сайта должен быть в том же аккаунте Яндекса, что и вход здесь.` : 'Загружаю статистику сайта…'}</p></div>`;
  }
  const g = st.goalIds || {}, ids = Object.values(g), y = addDays(t, -1);
  const w = sumDays(st.daily, addDays(y, -6), y), m30 = sumDays(st.daily, addDays(t, -29), t);
  const n = (k, from, to) => (g[k] ? sumDays(st.daily, from, to, [g[k]]).conv : null);
  const tile = (k, label) => { const v7 = n(k, addDays(y, -6), y), v30 = n(k, addDays(t, -29), t); return `<div><div class="k">${label}</div><div class="v">${v7 == null ? '—' : num(v7)}</div><div class="s">${v30 == null ? 'нужна цель в Метрике' : `за 30 дней ${num(v30)}`}</div></div>`; };
  const missing = SITE_GOALS.filter(([k]) => !g[k]);
  const pages = sitePages(st.pages, books, ids), maxP = Math.max(1, ...pages.map((x) => x.visits));
  const readOf = (x) => (g.read ? ` · «Читать» ${num(x.goals?.[g.read] || 0)}` : '');
  const err = siteLoad.err || (st.errors || [])[0];
  return `<div class="card">${head}<p class="small muted">за 7 дней${when ? ' · ' + when : ''}</p>${err ? `<p class="small warnc">Метрика ответила ошибкой: ${esc(err)}. Счётчик сайта должен быть в том же аккаунте Яндекса, что и вход здесь.</p>` : ''}
      <div class="tiles d-tiles">
        <div><div class="k">Посетители</div><div class="v">${num(w.users)}</div><div class="s">визитов ${num(w.visits)} · за 30 дней ${num(m30.users)}</div></div>
        ${tile('read', 'Нажали «Читать»')}${tile('subscribe', 'Подписались')}
        <div><div class="k">Время на сайте</div><div class="v">${mmss(w.dur)}</div><div class="s">${w.bounce == null ? '' : `отказы ${pct(w.bounce, 0)}`}</div></div>
      </div>
      <div class="chart" id="siteChart"></div><div class="chart-cap small muted">Визиты по дням за 30 дней</div></div>
    ${missing.length ? `<div class="card"><h2>Цели в Метрике</h2>
      <p class="small">Чтобы считались ${missing.map(([, n]) => n.toLowerCase()).join(', ')} — один раз добавьте в Метрике цели «JavaScript-событие» с такими идентификаторами:</p>
      <div class="row" style="gap:6px;flex-wrap:wrap">${missing.map(([k]) => `<button class="dl" data-act="site.copyGoal" data-k="${k}">${ic('copy')} ${k}</button>`).join('')}</div>
      <p class="small" style="margin-bottom:0"><a href="https://metrika.yandex.ru/goals?id=${esc(st.counterId || SITE_COUNTER)}" target="_blank" rel="noopener">Открыть цели в Метрике →</a></p></div>` : ''}
    <div class="grid2"><div class="card"><h2>Откуда приходят</h2>${(st.sources || []).map((x) => `<div class="row between small"><span>${esc(x.name)}</span><span>${num(x.visits)}${readOf(x)}</span></div>`).join('') || '<p class="muted">Пока нет посещений.</p>'}
        ${(st.refs || []).length ? `<p class="small muted" style="margin:10px 0 2px">Сайты и поисковики</p>${st.refs.slice(0, 8).map((x) => `<div class="row between small"><span>${esc(x.name)}</span><span>${num(x.visits)}</span></div>`).join('')}` : ''}</div>
      <div class="card"><h2>Первая страница визита</h2>${pages.slice(0, 10).map((x) => `<div class="bar-row"><div class="row between small"><span>${esc(x.name)}</span><span>${num(x.visits)}${readOf(x)}</span></div><div class="progress"><i style="width:${(x.visits / maxP * 100).toFixed(1)}%"></i></div></div>`).join('') || '<p class="muted">Пока нет посещений.</p>'}</div></div>
    <p class="small muted"><a href="${SITE_ADMIN}" target="_blank" rel="noopener">Админка сайта</a> · дела по сайту — в «Мастерской» → Связи → Мой сайт</p>
`;
}
acts['site.copyGoal'] = async (d) => { try { await navigator.clipboard.writeText(d.k); toast('Скопировано: ' + d.k); } catch { toast(d.k); } return false; };

export function analyticsView(a) {
  const c = a.ctx(), m = metrikaOf(c), mk = a.snap('mk');
  const tabsHtml = (tab) => `<div class="lg-tabs an-tabs">${TABS.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-act="an.tab" data-k="${k}">${t}</button>`).join('')}</div>`;
  // ссылки Литнета (персональные и для продвижения) — свои, работают и без Метрики
  if (a.ui.anTab === 'links' || /^\/litnet/.test(a.ui.route || '')) return { html: (m?.counterId ? tabsHtml('links') : '') + litnetView(a).html };
  if (!m?.counterId) return { html: connectCard() };
  if (!mk) return { html: '<div class="card"><h2>Аналитика читателей</h2><p class="muted">Загружаю данные Метрики… Если долго — нажмите ↻ вверху.</p></div>' };
  const M = model(a), tab = TABS.some(([k]) => k === a.ui.anTab) ? a.ui.anTab : (/^\/an\/site/.test(a.ui.route || '') ? 'site' : 'sum'); // из «Мастерской» → Мой сайт → Статистика
  return {
    html: `${demo.on ? '<div class="alert">Это пример — так будет выглядеть аналитика вашего счётчика.</div>' : ''}
    ${tabsHtml(tab)}
    ${tab === 'books' ? booksTab(a, M) : tab === 'src' ? srcTab(a, M) : tab === 'site' ? siteTab(a) : summaryTab(a, M)}
    ${(mk.errors || []).length ? `<p class="small muted">Часть отчётов Метрика не отдала: ${esc(mk.errors[0])}</p>` : ''}`,
    after() {
      const el = document.getElementById('mkChart');
      if (el) lineChart(el, { points: (mk.daily || []).map((x) => ({ label: fmtShort(x.key), value: x.visits })), fmtVal: (v) => num(v), height: 150 });
      const sc = document.getElementById('siteChart'), st = a.snap('site');
      if (sc && st) lineChart(sc, { points: (st.daily || []).map((x) => ({ label: fmtShort(x.key), value: x.visits })), fmtVal: (v) => num(v), height: 150 });
    },
  };
}
acts['an.tab'] = (d) => { app().ui.anTab = d.k; if (/^\/litnet/.test(app().ui.route || '')) app().ui.route = '/an'; };
acts['an.ai'] = () => { sendToChat(packageText(app(), 'Разбери аналитику читателей по Метрике (metrikaSite): воронка, книги (страница книги и читалка отдельно), источники и метки UTM, что усилить, что исправить, что подождать. Конкретные шаги с цифрами и с учётом статистической значимости.'), 'claude'); return false; };
