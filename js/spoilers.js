// «Не раскрывать в рекламе»: сюжетные повороты книги (Мастерская → Маркетинг → книга → «Для таргетолога»).
// Проверка текста объявления/описания: поворот «муж жив» находится и в «похоронила мужа. Живого» — по началам слов.
const norm = (s) => String(s || '').toLocaleLowerCase('ru').replace(/ё/g, 'е');
const stems = (s) => norm(s).split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 3).map((w) => w.slice(0, Math.min(w.length, w.length > 5 ? 5 : 4)));
export const spoilerList = (b) => String(b?.direct?.spoilers || '').split('\n').map((x) => x.trim()).filter(Boolean);
export function spoilerHits(text, list = []) {
  const words = norm(text).split(/[^a-zа-я0-9]+/).filter(Boolean);
  return list.filter((line) => { const st = stems(line); return st.length && st.every((s) => words.some((w) => w.startsWith(s))); });
}
