import { esc, acts, changes, openSheet, opt, toast, uid, ask, download } from '../../../js/ui.js';
import { fmtDate } from '../../../js/format.js';
import { resizeImage } from '../../../js/img.js';
import { ic } from '../../../js/icons.js';
import * as drive from '../drive.js';
import { STATUS } from './books.js';
import { widgetCard } from './widgets.js';
import { svcInfo } from './pubfiles.js';

const app = () => window.__app;
export const MTYPES = { banner: 'Баннер для постов', cover: 'Обложка', target: 'Креатив для таргета', manuscript: 'Рукопись', synopsis: 'Синопсис', other: 'Другое' };
const isImg = (m) => !!m.thumb;

// Тексты для продвижения книги: всё, что нужно под рукой для постов, рекламы и конкурсов
const PROMO = { annotation: 'Аннотация', short: 'Короткий анонс для поста', tags: 'Теги и хэштеги', quotes: 'Цитаты для постов' };
const promoOf = (b) => b.promo || {};
const promoFilled = (b) => Object.keys(PROMO).filter((k) => (promoOf(b)[k] || '').trim()).length;
// Яндекс Директ: ограничения длины
const DIRECT = { h1: 56, h2: 30, text: 81 };
const directOf = (b) => b.direct || { ads: [] };
const mediaOf = (c, b, types) => c.data.w_media.filter((m) => m.bookId === b.id && types.includes(m.type)).sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));

// ---------- список книг: по статусам, с поиском и готовностью материалов ----------
export function marketingView(a) {
  const c = a.ctx(), st = a.ui.mSt || 'progress', q = (a.ui.mQ || '').toLowerCase();
  const by = (s) => c.wbooks.filter((b) => (b.status || 'progress') === s);
  const list = (st === 'all' ? c.wbooks : by(st)).filter((b) => !q || b.title.toLowerCase().includes(q));
  const chip = (k, label, n) => `<button class="chip${st === k ? ' on' : ''}" data-act="mk.st" data-v="${k}">${label}${n != null ? ` · ${n}` : ''}</button>`;
  const html = `<h2>Маркетинг</h2>
  <div class="chips">${chip('progress', 'В процессе', by('progress').length)}${chip('done', 'Завершённые', by('done').length)}${chip('idea', 'Идеи', by('idea').length)}${chip('all', 'Все', c.wbooks.length)}</div>
  ${c.wbooks.length > 6 ? `<input type="search" value="${esc(a.ui.mQ || '')}" placeholder="Найти книгу" data-chg="mk.q" aria-label="Найти книгу" style="margin-bottom:10px">` : ''}
  ${list.length ? `<div class="card list">${list.map((b) => bookRow(c, b)).join('')}</div>` : `<div class="card"><p class="muted" style="margin:0">${c.wbooks.length ? 'В этой группе книг нет.' : 'Книг пока нет — добавьте их на вкладке «Книги».'}</p></div>`}
  <div class="hint">У каждой книги три блока: тексты для постов, материалы для таргета (Яндекс Директ) и пакет для издательства.</div>
  <div style="margin-top:16px">${widgetCard(c)}</div>`;
  return { html };
}
function bookRow(c, b) {
  const t = mediaOf(c, b, ['target']).length, d = directOf(b).ads.length;
  const man = !!b.fileId || mediaOf(c, b, ['manuscript']).length, syn = !!(b.synopsis || '').trim() || mediaOf(c, b, ['synopsis']).length;
  const mark = (ok) => (ok ? '<span class="up">✓</span>' : '<span class="muted">—</span>');
  return `<a class="item mk-row" href="#" data-act="go" data-to="/mk/${b.id}">
    <span class="mk-cover">${b.cover ? `<img src="${b.cover}" alt="">` : `<span>${esc(b.title.slice(0, 1))}</span>`}</span>
    <span class="mk-info"><b>${esc(b.title)}</b>
      <span class="sub">Тексты ${promoFilled(b)}/${Object.keys(PROMO).length} · Таргет: ${t} креат., ${d} объявл. · Издательство: рукопись ${mark(man)} синопсис ${mark(syn)}</span></span></a>`;
}
// сводка готовности маркетинга — для страницы книги
export function mkSummary(c, b) {
  return {
    texts: promoFilled(b), textsAll: Object.keys(PROMO).length,
    banners: mediaOf(c, b, ['banner', 'cover']).length,
    creatives: mediaOf(c, b, ['target']).length, ads: directOf(b).ads.length,
    manuscript: !!b.fileId || mediaOf(c, b, ['manuscript']).length > 0,
    synopsis: svcInfo(b, 'synopsis').ok || mediaOf(c, b, ['synopsis']).length > 0,
    annotation: svcInfo(b, 'annotation').ok,
  };
}
acts['mk.go'] = (d) => { app().ui.mTab = d.tab || 'texts'; app().go('/mk/' + d.id); };
changes['mk.q'] = (v) => { app().ui.mQ = v.trim(); app().rerender(); };
acts['mk.st'] = (d) => { app().ui.mSt = d.v; };

