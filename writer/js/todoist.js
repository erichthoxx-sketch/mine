import { isDone, bookGuess } from './ideacalc.js';
// Todoist: планер Мастерской сам раскладывает дела по полочкам Todoist с нужными датами.
// Книжное — в проект «Книги», раздел по книге (как у Ланы уже заведено); остальное — в проект «Мастерская»
// по разделам (деньги и реклама, связи, маркетинг, конкурсы, дела). Все задачи с меткой «мастерская».
// Сделала в приложении — задача в Todoist закрывается; закрыла в Todoist — больше не создаём заново
// (а дела из очереди и по связям отмечаются сделанными и в приложении).
const API = 'https://api.todoist.com/api/v1';
export const TD_LABEL = 'мастерская';
export const IDEA_LABEL = 'идея';
export const MONEY_LABEL = 'доходы';
// метки, которые приложение заводит в Todoist само — чтобы их можно было быстро выбрать
export const LABELS = [['мастерская', 'lavender'], ['книги', 'salmon'], [IDEA_LABEL, 'mint_green'], [MONEY_LABEL, 'green']];
export const TD_DAYS = 30; // на сколько дней вперёд отправляем
const KIND_SHELF = { money: 'Деньги и реклама', waitans: 'Связи', mk: 'Маркетинг', blog: 'Маркетинг', contest: 'Конкурсы' };
const SKIP = new Set(['done', 'wait', 'td', 'utm-expiry', 'weekend', 'event']); // weekend — старые общие обзоры: никогда не создавать // выложено / выйдет само — делать ничего не нужно; td — задачи из самого Todoist

