// «Мой сайт» (Связи → Мой сайт): ссылки, цифры, что сделать на сайте (находится само) и свои дела по сайту.
// Свои дела живут в записи w_links «mysite» — поэтому сами попадают в Планер, на Главную и в Todoist (Мастерская → Сайт).
import { ic } from '../../../js/icons.js';
import { esc, acts, forms, changes, toast, openSheet } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import { loadSite, loadSubs, patchSiteBook, sameTitle, SITE_URL, SITE_ADMIN } from '../../../js/sitepub.js';
import { fragText, fragChars, fitFree, LITNET_FREE_MAX } from '../sitefrag.js';
import { siteChecks, SITE_LINK, domainInfo } from '../sitecheck.js';
import { addDays } from '../../../js/calc.js';
import { addLinkedTask } from './links.js';
import { siteTabs, mailCount } from './mail.js';
import { litTagCard } from './littag.js';

const app = () => window.__app;
const st = { site: undefined, subs: null, busy: false, err: '' };

// Сайт и подписчики загружаются при открытии (и по «Обновить»); без интернета — просто без сверки
async function load(force) {
  if (typeof window === 'undefined' || !window.__app || st.busy || (st.site !== undefined && !force)) return;
  st.busy = true; st.err = '';
  try { st.site = await loadSite(); } catch (e) { st.site = null; st.err = e.message; }
  try {
    const u = app().store.auth?.currentUser;
    st.subs = u ? await loadSubs(await u.getIdToken()) : null;
  } catch { st.subs = null; }
  st.busy = false;
  app().rerender();
}
// Сайт для Планера (розыгрыш по пятницам): загружается сам при первом обращении
export function siteNow() { load(); return st.site || null; }
// то же, но различает «ещё загружается» (undefined) и «не загрузился» (null)
export function siteState() { load(); return st.site; }
export function siteHubRow(c) {
  const n = st.site ? siteChecks({ wbooks: c.wbooks, site: st.site, subs: st.subs, seenAt: c.settings?.site?.seenSubs, today: c.today }).filter((x) => !x.soft).length : 0;
  const open = (c.data.w_links.find((l) => l.id === SITE_LINK)?.todos || []).filter((t) => !t.done).length;
  load();
  const sub = ['lanafreitag.ru', open ? `${open} ${plural(open, ['дело', 'дела', 'дел'])}` : ''].filter(Boolean).join(' · ');
  return `<a class="item row between" href="#" data-act="go" data-to="/mysite"><span><b>Мой сайт</b><span class="sub">${esc(sub)}</span></span>${n ? `<span class="badge warn">сделать: ${n}</span>` : ''}</a>`;
}

