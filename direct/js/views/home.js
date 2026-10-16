// Обзор: как идёт реклама за неделю, тестовый бюджет, «что сделать сейчас», список кампаний
import { esc, acts } from '../../../js/ui.js';
import { rub, num, pct, fmtShort } from '../../../js/format.js';
import { addDays } from '../../../js/calc.js';
import { lineChart } from '../../../js/charts.js';
import { totals, spendSeries, budgetPace, queryHints, keywordHints, withAvgCpc, DEFAULT_TEST_BUDGET } from '../dcalc.js';
import { stateDot, tiles, actBtn, q } from './common.js';
import { demo } from '../demo.js';

const app = () => window.__app;

function connectCard() {
  return `<div class="card"><h2>Подключите Директ</h2>
    <p>Здесь будет вся ваша реклама в Яндекс Директе: сколько потрачено, что ищут люди, какие фразы сливают деньги — и кнопки, чтобы это исправить.</p>
    <div class="row"><button class="primary" data-act="go" data-to="/settings">Подключить</button><button data-act="d.demo">Посмотреть на примере</button></div></div>`;
}
acts['d.demo'] = () => { app().ui.demo = true; app().store.emit(); };
acts['d.demoOff'] = () => { app().ui.demo = false; app().store.emit(); };

// Подсказки «что сделать сейчас»: до 6 самых важных
export function todo(main, stats) {
  const out = [];
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
  if (!main) return { html: c.settings.directToken ? '<div class="card"><p class="muted">Загружаю данные из Директа…</p></div>' : connectCard() };
  const t = c.today, daily = stats?.daily || [];
  const w = totals(daily, addDays(t, -6), t), pw = totals(daily, addDays(t, -13), addDays(t, -7));
  const d = c.settings.direct || {};
  const budget = Number(d.testBudget) || DEFAULT_TEST_BUDGET, from = d.testFrom || (main.campaigns || []).map((x) => x.start).filter(Boolean).sort()[0] || addDays(t, -29);
  const pace = budgetPace(daily, { budget, from, today: t });
  const delta = pw.cost ? (w.cost - pw.cost) / pw.cost : null;
  const tasks = stats ? todo(main, stats) : [];
  const camps = (main.campaigns || []).filter((x) => x.state !== 'ARCHIVED');
  return {
    html: `${demo.on ? `<div class="alert">Это пример — так будет выглядеть ваш Директ. Можно нажимать кнопки: в примере ничего не тратится. ${c.settings.directToken ? '' : '<button class="link" data-act="go" data-to="/settings">Подключить свой</button>'}${a.store.mode !== 'local' ? ' <button class="link" data-act="d.demoOff">Закрыть пример</button>' : ''}</div>` : ''}
    <div class="card"><div class="row between"><h2 style="margin:0">За 7 дней</h2><span class="small muted">${fmtShort(addDays(t, -6))}–${fmtShort(t)}${delta != null ? ` · <span class="${delta > 0 ? 'warnc' : ''}">${delta > 0 ? '▲' : '▼'} ${pct(Math.abs(delta), 0)} к прошлой неделе</span>` : ''}</span></div>
      ${tiles(w)}
      <div class="bar-row"><div class="row between small"><span>Тестовый бюджет ${q('budget')}</span><span><b>${rub(pace.spent, 0)}</b> из ${rub(budget, 0)}</span></div><div class="progress ${pace.share >= 0.9 ? 'warn' : ''}"><i style="width:${Math.min(100, pace.share * 100).toFixed(1)}%"></i></div>
      <div class="small muted">${pace.left <= 0 ? 'Тестовый бюджет потрачен — время подвести итоги (ИИ-помощник поможет).' : pace.daysLeft != null ? `≈ ${rub(pace.perDay, 0)} в день — остатка хватит примерно на ${num(pace.daysLeft)} дн.` : 'Пока расходов нет.'}</div></div>
      <div class="chart" id="dSpend"></div><div class="chart-cap small muted">Расход по дням за 30 дней</div></div>
    <div class="card"><h2>Что сделать сейчас</h2>${tasks.length ? `<div class="list">${tasks.join('')}</div>` : '<p class="muted">Ничего срочного. Загляните через пару дней — появятся новые запросы.</p>'}
      <p class="small muted">Хотите разбор целиком — откройте <button class="link" data-act="go" data-to="/ai">ИИ-помощник</button>.</p></div>
    <div class="card"><h2>Кампании</h2>${camps.length ? `<div class="list">${camps.map((k) => {
      const kt = totals(daily, addDays(t, -6), t, k.id);
      return `<a class="item" href="#" data-act="go" data-to="/c/${k.id}"><div class="row between"><b>${esc(k.name)}</b>${stateDot(k)}</div>
        <div class="small muted">за 7 дней: ${rub(kt.cost, 0)} · кликов ${num(kt.clicks)}${kt.cpc != null ? ` · клик ${rub(kt.cpc, 1)}` : ''}${k.daily ? ` · лимит ${rub(k.daily, 0)}/день` : ''}</div></a>`;
    }).join('')}</div>` : '<p class="muted">Кампаний пока нет — их создают в кабинете Директа.</p>'}</div>`,
    after() {
      const el = document.getElementById('dSpend');
      if (el) lineChart(el, { points: spendSeries(daily, t, 30).map((x) => ({ label: fmtShort(x.date), value: x.value })), fmtVal: (v) => rub(v, 0), height: 150 });
    },
  };
}
