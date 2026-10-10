// Редактор главы: текст и оформление — как во вкладке Google Документа (стили абзацев, отступы, выравнивание,
// шрифт, жирный/курсив/подчёркнутый/зачёркнутый). Пишем здесь — черновик на устройстве, сохраняем в Документ по кнопке
// (Ctrl+S) или автоматически. Инструменты писателя: типографика («ёлочки», тире), поиск и замена, режим фокуса,
// статистика (слова, знаки, а.л., за сессию), переход между главами.
import { esc, acts, toast, ask, openSheet } from '../../../js/ui.js';
import { fmtDate, num, plural } from '../../../js/format.js';
import { ic } from '../../../js/icons.js';
import * as drive from '../drive.js';
import { findTab, contentToBlocks, blocksText, contentEnd, saveRequests, namedStylesOf, textStats, nextChapterTab, isChapterTitle } from '../docedit.js';
import { alNum, chapterList } from '../wcalc.js';

const app = () => window.__app;
let ed = null; // { key, bookId, title, tabId, status, html, baseText, dirty, savedAt, err, draft, named, startChars }
const draftKey = (k) => 'ed:' + k;
const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* память недоступна */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ок */ } },
};
const pref = (k, d) => { const v = ls.get('edPref'); return v && v[k] !== undefined ? v[k] : d; };
const setPref = (k, v) => ls.set('edPref', { ...(ls.get('edPref') || {}), [k]: v });

// ---------- абзацы ⇄ HTML редактора ----------
const TAG = { TITLE: 'h1', SUBTITLE: 'h6', HEADING_1: 'h2', HEADING_2: 'h3', HEADING_3: 'h4', HEADING_4: 'h5' };
const NAMED = { H1: 'TITLE', H6: 'SUBTITLE', H2: 'HEADING_1', H3: 'HEADING_2', H4: 'HEADING_3', H5: 'HEADING_4' };
const ALIGN = { CENTER: 'center', END: 'right', JUSTIFIED: 'justify' };
const ALIGN_BACK = { center: 'CENTER', right: 'END', justify: 'JUSTIFIED', left: '', start: '' };
// размеры из Документа (pt) — в em относительно обычного текста, чтобы масштаб редактора их сохранял
const em = (v, base) => `${+(v / base).toFixed(3)}em`;
function blockStyle(st, named, base) {
  const eff = { ...(named[st.n || 'NORMAL_TEXT']?.st || {}), ...(named.NORMAL_TEXT?.st?.ls && !st.n ? {} : {}), ...st };
  const css = [];
  if (eff.a && ALIGN[eff.a]) css.push(`text-align:${ALIGN[eff.a]}`);
  if (eff.fi != null) css.push(`text-indent:${em(eff.fi, base)}`);
  if (eff.il != null) css.push(`margin-left:${em(eff.il, base)}`);
  if (eff.sa != null) css.push(`margin-top:${em(eff.sa, base)}`);
  if (eff.sb != null) css.push(`margin-bottom:${em(eff.sb, base)}`);
  if (eff.ls != null) css.push(`line-height:${+(eff.ls / 100 * 1.25).toFixed(2)}`);
  return css.join(';');
}
function runHtml(r, base) {
  let h = esc(r.t).replace(/\n/g, '<br>');
  if (r.s) h = `<s>${h}</s>`;
  if (r.u) h = `<u>${h}</u>`;
  if (r.i) h = `<i>${h}</i>`;
  if (r.b) h = `<b>${h}</b>`;
  if (r.c) h = `<span data-c="${esc(r.c)}" style="color:${esc(r.c)}">${h}</span>`;
  if (r.f || r.z) h = `<span${r.f ? ` data-f="${esc(r.f)}"` : ''}${r.z ? ` data-z="${r.z}"` : ''} style="${r.f ? `font-family:'${esc(r.f)}',inherit;` : ''}${r.z ? `font-size:${em(r.z, base)}` : ''}">${h}</span>`;
  return h;
}
export function blocksToHtml(blocks, named = {}, base = 12) {
  return (blocks.length ? blocks : [{ st: {}, runs: [] }]).map((p) => {
    const tag = TAG[p.st?.n] || 'p', rest = { ...(p.st || {}) };
    delete rest.n;
    return `<${tag} data-st='${esc(JSON.stringify(rest))}' style="${blockStyle(p.st || {}, named, base)}">${p.runs.map((r) => runHtml(r, base)).join('') || '<br>'}</${tag}>`;
  }).join('');
}
// «rgb(11, 107, 79)» → «#0b6b4f» (пусто — если цвета нет)
const cssHex = (v) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v || ''); return m ? '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join('') : /^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : ''; };
function htmlToBlocks(root) {
  const blocks = [];
  let cur = [], curSt = {};
  const push = () => { blocks.push({ st: curSt, runs: cur }); cur = []; };
  const stOf = (el) => {
    let st = {};
    try { st = JSON.parse(el.getAttribute('data-st') || '{}'); } catch { st = {}; }
    const n = NAMED[el.tagName];
    if (n) st.n = n; else delete st.n;
    const a = el.style?.textAlign;
    if (a !== undefined && a !== '') { const v = ALIGN_BACK[a]; if (v) st.a = v; else delete st.a; }
    return st;
  };
  const walk = (node, f) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue) cur.push({ t: n.nodeValue, b: f.b, i: f.i, u: f.u, s: f.s, ...(f.f ? { f: f.f } : {}), ...(f.z ? { z: f.z } : {}), ...(f.c ? { c: f.c } : {}) }); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName, sty = n.style || {};
      if (tag === 'BR') { if (n !== n.parentNode.lastChild || n.parentNode === root) cur.push({ t: '\n', ...f }); continue; }
      const block = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(tag);
      if (block) { if (cur.length) push(); curSt = stOf(n); }
      const nf = {
        b: f.b || tag === 'B' || tag === 'STRONG' || /bold|[6-9]00/.test(sty.fontWeight || ''),
        i: f.i || tag === 'I' || tag === 'EM' || sty.fontStyle === 'italic',
        u: f.u || tag === 'U' || /underline/.test(sty.textDecoration || sty.textDecorationLine || ''),
        s: f.s || tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(sty.textDecoration || sty.textDecorationLine || ''),
        f: n.getAttribute?.('data-f') || f.f, z: Number(n.getAttribute?.('data-z')) || f.z,
        c: n.getAttribute?.('data-c') || cssHex(sty.color) || n.getAttribute?.('color') || f.c,
      };
      walk(n, nf);
      if (block) push();
    }
  };
  walk(root, { b: false, i: false, u: false, s: false });
  if (cur.length) push();
  // перевод строки внутри абзаца (Shift+Enter) — оставляем; пустой хвост — убираем
  for (const p of blocks) { if (p.runs.length && p.runs[p.runs.length - 1].t === '\n') p.runs.pop(); }
  while (blocks.length > 1 && !blocks[blocks.length - 1].runs.length) blocks.pop();
  const same = (a, b) => a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s && a.f === b.f && a.z === b.z && a.c === b.c;
  return blocks.map((p) => ({ st: p.st, runs: p.runs.reduce((a, r) => { const l = a[a.length - 1]; if (l && same(l, r)) l.t += r.t; else a.push({ ...r }); return a; }, []) }));
}

