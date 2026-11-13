// «Рынок» (12.11.2026, её просьба: «полная аналитика книжного рынка… тренды, тропы, взлёты и провалы»). Чистые функции.
// Источник — открытые страницы топов Литнета (robots.txt разрешает; читаем раз в сутки одну страницу на подборку, только карточки:
// место, название, автор, статус, страницы, просмотры, библиотеки, лайки, цена, аннотация — тексты книг не трогаем).
// Чужих продаж и рекламных бюджетов не видит никто: спрос оцениваем по росту «в библиотеках» и просмотров между срезами.
const numOf = (s) => { const m = String(s || '').replace(',', '.').match(/([\d.]+)\s*([КМ])?/i); if (!m) return 0; return Math.round(parseFloat(m[1]) * (/[МM]/i.test(m[2] || '') ? 1e6 : /[КK]/i.test(m[2] || '') ? 1e3 : 1)); };
export const litnetId = (url) => (String(url || '').match(/-b(\d+)(?:$|[/?#])/) || [])[1] || '';

// Тропы — по началам слов в названии и аннотации (как читатель видит карточку)
export const TROPES = [
  ['Измена', /измен|предал|предател|любовниц/], ['Развод', /развод|бывш(ая|ей|ую) жен|бывш(ий|его|ему) муж/], ['Бывшие', /бывш(ий|его|ая|ие|их)(?![а-я])/],
  ['Босс', /босс|начальник|шеф(?![а-я])|генеральн|подчин[её]нн|секретар/], ['Беременность и дети', /беремен|малыш|дочк|двойняш|тройняш|многодетн|ребен(ок|ка) от|(наш|мой|моя|твой|твоя|его|ее) (сын|дочь|ребен)|папа(?![а-я])/],
  ['Тайный ребёнок', /тайн\S* (ребен|дочь|сын)|не знал о (ребен|доч|сын)|скрыла (ребен|беремен)/], ['Криминал', /мафи|бандит|криминал|авторитет|главар|киллер|вор в закон/],
  ['Властный герой', /властн|хозяин|тиран|жесток|чудовищ|монстр|деспот/], ['Одержимость', /одержим|помешан|не отпущ|моя(?![а-я]).{0,20}навсегда|принадлежишь/],
  ['Сводные', /сводн/], ['От ненависти до любви', /ненавиж|ненавист|враг/], ['Месть', /мест(ь|и)(?![а-я])|отомщ|отомст/], ['Принуждение', /принужд|заставл|насильно|похит/],
  ['Фиктивный брак', /фиктивн|контракт|по расчет|договорн/], ['Вынужденный брак', /вынужден\S* брак|выдали замуж|замуж за (незнаком|чудовищ|враг)/],
  ['Разница в возрасте', /разниц\S* в возраст|старше (меня|на)|взросл\S* мужчин|друг (отца|папы)|отец (подруги|друга)/], ['Миллиардер', /миллиард|миллионер|олигарх/],
  ['Студенты', /студент|универ|первокурс|одногруппн/], ['Служебный роман', /служебн|коллег|офис/], ['Истинная пара', /истинн/], ['Оборотни', /оборот|волчиц|вервольф|альфа(?![а-я])|стая(?![а-я])|стаи(?![а-я])/],
  ['Попаданка', /попаданк|попала в|другой мир/], ['Драконы', /дракон/], ['Академия', /академи/], ['Спорт', /хоккеист|футболист|боксер|спортсмен|чемпион/],
  ['Врачи', /врач|хирург|доктор|медсестр/], ['Военные и силовики', /майор|полковник|генерал|следовател|опер(?![а-я])|спецназ/], ['МЖМ', /мжм|двое мужчин|два брата|братья/],
  ['Второй шанс', /втор\S* шанс|спустя (годы|лет)|через \S+ лет|вернулся/], ['Очень откровенно', /очень откровенн|18\+|горяч|жарко/], ['Юмор', /юмор|ирони|смешн/],
];
export function tropesOf(text) {
  const t = ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е') + ' ';
  return TROPES.filter(([, re]) => re.test(t)).map(([n]) => n);
}

// Страница топа Литнета (текст от «читалки») → карточки книг по порядку
export function parseLitnetList(text) {
  const out = [], parts = String(text || '').split(/\n(?=#### \[)/);
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i], head = p.match(/^#### \[([^\]]+)\]\((https?:\/\/litnet\.com\/[^)\s]+)\)/);
    if (!head) continue;
    const id = litnetId(head[2]); if (!id) continue;
    const before = parts[i - 1].split('\n').slice(-3).join('\n'); // строка над названием: место в топе и «Эксклюзив» этой книги
    const mine = before.includes(head[2]) ? before : '';
    const author = (p.match(/^##### \[([^\]]+)\]/m) || [])[1] || '';
    const st = p.match(/!\[Image \d+: (inProgress|[a-zA-Z]+)\]\([^)]*\)\s*([^!\n]*?)(\d+)\s*стр/);
    const g = (k) => numOf((p.match(new RegExp('!\\[Image \\d+: ' + k + '\\]\\([^)]*\\)\\s*([\\d.,]+\\s*[КМкм]?)')) || [])[1]);
    const priceLine = [...p.matchAll(/^\[([^\]\n]*(?:₽|Бесплатно)[^\]\n]*)\]\(/gm)].pop();
    let price = null, full = null, off = 0;
    if (priceLine && !/Бесплатно/i.test(priceLine[1])) {
      const ns = [...priceLine[1].replace(/-\d+\s*%/, '').matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => parseFloat(m[0].replace(',', '.')));
      full = ns[0] ?? null; price = ns.length > 1 ? ns[1] : full; off = +((priceLine[1].match(/-(\d+)\s*%/) || [])[1] || 0);
    } else if (priceLine) price = 0;
    const annot = p.split('\n').slice(1).filter((l) => l.trim() && !/^\[|^#####|^!\[/.test(l.trim())).join(' ').replace(/\s+/g, ' ').trim();
    out.push({ id, url: head[2], title: head[1].trim(), author, rank: +((mine.match(/hashtag\]\([^)]*\)\s*(\d+)/) || [])[1] || 0) || null, excl: /Эксклюзив/.test(mine),
      status: st ? (st[1] === 'inProgress' ? 'progress' : 'done') : '', upd: st ? st[2].trim() : '', pages: st ? +st[3] : 0, views: g('eye'), lib: g('addedToLibrary'), likes: g('like'), comments: g('comments'),
      price, full, off, annot: annot.slice(0, 600), tropes: tropesOf(head[1] + ' ' + annot) });
  }
  return out;
}

// Срез дня — компактно (в базу): книги отдельно (название, автор, тропы — не меняются), цифры — по дням
export function packDay(rows) {
  return rows.map((r, i) => ({ id: r.id, n: i + 1, v: r.views, l: r.lib, k: r.likes, c: r.comments, p: r.price, f: r.full, o: r.off, g: r.pages, s: r.status === 'done' ? 1 : 0, e: r.excl ? 1 : 0 }));
}
export const bookCard = (r) => ({ t: r.title, a: r.author, u: r.url, tr: r.tropes, an: r.annot.slice(0, 220) });

const medLib0 = (rows) => { const s = rows.map((r) => r.l).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const median = (a) => { const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

const anns0 = (cur, books) => { const a = cur.map((r) => books[r.id]?.an || '').filter(Boolean); return a.length ? a.filter((x) => /^\s*[—–-]\s*\S/.test(x)).length / a.length : 0; };
// Выводы по срезам: { days: {дата: {подборка: [packDay]}}, books: {id: bookCard} }
export function marketInsights(snap = {}, { src = null, mine = [], myPrices = [], myBooks = [] } = {}) {
  const dates = Object.keys(snap.days || {}).sort(), books = snap.books || {};
  if (!dates.length) return null;
  const rowsOf = (d) => { const day = snap.days[d] || {}, seen = new Set(), out = []; for (const k of Object.keys(day)) if (!src || k === src) for (const r of day[k]) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); } return out; };
  const last = dates[dates.length - 1], cur = rowsOf(last);
  if (!cur.length) return null;
  // с чем сравнить: срез 5–9 дней назад, иначе самый ранний
  const prevDate = [...dates].reverse().find((d) => { const n = daysBetween(d, last); return n >= 5 && n <= 9; }) || (dates.length > 1 ? dates[0] : null);
  const prev = prevDate ? rowsOf(prevDate) : [], gap = prevDate ? Math.max(1, daysBetween(prevDate, last)) : 0, prevBy = Object.fromEntries(prev.map((r) => [r.id, r]));
  const share = (rows) => { const m = {}; for (const r of rows) for (const t of books[r.id]?.tr || []) m[t] = (m[t] || 0) + 1; return m; };
  const sc = share(cur), sp = share(prev);
  const tropes = Object.entries(sc).map(([name, n]) => ({ name, n, share: n / cur.length, was: prev.length ? (sp[name] || 0) / prev.length : null }))
    .map((x) => ({ ...x, delta: x.was == null ? null : x.share - x.was })).sort((a, b) => b.n - a.n);
  const paid = cur.filter((r) => r.p > 0);
  const card = (r) => ({ id: r.id, title: books[r.id]?.t || '', author: books[r.id]?.a || '', url: books[r.id]?.u || '', tropes: books[r.id]?.tr || [], n: r.n, lib: r.l, views: r.v, price: r.p, pages: r.g, done: !!r.s, excl: !!r.e, ann: books[r.id]?.an || '', conv: r.v >= 500 ? r.l / r.v : null });
  // взлёты: прирост «в библиотеках» в день между срезами
  const movers = prev.length ? cur.filter((r) => prevBy[r.id] && r.l > prevBy[r.id].l).map((r) => ({ ...card(r), perDay: Math.round((r.l - prevBy[r.id].l) / gap), was: prevBy[r.id].n })).sort((a, b) => b.perDay - a.perDay).slice(0, 8) : [];
  const fresh = prev.length ? cur.filter((r) => !prevBy[r.id]).map(card) : [];
  const curIds = new Set(cur.map((r) => r.id)), gone = prev.filter((r) => !curIds.has(r.id)).map(card);
  // «в топе при малом числе читателей»: библиотек меньше 5 % от обычного для этого среза — место держится не на читателях
  // (свежесть, продажи за короткий срок, награды — снаружи не видно; просто отмечаем и следим, сколько дней продержится)
  const medLib = median(cur.map((r) => r.l));
  const odd = medLib ? cur.filter((r) => r.l < medLib * 0.05).map((r) => ({ ...card(r), days: dates.filter((d) => rowsOf(d).some((x) => x.id === r.id)).length })) : [];
  // авторы с несколькими книгами в срезе — у кого сейчас «серия в топе»
  const byA = {}; for (const r of cur) { const a = books[r.id]?.a; if (a) (byA[a] ||= []).push(card(r)); }
  const authors = Object.entries(byA).filter(([, v]) => v.length >= 2).map(([name, list]) => ({ name, n: list.length, lib: list.reduce((s, b) => s + (b.lib || 0), 0), titles: list.map((b) => b.title) })).sort((a, b) => b.n - a.n || b.lib - a.lib).slice(0, 6);
  // ---- глубже витрины: что отличает книги топа друг от друга ----
  // «интерес» = сколько из открывших книгу добавили её в библиотеку (библиотеки ÷ просмотры): не зависит от возраста книги и размера рекламы
  const conv = (r) => (r.v >= 500 ? r.l / r.v : null), medConv = median(cur.map(conv));
  // карта тропов: конкуренция (доля книг топа) × интерес читателей (относительно обычного по срезу)
  const tropeMap = tropes.filter((t) => t.n >= 3).map((t) => {
    const rows = cur.filter((r) => (books[r.id]?.tr || []).includes(t.name)), c = median(rows.map(conv)), idx = c != null && medConv ? c / medConv : null;
    const hot = idx != null && idx >= 1.15, cold = idx != null && idx <= 0.85, crowded = t.share >= 0.2;
    return { ...t, interest: idx, price: median(rows.filter((r) => r.p > 0).map((r) => r.f ?? r.p)), lib: median(rows.map((r) => r.l)),
      verdict: hot && !crowded ? 'niche' : hot ? 'hot' : cold && crowded ? 'tired' : cold ? 'weak' : 'even' };
  }).sort((a, b) => (b.interest ?? 0) - (a.interest ?? 0));
  // как менялась доля тропа по срезам (до 14 последних) — для линии в карте тропов
  const histDates = dates.slice(-14), histRows = histDates.map(rowsOf);
  for (const t of tropeMap) t.hist = histRows.map((rows) => (rows.length ? rows.filter((r) => (books[r.id]?.tr || []).includes(t.name)).length / rows.length : 0));
  // её книга против топа: как рынок относится к её тропам и кто ближайшие соседи
  const tmBy = Object.fromEntries(tropeMap.map((t) => [t.name.toLowerCase(), t])), allBy = Object.fromEntries(tropes.map((t) => [t.name.toLowerCase(), t]));
  const fit = myBooks.map((b) => {
    const names = [...new Set([...(b.tags || []).map((x) => TROPES.find(([n]) => n.toLowerCase() === String(x).toLowerCase().replace(/ё/g, 'е') || n.toLowerCase() === String(x).toLowerCase())?.[0]).filter(Boolean), ...tropesOf([b.title, ...(b.tags || [])].join('. '))])];
    if (!names.length) return null;
    const tr = names.map((n) => { const m = tmBy[n.toLowerCase()], a = allBy[n.toLowerCase()]; return { name: n, n: a?.n || 0, share: a?.share || 0, interest: m?.interest ?? null, verdict: m?.verdict || (a ? 'few' : 'none') }; });
    const near = cur.map((r) => ({ r, common: (books[r.id]?.tr || []).filter((x) => names.includes(x)) })).filter((x) => x.common.length >= Math.min(2, names.length) && (books[x.r.id]?.t || '').toLowerCase() !== String(b.title || '').toLowerCase())
      .sort((x, y) => y.common.length - x.common.length || y.r.l - x.r.l).slice(0, 5).map((x) => ({ ...card(x.r), common: x.common }));
    const lines = [], q = (t) => `«${t.name}»`, xi = (t) => t.interest.toFixed(1).replace('.', ',');
    const good = tr.filter((t) => t.verdict === 'niche' || t.verdict === 'hot').sort((x, y) => y.interest - x.interest), bad = tr.filter((t) => t.verdict === 'tired' || t.verdict === 'weak'), rare = tr.filter((t) => t.verdict === 'few' || t.verdict === 'none');
    if (good.length) lines.push(`${good.map(q).join(' и ')} сейчас читают охотнее обычного (интерес ×${xi(good[0])}) — это стоит показывать первым: в крючке, начале аннотации и объявлениях.`);
    if (bad.length) lines.push(`${bad.map(q).join(' и ')} — интерес ниже обычного${bad.some((t) => t.verdict === 'tired') ? ', а книг много' : ''}: на одном этом тропе выделиться трудно, нужен второй.`);
    if (rare.length) lines.push(`${rare.map(q).join(' и ')} в топе почти нет (${rare.map((t) => t.n).join(' и ')} из ${cur.length} книг): соперников мало, но и спрос по топу не виден.`);
    const np = median(near.filter((x) => x.price > 0).map((x) => x.price));
    if (near.length >= 3 && np != null) lines.push(`У ближайших по тропам книг обычная цена — ${Math.round(np)} ₽${b.price > 0 ? `, у вас ${Math.round(b.price)} ₽` : ''}.`);
    if (b.ann && anns0(cur, books) >= 0.4 && !/^\s*[—–-]\s*\S/.test(b.ann)) lines.push(`Аннотация: ${Math.round(anns0(cur, books) * 100)} % книг топа начинают её с реплики героя, ваша начинается с описания.`);
    return { id: b.id, title: b.title, tropes: tr, near, lines };
  }).filter(Boolean);
  // пары тропов, которые чаще всего стоят вместе
  const pairN = {}; for (const r of cur) { const tr = books[r.id]?.tr || []; for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) { const k = [tr[i], tr[j]].sort().join(' + '); pairN[k] = (pairN[k] || 0) + 1; } }
  const pairs = Object.entries(pairN).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, n]) => ({ name, n }));
  // цена: сколько книг в каждой вилке и как их читают
  const bucket = (name, f) => { const rows = cur.filter(f); return { name, n: rows.length, share: rows.length / cur.length, lib: median(rows.map((r) => r.l)), interest: medConv ? (median(rows.map(conv)) ?? 0) / medConv || null : null }; };
  const full = (r) => r.f ?? r.p;
  const prices = [bucket('Бесплатно', (r) => r.p === 0), bucket('до 129 ₽', (r) => r.p > 0 && full(r) < 130), bucket('130–149 ₽', (r) => r.p > 0 && full(r) >= 130 && full(r) < 150), bucket('150–169 ₽', (r) => r.p > 0 && full(r) >= 150 && full(r) < 170), bucket('170 ₽ и выше', (r) => r.p > 0 && full(r) >= 170)].filter((b) => b.n);
  const sizes = [bucket('до 100 стр.', (r) => r.g > 0 && r.g < 100), bucket('100–199 стр.', (r) => r.g >= 100 && r.g < 200), bucket('200–299 стр.', (r) => r.g >= 200 && r.g < 300), bucket('300 стр. и больше', (r) => r.g >= 300)].filter((b) => b.n);
  // как подают книгу: первая строка аннотации и слова в названиях
  const anns = cur.map((r) => books[r.id]?.an || '').filter(Boolean), sh = (re) => (anns.length ? anns.filter((a) => re.test(a)).length / anns.length : 0);
  const STOP = new Set(['для', 'его', 'мой', 'моя', 'мое', 'моей', 'меня', 'или', 'как', 'что', 'это', 'при', 'под', 'над', 'без', 'после', 'перед', 'книга', 'любовь', 'тебя', 'тебе', 'твой', 'твоя', 'нам', 'нами', 'ним', 'она', 'они']);
  const wordN = {}; for (const r of cur) for (const w of new Set(String(books[r.id]?.t || '').toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z]+/).filter((x) => x.length >= 4 && !STOP.has(x)).map((x) => x.slice(0, 5)))) wordN[w] = (wordN[w] || 0) + 1;
  const titleWords = Object.entries(wordN).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([stem, n]) => ({ word: (cur.map((r) => String(books[r.id]?.t || '').toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z]+/).find((x) => x.startsWith(stem))).find(Boolean)) || stem, n }));
  const pitch = { dialogue: sh(/^\s*[—–-]\s*\S/), warn: sh(/18\+|откровенн|горяч|мат\b|хэ\b|хэппи/i), emoji: sh(/[\u{1F300}-\u{1FAFF}\u2764\u2705\u2728]/u), titleWords };
  const formula = { pages: median(cur.map((r) => r.g || null)), conv: medConv, likes: median(cur.map((r) => (r.l >= 100 ? r.k / r.l : null))), lib: medLib0(cur) };
  // выводы простыми словами — только на достаточных данных
  const notes = [];
  const up = tropes.filter((t) => t.delta != null && t.delta >= 0.1 && t.n >= 3)[0], down = tropes.filter((t) => t.delta != null && t.delta <= -0.1)[0];
  const niche = tropeMap.filter((t) => t.verdict === 'niche')[0], tired = tropeMap.filter((t) => t.verdict === 'tired')[0];
  if (niche) notes.push(`Свободнее всего сейчас «${niche.name}»: таких книг в топе ${Math.round(niche.share * 100)} %, а добавляют их в библиотеку в ${niche.interest.toFixed(1).replace('.', ',')} раза охотнее обычного.`);
  if (tired) notes.push(`Перегрето «${tired.name}»: ${Math.round(tired.share * 100)} % книг топа, а интерес ниже обычного — выделиться труднее.`);
  if (tropes[0]) notes.push(`Чаще всего в топе: ${tropes.slice(0, 3).map((t) => `«${t.name}» (${Math.round(t.share * 100)} %)`).join(', ')}.`);
  if (up) notes.push(`Растёт «${up.name}»: было ${Math.round(up.was * 100)} % книг топа, стало ${Math.round(up.share * 100)} %.`);
  if (down) notes.push(`Уходит «${down.name}»: было ${Math.round(down.was * 100)} %, стало ${Math.round(down.share * 100)} %.`);
  const mp = median(paid.map((r) => r.f ?? r.p));
  if (mp != null) notes.push(`Обычная цена в топе — ${Math.round(mp)} ₽${paid.some((r) => r.o) ? `, со скидкой сейчас ${Math.round(paid.filter((r) => r.o).length / paid.length * 100)} % платных книг` : ''}.`);
  // её цены против обычной цены топа
  const my = myPrices.filter((x) => x > 0);
  if (mp != null && my.length) { const m0 = median(my), d = (m0 - mp) / mp; notes.push(Math.abs(d) < 0.07 ? `Ваши цены (${Math.round(m0)} ₽) — на уровне топа.` : d < 0 ? `Ваши цены (${Math.round(m0)} ₽) ниже обычной цены топа на ${Math.round(-d * 100)} % — есть запас поднять.` : `Ваши цены (${Math.round(m0)} ₽) выше обычной цены топа на ${Math.round(d * 100)} %.`); }
  const mineSet = new Set(mine.map((x) => String(x).toLowerCase()));
  const myT = tropes.filter((t) => mineSet.has(t.name.toLowerCase()));
  if (mineSet.size && myT.length) notes.push(`Ваши тропы в топе: ${myT.map((t) => `«${t.name}» — ${Math.round(t.share * 100)} %`).join(', ')}.`);
  if (odd.length) { const by = {}; for (const b of odd) by[b.author || 'без автора'] = (by[b.author || 'без автора'] || 0) + 1; const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    notes.push(`В топе ${odd.length} ${odd.length === 1 ? 'книга' : odd.length < 5 ? 'книги' : 'книг'} с очень малым числом читателей${top[1] > 1 ? ` (из них ${top[1]} — ${top[0]})` : ''}: место держится не на библиотеках и просмотрах.`); }
  if (movers[0]) notes.push(`Быстрее всех набирает читателей «${movers[0].title}» (${movers[0].author}): +${movers[0].perDay} в библиотеки в день${movers[0].tropes.length ? ` — ${movers[0].tropes.slice(0, 3).join(', ').toLowerCase()}` : ''}.`);
  return { date: last, prevDate, gap, n: cur.length, tropes, tropeMap, pairs, prices, sizes, pitch, formula, movers, fresh, gone, odd, medLib, authors, notes, fit, all: cur.map(card), top: cur.slice(0, 16).map(card),
    price: { median: mp, free: cur.filter((r) => r.p === 0).length / cur.length, off: paid.length ? paid.filter((r) => r.o).length / paid.length : 0 },
    excl: cur.filter((r) => r.e).length / cur.length, progress: cur.filter((r) => !r.s).length / cur.length, pages: median(cur.map((r) => r.g)) };
}
// хранить не больше keep дней; карточки книг, которых нет ни в одном срезе, убрать
export function trimSnap(snap, keep = 45) {
  const dates = Object.keys(snap.days || {}).sort().slice(-keep), days = Object.fromEntries(dates.map((d) => [d, snap.days[d]]));
  const ids = new Set(Object.values(days).flatMap((d) => Object.values(d).flatMap((rows) => rows.map((r) => r.id))));
  return { ...snap, days, books: Object.fromEntries(Object.entries(snap.books || {}).filter(([id]) => ids.has(id))) };
}