// ---------- страница книги: три блока ----------
export function bookMarketing(a, id) {
  const c = a.ctx(), b = c.wbooksById[id];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p></div>' };
  const t = a.ui.mTab || 'texts';
  const tab = (k, label) => `<button class="chip${t === k ? ' on' : ''}" data-act="mk.tab" data-v="${k}">${label}</button>`;
  const body = t === 'target' ? targetBlock(c, b) : t === 'pub' ? pubBlock(c, b) : textsBlock(c, b);
  const html = `<p><a class="btn back" href="#" data-act="go" data-to="/marketing">← Маркетинг</a></p>
  <div class="row" style="gap:12px;margin-bottom:10px"><span class="mk-cover big">${b.cover ? `<img src="${b.cover}" alt="">` : `<span>${esc(b.title.slice(0, 1))}</span>`}</span>
    <div><h2 style="margin:0">${esc(b.title)}</h2><div class="small muted">${STATUS[b.status] || STATUS.progress}</div></div></div>
  <div class="chips">${tab('texts', 'Тексты и баннеры')}${tab('target', 'Для таргета')}${tab('pub', 'Для издательства')}</div>
  ${body}`;
  return { html };
}
acts['mk.tab'] = (d) => { app().ui.mTab = d.v; };

const gallery = (items) => (items.length ? `<div class="gallery">${items.map((m) => `<button class="g-item" data-act="mk.open" data-id="${m.id}"><img src="${m.thumb}" alt="${esc(m.name || '')}"></button>`).join('')}</div>` : '');
const upBtn = (b, type, label, accept = 'image/*') => `<label class="btn">${label}<input type="file" accept="${accept}" multiple data-chg="mk.upload" data-book="${b.id}" data-type="${type}" hidden></label>`;
const driveNote = (c) => (drive.isConnected() && c.settings.wMarketingFolder ? '' : '<p class="small muted">Оригиналы файлов сохраняются на Google Диск (папка для маркетинга выбирается в настройках — шестерёнка вверху). Без Диска сохранится только уменьшенная копия картинок, а файлы рукописи и синопсиса загрузить нельзя.</p>');

// Тексты для постов + баннеры и обложки
function textsBlock(c, b) {
  const p = promoOf(b);
  return `<div class="card"><div class="row between"><h2 style="margin:0">Тексты для продвижения</h2><button data-act="mk.promo" data-id="${b.id}">Изменить</button></div>
    <div class="list">${Object.entries(PROMO).map(([k, label]) => { const v = (p[k] || '').trim();
      return `<div class="item"><div class="row between"><span class="small muted">${label}</span>${v ? `<button class="link" style="padding:0" data-act="copy" data-text="${esc(v)}">копировать</button>` : ''}</div>${v ? `<div class="idea-text">${esc(v)}</div>` : '<div class="small muted">не заполнено</div>'}</div>`; }).join('')}</div></div>
  <div class="card"><div class="row between"><h2 style="margin:0">Баннеры и обложки для постов</h2>${upBtn(b, 'banner', '+ Загрузить')}</div>
    ${gallery(mediaOf(c, b, ['banner', 'cover', 'other'])) || '<p class="small muted" style="margin:8px 0 0">Пока пусто.</p>'}</div>
  ${driveNote(c)}`;
}

