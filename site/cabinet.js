// Личный кабинет читателя — ПРОТОТИП. Виден только по ссылке ./?proto (дальше помнится в этой вкладке), читатели сайта его не видят.
// Всё хранится в этом браузере, письма не отправляются: «ссылка из письма» открывается кнопкой прототипа.
// Настоящий вход по почте (ссылка без пароля), напоминания и цены из админки — следующий шаг.
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

// ---------- окно входа ----------
function sheet(why = '') {
  close();
  const c = ctx.c || {};
  document.body.insertAdjacentHTML('beforeend', `<div class="cab-ov" data-cab="close"><div class="cab-sheet" role="dialog" aria-modal="true" aria-labelledby="cabT">
    <button class="cab-x" data-cab="close" aria-label="Закрыть">×</button>
    <div class="lbl">Личный кабинет</div>
    <h2 id="cabT">Войти <span class="it">по почте</span></h2>
    ${why ? `<p class="cab-why">${esc(why)}</p>` : ''}
    <div class="cab-body"><p class="cab-p">Пришлю письмо со ссылкой — нажмёте и вы в кабинете. Без пароля.</p>
      <form class="cab-form" data-cab-form><input type="email" name="email" placeholder="Ваша почта" autocomplete="email" required>
        <button class="btn btn-dark" type="submit">Войти</button>
        <label class="consent"><input type="checkbox" name="ok" required> <span>${esc(c.consent || 'Соглашаюсь получать письма')}${c.privacy ? ' — <a href="./?privacy">политика конфиденциальности</a>' : ''}</span></label></form>
      <ul class="cab-gets">
        ${c.giftName ? `<li><b>«${esc(c.giftName)}»</b> в подарок — читать прямо на сайте</li>` : ''}
        <li><b>Напомню о старте подписки</b> и цене для своих в этот день</li>
        <li><b>Своя полка:</b> что читаю, что прочла, что хочу</li>
      </ul></div></div></div>`);
  document.querySelector('.cab-form input')?.focus();
}
function close() { document.querySelector('.cab-ov')?.remove(); }

// ---------- страница книги: напомнить о старте и полка ----------
function bookExtras(b) {
  const st = startOf(b), mine = S.shelf?.[b.id], rem = S.remind?.[b.id];
  return `<div class="cab-book">
    ${st ? `<div class="cab-start"><button class="btn ${rem ? 'btn-line cab-on' : 'btn-line'}" data-cab="remind" data-id="${esc(b.id)}">${rem ? `Напомню ${dm(st.date)}` : 'Напомнить о старте'}</button>
      <span class="cab-note">Старт подписки ${dm(st.date)} · для своих ${st.price} ₽ <s>${st.old} ₽</s></span></div>` : ''}
    <div class="cab-shelf"><span>На полку:</span>${Object.entries(SHELF).map(([k, n]) => `<button class="${mine === k ? 'on' : ''}" data-cab="shelf" data-id="${esc(b.id)}" data-v="${k}">${n}</button>`).join('')}</div>
  </div>`;
}

