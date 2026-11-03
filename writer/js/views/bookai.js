// Тихий блок на странице книги: локальный экспорт + защищённая публикация в личный MCP.
import { esc, acts, openSheet, toast, download, ask, copyRich } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { bookSnapshot, snapshotMarkdown } from '../bookai.js';

const app = () => window.__app;
const bookOf = (id) => app().ctx().wbooksById[id];
const workerOf = () => String(app().ctx().settings.bookAiWorker || '').replace(/\/+$/, '');
const safeFile = (s) => String(s || 'kniga').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60);
const endpoint = (id) => workerOf() + '/sync/' + encodeURIComponent(id);

export function bookAiCard(c, b) {
  const when = b.aiShared && b.aiUpdatedAt ? new Date(b.aiUpdatedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  return '<div class="card">' +
    '<div class="row between"><h2 style="margin:0">Для нейросети</h2><button class="link" data-act="bai.settings" title="Адрес личного коннектора">Настроить</button></div>' +
    '<p class="small muted">Полная рукопись и утверждённая Легенда одной книги. Другие книги, доходы и рекламные данные не передаются.</p>' +
    '<div class="row" style="gap:8px;flex-wrap:wrap">' +
    '<button class="primary" data-act="bai.download" data-id="' + esc(b.id) + '">' + ic('download') + 'Скачать контекст</button>' +
    '<button data-act="bai.sync" data-id="' + esc(b.id) + '">' + ic('refresh') + (b.aiShared ? 'Обновить у нейросети' : 'Подключить книгу') + '</button>' +
    (b.aiShared ? '<button class="link" data-act="bai.remove" data-id="' + esc(b.id) + '">Отключить</button>' : '') +
    '</div><div class="small muted" style="margin-top:8px">' +
    (b.aiShared ? 'В коннекторе: сохранена версия от ' + esc(when) + '. После новых правок нажмите «Обновить».' :
      'Для живого подключения нужен один раз настроенный личный сервер Cloudflare. Скачать файл можно уже сейчас.') +
    '</div></div>';
}
function validWorker(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') return '';
    return u.origin;
  } catch { return ''; }
}
acts['bai.settings'] = () => {
  const url = workerOf();
  openSheet('Коннектор для книг',
    '<p class="small muted">Вставьте адрес отдельного Cloudflare Worker из инструкции. Здесь хранится только адрес, не пароль и не ключи.</p>' +
    '<label for="baiUrl">Адрес Cloudflare Worker</label><input id="baiUrl" name="url" type="url" placeholder="https://master-books.ваш-домен.workers.dev/" value="' + esc(url) + '">' +
    '<label for="baiUid">ID владельца Firebase (для Cloudflare)</label><input id="baiUid" readonly value="' + esc(app().store.user?.uid || '') + '">' +
    '<button type="button" data-act="bai.copyuid">Скопировать ID</button> <button type="button" data-act="bai.key">Создать ключ доступа</button>' +
    '<p class="small muted">В Claude: Добавить свой коннектор → URL /mcp → «Без входа» → заголовок X-Master-Key. Полные инструкции — docs/SETUP-BOOKS-MCP.md.</p>' +
    '<button type="button" data-act="bai.copyurl">Скопировать адрес MCP</button>',
    async (f) => {
      const raw = String(f.get('url') || '').trim();
      const value = raw ? validWorker(raw) : '';
      if (raw && !value) { toast('Введите правильный HTTPS-адрес Worker без пути и параметров'); return false; }
      await app().store.saveSettings({ bookAiWorker: value });
      toast(value ? 'Адрес сохранён' : 'Адрес удалён');
    });
  return false;
};
acts['bai.copyurl'] = async () => {
  if (!workerOf()) { toast('Сначала укажите адрес Worker'); return false; }
  if (await copyRich(workerOf() + '/mcp')) toast('Адрес MCP скопирован');
  return false;
};
acts['bai.copyuid'] = async () => {
  const uid = app().store.user?.uid || '';
  if (uid && await copyRich(uid)) toast('ID владельца скопирован');
  return false;
};
acts['bai.key'] = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  openSheet('Личный ключ доступа', '<p class="small muted">Скопируйте ключ один раз. Добавьте его в Cloudflare как секрет MCP_READ_KEY, затем в Claude как значение заголовка X-Master-Key. В Мастерской и GitHub ключ не сохраняется.</p>' +
    '<input readonly id="baiGenerated" value="' + esc(key) + '">' +
    '<button type="button" data-act="bai.copykey">Скопировать ключ</button>', null);
  return false;
};
acts['bai.copykey'] = async () => {
  const key = document.getElementById('baiGenerated')?.value;
  if (key && await copyRich(key)) toast('Ключ скопирован');
  return false;
};
acts['bai.download'] = async (d) => {
  const b = bookOf(d.id); if (!b) return;
  try {
    toast('Собираю контекст книги…');
    const s = await bookSnapshot(b);
    if (await download('kontekst_' + safeFile(b.title) + '.md', snapshotMarkdown(s), 'text/markdown')) {
      toast('Контекст скачан: ' + s.chapters.length + ' глав. Прикрепите файл к нейросети.');
    }
  } catch (e) { toast('Не удалось собрать контекст: ' + (e.message || e)); }
};
async function authorized(method, id, body) {
  if (!workerOf()) throw Error('Сначала настройте адрес личного Worker');
  const a = app(), user = a.store.auth?.currentUser;
  if (!user || !a.store.user?.uid) throw Error('Нужно войти в Мастерскую под своим аккаунтом');
  const token = await user.getIdToken();
  const res = await fetch(endpoint(id), {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let out; try { out = await res.json(); } catch { throw Error('Сервер не ответил. Проверьте адрес Worker.'); }
  if (!res.ok || !out.ok) throw Error(out.error || 'Ошибка Cloudflare (' + res.status + ')');
  return out;
}
acts['bai.sync'] = async (d) => {
  const b = bookOf(d.id);
  if (!b) return;
  if (!workerOf()) { acts['bai.settings'](); toast('Сначала укажите адрес Cloudflare Worker'); return false; }
  try {
    toast('Читаю главы и отправляю выбранную книгу…');
    const snapshot = await bookSnapshot(b);
    if (!snapshot.chapters.length) {
      toast('Главы не найдены. Книгу не отправляла — проверьте файл рукописи.');
      return false;
    }
    const r = await authorized('PUT', b.id, snapshot);
    await app().store.patch('w_books', b.id, { aiShared: true, aiUpdatedAt: r.updatedAt });
    toast('Книга подключена: ' + r.chapters + ' глав. Нейросеть может прочитать сохранённую версию.');
  } catch (e) { toast('Не удалось подключить книгу: ' + (e.message || e)); }
  return false;
};
acts['bai.remove'] = async (d) => {
  const b = bookOf(d.id);
  if (!b || !(await ask('Отозвать доступ нейросетей к книге «' + b.title + '»?', 'Отключить'))) return false;
  try {
    await authorized('DELETE', b.id);
    await app().store.patch('w_books', b.id, { aiShared: false, aiUpdatedAt: '' });
    toast('Книга удалена из коннектора');
  } catch (e) { toast('Не удалось отключить книгу: ' + (e.message || e)); }
  return false;
};
