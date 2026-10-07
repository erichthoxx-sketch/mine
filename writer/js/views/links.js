// Связи: издательства, соцсети, площадки, люди — контакты, ссылки, история общения и запросы без ответа
import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, openSheet, opt, toast, N, uid, ask } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import { waitingStatus } from '../wcalc.js';

const app = () => window.__app;
export const LKINDS = { publisher: 'Издательства', social: 'Соцсети', platform: 'Площадки', people: 'Люди', other: 'Другое' };
const KIND1 = { publisher: 'Издательство', social: 'Соцсеть', platform: 'Площадка', people: 'Человек', other: 'Другое' };
const NETS = ['Telegram', 'ВКонтакте', 'Pinterest', 'Instagram', 'Дзен', 'TikTok', 'YouTube', 'Threads', 'Одноклассники'];
const PLATS = ['Литнет', 'Литмаркет', 'Литгород', 'Литрес', 'Author.Today', 'Bookmate'];

const lastLog = (x) => (x.log || []).map((l) => l.date).sort().pop() || '';
const openReq = (c, x) => c.data.w_waiting.filter((r) => !r.done && r.contactId === x.id);
const matches = (x, q) => !q || [x.name, x.net, x.handle, x.contact, x.note, ...(x.log || []).map((l) => l.text)].join(' ').toLowerCase().includes(q.toLowerCase());
const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : u ? 'https://' + u : '');

// ---------- список ----------
export function linksView(a) {
  const c = a.ctx(), q = a.ui.linkQ || '';
  const all = [...c.data.w_links].sort((x, y) => (x.name || '').localeCompare(y.name || '', 'ru'));
  const list = all.filter((x) => matches(x, q));
  const reqs = c.data.w_waiting.filter((r) => !r.done).sort((x, y) => (x.since || '').localeCompare(y.since || ''));
  const done = c.data.w_waiting.filter((r) => r.done).sort((x, y) => (y.answeredAt || '').localeCompare(x.answeredAt || ''));
  const groups = Object.keys(LKINDS).map((k) => [k, list.filter((x) => (x.kind || 'other') === k)]).filter(([, l]) => l.length);
  const html = `<div class="row between" style="margin-bottom:10px"><h2 style="margin:0">Связи</h2><button class="primary" data-act="link.new">+ Добавить</button></div>
  ${all.length > 5 ? `<input type="search" value="${esc(q)}" placeholder="Поиск: имя, ник, заметка…" data-chg="link.q" aria-label="Поиск по связям" style="margin-bottom:12px">` : ''}
  <div class="psec-h" style="margin-top:4px"><h2>Запросы без ответа <span class="muted">${reqs.length || ''}</span></h2><button class="small-btn" data-act="wait.new">+ Запрос</button></div>
  ${reqs.length ? `<div class="card plist-card"><div class="plist">${reqs.map((r) => reqRow(c, r)).join('')}</div></div>` : '<div class="card"><p class="small muted" style="margin:0">Открытых запросов нет. Отправили рукопись, заявку или письмо — добавьте запрос, и приложение напомнит, если ответа долго нет.</p></div>'}
  ${groups.length ? groups.map(([k, l]) => `<div class="psec-h"><h2>${LKINDS[k]} <span class="muted">${l.length}</span></h2><button class="small-btn" data-act="link.new" data-kind="${k}">+ ${KIND1[k]}</button></div>
    <div class="card list">${l.map((x) => linkRow(c, x)).join('')}</div>`).join('')
    : `<div class="card" style="margin-top:16px"><p class="small muted" style="margin-top:0">${q ? 'Ничего не нашлось.' : 'Соберите здесь всё, что вне книг: издательства, соцсети, площадки, нужных людей. У каждой связи — ссылки, ники, история общения и запросы.'}</p>
      ${q ? '' : `<div class="row">${Object.keys(LKINDS).filter((k) => k !== 'other').map((k) => `<button data-act="link.new" data-kind="${k}">+ ${KIND1[k]}</button>`).join('')}</div>`}</div>`}
  ${done.length ? `<details class="card" style="margin-top:16px"><summary>Ответы получены (${done.length})</summary>${done.map((r) => `<div class="item small"><b>${esc(r.who)}</b>${r.what ? ': ' + esc(r.what) : ''}${r.answer ? `<br>→ ${esc(r.answer)}` : ''}<span class="sub">${r.answeredAt ? fmtDate(r.answeredAt) : ''}</span></div>`).join('')}</details>` : ''}`;
  return { html };
}
function linkRow(c, x) {
  const n = openReq(c, x).length, last = lastLog(x);
  const sub = [x.kind === 'social' || x.kind === 'platform' ? x.net : '', x.handle, x.contact, last ? `последний раз ${fmtDate(last)}` : ''].filter(Boolean).map(esc).join(' · ');
  return `<a class="item row between" href="#" data-act="go" data-to="/link/${x.id}"><span><b>${esc(x.name)}</b>${sub ? `<span class="sub">${sub}</span>` : ''}</span>${n ? `<span class="badge warn">${n} ${plural(n, ['запрос', 'запроса', 'запросов'])}</span>` : ''}</a>`;
}
function reqRow(c, r) {
  const s = waitingStatus(r, c.today);
  return `<div class="pitem"><span class="dot k-waitans"${s.overdue ? '' : ' style="opacity:.45"'}></span><span class="pi-body"><span class="pi-t">${esc(r.who)}${r.what ? ' — ' + esc(r.what) : ''}</span>
    <span class="pi-s">${s.days ? `${s.days} ${plural(s.days, ['день', 'дня', 'дней'])} без ответа` : 'отправлено сегодня'}${s.overdue ? ' · пора напомнить о себе' : ` · напомню через ${Math.max(0, (Number(r.remindDays) || 14) - s.days)} дн.`}</span>
    <span class="row" style="gap:2px;margin-top:2px"><button class="link" data-act="wait.answer" data-id="${r.id}">Ответили</button><button class="link" data-act="wait.nudge" data-id="${r.id}">Напомнила</button><button class="link" data-act="wait.edit" data-id="${r.id}">Изменить</button></span></span></div>`;
}
changes['link.q'] = (v) => { app().ui.linkQ = v.trim(); app().rerender(); };

