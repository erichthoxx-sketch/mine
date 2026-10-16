// «Легенда» книги: идея, каркас по главам, персонажи. Сохраняется в книге (b.legend) и сама переписывается
// во вкладки Google Документа «Идея», «Каркас», «Персонажи» (в рукопись и подсчёт знаков они не входят).
// «Для нейросети» — всё одним текстом, можно «до главы N»: план и характеры для контекста.
import { esc, acts, changes, openSheet, closeSheet, opt, toast, uid, ask, download } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { resizeImage } from '../../../js/img.js';
import * as drive from '../drive.js';
import { chapterList, isAuthorTab } from '../wcalc.js';
import { findTab, contentToBlocks, blocksText, contentEnd, saveRequests } from '../docedit.js';
import { docxBlob, noYo } from '../publish.js';
import { IDEA_FIELDS, ROLES, CHAR_FIELDS, LEGEND_TABS, legendOf, legendContext, parsePlan, legendBlocks, blocksPlain, hashText, normText } from '../legend.js';

const app = () => window.__app;
const bookOf = (id) => app().ctx().wbooksById[id];
const isGDoc = (b) => !!b?.fileId && b.mimeType === drive.MIME.doc;
const grp = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const COLORS = ['#e8a5bd', '#9fc9a9', '#9cc0e4', '#bba7e6', '#efb79d', '#b9b5c0', '#e6c88f'];
const colorOf = (s) => COLORS[[...String(s || '?')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
const avatar = (c, size = 44) => c.photo ? `<img class="lg-av" src="${c.photo}" alt="" style="width:${size}px;height:${size}px">` : `<span class="lg-av" style="width:${size}px;height:${size}px;background:${colorOf(c.name)}">${esc(initials(c.name))}</span>`;
const ta = (attrs, v, ph, rows = 2) => `<textarea class="lg-ta" rows="${rows}" ${attrs} placeholder="${esc(ph)}">${esc(v || '')}</textarea>`;

// переключатель «Книга / Легенда» — сверху страницы книги и Легенды
export const bookSeg = (b, on) => `<div class="bk-seg">${on === 'book' ? '<span class="on">Книга</span>' : `<a href="#" data-act="go" data-to="/book/${b.id}">Книга</a>`}${on === 'legend' ? '<span class="on">Легенда</span>' : `<a href="#" data-act="go" data-to="/legend/${b.id}">Легенда</a>`}</div>`;

export function legendPage(a, id) {
  const c = a.ctx(), b = c.wbooksById[id];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p></div>' };
  const L = legendOf(b), tab = a.ui.legTab || 'idea';
  const main = chapterList(b).filter((t) => !isAuthorTab(t.title));
  const tabs = [['idea', 'Идея'], ['plan', `Каркас${L.plan.length ? ` · ${L.plan.length}` : ''}`], ['chars', `Персонажи${L.chars.length ? ` · ${L.chars.length}` : ''}`]];
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/books">← Все книги</a></p>
  <div class="lg-top"><h2 class="lg-book">${esc(b.title)}</h2>${bookSeg(b, 'legend')}</div>
  <div class="lg-bar"><div class="lg-tabs">${tabs.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-act="leg.tab" data-v="${k}">${t}</button>`).join('')}</div>
    <div class="lg-acts"><button class="primary" data-act="leg.ai" data-id="${b.id}">${ic('sparkle')} Для нейросети</button><button class="dl" data-act="leg.docx" data-id="${b.id}">${ic('download')}Word</button><button class="dl" data-act="leg.pdf" data-id="${b.id}">${ic('download')}PDF</button></div></div>
  ${syncLine(b, L)}
  ${tab === 'idea' ? ideaHtml(b, L) : tab === 'plan' ? planHtml(b, L, main) : charsHtml(b, L, main)}`;
  return { html, after: () => document.querySelectorAll('.lg-ta').forEach(grow) };
}
// поле растёт по тексту — длинную мысль видно целиком
function grow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; if (!el.dataset.g) { el.dataset.g = 1; el.addEventListener('input', () => grow(el)); } }

function syncLine(b, L) {
  if (!isGDoc(b)) return '';
  const conf = Object.keys(L.conflicts || {}).filter((k) => L.conflicts[k]);
  const sug = !L.plan.length && !(L.sync || {}).plan && (b.tabs || []).some((t) => t.title === 'Каркас');
  const parts = [];
  for (const k of conf) parts.push(`<div class="lg-conf"><span>Во вкладке «${LEGEND_TABS[k]}» в Google Документе свой текст — Легенда его не перезаписала.</span><span class="row"><button class="small-btn" data-act="leg.pull" data-id="${b.id}" data-k="${k}">Подтянуть в Легенду</button><button class="link" data-act="leg.replace" data-id="${b.id}" data-k="${k}">Заменить версией из Легенды</button></span></div>`);
  if (sug && !conf.includes('plan')) parts.push(`<div class="lg-conf"><span>В Документе есть вкладка «Каркас» — разложить её по главам здесь?</span><span class="row"><button class="small-btn" data-act="leg.pull" data-id="${b.id}" data-k="plan">Подтянуть</button></span></div>`);
  const t = L.syncedAt ? new Date(L.syncedAt) : null;
  const st = !drive.hasFreshToken() ? 'Google Документ: подключите Диск — Легенда сохранится во вкладки «Идея», «Каркас», «Персонажи»' : t ? `Google Документ: сохранено ${t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Google Документ: сохранится после первой правки';
  return `${parts.join('')}<div class="lg-sync small muted">${st}</div>`;
}

function ideaHtml(b, L) {
  return `<div class="card lg-idea">${IDEA_FIELDS.map(([k, label, ph]) => `<label class="lg-l">${label}</label>${ta(`data-chg="leg.idea" data-id="${b.id}" data-k="${k}"`, L.idea?.[k], ph, k === 'logline' ? 1 : 2)}`).join('')}</div>`;
}

function planHtml(b, L, main) {
  const opts = (sel) => `<option value="">—</option>${L.chars.map((x) => opt(x.id, x.name || 'Без имени', sel || '')).join('')}`;
  const card = (p, i) => {
    const real = main[i];
    // глава с тем же номером в Документе: написана ли и сколько знаков
    const same = real && String(real.title).trim().toLowerCase() === String(p.title || '').trim().toLowerCase();
    const st = real ? `<span class="lg-st ok" title="${esc(real.title)} в Google Документе">${same ? 'написана' : esc(real.title)}${real.chars ? ` · ${grp(real.chars)} зн.` : ''}</span>` : '<span class="lg-st">ещё не написана</span>';
    return `<div class="card lg-ch"><div class="lg-ch-h"><span class="lg-n">${i + 1}</span><input class="lg-t" value="${esc(p.title || '')}" placeholder="Название главы" data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="title">${st}
      <span class="lg-mv"><button class="lg-ib" data-act="leg.move" data-id="${b.id}" data-i="${i}" data-d="-1" title="Выше" aria-label="Выше"${i ? '' : ' disabled'}>↑</button><button class="lg-ib" data-act="leg.move" data-id="${b.id}" data-i="${i}" data-d="1" title="Ниже" aria-label="Ниже"${i < L.plan.length - 1 ? '' : ' disabled'}>↓</button><button class="lg-ib" data-act="leg.ins" data-id="${b.id}" data-i="${i + 1}" title="Вставить главу после" aria-label="Вставить после">+</button><button class="lg-ib" data-act="leg.delp" data-id="${b.id}" data-i="${i}" title="Убрать из каркаса" aria-label="Убрать">${ic('trash')}</button></span></div>
      ${ta(`data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="what"`, p.what, 'Что происходит: 2–3 строки, главное событие главы', 2)}
      ${ta(`data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="why"`, p.why, 'Зачем эта глава: что меняется для героев, какой крючок в конце', 1)}
      ${L.chars.length ? `<div class="lg-row"><label class="lg-pov">Глазами <select data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="pov">${opts(p.pov)}</select></label>
        <span class="lg-chips">${L.chars.map((x) => `<button class="lg-chip${(p.chars || []).includes(x.id) ? ' on' : ''}" data-act="leg.pchar" data-id="${b.id}" data-i="${i}" data-c="${x.id}">${esc(x.name || 'Без имени')}</button>`).join('')}</span></div>` : ''}</div>`;
  };
  return `${L.plan.map(card).join('')}
    <div class="lg-add"><button data-act="leg.ins" data-id="${b.id}" data-i="${L.plan.length}">+ Глава в каркас</button>${!L.plan.length && main.length ? `<button class="link" data-act="leg.fromCh" data-id="${b.id}">Создать по главам из Документа (${main.length})</button>` : ''}</div>`;
}

function charsHtml(b, L, main) {
  const inCh = (id) => L.plan.map((p, i) => ((p.chars || []).includes(id) || p.pov === id ? i + 1 : 0)).filter(Boolean);
  return `<div class="lg-cards">${L.chars.map((x) => { const ch = inCh(x.id); return `<a href="#" class="card lg-card tap" data-act="leg.char" data-id="${b.id}" data-c="${x.id}">${avatar(x)}
    <span class="lg-cb"><b>${esc(x.name || 'Без имени')}</b><span class="lg-role">${[ROLES[x.role], x.age ? `${esc(x.age)} лет` : ''].filter(Boolean).join(' · ')}</span>
    ${x.nature ? `<span class="lg-sn">${esc(x.nature)}</span>` : ''}${ch.length ? `<span class="lg-in">в главах: ${ch.slice(0, 12).join(', ')}${ch.length > 12 ? '…' : ''}</span>` : ''}</span></a>`; }).join('')}
    <button class="card lg-card lg-new" data-act="leg.char" data-id="${b.id}">+ Персонаж</button></div>`;
}

// ---------- сохранение ----------
async function saveL(id, fn, { sync = true } = {}) {
  const b = bookOf(id), L = legendOf(b);
  fn(L);
  await app().store.put('w_books', { ...b, legend: L });
  if (sync) scheduleSync(id);
}
acts['leg.tab'] = (d) => { app().ui.legTab = d.v; };
changes['leg.idea'] = (v, el) => saveL(el.dataset.id, (L) => { L.idea = { ...L.idea, [el.dataset.k]: v }; });
changes['leg.plan'] = (v, el) => saveL(el.dataset.id, (L) => { const i = Number(el.dataset.i); L.plan = L.plan.map((p, j) => (j === i ? { ...p, [el.dataset.k]: v } : p)); });
acts['leg.pchar'] = (d) => saveL(d.id, (L) => { const i = Number(d.i); L.plan = L.plan.map((p, j) => { if (j !== i) return p; const s = new Set(p.chars || []); if (s.has(d.c)) s.delete(d.c); else s.add(d.c); return { ...p, chars: [...s] }; }); });
acts['leg.ins'] = (d) => saveL(d.id, (L) => { const i = Number(d.i); L.plan = [...L.plan.slice(0, i), { id: uid(), title: '', what: '', why: '', pov: '', chars: [] }, ...L.plan.slice(i)]; });
acts['leg.move'] = (d) => saveL(d.id, (L) => { const i = Number(d.i), j = i + Number(d.d); if (j < 0 || j >= L.plan.length) return; const p = [...L.plan]; [p[i], p[j]] = [p[j], p[i]]; L.plan = p; });
acts['leg.delp'] = async (d) => {
  const L0 = legendOf(bookOf(d.id)), i = Number(d.i), item = L0.plan[i];
  if ((item.what || item.why) && !(await ask('Убрать эту главу из каркаса?', 'Убрать'))) return false;
  await saveL(d.id, (L) => { L.plan = L.plan.filter((_, j) => j !== i); });
  toast('Убрано из каркаса', { undo: () => saveL(d.id, (L) => { L.plan = [...L.plan.slice(0, i), item, ...L.plan.slice(i)]; }) });
};
acts['leg.fromCh'] = (d) => saveL(d.id, (L) => { L.plan = chapterList(bookOf(d.id)).filter((t) => !isAuthorTab(t.title)).map((t) => ({ id: uid(), title: t.title, what: t.lead || '', why: '', pov: '', chars: [] })); });

// персонаж — окно с полями и подсказками
acts['leg.char'] = (d) => {
  const L = legendOf(bookOf(d.id)), x = L.chars.find((y) => y.id === d.c) || { id: '', role: L.chars.length ? 'side' : 'heroine' };
  const f = openSheet(x.id ? x.name || 'Персонаж' : 'Новый персонаж', `
    <div class="lg-ch-top">${avatar(x, 64)}<label class="link lg-photo">${x.photo ? 'Заменить фото' : 'Добавить фото'}<input type="file" accept="image/*" name="photoFile" hidden></label>${x.photo ? '<label class="check"><input type="checkbox" name="nophoto">убрать фото</label>' : ''}</div>
    <div class="f2"><div><label for="lcn">Имя</label><input id="lcn" name="name" value="${esc(x.name || '')}" required placeholder="Анна Лебедева"></div>
    <div><label for="lcr">Роль</label><select id="lcr" name="role">${Object.entries(ROLES).map(([k, v]) => opt(k, v, x.role)).join('')}</select></div></div>
    ${CHAR_FIELDS.map(([k, label, ph]) => k === 'age' ? `<label for="lc_${k}">${label}</label><input id="lc_${k}" name="${k}" value="${esc(x[k] || '')}" placeholder="${ph}" inputmode="numeric">` : `<label for="lc_${k}">${label}</label><textarea id="lc_${k}" class="lg-ta" name="${k}" rows="2" placeholder="${esc(ph)}">${esc(x[k] || '')}</textarea>`).join('')}
    ${x.id ? `<p style="margin-top:14px"><button type="button" class="link danger" data-act="leg.delc" data-id="${d.id}" data-c="${x.id}">Удалить персонажа</button></p>` : ''}`, async (fd) => {
    const name = String(fd.get('name') || '').trim();
    if (!name) { toast('Как зовут персонажа?'); return false; }
    const v = { ...x, id: x.id || uid(), name, role: fd.get('role') };
    for (const [k] of CHAR_FIELDS) v[k] = String(fd.get(k) || '').trim();
    const file = fd.get('photoFile');
    if (file && file.size) { try { v.photo = await resizeImage(file, 160); } catch { toast('Фото не получилось уменьшить'); } }
    if (fd.get('nophoto')) v.photo = '';
    await saveL(d.id, (L) => { L.chars = x.id ? L.chars.map((y) => (y.id === x.id ? v : y)) : [...L.chars, v]; });
    toast(x.id ? 'Сохранено' : `${name} — в Легенде`);
  }, { submitText: x.id ? 'Сохранить' : 'Добавить' });
  f?.querySelectorAll('.lg-ta').forEach(grow);
};
acts['leg.delc'] = async (d) => {
  if (!(await ask('Удалить персонажа из Легенды?', 'Удалить'))) return false;
  const L0 = legendOf(bookOf(d.id)), x = L0.chars.find((y) => y.id === d.c);
  await saveL(d.id, (L) => { L.chars = L.chars.filter((y) => y.id !== d.c); L.plan = L.plan.map((p) => ({ ...p, pov: p.pov === d.c ? '' : p.pov, chars: (p.chars || []).filter((id) => id !== d.c) })); });
  closeSheet(); toast('Персонаж удалён', { undo: () => saveL(d.id, (L) => { L.chars = [...L.chars, x]; }) });
};

// ---------- «Для нейросети» ----------
acts['leg.ai'] = (d) => {
  const b = bookOf(d.id), L = legendOf(b);
  const f = openSheet('Легенда для нейросети', `<p class="small muted" style="margin-top:0">Скопируйте и вставьте в начало разговора с нейросетью — она будет учитывать идею, план и характеры.</p>
    ${L.plan.length ? `<label for="lgu">Каркас</label><select id="lgu" name="upTo">${opt('0', 'весь', '0')}${L.plan.map((p, i) => opt(String(i + 1), `до главы ${i + 1}${p.title ? ' — ' + p.title : ''} (и что пишем дальше)`, '0')).join('')}</select>` : ''}
    <textarea id="lgtext" class="lg-ai" readonly rows="14"></textarea>
    <div class="dl-row"><button type="button" class="primary" data-act="leg.copy">${ic('copy')} Скопировать</button></div>`, null);
  const upd = () => { f.querySelector('#lgtext').value = legendContext(L, { title: b.title, upTo: Number(f.querySelector('#lgu')?.value || 0) }); };
  f.querySelector('#lgu')?.addEventListener('change', upd); upd();
  return false;
};
acts['leg.copy'] = async () => { const t = document.getElementById('lgtext')?.value || ''; try { await navigator.clipboard.writeText(t); toast('Скопировано — вставьте в чат с нейросетью'); } catch { document.getElementById('lgtext')?.select(); toast('Выделено — нажмите Ctrl+C'); } return false; };

// ---------- Word и PDF ----------
const latin = (s) => { const TR = ['a', 'b', 'v', 'g', 'd', 'e', 'zh', 'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p', 'r', 's', 't', 'u', 'f', 'h', 'ts', 'ch', 'sh', 'sch', '', 'y', '', 'e', 'yu', 'ya']; return String(s || '').toLowerCase().replace(/[а-яё]/g, (ch) => (ch === 'ё' ? 'e' : TR[ch.charCodeAt(0) - 1072] ?? '')).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'kniga'; };
function exportParas(b, L) {
  const paras = [{ kind: 'title', runs: [{ t: `Легенда: ${b.title}` }] }];
  for (const [part, name] of Object.entries(LEGEND_TABS)) {
    const bl = legendBlocks(L, part);
    if (!bl.length) continue;
    paras.push({ kind: 'h', runs: [{ t: name }] });
    for (const p of bl) paras.push({ kind: 'p', runs: p.st.n ? [{ t: p.runs.map((r) => r.t).join(''), b: true }] : p.runs });
  }
  return paras;
}
acts['leg.docx'] = async (d) => {
  const b = bookOf(d.id), L = legendOf(b);
  try { const blob = await docxBlob(await drive.loadJsZip(), exportParas(b, L), { title: b.title, author: app().ctx().settings.pseudonym || '' }); if (await download(`legenda_${latin(b.title)}.docx`, blob, blob.type)) toast('Легенда скачана'); } catch (e) { toast(e.message || String(e)); }
};
acts['leg.pdf'] = (d) => {
  const b = bookOf(d.id), L = legendOf(b);
  const w = window.open('', '_blank');
  if (!w) { toast('Браузер не дал открыть окно — разрешите всплывающие окна для сайта'); return; }
  const h = (s) => esc(noYo(s));
  const body = exportParas(b, L).map((p) => p.kind === 'title' ? `<h1>${h(p.runs[0].t)}</h1>` : p.kind === 'h' ? `<h2>${h(p.runs[0].t)}</h2>` : `<p>${p.runs.map((r) => (r.b ? `<b>${h(r.t)}</b>` : h(r.t))).join('')}</p>`).join('');
  w.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${h('Легенда — ' + b.title)}</title><style>@page{size:A4;margin:2cm}body{font:12pt/1.45 Georgia,'Times New Roman',serif;color:#111;max-width:17cm;margin:0 auto}h1{font-size:20pt;margin:0 0 .6em}h2{font-size:14pt;margin:1.4em 0 .5em;border-bottom:1px solid #ccc;padding-bottom:.2em}p{margin:.25em 0}p b{font-weight:bold}</style></head><body>${body}</body></html>`);
  w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 300);
};