export function mySiteView(a) {
  const c = a.ctx();
  load();
  const rec = c.data.w_links.find((l) => l.id === SITE_LINK);
  const todos = [...(rec?.todos || [])].sort((x, y) => (x.done - y.done) || (x.date || '').localeCompare(y.date || ''));
  const checks = st.site ? siteChecks({ wbooks: c.wbooks, site: st.site, subs: st.subs, seenAt: c.settings.site?.seenSubs, today: c.today }) : [];
  const shown = st.site ? st.site.books.filter((b) => !b.hidden).length : null;
  const fresh = checks.find((x) => x.k === 'subs')?.subs || 0;
  const dm = domainInfo(c.settings, c.today);
  const mc = mailCount();
  const html = `<section class="links-page">
  ${siteTabs('site')}
  <div class="site-go">
    <a href="${SITE_URL}" target="_blank" rel="noopener">${ic('bear')}<span><b>lanafreitag.ru</b></span></a>
    <a href="${SITE_ADMIN}" target="_blank" rel="noopener">${ic('pen')}<span><b>Админка</b></span></a>
    <a href="../direct/#/an/site" target="_blank" rel="noopener">${ic('ads')}<span><b>Статистика</b></span></a>
  </div>
  ${litTagCard(c)}
  <div class="card">
    <div class="tiles">
      <div><div class="k">Книг на сайте</div><div class="v">${shown == null ? '—' : shown}</div><div class="s">${st.site ? `из ${c.wbooks.filter((b) => b.status !== 'idea').length} в Мастерской` : st.busy ? 'загружаю…' : 'нет связи с сайтом'}</div></div>
      ${mc ? `<div class="tile-go" role="link" tabindex="0" data-act="go" data-to="/site/mail" title="Открыть Почту"><div class="k">Подписчицы</div><div class="v">${mc.ok}</div><div class="s">${mc.new30 ? `+${mc.new30} за 30 дней` : 'новых за 30 дней нет'}</div></div>`
        : `<div><div class="k">Подписчики</div><div class="v">${st.subs ? st.subs.length : '—'}</div><div class="s">${st.subs ? (fresh ? `новых ${fresh}` : 'новых нет') : 'видны после входа'}</div></div>`}
    </div>
    <div class="row between" style="gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)">
      <span><b>Домен ${esc(dm.name)}</b><span class="sub">${dm.late ? 'срок оплаты прошёл — продлите в Рег.ру' : `оплачен до ${fmtDate(dm.till)}`} · напомню за 2 месяца</span></span>
      <span class="row" style="gap:10px;flex-shrink:0">${dm.soon ? `<button class="small-btn" data-act="site.renewed">Продлила на год</button>` : ''}<button class="link" data-act="site.domain">Изменить дату</button></span></div>
  </div>

  ${booksOnSite(c)}
  <div class="psec-h"><h2>Сделать на сайте${checks.length ? ` <span class="muted">${checks.length}</span>` : ''}</h2></div>
  <div class="card list">${checks.length ? checks.map((x) => `<div class="item row between"><span><b${x.soft ? ' class="muted"' : ''}>${esc(x.title)}</b><span class="sub">${esc(x.why)}</span></span>
      <span class="row" style="gap:6px;flex-shrink:0">${x.subs ? `<button class="link" data-act="site.seen">Посмотрела</button>` : ''}${x.admin || x.subs ? `<a class="small-btn" href="${SITE_ADMIN}" target="_blank" rel="noopener">В админку</a>` : ''}</span></div>`).join('')
    : `<p class="small muted" style="margin:0">${st.site ? 'Всё сходится: книги Мастерской есть на сайте, подарок на месте.' : st.busy ? 'Сверяю с сайтом…' : 'Не получилось открыть сайт — проверьте интернет и нажмите «Обновить».'}</p>`}</div>

  <div class="psec-h"><h2>Дела по сайту${todos.filter((t) => !t.done).length ? ` <span class="muted">${todos.filter((t) => !t.done).length}</span>` : ''}</h2></div>
  <div class="card target-work-card">
    <form data-form="site.todo" class="target-quickform">
      <div class="target-quick-input"><input type="text" name="text" required maxlength="500" placeholder="Обновить обложку, добавить отзыв, новый отрывок…" aria-label="Дело по сайту">
        <input type="date" name="date" value="${c.today}" required aria-label="Когда" style="max-width:160px">
        <button class="primary" type="submit">Добавить</button></div>
    </form>
    ${todos.length ? `<div class="target-timeline">${todos.map((e) => `<div class="target-entry ${e.done ? 'target-entry-done' : ''}">
      <div class="target-entry-main"><span class="target-entry-date">${fmtDate(e.date)}</span><span class="target-entry-type">${e.done ? 'сделано' : 'дело'}</span>
        <div class="target-entry-text tap" data-act="target.edit" data-id="${SITE_LINK}" data-k="${esc(e.k)}" data-t="task" title="Изменить">${esc(e.text)}${e.detail ? `<p class="target-entry-detail">${esc(e.detail)}</p>` : ''}</div></div>
      <div class="target-entry-actions">${!e.done ? `<button class="link" data-act="link.todoDone" data-id="${SITE_LINK}" data-k="${esc(e.k)}">Готово</button>` : ''}
        <button class="icon-btn" data-act="link.todoDel" data-id="${SITE_LINK}" data-k="${esc(e.k)}" title="Удалить дело" aria-label="Удалить дело">${ic('trash')}</button></div></div>`).join('')}</div>`
      : '<p class="small muted target-empty">Своих дел пока нет. Запишите, что хотите поменять на сайте, — дело появится в Планере в нужный день.</p>'}
    <p class="small muted" style="margin:8px 0 0">Дела видны в Планере и в Todoist: Мастерская → Сайт.</p>
  </div></section>`;
  return { html };
}