// ---------- страница связи ----------
export function linkPage(a, id) {
  const c = a.ctx(), x = c.data.w_links.find((l) => l.id === id);
  if (!x) return { html: '<div class="card"><p>Связь не найдена.</p><a href="#" data-act="go" data-to="/links">← Связи</a></div>' };
  const reqs = c.data.w_waiting.filter((r) => r.contactId === x.id);
  const open = reqs.filter((r) => !r.done), log = [...(x.log || [])].sort((p, q) => q.date.localeCompare(p.date));
  const url = safeUrl(x.url);
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/links">← Связи</a></p>
  <div class="card"><div class="row between"><h2 style="margin:0">${esc(x.name)}</h2><button class="small-btn" data-act="link.edit" data-id="${x.id}">Изменить</button></div>
    <div class="tags" style="margin-top:6px"><span class="tag on">${KIND1[x.kind || 'other']}</span>${x.net ? `<span class="tag">${esc(x.net)}</span>` : ''}</div>
    <div class="kv">${x.handle ? `<div><span>Ник / аккаунт</span><b>${esc(x.handle)}</b></div>` : ''}${x.contact ? `<div><span>Контакт</span><b>${esc(x.contact)}</b></div>` : ''}${lastLog(x) ? `<div><span>Последний раз</span><b>${fmtDate(lastLog(x))}</b></div>` : ''}</div>
    <div class="row">${url ? `<a class="btn primary" href="${esc(url)}" target="_blank" rel="noopener">Открыть ${x.kind === 'social' ? 'страницу' : 'сайт'}</a>` : ''}${x.handle ? `<button data-act="copy" data-text="${esc(x.handle)}">Скопировать ник</button>` : ''}${x.contact ? `<button data-act="copy" data-text="${esc(x.contact)}">Скопировать контакт</button>` : ''}</div>
    ${x.note ? `<p class="idea-text" style="margin-bottom:0">${esc(x.note)}</p>` : ''}</div>
  <div class="psec-h"><h2>Запросы <span class="muted">${open.length || ''}</span></h2><button class="small-btn" data-act="wait.new" data-contact="${x.id}">+ Запрос</button></div>
  ${open.length ? `<div class="card plist-card"><div class="plist">${open.map((r) => reqRow(c, r)).join('')}</div></div>` : '<div class="card"><p class="small muted" style="margin:0">Открытых запросов нет.</p></div>'}
  <div class="psec-h"><h2>История общения</h2></div>
  <div class="card">
    <form data-form="link.log" data-id="${x.id}" class="row" style="align-items:stretch"><input type="date" name="date" value="${c.today}" style="width:auto" aria-label="Дата"><input name="text" placeholder="Что было: письмо, звонок, пост, договорённость…" style="flex:1;min-width:160px" aria-label="Запись"><button class="primary" type="submit">Записать</button></form>
    ${log.length ? `<div class="list" style="margin-top:8px">${log.map((l) => `<div class="item row between"><span><span class="sub">${fmtDate(l.date)}</span>${esc(l.text)}</span><button class="icon-btn" data-act="link.logDel" data-id="${x.id}" data-k="${esc(l.k)}" aria-label="Удалить запись">${ic('trash')}</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:8px 0 0">Записей пока нет. Запросы и ответы попадают сюда сами.</p>'}
  </div>`;
  return { html };
}

// ---------- добавить / изменить ----------
function linkForm(x = {}) {
  const k = x.kind || 'publisher';
  return `<div class="f2"><div><label for="lk" style="margin-top:0">Что это</label><select id="lk" name="kind">${Object.keys(LKINDS).map((v) => opt(v, KIND1[v], k)).join('')}</select></div>
    <div><label for="ln" style="margin-top:0">Название / имя</label><input id="ln" name="name" value="${esc(x.name || '')}" required></div></div>
    <label for="lnet">Сеть или площадка (для соцсетей и площадок)</label><input id="lnet" name="net" list="lnets" value="${esc(x.net || '')}"><datalist id="lnets">${[...NETS, ...PLATS].map((v) => `<option value="${v}">`).join('')}</datalist>
    <div class="f2"><div><label for="lh">Ник / аккаунт</label><input id="lh" name="handle" value="${esc(x.handle || '')}" placeholder="@lana_freytag"></div>
    <div><label for="lc">Контакт</label><input id="lc" name="contact" value="${esc(x.contact || '')}" placeholder="почта, телефон, телеграм"></div></div>
    <label for="lu">Ссылка</label><input id="lu" name="url" value="${esc(x.url || '')}" placeholder="сайт, страница, профиль">
    <label for="lnote">Заметки</label><textarea id="lnote" name="note" placeholder="условия, кто отвечает, что важно помнить">${esc(x.note || '')}</textarea>`;
}
const linkFrom = (fd) => ({ kind: fd.get('kind'), name: fd.get('name').trim(), net: (fd.get('net') || '').trim(), handle: (fd.get('handle') || '').trim(), contact: (fd.get('contact') || '').trim(), url: (fd.get('url') || '').trim(), note: fd.get('note') || '' });
acts['link.new'] = (d) => openSheet('Новая связь', linkForm({ kind: d?.kind }), async (fd) => {
  const id = 'l' + uid(), v = linkFrom(fd);
  await app().store.put('w_links', { id, ...v, log: [], createdAt: new Date().toISOString() });
  // старые запросы с тем же именем — сразу привязываем к новой связи
  for (const r of app().ctx().data.w_waiting) if (!r.contactId && (r.who || '').trim().toLowerCase() === v.name.toLowerCase()) await app().store.put('w_waiting', { ...r, contactId: id });
  app().go('/link/' + id);
}, { submitText: 'Добавить' });
acts['link.edit'] = (d) => {
  const x = app().ctx().data.w_links.find((l) => l.id === d.id);
  openSheet('Связь', linkForm(x) + `<p><button type="button" class="link danger" data-act="link.del" data-id="${x.id}">Удалить связь</button></p>`, async (fd) => { await app().store.put('w_links', { ...x, ...linkFrom(fd) }); });
};
acts['link.del'] = async (d) => {
  if (!(await ask('Удалить связь вместе с историей общения? Запросы останутся.', 'Удалить'))) return;
  await app().store.remove('w_links', d.id);
  app().go('/links');
};
// запись в историю общения (используется и запросами)
export async function addLog(contactId, date, text) {
  const x = app().ctx().data.w_links.find((l) => l.id === contactId);
  if (!x || !text) return;
  await app().store.put('w_links', { ...x, log: [...(x.log || []), { k: uid(), date, text }] });
}
forms['link.log'] = async (fd, f) => {
  const text = (fd.get('text') || '').trim();
  if (!text) return;
  await addLog(f.dataset.id, fd.get('date') || app().ctx().today, text);
};
acts['link.logDel'] = async (d) => {
  const x = app().ctx().data.w_links.find((l) => l.id === d.id);
  await app().store.put('w_links', { ...x, log: (x.log || []).filter((l) => l.k !== d.k) });
};

// ---------- запросы (раньше «Жду ответа»): кому, о чём, когда напомнить ----------
function waitForm(c, x = {}) {
  return `<label for="wc" style="margin-top:0">Кому</label><select id="wc" name="contactId"><option value="">— вписать вручную —</option>${[...c.data.w_links].sort((p, q) => (p.name || '').localeCompare(q.name || '', 'ru')).map((l) => opt(l.id, l.name, x.contactId)).join('')}</select>
  <input name="who" value="${esc(x.contactId ? '' : x.who || '')}" placeholder="или впишите: редактор, конкурс, площадка…" aria-label="Кому" style="margin-top:6px">
  <label for="wq">Что отправила / о чём</label><textarea id="wq" name="what" placeholder="рукопись, заявка на конкурс, вопрос по договору…">${esc(x.what || '')}</textarea>
  <div class="f2"><div><label for="wsi">Отправила</label><input id="wsi" type="date" name="since" value="${x.since || c.today}" required></div><div><label for="wr">Напомнить через, дней</label><input id="wr" name="remindDays" inputmode="numeric" value="${x.remindDays ?? 14}"></div></div>`;
}
const waitFrom = (c, fd) => {
  const l = c.data.w_links.find((v) => v.id === fd.get('contactId'));
  return { contactId: l ? l.id : '', who: l ? l.name : (fd.get('who') || '').trim(), what: (fd.get('what') || '').trim(), since: fd.get('since'), remindDays: N(fd.get('remindDays')) || 14 };
};
acts['wait.new'] = (d) => {
  const c = app().ctx();
  openSheet('Новый запрос', waitForm(c, { contactId: d?.contact || '' }), async (fd) => {
    const v = waitFrom(c, fd);
    if (!v.who) { toast('Выберите, кому, или впишите'); return false; }
    await app().store.put('w_waiting', { id: 'a' + uid(), ...v, done: false });
    if (v.contactId) await addLog(v.contactId, v.since, `Отправила${v.what ? ': ' + v.what : ''}`);
  }, { submitText: 'Добавить' });
};
acts['wait.edit'] = (d) => {
  const c = app().ctx(), x = c.data.w_waiting.find((i) => i.id === d.id);
  openSheet('Запрос', waitForm(c, x) + `<p><button type="button" class="link danger" data-act="wait.del" data-id="${x.id}">Удалить запрос</button></p>`, async (fd) => {
    const v = waitFrom(c, fd);
    if (!v.who) { toast('Выберите, кому, или впишите'); return false; }
    await app().store.put('w_waiting', { ...x, ...v });
  });
};
acts['wait.del'] = async (d) => { if (await ask('Удалить запрос?', 'Удалить')) await app().store.remove('w_waiting', d.id); };
acts['wait.nudge'] = async (d) => {
  const c = app().ctx(), x = c.data.w_waiting.find((i) => i.id === d.id);
  await app().store.put('w_waiting', { ...x, since: c.today });
  if (x.contactId) await addLog(x.contactId, c.today, `Напомнила о себе${x.what ? ': ' + x.what : ''}`);
  toast('Отметила — снова отсчитываю дни');
};
acts['wait.answer'] = (d) => {
  const c = app().ctx(), x = c.data.w_waiting.find((i) => i.id === d.id);
  openSheet('Ответили', `<label for="wa" style="margin-top:0">Что ответили (необязательно)</label><textarea id="wa" name="answer"></textarea>`, async (fd) => {
    const answer = (fd.get('answer') || '').trim();
    await app().store.put('w_waiting', { ...x, done: true, answer, answeredAt: c.today });
    if (x.contactId) await addLog(x.contactId, c.today, `Ответили${x.what ? ' (' + x.what + ')' : ''}${answer ? ': ' + answer : ''}`);
  }, { submitText: 'Сохранить' });
};
