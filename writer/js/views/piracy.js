// Маркетинг → «Пираты»: найденные копии книг и путь по каждой — письмо сайту → письмо хостингу → убрать из поиска.
// Поиск идёт сам раз в сутки (piracyscan.js); расчёты и тексты писем — piracy.js.
import { ic } from '../../../js/icons.js';
import { esc, acts, toast, openSheet, fold, copyRich, ask } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import { nextStep, piracySummary, letterSite, letterHost, letterFormal, mailto, SEARCH_FORMS, archiveUrl, CF_FORM, findId, hostOf, plainTitle, isLegit, WAIT_SITE } from '../piracy.js';
import { scan, scanState, findContacts } from '../piracyscan.js';

const app = () => window.__app;
const P = { contacts: {} }; // почты, которые сейчас ищутся: id → true
const bookOf = (c, f) => { const b = (c.wbooks || []).find((x) => x.id === f.bookId); return { title: b?.title || f.title, link: b?.direct?.link || '' }; };
const meOf = (c) => ({ pen: c.settings.pseudonym || '', ...(c.settings.piracy?.me || {}) });
const when = (iso) => (iso ? fmtDate(iso.slice(0, 10)) : '');

function row(c, f) {
  const st = nextStep(f, c.today), done = f.status === 'gone';
  const act = !st ? '' : st.k === 'site' ? `<button class="primary" data-act="pr.write" data-id="${f.id}" data-k="site">Написать сайту</button>`
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
  const me = cfg.me || {};
  const state = scanState.busy ? esc(scanState.step || 'Ищу…') : cfg.at ? `Проверено ${when(cfg.at)}: ${cfg.books || 0} ${plural(cfg.books || 0, ['книга', 'книги', 'книг'])}${cfg.engine ? ` · ${esc(cfg.engine)}` : ''}${cfg.err ? ` · ${esc(cfg.err)}` : ''}` : 'Ещё не проверяла — первая проверка начнётся сама';
  return `<div class="card" style="margin-top:14px">
    <div class="row between"><h2 style="margin:0">Пиратские копии</h2><button class="small-btn" data-act="pr.scan"${scanState.busy ? ' disabled' : ''}>${scanState.busy ? 'Ищу…' : 'Проверить сейчас'}</button></div>
    <p class="small muted" style="margin:6px 0 12px" id="pr-state">${state}</p>
    <div class="tiles" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><div class="k">Новые</div><div class="v">${sum.fresh}</div><div class="s">нужно письмо</div></div>
      <div><div class="k">В работе</div><div class="v">${sum.work}</div><div class="s">ждём ответа</div></div>
      <div><div class="k">Удалено</div><div class="v">${sum.gone}</div><div class="s">за всё время</div></div></div>
    ${!me.name ? `<p class="small" style="margin:12px 0 0">Чтобы письма были готовы к отправке, один раз укажите <button class="link" data-act="pr.me">своё имя и почту для ответов</button>.</p>` : ''}
  </div>
  ${fresh.length ? `<div class="card"><h2 style="margin:0 0 4px">Новые</h2><div class="list">${fresh.map((f) => row(c, f)).join('')}</div></div>` : ''}
  ${work.length ? `<div class="card"><h2 style="margin:0 0 4px">В работе</h2><div class="list">${work.map((f) => row(c, f)).join('')}</div></div>` : ''}
  ${!all.length && cfg.at ? `<div class="card"><p class="muted" style="margin:0">Копий не найдено. Проверяю сама каждый день, пока открыта Мастерская, — найду, появится дело в Планере.</p></div>` : ''}
  ${gone.length ? fold('pr-gone', 'Удалено', `<div class="list">${gone.map((f) => row(c, f)).join('')}</div>`, { sub: String(gone.length) }) : ''}
  ${fold('pr-how', 'Как это работает', `<div class="small" style="line-height:1.7">
    <p style="margin:0 0 8px">Раз в сутки Мастерская ищет каждую книгу в поисковиках («читать онлайн бесплатно», «скачать fb2») и показывает чужие сайты с вашим текстом. Ваши площадки и магазины не считаются.</p>
    <p style="margin:0 0 8px"><b>1. Письмо сайту.</b> Почту сайта и его хостинга нахожу сама. Требование удалить за 24 часа (ст. 15.7 закона № 149-ФЗ, ст. 1253.1 ГК РФ). Перед письмом нажмите «Сохранить доказательство» — копия страницы останется в веб-архиве.</p>
    <p style="margin:0 0 8px"><b>2. Через ${WAIT_SITE} дня — хостингу.</b> Хостинг не хочет проблем и обычно закрывает страницу сам.</p>
    <p style="margin:0 0 8px"><b>3. Поисковики.</b> Если не помогло — заявка в Google и Яндекс, чтобы страницу убрали из поиска: без поиска её почти никто не найдёт.</p>
    <p style="margin:0">Дальше — только суд (блокировка сайта через Мосгорсуд и компенсация по ст. 1301 ГК РФ); тут нужен юрист. Письма — шаблоны, не юридическая консультация. Если книга на Литнете по эксклюзивному договору, спросите и поддержку Литнета: у них есть своя защита от пиратов.</p></div>`)}
  <p class="small" style="margin:12px 0 0;display:flex;gap:16px;flex-wrap:wrap"><button class="link" data-act="pr.add">+ Добавить ссылку вручную</button><button class="link" data-act="pr.me">Мои данные для писем</button></p>`;
}

