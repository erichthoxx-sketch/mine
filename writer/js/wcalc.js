// Расчёты писательского приложения: знаки, прогресс, конкурсы, прогнозы. Чистые функции, проверены тестами.
import { addDays, diffDays, r2 } from '../../js/calc.js';

// Знаки с пробелами, как на Литнете: все символы текста, кроме переносов строк/абзацев.
export function countChars(text) {
  return (text || '').replace(/[\r\n\u000b\u000c\u2028\u2029]/g, '').length;
}

// Google Документ (Docs API, includeTabsContent=true) → {total, tabs:[{title, chars}]}. Каждая вкладка — глава.
export function charsFromDocsJson(doc) {
  const textOf = (content) => {
    let t = '';
    for (const el of content || []) {
      if (el.paragraph) for (const pe of el.paragraph.elements || []) t += pe.textRun?.content || '';
      if (el.table) for (const row of el.table.tableRows || []) for (const cell of row.tableCells || []) t += textOf(cell.content);
      if (el.tableOfContents) t += textOf(el.tableOfContents.content);
    }
    return t;
  };
  const tabs = [];
  const walk = (list) => {
    for (const tab of list || []) {
      tabs.push({ title: tab.tabProperties?.title || 'Без названия', chars: countChars(textOf(tab.documentTab?.body?.content)) });
      walk(tab.childTabs);
    }
  };
  if (doc.tabs?.length) walk(doc.tabs);
  else tabs.push({ title: doc.title || 'Документ', chars: countChars(textOf(doc.body?.content)) });
  return { total: tabs.reduce((a, t) => a + t.chars, 0), tabs };
}

// Word (.docx): word/document.xml → число знаков (текст в <w:t>, табуляция = 1 знак)
export function charsFromDocxXml(xml) {
  const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
  let n = 0;
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>/g;
  let m;
  while ((m = re.exec(xml))) n += m[1] !== undefined ? countChars(decode(m[1])) : 1;
  return n;
}

// История знаков книги: {'ГГГГ-ММ-ДД': знаков на конец дня}. Храним последние 400 дней.
export function recordProgress(history, date, chars) {
  const h = { ...(history || {}), [date]: chars };
  const keys = Object.keys(h).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete h[k];
  return h;
}
// Сколько знаков было на конец дня date (последняя запись не позже date)
export function charsAt(history, date) {
  let v = null;
  for (const k of Object.keys(history || {}).sort()) { if (k <= date) v = history[k]; else break; }
  return v;
}
// Прирост за последние `days` дней, считая сегодня: сейчас − на конец дня (today − days)
export function written(history, today, days = 1) {
  const now = charsAt(history, today);
  if (now == null) return 0;
  const before = charsAt(history, addDays(today, -days));
  if (before == null) {
    const first = Object.keys(history || {}).sort()[0];
    // нет записи до периода: первая запись — точка отсчёта, а не «написано с нуля»
    return first > addDays(today, -days) ? now - history[first] : 0;
  }
  return now - before;
}
// Темп: знаков в день за последние `window` дней (не меньше 0)
export function pace(history, today, window = 14) {
  const keys = Object.keys(history || {}).sort();
  if (keys.length < 2) return 0;
  const from = addDays(today, -window);
  const startKey = [...keys].reverse().find((k) => k <= from) || keys[0];
  const days = Math.max(1, diffDays(startKey, today));
  return Math.max(0, (charsAt(history, today) - history[startKey]) / days);
}
// Когда будет набран объём target при текущем темпе (или null)
export function forecastDate(history, today, target, window = 14) {
  const now = charsAt(history, today) ?? 0;
  if (now >= target) return today;
  const p = pace(history, today, window);
  if (p <= 0) return null;
  return addDays(today, Math.ceil((target - now) / p));
}

export const daysLeft = (today, end) => (end ? diffDays(today, end) : null);

// Конкурс: дни до конца, прогресс книги к минимальному объёму, сколько писать в день
export function contestStatus(contest, book, today) {
  const left = daysLeft(today, contest.end);
  const res = { daysLeft: left, ended: left != null && left < 0, chars: null, need: null, progress: null, perDay: null, forecast: null, onTrack: null };
  if (!book) return res;
  const hist = book.history || {};
  const chars = charsAt(hist, today) ?? book.chars ?? 0;
  res.chars = chars;
  const min = Number(contest.minChars) || 0;
  if (!min) return res;
  res.need = Math.max(0, min - chars);
  res.progress = Math.min(1, chars / min);
  res.perDay = left > 0 ? Math.ceil(res.need / left) : res.need;
  res.forecast = forecastDate(hist, today, min);
  res.onTrack = res.need === 0 || (res.forecast != null && contest.end != null && res.forecast <= contest.end);
  return res;
}

// «Жду ответа»: сколько дней жду, просрочено ли напоминание
export function waitingStatus(item, today) {
  const days = item.since ? diffDays(item.since, today) : 0;
  const remind = Number(item.remindDays) || 14;
  return { days, overdue: !item.done && days >= remind };
}

export { r2 };
