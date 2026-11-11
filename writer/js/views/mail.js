// Почта (Мастерская → Сайт → Почта): подписчицы сайта, рост, адреса, письма — сейчас или в назначенный день и час.
// Письма и адреса живут в сервисе писем владелицы (функция Yandex Cloud, mail/mail-function.cjs); пароль сервиса и черновик —
// в её личных данных users/{uid}/meta/sitemail (тот же документ читает админка сайта); оформление писем — на сайте (content.letter).
// Отложенные письма отправляет сам сервис по таймеру — компьютер и Мастерская для этого не нужны.
import { ic } from '../../../js/icons.js';
import { esc, acts, changes, toast, download, copyRich, ask, openSheet } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import { loadSiteRaw, siteInfo, siteImg, patchSite, loadMailCfg, saveMailCfg, mailCall, loadSubs, SITE_URL } from '../../../js/sitepub.js';
import { letterHtml, LETTER_DEFAULTS } from '../../../js/letter.js';
import { subsStats, subsSeries, subsCsv, filterSubs, statusName, srcName, sendSlots, localIso, localParts } from '../../../js/mailcalc.js';
import { plannedPubs } from '../wcalc.js';
import { niceMax, ticks } from '../../../js/charts.js';
import { addDays } from '../../../js/calc.js';

