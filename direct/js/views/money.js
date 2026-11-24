// «Деньги»: Директ по месяцам (расход, добавления, покупки, роялти с покупок, отдача рубля) + вся реклама из «Доходов»
// и сравнение каналов с бюджетом на следующий месяц (adboard.js — тот же расчёт, что в «Доходах»).
import { esc } from '../../../js/ui.js';
import { rub, num, fmtMonth } from '../../../js/format.js';
import { goalsOf, directMonths } from '../pult.js';
import { royaltyPerSale } from '../mcalc.js';
import { metrikaOf } from './metrika.js';
import { boardCard, channelCard } from './adboard.js';
import { bookEconomicsCard } from './bookeconomics.js';
import { pultModel } from './pult.js';
import { diagOf } from './diagnose.js';
import { compareRows, KIND_TEXT } from '../compare.js';
import { adBoard } from '../../../js/adroi.js';
import { conversionEvidence, missingConversionsDuringSpend } from '../evidence.js';
import { outageSet } from '../../../js/calc.js';
import { q } from './common.js';
import { demo } from '../demo.js';

export function moneyView(a) {
  const c = a.ctx(), stats = a.snap('stats') || {}, m = metrikaOf(c) || {};
  const perSale = royaltyPerSale(c.data.sales || [], c.today)?.perSale ?? null;
  const daily = stats.daily || [], goals = goalsOf(m), skip = outageSet(c.data.days || []);
  const ready = conversionEvidence(stats, c.today).ready &&
    (!stats.goalIds || [goals.lib, ...goals.buy].filter(Boolean).every((id) => stats.goalIds.includes(id)));
  const conversionsFor = (from, to) => ready && (!stats.convFrom || from >= stats.convFrom) &&
    !missingConversionsDuringSpend(daily, from, to, skip);
  const rows = directMonths({ daily, conv: stats.conv || [], goals, perSale, conversionsFor });
  const dirCard = rows.length ? `<div class="card"><div class="row between"><h2 style="margin:0">Яндекс Директ по месяцам</h2><span class="small muted">${perSale != null ? `покупка ≈ ${rub(perSale, 0)} роялти` : ''}</span></div>
    <div class="list">${rows.map((r) => `<div class="item"><div class="row between"><b>${esc(fmtMonth(r.month))}</b><span>${rub(r.cost, 0)}</span></div>
      <div class="small">${[`кликов ${num(r.clicks)}`, r.lib != null ? `в библиотеку ${num(r.lib)}${r.lib ? ` по ${rub(r.cost / r.lib, 0)}` : ''}` : '', r.buy != null ? `покупок ${num(r.buy)}${r.buy ? ` по ${rub(r.cost / r.buy, 0)}` : ''}` : ''].filter(Boolean).join(' · ')}</div>
      ${r.ret != null && r.buy ? `<div class="small muted">Расчетный ориентир: ${rub(r.rev, 0)} ₽ на покупки по среднему роялти всего каталога — ${r.ret.toFixed(2).replace('.', ',')} ₽ на 1 ₽ расхода. Не подтвержденная рекламная выручка.</div>` : ''}
      ${r.exp ? `<div class="small muted">добавившие в библиотеку ещё принесут ≈ ${rub(r.exp, 0)} (оценка по прошлым книгам) — с ними на 1 ₽ ≈ ${r.retExp.toFixed(2).replace('.', ',')} ₽</div>` : ''}</div>`).join('')}</div>
    <p class="small muted">Покупки — срабатывания общей цели Метрики. Среднее роялти взято из «Доходов» по всем книгам; фактическую отдачу конкретной книги можно вычислить только при наличии данных о купленном произведении и источнике заказа. Когорты ниже показывают задержку покупок, но не их сумму.</p></div>` : '';
  const html = compareCard(a) + bookEconomicsCard(a) + dirCard + cohortCard(a) + channelCard(a) + boardCard(a);
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

// «Все кампании — кто работает лучше»: свой Директ (оценка «Диагноза») и кампании таргетологов и «Литнет платит» из «Доходов» по одному мерилу
export function compareCard(a) {
  const c = a.ctx();
  let direct = [];
  try {
    direct = pultModel(a).rows.map((r) => { const D = diagOf(a, r.camp, r); return D && { id: r.camp.id, name: r.camp.name, book: r.book?.title || '', cost: D.unit.cost, score: D.score, grade: D.grade, share: D.unit.margin, cpa: D.unit.cpa, enough: D.enough, live: r.st.key === 'on' || r.st.key === 'capped' }; }).filter(Boolean);
  } catch (e) { console.error(e); }
  const income = demo.on ? [] : adBoard(c.data, c.settings, c.today);
  const { rows, verdict } = compareRows({ direct, income, partners: (c.data.w_links || []).filter((x) => x.kind === 'target') });
  if (rows.length < 2) return '';
  const f2 = (v) => v.toFixed(2).replace('.', ',');
  const TONE = { good: 'up', even: '', bad: 'down', wait: 'muted' };
  return `<div class="card"><div class="row between"><h2 style="margin:0">Кампании и оценка отдачи</h2></div>
    ${verdict ? `<p style="margin:8px 0 0">${esc(verdict)}</p>` : ''}
    <div class="list cmp-list">${rows.map((x) => `<div class="item cmp-row${x.src === 'direct' ? ' cmp-go' : ''}"${x.src === 'direct' ? ` data-act="dg.open" data-id="${x.id}"` : ''}>
      <div class="row between" style="gap:10px;align-items:flex-start"><div style="min-width:0"><b class="cmp-n">${esc(x.name)}</b>${x.sub ? ` <span class="small muted">${esc(x.sub)}</span>` : ''}
        <div class="small muted">${esc(x.who)} · ${rub(x.cost, 0)}${x.live ? '' : ' · закончилась'}${x.note ? ` · ${esc(x.note)}` : ''}</div></div>
        <div class="cmp-r">${x.score != null ? `<span class="dg-score dg-sm dg-${x.grade}" title="Оценка «Диагноза»">${x.score}</span>` : ''}<div><b class="${TONE[x.kind]}">${x.share != null ? '≈ ' + f2(x.share) + ' ₽' : '—'}</b><div class="small ${TONE[x.kind]}">${KIND_TEXT[x.kind]}</div></div></div></div></div>`).join('')}</div>
    <p class="small muted" style="margin:8px 0 0">Справа — сколько возвращает 1 ₽ ${q('roi')}: у Директа — ожидаемое от добавлений в библиотеку, у кампаний «Доходов» — прирост дохода против обычных дней. Кружок — оценка «Диагноза» ${q('score')}; нажмите на кампанию Директа, чтобы открыть его.</p></div>`;
}
