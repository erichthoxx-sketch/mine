// Общие мелочи интерфейса: экранирование, окна, уведомления, обработчики действий и форм.
import { parseNum } from './format.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const acts = {};   // data-act="имя"  → acts.имя(dataset, element, event)
export const forms = {};  // <form data-form="имя"> → forms.имя(FormData, form, event)
export const changes = {}; // data-chg="имя" → changes.имя(value, element)

let toastTimer;
// toast(msg, { undo }) — с кнопкой «Вернуть» (держится дольше)
export function toast(msg, opts = {}) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  if (opts.undo) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-undo'; b.textContent = 'Вернуть';
    b.onclick = async () => { t.hidden = true; await opts.undo(); };
    t.append(' ', b);
  }
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, opts.undo ? 6000 : 3500);
}

// Число из поля ввода: пусто → null, «1 234,5» → 1234.5, мусор → NaN
export function N(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  return parseNum(v);
}

export function openSheet(title, bodyHtml, onSubmit, { submitText = 'Сохранить' } = {}) {
  const dlg = document.getElementById('sheet');
  const f = document.getElementById('sheetForm');
  f.innerHTML = `<h2>${esc(title)}</h2>${tidyNums(bodyHtml)}<div class="row between sheet-actions"><button type="button" data-close>${onSubmit ? 'Отмена' : 'Закрыть'}</button>${onSubmit ? `<button class="primary" type="submit">${esc(submitText)}</button>` : ''}</div>`;
  // пока сохраняется — второе нажатие ничего не делает (иначе запись или задача добавлялась дважды)
  let busy = false;
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!onSubmit || busy) return;
    busy = true;
    const btn = f.querySelector('button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      const keep = await onSubmit(new FormData(f), f);
      if (keep !== false) dlg.close();
    } finally { busy = false; if (btn) btn.disabled = false; }
  };
  f.querySelector('[data-close]').onclick = () => dlg.close();
  if (!dlg.open) dlg.showModal();
  // Окно открывается с начала: фокус на заголовок, а не на первую кнопку где-то в середине (иначе верх «уезжает»)
  const h = f.querySelector('h2');
  h.tabIndex = -1;
  h.focus({ preventScroll: true });
  dlg.scrollTop = 0; f.scrollTop = 0;
  requestAnimationFrame(() => { dlg.scrollTop = 0; f.scrollTop = 0; });
  return f;
}
export const closeSheet = () => document.getElementById('sheet').close();

export function installHandlers(afterChange) {
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = acts[el.dataset.act];
    if (!fn) return;
    e.preventDefault();
    let res;
    try { res = await fn(el.dataset, el, e); } catch (err) { console.error(err); toast('Ошибка: ' + (err.message || err)); }
    if (res !== false) afterChange?.();
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    try { await forms[f.dataset.form]?.(new FormData(f), f, e); } catch (err) { console.error(err); toast('Ошибка: ' + (err.message || err)); }
  });
  const runChg = async (el) => {
    try { await changes[el.dataset.chg]?.(el.value, el, el.type === 'checkbox' ? el.checked : undefined); } catch (err) { console.error(err); toast('Ошибка: ' + (err.message || err)); }
  };
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-chg]');
    if (!el || e.__chgDone) return;
    runChg(el);
  });
  // выбор файла: пока открыто окно выбора, экран может перерисоваться и кнопка — смениться новой;
  // тогда событие «файл выбран» приходит в старую кнопку, которой уже нет на странице, и до общего обработчика
  // не доходит («загружается через раз»). Поэтому слушаем саму кнопку с момента нажатия.
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'file' || !el.dataset.chg || el.__chgWatch) return;
    el.__chgWatch = true;
    el.addEventListener('change', (ev) => { ev.__chgDone = true; runChg(el); });
  }, true);
}