// Для таргета: креативы и тексты объявлений для Яндекс Директа, пакет для таргетолога одной кнопкой
function targetBlock(c, b) {
  const dr = directOf(b), cr = mediaOf(c, b, ['target']);
  const len = (s, max) => `<span class="${(s || '').length > max ? 'down' : 'muted'}">${(s || '').length}/${max}</span>`;
  return `<div class="card"><div class="row between"><h2 style="margin:0">Креативы</h2>${upBtn(b, 'target', '+ Загрузить')}</div>
    ${gallery(cr) || '<p class="small muted" style="margin:8px 0 0">Загрузите баннеры для рекламы — квадрат 1:1, горизонтальный 16:9 и вертикальный 9:16 подходят для Яндекс Директа.</p>'}</div>
  <div class="card"><div class="row between"><h2 style="margin:0">Объявления для Яндекс Директа</h2><button data-act="mk.ad" data-id="${b.id}">+ Объявление</button></div>
    ${dr.ads.length ? `<div class="list">${dr.ads.map((x, i) => `<div class="item"><div class="row between"><b>${esc(x.h1 || 'Без заголовка')}</b><button class="link" style="padding:0" data-act="mk.ad" data-id="${b.id}" data-i="${i}">изменить</button></div>
      ${x.h2 ? `<div>${esc(x.h2)}</div>` : ''}<div class="small">${esc(x.text || '')}</div>
      <div class="small">Заголовок ${len(x.h1, DIRECT.h1)} · доп. заголовок ${len(x.h2, DIRECT.h2)} · текст ${len(x.text, DIRECT.text)}</div></div>`).join('')}</div>` : '<p class="small muted" style="margin:8px 0 0">Добавьте 2–4 варианта: таргетолог запустит их и оставит лучший.</p>'}
    <h3>Для таргетолога</h3>
    <div class="kv"><div><span>Ссылка на книгу</span><b>${dr.link ? esc(dr.link) : '—'}</b></div><div><span>Аудитория</span><b>${dr.audience ? esc(dr.audience) : '—'}</b></div></div>
    ${dr.notes ? `<p class="small" style="margin:0 0 8px">${esc(dr.notes)}</p>` : ''}
    <div class="row"><button data-act="mk.brief" data-id="${b.id}">Ссылка, аудитория, пожелания</button></div></div>
  <div class="card"><h2>Отправить таргетологу</h2>
    <p class="small muted" style="margin-top:0">Один архив: креативы (оригиналы с Диска) и файл с текстами объявлений, ссылкой и пожеланиями — удобно переслать и скопировать.</p>
    <div class="row"><button class="primary" data-act="mk.targetZip" data-id="${b.id}">Скачать пакет для таргетолога</button><button data-act="mk.targetCopy" data-id="${b.id}">Скопировать тексты</button>${b.mkFolders?.target ? `<a class="btn" href="${esc(b.mkFolders.target.link)}" target="_blank" rel="noopener">${ic('folder')} Папка на Диске</a>` : ''}</div></div>
  ${driveNote(c)}`;
}