const patch = (f, p) => app().store.put('w_piracy', { ...f, ...p });
const get = (id) => (app().ctx().data.w_piracy || []).find((f) => f.id === id);

acts['pr.scan'] = () => {
  const a = app();
  scan(a, { onStep: (t) => { const el = document.getElementById('pr-state'); if (el && t) el.textContent = t; } })
    .then((r) => { if (r) toast(r.err && !r.added ? r.err : r.added ? `Найдено новых копий: ${r.added}` : 'Новых копий не найдено'); a.rerender(); });
  setTimeout(() => a.rerender(), 50);
  return false;
};
acts['pr.me'] = () => {
  const a = app(), me = a.ctx().settings.piracy?.me || {};
  openSheet('Мои данные для писем', `<p class="small">Права на книги принадлежат вам как человеку, поэтому письмо подписывается настоящим именем; псевдоним в письме тоже указан. Хранится только в ваших данных.</p>
    <label>Фамилия, имя, отчество</label><input name="name" value="${esc(me.name || '')}" autocomplete="name">
    <label>Почта для ответов</label><input name="email" type="email" value="${esc(me.email || '')}" autocomplete="email">`, async (fd) => {
    await a.store.saveSettings({ piracy: { ...(a.ctx().settings.piracy || {}), me: { name: String(fd.get('name') || '').trim(), email: String(fd.get('email') || '').trim() } } });
  }, { submitText: 'Сохранить' });
  return false;
};
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
  k === 'formal' ? null : async () => { await patch(get(f.id) || f, k === 'host' ? { status: 'host', hostAt: new Date().toISOString(), goneMaybe: false } : { status: 'sent', sentAt: new Date().toISOString() }); toast(k === 'host' ? 'Отмечено. Через 5 дней напомню проверить' : `Отмечено. Через ${WAIT_SITE} дня проверю, удалили ли`); },
  { submitText: 'Отправила' });
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
acts['pr.gone'] = async (d) => { const f = get(d.id); if (f) { await patch(f, { status: 'gone', goneAt: new Date().toISOString(), goneMaybe: false }); toast('Отлично — убрала в «Удалено»', { undo: () => patch(get(d.id), { status: f.status, goneAt: null, goneMaybe: f.goneMaybe || false }) }); } };
acts['pr.skip'] = async (d) => {
  const a = app(), f = get(d.id);
  if (!f) return;
  const cfg = a.ctx().settings.piracy || {};
  await patch(f, { status: 'skip' });
  await a.store.saveSettings({ piracy: { ...cfg, ignore: [...new Set([...(cfg.ignore || []), f.host])] } });
  toast(`${f.host} больше не показываю`, { undo: async () => { await patch(get(d.id), { status: f.status || 'new' }); await a.store.saveSettings({ piracy: { ...(a.ctx().settings.piracy || {}), ignore: (a.ctx().settings.piracy?.ignore || []).filter((h) => h !== f.host) } }); } });
};
