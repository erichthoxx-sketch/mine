// Аналитика по Яндекс Метрике (счётчик автора на Литнете): итоги, источники, устройства, страницы, дни недели
// и «шаги» — что сделать, с объяснением. Только чистые функции (их проверяют тесты).
// Осторожно с малыми числами: вывод — только когда визитов и целей достаточно, иначе «подождать».

export const MIN_VISITS = 50;   // меньше визитов в сегменте — сравнивать рано
export const MIN_CONV = 3;      // меньше целей — доля случайна
const r1 = (x) => Math.round(x * 10) / 10;
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const pc = (x) => `${String(r1(x * 100)).replace('.', ',')} %`;
const WD = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

export const SESSION_METRICS = ['ym:s:visits', 'ym:s:users', 'ym:s:bounceRate', 'ym:s:pageDepth', 'ym:s:avgVisitDurationSeconds'];
// Для долей и конверсии нужны целевые визиты, а не число повторных срабатываний цели.
export const goalMetric = (id) => `ym:s:goal${id}visits`;

// Ответ stat/v1/data → [{key, name, visits, users, bounce (доля), depth, dur, goals {id: целевые визиты}}]
// Несколько группировок (например, метки UTM) → key «a|b|c», dims — значения по порядку
export function mkRows(json, goalIds = []) {
  return (json?.data || []).map((r) => {
    const ds = r.dimensions || [], d = ds[0] || {}, m = r.metrics || [];
    const goals = {};
    goalIds.forEach((g, i) => { goals[g] = Math.round(m[5 + i] || 0); });
    const row = { key: d.id ?? d.name ?? '', name: d.name ?? String(d.id ?? ''), visits: Math.round(m[0] || 0), users: Math.round(m[1] || 0), bounce: (m[2] || 0) / 100, depth: m[3] || 0, dur: m[4] || 0, goals };
    if (ds.length > 1) { row.dims = ds.map((x) => x?.name ?? null); row.key = row.dims.map((x) => x ?? '').join('|'); row.name = row.dims.filter(Boolean).join(' · '); }
    return row;
  });
}
export const reach = (row, ids) => (ids || Object.keys(row.goals || {})).reduce((s, id) => s + (row.goals?.[id] || 0), 0);

// Сумма по дням [from, to] (skip по желанию); доля отказов — средняя, взвешенная по визитам
export function sumDays(daily = [], from, to, main = [], skip = null) {
  const t = { visits: 0, users: 0, conv: 0, b: 0, dur: 0, depth: 0, days: 0 };
  for (const x of daily) {
    if (x.key < from || x.key > to || skip?.has(x.key)) continue;
    t.visits += x.visits; t.users += x.users; t.conv += reach(x, main); t.b += x.bounce * x.visits; t.dur += x.dur * x.visits; t.depth += x.depth * x.visits; t.days++;
  }
  const v = t.visits || 1;
  return { visits: t.visits, users: t.users, conv: t.conv, avg: t.days ? t.visits / t.days : 0, cr: t.visits ? t.conv / t.visits : null, bounce: t.visits ? t.b / v : null, dur: t.visits ? t.dur / v : null, depth: t.visits ? t.depth / v : null, days: t.days };
}

// Две последние полные недели (вчера и 6 дней до него — и неделя перед ней), без дней сбоя
export function weekPair(daily, today, main = [], skip = null) {
  const y = addDays(today, -1);
  return { w: sumDays(daily, addDays(y, -6), y, main, skip), pw: sumDays(daily, addDays(y, -13), addDays(y, -7), main, skip) };
}

// По дням недели (за все дни в данных): средние визиты и доля целей
export function byWeekday(daily = [], main = [], skip = null, today = null) {
  const w = Array.from({ length: 7 }, (_, i) => ({ wd: i, days: 0, visits: 0, conv: 0 }));
  for (const x of daily) {
    if (skip?.has(x.key) || (today && x.key >= today)) continue;
    const i = new Date(x.key + 'T00:00:00Z').getUTCDay();
    w[i].days++; w[i].visits += x.visits; w[i].conv += reach(x, main);
  }
  return w.map((x) => ({ ...x, avg: x.days ? x.visits / x.days : 0, cr: x.visits ? x.conv / x.visits : null }));
}