// ---------- загрузка главы ----------
async function load(key, b, title) {
  ed = { key, bookId: b.id, title, status: 'loading' };
  try {
    await drive.ensureToken();
    const doc = await drive.getDoc(b.fileId);
    const tab = findTab(doc, title);
    const content = tab ? tab.documentTab?.body?.content : (doc.tabs ? null : doc.body?.content);
    if (!content) throw new Error(`вкладка «${title}» не найдена в документе`);
    const named = tab ? namedStylesOf(tab) : {};
    const blocks = contentToBlocks(content), base = named.NORMAL_TEXT?.run?.z || 12;
    const draft = ls.get(draftKey(key));
    ed = { key, bookId: b.id, title, tabId: tab?.tabProperties?.tabId || '', status: 'ready', named, base, font: named.NORMAL_TEXT?.run?.f || '',
      html: blocksToHtml(blocks, named, base), baseText: blocksText(blocks), dirty: false, startChars: textStats(blocks).chars,
      draft: draft && draft.text !== blocksText(blocks) ? draft : null };
  } catch (e) { ed = { key, bookId: b.id, title, status: 'error', err: e.message }; }
  if (app().ui.route.startsWith('/ed/')) app().rerender();
}

const STYLES = [['NORMAL_TEXT', 'Обычный текст'], ['TITLE', 'Название'], ['SUBTITLE', 'Подзаголовок'], ['HEADING_1', 'Заголовок 1'], ['HEADING_2', 'Заголовок 2'], ['HEADING_3', 'Заголовок 3']];
export function editorView(a, bookId, title) {
  const c = a.ctx(), b = c.wbooksById[bookId];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p></div>' };
  const key = `${bookId}:${title}`;
  if (!ed || ed.key !== key) load(key, b, title);
  const back = `<a class="btn back" href="#" data-act="ed.back" data-id="${b.id}">← К книге</a>`;
  if (ed.status === 'loading') return { html: `<p>${back}</p><div class="card"><p class="muted" style="margin:0">Загружаю «${esc(title)}» из Google Документа…</p></div>` };
  if (ed.status === 'error') return { html: `<p>${back}</p><div class="card"><p style="margin-top:0">Не получилось открыть главу: ${esc(ed.err)}</p><button data-act="ed.reload">Попробовать ещё раз</button></div>` };
  const chs = chapterList(b).map((t) => t.title), i = chs.indexOf(title);
  const prev = i > 0 ? chs[i - 1] : null, next = i >= 0 && i < chs.length - 1 ? chs[i + 1] : null;
  const zoom = pref('zoom', 1), auto = pref('auto', true);
  const html = `
  <div class="ed-bar">
    <div class="ed-nav">${back}
      <div class="ed-chapter">${prev ? `<button class="ed-ic" data-act="ed.goto" data-t="${esc(prev)}" title="${esc(prev)}" aria-label="Предыдущая глава">${ic('chevron')}</button>` : '<span class="ed-ic-gap"></span>'}
        <select data-chg="ed.pick" aria-label="Глава">${chs.map((t) => `<option${t === title ? ' selected' : ''}>${esc(t)}</option>`).join('')}${i < 0 ? `<option selected>${esc(title)}</option>` : ''}</select>
        ${next ? `<button class="ed-ic" data-act="ed.goto" data-t="${esc(next)}" title="${esc(next)}" aria-label="Следующая глава"><span class="flip">${ic('chevron')}</span></button>` : '<span class="ed-ic-gap"></span>'}
        <button class="ed-ic ed-add" data-act="ch.add" data-id="${b.id}" title="Новая глава — отдельная вкладка в Google Документе" aria-label="Новая глава">+</button></div>
      <span class="ed-status" id="edstat">${statusText()}</span>
      <label class="ed-auto" title="Сохранять в Google Документ само, через полминуты после правки"><input type="checkbox" data-chg="ed.auto"${auto ? ' checked' : ''}> автосохранение</label>
      <button class="primary" data-act="ed.save" title="Ctrl+S">Сохранить в Документ</button>
    </div>
    <div class="ed-tools" role="toolbar" aria-label="Оформление">
      <select data-chg="ed.style" class="ed-style" aria-label="Стиль абзаца">${STYLES.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="ed.fmt" data-v="bold" title="Жирный (Ctrl+B)"><b>Ж</b></button>
      <button class="ed-ic" data-act="ed.fmt" data-v="italic" title="Курсив (Ctrl+I)"><i>К</i></button>
      <button class="ed-ic ed-color" data-act="ed.color" title="Выделить цветом — тёмно-изумрудный (Ctrl+Shift+E). Ещё раз — убрать" aria-label="Выделить цветом"><span>А</span></button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="ed.align" data-v="left" title="По левому краю">${alignIc('left')}</button>
      <button class="ed-ic" data-act="ed.align" data-v="center" title="По центру">${alignIc('center')}</button>
      <button class="ed-ic" data-act="ed.align" data-v="right" title="По правому краю">${alignIc('right')}</button>
      <button class="ed-ic" data-act="ed.align" data-v="justify" title="По ширине">${alignIc('justify')}</button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="ed.dash" title="Тире для диалога">—</button>
      <button class="ed-ic" data-act="ed.undo" title="Отменить (Ctrl+Z)">↶</button>
      <button class="ed-ic" data-act="ed.redo" title="Повторить (Ctrl+Shift+Z)">↷</button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="ed.find" title="Найти и заменить (Ctrl+F)">${ic('search')}</button>
      <button class="ed-ic" data-act="ed.copy" title="Скопировать главу (без названия)">${ic('copy')}</button>
      <button class="ed-ic" data-act="ed.zoom" data-v="-1" title="Мельче">A−</button>
      <button class="ed-ic" data-act="ed.zoom" data-v="1" title="Крупнее">A+</button>
      <button class="ed-ic" data-act="ed.focus" title="Режим фокуса (Esc — выйти)">⛶</button>
    </div>
    <div class="ed-find" id="edfind" hidden><input id="edq" placeholder="Найти в главе" aria-label="Найти" autocomplete="off">
      <button class="ed-ic" data-act="ed.findPrev" title="Предыдущее (Shift+Enter)">↑</button><button class="ed-ic" data-act="ed.findNext" title="Следующее (Enter)">↓</button><span class="small muted ed-found" id="edfound"></span>
      <input id="edr" placeholder="Заменить на" aria-label="Заменить на" autocomplete="off"><button class="small-btn" data-act="ed.replaceOne">Заменить</button><button class="small-btn" data-act="ed.replaceAll">Заменить все</button>
      <button class="ed-ic" data-act="ed.find" title="Закрыть (Esc)">✕</button></div>
  </div>
  ${ed.draft ? `<div class="alert alert-thin ed-draft">На этом устройстве есть несохранённый черновик от ${fmtDate(ed.draft.at.slice(0, 10))} ${ed.draft.at.slice(11, 16)}. <button class="link" data-act="ed.useDraft">Открыть черновик</button> <button class="link" data-act="ed.dropDraft">Отбросить</button></div>` : ''}
  <div class="ed-paper"><div class="ed-stats" id="edstats"></div><div class="editor" id="ed" contenteditable="true" spellcheck="true" lang="ru" style="--ed-zoom:${zoom};${ed.font ? `font-family:'${esc(ed.font)}',Georgia,'Times New Roman',serif` : ''}">${ed.html}</div></div>`;
  return { html, after: wire };
}
const alignIc = (v) => {
  const L = { left: [[4, 18], [4, 14], [4, 18], [4, 12]], center: [[3, 21], [6, 18], [3, 21], [7, 17]], right: [[4, 20], [10, 20], [4, 20], [12, 20]], justify: [[4, 20], [4, 20], [4, 20], [4, 20]] }[v];
  return `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${L.map(([a, b], k) => `<path d="M${a} ${6 + k * 4}h${b - a}"/>`).join('')}</svg>`;
};
function statusText() {
  if (!ed || ed.status !== 'ready') return '';
  if (ed.saving) return 'сохраняю…';
  if (ed.dirty) return 'не сохранено в Документ · черновик на устройстве';
  return ed.savedAt ? `✓ сохранено в ${ed.savedAt}` : '✓ как в Google Документе';
}
const setStatus = () => { const st = document.getElementById('edstat'); if (st) st.textContent = statusText(); };

