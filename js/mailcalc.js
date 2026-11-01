// Почта (Мастерская → Сайт → Почта): чистые расчёты по списку подписчиц из сервиса писем.
// Подписчица: { email, name, src, at (оставила почту), status: ok|pending|unsub, okAt, unsubAt }
import { addDays } from './calc.js';

const day = (iso) => String(iso || '').slice(0, 10);
// день, с которого подписчица «считается»: подтвердила (или перенесена из старой формы — at)
export const okDay = (p) => day(p.okAt || (p.status !== 'pending' ? p.at : ''));

// цифры: подтвердили, ждут подтверждения, отписались, новых за 30 дней, отписок за 30 дней
export function subsStats(list, today) {
  const from = addDays(today, -29);
  const L = list || [];
  return {
    ok: L.filter((p) => p.status === 'ok').length,
    wait: L.filter((p) => p.status === 'pending').length,
    unsub: L.filter((p) => p.status === 'unsub').length,
    new30: L.filter((p) => p.status !== 'pending' && okDay(p) >= from).length,
    gone30: L.filter((p) => p.status === 'unsub' && day(p.unsubAt) >= from).length,
  };
}

// рост по дням: сколько подтверждённых было в конце каждого дня (минус отписавшиеся), за последние days дней
export function subsSeries(list, today, days = 90) {
  const L = (list || []).filter((p) => p.status !== 'pending' && okDay(p));
  const first = L.map(okDay).sort()[0];
  if (!first) return [];
  let from = addDays(today, -(days - 1));
  if (first > from) from = addDays(first, -1); // график начинается за день до первой подписчицы
  const out = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const v = L.filter((p) => okDay(p) <= d && !(p.status === 'unsub' && day(p.unsubAt) && day(p.unsubAt) <= d)).length;
    out.push({ date: d, value: v });
  }
  return out;
}

const STATUS = { ok: 'подтвердила', pending: 'ждёт подтверждения', unsub: 'отписалась' };
const SRC = (s) => (s === 'kabinet' ? 'кабинет' : s === 'firebase' ? 'прежняя форма' : /^kniga:/.test(s || '') ? 'страница книги' : s === 'glavnaya' ? 'главная' : s || '');
export const statusName = (s) => STATUS[s] || s || '';
export const srcName = SRC;

// таблица для Excel/Google Таблиц: точка с запятой, BOM — чтобы кириллица открылась сразу
export function subsCsv(list) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Почта', 'Имя', 'Статус', 'Оставила почту', 'Подтвердила', 'Отписалась', 'Откуда'],
    ...(list || []).map((p) => [p.email, p.name || '', statusName(p.status), day(p.at), day(p.okAt), day(p.unsubAt), SRC(p.src)])];
  return '﻿' + rows.map((r) => r.map(q).join(';')).join('\n');
}

// поиск и фильтр списка адресов
export function filterSubs(list, { q = '', status = 'ok' } = {}) {
  const s = String(q).trim().toLowerCase();
  return (list || [])
    .filter((p) => status === 'all' || p.status === status)
    .filter((p) => !s || p.email.includes(s) || String(p.name || '').toLowerCase().includes(s))
    .sort((a, b) => String(b.okAt || b.at || '').localeCompare(String(a.okAt || a.at || '')));
}

// когда отправить письмо — подсказки: первая глава на таймере, старт выкладки по плану книги (даже если глава ещё не на таймере)
// и старты подписки с сайта. focus — название книги письма: её события идут первыми (их и подсвечиваем по умолчанию).
// wbooks — книги Мастерской; site — siteInfo сайта; plannedPubs — функция из wcalc
const titleKey = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const sameBook = (a, b) => { const x = titleKey(a), y = titleKey(b); return !!x && !!y && (x === y || x.startsWith(y) || y.startsWith(x)); };
export function sendSlots(wbooks, site, today, plannedPubs, { focus = '' } = {}) {
  const out = [];
  for (const b of wbooks || []) {
    if (b.archived) continue;
    const p = plannedPubs(b, today).filter((x) => x.date >= today)[0];
    if (p) out.push({ date: p.date, label: `Выход «${p.ch}» · ${b.title}`, book: b.title });
    const pubbed = Object.values(b.pub || {}).some((x) => Object.values(x || {}).some((y) => y?.date && !y.planned && y.date <= today));
    if (b.publishStart && b.publishStart >= today && !pubbed && (!p || p.date !== b.publishStart)) out.push({ date: b.publishStart, label: `Первая глава · ${b.title}`, book: b.title });
  }
  for (const s of site?.books || []) if (s.startDate && s.startDate >= today) out.push({ date: s.startDate, label: `Старт подписки · ${s.title}`, book: s.title });
  const seen = new Set(), mine = (x) => (focus && sameBook(x.book, focus) ? 0 : 1);
  return out.sort((a, b) => mine(a) - mine(b) || a.date.localeCompare(b.date)).filter((x) => { const k = x.date + x.label; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
}

// местные дата и время → ISO для сервиса; и обратно — для показа
export const localIso = (date, time) => new Date(`${date}T${time || '10:00'}:00`).toISOString();
export function localParts(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
