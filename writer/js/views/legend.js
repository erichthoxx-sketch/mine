// «Легенда» книги: идея, каркас по главам, персонажи. Сохраняется в книге (b.legend) и сама переписывается
// во вкладки Google Документа «Идея», «Каркас», «Персонажи» (в рукопись и подсчёт знаков они не входят).
// «Для нейросети» — можно копировать всю Легенду или отдельно Идею, Каркас, Персонажей, Синопсис.
import { esc, acts, changes, openSheet, closeSheet, opt, toast, uid, ask, download } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { resizeImage } from '../../../js/img.js';
import * as drive from '../drive.js';
import { chapterList, isAuthorTab } from '../wcalc.js';
import { findTab, contentToBlocks, blocksText, contentEnd, saveRequests } from '../docedit.js';
import { docxBlob, noYo } from '../publish.js';
import { synText, synSource } from '../synopsis.js';
import { cleanText } from '../../../js/cleantext.js';
import './pubfiles.js'; // «Скопировать» и «Word» синопсиса
import { IDEA_FIELDS, ROLES, PERSON, CHAR_FIELDS, LEGEND_TABS, PLAN_ST, planSt, isProl, chapterNums, legendOf, formatCharacterAge, legendContext, legendTemplate, applyTemplate, parsePlan, legendBlocks, blocksPlain, hashText, normText } from '../legend.js';