// Для издательства: рукопись, синопсис, аннотация — и всё одним архивом
function pubBlock(c, b) {
  const man = mediaOf(c, b, ['manuscript']), syn = mediaOf(c, b, ['synopsis']);
  const fileRow = (m) => `<div class="item row between"><span>${ic('doc')} ${esc(m.name)}<span class="sub">${fmtDate((m.createdAt || '').slice(0, 10))}</span></span><span class="row">${m.webViewLink ? `<a class="btn" href="${esc(m.webViewLink)}" target="_blank" rel="noopener">Открыть</a>` : ''}<button class="link danger" data-act="mk.del" data-id="${m.id}">убрать</button></span></div>`;
  const ok = drive.isConnected() && c.settings.wMarketingFolder;
  return `<div class="card"><h2>Рукопись</h2>
    ${b.fileId ? `<div class="item row between"><span>${ic('doc')} Текст книги из Google Документа<span class="sub">в пакет — в формате Word, всегда свежая версия</span></span>${b.webViewLink ? `<a class="btn" href="${esc(b.webViewLink)}" target="_blank" rel="noopener">Открыть</a>` : ''}</div>` : ''}
    <div class="list">${man.map(fileRow).join('')}</div>
    <div class="row" style="margin-top:8px">${ok ? upBtn(b, 'manuscript', '+ Загрузить файл рукописи', '.doc,.docx,.pdf,.rtf,.odt,.txt') : ''}</div></div>
  <div class="card"><div class="row between"><h2 style="margin:0">Синопсис</h2><button data-act="mk.synopsis" data-id="${b.id}">${(b.synopsis || '').trim() ? 'Изменить' : 'Написать'}</button></div>
    ${(b.synopsis || '').trim() ? `<div class="idea-text">${esc(b.synopsis)}</div>` : '<p class="small muted" style="margin:6px 0 0">Можно написать здесь или загрузить готовый файл.</p>'}
    <div class="list">${syn.map(fileRow).join('')}</div>
    <div class="row" style="margin-top:8px">${ok ? upBtn(b, 'synopsis', '+ Загрузить файл синопсиса', '.doc,.docx,.pdf,.rtf,.odt,.txt') : ''}</div></div>
  <div class="card"><h2>Отправить в издательство</h2>
    <p class="small muted" style="margin-top:0">Архив: рукопись одним файлом Word в оформлении для издательства и синопсис из вкладки «Синопсис».</p>
    <div class="row"><button class="primary" data-act="mk.pubZip" data-id="${b.id}">Скачать пакет для издательства</button>${b.mkFolders?.pub ? `<a class="btn" href="${esc(b.mkFolders.pub.link)}" target="_blank" rel="noopener">${ic('folder')} Папка на Диске</a>` : ''}</div></div>
  ${driveNote(c)}`;
}

// ---------- сохранение файлов: уменьшенная копия картинки — в базу, оригинал — в папку книги на Диске ----------
const FOLDER = { target: 'Таргет', manuscript: 'Издательство', synopsis: 'Издательство', banner: 'Посты', cover: 'Посты', other: 'Посты' };
async function bookFolder(b, type) {
  const c = app().ctx(), root = c.settings.wMarketingFolder;
  if (!root || !drive.hasFreshToken()) return null;
  const bf = await drive.ensureFolder(b.title, root);
  const sub = await drive.ensureFolder(FOLDER[type] || 'Посты', bf.id);
  const key = type === 'target' ? 'target' : type === 'manuscript' || type === 'synopsis' ? 'pub' : 'posts';
  if (!b.mkFolders?.[key]) await app().store.put('w_books', { ...app().ctx().wbooksById[b.id], mkFolders: { ...(b.mkFolders || {}), [key]: { id: sub.id, link: sub.webViewLink } } });
  return sub.id;
}
export async function saveMedia(file, { type = 'banner', bookId = '', thumb } = {}) {
  const c = app().ctx(), b = bookId ? c.wbooksById[bookId] : null;
  const image = /^image\//.test(file.type);
  const item = { id: 'm' + uid(), name: file.name, type, bookId, mime: file.type, thumb: image ? (thumb || await resizeImage(file, 600)) : '', createdAt: new Date().toISOString() };
  if (drive.hasFreshToken() && c.settings.wMarketingFolder) {
    try {
      const folder = b ? await bookFolder(b, type) : c.settings.wMarketingFolder;
      const f = await drive.uploadFile(file, file.name, folder); item.driveId = f.id; item.webViewLink = f.webViewLink;
    } catch (e) { toast('На Диск не загрузилось: ' + e.message); }
  }
  if (!image && !item.driveId) { toast('Файлы рукописи и синопсиса сохраняются только на Google Диск — подключите его.'); return null; }
  await app().store.put('w_media', item);
  return item;
}
changes['mk.upload'] = async (v, el) => {
  const files = [...el.files]; el.value = '';
  if (!files.length) return;
  try { await drive.ensureToken(); } catch { /* без Диска — только копии картинок */ }
  toast('Загружаю…');
  let n = 0;
  for (const f of files) { try { if (await saveMedia(f, { bookId: el.dataset.book || '', type: el.dataset.type || 'banner' })) n++; } catch (e) { toast(e.message); } }
  if (n) toast(`Загружено: ${n}`);
};
acts['mk.open'] = (d) => {
  const c = app().ctx(), m = c.data.w_media.find((x) => x.id === d.id);
  openSheet(m.name || 'Картинка', `<img src="${m.thumb}" alt="" style="width:100%;border-radius:16px">
    ${m.webViewLink ? `<p><a class="btn" href="${esc(m.webViewLink)}" target="_blank" rel="noopener">Открыть оригинал на Google Диске</a></p>` : '<p class="small muted">Оригинал не на Диске — сохранена уменьшенная копия.</p>'}
    <div class="f2"><div><label for="mt">Где использовать</label><select id="mt" name="type">${Object.entries(MTYPES).filter(([k]) => !['manuscript', 'synopsis'].includes(k)).map(([k, v]) => opt(k, v, m.type)).join('')}</select></div>
    <div><label for="mb">Книга</label><select id="mb" name="bookId"><option value="">—</option>${c.wbooks.map((b) => opt(b.id, b.title, m.bookId)).join('')}</select></div></div>
    <p><button type="button" class="link danger" data-act="mk.del" data-id="${m.id}">Убрать</button></p>`, async (fd) => {
    await app().store.put('w_media', { ...m, type: fd.get('type'), bookId: fd.get('bookId') || '' });
  });
};
acts['mk.del'] = async (d) => {
  if (!(await ask('Убрать из приложения? Файл на Google Диске останется.', 'Убрать'))) return;
  await app().store.remove('w_media', d.id);
  document.getElementById('sheet').close();
};

