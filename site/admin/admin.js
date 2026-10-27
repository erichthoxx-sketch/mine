// Админка сайта: блоки (порядок, скрыть, удалить, добавить), книги, цвета, общее.
// Всё сохраняется само через секунду после правки; справа — живой сайт.
import { BLOCKS, BOOK_FIELDS, PALETTES, STATUS, DEFAULT_CONTENT, normalize, newBlock, newBook, newId, colors, esc } from '../content.js';
import { openStore, authError } from './store.js';
import { RULES } from './rules.js';

const app = document.getElementById('app');
const S = { store: null, user: null, phase: 'boot', content: null, imgs: {}, tab: 'blocks', open: null, adding: false, pasting: false, pv: false, save: 'ok' };

const ICON = {
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;
const plain = (s) => String(s ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const TYPE_NOTE = {
  hero: 'Большая фраза и книга справа', marquee: 'Строка, которая плывёт', book: 'Одна книга с аннотацией и кнопкой',
  series: 'Название цикла и его книги по порядку', start: 'Несколько книг на выбор', books: 'Все книги сеткой', quote: 'Цитата из книги на тумане',
  about: 'Фото, текст и цифры', tg: 'Тёмная полоса с кнопкой', text: 'Заголовок и абзацы',
};

// ---------- запуск ----------
(async () => {
  try { S.store = await openStore(); } catch { app.innerHTML = '<div class="boot">Нет интернета — обновите страницу.</div>'; return; }
  S.store.onUser((u) => { S.user = u; if (!u) { S.phase = 'login'; render(); } else loadAll(); });
})();

async function loadAll() {
  S.phase = 'loading'; render();
  try {
    const d = await S.store.load();
    if (d.owner === 'other') { S.phase = 'other'; render(); return; }
    S.content = normalize(d.content);
    S.imgs = d.imgs || {};
    S.phase = 'ready'; render();
    cleanImgs();
  } catch (e) {
    S.phase = /permission/i.test(e?.code || e?.message || '') ? 'rules' : 'neterr';
    render();
  }
}

// Картинки, которые больше нигде не стоят (заменили обложку, удалили книгу), убираем при следующем входе
function cleanImgs() {
  const used = new Set([...S.content.books.map((b) => b.cover), ...S.content.blocks.map((b) => b.photo)].filter(Boolean));
  for (const id of Object.keys(S.imgs)) if (!used.has(id)) { delete S.imgs[id]; S.store.delImg(id).catch(() => {}); }
}

// ---------- экраны ----------
function render() {
  if (S.phase !== 'ready') document.querySelector('.adm')?.remove();
  if (S.phase === 'boot' || S.phase === 'loading') { app.innerHTML = '<div class="boot">Загрузка…</div>'; return; }
  if (S.phase === 'login') { app.innerHTML = loginHtml(); return; }
  if (S.phase === 'rules') { app.innerHTML = rulesHtml(); return; }
  if (S.phase === 'other') {
    app.innerHTML = `<div class="card"><h1 class="card-h">Сайт <i>занят</i></h1><p>Этот сайт закреплён за другой почтой. Войдите той почтой, с которой открывали админку в первый раз.</p><div><button class="btn line" data-act="out">Выйти</button></div></div>`;
    return;
  }
  if (S.phase === 'neterr') {
    app.innerHTML = `<div class="card"><h1 class="card-h">Нет <i>связи</i></h1><p>Не получилось загрузить сайт. Проверьте интернет.</p><div><button class="btn" data-act="retry">Попробовать ещё раз</button></div></div>`;
    return;
  }
  if (!document.querySelector('.adm')) {
    app.innerHTML = `<div class="adm">
      <aside class="ed">
        <div class="ed-top"><span class="logo">${esc(S.content.name || 'Сайт')}</span><span class="sp"></span><span class="saved" id="saved"></span></div>
        <nav class="tabs" role="tablist" id="tabs"></nav>
        <div class="ed-body" id="body"></div>
      </aside>
      <section class="pv"><iframe id="pv" title="Как выглядит сайт" src="../index.html?preview=1"></iframe></section>
      <nav class="mtabs" id="mtabs"></nav>
    </div>`;
  }
  renderEditor();
}

function renderEditor() {
  const tabs = [['blocks', 'Блоки'], ['books', 'Книги'], ['look', 'Цвета'], ['general', 'Общее']];
  document.getElementById('tabs').innerHTML = tabs.map(([k, n]) => `<button role="tab" aria-selected="${S.tab === k}" data-act="tab" data-t="${k}">${n}</button>`).join('');
  document.getElementById('mtabs').innerHTML = `<button aria-selected="${!S.pv}" data-act="pv" data-v="0">Правка</button><button aria-selected="${S.pv}" data-act="pv" data-v="1">Сайт</button>`;
  document.querySelector('.adm').classList.toggle('show-pv', S.pv);
  document.querySelector('.ed-top .logo').textContent = S.content.name || 'Сайт';
  const body = document.getElementById('body');
  body.innerHTML = { blocks: blocksTab, books: booksTab, look: lookTab, general: generalTab }[S.tab]();
  body.querySelectorAll('textarea').forEach(grow);
  applyColors();
  status();
}

function loginHtml() {
  return `<form class="login" data-form="login"><div class="login-box">
    <div class="mist-line"></div>
    <h1>Сайт <i>· админка</i></h1>
    <p class="muted">Та же почта и пароль, что в «Доходах» и «Мастерской».</p>
    <label class="f"><span>Почта</span><input id="l-email" type="email" autocomplete="email" required></label>
    <label class="f"><span>Пароль</span><input id="l-pw" type="password" autocomplete="current-password" required></label>
    <div class="err" id="l-err"></div>
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap"><button class="btn" type="submit">Войти</button><button class="quiet" type="button" data-act="reset">Забыли пароль?</button></div>
  </div></form>`;
}

function rulesHtml() {
  return `<div class="card">
    <div class="mist-line"></div>
    <h1 class="card-h">Один раз: <i>разрешить сайт</i></h1>
    <p>Чтобы сайт показывал ваши тексты всем читателям, а менять их могли только вы, Firebase нужно новое правило. Это делается один раз.</p>
    <ol>
      <li>Нажмите «Скопировать правила».</li>
      <li>Откройте <a href="https://console.firebase.google.com/project/dohody-6d6dd/firestore/rules" target="_blank" rel="noopener">Firebase → Firestore → Правила</a>.</li>
      <li>Выделите там весь текст, вставьте скопированный и нажмите «Опубликовать».</li>
      <li>Вернитесь сюда и нажмите «Готово, проверить».</li>
    </ol>
    <div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn" data-act="copyRules">Скопировать правила</button><button class="btn line" data-act="retry">Готово, проверить</button></div>
    <pre id="rules-text">${esc(RULES)}</pre>
    <div><button class="quiet" data-act="out">Выйти</button></div>
  </div>`;
}

// ---------- вкладки ----------
const bookTitle = (id) => plain(S.content.books.find((b) => b.id === id)?.title);
function blockSummary(b) {
  if (b.type === 'book' || (b.type === 'hero' && !b.title)) return bookTitle(b.book) || '—';
  if (b.type === 'start') return (b.books || []).map(bookTitle).filter(Boolean).join(', ') || plain(b.title);
  return plain(b.title || b.text || b.items || b.label || '') || '—';
}

function row({ id, scope, i, n, title, sum, off, thumb, body }) {
  const open = S.open === id;
  return `<div class="row${open ? ' open' : ''}${off ? ' off' : ''}">
    <div class="row-h">
      <button class="row-main" data-act="open" data-id="${id}" aria-expanded="${open}">${thumb || ''}<b>${esc(title)}</b><span data-lab="${id}">${esc(sum)}</span></button>
      <button class="ico" data-act="move" data-s="${scope}" data-id="${id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Выше" title="Выше">${ic('up')}</button>
      <button class="ico" data-act="move" data-s="${scope}" data-id="${id}" data-d="1" ${i === n - 1 ? 'disabled' : ''} aria-label="Ниже" title="Ниже">${ic('down')}</button>
      <button class="ico" data-act="hide" data-s="${scope}" data-id="${id}" aria-label="${off ? 'Показать' : 'Скрыть'}" title="${off ? 'Скрыто — показать' : 'Скрыть с сайта'}">${ic(off ? 'eyeOff' : 'eye')}</button>
      <button class="ico" data-act="del" data-s="${scope}" data-id="${id}" aria-label="Удалить" title="Удалить">${ic('trash')}</button>
    </div>
    ${open ? `<div class="row-b">${body()}</div>` : ''}
  </div>`;
}

function blocksTab() {
  const bl = S.content.blocks;
  return `<p class="note">Нажмите на блок, чтобы изменить. Стрелки — порядок на сайте, глаз — скрыть, не удаляя.</p>
    <div class="list">${bl.map((b, i) => row({
      id: b.id, scope: 'block', i, n: bl.length, title: BLOCKS[b.type].name, sum: blockSummary(b), off: b.hidden,
      body: () => BLOCKS[b.type].fields.map((f) => field('block', b, f)).join(''),
    })).join('')}</div>
    ${S.adding ? `<div class="types">${Object.entries(BLOCKS).map(([t, d]) => `<button data-act="addBlock" data-t="${t}"><b>${d.name}</b><small>${TYPE_NOTE[t]}</small></button>`).join('')}</div>
      <button class="quiet" data-act="adding" style="margin-top:12px">Отмена</button>`
    : '<button class="add" data-act="adding">+ Добавить блок</button>'}`;
}

function thumb(b) {
  const src = b.cover && S.imgs[b.cover];
  return src ? `<img class="thumb" src="${esc(src)}" alt="">` : '<span class="thumb ph"></span>';
}

function booksTab() {
  const bs = S.content.books;
  return `<p class="note">Книги появляются в блоках «Книга крупно», «Подборка книг» и «Все книги». Скрытая книга не видна нигде.</p>
    <div class="list">${bs.map((b, i) => row({
      id: b.id, scope: 'book', i, n: bs.length, title: plain(b.title) || 'Без названия', sum: STATUS[b.status] || '', off: b.hidden, thumb: thumb(b),
      body: () => bookForm(b),
    })).join('')}</div>
    <button class="add" data-act="addBook">+ Новая книга</button>`;
}

function bookForm(b) {
  const F = Object.fromEntries(BOOK_FIELDS.map((f) => [f.k, f]));
  const one = (k) => field('book', b, F[k]);
  return [one('title'), one('cover'), one('mood'), one('short'), one('ann'), one('status'),
    `<div class="three">${one('done')}${one('total')}${one('al')}</div>`,
    '<span class="lbl">Где читать</span>', one('litnet'), one('litres'), one('litmarket'), one('litgorod')].join('');
}

function lookTab() {
  const c = S.content;
  const cur = colors(c);
  return `<h3 class="sub">Акценты</h3>
    <p class="note">Два цвета туманного фона, на котором стоят обложки: светлый сверху, глубокий снизу. Всё остальное на сайте — графит и белое, цвет дают ваши обложки.</p>
    <div class="pal">${PALETTES.map((p) => `<button data-act="pal" data-p="${p.id}" aria-pressed="${c.palette === p.id}"><span class="sw" style="background:linear-gradient(135deg,${p.a1} 50%,${p.a2} 50%)"></span>${p.name}</button>`).join('')}</div>
    <div class="custom">
      <span class="muted">Свои цвета</span>
      <label><input type="color" id="c-a1" data-s="site" data-k="a1" value="${cur.a1}" aria-label="Первый цвет"></label>
      <label><input type="color" id="c-a2" data-s="site" data-k="a2" value="${cur.a2}" aria-label="Второй цвет"></label>
      ${c.palette === 'custom' ? '<span class="muted">выбраны</span>' : ''}
    </div>`;
}

function generalTab() {
  const c = S.content;
  const site = new URL('../', location.href).href;
  return `<h3 class="sub">Шапка и подвал</h3>
    <div class="list" style="gap:16px">
      ${field('site', c, { k: 'name', label: 'Имя автора', hint: 'Крупно в шапке и внизу сайта' })}
      <div class="two">${field('site', c, { k: 'headBtn', label: 'Кнопка в шапке' })}${field('site', c, { k: 'headUrl', label: 'Её ссылка', type: 'url' })}</div>
      ${field('site', c, { k: 'foot', label: 'Ссылки внизу', type: 'area', hint: 'Каждая с новой строки: Telegram — https://t.me/…  Без ссылки строка не показывается.' })}
    </div>
    <h3 class="sub">Нейросеть</h3>
    <p class="note">Скопируйте сайт для любой нейросети (Claude, ChatGPT…), попросите поправить тексты и вставьте её ответ сюда — сайт обновится. До вставки можно вернуть как было.</p>
    <div class="links"><button class="btn line" data-act="copyAI">Скопировать для нейросети</button><button class="quiet" data-act="pasting">Вставить ответ</button></div>
    ${S.pasting ? `<div style="display:grid;gap:10px;margin-top:14px"><textarea class="paste" id="ai-answer" placeholder="Вставьте сюда ответ нейросети целиком"></textarea><div class="links"><button class="btn" data-act="applyAI">Применить</button><button class="quiet" data-act="pasting">Отмена</button></div></div>` : ''}
    <h3 class="sub">Копия сайта</h3>
    <p class="note">Всё содержимое и картинки одним файлом — на всякий случай.</p>
    <div class="links"><button class="quiet" data-act="backup">Скачать копию</button><label class="quiet file">Восстановить из копии<input type="file" accept=".json,application/json" data-act-file="restore"></label></div>
    <h3 class="sub">Вход</h3>
    <p class="note">${esc(S.user?.email || '')}</p>
    <div class="links"><a class="quiet" href="${esc(site)}" target="_blank" rel="noopener">Открыть сайт</a><button class="quiet" data-act="out">Выйти</button></div>`;
}

// ---------- поля ----------
function field(scope, obj, f) {
  const id = `f-${obj.id || 'site'}-${f.k}`;
  const v = obj[f.k] ?? '';
  const at = `id="${id}" data-s="${scope}" data-id="${obj.id || ''}" data-k="${f.k}"`;
  const hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
  const books = S.content.books;
  switch (f.type) {
    case 'area': return `<label class="f"><span>${f.label}</span><textarea ${at} rows="1">${esc(v)}</textarea>${hint}</label>`;
    case 'book': return `<label class="f"><span>${f.label}</span><select ${at}><option value="">— без книги —</option>${books.map((b) => `<option value="${b.id}"${b.id === v ? ' selected' : ''}>${esc(plain(b.title))}</option>`).join('')}</select>${hint}</label>`;
    case 'status': return `<label class="f"><span>${f.label}</span><select ${at}>${Object.entries(STATUS).map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
    case 'books': return `<div class="f"><span>${f.label}</span><div class="checks">${books.map((b) => `<label><input type="checkbox" data-s="${scope}" data-id="${obj.id}" data-k="${f.k}" data-book="${b.id}"${(v || []).includes(b.id) ? ' checked' : ''}>${esc(plain(b.title))}</label>`).join('')}</div>${hint}</div>`;
    case 'img': {
      const src = v && S.imgs[v];
      return `<div class="f"><span>${f.label}</span><div class="img-f">${src ? `<img src="${esc(src)}" alt="">` : '<span class="ph"></span>'}
        <div class="acts"><label class="btn line file">${src ? 'Заменить' : 'Загрузить'}<input type="file" accept="image/*" ${at}></label>
        ${src ? `<button class="quiet" data-act="noimg" data-s="${scope}" data-id="${obj.id || ''}" data-k="${f.k}">Убрать</button>` : ''}</div></div>${hint}</div>`;
    }
    case 'num': return `<label class="f"><span>${f.label}</span><input ${at} inputmode="numeric" value="${esc(v)}"></label>`;
    case 'url': return `<label class="f"><span>${f.label}</span><input ${at} type="url" inputmode="url" placeholder="https://" value="${esc(v)}">${hint}</label>`;
    default: return `<label class="f"><span>${f.label}</span><input ${at} value="${esc(v)}">${hint}</label>`;
  }
}

const target = (s, id) => (s === 'site' ? S.content : (s === 'block' ? S.content.blocks : S.content.books).find((x) => x.id === id));
const listOf = (s) => (s === 'block' ? S.content.blocks : S.content.books);
const grow = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };

app.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset.k || el.type === 'checkbox' || el.type === 'file') return;
  const o = target(el.dataset.s, el.dataset.id);
  if (!o) return;
  const num = el.getAttribute('inputmode') === 'numeric';
  o[el.dataset.k] = num ? (el.value.trim() === '' ? '' : Number(el.value.replace(/\D/g, '')) || 0) : el.value;
  if (el.type === 'color') { S.content.palette = 'custom'; const other = el.dataset.k === 'a1' ? 'a2' : 'a1'; S.content[other] ||= colors({ ...S.content, palette: 'summer' })[other]; applyColors(); }
  if (el.tagName === 'TEXTAREA') grow(el);
  const lab = document.querySelector(`[data-lab="${el.dataset.id}"]`);
  if (lab && el.dataset.s === 'block') lab.textContent = blockSummary(o);
  if (el.dataset.k === 'name') document.querySelector('.ed-top .logo').textContent = el.value || 'Сайт';
  changed();
});

app.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.type === 'checkbox' && el.dataset.book) {
    const o = target(el.dataset.s, el.dataset.id);
    const box = el.closest('.checks');
    const on = new Set([...box.querySelectorAll('input:checked')].map((x) => x.dataset.book));
    const kept = (o[el.dataset.k] || []).filter((id) => on.has(id));
    o[el.dataset.k] = [...kept, ...[...on].filter((id) => !kept.includes(id))];
    document.querySelector(`[data-lab="${o.id}"]`).textContent = blockSummary(o);
    changed();
  } else if (el.type === 'file' && el.dataset.k && el.files[0]) {
    await uploadImg(el, el.files[0]);
  } else if (el.type === 'file' && el.dataset.actFile === 'restore' && el.files[0]) {
    await restore(el.files[0]);
  } else if (el.tagName === 'SELECT' || el.type === 'color') {
    if (S.tab === 'look') renderEditor();
    else { const o = target(el.dataset.s, el.dataset.id); const lab = o && document.querySelector(`[data-lab="${o.id}"]`); if (lab) lab.textContent = el.dataset.s === 'block' ? blockSummary(o) : STATUS[o.status] || ''; }
  }
});

app.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (e.target.dataset.form !== 'login') return;
  const err = document.getElementById('l-err');
  err.textContent = '';
  try { await S.store.signIn(document.getElementById('l-email').value.trim(), document.getElementById('l-pw').value); } catch (x) { err.textContent = authError(x); }
});

// ---------- действия ----------
const acts = {
  tab: (d) => { S.tab = d.t; S.open = null; S.adding = false; S.pasting = false; },
  pv: (d) => { S.pv = d.v === '1'; },
  open: (d) => {
    S.open = S.open === d.id ? null : d.id;
    if (S.open && S.tab === 'blocks') preview(d.id);
    if (S.open && S.tab === 'books') { const k = S.content.blocks.find((b) => !b.hidden && (b.book === d.id || (b.books || []).includes(d.id))); if (k) preview(k.id); }
  },
  move: (d) => {
    const L = listOf(d.s), i = L.findIndex((x) => x.id === d.id), j = i + Number(d.d);
    if (j < 0 || j >= L.length) return false;
    [L[i], L[j]] = [L[j], L[i]];
    changed(d.s === 'block' ? d.id : null);
  },
  hide: (d) => { const o = target(d.s, d.id); o.hidden = !o.hidden; changed(); toast(o.hidden ? 'Скрыто с сайта' : 'Снова на сайте'); },
  del: (d) => {
    const snap = structuredClone(S.content);
    const o = target(d.s, d.id);
    if (d.s === 'block') S.content.blocks = S.content.blocks.filter((x) => x.id !== d.id);
    else {
      S.content.books = S.content.books.filter((x) => x.id !== d.id);
      for (const b of S.content.blocks) { if (b.book === d.id) b.book = ''; if (Array.isArray(b.books)) b.books = b.books.filter((x) => x !== d.id); }
    }
    changed();
    toast(d.s === 'block' ? `Блок «${BLOCKS[o.type].name}» удалён` : `Книга «${plain(o.title)}» удалена`, () => { S.content = snap; changed(); renderEditor(); });
  },
  adding: () => { S.adding = !S.adding; },
  addBlock: (d) => {
    const proto = DEFAULT_CONTENT.blocks.find((b) => b.type === d.t);
    const nb = { ...newBlock(d.t), ...(proto ? structuredClone(proto) : {}), id: newId('k'), menu: '' };
    if (d.t === 'books') nb.title = 'Все книги';
    if (d.t === 'text') nb.title = 'Новый блок';
    const at = S.content.blocks.findIndex((b) => b.id === S.open);
    S.content.blocks.splice(at >= 0 ? at + 1 : S.content.blocks.length, 0, nb);
    S.open = nb.id; S.adding = false;
    changed(nb.id);
  },
  addBook: () => {
    const b = { ...newBook(), title: 'Новая книга' };
    S.content.books.unshift(b);
    S.open = b.id;
    changed();
  },
  pal: (d) => { S.content.palette = d.p; changed(); },
  noimg: (d) => { const o = target(d.s, d.id); o[d.k] = ''; changed(); },
  out: async () => { await S.store.signOut(); if (S.store.local) toast('В пробном режиме выходить некуда'); return false; },
  retry: () => { loadAll(); return false; },
  reset: async () => {
    const email = document.getElementById('l-email').value.trim();
    const err = document.getElementById('l-err');
    if (!email) { err.textContent = 'Впишите почту — пришлём ссылку для нового пароля.'; return false; }
    try { await S.store.reset(email); toast('Письмо для нового пароля отправлено'); } catch (x) { err.textContent = authError(x); }
    return false;
  },
  copyRules: async () => { await copy(RULES, 'rules-text'); return false; },
  copyAI: async () => { await copy(aiText()); return false; },
  pasting: () => { S.pasting = !S.pasting; },
  applyAI: () => {
    const raw = document.getElementById('ai-answer').value;
    let next;
    try { next = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { next = null; }
    if (!next || !Array.isArray(next.blocks)) { toast('Не нашла в ответе содержимого сайта. Попросите нейросеть прислать его целиком одним блоком кода.'); return false; }
    const snap = structuredClone(S.content);
    S.content = normalize({ ...S.content, ...next });
    S.pasting = false;
    changed();
    toast('Ответ нейросети применён', () => { S.content = snap; changed(); renderEditor(); });
  },
  backup: () => {
    const blob = new Blob([JSON.stringify({ site: 1, content: S.content, imgs: S.imgs })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sait_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return false;
  },
};

app.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  e.preventDefault();
  const r = await acts[el.dataset.act]?.(el.dataset, el, e);
  if (r !== false && S.phase === 'ready') renderEditor();
});

// ---------- сохранение и предпросмотр ----------
let saveT = null, pvReady = false, pvT = null, pvGoto = null;
function changed(goto) {
  S.save = 'busy'; status();
  clearTimeout(saveT);
  saveT = setTimeout(saveNow, 800);
  preview(goto);
}
async function saveNow() {
  saveT = null;
  try { await S.store.saveContent(S.content); S.save = 'ok'; } catch { S.save = 'bad'; setTimeout(() => { if (S.save === 'bad') changed(); }, 15000); }
  status();
}
function status() {
  const el = document.getElementById('saved');
  if (!el) return;
  el.className = 'saved' + (S.save === 'busy' ? ' busy' : S.save === 'bad' ? ' bad' : '');
  el.innerHTML = `<i></i>${S.save === 'busy' ? 'Сохраняю…' : S.save === 'bad' ? 'Не сохранилось — повторю' : S.store?.local ? 'Пробный режим' : 'Всё сохранено'}`;
}
addEventListener('beforeunload', (e) => { if (S.save !== 'ok') { e.preventDefault(); e.returnValue = ''; } });

function preview(goto) {
  if (goto) pvGoto = goto;
  clearTimeout(pvT);
  pvT = setTimeout(() => {
    const f = document.getElementById('pv');
    if (!f || !pvReady) return;
    f.contentWindow.postMessage({ kind: 'site', content: S.content, imgs: S.imgs, goto: pvGoto }, location.origin);
    pvGoto = null;
  }, 120);
}
addEventListener('message', (e) => { if (e.origin === location.origin && e.data?.kind === 'ready') { pvReady = true; preview(); } });

function applyColors() {
  const c = colors(S.content);
  document.documentElement.style.setProperty('--a1', c.a1);
  document.documentElement.style.setProperty('--a2', c.a2);
}

// ---------- картинки ----------
// Сжимаем на телефоне до ~1100 px — картинка ложится в базу и быстро грузится у читателей
async function shrink(file) {
  const img = await createImageBitmap(file);
  let max = 1100, q = 0.85;
  for (;;) {
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const d = cv.toDataURL('image/jpeg', q);
    if (d.length < 700000 || max < 400) return d;
    max = Math.round(max * 0.8); q = Math.max(0.7, q - 0.05);
  }
}
async function uploadImg(el, file) {
  const o = target(el.dataset.s, el.dataset.id);
  S.save = 'busy'; status();
  try {
    const data = await shrink(file);
    const id = newId('i');
    await S.store.putImg(id, data);
    S.imgs[id] = data;
    o[el.dataset.k] = id;
    changed();
    renderEditor();
  } catch {
    S.save = 'ok'; status();
    toast('Не получилось загрузить картинку. Попробуйте другой файл (JPG или PNG).');
  }
}

async function restore(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch { d = null; }
  if (!d?.content?.blocks) { toast('Это не копия сайта'); return; }
  const snap = structuredClone(S.content);
  for (const [id, data] of Object.entries(d.imgs || {})) if (!S.imgs[id]) { await S.store.putImg(id, data); S.imgs[id] = data; }
  S.content = normalize(d.content);
  changed(); renderEditor();
  toast('Сайт восстановлен из копии', () => { S.content = snap; changed(); renderEditor(); });
}

// ---------- нейросеть ----------
function aiText() {
  const types = Object.entries(BLOCKS).map(([t, d]) => `${t} — ${d.name}`).join('; ');
  return `Это содержимое моего авторского сайта (я пишу любовные романы). Помоги улучшить тексты: [напишите, что нужно].

Правила ответа: верни ВЕСЬ JSON целиком одним блоком кода. Не меняй поля id, type, cover, photo. Можно менять тексты, порядок блоков (массив blocks), добавлять блоки и книги (новый id — любая уникальная строка).
- blocks — блоки сайта сверху вниз; типы: ${types}
- books — книги; status: writing (пишется) или done (завершена)
- *слово в звёздочках* — тонкий курсив; hidden: true — скрыто с сайта; menu — пункт меню сверху

\`\`\`json
${JSON.stringify(S.content, null, 2)}
\`\`\``;
}

async function copy(text, fallbackId) {
  try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch {
    const el = fallbackId && document.getElementById(fallbackId);
    if (el) { const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); }
    toast('Не получилось скопировать — выделите текст и скопируйте вручную');
  }
}

// ---------- уведомление с «Вернуть» ----------
function toast(text, undo) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button">Вернуть</button>' : ''}`;
  if (undo) t.querySelector('button').onclick = () => { undo(); t.remove(); };
  document.body.append(t);
  setTimeout(() => t.remove(), undo ? 8000 : 3500);
}
