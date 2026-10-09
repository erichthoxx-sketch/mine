// Todoist: планер Мастерской сам раскладывает дела по полочкам Todoist с нужными датами.
// Книжное — в проект «Книги», раздел по книге (как у Ланы уже заведено); остальное — в проект «Мастерская»
// по разделам (деньги и реклама, связи, маркетинг, конкурсы, дела). Все задачи с меткой «мастерская».
// Сделала в приложении — задача в Todoist закрывается; закрыла в Todoist — больше не создаём заново
// (а дела из очереди и по связям отмечаются сделанными и в приложении).
const API = 'https://api.todoist.com/api/v1';
export const TD_LABEL = 'мастерская';
export const TD_DAYS = 30; // на сколько дней вперёд отправляем
const KIND_SHELF = { money: 'Деньги и реклама', waitans: 'Связи', mk: 'Маркетинг', contest: 'Конкурсы' };
const SKIP = new Set(['done', 'wait']); // выложено / выйдет само — делать ничего не нужно

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
    const title = unesc(x.title).replace(/^[⏱✓]\s*/, ''), bid = bookOf(x), b = bid ? booksById[bid] : null;
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
  const ops = { create: [], update: [], close: [], doneInTodoist: [] };
  const wantKeys = new Set(want.map((w) => w.key));
  const adopted = new Set(Object.values(map).map((m) => String(m.id)));
  for (const w of want) {
    if (closed[w.key]) continue;
    const m = map[w.key];
    if (m) {
      const t = byId.get(String(m.id));
      if (!t) { ops.doneInTodoist.push(w); continue; } // закрыла или удалила в Todoist
      if (t.content !== w.content || (t.due?.date || '').slice(0, 10) !== w.date || (t.description || '') !== w.description) ops.update.push({ id: m.id, w });
      continue;
    }
    // уже есть такая же (например, создало другое устройство) — берём её, а не дублируем
    const twin = active.find((t) => !adopted.has(String(t.id)) && t.content === w.content && (t.due?.date || '').slice(0, 10) === w.date);
    if (twin) { adopted.add(String(twin.id)); ops.update.push({ id: twin.id, w, adopt: true }); continue; }
    ops.create.push(w);
  }
  // в планере этого больше нет (сделано в приложении) — закрываем в Todoist
  for (const [key, m] of Object.entries(map)) if (!wantKeys.has(key) && byId.has(String(m.id))) ops.close.push({ key, id: m.id });
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

// синхронизация: возвращает {state, stats, doneInTodoist}
export async function syncTodoist(token, want, state = {}) {
  const map = { ...(state.map || {}) }, closed = { ...(state.closed || {}) };
  const active = await all(token, `/tasks/filter?query=${encodeURIComponent('@' + TD_LABEL)}`).catch(() => all(token, `/tasks?label=${encodeURIComponent(TD_LABEL)}`));
  const ops = todoistPlan(want, map, closed, active);
  const today = want.map((w) => w.date).sort()[0] || '';
  const stats = { created: 0, updated: 0, closed: 0 };
  for (const w of ops.doneInTodoist) { closed[w.key] = w.date; delete map[w.key]; }
  for (const { key, id } of ops.close) { await post(token, `/tasks/${id}/close`); delete map[key]; stats.closed++; }
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
  return { state: { map, closed, at: new Date().toISOString(), stats }, stats, doneInTodoist: ops.doneInTodoist };
}
