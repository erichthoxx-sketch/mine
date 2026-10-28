// Личный кабинет читателя — ПРОТОТИП. Виден только по ссылке ./?proto (дальше помнится в этой вкладке), читатели сайта его не видят.
// Всё хранится в этом браузере, пароль не проверяется, письма не отправляются.
// Тексты окна входа и кабинета — из админки → «Кабинет». Настоящий вход (почта + пароль), напоминания и цены — следующий шаг.
import { esc, fmt, findBook, cover, STATUS } from './content.js';

const K = 'lanaSite.reader', VK = 'lanaSite.protoIcon';
const get = () => { try { return JSON.parse(localStorage.getItem(K) || 'null') || {}; } catch { return {}; } };
let S = get();
const put = () => { try { localStorage.setItem(K, JSON.stringify(S)); } catch { /* без памяти */ } };
const variant = () => { try { return sessionStorage.getItem(VK) || 'door'; } catch { return 'door'; } };
let redraw = () => {};
let ctx = { c: null, imgs: {} };

const DOOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 20.5V3.5h10v17"/><path d="M7 3.5l6.2 1.8v13.4L7 20.5"/><path d="M4.5 20.5h15"/><circle cx="11.4" cy="12.4" r=".75"/></svg>'; // приоткрытая дверь
const SHELF = { want: 'Хочу прочитать', reading: 'Читаю', done: 'Прочла' };
const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
const dm = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
// Пример старта подписки для книги, которая пишется (в админке будут поля «Дата старта» и «Цена в день старта»)
function startOf(b) {
  if (b.status !== 'writing') return null;
  const date = new Date(); date.setDate(date.getDate() + 18);
  return { date, days: 18, price: 99, old: 149 };
}
const books = () => (ctx.c?.books || []).filter((b) => !b.hidden);

// ---------- вход в шапке ----------
export function headEntry() {
  const on = !!S.email, txt = on ? 'Кабинет' : 'Войти', door = variant() === 'door';
  return `<a class="acc${door ? ' acc-door' : ''}${on ? ' acc-on' : ''}" href="./?kabinet" data-cab="${on ? 'go' : 'login'}" aria-label="${txt}" title="${on ? 'Личный кабинет' : 'Войти в личный кабинет'}">${door ? DOOR : ''}<span>${txt}</span></a>`;
}

