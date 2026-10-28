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


// Поля блоков главной: по ним админка сама строит форму.
// type: text | area | book | books | img | url | series; hint — подсказка серым под полем
const MENU = { k: 'menu', label: 'Пункт в меню сверху', hint: 'Пусто — блока нет в меню' };
export const BLOCKS = {
  hero: { name: 'Первый экран', fields: [
    { k: 'label', label: 'Строка над заголовком' },
    { k: 'title', label: 'Заголовок', type: 'area', hint: '*Слово в звёздочках* — тонким курсивом' },
    { k: 'text', label: 'Текст', type: 'area' },
    { k: 'btn', label: 'Кнопка' },
    { k: 'book', label: 'Кнопка ведёт на страницу книги', type: 'book', hint: 'Эта книга — и в строке «Новинка» справа' },
    { k: 'art', label: 'Медведь с обложки справа', type: 'toggle', hint: '' },
    { k: 'photo', label: 'Другая картинка вместо медведя', type: 'img', hint: 'По желанию' },
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
    { k: 'series', label: 'Цикл', type: 'series', hint: 'Книги цикла встают сами, по номеру в цикле' },
    { k: 'label', label: 'Подпись сверху', hint: 'Например: Цикл' },
    { k: 'title', label: 'Заголовок', type: 'area', hint: 'Пусто — название цикла; *слово в звёздочках* — курсивом' },
    { k: 'text', label: 'Пара строк о цикле', type: 'area' },
    MENU,
  ] },
  books: { name: 'Все книги', fields: [
    { k: 'title', label: 'Заголовок' },
    { k: 'sub', label: 'Подзаголовок курсивом' },
    MENU,
  ] },
  start: { name: 'Подборка книг', fields: [
    { k: 'title', label: 'Заголовок' },
    { k: 'sub', label: 'Подзаголовок курсивом' },
    { k: 'books', label: 'Книги', type: 'books' },
    MENU,
  ] },
  quote: { name: 'Цитата', fields: [
    { k: 'label', label: 'Подпись слева' },
    { k: 'text', label: 'Цитата', type: 'area' },
    { k: 'cite', label: 'Откуда', hint: 'Например: «Альпийский развод», пролог' },
  ] },
  about: { name: 'Об авторе', fields: [
    { k: 'label', label: 'Подпись сверху' },
    { k: 'title', label: 'Заголовок', hint: '*Слово в звёздочках* — курсивом' },
    { k: 'text', label: 'Текст', type: 'area', hint: 'Пустая строка — новый абзац' },
    { k: 'photo', label: 'Фото', type: 'img', hint: 'Небольшое круглое фото. Без фото — инициалы' },
    { k: 'facts', label: 'Цифры', type: 'area', hint: 'Каждая с новой строки: 12 — книг' },
    MENU,
  ] },
  tg: { name: 'Подписка', fields: [
    { k: 'label', label: 'Подпись сверху' },
    { k: 'title', label: 'Заголовок', hint: '*Слово в звёздочках* — курсивом' },
    { k: 'text', label: 'Текст', type: 'area' },
    { k: 'btn', label: 'Кнопка' },
    { k: 'url', label: 'Ссылка на канал', type: 'url', hint: 'Например: https://t.me/ваш_канал — по ней же значок-самолётик в меню' },
    MENU,
  ] },
  text: { name: 'Текст', fields: [
    { k: 'label', label: 'Подпись сверху' },
    { k: 'title', label: 'Заголовок', hint: '*Слово в звёздочках* — курсивом' },
    { k: 'text', label: 'Текст', type: 'area', hint: 'Пустая строка — новый абзац' },
    MENU,
  ] },
};

// Книга = своя продающая страница. Поля по группам — так их видит админка
export const BOOK_GROUPS = [
  { name: 'Главное', fields: [
    { k: 'title', label: 'Название', hint: '*Часть в звёздочках* — курсивом: Альпийский *развод*' },
    { k: 'cover', label: 'Обложка', type: 'img', hint: 'Без обложки — строгая обложка из названия' },
    { k: 'series', label: 'Цикл', type: 'series', hint: 'Пусто — отдельная книга' },
    { k: 'seriesNo', label: 'Номер в цикле', type: 'num' },
    { k: 'status', label: 'Статус', type: 'status' },
    { k: 'done', label: 'Глав написано', type: 'num' },
    { k: 'total', label: 'Глав всего', type: 'num' },
    { k: 'al', label: 'Объём, а.л.', hint: 'Например: 10,2' },
    { k: 'age', label: 'Возраст', hint: 'Например: 18+' },
  ] },
  { name: 'Где читать', fields: [
    ...PLATFORMS.map(([k, n]) => ({ k, label: n, type: 'url' })),
    { k: 'links', label: 'Другие сайты', type: 'area', hint: 'Каждый с новой строки: Author.Today — https://…' },
    { k: 'cta', label: 'Текст главной кнопки', hint: 'Пусто — «Читать на Литнете» (по первой ссылке)' },
  ] },
  { name: 'Страница книги', fields: [
    { k: 'tagline', label: 'Крючок — одна фраза', type: 'area', hint: 'Первое, что видит читатель. Коротко и с интригой' },
    { k: 'tags', label: 'Тропы и метки', hint: 'Через запятую: Развод, Опасный герой, Горы' },
    { k: 'ann', label: 'Аннотация', type: 'area', hint: 'Пустая строка — новый абзац' },
    { k: 'quotes', label: 'Цитаты из книги', type: 'area', hint: 'Между цитатами — пустая строка' },
    { k: 'excerpt', label: 'Отрывок', type: 'area', hint: 'Начало книги или сильная сцена. Обрывается на самом интересном — дальше кнопка «Читать»' },
    { k: 'reviews', label: 'Отзывы читателей', type: 'area', hint: 'Между отзывами — пустая строка; последняя строка «— Имя»' },
    { k: 'slug', label: 'Адрес страницы', hint: 'Латиницей, например alpiyskiy-razvod. Пусто — сделается из названия' },
  ] },
  { name: 'Для подборок на главной', fields: [
    { k: 'mood', label: 'Настроение', hint: 'Коротко: Сванетия · горы' },
    { k: 'short', label: 'Коротко о книге', type: 'area', hint: 'Пара строк под обложкой' },
  ] },
  { name: 'Фотоколлаж', fields: [
    { k: 'collageOn', label: 'Показывать коллаж на странице книги', type: 'toggle' },
    { k: 'collage', label: 'Фото', type: 'imgs', hint: 'До 6 фото: места, атмосфера, образы героев' },
  ] },
];
export const BOOK_FIELDS = BOOK_GROUPS.flatMap((g) => g.fields);

