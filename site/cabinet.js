// Личный кабинет читателя: вход в шапке (дверца), окно входа по почте и паролю, страница ./?kabinet,
// на странице книги — «Добавить старт в календарь» и «На полку». Тексты — из админки → «Кабинет».
// Данные читателя — в его аккаунте (readers.js), копия — в браузере, чтобы всё показывалось сразу.
import { esc, fmt, findBook, cover, STATUS, startInfo, readerPath, bonusItems, raffleFriday } from './content.js';
import { readers, readerError } from './readers.js';
import { addSub } from './data.js';

const K = 'lanaSite.reader', IN = 'lanaSite.in';
const get = () => { try { return JSON.parse(localStorage.getItem(K) || 'null') || {}; } catch { return {}; } };
let S = get();          // полка, старты в календаре, подарок, вкладка полки
let user = null;        // { uid, email } — кто вошёл
let wins = [];         // её выигрыши в розыгрыше (промокоды)
let redraw = () => {};
let ctx = { c: null, imgs: {} };
let saveT = 0;
const SAVED = ['shelf', 'remind', 'gift', 'name'];
function persist() {
  try { localStorage.setItem(K, JSON.stringify(S)); } catch { /* без памяти */ }
  if (!user) return;
  clearTimeout(saveT);
  saveT = setTimeout(() => readers.save(user.uid, Object.fromEntries(SAVED.map((k) => [k, S[k] || (k === 'gift' ? false : k === 'name' ? '' : {})]))).catch(() => {}), 600);
}
// вошла раньше на этом устройстве — поднимаем вход сразу; иначе библиотеки грузятся только по нажатию на дверцу
const known = () => { try { return localStorage.getItem(IN) === '1'; } catch { return false; } };
let watching = false;
function watch() {
  if (watching) return;
  watching = true;
  readers.onUser(async (u) => {
    user = u;
    try { if (u) localStorage.setItem(IN, '1'); else localStorage.removeItem(IN); } catch { /* ок */ }
    if (u) {
      // что отмечено до входа + что уже лежит в аккаунте
      const r = await readers.load(u.uid).catch(() => null);
      if (r) S = { ...S, shelf: { ...(r.shelf || {}), ...(S.shelf || {}) }, remind: { ...(r.remind || {}), ...(S.remind || {}) }, gift: !!(r.gift || S.gift), name: S.name || r.name || '' };
      persist();
      // розыгрыш: какую книгу выбрала и что выиграла (до обновления правил Firebase — просто пусто)
      const [e, w] = await Promise.all([readers.raffleGet(u.uid).catch(() => null), readers.wins(u.uid).catch(() => [])]);
      if (e?.book) S.raf = e.book;
      wins = (w || []).sort((a, b) => String(b.at).localeCompare(String(a.at)));
      if (S.raf && !e?.book) joinRaffle(S.raf); // выбрала до входа на этом устройстве
    }
    redraw();
  });
}
if (known()) watch();

const DOOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20.5V3.5h10v17"/><path d="M7 3.5l6.2 1.8v13.4L7 20.5"/><path d="M4.5 20.5h15"/><circle cx="11.4" cy="12.4" r=".75"/></svg>'; // приоткрытая дверь
const SHELF = { want: 'Хочу прочитать', reading: 'Читаю', done: 'Прочла' };
const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
const dm = (t) => new Date(t + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const books = () => (ctx.c?.books || []).filter((b) => !b.hidden);
const plainT = (t) => String(t || '').replace(/\*/g, '');
const priceLine = (st, T) => (st.price ? `${T('cabPriceLine', 'Для своих в день старта')} <b>${st.price} ₽</b>${st.old && st.old > st.price ? ` <s>${st.old} ₽</s>` : ''}` : '');

// ---------- старт подписки → в календарь (Google или файл для iPhone и Outlook) ----------
function calLinks(b, st) {
  const d = st.date.replace(/-/g, ''), next = new Date(st.date + 'T12:00:00'); next.setDate(next.getDate() + 1);
  const d2 = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
  const title = `Старт подписки «${plainT(b.title)}» — ${ctx.c?.name || ''}`;
  const page = new URL('./?kniga=' + b.url, location.href).href;
  const details = `${st.price ? `Цена для своих в день старта — ${st.price} ₽. ` : ''}${page}`;
  const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${d}/${d2}&details=${encodeURIComponent(details)}`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//lanafreitag.ru//RU', 'BEGIN:VEVENT', `UID:${b.id}-${d}@lanafreitag.ru`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`,
    `SUMMARY:${title}`, `DESCRIPTION:${details}`, `URL:${page}`, 'BEGIN:VALARM', 'TRIGGER:PT10H', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  return `<span class="cab-cal"><a href="${g}" target="_blank" rel="noopener" data-cab="cal" data-id="${esc(b.id)}">Google Календарь</a><a href="data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}" download="start-${esc(b.url)}.ics" data-cab="cal" data-id="${esc(b.id)}">iPhone и другие</a></span>`;
}

// ---------- вход в шапке ----------
export function headEntry() {
  const txt = user ? 'Кабинет' : 'Войти';
  return `<a class="acc acc-door${user ? ' acc-on' : ''}" href="./?kabinet" data-cab="${user ? 'go' : 'login'}" aria-label="${txt}" title="${user ? 'Личный кабинет' : 'Войти в личный кабинет'}">${DOOR}<span>${txt}</span></a>`;
}

// ---------- окно входа: почта и пароль ----------
// «что даёт кабинет»: строка «Жирное — остальное» → жирное начало
const perks = (c, cls = '') => {
  const ls = [...String(c.cabPerks || '').split('\n'), c.raffleOn ? c.rafPerk || '' : ''].map((x) => x.trim()).filter(Boolean);
  return ls.length ? `<ul class="cab-gets${cls}">${ls.map((l) => { const [a, ...b] = l.split(' — '); return `<li>${b.length ? `<b>${esc(a)}</b> — ${esc(b.join(' — '))}` : esc(l)}</li>`; }).join('')}</ul>` : '';
};
let mode = 'new'; // new — создать кабинет, in — войти, reset — забыли пароль
let pending = null; // что хотели сделать до входа (например, положить книгу на полку)
function sheet(why = '') {
  close();
  watch();
  const c = ctx.c || {};
  document.body.insertAdjacentHTML('beforeend', `<div class="cab-ov" data-cab="close"><div class="cab-sheet" role="dialog" aria-modal="true" aria-labelledby="cabT">
    <button class="cab-x" data-cab="close" aria-label="Закрыть">×</button>
    <h2 id="cabT">${fmt(c.cabTitle || 'Личный кабинет', false)}</h2>
    ${why ? `<p class="cab-why">${esc(why)}</p>` : ''}
    <div class="cab-body">${formHtml(c)}</div></div></div>`);
  document.querySelector('.cab-form input')?.focus();
}
function formHtml(c) {
  if (mode === 'reset') return `<p class="cab-p">Пришлю письмо со ссылкой — по ней задать новый пароль.</p>
    <form class="cab-form" data-cab-form="reset"><input type="email" name="email" placeholder="Почта" autocomplete="email" required>
      <button class="btn btn-dark" type="submit">Прислать письмо</button><p class="cab-err" hidden></p></form>
    <div class="cab-alt"><button class="cab-link" data-cab="mode" data-v="in">← Вспомнила пароль</button></div>`;
  const neu = mode === 'new';
  return `<p class="cab-p">${esc(c.cabText || '')}</p>
    <form class="cab-form" data-cab-form="${mode}">
      ${neu ? '<input type="text" name="uname" placeholder="Как вас зовут" autocomplete="given-name" maxlength="60" required>' : ''}
      <input type="email" name="email" placeholder="Почта" autocomplete="email" required>
      <input type="password" name="pw" placeholder="${neu ? 'Придумайте пароль — от 6 знаков' : 'Пароль'}" autocomplete="${neu ? 'new-password' : 'current-password'}" minlength="6" required>
      <button class="btn btn-dark" type="submit">${esc(neu ? c.cabBtnNew || 'Создать кабинет' : c.cabBtnIn || 'Войти')}</button>
      ${neu ? `<label class="consent"><input type="checkbox" name="ok" required> <span>${esc(c.consent || 'Соглашаюсь получать письма')}${c.privacy ? ' — <a href="./?privacy">политика конфиденциальности</a>' : ''}</span></label>` : ''}
      <p class="cab-err" hidden></p>
    </form>
    <div class="cab-alt">${neu ? '<span>Уже есть кабинет?</span><button class="cab-link" data-cab="mode" data-v="in">Войти</button>'
      : '<button class="cab-link" data-cab="mode" data-v="reset">Забыли пароль?</button><button class="cab-link" data-cab="mode" data-v="new">Создать кабинет</button>'}</div>
    ${neu ? perks(c) : ''}`;
}
function close() { document.querySelector('.cab-ov')?.remove(); }

// ---------- страница книги: старт в календарь и полка ----------
function bookExtras(b) {
  const c = ctx.c || {}, T = (k, d) => esc(c[k] || d);
  const st = startInfo(b, today()), mine = S.shelf?.[b.id];
  return `<div class="cab-book">
    ${st ? `<div class="cab-start"><span class="cab-note">${T('cabStartLine', 'Старт подписки')} ${dm(st.date)}${st.price ? ` · ${priceLine(st, T)}` : ''}</span>
      <span class="cab-calw"><span class="cab-calk">${T('cabRemind', 'Добавить старт в календарь')}:</span>${calLinks(b, st)}</span></div>` : ''}
    <div class="cab-shelf"><span>На полку:</span>${Object.entries(SHELF).map(([k, n]) => `<button class="${mine === k ? 'on' : ''}" data-cab="shelf" data-id="${esc(b.id)}" data-v="${k}">${n}</button>`).join('')}</div>
    ${c.raffleOn && rafBooks().some((x) => x.id === b.id) ? `<div class="cab-shelf"><span>${esc(plainT(c.rafTitle || 'Пятничный подарок'))}:</span>${S.raf === b.id && user ? '<span class="cab-on">ваше желание ✓</span>' : `<button data-cab="raf" data-id="${esc(b.id)}">Хочу эту книгу в подарок</button>`}</div>` : ''}
  </div>`;
}

// ---------- пятничный подарок (розыгрыш промокода на книгу) ----------
// книги для розыгрыша — те, что есть на Литнете (промокоды — литнетовские); ссылок нет ни у одной — все
const rafBooks = () => { const all = books(); const lit = all.filter((b) => b.litnet); return lit.length ? lit : all; };
function joinRaffle(id) {
  S.raf = id;
  persist();
  if (user) readers.raffleSet(user.uid, { uid: user.uid, email: user.email || '', name: S.name || '', book: id, at: new Date().toISOString() }).catch(() => {});
}
function raffleSec(c, head, T, imgs) {
  if (!c.raffleOn) return '';
  const list = rafBooks(), pick = list.find((b) => b.id === S.raf), name = c.name || 'Автор';
  const fresh = wins.filter((w) => Date.now() - new Date(w.at).getTime() < 60 * 864e5);
  // ближайшая «её» пятница: эта уже прошла — следующая; получила подарок — через 4 недели
  const plus = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return raffleFriday(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`); };
  let fri = raffleFriday(today());
  if (c.raffleLast === fri) fri = plus(fri, 7);
  const lastWin = wins[0]?.week ? plus(wins[0].week, 28) : '';
  if (lastWin > fri) fri = lastWin;
  return `<section class="cab-sec">${head(fmt(c.rafTitle || 'Пятничный подарок', false))}
    ${fresh.map((w) => { const b = findBook(c, w.book) || {}; return `<div class="cab-present">
      <div class="lbl">${T('rafWin', 'Подарок для вас')}</div>
      <div class="cab-pt">«${esc(plainT(b.title || w.bookTitle))}»</div>
      <div class="cab-pcode">${esc(w.code)}</div>
      <div class="cab-pacts"><button class="cab-link" data-cab="copy" data-v="${esc(w.code)}">Скопировать код</button>${b.litnet ? `<a class="cab-link" href="${esc(b.litnet)}" target="_blank" rel="noopener">Открыть книгу на Литнете</a>` : ''}</div>
      ${c.rafHow ? `<div class="cab-s">${esc(c.rafHow)}</div>` : ''}</div>`; }).join('')}
    ${c.rafText ? `<p class="cab-p cab-wtext">${esc(c.rafText)}</p>` : ''}
    <div class="cab-wish">${list.map((b) => `<button class="cab-wb${pick?.id === b.id ? ' on' : ''}" data-cab="raf" data-id="${esc(b.id)}" aria-pressed="${pick?.id === b.id}">
      <span class="cab-mc">${cover(b, imgs, name)}</span><span class="cab-t">${fmt(b.title, false)}</span><span class="cab-wl">${pick?.id === b.id ? 'ваше желание' : ''}</span></button>`).join('')}</div>
    <div class="cab-s">${pick ? `Ваше желание — «${esc(plainT(pick.title))}». Ближайшая пятница — ${dm(fri)}.` : 'Отметьте историю, которую хотели бы получить.'}</div>
  </section>`;
}

// «Здравствуйте, Анна!» — имя вставляется перед последним знаком (у «Здравствуйте*!*» — перед восклицанием)
function hello(h, name) {
  if (!name) return fmt(h, false);
  const m = /^(.*?)(\*?[!.]\*?)?$/.exec(String(h).trim());
  return fmt(`${m[1]}, ${name}${m[2] || '!'}`, false);
}
// ---------- кабинет ----------
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
function cabinet(c, imgs) {
  const name = c.name || 'Автор';
  const T = (k, d) => esc(c[k] || d);
  if (!user) return `<section class="cab"><div class="wrap cab-narrow">
      <div class="lbl">${T('cabLabel', 'Личный кабинет')}</div><h1 class="cab-h">${fmt(c.cabIntro || 'Личный кабинет', false)}</h1>
      ${perks(c, ' big')}
      <div class="cab-acts"><button class="btn btn-dark" data-cab="login" data-v="new">${T('cabBtnNew', 'Создать кабинет')}</button><button class="lnk" data-cab="login" data-v="in">${T('cabBtnIn', 'Войти')}</button></div></div></section>`;
  const tab = S.tab || 'reading', t = today();
  const soon = books().map((b) => [b, startInfo(b, t)]).filter(([, s]) => s).sort((a, b) => a[1].days - b[1].days);
  const P = readerPath(S, { gift: !!c.giftUrl, start: soon.length > 0 }), names = lines(c.cabSteps), levels = lines(c.cabLevels);
  const ser = [...new Set(books().map((b) => String(b.series || '').trim()).filter(Boolean))][0] || '';
  const serBooks = ser ? books().filter((b) => String(b.series || '').trim() === ser).sort((a, b) => (Number(a.seriesNo) || 99) - (Number(b.seriesNo) || 99)) : [];
  const serDone = serBooks.filter((b) => S.shelf?.[b.id] === 'done').length;
  const onShelf = books().filter((b) => S.shelf?.[b.id] === tab);
  const shelfN = books().filter((b) => S.shelf?.[b.id]).length;
  const gu = c.giftUrl;
  const head = (title, extra = '') => `<div class="cab-sh"><h2>${title}</h2>${extra}</div>`;
  const nextGo = P.next === 1 && gu ? gu : '';
  const bonus = bonusItems(c.cabBonusItems);
  return `<section class="cab"><div class="wrap">
    <div class="cab-hero">
      <div><div class="lbl">${T('cabLabel', 'Личный кабинет')}</div><h1 class="cab-h">${hello(c.cabHello || 'Здравствуйте', S.name)}</h1>
        <div class="cab-mail">${esc(user.email)} · <button class="cab-link" data-cab="logout">${T('cabOut', 'Выйти')}</button></div>
        ${S.name ? '' : `<form class="cab-name" data-cab-form="name"><input type="text" name="uname" placeholder="Как к вам обращаться?" autocomplete="given-name" maxlength="60" required><button class="cab-link" type="submit">Сохранить</button></form>`}</div>
      <div class="cab-lv">
        <div class="cab-lv-k">${T('cabLevelLabel', 'Ваш статус')}</div>
        <div class="cab-lv-v">${esc(levels[P.level] || '')}</div>
        <div class="cab-seg" aria-label="${P.n} из 5">${P.done.map((x) => `<i class="${x ? 'on' : ''}"></i>`).join('')}</div>
        ${P.next >= 0 ? `<div class="cab-next"><span>${T('cabNextLabel', 'Следующий шаг')}:</span> ${nextGo ? `<a href="${esc(nextGo)}" target="_blank" rel="noopener" data-cab="gift">${esc(names[P.next] || '')} →</a>` : esc(names[P.next] || '')}</div>` : `<div class="cab-next">${T('cabAllDone', 'Все шаги пройдены')}</div>`}
      </div>
    </div>
    <div class="cab-stats">
      ${ser ? `<div><b>${serDone}<small>/${serBooks.length}</small></b><span>${T('cabStatSeries', 'книг цикла прочитано')}</span></div>` : ''}
      <div><b>${shelfN}</b><span>${T('cabStatShelf', 'книг на полке')}</span></div>
      ${soon[0] ? `<div><b>${soon[0][1].days}</b><span>${T('cabStatSoon', 'дней до старта')} «${esc(plainT(soon[0][0].title))}»</span></div>` : ''}
    </div>
    ${gu || soon.length ? `<div class="cab-two">
      ${gu ? `<section class="cab-card">${head(T('cabGift', 'Подарок'))}
        <div class="cab-gift"><div class="cab-gc">${cover({ id: 'gift', title: c.giftName || 'Подарок' }, imgs, name)}</div>
        <div>${c.giftName ? `<div class="cab-t">«${esc(c.giftName)}»</div>` : ''}
          <div class="cab-acts"><a class="btn btn-dark" href="${esc(gu)}" target="_blank" rel="noopener" data-cab="gift">${T('cabDownload', 'Скачать')}</a></div></div></div></section>` : ''}
      ${soon.length ? `<section class="cab-card">${head(T('cabSoon', 'Скоро старт'))}${soon.map(([b, st]) => `<div class="cab-soon">
        <div class="cab-days"><b>${st.days}</b><span>${plural(st.days, ['день', 'дня', 'дней'])}</span></div>
        <div class="cab-rt"><a class="cab-t" href="./?kniga=${esc(b.url)}">${fmt(b.title, false)}</a>
          <div class="cab-s">${T('cabStartLine', 'Старт подписки')} ${dm(st.date)}</div>
          ${st.price ? `<div class="cab-price">${priceLine(st, T)}</div>` : ''}
          <div class="cab-calw"><span class="cab-calk">${S.remind?.[b.id] ? 'В календаре ✓ · ещё раз:' : T('cabCal', 'Добавить в календарь') + ':'}</span>${calLinks(b, st)}</div></div></div>`).join('')}</section>` : ''}
    </div>` : ''}
    ${raffleSec(c, head, T, imgs)}
    <section class="cab-sec">${head(T('cabShelf', 'Моя полка'), `<div class="cab-tabs">${Object.entries({ reading: 'Читаю', done: 'Прочла', want: 'Хочу' }).map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-cab="tab" data-v="${k}">${n} <span>${books().filter((b) => S.shelf?.[b.id] === k).length || ''}</span></button>`).join('')}</div>`)}
      ${ser ? `<div class="cab-series"><div class="cab-s">Цикл «${esc(ser)}» · ${serDone} из ${serBooks.length}</div>
        <div class="cab-sline">${serBooks.map((b) => `<a class="cab-sdot${S.shelf?.[b.id] === 'done' ? ' on' : S.shelf?.[b.id] === 'reading' ? ' mid' : ''}" href="./?kniga=${esc(b.url)}" title="${esc(plainT(b.title))}"><i></i><span>${Number(b.seriesNo) || serBooks.indexOf(b) + 1}</span></a>`).join('<em></em>')}</div></div>` : ''}
      ${onShelf.length ? `<div class="cab-shelfg">${onShelf.map((b) => `<a class="cab-sb" href="./?kniga=${esc(b.url)}"><div class="cab-mc">${cover(b, imgs, name)}</div><div class="cab-t">${fmt(b.title, false)}</div><div class="cab-s">${esc(STATUS[b.status] || '')}</div></a>`).join('')}</div>`
        : `<p class="cab-empty">${tab === 'reading' ? T('cabEmptyReading', 'Пока ничего.') : tab === 'done' ? T('cabEmptyDone', 'Пока ничего.') : T('cabEmptyWant', 'Пока ничего.')}</p>`}</section>
    ${bonus.length ? `<section class="cab-sec">${head(T('cabBonus', 'Только для своих'))}<ul class="cab-bonus">${bonus.map((x) => `<li>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)} →</a>` : esc(x.title)}</li>`).join('')}</ul></section>` : ''}
  </div></section>`;
}

// ---------- для site.js ----------
export function page(c, imgs, which) {
  ctx = { c, imgs };
  if (which === 'kabinet') return { title: `Личный кабинет — ${c.name || ''}`, main: cabinet(c, imgs) };
  return null;
}
export function after(c, imgs, bookKey, rerender) {
  ctx = { c, imgs }; redraw = rerender;
  const r = document.querySelector('.top-r');
  if (r && !r.querySelector('.acc')) r.insertAdjacentHTML('afterbegin', headEntry());
  if (user) document.getElementById('podpiska')?.remove(); // уже свой — форма подписки внизу не нужна
  const b = bookKey && findBook(c, bookKey);
  if (b) document.querySelector('.bk-top .buy')?.insertAdjacentHTML('afterend', bookExtras(b));
  if (new URLSearchParams(location.search).has('kabinet') && known() && !user) watch();
}

async function act(name, d) {
  if (name === 'login') { mode = d.v || 'new'; sheet(); return; }
  if (name === 'close') { close(); return; }
  if (name === 'go') { location.href = './?kabinet'; return; }
  if (name === 'mode') { mode = d.v; const b = document.querySelector('.cab-body'); if (b) { b.innerHTML = formHtml(ctx.c || {}); b.querySelector('input')?.focus(); } return; }
  if (name === 'copy') { navigator.clipboard?.writeText(d.v).then(() => { const b = document.querySelector(`[data-cab="copy"][data-v="${CSS.escape(d.v)}"]`); if (b) b.textContent = 'Скопировано'; }).catch(() => {}); return; }
  if (name === 'raf') {
    if (!user) { pending = { name, d: { ...d } }; mode = 'new'; sheet('Пятничный подарок — для своих. Создайте кабинет, и каждую пятницу одна из моих книг может достаться вам.'); return; }
    joinRaffle(d.id); redraw(); return;
  }
  if (name === 'shelf') {
    if (!user) { pending = { name, d: { ...d } }; mode = 'new'; sheet('Полка хранится в кабинете — создайте его, и она будет с вами на любом устройстве. Это минута.'); return; }
    S.shelf = { ...(S.shelf || {}), [d.id]: S.shelf?.[d.id] === d.v ? '' : d.v };
  }
  if (name === 'cal') { S.remind = { ...(S.remind || {}), [d.id]: true }; persist(); return; }
  if (name === 'gift') { S.gift = true; persist(); return; }
  if (name === 'tab') S.tab = d.v;
  if (name === 'logout') { await readers.signOut().catch(() => {}); user = null; S = {}; try { localStorage.removeItem(K); localStorage.removeItem(IN); } catch { /* ок */ } location.href = './'; return; }
  persist(); redraw();
}
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-cab]');
  if (!el || (el.classList.contains('cab-ov') && e.target !== el)) return; // нажали внутри окна — не закрываем
  // ссылки «скачать подарок» и «в календарь» открываются как обычно — только отмечаем шаг
  if (['cal', 'gift'].includes(el.dataset.cab)) { act(el.dataset.cab, { ...el.dataset }); setTimeout(redraw, 300); return; }
  e.preventDefault();
  act(el.dataset.cab, { ...el.dataset });
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-cab-form]');
  if (!f) return;
  e.preventDefault();
  if (f.dataset.cabForm === 'name') { S.name = f.uname.value.trim(); persist(); if (S.raf) joinRaffle(S.raf); redraw(); return; }
  const mail = f.email.value.trim(), how = f.dataset.cabForm, err = f.querySelector('.cab-err'), btn = f.querySelector('button[type=submit]');
  const say = (t) => { err.hidden = !t; err.textContent = t || ''; };
  say(''); btn.disabled = true;
  try {
    if (how === 'reset') {
      await readers.reset(mail);
      f.closest('.cab-body').innerHTML = `<p class="cab-p">Письмо для смены пароля отправлено на <b>${esc(mail)}</b>. Нет письма — загляните в «Спам».</p>
        <div class="cab-alt"><button class="cab-link" data-cab="mode" data-v="in">← Ко входу</button></div>`;
      return;
    }
    if (how === 'new') {
      const nm = f.uname.value.trim();
      user = await readers.signUp(mail, f.pw.value);
      S.name = nm;
      addSub(mail, 'kabinet', nm).catch(() => {}); // почта и имя — в «Подписчики» админки (согласие дано)
    } else user = await readers.signIn(mail, f.pw.value);
    try { localStorage.setItem(IN, '1'); } catch { /* ок */ }
    watch();
    close();
    if (pending) { const p = pending; pending = null; await act(p.name, p.d); } else redraw();
  } catch (x) { say(readerError(x)); } finally { btn.disabled = false; }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
