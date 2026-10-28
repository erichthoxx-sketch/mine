// «Мой сайт» (Связи → Мой сайт): ссылки, цифры, что сделать на сайте (находится само) и свои дела по сайту.
// Свои дела живут в записи w_links «mysite» — поэтому сами попадают в Планер, на Главную и в Todoist (Мастерская → Сайт).
import { ic } from '../../../js/icons.js';
import { esc, acts, forms, toast } from '../../../js/ui.js';
import { fmtDate, plural } from '../../../js/format.js';
import { loadSite, loadSubs, SITE_URL, SITE_ADMIN } from '../../../js/sitepub.js';
import { siteChecks, SITE_LINK } from '../sitecheck.js';
import { addLinkedTask } from './links.js';

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
export function siteHubRow(c) {
  const n = st.site ? siteChecks({ wbooks: c.wbooks, site: st.site, subs: st.subs, seenAt: c.settings?.site?.seenSubs }).filter((x) => !x.soft).length : 0;
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
  const checks = st.site ? siteChecks({ wbooks: c.wbooks, site: st.site, subs: st.subs, seenAt: c.settings.site?.seenSubs }) : [];
  const shown = st.site ? st.site.books.filter((b) => !b.hidden).length : null;
  const fresh = checks.find((x) => x.k === 'subs')?.subs || 0;
  const html = `<section class="links-page">
  <div class="row between links-title" style="margin-bottom:10px"><h2 style="margin:0">Мой сайт</h2>
    <button class="icon-btn" data-act="site.reload" title="Обновить" aria-label="Обновить">${ic('refresh')}</button></div>
  <div class="card">
    <div class="row" style="gap:16px;flex-wrap:wrap"><a href="${SITE_URL}" target="_blank" rel="noopener"><b>lanafreitag.ru</b></a><a href="${SITE_ADMIN}" target="_blank" rel="noopener">Админка сайта</a><a href="../direct/#/an/site" target="_blank" rel="noopener">Статистика</a></div>
    <div class="tiles">
      <div><div class="k">Книг на сайте</div><div class="v">${shown == null ? '—' : shown}</div><div class="s">${st.site ? `из ${c.wbooks.filter((b) => b.status !== 'idea').length} в Мастерской` : st.busy ? 'загружаю…' : 'нет связи с сайтом'}</div></div>
      <div><div class="k">Подписчики</div><div class="v">${st.subs ? st.subs.length : '—'}</div><div class="s">${st.subs ? (fresh ? `новых ${fresh}` : 'новых нет') : 'видны после входа'}</div></div>
    </div>
    <p class="small muted" style="margin:6px 0 0">Посетители, нажатия «Читать» и откуда пришли — в «Директе» → Аналитика → Сайт.</p>
  </div>

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

forms['site.todo'] = async (fd) => {
  const text = String(fd.get('text') || '').trim(), date = String(fd.get('date') || '');
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('Укажите дело и дату'); return false; }
  try {
    if (!app().ctx().data.w_links.some((l) => l.id === SITE_LINK)) await app().store.put('w_links', { id: SITE_LINK, kind: 'site', name: 'Мой сайт', url: SITE_URL, todos: [], log: [] });
    await addLinkedTask(SITE_LINK, { date, text, section: 'Сайт' });
    toast('Дело добавлено в Планер' + (app().ctx().settings.todoistToken ? ' · Todoist синхронизируется' : ''));
  } catch (e) { toast('Не получилось сохранить: ' + e.message); return false; }
};
acts['site.reload'] = () => { load(true); return false; };
acts['site.seen'] = async () => { const s = app().ctx().settings; await app().store.saveSettings({ site: { ...(s.site || {}), seenSubs: new Date().toISOString() } }); };
