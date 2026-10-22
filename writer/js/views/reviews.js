// Читательские отзывы и архив скриншотов в карточке книги.
import { esc, acts, changes, openSheet, closeSheet, toast, ask, uid, download, opt } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import * as drive from '../drive.js';
import { saveMedia } from './marketing.js';
import { REVIEW_SOURCES, parseReviewBatch, uniqueReviews, newReviews, reviewsPrompt } from '../reviews.js';

const app = () => window.__app;
const allReviews = (c, b) => (c.data.w_reviews || []).filter((r) => r.bookId === b.id).sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
const allShots = (c, b) => (c.data.w_media || []).filter((m) => m.bookId === b.id && m.type === 'review-shot').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
const elink = (url) => /^https?:\/\//i.test(String(url || '')) ? esc(url) : '';
const line = (r) => [r.source, r.author, r.date].filter(Boolean).join(' · ');
const preview = (r) => '<div class="rev-entry"><div class="small muted">' + esc(line(r)) + '</div><div class="rev-body">' + esc(r.text) + '</div></div>';

export function reviewsCard(c, b) {
  const reviews = allReviews(c, b), shots = allShots(c, b);
  const fresh = newReviews(reviews, b.reviewExportAt);
  return '<div class="card rev-card">' +
    '<div class="row between"><h2 style="margin:0">Отзывы</h2><button class="small-btn" data-act="rev.goto" data-id="' + esc(b.id) + '">Открыть</button></div>' +
    '<p class="small muted rev-summary">' + reviews.length + ' сохранено' +
      (fresh.length ? ' · ' + fresh.length + ' новых для анализа' : '') +
      ' · ' + shots.length + ' скриншотов</p>' +
    (reviews.length ? '<div class="rev-brief">' + reviews.slice(0, 2).map(preview).join('') + '</div>' : '<p class="small muted">Собирайте читательскую реакцию в одном месте.</p>') +
    '<div class="row rev-actions">' +
    '<button class="dl" data-act="rev.goto" data-id="' + esc(b.id) + '">' + ic('folder') + 'Все материалы</button>' +
    '<button class="dl" data-act="rev.prompt" data-id="' + esc(b.id) + '"' + (!reviews.length ? ' disabled' : '') + '>' + ic('download') + 'Скачать промт для ИИ</button>' +
    '</div></div>';
}

export function reviewsPage(a, id) {
  const c = a.ctx(), b = c.wbooksById[id];
  if (!b) return { html: '<div class="card"><p>Книга не найдена.</p></div>' };
  const list = allReviews(c, b), shots = allShots(c, b);
  const fresh = newReviews(list, b.reviewExportAt);
  return { html: '<div class="bk-top"><a class="btn back" href="#" data-act="go" data-to="/book/' + esc(b.id) + '">← Книга</a></div>' +
    '<h2>Отзывы · ' + esc(b.title) + '</h2>' +
    '<div class="card"><div class="row between"><h2 style="margin:0">Отзывы читателей</h2><span class="small muted">' + list.length + ' всего' + (fresh.length ? ' · ' + fresh.length + ' новых' : '') + '</span></div>' +
    '<div class="row rev-actions"><button class="primary" data-act="rev.import" data-id="' + esc(b.id) + '">' + ic('plus') + ' Добавить отзывы</button>' +
    '<button class="dl" data-act="rev.prompt" data-id="' + esc(b.id) + '"' + (!list.length ? ' disabled' : '') + '>' + ic('download') + 'Скачать промт для ИИ</button>' +
    '<button class="dl" data-act="rev.prompt" data-id="' + esc(b.id) + '" data-all="1"' + (!list.length ? ' disabled' : '') + '>' + ic('download') + 'Вся история</button></div>' +
    '<p class="small muted" style="margin:8px 0 0">Новые для ИИ считаются со времени последней выгрузки. Повторы при импорте пропускаются.</p>' +
    (list.length ? '<div class="list rev-list">' + list.map((r) => '<div class="item rev-item"><div class="row between"><span class="small muted">' + esc(line(r)) + '</span><button class="link" data-act="rev.edit" data-id="' + esc(r.id) + '">Изменить</button></div><div class="rev-body">' + esc(r.text) + '</div>' + (elink(r.url) ? '<a class="small" href="' + elink(r.url) + '" target="_blank" rel="noopener">Источник ↗</a>' : '') + '</div>').join('') + '</div>' :
      '<p class="small muted">Пока пусто. Можно вставить сразу несколько отзывов, разделяя их строкой ---.</p>') + '</div>' +
    '<div class="card"><div class="row between"><h2 style="margin:0">Скриншоты для маркетинга</h2>' +
    '<label class="btn small-btn">+ Фото<input type="file" accept="image/*" multiple data-chg="rev.shots" data-book="' + esc(b.id) + '" hidden></label></div>' +
    '<p class="small muted">Оригиналы хранятся в Google Диске, миниатюры — здесь. Можно открыть оригинал и использовать его на другом сайте.</p>' +
    (shots.length ? '<div class="gallery rev-gallery">' + shots.map((m) => '<button class="g-item" data-act="mk.open" data-id="' + esc(m.id) + '" title="' + esc(m.name) + '"><img src="' + esc(m.thumb) + '" alt="' + esc(m.name) + '"></button>').join('') + '</div>' : '<p class="small muted">Скриншотов пока нет.</p>') +
    (b.mkFolders?.reviews?.link ? '<p class="small"><a href="' + esc(b.mkFolders.reviews.link) + '" target="_blank" rel="noopener">' + ic('folder') + ' Папка с оригиналами</a></p>' : '') +
    (!c.settings.wMarketingFolder ? '<p class="small muted">Для сохранения оригиналов выберите папку маркетинга в Настройках Мастерской.</p>' : '') +
    '</div>' +
    '<p class="small muted">Автоматическая синхронизация с Литнетом пока не подключена: необходим официальный доступ к API. Здесь уже можно хранить материалы и выгружать их для анализа.</p>' };
}

