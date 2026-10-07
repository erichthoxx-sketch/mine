import { esc, acts, changes, openSheet, opt, toast, uid, ask } from '../../../js/ui.js';
import { resizeImage } from '../../../js/img.js';
import * as drive from '../drive.js';

const app = () => window.__app;
export const MTYPES = { banner: 'Баннер', cover: 'Обложка', other: 'Другое' };

// Тексты для продвижения книги: всё, что нужно под рукой для постов, рекламы и конкурсов
const PROMO = { annotation: 'Аннотация', short: 'Короткий анонс для поста', tags: 'Теги и хэштеги', quotes: 'Цитаты для постов' };
const promoOf = (b) => b.promo || {};
const filled = (b) => Object.keys(PROMO).filter((k) => (promoOf(b)[k] || '').trim()).length;

function bookSelect(c, sel) {
  const grp = (st, label) => { const l = c.wbooks.filter((b) => (b.status || 'progress') === st); return l.length ? `<optgroup label="${label}">${l.map((b) => opt(b.id, b.title, sel)).join('')}</optgroup>` : ''; };
  return `<select data-chg="mk.book" aria-label="Книга"><option value="">Все книги</option>${grp('progress', 'В процессе')}${grp('idea', 'Идеи')}${grp('done', 'Завершённые')}</select>`;
}

function promoCard(c, b) {
  const p = promoOf(b);
  return `<div class="card"><div class="row between"><h2 style="margin:0">Тексты для продвижения</h2><button data-act="mk.promo" data-id="${b.id}">Изменить</button></div>
    <div class="list">${Object.entries(PROMO).map(([k, label]) => {
      const v = (p[k] || '').trim();
      return `<div class="item"><div class="row between"><span class="small muted">${label}</span>${v ? `<button class="link" style="padding:0" data-act="copy" data-text="${esc(v)}">копировать</button>` : ''}</div>
        ${v ? `<div class="idea-text">${esc(v)}</div>` : '<div class="small muted">не заполнено</div>'}</div>`;
    }).join('')}</div></div>`;
}

// обзор по всем книгам: что уже готово для продвижения
function overview(c) {
  if (!c.wbooks.length) return '';
  return `<div class="card"><h2>Готовность к продвижению</h2><div class="list">${c.wbooks.map((b) => {
    const n = filled(b), media = c.data.w_media.filter((m) => m.bookId === b.id).length;
    return `<a class="item row between" href="#" data-act="mk.pick" data-v="${b.id}"><span>${esc(b.title)}<span class="sub">тексты ${n} из ${Object.keys(PROMO).length} · картинок ${media}</span></span><span class="badge ${n === Object.keys(PROMO).length ? 'good' : ''}">${n === Object.keys(PROMO).length ? 'готово' : 'дополнить'}</span></a>`;
  }).join('')}</div></div>`;
}

export function marketingView(a) {
  const c = a.ctx(), sel = a.ui.mBook;
  const wb = sel ? c.wbooksById[sel] : null;
  const media = [...c.data.w_media].filter((m) => !sel || m.bookId === sel).sort((x, y) => (y.createdAt || '').localeCompare(x.createdAt || ''));
  const html = `<div class="card">${bookSelect(c, sel)}</div>
  ${wb ? promoCard(c, wb) : overview(c)}
  <div class="row between" style="margin:16px 0 10px"><h2 style="margin:0">Баннеры и обложки</h2>
    <label class="btn primary">+ Загрузить<input type="file" accept="image/*" multiple data-chg="mk.upload" hidden></label></div>
  ${drive.isConnected() && c.settings.wMarketingFolder ? '' : '<p class="small muted">Оригиналы сохраняются в папку «Маркетинг» на Google Диске, когда Диск подключён и папка выбрана (Настройки (шестерёнка вверху)). Без этого сохранится только уменьшенная копия.</p>'}
  ${media.length ? `<div class="gallery">${media.map((m) => `<button class="g-item" data-act="mk.open" data-id="${m.id}"><img src="${m.thumb}" alt="${esc(m.name || '')}"><span class="tag on">${MTYPES[m.type] || MTYPES.other}</span></button>`).join('')}</div>` : '<div class="card"><p class="muted" style="margin:0">Пока пусто. Загрузите баннеры для рекламы и обложки — они будут под рукой с телефона.</p></div>'}`;
  return { html };
}

