// Аннотация, синопсис и рукопись прямо из Google Документа книги: посмотреть, скопировать, скачать Word / PDF.
// Рукопись — одним файлом в оформлении для издательства; пакет для издательства — рукопись + синопсис.
import { esc, acts, toast, openSheet, download } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import * as drive from '../drive.js';
import { manuscriptParas, serviceParas, docxBlob, printHtml, parasHtml, isServiceTab, SERVICE } from '../publish.js';
import { isBookTab, alNum, contestFileName } from '../wcalc.js';

const app = () => window.__app;
const NAME = { synopsis: 'Синопсис', annotation: 'Аннотация' };
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|«»]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
// имя скачиваемого файла — латиницей: с русскими буквами некоторые браузеры сохраняют его как «download» без расширения
// (внутри архива файлы называются по-русски)
const TR = ['a', 'b', 'v', 'g', 'd', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'h', 'ts', 'ch', 'sh', 'sch', '', 'y', '', 'e', 'yu', 'ya'];
const latin = (s) => String(s || '').toLowerCase().replace(/[а-яё]/g, (ch) => (ch === 'ё' ? 'e' : TR[ch.charCodeAt(0) - 1072] ?? '')).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'kniga';
const isGDoc = (b) => !!b.fileId && b.mimeType === drive.MIME.doc;

// документ книги — не чаще раза в 2 минуты
const cache = new Map();
async function docOf(b) {
  const hit = cache.get(b.fileId);
  if (hit && Date.now() - hit.at < 120000) return hit.doc;
  await drive.ensureToken();
  const doc = await drive.getDoc(b.fileId);
  cache.set(b.fileId, { at: Date.now(), doc });
  return doc;
}
const fallbackOf = (b, kind) => (kind === 'synopsis' ? b.synopsis : (b.promo || {}).annotation) || '';
const meta = (b) => ({ title: b.title, author: app().ctx().settings.pseudonym || '' });
async function service(b, kind) {
  const doc = isGDoc(b) ? await docOf(b) : null;
  const r = serviceParas(doc, kind, { ...meta(b), fallback: fallbackOf(b, kind) });
  if (!r.found) throw new Error(`${NAME[kind]} не найден${kind === 'synopsis' ? '' : 'а'}: заведите вкладку «${NAME[kind]}» в Google Документе книги`);
  return r;
}
const run = async (fn) => { try { return await fn(); } catch (e) { toast(e.message || String(e)); return null; } };

// что есть у книги (для подписи в карточке) — по вкладкам, без загрузки документа
export function svcInfo(b, kind) {
  const t = (b.tabs || []).find((x) => SERVICE[kind].test(x.title));
  if (t) return { ok: t.chars > 0, sub: t.chars > 0 ? `${t.chars > 3000 ? alNum(t.chars) + ' а.л.' : t.chars + ' зн.'} · вкладка «${esc(t.title)}»` : `вкладка «${esc(t.title)}» пустая` };
  const f = fallbackOf(b, kind).trim();
  return f ? { ok: true, sub: `${f.length} зн. · записан${kind === 'synopsis' ? '' : 'а'} в Мастерской` } : { ok: false, sub: isGDoc(b) ? `нет вкладки «${NAME[kind]}» в Документе` : 'пока нет' };
}
export function manuscriptInfo(b) {
  const tabs = (b.tabs || []).filter((t) => isBookTab(t.title) && !/^\s*от автора/i.test(t.title));
  if (isGDoc(b)) return { ok: tabs.length > 0, sub: tabs.length ? `${tabs.length} ${tabs.length % 10 === 1 && tabs.length % 100 !== 11 ? 'глава' : [2, 3, 4].includes(tabs.length % 10) && ![12, 13, 14].includes(tabs.length % 100) ? 'главы' : 'глав'} · ${alNum(tabs.reduce((a, t) => a + (t.chars || 0), 0))} а.л. · одним файлом, как просят издательства` : 'глав пока нет' };
  return b.fileId ? { ok: true, sub: 'файл книги с Диска, как есть' } : { ok: false, sub: 'файл книги не подключён' };
}