const app = () => window.__app;
const M = { cfg: null, raw: undefined, info: null, err: '', busy: false, imgs: {}, old: null, q: '', status: 'ok', page: 0, range: 90, when: 'now', at: null, sure: false, pasting: false, pv: false };
// раскрытые разделы не сворачиваются при перерисовке
const OPEN = new Set();
const det = (k) => ` data-det="${k}"${OPEN.has(k) ? ' open' : ''}`;
if (typeof document !== 'undefined') document.addEventListener('toggle', (e) => { const k = e.target.dataset?.det; if (k) { if (e.target.open) OPEN.add(k); else OPEN.delete(k); } }, true);
const PER = 10;
const plain = (s) => String(s ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const dm = (iso) => { const p = localParts(iso); return `${fmtDate(p.date)} в ${p.time}`; };

// ---------- загрузка ----------
async function who() { const u = app().store.auth?.currentUser; return u ? { uid: u.uid, token: await u.getIdToken() } : { uid: '', token: '' }; }
const mailUrl = () => String(M.raw?.mailUrl || '').trim();
const ready = () => !!(mailUrl() && M.cfg?.key);
async function load(force) {
  if (typeof window === 'undefined' || !window.__app || M.busy || (M.cfg && !force)) return;
  M.busy = true; M.err = '';
  try {
    const w = await who();
    const [cfg, raw] = await Promise.all([loadMailCfg(w.uid, w.token).catch(() => ({})), loadSiteRaw().catch(() => null)]);
    M.cfg = { draft: {}, covers: {}, ...cfg }; M.cfg.draft ||= {};
    M.raw = raw;
    if (ready()) await refresh(true);
    // адреса из прежней формы подписки (Firebase) — чтобы перенести в рассылку; нет доступа — молча без них
    try { M.old = w.token ? await loadSubs(w.token) : JSON.parse(localStorage.getItem('lanaSite.subs') || '[]'); } catch { M.old = []; }
  } catch (e) { M.err = e.message; }
  M.busy = false;
  app().rerender();
}
async function refresh(quiet) {
  M.at0 = Date.now();
  try { M.info = await mailCall(mailUrl(), M.cfg.key, { op: 'list' }); M.err = ''; syncPlanner(); await autoReply(); } catch (e) { M.info = null; M.err = e.message; }
  if (!quiet) app().rerender();
}
// Адрес для ответов, который видят читательницы в письмах (10.11.2026, владелица: «заменить во всех письмах на lanafreitag8@gmail.com»):
// с программой сервиса версии 3 ставится один раз сам; дальше меняется кнопкой «Изменить» в «Адресах»
export const REPLY_DEFAULT = 'lanafreitag8@gmail.com';
async function autoReply() {
  const s = app().ctx().settings.site || {};
  if (!(M.info?.v >= 3) || s.replyAutoAt || M.info.replyTo === REPLY_DEFAULT) return;
  const r = await mailCall(mailUrl(), M.cfg.key, { op: 'reply', email: REPLY_DEFAULT });
  M.info.replyTo = r.replyTo;
  await app().store.saveSettings({ site: { ...s, replyAutoAt: new Date().toISOString() } });
}
acts['mail.reply'] = () => {
  if (!(M.info?.v >= 3)) { toast('Сначала обновите программу сервиса писем — шаги в «Письма с сайта» ниже'); return false; }
  openSheet('Адрес для ответов', `<p class="small">Его видят читательницы: «Ответить» в любом письме и письма с сайта приходят сюда.</p>
    <label>Почта</label><input name="e" type="email" value="${esc(M.info.replyTo || '')}" required>`, async (fd) => {
    const r = await mailCall(mailUrl(), M.cfg.key, { op: 'reply', email: String(fd.get('e') || '').trim() });
    M.info.replyTo = r.replyTo; toast('Готово: ответы — на ' + r.replyTo); app().rerender();
  }, { submitText: 'Сохранить' });
  return false;
};
// «Письмо автору» с сайта: последние письма (сами письма приходят на почту для ответов)
function lettersBox() {
  if (!(M.info?.v >= 3)) return `<p class="small muted" style="margin:6px 0">Чтобы на сайте заработала форма «Написать мне», один раз обновите программу сервиса писем в Яндекс Облаке:</p>
    <ol class="small" style="margin:0 0 10px;padding-left:20px;line-height:1.7"><li>Нажмите «Скопировать программу» ниже.</li>
      <li>Яндекс Облако → <b>Cloud Functions</b> → функция <b>lana-mail</b> → <b>Редактор</b> → файл <b>index.js</b>.</li>
      <li>Выделите весь текст (Ctrl+A), вставьте новый (Ctrl+V) → <b>Сохранить изменения</b>.</li>
      <li>Вернитесь сюда — адрес для ответов сам станет ${esc(REPLY_DEFAULT)}, форма на сайте заработает.</li></ol>
    <button class="small-btn" data-act="mail.fncopy">Скопировать программу</button>`;
  const L = [...(M.info.msgs || [])].reverse();
  // версия 4: письмо с сайта приходит как обычное письмо от читательницы («Анна через сайт», тема — начало письма)
  const up = M.info.v < 4 ? `<p class="small" style="margin:6px 0">Чтобы письма с сайта приходили как обычные письма от читательниц (от «Анна через сайт», тема — начало письма, без рамки), обновите программу сервиса: «Скопировать программу» → Яндекс Облако → Cloud Functions → <b>lana-mail</b> → Редактор → <b>index.js</b> → выделить всё, вставить → «Сохранить изменения».</p>
    <button class="small-btn" data-act="mail.fncopy" style="margin-bottom:10px">Скопировать программу</button>` : '';
  return up + (L.length ? `<div class="list">${L.slice(0, 20).map((m) => `<div class="item"><div class="row between"><b>${esc(m.name || m.email)}</b><span class="small muted">${dm(m.at)}</span></div>
      <div class="small" style="white-space:pre-line;margin:4px 0">${esc(m.text.length > 400 ? m.text.slice(0, 400) + '…' : m.text)}</div>
      <a class="small" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: письмо с сайта')}">Ответить · ${esc(m.email)}</a></div>`).join('')}</div>`
    : `<p class="small muted" style="margin:6px 0">Писем пока не было. Каждое приходит вам на ${esc(M.info.replyTo || 'почту')} — «Ответить» в почте пишет сразу читательнице.</p>`);
}
// свежие данные сами: при открытии Почты, если прошло больше 2 минут, и когда время отложенного письма прошло
// (сервис отправляет его по таймеру — список «уйдёт …» сам сменится на «отправлено»)
function fresh() {
  if (!M.info || M.fetching) return;
  const age = Date.now() - (M.at0 || 0), due = (M.info.queue || []).some((q) => Date.parse(q.at) <= Date.now());
  if (age > 120e3 || (due && age > 60e3)) { M.fetching = true; refresh().finally(() => { M.fetching = false; }); }
}
if (typeof window !== 'undefined') setInterval(() => { if (window.__app && /^\/site\/mail/.test(window.__app.ui?.route || '')) fresh(); }, 60e3);
let saveT = null;
const saveCfg = () => { clearTimeout(saveT); saveT = setTimeout(async () => { try { const w = await who(); await saveMailCfg(w.uid, w.token, M.cfg); } catch { /* повторим при следующей правке */ } }, 700); };
// отложенные письма — в Планер (без интернета Планер читает последнюю копию из настроек)
function syncPlanner() {
  const s = app().ctx().settings, q = (M.info?.queue || []).map((x) => ({ id: x.id, at: x.at, subject: x.subject }));
  // отправленные за 2 недели — в Планер галочкой «отправлено»
  const since = Date.now() - 14 * 864e5;
  const sent = (M.info?.sent || []).filter((x) => Date.parse(x.at) >= since).slice(-10).map((x) => ({ id: x.id || x.at, at: x.at, subject: x.subject, n: x.sent || 0 }));
  // адрес сервиса — ещё и для ночного архива (программа архива берёт его в свой текст)
  if (JSON.stringify(s.site?.mailQueue || []) !== JSON.stringify(q) || JSON.stringify(s.site?.mailSent || []) !== JSON.stringify(sent) || (s.site?.mailUrl || '') !== mailUrl()) app().store.saveSettings({ site: { ...(s.site || {}), mailQueue: q, mailSent: sent, mailUrl: mailUrl() } });
}
export function mailQueue(settings) { return settings?.site?.mailQueue || []; }
export function mailSent(settings) { return settings?.site?.mailSent || []; }
// Мастерская открыта, а время отложенного письма прошло — сама спрашивает сервис, ушло ли оно (Почту открывать не нужно)
let lastCheck = 0;
export function checkMailQueue() {
  if (typeof window === 'undefined' || !window.__app || M.fetching || M.busy) return;
  const q = mailQueue(app().ctx().settings);
  if (!q.some((x) => Date.parse(x.at) <= Date.now()) || Date.now() - lastCheck < 120e3) return;
  lastCheck = Date.now(); M.fetching = true;
  (M.cfg ? (ready() ? refresh(true) : Promise.resolve()) : load(true)).catch(() => {}).finally(() => { M.fetching = false; });
}

// ---------- вкладки раздела «Сайт» ----------
export function siteTabs(sub) {
  return `<div class="row between links-title" style="margin-bottom:6px"><h2 style="margin:0">Сайт</h2>
    <button class="icon-btn" data-act="${sub === 'mail' || sub === 'letter' ? 'mail.reload' : 'site.reload'}" title="Обновить" aria-label="Обновить">${ic('refresh')}</button></div>
  <div class="lg-tabs mk-tabs">${[['site', 'Обзор', '/site'], ['mail', 'Почта', '/site/mail']].map(([k, t, to]) => `<button class="${sub === k || (k === 'mail' && sub === 'letter') ? 'on' : ''}" data-act="go" data-to="${to}">${t}</button>`).join('')}</div>`;
}
// цифра для «Обзора»: подписчицы из сервиса писем
// Сервис писем для других разделов (претензии пиратам): готов ли, версия программы, вызов
export function mailSvc() { load(); return { ready: ready(), v: M.info?.v || 0, replyTo: M.info?.replyTo || '', call: (body) => mailCall(mailUrl(), M.cfg.key, body) }; }
export function mailCount() { load(); return M.info?.list ? subsStats(M.info.list, app().ctx().today) : null; }

// ---------- экран «Почта» ----------
// Письмо «Подтвердите подписку» — его шлёт сам сервис сразу после подписки; тексты хранятся в сервисе (op: texts)
const C_FIELDS = [['subj', 'Тема письма', ''], ['head', 'Заголовок', ''], ['text', 'Текст', 'area'], ['btn', 'Кнопка', '']];
function confirmBox() {
  const t = M.info?.texts;
  if (!t || !(M.info.v >= 2)) return `<p class="small muted" style="margin:6px 0">Чтобы менять это письмо, один раз обновите программу сервиса писем в Яндекс Облаке:</p>
    <ol class="small" style="margin:0 0 10px;padding-left:20px;line-height:1.7"><li>Нажмите «Скопировать программу» ниже.</li>
      <li>Яндекс Облако → <b>Cloud Functions</b> → функция <b>lana-mail</b> → <b>Редактор</b> → файл <b>index.js</b>.</li>
      <li>Выделите весь текст (Ctrl+A), вставьте новый (Ctrl+V) → <b>Сохранить изменения</b>.</li>
      <li>Вернитесь сюда и обновите страницу — появятся поля письма.</li></ol>
    <button class="small-btn" data-act="mail.fncopy">Скопировать программу</button>`;
  return `<p class="small muted" style="margin:6px 0 10px">Приходит сразу после подписки с кнопкой подтверждения. Пустое поле — как было.</p>
    ${C_FIELDS.map(([k, label, type]) => `<label class="ml-f"><span>${label}</span>${type === 'area'
      ? `<textarea data-ct="${k}" rows="3">${esc(t[k] || '')}</textarea>` : `<input data-ct="${k}" value="${esc(t[k] || '')}">`}</label>`).join('')}
    <div class="row" style="gap:10px;flex-wrap:wrap;margin-top:6px"><button class="primary" data-act="mail.ctsave">Сохранить</button>
      <button class="small-btn" data-act="mail.ctsave" data-test="1">Сохранить и прислать себе</button></div>`;
}
acts['mail.ctsave'] = async (d) => {
  const texts = Object.fromEntries([...document.querySelectorAll('[data-ct]')].map((el) => [el.dataset.ct, el.value]));
  try {
    const r = await mailCall(mailUrl(), M.cfg.key, { op: 'texts', texts, test: !!d.test });
    M.info.texts = r.texts;
    toast(d.test ? `Сохранено. Пробное письмо ушло на ${M.info.replyTo || M.info.from || 'вашу почту'}` : 'Письмо подтверждения сохранено');
  } catch (e) { toast(e.message); return false; }
};
acts['mail.fncopy'] = async () => {
  const get = async (u) => { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(); return r.text(); };
  const code = get(new URL('../mail/mail-function.txt', location.href)).catch(() => get(new URL('../mail/mail-function.cjs', location.href)));
  try { await copyRich(code); toast('Программа скопирована — вставьте её в index.js в Яндекс Облаке'); } catch { toast('Не получилось скопировать — обновите страницу и нажмите ещё раз'); }
  return false;
};

export function mailView(a) {
  const c = a.ctx();
  load(); fresh();
  const head = siteTabs('mail');
  if (!M.cfg || M.raw === undefined) return { html: `<section class="links-page">${head}<p class="muted" style="margin-top:16px">Загружаю почту…</p></section>` };
  if (!ready() || (!M.info && M.err)) return { html: `<section class="links-page">${head}${connectCard()}</section>` };
  if (!M.info) return { html: `<section class="links-page">${head}<p class="muted" style="margin-top:16px">Загружаю подписчиц…</p></section>` };
  const L = M.info.list || [], s = subsStats(L, c.today);
  const known = new Set(L.map((p) => p.email));
  const old = (M.old || []).filter((x) => x.email && !known.has(String(x.email).trim().toLowerCase()));
  const d = M.cfg.draft, hasDraft = !!(d.subject || d.title || d.text);
  const queue = M.info.queue || [], sent = (M.info.sent || []).slice().reverse();
  const list = filterSubs(L, { q: M.q, status: M.status });
  // адреса — страницами по 10: поиск и статус сверху, стрелки внизу (длинную простыню владелица не хочет)
  const pages = Math.max(1, Math.ceil(list.length / PER)), pg = Math.min(M.page, pages - 1);
  const html = `<section class="links-page mail-page">${head}
  <div class="tiles mail-tiles">
    <div><div class="k">Подписчицы</div><div class="v">${s.ok}</div><div class="s">${s.new30 ? `+${s.new30} за 30 дней` : 'новых за 30 дней нет'}</div></div>
    <div><div class="k">Ждут подтверждения</div><div class="v">${s.wait}</div><div class="s">письмо ушло, ссылку ещё не нажали</div></div>
    <div><div class="k">Отписались</div><div class="v">${s.unsub}</div><div class="s">${s.gone30 ? `${s.gone30} за 30 дней` : 'за 30 дней — никто'}</div></div>
  </div>

  <div class="card">
    <div class="row between" style="gap:10px"><h3 style="margin:0">Рост подписчиц</h3>
      <div class="seg">${[[30, '30 дней'], [90, '90 дней'], [3650, 'Всё время']].map(([v, t]) => `<button class="${M.range === v ? 'on' : ''}" data-act="mail.range" data-v="${v}">${t}</button>`).join('')}</div></div>
    <div id="mail-chart" class="mail-chart"></div>
  </div>

  <div class="psec-h"><h2>Письма</h2><button class="primary" data-act="mail.new">${hasDraft ? 'Продолжить письмо' : 'Новое письмо'}</button></div>
  <div class="card list">
    ${queue.length ? queue.map((q) => q.late ? `<div class="item row between"><span><b>${esc(q.subject || 'Без темы')}</b><span class="sub down">не ушло вовремя (${dm(q.at)}) — само не отправится</span></span>
      <span class="row" style="gap:6px;flex-shrink:0"><button class="small-btn" data-act="mail.sendq" data-id="${esc(q.id)}">Отправить сейчас</button><button class="icon-btn" data-act="mail.unq" data-id="${esc(q.id)}" title="Отменить" aria-label="Отменить">${ic('trash')}</button></span></div>`
      : `<div class="item row between"><span><b>${esc(q.subject || 'Без темы')}</b><span class="sub">${ic('timer')} ${Date.parse(q.at) <= Date.now() ? `отправляется (${dm(q.at)})` : `уйдёт ${dm(q.at)}`} · ${s.ok} ${plural(s.ok, ['читательнице', 'читательницам', 'читательницам'])}</span></span>
      <span class="row" style="gap:6px;flex-shrink:0"><button class="link" data-act="mail.edit" data-id="${esc(q.id)}">Изменить</button><button class="icon-btn" data-act="mail.unq" data-id="${esc(q.id)}" title="Отменить отправку" aria-label="Отменить отправку">${ic('trash')}</button></span></div>`).join('') : ''}
    ${hasDraft && !d.id ? `<div class="item row between"><span><b>${esc(d.subject || plain(d.title) || 'Черновик')}</b><span class="sub">черновик — ещё не отправлен</span></span><button class="link" data-act="mail.new">Открыть</button></div>` : ''}
    ${sent.length ? sent.slice(0, 8).map((x) => `<div class="item row between"><span><b>${esc(x.subject || 'Без темы')}</b><span class="sub">${ic('check')} ${dm(x.at)} · ${x.sent} ${plural(x.sent, ['письмо', 'письма', 'писем'])}${x.failed ? ` · не дошло: ${x.failed}` : ''}</span></span>
      ${x.draft ? `<button class="link" data-act="mail.again" data-id="${esc(x.id || x.at)}" style="flex-shrink:0">Взять за основу</button>` : ''}</div>`).join('') : ''}
    ${!queue.length && !sent.length && !hasDraft ? '<p class="small muted" style="margin:0">Писем ещё не было. «Новое письмо» — отправить сейчас или в назначенный день и час, например в день выхода первой главы.</p>' : ''}
  </div>

  <div class="psec-h"><h2>Адреса</h2><button class="dl" data-act="mail.csv">${ic('download')}Скачать таблицу</button></div>
  <div class="card">
    <div class="mail-find"><input type="search" placeholder="Поиск по почте или имени" value="${esc(M.q)}" data-ml-q aria-label="Поиск по адресам">
      <div class="seg">${[['ok', 'Подтвердили', s.ok], ['pending', 'Ждут', s.wait], ['unsub', 'Отписались', s.unsub], ['all', 'Все', L.length]].map(([k, t, n]) => `<button class="${M.status === k ? 'on' : ''}" data-act="mail.status" data-v="${k}">${t} <span class="muted">${n}</span></button>`).join('')}</div></div>
    ${old.length ? `<div class="item row between mail-old"><span><b>Адреса из прежней формы: ${old.length}</b><span class="sub">оставили почту с согласием до подключения сервиса</span></span><button class="small-btn" data-act="mail.import">Перенести</button></div>` : ''}
    <div class="mail-list">${list.length ? list.slice(pg * PER, pg * PER + PER).map((p) => `<div class="mail-row"><span class="mail-who"><b>${esc(p.email)}</b>${p.name ? `<span class="muted"> · ${esc(p.name)}</span>` : ''}</span>
      <span class="mail-meta">${esc(statusName(p.status))} ${p.okAt || p.at ? fmtDate(String(p.okAt || p.at).slice(0, 10)) : ''}${srcName(p.src) ? ` · ${esc(srcName(p.src))}` : ''}</span>
      <button class="icon-btn" data-act="mail.del" data-e="${esc(p.email)}" title="Удалить адрес" aria-label="Удалить адрес">${ic('trash')}</button></div>`).join('')
      : `<p class="small muted" style="margin:10px 0 0">${M.q ? 'Никого не нашла.' : M.status === 'ok' ? 'Подтверждённых подписчиц пока нет — первые появятся здесь сами.' : 'Пусто.'}</p>`}</div>
    ${pages > 1 ? `<div class="mail-pg"><button class="nav-arr" data-act="mail.page" data-v="-1"${pg ? '' : ' disabled'} aria-label="Назад">${ic('chevron')}</button>
      <span>${pg * PER + 1}–${Math.min(list.length, pg * PER + PER)} из ${list.length}</span>
      <button class="nav-arr next" data-act="mail.page" data-v="1"${pg < pages - 1 ? '' : ' disabled'} aria-label="Дальше">${ic('chevron')}</button></div>` : ''}
    <p class="small muted" style="margin:12px 0 0">Адреса хранятся в вашем сервисе писем в Яндекс Облаке (в России), копия — каждую ночь там же и в архиве Мастерской. Письма уходят с ${esc(M.info.from || 'вашего адреса')}, ответы — на ${esc(M.info.replyTo || 'вашу почту')} · <button class="link small" data-act="mail.reply">Изменить</button></p>
  </div>
  <details class="mail-more"${det('letters')}><summary>Письма с сайта${(M.info.msgs || []).length ? ` · ${(M.info.msgs || []).length}` : ''}</summary>${lettersBox()}</details>
  <details class="mail-more"${det('confirm')}><summary>Письмо «Подтвердите подписку»</summary>${confirmBox()}</details>
  <details class="mail-more"${det('arc')}><summary>Копия адресов в архив Мастерской</summary>
    <p class="small muted" style="margin:6px 0">Сервис сам каждую ночь сохраняет копию адресов у себя, в Яндекс Облаке. Чтобы копия была ещё и на Google Диске (папка «Архив Мастерской / Почта») и в GitHub — один раз:</p>
    <ol class="small" style="margin:0 0 6px;padding-left:20px;line-height:1.6"><li>Настройки → «Архив книг» → «Скопировать программу» → на script.google.com заменить текст (Ctrl+A, Ctrl+V, Ctrl+S).</li>
      <li>Там же: шестерёнка «Настройки проекта» → «Свойства скрипта» → «Добавить»: <b>MAIL_KEY</b> — пароль сервиса писем → «Сохранить».</li></ol></details>
  <details class="mail-more"${det('conn')}><summary>Подключение сервиса</summary>${connectForm()}</details>
  </section>`;
  return { html, after: drawChart };
}

function connectForm() {
  return `<div class="mail-conn"><label>Адрес сервиса писем<input type="url" inputmode="url" placeholder="https://functions.yandexcloud.net/…" value="${esc(mailUrl())}" data-ml-url></label>
    <label>Пароль сервиса<input type="password" autocomplete="off" value="${esc(M.cfg?.key || '')}" data-ml-key></label>
    <p class="small muted" style="margin:0">Адрес — в Yandex Cloud: функция → «Обзор» → ссылка для вызова. Пароль — тот, что вписан в функцию как ADMIN_KEY; хранится только в ваших данных.</p>
    <div class="row" style="gap:10px"><button class="primary" data-act="mail.connect">Подключить</button></div></div>`;
}
function connectCard() {
  return `<div class="card" style="margin-top:14px"><h3 style="margin-top:0">Подключить почту</h3>
    <p class="small muted">Письма читательницам — с вашего адреса на lanafreitag.ru, через ваш сервис в Яндекс Облаке: подписка с подтверждением, «Отписаться» в каждом письме.</p>
    ${M.err ? `<p class="small down">${esc(M.err)}</p>` : ''}${connectForm()}</div>`;
}

// аккуратный график: площадь под линией, сетка, подписи по краям; наведение — число за день
function drawChart() {
  const el = document.getElementById('mail-chart');
  if (!el || !M.info) return;
  const pts = subsSeries(M.info.list, app().ctx().today, M.range);
  if (pts.length < 2) { el.innerHTML = '<p class="small muted" style="margin:10px 0 0">График появится с первыми подтверждёнными подписчицами.</p>'; return; }
  const W = Math.max(300, el.clientWidth || 600), H = 200, Lp = 34, R = 10, T = 14, B = 24, pw = W - Lp - R, ph = H - T - B;
  const max = niceMax(Math.max(4, ...pts.map((p) => p.value)));
  const x = (i) => Lp + (i / (pts.length - 1)) * pw, y = (v) => T + ph - (v / max) * ph;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const short = (d) => { const [, m, dd] = d.split('-'); return `${Number(dd)}.${m}`; };
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Рост подписчиц">`;
  s += ticks(max, 3).map((t) => `<line class="grid" x1="${Lp}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="axis" x="${Lp - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`).join('');
  s += `<polygon class="mail-area" points="${Lp},${T + ph} ${line} ${x(pts.length - 1)},${T + ph}"/><polyline class="mail-line" fill="none" points="${line}"/>`;
  const last = pts[pts.length - 1];
  s += `<circle class="mail-dot" cx="${x(pts.length - 1)}" cy="${y(last.value)}" r="3.5"/>`;
  s += `<text class="axis" x="${Lp}" y="${H - 6}">${short(pts[0].date)}</text><text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${short(last.date)}</text>`;
  s += `<rect id="mail-hit" x="${Lp}" y="${T}" width="${pw}" height="${ph}" fill="transparent"/><g id="mail-tip" style="display:none"><line class="mail-cross" x1="0" x2="0" y1="${T}" y2="${T + ph}"/><text class="mail-tipt" y="${T + 2}"></text></g>`;
  el.innerHTML = s + '</svg>';
  const svg = el.querySelector('svg'), tip = el.querySelector('#mail-tip');
  const move = (ev) => {
    const r = svg.getBoundingClientRect(), px = ((ev.touches?.[0] || ev).clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((px - Lp) / pw) * (pts.length - 1))));
    tip.style.display = ''; tip.setAttribute('transform', `translate(${x(i)},0)`);
    const t = tip.querySelector('text'); t.textContent = `${short(pts[i].date)} · ${pts[i].value}`; t.setAttribute('text-anchor', x(i) > W - 90 ? 'end' : 'start'); t.setAttribute('x', x(i) > W - 90 ? -6 : 6);
  };
  svg.addEventListener('mousemove', move); svg.addEventListener('touchmove', move, { passive: true });
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// ---------- редактор письма ----------
const M_FIELDS = [['subject', 'Тема письма', 'Её видно в списке писем'], ['eyebrow', 'Над заголовком', 'Маленькими буквами между тире; по желанию'], ['title', 'Заголовок', '*Звёздочки* — тонкий курсив'],
  ['text', 'Текст', 'Пустая строка — новый абзац; *курсив*, **жирный**, [слова](ссылка)', 'area'], ['quote', 'Цитата из книги', 'По желанию: крупным курсивом между тонкими линиями', 'area'], ['btn', 'Кнопка']];