// Книги на сайте ← Мастерская: аннотация (вкладка «Аннотация»), крючок (Легенда → «О чём книга — одной фразой»),
// ознакомительный фрагмент — из рукописи для издательства, до главы, которая бесплатна на Литнете
const nf = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
const annOf = (b) => String(b.svc?.annotation || b.promo?.annotation || '').trim();
const hookOf = (b) => String(b.legend?.idea?.logline || '').trim();
function booksOnSite(c) {
  if (!st.site) return '';
  const pairs = c.wbooks.filter((b) => b.status !== 'idea' && !b.archived).map((b) => [b, st.site.books.find((x) => sameTitle(x.title, b.title))]).filter(([, s]) => s);
  if (!pairs.length) return '';
  const what = (s) => [s.ann ? 'аннотация' : '', s.tagline ? 'крючок' : '', s.frag ? `фрагмент ${nf(s.frag)} зн.` : ''].filter(Boolean).join(' · ') || 'тексты пока не заполнены';
  const fragNow = (b, s) => (s.frag ? `до «${b.siteFragUpto || '…'}», ${nf(s.frag)} зн.` : 'нет');
  return `<div class="psec-h"><h2>Книги на сайте</h2></div>
  <div class="card list">${pairs.map(([b, s]) => `<div class="item site-bk"><div><b>${esc(b.title)}</b>
      <span class="sub">${esc([s.ann ? 'аннотация' : '', s.tagline ? 'крючок' : ''].filter(Boolean).join(' · ') || 'аннотации и крючка пока нет')} · фрагмент: ${esc(fragNow(b, s))}</span></div>
    <div class="site-bk-acts"><button class="small-btn" data-act="site.frag" data-id="${esc(b.id)}">Бесплатный фрагмент</button>
      <button class="small-btn" data-act="site.push" data-id="${esc(b.id)}">Аннотация и крючок</button></div></div>`).join('')}
    <p class="small muted" style="margin:8px 0 0">Аннотация — из вкладки «Аннотация» Документа, крючок — из Легенды («О чём книга — одной фразой»), фрагмент — главы из Документа.</p></div>`;
}

// Бесплатный фрагмент для сайта — простой выбор: нажать на последнюю главу, всё до неё уйдёт на сайт
async function bookChapters(b) {
  const [drive, { chaptersOf }] = await Promise.all([import('../drive.js'), import('../publish.js')]);
  if (!b.fileId || b.mimeType !== drive.MIME.doc) throw new Error('Книга не из Google Документа — главы не прочитать');
  try { toast('Открываю Документ…'); await drive.ensureToken(); return chaptersOf(await drive.getDoc(b.fileId)); }
  catch (e) { throw new Error(e instanceof drive.NeedAuth ? e.message : 'Не получилось открыть Документ'); }
}
const fragSum = (chs, i) => {
  const n = fragChars(chs, i);
  return i < 0 ? 'Ничего не выбрано' : `${i + 1} ${plural(i + 1, ['глава', 'главы', 'глав'])} · ${nf(n)} знаков${n > LITNET_FREE_MAX ? ' — больше 200 000, по правилам Литнета столько бесплатно выкладывать нельзя' : ''}`;
};
acts['site.frag'] = async (d) => {
  const b = app().ctx().wbooksById[d.id];
  if (!b) return false;
  let chs;
  try { chs = await bookChapters(b); } catch (e) { toast(e.message); return false; }
  if (!chs.length) { toast('В Документе нет глав'); return false; }
  fragSheet(b, chs);
  return false;
};
export function fragSheet(b, chs) {
  const was = chs.findIndex((x) => x.title === b.siteFragUpto);
  const sel = was >= 0 ? was : Math.min(fitFree(chs), 2);
  push = { b, chs };
  const onSite = st.site?.books.find((x) => sameTitle(x.title, b.title))?.frag;
  openSheet('Бесплатный фрагмент на сайте', `<p class="small muted" style="margin-top:0">«${esc(b.title)}». Нажмите на последнюю главу, которую можно прочитать на сайте бесплатно: все главы до неё уйдут на сайт. Берите не больше, чем открыто бесплатно на Литнете.</p>
    <div class="frag-list">${chs.map((x, i) => `<label class="frag-row${i <= sel ? ' on' : ''}"><input type="radio" name="upto" value="${i}"${i === sel ? ' checked' : ''} data-chg="site.fragpick">
      <span class="frag-ok">${ic('check')}</span><span class="frag-t">${esc(String(x.title || '').split('\n')[0])}</span><span class="frag-n">${nf(x.chars || 0)} зн.</span></label>`).join('')}</div>
    <p class="frag-sum" id="frag-sum">${fragSum(chs, sel)}</p>
    ${onSite ? '<button type="button" class="link small" data-act="site.fragoff" data-id="' + esc(b.id) + '">Убрать фрагмент с сайта</button>' : ''}`,
  async (fd) => {
    const i = Number(fd.get('upto'));
    if (!(i >= 0)) { toast('Выберите главу'); return false; }
    if (fragChars(chs, i) > LITNET_FREE_MAX) { toast('Больше 200 000 знаков — по правилам Литнета столько бесплатно выкладывать нельзя'); return false; }
    try {
      const u = app().store.auth?.currentUser;
      await patchSiteBook(b.title, { frag: fragText(chs, i) }, u ? await u.getIdToken() : '');
      await app().store.patch('w_books', b.id, { siteFragUpto: chs[i].title });
      toast(`Фрагмент на сайте: ${String(chs[0].title).split('\n')[0]} — ${String(chs[i].title).split('\n')[0]}`);
      load(true);
    } catch (e) { toast(e.message); return false; }
  }, { submitText: 'Поставить на сайт' });
}
changes['site.fragpick'] = (v) => {
  const i = Number(v);
  document.querySelectorAll('.frag-row').forEach((el, k) => el.classList.toggle('on', k <= i));
  const el = document.getElementById('frag-sum'); if (el && push) el.textContent = fragSum(push.chs, i);
  return false;
};
acts['site.fragoff'] = async (d) => {
  const b = app().ctx().wbooksById[d.id];
  if (!b) return false;
  try {
    const u = app().store.auth?.currentUser;
    await patchSiteBook(b.title, { frag: '' }, u ? await u.getIdToken() : '');
    await app().store.patch('w_books', b.id, { siteFragUpto: '' });
    document.getElementById('sheet')?.close();
    toast('Фрагмент убран с сайта'); load(true);
  } catch (e) { toast(e.message); }
  return false;
};
let push = null; // книга и её главы, пока открыто окно
acts['site.push'] = async (d) => {
  const b = app().ctx().wbooksById[d.id];
  if (!b) return false;
  const ann = annOf(b), hook = hookOf(b);
  if (!ann && !hook) { toast('Нет ни аннотации (вкладка «Аннотация» в Документе), ни крючка (Легенда → «О чём книга — одной фразой»)'); return false; }
  const row = (k, on, label, sub) => `<label class="row" style="gap:10px;align-items:flex-start;margin:0 0 14px"><input type="checkbox" name="${k}"${on ? ' checked' : ''}${on ? '' : ' disabled'} style="margin-top:3px"><span><b>${label}</b><span class="sub" style="display:block">${sub}</span></span></label>`;
  openSheet('Аннотация и крючок на сайте', `<p class="small muted" style="margin-top:0">«${esc(b.title)}» — отметьте, что заменить на сайте.</p>
    ${row('ann', !!ann, 'Аннотация', ann ? esc(ann.slice(0, 140)) + (ann.length > 140 ? '…' : '') : 'в Документе нет вкладки «Аннотация»')}
    ${row('hook', !!hook, 'Крючок', hook ? esc(hook) : 'в Легенде пусто поле «О чём книга — одной фразой»')}`,
  async (fd) => {
    const patch = {};
    if (fd.get('ann') && ann) patch.ann = ann;
    if (fd.get('hook') && hook) patch.tagline = hook;
    if (!Object.keys(patch).length) { toast('Ничего не отмечено'); return false; }
    try {
      const u = app().store.auth?.currentUser;
      await patchSiteBook(b.title, patch, u ? await u.getIdToken() : '');
      toast('Обновлено на сайте: ' + [patch.ann && 'аннотация', patch.tagline && 'крючок'].filter(Boolean).join(', '));
      load(true);
    } catch (e) { toast(e.message); return false; }
  }, { submitText: 'Обновить на сайте' });
  return false;
};

