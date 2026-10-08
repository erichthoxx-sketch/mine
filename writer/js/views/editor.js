// Редактор главы прямо в приложении: глава подтягивается из вкладки Google Документа,
// пишем здесь (черновик хранится на устройстве), по кнопке — сохраняем обратно во вкладку.
import { esc, acts, toast, ask } from '../../../js/ui.js';
import { fmtDate } from '../../../js/format.js';
import { ic } from '../../../js/icons.js';
import * as drive from '../drive.js';
import { findTab, contentToBlocks, blocksText, contentEnd, saveRequests } from '../docedit.js';
import { al } from '../wcalc.js';

const app = () => window.__app;
let ed = null; // { key, bookId, title, tabId, status, html, baseText, dirty, savedAt, err, draft }
const draftKey = (k) => 'ed:' + k;
const ls = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* память недоступна */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ок */ } },
};

// ---------- абзацы ⇄ HTML редактора ----------
const runHtml = (r) => { let h = esc(r.t); if (r.i) h = `<i>${h}</i>`; if (r.b) h = `<b>${h}</b>`; return h; };
export const blocksToHtml = (blocks) => (blocks.length ? blocks : [{ runs: [] }]).map((p) => `<p>${p.runs.map(runHtml).join('') || '<br>'}</p>`).join('');
function htmlToBlocks(root) {
  const blocks = [];
  let cur = [];
  const push = () => { blocks.push({ runs: cur }); cur = []; };
  const walk = (node, b, i) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { if (n.nodeValue) cur.push({ t: n.nodeValue, b, i }); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'BR') { if (n !== n.parentNode.lastChild || n.parentNode === root) push(); continue; }
      const nb = b || tag === 'B' || tag === 'STRONG' || /bold|[6-9]00/.test(n.style?.fontWeight || '');
      const ni = i || tag === 'I' || tag === 'EM' || n.style?.fontStyle === 'italic';
      const block = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(tag);
      if (block && cur.length) push();
      walk(n, nb, ni);
      if (block) push();
    }
  };
  walk(root, false, false);
  if (cur.length) push();
  while (blocks.length > 1 && !blocks[blocks.length - 1].runs.length) blocks.pop();
  // склеиваем куски с одинаковым оформлением
  return blocks.map((p) => ({ runs: p.runs.reduce((a, r) => { const l = a[a.length - 1]; if (l && l.b === r.b && l.i === r.i) l.t += r.t; else a.push({ ...r }); return a; }, []) }));
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
    const blocks = contentToBlocks(content);
    const draft = ls.get(draftKey(key));
    ed = { key, bookId: b.id, title, tabId: tab?.tabProperties?.tabId || '', status: 'ready', html: blocksToHtml(blocks), baseText: blocksText(blocks), dirty: false, draft: draft && draft.text !== blocksText(blocks) ? draft : null };
  } catch (e) { ed = { key, bookId: b.id, title, status: 'error', err: e.message }; }
  if (app().ui.route.startsWith('/ed/')) app().rerender();
}