const app = () => window.__app;
const bookOf = (id) => app().ctx().wbooksById[id];
const isGDoc = (b) => !!b?.fileId && b.mimeType === drive.MIME.doc;
const grp = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const COLORS = ['#e8a5bd', '#9fc9a9', '#9cc0e4', '#bba7e6', '#efb79d', '#b9b5c0', '#e6c88f'];
const colorOf = (s) => COLORS[[...String(s || '?')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
const avatar = (c, size = 44) => c.photo ? `<img class="lg-av" src="${c.photo}" alt="" style="width:${size}px;height:${size}px">` : `<span class="lg-av" style="width:${size}px;height:${size}px;background:${colorOf(c.name)}">${esc(initials(c.name))}</span>`;
const ta = (attrs, v, ph) => `<textarea class="lg-ta" rows="1" ${attrs} placeholder="${esc(ph)}">${esc(v || '')}</textarea>`;

// переключатель «Книга / Легенда» — сверху страницы книги и Легенды
export const bookSeg = (b, on) => `<div class="bk-seg">${on === 'book' ? '<span class="on">Книга</span>' : `<a href="#" data-act="go" data-to="/book/${b.id}">Книга</a>`}${on === 'legend' ? '<span class="on">Легенда</span>' : `<a href="#" data-act="go" data-to="/legend/${b.id}">Легенда</a>`}</div>`;

export function legendPage(a, id) {
  const c = a.ctx(), b = c.wbooksById[id];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p></div>' };
  const L = legendOf(b), tab = a.ui.legTab || 'idea';
  const main = chapterList(b).filter((t) => !isAuthorTab(t.title));
  const tabs = [['idea', 'Идея'], ['plan', `Каркас${L.plan.length ? `<span class="lg-cnt"> · ${L.plan.length}</span>` : ''}`], ['chars', `Персонажи${L.chars.length ? `<span class="lg-cnt"> · ${L.chars.length}</span>` : ''}`], ['syn', 'Синопсис']];
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/books">← Все книги</a></p>
  <div class="lg-top"><h2 class="lg-book">${esc(b.title)}</h2>${bookSeg(b, 'legend')}</div>
  <div class="lg-bar"><div class="lg-tabs">${tabs.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-act="leg.tab" data-v="${k}">${t}</button>`).join('')}</div>
    <div class="lg-acts"><button class="dl" data-act="leg.ai" data-id="${b.id}">${ic('sparkle')}Для нейросети</button><button class="dl" data-act="leg.docx" data-id="${b.id}">${ic('download')}Word</button><button class="dl" data-act="leg.pdf" data-id="${b.id}">${ic('download')}PDF</button><button class="dl" data-act="leg.hist" data-id="${b.id}" title="Версии Легенды: сохранить и вернуть">${ic('timer')}Версии</button></div></div>
  ${syncLine(b, L)}
  ${tab === 'syn' ? synHtml(c, b) : tab === 'idea' ? ideaHtml(b, L) : tab === 'plan' ? planHtml(b, L, main) : charsHtml(b, L, main)}
  ${tab === 'syn' ? '' : `<div class="lg-tpl"><button class="dl" data-act="leg.tpl" data-id="${b.id}" data-p="${tab}">${ic('download')}Шаблон для нейросети</button><button class="dl" data-act="leg.tplin" data-id="${b.id}" data-p="${tab}">${ic('upload')}Загрузить ответ</button></div>`}`;
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
  // где лежит Легенда: сама — в Мастерской (сохраняется сразу); копия — во вкладках Google Документа (нужен Диск)
  const copy = !drive.hasFreshToken() ? 'копия во вкладках Google Документа обновится, когда подключите Диск' : t ? `копия во вкладках Google Документа — ${t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'копия во вкладках Google Документа появится после первой правки';
  const st = `Сохранено в Мастерской · ${copy}`;
  return `${parts.join('')}<div class="lg-sync small muted">${st}</div>`;
}

function ideaHtml(b, L) {
  // каждое поле — своя карточка, как глава в каркасе: заголовок и текст под ним
  return `<div class="lg-idea">${IDEA_FIELDS.map(([k, label, ph]) => `<div class="card lg-f"><label class="lg-l">${label}</label>${ta(`data-chg="leg.idea" data-id="${b.id}" data-k="${k}"`, L.idea?.[k], ph, k === 'logline' ? 1 : 2)}</div>`).join('')}</div>`;
}

function planHtml(b, L, main) {
  const opts = (sel) => `<option value="">—</option>${L.chars.map((x) => opt(x.id, x.name || 'Без имени', sel || '')).join('')}`;
  const nums = chapterNums(L.plan);
  const card = (p, i) => {
    const real = main[i];
    // глава с тем же номером в Документе: написана ли и сколько знаков
    const same = real && String(real.title).trim().toLowerCase() === String(p.title || '').trim().toLowerCase();
    const st = real ? `<span class="lg-st ok" title="${esc(real.title)} в Google Документе">${same ? 'написана' : esc(real.title)}${real.chars ? ` · ${grp(real.chars)} зн.` : ''}</span>` : '<span class="lg-st">ещё не написана</span>';
    const ps = planSt(p);
    const stSel = `<label class="lg-ps ps-${ps}" title="Статус решения"><span class="dot"></span><select data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="st" aria-label="Статус">${Object.entries(PLAN_ST).map(([k, v]) => opt(k, v, ps)).join('')}</select></label>`;
    const prol = isProl(p) && i === 0;
    return `<div class="card lg-ch${ps === 'no' ? ' lg-no' : ''}${prol ? ' lg-prol' : ''}"><div class="lg-ch-h"><span class="lg-n">${nums[i] ?? (prol ? 'П' : 'Э')}</span>${prol ? '<b class="lg-t lg-tfix">Пролог</b>' : `<input class="lg-t" value="${esc(p.title || '')}" placeholder="Название главы" data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="title">`}${stSel}${st}
      <span class="lg-mv"><button class="lg-ib" data-act="leg.move" data-id="${b.id}" data-i="${i}" data-d="-1" title="Выше" aria-label="Выше"${i ? '' : ' disabled'}>↑</button><button class="lg-ib" data-act="leg.move" data-id="${b.id}" data-i="${i}" data-d="1" title="Ниже" aria-label="Ниже"${i < L.plan.length - 1 ? '' : ' disabled'}>↓</button><button class="lg-ib" data-act="leg.ins" data-id="${b.id}" data-i="${i + 1}" title="Вставить главу после" aria-label="Вставить после">+</button><button class="lg-ib" data-act="leg.delp" data-id="${b.id}" data-i="${i}" title="Убрать из каркаса" aria-label="Убрать">${ic('trash')}</button></span></div>
      <span class="lg-sl">Что происходит</span>${ta(`data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="what"`, p.what, '2–3 строки, главное событие главы', 2)}
      <span class="lg-sl">Зачем эта глава</span>${ta(`data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="why"`, p.why, 'что меняется для героев, какой крючок в конце', 1)}
      <div class="lg-row">${L.chars.length ? `<label class="lg-pov">Глазами <select data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="pov">${opts(p.pov)}</select></label>` : ''}
        <label class="lg-pov"><select data-chg="leg.plan" data-id="${b.id}" data-i="${i}" data-k="person" aria-label="От какого лица">${opt('', 'лицо не выбрано', p.person || '')}${Object.entries(PERSON).map(([k, v]) => opt(k, v, String(p.person || ''))).join('')}</select></label></div></div>`;
  };
  // пролог — отдельным блоком перед первой главой; пока его нет — пустой блок, заполнится — станет частью каркаса
  const prolGhost = isProl(L.plan[0]) ? '' : `<div class="card lg-ch lg-prol lg-ghost"><div class="lg-ch-h"><span class="lg-n">П</span><b class="lg-t lg-tfix">Пролог</b><span class="lg-st">необязательно</span></div>
    <span class="lg-sl">Что происходит</span>${ta(`data-chg="leg.prol" data-id="${b.id}" data-k="what"`, '', '2–3 строки', 2)}
    <span class="lg-sl">Зачем пролог</span>${ta(`data-chg="leg.prol" data-id="${b.id}" data-k="why"`, '', 'какой крючок или тайну он задаёт', 1)}</div>`;
  return `${questionsHtml(b, L)}${prolGhost}${L.plan.map(card).join('')}
    <div class="lg-add"><button data-act="leg.ins" data-id="${b.id}" data-i="${L.plan.length}">+ Глава в каркас</button>${!L.plan.length && main.length ? `<button class="link" data-act="leg.fromCh" data-id="${b.id}">Создать по главам из Документа (${main.length})</button>` : ''}</div>`;
}

// «Открытые вопросы» — что ещё не решено в сюжете; у вопроса решение и отметка «утверждено»
function questionsHtml(b, L) {
  const qs = L.questions || [], open = qs.filter((q) => q.st !== 'ok').length;
  const row = (q) => `<div class="lg-q${q.st === 'ok' ? ' ok' : ''}">
    <div class="lg-q-h">${ta(`data-chg="leg.q" data-id="${b.id}" data-q="${q.id}" data-k="q"`, q.q, 'Вопрос: что ещё не решено в сюжете?', 1)}</div>
    ${ta(`data-chg="leg.q" data-id="${b.id}" data-q="${q.id}" data-k="a"`, q.a, 'Решение', 1)}
    <div class="lg-q-f">${q.st === 'ok' ? `<span class="lg-ps ps-ok"><span class="dot"></span>Утверждено</span><button class="link" data-act="leg.qst" data-id="${b.id}" data-q="${q.id}" data-v="open">снова обсуждать</button>` : `<span class="lg-ps ps-talk"><span class="dot"></span>Обсуждается</span>${q.a ? `<button class="link" data-act="leg.qst" data-id="${b.id}" data-q="${q.id}" data-v="ok">Утвердить решение</button>` : ''}`}
      <button class="lg-ib lg-q-del" data-act="leg.qdel" data-id="${b.id}" data-q="${q.id}" title="Убрать вопрос" aria-label="Убрать вопрос">${ic('trash')}</button></div></div>`;
  return `<details class="card lg-qs"${open || !qs.length ? ' open' : ''}><summary><b>Открытые вопросы</b><span class="muted">${qs.length ? ` · ${open ? `не решено ${open}` : 'все решены'}` : ''}</span></summary>
    ${qs.length ? '' : '<p class="small muted" style="margin:6px 0 0">Что ещё мешает начать писать: запишите вопрос, потом решение — и утвердите его. Утверждённое попадёт в рабочий контекст для нейросети.</p>'}
    ${qs.map(row).join('')}<div class="lg-add" style="margin-top:8px"><button data-act="leg.qadd" data-id="${b.id}">+ Вопрос</button></div></details>`;
}

// «Синопсис» — тот же текст, что везде в Мастерской (вкладка «Синопсис» Документа); изменить — в редакторе вкладки
function synHtml(c, b) {
  const t = synText(b), files = c.data.w_media.filter((m) => m.bookId === b.id && m.type === 'synopsis');
  const chars = t.replace(/\n/g, '').length;
  return `<div class="card lg-syn">
    <div class="row between lg-syn-h"><span class="small muted">${esc(synSource(b))}${t ? ` · ${grp(chars)} зн.` : ''}</span>
      <span class="lg-syn-acts"><button class="dl" data-act="syn.edit" data-id="${b.id}" data-back="/legend/${b.id}">${ic('pen')}${t ? 'Редактировать' : 'Написать'}</button>${t ? `<button class="dl" data-act="svc.copy" data-id="${b.id}" data-k="synopsis">${ic('copy')}Скопировать</button><button class="dl" data-act="svc.docx" data-id="${b.id}" data-k="synopsis">${ic('download')}Word</button>` : ''}${isGDoc(b) ? `<button class="dl" data-act="wbook.refreshOne" data-id="${b.id}" title="Подтянуть свежий текст из Google Документа">${ic('refresh')}Обновить</button>` : ''}</span></div>
    ${t ? `<div class="lg-syn-text">${t.split('\n').map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : `<p class="muted" style="margin:8px 0 0">Синопсиса пока нет. ${isGDoc(b) ? '«Написать» заведёт вкладку «Синопсис» в Google Документе книги и откроет её в редакторе.' : ''}</p>`}
    ${files.length ? `<div class="lg-syn-files"><div class="small muted">Загруженные файлы синопсиса</div>${files.map((m) => `<div class="item row between"><span>${ic('doc')} ${esc(m.name)}</span>${m.webViewLink ? `<a class="dl" href="${esc(m.webViewLink)}" target="_blank" rel="noopener">Открыть</a>` : ''}</div>`).join('')}</div>` : ''}
  </div>`;
}

function charsHtml(b, L, main) {
  const inCh = (id) => L.plan.map((p, i) => ((p.chars || []).includes(id) || p.pov === id ? i + 1 : 0)).filter(Boolean);
  return `<div class="lg-cards">${L.chars.map((x) => { const ch = inCh(x.id); return `<a href="#" class="card lg-card tap" data-act="leg.char" data-id="${b.id}" data-c="${x.id}">${avatar(x)}
    <span class="lg-cb"><b>${esc(x.name || 'Без имени')}</b><span class="lg-role">${[ROLES[x.role], formatCharacterAge(x.age) ? esc(formatCharacterAge(x.age)) : ''].filter(Boolean).join(' · ')}</span>
    ${x.nature || ch.length ? `<span class="lg-char-details">${x.nature ? `<span class="lg-sn">${esc(x.nature)}</span>` : ''}${ch.length ? `<span class="lg-in">в главах: ${ch.slice(0, 12).join(', ')}${ch.length > 12 ? '…' : ''}</span>` : ''}</span>` : ''}</span></a>`; }).join('')}
    <button class="card lg-card lg-new" data-act="leg.char" data-id="${b.id}">+ Персонаж</button></div>`;
}

// ---------- сохранение ----------
async function saveL(id, fn, { sync = true } = {}) {
  const b = bookOf(id), L = legendOf(b);
  await autoVersion(b);
  fn(L);
  await app().store.patch('w_books', b.id, { legend: L });
  if (sync) scheduleSync(id);
}
acts['leg.tab'] = (d) => { app().ui.legTab = d.v; };
changes['leg.idea'] = (v, el) => saveL(el.dataset.id, (L) => { L.idea = { ...L.idea, [el.dataset.k]: v }; });
changes['leg.plan'] = (v, el) => saveL(el.dataset.id, (L) => { const i = Number(el.dataset.i); L.plan = L.plan.map((p, j) => (j === i ? { ...p, [el.dataset.k]: v } : p)); });
acts['leg.pchar'] = (d) => saveL(d.id, (L) => { const i = Number(d.i); L.plan = L.plan.map((p, j) => { if (j !== i) return p; const s = new Set(p.chars || []); if (s.has(d.c)) s.delete(d.c); else s.add(d.c); return { ...p, chars: [...s] }; }); });
acts['leg.ins'] = (d) => saveL(d.id, (L) => { const i = Number(d.i); L.plan = [...L.plan.slice(0, i), { id: uid(), title: '', what: '', why: '', pov: '', chars: [], st: 'talk' }, ...L.plan.slice(i)]; });
// пролог: первая запись в пустой блок — пролог встаёт в начало каркаса
changes['leg.prol'] = (v, el) => { if (!String(v).trim()) return; saveL(el.dataset.id, (L) => { if (isProl(L.plan[0])) L.plan[0] = { ...L.plan[0], [el.dataset.k]: v }; else L.plan = [{ id: uid(), title: 'Пролог', what: '', why: '', pov: '', chars: [], st: 'talk', [el.dataset.k]: v }, ...L.plan]; }); };
// вопросы
changes['leg.q'] = (v, el) => saveL(el.dataset.id, (L) => { L.questions = (L.questions || []).map((q) => (q.id === el.dataset.q ? { ...q, [el.dataset.k]: v } : q)); });
acts['leg.qadd'] = (d) => { saveL(d.id, (L) => { L.questions = [...(L.questions || []), { id: uid(), q: '', a: '', st: 'open' }]; }); setTimeout(() => { const l = [...document.querySelectorAll('.lg-q textarea[data-k="q"]')].pop(); l?.focus(); }, 80); };
acts['leg.qst'] = (d) => saveL(d.id, (L) => { L.questions = (L.questions || []).map((q) => (q.id === d.q ? { ...q, st: d.v } : q)); });
acts['leg.qdel'] = async (d) => {
  const q0 = (legendOf(bookOf(d.id)).questions || []).find((q) => q.id === d.q);
  await saveL(d.id, (L) => { L.questions = (L.questions || []).filter((q) => q.id !== d.q); });
  toast('Вопрос убран', { undo: () => saveL(d.id, (L) => { L.questions = [...(L.questions || []), q0]; }) });
};
acts['leg.move'] = (d) => saveL(d.id, (L) => { const i = Number(d.i), j = i + Number(d.d); if (j < 0 || j >= L.plan.length) return; const p = [...L.plan]; [p[i], p[j]] = [p[j], p[i]]; L.plan = p; });
acts['leg.delp'] = async (d) => {
  const L0 = legendOf(bookOf(d.id)), i = Number(d.i), item = L0.plan[i];
  if ((item.what || item.why) && !(await ask('Убрать эту главу из каркаса?', 'Убрать'))) return false;
  await saveL(d.id, (L) => { L.plan = L.plan.filter((_, j) => j !== i); });
  toast('Убрано из каркаса', { undo: () => saveL(d.id, (L) => { L.plan = [...L.plan.slice(0, i), item, ...L.plan.slice(i)]; }) });
};
acts['leg.fromCh'] = (d) => saveL(d.id, (L) => { L.plan = chapterList(bookOf(d.id)).filter((t) => !isAuthorTab(t.title)).map((t) => ({ id: uid(), title: t.title, what: t.lead || '', why: '', pov: '', chars: [] })); });

// Просмотр фото поверх формы персонажа, без закрытия и потери несохранённых полей.
function showCharacterPhoto(src, name) {
  if (!src) return;
  let dlg = document.getElementById('lgPhotoViewer');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'lgPhotoViewer';
    dlg.className = 'lg-photo-viewer';
    dlg.setAttribute('aria-label', 'Просмотр фото персонажа');
    dlg.innerHTML = '<button type="button" class="lg-photo-close" aria-label="Закрыть просмотр">×</button><img alt=""><p class="lg-photo-hint" role="status"></p>';
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('.lg-photo-close')) dlg.close();
    });
    document.body.appendChild(dlg);
  }
  const img = dlg.querySelector('img');
  const hint = dlg.querySelector('.lg-photo-hint');
  hint.textContent = '';
  img.onload = () => {
    hint.textContent = img.naturalWidth < 400 ? 'Это старое фото сохранено в низком разрешении. Для четкого увеличения замените его исходным файлом.' : '';
  };
  img.src = src;
  img.alt = name ? 'Фото персонажа ' + name : 'Фото персонажа';
  dlg.showModal();
}