export const STATUS = { writing: 'Пишется', done: 'Завершена' };

let seq = 0;
export const newId = (p = 'b') => p + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

const emptyOf = (f) => (f.type === 'books' || f.type === 'imgs' ? [] : f.type === 'toggle' ? true : '');
export const newBlock = (type) => ({ id: newId('k'), type, ...Object.fromEntries(BLOCKS[type].fields.map((f) => [f.k, emptyOf(f)])) });
export const newBook = () => ({ id: newId('b'), ...Object.fromEntries(BOOK_FIELDS.map((f) => [f.k, emptyOf(f)])), status: 'writing' });

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

// Второй пример (v2) — тоже только для обновления нетронутых текстов
const V2_EXAMPLE = {
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

// Третий пример (v3): тексты по книгам цикла «С кем я, черт возьми, связалась» (цитаты — настоящие, из книг; без раскрытия сюжета)
const V3_EXAMPLE = {
  v: 3,
  name: 'Лана Фрейтаг',
  headBtn: 'Telegram',
  headUrl: '',
  foot: 'Telegram — \nЛитнет — ',
  palette: 'fog',
  a1: '', a2: '',
  books: [
    { id: 'b1', title: 'Развод *для черной вдовы*', mood: 'Ритуальный бизнес · Рига',
      short: 'Владелица похоронного бюро инсценирует смерть мужа. А помочь ей может только самый опасный конкурент.',
      ann: 'Марта руководит маленьким похоронным бюро под Петербургом и умеет хранить чужие тайны. Теперь у неё есть своя: муж, которого она похоронила, жив. И как раз в это время ей достаётся заказ на похороны знаменитого гипнотизёра в Риге — справиться с ним можно только вместе с Глебом Рокотовым, конкурентом, от которого стоило бы держаться подальше.',
      status: 'writing', done: 1, total: '', al: '0,14', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
    { id: 'b2', title: 'Альпийский *развод*', mood: 'Сванетия · горы',
      short: 'Поход в горы должен был спасти брак. Надя очнулась одна, без сил, с мыслью: муж может вернуться, чтобы добить.',
      ann: 'Надя была уверена, что замужем за лучшим мужчиной на свете. Поездка в горы Сванетии должна была вернуть им близость — а закончилась в ледяной траве над ущельем, где каждый свист может оказаться спасением или концом.',
      status: 'done', done: 28, total: 28, al: '10,2', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
    { id: 'b3', title: 'Звериная тропа *для двоих*', mood: 'Алтай · медведи',
      short: 'Тринадцать лет вместе, со школы. Одна поездка на Алтай — и Софа больше не уверена, что знает собственного мужа.',
      ann: 'Софа и Артём вместе со школы, и за тринадцать лет у неё не было ни одного повода в нём сомневаться. Отпуск на Алтае, тайга, медвежьи тропы — и одна ночь, после которой привычный мир начинает трескаться.',
      status: 'done', done: 27, total: 27, al: '10,8', cover: '', litnet: '', litres: '', litmarket: '', litgorod: '' },
  ],
  blocks: [
    { id: 'k1', type: 'hero', label: 'Остросюжетные любовные романы', title: 'С кем я, *черт возьми,* связалась',
      text: 'Истории о женщинах, которые слишком поздно поняли, кто спит рядом, — и о мужчинах, от которых лучше держаться подальше.',
      btn: 'Читать новинку', book: 'b1', books: ['b2', 'b1', 'b3'] },
    { id: 'k2', type: 'marquee', items: 'Сванетия\n*Альпийский развод*\nАлтай\n*Звериная тропа для двоих*\nРига\n*Развод для черной вдовы*' },
    { id: 'k8', type: 'series', label: 'Цикл «С кем я, черт возьми, связалась»', title: 'Три книги — *три женщины*',
      text: 'Каждую можно читать отдельно. Общее у них одно: однажды героиня понимает, что не знает человека, которому доверяла больше всех.', books: ['b2', 'b3', 'b1'], menu: 'Книги' },
    { id: 'k5', type: 'quote', label: 'Из книги', text: 'Он мог вернуться. Собственный муж мог вернуться, чтобы меня добить.', cite: '«Альпийский развод», пролог' },
    { id: 'k3', type: 'book', label: 'Новинка · пишется сейчас', book: 'b1', menu: '' },
    { id: 'k4', type: 'start', title: 'С чего начать', sub: 'если вы здесь впервые', books: ['b2', 'b3'], menu: '', hidden: true },
    { id: 'k6', type: 'about', label: 'Об авторе', title: 'Пишу о любви *с риском для жизни*',
      text: 'Меня зовут Лана Фрейтаг. Я пишу остросюжетные любовные романы: горы Сванетии, тайга Алтая, ритуальный бизнес под Петербургом. Мои героини узнают, что самый опасный человек может годами быть рядом, — и всё равно не перестают верить в любовь.\n\nКниги выходят по главам на Литнете — можно читать вместе со мной, пока история пишется.',
      photo: '', facts: '3 — книги цикла\n2 — завершены\n1 — пишется сейчас', menu: 'Об авторе' },
    { id: 'k7', type: 'tg', label: 'Telegram-канал', title: 'Читать *раньше всех*',
      text: 'Новые главы в день выхода, обложки до премьеры и разговоры о героях — тех, с кем лучше не связываться.', btn: 'Подписаться', url: '', menu: 'Дневник' },
  ],
};

// Тексты, которые владелица вписала сама, но попросила заменить текстами по книгам
const ASKED_TO_REPLACE = { k1: { title: ['В жизни\n*все не так*\nкак на самом деле'] } };

// Пример: книги, циклы и тексты по романам Ланы Фрейтаг (цитаты и отрывки — настоящие, из книг; без раскрытия сюжета)
export const DEFAULT_CONTENT = {
 "v": 4,
 "name": "Лана Фрейтаг",
 "headBtn": "Telegram",
 "headUrl": "",
 "foot": "Telegram — \nЛитнет — ",
 "palette": "fog",
 "subOn": true,
 "subTitle": "Подарок за подписку",
 "giftName": "Проданная ночь",
 "subText": "Оставьте почту — пришлю книгу в подарок. А потом буду писать только о важном: новые книги и главы, обложки до премьеры.",
 "subBtn": "Получить книгу",
 "giftUrl": "",
 "subDone": "Готово, спасибо! Ваша книга — по кнопке ниже.",
 "consent": "Соглашаюсь получать письма",
 "privacy": "Я собираю только адрес электронной почты — чтобы прислать подарок и письма о новых книгах.\n\nАдрес не передаётся третьим лицам. Отписаться можно в любой момент: ответьте на любое письмо или напишите мне.",
 "a1": "",
 "a2": "",
 "books": [
  {
   "id": "b1",
   "title": "Развод *для черной вдовы*",
   "slug": "razvod-dlya-chernoy-vdovy",
   "series": "С кем я, черт возьми, связалась",
   "seriesNo": 3,
   "cover": "",
   "status": "writing",
   "done": 1,
   "total": "",
   "al": "0,14",
   "age": "",
   "tagline": "Она похоронила мужа, который жив. А помочь ей может только самый опасный конкурент.",
   "tags": "Опасный герой, Одержимость, Вынужденное сотрудничество, Фиктивное вдовство, Черный юмор",
   "mood": "Ритуальный бизнес · Рига",
   "short": "Владелица похоронного бюро инсценирует смерть мужа. А помочь ей может только самый опасный конкурент.",
   "ann": "Марта руководит маленьким похоронным бюро под Петербургом и умеет хранить чужие тайны. Теперь у неё есть своя: муж, которого она похоронила, жив.\n\nИ как раз в это время ей достаётся заказ на похороны знаменитого гипнотизёра в Риге. Справиться с ним можно только вместе с Глебом Рокотовым — конкурентом, у которого есть связи, деньги и частный самолёт. И от которого стоило бы держаться подальше.",
   "quotes": "",
   "excerpt": "",
   "heroes": "Марта Руднева — 32 года, владелица похоронного бюро. Знает всех в городе и не боится покойников — в отличие от живых.\nГлеб Рокотов — 36 лет, унаследовал крупную ритуальную группу. Помогает, не отбирая клиента. Пока.\nИлья — муж Марты. Официально — мёртв.",
   "reviews": "",
   "litnet": "",
   "litres": "",
   "litmarket": "",
   "litgorod": "",
   "links": "",
   "cta": "",
   "collageOn": true,
   "collage": []
  },
  {
   "id": "b2",
   "title": "Альпийский *развод*",
   "slug": "alpiyskiy-razvod",
   "series": "С кем я, черт возьми, связалась",
   "seriesNo": 1,
   "cover": "",
   "status": "done",
   "done": 28,
   "total": 28,
   "al": "10,2",
   "age": "",
   "tagline": "Поход в горы должен был спасти брак. Он чуть не стоил ей жизни.",
   "tags": "Развод, Предательство, Горы Сванетии, Сильная героиня, Новая любовь",
   "mood": "Сванетия · горы",
   "short": "Поход в горы должен был спасти брак. Надя очнулась одна, без сил, с мыслью: муж может вернуться, чтобы добить.",
   "ann": "Надя была уверена, что замужем за лучшим мужчиной на свете. Квартира с видом на Москву-реку, подруги, которые завидуют по-доброму, муж, который помнит, сколько сахара она кладёт в кофе.\n\nПоездка в горы Сванетии должна была вернуть им близость. А закончилась в ледяной траве над ущельем — где каждый свист может оказаться спасением или концом.",
   "quotes": "Он мог вернуться. Собственный муж мог вернуться, чтобы меня добить.\n\nНебу было все равно. Горам — тоже. Только я почему-то все еще цеплялась.",
   "excerpt": "Руки меня не слушались. Большие пальцы на руках замерзли так, что я их совсем не чувствовала.\nЛучше бы я не чувствовала ног. Правую ногу — ту, что стреляла болью так, что когда я закрывала глаза, темнота в глазницах окрашивалась оранжевым и красным.\nКазалось, я уже вечность сидела в этом полуболоте, не в силах сопротивляться. Могла бы идти дальше — если бы была сильнее. Если бы отчаяние и паника не сдавливали горло, если бы во мне оставалось хоть что-то, с чем стоит бороться. Плохо, что сейчас не зима. Умирать я буду долго.\nНеожиданно для себя я засмеялась.\nСначала тихо — почти беззвучно, только плечи тряслись. Потом громче. Потом захлебнулась, закашлялась, и все равно продолжала — в надежде, что этот безумный смех разорвет мои легкие и покончит с этим быстрее.\nМне было смешно.\nСмешно, что я считала себя счастливо замужем за лучшим в мире мужчиной. Что доверяла ему. Что нас обоих считала одним целым — будто мы не два отдельных человека, а что-то неделимое, что невозможно разрубить.\nКогда в интернете попадались истории о мужской жестокости, подлости, о женщинах, которых бросали в самый страшный момент, — я втайне радовалась. Мой Никита не такой. Он бы так никогда.\nОн сильный. Верный. Защитит ценой собственной жизни, если потребуется.\nЯ снова залилась смехом. Слезы текли в уши, трава под щекой была ледяной и мокрой, небо надо мной — серым, почти белым, таким равнодушным, что от этого становилось даже легче. Небу было все равно. Горам — тоже. Только я почему-то все еще цеплялась.\nГосподи, какая же я дура.",
   "heroes": "Надя — уверена, что вытянула счастливый билет: хорошая работа, квартира с видом и муж мечты.\nНикита — финансовый директор, ироничный и внимательный. Любит горы больше всего на свете.\nДато — хозяин гостевого дома в Местии. Говорит мало и держит паузу перед каждым словом.",
   "reviews": "",
   "litnet": "",
   "litres": "",
   "litmarket": "",
   "litgorod": "",
   "links": "",
   "cta": "",
   "collageOn": true,
   "collage": []
  },
  {
   "id": "b3",
   "title": "Звериная тропа *для двоих*",
   "slug": "zverinaya-tropa-dlya-dvoih",
   "series": "С кем я, черт возьми, связалась",
   "seriesNo": 2,
   "cover": "",
   "status": "done",
   "done": 27,
   "total": 27,
   "al": "10,8",
   "age": "",
   "tagline": "Тринадцать лет она знала мужа наизусть. До одной ночи на Алтае.",
   "tags": "Брак под вопросом, Алтай, Медведи, Тайна мужа, Психологическое напряжение",
   "mood": "Алтай · медведи",
   "short": "Тринадцать лет вместе, со школы. Одна поездка на Алтай — и Софа больше не уверена, что знает собственного мужа.",
   "ann": "Софа и Артём вместе со школы. Сын, работа, отпуск раз в год — и за тринадцать лет ни одного повода усомниться.\n\nТурбаза в долине Кучерлы, тайга, разговоры про медведей у костра. И одна ночь, после которой мелочи вдруг начинают складываться в картину, на которую страшно смотреть.",
   "quotes": "Тело помнит дольше головы. Тело до сих пор считает его своим.\n\nМне и правда с ним никогда не было страшно.",
   "excerpt": "— А если звоночков совсем бы не было? — сказала я. — За тринадцать лет ни одного зонта.\nНадя выпрямилась. Она смотрела на меня уже совсем иначе, всю свадебную веселость будто смыли с ее лица.\n— Софа, подожди, давай сейчас серьезно. Что он сделал?\nВо дворе Артем поднялся с бокалом, и мужчины застучали по столу, требуя тишины. Он стоял в свете лампочек, в белой рубашке с закатанными рукавами, красивый, теплый, живой, мой.\nЯ смотрела на Артема и только через несколько секунд поняла, что Надя что-то говорит. Ее голос будто пробился ко мне сквозь шум двора:\n— Софа! Софа, не молчи. Тебе с ним страшно?",
   "heroes": "Софа — ведёт бухгалтерию четырёх компаний и знает мужа наизусть. Так ей кажется.\nАртём — за полчаса становится своим в любой компании. С ним ей никогда не было страшно.",
   "reviews": "",
   "litnet": "",
   "litres": "",
   "litmarket": "",
   "litgorod": "",
   "links": "",
   "cta": "",
   "collageOn": true,
   "collage": []
  }
 ],
 "blocks": [
  {
   "id": "k1",
   "type": "hero",
   "label": "Остросюжетные любовные романы",
   "title": "Любовь *с риском* для жизни",
   "text": "Криминал, тайны и мужчины, от которых лучше держаться подальше. Героини, которые однажды понимают, что не знают человека рядом.",
   "btn": "Читать новинку",
   "book": "b1",
   "books": []
  },
  {
   "id": "k2",
   "type": "marquee",
   "items": "Лана Фрейтаг\n*остросюжетные любовные романы*",
   "hidden": true
  },
  {
   "id": "k3",
   "type": "book",
   "label": "Новинка · пишется сейчас",
   "book": "b1",
   "menu": ""
  },
  {
   "id": "k8",
   "type": "series",
   "series": "С кем я, черт возьми, связалась",
   "label": "Цикл",
   "title": "",
   "text": "Каждую книгу можно читать отдельно. Общее у них одно: однажды героиня понимает, что не знает человека, которому доверяла больше всех.",
   "menu": "Книги"
  },
  {
   "id": "k9",
   "type": "books",
   "title": "Все книги",
   "sub": "",
   "menu": "Все книги"
  },
  {
   "id": "k4",
   "type": "start",
   "title": "С чего начать",
   "sub": "если вы здесь впервые",
   "books": [
    "b2",
    "b3"
   ],
   "menu": "",
   "hidden": true
  },
  {
   "id": "k5",
   "type": "quote",
   "label": "Из книги",
   "text": "Он мог вернуться. Собственный муж мог вернуться, чтобы меня добить.",
   "cite": "«Альпийский развод», пролог"
  },
  {
   "id": "k6",
   "type": "about",
   "label": "Об авторе",
   "title": "Пишу о любви *с риском для жизни*",
   "text": "Меня зовут Лана Фрейтаг. Я пишу остросюжетные любовные романы: горы Сванетии, тайга Алтая, ритуальный бизнес под Петербургом. Мои героини узнают, что самый опасный человек может годами быть рядом, — и всё равно не перестают верить в любовь.\n\nКниги выходят по главам на Литнете — можно читать вместе со мной, пока история пишется.",
   "photo": "",
   "facts": "",
   "menu": "Об авторе"
  },
  {
   "id": "k7",
   "type": "tg",
   "label": "Telegram-канал",
   "title": "Читать *раньше всех*",
   "text": "Новые главы в день выхода, обложки до премьеры и разговоры о героях — тех, с кем лучше не связываться.",
   "btn": "Подписаться",
   "url": "",
   "menu": "Telegram"
  }
 ]
};

// Приводит сохранённое содержимое к нужному виду (старые и неполные данные не ломают сайт)
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
// Обновление примера: всё, что осталось как в прежнем примере, меняется на новый; правки владелицы не трогаем
function step(c, old, d, v) {
  const out = { ...c, v };
  for (const k of ['palette', 'foot', 'headBtn']) if (same(c[k], old[k])) out[k] = d[k];
  const fix = (list, oldList, newList) => (list || []).flatMap((x) => {
    const o = oldList.find((y) => y.id === x.id);
    if (!o) return [x];
    const n = newList.find((y) => y.id === x.id);
    if (!n) return Object.keys(o).every((k) => same(x[k], o[k])) ? [] : [x]; // пример без замены — убрать, если не меняли
    const r = { ...x };
    const asked = v === 3 ? ASKED_TO_REPLACE[x.id] || {} : {};
    for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
      if (k !== 'id' && (same(x[k], o[k]) || (asked[k] || []).some((t) => same(x[k], t)))) r[k] = structuredClone(n[k]);
    }
    return [r];
  });
  out.books = fix(c.books, old.books, d.books);
  for (const b of d.books) if (!out.books.some((x) => x.id === b.id)) out.books.push(structuredClone(b));
  out.blocks = fix(c.blocks, old.blocks, d.blocks);
  // новые виды блоков из примера — если их ещё нет, встают на своё место
  for (const type of ['series', 'books']) {
    if (out.blocks.some((b) => b.type === type) || !d.blocks.some((b) => b.type === type)) continue;
    const after = { series: ['book', 'marquee', 'hero'], books: ['series', 'book', 'hero'] }[type];
    let at = -1;
    for (const t of after) { at = out.blocks.findIndex((b) => b.type === t); if (at >= 0) break; }
    out.blocks.splice(at + 1, 0, structuredClone(d.blocks.find((b) => b.type === type)));
  }
  return out;
}
function upgrade(c) {
  if ((c.v || 1) < 2) c = step(c, V1_EXAMPLE, V2_EXAMPLE, 2);
  if (c.v < 3) c = step(c, V2_EXAMPLE, V3_EXAMPLE, 3);
  if (c.v < 4) c = step(c, V3_EXAMPLE, DEFAULT_CONTENT, 4);
  return c;
}

export function normalize(c) {
  const d = DEFAULT_CONTENT;
  if (!c || typeof c !== 'object') return structuredClone(d);
  c = upgrade(c);
  const out = { ...structuredClone(d), ...c };
  out.books = Array.isArray(c.books) ? c.books.filter((b) => b && b.id).map((b) => ({ ...newBook(), ...b })) : structuredClone(d.books);
  out.blocks = Array.isArray(c.blocks) ? c.blocks.filter((b) => b && b.id && BLOCKS[b.type]).map((b) => ({ ...newBlock(b.type), ...b })) : structuredClone(d.blocks);
  // у каждой книги — свой адрес страницы, без повторов
  const taken = new Set();
  for (const b of out.books) {
    let s = slugify(b.slug) || slugify(plain(b.title)) || b.id;
    if (taken.has(s)) s += '-' + b.id.slice(-4);
    taken.add(s);
    b.url = s;
  }
  return out;
}

export function colors(c) {
  const p = PALETTES.find((x) => x.id === c.palette) || PALETTES[0];
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : '');
  return c.palette === 'custom' ? { a1: hex(c.a1) || p.a1, a2: hex(c.a2) || p.a2 } : { a1: p.a1, a2: p.a2 };
}

// Адрес страницы книги латиницей: «Альпийский развод» → alpiyskiy-razvod
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slugify = (s) => String(s ?? '').toLowerCase().replace(/[а-яё]/g, (ch) => TR[ch] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Циклы — в порядке, как книги стоят в списке; книги цикла — по номеру
export const seriesList = (c) => [...new Set(c.books.filter((b) => !b.hidden && String(b.series || '').trim()).map((b) => b.series.trim()))];
export const seriesBooks = (c, name) => c.books
  .filter((b) => !b.hidden && String(b.series || '').trim() === String(name || '').trim())
  .map((b, i) => ({ b, i, n: Number(b.seriesNo) || 0 }))
  .sort((x, y) => (x.n || 999) - (y.n || 999) || x.i - y.i)
  .map((x) => x.b);
export const bookHref = (b) => `./?kniga=${encodeURIComponent(b.url || b.id)}`;
export const findBook = (c, key) => c.books.find((b) => !b.hidden && (b.url === key || b.id === key));

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
const chunks = (s) => String(s ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const ext = (u) => (/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : '');
const pair = (l) => { const m = l.match(/^(.+?)\s+[—–-]\s+(.+)$/); return m ? [m[1].trim(), m[2].trim()] : [l.trim(), '']; };

// Обложка: загруженная картинка или строгая типографская обложка из названия (как у издательской серии)
function cover(b, imgs, name) {
  if (b.cover && imgs[b.cover]) return `<div class="cover cover-img"><img src="${esc(imgs[b.cover])}" alt="${esc(plain(b.title))}" loading="lazy"></div>`;
  const [t1, t2] = String(b.title || 'Без названия').split(/\*([^*]+)\*/);
  const v = (String(b.id).split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % 4) + 1;
  return `<div class="cover c${v}" role="img" aria-label="${esc(plain(b.title))}">`
    + `<span class="cv-a">${esc(name)}</span>`
    + `<span class="cv-t">${esc(t1.trim())}${t2 ? `<i>${esc(t2)}</i>` : ''}</span>`
    + '<span class="cv-s">роман</span></div>';
}

// Где читать: четыре площадки + любые другие сайты; первая — главная кнопка
const ON = { Литнет: 'Литнете', Литрес: 'Литресе', Литмаркет: 'Литмаркете', Литгород: 'Литгороде' };
export function bookLinks(b) {
  const list = PLATFORMS.map(([k, n]) => [n, safeUrl(b[k])]);
  for (const l of lines(b.links)) { const [n, u] = pair(l); list.push([n, safeUrl(u)]); }
  return list.filter(([n, u]) => n && u);
}
const ctaText = (b, links) => (b.cta ? b.cta : links[0] ? (ON[links[0][0]] ? `Читать на ${ON[links[0][0]]}` : `Читать: ${links[0][0]}`) : '');

// Читателю — только статус и возраст (главы и авторские листы ему ни к чему)
const statusLine = (b) => [STATUS[b.status], b.age ? esc(b.age) : ''].filter(Boolean);

// Шапка и подвал — общие для главной и страниц книг
const PLANE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 3.5 2.8 10.7c-.8.3-.8 1.4 0 1.7l4.6 1.6 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.5 4.7 3.5c.6.4 1.4.1 1.6-.6l3.1-15.6c.2-.8-.6-1.4-1.3-1.1Z"/><path d="m7.4 14 10.9-7.6-8.3 9.2"/></svg>';

function chrome(c, blocks) {
  const name = c.name || 'Автор';
  const headU = safeUrl(c.headUrl);
  // пункт меню блока «Подписка» — сразу ссылка на канал: значок-самолётик (в меню телефона — со словом Telegram)
  const tgB = blocks.find((b) => b.type === 'tg' && b.menu);
  const tgU = (tgB && safeUrl(tgB.url)) || headU;
  const showTg = !!(tgB || tgU);
  const menu = blocks.filter((b) => b.menu && b !== tgB).map((b) => [b.menu, './#' + b.id]);
  const tgLink = (word) => (showTg ? `<a class="tg-ico" href="${esc(tgU || './#' + tgB.id)}"${tgU ? ext(tgU) : ''} aria-label="Telegram" title="Telegram">${PLANE}${word ? '<span>Telegram</span>' : ''}</a>` : '');
  const nav = menu.map(([n, u]) => `<a href="${u}">${esc(n)}</a>`).join('');
  const headBtn = ''; // кнопку в рамке владелица не хочет: ссылка на канал — всегда самолётиком в меню
  const footLinks = lines(c.foot).map(pair).map(([n, u]) => [n, safeUrl(u)]).filter(([n, u]) => n && u);
  return {
    head: `<div class="wrap head-in"><nav class="nav" aria-label="Разделы">${nav}${tgLink(false)}</nav>
      <a class="logo" href="./">${esc(name)}</a>
      <div class="top-r">${menu.length || showTg ? '<button class="menu-btn" type="button" aria-expanded="false" aria-controls="mnav"><span></span><span></span><em>Меню</em></button>' : ''}</div></div>
      <nav class="mnav" id="mnav" aria-label="Меню" hidden><div class="wrap">${nav}${tgLink(true)}${headBtn}</div></nav>`,
    foot: `${subscribeBox(c)}<div class="wrap foot-row">
      <span>© ${new Date().getFullYear()} ${esc(name)}</span>
      <nav aria-label="Ссылки">${footLinks.map(([n, u]) => `<a href="${esc(u)}"${ext(u)}>${esc(n)}</a>`).join('')}${c.privacy ? '<a href="./?privacy">Политика конфиденциальности</a>' : ''}</nav>
      <a class="lnk" href="#top">Наверх <span class="arrow">↑</span></a></div>`,
  };
}

const lbl = (s) => (s ? `<div class="lbl">${fmt(s, false)}</div>` : '');

// Подписка на письма с подарком — внизу каждой страницы; настраивается в админке → «Общее»
function subscribeBox(c) {
  if (c.subOn === false) return '';
  return `<section class="sub" id="podpiska"><div class="wrap sub-in">
      <div class="sub-txt">
        ${lbl(c.subTitle || 'Подписка')}
        <h2>${c.giftName ? `«${esc(c.giftName)}» <span class="it">в подарок</span>` : 'Новые книги <span class="it">первой</span>'}</h2>
        ${c.subText ? `<p>${fmt(c.subText)}</p>` : ''}
      </div>
      <form class="sub-f" data-sub novalidate>
        <div class="sub-row"><input type="email" name="email" id="sub-email" required autocomplete="email" placeholder="Ваша почта" aria-label="Ваша почта"><button class="btn btn-dark" type="submit">${esc(c.subBtn || 'Подписаться')}</button></div>
        <label class="consent"><input type="checkbox" name="ok" id="sub-ok" required> <span>${esc(c.consent || 'Соглашаюсь получать письма')}${c.privacy ? ' — <a href="./?privacy">политика конфиденциальности</a>' : ''}</span></label>
        <p class="sub-msg" role="status" hidden></p>
      </form>
    </div></section>`;
}

const h1lines = (s) => {
  const t = String(s || '').split('\n').filter((l) => l.trim());
  return t.length > 1 ? t.map((l) => `<span class="ln">${fmt(l.trim(), false)}</span>`).join('') : fmt(t[0] || '', false);
};

// Карточка книги на главной: ведёт на страницу книги
function card(b, imgs, name, opt = {}) {
  const num = opt.num ? `<span class="num"><b>${String(opt.num).padStart(2, '0')}</b>Книга ${opt.num}${b.status === 'writing' ? ' · пишется' : ''}</span>` : '';
  return `<a class="card${opt.small ? ' sm' : ''}" href="${bookHref(b)}"${opt.group != null ? ` data-g="${esc(opt.group)}"` : ''}>
      ${num}
      <div class="plinth">${cover(b, imgs, name)}</div>
      <div class="card-txt">
        ${b.mood && !opt.small ? `<span class="mood">${esc(b.mood)}</span>` : ''}
        <h3>${fmt(b.title, false)}</h3>
        ${opt.small ? `<span class="lbl">${esc(b.series ? `${b.series}${b.seriesNo ? ` · ${b.seriesNo}` : ''}` : STATUS[b.status] || '')}</span>` : ''}
        ${(b.short || b.tagline) && !opt.small ? `<p>${fmt(b.short || b.tagline)}</p>` : ''}
        ${opt.small ? '' : '<span class="lnk">О книге <span class="arrow">→</span></span>'}
      </div>
    </a>`;
}

export function renderSite(raw, imgs = {}) {
  const c = normalize(raw);
  const visible = c.books.filter((b) => !b.hidden);
  const books = new Map(visible.map((b) => [b.id, b]));
  const blocks = c.blocks.filter((b) => !b.hidden);
  const shelf = blocks.find((b) => b.type === 'books' || b.type === 'series' || b.type === 'start');
  const name = c.name || 'Автор';
  const cv = (b) => cover(b, imgs, name);

  const R = {
    hero: (k) => {
      const main = books.get(k.book) || visible.find((b) => b.status === 'writing') || visible[0];
      const ph = k.photo && imgs[k.photo];
      // справа — медведь с обложки «Звериной тропы» (лес, туман) или своё фото
      const art = ph ? `<figure class="hero-mist" aria-hidden="true"><img src="${esc(ph)}" alt=""></figure>`
        : k.art !== false ? '<figure class="hero-mist" aria-hidden="true"><img src="hero-bear.jpg" alt=""><img class="sm" src="hero-bear-round.jpg?2" alt=""></figure>' : '';
      return `<section class="hero${art ? ' has-art' : ''}" id="${k.id}"><div class="wrap hero-in">
        <div class="hero-txt">
          ${lbl(k.label)}
          <h1>${h1lines(k.title)}</h1>
          ${k.text ? `<p class="lead">${fmt(k.text)}</p>` : ''}
          <div class="acts">
            ${k.btn && main ? `<a class="btn btn-dark" href="${bookHref(main)}">${esc(k.btn)}</a>` : ''}
            ${shelf ? `<a class="lnk" href="#${shelf.id}">Все книги <span class="arrow">→</span></a>` : ''}
          </div>
        </div>
        ${art}
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
      return `<section class="sec" id="${k.id}"><div class="wrap feat">
        <a class="feat-cover" href="${bookHref(b)}" aria-label="${esc(plain(b.title))}">${cv(b)}</a>
        <div class="feat-txt">
          ${lbl(k.label)}
          <h2 class="feat-t">${fmt(b.title, false)}</h2>
          ${b.tagline || b.short ? `<p class="ann">${fmt(b.tagline || b.short)}</p>` : ''}
          <div class="meta-line">${statusLine(b).join('<i>·</i>')}</div>
          <div class="acts">
            ${links[0] ? `<a class="btn btn-dark" href="${esc(links[0][1])}"${ext(links[0][1])}>${esc(ctaText(b, links))}</a>` : ''}
            <a class="lnk" href="${bookHref(b)}">О книге <span class="arrow">→</span></a>
          </div>
        </div></div></section>`;
    },
    series: (k) => {
      const name2 = k.series || '';
      const list = name2 ? seriesBooks(c, name2) : (k.books || []).map((id) => books.get(id)).filter(Boolean);
      if (!list.length) return '';
      return `<section class="sec series" id="${k.id}"><div class="wrap">
        <div class="series-h">
          <div>${lbl(k.label)}<h2>${k.title ? fmt(k.title) : esc(name2)}</h2></div>
          ${k.text ? `<p>${fmt(k.text)}</p>` : ''}
        </div>
        <div class="start n${Math.min(list.length, 4)}">${list.map((b, i) => card(b, imgs, name, { num: Number(b.seriesNo) || i + 1 })).join('')}</div></div></section>`;
    },
    start: (k) => {
      const list = (k.books || []).map((id) => books.get(id)).filter(Boolean);
      if (!list.length) return '';
      return `<section class="sec" id="${k.id}"><div class="wrap">
        <div class="sec-h"><h2>${fmt(k.title, false)}</h2>${k.sub ? `<span class="it">${esc(k.sub)}</span>` : ''}</div>
        <div class="start n${Math.min(list.length, 4)}">${list.map((b) => card(b, imgs, name)).join('')}</div></div></section>`;
    },
    books: (k) => {
      const inSeries = new Set(blocks.filter((x) => x.type === 'series' && x.series).map((x) => x.series.trim()));
      if (!visible.length || visible.every((b) => inSeries.has(String(b.series || '').trim()))) return '';
      const sers = seriesList(c);
      const solo = visible.some((b) => !String(b.series || '').trim());
      const groups = [...sers, ...(solo ? ['Отдельные книги'] : [])];
      const ordered = [...sers.flatMap((s) => seriesBooks(c, s)), ...visible.filter((b) => !String(b.series || '').trim())];
      return `<section class="sec" id="${k.id}"><div class="wrap">
        <div class="sec-h"><h2>${fmt(k.title || 'Книги', false)}</h2>${k.sub ? `<span class="it">${esc(k.sub)}</span>` : ''}</div>
        ${groups.length > 1 ? `<div class="chips" role="group" aria-label="Циклы"><button type="button" class="chip" aria-pressed="true" data-g="">Все</button>${groups.map((g) => `<button type="button" class="chip" aria-pressed="false" data-g="${esc(g)}">${esc(g)}</button>`).join('')}</div>` : ''}
        <div class="grid">${ordered.map((b) => card(b, imgs, name, { small: true, group: String(b.series || '').trim() || 'Отдельные книги' })).join('')}</div></div></section>`;
    },
    quote: (k) => k.text ? `<section class="quote" id="${k.id}"><div class="wrap q-in">
        <span class="q-mark" aria-hidden="true">“</span>
        <blockquote>${fmt(k.text.trim().replace(/^[«"“„]\s*/, '').replace(/\s*[»"”](\.?)$/, '$1'))}</blockquote>
        <div class="q-foot">${k.label ? `<span class="lbl">${esc(k.label)}</span>` : ''}${k.cite ? `<cite>${esc(k.cite)}</cite>` : ''}</div>
      </div></section>` : '',
    about: (k) => {
      const facts = lines(k.facts).map(pair).filter((p) => p[0]);
      const ph = k.photo && imgs[k.photo];
      return `<section class="sec about-s" id="${k.id}"><div class="wrap about">
        <div class="ava">${ph ? `<img src="${esc(ph)}" alt="${esc(name)}" loading="lazy">` : `<span>${esc(initials(name))}</span>`}</div>
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

  const parts = blocks.map((k) => [k, R[k.type](k)]).filter(([, html]) => html);
  return { title: name, ...chrome(c, parts.map(([k]) => k)), main: parts.map(([, html]) => html).join('\n'), colors: colors(c), shown: parts.map(([k]) => k.id) };
}

// Страница книги — как карточка книги у издательства: обложка и всё для решения «читать» на первом экране
// (цикл, название, автор, крючок, характеристики, кнопки магазинов, тропы), ниже — аннотация, отрывок, цитаты,
// отзывы, коллаж, книги цикла и короткий последний призыв. Пустые разделы не показываются
export function renderBook(raw, imgs = {}, key = '') {
  const c = normalize(raw);
  const b = findBook(c, key);
  if (!b) return null;
  const name = c.name || 'Автор';
  const shown = new Set(renderSite(c, imgs).shown);
  const blocks = c.blocks.filter((x) => shown.has(x.id));
  const links = bookLinks(b);
  const cta = ctaText(b, links);
  const shelfBlock = blocks.find((x) => x.type === 'books') || blocks.find((x) => x.type === 'series' && x.series === b.series) || blocks.find((x) => x.type === 'series');
  const back = shelfBlock ? `./#${shelfBlock.id}` : './';
  const ser = String(b.series || '').trim();
  const mates = ser ? seriesBooks(c, ser) : [];
  const no = ser ? (Number(b.seriesNo) || mates.indexOf(b) + 1) : 0;
  const next = ser ? mates[mates.indexOf(b) + 1] : null;
  const others = ser ? mates : c.books.filter((x) => !x.hidden && x !== b).slice(0, 4);
  const tags = String(b.tags || '').split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const shops = (dark) => `<div class="buy">
      ${links[0] ? `<a class="btn ${dark ? 'btn-dark' : 'btn-light'}" href="${esc(links[0][1])}"${ext(links[0][1])}>${esc(cta)}</a>` : ''}
      ${links.slice(1).map(([n, u]) => `<a class="btn btn-line" href="${esc(u)}"${ext(u)}>${esc(n)}</a>`).join('')}
    </div>`;
  const quotes = chunks(b.quotes).map((q) => {
    const ls = q.split('\n'); const cite = ls.length > 1 && /^[—–-]\s*/.test(ls[ls.length - 1]) ? ls.pop().replace(/^[—–-]\s*/, '') : '';
    return { t: ls.join(' ').replace(/^[«"“„]\s*/, '').replace(/\s*[»"”](\.?)$/, '$1'), cite };
  });
  const reviews = chunks(b.reviews).map((r) => {
    const ls = r.split('\n'); const who = ls.length > 1 && /^[—–-]\s*/.test(ls[ls.length - 1]) ? ls.pop().replace(/^[—–-]\s*/, '') : '';
    return { t: ls.join(' '), who };
  });
  const photos = (b.collage || []).map((id) => imgs[id]).filter(Boolean).slice(0, 6);
  const excerpt = lines(b.excerpt);
  const sec = (label, body, cls = '') => `<section class="bk-sec${cls ? ' ' + cls : ''}"><div class="wrap bk-two"><h2 class="bk-h">${label}</h2><div>${body}</div></div></section>`;

  const S = [];
  S.push(`<section class="bk-top"><div class="wrap">
      <nav class="crumbs" aria-label="Где вы"><a href="./">Главная</a><span>/</span><a href="${back}">Книги</a>${ser ? `<span>/</span><span>${esc(ser)}</span>` : ''}</nav>
      <div class="bk-in">
        <div class="bk-cover">${cover(b, imgs, name)}</div>
        <div class="bk-txt">
          ${ser ? `<div class="lbl">Цикл «${esc(ser)}»${no ? ` · книга ${no}` : ''}</div>` : ''}
          <h1 class="bk-t">${fmt(b.title, false)}</h1>
          <div class="bk-author">${esc(name)}<i>·</i>${statusLine(b).join('<i>·</i>')}</div>
          ${b.tagline ? `<p class="bk-hook">${fmt(b.tagline)}</p>` : ''}
          ${shops(true)}
          ${tags.length ? `<ul class="tags">${tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
          ${b.ann ? `<div class="bk-ann"><h2 class="bk-h">Аннотация</h2>${paras(b.ann)}</div>` : ''}
        </div>
      </div></div></section>`);
  if (excerpt.length) S.push(sec('Отрывок', `<div class="excerpt">${excerpt.map((p) => `<p>${fmt(p, false)}</p>`).join('')}</div>
      ${links[0] ? `<a class="btn btn-dark" href="${esc(links[0][1])}"${ext(links[0][1])}>Читать дальше</a>` : ''}`));
  if (quotes.length) S.push(sec('Цитаты', `<div class="qs">${quotes.map((q) => `<figure class="qc"><blockquote>${fmt(q.t)}</blockquote>${q.cite ? `<figcaption>${esc(q.cite)}</figcaption>` : ''}</figure>`).join('')}</div>`));
  if (reviews.length) S.push(sec('Отзывы', `<div class="qs">${reviews.map((r) => `<figure class="qc rv"><blockquote>${fmt(r.t)}</blockquote>${r.who ? `<figcaption>${esc(r.who)}</figcaption>` : ''}</figure>`).join('')}</div>`));
  if (b.collageOn !== false && photos.length) S.push(`<section class="bk-sec collage n${photos.length}" aria-label="Атмосфера книги"><div class="wrap col-in">
      ${photos.map((src) => `<figure><img src="${esc(src)}" alt="" loading="lazy"></figure>`).join('')}</div></section>`);
  if (others.length > (ser ? 1 : 0)) S.push(`<section class="bk-sec"><div class="wrap">
      <div class="sec-h"><h2 class="bk-h">${ser ? `Цикл «${esc(ser)}»` : 'Другие книги'}</h2>
        ${next ? `<a class="lnk" href="${bookHref(next)}">Следующая книга <span class="arrow">→</span></a>` : ''}</div>
      <div class="mini">${others.map((x, i) => `<a class="mini-b${x === b ? ' here' : ''}" href="${bookHref(x)}">
        <div class="mini-c">${cover(x, imgs, name)}</div>
        <span class="mini-n">${ser ? `Книга ${Number(x.seriesNo) || i + 1}` : esc(STATUS[x.status] || '')}${x === b ? ' · вы здесь' : ''}</span>
        <span class="mini-t">${fmt(x.title, false)}</span></a>`).join('')}</div>
    </div></section>`);
  if (links[0]) S.push(`<section class="bk-final"><div class="wrap bk-final-in">
      <div><div class="lbl">${b.status === 'writing' ? 'Книга пишется — читайте вместе с автором' : 'Книга завершена'}</div>
      <h2>${fmt(b.title, false)}</h2></div>
      ${shops(true)}
    </div></section>`);
  const sticky = links[0] ? `<div class="bk-sticky"><span>${fmt(b.title, false)}</span><a class="btn btn-dark" href="${esc(links[0][1])}"${ext(links[0][1])}>${esc(cta)}</a></div>` : '';

  return {
    title: `${plain(b.title)} — ${name}`,
    description: plain(b.tagline || b.short || ''),
    ...chrome(c, blocks),
    main: `<article class="bk">${S.join('\n')}</article>${sticky}`,
    colors: colors(c),
  };
}

export function renderPrivacy(raw, imgs = {}) {
  const c = normalize(raw);
  if (!c.privacy) return null;
  const shown = new Set(renderSite(c, imgs).shown);
  return {
    title: `Политика конфиденциальности — ${c.name || 'Автор'}`,
    ...chrome(c, c.blocks.filter((x) => shown.has(x.id))),
    main: `<section class="bk-sec text-b"><div class="wrap"><h1 class="bk-h">Политика конфиденциальности</h1><div class="prose">${paras(c.privacy)}</div></div></section>`,
    colors: colors(c),
  };
}

const initials = (n) => String(n).split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
