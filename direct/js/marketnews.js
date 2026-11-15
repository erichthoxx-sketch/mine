// При открытом приложении — один запрос в день к публичным лентам.
// Это НЕ круглосуточный мониторинг. Источник мог запретить выгрузку: ошибка видна пользователю.
import { MARKET_INTEL_FEEDS, parsePublicFeed, distinctNews } from './marketintel.js';
export const intelState = { busy: false, error: '', lastAttempt: '' };
export const intelSnap = (app) => (app.ctx().data.d_snap || []).find((x) => x.id === 'marketintel') || null;
const READER = 'https://r.jina.ai/';
const waitForFeed = async (url, timeoutMs = 25000) => {
  const ctrl = new AbortController(), deadline = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(READER + url, { signal: ctrl.signal, headers: { Accept: 'text/plain' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    if (text.length > 800000) throw new Error('Ответ слишком большой');
    return text;
  } finally { clearTimeout(deadline); }
};
export async function scanMarketIntel(app) {
  if (intelState.busy) return null;
  intelState.busy = true; intelState.error = '';
  const old = intelSnap(app), now = new Date().toISOString();
  try {
    const results = await Promise.all(MARKET_INTEL_FEEDS.map(async (feed) => {
      try {
        const raw = await waitForFeed(feed.url);
        const items = parsePublicFeed(raw, feed);
        if (!items.length) throw new Error('Не удалось прочитать заголовки');
        return { feed, items, status: { id: feed.id, name: feed.name, ok: true, count: items.length, checkedAt: now } };
      } catch (e) {
        return { feed, items: [], status: { id: feed.id, name: feed.name, ok: false, count: 0,
          checkedAt: now, error: (e.name === 'AbortError' ? 'нет ответа' : e.message || 'источник недоступен').slice(0, 160) } };
      }
    }));
    const fresh = results.flatMap((x) => x.items), statuses = results.map((x) => x.status);
    const items = distinctNews([...fresh, ...(old?.items || [])], 60);
    const updated = { id: 'marketintel', at: fresh.length ? now : old?.at || null,
      attemptedAt: now, items, statuses, note: 'RSS/публичные ссылки; темы и даты частично отсутствуют; не статистика Amazon, не API Reddit.' };
    intelState.lastAttempt = now;
    intelState.error = statuses.filter((x) => !x.ok).map((x) => x.name + ': ' + x.error).join(' · ');
    if (app.store.mode === 'firebase' && app.store.user) await app.store.put('d_snap', updated);
    return { updated: fresh.length, sources: statuses.filter((x) => x.ok).length, errors: statuses.filter((x) => !x.ok).length };
  } finally { intelState.busy = false; }
}
let autoArmed = false;
export function autoMarketIntel(app) {
  if (autoArmed || typeof window === 'undefined' || /^(localhost|127\.)/.test(location.hostname) ||
      app.store.mode !== 'firebase' || !app.store.user || !navigator.onLine) return;
  const today = new Date().toISOString().slice(0, 10), last = intelSnap(app)?.attemptedAt || '';
  if (last.slice(0, 10) === today) return;
  autoArmed = true;
  setTimeout(() => scanMarketIntel(app).then(() => app.rerender?.()).catch((e) => console.warn('Мировой рынок:', e)), 20000);
}
