// Todoist: планер Мастерской сам раскладывает дела по полочкам Todoist с нужными датами.
// Книжное — в проект «Книги», раздел по книге (как у Ланы уже заведено); остальное — в проект «Мастерская»
// по разделам (деньги и реклама, связи, маркетинг, конкурсы, дела). Все задачи с меткой «мастерская».
// Сделала в приложении — задача в Todoist закрывается; закрыла в Todoist — больше не создаём заново
// (а дела из очереди и по связям отмечаются сделанными и в приложении).
const API = 'https://api.todoist.com/api/v1';
export const TD_LABEL = 'мастерская';
export const IDEA_LABEL = 'идея';
export const TD_DAYS = 30; // на сколько дней вперёд отправляем
const KIND_SHELF = { money: 'Деньги и реклама', waitans: 'Связи', mk: 'Маркетинг', contest: 'Конкурсы' };
const SKIP = new Set(['done', 'wait', 'td']); // выложено / выйдет само — делать ничего не нужно; td — задачи из самого Todoist

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
    const key = `${x.kind}_` + hash(x.kind === 'pub' ? `${x.book}:${x.date}` : x.todoK ? `${x.linkId}:${x.todoK}` : `${x.id || ''}:${title}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, content: title, description: unesc(x.sub || ''), date: x.date, project: b ? 'Книги' : 'Мастерская', section: b ? shortTitle(b.title) : KIND_SHELF[x.kind] || 'Дела', item: x });
  }
  return out;
}

// что сделать: map — {key: {id, date, content}} (что мы уже создали), closed — {key: дата} (закрыто в Todoist),
// active — открытые задачи с нашей меткой [{id, content, due:{date}}]
export function todoistPlan(want, map = {}, closed = {}, active = []) {
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
    const twin = active.find((t) => !taken.has(String(t.id)) && same(t, w));
    if (twin) { taken.add(String(twin.id)); ops.update.push({ id: twin.id, w, adopt: true }); if (closed[w.key]) ops.unclose.push(w.key); continue; }
    if (closed[w.key]) continue; // закрыла в Todoist — заново не создаём
    ops.create.push(w);
  }
  // в планере этого больше нет (сделано или выложено в приложении) — закрываем в Todoist
  for (const [key, m] of Object.entries(map)) if (!wantKeys.has(key) && byId.has(String(m.id))) ops.close.push({ key, id: m.id });
  // наши задачи (с меткой), которые ни к чему в планере не относятся — устарели, закрываем
  for (const t of active) if (!taken.has(String(t.id))) ops.close.push({ key: null, id: t.id });
  return ops;
}

async function tfetch(token, path, opts = {}) {
  let r;
  try { r = await fetch(API + path, { ...opts, headers: { Authorization: 'Bearer ' + token, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } }); } catch { throw new Error('нет связи с Todoist'); }
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
export async function fetchOwnTasks(token) {
  const projects = await all(token, '/projects'), out = [];
  for (const p of projects.filter((x) => /^(книги|мастерская)$/i.test(String(x.name).trim()))) {
    const secs = await all(token, `/sections?project_id=${p.id}`), sn = Object.fromEntries(secs.map((x) => [String(x.id), x.name]));
    for (const t of await all(token, `/tasks?project_id=${p.id}`)) {
      if ((t.labels || []).includes(TD_LABEL) || (t.labels || []).includes(IDEA_LABEL) || t.parent_id) continue;
      out.push({ id: String(t.id), t: t.content, d: (t.due?.date || '').slice(0, 10), p: String(p.name).trim(), s: sn[String(t.section_id)] || '', pr: t.priority || 1, ds: t.description || '' });
    }
  }
  return out.slice(0, 300);
}
export const closeTask = (token, id) => post(token, `/tasks/${id}/close`);

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
    if (x.deletedAt) { ops.close.push(x); continue; }
    if (t.t !== (x.tdT ?? '') || t.d !== (x.tdD ?? '')) ops.pull.push({ x, t }); // поменяла в Todoist
    else if ((x.title || '') !== (x.tdT ?? '') || (x.text || '') !== (x.tdD ?? '')) ops.update.push(x); // поменяла здесь
  }
  for (const x of ideas) {
    if (x.deletedAt) continue;
    if (!x.tdId && !x.tdOff) ops.push.push(x);
    else if (x.tdId && !live.has(String(x.tdId))) ops.gone.push(x);
  }
  return ops;
}
const ideaContent = (x) => (x.title || String(x.text || '').split('\n')[0] || 'Идея').slice(0, 300);
const shortT = (t) => String(t || '').split(/[.!?:]/)[0].trim();
export async function syncIdeas(token, ideas, booksById) {
  const r = await fetchIdeaTasks(token), ops = ideasPlan(ideas, r.tasks), puts = [];
  const bookBySection = (sname) => { if (!sname) return ''; const low = sname.trim().toLowerCase(); const b = Object.values(booksById).find((bk) => { const t = shortT(bk.title).toLowerCase(); return t === low || (low.length >= 4 && (t.startsWith(low) || low.startsWith(t))); }); return b ? b.id : ''; };
  for (const t of ops.create) puts.push({ id: 'i' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4), title: t.t, text: t.d, bookId: bookBySection(t.s), status: 'new', tags: [], comments: [], createdAt: t.at || new Date().toISOString(), tdId: t.id, tdT: t.t, tdD: t.d, src: 'todoist' });
  for (const { x, t } of ops.pull) puts.push({ ...x, title: t.t, text: t.d, tdT: t.t, tdD: t.d, bookId: x.bookId || bookBySection(t.s) });
  for (const x of ops.update) { await post(token, `/tasks/${x.tdId}`, { content: ideaContent(x), description: x.text || '' }); puts.push({ ...x, tdT: x.title || '', tdD: x.text || '' }); }
  for (const x of ops.close) { await post(token, `/tasks/${x.tdId}/close`).catch(() => {}); puts.push({ ...x, tdId: '', tdOff: true }); }
  for (const x of ops.gone) { // закрыта или удалена в Todoist — идея остаётся, но помечается «Использована»
    let t = null; try { t = await tfetch(token, `/tasks/${x.tdId}`); } catch (e) { if (!/404/.test(e.message)) throw e; }
    if (!t || t.checked || t.is_deleted) puts.push({ ...x, tdId: '', tdOff: true, status: x.status === 'new' || x.status === 'work' ? 'used' : x.status });
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

// синхронизация: возвращает {state, stats, doneInTodoist}
export async function syncTodoist(token, want, state = {}) {
  const map = { ...(state.map || {}) }, closed = { ...(state.closed || {}) };
  const active = await all(token, `/tasks/filter?query=${encodeURIComponent('@' + TD_LABEL)}`).catch(() => all(token, `/tasks?label=${encodeURIComponent(TD_LABEL)}`));
  const ops = todoistPlan(want, map, closed, active);
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
    map[w.key] = { id, date: w.date }; if (!adopt) stats.updated++;
  }
  if (ops.create.length) {
    const sh = await shelves(token, ops.create);
    for (const w of ops.create) {
      const t = await post(token, '/tasks', { content: w.content, description: w.description, due_date: w.date, project_id: sh.proj[w.project], section_id: sh.sec[w.project + '\u0000' + w.section], labels: [TD_LABEL] });
      map[w.key] = { id: t.id, date: w.date }; stats.created++;
    }
  }
  // старое не храним: закрытое и прошедшее больше месяца назад
  const old = (d) => today && d && d < today.slice(0, 8) + '01' && d < today;
  for (const [k, d] of Object.entries(closed)) if (old(d) && !want.some((w) => w.key === k)) delete closed[k];
  const own = await fetchOwnTasks(token).catch(() => state.own || []);
  return { state: { map, closed, own, at: new Date().toISOString(), stats }, stats, doneInTodoist: ops.doneInTodoist };
}