const M_MORE = [['preheader', 'Строка после темы', 'Серым рядом с темой во входящих; пусто — начало текста'], ['url', 'Куда ведёт кнопка', 'Пусто — на книгу на Литнете (или на её страницу на сайте)'], ['sign', 'Подпись', 'Пусто — подпись из «Оформления»']];
const L_FIELDS = [['autograph', 'Автограф с медведем в конце письма', 'toggle'], ['bear', 'Медведь в кружке сверху', 'toggle'], ['links', 'Внизу — ссылки на сайт и Telegram', 'toggle'], ['sign', 'Подпись в конце письма', '', 'Курсивом — когда автограф выключен'], ['footer', 'Текст внизу письма', 'area', 'Над ссылкой «Отписаться»']];
const design = () => ({ ...LETTER_DEFAULTS, ...(M.raw?.letter || {}) });
const tgOf = (c) => { const b = (c?.blocks || []).find((x) => x.type === 'tg' && /^https?:/.test(x.url || '')); return b?.url || (/^https?:/.test(c?.headUrl || '') ? c.headUrl : ''); };
const books = () => (M.raw ? siteInfo(M.raw).books.filter((b) => !b.hidden) : []);
const rawBook = (id) => (M.raw?.books || []).find((b) => b.id === id);
function letterUrl(d, b) {
  if (d.url) return d.url;
  if (!b) return SITE_URL;
  if (b.litnet) { try { const u = new URL(b.litnet); u.searchParams.set('utm_source', 'lanafreitag.ru'); u.searchParams.set('utm_medium', 'email'); u.searchParams.set('utm_campaign', b.url); return u.href; } catch { /* кривая ссылка */ } }
  return b.page;
}
function letterOf(cover, forceDark = false) {
  const d = M.cfg.draft, b = books().find((x) => x.id === d.book), rb = rawBook(d.book);
  return letterHtml({ author: M.raw?.name || 'Лана Фрейтаг', title: d.title || '', eyebrow: d.eyebrow || '', text: d.text || '', quote: d.quote || '',
    btn: d.btn ?? 'Читать', sign: d.sign || '', preheader: d.preheader || '', url: letterUrl(d, b), site: SITE_URL, design: design(), tg: tgOf(M.raw), forceDark,
    book: b ? { title: b.title, series: rb?.series || '', seriesNo: rb?.seriesNo || '', cover: cover ?? (M.imgs[rb?.cover] || '') } : null });
}
function preview() {
  const f = document.getElementById('ml-pv');
  if (!f || !M.cfg) return;
  const rb = rawBook(M.cfg.draft.book);
  if (rb?.cover && M.imgs[rb.cover] === undefined) { M.imgs[rb.cover] = ''; siteImg(rb.cover).then((v) => { M.imgs[rb.cover] = v; preview(); }); }
  const y = f.contentWindow?.scrollY || 0;
  f.srcdoc = letterOf(undefined, M.dark).html;
  f.parentElement.classList.toggle('dark', !!M.dark);
  f.onload = () => { try { f.contentWindow.scrollTo(0, y); f.style.height = Math.max(560, f.contentDocument.body.scrollHeight + 20) + 'px'; } catch { /* другой домен */ } };
}

