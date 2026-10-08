// Редактор главы: вкладка Google Документа ⇄ простые абзацы с жирным и курсивом.
// Чистые функции — без DOM и сети, чтобы их можно было проверить тестами.

// найти вкладку по названию (или id) — вкладки бывают вложенными
export function findTab(doc, key) {
  let hit = null;
  const walk = (list) => { for (const t of list || []) { if (hit) return; const p = t.tabProperties || {}; if (p.tabId === key || p.title === key) { hit = t; return; } walk(t.childTabs); } };
  walk(doc.tabs);
  return hit;
}

// содержимое вкладки → абзацы [{ runs: [{ t, b, i }] }]; таблицы — по строкам текстом
export function contentToBlocks(content) {
  const out = [];
  const para = (p) => {
    const runs = [];
    for (const el of p.elements || []) {
      const tr = el.textRun;
      if (!tr || !tr.content) continue;
      const st = tr.textStyle || {};
      for (const [k, piece] of tr.content.split('\n').entries()) {
        if (k > 0) { out.push({ runs: runs.splice(0) }); }
        if (piece) runs.push({ t: piece, b: !!st.bold, i: !!st.italic });
      }
    }
    if (runs.length) out.push({ runs });
  };
  for (const el of content || []) {
    if (el.paragraph) para(el.paragraph);
    else if (el.table) for (const row of el.table.tableRows || []) for (const cell of row.tableCells || []) out.push(...contentToBlocks(cell.content));
  }
  // склеиваем соседние куски с одинаковым оформлением
  return out.map((p) => ({ runs: p.runs.reduce((a, r) => { const l = a[a.length - 1]; if (l && l.b === r.b && l.i === r.i) l.t += r.t; else a.push({ ...r }); return a; }, []) }));
}
export const blocksText = (blocks) => blocks.map((p) => p.runs.map((r) => r.t).join('')).join('\n');
// последний индекс содержимого вкладки (до него стоит обязательный последний перевод строки)
export const contentEnd = (content) => (content && content.length ? content[content.length - 1].endIndex : 2);

// запросы batchUpdate: заменить всё содержимое вкладки текстом абзацев и расставить жирный/курсив.
// Индексы Документов считаются в UTF-16 — как длина строк в JS.
export function saveRequests(blocks, tabId, endIndex) {
  const req = [];
  const rng = (s, e) => ({ startIndex: s, endIndex: e, ...(tabId ? { tabId } : {}) });
  if (endIndex - 1 > 1) req.push({ deleteContentRange: { range: rng(1, endIndex - 1) } });
  const text = blocksText(blocks);
  if (!text) return req;
  req.push({ insertText: { location: { index: 1, ...(tabId ? { tabId } : {}) }, text } });
  req.push({ updateTextStyle: { range: rng(1, 1 + text.length), textStyle: { bold: false, italic: false }, fields: 'bold,italic' } });
  let pos = 1;
  blocks.forEach((p, n) => {
    for (const r of p.runs) {
      const s = pos, e = pos + r.t.length;
      const fields = [r.b ? 'bold' : '', r.i ? 'italic' : ''].filter(Boolean);
      if (fields.length) req.push({ updateTextStyle: { range: rng(s, e), textStyle: { ...(r.b ? { bold: true } : {}), ...(r.i ? { italic: true } : {}) }, fields: fields.join(',') } });
      pos = e;
    }
    if (n < blocks.length - 1) pos += 1; // перевод строки между абзацами
  });
  return req;
}