// Письмо «Рынок за неделю» (обычным текстом): главное, кто растёт, новые и выпавшие, аномалии. Пусто — писать не о чем
export function marketDigest(M, { myTropes = [] } = {}) {
  if (!M || !M.prevDate) return '';
  const fmt = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`, book = (b) => `«${b.title}»${b.author ? ` (${b.author})` : ''}`;
  const L = [`Топы Литнета: ${fmt(M.prevDate)} → ${fmt(M.date)}.`, '', ...M.notes];
  const up = M.tropes.filter((t) => t.delta != null && t.delta >= 0.05).slice(0, 4), down = M.tropes.filter((t) => t.delta != null && t.delta <= -0.05).slice(0, 4);
  if (up.length || down.length) { L.push('', 'Тропы:'); for (const t of up) L.push(`  ▲ ${t.name}: ${Math.round(t.was * 100)} % → ${Math.round(t.share * 100)} %`); for (const t of down) L.push(`  ▼ ${t.name}: ${Math.round(t.was * 100)} % → ${Math.round(t.share * 100)} %`); }
  if (M.movers.length) { L.push('', 'Быстрее всех набирают читателей (в библиотеки в день):'); for (const b of M.movers.slice(0, 5)) L.push(`  +${b.perDay} — ${book(b)}${b.tropes.length ? ' · ' + b.tropes.slice(0, 3).join(', ').toLowerCase() : ''}${b.price > 0 ? ` · ${Math.round(b.price)} ₽` : ''}`); }
  if (M.fresh.length) L.push('', `Новые в топе: ${M.fresh.slice(0, 6).map(book).join('; ')}.`);
  if (M.gone.length) L.push(`Выпали: ${M.gone.slice(0, 6).map(book).join('; ')}.`);
  if (M.odd.length) L.push('', `В топе при малом числе читателей: ${M.odd.slice(0, 5).map((b) => `${book(b)} — место ${b.n}, ${b.lib} в библ., в топе ${b.days} дн.`).join('; ')}.`);
  // что это значит для неё: её тропы против растущих
  const mine = new Set(myTropes.map((x) => String(x).toLowerCase())), hot = up.filter((t) => !mine.has(t.name.toLowerCase())).map((t) => t.name), cold = down.filter((t) => mine.has(t.name.toLowerCase())).map((t) => t.name);
  if (mine.size && (hot.length || cold.length)) { L.push('', 'Для вас:'); if (hot.length) L.push(`  растут тропы, которых у вас нет: ${hot.join(', ')} — стоит присмотреться к крючкам в объявлениях.`); if (cold.length) L.push(`  ваши тропы теряют место в топе: ${cold.join(', ')} — не повод менять книгу, но повод проверить CTR объявлений с ними (Директ → «Крючки»).`); }
  L.push('', 'Подробно — Директ → «Рынок».');
  return L.join('\n');
}
