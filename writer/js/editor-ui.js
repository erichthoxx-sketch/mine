// Общая панель главы и блога: один внешний вид и одинаковые действия.
import { ic } from '../../js/icons.js';
import { esc } from '../../js/ui.js';
const STYLES = [['NORMAL_TEXT', 'Обычный текст'], ['TITLE', 'Название'], ['SUBTITLE', 'Подзаголовок'], ['HEADING_1', 'Заголовок 1'], ['HEADING_2', 'Заголовок 2'], ['HEADING_3', 'Заголовок 3']];
const alignIc = (v) => {
  const L = { left: [[4, 18], [4, 14], [4, 18], [4, 12]], center: [[3, 21], [6, 18], [3, 21], [7, 17]], right: [[4, 20], [10, 20], [4, 20], [12, 20]], justify: [[4, 20], [4, 20], [4, 20], [4, 20]] }[v];
  return `<svg class="ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${L.map(([a, b], k) => `<path d="M${a} ${6 + k * 4}h${b - a}"/>`).join('')}</svg>`;
};
export function editorToolbar(prefix='ed',copyLabel='Скопировать главу (без названия)') {
  return `    <div class="ed-tools" role="toolbar" aria-label="Оформление">
      <select data-chg="${prefix}.style" class="ed-style" aria-label="Стиль абзаца">${STYLES.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="${prefix}.fmt" data-v="bold" title="Жирный (Ctrl+B)"><b>Ж</b></button>
      <button class="ed-ic" data-act="${prefix}.fmt" data-v="italic" title="Курсив (Ctrl+I)"><i>К</i></button>
      <button class="ed-ic ed-color" data-act="${prefix}.color" title="Выделить цветом — тёмно-изумрудный (Ctrl+Shift+E). Ещё раз — убрать" aria-label="Выделить цветом"><span>А</span></button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="${prefix}.align" data-v="left" title="По левому краю">${alignIc('left')}</button>
      <button class="ed-ic" data-act="${prefix}.align" data-v="center" title="По центру">${alignIc('center')}</button>
      <button class="ed-ic" data-act="${prefix}.align" data-v="right" title="По правому краю">${alignIc('right')}</button>
      <button class="ed-ic" data-act="${prefix}.align" data-v="justify" title="По ширине">${alignIc('justify')}</button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="${prefix}.dash" title="Тире для диалога">—</button>
      <button class="ed-ic" data-act="${prefix}.undo" title="Отменить (Ctrl+Z)">↶</button>
      <button class="ed-ic" data-act="${prefix}.redo" title="Повторить (Ctrl+Shift+Z)">↷</button>
      <span class="ed-sep"></span>
      <button class="ed-ic" data-act="${prefix}.find" title="Найти и заменить (Ctrl+F)">${ic('search')}</button>
      <button class="ed-ic" data-act="${prefix}.copy" title="${esc(copyLabel)}">${ic('copy')}</button>
      <button class="ed-ic" data-act="${prefix}.zoom" data-v="-1" title="Мельче">A−</button>
      <button class="ed-ic" data-act="${prefix}.zoom" data-v="1" title="Крупнее">A+</button>
    </div>`;
}
export function editorFindBar(prefix='ed') {
  return `    <div class="ed-find" id="${prefix}find" hidden><input id="${prefix}q" placeholder="Найти в тексте" aria-label="Найти" autocomplete="off">
      <button class="ed-ic" data-act="${prefix}.findPrev" title="Предыдущее (Shift+Enter)">↑</button><button class="ed-ic" data-act="${prefix}.findNext" title="Следующее (Enter)">↓</button><span class="small muted ed-found" id="${prefix}found"></span>
      <input id="${prefix}r" placeholder="Заменить на" aria-label="Заменить на" autocomplete="off"><button class="small-btn" data-act="${prefix}.replaceOne">Заменить</button><button class="small-btn" data-act="${prefix}.replaceAll">Заменить все</button>
      <button class="ed-ic" data-act="${prefix}.find" title="Закрыть (Esc)">✕</button></div>`;
}
