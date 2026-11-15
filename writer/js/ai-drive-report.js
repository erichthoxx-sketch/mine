// Приватный аналитический снимок для ChatGPT: Google Drive, без текстов рукописей.
// Google OAuth в браузере живёт ограниченное время: автообновление не открывает окна входа.
import * as drive from './drive.js';
import { marketingSnapshot, incomeSnapshot, directSnapshot } from './ai-system.js';
import { campaignBookEconomics } from '../../direct/js/bookeconomics.js';
import { outageSet } from '../../js/calc.js';

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
  // Компактный аналитический файл читается в ChatGPT надёжнее огромного архива.
  // Подробные строки — за последние 120 дней; месячные итоги остаются за весь период.
  const cutoff = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const fullMarketing = marketingSnapshot(data, now);
  const marketing = { ...fullMarketing,
    ideas: (fullMarketing.ideas || []).map((x) => ({ bookId: x.bookId, title: x.title, status: x.status, tags: x.tags })),
    blogs: (fullMarketing.blogs || []).map((x) => ({ bookId: x.bookId, title: x.title, status: x.status, modifiedAt: x.modifiedAt })),
    reviews: (fullMarketing.reviews || []).slice(0, 40),
  };
  const fullIncome = incomeSnapshot(data, now);
  const income = { ...fullIncome, detailFrom: cutoff,
    sales: (fullIncome.sales || []).filter((x) => x.date >= cutoff),
    reports: (fullIncome.reports || []).filter((x) => (x.date || x.end || x.start || '') >= cutoff),
  };
  const direct = Object.fromEntries((data.d_snap || []).map((d) => [d.id, d]));
  const fullAds = (direct.main || direct.stats)
    ? directSnapshot(direct, now, data.settings?.direct?.metrika?.goals)
    : { section: 'direct', generatedAt: now, note: 'Директ не выгружен. Нельзя делать выводы по рекламным расходам.', campaigns: [], daily: [] };
  const reportDate = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10); // отчётная дата по Москве
  const linkedBooks = (direct.main || direct.stats) ? campaignBookEconomics({
    campaigns: direct.main?.campaigns || [], ads: direct.main?.ads || [],
    books: data.w_books || [], sales: data.sales || [], daily: direct.stats?.daily || [],
    conv: direct.stats?.conv || [], stats: direct.stats || {}, cohorts: direct.cohorts || null,
    metrika: data.settings?.direct?.metrika || {}, today: reportDate,
    outageDays: outageSet(data.days || []), cohortError: data.settings?.direct?.cohortsErr || ''
  }) : [];
  const ads = { ...fullAds, detailFrom: cutoff,
    bookCampaignEconomics: linkedBooks,
    daily: (fullAds.daily || []).filter((x) => x.date >= cutoff),
    adDaily: (fullAds.adDaily || []).filter((x) => x.date >= cutoff),
    keywords: (fullAds.keywords || []).slice(0, 100),
    queries: (fullAds.queries || []).slice(0, 100),
  };
  // Имя документа намеренно не зависит от даты: один файл обновляется, а не создаются дубликаты.
  const doc = [
    '# Лана Фрейтаг — аналитический контекст для ChatGPT',
    '',
    'Сформировано: ' + now,
    'Источник: Firebase Firestore (Мастерская, Доходы, сохранённый снимок Яндекс.Директа).',
    'Важно: это снимок, а НЕ живое подключение к Яндексу или Литнету.',
    'Детальные строки ограничены последними 120 днями; помесячные итоги сохранены за весь доступный период.',
    'Продажи актуальны не позднее lastSaleDate. Директ актуален не позднее direct.snapshotAt.',
    'Рекламные расходы, продажи, посещения и конверсии имеют разные источники и могут расходиться.',
    'bookCampaignEconomics: только связанные расходы, роялти книги со ВСЕХ каналов и когорты покупок ЛЮБОЙ книги. attributedBookROI=null означает, что прибыль от рекламы конкретной книги по имеющимся данным не доказана.',
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
