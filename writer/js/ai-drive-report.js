// Приватный аналитический снимок для ChatGPT: Google Drive, без текстов рукописей.
// Google OAuth в браузере живёт ограниченное время: автообновление не открывает окна входа.
import * as drive from './drive.js';
import { marketingSnapshot, incomeSnapshot, directSnapshot } from './ai-system.js';

export const AI_DRIVE_FILENAME = 'Лана Фрейтаг — маркетинг и продажи для ChatGPT.md';
const LIMIT_MS = 60000;
const POLL_MS = 15 * 60000;
const needed = ['w_books', 'w_ideas', 'w_contests', 'w_reviews', 'w_promolinks', 'w_blog',
  'sales', 'books', 'campaigns', 'reports', 'd_snap'];
let running = false;
const checksum = (raw) => {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) h = Math.imul(h ^ raw.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16) + ':' + raw.length;
};
const validStore = (store) => !!(store.mode === 'firebase' && store.user?.uid && store.auth?.currentUser
  && needed.every((name) => store.loaded?.[name] && Array.isArray(store.data[name])));
const markKey = (uid) => 'ai.drive.mark:' + uid;
const readMark = (uid) => {
  try { return JSON.parse(localStorage.getItem(markKey(uid)) || 'null'); } catch { return null; }
};
const saveMark = (uid, obj) => {
  try { localStorage.setItem(markKey(uid), JSON.stringify(obj)); } catch { /* private browsing */ }
};
export const driveMirrorAvailable = (store) => validStore(store) && drive.hasFreshToken();

function reportOf(data, now) {
  const marketing = marketingSnapshot(data, now);
  const income = incomeSnapshot(data, now);
  const direct = Object.fromEntries((data.d_snap || []).map((d) => [d.id, d]));
  const ads = (direct.main || direct.stats)
    ? directSnapshot(direct, now, data.settings?.direct?.metrika?.goals)
    : { section: 'direct', generatedAt: now, note: 'Директ не выгружен. Нельзя делать выводы по рекламным расходам.', campaigns: [], daily: [] };
  // Имя документа намеренно не зависит от даты: один файл обновляется, а не создаются дубликаты.
  const doc = [
    '# Лана Фрейтаг — аналитический контекст для ChatGPT',
    '',
    'Сформировано: ' + now,
    'Источник: Firebase Firestore (Мастерская, Доходы, сохранённый снимок Яндекс.Директа).',
    'Важно: это снимок, а НЕ живое подключение к Яндексу или Литнету.',
    'Продажи актуальны не позднее lastSaleDate. Директ актуален не позднее direct.snapshotAt.',
    'Рекламные расходы, продажи, посещения и конверсии имеют разные источники и могут расходиться.',
    'Валюта: рубли. Специальные поля с паролями и токенами не экспортируются, полные тексты глав не включены. Свободный текст маркетинговых заметок может содержать личные сведения.',
    '',
    '## Маркетинг',
    '~~~json', JSON.stringify(marketing, null, 2), '~~~',
    '',
    '## Доходы',
    '~~~json', JSON.stringify(income, null, 2), '~~~',
    '',
    '## Яндекс.Директ и Метрика (последний сохранённый снимок)',
    '~~~json', JSON.stringify(ads, null, 2), '~~~',
  ].join('\n');
  // Timestamp не должен сам по себе вызывать повторную загрузку файла.
  const stable = JSON.stringify({ marketing: { ...marketing, generatedAt: '' },
    income: { ...income, generatedAt: '' }, direct: { ...ads, generatedAt: '' } });
  return { doc, hash: checksum(stable), lastSaleDate: income.lastSaleDate, directAt: ads.snapshotAt || null };
}

export async function syncDriveAnalytics(store, { force = false } = {}) {
  if (running) return { skipped: 'busy' };
  if (!navigator.onLine) throw Error('Нет сети — Google Диск не обновлён.');
  if (!validStore(store)) throw Error('Подожди, пока Мастерская получит все данные из Firebase.');
  if (!drive.hasFreshToken()) throw new drive.NeedAuth('Вход Google истёк. Нажми кнопку обновления файла в Мастерской.');
  running = true;
  try {
    const now = new Date().toISOString(), data = store.data, uid = store.user.uid;
    const report = reportOf(data, now);
    const mark = readMark(uid), elapsed = Date.now() - (mark?.at || 0);
    if (!force && mark?.hash === report.hash && elapsed < 6 * 3600000) return { skipped: 'unchanged' };
    if (!force && mark && elapsed < LIMIT_MS) return { skipped: 'throttled' };
    const saved = await drive.upsertMarkdown(AI_DRIVE_FILENAME, report.doc, data.settings.aiDriveFileId || '');
    if (!saved?.id) throw Error('Google Диск не подтвердил сохранение файла.');
    saveMark(uid, { hash: report.hash, at: Date.now() });
    await store.saveSettings({ aiDriveEnabled: true, aiDriveAt: now, aiDriveFileId: saved.id });
    return { ok: true, id: saved.id, at: now, lastSaleDate: report.lastSaleDate, directAt: report.directAt };
  } finally { running = false; }
}

export function startDriveMirror(store) {
  let timer = null;
  function schedule(ms = 20000) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = null;
      if (!store.data.settings?.aiDriveEnabled || !driveMirrorAvailable(store) || running) return;
      try { await syncDriveAnalytics(store); }
      catch (e) { console.warn('Google Drive аналитика:', e?.message || e); }
    }, ms);
  }
  store.subscribe(() => schedule());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(2000);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') schedule();
  }, POLL_MS);
}