// персонаж — окно с полями и подсказками
acts['leg.char'] = (d) => {
  const L = legendOf(bookOf(d.id)), x = L.chars.find((y) => y.id === d.c) || { id: '', role: L.chars.length ? 'side' : 'heroine' };
  const photoButton = x.photo ? `<button type="button" class="lg-photo-open" aria-label="Увеличить фото персонажа" title="Увеличить фото">${avatar(x, 64)}</button>` : avatar(x, 64);
  const f = openSheet(x.id ? x.name || 'Персонаж' : 'Новый персонаж', `
    <div class="lg-ch-top">${photoButton}<label class="link lg-photo">${x.photo ? 'Заменить фото' : 'Добавить фото'}<input type="file" accept="image/*" name="photoFile" hidden></label>${x.photo ? '<label class="check"><input type="checkbox" name="nophoto">убрать фото</label>' : ''}</div>
    <div class="f2"><div><label for="lcn">Имя</label><input id="lcn" name="name" value="${esc(x.name || '')}" required placeholder="Анна Лебедева"></div>
    <div><label for="lcr">Роль</label><select id="lcr" name="role">${Object.entries(ROLES).map(([k, v]) => opt(k, v, x.role)).join('')}</select></div></div>
    ${CHAR_FIELDS.map(([k, label, ph]) => k === 'age' ? `<label for="lc_${k}">${label}</label><input id="lc_${k}" name="${k}" value="${esc(x[k] || '')}" placeholder="${ph}" inputmode="numeric">` : `<label for="lc_${k}">${label}</label><textarea id="lc_${k}" class="lg-ta" name="${k}" rows="2" placeholder="${esc(ph)}">${esc(x[k] || '')}</textarea>`).join('')}
    ${x.id ? `<p style="margin-top:14px"><button type="button" class="link danger" data-act="leg.delc" data-id="${d.id}" data-c="${x.id}">Удалить персонажа</button></p>` : ''}`, async (fd) => {
    const name = String(fd.get('name') || '').trim();
    if (!name) { toast('Как зовут персонажа?'); return false; }
    const v = { ...x, id: x.id || uid(), name, role: fd.get('role') };
    for (const [k] of CHAR_FIELDS) v[k] = String(fd.get(k) || '').trim();
    const file = fd.get('photoFile');
    if (file && file.size) { try { v.photo = await resizeImage(file, 960, 0.88); } catch { toast('Не удалось обработать фото — изменения не сохранены'); return false; } }
    if (fd.get('nophoto')) v.photo = '';
    try {
      await saveL(d.id, (L) => { L.chars = x.id ? L.chars.map((y) => (y.id === x.id ? v : y)) : [...L.chars, v]; });
    } catch (e) {
      toast('Не удалось сохранить карточку и фото: ' + (e.message || 'ошибка'));
      return false;
    }
    toast(x.id ? 'Сохранено' : `${name} — в Легенде`);
  }, { submitText: x.id ? 'Сохранить' : 'Добавить' });
  f?.querySelectorAll('.lg-ta').forEach(grow);
  f?.querySelector('.lg-photo-open')?.addEventListener('click', (e) => {
    showCharacterPhoto(e.currentTarget.querySelector('img')?.src, x.name);
  });
  // Новое фото видно сразу после выбора: старую миниатюру больше не принимаем за новую.
  const photoInput = f?.querySelector('input[name="photoFile"]');
  let previewUrl = null;
  photoInput?.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    let open = f.querySelector('.lg-photo-open');
    if (!open) {
      const old = f.querySelector('.lg-ch-top .lg-av');
      open = document.createElement('button');
      open.type = 'button';
      open.className = 'lg-photo-open';
      open.setAttribute('aria-label', 'Увеличить фото персонажа');
      open.title = 'Увеличить фото';
      old?.replaceWith(open);
      open.addEventListener('click', () => showCharacterPhoto(open.querySelector('img')?.src, x.name));
    }
    const image = document.createElement('img');
    image.className = 'lg-av';
    image.style.width = '64px';
    image.style.height = '64px';
    image.alt = '';
    image.src = previewUrl;
    open.replaceChildren(image);
    const rm = f.querySelector('input[name="nophoto"]');
    if (rm) rm.checked = false;
    let note = f.querySelector('.lg-photo-new-note');
    if (!note) {
      note = document.createElement('span');
      note.className = 'lg-photo-new-note';
      f.querySelector('.lg-ch-top')?.append(note);
    }
    note.textContent = 'Фото выбрано — нажмите «Сохранить»';
  });
  document.getElementById('sheet')?.addEventListener('close', () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, { once: true });
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
  const sections = [['all', 'Все'], ['idea', 'Идея'], ['plan', 'Каркас'], ['chars', 'Персонажи'], ['syn', 'Синопсис']];
  const f = openSheet('Легенда для нейросети', `<p class="small muted" style="margin-top:0">Выберите раздел Легенды, затем скопируйте готовый текст для нейросети.</p>
    <div class="idea-seg lg-mode"><button type="button" class="on" data-m="work">Рабочий</button><button type="button" data-m="full">Полный</button></div>
    <p class="small muted lg-mode-h">Только утвержденное: канон, персонажи, решения. Варианты и отвергнутое сюда не попадают.</p>
    <div class="lg-export-label">Что скопировать</div>
    <div class="lg-export-sections" role="group" aria-label="Разделы Легенды">
      ${sections.map(([key, label]) => `<button type="button" class="lg-export-choice${key === 'all' ? ' on' : ''}" data-section="${key}" aria-pressed="${key === 'all'}">${label}</button>`).join('')}
    </div>
    <textarea id="lgtext" class="lg-ai" readonly rows="14" aria-label="Текст выбранного раздела"></textarea>
    <div class="dl-row"><button type="button" class="primary" data-act="leg.copy">${ic('copy')} Скопировать</button></div>`, null);
  let mode = 'work', selected = 'all';
  const upd = () => {
    const parts = selected === 'all' ? ['idea', 'plan', 'chars', 'syn'] : [selected];
    f.querySelector('#lgtext').value = legendContext(L, { title: b.title, mode, sections: parts, synopsis: synText(b) });
  };
  f.querySelectorAll('.lg-mode button').forEach((x) => x.addEventListener('click', () => {
    mode = x.dataset.m;
    f.querySelectorAll('.lg-mode button').forEach((y) => y.classList.toggle('on', y === x));
    f.querySelector('.lg-mode-h').textContent = mode === 'work'
      ? 'Только утвержденное: канон, персонажи, решения. Варианты и отвергнутое сюда не попадают.'
      : 'Всё с пометками: утвержденное, варианты «обсуждается», открытые вопросы и отдельно — отвергнутое.';
    upd();
  }));
  f.querySelectorAll('.lg-export-choice').forEach((x) => x.addEventListener('click', () => {
    selected = x.dataset.section;
    f.querySelectorAll('.lg-export-choice').forEach((y) => {
      const on = y === x;
      y.classList.toggle('on', on);
      y.setAttribute('aria-pressed', String(on));
    });
    upd();
  }));
  upd();
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
  await app().store.patch('w_books', nb.id, { legend: { ...legendOf(nb), sync, conflicts, syncedAt: new Date().toISOString() } });
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