// Скачивание: в Claude через разрешение «downloads» (обычные ссылки там заблокированы), в обычном браузере — через ссылку
// Скопировать текст (и по желанию оформленный HTML). Можно передать обещание — например, текст ещё грузится из Документа:
// запись в буфер начинается сразу, в момент нажатия (иначе Safari на iPhone считает, что нажатия уже не было, и не копирует).
// Не вышло — запасные пути: writeText, затем выделение текста и «Копировать».
export async function copyRich(text, html = null) {
  const blob = (v, type) => Promise.resolve(v).then((x) => new Blob([String(x ?? '')], { type }));
  if (window.ClipboardItem && navigator.clipboard?.write) {
    try {
      const item = { 'text/plain': blob(text, 'text/plain') };
      if (html != null) item['text/html'] = blob(html, 'text/html');
      await navigator.clipboard.write([new ClipboardItem(item)]);
      return true;
    } catch { /* ниже — запасные пути */ }
  }
  const t = String((await text) ?? '');
  try { await navigator.clipboard.writeText(t); return true; } catch { /* дальше */ }
  const ta = document.createElement('textarea');
  ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.append(ta); ta.select(); ta.setSelectionRange(0, t.length);
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
export async function download(filename, text, mime = 'text/plain') {
  // в именах файлов — нижнее подчёркивание вместо дефисов и пробелов: «zveriniaya_tropa_sinopsis.docx»
  // и без буквы «ё» — ни в имени, ни в тексте файла
  if (typeof text === 'string') text = text.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  filename = String(filename).replace(/ё/g, 'е').replace(/Ё/g, 'Е').replace(/[\s-]+/g, '_').replace(/_+/g, '_').replace(/_(?=\.[a-z0-9]+$)/i, '');
  try {
    const d = await window.claude?.use?.('downloads');
    if (d) { await d.save({ filename, data: text }); return true; }
  } catch (e) {
    if (e?.code === 'declined') return false;
    if (e?.code && e.code !== 'unavailable') { toast('Не удалось сохранить файл: ' + (e.message || e.code)); return false; }
  }
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}
// Подтверждение внутри страницы (окна confirm() в Claude не показываются)
export function ask(text, okText = 'Удалить') {
  return new Promise((res) => {
    let done = false;
    openSheet('Подтвердите', `<p>${esc(text)}</p>`, async () => { done = true; res(true); }, { submitText: okText });
    document.getElementById('sheet').addEventListener('close', () => { if (!done) res(false); }, { once: true });
  });
}
export const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(file); });

export const opt = (value, label, sel) => `<option value="${esc(value)}"${String(sel) === String(value) ? ' selected' : ''}>${esc(label)}</option>`;
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

// Автообновление: если на сайте вышла новая версия, а браузер показывает старую из памяти — перезагружаем.
// Версия зашита в адрес скриптов (папка vXXXXXXXX), её сравниваем со свежей страницей.
export function watchForUpdates() {
  try { sessionStorage.removeItem('staleReload'); } catch { /* ок */ } // приложение загрузилось — счётчик перезагрузок с нуля
  const mine = /\/v([0-9a-f]{8})\//.exec(import.meta.url)?.[1];
  if (!mine) return; // локальная проверка — без версий
  const check = async () => {
    try {
      const html = await (await fetch(location.pathname, { cache: 'no-store' })).text();
      const live = /["/]v([0-9a-f]{8})\//.exec(html)?.[1]; // src="vXXXX/…" или "../vXXXX/…"
      if (live && live !== mine) {
        const key = 'reloadedFor';
        if (sessionStorage.getItem(key) === live) return; // не зацикливаемся
        // идёт работа (открыт редактор главы, окно, курсор в поле) — не перезагружаем: несохранённый текст сбросился бы.
        // Новая версия откроется сама, когда работа закончена (переход в другой раздел)
        if (busyNow()) { pending = live; return; }
        sessionStorage.setItem(key, live);
        location.reload();
      }
    } catch { /* нет сети — проверим в следующий раз */ }
  };
  let pending = '';
  const busyNow = () => {
    try { if (window.__keepPage?.()) return true; } catch { /* ок */ }
    const a = document.activeElement;
    return !!(document.querySelector('dialog[open]') || (a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))));
  };
  check();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('hashchange', () => { if (pending) setTimeout(check, 300); });
}

// После обновления страницы остаёмся там же: адрес раздела — в адресной строке (#/book/…),
// выбранные день, месяц, вкладки — в памяти этой вкладки браузера.
export function keepPlace(ui, keys = []) {
  const k = 'place:' + location.pathname;
  try { const saved = JSON.parse(sessionStorage.getItem(k) || 'null'); if (saved) for (const x of keys) if (x in saved) ui[x] = saved[x]; } catch { /* нет памяти — не страшно */ }
  const h = location.hash.slice(1);
  if (h.startsWith('/')) ui.route = h;
  let r = ui.route;
  Object.defineProperty(ui, 'route', { get: () => r, set: (v) => { r = v; try { history.replaceState(null, '', '#' + v); } catch { /* ок */ } }, enumerable: true, configurable: true });
  try { history.replaceState(null, '', '#' + r); } catch { /* ок */ }
  const save = () => { try { sessionStorage.setItem(k, JSON.stringify(Object.fromEntries(keys.map((x) => [x, ui[x]])))); } catch { /* ок */ } };
  addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', save);
}

