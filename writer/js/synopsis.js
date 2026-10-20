// Синопсис книги — один на всю Мастерскую: главный — вкладка «Синопсис» в Google Документе книги
// (её читает обновление книги → b.svc.synopsis); у книги без Документа — текст в самой Мастерской (b.synopsis).
// Изменить — в редакторе Мастерской прямо во вкладке Документа; нет вкладки — заводим её (с уже записанным текстом).
import { esc, acts, toast, openSheet } from '../../js/ui.js';
import * as drive from './drive.js';
import { saveRequests, findTab, contentEnd } from './docedit.js';

const app = () => window.__app;
const SYN = /^\s*синопсис/i;
export const isGDoc = (b) => !!b?.fileId && b.mimeType === drive.MIME.doc;
export const synTab = (b) => (b?.tabs || []).find((t) => SYN.test(t.title)) || null;
// вкладка пустая, а в Мастерской текст был записан раньше — показываем его (при «Редактировать» он ляжет во вкладку)
export const synText = (b) => String((synTab(b) && String(b.svc?.synopsis || '').trim()) || b?.synopsis || '').trim();
// откуда текст — для подписи
export function synSource(b) {
  const t = synTab(b);
  if (t) return `вкладка «${t.title}» в Google Документе`;
  return isGDoc(b) ? 'записан в Мастерской · вкладки «Синопсис» в Документе пока нет' : 'записан в Мастерской';
}

// изменить синопсис: в редакторе (вкладка Документа) или окном — для книги без Документа
export async function editSynopsis(bookId, back) {
  const b = app().ctx().wbooksById[bookId];
  if (!isGDoc(b)) {
    openSheet(`Синопсис — ${b.title}`, `<textarea name="synopsis" style="min-height:300px">${esc(b.synopsis || '')}</textarea>`, async (fd) => {
      await app().store.put('w_books', { ...b, synopsis: String(fd.get('synopsis') || '').trim() });
      toast('Синопсис сохранён');
    });
    return;
  }
  let t = synTab(b);
  const empty = t && !String(b.svc?.synopsis || '').trim() && String(b.synopsis || '').trim();
  if (!t || empty) {
    try {
      await drive.ensureToken();
      toast(t ? 'Переношу синопсис во вкладку Документа…' : 'Завожу вкладку «Синопсис» в Документе…');
      let tabId, end = 2;
      if (t) {
        const tab = findTab(await drive.getDoc(b.fileId), t.title);
        if (!tab) throw new Error('вкладка не найдена');
        tabId = tab.tabProperties.tabId; end = contentEnd(tab.documentTab?.body?.content || []) || 2;
      } else tabId = await drive.docAddTab(b.fileId, { title: 'Синопсис' });
      const lines = String(b.synopsis || '').split('\n').map((x) => x.trim()).filter(Boolean);
      if (lines.length) await drive.docUpdate(b.fileId, saveRequests(lines.map((l) => ({ st: {}, runs: [{ t: l }] })), tabId, end));
      const cur = app().ctx().wbooksById[bookId];
      const tabs = t ? cur.tabs : [...(cur.tabs || []), (t = { title: 'Синопсис', chars: lines.join('').length, counted: false })];
      await app().store.put('w_books', { ...cur, tabs, svc: { ...(cur.svc || {}), synopsis: lines.join('\n') } });
    } catch (e) { toast('Не получилось завести вкладку: ' + (e.message || e)); return; }
  }
  app().ui.edBack = back || '';
  app().go(`/ed/${bookId}/${encodeURIComponent(t.title)}`);
}
acts['syn.edit'] = (d) => { editSynopsis(d.id, d.back); return false; };
