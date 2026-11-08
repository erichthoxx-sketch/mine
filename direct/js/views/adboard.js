// «Вся реклама»: кампании из «Доходов» (Литнет платит, таргет, соцсети) — окупается ли каждая, что делать,
// сколько читателей и покупок принесла её ссылка Литнета (Метрика). Расчёт — js/adroi.js, тот же, что в «Доходах».
import { esc } from '../../../js/ui.js';
import { rub, num, fmtShort } from '../../../js/format.js';
import { adBoard, channelCompare, channelVerdict } from '../../../js/adroi.js';
import { addDays, budgetPlan } from '../../../js/calc.js';
import { adCtx } from '../../../js/adroi.js';
import { fmtMonth } from '../../../js/format.js';
import { goalTotals } from '../dcalc.js';
import { linkCode } from '../../../writer/js/promolinks.js';
import { litrefRows, royaltyPerSale } from '../mcalc.js';
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
    const code = x.link && linkCode(x.link), ref = code && refs[code.toLowerCase()];
    const hints = [];
    if (!k.bookId && x.book) hints.push(`Книга не выбрана, поэтому доход считается по всем книгам. По названию это «${esc(x.book.title)}» — выберите её в кампании.`);
    if (x.reportDue) hints.push('Нет отчёта о расходе за последнюю неделю — попросите у таргетолога и вставьте его сообщение в кампании («Вставить отчёт»). Пока расход — оценка: бюджет поровну по дням.');
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

// «Сравнение каналов»: за 90 дней по каждому каналу — расход, читатели, покупки, цена читателя и покупки, отдача рубля
export function channelCard(a) {
  if (demo.on) return '';
  const c = a.ctx(), t = c.today, main = (metrikaOf(c)?.main || []).map(String), mk = a.snap('mk'), stats = a.snap('stats');
  const refs = Object.fromEntries(litrefRows(mk?.litref || [], main).map((r) => [r.code.toLowerCase(), r]));
  const direct = stats?.daily?.length ? goalTotals(stats.daily, stats.conv || [], addDays(t, -89), t, { goals: main }) : null;
  const perSale = royaltyPerSale(c.data.sales || [], t)?.perSale ?? null;
  const rows = channelCompare(c.data, c.settings, t, { refs, direct: direct && { cost: direct.cost, clicks: direct.clicks, conv: main.length ? direct.conv : null }, perSale });
  if (!rows.length) return '';
  const v = channelVerdict(rows);
  const cell = (r) => {
    const parts = [r.spend ? `расход ${rub(r.spend, 0)}${r.est ? ' (оценка)' : ''}` : 'без расхода',
      r.readers != null ? `${r.clicksAsReaders ? 'кликов' : 'читателей'} ${num(r.readers)}${r.perReader != null ? ` по ${rub(r.perReader, 0)}` : ''}` : '',
      r.buys != null && main.length ? `покупок ${num(r.buys)}${r.perBuy != null ? ` по ${rub(r.perBuy, 0)}` : ''}` : ''].filter(Boolean);
    const ret = r.ret != null ? `<div class="small ${r.ret >= 1.2 ? 'up' : r.ret < 0.9 ? 'down' : ''}">на 1 ₽ — ${r.ret.toFixed(2).replace('.', ',')} ₽ ${r.retByBuys ? 'с покупок по рекламе' : 'дохода сверх обычного'}</div>` : '';
    return `<div class="item"><div class="row between"><b>${esc(r.name)}</b>${r.camps ? `<span class="small muted">кампаний ${num(r.camps)}</span>` : ''}</div><div class="small">${parts.join(' · ')}</div>${ret}</div>`;
  };
  const b = budgetPlan({ ...adCtx(c.data, c.settings, t), settings: c.settings });
  const best = v?.best && rows.find((r) => r.key === v.best);
  const plan = b.status === 'ok' ? `На ${fmtMonth(b.month)} до цели не хватает ≈ ${rub(b.gap, 0)}: ${b.booked ? `к уже заведённой рекламе (${rub(b.booked, 0)}) стоит добавить` : 'нужно вложить'} ≈ <b>${rub(b.budget, 0)}</b> — принесёт ≈ ${rub(b.extraIncome, 0)} сверх обычного${best ? `, лучше — в «${esc(best.name)}»` : ''}.${b.lowData ? ' Оценка пока грубая.' : ''}`
    : b.status === 'booked' ? `На ${fmtMonth(b.month)} уже заведённой рекламы (${rub(b.booked, 0)}) хватает до цели — новый бюджет нужен, только чтобы вырасти сверх неё.`
    : b.status === 'unprofitable' ? `На ${fmtMonth(b.month)} до цели не хватает ≈ ${rub(b.gap, 0)}, но реклама пока возвращала меньше, чем стоила: добавлять деньги невыгодно — сначала сменить книгу, текст или аудиторию.`
    : b.status === 'enough' ? `На ${fmtMonth(b.month)} цель достижима и без рекламы.` : '';
  return `<div class="card"><div class="row between"><h2 style="margin:0">Сравнение каналов</h2><span class="small muted">за 90 дней</span></div>
    ${v ? `<p class="small"><b>${esc(v.text)}</b></p>` : '<p class="small muted">Вывод появится, когда хотя бы у двух каналов будет расход и 30+ читателей.</p>'}
    <div class="list">${rows.map(cell).join('')}</div>
    ${plan ? `<div class="item"><b>Бюджет на ${fmtMonth(b.month)}</b><div class="small">${plan}</div><div class="small muted">Как считается — «Доходы» → Финансы → Цели.</div></div>` : ''}
    <p class="small muted">Читатели и покупки — по ссылкам Литнета в Метрике (у Директа — клики и покупки из его отчётов). «Дохода сверх обычного» — как в «Доходах».</p></div>`;
}
