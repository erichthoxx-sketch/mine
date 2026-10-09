// Файлы для издательства из Google Документа: рукопись одним файлом, синопсис, аннотация.
// Абзацы — точно как в Документе: отступ первой строки, отступ слева, интервалы до и после, межстрочный, выравнивание,
// пустые строки. Шрифт — Times New Roman 12 (стандарт издательств), A4, поля 3 / 1,5 / 2 / 2 см, номера страниц;
// у рукописи — титульный лист, каждая глава — с новой страницы.
// Чистые функции (абзацы, XML) — без DOM и сети; упаковка в .docx — через JSZip, который передаём снаружи.
import { contentToBlocks, isChapterTitle, namedStylesOf } from './docedit.js';
import { isBookTab, AL } from './wcalc.js';

// все вкладки по порядку (вложенные — сразу после родителя)
export function allTabs(doc) {
  const out = [];
  const walk = (list) => { for (const t of list || []) { out.push(t); walk(t.childTabs); } };
  walk(doc?.tabs);
  return out;
}
// служебные вкладки: синопсис, аннотация — ищем по началу названия
export const SERVICE = { synopsis: /^\s*синопсис/i, annotation: /^\s*аннотац/i };
export const isServiceTab = (title) => Object.values(SERVICE).some((re) => re.test(title || ''));
export function serviceTab(doc, kind) { return allTabs(doc).find((t) => SERVICE[kind].test(t.tabProperties?.title || '')) || null; }

const textOf = (p) => p.runs.map((r) => r.t).join('');
const isEmpty = (p) => !textOf(p).trim();
// стиль абзаца как в Документе: «обычный текст» / заголовок по умолчанию + свои значения абзаца
const effSt = (p, named) => ({ ...(named.NORMAL_TEXT?.st || {}), ...(p.st?.n ? named[p.st.n]?.st || {} : {}), ...(p.st || {}) });
const runsOf = (p, named) => {
  const nr = p.st?.n ? named[p.st.n]?.run || {} : {};
  return p.runs.map((r) => ({ t: r.t, b: r.b || !!nr.b, i: r.i || !!nr.i, u: r.u, s: r.s, ...(p.st?.n && (r.z || nr.z) ? { z: r.z || nr.z } : {}) }));
};
// абзацы Документа → абзацы файла один к одному (пустые строки внутри — тоже); пустые в начале и в конце — убираем
function bodyParas(blocks, named = {}) {
  let a = 0, z = blocks.length;
  while (a < z && isEmpty(blocks[a])) a++;
  while (z > a && isEmpty(blocks[z - 1])) z--;
  return blocks.slice(a, z).map((p) => {
    const st = effSt(p, named);
    return { kind: 'p', ps: { a: st.a || '', fi: st.fi ?? 0, il: st.il ?? 0, sa: st.sa ?? 0, sb: st.sb ?? 0, ls: st.ls ?? 115 }, runs: runsOf(p, named) };
  });
}
const plainTitle = (t) => String(t || '').trim().replace(/[.\s]+$/, '');

// главы книги: Пролог, Главы, Эпилог («От автора» в рукопись не идёт). Название главы — из первой строки,
// если она похожа на название, иначе — название вкладки
export function chaptersOf(doc) {
  const out = [];
  for (const t of allTabs(doc)) {
    const title = t.tabProperties?.title || '';
    if (!isBookTab(title) || /^\s*от автора/i.test(title)) continue;
    const named = namedStylesOf(t), blocks = contentToBlocks(t.documentTab?.body?.content);
    const paras = bodyParas(blocks, named);
    const first = paras[0], firstText = first ? first.runs.map((r) => r.t).join('') : '';
    let head = plainTitle(title);
    if (first && (isChapterTitle(firstText) || plainTitle(firstText) === plainTitle(title))) { head = plainTitle(firstText); first.pageBreak = true; first.title = true; }
    else paras.unshift({ kind: 'h', pageBreak: true, runs: [{ t: head }] });
    out.push({ title: head, paras, chars: blocks.reduce((a, p) => a + textOf(p).replace(/\n/g, '').length, 0) });
  }
  return out;
}
const alTxt = (chars) => `${(chars / AL).toFixed(1).replace('.', ',')} а.л.`;
const grp = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// рукопись: титульный лист + главы с новой страницы
export function manuscriptParas(doc, { title, author }) {
  const chs = chaptersOf(doc), chars = chs.reduce((a, c) => a + c.chars, 0);
  const paras = [
    { kind: 'author', runs: [{ t: author || '' }] },
    { kind: 'title', runs: [{ t: title }] },
    { kind: 'meta', runs: [{ t: `Объём: ${alTxt(chars)} (${grp(chars)} знаков с пробелами)` }] },
  ];
  for (const ch of chs) paras.push(...ch.paras);
  return { paras, chapters: chs.length, chars };
}
// синопсис или аннотация — ровно как во вкладке Документа
export function serviceParas(doc, kind, { fallback = '' } = {}) {
  const t = serviceTab(doc, kind);
  const blocks = t ? contentToBlocks(t.documentTab?.body?.content) : String(fallback || '').split('\n').map((x) => ({ st: {}, runs: x ? [{ t: x }] : [] }));
  const paras = bodyParas(blocks, t ? namedStylesOf(t) : {});
  const text = paras.map((p) => p.runs.map((r) => r.t).join('')).join('\n');
  return { paras, body: paras, text, found: !!t || !!String(fallback).trim() };
}

