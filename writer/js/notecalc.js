// Блокнот: заметки (как в Simplenote) и промты для нейросетей — чистые функции, без сети и базы.
const low = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

// ---------- заметки ----------
// заголовок — первая непустая строка (без «#» и пометок чек-листа), превью — следующая
const clean = (s) => String(s || '').replace(/^\s*#+\s*/, '').replace(/^\s*[-*]\s*\[[ xх]\]\s*/i, '').replace(/^\s*[-*]\s+/, '').trim();
const lines = (t) => String(t || '').split('\n').map(clean).filter(Boolean);
export const noteTitle = (n) => (lines(n?.text)[0] || 'Новая заметка').slice(0, 120);
export const notePreview = (n) => lines(n?.text).slice(1).join(' ').slice(0, 160);
export const isTrashed = (n) => !!n?.deletedAt;
// поиск: все слова запроса — в тексте или тегах
export function noteMatches(n, q) {
  if (!q) return true;
  const hay = low([n.text, ...(n.tags || [])].join(' '));
  return low(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}
// закреплённые сверху, дальше — недавно изменённые
export const sortNotes = (list) => [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
// фильтр: '' — все, '@trash' — корзина, иначе тег
export function notesView(list, { q = '', tag = '' } = {}) {
  const pool = (list || []).filter((n) => (tag === '@trash' ? isTrashed(n) : !isTrashed(n)) && (!tag || tag === '@trash' || (n.tags || []).includes(tag)));
  return sortNotes(pool.filter((n) => noteMatches(n, q)));
}
// теги с числом заметок (корзина не считается), по частоте
export function noteTags(list) {
  const m = new Map();
  for (const n of list || []) if (!isTrashed(n)) for (const t of n.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).map(([tag, n]) => ({ tag, n }));
}
export const normTag = (s) => low(s).replace(/^#/, '').replace(/[,\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
export function textStats(text) {
  const t = String(text || '');
  return { words: (t.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) || []).length, chars: t.replace(/\n/g, '').length };
}
// корзина: через 30 дней стираются сами
export const expiredNote = (n, now = Date.now()) => !!n.deletedAt && now - Date.parse(n.deletedAt) > 30 * 864e5;

// чек-лист: строка «- [ ] дело» ↔ «- [x] дело»
const CHECK = /^(\s*[-*]\s*)\[([ xх])\]/i;
export function toggleCheck(text, lineNo) {
  const ls = String(text || '').split('\n');
  if (!CHECK.test(ls[lineNo] || '')) return text;
  ls[lineNo] = ls[lineNo].replace(CHECK, (m, a, v) => `${a}[${v.trim() ? ' ' : 'x'}]`);
  return ls.join('\n');
}

// Просмотр заметки: заголовки #, **жирный**, *курсив*, списки и чек-листы (с номером строки — для галочки)
const hesc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s) => hesc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>')
  .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?»)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
export function noteHtml(text) {
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  String(text || '').split('\n').forEach((ln, i) => {
    const c = CHECK.exec(ln);
    if (c) {
      if (list !== 'ul class="nb-checks"') { close(); out.push('<ul class="nb-checks">'); list = 'ul class="nb-checks"'; }
      const on = !!c[2].trim();
      out.push(`<li class="${on ? 'on' : ''}"><button type="button" class="nb-box" data-act="note.check" data-l="${i}" aria-label="${on ? 'Снять отметку' : 'Отметить'}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button><span>${inline(ln.replace(CHECK, '').trim())}</span></li>`);
      return;
    }
    const b = /^\s*[-*]\s+(.*)$/.exec(ln), n = /^\s*\d+[.)]\s+(.*)$/.exec(ln), h = /^(#{1,3})\s+(.*)$/.exec(ln);
    if (b) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(b[1])}</li>`); return; }
    if (n) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(n[1])}</li>`); return; }
    close();
    if (h) out.push(`<h${h[1].length + 2}>${inline(h[2])}</h${h[1].length + 2}>`);
    else if (!ln.trim()) out.push('<p class="nb-gap"></p>');
    else out.push(`<p>${inline(ln)}</p>`);
  });
  close();
  return out.join('');
}

// Импорт из Simplenote: notes.json из экспорта (activeNotes / trashedNotes) или отдельные .txt
export function fromSimplenoteJson(json) {
  const o = typeof json === 'string' ? JSON.parse(json) : json;
  const one = (x, trashed) => ({
    sid: String(x.id || ''), text: String(x.content || ''), tags: (x.tags || []).map(normTag).filter(Boolean), pinned: !!x.pinned,
    createdAt: x.creationDate ? new Date(x.creationDate).toISOString() : new Date().toISOString(),
    updatedAt: x.lastModified ? new Date(x.lastModified).toISOString() : new Date().toISOString(),
    ...(trashed ? { deletedAt: new Date().toISOString() } : {}),
  });
  return [...(o.activeNotes || []).map((x) => one(x, false)), ...(o.trashedNotes || []).map((x) => one(x, true))].filter((n) => n.text.trim());
}
export const fromText = (name, text, at = new Date().toISOString()) => ({ sid: 'txt:' + name, text: String(text || '').replace(/\r\n/g, '\n'), tags: [], pinned: false, createdAt: at, updatedAt: at });
// уже перенесённые (по id Simplenote или имени файла) второй раз не добавляем
export const newOnly = (incoming, existing) => { const had = new Set((existing || []).map((n) => n.sid).filter(Boolean)); return incoming.filter((n) => !n.sid || !had.has(n.sid)); };

