// Добровольная автосинхронизация уже подключённых рукописей и Легенд в личный read-only MCP.
// Не отправляет новые книги без явного подключения и не запускается без отдельного согласия.
// Работает только при открытой Мастерской и действующем входе Google для файлов на Диске.
import * as drive from './drive.js';
import { bookSnapshot, snapshotContext } from './bookai.js';

const DELAY = 20000;
const MIN_GAP = 2 * 60000;
const RETRY = 5 * 60000;
const POLL = 10 * 60000;
const fnv = (value) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16) + ':' + value.length;
};
const markKey = (uid, id) => 'ai.book.autosync:' + uid + ':' + id;
const readMark = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const saveMark = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* браузер ограничил хранилище */ }
};
function workerOrigin(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' ? u.origin : '';
  } catch { return ''; }
}

export function startBookAutoSync(store) {
  let timer = null, busy = false, retryAt = 0;
  // После изменения Легенды или возвращения во вкладку — с небольшой паузой.
  function schedule(ms = DELAY) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      run().catch((e) => console.warn('Автообновление рукописей:', e?.message || e));
    }, ms);
  }
  async function run() {
    const s = store.data.settings || {}, origin = workerOrigin(s.bookAiWorker);
    if (busy || document.visibilityState !== 'visible' || !navigator.onLine ||
        !s.aiBooksAuto || !origin || store.mode !== 'firebase' ||
        !store.user?.uid || !store.auth?.currentUser || !store.loaded?.w_books) return;
    if (Date.now() < retryAt) { schedule(retryAt - Date.now() + 1000); return; }
    const books = (store.data.w_books || []).filter((b) => b.aiShared === true && b.id);
    if (!books.length) return;
    busy = true;
    try {
      for (const book of books) {
        // Google не разрешает фоновое продление OAuth; кнопку входа пользователь нажимает сам.
        if (!store.data.settings?.aiBooksAuto || !store.auth.currentUser || document.hidden) break;
        if (book.fileId && !drive.hasFreshToken()) continue;
        const key = markKey(store.user.uid, book.id), last = readMark(key);
        try {
          const meta = book.fileId ? await drive.fileMeta(book.fileId) : null;
          // Легенда хранится в Firebase, главы — в Google Документе: отслеживаем обе стороны.
          const version = fnv(JSON.stringify({
            id: book.id, fileId: book.fileId || '', mimeType: book.mimeType || '',
            googleModifiedAt: meta?.modifiedTime || '', context: snapshotContext(book)
          }));
          if (last?.hash === version) continue;
          if (last && Date.now() - last.at < MIN_GAP) {
            schedule(MIN_GAP - (Date.now() - last.at) + 1000);
            continue;
          }
          const snapshot = await bookSnapshot(book);
          // При временной ошибке Google нельзя заменять уже сохранённую рукопись пустой.
          if (book.fileId && !snapshot.chapters.length) {
            console.warn('Автосинхронизация пропущена — нет глав:', book.title);
            continue;
          }
          const token = await store.auth.currentUser.getIdToken();
          const res = await fetch(origin + '/sync/' + encodeURIComponent(book.id), {
            method: 'PUT',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot)
          });
          const answer = await res.json().catch(() => ({}));
          if (!res.ok || answer.ok !== true) throw Error(answer.error || 'HTTP ' + res.status);
          saveMark(key, { hash: version, at: Date.now() });
          await store.patch('w_books', book.id, {
            aiUpdatedAt: answer.updatedAt || new Date().toISOString()
          });
        } catch (e) {
          console.warn('Автообновление «' + book.title + '»:', e?.message || e);
          retryAt = Date.now() + RETRY;
          schedule(RETRY);
        }
      }
    } finally { busy = false; }
  }
  store.subscribe(() => schedule());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(2000);
  });
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') schedule();
  }, POLL);
  return () => { clearTimeout(timer); clearInterval(interval); };
}