// Числа не разрываются переносом строки: «21 534,30 ₽», «≈ 1 150 ₽», «7,8 а.л.», «окт 26», «10 октября» —
// пробел перед/после числа становится неразрывным. Меняем только видимый текст: теги, атрибуты и поля ввода не трогаем.
const MON = 'янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек';
const DAYS_GEN = 'января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря';
const UNITS = '₽|%|а\\.л\\.|зн\\.|знак|шт\\.|дн\\.|дней|дня|день|глав|мин|сл\\.|слов|тыс|млн|раз|показ|пр\\.|подп';
const RX = [
  [new RegExp(`(^|[\\s(])([≈~±+−–—]) (?=[\\d+−])`, 'g'), '$1$2\u00a0'],
  [new RegExp(`(\\d) (?=(?:${UNITS}))`, 'g'), '$1\u00a0'],
  [new RegExp(`(^|[\\s(«])(${MON})\\.? (?=\\d)`, 'gi'), (m, a, b) => m.replace(/ (?=\d)$/, '\u00a0').replace(/ $/, '\u00a0')],
  [new RegExp(`(\\d) (?=(?:${DAYS_GEN}))`, 'g'), '$1\u00a0'],
  [/(\d)([–-])(?=\d)/g, '$1$2\u2060'], // «05.10–10.10», «12–14» — не рвём по тире
];
export function tidyNums(html) {
  return String(html).split(/(<textarea[\s\S]*?<\/textarea>|<[^>]+>)/).map((part, i) => {
    if (i % 2) return part; // тег или поле ввода
    let t = part;
    for (const [re, to] of RX) t = t.replace(re, to);
    return t;
  }).join('');
}

// ---------- Свёрнутые разделы: второстепенное прячется в одну строку и раскрывается по нажатию ----------
// fold(ключ, заголовок, содержимое, { sub, open }) — открытые разделы запоминаются на этом устройстве,
// перерисовка экрана и обновление страницы их не сворачивают. Пустое содержимое — раздела нет вовсе.
let FOLDS = null;
const foldsGet = () => { if (!FOLDS) { try { FOLDS = new Set(JSON.parse(localStorage.getItem('folds') || '[]')); } catch { FOLDS = new Set(); } } return FOLDS; };
export const foldOpen = (key) => foldsGet().has(key);
export function fold(key, title, body, { sub = '', open = false, cls = '' } = {}) {
  if (!body) return '';
  return `<details class="fold${cls ? ' ' + cls : ''}" data-fold="${esc(key)}"${open || foldOpen(key) ? ' open' : ''}><summary><span class="fold-t">${title}</span>${sub ? `<span class="fold-s">${sub}</span>` : ''}</summary><div class="fold-b">${body}</div></details>`;
}
// длинный список: первые n видны, остальное — «Ещё N» (раскрытие тоже запоминается)
export function more(key, items, n = 3) {
  if (items.length <= n) return items.join('');
  const rest = items.slice(n);
  return items.slice(0, n).join('') + `<details class="fold-more" data-fold="${esc(key)}"${foldOpen(key) ? ' open' : ''}><summary><span class="fm-o">Ещё ${rest.length}</span><span class="fm-c">Свернуть</span></summary>${rest.join('')}</details>`;
}
if (typeof document !== 'undefined') document.addEventListener('toggle', (e) => {
  const k = e.target?.dataset?.fold; if (!k) return;
  const s = foldsGet(); if (e.target.open) s.add(k); else s.delete(k);
  try { localStorage.setItem('folds', JSON.stringify([...s])); } catch { /* нет памяти — не страшно */ }
}, true);