// ---------- .docx ----------
const xesc = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STYLE = { p: 'Normal', h: 'Heading1', title: 'BookTitle', author: 'BookAuthor', meta: 'BookMeta', center: 'Center', right: 'Right', gap: 'Center' };
function runXml(r) {
  // порядок важен для Word: b, i, strike, u
  const pr = `${r.b ? '<w:b/>' : ''}${r.i ? '<w:i/>' : ''}${r.s ? '<w:strike/>' : ''}${r.z ? `<w:sz w:val="${Math.round(r.z * 2)}"/><w:szCs w:val="${Math.round(r.z * 2)}"/>` : ''}${r.u ? '<w:u w:val="single"/>' : ''}`;
  return String(r.t ?? '').split('\n').map((piece, k) => `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}${k ? '<w:br/>' : ''}<w:t xml:space="preserve">${xesc(piece)}</w:t></w:r>`).join('');
}
export function documentXml(paras) {
  const tw = (pt) => Math.round((Number(pt) || 0) * 20); // pt → twips
  const JC = { CENTER: 'center', END: 'right', JUSTIFIED: 'both' };
  const pPr = (p) => {
    if (!p.ps) return '';
    const { a, fi, il, sa, sb, ls } = p.ps, rel = tw(fi) - tw(il);
    return `<w:spacing w:before="${tw(sa)}" w:after="${tw(sb)}" w:line="${Math.round(ls * 2.4)}" w:lineRule="auto"/><w:ind w:left="${tw(il)}" ${rel >= 0 ? `w:firstLine="${rel}"` : `w:hanging="${-rel}"`}/><w:jc w:val="${JC[a] || 'left'}"/>`;
  };
  const body = paras.map((p) => `<w:p><w:pPr><w:pStyle w:val="${STYLE[p.kind] || 'Normal'}"/>${p.pageBreak ? '<w:pageBreakBefore/>' : ''}${pPr(p)}</w:pPr>${(p.runs || []).map(runXml).join('')}</w:p>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rId2"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1701" w:header="709" w:footer="567" w:gutter="0"/><w:titlePg/></w:sectPr></w:body></w:document>`;
}
const FONT = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/>';
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${FONT}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="480"/><w:ind w:firstLine="0"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Center"><w:name w:val="Center"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Right"><w:name w:val="Right"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/><w:jc w:val="right"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="BookAuthor"><w:name w:val="Book Author"/><w:basedOn w:val="Center"/><w:pPr><w:spacing w:before="2400" w:after="1200"/></w:pPr><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="BookTitle"><w:name w:val="Book Title"/><w:basedOn w:val="Center"/><w:pPr><w:spacing w:after="4800"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="BookMeta"><w:name w:val="Book Meta"/><w:basedOn w:val="Center"/></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Center"/></w:style>
</w:styles>`;
const FOOTER_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`;
export async function docxBlob(Zip, paras, { title = '', author = '' } = {}) {
  const z = new Zip();
  z.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  z.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
  z.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`);
  z.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xesc(title)}</dc:title><dc:creator>${xesc(author)}</dc:creator><dc:language>ru-RU</dc:language></cp:coreProperties>`);
  z.file('word/document.xml', documentXml(paras));
  z.file('word/styles.xml', STYLES_XML);
  z.file('word/footer1.xml', FOOTER_XML);
  return z.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// ---------- PDF: та же вёрстка страницей для печати («Сохранить как PDF») ----------
const hesc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// абзацы → HTML с отступами и интервалами как в Документе (просмотр, копирование, PDF)
export function parasHtml(paras) {
  const run = (r) => { let h = hesc(r.t).replace(/\n/g, '<br>'); if (r.s) h = `<s>${h}</s>`; if (r.u) h = `<u>${h}</u>`; if (r.i) h = `<i>${h}</i>`; if (r.b) h = `<b>${h}</b>`; if (r.z) h = `<span style="font-size:${r.z}pt">${h}</span>`; return h; };
  const AL = { CENTER: 'center', END: 'right', JUSTIFIED: 'justify' };
  const css = (p) => { if (!p.ps) return ''; const { a, fi, il, sa, sb, ls } = p.ps; return ` style="margin:${sa}pt 0 ${sb}pt ${il}pt;text-indent:${fi - il}pt;line-height:${+(ls / 100 * 1.15).toFixed(3)};text-align:${AL[a] || 'left'}"`; };
  return paras.map((p) => `<p class="${p.kind}${p.pageBreak ? ' pb' : ''}"${css(p)}>${(p.runs || []).map(run).join('') || '&nbsp;'}</p>`).join('');
}
export function printHtml(paras, docTitle) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${hesc(docTitle)}</title><style>
@page { size: A4; margin: 2cm 1.5cm 2cm 3cm; }
body { font: 12pt/1.15 'Times New Roman', Times, serif; color: #000; margin: 0; }
p { margin: 0; }
p.h { text-align: center; font-weight: bold; font-size: 14pt; margin-bottom: 1.5em; }
p.author { text-align: center; font-size: 14pt; margin: 6cm 0 2cm; } p.title { text-align: center; font-weight: bold; font-size: 18pt; margin-bottom: 8cm; } p.meta { text-align: center; }
p.pb { break-before: page; }
</style></head><body>${parasHtml(paras)}</body></html>`;
}