// ---------- окно входа: почта и пароль (тексты — из админки → «Кабинет») ----------
// «что даёт кабинет»: строка «Жирное — остальное» → жирное начало
const perks = (c, cls = '') => {
  const ls = String(c.cabPerks || '').split('\n').map((x) => x.trim()).filter(Boolean);
  return ls.length ? `<ul class="cab-gets${cls}">${ls.map((l) => { const [a, ...b] = l.split(' — '); return `<li>${b.length ? `<b>${esc(a)}</b> — ${esc(b.join(' — '))}` : esc(l)}</li>`; }).join('')}</ul>` : '';
};
let mode = 'new'; // new — создать кабинет, in — войти, reset — забыли пароль
function sheet(why = '') {
  close();
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
      <button class="btn btn-dark" type="submit">Прислать письмо</button></form>
    <div class="cab-alt"><button class="cab-link" data-cab="mode" data-v="in">← Вспомнила пароль</button></div>`;
  const neu = mode === 'new';
  return `<p class="cab-p">${esc(c.cabText || '')}</p>
    <form class="cab-form" data-cab-form="${mode}">
      <input type="email" name="email" placeholder="Почта" autocomplete="email" required>
      <input type="password" name="pw" placeholder="${neu ? 'Придумайте пароль — от 6 знаков' : 'Пароль'}" autocomplete="${neu ? 'new-password' : 'current-password'}" minlength="6" required>
      <button class="btn btn-dark" type="submit">${esc(neu ? c.cabBtnNew || 'Создать кабинет' : c.cabBtnIn || 'Войти')}</button>
      ${neu ? `<label class="consent"><input type="checkbox" name="ok" required> <span>${esc(c.consent || 'Соглашаюсь получать письма')}${c.privacy ? ' — <a href="./?privacy">политика конфиденциальности</a>' : ''}</span></label>` : ''}
    </form>
    <div class="cab-alt">${neu ? '<span>Уже есть кабинет?</span><button class="cab-link" data-cab="mode" data-v="in">Войти</button>'
      : '<button class="cab-link" data-cab="mode" data-v="reset">Забыли пароль?</button><button class="cab-link" data-cab="mode" data-v="new">Создать кабинет</button>'}</div>
    ${neu ? perks(c) : ''}`;
}
function close() { document.querySelector('.cab-ov')?.remove(); }

// ---------- страница книги: напомнить о старте и полка ----------
function bookExtras(b) {
  const st = startOf(b), mine = S.shelf?.[b.id], rem = S.remind?.[b.id];
  return `<div class="cab-book">
    ${st ? `<div class="cab-start"><button class="btn ${rem ? 'btn-line cab-on' : 'btn-line'}" data-cab="remind" data-id="${esc(b.id)}">${rem ? `Напомню ${dm(st.date)}` : esc(ctx.c?.cabRemind || 'Напомнить о старте')}</button>
      <span class="cab-note">Старт подписки ${dm(st.date)} · для своих ${st.price} ₽ <s>${st.old} ₽</s></span></div>` : ''}
    <div class="cab-shelf"><span>На полку:</span>${Object.entries(SHELF).map(([k, n]) => `<button class="${mine === k ? 'on' : ''}" data-cab="shelf" data-id="${esc(b.id)}" data-v="${k}">${n}</button>`).join('')}</div>
  </div>`;
}

// ---------- кабинет ----------
// Путь читателя: шаги и статусы (названия — из админки). Лёгкая игра: что уже сделано и что дальше.
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
function path(c) {
  const done = [
    true,
    (S.progress?.podarok || 0) > 0,
    (S.progress?.podarok || 0) >= 0.95,
    Object.values(S.remind || {}).some(Boolean),
    Object.values(S.shelf || {}).includes('done'),
  ];
  const names = lines(c.cabSteps), levels = lines(c.cabLevels);
  const n = done.filter(Boolean).length;
  const lv = n >= 5 ? 3 : n >= 4 ? 2 : n >= 2 ? 1 : 0;
  const next = done.findIndex((x) => !x);
  const go = ['', './?chitat=podarok', './?chitat=podarok', '', ''][next] || '';
  return { done, n, total: done.length, level: levels[lv] || '', nextName: next >= 0 ? names[next] || '' : '', go };
}
function cabinet(c, imgs) {
  const name = c.name || 'Автор';
  if (!S.email) return `<section class="cab"><div class="wrap cab-narrow">
      <div class="lbl">${esc(c.cabLabel || 'Личный кабинет')}</div><h1 class="cab-h">${fmt(c.cabIntro || 'Личный кабинет', false)}</h1>
      ${perks(c, ' big')}
      <div class="cab-acts"><button class="btn btn-dark" data-cab="login" data-v="new">${esc(c.cabBtnNew || 'Создать кабинет')}</button><button class="lnk" data-cab="login" data-v="in">${esc(c.cabBtnIn || 'Войти')}</button></div></div></section>`;
  const tab = S.tab || 'reading';
  const soon = books().map((b) => [b, startOf(b)]).filter(([, s]) => s);
  const giftP = Math.round((S.progress?.podarok || 0) * 100);
  const P = path(c);
  // цикл: сколько книг отмечено «Прочла»
  const ser = [...new Set(books().map((b) => String(b.series || '').trim()).filter(Boolean))][0] || '';
  const serBooks = ser ? books().filter((b) => String(b.series || '').trim() === ser).sort((a, b) => (Number(a.seriesNo) || 99) - (Number(b.seriesNo) || 99)) : [];
  const serDone = serBooks.filter((b) => S.shelf?.[b.id] === 'done').length;
  const onShelf = books().filter((b) => S.shelf?.[b.id] === tab);
  const nearest = soon.sort((a, b) => a[1].days - b[1].days)[0];
  const T = (k, d) => esc(c[k] || d);
  const head = (title, extra = '') => `<div class="cab-sh"><h2>${title}</h2>${extra}</div>`;
  return `<section class="cab"><div class="wrap">
    <div class="cab-hero">
      <div><div class="lbl">${T('cabLabel', 'Личный кабинет')}</div><h1 class="cab-h">${fmt(c.cabHello || 'Здравствуйте', false)}</h1>
        <div class="cab-mail">${esc(S.email)} · <button class="cab-link" data-cab="logout">${T('cabOut', 'Выйти')}</button></div></div>
      <div class="cab-lv">
        <div class="cab-lv-k">${T('cabLevelLabel', 'Ваш статус')}</div>
        <div class="cab-lv-v">${esc(P.level)}</div>
        <div class="cab-seg" aria-label="${P.n} из ${P.total}">${P.done.map((x) => `<i class="${x ? 'on' : ''}"></i>`).join('')}</div>
        ${P.nextName ? `<div class="cab-next"><span>${T('cabNextLabel', 'Следующий шаг')}:</span> ${P.go ? `<a href="${P.go}">${esc(P.nextName)} →</a>` : esc(P.nextName)}</div>` : `<div class="cab-next">${T('cabAllDone', 'Все шаги пройдены — вы в близком круге')}</div>`}
      </div>
    </div>
    <div class="cab-stats">
      ${ser ? `<div><b>${serDone}<small>/${serBooks.length}</small></b><span>${T('cabStatSeries', 'книг цикла прочитано')}</span></div>` : ''}
      ${c.giftName ? `<div><b>${giftP}<small>%</small></b><span>${T('cabStatGift', 'подарка прочитано')}</span></div>` : ''}
      ${nearest ? `<div><b>${nearest[1].days}</b><span>${T('cabStatSoon', 'дней до старта')} «${esc(String(nearest[0].title).replace(/\*/g, ''))}»</span></div>` : ''}
    </div>
    <div class="cab-two">
      ${c.giftName ? `<section class="cab-card">${head(T('cabGift', 'Подарок'))}
        <div class="cab-gift"><div class="cab-gc">${cover({ id: 'gift', title: c.giftName }, imgs, name)}</div>
        <div><div class="cab-t">«${esc(c.giftName)}»</div>
          <div class="cab-s">${giftP ? `прочитано ${giftP} %` : T('cabNotStarted', 'ещё не начинали')}</div>${giftP ? `<div class="cab-bar"><i style="width:${giftP}%"></i></div>` : ''}
          <div class="cab-acts"><a class="btn btn-dark" href="./?chitat=podarok">${giftP ? T('cabGo', 'Продолжить') : T('cabRead', 'Читать')}</a>${c.giftUrl ? `<a class="lnk" href="${esc(c.giftUrl)}" target="_blank" rel="noopener">${T('cabDownload', 'Скачать')}</a>` : ''}</div></div></div></section>` : ''}
      ${soon.length ? `<section class="cab-card">${head(T('cabSoon', 'Скоро старт'))}${soon.map(([b, st]) => `<div class="cab-soon">
        <div class="cab-days"><b>${st.days}</b><span>${plural(st.days, ['день', 'дня', 'дней'])}</span></div>
        <div class="cab-rt"><a class="cab-t" href="./?kniga=${esc(b.url)}">${fmt(b.title, false)}</a>
          <div class="cab-s">${T('cabStartLine', 'Старт подписки')} ${dm(st.date)}</div>
          <div class="cab-price">${T('cabPriceLine', 'Для своих в день старта')} <b>${st.price} ₽</b> <s>${st.old} ₽</s></div>
          <button class="cab-sw${S.remind?.[b.id] ? ' on' : ''}" data-cab="remind" data-id="${esc(b.id)}" role="switch" aria-checked="${!!S.remind?.[b.id]}"><i></i><span>${T('cabRemindSw', 'Напомнить в день старта')}</span></button></div></div>`).join('')}</section>` : ''}
    </div>
    <section class="cab-sec">${head(T('cabShelf', 'Моя полка'), `<div class="cab-tabs">${Object.entries({ reading: 'Читаю', done: 'Прочла', want: 'Хочу' }).map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-cab="tab" data-v="${k}">${n} <span>${books().filter((b) => S.shelf?.[b.id] === k).length || ''}</span></button>`).join('')}</div>`)}
      ${ser ? `<div class="cab-series"><div class="cab-s">Цикл «${esc(ser)}» · ${serDone} из ${serBooks.length}</div>
        <div class="cab-sline">${serBooks.map((b) => `<a class="cab-sdot${S.shelf?.[b.id] === 'done' ? ' on' : S.shelf?.[b.id] === 'reading' ? ' mid' : ''}" href="./?kniga=${esc(b.url)}" title="${esc(String(b.title).replace(/\*/g, ''))}"><i></i><span>${Number(b.seriesNo) || serBooks.indexOf(b) + 1}</span></a>`).join('<em></em>')}</div></div>` : ''}
      ${onShelf.length ? `<div class="cab-shelfg">${onShelf.map((b) => `<a class="cab-sb" href="./?kniga=${esc(b.url)}"><div class="cab-mc">${cover(b, imgs, name)}</div><div class="cab-t">${fmt(b.title, false)}</div><div class="cab-s">${esc(STATUS[b.status] || '')}</div></a>`).join('')}</div>`
        : `<p class="cab-empty">${tab === 'reading' ? T('cabEmptyReading', 'Пока ничего. На странице любой книги — «На полку: Читаю».') : tab === 'done' ? T('cabEmptyDone', 'Отметьте прочитанные — увидите, сколько осталось до конца цикла.') : T('cabEmptyWant', 'Отложите книги на потом — не потеряются.')}</p>`}</section>
    <div class="cab-two">
      <section class="cab-card">${head(T('cabBonus', 'Только для своих'))}<p class="cab-empty">${T('cabBonusEmpty', '')}</p></section>
      <section class="cab-card">${head(T('cabNotify', 'Куда напоминать'))}<div class="cab-ch">${[['email', T('cabByMail', 'На почту')], ['tg', T('cabByTg', 'В Telegram')]].map(([k, n]) => `<button class="${(S.ch || 'email') === k ? 'on' : ''}" data-cab="ch" data-v="${k}">${n}</button>`).join('')}</div>${(S.ch || 'email') === 'tg' ? `<p class="cab-empty" style="margin-top:10px">${T('cabTgHint', 'Нажмёте «Запустить» в боте — и напоминания придут в Telegram.')}</p>` : ''}</section>
    </div>
  </div></section>`;
}