let draftTimer, autoTimer;
function stats(el) {
  const s = textStats(htmlToBlocks(el)), box = document.getElementById('edstats');
  if (!box) return;
  const diff = s.chars - (ed.startChars || 0);
  box.innerHTML = `<span><b>${num(s.words)}</b> <i>${plural(s.words, ['слово', 'слова', 'слов'])}</i></span><span><b>${num(s.chars)}</b> <i>зн.</i></span><span><b>${alNum(s.chars)}</b> <i>а.л.</i></span><span class="es-sess"><b class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : '−'}${num(Math.abs(diff))}</b> <i>зн. за сессию</i></span>`;
}
function wire() {
  const el = document.getElementById('ed');
  if (!el) return;
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch { /* старый браузер */ }
  stats(el);
  const changed = () => {
    ed.html = el.innerHTML; ed.dirty = true; setStatus();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { ls.set(draftKey(ed.key), { html: ed.html, text: blocksText(htmlToBlocks(el)), at: new Date().toISOString() }); stats(el); }, 500);
    clearTimeout(autoTimer);
    if (pref('auto', true)) autoTimer = setTimeout(() => save({ auto: true }), 30000);
  };
  el.addEventListener('input', () => { changed(); snap(el); });
  hist.stack = [{ html: el.innerHTML, caret: null }]; hist.i = 0;
  const q = document.getElementById('edq');
  q?.addEventListener('input', () => { fnd.i = -1; findStep(1); });
  q?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); } else if (e.key === 'Escape') acts['ed.find'](); });
  // типографика: «ёлочки», длинное тире из «--», в начале абзаца «- » → «— »
  el.addEventListener('beforeinput', (e) => {
    if (e.inputType !== 'insertText' || !e.data) return;
    const sel = window.getSelection(), node = sel.anchorNode, off = sel.anchorOffset;
    const before = node && node.nodeType === 3 ? node.nodeValue.slice(0, off) : '';
    if (e.data === '"') { e.preventDefault(); document.execCommand('insertText', false, /(^|[\s(«—–-])$/.test(before) ? '«' : '»'); return; }
    if (e.data === '-' && before.endsWith('-')) { e.preventDefault(); document.execCommand('delete'); document.execCommand('insertText', false, '—'); return; }
    if (e.data === ' ' && /^\s*-$/.test(before)) { e.preventDefault(); document.execCommand('delete'); document.execCommand('insertText', false, '— '); }
  });
  // вставка — только текстом, без чужого оформления
  el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
  // курсор в абзаце → показываем его стиль
  document.addEventListener('selectionchange', syncStyle);
  // кнопки панели не забирают фокус у текста
  document.querySelector('.ed-tools')?.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'SELECT') e.preventDefault(); });
}
function curBlock() {
  const sel = window.getSelection(), el = document.getElementById('ed');
  let n = sel && sel.anchorNode;
  while (n && n !== el && !(n.nodeType === 1 && /^(P|DIV|H[1-6])$/.test(n.tagName) && n.parentNode === el)) n = n.parentNode;
  return n && n !== el ? n : null;
}
function syncStyle() {
  const s = document.querySelector('.ed-style'), b = curBlock();
  if (s && b) s.value = NAMED[b.tagName] || 'NORMAL_TEXT';
}
function selectedBlocks() {
  const el = document.getElementById('ed'), sel = window.getSelection();
  if (!el || !sel.rangeCount) return [];
  const r = sel.getRangeAt(0);
  return [...el.children].filter((b) => r.intersectsNode(b));
}
// сохранить в Google Документ (вручную или авто)
async function save({ auto = false } = {}) {
  const el = document.getElementById('ed'), c = app().ctx(), b = ed && c.wbooksById[ed.bookId];
  if (!el || !b || ed.saving) return;
  if (auto && (!ed.dirty || !navigator.onLine || !drive.hasFreshToken())) return;
  const blocks = htmlToBlocks(el);
  ed.saving = true; setStatus();
  try {
    if (!auto) await drive.ensureToken();
    // перед записью — свежая версия: если главу правили в Документе после открытия — спрашиваем (авто — не трогаем)
    const doc = await drive.getDoc(b.fileId);
    const tab = findTab(doc, ed.tabId || ed.title);
    const content = tab ? tab.documentTab?.body?.content : doc.body?.content;
    if (!content) throw new Error('вкладка главы не найдена');
    const now = blocksText(contentToBlocks(content));
    if (now !== ed.baseText) {
      if (auto) { ed.saving = false; ed.conflict = true; const st = document.getElementById('edstat'); if (st) st.textContent = 'глава менялась в Документе — сохраните вручную'; return; }
      if (!(await ask('Эту главу изменили в Google Документе после того, как вы её открыли здесь. Сохранить вашу версию поверх?', 'Сохранить поверх'))) { ed.saving = false; setStatus(); return; }
    }
    await drive.docUpdate(b.fileId, saveRequests(blocks, ed.tabId, contentEnd(content)));
    ed.baseText = blocksText(blocks); ed.html = el.innerHTML; ed.dirty = false; ed.conflict = false;
    ed.savedAt = new Date().toTimeString().slice(0, 5);
    ls.del(draftKey(ed.key));
    if (!auto) toast('Глава сохранена в Google Документ');
    try { const { refreshOne } = await import('./books.js'); await refreshOne(app(), app().ctx().wbooksById[b.id], true); } catch { /* не страшно */ }
  } catch (e) { if (!auto) toast('Не сохранилось: ' + e.message + ' Текст остался в черновике на устройстве.'); }
  ed.saving = false; setStatus();
}