// ---------- синхронизация с Google Документом ----------
const timers = {};
export function scheduleSync(id, ms = 4000) {
  clearTimeout(timers[id]);
  timers[id] = setTimeout(() => syncLegend(id).catch(() => {}), ms);
}
// пишем вкладки «Идея», «Каркас», «Персонажи»; если там чужой (правленый в Документе) текст — не трогаем, а спрашиваем
export async function syncLegend(id, { replace = '' } = {}) {
  const b = bookOf(id);
  if (!isGDoc(b) || !drive.hasFreshToken()) return;
  const L = legendOf(b);
  let doc = await drive.getDoc(b.fileId);
  const sync = { ...(L.sync || {}) }, conflicts = { ...(L.conflicts || {}) };
  for (const [part, title] of Object.entries(LEGEND_TABS)) {
    const blocks = legendBlocks(L, part), text = blocksPlain(blocks);
    const tab = findTab(doc, title);
    if (!tab && !normText(text)) continue;
    const content = tab?.documentTab?.body?.content, cur = tab ? blocksText(contentToBlocks(content)) : '';
    if (tab && hashText(cur) === hashText(text)) { sync[part] = hashText(text); delete conflicts[part]; continue; }
    if (tab && normText(cur) && hashText(cur) !== sync[part] && replace !== part) { conflicts[part] = true; continue; }
    let tabId = tab?.tabProperties?.tabId, end = contentEnd(content);
    if (!tab) { tabId = await drive.docAddTab(b.fileId, { title }); end = 2; }
    if (blocks.length) await drive.docUpdate(b.fileId, saveRequests(blocks, tabId, end));
    else if (end > 2) await drive.docUpdate(b.fileId, saveRequests([], tabId, end));
    sync[part] = hashText(text); delete conflicts[part];
  }
  const nb = bookOf(id);
  await app().store.put('w_books', { ...nb, legend: { ...legendOf(nb), sync, conflicts, syncedAt: new Date().toISOString() } });
}
// подтянуть текст вкладки из Документа: «Каркас» — по главам; «Идея» и «Персонажи» — в заметки идеи
acts['leg.pull'] = async (d) => {
  const b = bookOf(d.id);
  try {
    await drive.ensureToken();
    const tab = findTab(await drive.getDoc(b.fileId), LEGEND_TABS[d.k]);
    const text = tab ? blocksText(contentToBlocks(tab.documentTab?.body?.content)) : '';
    if (!normText(text)) { toast('Вкладка пустая'); return; }
    await saveL(d.id, (L) => {
      if (d.k === 'plan') { const items = parsePlan(text, uid); L.plan = [...L.plan, ...items]; if (items.intro) L.idea = { ...L.idea, notes: [L.idea?.notes, items.intro].filter(Boolean).join('\n\n') }; }
      else L.idea = { ...L.idea, notes: [L.idea?.notes, `Из вкладки «${LEGEND_TABS[d.k]}»:\n${normText(text)}`].filter(Boolean).join('\n\n') };
      L.conflicts = { ...(L.conflicts || {}), [d.k]: false };
      L.sync = { ...(L.sync || {}), [d.k]: hashText(text) }; // теперь вкладку можно переписывать версией из Легенды
    });
    toast(d.k === 'plan' ? 'Каркас подтянут — проверьте главы' : 'Текст подтянут в «Заметки» идеи');
  } catch (e) { toast('Не получилось прочитать Документ: ' + (e.message || e)); }
};
acts['leg.replace'] = async (d) => {
  if (!(await ask(`Заменить вкладку «${LEGEND_TABS[d.k]}» в Google Документе версией из Легенды? Текст, который там сейчас, пропадёт (останется в истории версий Документа).`, 'Заменить'))) return false;
  try { await drive.ensureToken(); await syncLegend(d.id, { replace: d.k }); toast('Вкладка обновлена'); } catch (e) { toast('Не получилось: ' + (e.message || e)); }
};

