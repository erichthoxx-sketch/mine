// Один центр подключения всей писательской системы к личному MCP.
// Все данные только на чтение для нейросети, отправка только по кнопке владелицы.
import { acts, ask, esc, toast, copyRich } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { bookSnapshot } from '../bookai.js';
import { marketingSnapshot, incomeSnapshot, directSnapshot, readDirectDocs } from '../ai-system.js';

const app = () => window.__app;
const worker = () => String(app().ctx().settings.bookAiWorker || '').replace(/\/+$/, '');
const dateLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};
let running = false;

export function aiCenterCard(c) {
  const s = c.settings, ready = !!s.bookAiWorker, when = dateLabel(s.aiLastSyncedAt);
  const status = running ? 'Обновляю контекст…' : when
    ? (s.aiLastError ? 'Часть данных не обновилась' : 'Контекст передан')
    : (ready ? 'Готово к первому подключению' : 'Не настроено');
  return '<div class="card">' +
    '<div class="row between"><h2 style="margin:0">Нейросети</h2><span class="small muted">' + esc(status) + '</span></div>' +
    '<p class="small muted" style="margin:8px 0 12px">Один защищённый доступ к рукописям, маркетингу, продажам и статистике Яндекс.Директа. Нейросеть может читать данные, но не изменять их.</p>' +
    '<div class="row" style="gap:8px;flex-wrap:wrap">' +
    '<button class="primary" data-act="ai.all"' + (running ? ' disabled' : '') + '>' + ic('link') + (when ? 'Обновить весь контекст' : 'Подключить весь контекст') + '</button>' +
    '<button data-act="bai.settings">Настроить</button>' +
    (when ? '<button class="link" data-act="ai.clear">Отключить всё</button>' : '') +
    '</div>' +
    (when ? '<p class="small muted" style="margin:10px 0 0">Последняя передача: ' + esc(when) +
      (s.aiLastCount != null ? ' · Книг: ' + Number(s.aiLastCount) : '') +
      (s.aiLastError ? ' · ' + esc(s.aiLastError) : '') + '</p>' : '') +
    '<p class="hint">Первоначально нужно один раз развернуть отдельный Worker в существующем Cloudflare и добавить его в Claude. Кнопка передаёт снимок данных; обновления в Google Docs и Директе появятся здесь после следующей синхронизации.</p>' +
    '</div>';
}
async function request(method, path, data) {
  const a = app(), user = a.store.auth?.currentUser;
  if (!user || !a.store.user?.uid || a.store.mode !== 'firebase') throw Error('Сначала войдите в Мастерскую');
  const token = await user.getIdToken();
  const res = await fetch(worker() + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  let out; try { out = await res.json(); } catch { throw Error('Cloudflare не ответил. Проверьте адрес Worker.'); }
  if (!res.ok || !out.ok) throw Error(out.error || 'Ошибка сервера (' + res.status + ')');
  return out;
}
async function checkWorker() {
  let res;
  try { res = await fetch(worker() + '/health', { cache: 'no-store' }); }
  catch { throw Error('Нет связи с Cloudflare Worker. Сначала разверните новый сервер.'); }
  if (!res.ok) throw Error('Worker не отвечает');
  const h = await res.json();
  if (!h.configured) throw Error('В Cloudflare ещё не настроены BOOKS, OWNER_UID или MCP_READ_KEY');
}
acts['ai.all'] = async () => {
  if (running) return false;
  if (!worker()) {
    acts['bai.settings']();
    toast('Сначала укажите адрес нового Worker в Cloudflare');
    return false;
  }
  if (!app().ctx().settings.aiConsentAt) {
    const ok = await ask('Передать в ваш закрытый Cloudflare копии всех рукописей, маркетинговых материалов, продаж и рекламной статистики? Данные будут доступны через личный ключ нейросети. Пароли и токены не передаются.', 'Передать контекст');
    if (!ok) return false;
  }
  running = true;
  app().rerender();
  const errors = [], store = app().store, data = app().ctx().data;
  let booksDone = 0, sectionsDone = 0;
  try {
    await checkWorker();
    // Финансы и маркетинг уже есть в общей базе «Мастерской»; Директ читаем свежим запросом Firebase.
    const sections = [
      ['marketing', marketingSnapshot(data)],
      ['income', incomeSnapshot(data)]
    ];
    try { sections.push(['direct', directSnapshot(await readDirectDocs(store))]); }
    catch (e) { errors.push('Директ: ' + (e.message || e)); }
    for (const [name, snapshot] of sections) {
      try {
        await request('PUT', '/sync/section/' + name, snapshot);
        sectionsDone++;
      } catch (e) { errors.push(name + ': ' + (e.message || e)); }
    }
    const books = [...(app().ctx().wbooks || [])];
    if (!books.length) errors.push('В Мастерской пока нет книг');
    for (const book of books) {
      try {
        const b = await bookSnapshot(book);
        const res = await request('PUT', '/sync/' + encodeURIComponent(book.id), b);
        await store.patch('w_books', book.id, { aiShared: true, aiUpdatedAt: res.updatedAt });
        booksDone++;
      } catch (e) { errors.push(book.title + ': ' + (e.message || e)); }
    }
    const now = new Date().toISOString();
    await store.saveSettings({
      aiLastSyncedAt: now, aiLastCount: booksDone, aiLastError: errors.join('; ').slice(0, 700),
      aiConsentAt: app().ctx().settings.aiConsentAt || now
    });
    toast(errors.length ? ('Передано ' + sectionsDone + ' раздела(ов), книг: ' + booksDone + '. Есть ошибки — см. статус.') :
      ('Готово: ' + booksDone + ' книг и ' + sectionsDone + ' раздела. Добавьте адрес MCP в Claude.'));
  } catch (e) {
    toast('Подключение не завершено: ' + (e.message || e));
  } finally {
    running = false;
    app().rerender();
  }
  return false;
};
acts['ai.clear'] = async () => {
  if (running) return false;
  if (!(await ask('Удалить все подключённые книги, маркетинг, доходы и данные Директа из личного Cloudflare? Исходные данные в приложениях останутся.', 'Отключить всё'))) return false;
  if (!worker()) return false;
  running = true; app().rerender();
  const errors = [];
  try {
    for (const name of ['marketing', 'income', 'direct']) {
      try { await request('DELETE', '/sync/section/' + name); }
      catch (e) { errors.push(name + ': ' + (e.message || e)); }
    }
    for (const b of app().ctx().wbooks || []) {
      try {
        await request('DELETE', '/sync/' + encodeURIComponent(b.id));
        await app().store.patch('w_books', b.id, { aiShared: false, aiUpdatedAt: '' });
      } catch (e) { errors.push(b.title + ': ' + (e.message || e)); }
    }
    await app().store.saveSettings({
      aiLastSyncedAt: errors.length ? app().ctx().settings.aiLastSyncedAt : '',
      aiLastCount: errors.length ? app().ctx().settings.aiLastCount : 0,
      aiLastError: errors.join('; ').slice(0, 700)
    });
    toast(errors.length ? 'Некоторые источники не отключились — проверьте статус' : 'Доступ к сохранённому контексту отключён');
  } catch (e) { toast('Не удалось отключить: ' + (e.message || e)); }
  finally { running = false; app().rerender(); }
  return false;
};