// ---------- формы ----------
acts['mk.promo'] = (d) => {
  const b = app().ctx().wbooksById[d.id], p = promoOf(b);
  openSheet(`Тексты — ${b.title}`, Object.entries(PROMO).map(([k, label]) => `<label for="pr_${k}">${label}</label><textarea id="pr_${k}" name="${k}" style="min-height:${k === 'annotation' || k === 'quotes' ? 140 : 80}px">${esc(p[k] || '')}</textarea>`).join('') + '<div class="hint">Цитаты — каждая с новой строки.</div>', async (fd) => {
    await app().store.put('w_books', { ...b, promo: Object.fromEntries(Object.keys(PROMO).map((k) => [k, (fd.get(k) || '').trim()])) });
    toast('Тексты сохранены');
  });
};
acts['mk.ad'] = (d) => {
  const b = app().ctx().wbooksById[d.id], dr = directOf(b), i = d.i != null ? Number(d.i) : null, x = i != null ? dr.ads[i] : {};
  openSheet(i != null ? 'Объявление' : 'Новое объявление', `
    <label for="a1">Заголовок (до ${DIRECT.h1} знаков)</label><input id="a1" name="h1" maxlength="${DIRECT.h1}" value="${esc(x.h1 || '')}" required>
    <label for="a2">Дополнительный заголовок (до ${DIRECT.h2})</label><input id="a2" name="h2" maxlength="${DIRECT.h2}" value="${esc(x.h2 || '')}">
    <label for="a3">Текст (до ${DIRECT.text} знаков)</label><textarea id="a3" name="text" maxlength="${DIRECT.text}" style="min-height:80px">${esc(x.text || '')}</textarea>
    <div class="hint">Лимиты Яндекс Директа: заголовок 56, доп. заголовок 30, текст 81 знак.</div>
    ${i != null ? `<p><button type="button" class="link danger" data-act="mk.adDel" data-id="${b.id}" data-i="${i}">Удалить объявление</button></p>` : ''}`, async (fd) => {
    const ad = { h1: (fd.get('h1') || '').trim(), h2: (fd.get('h2') || '').trim(), text: (fd.get('text') || '').trim() };
    const ads = [...dr.ads]; if (i != null) ads[i] = ad; else ads.push(ad);
    await app().store.put('w_books', { ...b, direct: { ...dr, ads } });
  });
};
acts['mk.adDel'] = async (d) => {
  const b = app().ctx().wbooksById[d.id], dr = directOf(b);
  await app().store.put('w_books', { ...b, direct: { ...dr, ads: dr.ads.filter((_, k) => k !== Number(d.i)) } });
  document.getElementById('sheet').close();
};
acts['mk.brief'] = (d) => {
  const b = app().ctx().wbooksById[d.id], dr = directOf(b);
  openSheet('Для таргетолога', `<label for="bl">Ссылка на книгу на Литнете</label><input id="bl" name="link" value="${esc(dr.link || '')}" placeholder="https://litnet.com/ru/book/…">
    <label for="ba">Аудитория и интересы</label><textarea id="ba" name="audience" placeholder="женщины 25–55, любовные романы, бытовое фэнтези…">${esc(dr.audience || '')}</textarea>
    <label for="bn">Пожелания</label><textarea id="bn" name="notes" placeholder="бюджет, сроки, что уже пробовали">${esc(dr.notes || '')}</textarea>`, async (fd) => {
    await app().store.put('w_books', { ...b, direct: { ...dr, link: (fd.get('link') || '').trim(), audience: (fd.get('audience') || '').trim(), notes: (fd.get('notes') || '').trim() } });
  });
};
acts['mk.synopsis'] = (d) => {
  const b = app().ctx().wbooksById[d.id];
  openSheet(`Синопсис — ${b.title}`, `<textarea name="synopsis" style="min-height:260px">${esc(b.synopsis || '')}</textarea>`, async (fd) => {
    await app().store.put('w_books', { ...b, synopsis: (fd.get('synopsis') || '').trim() });
  });
};

