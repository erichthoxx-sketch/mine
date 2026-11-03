// Read-only inspection of technical Unicode anomalies in pasted source text.
// Claude's statistical text watermark is NOT a Unicode marker and cannot be decoded here.
import { esc, openSheet } from '../../js/ui.js';

const UNUSUAL = /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u2000-\u200a\u202f\u205f\u3000]|\udb40[\udc00-\udc7f]|\udb40[\udd00-\uddef]/gu;
const INVISIBLE = /[\u00ad\u034f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]|\udb40[\udc00-\udc7f]|\udb40[\udd00-\uddef]/u;
const MAX_PREVIEW = 30000;

export function scanTechnicalMarks(input) {
  const text = String(input ?? '');
  return [...text.matchAll(UNUSUAL)].map((m) => ({
    offset: m.index, length: m[0].length,
    code: [...m[0]].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join(' '),
    kind: INVISIBLE.test(m[0]) ? 'Невидимый символ' : 'Необычный пробел',
  }));
}

function preview(text) {
  const sample = text.slice(0, MAX_PREVIEW), marks = scanTechnicalMarks(sample);
  let html = '', start = 0;
  for (const m of marks) {
    html += esc(sample.slice(start, m.offset));
    html += '<mark class="markscan-hit" title="' + esc(m.kind + ' · ' + m.code) +
      '" aria-label="' + esc(m.kind + ' ' + m.code) + '">[' + esc(m.code) + ']</mark>';
    start = m.offset + m.length;
  }
  html += esc(sample.slice(start));
  return html + (text.length > MAX_PREVIEW ? '<p class="small muted">Предпросмотр показывает первые 30 000 символов; счётчик проверяет весь текст.</p>' : '');
}

export function openMarkInspector(initialText = '') {
  const f = openSheet('Подсветка меток', [
    '<p class="small muted">Проверка показывает <b>только скрытые символы и необычные пробелы</b>. ',
    'Статистический водяной знак Claude здесь <b>не определяется</b>: без ключа Anthropic нельзя достоверно подсветить слова, которые его образуют.</p>',
    '<label>Исходный текст для проверки<textarea id="markscan-input" rows="7" spellcheck="false" ',
    'placeholder="Вставьте текст прямо из Claude, чтобы проверить его до очистки редактором"></textarea></label>',
    '<div id="markscan-status" class="small muted" aria-live="polite"></div>',
    '<div id="markscan-preview" class="markscan-preview" aria-label="Подсветка обнаруженных символов"></div>',
    '<p class="small muted">Текст остаётся только в этом окне. Рукопись и Google Документ не меняются.</p>',
  ].join(''), null);
  const input = f.querySelector('#markscan-input');
  const status = f.querySelector('#markscan-status');
  const output = f.querySelector('#markscan-preview');
  // The global paste handler sanitizes all textareas; this diagnostic textarea
  // must preserve the original clipboard characters for the inspection.
  input.addEventListener('paste', (e) => e.stopPropagation());
  input.value = initialText;
  const render = () => {
    const text = input.value;
    const marks = scanTechnicalMarks(text);
    status.textContent = marks.length
      ? 'Обнаружено технических символов: ' + marks.length + '. Они отмечены ниже.'
      : 'Технических символов не найдено. Это не проверка водяного знака Claude.';
    output.innerHTML = preview(text) || '<span class="small muted">Здесь появится текст с подсветкой.</span>';
  };
  input.addEventListener('input', render);
  render();
}