export function letterView(a) {
  const c = a.ctx();
  load();
  if (!M.cfg || M.raw === undefined) return { html: `<section class="links-page">${siteTabs('letter')}<p class="muted" style="margin-top:16px">Загружаю…</p></section>` };
  if (!ready()) return mailView(a);
  // перерисовка экрана (синхронизация, Todoist) не должна сбивать курсор в поле
  const ae = document.activeElement, foc = ae?.dataset?.ml ? { k: ae.dataset.ml, s: ae.selectionStart, e: ae.selectionEnd } : null;
  const d = M.cfg.draft, n = subsStats(M.info?.list || [], c.today).ok;
  const slots = sendSlots(c.wbooks, M.raw ? siteInfo(M.raw) : null, c.today, plannedPubs, { focus: books().find((b) => b.id === d.book)?.title || '' });
  // по умолчанию — ближайший выход главы или старт подписки, иначе завтра в 10:00
  const at = M.at || (d.at ? localParts(d.at) : { date: slots[0]?.date || addDays(c.today, 1), time: '10:00' });
  M.at = at;
  const fld = ([k, label, hint, type]) => {
    const v = k === 'btn' ? (d.btn ?? 'Читать') : d[k] || '';
    return `<label class="ml-f"><span>${label}</span>${type === 'area' ? `<textarea rows="${k === 'text' ? 6 : 2}" data-ml="${k}">${esc(v)}</textarea>` : `<input data-ml="${k}" value="${esc(v)}">`}${hint ? `<small>${hint}</small>` : ''}</label>`;
  };
  const lf = ([k, label, type, hint]) => {
    const v = design()[k];
    if (type === 'toggle') return `<label class="ml-tgl"><input type="checkbox" data-ld="${k}"${v ? ' checked' : ''}> ${label}</label>`;
    return `<label class="ml-f"><span>${label}</span>${type === 'area' ? `<textarea rows="2" data-ld="${k}">${esc(v)}</textarea>` : `<input data-ld="${k}" value="${esc(v)}">`}<small>${hint}</small></label>`;
  };
  const when = M.when === 'later';
  const html = `<section class="links-page mail-page">${siteTabs('letter')}
  <div class="row between" style="margin:14px 0 4px;gap:10px"><button class="link" data-act="go" data-to="/site/mail">← Почта</button>
    <span class="small muted">${d.id ? 'меняете отложенное письмо' : 'черновик сохраняется сам'}</span></div>
  <div class="lg-tabs ml-mtabs"><button class="${M.pv ? '' : 'on'}" data-act="mail.pv" data-v="0">Письмо</button><button class="${M.pv ? 'on' : ''}" data-act="mail.pv" data-v="1">Как увидят</button></div>
  <div class="ml-grid${M.pv ? ' show-pv' : ''}">
    <div class="ml-form">
      <div class="card">
        <label class="ml-f"><span>Книга</span><select data-ml="book"><option value="">— без книги —</option>${books().map((b) => `<option value="${esc(b.id)}"${b.id === d.book ? ' selected' : ''}>${esc(b.title)}</option>`).join('')}</select><small>Обложка, цикл и ссылка на книгу встанут сами</small></label>
        ${M_FIELDS.map(fld).join('')}
        <details class="mail-more"${det('more')}><summary>Ещё настройки письма</summary>${M_MORE.map(fld).join('')}</details>
      </div>
      <div class="card ml-send">
        <div class="seg"><button class="${when ? '' : 'on'}" data-act="mail.when" data-v="now">Отправить сейчас</button><button class="${when ? 'on' : ''}" data-act="mail.when" data-v="later">В день и час</button></div>
        ${when ? `<div class="ml-at"><input type="date" value="${at.date}" min="${c.today}" data-ml-at="date" aria-label="День"><input type="time" value="${at.time}" step="300" data-ml-at="time" aria-label="Время"></div>
          ${slots.length ? `<div class="ml-slots">${slots.map((x) => `<button class="${x.date === at.date ? 'on' : ''}" data-act="mail.slot" data-d="${x.date}">${fmtDate(x.date)} · ${esc(x.label)}</button>`).join('')}</div>` : ''}
          <p class="small muted" style="margin:6px 0 0">Отправит сам сервис писем — Мастерскую и компьютер держать открытыми не нужно. Письмо появится в Планере.</p>` : ''}
        <div class="row ml-btns">
          ${M.sure ? `<button class="primary" data-act="mail.go">${when ? `Да, запланировать на ${fmtDate(at.date)} в ${at.time}` : `Да, отправить ${n}`}</button><button class="link" data-act="mail.sure">Отмена</button>`
            : `<button class="primary" data-act="mail.sure"${n || when ? '' : ' disabled'}>${when ? (d.id ? 'Сохранить изменения' : `Запланировать · ${fmtDate(at.date)}, ${at.time}`) : `Отправить всем · ${n}`}</button><button class="dl" data-act="mail.test">${ic('check')}Прислать мне на пробу</button>`}
        </div>
        ${M.sure ? `<p class="small muted" style="margin:8px 0 0">«${esc(d.subject || '')}» ${when ? `уйдёт ${fmtDate(at.date)} в ${at.time} всем подтверждённым подписчицам (сейчас их ${n}). До этого письмо можно изменить или отменить.` : `уйдёт ${n} ${plural(n, ['читательнице', 'читательницам', 'читательницам'])}. Отменить отправку будет нельзя.`}</p>` : ''}
      </div>
      <details class="mail-more"${det('design')}><summary>Оформление писем</summary><p class="small muted" style="margin:6px 0 10px">Общее для всех писем, хранится вместе с сайтом.</p>${L_FIELDS.map(lf).join('')}</details>
      <details class="mail-more"${det('ai')}><summary>Нейросеть</summary><p class="small muted" style="margin:6px 0 10px">Скопируйте письмо и оформление для любой нейросети (Claude, ChatGPT…), попросите поправить и вставьте её ответ. Отправка — только вашей кнопкой.</p>
        <div class="row" style="gap:12px;flex-wrap:wrap"><button class="small-btn" data-act="mail.ai">Скопировать для нейросети</button><button class="link" data-act="mail.pasting">Вставить ответ</button></div>
        ${M.pasting ? `<textarea id="ml-answer" rows="6" placeholder="Вставьте сюда ответ нейросети целиком" style="margin-top:10px"></textarea><div class="row" style="gap:10px;margin-top:8px"><button class="primary" data-act="mail.apply">Применить</button><button class="link" data-act="mail.pasting">Отмена</button></div>` : ''}</details>
    </div>
    <div class="ml-pvwrap"><div class="ml-pvbar"><span class="small muted">Как увидят в почте</span><div class="seg"><button class="${M.dark ? '' : 'on'}" data-act="mail.dark" data-v="0">Светлая</button><button class="${M.dark ? 'on' : ''}" data-act="mail.dark" data-v="1">Тёмная</button></div></div><iframe id="ml-pv" title="Как выглядит письмо"></iframe></div>
  </div></section>`;
  return {
    html,
    after: () => {
      preview();
      if (foc) { const el = document.querySelector(`[data-ml="${foc.k}"]`); if (el) { el.focus(); try { el.setSelectionRange(foc.s, foc.e); } catch { /* select */ } } }
      document.querySelectorAll('.ml-form textarea').forEach(grow);
    },
  };
}
const grow = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; };

