// Разбор и подготовка файлов: выгрузка Литнета, отчёт таргетологов, старый трекер, резервная копия, CSV.
import { saleId, bookIdFor, r2, hashStr } from './calc.js';
import { parseNum, parseDateRu } from './format.js';

// Кодировка: UTF-16 LE (как у Литнета), UTF-8 или Windows-1251
export function decodeBuffer(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder('utf-16le').decode(u.subarray(2));
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder('utf-16be').decode(u.subarray(2));
  if (u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) return new TextDecoder('utf-8').decode(u.subarray(3));
  let zeros = 0;
  for (let i = 1; i < Math.min(u.length, 400); i += 2) if (u[i] === 0) zeros++;
  if (zeros > 50) return new TextDecoder('utf-16le').decode(u);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch { return new TextDecoder('windows-1251').decode(u); }
}

function detectDelimiter(text) {
  const head = text.split(/\r?\n/).slice(0, 5).join('\n');
  const c = { '\t': 0, ';': 0, ',': 0 };
  for (const ch of head) if (ch in c) c[ch]++;
  return c['\t'] >= c[';'] && c['\t'] > 0 ? '\t' : c[';'] > 0 ? ';' : ',';
}
// Простой разбор CSV с кавычками
export function parseCsv(text, delim) {
  const d = delim || detectDelimiter(text);
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim()));
}

// ---- Statistic.csv ----
// Возвращает { rows: [{id,date,book,bookId,kind,price,qty,royalty}], total, skipped }
export function parseStatistic(text) {
  const table = parseCsv(text.replace(/^﻿/, ''), '\t');
  const map = new Map();
  let skipped = 0;
  for (const r of table) {
    const iso = parseDateRu(r[0]);
    if (!iso) { if (r.some((x) => x)) skipped++; continue; } // «Статистика продаж», заголовок, «Итого»
    const book = (r[1] || '').trim();
    const price = parseNum(r[3]), qty = parseNum(r[4]), royalty = parseNum(r[5]);
    if (!book || [price, qty, royalty].some(Number.isNaN)) { skipped++; continue; }
    const kind = /^подп/i.test(r[2] || '') ? 'sub' : 'sale';
    const row = { date: iso, book, bookId: bookIdFor(book), kind, price, qty, royalty };
    const id = saleId(row);
    const e = map.get(id);
    if (e) { e.qty += qty; e.royalty = r2(e.royalty + royalty); } // одинаковые строки внутри файла складываем
    else map.set(id, { id, ...row });
  }
  const rows = [...map.values()];
  return { rows, total: r2(rows.reduce((a, s) => a + s.royalty, 0)), skipped };
}

// ---- Отчёт таргетологов (копирование таблицы или CSV) ----
// Строка: Название | 14.09.2026 – 20.09.2026 | Расход | Показы | Клики | CPC | CTR
export function parseTargetReport(text) {
  const out = [], bad = [];
  const rows = parseCsv(text.replace(/^﻿/, ''));
  for (const r of rows) {
    const line = r.join(' ');
    const m = /(\d{1,2}\.\d{1,2}\.\d{4})\s*[–—-]\s*(\d{1,2}\.\d{1,2}\.\d{4})/.exec(line);
    if (!m) continue; // заголовок и «Итого» пропускаем
    const idx = r.findIndex((c) => m[0] && c.includes(m[1]));
    const nums = r.slice(idx + 1).filter((c) => c !== '').map(parseNum);
    const start = parseDateRu(m[1]), end = parseDateRu(m[2]);
    if (!start || !end || nums.length < 3 || nums.slice(0, 3).some(Number.isNaN)) { bad.push(line); continue; }
    out.push({ name: r.slice(0, Math.max(idx, 0)).join(' ').trim(), start, end, spend: nums[0], impressions: nums[1], clicks: nums[2] });
  }
  return { rows: out, bad };
}
export const reportId = (campaignId, start) => `r_${campaignId}_${start}`;

// ---- dohody.csv (старый трекер): дата, доход, события, заметка ----
export function eventTypeFromText(t) {
  const s = (t || '').toLowerCase();
  if (/глав|прод[оа]/.test(s)) return 'chapter';
  if (/скидк/.test(s)) return 'discount';
  if (/старт|начал/.test(s)) return 'start';
  if (/акци/.test(s)) return 'promo';
  if (/конкурс|итог/.test(s)) return 'contest';
  return 'note';
}
export function parseLegacy(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const days = [], bad = [];
  for (const r of rows) {
    const iso = parseDateRu(r[0]) || (/^\d{4}-\d{2}-\d{2}$/.test(r[0] || '') ? r[0] : null);
    if (!iso) continue;
    const income = parseNum(r[1]);
    const ev = (r[2] || '').trim(), note = (r[3] || '').trim();
    if (Number.isNaN(income) && !ev && !note) { bad.push(r.join(';')); continue; }
    days.push({
      date: iso,
      income: Number.isNaN(income) ? null : income,
      events: ev ? ev.split(/\s*[;|]\s*/).filter(Boolean).map((t) => ({ type: eventTypeFromText(t), text: t })) : [],
      note,
    });
  }
  return { days, bad };
}

