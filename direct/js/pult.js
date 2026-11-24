// «Пульт» Директа: по каждой кампании — состояние, деньги, цена цели против заданной, окупаемость и вывод;
// сверху — что требует внимания. Только чистые функции (тесты — tests/pult.test.js). Бюджеты приложение не меняет.
import { addDays } from '../../js/calc.js';
import { totals, goalTotals, convTotal } from './dcalc.js';
import { missingConversionsDuringSpend } from './evidence.js';
import { paidName } from './launchcalc.js';
import { litnetPage, matchBook, reach } from './mcalc.js';

const r0 = (v) => Math.round(v);
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const weekStartOf = (d) => addDays(d, -((new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7)); // понедельник

// Цели: «добавление в библиотеку» и «покупка» — по названиям целей Метрики; цель стратегии кампании главнее
export function goalsOf(metrika = {}, camp = null) {
  const gs = metrika?.goals || [];
  const own = camp?.goal ? String(camp.goal) : null;
  const libraries = gs.filter((g) => /библиотек/i.test(g.name));
  const lib = libraries.find((g) => String(g.id) === own) || libraries[0];
  const purchases = gs.filter((g) => paidName(g.name));
  const selected = purchases.find((g) => (metrika.main || []).map(String).includes(String(g.id)));
  const buy = selected || (purchases.length === 1 ? purchases[0] : null);
  return { lib: lib ? String(lib.id) : null, buy: buy ? [String(buy.id)] : [], own };
}

// Книга кампании: по ссылке объявления на Литнете (номер книги или адрес), иначе по названию кампании
export function bookOfCampaign(camp, ads = [], wbooks = []) {
  const hrefs = ads.filter((x) => x.cid === camp.id).map((x) => x.href).filter(Boolean);
  const ids = new Set(hrefs.map((h) => litnetPage(h).bookId).filter(Boolean));
  if (ids.size > 1) return null;
  for (const h of hrefs) {
    const p = litnetPage(h);
    if (p.type !== 'book' || !p.bookId) continue;
    const byLink = wbooks.find((b) => [b.direct?.link, b.litnetUrl].some((u) => u && litnetPage(u).bookId === p.bookId));
    if (byLink) return { id: byLink.id, title: byLink.title, href: h };
    const t = matchBook(p.slug, wbooks.map((b) => b.title));
    if (t) { const b = wbooks.find((x) => x.title === t); return { id: b.id, title: b.title, href: h }; }
    return { id: null, title: null, href: h };
  }
  const t = wbooks.find((b) => b.title && String(camp.name || '').toLowerCase().includes(b.title.toLowerCase()));
  return t ? { id: t.id, title: t.title, href: hrefs[0] || null } : hrefs[0] ? { id: null, title: null, href: hrefs[0] } : null;
}

// Состояние кампании простыми словами: key — для цвета и порядка
export function campaignState(camp, { daily = [], ads = [], today }) {
  const mine = ads.filter((x) => x.cid === camp.id && x.state !== 'ARCHIVED');
  if (camp.state === 'ARCHIVED') return { key: 'archived', text: 'в архиве', tone: 'muted' };
  if (camp.status === 'DRAFT') return { key: 'draft', text: 'черновик', tone: 'muted' };
  if (camp.status === 'MODERATION' || (mine.length && mine.every((x) => x.status === 'MODERATION'))) return { key: 'moderation', text: 'на модерации', tone: 'muted' };
  if (mine.length && mine.every((x) => x.status === 'REJECTED')) return { key: 'rejected', text: 'объявления отклонены', tone: 'bad' };
  if (camp.state === 'SUSPENDED' || camp.state === 'OFF') return { key: 'stopped', text: 'остановлена', tone: 'muted' };
  if (camp.end && camp.end < today) return { key: 'ended', text: 'закончилась', tone: 'muted' };
  if (camp.start && camp.start > today) return { key: 'soon', text: `стартует ${camp.start.slice(8, 10)}.${camp.start.slice(5, 7)}`, tone: 'muted' };
  const ran = camp.start ? daysBetween(camp.start, today) : 99;
  const last2 = totals(daily, addDays(today, -1), today, camp.id);
  if (ran >= 1 && !last2.impr) return { key: 'idle', text: 'нет показов', tone: 'bad' };
  const wk = weekBudget(camp, daily, today);
  if (wk && wk.share >= 0.95) return { key: 'capped', text: 'упёрлась в недельный бюджет', tone: 'warn' };
  return { key: 'on', text: 'идёт', tone: 'good' };
}

// Недельный бюджет: потрачено с понедельника (так считает Директ) против лимита стратегии
export function weekBudget(camp, daily, today) {
  if (camp.budget?.kind !== 'week' || !(camp.budget.amount > 0)) return null;
  const spent = totals(daily, weekStartOf(today), today, camp.id).cost;
  const limit = r0(camp.budget.amount * VAT * 100) / 100;
  return { limit, spent, share: spent / limit };
}

// Деньги и цели кампании за 7 и 30 дней + вывод.
// perSale — роялти с одной покупки (из «Доходов»), libShare — доля «библиотека → покупка» по Метрике автора.
export function campaignEcon(camp, { daily = [], conv = [], today, goals, perSale = null, libShare = null, skip = null, convVerified = true }) {
  const from7 = addDays(today, -6), from30 = addDays(today, -29), cid = camp.id;
  const d7 = totals(daily, from7, today, cid), d30 = totals(daily, from30, today, cid), dToday = totals(daily, today, today, cid);
  const usable = convVerified && !missingConversionsDuringSpend(daily, from30, today, skip, cid);
  const lib7 = usable && goals.lib ? convTotal(conv, from7, today, cid, [goals.lib], skip) : null;
  const lib30 = usable && goals.lib ? convTotal(conv, from30, today, cid, [goals.lib], skip) : null;
  const buy30 = usable && goals.buy?.length ? convTotal(conv, from30, today, cid, goals.buy, skip) : null;
  const cpaLib = lib30 ? d30.cost / lib30 : null, cpaBuy = buy30 ? d30.cost / buy30 : null;
  const revenue = perSale != null && buy30 != null ? buy30 * perSale : null;
  // ценность добавления: часть читательниц из библиотеки потом покупает
  const libValue = perSale != null && libShare != null ? perSale * libShare : null;
  const target = camp.cpa || null; // цена цели в стратегии
  const ran = camp.start ? daysBetween(camp.start, today) + 1 : 30;
  let verdict;
  if (!usable) verdict = { kind: 'wait', text: 'Конверсии неполные или устарели: окупаемость пока неизвестна. Расход показан полностью.' };
  else if (!d30.cost) verdict = { kind: 'wait', text: 'расхода пока нет' };
  else if (buy30 >= 3 && revenue != null) {
    const ret = revenue / d30.cost;
    verdict = ret >= 1.2 ? { kind: 'good', text: `оценка окупаемости: на 1 ₽ — ${ret.toFixed(2).replace('.', ',')} ₽ роялти с покупок`, ret }
      : ret >= 0.9 ? { kind: 'even', text: `оценка близка к нулю: на 1 ₽ — ${ret.toFixed(2).replace('.', ',')} ₽ роялти`, ret }
        : { kind: 'bad', text: `оценка ниже безубыточности: на 1 ₽ — ${ret.toFixed(2).replace('.', ',')} ₽ роялти`, ret };
  } else if (lib30 >= 5 && cpaLib != null) {
    const over = target ? cpaLib / (target * VAT) : null;
    const worth = libValue != null ? cpaLib <= libValue : null;
    verdict = over != null && over > 1.5 ? { kind: 'bad', text: `добавление по ${r0(cpaLib)} ₽ — дороже цели ${r0(target * VAT)} ₽ с НДС в ${over.toFixed(1).replace('.', ',')} раза` }
      : worth === false ? { kind: 'warn', text: `добавление по ${r0(cpaLib)} ₽, а приносит в среднем ≈ ${r0(libValue)} ₽ — пока дороже, чем окупается` }
        : { kind: 'even', text: `добавление по ${r0(cpaLib)} ₽${target ? ` при цене цели ${r0(target)} ₽` : ''}; будущая окупаемость требует проверки по когортам` };
  } else verdict = { kind: 'wait', text: ran < 7 ? `учится (день ${ran}) — выводы после 7 дней и 5 добавлений` : 'мало добавлений для выводов — нужно хотя бы 5 за 30 дней' };
  return { today: dToday, d7, d30, usable, lib7, lib30, buy30, cpaLib, cpaBuy, revenue, libValue, libShare, target, ran, verdict };
}

// Этап кампании и следующий шаг (13.11.2026, её просьба: «понимать, когда переключить цель, когда создать другую кампанию»).
// Логика книжного таргетолога: 1) первые 7 дней стратегия учится — не трогаем; 2) до открытия подписки цель — добавления в библиотеку;
// 3) подписка открыта: цель на «покупку» меняем, когда реклама даёт хотя бы NEED_BUYS покупок за 7 дней — меньшего стратегии мало,
//    и она «ослепнет»; до этого остаёмся на библиотеке; 4) на покупках судим по отдаче рубля.
// Вторая кампания нужна редко: одна учится быстрее. Поводы — другая книга; ретаргетинг на добавивших, когда их набралось RETARGET_MIN и открыта подписка.
export const NEED_BUYS = 10, RETARGET_MIN = 300;
export function campaignStage(camp, { econ, st, goals, conv = [], today, subStart = '', perSale = null, skip = null, convVerified = true, wk = null }) {
  if (!['on', 'capped', 'idle'].includes(st?.key)) return null;
  if (!convVerified || econ?.usable === false) return { key: 'data', title: 'Сначала восстановить аналитику',
    text: 'Недостаточно надежных конверсий: менять цель и масштабировать рекламу по этому периоду нельзя.',
    checks: [], next: { what: 'Проверить цели и обновить Директ', why: 'Расход и цели могли обновиться в разное время.' },
    second: 'Не принимать решение о новой кампании по неполным данным.', buy7: 0, open: false, onBuy: false };
  const buySet = (goals.buy || []).map(String), onBuy = camp.goal != null && buySet.includes(String(camp.goal));
  const open = !!subStart && subStart <= today, dm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
  const buy7 = buySet.length ? convTotal(conv, addDays(today, -6), today, camp.id, buySet, skip) : 0;
  const lib7 = econ.lib7 || 0, libAll = econ.lib30 || 0, checks = [];
  const learnTill = camp.start ? addDays(camp.start, LEARN_DAYS) : null, learning = econ.ran < LEARN_DAYS;
  let key, title, text, next;
  if (onBuy) {
    key = 'buy'; title = 'Работает на покупки';
    const ret = perSale != null && econ.buy30 ? econ.buy30 * perSale / (econ.d30.cost || 1) : null;
    text = ret == null ? 'Покупок по этой кампании пока мало; цель покупки проверяем после открытия подписки, а не за 30 бесплатных дней.' : `Оценка по целевым событиям: за 30 дней на 1 ₽ рекламы — ${ret.toFixed(2).replace('.', ',')} ₽ предполагаемого роялти, не подтвержденная выручка.`;
    checks.push({ ok: buy7 >= NEED_BUYS, text: `покупок за 7 дней: ${buy7} (около ${NEED_BUYS} — ориентир для устойчивого обучения, не запрет теста)` });
    next = buy7 < NEED_BUYS / 2 ? { what: 'Проверить открутку и цель покупки, не переключать стратегию автоматически', why: `покупок с рекламы за 7 дней — ${buy7}; редкая цель может ограничивать показы, но возврат на библиотеки не доказывает окупаемости. Сверьте дату открытия подписки, показы, корректность цели и расходы после смены стратегии` }
      : ret != null && ret < 0.9 && econ.buy30 >= NEED_BUYS ? { what: 'Снизьте цену цели: покупка обходится дороже, чем приносит', why: 'расход превышает роялти с покупок по рекламе' }
        : { what: 'Ничего не менять — следить за отдачей раз в неделю', why: 'цель верная, данных стратегии хватает' };
  } else if (learning) {
    key = 'learn'; title = `Обучение — день ${econ.ran} из ${LEARN_DAYS}`;
    text = 'Директ подбирает аудиторию. Любая правка стратегии сейчас сбрасывает обучение.';
    next = { what: `Не трогать стратегию до ${learnTill ? dm(learnTill) : 'конца недели'}`, why: 'можно только минус-слова и новые объявления' };
  } else if (!open) {
    key = 'collect'; title = 'Набирает библиотеку';
    text = subStart ? `Подписка откроется ${dm(subStart)} — до неё цель «добавление в библиотеку» верная: покупать ещё нечего.` : 'Цель «добавление в библиотеку» верная, пока книга бесплатная. Дата открытия подписки не указана — поставьте её в Мастерской (книга → «О книге»), и я подскажу, когда менять цель.';
    checks.push({ ok: lib7 >= 10, text: `добавлений за 7 дней: ${lib7} (для устойчивой работы нужно от 10)` });
    if (econ.cpaLib != null && econ.libValue != null) checks.push({ ok: econ.cpaLib <= econ.libValue, text: `добавление стоит ${r0(econ.cpaLib)} ₽, приносит ≈ ${r0(econ.libValue)} ₽` });
    next = subStart ? { what: `${dm(subStart)} — открыть подписку; цель пока не менять`, why: `на покупки переключим, когда их станет от ${NEED_BUYS} в неделю` } : { what: 'Продолжать: цель менять рано', why: 'переключение на покупку — после открытия подписки' };
  } else {
    key = 'switch'; title = buy7 >= NEED_BUYS ? 'Пора переключить цель на покупку' : 'Подписка открыта — цель пока «библиотека»';
    text = buy7 >= NEED_BUYS ? `Реклама даёт ${buy7} покупок за 7 дней — этого хватает, чтобы стратегия училась прямо на покупках.` : `Покупок с рекламы за 7 дней: ${buy7}. Стратегии нужно от ${NEED_BUYS} в неделю, иначе она потеряет аудиторию.`;
    checks.push({ ok: true, text: `подписка открыта с ${dm(subStart)}` }, { ok: buy7 >= NEED_BUYS, text: `покупок за 7 дней: ${buy7} из ${NEED_BUYS}` });
    next = buy7 >= NEED_BUYS ? { what: 'Сменить цель кампании на «покупку»', why: 'бюджет и цена цели останутся прежними; первые 7 дней после смены — снова обучение', act: 'goal' }
      : { what: 'Оставить цель «библиотека» и ждать покупок', why: `проверяю каждый день; как наберётся ${NEED_BUYS} за неделю — предложу сменить` };
  }
  // нужна ли вторая кампания
  const second = st.key === 'capped' && econ.cpaLib != null && econ.libValue != null && econ.cpaLib < econ.libValue * 0.8 ? 'Не нужна: кампания упирается в бюджет при выгодных добавлениях — выгоднее поднять недельный бюджет этой, чем заводить новую.'
    : open && libAll >= RETARGET_MIN ? `Имеет смысл: за 30 дней ${libAll} добавлений — отдельная кампания-напоминание тем, кто добавил, но не купил (аудиторию создам в «Предложениях»).`
      : open ? `Пока не нужна: для кампании-напоминания добавивших мало (${libAll} из ${RETARGET_MIN}).`
        : 'Пока не нужна: одна кампания учится быстрее, а дробить бюджет до открытия подписки рано. Новая понадобится для следующей книги.';
  const price = goalPrice(camp, { onBuy, econ, perSale, wk, learning });
  const eta = onBuy ? null : switchEta(camp, { conv, goals, today, subStart, open, econ, skip, buy7 });
  return { key, title, text, next, checks, second, buy7, open, onBuy, price, eta };
}

// Рекомендуемая цена цели (19.11.2026, её просьба: «указывать рекомендуемую цену конверсии… погружая меня в процесс»).
// Предел — сколько в среднем приносит одна конверсия: добавление → ценность добавления (роялти × доля добавивших, кто потом покупает),
// покупка → роялти с покупки. Директ списывает с НДС, а цену цели в стратегии пишут без НДС — поэтому предел ÷ VAT.
// Рекомендуем 80 % предела: запас на колебания цены и на то, что не каждая конверсия из отчёта — новая читательница.
// Сравниваем с нынешней ценой цели: выше предела — снизить; намного ниже и бюджет недели не выбирается — можно поднять, но не больше чем на треть за раз.
export function goalPrice(camp, { onBuy = false, econ = {}, perSale = null, wk = null, learning = false } = {}) {
  const val = onBuy ? perSale : econ.libValue, now = camp.cpa || null, net = (v) => (v == null ? null : v / VAT);
  const forBuy = perSale != null ? { max: Math.floor(perSale / VAT), rec: Math.max(1, Math.floor(perSale * 0.8 / VAT)) } : null;
  if (val == null || !(val > 0)) return { ready: false, now, forBuy, what: onBuy ? 'покупка' : 'добавление',
    why: onBuy ? 'Чтобы посчитать, нужен доход с одной покупки — он берётся из выгрузки Литнета в «Доходах».' : 'Чтобы посчитать, нужна доля «добавила в библиотеку → купила» по Метрике автора и доход с покупки из «Доходов».' };
  const max = Math.max(1, Math.floor(val / VAT)), rec = Math.max(1, Math.floor(val * 0.8 / VAT));
  const fact = net(onBuy ? econ.cpaBuy : econ.cpaLib), under = wk && wk.share < 0.6;
  let k, text;
  if (!now) { k = 'set'; text = `Поставьте в стратегии ≈ ${rec} ₽ за ${onBuy ? 'покупку' : 'добавление'}.`; }
  else if (now > max * 1.02) { k = 'down'; text = `Сейчас ${now} ₽ — выше предела: каждая ${onBuy ? 'покупка' : 'конверсия'} в среднем в минусе. Снизьте до ≈ ${Math.max(rec, Math.ceil(now * 2 / 3))} ₽${Math.max(rec, Math.ceil(now * 2 / 3)) > rec ? `, через неделю — до ${rec} ₽` : ''}.`; }
  else if (now < rec * 0.7 && under) { k = 'up'; text = `Сейчас ${now} ₽, бюджет недели выбирается на ${Math.round(wk.share * 100)} %: Директу тесно по этой цене. Можно поднять до ≈ ${Math.min(rec, Math.floor(now * 4 / 3))} ₽ — запас до предела есть.`; }
  else { k = 'ok'; text = `Сейчас ${now} ₽ — в разумных пределах (рекомендую ≈ ${rec} ₽, предел ${max} ₽).`; }
  const to = k === 'down' ? Math.max(rec, Math.ceil(now * 2 / 3)) : k === 'up' ? Math.min(rec, Math.floor(now * 4 / 3)) : null;
  const brief = k === 'down' ? `снизить до ${to} ₽` : k === 'up' ? `можно поднять до ${to} ₽` : k === 'set' ? `поставить ${rec} ₽` : 'в норме';
  if (learning && (k === 'down' || k === 'up')) text += ' Но идёт обучение — менять после 7-го дня.';
  return { ready: true, onBuy, now, rec, max, to, brief, fact: fact != null ? Math.round(fact) : null, k, text, forBuy: onBuy ? null : forBuy,
    why: onBuy ? `Покупка приносит ≈ ${Math.round(val)} ₽ роялти. Без НДС это ${max} ₽ — дороже платить нельзя; 80 % — ${rec} ₽.`
      : `Добавление приносит ≈ ${Math.round(val)} ₽: роялти ${perSale != null ? Math.round(perSale) + ' ₽ ' : ''}× доля добавивших, кто потом покупает. Без НДС это ${max} ₽ — предел; 80 % — ${rec} ₽.` };
}

// Когда можно переключить цель на «покупку» (19.11.2026, её вопрос «через сколько это сделать»).
// Нужно NEED_BUYS покупок с рекламы за 7 дней. До подписки — оценка по добавлениям × доле покупающих (Метрика автора);
// после — темп с открытия и рост неделя к неделе. Не набирается — сколько добавлений в неделю нужно и во что это обойдётся.
export function switchEta(camp, { conv = [], goals = {}, today, subStart = '', open = false, econ = {}, skip = null, buy7 = 0 } = {}) {
  const buyIds = (goals.buy || []).map(String), dm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`, r0 = Math.round;
  const libShare = econ.libShare ?? null, lib7 = econ.lib7 || 0, cpaLib = econ.cpaLib;
  const needLib = libShare ? Math.ceil(NEED_BUYS / libShare) : null, needCost = needLib && cpaLib ? needLib * cpaLib : null;
  const short = needLib ? ` Чтобы покупок стало ${NEED_BUYS} в неделю, нужно ≈ ${needLib} добавлений в неделю (сейчас ${lib7})${needCost ? ` — это ≈ ${r0(needCost).toLocaleString('ru-RU')} ₽ в неделю при нынешней цене добавления` : ''}.` : '';
  if (!buyIds.length) return { k: 'nogoal', val: null, brief: 'цель «покупка» не выбрана', text: 'Цель «покупка» не выбрана в настройках Метрики Директа — без неё прогноз не посчитать.' };
  if (!open) {
    if (!subStart) return { k: 'nodate', val: null, brief: 'нет даты старта подписки', text: 'Дата старта подписки не указана (Мастерская → книга → «О книге»). Пока книга бесплатная, переключать не на что.' };
    if (libShare == null) return { k: 'collect', val: null, brief: `не раньше ${dm(addDays(subStart, 7))}`, text: `Подписка откроется ${dm(subStart)}. Переключить на покупку можно будет не раньше ${dm(addDays(subStart, 7))} — нужна неделя покупок, чтобы увидеть, хватает ли их.` };
    const exp = lib7 * libShare;
    return exp >= NEED_BUYS
      ? { k: 'soon', at: addDays(subStart, 7), val: exp, pre: true, brief: `≈ ${dm(addDays(subStart, 7))}`, text: `Подписка откроется ${dm(subStart)}. По Метрике автора покупает каждая ${r0(1 / libShare)}-я добавившая — при нынешних ${lib7} добавлениях в неделю ожидаю ≈ ${r0(exp)} покупок в неделю. Если так и будет, переключить можно ≈ ${dm(addDays(subStart, 7))}.` }
      : { k: 'low', val: exp, pre: true, brief: needLib ? `нужно ≈ ${needLib} добавлений в неделю` : 'мало для цели «покупка»', text: `Подписка откроется ${dm(subStart)}. По Метрике автора покупает каждая ${r0(1 / libShare)}-я добавившая — при нынешних ${lib7} добавлениях в неделю это ≈ ${Math.max(0, Math.round(exp * 10) / 10).toString().replace('.', ',')} покупки в неделю: для цели «покупка» мало, кампания, скорее всего, останется на библиотеке.${short}` };
  }
  if (buy7 >= NEED_BUYS) return { k: 'now', val: buy7, brief: 'можно переключать', text: `Покупок с рекламы за 7 дней — ${buy7}: можно переключать сейчас.` };
  const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(subStart)) / 864e5) + 1);
  const since = convTotal(conv, subStart, today, camp.id, buyIds, skip), prev7 = days >= 14 ? convTotal(conv, addDays(today, -13), addDays(today, -7), camp.id, buyIds, skip) : null;
  if (days < 7) { const pace = since / days * 7;
    return { k: pace >= NEED_BUYS ? 'soon' : 'low', at: pace >= NEED_BUYS ? addDays(subStart, 7) : null, val: pace, brief: pace >= NEED_BUYS ? `≈ ${dm(addDays(subStart, 7))}` : 'пока мало', text: `Подписка открыта ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}: покупок с рекламы ${since}, темп ≈ ${r0(pace)} в неделю.${pace >= NEED_BUYS ? ` Если удержится — переключить можно ≈ ${dm(addDays(subStart, 7))}.` : ` Для цели «покупка» нужно от ${NEED_BUYS} в неделю — пока оставляем библиотеку.${short}`}` }; }
  const grow = prev7 != null ? buy7 - prev7 : null;
  if (grow > 0) { const weeks = Math.ceil((NEED_BUYS - buy7) / grow), at = addDays(today, weeks * 7);
    return { k: 'soon', at, val: buy7, brief: `≈ к ${dm(at)}`, text: `Покупок с рекламы за 7 дней — ${buy7}, неделей раньше — ${prev7}: растёт на ${grow} в неделю. Если рост сохранится, ${NEED_BUYS} в неделю наберётся ≈ к ${dm(at)}.` }; }
  return { k: 'low', val: buy7, brief: 'роста нет — остаёмся на библиотеке', text: `Покупок с рекламы за 7 дней — ${buy7}${prev7 != null ? `, неделей раньше — ${prev7}` : ''}: роста нет. При таком темпе цель «покупка» не наберёт данных — кампания остаётся на библиотеке, и это нормально.${short}` };
}

// Окупаемость с начала кампании (как считает книжный таргетолог): потрачено → уже вернулось роялти с покупок → ещё «ждёт» в библиотеках
// (добавившие покупают позже: ожидаем добавления × ценность добавления). Итог — сколько вернёт 1 ₽, когда добавившие докупят.
export function campaignPayback(camp, { daily = [], conv = [], today, goals, perSale = null, libValue = null, skip = null, convVerified = true }) {
  const from = camp.start || '0000', cid = camp.id, t = totals(daily, from, today, cid);
  if (!t.cost) return null;
  const usable = convVerified && !missingConversionsDuringSpend(daily, from, today, skip, cid);
  const lib = usable && goals.lib ? convTotal(conv, from, today, cid, [goals.lib], skip) : null;
  const buy = usable && goals.buy?.length ? convTotal(conv, from, today, cid, goals.buy, skip) : null;
  // Только деньги по атрибутированным покупкам, оценка роялти из «Доходов».
  // Библиотеки нельзя добавлять как доказанные деньги — это ведёт к двойному счету.
  const back = buy != null && perSale != null ? buy * perSale : null;
  const expected = null;
  const total = back;
  return { cost: t.cost, lib, buy, back, expected, total, ret: total != null ? total / t.cost : null,
    projected: usable && lib != null && libValue != null ? lib * libValue : null,
    days: daysBetween(camp.start || today, today) + 1 };
}

// «Как заработать больше» (11.11.2026, владелица: «чтобы мне было максимально просто получать максимальную прибыль»):
// рычаги по одной идущей кампании — от самого денежного. Только советы: цену цели и бюджет меняет владелица в кабинете Директа.
// Расход в отчётах — с НДС, цена цели в стратегии — без: сравниваем через VAT.
export const VAT = 1.22, LEARN_DAYS = 7;
export function campaignLevers(camp, st, econ, wk, { ads = [], daily = [], today }) {
  if (!['on', 'capped'].includes(st.key)) return { levers: [], forecast: null };
  const out = [], mine = ads.filter((x) => x.cid === camp.id && x.state === 'ON' && x.status !== 'REJECTED');
  const learning = econ.ran < LEARN_DAYS, after = camp.start ? addDays(camp.start, LEARN_DAYS) : today;
  const dm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`, val = econ.libValue, target = econ.target, paid = target ? target * VAT : null;
  // темп: полные дни с начала недели или старта → сколько уйдёт за неделю
  const from = [weekStartOf(today), camp.start || '', addDays(today, -6)].sort().pop(), full = daysBetween(from, today);
  const done = full >= 1 ? totals(daily, from, addDays(today, -1), camp.id) : null;
  const perDay = done ? done.cost / full : null, weekPace = perDay != null ? perDay * 7 : null;
  const cpa = econ.cpaLib || paid;
  // 1. объявлений мало: Директу не из чего выбирать, одно приедается
  if (mine.length && mine.length < 3) out.push({ k: 'ads', title: mine.length === 1 ? 'Одно объявление — добавьте ещё 2–3 варианта' : 'Два объявления — добавьте ещё одно-два', how: 'Директ сам показывает чаще то, что лучше работает, но ему нужно из чего выбирать: другая картинка, другой крючок, другой троп. С одним объявлением охват узкий, и оно быстрее приедается.' });
  // 2. цена цели выше ценности добавления — переплата
  if (val != null && paid != null && paid > val * 1.05) out.push({ k: 'cpaDown', title: `Добавление стоит ${r0(paid)} ₽, а приносит ≈ ${r0(val)} ₽ — снизьте цену цели до ${Math.max(1, Math.floor(val / VAT))} ₽`, how: `Столько роялти в среднем даёт одно добавление в библиотеку (часть добавивших потом покупает). Платить больше — работать в минус.${learning ? ` Менять лучше после ${dm(after)}, когда кампания доучится.` : ''}` });
  // 3. бюджет недели не выбирается — упираемся в охват, а не в деньги
  if (wk && weekPace != null && full >= 2 && weekPace < wk.limit * 0.6 && st.key === 'on') {
    const room = val != null && paid != null && paid < val * 0.75;
    const up = room ? Math.min(Math.floor(val * 0.75 / VAT), Math.ceil(target * 1.3)) : null;
    out.push({ k: 'pace', title: `Бюджет недели используется на ${r0(weekPace / wk.limit * 100)} % — можно получать больше добавлений`,
      how: up && up > target ? `Директ не добирает: за неделю уйдёт ≈ ${r0(weekPace)} ₽ из ${r0(wk.limit)} ₽. Добавление приносит ≈ ${r0(val)} ₽, а вы платите ${r0(paid)} ₽ — есть запас. ${learning ? `После ${dm(after)} поднимите` : 'Поднимите'} цену цели с ${r0(target)} до ${up} ₽ (понемногу, не больше чем на треть за раз) — Директ сможет чаще выигрывать показы.`
        : `Директ не добирает: за неделю уйдёт ≈ ${r0(weekPace)} ₽ из ${r0(wk.limit)} ₽. Расширяйте охват: новые объявления и фразы${val == null ? '; поднимать цену цели — когда появятся покупки и станет ясно, сколько приносит добавление' : ''}.` });
  }
  // 4. бюджет кончается раньше недели, а добавление выгодное — деньги оставлены на столе
  if (wk && st.key === 'capped' && val != null && cpa != null && cpa < val * 0.8) out.push({ k: 'budgetUp', title: 'Бюджет недели кончается раньше времени, а добавления выгодные', how: `Добавление стоит ${r0(cpa)} ₽ и приносит ≈ ${r0(val)} ₽. Если поднять недельный бюджет в кабинете Директа, таких добавлений будет больше.` });
  // 5. кликов много, в библиотеку добавляют мало — теряем на странице книги
  const cr = econ.d30.clicks >= 300 && econ.lib30 != null ? econ.lib30 / econ.d30.clicks : null;
  if (cr != null && cr < 0.03) out.push({ k: 'page', title: `Из 100 кликов в библиотеку добавляют ${(cr * 100).toFixed(1).replace('.', ',')} — усильте страницу книги`, how: 'Реклама приводит людей, а решают обложка, первые строки аннотации и первая глава. Платите вы только за добавления, но чем их больше с тех же показов — тем охотнее Директ показывает объявление.' });
  // прогноз недели при нынешнем темпе
  const libWeek = weekPace != null && cpa ? weekPace / cpa : null;
  const forecast = libWeek != null && libWeek >= 1 ? { cost: weekPace, lib: libWeek, royalty: val != null ? libWeek * val : null } : null;
  return { levers: out, forecast, learning, after };
}

