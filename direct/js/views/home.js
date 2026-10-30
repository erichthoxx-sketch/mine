// Обзор: как идёт реклама за неделю, тестовый бюджет, «что сделать сейчас», список кампаний
import { esc, acts } from '../../../js/ui.js';
import { rub, num, pct, fmtShort } from '../../../js/format.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { lineChart } from '../../../js/charts.js';
import { totals, spendSeries, budgetPace, queryHints, keywordHints, withAvgCpc, goalHints, goalTotals, fatigueHints, spendAdvice, spendHint, DEFAULT_TEST_BUDGET } from '../dcalc.js';
import { royaltyPerSale } from '../mcalc.js';
import { metrikaOf } from './metrika.js';
import { stateDot, tiles, actBtn, q } from './common.js';
import { demo } from '../demo.js';
import { OUTAGE_TEXT } from '../api.js';
import { resolvedLaunches } from './launchctx.js';
import { outageNotice } from '../adcontext.js';
import { launchStrip, phaseSteps } from './launch.js';
import { ic } from '../../../js/icons.js';
import { linkedTargetologists, targetReminders } from '../../../js/target-partners.js';

const app = () => window.__app;

// Запуск книги: где мы сейчас и что сделать — видно сразу, даже пока Директ не подключён
// по карточке на каждую книгу «в процессе»
const launchCard = (a) => (demo.on ? '' : resolvedLaunches(a).map((L) => launchOne(L)).join(''));
function launchOne({ id, plan: p }) {
  const left = phaseSteps(p).filter((s) => !s.ok);
  return `<div class="card fl-panel"><div class="row between"><h2 style="margin:0">Запуск «${esc(p.book)}»</h2><button class="primary" data-act="go" data-to="/launch/${esc(id)}">План</button></div>
    ${launchStrip(p)}
    ${left.length ? `<div class="fl-checklist">${left.slice(0, 3).map((s) => `<div class="fl-check-item"><span class="fl-check-icon" aria-hidden="true">○</span><span>${esc(s.text)}</span></div>`).join('')}</div>` : '<p class="small up">На этом этапе всё готово.</p>'}
    ${p.daysToNext != null && p.daysToNext >= 0 ? `<p class="small muted">${p.daysToNext === 0 ? 'Сегодня' : `Через ${num(p.daysToNext)} дн.`}: ${esc(p.next.text)}.</p>` : ''}</div>`;
}

function partnerPanel(c) {
  const people=linkedTargetologists(c.data,'direct');
  if (!people.length) return '';
  return `<div class="card"><div class="row between"><h2 style="margin:0">Внешние таргетологи</h2><span class="small muted">Связи · Мастерская</span></div>
    <div class="list">${people.map(p=>{
      const tasks=targetReminders(p,c.today);
      const last=[...(p.log||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
      return `<a class="item target-linked-item" href="../pisatel/#/link/${encodeURIComponent(p.id)}"><b>${esc(p.name)}</b>
        <span class="sub">${[p.campaignNote, p.partnerStatus==='paused'?'На паузе':p.partnerStatus==='done'?'Завершено':'В работе'].filter(Boolean).map(esc).join(' · ')}</span>
        ${tasks.length?`<span class="small muted">Следующее: ${esc(tasks[0].text)}${tasks[0].date?' · '+tasks[0].date:''}</span>`:last?`<span class="small muted">Последнее: ${esc(last.text)}</span>`:''}</a>`;
    }).join('')}</div><p class="small muted" style="margin:8px 0 0">Здесь только договоренности и дела. Расходы и ставки не меняются.</p></div>`;
}

function connectCard(c) {
  return `${partnerPanel(c)}<div class="card"><h2>Подключите Директ</h2>
    <p>Здесь будет вся ваша реклама в Яндекс Директе: сколько потрачено, что ищут люди, какие фразы сливают деньги — и кнопки, чтобы это исправить.</p>
    <div class="row"><button class="primary" data-act="go" data-to="/settings">Подключить</button><button data-act="d.demo">Посмотреть на примере</button></div></div>`;
}
acts['d.demo'] = () => { app().ui.demo = true; app().store.emit(); };
acts['d.demoOff'] = () => { app().ui.demo = false; app().store.emit(); };