// ---------- карточки на странице книги ----------
const btn = (act, id, k, icon, title) => `<button class="ed-ic" data-act="${act}" data-id="${id}" data-k="${k}" title="${title}" aria-label="${title}">${ic(icon)}</button>`;
export function textsCard(b) {
  const row = (k) => { const s = svcInfo(b, k); return `<div class="svc-row"><a href="#" class="svc-name tap" data-act="svc.view" data-id="${b.id}" data-k="${k}"><b>${NAME[k]}</b><span class="sub">${s.sub}</span></a>
    <span class="svc-btns">${s.ok ? `${btn('svc.view', b.id, k, 'eye', 'Посмотреть')}${btn('svc.copy', b.id, k, 'copy', 'Скопировать')}${btn('svc.docx', b.id, k, 'download', 'Скачать Word')}` : ''}</span></div>`; };
  return `<div class="card svc-card"><h2>Аннотация и синопсис</h2>${row('annotation')}${row('synopsis')}</div>`;
}
export function publisherCard(b) {
  const m = manuscriptInfo(b), s = svcInfo(b, 'synopsis');
  return `<div class="card svc-card"><h2>Для издательства</h2>
    <div class="svc-row"><span class="svc-name"><b>Рукопись</b><span class="sub">${m.sub}</span></span><span class="svc-btns">${m.ok ? `<button class="small-btn" data-act="pub.manuscript" data-id="${b.id}">Word</button>` : ''}</span></div>
    <div class="svc-row"><span class="svc-name"><b>Синопсис</b><span class="sub">${s.sub}</span></span><span class="svc-btns">${s.ok ? `<button class="small-btn" data-act="svc.docx" data-id="${b.id}" data-k="synopsis">Word</button><button class="small-btn" data-act="svc.pdf" data-id="${b.id}" data-k="synopsis">PDF</button>` : ''}</span></div>
    <p class="small muted" style="margin:10px 0 0">Times New Roman 12, интервал 1,5, отступ абзаца 1,25 см, A4, номера страниц, титульный лист; каждая глава — с новой страницы.</p>
    <div class="row" style="margin-top:12px"><button class="primary" data-act="mk.pubZip" data-id="${b.id}"${m.ok || s.ok ? '' : ' disabled'}>Скачать пакет для издательства</button></div></div>`;
}