// ---------- Плитки-разделы: значок, название и главное состояние; по нажатию раздел раскрывается под плитками (открыт один) ----------
// tiles(ключ, [{ k, title, sub, icon, html }]) — пустые html пропускаются; какой раздел открыт, запоминается на устройстве
export function tiles(key, items, iconFn = () => '') {
  const list = items.filter((x) => x && x.html);
  if (!list.length) return '';
  let open = ''; try { open = localStorage.getItem('tile:' + key) || ''; } catch { /* ок */ }
  if (!list.some((x) => x.k === open)) open = '';
  const cur = list.find((x) => x.k === open);
  return `<div class="tiles-nav" role="tablist">${list.map((x) => `<button type="button" class="tile-b${x.k === open ? ' on' : ''}" role="tab" aria-selected="${x.k === open}" data-act="tile.open" data-key="${esc(key)}" data-k="${esc(x.k)}">${x.icon ? `<span class="tile-i">${iconFn(x.icon)}</span>` : ''}<span class="tile-t">${x.title}</span>${x.sub ? `<span class="tile-s">${x.sub}</span>` : ''}</button>`).join('')}</div>
    ${cur ? `<div class="tile-pane">${cur.html}</div>` : ''}`;
}
acts['tile.open'] = (d) => {
  let open = ''; try { open = localStorage.getItem('tile:' + d.key) || ''; } catch { /* ок */ }
  try { localStorage.setItem('tile:' + d.key, open === d.k ? '' : d.k); } catch { /* ок */ }
};

// Переключатель приложений — один и тот же во всех трёх (12.11.2026, владелица: «чтобы всё в единую мою писательскую экосистему превратилось»):
// Мастерская · Доходы · Директ и ссылка на сайт. cur — 'writer' | 'income' | 'direct'; пути — от папки текущего приложения.
export function ecoSwitch(cur) {
  const up = cur === 'income' ? '' : '../';
  const items = [['writer', 'Мастерская', up + 'workshop/'], ['income', 'Доходы', up || './'], ['direct', 'Директ', up + 'direct/']];
  // свёрнут в одну круглую кнопку; по нажатию переключатель плавно выезжает влево (12.11.2026, её просьба: «чтобы вкладки были не всегда открыты, а выезжали аккуратно»)
  return `<div class="eco-w${ecoOpen() ? ' open' : ''}"><nav class="eco" aria-label="Мои приложения">${items.map(([k, t, href]) => (k === cur ? `<span class="on" aria-current="page">${t}</span>` : `<a href="${href}">${t}</a>`)).join('')}<a href="https://lanafreitag.ru/" target="_blank" rel="noopener" title="Открыть сайт lanafreitag.ru">Сайт</a></nav>`
    + `<button type="button" class="eco-t" data-act="eco.toggle" aria-label="Мои приложения" title="Мои приложения"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="7.5" cy="7.5" r="1.8"/><circle cx="16.5" cy="7.5" r="1.8"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/></svg></button></div>`;
}
// открыт/закрыт — запоминается (перерисовка экрана раньше сбрасывала его и он сам сворачивался); закрывается только кнопкой
// на телефоне это выпадающее меню: открывается по нажатию и закрывается само (выбор, нажатие мимо); на компьютере — «таблетка», её состояние помним
const ecoPhone = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches;
let ecoNow = false; // открыто ли меню на телефоне (до перезагрузки страницы)
const ecoOpen = () => { if (ecoPhone()) return ecoNow; try { return localStorage.getItem('ecoOpen') === '1'; } catch { return false; } };
if (typeof document !== 'undefined') document.addEventListener('click', (e) => {
  if (!ecoPhone() || !ecoNow || e.target.closest?.('.eco-t')) return;
  ecoNow = false; document.querySelectorAll('.eco-w').forEach((x) => x.classList.remove('open'));
}, true);
// на телефоне меню встаёт под кнопкой и не выходит за край экрана, где бы ни стояла кнопка (13.11.2026: «на мобильном криво»)
const ecoPlace = (btn) => {
  const r = btn.getBoundingClientRect(), W = 220, pad = 16, vw = document.documentElement.clientWidth;
  const left = Math.max(pad, Math.min(vw - pad - W, r.left + r.width / 2 < vw / 2 ? r.left : vw - pad - W));
  const st = document.documentElement.style; st.setProperty('--eco-top', Math.round(r.bottom + 8) + 'px'); st.setProperty('--eco-left', Math.round(left) + 'px');
};
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('scroll', () => { if (ecoPhone() && ecoNow) { ecoNow = false; document.querySelectorAll('.eco-w').forEach((x) => x.classList.remove('open')); } }, { passive: true });
acts['eco.toggle'] = (d, el) => {
  const w = el.closest('.eco-w'), open = !w?.classList.contains('open');
  if (ecoPhone()) { ecoNow = open; if (open) ecoPlace(el.closest('.eco-t') || el); } else try { localStorage.setItem('ecoOpen', open ? '1' : '0'); } catch { /* приватный режим */ }
  document.querySelectorAll('.eco-w').forEach((x) => x.classList.toggle('open', open));
  return false;
};
