// Редактор главы: вкладка Google Документа ⇄ абзацы со стилями. Чистые функции — без DOM и сети.
// Абзац: { st: { n: namedStyleType, a: alignment, fi: отступ первой строки (pt), il: отступ слева (pt), sa/sb: интервал до/после (pt), ls: межстрочный (%) },
//          runs: [{ t, b, i, u, s, f: шрифт, z: размер (pt), c: цвет текста «#rrggbb» }] }

// найти вкладку по названию (или id) — вкладки бывают вложенными
export function findTab(doc, key) {
  let hit = null;
  const walk = (list) => { for (const t of list || []) { if (hit) return; const p = t.tabProperties || {}; if (p.tabId === key || p.title === key) { hit = t; return; } walk(t.childTabs); } };
  walk(doc.tabs);
  return hit;
}

const pt = (d) => (d && typeof d.magnitude === 'number' ? d.magnitude : undefined);
function paraSt(ps = {}) {
  const st = {};
  if (ps.namedStyleType && ps.namedStyleType !== 'NORMAL_TEXT') st.n = ps.namedStyleType;
  if (ps.alignment && ps.alignment !== 'START') st.a = ps.alignment;
  if (pt(ps.indentFirstLine) != null) st.fi = pt(ps.indentFirstLine);
  if (pt(ps.indentStart) != null) st.il = pt(ps.indentStart);
  if (pt(ps.spaceAbove) != null) st.sa = pt(ps.spaceAbove);
  if (pt(ps.spaceBelow) != null) st.sb = pt(ps.spaceBelow);
  if (typeof ps.lineSpacing === 'number') st.ls = ps.lineSpacing;
  return st;
}
// цвет текста Docs API {red, green, blue: 0…1} ⇄ «#0b6b4f»; чёрный — как «без цвета»
const hex2 = (v) => Math.round((Number(v) || 0) * 255).toString(16).padStart(2, '0');
export const colorOf = (fc) => { const c = fc?.color?.rgbColor; if (!c) return ''; const h = '#' + hex2(c.red) + hex2(c.green) + hex2(c.blue); return h === '#000000' ? '' : h; };
export const rgbOf = (h) => { const n = parseInt(String(h).slice(1), 16); return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 }; };
function runOf(t, ts = {}) {
  const r = { t, b: !!ts.bold, i: !!ts.italic, u: !!ts.underline, s: !!ts.strikethrough };
  const c = colorOf(ts.foregroundColor); if (c) r.c = c;
  if (ts.weightedFontFamily?.fontFamily) r.f = ts.weightedFontFamily.fontFamily;
  if (pt(ts.fontSize) != null) r.z = pt(ts.fontSize);
  return r;
}
const sameRun = (a, b) => a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s && a.f === b.f && a.z === b.z && a.c === b.c;
const mergeRuns = (runs) => runs.reduce((acc, r) => { const l = acc[acc.length - 1]; if (l && sameRun(l, r)) l.t += r.t; else acc.push({ ...r }); return acc; }, []);