// ---------- история правок: снимки текста с положением курсора; много шагов назад и вперёд ----------
const hist = { stack: [], i: -1, timer: null, lock: false };
function caretOffset(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const r = sel.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(sel.anchorNode, sel.anchorOffset);
  return r.toString().length;
}
function setCaret(el, off) {
  if (off == null) return;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, left = off;
  while ((n = w.nextNode())) { if (left <= n.nodeValue.length) { const r = document.createRange(); r.setStart(n, left); r.collapse(true); const s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(r); return; } left -= n.nodeValue.length; }
}
function snap(el, now = false) {
  if (hist.lock) return;
  const take = () => {
    const html = el.innerHTML;
    if (hist.stack[hist.i]?.html === html) return;
    hist.stack = hist.stack.slice(0, hist.i + 1);
    hist.stack.push({ html, caret: caretOffset(el) });
    if (hist.stack.length > 300) hist.stack.shift();
    hist.i = hist.stack.length - 1;
  };
  clearTimeout(hist.timer);
  if (now) take(); else hist.timer = setTimeout(take, 400); // печать слова — один шаг
}
function histGo(dir) {
  const el = document.getElementById('ed');
  if (!el) return false;
  clearTimeout(hist.timer); snap(el, true);
  const j = hist.i + dir;
  if (j < 0 || j >= hist.stack.length) return false;
  hist.i = j; hist.lock = true;
  el.innerHTML = hist.stack[j].html; setCaret(el, hist.stack[j].caret); el.focus();
  el.dispatchEvent(new Event('input'));
  hist.lock = false;
  return false;
}
acts['ed.undo'] = () => histGo(-1);
acts['ed.redo'] = () => histGo(1);

