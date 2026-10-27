// Где лежит содержимое сайта: в Firebase (site/main — тексты и книги, site_img/{id} — картинки),
// читать может любой посетитель, менять — только владелица (firestore.rules).
// На localhost — пробный режим: всё в этом браузере.
import { firebaseConfig } from '../js/firebase-config.js';

export const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const LS = 'lanaSite.v1';
const BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

export function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LS) || 'null') || { content: null, imgs: {} }; } catch { return { content: null, imgs: {} }; }
}

// Для посетителей — без библиотек Firebase, обычными запросами
export async function loadPublic() {
  if (LOCAL) return loadLocal();
  const r = await fetch(`${BASE}/site/main?key=${firebaseConfig.apiKey}`);
  if (r.status === 404) return { content: null, imgs: {} };
  if (!r.ok) throw new Error('site ' + r.status);
  const doc = await r.json();
  const content = JSON.parse(doc.fields?.json?.stringValue || 'null');
  const imgs = {};
  let token = '';
  do {
    const q = await fetch(`${BASE}/site_img?pageSize=100&key=${firebaseConfig.apiKey}${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
    if (!q.ok) break;
    const j = await q.json();
    for (const d of j.documents || []) imgs[d.name.split('/').pop()] = d.fields?.data?.stringValue || '';
    token = j.nextPageToken || '';
  } while (token);
  return { content, imgs };
}
