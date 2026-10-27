// Сайт автора: что на нём бывает (блоки, книги, цвета) и сборка страницы из содержимого.
// Чистые функции — их используют и сам сайт, и админка (предпросмотр), и тесты.

// Акценты: a1 — глубокий тон (низ туманного фона, линии), a2 — светлый (верх фона)
export const PALETTES = [
  { id: 'fog', name: 'Туман', a1: '#8a9aa6', a2: '#d3dbe0' },
  { id: 'graphite', name: 'Графит', a1: '#5d646c', a2: '#d5d8db' },
  { id: 'taiga', name: 'Тайга', a1: '#6f8577', a2: '#d3dcd5' },
  { id: 'ice', name: 'Лёд', a1: '#7fa2b6', a2: '#dce8ef' },
  { id: 'ash', name: 'Пепел', a1: '#958d86', a2: '#e0dcd8' },
  { id: 'summer', name: 'Пудра', a1: '#f5c6d3', a2: '#b9dbf3' },
];

export const PLATFORMS = [
  ['litnet', 'Литнет'], ['litres', 'Литрес'], ['litmarket', 'Литмаркет'], ['litgorod', 'Литгород'],
];

// Поля блоков: по ним админка сама строит форму.
// type: text | area | book | books | img | url; hint — подсказка серым под полем
const MENU = { k: 'menu', label: 'Пункт в меню сверху', hint: 'Пусто — блока нет в меню' };
export const BLOCKS = {
  hero: { name: 'Первый экран', fields: [
    { k: 'label', label: 'Строка над заголовком' },
    { k: 'title', label: 'Заголовок', type: 'area', hint: '*Слово в звёздочках* — тонким курсивом' },
    { k: 'text', label: 'Текст', type: 'area' },
    { k: 'btn', label: 'Кнопка', hint: 'Ведёт к блоку «Книга крупно»' },
    { k: 'book', label: 'Книга справа', type: 'book' },
  ] },
  marquee: { name: 'Бегущая строка', fields: [
    { k: 'items', label: 'Фразы', type: 'area', hint: 'Каждая с новой строки; *в звёздочках* — курсивом' },
  ] },
  book: { name: 'Книга крупно', fields: [
    { k: 'label', label: 'Подпись сверху', hint: 'Например: Новинка · пишется сейчас' },
    { k: 'book', label: 'Книга', type: 'book' },
    MENU,
  ] },
  series: { name: 'Цикл', fields: [
    { k: 'label', label: 'Подпись сверху', hint: 'Например: Цикл' },
    { k: 'title', label: 'Название цикла', type: 'area', hint: '*Слово в звёздочках* — курсивом' },
    { k: 'text', label: 'Пара строк о цикле', type: 'area' },
    { k: 'books', label: 'Книги по порядку', type: 'books', hint: 'Порядок — как в списке «Книги»' },
    MENU,
  ] },
  start: { name: 'Подборка книг', fields: [
    { k: 'title', label: 'Заголовок' },
    { k: 'sub', label: 'Подзаголовок курсивом' },
    { k: 'books', label: 'Книги', type: 'books' },
    MENU,
  ] },
  books: { name: 'Все книги', fields: [
    { k: 'title', label: 'Заголовок' },
    { k: 'sub', label: 'Подзаголовок курсивом' },
    MENU,
  ] },
  quote: { name: 'Цитата', fields: [
    { k: 'label', label: 'Подпись слева' },
    { k: 'text', label: 'Цитата', type: 'area' },
    { k: 'cite', label: 'Откуда', hint: 'Например: «Север и август», глава 9' },
  ] },
  about: { name: 'Об авторе', fields: [
    { k: 'label', label: 'Подпись сверху' },
    { k: 'title', label: 'Заголовок', hint: '*Слово в звёздочках* — курсивом' },
    { k: 'text', label: 'Текст', type: 'area', hint: 'Пустая строка — новый абзац' },
    { k: 'photo', label: 'Фото', type: 'img', hint: 'Без фото — розово-голубой туман' },
    { k: 'facts', label: 'Цифры', type: 'area', hint: 'Каждая с новой строки: 12 — книг' },
    MENU,
  ] },
  tg: { name: 'Подписка', fields: [
    { k: 'label', label: 'Подпись сверху' },
    { k: 'title', label: 'Заголовок', hint: '*Слово в звёздочках* — курсивом' },
    { k: 'text', label: 'Текст', type: 'area' },
    { k: 'btn', label: 'Кнопка' },
    { k: 'url', label: 'Ссылка кнопки', type: 'url', hint: 'Например: https://t.me/ваш_канал' },
    MENU,
  ] },
  text: { name: 'Текст', fields: [
    { k: 'label', label: 'Подпись сверху' },
    { k: 'title', label: 'Заголовок', hint: '*Слово в звёздочках* — курсивом' },
    { k: 'text', label: 'Текст', type: 'area', hint: 'Пустая строка — новый абзац' },
    MENU,
  ] },
};

