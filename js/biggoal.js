// Большая цель (например, 500 000 ₽ чистыми в месяц к январю 2030): статус, путь и вехи — для «Финансов» и «Главной»
import { bigGoalPlan, monthKey, addMonths, monthsBetween, buildPlan, monthFinance } from './calc.js';
import { acts, openSheet, toast, N, opt } from './ui.js';
import { rub, pct, fmtMonth, num } from './format.js';

const DAT = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];
const GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const gen = (k) => `${GEN[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
// «к январю 2030»
export const byMonthText = (k) => `к ${DAT[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
// finOf(k) → { royalty, net }; база — среднее трёх последних закончившихся месяцев
export function bigGoalStatus(c, finOf) {
  const g = c.settings.bigGoal;
  if (!g || !g.amount || !g.by) return null;
  const cur = monthKey(c.today), field = g.kind === 'gross' ? 'royalty' : 'net';
  const last3 = [1, 2, 3].map((i) => addMonths(cur, -i)), prev3 = [4, 5, 6].map((i) => addMonths(cur, -i));
  const val = (k) => { if (k < monthKey(c.firstDate)) return null; const f = finOf(k); return f ? Number(f[field]) || 0 : null; };
  const a = last3.map(val).filter((v) => v != null), b = prev3.map(val).filter((v) => v != null);
  const base = avg(a);
  const plan = bigGoalPlan({ target: Number(g.amount), byMonth: g.by, startMonth: cur, base });
  // как росли на самом деле: средние трёх месяцев — последние к предыдущим, в пересчёте на месяц
  const actual = a.length === 3 && b.length === 3 && avg(b) > 0 && base > 0 ? (base / avg(b)) ** (1 / 3) - 1 : null;
  // доля «чистыми» от роялти — чтобы перевести путь в помесячные цели (они в роялти)
  const roy = last3.filter((k) => k >= monthKey(c.firstDate)).map((k) => Number(finOf(k)?.royalty) || 0), net = last3.filter((k) => k >= monthKey(c.firstDate)).map((k) => Number(finOf(k)?.net) || 0);
  const share = Math.min(1, Math.max(0.3, avg(roy) ? avg(net) / avg(roy) : 0.7));
  return { g, base, plan, actual, share, onTrack: actual == null ? null : actual >= plan.growth, months: a.length };
}
const word = (g) => (g.kind === 'gross' ? 'до вычетов' : 'чистыми');
// большая карточка в «Финансах»
export function bigGoalCard(st) {
  if (!st) return `<div class="card bg-card bg-empty"><div class="row between"><div><h2 style="margin:0">Большая цель</h2><p class="small muted" style="margin:4px 0 0">Например, 500 000 ₽ чистыми в месяц к началу 2030 — приложение посчитает путь, рост и вехи по годам.</p></div><button class="primary" data-act="bigGoal.edit">Поставить</button></div></div>`;
  const { g, plan, base, actual, onTrack } = st, share = Math.min(1, base / g.amount);
  return `<div class="card bg-card"><div class="row between"><h2 style="margin:0">Большая цель</h2><button class="link" data-act="bigGoal.edit">изменить</button></div>
    <div class="bg-target"><b>${rub(g.amount, 0)}</b> ${word(g)} в месяц · ${byMonthText(g.by)}</div>
    <div class="bg-now small"><span>сейчас ≈ <b>${rub(base, 0)}</b> в месяц <span class="muted">— в среднем за 3 месяца</span></span><span class="muted">${pct(share, 0)}</span></div>
    <div class="progress"><i style="width:${(share * 100).toFixed(1)}%"></i></div>
    <div class="bg-facts">
      <div><span>Нужный рост</span><b>+${num(plan.growth * 100, 1)}%</b><i>в месяц · ×${num(1 + plan.yearly, 1)} за год</i></div>
      <div><span>Сейчас растёт</span><b class="${onTrack == null ? '' : onTrack ? 'up' : 'down'}">${actual == null ? '—' : (actual >= 0 ? '+' : '−') + num(Math.abs(actual) * 100, 1) + '%'}</b><i>${actual == null ? 'нужно полгода данных' : onTrack ? 'в месяц · в темпе' : 'в месяц · медленнее плана'}</i></div>
      <div><span>Осталось</span><b>${plan.n} мес.</b><i>до ${gen(g.by)}</i></div>
    </div>
    <div class="bg-miles">${plan.miles.map((m) => `<div><span>${m.month === g.by ? 'цель' : 'к концу ' + m.month.slice(0, 4)}</span><b>${rub(m.value, 0)}</b></div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="small-btn" data-act="bigGoal.apply">Разложить по месяцам</button><span class="small muted">— цели по месяцам ниже пересчитаются по этому пути</span></div></div>`;
}
// строчка на «Главной»
export function bigGoalLine(st) {
  if (!st) return '';
  const { g, base, plan, onTrack } = st;
  return `<a class="bg-line tap" href="#" data-act="go" data-to="/money"><span>Большая цель: <b>${rub(g.amount, 0)}</b> ${word(g)} ${byMonthText(g.by)}</span><span class="muted">сейчас ≈ ${rub(base, 0)} (${pct(Math.min(1, base / g.amount), 0)}) · нужно +${num(plan.growth * 100, 1)}% в месяц${onTrack == null ? '' : onTrack ? ' · <span class="up">в темпе</span>' : ' · <span class="down">медленнее плана</span>'}</span></a>`;
}

// всё по данным «Доходов»: месяц → роялти и чистыми
export const finOf = (c) => (k) => monthFinance(k, { sales: c.sales, legacyDays: c.legacyDays, spend: c.spend, discounts: c.discounts, months: c.monthsMap, settings: c.settings, litnet: c.litnetMoney });
export const bigGoalOf = (c) => bigGoalStatus(c, finOf(c));

const app = () => window.__app;
acts['bigGoal.edit'] = () => {
  const c = app().ctx(), g = c.settings.bigGoal || {};
  const def = addMonths(monthKey(c.today), 40).slice(0, 4) + '-01'; // ~3,5 года — к ближайшему январю
  openSheet('Большая цель', `
    <p class="small muted">Сумма в месяц и к какому месяцу. Путь, нужный рост и вехи по годам приложение посчитает само — от вашего среднего дохода за последние 3 месяца. Менять можно когда угодно.</p>
    <div class="f2"><div><label for="bgA">Сколько в месяц, ₽</label><input id="bgA" name="amount" inputmode="decimal" value="${g.amount || 500000}" required></div>
    <div><label for="bgB">К какому месяцу</label><input id="bgB" type="month" name="by" value="${g.by || def}" required></div></div>
    <label for="bgK">Считать</label><select id="bgK" name="kind">${opt('net', 'чистыми — после комиссии, рекламы и налога', g.kind || 'net')}${opt('gross', 'до вычетов (роялти)', g.kind || 'net')}</select>
    ${g.amount ? '<label class="check"><input type="checkbox" name="off">Убрать большую цель</label>' : ''}`, async (fd) => {
    if (fd.get('off')) { await app().store.saveSettings({ bigGoal: null }); toast('Большая цель убрана'); return; }
    const amount = N(fd.get('amount')), by = String(fd.get('by') || '');
    if (!amount || amount <= 0 || !/^\d{4}-\d{2}$/.test(by)) { toast('Укажите сумму и месяц'); return false; }
    if (by <= monthKey(c.today)) { toast('Месяц цели должен быть впереди'); return false; }
    await app().store.saveSettings({ bigGoal: { amount, by, kind: fd.get('kind') === 'gross' ? 'gross' : 'net' } });
    toast('Цель сохранена — путь пересчитан');
  });
};
// разложить путь по помесячным целям (они в роялти): прошлые цели остаются как были, дальше — по пути к большой цели
acts['bigGoal.apply'] = () => {
  const c = app().ctx(), s = c.settings, st = bigGoalOf(c);
  if (!st) return;
  const cur = monthKey(c.today), toRoy = st.g.kind === 'gross' ? 1 : 1 / st.share;
  const first = st.plan.path[0].value * toRoy;
  openSheet('Разложить по месяцам', `<p>Цели по месяцам с ${gen(cur)} пойдут по пути к большой цели: ${rub(first, 0)} в этом месяце и дальше +${num(st.plan.growth * 100, 1)}% каждый месяц.</p>
    ${st.g.kind === 'gross' ? '' : `<p class="small muted">Помесячные цели считаются в роялти (до вычетов). Сейчас чистыми остаётся около ${pct(st.share, 0)} роялти, поэтому ${rub(st.g.amount, 0)} чистыми ≈ ${rub(st.g.amount * toRoy, 0)} роялти.</p>`}
    <p class="small muted">Цели прошлых месяцев не меняются. Свои цели на будущие месяцы заменятся расчётом.</p>`, async () => {
    const start = s.goalStart && s.goalStart < cur ? s.goalStart : cur;
    const old = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: s.planOverrides || {} });
    const o = {};
    for (const p of old) if (p.month >= start && p.month < cur) o[p.month] = p.plan; // прошлое — как было
    const i0 = monthsBetween(start, cur).length - 1, g = st.plan.growth;
    await app().store.saveSettings({ goalStart: start, goalAmount: Math.round(first / (1 + g) ** i0), goalGrowth: Math.round(g * 10000) / 100, goalMonths: Math.min(60, i0 + st.plan.n + 1), planOverrides: o });
    toast('Цели по месяцам пересчитаны');
  }, { submitText: 'Разложить' });
};
