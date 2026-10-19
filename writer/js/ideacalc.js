// Идеи и заметки: автоматическая систематизация (чистые функции — их проверяют тесты).
// Статусов два: «Открыта» (status new/work или пусто) и «Готово» (used/archive). Удалённые — в корзине 30 дней.

export const KINDS = { fix: 'Правка', scene: 'Сцена', char: 'Персонаж', name: 'Название', idea: 'Идея' };
export const isDone = (x) => x.status === 'used' || x.status === 'archive';
export const isOpen = (x) => !x.deletedAt && !isDone(x);

const low = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

// вид записи — по словам в тексте (можно поменять вручную, тогда x.kind)
export function ideaKind(x) {
  if (x.kind && KINDS[x.kind]) return x.kind;
  const t = low(`${x.title || ''} ${x.text || ''}`);
  if (/провер|исправ|переписа|поправ|замени|сократ|убра|добав|дописа|правдоподоб|не забыть|ошибк|опечат/.test(t)) return 'fix';
  if (/назван|заголов|назвать/.test(t)) return 'name';
  if (/персонаж|характер|внешност|биограф/.test(t)) return 'char';
  if (/сцен|эпизод|глав|пролог|эпилог|диалог/.test(t)) return 'scene';
  return 'idea';
}

// книга по тексту: «в звериной тропе» → «Звериная тропа для двоих» (по началам значимых слов названия)
const STOP = new Set(['для', 'двоих', 'меня', 'него', 'она', 'они', 'это', 'как', 'или', 'без']);
export function bookGuess(text, books = []) {
  const t = low(text);
  let best = null, bestN = 0;
  for (const b of books) {
    const words = low(String(b.title || '').split(/[.!?:]/)[0]).split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));
    if (!words.length) continue;
    const stems = words.map((w) => w.slice(0, Math.max(4, w.length - 2)));
    const hit = stems.filter((s) => t.includes(s)).length;
    // все значимые слова названия (или хотя бы два из длинного названия) встречаются в тексте
    if ((hit === stems.length || hit >= 2) && hit > bestN) { best = b; bestN = hit; }
  }
  return best;
}

// глава по тексту: «в 5 главе», «глава 12», «пролог» → { label, title }
export function chapterRef(text) {
  const t = low(text);
  let m = /глав[аеуы]?\s*(\d{1,3})/.exec(t) || /(\d{1,3})\s*(?:-?(?:й|ой|ей|я))?\s*глав/.exec(t);
  if (m) return { label: `Гл. ${m[1]}`, title: `Глава ${m[1]}`, n: Number(m[1]) };
  if (/пролог/.test(t)) return { label: 'Пролог', title: 'Пролог' };
  if (/эпилог/.test(t)) return { label: 'Эпилог', title: 'Эпилог' };
  return null;
}

// заголовок записи: свой или первая строка текста
export const ideaTitle = (x) => (x.title || String(x.text || '').split('\n')[0] || 'Без названия').trim().slice(0, 300);

// корзина: удалённые больше 30 дней назад — навсегда
export const TRASH_DAYS = 30;
export const expired = (x, now = Date.now()) => !!x.deletedAt && now - Date.parse(x.deletedAt) > TRASH_DAYS * 864e5;
