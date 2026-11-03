// Read-only token highlighting for the experimental s* statistical scorer.
// No Unicode scan, no rewriting, and no changes to editor HTML or Google Docs.
import { scoreTokenPositions, isTrainedScorer } from './watermark-score.js';

const HIGHLIGHT_NAME = 'writer-experimental-watermark';
let active = false;

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

async function loadScorer() {
  // The upstream stealer module produces this JSON using steal.py build.
  // Until a trained target-language/target-model corpus is available,
  // the checked-in file deliberately contains no scores.
  const response = await fetch(new URL('./s_star.json', import.meta.url), { cache: 'no-store' });
  if (!response.ok) throw Error('Не удалось загрузить статистическую модель');
  return response.json();
}

export async function toggleWatermarkHighlights() {
  if (active) { clearWatermarkHighlights(); return; }
  const root = document.getElementById('ed');
  if (!root) return;
  if (!globalThis.CSS?.highlights || !globalThis.Highlight) {
    status('Браузер не поддерживает подсветку без изменения текста.');
    return;
  }
  status('Проверяю доступность экспериментальной модели…');
  let scorer;
  try { scorer = await loadScorer(); }
  catch (error) { status('Не удалось загрузить модель: ' + error.message); return; }
  if (!isTrainedScorer(scorer)) {
    status('Модуль статистической подсветки подключён, но обученная таблица Opus 5.5 пока отсутствует. Подсвечивать произвольные слова не буду.');
    return;
  }
  // Reject any stale, superseded chapter while the scorer was being loaded.
  if (document.getElementById('ed') !== root) return;
  try {
    const { text, refs } = editorTextMap(root);
    const result = scoreTokenPositions(text, scorer);
    const ranges = result.hits.slice(0, 1500).map((hit) => getRange(hit, refs)).filter(Boolean);
    globalThis.CSS.highlights.set(HIGHLIGHT_NAME, new globalThis.Highlight(...ranges));
    active = true;
    button();
    status('Экспериментальные совпадения: ' + ranges.length + ' из ' + result.tokenCount +
      ' токенов. Оценка stealer/s*, не подтверждение маркировки Claude; текст не изменён.');
  } catch (error) {
    status('Не удалось выполнить статистическую проверку: ' + error.message);
  }
}