// ---------- читалка ----------
function reader(c, key) {
  const withText = books().find((b) => b.excerpt);
  const b = key === 'podarok' ? withText : findBook(c, key);
  const title = key === 'podarok' ? c.giftName : b?.title;
  const text = String(b?.excerpt || '').split(/\n+/).filter((p) => p.trim());
  const sz = S.size || 18;
  return `<section class="rd${S.night ? ' rd-night' : ''}" style="--rd:${sz}px"><div class="rd-bar"><div class="wrap rd-bar-in">
      <a class="lnk rd-back" href="./?kabinet" aria-label="В кабинет">← <span>Кабинет</span></a><span class="rd-t">${fmt(title || '', false)}</span>
      <span class="rd-tools"><button data-cab="size" data-v="-1" aria-label="Мельче">A−</button><button data-cab="size" data-v="1" aria-label="Крупнее">A+</button><button data-cab="night" aria-label="Ночной режим">${S.night ? 'День' : 'Ночь'}</button></span></div><i class="rd-prog" style="width:0"></i></div>
    <div class="rd-page"><div class="rd-in">
      ${key === 'podarok' ? `<p class="rd-proto">Прототип: здесь будет текст «${esc(c.giftName || '')}». Для примера — отрывок из «${esc(String(b?.title || '').replace(/\*/g, ''))}».</p>` : ''}
      <div class="lbl">Глава 1</div>
      ${text.map((p) => `<p>${fmt(p, false)}</p>`).join('') || '<p>Текста пока нет.</p>'}
      <div class="rd-end"><span>Конец главы</span><button class="btn btn-dark" disabled>Глава 2</button></div>
    </div></div></section>`;
}

