// Большая цель (например, 500 000 ₽ чистыми в месяц к январю 2030): статус, путь и вехи — для «Финансов» и «Главной»
import { bigGoalPlan, monthKey, addMonths, monthsBetween, buildPlan, monthFinance, NPD_LIMIT, planOverridesOf } from './calc.js';
import { acts, openSheet, toast, N, opt } from './ui.js';
import { rub, pct, fmtMonth, num } from './format.js';

const DAT = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];
const GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const nom = (k) => NOM[+k.slice(5, 7) - 1];
const gen = (k) => `${GEN[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;
// «к январю 2030»
export const byMonthText = (k) => `к ${DAT[+k.slice(5, 7) - 1]} ${k.slice(0, 4)}`;

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
// finOf(k) → { royalty, net, tax, taxBase }. Всё считаем в роялти (что начисляет площадка), «чистыми» — через долю,
// которая остаётся после комиссий и рекламы, минус налог. Налог — по годам: пока доход за год укладывается в лимит НПД
// (2,4 млн с базы налога) — ставка из настроек (4%); год, где лимит превышается, — как ИП на УСН «доходы» 6%.
export const USN_RATE = 0.06;
export function bigGoalStatus(c, finOf) {
  const g = c.settings.bigGoal;
  if (!g || !g.amount || !g.by) return null;
  const s = c.settings, cur = monthKey(c.today), first = monthKey(c.firstDate);
  const F = (k) => (k < first ? null : finOf(k));
  const R = (k) => Number(F(k)?.royalty) || 0;
  const last3 = [1, 2, 3].map((i) => addMonths(cur, -i)).filter((k) => k >= first), prev3 = [4, 5, 6].map((i) => addMonths(cur, -i)).filter((k) => k >= first);
  // доли — по текущему и трём прошлым месяцам: сколько остаётся до налога и какая база налога на 1 ₽ роялти
  const ks = [cur, ...last3].filter((k) => R(k) > 0);
  const sum = (f) => ks.reduce((m, k) => m + (Number(f(F(k))) || 0), 0), sr = sum((f) => f.royalty);
  const keep = sr > 0 ? Math.min(1, Math.max(0.3, sum((f) => f.net + f.tax) / sr)) : 0.75;
  const ratio = sr > 0 ? Math.max(0.5, sum((f) => f.taxBase) / sr) : 1;
  const npdRate = (Number(s.taxRate) || 4) / 100, limit = Number(s.npdLimit) || NPD_LIMIT, other = Number(s.npdOther) || 0;
  const netOf = (roy, rate) => roy * (keep - ratio * rate), royOf = (net, rate) => net / Math.max(0.05, keep - ratio * rate);
  // «сейчас» — самое свежее из честных оценок (в роялти): среднее за 3 месяца, прошлый месяц, прогноз текущего (с 10-го числа)
  const cands = [];
  if (last3.length) cands.push({ v: avg(last3.map(R)), from: `в среднем за ${last3.length === 1 ? 'месяц' : last3.length + ' месяца'}` });
  if (last3.length > 1) cands.push({ v: R(last3[0]), from: `за ${nom(last3[0])}` });
  const dEnd = c.dataEnd || c.today, dom = monthKey(dEnd) === cur ? Number(dEnd.slice(8, 10)) : 0;
  if (dom >= 10) { const dim = new Date(Date.UTC(+cur.slice(0, 4), +cur.slice(5, 7), 0)).getUTCDate(), fc = (R(cur) / dom) * dim; if (fc > 0) cands.push({ v: fc, from: `прогноз за ${nom(cur)}`, now: true }); }
  const pick = cands.reduce((m, x) => (x.v > (m?.v ?? -1) ? x : m), null) || { v: 0, from: 'данных пока нет' };
  const gross = g.kind === 'gross', toNet = (r) => (gross ? r : netOf(r, npdRate));
  const now = toNet(pick.v); // где я сейчас — для полосы прогресса
  // начало пути: своё («октябрь 2026 — 50 000 ₽», в роялти, как цели по месяцам) или по данным:
  // если «сейчас» — прогноз этого месяца, он и есть первый шаг; иначе первый шаг роста — этот месяц
  const own = Number(g.startRoy) > 0 && /^\d{4}-\d{2}$/.test(g.startMonth || '') && g.startMonth < g.by;
  const baseRoy = own ? Number(g.startRoy) : pick.v, base = toNet(baseRoy);
  const startM = own ? g.startMonth : pick.now ? cur : addMonths(cur, -1);
  const plan = bigGoalPlan({ target: Number(g.amount), byMonth: g.by, startMonth: startM, base });
  plan.miles = plan.miles.filter((m) => m.month >= cur);
  const future = plan.path.filter((p) => p.month >= cur);
  // налог по годам: год, где база налога выше лимита НПД, — УСН 6%
  const years = [...new Set(future.map((p) => p.month.slice(0, 4)))], regime = {};
  let usnFrom = null;
  for (const y of years) {
    if (usnFrom) { regime[y] = 'usn'; continue; }
    const done = monthsBetween(`${y}-01`, cur).filter((k) => k < cur && k.startsWith(y)).reduce((m, k) => m + (Number(F(k)?.taxBase) || 0), 0);
    const ahead = future.filter((p) => p.month.startsWith(y)).reduce((m, p) => m + (gross ? p.value : royOf(p.value, npdRate)) * ratio, 0);
    if (done + ahead + (y === c.today.slice(0, 4) ? other : 0) > limit) { regime[y] = 'usn'; usnFrom = y; } else regime[y] = 'npd';
  }
  const rateOf = (m) => (regime[m.slice(0, 4)] === 'usn' ? USN_RATE : npdRate);
  const roy = Object.fromEntries(future.map((p) => [p.month, Math.round(gross ? p.value : royOf(p.value, rateOf(p.month)))]));
  const curPlan = future[0]?.value ?? base, left = Math.max(0, monthsBetween(cur, g.by).length - 1);
  // как росли на самом деле: роялти, средние трёх месяцев — последние к предыдущим, в пересчёте на месяц
  const a = last3.map(R), b = prev3.map(R);
  const actual = a.length === 3 && b.length === 3 && avg(b) > 0 && avg(a) > 0 ? (avg(a) / avg(b)) ** (1 / 3) - 1 : null;
  return { g, base, now, own, startM, baseFrom: pick.from, plan, curPlan, curRoy: roy[cur] ?? baseRoy, targetRoy: roy[g.by], roy, left, actual, keep, ratio, npdRate, usnFrom, limit, onTrack: actual == null ? null : actual >= plan.growth, months: last3.length };
}
const cur0 = (st) => Object.keys(st.roy)[0] || st.g.by;
const fmtMln = (v) => `${num(v / 1e6, 1)} млн`;
// налог на пути: НПД, пока в лимите; год, где лимит превышается, — ИП на УСН 6%
function taxLine(st) {
  const { g, usnFrom, npdRate, limit } = st, y0 = cur0(st).slice(0, 4);
  const goalRoy = g.kind === 'gross' ? '' : ` Цель ≈ <b>${rub(st.targetRoy, 0)}</b> роялти в месяц.`;
  if (!usnFrom) return `Налог: НПД ${num(npdRate * 100, 0)}% — весь путь в лимите ${fmtMln(limit)} в год.${goalRoy}`;
  return `Налог: ${usnFrom === y0 ? '' : `НПД ${num(npdRate * 100, 0)}% до ${Number(usnFrom) - 1}, `}с ${usnFrom} — ИП на УСН 6%: доход выше лимита НПД ${fmtMln(limit)} в год.${goalRoy}`;
}
const word = (g) => (g.kind === 'gross' ? 'до вычетов' : 'чистыми');
// большая карточка в «Финансах»
export function bigGoalCard(st) {
  if (!st) return `<div class="card bg-card bg-empty"><div class="row between"><div><h2 style="margin:0">Большая цель</h2><p class="small muted" style="margin:4px 0 0">Например, 500 000 ₽ чистыми в месяц к началу 2030 — приложение посчитает путь, рост и вехи по годам.</p></div><button class="primary" data-act="bigGoal.edit">Поставить</button></div></div>`;
  const { g, plan, now: base, baseFrom, actual, onTrack } = st, share = Math.min(1, base / g.amount);
  return `<div class="card bg-card"><div class="row between"><h2 style="margin:0">Большая цель</h2><button class="link" data-act="bigGoal.edit">изменить</button></div>
    <div class="bg-target"><b>${rub(g.amount, 0)}</b> ${word(g)} в месяц · ${byMonthText(g.by)}</div>
    <div class="bg-now small"><span>сейчас ≈ <b>${rub(base, 0)}</b> в месяц <span class="muted">— ${baseFrom}</span></span><span class="muted">${pct(share, 0)}</span></div>
    <div class="progress"><i style="width:${(share * 100).toFixed(1)}%"></i></div>
    <div class="small bg-now-plan">${st.own && st.startM <= cur0(st) ? `Старт пути: ${nom(st.startM)} — <b>${rub(Number(g.startRoy), 0)}</b> роялти` : `План на ${nom(cur0(st))}: <b>${rub(st.curRoy, 0)}</b> роялти`}${g.kind === 'gross' ? '' : ` <span class="muted">≈ ${rub(st.curPlan, 0)} чистыми</span>`}</div>
    <div class="small bg-tax">${taxLine(st)}</div>
    <div class="bg-facts">
      <div><span>Нужный рост</span><b>+${num(plan.growth * 100, 1)}%</b><i>в месяц · ×${num(1 + plan.yearly, 1)} за год</i></div>
      <div><span>Сейчас растёт</span><b class="${onTrack == null ? '' : onTrack ? 'up' : 'down'}">${actual == null ? '—' : (actual >= 0 ? '+' : '−') + num(Math.abs(actual) * 100, 1) + '%'}</b><i>${actual == null ? 'нужно полгода данных' : onTrack ? 'в месяц · в темпе' : 'в месяц · медленнее плана'}</i></div>
      <div><span>Осталось</span><b>${st.left} мес.</b><i>до ${gen(g.by)}</i></div>
    </div>
    <div class="bg-miles">${plan.miles.map((m) => `<div><span>${m.month === g.by ? 'цель' : 'к концу ' + m.month.slice(0, 4)}</span><b>${rub(m.value, 0)}</b></div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="small-btn" data-act="bigGoal.apply">Разложить по месяцам</button><span class="small muted">— цели по месяцам ниже пересчитаются по этому пути</span></div></div>`;
}
// строчка на «Главной»
export function bigGoalLine(st) {
  if (!st) return '';
  const { g, now: base, plan, onTrack } = st;
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
    <p class="small muted">Сумма в месяц и к какому месяцу. Путь, нужный рост, налог и вехи по годам приложение посчитает само. Менять можно когда угодно.</p>
    <div class="f2"><div><label for="bgA">Сколько в месяц, ₽</label><input id="bgA" name="amount" inputmode="decimal" value="${g.amount || 500000}" required></div>
    <div><label for="bgB">К какому месяцу</label><input id="bgB" type="month" name="by" value="${g.by || def}" required></div></div>
    <div class="f2"><div><label for="bgSM">Начало пути</label><input id="bgSM" type="month" name="startMonth" value="${g.startMonth || monthKey(c.today)}"></div>
    <div><label for="bgSR">Цель этого месяца, ₽ роялти</label><input id="bgSR" name="startRoy" inputmode="decimal" value="${g.startRoy || ''}" placeholder="авто — по моим данным"></div></div>
    <div class="hint">С какой месячной цели начать путь — как в «Целях по месяцам» (до вычетов). Пусто — от того, сколько получается сейчас.</div>
    <label for="bgK">Считать</label><select id="bgK" name="kind">${opt('net', 'чистыми — после комиссии, рекламы и налога', g.kind || 'net')}${opt('gross', 'до вычетов (роялти)', g.kind || 'net')}</select>
    ${g.amount ? '<label class="check"><input type="checkbox" name="off">Убрать большую цель</label>' : ''}`, async (fd) => {
    if (fd.get('off')) { await app().store.saveSettings({ bigGoal: null }); toast('Большая цель убрана'); return; }
    const amount = N(fd.get('amount')), by = String(fd.get('by') || '');
    if (!amount || amount <= 0 || !/^\d{4}-\d{2}$/.test(by)) { toast('Укажите сумму и месяц'); return false; }
    if (by <= monthKey(c.today)) { toast('Месяц цели должен быть впереди'); return false; }
    const startRoy = N(fd.get('startRoy')), startMonth = String(fd.get('startMonth') || '');
    await app().store.saveSettings({ bigGoal: { amount, by, kind: fd.get('kind') === 'gross' ? 'gross' : 'net', startMonth: startRoy > 0 ? startMonth : '', startRoy: startRoy > 0 ? startRoy : null } });
    const st = bigGoalOf(app().ctx());
    if (st) await applyPath(app().ctx(), st);
    toast('Цель сохранена — путь и цели по месяцам пересчитаны');
  });
};
// разложить путь по помесячным целям (они в роялти): прошлые цели остаются как были, дальше — по пути к большой цели
// путь большой цели → помесячные цели (в роялти): прошлые цели остаются как были
async function applyPath(c, st) {
  const s = c.settings, cur = monthKey(c.today), first = st.curRoy;
  const start = s.goalStart && s.goalStart < cur ? s.goalStart : cur;
  const old = buildPlan({ startMonth: s.goalStart, startAmount: Number(s.goalAmount), growth: Number(s.goalGrowth) / 100, count: Number(s.goalMonths) || 13, overrides: planOverridesOf(s) });
  const o = {};
  for (const p of old) if (p.month >= start && p.month < cur) o[p.month] = p.plan; // прошлое — как было
  const i0 = monthsBetween(start, cur).length - 1, g = st.plan.growth;
  // planPath — путь по месяцам в роялти (со скачком налога при переходе на УСН); свои правки — поверх него
  await app().store.saveSettings({ goalStart: start, goalAmount: Math.round(first / (1 + g) ** i0), goalGrowth: Math.round(g * 10000) / 100, goalMonths: Math.min(60, i0 + st.left + 1), planOverrides: o, planPath: st.roy });
}
acts['bigGoal.apply'] = () => {
  const c = app().ctx(), s = c.settings, st = bigGoalOf(c);
  if (!st) return;
  const cur = monthKey(c.today), first = st.curRoy;
  openSheet('Разложить по месяцам', `<p>Цели по месяцам с ${gen(cur)} пойдут по пути к большой цели: ${rub(first, 0)} в этом месяце и дальше примерно +${num(st.plan.growth * 100, 1)}% каждый месяц.</p>
    ${st.g.kind === 'gross' ? '' : `<p class="small muted">Помесячные цели — в роялти (до вычетов): это то, что видно в отчётах Литнета. Перевод из «чистыми» — с учётом рекламы, комиссий и налога${st.usnFrom ? `, а с ${st.usnFrom} года — налога ИП на УСН 6%` : ''}.</p>`}
    <p class="small muted">Цели прошлых месяцев не меняются. Свои цели на будущие месяцы заменятся расчётом.</p>`, async () => {
    await applyPath(c, st);
    toast('Цели по месяцам пересчитаны');
  }, { submitText: 'Разложить' });
};
