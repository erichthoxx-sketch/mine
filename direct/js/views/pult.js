// «Пульт» — главная «Директа»: что требует внимания и одна карточка на кампанию (состояние, деньги, цена цели, окупаемость, вывод).
// Расчёты — direct/js/pult.js. Бюджеты приложение не меняет: только подсказывает и даёт кнопки минус-фраз, паузы, привязки счётчика.
import { esc, more } from '../../../js/ui.js';
import { rub, num } from '../../../js/format.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { goalsOf, bookOfCampaign, campaignState, campaignEcon, campaignAlerts, weekBudget, campaignLevers, campaignPayback, campaignStage, NEED_BUYS } from '../pult.js';
import { royaltyPerSale, goalTotals30 } from '../mcalc.js';
import { libraryValue } from '../launchcalc.js';
import { placementRows, qualityAlerts } from '../qualitycalc.js';
import { metrikaOf } from './metrika.js';
import { todo } from './home.js';
import { homeView } from './home.js';
import { demo } from '../demo.js';
import { actBtn } from './common.js';
import { ic } from '../../../js/icons.js';
import { litTagInfo } from '../../../js/littag.js';
import { weekKeyOf } from '../weekreview.js';
import { AUTO_RULES, approvalQueue, retargetItems, newAdItems, winnerQueryItems, litTagItems } from '../autorules.js';
import { spoilerHits, spoilerList } from '../../../js/spoilers.js';
import { execPlan, lastPlanErrors } from '../sync.js';
import { starterMinusMissing } from '../dcalc.js';
import { resolvedLaunches, goalSwitch, siteBooks } from './launchctx.js';
import { acts, toast } from '../../../js/ui.js';
import { syncWatch } from '../watch.js';
import { changes } from '../../../js/ui.js';

const TONE = { good: 'up', bad: 'down', warn: 'warnc', even: '', wait: 'muted', muted: 'muted' };
const ORDER = { idle: 0, rejected: 0, capped: 1, on: 2, soon: 3, moderation: 4, stopped: 5, draft: 6, ended: 7, archived: 8 };

// Всё, что нужно для расчёта по кампаниям — один раз на экран
export function pultModel(a) {
  const c = a.ctx(), main = a.snap('main') || {}, stats = a.snap('stats') || {}, mk = a.snap('mk');
  const t = c.today, m = metrikaOf(c) || {}, skip = outageSet(c.data.days || []);
  const daily = stats.daily || [], conv = stats.conv || [], ads = main.ads || [];
  const perAll = royaltyPerSale(c.data.sales || [], t)?.perSale ?? null;
  // доля «библиотека → покупка» по Метрике автора за 90 дней — сколько стоит одно добавление
  const g0 = goalsOf(m), tot = mk?.daily ? goalTotals30(mk.daily, addDays(t, -89), t) : null;
  const lv = tot && g0.lib ? libraryValue({ libN: tot.goals[g0.lib] || 0, buyN: g0.buy.reduce((s, id) => s + (tot.goals[id] || 0), 0), royalty: perAll || 0 }) : null;
  const rows = (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED').map((camp) => {
    const goals = goalsOf(m, camp), book = bookOfCampaign(camp, ads, c.data.w_books || []);
    const sold = book?.title ? royaltyPerSale(c.data.sales || [], t, { book: (c.data.sales || []).find((x) => String(x.book || '').toLowerCase().startsWith(book.title.toLowerCase()))?.book || null }) : null;
    const perSale = sold?.qty >= 5 ? sold.perSale : perAll;
    const st = campaignState(camp, { daily, ads, today: t });
    const econ = campaignEcon(camp, { daily, conv, today: t, goals, perSale, libShare: lv?.share ?? null, skip });
    const wk0 = weekBudget(camp, daily, t);
    // старт подписки книги: Мастерская («О книге») или сайт
    const wb = book ? (c.data.w_books || []).find((x) => x.id === book.id) : null, sbk = book && !demo.on ? siteBooks(a).find((x) => String(x.title || '').toLowerCase() === String(book.title || '').toLowerCase()) : null;
    const subStart = wb?.subStart || sbk?.startDate || '';
    const stage = campaignStage(camp, { econ, st, goals, conv, today: t, subStart, perSale, skip });
    return { camp, goals, book, st, econ, perSale, stage, subStart, ownSales: sold?.qty >= 5, libMeasured: !!lv?.measured, pay: campaignPayback(camp, { daily, conv, today: t, goals, perSale, libValue: econ.libValue, skip }), wk: wk0, lev: campaignLevers(camp, st, econ, wk0, { ads, daily, today: t }), alerts: campaignAlerts(camp, st, econ, { daily, conv, today: t, goals }) };
  }).sort((x, y) => (ORDER[x.st.key] ?? 9) - (ORDER[y.st.key] ?? 9));
  return { c, main, stats, m, rows, lv };
}

