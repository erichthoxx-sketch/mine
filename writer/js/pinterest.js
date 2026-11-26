// Pinterest: чистая логика, без сети, доступа к рукописям и записи в основные коллекции.
import { bookGenres, bookTags } from './bookmeta.js';

const clean = (v, max = 500) => String(v ?? '').trim().slice(0, max);
export function catalogOf(books = []) {
  return books.filter(b => b?.id && b.title && b.status !== 'idea').map(b => ({
    id: String(b.id), title: clean(b.title, 180), genres: bookGenres(b), tags: bookTags(b),
    quote: clean(String(b.promo?.quotes || '').split('\n').find(x => x.trim()) || '', 250),
  }));
}
export function boardOf(b) {
  const t = [b.title, ...b.genres, ...b.tags].join(' ').toLowerCase();
  if (/спорт|бокс|хокке|фигурн|клетк|бойц/.test(t)) return 'Спортивные любовные романы';
  if (/дарк|кримин|остросюжет|триллер|вдов|саспенс/.test(t)) return 'Романтический саспенс';
  return 'Атмосферные любовные романы';
}
export function suggestions(b, author = 'Лана Фрейтаг') {
  const board = boardOf(b), tags = [...b.genres, ...b.tags].slice(0, 5);
  const topic = tags.join(', ') || 'атмосфера любовного романа';
  const brief = 'Вертикаль 2:3, 1000 × 1500 px, журнальная фотография на пленку, выразительный свет, без водяных знаков и надписей. ';
  const common = { bookId: b.id, board, keywords: tags.join(', '), link: '', alt: '', imageNote: '', status: 'draft' };
  const item = (kind, reason, title, text, prompt) => ({
    ...common, kind, reason, title: clean(title, 100), description: clean(text, 500), prompt,
  });
  const out = [
    item('Атмосфера', 'Проверить, привлекает ли визуальный мир книги новую аудиторию.',
      b.title + ' — книжная эстетика', 'Книжная эстетика: ' + topic + '. «' + b.title + '» — ' + author + '. Узнайте больше о романе.',
      brief + 'Передать атмосферу книги «' + b.title + '», ориентиры: ' + topic + '. Один узнаваемый мотив. Не добавлять неподтвержденные детали сюжета.'),
    item('Тропы', 'Проверить интерес к жанру и поисковым темам, а не только названию.',
      'Что почитать: ' + (tags[0] || 'любовный роман'), '«' + b.title + '» — ' + author + '. Темы: ' + topic + '. Перейдите к описанию книги.',
      brief + 'Жанровая композиция с пустым пространством для короткой типографики. Темы: ' + topic + '.'),
    item('Книга', 'Проверить переходы на страницу книги от прямого книжного предложения.',
      b.title + ' — ' + author, '«' + b.title + '» — ' + author + '. ' + topic + '. Читать описание и познакомиться с книгой.',
      brief + 'Фон для настоящей обложки книги «' + b.title + '». Оставить место для обложки и названия, обложку не перерисовывать.'),
  ];
  if (b.quote) out.push(item('Цитата', 'Проверить сохранения подлинной цитаты; сверить ее с опубликованным текстом.',
    'Цитата из книги «' + b.title + '»', '«' + b.title + '» — ' + author + '. Книжная цитата.',
    brief + 'Создать фон для цитаты, текст накладывается отдельно. Авторская цитата для проверки: ' + b.quote));
  return out;
}
export function trackedLink(value, id) {
  try {
    const u = new URL(String(value).trim());
    if (u.protocol !== 'https:' || u.username || u.password || !id) return '';
    u.searchParams.set('utm_source', 'pinterest');
    u.searchParams.set('utm_medium', 'organic');
    u.searchParams.set('utm_campaign', 'books');
    u.searchParams.set('utm_content', String(id));
    return u.toString();
  } catch { return ''; }
}
export function issues(pin) {
  const out = [];
  if (!String(pin.title || '').trim() || String(pin.title).length > 100) out.push('Заголовок: 1–100 символов');
  if (!String(pin.description || '').trim() || String(pin.description).length > 500) out.push('Описание: 1–500 символов');
  if (!String(pin.board || '').trim()) out.push('Выбрать доску');
  if (!String(pin.alt || '').trim()) out.push('Описать фактическое изображение в alt-тексте');
  if (!trackedLink(pin.link, pin.id || 'check')) out.push('Указать HTTPS-ссылку на конкретную книгу');
  if (!String(pin.imageNote || '').trim()) out.push('Подготовить визуал и указать имя файла');
  if (!pin.reviewed) out.push('Проверить визуал, отсутствие спойлеров, права и необходимость маркировки ИИ');
  return out;
}
export function nextIdeas(books, pins, author) {
  const used = new Set(pins.map(p => p.bookId + '|' + p.kind));
  return books.flatMap(b => suggestions(b, author))
    .filter(x => !used.has(x.bookId + '|' + x.kind))
    .slice(0, 12);
}

