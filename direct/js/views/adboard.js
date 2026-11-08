// «Вся реклама»: кампании из «Доходов» (Литнет платит, таргет, соцсети) — окупается ли каждая, что делать,
// сколько читателей и покупок принесла её ссылка Литнета (Метрика). Расчёт — js/adroi.js, тот же, что в «Доходах».
import { esc } from '../../../js/ui.js';
import { rub, num, fmtShort } from '../../../js/format.js';
import { adBoard } from '../../../js/adroi.js';
import { promoToken } from '../../../writer/js/promolinks.js';
import { litrefRows } from '../mcalc.js';
import { metrikaOf } from './metrika.js';
import { demo } from '../demo.js';

const KIND = { good: 'up', bad: 'down', even: '', wait: 'muted' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function boardCard(a) {
  if (demo.on) return '';
  const c = a.ctx(), rows = adBoard(c.data, c.settings, c.today);
  if (!rows.length) return '';
  const mk = a.snap('mk'), main = (metrikaOf(c)?.main || []).map(String);
  const refs = Object.fromEntries(litrefRows(mk?.litref || [], main).map((r) => [r.code.toLowerCase(), r]));
  const item = (x) => {
    const { c: k, m, p, v } = x, started = m.status !== 'planned';
    const state = x.live ? `● идёт${p.total ? ` · день ${num(p.day)} из ${num(p.total)}` : ''}` : `закончилась ${fmtShort(k.end)}`;
    const money = started ? [`расход ${rub(m.spendTotal, 0)}${v.est ? ' (оценка)' : ''}`, p.returned != null && v.kind !== 'wait' ? (p.returned >= 0 ? `вернула ${rub(p.returned, 0)} сверх обычного` : `доход ниже обычного на ${rub(-p.returned, 0)}`) : ''].filter(Boolean).join(' · ') : '';
    const code = x.link && promoToken(x.link.url), ref = code && refs[code.toLowerCase()];
    const hints = [];
    if (!k.bookId && x.book) hints.push(`Книга не выбрана, поэтому доход считается по всем книгам. По названию это «${esc(x.book.title)}» — выберите её в кампании.`);
    if (x.reportDue) hints.push('Нет отчёта о расходе за последнюю неделю — попросите у таргетолога и внесите кнопкой «Отчёт». Пока расход — оценка: бюджет поровну по дням.');
    return `<a class="item" href="../#/ad/${esc(k.id)}"><div class="row between"><b>${esc(k.name)}</b><span class="small ${x.live ? 'up' : 'muted'}">${state}</span></div>
      ${money ? `<div class="small">${money}</div>` : ''}
      <div class="small ${KIND[v.kind]}">${esc(cap(v.text))}${v.todo ? ` — ${esc(v.todo)}` : ''}</div>
      ${x.link ? `<div class="small muted">Ссылка «${esc(x.link.campaign || code)}»${ref ? `: за 90 дней ${num(ref.visits)} визитов${main.length ? ` · покупок ${num(ref.conv)}` : ''}` : ' — по ней пока не было визитов в Метрике'}</div>` : ''}
      ${hints.map((h) => `<div class="small warnc">${h}</div>`).join('')}</a>`;
  };
  return `<div class="card"><div class="row between"><h2 style="margin:0">Вся реклама</h2><span class="small muted">из «Доходов»</span></div>
    <p class="small muted">Окупаемость — как в «Доходах»: доход книги во время рекламы против обычных дней без неё. Нажмите на кампанию, чтобы внести отчёт или поправить.</p>
    <div class="list">${rows.map(item).join('')}</div></div>`;
}