// ---------- поиск и замена: все совпадения подсвечены, текущее — выделено, «3 из 12» ----------
const fnd = { list: [], i: -1 };
function findAll(q) {
  const el = document.getElementById('ed'), out = [];
  if (!el || !q) return out;
  const ql = q.toLowerCase(), w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const v = n.nodeValue.toLowerCase();
    for (let k = v.indexOf(ql); k >= 0; k = v.indexOf(ql, k + ql.length)) { const r = document.createRange(); r.setStart(n, k); r.setEnd(n, k + q.length); out.push(r); }
  }
  return out;
}
function showFind(focusEditor = false) {
  const q = document.getElementById('edq')?.value || '', out = document.getElementById('edfound');
  fnd.list = findAll(q);
  if (fnd.i >= fnd.list.length) fnd.i = fnd.list.length - 1;
  if (window.CSS?.highlights) {
    CSS.highlights.set('ed-find', new Highlight(...fnd.list));
    if (fnd.list[fnd.i]) CSS.highlights.set('ed-find-cur', new Highlight(fnd.list[fnd.i])); else CSS.highlights.delete('ed-find-cur');
  }
  if (out) out.textContent = !q ? '' : fnd.list.length ? `${fnd.i >= 0 ? fnd.i + 1 : 0} из ${fnd.list.length}` : 'не найдено';
  const r = fnd.list[fnd.i];
  if (r) {
    const rect = r.getBoundingClientRect();
    if (rect.top < 140 || rect.bottom > window.innerHeight - 80) window.scrollBy({ top: rect.top - window.innerHeight / 3, behavior: 'smooth' });
    if (focusEditor || !window.CSS?.highlights) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  }
}
const findStep = (dir) => { const q = document.getElementById('edq')?.value; if (!q) return false; fnd.list = findAll(q); if (!fnd.list.length) { fnd.i = -1; showFind(); return false; } fnd.i = (fnd.i + dir + fnd.list.length) % fnd.list.length; showFind(); return false; };
const clearFind = () => { if (window.CSS?.highlights) { CSS.highlights.delete('ed-find'); CSS.highlights.delete('ed-find-cur'); } fnd.list = []; fnd.i = -1; };
acts['ed.find'] = () => {
  const f = document.getElementById('edfind');
  if (!f) return false;
  f.hidden = !f.hidden;
  if (f.hidden) clearFind();
  else {
    const sel = String(window.getSelection() || '').trim(), q = document.getElementById('edq');
    if (sel && sel.length < 80 && q) q.value = sel;
    q?.focus(); q?.select(); fnd.i = -1; findStep(1);
  }
  return false;
};
acts['ed.findNext'] = () => findStep(1);
acts['ed.findPrev'] = () => findStep(-1);
acts['ed.replaceOne'] = () => {
  const el = document.getElementById('ed'), r = fnd.list[fnd.i], rep = document.getElementById('edr')?.value ?? '';
  if (!el || !r) return findStep(1);
  snap(el, true);
  r.deleteContents(); r.insertNode(document.createTextNode(rep)); el.normalize();
  el.dispatchEvent(new Event('input')); snap(el, true);
  fnd.i -= 1; findStep(1);
  return false;
};
acts['ed.replaceAll'] = () => {
  const q = document.getElementById('edq')?.value, rep = document.getElementById('edr')?.value ?? '', el = document.getElementById('ed');
  if (!q || !el) return false;
  snap(el, true);
  const list = findAll(q).reverse(); // с конца — диапазоны не сдвигаются
  for (const r of list) { r.deleteContents(); r.insertNode(document.createTextNode(rep)); }
  el.normalize();
  const out = document.getElementById('edfound'); if (out) out.textContent = list.length ? `заменено: ${list.length}` : 'не найдено';
  if (list.length) { el.dispatchEvent(new Event('input')); snap(el, true); }
  clearFind();
  return false;
};