export function editorView(a, bookId, title) {
  const c = a.ctx(), b = c.wbooksById[bookId];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p></div>' };
  const key = `${bookId}:${title}`;
  if (!ed || ed.key !== key) load(key, b, title);
  const back = `<p><a class="btn back" href="#" data-act="go" data-to="/book/${b.id}">← К книге</a></p>`;
  if (ed.status === 'loading') return { html: `${back}<div class="card"><p class="muted" style="margin:0">Загружаю «${esc(title)}» из Google Документа…</p></div>` };
  if (ed.status === 'error') return { html: `${back}<div class="card"><p style="margin-top:0">Не получилось открыть главу: ${esc(ed.err)}</p><button data-act="ed.reload">Попробовать ещё раз</button></div>` };
  const html = `${back}
  <div class="ed-head"><h2 style="margin:0">${esc(title)}</h2><span class="small muted" id="edstat">${statusText()}</span></div>
  ${ed.draft ? `<div class="alert alert-thin ed-draft">На этом устройстве есть несохранённый черновик от ${fmtDate(ed.draft.at.slice(0, 10))} ${ed.draft.at.slice(11, 16)}. <button class="link" data-act="ed.useDraft">Открыть черновик</button> <button class="link" data-act="ed.dropDraft">Отбросить</button></div>` : ''}
  <div class="ed-tools"><button data-act="ed.fmt" data-v="bold" aria-label="Жирный" title="Жирный"><b>Ж</b></button><button data-act="ed.fmt" data-v="italic" aria-label="Курсив" title="Курсив"><i>К</i></button><span class="small muted" id="edvol"></span></div>
  <div class="editor" id="ed" contenteditable="true" spellcheck="true" lang="ru">${ed.html}</div>
  <div class="ed-foot"><button class="primary" data-act="ed.save">Сохранить в Google Документ</button></div>
  <p class="small muted">Сохраняются абзацы, жирный и курсив. Комментарии и особое оформление главы при сохранении отсюда не переносятся — финальную вычитку лучше делать в самом Google Документе.</p>`;
  return { html, after: wire };
}
function statusText() {
  if (!ed || ed.status !== 'ready') return '';
  if (ed.dirty) return 'не сохранено в Документ · черновик на устройстве';
  return ed.savedAt ? `сохранено в Google Документе в ${ed.savedAt}` : 'как в Google Документе';
}
let draftTimer;
function wire() {
  const el = document.getElementById('ed');
  if (!el) return;
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { /* старый браузер */ }
  const vol = () => { const v = document.getElementById('edvol'); if (v) v.textContent = al(blocksText(htmlToBlocks(el)).replace(/\n/g, '').length); };
  vol();
  el.addEventListener('input', () => {
    ed.html = el.innerHTML; ed.dirty = true;
    const st = document.getElementById('edstat'); if (st) st.textContent = statusText();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => { ls.set(draftKey(ed.key), { html: ed.html, text: blocksText(htmlToBlocks(el)), at: new Date().toISOString() }); vol(); }, 600);
  });
  // вставка — только текстом, без чужого оформления
  el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain')); });
  // кнопки форматирования не должны забирать фокус у текста
  document.querySelector('.ed-tools')?.addEventListener('mousedown', (e) => e.preventDefault());
}

acts['ed.fmt'] = (d) => { document.execCommand(d.v); document.getElementById('ed')?.dispatchEvent(new Event('input')); return false; };
acts['ed.reload'] = () => { const k = ed?.key; ed = null; if (k) app().rerender(); };
acts['ed.useDraft'] = () => { ed.html = ed.draft.html; ed.draft = null; ed.dirty = true; app().rerender(); };
acts['ed.dropDraft'] = () => { ls.del(draftKey(ed.key)); ed.draft = null; app().rerender(); };
acts['ed.save'] = async () => {
  const el = document.getElementById('ed'), c = app().ctx(), b = c.wbooksById[ed.bookId];
  if (!el || !b) return;
  const blocks = htmlToBlocks(el);
  try {
    await drive.ensureToken();
    toast('Сохраняю…');
    // перед записью — свежая версия: если главу правили в Google Документах после открытия, спрашиваем
    const doc = await drive.getDoc(b.fileId);
    const tab = findTab(doc, ed.tabId || ed.title);
    const content = tab ? tab.documentTab?.body?.content : doc.body?.content;
    if (!content) throw new Error('вкладка главы не найдена');
    const now = blocksText(contentToBlocks(content));
    if (now !== ed.baseText && !(await ask('Эту главу изменили в Google Документе после того, как вы её открыли здесь. Сохранить вашу версию поверх?', 'Сохранить поверх'))) return;
    await drive.docUpdate(b.fileId, saveRequests(blocks, ed.tabId, contentEnd(content)));
    ed.baseText = blocksText(blocks); ed.html = el.innerHTML; ed.dirty = false;
    ed.savedAt = new Date().toTimeString().slice(0, 5);
    ls.del(draftKey(ed.key));
    const st = document.getElementById('edstat'); if (st) st.textContent = statusText();
    toast('Глава сохранена в Google Документ');
    // объём книги — заодно обновим
    try { const { refreshOne } = await import('./books.js'); await refreshOne(app(), app().ctx().wbooksById[b.id], true); } catch { /* не страшно */ }
  } catch (e) { toast('Не сохранилось: ' + e.message + ' Текст остался в черновике на устройстве.'); }
};
export const editorDirty = () => !!ed?.dirty;
export { ic };
