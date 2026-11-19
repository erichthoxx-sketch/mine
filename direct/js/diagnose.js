// «Диагноз кампании» (19.11.2026, её просьба: «полноценный аналитический инструмент, чтобы стать топовым книжным таргетологом»).
// Как работает книжный директолог: 1) экономика одного добавления в библиотеку — цена против того, что оно приносит, и точка безубыточности;
// 2) воронка показ → клик → библиотека → покупка против прошлого периода — где узкое место; 3) разрезы (поиск/сети, устройства, пол, возраст,
// объявления, площадки) — где деньги работают, а где утекают, только при статистически заметной разнице; 4) план на неделю по пользе в рублях.
// Нормы берём не «из интернета», а из её же истории и из математики окупаемости. Чистые функции; тесты — tests/diagnose.test.js.
import { addDays } from '../../js/calc.js';
import { totals, convTotal, sumGoals } from './dcalc.js';

const r0 = (v) => Math.round(v);
const pct = (v) => (v == null ? '—' : (Math.round(v * 1000) / 10).toString().replace('.', ',') + ' %');
const rub = (v) => (v == null ? '—' : r0(v).toLocaleString('ru-RU') + ' ₽');
const zTwo = (k1, n1, k2, n2) => { if (!n1 || !n2) return 0; const p = (k1 + k2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); return se ? (k1 / n1 - k2 / n2) / se : 0; };
const ch = (now, was) => (now != null && was ? now / was - 1 : null);

// ---------- отчёт «кто кликает» → строки ----------
export function segRows(raw = []) {
  return raw.map((r) => {
    const cols = Object.keys(r).filter((k) => /^Conversions_/.test(k));
    return {
      cid: r.CampaignId, net: r.AdNetworkType === 'AD_NETWORK' ? 'n' : 's', dev: r.Device || 'UNKNOWN', gen: r.Gender || 'UNKNOWN', age: r.Age || 'UNKNOWN',
      impr: +r.Impressions || 0, clicks: +r.Clicks || 0, cost: Math.round((+r.Cost || 0) * 100) / 100,
      ...(cols.length ? { goals: Object.fromEntries(cols.map((k) => [k.split('_')[1], +r[k] || 0]).filter(([, v]) => v > 0)) } : {}),
    };
  });
}
export const SEG_LABEL = {
  net: { s: 'Поиск', n: 'Сети' },
  dev: { DESKTOP: 'Компьютеры', MOBILE: 'Телефоны', TABLET: 'Планшеты', UNKNOWN: 'Не известно' },
  gen: { GENDER_FEMALE: 'Женщины', GENDER_MALE: 'Мужчины', UNKNOWN: 'Пол не известен' },
  age: { AGE_0_17: 'До 18', AGE_18_24: '18–24', AGE_25_34: '25–34', AGE_35_44: '35–44', AGE_45_54: '45–54', AGE_55: '55+', UNKNOWN: 'Возраст не известен' },
};
export const SEG_NAME = { net: 'Поиск и сети', dev: 'Устройства', gen: 'Пол', age: 'Возраст', ad: 'Объявления', place: 'Площадки' };