// ---------- пакеты одной кнопкой ----------
function targetText(c, b) {
  const dr = directOf(b), p = promoOf(b);
  const lines = [...[`Книга: «${b.title}»`, dr.link ? `Ссылка: ${dr.link}` : null, dr.audience ? `Аудитория: ${dr.audience}` : null, dr.notes ? `Пожелания: ${dr.notes}` : null].filter(Boolean), ''];
  dr.ads.forEach((x, i) => lines.push(...[`Объявление ${i + 1}`, `Заголовок: ${x.h1}`, x.h2 ? `Доп. заголовок: ${x.h2}` : null, `Текст: ${x.text}`].filter(Boolean), ''));
  if (p.annotation) lines.push('Аннотация:', p.annotation, '');
  return lines.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
}
// имя архива латиницей — так браузеры точно сохранят его с правильным названием
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const latin = (s) => String(s || '').toLowerCase().split('').map((ch) => (TR[ch] ?? ch)).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'kniga';
const safe = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80);
async function blobOf(m) {
  if (m.driveId && drive.hasFreshToken()) { try { return await drive.fileBlob({ id: m.driveId, mimeType: m.mime || '', name: m.name }); } catch { /* возьмём копию */ } }
  return m.thumb ? (await fetch(m.thumb)).blob() : null;
}
async function zipDownload(name, files) {
  const Zip = await drive.loadJsZip(), z = new Zip();
  for (const [path, data] of files) if (data) z.file(path, data);
  const blob = await z.generateAsync({ type: 'blob' });
  if (await download(name, blob, 'application/zip')) toast('Архив скачан');
}
acts['mk.targetCopy'] = async (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  try { await navigator.clipboard.writeText(targetText(c, b)); toast('Тексты скопированы — вставьте в сообщение таргетологу'); } catch { toast('Не получилось скопировать'); }
};
acts['mk.targetZip'] = async (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  try { await drive.ensureToken(); } catch { /* без Диска — копии картинок */ }
  toast('Собираю архив…');
  const files = [[`Тексты — ${safe(b.title)}.txt`, targetText(c, b)]];
  for (const m of mediaOf(c, b, ['target'])) files.push([`Креативы/${safe(m.name) || m.id + '.jpg'}`, await blobOf(m)]);
  await zipDownload(`target-${latin(b.title)}.zip`, files);
};

acts.copy ||= async (d) => {
  try { await navigator.clipboard.writeText(d.text); toast('Скопировано'); } catch { toast('Не получилось скопировать — выделите текст вручную'); }
};
