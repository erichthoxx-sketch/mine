// «Деньги»: Директ по месяцам (расход, добавления, покупки, роялти с покупок, отдача рубля) + вся реклама из «Доходов»
// и сравнение каналов с бюджетом на следующий месяц (adboard.js — тот же расчёт, что в «Доходах»).
import { esc } from '../../../js/ui.js';
import { rub, num, fmtMonth } from '../../../js/format.js';
import { goalsOf, directMonths } from '../pult.js';
import { royaltyPerSale } from '../mcalc.js';
import { metrikaOf } from './metrika.js';
import { boardCard, channelCard } from './adboard.js';

export function moneyView(a) {
  const c = a.ctx(), stats = a.snap('stats') || {}, m = metrikaOf(c) || {};
  const perSale = royaltyPerSale(c.data.sales || [], c.today)?.perSale ?? null;
  const rows = directMonths({ daily: stats.daily || [], conv: stats.conv || [], goals: goalsOf(m), perSale });
  const dirCard = rows.length ? `<div class="card"><div class="row between"><h2 style="margin:0">Яндекс Директ по месяцам</h2><span class="small muted">${perSale != null ? `покупка ≈ ${rub(perSale, 0)} роялти` : ''}</span></div>
    <div class="list">${rows.map((r) => `<div class="item"><div class="row between"><b>${esc(fmtMonth(r.month))}</b><span>${rub(r.cost, 0)}</span></div>
      <div class="small">${[`кликов ${num(r.clicks)}`, r.lib != null ? `в библиотеку ${num(r.lib)}${r.lib ? ` по ${rub(r.cost / r.lib, 0)}` : ''}` : '', r.buy != null ? `покупок ${num(r.buy)}${r.buy ? ` по ${rub(r.cost / r.buy, 0)}` : ''}` : ''].filter(Boolean).join(' · ')}</div>
      ${r.ret != null && r.buy ? `<div class="small ${r.ret >= 1.2 ? 'up' : r.ret < 0.9 ? 'down' : ''}">роялти с покупок ≈ ${rub(r.rev, 0)} — на 1 ₽ ${r.ret.toFixed(2).replace('.', ',')} ₽</div>` : ''}</div>`).join('')}</div>
    <p class="small muted">Покупки — те, что Директ засчитал рекламе по цели Метрики. Читательницы из библиотеки покупают и позже, поэтому полная отдача обычно выше — её видно в «Сравнении каналов» и в «Доходах».</p></div>` : '';
  const html = dirCard + cohortCard(a) + channelCard(a) + boardCard(a);
  return { html: html || '<div class="card"><p class="muted">Здесь появятся деньги по рекламе, когда будет расход в Директе или реклама в «Доходах».</p></div>' };
}

// «Когда покупают» — когорты по Метрике автора (js/cohorts.js, обновляется раз в сутки): кто пришёл с Директа, с другой рекламы и сам
function cohortCard(a) {
  const k = a.snap('cohorts');
  if (!k?.groups) return '';
  const pc = (v) => (v == null ? '—' : (v * 100).toFixed(1).replace('.', ',') + ' %');
  const rows = [['direct', 'С Директа'], ['ads', 'С другой рекламы'], ['other', 'Пришли сами']].map(([id, t]) => [t, k.groups[id]]).filter(([, g]) => g?.n);
  if (!rows.length) return '';
  const d = k.groups.direct, ref = d?.buy >= 5 ? d : rows.map(([, g]) => g).sort((x, y) => y.buy - x.buy)[0];
  const note = ref?.buy >= 5 ? `Половина покупок случается в первые ${ref.median === 0 ? 'сутки' : `${ref.median} дн.`} после первого визита${ref.lateShare != null ? `, ${Math.round(ref.lateShare * 100)} % — не в первый заход` : ''}. Значит, судить о кампании по покупкам стоит не раньше, чем через ${Math.max(7, (ref.median || 0) * 2)} дней после старта.` : 'Покупок с Директа пока мало для выводов — цифры появятся по мере накопления.';
  return `<div class="card"><div class="row between"><h2 style="margin:0">Когда покупают</h2><span class="small muted">впервые пришли ${k.from.slice(8, 10)}.${k.from.slice(5, 7)}–${k.to.slice(8, 10)}.${k.to.slice(5, 7)}</span></div>
    <div style="overflow-x:auto;margin-top:8px"><table class="tq-table"><thead><tr><th>Читательницы</th><th style="text-align:right">Пришло</th><th style="text-align:right">В библиотеку</th><th style="text-align:right">Купили за 7 дн.</th><th style="text-align:right">за 30</th><th style="text-align:right">за 60</th><th style="text-align:right">за 90</th></tr></thead>
    <tbody>${rows.map(([t, g]) => `<tr><td>${t}</td><td style="text-align:right">${num(g.n)}</td><td style="text-align:right">${pc(g.n ? g.lib / g.n : null)}</td>${[7, 30, 60, 90].map((x) => `<td style="text-align:right">${pc(g.by[x])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="small" style="margin:10px 0 0">${note}</p>
    <p class="small muted" style="margin:6px 0 0">Доля «за N дней» считается только по тем, кто пришёл не позже чем N дней назад; «—» — таких пока меньше 20. Считается первая покупка любой вашей книги.</p></div>`;
}
