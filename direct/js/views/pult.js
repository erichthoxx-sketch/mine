// «Пульт» — главная «Директа»: что требует внимания и одна карточка на кампанию (состояние, деньги, цена цели, окупаемость, вывод).
// Расчёты — direct/js/pult.js. Бюджеты приложение не меняет: только подсказывает и даёт кнопки минус-фраз, паузы, привязки счётчика.
import { esc, more } from '../../../js/ui.js';
import { rub, num } from '../../../js/format.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { goalsOf, bookOfCampaign, campaignState, campaignEcon, campaignAlerts, weekBudget, campaignLevers, campaignPayback } from '../pult.js';
import { royaltyPerSale, goalTotals30 } from '../mcalc.js';
import { libraryValue } from '../launchcalc.js';
import { placementRows, qualityAlerts } from '../qualitycalc.js';
import { metrikaOf } from './metrika.js';
import { todo } from './home.js';
import { homeView } from './home.js';
import { demo } from '../demo.js';
import { ic } from '../../../js/icons.js';
import { litTagInfo } from '../../../js/littag.js';
import { weekKeyOf } from '../weekreview.js';
import { AUTO_RULES } from '../autorules.js';
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
    return { camp, goals, book, st, econ, perSale, pay: campaignPayback(camp, { daily, conv, today: t, goals, perSale, libValue: econ.libValue, skip }), wk: wk0, lev: campaignLevers(camp, st, econ, wk0, { ads, daily, today: t }), alerts: campaignAlerts(camp, st, econ, { daily, conv, today: t, goals }) };
  }).sort((x, y) => (ORDER[x.st.key] ?? 9) - (ORDER[y.st.key] ?? 9));
  return { c, main, stats, m, rows, lv };
}

const money = (v) => (v == null ? '—' : rub(v, 0));
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
    ${pay && pay.total != null ? `<p class="small" style="margin:6px 0 0"><b>С начала (${pay.days} дн.):</b> потрачено ${money(pay.cost)} · вернулось с покупок ${money(pay.back || 0)} · ещё принесут добавившие ≈ ${money(pay.expected || 0)} → <span class="${pay.ret >= 1 ? 'up' : 'warnc'}">на 1 ₽ ≈ ${pay.ret.toFixed(2).replace('.', ',')} ₽</span></p>` : ''}
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
    ${wkOpen ? `<div class="card"><div class="row between" style="gap:12px"><div><b>Разбор недели готов</b><div class="small muted">Итог против прошлой недели, воронка, объявления, запросы, площадки — и что поменять</div></div><button class="primary" data-act="go" data-to="/week">Открыть</button></div></div>` : ''}
    <div class="card"><div class="row between"><h2 style="margin:0">Сегодня · кампании</h2><span class="small muted">${tasks.length ? num(tasks.length) : 'всё спокойно'}</span></div>
      ${tasks.length ? `<div class="list">${more('pult-todo', tasks, 3)}</div>` : '<p class="small muted" style="margin:8px 0 0">Ничего срочного. Приложение само проверяет кампании при каждом обновлении — раз в 15 минут, пока открыто.</p>'}</div>
    ${live.map(card).join('') || '<div class="card"><p class="muted">Сейчас нет идущих кампаний.</p></div>'}
    ${rest.length ? `<div class="card"><h2>Остальные кампании</h2><div class="list">${rest.map((r) => `<a class="item" href="#" data-act="go" data-to="/c/${r.camp.id}"><div class="row between"><b>${esc(r.camp.name)}</b><span class="small muted">${esc(r.st.text)}</span></div>${r.econ.d30.cost ? `<div class="small muted">за 30 дней ${money(r.econ.d30.cost)}${r.econ.lib30 ? ` · в библиотеку ${num(r.econ.lib30)}` : ''}</div>` : ''}</a>`).join('')}</div></div>` : ''}
    ${autoCard(c)}
    <div class="row dl-row"><button class="dl" data-act="go" data-to="/week">Разбор недели</button><button class="dl" data-act="go" data-to="/an">Читатели (Метрика)</button><button class="dl" data-act="go" data-to="/books">Книги</button><button class="dl" data-act="go" data-to="/quality">Качество трафика</button><button class="dl" data-act="go" data-to="/log">Что меняли</button><button class="dl" data-act="ai.dl">${ic('download')} Для нейросети</button></div>
    ${cohortLine(c.settings.direct || {})}`,
  };
}

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