forms['site.todo'] = async (fd) => {
  const text = String(fd.get('text') || '').trim(), date = String(fd.get('date') || '');
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Укажите дело и дату'); return false; }
  try {
    if (!app().ctx().data.w_links.some((l) => l.id === SITE_LINK)) await app().store.put('w_links', { id: SITE_LINK, kind: 'site', name: 'Мой сайт', url: SITE_URL, todos: [], log: [] });
    await addLinkedTask(SITE_LINK, { date, text, section: 'Сайт' });
    toast('Дело добавлено в Планер' + (app().ctx().settings.todoistToken ? ' · Todoist синхронизируется' : ''));
  } catch (e) { toast('Не получилось сохранить: ' + e.message); return false; }
};
const saveTill = async (till) => { const s = app().ctx().settings; await app().store.saveSettings({ site: { ...(s.site || {}), domainTill: till } }); };
acts['site.renewed'] = async () => {
  const c = app().ctx(), was = domainInfo(c.settings, c.today).till;
  await saveTill(addDays(was, 365) < c.today ? addDays(c.today, 365) : addDays(was, 365));
  toast('Домен продлён — следующее напоминание за 2 месяца до конца оплаты', { undo: () => saveTill(was) });
};
acts['site.domain'] = () => {
  const c = app().ctx(), dm = domainInfo(c.settings, c.today);
  openSheet('Домен ' + dm.name, `<label for="dmtill" style="margin-top:0">Оплачен до</label><input id="dmtill" type="date" name="till" value="${dm.till}" required>
    <p class="small muted">Дата есть в Рег.ру → «Домены и услуги». Напоминание «Продлить домен» появится в Планере и Todoist за 2 месяца.</p>`,
  async (fd) => { const v = String(fd.get('till') || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast('Укажите дату'); return false; } await saveTill(v); });
  return false;
};
acts['site.reload'] = () => { load(true); return false; };
acts['site.seen'] = async () => { const s = app().ctx().settings; await app().store.saveSettings({ site: { ...(s.site || {}), seenSubs: new Date().toISOString() } }); };