const lessonLink = (k) => `<button class="link" data-act="l.lesson" data-k="${k}" data-go="1">Почему так →</button>`;
// Подсказки аналитика по целям Метрики (покупки): с объяснением и ссылкой на урок
function goalTodo(main, stats, ctx) {
  const m = metrikaOf(ctx);
  if (!m?.counterId) return [];
  const hs = goalHints({ campaigns: main.campaigns, keywords: main.keywords, kw: stats.kw, kwConv: stats.kwConv, daily: stats.daily, conv: stats.conv, mrows: stats.mrows, m, today: ctx.today, skip: outageSet(ctx.data.days || []) });
  const out = [];
  for (const h of hs.slice(0, 4)) {
    const head = { counter: `Кампания «${esc(h.name)}»: привязать счётчик`, zero: `«${esc(h.name)}»: клики есть, покупок нет`, bounce: `«${esc(h.name)}»: много уходят сразу`, noconv: `«${esc(h.phrase)}» тратит без покупок`, winner: `«${esc(h.phrase)}» приводит покупателей` }[h.kind];
    const btn = h.kind === 'counter' ? actBtn({ do: 'counter', campaign: h.cid, counter: m.counterId, why: h.why }, 'Привязать', 'small-btn')
      : h.kind === 'noconv' ? actBtn({ do: 'pause', target: 'keyword', ids: [h.id], why: h.why }, 'Остановить фразу', 'small-btn') : '';
    out.push(`<div class="item${h.kind === 'winner' ? ' d-good' : ''}"><div class="row between"><b>${head}</b>${btn}</div><div class="small muted">${esc(h.why)} · ${lessonLink(h.lesson)}</div></div>`);
  }
  return out;
}

// Подсказки «что сделать сейчас»: до 6 самых важных
export function todo(main, stats, ctx = null) {
  const out = [];
  // был сбой «не от меня» (отмечен в «Доходах»): Директ мог перестраиваться — выводы и правки подождут
  const on = ctx && outageNotice(ctx.data.days || [], ctx.today, (main.campaigns || []).some((x) => x.state === 'ON'));
  if (on) out.push(`<div class="item"><b>Был сбой ${fmtShort(on.last)}${on.n > 1 ? ` (дней: ${on.n})` : ''} — до ${fmtShort(on.until)} не меняйте настройки</b><div class="small muted">Показы и покупки в дни сбоя проседают не из-за рекламы; Директ мог перестраиваться. Приложение не берёт эти дни в выводы и средние.</div></div>`);
  if (ctx) out.push(...goalTodo(main, stats, ctx));
  // расход: урезать или вернуть прежний — по окупаемости за 14 дней
  const mm = ctx && metrikaOf(ctx);
  if (mm?.counterId) {
    const value = Number(ctx.settings.direct?.econ?.rev) || royaltyPerSale(ctx.data.sales || [], ctx.today)?.perSale || null;
    for (const camp of (main.campaigns || []).filter((x) => x.state === 'ON')) {
      const h = spendHint(camp, spendAdvice({ camp, daily: stats.daily || [], conv: stats.conv || [], today: ctx.today, goals: mm.main, skip: outageSet(ctx.data.days || []), value }));
      if (h?.status === 'fix') out.push(`<div class="item"><b>${esc(h.title)}</b><div class="small">${esc(h.why)}</div><div class="small muted">${esc(h.how)} · ${lessonLink(h.lesson)}</div></div>`);
    }
  }
  // выгорание: сначала то, что уже выгорает, потом «пора готовить замену»
  if (ctx) for (const h of fatigueHints({ main, stats, today: ctx.today, goals: metrikaOf(ctx)?.main || null, skip: outageSet(ctx.data.days || []) }).slice(0, 2)) {
    out.push(`<div class="item"><div class="row between"><b>${esc(h.title)}</b>${h.act ? actBtn(h.act, h.actLabel, 'small-btn') : ''}</div><div class="small muted">${esc(h.how)} · ${lessonLink(h.lesson)}</div></div>`);
  }
  const neg = Object.fromEntries((main.campaigns || []).map((c) => [c.id, c.negatives || []]));
  for (const h of queryHints(stats.queries, neg).slice(0, 3)) {
    out.push(`<div class="item"><div class="row between"><b>Минус-слово «${esc(h.word)}»</b>${actBtn({ do: 'minus', campaign: h.cid, phrases: [h.word], why: `${h.why}; ушло ${rub(h.cost, 0)} на ${h.queries.length} запр.` }, 'В минус', 'small-btn')}</div>
      <div class="small muted">${esc(h.why)} · ${rub(h.cost, 0)} за 30 дней · например: «${esc(h.queries[0])}»</div></div>`);
  }
  const kws = withAvgCpc(main.keywords || [], stats.kw || {});
  for (const h of keywordHints(kws, stats.kw || {}).slice(0, 2)) {
    out.push(`<div class="item"><div class="row between"><b>«${esc(h.phrase)}»</b>${actBtn({ do: 'pause', target: 'keyword', ids: [h.id], why: h.why }, 'Остановить фразу', 'small-btn')}</div>
      <div class="small muted">${esc(h.why)} · показов ${num(h.impr)}, кликов ${num(h.clicks)}, ${rub(h.cost, 0)}</div></div>`);
  }
  for (const a of (main.ads || []).filter((x) => x.status === 'REJECTED' && x.state !== 'ARCHIVED').slice(0, 2)) {
    out.push(`<a class="item" href="#" data-act="d.toAds" data-cid="${a.cid}"><b>Объявление отклонено: «${esc(a.title)}»</b><div class="small muted">${esc(a.note || 'причина — в кабинете Директа')} · исправить можно в кабинете</div></a>`);
  }
  return out;
}
acts['d.toAds'] = (d) => { app().ui.cTab = 'ads'; app().ui.route = '/c/' + d.cid; };