// Главное: шаги с объяснением. {level: step|warn|good|wait|info, area, title, why, step, lesson}
export function mkInsights({ daily = [], sources = [], devices = [], pages = [], main = [], hasGoals = false, today, skip = null }) {
  const out = [], add = (level, area, title, why, step = '', lesson = '') => out.push({ level, area, title, why, step, lesson });
  // сравниваем полные дни (сегодняшний ещё не закончился) и в среднем за день — дни сбоя не считаются
  const w = weekPair(daily, today, main, skip).w, pw = weekPair(daily, today, main, skip).pw;
  const m30 = sumDays(daily, addDays(today, -29), today, main, skip);

  if (!hasGoals) add('step', 'Цели', 'Не выбрана главная цель', 'Без цели видно только посещения: непонятно, кто из читателей покупает.', 'Настройки → «Яндекс Метрика» → отметьте цели и звёздочкой главную (покупку).', 'goals');
  if (m30.visits < MIN_VISITS) { add('wait', 'Данные', `За 30 дней ${m30.visits} визит(ов)`, `Для выводов нужно хотя бы ${MIN_VISITS} визитов — пока это случайность.`, 'Выкладывайте главы и анонсы; аналитика оживёт сама.'); return order(out); }

  // неделя к неделе
  if (w.visits >= MIN_VISITS && pw.visits >= MIN_VISITS && w.days >= 4 && pw.days >= 4) {
    const dv = (w.avg - pw.avg) / pw.avg;
    if (dv <= -0.25) add('warn', 'Посещаемость', `Визитов меньше на ${Math.round(-dv * 100)} %: в среднем ${Math.round(w.avg)} в день против ${Math.round(pw.avg)}`, 'Обычно так бывает, когда реже выходят главы, закончилась реклама или книга ушла из подборок.', 'Проверьте график выкладки и анонсы этой недели; если была реклама — не остановилась ли она.', 'rhythm');
    else if (dv >= 0.25) add('good', 'Посещаемость', `Визитов больше на ${Math.round(dv * 100)} %: в среднем ${Math.round(w.avg)} в день против ${Math.round(pw.avg)}`, 'Что-то сработало — важно понять что, чтобы повторить.', 'Посмотрите ниже, какой источник вырос, и запишите, что вы делали на этой неделе.', 'rhythm');
    if (hasGoals && w.conv >= MIN_CONV && pw.conv >= MIN_CONV) {
      const dc = (w.cr - pw.cr) / pw.cr;
      if (Math.abs(dc) >= 0.2) add(dc > 0 ? 'good' : 'warn', 'Покупки', `Доля покупок ${dc > 0 ? 'выросла' : 'упала'}: ${pc(pw.cr)} → ${pc(w.cr)}`, dc > 0 ? 'Сейчас приходят более «свои» читатели или страница книги убеждает лучше.' : 'Приходят менее целевые люди (новый источник?) или страница книги перестала убеждать.', dc > 0 ? 'Найдите ниже источник, который это дал, — его стоит усилить.' : 'Сравните источники ниже: где упала доля, там и причина.', 'goals');
    }
  } else add('wait', 'Динамика', 'Мало визитов, чтобы сравнивать недели', `Нужно хотя бы ${MIN_VISITS} визитов за каждую из двух недель.`);

  // источники: где покупают чаще/реже остальных — только если разница не случайна
  const big = sources.filter((s) => s.visits >= MIN_VISITS);
  if (hasGoals && m30.cr != null && m30.conv >= MIN_CONV) {
    const totV = sources.reduce((a, x) => a + x.visits, 0), totC = sources.reduce((a, x) => a + reach(x, main), 0);
    const cmp = big.map((x) => ({ x, k: reach(x, main), t: twoProp(reach(x, main), x.visits, totC - reach(x, main), totV - x.visits) })).filter((c) => c.t.level !== 'low');
    const best = cmp.filter((c) => c.t.z > 0 && c.k >= MIN_CONV).sort((a, b) => b.t.z - a.t.z)[0];
    if (best) add('step', 'Источники', `«${best.x.name}»: покупают в ${String(r1(best.k / best.x.visits / m30.cr)).replace('.', ',')} раза чаще среднего`, `${best.x.visits} визитов, ${best.k} покупок (${pc(best.k / best.x.visits)} против ${pc(m30.cr)}), ${SURE[best.t.level]}. Это ваши самые «тёплые» читатели.`, 'Усильте этот источник: чаще анонсы там же, а в рекламе — похожая аудитория. Ставьте метки UTM, чтобы видеть, какие именно посты работают.', 'scale');
    const worst = cmp.filter((c) => c.t.z < 0 && c.x.key !== 'internal').sort((a, b) => a.t.z - b.t.z)[0];
    if (worst) add('warn', 'Источники', `«${worst.x.name}»: покупают реже — ${pc(worst.k / worst.x.visits)} против ${pc(m30.cr)}`, `${worst.x.visits} визитов, ${SURE[worst.t.level]}. Люди приходят, но не покупают.`, worst.x.key === 'ad' ? 'Уточните аудиторию рекламы и проверьте, совпадает ли объявление с книгой.' : 'Посмотрите, куда ведут ссылки из этого источника: на страницу книги (где покупают) или в читалку.', 'goals');
  }
  const bouncy = big.filter((s) => s.bounce >= 0.6).sort((a, b) => b.visits - a.visits)[0];
  if (bouncy) add('warn', 'Источники', `«${bouncy.name}»: ${Math.round(bouncy.bounce * 100)} % уходят сразу`, 'Люди приходят и почти не смотрят страницу — источник приводит случайных посетителей или ожидания не совпадают.', bouncy.key === 'ad' ? 'Сверьте объявление со страницей книги: жанр, обложка, первые строки аннотации.' : 'Если это реклама или ссылки — уточните, где и как вы зовёте читателей.', 'rsy');

  // устройства
  const mob = devices.find((d) => /mobile|смартф/i.test(String(d.key) + d.name)), desk = devices.find((d) => /desktop|ПК|компьют/i.test(String(d.key) + d.name));
  if (mob && desk && mob.visits >= MIN_VISITS && desk.visits >= MIN_VISITS) {
    const share = mob.visits / (mob.visits + desk.visits);
    if (hasGoals && reach(mob, main) >= MIN_CONV && reach(desk, main) >= MIN_CONV) {
      const a = reach(mob, main) / mob.visits, b = reach(desk, main) / desk.visits;
      if (a < b / 1.5) add('info', 'Устройства', `С телефона покупают реже: ${pc(a)} против ${pc(b)} с компьютера`, `При этом с телефона приходит ${Math.round(share * 100)} % читателей.`, 'Проверьте страницу книги с телефона: видны ли обложка, аннотация и кнопка «Купить» без прокрутки.');
    } else add('info', 'Устройства', `С телефона — ${Math.round(share * 100)} % визитов`, 'Объявления и анонсы смотрят в основном с этого устройства.', share > 0.6 ? 'Пишите объявления короткими и проверяйте, как страница книги выглядит на телефоне.' : '');
  }

  // дни недели — нужно хотя бы 4 недели данных
  const wd = byWeekday(daily, main, skip, today);
  if (wd.every((x) => x.days >= 4)) {
    const top = [...wd].sort((a, b) => b.avg - a.avg)[0], low = [...wd].sort((a, b) => a.avg - b.avg)[0];
    if (top.avg >= low.avg * 1.3) add('step', 'Дни недели', `Больше всего читателей в ${WD[top.wd]} (в среднем ${Math.round(top.avg)}), меньше — в ${WD[low.wd]}`, 'Это ваш ритм аудитории за последние недели.', `Ставьте выход глав и анонсы на ${WD[top.wd]}; рекламу в ${WD[low.wd]} можно приглушить.`, 'rhythm');
  } else add('wait', 'Дни недели', 'Ритм по дням недели появится через 4 недели данных', 'Нужно хотя бы по 4 каждого дня недели, чтобы не путать случайность с закономерностью.');

  // страницы входа: только страницы КНИГ (читалка — это уже читающие, там покупок меньше всегда)
  if (hasGoals && m30.cr) {
    const cards = pages.filter((p) => litnetPage(p.key || p.name).type === 'book' && p.visits >= MIN_VISITS);
    const totV = cards.reduce((a, x) => a + x.visits, 0), totC = cards.reduce((a, x) => a + reach(x, main), 0);
    const weak = cards.map((p) => ({ p, k: reach(p, main), t: twoProp(reach(p, main), p.visits, totC - reach(p, main), totV - p.visits) })).filter((c) => c.t.z < 0 && c.t.level !== 'low').sort((a, b) => a.t.z - b.t.z)[0];
    if (weak) add('warn', 'Страница книги', `Страница книги покупают реже других: ${pc(weak.k / weak.p.visits)}`, `${shortUrl(weak.p.key || weak.p.name)} — ${weak.p.visits} входов, ${SURE[weak.t.level]}. Здесь человек решает, покупать ли.`, 'Проверьте обложку, первые строки аннотации, цену и то, что продолжение выходит регулярно.', 'goals');
    const rd = pages.filter((p) => litnetPage(p.key || p.name).type === 'reader').reduce((a, x) => a + x.visits, 0), all = pages.reduce((a, x) => a + x.visits, 0);
    if (all && rd / all >= 0.3) add('info', 'Читалка', `${Math.round(rd / all * 100)} % визитов начинаются в читалке`, 'Это постоянные читатели, которые приходят за новой главой: у них доля покупок ниже, потому что многие уже купили или ждут продолжения. Это хороший знак удержания.', 'Регулярность выкладки удерживает этих людей; анонс следующей главы в конце главы — тоже.', 'rhythm');
  }
  if (hasGoals && m30.visits >= 200 && m30.conv === 0) add('warn', 'Цели', 'За 30 дней ни одной достигнутой главной цели', 'Возможно, выбрана не та цель или она перестала срабатывать.', 'Проверьте в Метрике: Цели → посмотрите, достигается ли цель вообще.', 'goals');
  return order(out);
}
const order = (a) => { const o = { step: 0, warn: 1, good: 2, wait: 3, info: 4 }; return a.sort((x, y) => o[x.level] - o[y.level]); };
export const shortUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\?.*$/, '').slice(0, 70);