// ---------- для site.js ----------
export function page(c, imgs, which, key) {
  ctx = { c, imgs };
  if (which === 'kabinet') return { title: `Личный кабинет — ${c.name || ''}`, main: cabinet(c, imgs) };
  if (which === 'chitat') return { title: `Читать — ${c.name || ''}`, main: reader(c, key), reader: true };
  return null;
}
export function after(c, imgs, bookKey, rerender) {
  ctx = { c, imgs }; redraw = rerender;
  const r = document.querySelector('.top-r');
  if (r && !r.querySelector('.acc')) r.insertAdjacentHTML('afterbegin', headEntry());
  if (S.email) document.getElementById('podpiska')?.remove(); // уже свой — форма подписки внизу не нужна
  const b = bookKey && findBook(c, bookKey);
  if (b) document.querySelector('.bk-top .buy')?.insertAdjacentHTML('afterend', bookExtras(b));
  if (!document.querySelector('.cab-proto')) document.body.insertAdjacentHTML('beforeend', `<div class="cab-proto">Прототип · вход: <button data-cab="var" data-v="door">дверца</button><button data-cab="var" data-v="text">текст</button><button data-cab="reset">сначала</button></div>`);
  document.querySelectorAll('.cab-proto [data-cab="var"]').forEach((x) => x.classList.toggle('on', x.dataset.v === variant()));
  const prog = document.querySelector('.rd-prog');
  if (prog) {
    const key = new URLSearchParams(location.search).get('chitat');
    const at = S.progress?.[key] || 0;
    if (at) scrollTo(0, at * (document.documentElement.scrollHeight - innerHeight));
    const upd = () => { const h = document.documentElement.scrollHeight - innerHeight; const p = h > 0 ? Math.min(1, scrollY / h) : 1; prog.style.width = (p * 100).toFixed(1) + '%'; S.progress = { ...(S.progress || {}), [key]: p }; put(); };
    removeEventListener('scroll', window.__rdScroll || (() => {})); window.__rdScroll = upd; addEventListener('scroll', upd, { passive: true }); upd();
  }
}