// ---------- кабинет ----------
function cabinet(c, imgs) {
  const name = c.name || 'Автор';
  if (!S.email) return `<section class="cab"><div class="wrap cab-narrow">
      <div class="lbl">Личный кабинет</div><h1 class="cab-h">Для своих <span class="it">читателей</span></h1>
      <ul class="cab-gets big">${c.giftName ? `<li><b>«${esc(c.giftName)}»</b> в подарок — читать прямо здесь</li>` : ''}<li><b>Напомню о старте подписки</b> и цене для своих</li><li><b>Своя полка</b> и все книги цикла по порядку</li></ul>
      <button class="btn btn-dark" data-cab="login">Войти по почте</button></div></section>`;
  const tab = S.tab || 'reading';
  const soon = books().map((b) => [b, startOf(b)]).filter(([, s]) => s);
  const onShelf = books().filter((b) => S.shelf?.[b.id] === tab);
  const giftP = Math.round((S.progress?.podarok || 0) * 100);
  const sec = (title, body, extra = '') => `<section class="cab-sec"><div class="cab-sh"><h2>${title}</h2>${extra}</div>${body}</section>`;
  return `<section class="cab"><div class="wrap">
    <div class="cab-top"><div><div class="lbl">Личный кабинет</div><h1 class="cab-h">Здравствуйте<span class="it">!</span></h1><div class="cab-mail">${esc(S.email)}</div></div>
      <button class="lnk" data-cab="logout">Выйти</button></div>
    ${c.giftName ? sec('Подарок', `<div class="cab-gift"><div class="cab-gc">${cover({ id: 'gift', title: c.giftName }, imgs, name)}</div>
      <div><div class="cab-t">«${esc(c.giftName)}»</div><div class="cab-s">${giftP ? `прочитано ${giftP} %` : 'ещё не начинали'}</div>
      <div class="cab-acts"><a class="btn btn-dark" href="./?chitat=podarok">${giftP ? 'Продолжить' : 'Читать'}</a>${c.giftUrl ? `<a class="lnk" href="${esc(c.giftUrl)}" target="_blank" rel="noopener">Скачать</a>` : ''}</div></div></div>`) : ''}
    ${soon.length ? sec('Скоро старт', soon.map(([b, s]) => `<div class="cab-row"><a class="cab-mc" href="./?kniga=${esc(b.url)}">${cover(b, imgs, name)}</a>
      <div class="cab-rt"><a class="cab-t" href="./?kniga=${esc(b.url)}">${fmt(b.title, false)}</a>
        <div class="cab-s">Старт подписки ${dm(s.date)} · через ${s.days} ${plural(s.days, ['день', 'дня', 'дней'])}</div>
        <div class="cab-price">Для своих в день старта <b>${s.price} ₽</b> <s>${s.old} ₽</s></div></div>
      <button class="cab-sw${S.remind?.[b.id] ? ' on' : ''}" data-cab="remind" data-id="${esc(b.id)}" role="switch" aria-checked="${!!S.remind?.[b.id]}"><i></i><span>Напомнить</span></button></div>`).join('')) : ''}
    ${sec('Моя полка', onShelf.length ? `<div class="cab-shelfg">${onShelf.map((b) => `<a class="cab-sb" href="./?kniga=${esc(b.url)}"><div class="cab-mc">${cover(b, imgs, name)}</div><div class="cab-t">${fmt(b.title, false)}</div><div class="cab-s">${esc(STATUS[b.status] || '')}</div></a>`).join('')}</div>`
      : `<p class="cab-empty">${tab === 'reading' ? 'Пока ничего. На странице любой книги — «На полку: Читаю».' : tab === 'done' ? 'Отметьте прочитанные — увидите, сколько осталось до конца цикла.' : 'Отложите книги на потом — не потеряются.'}</p>`,
      `<div class="cab-tabs">${Object.entries({ reading: 'Читаю', done: 'Прочла', want: 'Хочу' }).map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-cab="tab" data-v="${k}">${n} <span>${books().filter((b) => S.shelf?.[b.id] === k).length || ''}</span></button>`).join('')}</div>`)}
    ${sec('Только для своих', '<p class="cab-empty">Здесь будут бонусные сцены, обложки до премьеры и отрывки до выхода.</p>')}
    ${sec('Куда напоминать', `<div class="cab-ch">${[['email', 'На почту'], ['tg', 'В Telegram']].map(([k, n]) => `<button class="${(S.ch || 'email') === k ? 'on' : ''}" data-cab="ch" data-v="${k}">${n}</button>`).join('')}</div>${(S.ch || 'email') === 'tg' ? '<p class="cab-empty">Нажмёте «Запустить» в боте — и напоминания придут в Telegram.</p>' : ''}`)}
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
  if (name === 'login') { sheet(); return; }
  if (name === 'close') { close(); return; }
  if (name === 'go') { location.href = './?kabinet'; return; }
  if (name === 'remind' || name === 'shelf') {
    if (!S.email) {
      S.pending = { name, ...d }; put();
      const b = findBook(ctx.c, d.id);
      sheet(name === 'remind' ? `Чтобы напомнить о старте «${String(b?.title || '').replace(/\*/g, '')}», войдите по почте — это минута.` : 'Полка хранится в кабинете — войдите по почте, и она будет с вами на любом устройстве.');
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
  if (name === 'proto-mail') {
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
  f.closest('.cab-body').innerHTML = `<p class="cab-p">Письмо со ссылкой для входа отправлено на <b>${esc(mail)}</b>. Откройте его и нажмите «Войти» — можно с телефона.</p>
    <p class="cab-p small">Письма нет? Проверьте «Спам» или <button class="lnk" data-cab="login">введите почту ещё раз</button>.</p>
    <button class="btn btn-line cab-protobtn" data-cab="proto-mail" data-mail="${esc(mail)}">Прототип: открыть ссылку из письма</button>`;
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