// ---------- страницы Литнета: книга, читалка, автор ----------
// /ru/book/<slug>-b627091 — страница книги (здесь решают купить); /ru/reader/<slug>-b627091 — читалка
// (сюда входят те, кто уже читает: доля покупок там естественно ниже); /ru/<имя>-u12345 — страница автора
export function litnetPage(url) {
  const u = String(url || '').replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '');
  let m = /litnet\.com\/\w+\/(book|reader)\/([a-z0-9-]+?)-b(\d+)/i.exec(u);
  if (m) return { type: m[1] === 'book' ? 'book' : 'reader', slug: m[2], bookId: m[3] };
  m = /litnet\.com\/\w+\/([a-z0-9-]+)-u(\d+)/i.exec(u);
  if (m) return { type: 'author', slug: m[1] };
  return { type: 'other' };
}
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const translit = (t) => String(t || '').toLowerCase().split('').map((c) => (c in TR ? TR[c] : /[a-z0-9]/.test(c) ? c : ' ')).join('').trim().split(/\s+/).filter(Boolean);
// Книга из «Доходов» по адресу Литнета: совпадение слов названия (Литнет пишет название латиницей)
export function matchBook(slug, titles = []) {
  const sw = String(slug || '').split('-').filter(Boolean);
  let best = null, score = 0;
  for (const t of titles) {
    const tw = translit(t); if (!tw.length) continue;
    const hit = tw.filter((w) => sw.some((x) => x === w || (w.length > 4 && x.startsWith(w.slice(0, w.length - 1))))).length / Math.max(tw.length, sw.length);
    if (hit > score) { score = hit; best = t; }
  }
  return score >= 0.6 ? best : null;
}
// Страницы входа → по книгам: {bookId, slug, title, book: {visits, conv…}, reader: {…}}
export function byBook(pages = [], main = [], titles = []) {
  const out = {};
  for (const p of pages) {
    const lp = litnetPage(p.key || p.name);
    if (!lp.bookId) continue;
    const b = (out[lp.bookId] ||= { bookId: lp.bookId, slug: lp.slug, title: matchBook(lp.slug, titles), book: { visits: 0, conv: 0, b: 0 }, reader: { visits: 0, conv: 0, b: 0 } });
    const x = b[lp.type]; x.visits += p.visits; x.conv += reach(p, main); x.b += p.bounce * p.visits;
  }
  return Object.values(out).map((b) => {
    for (const k of ['book', 'reader']) { const x = b[k]; x.cr = x.visits ? x.conv / x.visits : null; x.bounce = x.visits ? x.b / x.visits : null; }
    b.visits = b.book.visits + b.reader.visits; b.conv = b.book.conv + b.reader.conv;
    return b;
  }).sort((a, b) => b.visits - a.visits);
}

