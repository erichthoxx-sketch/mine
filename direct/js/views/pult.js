// «Пульт» — главная «Директа»: что требует внимания и одна карточка на кампанию (состояние, деньги, цена цели, окупаемость, вывод).
// Расчёты — direct/js/pult.js. Бюджеты приложение не меняет: только подсказывает и даёт кнопки минус-фраз, паузы, привязки счётчика.
import { esc, more, openSheet, ask } from '../../../js/ui.js';
import { rub, num } from '../../../js/format.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { goalsOf, campaignBookLinks, bookOfCampaign, campaignState, campaignEcon, campaignAlerts, weekBudget, campaignLevers, campaignPayback, campaignStage, NEED_BUYS } from '../pult.js';
import { royaltyPerSale, litnetPage } from '../mcalc.js';
import { matchingSaleName } from '../bookeconomics.js';
import { libraryValue } from '../launchcalc.js';
import { placementRows, qualityAlerts } from '../qualitycalc.js';
import { metrikaOf } from './metrika.js';
import { todo } from './home.js';
import { homeView } from './home.js';
import { demo } from '../demo.js';
import { diagStrip } from './diagnose.js';
import { actBtn, q } from './common.js';
import { ic } from '../../../js/icons.js';
import { litTagInfo } from '../../../js/littag.js';
import { weekKeyOf } from '../weekreview.js';
import { approvalQueue, retargetItems, newAdItems, winnerQueryItems, litTagItems } from '../autorules.js';
import { spoilerHits, spoilerList } from '../../../js/spoilers.js';
import { execPlan, lastPlanErrors } from '../sync.js';
import { resolvedLaunches, goalSwitch, siteBooks } from './launchctx.js';
import { acts, toast } from '../../../js/ui.js';
import { syncWatch } from '../watch.js';
import { changes } from '../../../js/ui.js';
import { conversionEvidence } from '../evidence.js';

const TONE = { good: 'up', bad: 'down', warn: 'warnc', even: '', wait: 'muted', muted: 'muted' };
const ORDER = { idle: 0, rejected: 0, capped: 1, on: 2, soon: 3, moderation: 4, stopped: 5, draft: 6, ended: 7, archived: 8 };

// Всё, что нужно для расчёта по кампаниям — один раз на экран
export function pultModel(a) {
  const c = a.ctx(), main = a.snap('main') || {}, stats = a.snap('stats') || {}, cohorts = a.snap('cohorts');
  const t = c.today, m = metrikaOf(c) || {}, skip = outageSet(c.data.days || []);
  const daily = stats.daily || [], conv = stats.conv || [], ads = main.ads || [];
  const ev = conversionEvidence(stats, t);
  const links = campaignBookLinks(c);
  const cohortsReady = !demo.on && !c.settings.direct?.sandbox && !c.settings.direct?.cohortsErr && cohorts?.to >= addDays(t, -3) && cohorts.to < t;
  const rows = (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED').map((camp) => {
    const goals = goalsOf(m, camp), book = bookOfCampaign(camp, ads, c.data.w_books || [], links);
    const saleName = matchingSaleName(book?.title, c.data.sales);
    const sold = saleName ? royaltyPerSale(c.data.sales || [], t, { book: saleName }) : null;
    const landingId = litnetPage(book?.href).bookId;
    const mature = cohortsReady && landingId ? cohorts.campBooks?.[camp.id]?.[landingId]?.libToBuy?.[30] : null;
    const lv = libraryValue({ royalty: sold?.perSale, cohortRate: mature?.rate, cohortEligible: mature?.eligible });
    const verified = ev.ready && (!m.counterId || !camp.counters || camp.counters.map(String).includes(String(m.counterId))) &&
      (!stats.goalIds || [goals.lib, ...goals.buy].filter(Boolean).every((id) => stats.goalIds.includes(id)));
    const perSale = sold?.qty >= 5 ? sold.perSale : null;
    const st = campaignState(camp, { daily, ads, today: t });
    const econ = campaignEcon(camp, { daily, conv, today: t, goals, perSale, libShare: lv?.share ?? null, skip, convVerified: verified });
    const wk0 = weekBudget(camp, daily, t);
    // старт подписки книги: Мастерская («О книге») или сайт
    const wb = book ? (c.data.w_books || []).find((x) => x.id === book.id) : null, sbk = book && !demo.on ? siteBooks(a).find((x) => String(x.title || '').toLowerCase() === String(book.title || '').toLowerCase()) : null;
    const subStart = wb?.subStart || sbk?.startDate || '';
    const stage = campaignStage(camp, { econ, st, goals, conv, today: t, subStart, perSale, skip, convVerified: verified, wk: wk0 });
    return { camp, goals, book, st, econ, perSale, stage, subStart, convReady: verified && econ.usable, pay: campaignPayback(camp, { daily, conv, today: t, goals, perSale, libValue: econ.libValue, skip, convVerified: verified }), wk: wk0, lev: campaignLevers(camp, st, { ...econ, libValue: null }, wk0, { ads, daily, today: t }), alerts: campaignAlerts(camp, st, econ, { daily, conv, today: t, goals }) };
  }).sort((x, y) => (ORDER[x.st.key] ?? 9) - (ORDER[y.st.key] ?? 9));
  return { c, main, stats, m, rows, conversionEvidence: ev };
}