// ---------- промты ----------
// где промт пригодится: он сам появляется в этом месте Легенды или редактора
export const PLACES = {
  idea: 'Легенда · Идея', plan: 'Легенда · Каркас', chars: 'Легенда · Персонажи', synopsis: 'Легенда · Синопсис',
  chapter: 'Редактор главы', marketing: 'Маркетинг и реклама', any: 'Везде',
};
// переменные: подставляются из книги, которую сейчас открыла
export const VARS = [
  ['книга', 'название книги'], ['легенда', 'утверждённая Легенда'], ['синопсис', 'синопсис'],
  ['глава', 'название главы'], ['каркас главы', 'план этой главы из Легенды'], ['текст главы', 'текст открытой главы'],
];
export function fillPrompt(text, vars = {}) {
  return String(text || '').replace(/\{([^{}]{2,30})\}/g, (m, k) => {
    const v = vars[low(k).trim()];
    return v == null || v === '' ? m : String(v);
  });
}
// какие переменные в тексте остались без значения (подсказка «откройте главу»)
export const missingVars = (text) => [...new Set([...String(text || '').matchAll(/\{([^{}]{2,30})\}/g)].map((m) => low(m[1]).trim()))].filter((k) => VARS.some(([v]) => v === k));
// промты для места: своё место и «везде»; для этой книги и для всех книг; частые сверху
export function promptsFor(list, place, bookId = '') {
  return (list || []).filter((p) => !p.deletedAt && (p.place === place || p.place === 'any' || !p.place) && (!p.bookId || p.bookId === bookId))
    .sort((a, b) => (b.place === place ? 1 : 0) - (a.place === place ? 1 : 0) || (b.uses || 0) - (a.uses || 0) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
// вкладки Документа с промтами («Промт», «Промпт», «Prompt») — их можно взять в библиотеку одной кнопкой
export const isPromptTab = (title) => /^\s*(пром[пт]т?|prompt)/i.test(String(title || ''));
export function docPromptTabs(books, prompts) {
  const had = new Set((prompts || []).filter((p) => p.src).map((p) => p.src));
  const out = [];
  for (const b of books || []) for (const t of b.tabs || []) if (isPromptTab(t.title) && !had.has(`${b.id}:${t.title}`)) out.push({ bookId: b.id, book: b.title, tab: t.title });
  return out;
}
// где промт из вкладки пригодится — по её названию
export function guessPlace(title) {
  const t = low(title);
  if (/глав|сцен|текст|стил|редакт/.test(t)) return 'chapter';
  if (/персонаж|геро/.test(t)) return 'chars';
  if (/каркас|план|сюжет/.test(t)) return 'plan';
  if (/синопсис/.test(t)) return 'synopsis';
  if (/иде/.test(t)) return 'idea';
  if (/реклам|аннотац|пост|блог|маркет|таргет/.test(t)) return 'marketing';
  return 'any';
}

// Экспорт в Simplenote (20.11.2026, её просьба: «экспорт в Simplenote не работает»): их собственный формат notes.json —
// {activeNotes: [{content, creationDate, lastModified, tags, pinned, markdown}], trashedNotes: []} (сверено с импортом Simplenote:
// lib/utils/import/simplenote — .json или .zip с source/notes.json, не больше 5 МБ; теги без пробелов и запятых).
const MD = /^\s*#{1,3}\s|\*\*|^\s*[-*]\s*\[[ xх]\]/m;
export function toSimplenoteJson(list) {
  const one = (n) => ({
    id: n.sid && !String(n.sid).startsWith('txt:') ? String(n.sid) : String(n.id || ''),
    content: String(n.text || ''),
    creationDate: n.createdAt || n.updatedAt || new Date().toISOString(),
    lastModified: n.updatedAt || n.createdAt || new Date().toISOString(),
    tags: (n.tags || []).map((t) => String(t).replace(/[\s,]+/g, '-')).filter(Boolean),
    ...(n.pinned ? { pinned: true } : {}),
    ...(MD.test(n.text || '') ? { markdown: true } : {}),
  });
  return { activeNotes: (list || []).filter((n) => !n.deletedAt && String(n.text || '').trim()).map(one), trashedNotes: [] };
}
// «новые и изменённые здесь»: созданные в Мастерской, правленные после переноса из Simplenote или после прошлого экспорта —
// чтобы в Simplenote не появлялись двойные заметки
export const changedHere = (n, exportAt = '') => !n.deletedAt && String(n.text || '').trim() !== '' && (exportAt ? String(n.updatedAt || n.createdAt || '') > exportAt : (!n.sid || (!!n.impAt && String(n.updatedAt || '') > n.impAt)));
