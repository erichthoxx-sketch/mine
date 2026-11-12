// Автоправила Директа (12.11.2026, её «да» на п. 17): то, что таргетолог делает руками каждую неделю, приложение делает само —
// только включённые галочкой правила (settings.direct.auto), после каждого обновления данных, не больше 6 действий за раз,
// каждое пишется в «Что меняли» (by: 'auto'). Цену цели и бюджет правила не трогают никогда.
import { queryHints, fatigueHints } from './dcalc.js';
import { placementRows, qualityAlerts } from './qualitycalc.js';

export const AUTO_RULES = [
  ['minus', 'Мусорные запросы — в минус-слова', '«скачать», «аудиокнига», «фильм» и подобные: слово добавляется к минус-словам кампании'],
  ['places', 'Площадки, с которых сразу уходят, — исключать', '20+ кликов и больше половины отказов в сетях: площадка уходит в «Запрещённые»'],
  ['fatigue', 'Выгоревшее объявление — на паузу', 'CTR упал на 40 %+ и в группе есть другие объявления: показы перейдут к ним'],
  ['goal', 'В день открытия подписки — цель «покупка»', 'меняется только цель стратегии; цена цели и бюджет остаются вашими'],
];
export const AUTO_MAX = 6;

// Что сделали бы включённые правила прямо сейчас (чистая функция). goalActs — готовые действия смены цели из планов запуска.
export function autoPlan({ main = {}, stats = {}, on = {}, today, goalActs = [], done = [] }) {
  const out = [], live = new Set((main.campaigns || []).filter((c) => c.state === 'ON').map((c) => c.id)), was = new Set(done);
  const push = (x) => { if (!was.has(x.key) && out.length < AUTO_MAX) out.push(x); };
  if (on.goal) for (const g of goalActs) push({ rule: 'goal', key: `goal:${g.campaign}:${g.goal}`, act: g, text: `цель кампании → «${g.goalName}»` });
  if (on.minus) {
    const neg = Object.fromEntries((main.campaigns || []).map((c) => [c.id, [...(c.negatives || []), ...(main.groups || []).filter((g) => g.cid === c.id).flatMap((g) => g.negatives || [])]]));
    for (const h of queryHints((stats.queries || []).filter((q) => live.has(q.cid)), neg)) if (h.clicks >= 2 || h.queries.length >= 2) push({ rule: 'minus', key: `minus:${h.cid}:${h.word}`, act: { do: 'minus', campaign: h.cid, phrases: [h.word], why: `автоправило: запросы вроде «${h.queries[0]}»` }, text: `минус-слово «${h.word}»` });
  }
  if (on.fatigue) for (const h of fatigueHints({ main, stats, today })) if (h.act && live.has(h.cid)) push({ rule: 'fatigue', key: `fatigue:${h.aid}`, act: { ...h.act, why: 'автоправило: ' + h.act.why }, text: h.title });
  if (on.places) {
    const by = {};
    for (const p of qualityAlerts(placementRows(stats.placements || [], main.campaigns || []), { maxItems: 20 })) if (live.has(p.cid) && p.bounce >= 55 && /\./.test(p.place)) (by[p.cid] ||= []).push(p.place);
    for (const [cid, places] of Object.entries(by)) { const fresh = places.filter((x) => !was.has(`place:${cid}:${x}`)).slice(0, 5); if (fresh.length) push({ rule: 'places', key: `places:${cid}:${fresh.join(',')}`, cid: Number(cid), places: fresh, keys: fresh.map((x) => `place:${cid}:${x}`), text: `исключить площадки: ${fresh.join(', ')}` }); }
  }
  return out;
}

// Очередь предложений на Пульте (12.11.2026, её просьба: «одобрение одной кнопкой… выделить, что надо, что не надо»):
// то же, что делают автоправила, но для правил, которые НЕ включены, — их действия ждут галочки. Плюс стартовые минус-слова.
// no — ключи, на которые она ответила «Не надо» (settings.direct.queueNo); done — уже сделанное автоправилами.
export function approvalQueue({ main = {}, stats = {}, on = {}, today, goalActs = [], done = [], no = [], starter = [], extra = [] }) {
  const hide = new Set(no), off = { minus: !on.minus, places: !on.places, fatigue: !on.fatigue, goal: !on.goal };
  const names = Object.fromEntries((main.campaigns || []).map((c) => [c.id, c.name]));
  const out = [];
  for (const s of starter) out.push({ rule: 'starter', key: `starter:${s.campaign}`, act: s, text: `добавить базовые минус-слова (${s.phrases.length})`, cid: s.campaign });
  const was0 = new Set(done);
  for (const x of extra) if (!was0.has(x.key)) out.push(x);
  // autoPlan режет до AUTO_MAX — для очереди берём пачками, пока есть новое
  const seen = [...done];
  for (let i = 0; i < 4; i++) {
    const part = autoPlan({ main, stats, on: off, today, goalActs, done: seen });
    if (!part.length) break;
    out.push(...part); seen.push(...part.map((x) => x.key), ...part.flatMap((x) => x.keys || []));
  }
  const WHY = { kwadd: 'запрос уже приводит читательниц — закрепляем его отдельной фразой, чтобы Директ показывал по нему увереннее', audience: 'самые тёплые читательницы; создание аудитории ничего не тратит и кампании не меняет', retarget: 'объявления группы увидят и те, кто добавил книгу, но не купил; бюджет и цена цели не меняются', newad: 'в группе мало объявлений — Директу не из чего выбирать; текст из Мастерской, без спойлеров, уйдёт на модерацию', starter: 'по «скачать», «fb2», «аудиокнига» ищут файл, а не книгу на Литнете', minus: 'по таким запросам приходят не читатели', places: 'с площадки сразу уходят: 20+ кликов и больше половины отказов', fatigue: 'объявление приелось: CTR заметно упал, в группе есть другие', goal: 'началась подписка — кампании пора учиться на покупках; цена цели и бюджет не меняются' };
  return out.filter((x) => !hide.has(x.key)).map((x) => ({ ...x, text: x.rule === 'fatigue' ? 'остановить объявление: ' + x.text : x.text, cid: x.cid ?? x.act?.campaign ?? null, camp: names[x.cid ?? x.act?.campaign] || '', why: x.why || WHY[x.rule] || '' })).slice(0, 20);
}