const money = (v) => (v == null ? '—' : rub(v, 0));
// «Этап и следующий шаг»: одна мысль, одно действие, условия — галочками; вторая кампания — одной строкой
function stageHtml(r) {
  const g = r.stage, act = g.next?.act === 'goal' ? readyGoalActs(window.__app).find((x) => x.campaign === r.camp.id) : null;
  // на виду — этап, следующий шаг и шкалы; рассуждения таргетолога — по «почему так» (её просьба: «минималистично, без стены текста»)
  return `<div class="pult-stage"><div class="row between" style="gap:10px;align-items:baseline"><b>${esc(g.title)}</b><span class="small muted">этап</span></div>
    <div class="pult-next"><div style="min-width:0"><span class="small muted">Следующий шаг</span><div><b>${esc(g.next.what)}</b></div></div>${act ? actBtn(act, 'Сменить цель', 'primary') : ''}</div>
    ${priceHtml(g)}</div>`;
}
// Цена цели и «когда на покупки» — наглядно: полоска до 10 покупок в неделю и шкала цены; объяснения — по «почему» (её просьба: «минималистично, наглядно»)
export function priceHtml(g) {
  const P = g.price, E = g.eta;
  if (!P && !E) return g.text ? `<button class="link small gp-why" data-act="gp.why" data-t="${esc([g.text, g.next?.why, g.second].filter(Boolean).join('\n'))}">почему так</button>` : '';
  const why = [g.text, ...(g.checks || []).map((x) => `${x.ok ? '✓' : '○'} ${x.text}`), g.next?.why ? `Следующий шаг: ${g.next.what} — ${g.next.why}.` : '', E?.text, P?.ready ? P.text : P?.why, P?.ready ? P.why : '', P?.forBuy ? `Когда переключите на покупку — ставьте ≈ ${P.forBuy.rec} ₽ за покупку (предел ${P.forBuy.max} ₽).` : '', g.second ? `Вторая кампания. ${g.second}` : ''].filter(Boolean).join('\n');
  const bar = E && E.val != null ? (() => { const v = Math.max(0, E.val), w = Math.min(100, v / NEED_BUYS * 100);
    return `<div class="gp-l"><span>Покупок в неделю</span><b>${(Math.round(v * 10) / 10).toString().replace('.', ',')} из ${NEED_BUYS}</b></div>
      <div class="gp-bar${E.k === 'now' ? ' ok' : ''}"><i style="width:${w.toFixed(1)}%"></i></div><div class="gp-s ${E.k === 'now' ? 'up' : ''}">${E.pre ? 'ожидаю после открытия подписки · ' : ''}${esc(E.brief)}</div>`; })()
    : E ? `<div class="gp-l"><span>На покупку</span><b>${esc(E.brief)}</b></div>` : '';
  const scale = P?.ready ? (() => { const top = Math.max(P.max * 1.3, (P.now || 0) * 1.1, (P.fact || 0) * 1.1), X = (v) => Math.min(100, v / top * 100).toFixed(1);
    const mk = (v, cls, label) => (v == null ? '' : `<span class="gp-m ${cls}" style="left:${X(v)}%"><i></i><em>${label} ${v}</em></span>`);
    return `<div class="gp-l"><span>Цена цели · ${P.onBuy ? 'покупка' : 'добавление'}</span><b class="${P.k === 'down' ? 'down' : P.k === 'up' ? 'up' : ''}">${esc(P.brief)}</b></div>
      <div class="gp-sc"><div class="gp-ok" style="width:${X(P.max)}%"></div>${mk(P.rec, 'rec', 'совет')}${mk(P.now, 'now', 'сейчас')}${mk(P.max, 'max', 'предел')}</div>
      <div class="gp-s muted">${P.fact != null ? `фактически выходит ${P.fact} ₽` : ''}</div>`; })() : P ? `<div class="gp-l"><span>Цена цели</span><b class="muted">нужны данные</b></div>` : '';
  return `<div class="pult-gp">${bar}${scale}<button class="link small gp-why" data-act="gp.why" data-t="${esc(why)}">почему так</button></div>`;
}
acts['gp.why'] = (d) => { openSheet('Почему так', d.t.split('\n').map((x) => `<p style="margin:0 0 10px">${esc(x)}</p>`).join('') + '<p class="small muted">Знаки «?» в Диагнозе объясняют каждую цифру подробнее.</p>', null); return false; };
// Смену цели предлагаем, только когда покупок с рекламы хватает для обучения (этап «switch» с NEED_BUYS за 7 дней)
export function readyGoalActs(a) {
  if (demo.on) return [];
  let acts0 = []; try { acts0 = resolvedLaunches(a).map((L) => goalSwitch(L.plan)).filter(Boolean); } catch { return []; }
  if (!acts0.length) return [];
  const rows = pultModel(a).rows;
  return acts0.filter((x) => { const r = rows.find((y) => y.camp.id === x.campaign); return r?.stage?.key === 'switch' && r.stage.buy7 >= NEED_BUYS; });
}
function card(r) {
  const { camp, book, st, econ: e, wk, lev, pay } = r;
  const tile = (k, v, s = '') => `<div><div class="k">${k}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  return `<div class="card pult-c"><div class="row between"><a href="#" data-act="go" data-to="/c/${camp.id}"><h2 style="margin:0">${esc(book?.title ? `«${book.title}»` : camp.name)}</h2></a><span class="small ${TONE[st.tone]}">● ${esc(st.text)}</span></div>
    ${book?.title ? `<div class="small muted">${esc(camp.name)}</div>` : ''}
    ${diagStrip(window.__app, r)}
    <div class="tiles d-tiles">
      ${tile('Сегодня', money(e.today.cost), `за 7 дней ${money(e.d7.cost)}`)}
      ${wk ? tile('Неделя', `${money(wk.spent)}`, `из ${money(wk.limit)}`) : tile('30 дней', money(e.d30.cost), `кликов ${num(e.d30.clicks)}`)}
      ${tile('В библиотеку', e.lib30 == null ? '—' : num(e.lib30), e.cpaLib != null ? `по ${money(e.cpaLib)}${e.target ? ` · цель ${money(e.target)}` : ''}` : 'за 30 дней')}
      ${tile('Покупки', e.buy30 == null ? '—' : num(e.buy30), e.cpaBuy != null ? `по ${money(e.cpaBuy)}` : 'за 30 дней')}
    </div>
    ${wk ? `<div class="progress ${wk.share >= 0.9 ? 'warn' : ''}"><i style="width:${Math.min(100, wk.share * 100).toFixed(1)}%"></i></div>` : ''}
    <p class="small ${TONE[e.verdict.kind]}" style="margin:10px 0 0">${esc(e.verdict.text.charAt(0).toUpperCase() + e.verdict.text.slice(1))}${e.revenue != null && e.buy30 ? ` · роялти с покупок ≈ ${money(e.revenue)}` : ''}</p>
    ${e.libValue != null && r.perSale ? `<p class="small muted" style="margin:4px 0 0">≈ ${money(e.libValue)} за добавление — это оценка, а не деньги этой кампании: среднее роялти по книге × ${Math.round(e.libShare * 100)} % купивших в течение 30 дней после добавления. Учтены читательницы, пришедшие на эту книгу из кампании. Цель покупки может относиться и к другой книге автора.</p>` : ''}
    ${pay && pay.total != null ? `<p class="small" style="margin:6px 0 0"><b>С начала (${pay.days} дн.):</b> потрачено ${money(pay.cost)} · вернулось с покупок ${money(pay.back || 0)} → <span class="${pay.ret >= 1 ? 'up' : 'warnc'}">атрибутированные покупки: на 1 ₽ ≈ ${pay.ret.toFixed(2).replace('.', ',')} ₽ (оценка по средней цене продажи, не прибыль)</span></p>` : ''}
    ${r.stage ? stageHtml(r) : ''}
    ${lev?.forecast ? `<p class="small muted" style="margin:4px 0 0">При таком темпе за неделю: ≈ ${num(Math.round(lev.forecast.lib))} добавлений за ${money(lev.forecast.cost)}${lev.forecast.royalty != null ? ` → ожидаемое роялти ≈ ${money(lev.forecast.royalty)}` : ''}</p>` : ''}
    ${lev?.levers.length ? `<div class="pult-lev"><div class="small muted" style="margin:12px 0 2px">Как заработать больше</div>${more('lev-' + camp.id, lev.levers.map((x, i) => `<div class="item"><b>${i + 1}. ${esc(x.title)}</b><div class="small muted">${esc(x.how)}</div></div>`), 2)}</div>` : ''}
    <div class="row dl-row"><button class="dl" data-act="go" data-to="/c/${camp.id}">Открыть кампанию</button>${book?.id ? `<button class="dl" data-act="go" data-to="/book/${esc(book.id)}">Книга</button>` : ''}</div></div>`;
}

function syncStatus(a, M) {
  const { c, stats } = M, d = c.settings.direct || {}, sales = c.data.sales || [];
  const mk = a.snap('mk');
  const time = (iso) => iso ? new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ожидает загрузки';
  const lastSale = sales.reduce((last, row) => row.date > last ? row.date : last, '');
  const lines = [
    ['Расход', d.lastError ? d.lastError.text : time(stats.at)],
    ['Цели рекламы', M.conversionEvidence.ready ? time(stats.mAt) : M.conversionEvidence.reason],
    ['Метрика автора', d.metrikaError || mk?.errors?.[0] || time(mk?.at)],
    ['Передача в «Доходы»', stats.incomeError || (d.sandbox ? 'Песочница' : time(stats.incomeAt))],
    ['Продажи из «Доходов»', lastSale ? 'последняя дата продаж ' + lastSale.split('-').reverse().join('.') : 'нет загруженных продаж'],
  ];
  return `<details class="card"><summary>Синхронизация данных</summary><div class="list">${lines.map(([name, value]) => `<div class="item"><b>${esc(name)}</b><div class="small muted">${esc(value)}</div></div>`).join('')}</div></details>`;
}

export function pultView(a) {
  const c = a.ctx(), main = a.snap('main');
  if (!main) return homeView(a); // подключение, пример, загрузка — как раньше
  const M = pultModel(a), stats = M.stats;
  // требует внимания: состояние кампаний, цена цели, площадки-сливы, потом общие подсказки (минус-слова, фразы без покупок, выгорание…)
  const alerts = M.rows.flatMap((r) => r.alerts).map((x) => `<div class="item"><b class="${TONE[x.tone]}">${esc(x.title)}</b><div class="small muted">${esc(x.how)}</div></div>`);
  const flags = qualityAlerts(placementRows(stats.placementErr || !M.conversionEvidence.ready ? [] : stats.placements || [], main.campaigns || []), { maxItems: 3 })
    .map((x) => `<div class="item"><b>Площадка ${esc(x.place)}: отказы ${Math.round(x.bounce)} %</b><div class="small muted">${num(x.clicks)} кликов, ${rub(x.cost, 0)} за 30 дней. Если по ней нет добавлений — исключите её в кабинете Директа: настройки кампании → «Запрещённые площадки».</div></div>`);
  // «Требует внимания» — только то, где нужно действие; удачные фразы — не тревога
  // метка «Мой Литнет»: за 2 дня до конца срока (меняется одной кнопкой в Мастерской → Сайт — сразу и на сайте, и в Директе)
  const lt = litTagInfo(c.settings, c.today);
  const ltTask = lt?.soon ? [`<div class="item"><b class="${lt.late ? 'down' : 'warnc'}">${lt.late ? 'Метка Литнета истекла' : `Метка Литнета действует до ${lt.until.slice(8, 10)}.${lt.until.slice(5, 7)}`}</b><div class="small muted">Создайте новую ссылку в «Мой Литнет» и вставьте её в <a href="../workshop/#/site">Мастерской → Сайт → «Новая метка»</a> — она встанет и на сайт, и в кампании.</div></div>`] : [];
  // разбор недели: с понедельника, пока не нажала «Разобрала»
  const wkOpen = (c.settings.direct?.weekDone || '') !== weekKeyOf(c.today) && M.rows.some((r) => ['on', 'capped'].includes(r.st.key) && r.econ.ran >= 2);
  const tasks = [...ltTask, ...alerts, ...flags, ...todo(main, stats, c).filter((x) => !x.includes('d-good'))];
  const live = M.rows.filter((r) => !['draft', 'ended', 'stopped'].includes(r.st.key));
  const rest = M.rows.filter((r) => !live.includes(r));
  return {
    html: `${!M.m?.counterId ? `<div class="alert">Подключите Метрику автора (⚙ Настройки) — без неё не видно добавлений в библиотеку и покупок, а значит, и окупаемости.</div>` : ''}
    ${!demo.on ? syncStatus(a, M) : ''}
    ${todayCard(a, M, tasks, wkOpen)}
    ${live.map(card).join('') || '<div class="card"><p class="muted">Сейчас нет идущих кампаний.</p></div>'}
    ${rest.length ? `<div class="card"><h2>Остальные кампании</h2><div class="list">${rest.map((r) => `<a class="item" href="#" data-act="go" data-to="/c/${r.camp.id}"><div class="row between"><b>${esc(r.camp.name)}</b><span class="small muted">${esc(r.st.text)}</span></div>${r.econ.d30.cost ? `<div class="small muted">за 30 дней ${money(r.econ.d30.cost)}${r.econ.lib30 ? ` · в библиотеку ${num(r.econ.lib30)}` : ''}</div>` : ''}</a>`).join('')}</div></div>` : ''}
    ${autoCard(c)}
    <div class="row dl-row"><button class="dl" data-act="go" data-to="/week">Разбор недели</button><button class="dl" data-act="go" data-to="/hooks">Крючки</button><button class="dl" data-act="go" data-to="/an">Читатели (Метрика)</button><button class="dl" data-act="go" data-to="/books">Книги</button><button class="dl" data-act="go" data-to="/quality">Качество трафика</button><button class="dl" data-act="go" data-to="/log">Что меняли</button><button class="dl" data-act="ai.dl">${ic('download')} Для нейросети</button></div>
    ${cohortLine(c.settings.direct || {})}`,
  };
}

// «Что сделать сегодня» — одним списком (13.11.2026, её «да»): разбор недели, следующий шаг каждой кампании, тревоги и предложения с галочками
function todayCard(a, M, tasks, wkOpen) {
  const q = queueOf(a), ready = readyGoalActs(a);
  // то, что есть в предложениях с галочкой, второй раз тревогой не показываем
  const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ');
  const keys = q.map((x) => { const t = String(x.text || ''), i = t.indexOf(': '); return (i > 0 ? t.slice(i + 2) : t).slice(0, 40); }).filter((k) => k.length >= 12);
  const starterQ = q.some((x) => /базовые минус-слова/i.test(x.text || ''));
  tasks = tasks.filter((h) => { const t = plain(h); return !keys.some((k) => t.includes(k)) && !(starterQ && /нет стартовых минус-слов/i.test(t)); });
  const steps = M.rows.filter((r) => r.stage?.next && !['draft', 'ended', 'stopped'].includes(r.st.key)).map((r) => {
    const act = r.stage.next.act === 'goal' ? ready.find((x) => x.campaign === r.camp.id) : null;
    return `<div class="item"><div class="row between" style="gap:12px;align-items:flex-start"><div style="min-width:0"><span class="small muted">${esc(r.book?.title ? `«${r.book.title}»` : r.camp.name)} · ${esc(r.stage.title.toLowerCase())}</span><div><b>${esc(r.stage.next.what)}</b></div><div class="small muted">${esc(r.stage.next.why)}</div></div>${act ? actBtn(act, 'Сменить цель', 'primary') : ''}</div></div>`;
  });
  const week = wkOpen ? [`<div class="item"><div class="row between" style="gap:12px"><div><b>Разобрать неделю</b><div class="small muted">Итог против прошлой недели, воронка, объявления, запросы, площадки — и что поменять</div></div><button class="small-btn" data-act="go" data-to="/week">Открыть</button></div></div>`] : [];
  const n = week.length + steps.length + tasks.length + q.length;
  const sec = (t) => `<div class="mk-sub">${t}</div>`;
  return `<div class="card" id="pq"><div class="row between"><h2 style="margin:0">Что сделать сегодня</h2><span class="small muted">${n ? num(n) : 'всё спокойно'}</span></div>
    ${!n ? '<p class="small muted" style="margin:8px 0 0">Ничего срочного. Приложение само проверяет кампании при каждом обновлении — раз в 15 минут, пока открыто.</p>' : ''}
    ${week.length || steps.length ? sec('Шаги кампаний') + `<div class="list">${[...week, ...steps].join('')}</div>` : ''}
    ${tasks.length ? sec('Требует внимания') + `<div class="list">${more('pult-todo', tasks, 4)}</div>` : ''}
    ${q.length ? sec('Могу сделать сама — отметьте нужное') + `<div class="list">${q.map((x) => `<label class="item d-check" style="display:flex;gap:12px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-pq="${esc(x.key)}" style="margin-top:4px">
      <span><b>${esc(x.text.charAt(0).toUpperCase() + x.text.slice(1))}</b><span class="small muted" style="display:block">${x.camp ? `«${esc(x.camp)}» · ` : ''}${esc(x.why)}</span></span></label>`).join('')}</div>
      <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap"><button class="primary" data-act="pq.yes">Применить отмеченное</button><button class="small-btn" data-act="pq.no">Отмеченное — не надо</button></div>
      <p class="small muted" style="margin:8px 0 0">Цену цели и бюджет ничто из этого не меняет; всё записывается в «Что меняли».</p>` : ''}</div>`;
}
// Очередь предложений: всё, что приложение может сделать в кабинете само, — списком с галочками. Отмеченное — «Применить» или «Не надо».
function queueOf(a) {
  const c = a.ctx(), d = c.settings.direct || {}, main = a.snap('main') || {};
  let goalActs = [];
  goalActs = readyGoalActs(a);
  const wbooks = c.data.w_books || [], extra = demo.on ? [] : [
    ...litTagItems({ main, code: c.settings.litTag?.code || '', late: !!litTagInfo(c.settings, c.today)?.late }),
    ...winnerQueryItems({ main, stats: a.snap('stats') || {}, goals: goalsOf(metrikaOf(c) || {}) }),
    ...retargetItems({ main, goals: goalsOf(metrikaOf(c) || {}), saved: d.retarget || {}, buys: Object.fromEntries(pultModel(a).rows.map((r) => [r.camp.id, r.stage?.buy7 ?? 0])) }),
    ...newAdItems({ main, bookOf: (camp) => { const b = bookOfCampaign(camp, main.ads || [], wbooks, campaignBookLinks(c)); return b ? wbooks.find((x) => x.id === b.id) : null; }, hits: (t, wb) => spoilerHits(t, spoilerList(wb)) }),
  ];
  return approvalQueue({ main, stats: a.snap('stats') || {}, on: { minus: true, places: true, fatigue: true }, today: c.today, goalActs, done: d.autoDone || [], no: d.queueNo || [], extra });
}
const pqPicked = () => new Set([...document.querySelectorAll('#pq input[data-pq]:checked')].map((x) => x.dataset.pq));
let pqBusy = false;
acts['pq.yes'] = async (d0, el) => {
  const a = window.__app, pick = pqPicked(), plan = queueOf(a).filter((x) => pick.has(x.key));
  if (!plan.length) { toast(pick.size ? 'Это предложение уже неактуально — обновите страницу' : 'Ничего не отмечено'); return false; }
  if (demo.on) { toast('Это пример данных — в настоящем кабинете действия выполнятся'); return false; }
  if (pqBusy) { toast('Уже отправляю в Директ — подождите'); return false; }
  pqBusy = true;
  // сразу видно, что нажалось (19.11.2026: «кнопка не нажимается» — ответа Директа не было видно); не дольше минуты
  const btn = el?.closest?.('button') || el; if (btn) { btn.disabled = true; btn.textContent = 'Отправляю в Директ…'; }
  try {
    const goals = plan.filter((x) => x.rule === 'goal');
    if (goals.length && !(await ask('Подтвердить смену цели в Яндекс Директе? ' + goals.map((x) => x.text).join('. '), 'Подтвердить смену цели'))) return false;
    const done = await execPlan(a, plan, 'app'), n = plan.filter((x) => done.includes(x.key)).length, d = a.ctx().settings.direct || {};
    if (done.length) await a.store.saveSettings({ direct: { ...d, autoDone: [...(d.autoDone || []), ...done].slice(-400) } });
    toast(n === plan.length ? `Готово: сделано ${n} — всё записано в «Что меняли»` : `Сделано ${n} из ${plan.length}. Остальное Директ не принял${lastPlanErrors[0] ? `: ${lastPlanErrors[0]}` : ''}`);
  } catch (e) { toast(`Не получилось: ${e.message || e}. Проверьте «Что меняли» чуть позже.`); }
  finally { pqBusy = false; if (btn?.isConnected) { btn.disabled = false; btn.textContent = 'Применить отмеченное'; } a.rerender(); }
  return false;
};
acts['pq.no'] = async () => {
  const a = window.__app, pick = [...pqPicked()], d = a.ctx().settings.direct || {}, was = d.queueNo || [];
  if (!pick.length) { toast('Ничего не отмечено'); return false; }
  await a.store.saveSettings({ direct: { ...d, queueNo: [...was, ...pick].slice(-400) } });
  toast(`Убрала ${pick.length} — больше не предложу`, { undo: () => a.store.saveSettings({ direct: { ...(a.ctx().settings.direct || {}), queueNo: was } }) });
};

// Когорты для нейросети (Logs API Метрики, js/cohorts.js): когда обновились или почему нет
function cohortLine(d) {
  if (!d.cohortsAt) return '';
  const when = new Date(d.cohortsAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  return `<p class="small ${d.cohortsErr ? 'warnc' : 'muted'}" style="margin:10px 0 0">${d.cohortsErr ? `Когорты для нейросети не выгрузились (${esc(when)}): ${esc(d.cohortsErr)}` : `Когорты для нейросети обновлены ${esc(when)}`}</p>`;
}

// «Автоправила»: что приложение делает в кабинете само. Каждое — своей галочкой; цену цели и бюджет не меняет ни одно.
function autoCard(c) {
  const d = c.settings.direct || {}, on = d.auto || {};
  return `<div class="card"><h2>Контроль кампаний</h2>
    <p class="small muted">Изменения на основе отчётов доступны на вкладке «Диагноз» каждой кампании.</p>
    <label class="d-check" style="display:flex;gap:10px;align-items:flex-start;margin:10px 0"><input type="checkbox" data-chg="ar.set" data-k="watch"${on.watch ? ' checked' : ''}> <span><b>Круглосуточный сторож — письмо, если что-то сломалось</b><span class="small muted" style="display:block">${on.watch && d.watchInfo?.old ? 'Не включился: обновите программу сервиса писем (Мастерская → Сайт → Почта → «Скопировать программу») и поставьте галочку ещё раз.' : on.watch && d.watchInfo?.err ? esc('Сервис ответил: ' + d.watchInfo.err) : on.watch ? `Работает${d.watchInfo?.at ? ` · проверял ${new Date(d.watchInfo.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}${(d.watchInfo?.last || []).length ? ` · ${esc(d.watchInfo.last[0])}` : ''}` : 'Раз в 3 часа ваш сервис писем проверяет кампании и пишет, если показы пропали, кампания остановилась или объявление отклонено. Ключ Директа для этого хранится в вашем Яндекс Облаке.'}</span></span></label>
    </div>`;
}
changes['ar.set'] = async (v, el) => { const a = window.__app, d = a.ctx().settings.direct || {}; await a.store.saveSettings({ direct: { ...d, auto: { ...(d.auto || {}), [el.dataset.k]: !!el.checked } } }); if (el.dataset.k === 'watch') syncWatch(a, { force: true }).catch(() => {}); };