export const BOOK_FIELDS = [
  { k: 'title', label: 'Название', hint: '*Часть в звёздочках* — курсивом: Соль *на губах*' },
  { k: 'cover', label: 'Обложка', type: 'img', hint: 'Без обложки — строгая обложка из названия' },
  { k: 'mood', label: 'Настроение', hint: 'Для подборки: Для первого знакомства' },
  { k: 'short', label: 'Коротко', type: 'area', hint: 'Пара строк для подборки' },
  { k: 'ann', label: 'Аннотация', type: 'area' },
  { k: 'status', label: 'Статус', type: 'status' },
  { k: 'done', label: 'Глав написано', type: 'num' },
  { k: 'total', label: 'Глав всего (примерно)', type: 'num' },
  { k: 'al', label: 'Объём, а.л.', hint: 'Например: 7,8' },
  ...PLATFORMS.map(([k, n]) => ({ k, label: n, type: 'url', hint: 'Ссылка на книгу' })),
];

export const STATUS = { writing: 'Пишется', done: 'Завершена' };

let seq = 0;
export const newId = (p = 'b') => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

export const newBlock = (type) => ({ id: newId('k'), type, ...Object.fromEntries(BLOCKS[type].fields.map((f) => [f.k, f.type === 'books' ? [] : ''])) });
export const newBook = () => ({ id: newId('b'), ...Object.fromEntries(BOOK_FIELDS.map((f) => [f.k, ''])), status: 'writing' });

