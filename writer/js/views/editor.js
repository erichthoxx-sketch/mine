// Редактор главы: текст и оформление — как во вкладке Google Документа (стили абзацев, отступы, выравнивание,
// шрифт, жирный/курсив/подчёркнутый/зачёркнутый). Пишем здесь — черновик на устройстве, сохраняем в Документ по кнопке
// (Ctrl+S) или автоматически. Инструменты писателя: типографика («ёлочки», тире), поиск и замена, режим фокуса,
// статистика (слова, знаки, а.л., за сессию), переход между главами.
import { esc, acts, toast, ask } from '../../../js/ui.js';
import { fmtDate, num, plural } from '../../../js/format.js';
import { ic } from '../../../js/icons.js';
import * as drive from '../drive.js';
import { findTab, contentToBlocks, blocksText, contentEnd, saveRequests, namedStylesOf, textStats } from '../docedit.js';
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
      if (n.nodeType === 3) { if (n.nodeValue) cur.push({ t: n.nodeValue, b: f.b, i: f.i, u: f.u, s: f.s, ...(f.f ? { f: f.f } : {}), ...(f.z ? { z: f.z } : {}) }); continue; }
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
  const same = (a, b) => a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s && a.f === b.f && a.z === b.z;
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
  const zoom = pref('zoom', 1), auto = pref('auto', false);
  const html = `
  <div class="ed-bar">
    <div class="ed-nav">${back}
      <div class="ed-chapter">${prev ? `<button class="ed-ic" data-act="ed.goto" data-t="${esc(prev)}" title="${esc(prev)}" aria-label="Предыдущая глава">‹</button>` : ''}
        <select data-chg="ed.pick" aria-label="Глава">${chs.map((t) => `<option${t === title ? ' selected' : ''}>${esc(t)}</option>`).join('')}${i < 0 ? `<option selected>${esc(title)}</option>` : ''}</select>
        ${next ? `<button class="ed-ic" data-act="ed.goto" data-t="${esc(next)}" title="${esc(next)}" aria-label="Следующая глава">›</button>` : ''}</div>
      <span class="ed-status" id="edstat">${statusText()}</span>
      <label class="ed-auto" title="Сохранять в Google Документ само, через полминуты после правки"><input type="checkbox" data-chg="ed.auto"${auto ? ' checked' : ''}> автосохранение</label>
      <button class="primary" data-act="ed.save" title="Ctrl+S">Сохранить в Документ</button>
    </div>
    <div class="ed-tools" role="toolbar" aria-label="Оформление">
      <select data-chg="ed.style" class="ed-style" aria-label="Стиль абзаца">${STYLES.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="ed.fmt" data-v="bold" title="Жирный (Ctrl+B)"><b>Ж</b></button>
      <button class="ed-ic" data-act="ed.fmt" data-v="italic" title="Курсив (Ctrl+I)"><i>К</i></button>
      <button class="ed-ic" data-act="ed.fmt" data-v="underline" title="Подчёркнутый (Ctrl+U)"><u>Ч</u></button>
      <button class="ed-ic" data-act="ed.fmt" data-v="strikeThrough" title="Зачёркнутый"><s>З</s></button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="ed.align" data-v="left" title="По левому краю">${alignIc('left')}</button>
      <button class="ed-ic" data-act="ed.align" data-v="center" title="По центру">${alignIc('center')}</button>
      <button class="ed-ic" data-act="ed.align" data-v="right" title="По правому краю">${alignIc('right')}</button>
      <button class="ed-ic" data-act="ed.align" data-v="justify" title="По ширине">${alignIc('justify')}</button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="ed.dash" title="Тире для диалога">—</button>
      <button class="ed-ic" data-act="ed.fmt" data-v="undo" title="Отменить (Ctrl+Z)">↶</button>
      <button class="ed-ic" data-act="ed.fmt" data-v="redo" title="Повторить (Ctrl+Shift+Z)">↷</button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="ed.find" title="Найти и заменить (Ctrl+F)">⌕</button>
      <button class="ed-ic" data-act="ed.zoom" data-v="-1" title="Мельче">A−</button>
      <button class="ed-ic" data-act="ed.zoom" data-v="1" title="Крупнее">A+</button>
      <button class="ed-ic" data-act="ed.focus" title="Режим фокуса (Esc — выйти)">⛶</button>
    </div>
    <div class="ed-find" id="edfind" hidden><input id="edq" placeholder="Найти" aria-label="Найти"><input id="edr" placeholder="Заменить на" aria-label="Заменить на">
      <button class="small-btn" data-act="ed.findNext">Найти</button><button class="small-btn" data-act="ed.replaceAll">Заменить все</button><span class="small muted" id="edfound"></span></div>
  </div>
  ${ed.draft ? `<div class="alert alert-thin ed-draft">На этом устройстве есть несохранённый черновик от ${fmtDate(ed.draft.at.slice(0, 10))} ${ed.draft.at.slice(11, 16)}. <button class="link" data-act="ed.useDraft">Открыть черновик</button> <button class="link" data-act="ed.dropDraft">Отбросить</button></div>` : ''}
  <div class="ed-paper"><div class="editor" id="ed" contenteditable="true" spellcheck="true" lang="ru" style="--ed-zoom:${zoom};${ed.font ? `font-family:'${esc(ed.font)}',Georgia,'Times New Roman',serif` : ''}">${ed.html}</div></div>
  <div class="ed-stats" id="edstats"></div>`;
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
  box.innerHTML = `<span><b>${num(s.words)}</b> ${plural(s.words, ['слово', 'слова', 'слов'])}</span><span><b>${num(s.chars)}</b> зн.</span><span><b>${alNum(s.chars)}</b> а.л.</span><span>за сессию <b class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : '−'}${num(Math.abs(diff))}</b> зн.</span>`;
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
    if (pref('auto', false)) autoTimer = setTimeout(() => save({ auto: true }), 30000);
  };
  el.addEventListener('input', changed);
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