// Ретаргетинг и новые объявления — пункты для очереди (выполняет execPlan в sync.js, только после её галочки).
// Аудитория «добавили в библиотеку, но не купили»: условие ретаргетинга по целям Метрики (ALL: библиотека за 90 дней; NONE: покупка за 540).
export function retargetRules(lib, buy = []) {
  return [{ Operator: 'ALL', Arguments: [{ ExternalId: Number(lib), MembershipLifeSpan: 90 }] }, { Operator: 'NONE', Arguments: buy.map((id) => ({ ExternalId: Number(id), MembershipLifeSpan: 540 })) }];
}
export function retargetItems({ main = {}, goals = {}, saved = {} }) {
  if (!goals.lib || !(goals.buy || []).length) return [];
  if (!saved.listId) return [{ rule: 'audience', key: 'audience:lib-notbuy', lib: goals.lib, buy: goals.buy, text: 'создать аудиторию «добавили в библиотеку, но не купили»' }];
  const out = [], has = new Set((saved.groups || []).map(String));
  for (const c of (main.campaigns || []).filter((x) => x.state === 'ON' && x.strategy?.network && x.strategy.network !== 'SERVING_OFF'))
    for (const g of (main.groups || []).filter((x) => x.cid === c.id).slice(0, 3)) if (!has.has(String(g.id)))
      out.push({ rule: 'retarget', key: `retarget:${g.id}`, cid: c.id, gid: g.id, listId: saved.listId, text: `догонять тех, кто добавил книгу, но не купил, — группа «${g.name}»` });
  return out;
}
// Новое объявление из Мастерской для групп, где их меньше трёх: заголовок ещё не используется, длины по правилам Директа, без спойлеров
export function newAdItems({ main = {}, bookOf = () => null, hits = () => [] }) {
  const out = [];
  for (const c of (main.campaigns || []).filter((x) => x.state === 'ON')) {
    const wb = bookOf(c); if (!wb) continue;
    const pool = (wb.direct?.ads || []).map((a) => ({ h1: String(a.h1 || '').trim(), h2: String(a.h2 || '').trim(), text: String(a.text || '').trim() }))
      .filter((a) => a.h1 && a.text && a.h1.length <= 56 && a.h2.length <= 30 && a.text.length <= 81 && !hits(`${a.h1} ${a.h2} ${a.text}`, wb).length);
    for (const g of (main.groups || []).filter((x) => x.cid === c.id)) {
      const ads = (main.ads || []).filter((x) => x.gid === g.id && x.state !== 'ARCHIVED'), href = ads.find((x) => x.href)?.href;
      if (!href || ads.length >= 3) continue;
      const used = new Set(ads.map((x) => x.title.toLowerCase())), a = pool.find((x) => !used.has(x.h1.toLowerCase()));
      if (a) out.push({ rule: 'newad', key: `newad:${g.id}:${a.h1.toLowerCase()}`, cid: c.id, gid: g.id, ad: { Title: a.h1, ...(a.h2 ? { Title2: a.h2 } : {}), Text: a.text, Href: href, Mobile: 'NO' }, text: `новое объявление: «${a.h1}${a.h2 ? ' — ' + a.h2 : ''}»`, why: `«${a.text}» · в группе «${g.name}» сейчас ${ads.length}; уйдёт на модерацию` });
    }
  }
  return out;
}

// Запросы-победители: поисковый запрос уже принёс добавления/покупки, а фразы такой в кампании нет → добавить фразой (обычное действие keywords)
export function winnerQueryItems({ main = {}, stats = {}, goals = {} }) {
  const want = new Set([goals.lib, ...(goals.buy || [])].filter(Boolean).map(String));
  if (!want.size) return [];
  const live = new Set((main.campaigns || []).filter((c) => c.state === 'ON').map((c) => c.id));
  const norm = (t) => String(t || '').toLowerCase().replace(/["!+\[\]]/g, '').replace(/\s-\S+/g, '').replace(/\s+/g, ' ').trim();
  const have = new Set((main.keywords || []).filter((k) => k.state !== 'ARCHIVED').map((k) => `${k.cid}|${norm(k.phrase)}`));
  const out = [];
  for (const q of stats.queries || []) {
    if (!live.has(q.cid) || !q.gid || !q.conv) continue;
    const n = Object.entries(q.conv).reduce((s, [g, v]) => s + (want.has(String(g)) ? v : 0), 0), text = norm(q.query), words = text.split(' ').length;
    if (n < 2 || words < 2 || words > 7 || have.has(`${q.cid}|${text}`)) continue;
    have.add(`${q.cid}|${text}`);
    out.push({ rule: 'kwadd', key: `kwadd:${q.gid}:${text}`, cid: q.cid, n, act: { do: 'keywords', group: q.gid, phrases: [text], why: `запрос привёл ${n} читательниц за 30 дней` }, text: `добавить фразу «${text}» — уже привела ${n}` });
  }
  return out.sort((a, b) => b.n - a.n).slice(0, 5);
}
