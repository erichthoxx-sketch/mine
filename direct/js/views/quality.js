// Диагностика качества: читаем только собственный Директ, никаких автоматических блокировок.
import { esc, changes } from '../../../js/ui.js';
import { rub, num } from '../../../js/format.js';
import { addDays } from '../../../js/calc.js';
import { goalTotals } from '../dcalc.js';
import { qualitySummary, MIN_PLACEMENT_CLICKS, HIGH_BOUNCE_PCT } from '../qualitycalc.js';
import { purchaseGoal } from '../launchcalc.js';
import { metrikaOf } from './metrika.js';

const money = v => rub(v, 0);
const dateText = v => v ? new Date(v).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'нет';
export function qualityView(a) {
  const c = a.ctx(), stats = a.snap('stats') || {}, main = a.snap('main');
  const from = addDays(c.today, -29), to = c.today;
  const all = (main?.campaigns || []).filter(x => x.state !== 'ARCHIVED');
  const selected = a.ui.qualityCid || '';
  const campaigns = selected ? all.filter(x => String(x.id) === selected) : all;
  const goal = purchaseGoal(metrikaOf(c));
  const goalFresh = !!goal && !!stats.mAt && !stats.mErr && Date.now() - Date.parse(stats.mAt) < 48*3600000;
  const summary = qualitySummary({
    campaigns, daily: stats.daily || [], conv: stats.conv || [],
    placeRows: stats.placements || [], goalId: goalFresh ? goal.id : null,
    from, to, qualityAt: stats.placementAt,
  });
  const places = summary.placements.filter(x => x.network === 'network');
  const reportCurrent = !!stats.placementAt && Date.now() - Date.parse(stats.placementAt) < 36*3600000;
  const reportNote = stats.placementAt ? (reportCurrent ? 'Обновлено' : 'Данные могут быть устаревшими') + ': ' + dateText(stats.placementAt) : 'Пока отчет по площадкам не загружен';
  return { html: `
  <div class="card tq">
    <div class="row between"><h2 style="margin:0">Контроль качества трафика</h2><button data-act="go" data-to="/experiments">Журнал решений</button></div>
    <p>Проверяем, куда расходуются деньги в твоем Директе и что делают читательницы после клика. <b>Ни один показатель не доказывает наличие ботов сам по себе.</b></p>
    <p class="small muted">Последние 30 дней: ${from} — ${to}. Реклама таргетологов из их отдельного кабинета не учитывается.</p>
    ${all.length ? `<label for="tq-select">Кампания</label><select id="tq-select" data-chg="tq.select">
      <option value="">Все мои кампании</option>
      ${all.map(x => `<option value="${esc(String(x.id))}"${String(x.id) === selected ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
    </select>` : '<p class="small muted">Кампаний пока нет. Данные появятся после первого запуска.</p>'}
    <div class="tiles d-tiles tq-tiles">
      <div><div class="k">Расход</div><div class="v">${money(summary.cost)}</div></div>
      <div><div class="k">Клики</div><div class="v">${num(summary.clicks)}</div></div>
      <div><div class="k">Цена клика</div><div class="v">${summary.clicks ? money(summary.cost / summary.clicks) : '—'}</div></div>
      <div><div class="k">Покупки по цели</div><div class="v">${summary.purchases == null ? '—' : num(summary.purchases)}</div></div>
    </div>
    ${goalFresh ? `<p class="small muted">Это целевые визиты по покупке, приписанные выбранным кампаниям Директом, а не подтвержденное число продаж конкретной книги.</p>
      ${summary.purchases > 0 ? `<p>Цена целевого визита «Покупка»: <b>${money(summary.paidActionCost)}</b>. Фактическую окупаемость сверяем с роялти в «Доходах».</p>` : ''}
      ${summary.purchases === 0 && summary.clicks >= 30 ? '<p class="small warnc">Более 30 кликов без покупок: проверь поисковые запросы, страницу романа и объявление. Это не доказательство ботов.</p>' : ''}
    ` : '<p class="small muted">Цена покупки не рассчитана: нужен свежий отчет Директа по главной цели. Проверь Метрику и нажми «Обновить».</p>'}
  </div>
  <div class="card tq">
    <h2>Поиск и РСЯ отдельно</h2>
    <p class="small muted">Это данные по размещениям, а не все визиты счетчика Метрики.</p>
    <div class="tq-types">
      <div><b>Поиск</b><span>${money(summary.byNetwork.search.cost)} · ${num(summary.byNetwork.search.clicks)} кликов</span></div>
      <div><b>РСЯ</b><span>${money(summary.byNetwork.network.cost)} · ${num(summary.byNetwork.network.clicks)} кликов</span></div>
    </div>
    <p class="small muted">${esc(reportNote)}. Период: последние 30 дней на дату отчета.</p>
    ${stats.placementErr ? `<p class="small warnc">${esc(stats.placementErr)}</p>` : ''}
    <div class="row"><button data-act="d.reload">Обновить данные</button></div>
  </div>
  <div class="card tq">
    <h2>Что проверить в РСЯ</h2>
    <p class="small muted">Ориентир для ручной проверки: от ${MIN_PLACEMENT_CLICKS} оплаченных кликов и ${HIGH_BOUNCE_PCT}% отказов. Это не «детектор ботов» и не автоматическое решение об исключении площадки.</p>
    ${summary.flags.length ? `<div class="tq-flags">
      ${summary.flags.map(x => `<div class="tq-flag"><b>${esc(x.place)}</b>
        <span>${num(x.clicks)} кликов · ${money(x.cost)} · отказы ${x.bounce}%</span>
        <p class="small">Проверь аудиторию и соответствие объявления книге. Пока ничего не блокируем.</p>
      </div>`).join('')}</div>` : '<p class="muted">Нет площадок, превысивших ориентир проверки. Это не гарантия отсутствия некачественного трафика.</p>'}
    ${places.length ? `<details><summary>Все площадки РСЯ (${places.length})</summary><div class="scroll">
      <table class="tq-table"><thead><tr><th>Площадка</th><th>Клики</th><th>Расход</th><th>Отказы</th><th>Проверка</th></tr></thead><tbody>
      ${places.slice(0, 80).map(x => `<tr><td>${esc(x.place)}</td><td>${num(x.clicks)}</td><td>${money(x.cost)}</td><td>${x.bounce == null ? '—' : x.bounce + '%'}</td>
        <td>${x.clicks < MIN_PLACEMENT_CLICKS ? 'Мало данных' : x.bounce != null && x.bounce >= HIGH_BOUNCE_PCT ? 'Посмотреть' : 'Нет сигнала'}</td></tr>`).join('')}
      </tbody></table></div></details>` : '<p class="small muted">Пока нет площадок с расходами РСЯ в этом отчете.</p>'}
  </div>
  <div class="card tq">
    <h2>Отдельно по кампаниям</h2>
    ${!campaigns.length ? '<p class="muted">Собственных кампаний пока нет.</p>' : `<div class="list">${campaigns.map(x => {
      const t = goalTotals(stats.daily || [], goalFresh ? (stats.conv || []) : [], from, to, { cid: x.id, goals: goalFresh ? [goal.id] : [] });
      return `<div class="item"><b>${esc(x.name)}</b><div class="small muted">
        ${money(t.cost)} · ${num(t.clicks)} кликов · ${goalFresh ? num(t.conv) + ' целевых визитов' : 'покупки пока не проверены'}
      </div></div>`;
    }).join('')}</div>`}
    <p class="small muted">Никаких автоматических остановок, запретов площадок или правок бюджета.</p>
  </div>` };
}
changes['tq.select'] = value => { window.__app.ui.qualityCid = String(value || ''); window.__app.rerender(); };