// ---------- версии Легенды (коллекция w_legver): автоснимок не чаще раза в 30 минут + «Сохранить версию» с комментарием ----------
const AUTO_EVERY = 30 * 60000, AUTO_KEEP = 30;
const pure = (L) => ({ idea: L.idea || {}, plan: L.plan || [], chars: L.chars || [], questions: L.questions || [] });
const versionsOf = (bookId) => app().ctx().data.w_legver.filter((v) => v.bookId === bookId).sort((x, y) => y.at.localeCompare(x.at));
const isEmpty = (L) => !L.plan.length && !L.chars.length && !(L.questions || []).length && !Object.values(L.idea || {}).some((v) => String(v || '').trim());
async function putVersion(b, note = '', auto = false) {
  await app().store.put('w_legver', { id: 'v' + uid(), bookId: b.id, at: new Date().toISOString(), note, auto, legend: pure(legendOf(b)) });
}
async function autoVersion(b) {
  const L = legendOf(b);
  if (isEmpty(L)) return;
  const last = versionsOf(b.id)[0];
  if (last && Date.now() - Date.parse(last.at) < AUTO_EVERY) return;
  await putVersion(b, '', true);
  for (const v of versionsOf(b.id).filter((x) => x.auto).slice(AUTO_KEEP)) await app().store.remove('w_legver', v.id);
}
const vSum = (L) => [`глав ${L.plan?.length || 0}`, `персонажей ${L.chars?.length || 0}`, (L.questions || []).length ? `вопросов ${L.questions.length}` : ''].filter(Boolean).join(' · ');
function histSheet(id) {
  const b = bookOf(id), list = versionsOf(id);
  const when = (iso) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  openSheet('Версии Легенды', `<div class="lg-vform"><input id="lgvn" placeholder="Комментарий, например: до перестройки каркаса" autocomplete="off"><button type="button" class="primary" data-act="leg.vsave" data-id="${id}">Сохранить версию</button></div>
    <p class="small muted" style="margin:6px 0 10px">Приложение и само сохраняет версию перед правками — не чаще раза в полчаса, последние ${AUTO_KEEP}.</p>
    ${list.length ? `<div class="list">${list.map((v) => `<div class="item row between lg-v"><span><b>${esc(v.note || (v.auto ? 'Автосохранение' : 'Версия'))}</b><span class="sub">${when(v.at)} · ${vSum(v.legend)}</span></span><button class="small-btn" data-act="leg.vback" data-id="${id}" data-v="${v.id}">Вернуть</button></div>`).join('')}</div>` : '<p class="muted">Версий пока нет.</p>'}
    <div class="lg-vfoot"><button type="button" class="dl" data-act="leg.bak" data-id="${id}">${ic('download')}Скачать копию книги</button><label class="dl">${ic('folder')}Восстановить из копии<input type="file" accept=".json,application/json" hidden data-chg="leg.bakin" data-id="${id}"></label></div>`, null);
}
acts['leg.hist'] = (d) => { histSheet(d.id); return false; };
acts['leg.vsave'] = async (d) => {
  const note = (document.getElementById('lgvn')?.value || '').trim();
  await putVersion(bookOf(d.id), note || 'Сохранено вручную', false);
  toast('Версия сохранена'); histSheet(d.id); return false;
};
acts['leg.vback'] = async (d) => {
  const v = app().ctx().data.w_legver.find((x) => x.id === d.v);
  if (!v || !(await ask('Вернуть Легенду к этой версии? Нынешняя сохранится в версиях — её тоже можно будет вернуть.', 'Вернуть'))) return false;
  await putVersion(bookOf(d.id), 'Перед возвратом к другой версии', true);
  await saveL(d.id, (L) => { Object.assign(L, pure(v.legend)); });
  closeSheet(); toast('Легенда возвращена к версии');
  return false;
};
// копия книги одним файлом: книга с Легендой, её идеи и версии Легенды (текст глав — в Google Документе и в «Архиве книг»)
acts['leg.bak'] = async (d) => {
  const c = app().ctx(), b = bookOf(d.id);
  const data = { kind: 'masterskaya-book', v: 1, at: new Date().toISOString(), book: b, ideas: c.data.w_ideas.filter((x) => x.bookId === b.id), legver: versionsOf(b.id) };
  if (await download(`kopiya_${latin(b.title)}_${c.today}.json`, new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'application/json')) toast('Копия книги скачана'); // Blob — текст как есть, с «ё»
  return false;
};
changes['leg.bakin'] = async (v, el) => {
  const file = el.files?.[0]; if (!file) return;
  let data; try { data = JSON.parse(await file.text()); } catch { toast('Это не файл копии книги'); return; }
  if (data?.kind !== 'masterskaya-book' || !data.book?.legend) { toast('Это не файл копии книги'); return; }
  if (!(await ask(`Вернуть Легенду из копии «${data.book.title}» от ${new Date(data.at).toLocaleDateString('ru-RU')}? Нынешняя сохранится в версиях.`, 'Вернуть'))) return;
  await putVersion(bookOf(el.dataset.id), 'Перед восстановлением из копии', true);
  await saveL(el.dataset.id, (L) => { Object.assign(L, pure(data.book.legend)); });
  closeSheet(); toast('Легенда восстановлена из копии');
};

