// Связь Мастерской с приложением доходов: старт книги, выложенные главы и завершение книги
// становятся событиями дня в «Доходах» (коллекция days — общая). У каждого такого события есть ключ src,
// по нему событие переносится на другую дату или убирается, без дублей.
const app = () => window.__app;

// книга доходов для рукописи (по выбору или по названию) — чтобы событие было «по книге»
function bookFields(c, b) {
  const id = c.incomeIdOf(b);
  return id ? { bookId: id } : {};
}

// Поставить событие с ключом src на дату date (если уже стоит на другой дате — переносим)
export async function setEvent(src, date, ev) {
  const st = app().store, days = st.data.days;
  const writes = [];
  for (const d of days) {
    if (!(d.events || []).some((e) => e.src === src)) continue;
    if (d.date === date) continue;
    writes.push({ ...d, events: d.events.filter((e) => e.src !== src) });
  }
  const doc = days.find((d) => d.id === date) || { id: date, date, events: [], note: '' };
  const events = (doc.events || []).filter((e) => e.src !== src);
  events.push({ ...ev, src });
  writes.push({ ...doc, id: date, date, events });
  for (const w of writes) await st.put('days', w);
}
export async function removeEvent(src) {
  const st = app().store;
  for (const d of st.data.days) if ((d.events || []).some((e) => e.src === src)) await st.put('days', { ...d, events: d.events.filter((e) => e.src !== src) });
}

export const startEvent = (c, b, date) => setEvent(`w:${b.id}:start`, date, { type: 'start', text: `Начала выкладку «${b.title}»`, ...bookFields(c, b) });
export const finishEvent = (c, b, date) => setEvent(`w:${b.id}:finish`, date, { type: 'finish', text: `«${b.title}» завершена`, ...bookFields(c, b) });
export const chapterEvent = (c, b, title, date) => setEvent(`w:${b.id}:ch:${title}`, date, { type: 'chapter', text: title, ...bookFields(c, b) });
export const chapterUnset = (b, title) => removeEvent(`w:${b.id}:ch:${title}`);