// ключ — короткий и безопасный для базы (Firestore): вид + хеш
const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h.toString(36); };
const unesc = (s) => String(s ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const bookOf = (x) => x.book || x.bookId || /^\/(?:book|mk)\/(.+)$/.exec(x.to || '')?.[1] || null;
// короткое имя книги для раздела: до точки («Альпийский развод. Он оставил…» → «Альпийский развод»)
export const shortTitle = (t) => String(t || '').split(/[.!?:]/)[0].trim() || String(t || '');

// пункты планера → задачи Todoist {key, content, description, date, project, section, item}
export function todoistTasks(items, booksById) {
  const out = [], seen = new Set();
  for (const x of items) {
    if (SKIP.has(x.kind)) continue;
    const title = unesc(String(x.title).replace(/<[^>]+>/g, '')).replace(/^[⏱✓]?\s*/, ''), bid = bookOf(x), b = bid ? booksById[bid] : null;
    const key = `${x.kind}_` + hash(x.kind === 'pub' ? `${x.book}:${x.date}` : x.kind === 'utm' ? `${x.id}:${x.expires}` : x.todoK ? `${x.linkId}:${x.todoK}` : `${x.id || ''}:${title}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, content: title, description: unesc(x.description || x.sub || ''), date: x.dueRaw || x.date, project: b ? 'Книги' : 'Мастерская', section: b ? shortTitle(b.title) : x.section || KIND_SHELF[x.kind] || 'Дела', item: x });
  }
  return out;
}

// что сделать: map — {key: {id, date, content}} (что мы уже создали), closed — {key: дата} (закрыто в Todoist),
// active — открытые задачи с нашей меткой [{id, content, due:{date}}]
// made — id задач, которые создало само приложение: только их можно закрывать как устаревшие.
// Задачу, которую Лана сама пометила «мастерская», приложение не трогает — она её собственная.
export function todoistPlan(want, map = {}, closed = {}, active = [], made = null) {
  const byId = new Map(active.map((t) => [String(t.id), t]));
  const ops = { create: [], update: [], close: [], verify: [], unclose: [] };
  const wantKeys = new Set(want.map((w) => w.key));
  const taken = new Set(Object.values(map).map((m) => String(m.id)));
  const same = (t, w) => t.content === w.content && (t.due?.date || '').slice(0, 10) === w.date;
  for (const w of want) {
    const m = map[w.key];
    if (m) {
      const t = byId.get(String(m.id));
      if (!t) { ops.verify.push({ id: m.id, w }); continue; } // нет в списке — проверим отдельно: закрыта ли на самом деле
      if (t.content !== w.content || (t.due?.date || '').slice(0, 10) !== w.date || (t.description || '') !== w.description) ops.update.push({ id: m.id, w });
      continue;
    }
    // такая задача уже есть в Todoist (создало другое устройство или потерялась связь) — берём её, а не дублируем
    const twin = active.find((t) => !taken.has(String(t.id)) && same(t, w) && (!made || made[String(t.id)] || (t.description || '') === (w.description || '')));
    if (twin) { taken.add(String(twin.id)); ops.update.push({ id: twin.id, w, adopt: true }); if (closed[w.key]) ops.unclose.push(w.key); continue; }
    if (closed[w.key]) continue; // закрыла в Todoist — заново не создаём
    ops.create.push(w);
  }
  // в планере этого больше нет (сделано или выложено в приложении) — закрываем в Todoist
  for (const [key, m] of Object.entries(map)) if (!wantKeys.has(key) && byId.has(String(m.id))) ops.close.push({ key, id: m.id });
  // наши задачи (с меткой), которые ни к чему в планере не относятся — устарели, закрываем
  const ours = (id) => !made || made[String(id)] || Object.values(map).some((m) => String(m.id) === String(id));
  for (const t of active) if (!taken.has(String(t.id)) && ours(t.id)) ops.close.push({ key: null, id: t.id });
  return ops;
}

// ---------- метки → полки: задача с меткой (например, во «Входящих») сама переезжает на нужную полку ----------
// «мастерская» → проект «Мастерская» (деньги и реклама — в «Деньги и реклама», остальное — в «Дела»);
// «доходы» → «Мастерская», «Деньги и реклама»; «идея» → проект «Книги» (к идеям);
// «книги» или метка с названием книги → «Книги», раздел книги.
// Трогаем только задачи вне своей полки и не созданные самим приложением.
export const MONEY_RE = /деньг|реклам|таргет|директ|налог|доход|бюджет|продаж|финанс|литнет плат|rocket|ракет/i;
const lowName = (x) => String(x || '').trim().toLowerCase();
const labelKey = (x) => lowName(x).replace(/[_\s]+/g, ' ');
export function routeTasks(tasks, { projects = {}, books = [], made = {} } = {}) {
  const moves = [], book = (t) => {
    const labels = (t.labels || []).map(labelKey), text = lowName(t.content);
    return books.find((b) => { const n = labelKey(shortTitle(b.title)); return n.length >= 3 && (labels.includes(n) || text.includes(n)); }) || null;
  };
  for (const t of tasks) {
    if (t.parent_id || made[String(t.id)]) continue;
    const labels = (t.labels || []).map(labelKey), pid = String(t.project_id || '');
    const inBooks = pid === String(projects['книги'] || '-'), inWork = pid === String(projects['мастерская'] || '-');
    const b = book(t);
    if (labels.includes(IDEA_LABEL)) { if (!inBooks) moves.push({ id: t.id, project: 'Книги', section: b ? shortTitle(b.title) : '' }); continue; }
    if (labels.includes('книги') || (b && labels.includes(labelKey(shortTitle(b.title))))) {
      if (!inBooks || (b && !t.section_id)) moves.push({ id: t.id, project: 'Книги', section: b ? shortTitle(b.title) : '' });
      continue;
    }
    // «доходы» — дела по деньгам и рекламе: видны и в «Доходах»
    if (labels.includes(MONEY_LABEL)) { if (!inWork) moves.push({ id: t.id, project: 'Мастерская', section: 'Деньги и реклама' }); continue; }
    if (labels.includes(TD_LABEL) && !inWork && !inBooks) moves.push({ id: t.id, project: 'Мастерская', section: MONEY_RE.test(t.content + ' ' + (t.description || '')) ? 'Деньги и реклама' : 'Дела' });
  }
  return moves;
}

async function tfetch(token, path, opts = {}) {
  let r;
  // телефон уснул посреди запроса — не ждём вечно (иначе синхронизация встанет до перезапуска)
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac && setTimeout(() => ac.abort(), 25000);
  try { r = await fetch(API + path, { ...opts, ...(ac ? { signal: ac.signal } : {}), headers: { Authorization: 'Bearer ' + token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } }); } catch { throw new Error('нет связи с Todoist'); } finally { if (tm) clearTimeout(tm); }
  if (r.status === 401 || r.status === 403) throw new Error('ключ Todoist не подходит — проверьте его в настройках');
  if (!r.ok) throw new Error('Todoist ответил ошибкой ' + r.status);
  return r.status === 204 ? null : r.json().catch(() => null);
}
async function all(token, path) {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const sep = path.includes('?') ? '&' : '?';
    const j = await tfetch(token, path + (cursor ? `${sep}cursor=${encodeURIComponent(cursor)}` : ''));
    out.push(...(j?.results || []));
    cursor = j?.next_cursor;
    if (!cursor) break;
  }
  return out;
}
const post = (token, path, body) => tfetch(token, path, { method: 'POST', body: JSON.stringify(body || {}) });

// проекты и разделы находим по названию, нет — создаём
async function shelves(token, want) {
  const projects = await all(token, '/projects');
  const proj = {}, sec = {};
  for (const name of new Set(want.map((w) => w.project))) {
    let p = projects.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    if (!p) p = await post(token, '/projects', { name, color: name === 'Мастерская' ? 'lavender' : undefined });
    proj[name] = p.id;
    const list = await all(token, `/sections?project_id=${p.id}`);
    for (const sname of new Set(want.filter((w) => w.project === name).map((w) => w.section))) {
      const low = sname.toLowerCase();
      let s = list.find((x) => x.name.trim().toLowerCase() === low) || list.find((x) => { const n = x.name.trim().toLowerCase(); return n.length >= 4 && (low.startsWith(n) || n.startsWith(low)); });
      if (!s) { s = await post(token, '/sections', { name: sname, project_id: p.id }); list.push(s); }
      sec[name + '\u0000' + sname] = s.id;
    }
  }
  return { proj, sec };
}

// Задачи, которые Лана сама ведёт в Todoist в проектах «Книги» и «Мастерская» (без нашей метки) —
// показываем в приложении: в планере в свой день, на странице книги (раздел = книга), деньги — и в «Доходах»
export async function fetchOwnTasks(token, made = {}) {
  const projects = await all(token, '/projects'), pn = Object.fromEntries(projects.map((p) => [String(p.id), String(p.name).trim()]));
  const shelf = (name) => /^(книги|мастерская)$/i.test(name || '');
  // разделы всех проектов разом; не вышло — по нашим двум проектам
  let secs;
  try { secs = await all(token, '/sections'); } catch { secs = []; for (const p of projects.filter((x) => shelf(x.name))) secs.push(...await all(token, `/sections?project_id=${p.id}`)); }
  const sn = Object.fromEntries(secs.map((x) => [String(x.id), x.name])), out = [];
  for (const t of await all(token, '/tasks')) {
    const labels = t.labels || [], p = pn[String(t.project_id)] || '', money = labels.includes(MONEY_LABEL), mark = labels.includes(TD_LABEL) || money || labels.includes('книги');
    // служебные задачи приложения и идеи — не «свои»; но если Лана сама поставила метку «мастерская» — это её задача,
    // где бы она ни лежала (например, во «Входящих», пока не переехала на полку)
    if (t.parent_id || labels.includes(IDEA_LABEL) || (mark && made[String(t.id)]) || (!shelf(p) && !mark)) continue;
    out.push({ id: String(t.id), t: t.content, d: (t.due?.date || '').slice(0, 10), p: shelf(p) ? p : labels.includes('книги') && !money ? 'Книги' : 'Мастерская', s: sn[String(t.section_id)] || (shelf(p) ? '' : money || MONEY_RE.test(t.content) ? 'Деньги и реклама' : labels.includes('книги') ? '' : 'Дела'), pr: t.priority || 1, ds: t.description || '', ...(t.due?.is_recurring ? { r: true } : {}) });
  }
  return out.slice(0, 300);
}
export const closeTask = (token, id) => post(token, `/tasks/${id}/close`);
// перенести дело на другую дату (несделанное — на сегодня)
export const moveDue = (token, id, date) => post(token, `/tasks/${id}`, { due_date: date });
// что отмечено сделанным за день (по времени отметки) — для истории прошедшего дня в Планере
export async function fetchDone(token, day) {
  const from = new Date(day + 'T00:00:00'), since = from.toISOString(), until = new Date(from.getTime() + 864e5).toISOString();
  const out = []; let cursor = '';
  for (let i = 0; i < 5; i++) {
    const j = await tfetch(token, `/tasks/completed/by_completion_date?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&limit=200${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`);
    out.push(...(j?.items || []));
    cursor = j?.next_cursor;
    if (!cursor) break;
  }
  return out.filter((t) => !t.parent_id).map((t) => ({ id: String(t.id || t.task_id || ''), t: t.content || '', at: t.completed_at || '' }));
}

// ---------- идеи: задачи с меткой «идея» (где угодно) ⇄ идеи Мастерской ----------
// книга — по разделу в проекте «Книги»; без раздела — «Без книги», книгу можно выбрать в приложении
export async function fetchIdeaTasks(token) {
  const projects = await all(token, '/projects'), books = projects.find((x) => /^книги$/i.test(String(x.name).trim()));
  const secs = books ? await all(token, `/sections?project_id=${books.id}`) : [];
  const sn = Object.fromEntries(secs.map((x) => [String(x.id), x.name]));
  const list = await all(token, `/tasks/filter?query=${encodeURIComponent('@' + IDEA_LABEL)}`).catch(() => all(token, `/tasks?label=${encodeURIComponent(IDEA_LABEL)}`));
  return { booksProjectId: books?.id || null, sections: secs, tasks: list.filter((t) => !t.parent_id).map((t) => ({ id: String(t.id), t: t.content || '', d: t.description || '', s: books && String(t.project_id) === String(books.id) ? sn[String(t.section_id)] || '' : '', at: t.added_at || '' })) };
}
// что сделать с идеями: create — новые из Todoist в приложение; pull — обновить из Todoist; push — отправить в Todoist;
// update — поменять текст в Todoist; close — удалённые в приложении закрыть в Todoist; gone — исчезли из Todoist (проверить)
export function ideasPlan(ideas, tasks) {
  const byTd = new Map(ideas.filter((x) => x.tdId).map((x) => [String(x.tdId), x]));
  const live = new Set(tasks.map((t) => t.id));
  const ops = { create: [], pull: [], push: [], update: [], close: [], gone: [] };
  for (const t of tasks) {
    const x = byTd.get(t.id);
    if (!x) { ops.create.push(t); continue; }
    if (x.deletedAt || isDone(x)) { ops.close.push(x); continue; } // удалила или отметила «Готово» — закрываем и в Todoist
    if (t.t !== (x.tdT ?? '') || t.d !== (x.tdD ?? '')) ops.pull.push({ x, t }); // поменяла в Todoist
    else if ((x.title || '') !== (x.tdT ?? '') || (x.text || '') !== (x.tdD ?? '')) ops.update.push(x); // поменяла здесь
  }
  for (const x of ideas) {
    if (x.deletedAt) continue;
    if (!x.tdId && !x.tdOff && !isDone(x)) ops.push.push(x);
    else if (x.tdId && !live.has(String(x.tdId))) ops.gone.push(x);
  }
  return ops;
}
const ideaContent = (x) => (x.title || String(x.text || '').split('\n')[0] || 'Идея').slice(0, 300);
const shortT = (t) => String(t || '').split(/[.!?:]/)[0].trim();
export async function syncIdeas(token, ideas, booksById) {
  const r = await fetchIdeaTasks(token), ops = ideasPlan(ideas, r.tasks), puts = [];
  const bookBySection = (sname) => { if (!sname) return ''; const low = sname.trim().toLowerCase(); const b = Object.values(booksById).find((bk) => { const t = shortT(bk.title).toLowerCase(); return t === low || (low.length >= 4 && (t.startsWith(low) || low.startsWith(t))); }); return b ? b.id : ''; };
  // раздел не про книгу (например, «Входящие») — книга по словам в тексте, и задача сама переедет в раздел книги
  const guess = (t) => bookGuess(`${t.t} ${t.d}`, Object.values(booksById))?.id || '';
  for (const t of ops.create) puts.push({ id: 'i' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4), title: t.t, text: t.d, ...(bookBySection(t.s) ? { bookId: bookBySection(t.s) } : guess(t) ? { bookId: guess(t), tdMove: true } : { bookId: '' }), status: 'new', tags: [], comments: [], createdAt: t.at || new Date().toISOString(), tdId: t.id, tdT: t.t, tdD: t.d, src: 'todoist' });
  for (const { x, t } of ops.pull) puts.push({ ...x, title: t.t, text: t.d, tdT: t.t, tdD: t.d, bookId: x.bookId || bookBySection(t.s) });
  for (const x of ops.update) { await post(token, `/tasks/${x.tdId}`, { content: ideaContent(x), description: x.text || '' }); puts.push({ ...x, tdT: x.title || '', tdD: x.text || '' }); }
  for (const x of ops.close) { await post(token, `/tasks/${x.tdId}/close`).catch(() => {}); puts.push({ ...x, tdId: '', tdOff: true }); }
  for (const x of ops.gone) { // закрыта или удалена в Todoist — запись остаётся, но становится «Готово»
    let t = null; try { t = await tfetch(token, `/tasks/${x.tdId}`); } catch (e) { if (!/404/.test(e.message)) throw e; }
    if (!t || t.checked || t.is_deleted) puts.push({ ...x, tdId: '', tdOff: true, ...(isDone(x) ? {} : { status: 'used', doneAt: new Date().toISOString() }) });
  }
  // книгу выбрали в приложении — переносим задачу-идею в раздел книги
  const moves = ideas.filter((x) => x.tdMove && x.tdId && !x.deletedAt && x.bookId && booksById[x.bookId]);
  if (moves.length && r.booksProjectId) {
    const secs2 = [...r.sections];
    for (const x of moves) {
      const name = shortT(booksById[x.bookId].title), low = name.toLowerCase();
      let sec = secs2.find((y) => y.name.trim().toLowerCase() === low || (y.name.length >= 4 && low.startsWith(y.name.trim().toLowerCase())));
      if (!sec) { sec = await post(token, '/sections', { name, project_id: r.booksProjectId }); secs2.push(sec); r.sections.push(sec); }
      await post(token, `/tasks/${x.tdId}/move`, { section_id: sec.id }).catch(() => {});
      puts.push({ ...x, tdMove: false });
    }
  }
  if (ops.push.length) {
    let pid = r.booksProjectId;
    if (!pid) pid = (await post(token, '/projects', { name: 'Книги' })).id;
    const secs = [...r.sections];
    for (const x of ops.push) {
      const b = x.bookId ? booksById[x.bookId] : null;
      let section_id;
      if (b) { const name = shortT(b.title), low = name.toLowerCase(); let sec = secs.find((y) => y.name.trim().toLowerCase() === low || (y.name.length >= 4 && low.startsWith(y.name.trim().toLowerCase()))); if (!sec) { sec = await post(token, '/sections', { name, project_id: pid }); secs.push(sec); } section_id = sec.id; }
      const t = await post(token, '/tasks', { content: ideaContent(x), description: x.text || '', project_id: pid, ...(section_id ? { section_id } : {}), labels: [IDEA_LABEL] });
      puts.push({ ...x, tdId: String(t.id), tdT: x.title || '', tdD: x.text || '' });
    }
  }
  // одна идея могла поменяться в нескольких шагах — собираем изменения вместе
  const merged = new Map(); for (const x of puts) merged.set(x.id, { ...(merged.get(x.id) || {}), ...x });
  return { puts: [...merged.values()], created: ops.create.length };
}

async function ensureLabels(token) {
  const have = new Set((await all(token, '/labels')).map((l) => lowName(l.name)));
  for (const [name, color] of LABELS) if (!have.has(name)) await post(token, '/labels', { name, color });
}
async function routeByLabels(token, books, made) {
  const tasks = await all(token, '/tasks'), projects = await all(token, '/projects');
  const pid = Object.fromEntries(projects.map((p) => [lowName(p.name), p.id]));
  const moves = routeTasks(tasks, { projects: pid, books, made });
  if (!moves.length) return 0;
  const withSec = moves.filter((m) => m.section), sh = withSec.length ? await shelves(token, withSec) : { proj: {}, sec: {} };
  for (const m of moves) {
    let project_id = sh.proj[m.project] || pid[lowName(m.project)];
    if (!project_id) project_id = (await post(token, '/projects', { name: m.project })).id;
    await post(token, `/tasks/${m.id}/move`, m.section ? { section_id: sh.sec[m.project + '\u0000' + m.section] } : { project_id }).catch(() => {});
  }
  return moves.length;
}

// синхронизация: возвращает {state, stats, doneInTodoist}
export async function syncTodoist(token, want, state = {}) {
  const map = { ...(state.map || {}) }, closed = { ...(state.closed || {}) };
  // свои задачи приложения: всё, что оно создало или к чему привязано (раньше списка не было — берём связанные)
  const made = { ...(state.made || {}) };
  for (const m of Object.values(map)) made[String(m.id)] ||= m.date || '1';
  // метки «мастерская», «книги», «идея», «доходы» — заводим, если их нет в списке меток
  await ensureLabels(token).catch(() => {});
  // сначала — разложить по полкам задачи с метками, поставленные вручную (например, во «Входящих»)
  await routeByLabels(token, state.books || [], made).catch(() => {});
  const active = await all(token, `/tasks/filter?query=${encodeURIComponent('@' + TD_LABEL)}`).catch(() => all(token, `/tasks?label=${encodeURIComponent(TD_LABEL)}`));
  const ops = todoistPlan(want, map, closed, active, made);
  const today = want.map((w) => w.date).sort()[0] || '';
  const stats = { created: 0, updated: 0, closed: 0 };
  ops.doneInTodoist = [];
  for (const k of ops.unclose) delete closed[k];
  // задачи, которых нет среди открытых: закрыта или удалена в Todoist — тогда больше не трогаем; иначе — обновляем как обычно
  for (const { id, w } of ops.verify) {
    let t = null;
    try { t = await tfetch(token, `/tasks/${id}`); } catch (e) { if (!/404/.test(e.message)) throw e; }
    if (!t || t.checked || t.is_deleted) { ops.doneInTodoist.push(w); closed[w.key] = w.date; delete map[w.key]; }
    else ops.update.push({ id, w });
  }
  for (const { key, id } of ops.close) { await post(token, `/tasks/${id}/close`).catch(() => {}); if (key) delete map[key]; stats.closed++; }
  for (const { id, w, adopt } of ops.update) {
    if (!adopt) await post(token, `/tasks/${id}`, { content: w.content, description: w.description, due_date: w.date });
    map[w.key] = { id, date: w.date }; made[String(id)] ||= w.date || '1'; if (!adopt) stats.updated++;
  }
  if (ops.create.length) {
    const sh = await shelves(token, ops.create);
    for (const w of ops.create) {
      const t = await post(token, '/tasks', { content: w.content, description: w.description, due_date: w.date, project_id: sh.proj[w.project], section_id: sh.sec[w.project + '\u0000' + w.section], labels: [TD_LABEL] });
      map[w.key] = { id: t.id, date: w.date }; made[String(t.id)] = w.date || '1'; stats.created++;
    }
  }
  // старое не храним: закрытое и прошедшее больше месяца назад
  const old = (d) => today && d && d < today.slice(0, 8) + '01' && d < today;
  for (const [k, d] of Object.entries(closed)) if (old(d) && !want.some((w) => w.key === k)) delete closed[k];
  // список своих не растёт бесконечно: держим открытые и связанные
  const openIds = new Set([...active.map((t) => String(t.id)), ...Object.values(map).map((m) => String(m.id))]);
  for (const id of Object.keys(made)) if (!openIds.has(id)) delete made[id];
  const own = await fetchOwnTasks(token, made).catch(() => state.own || []);
  return { state: { map, closed, made, own, at: new Date().toISOString(), stats }, stats, doneInTodoist: ops.doneInTodoist };
}