// Что требует внимания по одной кампании (кроме общих подсказок «Что сделать сейчас»)
export function campaignAlerts(camp, st, econ, { daily = [], conv = [], today, goals }) {
  const out = [];
  if (st.key === 'idle') out.push({ tone: 'bad', title: `«${camp.name}»: нет показов со вчерашнего дня`, how: 'Частые причины — кончились деньги на счёте, недельный бюджет исчерпан, ставка/цена цели слишком низкие для аукциона. Проверьте баланс в кабинете Директа.' });
  if (st.key === 'capped') out.push({ tone: 'warn', title: `«${camp.name}»: недельный бюджет почти потрачен`, how: 'До понедельника показов почти не будет. Перед увеличением бюджета проверьте подтвержденные покупки и актуальность целей.' });
  if (econ.usable === false) return out;
  // цена добавления за 3 последних дня — против цели
  if (econ.target && goals.lib && (!camp.goal || String(camp.goal) === goals.lib)) {
    const from = addDays(today, -2), g = goalTotals(daily, conv, from, today, { cid: camp.id, goals: [goals.lib] });
    if (g.conv >= 3 && g.cpa > econ.target * VAT * 1.5) out.push({ tone: 'warn', title: `«${camp.name}»: добавление подорожало до ${r0(g.cpa)} ₽`, how: `За 3 дня — ${g.conv} добавл. при цели ${r0(econ.target * VAT)} ₽ с НДС. Посмотрите запросы и площадки: обычно дорожает из-за мусорного трафика.` });
    if (econ.ran >= 4 && econ.d7.impr > 300 && !econ.lib7) out.push({ tone: 'warn', title: `«${camp.name}»: показы есть, добавлений нет`, how: 'Проверьте, что ссылка ведёт на книгу и к кампании привязан нужный счётчик Метрики. При оплате за конверсии деньги не тратятся, но и читательниц нет: возможно, цена цели слишком низкая.' });
  }
  return out;
}