// ---------- скопировать всю главу: с оформлением (для редакторов площадок) и простым текстом ----------
acts['ed.copy'] = async () => {
  const el = document.getElementById('ed');
  if (!el) return false;
  // без названия главы: «Глава 3.», «Пролог» и пустые строки после него в копию не идут
  const kids = [...el.children], empty = (n) => !n.textContent.trim();
  let k = 0;
  while (k < kids.length && empty(kids[k])) k++;
  if (kids[k] && (/^H[1-6]$/.test(kids[k].tagName) || isChapterTitle(kids[k].textContent))) { k++; while (k < kids.length && empty(kids[k])) k++; }
  const body = kids.slice(k), box = document.createElement('div');
  body.forEach((n) => box.append(n.cloneNode(true)));
  const text = blocksText(htmlToBlocks(box));
  const html = `<div>${body.map((b) => `<${b.tagName.toLowerCase()}${b.getAttribute('style') ? ` style="${b.getAttribute('style')}"` : ''}>${b.innerHTML}</${b.tagName.toLowerCase()}>`).join('')}</div>`;
  try {
    if (window.ClipboardItem && navigator.clipboard?.write) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    else await navigator.clipboard.writeText(text);
    toast('Глава скопирована — без названия');
  } catch {
    const r = document.createRange(); r.selectNodeContents(el); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('copy'); toast('Скопировано всё, вместе с названием');
  }
  return false;
};