const money = (v) => (v == null ? '—' : rub(v, 0));
// «Этап и следующий шаг»: одна мысль, одно действие, условия — галочками; вторая кампания — одной строкой
function stageHtml(r) {
  const g = r.stage, act = g.next?.act === 'goal' ? readyGoalActs(window.__app).find((x) => x.campaign === r.camp.id) : null;
  return `<div class="pult-stage"><div class="small muted">Этап</div><b>${esc(g.title)}</b><div class="small" style="margin-top:2px">${esc(g.text)}</div>
    ${g.checks.length ? `<div class="small" style="margin-top:6px">${g.checks.map((x) => `<div class="${x.ok ? '' : 'muted'}">${x.ok ? '✓' : '○'} ${esc(x.text)}</div>`).join('')}</div>` : ''}
    <div class="pult-next"><div style="min-width:0"><span class="small muted">Следующий шаг</span><div><b>${esc(g.next.what)}</b></div><div class="small muted">${esc(g.next.why)}</div></div>${act ? actBtn(act, 'Сменить цель', 'primary') : ''}</div>
    <div class="small muted" style="margin-top:8px"><b>Вторая кампания.</b> ${esc(g.second)}</div></div>`;
}
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
    <div class="tiles d-tiles">
      ${tile('Сегодня', money(e.today.cost), `за 7 дней ${money(e.d7.cost)}`)}
      ${wk ? tile('Неделя', `${money(wk.spent)}`, `из ${money(wk.limit)}`) : tile('30 дней', money(e.d30.cost), `кликов ${num(e.d30.clicks)}`)}
      ${tile('В библиотеку', e.lib30 == null ? '—' : num(e.lib30), e.cpaLib != null ? `по ${money(e.cpaLib)}${e.target ? ` · цель ${money(e.target)}` : ''}` : 'за 30 дней')}
      ${tile('Покупки', e.buy30 == null ? '—' : num(e.buy30), e.cpaBuy != null ? `по ${money(e.cpaBuy)}` : 'за 30 дней')}
    </div>
    ${wk ? `<div class="progress ${wk.share >= 0.9 ? 'warn' : ''}"><i style="width:${Math.min(100, wk.share * 100).toFixed(1)}%"></i></div>` : ''}
    <p class="small ${TONE[e.verdict.kind]}" style="margin:10px 0 0">${esc(e.verdict.text.charAt(0).toUpperCase() + e.verdict.text.slice(1))}${e.revenue != null && e.buy30 ? ` · роялти с покупок ≈ ${money(e.revenue)}` : ''}</p>
    ${e.libValue != null && r.perSale ? `<p class="small muted" style="margin:4px 0 0">≈ ${money(e.libValue)} за добавление — это оценка, а не деньги этой кампании: средний доход с одной покупки (${money(r.perSale)}${r.ownSales ? ', по этой книге' : ', по вашим книгам за 60 дней'}) × доля добавивших, которые потом покупают (${Math.round(e.libValue / r.perSale * 100)} %${r.libMeasured ? ', по Метрике за 90 дней' : ' — осторожная оценка, данных пока мало'}). Настоящие покупки появятся в плитке «Покупки», когда откроется подписка.</p>` : ''}
    ${pay && pay.total != null ? `<p class="small" style="margin:6px 0 0"><b>С начала (${pay.days} дн.):</b> потрачено ${money(pay.cost)} · вернулось с покупок ${money(pay.back || 0)} · ещё принесут добавившие ≈ ${money(pay.expected || 0)} → <span class="${pay.ret >= 1 ? 'up' : 'warnc'}">на 1 ₽ ≈ ${pay.ret.toFixed(2).replace('.', ',')} ₽</span></p>` : ''}
    ${r.stage ? stageHtml(r) : ''}
    ${lev?.forecast ? `<p class="small muted" style="margin:4px 0 0">При таком темпе за неделю: ≈ ${num(Math.round(lev.forecast.lib))} добавлений за ${money(lev.forecast.cost)}${lev.forecast.royalty != null ? ` → ожидаемое роялти ≈ ${money(lev.forecast.royalty)}` : ''}</p>` : ''}
    ${lev?.levers.length ? `<div class="pult-lev"><div class="small muted" style="margin:12px 0 2px">Как заработать больше</div>${more('lev-' + camp.id, lev.levers.map((x, i) => `<div class="item"><b>${i + 1}. ${esc(x.title)}</b><div class="small muted">${esc(x.how)}</div></div>`), 2)}</div>` : ''}
    <div class="row dl-row"><button class="dl" data-act="go" data-to="/c/${camp.id}">Открыть кампанию</button>${book?.id ? `<button class="dl" data-act="go" data-to="/book/${esc(book.id)}">Книга</button>` : ''}</div></div>`;
}

export function pultView(a) {
  const c = a.ctx(), main = a.snap('main');
  if (!main) return homeView(a); // подключение, пример, загрузка — как раньше
  const M = pultModel(a), stats = M.stats;
  // требует внимания: состояние кампаний, цена цели, площадки-сливы, потом общие подсказки (минус-слова, фразы без покупок, выгорание…)
  const alerts = M.rows.flatMap((r) => r.alerts).map((x) => `<div class="item"><b class="${TONE[x.tone]}">${esc(x.title)}</b><div class="small muted">${esc(x.how)}</div></div>`);
  const flags = qualityAlerts(placementRows(stats.placements || [], main.campaigns || []), { maxItems: 3 })
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
    ${q.length ? sec('Могу сделать сама — отметьте нужное') + `<div class="list">${q.map((x) => `<label class="item d-check" style="display:flex;gap:12px;align-items:flex-start;cursor:pointer"><input type="checkbox" data-pq="${esc(x.key)}" checked style="margin-top:4px">
      <span><b>${esc(x.text.charAt(0).toUpperCase() + x.text.slice(1))}</b><span class="small muted" style="display:block">${x.camp ? `«${esc(x.camp)}» · ` : ''}${esc(x.why)}</span></span></label>`).join('')}</div>
      <div class="row" style="margin-top:12px;gap:10px;flex-wrap:wrap"><button class="primary" data-act="pq.yes">Применить отмеченное</button><button class="small-btn" data-act="pq.no">Отмеченное — не надо</button></div>
      <p class="small muted" style="margin:8px 0 0">Цену цели и бюджет ничто из этого не меняет; всё записывается в «Что меняли».</p>` : ''}</div>`;
}
// Очередь предложений: всё, что приложение может сделать в кабинете само, — списком с галочками. Отмеченное — «Применить» или «Не надо».
function queueOf(a) {
  const c = a.ctx(), d = c.settings.direct || {}, main = a.snap('main') || {};
  const negOf = (camp) => [...(camp.negatives || []), ...(main.groups || []).filter((g) => g.cid === camp.id).flatMap((g) => g.negatives || [])];
  const starter = (main.campaigns || []).filter((x) => x.state === 'ON').map((camp) => ({ camp, miss: starterMinusMissing(negOf(camp)) })).filter((x) => x.miss.length >= 5)
    .map((x) => ({ do: 'minus', campaign: x.camp.id, phrases: x.miss, why: 'по таким запросам ищут файл, озвучку или экранизацию, а не книгу на Литнете' }));
  let goalActs = [];
  goalActs = readyGoalActs(a);
  const wbooks = c.data.w_books || [], extra = demo.on ? [] : [
    ...litTagItems({ main, code: c.settings.litTag?.code || '', late: !!litTagInfo(c.settings, c.today)?.late }),
    ...winnerQueryItems({ main, stats: a.snap('stats') || {}, goals: goalsOf(metrikaOf(c) || {}) }),
    ...retargetItems({ main, goals: goalsOf(metrikaOf(c) || {}), saved: d.retarget || {} }),
    ...newAdItems({ main, bookOf: (camp) => { const b = bookOfCampaign(camp, main.ads || [], wbooks); return b ? wbooks.find((x) => x.id === b.id) : null; }, hits: (t, wb) => spoilerHits(t, spoilerList(wb)) }),
  ];
  return approvalQueue({ main, stats: a.snap('stats') || {}, on: d.auto || {}, today: c.today, goalActs, done: d.autoDone || [], no: d.queueNo || [], starter, extra });
}
const pqPicked = () => new Set([...document.querySelectorAll('#pq input[data-pq]:checked')].map((x) => x.dataset.pq));
let pqBusy = false;
acts['pq.yes'] = async () => {
  const a = window.__app, pick = pqPicked(), plan = queueOf(a).filter((x) => pick.has(x.key));
  if (!plan.length) { toast('Ничего не отмечено'); return false; }
  if (demo.on) { toast('Это пример данных — в настоящем кабинете действия выполнятся'); return false; }
  if (pqBusy) return false;
  pqBusy = true;
  try {
    const done = await execPlan(a, plan, 'app'), n = plan.filter((x) => done.includes(x.key)).length, d = a.ctx().settings.direct || {};
    if (done.length) await a.store.saveSettings({ direct: { ...d, autoDone: [...(d.autoDone || []), ...done].slice(-400) } });
    toast(n === plan.length ? `Готово: сделано ${n} — всё записано в «Что меняли»` : `Сделано ${n} из ${plan.length}. Остальное Директ не принял${lastPlanErrors[0] ? `: ${lastPlanErrors[0]}` : ''} — оно осталось в списке`);
  } finally { pqBusy = false; }
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
  return `<div class="card"><div class="row between"><h2 style="margin:0">Автоправила</h2><span class="small muted">${Object.values(on).some(Boolean) ? (d.autoAt ? `последнее действие ${d.autoAt.slice(8, 10)}.${d.autoAt.slice(5, 7)}` : 'включены') : 'выключены'}</span></div>
    <p class="small muted" style="margin:6px 0 8px">Рутина таргетолога — сама, после каждого обновления данных. Всё записывается в «Что меняли». Цену цели и бюджет правила не трогают.</p>
    ${AUTO_RULES.map(([k, t, how]) => `<label class="d-check" style="display:flex;gap:10px;align-items:flex-start;margin:10px 0"><input type="checkbox" data-chg="ar.set" data-k="${k}"${on[k] ? ' checked' : ''}> <span><b>${esc(t)}</b><span class="small muted" style="display:block">${esc(how)}</span></span></label>`).join('')}
    <label class="d-check" style="display:flex;gap:10px;align-items:flex-start;margin:10px 0"><input type="checkbox" data-chg="ar.set" data-k="watch"${on.watch ? ' checked' : ''}> <span><b>Круглосуточный сторож — письмо, если что-то сломалось</b><span class="small muted" style="display:block">${on.watch && d.watchInfo?.old ? 'Не включился: обновите программу сервиса писем (Мастерская → Сайт → Почта → «Скопировать программу») и поставьте галочку ещё раз.' : on.watch && d.watchInfo?.err ? esc('Сервис ответил: ' + d.watchInfo.err) : on.watch ? `Работает${d.watchInfo?.at ? ` · проверял ${new Date(d.watchInfo.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}${(d.watchInfo?.last || []).length ? ` · ${esc(d.watchInfo.last[0])}` : ''}` : 'Раз в 3 часа ваш сервис писем проверяет кампании и пишет, если показы пропали, кампания остановилась или объявление отклонено. Ключ Директа для этого хранится в вашем Яндекс Облаке.'}</span></span></label>
    ${(d.autoLast || []).length && Object.values(on).some(Boolean) ? `<p class="small" style="margin:8px 0 0">Сделано в последний раз: ${esc(d.autoLast.join(' · '))}</p>` : ''}</div>`;
}
changes['ar.set'] = async (v, el) => { const a = window.__app, d = a.ctx().settings.direct || {}; await a.store.saveSettings({ direct: { ...d, auto: { ...(d.auto || {}), [el.dataset.k]: !!el.checked } } }); if (el.dataset.k === 'watch') syncWatch(a, { force: true }).catch(() => {}); };
