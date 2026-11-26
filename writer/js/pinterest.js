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