// Первый пример (v1). Нужен только чтобы понять, какие тексты владелица ещё не меняла, и обновить их на новые
const V1_EXAMPLE = {
  v: 1,
  name: 'Лана Фрейтаг',
  headBtn: 'Telegram',
  headUrl: '',
  foot: 'Telegram — \nЛитнет — ',
  palette: 'summer',
  a1: '', a2: '',
  books: [
    { id: 'b1', title: 'Соль *на губах*', mood: 'Если хочется моря', short: 'Маленький город у моря и одна тайна, о которой молчат оба.',
      ann: 'Она приехала к морю, чтобы забыть одно лето. Он живёт здесь круглый год и помнит каждое. Маленький город, где все про всех знают, и одна тайна, о которой молчат оба.',
      status: 'writing', done: 14, total: 24, al: '7,8', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
    { id: 'b2', title: 'Тише *воды*', mood: 'Для первого знакомства', short: 'Тихая библиотекарша и человек, которого боится весь город. Нежно, медленно, с юмором.',
      ann: '', status: 'done', done: '', total: '', al: '', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
    { id: 'b3', title: 'Невеста *не по правилам*', mood: 'Если хочется искр', short: 'Фиктивная помолвка на одно лето. Правила они придумали сами — и сами же их нарушили.',
      ann: '', status: 'done', done: '', total: '', al: '', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
    { id: 'b4', title: 'Север *и август*', mood: 'Чтобы поплакать', short: 'Вторая попытка через десять лет. История о том, что прощать — тоже про любовь.',
      ann: '', status: 'done', done: '', total: '', al: '', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
  ],
  blocks: [
    { id: 'k1', type: 'hero', label: 'Любовные романы · новые главы на Литнете', title: 'Любовь,\n*о которой*\nне говорят вслух',
      text: 'Медленные, нежные и очень честные истории о людях, которые встретились не вовремя — и всё равно выбрали друг друга.', btn: 'Читать новинку', book: 'b1' },
    { id: 'k2', type: 'marquee', items: 'Лана Фрейтаг\n*новая глава — по вторникам*\nЛюбовные романы\n*только счастливый финал*\nЛитнет · Литрес · Литмаркет' },
    { id: 'k3', type: 'book', label: 'Новинка · пишется сейчас', book: 'b1', menu: '' },
    { id: 'k4', type: 'start', title: 'С чего начать', sub: 'если вы здесь впервые', books: ['b2', 'b3', 'b4'], menu: 'Книги' },
    { id: 'k5', type: 'quote', label: 'Из книги', text: '«Я не просила тебя остаться. Я просто оставила дверь открытой — на всякий случай, на всю жизнь».', cite: '«Север и август», глава 9' },
    { id: 'k6', type: 'about', label: 'Об авторе', title: 'Пишу о любви *без спешки*',
      text: 'Меня зовут Лана Фрейтаг. Я пишу романы, в которых чувства растут медленно, герои говорят друг с другом по-взрослому, а финал всегда счастливый.\n\nКниги выходят по главам на Литнете — можно читать вместе со мной, пока история пишется.',
      photo: '', facts: '12 — книг\n4 — площадки\n2 — главы в неделю', menu: 'Об авторе' },
    { id: 'k7', type: 'tg', label: 'Telegram-канал', title: 'Читать *раньше всех*',
      text: 'Новые главы в день выхода, обложки до премьеры, разговоры о героях и маленькие сцены, которые не вошли в книги.', btn: 'Подписаться', url: '', menu: 'Дневник' },
  ],
};

// Пример: так сайт выглядит, пока ничего не заполнено (книги и цикл — настоящие, тексты — заготовки)
export const DEFAULT_CONTENT = {
  v: 2,
  name: 'Лана Фрейтаг',
  headBtn: 'Telegram',
  headUrl: '',
  foot: 'Telegram — \nЛитнет — ',
  palette: 'fog',
  a1: '', a2: '',
  books: [
    { id: 'b1', title: 'Развод *для черной вдовы*', mood: 'Похоронный бизнес', short: 'Новая история цикла — пишется прямо сейчас.',
      ann: '', status: 'writing', done: 1, total: '', al: '0,14', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
    { id: 'b2', title: 'Альпийский *развод*', mood: 'Горы и криминал', short: 'Горы, криминал и развод, который пошёл совсем не по плану.',
      ann: '', status: 'done', done: 28, total: 28, al: '10,2', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
    { id: 'b3', title: 'Звериная тропа *для двоих*', mood: 'Тайга и медведи', short: 'Лес, медведи и мужчина, с которым лучше не связываться.',
      ann: '', status: 'done', done: 27, total: 27, al: '10,8', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
  ],
  blocks: [
    { id: 'k1', type: 'hero', label: 'Остросюжетные любовные романы', title: 'С кем я,\n*черт возьми,*\nсвязалась',
      text: 'Криминал, медведи и похоронный бизнес. Героини, которые влипли по-крупному, и мужчины, от которых лучше держаться подальше.', btn: 'Читать новинку', book: 'b1' },
    { id: 'k2', type: 'marquee', items: 'Лана Фрейтаг\n*остросюжетные любовные романы*\nКриминал · горы · тайга\n*с кем я, черт возьми, связалась*\nЛитнет · Литгород' },
    { id: 'k8', type: 'series', label: 'Цикл', title: 'С кем я, *черт возьми,* связалась', text: 'Каждую книгу можно читать отдельно. Общее у них одно: героиня связалась не с тем мужчиной — и это лучшее, что с ней случилось.', books: ['b2', 'b3', 'b1'], menu: 'Книги' },
    { id: 'k3', type: 'book', label: 'Новинка · пишется сейчас', book: 'b1', menu: '' },
    { id: 'k4', type: 'start', title: 'С чего начать', sub: 'если вы здесь впервые', books: ['b2', 'b3'], menu: '', hidden: true },
    { id: 'k5', type: 'quote', label: 'Из книги', text: 'Сюда — короткая цитата из книги', cite: '«Название книги», глава 1', hidden: true },
    { id: 'k6', type: 'about', label: 'Об авторе', title: 'Пишу о любви *с риском для жизни*',
      text: 'Меня зовут Лана Фрейтаг. Я пишу остросюжетные любовные романы: с криминалом, тайнами и героями, от которых лучше держаться подальше — но не получается.\n\nКниги выходят по главам на Литнете — можно читать вместе со мной, пока история пишется.',
      photo: '', facts: '3 — книги цикла\n2 — завершены', menu: 'Об авторе' },
    { id: 'k7', type: 'tg', label: 'Telegram-канал', title: 'Читать *раньше всех*',
      text: 'Новые главы в день выхода, обложки до премьеры и разговоры о героях — тех, с кем лучше не связываться.', btn: 'Подписаться', url: '', menu: 'Дневник' },
  ],
};

// Приводит сохранённое содержимое к нужному виду (старые и неполные данные не ломают сайт)
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
// v1 → v2 (новое оформление): всё, что осталось как в первом примере, заменяется новым примером; правки владелицы не трогаем
function upgrade(c) {
  if ((c.v || 1) >= 2) return c;
  const d = DEFAULT_CONTENT, old = V1_EXAMPLE;
  const out = { ...c, v: 2 };
  for (const k of ['palette', 'foot', 'headBtn']) if (same(c[k], old[k])) out[k] = d[k];
  const fix = (list, oldList, newList) => (list || []).flatMap((x) => {
    const o = oldList.find((y) => y.id === x.id);
    if (!o) return [x];
    const n = newList.find((y) => y.id === x.id);
    if (!n) return Object.keys(o).every((k) => same(x[k], o[k])) ? [] : [x]; // пример без замены — убрать, если не меняли
    const r = { ...x };
    for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) if (k !== 'id' && same(x[k], o[k])) r[k] = structuredClone(n[k]);
    return [r];
  });
  out.books = fix(c.books, old.books, d.books);
  for (const b of d.books) if (!out.books.some((x) => x.id === b.id)) out.books.push(structuredClone(b));
  out.blocks = fix(c.blocks, old.blocks, d.blocks);
  if (!out.blocks.some((b) => b.type === 'series')) {
    const mq = out.blocks.findIndex((b) => b.type === 'marquee');
    const at = mq >= 0 ? mq : out.blocks.findIndex((b) => b.type === 'hero');
    out.blocks.splice(at + 1, 0, structuredClone(d.blocks.find((b) => b.type === 'series')));
  }
  return out;
}

export function normalize(c) {
  const d = DEFAULT_CONTENT;
  if (!c || typeof c !== 'object') return structuredClone(d);
  c = upgrade(c);
  const out = { ...structuredClone(d), ...c };
  out.books = Array.isArray(c.books) ? c.books.filter((b) => b && b.id).map((b) => ({ ...newBook(), ...b })) : structuredClone(d.books);
  out.blocks = Array.isArray(c.blocks) ? c.blocks.filter((b) => b && b.id && BLOCKS[b.type]).map((b) => ({ ...newBlock(b.type), ...b })) : structuredClone(d.blocks);
  return out;
}

export function colors(c) {
  const p = PALETTES.find((x) => x.id === c.palette) || PALETTES[0];
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : '');
  return c.palette === 'custom' ? { a1: hex(c.a1) || p.a1, a2: hex(c.a2) || p.a2 } : { a1: p.a1, a2: p.a2 };
}

// ---------- сборка страницы ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
// *курсив* → тонкий курсив; перенос строки — в заголовках
export const fmt = (s, br = true) => {
  const t = esc(s).replace(/\*([^*\n]+)\*/g, '<span class="it">$1</span>');
  return br ? t.replace(/\n/g, '<br>') : t.replace(/\n/g, ' ');
};
const plain = (s) => String(s ?? '').replace(/\*/g, '');
// Ссылки — только обычные адреса сайтов и Telegram (никакого javascript: и т. п.)
export const safeUrl = (u) => {
  const s = String(u ?? '').trim();
  if (/^https?:\/\/[^\s"'<>]+$/i.test(s)) return s;
  if (/^(t\.me|www\.)[^\s"'<>]+$/i.test(s)) return 'https://' + s;
  return '';
};
const paras = (s) => String(s ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${fmt(p)}</p>`).join('');
const lines = (s) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);
const ext = (u) => (u.startsWith('#') ? '' : ' target="_blank" rel="noopener"');

// Обложка: загруженная картинка или строгая типографская обложка из названия (как у издательской серии)
function cover(b, i, imgs, name) {
  if (b.cover && imgs[b.cover]) return `<div class="cover cover-img"><img src="${esc(imgs[b.cover])}" alt="${esc(plain(b.title))}" loading="lazy"></div>`;
  const [t1, t2] = String(b.title || 'Без названия').split(/\*([^*]+)\*/);
  return `<div class="cover c${(i % 4) + 1}" role="img" aria-label="${esc(plain(b.title))}">`
    + `<span class="cv-a">${esc(name)}</span>`
    + `<span class="cv-t">${esc(t1.trim())}${t2 ? `<i>${esc(t2)}</i>` : ''}</span>`
    + '<span class="cv-s">роман</span></div>';
}

function bookLinks(b) {
  return PLATFORMS.map(([k, n]) => [n, safeUrl(b[k])]).filter(([, u]) => u);
}

export function renderSite(raw, imgs = {}) {
  const c = normalize(raw);
  const books = new Map(c.books.map((b, i) => [b.id, { ...b, i }]));
  const blocks = c.blocks.filter((b) => !b.hidden);
  const bookBlock = blocks.find((b) => b.type === 'book');
  const shelf = blocks.find((b) => b.type === 'series' || b.type === 'books' || b.type === 'start');
  const name = c.name || 'Автор';
  const cv = (b) => cover(b, b.i, imgs, name);
  const lbl = (s) => (s ? `<div class="lbl">${fmt(s, false)}</div>` : '');

  const R = {
    hero: (k) => {
      const b = books.get(k.book);
      const to = bookBlock ? '#' + bookBlock.id : '';
      return `<section class="hero" id="${k.id}"><div class="wrap hero-in${b ? '' : ' solo'}">
        <div class="hero-txt">
          ${lbl(k.label)}
          <h1>${String(k.title || '').split('\n').filter((l) => l.trim()).map((l) => `<span class="ln${/^\s*\*/.test(l) ? ' ln-it' : ''}">${fmt(l.trim(), false)}</span>`).join('')}</h1>
          ${k.text ? `<p class="lead">${fmt(k.text)}</p>` : ''}
          <div class="acts">
            ${k.btn && to ? `<a class="btn btn-dark" href="${to}">${esc(k.btn)}</a>` : ''}
            ${shelf ? `<a class="lnk" href="#${shelf.id}">Все книги <span class="arrow">→</span></a>` : ''}
          </div>
        </div>
        ${b ? `<a class="stage mist" href="${to || '#' + k.id}" aria-label="${esc(plain(b.title))}">
          <div class="stage-book">${cv(b)}</div>
          <span class="stage-cap"><span>${esc(STATUS[b.status] || '')}</span>${b.done && b.status === 'writing' ? `<span>Глава ${esc(b.done)}</span>` : ''}</span></a>` : ''}
      </div></section>`;
    },
    marquee: (k) => {
      const items = lines(k.items);
      if (!items.length) return '';
      const one = items.map((t) => `<span${/^\*.*\*$/.test(t) ? ' class="it"' : ''}>${esc(t.replace(/^\*|\*$/g, ''))}</span><b aria-hidden="true">✦</b>`).join('');
      return `<div class="run" id="${k.id}" aria-hidden="true"><div class="run-in">${one}${one}${one}${one}</div></div>`;
    },
    book: (k) => {
      const b = books.get(k.book);
      if (!b) return '';
      const links = bookLinks(b);
      const [first, ...rest] = links;
      const pct = b.total > 0 && b.done > 0 ? Math.min(100, Math.round(b.done / b.total * 100)) : 0;
      const meta = [
        ['Статус', esc(STATUS[b.status] || '')],
        pct && b.status === 'writing' ? ['Написано', `${esc(b.done)} из ~${esc(b.total)} глав<span class="bar"><i style="width:${pct}%"></i></span>`] : null,
        b.al ? ['Объём', `${esc(b.al)}&nbsp;а.л.`] : null,
        links.length ? ['Где читать', links.map(([n]) => esc(n)).join(' · ')] : null,
      ].filter(Boolean);
      return `<section class="sec" id="${k.id}"><div class="wrap feat">
        <div class="stage mist"><div class="stage-book">${cv(b)}</div></div>
        <div class="feat-txt">
          ${lbl(k.label)}
          <h2 class="feat-t">${fmt(b.title, false)}</h2>
          ${b.ann || b.short ? `<p class="ann">${fmt(b.ann || b.short)}</p>` : ''}
          <dl class="meta">${meta.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>
          <div class="acts">
            ${first ? `<a class="btn btn-dark" href="${esc(first[1])}"${ext(first[1])}>Читать на ${esc(first[0])}е</a>` : ''}
            ${rest.map(([n, u]) => `<a class="lnk" href="${esc(u)}"${ext(u)}>${esc(n)}</a>`).join('')}
          </div>
        </div></div></section>`;
    },
    series: (k) => {
      const list = (k.books || []).map((id) => books.get(id)).filter((b) => b && !b.hidden);
      if (!list.length) return '';
      return `<section class="sec series" id="${k.id}"><div class="wrap">
        <div class="series-h">
          <div>${lbl(k.label)}<h2>${fmt(k.title)}</h2></div>
          ${k.text ? `<p>${fmt(k.text)}</p>` : ''}
        </div>
        <div class="start n${Math.min(list.length, 4)}">${list.map((b, i) => card(b, false, i + 1)).join('')}</div></div></section>`;
    },
    start: (k) => {
      const list = (k.books || []).map((id) => books.get(id)).filter(Boolean);
      if (!list.length) return '';
      return `<section class="sec" id="${k.id}"><div class="wrap">
        <div class="sec-h"><h2>${fmt(k.title, false)}</h2>${k.sub ? `<span class="it">${esc(k.sub)}</span>` : ''}</div>
        <div class="start n${Math.min(list.length, 4)}">${list.map((b) => card(b)).join('')}</div></div></section>`;
    },
    books: (k) => {
      const list = [...books.values()].filter((b) => !b.hidden);
      if (!list.length) return '';
      return `<section class="sec" id="${k.id}"><div class="wrap">
        <div class="sec-h"><h2>${fmt(k.title || 'Книги', false)}</h2>${k.sub ? `<span class="it">${esc(k.sub)}</span>` : ''}</div>
        <div class="grid">${list.map((b) => card(b, true)).join('')}</div></div></section>`;
    },
    quote: (k) => k.text ? `<section class="quote" id="${k.id}"><div class="wrap q-in">
        <span class="q-mark" aria-hidden="true">“</span>
        <blockquote>${fmt(k.text.trim().replace(/^[«"“„]\s*/, '').replace(/\s*[»"”](\.?)$/, '$1'))}</blockquote>
        <div class="q-foot">${k.label ? `<span class="lbl">${esc(k.label)}</span>` : ''}${k.cite ? `<cite>${esc(k.cite)}</cite>` : ''}</div>
      </div></section>` : '',
    about: (k) => {
      const facts = lines(k.facts).map((l) => l.split(/\s+[—–-]\s+/)).filter((p) => p[0]);
      const ph = k.photo && imgs[k.photo];
      return `<section class="sec" id="${k.id}"><div class="wrap about">
        <div class="arch-w"><div class="arch${ph ? '' : ' mist'}">${ph ? `<img src="${esc(ph)}" alt="${esc(name)}" loading="lazy">` : `<span>${esc(initials(name))}</span>`}</div></div>
        <div class="about-txt">
          ${lbl(k.label)}
          ${k.title ? `<h2>${fmt(k.title)}</h2>` : ''}
          <div class="prose">${paras(k.text)}</div>
          ${facts.length ? `<div class="facts">${facts.map(([n, l]) => `<div><b>${esc(n)}</b>${l ? `<span>${esc(l)}</span>` : ''}</div>`).join('')}</div>` : ''}
        </div></div></section>`;
    },
    tg: (k) => {
      const u = safeUrl(k.url);
      return `<section class="tg" id="${k.id}"><div class="wrap tg-in"><div>
        ${lbl(k.label)}
        <h2>${fmt(k.title)}</h2>
        ${k.text ? `<p>${fmt(k.text)}</p>` : ''}</div>
        ${k.btn ? `<a class="btn btn-light" href="${esc(u || '#' + k.id)}"${u ? ext(u) : ''}>${esc(k.btn)} <span class="arrow">→</span></a>` : ''}
      </div></section>`;
    },
    text: (k) => `<section class="sec text-b" id="${k.id}"><div class="wrap">
        ${lbl(k.label)}
        ${k.title ? `<h2>${fmt(k.title)}</h2>` : ''}
        <div class="prose">${paras(k.text)}</div></div></section>`,
  };

  function card(b, small, num) {
    const u = safeUrl(b.litnet) || bookLinks(b)[0]?.[1] || '';
    const tag = u ? `a href="${esc(u)}"${ext(u)}` : 'div';
    return `<${tag} class="card${small ? ' sm' : ''}">
      ${num ? `<span class="num"><b>${String(num).padStart(2, '0')}</b>Книга ${num}${b.status === 'writing' ? ' · пишется' : ''}</span>` : ''}
      <div class="plinth">${cv(b)}</div>
      <div class="card-txt">
        ${b.mood && !small ? `<span class="mood">${esc(b.mood)}</span>` : ''}
        <h3>${fmt(b.title, false)}</h3>
        ${small ? `<span class="lbl">${esc(STATUS[b.status] || '')}</span>` : ''}
        ${b.short && !small ? `<p>${fmt(b.short)}</p>` : ''}
        ${u && !small ? '<span class="lnk">Читать <span class="arrow">→</span></span>' : ''}
      </div>
    </${tag.split(' ')[0]}>`;
  }

  const menu = blocks.filter((b) => b.menu).map((b) => [b.menu, '#' + b.id]);
  const nav = menu.map(([n, u]) => `<a href="${u}">${esc(n)}</a>`).join('');
  const headU = safeUrl(c.headUrl);
  const headBtn = c.headBtn && headU ? `<a class="btn btn-line" href="${esc(headU)}"${ext(headU)}>${esc(c.headBtn)}</a>` : '';
  const footLinks = lines(c.foot).map((l) => l.split(/\s+[—–-]\s*/)).map(([n, u]) => [n, safeUrl(u)]).filter(([n, u]) => n && u);
  return {
    title: name,
    head: `<div class="wrap head-in"><nav class="nav" aria-label="Разделы">${nav}</nav>
      <a class="logo" href="#top">${esc(name)}</a>
      <div class="top-r">${headBtn}${menu.length || headBtn ? '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="mnav"><span></span><span></span><em>Меню</em></button>' : ''}</div></div>
      <nav class="mnav" id="mnav" aria-label="Меню" hidden><div class="wrap">${nav}${headBtn}</div></nav>`,
    main: blocks.map((k) => R[k.type](k)).join('\n'),
    foot: `<div class="wrap">
      <div class="foot-top"><nav aria-label="Разделы">${nav}</nav><a class="lnk" href="#top">Наверх <span class="arrow">↑</span></a></div>
      <div class="foot-big" aria-hidden="true">${esc(name)}</div>
      <div class="foot-row"><span>© ${new Date().getFullYear()} ${esc(name)}</span>
      <nav aria-label="Ссылки">${footLinks.map(([n, u]) => `<a href="${esc(u)}"${ext(u)}>${esc(n)}</a>`).join('')}</nav></div></div>`,
    colors: colors(c),
  };
}

const initials = (n) => String(n).split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
