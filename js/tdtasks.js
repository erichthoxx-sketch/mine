// Свои задачи Ланы из Todoist (проекты «Книги» и «Мастерская») — общие для «Мастерской» и «Доходов».
// Список приходит при синхронизации Мастерской и лежит в настройках (settings.todoist.own).
export const ownTasks = (settings) => (settings?.todoist?.own || []);
// раздел «Книги» → книга: «Альпийский развод» ↔ «Альпийский развод. Он оставил меня умирать»
const short = (t) => String(t || '').split(/[.!?:]/)[0].trim().toLowerCase();
export function bookOfTask(x, books) {
  if (x.p.toLowerCase() !== 'книги' || !x.s) return null;
  const s = x.s.trim().toLowerCase();
  return books.find((b) => { const t = short(b.title); return t === s || (s.length >= 4 && (t.startsWith(s) || s.startsWith(t))); }) || null;
}
export const isMoneyTask = (x) => x.p.toLowerCase() === 'мастерская' && /деньг|реклам|налог|финанс/i.test(x.s);

// «Сделано» в приложении — закрываем задачу и в Todoist
import { acts, toast, openSheet, closeSheet, esc } from './ui.js';
import { ic } from './icons.js';
acts['td.close'] = async (d) => {
  const a = window.__app, s = a.ctx().settings, token = s.todoistToken, td = s.todoist || {};
  if (!token) { toast('Todoist не подключён (Мастерская → Настройки)'); return; }
  try {
    const r = await fetch(`https://api.todoist.com/api/v1/tasks/${d.id}/close`, { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok && r.status !== 404) throw new Error('Todoist ответил ' + r.status);
  } catch (e) { toast('Не получилось закрыть в Todoist: ' + (e.message || e)); return; }
  await a.store.saveSettings({ todoist: { ...td, own: (td.own || []).filter((x) => x.id !== d.id) } });
  toast('Готово — закрыто и в Todoist');
};

// «+ задача» прямо в приложении: создаём в Todoist (проект «Книги» → раздел книги, или «Мастерская» → раздел)
const API = 'https://api.todoist.com/api/v1';
async function tdReq(token, path, body) {
  const r = await fetch(API + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error('Todoist ответил ' + r.status);
  return r.json();
}
const listAll = async (token, path) => { const out = []; let cur = null; for (let i = 0; i < 10; i++) { const j = await tdReq(token, path + (cur ? `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cur)}` : '')); out.push(...(j.results || [])); cur = j.next_cursor; if (!cur) break; } return out; };
export async function addOwnTask(settings, { project, section, content, date }) {
  const token = settings.todoistToken;
  if (!token) throw new Error('Todoist не подключён (Мастерская → Настройки)');
  const projects = await listAll(token, '/projects');
  let p = projects.find((x) => String(x.name).trim().toLowerCase() === project.toLowerCase());
  if (!p) p = await tdReq(token, '/projects', { name: project });
  let section_id;
  if (section) {
    const secs = await listAll(token, `/sections?project_id=${p.id}`), low = section.toLowerCase();
    let s = secs.find((x) => x.name.trim().toLowerCase() === low || (x.name.length >= 4 && low.startsWith(x.name.trim().toLowerCase())));
    if (!s) s = await tdReq(token, '/sections', { name: section, project_id: p.id });
    section_id = s.id;
  }
  const t = await tdReq(token, '/tasks', { content, project_id: p.id, ...(section_id ? { section_id } : {}), ...(date ? { due_date: date } : {}) });
  return { id: String(t.id), t: content, d: date || '', p: project, s: section || '', pr: 1 };
}

// Открыть задачу: поправить текст, дату и описание прямо здесь — изменения уходят в Todoist
const taskOf = (id) => ownTasks(window.__app.ctx().settings).find((x) => x.id === id);
acts['td.open'] = (d) => {
  const a = window.__app, s = a.ctx().settings, x = taskOf(d.id);
  if (!x) { toast('Задача уже закрыта или изменилась — обновляю'); return; }
  const place = [x.p, x.s].filter(Boolean).join(' → ');
  const f = openSheet('Задача', `
    <label for="tdT">Что сделать</label><textarea id="tdT" name="t" rows="2" required>${esc(x.t)}</textarea>
    <label for="tdD">Срок</label><input id="tdD" type="date" name="d" value="${x.d || ''}">
    <label for="tdS">Описание</label><textarea id="tdS" name="ds" rows="4" placeholder="Заметки, ссылки, подробности">${esc(x.ds || '')}</textarea>
    <div class="hint">${esc(place)} · в Todoist изменится тоже</div>
    <div class="row" style="margin-top:12px;gap:14px;flex-wrap:wrap;align-items:center"><button type="button" class="small-btn" data-act="td.close" data-id="${x.id}">${ic('check')} Сделано</button>
    <a class="link td-ext" href="https://app.todoist.com/app/task/${encodeURIComponent(x.id)}" target="_blank" rel="noopener">Открыть в Todoist</a></div>`, async (fd) => {
    const token = s.todoistToken;
    if (!token) { toast('Todoist не подключён (Мастерская → Настройки)'); return false; }
    const t = String(fd.get('t') || '').trim(), dd = String(fd.get('d') || ''), ds = String(fd.get('ds') || '');
    if (!t) return false;
    const body = { content: t, description: ds };
    if (dd !== (x.d || '')) Object.assign(body, dd ? { due_date: dd } : { due_string: 'no date' });
    try { await tdReq(token, `/tasks/${x.id}`, body); } catch (e) { toast('Не получилось сохранить в Todoist: ' + (e.message || e)); return false; }
    const td = s.todoist || {};
    await a.store.saveSettings({ todoist: { ...td, own: (td.own || []).map((y) => (y.id === x.id ? { ...y, t, d: dd, ds } : y)) } });
    toast('Сохранено и в Todoist');
  });
  f.querySelector('[data-act="td.close"]')?.addEventListener('click', () => closeSheet(), { once: true });
  return false;
};