function act(name, d) {
  if (name === 'login') { mode = d.v || 'new'; sheet(); return; }
  if (name === 'close') { close(); return; }
  if (name === 'go') { location.href = './?kabinet'; return; }
  if (name === 'remind' || name === 'shelf') {
    if (!S.email) {
      S.pending = { name, ...d }; put();
      const b = findBook(ctx.c, d.id);
      mode = 'new';
      sheet(name === 'remind' ? `Чтобы напомнить о старте «${String(b?.title || '').replace(/\*/g, '')}», создайте кабинет — это минута.` : 'Полка хранится в кабинете — создайте кабинет, и она будет с вами на любом устройстве.');
      return;
    }
    if (name === 'remind') S.remind = { ...(S.remind || {}), [d.id]: !S.remind?.[d.id] };
    else S.shelf = { ...(S.shelf || {}), [d.id]: S.shelf?.[d.id] === d.v ? '' : d.v };
  }
  if (name === 'tab') S.tab = d.v;
  if (name === 'ch') S.ch = d.v;
  if (name === 'size') S.size = Math.max(15, Math.min(24, (S.size || 18) + Number(d.v)));
  if (name === 'night') S.night = !S.night;
  if (name === 'logout') { S = {}; put(); location.href = './'; return; }
  if (name === 'var') { try { sessionStorage.setItem(VK, d.v); } catch { /* ок */ } document.querySelector('.acc')?.remove(); }
  if (name === 'reset') { S = {}; put(); location.href = './'; return; }
  if (name === 'mode') { mode = d.v; const b = document.querySelector('.cab-body'); if (b) { b.innerHTML = formHtml(ctx.c || {}); b.querySelector('input')?.focus(); } return; }
  if (name === 'enter') {
    S.email = d.mail; const p = S.pending; delete S.pending; put(); close();
    if (p) act(p.name, p); else location.href = './?kabinet';
    return;
  }
  put(); redraw();
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-cab]');
  if (!el || (el.classList.contains('cab-ov') && e.target !== el)) return; // нажали внутри окна — не закрываем
  e.preventDefault();
  act(el.dataset.cab, { ...el.dataset });
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-cab-form]');
  if (!f) return;
  e.preventDefault();
  const mail = f.email.value.trim();
  if (f.dataset.cabForm === 'reset') {
    f.closest('.cab-body').innerHTML = `<p class="cab-p">Письмо для смены пароля отправлено на <b>${esc(mail)}</b>. Нет письма — загляните в «Спам».</p>
      <div class="cab-alt"><button class="cab-link" data-cab="mode" data-v="in">← Ко входу</button></div>`;
    return;
  }
  act('enter', { mail }); // прототип: пароль не проверяется, вход сразу
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