// подсказка в редакторе главы: план этой главы и её персонажи
export function legendPeek(b, title) {
  const L = legendOf(b), main = chapterList(b).filter((t) => !isAuthorTab(t.title)), i = main.findIndex((t) => t.title === title), p = L.plan[i];
  if (!p && !L.chars.length) return '<p class="small muted">Легенда пока пустая — заполните её на странице книги, вкладка «Легенда».</p>';
  const cs = p ? L.chars.filter((x) => (p.chars || []).includes(x.id) || p.pov === x.id) : [];
  return `${p ? `<h3 style="margin:0 0 4px">${esc(p.title || `Глава ${i + 1}`)}</h3>${p.what ? `<p style="white-space:pre-line;margin:0 0 6px">${esc(p.what)}</p>` : ''}${p.why ? `<p class="small muted" style="margin:0">Зачем: ${esc(p.why)}</p>` : ''}` : '<p class="small muted">Для этой главы в каркасе пока нет плана.</p>'}
    ${cs.length ? `<div class="lg-peek">${cs.map((x) => `<div class="lg-pk">${avatar(x, 32)}<div><b>${esc(x.name)}</b>${x.nature ? `<div class="small muted">${esc(x.nature)}</div>` : ''}${x.voice ? `<div class="small muted">Речь: ${esc(x.voice)}</div>` : ''}</div></div>`).join('')}</div>` : ''}
    <p style="margin-top:12px"><button type="button" class="link" data-act="leg.open" data-id="${b.id}">Открыть Легенду →</button></p>`;
}
acts['leg.open'] = (d) => { closeSheet(); app().go('/legend/' + d.id); return false; };
acts['leg.peek'] = (d) => { openSheet('Легенда главы', legendPeek(bookOf(d.id), d.t), null); return false; };