// ---------- статистика: доля и её точность, значимость различия ----------
// Интервал Уилсона для доли k из n (95 %)
export function propCI(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}
// Разница двух долей: z и уверенность (high ≥ 99 %, mid ≥ 95 %, low — может быть случайностью)
export function twoProp(k1, n1, k2, n2) {
  if (!n1 || !n2) return { z: 0, level: 'low' };
  const p = (k1 + k2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const z = se ? (k1 / n1 - k2 / n2) / se : 0;
  return { z, level: Math.abs(z) >= 2.58 ? 'high' : Math.abs(z) >= 1.96 ? 'mid' : 'low' };
}
export const SURE = { high: 'уверенность высокая', mid: 'уверенность средняя', low: 'может быть случайностью' };
// Сколько визитов нужно, чтобы заметить разницу delta (доля) при базовой доле p (95 %, мощность 80 %)
export const sampleSize = (p, delta) => (delta > 0 && p > 0 ? Math.ceil(16 * p * (1 - p) / (delta * delta)) : null);

// ---------- воронка читателя по целям ----------
const STAGES = [
  ['read', 'Начали читать', /начал[а-яё]*\s+чтен|начал[а-яё]*\s+чита|читать/i],
  ['lib', 'Добавили в библиотеку', /библиотек/i],
  ['buystart', 'Начали покупку', /начал[а-яё]*\s+покуп|оформ/i],
  ['buy', 'Купили', /^(?!.*начал).*(покупк|купил|оплат)/i],
];
export function funnel(totals, goals = []) {
  const steps = [{ id: 'visit', name: 'Пришли на страницу', n: totals.visits }];
  for (const [id, name, re] of STAGES) {
    const g = goals.find((x) => re.test(x.name));
    if (g) steps.push({ id, name, goal: g.name, n: totals.goals?.[g.id] ?? 0 });
  }
  for (let i = 1; i < steps.length; i++) { const prev = steps[i - 1].n; steps[i].rate = prev ? steps[i].n / prev : null; }
  const drops = steps.slice(1).filter((x) => x.rate != null && steps[0].n >= MIN_VISITS);
  const worst = drops.length ? drops.reduce((a, b) => (b.rate < a.rate ? b : a)) : null;
  return { steps, worst };
}
// Итоги по каждой цели за период (для воронки)
export function goalTotals30(daily = [], from, to, skip = null) {
  const t = { visits: 0, goals: {} };
  for (const x of daily) { if (x.key < from || x.key > to || skip?.has(x.key)) continue; t.visits += x.visits; for (const [g, n] of Object.entries(x.goals || {})) t.goals[g] = (t.goals[g] || 0) + n; }
  return t;
}

// ---------- деньги: доход с покупки из «Доходов» ----------
// sales — строки продаж {date, book, qty, royalty}; за последние days дней; по книге или по всем
export function royaltyPerSale(sales = [], today, { book = null, days = 60 } = {}) {
  const from = addDays(today, -days + 1); let q = 0, r = 0;
  for (const x of sales) { if (x.date < from || x.date > today || (book && x.book !== book)) continue; q += Number(x.qty) || 0; r += Number(x.royalty) || 0; }
  return q ? { qty: q, royalty: r, perSale: r / q } : null;
}

// ---------- метки UTM ----------
export const UTM_PRESETS = {
  telegram: ['telegram', 'social', 'Телеграм'], vk: ['vk', 'social', 'ВКонтакте'], dzen: ['dzen', 'social', 'Дзен'],
  litnet_blog: ['litnet_blog', 'blog', 'Блог на Литнете'], email: ['email', 'email', 'Рассылка'], direct: ['yandex', 'cpc', 'Яндекс Директ'],
  partner: ['partner', 'referral', 'Другой автор / паблик'], other: ['other', 'other', 'Другое'],
};
const slugify = (t) => translit(t).join('_').slice(0, 40);
export function buildUtm(url, { source, medium, campaign, content = '' }) {
  const base = String(url || '').trim(); if (!/^https?:\/\//.test(base)) return '';
  const u = new URL(base);
  for (const [k, v] of [['utm_source', source], ['utm_medium', medium], ['utm_campaign', slugify(campaign) || campaign], ['utm_content', slugify(content)]]) if (v) u.searchParams.set(k, v);
  return u.toString();
}
// Ссылки для продвижения из кабинета Литнета: litnet.com/ref/<код> ведёт на страницу книги с ?utm_litref=<код>
export const litrefOf = (u) => ((/[?&]utm_litref=([\w-]+)/i.exec(String(u || '')) || /litnet\.com\/ref\/([\w-]+)/i.exec(String(u || '')) || [])[1] || null);
// Страницы входа с utm_litref → по коду ссылки: визиты и цели, книга по адресу
export function litrefRows(pages = [], main = [], titles = []) {
  const out = {};
  for (const p of pages) {
    const u = p.key || p.name, code = litrefOf(u); if (!code) continue;
    const lp = litnetPage(u), x = (out[code] ||= { code, slug: lp.slug || '', title: lp.slug ? matchBook(lp.slug, titles) : null, visits: 0, conv: 0 });
    x.visits += p.visits; x.conv += reach(p, main);
  }
  return Object.values(out);
}
// Строки Метрики по меткам (source|medium|campaign|content) + ссылки Литнета (refs) + сохранённые метки владелицы → таблица с деньгами
export function utmTable(rows = [], saved = [], main = [], perSale = null, refs = []) {
  const real = rows.filter((r) => r.dims?.some((x) => x && !/не определ/i.test(x)));
  const keyOf = (s, m, c) => [s || '', m || '', c || ''].join('|').toLowerCase();
  const byKey = {};
  for (const r of real) { const [s, m, c] = r.dims; const k = keyOf(s, m, c); const x = (byKey[k] ||= { source: s, medium: m, campaign: c, visits: 0, conv: 0 }); x.visits += r.visits; x.conv += reach(r, main); }
  const out = [], byRef = Object.fromEntries(refs.map((r) => [r.code.toLowerCase(), r]));
  for (const t of saved.filter((x) => x.litref)) { const r = byRef[t.litref.toLowerCase()]; out.push({ visits: r?.visits || 0, conv: r?.conv || 0, source: 'Литнет', campaign: t.litref, label: t.label, cost: Number(t.cost) || 0, saved: t, litref: t.litref }); delete byRef[t.litref.toLowerCase()]; }
  for (const r of Object.values(byRef)) out.push({ visits: r.visits, conv: r.conv, source: 'Литнет', campaign: r.code, label: `Ссылка Литнета: ${r.title || (r.slug ? r.slug.charAt(0).toUpperCase() + r.slug.slice(1).replace(/-/g, ' ') : r.code)}`, cost: 0, litref: r.code });
  for (const t of saved.filter((x) => !x.litref)) { const k = keyOf(t.source, t.medium, slugify(t.campaign) || t.campaign); out.push({ ...(byKey[k] || { visits: 0, conv: 0 }), label: t.label, cost: Number(t.cost) || 0, saved: t }); delete byKey[k]; }
  for (const x of Object.values(byKey)) out.push({ ...x, label: [x.source, x.campaign].filter(Boolean).join(' · '), cost: 0 });
  return out.map((x) => {
    const value = perSale != null ? x.conv * perSale : null;
    return { ...x, cr: x.visits ? x.conv / x.visits : null, cpa: x.cost && x.conv ? x.cost / x.conv : null, value, romi: x.cost && value != null ? (value - x.cost) / x.cost : null };
  }).sort((a, b) => b.visits - a.visits);
}

// ---------- Сайт автора (lanafreitag.ru) ----------
// Счётчик сайта и цели, которые отправляет сам сайт (site/site.js → reachGoal)
export const SITE_COUNTER = '113843691';
export const SITE_GOALS = [['read', 'Нажали «Читать»'], ['subscribe', 'Подписались'], ['gift', 'Скачали подарок'], ['telegram', 'Перешли в Telegram']];
// Цели Метрики «JavaScript-событие» → { read: номер цели, … }
export function siteGoalIds(goals = []) {
  const out = {};
  for (const g of goals) for (const c of g.conditions || []) if (SITE_GOALS.some(([k]) => k === c.url)) out[c.url] = String(g.id);
  return out;
}
// Страница входа → понятное название: главная, книга, политика
export function sitePage(u, books = []) {
  const s = String(u || '');
  const k = (/[?&]kniga=([\w-]+)/.exec(s) || [])[1];
  if (k) { const b = books.find((x) => x.url === k); return b ? `Книга «${b.title}»` : `Книга ${k}`; }
  if (/[?&]privacy/.test(s)) return 'Политика конфиденциальности';
  if (/\/admin/.test(s)) return 'Админка';
  return 'Главная';
}
// Страницы входа, сложенные по названию (разные хвосты ссылок одной страницы — вместе)
export function sitePages(pages = [], books = [], goalIds = []) {
  const by = {};
  for (const p of pages) {
    const n = sitePage(p.key || p.name, books);
    const x = (by[n] ||= { name: n, visits: 0, goals: {} });
    x.visits += p.visits || 0;
    for (const g of goalIds) x.goals[g] = (x.goals[g] || 0) + (p.goals?.[g] || 0);
  }
  return Object.values(by).sort((a, b) => b.visits - a.visits);
}