// ---------- действия ----------
const bookOf = (d) => app().ctx().wbooksById[d.id];
const htmlOf = (paras) => parasHtml(paras);
async function copyText(text, html) {
  try {
    if (html && window.ClipboardItem && navigator.clipboard?.write) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    else await navigator.clipboard.writeText(text);
    return true;
  } catch { return false; }
}
acts['svc.view'] = async (d) => run(async () => {
  const b = bookOf(d), r = await service(b, d.k);
  openSheet(`${NAME[d.k]} — ${b.title}`, `<div class="svc-text">${htmlOf(r.body)}</div>
    <div class="row" style="margin-top:12px"><button class="small-btn" data-act="svc.copy" data-id="${b.id}" data-k="${d.k}">Скопировать</button>
    <button class="small-btn" data-act="svc.docx" data-id="${b.id}" data-k="${d.k}">Скачать Word</button><button class="small-btn" data-act="svc.pdf" data-id="${b.id}" data-k="${d.k}">PDF</button></div>`, null);
});
acts['svc.copy'] = async (d) => run(async () => {
  const b = bookOf(d), r = await service(b, d.k);
  toast((await copyText(r.text, htmlOf(r.body))) ? `${NAME[d.k]} скопирован${d.k === 'synopsis' ? '' : 'а'}` : 'Не получилось скопировать');
});
acts['svc.docx'] = async (d) => run(async () => {
  const b = bookOf(d), r = await service(b, d.k);
  const blob = await docxBlob(await drive.loadJsZip(), r.paras, meta(b));
  if (await download(`${latin(b.title)}_${d.k === 'synopsis' ? 'sinopsis' : 'annotatsiya'}.docx`, blob, blob.type)) toast('Файл скачан');
});
// PDF — страница для печати: в окне печати выбрать «Сохранить как PDF»
acts['svc.pdf'] = async (d) => {
  const w = window.open('', '_blank'); // открываем сразу, пока браузер считает это нажатием
  if (!w) { toast('Браузер не дал открыть окно — разрешите всплывающие окна для сайта'); return; }
  w.document.write('<p style="font:14px sans-serif;padding:24px">Готовлю PDF…</p>');
  const r = await run(async () => service(bookOf(d), d.k));
  if (!r) { w.close(); return; }
  const b = bookOf(d);
  w.document.open(); w.document.write(printHtml(r.paras, `${b.title} — ${NAME[d.k].toLowerCase()}`)); w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 400);
};
async function manuscriptFile(b, maxChapters = 0) {
  if (isGDoc(b)) {
    const r = manuscriptParas(await docOf(b), { ...meta(b), maxChapters });
    if (!r.chapters) throw new Error('В Документе не нашлось глав (вкладок «Пролог», «Глава …», «Эпилог»)');
    return [`${safe(b.title)} — рукопись.docx`, await docxBlob(await drive.loadJsZip(), r.paras, meta(b))];
  }
  if (b.fileId) { await drive.ensureToken(); return [`${safe(b.title)} — рукопись.docx`, await drive.fileBlob({ id: b.fileId, mimeType: b.mimeType || drive.MIME.docx })]; }
  throw new Error('Файл книги не подключён');
}
acts['pub.manuscript'] = async (d) => run(async () => {
  const b = bookOf(d);
  toast('Собираю рукопись…');
  const [, blob] = await manuscriptFile(b);
  if (await download(`${latin(b.title)}_rukopis.docx`, blob, blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) toast('Рукопись скачана');
});
// пакет для издательства: рукопись + синопсис (аннотация издательству не нужна)
acts['mk.pubZip'] = async (d) => run(async () => {
  const b = bookOf(d), files = [], errs = [];
  toast('Собираю пакет…');
  try { files.push(await manuscriptFile(b)); } catch (e) { errs.push('рукопись: ' + e.message); }
  try { const r = await service(b, 'synopsis'); files.push([`${safe(b.title)} — синопсис.docx`, await docxBlob(await drive.loadJsZip(), r.paras, meta(b))]); } catch (e) { errs.push('синопсис: ' + e.message); }
  if (!files.length) throw new Error('Нечего собрать — ' + errs.join('; '));
  const Zip = await drive.loadJsZip(), z = new Zip();
  for (const [n, blob] of files) z.file(n, blob);
  const zip = await z.generateAsync({ type: 'blob' });
  if (await download(`izdatelstvo_${latin(b.title)}.zip`, zip, 'application/zip')) toast(errs.length ? `Скачано, но ${errs.join('; ')}` : 'Пакет скачан: рукопись и синопсис');
});

// для конкурса: текст (или первые N глав) и синопсис — с именем файла, как просят в условиях
acts['ct.dl'] = async (d) => run(async () => {
  const b = bookOf(d), x = app().ctx().data.w_contests.find((i) => i.id === d.c);
  if (!b || !x) return;
  const nm = contestFileName(x, b, d.k, meta(b).author);
  if (d.k === 'synopsis') {
    const r = await service(b, 'synopsis'), blob = await docxBlob(await drive.loadJsZip(), r.paras, meta(b));
    if (await download(`${nm || latin(b.title) + '_sinopsis'}.docx`, blob, blob.type)) toast('Синопсис скачан');
    return;
  }
  const n = Number(x.chapters) || 0;
  toast(n ? `Собираю первые главы: ${n}…` : 'Собираю текст…');
  const [, blob] = await manuscriptFile(b, n);
  if (await download(`${nm || latin(b.title) + (n ? '_glavy_1_' + n : '_tekst')}.docx`, blob, blob.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')) toast(n ? `Скачано: первые главы (${n})` : 'Текст скачан');
});

export { isServiceTab };
