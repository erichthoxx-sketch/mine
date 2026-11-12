// Маркетинг → «Пираты»: найденные копии книг и путь по каждой — письмо сайту → письмо хостингу → убрать из поиска.
// Поиск идёт сам раз в сутки (piracyscan.js); расчёты и тексты писем — piracy.js.
import { ic } from '../../../js/icons.js';
import { esc, acts, changes, toast, openSheet, fold, copyRich, ask } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import { searchQueries, ENGINES, LEGIT, PIRATE_HINT, PIRATE_WORDS, nextStep, piracySummary, letterSite, letterHost, letterFormal, mailto, SEARCH_FORMS, archiveUrl, CF_FORM, findId, hostOf, plainTitle, isLegit, WAIT_SITE } from '../piracy.js';
import { scan, scanState, findContacts, pageLen, onSkipBack } from '../piracyscan.js';
import { mailSvc } from './mail.js';

const app = () => window.__app;
const P = { contacts: {} }; // почты, которые сейчас ищутся: id → true
const bookOf = (c, f) => { const b = (c.wbooks || []).find((x) => x.id === f.bookId); return { title: b?.title || f.title, link: b?.direct?.link || '' }; };
// подпись писем — псевдоним (без ФИО), почта для ответа — адрес для ответов сервиса писем
const meOf = (c) => ({ pen: c.settings.pseudonym || '', email: mailSvc().replyTo || c.settings.piracy?.me?.email || '', name: c.settings.piracy?.me?.name || '' });
const canSend = () => { const m = mailSvc(); return m.ready && m.v >= 5; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Отправить претензию по находке через сервис писем (с адреса сайта): новая → сайту (нет почты сайта — сразу хостингу), «сайт не ответил» → хостингу.
// Возвращает 'site' | 'host' | '' (некому писать или рано)
export async function sendClaim(a, id) {
  let f = get(id); if (!f) return '';
  const c = a.ctx(), st = nextStep(f, c.today);
  if (!st || st.wait || !['site', 'host'].includes(st.k)) return '';
  if (!f.contacts) { const ct = await findContacts(f); await patch(get(id) || f, { contacts: ct }); f = { ...(get(id) || f), contacts: ct }; }
  const ct = f.contacts, hostTo = [...(ct.host || []), ...(ct.reg || [])].filter((x) => !/cloudflare/i.test(x));
  const k = st.k === 'site' && (ct.site || []).length ? 'site' : hostTo.length ? 'host' : '';
  if (!k) return '';
  const L = (k === 'host' ? letterHost : letterSite)(f, bookOf(c, f), meOf(c), c.today);
  const r = await mailSvc().call({ op: 'claim', to: k === 'host' ? hostTo : ct.site, subject: L.subject, text: L.body });
  if (!r?.ok) return '';
  const now = new Date().toISOString();
  await patch(get(id) || f, k === 'host' ? { status: 'host', hostAt: now, goneMaybe: false, via: 'service' } : { status: 'sent', sentAt: now, via: 'service' });
  return k;
}
// Всем, кому пора: новым уверенным находкам и тем, где сайт не ответил. only — только эти id
export async function sendAllClaims(a, { onStep } = {}) {
  const c = a.ctx(), list = (c.data.w_piracy || []).filter((f) => { const s = nextStep(f, c.today); return f.sure !== false && s && !s.wait && ['site', 'host'].includes(s.k) && !f.goneMaybe; });
  let n = 0, miss = 0;
  for (const f of list) { onStep?.(`Отправляю: ${f.host}…`); try { (await sendClaim(a, f.id)) ? n++ : miss++; } catch { miss++; } await sleep(1500); }
  return { n, miss };
}
// Круглосуточный поиск: задание сервису писем (он ищет по таймеру, даже когда Мастерская закрыта) и его находки → w_piracy.
// Вызывается при открытии Мастерской и раздела; сервис старее версии 6 — ищет сама Мастерская, как раньше.
let srvBusy = false;
export async function syncServer(a) {
  if (srvBusy || typeof window === 'undefined' || /^(localhost|127\.)/.test(location.hostname)) return null;
  for (let i = 0; i < 10 && !mailSvc().v; i++) await sleep(1000);
  const m = mailSvc();
  if (!m.ready || m.v < 6) return null;
  srvBusy = true;
  try {
    const c = a.ctx(), cfg0 = c.settings.piracy || {}, mine = c.data.w_piracy || [];
    const books = (c.wbooks || []).filter((b) => b.title && b.status !== 'idea').map((b) => ({ id: b.id, title: plainTitle(b.title), q: searchQueries(b.title, c.settings.pseudonym || '') }));
    const cfg = { on: !cfg0.off, auto: !!cfg0.auto, author: c.settings.pseudonym || '', books, engines: ENGINES.slice(0, 2).map(([, mk]) => mk('')), legit: LEGIT, hint: PIRATE_HINT.source, words: PIRATE_WORDS.source, known: mine.filter((f) => f.status !== 'skip').map((f) => f.host + '|' + f.bookId), skipUrls: mine.filter((f) => f.status === 'skip').map((f) => f.url) };
    const r = await m.call({ op: 'piracy', cfg });
    let added = 0;
    for (const f of r.finds || []) {
      const all = a.ctx().data.w_piracy || [];
      if (all.some((x) => x.url === f.url || (x.status !== 'skip' && x.host === f.host && x.bookId === f.bookId))) continue;
      await a.store.put('w_piracy', { ...f, id: findId(f.url), status: 'new', via: 'server' }); added++;
    }
    // сервис отчитался недавно — своя проверка в браузере сегодня не нужна
    // сервис нашёл что-то за 36 часов — своя проверка в браузере не нужна; сервис не может искать — ищет сам браузер, ошибку сервиса не показываем
    const okAt = r.okAt || '';
    // поиск Яндекса (сервис 10+, по ночам): работает / нет разрешения — строкой в «Пиратах»
    const ya = r.yOk && Date.now() - Date.parse(r.yOk) < 48 * 3600e3 ? 'ok' : r.yErr ? 'err:' + r.yErr : '';
    if (ya !== (a.ctx().settings.piracy?.ya || '')) await a.store.saveSettings({ piracy: { ...(a.ctx().settings.piracy || {}), ya } });
    if (okAt && Date.now() - Date.parse(okAt) < 36 * 3600e3) await a.store.saveSettings({ piracy: { ...(a.ctx().settings.piracy || {}), at: okAt, engine: 'круглосуточно', books: books.length, err: '', srv: true } });
    else if (a.ctx().settings.piracy?.srv) await a.store.saveSettings({ piracy: { ...(a.ctx().settings.piracy || {}), srv: false, err: '', at: '' } });
    return { added };
  } catch (e) { console.warn('Круглосуточный поиск:', e); return null; } finally { srvBusy = false; }
}
// страница «Это не пират» снова с полным текстом — письмо владелице (сервис писем 8+), в Планере — «новые копии»
onSkipBack(async (list) => {
  const m = mailSvc();
  if (!m.ready || m.v < 8) return;
  const text = 'На страницах, которые вы отмечали «Это не пират», появился полный текст книги:\n\n' + list.map((f) => `«${f.title}» — ${f.url}\n${f.why}`).join('\n\n') + '\n\nНаходки снова в Мастерской → Маркетинг → Пираты, в «Новых».';
  try { await m.call({ op: 'note', subject: `Пираты: снова полный текст (${list.length})`, text }); } catch (e) { console.warn('Письмо о пиратах:', e); }
});
let srvArmed = false;
export function autoServer(a) {
  if (srvArmed || a.store.mode !== 'firebase' || !(a.store.data?.w_books || []).length) return;
  srvArmed = true;
  setTimeout(() => syncServer(a).then((r) => { if (r) autoSend(a); }), 4000);
}

// Автопилот: после ежедневного поиска письма уходят сами (если включён и сервис писем готов)
export async function autoSend(a) {
  if (!a.ctx().settings.piracy?.auto) return;
  for (let i = 0; i < 10 && !mailSvc().v; i++) await sleep(1000); // сервис писем подгружается
  if (!canSend()) return;
  const r = await sendAllClaims(a);
  if (r.n) toast(`Пираты: отправлено претензий — ${r.n}`);
}
const when = (iso) => (iso ? fmtDate(iso.slice(0, 10)) : '');

function row(c, f) {
  const st = nextStep(f, c.today), done = f.status === 'gone';
  const act = f.sure === false && (f.status || 'new') === 'new' ? `<button class="primary" data-act="pr.mine" data-id="${f.id}">Да, моя книга</button>`
    : !st ? '' : st.k === 'site' ? `<button class="primary" data-act="pr.write" data-id="${f.id}" data-k="site">Написать сайту</button>`
    : st.k === 'host' && !st.wait ? `<button class="primary" data-act="pr.write" data-id="${f.id}" data-k="host">Написать хостингу</button>`
    : st.k === 'search' && !st.wait ? `<button class="primary" data-act="pr.search" data-id="${f.id}">Убрать из поиска</button>`
    : st.k === 'confirm' ? `<button class="primary" data-act="pr.gone" data-id="${f.id}">Да, удалили</button>` : '';
  const trail = [f.sentAt ? `сайту — ${when(f.sentAt)}` : '', f.hostAt ? `хостингу — ${when(f.hostAt)}` : '', f.searchAt ? `в поисковики — ${when(f.searchAt)}` : ''].filter(Boolean).join(' · ');
  return `<div class="item pr-item">
    <div class="row between" style="gap:12px;align-items:flex-start">
      <div style="min-width:0"><b>${esc(f.host)}</b> <span class="small muted">· ${esc(f.title)}</span>
        <div class="small muted" style="margin-top:2px">${done ? `удалено ${when(f.goneAt)}` : esc(st?.wait || st?.k === 'confirm' ? st.text : f.why || '')}${!done && trail ? ` · писала: ${esc(trail)}` : ''}</div></div>
      ${act}
    </div>
    <div class="row small" style="gap:14px;margin-top:6px;flex-wrap:wrap">
      <a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">Открыть страницу</a>
      ${done ? '' : `<a href="${esc(archiveUrl(f.url))}" target="_blank" rel="noopener noreferrer">Сохранить доказательство</a>
      ${f.status && f.status !== 'new' ? `<button class="link" data-act="pr.write" data-id="${f.id}" data-k="formal">Официальное заявление</button><button class="link" data-act="pr.gone" data-id="${f.id}">Удалили</button>` : ''}
      <button class="link" data-act="pr.skip" data-id="${f.id}">Это не пират</button>`}
    </div></div>`;
}

export function piracyView(a) {
  const c = a.ctx(), all = (c.data.w_piracy || []).filter((f) => f.status !== 'skip'), cfg = c.settings.piracy || {}, sum = piracySummary(all);
  const by = (ks) => all.filter((f) => ks.includes(f.status || 'new')).sort((x, y) => (y.foundAt || '').localeCompare(x.foundAt || ''));
  const fresh = by(['new']), work = by(['sent', 'host', 'search']), gone = by(['gone']);
  const ask0 = fresh.filter((f) => f.sure === false), sureNew = fresh.filter((f) => f.sure !== false); // сомнительные — на её ручную проверку
  const svc = mailSvc(), send = svc.ready && svc.v >= 5;
  const due = all.filter((f) => { const x = nextStep(f, c.today); return f.sure !== false && x && !x.wait && ['site', 'host'].includes(x.k) && !f.goneMaybe; }).length;
  const state = scanState.busy ? esc(scanState.step || 'Ищу…') : cfg.at ? `${cfg.srv ? 'Ищу круглосуточно · последняя проверка' : 'Проверено'} ${when(cfg.at)}: ${cfg.books || 0} ${plural(cfg.books || 0, ['книга', 'книги', 'книг'])}${cfg.engine && !cfg.srv ? ` · ${esc(cfg.engine)}` : ''}${cfg.err ? ` · ${esc(cfg.err)}` : ''}${cfg.ya === 'ok' ? ' · Яндекс — по ночам' : String(cfg.ya || '').startsWith('err:') ? ` · Яндекс: ${esc(cfg.ya.slice(4))}` : ''}` : 'Ещё не проверяла — первая проверка начнётся сама';
  return `<div class="card" style="margin-top:14px">
    <div class="row between"><h2 style="margin:0">Пиратские копии</h2><button class="small-btn" data-act="pr.scan"${scanState.busy ? ' disabled' : ''}>${scanState.busy ? 'Ищу…' : 'Проверить сейчас'}</button></div>
    <p class="small muted" style="margin:6px 0 12px" id="pr-state">${state}</p>
    <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><div class="k">Новые</div><div class="v">${sum.fresh}</div><div class="s">${ask0.length ? `из них проверить: ${ask0.length}` : 'нужно письмо'}</div></div>
      <div><div class="k">В работе</div><div class="v">${sum.work}</div><div class="s">ждём ответа</div></div>
      <div><div class="k">Удалено</div><div class="v">${sum.gone}</div><div class="s">за всё время</div></div></div>
    ${send ? `<div class="row between" style="margin-top:14px;gap:12px;flex-wrap:wrap"><label class="d-check small" style="display:flex;gap:8px;align-items:center;margin:0"><input type="checkbox" data-chg="pr.auto"${cfg.auto ? ' checked' : ''}> Автопилот: претензии уходят сами, как только копия найдена</label>
      ${due ? `<button class="primary" data-act="pr.sendAll">Отправить все претензии · ${due}</button>` : ''}</div>`
      : ''}
    ${svc.ready && svc.v >= 6 ? '' : `<p class="small" style="margin:12px 0 0">${svc.ready ? `Чтобы поиск шёл круглосуточно, даже когда Мастерская закрыта, а претензии уходили отсюда одной кнопкой, обновите программу сервиса писем: Сайт → Почта → «Скопировать программу» → Яндекс Облако → Cloud Functions → lana-mail → Редактор → index.js → вставить → «Сохранить изменения». И там же в настройках функции поставьте «Таймаут» 60 секунд.` : 'Круглосуточный поиск и отправка одной кнопкой работают через сервис писем — подключите его в разделе Сайт → Почта.'} Пока ищу сама, когда Мастерская открыта${send ? '' : ', а письма открываются в вашей почте'}.</p>`}
  </div>
  ${ask0.length ? `<div class="card"><h2 style="margin:0 0 4px">Проверьте: ваша ли это книга</h2><p class="small muted" style="margin:0 0 6px">Название совпало, но вашей фамилии на странице не видно. Без вашего «да» претензия не уйдёт — ни с автопилотом, ни по кнопке «Отправить все».</p><div class="list">${ask0.map((f) => row(c, f)).join('')}</div></div>` : ''}
  ${sureNew.length ? `<div class="card"><h2 style="margin:0 0 4px">Новые</h2><div class="list">${sureNew.map((f) => row(c, f)).join('')}</div></div>` : ''}
  ${work.length ? `<div class="card"><h2 style="margin:0 0 4px">В работе</h2><div class="list">${work.map((f) => row(c, f)).join('')}</div></div>` : ''}
  ${!all.length && cfg.at ? `<div class="card"><p class="muted" style="margin:0">Копий не найдено. Проверяю сама каждый день, пока открыта Мастерская, — найду, появится дело в Планере.</p></div>` : ''}
  ${gone.length ? fold('pr-gone', 'Удалено', `<div class="list">${gone.map((f) => row(c, f)).join('')}</div>`, { sub: String(gone.length) }) : ''}
  ${fold('pr-how', 'Как это работает', `<div class="small" style="line-height:1.7">
    <p style="margin:0 0 8px">Каждый день каждая книга ищется в поисковиках («читать онлайн бесплатно», «скачать fb2») и показывает чужие сайты с вашим текстом. Ваши площадки и магазины не считаются.</p>
    <p style="margin:0 0 8px"><b>1. Досудебная претензия сайту</b> — от имени автора (псевдоним), без ваших личных данных. Почту сайта и его хостинга нахожу сама. Срок — 24 часа (ст. 15.7 закона № 149-ФЗ, ст. 1253.1 ГК РФ). Перед письмом нажмите «Сохранить доказательство» — копия страницы останется в веб-архиве.</p>
    <p style="margin:0 0 8px"><b>2. Через ${WAIT_SITE} дня — хостингу.</b> Хостинг не хочет проблем и обычно закрывает страницу сам.</p>
    <p style="margin:0 0 8px"><b>3. Поисковики.</b> Если не помогло — заявка в Google и Яндекс, чтобы страницу убрали из поиска: без поиска её почти никто не найдёт.</p>
    <p style="margin:0">Дальше — только суд (блокировка сайта через Мосгорсуд и компенсация по ст. 1301 ГК РФ); тут нужен юрист. Письма — шаблоны, не юридическая консультация. Если книга на Литнете по эксклюзивному договору, спросите и поддержку Литнета: у них есть своя защита от пиратов.</p></div>`)}
  <p class="small" style="margin:12px 0 0;display:flex;gap:16px;flex-wrap:wrap"><button class="link" data-act="pr.add">+ Добавить ссылку вручную</button></p>`;
}

const patch = (f, p) => app().store.put('w_piracy', { ...f, ...p });
const get = (id) => (app().ctx().data.w_piracy || []).find((f) => f.id === id);

acts['pr.scan'] = () => {
  const a = app();
  scan(a, { onStep: (t) => { const el = document.getElementById('pr-state'); if (el && t) el.textContent = t; } })
    .then((r) => { if (r) toast(r.err && !r.added ? r.err : r.added ? `Найдено новых копий: ${r.added}` : 'Новых копий не найдено'); a.rerender(); return autoSend(a); });
  setTimeout(() => a.rerender(), 50);
  return false;
};
acts['pr.sendAll'] = () => {
  const a = app();
  sendAllClaims(a, { onStep: (t) => { const el = document.getElementById('pr-state'); if (el) el.textContent = t; } })
    .then((r) => { toast(r.n ? `Отправлено претензий: ${r.n}${r.miss ? ` · без почты: ${r.miss} — откройте их вручную` : ''}` : 'Отправить не удалось: у этих сайтов не нашлось почты — откройте их вручную'); a.rerender(); });
  return false;
};
changes['pr.auto'] = async (v, el) => { const a = app(); await a.store.saveSettings({ piracy: { ...(a.ctx().settings.piracy || {}), auto: !!el.checked } }); if (el.checked) autoSend(a); };
acts['pr.add'] = () => {
  const a = app(), c = a.ctx(), books = (c.wbooks || []).filter((b) => b.status !== 'idea');
  openSheet('Пиратская копия', `<label>Ссылка на страницу с книгой</label><input name="url" type="url" required placeholder="https://…">
    <label>Книга</label><select name="book">${books.map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join('')}</select>`, async (fd) => {
    const url = String(fd.get('url') || '').trim(), host = hostOf(url), b = books.find((x) => x.id === fd.get('book'));
    if (!host || !b) { toast('Проверьте ссылку'); return false; }
    if (isLegit(host) && !(await ask(`${host} — известный магазин или соцсеть. Всё равно добавить?`, 'Добавить'))) return false;
    await a.store.put('w_piracy', { id: findId(url), url, host, bookId: b.id, title: plainTitle(b.title), why: 'добавлено вручную', sure: true, status: 'new', foundAt: new Date().toISOString() });
  }, { submitText: 'Добавить' });
  return false;
};
// окно письма: почты (ищутся при открытии), текст, «Открыть в почте» / «Скопировать», потом — «Отправила»
acts['pr.write'] = (d) => {
  const a = app(), c = a.ctx(), f = get(d.id);
  if (!f) return false;
  const k = d.k, L = (k === 'host' ? letterHost : k === 'formal' ? letterFormal : letterSite)(f, bookOf(c, f), meOf(c), c.today);
  const toOf = (ct) => (k === 'host' ? [...(ct?.host || []), ...(ct?.reg || [])] : ct?.site || []);
  const mailBox = (ct) => {
    if (!ct) return `<p class="small muted" id="pr-to">Ищу почту ${k === 'host' ? 'хостинга' : 'сайта'}…</p>`;
    const to = toOf(ct);
    const who = k === 'host' ? [ct.hostName ? `хостинг ${ct.hostName}` : '', ct.regName ? `регистратор ${ct.regName}` : ''].filter(Boolean).join(', ') : '';
    return `<div id="pr-to">${to.length ? `<p class="small" style="margin:0 0 6px">Кому: <b>${esc(to.join(', '))}</b>${who ? ` <span class="muted">· ${esc(who)}</span>` : ''}</p>
        <p style="margin:0 0 4px"><a class="small-btn" href="${esc(mailto(to, L))}" target="_blank" rel="noopener">Открыть в почте</a></p>`
      : `<p class="small" style="margin:0 0 6px">${k === 'host' ? 'Почту хостинга найти не удалось.' : 'Почты на сайте не нашла — поищите на нём страницу «Правообладателям» или форму связи и вставьте письмо туда. Если связи нет — сразу пишите хостингу.'}</p>`}
      ${k === 'host' && ct.cf ? `<p class="small" style="margin:6px 0 0">Сайт спрятан за Cloudflare — почту он не читает, жалоба подаётся <a href="${CF_FORM}" target="_blank" rel="noopener">через его форму</a> (текст письма ниже подойдёт).</p>` : ''}
      ${k !== 'host' && !to.length && (ct.host || []).length ? `<p class="small" style="margin:6px 0 0"><button class="link" type="button" data-act="pr.write" data-id="${f.id}" data-k="host">Написать хостингу (${esc(ct.host[0])})</button></p>` : ''}</div>`;
  };
  openSheet(k === 'host' ? `Хостингу · ${f.host}` : k === 'formal' ? `Заявление · ${f.host}` : `Сайту · ${f.host}`, `${mailBox(f.contacts)}
    <label style="margin-top:10px">Тема</label><input id="pr-subj" value="${esc(L.subject)}" readonly>
    <label>Письмо</label><textarea id="pr-body" rows="12" style="font-size:14px;line-height:1.5">${esc(L.body)}</textarea>
    <p class="small" style="margin:8px 0 0"><button class="link" type="button" data-act="pr.copy">${ic('copy')} Скопировать письмо</button></p>
    ${k === 'formal' ? '<p class="small muted" style="margin:8px 0 0">По закону в заявлении указывают паспортные данные и телефон — впишите их сами вместо квадратных скобок. Первое письмо я отправляю без них: большинство сайтов удаляет и так.</p>' : ''}`,
  k === 'formal' ? null : async () => {
    const ct = (get(f.id) || f).contacts, to = toOf(ct).filter((x) => !/cloudflare/i.test(x));
    if (canSend() && to.length) {
      const body = document.getElementById('pr-body')?.value || L.body;
      let r; try { r = await mailSvc().call({ op: 'claim', to, subject: L.subject, text: body }); } catch (e) { toast('Не отправилось: ' + e.message); return false; }
      if (!r?.ok) { toast('Письмо не принято почтой адресата — откройте в своей почте'); return false; }
    }
    await patch(get(f.id) || f, k === 'host' ? { status: 'host', hostAt: new Date().toISOString(), goneMaybe: false } : { status: 'sent', sentAt: new Date().toISOString() }); toast(k === 'host' ? 'Готово. Через 5 дней напомню проверить' : `Готово. Через ${WAIT_SITE} дня проверю, удалили ли`); },
  { submitText: canSend() ? 'Отправить' : 'Отправила' });
  if (!f.contacts && !P.contacts[f.id]) {
    P.contacts[f.id] = true;
    findContacts(f).then(async (ct) => {
      delete P.contacts[f.id];
      const el = document.getElementById('pr-to');
      if (el) el.outerHTML = mailBox(ct);
      await patch(get(f.id) || f, { contacts: ct });
    }).catch(() => { delete P.contacts[f.id]; const el = document.getElementById('pr-to'); if (el) el.textContent = 'Почту найти не получилось — проверьте интернет.'; });
  }
  return false;
};
acts['pr.copy'] = () => { copyRich(document.getElementById('pr-body')?.value || ''); toast('Письмо скопировано'); return false; };
acts['pr.search'] = (d) => {
  const f = get(d.id);
  if (!f) return false;
  openSheet(`Убрать из поиска · ${f.host}`, `<p class="small">Поисковики убирают страницу из выдачи по заявке автора. В форме понадобятся: ссылка на пиратскую страницу, ссылка на вашу книгу и ваше имя.</p>
    <label>Пиратская страница</label><input value="${esc(f.url)}" readonly onclick="this.select()">
    <label>Ваша книга</label><input value="${esc(bookOf(app().ctx(), f).link || 'ссылка на книгу на Литнете')}" readonly onclick="this.select()">
    <p style="margin:12px 0 0;display:flex;gap:10px;flex-wrap:wrap">${SEARCH_FORMS.map(([t, u]) => `<a class="small-btn" href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join('')}</p>`,
  async () => { await patch(get(f.id) || f, { status: 'search', searchAt: new Date().toISOString() }); }, { submitText: 'Подала заявки' });
  return false;
};
// «Да, моя книга»: сомнительная находка становится обычной; с автопилотом претензия уходит сразу
acts['pr.mine'] = async (d) => {
  const f = get(d.id); if (!f) return;
  await patch(f, { sure: true, why: 'вы подтвердили, что книга ваша' });
  const a = window.__app, auto = a.ctx().settings.piracy?.auto && canSend();
  toast(auto ? 'Подтверждено — претензия уходит' : 'Подтверждено — находка в «Новых»', { undo: () => patch(get(d.id), { sure: false, why: f.why || '' }) });
  if (auto) autoSend(a);
};
acts['pr.gone'] = async (d) => { const f = get(d.id); if (f) { await patch(f, { status: 'gone', goneAt: new Date().toISOString(), goneMaybe: false }); toast('Отлично — убрала в «Удалено»', { undo: () => patch(get(d.id), { status: f.status, goneAt: null, goneMaybe: f.goneMaybe || false }) }); } };
// «Это не пират» (не её книга или законный фрагмент): прячется только эта страница — другие страницы этого же сайта по-прежнему находятся
acts['pr.skip'] = async (d) => {
  const f = get(d.id);
  if (!f) return;
  await patch(f, { status: 'skip', skipLen: 0, skipCheckAt: new Date().toISOString() });
  // запомнить, сколько текста на странице сейчас: появится полный текст — находка вернётся (recheckSkipped)
  pageLen(f.url).then((n) => { const g = get(d.id); if (n && g?.status === 'skip') patch(g, { skipLen: n }); });
  toast('Эту страницу больше не показываю. Другие страницы этого сайта буду находить, как обычно', { undo: () => patch(get(d.id), { status: f.status || 'new' }) });
};
