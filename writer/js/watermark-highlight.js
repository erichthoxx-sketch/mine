// Read-only token highlighting for the experimental s* statistical scorer.
// No Unicode scan, no rewriting, and no changes to editor HTML or Google Docs.
import { scoreTokenPositions } from './watermark-score.js';
import { availableModelScorers } from './watermark-catalog.js';

const HIGHLIGHT_NAME = 'writer-experimental-watermark';
let active = false;
let requestId = 0;
let searching = false;
const RECHECK_MS = 6 * 60 * 60 * 1000;
let cachedModels = null;
let modelsCheckedAt = 0;
let visibilityCheckId = 0;

// Проверяем наличие реально загружаемых таблиц, а не просто имена файлов.
// Рукопись в эту проверку не передаётся.
function availableModels() {
  const now = Date.now();
  if (!cachedModels || now - modelsCheckedAt >= RECHECK_MS) {
    modelsCheckedAt = now;
    cachedModels = availableModelScorers();
  }
  return cachedModels;
}

export async function updateWatermarkVisibility() {
  const row = document.querySelector('.ed-wm-row');
  const root = document.getElementById('ed');
  if (!row || !root) return;
  row.hidden = true;
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) return;
  const checkId = ++visibilityCheckId;
  try {
    const catalog = await availableModels();
    if (checkId !== visibilityCheckId || document.getElementById('ed') !== root || !row.isConnected) return;
    row.hidden = !catalog.models?.length;
  } catch {
    // При отсутствии сети или таблиц недоступная функция не показывается.
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void updateWatermarkVisibility();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void updateWatermarkVisibility();
  }, RECHECK_MS);
}

function status(message) {
  const el = document.getElementById('ed-wm-status');
  if (el) { el.textContent = message; el.hidden = !message; }
}
function button() {
  const el = document.querySelector('[data-act="ed.watermark"]');
  if (el) {
    el.textContent = active ? 'Скрыть подсветку' : 'Подсветить шифр';
    el.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

export function clearWatermarkHighlights(silent = false) {
  requestId++;
  if (globalThis.CSS?.highlights) globalThis.CSS.highlights.delete(HIGHLIGHT_NAME);
  active = false;
  button();
  if (silent) status('');
  else status('Подсветка выключена. Текст не изменён.');
}

// Flatten editor paragraphs into a source string with precise offsets pointing
// back to unchanged DOM text nodes. Never insert spans or markers into the editor.
function editorTextMap(root) {
  let text = '';
  const refs = [];
  for (const block of root.childNodes) {
    if (text) text += '\n';
    if (block.nodeType === Node.TEXT_NODE) {
      if (block.nodeValue) {
        refs.push({ node: block, start: text.length, end: text.length + block.nodeValue.length });
        text += block.nodeValue;
      }
      continue;
    }
    if (block.nodeType !== Node.ELEMENT_NODE) continue;
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue) continue;
      refs.push({ node, start: text.length, end: text.length + node.nodeValue.length });
      text += node.nodeValue;
    }
  }
  return { text, refs };
}
function getRange(hit, refs) {
  const start = refs.find((r) => hit.start >= r.start && hit.start < r.end);
  const end = refs.find((r) => hit.end - 1 >= r.start && hit.end - 1 < r.end);
  if (!start || !end) return null;
  const range = document.createRange();
  range.setStart(start.node, hit.start - start.start);
  range.setEnd(end.node, hit.end - end.start);
  return range;
}

// Одна кнопка: без ручного выбора модели проверяем всеми подходящими
// опубликованными таблицами. Оценка s* приблизительная, не секретный ключ.
export async function toggleWatermarkHighlights() {
  if (active) { clearWatermarkHighlights(); return; }
  if (searching) return;
  const root = document.getElementById('ed');
  if (!root) return;
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) {
    status('Браузер не поддерживает подсветку без изменения текста.');
    return;
  }
  const currentRequest = ++requestId;
  searching = true;
  status('Проверяю обновления анализаторов…');
  let catalog;
  try { catalog = await availableModels(); }
  catch (error) {
    if (requestId === currentRequest) status('Проверка обновлений недоступна: ' + error.message);
    searching = false;
    return;
  }
  searching = false;
  if (requestId !== currentRequest || document.getElementById('ed') !== root) return;
  if (!catalog.models.length) {
    if (catalog.availableCount === 0) {
      status('В открытом источнике ещё нет обученных статистических анализаторов. Обновления проверяются автоматически, до одного раза в 6 часов.');
    } else {
      status('Обнаружены файлы анализаторов, но подходящих обученных таблиц для русского текста пока нет.');
    }
    return;
  }
  try {
    const { text, refs } = editorTextMap(root);
    const hits = new Map();
    let scored = 0;
    const names = [];
    for (const model of catalog.models) {
      const result = scoreTokenPositions(text, model.data);
      scored = Math.max(scored, result.tokenCount);
      names.push(model.label);
      for (const hit of result.hits) hits.set(hit.start + ':' + hit.end, hit);
    }
    const ranges = [...hits.values()].slice(0, 1500)
      .map((hit) => getRange(hit, refs)).filter(Boolean);
    globalThis.CSS.highlights.set(HIGHLIGHT_NAME, new globalThis.Highlight(...ranges));
    active = true;
    button();
    const labels = names.slice(0, 3).join(', ') + (names.length > 3 ? ' и другие' : '');
    status('Анализаторов: ' + catalog.models.length + ' (' + labels + '). ' +
      'Экспериментальных совпадений: ' + ranges.length + ' из ' + scored + ' токенов. ' +
      (catalog.stale ? 'Каталог обновлений временно недоступен. ' : '') +
      'Это приблизительная оценка, не доказательство водяного знака Claude. Текст не изменён.');
  } catch (error) {
    status('Не удалось выполнить статистическую проверку: ' + error.message);
  }
}