// Реклама, ведущая на сайт: кампании, у которых объявления ведут на lanafreitag.ru
export function siteCampaigns(campaigns = [], ads = [], host = 'lanafreitag.ru') {
  const ids = new Set(ads.filter((x) => String(x.href || '').includes(host)).map((x) => x.cid));
  return campaigns.filter((c) => ids.has(c.id));
}

// Директ по месяцам: последние 6 месяцев с расходом
// libValue — сколько в среднем приносит одно добавление в библиотеку: месяц, где реклама шла на добавления, по одним покупкам выглядел бы нулевым
export function directMonths({ daily = [], conv = [], goals, perSale = null, libValue = null, n = 6, conversionsFor = () => true }) {
  const by = {};
  for (const x of daily) { const k = x.date.slice(0, 7); const m = (by[k] ||= { month: k, cost: 0, clicks: 0 }); m.cost += x.cost; m.clicks += x.clicks; }
  return Object.values(by).filter((m) => m.cost > 0).sort((a, b) => b.month.localeCompare(a.month)).slice(0, n).map((m) => {
    const from = m.month + '-01', to = m.month + '-31';
    const ready = conversionsFor(from, to);
    const lib = ready && goals.lib ? convTotal(conv, from, to, null, [goals.lib]) : null, buy = ready && goals.buy?.length ? convTotal(conv, from, to, null, goals.buy) : null;
    const rev = perSale != null && buy != null ? buy * perSale : null;
    const exp = libValue != null && lib ? Math.max(0, lib * libValue - (rev || 0)) : null; // что ещё принесут добавившие
    return { ...m, cost: Math.round(m.cost), lib, buy, rev, ret: rev != null && m.cost ? rev / m.cost : null, exp, retExp: exp != null && m.cost ? ((rev || 0) + exp) / m.cost : null };
  });
}