// Сохранить картинку: уменьшенная копия — в базу (быстро и с телефона), оригинал — на Google Диск
export async function saveMedia(file, { type = 'banner', bookId = '', thumb } = {}) {
  const c = app().ctx();
  const item = { id: 'm' + uid(), name: file.name, type, bookId, thumb: thumb || await resizeImage(file, 600), createdAt: new Date().toISOString() };
  if (drive.hasFreshToken() && c.settings.wMarketingFolder) {
    try { const f = await drive.uploadFile(file, file.name, c.settings.wMarketingFolder); item.driveId = f.id; item.webViewLink = f.webViewLink; } catch (e) { toast('На Диск не загрузилось: ' + e.message); }
  }
  await app().store.put('w_media', item);
  return item;
}
changes['mk.book'] = (v) => { app().ui.mBook = v; app().rerender(); };
acts['mk.pick'] = (d) => { app().ui.mBook = d.v; window.scrollTo(0, 0); };
acts['mk.promo'] = (d) => {
  const b = app().ctx().wbooksById[d.id], p = promoOf(b);
  openSheet(`Тексты — ${b.title}`, Object.entries(PROMO).map(([k, label]) => `<label for="pr_${k}">${label}</label><textarea id="pr_${k}" name="${k}" style="min-height:${k === 'annotation' || k === 'quotes' ? 140 : 80}px">${esc(p[k] || '')}</textarea>`).join('') + '<div class="hint">Цитаты — каждая с новой строки.</div>', async (fd) => {
    const promo = Object.fromEntries(Object.keys(PROMO).map((k) => [k, (fd.get(k) || '').trim()]));
    await app().store.put('w_books', { ...b, promo });
    toast('Тексты сохранены');
  });
};
changes['mk.upload'] = async (v, el) => {
  const files = [...el.files]; el.value = '';
  if (!files.length) return;
  toast('Загружаю…');
  for (const f of files) { try { await saveMedia(f, { bookId: app().ui.mBook || '' }); } catch (e) { toast(e.message); } }
  toast(`Загружено: ${files.length}`);
};
acts['mk.open'] = (d) => {
  const c = app().ctx(), m = c.data.w_media.find((x) => x.id === d.id);
  openSheet(m.name || 'Картинка', `<img src="${m.thumb}" alt="" style="width:100%;border-radius:16px">
    ${m.webViewLink ? `<p><a class="btn" href="${esc(m.webViewLink)}" target="_blank" rel="noopener">Открыть оригинал на Google Диске</a></p>` : '<p class="small muted">Оригинал не на Диске — сохранена уменьшенная копия.</p>'}
    <div class="f2"><div><label for="mt">Тип</label><select id="mt" name="type">${Object.entries(MTYPES).map(([k, v]) => opt(k, v, m.type)).join('')}</select></div>
    <div><label for="mb">Книга</label><select id="mb" name="bookId"><option value="">—</option>${c.wbooks.map((b) => opt(b.id, b.title, m.bookId)).join('')}</select></div></div>
    <p><button type="button" class="link danger" data-act="mk.del" data-id="${m.id}">Убрать из галереи</button></p>`, async (fd) => {
    await app().store.put('w_media', { ...m, type: fd.get('type'), bookId: fd.get('bookId') || '' });
  });
};
acts['mk.del'] = async (d) => {
  if (!(await ask('Убрать картинку из галереи? Оригинал на Google Диске останется.', 'Убрать'))) return;
  await app().store.remove('w_media', d.id);
};
acts.copy ||= async (d) => {
  try { await navigator.clipboard.writeText(d.text); toast('Скопировано'); } catch { toast('Не получилось скопировать — выделите текст вручную'); }
};