// ввод — без перерисовки экрана: черновик сохраняется сам, письмо справа меняется сразу
let ldT = null, pvT = null;
if (typeof document !== 'undefined') {
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!M.cfg) return;
    if (el.dataset.ml) { M.cfg.draft[el.dataset.ml] = el.value; if (el.tagName === 'TEXTAREA') grow(el); saveCfg(); clearTimeout(pvT); pvT = setTimeout(preview, 200); }
    else if (el.dataset.mlQ !== undefined) { M.q = el.value; M.page = 0; clearTimeout(pvT); pvT = setTimeout(() => { const p = el.selectionStart; app().rerender(); const n = document.querySelector('[data-ml-q]'); if (n) { n.focus(); n.setSelectionRange(p, p); } }, 250); }
    else if (el.dataset.ld && el.type !== 'checkbox') { M.raw.letter = { ...(M.raw.letter || {}), [el.dataset.ld]: el.value }; saveDesign(); clearTimeout(pvT); pvT = setTimeout(preview, 200); }
    else if (el.dataset.mlAt) { M.at = { ...M.at, [el.dataset.mlAt]: el.value }; }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!M.cfg) return;
    if (el.dataset.ld && el.type === 'checkbox') { M.raw.letter = { ...(M.raw.letter || {}), [el.dataset.ld]: el.checked }; saveDesign(); preview(); }
    if (el.dataset.mlAt) { M.at = { ...M.at, [el.dataset.mlAt]: el.value }; M.sure = false; app().rerender(); }
    if (el.dataset.ml === 'book') { M.cfg.draft.book = el.value; saveCfg(); preview(); }
    if (el.dataset.mlUrl !== undefined) M.newUrl = el.value.trim();
    if (el.dataset.mlKey !== undefined) M.newKey = el.value.trim();
  });
}
const saveDesign = () => { clearTimeout(ldT); ldT = setTimeout(async () => { try { await patchSite({ letter: M.raw.letter }, (await who()).token); } catch (e) { toast('Оформление не сохранилось: ' + e.message); } }, 900); };

