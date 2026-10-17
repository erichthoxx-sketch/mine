// «Аналитика»: всё о читателях по Метрике автора на Литнете — в одном месте, с подсвеченными шагами.
// Работает и без Директа: нужна только Метрика.
import { esc, acts } from '../../../js/ui.js';
import { num, pct, fmtShort } from '../../../js/format.js';
import { addDays, outageSet } from '../../../js/calc.js';
import { lineChart } from '../../../js/charts.js';
import { ic } from '../../../js/icons.js';
import { sumDays, byWeekday, mkInsights, reach, shortUrl, MIN_VISITS } from '../mcalc.js';
import { metrikaOf } from './metrika.js';
import { packageText, sendToChat } from './ai.js';
import { demo } from '../demo.js';

const app = () => window.__app;
const LEVEL = { step: ['Сделать', 'l-step'], warn: ['Внимание', 'warnc'], good: ['Хорошо', 'up'], wait: ['Подождать', 'muted'], info: ['На заметку', ''] };
const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const mmss = (s) => (s == null ? '—' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const delta = (a, b) => (a != null && b ? `<span class="small ${a >= b ? 'up' : 'down'}">${a >= b ? '▲' : '▼'} ${pct(Math.abs(a - b) / b, 0)}</span>` : '');

function connectCard(c) {
  return `<div class="card"><h2>Аналитика читателей</h2>
    <p>Подключите счётчик Метрики автора с Литнета — и здесь будет всё в одном месте: откуда приходят читатели, кто из них покупает, какие страницы и дни работают лучше. Самое важное приложение подсветит как следующие шаги.</p>
    <p class="small muted">Работает уже сейчас, даже пока Директ не одобрил заявку: нужна только Метрика.</p>
    <div class="row"><button class="primary" data-act="go" data-to="/settings">Подключить Метрику</button>${c.settings.directToken ? '' : '<span class="small muted">сначала — вход через Яндекс (Учёба → Настройка, шаг 4)</span>'}</div></div>`;
}

export function analyticsView(a) {
  const c = a.ctx(), m = metrikaOf(c), mk = a.snap('mk');
  if (!m?.counterId) return { html: connectCard(c) };
  if (!mk) return { html: `<div class="card"><h2>Аналитика читателей</h2><p class="muted">Загружаю данные Метрики… Если долго — нажмите ↻ вверху.</p></div>` };
  const t = c.today, main = (m.main || []).map(String), skip = outageSet(c.data.days || []), hasGoals = main.length > 0;
  const w = sumDays(mk.daily, addDays(t, -6), t, main, skip), pw = sumDays(mk.daily, addDays(t, -13), addDays(t, -7), main, skip);
  const m30 = sumDays(mk.daily, addDays(t, -29), t, main, skip);
  const ins = mkInsights({ daily: mk.daily, sources: mk.sources, devices: mk.devices, pages: mk.pages, main, hasGoals, today: t, skip });
  const goalName = (m.goals || []).filter((g) => main.includes(String(g.id))).map((g) => g.name).join(', ') || 'цели';
  const totalV = (mk.sources || []).reduce((s, x) => s + x.visits, 0) || 1;
  const crOf = (x) => (x.visits ? reach(x, main) / x.visits : null);
  const crCell = (x) => { const cr = crOf(x); if (!hasGoals || cr == null || x.visits < MIN_VISITS) return '<span class="muted">—</span>'; return `<span class="${m30.cr && cr >= m30.cr * 1.3 ? 'up' : m30.cr && cr <= m30.cr * 0.6 ? 'down' : ''}">${pct(cr, 1)}</span>`; };
  const wd = byWeekday(mk.daily, main, skip), maxWd = Math.max(...wd.map((x) => x.avg), 1);
  const steps = ins.filter((x) => x.level === 'step' || x.level === 'warn').length;
  return {
    html: `${demo.on ? '<div class="alert">Это пример — так будет выглядеть аналитика вашего счётчика.</div>' : ''}
    <div class="card"><div class="row between"><h2 style="margin:0">Читатели за 7 дней</h2><span class="small muted">${esc(m.counterName || '')}${mk.at && !demo.on ? ' · ' + new Date(mk.at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>
      <div class="tiles d-tiles">
        <div><div class="k">Визиты</div><div class="v">${num(w.visits)}</div><div class="s">${delta(w.visits, pw.visits)} к прошлой неделе</div></div>
        <div><div class="k">${hasGoals ? esc(goalName) : 'Цели'}</div><div class="v">${hasGoals ? num(w.conv) : '—'}</div><div class="s">${hasGoals && w.cr != null ? `${pct(w.cr, 1)} визитов ${delta(w.cr, pw.cr)}` : 'выберите цель в Настройках'}</div></div>
        <div><div class="k">Отказы</div><div class="v">${w.bounce == null ? '—' : pct(w.bounce, 0)}</div><div class="s">ушли сразу</div></div>
        <div><div class="k">Время на странице</div><div class="v">${mmss(w.dur)}</div><div class="s">${w.depth ? `${String(Math.round(w.depth * 10) / 10).replace('.', ',')} стр. за визит` : ''}</div></div>
      </div>
      <div class="chart" id="mkChart"></div><div class="chart-cap small muted">Визиты по дням за 8 недель</div></div>
    <div class="card"><div class="row between"><h2 style="margin:0">Главное сейчас</h2>${steps ? `<span class="small warnc">шагов: ${steps}</span>` : ''}</div>
      <div class="list">${ins.map((x) => `<div class="item ${x.level === 'step' ? 'l-hl' : ''}"><span class="small ${LEVEL[x.level][1]}">● ${LEVEL[x.level][0]} · ${esc(x.area)}</span><br><b>${esc(x.title)}</b>
        ${x.why ? `<div class="small">${esc(x.why)}</div>` : ''}${x.step ? `<div class="small"><b>Что сделать:</b> ${esc(x.step)}</div>` : ''}
        ${x.lesson ? `<div class="small"><button class="link l-why" data-act="l.lesson" data-k="${x.lesson}">Почему так →</button></div>` : ''}</div>`).join('') || '<p class="muted">Пока всё ровно.</p>'}</div>
      <div class="row dl-row"><button class="dl" data-act="an.ai">${ic('copy')} Глубокий разбор с Claude</button></div></div>
    <div class="card"><h2>Откуда приходят читатели</h2><p class="small muted">За 30 дней. Зелёным — источники, где ${hasGoals ? 'покупают заметно чаще среднего' : 'лучше'}, красным — заметно реже.</p>
      <div class="list">${(mk.sources || []).map((x) => `<div class="item"><div class="row between"><b>${esc(x.name)}</b><span class="small">${num(x.visits)} · ${pct(x.visits / totalV, 0)}</span></div>
        <div class="progress"><i style="width:${(x.visits / totalV * 100).toFixed(1)}%"></i></div>
        <div class="small muted">отказы ${pct(x.bounce, 0)} · время ${mmss(x.dur)}${hasGoals ? ` · ${esc(goalName)}: ${num(reach(x, main))} (` : ''}${hasGoals ? crCell(x) + ')' : ''}</div></div>`).join('') || '<p class="muted">Нет данных.</p>'}</div></div>
    <div class="card"><h2>Страницы, с которых начинают</h2><div class="list">${(mk.pages || []).slice(0, 6).map((x) => `<div class="item"><div class="row between"><span class="small">${esc(shortUrl(x.key || x.name))}</span><span class="small">${num(x.visits)}</span></div><div class="small muted">отказы ${pct(x.bounce, 0)}${hasGoals ? ` · доля покупок ${crCell(x)}` : ''}</div></div>`).join('') || '<p class="muted">Нет данных.</p>'}</div></div>
    <div class="grid2">
      <div class="card"><h2>Устройства</h2>${(mk.devices || []).map((x) => `<div class="bar-row"><div class="row between small"><span>${esc(x.name)}</span><span>${num(x.visits)}${hasGoals ? ` · ${crCell(x)}` : ''}</span></div><div class="progress"><i style="width:${(x.visits / Math.max(1, ...mk.devices.map((y) => y.visits)) * 100).toFixed(1)}%"></i></div></div>`).join('') || '<p class="muted">Нет данных.</p>'}</div>
      <div class="card"><h2>Дни недели</h2><p class="small muted">Средние визиты за день</p>${[1, 2, 3, 4, 5, 6, 0].map((i) => `<div class="bar-row"><div class="row between small"><span>${WD[i]}</span><span>${wd[i].days ? Math.round(wd[i].avg) : '—'}</span></div><div class="progress"><i style="width:${(wd[i].avg / maxWd * 100).toFixed(1)}%"></i></div></div>`).join('')}</div>
    </div>
    ${(mk.errors || []).length ? `<p class="small muted">Часть отчётов Метрика не отдала: ${esc(mk.errors[0])}</p>` : ''}`,
    after() {
      const el = document.getElementById('mkChart');
      if (el) lineChart(el, { points: (mk.daily || []).map((x) => ({ label: fmtShort(x.key), value: x.visits })), fmtVal: (v) => num(v), height: 150 });
    },
  };
}
acts['an.ai'] = () => { sendToChat(packageText(app(), 'Разбери аналитику читателей по Метрике (metrikaSite): откуда приходят и кто покупает, что усилить, что исправить, что подождать. Конкретные шаги с цифрами.'), 'claude'); return false; };
