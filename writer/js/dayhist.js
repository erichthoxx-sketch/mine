// История прошедшего дня в Планере и перенос несделанного (чистые функции — без сети и базы).
// Несделанное дело с прошлой даты само переезжает на сегодня; в прошедшем дне остаётся строка «перенесено на …»,
// сделанное — с галочкой. Повторяющиеся дела Todoist не трогаем: у них свой график.
const low = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');

// свои дела из Todoist с прошлой датой → перенести на сегодня
export const overdueToMove = (own, today) => (own || []).filter((x) => x.d && x.d < today && !x.r);
// дела по связям (контакты) с прошлой датой и не сделанные
export const linkTodosToMove = (links, today) => (links || []).flatMap((l) => (l.todos || []).filter((t) => !t.done && t.date && t.date < today).map((t) => ({ linkId: l.id, k: t.k, t: t.text, from: t.date })));
// журнал переносов не растёт бесконечно: держим 60 дней
export const trimMoved = (list, today, days = 60) => {
  const edge = new Date(Date.parse(today + 'T00:00:00Z') - days * 864e5).toISOString().slice(0, 10);
  return (list || []).filter((m) => (m.to || m.from || '') >= edge);
};
// что было в прошедший день: сделанное (из Todoist и по связям) и перенесённое дальше; одно дело — одной строкой
export function dayHistory({ done = [], moved = [], linksDone = [] }, day) {
  const seen = new Set(), out = [];
  for (const x of [...done, ...linksDone]) { const k = low(x.t); if (!k || seen.has(k)) continue; seen.add(k); out.push({ kind: 'done', t: x.t }); }
  for (const m of moved) if (m.from === day && !seen.has(low(m.t))) { seen.add(low(m.t)); out.push({ kind: 'moved', t: m.t, to: m.to }); }
  return out;
}
// откуда перенесено дело, которое сейчас стоит на date (для пометки «перенесено с 29.10»)
export const movedFrom = (moved, id, date) => { const m = [...(moved || [])].reverse().find((x) => x.id === id && x.to === date); return m ? m.from : ''; };