// обложка — картинкой по ссылке (встроенные картинки почта часто режет): один раз в хранилище сервиса
async function letterCover() {
  const rb = rawBook(M.cfg.draft.book);
  if (!rb?.cover) return '';
  if (M.cfg.covers?.[rb.cover]) return M.cfg.covers[rb.cover];
  const data = M.imgs[rb.cover] || await siteImg(rb.cover);
  if (!data) return '';
  const r = await mailCall(mailUrl(), M.cfg.key, { op: 'img', name: `cover-${rb.cover}.jpg`, type: (/^data:([^;]+)/.exec(data) || [])[1] || 'image/jpeg', data });
  M.cfg.covers = { ...(M.cfg.covers || {}), [rb.cover]: r.url }; saveCfg();
  return r.url;
}
const draftFields = () => { const d = M.cfg.draft; return Object.fromEntries(['book', ...[...M_FIELDS, ...M_MORE].map(([k]) => k)].map((k) => [k, k === 'btn' ? (d.btn ?? 'Читать') : d[k] || ''])); };

// ---------- действия ----------
acts['mail.reload'] = () => { M.cfg = null; M.info = null; load(true); return false; };
acts['mail.range'] = (d) => { M.range = Number(d.v); };
acts['mail.status'] = (d) => { M.status = d.v; M.page = 0; };
acts['mail.page'] = (d) => { M.page = Math.max(0, M.page + Number(d.v)); };
acts['mail.pv'] = (d) => { M.pv = d.v === '1'; };
acts['mail.dark'] = (d) => { M.dark = d.v === '1'; preview(); document.querySelectorAll('[data-act="mail.dark"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); return false; };
acts['mail.when'] = (d) => { M.when = d.v; M.sure = false; };
acts['mail.slot'] = (d) => { M.at = { ...M.at, date: d.d }; M.sure = false; };
acts['mail.new'] = () => { M.when = M.cfg?.draft?.at ? 'later' : 'now'; M.at = null; M.sure = false; app().go('/site/letter'); return false; };
acts['mail.edit'] = async (d) => {
  const q = (M.info?.queue || []).find((x) => x.id === d.id);
  if (!q) return;
  M.cfg.draft = { ...(q.draft || { subject: q.subject }), id: q.id, at: q.at }; saveCfg();
  M.when = 'later'; M.at = localParts(q.at); M.sure = false;
  app().go('/site/letter'); return false;
};
acts['mail.again'] = (d) => {
  const x = (M.info?.sent || []).find((s) => (s.id || s.at) === d.id);
  if (!x?.draft) return;
  M.cfg.draft = { ...x.draft }; saveCfg(); M.when = 'now'; M.at = null; M.sure = false;
  app().go('/site/letter'); return false;
};
acts['mail.sendq'] = async (d, el) => {
  const q = (M.info?.queue || []).find((x) => x.id === d.id);
  if (!q || !(await ask(`Отправить «${q.subject || 'письмо'}» всем подписчицам сейчас?`, 'Отправить'))) return false;
  el.disabled = true;
  try { const r = await mailCall(mailUrl(), M.cfg.key, { op: 'sendq', id: d.id }); M.info.queue = r.queue; syncPlanner(); toast(`Отправлено: ${r.sent}`); await refresh(true); }
  catch (e) { toast(e.message); el.disabled = false; return false; }
};
acts['mail.unq'] = async (d) => {
  const q = (M.info?.queue || []).find((x) => x.id === d.id);
  try {
    const r = await mailCall(mailUrl(), M.cfg.key, { op: 'unschedule', id: d.id });
    M.info.queue = r.queue; syncPlanner();
    if (q?.draft) { M.cfg.draft = { ...q.draft }; saveCfg(); }
    toast(`Отправка «${q?.subject || ''}» отменена — письмо осталось черновиком`);
  } catch (e) { toast(e.message); return false; }
};
acts['mail.sure'] = () => {
  const d = M.cfg.draft;
  if (!M.sure && (!d.subject || !d.text)) { toast('Впишите тему и текст письма'); return; }
  if (!M.sure && M.when === 'later' && localIso(M.at.date, M.at.time) <= new Date().toISOString()) { toast('Это время уже прошло — выберите позже'); return; }
  M.sure = !M.sure;
};
acts['mail.test'] = async (d, el) => {
  const dr = M.cfg.draft;
  if (!dr.subject || !dr.text) { toast('Впишите тему и текст письма'); return false; }
  el.disabled = true;
  try {
    const L = letterOf(await letterCover());
    const r = await mailCall(mailUrl(), M.cfg.key, { op: 'send', test: true, subject: dr.subject, html: L.html, text: L.text });
    toast(r.sent ? `Пробное письмо отправлено на ${M.info?.replyTo || 'вашу почту'}` : 'Не получилось отправить — проверьте адрес отправителя в Postbox');
  } catch (e) { toast(e.message); }
  el.disabled = false; return false;
};
acts['mail.go'] = async (d, el) => {
  const dr = M.cfg.draft, later = M.when === 'later';
  el.disabled = true; el.textContent = later ? 'Сохраняю…' : 'Отправляю…';
  try {
    const L = letterOf(await letterCover()), draft = draftFields();
    if (later) {
      const at = localIso(M.at.date, M.at.time);
      const r = await mailCall(mailUrl(), M.cfg.key, { op: 'schedule', id: dr.id || undefined, at, subject: dr.subject, html: L.html, text: L.text, draft });
      M.info.queue = r.queue; syncPlanner();
      toast(`Письмо уйдёт ${dm(at)} — оно в Планере`);
    } else {
      const r = await mailCall(mailUrl(), M.cfg.key, { op: 'send', subject: dr.subject, html: L.html, text: L.text, draft });
      if (dr.id) { const q = await mailCall(mailUrl(), M.cfg.key, { op: 'unschedule', id: dr.id }); M.info.queue = q.queue; syncPlanner(); }
      toast(`Отправлено: ${r.sent}${r.failed?.length ? `, не дошло: ${r.failed.length}` : ''}`);
    }
    M.cfg.draft = {}; saveCfg(); M.sure = false; M.at = null; M.when = 'now';
    await refresh(true);
    app().go('/site/mail');
  } catch (e) { toast(e.message); el.disabled = false; }
  return false;
};
acts['mail.csv'] = () => { download(`podpischicy_${app().ctx().today}.csv`, subsCsv(M.info?.list || []), 'text/csv'); return false; };
acts['mail.del'] = async (d) => {
  try { await mailCall(mailUrl(), M.cfg.key, { op: 'remove', email: d.e }); M.info.list = M.info.list.filter((p) => p.email !== d.e); toast(`Адрес ${d.e} удалён`); } catch (e) { toast(e.message); return false; }
};
acts['mail.import'] = async () => {
  const known = new Set(M.info.list.map((p) => p.email));
  const list = (M.old || []).filter((x) => x.email && !known.has(String(x.email).trim().toLowerCase())).map((x) => ({ email: x.email, name: x.name || '', at: x.at || '' }));
  try { const r = await mailCall(mailUrl(), M.cfg.key, { op: 'import', list }); toast(`Перенесено адресов: ${r.added}`); await refresh(true); } catch (e) { toast(e.message); return false; }
};
acts['mail.connect'] = async () => {
  const url = M.newUrl ?? (document.querySelector('[data-ml-url]')?.value || '').trim(), key = M.newKey ?? (document.querySelector('[data-ml-key]')?.value || '').trim();
  if (!/^https?:\/\//.test(url) || !key) { toast('Впишите адрес сервиса и пароль'); return false; }
  try {
    await mailCall(url, key, { op: 'list' });
    const w = await who();
    M.cfg.key = key; await saveMailCfg(w.uid, w.token, M.cfg);
    if (url !== mailUrl()) { await patchSite({ mailUrl: url }, w.token); M.raw.mailUrl = url; }
    toast('Почта подключена — подписка на сайте тоже идёт через неё');
    await refresh(true);
  } catch (e) { toast(e.why === 'key' ? 'Пароль не подходит — сверьте с ADMIN_KEY в функции' : e.message); return false; }
};
acts['mail.pasting'] = () => { M.pasting = !M.pasting; OPEN.add('ai'); };
acts['mail.ai'] = () => {
  const b = books().find((x) => x.id === M.cfg.draft.book), rb = rawBook(M.cfg.draft.book);
  const text = `Это письмо читательницам с моего авторского сайта (я пишу любовные романы; подписчицы ждут писем только о выходе новых романов). Помоги: [напишите, что нужно — например, сделать текст живее и короче].

Правила ответа: верни ВЕСЬ JSON целиком одним блоком кода, те же поля.
- letter — само письмо: subject (тема), preheader (строка после темы во входящих), eyebrow (маленькая строка над заголовком), title (заголовок; *звёздочки* — тонкий курсив), text (абзацы через пустую строку), quote (цитата из книги — только настоящая, из текста, не выдумывай), btn (кнопка), url (куда ведёт кнопка; пусто — на книгу), sign (подпись). Поле book не меняй
- design — оформление всех писем: autograph (автограф с медведем в конце, true/false), bear (медведь в кружке сверху, true/false), links (ссылки на сайт и Telegram внизу), sign (подпись по умолчанию), footer (текст внизу над «Отписаться»), tint (подложка под обложкой, #RRGGBB или пусто), paper (фон, #RRGGBB), ink (текст и кнопка, #RRGGBB)
- В тексте: *курсив*, **жирный**, [слова](https://ссылка)
${b ? `- Книга в письме: «${b.title}»${rb?.ann ? `. Аннотация: ${plain(rb.ann).slice(0, 1200)}` : ''}\n` : ''}
\`\`\`json
${JSON.stringify({ letter: draftFields(), design: design() }, null, 2)}
\`\`\``;
  copyRich(text);
  return false;
};
acts['mail.apply'] = async () => {
  const raw = document.getElementById('ml-answer')?.value || '';
  let j; try { j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); } catch { j = null; }
  if (!j || (!j.letter && !j.design)) { toast('Не нашла в ответе письма. Попросите нейросеть прислать JSON целиком одним блоком кода.'); return false; }
  const was = { draft: { ...M.cfg.draft }, letter: M.raw.letter ? { ...M.raw.letter } : undefined };
  const keys = new Set([...M_FIELDS, ...M_MORE].map(([k]) => k));
  for (const [k, v] of Object.entries(j.letter || {})) if (keys.has(k) && typeof v === 'string') M.cfg.draft[k] = v;
  if (j.design && typeof j.design === 'object') {
    const L = { ...(M.raw.letter || {}) };
    for (const [k, v] of Object.entries(j.design)) if (k in LETTER_DEFAULTS && typeof v === typeof LETTER_DEFAULTS[k]) L[k] = v;
    M.raw.letter = L; saveDesign();
  }
  M.pasting = false; saveCfg();
  toast('Ответ нейросети применён', { undo: () => { M.cfg.draft = was.draft; M.raw.letter = was.letter; saveCfg(); saveDesign(); app().rerender(); } });
};
changes['mail.noop'] = () => false;