export function homeView(a) {
  const c = a.ctx(), main = a.snap('main'), stats = a.snap('stats');
  if (!main) {
    if (!c.settings.directToken) return { html: launchCard(a) + connectCard(c) };
    const last = c.settings.direct?.lastError;
    if (a.ui.busy || !last) return { html: launchCard(a) + '<div class="card"><p class="muted">Загружаю данные из Директа…</p></div>' };
    const msg = last.code === 56 ? 'Яндекс временно ограничил частоту запросов. Приложение повторит загрузку автоматически.' : last.text || 'Не получилось получить данные Директа.';
    return { html: launchCard(a) + `<div class="card"><h2>Не получилось загрузить кампании</h2><p class="small">${esc(msg)}</p><button class="primary" data-act="d.reload">Обновить</button></div>` };
  }
  const t = c.today, daily = stats?.daily || [];
  const w = totals(daily, addDays(t, -6), t), pw = totals(daily, addDays(t, -13), addDays(t, -7));
  const d = c.settings.direct || {};
  const budget = Number(d.testBudget) || DEFAULT_TEST_BUDGET, from = d.testFrom || (main.campaigns || []).map((x) => x.start).filter(Boolean).sort()[0] || addDays(t, -29);
  const pace = budgetPace(daily, { budget, from, today: t });
  const delta = pw.cost ? (w.cost - pw.cost) / pw.cost : null;
  const tasks = stats ? todo(main, stats, c) : [];
  const m = metrikaOf(c), skip = outageSet(c.data.days || []);
  const gw = m?.counterId && stats ? goalTotals(daily, stats.conv || [], addDays(t, -6), t, { goals: m.main, skip }) : null;
  const err = c.settings.direct?.lastError;
  const camps = (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED');
  return {
    html: `${demo.on ? `<div class="alert">Это пример — так будет выглядеть ваш Директ. Можно нажимать кнопки: в примере ничего не тратится. ${c.settings.directToken ? '' : '<button class="link" data-act="go" data-to="/settings">Подключить свой</button>'}${a.store.mode !== 'local' ? ' <button class="link" data-act="d.demoOff">Закрыть пример</button>' : ''}</div>` : ''}
    ${launchCard(a)}
    <div class="card"><div class="row between"><h2 style="margin:0">За 7 дней</h2><span class="small muted">${fmtShort(addDays(t, -6))}–${fmtShort(t)}${delta != null ? ` · <span class="${delta > 0 ? 'warnc' : ''}">${delta > 0 ? '▲' : '▼'} ${pct(Math.abs(delta), 0)} к прошлой неделе</span>` : ''}</span></div>
    ${!demo.on && err?.transient ? `<div class="alert d-outage">${esc(err.code === 56 ? 'Яндекс ограничил частоту запросов — приложение повторит загрузку автоматически.' : OUTAGE_TEXT)} Данные от ${new Date(main.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.</div>` : ''}
    ${stats?.mErr ? `<p class="small muted">${esc(stats.mErr)}</p>` : ''}
      ${tiles(w)}
      ${gw ? `<div class="d-goalrow small"><span>Покупки ${q('conv')} <b>${num(gw.conv)}</b></span><span>Цена покупки ${q('cpa')} <b>${gw.cpa != null ? rub(gw.cpa, 0) : '—'}</b></span><span>Из 100 кликов ${q('cr')} <b>${gw.cr != null ? String(Math.round(gw.cr * 1000) / 10).replace('.', ',') : '—'}</b></span></div>` : ''}
      <div class="bar-row"><div class="row between small"><span>Тестовый бюджет ${q('budget')}</span><span><b>${rub(pace.spent, 0)}</b> из ${rub(budget, 0)}</span></div><div class="progress ${pace.share >= 0.9 ? 'warn' : ''}"><i style="width:${Math.min(100, pace.share * 100).toFixed(1)}%"></i></div>
      <div class="small muted">${pace.left <= 0 ? 'Тестовый бюджет потрачен — время подвести итоги.' : pace.daysLeft != null ? `≈ ${rub(pace.perDay, 0)} в день — остатка хватит примерно на ${num(pace.daysLeft)} дн.` : 'Пока расходов нет.'}</div></div>
      <div class="chart" id="dSpend"></div><div class="chart-cap small muted">Расход по дням за 30 дней</div></div>
    ${partnerPanel(c)}
    <div class="card"><h2>Что сделать сейчас</h2>${m?.counterId ? '' : `<p class="small muted">Подключите Метрику (⚙ Настройки) — и подсказки будут учитывать покупки, а не только клики.</p>`}${tasks.length ? `<div class="list">${tasks.join('')}</div>` : '<p class="muted">Ничего срочного. Загляните через пару дней — появятся новые запросы.</p>'}
      <div class="row dl-row"><button class="dl" data-act="ai.dl">${ic('download')} Скачать для нейросети</button><button class="dl" data-act="go" data-to="/quality">Качество трафика</button></div></div>
    <div class="card"><h2>Кампании</h2>${camps.length ? `<div class="list">${camps.map((k) => {
      const kt = totals(daily, addDays(t, -6), t, k.id);
      const kg = m?.counterId ? goalTotals(daily, stats?.conv || [], addDays(t, -6), t, { cid: k.id, goals: m.main, skip }) : null;
      return `<a class="item" href="#" data-act="go" data-to="/c/${k.id}"><div class="row between"><b>${esc(k.name)}</b>${stateDot(k)}</div>
        <div class="small muted">за 7 дней: ${rub(kt.cost, 0)} · кликов ${num(kt.clicks)}${kt.cpc != null ? ` · клик ${rub(kt.cpc, 1)}` : ''}${kg ? ` · покупок ${num(kg.conv)}${kg.cpa != null ? ` по ${rub(kg.cpa, 0)}` : ''}` : ''}${k.daily ? ` · лимит ${rub(k.daily, 0)}/день` : ''}</div></a>`;
    }).join('')}</div>` : '<p class="muted">Кампаний пока нет — их создают в кабинете Директа.</p>'}</div>`,
    after() {
      const el = document.getElementById('dSpend');
      if (el) lineChart(el, { points: spendSeries(daily, t, 30).map((x) => ({ label: fmtShort(x.date), value: x.value })), fmtVal: (v) => rub(v, 0), height: 150 });
    },
  };
}