// ---------- шаблон вкладки для нейросети: скопировать/скачать → нейросеть заполняет → «Загрузить ответ» ----------
const TPL_NAME = { idea: 'Идея', plan: 'Каркас', chars: 'Персонажи' };
acts['leg.tpl'] = (d) => {
  const b = bookOf(d.id), text = legendTemplate(legendOf(b), d.p, b.title);
  openSheet(`Шаблон для нейросети — ${TPL_NAME[d.p]}`, `<p class="small muted" style="margin-top:0">Скопируйте и вставьте в чат с любой нейросетью — она заполнит поля в том же виде. Её ответ загрузите кнопкой «Загрузить ответ» — поля вкладки «${TPL_NAME[d.p]}» заполнятся сами.</p>
    <textarea id="lgtpl" class="lg-ai" readonly rows="14">${esc(text)}</textarea>
    <div class="dl-row"><button type="button" class="primary" data-act="leg.tplcopy">${ic('copy')} Скопировать</button><button type="button" class="dl" data-act="leg.tpldl" data-id="${d.id}" data-p="${d.p}">${ic('download')}Скачать файлом</button></div>`, null);
  return false;
};
acts['leg.tplcopy'] = async () => { const t = document.getElementById('lgtpl')?.value || ''; try { await navigator.clipboard.writeText(t); toast('Шаблон скопирован — вставьте в чат с нейросетью'); } catch { document.getElementById('lgtpl')?.select(); toast('Выделено — нажмите Ctrl+C'); } return false; };
// файлом — как есть, с «ё» (Blob): ответ потом вернётся в Легенду без искажений
acts['leg.tpldl'] = async (d) => { const b = bookOf(d.id); const blob = new Blob([legendTemplate(legendOf(b), d.p, b.title)], { type: 'text/plain' }); if (await download(`shablon_${latin(TPL_NAME[d.p])}_${latin(b.title)}.txt`, blob, 'text/plain')) toast('Шаблон скачан'); return false; };
// текст из файла: .txt / .md как есть, Word (.docx) — абзацы из document.xml
async function fileText(file) {
  if (/\.docx$/i.test(file.name)) {
    const zip = await (await drive.loadJsZip()).loadAsync(await file.arrayBuffer());
    const xml = await zip.file('word/document.xml').async('string');
    const dec = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    return (xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []).map((p) => dec((p.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join(''))).join('\n');
  }
  return file.text();
}
acts['leg.tplin'] = (d) => {
  const f = openSheet(`Ответ нейросети — ${TPL_NAME[d.p]}`, `<p class="small muted" style="margin-top:0">Вставьте ответ нейросети целиком или выберите файл. Поля вкладки «${TPL_NAME[d.p]}» заполнятся сами; прежний вариант сохранится в «Версиях».</p>
    <textarea id="lgans" name="t" class="lg-ai" rows="12" placeholder="Вставьте сюда ответ нейросети"></textarea>
    <label class="dl lg-file">${ic('folder')}Выбрать файл (.txt, .md, Word)<input type="file" accept=".txt,.md,.docx,text/plain,text/markdown" hidden id="lgansf"></label>`, async (fd) => {
    const text = String(fd.get('t') || '');
    const b = bookOf(d.id), L0 = legendOf(b), r = applyTemplate(L0, d.p, cleanText(text).text, uid); // ответ нейросети — без невидимых символов
    if (!r.n) { toast('Не нашла в ответе полей шаблона — проверьте, что нейросеть сохранила строки с ## и ###'); return false; }
    await putVersion(b, `Перед загрузкой ответа нейросети (${TPL_NAME[d.p]})`, true);
    await saveL(d.id, (L) => { Object.assign(L, { idea: r.legend.idea, plan: r.legend.plan, chars: r.legend.chars, questions: r.legend.questions }); });
    toast(`Заполнено из ответа: ${r.n}`, { undo: () => saveL(d.id, (L) => { Object.assign(L, pure(L0)); }) });
  }, { submitText: 'Заполнить' });
  f?.querySelector('#lgansf')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try { f.querySelector('#lgans').value = await fileText(file); toast('Файл загружен — нажмите «Заполнить»'); } catch { toast('Не получилось прочитать файл'); }
  });
  return false;
};