const SITE_HOST = 'lanafreitag.ru';
const cidOf = (r) => Number(String(r.key || '').replace(/\D/g, '')) || null;

// Строки «Реклама на сайт»: Директ (по кампаниям из Метрики сайта + расход Директа) и другие метки UTM
export function siteAdRows({ site = {}, daily = [], campaigns = [], today }) {
  const g = site.goalIds || {}, from = addDays(today, -29);
  const out = [];
  for (const r of site.direct || []) {
    if (!r.visits || /не определ/i.test(r.name || '')) continue;
    const cid = cidOf(r), camp = campaigns.find((c) => c.id === cid || c.name === r.name);
    const cost = camp ? totals(daily, from, today, camp.id).cost : null;
    const read = g.read ? r.goals?.[g.read] || 0 : null, sub = g.subscribe ? r.goals?.[g.subscribe] || 0 : null;
    out.push({ kind: 'direct', name: camp?.name || r.name, cid: camp?.id || cid, visits: r.visits, bounce: r.bounce, read, sub, cost, perRead: cost && read ? cost / read : null, perSub: cost && sub ? cost / sub : null });
  }
  for (const r of site.utm || []) {
    const [src, camp] = r.dims || [];
    if (!src || /не определ/i.test(src) || /yandex|direct/i.test(src)) continue; // Директ — выше, по кампаниям
    const read = g.read ? r.goals?.[g.read] || 0 : null, sub = g.subscribe ? r.goals?.[g.subscribe] || 0 : null;
    out.push({ kind: 'utm', name: [src, camp].filter((x) => x && !/не определ/i.test(x)).join(' · '), visits: r.visits, bounce: r.bounce, read, sub, cost: null });
  }
  return out.sort((a, b) => b.visits - a.visits);
}