// Разрез: доля расхода, добавления, цена добавления и вывод. Вывод — только при заметной разнице (95 %) и достаточных кликах.
// Сравниваем с остальными сегментами: cut — дорогой (ставку −50 % или исключить), boost — дешёвый (+20 %), few — мало данных, ok — как у остальных.
export function breakdown(items, { weekShare = 7 / 30 } = {}) {
  const tot = items.reduce((a, x) => ({ clicks: a.clicks + x.clicks, cost: a.cost + x.cost, lib: a.lib + x.lib }), { clicks: 0, cost: 0, lib: 0 });
  const crAll = tot.clicks ? tot.lib / tot.clicks : 0, cpaAll = tot.lib ? tot.cost / tot.lib : null;
  return items.filter((x) => x.cost > 0 || x.clicks > 0).map((x) => {
    const cr = x.clicks ? x.lib / x.clicks : null, cpa = x.lib ? x.cost / x.lib : null, share = tot.cost ? x.cost / tot.cost : 0;
    const restC = tot.clicks - x.clicks, restL = tot.lib - x.lib;
    const z = zTwo(x.lib, x.clicks, restL, restC), expect = x.clicks * crAll, cpaRest = restL ? (tot.cost - x.cost) / restL : null;
    let verdict = 'ok', effect = 0, text = '';
    if (x.clicks < 30 || expect < 3 || cpaAll == null) verdict = 'few';
    else if (z <= -1.96 && (cpa == null || cpa > (cpaRest ?? cpaAll) * 1.4)) {
      // деньги, которые уходят сверх обычной цены добавления
      effect = Math.max(0, (x.cost - x.lib * cpaAll) * weekShare);
      verdict = 'cut'; text = x.lib === 0 ? 'ни одного добавления — исключить' : 'добавление заметно дороже — ставку −50 %';
    } else if (z >= 1.96 && cpa != null && cpa < (cpaRest ?? cpaAll) * 0.75) {
      verdict = 'boost'; effect = x.lib * 0.2 * weekShare; text = 'добавление заметно дешевле — ставку +20 %';
    }
    return { ...x, cr, cpa, share, z, verdict, effect, text };
  }).sort((a, b) => b.cost - a.cost);
}
const sumBy = (rows, key, libIds) => {
  const m = new Map();
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    const v = m.get(k) || { k, impr: 0, clicks: 0, cost: 0, lib: 0 };
    v.impr += r.impr || 0; v.clicks += r.clicks || 0; v.cost += r.cost || 0; v.lib += sumGoals(r.goals || {}, libIds);
    m.set(k, v);
  }
  return [...m.values()];
};