acts['ed.save'] = () => save();
acts['ed.fmt'] = (d) => { document.getElementById('ed')?.focus(); document.execCommand(d.v); document.getElementById('ed')?.dispatchEvent(new Event('input')); return false; };
acts['ed.align'] = (d) => { for (const b of selectedBlocks()) b.style.textAlign = d.v === 'left' ? 'left' : d.v; document.getElementById('ed')?.dispatchEvent(new Event('input')); };
acts['ed.dash'] = () => { document.getElementById('ed')?.focus(); document.execCommand('insertText', false, '— '); };
acts['ed.zoom'] = (d) => { const z = Math.min(1.6, Math.max(0.8, +(pref('zoom', 1) + Number(d.v) * 0.1).toFixed(1))); setPref('zoom', z); document.getElementById('ed')?.style.setProperty('--ed-zoom', z); };
acts['ed.focus'] = () => { document.documentElement.classList.toggle('ed-focus'); document.getElementById('ed')?.focus(); };
acts['ed.find'] = () => { const f = document.getElementById('edfind'); if (f) { f.hidden = !f.hidden; if (!f.hidden) document.getElementById('edq')?.focus(); } };
acts['ed.findNext'] = () => {
  const q = document.getElementById('edq')?.value;
  if (!q) return;
  const ok = window.find ? window.find(q, false, false, true) : false;
  const out = document.getElementById('edfound'); if (out) out.textContent = ok ? '' : 'не найдено';
};
acts['ed.replaceAll'] = () => {
  const q = document.getElementById('edq')?.value, r = document.getElementById('edr')?.value ?? '', el = document.getElementById('ed');
  if (!q || !el) return;
  let n = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) { const parts = t.nodeValue.split(q); if (parts.length > 1) { n += parts.length - 1; t.nodeValue = parts.join(r); } }
  const out = document.getElementById('edfound'); if (out) out.textContent = n ? `заменено: ${n}` : 'не найдено';
  if (n) el.dispatchEvent(new Event('input'));
};
acts['ed.goto'] = (d) => app().go(`/ed/${ed.bookId}/${encodeURIComponent(d.t)}`);
acts['ed.back'] = (d) => { document.documentElement.classList.remove('ed-focus'); app().go('/book/' + d.id); };
acts['ed.reload'] = () => { const k = ed?.key; ed = null; if (k) app().rerender(); };
acts['ed.useDraft'] = () => { ed.html = ed.draft.html; ed.draft = null; ed.dirty = true; app().rerender(); };
acts['ed.dropDraft'] = () => { ls.del(draftKey(ed.key)); ed.draft = null; app().rerender(); };
import { changes } from '../../../js/ui.js';
changes['ed.pick'] = (v) => app().go(`/ed/${ed.bookId}/${encodeURIComponent(v)}`);
changes['ed.auto'] = (v, el) => { setPref('auto', el.checked); toast(el.checked ? 'Автосохранение включено: через полминуты после правки' : 'Автосохранение выключено'); };
changes['ed.style'] = (v) => {
  const el = document.getElementById('ed');
  el?.focus();
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
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); acts['ed.find'](); }
  else if (e.key === 'Escape') document.documentElement.classList.remove('ed-focus');
});
export const editorDirty = () => !!ed?.dirty;
export { ic };