export function agentPrompt(books, pins, author, focus='') {
  const catalog=books.map(b=>({id:b.id,title:b.title,genres:b.genres,tags:b.tags})).slice(0,40);
  const history=pins.slice(-60).map(p=>({bookId:p.bookId,kind:p.kind,title:p.title,status:p.status,metrics:p.metrics||null}));
  return [
    'Ты книжный Pinterest-маркетолог русскоязычных любовных романов. Автор: '+author+'. Цель — переходы на страницы книг, а не просто охват. Бюджет на Pinterest — 0.',
    'Предложи 6 разных пинов на неделю: сильные визуальные концепции, конкретные композиции, естественные поисковые фразы, ясный повод перейти. Учитывай историю и реальные метрики, если переданы. Не выдавай гипотезы за статистику и не выдумывай тренды, цитаты, сюжет, ссылки или внешность. Не раскрывай спойлеры. Не повторяй прежние пины. Визуал: вертикаль 2:3, без надписей, если текст будет наложен отдельно.',
    'Ответ только валидным JSON-массивом из 1–8 объектов с полями bookId (точный id из каталога), kind (формат), reason (обоснование), title (до 100 символов), description (до 500), board, keywords (строка), prompt (подробный промт до 3000). Никаких URL, alt-текста или цитат, если их не предоставили.',
    'Дополнительный фокус: '+clean(focus,600),
    'Каталог: '+JSON.stringify(catalog),
    'История: '+JSON.stringify(history),
  ].join('\n\n');
}
export function parseAgentIdeas(raw, books) {
  const text=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  if(text.length>60000) throw Error('Ответ слишком большой');
  let rows;try{rows=JSON.parse(text);}catch{throw Error('Нужен JSON-массив из ответа ИИ');}
  if(!Array.isArray(rows)||!rows.length||rows.length>8)throw Error('Нужны 1–8 идей');
  const ids=new Set(books.map(b=>b.id));
  const seen=new Set();
  return rows.map((r,i)=>{
    if(!r||!ids.has(r.bookId))throw Error('Идея '+(i+1)+': неизвестная книга');
    const out={bookId:r.bookId,kind:clean(r.kind,80),reason:clean(r.reason,600),title:clean(r.title,100),description:clean(r.description,500),board:clean(r.board,100),keywords:clean(r.keywords,500),prompt:clean(r.prompt,3000),alt:'',link:'',imageNote:'',status:'draft',source:'ai'};
    if(!out.kind||!out.reason||!out.title||!out.description||!out.board||!out.prompt)throw Error('Идея '+(i+1)+': не хватает обязательных полей');
    const k=out.bookId+'|'+out.title.toLowerCase();if(seen.has(k))throw Error('Повтор заголовка');seen.add(k);
    return out;
  });
}
export function imageFormat(w,h) {
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)return 'unknown';
  return Math.abs(w/h-2/3)<=0.025?'recommended':'other';
}
export function snapshotPayload(pins,done,ideas) {
  // Только метаданные, без изображения, токенов и произвольных полей.
  const fields=['id','bookId','kind','reason','title','description','board','keywords','alt','link','imageNote','prompt','status','reviewed','source','imageWidth','imageHeight','scheduledDate','metrics'];
  const project=p=>Object.fromEntries(fields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]]));
  const data={pins:pins.map(project),done:[...done],ideas:ideas.map(project)};
  if(new TextEncoder().encode(JSON.stringify(data)).length>600000)throw Error('Облачный архив слишком большой; экспортируйте старые пины');
  return data;
}