acts['ed.save'] = () => { save(); return false; };
// выделение цветом: тёмно-изумрудный, как в Google Документе; на уже выделенном — снимает цвет
const MARK = '#0b6b4f', CLEAR = '#010203';
function colorSel() {
  const el = document.getElementById('ed'), sel = window.getSelection();
  if (!el || !sel.rangeCount || sel.isCollapsed || !el.contains(sel.anchorNode)) { toast('Выделите текст, который пометить цветом'); return false; }
  const at = (n) => (n.nodeType === 3 ? n.parentElement : n)?.closest?.('[data-c]');
  const on = [sel.anchorNode, sel.focusNode].every((n) => at(n)?.getAttribute('data-c') === MARK);
  snap(el, true);
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('foreColor', false, on ? CLEAR : MARK);
  for (const sp of el.querySelectorAll('[style*="color"], font[color]')) {
    const c = cssHex(sp.style.color) || (sp.getAttribute('color') || '').toLowerCase();
    if (c === CLEAR) { sp.style.color = ''; sp.removeAttribute('data-c'); sp.removeAttribute('color'); if (!sp.getAttribute('style')) sp.removeAttribute('style'); if (sp.tagName === 'SPAN' && !sp.attributes.length) sp.replaceWith(...sp.childNodes); }
    else if (c === MARK) sp.setAttribute('data-c', MARK);
  }
  el.dispatchEvent(new Event('input')); snap(el, true);
  return false;
}
acts['ed.color'] = () => colorSel();
acts['ed.fmt'] = (d) => { const el = document.getElementById('ed'); el?.focus(); snap(el, true); document.execCommand(d.v); el?.dispatchEvent(new Event('input')); snap(el, true); return false; };
acts['ed.align'] = (d) => { const el = document.getElementById('ed'); snap(el, true); for (const b of selectedBlocks()) b.style.textAlign = d.v === 'left' ? 'left' : d.v; el?.dispatchEvent(new Event('input')); snap(el, true); return false; };
acts['ed.dash'] = () => { document.getElementById('ed')?.focus(); document.execCommand('insertText', false, '— '); return false; };
acts['ed.zoom'] = (d) => { const z = Math.min(1.6, Math.max(0.8, +(pref('zoom', 1) + Number(d.v) * 0.1).toFixed(1))); setPref('zoom', z); document.getElementById('ed')?.style.setProperty('--ed-zoom', z); return false; };
acts['ed.focus'] = () => { document.documentElement.classList.toggle('ed-focus'); document.getElementById('ed')?.focus(); return false; };
// ---------- новая глава: вкладка в Google Документе сразу за последней главой ----------
acts['ch.add'] = async (d) => {
  const b = app().ctx().wbooksById[d.id];
  if (!b?.fileId) return false;
  let plan;
  try { await drive.ensureToken(); plan = nextChapterTab(await drive.getDoc(b.fileId)); } catch (e) { toast('Не получилось открыть документ: ' + e.message); return false; }
  openSheet('Новая глава', `<label>Название вкладки<input name="t" value="${esc(plan.title)}" required autocomplete="off"></label>
    <p class="small muted" style="margin:6px 0 0">Появится отдельной вкладкой в Google Документе — сразу после последней главы — и откроется здесь, в редакторе.</p>`, async (fd) => {
    const title = String(fd.get('t') || '').trim();
    if (!title) return false;
    const have = (b.tabs || []).some((t) => t.title === title);
    if (have) { toast('Вкладка с таким названием уже есть'); return false; }
    try {
      const { title: _, ...where } = plan;
      await drive.docAddTab(b.fileId, { title, ...where });
    } catch (e) { toast('Google Документ не дал создать вкладку: ' + e.message); return false; }
    // в списке глав книги — сразу после последней главы, чтобы не ждать обновления с Диска
    const tabs = [...(b.tabs || [])];
    let k = -1; tabs.forEach((t, j) => { if (/^\s*(пролог|глава)/i.test(t.title)) k = j; });
    tabs.splice(k + 1 || tabs.length, 0, { title, chars: 0, counted: true });
    await app().store.put('w_books', { ...b, tabs });
    toast(`«${title}» создана`);
    app().go(`/ed/${b.id}/${encodeURIComponent(title)}`);
  }, { submitText: 'Создать' });
  return false;
};
acts['ed.goto'] = (d) => { clearFind(); app().go(`/ed/${ed.bookId}/${encodeURIComponent(d.t)}`); };
acts['ed.back'] = (d) => { document.documentElement.classList.remove('ed-focus'); app().go('/book/' + d.id); };
acts['ed.reload'] = () => { const k = ed?.key; ed = null; if (k) app().rerender(); };
acts['ed.useDraft'] = () => { ed.html = ed.draft.html; ed.draft = null; ed.dirty = true; app().rerender(); };
acts['ed.dropDraft'] = () => { ls.del(draftKey(ed.key)); ed.draft = null; app().rerender(); };
import { changes } from '../../../js/ui.js';
changes['ed.pick'] = (v) => app().go(`/ed/${ed.bookId}/${encodeURIComponent(v)}`);
changes['ed.auto'] = (v, el) => { setPref('auto', el.checked); toast(el.checked ? 'Автосохранение включено: через полминуты после правки' : 'Автосохранение выключено'); };
changes['ed.style'] = (v) => {
  const el = document.getElementById('ed');
  el?.focus(); snap(el, true);
  const tag = TAG[v] || 'p';
  for (const b of selectedBlocks()) {
    if (b.tagName.toLowerCase() === tag) continue;
    const nb = document.createElement(tag);
    for (const a of b.attributes) nb.setAttribute(a.name, a.value);
    // у заголовков — свой вид из стиля Документа: отступ первой строки обычного текста им не нужен
    nb.style.textIndent = tag === 'p' ? b.style.textIndent : '';
    nb.innerHTML = b.innerHTML;
    b.replaceWith(nb);
  }
  el?.dispatchEvent(new Event('input'));
};
// горячие клавиши: Ctrl+S — сохранить, Ctrl+F — найти, Esc — выйти из фокуса
document.addEventListener('keydown', (e) => {
  if (!document.getElementById('ed')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); save(); }
  else if (mod && k === 'f') { e.preventDefault(); const f = document.getElementById('edfind'); if (f?.hidden) acts['ed.find'](); else document.getElementById('edq')?.focus(); }
  else if (mod && (k === 'z' || k === 'я') && e.target.id === 'ed') { e.preventDefault(); histGo(e.shiftKey ? 1 : -1); }
  else if (mod && (k === 'y' || k === 'н') && e.target.id === 'ed') { e.preventDefault(); histGo(1); }
  else if (mod && e.shiftKey && (k === 'e' || k === 'у') && e.target.id === 'ed') { e.preventDefault(); colorSel(); }
  else if (e.key === 'Escape') document.documentElement.classList.remove('ed-focus');
});
export const editorDirty = () => !!ed?.dirty;
export { ic };