// ---- резервная копия ----
export const COLLECTIONS = ['books', 'sales', 'days', 'campaigns', 'reports', 'months', 'adnotes'];
export function makeBackup(data) {
  const out = { app: 'author-income-tracker', version: 1, exportedAt: new Date().toISOString(), settings: data.settings || {} };
  for (const c of COLLECTIONS) out[c] = data[c] || [];
  return JSON.stringify(out, null, 1);
}
export function readBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch { throw new Error('Файл не похож на резервную копию (не читается как JSON).'); }
  if (!o || o.app !== 'author-income-tracker') throw new Error('Это не резервная копия этого приложения.');
  for (const c of COLLECTIONS) if (!Array.isArray(o[c])) o[c] = [];
  o.settings = o.settings || {};
  return o;
}

// ---- экспорт CSV (; и BOM, чтобы Excel открыл по-русски) ----
export function toCsv(rows, columns) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = columns.map((c) => esc(c.title)).join(';');
  const body = rows.map((r) => columns.map((c) => esc(c.get(r))).join(';'));
  return '﻿' + [head, ...body].join('\r\n');
}
export const csvDec = (n) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
export { hashStr };

// ---- распознанный текст скриншота продаж (Литнет) → цифры для «Добавить продажи вручную» ----
// Ищем строки с «продаж…»/«подпис…»: в строке таблицы обычно «цена · кол-во · доход» — три последних числа.
// Если строка короче — «N шт» и сумма «… ₽». Отдельно — итоговые «начислено / доход / гонорар».
export function parseSalesText(text, bookTitle = '') {
  const res = { sale: { qty: 0, royalty: 0, gross: 0, n: 0 }, sub: { qty: 0, royalty: 0, gross: 0, n: 0 }, royalty: null };
  const words = String(bookTitle || '').toLowerCase().split(/[^a-zа-яё0-9]+/i).filter((w) => w.length > 3);
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const toNums = (l) => [...l.matchAll(/\d+(?:[.,]\d{1,2})?/g)].map((m) => Number(m[0].replace(',', '.')));
  const numsOf = (l) => toNums(l.replace(/(\d)[\s ](?=\d{3}(?!\d))/g, '$1'));
  // строка таблицы: цена · кол-во · доход; доход — разумная доля от цены×кол-во
  const row = (n) => { if (n.length < 3) return null; const [price, qty, roy] = n.slice(-3);
    return Number.isInteger(qty) && qty > 0 && roy > 0 && roy <= price * qty * 1.01 && roy >= price * qty * 0.2 ? { price, qty, roy } : null; };
  // если есть строки с названием книги — берём только их
  const own = words.length ? lines.filter((l) => words.some((w) => l.toLowerCase().includes(w))) : [];
  const pool = own.length ? own : lines;
  for (const l of pool) {
    const low = l.toLowerCase();
    const kind = /подпис/.test(low) ? 'sub' : /продаж/.test(low) ? 'sale' : null;
    if (!kind) continue;
    const e = res[kind];
    const r = row(toNums(l)) || row(numsOf(l));
    if (r) { e.qty += r.qty; e.royalty += r.roy; e.gross += r.price * r.qty; e.n++; continue; }
    const q = /(\d+)\s*(шт|штук|продаж|подпис)/i.exec(l), m = /(\d[\d\s.,]*)\s*(₽|руб|р\.)/i.exec(l);
    if (q) e.qty += Number(q[1]);
    if (m) e.royalty += Number(m[1].replace(/\s/g, '').replace(',', '.'));
    if (q || m) e.n++;
  }
  for (const l of lines) {
    const low = l.toLowerCase();
    if (/(начислен|гонорар|роялти|ваш доход|к выплате)/.test(low)) { const n = numsOf(l); if (n.length) res.royalty = n[n.length - 1]; }
  }
  for (const k of ['sale', 'sub']) { const e = res[k]; e.royalty = Math.round(e.royalty * 100) / 100; e.gross = Math.round(e.gross * 100) / 100; }
  return res;
}
