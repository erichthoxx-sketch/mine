// Автосинхронизация ТОЛЬКО аналитических снимков с личным read-only MCP.
// Работает, когда открыто хотя бы одно приложение и владелица уже явно передала контекст.
// Рукописи, ключи и настройки сюда не попадают; никаких скрытых фоновых задач.
import { marketingSnapshot, incomeSnapshot, directSnapshot } from '../writer/js/ai-system.js';

const DELAY = 12000;
const MIN_GAP = 5 * 60000;
const RETRY = 5 * 60000;
const fnv = (value) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16) + ':' + value.length;
};
const getMark = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const setMark = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* cookies/storage disabled */ }
};
const validWorker = (raw) => {
  try { const u = new URL(String(raw || '').trim()); return u.protocol === 'https:' ? u.origin : ''; }
  catch { return ''; }
};

export function startAiAutoSync(store, sections = ['income']) {
  const wanted = new Set(sections);
  let timer = null, busy = false;
  async function run() {
    if (busy || !navigator.onLine || store.mode !== 'firebase' || !store.user?.uid || !store.auth?.currentUser) return;
    const s = store.data.settings || {}, base = validWorker(s.bookAiWorker);
    if (!base || !s.aiConsentAt || !s.aiLastSyncedAt) return; // «Отключить всё» прекращает передачу
    const cases = [];
    const complete = (...names) => names.every((name) => store.loaded?.[name] && Array.isArray(store.data[name]));
    if (wanted.has('marketing') && complete('w_books', 'w_ideas', 'w_contests', 'w_reviews', 'w_promolinks', 'w_blog')) {
      cases.push(['marketing', marketingSnapshot(store.data, '')]);
    }
    if (wanted.has('income') && complete('sales', 'books', 'campaigns', 'reports')) {
      cases.push(['income', incomeSnapshot(store.data, '')]);
    }
    if (wanted.has('direct') && complete('d_snap')) {
      const docs = Object.fromEntries(store.data.d_snap.map((x) => [x.id, x]));
      if (docs.main || docs.stats) cases.push(['direct', directSnapshot(docs, '', s.direct?.metrika?.goals)]);
    }
    if (!cases.length) return;
    busy = true;
    try {
      for (const [section, snapshot] of cases) {
        if (!navigator.onLine || !store.auth.currentUser) break;
        const key = 'ai.sections:' + store.user.uid + ':' + section;
        const contentKey = fnv(JSON.stringify(snapshot));
        const last = getMark(key);
        const elapsed = Date.now() - (last?.at || 0);
        if (last?.hash === contentKey && elapsed < 12 * 3600000) continue;
        if (last && elapsed < MIN_GAP) { schedule(MIN_GAP - elapsed + 1000); continue; }
        try {
          // Время указывается при отправке, поэтому контроль изменений не зависит от timestamp.
          snapshot.generatedAt = new Date().toISOString();
          const token = await store.auth.currentUser.getIdToken();
          const res = await fetch(base + '/sync/section/' + section, {
            method: 'PUT',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot)
          });
          const answer = await res.json().catch(() => ({}));
          if (!res.ok || answer.ok !== true) throw Error(answer.error || 'HTTP ' + res.status);
          setMark(key, { hash: contentKey, at: Date.now() });
        } catch (e) {
          console.warn('Автосинхронизация AI (' + section + '):', e?.message || e);
          schedule(RETRY);
        }
      }
    } finally { busy = false; }
  }
  function schedule(ms = DELAY) {
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; run().catch((e) => console.warn('AI sync:', e)); }, ms);
  }
  store.subscribe(() => schedule());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(2000);
  });
  // На случай истёкшего токена/временной ошибки — только пока приложение открыто.
  const retryInterval = setInterval(() => {
    if (document.visibilityState === 'visible') schedule();
  }, 15 * 60000);
  return () => { clearTimeout(timer); clearInterval(retryInterval); };
}