async function addBatch(bookId, text, source) {
  const c = app().ctx();
  const candidates = uniqueReviews(bookId, parseReviewBatch(text, source), c.data.w_reviews || []);
  if (!candidates.length) return 0;
  await app().store.putMany('w_reviews', candidates.map((x, i) => ({ ...x, id: 'rv' + uid(), addedAt: new Date(Date.now() + i).toISOString() })));
  return candidates.length;
}

acts['rev.goto'] = (d) => app().go('/reviews/' + encodeURIComponent(d.id));
acts['rev.import'] = (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  if (!b) return;
  openSheet('Отзывы · ' + b.title, '<p class="small muted">Можно вставить все сразу. Один отзыв отделяется от другого строкой <b>---</b>. Также принимается JSON-массив с полями text, author, date, source, url.</p>' +
    '<label for="rv_source">Площадка</label><select id="rv_source" name="source">' + REVIEW_SOURCES.map((x) => opt(x, x, 'Литнет')).join('') + '</select>' +
    '<label for="rv_text">Текст отзывов</label><textarea id="rv_text" name="text" rows="10" placeholder="Первый отзыв&#10;---&#10;Второй отзыв"></textarea>' +
    '<p class="small muted">Или импортируйте подготовленный файл .txt / .json:</p><input type="file" accept=".txt,.json,text/plain,application/json" name="file">',
    async (fd) => {
      const file = fd.get('file');
      const text = file?.size ? await file.text() : String(fd.get('text') || '');
      if (!text.trim()) { toast('Добавьте текст или файл'); return false; }
      const n = await addBatch(b.id, text, String(fd.get('source') || 'Литнет'));
      toast(n ? 'Добавлено отзывов: ' + n : 'Все отзывы уже сохранены');
    }, { submitText: 'Сохранить отзывы' });
};

acts['rev.edit'] = (d) => {
  const c = app().ctx(), r = (c.data.w_reviews || []).find((x) => x.id === d.id);
  if (!r) return;
  openSheet('Отзыв', '<label>Площадка</label><select name="source">' + REVIEW_SOURCES.map((x) => opt(x, x, r.source)).join('') + '</select>' +
    '<label>Автор</label><input name="author" value="' + esc(r.author || '') + '">' +
    '<label>Дата отзыва</label><input type="date" name="date" value="' + esc(r.date || '') + '">' +
    '<label>Ссылка на отзыв</label><input type="url" name="url" value="' + esc(r.url || '') + '">' +
    '<label>Текст</label><textarea name="text" rows="8" required>' + esc(r.text) + '</textarea>' +
    '<p><button type="button" class="link danger" data-act="rev.del" data-id="' + esc(r.id) + '">Удалить из архива</button></p>',
    async (fd) => {
      const text = String(fd.get('text') || '').trim();
      if (!text) { toast('Текст отзыва пуст'); return false; }
      await app().store.put('w_reviews', { ...r, text: text.slice(0, 20000), source: fd.get('source'), author: String(fd.get('author') || '').trim(), date: fd.get('date') || '', url: String(fd.get('url') || '').trim() });
      toast('Отзыв сохранен');
    });
};
acts['rev.del'] = async (d) => {
  if (!(await ask('Удалить сохраненный отзыв из архива? На площадке он не изменится.'))) return;
  await app().store.remove('w_reviews', d.id);
  closeSheet();
  toast('Удалено из архива');
};
acts['rev.prompt'] = async (d) => {
  const c = app().ctx(), b = c.wbooksById[d.id];
  if (!b) return;
  const records = allReviews(c, b);
  const all = d.all === '1', selection = all ? records : newReviews(records, b.reviewExportAt);
  if (!selection.length) { toast(all ? 'Отзывов пока нет' : 'Новых отзывов для анализа нет. Для повторного анализа выберите «Вся история».'); return false; }
  const txt = reviewsPrompt(b, selection, { source: all ? 'все сохраненные отзывы' : 'новые после последней выгрузки', date: c.today });
  const safeName = b.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60);
  const saved = await download(safeName + '_otzyvy_dlya_ii_' + c.today + '.md', txt, 'text/markdown');
  if (saved && !all) {
    await app().store.put('w_books', { ...app().ctx().wbooksById[b.id], reviewExportAt: new Date().toISOString() });
    toast('Промт скачан; новые отзывы отмечены для следующего анализа');
  }
  return false;
};

changes['rev.shots'] = async (_value, el) => {
  const files = [...(el.files || [])]; el.value = '';
  if (!files.length) return;
  const c = app().ctx();
  if (!c.settings.wMarketingFolder) { toast('Сначала выберите папку маркетинга в Настройках'); return; }
  try { await drive.ensureToken(); } catch (e) { toast('Подключите Google Диск: ' + e.message); return; }
  let count = 0;
  for (const file of files) {
    if (!/^image\//.test(file.type)) continue;
    try {
      if (await saveMedia(file, { type: 'review-shot', bookId: el.dataset.book, requireOriginal: true })) count++;
    } catch (e) { toast('Не удалось сохранить ' + file.name + ': ' + e.message); }
  }
  toast('Сохранено оригиналов: ' + count);
};