// ---------- диагноз ----------
// libValue — сколько в среднем приносит одно добавление (роялти × доля «библиотека → покупка»); perSale — роялти с покупки.
export function diagnose({ camp, daily = [], conv = [], adDaily = [], ads = [], places = [], segments = [], goals = {}, today, libValue = null, perSale = null, skip = null, log = [] }) {
  const cid = camp.id, libIds = goals.lib ? [goals.lib] : [], buyIds = goals.buy || [];
  const f30 = addDays(today, -29), f7 = addDays(today, -6), p0 = addDays(today, -27), p1 = addDays(today, -7);
  const t30 = totals(daily, f30, today, cid), t7 = totals(daily, f7, today, cid), tp = totals(daily, p0, p1, cid);
  const lib = (from, to) => (libIds.length ? convTotal(conv, from, to, cid, libIds, skip) : 0);
  const buy = (from, to) => (buyIds.length ? convTotal(conv, from, to, cid, buyIds, skip) : 0);
  const L30 = lib(f30, today), L7 = lib(f7, today), Lp = lib(p0, p1), B30 = buy(f30, today);
  const unit = {
    impr: t30.impr, clicks: t30.clicks, cost: t30.cost, lib: L30, buy: B30,
    ctr: t30.impr ? t30.clicks / t30.impr : null, cpc: t30.clicks ? t30.cost / t30.clicks : null,
    cr: t30.clicks ? L30 / t30.clicks : null, cpa: L30 ? t30.cost / L30 : null,
    buyRate: L30 ? B30 / L30 : null, libValue,
  };
  // точка безубыточности: при нынешней доле добавлений клик может стоить не больше maxCpc; при нынешней цене клика нужна доля needCr
  unit.maxCpc = libValue != null && unit.cr ? unit.cr * libValue : null;
  unit.needCr = libValue && unit.cpc ? unit.cpc / libValue : null;
  unit.margin = libValue != null && unit.cpa ? libValue / unit.cpa : null; // > 1 — добавление окупается
  // воронка: последние 7 дней против трёх недель до них (в пересчёте на неделю)
  const wk = (x) => x * 7 / 21;
  const funnel = [
    { k: 'ctr', label: 'Из 100 показов кликают', now: t7.impr ? t7.clicks / t7.impr : null, was: tp.impr ? tp.clicks / tp.impr : null, fmt: pct, good: 'up' },
    { k: 'cpc', label: 'Клик стоит', now: t7.clicks ? t7.cost / t7.clicks : null, was: tp.clicks ? tp.cost / tp.clicks : null, fmt: (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toString().replace('.', ',') + ' ₽'), good: 'down' },
    { k: 'cr', label: 'Из 100 кликов — в библиотеку', now: t7.clicks ? L7 / t7.clicks : null, was: tp.clicks ? Lp / tp.clicks : null, fmt: pct, good: 'up' },
    { k: 'cpa', label: 'Добавление стоит', now: L7 ? t7.cost / L7 : null, was: Lp ? tp.cost / Lp : null, fmt: rub, good: 'down' },
    { k: 'vol', label: 'Добавлений в неделю', now: L7, was: Lp ? wk(Lp) : null, fmt: (v) => (v == null ? '—' : r0(v).toString()), good: 'up' },
  ].map((x) => {
    const d = ch(x.now, x.was), bad = d != null && Math.abs(d) >= 0.2 && (x.good === 'up' ? d < 0 : d > 0), good = d != null && Math.abs(d) >= 0.2 && !bad;
    return { ...x, d, tone: bad ? 'bad' : good ? 'good' : '' };
  });
  // разрезы
  const sg = segments.filter((x) => x.cid === cid);
  // объявления считаем, только если Директ отдал по ним цели (иначе «0 добавлений» — не правда, а пустота)
  const ad30 = adDaily.filter((x) => x.cid === cid && x.date >= f30 && x.goalMeasured);
  const groups = {
    net: breakdown((ad30.length ? sumBy(ad30, 'net', libIds) : sumBy(sg, 'net', libIds)).map((x) => ({ ...x, label: SEG_LABEL.net[x.k] || x.k }))),
    dev: breakdown(sumBy(sg, 'dev', libIds).map((x) => ({ ...x, label: SEG_LABEL.dev[x.k] || x.k }))),
    gen: breakdown(sumBy(sg, 'gen', libIds).map((x) => ({ ...x, label: SEG_LABEL.gen[x.k] || x.k }))),
    age: breakdown(sumBy(sg, 'age', libIds).map((x) => ({ ...x, label: SEG_LABEL.age[x.k] || x.k }))),
    ad: !ad30.length ? [] : breakdown(sumBy(ad30, 'aid', libIds).map((x) => { const a = ads.find((y) => String(y.id) === String(x.k)); return { ...x, label: a ? a.title || `Объявление ${x.k}` : `Объявление ${x.k}`, gid: a?.gid }; })),
    place: breakdown(places.filter((x) => x.cid === cid && x.network === 'network').map((x) => ({ k: x.place, label: x.place, impr: x.impr, clicks: x.clicks, cost: x.cost, lib: x.conv || 0, bounce: x.bounce }))).slice(0, 12),
  };
  if (!sg.length) { delete groups.dev; delete groups.gen; delete groups.age; }
  // данных мало — честно говорим, чего ждать
  const ran = camp.start ? Math.round((Date.parse(today) - Date.parse(camp.start)) / 864e5) + 1 : 30;
  const enough = L30 >= 5 && t30.clicks >= 100;
  // узкое место
  const by = Object.fromEntries(funnel.map((x) => [x.k, x]));
  let neck;
  if (!enough) neck = { k: 'data', title: 'Пока мало данных', text: `Для выводов нужно хотя бы 5 добавлений и 100 кликов за 30 дней (сейчас ${L30} и ${t30.clicks}).`, fix: ran < 7 ? 'Первую неделю стратегия учится — ничего не менять.' : 'Не дробить бюджет и не менять настройки — пусть копится статистика.' };
  else if (by.cr.tone === 'bad') neck = { k: 'cr', title: 'Меньше людей добавляют книгу', text: `Из 100 кликов в библиотеку добавляют ${pct(by.cr.now)} против ${pct(by.cr.was)} раньше.`, fix: 'Проверьте страницу книги на Литнете (обложка, аннотация, цена, не закончились ли бесплатные главы) и откуда пошёл трафик — ниже, в разрезах и площадках.' };
  else if (by.ctr.tone === 'bad') neck = { k: 'ctr', title: 'Объявления меньше цепляют', text: `Из 100 показов кликают ${pct(by.ctr.now)} против ${pct(by.ctr.was)} раньше — похоже на выгорание объявлений.`, fix: 'Добавить 1–2 новых объявления с другим крючком (другой троп, цитата, вопрос); старые не удалять сразу — пусть сравнятся.' };
  else if (by.cpc.tone === 'bad') neck = { k: 'cpc', title: 'Клик подорожал', text: `Клик стоит ${by.cpc.fmt(by.cpc.now)} против ${by.cpc.fmt(by.cpc.was)} раньше — выросла конкуренция или стратегия расширила показы.`, fix: 'Не поднимать цену цели; проверить дорогие разрезы ниже. Подорожание в декабре и перед праздниками — обычное дело.' };
  else if (unit.margin != null && unit.margin < 1) neck = { k: 'econ', title: 'Добавление дороже, чем приносит', text: `Добавление стоит ${rub(unit.cpa)}, а приносит в среднем ≈ ${rub(libValue)}.`, fix: unit.maxCpc != null ? `Чтобы выйти в плюс: либо клик не дороже ${rub(unit.maxCpc)} (сейчас ${rub(unit.cpc)}), либо из 100 кликов добавлять ${pct(unit.needCr)} (сейчас ${pct(unit.cr)}). Быстрее всего — убрать дорогие разрезы ниже.` : 'Убрать дорогие разрезы ниже.' };
  else if (Object.values(groups).flat().some((x) => x.verdict === 'cut')) {
    const lk = Object.entries(groups).flatMap(([g, l]) => l.filter((x) => x.verdict === 'cut').map((x) => ({ g, ...x }))).sort((a, b) => b.effect - a.effect);
    neck = { k: 'leak', title: 'Часть денег утекает', text: `Воронка ровная, но ${lk.slice(0, 3).map((x) => `«${x.label}» (${SEG_NAME[x.g].toLowerCase()})`).join(', ')} добавляют заметно реже остальных.`, fix: `Урезать ставки на них — это сбережёт ≈ ${rub(lk.reduce((a, x) => a + x.effect, 0))} в неделю без потери добавлений. Подробно — в «Плане на неделю».` };
  }
  else neck = { k: 'none', title: 'Узкого места не видно', text: 'Все шаги воронки на своём уровне или лучше.', fix: 'Кампания работает ровно: можно осторожно добавить бюджет (не больше +20 % в неделю) и следить за ценой добавления.' };
  // оценка 0–100: экономика 45, динамика 20, чистота трафика 15, объём для обучения 10, бюджет 10
  let score = null, grade = 'wait';
  const leaks = Object.values(groups).flat().filter((x) => x.verdict === 'cut');
  const leakShare = leaks.reduce((a, x) => a + x.share / (Object.keys(groups).length || 1), 0);
  if (enough) {
    const m = unit.margin;
    const econ = m == null ? 25 : m >= 1.5 ? 45 : m >= 1 ? 32 + (m - 1) * 26 : m >= 0.6 ? 12 + (m - 0.6) * 50 : 4;
    const dCpa = by.cpa.d, trend = dCpa == null ? 12 : dCpa <= -0.15 ? 20 : dCpa <= 0.1 ? 15 : dCpa <= 0.3 ? 8 : 2;
    const clean = Math.max(0, 15 - leakShare * 60);
    const volume = L7 >= 10 ? 10 : L7 >= 5 ? 6 : 2;
    const budget = camp.budget?.kind === 'week' && camp.budget.amount > 0 ? (t7.cost / camp.budget.amount >= 0.95 ? 7 : t7.cost / camp.budget.amount >= 0.5 ? 10 : 5) : 8;
    score = Math.max(0, Math.min(100, Math.round(econ + trend + clean + volume + budget)));
    grade = score >= 75 ? 'good' : score >= 55 ? 'ok' : score >= 35 ? 'weak' : 'bad';
  }
  const GRADE = { good: 'Работает хорошо', ok: 'Работает, есть что улучшить', weak: 'Работает слабо', bad: 'Сливает деньги', wait: 'Оценка появится позже' };
  // главное словами
  const why = [];
  if (enough) {
    if (unit.margin != null) why.push(unit.margin >= 1 ? `Добавление стоит ${rub(unit.cpa)} и приносит ≈ ${rub(libValue)} — запас ${pct(unit.margin - 1)}.` : `Добавление стоит ${rub(unit.cpa)}, а приносит ≈ ${rub(libValue)} — каждое в минусе на ${rub(unit.cpa - libValue)}.`);
    else why.push(`Добавление стоит ${rub(unit.cpa)}; сколько оно приносит, станет видно по продажам и Метрике автора.`);
    if (by.cpa.d != null && Math.abs(by.cpa.d) >= 0.15) why.push(`За последнюю неделю добавление ${by.cpa.d < 0 ? 'подешевело' : 'подорожало'} на ${pct(Math.abs(by.cpa.d))}.`);
    if (leaks.length) why.push(`Есть утечки: ${leaks.slice(0, 3).map((x) => x.label).join(', ')}.`);
  }
  // план на неделю — по пользе в рублях
  const plan = [];
  for (const [g, list] of Object.entries(groups)) for (const x of list) {
    if (x.verdict === 'cut') plan.push({ g, kind: 'cut', key: x.k, label: x.label, gid: x.gid, rub: x.effect, text: g === 'place' ? `Исключить площадку «${x.label}»` : g === 'ad' ? `Остановить объявление «${x.label}»` : `${SEG_NAME[g]}: «${x.label}» — ${x.lib ? 'ставку −50 %' : 'исключить (−100 %)'}`,
      why: `${rub(x.cost)} за 30 дней, добавлений ${x.lib}${x.cpa ? ` по ${rub(x.cpa)}` : ''} — дороже обычного; сэкономит ≈ ${rub(x.effect)} в неделю`, where: g === 'place' || g === 'ad' ? 'app' : 'cabinet' });
    if (x.verdict === 'boost') plan.push({ g, kind: 'boost', key: x.k, label: x.label, rub: x.effect * (unit.cpa || 0), text: `${SEG_NAME[g]}: «${x.label}» — ставку +20 %`, why: `добавление по ${rub(x.cpa)} против ${rub(unit.cpa)} в среднем; ≈ +${Math.max(1, r0(x.effect))} добавл. в неделю`, where: g === 'ad' || g === 'place' ? '' : 'cabinet' });
  }
  plan.sort((a, b) => b.rub - a.rub);
  if (neck.k === 'ctr') plan.unshift({ kind: 'ads', text: 'Добавить 1–2 новых объявления', why: neck.text, rub: 0, where: 'cabinet' });
  if (neck.k === 'cr') plan.unshift({ kind: 'page', text: 'Проверить страницу книги на Литнете', why: neck.text, rub: 0, where: '' });
  // динамика: цена добавления скользящим окном 7 дней за 60 дней + дни изменений
  const trend = [];
  for (let i = 59; i >= 0; i--) {
    const d = addDays(today, -i), w = totals(daily, addDays(d, -6), d, cid), l = lib(addDays(d, -6), d);
    trend.push({ date: d, cpa: l >= 2 ? w.cost / l : null, lib: l, cost: w.cost });
  }
  const marks = (log || []).filter((x) => String(x.cid) === String(cid) && x.ok !== false && x.at && x.at.slice(0, 10) >= addDays(today, -59)).map((x) => ({ date: x.at.slice(0, 10), text: x.text || x.why || '' }));
  return { score, grade, gradeText: GRADE[grade], why, unit, funnel, neck, groups, plan: plan.slice(0, 8), trend, marks, enough, ran };
}