// содержимое вкладки → абзацы; таблицы — по ячейкам абзацами
export function contentToBlocks(content) {
  const out = [];
  const para = (p) => {
    const st = paraSt(p.paragraphStyle);
    let runs = [];
    for (const el of p.elements || []) {
      const tr = el.textRun;
      if (!tr || !tr.content) continue;
      const parts = tr.content.split('\n');
      parts.forEach((piece, k) => {
        if (k > 0) { out.push({ st, runs: mergeRuns(runs) }); runs = []; }
        if (piece) runs.push(runOf(piece.replace(/\u000b/g, '\n'), tr.textStyle));
      });
    }
    if (runs.length) out.push({ st, runs: mergeRuns(runs) });
  };
  for (const el of content || []) {
    if (el.paragraph) para(el.paragraph);
    else if (el.table) for (const row of el.table.tableRows || []) for (const cell of row.tableCells || []) out.push(...contentToBlocks(cell.content));
  }
  return out;
}
// стили документа по умолчанию (обычный текст, заголовки): для показа как в Документе
export function namedStylesOf(tab) {
  const out = {};
  for (const s of tab?.documentTab?.namedStyles?.styles || []) out[s.namedStyleType] = { st: paraSt({ ...s.paragraphStyle, namedStyleType: undefined }), run: runOf('', s.textStyle) };
  return out;
}
export const blocksText = (blocks) => blocks.map((p) => p.runs.map((r) => r.t).join('')).join('\n');
export const contentEnd = (content) => (content && content.length ? content[content.length - 1].endIndex : 2);
// статистика: знаки с пробелами (без переводов строк), слова
export function textStats(blocks) {
  const txt = blocks.map((p) => p.runs.map((r) => r.t).join('')).join(' ');
  return { chars: blocks.reduce((a, p) => a + p.runs.reduce((x, r) => x + r.t.replace(/\n/g, '').length, 0), 0), words: (txt.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length };
}

// запросы batchUpdate: заменить содержимое вкладки и вернуть оформление абзацев и текста
export function saveRequests(blocks, tabId, endIndex) {
  const req = [];
  const T = tabId ? { tabId } : {};
  const rng = (s, e) => ({ startIndex: s, endIndex: e, ...T });
  if (endIndex - 1 > 1) req.push({ deleteContentRange: { range: rng(1, endIndex - 1) } });
  const text = blocksText(blocks);
  if (!text) return req;
  req.push({ insertText: { location: { index: 1, ...T }, text } });
  const end = 1 + text.length;
  // текст: сначала всё «как в стиле абзаца», потом — свои отличия кусков
  req.push({ updateTextStyle: { range: rng(1, end), textStyle: {}, fields: 'bold,italic,underline,strikethrough,fontSize,weightedFontFamily,foregroundColor' } });
  // абзацы: стиль, выравнивание, отступы, интервалы — подряд идущие одинаковые одним запросом
  const PF = 'namedStyleType,alignment,indentFirstLine,indentStart,spaceAbove,spaceBelow,lineSpacing';
  const psOf = (st = {}) => {
    const ps = { namedStyleType: st.n || 'NORMAL_TEXT' };
    if (st.a) ps.alignment = st.a;
    const m = (v) => ({ magnitude: v, unit: 'PT' });
    if (st.fi != null) ps.indentFirstLine = m(st.fi);
    if (st.il != null) ps.indentStart = m(st.il);
    if (st.sa != null) ps.spaceAbove = m(st.sa);
    if (st.sb != null) ps.spaceBelow = m(st.sb);
    if (st.ls != null) ps.lineSpacing = st.ls;
    return ps;
  };
  let pos = 1, groupStart = 1, groupKey = null, groupPs = null;
  // диапазон абзацев [groupStart, to): хотя бы один знак, но не дальше конца вкладки (end — её последний перевод строки)
  const flush = (to) => { if (groupPs) req.push({ updateParagraphStyle: { range: rng(groupStart, Math.min(end + 1, Math.max(to, groupStart + 1))), paragraphStyle: groupPs, fields: PF } }); };
  const runReq = [];
  blocks.forEach((p, n) => {
    const start = pos;
    for (const r of p.runs) {
      const s = pos, e = pos + r.t.length, ts = {}, f = [];
      if (r.b) { ts.bold = true; f.push('bold'); }
      if (r.i) { ts.italic = true; f.push('italic'); }
      if (r.u) { ts.underline = true; f.push('underline'); }
      if (r.s) { ts.strikethrough = true; f.push('strikethrough'); }
      if (r.f) { ts.weightedFontFamily = { fontFamily: r.f }; f.push('weightedFontFamily'); }
      if (r.z) { ts.fontSize = { magnitude: r.z, unit: 'PT' }; f.push('fontSize'); }
      if (r.c) { ts.foregroundColor = { color: { rgbColor: rgbOf(r.c) } }; f.push('foregroundColor'); }
      if (f.length && e > s) runReq.push({ updateTextStyle: { range: rng(s, e), textStyle: ts, fields: f.join(',') } });
      pos = e;
    }
    const ps = psOf(p.st), key = JSON.stringify(ps);
    if (key !== groupKey) { if (groupKey !== null) flush(start); groupStart = start; groupKey = key; groupPs = ps; }
    if (n < blocks.length - 1) pos += 1;
    else flush(end);
  });
  return [...req, ...runReq];
}

// новая глава: следующий номер после последней «Глава N» и место — сразу за ней (в той же группе вкладок)
export function nextChapterTab(doc) {
  let n = 0, at = null;
  const walk = (list, parentTabId) => (list || []).forEach((t, k) => {
    const ti = t.tabProperties?.title || '', m = /^\s*глава\s+(\d+)/i.exec(ti);
    if (m && +m[1] >= n) { n = +m[1]; at = { index: k + 1, parentTabId }; }
    else if (!at && /^\s*пролог/i.test(ti)) at = { index: k + 1, parentTabId };
    walk(t.childTabs, t.tabProperties?.tabId);
  });
  walk(doc.tabs);
  return { title: `Глава ${n + 1}`, index: at ? at.index : (doc.tabs || []).length, ...(at?.parentTabId ? { parentTabId: at.parentTabId } : {}) };
}

// строка — название главы («Глава 3.», «Пролог», «Глава пятая. Утро»)
export const isChapterTitle = (t) => { const v = String(t || '').trim(); return v.length > 0 && v.length <= 80 && /^(пролог|эпилог|глава|часть)(?=[\s.,:;!?\d]|$)/i.test(v); };

// Названия глав — единообразные: «Пролог», «Эпилог», «Глава 7» — без точек, без капса; подзаголовок (если есть) —
// второй строкой, тоже без точки в конце. «ГЛАВА 11.» → «Глава 11»; «Глава 1. «С папой…»» → «Глава 1» + «С папой…».
export function normTitle(text) {
  const v = String(text || '').replace(/[\u000b\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(пролог|эпилог|глава)(?:\s*([0-9]+|[а-яё-]+))?\s*[.:—–-]?\s*(.*)$/i.exec(v);
  if (!m) return v.replace(/[.\s]+$/, '');
  const word = m[1].toLowerCase(), num = m[2] && word === 'глава' ? m[2].toLowerCase() : '';
  // «Глава пятая» — номер словом тоже часть заголовка; у «Пролога» второе слово — уже подзаголовок
  const restRaw = (m[2] && word !== 'глава' ? `${m[2]} ${m[3]}` : m[3]).trim();
  const head = word[0].toUpperCase() + word.slice(1) + (num ? ' ' + num : '');
  const rest = restRaw.replace(/^[.:—–-]+\s*/, '').replace(/[.\s]+$/, '');
  return rest ? `${head}\n${rest[0].toUpperCase()}${rest.slice(1)}` : head;
}

// Названия глав в самом Документе — одинаковые: текст по normTitle, «Заголовок 1», по центру, без отступов,
// шрифт как у основного текста, 14 пт, жирный, без курсива и подчёркивания. Уже такие — пропускаем.
export const TITLE_PT = 14;
export function titleRequests(doc) {
  const out = [], bookTab = (t) => /^\s*(пролог|глава|эпилог)/i.test(t || '');
  const plain = (t) => String(t || '').trim().replace(/[.\s]+$/, '').toLowerCase();
  const walk = (list) => {
    for (const tab of list || []) {
      const title = tab.tabProperties?.title || '', tabId = tab.tabProperties?.tabId;
      if (bookTab(title)) {
        const el = (tab.documentTab?.body?.content || []).find((e) => e.paragraph && (e.paragraph.elements || []).some((x) => (x.textRun?.content || '').trim()));
        if (el) {
          const runs = (el.paragraph.elements || []).filter((x) => x.textRun), text = runs.map((x) => x.textRun.content).join('').replace(/\n$/, '');
          const font0 = tab.documentTab?.namedStyles?.styles?.find((x) => x.namedStyleType === 'NORMAL_TEXT')?.textStyle?.weightedFontFamily;
          const style = (s0, len, tid) => [
            { updateParagraphStyle: { range: { startIndex: s0, endIndex: s0 + len + 1, ...tid }, paragraphStyle: { namedStyleType: 'HEADING_1', alignment: 'CENTER', indentFirstLine: { magnitude: 0, unit: 'PT' }, indentStart: { magnitude: 0, unit: 'PT' } }, fields: 'namedStyleType,alignment,indentFirstLine,indentStart' } },
            { updateTextStyle: { range: { startIndex: s0, endIndex: s0 + len, ...tid }, textStyle: { bold: true, italic: false, underline: false, fontSize: { magnitude: TITLE_PT, unit: 'PT' }, ...(font0 ? { weightedFontFamily: font0 } : {}) }, fields: 'bold,italic,underline,fontSize' + (font0 ? ',weightedFontFamily' : '') } },
          ];
          if (!isChapterTitle(text.replace(/\u000b/g, ' ')) && plain(text) !== plain(title)) {
            // строки с названием нет — глава начинается сразу с текста: ставим название сверху
            const want = normTitle(title).replace(/\n/g, '\u000b'), tid = tabId ? { tabId } : {};
            out.push({ insertText: { location: { index: el.startIndex, ...tid }, text: want + '\n' } }, ...style(el.startIndex, want.length, tid));
          } else {
            const want = normTitle(text).replace(/\n/g, '\u000b'); // вторая строка — мягкий перенос внутри того же абзаца
            const ps = el.paragraph.paragraphStyle || {};
            const styled = ps.namedStyleType === 'HEADING_1' && ps.alignment === 'CENTER' && !pt(ps.indentFirstLine) && !pt(ps.indentStart)
              && runs.filter((x) => x.textRun.content.trim()).every((x) => { const ts = x.textRun.textStyle || {}; return ts.bold === true && !ts.italic && !ts.underline && pt(ts.fontSize) === TITLE_PT && (!font0 || ts.weightedFontFamily?.fontFamily === font0.fontFamily); });
            if (text !== want || !styled) {
              const s0 = el.startIndex, tid = tabId ? { tabId } : {};
              if (text !== want) out.push({ deleteContentRange: { range: { startIndex: s0, endIndex: el.endIndex - 1, ...tid } } }, { insertText: { location: { index: s0, ...tid }, text: want } });
              out.push(...style(s0, want.length, tid));
            }
          }
        }
      }
      walk(tab.childTabs);
    }
  };
  walk(doc?.tabs);
  return out;
}
