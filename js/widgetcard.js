// Карточка «Приоритетные показы в виджетах» — одна и та же в «Доходах» (Реклама) и в Мастерской (Маркетинг)
import { esc } from './ui.js';
import { num, rub, fmtDate, fmtMonth, fmtMonthIn } from './format.js';

const dm = (d) => fmtDate(d).slice(0, 5);
export function widgetCardHtml(p, settings = {}) {
  const n = p.next, cur = p.current;
  const target = (n.blocks + 1) * n.step, share = Math.min(1, n.spent / target || 0);
  const form = settings.widgetFormUrl ? `<a class="btn" href="${esc(settings.widgetFormUrl)}" target="_blank" rel="noopener">Открыть форму</a>` : '';
  const apply = n.applied
    ? `<div class="wg-status ok">✓ Заявка на ${fmtMonth(n.month)} подана</div>`
    : n.open
      ? `<div class="alert alert-thin wg-apply"><b>Пора подать заявку на ${fmtMonth(n.month)}</b> — до ${dm(n.deadline)}, 19:00 МСК.<br>В форме укажите расход: <b>${rub(n.spent, 0)}</b>${n.forecast > n.spent ? ` (к ${dm(n.to)} по плану ≈ ${rub(n.forecast, 0)})` : ''}.
          <div class="row" style="margin-top:8px">${form}<button class="primary" data-act="widget.applied" data-m="${n.month}">Заявку подала</button></div></div>`
      : `<div class="wg-status">Заявка на ${fmtMonth(n.month)}: с ${dm(n.to.slice(0, 8) + '15')} по ${dm(n.deadline)}, 19:00 МСК — напомню</div>`;
  return `<div class="card wg"><h2>Приоритетные показы в виджетах</h2>
    <div class="tiles">
      <div><div class="k">Сейчас, в ${fmtMonthIn(cur.month).split(' ')[0]}</div><div class="v">${cur.shows ? num(cur.shows) : '0'}</div><div class="s">показов · реклама ${dm(cur.from)}–${dm(cur.to)}: ${rub(cur.spent, 0)}</div></div>
      <div><div class="k">На ${fmtMonth(n.month).split(' ')[0]}</div><div class="v">${num(n.shows)}</div><div class="s">${n.forecastShows !== n.shows ? `по плану кампаний ≈ ${num(n.forecastShows)}` : 'показов сейчас'}</div></div>
    </div>
    <div class="wbar wg-bar"><div class="row between small"><span>Реклама ${dm(n.from)} – ${dm(n.to)}</span><span><b>${rub(n.spent, 0)}</b> из ${rub(target, 0)}</span></div>
      <div class="progress"><i style="width:${(share * 100).toFixed(1)}%"></i></div>
      <div class="small muted">ещё ${rub(n.toNext, 0)} — и будет ${num(n.nextShows)} показов</div></div>
    ${apply}
    <details class="wg-how"><summary>Как это считается</summary>
      <p class="small">За каждые ${rub(n.step, 0)} реально открученной рекламы «Литнет платит» — по ${n.perRub} показа за рубль: ${rub(n.step, 0)} → ${num(n.step * n.perRub)} показов, ${rub(n.step * 2, 0)} → ${num(n.step * 2 * n.perRub)}.</p>
      <p class="small">Считается реклама с 26-го по 25-е. Заявку подают через форму до 25-го, 19:00 МСК — показы идут в следующем месяце.</p></details>
  </div>`;
}