// Сайт → Литнет: что сделали на Литнете читательницы, пришедшие с сайта (Метрика автора, 90 дней)
export function siteToLitnet(mkUtm = [], goals) {
  const rows = mkUtm.filter((r) => String(r.dims?.[0] || '').toLowerCase().includes(SITE_HOST));
  if (!rows.length) return null;
  const visits = rows.reduce((s, r) => s + r.visits, 0);
  return { visits, lib: goals.lib ? rows.reduce((s, r) => s + reach(r, [goals.lib]), 0) : null, buy: goals.buy?.length ? rows.reduce((s, r) => s + reach(r, goals.buy), 0) : null };
}


// Страницы книг сайта: заходы на страницу книги и в читалку → «Читать» → что сделали на Литнете (13.11.2026, её «да»).
// Сайт — Метрика сайта, визиты по странице входа (`site.pages`); Литнет — Метрика автора по метке utm_source=lanafreitag.ru, utm_campaign=адрес книги.
export function siteBookFunnel({ pages = [], goalIds = {}, mkUtm = [], goals = {}, books = [] } = {}) {
  const slugOf = (u) => { const s = String(u || ''); return (s.match(/\/kniga\/([a-z0-9-]+)/i) || s.match(/[?&](?:kniga|chitat)=([a-z0-9-]+)/i) || [])[1]?.toLowerCase() || null; };
  const out = Object.fromEntries(books.filter((b) => b.url && !b.hidden).map((b) => [b.url, { slug: b.url, title: b.title, visits: 0, reader: 0, read: g0(goalIds.read), sub: g0(goalIds.subscribe), lit: 0, lib: goals.lib ? 0 : null, buy: goals.buy?.length ? 0 : null }]));
  function g0(x) { return x ? 0 : null; }
  for (const r of pages) {
    const s = slugOf(r.name || r.key), b = s && out[s]; if (!b) continue;
    b.visits += r.visits; if (/chitat=/.test(r.name || r.key)) b.reader += r.visits;
    if (goalIds.read) b.read += r.goals?.[goalIds.read] || 0; if (goalIds.subscribe) b.sub += r.goals?.[goalIds.subscribe] || 0;
  }
  for (const r of mkUtm) {
    if (!String(r.dims?.[0] || '').toLowerCase().includes(SITE_HOST)) continue;
    const b = out[String(r.dims?.[2] || '').toLowerCase()]; if (!b) continue;
    b.lit += r.visits; if (goals.lib) b.lib += reach(r, [goals.lib]); if (goals.buy?.length) b.buy += reach(r, goals.buy);
  }
  return Object.values(out).map((b) => ({ ...b, readRate: b.read != null && b.visits ? b.read / b.visits : null })).filter((b) => b.visits || b.lit).sort((a, b) => b.visits - a.visits || b.lit - a.lit);
}
